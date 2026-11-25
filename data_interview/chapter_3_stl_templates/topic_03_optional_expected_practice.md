## TOPIC: std::optional and std::expected

### PRACTICE_TASKS: Output Prediction and Bug Hunting

#### Q1
```cpp
// Q: What does this print?
#include <iostream>
#include <optional>

int main() {
    std::optional<int> a;
    std::optional<int> b = 0;
    std::optional<int> c = -7;

    std::cout << (a < c) << ' '
              << (b == 0) << ' '
              << (a == 0) << ' '
              << static_cast<bool>(b) << ' '
              << (a > -100) << '\n';
}
```

**Answer:**
```
1 1 0 1 0
```

**Explanation:**
- `a < c`: an empty optional is less than any engaged one, even -7.
- `b == 0`: engaged with 0, compares the value: true.
- `a == 0`: an empty optional is never equal to a value.
- `static_cast<bool>(b)`: tests engagement, not the value 0: true.
- `a > -100`: empty is less than every value, so "greater" is false.
- **Key Concept:** nullopt is the smallest value of `optional<T>`, and `bool(o)` means "has a value".

---

#### Q2
```cpp
// Q: How many times is "fetch" printed?
#include <iostream>
#include <optional>
#include <string>

int fetches = 0;

std::string fetch() {
    ++fetches;
    std::cout << "fetch\n";
    return "fresh";
}

int main() {
    std::optional<std::string> cache = "cached";
    for (int i = 0; i < 3; ++i) {
        std::string v = cache.value_or(fetch());
        (void)v;
    }
    std::cout << "fetches=" << fetches << '\n';
}
```

**Answer:**
```
fetch
fetch
fetch
fetches=3
```

**Explanation:**
- `value_or` is an ordinary function: its argument `fetch()` is evaluated before the call, every time, even though `cache` is engaged and the result is discarded.
- Lazy fix: `cache ? *cache : fetch()`, or C++23 `*cache.or_else([] { return std::optional<std::string>(fetch()); })`.
- **Key Concept:** `value_or` is eager; use it only with cheap defaults.

---

#### Q3
```cpp
// Q: What does this print?
#include <iostream>
#include <optional>
#include <stdexcept>

struct Conn {
    int port;
    explicit Conn(int p) : port(p) {
        if (p <= 0) throw std::invalid_argument("bad port");
        std::cout << "open " << port << '\n';
    }
    ~Conn() { std::cout << "close " << port << '\n'; }
};

int main() {
    std::optional<Conn> c;
    c.emplace(8080);
    try {
        c.emplace(-1);
    } catch (const std::exception& e) {
        std::cout << "caught: " << e.what() << '\n';
    }
    std::cout << "has_value=" << c.has_value() << '\n';
}
```

**Answer:**
```
open 8080
close 8080
caught: bad port
has_value=0
```

**Explanation:**
- `emplace` first destroys the existing `Conn` (prints `close 8080`), then constructs the new one in place.
- The constructor throws, so there is no new object: the optional is left **empty**. The old connection is gone too.
- This is the basic exception guarantee: valid state, but not the original one.
- If the old value must survive a failed replacement, build the new object first (`Conn tmp(-1);`) and then assign or swap.
- **Key Concept:** `emplace` = destroy then construct; a throwing constructor leaves the optional empty.

---

#### Q4
```cpp
// Q: Find the bug. What does ASan report?
#include <iostream>
#include <optional>
#include <string>

std::optional<std::string> load_name(int id) {
    if (id == 1) return std::string("a-rather-long-instrument-name-0001");
    return std::nullopt;
}

int main() {
    const std::string& name = load_name(1).value();
    std::cout << name.size() << ' ' << name << '\n';
}
```

**Answer:**
```
Undefined behaviour: name dangles.
GCC 11, -O0: printed "34" followed by garbage bytes and the tail of the name.
With -fsanitize=address: ERROR: AddressSanitizer: stack-use-after-scope
```

