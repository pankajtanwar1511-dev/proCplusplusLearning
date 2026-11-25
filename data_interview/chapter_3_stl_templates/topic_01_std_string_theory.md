## TOPIC: std::string: SSO, Buffers and Pointer Validity

### THEORY_SECTION: Core Concepts

#### 1. Mental model
- A `std::string` is an **owning, contiguous, null-terminated** buffer of `char`, plus a size and a capacity.
- Two locations to keep apart:
  - **The object** (a few pointers and counters): lives wherever you declared it (stack, heap, static storage, inside another object).
  - **The characters**: either inside the object itself (**small string optimization**, SSO) or in a heap block the object owns.
- The object owns its characters exclusively: copying a string copies the characters (no sharing since C++11), destroying it frees them.
- Every pointer, reference, iterator or `string_view` you take into a string is a **borrow**. The string decides when that borrow dies, and the rules are stricter than for `std::vector` (section 5).
- Three numbers describe the state:
  - `size()` (same as `length()`): characters in use, not counting the terminator.
  - `capacity()`: characters that fit without a new allocation (also not counting the terminator).
  - `max_size()`: theoretical limit; exceeding it throws `std::length_error`.

#### 2. Layout and the small string optimization (implementation-specific)
- The standard does **not** require SSO and does not specify `sizeof(std::string)`. Every major library implements SSO anyway, with different numbers:

| Library | `sizeof(std::string)` (64-bit) | Inline capacity (chars) | Layout idea |
|---|---|---|---|
| libstdc++ (GCC, new ABI) | 32 | 15 | pointer, size, union { capacity, 16-byte local buffer } |
| libc++ (Clang/Apple) | 24 | 22 | short/long modes packed into 3 words, one flag bit |
| MSVC STL | 32 | 15 | union { 16-byte buffer, pointer }, size, capacity |

- The libstdc++ row is verified with GCC 11 on x86-64. The libc++ and MSVC rows are the typical values for 64-bit release builds; check your own library before quoting them.

- libstdc++ / GCC, x86-64 details:
  - The data pointer always points at the characters: for a short string it points into the object's own local buffer.
  - The local buffer shares storage (a union) with the capacity field. When a string moves to the heap, those 16 bytes start holding the capacity number instead of characters.
  - A default-constructed string has `capacity() == 15`, no allocation at all.
  - `std::string(16, 'a')` allocates exactly 16; growth by `push_back` doubles: 15, 30, 60, 120 ...
- Detecting SSO in a test program (not in production code): check whether `s.data()` lies inside `[&s, &s + 1)`.
- Why SSO matters:
  - Most strings in real programs are short (names, keys, small messages): no allocation, no free, better cache locality.
  - Moving a short string must copy its characters (there is no heap block to steal), so a "move" of an SSO string costs about the same as a copy of 15 bytes.
  - Pointers into an SSO string point into the string object, so they die with the object and can never "follow" the characters to another string after a move.

#### 3. No copy-on-write since C++11
- Pre-C++11 libstdc++ (the old ABI) used reference-counted **copy-on-write** (COW): copies shared one buffer until someone wrote.
- C++11 made COW non-conforming:
  - Non-const `operator[]`, `at`, `begin()`, `end()` are not allowed to invalidate references, but a COW string must "unshare" (allocate) on the first non-const access, which moves the characters.
  - Concurrent reads of distinct string objects must not race; a shared refcount turns every copy into an atomic RMW and every non-const access into a check.
- GCC 5 introduced the new ABI (`_GLIBCXX_USE_CXX11_ABI=1`, default) with SSO and no COW. The `std::__cxx11::basic_string` symbol you see in error messages is that ABI tag.
- Consequence: `std::string b = a;` always allocates when `a` is longer than the inline capacity. Pass by `const std::string&` or `std::string_view` (see topic 02) when you only read.

