## TOPIC: std::mdspan - Multidimensional Array Views

### PRACTICE_TASKS: Bug Hunts in mdspan Views

#### Q1
```cpp
#include <mdspan>
#include <vector>
#include <iostream>

std::mdspan<float, std::dextents<size_t, 2>> make_view() {
    std::vector<float> local(12);
    std::mdspan grid(local.data(), 3, 4);
    return grid;   // returning the view
}

int main() {
    auto grid = make_view();
    std::cout << grid[0, 0] << '\n';
}
```

**Answer:**
```
Undefined behavior — dangling mdspan (may print garbage, 0, or crash)
```

**Explanation:**
- `local` is a `std::vector<float>` with automatic storage duration inside `make_view()`
- `grid` is a non-owning view over `local.data()`
- When `make_view()` returns, `local` is destroyed and its heap buffer is freed
- The returned `grid` still holds the now-dangling pointer
- Reading `grid[0, 0]` in `main()` accesses freed memory — undefined behavior
- **Key Concept:** `mdspan` never owns memory; its lifetime must never outlive the buffer it views, including across function returns.

**Fixed Version:**
```cpp
#include <mdspan>
#include <vector>
#include <iostream>

std::vector<float> make_storage() {
    return std::vector<float>(12);   // ownership travels with the caller
}

int main() {
    std::vector<float> local = make_storage();
    std::mdspan grid(local.data(), 3, 4);   // view constructed after storage is stable
    std::cout << grid[0, 0] << '\n';
}
```

---

#### Q2
```cpp
#include <mdspan>
#include <vector>
#include <iostream>

int main() {
    std::vector<float> data(10);
    std::mdspan grid(data.data(), 10);

    for (int i = 0; i < 5; ++i) {
        data.push_back(static_cast<float>(i));   // growing the vector
    }

    grid[0] = 99.0f;
    std::cout << grid[0] << '\n';
}
```

**Answer:**
```
Undefined behavior — grid may point at freed memory after reallocation
```

**Explanation:**
- `grid` is constructed over `data.data()` while `data` has capacity for exactly 10 elements
- Calling `push_back` five times grows `data` past its original capacity, which very likely triggers one or more reallocations
- Each reallocation frees the old buffer and allocates a new one — `data.data()` may now point somewhere else entirely
- `grid` was never updated; it still holds the *old* pointer
- Writing through `grid[0]` after the reallocation is UB
- **Key Concept:** Any operation that can reallocate the owning container (like `push_back` past capacity) invalidates every `mdspan` built over its old buffer — exactly like `std::span` or an iterator.

**Fixed Version:**
```cpp
#include <mdspan>
#include <vector>
#include <iostream>

int main() {
    std::vector<float> data(10);

    for (int i = 0; i < 5; ++i) {
        data.push_back(static_cast<float>(i));
    }

    std::mdspan grid(data.data(), data.size());   // construct AFTER growth is done
    grid[0] = 99.0f;
    std::cout << grid[0] << '\n';
}
```

---

#### Q3
```cpp
#include <mdspan>
#include <vector>
#include <iostream>

// buffer was produced by a column-major (Fortran/BLAS-style) routine
std::vector<double> load_blas_matrix();   // assume: 3 rows, 4 cols, column-major

int main() {
    auto buffer = load_blas_matrix();

    std::mdspan<double, std::dextents<size_t, 2>> m(buffer.data(), 3, 4);
    std::cout << m[1, 2] << '\n';   // intended: row 1, column 2
}
```

**Answer:**
```
Compiles and runs, but reads the WRONG element (silent transposition)
```

**Explanation:**
- `buffer` was produced column-major (leftmost index varies fastest), as BLAS/Fortran routines do
- The `mdspan` is constructed with the DEFAULT layout policy, `std::layout_right` (row-major)
- `m[1, 2]` under `layout_right` computes offset `1 * 4 + 2 = 6`
- But the buffer's real layout means logical `(1, 2)` actually lives at offset `1 + 2 * 3 = 7`
- The code compiles, runs, and returns a *plausible-looking* number — just the wrong one
- **Key Concept:** `mdspan`'s default layout is `layout_right`; wrapping externally-produced column-major data without specifying `layout_left` silently transposes the matrix.

**Fixed Version:**
```cpp
#include <mdspan>
#include <vector>
#include <iostream>

std::vector<double> load_blas_matrix();

int main() {
    auto buffer = load_blas_matrix();

    std::mdspan<double, std::dextents<size_t, 2>, std::layout_left> m(buffer.data(), 3, 4);
    std::cout << m[1, 2] << '\n';   // now matches BLAS's column-major storage
}
```

---

