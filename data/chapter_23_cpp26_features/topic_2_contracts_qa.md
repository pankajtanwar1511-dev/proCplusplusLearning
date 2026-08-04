## TOPIC: C++26 Contracts - Preconditions, Postconditions, and Assertions

### INTERVIEW_QA: Comprehensive Questions

#### Q1: What problem do C++26 Contracts solve that `assert()` doesn't?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Contracts make a function's preconditions and postconditions part of its **declared interface**, visible to every caller -- not just buried in the `.cpp` file's body where only the implementation ever sees them.

**Problems with the pre-C++26 `assert()`-in-the-body idiom:**
1. **Invisible to callers**: a header-only declaration gives no hint that `x >= 0` is required
2. **All-or-nothing**: `NDEBUG` deletes every `assert()` in the program, whether or not that was wanted
3. **No standard postcondition mechanism**: teams invent ad hoc `ENSURES(...)`/`POSTCONDITION(...)` macros
4. **Comments rot**: `// x must be positive` is never checked by anything

**How Contracts address this:**
1. `pre(expr)`/`post(name: expr)` attach directly to the function signature
2. A build's **semantic** (`ignore`/`observe`/`enforce`) governs checking uniformly, not a single macro flag
3. `contract_assert(expr);` gives a standardized, non-macro replacement for in-body `assert()`

**Key Concept:** #contracts #cpp26 #preconditions #postconditions

</details>

---

#### Q2: What is the exact syntax for a precondition and a postcondition, and where do they appear?

<details>
<summary><b>Show Answer</b></summary>

**Answer:**

**Precondition -- attached after the parameter list:**
```cpp
double compute_sqrt(double x)
    pre(x >= 0)
{
    return std::sqrt(x);
}
```

**Postcondition -- names the return value so the condition can refer to it:**
```cpp
double compute_sqrt(double x)
    pre(x >= 0)
    post(r: r >= 0)   // 'r' names the result
{
    return std::sqrt(x);
}
```

**`void` function postcondition (no result to bind):**
```cpp
void resize_buffer(std::vector<char>& buf, size_t n)
    pre(n > 0)
    post(buf.size() == n)
{
    buf.resize(n);
}
```

Both `pre` and `post` attach to the function's declaration (and must be repeated consistently on the definition), which is precisely why they're visible in headers -- unlike an `assert()` hidden in the `.cpp` file.

**Key Concept:** #contracts #syntax #pre #post

</details>

---

#### Q3: What is `contract_assert`, and how is it different from the `pre`/`post` on a declaration?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** `contract_assert(expression);` is a **statement**, usable anywhere inside a function body, for mid-function invariants that don't belong on the signature -- the direct successor to `assert()`, but as real language grammar instead of a preprocessor macro.

```cpp
void process(std::vector<int>& data) {
    contract_assert(!data.empty());

    for (auto& x : data) {
        x *= 2;
        contract_assert(x % 2 == 0);  // Mid-loop invariant
    }
}
```

**Difference from `pre`/`post`:** those attach to the *declaration* and describe the function's interface contract with callers. `contract_assert` describes an *internal* invariant at a specific point in the body -- it complements `pre`/`post`, it doesn't replace them.

**Key Concept:** #contract_assert #assertions #cpp26

</details>

---

#### Q4: How is `contract_assert` different from the classic `assert()` macro?

<details>
<summary><b>Show Answer</b></summary>

**Answer:**

| Aspect | `assert(expr)` | `contract_assert(expr)` |
|---|---|---|
| Nature | Preprocessor macro | Real grammar production |
| Disabling | Entirely compiled out under `NDEBUG` | Governed by the same ignore/observe/enforce semantic system as `pre`/`post` |
| On failure | Implementation-defined `abort()`-style message | Goes through the standard violation-handler mechanism |
| Where valid | Anywhere textual macro substitution works | Anywhere a statement is valid |

The practical upshot: `contract_assert` isn't a single global on/off switch the way `NDEBUG` is for `assert()` -- it participates in the same semantic model as every other contract-assertion in the program.

**Key Concept:** #contract_assert #assert #comparison

</details>

---

#### Q5: What are the three contract evaluation semantics, and what happens under each?

<details>
<summary><b>Show Answer</b></summary>

**Answer:**

| Semantic | Evaluated? | On violation | Typical use |
|---|---|---|---|
| **ignore** | No | N/A -- zero cost, as if absent | Maximum-performance release builds |
| **observe** | Yes | Violation handler runs, execution **continues** | Production diagnostics without crashing |
| **enforce** | Yes | Violation handler runs, then the program **terminates** | Debug/test builds |

```cpp
int divide(int a, int b) pre(b != 0) { return a / b; }

divide(10, 0);
// ignore:  pre never evaluated -> straight into a/b -> UB
// observe: violation handler runs (e.g. logs) -> continues into a/b -> still UB, but reported
// enforce: violation handler runs -> terminates before a/b executes
```

Which semantic applies is a build-time decision; the standard defines the *model*, while exact selection mechanisms are implementation-defined and still converging.

**Key Concept:** #semantics #ignore #observe #enforce

