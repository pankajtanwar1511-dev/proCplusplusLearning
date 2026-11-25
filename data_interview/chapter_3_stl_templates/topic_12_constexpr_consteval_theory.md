## TOPIC: constexpr, consteval and Compile-Time Programming

### THEORY_SECTION: Core Concepts

#### 1. Mental model
- The compiler contains an **interpreter** for a subset of C++ (constant evaluation). Some expressions **must** be evaluated by it (array bounds, template arguments, `static_assert`, `case` labels, `constexpr` variable initializers); everything else is ordinary code that runs on the CPU.
- The keywords control eligibility and requirements, not "speed":

| Keyword | Applies to | Meaning |
|---|---|---|
| `constexpr` (variable) | Variables | Must be initialized by a constant expression; implicitly `const`; usable in constant expressions |
| `constexpr` (function) | Functions, lambdas, constructors | **May** be evaluated at compile time when called in a constant-expression context; otherwise a normal run-time call |
| `consteval` (C++20) | Functions | **Must** be evaluated at compile time: every call is an immediate invocation |
| `constinit` (C++20) | Static / thread-local variables | Must be constant-initialized; the variable stays **mutable** |

- A `constexpr` function is a promise "this can be computed at compile time for suitable arguments", not a request "compute it at compile time if possible". Whether a given call is compile-time is decided by the **context** of the call.
- Optimizers also fold constants at `-O2`, but that is unrelated to the language rules: it is not guaranteed, it does not change `std::is_constant_evaluated()`, and it cannot make a value usable as a template argument.

#### 2. constexpr variables
- `constexpr T x = init;` requires:
  - `T` is a **literal type** (scalars, references, arrays of literal types, classes with a `constexpr` constructor and a trivial or `constexpr` destructor).
  - `init` is a constant expression. Otherwise: "the value of 'n' is not usable in a constant expression" or "call to non-'constexpr' function".
- Implicitly `const`: assigning later fails ("assignment of read-only variable").
- At namespace scope a `constexpr` variable has internal linkage (like `const`): each translation unit gets its own copy. Use `inline constexpr` (C++17) in headers for one shared object.
- Pointers: `constexpr` applies to the pointer, not to the pointee.
  - `constexpr const char* s = "hi";` constant pointer to constant chars.
  - `constexpr int* p = &global;` valid (address of a static-storage object is a constant), and `*p = 6;` is allowed: the `int` is not const.
  - `constexpr int* p = &local;` fails: the address of an automatic variable is not a constant expression.
- `const int n = 10;` (integral, constant initializer) is also usable in constant expressions; `const double d = 1.5;` is not. `constexpr` removes that special case: use it for every compile-time constant.

#### 3. constexpr functions: when do they run at compile time?
- A call to a `constexpr` function is evaluated at compile time **only** when it appears in a context that is manifestly constant-evaluated:

| Context | Compile time guaranteed? |
|---|---|
| `constexpr int a = f();` | Yes |
| `static_assert(f() == 3);` | Yes |
| `std::array<int, f()>`, `int arr[f()]`, template argument `X<f()>` | Yes |
| `case f():`, enumerator `= f()`, `alignas(f())`, `if constexpr (f())` | Yes |
| `const int c = f();` (integral or enum type) | Tried first, like static init: if `f()` is a constant, `c` is usable in constant expressions; otherwise a run-time call |
| `static int s = f();` / global `int g = f();` | Constant initialization is tried first; succeeds if `f()` is a constant |
| `int b = f();` (local, non-const) | **No**: ordinary run-time call (may be folded by the optimizer) |
| `f(runtime_value)` | No; cannot be |

- Parameters are **never** constant expressions inside the function body, even when the call is compile-time: `constexpr int f(int n) { std::array<int, n> a; ... }` fails with "'n' is not a constant expression". Pass compile-time values as template parameters instead.
- `constexpr` functions are implicitly `inline`: define them in headers.
- A `constexpr` function that can never produce a constant (it always calls a non-`constexpr` function): before C++23 the program is ill-formed, no diagnostic required (GCC 11 diagnoses some cases, e.g. a `std::cin` read: "call to non-'constexpr' function"). C++23 (P2448, also applied by GCC 13 in `-std=c++20`) drops the rule: it is only an error when such a call is actually constant-evaluated.

