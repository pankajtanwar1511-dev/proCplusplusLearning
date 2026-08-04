## TOPIC: std::expected - Explicit Error Handling Without Exceptions

### PRACTICE_TASKS: Bug Analysis and Prediction

#### Q1
```cpp
#include <expected>
#include <iostream>

std::expected<int, std::string> parse(const std::string& s) {
    if (s.empty()) return std::unexpected("empty input");
    return std::stoi(s);
}

int main() {
    auto result = parse("");
    std::cout << result.value() << "\n";  // Bug: value() on an error state!
}
```

**Answer:**
```
Throws std::bad_expected_access<std::string>, uncaught -> program terminates
```

**Explanation:**
- `parse("")` returns the error alternative (`std::unexpected("empty input")`)
- `result.value()` throws `bad_expected_access<std::string>` when no value is held
- No `try`/`catch` around the call -> the exception propagates out of `main` -> `std::terminate`
- **Key Concept:** `.value()` is the throwing accessor; always check `has_value()`/`operator bool` first, or use `value_or`, unless you specifically want the throw

**Fixed Version:**
```cpp
int main() {
    auto result = parse("");
    if (result) {
        std::cout << *result << "\n";
    } else {
        std::cout << "error: " << result.error() << "\n";
    }
}
```

---

#### Q2
```cpp
#include <expected>
#include <iostream>

std::expected<std::string, std::string> lookup(const std::string& key) {
    if (key == "name") return "Alice";
    return "not found";  // Bug: forgot std::unexpected!
}

int main() {
    auto r = lookup("missing");
    std::cout << std::boolalpha << r.has_value() << "\n";
}
```

**Answer:**
```
true
```

**Explanation:**
- `T` and `E` are both `std::string`, so `return "not found";` is NOT ambiguous to the compiler -- it just constructs the VALUE state
- Without `std::unexpected(...)`, any bare `T`-constructible expression lands in the success branch, even in an "error" code path
- `r.has_value()` is therefore `true`, and `*r` would print `"not found"` as if it were a legitimate value
- **Key Concept:** When `T` and `E` overlap or are mutually convertible, every error-producing `return` MUST go through `std::unexpected`, or it silently becomes a value

**Fixed Version:**
```cpp
std::expected<std::string, std::string> lookup(const std::string& key) {
    if (key == "name") return "Alice";
    return std::unexpected("not found");
}
```

---

#### Q3
```cpp
#include <expected>
#include <iostream>

struct NetworkError { int code; };
struct ParseError { std::string reason; };

std::expected<std::string, NetworkError> fetch(const std::string& url);
std::expected<int, ParseError> parse_body(const std::string& body);

std::expected<int, NetworkError> run(const std::string& url) {
    // Bug: and_then's callback returns expected<int, ParseError>, not expected<int, NetworkError>
    return fetch(url).and_then(parse_body);
}

int main() {}
```

**Answer:**
```
Compile error: no matching and_then overload / constraint not satisfied
```

**Explanation:**
- `fetch(url)` is `expected<std::string, NetworkError>`
- `and_then`'s callback must return `expected<U, E>` with the SAME `E` as the chain so far -- here `E` is `NetworkError`
- `parse_body` returns `expected<int, ParseError>`, a different error type -- `and_then` requires them to match
- The resulting error is a wall of template-substitution failure text, not an obvious one-liner
- **Key Concept:** Unify error types with `transform_error` before chaining `and_then` across functions that report different error types

**Fixed Version:**
```cpp
struct AppError { std::string message; };

std::expected<int, AppError> run(const std::string& url) {
    return fetch(url)
        .transform_error([](NetworkError e) { return AppError{"network " + std::to_string(e.code)}; })
        .and_then([](const std::string& body) {
            return parse_body(body).transform_error([](ParseError e) { return AppError{"parse: " + e.reason}; });
        });
}
```

---

#### Q4
```cpp
#include <expected>
#include <iostream>

std::expected<void, std::string> save(bool ok) {
    if (!ok) return std::unexpected("save failed");
    // Bug: forgot to return anything on the success path!
}

int main() {
    auto r = save(true);
    std::cout << std::boolalpha << r.has_value() << "\n";
}
```

**Answer:**
```
Compile error: control reaches end of non-void function returning expected<void,E> without a return
```

**Explanation:**
- `expected<void, E>`'s success state must still be constructed explicitly with `return {};`
- Unlike a real `void` function, falling off the end of a function returning `expected<void, E>` is NOT the same as "succeeding" -- it's a missing-return diagnostic, since `expected<void,E>` is a real return type
- **Key Concept:** `expected<void, E>` still requires an explicit `return {};` (or a value-constructing return) on every success path -- `void`-like doesn't mean "no return statement needed"

**Fixed Version:**
```cpp
std::expected<void, std::string> save(bool ok) {
    if (!ok) return std::unexpected("save failed");
    return {};  // explicit success
}
```

---

