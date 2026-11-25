## TOPIC: std::optional and std::expected

### THEORY_SECTION: Core Concepts

#### 1. Mental model
- `std::optional<T>` (C++17) is "a `T` or nothing": storage for one `T` **inside** the optional object, plus a flag saying whether a `T` currently lives there (engaged) or not (disengaged).
- `std::expected<T, E>` (C++23) is "a `T` or the reason why not": the same idea, but the empty state carries an error value of type `E`.
- Both are **value types**: copying copies the contained object, comparing compares contents, destroying destroys the contained object. No sharing, no reference counting, no heap.
- Both make absence or failure part of the **type**: the caller cannot use the result without at least seeing that it might not be there.
- What they are not:
  - Not a pointer: `optional<T>` owns its `T`; there is no separate object being pointed at.
  - Not a replacement for every exception: they are for **expected** failures that the immediate caller handles (lookup miss, parse error, validation), not for "cannot continue at all".
- Three questions to answer for any optional-like type: where does the `T` live, what happens to it on reset/reassignment, and what does each accessor do when it is empty.

#### 2. Storage and layout
- The `T` lives in-place: an aligned buffer of `sizeof(T)` bytes inside the optional, plus a `bool`. Constructing an optional never allocates (the `T` itself may allocate, like a `std::string` with a long text).
- `sizeof(optional<T>)` is at least `sizeof(T) + 1`, rounded up to `alignof(T)`. The standard does not fix exact sizes.

| Type | sizeof (libstdc++ / GCC, x86-64) |
|---|---|
| `optional<char>` | 2 |
| `optional<bool>` | 2 |
| `optional<int>` | 8 (4 + flag, padded to align 4) |
| `optional<double>` | 16 |
| `optional<int*>` | 16 (no "use nullptr as empty" trick) |
| `optional<std::string>` | 40 (string is 32) |
| `expected<int, int>` | 8 |
| `expected<int, std::string>` | 40 |

- Triviality propagates: `optional<int>` is trivially copyable and trivially destructible; `optional<std::string>` is neither. This is why `optional<int>` can be passed in registers and memcpy'd while `optional<std::string>` cannot.
- Consequences:
  - An `optional<BigStruct>` is as big as `BigStruct`, even when empty. Arrays of `optional<Big>` waste space when mostly empty; a `std::unique_ptr<Big>` or a sparse map may be better.
  - The object stays on the stack (or wherever the optional is): an optional local has automatic storage like any other local.
  - Not the same as "pointer + null": there is no indirection, and an `optional<T*>` has two different empty states (disengaged, and engaged holding `nullptr`).

#### 3. Construction, assignment and lifetime of the contained T
- Ways to create:
  - `std::optional<T> o;` or `= std::nullopt;` or `= {};`: empty, no `T` constructed.
  - `std::optional<T> o = value;`: engaged, `T` copy/move constructed.
  - `std::optional<T> o{std::in_place, args...};` and `std::make_optional<T>(args...)`: construct `T` directly from constructor arguments (no temporary `T`).
  - `o.emplace(args...)`: destroy the current `T` if any, then construct a new one in place; returns `T&`.
- How each operation affects the contained object:

| Operation | Was empty | Was engaged |
|---|---|---|
| `o = T(...)` | Move/copy **construct** a `T` | `T`'s move/copy **assignment** (same object stays alive) |
| `o.emplace(...)` | Construct | **Destroy**, then construct |
| `o.reset()`, `o = std::nullopt`, `o = {}` | Nothing | **Destroy** `T`; optional now empty |
| `o2 = o` (both optionals) | Depends on both states: construct, assign, destroy or nothing | |
| Destructor of `o` | Nothing | Destroy `T` |

- After `reset()` the optional object is still alive; only the `T` inside it is gone. A reference or pointer obtained earlier (`T& r = *o;`) now refers to a dead object, even though the bytes are still there. This lifetime point is covered in depth in Memory & Ownership, topic 01.
- `emplace` gives only the basic guarantee: if the new `T`'s constructor throws, the old `T` is already destroyed and the optional is left **empty**.
- Moving from an optional moves the contained `T`; the source stays **engaged** (holding a moved-from `T`). See Memory & Ownership, topic 03.

#### 4. Accessing the value

