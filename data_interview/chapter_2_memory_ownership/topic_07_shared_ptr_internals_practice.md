## TOPIC: std::shared_ptr Internals and make_shared

### PRACTICE_TASKS: Output Prediction and Bug Hunting

#### Q1
```cpp
// Q: What does this print?
#include <iostream>
#include <memory>

void by_value(std::shared_ptr<int> p) {
    std::cout << "by_value: " << p.use_count() << '\n';
}
void by_cref(const std::shared_ptr<int>& p) {
    std::cout << "by_cref: " << p.use_count() << '\n';
}

int main() {
    auto a = std::make_shared<int>(1);
    by_value(a);
    by_cref(a);
    by_value(std::move(a));
    std::cout << "a: " << a.use_count() << ' ' << (a == nullptr) << '\n';
}
```

**Answer:**
```
by_value: 2
by_cref: 1
by_value: 1
a: 0 1
```

**Explanation:**
- `by_value(a)` copies: `a` and the parameter both own the `int` (atomic increment, later a decrement when the parameter dies).
- `by_cref(a)` binds a reference: no new owner, no atomics.
- `by_value(std::move(a))` move-constructs the parameter: the only owner is now the parameter, so 1; the `int` is destroyed when the parameter is destroyed. Per [expr.call] it is implementation-defined whether that happens when the function returns or at the end of the caller's full-expression; the Itanium C++ ABI (GCC/Clang on Linux) destroys parameters in the caller, at the end of the full-expression. Either way it is before the next line prints.
- After the move `a` is empty: `use_count()` 0 and equal to `nullptr`.
- **Key Concept:** Copy adds an owner and costs atomics; a reference or a move does not.

---

#### Q2
```cpp
// Q: Find the bug.
#include <iostream>
#include <memory>

struct Session {
    int id;
    ~Session() { std::cout << "~Session " << id << '\n'; }
};

int main() {
    Session* raw = new Session{1};
    std::shared_ptr<Session> owner(raw);
    std::shared_ptr<Session> observer(raw);   // "share" it with the monitor
    std::cout << owner.use_count() << ' ' << observer.use_count() << '\n';
}
```

**Answer:**
```
Prints "1 1", then the Session is destroyed twice (UB).
Observed (GCC 11, glibc): "~Session 1", then "~Session <garbage>" (the second destructor reads
freed memory), then "free(): double free detected in tcache 2" and abort.
ASan stops at the second destructor: "heap-use-after-free" while reading id.
```

**Explanation:**
- Each constructor that takes a raw pointer allocates a new control block. Two blocks, each with count 1, each believing it is the only owner.
- At the end of `main`, `observer` destroys the object, then `owner` runs the destructor again on freed memory and frees it a second time.
- There is no global table mapping object addresses to control blocks; a `shared_ptr` cannot discover that another one already owns `raw`.
- **Key Concept:** A raw pointer becomes owned once; further owners must be copies of a `shared_ptr`.

**Fixed Version:**
```cpp
#include <iostream>
#include <memory>

struct Session {
    int id;
    ~Session() { std::cout << "~Session " << id << '\n'; }
};

int main() {
    auto owner = std::make_shared<Session>(Session{1});
    std::shared_ptr<Session> observer = owner;      // copy: same control block
    std::cout << owner.use_count() << ' ' << observer.use_count() << '\n';
}
```
- Prints `~Session 1` (the moved-from temporary passed to `make_shared`), then `2 2`, then `~Session 1` once for the owned object.

---

#### Q3
```cpp
// Q: Does this program have a problem? It prints the right value.
#include <iostream>
#include <memory>

struct Point { int x; int y; };

std::shared_ptr<int> y_of(Point& p) { return std::shared_ptr<int>(&p.y); }

int main() {
    Point pt{3, 4};
    {
        auto y = y_of(pt);
        std::cout << *y << '\n';
    }
    std::cout << "after scope\n";
}
```

