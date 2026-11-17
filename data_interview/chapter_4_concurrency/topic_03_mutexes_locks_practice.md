## TOPIC: Mutexes and Lock Types

### PRACTICE_TASKS: Output Prediction and Bug Hunting

#### Q1
```cpp
// Q: Every increment is "locked". Find the bug.
#include <iostream>
#include <mutex>
#include <thread>

std::mutex mtx;
long counter = 0;

void worker() {
    for (int i = 0; i < 100000; ++i) {
        std::unique_lock<std::mutex>(mtx);
        ++counter;
    }
}

int main() {
    std::thread t1(worker), t2(worker);
    t1.join();
    t2.join();
    std::cout << counter << '\n';
}
```

**Answer:**
```
Nothing is locked: data race on counter (undefined behaviour). The output is unpredictable: with -O2 it often prints 200000 anyway (the unlocked loop is folded into one += 100000); at -O0 it printed about 100000.
```

**Explanation:**
- `std::unique_lock<std::mutex>(mtx);` is parsed as a declaration: a new default-constructed `unique_lock` named `mtx`, which shadows the global mutex inside the loop body. A default-constructed `unique_lock` owns nothing.
- GCC warns: "unnecessary parentheses in declaration of 'mtx' [-Wparentheses]". Read that warning as "this is a declaration, not a lock".
- The `lock_guard` version of the same mistake does not compile (no default constructor), which is one more reason to prefer it.
- **Key Concept:** Always give the guard a name: `std::unique_lock<std::mutex> lock(mtx);`.

**Fixed Version:**
```cpp
#include <iostream>
#include <mutex>
#include <thread>

std::mutex mtx;
long counter = 0;

void worker() {
    for (int i = 0; i < 100000; ++i) {
        std::unique_lock<std::mutex> lock(mtx);   // named: lives until end of the block
        ++counter;
    }
}

int main() {
    std::thread t1(worker), t2(worker);
    t1.join();
    t2.join();
    std::cout << counter << '\n';   // 200000
}
```

---

#### Q2
```cpp
// Q: Find the bug. Is `total` protected?
#include <iostream>
#include <mutex>
#include <thread>

std::mutex m;
long total = 0;

void add(long v) {
    std::lock_guard<std::mutex>{m};
    total += v;
}

int main() {
    std::thread a([] { for (int i = 0; i < 100000; ++i) add(1); });
    std::thread b([] { for (int i = 0; i < 100000; ++i) add(1); });
    a.join();
    b.join();
    std::cout << total << '\n';
}
```

**Answer:**
```
Not protected: data race on total (undefined behaviour). Typically prints less than 200000.
```

**Explanation:**
- `std::lock_guard<std::mutex>{m};` creates an unnamed temporary. A temporary is destroyed at the end of the full expression, the semicolon, so the mutex is locked and immediately unlocked.
- `total += v;` then runs with no lock held.
- Compilers do not warn here; code review and `-Wthread-safety` annotations (Clang) catch it.
- **Key Concept:** The lock lasts as long as the guard object; an unnamed guard lasts one statement.

**Fixed Version:**
```cpp
#include <iostream>
#include <mutex>
#include <thread>

std::mutex m;
long total = 0;

void add(long v) {
    std::lock_guard<std::mutex> lock(m);
    total += v;
}

int main() {
    std::thread a([] { for (int i = 0; i < 100000; ++i) add(1); });
    std::thread b([] { for (int i = 0; i < 100000; ++i) add(1); });
    a.join();
    b.join();
    std::cout << total << '\n';   // 200000
}
```

---

#### Q3
```cpp
// Q: Does this compile? If so, what does it print?
#include <iostream>
#include <mutex>

std::mutex m;
int value = 0;

int main() {
    std::lock_guard<std::mutex> lock(m);
    value = 42;
    lock.unlock();               // release early before printing
    std::cout << value << '\n';
}
```

**Answer:**
```
Compile error: 'class std::lock_guard<std::mutex>' has no member named 'unlock'
```

**Explanation:**
- `lock_guard` is deliberately minimal: lock in the constructor, unlock in the destructor, no other operations.
- To release early either use a nested scope `{ std::lock_guard<std::mutex> g(m); value = 42; }` or switch to `std::unique_lock`, which has `unlock()` and `lock()`.
- **Key Concept:** `lock_guard` = scope-bound ownership; `unique_lock` = controllable ownership.

