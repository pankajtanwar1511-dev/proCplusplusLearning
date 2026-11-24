## TOPIC: Copy Elision, RVO and NRVO

### PRACTICE_TASKS: Output Prediction and Bug Hunting

#### Q1
```cpp
// Q: What does this print in C++17?
#include <iostream>

struct T {
    T() { std::cout << "ctor "; }
    T(const T&) { std::cout << "copy "; }
    T(T&&) noexcept { std::cout << "move "; }
    ~T() { std::cout << "dtor "; }
};

T make() { return T(T(T())); }

int main() {
    T x = T(make());
    std::cout << '\n';
}
```

**Answer:**
```
ctor 
dtor 
```
(`dtor` is printed after the newline, when `x` is destroyed at the end of `main`.)

**Explanation:**
- Every `T(...)` wrapped around a prvalue of type `T` is itself a prvalue with the same result object, so the whole chain `T(make())` → `T(T(T()))` collapses into `x`.
- One object, one constructor, one destructor; no copy or move, and it would compile even with deleted copy/move constructors.
- In C++14 (with `-fno-elide-constructors`) the same code prints a chain of moves.
- **Key Concept:** In C++17 a prvalue initializes its result object directly; nesting does not create temporaries.

---

#### Q2
```cpp
// Q: What does this print? Which line would a code reviewer flag?
#include <iostream>
#include <utility>

struct T {
    T() { std::cout << "ctor "; }
    T(const T&) { std::cout << "copy "; }
    T(T&&) noexcept { std::cout << "move "; }
    ~T() { std::cout << "dtor "; }
};

T build() {
    T result;
    return std::move(result);   // "make sure it moves"
}

int main() {
    T t = build();
    std::cout << '\n';
}
```

**Answer:**
```
ctor move dtor 
dtor 
```
(GCC also warns: moving a local object in a return statement prevents copy elision [-Wpessimizing-move])

**Explanation:**
- `std::move(result)` is a function call expression, not the name of a local, so NRVO is not allowed: the result is move-constructed and `result` is destroyed at the end of `build`.
- `return result;` would print `ctor ` and a single `dtor` at the end (NRVO), or at worst one implicit move.
- **Key Concept:** Return locals by name; `std::move` on a returned local can only add a move.

**Fixed Version:**
```cpp
#include <iostream>

struct T {
    T() { std::cout << "ctor "; }
    T(const T&) { std::cout << "copy "; }
    T(T&&) noexcept { std::cout << "move "; }
    ~T() { std::cout << "dtor "; }
};

T build() {
    T result;
    return result;              // NRVO, else implicit move
}

int main() {
    T t = build();
    std::cout << '\n';          // prints "ctor " then "dtor " after the newline
}
```

---

#### Q3
```cpp
// Q: Does this compile with -std=c++20? Which function is the problem?
#include <mutex>

struct Account {
    std::mutex m;
    long balance = 0;
    explicit Account(long b) : balance(b) {}
};

Account open_a(long b) { return Account(b); }
Account open_b(long b) { Account a(b); return a; }

int main() {
    Account x = open_a(100);
    Account y = open_b(200);
    return static_cast<int>(x.balance + y.balance) % 2;
}
```

**Answer:**
```
Compile error in open_b: no usable constructor to initialize the return value
(GCC 11: "use of deleted function 'Account::Account(Account&&)'";
 Clang 14: "call to implicitly-deleted copy constructor of 'Account'")
```

**Explanation:**
- `std::mutex` has no copy or move constructor, so `Account`'s implicit copy constructor is defined as deleted and its defaulted move constructor is deleted too.
- A defaulted move constructor that is defined as deleted is ignored by overload resolution ([class.copy.ctor]/10), so the rvalue finds the deleted copy constructor; that is why Clang names the copy constructor and GCC the move constructor.
- `open_a` returns a prvalue: guaranteed elision in C++17, no constructor needed. It compiles.
- `open_b` returns a named local: NRVO is optional, so the program must be valid without it, and there is no usable move or copy constructor.
- **Key Concept:** Non-movable types can be returned only as prvalues.

