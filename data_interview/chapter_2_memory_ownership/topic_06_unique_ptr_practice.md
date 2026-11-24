## TOPIC: std::unique_ptr

### PRACTICE_TASKS: Output Prediction and Bug Hunting

#### Q1
```cpp
// Q: Does this compile? If not, why exactly?
#include <iostream>
#include <memory>

struct Resource {
    Resource() { std::cout << "Resource acquired\n"; }
    ~Resource() { std::cout << "Resource released\n"; }
};

int main() {
    auto p1 = std::make_unique<Resource>();
    auto p2 = p1;
    std::cout << "done\n";
}
```

**Answer:**
```
Compile error:
error: use of deleted function 'std::unique_ptr<_Tp, _Dp>::unique_ptr(const std::unique_ptr<_Tp, _Dp>&)
[with _Tp = Resource; _Dp = std::default_delete<Resource>]'
```

**Explanation:**
- `auto p2 = p1;` is copy-initialization from an lvalue, so it selects the copy constructor, which `unique_ptr` declares `= delete`.
- If it compiled, both `p1` and `p2` would delete the same `Resource`: the deleted copy turns a double delete into a compile error.
- `auto p2 = std::move(p1);` compiles: the move constructor transfers ownership and leaves `p1` null. Output then: `Resource acquired`, `done`, `Resource released` (once).
- **Key Concept:** Exclusive ownership is enforced at compile time; transfer must be spelled `std::move`.

---

#### Q2
```cpp
// Q: What does this print? When exactly is A destroyed?
#include <iostream>
#include <memory>
#include <string>

struct Noisy {
    std::string name;
    explicit Noisy(std::string n) : name(std::move(n)) {}
    ~Noisy() { std::cout << "~" << name << '\n'; }
};

int main() {
    auto a = std::make_unique<Noisy>("A");
    auto b = std::make_unique<Noisy>("B");
    std::cout << "assign\n";
    a = std::move(b);
    std::cout << "a=" << a->name << " b=" << (b ? "set" : "null") << '\n';
}
```

**Answer:**
```
assign
~A
a=B b=null
~B
```

**Explanation:**
- Move assignment is `a.reset(b.release())`: `a` takes B's pointer, then deletes the object it owned before (A), during the assignment.
- `b` is guaranteed null afterwards.
- At the end of `main`, `b` is destroyed first (empty, nothing printed), then `a` deletes B.
- **Key Concept:** Assigning to a `unique_ptr` destroys its previous object immediately; ownership is never "merged" or delayed.

---

#### Q3
```cpp
// Q: What does this print? Where is the Job destroyed?
#include <iostream>
#include <memory>

struct Job {
    int id;
    explicit Job(int i) : id(i) {}
    ~Job() { std::cout << "~Job " << id << '\n'; }
};

void consume(std::unique_ptr<Job> j) {
    std::cout << "consume " << j->id << '\n';
}

int main() {
    auto j = std::make_unique<Job>(1);
    consume(std::move(j));
    std::cout << (j ? "j still owns" : "j empty") << '\n';
    std::cout << "end\n";
}
```

**Answer:**
```
consume 1
~Job 1
j empty
end
```

**Explanation:**
- `consume` takes `unique_ptr` **by value**: the parameter is move-constructed from `j` at the call site, so ownership moves into the function.
- The parameter is destroyed when `consume` returns, deleting the Job before control is back in `main`.
- `j` is guaranteed empty after the call, whatever `consume` does with its parameter.
- **Key Concept:** By-value `unique_ptr` is a sink: the callee owns the object and decides its lifetime.

---

#### Q4
```cpp
// Q: What does this print? Compare with the by-value sink in Q3.
#include <iostream>
#include <memory>

struct Job {
    int id;
    explicit Job(int i) : id(i) {}
    ~Job() { std::cout << "~Job " << id << '\n'; }
};

std::unique_ptr<Job> stored;

void maybe_take(std::unique_ptr<Job>&& j) {
    if (j->id > 5) stored = std::move(j);
}

int main() {
    auto small = std::make_unique<Job>(1);
    auto big = std::make_unique<Job>(9);
    maybe_take(std::move(small));
    maybe_take(std::move(big));
    std::cout << "small " << (small ? "owns" : "empty") << ", big " << (big ? "owns" : "empty")
              << '\n';
}
```