**Answer:**
```
4 is printed, then UB: when y dies the default deleter calls delete on &pt.y, a stack address.
ASan: "attempting free on address which was not malloc()-ed".
"after scope" is never reached: glibc aborts with "free(): invalid pointer" (or "munmap_chunk(): invalid pointer").
```

**Explanation:**
- `std::shared_ptr<int>(&p.y)` adopts the pointer as if it came from `new int`. At count 0 the deleter runs `delete`, regardless of where the address points.
- If a `shared_ptr` handle to a non-heap object is truly required, use a no-op deleter and guarantee the object outlives all copies: `std::shared_ptr<int>(&p.y, [](int*) {})`.
- If `Point` itself is shared-owned, use the aliasing constructor: `std::shared_ptr<int>(pt_sp, &pt_sp->y)`.
- **Key Concept:** The default deleter assumes `new`; handing it any other address is UB at destruction time, not at construction time.

---

#### Q4
```cpp
// Q: Find the bug in the downcast.
#include <iostream>
#include <memory>

struct Msg { virtual ~Msg() = default; };
struct Trade : Msg {
    double px = 101.25;
    ~Trade() override { std::cout << "~Trade\n"; }
};

void handle(const std::shared_ptr<Msg>& m) {
    std::shared_ptr<Trade> t(static_cast<Trade*>(m.get()));
    std::cout << "px " << t->px << '\n';
}

int main() {
    std::shared_ptr<Msg> m = std::make_shared<Trade>();
    handle(m);
    std::cout << "back in main\n";
}
```

**Answer:**
```
px 101.25
~Trade                      (t's private control block deletes the object)
then UB: t's deleter calls delete on a pointer into the middle of the make_shared block.
glibc: "double free or corruption (out)" and abort.
ASan: "attempting free on address which was not malloc()-ed ... located 16 bytes inside of 32-byte region".
```

**Explanation:**
- `std::shared_ptr<Trade>(raw)` creates a second, independent control block. When `t` dies at the end of `handle`, it calls `delete` on a pointer that is in the middle of the `make_shared` allocation.
- Even with `new Trade` instead of `make_shared` it would be a double delete.
- **Key Concept:** Cast the `shared_ptr` with `std::static_pointer_cast` / `std::dynamic_pointer_cast`, which share the existing control block.

**Fixed Version:**
```cpp
#include <iostream>
#include <memory>

struct Msg { virtual ~Msg() = default; };
struct Trade : Msg {
    double px = 101.25;
    ~Trade() override { std::cout << "~Trade\n"; }
};

void handle(const std::shared_ptr<Msg>& m) {
    if (auto t = std::dynamic_pointer_cast<Trade>(m))
        std::cout << "px " << t->px << ", owners " << t.use_count() << '\n';
}

int main() {
    std::shared_ptr<Msg> m = std::make_shared<Trade>();
    handle(m);
    std::cout << "back in main\n";
}
```
- Output: `px 101.25, owners 2`, `back in main`, `~Trade`.

---

#### Q5
```cpp
// Q: What does this print?
#include <iostream>
#include <memory>
#include <vector>

int main() {
    auto a = std::make_shared<std::vector<int>>(2, 5);
    auto b = std::make_shared<std::vector<int>>(std::initializer_list<int>{2, 5});
    std::vector<int> c{2, 5};
    std::cout << a->size() << ": " << (*a)[0] << ' ' << (*a)[1] << '\n';
    std::cout << b->size() << ": " << (*b)[0] << ' ' << (*b)[1] << '\n';
    std::cout << c.size() << ": " << c[0] << ' ' << c[1] << '\n';
}
```

**Answer:**
```
2: 5 5
2: 2 5
2: 2 5
```

**Explanation:**
- `make_shared` constructs with parentheses: `std::vector<int>(2, 5)` = two elements of value 5.
- Braces are not forwarded: `std::make_shared<std::vector<int>>({2, 5})` does not even compile (a braced list has no type to deduce). Passing an explicit `std::initializer_list<int>` selects the initializer-list constructor.
- Same rule for `make_unique`, `emplace_back` and every other forwarding factory.
- **Key Concept:** Forwarding factories use `()` initialization; an initializer list must be passed as a typed object.

