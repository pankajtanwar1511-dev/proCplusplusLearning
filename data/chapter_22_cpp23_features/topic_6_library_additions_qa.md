## TOPIC: C++23 Library Additions - Printing, Diagnostics, and New Containers

### INTERVIEW_QA: Comprehensive Questions

#### Q1: What problem does `std::print` solve that `std::cout` and `printf` don't?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** `std::print` gives you `printf`-level directness with `std::format`-level type safety and compile-time format-string checking, and it writes straight to a stream/`FILE*` without building a throwaway `std::string`.

**Comparison:**
- `printf`: fast and terse, but format-string/argument mismatches are undefined behavior, only caught (if at all) by non-standard compiler warnings
- `std::cout <<`: fully type-safe, but verbose for anything beyond trivial output, and has no rich `{}`-style formatting
- `std::cout << std::format(...)`: type-safe AND expressive, but allocates a `std::string` just to immediately stream and discard it
- `std::print`: type-safe, expressive, compile-time checked, AND writes directly with no intermediate allocation

**Key Concept:** #std_print #p2093 #std_format #printing

</details>

---

#### Q2: How does `std::print` catch format-string bugs that `printf` cannot?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** `std::print`'s format-string parameter is typed as `std::format_string<Args...>`, whose constructor is `consteval` for string literals — meaning the compiler validates the placeholder count and each placeholder's compatibility with its corresponding argument's type *at compile time*.

```cpp
std::print("{}\n", 42);        // OK
std::print("{}\n");            // ❌ Compile error: missing argument
std::print("{:d}\n", "text");  // ❌ Compile error: 'd' invalid for a string
```

`printf`'s format string is just a `const char*` — the compiler has no standard mechanism to check it against the variadic arguments, so a mismatch is silent undefined behavior at runtime instead of a compile error.

**Key Concept:** #std_print #compile_time_checking #format_string #type_safety

</details>

---

#### Q3: What does `std::stacktrace::current()` actually capture, and what does it need to be useful?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** It captures the current call stack as a sequence of frame entries at the point it's called — but each entry's `description()`, `source_file()`, and `source_line()` are only meaningful if debug symbol information is available to resolve them.

```cpp
auto trace = std::stacktrace::current();
for (auto& entry : trace) {
    entry.description();   // function name — needs symbols
    entry.source_file();   // file — needs symbols
    entry.source_line();   // line — needs symbols
}
```

In a stripped, fully optimized release binary, capture still succeeds, but symbol resolution commonly degrades to empty strings or raw addresses. Teams wanting useful stacktraces in production need to retain debug info (even split into a separate symbol file kept out-of-band from the shipped binary).

**Key Concept:** #std_stacktrace #p0881 #debug_symbols #diagnostics

</details>

---

#### Q4: Why is capturing a `std::stacktrace` inside a custom exception type a common, recommended pattern?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Because exceptions can be caught far up the call chain, long after the original call-site context is lost — embedding a `std::stacktrace` captured *at throw time* preserves exactly where the problem originated, independent of how far the exception propagates before being handled.

```cpp
class TracedError : public std::runtime_error {
public:
    explicit TracedError(std::string msg)
        : std::runtime_error(std::move(msg)),
          trace_(std::stacktrace::current()) {}
    const std::stacktrace& trace() const { return trace_; }
private:
    std::stacktrace trace_;
};
```

A `catch` block many layers up can then print `e.trace()` to see the precise call chain that led to the throw, rather than only the (potentially uninformative) catch-site stack.

**Key Concept:** #std_stacktrace #exception_handling #diagnostics #error_reporting

</details>

---

#### Q5: Why can't `std::function` wrap a lambda that captures a `std::unique_ptr` by move?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Because `std::function` itself is copyable, and to remain copyable it requires its wrapped target to also be copy-constructible. A lambda capturing a `unique_ptr` by move has a move-only closure type, so it fails `std::function`'s copyability requirement and simply won't compile as its target.

```cpp
std::function<void()> f = [p = std::move(ptr)] { /* ... */ };  // ❌ does not compile
```

This isn't a runtime failure or a subtle bug — it's a hard compile error, because `std::function`'s copy constructor must be able to copy whatever callable is stored inside it.

**Key Concept:** #std_function #move_only_function #p0288 #type_erasure

</details>

---

#### Q6: What does `std::move_only_function` change compared to `std::function`, and what's the trade-off?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** `std::move_only_function` is itself move-only, so it never needs to copy its target — this lets it wrap move-only callables (lambdas capturing `unique_ptr`s, `promise`s, etc.) that `std::function` categorically cannot hold. It also supports const/ref/noexcept-qualified call signatures directly in its template parameter (e.g. `move_only_function<void() const>`, `move_only_function<void() &&>`), which `std::function` does not.

**Trade-off:** because it's not copyable, every hand-off requires an explicit `std::move`; code that relied on `std::function`'s implicit-copy convenience needs a small migration.

```cpp
std::move_only_function<void()> job = [p = std::move(ptr)] { /* ... */ };
enqueue(std::move(job));   // explicit move required — no implicit copy exists
```

