## TOPIC: shared_ptr and Thread Safety

### PRACTICE_TASKS: Output Prediction and Bug Hunting

#### Q1
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

#### Q2
```cpp
// Q: Eight threads copy the same global shared_ptr at the same time. Data race?
#include <iostream>
#include <memory>
#include <thread>
#include <vector>

struct Table { int rows = 3; };
std::shared_ptr<const Table> g_table = std::make_shared<const Table>();

int main() {
    std::vector<std::thread> ts;
    for (int t = 0; t < 8; ++t)
        ts.emplace_back([] {
            for (int i = 0; i < 100000; ++i) {
                auto copy = g_table;          // read-only access to g_table
                (void)copy->rows;
            }
        });
    for (auto& t : ts) t.join();
    std::cout << "use_count after join: " << g_table.use_count() << '\n';
}
```

**Answer:**
```
No data race.
use_count after join: 1
```

**Explanation:**
- Every thread only **reads** `g_table` (copying from it is a `const` operation) and increments the atomic count. Concurrent reads of one object are not a race. TSan: clean.
- `g_table` was initialized before the threads started and is not modified until after `join()`.
- The cost is not correctness but performance: 800,000 atomic increments and decrements on one cache line. Passing `const Table&` to inner code would avoid most of them.
- **Key Concept:** One handle, many readers, no writer: safe. The first concurrent writer makes it a race.

---

#### Q3
```cpp
// Q: Each thread has its own shared_ptr copy. Is the counter correct?
#include <iostream>
#include <memory>
#include <thread>

struct Stats { long fills = 0; };

int main() {
    auto p1 = std::make_shared<Stats>();
    auto p2 = p1;                                  // separate handle, same object
    std::thread a([p1] { for (int i = 0; i < 100000; ++i) ++p1->fills; });
    std::thread b([p2] { for (int i = 0; i < 100000; ++i) ++p2->fills; });
    a.join();
    b.join();
    std::cout << p1->fills << '\n';
}
```

**Answer:**
```
Data race on Stats::fills (UB). Prints a value <= 200000; at -O0 typically well below
(observed: 101249). TSan: "data race" on fills.
```

**Explanation:**
- The handles are separate, so the `shared_ptr` part is fine: lifetime is protected.
- Both threads modify the same `Stats` object without synchronization. `shared_ptr` does nothing for the object.
- With `-O2` the compiler may turn each loop into a single `+= 100000`, so it can print 200000 and hide the bug; TSan still reports it.
- **Key Concept:** Separate handles protect lifetime, not the pointee's data.

**Fixed Version:**
```cpp
#include <atomic>
#include <iostream>
#include <memory>
#include <thread>

struct Stats { std::atomic<long> fills{0}; };

int main() {
    auto p1 = std::make_shared<Stats>();
    auto p2 = p1;
    auto work = [](std::shared_ptr<Stats> p) {
        for (int i = 0; i < 100000; ++i) p->fills.fetch_add(1, std::memory_order_relaxed);
    };
    std::thread a(work, p1);
    std::thread b(work, p2);
    a.join();
    b.join();
    std::cout << p1->fills << '\n';   // 200000
}
```

---

#### Q4
```cpp
// Q: Is this safe? The worker gets a reference to the shared_ptr.
#include <chrono>
#include <iostream>
#include <memory>
#include <thread>

struct Job {
    int id = 7;
    void run() const { std::cout << "running job " << id << '\n'; }
};

int main() {
    auto job = std::make_shared<Job>();
    std::thread t([&job] {
        std::this_thread::sleep_for(std::chrono::milliseconds(10));
        job->run();
    });
    job.reset();                         // main is done with it
    t.join();
}
```

**Answer:**
```
Not safe. The lambda captured main's handle by reference, so job.reset() (main) and
job->run() (worker) access the same shared_ptr object concurrently: data race (TSan reports it).
In this timing the reset wins, job is null when run() is called: null dereference (observed: SIGSEGV).
```

**Explanation:**
- `[&job]` gives the thread a reference to main's `shared_ptr`, not an owner. Resetting it destroys the `Job` (main was the only owner) and empties the handle the worker is about to read.
- Fix: capture by value, `[job]` (copy made in main before the thread starts), or `[job = std::move(job)]` to hand over ownership.
- `std::thread t(fn, job);` already copies the argument; `std::ref(job)` would reintroduce the bug.
- **Key Concept:** Each thread needs its own `shared_ptr` copy; a reference to someone else's handle protects nothing.

**Fixed Version:**
```cpp
#include <chrono>
#include <iostream>
#include <memory>
#include <thread>

struct Job {
    int id = 7;
    void run() const { std::cout << "running job " << id << '\n'; }
};

int main() {
    auto job = std::make_shared<Job>();
    std::thread t([job] {                // own copy: count 2
        std::this_thread::sleep_for(std::chrono::milliseconds(10));
        job->run();
    });
    job.reset();                         // count 1, Job still alive
    t.join();                            // prints: running job 7
}
```