#### 4. How constexpr grew, standard by standard

| Standard | What became allowed in constexpr functions / evaluation |
|---|---|
| C++11 | A single `return` statement (recursion and `?:` for logic); constexpr constructors with empty bodies; member functions implicitly `const` |
| C++14 | Local variables, loops, `if`/`switch`, multiple statements, mutation of local objects; member functions no longer implicitly `const` |
| C++17 | `constexpr` lambdas (implicit when possible), `if constexpr`, `inline` variables (static constexpr members implicitly inline), more of the library (`std::array`, `std::string_view`, `std::char_traits`) |
| C++20 | `consteval`, `constinit`, `std::is_constant_evaluated()`; virtual functions, `dynamic_cast`, `typeid`; `try`/`catch` blocks (a `throw` still cannot be evaluated); changing the active union member; uninitialized locals (`int x;` if never read before assignment); `new`/`delete` with **transient** allocation; constexpr `std::vector`, `std::string`, most `<algorithm>` |
| C++23 | `if consteval`; `static` and `thread_local` locals, `goto` and labels in constexpr functions (only if not evaluated at compile time); `static constexpr` locals; relaxed "must be able to produce a constant" rule (P2448); constexpr `std::unique_ptr`, `std::bitset`, `<cmath>` parts (`std::abs`, `fmin`, ...) |
| C++26 | Placement new in constant evaluation, constexpr exceptions (P3068), more containers and algorithms |

- Library support lags: libstdc++ made `std::vector` and `std::string` constexpr in GCC 12; GCC 11 accepts the C++20 language features but not those library parts.

#### 5. What constant evaluation forbids
- Any **undefined behaviour** in the evaluated path: signed overflow, out-of-bounds access, null dereference, reading an uninitialized variable, reading an object outside its lifetime, invalid pointer arithmetic, division by zero. The compiler must diagnose it, so a compile-time test is a free UB detector for the inputs you test.
- Calls to non-`constexpr` functions (I/O, `malloc`, most C APIs), `reinterpret_cast`, inline assembly, evaluating a `throw` (until C++26), modifying an object that was not created during this evaluation (e.g. a global).
- Non-transient allocation: memory allocated with `new` (or by `std::vector`, `std::string`) during constant evaluation must be freed before the evaluation ends. `constexpr std::vector<int> v{1, 2};` fails: "is not a constant expression because it refers to a result of 'operator new'". Copy results into a `std::array` instead.
- Implementation limits (GCC defaults): recursion depth 512 (`-fconstexpr-depth`), 262144 loop iterations per loop (`-fconstexpr-loop-limit`), 33554432 operations in total (`-fconstexpr-ops-limit`). Exceeding them is a compile error, not a fallback to run time.

#### 6. consteval: immediate functions
- Every call to a `consteval` function must produce a constant at compile time; calling it with a run-time value is an error ("the value of 'n' is not usable in a constant expression").
- Use cases:
  - Guarantee compile-time evaluation without forcing the caller to write `constexpr auto x = ...` (e.g. hashes of string literals used as IDs).
  - Validate arguments at compile time: a `consteval` constructor can reject a malformed format string or symbol code; `std::format` (C++20) checks format strings this way.
  - Remove the function from the binary entirely: no run-time symbol exists.
- Restrictions: you cannot take its address outside an immediate context ("taking address of an immediate function"), and a `constexpr` function cannot call it with its own (run-time) parameters unless the call is in an `if consteval` branch.
- C++23 P2564 ("consteval needs to propagate up", GCC 14) lets some constexpr functions that call consteval functions become immediate automatically; the basic rule above is what interviews expect.