**Answer:**
```
small owns, big empty
~Job 1
~Job 9
```

**Explanation:**
- An rvalue reference parameter binds to `small` without moving anything. `std::move(small)` at the call site is only a cast.
- `maybe_take` moved from `big` (id 9 > 5) but not from `small`, so `small` still owns its Job after the "move".
- Destruction order at exit: locals in reverse (`big` empty, then `small` deletes Job 1), then the global `stored` deletes Job 9.
- **Key Concept:** `unique_ptr&&` is a "maybe sink"; only a by-value parameter guarantees the caller's pointer is empty after the call.

---

#### Q5
```cpp
// Q: Which deleter calls are printed?
#include <cstdio>
#include <iostream>
#include <memory>

struct Closer {
    const char* who;
    void operator()(std::FILE* f) const {
        std::cout << who << " deleter called with " << (f ? "file" : "null") << '\n';
        if (f) std::fclose(f);
    }
};

int main() {
    {
        std::FILE* f = std::fopen("/no/such/file", "r");
        std::unique_ptr<std::FILE, Closer> u(f, Closer{"unique"});
        std::cout << "unique holds " << (u ? "file" : "null") << '\n';
    }
    {
        std::shared_ptr<std::FILE> s(std::fopen("/no/such/file", "r"), Closer{"shared"});
        std::cout << "shared holds " << (s ? "file" : "null") << '\n';
    }
}
```

**Answer:**
```
unique holds null
shared holds null
shared deleter called with null
```

**Explanation:**
- `fopen` fails and returns `nullptr` in both cases.
- `unique_ptr`'s destructor calls the deleter only if `get() != nullptr`: nothing printed.
- A `shared_ptr` constructed from a pointer and a deleter owns that pointer even if it is null; when the last owner dies, the deleter **is** called with `nullptr`. Without the `if (f)` check this would be `fclose(nullptr)`: UB.
- **Key Concept:** `unique_ptr` deleters are never called on null; `shared_ptr` deleters can be, so they must check.

---

#### Q6
```cpp
// Q: Is this well defined? What do sanitizers say?
#include <iostream>
#include <memory>

struct Sample {
    double v[4] = {};
    ~Sample() { std::cout << "~Sample\n"; }
};

int main() {
    std::unique_ptr<Sample> batch(new Sample[3]);
    batch->v[0] = 1.0;
    std::cout << "processing\n";
}
```

**Answer:**
```
Undefined behaviour: new[] released with scalar delete.
Observed (GCC 11, glibc, stdout on a terminal):
processing
~Sample
munmap_chunk(): invalid pointer      (then SIGABRT)
ASan: attempting free on address which was not malloc()-ed (bad-free).
```

**Explanation:**
- `unique_ptr<Sample>` uses `default_delete<Sample>`, which calls `delete p`. The memory came from `new Sample[3]`.
- For a type with a non-trivial destructor, `new[]` stores the element count in a cookie just before the array, and hands out an address after it. Scalar `delete` runs one destructor (only one `~Sample` line) and passes that interior address to the allocator, which is why glibc and ASan both say the pointer was never allocated.
- With a trivially destructible type (`unique_ptr<int>(new int[10])`) there is no cookie; ASan then reports `alloc-dealloc-mismatch (operator new [] vs operator delete)` and plain glibc happens to run silently. Still UB.
- Fix: `std::unique_ptr<Sample[]> batch(new Sample[3]);`, or `auto batch = std::make_unique<Sample[]>(3);` (then `batch[0].v[0] = 1.0;` and three `~Sample` lines), or simply `std::vector<Sample> batch(3);`.
- **Key Concept:** `unique_ptr<T>` and `unique_ptr<T[]>` choose `delete` vs `delete[]`; the type must match how the memory was allocated.

---

#### Q7
```cpp
// Q: Find the bug.
#include <iostream>
#include <memory>

std::unique_ptr<int> createValue(int value) {
    int x = value;
    return std::unique_ptr<int>(&x);
}

int main() {
    auto p = createValue(42);
    std::cout << "created\n";
}
```

**Answer:**
```
Undefined behaviour: the unique_ptr owns the address of a local.
Observed (GCC 11, glibc, stdout on a terminal): prints "created", then crashes when p is destroyed
(munmap_chunk(): invalid pointer / SIGABRT, or SIGSEGV).
ASan: attempting free on address which was not malloc()-ed (a stack address).
```

