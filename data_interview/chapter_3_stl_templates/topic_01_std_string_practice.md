## TOPIC: std::string: SSO, Buffers and Pointer Validity

### PRACTICE_TASKS: Output Prediction and Bug Hunting

#### Q1
```cpp
// Q: What does this print? Is it well defined?
#include <cstdio>
#include <string>

int main() {
    std::string s = "Hello";
    const char* p = s.c_str();
    s[0] = 'J';
    s[4] = 'y';
    std::puts(p);
    std::printf("%d\n", p == s.c_str());
}
```

**Answer:**
```
Jelly
1
```

**Explanation:**
- `operator[]` is in the exempt list of the invalidation rule: calling it on a non-const string does not invalidate pointers, references or iterators.
- So `p` still points at the live buffer and sees both writes; `c_str()` returns the same pointer.
- This is a guarantee, not an implementation accident, unlike the `+=` case in Q2.
- **Key Concept:** Element access (`[]`, `at`, `front`, `back`, `data`, `begin`/`end`) never invalidates borrows into a string.

---

#### Q2
```cpp
// Q: What does this print on libstdc++? Is it well defined?
#include <iostream>
#include <string>

int main() {
    std::string s = "Hello";
    const char* p = s.c_str();
    s.reserve(100);
    std::cout << '[' << p << "]\n";
}
```

**Answer:**
```
UB. On libstdc++ / GCC, x86-64 it prints:
[d]
ASan reports nothing.
```

**Explanation:**
- `reserve` is a non-const member that is not exempt, so `p` is invalidated; printing it is UB.
- Why `d`: "Hello" was inline (SSO). `p` points into the string object's 16-byte local buffer. After `reserve(100)` the characters move to the heap and libstdc++ reuses those 16 bytes (a union) for the capacity field. 100 is `0x64`, ASCII `'d'`, followed by zero bytes.
- ASan is silent because `p` points into a live object: nothing was freed. With a 40-character string the old heap block is freed and ASan reports `heap-use-after-free`.
- **Key Concept:** Stale pointers into an SSO buffer are invisible to sanitizers; follow the rule, not the tool.

**Fixed Version:**
```cpp
#include <iostream>
#include <string>

int main() {
    std::string s = "Hello";
    s.reserve(100);
    const char* p = s.c_str();          // acquire after the last mutation
    std::cout << '[' << p << "]\n";     // [Hello]
}
```

---

#### Q3
```cpp
// Q: What does this print?
#include <iostream>
#include <string>

int main() {
    std::string text = "key=value";
    if (text.find("key")) std::cout << "A ";
    else                  std::cout << "B ";
    if (text.find("zzz")) std::cout << "C ";
    else                  std::cout << "D ";
    std::cout << (text.find("zzz") == std::string::npos) << '\n';
}
```

**Answer:**
```
B C 1
```

**Explanation:**
- `"key"` is found at position 0, which converts to `false`: prints `B`.
- `"zzz"` is not found: `find` returns `npos` (`size_t(-1)`), which is non-zero: prints `C`.
- The truth test is inverted for position 0 and wrong for "not found".
- **Key Concept:** Compare against `std::string::npos` (or use C++23 `contains`), never use `find` as a boolean.

---

#### Q4
```cpp
// Q: What does this print?
#include <iostream>
#include <string>

int main() {
    std::string a(3, 'x');
    std::string b{3, 'x'};
    std::string c;
    c = 66;
    std::cout << a.size() << ' ' << b.size() << ' ' << c << '\n';
}
```

**Answer:**
```
3 2 B
```

**Explanation:**
- `a(3, 'x')`: count + char constructor: `"xxx"`.
- `b{3, 'x'}`: braces prefer `initializer_list<char>`: two characters, `'\x03'` and `'x'`.
- `c = 66;`: `operator=(char)` accepts the `int` (implicit conversion), so `c == "B"`.
- `std::string d = 'x';` on the other hand does not compile: there is no constructor from a single `char`.
- **Key Concept:** Braces pick `initializer_list` constructors; `int` silently converts to `char` in string assignment.

---

#### Q5
```cpp
// Q: Does this compile with -std=c++20? With -std=c++23? What happens at run time?
#include <iostream>
#include <string>

int main() {
    std::string s = nullptr;
    std::cout << s.size() << '\n';
}
```