#### 7. std::is_constant_evaluated() and if consteval
- `std::is_constant_evaluated()` (C++20, `<type_traits>`) returns `true` when the current evaluation is manifestly constant-evaluated. It lets one function choose a compile-time-friendly algorithm and a run-time-fast one (e.g. a loop vs a SIMD intrinsic or `memcpy`).
- Trap 1: `if constexpr (std::is_constant_evaluated())` is **always true**: the `if constexpr` condition is itself a constant-evaluated context. GCC warns: "'std::is_constant_evaluated' always evaluates to true in 'if constexpr'".
- Trap 2: `if (std::is_constant_evaluated()) return consteval_fn(x);` does not compile: the call to the consteval function is still checked as an immediate invocation with a non-constant `x`.
- `if consteval { ... } else { ... }` (C++23) fixes both: the first branch is an immediate function context, so it may call consteval functions with the parameters; no `<type_traits>` include needed. `if !consteval` also exists.
- Its result depends on the **context**, not on the optimization level: in `int b = where();` it is `false` at `-O0` and at `-O2`.

#### 8. constinit and static constexpr data members
- `constinit` (C++20): a static or thread-local variable must be constant-initialized (no dynamic initialization, no static-initialization-order problem), but stays modifiable. `constinit int x = f();` is an error unless `f()` is a constant expression. Not allowed on automatic locals; allowed on `static` locals and `thread_local`. Full treatment (initialization order, function-local statics, TLS): Memory & Ownership, topic 01.
- `constinit` is not a thread-safety tool: it fixes *when* the initial value is set; concurrent `++x` is still a data race (use `constinit std::atomic<int>`).
- `static constexpr` data members:
  - C++11/14: `struct S { static constexpr int N = 5; };` is only a declaration. Using it by value (`int a = S::N;`) is fine, but **odr-using** it (binding to `const int&`, taking its address, passing to `std::max` or `push_back(const T&)`) needs an out-of-class definition `constexpr int S::N;` in one .cpp, or the link fails with "undefined reference to 'S::N'".
  - C++17: `static constexpr` members are implicitly `inline`: the in-class declaration is the definition; no out-of-class definition needed (it is redundant and deprecated).

#### 9. Compile-time tables and the cost trade-off
- A `constexpr` function filling a `std::array` (lookup tables, CRC tables, bit-count tables, perfect hashes for known keys) runs at compile time and lands in read-only data: no start-up cost, no static-initialization order issue, and the table can be `static_assert`-tested.
- Patterns:
  - `constexpr auto table = make_table();` at namespace scope or `static constexpr` in a function (C++23 for function-local in constexpr functions).
  - Hash of string literals with a `consteval` function to get compile-time IDs usable in `case` labels.
  - `std::array` results instead of `std::vector` (no allocation can escape constant evaluation).
- Costs:
  - Compile time: the constant evaluator is an interpreter, typically far slower than running the same code natively (it interprets every step); large tables slow builds and can hit the ops limit.
  - Binary size: every table is stored in the executable; a 1 MB table is 1 MB of `.rodata`.
  - Debuggability: no breakpoints inside constant evaluation; write the function so it can also be called and tested at run time.
- Low-latency angle: moving work from run time to compile time removes it from the hot path entirely (configuration constants, dispatch tables, bit masks), and `static_assert` protects layout assumptions (`sizeof`, field offsets) at build time.