#### 4. Contiguity, null termination and element access
- Since C++11:
  - Characters are contiguous: `&s[0] + i == &s[i]` for `i <= size()`.
  - `c_str()` and `data()` return the **same** pointer, and both point at a null-terminated sequence (`data()[size()] == '\0'`). Before C++11 `data()` was not required to be null-terminated.
  - `s[s.size()]` is valid and returns a reference to `'\0'`, for both const and non-const strings. Writing any value other than `'\0'` there is UB.
- C++17: non-const `data()` returns `char*`, so a C function can write into `s.data()` (up to `size()` characters).
- C++11 `front()` / `back()`; on an empty string both are UB (no check).
- `at(i)` checks and throws `std::out_of_range` for `i >= size()`; `operator[]` does not check (UB for `i > size()`).
- Embedded nulls are legal: a `std::string` knows its size, so `"ab\0cd"s` has size 5. But `c_str()` handed to a C function stops at the first `'\0'`.

#### 5. Pointer, reference and iterator validity: the exact rule
- The standard rule for `basic_string` ([string.require]): references, pointers and iterators into a string **may be invalidated** by:
  - Passing the string as a non-const reference to a library function (`swap`, `operator>>`, `getline`).
  - Calling **any non-const member function**, except `operator[]`, `at`, `data`, `front`, `back`, `begin`, `rbegin`, `end`, `rend`.
- That means `+=`, `append`, `push_back`, `insert`, `erase`, `replace`, `clear`, `resize`, `reserve`, `shrink_to_fit`, `assign`, `operator=` and `swap` **all** formally invalidate, **even when no reallocation happens**.
- This is stricter than `std::vector`, where "no reallocation" keeps pointers before the insertion point valid. Do not transfer the vector rule to strings.
- What actually happens in libstdc++ (useful for explaining symptoms, never for writing code):

| Operation on `s` after `p = s.c_str()` | Standard | libstdc++ / GCC, x86-64 behaviour |
|---|---|---|
| `s[0] = 'J'` | `p` valid | `p` sees `"Jello..."` |
| `s += "x"` within capacity | `p` invalidated | same buffer, `p` reads the longer string |
| `s += "x"` beyond capacity | `p` invalidated | heap reallocation, old block freed: use-after-free |
| `s.reserve(100)` on SSO string | `p` invalidated | `p` points into the object, now holding the capacity value |
| `s.clear()` | `p` invalidated | same buffer, `p[0] == '\0'` |
| `s.shrink_to_fit()` | `p` invalidated | may move heap data back into the local buffer |
| `a.swap(b)` | iterators invalidated | SSO characters stay in their object: an iterator into `a` now reads `b`'s old content |
| `std::string t = std::move(s)` | `p` invalidated | SSO: `p` still points into `s` (now empty); heap: `p == t.data()` in practice |

- The safe pattern: **reacquire** `c_str()` / `data()` / iterators after every non-const operation, or store an index instead of a pointer.
- Holding an invalidated pointer is fine; **using** it (dereference, printing, passing to a C API) is UB.
- AddressSanitizer only catches the heap cases. For an SSO string the stale pointer still points into a live object, so ASan stays silent while the program prints garbage.

#### 6. Size, capacity, reserve, clear, shrink_to_fit
- `reserve(n)`:
  - Ensures `capacity() >= n`; never changes `size()` or the content.
  - Since C++20 `reserve(n)` with `n < capacity()` is a no-op (never shrinks). Before C++20 it was a non-binding shrink request. The no-argument `reserve()` is deprecated in C++20 (removed in C++26).
