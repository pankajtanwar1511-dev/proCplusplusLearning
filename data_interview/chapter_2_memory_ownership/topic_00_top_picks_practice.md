## TOPIC: Top 50: Must-Know Memory and Ownership Interview Questions

### PRACTICE_TASKS: The Must-Know Code Puzzles

#### Q1
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
- Deep dive: Topic 1, Object Lifetime and Storage Duration

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

#### Q2
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
- Deep dive: Topic 1, Object Lifetime and Storage Duration

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

#### Q3
```cpp
// Q: Does this compile?
#include <utility>

struct Buffer {
    int* p = nullptr;
    Buffer() = default;
    Buffer& operator=(Buffer&& o) noexcept {
        std::swap(p, o.p);
        return *this;
    }
};

int main() {
    Buffer a;
    Buffer b(a);
    Buffer c(std::move(a));
    (void)b; (void)c;
}
```

**Answer:**
```
Compile error (both lines):
error: use of deleted function 'constexpr Buffer::Buffer(const Buffer&)'
note: ... is implicitly declared as deleted because 'Buffer' declares a move
      constructor or move assignment operator
```

**Explanation:**
- Declaring only move assignment deletes the implicit copy constructor and copy assignment, and leaves the move constructor not declared.
- `Buffer b(a);`: the copy constructor is deleted.
- `Buffer c(std::move(a));`: there is no move constructor, so the rvalue falls back to the copy constructor, which is deleted.
- **Key Concept:** Declaring any move operation deletes both copies; it does not give you the other move.
- Deep dive: Topic 2, Special Member Functions and the Rule of 0/3/5

---

#### Q4
```cpp
// Q: What does this print? (No reserve; libstdc++ grows capacity 1, 2, 4.)
#include <iostream>
#include <string>
#include <vector>

struct Msg {
    std::string body;
    explicit Msg(std::string b) : body(std::move(b)) {}
    Msg(const Msg& o) : body(o.body) { std::cout << "copy "; }
    Msg(Msg&& o) : body(std::move(o.body)) { std::cout << "move "; }
};

int main() {
    std::vector<Msg> v;
    for (int i = 0; i < 3; ++i) {
        v.emplace_back("m" + std::to_string(i));
        std::cout << "| ";
    }
    std::cout << '\n';
}
```

**Answer:**
```
| copy | copy copy | 
```

**Explanation:**
- `emplace_back` constructs the new element in place: no copy or move for the element being added.
- Growth from capacity 1 to 2 relocates one element; from 2 to 4 relocates two.
- The move constructor is not `noexcept`, and a copy constructor exists, so `std::move_if_noexcept` chooses the **copy** to keep `emplace_back`'s strong guarantee.
- Add `noexcept` to `Msg(Msg&&)` and the output becomes `| move | move move | `.
- **Key Concept:** A move constructor that is not `noexcept` is ignored by vector reallocation whenever copying is possible.
- Deep dive: Topic 2, Special Member Functions and the Rule of 0/3/5

---

#### Q5
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
- Deep dive: Topic 3, Value Categories, std::move and Moved-From State

---

#### Q6
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
- Deep dive: Topic 3, Value Categories, std::move and Moved-From State

---

#### Q7
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
- Deep dive: Topic 4, Copy Elision, RVO and NRVO

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

#### Q8
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
- Deep dive: Topic 4, Copy Elision, RVO and NRVO

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

#### Q9
```cpp
// Q: What does this print? Which Resource leaks?
#include <iostream>
#include <memory>
#include <string>

struct Resource {
    std::string name;
    explicit Resource(std::string n) : name(std::move(n)) { std::cout << "+" << name << ' '; }
    ~Resource() { std::cout << "-" << name << ' '; }
};

void handle(bool early) {
    Resource* a = new Resource("A");
    auto b = std::make_unique<Resource>("B");
    Resource c("C");
    if (early) return;
    delete a;
}

int main() {
    handle(true);
    std::cout << "| ";
    handle(false);
    std::cout << '\n';
}
```

**Answer:**
```
+A +B +C -C -B | +A +B +C -A -C -B
```