#### Q4
```cpp
#include <mdspan>
#include <iostream>

int main() {
    float data[12] = {0,1,2,3,4,5,6,7,8,9,10,11};

    // Intended: a 3x4 view, but the constructor arguments are swapped
    std::mdspan<float, std::extents<size_t, 3, 4>> m(data, 4, 3);
    std::cout << m[0, 0] << '\n';
}
```

**Answer:**
```
Compile error — a fully static extents type takes no runtime dimension arguments
```

**Explanation:**
- `std::extents<size_t, 3, 4>` has BOTH dimensions static — 3 and 4 are baked into the type itself
- Because there are zero dynamic dimensions (`rank_dynamic() == 0`), the constructor accepts zero runtime size arguments
- Passing `(data, 4, 3)` tries to supply two runtime extent arguments to a shape that expects none
- This is a compile error, not a silent shape mismatch — the static/dynamic split converts this particular mistake into a hard failure instead of a runtime corruption
- **Key Concept:** Fully static extents are checked entirely at compile time; you cannot accidentally pass mismatched runtime sizes for dimensions that are static.

**Fixed Version:**
```cpp
#include <mdspan>
#include <iostream>

int main() {
    float data[12] = {0,1,2,3,4,5,6,7,8,9,10,11};

    std::mdspan<float, std::extents<size_t, 3, 4>> m(data);   // no runtime args needed
    std::cout << m[0, 0] << '\n';
}
```

---

#### Q5
```cpp
#include <mdspan>
#include <iostream>

// Image data loaded from a (possibly corrupt) file header
void process_image(unsigned char* buffer, size_t file_height, size_t file_width) {
    // Bug: arguments passed in the wrong order relative to how they were read
    std::mdspan<unsigned char, std::dextents<size_t, 2>> img(buffer, file_width, file_height);

    for (size_t y = 0; y < img.extent(0); ++y)
        for (size_t x = 0; x < img.extent(1); ++x)
            img[y, x] = 0;
}
```

**Answer:**
```
Compiles and runs; if file_width != file_height, this silently corrupts/misreads the buffer
```

**Explanation:**
- `img` is constructed as `(width, height)` even though the parameters are named `file_height, file_width`
- `extent(0)` and `extent(1)` are silently swapped relative to what the caller believes they mean
- If `file_width == file_height` the bug is invisible; the moment they differ, the loop walks past the true row/column bounds of the real buffer (or under-covers it), corrupting or under-processing memory
- Both dimensions here are dynamic, so nothing at compile time catches the swap
- **Key Concept:** Dynamic extents give up the compile-time safety net that static extents provide — the caller is entirely responsible for supplying dimensions in the correct order.

**Fixed Version:**
```cpp
#include <mdspan>
#include <iostream>

void process_image(unsigned char* buffer, size_t file_height, size_t file_width) {
    std::mdspan<unsigned char, std::dextents<size_t, 2>> img(buffer, file_height, file_width);

    for (size_t y = 0; y < img.extent(0); ++y)
        for (size_t x = 0; x < img.extent(1); ++x)
            img[y, x] = 0;
}
```

---

#### Q6
```cpp
#include <mdspan>
#include <vector>
#include <iostream>

int main() {
    std::vector<float> data(20);
    std::mdspan<float, std::dextents<size_t, 2>> grid(data.data(), 4, 5);

    std::cout << grid[4, 0] << '\n';   // one row past the end
}
```

**Answer:**
```
Undefined behavior — no exception is thrown, no bounds check occurs
```

**Explanation:**
- `grid` has `extent(0) == 4`, so valid row indices are `0..3`
- `grid[4, 0]` requests row index `4`, which is out of range
- `mdspan::operator[]` performs no bounds checking whatsoever, exactly like `std::span` and raw arrays
- The program may read garbage, silently "work" by accident, or corrupt unrelated memory — there is no guaranteed crash
- **Key Concept:** `mdspan` intentionally trades safety for being a true zero-overhead view; bounds checking (if needed) is entirely the caller's responsibility.

**Fixed Version:**
```cpp
#include <mdspan>
#include <vector>
#include <iostream>
#include <stdexcept>

int main() {
    std::vector<float> data(20);
    std::mdspan<float, std::dextents<size_t, 2>> grid(data.data(), 4, 5);

    size_t row = 4, col = 0;
    if (row >= grid.extent(0) || col >= grid.extent(1))
        throw std::out_of_range("mdspan index out of range");

    std::cout << grid[row, col] << '\n';
}
```

---

#### Q7
```cpp
#include <mdspan>
#include <array>
#include <vector>
#include <iostream>

int main() {
    // Intended: a 4x4 sub-block of a 10-column matrix (rows 10 apart, cols 1 apart)
    std::vector<float> data(60);

    std::array<size_t, 2> strides{1, 10};   // Bug: strides swapped
    std::layout_stride::mapping<std::dextents<size_t, 2>> mapping(
        std::dextents<size_t, 2>{4, 4}, strides);

    std::mdspan<float, std::dextents<size_t, 2>, std::layout_stride> sub(data.data(), mapping);
    std::cout << sub[3, 3] << '\n';
}
```