- `resize(n)` / `resize(n, ch)`: changes `size()`; new characters are `'\0'` (or `ch`).
- `clear()`: `size()` becomes 0, capacity unchanged (libstdc++ keeps the heap block).
- `shrink_to_fit()`: non-binding request to reduce capacity to size. In libstdc++ a short string goes back into the local buffer (capacity 15).
- Growth is **geometric** so `push_back` is amortized O(1). The factor is implementation-defined (libstdc++ doubles; MSVC typically grows by 1.5x).
- Exceptions: allocation failure throws `std::bad_alloc`; exceeding `max_size()` throws `std::length_error`. `push_back` and `append` give the strong guarantee.
- Move constructor is `noexcept` (important so that `std::vector<std::string>` moves instead of copying on growth: see Memory & Ownership, topic 02).

#### 7. Construction and assignment traps
| Code | Result | Why |
|---|---|---|
| `std::string s(nullptr);` or `const char* p = nullptr; std::string s(p);` | UB (C++23: `nullptr` literal is a compile error) | The `const char*` constructor calls `strlen`; libstdc++ throws `logic_error` "null not valid" |
| `std::string s = 0;` | UB before C++23, compile error in C++23 | `0` is a null pointer constant |
| `std::string s(5, 'a');` | `"aaaaa"` | count + char constructor |
| `std::string s{5, 'a'};` | 2 characters: `'\x05'`, `'a'` | braces prefer `initializer_list<char>` |
| `std::string s = 'a';` | Compile error | no constructor from `char` |
| `s = 65;` | `"A"` | `operator=(char)`: the `int` converts silently |
| `std::string s("ab\0cd");` | size 2 | the `const char*` constructor stops at `'\0'` |
| `using namespace std::string_literals; auto s = "ab\0cd"s;` | size 5 | the literal operator receives the length |
| `std::string s(sv);` from `string_view` | copy | explicit; there is no implicit conversion from `string_view` |

#### 8. Searching and substrings
- `find`, `rfind`, `find_first_of`, `find_last_not_of` ... return a position or `std::string::npos`, which is `size_type(-1)` (the largest `size_t`).
- Classic bugs:
  - `if (s.find("x"))` is true when the text is **not** found (npos is non-zero) and false when it is found at position 0.
  - `int pos = s.find(...)` narrows npos to `-1`; comparing it later with an unsigned value converts it back, and it "works" by accident. Use `auto` or `std::size_t`.
- `substr(pos, n)`:
  - Returns a **new string** (allocation if longer than the SSO capacity).
  - Throws `std::out_of_range` if `pos > size()`; `pos == size()` returns an empty string.
  - `n` is clamped to the remaining length.
  - For parsing, prefer `std::string_view::substr` which is O(1) and allocation-free (see topic 02).
- C++20: `starts_with`, `ends_with`. C++23: `contains`. All three accept a `string_view`, a `char` or a `const char*`.
- Comparison: `==` compares size and content; C++20 `<=>` gives lexicographic `std::strong_ordering` (by `char_traits<char>::compare`, which the standard defines to compare as `unsigned char`, so `'\xE9' > 'a'` even where `char` is signed).

#### 9. Building strings efficiently
- `a + b + c` creates intermediate strings; since C++11 the rvalue overloads of `operator+` append into the left temporary, so a chain costs fewer allocations than it looks, but still more than one `reserve` plus `append`.
- In loops: `reserve` the final size once, then `+=` / `append`; reuse a string with `clear()` to keep its capacity.
- Number conversion:
  - `std::to_string(x)`: simple, allocates.
  - `std::to_chars` / `std::from_chars` (C++17): no allocation, no locale, no exceptions; the fastest option.
  - `std::stoi` and friends: throw `invalid_argument` / `out_of_range`.
- `std::format` (C++20, library support in GCC 13): type-safe formatting into a new string; `std::format_to` writes into an existing buffer.
- `resize_and_overwrite(n, op)` (C++23): lets a C API or a hand-written loop write directly into the buffer without first zero-filling `n` characters; `op` returns the final size.

