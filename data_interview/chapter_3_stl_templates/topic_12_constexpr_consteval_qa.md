## TOPIC: constexpr, consteval and Compile-Time Programming

### INTERVIEW_QA: Interview Questions with Detailed Answers

#### Q1: A function declares `constexpr auto table = make_table();` as a local. Is the table built at compile time, and why is `static constexpr` usually what you want?
**Difficulty:** #intermediate
**Category:** #compile_time #performance
**Concepts:** #constexpr_variable #automatic_storage #static_constexpr

**Answer:**
The **values** are computed at compile time, but a non-static local is still an automatic object: every call creates a fresh copy on the stack and fills it in. `static constexpr` makes it one object with static storage, emitted once in read-only data, so a call only reads from it.

**Explanation:**
```cpp
#include <array>
#include <cstdint>
#include <iostream>

constexpr std::array<std::uint8_t, 256> make_table() {
    std::array<std::uint8_t, 256> t{};
    for (int i = 0; i < 256; ++i) t[i] = static_cast<std::uint8_t>(i * 7);
    return t;
}

bool local_same(int depth, const void* outer) {
    constexpr auto table = make_table();           // values: compile time
    if (depth == 0) return local_same(1, &table);  // object: one per call
    return outer == &table;
}

bool static_same(int depth, const void* outer) {
    static constexpr auto table = make_table();    // one object in .rodata
    if (depth == 0) return static_same(1, &table);
    return outer == &table;
}

int main() {
    std::cout << std::boolalpha << local_same(0, nullptr) << ' '
              << static_same(0, nullptr) << '\n';   // false true
}
```
- Two active calls see two different local tables (`false`) but the same static one (`true`): the local is a new object per call, exactly like any other local variable.
- Cost, checked in the assembly (GCC 11 and 13, x86-64): for `int lookup(int i) { constexpr auto t = make_table(); return t[i & 255]; }` even `-O2` rebuilds the 256-byte table on the stack on every call (32 eight-byte immediate stores on GCC 11, 16-byte copies from `.rodata` on GCC 13). With `static constexpr` the function is one address load plus one byte load.
- No thread-safety cost: a `static` local with a constant initializer is initialized at compile time, so there is no guard variable or lock.
- Inside a `constexpr` function a `static constexpr` local needs C++23 (P2647); in C++20 put the table at namespace scope (`inline constexpr auto table = make_table();` in a header).
- ❌ Common wrong answer: "constexpr means it lives in the binary and costs nothing at run time." Only the values are fixed; storage duration still follows the usual rules.
- ✅ What a strong answer adds: the namespace-scope version has its own trap: a `constexpr` variable in a header has internal linkage, so every translation unit gets its own copy (two addresses, verified with two TUs on GCC 11); `inline constexpr` (C++17) gives one object for the whole program.

**Key takeaway:** `constexpr` fixes the values; `static` decides there is one object. For tables, write `static constexpr`.

---

#### Q2: `constexpr int sq(int x) { return x * x; }` then `int b = sq(10);`. Is `sq(10)` computed at compile time?
**Difficulty:** #intermediate
**Category:** #compile_time
**Concepts:** #manifestly_constant_evaluated #constant_folding

**Answer:**
Not by the language rules. `int b` is a non-const local, so its initializer is an ordinary run-time call. The optimizer may fold it to `100` at `-O2`, but that is an optimization, not a guarantee, and `std::is_constant_evaluated()` would still report `false` there.

**Explanation:**
- Compile time is guaranteed only in contexts that require a constant: `constexpr int a = sq(10);`, `static_assert`, array bounds, template arguments, `case` labels. For `const` integral initializers and statics the constant evaluation is attempted first and used when it succeeds.
- At `-O0` GCC emits a real call to `sq` for `int b = sq(10);`.
- To force it: `constexpr int b = sq(10);`, or make `sq` `consteval`.
- ❌ Common wrong answer: "Yes, the arguments are constants, so the compiler evaluates it at compile time."
- ✅ What a strong answer adds: in the `const int c = sq(10);` case the answer flips to yes, because a const integral variable with a constant initializer is usable in constant expressions; for `const double` it does not.

**Key takeaway:** The calling context, not the arguments, decides whether a constexpr call is compile-time.

---

#### Q3: Why does `constexpr int f(int n) { std::array<int, n> a{}; return 0; }` not compile, even if you only call `f(3)` in constant expressions?
**Difficulty:** #intermediate
**Category:** #compile_time #templates
**Concepts:** #function_parameters #constant_expression #nttp

