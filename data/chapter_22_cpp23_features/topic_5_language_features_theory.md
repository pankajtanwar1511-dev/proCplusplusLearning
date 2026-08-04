## TOPIC: C++23 Language Features - Core Language Improvements

### THEORY_SECTION: Small Syntax, Big Ergonomics - The Core Language Polish of C++23

C++23 doesn't introduce a single headline language mechanism the way C++11 (move semantics), C++17 (structured bindings), or C++20 (concepts, coroutines) did. Instead, it ships a collection of small, surgical fixes to long-standing pain points: detecting constant evaluation safely, forcing a copy without ceremony, writing `size_t` literals without signedness warnings, telling the optimizer what it can assume, gaining precise-width floating-point types, and tidying up the preprocessor. Individually small, collectively these features remove a surprising amount of boilerplate and footguns from everyday C++ code.

---

#### 1. `if consteval` - Safely Detecting Constant Evaluation (P1938)

**The Problem `std::is_constant_evaluated()` Didn't Fully Solve:**

C++20 introduced `std::is_constant_evaluated()` so a `constexpr` function could behave differently depending on whether it's currently being evaluated at compile time or at runtime — for example, using a fast bit-trick at runtime but a portable loop at compile time (since not all runtime tricks, like reinterpreting bits through a union or `memcpy`, are constant-expression-friendly).

```cpp
// C++20: std::is_constant_evaluated()
constexpr double old_style_abs(double x) {
    if (std::is_constant_evaluated()) {
        return x < 0 ? -x : x;               // Portable path for constant evaluation
    } else {
        return std::fabs(x);                 // Fast runtime path (calls into libm)
    }
}
```

This *works*, but the construct is a plain `if`, and plain `if` is a minefield here:

```cpp
// ❌ SUBTLE BUG: negating the condition changes nothing semantically,
//    but it's easy to write the branches backwards and never notice
//    because both branches still COMPILE in both contexts.
constexpr double buggy(double x) {
    if (!std::is_constant_evaluated()) {
        return x < 0 ? -x : x;   // Oops - this is now the "runtime" branch,
    } else {                     //  but it looks like the constexpr-safe one
        return std::fabs(x);     // and this "constant evaluation" branch
    }                            // calls a non-constexpr library function!
}
```

Worse, `std::is_constant_evaluated()` is just a `bool`-returning function call — nothing stops you from stashing its result in a variable or using it outside an `if` condition in ways whose meaning is easy to get wrong:

```cpp
constexpr bool ce = std::is_constant_evaluated();   // Almost always evaluates to
                                                     // "false" here in surprising ways,
                                                     // because of how it interacts with
                                                     // manifestly constant-evaluated contexts.
```

**The C++23 Solution: `if consteval`**

`if consteval { ... } else { ... }` is a new **statement form** (not a function call), so the compiler enforces its meaning directly instead of relying on programmer discipline:

```cpp
// ✅ C++23: if consteval
constexpr double new_style_abs(double x) {
    if consteval {
        return x < 0 ? -x : x;    // Constant-evaluation branch (first, always)
    } else {
        return std::fabs(x);      // Runtime branch
    }
}
```

**Key Rules:**

| Rule | Detail |
|------|--------|
| **Syntax** | `if consteval { }` or `if consteval { } else { }` — no parentheses, no expression |
| **First branch** | Always the "we are being constant-evaluated" branch |
| **Negation** | `if !consteval { } else { }` flips the meaning (runtime branch first) |
| **Context** | Legal in any function, not just `constexpr`/`consteval` functions |
| **No condition needed** | Can't be combined with an ordinary condition (`if consteval && x` is **not** valid syntax) |

**Why It's Safer Than `is_constant_evaluated()`:**

```cpp
// ❌ C++20 idiom - a call that returns bool, so it can be misused:
if (std::is_constant_evaluated()) { /* ... */ }   // fine
bool b = std::is_constant_evaluated();            // legal but almost always wrong
some_function(std::is_constant_evaluated());      // legal but almost always wrong

// ✅ C++23 - a dedicated statement, so misuse doesn't compile:
if consteval { /* ... */ }        // ✅ only valid usage
bool b = consteval;               // ❌ compile error - "consteval" is not an expression here
```

Because `if consteval` is syntax rather than a function call whose result flows through ordinary expression rules, it can't be accidentally captured, forwarded, or negated in a way the compiler can't see through.

**Practical Example - constexpr String Length:**

```cpp
#include <cstring>

constexpr std::size_t string_length(const char* s) {
    if consteval {
        // Compile-time: simple, portable, no intrinsics
        std::size_t n = 0;
        while (s[n] != '\0') ++n;
        return n;
    } else {
        // Runtime: use the highly optimized library implementation
        return std::strlen(s);
    }
}

constexpr std::size_t len = string_length("hello");  // Evaluated via the constexpr branch
std::size_t rlen = string_length(some_runtime_ptr);   // Evaluated via std::strlen at runtime
```

**Migration Note:** `std::is_constant_evaluated()` still exists and is not deprecated — it remains useful when you need the boolean value itself (e.g., to pass into another function, or combine with other conditions). `if consteval` is the *preferred* tool specifically for the "branch on constant evaluation" pattern.

---

#### 2. `auto(x)` and `auto{x}` - Explicit Decay-Copy (P0849)

**The Problem: No Concise Way to Force a Copy**