**Explanation:**
- `load_name(1)` returns a temporary optional. `.value()` returns a reference into that temporary, which is not lifetime-extended (only binding a reference directly to a temporary extends it).
- At the `;` the temporary optional is destroyed: its string's destructor frees the 34-character heap buffer, and `name` refers to a dead string object.
- ASan reports `stack-use-after-scope`: the temporary optional (and the `std::string` object inside it) lived in a stack slot of `main`, and `name.size()` reads that dead slot. The freed heap buffer is a second problem behind it.
- Without ASan the result varies: right text, garbage (as here) or a crash. Tests that happen to print the right text hide the bug.
- GCC 13+ warns at `-Wall`: "possibly dangling reference to a temporary [-Wdangling-reference]"; GCC 11 says nothing.
- **Key Concept:** Never bind a reference to `*f()` or `f().value()` when `f` returns an optional by value.

**Fixed Version:**
```cpp
#include <iostream>
#include <optional>
#include <string>

std::optional<std::string> load_name(int id) {
    if (id == 1) return std::string("a-rather-long-instrument-name-0001");
    return std::nullopt;
}

int main() {
    auto name = load_name(1);                        // keep the optional alive
    if (name) std::cout << name->size() << ' ' << *name << '\n';
}
```
- Output: `34 a-rather-long-instrument-name-0001`.

---

#### Q5
```cpp
// Q: Does this compile?
#include <iostream>
#include <optional>
#include <vector>

std::optional<int&> find_slot(std::vector<int>& v, int key) {
    for (int& x : v)
        if (x == key) return x;
    return std::nullopt;
}

int main() {
    std::vector<int> v{1, 2, 3};
    if (auto s = find_slot(v, 2)) *s = 20;
    std::cout << v[1] << '\n';
}
```

**Answer:**
```
Compile error (C++17/20/23). libstdc++ (GCC 11):
static assertion failed  (optional cannot hold a reference type)
plus errors about forming a pointer to reference type 'int&'.
```

**Explanation:**
- `std::optional` requires an object type: references, arrays, `nullopt_t` and `in_place_t` are rejected.
- C++26 adds `std::optional<T&>` (P2988); until then the idiomatic "maybe a reference" is a pointer.
- `std::optional<std::reference_wrapper<int>>` also works but is verbose.
- **Key Concept:** Before C++26, an optional reference is spelled `T*`.

**Fixed Version:**
```cpp
#include <iostream>
#include <vector>

int* find_slot(std::vector<int>& v, int key) {
    for (int& x : v)
        if (x == key) return &x;
    return nullptr;
}

int main() {
    std::vector<int> v{1, 2, 3};
    if (int* s = find_slot(v, 2)) *s = 20;
    std::cout << v[1] << '\n';   // 20
}
```

---

#### Q6
```cpp
// Q: The file does not exist. What does this print? (C++23, GCC 12+)
#include <expected>
#include <iostream>
#include <string>

std::expected<std::string, std::string> load_config(bool exists) {
    if (!exists) return "config file not found";
    return "port=9000";
}

int main() {
    auto cfg = load_config(false);
    if (cfg) std::cout << "loaded: " << *cfg << '\n';
    else     std::cout << "error: " << cfg.error() << '\n';
}
```

**Answer:**
```
loaded: config file not found
```

**Explanation:**
- A plain `return x;` in an expected-returning function always constructs the **value**. The error message became the config contents.
- Only `return std::unexpected("config file not found");` creates the error state.
- The trap exists whenever `E` is convertible to `T` (`expected<int, int>`, `expected<std::string, std::string>`). A dedicated error type (`enum class ConfigError`) makes the mistake a compile error instead.
- **Key Concept:** In `std::expected`, success is implicit and errors must be wrapped in `std::unexpected`.