**Answer:**
```
C++20: compiles. Run time: UB; libstdc++ (GCC 11) throws
  terminate called after throwing an instance of 'std::logic_error'
    what():  basic_string::_M_construct null not valid
  (GCC 13/14 wording: basic_string: construction from null is not valid)
C++23 (GCC 13): compile error:
  use of deleted function 'basic_string(std::nullptr_t)'
```

**Explanation:**
- Before C++23, `nullptr` converts to `const char*` and selects the C-string constructor, which calls `strlen` on it: UB. libstdc++ happens to check and throw; other libraries crash.
- C++23 adds `basic_string(std::nullptr_t) = delete;`, which also catches `std::string s = 0;`.
- A runtime null pointer (`const char* p = getenv("X");`) still compiles and is still UB in C++23.
- **Key Concept:** A null `const char*` is not an empty string; check it before constructing.

---

#### Q6
```cpp
// Q: What does this print?
#include <cstring>
#include <iostream>
#include <string>

int main() {
    using namespace std::string_literals;
    std::string a("ab\0cd");
    std::string b = "ab\0cd"s;
    std::cout << a.size() << ' ' << b.size() << ' '
              << std::strlen(b.c_str()) << '\n';
}
```

**Answer:**
```
2 5 2
```

**Explanation:**
- The `const char*` constructor determines the length with `strlen`, so it stops at the embedded null: size 2.
- The `s` literal operator (C++14) receives the array length, so all 5 characters are kept.
- `strlen` (and any C API) sees only the part before the first `'\0'`, even though `b.size()` is 5.
- **Key Concept:** `std::string` tracks its size; C APIs track a terminator. Embedded nulls break the second.

---

#### Q7
```cpp
// Q: What does this print? Is it UB?
#include <iostream>
#include <string>

int main() {
    std::string s = "no colon here";
    int pos = s.find(':');
    std::string tail = s.substr(pos + 1);
    std::cout << pos << " [" << tail << "]\n";
}
```

**Answer:**
```
-1 [no colon here]
```
Not UB, but a logic bug that silently returns the whole string.

**Explanation:**
- `find` returns `npos` (`size_t(-1)`); storing it in `int` gives `-1` (GCC warns with `-Wconversion`, not with `-Wall -Wextra`).
- `pos + 1` is `0`, so `substr(0)` is the whole string. The "tail after the colon" is the entire input and no error is reported.
- With `std::size_t pos`, `pos + 1` wraps to 0 as well: same result. The fix is an explicit `npos` check, not a different type.
- **Key Concept:** Always branch on `npos` before doing arithmetic with a `find` result.

**Fixed Version:**
```cpp
#include <iostream>
#include <string>

int main() {
    std::string s = "no colon here";
    auto pos = s.find(':');
    if (pos == std::string::npos) {
        std::cout << "no separator\n";
        return 0;
    }
    std::cout << '[' << s.substr(pos + 1) << "]\n";
}
```

---

#### Q8
```cpp
// Q: Find the bug.
#include <cstdio>
#include <string>

std::string make_path(const std::string& dir) { return dir + "/settings.conf"; }

int main() {
    std::string dir = "/opt/service/configuration";
    const char* path = make_path(dir).c_str();
    std::printf("opening %s\n", path);
}
```

**Answer:**
```
Dangling pointer: UB. The temporary string returned by make_path is destroyed at the
end of the full expression, so path points into freed memory.
ASan: heap-use-after-free in printf.
```

**Explanation:**
- `make_path(dir)` returns a prvalue; `.c_str()` is called on the temporary, which dies at the `;`.
- The path is 40 characters, so the buffer is on the heap and is freed: ASan catches it. A short result would sit in a stack temporary and might print correctly while still being UB.
- Lifetime extension does not help: only binding the temporary itself to a `const&` or `&&` extends it, not binding a pointer obtained from it.
- **Key Concept:** Keep the owning string alive in a named variable for as long as any `c_str()` pointer is used.