#### 10. Misconceptions to unlearn
- ❌ "If there is spare capacity, `+=` keeps my `c_str()` pointer valid." ✅ Any non-const member except the access functions formally invalidates it; that it works in libstdc++ is not a guarantee.
- ❌ "SSO is part of the standard; a short string never allocates." ✅ SSO is an implementation choice; capacities differ (15 vs 22).
- ❌ "Copies share the buffer until one is modified." ✅ COW is forbidden since C++11; every copy owns its characters.
- ❌ "`data()` is not null-terminated, only `c_str()` is." ✅ Since C++11 they return the same null-terminated pointer.
- ❌ "Moving a string is always just stealing a pointer." ✅ A short string's characters are copied; the source is valid but unspecified (empty in practice).
- ❌ "A std::string on the stack keeps its characters on the stack." ✅ Only short strings; longer ones live on the heap regardless of where the object is.
- ❌ "ASan would have told me if the pointer was dangling." ✅ Stale pointers into an SSO buffer point into a live object; ASan sees nothing wrong.
- ❌ "`reserve(10)` on a big string shrinks it." ✅ Since C++20 it never shrinks; use `shrink_to_fit` (non-binding).
- ❌ "`std::string(nullptr)` makes an empty string." ✅ UB; C++23 deletes that overload.

### EDGE_CASES: Traps and Misconceptions

#### Edge Case 1: The append that "works" but is still invalid
- `const char* p = s.c_str(); s += " world"; puts(p);` may print the full text on libstdc++ when capacity was sufficient.
- The standard says `+=` may invalidate `p` regardless of capacity. Another library, a debug mode, or a future version may behave differently.
- When capacity is exceeded, libstdc++ allocates a new block and frees the old one: ASan reports `heap-use-after-free` on the next use of `p`.
- Rule: never reason from capacity for strings; reacquire the pointer.

#### Edge Case 2: reserve on a short string prints a stray "d"
- `std::string s = "Hello"; const char* p = s.c_str(); s.reserve(100);`
- In libstdc++ `p` points into the object's local buffer. After `reserve(100)` the characters move to the heap and the same 16 bytes now store the capacity field (a union).
- Capacity 100 is byte `0x64`, which is `'d'`, followed by zero bytes: printing `p` outputs `d`.
- ASan reports nothing: no memory was freed. The bug is real (formal invalidation) but invisible to the tool.
- With a 40-character string the same code reads a freed heap block and ASan does fire.

#### Edge Case 3: Iterators survive swap but switch strings
- For `std::vector`, `swap` keeps iterators valid and they follow the elements into the other vector.
- For `std::string`, `swap` is in the invalidating list. In libstdc++ short strings keep their characters inside each object, so the characters are exchanged by copying: an iterator into `a` keeps pointing into `a`'s buffer, which now holds `b`'s old content.
- A heap string's iterator would follow the buffer to `b` instead. Two different behaviours, both undefined to rely on.

#### Edge Case 4: `find` truth tests and npos
- `if (s.find("key"))` means "found at a non-zero position, or not found at all".
- Correct: `if (s.find("key") != std::string::npos)` or C++23 `s.contains("key")`.
- `int pos = s.find('x');` makes `pos == -1` for not found; `s.substr(pos)` then converts `-1` back to a huge `size_t` and throws `out_of_range`.

#### Edge Case 5: nullptr and 0 into a string
- `std::string s = nullptr;` and `std::string s = 0;` compile in C++20 (null pointer converts to `const char*`) and are UB: the constructor calls `strlen(nullptr)`.
- libstdc++ checks and throws `std::logic_error` (GCC 11: `"basic_string::_M_construct null not valid"`; GCC 13/14: `"basic_string: construction from null is not valid"`); other libraries may simply crash.
- C++23 adds `basic_string(nullptr_t) = delete`: both lines become compile errors (verified with GCC 13).
- A runtime `const char*` that happens to be null is still UB in C++23; guard at API boundaries.

