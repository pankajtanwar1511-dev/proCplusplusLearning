## TOPIC: std::expected - Explicit Error Handling Without Exceptions

### INTERVIEW_QA: Comprehensive Questions

#### Q1: What problem does std::expected solve that exceptions, error codes, and optional don't?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** `std::expected<T, E>` gives a value-or-typed-error result with the failure path visible in the function signature, without exception overhead.

**Comparison:**

| Mechanism | Type-safe payload | Hard to ignore | Carries error detail | Works without exceptions |
|---|---|---|---|---|
| Exceptions | ✅ | ✅ | ✅ | ❌ |
| Error codes | ❌ | ❌ | ⚠️ limited | ✅ |
| `std::optional<T>` | ✅ (value only) | ❌ | ❌ (no reason) | ✅ |
| `std::expected<T,E>` | ✅ (value AND error) | ❌ (but `[[nodiscard]]`-friendly) | ✅ | ✅ |

`expected` is the only option that has both a typed error payload and works in `-fno-exceptions` builds.

**Key Concept:** #expected #error_handling #cpp23

</details>

---

#### Q2: How do you construct the success and error states of an expected?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** A plain (or convertible) `T` constructs the value state; `std::unexpected(e)` constructs the error state.

```cpp
std::expected<int, std::string> parse(const std::string& s) {
    if (s.empty()) return std::unexpected("empty input");  // error state
    return std::stoi(s);                                    // value state
}
```

`std::unexpected<E>` is a real wrapper type in its own right, not just a tag -- it stores the `E` and is independently constructible/comparable, which is why it can convert directly into any matching `expected<T,E>`.

**Key Concept:** #expected #unexpected #construction

</details>

---

#### Q3: What's the difference between operator*, value(), and value_or()?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** They differ in what happens on the error branch.

| Accessor | On success | On error |
|---|---|---|
| `operator*` / `operator->` | returns `T&`/`T*` | undefined behavior (unchecked) |
| `value()` | returns `T&` | throws `bad_expected_access<E>` |
| `value_or(d)` | returns the value | returns `d`, converted to `T` |

Use `operator*` only after you've already checked `has_value()`/`operator bool`. Use `value()` when you want failure to be a loud, catchable exception. Use `value_or` when you have a sensible fallback and never want to throw.

**Key Concept:** #expected #accessors #value_or

</details>

---

#### Q4: What exception type does .value() throw, and what does it carry?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** `std::bad_expected_access<E>` -- templated on the SAME error type `E` as the `expected`, and it carries a copy of the actual error value.

```cpp
try {
    result.value();
} catch (const std::bad_expected_access<ParseError>& e) {
    log(e.error());  // your actual ParseError, not a generic message
}
```

Catching the wrong `E` specialization (e.g. `bad_expected_access<std::string>` when the real type is `bad_expected_access<ParseError>`) will NOT match -- though catching the common base `std::exception` always works.

**Key Concept:** #expected #bad_expected_access #exceptions

</details>

---

#### Q5: Explain the four monadic operations: and_then, or_else, transform, transform_error.

<details>
<summary><b>Show Answer</b></summary>

**Answer:**

| Operation | Runs when | Callback returns | Purpose |
|---|---|---|---|
| `and_then(f)` | has value | `expected<U,E>` (already wrapped) | chain another fallible step |
| `or_else(f)` | has error | `expected<T,G>` (already wrapped) | recover or translate the error |
| `transform(f)` | has value | plain `U` (auto-wrapped) | map the success value |
| `transform_error(f)` | has error | plain `G` (auto-wrapped) | map the error value |