#### 10. Misconceptions to unlearn
- ❌ "A `constexpr` function is evaluated at compile time." ✅ Only in contexts that require a constant expression; elsewhere it is a normal function call.
- ❌ "The compiler tries compile time and silently falls back to run time." ✅ There is no "try" in the rules; the context decides. Constant folding by the optimizer is a separate, unguaranteed thing.
- ❌ "`constexpr` and `const` are the same." ✅ `const` = not modifiable (initializer may run at run time); `constexpr` = known at compile time (and const).
- ❌ "`consteval` is just a stricter `constexpr`." ✅ It is a different kind of function: no run-time version exists, its address cannot escape, and every call must be constant.
- ❌ "`constinit` means constant." ✅ It means "initialized at compile time"; the variable is mutable.
- ❌ "Inside a constexpr function called at compile time, my parameter is a constant expression." ✅ Parameters never are; use template parameters.
- ❌ "`if constexpr (std::is_constant_evaluated())` selects the compile-time path." ✅ It is always true; use plain `if` or C++23 `if consteval`.
- ❌ "C++20 lets me have a `constexpr std::vector` global." ✅ Only transient allocations: the vector must be destroyed before constant evaluation ends.
- ❌ "UB in a constexpr function is caught at compile time." ✅ Only for the evaluations that actually happen at compile time; the same call at run time is ordinary UB.
- ❌ "More constexpr is always better." ✅ It shifts cost to compile time and binary size; use it where the value is truly static.

### EDGE_CASES: Traps and Misconceptions

#### Edge Case 1: The same call is compile-time in one line and run-time in the next
- With `constexpr int where() { return std::is_constant_evaluated() ? 1 : 0; }`:

| Declaration | `where()` evaluated at |
|---|---|
| `constexpr int a = where();` | Compile time (1) |
| `int b = where();` (local) | Run time (0), even at `-O2` |
| `const int c = where();` | Compile time (1): const integral with a constant initializer is usable in constant expressions |
| `const double e = where();` | Run time (0): a `const double` is not usable in constant expressions |
| `static int d = where();` / global `int g = where();` | Compile time (1): constant initialization |
| `std::array<int, where() + 1>` | Compile time (size 2) |

- The `const int` vs `const double` difference surprises most people: it is the C++98 rule that integral `const` variables with constant initializers are constants.

#### Edge Case 2: Function parameters are never constant expressions
- `constexpr std::size_t f(std::size_t n) { std::array<int, n> a{}; return a.size(); }` does not compile ("'n' is not a constant expression"), even if every call is `f(3)` in a constant context.
- The function body must be valid for run-time calls too, where `n` is unknown.
- Fix: make it a template parameter: `template <std::size_t N> constexpr std::size_t f() { std::array<int, N> a{}; ... }`, or return a value computed with `n` without using it as a type parameter.
- `static_assert(n > 0)` inside the function fails for the same reason; check with `if (n == 0) throw ...;` (a throw evaluated at compile time is a compile error, a free check) or use `consteval`.

#### Edge Case 3: is_constant_evaluated inside if constexpr
- `if constexpr (std::is_constant_evaluated())` is always `true` because the `if constexpr` condition is itself manifestly constant-evaluated. The run-time branch is discarded.
- GCC warns with `-Wall` (not by default): "'std::is_constant_evaluated' always evaluates to true in 'if constexpr' [-Wtautological-compare]".
- Same trap in `static_assert(std::is_constant_evaluated())` (always passes) and in template arguments.
- Use plain `if (std::is_constant_evaluated())` or C++23 `if consteval`.

#### Edge Case 4: Calling a consteval function from a constexpr function
- `constexpr int f(int x) { if (std::is_constant_evaluated()) return twice(x); return x; }` with `consteval int twice(int)` fails: "'x' is not a constant expression" (GCC 13). The call `twice(x)` is checked as an immediate invocation regardless of the surrounding `if`.
- `if consteval { return twice(x); } else { return x; }` (C++23) compiles: inside the consteval branch, the parameters may be passed to immediate functions.
- GCC 14 implements P2564: the error message changes ("call to consteval function 'twice(x)' is not a constant expression"), but the plain-`if` version still fails when `f` is also called at run time.