**Explanation:**
- Early return: locals are destroyed in reverse order: `c` (prints `-C`), then `b` (its destructor deletes B, prints `-B`). The raw pointer `a` is destroyed too, but destroying a raw pointer does nothing: A leaks.
- Normal path: `delete a` runs as a statement (`-A`), then the locals are destroyed at the closing brace (`-C -B`).
- ASan/LeakSanitizer reports one leaked `Resource` from the first call.
- **Key Concept:** Scope exit destroys owners, not pointees; only objects owned by an RAII object are safe on every path.
- Deep dive: Topic 5, RAII and Exception Safety

---

#### Q10
```cpp
// Q: What does this print with GCC on Linux?
#include <iostream>
#include <stdexcept>

struct Guard {
    ~Guard() { std::cout << "~Guard" << std::endl; }
};

void work() {
    Guard g;
    std::cout << "working" << std::endl;
    throw std::runtime_error("disk full");
}

int main() {
    work();
    std::cout << "after work" << std::endl;
}
```

**Answer:**
```
working
terminate called after throwing an instance of 'std::runtime_error'
  what():  disk full
(then SIGABRT, exit status 134; ~Guard is NOT printed)
```

**Explanation:**
- No handler exists anywhere, so `std::terminate` is called.
- The standard makes stack unwinding in this case **implementation-defined**. GCC/libstdc++ does not unwind, so `~Guard` never runs.
- Adding `try { work(); } catch (const std::exception&) {}` in `main` changes the output to `working`, `~Guard`, `after work`.
- `std::endl` is used because `abort` does not flush `std::cout`; with `'\n'` and redirected output, even `working` could be lost.
- **Key Concept:** RAII cleanup during exceptions is only guaranteed when the exception is caught; put a top-level handler in `main` and in every thread function.
- Deep dive: Topic 5, RAII and Exception Safety

---

#### Q11
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
- Deep dive: Topic 6, std::unique_ptr

---

#### Q12
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
- Deep dive: Topic 6, std::unique_ptr

---

#### Q13
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
- Deep dive: Topic 7, std::shared_ptr Internals and make_shared

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

#### Q14
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
- Deep dive: Topic 7, std::shared_ptr Internals and make_shared

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

#### Q15
```cpp
// Q: The reference count is atomic. Is this program race-free?
#include <iostream>
#include <memory>
#include <thread>

struct Config { int limit = 0; };
std::shared_ptr<Config> g_cfg = std::make_shared<Config>();

int main() {
    std::thread reader([] {
        long sum = 0;
        for (int i = 0; i < 100000; ++i) {
            std::shared_ptr<Config> c = g_cfg;      // copy the global
            sum += c->limit;
        }
        std::cout << "reader done\n";
    });
    std::thread writer([] {
        for (int i = 0; i < 100000; ++i) {
            auto next = std::make_shared<Config>();
            next->limit = i;
            g_cfg = next;                           // replace the global
        }
    });
    reader.join();
    writer.join();
}
```

**Answer:**
```
Not race-free: undefined behaviour.
Observed at -O0: "pure virtual method called", "terminate called without an active exception",
abort (the reader called into a control block that the writer had already destroyed).
Other runs print "reader done" normally. ThreadSanitizer reports "data race" between the
copy (reader) and the assignment (writer) of g_cfg.
```

**Explanation:**
- Both threads touch the **same** `shared_ptr` object `g_cfg`, and the writer modifies it. The atomic count protects copies of each other, not one handle shared by two threads.
- A copy reads the two pointers and then increments the count; the writer can drop the last reference in between, so the reader may increment a freed control block.
- **Key Concept:** Concurrent read and write of one `shared_ptr` variable needs a mutex or `std::atomic<std::shared_ptr<T>>`.
- Deep dive: Topic 8, shared_ptr and Thread Safety

**Fixed Version:**
```cpp
#include <iostream>
#include <memory>
#include <mutex>
#include <thread>

struct Config { int limit = 0; };
std::mutex g_m;
std::shared_ptr<const Config> g_cfg = std::make_shared<const Config>();

std::shared_ptr<const Config> load_cfg() {
    std::lock_guard<std::mutex> lk(g_m);
    return g_cfg;                                       // copy under the lock
}

void store_cfg(std::shared_ptr<const Config> next) {
    std::lock_guard<std::mutex> lk(g_m);
    g_cfg.swap(next);                                   // old value leaves with next
}                                   // lock released first, then next dies

int main() {
    std::thread reader([] {
        long sum = 0;
        for (int i = 0; i < 100000; ++i) sum += load_cfg()->limit;
        std::cout << "reader done\n";
    });
    std::thread writer([] {
        for (int i = 0; i < 100000; ++i) {
            auto next = std::make_shared<Config>();
            next->limit = i;
            store_cfg(std::move(next));
        }
    });
    reader.join();
    writer.join();
}
```
- Output: `reader done`. TSan: clean.
- In `store_cfg`, `swap` moves the old config into the parameter `next`. The `lock_guard` is a local and is destroyed at the closing brace; the parameter is destroyed after that (when the call completes), so the old config dies outside the lock.