The rule for `and_then` vs `transform`: if your callback ALREADY returns an `expected`, use `and_then` (otherwise you'd get a double-wrapped `expected<expected<U,E>,E>`); if it returns a plain value, use `transform`.

**Key Concept:** #expected #monadic #and_then #transform

</details>

---

#### Q6: Why does and_then require the callback's error type to match the original E?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** `and_then` chains within a single error channel -- mixing error types would make the resulting type ambiguous, so the constraint forces you to unify errors explicitly first.

```cpp
// fetch(url) is expected<string, NetworkError>
// parse_response returns expected<int, ParseError> -- DIFFERENT E, won't compile
// fetch(url).and_then(parse_response);   // ❌

// Fix: unify with transform_error first
fetch(url)
    .transform_error(to_app_error)
    .and_then([](auto body) { return parse_response(body).transform_error(to_app_error); });
```

**Key Concept:** #expected #and_then #transform_error #error_unification

</details>

---

#### Q7: What does std::expected<void, E> look like, and why is it needed?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** It handles operations that either succeed with no value, or fail with a reason -- without contorting `T` into a dummy type.

```cpp
std::expected<void, std::string> save(bool ok) {
    if (!ok) return std::unexpected("save failed");
    return {};  // explicit success -- still required!
}
```

Restrictions specific to `void`: no `value()` returning a usable reference, no `operator*`, and `value_or` isn't meaningful -- but `has_value()`, `error()`, `and_then`, `or_else`, and `transform_error` all work normally.

**Key Concept:** #expected #void_specialization #validation

</details>

---

#### Q8: Why is E = void disallowed, but T = void allowed?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** `T` can be `void` because "succeeded with no value" is a meaningful state. `E` can never be `void` because "failed for no describable reason" isn't useful -- the error channel must always carry a real type.

```cpp
// std::expected<int, void> bad;   // ❌ ill-formed

struct Failure {};   // an empty tag documents "zero info" explicitly, if truly needed
std::expected<int, Failure> minimal = std::unexpected(Failure{});
```

If you're reaching for `expected<T, void>`, you almost certainly want `std::optional<T>` instead.

**Key Concept:** #expected #void #error_type

</details>

---

#### Q9: How does std::expected compare to Rust's Result<T, E>?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** The design is intentionally close -- both descend from the same `Either`-style functional lineage.

| C++23 `expected<T,E>` | Rust `Result<T,E>` | Purpose |
|---|---|---|
| `and_then` | `and_then` | chain a fallible step |
| `or_else` | `or_else` | recover/translate error |
| `transform` | `map` | map success value |
| `transform_error` | `map_err` | map error value |
| `value()` (throws) | `.unwrap()` (panics) | assert success loudly |
| *(no equivalent)* | `?` operator | syntactic early-return propagation |

The one real gap: C++ has no `?`-style operator, so early-return propagation is written out explicitly with manual `if (!r) return std::unexpected(r.error());` checks.

**Key Concept:** #expected #rust #result_type #comparison

</details>

---

#### Q10: When should you still prefer exceptions over std::expected?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Reserve exceptions for conditions that are truly exceptional and not meant to be routinely checked at every call site.

| Situation | Prefer |
|---|---|
| Recoverable, expected failure (parse errors, validation, file-not-found) | `std::expected<T,E>` |
| Rare invariant violation / out-of-memory / corrupted state | Exceptions |
| Hot path where failure is common, not exceptional | `std::expected<T,E>` |
| `-fno-exceptions` codebase | `std::expected<T,E>` |
| Constructors (can't return a value at all) | Exceptions, or a factory function returning `expected` |

**Key Concept:** #expected #exceptions #when_to_use

</details>

---

#### Q11: Does std::expected implicitly convert to/from std::optional?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** No. `expected<T,E>` and `optional<T>` are unrelated types with no implicit conversion in either direction -- you must bridge them explicitly.

```cpp
std::expected<int, std::string> r = parse(s);
std::optional<int> o = r ? std::optional<int>(*r) : std::nullopt;  // explicit, discards error info
```

**Key Concept:** #expected #optional #interop

</details>

---

#### Q12: How do equality comparisons work for std::expected?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** `operator==` is defined between two `expected` objects, and directly against a bare `T` or a `std::unexpected<E>` -- no manual unwrapping required.

```cpp
std::expected<int, std::string> r = 42;
r == 42;                          // true -- compares against bare T
r == std::unexpected("failed");   // false -- r holds a value, not this error
```

Two `expected` objects with different active alternatives (one holding a value, one holding an error) are never equal to each other, regardless of payload.

**Key Concept:** #expected #equality #comparison

</details>

---

#### Q13: What's the storage cost of std::expected<T, E>, and when does it matter?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** `expected<T,E>` sizes like a tagged union: at least `max(sizeof(T), sizeof(E))` plus a discriminant -- the same trade-off as `std::variant`/`std::optional`.

```cpp
struct LargeError { char buf[512]; };
std::expected<int, LargeError> compute();  // sized by LargeError, even on success
```

For a large, rarely-hit error payload on a hot path, box it: `expected<int, std::unique_ptr<LargeError>>` keeps the common success path cheap at the cost of a heap allocation on the rare error path.

**Key Concept:** #expected #performance #storage_cost

</details>

---

#### Q14: What happens if you call .value() on an error in a codebase built with -fno-exceptions?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** It does not throw (there's no exception support) -- it typically terminates via the toolchain's throw-replacement handler, i.e. a hard crash rather than a catchable error.

```cpp
// ❌ Under -fno-exceptions: aborts instead of giving a catchable exception
int value = result.value();

// ✅ Exceptions-free-safe pattern
if (result.has_value()) { use(*result); } else { log(result.error()); }
int safe = result.value_or(0);   // never throws, exceptions enabled or not
```

**Key Concept:** #expected #fno_exceptions #safety

</details>

---