#### Edge Case 5: UB, throw and limits are compile errors, not silent fallbacks
- In a constant evaluation: `INT_MAX + 1` → "overflow in constant expression"; `arr[3]` on `int arr[3]` → "array subscript value '3' is outside the bounds"; `*nullptr` → "dereferencing a null pointer"; reading an uninitialized local → "the value of 'x' is not usable in a constant expression".
- A `throw` on the evaluated path → "expression '<throw-expression>' is not a constant expression" (until C++26). Useful as a compile-time assertion inside a constexpr function.
- 1,000,000 iterations of one loop → "'constexpr' loop iteration count exceeds limit of 262144"; deep recursion → "evaluation depth exceeds maximum of 512"; huge total work → "operation count exceeds limit of 33554432" (GCC defaults, adjustable with `-fconstexpr-loop-limit`, `-fconstexpr-depth`, `-fconstexpr-ops-limit`).
- None of these silently turn into run-time computation for a `constexpr` variable: the program does not compile.

#### Edge Case 6: constexpr pointers and references
- `constexpr` makes the **pointer** constant: `constexpr int* p = &g;` then `*p = 6;` compiles (if `g` is a non-const global) but `p = &h;` does not.
- `constexpr int* p = &local;` fails: "'& local' is not a constant expression". The address of an automatic variable differs per call; only static-storage addresses are constants. `static int local;` would work.
- `constexpr const char* name = "order";` is fine (string literals have static storage).
- A `constexpr` reference must bind to a static-storage object: `constexpr const int& r = 42;` at namespace scope works (the temporary gets static storage), the same inside a function does not.

#### Edge Case 7: static constexpr members and the C++14 link error
- `struct Limits { static constexpr int Max = 100; };` then `std::max(x, Limits::Max)` or `v.push_back(Limits::Max)` binds `const int&` to `Max`: an **odr-use**.
- C++14: "undefined reference to 'Limits::Max'" at link time (sometimes only at `-O0`, because the optimizer may inline the value and remove the reference).
- C++17: `static constexpr` data members are implicitly `inline`; it links. Prefer C++17, or write `int(Limits::Max)` / `+Limits::Max` to pass a prvalue copy in old code.

#### Edge Case 8: A constexpr function that can never be constant
- `constexpr int read_qty() { int x = 0; std::cin >> x; return x; }` can never be constant-evaluated.
- C++11 to C++20: ill-formed, no diagnostic required. GCC 11 diagnoses this one at the definition ("call to non-'constexpr' function"), but not every variant (a `std::scanf` version passed silently).
- C++23 (P2448): allowed; it is only an error if a call is actually constant-evaluated. GCC 13 accepts it even with `-std=c++20` (treated as a defect fix).
- Practical rule: do not mark functions `constexpr` unless you test at least one compile-time call (`static_assert`), otherwise the keyword promises nothing.

#### Edge Case 9: constexpr containers must not leak out of constant evaluation
- C++20 allows `std::vector`/`std::string` inside a constexpr function (GCC 12+): build, sort, accumulate, return a scalar or an `std::array`.
- `constexpr std::vector<int> v{1, 2};` fails (GCC 13): the allocation would have to survive into run time. Same for returning a `std::string` into a `constexpr std::string` variable.
- Pattern: compute size first, then copy into `std::array<T, N>` (two-pass), or return a fixed-capacity structure.

### CODE_EXAMPLES: Practical Demonstrations

#### Example 1: Where does the call actually run?
- `std::is_constant_evaluated()` reports the context of each call.
```cpp
#include <array>
#include <cstdio>
#include <type_traits>

constexpr int where() { return std::is_constant_evaluated() ? 1 : 0; }

int g = where();                          // static storage: constant initialization

int main() {
    constexpr int a = where();            // required constant
    int b = where();                      // ordinary run-time call
    const int c = where();                // const integral: usable in constant exprs
    static int d = where();               // static local: constant initialization
    const double e = where();             // const double: NOT usable in constant exprs
    std::array<int, where() + 1> arr{};   // template argument
    std::printf("a=%d b=%d c=%d d=%d e=%g arr=%zu g=%d\n", a, b, c, d, e, arr.size(), g);
}
```
- Output (same at `-O0` and `-O2`):
```
a=1 b=0 c=1 d=1 e=0 arr=2 g=1
```
- `b` and `e` are run-time calls even though the arguments are known: the language does not require a constant there. The optimizer may fold the arithmetic, but `is_constant_evaluated()` still reports `false`.

