## TOPIC: std::mdspan - Multidimensional Array Views

### THEORY_SECTION: Non-Owning Views Over Multidimensional Data

C++23 introduces `std::mdspan` (P0009), a lightweight, non-owning view that lets you treat a flat, contiguous (or strided) block of memory as an N-dimensional array — without copying data and without hand-rolled index arithmetic. It is the natural generalization of `std::span` (C++20's 1-D non-owning view) to multiple dimensions, and it is paired with a core-language change, the variadic multidimensional subscript operator (P2128), that makes `m[i, j, k]` valid C++ for the first time.

---

#### 1. The Problem: Manual Index Arithmetic Over Flat Buffers

**Why "flat buffers" exist in the first place:**

Most high-performance multidimensional data — images, matrices, 3D tensors, LiDAR point-cloud grids, GPU buffers — is *not* stored as arrays-of-arrays. It is stored as one contiguous allocation, because contiguous memory is cache-friendly, DMA-friendly, and matches what C APIs, GPU drivers, and numerical libraries (BLAS, LAPACK, image codecs) actually hand you: a raw pointer plus a set of dimensions.

```cpp
// Pre-C++23: a 2D grid stored as a flat buffer
std::vector<float> pixels(width * height);

// Manual row-major index arithmetic, EVERYWHERE this data is touched:
float get_pixel(const std::vector<float>& pixels, int width, int row, int col) {
    return pixels[row * width + col];   // Easy to get row/col backwards!
}

void set_pixel(std::vector<float>& pixels, int width, int row, int col, float v) {
    pixels[row * width + col] = v;      // Duplicated formula, duplicated bugs
}
```

**What goes wrong in practice:**

| Problem | Consequence |
|---|---|
| Index formula duplicated at every call site | One typo (`col * width + row`) silently transposes the image |
| No type-level distinction between "flat buffer" and "2D grid" | Function signatures can't express intent; any `vector<float>` + two ints "looks like" a grid |
| Row-major vs column-major is implicit | Porting code between C (row-major) and Fortran/BLAS (column-major) libraries is a constant source of bugs |
| No non-owning way to expose a sub-view | Passing "a grid" into a function usually means passing a whole owning container, or a pointer + several loose int parameters |

**The C++23 solution:**

```cpp
#include <mdspan>
#include <vector>

std::vector<float> pixels(width * height);

// A non-owning 2D VIEW over the same buffer — no copy, no ownership transfer
std::mdspan grid(pixels.data(), height, width);

float get_pixel(std::mdspan<float, std::dextents<size_t, 2>> grid, int row, int col) {
    return grid[row, col];              // Row-major indexing handled by the layout policy
}
```

The storage is still one flat `std::vector<float>` — `mdspan` does not allocate, copy, or own anything. It is purely a *view*: a pointer plus compile-time/runtime metadata describing how to map an `(i, j, ...)` index tuple to a linear offset into that pointer's memory.

---

#### 2. Core-Language Enabler: The Variadic Multidimensional `operator[]` (P2128)

Before C++23, `operator[]` was restricted by the language grammar to take **exactly one** argument. This is a core-language rule, unrelated to any particular class — it applied to `std::vector`, raw arrays, and any user-defined type alike.

```cpp
// Pre-C++23: operator[] takes exactly one parameter — this is a LANGUAGE rule
struct Matrix2017 {
    float& operator[](int index);          // ✅ Legal (single parameter)
    // float& operator[](int i, int j);    // ❌ ERROR pre-C++23: too many parameters
};

Matrix2017 m;
// m[1, 2];   // Pre-C++23: this is NOT a two-argument call!
//            // It's the COMMA OPERATOR: evaluates `1`, discards it, then calls m[2]
```

That last line is the historically dangerous part: `m[1, 2]` compiled *silently* under C++17/20, but meant "evaluate 1, throw it away, index with 2" via the built-in comma operator — a classic trap. Because of this, libraries that wanted multidimensional indexing pre-C++23 had to fall back to `operator()`:

```cpp
// Pre-C++23 workaround: overload operator() instead, since it IS variadic
struct Matrix2017 {
    float& operator()(int i, int j) { return data[i * cols + j]; }
};
m(1, 2);   // Works, but doesn't read like array indexing
```

**P2128 (adopted for C++23)** lifts the single-argument restriction: `operator[]` may now be declared with any number of parameters (including zero), and `m[1, 2]` becomes a genuine two-argument subscript call — *if* a matching `operator[]` exists. As a defensive consequence, C++23 also **deprecates** the built-in comma operator inside a subscript expression, so `m[1, 2]` no longer silently falls back to comma-operator semantics on types that don't overload multi-argument `[]`.

```cpp
// C++23: operator[] can take multiple parameters
struct Matrix2023 {
    float& operator[](int i, int j) { return data[i * cols + j]; }
    float& operator[](int i)        { return data[i]; }   // Overloads can coexist
};

Matrix2023 m;
m[1, 2];   // ✅ Genuine two-argument call to operator[](int, int)
m[5];      // ✅ Calls the one-argument overload
```

This is the enabling feature that makes `mdspan[i, j, k]` possible — `mdspan` itself is "just" a library type that happens to declare a variadic `operator[]` template.

---

#### 3. `std::extents` — Describing Dimensions at Compile Time, Run Time, or Both

`std::extents<IndexType, Extents...>` is a small value type that describes the *shape* (rank and per-dimension size) of an `mdspan`, independent of the data itself.

**The key idea — each dimension can be static (known at compile time) or dynamic (known only at run time):**

```cpp
#include <mdspan>

// All dimensions dynamic (decided at runtime) — use the dextents alias
using DynamicExtents2D = std::dextents<size_t, 2>;
// Equivalent to: std::extents<size_t, std::dynamic_extent, std::dynamic_extent>

// A fully STATIC 3x4 matrix shape — both dimensions known at compile time
using StaticExtents = std::extents<size_t, 3, 4>;

// A MIXED shape: first dimension dynamic, second fixed at compile time (4 columns)
using MixedExtents = std::extents<size_t, std::dynamic_extent, 4>;
```

`std::dynamic_extent` is a sentinel value (`static_cast<size_t>(-1)`) used as a template argument to say "this dimension's size is a runtime property, not a compile-time constant."

**Why mixing matters — compile-time dimensions unlock optimization:**

| Extent kind | Where the size lives | Optimizer benefit |
|---|---|---|
| Static (e.g. `4`) | Encoded in the type itself | Compiler can unroll loops, vectorize, and constant-fold offset arithmetic for that dimension |
| Dynamic (`std::dynamic_extent`) | Stored as a runtime member of the `extents` object | Flexible (size decided at runtime) but the compiler must compute it as a real value |

A common real-world pattern is "many small fixed-width rows, unknown row count": e.g. RGB pixel data has a compile-time-known channel count of 3, but image width/height are runtime values.

```cpp
// RGB image: 3 channels is ALWAYS 3, known at compile time.
// height and width are runtime values (loaded from a file header).
using ImageExtents = std::extents<size_t, std::dynamic_extent, std::dynamic_extent, 3>;

std::mdspan<unsigned char, ImageExtents> image(buffer, height, width);
// Note: only the DYNAMIC extents (height, width) are passed as constructor arguments;
// the static extent (3) is baked into the type and needs no runtime argument.
```

**Querying an `extents` object:**

```cpp
std::extents<size_t, std::dynamic_extent, 4> e(10);   // 10 rows, 4 columns

e.rank();              // 2                     — number of dimensions (compile-time)
e.rank_dynamic();       // 1                     — how many dimensions are dynamic
e.extent(0);            // 10                    — size of dimension 0 (runtime query)
e.extent(1);             // 4                     — size of dimension 1
e.static_extent(1);       // 4                     — compile-time size, or dynamic_extent if not static
```

---

#### 4. The `std::mdspan` Type Itself

The full type is:

```cpp
template<
    class ElementType,
    class Extents,
    class LayoutPolicy  = std::layout_right,
    class AccessorPolicy = std::default_accessor<ElementType>
>
class mdspan;
```

- `ElementType` — the element type being viewed (e.g. `float`, `unsigned char`).
- `Extents` — a `std::extents<...>` specialization describing the shape (Section 3).
- `LayoutPolicy` — **how** an `(i, j, ...)` index tuple maps to a linear offset (Section 5).
- `AccessorPolicy` — **how** an offset is turned into an actual element reference (Section 6).

Like `std::span`, **`mdspan` never allocates, copies, or owns memory.** It stores only:
1. A pointer (or pointer-like handle) to externally-owned data,
2. The `extents` (shape) object,
3. Layout-specific mapping state (e.g. strides, if using `layout_stride`).

```cpp
#include <mdspan>
#include <vector>

std::vector<double> buffer(6);   // Owns the actual memory

// A non-owning 2x3 view over that buffer — buffer must outlive matrix
std::mdspan matrix(buffer.data(), 2, 3);   // CTAD deduces dextents<size_t, 2>

matrix[0, 0] = 1.0;
matrix[0, 1] = 2.0;
matrix[1, 2] = 6.0;

matrix.extent(0);   // 2  (rows)
matrix.extent(1);   // 3  (columns)
matrix.size();       // 6  (total elements)
```

Because it's non-owning, passing an `mdspan` by value is cheap (it's typically just a pointer plus a few small integers) — just like passing a `std::span` or `std::string_view`.