**Key Concept:** #move_only_function #p0288 #type_erasure #ownership

</details>

---

#### Q7: How is `std::flat_map` structured differently from `std::map`, and what does that change?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** `std::map` is a red-black tree with a separate heap allocation per node; `std::flat_map` stores its keys (and values, for `flat_map`) in contiguous sorted sequences — by default `std::vector`s — and looks elements up via binary search.

| | `std::map` | `std::flat_map` |
|---|---|---|
| Storage | Per-node heap allocation | Contiguous sorted vector(s) |
| Lookup | O(log n), pointer-chasing | O(log n), cache-friendly binary search |
| Iteration | O(n), scattered memory | O(n), sequential, often vectorizable |
| Insert/erase | O(log n), no shifting | O(n) — may shift/reallocate everything |
| Reference stability | Stable across insert (except erased element) | **Not stable** across insert/erase |

The upshot: `flat_map` wins on cache locality and memory overhead for read-heavy, build-once workloads, but loses badly on iterator/reference stability and per-insert cost compared to `std::map`.

**Key Concept:** #flat_map #p0429 #cache_locality #container_selection

</details>

---

#### Q8: Why is `std::flat_map` a poor fit for a workload with frequent, incremental insertions?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Because each insertion into a `flat_map` may need to shift every element with a greater key (or reallocate the backing vector entirely) to keep the contiguous sequence sorted — an O(n) operation per insert, versus `std::map`'s O(log n) with no shifting. Inserting n elements one at a time can therefore cost up to O(n²) overall.

```cpp
std::flat_map<std::string, int> m;
for (...) m.insert({key, value});   // O(n) per insert — O(n²) total in the worst case
```

The container is designed for "build once (ideally from a sorted/batch source), then query many times," not for a hot loop of incremental single-element inserts.

**Key Concept:** #flat_map #performance #big_o #container_selection

</details>

---

#### Q9: What gap does `std::generator` fill that C++20 coroutines alone left open?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** C++20 added the coroutine *language machinery* (`co_await`, `co_yield`, `co_return`) but shipped no ready-made coroutine *types* — every project had to hand-write its own promise type, iterator, and `begin()`/`end()` plumbing just to get a usable generator. `std::generator<T>` (C++23, `<generator>`) is exactly that missing, standardized, Ranges-compatible piece.

```cpp
std::generator<int> fibonacci() {
    int a = 0, b = 1;
    while (true) { co_yield a; auto next = a + b; a = b; b = next; }
}

for (int v : fibonacci() | std::views::take(10)) { /* ... */ }
```

**Key Concept:** #std_generator #p2502 #coroutines #ranges

</details>

---

#### Q10: Why must you be careful about reference parameters in a function returning `std::generator`?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** A coroutine's frame can outlive the function call that created it — it stays suspended until the caller iterates it. If the coroutine captured a *reference* to a parameter or local, and that referenced object's lifetime ends before the generator is actually consumed, iterating the generator reads through a dangling reference (undefined behavior).

```cpp
std::generator<int> stream(const std::vector<int>& v) { for (int x : v) co_yield x; }
std::generator<int> make() {
    std::vector<int> local = {1,2,3};
    return stream(local);   // local destroyed when make() returns, but the reference lives in the coroutine frame!
}
```

The safe fix is to take such parameters **by value** into the coroutine (or otherwise guarantee the referenced object outlives the generator).

**Key Concept:** #std_generator #coroutine_lifetime #dangling_reference #p2502

</details>

---

#### Q11: What does `std::spanstream` give you that `std::stringstream` doesn't, and what's the cost?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** `std::spanstream` performs stream-style I/O (`operator<<`/`operator>>`) directly over an existing, externally-owned `std::span<char>` buffer, with zero heap allocation — unlike `std::stringstream`, which always owns and allocates its own internal buffer.

```cpp
std::array<char, 64> buffer{};
std::ospanstream out(std::span<char>(buffer));
out << "x=" << 42;                     // writes directly into buffer, no allocation
auto written = std::move(out).span();  // view of exactly the bytes written
```

**The cost:** because the backing span has fixed capacity, `spanstream` cannot grow like `stringstream` can — writing past capacity sets the stream's failure state instead of silently reallocating, so the caller must size the buffer generously and check the stream's state.

**Key Concept:** #spanstream #p0448 #allocation_free #fixed_capacity

</details>

---

#### Q12: What exactly does `std::to_underlying` do, and why prefer it over `static_cast`?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** `std::to_underlying(e)` converts a scoped enum value `e` to its underlying integer type, equivalent to `static_cast<std::underlying_type_t<E>>(e)` but without having to name the underlying type at the call site.

```cpp
enum class Color : std::uint8_t { Red, Green, Blue };
auto raw = std::to_underlying(Color::Green);   // no need to spell out std::underlying_type_t<Color>
```

In **generic code**, it's also safer than a raw `static_cast<int>(value)`: `to_underlying` is constrained to accept only enumeration types, so passing a non-enum by mistake is a compile error, whereas a generic `static_cast<int>` would silently "succeed" on any convertible type and hide the misuse.