**Fixed Version:**
```cpp
#include <iostream>
#include <mutex>

struct Account {
    std::mutex m;
    long balance = 0;
    explicit Account(long b) : balance(b) {}
};

Account open_a(long b) { return Account(b); }
Account open_b(long b) { return Account(b * 1); }   // compute, then return a prvalue

int main() {
    Account x = open_a(100);
    Account y = open_b(200);
    std::cout << x.balance + y.balance << '\n';     // 300
}
```

---

#### Q4
```cpp
// Q: Does this compile with -std=c++20? If yes, what does it print?
#include <iostream>

struct Msg {
    Msg() = default;
    Msg(const Msg&) { std::cout << "copy\n"; }
    Msg(Msg&&) = delete;        // "moving a Msg is not allowed, copy instead"
};

Msg decode(bool first) {
    Msg a, b;
    if (first) return a;
    return b;
}

int main() {
    Msg m = decode(true);
    (void)m;
}
```

**Answer:**
```
Compile error: use of deleted function 'Msg::Msg(Msg&&)' (both return statements)
```

**Explanation:**
- The returned names are treated as rvalues. Overload resolution picks the best match for an rvalue, which is the move constructor, deleted or not. Selecting a deleted function is ill-formed; there is no second attempt with the copy constructor.
- If `Msg(Msg&&)` were simply not declared, the copy constructor would be chosen and the program would print `copy`.
- Compiler note: GCC 11 with `-std=c++17` accepts this and prints `copy`; Clang rejects it in every mode, GCC rejects it in C++20.
- **Key Concept:** A deleted move constructor is not "no move constructor": it blocks return-by-name.

**Fixed Version:**
```cpp
#include <iostream>

struct Msg {
    Msg() = default;
    Msg(const Msg&) { std::cout << "copy\n"; }   // move not declared: rvalues use copy
};

Msg decode(bool first) {
    Msg a, b;
    if (first) return a;
    return b;
}

int main() {
    Msg m = decode(true);   // prints "copy"
    (void)m;
}
```

---

#### Q5
```cpp
// Q: What does this print?
#include <iostream>
#include <string>

struct Quote {
    std::string sym;
    Quote(const char* s) : sym(s) {}
    Quote(const Quote& o) : sym(o.sym) { std::cout << "copy "; }
    Quote(Quote&& o) noexcept : sym(std::move(o.sym)) { std::cout << "move "; }
};

Quote best(bool bid_side) {
    Quote bid("BID"), ask("ASK");
    return bid_side ? bid : ask;
}

int main() {
    Quote q = best(false);
    std::cout << q.sym << '\n';
}
```

**Answer:**
```
copy ASK
```

**Explanation:**
- `bid_side ? bid : ask` with two lvalues of the same type is an lvalue expression. It is not the name of a local, so neither NRVO nor implicit move applies: copy constructor.
- No warning from GCC 11 with `-Wall -Wextra`.
- `if (bid_side) return bid; return ask;` prints `move ASK` (two candidates, so no NRVO, but implicit move).
- **Key Concept:** Implicit move needs a bare name; the conditional operator hides it.

---

#### Q6
```cpp
// Q: What does this print? Copy or move for each function?
#include <iostream>
#include <utility>

struct Px {
    Px() = default;
    Px(const Px&) { std::cout << "copy "; }
    Px(Px&&) noexcept { std::cout << "move "; }
};

struct Level { Px price; int qty = 0; };

Px from_member() { Level l; return l.price; }
Px from_binding() { auto [p, q] = Level{}; (void)q; return p; }
Px from_param(Px p) { return p; }

int main() {
    Px a = from_member();
    std::cout << "| ";
    Px b = from_binding();
    std::cout << "| ";
    Px c = from_param(Px{});
    std::cout << '\n';
    (void)a; (void)b; (void)c;
}
```