**Answer:**
```
Compiles and constructs successfully, but computes an offset far outside the intended 4x4 sub-block
```

**Explanation:**
- The intended layout is "rows 10 apart, columns 1 apart" — stride `{10, 1}`
- The code instead supplies `{1, 10}` — rows only 1 apart, columns 10 apart
- `layout_stride` accepts ANY stride array; it has no way to validate that the strides describe a sensible or in-bounds access pattern for the given buffer
- `sub[3, 3]` computes `3*1 + 3*10 = 33` instead of the intended `3*10 + 3*1 = 33` — in this particular case they coincide, but for most other indices (e.g. `sub[3, 0]` vs `sub[0, 3]`) the swapped strides read completely different, likely out-of-bounds-of-intent memory
- **Key Concept:** `layout_stride` is the fully general layout; the library performs no validation that supplied strides are correct for the buffer — that responsibility is entirely the caller's.

**Fixed Version:**
```cpp
#include <mdspan>
#include <array>
#include <vector>
#include <iostream>

int main() {
    std::vector<float> data(60);

    std::array<size_t, 2> strides{10, 1};   // rows 10 apart, columns 1 apart
    std::layout_stride::mapping<std::dextents<size_t, 2>> mapping(
        std::dextents<size_t, 2>{4, 4}, strides);

    std::mdspan<float, std::dextents<size_t, 2>, std::layout_stride> sub(data.data(), mapping);
    std::cout << sub[3, 3] << '\n';
}
```

---

#### Q8
```cpp
#include <mdspan>
#include <vector>
#include <iostream>

int main() {
    size_t rows = 100, cols = 50;

    // Buffer allocated for a 2D shape...
    std::vector<float> buffer(rows * cols);

    // ...but a 3D view is constructed over it (each cell has 3 channels)
    std::mdspan<float, std::dextents<size_t, 3>> view(buffer.data(), rows, cols, 3);

    view[99, 49, 2] = 1.0f;
    std::cout << "done\n";
}
```

**Answer:**
```
Undefined behavior — buffer is under-allocated by a factor of 3
```

**Explanation:**
- `buffer` is sized `rows * cols` elements — enough for a 2D shape only
- `view` is a 3D `mdspan` describing `rows * cols * 3` logical elements
- `view.required span size()` (conceptually `rows * cols * 3`) is three times larger than what was actually allocated
- Any access into the third dimension beyond what fits in the true `rows * cols` allocation reads/writes past the end of `buffer`
- The bug is invisible at construction time — `mdspan` never allocates and never checks that the buffer you hand it is large enough
- **Key Concept:** The caller must compute the required buffer size from the SAME extents used to build the view, not from a shape that only "looks similar."

**Fixed Version:**
```cpp
#include <mdspan>
#include <vector>
#include <iostream>

int main() {
    size_t rows = 100, cols = 50;

    std::dextents<size_t, 3> shape(rows, cols, 3);
    std::vector<float> buffer(shape.extent(0) * shape.extent(1) * shape.extent(2));

    std::mdspan<float, std::dextents<size_t, 3>> view(buffer.data(), shape);

    view[99, 49, 2] = 1.0f;
    std::cout << "done\n";
}
```

---

#### Q9
```cpp
#include <mdspan>
#include <vector>
#include <iostream>

template<class T, class Extents>
size_t element_count(std::mdspan<T, Extents> m) {
    return m.rank();   // Bug?
}

int main() {
    std::vector<float> data(3 * 4);
    std::mdspan<float, std::dextents<size_t, 2>> grid(data.data(), 3, 4);

    std::cout << element_count(grid) << '\n';
}
```

**Answer:**
```
2 (not 12 — the function returns the number of DIMENSIONS, not the element count)
```

**Explanation:**
- `m.rank()` is a compile-time constant equal to the number of dimensions (here, 2 — a 2D `mdspan`)
- It has nothing to do with how many elements the view actually contains
- The function is misleadingly named `element_count` but really returns the rank
- Calling it on a 3x4 view prints `2`, not the expected `12`
- **Key Concept:** `rank()` (dimension count) and `size()` (total element count across all dimensions) are easy to confuse in generic code — `size()` is what "element count" actually means.

**Fixed Version:**
```cpp
#include <mdspan>
#include <vector>
#include <iostream>

template<class T, class Extents>
size_t element_count(std::mdspan<T, Extents> m) {
    return m.size();   // true total element count
}

int main() {
    std::vector<float> data(3 * 4);
    std::mdspan<float, std::dextents<size_t, 2>> grid(data.data(), 3, 4);

    std::cout << element_count(grid) << '\n';
}
```