**Explanation:**
- `&x` points to an automatic variable that dies when `createValue` returns, so `p` dangles immediately.
- When `p` is destroyed it calls `delete` on stack memory that was never allocated with `new`: UB.
- The `unique_ptr` constructor cannot check where a pointer came from; it trusts the caller's ownership claim.
- **Key Concept:** Give `unique_ptr` only pointers it may delete; `return std::make_unique<int>(value);` makes the mistake impossible.

---

#### Q8
```cpp
// Q: Find the bug.
#include <iostream>
#include <memory>

struct Order { int id = 1; };

void archive(std::unique_ptr<Order> o) { std::cout << "archived " << o->id << '\n'; }

int main() {
    auto order = std::make_unique<Order>();
    archive(std::unique_ptr<Order>(order.get()));
    std::cout << "still have " << order->id << '\n';
}
```

**Answer:**
```
Undefined behaviour: two owners of one Order.
archive() deletes it on return; "still have" reads a deleted object (ASan: heap-use-after-free,
READ of size 4), and at the end of main `order` deletes it again (double free).
```

**Explanation:**
- `get()` returns the raw pointer without giving up ownership. Wrapping it in a second `unique_ptr` creates a second owner.
- The temporary `unique_ptr` is moved into `archive`'s parameter, which deletes the Order when `archive` returns.
- If the intent was to hand the order over, write `archive(std::move(order));` and stop using `order`. If `archive` only needs to read it, it should take `const Order&`.
- **Key Concept:** `get()` is for borrowing; ownership moves only with `std::move` or `release()`.

---

#### Q9
```cpp
// Q: The author wanted to free the buffer early. What happens instead?
#include <iostream>
#include <memory>
#include <vector>

int main() {
    auto buf = std::make_unique<std::vector<char>>(1 << 20);
    std::cout << "using " << buf->size() << " bytes\n";
    buf.release();                       // "done with it"
    std::cout << "buf is " << (buf ? "set" : "null") << '\n';
}
```

**Answer:**
```
using 1048576 bytes
buf is null
(memory leak: LeakSanitizer reports the vector and its 1 MiB buffer)
```

**Explanation:**
- `release()` only gives up ownership: it sets the stored pointer to null and returns the old pointer, which is discarded here. Nothing is deleted.
- libstdc++ 11 does not mark `release()` `[[nodiscard]]`, so `-Wall -Wextra` is silent.
- To free now: `buf.reset();` (or `buf = nullptr;`).
- **Key Concept:** `release()` transfers responsibility to the caller; `reset()` is the one that frees.

---

#### Q10
```cpp
// Q: Is this well defined?
#include <iostream>
#include <memory>

struct Conn {
    int fd = 7;
    ~Conn() { std::cout << "~Conn\n"; }
};

int main() {
    auto c = std::make_unique<Conn>();
    Conn* raw = c.get();
    c.reset(raw);                        // "refresh" the connection
    std::cout << "fd = " << c->fd << '\n';
}
```

**Answer:**
```
Undefined behaviour.
reset(raw) stores raw, then deletes the old pointer, which is the same object: c now owns a
deleted object. c->fd is a heap-use-after-free, and c's destructor deletes it a second time.
ASan: heap-use-after-free on the read of c->fd.
Without sanitizers glibc catches the second delete: "free(): double free detected in tcache 2".
```

**Explanation:**
- `reset` does not check for self-reset: step 2 stores `raw`, step 3 deletes the old pointer, which equals `raw`.
- The specified order (store first, then delete) does not make this safe: the result is still UB, whatever the allocator happens to report.
- There is no way to "refresh" an object by resetting to itself. To replace it: `c = std::make_unique<Conn>();`.
- **Key Concept:** Never pass a pointer that is already owned (by this or any other `unique_ptr`) to `reset` or a constructor.

---

#### Q11
```cpp
// Q: Does this compile?
#include <functional>
#include <iostream>
#include <memory>

int main() {
    auto data = std::make_unique<int>(5);
    auto task = [p = std::move(data)] { return *p * 2; };
    std::cout << task() << '\n';
    std::function<int()> f = std::move(task);
    std::cout << f() << '\n';
}
```

**Answer:**
```
Compile error (on the std::function line), libstdc++ 11:
error: static assertion failed: std::function target must be copy-constructible
```