---

#### Q16
```cpp
// Q: The first publication is safe (write before release, read after acquire).
//    What about the second one?
#include <atomic>
#include <iostream>
#include <memory>
#include <thread>

struct Data { int value = 0; };
std::shared_ptr<Data> data;
std::atomic<bool> ready{false};

int main() {
    std::thread producer([] {
        auto d = std::make_shared<Data>();
        d->value = 42;
        data = d;
        ready.store(true, std::memory_order_release);
        auto d2 = std::make_shared<Data>();              // later: a newer version
        d2->value = 43;
        data = d2;                          // republish (flag already true)
    });
    std::thread consumer([] {
        while (!ready.load(std::memory_order_acquire)) {}
        int v = data->value;                             // 42 or 43?
        std::cout << (v == 42 || v == 43 ? "42 or 43" : "other") << '\n';
    });
    producer.join();
    consumer.join();
}
```

**Answer:**
```
Usually prints "42 or 43", but the program has a data race on `data`:
the second assignment is not ordered with the consumer's read. TSan reports "data race".
```

**Explanation:**
- First write: sequenced before the release store, so it happens-before the consumer's read. No race.
- Second write: happens after the release store; nothing orders it with the consumer's read, so a write and a read of the same `shared_ptr` object are concurrent: a race, with the same use-after-free risk as Q1.
- The write-once flag pattern is one-shot publication. For repeated updates, use `std::atomic<std::shared_ptr<T>>` or a mutex.
- **Key Concept:** Release/acquire orders the accesses it brackets; any later write to the handle is unordered again.
- Deep dive: Topic 8, shared_ptr and Thread Safety

---

#### Q17
```cpp
// Q: Every read and every write holds the mutex. Why is the final count wrong?
#include <iostream>
#include <memory>
#include <mutex>
#include <thread>
#include <vector>

struct Position { long qty = 0; };

std::mutex m;
std::shared_ptr<const Position> g_pos = std::make_shared<const Position>();

std::shared_ptr<const Position> get() { std::lock_guard<std::mutex> lk(m); return g_pos; }
void set(std::shared_ptr<const Position> p) {
    std::lock_guard<std::mutex> lk(m);
    g_pos = std::move(p);
}

void fill(long q) {
    auto cur = get();                                         // locked read
    auto next = std::make_shared<Position>(*cur);
    next->qty += q;
    set(std::move(next));                                     // locked write
}

int main() {
    std::vector<std::thread> ts;
    for (int t = 0; t < 4; ++t)
        ts.emplace_back([] { for (int i = 0; i < 10000; ++i) fill(1); });
    for (auto& t : ts) t.join();
    std::cout << get()->qty << '\n';
}
```

**Answer:**
```
Prints far less than 40000 (varies; observed 16476 and 17657). No data race (TSan clean): it is a lost update.
```

**Explanation:**
- Each access is protected, but the read-modify-write spans two critical sections. Two threads can `get()` the same version, each build `qty + 1`, and the second `set()` overwrites the first.
- Fix: do the whole read-copy-publish under one lock (writers serialize; readers still only lock for the copy), or use `atomic<shared_ptr>` with a `compare_exchange_weak` loop (theory, Example 5).
- **Key Concept:** Protecting each access is not protecting the operation; the invariant "every fill is counted" needs one atomic step.
- Deep dive: Topic 8, shared_ptr and Thread Safety