Generic code frequently receives values through forwarding references, `auto&&`, or `decltype(auto)`, which can bind to references, `const` objects, or bitfields. Sometimes you specifically want a plain, unqualified, non-reference **copy** — stripping `const`, `volatile`, and reference-ness, and triggering array-to-pointer / function-to-pointer decay, exactly like passing an argument by value would. Pre-C++23, doing this explicitly required a verbose helper:

```cpp
// ❌ Pre-C++23: verbose decay-copy
template<typename T>
auto decay_copy(T&& x) {
    return std::forward<T>(x);   // relies on the function's own by-value return type to decay
}

template<typename Range>
void process(Range&& r) {
    // Want a plain, independent copy of the first element's type/value:
    auto first = decay_copy(*r.begin());     // needs the helper above
    // or:
    std::decay_t<decltype(*r.begin())> first2 = *r.begin();   // verbose and easy to get wrong
}
```

**The C++23 Solution: `auto(x)` / `auto{x}`**

C++23 lets you write `auto(x)` (functional-cast form) or `auto{x}` (braced form) directly as an expression that performs a **decay-copy** of `x`:

```cpp
// ✅ C++23: explicit decay-copy expression
template<typename Range>
void process(Range&& r) {
    auto first = auto(*r.begin());   // Guaranteed plain value copy, no reference, no cv-qualifiers
}
```

**What "Decay" Means Here (Same Rules as Template Argument Deduction by Value):**

| Input type | `auto(x)` result type |
|------------|------------------------|
| `const int&` | `int` |
| `int&` | `int` |
| `volatile double&&` | `double` |
| `const char (&)[6]` (array ref) | `const char*` (decays to pointer) |
| `int(&)(void)` (function ref) | `int(*)(void)` (decays to pointer) |
| A bitfield lvalue | The bitfield's declared type, as a plain value |

**Practical Use Case 1 - Avoiding Accidental Reference Capture in Lambdas:**

```cpp
int global_counter = 0;

auto make_incrementer() {
    // ❌ Pre-C++23: easy to accidentally capture a reference to something
    //    that outlives its usefulness, especially with structured bindings
    //    or member access expressions in the capture list.
    return [x = global_counter]() mutable { return ++x; };  // this one is fine,
                                                              // but the pattern below is the real trap:
}

struct Widget { int value; };

auto snapshot(const Widget& w) {
    // ✅ C++23: force a true independent copy, regardless of w's value category
    return [v = auto(w.value)]() { return v; };
    // Without auto(...), if w.value were ever refactored into a reference-returning
    // accessor, `x = w.value` could silently start capturing by reference.
}
```

**Practical Use Case 2 - Breaking Aliasing When Reusing a Variable:**

```cpp
void update(std::vector<int>& data) {
    auto old_size = auto(data.size());   // explicit copy of the value, not a reference to
                                          // anything, so it's crystal clear this "detaches"
    data.push_back(42);
    // old_size is guaranteed to be the pre-push_back size, no ambiguity for readers
}
```

**`auto(x)` vs `auto{x}`:**

```cpp
auto a = auto(42);     // functional-cast style
auto b = auto{42};     // braced-init style

// Both produce an int with value 42. Prefer auto(x) in most code -
// auto{x} can look confusingly similar to list-initialization of an
// aggregate or std::initializer_list in adjacent code.
```

**Comparison Table - Old Idioms vs C++23:**

| Goal | Pre-C++23 | C++23 |
|------|-----------|-------|
| Decay-copy a value | `std::decay_t<decltype(x)>(x)` | `auto(x)` |
| Decay-copy in a lambda capture | `[x = std::decay_t<decltype(x)>(x)]` | `[x = auto(x)]` |
| Force array/function decay | Custom helper function | `auto(x)` |

---

#### 3. `size_t` Literal Suffixes: `uz` / `UZ` and `z` / `Z` (P0330)

**The Problem: No Literal Suffix for `size_t`**

`std::size_t` is unsigned and its width is implementation-defined (commonly 64-bit on modern platforms), but there was never a literal suffix that directly produced a `size_t`-typed constant. Code comparing an `int` loop counter against a `size_t` (e.g., `.size()`) is one of the most common sources of `-Wsign-compare` warnings:

```cpp
std::vector<int> v = {1, 2, 3};

// ❌ Pre-C++23: signed/unsigned comparison warning
for (int i = 0; i < v.size(); ++i) { /* ... */ }
//              ^^^^^^^^^^^ int compared against size_t (unsigned)

// Workarounds people reached for:
for (std::size_t i = 0; i < v.size(); ++i) { /* ... */ }       // verbose type name
for (auto i = 0u; i < v.size(); ++i) { /* ... */ }             // 0u is unsigned int,
                                                                // NOT guaranteed same width as size_t!
```

**The C++23 Solution: `uz`/`UZ` and `z`/`Z` Suffixes**

```cpp
auto a = 0uz;      // type: std::size_t (unsigned)
auto b = 0UZ;      // same - case-insensitive, like other suffixes (u/U, l/L)
auto c = 0z;       // type: signed version of size_t's corresponding signed type
                   //        (informally "ssize_t"-like), useful when subtraction
                   //        of sizes could go negative
auto d = 0Z;       // same as 0z

// ✅ C++23: no more sign-mismatch warnings, and the type is exactly right
for (auto i = 0uz; i < v.size(); ++i) { /* ... */ }
```

**Suffix Reference Table:**