**Fixed Version:**
```cpp
#include <expected>
#include <iostream>
#include <string>

enum class ConfigError { NotFound, Malformed };

std::expected<std::string, ConfigError> load_config(bool exists) {
    if (!exists) return std::unexpected(ConfigError::NotFound);
    return "port=9000";
}

int main() {
    auto cfg = load_config(false);
    if (cfg) std::cout << "loaded: " << *cfg << '\n';
    else     std::cout << "error code: " << static_cast<int>(cfg.error()) << '\n';  // 0
}
```

---

#### Q7
```cpp
// Q: What does this print? (C++23, GCC 12+)
#include <iostream>
#include <optional>

std::optional<int> half(int x) {
    if (x % 2 != 0) return std::nullopt;
    return x / 2;
}

int main() {
    std::optional<int> a = 7;
    auto r1 = a.transform(half);
    auto r2 = a.and_then(half);
    std::cout << r1.has_value() << ' ' << r1->has_value() << ' '
              << r2.has_value() << '\n';
}
```

**Answer:**
```
1 0 0
```

**Explanation:**
- `transform(f)` wraps whatever `f` returns: `half` returns `optional<int>`, so `r1` is `optional<optional<int>>`. The outer one is engaged (7 was present), the inner one is empty (7 is odd).
- `and_then(f)` expects `f` to return an optional and returns that directly: `r2` is `optional<int>`, empty.
- Using `transform` with a fallible step produces nested optionals that later code checks only halfway.
- **Key Concept:** Fallible step: `and_then`. Infallible step: `transform`.

---

#### Q8
```cpp
// Q: What does this print?
#include <iostream>
#include <optional>

int main() {
    std::optional<unsigned> retries;
    std::optional<int> lots;
    std::cout << retries.value_or(-1) << '\n';
    std::cout << lots.value_or(2.9) << '\n';
}
```

**Answer:**
```
4294967295
2
```

**Explanation:**
- `value_or(U&&)` returns `T`, converting the default with `static_cast<T>`. `-1` becomes `UINT_MAX` (4294967295 with a 32-bit `unsigned`), and `2.9` is truncated to `2`.
- No warning on GCC 11, even with `-Wall -Wextra -Wconversion -Wsign-conversion`: the conversion happens inside the library template (a system header, where warnings are suppressed).
- **Key Concept:** The default of `value_or` is converted to `T`; pass a default of the right type.

---

#### Q9
```cpp
// Q: What does this print?
#include <algorithm>
#include <iostream>
#include <optional>
#include <vector>

int main() {
    std::vector<std::optional<int>> bids{3, std::nullopt, -1, std::nullopt, 0};
    std::sort(bids.begin(), bids.end());
    for (const auto& b : bids) {
        if (b) std::cout << *b << ' ';
        else   std::cout << "_ ";
    }
    std::cout << '\n';
    std::cout << *std::max(bids.front(), bids.back()) << '\n';
}
```

**Answer:**
```
_ _ -1 0 3
3
```

**Explanation:**
- `operator<` for optionals orders every empty optional before every engaged one, then compares values.
- `std::max(empty, 3)` returns the engaged one; dereferencing it is safe here. If both were empty, `*` would be UB.
- In a "best bid" calculation, missing quotes sort first: harmless for `max`, wrong if code takes `front()` as "lowest real bid".
- **Key Concept:** Empty optionals sort first; decide explicitly where missing data belongs.

---

#### Q10
```cpp
// Q: Is this well-defined? What happens with -D_GLIBCXX_ASSERTIONS?
#include <iostream>
#include <optional>

std::optional<int> parse_port(const char* s) {
    if (s[0] == '\0') return std::nullopt;
    return 9000;
}

int main() {
    auto port = parse_port("");
    std::cout << "port " << *port << '\n';
}
```

**Answer:**
```
Undefined behaviour: dereferencing an empty optional.
GCC 11, -O0: printed an arbitrary number ("port -282947960", different each run), no error.
With -D_GLIBCXX_ASSERTIONS: aborts with
  Assertion 'this->_M_is_engaged()' failed.
```