| Accessor | When empty | Returns | Use when |
|---|---|---|---|
| `has_value()`, `explicit operator bool` | `false` | `bool` | Branching |
| `*o`, `o->m` | **Undefined behaviour**, no check | `T&` (or `const T&`, `T&&`) | You just checked |
| `o.value()` | Throws `std::bad_optional_access` | `T&` | Empty is a bug you want reported |
| `o.value_or(def)` | Returns `def` converted to `T` | `T` **by value** | A sensible default exists |

- `operator*` performs no check in release builds. libstdc++ checks it only with `-D_GLIBCXX_ASSERTIONS` (or `_GLIBCXX_DEBUG`): "Assertion 'this->_M_is_engaged()' failed", then abort.
- `value_or(def)`:
  - Its argument is evaluated **before** the call, whether or not the optional is engaged (normal function-argument evaluation). `o.value_or(expensive())` always runs `expensive()`.
  - It returns a copy of the contained `T`, never a reference. For a large `T` this is a full copy.
  - `def` is converted to `T`: `optional<unsigned>{}.value_or(-1)` yields 4294967295 with no warning at `-Wall -Wextra`.
- `operator bool` is explicit: `if (o)` and `!o` work; `bool b = o;` does not compile; `int x = o + 1;` does not compile.

#### 5. Comparisons, hashing and the bool trap
- Two optionals compare by: both empty equal; empty is **less than** any engaged value; otherwise compare the `T`s.
- Mixed comparisons are allowed: `o == 5`, `o < 5`, `o == std::nullopt`. An empty optional compares less than every value, including negative ones: `std::optional<int>{} < -100` is `true`.
- `std::hash<optional<T>>` exists when `std::hash<T>` exists, so optionals can be keys of unordered containers.
- `optional<bool>` and `optional<T*>` have two different "falsy" ideas:
  - `if (ob)` asks "is there a value?", not "is the value true?". An engaged `optional<bool>` holding `false` is truthy.
  - Write the intent explicitly: `if (ob.has_value() && *ob)` or `if (ob == true)` (the comparison with a value is false when empty).
- `optional<int> o = 0; if (o)` is `true`: the condition tests engagement, not the number.

#### 6. What optional cannot hold, and where it should not be used
- Not allowed: references (`optional<int&>` fails with a static assertion in libstdc++), arrays, `std::nullopt_t`, `std::in_place_t`, and `void`.
- Workarounds for an "optional reference": `T*` (null means none), `std::optional<std::reference_wrapper<T>>`, or return an index/iterator. C++26 adds `std::optional<T&>` (P2988) with rebinding assignment; until then use a pointer.
- Parameters:
  - `void f(std::optional<std::string> s)` forces a construction (and possibly a copy and heap allocation) at every call site, even for a callee that only reads.
  - `void f(const std::optional<std::string>& s)` still forces callers that hold a plain `std::string` to build a temporary optional (copying the string).
  - Prefer overloads, a `const T*` (null for "not given"), or a default argument. Optional parameters are fine for small `T`.
- Members: `std::optional<T>` as a data member is a good way to express "not yet set", without a magic value and without the heap.
- As a return type it replaces three older idioms:

| Idiom | Problem | `optional` fixes |
|---|---|---|
| Sentinel (`-1`, `""`, `npos`) | Sentinel may be a valid value; easy to forget the check | Absence is a separate state |
| Out-parameter + `bool` | Clumsy, requires default-constructible `T` | Returns the value directly |
| Pointer to a heap object | Allocation, ownership question | Value in place, no ownership |
| Pointer into a container | Fine for "observe existing object" | Optional would copy it, so keep the pointer here |

#### 7. Monadic operations (C++23)
- Chaining without nested `if`s. Available on `std::optional` (C++23, GCC 12+) and `std::expected`.

| Operation | Called when | Function returns | Result |
|---|---|---|---|
| `o.and_then(f)` | Engaged | `optional<U>` | `f(*o)` or empty |
| `o.transform(f)` | Engaged | Plain `U` | `optional<U>` wrapping `f(*o)`, or empty |
| `o.or_else(f)` | **Empty** | `optional<T>` | `o` itself if engaged, else `f()` |

- Rule of thumb: the step may fail → `and_then`; the step always succeeds → `transform`.
- Passing a function that returns an optional to `transform` yields a nested `optional<optional<U>>`: compiles, rarely what you want.
- `and_then` with a function that returns a plain value does not compile (the result must be a specialization of `optional`).
- `or_else` is the lazy alternative to `value_or`: the fallback is only computed when needed (and it stays an optional).