| Suffix | Resulting type | Signedness |
|--------|-----------------|------------|
| `z` / `Z` | Signed integer type with the same width as `size_t` | Signed |
| `uz` / `UZ` | `std::size_t` exactly | Unsigned |
| `zu` / `ZU` | Same as `uz` (order-insensitive, like `ul`/`lu`) | Unsigned |

**Practical Example - Safe Signed Size Arithmetic:**

```cpp
std::vector<int> v = {10, 20, 30};

// Computing "index of last element minus offset" safely, even if offset > size:
auto last_index = auto(v.size()) - 1z;   // signed arithmetic, avoids unsigned wraparound
if (last_index >= 0z) {
    std::cout << v[static_cast<std::size_t>(last_index)] << '\n';
}

// Without 'z': std::size_t(0) - 1 wraps around to a huge unsigned value (classic bug)
std::size_t bad = 0uz - 1uz;   // bad == SIZE_MAX, NOT -1 -- still a footgun with unsigned math,
                                // but now at least it's an EXPLICIT, intentional unsigned literal.
```

**Why This Matters at Scale:** Codebases with strict `-Wall -Wextra -Wsign-compare` (or `/W4` on MSVC) builds previously had to either suppress the warning, sprinkle `static_cast<std::size_t>(...)` everywhere, or use non-portable `0u`/`0ul`/`0ull` guesses at `size_t`'s width. The `uz` suffix is exact and portable across platforms by construction.

---

#### 4. `[[assume(expr)]]` - Optimizer Hints (P1774)

**The Problem: No Standard Way to Tell the Compiler "Trust Me"**

Compilers have long supported non-standard intrinsics for asserting a fact the optimizer can rely on without generating a runtime check — GCC/Clang's `__builtin_assume`/`__builtin_unreachable`-based tricks, and MSVC's `__assume`. These are not portable, and mixing them requires macros.

**The C++23 Solution: `[[assume(expr)]]`**

```cpp
int divide(int a, int b) {
    [[assume(b != 0)]];          // Tells the optimizer: b is never 0 here.
    return a / b;                 // The optimizer may skip the div-by-zero trap check
}                                  // it would otherwise have to preserve for UB semantics.
```

**Critical Semantics — This Is NOT an Assertion:**

| Aspect | `assert(expr)` | `[[assume(expr)]]` |
|--------|-----------------|----------------------|
| **Evaluated at runtime?** | Yes (in debug builds; no-op if `NDEBUG`) | **Never evaluated** — it's pure metadata for the optimizer |
| **What if `expr` is false?** | Program aborts (in debug builds) | **Undefined behavior** — no check exists at all |
| **Purpose** | Catch bugs during testing | Let the optimizer generate better code assuming the fact holds |
| **Cost if true** | Runtime branch (in debug) | Zero runtime cost, ever |
| **Cost if false** | Controlled abort (in debug) / silently wrong (release) | **Anything can happen** — this is real UB |

```cpp
// ❌ DANGEROUS MISUSE: treating [[assume]] like a check
int risky(int x) {
    [[assume(x > 0)]];
    if (x <= 0) {
        // The optimizer is FREE to assume this branch is unreachable
        // and may delete it entirely, even though you wrote it!
        throw std::invalid_argument("x must be positive");
    }
    return 100 / x;
}
```

Because the expression inside `[[assume(...)]]` is **never evaluated** (not even once, not even for side effects), writing something with side effects inside it is explicitly unspecified/dangerous:

```cpp
int counter = 0;
[[assume(++counter > 0)]];   // ❌ Do not do this - whether ++counter even executes
                              //    is unspecified; never put side effects here.
```

**Relationship to Prior Compiler Intrinsics:**

```cpp
// Pre-standard, compiler-specific equivalents this replaces:
#if defined(__clang__) || defined(__GNUC__)
    #define ASSUME(cond) __builtin_assume(cond)          // Clang (GCC lacked this directly;
                                                          // often emulated via __builtin_unreachable)
#elif defined(_MSC_VER)
    #define ASSUME(cond) __assume(cond)                  // MSVC
#endif

// C++23: one portable spelling
[[assume(cond)]];
```

**Practical Example - Vectorization Hint:**

```cpp
void scale(double* data, std::size_t n, double factor) {
    [[assume(n % 4 == 0)]];    // Hint: n is always a multiple of 4 in this codebase
    for (std::size_t i = 0; i < n; ++i) {
        data[i] *= factor;      // Optimizer may generate SIMD code without a
                                  // remainder/tail loop, since it can assume
                                  // n is evenly divisible by the vector width.
    }
}
```

**Rule of Thumb:** Use `assert()` for anything you want *checked*. Use `[[assume(...)]]` only for facts you have *already proven* true by other means (invariants enforced elsewhere in the program) and want the optimizer to exploit — never as a substitute for validation.

---

#### 5. Extended Floating-Point Types - `<stdfloat>` (P1467)

**The Problem: `float` and `double` Don't Guarantee Precise Widths**

Prior to C++23, the only standard floating-point types were `float`, `double`, and `long double` — and the standard never mandated their exact bit widths or that they follow IEEE-754. In practice they're almost always IEEE-754 `binary32`/`binary64` on mainstream platforms, but nothing *guaranteed* it, and there was no standard type at all for widths like 16-bit half-precision floats, which matter enormously for machine learning, graphics, and networked/serialized numeric data.

**The C++23 Solution: `<stdfloat>`**