**Fixed Version:**
```cpp
#include <cstdio>
#include <string>

std::string make_path(const std::string& dir) { return dir + "/settings.conf"; }

int main() {
    std::string dir = "/opt/service/configuration";
    std::string path = make_path(dir);           // owner lives to end of scope
    std::printf("opening %s\n", path.c_str());
}
```

---

#### Q9
```cpp
// Q: What does this print on libstdc++?
#include <iostream>
#include <string>

int main() {
    std::string a = "abc";
    std::string b = "xyz";
    auto it = a.begin();
    a.swap(b);
    std::cout << a << ' ' << b << ' ' << *it << '\n';
}
```

**Answer:**
```
xyz abc x
```
Using `it` after the swap is UB by the standard; the line shows libstdc++ / GCC, x86-64 behaviour.

**Explanation:**
- For `std::string`, `swap` is listed as invalidating (unlike `std::vector::swap`, where iterators stay valid and follow the elements).
- In libstdc++ both strings are inline (SSO), so swapping copies the characters between the two objects' local buffers. `it` still points into `a`'s buffer, which now holds `"xyz"`.
- With heap strings the buffers would be exchanged by pointer, and `it` would follow `"abc"` into `b`: a different result from the same code.
- **Key Concept:** Do not keep string iterators across `swap`; the vector guarantee does not carry over.

---

#### Q10
```cpp
// Q: What does this print on libstdc++?
#include <iostream>
#include <string>

int main() {
    std::string shortA = "tiny";
    std::string longA(30, 'L');
    const char* p1 = shortA.data();
    const char* p2 = longA.data();
    std::string shortB = std::move(shortA);
    std::string longB = std::move(longA);
    std::cout << (p1 == shortB.data()) << ' ' << (p2 == longB.data()) << ' '
              << shortA.size() << ' ' << longA.size() << '\n';
}
```

**Answer:**
```
0 1 0 0
```
(libstdc++ / GCC, x86-64; only "moved-from strings are valid" is guaranteed.)

**Explanation:**
- `"tiny"` lives in `shortA`'s local buffer. A move cannot steal it; the characters are copied into `shortB`'s own local buffer, so `p1 != shortB.data()`.
- The 30-character string lives on the heap; the move steals the block, so `p2 == longB.data()` in practice.
- Both sources are left empty by libstdc++; the standard only says "valid but unspecified".
- Using `p1` or `p2` afterwards is formally invalid in both cases.
- **Key Concept:** Moving a short string is a copy of its characters; pointers never follow by contract.

---

#### Q11
```cpp
// Q: What does this print?
#include <iostream>
#include <stdexcept>
#include <string>

int main() {
    std::string s = "abc";
    std::cout << '[' << s.substr(3) << "] ";
    std::cout << '[' << s.substr(1, 100) << "] ";
    try {
        std::cout << s.substr(4);
    } catch (const std::out_of_range&) {
        std::cout << "out_of_range";
    }
    std::cout << '\n';
}
```

**Answer:**
```
[] [bc] out_of_range
```

**Explanation:**
- `substr(pos)` with `pos == size()` is allowed and returns an empty string.
- The count is clamped to the remaining characters: `substr(1, 100)` is `"bc"`.
- `pos > size()` throws `std::out_of_range`.
- `operator[]` has no such check; `at()` and `substr` do.
- **Key Concept:** `substr` checks `pos`, clamps `n`, and always returns a new string.

---

#### Q12
```cpp
// Q: Does this program have UB? What does it print?
#include <iostream>
#include <string>

int main() {
    std::string s = "abc";
    std::cout << int(s[s.size()]) << ' ';
    std::cout << s.size() << ' ' << s.capacity() << ' ';
    s.clear();
    std::cout << s.size() << ' ' << s.capacity() << ' ' << int(s.data()[0]) << '\n';
}
```

**Answer:**
```
0 3 15 0 15 0
```
No UB. The capacity value 15 is libstdc++ / GCC, x86-64.

**Explanation:**
- `s[s.size()]` is a valid read of the terminator since C++11 (it returns a reference to `'\0'`; writing anything else there is UB).
- `clear()` sets the size to 0 and keeps the capacity.
- After `clear()`, `data()` points at a valid empty, null-terminated string.
- **Key Concept:** `s[size()]` is `'\0'` by contract; `clear` empties without releasing memory.

---
