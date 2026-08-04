## TOPIC: C++26 Contracts - Preconditions, Postconditions, and Assertions

### THEORY_SECTION: Declaring Function Contracts as Part of the Interface

C++26 is on track to adopt **Contracts** — `pre()`, `post()`, and `contract_assert()` — based on **P2900 "Contracts for C++"**, the accepted **Minimum Viable Product (MVP)** design voted into the C++26 working draft. This is a deliberately trimmed-down design: contracts have a long, difficult standardization history (an earlier attempt was voted into C++20 and then pulled before publication due to unresolved semantic questions), and the MVP represents the subset the committee could reach consensus on. Some details below (exact build-mode names, the full shape of the violation-handling customization surface) are still settling as of this writing and are described conceptually rather than as frozen wording.

---

#### 1. The Problem: Contracts Without a Declared Contract

Before C++26, a function's preconditions and postconditions existed only informally:

```cpp
// ❌ Pre-C++26: The "contract" is scattered and invisible to callers

// In the header (the actual interface callers see):
double compute_sqrt(double x);   // No hint that x must be >= 0!

// In the .cpp file (callers never see this):
double compute_sqrt(double x) {
    assert(x >= 0);              // Precondition, but buried in the body
    double result = std::sqrt(x);
    assert(result >= 0);         // Postcondition, also buried
    return result;
}
```

**Why this is unsatisfying:**

| Problem | Consequence |
|---|---|
| `assert()` lives in the definition, not the declaration | A caller including only the header has no idea `x >= 0` is required |
| `assert()` disappears entirely under `NDEBUG` | "Release mode" silently drops all checking, including checks a team may have wanted to keep |
| No standard way to express postconditions | Teams invent ad hoc macros (`POSTCONDITION(...)`, `ENSURES(...)`) that vary project to project |
| Comments as documentation | `// x must be positive` is not checked by the compiler or at runtime — it rots silently |
| Design-by-Contract libraries | Every library reinvents its own contract macros, with no interoperability and no compiler awareness |

The core idea of Contracts is to make preconditions and postconditions **syntax attached to the function declaration** — visible wherever the function is declared, not hidden inside a translation unit the caller never sees.

---

#### 2. Preconditions: `pre(expression)`

A precondition is attached directly to the function signature using a `pre` contract-assertion:

```cpp
// ✅ C++26: Precondition is part of the declared interface
double compute_sqrt(double x)
    pre(x >= 0)
{
    return std::sqrt(x);
}
```

**Before/after transformation:**

```cpp
// ❌ Before: precondition hidden in the body
int at(const std::vector<int>& v, int index) {
    assert(index >= 0 && index < static_cast<int>(v.size()));
    return v[index];
}

// ✅ After: precondition declared, visible in headers
int at(const std::vector<int>& v, int index)
    pre(index >= 0 && index < static_cast<int>(v.size()))
{
    return v[index];
}
```

**Why the declaration matters more than the definition:**

A function is usually *declared* in a header and *defined* in a `.cpp` file. Every caller only ever sees the declaration. An `assert()` inside the definition is invisible to:

- Static analyzers examining only the header
- IDE tooling generating signature hints/documentation
- Other translation units that merely `#include` the header
- Future maintainers reading the public API surface

By attaching `pre(...)` to the declaration (and, when repeated, to the definition — the standard requires the contract-assertions to be consistent across redeclarations), the requirement becomes discoverable at the *call site*, not just inside the implementation.

```cpp
// header.hpp
double compute_sqrt(double x) pre(x >= 0);   // Caller sees this contract

// header.cpp
double compute_sqrt(double x) pre(x >= 0) {  // Must repeat the same contract
    return std::sqrt(x);
}
```

---

#### 3. Postconditions: `post(result: expression)`

A postcondition is checked **after** the function body finishes executing but **before** control returns to the caller. It binds the return value to a name so the condition can refer to it:

```cpp
double compute_sqrt(double x)
    pre(x >= 0)
    post(r: r >= 0)     // 'r' names the return value
{
    return std::sqrt(x);
}
```

**Worked example — a `clamp`-style function:**

```cpp
int clamp_to_range(int value, int lo, int hi)
    pre(lo <= hi)
    post(r: r >= lo && r <= hi)
{
    if (value < lo) return lo;
    if (value > hi) return hi;
    return value;
}
```

Here:
- `pre(lo <= hi)` documents and (depending on build semantic) checks that the caller passed a sane range.
- `post(r: r >= lo && r <= hi)` documents and checks that whatever the implementation does internally, the result is guaranteed to land inside `[lo, hi]`.

If a future maintainer "optimizes" the function and introduces a bug that lets the result escape the range, the postcondition — not just a unit test that happens to cover that path — catches it, in exactly the build modes where checking is enabled.

**Postconditions on `void` functions** simply omit the result binding:

```cpp
void resize_buffer(std::vector<char>& buf, size_t n)
    pre(n > 0)
    post(buf.size() == n)   // no result to bind; refers to state after the call
{
    buf.resize(n);
}
```

---

#### 4. `contract_assert` — An In-Body Assertion Statement

Alongside `pre`/`post` on declarations, C++26 introduces `contract_assert(expression);` as a **statement usable anywhere inside a function body** — the direct successor to the `assert()` macro, but as real language grammar rather than a preprocessor macro:

```cpp
void process(std::vector<int>& data) {
    contract_assert(!data.empty());   // Not a macro - a language construct

    for (auto& x : data) {
        x *= 2;
        contract_assert(x % 2 == 0);  // Mid-function invariant check
    }
}
```

**`contract_assert` vs. the classic `assert()` macro:**

| Aspect | `assert(expr)` (macro, `<cassert>`) | `contract_assert(expr)` (C++26 statement) |
|---|---|---|
| Nature | Preprocessor macro | Real grammar production, part of the language |
| Disabling | Entirely compiled out when `NDEBUG` is defined | Governed by the same contract *semantic* system as `pre`/`post` (conceptually "ignore" vs. checked modes), not an all-or-nothing macro flag |
| Diagnostic on failure | Implementation-defined `abort()`-style message | Goes through the standard **violation handler** mechanism (see below), consistently with `pre`/`post` failures |
| Where it can appear | Anywhere `assert(...)` is textually valid (function-like macro) | Anywhere a statement is valid — a genuine statement, so it participates properly in things like `if constexpr` branches |
| Relationship to the type system | None — it's text substitution | Part of the same contract-assertion family as `pre`/`post`, sharing one evaluation model |

`contract_assert` does not replace `pre`/`post` — it complements them for mid-function invariants that don't naturally belong on the signature.

---

#### 5. Contract Evaluation Semantics: ignore / observe / enforce

A contract-assertion (`pre`, `post`, or `contract_assert`) is governed by a **semantic** that determines what happens when the program is built and run. The MVP defines (conceptually) three semantics:

| Semantic | Is the expression evaluated? | On violation (expression is `false`) | Typical use |
|---|---|---|---|
| **ignore** | No — the check is not evaluated at all | N/A — zero runtime cost, as if the contract-assertion were absent | Maximum-performance release builds, analogous to today's `NDEBUG` |
| **observe** | Yes | Invokes the *violation handler*, then execution **continues** | Diagnostics/telemetry in production without crashing the program |
| **enforce** | Yes | Invokes the *violation handler*, then the program **terminates** | Debug and testing builds where a broken contract must stop execution immediately |

```cpp
int divide(int a, int b)
    pre(b != 0)
{
    return a / b;
}

divide(10, 0);
// Under "ignore":  pre(b != 0) is never evaluated -> UB from the division itself
// Under "observe": violation handler runs (e.g. logs), execution continues into a/b -> still UB, but reported
// Under "enforce": violation handler runs, then the program terminates before reaching a/b
```