**Fixed Version:**
```cpp
#include <iostream>
#include <mutex>

std::mutex m;
int value = 0;

int main() {
    std::unique_lock<std::mutex> lock(m);
    value = 42;
    int copy = value;            // read while protected
    lock.unlock();               // allowed with unique_lock
    std::cout << copy << '\n';   // 42
}
```

---

#### Q4
```cpp
// Q: What does this program print?
#include <iostream>
#include <mutex>
#include <system_error>

std::mutex m;

int main() {
    std::unique_lock<std::mutex> lk(m);
    std::cout << "owns: " << lk.owns_lock() << '\n';
    try {
        lk.lock();
    } catch (const std::system_error& e) {
        std::cout << "error: " << e.what() << '\n';
    }
    lk.unlock();
    std::cout << "owns: " << lk.owns_lock() << '\n';
    try {
        lk.unlock();
    } catch (const std::system_error& e) {
        std::cout << "error: " << e.what() << '\n';
    }
}
```

**Answer:**
```
owns: 1
error: Resource deadlock avoided
owns: 0
error: Operation not permitted
```

**Explanation:**
- `unique_lock` keeps an "owns" flag. `lock()` while owning throws `std::system_error` with `errc::resource_deadlock_would_occur`; `unlock()` while not owning throws with `errc::operation_not_permitted`.
- The exact `what()` text is the library's (shown for libstdc++); the error codes are standard.
- Calling `m.lock()` twice on the raw `std::mutex` would instead be UB (a silent hang with glibc). The wrapper protects you only because it checks its own flag.
- After `unlock()` the `unique_lock` object still exists, it just owns nothing; its destructor then does nothing.
- **Key Concept:** Object lifetime and lock ownership are separate states in `unique_lock`.

---

#### Q5
```cpp
// Q: What does this program print?
#include <iostream>
#include <mutex>
#include <stdexcept>
#include <thread>

std::mutex m;

void process() {
    m.lock();
    throw std::runtime_error("boom");
    m.unlock();
}

int main() {
    try {
        process();
    } catch (const std::exception& e) {
        std::cout << "caught: " << e.what() << '\n';
    }
    std::thread other([] {
        std::cout << std::boolalpha << "other thread acquired: " << m.try_lock() << '\n';
    });
    other.join();
    m.unlock();   // main still owns it
}
```

**Answer:**
```
caught: boom
other thread acquired: false
```

**Explanation:**
- The exception skips `m.unlock()`. Stack unwinding only runs destructors, and a raw mutex has no owner object to destroy.
- The main thread still owns `m` after catching the exception, so another thread cannot acquire it. With `lock()` instead of `try_lock()` the other thread would block forever.
- The final `m.unlock()` is legal only because `main` is the owning thread.
- Fix: `std::lock_guard<std::mutex> g(m);` in `process()`; its destructor unlocks during unwinding.
- **Key Concept:** Manual lock/unlock is not exception safe; RAII is.

**Fixed Version:**
```cpp
#include <iostream>
#include <mutex>
#include <stdexcept>
#include <thread>

std::mutex m;

void process() {
    std::lock_guard<std::mutex> g(m);   // released during stack unwinding
    throw std::runtime_error("boom");
}

int main() {
    try {
        process();
    } catch (const std::exception& e) {
        std::cout << "caught: " << e.what() << '\n';
    }
    std::thread other([] {
        bool got = m.try_lock();
        std::cout << std::boolalpha << "other thread acquired: " << got << '\n';   // true (barring a spurious failure)
        if (got) m.unlock();
    });
    other.join();
}
```

---

#### Q6
```cpp
// Q: The worker finished and was joined. What does main print? Is the program well-defined?
#include <iostream>
#include <mutex>
#include <stdexcept>
#include <thread>

std::mutex m;

void worker() {
    m.lock();
    try {
        throw std::runtime_error("bad message");
    } catch (...) {
        std::cout << "worker: handled error, returning\n";
    }
    // forgot m.unlock()
}

int main() {
    std::thread t(worker);
    t.join();
    std::cout << std::boolalpha << "main: try_lock -> " << m.try_lock() << '\n';
}
```

