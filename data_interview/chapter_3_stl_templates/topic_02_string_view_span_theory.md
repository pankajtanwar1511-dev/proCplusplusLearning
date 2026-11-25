## TOPIC: std::string_view and std::span

### THEORY_SECTION: Core Concepts

#### 1. Mental model
- `std::string_view` (C++17) and `std::span<T>` (C++20) are **non-owning views**: a pointer plus a length into memory that someone else owns.
- `string_view` = `{const char* data; size_t size;}`. `span<T>` = `{T* data; size_t size;}` (the size is dropped for a fixed extent).
- A view never allocates, never frees and never extends the lifetime of anything. It is exactly as valid as the memory it points at.
- Think of a view as a **borrow with no borrow checker**: the compiler accepts a view of a temporary, of a local that is about to die, or of a string that is about to reallocate.
- Rules of thumb:
  - Views are great **parameters** (the caller's object outlives the call).
  - Views are dangerous **return values, members, container keys and captured lambda state** (the owner may die first).
- Copying a view is copying two words: pass it **by value**, not by `const&`.

#### 2. string_view construction and operations
| Source | Cost | Notes |
|---|---|---|
| `"literal"` (`const char*`) | O(n) `strlen` (often constant-folded) | Stops at the first `'\0'` |
| `"literal"sv` (`using namespace std::literals`) | O(1) | Length from the literal; keeps embedded nulls |
| `std::string` | O(1) | Implicit, via `std::string::operator string_view()` |
| `(ptr, len)` | O(1) | Any bytes; no terminator required |
| `nullptr` | UB before C++23, deleted in C++23 | Same trap as `std::string` |
| Range of `char` (C++23) | O(1) | `explicit` constructor |

- Converting back: `std::string(sv)` is **explicit** and allocates (if longer than the SSO capacity). There is no implicit `string_view` to `string` conversion.
- No `operator+` for `std::string + std::string_view` until C++26; use `s.append(sv)` or `std::string(a) += b`.
- O(1) view manipulation (the underlying characters are untouched):
  - `remove_prefix(n)`: `data += n; size -= n;`
  - `remove_suffix(n)`: `size -= n;`
  - `substr(pos, n)`: a new view; throws `out_of_range` if `pos > size()`.
- Read-only access: `operator[]` returns `const char&`; `sv[0] = 'x'` does not compile. The owner can still change the characters under the view.
- Searching: `find`, `rfind`, `find_first_of` ... (return `npos`), C++20 `starts_with`/`ends_with`, C++23 `contains`.
- Comparison compares length and content: `"abc"sv == "abc"` is true; `<=>` is lexicographic.
- `std::hash<std::string_view>` gives the same value as `std::hash<std::string>` for the same characters (standard requirement), which enables heterogeneous lookup.
- `sizeof(std::string_view) == 16` on 64-bit platforms (two words).

#### 3. Not null-terminated
- A view of a whole literal or a whole `std::string` happens to be followed by `'\0'`, but a view made by `substr`, `remove_suffix` or `(ptr, len)` usually is not.
- Passing `sv.data()` to `printf("%s")`, `strlen`, `fopen`, `strtol` or any C API reads past the view until it finds a null byte somewhere.
- Safe options:
  - `printf("%.*s", int(sv.size()), sv.data())` for formatted output.
  - `std::string(sv).c_str()` when an API needs a terminator (one allocation for long strings).
  - Keep `const std::string&` parameters for functions that forward to C APIs.
- `std::cout << sv` is fine: the stream inserter uses the size.

#### 4. Lifetime: views that dangle immediately
| Code | Safe? | Why |
|---|---|---|
| `string_view f() { return "name"; }` | ✅ | String literals have static storage duration |
| `string_view f() { std::string s = "x"; return s; }` | ❌ | `s` is destroyed when `f` returns |
| `string_view f() { return std::string("x"); }` | ❌ | The temporary is destroyed at the end of the `return` statement, inside `f` |
| `string_view sv = std::string("hello");` | ❌ | Temporary dies at the end of the full expression |
| `string_view sv = s.substr(0, 3);` | ❌ | `std::string::substr` returns a new temporary string |
| `string_view sv = std::string_view(s).substr(0, 3);` | ✅ (while `s` lives) | View of `s` itself |
| `string_view sv = s + "x";` | ❌ | `operator+` returns a temporary |
| `string_view sv = flag ? s : "default";` | ❌ | The conditional's type is `std::string`: a temporary copy |
| `string_view f() { static std::string s = "x"; return s; }` | ✅ until `s` changes | Static object lives to program end |
| `void g(string_view); g(std::string("x"));` | ✅ | The temporary lives until the end of the full expression that contains the call |

- No lifetime extension for views: lifetime extension applies only when a temporary is bound **directly to a reference**. A `string_view` is an object, not a reference, so binding it to a temporary extends nothing.
- GCC 13 and 14 with `-Wall -Wextra` do not warn for `return std::string(...)` converted to a view. Clang 14 warns by default for returning a view of a local or a temporary (`-Wreturn-stack-address`) and for `string_view sv = std::string("x");`, `s.substr(...)` and the conditional case (`-Wdangling-gsl`); `[[clang::lifetimebound]]` extends this to your own functions. These catch some cases only: rely on review and ASan, not on warnings.

#### 5. Lifetime: views into a string that changes
- A `string_view` into a `std::string` is a pointer into its buffer, so the string invalidation rules apply (topic 01): every non-const member except `operator[]`, `at`, `data`, `front`, `back`, `begin`, `end` (and reverse variants) formally invalidates the view, **with or without reallocation**.
- The view never learns about the change:
  - Its **size stays fixed**: after `s += "FG"` a view of `"XBCDE"` still has size 5.
  - After `s.clear()` the view still has the old size, and libstdc++ has written `'\0'` at position 0: printing it outputs a null byte followed by the stale characters.
  - After reallocation it points into freed memory (ASan: `heap-use-after-free`).
- Writes through `s[i]` are visible through the view (same memory, exempt operation): views are not snapshots.

#### 6. Choosing a parameter type for text
| Parameter | Accepts without allocation | Use when |
|---|---|---|
| `std::string_view` (by value) | literals, `std::string`, `char` buffers, other views | You only read, synchronously, and do not need a terminator |
| `const std::string&` | only `std::string` (a literal creates a temporary string) | You need `c_str()` or call an API that takes `const std::string&` |
| `std::string` (by value) | moves from rvalues | You **store** the text (sink): `member_ = std::move(param);` |
| `const char*` | literals and C strings | C interop; size unknown, O(n) to find |

- A `string_view` parameter does not protect against the function **storing** the view; storing requires an owning copy.
- Heterogeneous lookup: `std::map<std::string, V, std::less<>>::find(sv)` (C++14) and unordered containers with a transparent hash (C++20) look up a `string_view` without building a temporary `std::string` (details: topics 08 and 09).

#### 7. Views stored in objects and containers
- `std::map<std::string_view, int>` built from temporary strings stores dangling keys: lookups later compare against freed memory.
- A struct member `std::string_view name;` is fine only when something with a longer lifetime owns the characters (for example a `std::string` buffer kept next to the index, or literals).
- A lambda capturing a view by value captures the pointer, not the characters; if the lambda runs later (callback, thread, coroutine), the owner may be gone.
- Pattern for "index over a buffer": keep one owning `std::string` (or a `std::vector<char>`) and store views into it **only after** it stops growing.

#### 8. std::span (C++20)
- A view over **any contiguous sequence** of `T`: built-in arrays, `std::array`, `std::vector`, `std::string` (as `span<const char>`), `(ptr, n)`, `(first, last)`.
- `std::span<T>` allows writing the elements; `std::span<const T>` is the read-only parameter type.
- Extent:
  - Dynamic (`std::span<int>`): pointer + size, 16 bytes on 64-bit.
  - Static (`std::span<int, 4>`): size is part of the type, only a pointer is stored (8 bytes); constructing from a dynamic range of the wrong size is UB (the constructor is `explicit`).
- Operations: `size()`, `size_bytes()`, `empty()`, `data()`, `front()`, `back()`, `first(n)`, `last(n)`, `subspan(off, n)`, iterators, `std::as_bytes` / `std::as_writable_bytes`.
- `operator[]` does **not** bounds-check; `first`, `last`, `subspan` have preconditions instead of exceptions. C++26 adds `at()`.
- A span over a `std::vector` follows the vector's rules: any reallocation (growth past capacity) leaves the span dangling, and the span's size never changes when elements are added or removed.
- No `span<bool>` over `std::vector<bool>` (not contiguous `bool` objects, see topic 05).
- `std::span` replaces the C pair `(T* p, size_t n)`, and an interface taking `span<const T>` accepts every contiguous container without templates.

#### 9. Borrowed ranges and std::ranges::dangling
- A **borrowed range** is a range whose iterators remain valid after the range object itself is destroyed: `string_view`, `span`, lvalue references to containers.
- Ranges algorithms called with an **rvalue non-borrowed range** (for example a temporary `std::vector`) return `std::ranges::dangling` instead of an iterator. Dereferencing it is a compile error, so the bug is caught at compile time.
- `std::ranges::find(std::string_view("abc"), 'b')` returns a usable iterator: the view is borrowed, the characters live in static storage.
- Being borrowed only says the iterators do not depend on the view object; they still depend on the underlying owner.

#### 10. Misconceptions to unlearn
- ❌ "A `string_view` keeps the string alive." ✅ It owns nothing and extends nothing.
- ❌ "Returning a temporary string as a view is fine because the temporary lives until the caller's statement ends." ✅ It dies at the end of the `return` statement inside the callee.
- ❌ "If the string does not reallocate, my view is still valid." ✅ Any non-exempt mutation formally invalidates it, and the view's size never updates.
- ❌ "`sv.data()` can be passed to C functions." ✅ Only if you know a terminator follows; views from `substr` usually have none.
- ❌ "`string_view` is always faster than `const std::string&`." ✅ For a function that needs `c_str()`, a view parameter forces a copy later.
- ❌ "`std::string::substr` and `std::string_view::substr` are the same." ✅ The first allocates a new string, the second is O(1).
- ❌ "`span` checks bounds." ✅ `operator[]` is unchecked (C++26 adds `at`).
- ❌ "A `span` over a vector sees new elements." ✅ Its pointer and size are fixed at construction.

### EDGE_CASES: Traps and Misconceptions

#### Edge Case 1: Returning a temporary as a view
- `std::string_view name() { return std::string(60, 'N'); }` compiles without warnings in GCC 13 (`-Wall -Wextra`).
- The temporary is destroyed at the end of the `return` statement, before control reaches the caller. The view returned already dangles.
- With a short string the buffer was on the callee's stack and the program may even print the right text; with a long one ASan reports `heap-use-after-free` in the caller.
- Fix: return `std::string` (by value, NRVO or move makes it cheap).

#### Edge Case 2: `s.substr()` versus `string_view(s).substr()`
- `std::string_view sv = s.substr(0, 5);` views a temporary `std::string` returned by `substr`; it dangles at the semicolon.
- `std::string_view sv = std::string_view(s).substr(0, 5);` views `s` itself and costs nothing.
- Same trap with `s + "x"`, `std::to_string(n)`, `std::string(cstr)`, and any function returning `std::string` by value.

#### Edge Case 3: The conditional operator makes a temporary
- `std::string_view label = flag ? s : "default";`
- The two operands are `std::string` (lvalue) and `const char[8]`: the common type is `std::string`, so the result is a **prvalue copy** of `s` (or a temporary string built from the literal). The view binds to that temporary and dangles.
- Fix: make both operands views: `flag ? std::string_view(s) : "default"sv`.

#### Edge Case 4: The view after `clear()`
- `std::string s = "Hello"; std::string_view v = s; s.clear();`
- libstdc++ keeps the buffer and writes `'\0'` at `s[0]`. `v` still has size 5, so `std::cout << v` prints a null byte followed by `ello`.
- "The bytes are still there, so it works" is the wrong lesson: the first byte is already overwritten, and the access is invalid by the rules anyway.

#### Edge Case 5: Not null-terminated in practice
- `std::string t = "abcdef"; auto v = std::string_view(t).substr(0, 3);`
- `strlen(v.data())` returns 6, not 3: it reads the owner's remaining characters until the terminator of `t`.
- With a view into a raw network buffer there may be no terminator at all: `strlen` runs off the buffer.

#### Edge Case 6: Embedded nulls depend on how the view was built
- `std::string_view a = "ab\0cd";` has size 2 (constructed through `strlen`).
- `"ab\0cd"sv` and `std::string_view(p, 5)` have size 5.
- Comparisons and hashes include every character, so `a == "ab\0cd"sv` is false.

#### Edge Case 7: Container of views over temporaries
- `std::map<std::string_view, int> m; m[make_key(i)] = i;` where `make_key` returns `std::string`.
- Each key views a temporary that is destroyed after the statement; the tree now orders and compares freed memory.
- Use `std::map<std::string, int, std::less<>>` to own the keys and still look them up by `string_view`.

#### Edge Case 8: A span does not follow its vector
- `std::vector<int> v{1, 2, 3}; std::span<int> s = v; v.push_back(4);`
- If `push_back` reallocates, `s` points at freed memory. Even without reallocation, `s.size()` is still 3.
- A span is a snapshot of `(data(), size())`; rebuild it after any change to the vector's size.

### CODE_EXAMPLES: Practical Demonstrations

#### Example 1: What a string_view is made of
- Size, O(1) prefix/suffix removal, view `substr`, and the owner's characters left untouched.
```cpp
#include <iostream>
#include <string>
#include <string_view>

int main() {
    std::string owner = "  order:12345  ";
    std::string_view v = owner;
    while (!v.empty() && v.front() == ' ') v.remove_prefix(1);
    while (!v.empty() && v.back() == ' ') v.remove_suffix(1);
    std::string_view id = v.substr(v.find(':') + 1);      // O(1), no allocation
    std::cout << "sizeof(string_view) = " << sizeof(std::string_view) << '\n';
    std::cout << '[' << v << "] [" << id << "] offset " << (id.data() - owner.data())
              << '\n';
    std::cout << "owner unchanged: [" << owner << "]\n";
}
```
- Output (`sizeof` is 16 on 64-bit platforms):
```
sizeof(string_view) = 16
[order:12345] [12345] offset 8
owner unchanged: [  order:12345  ]
```
- `id.data()` points into `owner`: the trimmed and sliced views share the original buffer.

#### Example 2: A zero-copy tokenizer
- Splits once, stores views, and keeps the owner alive for as long as the views are used.
```cpp
#include <iostream>
#include <string>
#include <string_view>
#include <vector>

std::vector<std::string_view> split(std::string_view text, char sep) {
    std::vector<std::string_view> out;
    while (true) {
        auto pos = text.find(sep);
        out.push_back(text.substr(0, pos));      // substr clamps npos to the end
        if (pos == std::string_view::npos) break;
        text.remove_prefix(pos + 1);
    }
    return out;
}

int main() {
    const std::string line = "NEW,order-7,BUY,100,,42.5";   // owner outlives the views
    auto fields = split(line, ',');
    for (std::size_t i = 0; i < fields.size(); ++i)
        std::cout << i << ":[" << fields[i] << "] ";
    std::cout << '\n' << fields.size() << " fields, no std::string copies\n";
}
```
- Output:
```
0:[NEW] 1:[order-7] 2:[BUY] 3:[100] 4:[] 5:[42.5]
6 fields, no std::string copies
```
- Calling `split(std::string("..."), ',')` and keeping the result would dangle: the temporary owner dies at the end of that statement.

#### Example 3: Parameter types and allocations
- Counts heap allocations to show what each parameter type costs for a long literal.
```cpp
#include <cstdio>
#include <cstdlib>
#include <new>
#include <string>
#include <string_view>

static int g_allocs = 0;
void* operator new(std::size_t n) {
    ++g_allocs;
    if (void* p = std::malloc(n)) return p;
    throw std::bad_alloc{};
}
void operator delete(void* p) noexcept { std::free(p); }
void operator delete(void* p, std::size_t) noexcept { std::free(p); }

std::size_t by_ref(const std::string& s) { return s.size(); }
std::size_t by_view(std::string_view s) { return s.size(); }

int main() {
    const char* text = "a message long enough to defeat the small string buffer";
    g_allocs = 0; by_ref(text);
    std::printf("const std::string& with literal: %d allocation(s)\n", g_allocs);
    g_allocs = 0; by_view(text);
    std::printf("string_view with literal:        %d allocation(s)\n", g_allocs);
    std::string owned = text;
    g_allocs = 0; by_ref(owned); by_view(owned);
    std::printf("either with std::string:         %d allocation(s)\n", g_allocs);
}
```
- Output:
```
const std::string& with literal: 1 allocation(s)
string_view with literal:        0 allocation(s)
either with std::string:         0 allocation(s)
```
- A short literal (15 characters or fewer on libstdc++) would make the `const std::string&` case allocation-free too, but still a copy.

#### Example 4: Owning keys, borrowed lookups
- `std::less<>` makes `find` accept a `string_view` without creating a `std::string`.
```cpp
#include <iostream>
#include <map>
#include <string>
#include <string_view>

int main() {
    std::map<std::string, int, std::less<>> limits{{"max_order_qty", 500},
                                                   {"max_open_orders", 20}};
    std::string_view request = "GET max_open_orders";
    std::string_view key = request.substr(4);
    if (auto it = limits.find(key); it != limits.end())     // no temporary string
        std::cout << it->first << " = " << it->second << '\n';
    std::cout << std::boolalpha << limits.contains(std::string_view("nope")) << '\n';
}
```
- Output:
```
max_open_orders = 20
false
```
- With the default `std::less<std::string>` the call `limits.find(key)` does not compile (no implicit `string_view` to `string` conversion). Transparent comparators are covered in topic 08.

#### Example 5: One function for every contiguous container
- `std::span<const T>` for reading, `std::span<T>` for writing, `subspan` for slicing.
```cpp
#include <array>
#include <iostream>
#include <span>
#include <vector>

double average(std::span<const double> xs) {
    double sum = 0;
    for (double x : xs) sum += x;
    return xs.empty() ? 0.0 : sum / xs.size();
}

void scale(std::span<double> xs, double f) {
    for (double& x : xs) x *= f;
}

int main() {
    double raw[] = {1, 2, 3, 4};
    std::array<double, 3> fixed{10, 20, 30};
    std::vector<double> dyn{5, 5, 5, 5, 5, 5};
    std::cout << average(raw) << ' ' << average(fixed) << ' ' << average(dyn) << '\n';
    scale(std::span(dyn).subspan(2, 2), 10.0);       // only elements 2 and 3
    for (double d : dyn) std::cout << d << ' ';
    std::cout << '\n' << sizeof(std::span<double>) << ' '
              << sizeof(std::span<double, 4>) << '\n';
}
```
- Output (sizes: 64-bit libstdc++ / GCC):
```
2.5 20 5
5 5 50 50 5 5
16 8
```
- A static-extent span stores only the pointer: the size lives in the type.

#### Example 6: Handing a view to a C API safely
- `%.*s` prints a view without needing a terminator; `std::string(sv)` creates one when the API requires it.
```cpp
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <string_view>

int main() {
    std::string msg = "PRICE=1234;QTY=56";
    std::string_view price = std::string_view(msg).substr(6, 4);   // "1234", no '\0'
    std::printf("view: %.*s\n", static_cast<int>(price.size()), price.data());
    long wrong = std::strtol(price.data(), nullptr, 10);           // reads on: "1234;..."
    long right = std::strtol(std::string(price).c_str(), nullptr, 10);
    std::printf("strtol on data(): %ld, on copy: %ld\n", wrong, right);
    std::printf("strlen(data()) = %zu, size() = %zu\n",
                std::strlen(price.data()), price.size());
}
```
- Output:
```
view: 1234
strtol on data(): 1234, on copy: 1234
strlen(data()) = 11, size() = 4
```
- `strtol` happened to stop at `';'`. With `"PRICE=123456"` and a view of `"1234"`, it would parse 123456. Use `std::from_chars(price.data(), price.data() + price.size(), x)` instead: it takes an end pointer.

#### Example 7: Borrowed ranges catch dangling at compile time
- `std::ranges::find` on a temporary vector returns `std::ranges::dangling`; on a view it returns a real iterator.
```cpp
#include <algorithm>
#include <iostream>
#include <ranges>
#include <string_view>
#include <type_traits>
#include <vector>

std::vector<int> load() { return {4, 8, 15, 16}; }

int main() {
    auto r1 = std::ranges::find(load(), 15);                 // temporary vector
    static_assert(std::is_same_v<decltype(r1), std::ranges::dangling>);
    // std::cout << *r1;   // error: no match for 'operator*'

    auto r2 = std::ranges::find(std::string_view("abc"), 'b');   // borrowed range
    std::cout << *r2 << '\n';
    std::cout << std::ranges::borrowed_range<std::string_view>
              << std::ranges::borrowed_range<std::vector<int>> << '\n';
}
```
- Output:
```
b
10
```
- The classic `std::find(load().begin(), load().end(), 15)` would compile and compare iterators of two different temporaries: UB. The ranges overload turns that class of bug into a compile error.

### QUICK_REFERENCE: Cheat Sheet

#### Is this view safe?
| Pattern | Verdict |
|---|---|
| View of a string literal | Safe (static storage) |
| View parameter, used only during the call | Safe |
| Return a view of a local or a temporary string | Dangles |
| `string_view sv = s.substr(...)` / `s + x` / `to_string(n)` | Dangles at the semicolon |
| `flag ? s : "lit"` into a view | Dangles (conditional produces a `std::string`) |
| View of `s`, then `s += ...` / `clear()` / `reserve()` | Invalid (even without reallocation) |
| View of `s`, then `s[i] = c` | Valid, sees the change |
| `map<string_view, V>` with keys from temporaries | Dangling keys |
| `span` of a vector, then `push_back` | Dangles if it reallocated; size stale anyway |

#### string_view vs std::string
| | `std::string_view` | `std::string` |
|---|---|---|
| Owns characters | No | Yes |
| Null-terminated | Not guaranteed | Yes |
| `substr` | O(1) view | O(n) copy |
| Modify characters | No | Yes |
| Size (64-bit) | 16 bytes | 32 (libstdc++), 24 (libc++) |
| Pass by | Value | `const&` or value (sink) |

#### Versions
| Version | Feature |
|---|---|
| C++17 | `std::string_view`, `"..."sv` |
| C++20 | `std::span`, `starts_with`/`ends_with`, borrowed ranges, `ranges::dangling` |
| C++23 | `string_view::contains`, range constructor, `nullptr_t` constructor deleted |
| C++26 | `string + string_view` operator, `span::at` |

#### Interview one-liners
| Question | Answer |
|---|---|
| What is a string_view? | Non-owning `(pointer, length)` into characters owned elsewhere |
| Return a view of a local string? | Dangling; return `std::string` |
| When does `return std::string("x")` as a view die? | End of the `return` statement in the callee |
| Is `sv.data()` null-terminated? | Not guaranteed |
| View after the owner appends without reallocating? | Formally invalid; size never updates |
| `string_view` or `const string&` parameter? | View for read-only; `const string&` if you need `c_str()`; by-value `string` if you store it |
| Can `string_view` modify text? | No; `span<char>` can |
| `span` vs `string_view`? | `span<T>` is the generic contiguous view; `string_view` adds string operations |
| Static vs dynamic extent? | `span<T, N>` stores only a pointer; `span<T>` stores pointer + size |
| `ranges::dangling`? | Returned for rvalue non-borrowed ranges; cannot be dereferenced |
