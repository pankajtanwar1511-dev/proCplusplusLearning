## TOPIC: Value Categories, std::move and Moved-From State

### PRACTICE_TASKS: Output Prediction and Bug Hunting

#### Q1
```cpp
// Q: What does this print?
#include <iostream>
#include <utility>

struct T {};
void f(const T&) { std::cout << "copy path\n"; }
void f(T&&)      { std::cout << "move path\n"; }

void wrap(T&& x) {
    f(x);
    f(std::move(x));
}

int main() {
    T t;
    wrap(std::move(t));
    wrap(T{});
}
```

**Answer:**
```
copy path
move path
copy path
move path
```

**Explanation:**
- Inside `wrap`, `x` has type `T&&` but the expression `x` is an lvalue (it has a name), so `f(x)` picks `f(const T&)`.
- `f(std::move(x))` casts back to an xvalue and picks `f(T&&)`.
- It does not matter whether the caller passed an xvalue or a prvalue: once bound to a named parameter, it is an lvalue.
- **Key Concept:** If it has a name, it is an lvalue; `std::move` it again on its last use.

---

#### Q2
```cpp
// Q: The lambda is supposed to move the buffer out. What does this print?
#include <iostream>
#include <string>
#include <utility>

int main() {
    std::string buf(30, 'x');
    auto job = [buf = std::move(buf)] {
        std::string sent = std::move(buf);
        return sent.size();
    };
    std::cout << buf.size() << '\n';
    std::cout << job() << ' ' << job() << '\n';
}
```

**Answer:**
```
0
30 30
```

**Explanation:**
- The init-capture `buf = std::move(buf)` really moves the string into the closure: the outer `buf` is empty (libstdc++).
- The lambda is not `mutable`, so its call operator is `const` and the captured `buf` is a `const std::string` inside the body.
- `std::move(buf)` is then `const std::string&&`: the copy constructor runs. Each call copies 30 characters, and the closure keeps its string.
- Fix: `[buf = std::move(buf)]() mutable { ... }`; then the first call prints 30 and a second call 0.
- **Key Concept:** Non-mutable lambda captures are const; `std::move` on them copies.

---

#### Q3
```cpp
// Q: What does this print? Is the answer the same on every compiler?
#include <iostream>
#include <string>
#include <utility>

void record(std::string msg, std::size_t len) {
    std::cout << "msg=" << msg.size() << " len=" << len << '\n';
}

int main() {
    std::string s(30, 'x');
    record(std::move(s), s.size());
}
```

**Answer:**
```
Unspecified. GCC 11 (x86-64): msg=30 len=30
             Clang 14:        msg=30 len=0   (with libstdc++)
```

**Explanation:**
- The move happens when the parameter `msg` is initialized, not when `std::move` is called.
- Function parameters are initialized in an unspecified order (indeterminately sequenced; C++17 did not make it left to right).
- GCC evaluated `s.size()` first (30), then moved. Clang initialized `msg` first, moving `s` out, then read `s.size()` from the moved-from string (0 with libstdc++).
- Not UB, but the result depends on the compiler: a portability bug that tests on one compiler never catch.
- **Key Concept:** Never move from and read the same object in one function call; read into a local first.

**Fixed Version:**
```cpp
#include <iostream>
#include <string>
#include <utility>

void record(std::string msg, std::size_t len) {
    std::cout << "msg=" << msg.size() << " len=" << len << '\n';
}

int main() {
    std::string s(30, 'x');
    const std::size_t len = s.size();     // sequenced before the move
    record(std::move(s), len);            // msg=30 len=30 everywhere
}
```

---

#### Q4
```cpp
// Q: How many strings are left in src, and how long is src[0]?
#include <iostream>
#include <string>
#include <utility>
#include <vector>

int main() {
    std::vector<std::string> src{std::string(30, 'a'), std::string(30, 'b')};
    std::vector<std::string> dst;
    for (const auto& e : src)
        dst.push_back(std::move(e));
    std::cout << src.size() << ' ' << src[0].size() << ' ' << dst.size() << '\n';
}
```

**Answer:**
```
2 30 2
```

**Explanation:**
- `e` is `const std::string&`, so `std::move(e)` is `const std::string&&`, which binds to `push_back(const std::string&)`: every element is copied.
- `src` keeps all its contents. No compiler warning; clang-tidy `performance-move-const-arg` reports it.
- Fix: `for (auto& e : src) dst.push_back(std::move(e));` (then `src[0].size()` is 0 in practice), or `dst = std::move(src);` to transfer the whole buffer in O(1).
- **Key Concept:** `std::move` preserves `const`; a const source always copies.

---