#### Example 2: A compile-time lookup table
- A CRC-32 table computed by a `constexpr` function, verified with `static_assert`, used at run time with zero start-up cost.
```cpp
#include <array>
#include <cstdint>
#include <cstdio>
#include <string_view>

constexpr std::array<std::uint32_t, 256> make_crc_table() {
    std::array<std::uint32_t, 256> t{};
    for (std::uint32_t i = 0; i < 256; ++i) {
        std::uint32_t c = i;
        for (int k = 0; k < 8; ++k)
            c = (c & 1) ? (0xEDB88320u ^ (c >> 1)) : (c >> 1);
        t[i] = c;
    }
    return t;
}

constexpr auto crc_table = make_crc_table();       // computed by the compiler
static_assert(crc_table[1] == 0x77073096u);        // known reference value

constexpr std::uint32_t crc32(std::string_view s) {
    std::uint32_t c = 0xFFFFFFFFu;
    for (unsigned char ch : s) c = crc_table[(c ^ ch) & 0xFFu] ^ (c >> 8);
    return c ^ 0xFFFFFFFFu;
}

static_assert(crc32("123456789") == 0xCBF43926u);  // standard CRC-32 check value

int main(int argc, char** argv) {
    std::string_view input = argc > 1 ? argv[1] : "hello world";
    std::printf("crc32(\"%.*s\") = %08x\n",
                int(input.size()), input.data(), crc32(input));
}
```
- Output (no argument):
```
crc32("hello world") = 0d4a1185
```
- `crc_table` is in read-only data: no initialization code runs at start-up, and the `static_assert`s fail the build if the table logic breaks.
- `crc32` is used both at compile time (the check value) and at run time (user input): one implementation, tested by the compiler.

#### Example 3: The constant evaluator as a UB detector
- Run tests in `static_assert`: any UB on the evaluated path is a compile error.
```cpp
#include <climits>
#include <cstdio>

constexpr int midpoint_bad(int a, int b) { return (a + b) / 2; }        // overflows
constexpr int midpoint_ok(int a, int b) { return a + (b - a) / 2; }     // for a <= b

constexpr int sum_first(const int* p, int n) {
    int s = 0;
    for (int i = 0; i <= n; ++i) s += p[i];     // off by one: reads p[n]
    return s;
}

constexpr int data[3] = {1, 2, 3};

static_assert(midpoint_ok(INT_MAX - 2, INT_MAX) == INT_MAX - 1);
// static_assert(midpoint_bad(INT_MAX - 2, INT_MAX) == INT_MAX - 1);
//   error: overflow in constant expression
// static_assert(sum_first(data, 3) == 6);
//   error: array subscript value '3' is outside the bounds of array 'data'

int main() {
    std::printf("%d %d\n", midpoint_ok(2, 8), midpoint_bad(2, 8));
}
```
- Output:
```
5 5
```
- Uncommenting either `static_assert` makes the build fail with the quoted GCC 11 message.
- The guarantee covers only the inputs you evaluate at compile time; at run time `midpoint_bad(INT_MAX - 2, INT_MAX)` is ordinary silent UB.

