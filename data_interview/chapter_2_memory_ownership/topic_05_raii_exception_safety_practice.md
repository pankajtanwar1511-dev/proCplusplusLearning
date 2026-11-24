## TOPIC: RAII and Exception Safety

### PRACTICE_TASKS: Output Prediction and Bug Hunting

#### Q1
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

---

#### Q2
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

---

#### Q3
```cpp
// Q: Find the bug. What does this print?
#include <cerrno>
#include <cstdio>
#include <cstring>
#include <fcntl.h>
#include <unistd.h>

class File {
    int fd_;
public:
    explicit File(const char* path) : fd_(::open(path, O_RDONLY)) {}
    ~File() {
        int r = ::close(fd_);
        std::printf("close(%d) -> %d %s\n", fd_, r, r ? std::strerror(errno) : "ok");
    }
    int fd() const { return fd_; }
};

void inspect(File f) { std::printf("inspecting fd %d\n", f.fd()); }

int main() {
    File log("/dev/null");
    inspect(log);
    std::printf("back in main\n");
}
```

**Answer:**
```
inspecting fd 3
close(3) -> 0 ok
back in main
close(3) -> -1 Bad file descriptor
```

**Explanation:**
- `inspect` takes `File` by value; the implicit copy constructor copies the integer, creating a second owner of fd 3.
- The parameter's destructor closes fd 3 at the end of `inspect`. `log` still holds 3 and closes it again at the end of `main`: `EBADF`.
- In a real program another thread could have opened a file and received number 3 in between: the second close would silently close that file instead.
- fd numbers are typical for a fresh Linux process (0, 1, 2 are taken by stdin, stdout, stderr).
- **Key Concept:** An owning wrapper must define its copy semantics; the default copy of a handle is always a double release.

**Fixed Version:**
```cpp
#include <cstdio>
#include <fcntl.h>
#include <unistd.h>
#include <utility>

class File {
    int fd_ = -1;
public:
    explicit File(const char* path) : fd_(::open(path, O_RDONLY)) {}
    File(const File&) = delete;
    File& operator=(const File&) = delete;
    File(File&& o) noexcept : fd_(std::exchange(o.fd_, -1)) {}
    File& operator=(File&& o) noexcept {
        if (this != &o) { if (fd_ >= 0) ::close(fd_); fd_ = std::exchange(o.fd_, -1); }
        return *this;
    }
    ~File() { if (fd_ >= 0) { ::close(fd_); std::printf("closed %d\n", fd_); } }
    int fd() const { return fd_; }
};

void inspect(const File& f) { std::printf("inspecting fd %d\n", f.fd()); }   // observe only

int main() {
    File log("/dev/null");
    inspect(log);
    std::printf("back in main\n");   // then: closed 3 (once)
}
```

---

#### Q4
```cpp
// Q: The third element's constructor throws. What does this print?
#include <iostream>
#include <stdexcept>

struct Slot {
    static inline int next = 0;
    int id;
    Slot() : id(next++) {
        if (id == 2) throw std::runtime_error("slot 2 failed");
        std::cout << "+" << id << ' ';
    }
    ~Slot() { std::cout << "-" << id << ' '; }
};

struct Pool {
    Slot slots[4];
    Pool() { std::cout << "Pool ready "; }
    ~Pool() { std::cout << "~Pool "; }
};

int main() {
    try {
        Pool p;
    } catch (const std::exception& e) {
        std::cout << "| " << e.what() << '\n';
    }
}
```

**Answer:**
```
+0 +1 -1 -0 | slot 2 failed
```

**Explanation:**
- Array elements are constructed in index order. Elements 0 and 1 complete; element 2 throws before printing.
- The partially constructed array member is unwound: completed elements are destroyed in reverse order (`-1 -0`). Element 3 was never constructed.
- `Pool`'s constructor body never ran and `~Pool` is never called: the `Pool` object never started its lifetime.
- **Key Concept:** Unwinding destroys exactly what finished construction, in reverse order, down to individual array elements.

---

#### Q5
```cpp
// Q: What does this print? Which exception reaches the catch?
#include <iostream>
#include <stdexcept>

struct Logger {
    ~Logger() noexcept(false) {
        std::cout << "~Logger throwing" << std::endl;
        throw std::runtime_error("log flush failed");
    }
};

void trade() {
    Logger log;
    throw std::runtime_error("order rejected");
}

int main() {
    try {
        trade();
    } catch (const std::exception& e) {
        std::cout << "caught: " << e.what() << std::endl;
    }
}
```

**Answer:**
```
~Logger throwing
terminate called after throwing an instance of 'std::runtime_error'
  what():  log flush failed
(then SIGABRT)
```

**Explanation:**
- `"order rejected"` starts unwinding; unwinding calls `~Logger`.
- `~Logger` throws while the first exception is still propagating. Two exceptions in flight: `std::terminate`.
- `noexcept(false)` did not help: it only allows throwing when **no** unwinding is in progress.
- Neither exception is ever caught.
- **Key Concept:** A destructor that can throw turns any exception passing through its scope into program termination; release errors must be swallowed or reported via an explicit call.