**Fixed Version:**
```cpp
#include <iostream>
#include <memory>
#include <mutex>
#include <thread>
#include <utility>
#include <vector>

struct Position { long qty = 0; };

std::mutex m;
std::shared_ptr<const Position> g_pos = std::make_shared<const Position>();

std::shared_ptr<const Position> get() { std::lock_guard<std::mutex> lk(m); return g_pos; }

void fill(long q) {
    std::shared_ptr<const Position> old;
    std::lock_guard<std::mutex> lk(m);                        // one critical section
    auto next = std::make_shared<Position>(*g_pos);
    next->qty += q;
    old = std::exchange(g_pos, std::move(next));
}

int main() {
    std::vector<std::thread> ts;
    for (int t = 0; t < 4; ++t)
        ts.emplace_back([] { for (int i = 0; i < 10000; ++i) fill(1); });
    for (auto& t : ts) t.join();
    std::cout << get()->qty << '\n';                          // 40000
}
```
- `old` is declared before the `lock_guard`, so it is destroyed after the unlock.

---

#### Q18
```cpp
// Q: The code checks expired() before using the feed. Find the bug.
#include <iostream>
#include <memory>
#include <string>

struct Feed {
    std::string name = "itch";
};

std::shared_ptr<Feed> g_feed = std::make_shared<Feed>();

void on_heartbeat() {        // stands in for "another thread or callback"
    g_feed.reset();          // releases the last owner
}

void poll(const std::weak_ptr<Feed>& w) {
    if (!w.expired()) {
        on_heartbeat();
        auto f = w.lock();
        std::cout << f->name << '\n';
    }
}

int main() {
    poll(g_feed);
}
```

**Answer:**
```
Undefined behaviour: null dereference. Typically crashes (Segmentation fault, nothing printed).
UBSan: "member access within null pointer"; ASan: "SEGV on unknown address 0x000000000008".
```

**Explanation:**
- `expired()` returned false, but the owner was released before `lock()`. `lock()` correctly returns an empty `shared_ptr`, and `f->name` dereferences null.
- Here the release is a direct call so the failure is deterministic; in real code it is another thread, and the bug appears rarely (check-then-act race).
- **Key Concept:** `lock()` is the check. Test its result instead of calling `expired()` first.
- Deep dive: Topic 9, weak_ptr, Reference Cycles and enable_shared_from_this

**Fixed Version:**
```cpp
#include <iostream>
#include <memory>
#include <string>

struct Feed {
    std::string name = "itch";
};

std::shared_ptr<Feed> g_feed = std::make_shared<Feed>();

void on_heartbeat() { g_feed.reset(); }

void poll(const std::weak_ptr<Feed>& w) {
    if (auto f = w.lock()) {      // owner from here on
        on_heartbeat();           // cannot destroy the feed under us
        std::cout << f->name << '\n';
    } else {
        std::cout << "feed gone\n";
    }
}

int main() {
    poll(g_feed);   // prints itch; the Feed is destroyed when f goes out of scope
    poll(g_feed);   // prints feed gone
}
```

---

#### Q19
```cpp
// Q: The handler captures the button by reference to avoid a cycle. Find the bug.
#include <functional>
#include <iostream>
#include <memory>
#include <string>

struct Button {
    std::string name;
    ~Button() { std::cout << "~Button\n"; }
};

int main() {
    std::function<void()> handler;
    {
        auto button = std::make_shared<Button>();
        button->name = "ok";
        handler = [&button] { std::cout << button->name << '\n'; };
    }
    handler();
}
```

**Answer:**
```
~Button, then undefined behaviour when handler() runs: it uses the destroyed local 'button'.
At -O0 it happened to print "ok" from stale memory; ASan: stack-use-after-scope.
```

**Explanation:**
- `[&button]` captures a reference to the local `shared_ptr` variable, not ownership. The variable dies at the closing brace (and with it the `Button`, which prints `~Button`).
- `handler()` then reads a dead stack object and dereferences whatever pointer it finds there.
- It does avoid the cycle, but by trading a leak for a use-after-free.
- **Key Concept:** To avoid a cycle without dangling, capture a `weak_ptr` by value and `lock()` it.
- Deep dive: Topic 9, weak_ptr, Reference Cycles and enable_shared_from_this

**Fixed Version:**
```cpp
#include <functional>
#include <iostream>
#include <memory>
#include <string>

struct Button {
    std::string name;
    ~Button() { std::cout << "~Button\n"; }
};

int main() {
    std::function<void()> handler;
    {
        auto button = std::make_shared<Button>();
        button->name = "ok";
        handler = [w = std::weak_ptr<Button>(button)] {
            if (auto b = w.lock()) std::cout << b->name << '\n';
            else std::cout << "button gone\n";
        };
        handler();          // ok
    }                       // ~Button
    handler();              // button gone
}
```

---