---

#### Q10
```cpp
#include <mdspan>
#include <vector>
#include <iostream>

int main() {
    std::vector<int> data = {0, 1, 2, 3, 4, 5};

    std::mdspan row_major(data.data(), 2, 3);   // default layout_right
    std::mdspan<int, std::dextents<size_t, 2>, std::layout_left> col_major(data.data(), 2, 3);

    std::cout << row_major[1, 2] << " " << col_major[1, 2] << '\n';
}
```

**Answer:**
```
5 5
```

**Explanation:**
- No bug here — this demonstrates that two `mdspan`s over the SAME underlying buffer can validly disagree, because layout is a property of the VIEW, not the data
- `row_major[1, 2]` under `layout_right`: offset = `1*3 + 2 = 5` → `data[5] == 5`
- `col_major[1, 2]` under `layout_left`: offset = `1 + 2*2 = 5` → `data[5] == 5`
- The two layouts happen to agree at this particular index for this particular shape — but they disagree at most OTHER indices (e.g. `[0, 1]` gives offset 1 under `layout_right` but offset 2 under `layout_left`)
- **Key Concept:** Layout policy is a property of the view, not the underlying buffer; the same memory can be legitimately interpreted multiple ways, which is exactly why picking the wrong one for externally-produced data is a silent bug rather than a type error.

---

#### Q11
```cpp
#include <mdspan>
#include <vector>
#include <iostream>

int main() {
    std::vector<double> data(12);

    // Fully dynamic extents — no static dimensions at all
    std::mdspan<double, std::dextents<size_t, 2>> m(data.data(), 3, 4);

    std::cout << m.static_extent(0) << '\n';
}
```

**Answer:**
```
Prints std::dynamic_extent's numeric value (implementation-defined, typically a very large size_t like 18446744073709551615 on 64-bit)
```

**Explanation:**
- `std::dextents<size_t, 2>` makes BOTH dimensions dynamic — there is no compile-time size for either one
- `static_extent(0)` asks "what is the compile-time size of dimension 0, if any?" — since dimension 0 is dynamic, it returns the sentinel value `std::dynamic_extent`, which is defined as `static_cast<size_t>(-1)`
- This is NOT the runtime size (which would be `3`, obtainable via `m.extent(0)`) — it is a sentinel meaning "not known at compile time"
- Printing it directly produces the huge wraparound value of `-1` as an unsigned `size_t`, which looks like a bug but is the documented sentinel
- **Key Concept:** `static_extent(i)` and `extent(i)` answer two different questions — "what does the TYPE know at compile time" vs. "what is the actual runtime size" — and `dynamic_extent` is a sentinel, not a real size, when printed directly.

---

#### Q12
```cpp
#include <mdspan>
#include <vector>
#include <iostream>

void fill_diagonal(std::mdspan<float, std::dextents<size_t, 2>> m, float value) {
    // Bug: assumes the matrix is square without checking
    for (size_t i = 0; i < m.extent(0); ++i)
        m[i, i] = value;
}

int main() {
    std::vector<float> data(12);   // intended as a 3x4 matrix
    std::mdspan<float, std::dextents<size_t, 2>> m(data.data(), 3, 4);

    fill_diagonal(m, 1.0f);
    std::cout << "done\n";
}
```

**Answer:**
```
Compiles and runs without a crash here (3 <= 4), but is a latent out-of-bounds bug for any matrix where extent(0) > extent(1)
```

**Explanation:**
- `fill_diagonal` loops `i` from `0` to `m.extent(0) - 1` and always indexes `m[i, i]`
- This silently assumes `extent(0) <= extent(1)` (or that the matrix is square) — nothing in the type system enforces that assumption
- For THIS 3x4 matrix it happens to be safe (`i` only reaches 2, well within the 4 columns)
- But called with a matrix where rows exceed columns (e.g. a 5x3 matrix), `m[i, i]` would eventually index a column beyond `extent(1)` — undefined behavior, silently, because `operator[]` performs no bounds checking (Edge Case 4)
- **Key Concept:** Generic mdspan code that assumes a relationship between dimensions (like "square") must validate that assumption explicitly — the type system does not enforce shape relationships between dimensions.

**Fixed Version:**
```cpp
#include <mdspan>
#include <vector>
#include <iostream>
#include <algorithm>

void fill_diagonal(std::mdspan<float, std::dextents<size_t, 2>> m, float value) {
    size_t diag_len = std::min(m.extent(0), m.extent(1));
    for (size_t i = 0; i < diag_len; ++i)
        m[i, i] = value;
}
```

---