**Explanation:**
- `operator*` has a precondition (`has_value()`), not a check. Reading the storage of an empty optional reads whatever bytes are there.
- ASan does not catch it: the storage is valid stack memory, only no `int` lives there.
- `_GLIBCXX_ASSERTIONS` turns libstdc++ preconditions into runtime checks (cheap enough for many test builds).
- Fix: check first (`if (port)`), or call `port.value()` to get `std::bad_optional_access`.
- **Key Concept:** `*opt` on empty is silent UB; enable library assertions in tests to catch it.

---

#### Q11
```cpp
// Q: Does this compile?
#include <iostream>
#include <optional>

struct Limits {
    const int max_qty;
};

int main() {
    std::optional<Limits> lim;
    lim = Limits{100};
    lim = Limits{200};
    std::cout << lim->max_qty << '\n';
}
```

**Answer:**
```
Compile error (GCC 11): use of deleted function
  'std::optional<Limits>& std::optional<Limits>::operator=(std::optional<Limits>&&)'
(Limits has a const member, so it is not assignable.)
```

**Explanation:**
- Assigning a `T` to an optional may have to assign to an existing `T` (when already engaged), so every `optional` assignment operator requires `T` to be assignable. A `const` member deletes `Limits`'s assignment operators.
- The converting `operator=(U&&)` drops out, the compiler falls back to building a temporary `optional<Limits>` and move-assigning it, and that move assignment is deleted too: hence the message mentions `optional<Limits>&&`.
- The check is at compile time, so even the first assignment (to an empty optional) is rejected.
- `emplace` never assigns: it destroys and constructs, so it works with non-assignable types.
- **Key Concept:** `o = value` needs `T` to be constructible **and** assignable; `emplace` needs only constructible.

**Fixed Version:**
```cpp
#include <iostream>
#include <optional>

struct Limits {
    const int max_qty;
};

int main() {
    std::optional<Limits> lim;
    lim.emplace(Limits{100});
    lim.emplace(Limits{200});
    std::cout << lim->max_qty << '\n';   // 200
}
```

---

#### Q12
```cpp
// Q: Does this compile? (C++23, GCC 12+)
#include <expected>
#include <iostream>
#include <string>

enum class ParseError { Empty, NotNumber };

std::expected<int, ParseError> parse(const std::string& s) {
    if (s.empty()) return std::unexpected(ParseError::Empty);
    return std::stoi(s);
}

std::expected<int, std::string> validate(int qty) {
    if (qty <= 0) return std::unexpected("qty must be positive");
    return qty;
}

int main() {
    auto r = parse("42").and_then(validate);
    std::cout << r.value() << '\n';
}
```

**Answer:**
```
Compile error (GCC 13): static assertion failed: the function passed to
std::expected<T, E>::and_then must return a std::expected with the same error_type
note: 'std::is_same_v<std::string, ParseError>' evaluates to false
```

**Explanation:**
- `and_then` can short-circuit an existing error into the result, so the result's error type must equal the input's: `expected<U, ParseError>`.
- `validate` returns `expected<int, std::string>`: the two error types are unrelated.
- Fix: convert the first error with `transform_error` before chaining, or make both steps share one error type (usually an enum or a variant of error enums).
- **Key Concept:** In an `and_then` chain every step must use the same error type; `transform_error` converts between them.

**Fixed Version:**
```cpp
#include <expected>
#include <iostream>
#include <string>

enum class ParseError { Empty, NotNumber };

std::expected<int, ParseError> parse(const std::string& s) {
    if (s.empty()) return std::unexpected(ParseError::Empty);
    return std::stoi(s);
}

std::expected<int, std::string> validate(int qty) {
    if (qty <= 0) return std::unexpected("qty must be positive");
    return qty;
}

int main() {
    auto r = parse("42")
                 .transform_error([](ParseError) { return std::string("parse failed"); })
                 .and_then(validate);
    std::cout << r.value() << '\n';   // 42
}
```

---