#### Example 4: consteval for compile-time IDs and validation
- A `consteval` FNV-1a hash turns string literals into integer IDs usable in `case` labels; a `consteval` constructor rejects bad symbols at compile time.
```cpp
#include <cstdint>
#include <cstdio>
#include <string_view>

constexpr std::uint64_t fnv1a(std::string_view s) {   // usable at run time too
    std::uint64_t h = 1469598103934665603ull;           // FNV-1a 64-bit offset basis
    for (char c : s) { h ^= static_cast<unsigned char>(c); h *= 1099511628211ull; }
    return h;
}

// compile time only:
consteval std::uint64_t msg_id(std::string_view s) { return fnv1a(s); }

struct Symbol {
    char code[8]{};
    consteval Symbol(const char* s) {
        int n = 0;
        for (; s[n] != '\0'; ++n) {
            if (n >= 7 || s[n] < 'A' || s[n] > 'Z')
                throw "invalid symbol";      // becomes a compile error
            code[n] = s[n];
        }
    }
};

const char* dispatch(std::string_view name) {
    switch (fnv1a(name)) {
        case msg_id("NewOrder"): return "handle new order";
        case msg_id("Cancel"):   return "handle cancel";
        default:                 return "unknown";
    }
}

int main() {
    constexpr Symbol s = "ABC";
    // constexpr Symbol bad = "abc1";
    //   error: expression '<throw-expression>' is not a constant expression
    std::printf("%s | %s | %s\n", dispatch("Cancel"), dispatch("Heartbeat"), s.code);
}
```
- Output:
```
handle cancel | unknown | ABC
```
- The "consteval wrapper" pattern: one `constexpr` implementation (`fnv1a`) for both worlds, plus a `consteval` front end (`msg_id`) that guarantees compile-time evaluation. `msg_id` has no run-time code; `msg_id(name)` with the run-time `name` would not compile.
- The `throw` inside a `consteval` constructor is the classic way to produce a compile-time error with a message (before C++26 static_assert with computed messages).

#### Example 5: if consteval chooses an implementation (C++23)
- One `constexpr` function: a consteval helper during constant evaluation, a run-time path otherwise.
```cpp
// C++23: g++ -std=c++23 (GCC 12+)
#include <cstdio>

consteval int checked_scale(int x) {
    if (x > 1'000'000) throw "scale overflow";       // compile-time error
    return x * 100;
}

constexpr int scale(int x) {
    if consteval {
        return checked_scale(x);        // allowed: immediate function context
    } else {
        return x * 100;                 // run-time path (intrinsics, logging, ...)
    }
}

int main(int argc, char**) {
    constexpr int a = scale(25);        // compile time, checked
    int b = scale(argc);                // run time
    std::printf("%d %d\n", a, b);
}
```
- Output (run with no arguments, `argc == 1`):
```
2500 100
```
- With plain `if (std::is_constant_evaluated())` instead of `if consteval`, this fails to compile: "'x' is not a constant expression" (GCC 13).

#### Example 6: C++20 constexpr containers with a transient allocation
- Build and sort a `std::vector` during constant evaluation, then copy into a `std::array` that can outlive it.
```cpp
// C++20 library feature (constexpr std::vector): GCC 12+; checked with GCC 13 -std=c++23
#include <algorithm>
#include <array>
#include <cstdio>
#include <vector>

constexpr std::vector<int> primes_below(int limit) {
    std::vector<int> out;
    for (int n = 2; n < limit; ++n) {
        bool prime = true;
        for (int d = 2; d * d <= n; ++d)
            if (n % d == 0) { prime = false; break; }
        if (prime) out.push_back(n);
    }
    return out;
}

constexpr std::size_t count = primes_below(50).size();     // vector freed here

constexpr std::array<int, count> prime_table = [] {
    std::array<int, count> a{};
    auto v = primes_below(50);
    std::reverse(v.begin(), v.end());                          // constexpr since C++20
    std::copy(v.begin(), v.end(), a.begin());
    return a;
}();

int main() {
    std::printf("%zu primes, largest %d, smallest %d\n",
                prime_table.size(), prime_table.front(), prime_table.back());
}
```
- Output:
```
15 primes, largest 47, smallest 2
```
- Two passes: one to learn the size (a constant), one to fill the array. Every `std::vector` is destroyed inside its constant evaluation, so no allocation escapes.
- `constexpr auto v = primes_below(50);` would fail: "is not a constant expression because it refers to a result of 'operator new'".