---

#### 5. Layout Policies — How Indices Map to Offsets

The `LayoutPolicy` is the piece that answers: *given index `(i, j)`, what is the linear offset into the underlying buffer?* This is precisely the formula that used to be written out by hand at every call site (Section 1) — `mdspan` centralizes it into one policy type, chosen once.

**`std::layout_right` (default) — row-major / "C order":**

The *rightmost* index varies fastest — this matches how C/C++ multidimensional arrays and most image/tensor libraries lay out memory.

```
offset(i, j) = i * extent(1) + j
```

```cpp
std::mdspan<float, std::dextents<size_t, 2>, std::layout_right> m(data, 3, 4);
// m[i, j] reads offset = i * 4 + j   — same formula as the hand-written version in Section 1
```

**`std::layout_left` — column-major / "Fortran order":**

The *leftmost* index varies fastest — this matches Fortran, MATLAB, and BLAS/LAPACK conventions.

```
offset(i, j) = i + j * extent(0)
```

```cpp
std::mdspan<float, std::dextents<size_t, 2>, std::layout_left> m(data, 3, 4);
// m[i, j] reads offset = i + j * 3   — interoperates directly with BLAS-style buffers
```

**Why this distinction matters in practice:**

| Scenario | Correct layout | Why |
|---|---|---|
| C array `float arr[rows][cols]`, image row buffers | `layout_right` (default) | Rightmost (column) index is contiguous in memory |
| Calling into BLAS/LAPACK/Fortran numerical libraries | `layout_left` | Those libraries expect column-major storage |
| Wrapping a NumPy array without copying | Depends on the array's own `.flags` (C- vs F-contiguous) — pick the matching layout | Wrong choice silently transposes the data |

