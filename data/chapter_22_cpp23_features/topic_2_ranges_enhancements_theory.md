## TOPIC: C++23 Ranges Enhancements - New Views and Adaptors

### THEORY_SECTION: Composing Ranges - Zipping, Windowing, Grouping, and Materializing

C++20 shipped the *foundation* of the ranges library: views, adaptors, and the pipe (`|`) composition syntax. But the initial ranges TS deliberately left out several high-value adaptors because they needed more design time. C++23 fills in almost all of those gaps. This topic covers the new adaptors that let you combine multiple ranges (`zip`), window a single range (`chunk`, `slide`), group by a predicate (`chunk_by`), flatten with a separator (`join_with`), enumerate combinations (`cartesian_product`), generate synthetic ranges (`repeat`), skip elements (`stride`), and finally materialize any view back into a concrete container (`ranges::to`) — closing the loop that C++20 ranges left open (you could build a lazy pipeline, but turning it back into a `std::vector` required a manual `std::copy` + `back_inserter` dance).

All adaptors below live in `namespace std::ranges::views` (commonly aliased as `views`), and all compose with the existing C++20 adaptors (`filter`, `transform`, `take`, `drop`, `reverse`, ...) using the same `|` pipe syntax.

```cpp
#include <ranges>
namespace views = std::ranges::views;
namespace ranges = std::ranges;
```

---

#### 1. `views::zip` and `views::zip_transform` (P2321R2) - Combining Multiple Ranges Element-Wise

**The problem before C++23:** ranges could only be processed one at a time. Iterating two containers in lockstep required manual index-based loops or third-party libraries (`boost::combine`, `ranges-v3::zip`).

`std::views::zip` takes any number of ranges and produces a view of `std::tuple`s, one tuple per "row", stopping at the length of the *shortest* input range:

```cpp
#include <ranges>
#include <vector>
#include <string>
#include <iostream>

int main() {
    std::vector<int> ids       = {1, 2, 3, 4};
    std::vector<std::string> names = {"Alice", "Bob", "Carol"};  // shorter!

    for (auto [id, name] : std::views::zip(ids, names)) {
        std::cout << id << ": " << name << '\n';
    }
    // Output: 1: Alice / 2: Bob / 3: Carol
    // Note: "4" is dropped -- zip stops at the shortest range (names has 3 elements)
}
```

**Element type table:**

| Inputs | `zip` element type | Notes |
|--------|---------------------|-------|
| `zip(v1)` | `std::tuple<T1&>` | Single-range zip still wraps in a 1-tuple |
| `zip(v1, v2)` | `std::tuple<T1&, T2&>` | References into the underlying ranges |
| `zip(v1, v2, v3)` | `std::tuple<T1&, T2&, T3&>` | Any arity supported |
| `zip()` (no args) | `std::ranges::empty_view` | Degenerate case, defined for completeness |

Because the tuple holds **references**, mutating through structured bindings mutates the original ranges:

```cpp
std::vector<int> a = {1, 2, 3};
std::vector<int> b = {10, 20, 30};

for (auto [x, y] : std::views::zip(a, b)) {
    x += y;   // modifies 'a' in place
}
// a is now {11, 22, 33}
```

**`views::zip_transform`** combines zipping with an immediate transform, avoiding an intermediate tuple-of-references when you just want a computed value:

```cpp
std::vector<double> prices   = {10.0, 20.0, 30.0};
std::vector<int>    quantities = {2, 1, 5};

auto line_totals = std::views::zip_transform(
    [](double price, int qty) { return price * qty; },
    prices, quantities);

for (double total : line_totals) {
    std::cout << total << ' ';   // 20 20 150
}
```

`zip_transform(fn, r1, r2, ...)` is exactly equivalent to `zip(r1, r2, ...) | transform([](auto&& t) { return std::apply(fn, t); })`, but is provided directly because that pattern is so common.

---

#### 2. `views::adjacent<N>` and `views::adjacent_transform` - Sliding Fixed-Size Tuples

`std::views::adjacent<N>` is `zip`'s single-range sibling: it produces a view of `std::tuple`s where each tuple holds `N` *consecutive* elements from the same range (a fixed-width sliding window expressed as tuples rather than subranges):

```cpp
std::vector<int> data = {1, 2, 3, 4, 5};

for (auto [a, b, c] : std::views::adjacent<3>(data)) {
    std::cout << "(" << a << "," << b << "," << c << ") ";
}
// (1,2,3) (2,3,4) (3,4,5)
```

`N` must be a compile-time constant (it is a non-type template parameter), because the result type is `std::tuple` with exactly `N` elements — unlike `slide` (below), which returns runtime-sized subranges.

**`views::pairwise`** is simply the alias `adjacent<2>` — common enough (comparing neighboring elements, computing deltas) to deserve its own name:

```cpp
std::vector<int> readings = {10, 12, 11, 15, 14};

for (auto [prev, curr] : std::views::pairwise(readings)) {
    std::cout << "delta=" << (curr - prev) << ' ';
}
// delta=2 delta=-1 delta=4 delta=-1
```