#### 8. std::expected<T, E> (C++23)
- Holds either a `T` (success) or an `E` (error), in-place, plus a flag. No heap, no exception thrown on failure.
- Creating:
  - Success: `return value;` (implicit conversion to `T`).
  - Failure: `return std::unexpected(err);`. The wrapper is required so success and error are never confused.
  - Trap: if `T` and `E` are the same or convertible types, `return code;` is a **success** with value `code`. With `expected<int, int>`, `return 42;` means "value 42".
- Accessing:

| Accessor | On error state | On value state |
|---|---|---|
| `has_value()`, `operator bool` | `false` | `true` |
| `*e`, `e->` | UB | Value |
| `e.value()` | Throws `std::bad_expected_access<E>` (carries a copy of the error) | Value |
| `e.error()` | The error | **UB** |
| `e.value_or(def)` | `def` | Value |
| `e.error_or(def)` (C++23) | The error | `def` |

- `std::expected<void, E>`: success carries nothing; useful for operations like "save", "send", "validate".
- Monadic: `and_then` (next step may fail, must return `expected<U, E>` with the **same** `E`), `transform` (map the value), `or_else` (recover from an error), `transform_error` (convert the error type, e.g. from a low-level code to a domain error).
- A default-constructed `expected<T, E>` holds a value-initialized `T` (success), unlike `optional`.
- Library support: GCC 12+ (libstdc++), Clang 16+ with libc++, MSVC 17.3+. Before C++23 the same idea is available as `tl::expected` or `boost::outcome`.

#### 9. Choosing an error mechanism

| Mechanism | Best for | Cost on success | Cost on failure | Can be ignored silently? |
|---|---|---|---|---|
| Exception | Rare, cannot-continue failures; constructors | ~Zero (table-based unwinding) | Expensive (microseconds: allocation, unwinding) | No (propagates) |
| `std::optional<T>` | "Not found" with no further reason | Flag check | Flag check | Possible but visible in the type |
| `std::expected<T, E>` | Expected failures with a reason; parsers, validation, I/O results | Flag check | Flag check, error value copy | Possible; mark functions `[[nodiscard]]` |
| Error code + out parameter | C APIs, very old code | Flag check | Flag check | Easily |
| Sentinel value | Legacy only | None | None | Very easily |

- Exceptions remain the right tool for constructors, operator overloads and deep call stacks where the failure is handled far away.
- Low-latency code paths often ban exceptions on the hot path and use `expected` or error codes: the failure path is predictable and allocation-free.
- `std::optional` loses the reason. If the caller needs to know *why* (bad input vs not found vs timeout), use `expected`.
- `expected`'s `E` should be cheap to copy: an enum or a small struct; `std::string` messages make the error path allocate.

#### 10. Misconceptions to unlearn
- ❌ "`optional` heap-allocates the value." ✅ The `T` lives inside the optional object; there is no allocation of its own.
- ❌ "`optional<T>` is the same size as `T`." ✅ It needs a flag plus padding: `optional<int>` is 8 bytes and `optional<double>` 16 on GCC x86-64.
- ❌ "`*opt` on an empty optional throws." ✅ It is undefined behaviour; `value()` throws `bad_optional_access`.
- ❌ "`value_or` only computes the default when it is needed." ✅ The argument is always evaluated before the call.
- ❌ "`reset()` destroys the optional." ✅ It destroys the contained `T`; the optional object remains, empty.
- ❌ "Assigning a new value to an engaged optional destroys the old one first." ✅ It uses `T`'s assignment operator; only `emplace` destroys then constructs.
- ❌ "`if (opt_bool)` tests the boolean." ✅ It tests engagement.
- ❌ "`std::optional<T&>` is a cheap optional reference." ✅ It does not compile before C++26; use `T*`.
- ❌ "`expected` is just optional with a string." ✅ It is typed (`E` can be an enum or struct), success/error construction is explicit via `std::unexpected`, and it has `error()`, `transform_error`, `bad_expected_access<E>`.
- ❌ "Returning an `int` error code from an `expected<int, int>` function signals an error." ✅ It creates a success; you need `std::unexpected(code)`.

### EDGE_CASES: Traps and Misconceptions

