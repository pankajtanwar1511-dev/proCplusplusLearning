## TOPIC: std::expected - Explicit Error Handling Without Exceptions

### THEORY_SECTION: A Type-Safe Alternative to Exceptions and Error Codes

---

#### 1. The Problem: Error Handling Trade-offs Before C++23

C++ has never had one clear answer to "how do I report failure?" Every existing mechanism trades off type safety, control-flow clarity, and performance differently.

**Exceptions:**

```cpp
// ❌ Exceptions hide the failure path in the type signature
double parse_price(const std::string& text) {
    if (text.empty()) {
        throw std::invalid_argument("empty price string");
    }
    return std::stod(text);  // may also throw std::invalid_argument / out_of_range
}

// Caller has no static indication that this function can fail
double price = parse_price(input);  // Looks infallible, isn't
```

- Unwinding cost is non-trivial (though "zero-cost" when not thrown, the throw path is expensive).
- Not usable at all in codebases built with `-fno-exceptions` (embedded, kernel, some game engines, some safety-critical domains).
- The function signature gives no clue that failure is possible — you must read the implementation or documentation.

**Error codes:**

```cpp
// ❌ Easy to ignore, and the "error" and "value" are two separate out-parameters
int parse_price(const std::string& text, double& out_price) {
    if (text.empty()) return EINVAL;
    out_price = std::stod(text);
    return 0;
}

double price;
parse_price(input, price);   // Return value silently discarded — bug!
```

- No compiler enforcement that the caller checks the return code.
- No type-safe payload for the *value*; it must live in an out-parameter, which is uninitialized garbage on failure unless the callee is careful.
- Composing several fallible calls means manually threading an error variable through every step.

**`std::optional<T>`:**

```cpp
// ❌ optional tells you IF something failed, never WHY
std::optional<double> parse_price(const std::string& text) {
    if (text.empty()) return std::nullopt;
    return std::stod(text);
}
```

- Great for "value or nothing," but a `std::nullopt` carries zero diagnostic information. Was the string empty? Malformed? Out of range? The caller can't tell.

**Comparison Table:**

| Mechanism | Type-safe payload | Can't be silently ignored | Carries error detail | Works with `-fno-exceptions` | Composable/chainable |
|---|---|---|---|---|---|
| **Exceptions** | ✅ (thrown object) | ✅ (propagates) | ✅ | ❌ | ⚠️ (try/catch nesting) |
| **Error codes / `errno`** | ❌ (usually an int) | ❌ | ⚠️ (limited) | ✅ | ❌ |
| **`std::optional<T>`** | ✅ (for the value) | ❌ (must check) | ❌ (no error type) | ✅ | ⚠️ (has `and_then` etc. since C++23 too) |
| **`std::expected<T, E>`** | ✅ (value AND error) | ❌ (must check, but `[[nodiscard]]`-friendly) | ✅ | ✅ | ✅ (monadic API) |

C++23 introduces `std::expected<T, E>` (header `<expected>`), standardized by **P0323** ("`std::expected`"), to close this gap: a value-or-error type where the error carries a real, typed payload, with no exceptions and no out-parameters required.

---

#### 2. `std::expected<T, E>` — Core API

`std::expected<T, E>` holds *either* a `T` (the success value) *or* an `E` (the error value) — never both, never neither. Conceptually it is a two-alternative variant with a value-biased API, similar in spirit to Haskell's `Either` or Rust's `Result<T, E>`.

**Construction:**

```cpp
#include <expected>

std::expected<double, std::string> parse_price(const std::string& text) {
    if (text.empty()) {
        return std::unexpected("empty price string");   // error case
    }
    try {
        return std::stod(text);                          // success case (implicit from T)
    } catch (const std::exception& e) {
        return std::unexpected(std::string("parse failure: ") + e.what());
    }
}
```

- A plain `T` (or anything convertible to `T`) constructs the success state.
- `std::unexpected<E>` (or `std::unexpect_t` in-place construction) constructs the error state — the "tag" that disambiguates which alternative you mean when `T` and `E` might otherwise be ambiguous.

**Observers:**

```cpp
auto result = parse_price("19.99");

if (result.has_value()) {          // or: if (result)
    std::cout << *result << '\n';  // operator* — UB if no value, like optional
}

if (result) {
    std::cout << result.value() << '\n';   // throws bad_expected_access<E> if no value
} else {
    std::cout << "Error: " << result.error() << '\n';  // access the E payload
}

double safe_price = result.value_or(0.0);  // fallback if no value
```