**Answer:**
```
worker: handled error, returning
main: try_lock -> false
Not well-defined overall: at exit the global mutex is destroyed while still locked (undefined behaviour).
```

**Explanation:**
- The worker thread terminates normally and `join()` returns: holding a lock does not keep a thread alive.
- Thread termination releases nothing. The mutex stays locked with an owner that no longer exists, so no thread can ever legally unlock it.
- If `main` had called `m.lock()` instead of `try_lock()`, it would hang forever.
- Destroying a locked `std::mutex` is UB. With glibc nothing visible happens, which is why this bug is easy to miss.
- **Key Concept:** A thread's exit does not unlock its mutexes; only RAII or an explicit unlock by the owner does.

**Fixed Version:**
```cpp
#include <iostream>
#include <mutex>
#include <stdexcept>
#include <thread>

std::mutex m;

void worker() {
    std::lock_guard<std::mutex> g(m);
    try {
        throw std::runtime_error("bad message");
    } catch (...) {
        std::cout << "worker: handled error, returning\n";
    }
}   // g unlocks here on every path

int main() {
    std::thread t(worker);
    t.join();
    bool got = m.try_lock();
    std::cout << std::boolalpha << "main: try_lock -> " << got << '\n';   // true (barring a spurious failure)
    if (got) m.unlock();
}
```

---

#### Q7
```cpp
// Q: Thread A locks, thread B unlocks. What happens?
#include <iostream>
#include <mutex>
#include <thread>

std::mutex m;

int main() {
    m.lock();                                   // main owns m
    std::thread t([] {
        m.unlock();                             // unlock from a non-owner
        std::cout << "worker: unlocked main's mutex\n";
    });
    t.join();
    std::cout << "main: try_lock -> " << m.try_lock() << '\n';
    m.unlock();
}
```

**Answer:**
```
Undefined behaviour: unlock() requires the calling thread to own the mutex.
Observed with glibc (default mutex type does not check the owner):
worker: unlocked main's mutex
main: try_lock -> 1
```

**Explanation:**
- `std::mutex` has ownership semantics. Unlocking from another thread violates the precondition of `unlock()`.
- It "works" on glibc because the default mutex type does not record or check the owner on unlock. An error-checking mutex, another platform, or a debug runtime may fail or abort. Code that relies on this is broken but passes tests.
- If you need "thread A blocks until thread B says go", that is signaling, not mutual exclusion: use `std::binary_semaphore`, a condition variable with a predicate, or an atomic flag with `wait/notify`.
- **Key Concept:** Mutexes have owners; semaphores do not.

**Fixed Version:**
```cpp
#include <iostream>
#include <semaphore>
#include <thread>

std::binary_semaphore go{0};   // no owner: any thread may release

int main() {
    std::thread t([] {
        std::cout << "worker: signalling\n";
        go.release();
    });
    go.acquire();                               // waits for the worker's signal
    std::cout << "main: got the signal\n";
    t.join();
}
```

---

#### Q8
```cpp
// Q: What does this print? What would change with std::mutex instead of std::recursive_mutex?
#include <iostream>
#include <mutex>

std::recursive_mutex rm;
int depth = 0;

void visit(int n) {
    std::lock_guard<std::recursive_mutex> g(rm);
    ++depth;
    std::cout << "enter depth " << depth << '\n';
    if (n > 0) visit(n - 1);
    --depth;
}

int main() {
    visit(2);
    std::cout << "unlocked: " << rm.try_lock() << '\n';
    rm.unlock();
}
```

**Answer:**
```
enter depth 1
enter depth 2
enter depth 3
unlocked: 1
```

**Explanation:**
- A `recursive_mutex` keeps an owner and a lock count. Each nested `lock_guard` increments the count; each destructor decrements it. The mutex is free only when the count returns to zero.
- After `visit(2)` returns all three guards are gone, so `try_lock` succeeds (by the owner thread, which is allowed for a recursive mutex).
- With `std::mutex`, the second `lock()` inside the recursion is UB; with glibc the thread blocks on itself forever after printing `enter depth 1`.
- Design note: prefer a public function that locks once and a private recursive helper that assumes the lock is held.
- **Key Concept:** Recursive mutexes count; ordinary mutexes self-deadlock.