#### Q20
```cpp
// Q: Find the bug. What happens at run time?
#include <iostream>

struct Order {
    int id = 0;
    ~Order() { std::cout << "~Order " << id << '\n'; }
};

int main() {
    Order* batch = new Order[3];
    for (int i = 0; i < 3; ++i) batch[i].id = i;
    delete batch;
}
```

**Answer:**
```
Undefined behaviour. With GCC + glibc: "~Order 0" (one destructor), then abort with
"munmap_chunk(): invalid pointer". ASan: "attempting free on address which was not malloc()-ed".
GCC 11 also warns: 'operator delete' called on pointer with nonzero offset 8 [-Wfree-nonheap-object].
```

**Explanation:**
- `new Order[3]` stores the element count in an 8-byte cookie before the array (Itanium ABI) and returns a pointer just past it.
- Plain `delete` thinks it has one object: it runs one destructor and hands the cookie-shifted address to `operator delete`, which is not the start of any allocation.
- For a trivially destructible type (`new int[3]`) there is no cookie and it may appear to work; ASan still reports `alloc-dealloc-mismatch`.
- **Key Concept:** `new[]` pairs only with `delete[]`; better, use `std::vector` or `std::unique_ptr<T[]>`.
- Deep dive: Topic 10, new/delete, Placement New and Object Storage

**Fixed Version:**
```cpp
#include <iostream>
#include <vector>

struct Order {
    int id = 0;
    ~Order() { std::cout << "~Order " << id << '\n'; }
};

int main() {
    std::vector<Order> batch(3);
    for (int i = 0; i < 3; ++i) batch[i].id = i;
}   // ~Order 0, ~Order 1, ~Order 2 (elements destroyed in order of index in libstdc++)
```

---

#### Q21
```cpp
// Q: Built with g++ -std=c++17. Does it compile?
#include <iostream>
#include <memory>
#include <new>

struct Px {
    int v;
    explicit Px(int x) : v(x) {}
};

int main() {
    alignas(Px) unsigned char buf[sizeof(Px)];
    Px* p = new (buf) Px(1);
    std::destroy_at(p);
    Px* q = std::construct_at(reinterpret_cast<Px*>(buf), 2);
    std::cout << q->v << '\n';
    std::destroy_at(q);
}
```

**Answer:**
```
Does not compile in C++17: error: 'construct_at' is not a member of 'std'
(std::destroy_at is fine: it is C++17. With -std=c++20 it compiles and prints 2.)
```

**Explanation:**
- `std::destroy_at`, `std::destroy` and `std::destroy_n` arrived in C++17; `std::construct_at` in C++20 (it exists mainly so construction in existing storage works in `constexpr`).
- C++17 alternative: `Px* q = ::new (static_cast<void*>(buf)) Px(2);`.
- **Key Concept:** `destroy_at` is C++17, `construct_at` is C++20.
- Deep dive: Topic 10, new/delete, Placement New and Object Storage

---

#### Q22
```cpp
// Q: Does this compile?
#include <memory_resource>
#include <vector>

int main() {
    std::pmr::pool_resource pool;
    std::pmr::vector<int> v(&pool);
    v.push_back(1);
}
```

**Answer:**
```
Compile error: 'pool_resource' is not a member of 'std::pmr'
```

**Explanation:**
- There is no `std::pmr::pool_resource`. The standard pool resources are `std::pmr::unsynchronized_pool_resource` (single thread, no locking) and `std::pmr::synchronized_pool_resource` (thread-safe).
- The name appears in many tutorials and chat answers as shorthand; in an interview, name the real classes.
- **Key Concept:** Know the five standard resources: `new_delete_resource()`, `null_memory_resource()`, `monotonic_buffer_resource`, `unsynchronized_pool_resource`, `synchronized_pool_resource`.
- Deep dive: Topic 11, Memory Pools and Polymorphic Allocators (PMR)

**Fixed Version:**
```cpp
#include <iostream>
#include <memory_resource>
#include <vector>

int main() {
    std::pmr::unsynchronized_pool_resource pool;
    std::pmr::vector<int> v(&pool);
    v.push_back(1);
    std::cout << v.size() << '\n';   // 1
}
```

---