```cpp
#include <stdfloat>

std::float16_t  half;      // IEEE-754 binary16, if the platform supports it
std::float32_t  f;         // IEEE-754 binary32 (typically == float)
std::float64_t  d;         // IEEE-754 binary64 (typically == double)
std::float128_t  q;        // IEEE-754 binary128, if supported
std::bfloat16_t  bf;       // "Brain float" 16-bit format (8-bit exponent, 7-bit mantissa) -
                            // popular in ML workloads for its wide dynamic range
```

**Conditional Availability:**

Each type is only defined if the target platform actually provides a conforming representation — checked via feature-test macros:

```cpp
#if defined(__STDCPP_FLOAT16_T__)
    std::float16_t x = 1.0f16;
#endif

#if defined(__STDCPP_BFLOAT16_T__)
    std::bfloat16_t y = 1.0bf16;
#endif
```

| Type | Feature-test macro | Literal suffix |
|------|---------------------|-----------------|
| `std::float16_t` | `__STDCPP_FLOAT16_T__` | `f16` |
| `std::float32_t` | `__STDCPP_FLOAT32_T__` | `f32` |
| `std::float64_t` | `__STDCPP_FLOAT64_T__` | `f64` |
| `std::float128_t` | `__STDCPP_FLOAT128_T__` | `f128` |
| `std::bfloat16_t` | `__STDCPP_BFLOAT16_T__` | `bf16` |

**Why This Matters:**

```cpp
// Pre-C++23: "give me exactly IEEE binary32" required non-portable assumptions:
static_assert(sizeof(float) == 4, "assuming IEEE binary32 - not guaranteed by the standard!");
using Portable32 = float;   // hope for the best

// C++23: an explicit, checkable guarantee
static_assert(std::numeric_limits<std::float32_t>::is_iec559);
using Portable32 = std::float32_t;   // guaranteed IEEE binary32 or the type doesn't exist
```

**Use Case - Serialization Format:**

```cpp
struct SensorReading {
    std::float32_t temperature;   // Guaranteed 4-byte IEEE-754, safe to serialize
                                    // across machines without worrying about a platform
                                    // where "float" might not be 32-bit IEEE.
    std::float16_t confidence;    // Half-precision is plenty for a 0.0-1.0 confidence score,
                                    // and halves the storage/bandwidth cost.
};
```

---

#### 6. Preprocessor Improvements

**`#elifdef` and `#elifndef` (P2334):**

Before C++23, chaining conditional compilation on macro definedness required the verbose `#elif defined(...)` form:

```cpp
// ❌ Pre-C++23
#ifdef _WIN32
    // Windows
#elif defined(__APPLE__)
    // macOS
#elif defined(__linux__)
    // Linux
#else
    // Other
#endif
```

C++23 adds direct shorthand:

```cpp
// ✅ C++23
#ifdef _WIN32
    // Windows
#elifdef __APPLE__
    // macOS
#elifdef __linux__
    // Linux
#else
    // Other
#endif

// #elifndef mirrors "#elif !defined(...)"
#ifndef FEATURE_A
    // ...
#elifndef FEATURE_B
    // ...
#endif
```

**`#warning` (P2437):**

Compilers have supported `#warning` as a non-standard extension for decades (issuing a diagnostic without stopping compilation, unlike `#error`). C++23 finally standardizes it:

```cpp
#if __cplusplus < 202002L
    #warning "This header works best with C++20 or later"
#endif

// TODO markers that show up in build logs without breaking the build:
#warning "TODO: replace this shim once std::expected is available everywhere"
```

| Directive | Effect | Standardized in |
|-----------|--------|-------------------|
| `#error "msg"` | Stops compilation with an error | C89 / C++98 |
| `#warning "msg"` | Emits a diagnostic, compilation continues | **C++23** (previously a widespread extension) |

---

#### 7. C++23 Language Features At a Glance

| Feature | Paper | One-line purpose |
|---------|-------|--------------------|
| `if consteval` | P1938 | Safely branch on whether execution is at compile time |
| `auto(x)` / `auto{x}` | P0849 | Explicit decay-copy expression |
| `size_t` literal suffixes (`uz`, `z`) | P0330 | Sign-correct, portable `size_t`/`ssize_t`-width literals |
| `[[assume(expr)]]` | P1774 | Standard optimizer hint (UB if false, never evaluated) |
| Extended floating-point types | P1467 | Portable precise-width IEEE-754 float types (`<stdfloat>`) |
| `#elifdef` / `#elifndef` | P2334 | Shorthand for `#elif defined(...)` / `#elif !defined(...)` |
| `#warning` | P2437 | Standardized non-fatal preprocessor diagnostic |

Taken together, these are the kind of changes that rarely show up in a "what's new" headline but quietly remove a warning suppression, a helper macro, or a hand-rolled workaround from thousands of codebases the moment a C++23 compiler becomes available.

---

#### 8. Compile-Time vs Runtime Breakdown

Every feature in this topic draws a sharp line between "the compiler decides this" and "the CPU executes this." Knowing which side of that line a piece of code sits on tells you whether it can possibly cost anything at runtime.