**`views::adjacent_transform<N>`** fuses the windowing with a transform function taking `N` arguments, mirroring how `zip_transform` relates to `zip`:

```cpp
std::vector<double> samples = {1.0, 3.0, 2.0, 8.0, 5.0};

// Compute a simple 3-point moving average
auto smoothed = std::views::adjacent_transform<3>(
    samples,
    [](double a, double b, double c) { return (a + b + c) / 3.0; });

for (double v : smoothed) std::cout << v << ' ';   // 2.0 4.333.. 5.0
```

`views::pairwise_transform` is the corresponding `adjacent_transform<2>` alias.

| Adaptor | Arity | Output element | Typical use |
|---------|-------|-----------------|-------------|
| `adjacent<N>` | fixed at compile time | `tuple` of `N` references | Neighboring-element access without index math |
| `pairwise` | 2 | `tuple<T&, T&>` | Deltas, comparisons between consecutive elements |
| `adjacent_transform<N>` | fixed at compile time | transform's return type | Moving windows / moving averages / smoothing |

---

#### 3. `views::chunk` and `views::slide` (P2442R1) - Non-Overlapping vs Overlapping Windows

These two are frequently confused because they both "window" a range, but they answer different questions:

- **`chunk(n)`** — "partition the range into consecutive, **non-overlapping** groups of (up to) `n` elements." The last chunk may be shorter.
- **`slide(n)`** — "give me every **overlapping** window of exactly `n` consecutive elements" (a runtime-sized generalization of `adjacent`).

**Side-by-side over the same input:**

```cpp
#include <ranges>
#include <vector>
#include <iostream>

int main() {
    std::vector<int> v = {1, 2, 3, 4, 5, 6, 7};

    std::cout << "chunk(3): ";
    for (auto group : v | std::views::chunk(3)) {
        std::cout << "[";
        for (int x : group) std::cout << x << ' ';
        std::cout << "] ";
    }
    // chunk(3): [1 2 3 ] [4 5 6 ] [7 ]
    //           ^^^^^^^ non-overlapping, last group is short (size 1)

    std::cout << "\nslide(3): ";
    for (auto window : v | std::views::slide(3)) {
        std::cout << "[";
        for (int x : window) std::cout << x << ' ';
        std::cout << "] ";
    }
    // slide(3): [1 2 3 ] [2 3 4 ] [3 4 5 ] [4 5 6 ] [5 6 7 ]
    //           ^^^^^^^ overlapping, every window has exactly 3 elements
}
```

**Comparison table:**

| Aspect | `chunk(n)` | `slide(n)` |
|--------|------------|------------|
| Overlap | None — each element appears in exactly one group | Full — each element appears in up to `n` windows |
| Number of results | `ceil(size / n)` | `size - n + 1` (empty if `size < n`) |
| Last group size | May be `< n` (the remainder) | Always exactly `n` (no partial windows) |
| Element type (for `input_range`) | `ranges::subrange` (single-pass friendly) | Requires `forward_range` (needs to revisit) |
| Typical use | Batching / paging (process 100 rows at a time) | Moving averages, "look at the next k elements" |