#### Q5
```cpp
#include <expected>
#include <optional>
#include <iostream>

std::expected<int, std::string> parse(const std::string& s);

std::optional<int> parse_optional(const std::string& s) {
    return parse(s);  // Bug: implicit expected -> optional conversion?
}

int main() {}
```

**Answer:**
```
Compile error: no viable conversion from expected<int,std::string> to optional<int>
```

**Explanation:**
- `std::expected<T,E>` and `std::optional<T>` are unrelated types with no implicit conversion between them in either direction
- Converting requires an explicit step: discard the error to get an `optional<T>` (e.g. `parse(s) ? optional<int>(*parse(s)) : std::nullopt`), or supply a default `E` to lift an `optional<T>` into an `expected<T,E>`
- **Key Concept:** Never assume `expected`/`optional` interconvert automatically -- always bridge them explicitly

**Fixed Version:**
```cpp
std::optional<int> parse_optional(const std::string& s) {
    auto r = parse(s);
    return r ? std::optional<int>(*r) : std::nullopt;
}
```

---

#### Q6
```cpp
#include <expected>
#include <iostream>

std::expected<int, std::string> r1 = 42;
std::expected<int, std::string> r2 = std::unexpected("failed");

int main() {
    std::cout << std::boolalpha << (r1 == r2) << "\n";
}
```

**Answer:**
```
false
```

**Explanation:**
- `operator==` between two `expected<T,E>` objects compares which alternative is active first
- `r1` holds a value (`42`), `r2` holds an error (`"failed"`) -- different active alternatives -- so they compare unequal regardless of the payloads
- **Note:** No bug here, this is correct `expected` comparison behavior
- **Key Concept:** `expected` equality first checks "same alternative active," then compares the payload of that alternative -- a value-state and error-state `expected` are never equal to each other

---

#### Q7
```cpp
#include <expected>
#include <iostream>

struct BigError { char buffer[512]; };

std::expected<int, BigError> compute();

int main() {
    // Bug (performance, not correctness): returning a huge E by value on the hot path
    auto r = compute();
}
```

**Answer:**
```
Compiles and runs fine -- this is a performance footgun, not a correctness bug
```

**Explanation:**
- `sizeof(std::expected<int, BigError>)` is dominated by `BigError`'s 512-byte footprint, even though the success path never touches it
- Every call to `compute()`, success or not, pays for moving/returning that footprint
- **Key Concept:** `expected<T,E>` sizes like a tagged union (`max(sizeof(T), sizeof(E))` plus a discriminant) -- a large, rarely-used `E` should usually be boxed (`std::unique_ptr<BigError>`) to keep the common success path cheap

**Fixed Version:**
```cpp
struct BigError { char buffer[512]; };

std::expected<int, std::unique_ptr<BigError>> compute();
// success path now only pays for a pointer-sized error slot
```

---

#### Q8
```cpp
#include <expected>
#include <iostream>

struct ParseError { std::string message; };

std::expected<int, ParseError> parse(const std::string& s) {
    if (s.empty()) return std::unexpected(ParseError{"empty"});
    return std::stoi(s);
}

int main() {
    try {
        int v = parse("").value();
    } catch (const std::bad_expected_access<std::string>& e) {  // Bug: wrong E type!
        std::cout << "caught\n";
    }
    std::cout << "after\n";
}
```

**Answer:**
```
Uncaught exception -- terminates before printing "caught" or "after"
```

**Explanation:**
- `parse` is `expected<int, ParseError>`, so `.value()` throws `bad_expected_access<ParseError>`
- The catch clause names `bad_expected_access<std::string>` -- a DIFFERENT specialization -- so it does not match
- Catching `std::exception` (the common base) would have worked; catching the wrong `E` specialization does not
- **Key Concept:** `bad_expected_access<E>` is templated on the exact error type; a mismatched `E` in the catch clause silently fails to catch, even though the code compiles

**Fixed Version:**
```cpp
try {
    int v = parse("").value();
} catch (const std::bad_expected_access<ParseError>& e) {
    std::cout << "caught: " << e.error().message << "\n";
}
```

---

#### Q9
```cpp
#include <expected>
#include <iostream>

std::expected<int, std::string> divide(int a, int b) {
    if (b == 0) return std::unexpected("division by zero");
    return a / b;
}

int main() {
    auto safe_value = divide(10, 0).value_or(-1);
    std::cout << safe_value << "\n";
}
```

**Answer:**
```
-1
```

**Explanation:**
- `divide(10, 0)` returns the error alternative
- `value_or(-1)` never throws; on the error branch it simply returns the supplied fallback, converted to `T` if needed
- **Note:** No bug here -- `value_or` is exactly the exception-free, always-safe accessor
- **Key Concept:** `value_or` is the right default choice whenever you have a sensible fallback and don't need the error detail at that call site

---

#### Q10
```cpp
#include <expected>
#include <iostream>

std::expected<int, std::string> step1();
std::expected<int, std::string> step2(int x);

std::expected<int, std::string> pipeline() {
    // Bug: and_then's lambda returns a plain int, not expected<int,string>
    return step1().and_then([](int x) { return x * 2; });
}

int main() {}
```