| Feature | Compile-Time Part | Runtime Part |
|---------|--------------------|--------------|
| `if consteval` | Compiler decides, per call site, which branch's *code is even compiled in* for that evaluation context | Only the taken branch exists as machine code — the other branch generates **zero** runtime instructions for that call site |
| `auto(x)` / `auto{x}` | Decay type resolved (references and top-level `const` stripped) | The actual copy/move construction of the decayed object still runs at runtime — decay-copy is not free, it's just *correctly typed* |
| `0uz`, `-1z` literal suffixes | Type of the literal (`size_t` vs `ptrdiff_t`) is chosen entirely by the compiler's front end | None — a `uz`-suffixed literal generates the exact same instruction as any other integer constant of that width |
| `[[assume(expr)]]` | `expr` is parsed and type-checked, then handed to the optimizer as a fact | `expr` is **never evaluated** — it costs nothing to execute because it never runs; only the *optimizations it unlocks* change the runtime code around it |
| Extended floating-point types (`std::float16_t`, ...) | Availability checked via `#ifdef __STDCPP_FLOAT16_T__` at compile time; the type itself is picked at compile time | Actual behavior depends on hardware: native FP16 registers on modern GPUs/some CPUs vs. software emulation (slower) if the target lacks native support |
| `#elifdef` / `#elifndef` / `#warning` | Preprocessor-only — resolved and discarded before the compiler proper ever sees the code | None — by definition, nothing from the preprocessor survives into the compiled binary |

The pattern across this whole table: **`if consteval`, `[[assume]]`, and the literal suffixes are ways of giving the compiler more information it already implicitly needs, so it stops generating code to re-derive that information at runtime.**

#### 9. Memory Model

None of these features allocate memory or add hidden runtime state — they either remove code paths entirely or shift a decision from "the CPU figures it out while running" to "the compiler already knew." The clearest way to see this is `if consteval`, where the two branches don't coexist as a runtime branch instruction at all:

```
Source code:                          Compiled output (conceptual):

constexpr double abs_like(double x) { Two DIFFERENT function bodies exist
    if consteval {                    depending on the call site's context —
        return x < 0 ? -x : x;        never both, never a runtime cmp+jmp:
    } else {
        return std::fabs(x);          [compile-time evaluation call site]
    }                                   -> only the portable branch's
}                                          instructions are ever generated

                                       [runtime call site]
                                         -> only `call std::fabs` is
                                            generated; the portable
                                            branch's code doesn't exist
                                            in this call's machine code
```

Compare that to a normal runtime `if`: the CPU has *both* branches sitting in the instruction stream and pays for a branch (and a possible misprediction) to pick one. `if consteval` never pays that cost because there is no runtime decision left to make — the compiler already resolved it.

`[[assume(expr)]]` works the same way from the other direction: it adds **zero** instructions of its own (since `expr` is never evaluated), but it can *remove* instructions elsewhere — for example, letting the optimizer skip a bounds check it can now prove is unnecessary, or keep a value in a register across a loop instead of reloading it from memory each iteration.

**Why this matters for low-latency code:** every one of these features is a way to pay a cost once, at compile time, instead of on every single invocation at runtime. `if consteval` avoids a runtime branch entirely; `[[assume]]` lets the optimizer generate tighter code around a fact it would otherwise have had to guard defensively against; `uz`/`z` suffixes avoid the extra sign-extension instruction a signed/unsigned mismatch can introduce. In a hot loop executed millions of times a second, "zero runtime cost" isn't a nice-to-have — it's the whole point of reaching for these features instead of their pre-C++23 equivalents.

---

### EDGE_CASES: Where These "Small" Features Bite Back

#### Edge Case 1: `if consteval` Still Type-Checks Both Branches - It Doesn't "Discard" Like `if constexpr`

`if constexpr` and `if consteval` look like siblings, but they do fundamentally different things to the branch you don't take:

```cpp
template<typename T>
constexpr T maybe(T x) {
    if constexpr (sizeof(T) == 4) {
        return x;                 // If T isn't 4 bytes, this branch's DEPENDENT
    } else {                      // code is never instantiated/checked at all -
        return x;                 // that's the whole point of if constexpr.
    }
}

constexpr int f(int x) {
    if consteval {
        return x;                 // BOTH branches are ordinary statements that are
    } else {                      // fully compiled and type-checked in the normal way -
        return non_constexpr_helper(x);   // if `non_constexpr_helper` isn't callable
    }                              // from a constexpr function in some other way, this
}                                  // is a hard compile error, consteval or not.
```

`if consteval` only changes **which branch executes at runtime vs. compile time** — it is ordinary run-time control flow syntactically, just with a compiler-known condition. It does **not** discard the untaken branch's semantic checking the way `if constexpr` discards a dependent branch in a template. Mixing them up leads to two different classes of bugs: expecting `if consteval` to make an otherwise-invalid branch "go away" (it won't - it must still compile), or expecting `if constexpr` to pick per-call-site runtime-vs-compile-time behavior (it can't - it's resolved once per instantiation, based on a compile-time-constant condition, not on how the enclosing call happens to be evaluated).

---

#### Edge Case 2: `[[assume(expr)]]` Never Evaluates `expr` - Side Effects Silently Vanish

```cpp
int counter = 0;

int next_id() {
    [[assume(++counter > 0)]];   // ❌ Looks like it increments counter. It might not.
    return counter;               // Whether ++counter ever executes is unspecified by
}                                   // the standard - assume()'s argument is pure metadata
                                    // for the optimizer, not a statement that runs.

// Contrast with an ordinary function call, which DOES always evaluate its argument:
assert(++counter > 0);   // This DOES increment counter (in builds where assert is active).
```