**`std::layout_stride` — arbitrary, runtime-specified strides:**

Used when the data isn't tightly packed — e.g. a sub-view into a larger matrix (a "slice" with gaps between rows), or memory padded for SIMD alignment.

```cpp
#include <mdspan>

// A 4x4 sub-block taken from within a larger 10-column matrix:
// consecutive elements in a row are 1 apart, but consecutive ROWS are 10 apart
// (not 4 — because each row of the big matrix is 10 elements wide).
std::array<size_t, 2> strides{10, 1};
std::layout_stride::mapping<std::dextents<size_t, 2>> mapping(
    std::dextents<size_t, 2>{4, 4}, strides);

std::mdspan<float, std::dextents<size_t, 2>, std::layout_stride> sub_view(data, mapping);
```

`layout_stride` is the general case; `layout_left` and `layout_right` are special cases of it with strides derived automatically from the extents, kept as separate types purely so the compiler can generate tighter code when the layout is known to be tightly packed.

---

#### 6. Accessor Policies — How an Offset Becomes a Reference

The final template parameter, `AccessorPolicy`, is the customization point for what happens *after* the layout policy has computed a linear offset: how is that offset turned into an actual element access?

```cpp
template<class ElementType>
struct default_accessor {
    using reference = ElementType&;
    reference access(ElementType* p, size_t offset) const {
        return p[offset];   // The "obvious" implementation: plain pointer indexing
    }
};
```

`std::default_accessor<ElementType>` is what every `mdspan` uses unless told otherwise, and it does exactly what you'd expect: `p[offset]`. The policy exists as a separate, swappable template parameter (rather than being hard-coded) so that libraries can later plug in specialized element access without changing the layout or extents machinery — for example, an accessor that returns a proxy object instead of a plain reference (useful for atomic access, bit-packed elements, or scaled/quantized storage where the "logical" element type differs from the physical storage type). C++23 ships only `default_accessor`; it is the extension point other libraries and future standard revisions build on, not a feature with many built-in alternatives yet.

---

#### 7. Practical Use Cases

**Image processing — a 2D view over a flat pixel buffer:**

```cpp
#include <mdspan>
#include <vector>

struct Image {
    std::vector<unsigned char> data;   // Owns the memory: height * width * channels bytes
    size_t height, width, channels;

    auto view() {
        // Non-owning 3D view: (row, col, channel)
        return std::mdspan(data.data(), height, width, channels);
    }
};

void to_grayscale(Image& img) {
    auto pixels = img.view();
    for (size_t y = 0; y < pixels.extent(0); ++y)
        for (size_t x = 0; x < pixels.extent(1); ++x) {
            auto r = pixels[y, x, 0], g = pixels[y, x, 1], b = pixels[y, x, 2];
            auto gray = static_cast<unsigned char>(0.299*r + 0.587*g + 0.114*b);
            pixels[y, x, 0] = pixels[y, x, 1] = pixels[y, x, 2] = gray;
        }
}
```

**Scientific computing / tensors:** numerical code that previously juggled raw pointers and manually-tracked dimension counts (common in physics simulations, machine learning inference kernels, and finite-element solvers) can express an N-dimensional tensor as a single `mdspan` type, with the layout policy chosen to match whatever numerical library produced the buffer.

**Interfacing with C APIs and GPU buffers:** C APIs and GPU interop layers (CUDA, compute buffers, camera/LiDAR SDKs in robotics and autonomous-vehicle stacks) hand you exactly the raw ingredients `mdspan` was designed to wrap — a pointer plus dimensions — with no way (and no need) to change the underlying API. `mdspan` lets the *consuming* C++ code regain safe, self-documenting multidimensional indexing without introducing a copy or an owning container:

```cpp
// A C API hands you a raw pointer + separately-tracked dimensions:
extern "C" float* get_lidar_grid(int* out_rows, int* out_cols);

int rows, cols;
float* raw = get_lidar_grid(&rows, &cols);

// Wrap it immediately — from here on, code reads like real 2D indexing
std::mdspan grid(raw, rows, cols);
float center = grid[rows / 2, cols / 2];
```

---

#### 8. Summary Comparison — Choosing a Multidimensional Representation

| Approach | Memory layout | Cache locality | Ergonomics | Ownership |
|---|---|---|---|---|
| `std::vector<std::vector<T>>` | Rows are **separate heap allocations**, not contiguous | Poor — each row is a separate cache-unfriendly indirection | Good (`grid[i][j]`) but misleadingly "safe-looking" | Owning, but wastes memory on per-row overhead |
| Flat buffer + manual index math | One contiguous allocation | Excellent | Poor — formula duplicated everywhere, easy to get wrong | Owning (`std::vector<T>`) or raw pointer |
| `std::mdspan` over a flat buffer | Same one contiguous allocation (mdspan changes nothing about storage) | Excellent — identical to the flat-buffer case | Excellent — `grid[i, j]`, self-documenting shape and layout | **Non-owning** — a pure view; the buffer's owner (a `vector`, `unique_ptr`, C API, etc.) must outlive it |

The core insight: `mdspan` does not compete with `vector<vector<T>>` on storage — it competes with *manual index arithmetic* on ergonomics, while keeping the cache-friendly contiguous storage that `vector<vector<T>>` gives up. It adds a zero-overhead, type-safe, self-documenting indexing layer on top of memory you already own and manage elsewhere.

**A note on scope:** C++23 ships `mdspan`, `extents`, `layout_left`/`layout_right`/`layout_stride`, and `default_accessor` — the *viewing* machinery described above. Slicing operations on an existing `mdspan` (producing a lower-rank or reduced-extent sub-view via `std::submdspan`, P2630) were not part of the original C++23 mdspan paper and are a separate, later addition targeting a subsequent standard revision; code relying on `submdspan` should not assume it is available wherever `<mdspan>` itself is available.

#### 9. Compile-Time vs Runtime Breakdown

`mdspan` is designed so the compiler resolves as much as possible before your program ever runs — the more of its "shape" you can express as static (compile-time) extents, the less work is left for runtime.

| Code / Mechanism | Phase | What Happens |
|---|---|---|
| `std::extents<int, 3, 3>` (static extents) | Compile time | Dimensions are baked directly into the *type*. The compiled `mdspan` object stores **0 bytes** for these dimensions — `extent(0)`/`extent(1)` become compile-time constants the optimizer can propagate. |
| `std::extents<int, std::dynamic_extent, std::dynamic_extent>` (dynamic extents) | Compile time (type) / Runtime (values) | The *type* is fixed at compile time, but the mdspan object now carries 2 real `size_t` members holding the actual row/col counts, set when the object is constructed. |
| `layout_right` / `layout_left` / `layout_stride` selection | Compile time | Which offset formula to use is a template parameter — resolved and specialized when the code is compiled, not looked up at runtime. |
| `layout_right::mapping::operator()(i, j)` (the actual `m[i, j]` call) | Runtime | The chosen formula — e.g. `offset = i * extent(1) + j` — is evaluated with the live `i`, `j` values every time you index; this is real arithmetic executed on real data at runtime. |
| The memory load/store at `data_handle()[offset]` | Runtime | A single pointer-offset dereference — no indirection beyond the one pointer `mdspan` already holds. |

The practical upshot: an `mdspan` with fully static extents and `layout_right` compiles down to essentially the same machine code as hand-written `pixels[row * width + col]` — the "safety and readability" are free, paid for entirely at compile time.

#### 10. Memory Model

`mdspan` itself is a small, non-owning **stack value** — typically just a pointer plus an `extents` object (which may be empty if fully static). It never allocates; it only *describes* memory someone else owns.

```
Stack (or wherever the mdspan lives):
┌─────────────────────────────────────┐
│  mdspan<float, extents<...>>         │
│  ┌─────────────┐  ┌────────────────┐ │
│  │ data_handle_ │  │ extents_ (0-16 │ │
│  │ (1 pointer)  │  │ bytes: 0 if    │ │
│  │              │  │ fully static)  │ │
│  └──────┬───────┘  └────────────────┘ │
└─────────┼─────────────────────────────┘
          │  points into memory it does NOT own
          ▼
┌───────────────────────────────────────────────┐
│ Contiguous buffer (heap, stack, mmap, GPU-pinned│
│ host memory, ...) — owned by a vector/array/    │
│ unique_ptr/C API elsewhere                      │
│ [ row0... ][ row1... ][ row2... ] ...           │
└───────────────────────────────────────────────┘
```

Contrast with `std::vector<std::vector<T>>`:

```
vector<vector<T>>  (owning, row-major "grid" via nested containers)
┌────────────┐
│ outer vec  │──▶ [ ptr0 | ptr1 | ptr2 | ... ]   (heap, contiguous — but only ROW POINTERS)
└────────────┘         │      │      │
                        ▼      ▼      ▼
                     [row0] [row1] [row2]   ◀── each row is its OWN separate heap allocation
```