**Answer:**
Function parameters are never constant expressions. A constexpr function body must be valid for run-time calls too, where `n` is unknown, so `n` cannot be a template argument. GCC: "'n' is not a constant expression".

**Explanation:**
- The same restriction applies to `static_assert(n > 0)` inside the function and to `if constexpr (n > 0)`.
- Use a template parameter instead: `template <int N> constexpr int f() { std::array<int, N> a{}; ... }`, called as `f<3>()`.
- In a `consteval` function the parameters are still not constant expressions in this sense (they cannot be template arguments either).
- ❌ Common wrong answer: "Mark the parameter `constexpr`." `constexpr` parameters do not exist in C++.
- ✅ What a strong answer adds: a precondition check for compile-time calls can be written as `if (n <= 0) throw "bad n";`: evaluating the throw at compile time is a compile error with a readable message.

**Key takeaway:** Values that must be compile-time inside a function are template parameters, not function parameters.

---

#### Q4: What does `std::is_constant_evaluated()` do, and what is the classic mistake with it?
**Difficulty:** #intermediate
**Category:** #compile_time #cpp20
**Concepts:** #is_constant_evaluated #if_constexpr

**Answer:**
It returns `true` when the current evaluation is a manifestly constant-evaluated context, so one function can choose a constexpr-friendly algorithm at compile time and a faster run-time implementation (intrinsics, `memcpy`, SIMD) otherwise. The classic mistake is `if constexpr (std::is_constant_evaluated())`, which is always `true`.

**Explanation:**
```cpp
#include <cstdio>
#include <type_traits>

constexpr int mode() {
    if (std::is_constant_evaluated()) return 1;   // compile-time path
    return 2;                                      // run-time path
}

int main() {
    constexpr int a = mode();
    int b = mode();
    std::printf("%d %d\n", a, b);
}
```
- Output: `1 2`.
- The `if constexpr` condition is itself evaluated as a constant, so `is_constant_evaluated()` is `true` there and the run-time branch is discarded. GCC warns "always evaluates to true in 'if constexpr'".
- ❌ Common wrong answer: "Use `if constexpr` because the check is about compile time."
- ✅ What a strong answer adds: C++23 `if consteval` replaces it and also allows calling consteval functions in the compile-time branch.

**Key takeaway:** Use plain `if (std::is_constant_evaluated())`, never `if constexpr`; in C++23 prefer `if consteval`.

---

#### Q5: Why was `if consteval` added in C++23?
**Difficulty:** #advanced
**Category:** #compile_time #cpp23
**Concepts:** #if_consteval #immediate_functions

**Answer:**
Because a constexpr function could not call a consteval function with its own parameters, even inside `if (std::is_constant_evaluated())`: every call to a consteval function is checked as an immediate invocation and the parameter is not a constant. In an `if consteval` branch the code is an immediate function context, so the call is allowed.

**Explanation:**
- GCC 13: `if (std::is_constant_evaluated()) return twice(x);` with `consteval int twice(int)` fails: "'x' is not a constant expression".
- `if consteval { return twice(x); } else { return x * 2; }` compiles and picks the branch per call.
- No header is needed (it is a language feature) and it cannot be misused the way `if constexpr (std::is_constant_evaluated())` can.
- `if !consteval { ... }` is the negated form.
- ❌ Common wrong answer: "It is just a nicer spelling of `is_constant_evaluated()`."
- ✅ What a strong answer adds: C++23 P2564 (GCC 14) additionally lets some constexpr functions become immediate automatically when they call consteval functions.

**Key takeaway:** `if consteval` is the only clean way to call consteval code from a constexpr function.

---

#### Q6: What are good uses of `consteval`? Can you take the address of a consteval function?
**Difficulty:** #intermediate
**Category:** #compile_time #api_design
**Concepts:** #consteval #compile_time_validation

**Answer:**
Use `consteval` when a value must be computed at compile time or an argument must be validated at compile time: hashing string literals into IDs, checking format strings (`std::format` does this), validating symbol codes or bit masks. You cannot take its address in run-time code ("taking address of an immediate function"), because no run-time function exists.

**Explanation:**
- "consteval wrapper" pattern: implement the algorithm once as `constexpr`, then expose `consteval auto id(std::string_view s) { return hash(s); }` for call sites that must be compile-time.
- A `consteval` constructor rejects bad literals: `throw` on invalid input becomes a compile error at the call site.
- Calls with run-time arguments fail: "the value of 'n' is not usable in a constant expression".
- ❌ Common wrong answer: "consteval is a faster constexpr."
- ✅ What a strong answer adds: consteval functions leave nothing in the binary and cannot accidentally run on the hot path.