---

#### Q9
```cpp
// Q: Can this deadlock?
#include <iostream>
#include <mutex>
#include <shared_mutex>
#include <string>
#include <unordered_map>

std::shared_mutex m;
std::unordered_map<std::string, int> table;

int get_or_create(const std::string& key) {
    std::shared_lock<std::shared_mutex> read(m);
    auto it = table.find(key);
    if (it != table.end()) return it->second;

    std::cout << "reader: key missing, upgrading\n";
    std::unique_lock<std::shared_mutex> write(m);   // "upgrade"
    return table[key] = 1;
}

int main() {
    std::cout << get_or_create("AAPL") << '\n';
}
```

**Answer:**
```
Yes, always (even single-threaded). Prints "reader: key missing, upgrading" and then hangs: undefined behaviour, self-deadlock.
```

**Explanation:**
- The exclusive lock must wait until all shared owners release. The thread itself is a shared owner and is now blocked, so it waits for itself forever.
- `std::shared_mutex` offers no upgrade. Even if it did, two readers upgrading at the same time would deadlock each other.
- Correct pattern: drop the shared lock, take the exclusive lock, re-check (another writer may have inserted the key in the gap).
- **Key Concept:** Shared to exclusive is release-then-acquire-then-recheck, never an in-place upgrade.

**Fixed Version:**
```cpp
#include <iostream>
#include <mutex>
#include <shared_mutex>
#include <string>
#include <unordered_map>

std::shared_mutex m;
std::unordered_map<std::string, int> table;

int get_or_create(const std::string& key) {
    {
        std::shared_lock<std::shared_mutex> read(m);
        auto it = table.find(key);
        if (it != table.end()) return it->second;
    }                                                   // shared lock released
    std::unique_lock<std::shared_mutex> write(m);
    auto [it, inserted] = table.try_emplace(key, 1);    // re-check under the exclusive lock
    if (inserted) std::cout << "writer: created " << key << '\n';
    return it->second;
}

int main() {
    std::cout << get_or_create("AAPL") << '\n';
}
```

---

#### Q10
```cpp
// Q: Does this compile?
#include <chrono>
#include <iostream>
#include <mutex>

std::mutex m;

int main() {
    using namespace std::chrono_literals;
    if (m.try_lock_for(10ms)) {
        std::cout << "locked\n";
        m.unlock();
    }
}
```

**Answer:**
```
Compile error: 'class std::mutex' has no member named 'try_lock_for'
```

**Explanation:**
- `std::mutex` supports only `lock`, `try_lock` and `unlock`. `try_lock` returns immediately; it never waits.
- Timed acquisition (`try_lock_for`, `try_lock_until`) exists only on `std::timed_mutex`, `std::recursive_timed_mutex` and `std::shared_timed_mutex`.
- With a `unique_lock`, the timed calls are also available on the wrapper (`lk.try_lock_for(10ms)`) when the underlying mutex is timed.
- **Key Concept:** "Try for a while" needs a timed mutex type.

**Fixed Version:**
```cpp
#include <chrono>
#include <iostream>
#include <mutex>

std::timed_mutex m;

int main() {
    using namespace std::chrono_literals;
    if (m.try_lock_for(10ms)) {
        std::cout << "locked\n";
        m.unlock();
    }
}
```

---

#### Q11
```cpp
// Q: Two consumers share the queue. The lock is released before the slow processing step. Find the bug.
#include <chrono>
#include <deque>
#include <iostream>
#include <mutex>
#include <thread>

struct Order { int id; };

std::mutex m;
std::deque<Order> orders;
int processed[100] = {};

void consume() {
    for (;;) {
        std::unique_lock<std::mutex> lk(m);
        if (orders.empty()) return;
        Order& o = orders.front();
        lk.unlock();                               // don't hold the lock during slow work
        std::this_thread::sleep_for(std::chrono::microseconds(50));
        ++processed[o.id];
        lk.lock();
        orders.pop_front();
    }
}

int main() {
    for (int i = 0; i < 100; ++i) orders.push_back({i});
    std::thread c1(consume), c2(consume);
    c1.join();
    c2.join();
    int dup = 0, missed = 0;
    for (int n : processed) { dup += n > 1; missed += n == 0; }
    std::cout << "duplicates=" << dup << " missed=" << missed << '\n';
}
```