**Answer:**
```
copy | copy | move 
```

**Explanation:**
- `l.price` is a member of a local, not an implicitly movable entity: copy.
- `p` is a structured binding: a name for a member of a hidden object, not a variable of its own: copy.
- `Level` is a plain aggregate here. With a tuple-like source (`std::pair`), GCC 11/13 in C++20 mode move instead, while Clang copies; do not depend on it.
- `from_param(Px{})`: the prvalue argument constructs `p` directly (no output), then the parameter is implicitly moved out. Parameters are never elided.
- Fixes for the first two: `return std::move(l.price);`, `return std::move(p);` (here `std::move` is correct, not a pessimization).
- **Key Concept:** Only whole locals and parameters named directly get implicit move.

---

#### Q7
```cpp
// Q: What does this print in C++17, and what in C++20?
#include <iostream>

struct T {
    T() = default;
    T(const T&) { std::cout << "copy\n"; }
    T(T&&) noexcept { std::cout << "move\n"; }
};

T sink(T&& x) {
    // ... validate x ...
    return x;
}

int main() {
    T t = sink(T{});
    (void)t;
}
```

**Answer:**
```
C++17: copy (GCC; Clang 14 prints move in every mode)
C++20: move
```

**Explanation:**
- Inside `sink`, `x` is an lvalue of type `T&&` (named rvalue reference, see topic 03).
- C++17 implicit move covered only local objects and by-value parameters, not rvalue-reference variables: copy.
- C++20 (P1825) added rvalue-reference variables to the implicitly movable entities: move. Verified with GCC 11 (`-std=c++17` vs `-std=c++20`).
- Clang 14 applies P1825 retroactively and prints `move` even with `-std=c++11`/`-std=c++17`; the C++17 `copy` is GCC's strict-mode behaviour.
- Portable code that targets both: `return std::move(x);` is correct here (it is a reference, so there is no NRVO to lose).
- **Key Concept:** Implicit move on return grew in C++20 to cover named rvalue references.

---

#### Q8
```cpp
// Q: What does this print?
#include <iostream>

struct Snap {
    Snap() { std::cout << "ctor "; }
    Snap(Snap&&) noexcept { std::cout << "move-ctor "; }
    Snap& operator=(Snap&&) noexcept { std::cout << "move-assign "; return *this; }
    ~Snap() { std::cout << "dtor "; }
};

Snap take_snapshot() { return Snap{}; }

int main() {
    Snap s = take_snapshot();
    std::cout << "| ";
    s = take_snapshot();
    std::cout << "| ";
}
```

**Answer:**
```
ctor | ctor move-assign dtor | dtor 
```

**Explanation:**
- First line is initialization from a prvalue: guaranteed elision, only `ctor`.
- Second line is assignment: the prvalue is materialized as a temporary to bind to `operator=(Snap&&)`, move-assigned, and destroyed at the end of the full expression.
- Final `dtor` is `s` at the end of `main`.
- **Key Concept:** Elision applies to initialization, never to assignment.

---

#### Q9
```cpp
// Q: Profiling shows a 1 MB deep copy on every call. Find the bug.
#include <cstring>
#include <iostream>

struct Frame {
    char* data;
    static inline int deep_copies = 0;
    Frame() : data(new char[1 << 20]) {}
    Frame(const Frame& o) : data(new char[1 << 20]) {
        std::memcpy(data, o.data, 1 << 20);
        ++deep_copies;
    }
    Frame& operator=(const Frame&) = delete;
    ~Frame() { delete[] data; }
};

Frame read_frame(bool even) {
    Frame a, b;
    if (even) return a;
    return b;
}

int main() {
    for (int i = 0; i < 2; ++i) {
        Frame f = read_frame(i % 2 == 0);
        (void)f;
    }
    std::cout << "deep copies: " << Frame::deep_copies << '\n';
}
```