**Key takeaway:** consteval = compile-time only; ideal for validation and literal-derived constants.

---

#### Q7: What happens if a constexpr function hits undefined behaviour during constant evaluation?
**Difficulty:** #intermediate
**Category:** #compile_time #undefined_behaviour
**Concepts:** #ub_detection #static_assert

**Answer:**
The program does not compile: the compiler must diagnose UB in a constant evaluation (signed overflow, out-of-bounds access, null dereference, reading uninitialized or dead objects). That makes `static_assert` tests of constexpr functions a free UB detector for the tested inputs.

**Explanation:**
- `INT_MAX + 1` → "overflow in constant expression"; `arr[3]` on `int[3]` → "array subscript value '3' is outside the bounds"; `*nullptr` → "dereferencing a null pointer".
- It only covers evaluations that happen at compile time; the same function called at run time with the same bad input is ordinary silent UB.
- Unspecified behaviour and implementation limits are not covered the same way (e.g. comparing unrelated pointers is rejected as "not a constant expression").
- ❌ Common wrong answer: "The compiler falls back to run time if something goes wrong."
- ✅ What a strong answer adds: some teams write unit tests as `static_assert`s for constexpr utilities (parsers, bit manipulation) precisely to get this checking.

**Key takeaway:** UB on a compile-time path is a compile error.

---

#### Q8: How has `constexpr` evolved from C++11 to C++23?
**Difficulty:** #intermediate
**Category:** #compile_time #language_evolution
**Concepts:** #cpp11 #cpp14 #cpp20 #cpp23

**Answer:**
C++11: a single return statement. C++14: loops, locals, multiple statements, mutation. C++17: constexpr lambdas, `if constexpr`, inline static constexpr members. C++20: `consteval`, `constinit`, `is_constant_evaluated`, virtual functions, `try`/`catch`, transient `new`/`delete`, constexpr `std::vector`/`std::string`/algorithms. C++23: `if consteval`, `static` locals in constexpr functions (not evaluated), relaxed "must be constant-able" rule.

**Explanation:**
- C++11 style: `constexpr int fact(int n) { return n <= 1 ? 1 : n * fact(n - 1); }`.
- C++14 removed the implicit `const` on constexpr member functions.
- C++20's transient allocation means memory obtained during constant evaluation must be released before it ends.
- C++26 adds constexpr exceptions (throw/catch evaluated at compile time) and placement new.
- ❌ Common wrong answer: "C++20 made everything constexpr." I/O, `reinterpret_cast`, inline asm and non-transient allocations are still excluded.
- ✅ What a strong answer adds: library support lags the language (GCC 11 has the C++20 language rules but no constexpr `std::vector`; GCC 12 added it).

**Key takeaway:** Each standard widened what the compile-time interpreter can run; C++20 was the big step.

---

#### Q9: Can you have a `constexpr std::vector` in C++20?
**Difficulty:** #advanced
**Category:** #compile_time #stl
**Concepts:** #transient_allocation #constexpr_vector

**Answer:**
Inside constant evaluation, yes: a constexpr function can create, fill, sort and destroy a `std::vector`. But a `constexpr std::vector<int> v{1, 2};` variable is not allowed, because its heap allocation would outlive the evaluation. Allocations must be transient.

**Explanation:**
- GCC 13: "is not a constant expression because it refers to a result of 'operator new'".
- Pattern: compute the size in one constant evaluation, then fill an `std::array<T, N>` in another (two-pass), or use a fixed-capacity container.
- Same for `std::string`: fine inside, cannot escape into a constexpr variable. `std::string_view` of a literal is the compile-time-friendly string.
- ❌ Common wrong answer: "Yes, C++20 made vector constexpr, so constexpr globals of vector work."
- ✅ What a strong answer adds: the result `std::array` lives in read-only data with zero start-up cost.

**Key takeaway:** constexpr containers are for computing; `std::array` is for keeping.

---

#### Q10: What is the difference between `const int c = f();` and `const double d = f();` when `f` is constexpr?
**Difficulty:** #advanced
**Category:** #compile_time #language_rules
**Concepts:** #usable_in_constant_expressions #const_integral