#### Edge Case 6: Embedded null characters
- `std::string("ab\0cd")` has size 2: the `const char*` constructor stops at the first null.
- `"ab\0cd"s` (C++14 literal) or `std::string(ptr, 5)` keeps all 5 characters.
- `strlen(s.c_str())` and every C API that takes `const char*` see only the part before the first `'\0'`; binary data belongs in `std::string` only if you never hand it to C string functions.

#### Edge Case 7: Silent char conversions
- `s = 65;` compiles and makes `s == "A"` (`operator=(char)` takes the narrowed `int`).
- `s += 300;` compiles with a warning at best and appends `char(300)`.
- `std::string s{5, 'a'};` is two characters (`'\x05'`, `'a'`), not five `'a'`. Use parentheses for count + char.
- `std::string s = 'a';` does not compile, which surprises people after the line above compiled.

#### Edge Case 8: A pointer into a moved-from short string
- `const char* p = a.data(); std::string b = std::move(a);`
- Long string (libstdc++): the heap block is stolen, so `p == b.data()` in practice; still not guaranteed.
- Short string: the characters are copied into `b`'s local buffer; `p` still points into `a`, which is now empty (`p[0] == '\0'` in libstdc++).
- The moved-from state itself (valid but unspecified) is covered in Memory & Ownership, topic 03.

### CODE_EXAMPLES: Practical Demonstrations

#### Example 1: Where are the characters?
- Prints the object address, the data address, and whether the characters are inside the object (SSO).
- Numbers are libstdc++ / GCC, x86-64.
```cpp
#include <iostream>
#include <string>

bool inside(const std::string& s) {
    auto obj = reinterpret_cast<const char*>(&s);
    return s.data() >= obj && s.data() < obj + sizeof(s);
}

int main() {
    std::string small = "order-42";
    std::string big(40, 'x');
    std::cout << "sizeof(std::string) = " << sizeof(std::string) << '\n';
    std::cout << "small: cap " << small.capacity()
              << ", inline " << std::boolalpha << inside(small) << '\n';
    std::cout << "big:   cap " << big.capacity()
              << ", inline " << inside(big) << '\n';
    std::string copy = big;                       // deep copy, no sharing
    std::cout << "copy shares buffer: " << (copy.data() == big.data()) << '\n';
    std::cout << "data()==c_str(): " << (big.data() == big.c_str())
              << ", terminator " << int(big[big.size()]) << '\n';
}
```
- Output (libstdc++ / GCC, x86-64):
```
sizeof(std::string) = 32
small: cap 15, inline true
big:   cap 40, inline false
copy shares buffer: false
data()==c_str(): true, terminator 0
```
- On libc++ `sizeof` is 24 and `small` would still be inline (22-character capacity).

#### Example 2: Watching capacity change
- `push_back` growth, `reserve`, `clear`, `shrink_to_fit`.
```cpp
#include <iostream>
#include <string>

int main() {
    std::string s;
    std::cout << "empty: cap " << s.capacity() << '\n';
    for (int i = 0; i < 70; ++i) {
        auto before = s.capacity();
        s.push_back('a');
        if (s.capacity() != before)
            std::cout << "size " << s.size() << " -> cap " << s.capacity() << '\n';
    }
    s.reserve(10);                          // C++20: never shrinks
    std::cout << "after reserve(10): cap " << s.capacity() << '\n';
    s.clear();                              // size 0, capacity kept
    std::cout << "after clear: size " << s.size() << " cap " << s.capacity() << '\n';
    s.shrink_to_fit();                      // non-binding request
    std::cout << "after shrink_to_fit: cap " << s.capacity() << '\n';
}
```
- Output (libstdc++ / GCC, x86-64):
```
empty: cap 15
size 16 -> cap 30
size 31 -> cap 60
size 61 -> cap 120
after reserve(10): cap 120
after clear: size 0 cap 120
after shrink_to_fit: cap 15
```
- Growth doubles the old capacity in libstdc++; the standard only requires amortized constant `push_back`.