`chunk` works even on single-pass input ranges (it consumes the range as it goes and doesn't need to look backward), whereas `slide` requires at least a `forward_range` because it must keep multiple overlapping positions alive simultaneously.

---

#### 4. `views::chunk_by` (P2443R1) - Grouping by a Binary Predicate

Where `chunk` groups by a fixed *count*, `chunk_by` groups by a *predicate* applied to adjacent elements: it starts a new group every time the predicate returns `false` for a consecutive pair.

```cpp
#include <ranges>
#include <vector>
#include <iostream>

int main() {
    std::vector<int> v = {1, 2, 2, 3, 1, 1, 1, 4};

    // Group consecutive equal elements (a "run-length" style grouping)
    for (auto group : v | std::views::chunk_by(std::equal_to{})) {
        std::cout << "[";
        for (int x : group) std::cout << x << ' ';
        std::cout << "] ";
    }
    // [1 ] [2 2 ] [3 ] [1 1 1 ] [4 ]
}
```

A more practical example — splitting a sequence into maximal runs of non-decreasing values:

```cpp
std::vector<int> series = {1, 3, 5, 4, 8, 2, 9};

auto ascending_runs = series | std::views::chunk_by(
    [](int a, int b) { return a <= b; });   // predicate(prev, curr)

for (auto run : ascending_runs) {
    for (int x : run) std::cout << x << ' ';
    std::cout << "| ";
}
// 1 3 5 | 4 8 | 2 9 |
```

The predicate is invoked as `pred(a[i], a[i+1])`; as soon as it returns `false`, element `i+1` starts a new group. This makes `chunk_by` the natural tool for "split on change" problems: grouping log lines by timestamp bucket, run-length-style compression, or segmenting a sorted-with-duplicates range into equal-value groups.

---

#### 5. `views::join_with` (P2441R2) - Flattening With a Separator

C++20 already had `views::join`, which flattens a range-of-ranges into a single range (e.g., a `vector<vector<int>>` into one flat sequence). What it couldn't do is insert a *separator* between the inner ranges — which is exactly what you need for the extremely common "join these strings with a delimiter" task.

`views::join_with(delimiter)` flattens a range-of-ranges and inserts `delimiter` between each inner range:

```cpp
#include <ranges>
#include <vector>
#include <string>
#include <iostream>

int main() {
    std::vector<std::string> words = {"C++23", "adds", "join_with"};

    // Join with a single delimiter character
    auto joined = words | std::views::join_with(' ');
    for (char c : joined) std::cout << c;
    std::cout << '\n';   // "C++23 adds join_with"

    // The delimiter can itself be a range (e.g., a multi-character string)
    auto csv_row = words | std::views::join_with(std::string{", "});
    for (char c : csv_row) std::cout << c;
    std::cout << '\n';   // "C++23, adds, join_with"
}
```

Before C++23, achieving this required manual index-tracking (`if (i != 0) result += delimiter;`) or falling back to `std::accumulate` with awkward string concatenation. `join_with` composes naturally with the rest of the pipeline — e.g., transforming numbers to strings and then joining them:

```cpp
std::vector<int> nums = {1, 2, 3, 4};

auto text = nums
    | std::views::transform([](int n) { return std::to_string(n); })
    | std::views::join_with(std::string{"-"});

for (char c : text) std::cout << c;   // "1-2-3-4"
```

---

#### 6. `views::cartesian_product` (P2374R4) - N-ary Cartesian Product

`std::views::cartesian_product` takes any number of ranges and lazily produces every combination of one element from each range, as a `std::tuple`, iterating the **last** range fastest (row-major / odometer order) — the same convention as nested loops with the innermost loop last.

**Two-range example:**

```cpp
#include <ranges>
#include <vector>
#include <iostream>

int main() {
    std::vector<int> ranks  = {1, 2, 3};
    std::vector<char> suits = {'H', 'S'};

    for (auto [rank, suit] : std::views::cartesian_product(ranks, suits)) {
        std::cout << "(" << rank << suit << ") ";
    }
    // (1H) (1S) (2H) (2S) (3H) (3S)
    // Note: 'suits' (the last range) varies fastest
}
```

This is precisely equivalent to the nested loop:

```cpp
for (int rank : ranks)
    for (char suit : suits)
        // use (rank, suit)
```

**Three-range example** (demonstrating it isn't limited to pairs):

```cpp
std::vector<int> x = {0, 1};
std::vector<int> y = {0, 1};
std::vector<int> z = {0, 1};

// Enumerate all 8 corners of a unit cube
for (auto [xi, yi, zi] : std::views::cartesian_product(x, y, z)) {
    std::cout << "(" << xi << "," << yi << "," << zi << ") ";
}
// (0,0,0) (0,0,1) (0,1,0) (0,1,1) (1,0,0) (1,0,1) (1,1,0) (1,1,1)
```

The total number of tuples produced is the product of the sizes of all input ranges; if any input range is empty, the whole `cartesian_product` view is empty (there is nothing to pair an empty range's "elements" with).

---

#### 7. `views::repeat` and `views::stride` - Synthetic Ranges and Step-Skipping

**`std::views::repeat(value)`** (from the ranges factories, standardized alongside the C++23 range adaptors) generates an *infinite* range that yields `value` forever — useful as a building block combined with `zip` or `take`, not something you iterate directly with a range-`for` loop:

```cpp
#include <ranges>
#include <iostream>

int main() {
    // Infinite view -- must be bounded with take() before iterating fully
    auto padding = std::views::repeat(0) | std::views::take(5);
    for (int x : padding) std::cout << x << ' ';   // 0 0 0 0 0

    // Bounded overload: repeat(value, count) generates exactly `count` copies
    auto exact = std::views::repeat(std::string{"ping"}, 3);
    for (auto& s : exact) std::cout << s << ' ';   // ping ping ping
}
```

A common pairing is zipping a real range against a `repeat`-generated constant, e.g. tagging every element of a container with the same label without allocating a same-sized vector of labels:

```cpp
std::vector<int> ids = {101, 102, 103};

for (auto [id, tag] : std::views::zip(ids, std::views::repeat(std::string("active")))) {
    std::cout << id << ":" << tag << ' ';
}
// 101:active 102:active 103:active
```

**`std::views::stride(n)`** skips forward `n` elements at a time, yielding every `n`-th element starting from the first:

```cpp
std::vector<int> v = {0, 1, 2, 3, 4, 5, 6, 7, 8, 9};

for (int x : v | std::views::stride(3)) {
    std::cout << x << ' ';   // 0 3 6 9
}
```

`stride` composes with `drop` to start at an offset (e.g., "every 3rd element starting from index 1"):

```cpp
for (int x : v | std::views::drop(1) | std::views::stride(3)) {
    std::cout << x << ' ';   // 1 4 7
}
```

---

#### 8. `std::ranges::to<Container>()` (P1206R7) - Materializing a View Into a Container

This is arguably the single most impactful C++23 ranges addition for everyday code, because it closes the biggest usability gap in C++20 ranges: **views are lazy and don't own their data**, so at some point you usually need a real, owning container (to store, return, or serialize the result). Before C++23, that meant manual boilerplate:

```cpp
// ❌ C++20: manual materialization
std::vector<int> result;
auto view = data | std::views::filter(is_even) | std::views::transform(square);
std::ranges::copy(view, std::back_inserter(result));
```

`std::ranges::to` collapses this into a single step, appended directly to the pipeline with `|`:

```cpp
#include <ranges>
#include <vector>
#include <map>
#include <string>

int main() {
    std::vector<int> data = {1, 2, 3, 4, 5, 6, 7, 8};

    auto is_even = [](int n) { return n % 2 == 0; };
    auto square  = [](int n) { return n * n; };

    // ✅ C++23: fluent pipeline, ending in a concrete owning container
    std::vector<int> result = data
        | std::views::filter(is_even)
        | std::views::transform(square)
        | std::ranges::to<std::vector<int>>();

    // result == {4, 16, 36, 64}
}
```

**`to` can also target associative and other container types**, deducing constructor arguments from the range's element type (typically pairs, for map-like containers):

```cpp
std::vector<std::pair<std::string, int>> entries = {
    {"alice", 30}, {"bob", 25}, {"carol", 35}
};

// Materialize a range of pairs directly into a std::map
auto by_name = entries | std::ranges::to<std::map<std::string, int>>();
```

**Template argument deduction:** when the container's element type matches the view's value type, you can often omit the inner type and let CTAD-like deduction fill it in:

```cpp
auto v = data | std::views::transform(square) | std::ranges::to<std::vector>();
// std::vector<int> deduced from the transformed range's value_type
```

`to` also has a direct (non-pipe) function-call form, `std::ranges::to<Container>(range)`, useful when converting an existing range without building a pipeline:

```cpp
std::list<int> lst = {1, 2, 3};
std::vector<int> vec = std::ranges::to<std::vector<int>>(lst);
```

---

#### 9. Summary: What C++23 Added on Top of C++20 Ranges

| Capability | C++20 | C++23 |
|------------|-------|-------|
| Single-range transform / filter / take / drop | ✅ | ✅ (unchanged) |
| Combine multiple ranges element-wise | ❌ (manual index loops) | ✅ `zip`, `zip_transform` |
| Fixed-size tuple windows over one range | ❌ | ✅ `adjacent<N>`, `pairwise` |
| Non-overlapping batching | ❌ | ✅ `chunk` |
| Overlapping windows | ❌ (only via 3rd-party libs) | ✅ `slide` |
| Group by predicate change | ❌ | ✅ `chunk_by` |
| Flatten with separator | ❌ (only bare `join`) | ✅ `join_with` |
| N-ary combinations | ❌ | ✅ `cartesian_product` |
| Synthetic constant/repeated ranges | ❌ | ✅ `repeat` |
| Step-skipping | ❌ (manual index math) | ✅ `stride` |
| Turn a view back into a container | ❌ (manual `copy` + `back_inserter`) | ✅ `ranges::to<Container>()` |

Taken together, these additions mean a C++23 ranges pipeline can express filter → group → combine → materialize entirely in declarative, composable `|` chains — the kind of code that previously required either raw loops or a third-party ranges library (`range-v3`), which was in fact the direct source of most of these adaptors' designs.

---

#### 10. Compile-Time vs Runtime Breakdown

Building a ranges pipeline out of `zip`, `adjacent`, `chunk`, `slide`, `chunk_by`, `join_with`, `cartesian_product`, `repeat`, `stride`, and friends looks like it's "doing work" the moment you write the `|` chain — it isn't. Every adaptor call is a **type-building operation resolved entirely at compile time**; the resulting object does not read a single element from the underlying ranges until something actually iterates it.

| Code / Mechanism | Phase | What Happens |
|---|---|---|
| `numbers \| views::filter(pred) \| views::transform(f)` | **Compile time** | The compiler instantiates a nested view *type* — conceptually `transform_view<filter_view<ref_view<Numbers>, Pred>, F>`. No element of `numbers` is touched; `pred` and `f` are just stored as member objects inside the view. |
| `views::zip(a, b, c)` | **Compile time** | Builds a `zip_view` type holding one iterator-pair per input range. The `tuple<T1&, T2&, T3&>` reference type returned by `operator*` is also deduced at compile time. |
| `views::adjacent<2>(r)` / `views::chunk(r, 4)` / `views::slide(r, 3)` | **Compile time** | The window size `N` (for `adjacent<N>`) is a template parameter baked into the type; the runtime size for `chunk`/`slide` is stored as a small integer member, but the *windowing logic itself* is compiled directly into `operator++`. |
| `for (auto&& x : pipeline)` → `it != end`, `++it`, `*it` | **Runtime** | This is where actual work happens. Each `++it` advances the *innermost* iterator and re-evaluates every adaptor in the chain lazily, one element at a time; each `*it` invokes `pred`/`f`/tuple-construction on real data pulled from the real containers. |
| `pipeline \| std::ranges::to<std::vector<int>>()` | **Runtime** | The one point in the whole pipeline that performs actual heap allocation: `ranges::to` walks the (now fully compile-time-typed) pipeline, iterating it exactly once, and copies/constructs each materialized element into a freshly allocated `std::vector`. |

The practical rule of thumb: **everything left of the terminal `for` loop or `ranges::to` is compiler bookkeeping; everything inside the loop body is where your CPU cycles actually go.** This is why a 5-stage adaptor chain compiles down to code no slower than a single hand-written loop containing all 5 steps inline — the "pipeline" is a compile-time fiction that vanishes into ordinary iterator increments.

#### 11. Memory Model

A view object — the thing `numbers | views::filter(pred) | views::transform(f)` actually evaluates to — is a small, **non-owning stack object**. It holds only:

- A reference/iterator pair (or `ref_view`) pointing at the *original* underlying range (`numbers`), never a copy of its elements.
- Small captured callables (`pred`, `f`) stored by value inside the view.
- For `chunk`/`slide`/`stride`: a couple of integers (window size, step) — no dynamic storage.

```
STACK (view pipeline object — sizeof ~= a few pointers + captured lambdas):
┌────────────────────────────────────────────────────────────┐
│ transform_view {                                             │
│     filter_view {                                            │
│         ref_view -> [ points at 'numbers' std::vector, HEAP ]│
│         pred (stored lambda, few bytes)                      │
│     }                                                         │
│     f (stored lambda, few bytes)                              │
│ }                                                              │
└────────────────────────────────────────────────────────────┘
                     │
                     │ no data copied here — only touched on iteration
                     ▼
HEAP: numbers' actual elements (owned by the ORIGINAL std::vector, untouched by the view)
```

Contrast this with the pre-C++20 STL-algorithm style, where every pipeline stage materialized a *full* intermediate `std::vector` — `filter`'s output copied into one heap buffer, then `transform`'s output copied into a second heap buffer, and so on. A 4-stage pipeline over `range-v3`-less C++17 code meant 3-4 separate heap allocations and 3-4 full passes over memory before you saw a single final result.

**Low-latency relevance:** because the entire adaptor chain is a compile-time type with zero owned storage, the compiler can (and typically does, at `-O2`/`-O3`) inline the whole `filter → transform → take` pipeline into a *single* tight loop with no intermediate heap allocations and no extra passes over the data — exactly the code shape you'd write by hand. For hot paths processing market-data ticks, sensor samples, or log lines, this means you get the readability of a declarative pipeline without paying for N transient `std::vector` allocations per stage; the only allocation in the whole chain, if any, is the single one at the terminal `ranges::to` call — and even that can be avoided entirely by iterating the view directly instead of materializing it.

---

### EDGE_CASES: Tricky Scenarios with C++23 Range Adaptors

#### Edge Case 1: `zip` Silently Truncates to the Shortest Range

```cpp
#include <ranges>
#include <vector>
#include <iostream>

int main() {
    std::vector<int> ids   = {1, 2, 3, 4, 5};
    std::vector<int> flags = {1, 0, 1};   // only 3 elements!

    for (auto [id, flag] : std::views::zip(ids, flags)) {
        std::cout << id << ":" << flag << ' ';
    }
    // (1:1) (2:0) (3:1) -- ids 4 and 5 are silently dropped, no error, no warning
}
```

`zip` never throws, asserts, or pads the shorter range with a sentinel value — it simply stops as soon as **any** input range is exhausted. This is easy to miss when the ranges are computed from independent sources (e.g. two database queries) that are *supposed* to be the same length; a length mismatch becomes a silent data-loss bug rather than a caught error. If mismatched lengths should be an error, check `std::ranges::size(r1) == std::ranges::size(r2)` explicitly before zipping (only valid for `sized_range`s).

---

#### Edge Case 2: Dangling Views Over Temporaries (`zip`, `adjacent`, `chunk`) vs. `views::as_rvalue`

A view adaptor stores an **iterator/reference** into its underlying range — it does not own the data. Passing a temporary (prvalue) container directly into most adaptors is fine as long as the *view itself* doesn't outlive the full expression, but storing the resulting view for later use is dangerous:

```cpp
#include <ranges>
#include <vector>

// ❌ DANGLING: the temporary vector is destroyed at the end of the full
// expression, but `bad_view` still tries to reference it afterward.
auto make_dangling() {
    return std::views::zip(std::vector<int>{1, 2, 3}, std::vector<int>{4, 5, 6});
    // Both vectors are temporaries -- their storage is gone once this
    // function returns; iterating the result is undefined behavior.
}

// ✅ SAFE: bind to named lvalues that outlive the view's use
void safe_usage() {
    std::vector<int> a = {1, 2, 3};
    std::vector<int> b = {4, 5, 6};
    auto view = std::views::zip(a, b);   // view refers to 'a' and 'b'
    for (auto [x, y] : view) { /* ... */ }   // safe: a, b still alive
}
```

`std::views::as_rvalue` changes what the *elements* of a view are — it turns each element's reference into an rvalue reference (so consuming the view can move-from elements) — but it does **not** extend the lifetime of the underlying range. It solves a different problem (letting `ranges::to` or `transform` move out of elements instead of copying them), not the dangling-container problem above. Confusing the two is a common mistake: `as_rvalue` makes moves *possible*, it does not make a temporary container's storage live any longer.

---

#### Edge Case 3: `chunk` vs `slide` Boundary Behavior with Non-Divisible Sizes

```cpp
#include <ranges>
#include <vector>
#include <iostream>

int main() {
    std::vector<int> v = {1, 2, 3, 4, 5};   // size 5, not divisible by 3

    // chunk(3) on a size-5 range: ceil(5/3) = 2 groups, last one is short
    for (auto g : v | std::views::chunk(3)) {
        for (int x : g) std::cout << x << ' ';
        std::cout << "| ";
    }
    // 1 2 3 | 4 5 |          <- second group has only 2 elements, NOT an error

    // slide(3) on a size-5 range: 5 - 3 + 1 = 3 windows
    for (auto w : v | std::views::slide(3)) {
        for (int x : w) std::cout << x << ' ';
        std::cout << "| ";
    }
    // 1 2 3 | 2 3 4 | 3 4 5 |     <- every window is exactly size 3, always

    // slide(N) where N > range size produces ZERO windows, not one short window
    for (auto w : v | std::views::slide(10)) {
        for (int x : w) std::cout << x << ' ';
    }
    // (nothing printed -- empty view, not a runtime error)
}
```

The bug pattern to watch for: code that assumes every `chunk` group has exactly `n` elements (and, say, indexes into `group[n-1]` unconditionally) will read past the end / throw on the final short chunk. Code that assumes `slide(n)` yields `ceil(size / n)` windows (confusing it with `chunk`'s count) will iterate the wrong number of times.

---

#### Edge Case 4: `join_with`'s Delimiter Can Be a Single Element *or* a Range — Overload Confusion

```cpp
#include <ranges>
#include <vector>
#include <string>
#include <iostream>

int main() {
    std::vector<std::string> words = {"a", "b", "c"};

    // Delimiter is a single character -- joins the *characters* of each
    // string with that one char in between the strings.
    auto v1 = words | std::views::join_with(',');
    // "a,b,c"

    // Delimiter is itself a range (here, a string) -- inserts the WHOLE
    // range between each inner range, not just its first element.
    auto v2 = words | std::views::join_with(std::string{", "});
    // "a, b, c"

    // ❌ SURPRISE: join_with('.') where you meant a multi-char delimiter
    // "..", written as a char literal, does NOT compile as "two dots" --
    // a char literal is exactly one char. Multi-character delimiters MUST
    // be passed as a range (std::string, std::string_view, etc.), not a
    // char literal, or you'll get either a compile error or (with a
    // single quoted char) just one separator character, not the string
    // you intended.
}
```

Because `join_with` is overloaded on whether the delimiter satisfies `range` or is a single element, a typo like passing `","` (a `const char*`, which IS a range of `char`) versus `','` (a single `char`) silently changes behavior rather than failing to compile — both are valid, but they mean different things.

---

#### Edge Case 5: `cartesian_product`'s Element Type Is a `tuple` of **References**, Not Values

```cpp
#include <ranges>
#include <vector>
#include <iostream>

int main() {
    std::vector<int> xs = {1, 2, 3};
    std::vector<int> ys = {10, 20};

    // ❌ BUG: binding by value copies out of the tuple, then mutating
    // 'x' has NO effect on the underlying 'xs' vector.
    for (auto [x, y] : std::views::cartesian_product(xs, ys)) {
        x += 100;   // modifies a local copy, not xs' elements
    }
    // xs is unchanged: {1, 2, 3}

    // ✅ To actually mutate through the product view, bind by reference:
    for (auto&& [x, y] : std::views::cartesian_product(xs, ys)) {
        x += 100;   // now modifies the real element in xs
    }
    // xs is now {101, 102, 103} -- NOTE: each x is visited |ys| times,
    // so it gets incremented once per (x, y) pair -- a common source of
    // "why did this get incremented twice?" bugs when the outer range
    // is mutated inside the loop.
}
```

The double-increment trap above is subtle: because `cartesian_product` revisits each element of the *first* range once per element of the *last* range, mutating through the view inside the loop body applies the mutation multiple times per original element — usually not what's intended for anything beyond read-only enumeration.

---

#### Edge Case 6: `views::repeat` Is Infinite by Default — Forgetting `take` Hangs the Program

```cpp
#include <ranges>
#include <iostream>

int main() {
    auto infinite = std::views::repeat(42);

    // ❌ HANGS: no bound, and range-for on an infinite view never terminates
    // for (int x : infinite) { std::cout << x; }

    // ❌ ALSO HANGS/OOMs: materializing an unbounded repeat view
    // auto v = infinite | std::ranges::to<std::vector<int>>();

    // ✅ Always pair unbounded repeat() with take() (or the 2-argument
    // repeat(value, count) overload) before consuming it fully:
    auto bounded = infinite | std::views::take(5);
    for (int x : bounded) std::cout << x << ' ';   // 42 42 42 42 42
}
```

Unlike `chunk`/`slide`/`zip` (which are always bounded by their inputs), `views::repeat(value)` with a single argument has no inherent end — it is meant purely as a building block for `zip`/`take`-style pipelines, never as something iterated to completion on its own. This is analogous to forgetting a loop bound with `while(true)`, but easier to miss because it's hidden behind a range adaptor that "looks like" every other bounded view in the pipeline.

---

#### Edge Case 7: Range Category Requirements — Not Every Adaptor Works on Single-Pass Input Ranges

```cpp
#include <ranges>
#include <sstream>
#include <iterator>

int main() {
    std::istringstream in("1 2 3 4 5");
    auto input_range = std::ranges::subrange(
        std::istream_iterator<int>(in), std::istream_iterator<int>());
    // input_range models input_range only -- single-pass, can't be re-read

    // ✅ chunk() works on a single-pass input_range: it only needs to move
    // forward through the elements once, grouping them as it goes.
    // for (auto g : input_range | std::views::chunk(2)) { ... }   // OK

    // ❌ slide(n) requires forward_range: it must keep n overlapping
    // positions "alive" simultaneously, which means being able to revisit
    // earlier elements -- impossible on a stream that can only be read once.
    // for (auto w : input_range | std::views::slide(2)) { ... }   // compile error
}
```

When an adaptor unexpectedly fails to compile over a custom range type, check which range concept it actually requires (`input_range` vs. `forward_range` vs. `bidirectional_range`) against what your range models — `chunk`, `zip`, and `join_with` are comparatively lenient (work with `input_range`), while `slide`, `adjacent`, and `chunk_by` need at least `forward_range` because their semantics inherently require revisiting elements.

---

### CODE_EXAMPLES: Practical Demonstrations

#### Example 1: Zipping Parallel Arrays (Names and Scores)

```cpp
#include <ranges>
#include <vector>
#include <string>
#include <iostream>

int main() {
    std::vector<std::string> names = {"Alice", "Bob", "Carol", "Dave"};
    std::vector<int> scores        = {92, 87, 95, 78};

    for (auto [name, score] : std::views::zip(names, scores)) {
        std::cout << name << ": " << score << '\n';
    }
}
```

**Output:**
```
Alice: 92
Bob: 87
Carol: 95
Dave: 78
```

---

#### Example 2: Day-Over-Day Deltas with `views::pairwise`

```cpp
#include <ranges>
#include <vector>
#include <iostream>

int main() {
    std::vector<double> closing_prices = {100.0, 102.5, 101.0, 105.25, 104.0};

    std::cout << "Daily change: ";
    for (auto [yesterday, today] : std::views::pairwise(closing_prices)) {
        std::cout << (today - yesterday) << ' ';
    }
}
```

**Output:**
```
Daily change: 2.5 -1.5 4.25 -1.25
```

---

#### Example 3: Batching a Flat Buffer for Processing with `chunk`

```cpp
#include <ranges>
#include <vector>
#include <iostream>

void process_batch(std::ranges::input_range auto&& batch) {
    std::cout << "Processing batch of ";
    std::cout << std::ranges::distance(batch) << " items: ";
    for (int x : batch) std::cout << x << ' ';
    std::cout << '\n';
}

int main() {
    std::vector<int> records(11);
    std::iota(records.begin(), records.end(), 1);   // 1..11

    for (auto batch : records | std::views::chunk(4)) {
        process_batch(batch);
    }
}
```

**Output:**
```
Processing batch of 4 items: 1 2 3 4
Processing batch of 4 items: 5 6 7 8
Processing batch of 3 items: 9 10 11
```

---

#### Example 4: Moving Average with `views::slide`

```cpp
#include <ranges>
#include <vector>
#include <numeric>
#include <iostream>

int main() {
    std::vector<double> readings = {10.0, 12.0, 11.0, 15.0, 14.0, 9.0};

    std::cout << "3-point moving average: ";
    for (auto window : readings | std::views::slide(3)) {
        double avg = std::accumulate(window.begin(), window.end(), 0.0) / 3.0;
        std::cout << avg << ' ';
    }
}
```

**Output:**
```
3-point moving average: 11 12.6667 13.3333 12.6667
```

---

#### Example 5: Grouping Consecutive Runs with `chunk_by`

```cpp
#include <ranges>
#include <vector>
#include <iostream>

int main() {
    // Server response codes over time -- group consecutive identical codes
    std::vector<int> status_codes = {200, 200, 200, 500, 500, 200, 404, 404};

    for (auto run : status_codes | std::views::chunk_by(std::equal_to{})) {
        std::cout << "[";
        for (int code : run) std::cout << code << ' ';
        std::cout << "] ";
    }
}
```

**Output:**
```
[200 200 200 ] [500 500 ] [200 ] [404 404 ]
```

---

#### Example 6: Joining a Vector of Strings with a Delimiter

```cpp
#include <ranges>
#include <vector>
#include <string>
#include <iostream>

int main() {
    std::vector<std::string> tags = {"c++23", "ranges", "views"};

    auto csv = tags | std::views::join_with(std::string{", "});

    std::string result(csv.begin(), csv.end());
    std::cout << result << '\n';
}
```

**Output:**
```
c++23, ranges, views
```

---

#### Example 7: Enumerating a Coordinate Grid with `cartesian_product`

```cpp
#include <ranges>
#include <vector>
#include <iostream>

int main() {
    std::vector<int> xs = {0, 1, 2};
    std::vector<int> ys = {0, 1};

    for (auto [x, y] : std::views::cartesian_product(xs, ys)) {
        std::cout << "(" << x << "," << y << ") ";
    }
}
```

**Output:**
```
(0,0) (0,1) (1,0) (1,1) (2,0) (2,1)
```

---

#### Example 8: Full Pipeline Ending in `ranges::to` (Filter → Transform → Materialize)

```cpp
#include <ranges>
#include <vector>
#include <iostream>

int main() {
    std::vector<int> raw = {3, 8, 4, 15, 6, 23, 9, 12};

    // ❌ C++20 equivalent required a manual copy loop:
    // std::vector<int> legacy;
    // for (int n : raw) if (n % 2 == 0) legacy.push_back(n * n);

    // ✅ C++23: filter, transform, and materialize in one declarative chain
    std::vector<int> result = raw
        | std::views::filter([](int n) { return n % 2 == 0; })
        | std::views::transform([](int n) { return n * n; })
        | std::ranges::to<std::vector<int>>();

    for (int n : result) std::cout << n << ' ';
}
```

**Output:**
```
64 16 36 144
```

---

---

### QUICK_REFERENCE: C++23 Ranges Adaptors Cheat Sheet

#### New C++23 Range Adaptors Summary

| Adaptor | Paper | Purpose | Example |
|---------|-------|---------|---------|
| `views::zip` | P2321 | Combine N ranges element-wise into tuples | `zip(names, ages)` |
| `views::zip_transform` | P2321 | Zip + apply a function to each tuple | `zip_transform(f, a, b)` |
| `views::adjacent<N>` | P2321 | Sliding tuple of N consecutive elements | `adjacent<2>(v)` |
| `views::pairwise` | P2321 | Alias for `adjacent<2>` | `pairwise(v)` |
| `views::adjacent_transform<N>` | P2321 | Adjacent + apply a function | `adjacent_transform<2>(v, f)` |
| `views::chunk` | P2442 | Fixed-size, non-overlapping windows | `chunk(v, 3)` |
| `views::slide` | P2442 | Fixed-size, overlapping windows | `slide(v, 3)` |
| `views::chunk_by` | P2443 | Group consecutive elements by predicate | `chunk_by(v, pred)` |
| `views::join_with` | P2441 | Flatten a range of ranges with a delimiter | `join_with(v, ", ")` |
| `views::cartesian_product` | P2374 | N-ary Cartesian product of ranges | `cartesian_product(a, b)` |
| `views::repeat` | P2374 | Infinite (or bounded) repetition of a value | `repeat(0) \| take(5)` |
| `views::stride` | — | Step over every Nth element | `stride(v, 2)` |
| `ranges::to<Container>()` | P1206 | Materialize any range into a container | `r \| ranges::to<std::vector<int>>()` |

#### Syntax Cheat Sheet

```cpp
namespace views = std::ranges::views;

// Zip + transform + materialize in one pipeline
auto totals = views::zip_transform(std::plus{}, prices, taxes)
            | std::ranges::to<std::vector<double>>();

// Sliding window average
auto averages = data
    | views::slide(3)
    | views::transform([](auto w) {
          return (w[0] + w[1] + w[2]) / 3.0;
      });

// Group + join with delimiter
auto csv_line = words
    | views::join_with(std::string_view{", "})
    | std::ranges::to<std::string>();

// Bounded infinite view
auto padded = views::repeat(0) | views::take(3);
```

#### Chunk vs. Slide at a Glance

| Input (size 5) | `chunk(2)` | `slide(2)` |
|-----------------|------------|------------|
| `[1,2,3,4,5]` | `[1,2] [3,4] [5]` (3 groups, last partial) | `[1,2] [2,3] [3,4] [4,5]` (4 overlapping windows) |

#### Common Patterns

**Parallel-array iteration:**
```cpp
for (auto [name, score] : views::zip(names, scores)) {
    std::cout << name << ": " << score << '\n';
}
```

**Batch processing:**
```cpp
for (auto batch : buffer | views::chunk(1024)) {
    process(batch);
}
```

**Collect a pipeline into a concrete container:**
```cpp
auto evens = data
    | views::filter([](int n) { return n % 2 == 0; })
    | std::ranges::to<std::vector<int>>();
```

**All coordinate pairs on a small grid:**
```cpp
for (auto [x, y] : views::cartesian_product(views::iota(0, w), views::iota(0, h))) {
    plot(x, y);
}
```

---

**End of Topic 2: C++23 Ranges Enhancements**