**Answer:**
`c` is usable in constant expressions (a const integral variable with a constant initializer), so its initializer is constant-evaluated and `c` can be an array bound. `d` is not: a `const double` is never usable in constant expressions, so (for a local `d`) `f()` is an ordinary call and `d` cannot be used in `static_assert`. A namespace-scope or `static` `const double` is still constant-initialized when possible, so there `f()` is constant-evaluated, but `d` is still not usable in constant expressions.

**Explanation:**
- With `std::is_constant_evaluated()` inside `f`, `c` sees `true` and `d` sees `false` (verified on GCC 11 at `-O0` and `-O2`).
- The integral rule dates from C++98 (`const int N = 10; int arr[N];`).
- `constexpr double d = f();` makes it a constant regardless of type.
- ❌ Common wrong answer: "Both are just const variables, no difference."
- ✅ What a strong answer adds: write `constexpr` for every intended compile-time constant; it states intent and works for every literal type.

**Key takeaway:** `const` integral may be a constant expression; `const` floating point never is; `constexpr` is explicit.

---

#### Q11: Why might `struct S { static constexpr int N = 5; };` cause a link error?
**Difficulty:** #intermediate
**Category:** #compile_time #odr
**Concepts:** #odr_use #inline_variables #cpp17

**Answer:**
Before C++17, the in-class `static constexpr` member is only a declaration. If the program odr-uses it (binds it to a reference, e.g. `std::max(x, S::N)` or `v.push_back(S::N)`, or takes its address), a definition is needed in one .cpp file; without it the linker reports "undefined reference to 'S::N'". Since C++17 such members are implicitly `inline`, so the declaration is the definition.

**Explanation:**
- Using the value (`int a = S::N;`) is not an odr-use and always worked.
- The C++14 error may appear only at `-O0`: with optimization the value is often inlined and the reference disappears.
- C++14 fix: `constexpr int S::N;` in exactly one .cpp, or pass a copy (`+S::N`).
- ❌ Common wrong answer: "constexpr values have no storage, so they cannot cause link errors."
- ✅ What a strong answer adds: namespace-scope `constexpr` variables have internal linkage; in headers use `inline constexpr` (C++17) to get one shared object instead of one per translation unit.

**Key takeaway:** In C++17 static constexpr members are inline; in C++14 an odr-use needs an out-of-class definition.

---

#### Q12: Is it an error to mark a function `constexpr` if it can never be evaluated at compile time?
**Difficulty:** #advanced
**Category:** #compile_time #language_rules
**Concepts:** #ifndr #p2448 #cpp23

**Answer:**
Up to C++20: yes, but "ill-formed, no diagnostic required": compilers may or may not complain. C++23 (P2448) removed the rule: it is an error only if such a call is actually constant-evaluated.

**Explanation:**
- `constexpr int read_qty() { int x = 0; std::cin >> x; return x; }`: GCC 11 rejects it at the definition ("call to non-'constexpr' function"); a `std::scanf` variant passed without a diagnostic.
- GCC 13 accepts both, even with `-std=c++20`, applying P2448 as a defect fix.
- The change helps generic code: a constexpr function template may be instantiated with types whose operations are not constexpr.
- ❌ Common wrong answer: "constexpr simply falls back to run time when something is not constant."
- ✅ What a strong answer adds: keep at least one `static_assert` that calls each constexpr function, otherwise the keyword promises nothing.

**Key takeaway:** A constexpr that can never be constant was IFNDR until C++23; test with static_assert.

---

#### Q13: What does a class need to be usable in constant expressions? Can virtual functions be constexpr?
**Difficulty:** #intermediate
**Category:** #compile_time #classes
**Concepts:** #literal_type #constexpr_constructor #constexpr_virtual

**Answer:**
It must be a literal type: a `constexpr` constructor (or be an aggregate), a trivial destructor (or a `constexpr` destructor in C++20), and literal-type members. Since C++20 virtual functions can be `constexpr`, so a call through a base reference works during constant evaluation.