**Answer:**
```
Undefined behaviour plus a race condition. In test runs it crashed (segmentation fault) every time.
Orders get processed twice, others never, and near the end pop_front() runs on an already-empty deque.
```

**Explanation:**
- The intent (do slow work outside the lock) is right, but the reference `o` escapes the critical section.
- Both consumers can read the same `front()` before either pops it: the same order is processed twice, and each `pop_front` then removes a different element, so another order is never processed.
- While one consumer reads `o.id`, the other can `pop_front()` and destroy that element: use-after-free.
- With one order left, both consumers see it, both unlock, and both later pop: the second `pop_front()` on an empty deque is UB (here, the crash).
- `++processed[o.id]` from two threads on the same index is also a data race.
- Fix: take ownership under the lock (copy or move the element out and pop it), then release and process the private copy.
- **Key Concept:** Releasing early is only safe if nothing you use afterwards still points into shared state.

**Fixed Version:**
```cpp
#include <chrono>
#include <deque>
#include <iostream>
#include <mutex>
#include <thread>

struct Order { int id; };

std::mutex m;
std::deque<Order> orders;
int processed[100] = {};   // each index touched by exactly one consumer now

void consume() {
    for (;;) {
        Order o;
        {
            std::lock_guard<std::mutex> lk(m);
            if (orders.empty()) return;
            o = orders.front();                    // copy out
            orders.pop_front();                    // and claim it, under the same lock
        }
        std::this_thread::sleep_for(std::chrono::microseconds(50));   // slow work, no lock
        ++processed[o.id];
    }
}

int main() {
    for (int i = 0; i < 100; ++i) orders.push_back({i});
    std::thread c1(consume), c2(consume);
    c1.join();
    c2.join();
    int dup = 0, missed = 0;
    for (int n : processed) { dup += n > 1; missed += n == 0; }
    std::cout << "duplicates=" << dup << " missed=" << missed << '\n';   // duplicates=0 missed=0
}
```

---

#### Q12
```cpp
// Q: Is this thread-safe? If it is, why might it scale badly?
#include <iostream>
#include <mutex>
#include <thread>
#include <vector>

struct Shard {
    std::mutex m;
    long count = 0;
};

Shard shards[8];

int main() {
    std::vector<std::thread> ts;
    for (int t = 0; t < 8; ++t)
        ts.emplace_back([t] {
            for (int i = 0; i < 1000000; ++i) {
                std::lock_guard<std::mutex> g(shards[t].m);   // each thread: its own shard
                ++shards[t].count;
            }
        });
    for (auto& th : ts) th.join();
    long total = 0;
    for (auto& s : shards) total += s.count;
    std::cout << "total=" << total << " sizeof(Shard)=" << sizeof(Shard) << '\n';
}
```

**Answer:**
```
total=8000000 sizeof(Shard)=48
Correct, but shards share cache lines (48-byte shards in 64-byte lines), so "independent" threads false-share and slow each other down.
```

**Explanation:**
- Correctness: each shard's counter is only touched under that shard's mutex, and `main` reads after `join()`. No data race. (`sizeof` is 48 with glibc on x86-64: a 40-byte `pthread_mutex_t` plus a `long`.)
- Performance: neighbouring shards straddle the same 64-byte line. Every lock, unlock and increment by one thread invalidates the line in the other core's cache, so the threads contend in hardware even though they never contend for a mutex.
- Fix: `struct alignas(64) Shard` (or `std::hardware_destructive_interference_size` where available). In this extreme case each thread owns its shard, so no mutex is needed at all: per-thread counters summed after `join()`.
- **Key Concept:** Lock striping needs cache-line separation, and single ownership beats any lock.

**Fixed Version:**
```cpp
#include <iostream>
#include <mutex>
#include <thread>
#include <vector>

struct alignas(64) Shard {   // one shard per cache line
    std::mutex m;
    long count = 0;
};

Shard shards[8];

int main() {
    std::vector<std::thread> ts;
    for (int t = 0; t < 8; ++t)
        ts.emplace_back([t] {
            for (int i = 0; i < 1000000; ++i) {
                std::lock_guard<std::mutex> g(shards[t].m);
                ++shards[t].count;
            }
        });
    for (auto& th : ts) th.join();
    long total = 0;
    for (auto& s : shards) total += s.count;
    std::cout << "total=" << total << " sizeof(Shard)=" << sizeof(Shard) << '\n';   // total=8000000 sizeof(Shard)=64
}
```