Which semantic applies to which contract-assertions in a given translation unit is a **build-mode decision** — the standard defines the semantic model, but the exact mechanism for selecting a semantic (compiler flag names, attributes, or a future "labeled semantics" extension) is implementation-defined and, at the time of writing, still an area where implementations and tooling are converging. Treat "ignore/observe/enforce" as the *concepts* to reason about, not as fixed command-line syntax.

**Key implication:** because `ignore` mode evaluates nothing, a contract-assertion expression **must not have side effects the program depends on** — exactly like the historical guidance for `assert()`.

```cpp
// ❌ Dangerous: relies on the side effect of the expression
pre(initialize_resource())   // Under "ignore", initialize_resource() never runs!

// ✅ Correct: the expression only checks, never performs required work
bool resource_ready = initialize_resource();
// ... 
pre(resource_ready)
```

---

#### 6. The Violation Handler

When a contract-assertion is evaluated (under `observe` or `enforce`) and found `false`, the implementation invokes a **contract-violation handler**. Conceptually, a violation event carries information such as:

- **Which kind of contract-assertion** failed (a precondition, a postcondition, or a `contract_assert`)
- **The source location** of the contract-assertion (file, line — similar in spirit to `std::source_location`)
- **The evaluation semantic in effect** (so the handler, or a human reading a log, knows whether the program is about to terminate)

By default, a violation is expected to produce a diagnostic (implementation-defined format) and, in `enforce` mode, terminate the program. The MVP's design leaves room for programs to eventually customize this handler (for example, to route violations into an application's own logging/telemetry system instead of the default behavior), but a fully standardized, portable customization API was **not** locked down in the initial MVP — this is explicitly called out as follow-up work for later revisions of the feature.

```cpp
// Conceptual sketch of what a violation handler receives — not standardized surface syntax
void my_conceptual_handler(/* contract_violation info */) {
    // kind: precondition / postcondition / assertion
    // location: file + line
    // semantic: observe / enforce
    // -> log it, send telemetry, etc.
}
```

---

#### 7. What the MVP Deliberately Leaves Out

Contracts have been attempted before: a version was voted into the **C++20** working draft and then **removed before publication** because the committee could not agree on core semantic questions (particularly around what optimizers were allowed to assume from a contract, and how virtual functions should behave). The C++26 MVP is a intentionally-narrowed redesign meant to avoid repeating that failure. Notable omissions versus earlier, more ambitious proposals:

| Left out of the MVP | Why | Status |
|---|---|---|
| **`axiom` assertions** (unchecked, documentation/optimizer-only contracts — never evaluated, purely advisory) | Blurred the line with `[[assume]]`-style optimization hints and reopened the "what may the optimizer assume" debate that sank the C++20 attempt | Deferred to a future paper |
| **Contracts on virtual functions with different conditions per override** | Subtle semantic questions about which contract applies at a call through a base pointer | Deferred / restricted in the MVP |
| **A fully standardized custom violation-handler API** | Needed more design time to get right without over-constraining implementations | Left for a follow-up proposal |
| **Contracts as part of the mangled/ABI-visible type** (e.g. contract-checking affecting overload resolution or function identity) | Would have massively increased scope | Explicitly out of scope |

The guiding principle of the MVP, as stated by its authors, is: ship a **minimal, useful, and safe** core now, and let real-world experience guide extensions in later C++ revisions — rather than trying to standardize the "complete" Design-by-Contract vision in one step, which is exactly what stalled the C++20 attempt.

---

#### 8. Contracts vs. `assert()` vs. `[[assume]]`

C++23 already added `[[assume(expr)]]` as a pure optimizer hint (covered in the C++23 chapter). It is easy to confuse the three related-but-different tools now available:

| Feature | Introduced | Checked at runtime? | Purpose | Behavior if the condition is false |
|---|---|---|---|---|
| `assert(expr)` (`<cassert>` macro) | C (pre-standard C++) | Only in debug builds (`NDEBUG` undefined) | Ad hoc debugging aid | Debug: `abort()`-style failure. Release (`NDEBUG`): condition is **not evaluated at all** — silently skipped |
| `[[assume(expr)]]` | C++23 | **Never** | Tell the optimizer "you may assume this is true" to enable better code generation | **Undefined behavior** if false — the compiler is allowed to miscompile the surrounding code |
| `pre(expr)` / `post(name: expr)` | C++26 (P2900 MVP) | Depends on the in-effect semantic (`ignore`/`observe`/`enforce`) | Declare a function's interface contract, visible at the call site | `ignore`: not evaluated. `observe`: violation handler runs, execution continues. `enforce`: violation handler runs, then terminate |
| `contract_assert(expr)` | C++26 (P2900 MVP) | Same semantic model as `pre`/`post` | In-body invariant check, successor to `assert()` | Same as above, per the active semantic |

**The critical distinction to internalize:** `[[assume]]` is a promise *to the compiler* with no runtime check and undefined behavior if broken — it is not a safety mechanism. Contracts (`pre`/`post`/`contract_assert`) are the opposite: a documented, potentially-checked interface guarantee whose failure is a well-defined event (a violation), not undefined behavior, whenever the active semantic actually evaluates it.

```cpp
int fast_path(int x)
    pre(x > 0)              // May be checked, well-defined violation handling
{
    [[assume(x > 0)]];      // Never checked, UB if wrong — pure optimizer hint
    return 100 / x;
}
```

A function can reasonably use both: `pre(x > 0)` as the documented, checkable contract for callers and tooling, and `[[assume(x > 0)]]` inside the body as a separate optimizer hint for the compiler — understanding that only the former ever protects you at runtime.

---

#### 9. Compile-Time vs Runtime Breakdown

Contracts split cleanly into a compile-time phase (syntax checking, and — critically — deciding whether any runtime code exists at all) and a runtime phase (the actual branch, only in certain build modes):

| Code / Mechanism | Phase | What Happens |
|---|---|---|
| `pre(x >= 0)` / `post(r: r >= 0)` syntax | Compile time | Parsed and type-checked as a `bool`-convertible expression referencing only names in scope; a malformed contract is a compile error, not a runtime surprise |
| Build-mode selection (`ignore` / `observe` / `enforce`) | Compile time | A global (or per-TU, implementation-defined) configuration choice that determines *whether any runtime instructions are generated at all* for the check — this is decided once, at build time, not per call |
| `ignore` mode | Compile time only | The check is fully erased — zero runtime instructions. The compiler *may* additionally treat the asserted condition as an `[[assume]]`-style fact for optimization, exactly as if you'd written the assumption by hand |
| `observe` / `enforce` mode | Runtime (every call) | Compiler emits a real `if (!(x >= 0)) handle_contract_violation(...)` branch that executes on **every** invocation of the contracted function, not just failing ones |
| The violation itself (building `std::contract_violation`, formatting a message, capturing a stack trace) | Runtime (failure path only) | Only constructed and paid for when the condition actually evaluates false — never on a successful call |

The key takeaway: which of these lines even exist in your compiled binary is a **compile-time** decision (the build mode), but whether the surviving branch is *taken* is a **runtime** one, decided fresh on every call based on live data.

#### 10. Memory Model: Hot Path vs. Cold Path

Contracts are designed so that the cost lives almost entirely on the failure path, which is rare, while the success path — the one that dominates real production traffic — stays cheap:

```
Caller invokes a contracted function
            │
            ▼
   ┌─────────────────────┐
   │ if (!(x >= 0))       │   ← 1 register compare + 1 branch
   │   (branch, cheap)    │      no heap access, no allocation
   └─────────┬───────────┘
             │
   ┌─────────┴──────────────────────────────┐
   │                                          │
   ▼ condition TRUE (common case)             ▼ condition FALSE (rare, cold path)
 fall through, run the                 handle_contract_violation(...)
 function body normally                 ├─ build std::contract_violation object (stack)
 (zero extra memory traffic             ├─ optionally: std::stacktrace::current()
  beyond the branch itself)             │    → walks frame pointers, real cost here
                                         └─ log / terminate / continue per semantic
```