**Explanation:**
```cpp
#include <cstdio>

struct Shape {
    constexpr virtual int corners() const { return 0; }
};
struct Square : Shape {
    constexpr int corners() const override { return 4; }
};

constexpr int count(const Shape& s) { return s.corners(); }
static_assert(count(Square{}) == 4);           // virtual dispatch at compile time

int main() {
    Square sq;
    const Shape& s = sq;
    std::printf("%d\n", count(s));             // 4, run-time virtual call
}
```
- Output: `4`.
- A class with a user-provided non-constexpr constructor cannot be a `constexpr` variable: "the type 'const S' of 'constexpr' variable 's' is not literal".
- `dynamic_cast` and `typeid` are also allowed in constant evaluation since C++20.
- A `constexpr virtual ~Shape() = default;` is also valid C++20 (GCC 13 accepts this example with it), but GCC 11 rejects the `static_assert` with "'virtual constexpr Square::~Square()' used before its definition": a compiler bug, so the example omits it.
- ❌ Common wrong answer: "Virtual calls need a vtable at run time, so never constexpr."
- ✅ What a strong answer adds: the compile-time interpreter knows the dynamic type of every object it created, so it resolves the call directly.

**Key takeaway:** Literal types + C++20 constexpr virtuals make most value classes usable at compile time.

---

#### Q14: What are the costs and limits of compile-time computation?
**Difficulty:** #intermediate
**Category:** #compile_time #performance
**Concepts:** #build_time #binary_size #constexpr_limits

**Answer:**
Compile time (the constant evaluator is an interpreter, much slower than native code), binary size (every table is stored in `.rodata`), and hard limits: GCC defaults are 512 recursion depth, 262144 iterations per loop, 33554432 total operations. Exceeding a limit is a compile error.

**Explanation:**
- Messages: "'constexpr' loop iteration count exceeds limit of 262144 (use '-fconstexpr-loop-limit=' to increase the limit)", "'constexpr' evaluation depth exceeds maximum of 512", "operation count exceeds limit of 33554432".
- Clang has its own limits (`-fconstexpr-steps`, `-fconstexpr-depth`).
- Debugging is harder: no debugger inside constant evaluation; keep functions callable at run time to unit test them normally.
- ❌ Common wrong answer: "Compile-time work is free."
- ✅ What a strong answer adds: in low-latency code, precomputing small tables and constants is worth it; generating megabytes of tables usually is not (I-cache, D-cache and build time).

**Key takeaway:** Compile-time work trades build time and binary size for zero run-time cost.

---

#### Q15: How do you build a lookup table at compile time, and why prefer it to filling one at start-up?
**Difficulty:** #intermediate
**Category:** #compile_time #design
**Concepts:** #lookup_table #std_array #static_initialization

**Answer:**
Write a `constexpr` function that returns a filled `std::array`, and initialize a `constexpr` variable with it at namespace scope (or `static constexpr` inside a function): `constexpr auto table = make_table();`. The compiler evaluates it and stores the result in read-only data (a non-static local would be rebuilt on the stack each call, see Q1). Compared with filling it at start-up there is no initialization code, no static-initialization-order risk, and the table can be checked with `static_assert`.

**Explanation:**
- Examples: CRC tables, popcount/bit-reverse tables, character-class tables for parsers, price-tick tables.
- Return `std::array`, not `std::vector` (allocations cannot escape constant evaluation).
- `static_assert(table[1] == 0x77073096u);` pins known values, so a refactor that breaks the generator fails the build.
- ❌ Common wrong answer: "A static const array filled in a constructor is the same." Its initialization runs at start-up (dynamic initialization) and is subject to ordering issues.
- ✅ What a strong answer adds: function-local `static constexpr` tables inside constexpr functions need C++23; at namespace scope they work in C++17.

**Key takeaway:** constexpr function + std::array + static_assert = a tested table with zero start-up cost.

---

#### Q16: Does `constinit` make a global safe to use from several threads?
**Difficulty:** #beginner
**Category:** #compile_time #concurrency
**Concepts:** #constinit #data_race #atomic

**Answer:**
No. `constinit` only guarantees that the initial value is set at compile time (so no thread can see it uninitialized and there is no initialization-order problem). Later concurrent writes, or a write concurrent with reads, are still a data race. Use `constinit std::atomic<int>` or a mutex for that.

**Explanation:**
- `constinit std::atomic<int> counter{0};` works because `std::atomic`'s constructor is `constexpr`.
- Function-local `static T x = make();` is thread-safe *initialization* (C++11 "magic statics"), a different mechanism with a run-time guard; `constinit` needs no guard at all.
- `thread_local constinit int t = 0;` avoids the per-access TLS initialization check that dynamic `thread_local` initialization needs.
- ❌ Common wrong answer: "It is initialized before main, so it is thread-safe."
- ✅ What a strong answer adds: initialization and access are separate concerns; details are in Memory & Ownership, topic 01 and the Concurrency chapter.

**Key takeaway:** constinit fixes when a variable is initialized, not how it is shared.

---
