## TOPIC: constexpr, consteval and Compile-Time Programming

### PRACTICE_TASKS: Output Prediction and Bug Hunting

#### Q1
```cpp
// Q: What does this print (GCC 11, -O0 and -O2 give the same answer)?
#include <iostream>
#include <type_traits>

constexpr int sq(int x) {
    if (std::is_constant_evaluated()) return -1;   // marks a compile-time evaluation
    return x * x;
}

int main() {
    constexpr int a = sq(10);
    int b = sq(10);
    const int n = 10;
    int c = sq(n);
    static int d = sq(10);
    const int e = sq(10);
    std::cout << a << ' ' << b << ' ' << c << ' ' << d << ' ' << e << '\n';
}
```

**Answer:**
```
-1 100 100 -1 -1
```

**Explanation:**
- `a`: a `constexpr` variable requires a constant: compile time.
- `b`: a plain local `int`: ordinary run-time call, even though the argument is a literal. At `-O2` the optimizer may fold `10 * 10`, but folding does not change what `is_constant_evaluated()` returns.
- `c`: `n` is a constant, but `c` is a non-const local: run time again. A constant argument does not make the call constant-evaluated.
- `d`: a static local is constant-initialized if possible, and that attempt is a constant evaluation.
- `e`: a `const int` with a constant initializer is usable in constant expressions, so its initializer is constant-evaluated. (`const double` would print 100.)
- **Key Concept:** The context of the call decides compile vs run time, never the arguments alone.

---

#### Q2
```cpp
// Q: Does this compile?
#include <iostream>

consteval int lot_size(int instrument_class) {
    return instrument_class == 0 ? 100 : 1;
}

int main(int argc, char**) {
    constexpr int equity_lot = lot_size(0);
    int dynamic_lot = lot_size(argc - 1);
    std::cout << equity_lot << ' ' << dynamic_lot << '\n';
}
```

**Answer:**
```
Compile error (GCC 11): 'argc' is not a constant expression
(in the call lot_size(argc - 1))
```

**Explanation:**
- Every call to a `consteval` function must be a constant expression. `lot_size(0)` is fine; `lot_size(argc - 1)` depends on a run-time value.
- With `constexpr` instead of `consteval` both lines would compile: the first at compile time, the second as a run-time call.
- Choose `consteval` only when run-time calls must be impossible.
- **Key Concept:** consteval has no run-time version; constexpr has both.

**Fixed Version:**
```cpp
#include <iostream>

constexpr int lot_size(int instrument_class) {
    return instrument_class == 0 ? 100 : 1;
}

int main(int argc, char**) {
    constexpr int equity_lot = lot_size(0);          // compile time
    int dynamic_lot = lot_size(argc - 1);            // run time
    std::cout << equity_lot << ' ' << dynamic_lot << '\n';   // 100 100 (no arguments)
}
```

---

#### Q3
```cpp
// Q: Which of the marked lines compile? (remove the failing ones and predict the output)
#include <iostream>

int global_qty = 5;

int main() {
    int local_qty = 7;
    constexpr int* p = &global_qty;          // (1)
    *p = 6;                                  // (2)
    constexpr const char* name = "order";    // (3)
    name = "trade";                          // (4)
    constexpr int* q = &local_qty;           // (5)
    std::cout << global_qty << ' ' << name << ' ' << *q << '\n';
}
```

**Answer:**
```
(1), (2), (3) compile. (4) and (5) do not:
(4) error: assignment of read-only variable 'name'
(5) error: '& local_qty' is not a constant expression
Without (4) and (5) (and *q removed from the output): 6 order
```

**Explanation:**
- `constexpr` applies to the pointer object: `p` is a constant pointer to a **non-const** `int`, so `*p = 6` is allowed.
- `name` is a constant pointer: reassigning the pointer fails, exactly as `const char* const` would.
- The address of a global (static storage) is a constant expression; the address of a local is not, because it differs per call and per thread.
- `static int local_qty = 7;` would make (5) valid.
- **Key Concept:** `constexpr T*` is a `T* const` initialized with a constant address; only static-storage addresses qualify.