The branch-compare on the hot path touches only a value already in a register — no heap, no indirection, no extra cache line. All the "expensive" work (stack unwinding info, formatting, I/O for logging) is deferred to the cold path and only paid for when something has actually gone wrong.

**Why this matters for low latency:** this cost shape — near-zero on the success path, real cost only on the rare failure path — is exactly what makes `observe` mode viable to leave *enabled in production* low-latency systems: you get a safety net (logging/telemetry on violations) without taxing the hot path that carries real traffic. `ignore` mode goes further and removes the branch entirely, potentially letting the optimizer use the asserted condition to generate tighter code than it otherwise could — the same trick as `[[assume]]`, but derived from a contract you were already documenting.

---

### EDGE_CASES: Subtleties in the Contracts MVP

#### Edge Case 1: Mutating a By-Reference Parameter Before the Postcondition Checks It

A postcondition is evaluated **after the function body finishes** — so if the body mutates a by-reference (or pointer) parameter, the postcondition sees the *mutated* state, not the state at entry. This is easy to get backwards when translating an old `assert()`-at-the-top idiom:

```cpp
// The intent: "grow the buffer to at least n bytes, and afterward its size is >= n"
void ensure_capacity(std::vector<char>& buf, size_t n)
    pre(n > 0)
    post(buf.size() >= n)   // Evaluated AFTER buf.resize() below has already run
{
    if (buf.size() < n) {
        buf.resize(n);
    }
    // buf here already reflects the resize — post() checks the NEW state, correctly.
}
```