**Answer:**
```
deep copies: 2
```
(one deep copy per call; plus the second, unused `Frame` allocates 1 MB each call)

**Explanation:**
- Two named candidates on different paths: no NRVO. Implicit move is attempted, but `Frame` has no move constructor: the user-declared copy constructor and destructor suppress it, so the rvalue binds to `const Frame&` and the copy runs.
- Two fixes, ideally both:
  - Give the type a move constructor (better: `std::unique_ptr<char[]>` member and the rule of zero, see topic 02).
  - Restructure so only one object is returned: construct only the frame you need, which also enables NRVO.
- **Key Concept:** Implicit move only helps if the type actually has a move constructor.

**Fixed Version:**
```cpp
#include <iostream>
#include <memory>

struct Frame {
    std::unique_ptr<char[]> data = std::make_unique<char[]>(1 << 20);
};                                     // rule of zero: movable, not copyable

Frame read_frame(bool even) {
    Frame f;                           // one candidate: NRVO (or a cheap move)
    f.data[0] = even ? 'E' : 'O';
    return f;
}

int main() {
    for (int i = 0; i < 2; ++i) {
        Frame f = read_frame(i % 2 == 0);
        std::cout << f.data[0];
    }
    std::cout << '\n';                 // EO
}
```

---

#### Q10
```cpp
// Q: Does this compile? If yes, what does it print?
#include <iostream>
#include <memory>

struct Strategy {
    virtual ~Strategy() = default;
    virtual const char* name() const = 0;
};
struct MarketMaker : Strategy {
    const char* name() const override { return "MarketMaker"; }
};

std::unique_ptr<Strategy> create() {
    auto s = std::make_unique<MarketMaker>();
    return s;
}

int main() {
    auto st = create();
    std::cout << st->name() << '\n';
}
```

**Answer:**
```
MarketMaker
```

**Explanation:**
- The local is `unique_ptr<MarketMaker>`, the return type `unique_ptr<Strategy>`: different types, so no NRVO.
- Implicit move still applies (CWG 1579, C++14, applied by compilers in C++11 mode too): `s` is treated as an rvalue and the converting move constructor `unique_ptr<Strategy>(unique_ptr<MarketMaker>&&)` is used.
- Without implicit move this would not compile, because `unique_ptr` cannot be copied.
- `Strategy` has a virtual destructor, so deleting through `unique_ptr<Strategy>` is correct (topic 06).
- **Key Concept:** Implicit move works through converting constructors, not just same-type returns.

---

#### Q11
```cpp
// Q: Does this compile with -std=c++20? Would it compile in C++23?
#include <iostream>

int& longest(int&& candidate) {
    return candidate;          // returns a reference to the parameter's referent
}

int main() {
    int v = 7;
    std::cout << longest(std::move(v)) << '\n';
}
```

**Answer:**
```
C++20: compiles and prints 7
C++23: compile error (Clang: non-const lvalue reference to type 'int' cannot bind to a temporary of type 'int')
```

**Explanation:**
- In C++20 the id-expression `candidate` in a return statement is an lvalue when the return type is a reference, so `int&` binds to it.
- C++23 (P2266, simpler implicit move) makes the returned name of an implicitly movable entity an **xvalue** in all cases; an `int&` cannot bind to an xvalue. Verified with Clang 14: compiles with `-std=c++20`, fails with `-std=c++2b`.
- The same change makes `int&& f(int&& x) { return x; }` valid in C++23 (error before).
- Fix that works in both: `return static_cast<int&>(candidate);`, or rethink the API: returning an lvalue reference to something the caller passed as an rvalue is usually a dangling reference waiting to happen.
- **Key Concept:** C++23 changed `return name;` into an xvalue: a source-breaking change for reference returns.

---