| Member | Behavior on success | Behavior on failure |
|---|---|---|
| `has_value()` / `operator bool` | `true` | `false` |
| `value()` | returns `T&` | throws `std::bad_expected_access<E>` (constructed from a *copy* of the error) |
| `operator*` / `operator->` | returns `T&` / `T*` | **undefined behavior** (unchecked, like `optional`) |
| `error()` | **undefined behavior** if called on a value-holding `expected` | returns `E&` |
| `value_or(default)` | returns the value | returns `default`, converted to `T` |

Note the asymmetry with `std::optional`: `optional` has no `E`, so there is nothing to retrieve on the "empty" branch. `std::expected` adds `error()` as the dual of `value()`, and `bad_expected_access<E>` as the dual of `bad_optional_access` — but the thrown exception object actually carries the `E` value, so even the "fell back to exceptions" path preserves error information.

---

#### 3. Monadic Operations (P2505) — Composing Fallible Pipelines

`std::expected` shipped in C++23 with the same four monadic member functions added to `std::optional`, standardized together by **P2505** ("Monadic Functions for `std::expected`" — a companion to P0798 which added them to `optional`):

| Operation | Signature intent | Runs when | Purpose |
|---|---|---|---|
| `and_then(f)` | `f(value) -> expected<U, E>` | has value | Chain another fallible step, same error type |
| `or_else(f)` | `f(error) -> expected<T, G>` | has error | Recover from / translate an error |
| `transform(f)` | `f(value) -> U` | has value | Map the success value, wrapping the result automatically |
| `transform_error(f)` | `f(error) -> G` | has error | Map the error value, wrapping the result automatically |

**Example — a parse → validate → convert pipeline:**

```cpp
struct ParseError { std::string message; };

std::expected<double, ParseError> parse(const std::string& text);
std::expected<double, ParseError> validate_range(double value);
std::expected<int, ParseError>    to_cents(double value);

// Chained, monadic style:
std::expected<int, ParseError> price_in_cents =
    parse(input)
        .and_then(validate_range)
        .and_then(to_cents)
        .or_else([](const ParseError& e) -> std::expected<int, ParseError> {
            log_warning(e.message);
            return std::unexpected(e);   // re-propagate after logging
        });
```

**The equivalent without monadic operations (nested checks):**

```cpp
// ❌ Same logic, manual unwrapping — the "arrow code" this feature avoids
auto parsed = parse(input);
if (!parsed) { log_warning(parsed.error().message); return std::unexpected(parsed.error()); }

auto validated = validate_range(*parsed);
if (!validated) { log_warning(validated.error().message); return std::unexpected(validated.error()); }

auto cents = to_cents(*validated);
if (!cents) { log_warning(cents.error().message); return std::unexpected(cents.error()); }

return cents;
```

**The equivalent with exceptions (for contrast):**

```cpp
// Compact, but the failure path is invisible in every signature above,
// and every layer between throw and catch pays the unwind cost.
try {
    return to_cents(validate_range(parse(input)));
} catch (const ParseError& e) {
    log_warning(e.message);
    throw;
}
```