#### Q23
```cpp
// Q: The loader builds the vector in a fast arena. Find the bug.
#include <iostream>
#include <memory_resource>
#include <vector>

std::pmr::vector<int> load() {
    std::pmr::monotonic_buffer_resource arena;
    std::pmr::vector<int> v(&arena);
    for (int i = 0; i < 100; ++i) v.push_back(i);
    return v;
}

int main() {
    auto v = load();
    std::cout << v[99] << '\n';
}
```

**Answer:**
```
Undefined behaviour: v's elements live in memory owned by arena, which was destroyed when load() returned.
Here (g++ -O0) it crashed with a segmentation fault; ASan reports heap-use-after-free on v[99].
```

**Explanation:**
- `return v;` moves the vector out. A moved pmr vector keeps the source's resource, so the returned vector still points into the arena's chunks and still holds `&arena`.
- `arena` is a local: its destructor calls `release()`, returning every chunk to the heap. `v[99]` then reads freed memory, and `v`'s destructor later calls `deallocate` on a destroyed resource.
- The container never owns its resource; it stores a raw pointer.
- **Key Concept:** A pmr object must not outlive its memory resource; never return a container built on a local resource.
- Deep dive: Topic 11, Memory Pools and Polymorphic Allocators (PMR)

**Fixed Version:**
```cpp
#include <iostream>
#include <memory_resource>
#include <vector>

// The caller owns the resource and decides how long it lives
std::pmr::vector<int> load(std::pmr::memory_resource* res) {
    std::pmr::vector<int> v(res);
    for (int i = 0; i < 100; ++i) v.push_back(i);
    return v;
}

int main() {
    std::pmr::monotonic_buffer_resource arena;   // declared before v: outlives it
    auto v = load(&arena);
    std::cout << v[99] << '\n';                  // 99
}
```

---

#### Q24
```cpp
// Q: What does this print on x86-64 Linux?
#include <iostream>

struct Trade  { char side; double px; char flag; };
struct Trade2 { double px; char side; char flag; };

int main() {
    Trade t[3];
    std::cout << sizeof(Trade) << ' ' << sizeof(Trade2) << ' '
              << sizeof(t) << ' ' << alignof(Trade) << '\n';
}
```

**Answer:**
```
24 16 72 8
```

**Explanation:**
- `Trade`: `side`@0, 7 bytes padding, `px`@8, `flag`@16, 7 bytes tail padding → 24 (a multiple of the alignment 8).
- `Trade2`: `px`@0, `side`@8, `flag`@9, 6 bytes tail padding → 16.
- An array has no extra padding: `3 * 24 = 72`.
- Alignment is the strictest member's: `double` → 8.
- **Key Concept:** Ordering members by decreasing alignment removed 8 of 24 bytes (one third).
- Deep dive: Topic 12, Alignment, Padding and Data Layout

---

#### Q25
```cpp
// Q: Does this compile with GCC?
#include <cstdint>
#include <iostream>

struct __attribute__((packed)) Header {
    std::uint8_t  type;
    std::uint32_t length;
};

void bump(std::uint32_t& n) { ++n; }

int main() {
    Header h{1, 100};
    bump(h.length);
    std::cout << h.length << '\n';
}
```

**Answer:**
```
Compile error: cannot bind packed field 'h.Header::length' to 'uint32_t&' {aka 'unsigned int&'}
```

**Explanation:**
- `length` sits at offset 1. A `std::uint32_t&` promises a 4-aligned object, which a packed member cannot guarantee, so GCC refuses (taking `&h.length` only warns with `-Waddress-of-packed-member`).
- With `#pragma pack(push, 1)` instead of the attribute, GCC 11 compiled the same code silently: the danger is still there, only the diagnostic is missing.
- Compiler-specific: Clang 14 compiles this exact program (attribute version) without any diagnostic, even with `-Wall -Wextra`, and prints 101. Only GCC rejects it.
- Fix: copy out, modify, copy back: `auto n = h.length; bump(n); h.length = n;`.
- **Key Concept:** References and pointers to packed members are misaligned pointers in disguise.
- Deep dive: Topic 12, Alignment, Padding and Data Layout

**Fixed Version:**
```cpp
#include <cstdint>
#include <iostream>

struct __attribute__((packed)) Header {
    std::uint8_t  type;
    std::uint32_t length;
};

void bump(std::uint32_t& n) { ++n; }

int main() {
    Header h{1, 100};
    std::uint32_t n = h.length;   // aligned local copy
    bump(n);
    h.length = n;
    std::cout << h.length << '\n';   // 101
}
```

---