Every `grid[i][j]` on the `vector<vector<T>>` version chases two pointers through unrelated heap allocations; `mdspan[i, j]` over a flat buffer touches one pointer and does one arithmetic offset into memory that is already contiguous.

**Why this matters for low latency:** `mdspan` gives you zero-overhead multidimensional indexing over memory you already own — a flat buffer, a memory-mapped file, a GPU-pinned host allocation — with no allocation, no reference counting, and an offset computation the compiler can often fold into vectorized (SIMD) address arithmetic. For tight numeric loops — image kernels, order-book grids, tensor math — that predictable, cache-friendly access pattern (one contiguous block, no pointer-chasing between rows) is exactly what keeps tail latency low; the "grid" abstraction costs nothing beyond what a hand-rolled `row * width + col` loop would already cost.

---

### EDGE_CASES: Non-Owning Views Come With Non-Owning Risks

#### Edge Case 1: mdspan Outliving Its Backing Buffer

`mdspan` never allocates or owns memory — it is purely a pointer-plus-shape view. If the object that owns the underlying storage is destroyed, reallocates, or goes out of scope, every `mdspan` still pointing at the old memory becomes a dangling view, and any access through it is undefined behavior.

```cpp
#include <mdspan>
#include <vector>

std::mdspan<float, std::dextents<size_t, 2>> dangerous_view() {
    std::vector<float> local(12);
    std::mdspan grid(local.data(), 3, 4);
    return grid;   // ❌ `local` is destroyed when the function returns!
                    // The returned mdspan's pointer is now dangling.
}

void reallocation_trap() {
    std::vector<float> data(10);
    std::mdspan grid(data.data(), 10);

    data.push_back(1.0f);   // May reallocate — data.data() can change!
    grid[0] = 5.0f;         // ❌ UB: grid may still point at the FREED old buffer
}
```

The fix is the same discipline `std::span` and `std::string_view` already require: an `mdspan`'s lifetime must never outlive (or survive a reallocation of) the storage it views. `mdspan` gives you zero warning about this at compile time — it is a deliberately zero-overhead type, so there is no runtime ownership tracking to catch the mistake.

---

#### Edge Case 2: Silent Transposition From a Layout Mismatch

Because `layout_right` (row-major) and `layout_left` (column-major) both compile and both produce "valid" element access, picking the wrong one does not error — it silently reads the wrong elements, effectively transposing the logical matrix.

```cpp
#include <mdspan>
#include <vector>

// A buffer that was actually produced by a Fortran/BLAS routine (column-major)
std::vector<double> blas_buffer = load_from_blas_call();

// ❌ WRONG: default layout_right assumes row-major
std::mdspan<double, std::dextents<size_t, 2>> wrong(blas_buffer.data(), 3, 4);
wrong[1, 2];   // Silently reads the WRONG element — no crash, no warning

// ✅ CORRECT: explicitly request layout_left to match BLAS's column-major storage
std::mdspan<double, std::dextents<size_t, 2>, std::layout_left> correct(
    blas_buffer.data(), 3, 4);
correct[1, 2];   // Reads the element BLAS actually intended
```

Because both layouts are just different offset formulas over the *same* flat buffer, this class of bug produces plausible-looking (but wrong) numbers rather than a crash — exactly the kind of silent-corruption bug that is expensive to track down in a numerical pipeline.

---

#### Edge Case 3: Dynamic vs. Static Extent Mismatches

A static extent is baked into the *type*, so passing the wrong value is a compile error. A dynamic extent is a runtime value, so passing the wrong count compiles fine and corrupts the shape silently.

```cpp
#include <mdspan>

// Fully static 3x4 shape
std::mdspan<float, std::extents<size_t, 3, 4>> fixed(ptr);
// std::mdspan<float, std::extents<size_t, 3, 4>> bad(ptr, 5, 6);
// ❌ COMPILE ERROR: static extents don't take runtime arguments at all

// Mixed shape: 3 channels fixed, height/width dynamic
using ImageExtents = std::extents<size_t, std::dynamic_extent, std::dynamic_extent, 3>;

std::mdspan<unsigned char, ImageExtents> img(buffer, actual_height, actual_width);
// If actual_height/actual_width are wrong (e.g. swapped, or read from a
// corrupt file header), this compiles and runs — but `img.extent(0)` and
// `img.extent(1)` silently disagree with the buffer's real layout, and
// `img.size()` no longer matches `buffer`'s true element count.
std::mdspan<unsigned char, ImageExtents> swapped(buffer, actual_width, actual_height);
// ❌ Compiles fine — but every [row, col, channel] access now reads the
// wrong offset if width != height.
```

The lesson: static extents convert a class of shape-mismatch bugs into compile errors "for free"; dynamic extents give up that safety net and shift the burden entirely onto whoever supplies the runtime dimensions correctly.

---

#### Edge Case 4: No Bounds Checking by Default

