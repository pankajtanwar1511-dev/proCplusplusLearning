## TOPIC: Object Lifetime and Storage Duration

### PRACTICE_TASKS: Output Prediction and Bug Hunting

#### Q1
```cpp
// Q: What does this print?
#include <iostream>

struct Log {
    char c;
    explicit Log(char ch) : c(ch) { std::cout << "+" << c << ' '; }
    ~Log() { std::cout << "-" << c << ' '; }
};

Log g('G');

void f() {
    static Log s('S');
    Log l('L');
}

int main() {
    std::cout << "| ";
    f();
    f();
    Log m('M');
    std::cout << "| ";
}
```

**Answer:**
```
+G | +S +L -L +L -L +M | -M -S -G 
```

**Explanation:**
- `g` is constructed before `main` (dynamic initialization of a static).
- `s` is constructed on the first call of `f` only; `l` is created and destroyed on every call.
- At the end of `main`, the automatic `m` dies first. Then statics are destroyed in reverse order of construction completion: `s` (completed later) before `g`.
- **Key Concept:** Function-local statics are constructed on first pass and destroyed after `main`, in reverse order of construction.

---

#### Q2
```cpp
// Q: Is this well-defined? What does it print?
#include <algorithm>
#include <iostream>

int main() {
    int limit = 3;
    const int& m = std::max(limit, 5);
    std::cout << m << '\n';
}
```

**Answer:**
```
Undefined behaviour: m is a dangling reference.
(A plain -O0 build happened to print 5; ASan reports stack-use-after-scope on the read.)
```

**Explanation:**
- `std::max` takes and returns `const int&`. The literal `5` is materialized as a temporary bound to the parameter, and `std::max` returns a reference to it.
- The temporary dies at the end of the full-expression (the `;`). `m` was not bound directly to a prvalue, so there is no lifetime extension.
- GCC 11 gives no warning; GCC 13 adds `-Wdangling-reference`.
- **Key Concept:** Lifetime extension never passes through a function that returns a reference.

**Fixed Version:**
```cpp
#include <algorithm>
#include <iostream>

int main() {
    int limit = 3;
    const int m = std::max(limit, 5);   // copy the value
    std::cout << m << '\n';             // 5
}
```

---

#### Q3
```cpp
// Q: Is this well-defined? What does it print?
#include <iostream>
#include <string>
#include <vector>

struct Snapshot {
    std::vector<int> bids{101, 100, 99};
    std::string venue = "XNAS";
};

Snapshot take() { return Snapshot{}; }

int main() {
    const auto& bids = take().bids;
    const std::string& v = take().venue;
    std::cout << bids.size() << ' ' << bids[0] << ' ' << v << '\n';
}
```

**Answer:**
```
3 101 XNAS
```

**Explanation:**
- Binding a reference directly to a member of a prvalue extends the lifetime of the **whole** temporary `Snapshot` to the lifetime of the reference. Two `Snapshot` temporaries live until the end of `main`.
- ASan clean.
- If `Snapshot` had a getter `const std::vector<int>& get() const`, then `const auto& bids = take().get();` would dangle: the binding would go through a function call.
- **Key Concept:** Member access on a prvalue keeps lifetime extension; a member function call does not.

---

#### Q4
```cpp
// Q: Find the bug.
#include <iostream>
#include <string>

class Order {
    const std::string& symbol_;
    int qty_;
public:
    Order(const std::string& sym, int qty) : symbol_(sym), qty_(qty) {}
    void print() const { std::cout << symbol_ << ' ' << qty_ << '\n'; }
};

int main() {
    Order o("AAPL", 100);
    o.print();
}
```

**Answer:**
```
Dangling reference member: undefined behaviour in print().
ASan: stack-use-after-scope. (A plain GCC 11 -O0 run printed "AAPL 100": the dead bytes were simply not overwritten yet.)
```

**Explanation:**
- `"AAPL"` is converted into a temporary `std::string` to bind to `const std::string& sym`. That temporary lives only until the end of the full-expression `Order o("AAPL", 100);`.
- `symbol_` keeps referring to it, so every later use reads a dead object.
- No compiler warning: the binding to the temporary happens at the call site, the storing happens in the constructor.
- **Key Concept:** A class that stores a reference must never be constructible from a temporary; store by value instead.

**Fixed Version:**
```cpp
#include <iostream>
#include <string>
#include <utility>

class Order {
    std::string symbol_;                 // own the data
    int qty_;
public:
    Order(std::string sym, int qty) : symbol_(std::move(sym)), qty_(qty) {}
    void print() const { std::cout << symbol_ << ' ' << qty_ << '\n'; }
};

int main() {
    Order o("AAPL", 100);
    o.print();                           // AAPL 100
}
```

---