#### Example 3: Safe and unsafe pointer use around mutation
- Shows the exempt operation (`operator[]`) and the reacquire pattern.
```cpp
#include <cstdio>
#include <string>

int main() {
    std::string s = "hello";
    const char* p = s.c_str();
    s[0] = 'J';                    // operator[] does not invalidate
    std::puts(p);                  // Jello: guaranteed

    s += ", a much longer tail that cannot fit inline";
    // p is now invalid (here: SSO buffer abandoned for the heap)
    p = s.c_str();                 // reacquire after every mutation
    std::puts(p);

    std::size_t pos = s.find(',');  // store an index, not a pointer
    s.insert(0, ">> ");
    std::puts(s.c_str() + pos + 3); // recompute from the index
}
```
- Output:
```
Jello
Jello, a much longer tail that cannot fit inline
, a much longer tail that cannot fit inline
```
- Indices survive reallocation; pointers and iterators do not.

#### Example 4: The stale pointer ASan cannot see
- Same bug twice: once on a short string (silent), once on a long string (ASan reports it).
- Build with `-fsanitize=address` to see the difference; the program reads invalid pointers on purpose.
```cpp
#include <iostream>
#include <string>

int main() {
    std::string s = "Hello";
    const char* p = s.c_str();
    s.reserve(100);                       // UB to use p from here on
    std::cout << "short: [" << p << "]\n"; // libstdc++: prints "d" (capacity 100)

    std::string t(40, 'T');
    const char* q = t.c_str();
    t.reserve(1000);                      // old heap block freed
    std::cout << "long: first char " << q[0] << '\n';  // heap-use-after-free
}
```
- Output without ASan (libstdc++ / GCC, x86-64; anything is possible, this is UB):
```
short: [d]
long: first char <garbage>
```
- With `-fsanitize=address`: the first print passes silently, the second aborts with `heap-use-after-free`.
- Why `d`: libstdc++ stores the capacity in the same 16 bytes as the local buffer; 100 is ASCII `'d'`.

#### Example 5: Parsing with find, npos and substr
- Splits `key=value;key=value` with correct npos handling.
```cpp
#include <iostream>
#include <string>

int main() {
    const std::string cfg = "host=alpha;port=9000;mode=fast";
    std::size_t start = 0;
    while (start < cfg.size()) {
        std::size_t end = cfg.find(';', start);
        if (end == std::string::npos) end = cfg.size();
        std::size_t eq = cfg.find('=', start);
        if (eq != std::string::npos && eq < end) {
            std::string key = cfg.substr(start, eq - start);   // copies
            std::string val = cfg.substr(eq + 1, end - eq - 1);
            std::cout << key << " -> " << val << '\n';
        }
        start = end + 1;
    }
    std::cout << "has port: " << (cfg.find("port") != std::string::npos) << '\n';
}
```
- Output:
```
host -> alpha
port -> 9000
mode -> fast
has port: 1
```
- Each `substr` returns a new string; the zero-copy version with `string_view` is in topic 02.

#### Example 6: Building strings without wasted allocations
- `reserve` + `append`, `to_chars` for numbers, C++20 `starts_with` / `ends_with`.
```cpp
#include <charconv>
#include <iostream>
#include <string>

int main() {
    std::string line;
    line.reserve(64);                        // one allocation for the whole line
    char num[16];
    for (int id : {7, 42, 1000}) {
        auto [end, ec] = std::to_chars(num, num + sizeof num, id);
        line.append("id=").append(num, end).push_back(' ');
    }
    std::cout << '[' << line << "] cap " << line.capacity() << '\n';
    std::cout << std::boolalpha << line.starts_with("id=7")
              << ' ' << line.ends_with("1000 ") << '\n';
}
```
- Output (capacity is libstdc++ / GCC, x86-64):
```
[id=7 id=42 id=1000 ] cap 64
true true
```
- `std::to_chars` never allocates and never throws; it reports errors through `ec`.