---

#### Q13
```cpp
// Q: Does this compile?
#include <mutex>
#include <vector>

struct Account {
    std::mutex m;
    long balance = 0;
};

int main() {
    std::vector<Account> accounts;
    accounts.push_back(Account{});
    accounts.push_back(Account{});
    return static_cast<int>(accounts.size());
}
```

**Answer:**
```
Compile error: use of deleted function 'Account::Account(Account&&)'
```

**Explanation:**
- `std::mutex` is neither copyable nor movable, so `Account`'s implicit copy and move constructors are deleted.
- `push_back` needs to move the temporary into the vector and to relocate elements when it grows.
- Options:
  - Construct in place in a container that never relocates: `std::deque<Account>` with `emplace_back()`, or `std::list`.
  - Store `std::unique_ptr<Account>` in the vector.
  - Write a copy/move constructor that locks the source and gives the new object a fresh mutex (only if copying an account makes sense).
- **Key Concept:** A mutex member makes the class non-copyable and non-movable unless you define those operations yourself.

**Fixed Version:**
```cpp
#include <deque>
#include <iostream>
#include <mutex>

struct Account {
    std::mutex m;
    long balance = 0;
};

int main() {
    std::deque<Account> accounts;   // emplace_back never moves existing elements
    accounts.emplace_back();
    accounts.emplace_back();
    std::cout << accounts.size() << '\n';   // 2
}
```

---

#### Q14
```cpp
// Q: name() locks the mutex. Is the caller's read safe?
#include <iostream>
#include <mutex>
#include <string>
#include <thread>

class Instrument {
    mutable std::mutex m_;
    std::string name_ = "initial-name-that-is-long-enough-to-allocate";
public:
    const std::string& name() const {
        std::lock_guard<std::mutex> g(m_);
        return name_;
    }
    void rename(const std::string& n) {
        std::lock_guard<std::mutex> g(m_);
        name_ = n;
    }
};

int main() {
    Instrument ins;
    std::thread writer([&] {
        for (int i = 0; i < 100000; ++i)
            ins.rename(i % 2 ? "short" : "a-much-longer-name-that-forces-a-heap-buffer");
    });
    std::size_t total = 0;
    for (int i = 0; i < 100000; ++i) total += ins.name().size();   // read outside the lock
    writer.join();
    std::cout << (total > 0) << '\n';
}
```

**Answer:**
```
Not safe: data race (undefined behaviour). The lock is released when name() returns, and the caller reads name_ through the reference while rename() may be modifying or reallocating it.
Often prints 1, but can read garbage sizes or crash.
```

**Explanation:**
- The guard protects only the time between lock and `return`. Returning a reference (or pointer, iterator, `string_view`) hands out access to the protected data with no lock held.
- `rename` can reallocate the string's buffer; the reader may then use freed memory.
- ThreadSanitizer reports this as a data race between `rename` and the caller's `size()`.
- Fix: return by value (the copy is made while the lock is held), or offer `with_name(f)` that calls `f` under the lock.
- **Key Concept:** Never let references to guarded data escape the critical section.

**Fixed Version:**
```cpp
#include <iostream>
#include <mutex>
#include <string>
#include <thread>

class Instrument {
    mutable std::mutex m_;
    std::string name_ = "initial-name-that-is-long-enough-to-allocate";
public:
    std::string name() const {                  // copy made under the lock
        std::lock_guard<std::mutex> g(m_);
        return name_;
    }
    void rename(const std::string& n) {
        std::lock_guard<std::mutex> g(m_);
        name_ = n;
    }
};

int main() {
    Instrument ins;
    std::thread writer([&] {
        for (int i = 0; i < 100000; ++i)
            ins.rename(i % 2 ? "short" : "a-much-longer-name-that-forces-a-heap-buffer");
    });
    std::size_t total = 0;
    for (int i = 0; i < 100000; ++i) total += ins.name().size();
    writer.join();
    std::cout << (total > 0) << '\n';   // 1
}
```