---

#### Q4
```cpp
// Q: What does this print? Is there a warning?
#include <iostream>
#include <type_traits>

constexpr int checksum_mode() {
    if constexpr (std::is_constant_evaluated()) {
        return 1;          // "slow but constexpr-friendly" path
    } else {
        return 2;          // "fast run-time" path
    }
}

int main() {
    int mode = checksum_mode();      // a run-time call
    std::cout << mode << '\n';
}
```

**Answer:**
```
1
GCC 11 warning (with -Wall; none by default): 'std::is_constant_evaluated' always evaluates to true
in 'if constexpr' [-Wtautological-compare]
```

**Explanation:**
- The condition of `if constexpr` is itself a constant expression, evaluated during compilation, where `is_constant_evaluated()` is `true`. The `else` branch is discarded entirely.
- The run-time call therefore takes the "compile-time" path: in real code that means the slow algorithm on the hot path, silently.
- **Key Concept:** Test `is_constant_evaluated()` with a plain `if` (or use C++23 `if consteval`), never with `if constexpr`.

**Fixed Version:**
```cpp
#include <iostream>
#include <type_traits>

constexpr int checksum_mode() {
    if (std::is_constant_evaluated()) {
        return 1;
    } else {
        return 2;
    }
}

int main() {
    constexpr int at_compile_time = checksum_mode();
    int at_run_time = checksum_mode();
    std::cout << at_compile_time << ' ' << at_run_time << '\n';   // 1 2
}
```

---

#### Q5
```cpp
// Q: The tests below are compile-time. Do they pass? Find the bug.
#include <array>
#include <cstdio>

constexpr int sum_last(const std::array<int, 5>& a, int k) {
    int s = 0;
    for (int i = 5 - k; i <= 5; ++i) s += a[i];      // sum the last k elements
    return s;
}

constexpr std::array<int, 5> fills{10, 20, 30, 40, 50};
static_assert(sum_last(fills, 2) == 90);

int main() {
    std::printf("%d\n", sum_last(fills, 2));
}
```

**Answer:**
```
Compile error: non-constant condition for static assertion
error: array subscript value '5' is outside the bounds of array type '_Type'
{aka 'const int [5]'}   (GCC 11: the read of a[5] inside std::array::operator[])
```

**Explanation:**
- The loop condition `i <= 5` reads `a[5]`: one past the end. At run time this is silent undefined behaviour (it might even produce 90 by luck).
- During constant evaluation, UB must be diagnosed, so the `static_assert` turns the off-by-one into a compile error.
- **Key Concept:** `static_assert` tests of constexpr functions are a free UB detector for the inputs they cover.

**Fixed Version:**
```cpp
#include <array>
#include <cstdio>

constexpr int sum_last(const std::array<int, 5>& a, int k) {
    int s = 0;
    for (int i = 5 - k; i < 5; ++i) s += a[i];
    return s;
}

constexpr std::array<int, 5> fills{10, 20, 30, 40, 50};
static_assert(sum_last(fills, 2) == 90);

int main() {
    std::printf("%d\n", sum_last(fills, 2));   // 90
}
```

---

#### Q6
```cpp
// Q: Does this compile with default GCC settings?
#include <cstdio>

constexpr long long sum_to(long long n) {
    long long s = 0;
    for (long long i = 1; i <= n; ++i) s += i;
    return s;
}

constexpr long long total = sum_to(1'000'000);

int main() {
    std::printf("%lld\n", total);
}
```

**Answer:**
```
Compile error (GCC 11): 'constexpr' loop iteration count exceeds limit of 262144
(use '-fconstexpr-loop-limit=' to increase the limit)
```