#### Example 7: A literal type with constexpr members and a user-defined literal
- A fixed-point price type usable at compile time and at run time; layout checked by `static_assert`.
```cpp
#include <cstdint>
#include <cstdio>

class Price {
    std::int64_t ticks_;                       // 1 tick = 0.0001
public:
    static constexpr std::int64_t scale = 10'000;
    constexpr explicit Price(std::int64_t ticks) : ticks_(ticks) {}
    constexpr std::int64_t ticks() const { return ticks_; }
    constexpr Price operator+(Price o) const { return Price(ticks_ + o.ticks_); }
    constexpr bool operator<(Price o) const { return ticks_ < o.ticks_; }
};

constexpr Price operator""_px(long double v) {
    return Price(static_cast<std::int64_t>(v * Price::scale + 0.5L));
}

constexpr Price tick_size = 0.0005_px;
constexpr Price limit = 101.25_px + tick_size;

static_assert(limit.ticks() == 1'012'505);
static_assert(sizeof(Price) == 8);             // layout assumption checked at build time
static_assert(tick_size < limit);

int main() {
    Price p(1'012'000);                          // run-time object, same type
    std::printf("%lld %d\n", static_cast<long long>((p + tick_size).ticks()), p < limit);
}
```
- Output:
```
1012005 1
```
- A class is a literal type when it has a `constexpr` constructor and a trivial destructor (or `constexpr`, C++20); all of `Price` works in constant expressions.
- `static constexpr std::int64_t scale` needs no out-of-class definition in C++17 (implicitly inline).

### QUICK_REFERENCE: Cheat Sheet

#### Keywords
| | `const` | `constexpr` var | `constexpr` fn | `consteval` fn | `constinit` var |
|---|---|---|---|---|---|
| Since | C++98 | C++11 | C++11 | C++20 | C++20 |
| Compile-time value required | No (except integral used as constant) | Yes | Only in constant contexts | Always | Yes (initializer) |
| Can run at run time | n/a | n/a | Yes | No | n/a |
| Object is const | Yes | Yes | n/a | n/a | No |
| Storage restriction | None | None | n/a | n/a | Static or thread-local |

#### Contexts that force compile-time evaluation
| Context | Example |
|---|---|
| constexpr variable | `constexpr int a = f();` |
| static_assert | `static_assert(f() == 3);` |
| Array bound / template argument | `std::array<int, f()>` |
| case label / enumerator | `case f():` |
| if constexpr condition | `if constexpr (f())` |
| consteval call | `id("x")` |
| const integral initializer (attempted) | `const int c = f();` |
| Static init (attempted) | `static int s = f();` |

#### Common compile errors (GCC 11 / 13)
| Code | Message |
|---|---|
| Signed overflow | overflow in constant expression |
| Out of bounds | array subscript value 'N' is outside the bounds |
| Null deref | dereferencing a null pointer |
| Param as constant | 'n' is not a constant expression |
| consteval with run-time arg | the value of 'n' is not usable in a constant expression |
| `&consteval_fn` | taking address of an immediate function |
| Loop too long | 'constexpr' loop iteration count exceeds limit of 262144 |
| Escaping allocation | refers to a result of 'operator new' |
| Static local in constexpr fn (C++20) | 'c' declared 'static' in 'constexpr' function |
| `constinit` with dynamic init | 'constinit' variable does not have a constant initializer |

#### Interview one-liners
| Question | Answer |
|---|---|
| Is a constexpr function evaluated at compile time? | Only when called in a context that requires a constant |
| constexpr vs consteval? | May vs must run at compile time |
| constexpr vs constinit? | constinit only requires constant initialization; variable stays mutable |
| Why can't I use a parameter as an array size? | Parameters are never constant expressions |
| `if constexpr (std::is_constant_evaluated())`? | Always true |
| How to call consteval from constexpr? | C++23 `if consteval` |
| What happens to UB at compile time? | Compile error: constant evaluation must diagnose it |
| constexpr std::vector global? | Not allowed: allocation must be freed inside the evaluation |
| static constexpr member needs a definition? | C++14 if odr-used; not since C++17 (implicitly inline) |
| Cost of heavy constexpr? | Longer builds, bigger binaries, evaluator limits |
| Use in low-latency code? | Precompute tables and constants; assert layouts at build time |
