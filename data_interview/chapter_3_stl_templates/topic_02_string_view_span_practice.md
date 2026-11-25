## TOPIC: std::string_view and std::span

### PRACTICE_TASKS: Output Prediction and Bug Hunting

#### Q1
```cpp
// Q: Find the bug. Does the compiler warn?
#include <iostream>
#include <string>
#include <string_view>

std::string_view banner() {
    return std::string(60, '=');
}

int main() {
    std::string_view b = banner();
    std::cout << b.size() << ' ' << b.substr(0, 10) << '\n';
}
```

**Answer:**
```
Dangling view: UB. GCC 13 with -Wall -Wextra gives no warning.
Clang 14 warns by default: returning address of local temporary object [-Wreturn-stack-address].
ASan: heap-use-after-free when the characters are printed in main.
(The size 60 is stored in the view itself, so b.size() still prints 60.)
```

**Explanation:**
- The temporary `std::string` is created in the `return` statement and destroyed at the end of that statement, inside `banner()`. The view returned to `main` already points into freed memory.
- It is not "alive until the end of the caller's expression": that rule applies to temporaries created in the caller's own expression.
- `b.size()` is safe to read (it is the view's own member), but `b.substr(0, 10)` printed with `<<` reads the freed buffer.
- **Key Concept:** A function that creates text must return an owning `std::string`.

**Fixed Version:**
```cpp
#include <iostream>
#include <string>
#include <string_view>

std::string banner() {
    return std::string(60, '=');
}

int main() {
    std::string b = banner();
    std::cout << b.size() << ' ' << std::string_view(b).substr(0, 10) << '\n';
}
```

---

#### Q2
```cpp
// Q: What does this print on libstdc++? Is it well defined?
#include <iostream>
#include <string>
#include <string_view>

int main() {
    std::string s = "Hello";
    std::string_view v = s;
    s.clear();
    std::cout << v.size() << ' ' << int(v[0]) << ' ' << v.substr(1) << '\n';
}
```

**Answer:**
```
UB (clear() invalidates the view). On libstdc++ / GCC, x86-64:
5 0 ello
```

**Explanation:**
- `clear()` is a mutating member that is not exempt, so `v` is formally invalid.
- libstdc++ keeps the buffer and writes the terminator at `s[0]`; the other bytes are stale leftovers. `v` still has size 5, so it reads a null byte followed by `"ello"`.
- ASan reports nothing: the buffer still belongs to the live string.
- **Key Concept:** A view does not know its owner changed; "the bytes are still there" is not a guarantee, and here the first byte is already gone.

---

#### Q3
```cpp
// Q: What does this print? (s has enough capacity, so nothing reallocates.)
#include <iostream>
#include <string>
#include <string_view>

int main() {
    std::string s = "ABCDE";
    s.reserve(32);
    std::string_view sv = s;
    s[0] = 'X';
    std::cout << sv << ' ';
    s += "FG";
    std::cout << sv << ' ' << sv.size() << ' ' << s << '\n';
}
```

**Answer:**
```
XBCDE XBCDE 5 XBCDEFG
```
The first print is well defined. The second is formally UB (`+=` invalidates the view even without reallocation); the output shown is libstdc++ / GCC, x86-64.

**Explanation:**
- `s[0] = 'X'` goes through `operator[]`, which does not invalidate: the view sees the new character because it shares the memory.
- `s += "FG"` does not reallocate here (capacity 32), so libstdc++ leaves the buffer in place. The view keeps its original size 5 and never sees `"FG"`.
- By the standard rule for strings, the view is invalid after `+=` regardless.
- **Key Concept:** Views see in-place writes but never size changes; mutating calls invalidate them.

---

#### Q4
```cpp
// Q: Find the bug.
#include <iostream>
#include <string>
#include <string_view>

int main() {
    std::string record = "instrument-identifier-0000000042:active";
    std::string_view name = record.substr(0, record.find(':'));
    std::cout << '[' << name << "]\n";
}
```

**Answer:**
```
Dangling view: UB. std::string::substr returns a temporary std::string, destroyed at the
end of the statement. ASan: heap-use-after-free (the 32-character substring is on the heap).
```

**Explanation:**
- `record.substr(...)` is `std::string::substr`: a new owning string, not a view of `record`.
- The view binds to that temporary; the conversion compiles silently.
- Short substrings sit in the temporary's SSO buffer on the stack and may print correctly; long ones fail visibly.
- **Key Concept:** Convert to a view first, then slice: `std::string_view(record).substr(...)`.

**Fixed Version:**
```cpp
#include <iostream>
#include <string>
#include <string_view>

int main() {
    std::string record = "instrument-identifier-0000000042:active";
    std::string_view whole = record;
    std::string_view name = whole.substr(0, whole.find(':'));   // view of record
    std::cout << '[' << name << "]\n";
}
```

---

#### Q5
```cpp
// Q: What does this print?
#include <iostream>
#include <string_view>

int main() {
    using namespace std::literals;
    std::string_view a = "ab\0cd";
    std::string_view b = "ab\0cd"sv;
    std::string_view c("ab\0cd", 5);
    std::cout << a.size() << ' ' << b.size() << ' ' << c.size() << ' '
              << (a == b) << ' ' << (b == c) << '\n';
}
```

**Answer:**
```
2 5 5 0 1
```

**Explanation:**
- Constructing from `const char*` measures the length with `traits::length` (strlen): it stops at the embedded null.
- The `sv` literal and the `(ptr, len)` constructor keep all 5 characters.
- Comparison checks length and every character, including the null, so `a != b` and `b == c`.
- **Key Concept:** How a view was constructed decides its length; embedded nulls survive only with an explicit length.

---

#### Q6
```cpp
// Q: Does this compile with -std=c++20?
#include <iostream>
#include <string>
#include <string_view>

int main() {
    std::string s = "id=";
    std::string_view sv = "42";
    std::string r = s + sv;
    std::cout << r << '\n';
}
```

**Answer:**
```
Compile error (GCC 11, C++20; also GCC 13 with -std=c++23):
  error: no match for 'operator+' (operand types are 'std::string' and 'std::string_view')
```

**Explanation:**
- There is no `operator+(const std::string&, std::string_view)` before C++26 (P2591).
- `string_view` does not convert implicitly to `std::string` (that conversion is `explicit` because it allocates), so the existing `operator+(const string&, const string&)` is not viable.
- `s += sv;`, `s.append(sv);` and `s + std::string(sv)` all compile.
- **Key Concept:** Append views into a string; do not add them.

**Fixed Version:**
```cpp
#include <iostream>
#include <string>
#include <string_view>

int main() {
    std::string s = "id=";
    std::string_view sv = "42";
    std::string r = s;
    r += sv;                       // append accepts string_view (C++17)
    std::cout << r << '\n';        // id=42
}
```

---

#### Q7
```cpp
// Q: Find the bug. The view is only used on the next line.
#include <iostream>
#include <string>
#include <string_view>

int main(int argc, char**) {
    std::string configured = "primary-feed-handler-with-a-long-name";
    bool use_default = argc > 5;
    std::string_view label = use_default ? "default" : configured;
    std::cout << label << '\n';
}
```

**Answer:**
```
Dangling view: UB, even though use_default is false.
ASan: heap-use-after-free when label is printed.
```

**Explanation:**
- The conditional operator needs one type for both branches: `const char[8]` and `std::string` give a `std::string` prvalue.
- So the expression produces a **temporary copy** of `configured`, the view binds to the copy, and the copy dies at the semicolon.
- The view never pointed at `configured`.
- **Key Concept:** Make both branches views (`"default"sv` and `std::string_view(configured)`) so the result type is `string_view`.

**Fixed Version:**
```cpp
#include <iostream>
#include <string>
#include <string_view>

int main(int argc, char**) {
    using namespace std::literals;
    std::string configured = "primary-feed-handler-with-a-long-name";
    bool use_default = argc > 5;
    std::string_view label = use_default ? "default"sv : std::string_view(configured);
    std::cout << label << '\n';
}
```

---

#### Q8
```cpp
// Q: What does this print?
#include <cstring>
#include <iostream>
#include <string>
#include <string_view>

int main() {
    std::string t = "abcdef";
    std::string_view v = std::string_view(t).substr(0, 3);
    std::cout << v << ' ' << v.size() << ' ' << std::strlen(v.data()) << '\n';
}
```

**Answer:**
```
abc 3 6
```

**Explanation:**
- `std::cout << v` uses the view's size: `abc`.
- `strlen(v.data())` ignores the size and scans for `'\0'`, which only comes after `"def"` in `t`'s buffer: 6.
- Here the scan stays inside `t`, so it is not UB, just wrong. With a view into a raw buffer there may be no terminator and `strlen` runs off the end.
- **Key Concept:** Never hand `string_view::data()` to an API that expects a null-terminated string.

---

#### Q9
```cpp
// Q: Find the bug.
#include <iostream>
#include <map>
#include <string>
#include <string_view>

std::string make_key(int i) { return "instrument-key-number-" + std::to_string(i); }

int main() {
    std::map<std::string_view, int> index;
    for (int i = 0; i < 3; ++i)
        index[make_key(i)] = i;
    for (auto& [k, v] : index)
        std::cout << k << " -> " << v << '\n';
}
```

**Answer:**
```
Dangling keys: UB. Every key views a temporary string that died after its statement.
ASan: heap-use-after-free inside the map's key comparison (on the second insertion).
```

**Explanation:**
- `index[make_key(i)]` converts the temporary `std::string` to a `string_view` key and stores only the pointer and length.
- The temporary is destroyed at the end of the statement; the next insertion compares the new key against freed memory.
- Short keys (inside the SSO capacity) would sit in dead stack temporaries and could even appear to work.
- **Key Concept:** A container must own its keys; use `std::map<std::string, int, std::less<>>` and look up with views.

**Fixed Version:**
```cpp
#include <iostream>
#include <map>
#include <string>
#include <string_view>

std::string make_key(int i) { return "instrument-key-number-" + std::to_string(i); }

int main() {
    std::map<std::string, int, std::less<>> index;      // owns keys, transparent find
    for (int i = 0; i < 3; ++i)
        index[make_key(i)] = i;
    std::string_view probe = "instrument-key-number-1";
    std::cout << index.find(probe)->second << '\n';      // 1
}
```

---

#### Q10
```cpp
// Q: What does this print? Is it well defined?
#include <iostream>
#include <span>
#include <vector>

int main() {
    std::vector<int> v{1, 2, 3};
    v.reserve(10);
    std::span<int> s = v;
    v.push_back(4);
    v[0] = 100;
    std::cout << s.size() << ' ' << s[0] << ' ' << v.size() << '\n';
}
```

**Answer:**
```
3 100 4
```
Well defined: `reserve(10)` happened before the span was made, so `push_back` does not reallocate.

**Explanation:**
- For `std::vector`, an insertion without reallocation keeps pointers to elements before the insertion point valid, so the span's pointer is still good.
- The span stored `(data(), 3)` at construction: its size stays 3 and element 4 is invisible through it.
- `v[0] = 100` writes the shared memory, so `s[0]` sees it.
- Without the `reserve`, the `push_back` would reallocate (capacity 3 to 6 on libstdc++) and `s[0]` would read freed memory.
- **Key Concept:** A span is a snapshot of pointer and size; it shares elements but not size changes.

---

#### Q11
```cpp
// Q: What does this print?
#include <iostream>
#include <string>
#include <string_view>

int main() {
    std::string s = "GET /status HTTP/1.1";
    std::string_view v = s;
    v.remove_prefix(4);
    v.remove_suffix(9);
    std::cout << '[' << v << "] [" << s << "] " << (v.data() - s.data()) << '\n';
}
```

**Answer:**
```
[/status] [GET /status HTTP/1.1] 4
```

**Explanation:**
- `remove_prefix(4)` moves the view's pointer forward by 4 and shrinks its size; `remove_suffix(9)` shrinks the size only.
- The underlying string is untouched: these functions modify the view object, never the characters.
- The view's data pointer is 4 characters into `s`'s buffer.
- **Key Concept:** Trimming and slicing a view is pointer arithmetic: O(1), no allocation, owner unchanged.

---