#### Example 7: Letting a C API write into the string (C++17 and C++23)
- C++17: `resize` then write into non-const `data()`, then shrink to the real length.
- C++23: `resize_and_overwrite` skips the zero-fill.
```cpp
#include <cstdio>
#include <iostream>
#include <string>

int main() {
    std::string a;
    a.resize(32);                                      // zero-filled
    int n = std::snprintf(a.data(), a.size() + 1, "event %d at %s", 7, "open");
    a.resize(n);                                       // trim to what was written
    std::cout << a << " (" << a.size() << ")\n";

    std::string b;
    b.resize_and_overwrite(32, [](char* buf, std::size_t cap) {
        return static_cast<std::size_t>(
            std::snprintf(buf, cap + 1, "event %d at %s", 8, "close"));
    });
    std::cout << b << " (" << b.size() << ")\n";
}
```
- Output (C++23, verified with GCC 13):
```
event 7 at open (15)
event 8 at close (16)
```
- Writing `size() + 1` bytes is allowed because the terminator slot exists; the last byte written must be `'\0'`, which `snprintf` guarantees.

### QUICK_REFERENCE: Cheat Sheet

#### Does this operation invalidate pointers, references and iterators?
| Operation | Standard |
|---|---|
| `s[i]`, `at`, `front`, `back`, `data`, `c_str`, `begin`, `end`, `rbegin`, `rend` | No |
| `+=`, `append`, `push_back`, `insert`, `replace`, `erase` | Yes (even within capacity) |
| `clear`, `resize`, `assign`, `operator=` | Yes |
| `reserve`, `shrink_to_fit` | Yes |
| `swap`, `operator>>`, `getline` | Yes |
| Move from the string | Yes (SSO: pointers stay in the source object) |

#### Implementation facts (not guaranteed by C++)
- libc++ and MSVC columns: typical values for 64-bit release builds, not verified here.

| Fact | libstdc++ / GCC, x86-64 | libc++ (typical) | MSVC (typical) |
|---|---|---|---|
| `sizeof(std::string)` | 32 | 24 | 32 |
| Inline capacity | 15 | 22 | 15 |
| Growth on `push_back` | 2x | 2x | 1.5x |
| `shrink_to_fit` of a short heap string | back to inline | back to inline | back to inline |

#### Version timeline
| Version | Change |
|---|---|
| C++11 | Contiguity, `data()` null-terminated, COW forbidden, `front`/`back`, `to_string`, `stoi` |
| C++14 | `"..."s` literal |
| C++17 | non-const `data()`, `string_view` interop, `to_chars`/`from_chars` |
| C++20 | `starts_with`/`ends_with`, `reserve` never shrinks, `<=>`, `std::format`, `constexpr std::string` |
| C++23 | `contains`, `resize_and_overwrite`, `basic_string(nullptr_t) = delete` |

#### Interview one-liners
| Question | Answer |
|---|---|
| Is SSO guaranteed? | No; libstdc++ 15 chars, libc++ 22 chars |
| `sizeof(std::string)`? | Implementation-defined: 32 on GCC/MSVC, 24 on libc++ (64-bit) |
| Copy-on-write? | Forbidden since C++11 |
| Is `data()` null-terminated? | Yes, since C++11; same pointer as `c_str()` |
| Does `+=` within capacity keep `c_str()` valid? | Not guaranteed; reacquire |
| Which calls never invalidate? | `[]`, `at`, `front`, `back`, `data`, `begin`/`end` family |
| Does moving a short string steal a pointer? | No; characters are copied |
| `std::string(nullptr)`? | UB; compile error in C++23 |
| `s.find(x)` in an `if`? | Bug; compare with `npos` or use C++23 `contains` |
| `substr` cost? | New string; throws if `pos > size()` |
| Shrink a string? | `shrink_to_fit` (non-binding); `reserve` never shrinks since C++20 |
| Fastest int to string? | `std::to_chars` into a buffer |