</details>

---

#### Q6: Why must a contract-assertion's expression avoid side effects?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Because under `ignore` semantics the expression is **never evaluated at all** -- any side effect the program depends on silently never happens.

```cpp
// ❌ Dangerous
pre(initialize_resource())   // Under "ignore", initialize_resource() never runs!

// ✅ Correct
bool resource_ready = initialize_resource();  // Runs unconditionally, as an ordinary statement
pre(resource_ready)                            // Now purely a check
```

This is exactly the same discipline that has long applied to `assert()` -- but it's easier to fall into with `pre(...)`, because it looks like part of the function's signature rather than obviously-optional "debug code."

**Key Concept:** #side_effects #ignore_semantics #best_practice

</details>

---

#### Q7: If a function body throws an exception, is its postcondition checked?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** **No.** A postcondition binds to the return value on a **normal** return; throwing is a different kind of exit that never produces a result.

```cpp
double compute_sqrt(double x)
    pre(x >= 0)
    post(r: r >= 0)
{
    if (x > 1e300) {
        throw std::overflow_error("too large");  // post(r: ...) is NOT evaluated here
    }
    return std::sqrt(x);
}
```

A precondition violation and "the function threw instead of returning" are distinct events. `post()` says nothing about what happens on the exceptional path -- that has to be documented/tested separately (e.g. via the strong exception-safety guarantee).

**Key Concept:** #exceptions #postconditions #contracts

</details>

---

#### Q8: What did the C++26 Contracts MVP deliberately leave out, and why?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Several capabilities from earlier, more ambitious contracts proposals were intentionally deferred:

| Left out | Why |
|---|---|
| `axiom` assertions (unchecked, advisory-only) | Blurred the line with `[[assume]]` and reopened the "what may the optimizer assume" debate |
| Contracts on virtual functions with per-override conditions | Unresolved semantic questions about which contract applies through a base pointer |
| A standardized custom violation-handler API | Needed more design time |
| Contracts affecting mangled/ABI identity | Would have massively increased scope |

**Why:** an earlier, broader contracts design was actually voted into the **C++20** working draft and then **pulled before publication** because the committee couldn't agree on these exact questions. The C++26 MVP is a deliberately narrowed redesign meant to ship a minimal, useful core rather than repeat that failure.

**Key Concept:** #mvp #history #cpp20_withdrawal #axiom

</details>

---

#### Q9: How do `assert()`, `[[assume]]` (C++23), and Contracts (`pre`/`post`/`contract_assert`, C++26) differ?

<details>
<summary><b>Show Answer</b></summary>

**Answer:**

| Feature | Checked at runtime? | Purpose | If false |
|---|---|---|---|
| `assert(expr)` | Only without `NDEBUG` | Ad hoc debugging aid | Debug: abort. Release: skipped entirely |
| `[[assume(expr)]]` | Never | Optimizer hint | Undefined behavior |
| `pre`/`post`/`contract_assert` | Per active semantic | Declared, checkable interface contract | Well-defined violation, per semantic |

```cpp
int fast_path(int x)
    pre(x > 0)          // May be checked, well-defined violation handling
{
    [[assume(x > 0)]];  // Never checked, UB if wrong -- pure optimizer hint
    return 100 / x;
}
```

**The critical distinction:** `[[assume]]` is a promise *to the compiler* with no safety net; contracts are the opposite -- a checkable guarantee whose failure is well-defined, not UB, whenever the active semantic evaluates it.

**Key Concept:** #assume #assert #contracts #comparison

</details>

---

#### Q10: Does a postcondition need to hold for every return statement in a function, or just the "main" one?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** **Every** return statement -- `post(r: ...)` is checked once per call, at whichever exit path actually executes.

```cpp
int find_first_even(const std::vector<int>& v)
    pre(!v.empty())
    post(r: r == -1 || r % 2 == 0)
{
    for (int x : v) {
        if (x % 2 == 0) return x;   // Path A: fine
    }
    return v.front();   // ❌ Path B: BUG if v.front() is odd -- violates the postcondition
}
```

This is precisely the class of bug postconditions are designed to surface: a bug on a secondary exit path that a "happy path only" unit test would miss entirely.

**Key Concept:** #postconditions #return_paths #bug_detection

</details>

---

#### Q11: Is there a way in the C++26 Contracts MVP to compare a parameter's value before and after a call (like Eiffel's `old`)?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** **No** -- the initial MVP has no built-in "old-value" capture facility.

```cpp
// ❌ Cannot express directly in the MVP:
// void grow(std::vector<int>& v) post(v.size() > old(v.size())) { v.push_back(0); }

// ✅ Workaround: capture the value yourself before the call
size_t before = buf.size();
ensure_capacity(buf, 100);
assert(buf.size() >= before);   // Manual comparison, outside the contract system
```

This is a known, acknowledged limitation of the first MVP iteration, not an oversight in specific user code -- some Design-by-Contract languages (Eiffel) have long had an `old` keyword for exactly this, and it may be revisited in a future revision of C++ contracts.

**Key Concept:** #old_value #limitation #mvp

</details>

---