---

#### Q6
```cpp
// Q: Does this compile? If not, why, and how do you keep the constructor non-public?
#include <memory>

class Engine {
    Engine() = default;
public:
    static std::shared_ptr<Engine> create() { return std::make_shared<Engine>(); }
};

int main() {
    auto e = Engine::create();
}
```

**Answer:**
```
Does not compile.
error: 'constexpr Engine::Engine()' is private within this context
(reported from inside std::construct_at / the allocator, instantiated by make_shared)
```

**Explanation:**
- The constructor call happens inside the library's control-block code, not inside `Engine::create`, so the member function's access rights do not help.
- `std::shared_ptr<Engine>(new Engine)` inside `create()` compiles (the `new` expression is in the member function), at the price of two allocations.
- Passkey idiom keeps one allocation: a public constructor that requires a private token type only `Engine` can create.
- **Key Concept:** `make_shared` needs an accessible constructor.

**Fixed Version:**
```cpp
#include <iostream>
#include <memory>

class Engine {
    struct Key { explicit Key() = default; };   // only Engine can create a Key
public:
    explicit Engine(Key) {}
    static std::shared_ptr<Engine> create() { return std::make_shared<Engine>(Key{}); }
};

int main() {
    auto e = Engine::create();
    std::cout << "created, owners " << e.use_count() << '\n';
}
```
- Output: `created, owners 1`. Outside code cannot name `Engine::Key`, so it cannot call the constructor.

---

#### Q7
```cpp
// Q: Does this compile? If yes, what does it print?
#include <iostream>
#include <memory>
#include <vector>

int main() {
    auto d1 = [](int* p) { std::cout << "d1 " << *p << '\n'; delete p; };
    auto d2 = [](int* p) { std::cout << "d2 " << *p << '\n'; delete p; };

    std::vector<std::shared_ptr<int>> v;
    v.emplace_back(new int(1), d1);
    v.emplace_back(new int(2), d2);
    v.push_back(std::make_shared<int>(3));
    std::cout << sizeof(v[0]) << ' ' << sizeof(v[1]) << '\n';
}
```

**Answer:**
```
16 16
d1 1
d2 2
```

**Explanation:**
- Compiles: the deleter is not part of `std::shared_ptr<int>`'s type. It is stored (type-erased) in each control block.
- `sizeof` is the same for all elements (typical 64-bit: 16), because the handle holds only two pointers.
- The vector destroys its elements in order 0, 1, 2; element 2 uses the default deleter and prints nothing.
- The `unique_ptr` version (`std::vector<std::unique_ptr<int, decltype(d1)>>` receiving a `d2`) does not compile: each lambda has a distinct type (topic 06).
- **Key Concept:** `shared_ptr` erases the deleter type; `unique_ptr` keeps it in the type.

---

#### Q8
```cpp
// Q: Is this correct?
#include <iostream>
#include <memory>

int main() {
    std::shared_ptr<int> buf(new int[4]{1, 2, 3, 4});
    std::cout << buf.get()[2] << '\n';
}
```

**Answer:**
```
Prints 3, then UB at destruction: the default deleter calls delete, not delete[].
ASan: "alloc-dealloc-mismatch (operator new [] vs operator delete)".
```

**Explanation:**
- `std::shared_ptr<int>` assumes a single object. For trivially destructible `int` the mismatch often goes unnoticed in practice; for class types the extra destructors are skipped and the heap can be corrupted.
- C++17: `std::shared_ptr<int[]>` uses `delete[]` and adds `operator[]`. C++20: `std::make_shared<int[]>(4)` does one allocation.
- **Key Concept:** Arrays need the `T[]` form or an explicit `std::default_delete<T[]>`.