#### Q5
```cpp
// Q: Which lines compile?
#include <utility>

struct W {
    W() = default;
    W(const W&) = default;
    W(W&&) = delete;
};

void take(W) {}

int main() {
    W a;
    take(a);              // line A
    take(std::move(a));   // line B
    take(W{});            // line C
}
```

**Answer:**
```
Line B does not compile:
error: use of deleted function 'W::W(W&&)'
Lines A and C compile.
```

**Explanation:**
- A: the parameter is initialized from an lvalue: copy constructor, fine.
- B: initialized from an xvalue: the deleted `W(W&&)` is the best match. Deleted functions take part in overload resolution, so there is no fallback to the copy.
- C: `W{}` is a prvalue; since C++17 it initializes the parameter directly, so no copy or move constructor is needed at all, deleted or not (topic 04).
- **Key Concept:** `= delete` on the move constructor blocks rvalue initialization; it does not mean "copy instead".

---

#### Q6
```cpp
// Q: How many copies does building one Order make?
#include <iostream>
#include <utility>

struct Id {
    Id() = default;
    Id(const Id&) { std::cout << "copy\n"; }
    Id(Id&&) noexcept { std::cout << "move\n"; }
};

class Order {
    Id id_;
public:
    explicit Order(Id&& id) : id_(id) {}
};

int main() {
    Id id;
    Order o(std::move(id));
}
```

**Answer:**
```
copy
```

**Explanation:**
- The caller correctly passes an xvalue, which binds to the `Id&&` parameter without any constructor running.
- In the member initializer, `id` is a named variable, so `id_(id)` initializes from an lvalue: copy constructor.
- Fix: `id_(std::move(id))` prints `move`.
- Alternative sink signature: `explicit Order(Id id) : id_(std::move(id)) {}` accepts lvalues (one copy + one move) and rvalues (two moves).
- **Key Concept:** Accepting `T&&` is only half of moving; the body must `std::move` the parameter.

---

#### Q7
```cpp
// Q: What does this print?
#include <iostream>
#include <optional>
#include <string>
#include <utility>

std::optional<std::string> pending = std::string(25, 'o');

void send_pending() {
    if (pending) {
        std::string msg = std::move(*pending);
        std::cout << "sent " << msg.size() << " bytes\n";
    }
}

int main() {
    send_pending();
    send_pending();
}
```

**Answer:**
```
sent 25 bytes
sent 0 bytes
```

**Explanation:**
- Moving out of `*pending` moves the contained string, not the optional: `pending` stays engaged.
- The second call sees `pending` as "has a value" and sends the moved-from (empty in practice) string: a duplicate, empty message.
- Fix: consume explicitly: `std::string msg = std::move(*pending); pending.reset();` (or `auto msg = std::exchange(pending, std::nullopt);` and use `*msg`).
- **Key Concept:** A moved-from `std::optional` is still engaged; "moved" is not "empty".

---

#### Q8
```cpp
// Q: Which overload runs for each call?
#include <iostream>
#include <string>
#include <utility>

class Config {
    std::string text_ = "cfg";
public:
    const std::string& text() const& { std::cout << "const& "; return text_; }
    std::string text() && { std::cout << "&& "; return std::move(text_); }
};

Config load() { return Config{}; }

int main() {
    Config c;
    const Config cc;
    c.text();
    cc.text();
    load().text();
    std::move(c).text();
    std::move(cc).text();
    std::cout << '\n';
}
```

**Answer:**
```
const& const& && && const& 
```

**Explanation:**
- `c.text()`: lvalue object: `const&` (the only overload accepting an lvalue).
- `cc.text()`: const lvalue: `const&`.
- `load().text()`: prvalue object: `&&` is a better match than `const&`.
- `std::move(c).text()`: xvalue: `&&`.
- `std::move(cc).text()`: const xvalue: cannot bind `&&` (non-const), falls back to `const&`, the same "const rvalue copies" rule as constructors.
- **Key Concept:** Ref-qualifiers apply the same binding rules to `*this` that ordinary parameters follow.

---

#### Q9
```cpp
// Q: What does this print? Is p guaranteed to be usable?
#include <iostream>
#include <string>
#include <utility>

int main() {
    std::string s = "EURUSD";
    const char* p = s.data();
    std::string t = std::move(s);
    std::cout << std::boolalpha << (p == t.data()) << " [" << p << "] [" << t << "]\n";
}
```

**Answer:**
```
false [] [EURUSD]   (libstdc++)
p is not guaranteed to be valid by the standard.
```

**Explanation:**
- "EURUSD" fits in the small string buffer (SSO, 15 chars in libstdc++), so the characters live inside `s` itself.
- The move constructor copies those characters into `t`'s own inline buffer and makes `s` an empty string. `p` still points into `s`, which now holds `""`.
- No crash and ASan is silent here because `s` is alive; the bug is a wrong value. With a 100-character string libstdc++ transfers the heap buffer and `p == t.data()` is `true`, but [string.require] allows invalidation, so neither case is something to rely on.
- **Key Concept:** Do not hold pointers or `string_view`s into a string across a move of that string.

