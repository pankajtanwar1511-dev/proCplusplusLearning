## TOPIC: std::mdspan - Multidimensional Array Views

### INTERVIEW_QA: std::mdspan Deep Dive

#### Q1: What problem does `std::mdspan` solve, and what paper introduced it?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** `std::mdspan` (P0009, C++23) solves the problem of accessing multidimensional data (images, matrices, tensors, point clouds) stored in a flat, contiguous buffer without hand-writing index arithmetic at every call site.

**Pre-C++23 pain:**
```cpp
float get_pixel(const std::vector<float>& pixels, int width, int row, int col) {
    return pixels[row * width + col];   // duplicated everywhere, easy to get backwards
}
```

**C++23:**
```cpp
std::mdspan grid(pixels.data(), height, width);
grid[row, col];   // self-documenting, layout-aware, non-owning
```

`mdspan` is the N-dimensional generalization of `std::span` (C++20's 1-D non-owning view).

**Key Concept:** #mdspan #p0009 #views #multidimensional

</details>

---

#### Q2: Does `std::mdspan` own or copy the memory it views?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** **No** — `mdspan` is strictly non-owning, exactly like `std::span` and `std::string_view`.

It stores only:
1. A pointer (or pointer-like handle) to externally-owned data
2. An `extents` object describing the shape
3. Layout-specific mapping state (e.g. strides, for `layout_stride`)

```cpp
std::vector<float> buffer(12);      // OWNS the memory
std::mdspan grid(buffer.data(), 3, 4);  // just a VIEW over it
```

Because it never allocates, constructing or passing an `mdspan` by value is cheap — typically just a pointer plus a few small integers.

**Consequence:** the buffer's owner must outlive every `mdspan` view over it; `mdspan` provides no runtime lifetime tracking.

**Key Concept:** #mdspan #non_owning #lifetime

</details>

---

#### Q3: What core-language change (separate from mdspan itself) made `grid[i, j]` legal syntax?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** **P2128**, the C++23 change allowing `operator[]` to take more than one argument.

**Before C++23:** `operator[]` was restricted by the grammar to exactly one parameter. Writing `m[1, 2]` on a type without a multi-argument `operator[]` compiled anyway — but via the built-in **comma operator**: evaluate `1`, discard it, then call `m[2]`. A silent, dangerous trap.

```cpp
struct Matrix2017 {
    float& operator[](int index);   // only ONE parameter allowed pre-C++23
};
```

**C++23 (P2128):** `operator[]` may take any number of parameters:
```cpp
struct Matrix2023 {
    float& operator[](int i, int j) { return data[i * cols + j]; }
};
m[1, 2];   // genuine two-argument subscript call now
```

As a defensive companion change, C++23 also deprecates the comma operator inside subscript expressions, closing off the old silent-fallback trap.

**Key Concept:** #p2128 #operator_overloading #core_language

</details>

---

#### Q4: What is `std::extents`, and what's the difference between a static and a dynamic extent?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** `std::extents<IndexType, Extents...>` describes the *shape* (rank and per-dimension size) of an `mdspan`, independent of the data.

**Static extent** — the size is a template argument, known at compile time:
```cpp
std::extents<size_t, 3, 4>   // both dimensions fixed at compile time
```

**Dynamic extent** — the size is a runtime value, represented by the sentinel `std::dynamic_extent`:
```cpp
std::extents<size_t, std::dynamic_extent, std::dynamic_extent>
// convenience alias: std::dextents<size_t, 2>
```

**Mixed** shapes are allowed too:
```cpp
std::extents<size_t, std::dynamic_extent, 4>   // rows dynamic, 4 columns fixed
```

Static extents let the compiler unroll loops, vectorize, and constant-fold offset arithmetic for that dimension; dynamic extents are flexible but computed at runtime.

**Key Concept:** #extents #static_vs_dynamic #dynamic_extent

</details>

---

#### Q5: What do `rank()`, `rank_dynamic()`, and `extent(i)` each return?

<details>
<summary><b>Show Answer</b></summary>

**Answer:**

```cpp
std::extents<size_t, std::dynamic_extent, 4> e(10);   // 10 rows, 4 columns

e.rank();           // 2  — number of dimensions (compile-time constant)
e.rank_dynamic();   // 1  — how many dimensions are dynamic
e.extent(0);         // 10 — runtime size of dimension 0
e.extent(1);         // 4  — runtime size of dimension 1
e.static_extent(1);   // 4  — compile-time size of dim 1 (or dynamic_extent if not static)
```

A common mistake in generic code is confusing `rank()` (dimension count) with `size()` (total element count across all dimensions) — `rank()` on a 3x4 `mdspan` returns `2`, not `12`.

**Key Concept:** #rank #extent #generic_code

</details>

---

#### Q6: What are the four template parameters of `std::mdspan`?

<details>
<summary><b>Show Answer</b></summary>

**Answer:**

```cpp
template<
    class ElementType,
    class Extents,
    class LayoutPolicy   = std::layout_right,
    class AccessorPolicy = std::default_accessor<ElementType>
>
class mdspan;
```

| Parameter | Role |
|---|---|
| `ElementType` | the type being viewed (`float`, `unsigned char`, ...) |
| `Extents` | an `extents<...>` specialization describing the shape |
| `LayoutPolicy` | how an `(i, j, ...)` index maps to a linear offset |
| `AccessorPolicy` | how that offset becomes an actual element reference |

Both `LayoutPolicy` and `AccessorPolicy` default to the common case (`layout_right`, `default_accessor`), so most everyday code only needs to specify `ElementType` and `Extents`.

**Key Concept:** #mdspan #template_parameters #layout_policy #accessor_policy

</details>

---

#### Q7: Compare `layout_right` and `layout_left` — what do they mean and when should each be used?

<details>
<summary><b>Show Answer</b></summary>

**Answer:**

| Layout | Offset formula (2D) | Convention | Use when |
|---|---|---|---|
| `layout_right` (default) | `i * extent(1) + j` | Row-major / "C order" | C arrays, images, most native C++ code |
| `layout_left` | `i + j * extent(0)` | Column-major / "Fortran order" | BLAS, LAPACK, Fortran, MATLAB-style buffers |

```cpp
std::mdspan<float, std::dextents<size_t, 2>, std::layout_right> m(data, 3, 4);
// m[i, j] → offset = i * 4 + j

std::mdspan<float, std::dextents<size_t, 2>, std::layout_left> m2(data, 3, 4);
// m2[i, j] → offset = i + j * 3
```

Picking the wrong layout for externally-produced data (e.g. wrapping a BLAS buffer with the default `layout_right`) compiles and runs — it just silently transposes the logical matrix, since both layouts are equally "valid" offset formulas over the same flat memory.

**Key Concept:** #layout_right #layout_left #row_major #column_major

</details>

---

#### Q8: What is `layout_stride`, and when is it needed instead of `layout_left`/`layout_right`?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** `layout_stride` is the general-purpose layout policy for data that isn't tightly packed — its strides are supplied explicitly, at runtime, rather than derived automatically from the extents.

**Typical use case — a sub-view ("slice") of a larger matrix:**
```cpp
// A 4x4 sub-block taken from within a larger 10-column matrix:
// consecutive elements in a row are 1 apart, but consecutive ROWS are 10 apart
std::array<size_t, 2> strides{10, 1};
std::layout_stride::mapping<std::dextents<size_t, 2>> mapping(
    std::dextents<size_t, 2>{4, 4}, strides);

std::mdspan<float, std::dextents<size_t, 2>, std::layout_stride> sub(data, mapping);
```

`layout_left` and `layout_right` are conceptually special cases of `layout_stride` with strides computed automatically from tightly-packed extents — they're kept as distinct types purely so the compiler can generate tighter code when the layout is known in advance to be contiguous.

**Key Concept:** #layout_stride #sub_views #strides

</details>

---

#### Q9: What does `AccessorPolicy` do, and what does C++23 ship by default?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** `AccessorPolicy` is the customization point for what happens *after* the layout policy computes a linear offset — specifically, how that offset is turned into an actual element reference.

```cpp
template<class ElementType>
struct default_accessor {
    using reference = ElementType&;
    reference access(ElementType* p, size_t offset) const {
        return p[offset];   // the "obvious" implementation
    }
};
```

C++23 ships only `std::default_accessor<ElementType>`, which every `mdspan` uses unless told otherwise, and which does exactly `p[offset]`. It exists as a swappable template parameter (rather than hard-coded pointer indexing) so future libraries can plug in specialized access — e.g. an accessor returning a proxy object for atomic access, bit-packed elements, or scaled/quantized storage.

**Key Concept:** #accessor_policy #default_accessor #extension_point

</details>

---

#### Q10: Is `mdspan::operator[]` bounds-checked?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** **No.** Like `std::span` and raw arrays, `mdspan::operator[]` performs no bounds checking at all.

```cpp
std::mdspan<float, std::dextents<size_t, 2>> grid(data, 3, 4);

grid[2, 3];    // valid: last row, last column
grid[5, 10];   // UB — no exception, no guaranteed crash
```

If checked access is required (e.g. processing data at a trust boundary), the caller must manually validate `i < grid.extent(0)` and `j < grid.extent(1)` before indexing. This is a deliberate design choice: `mdspan` is meant to be a true zero-overhead abstraction, following `std::span`'s philosophy rather than `std::vector::at()`'s.

**Key Concept:** #bounds_checking #undefined_behavior #zero_overhead

</details>

---

#### Q11: Give three real-world use cases where `mdspan` is a natural fit.

<details>
<summary><b>Show Answer</b></summary>

**Answer:**

**1. Image processing** — a flat pixel buffer viewed as `(row, col, channel)`:
```cpp
std::mdspan pixels(data.data(), height, width, channels);
```

**2. Scientific computing / tensors** — numerical code (physics simulations, ML inference kernels, finite-element solvers) that previously juggled raw pointers and manually-tracked dimension counts can express an N-D tensor as a single `mdspan` type, matching whatever layout the producing library used.

**3. Interfacing with C APIs and GPU buffers** — C APIs, CUDA/compute buffers, and camera/LiDAR SDKs commonly hand back exactly a raw pointer plus separately-tracked dimensions:
```cpp
extern "C" float* get_lidar_grid(int* out_rows, int* out_cols);
int rows, cols;
float* raw = get_lidar_grid(&rows, &cols);
std::mdspan grid(raw, rows, cols);   // wrap immediately, no copy, no new owning type
```

**Key Concept:** #use_cases #image_processing #tensors #c_interop

</details>

---

#### Q12: How does `mdspan` compare to `std::vector<std::vector<T>>` for representing a 2D grid?

<details>
<summary><b>Show Answer</b></summary>

**Answer:**

| Approach | Memory layout | Cache locality | Ergonomics | Ownership |
|---|---|---|---|---|
| `vector<vector<T>>` | Rows are separate heap allocations | Poor — each row is a cache-unfriendly indirection | `grid[i][j]`, but "safe-looking" is misleading | Owning, wastes per-row overhead |
| Flat buffer + manual math | One contiguous allocation | Excellent | Poor — formula duplicated everywhere | Owning or raw pointer |
| `mdspan` over a flat buffer | Same contiguous allocation (mdspan changes nothing about storage) | Excellent | Excellent — `grid[i, j]`, self-documenting | **Non-owning** — a pure view |

The key insight: `mdspan` doesn't compete with `vector<vector<T>>` on storage — it competes with *manual index arithmetic* on ergonomics, while preserving the cache-friendly contiguous storage that `vector<vector<T>>` gives up.

**Key Concept:** #mdspan_vs_vector_of_vector #cache_locality #comparison

</details>

---

#### Q13: Is `std::submdspan` (slicing an existing mdspan) part of C++23?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** **No.** C++23 ships `mdspan`, `extents`, `layout_left`/`layout_right`/`layout_stride`, and `default_accessor` — the *viewing* machinery only.

`std::submdspan` — producing a lower-rank or reduced-extent sub-view from an existing `mdspan` — is a separate proposal, **P2630**, targeting a later standard revision (C++26). Code should not assume `submdspan` is available just because `<mdspan>` itself is available.

**Practical consequence:** in C++23, "slicing" a sub-region of an `mdspan` manually requires constructing a new `mdspan` with an offset pointer and a `layout_stride::mapping` describing the sub-region — the pattern shown for `layout_stride` sub-views elsewhere in this topic.

**Key Concept:** #submdspan #p2630 #cpp26 #scope

</details>

---

#### Q14: Why must the caller compute the required buffer size manually before constructing an `mdspan`?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Because `mdspan` never allocates memory — it only *views* a buffer the caller already owns. There is no constructor that "makes sure the buffer is big enough"; the caller is entirely responsible for allocating at least as many elements as the shape requires.

```cpp
size_t rows = 100, cols = 50;

// WRONG: buffer sized for 2D, but a 3D view constructed over it
std::vector<float> buffer(rows * cols);
std::mdspan<float, std::dextents<size_t, 3>> broken(buffer.data(), rows, cols, 3);
// real requirement is rows * cols * 3 — buffer is 3x too small

// CORRECT: derive the allocation size from the SAME extents used for the view
std::dextents<size_t, 3> shape(rows, cols, 3);
std::vector<float> ok(shape.extent(0) * shape.extent(1) * shape.extent(2));
std::mdspan<float, std::dextents<size_t, 3>> view(ok.data(), shape);
```

**Key Concept:** #buffer_sizing #required_span_size #non_owning

</details>

---