Like `std::span` and raw arrays, `mdspan::operator[]` performs **no bounds checking**. An out-of-range multi-index access is undefined behavior, not an exception — there is no `.at()`-style checked alternative in the base `mdspan` type itself.

```cpp
#include <mdspan>

std::mdspan<float, std::dextents<size_t, 2>> grid(data, 3, 4);

grid[2, 3];   // ✅ Valid: last row, last column
grid[5, 10];  // ❌ UB — no exception, no crash guarantee, just reads/writes
              //     out-of-bounds memory. Some builds may crash; others
              //     may silently corrupt unrelated memory.
```

If bounds-checked access is required (e.g. at a trust boundary processing external input), the caller must validate `i < grid.extent(0)` and `j < grid.extent(1)` manually before indexing — `mdspan` intentionally trades safety for being a true zero-overhead abstraction, matching the philosophy of `std::span` rather than `std::vector::at()`.

---

#### Edge Case 5: Overlapping or Inconsistent Custom Strides

`layout_stride` accepts *any* stride values you supply — including ones that make different logical indices alias the same memory location, or that don't actually match the real memory layout of the buffer being wrapped.

```cpp
#include <mdspan>
#include <array>

// Intended: a 4x4 view where consecutive rows are 10 elements apart
// (a sub-block of a wider 10-column matrix).
std::array<size_t, 2> correct_strides{10, 1};

// ❌ BUG: strides swapped — rows are now only 1 apart, columns 10 apart.
// This still constructs successfully; it just describes a completely
// different (and likely out-of-bounds) memory access pattern.
std::array<size_t, 2> wrong_strides{1, 10};

std::layout_stride::mapping<std::dextents<size_t, 2>> mapping(
    std::dextents<size_t, 2>{4, 4}, wrong_strides);
std::mdspan<float, std::dextents<size_t, 2>, std::layout_stride> broken(data, mapping);

broken[3, 3];   // Computes an offset far outside the intended 4x4 sub-block
```

Because `layout_stride` is the fully general case, the library cannot validate "do these strides make sense for this buffer" — that check is entirely the caller's responsibility.

---

#### Edge Case 6: Miscalculating Required Buffer Size Before Allocating

`mdspan` never allocates, so the caller must allocate a buffer of *at least* `extents.required_span_size()` elements before constructing a view over it. Getting that calculation wrong (e.g. forgetting a dimension, or assuming tight packing when using a strided layout) under-allocates the backing storage.

```cpp
#include <mdspan>
#include <vector>

size_t rows = 100, cols = 50;

// ❌ BUG: allocated for a 2D shape, but constructed a 3D view over it
std::vector<float> buffer(rows * cols);
std::mdspan<float, std::dextents<size_t, 3>> broken(buffer.data(), rows, cols, 3);
// required storage is actually rows * cols * 3 elements — the buffer is
// 3x too small, and any access into the third dimension reads/writes
// past the end of `buffer`.

// ✅ CORRECT: compute required size from the SAME extents used for the view
std::dextents<size_t, 3> shape(rows, cols, 3);
std::vector<float> correct_buffer(shape.extent(0) * shape.extent(1) * shape.extent(2));
std::mdspan<float, std::dextents<size_t, 3>> correct(correct_buffer.data(), shape);
```

---

#### Edge Case 7: Confusing Rank With Extent in Generic Code

`rank()` (a compile-time constant: *how many dimensions*) is easy to confuse with `extent(i)` (a possibly-runtime value: *how big dimension i is*) when writing dimension-agnostic template code — especially since both are queried through similarly-named member functions.

```cpp
#include <mdspan>

template<class T, class Extents>
size_t total_elements_wrong(std::mdspan<T, Extents> m) {
    // ❌ BUG: rank() is the number of DIMENSIONS (e.g. 2), not element count
    return m.rank();
}

template<class T, class Extents>
size_t total_elements_correct(std::mdspan<T, Extents> m) {
    // ✅ CORRECT: size() is the true total element count across all dimensions
    return m.size();
}

template<class T, class Extents>
void print_shape(std::mdspan<T, Extents> m) {
    for (size_t dim = 0; dim < m.rank(); ++dim)      // loop over DIMENSIONS
        std::cout << m.extent(dim) << " ";           // print size ALONG each dimension
}
```

---

### CODE_EXAMPLES: mdspan in Practice

#### Example 1: Wrapping a Flat Image Buffer for Row/Column Access

```cpp
#include <mdspan>
#include <vector>
#include <iostream>

int main() {
    constexpr size_t height = 4, width = 5;
    std::vector<float> pixels(height * width);

    std::mdspan grid(pixels.data(), height, width);   // CTAD: dextents<size_t, 2>

    for (size_t row = 0; row < grid.extent(0); ++row)
        for (size_t col = 0; col < grid.extent(1); ++col)
            grid[row, col] = static_cast<float>(row * 10 + col);

    std::cout << grid[2, 3] << '\n';   // Row 2, column 3
}
```

**Output:**
```
23
```

---