**Explanation:**
- Capturing a `unique_ptr` by init-capture (C++14) is fine: the closure becomes move-only, and `task()` alone would print `10`.
- `std::function` requires its target to be **copy**-constructible, even if you never copy the `std::function`. Moving the lambda in does not help.
- Options:
  - keep the closure as `auto` (or pass it as a template parameter)
  - C++23 `std::move_only_function<int()>` (GCC 12+, not available in GCC 11)
  - capture a `std::shared_ptr` instead, if the callable really must be copyable
- **Key Concept:** Owning a `unique_ptr` makes any enclosing type move-only, including lambdas; `std::function` cannot hold move-only callables.

**Fixed Version:**
```cpp
#include <iostream>
#include <memory>
#include <utility>
#include <vector>

template <class F>
int run_twice(F& f) { return f() + f(); }    // generic: works with move-only callables

int main() {
    auto data = std::make_unique<int>(5);
    auto task = [p = std::move(data)] { return *p * 2; };
    std::cout << task() << '\n';             // 10
    std::cout << run_twice(task) << '\n';    // 20
    std::vector<decltype(task)> queue;
    queue.push_back(std::move(task));        // fine: vector only needs moves
    std::cout << queue.size() << '\n';       // 1
}
```

---

#### Q12
```cpp
// Q: compute_priority() throws. In C++17, can the Widget leak? What prints with GCC?
#include <iostream>
#include <memory>
#include <stdexcept>

struct Widget {
    static inline int live = 0;
    Widget() { ++live; std::cout << "Widget created\n"; }
    ~Widget() { --live; std::cout << "Widget destroyed\n"; }
};

int compute_priority() { throw std::runtime_error("priority failed"); }

void process(std::unique_ptr<Widget> w, int prio) { (void)w; (void)prio; }

int main() {
    try {
        process(std::unique_ptr<Widget>(new Widget), compute_priority());
    } catch (const std::exception& e) {
        std::cout << e.what() << '\n';
    }
    std::cout << "live widgets: " << Widget::live << '\n';
}
```

**Answer:**
```
priority failed
live widgets: 0
```

**Explanation:**
- Since C++17, the initialization of each parameter is completed (with all its side effects) before the next one starts; their relative order is still unspecified.
- So there are only two possible orders, and neither leaks:
  - `compute_priority()` first: it throws before `new Widget` runs (GCC on x86-64 evaluates these arguments right to left, giving the output above)
  - the `unique_ptr` parameter first: the Widget is created **and owned**, then destroyed during unwinding (`Widget created`, `Widget destroyed`)
- Before C++17, a compiler could evaluate `new Widget`, then `compute_priority()`, then construct the `unique_ptr`: the throw happened while the Widget had no owner: leak. That was the original exception-safety argument for `make_unique`.
- **Key Concept:** C++17 removed the argument-interleaving leak; `make_unique` remains preferred because it removes naked `new`.

---

#### Q13
```cpp
// Q: Does this compile?
#include <iostream>
#include <memory>

struct Engine { int rpm = 900; };

std::unique_ptr<Engine> take(std::unique_ptr<Engine> e) { return e; }

int main() {
    const auto engine = std::make_unique<Engine>();
    engine->rpm = 1200;
    auto moved = take(std::move(engine));
    std::cout << moved->rpm << '\n';
}
```

**Answer:**
```
Compile error on the take(std::move(engine)) line:
error: use of deleted function 'std::unique_ptr<_Tp, _Dp>::unique_ptr(const std::unique_ptr<_Tp, _Dp>&)
[with _Tp = Engine; _Dp = std::default_delete<Engine>]'
```

**Explanation:**
- `std::move(engine)` on a `const unique_ptr` yields `const unique_ptr&&`. The move constructor takes a non-const `unique_ptr&&`, so it is not viable; overload resolution falls back to the copy constructor, which is deleted.
- `engine->rpm = 1200;` is fine: `const` applies to the handle (cannot be reset or moved), not to the `Engine` (that would be `unique_ptr<const Engine>`).
- A `const unique_ptr` is a deliberate idiom: a scoped, non-transferable owner (like `boost::scoped_ptr`).
- **Key Concept:** `std::move` on a const object cannot move; for `unique_ptr` that becomes a compile error instead of a silent copy.

---