**Explanation:**
- The constant evaluator is an interpreter with resource limits. GCC defaults: 262144 iterations per loop, depth 512, 33554432 operations overall.
- It does not fall back to run time for a `constexpr` variable: the initializer must be a constant, so the build fails.
- Options: raise the limit (`-fconstexpr-loop-limit=2000000`), use the closed form `n * (n + 1) / 2`, or compute at run time if the value is not needed as a constant.
- **Key Concept:** Compile-time evaluation has hard limits; heavy computation can break the build.

**Fixed Version:**
```cpp
#include <cstdio>

constexpr long long sum_to(long long n) { return n * (n + 1) / 2; }

constexpr long long total = sum_to(1'000'000);
static_assert(total == 500'000'500'000);

int main() {
    std::printf("%lld\n", total);   // 500000500000
}
```

---

#### Q7
```cpp
// Q: Does this build with -std=c++14 -O0? With -std=c++17?
#include <algorithm>
#include <iostream>

struct Limits {
    static constexpr int MaxQty = 100;
};

int main() {
    int requested = 5;
    std::cout << std::max(requested, Limits::MaxQty) << '\n';
}
```

**Answer:**
```
-std=c++14 -O0: link error: undefined reference to `Limits::MaxQty'
-std=c++17:     builds and prints 100
```

**Explanation:**
- `std::max` takes `const int&`. Binding a reference to `Limits::MaxQty` odr-uses it, which needs a definition with storage.
- In C++14 the in-class line is only a declaration; the definition `constexpr int Limits::MaxQty;` must appear in one .cpp file.
- In C++17 `static constexpr` data members are implicitly `inline`, so the in-class declaration is a definition.
- With `-O2` the C++14 build linked in this test: the optimizer inlined the value and removed the reference. The program is still wrong in C++14, the error just hides.
- **Key Concept:** static constexpr members are inline since C++17; before that, odr-use needs an out-of-class definition.

---

#### Q8
```cpp
// Q: Does this compile with GCC 13, -std=c++23?
#include <cstdio>
#include <vector>

constexpr std::vector<int> make_ticks() {
    std::vector<int> v;
    for (int i = 1; i <= 4; ++i) v.push_back(i * 5);
    return v;
}

constexpr std::vector<int> ticks = make_ticks();
constexpr int tick_sum = [] {
    int s = 0;
    for (int t : make_ticks()) s += t;
    return s;
}();

int main() {
    std::printf("%zu %d\n", ticks.size(), tick_sum);
}
```

**Answer:**
```
Compile error on the 'ticks' line: ... is not a constant expression because it refers to
a result of 'operator new'
(The tick_sum line alone is fine.)
```

**Explanation:**
- C++20 allows `std::vector` inside constant evaluation (libstdc++ since GCC 12), but only **transient** allocations: memory must be freed before the evaluation ends.
- `ticks` would keep the heap buffer alive into run time, which is not allowed.
- `tick_sum` creates, uses and destroys the vector within one evaluation and keeps only an `int`.
- To keep the elements, copy them into a `std::array<int, 4>`.
- **Key Concept:** Compile-time allocations must not escape; keep results in `std::array` or scalars.

**Fixed Version:**
```cpp
#include <array>
#include <cstdio>
#include <vector>

constexpr std::vector<int> make_ticks() {
    std::vector<int> v;
    for (int i = 1; i <= 4; ++i) v.push_back(i * 5);
    return v;
}

constexpr auto ticks = [] {
    std::array<int, 4> a{};
    auto v = make_ticks();
    for (std::size_t i = 0; i < a.size(); ++i) a[i] = v[i];
    return a;
}();

int main() {
    std::printf("%zu %d\n", ticks.size(), ticks.back());   // 4 20
}
```

---

#### Q9
```cpp
// Q: Which static_assert fails, and why?
#include <iostream>