---

#### Q6
```cpp
// Q: The same destructor, but no other exception is active. What does this print?
#include <iostream>
#include <stdexcept>

struct Logger {
    ~Logger() noexcept(false) {
        throw std::runtime_error("log flush failed");
    }
};

int main() {
    try {
        Logger log;
    } catch (const std::exception& e) {
        std::cout << "caught: " << e.what() << '\n';
    }
    std::cout << "still alive\n";
}
```

**Answer:**
```
caught: log flush failed
still alive
```

**Explanation:**
- With `noexcept(false)` and no exception in flight, the throw from the destructor propagates normally to the handler.
- Remove `noexcept(false)` and the program terminates instead: destructors are implicitly `noexcept`, and GCC warns "'throw' will always call 'terminate'".
- This "works", but only as long as `Logger` never dies during unwinding (Q5), never lives in a container, and is never a member of something being destroyed by an exception. That is why it is avoided.
- **Key Concept:** `noexcept(false)` destructors are legal and catchable in isolation, and still a design error.

---

#### Q7
```cpp
// Q: Find the bug. What does this print?
#include <iostream>
#include <stdexcept>

class Account {
    double balance_;
    double limit_;
public:
    Account(double b, double limit) : balance_(b), limit_(limit) {}
    void deposit(double x) {
        if (balance_ + x > limit_) throw std::runtime_error("limit exceeded");
        balance_ += x;
    }
    void transfer_to(Account& to, double x) {
        balance_ -= x;
        to.deposit(x);
    }
    double balance() const { return balance_; }
};

int main() {
    Account a(100, 1000), b(950, 1000);
    try { a.transfer_to(b, 80); }
    catch (const std::exception& e) { std::cout << e.what() << '\n'; }
    std::cout << "total = " << a.balance() + b.balance() << '\n';
}
```

**Answer:**
```
limit exceeded
total = 970
```

**Explanation:**
- `balance_ -= x` changes visible state, then `deposit` throws. No resource leaks (basic guarantee for memory), but 80 units vanished: the invariant "money is conserved" is broken.
- This is the classic "basic is not enough" case: RAII cannot help, because nothing here is a resource.
- Fix by ordering: do the step that can throw first, then the step that cannot.
- **Key Concept:** For the strong guarantee, perform every operation that can fail before any visible change, then commit with non-throwing steps.

**Fixed Version:**
```cpp
#include <iostream>
#include <stdexcept>

class Account {
    double balance_;
    double limit_;
public:
    Account(double b, double limit) : balance_(b), limit_(limit) {}
    void deposit(double x) {
        if (balance_ + x > limit_) throw std::runtime_error("limit exceeded");
        balance_ += x;
    }
    void transfer_to(Account& to, double x) {
        if (x > balance_) throw std::runtime_error("insufficient funds");
        to.deposit(x);              // may throw: nothing changed yet
        balance_ -= x;              // cannot throw: commit
    }
    double balance() const { return balance_; }
};

int main() {
    Account a(100, 1000), b(950, 1000);
    try { a.transfer_to(b, 80); }
    catch (const std::exception& e) { std::cout << e.what() << '\n'; }
    std::cout << "total = " << a.balance() + b.balance() << '\n';   // total = 1050
}
```

---

#### Q8
```cpp
// Q: The order should be rolled back if any step fails. What does this print?
#include <iostream>
#include <set>
#include <stdexcept>
#include <utility>

template <class F>
struct ScopeGuard {
    F f;
    bool active = true;
    explicit ScopeGuard(F fn) : f(std::move(fn)) {}
    ~ScopeGuard() { if (active) f(); }
    void dismiss() { active = false; }
};

std::set<int> book;

void notify(int id) { if (id == 7) throw std::runtime_error("risk check failed"); }

void place(int id) {
    book.insert(id);
    ScopeGuard undo([&] { book.erase(id); });
    undo.dismiss();
    notify(id);
}

int main() {
    place(1);
    try { place(7); } catch (const std::exception& e) { std::cout << e.what() << '\n'; }
    std::cout << "orders in book: " << book.size() << '\n';
}
```

**Answer:**
```
risk check failed
orders in book: 2
```

**Explanation:**
- `undo.dismiss()` runs before `notify`, which is the step that can fail. When `notify(7)` throws, the guard is already inactive, so order 7 stays in the book.
- The guard's position (right after `insert`) was correct; the `dismiss()` position was wrong.
- **Key Concept:** `dismiss()` marks the commit point: it must come after the last operation that can throw.