**Answer:**
```
Compile error: and_then's callback must return expected<U,E>, not a plain U
```

**Explanation:**
- `and_then` expects the callback to already return `expected<U, E>` (it does NOT auto-wrap the result)
- Here the lambda returns `int`, not `expected<int, std::string>` -- that's what `transform` is for, not `and_then`
- **Key Concept:** Use `transform` for callbacks that return a plain value to be auto-wrapped; use `and_then` only when the callback itself already returns an `expected`

**Fixed Version:**
```cpp
std::expected<int, std::string> pipeline() {
    return step1().transform([](int x) { return x * 2; });
}
```

---

#### Q11
```cpp
#include <expected>
#include <iostream>

std::expected<int, std::string> parse(const std::string& s) {
    if (s.empty()) return std::unexpected("empty");
    return std::stoi(s);
}

int main() {
    auto r = parse("42");
    if (r.value() == 42) {  // works, but consider the empty-string case
        std::cout << "matched\n";
    }
}
```

**Answer:**
```
Prints "matched" for this input, but the pattern is fragile
```

**Explanation:**
- For `"42"`, `parse` succeeds, so `r.value()` returns `42` without throwing, and the comparison prints `"matched"`
- BUT if the input were empty, `r.value() == 42` would throw `bad_expected_access<std::string>` instead of just evaluating to `false`
- The safer idiom `r == 42` compares the whole `expected` (degrading to `false` on an error state) without ever risking a throw
- **Key Concept:** Prefer `result == value` over `result.value() == value` -- the former is throw-free even when `result` holds an error

**Fixed Version:**
```cpp
auto r = parse("42");
if (r == 42) {
    std::cout << "matched\n";
}
```

---

#### Q12
```cpp
#include <expected>
#include <iostream>

std::expected<std::string, std::string> read_file(const std::string& path);
std::expected<std::string, std::string> decompress(const std::string& raw);

std::expected<std::string, std::string> load(const std::string& path) {
    auto raw = read_file(path);
    if (!raw) return raw.error();  // Bug: forgot std::unexpected!
    return decompress(*raw);
}

int main() {}
```

**Answer:**
```
Compiles, but propagates the error as if it were a SUCCESS value
```

**Explanation:**
- `T` and `E` are both `std::string` here, so `return raw.error();` constructs the VALUE state, not the error state, exactly like Q2's bug
- Callers of `load` will see `has_value() == true` even though the underlying read actually failed
- **Key Concept:** Early-return propagation of an existing error still requires `std::unexpected(...)` around it -- `return raw.error();` is never sufficient by itself when `T` and `E` overlap

**Fixed Version:**
```cpp
std::expected<std::string, std::string> load(const std::string& path) {
    auto raw = read_file(path);
    if (!raw) return std::unexpected(raw.error());
    return decompress(*raw);
}
```

---

#### Q13
```cpp
#include <expected>
#include <iostream>

std::expected<int, std::string> compute(bool ok) {
    if (!ok) return std::unexpected("failed");
    return 100;
}

int main() {
    auto r = compute(false);
    auto recovered = r.or_else([](const std::string& e) -> std::expected<int, std::string> {
        std::cout << "recovering from: " << e << "\n";
        return 0;
    });
    std::cout << *recovered << "\n";
}
```

**Answer:**
```
recovering from: failed
0
```

**Explanation:**
- `compute(false)` returns the error alternative holding `"failed"`
- `or_else`'s callback only runs on the error branch -- it prints the diagnostic, then returns a NEW `expected<int,std::string>` holding `0`
- `*recovered` dereferences that recovered value, printing `0`
- **Note:** No bug here -- this demonstrates correct `or_else` recovery semantics
- **Key Concept:** `or_else` runs only when there's an error, and its return value (a fresh `expected`) replaces the original -- it's the mirror image of `and_then`

---

#### Q14
```cpp
#include <expected>
#include <iostream>

std::expected<int, std::string> parse(const std::string& s) {
    if (s.empty()) return std::unexpected("empty");
    return std::stoi(s);
}

int main() {
    auto r = parse("7");
    int* p = &(*r);        // Bug: taking a pointer into a temporary-ish accessor result?
    r = parse("");         // reassign r to an error state
    std::cout << *p << "\n";
}
```

**Answer:**
```
Undefined behavior -- *p reads through a dangling/stale reference
```

**Explanation:**
- `*r` returns a reference to the `int` stored INSIDE `r`'s current active alternative -- `p` points at that storage, not at an independent copy
- Reassigning `r = parse("")` destroys the old value alternative and activates the error alternative, invalidating anything that pointed into the old value storage
- Dereferencing `p` afterward is undefined behavior, exactly as it would be for a `std::optional<int>` or `std::variant<int,...>` under the same kind of reassignment
- **Key Concept:** `operator*`/`operator->` give a reference into `expected`'s own internal storage; that reference/pointer is invalidated the moment the `expected` object is reassigned or destroyed

---