**Fixed Version:**
```cpp
#include <iostream>
#include <memory>

int main() {
    std::shared_ptr<int[]> buf(new int[4]{1, 2, 3, 4});   // C++17: delete[]
    std::cout << buf[2] << '\n';                           // 3
}
```
- C++20 also offers `auto buf2 = std::make_shared<int[]>(4);` (one allocation, zero-initialized). libstdc++ implements it from GCC 12; GCC 11 rejects it with "static assertion failed: make_shared<T[]> not supported".

---

#### Q9
```cpp
// Q: What does this print?
#include <iostream>
#include <memory>

int main() {
    int value = 7;
    std::shared_ptr<int> empty;
    std::shared_ptr<int> alias(empty, &value);

    std::cout << std::boolalpha;
    std::cout << "non-null: " << static_cast<bool>(alias) << '\n';
    std::cout << "use_count: " << alias.use_count() << '\n';
    std::cout << "value: " << *alias << '\n';
}
```

**Answer:**
```
non-null: true
use_count: 0
value: 7
```

**Explanation:**
- The aliasing constructor stores `&value` and shares `empty`'s control block, which is none.
- So `alias` is non-null (its stored pointer is set) but owns nothing: `use_count()` is 0 and nothing will ever be deleted.
- Legal, occasionally used on purpose as a "non-owning `shared_ptr`", but surprising: code that checks `if (p)` cannot tell that `p` keeps nothing alive.
- **Key Concept:** Non-null and owning are different properties; aliasing an empty `shared_ptr` gives the first without the second.

---

#### Q10
```cpp
// Q: What does this print, and in which order?
#include <iostream>
#include <memory>

struct Widget {
    ~Widget() { std::cout << "~Widget\n"; }
};

int main() {
    auto sp = std::make_shared<Widget>();
    std::weak_ptr<Widget> wp = sp;
    std::cout << "before reset\n";
    sp.reset();
    std::cout << "after reset, expired = " << wp.expired() << '\n';
    wp.reset();
    std::cout << "end\n";
}
```

**Answer:**
```
before reset
~Widget
after reset, expired = 1
end
```

**Explanation:**
- `sp.reset()` drops the strong count to 0: the destructor runs immediately, even though `wp` exists.
- The control block (and, because of `make_shared`, the storage where `Widget` lived) survives until `wp.reset()`. That frees memory but prints nothing, because no destructor is left to run.
- **Key Concept:** Strong count 0 ends the object's lifetime; weak count 0 only frees the control block (and with `make_shared`, the object's storage).

---

#### Q11
```cpp
// Q: Find the bug. The file "missing.cfg" does not exist.
#include <cstdio>
#include <iostream>
#include <memory>

std::shared_ptr<FILE> open_config(const char* path) {
    return std::shared_ptr<FILE>(std::fopen(path, "r"), [](FILE* f) {
        std::cout << "closing " << f << '\n';
        std::fclose(f);
    });
}

int main() {
    auto f = open_config("missing.cfg");
    std::cout << "opened: " << (f != nullptr) << ", owners " << f.use_count() << '\n';
}
```

**Answer:**
```
opened: 0, owners 1
closing 0
then fclose(nullptr): undefined behaviour (observed: SIGSEGV inside fclose).
Note: if stdout is a pipe, the two lines may never appear because the crash happens before the buffer is flushed.
```

**Explanation:**
- `shared_ptr(p, d)` with `p == nullptr` still allocates a control block (`use_count() == 1`) and calls `d(nullptr)` when the last owner goes away.
- `unique_ptr` never calls its deleter on null; this asymmetry surprises people porting code between the two.
- **Key Concept:** Deleters passed to `shared_ptr` must handle null, or the null case must be filtered before wrapping.

**Fixed Version:**
```cpp
#include <cstdio>
#include <iostream>
#include <memory>

std::shared_ptr<FILE> open_config(const char* path) {
    FILE* raw = std::fopen(path, "r");
    if (!raw) return nullptr;                                 // no control block at all
    return std::shared_ptr<FILE>(raw, [](FILE* f) { std::fclose(f); });
}

int main() {
    auto f = open_config("missing.cfg");
    std::cout << "opened: " << (f != nullptr) << ", owners " << f.use_count() << '\n';
}
```
- Output: `opened: 0, owners 0`.