#### Q5
```cpp
// Q: What does this print?
#include <iostream>

struct M {
    int id;
    explicit M(int i) : id(i) { std::cout << "M" << id << ' '; }
    ~M() { std::cout << "~M" << id << ' '; }
};

struct Base {
    M b{0};
};

struct Feed : Base {
    M second;
    M first;
    Feed() : first(1), second(2) { std::cout << "body "; }
};

int main() {
    Feed f;
    std::cout << "| ";
}
```

**Answer:**
```
M0 M2 M1 body | ~M1 ~M2 ~M0 
```

**Explanation:**
- Base class sub-object first (`M0`), then members in **declaration** order: `second` (`M2`), then `first` (`M1`). The initializer list order is ignored (GCC warns with `-Wreorder`).
- Destruction is the exact reverse: members bottom-up (`first`, `second`), then the base.
- **Key Concept:** Declaration order decides construction; destruction is its mirror image.

---

#### Q6
```cpp
// Q: Which of the three reads are well-defined?
#include <iostream>
#include <optional>
#include <string>

int main() {
    std::optional<std::string> o = std::string(40, 'x');
    std::string& ref = *o;

    std::string taken = std::move(*o);
    std::cout << "A: " << o.has_value() << '\n';       // read 1
    std::cout << "B: " << ref.size() << '\n';           // read 2

    o.reset();
    std::cout << "C: " << ref.size() << '\n';           // read 3
}
```

**Answer:**
```
Reads 1 and 2 are well-defined; read 3 is undefined behaviour.
Observed (GCC 11, libstdc++): "A: 1", "B: 0", "C: 0". Read 3 printed a plausible value and ASan
reported nothing, because the dead string object still sits inside the optional's storage.
```

**Explanation:**
- Moving out of `*o` changes the contained string's **state**; the string is still alive. `has_value()` stays `true` and `ref` is a valid reference. `ref.size()` is allowed (no precondition); its value is unspecified by the standard (libstdc++ gives 0).
- `o.reset()` runs the string's destructor: its **lifetime** ends. `ref` now refers to a dead object even though the optional's internal bytes still exist.
- ASan cannot see this: no memory was freed, only an object destroyed. This is why lifetime bugs survive testing.
- **Key Concept:** Move leaves the object alive in an unspecified state; reset (destruction) ends its lifetime.

---

#### Q7
```cpp
// Q: What does this print? Is anything undefined?
#include <functional>
#include <iostream>
#include <vector>

std::vector<std::function<int()>> handlers;

void register_handlers() {
    int base = 100;
    handlers.push_back([base] { return base + 1; });
    handlers.push_back([&base] { return base + 2; });
}

int main() {
    register_handlers();
    std::cout << handlers[0]() << '\n';
    std::cout << handlers[1]() << '\n';
}
```

**Answer:**
```
101
then UB: the second handler reads 'base' after register_handlers() returned.
(A plain GCC 11 -O0 run printed 102; ASan with detect_stack_use_after_return=1: stack-use-after-return)
```

**Explanation:**
- The first lambda captured `base` by value: the closure owns a copy, so calling it later is fine.
- The second captured a reference to the automatic `base`, which died when `register_handlers` returned. The stored closure outlives the object it refers to.
- No compiler warning in GCC 11.
- **Key Concept:** Stored callbacks must own their data (capture by value or move) or capture something with a guaranteed longer lifetime.

---

#### Q8
```cpp
// Q: Does this compile with -std=c++20?
#include <iostream>

int load_default_qty() { return 100; }
constexpr int lot_size() { return 10; }

constinit int lot = lot_size();
constinit int default_qty = load_default_qty();

int main() {
    lot = 25;
    std::cout << lot << ' ' << default_qty << '\n';
}
```

**Answer:**
```
Compile error: 'constinit' variable 'default_qty' does not have a constant initializer
(call to non-'constexpr' function 'int load_default_qty()')
```

**Explanation:**
- `constinit` requires constant initialization; `load_default_qty` is not `constexpr`, so the compiler rejects it instead of silently making it dynamic.
- `lot` is fine: `lot_size()` is `constexpr`. And `lot = 25;` compiles: `constinit` does **not** imply `const`.
- **Key Concept:** `constinit` turns "hopefully statically initialized" into a compile-time check, without making the variable immutable.

**Fixed Version:**
```cpp
#include <iostream>

constexpr int load_default_qty() { return 100; }
constexpr int lot_size() { return 10; }

constinit int lot = lot_size();
constinit int default_qty = load_default_qty();

int main() {
    lot = 25;
    std::cout << lot << ' ' << default_qty << '\n';   // 25 100
}
```

---