`transform` differs from `and_then` the same way `optional::transform` differs from `optional::and_then`: use `transform` when the callback returns a *plain* `U` that should be auto-wrapped into `expected<U, E>`; use `and_then` when the callback itself already returns an `expected<U, E>` (so the result isn't double-wrapped).

```cpp
std::expected<int, std::string> length = std::expected<std::string, std::string>{"hello"}
    .transform([](const std::string& s) { return static_cast<int>(s.size()); });
// length == 5, still expected<int, std::string>
```

---

#### 4. The `void` Specialization — `std::expected<void, E>`

Many operations don't produce a value on success — they either succeed or fail with a reason. `std::expected<void, E>` handles this without contorting `T` into a dummy type like `std::monostate` or `bool`:

```cpp
std::expected<void, std::string> save_to_disk(const Document& doc, const std::string& path) {
    if (!can_write(path)) {
        return std::unexpected("permission denied: " + path);
    }
    write_bytes(path, doc.serialize());
    return {};   // success — default-constructs the "has value" state
}

auto result = save_to_disk(doc, "/etc/readonly.txt");
if (!result) {
    std::cerr << "Save failed: " << result.error() << '\n';
}
```

Restrictions specific to the `void` specialization: there is no `value()` returning a reference to `void` (it exists but returns nothing useful and still throws on error), no `operator*`, and `value_or` is not meaningful — but `has_value()`, `error()`, `and_then`, `or_else`, and `transform_error` all work exactly as with non-`void` `T`.

---

#### 5. Error Propagation Style, and How It Compares to Rust's `Result`

`std::expected`'s design is deliberately close to Rust's `Result<T, E>` and its monadic combinators (`map`, `and_then`, `map_err`) — both descend from the same functional-programming lineage (`Either` in Haskell/ML-family languages). The mapping is direct:

| C++23 `std::expected<T, E>` | Rust `Result<T, E>` | Purpose |
|---|---|---|
| `and_then` | `and_then` | Chain a fallible step |
| `or_else` | `or_else` | Recover/translate error |
| `transform` | `map` | Map success value |
| `transform_error` | `map_err` | Map error value |
| `value()` (throws) | `.unwrap()` (panics) | Assert success, propagate loudly if wrong |
| *(no direct equivalent)* | `?` operator | Early-return propagation |

The one meaningful gap: Rust's `?` operator gives *syntactic* early-return propagation — a fallible call inside a fallible function auto-returns the error with one character. C++23 has no equivalent operator, so early-return style is written explicitly:

```cpp
std::expected<Config, ConfigError> load_config(const std::string& path) {
    auto text = read_file(path);
    if (!text) return std::unexpected(text.error());   // manual "early return"

    auto parsed = parse_toml(*text);
    if (!parsed) return std::unexpected(parsed.error());

    return build_config(*parsed);
}
```

This is more verbose than `?`, but it composes well with `and_then` for linear pipelines (Section 3), and unlike exceptions, every one of these early returns is visible in the function's control flow and reflected in its signature.

---

#### 6. When to Still Prefer Exceptions

`std::expected` does not replace exceptions; the two serve different failure categories.

| Situation | Prefer | Why |
|---|---|---|
| Recoverable, *expected* failure on a well-trodden path (parse errors, file-not-found, validation) | `std::expected<T, E>` | Caller is expected to handle it; cost of checking is explicit and cheap |
| Truly exceptional, rarely-happens condition (invariant violation, out-of-memory, corrupted internal state) | Exceptions (or `std::terminate`/assert) | Not meant to be handled at every call site; unwinding cost is acceptable because it's rare |
| Public library API boundary where callers in many languages/bindings must observe failure | `std::expected` or error codes | Exceptions don't cross language/ABI boundaries cleanly |
| Hot-path / performance-critical code called extremely frequently, where failure is common (not exceptional) | `std::expected<T, E>` | Avoids exception-handling overhead that scales with call frequency, not just failure frequency |
| Codebase compiled with exceptions disabled (`-fno-exceptions`) | `std::expected<T, E>` | Exceptions are unavailable entirely |
| Constructors, which cannot return a value at all | Exceptions (or a separate factory function returning `std::expected<T, E>`) | `expected` can't help a constructor report failure directly — use the "named constructor" / factory-function idiom instead |

A widely adopted guideline: reserve exceptions for conditions a caller is not expected to routinely check for, and use `std::expected` for the "this can fail, and the failure is part of your API's contract" cases — mirroring the same C++ Core Guidelines philosophy that predates `expected` ("don't use exceptions for control flow").

---

#### 7. Interop Notes

- **No implicit conversion to/from `std::optional<T>`.** `expected<T, E>` and `optional<T>` are unrelated types; converting between them (e.g., discarding the error to get an `optional<T>`, or supplying a default `E` to lift an `optional<T>` into an `expected<T, E>`) must be done explicitly.
- **Comparisons:** `operator==` is defined between two `expected<T, E>` objects (comparing the active alternative), and directly against a bare `T` or `std::unexpected<E>`, so `result == 42` and `result == std::unexpected(err)` both work without unwrapping first.
- **Relation to hand-rolled `std::variant`-based Result types.** Before C++23, it was common to fake this with `std::variant<T, E>` (or a wrapping struct), losing the value-biased ergonomics (`if (result)`, `*result`, `value_or`) and requiring `std::visit`/`std::get_if` boilerplate everywhere. `std::expected` standardizes exactly that pattern with a value-biased, `optional`-like interface plus a proper error channel — so most pre-C++23 "Result<T,E>" utility types in existing codebases are now candidates for replacement by `std::expected` when upgrading.
- **`std::unexpected<E>`** is a small wrapper type in its own right (not just a tag) — it stores the `E` and is itself comparable and constructible independently, which is why it can be returned directly (`return std::unexpected(err);`) and converted into any matching `expected<T, E>`.

---

#### 8. Compile-Time vs Runtime Breakdown

Almost everything about `std::expected` other than the single discriminant check is decided by the compiler before your program ever runs — there is no vtable, no RTTI lookup, and no dynamic dispatch anywhere in its happy path.

| Code / Mechanism | Phase | What Happens |
|---|---|---|
| `std::expected<int, ParseError>` layout | Compile time | Compiler computes `max(sizeof(int), sizeof(ParseError)) + discriminant` — a fixed-size type baked into the ABI, no heap involved |
| `result.and_then(f).transform(g)` chain | Compile time | Each `.and_then`/`.transform` call resolves to a concrete, inlinable function call sequence; there is no virtual dispatch or type erasure anywhere in the chain |
| `std::unexpected(err)` construction | Compile time (mostly) | Which constructor/converting-constructor overload is selected is resolved at compile time; only the actual byte copy of `err` into storage happens at runtime |
| `if (result)` / `result.has_value()` | Runtime | One real branch, reading a single discriminant byte/bool — the only "did it fail?" cost on every call |
| `result.value()` on the error branch | Runtime (failure path only) | Throws `bad_expected_access<E>` — the one place genuine, non-trivial runtime cost (stack unwinding, RTTI catch matching) can appear, and only when you're already on the failure path |
| `result.value_or(default)` | Runtime | One branch plus either a move of the held value or a construction of `default` — no exception machinery involved either way |

The key takeaway: the *type* of the whole pipeline — how many alternatives, how large the storage is, which functions get called in which order — is nailed down entirely at compile time. The only thing left for runtime is reading one flag and branching on it.

#### 9. Memory Model

`std::expected<T, E>` has no separate "control block," no reference count, and no heap allocation of its own — it is exactly as big as `max(sizeof(T), sizeof(E))` plus a small discriminant, living wherever the `expected` object itself lives (a local variable's stack frame, a member of a heap-allocated struct, a `std::vector<expected<...>>`'s contiguous storage — `expected` doesn't care, it just occupies that space inline):

```
Stack frame calling parse_price(...)
┌──────────────────────────────────────────────┐
│ std::expected<double, ParseError> result       │
│ ┌────────────────────────────────────────────┐ │
│ │ storage: max(sizeof(double), sizeof(ParseError)) bytes │
│ │ discriminant: 1 byte (has_value flag)        │ │
│ └────────────────────────────────────────────┘ │
│   (no pointer to the heap — nothing to free)   │
└──────────────────────────────────────────────┘

Compare: a thrown exception's path
┌───────────────────┐        ┌─────────────────────────────┐
│ throw ParseError{} │ ─────▶ │ heap-allocated exception obj  │
└───────────────────┘        │ + stack unwind tables walked  │
                              │ + RTTI type match at each catch│
                              └─────────────────────────────┘
```

**Why this matters for low latency:** `std::expected` turns error propagation into a fixed, small, branch-predictable cost that is paid identically on *every* call — success or failure — instead of exceptions' "free until thrown, then unboundedly expensive" cost model (unwinding cost scales with call-stack depth and isn't easily bounded ahead of time). For code paths that run millions of times per second and where "failure" is a routine, expected outcome rather than a rare emergency, a guaranteed one-branch check beats a mechanism whose worst-case latency is effectively unpredictable — this is exactly why HFT engines, real-time audio/game loops, and other latency-sensitive systems that build with `-fno-exceptions` reach for `std::expected` (or an equivalent hand-rolled Result type) instead of throwing.

---

### EDGE_CASES: Where std::expected Bites Back

#### Edge Case 1: `.value()` on an Error Throws `bad_expected_access<E>`, Not Your Exception Type

Calling `.value()` on an `expected` that holds an error does not rethrow whatever you originally wrapped — it throws `std::bad_expected_access<E>`, a wrapper that carries a *copy* of your `E`.

```cpp
#include <expected>
#include <iostream>
#include <string>

struct ParseError { std::string message; int code; };

std::expected<int, ParseError> parse(const std::string& s) {
    if (s.empty()) return std::unexpected(ParseError{"empty input", 1});
    return std::stoi(s);
}

int main() {
    auto result = parse("");
    try {
        int value = result.value();   // holds an error -> throws
        std::cout << value << '\n';
    } catch (const std::bad_expected_access<ParseError>& e) {
        // e.error() gives back YOUR ParseError, not a generic message
        std::cout << "Failed: " << e.error().message
                   << " (code " << e.error().code << ")\n";
    }
}
```

**Output:**
```
Failed: empty input (code 1)
```

The catch clause must name `bad_expected_access<ParseError>` (or a base it derives from) — catching `std::exception` also works since `bad_expected_access<E>` derives from `std::exception`, but catching `std::bad_expected_access<SomeOtherType>` will NOT match, even if `SomeOtherType` looks similar. This is a common source of "why didn't my catch block fire?" confusion when refactoring an error type.

---

#### Edge Case 2: `E` Can Never Be `void` — Only `T` Can

`std::expected<T, void>` is ill-formed. `T` may legitimately be `void` (a fallible operation with no return value — see the main theory section), but the error channel must always carry *some* type, because "having failed for no describable reason" isn't a useful contract.

```cpp
// ❌ Does not compile: E = void is disallowed
// std::expected<int, void> bad;   // error: void is not a valid error type

// ✅ If you truly have no error payload, say so explicitly:
struct Failure {};   // an empty tag type carries the same "zero info" as void would
std::expected<int, Failure> minimal{std::unexpected(Failure{})};

// ✅ Or use a type that at least documents *why*, even minimally:
std::expected<int, std::string> withReason = std::unexpected("something went wrong");
```

The rule of thumb: if you're reaching for `expected<T, void>`, you almost certainly want `std::optional<T>` instead — `optional` *is* the "value or nothing, no reason given" type. Reach for `expected` specifically because you have (or plan to have) something to say on failure.

---

#### Edge Case 3: Ambiguous Construction When `T` and `E` Overlap

If `T` and `E` are the same type (or one is implicitly constructible from the other), a bare value handed to the constructor is ambiguous about which alternative you mean — `std::unexpected` is not just a style preference here, it is the only way to disambiguate.

```cpp
// T and E are both std::string — which alternative is this?
std::expected<std::string, std::string> risky{"oops"};
// This actually constructs the VALUE state (implicit conversion targets T first),
// which is almost certainly not what you meant if "oops" was supposed to be an error!

// ✅ Be explicit about the error branch, always:
std::expected<std::string, std::string> correct = std::unexpected("oops");
```

This is a real, easy-to-miss bug class: a plain string, int, or enum error type that happens to also be constructible as `T` will silently land in the success branch unless every error-producing return goes through `std::unexpected` explicitly. Code review checklists for `expected`-heavy codebases should treat a bare `return some_value;` inside an error path as a red flag.

---

#### Edge Case 4: `and_then` Requires the Same `E` — Mixing Error Types Doesn't Compile

`and_then`'s callback must return an `expected<U, E>` with the *exact same* `E` as the object it's chained from. If a later step wants to report a different error type, you must `transform_error` first to unify the error channel.

```cpp
struct NetworkError { int status; };
struct ParseError    { std::string reason; };

std::expected<std::string, NetworkError> fetch(const std::string& url);
std::expected<int, ParseError>           parse_response(const std::string& body);

// ❌ Does not compile: and_then's callback returns expected<int, ParseError>,
// but the chain so far carries NetworkError — E must match.
// auto result = fetch(url).and_then(parse_response);

// ✅ Fix: unify the error type first with transform_error
struct AppError { std::string message; };

auto to_app_error_net   = [](NetworkError e) { return AppError{"network: " + std::to_string(e.status)}; };
auto to_app_error_parse = [](ParseError e)   { return AppError{"parse: " + e.reason}; };

std::expected<int, AppError> result =
    fetch(url)
        .transform_error(to_app_error_net)
        .and_then([&](const std::string& body) {
            return parse_response(body).transform_error(to_app_error_parse);
        });
```

The compiler error for the broken version is a wall of template-substitution failure text pointing at `and_then`'s constraint — the actual problem (mismatched `E`) is easy to miss unless you already know to look for it.

---

#### Edge Case 5: Equality Comparisons Work Directly Against Bare Values and `unexpected`

`operator==` is defined not just between two `expected<T, E>` objects, but directly against a bare `T` or a `std::unexpected<E>` — so comparisons don't require unwrapping first, which is easy to forget and just as easy to over-correct for.

```cpp
std::expected<int, std::string> r1 = 42;
std::expected<int, std::string> r2 = std::unexpected("failed");

std::cout << std::boolalpha;
std::cout << (r1 == 42) << '\n';                       // true  — compares against bare T
std::cout << (r2 == std::unexpected("failed")) << '\n'; // true  — compares against unexpected<E>
std::cout << (r1 == r2) << '\n';                        // false — different alternative active
// r1 == "failed"   would NOT compile: "failed" doesn't convert to int (T), and
// isn't wrapped in std::unexpected, so neither overload matches.
```

The pitfall is the opposite direction: writing `if (result.value() == 42)` out of habit (as if `expected` behaved like a plain value) throws when `result` holds an error, whereas `if (result == 42)` degrades safely to `false`.

---

#### Edge Case 6: Storage Cost Is Not Free — `expected<T, E>` Sizes Like a Tagged Union

`std::expected<T, E>` is not a pointer-sized wrapper; its footprint is (at minimum) `max(sizeof(T), sizeof(E))` plus a discriminant, exactly like `std::variant<T, E>` or `std::optional<T>`. Returning a large `T` or `E` by value through `expected` carries the same size cost it would as a bare return type — `expected` does not add indirection, but it doesn't remove the cost of large payloads either.

```cpp
struct LargeError { char context[256]; std::vector<std::string> stack_trace; };

// sizeof(std::expected<int, LargeError>) is dominated by LargeError's footprint,
// even on the success path where LargeError is never touched.
std::expected<int, LargeError> compute();
```

For hot paths where the error payload is large but rare, consider `expected<T, std::unique_ptr<LargeError>>` (or `std::shared_ptr`) to keep the common (success) case cheap, at the cost of a heap allocation on the (rare) error path — the same trade-off `std::exception_ptr` makes for exceptions.

---

#### Edge Case 7: `.value()`'s Throw Is a Trap in `-fno-exceptions` Builds

`std::expected` is explicitly designed to work without exceptions — but `.value()` itself is specified in terms of throwing `bad_expected_access<E>`. In a codebase compiled with `-fno-exceptions` (embedded, some game engines, some safety-critical code), calling `.value()` on an error-holding `expected` does not throw (there's no exception support to throw with) — it typically terminates the program via the toolchain's throw-replacement handler.

```cpp
std::expected<int, std::string> result = compute();

// ❌ Under -fno-exceptions, this aborts the program on failure instead of
// giving you a catchable exception — there's nothing to catch it with.
int value = result.value();

// ✅ Exceptions-free-safe patterns: check first, or supply a fallback.
if (result.has_value()) {
    use(*result);
} else {
    log_error(result.error());
}

int safe_value = result.value_or(0);   // never throws, regardless of exception support
```

The lesson: in an exceptions-disabled codebase, treat `.value()` as effectively `assert`-strength (a hard crash on violation), and standardize on `has_value()`/`operator bool`/`value_or` for all normal control flow — exactly the discipline `expected` was introduced to make explicit in the first place.

---

### CODE_EXAMPLES: std::expected in Practice

#### Example 1: Parsing With a Typed Error Enum

```cpp
#include <expected>
#include <string>
#include <string_view>
#include <charconv>
#include <iostream>

enum class ParseError { Empty, InvalidFormat, OutOfRange };

std::expected<int, ParseError> parse_int(std::string_view text) {
    if (text.empty()) {
        return std::unexpected(ParseError::Empty);
    }

    int value{};
    auto [ptr, ec] = std::from_chars(text.data(), text.data() + text.size(), value);

    if (ec == std::errc::invalid_argument) {
        return std::unexpected(ParseError::InvalidFormat);
    }
    if (ec == std::errc::result_out_of_range) {
        return std::unexpected(ParseError::OutOfRange);
    }
    return value;
}

std::string_view describe(ParseError e) {
    switch (e) {
        case ParseError::Empty:         return "input was empty";
        case ParseError::InvalidFormat: return "not a valid integer";
        case ParseError::OutOfRange:    return "value out of int range";
    }
    return "unknown error";
}

int main() {
    for (auto input : {"42", "", "abc", "99999999999999"}) {
        auto result = parse_int(input);
        if (result) {
            std::cout << "\"" << input << "\" -> " << *result << '\n';
        } else {
            std::cout << "\"" << input << "\" -> error: " << describe(result.error()) << '\n';
        }
    }
}
```

**Output:**
```
"42" -> 42
"" -> error: input was empty
"abc" -> error: not a valid integer
"99999999999999" -> error: value out of int range
```

---

#### Example 2: A Parse → Validate → Convert Monadic Pipeline

```cpp
#include <expected>
#include <string>
#include <iostream>

struct ConfigError { std::string message; };

std::expected<int, ConfigError> parse_port(const std::string& text) {
    try {
        return std::stoi(text);
    } catch (...) {
        return std::unexpected(ConfigError{"port is not a number: " + text});
    }
}

std::expected<int, ConfigError> validate_port_range(int port) {
    if (port < 1 || port > 65535) {
        return std::unexpected(ConfigError{"port out of range: " + std::to_string(port)});
    }
    return port;
}

std::expected<std::string, ConfigError> to_bind_address(int port) {
    return "0.0.0.0:" + std::to_string(port);
}

int main() {
    for (auto text : {"8080", "not-a-port", "70000"}) {
        auto bind_address =
            parse_port(text)
                .and_then(validate_port_range)
                .and_then(to_bind_address);

        if (bind_address) {
            std::cout << text << " -> bind on " << *bind_address << '\n';
        } else {
            std::cout << text << " -> " << bind_address.error().message << '\n';
        }
    }
}
```

**Output:**
```
8080 -> bind on 0.0.0.0:8080
not-a-port -> port is not a number: not-a-port
70000 -> port out of range: 70000
```

---

#### Example 3: `or_else` Supplying a Fallback

```cpp
#include <expected>
#include <string>
#include <iostream>

std::expected<std::string, std::string> read_env(const std::string& key) {
    if (key == "HOME") return "/home/user";
    return std::unexpected("not set: " + key);
}

int main() {
    auto log_level =
        read_env("LOG_LEVEL")
            .or_else([](const std::string&) -> std::expected<std::string, std::string> {
                return "info";   // recover with a default instead of propagating the error
            });

    std::cout << "LOG_LEVEL = " << *log_level << '\n';   // never fails after or_else
}
```

**Output:**
```
LOG_LEVEL = info
```

---

#### Example 4: `expected<void, E>` for a Pure Validation Step

```cpp
#include <expected>
#include <string>
#include <iostream>

struct ValidationError { std::string field; std::string reason; };

std::expected<void, ValidationError> validate_username(const std::string& name) {
    if (name.empty()) {
        return std::unexpected(ValidationError{"username", "must not be empty"});
    }
    if (name.size() > 32) {
        return std::unexpected(ValidationError{"username", "must be 32 characters or fewer"});
    }
    return {};   // success: no value to carry, just "it passed"
}

int main() {
    for (auto name : {"alice", "", std::string(40, 'x')}) {
        auto result = validate_username(name);
        if (result) {
            std::cout << "\"" << name << "\" is valid\n";
        } else {
            std::cout << "\"" << (name.size() > 10 ? name.substr(0, 10) + "..." : name)
                       << "\" invalid: " << result.error().field << " " << result.error().reason << '\n';
        }
    }
}
```

**Output:**
```
"alice" is valid
"" invalid: username must not be empty
"xxxxxxxxxx..." invalid: username must be 32 characters or fewer
```

---

#### Example 5: Early-Return Propagation vs. the Exception Equivalent

```cpp
#include <expected>
#include <string>
#include <iostream>

struct IoError { std::string message; };

std::expected<std::string, IoError> read_file(const std::string& path);
std::expected<std::string, IoError> decompress(const std::string& raw);
std::expected<std::string, IoError> decrypt(const std::string& compressed);

// std::expected style: every failure point is visible in the control flow
std::expected<std::string, IoError> load_secure_document(const std::string& path) {
    auto raw = read_file(path);
    if (!raw) return std::unexpected(raw.error());

    auto compressed = decrypt(*raw);
    if (!compressed) return std::unexpected(compressed.error());

    auto plaintext = decompress(*compressed);
    if (!plaintext) return std::unexpected(plaintext.error());

    return plaintext;
}

// Exception style, for contrast: compact, but nothing in any signature above
// indicates that read_file/decrypt/decompress can fail.
std::string load_secure_document_exceptions(const std::string& path);   // may throw IoError
```

There is no printed output for this example — it demonstrates control-flow shape, not runtime behavior. The `expected` version is more verbose, but a reviewer can see every failure exit without opening `read_file`, `decrypt`, or `decompress`.

---

#### Example 6: Loading a File and Reporting a Formatted Error

```cpp
#include <expected>
#include <fstream>
#include <sstream>
#include <string>
#include <iostream>

struct FileError { std::string path; std::string reason; };

std::expected<std::string, FileError> load_text_file(const std::string& path) {
    std::ifstream in(path);
    if (!in) {
        return std::unexpected(FileError{path, "could not open file"});
    }
    std::ostringstream contents;
    contents << in.rdbuf();
    return contents.str();
}

int main() {
    auto result = load_text_file("/etc/does-not-exist.conf");

    if (result) {
        std::cout << "Loaded " << result->size() << " bytes\n";
    } else {
        std::cout << "Error loading \"" << result.error().path
                   << "\": " << result.error().reason << '\n';
    }
}
```

**Output:**
```
Error loading "/etc/does-not-exist.conf": could not open file
```

---

#### Example 7: Wrapping a Legacy Exception-Throwing API

```cpp
#include <expected>
#include <stdexcept>
#include <string>
#include <iostream>

// Legacy API you don't control — throws on failure.
double legacy_sqrt(double x) {
    if (x < 0.0) throw std::domain_error("sqrt of negative number");
    return std::sqrt(x);
}

// Boundary wrapper: catch once, expose `expected` to the rest of the codebase.
std::expected<double, std::string> safe_sqrt(double x) {
    try {
        return legacy_sqrt(x);
    } catch (const std::exception& e) {
        return std::unexpected(std::string(e.what()));
    }
}

int main() {
    for (double x : {4.0, -9.0}) {
        auto result = safe_sqrt(x);
        if (result) {
            std::cout << "sqrt(" << x << ") = " << *result << '\n';
        } else {
            std::cout << "sqrt(" << x << ") failed: " << result.error() << '\n';
        }
    }
}
```

**Output:**
```
sqrt(4) = 2
sqrt(-9) failed: sqrt of negative number
```

This wrapper pattern — catch exceptions exactly once at the boundary between legacy/third-party code and an `expected`-based codebase — lets new code stay exception-free internally while still calling into libraries that were never designed with `std::expected` in mind.

---

### QUICK_REFERENCE: std::expected Cheat Sheet

#### Core API at a Glance

| Member / Free Function | Signature Intent | Behavior on Success | Behavior on Error |
|---|---|---|---|
| Construction (plain value) | `expected<T,E> r = value;` | Constructs value state | — |
| `std::unexpected(e)` | `expected<T,E> r = std::unexpected(e);` | — | Constructs error state |
| `has_value()` / `operator bool` | `if (r)` / `if (r.has_value())` | `true` | `false` |
| `value()` | `r.value()` | returns `T&` | throws `bad_expected_access<E>` |
| `operator*` / `operator->` | `*r`, `r->member` | returns `T&` / `T*` | UB (unchecked) |
| `error()` | `r.error()` | UB (unchecked) | returns `E&` |
| `value_or(d)` | `r.value_or(d)` | returns value | returns `d` |
| `and_then(f)` | `f(T) -> expected<U,E>` | runs `f`, returns its result | passes error through unchanged |
| `or_else(f)` | `f(E) -> expected<T,G>` | passes value through unchanged | runs `f`, returns its result |
| `transform(f)` | `f(T) -> U` | wraps `f(value)` into `expected<U,E>` | passes error through unchanged |
| `transform_error(f)` | `f(E) -> G` | passes value through unchanged | wraps `f(error)` into `expected<T,G>` |
| `operator==` | `r == 42`, `r == std::unexpected(e)` | compares active alternative | compares active alternative |

#### Syntax Cheat Sheet

```cpp
#include <expected>

// Declare
std::expected<int, std::string> parse(std::string_view s);

// Success / failure construction
return 42;                          // value state
return std::unexpected("bad input"); // error state

// Observing
if (r) { use(*r); } else { log(r.error()); }
int v = r.value_or(0);

// Chaining (same E throughout)
auto out = parse(s).and_then(validate).and_then(convert);

// Recovering / translating
auto recovered = parse(s).or_else([](auto const& e) -> std::expected<int,std::string> {
    return 0; // fallback
});

// Mapping the value or the error (auto-wrapped)
auto mapped = parse(s).transform([](int v) { return v * 2; });
auto remapped_err = parse(s).transform_error([](auto const& e) { return AppError{e}; });

// void specialization
std::expected<void, std::string> validate(int v);
if (auto r = validate(v); !r) { log(r.error()); }
```

#### When to Reach for What

| Need | Use |
|---|---|
| Value or nothing, no reason needed | `std::optional<T>` |
| Value or a typed reason, recoverable/expected failure | `std::expected<T, E>` |
| Truly exceptional, rare, unrecoverable-at-this-layer condition | Exceptions |
| No return value, just success/failure + reason | `std::expected<void, E>` |
| `-fno-exceptions` codebase | `std::expected<T, E>` (never `.value()` unchecked) |
| Public API boundary crossing languages/ABI | `std::expected<T, E>` or plain error codes |

**End of Topic 3: std::expected**