---

#### Q5
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

---

#### Q6
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

#### Q7
```cpp
// Q: Each reader checks the invariant max_distance == 5 * max_speed. Can it fail?
#include <iostream>
#include <memory>
#include <mutex>
#include <thread>
#include <vector>

struct Config { int max_speed; int max_distance; };

std::mutex m;
std::shared_ptr<const Config> g = std::make_shared<const Config>(Config{1, 5});

std::shared_ptr<const Config> snapshot() { std::lock_guard<std::mutex> lk(m); return g; }

int main() {
    std::thread writer([] {
        for (int s = 2; s < 200000; ++s) {
            auto next = std::make_shared<const Config>(Config{s, 5 * s});
            std::lock_guard<std::mutex> lk(m);
            g = std::move(next);
        }
    });
    long broken = 0;
    for (int i = 0; i < 200000; ++i) {
        int speed = snapshot()->max_speed;
        int dist = snapshot()->max_distance;     // second snapshot
        if (dist != 5 * speed) ++broken;
    }
    writer.join();
    std::cout << (broken > 0 ? "invariant broken" : "always consistent") << '\n';
}
```

**Answer:**
```
invariant broken
```

**Explanation:**
- No data race (every handle access is locked, every `Config` is immutable), yet the reader combines `max_speed` from one version with `max_distance` from a newer one.
- Each `snapshot()` call may return a different version; the invariant holds within a version, not across two.
- Same trap with `atomic<shared_ptr>`: `cfg.load()->a` and `cfg.load()->b` are two loads.
- Fix: `auto c = snapshot();` once, then read both fields through `c`.
- **Key Concept:** One snapshot per logical operation.

---

#### Q8
```cpp
// Q: Does this compile (C++20, GCC 12 or later)?
#include <atomic>
#include <iostream>
#include <memory>

struct Config { int limit = 10; };

int main() {
    std::atomic<std::shared_ptr<const Config>> cfg{std::make_shared<const Config>()};
    if (cfg->limit > 5)
        std::cout << "high\n";
}
```

**Answer:**
```
Does not compile.
error: base operand of '->' has non-pointer type 'std::atomic<std::shared_ptr<const Config> >'
```

**Explanation:**
- `std::atomic<std::shared_ptr<T>>` has no `operator->` or `operator*`: dereferencing would need a temporary owner anyway.
- `cfg.load()->limit` compiles (the temporary `shared_ptr` lives until the end of the full expression, so the access is safe).
- `std::shared_ptr<const Config> c = cfg;` also compiles: the conversion operator performs a `load()`.
- On GCC 11 even the declaration fails: "static assertion failed: std::atomic requires a trivially copyable type" (no `atomic<shared_ptr>` specialization before GCC 12).
- **Key Concept:** Getting a usable pointer out of an atomic always means taking a snapshot (`load()`), explicitly or via conversion.

**Fixed Version:**
```cpp
#include <atomic>
#include <iostream>
#include <memory>

struct Config { int limit = 10; };

int main() {
    std::atomic<std::shared_ptr<const Config>> cfg{std::make_shared<const Config>()};
    auto c = cfg.load();                 // snapshot
    if (c->limit > 5)
        std::cout << "high\n";           // prints: high
}
```

---

#### Q9
```cpp
// Q: The pointer is atomic. Is the program race-free?
#include <atomic>
#include <iostream>
#include <memory>
#include <thread>

struct Limits { int max_qty = 100; };
std::atomic<std::shared_ptr<Limits>> g_limits{std::make_shared<Limits>()};

int main() {
    std::thread admin([] {
        for (int i = 0; i < 1000; ++i)
            g_limits.load()->max_qty = 100 + i;          // "update" in place
    });
    std::thread trader([] {
        long sum = 0;
        for (int i = 0; i < 1000; ++i)
            sum += g_limits.load()->max_qty;
        std::cout << (sum > 0 ? "read ok\n" : "?\n");
    });
    admin.join();
    trader.join();
}
```

**Answer:**
```
Prints "read ok", but there is a data race on Limits::max_qty (UB).
TSan (GCC 13): "WARNING: ThreadSanitizer: data race" (write in admin, read in trader).
```

**Explanation:**
- `atomic<shared_ptr>` makes `load()` and `store()` of the handle race-free. Both threads then reach the **same** `Limits` object, and one writes `max_qty` while the other reads it.
- Fix: publish immutable objects: `std::atomic<std::shared_ptr<const Limits>>`, and let the admin build a new `Limits` and `store()` it. The `const` turns the in-place write into a compile error.
- **Key Concept:** The atomic handle protects which object you get, not what happens inside it.