#### Edge Case 1: optional<bool> and optional<pointer> are truthy when they hold false or null
- `std::optional<bool> ob = false; if (ob)` takes the branch: the condition means "has a value".
- The same applies to `std::optional<int*>` holding `nullptr` and `std::optional<int>` holding `0`.
- Typical bug: a config flag `optional<bool> enable_feature` where "explicitly disabled" is treated as "enabled".
- Fixes: `if (ob.value_or(false))`, `if (ob == true)`, or replace `optional<bool>` with an `enum class` that has three named states.
```cpp
#include <iostream>
#include <optional>

int main() {
    std::optional<bool> enable = false;      // explicitly disabled
    if (enable) std::cout << "branch taken\n";            // has a value
    if (enable.value_or(false)) std::cout << "enabled\n"; // not printed
    std::cout << (enable == true) << '\n';                // 0
}
```
- Output: `branch taken` then `0`.

#### Edge Case 2: value_or is eager and returns a copy
- `cache.value_or(load_from_disk())` calls `load_from_disk()` every time, even on a cache hit. Arguments are evaluated before the function runs.
- Lazy alternatives: `o ? *o : load_from_disk()`, or C++23 `o.or_else(load)` (returns an optional).
- `value_or` returns `T` by value. `const std::string& s = big.value_or("");` binds a reference to a temporary copy (lifetime-extended, so safe, but it is a full copy of the string). For read-only access to an engaged optional use `*o`.
- The default is converted to `T`: `std::optional<unsigned>{}.value_or(-1)` is 4294967295 with no warning, even with `-Wconversion -Wsign-conversion` (GCC 11): the conversion happens inside a system header.

#### Edge Case 3: operator* on an empty optional is silent undefined behaviour
- `*o` and `o->` do not check. On GCC 11 at `-O0`, `*std::optional<int>{}` printed an arbitrary number that changed on each run: whatever bytes are in the storage.
- With `-D_GLIBCXX_ASSERTIONS` the same program aborts: "Assertion 'this->_M_is_engaged()' failed". Many teams enable this flag in debug and test builds.
- `value()` costs one branch and throws `std::bad_optional_access` ("bad optional access").
- Rule: use `*` only right after a check that the reader can see; use `value()` where emptiness would be a logic error you want reported.

#### Edge Case 4: Dangling reference from a temporary optional
- `const std::string& name = *find_name(id);` where `find_name` returns `std::optional<std::string>` by value:
  - The returned optional is a temporary; `*` returns a reference into it, not the temporary itself, so **no** lifetime extension applies.
  - The temporary (and its string) is destroyed at the end of the full expression; `name` dangles.
- Same bug with `.value()`, `->` and `for (char c : *find_name(id))` (range-for over a member of a temporary: fixed only in C++23 by P2718, which GCC 11/13 do not implement).
- Fix: keep the optional: `auto name = find_name(id); if (name) use(*name);` or copy: `std::string n = *find_name(id);`.
- The reset/reassign variant of this bug (reference into an optional that is later reset) is covered in Memory & Ownership, topic 01.

#### Edge Case 5: expected<int, int>: a plain return is always a success
- `std::expected<int, int> parse(...) { if (bad) return -1; ... }` returns a **value** of -1, not an error.
- `std::unexpected(-1)` is required to create the error state. This is deliberate: success is the implicit path, error must be spelled out.
- The same trap appears with `expected<std::string, std::string>` or any `E` convertible to `T`. Prefer a distinct error type (`enum class ParseError`), which also makes `return ParseError::Empty;` fail to compile instead of compiling wrongly.

#### Edge Case 6: optional<T&> does not compile
- libstdc++: "static assertion failed" (`!is_reference_v<_Tp>`), plus the constructors fail.
- People reach for it when a lookup should return "maybe a reference to an existing element".
- Options: return `T*` (null = not found), `std::optional<std::reference_wrapper<T>>` (verbose; `.get()` to access), or an iterator. C++26 standardizes `std::optional<T&>`.
- `std::optional<const T&>` as a parameter type to "avoid copies" is the same error.

#### Edge Case 7: Assignment to an engaged optional assigns, emplace re-constructs
- `o = T(2);` when `o` already holds a `T` calls `T::operator=(T&&)`: the old object stays alive and takes the new value. No destructor runs for the old value at that point (only for the temporary).
- `o.emplace(3);` destroys the current `T`, then constructs a new one in place. If that constructor throws, the optional is left empty.
- Matters for types whose assignment differs from construction (assignment not allowed, `const` members, objects registered by address).
- A type with a `const` member cannot be assigned; `o = T(...)` on an engaged optional then fails to compile, while `emplace` works.