#### Example 2: 3D Voxel Grid With Mixed Static and Dynamic Extents

```cpp
#include <mdspan>
#include <vector>
#include <iostream>

// Voxel grid: X and Y resolution decided at runtime (loaded from a scan),
// but each voxel always stores exactly 4 fixed channels (occupancy, r, g, b).
using VoxelExtents = std::extents<size_t, std::dynamic_extent, std::dynamic_extent, 4>;

int main() {
    size_t scan_x = 8, scan_y = 6;
    std::vector<float> buffer(scan_x * scan_y * 4);

    std::mdspan<float, VoxelExtents> voxels(buffer.data(), scan_x, scan_y);

    voxels[3, 2, 0] = 1.0f;   // occupancy
    voxels[3, 2, 1] = 0.8f;   // r
    voxels[3, 2, 2] = 0.1f;   // g
    voxels[3, 2, 3] = 0.1f;   // b

    std::cout << "occupancy=" << voxels[3, 2, 0]
               << " rank=" << voxels.rank() << '\n';
}
```

**Output:**
```
occupancy=1 rank=3
```

---

#### Example 3: Same Buffer, Two Layouts — Full View vs. Strided Sub-View

```cpp
#include <mdspan>
#include <vector>
#include <array>
#include <iostream>

int main() {
    // A 10-column matrix; we want a 4x4 sub-block starting at row 2, col 3.
    constexpr size_t big_cols = 10;
    std::vector<float> data(6 * big_cols);
    for (size_t i = 0; i < data.size(); ++i) data[i] = static_cast<float>(i);

    std::mdspan<float, std::dextents<size_t, 2>> full(data.data(), 6, big_cols);

    // Sub-view: rows are still `big_cols` apart (not 4), columns are 1 apart.
    std::array<size_t, 2> strides{big_cols, 1};
    std::layout_stride::mapping<std::dextents<size_t, 2>> mapping(
        std::dextents<size_t, 2>{4, 4}, strides);

    float* sub_start = data.data() + (2 * big_cols) + 3;   // offset to (row 2, col 3)
    std::mdspan<float, std::dextents<size_t, 2>, std::layout_stride> sub(sub_start, mapping);

    std::cout << "full[2, 3] = " << full[2, 3] << '\n';
    std::cout << "sub[0, 0]  = " << sub[0, 0] << '\n';   // Same underlying element
}
```

**Output:**
```
full[2, 3] = 23
sub[0, 0]  = 23
```

---

#### Example 4: A Layout-Agnostic Generic Print Function

```cpp
#include <mdspan>
#include <iostream>

template<class T, class Extents, class Layout>
void print_matrix(std::mdspan<T, Extents, Layout> m) {
    for (size_t i = 0; i < m.extent(0); ++i) {
        for (size_t j = 0; j < m.extent(1); ++j)
            std::cout << m[i, j] << ' ';
        std::cout << '\n';
    }
}

int main() {
    float data[6] = {1, 2, 3, 4, 5, 6};

    std::mdspan<float, std::dextents<size_t, 2>, std::layout_right> row_major(data, 2, 3);
    std::mdspan<float, std::dextents<size_t, 2>, std::layout_left> col_major(data, 2, 3);

    print_matrix(row_major);   // Same buffer...
    std::cout << "---\n";
    print_matrix(col_major);   // ...interpreted with a different layout
}
```

**Output:**
```
1 2 3
4 5 6
---
1 3 5
2 4 6
```

---

#### Example 5: Converting `vector<vector<T>>` to a Flat Buffer + mdspan

```cpp
#include <mdspan>
#include <vector>
#include <iostream>

int main() {
    std::vector<std::vector<int>> nested = {{1, 2, 3}, {4, 5, 6}};

    // Flatten into one contiguous buffer, row by row
    std::vector<int> flat;
    flat.reserve(nested.size() * nested[0].size());
    for (auto& row : nested)
        flat.insert(flat.end(), row.begin(), row.end());

    std::mdspan grid(flat.data(), nested.size(), nested[0].size());

    std::cout << "nested[1][2]  = " << nested[1][2] << '\n';
    std::cout << "grid[1, 2]    = " << grid[1, 2] << '\n';
}
```

**Output:**
```
nested[1][2]  = 6
grid[1, 2]    = 6
```

---

#### Example 6: Wrapping a C API's Raw-Pointer-Plus-Dimensions Return

```cpp
#include <mdspan>
#include <cstdlib>
#include <iostream>

// Simulates a C camera/LiDAR SDK: hands back a raw pointer + separate dims.
extern "C" float* get_lidar_grid(int* out_rows, int* out_cols) {
    *out_rows = 4; *out_cols = 4;
    float* buf = static_cast<float*>(std::malloc(sizeof(float) * 16));
    for (int i = 0; i < 16; ++i) buf[i] = static_cast<float>(i);
    return buf;
}

int main() {
    int rows, cols;
    float* raw = get_lidar_grid(&rows, &cols);

    std::mdspan grid(raw, static_cast<size_t>(rows), static_cast<size_t>(cols));
    std::cout << "center = " << grid[rows / 2, cols / 2] << '\n';

    std::free(raw);   // mdspan never owned it — freeing is still the caller's job
}
```