#### Q9
```cpp
// Q: What does this print?
#include <iostream>
#include <thread>

thread_local int orders_seen = 0;

void handle(int n) {
    for (int i = 0; i < n; ++i) ++orders_seen;
    std::cout << orders_seen << ' ';
}

int main() {
    std::thread a(handle, 3);
    a.join();
    std::thread b(handle, 5);
    b.join();
    handle(1);
    std::cout << '\n';
}
```

**Answer:**
```
3 5 1 
```

**Explanation:**
- Each thread (including the main thread) has its own `orders_seen`, starting at 0 (constant initialization, present from thread start).
- Thread `b` does not see thread `a`'s count; `main`'s call starts from its own 0.
- No data race: no two threads touch the same object.
- **Key Concept:** `thread_local` gives one independent object per thread; it is not shared state.

---

#### Q10
```cpp
// Q: Is this well-defined? What does it print?
#include <iostream>
#include <string>
#include <vector>

struct Book {
    std::vector<int> levels{100, 101, 102};
    const std::vector<int>& get() const { return levels; }
};

Book load_book() { return Book{}; }

int main() {
    long sum = 0;
    for (int px : load_book().get())
        sum += px;
    std::cout << sum << '\n';
}
```

**Answer:**
```
C++20 and earlier: undefined behaviour (dangling range). A plain GCC 11 run printed 354819955;
ASan: stack-use-after-scope.
C++23 (P2718, e.g. GCC 15): well-defined, prints 303.
```

**Explanation:**
- The loop is `auto&& __range = load_book().get();`. `__range` binds to the reference returned by `get()`, not to the `Book` temporary, so the temporary dies at the end of that declaration, before the first iteration.
- `for (int px : load_book().levels)` would be fine: direct member access extends the whole temporary.
- C++23 extends every temporary in the range-initializer until the end of the loop.
- **Key Concept:** Before C++23, range-for only extends what `__range` binds to directly.

**Fixed Version:**
```cpp
#include <iostream>
#include <vector>

struct Book {
    std::vector<int> levels{100, 101, 102};
    const std::vector<int>& get() const { return levels; }
};

Book load_book() { return Book{}; }

int main() {
    long sum = 0;
    for (auto book = load_book(); int px : book.get())   // C++20 init-statement owns it
        sum += px;
    std::cout << sum << '\n';                             // 303
}
```

---

#### Q11
```cpp
// Q: Is this well-defined? What does it print?
#include <iostream>
#include <string>
#include <string_view>

std::string_view venue_name(int code) {
    std::string name = code == 1 ? "NASDAQ Global Select Market" : "Other";
    return name;
}

int main() {
    std::string_view v = venue_name(1);
    std::cout << v << '\n';
}
```

**Answer:**
```
Undefined behaviour: v views the buffer of a destroyed std::string.
ASan: heap-use-after-free (the 27-character name is past the SSO limit, so it was heap-allocated).
```

**Explanation:**
- `return name;` converts the local `std::string` into a `string_view` of its buffer; then `name` is destroyed and frees that buffer.
- With a short name (`"Other"`, stored inline via SSO) the view points into the dead `std::string` object on the stack: still UB, but harder to catch.
- No warning from GCC 11 or GCC 13 (`-Wall -Wextra`); Clang 14 does warn (`-Wreturn-stack-address`: "address of stack memory associated with local variable 'name' returned").
- **Key Concept:** A view never extends anything; returning one requires storage that outlives the call.

**Fixed Version:**
```cpp
#include <iostream>
#include <string_view>

std::string_view venue_name(int code) {
    // string literals have static storage duration: views into them never dangle
    return code == 1 ? "NASDAQ Global Select Market" : "Other";
}

int main() {
    std::string_view v = venue_name(1);
    std::cout << v << '\n';   // NASDAQ Global Select Market
}
```

---

#### Q12
```cpp
// Q: What does this print? (Pay attention to when each object dies.)
#include <iostream>

struct T {
    int id;
    explicit T(int i) : id(i) { std::cout << "T" << id << ' '; }
    ~T() { std::cout << "~T" << id << ' '; }
};

T make(int i) { return T(i); }

int main() {
    const T& a = make(1);
    std::cout << "| ";
    make(2);
    std::cout << "| ";
    T&& b = make(3);
    std::cout << "| ";
    (void)a; (void)b;
}
```

**Answer:**
```
T1 | T2 ~T2 | T3 | ~T3 ~T1 
```

**Explanation:**
- `make(1)` is a prvalue bound directly to `const T& a`: lifetime extended to the end of `main`.
- `make(2);` is a discarded expression: the temporary is materialized and destroyed at the `;`.
- `T&& b = make(3);` also extends (rvalue references extend just like `const&`).
- At the end of `main`, extended temporaries are destroyed like locals, in reverse order: `b`'s object first, then `a`'s.
- **Key Concept:** A prvalue bound directly to a local reference lives as long as the reference; a discarded one dies at the semicolon.

---