#### Edge Case 8: Empty compares less than everything
- `std::optional<int>{} < -1000000` is `true`; `std::optional<int>{} == 0` is `false`.
- Sorting a `std::vector<std::optional<int>>` puts all empties first.
- `std::max(opt_a, opt_b)` picks any engaged one over an empty one, which may hide missing data in a "max price" calculation.
- Mixed comparison `o > 0` is `false` for an empty `o`; `!(o > 0)` is `true`, so the negated check does not mean "o is 0 or less".

### CODE_EXAMPLES: Practical Demonstrations

#### Example 1: A lookup that may fail: three ways to consume the result
- Return `std::optional<T>` by value for "found a copy or nothing"; the caller chooses how to handle absence.
```cpp
#include <iostream>
#include <map>
#include <optional>
#include <stdexcept>
#include <string>

std::optional<double> find_price(const std::map<std::string, double>& book,
                                 const std::string& symbol) {
    auto it = book.find(symbol);
    if (it == book.end()) return std::nullopt;
    return it->second;
}

int main() {
    const std::map<std::string, double> book{{"ABC", 101.5}, {"XYZ", 99.25}};

    // 1. Check then dereference
    if (auto p = find_price(book, "ABC")) std::cout << "ABC " << *p << '\n';

    // 2. Default when absent
    std::cout << "QQQ " << find_price(book, "QQQ").value_or(0.0) << '\n';

    // 3. Treat absence as an error
    try {
        std::cout << find_price(book, "QQQ").value() << '\n';
    } catch (const std::bad_optional_access& e) {
        std::cout << "error: " << e.what() << '\n';
    }
}
```
- Output:
```
ABC 101.5
QQQ 0
error: bad optional access
```
- `if (auto p = ...)` scopes the optional to the `if`; `*p` is safe because the condition checked it.
- Returning a `double` copy is fine; for a large element, returning `const T*` avoids the copy (see section 6).

#### Example 2: No allocation and the real size
- A global `operator new` counter proves the optional does not allocate; only the contained `std::string` does when its text is too long for SSO (std::string details: topic 01).
```cpp
#include <cstdio>
#include <cstdlib>
#include <new>
#include <optional>
#include <string>

static int allocations = 0;
void* operator new(std::size_t n) {
    ++allocations;
    if (void* p = std::malloc(n)) return p;
    throw std::bad_alloc{};
}
void operator delete(void* p) noexcept { std::free(p); }
void operator delete(void* p, std::size_t) noexcept { std::free(p); }

int main() {
    std::optional<int> a = 42;
    std::optional<std::string> b = std::string("short");
    std::printf("after int/short string: %d allocations\n", allocations);

    std::optional<std::string> c = std::string(100, 'x');
    std::printf("after long string: %d allocations\n", allocations);

    std::printf("sizeof: optional<int>=%zu optional<double>=%zu optional<string>=%zu\n",
                sizeof(std::optional<int>), sizeof(std::optional<double>),
                sizeof(std::optional<std::string>));
    (void)a; (void)b; (void)c;
}
```
- Output (libstdc++ / GCC, x86-64):
```
after int/short string: 0 allocations
after long string: 1 allocations
sizeof: optional<int>=8 optional<double>=16 optional<string>=40
```
- The one allocation belongs to the 100-character string's buffer, not to the optional.

#### Example 3: Tracing the contained object's lifetime
- A noisy type shows exactly which special member each optional operation calls.
```cpp
#include <iostream>
#include <optional>

struct Order {
    int id;
    explicit Order(int i) : id(i) { std::cout << "  ctor " << id << '\n'; }
    Order(Order&& o) noexcept : id(o.id) { std::cout << "  move-ctor " << id << '\n'; }
    Order& operator=(Order&& o) noexcept {
        id = o.id;
        std::cout << "  move-assign " << id << '\n';
        return *this;
    }
    ~Order() { std::cout << "  dtor " << id << '\n'; }
};

int main() {
    std::optional<Order> o;
    std::cout << "assign to empty\n";
    o = Order(1);
    std::cout << "assign to engaged\n";
    o = Order(2);
    std::cout << "emplace\n";
    o.emplace(3);
    std::cout << "reset\n";
    o.reset();
    std::cout << "end of main\n";
}
```
- Output:
```
assign to empty
  ctor 1
  move-ctor 1
  dtor 1
assign to engaged
  ctor 2
  move-assign 2
  dtor 2
emplace
  dtor 2
  ctor 3
reset
  dtor 3
end of main
```
- Assigning to an engaged optional uses move-assignment; the `dtor 2` lines are the temporaries.
- `emplace` destroys the old value first, then constructs in place (no temporary, no move).
- After `reset()` nothing is left to destroy at the end of `main`.