---

#### Q10
```cpp
// Q: Legacy code uses std::atomic_load/std::atomic_store. Spot the bug.
#include <atomic>
#include <iostream>
#include <memory>
#include <thread>

std::shared_ptr<const int> g_px = std::make_shared<const int>(100);

int read_px() { return *std::atomic_load(&g_px); }

void publish(int v) { std::atomic_store(&g_px, std::make_shared<const int>(v)); }

void reset_on_halt() { g_px = std::make_shared<const int>(0); }   // added later

int main() {
    std::thread r([] {
        long s = 0;
        for (int i = 0; i < 100000; ++i) s += read_px();
        (void)s;
    });
    std::thread w([] { for (int i = 0; i < 1000; ++i) publish(i); reset_on_halt(); });
    r.join();
    w.join();
    std::cout << "final " << read_px() << '\n';
}
```

**Answer:**
```
Prints "final 0", but reset_on_halt() assigns g_px without std::atomic_store while the
reader uses std::atomic_load: data race (TSan reports it).
```

**Explanation:**
- The C++11 free functions work on an ordinary `shared_ptr` object and are atomic only with respect to **each other**. In libstdc++ they lock a mutex chosen by the object's address; a plain assignment takes no lock at all.
- One non-atomic access anywhere breaks the protocol, and nothing in the type system warns about it.
- Fix: `std::atomic_store(&g_px, ...)` in `reset_on_halt`, or (C++20, GCC 12+) change the type to `std::atomic<std::shared_ptr<const int>>`, which makes plain access impossible. The free functions are deprecated in C++20 and removed in C++26.
- **Key Concept:** Atomicity by convention fails on the first forgotten access; atomicity by type cannot be forgotten.

---

#### Q11
```cpp
// Q: What does this print? Why can a reader stall here?
#include <chrono>
#include <iostream>
#include <memory>
#include <mutex>
#include <thread>

using namespace std::chrono;

struct Book {
    ~Book() { std::this_thread::sleep_for(milliseconds(100)); }   // freeing a huge map
};

std::mutex m;
std::shared_ptr<const Book> g_book = std::make_shared<const Book>();

std::shared_ptr<const Book> snapshot() {
    std::lock_guard<std::mutex> lk(m);
    return g_book;
}

void replace() {
    auto fresh = std::make_shared<const Book>();
    std::lock_guard<std::mutex> lk(m);
    g_book = std::move(fresh);              // old Book destroyed right here
}

int main() {
    std::thread w(replace);
    std::this_thread::sleep_for(milliseconds(20));
    auto t0 = steady_clock::now();
    auto b = snapshot();
    auto waited = duration_cast<milliseconds>(steady_clock::now() - t0).count();
    std::cout << "reader waited " << (waited >= 50 ? ">= 50 ms" : "< 50 ms") << '\n';
    w.join();
}
```

**Answer:**
```
reader waited >= 50 ms
```

**Explanation:**
- `g_book = std::move(fresh);` drops the last reference to the old `Book` **while the mutex is held**, so its 100 ms destructor runs inside the critical section, and every reader blocks behind it.
- Timing-based demo: the 20 ms sleep lets the writer get in first; the reader waits about 80 ms.
- Fix: move the old value out under the lock and let it die after unlocking.
- **Key Concept:** Whoever drops the last reference runs the destructor, inline; never let that happen inside a lock or on a latency-critical thread.

**Fixed Version:**
```cpp
#include <chrono>
#include <iostream>
#include <memory>
#include <mutex>
#include <thread>
#include <utility>

using namespace std::chrono;

struct Book {
    ~Book() { std::this_thread::sleep_for(milliseconds(100)); }
};

std::mutex m;
std::shared_ptr<const Book> g_book = std::make_shared<const Book>();

std::shared_ptr<const Book> snapshot() {
    std::lock_guard<std::mutex> lk(m);
    return g_book;
}

void replace() {
    auto fresh = std::make_shared<const Book>();
    std::shared_ptr<const Book> old;
    {
        std::lock_guard<std::mutex> lk(m);
        old = std::exchange(g_book, std::move(fresh));
    }
}                                   // old Book destroyed here, after unlock

int main() {
    std::thread w(replace);
    std::this_thread::sleep_for(milliseconds(20));
    auto t0 = steady_clock::now();
    auto b = snapshot();
    auto waited = duration_cast<milliseconds>(steady_clock::now() - t0).count();
    std::cout << "reader waited " << (waited >= 50 ? ">= 50 ms" : "< 50 ms") << '\n';
    w.join();
}
```
- Output: `reader waited < 50 ms`. The writer thread still spends 100 ms in the destructor, but nobody waits for it.