The subtlety is not that this is wrong — it is correct — but that a postcondition referring to a by-reference parameter is implicitly a statement about **post-call state**, not a snapshot from entry. A contract-assertion that needs to compare "before" and "after" values (e.g. `post(buf.size() >= old_size)`) has no built-in "old-value" capture facility in the MVP — unlike some Design-by-Contract languages (e.g. Eiffel's `old` keyword), which is a known limitation of this first iteration.

```cpp
// ❌ Cannot express directly in the MVP — no `old(...)` facility yet:
// void grow(std::vector<int>& v) post(v.size() > old(v.size())) { v.push_back(0); }

// ✅ Workaround: capture the value yourself before the call if you need it
size_t before = buf.size();
ensure_capacity(buf, 100);
assert(buf.size() >= before);   // Manual "old value" comparison, outside the contract system
```

---

#### Edge Case 2: A Postcondition Must Hold for *Every* Return Statement, Not Just the One You Were Thinking About

`post(r: ...)` is checked once per call, at whichever `return` statement actually executes — but it is trivially easy to write a postcondition while mentally testing it against only the "main" return path and forget a secondary one:

```cpp
int find_first_even(const std::vector<int>& v)
    pre(!v.empty())
    post(r: r == -1 || r % 2 == 0)   // "either not found, or an even value"
{
    for (int x : v) {
        if (x % 2 == 0) {
            return x;          // Path A: checked against post() — fine, x is even
        }
    }
    return v.front();           // ❌ Path B: BUG — falls through returning an ODD value
                                 //     if none are even, violating post(r: r == -1 || ...)
}
```

The author clearly meant to `return -1` when nothing even is found, but a copy-paste mistake left `return v.front();`. Because the postcondition is attached to the *declaration*, it fires on **every** exit path automatically — this is precisely the class of bug contracts are designed to catch that a unit test only covering "the happy path" would miss. The fix is functional (return the right value), not a change to the contract:

```cpp
int find_first_even(const std::vector<int>& v)
    pre(!v.empty())
    post(r: r == -1 || r % 2 == 0)
{
    for (int x : v) {
        if (x % 2 == 0) return x;
    }
    return -1;   // ✅ Now every exit path satisfies the postcondition
}
```

---

#### Edge Case 3: Contracts and Exceptions — What Happens If the Body Throws?

If a function body throws an exception before reaching a `return` statement, the function never produces a "result" — so its `post(r: ...)` is conceptually about the **normal-return** path only. Exiting via an exception is a different kind of contract entirely (the standard treats it as leaving via the exceptional path, not a postcondition violation):

```cpp
double compute_sqrt(double x)
    pre(x >= 0)
    post(r: r >= 0)
{
    if (x > 1e300) {
        throw std::overflow_error("input too large");   // Leaves via exception —
    }                                                     // post(r: ...) is NOT evaluated,
    return std::sqrt(x);                                  // because no 'r' was ever produced.
}
```

The important distinction to internalize: a precondition violation and a postcondition-on-throw are **not the same event**. `pre(x >= 0)` is checked on entry regardless of how the function later behaves; `post(r: r >= 0)` simply has nothing to check if the function exits by throwing instead of returning. Do not assume a `post()` is a "this function always leaves the system in state X" guarantee that also covers its exceptional exits — if that guarantee matters, it has to be documented and tested separately (e.g. via the strong exception-safety guarantee), not expressed through `post()`.

---

#### Edge Case 4: Contracts on Virtual Functions Are a Deliberately Unsettled Area

The MVP is cautious about virtual functions precisely because C++20's contracts attempt got tangled up in exactly this question: if a base class declares `pre`/`post` on a virtual function, does an override inherit, strengthen, or ignore that contract?

```cpp
struct Shape {
    virtual double area() const
        post(r: r >= 0)     // Base class promises a non-negative area
    = 0;
};

struct BuggyShape : Shape {
    double area() const override {
        return -1.0;         // Does the BASE CLASS'S post() apply here, or only its own (absent) one?
    }
};
```

At the time of writing, whether (and how) a derived override is checked against a base's contract-assertions is one of the areas the MVP explicitly restricts or leaves for follow-up work rather than fully specifying — this was one of the concrete open questions that helped sink the earlier C++20 attempt. Treat contracts on virtual functions as an area to watch for refinement in later revisions of the feature rather than something to rely on today for polymorphic guarantees.

---

#### Edge Case 5: A Precondition Expression With a Side Effect Behaves Differently Under Different Semantics

Because `ignore` semantics skip evaluating the expression **entirely**, a contract-assertion that relies on a side effect will silently behave differently depending on which semantic is active — exactly the historical `assert()` trap, but easier to fall into because `pre(...)` looks like part of the function signature, not "debug code":

```cpp
bool register_and_check(Registry& reg, int id)
    pre(reg.register_id(id))   // ❌ register_id() both registers AND returns success/failure
{
    // ...
}

// Under "enforce"/"observe": register_id(id) actually RUNS as part of evaluating pre(...)
// Under "ignore":            register_id(id) NEVER RUNS — id is silently never registered!
```

This is not a corner case an optimizer invented — it is a direct consequence of the semantic model: `ignore` mode's entire performance benefit comes from *not evaluating the expression at all*, so any required side effect embedded in a contract-assertion is a latent, semantic-mode-dependent bug. The fix is the same discipline long recommended for `assert()`: perform the required work as an ordinary statement, and let the contract-assertion only *read* the resulting state.

```cpp
// ✅ Correct: side effect happens unconditionally; the contract only observes it
bool registered_ok = reg.register_id(id);
// ... (statement, always runs) ...
pre(registered_ok)   // purely a check now, safe to skip under "ignore"
```

---

#### Edge Case 6: Mixing Translation Units or Libraries Built Under Different Semantics

Contract semantics are, at least conceptually, a **build-time** decision, which means it is possible to link together code where a library was compiled with `pre`/`post` in `ignore` mode while the calling code was compiled expecting `enforce` (or vice versa). Because a contract-assertion physically becomes part of the compiled function body (or not, under `ignore`), this is a genuine deployment/ABI consideration, not just a theoretical curiosity:

```cpp
// libmath.so, compiled with contracts semantic = "ignore" for release performance
double compute_sqrt(double x) pre(x >= 0) { return std::sqrt(x); }
// -> the pre(x >= 0) check was compiled OUT of this binary entirely.

// app.cpp, compiled expecting "enforce" semantics for safety
compute_sqrt(-1.0);
// The application author may believe the precondition protects them here —
// but the actual CHECK that runs (or doesn't) is determined by how libmath.so
// itself was built, not by how app.cpp was built.
```

As of this writing, the precise rules for how semantics are selected per translation unit — and what happens when they disagree across a link boundary — are still an area where tooling and vendor guidance are converging; treat any specific claim about "which semantic wins" as implementation-defined until your toolchain's documentation says otherwise.

---

### CODE_EXAMPLES: Contracts in Practice

#### Example 1: A Numeric Function With Both a Precondition and a Postcondition

```cpp
#include <cmath>

double compute_sqrt(double x)
    pre(x >= 0)          // Caller must supply a non-negative input
    post(r: r >= 0)       // Implementation guarantees a non-negative result
{
    return std::sqrt(x);
}

int main() {
    double a = compute_sqrt(16.0);   // OK: pre and post both satisfied -> a == 4.0
    // double b = compute_sqrt(-4.0);
    // Under "enforce": pre(x >= 0) fails on entry -> violation handler runs, program terminates
    // before std::sqrt is ever called with a negative argument.
}
```

Notice the precondition protects the implementation from ever having to reason about what `std::sqrt` does with a negative argument (implementation-defined/NaN territory) — the contract, not a runtime `if`, is the guard.

---

#### Example 2: A Precondition and Postcondition on a Resize-Style Method

```cpp
#include <vector>

void grow_to(std::vector<int>& buf, size_t new_size)
    pre(new_size >= buf.size())   // Only allow growing, never silently shrinking
    post(buf.size() == new_size)   // Guarantee the exact resulting size
{
    buf.resize(new_size);
}

int main() {
    std::vector<int> v(10);
    grow_to(v, 20);   // pre: 20 >= 10 (ok). Body resizes. post: v.size() == 20 (ok).

    // grow_to(v, 5);
    // pre(new_size >= buf.size()) is 5 >= 20 -> false -> violation under "enforce"/"observe".
}
```

This mirrors a very common real-world contract: an API that documents "this only grows the container" as an actual, checkable part of its signature instead of a comment a caller might not read.

---

#### Example 3: `contract_assert` Replacing a Classic Mid-Function `assert()`

```cpp
#include <vector>

void normalize_in_place(std::vector<double>& data) {
    double sum = 0.0;
    for (double x : data) sum += x;

    contract_assert(sum != 0.0);   // Mid-function invariant: can't normalize by zero

    for (double& x : data) {
        x /= sum;
    }
}
```

Functionally identical in spirit to `assert(sum != 0.0);`, but `contract_assert` participates in the same standardized semantic model (`ignore`/`observe`/`enforce`) and violation-handler mechanism as `pre`/`post`, rather than being an entirely separate, macro-based, `NDEBUG`-controlled mechanism.

---

#### Example 4: Before/After — Manual `assert()` Idiom vs. Declared Contracts

```cpp
// ❌ Before (pre-C++26 idiom): contract exists only as comments + body asserts
// Precondition: index must be in range.
// Postcondition: none expressed at all (just hoped for).
int checked_at(const std::vector<int>& v, int index) {
    assert(index >= 0 && index < static_cast<int>(v.size()));
    return v[index];
}

// ✅ After (C++26 Contracts): the SAME guarantees, now part of the declared interface
int checked_at(const std::vector<int>& v, int index)
    pre(index >= 0 && index < static_cast<int>(v.size()))
{
    return v[index];
}
```

The runtime behavior in an "enforce"-equivalent build is similar to the `assert()` version — but the C++26 version's contract is visible in `checked_at`'s declaration wherever it appears (e.g. in a header), discoverable by tooling, and governed by the same semantic system as every other contract-assertion in the program, rather than being an independent `NDEBUG`-gated macro.

---

#### Example 5: A Conceptual Sketch of Custom Violation Handling

```cpp
// NOTE: illustrative only — the exact customization surface for violation handling
// was explicitly left as follow-up work beyond the initial MVP; treat this as showing
// the SHAPE of the idea (route violations to your own logging) rather than a locked API.

void log_contract_violation(/* implementation-defined violation_info */) {
    // e.g.: log_error("contract violated at {}:{}", info.file(), info.line());
}

int divide(int a, int b)
    pre(b != 0)
{
    return a / b;
}

int main() {
    // In a hypothetical build wired to route violations through logging instead of
    // the default terminate-on-enforce behavior, calling divide(10, 0) would invoke
    // something conceptually like log_contract_violation(...) instead of aborting outright.
}
```

Until a given toolchain documents its actual violation-handler customization mechanism, the safest assumption is the default behavior described earlier in this topic: `observe` logs-and-continues, `enforce` logs-and-terminates, with no portable way yet to substitute custom behavior.

---

---

### QUICK_REFERENCE: Contracts Cheat Sheet

*(Reminder: this reflects the C++26 working-draft MVP design (P2900) — exact build-mode selection syntax is implementation-defined and still converging.)*

#### Contract-Assertion Syntax

| Form | Attaches to | Purpose | Can reference |
|---|---|---|---|
| `pre(expr)` | Function declaration/definition | Precondition — checked on entry (per semantic) | Parameters, non-local state |
| `post(name: expr)` | Function declaration/definition | Postcondition — checked after body, before return | `name` bound to the return value, parameters (post-call state) |
| `post(expr)` (no binding) | `void`-returning function | Postcondition with no result to name | Parameters/state after the call |
| `contract_assert(expr);` | Anywhere a statement is valid, inside a body | Mid-function invariant check | Any local state in scope |

#### Evaluation Semantics

| Semantic | Expression evaluated? | On violation | Cost |
|---|---|---|---|
| `ignore` | No | N/A (nothing runs) | Zero — as if absent |
| `observe` | Yes | Violation handler runs, then execution **continues** | Cost of evaluating + handler |
| `enforce` | Yes | Violation handler runs, then the program **terminates** | Cost of evaluating + handler |

#### Syntax at a Glance

```cpp
// Precondition + postcondition
double compute_sqrt(double x)
    pre(x >= 0)
    post(r: r >= 0)
{
    return std::sqrt(x);
}

// void function postcondition (no result binding)
void resize_buffer(std::vector<char>& buf, size_t n)
    pre(n > 0)
    post(buf.size() == n)
{
    buf.resize(n);
}

// Mid-function invariant
void process(std::vector<int>& data) {
    contract_assert(!data.empty());
    // ...
}
```

#### The Three Related Tools (Don't Confuse Them)

| Tool | Checked at runtime? | If false |
|---|---|---|
| `assert(expr)` | Only without `NDEBUG` | Debug: abort. Release: skipped entirely |
| `[[assume(expr)]]` (C++23) | Never | Undefined behavior |
| `pre`/`post`/`contract_assert` (C++26) | Per active semantic | Well-defined violation, per semantic |

#### What's NOT in the MVP (Yet)

- `axiom` (unchecked, advisory-only assertions)
- An `old(...)` facility for referring to pre-call state in a postcondition
- A standardized custom violation-handler API
- Fully-settled semantics for contracts on virtual function overrides

---

**End of Topic 2: C++26 Contracts**