#### Example 4: Eager value_or vs lazy alternatives
- The default argument of `value_or` runs even on a hit; a ternary or `or_else` (C++23) defers it.
```cpp
// C++23 (or_else): g++ -std=c++23 (GCC 12+)
#include <iostream>
#include <optional>
#include <string>

std::string load_default() {
    std::cout << "  (loading default)\n";
    return "default";
}

int main() {
    std::optional<std::string> cached = "cached";

    std::cout << "value_or:\n";
    std::string a = cached.value_or(load_default());     // loads anyway

    std::cout << "ternary:\n";
    std::string b = cached ? *cached : load_default();   // no load

    std::cout << "or_else:\n";
    std::string c =
        *cached.or_else([] { return std::optional<std::string>(load_default()); });

    std::cout << a << ' ' << b << ' ' << c << '\n';
}
```
- Output:
```
value_or:
  (loading default)
ternary:
or_else:
cached cached cached
```
- Use `value_or` only for cheap defaults (literals, constants).

#### Example 5: Monadic chain on optional (C++23)
- Each step may fail (`and_then`) or always succeeds (`transform`); the first empty result short-circuits the rest.
```cpp
// C++23: g++ -std=c++23 (GCC 12+)
#include <charconv>
#include <iostream>
#include <optional>
#include <string>
#include <string_view>

std::optional<int> to_int(std::string_view s) {
    int v = 0;
    auto [p, ec] = std::from_chars(s.data(), s.data() + s.size(), v);
    if (ec != std::errc{} || p != s.data() + s.size()) return std::nullopt;
    return v;
}

std::optional<int> positive(int v) {
    if (v <= 0) return std::nullopt;
    return v;
}

std::string describe(std::string_view input) {
    return to_int(input)
        .and_then(positive)                                   // may fail
        .transform([](int v) { return "qty=" + std::to_string(v * 100); })
        .value_or("rejected");
}

int main() {
    std::cout << describe("5") << '\n';
    std::cout << describe("-3") << '\n';
    std::cout << describe("5x") << '\n';
}
```
- Output:
```
qty=500
rejected
rejected
```
- `value_or("rejected")` is fine here: the default is a literal.

#### Example 6: std::expected pipeline with typed errors (C++23)
- The error type is an enum; `transform_error` converts it to text only at the boundary.
```cpp
// C++23: g++ -std=c++23 (GCC 12+)
#include <charconv>
#include <expected>
#include <iostream>
#include <string>
#include <string_view>

enum class ParseError { Empty, NotNumber, OutOfRange };

std::expected<int, ParseError> parse_qty(std::string_view s) {
    if (s.empty()) return std::unexpected(ParseError::Empty);
    int v = 0;
    auto [p, ec] = std::from_chars(s.data(), s.data() + s.size(), v);
    if (ec != std::errc{} || p != s.data() + s.size())
        return std::unexpected(ParseError::NotNumber);
    return v;
}

std::expected<int, ParseError> check_range(int q) {
    if (q < 1 || q > 1000) return std::unexpected(ParseError::OutOfRange);
    return q;
}

const char* to_text(ParseError e) {
    switch (e) {
        case ParseError::Empty: return "empty input";
        case ParseError::NotNumber: return "not a number";
        case ParseError::OutOfRange: return "out of range";
    }
    return "?";
}

int main() {
    for (std::string_view in : {"250", "", "12a", "5000"}) {
        auto r = parse_qty(in)
                     .and_then(check_range)
                     .transform([](int q) { return q * 2; })
                     .transform_error(to_text);       // expected<int, const char*>
        if (r) std::cout << "ok: " << *r << '\n';
        else   std::cout << "error: " << r.error() << '\n';
    }
}
```
- Output:
```
ok: 500
error: empty input
error: not a number
error: out of range
```
- `and_then(check_range)` requires `check_range` to return an `expected` with the **same** error type `ParseError`.
- `std::unexpected(...)` is mandatory for the error paths; `return v;` is the success path.