The rule is absolute: never put anything with a side effect inside `[[assume(...)]]`. A reviewer skimming the diff will very reasonably assume (no pun intended) that `++counter` happens, because in 99.9% of C++ contexts a written expression is evaluated. `[[assume]]` is one of the rare exceptions, and it looks exactly like a normal function call, which is exactly what makes it dangerous.

---

#### Edge Case 3: `[[assume(false)]]` Reached at Runtime Is Full Undefined Behavior, Not a Safe No-Op

```cpp
int classify(int level) {
    switch (level) {
        case 0: return 100;
        case 1: return 200;
        case 2: return 300;
        default:
            [[assume(false)]];   // "This is claimed to be unreachable"
            // If `level` is actually 7 at runtime, this is UB - not a thrown
            // exception, not a crash, not a defined "fallback" value. Anything
            // (including seemingly impossible behavior in EARLIER code, due to
            // how optimizers use this fact to simplify surrounding branches) can happen.
    }
}
```

This is functionally identical in spirit to `std::unreachable()` (a C++23 library addition, covered in this chapter's Library Additions topic) — both tell the optimizer "control flow can never reach here," and both are UB if that promise is broken. The difference is purely syntactic: `[[assume(false)]]` is an attribute usable anywhere an assumption could apply, while `std::unreachable()` is a library function call. Neither is a safe substitute for a `default: throw ...;` or a logged error path in code whose "impossible" cases are only *probably* impossible.

---

#### Edge Case 4: `auto(x)` vs `auto{x}` Disagree on Narrowing Conversions

Both decay-copy, but they use different initialization rules underneath — direct-initialization for `auto(x)`, list-initialization for `auto{x}` — and list-initialization famously forbids narrowing:

```cpp
double d = 3.9;

auto a = auto(d);     // ✅ int? No - a is double (decay-copy preserves d's type, double).
                       //    auto(x) doesn't change x's type, only its value category/qualifiers.

int n = 3.9;           // ✅ legal (narrowing, silently truncates to 3) - direct-init context
auto b = auto{d};      // Still `double b`, not int - auto{x} deduces double from d too;
                       // auto(x)/auto{x} decay-copy `x`'s OWN type, they don't convert types.

// The REAL divergence shows up when the source expression's type doesn't
// exactly match a target you separately declare:
struct Meters { explicit Meters(double); };
// (auto(x)/auto{x} don't invoke a different constructor set here either -
//  both just decay-copy whatever type `x` already is.)

// Where it actually matters: brace-init's narrowing check applies when the
// value inside the braces would lose information for FIXED integer widths:
int i = 300;
auto c = auto(static_cast<char>(i));   // fine either way: explicit cast already narrowed
// auto{...} narrowing rules bite when you build a literal or a wider computed
// value directly inside braces elsewhere in your code (e.g. `char{300}` is
// ill-formed - narrowing - while `char(300)` silently truncates). The general
// lesson: auto{x} inherits brace-init's stricter, safety-first narrowing
// rules, while auto(x) inherits the more permissive functional-cast rules.
```

**Practical guidance:** prefer `auto(x)` for everyday decay-copies (it reads less like aggregate/`initializer_list` syntax and matches C-style cast familiarity); reach for `auto{x}` only where you specifically want brace-init's narrowing protection to apply to the copy itself.

---

#### Edge Case 5: Forgetting the `uz`/`z` Suffix Reintroduces the Exact Bug It Was Meant to Fix

```cpp
std::vector<int> v = {1, 2, 3};

for (auto i = 0uz; i < v.size(); ++i) { /* fine: i is std::size_t */ }

// One missed suffix on a *related* variable reintroduces signed/unsigned mixing:
int offset = -1;
for (auto i = 0uz; i < v.size(); ++i) {
    if (static_cast<int>(i) + offset >= 0) {   // still requires a manual cast -
        // uz fixes the LITERAL's type; it does nothing for variables that
        // were already declared with ordinary `int`/`unsigned` types elsewhere
        // in the codebase. It's a targeted fix for literals, not a blanket cure
        // for signed/unsigned mixing in general.
    }
}

// Also easy to typo: `0zu` and `0uz` are the same (order-insensitive, like `ul`/`lu`),
// but `0lz` or `0zl` are NOT valid combinations - z/uz do not compose with l/ll suffixes,
// since size_t's width is not expressed via long/long long qualifiers here.
```

---

#### Edge Case 6: Extended Floating-Point Types Are Conditionally Defined - Portable Code Needs Guards

```cpp
#include <stdfloat>

// ❌ Not portable: compiles only on platforms that define float16_t at all
std::float16_t half = 1.0f16;

// ✅ Portable: guard with the feature-test macro before using the type name,
//    NOT just before using a literal of that type - the TYPE ITSELF may not exist.
#if defined(__STDCPP_FLOAT16_T__)
    std::float16_t half = 1.0f16;
#else
    // Fallback: emulate with the widest guaranteed-available type, or disable
    // the half-precision code path entirely on this platform.
    float half = 1.0f;
#endif
```

A subtle trap: `#ifdef __STDCPP_FLOAT16_T__` guards the *macro*, but forgetting that the type name itself (`std::float16_t`) is simply absent from `<stdfloat>` on unsupported platforms — not merely "present but functionally degraded" — means an unguarded use is a hard compile error there, not a runtime fallback.

---

#### Edge Case 7: `#elifdef`/`#elifndef` Are Pure Shorthand - No Behavioral Difference From `#elif defined(...)`

```cpp
// These two forms are defined to behave identically:
#ifdef _WIN32
#elif defined(__APPLE__)
#endif

#ifdef _WIN32
#elifdef __APPLE__
#endif
```

There is no known semantic divergence between the two spellings — `#elifdef`/`#elifndef` were added purely for ergonomics (mirroring `#ifdef`/`#ifndef`'s shorthand at every level of an `#if` chain, not just the first). The only real-world "edge case" is a toolchain that hasn't yet implemented the C++23 preprocessor additions rejecting the new spelling outright with a "unknown directive" error — a portability concern about compiler support lag, not a behavioral difference between the two forms once both are supported.

---

### CODE_EXAMPLES: Putting the C++23 Core-Language Features to Work

#### Example 1: `if consteval` Choosing Between an Intrinsic and a Portable Fallback

```cpp
#include <bit>
#include <cstdint>
#include <iostream>

// popcount: use a fast hardware intrinsic at runtime, but a portable
// bit-twiddling loop when the result is needed at compile time (where
// calling into arbitrary runtime library code isn't allowed).
constexpr int count_bits(std::uint32_t value) {
    if consteval {
        int count = 0;
        while (value) {
            count += static_cast<int>(value & 1u);
            value >>= 1;
        }
        return count;
    } else {
        return std::popcount(value);   // Maps directly to a POPCNT instruction on
                                         // supporting hardware at runtime.
    }
}

int main() {
    constexpr int compile_time_result = count_bits(0b1011'0110u);  // uses the loop
    std::uint32_t runtime_value = 0b1011'0110u;
    int runtime_result = count_bits(runtime_value);                // uses std::popcount

    std::cout << "Compile-time: " << compile_time_result << '\n';
    std::cout << "Runtime:      " << runtime_result << '\n';
}
```

**Output:**
```
Compile-time: 5
Runtime:      5
```

---

#### Example 2: `auto(x)` Forcing an Independent Copy Out of a Forwarding Reference

```cpp
#include <iostream>
#include <string>
#include <vector>

template<typename Container>
auto first_element_copy(Container&& c) {
    // Without auto(...), `*c.begin()` could be a reference INTO c - returning
    // it by `auto` deduction already copies here, but the pattern generalizes
    // to cases (e.g. storing into a member, or a captured lambda variable)
    // where deduction alone wouldn't force the copy this clearly.
    return auto(*c.begin());
}

int main() {
    std::vector<std::string> names = {"Ada", "Grace", "Margaret"};
    auto first = first_element_copy(names);   // std::string, independent copy

    names[0] = "Changed";
    std::cout << "Copy still holds: " << first << '\n';   // unaffected by the mutation
}
```

**Output:**
```
Copy still holds: Ada
```

---

#### Example 3: `uz` Literal Suffix Eliminating a Signed/Unsigned Comparison Warning

```cpp
#include <iostream>
#include <vector>

int main() {
    std::vector<int> data = {10, 20, 30, 40, 50};

    // ❌ Old idiom (commented out): `for (int i = 0; i < data.size(); ++i)`
    //    triggers -Wsign-compare, because data.size() returns std::size_t.

    // ✅ C++23: 0uz is exactly std::size_t, matching data.size()'s type - no warning.
    for (auto i = 0uz; i < data.size(); ++i) {
        std::cout << data[i] << (i + 1 < data.size() ? ", " : "\n");
    }
}
```

**Output:**
```
10, 20, 30, 40, 50
```

---

#### Example 4: `[[assume]]` Hinting a Loop Bound to Encourage Vectorization

```cpp
#include <cstddef>

// Telling the optimizer n is always a multiple of 4 lets it generate a
// SIMD loop without emitting a scalar "remainder" tail loop to handle
// leftover elements - codegen benefit only, no observable behavior change
// as long as the assumption genuinely always holds at every call site.
void scale_in_place(double* data, std::size_t n, double factor) {
    [[assume(n % 4 == 0)]];
    for (std::size_t i = 0; i < n; ++i) {
        data[i] *= factor;
    }
}

int main() {
    double buffer[8] = {1, 2, 3, 4, 5, 6, 7, 8};
    scale_in_place(buffer, 8, 2.0);
    // buffer is now {2, 4, 6, 8, 10, 12, 14, 16}
}
```

---

#### Example 5: Extended Floating-Point Types in a Sensor Buffer

```cpp
#include <stdfloat>
#include <iostream>
#include <array>

#if defined(__STDCPP_FLOAT16_T__)
using Confidence = std::float16_t;
#else
using Confidence = float;   // Portable fallback where float16_t isn't available
#endif

struct SensorSample {
    float temperature;      // ordinary float is fine here
    Confidence confidence;  // half precision is plenty, and halves storage
};

int main() {
    std::array<SensorSample, 3> samples = {{
        {21.5f, static_cast<Confidence>(0.98)},
        {21.7f, static_cast<Confidence>(0.95)},
        {21.6f, static_cast<Confidence>(0.99)},
    }};

    double total_confidence = 0.0;
    for (const auto& s : samples) {
        total_confidence += static_cast<double>(s.confidence);
    }
    std::cout << "Average confidence: " << (total_confidence / samples.size()) << '\n';
}
```

**Output:**
```
Average confidence: 0.973333
```

---

#### Example 6: `#elifdef` and `#warning` in a Small Portability Header

```cpp
// platform_config.h

#if __cplusplus < 202302L
    #warning "This header targets C++23 - some feature checks below may not apply"
#endif

#ifdef _WIN32
    #define PLATFORM_NAME "Windows"
#elifdef __APPLE__
    #define PLATFORM_NAME "macOS"
#elifdef __linux__
    #define PLATFORM_NAME "Linux"
#else
    #define PLATFORM_NAME "Unknown"
#endif

#include <iostream>
int main() {
    std::cout << "Building on: " << PLATFORM_NAME << '\n';
}
```

**Output (on Linux):**
```
Building on: Linux
```

---

#### Example 7: `if consteval` and `auto(x)` Combined in a Small Utility

```cpp
#include <iostream>
#include <array>

// Builds a lookup table at compile time when possible, otherwise falls
// back to computing entries on demand - demonstrating if consteval choosing
// strategy, and auto(x) making sure the returned entry is an independent copy.
template<std::size_t N>
constexpr std::array<int, N> squares_table() {
    std::array<int, N> table{};
    for (std::size_t i = 0; i < N; ++i) {
        table[i] = static_cast<int>(i * i);
    }
    return table;
}

int lookup_square(std::size_t index) {
    if consteval {
        // Unreachable in this particular call path (lookup_square isn't constexpr),
        // included only to show the syntax composing with other C++23 features.
        return 0;
    } else {
        static constexpr auto table = squares_table<16>();
        auto value = auto(table[index]);   // explicit independent copy of the entry
        return value;
    }
}

int main() {
    std::cout << lookup_square(5) << '\n';
}
```

**Output:**
```
25
```

---

---

### QUICK_REFERENCE: C++23 Core Language Features Cheat Sheet

#### Feature Summary Table

| Feature | Paper | Syntax | One-line purpose |
|---------|-------|--------|--------------------|
| `if consteval` | P1938 | `if consteval { } else { }` | Safely branch on whether execution is at compile time |
| `auto(x)` | P0849 | `auto(expr)` | Explicit decay-copy (functional-cast style) |
| `auto{x}` | P0849 | `auto{expr}` | Explicit decay-copy (braced style, narrowing-checked) |
| `size_t` literal suffix | P0330 | `0uz`, `0UZ` | Literal of type exactly `std::size_t` (unsigned) |
| `ssize_t`-like suffix | P0330 | `0z`, `0Z` | Literal of the signed type matching `size_t`'s width |
| `[[assume(expr)]]` | P1774 | `[[assume(cond)]];` | Optimizer hint; UB if false, never evaluated |
| Extended floating-point types | P1467 | `std::float16_t`, `std::float32_t`, `std::float64_t`, `std::float128_t`, `std::bfloat16_t` | Portable, precise-width IEEE-754 float types (`<stdfloat>`) |
| `#elifdef` | P2334 | `#elifdef NAME` | Shorthand for `#elif defined(NAME)` |
| `#elifndef` | P2334 | `#elifndef NAME` | Shorthand for `#elif !defined(NAME)` |
| `#warning` | P2437 | `#warning "msg"` | Standardized non-fatal preprocessor diagnostic |

#### Syntax Quick Reference

```cpp
// if consteval - branch on compile-time vs. runtime evaluation
constexpr auto f(auto x) {
    if consteval {
        return compile_time_path(x);
    } else {
        return runtime_path(x);
    }
}
// if !consteval { runtime_first } else { compile_time_second }  -- negated form

// auto(x) / auto{x} - explicit decay-copy
auto a = auto(expr);     // direct-init rules (permissive, allows narrowing)
auto b = auto{expr};     // list-init rules (rejects narrowing)

// size_t-width literal suffixes
auto i  = 0uz;            // std::size_t
auto j  = 0z;              // signed, size_t-width
for (auto k = 0uz; k < v.size(); ++k) { /* no sign-compare warning */ }

// [[assume]] - pure optimizer hint, NEVER evaluated, UB if false
[[assume(ptr != nullptr)]];
[[assume(n % 4 == 0)]];

// Extended floating-point types - always guard with the feature-test macro
#include <stdfloat>
#if defined(__STDCPP_FLOAT16_T__)
    std::float16_t half = 1.0f16;
#endif

// Preprocessor shorthand
#ifdef _WIN32
#elifdef __APPLE__
#elifndef SOME_OTHER_FLAG
#endif

#warning "non-fatal diagnostic, compilation continues"
```

#### Decision Guide

| Situation | Reach for |
|-----------|-----------|
| Need different behavior at compile time vs. runtime inside a `constexpr` function | `if consteval` |
| Need the *boolean value itself* (to pass along, combine with other conditions) | `std::is_constant_evaluated()` (still valid) |
| Want a guaranteed independent copy, no reference/cv-qualifiers | `auto(x)` (prefer over `auto{x}` unless you specifically want narrowing checks) |
| Looping against `.size()`/comparing to a `size_t` | `0uz`/`uz`-suffixed literals |
| A fact you've *already proven* true elsewhere and want the optimizer to exploit | `[[assume(expr)]]` — never for anything that needs runtime checking |
| A fact you want *checked* at runtime (debug builds) | `assert(expr)`, not `[[assume]]` |
| Need an exact-width, guaranteed-IEEE-754 float (ML/graphics/serialization) | `<stdfloat>` types, always behind a feature-test-macro guard |
| Chaining macro-definedness checks | `#elifdef`/`#elifndef` instead of `#elif defined(...)` |
| Non-fatal build-time diagnostic | `#warning`, not a suppressed `#error` |

---

**End of Topic 5: C++23 Language Features**