---

#### Q10
```cpp
// Q: Which static_asserts fail to compile?
#include <string>
#include <type_traits>
#include <utility>

std::string make();
std::string& ref();

int main() {
    std::string s;
    std::string&& r = make();
    static_assert(std::is_same_v<decltype(r), std::string&&>);         // A
    static_assert(std::is_same_v<decltype((r)), std::string&&>);       // B
    static_assert(std::is_same_v<decltype((make())), std::string>);    // C
    static_assert(std::is_same_v<decltype((ref())), std::string&>);    // D
    static_assert(std::is_same_v<decltype((std::move(s))), std::string&&>); // E
}
```

**Answer:**
```
Only B fails: decltype((r)) is std::string&, because the expression r is an lvalue.
error: static assertion failed
```

**Explanation:**
- A: `decltype(name)` gives the declared type: `std::string&&`. Passes.
- B: `(r)` is an expression; named variables are lvalues, so `std::string&`. Fails.
- C: a call returning by value is a prvalue: `std::string`. Passes.
- D: a call returning `T&` is an lvalue: `std::string&`. Passes.
- E: `std::move(s)` is an xvalue: `std::string&&`. Passes.
- The same parentheses rule bites in `decltype(auto) f() { std::string x; return (x); }`, which returns a dangling `std::string&`.
- **Key Concept:** `decltype((e))` maps lvalue/xvalue/prvalue to `T&`/`T&&`/`T`.

---

#### Q11
```cpp
// Q: What does this print with libstdc++? What would a conforming implementation be allowed to print?
#include <iostream>
#include <string>
#include <utility>
#include <vector>

int main() {
    std::vector<std::string> lines;
    std::string line;
    for (const char* word : {"alpha", "beta", "gamma"}) {
        line += word;
        lines.push_back(std::move(line));
    }
    for (const auto& l : lines) std::cout << l << ' ';
    std::cout << '\n';
}
```

**Answer:**
```
alpha beta gamma
```
(libstdc++). A conforming implementation could leave `line` non-empty after the move, for example printing `alpha alphabeta alphabetagamma`.

**Explanation:**
- The loop relies on a moved-from `std::string` being empty. It is in every major implementation, but the standard only says "valid but unspecified".
- `+=` on a moved-from string is legal (no preconditions); its starting value is the unspecified part.
- Fix: put the object back into a known state before reuse: `line.clear();` right after the `push_back`, or declare `line` inside the loop.
- **Key Concept:** Reuse after move is fine; relying on the moved-from value is not.

---

#### Q12
```cpp
// Q: Is this UB? What does it print?
#include <iostream>
#include <memory>
#include <utility>

int main() {
    auto owner = std::make_unique<int>(42);
    int* raw = owner.get();
    std::unique_ptr<int> next = std::move(owner);
    *raw = 50;
    std::cout << *next << ' ' << (owner ? "owner set" : "owner null") << '\n';
}
```

**Answer:**
```
50 owner null
```

**Explanation:**
- Not UB. Moving a `unique_ptr` transfers ownership; the `int` stays at the same address, so `raw` still points to a live object, now owned by `next`.
- The moved-from `unique_ptr` is guaranteed to be null (unlike a moved-from `std::string`, whose state is unspecified).
- `raw` becomes dangling only when the owning `unique_ptr` (`next`) is destroyed or reset.
- **Key Concept:** Moving the owner is not moving the owned object; pointer validity after a move is a per-type guarantee.

---

#### Q13
```cpp
// Q: release() is supposed to hand the name to the caller cheaply. Does it?
#include <iostream>
#include <string>
#include <utility>

class Session {
    std::string user_ = std::string(40, 'u');
public:
    std::string release() const { return std::move(user_); }
    std::size_t size() const { return user_.size(); }
};

int main() {
    Session s;
    std::string u = s.release();
    std::cout << u.size() << ' ' << s.size() << '\n';
}
```

**Answer:**
```
40 40
```

**Explanation:**
- In a `const` member function, `this` is `const Session*`, so `user_` is a `const std::string` lvalue there.
- `std::move(user_)` is `const std::string&&`: the return value is copy-constructed. The session keeps its string and the "cheap hand-over" copies 40 bytes.
- Fix: make it a non-const function, ideally `&&`-qualified so it can only be called on an expiring session: `std::string release() && { return std::move(user_); }`, called as `std::move(s).release()`.
- **Key Concept:** Inside a `const` member function every member is const, so `std::move` on it copies.