**Key Concept:** #to_underlying #p1682 #scoped_enum #generic_programming

</details>

---

#### Q13: What is `std::unreachable()` for, and why is misuse dangerous?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** `std::unreachable()` tells the optimizer that a given code path can never execute, letting it eliminate the dead branch and skip generating a fallback (often improving switch-to-jump-table codegen). It standardizes what compilers previously offered as non-standard intrinsics (`__builtin_unreachable()`, `__assume(0)`).

```cpp
switch (d) {
    case Day::Mon: return 1;
    // ... all enumerators handled ...
    case Day::Sun: return 7;
}
std::unreachable();
```

**Misuse is dangerous** because it is purely an optimizer hint, not a checked assertion: if control flow *does* reach it (e.g. after someone adds a new enumerator without updating the switch), the result is full undefined behavior with no diagnostic — the optimizer may have already assumed the path is dead and removed surrounding safety checks.

**Key Concept:** #unreachable #p0627 #optimizer_hint #undefined_behavior

</details>

---

#### Q14: How does `std::unreachable()` differ from `assert()` and from C++26 contracts?

<details>
<summary><b>Show Answer</b></summary>

**Answer:**

| | `assert()` | `std::unreachable()` | C++26 `contract_assert` (later standard) |
|---|---|---|---|
| Checked at runtime? | Yes, in debug builds (`NDEBUG` disables it) | Never — pure hint | Depends on build's contract semantic |
| Behavior if violated | Aborts with a diagnostic (debug builds) | Undefined behavior, no diagnostic | Defined per semantic (ignore/observe/enforce) |
| Purpose | Catch logic bugs during development | Tell the optimizer a path is provably dead | Declare and (optionally) check an invariant as part of the interface |

`std::unreachable()` should only be used where the "impossible" path is *structurally* guaranteed dead (e.g., after an exhaustive `switch` over a closed enum) — not as a stand-in for a runtime-checked assertion.

**Key Concept:** #unreachable #assert #contracts #comparison

</details>

---

#### Q15: What does `import std;` provide, and what's the honest caveat about relying on it today?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** `import std;` lets a translation unit import the *entire* standard library as a single, precompiled C++20 module, instead of `#include`-ing dozens of individual headers.

```cpp
import std;   // instead of #include <iostream> <vector> <string> <algorithm> ...
```

**Benefits:** the module interface is parsed once and consumed as a binary module interface rather than re-parsed per translation unit; modules do not leak macros the way headers can; name visibility is limited to exported names.

**Honest caveat:** as of this writing, `import std;` support (BMI caching, build-system dependency scanning) is still maturing across major compilers and build systems — treat it as standardized-but-not-universally-drop-in, and verify your specific toolchain before depending on it broadly. Falling back to header includes remains fully valid C++23.

**Key Concept:** #import_std #p2465 #modules #toolchain_maturity

</details>

---

#### Q16: Why is mixing `import std;` with `#include <vector>` (etc.) in the same translation unit risky right now?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Both routes are conceptually meant to describe the same standard-library entities, so mixing them isn't a language-rules problem in principle — but it is one of the least-exercised paths across current module implementations, since most testing and real-world usage picks one style or the other per translation unit.

```cpp
import std;
#include <vector>   // redundant, and one of the least-tested combinations right now
```

Because build-system module-dependency scanning and BMI caching are still maturing, mixing styles is more likely to expose toolchain bugs (redefinition-like errors, cache inconsistencies) than either pure style used alone.

**Key Concept:** #import_std #modules #build_systems #toolchain_maturity

</details>

---

#### Q17: What's the single biggest performance caveat to know about `std::stacktrace::current()`?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Capturing a stacktrace is not free — it walks the call stack and, typically, resolves symbol information, so calling it unconditionally on a hot/frequently-executed path can dominate the program's runtime cost far beyond whatever it's "logging."

```cpp
for (int i = 0; i < 1'000'000; ++i) {
    auto trace = std::stacktrace::current();   // paid a million times — very expensive
}
```

It should be reserved for exceptional or genuinely rare diagnostic events (e.g. attached to a thrown exception, or gated behind a "something went wrong" condition), never called unconditionally in a tight loop.

**Key Concept:** #std_stacktrace #performance #hot_path #diagnostics

</details>

---

#### Q18: Do `std::format`/`std::print` placeholders support named-variable interpolation like Python f-strings?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** No. `{}` replacement fields bind to arguments **positionally** (or by an explicit numeric index, `{0}`, `{1}`), not by capturing a variable's name from the enclosing scope the way Python f-strings (`f"{name}"`) or JavaScript template literals do.

```cpp
std::print("Hello, {name}!\n");        // ❌ not valid — {name} isn't a positional/indexed reference
std::print("Hello, {}!\n", name);      // ✅ correct — binds positionally to the `name` argument
```

**Key Concept:** #std_format #std_print #placeholders #common_mistake

</details>

---