#### Example 7: value() on an expected, and expected<void, E>
- `value()` on an error throws `std::bad_expected_access<E>`, which carries the error. `expected<void, E>` reports success or failure of an action with no result.
```cpp
// C++23: g++ -std=c++23 (GCC 12+)
#include <expected>
#include <iostream>
#include <string>

enum class SendError { NotConnected, Timeout };

std::expected<void, SendError> send(bool connected) {
    if (!connected) return std::unexpected(SendError::NotConnected);
    return {};                                   // success, no value
}

std::expected<int, std::string> lookup(int id) {
    if (id != 7) return std::unexpected("unknown id " + std::to_string(id));
    return 700;
}

int main() {
    std::cout << send(true).has_value() << ' ' << send(false).has_value() << '\n';

    try {
        int v = lookup(3).value();
        std::cout << v << '\n';
    } catch (const std::bad_expected_access<std::string>& e) {
        std::cout << "caught: " << e.error() << '\n';
    }
    std::cout << lookup(7).value_or(-1) << ' ' << lookup(3).error_or("none") << '\n';
}
```
- Output:
```
1 0
caught: unknown id 3
700 unknown id 3
```
- The exception type depends on `E`: catch `std::bad_expected_access<std::string>` (or the base `std::bad_expected_access<void>`).

### QUICK_REFERENCE: Cheat Sheet

#### optional accessors
| Expression | Empty | Engaged |
|---|---|---|
| `if (o)`, `o.has_value()` | false | true |
| `*o`, `o->m` | UB | `T&` |
| `o.value()` | throws `bad_optional_access` | `T&` |
| `o.value_or(d)` | `T(d)` (d always evaluated) | copy of value |
| `o.reset()` / `o = std::nullopt` / `o = {}` | no-op | destroys `T` |
| `o.emplace(args)` | constructs | destroys, then constructs |
| `o = t` | constructs | assigns |

#### expected accessors (C++23)
| Expression | Value state | Error state |
|---|---|---|
| `if (e)` | true | false |
| `*e` | value | UB |
| `e.value()` | value | throws `bad_expected_access<E>` |
| `e.error()` | UB | error |
| `e.value_or(d)` / `e.error_or(d)` | value / d | d / error |
| Create | `return v;` | `return std::unexpected(err);` |

#### Monadic operations (C++23)
| Op | Runs on | f returns | Note |
|---|---|---|---|
| `and_then(f)` | value | `optional<U>` / `expected<U, E>` | step may fail |
| `transform(f)` | value | `U` | step cannot fail |
| `or_else(f)` | empty / error | same optional / `expected<T, G>` | recovery, lazy fallback |
| `transform_error(f)` | error (expected only) | `G` | change error type |

#### Implementation facts (libstdc++ / GCC, x86-64, not guaranteed by C++)
| Fact | Value |
|---|---|
| `sizeof(optional<int>)` / `<double>` / `<string>` | 8 / 16 / 40 |
| `sizeof(expected<int,int>)` / `<int,string>` | 8 / 40 |
| `*empty` at `-O0` | Reads storage, no error |
| `-D_GLIBCXX_ASSERTIONS` | `*empty` aborts with an assertion |
| `std::optional` monadic ops | GCC 12+ |
| `std::expected` | GCC 12+ |

#### Interview one-liners
| Question | Answer |
|---|---|
| Does optional allocate? | No; `T` is stored inside the optional |
| `*o` vs `o.value()` on empty? | UB vs throws `bad_optional_access` |
| Is `value_or(f())` lazy? | No; `f()` always runs |
| What does `reset()` destroy? | The contained `T`, not the optional |
| `optional<bool>` holding false in `if`? | True: tests engagement |
| `optional<T&>`? | Not allowed before C++26; use `T*` |
| Empty vs -5? | Empty is less than any value |
| optional vs expected? | optional: missing; expected: missing with a typed reason |
| How to return an error from expected? | `return std::unexpected(e);` |
| `expected<int,int>`, `return 42;`? | Success with value 42 |
| `and_then` vs `transform`? | Step returns optional/expected vs a plain value |
| When exceptions instead? | Rare, non-local failures; constructors; errors handled far away |
