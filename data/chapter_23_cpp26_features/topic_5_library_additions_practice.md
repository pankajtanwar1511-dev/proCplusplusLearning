## TOPIC: C++26 Library Additions - Linear Algebra, Data-Parallel Types, and Concurrency Utilities

### PRACTICE_TASKS: Bug Analysis Across linalg, inplace_vector, simd, and Lock-Free Reclamation

#### Q1
```cpp
#include <linalg>
#include <mdspan>
#include <vector>

void multiply_dynamic() {
    std::vector<double> a_data(6), b_data(6), c_data(9);

    // Dynamic extents -- shapes are runtime values, not part of the type.
    std::mdspan<double, std::dextents<std::size_t, 2>> A(a_data.data(), 3, 2);
    std::mdspan<double, std::dextents<std::size_t, 2>> B(b_data.data(), 3, 2);  // meant to be 2x3
    std::mdspan<double, std::dextents<std::size_t, 2>> C(c_data.data(), 3, 3);

    std::linalg::matrix_product(A, B, C);  // A is 3x2, B is 3x2 -- inner dims don't match!
}
```

**Answer:**
```
Compiles fine; fails (UB / precondition violation / implementation-defined error) only at runtime
```

**Explanation:**
- `A` is 3x2 and `B` is 3x2 -- for `A * B` to be valid, `B` needs to be 2xN (its row count must equal `A`'s column count)
- Both `A` and `B` use `dextents`, so they have the IDENTICAL `mdspan` type regardless of their actual runtime shape
- The compiler cannot see "3x2 times 3x2 is invalid" because the shapes aren't part of the type
- The mismatch is only detected (if at all) when `matrix_product` runs, as a runtime precondition violation
- **Key Concept:** With dynamic extents, `std::linalg` shape checking moves from compile time to runtime; only static extents give a type-level guarantee

**Fixed Version:**
```cpp
#include <linalg>
#include <mdspan>
#include <vector>

void multiply_dynamic_correct() {
    std::vector<double> a_data(6), b_data(6), c_data(9);

    std::mdspan<double, std::dextents<std::size_t, 2>> A(a_data.data(), 3, 2);
    std::mdspan<double, std::dextents<std::size_t, 2>> B(b_data.data(), 2, 3);  // now 2x3
    std::mdspan<double, std::dextents<std::size_t, 2>> C(c_data.data(), 3, 3);

    std::linalg::matrix_product(A, B, C);  // 3x2 * 2x3 = 3x3, correct
}
```

---

#### Q2
```cpp
#include <linalg>
#include <mdspan>
#include <vector>

void multiply_static() {
    std::vector<double> a_data(6), b_data(9), c_data(9);

    // Static extents -- shapes ARE part of the type.
    std::mdspan<double, std::extents<std::size_t, 3, 2>> A(a_data.data());
    std::mdspan<double, std::extents<std::size_t, 3, 3>> B(b_data.data());
    std::mdspan<double, std::extents<std::size_t, 3, 3>> C(c_data.data());

    std::linalg::matrix_product(A, B, C);  // A is 3x2, B is 3x3
}
```

**Answer:**
```
Ill-formed / rejected at compile time
```

**Explanation:**
- `A`'s type encodes "3 rows, 2 columns"; `B`'s type encodes "3 rows, 3 columns"
- A 3x2 times 3x3 product is mathematically invalid (inner dimensions 2 and 3 don't match)
- Because both shapes are template parameters (part of the type), the mismatch is visible to the compiler without running anything
- This is the exact scenario Edge Case 1 in the theory section contrasts with the dynamic-extents case above
- **Key Concept:** Static `mdspan` extents let `std::linalg` catch shape errors at compile time; this is a real safety advantage over raw pointer + manual index math, but only when extents are static

---

#### Q3
```cpp
#include <inplace_vector>

class RingBufferLike {
    std::inplace_vector<int, 4> buf_;
public:
    void add(int v) {
        buf_.push_back(v);  // ported from a std::vector<int> member
    }
};

int main() {
    RingBufferLike r;
    for (int i = 0; i < 10; ++i) {
        r.add(i);  // will this loop run to completion?
    }
}
```

**Answer:**
```
No -- throws / precondition violation on the 5th call to add() (i == 4)
```

**Explanation:**
- `buf_` has capacity 4 (fixed at compile time via the template parameter)
- The first four calls (`i = 0..3`) succeed, bringing `size()` to 4
- The 5th call (`i == 4`) calls `push_back` when `size() == capacity()` -- unlike `std::vector`, there is no reallocation fallback
- Depending on the exact member semantics, this is a thrown exception or a precondition violation, but either way `add()` cannot silently succeed past capacity
- **Key Concept:** `std::inplace_vector::push_back` past capacity is not "slower `std::vector`" -- it's a hard capacity ceiling by design

**Fixed Version:**
```cpp
#include <inplace_vector>

class RingBufferLike {
    std::inplace_vector<int, 4> buf_;
public:
    bool add(int v) {
        if (buf_.size() == buf_.capacity()) {
            return false;  // caller decides: drop, overwrite oldest, or reject
        }
        buf_.push_back(v);
        return true;
    }
};
```

---

#### Q4
```cpp
#include <inplace_vector>

struct SensorFrame {
    std::inplace_vector<float, 4096> samples;  // "just make it big enough"
    int frame_id;
};

void process(SensorFrame f) {  // passed BY VALUE
    // ...
}

int main() {
    SensorFrame frames[100];  // stack array of 100 frames
    // ...
}
```

**Answer:**
```
Compiles and may "work", but sizeof(SensorFrame) is roughly 16 KB, and frames[100] alone requests
~1.6 MB of stack space -- a likely stack overflow, plus process(f) copies ~16 KB per call
```

**Explanation:**
- `sizeof(std::inplace_vector<float, 4096>)` is proportional to `4096 * sizeof(float)` (~16 KB), regardless of how many samples are actually in use
- `SensorFrame frames[100]` therefore reserves roughly 1.6 MB on the stack -- far beyond typical default stack sizes on many platforms/threads
- Passing `SensorFrame` by value to `process()` also copies the entire ~16 KB inline buffer every call, even if only a few samples are populated
- With `std::vector<float>` instead, `sizeof(SensorFrame)` would stay small (a pointer + sizes) and the large buffer would live on the heap, not inline
- **Key Concept:** A large `N` in `inplace_vector<T, N>` is a fixed cost paid by every instance, everywhere it lives -- large capacities are a poor fit for types that are stack-allocated in bulk or passed/copied by value frequently

**Fixed Version:**
```cpp
#include <inplace_vector>
#include <memory>

void process(const SensorFrame& f) {  // pass by reference: no per-call copy
    // ...
}

int main() {
    // Heap-allocate the bulk array instead of putting 100 * 16 KB on the stack:
    auto frames = std::make_unique<SensorFrame[]>(100);
    // Or: reduce N to the realistic per-frame sample count and size the
    // container to the workload instead of "just make it big enough".
}
```

---

#### Q5
```cpp
#include <experimental/simd>
namespace stdx = std::experimental;

void add_eight(const float* a, const float* b, float* out) {
    using simd_t = stdx::fixed_size_simd<float, 8>;  // hard-coded width: 8

    simd_t va(a, stdx::element_aligned);
    simd_t vb(b, stdx::element_aligned);
    (va + vb).copy_to(out, stdx::element_aligned);
}

void process_buffer(const float* a, const float* b, float* out, std::size_t n) {
    for (std::size_t i = 0; i + 8 <= n; i += 8) {
        add_eight(a + i, b + i, out + i);
    }
    // no tail handling for n % 8 remaining elements
}
```

**Answer:**
```
Compiles and runs correctly for any n, but silently drops (never writes) the last (n % 8) elements
```

**Explanation:**
- `fixed_size_simd<float, 8>` explicitly requests width 8, so this particular bug isn't about *portability* of the width -- it's about the tail
- The loop condition `i + 8 <= n` stops as soon as fewer than 8 elements remain, and nothing after the loop handles those leftover elements
- For any `n` not a multiple of 8, the last `n % 8` entries of `out` are never written at all (left as whatever they were before the call)
- This is easy to miss in testing if test inputs happen to always be multiples of 8
- **Key Concept:** Any manually-chunked SIMD loop -- fixed-width or native-width -- needs an explicit scalar "tail" pass for the remainder; the width itself being hard-coded or queried is a separate concern from handling non-divisible `n`

**Fixed Version:**
```cpp
#include <experimental/simd>
namespace stdx = std::experimental;

void process_buffer_fixed(const float* a, const float* b, float* out, std::size_t n) {
    using simd_t = stdx::fixed_size_simd<float, 8>;
    constexpr std::size_t width = simd_t::size();

    std::size_t i = 0;
    for (; i + width <= n; i += width) {
        simd_t va(a + i, stdx::element_aligned);
        simd_t vb(b + i, stdx::element_aligned);
        (va + vb).copy_to(out + i, stdx::element_aligned);
    }
    for (; i < n; ++i) {          // scalar tail: handles n % width leftovers
        out[i] = a[i] + b[i];
    }
}
```

---

#### Q6
```cpp
#include <experimental/simd>
namespace stdx = std::experimental;

constexpr std::size_t LANES = 8;  // "I measured this on my laptop, AVX256 gives 8"

void scale(float* data, std::size_t n, float factor) {
    using simd_t = stdx::fixed_size_simd<float, LANES>;
    for (std::size_t i = 0; i + LANES <= n; i += LANES) {
        simd_t v(data + i, stdx::element_aligned);
        (v * factor).copy_to(data + i, stdx::element_aligned);
    }
}
```

**Answer:**
```
Correct on every platform, but leaves performance on the table on hardware whose native width isn't 8
(e.g. SSE-only: only using half of what a native_simd<float> could do; AVX-512: using half of its 16 lanes)
```

**Explanation:**
- `fixed_size_simd<float, 8>` is a valid, portable type -- it will compile and run correctly everywhere, this is NOT a correctness bug
- But hard-coding `LANES = 8` because "that's what AVX256 gave me" ties the code to one developer's hardware assumption
- On SSE-only hardware, `native_simd<float>::size()` might be 4 -- this code still "works" (the fixed-size type is emulated), but doesn't reflect the machine's actual native capability either way
- On AVX-512 hardware, `native_simd<float>::size()` might be 16 -- using a fixed width of 8 here leaves half the available per-instruction throughput unused
- **Key Concept:** Prefer `native_simd<T>` (and query `::size()`) when you want the implementation to pick the best width for the target; use a `fixed_size_simd<T, N>` deliberately only when a specific width is required by the algorithm itself (e.g. matching a fixed block size), not because it happened to match one development machine

---

#### Q7
```cpp
#include <hazard_pointer>  // conceptual; API sketch only

Node* fetch_and_use(std::atomic<Node*>& head) {
    auto hp = std::make_hazard_pointer();
    Node* n = hp.protect(head);
    return n;  // hp goes out of scope and is destroyed HERE, before the caller uses n
}

int main() {
    // ...
    Node* n = fetch_and_use(some_head);
    use(*n);  // is this safe?
}
```

**Answer:**
```
Not safe -- a race: n may already be freed by the time use(*n) runs
```

**Explanation:**
- `hp` is a local variable inside `fetch_and_use`; it is destroyed when the function returns, BEFORE `n` is returned to the caller
- The hazard pointer's protection lasts only as long as `hp` itself is alive -- once `hp` is destroyed, the hazard slot is cleared, and the reclaimer is free to consider `n` unprotected
- Returning the raw `Node*` after the protecting `hp` has already been destroyed hands the caller a pointer with no active guarantee against concurrent reclamation
- This is the mirror image of Edge Case 5 (forgetting to release) -- here the hazard is released too early relative to how the pointer is actually used
- **Key Concept:** A hazard pointer must remain alive for exactly as long as the protected pointer is being dereferenced; protection and pointer usage cannot be separated across a function boundary the way this code attempts

**Fixed Version:**
```cpp
#include <hazard_pointer>  // conceptual; API sketch only

void fetch_and_use(std::atomic<Node*>& head) {
    auto hp = std::make_hazard_pointer();
    Node* n = hp.protect(head);
    if (n) {
        use(*n);   // use happens WHILE hp is still alive and protecting n
    }
}  // hp destroyed here, after use(*n) has already completed safely
```

---

#### Q8
```cpp
// Conceptual sketch -- exact std::rcu API still being finalized in committee.
std::atomic<Config*> g_config{new Config{100}};

void update(int new_timeout) {
    Config* new_cfg = new Config{new_timeout};
    Config* old = g_config.exchange(new_cfg);
    delete old;  // reclaim old config
}

int read() {
    std::rcu_read_lock guard;
    return g_config.load()->timeout_ms;
}
```

**Answer:**
```
Use-after-free race: a reader that loaded `old` just before the exchange may still be dereferencing
it when update() deletes it
```

**Explanation:**
- `update()` swaps in the new config and immediately `delete`s the old one, with no grace-period wait
- A reader inside `read()` that called `g_config.load()` a moment before the `exchange()`, and is still executing `->timeout_ms` on the old pointer, now races against the `delete`
- RCU's entire safety guarantee depends on the writer waiting for proof that every reader active before the swap has exited its read-side critical section before reclaiming -- that wait is missing here
- This mirrors Edge Case 6 in the theory section exactly
- **Key Concept:** Never `delete`/reclaim the old RCU-protected object immediately after the pointer swap; always synchronize (wait for a grace period) first

**Fixed Version:**
```cpp
std::atomic<Config*> g_config{new Config{100}};

void update(int new_timeout) {
    Config* new_cfg = new Config{new_timeout};
    Config* old = g_config.exchange(new_cfg);
    std::rcu_synchronize();  // wait until no pre-existing reader can still hold `old`
    delete old;              // now provably safe
}

int read() {
    std::rcu_read_lock guard;
    return g_config.load()->timeout_ms;
}
```

---

#### Q9
```cpp
#include <hazard_pointer>  // conceptual; API sketch only
#include <atomic>

std::atomic<int> g_active_readers{0};

int read_value(std::atomic<Node*>& head) {
    g_active_readers.fetch_add(1);       // "protect" via a manual counter instead
    Node* n = head.load();
    int v = n ? n->value : 0;
    g_active_readers.fetch_sub(1);
    return v;
}

void reclaim(Node* old_node) {
    while (g_active_readers.load() > 0) { /* spin */ }
    delete old_node;  // "no one is reading right now, so this must be safe"
}
```

**Answer:**
```
Not safe in general -- a hand-rolled reader-count scheme is not equivalent to hazard pointers or RCU
and does not actually prove old_node specifically is unreferenced
```

**Explanation:**
- `g_active_readers` only tracks "how many threads are somewhere inside a read", not "which specific node(s) each of them currently holds a pointer to"
- `reclaim()` waiting for the counter to hit zero proves no thread is *currently* between the increment/decrement -- but says nothing about a thread that already loaded `old_node` earlier, decremented the counter, and is still about to dereference the stale pointer it captured (depending on exactly what "protect" is supposed to mean in this hand-rolled scheme, the semantics are underspecified)
- This is precisely the kind of ad hoc synchronization that hazard pointers (per-node protection) and RCU (grace-period-gated reclamation) are standardized to replace with a scheme that has an actual, provable safety argument
- **Key Concept:** Hazard pointers and RCU are not "just a reader counter" -- they encode specific, provable guarantees (a hazard pointer names an exact protected address; RCU's grace period specifically bounds pre-swap readers) that informal counting schemes generally don't provide

---

#### Q10
```cpp
#include <linalg>
#include <mdspan>
#include <vector>

void identity_check() {
    std::vector<double> a_data = {1, 0, 0, 1};  // 2x2 identity
    std::vector<double> x_data = {5.0, 7.0};
    std::vector<double> y_data(2, 0.0);

    std::mdspan<double, std::extents<std::size_t, 2, 2>> A(a_data.data());
    std::mdspan<double, std::extents<std::size_t, 2>> x(x_data.data());
    std::mdspan<double, std::extents<std::size_t, 2>> y(y_data.data());

    std::linalg::matrix_vector_product(A, x, y);
    // What is y_data after this call?
}
```

**Answer:**
```
y_data == {5.0, 7.0} -- no bug here, this is correct behavior
```

**Explanation:**
- `A` is the 2x2 identity matrix; `A * x` for the identity always yields `x` unchanged
- All extents here are static and consistent (2x2 times a 2-vector produces a 2-vector), so this compiles and runs exactly as a correct `std::linalg` call should
- Included as a contrast to Q1/Q2: not every `std::linalg` question is about a mismatch -- recognizing well-formed, correct usage is equally part of understanding the feature
- **Key Concept:** `std::linalg::matrix_vector_product` over correctly-shaped `mdspan` operands behaves exactly like the mathematical operation it names; there is no hidden gotcha when shapes genuinely agree

---

#### Q11
```cpp
#include <inplace_vector>

std::inplace_vector<int, 5> make_vec() {
    std::inplace_vector<int, 5> v;
    v.push_back(1);
    v.push_back(2);
    return v;  // returned by value
}

int main() {
    auto v = make_vec();
    // Does returning by value here heap-allocate anything?
}
```

**Answer:**
```
No -- no heap allocation occurs; the inline storage is copied/moved as part of the object itself
(guaranteed copy elision typically avoids even that copy in this exact pattern)
```

**Explanation:**
- `std::inplace_vector`'s storage lives inline inside the object -- there is no heap buffer to allocate or transfer ownership of, unlike `std::vector`
- Returning `v` by value either moves/copies the whole inline object (still zero heap allocations, just a memcpy-like transfer of up to `N` elements' worth of storage) or, under C++17's guaranteed copy elision rules for this exact "construct and return a local" pattern, is constructed directly in the caller's storage with no copy at all
- This is a meaningful contrast to `std::vector`, where returning by value is cheap specifically because of a heap-pointer move, not because there's no heap involved
- **Key Concept:** `inplace_vector`'s "no heap allocation" guarantee holds through copies/moves/returns too -- the trade-off is that a copy/move is `O(size)` (has to transfer the actual elements), whereas `std::vector`'s move is `O(1)` (just swaps a few pointers/sizes)

---

---