**Output:**
```
center = 10
```

---

#### Example 7: 3x3 Box-Blur Kernel Using mdspan Indices

```cpp
#include <mdspan>
#include <vector>
#include <iostream>

void box_blur(std::mdspan<const float, std::dextents<size_t, 2>> src,
              std::mdspan<float, std::dextents<size_t, 2>> dst) {
    for (size_t y = 1; y + 1 < src.extent(0); ++y) {
        for (size_t x = 1; x + 1 < src.extent(1); ++x) {
            float sum = 0.0f;
            for (int dy = -1; dy <= 1; ++dy)
                for (int dx = -1; dx <= 1; ++dx)
                    sum += src[y + dy, x + dx];
            dst[y, x] = sum / 9.0f;
        }
    }
}

int main() {
    constexpr size_t n = 5;
    std::vector<float> in(n * n, 1.0f);
    std::vector<float> out(n * n, 0.0f);

    std::mdspan<const float, std::dextents<size_t, 2>> src(in.data(), n, n);
    std::mdspan<float, std::dextents<size_t, 2>> dst(out.data(), n, n);

    box_blur(src, dst);
    std::cout << dst[2, 2] << '\n';   // Interior pixel: average of nine 1.0f values
}
```

**Output:**
```
1
```

---

### QUICK_REFERENCE: mdspan Cheat Sheet

#### Layout Policies

| Layout | Index-to-offset formula (2D) | Convention | Use when |
|---|---|---|---|
| `std::layout_right` (default) | `offset(i,j) = i * extent(1) + j` | Row-major / "C order" | C arrays, images, most native C++ buffers |
| `std::layout_left` | `offset(i,j) = i + j * extent(0)` | Column-major / "Fortran order" | BLAS, LAPACK, Fortran, MATLAB-style buffers |
| `std::layout_stride` | `offset(i,j) = i * stride(0) + j * stride(1)` | Arbitrary, runtime strides | Sub-views, padded/SIMD-aligned rows, slices of a bigger matrix |

#### Extents at a Glance

| Concept | Meaning |
|---|---|
| `std::extents<IndexType, Extents...>` | Describes rank + per-dimension size, independent of the data |
| Static extent (e.g. `4`) | Size baked into the type; no runtime argument needed; enables compiler optimization |
| Dynamic extent (`std::dynamic_extent`) | Size is a runtime value, supplied at construction |
| `std::dextents<IndexType, Rank>` | Convenience alias: all `Rank` dimensions dynamic |
| `.rank()` | Number of dimensions (compile-time constant) |
| `.rank_dynamic()` | How many of those dimensions are dynamic |
| `.extent(i)` | Runtime size of dimension `i` |
| `.static_extent(i)` | Compile-time size of dimension `i`, or `dynamic_extent` if not static |

#### Construction Cheat Sheet

```cpp
#include <mdspan>
#include <vector>

std::vector<float> buf(12);

// 1. CTAD, all-dynamic 2D view (dextents<size_t, 2> deduced)
std::mdspan grid(buf.data(), 3, 4);

// 2. Explicit type, all-dynamic
std::mdspan<float, std::dextents<size_t, 2>> explicit_grid(buf.data(), 3, 4);

// 3. Fully static shape — no runtime dimension arguments at all
std::mdspan<float, std::extents<size_t, 3, 4>> fixed(buf.data());

// 4. Mixed static/dynamic — only dynamic dims passed as arguments
using MixedExtents = std::extents<size_t, std::dynamic_extent, 4>;
std::mdspan<float, MixedExtents> mixed(buf.data(), 3);

// 5. Explicit layout policy (BLAS/Fortran-style column-major)
std::mdspan<float, std::dextents<size_t, 2>, std::layout_left> col_major(buf.data(), 3, 4);

// 6. Custom strides via layout_stride::mapping
std::array<size_t, 2> strides{10, 1};
std::layout_stride::mapping<std::dextents<size_t, 2>> mapping(
    std::dextents<size_t, 2>{4, 4}, strides);
std::mdspan<float, std::dextents<size_t, 2>, std::layout_stride> strided(buf.data(), mapping);

// Access & queries (any construction above):
grid[1, 2];             // element access (P2128 variadic operator[])
grid.extent(0);          // size of dimension 0
grid.rank();              // number of dimensions
grid.size();              // total element count
```

#### One-Line Reminders

| Rule | Why it matters |
|---|---|
| `mdspan` never allocates, copies, or owns | Backing storage must outlive the view; watch for reallocation |
| `operator[]` is unchecked | No bounds checking — validate indices yourself at trust boundaries |
| `submdspan` is **not** part of C++23 | Slicing an existing `mdspan` arrives later (P2630); don't assume it's available |
| `layout_right` vs `layout_left` | Wrong choice compiles and runs — it just silently transposes the data |

**End of Topic 4: std::mdspan**