**Fixed Version:**
```cpp
#include <iostream>
#include <set>
#include <stdexcept>
#include <utility>

template <class F>
struct ScopeGuard {
    F f;
    bool active = true;
    explicit ScopeGuard(F fn) : f(std::move(fn)) {}
    ~ScopeGuard() { if (active) f(); }
    void dismiss() { active = false; }
};

std::set<int> book;

void notify(int id) { if (id == 7) throw std::runtime_error("risk check failed"); }

void place(int id) {
    book.insert(id);
    ScopeGuard undo([&] { book.erase(id); });
    notify(id);
    undo.dismiss();                  // commit: after everything that can fail
}

int main() {
    place(1);
    try { place(7); } catch (const std::exception& e) { std::cout << e.what() << '\n'; }
    std::cout << "orders in book: " << book.size() << '\n';   // orders in book: 1
}
```

---

#### Q9
```cpp
// Q: Is this code well defined? What happens?
#include <iostream>
#include <memory>

struct Config {
    int port = 8080;
    int timeout_ms = 250;
};

std::unique_ptr<Config> load() { return std::make_unique<Config>(); }

int main() {
    const int& port = load()->port;
    std::cout << port << '\n';
}
```

**Answer:**
```
Undefined behaviour: use after free.
ASan: heap-use-after-free (READ of size 4).
Without sanitizers it printed a garbage number
(glibc reuses the freed block's first bytes for its free list).
```

**Explanation:**
- `load()` returns a temporary `unique_ptr`. It lives until the end of the full expression (the `;` of the declaration), and then its destructor deletes the `Config`.
- `port` refers to a member of the deleted object. Lifetime extension does not apply: the reference binds to a member reached through `operator->`, not to the temporary itself.
- The RAII owner did exactly its job; the bug is a non-owning reference outliving the owner.
- **Key Concept:** RAII releases at the end of the owner's lifetime; a temporary owner's lifetime ends at the semicolon. Keep the owner in a named variable (`auto cfg = load();`), or copy the value (`int port = load()->port;`).

---

#### Q10
```cpp
// Q: The constructor throws inside a new-expression. Does the memory leak? What prints?
#include <cstdlib>
#include <iostream>
#include <new>
#include <stdexcept>

struct Widget {
    char data[64];
    Widget() { throw std::runtime_error("bad config"); }
    static void* operator new(std::size_t n) {
        std::cout << "allocate " << n << '\n';
        return std::malloc(n);
    }
    static void operator delete(void* p) {
        std::cout << "deallocate\n";
        std::free(p);
    }
};

int main() {
    try {
        Widget* w = new Widget;
        delete w;
    } catch (const std::exception& e) {
        std::cout << "caught: " << e.what() << '\n';
    }
}
```

**Answer:**
```
allocate 64
deallocate
caught: bad config
```

**Explanation:**
- `new Widget` is two steps: `operator new` (allocate), then the constructor. If the constructor throws, the new-expression itself calls the matching `operator delete` before the exception propagates.
- No leak (ASan clean) and no destructor call: `~Widget` would not run even if it existed.
- The leak risk is different: resources acquired **inside** the constructor before the throw (see theory section 5).
- The class-specific `operator new`/`delete` here are only for tracing; the same happens with the global ones. Overloading allocation functions: topic 10.
- **Key Concept:** A failed constructor in a new-expression frees its storage automatically; what can leak is what the constructor itself acquired.

---

#### Q11
```cpp
// Q: What does this print? (Source of a classic production hang.)
#include <iostream>
#include <mutex>
#include <stdexcept>
#include <thread>

std::mutex m;

void doSomething() { throw std::runtime_error("parse error"); }

void process() {
    m.lock();
    doSomething();
    m.unlock();
}

int main() {
    try { process(); } catch (const std::exception& e) { std::cout << e.what() << '\n'; }
    std::thread other([] {
        bool got = m.try_lock();
        std::cout << "other thread got the lock: " << got << '\n';
        if (got) m.unlock();
    });
    other.join();
    m.unlock();   // main still owns it; release before exit
}
```

**Answer:**
```
parse error
other thread got the lock: 0
```

**Explanation:**
- `doSomething()` throws, `m.unlock()` is skipped, and the exception is caught in `main`. The main thread still owns `m`.
- The other thread's `try_lock` fails. With `lock()` instead it would block forever: the program hangs, with no crash and no error message.
- (`try_lock` can also fail spuriously, but here the mutex really is held.)
- The test uses another thread on purpose: relocking a `std::mutex` from the thread that owns it is UB.
- Fix: `std::lock_guard<std::mutex> lock(m);` in `process()`. During unwinding its destructor unlocks `m`; the other thread prints 1.
- **Key Concept:** Manual `lock()`/`unlock()` around code that can throw is a latent permanent lock; ownership must be an RAII object.

**Fixed Version:**
```cpp
#include <iostream>
#include <mutex>
#include <stdexcept>
#include <thread>

std::mutex m;

void doSomething() { throw std::runtime_error("parse error"); }

void process() {
    std::lock_guard<std::mutex> lock(m);    // unlocked during unwinding
    doSomething();
}

int main() {
    try { process(); } catch (const std::exception& e) { std::cout << e.what() << '\n'; }
    std::thread other([] {
        bool got = m.try_lock();
        std::cout << "other thread got the lock: " << got << '\n';   // 1
        if (got) m.unlock();
    });
    other.join();
}
```

---