int main() {
    auto sq = [](int x) { return x * x; };
    static_assert(sq(4) == 16);                       // (1)

    int factor = 2;
    auto scale = [factor](int x) { return x * factor; };
    static_assert(scale(2) == 4);                     // (2)

    std::cout << sq(3) + scale(3) << '\n';
}
```

**Answer:**
```
(1) passes. (2) fails:
error: non-constant condition for static assertion
error: the value of 'scale' is not usable in a constant expression
```

**Explanation:**
- Since C++17 a lambda's call operator is implicitly `constexpr` when it satisfies the rules, so `sq(4)` can be evaluated at compile time (the closure has no state).
- `scale` captured a copy of the run-time variable `factor`; the closure object `scale` is an ordinary non-constexpr local, so reading its member during constant evaluation is not allowed.
- `constexpr int factor = 2;` with `constexpr auto scale = ...` would make (2) pass.
- **Key Concept:** A constexpr call operator is not enough; every object read during the evaluation must itself be usable in constant expressions.

---

#### Q10
```cpp
// Q: Which declarations compile?
#include <array>
#include <iostream>

int main() {
    const int levels = 3;
    const double ratio = 3.0;
    int depth = 3;

    std::array<int, levels> a{};                              // (1)
    std::array<int, static_cast<int>(ratio)> b{};             // (2)
    std::array<int, depth> c{};                               // (3)
    std::cout << a.size() << b.size() << c.size() << '\n';
}
```

**Answer:**
```
Only (1) compiles.
(2) error: the value of 'ratio' is not usable in a constant expression
    ('ratio' was not declared 'constexpr')
(3) error: the value of 'depth' is not usable in a constant expression
```

**Explanation:**
- A `const` variable of **integral** (or enumeration) type initialized with a constant is usable in constant expressions: a C++98 rule that still applies.
- A `const double` never is, even with a literal initializer. `constexpr double ratio = 3.0;` fixes (2).
- `depth` is not const at all.
- **Key Concept:** Use `constexpr` for every compile-time constant; the `const int` special case does not extend to other types.

---

#### Q11
```cpp
// Q: Does this compile with -std=c++20? With -std=c++23 (GCC 13)? What does it print?
#include <cstdio>

constexpr int next_order_id() {
    static int counter = 0;          // only meaningful at run time
    return ++counter;
}

int main() {
    next_order_id();
    std::printf("%d\n", next_order_id());
}
```

**Answer:**
```
-std=c++20: error: 'counter' declared 'static' in 'constexpr' function (GCC 11)
            ("... only available with '-std=c++2b'" on GCC 13)
-std=c++23: compiles (P2242) and prints 2
```

**Explanation:**
- Up to C++20 a constexpr function body may not contain `static` or `thread_local` variable definitions at all.
- C++23 (P2242) allows them as long as they are not reached during constant evaluation. Run-time calls work normally; `constexpr int x = next_order_id();` would still fail.
- Practical use: constexpr functions with a run-time-only cache or a lazily built table on the non-constant path.
- C++23 also allows `static constexpr` locals in constexpr functions (P2647), the natural place for a lookup table.
- **Key Concept:** C++23 relaxes what a constexpr function may contain, not what constant evaluation may do.

---

#### Q12
```cpp
// Q: Does this compile?
#include <iostream>

consteval int twice(int x) { return 2 * x; }

int apply(int (*fn)(int), int v) { return fn(v); }

int main() {
    std::cout << twice(21) << '\n';
    std::cout << apply(&twice, 21) << '\n';
}
```

**Answer:**
```
Compile error (GCC 11): taking address of an immediate function 'consteval int twice(int)'
```

**Explanation:**
- A `consteval` function has no run-time incarnation, so its address cannot be passed into run-time code (here as a function pointer).
- `twice(21)` on the first line is fine: a constant expression evaluated at compile time.
- If a callable must be usable at run time, make it `constexpr`; if compile time must be guaranteed for some uses, add a `consteval` wrapper around a `constexpr` implementation.
- **Key Concept:** consteval functions can be called only in constant evaluation and their address cannot escape into run-time code.

**Fixed Version:**
```cpp
#include <iostream>

constexpr int twice(int x) { return 2 * x; }

int apply(int (*fn)(int), int v) { return fn(v); }

int main() {
    static_assert(twice(21) == 42);
    std::cout << apply(&twice, 21) << '\n';   // 42
}
```

---