---

#### Q12
```cpp
// Q: Is this safe? The session closes itself.
#include <iostream>
#include <memory>
#include <string>

struct Session;
std::shared_ptr<Session> g_active;

struct Session {
    std::string name = "client-1";
    void close() {
        g_active.reset();                        // drop the registry's ownership
        std::cout << "closed " << name << '\n';  // still inside a member function
    }
};

int main() {
    g_active = std::make_shared<Session>();
    g_active->close();
}
```

**Answer:**
```
UB: heap-use-after-free. g_active was the only owner, so reset() destroys the Session
while close() is still running; reading name afterwards touches freed memory.
ASan: "heap-use-after-free ... in Session::close()". Without ASan it may still print "closed client-1".
```

**Explanation:**
- `g_active->close()` uses the stored pointer; it does not create an owner for the duration of the call.
- Inside `close()`, `g_active.reset()` drops the count to 0, so `this` dangles for the rest of the function.
- Fix: keep the object alive across the call with a local owner: `auto self = g_active; self->close();`, or inside the class `auto keep = shared_from_this();` before resetting (topic 09).
- **Key Concept:** Calling through a `shared_ptr` does not pin the object; something must own it for the whole call.

**Fixed Version:**
```cpp
#include <iostream>
#include <memory>
#include <string>

struct Session;
std::shared_ptr<Session> g_active;

struct Session {
    std::string name = "client-1";
    void close() {
        g_active.reset();
        std::cout << "closed " << name << '\n';
    }
};

int main() {
    g_active = std::make_shared<Session>();
    auto self = g_active;    // local owner for the duration of the call
    self->close();           // count 2 -> 1 inside close(); object survives
}
```
- Output: `closed client-1`; the `Session` is destroyed when `self` goes out of scope.

---

#### Q13
```cpp
// Q: Does this compile?
#include <memory>

std::shared_ptr<int> make_counter() {
    return new int(0);
}

int main() {
    std::shared_ptr<int> p = new int(5);
    auto q = make_counter();
}
```

**Answer:**
```
Does not compile (both lines).
error: could not convert '(operator new(4), ...)' from 'int*' to 'std::shared_ptr<int>'
error: conversion from 'int*' to non-scalar type 'std::shared_ptr<int>' requested
```

**Explanation:**
- The raw-pointer constructor is `explicit`. Copy-initialization (`= new int(5)`, `return new int(0);`) cannot use it.
- Deliberate: an implicit conversion would let any `T*` silently become owned, for example when passing `obj.get()` to a function taking `shared_ptr<T>`, causing the two-control-block bug.
- Fix: `std::shared_ptr<int> p(new int(5));` or better `auto p = std::make_shared<int>(5);`.
- **Key Concept:** Taking ownership of a raw pointer must be spelled out; the explicit constructor prevents accidental adoption.

---

#### Q14
```cpp
// Q: What does this print?
#include <iostream>
#include <memory>

struct Parent {
    struct Child { int v = 9; } child;
    ~Parent() { std::cout << "~Parent\n"; }
};

int main() {
    std::shared_ptr<Parent::Child> c;
    {
        auto p = std::make_shared<Parent>();
        c = std::shared_ptr<Parent::Child>(p, &p->child);
        std::cout << "inner: " << p.use_count() << '\n';
    }
    std::cout << "outer: " << c->v << ' ' << c.use_count() << '\n';
    c.reset();
    std::cout << "end\n";
}
```

**Answer:**
```
inner: 2
outer: 9 1
~Parent
end
```

**Explanation:**
- The aliasing constructor shares `p`'s control block: count 2 while both exist.
- When `p` goes out of scope the count drops to 1; the `Parent` stays alive because `c` co-owns it, so `c->v` is valid.
- `c.reset()` brings the count to 0 and destroys the `Parent` (the control block knows the owned object), not a `Child`.
- **Key Concept:** An aliasing `shared_ptr` keeps the whole owner alive while pointing at a part of it.
