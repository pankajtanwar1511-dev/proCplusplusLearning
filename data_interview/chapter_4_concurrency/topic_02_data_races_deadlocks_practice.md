## TOPIC: Data Races, Race Conditions and Deadlocks

### PRACTICE_TASKS: Output Prediction and Bug Hunting

#### Q1
```cpp
// Q: What does this program print?
#include <iostream>
#include <thread>

int counter = 0;

void worker() {
    for (int i = 0; i < 100000; ++i)
        ++counter;
}

int main() {
    std::thread t1(worker);
    std::thread t2(worker);
    t1.join();
    t2.join();
    std::cout << counter << '\n';
}
```

**Answer:**
```
Undefined behaviour (data race on counter). No output is guaranteed.
In practice: often a value below 200000; with -O2 it may print exactly 200000 because each loop is folded into one += 100000.
```

**Explanation:**
- Both threads read and write `counter`, it is not atomic, and nothing orders the accesses: textbook data race.
- The "between 100000 and 200000" answer comes from imagining lost updates on real hardware. The C++ standard promises no range at all.
- The `join()` calls come after the race; they make `main`'s read safe with respect to each worker, not the workers with respect to each other.
- Printing 200000 does not mean the code is correct: the optimizer just hid the bug.
- **Key Concept:** A data race is undefined behaviour, not "a slightly wrong number".

**Fixed Version:**
```cpp
// Fixed: atomic increment (relaxed is enough for a pure counter)
#include <atomic>
#include <iostream>
#include <thread>

std::atomic<int> counter{0};

void worker() {
    for (int i = 0; i < 100000; ++i)
        counter.fetch_add(1, std::memory_order_relaxed);
}

int main() {
    std::thread t1(worker);
    std::thread t2(worker);
    t1.join();
    t2.join();
    std::cout << counter << '\n';   // always 200000
}
```

---

#### Q2
```cpp
// Q: The author expects 200000. Find the bug. What is actually printed?
#include <iostream>
#include <mutex>
#include <thread>

int counter = 0;
std::mutex mtx;

void worker() {
    for (int i = 0; i < 100000; ++i)
        std::lock_guard<std::mutex> lock(mtx);
        ++counter;
}

int main() {
    std::thread t1(worker);
    std::thread t2(worker);
    t1.join();
    t2.join();
    std::cout << counter << '\n';
}
```

**Answer:**
```
Data race (undefined behaviour). In practice it prints 2, not 200000.
```

**Explanation:**
- Without braces, the loop body is only the declaration `std::lock_guard<std::mutex> lock(mtx);`. The guard locks and immediately unlocks 100000 times, protecting nothing.
- `++counter` runs once per thread, after the loop, with no lock held. The two increments race.
- GCC warns with `-Wall`: "this 'for' clause does not guard... [-Wmisleading-indentation]". Treat warnings as errors in concurrent code.
- **Key Concept:** A lock protects exactly the scope of the guard object; check where that scope ends.

**Fixed Version:**
```cpp
#include <iostream>
#include <mutex>
#include <thread>

int counter = 0;
std::mutex mtx;

void worker() {
    for (int i = 0; i < 100000; ++i) {
        std::lock_guard<std::mutex> lock(mtx);
        ++counter;
    }
}

int main() {
    std::thread t1(worker);
    std::thread t2(worker);
    t1.join();
    t2.join();
    std::cout << counter << '\n';   // 200000
}
```

---

#### Q3
```cpp
// Q: Is there a data race? What can this program print?
#include <iostream>
#include <mutex>
#include <thread>

int x = 0;
std::mutex m;

int main() {
    std::thread t1([] { std::lock_guard<std::mutex> g(m); x = 10; });
    std::thread t2([] { std::lock_guard<std::mutex> g(m); x = 20; });
    t1.join();
    t2.join();
    std::cout << x << '\n';
}
```

**Answer:**
```
No data race. Prints either 10 or 20.
```

**Explanation:**
- Both writes happen inside critical sections of the same mutex, so one happens before the other: no data race.
- Which thread acquires `m` first is decided by the scheduler. Creating `t1` first does not mean it locks first.
- The read in `main` is safe because both threads were joined.
- If the requirement were "20 must win", this would be a race condition without a data race.
- **Key Concept:** Data-race-free does not mean deterministic; a mutex gives exclusion, not order.

---

#### Q4
```cpp
// Q: What does this print, and when? (built with g++ -O2)
#include <chrono>
#include <iostream>
#include <thread>

bool ready = false;

int main() {
    std::thread t([] {
        while (!ready) { }
        std::cout << "worker: saw ready\n";
    });
    std::this_thread::sleep_for(std::chrono::milliseconds(100));
    ready = true;
    std::cout << "main: set ready\n";
    t.join();
}
```

**Answer:**
```
Undefined behaviour (data race on ready). Observed with GCC 11 -O2:
worker: saw ready
main: set ready
The worker prints immediately, before main sets the flag. Other compilers or flags may instead hang forever.
```

**Explanation:**
- The compiler may assume no other thread modifies a non-atomic `bool`. The loop reads `ready` and has no side effects.
- If `ready` is false, the loop would spin forever without side effects, which is UB under the forward-progress rules. GCC therefore removes the loop entirely: the worker never waits.
- Another legal compilation reads `ready` once into a register and spins forever.
- Neither outcome is "it just sees the update a bit later".
- **Key Concept:** Racy flags can be hoisted out of loops or delete the loop; use `std::atomic<bool>`.

**Fixed Version:**
```cpp
#include <atomic>
#include <chrono>
#include <iostream>
#include <thread>

std::atomic<bool> ready{false};

int main() {
    std::thread t([] {
        while (!ready.load(std::memory_order_acquire)) { }
        std::cout << "worker: saw ready\n";
    });
    std::this_thread::sleep_for(std::chrono::milliseconds(100));
    std::cout << "main: set ready\n";
    ready.store(true, std::memory_order_release);
    t.join();
}
```

---

#### Q5
```cpp
// Q: Each function locks a mutex. Is `balance` protected?
#include <iostream>
#include <mutex>
#include <thread>

long balance = 0;
std::mutex deposit_mutex;
std::mutex withdraw_mutex;

void deposit(long v) {
    std::lock_guard<std::mutex> g(deposit_mutex);
    balance += v;
}

void withdraw(long v) {
    std::lock_guard<std::mutex> g(withdraw_mutex);
    balance -= v;
}

int main() {
    std::thread a([] { for (int i = 0; i < 100000; ++i) deposit(1); });
    std::thread b([] { for (int i = 0; i < 100000; ++i) withdraw(1); });
    a.join();
    b.join();
    std::cout << balance << '\n';
}
```

**Answer:**
```
No. Data race on balance (undefined behaviour). Expected 0, but any value may appear.
```

**Explanation:**
- A mutex protects data only if every conflicting access uses the **same** mutex.
- `deposit` and `withdraw` lock different mutexes, so their critical sections can overlap freely. Each mutex only serializes calls of the same function.
- Rule: associate one mutex with each piece of shared state, not with each function.
- **Key Concept:** Locks protect data through a shared protocol; different mutexes give no mutual exclusion.

**Fixed Version:**
```cpp
#include <iostream>
#include <mutex>
#include <thread>

class Account {
    std::mutex m_;      // one mutex guarding balance_
    long balance_ = 0;
public:
    void deposit(long v)  { std::lock_guard<std::mutex> g(m_); balance_ += v; }
    void withdraw(long v) { std::lock_guard<std::mutex> g(m_); balance_ -= v; }
    long balance()        { std::lock_guard<std::mutex> g(m_); return balance_; }
};

int main() {
    Account acc;
    std::thread a([&] { for (int i = 0; i < 100000; ++i) acc.deposit(1); });
    std::thread b([&] { for (int i = 0; i < 100000; ++i) acc.withdraw(1); });
    a.join();
    b.join();
    std::cout << acc.balance() << '\n';   // 0
}
```

---

#### Q6
```cpp
// Q: SafeCache locks every method, so there is no data race. How many times can compute() run?
#include <iostream>
#include <map>
#include <mutex>
#include <thread>

class SafeCache {
    std::mutex m_;
    std::map<int, int> data_;
public:
    bool contains(int k) { std::lock_guard<std::mutex> g(m_); return data_.count(k) != 0; }
    void insert(int k, int v) { std::lock_guard<std::mutex> g(m_); data_.emplace(k, v); }
};

SafeCache cache;
std::mutex count_m;
int computed = 0;

int compute(int k) {
    std::lock_guard<std::mutex> g(count_m);
    ++computed;
    return k * k;
}

void get(int k) {
    if (!cache.contains(k))          // check
        cache.insert(k, compute(k)); // act
}

int main() {
    std::thread t1(get, 7);
    std::thread t2(get, 7);
    t1.join();
    t2.join();
    std::cout << "computed " << computed << " time(s)\n";
}
```

**Answer:**
```
No data race, but a race condition: prints "computed 1 time(s)" or "computed 2 time(s)".
```

**Explanation:**
- Each call is individually locked, so the class is data-race-free.
- The logical operation "if missing then compute and insert" spans two separate critical sections. Both threads can see `contains(7) == false` before either inserts.
- With an expensive `compute` (a database call, a pricing model) this doubles the work; with side effects (sending an order) it is a real bug.
- In a quick test the second outcome is rare (thread start-up staggers the threads), but nothing prevents it; with a slow `compute()` or more threads it shows up readily.
- Fix: one method that does check and insert under one lock (or `try_emplace` under one lock, computing outside and accepting a wasted compute, depending on cost).
- **Key Concept:** Thread-safe methods do not compose into a thread-safe sequence.

**Fixed Version:**
```cpp
#include <iostream>
#include <map>
#include <mutex>
#include <thread>

class SafeCache {
    std::mutex m_;
    std::map<int, int> data_;
public:
    template <class F>
    int get_or_compute(int k, F f) {
        std::lock_guard<std::mutex> g(m_);   // check and act in one critical section
        auto it = data_.find(k);
        if (it != data_.end()) return it->second;
        return data_.emplace(k, f(k)).first->second;
    }
};

SafeCache cache;
int computed = 0;   // only modified under cache's mutex

int main() {
    auto compute = [](int k) { ++computed; return k * k; };
    std::thread t1([&] { cache.get_or_compute(7, compute); });
    std::thread t2([&] { cache.get_or_compute(7, compute); });
    t1.join();
    t2.join();
    std::cout << "computed " << computed << " time(s)\n";   // always 1
}
```

---

#### Q7
```cpp
// Q: Can this program deadlock?
#include <iostream>
#include <mutex>
#include <thread>

std::mutex m1, m2;
int a = 0, b = 0;

void thread1() {
    for (int i = 0; i < 100000; ++i) {
        std::lock_guard<std::mutex> l1(m1);
        std::lock_guard<std::mutex> l2(m2);
        ++a; ++b;
    }
}

void thread2() {
    for (int i = 0; i < 100000; ++i) {
        std::lock_guard<std::mutex> l2(m2);
        std::lock_guard<std::mutex> l1(m1);
        ++a; ++b;
    }
}

int main() {
    std::thread t1(thread1), t2(thread2);
    t1.join();
    t2.join();
    std::cout << a << ' ' << b << '\n';
}
```

**Answer:**
```
Yes. It may print "200000 200000", or hang forever. The hang is intermittent.
```

**Explanation:**
- T1 can own `m1` while T2 owns `m2`. Then T1 waits for `m2` and T2 waits for `m1`: circular wait.
- All four Coffman conditions hold: mutual exclusion, hold and wait, no preemption, circular wait.
- `lock_guard` does nothing to detect this. The run may complete many times before it hangs, which is why lock-order bugs reach production.
- ThreadSanitizer reports `lock-order-inversion (potential deadlock)` even on runs that do not hang.
- **Key Concept:** Two locks taken in opposite orders by different threads can deadlock.

**Fixed Version:**
```cpp
#include <iostream>
#include <mutex>
#include <thread>

std::mutex m1, m2;
int a = 0, b = 0;

void thread1() {
    for (int i = 0; i < 100000; ++i) {
        std::scoped_lock lk(m1, m2);   // deadlock-avoiding multi-lock
        ++a; ++b;
    }
}

void thread2() {
    for (int i = 0; i < 100000; ++i) {
        std::scoped_lock lk(m2, m1);   // argument order no longer matters
        ++a; ++b;
    }
}

int main() {
    std::thread t1(thread1), t2(thread2);
    t1.join();
    t2.join();
    std::cout << a << ' ' << b << '\n';   // 200000 200000
}
```

---

#### Q8
```cpp
// Q: No two threads ever lock the same pair in opposite orders. Can this deadlock?
#include <iostream>
#include <mutex>
#include <thread>

struct Account { std::mutex m; long balance = 1000; };
Account acc[3];

void transfer(Account& from, Account& to) {
    std::lock_guard<std::mutex> l1(from.m);
    std::lock_guard<std::mutex> l2(to.m);
    --from.balance;
    ++to.balance;
}

int main() {
    std::thread t1([] { for (int i = 0; i < 100000; ++i) transfer(acc[0], acc[1]); });
    std::thread t2([] { for (int i = 0; i < 100000; ++i) transfer(acc[1], acc[2]); });
    std::thread t3([] { for (int i = 0; i < 100000; ++i) transfer(acc[2], acc[0]); });
    t1.join(); t2.join(); t3.join();
    std::cout << acc[0].balance << ' ' << acc[1].balance << ' ' << acc[2].balance << '\n';
}
```

**Answer:**
```
Yes, it can deadlock. If it completes, it prints "1000 1000 1000".
```

**Explanation:**
- T1 holds 0 and wants 1, T2 holds 1 and wants 2, T3 holds 2 and wants 0: a cycle of length three.
- Checking pairs is not enough. Circular wait can involve any number of threads; you need a global order over all locks.
- Fix: order by index (or id, or `std::less` on the address) before locking, or use `std::scoped_lock(from.m, to.m)`.
- **Key Concept:** Deadlock needs a cycle in the wait-for graph, not necessarily a pair inversion.

**Fixed Version:**
```cpp
#include <functional>
#include <iostream>
#include <mutex>
#include <thread>

struct Account { std::mutex m; long balance = 1000; };
Account acc[3];

void transfer(Account& from, Account& to) {
    // Global order: lower address first
    bool from_first = std::less<Account*>{}(&from, &to);
    std::lock_guard<std::mutex> l1(from_first ? from.m : to.m);
    std::lock_guard<std::mutex> l2(from_first ? to.m : from.m);
    --from.balance;
    ++to.balance;
}

int main() {
    std::thread t1([] { for (int i = 0; i < 100000; ++i) transfer(acc[0], acc[1]); });
    std::thread t2([] { for (int i = 0; i < 100000; ++i) transfer(acc[1], acc[2]); });
    std::thread t3([] { for (int i = 0; i < 100000; ++i) transfer(acc[2], acc[0]); });
    t1.join(); t2.join(); t3.join();
    std::cout << acc[0].balance << ' ' << acc[1].balance << ' ' << acc[2].balance << '\n';
}
```

---

#### Q9
```cpp
// Q: transfer uses std::scoped_lock, so it is deadlock-free. What happens here?
#include <iostream>
#include <mutex>

struct Account { std::mutex m; long balance = 100; };

void transfer(Account& from, Account& to, long amount) {
    std::scoped_lock lk(from.m, to.m);
    from.balance -= amount;
    to.balance += amount;
}

int main() {
    Account a;
    std::cout << "start\n";
    transfer(a, a, 10);   // self-transfer
    std::cout << "done " << a.balance << '\n';
}
```

**Answer:**
```
Undefined behaviour: the same std::mutex is passed twice. Observed with libstdc++: prints "start" and then spins at 100% CPU forever ("done" is never printed).
```

**Explanation:**
- `scoped_lock` calls `std::lock(m, m)`. The implementation locks `m`, then calls `try_lock` on `m`, which the thread already owns. For a non-recursive mutex that call is UB.
- In libstdc++ the `try_lock` simply fails, so `std::lock` unlocks and retries in an endless loop: a single-thread livelock.
- Deadlock avoidance only works for distinct mutexes. Aliasing (`from == to`) is common in real code: self-transfers, swapping an object with itself, merging a container into itself.
- **Key Concept:** Always handle aliasing before multi-locking.

**Fixed Version:**
```cpp
#include <iostream>
#include <mutex>

struct Account { std::mutex m; long balance = 100; };

void transfer(Account& from, Account& to, long amount) {
    if (&from == &to) return;            // nothing to move
    std::scoped_lock lk(from.m, to.m);
    from.balance -= amount;
    to.balance += amount;
}

int main() {
    Account a;
    std::cout << "start\n";
    transfer(a, a, 10);
    std::cout << "done " << a.balance << '\n';   // done 100
}
```

---

#### Q10
```cpp
// Q: Only one mutex exists. Can this program deadlock?
#include <iostream>
#include <mutex>
#include <thread>

std::mutex m;
int result = 0;

int main() {
    std::lock_guard<std::mutex> g(m);       // protect result while we start the worker
    std::thread worker([] {
        std::lock_guard<std::mutex> wg(m);
        result = 42;
    });
    std::cout << "main: joining\n";
    worker.join();
    std::cout << "result " << result << '\n';
}
```

**Answer:**
```
Yes, it always deadlocks. Prints "main: joining" and then hangs forever.
```

**Explanation:**
- `main` owns `m` and then waits in `join()` for the worker to finish.
- The worker cannot finish: it is blocked in `lock()` on `m`, which `main` never releases because `g` lives until the end of `main`.
- Circular wait with one mutex: the second resource is "worker has finished".
- Rule: never block waiting for another thread (`join`, `future::get`, a full queue) while holding a lock that thread might need.
- **Key Concept:** A deadlock needs a cycle of waits, not two mutexes.

**Fixed Version:**
```cpp
#include <iostream>
#include <mutex>
#include <thread>

std::mutex m;
int result = 0;

int main() {
    std::thread worker([] {
        std::lock_guard<std::mutex> wg(m);
        result = 42;
    });
    std::cout << "main: joining\n";
    worker.join();                          // no lock held while joining
    std::cout << "result " << result << '\n';   // result 42 (join gives happens-before)
}
```

---

#### Q11
```cpp
// Q: What happens when notify() runs?
#include <functional>
#include <iostream>
#include <mutex>
#include <vector>

class EventBus {
    std::mutex m_;
    std::vector<std::function<void()>> handlers_;
public:
    void subscribe(std::function<void()> h) {
        std::lock_guard<std::mutex> g(m_);
        handlers_.push_back(std::move(h));
    }
    void notify() {
        std::lock_guard<std::mutex> g(m_);
        for (auto& h : handlers_) h();
    }
};

int main() {
    EventBus bus;
    bus.subscribe([&bus] {
        std::cout << "handler: subscribing another handler\n";
        bus.subscribe([] {});
    });
    bus.notify();
    std::cout << "done\n";
}
```

**Answer:**
```
Undefined behaviour (self-deadlock). In practice it prints "handler: subscribing another handler" and hangs forever.
```

**Explanation:**
- `notify()` holds `m_` while calling the handler. The handler calls `subscribe()`, which tries to lock `m_` again on the same thread.
- Relocking a `std::mutex` the thread already owns is UB; glibc's default mutex simply blocks forever.
- Even with a `recursive_mutex` it would still be broken: `push_back` during the range-for over `handlers_` can reallocate and invalidate the iterator.
- Rule: snapshot under the lock, then call unknown code with no lock held.
- **Key Concept:** Callbacks under a lock cause self-deadlock and hidden lock-order cycles.

**Fixed Version:**
```cpp
#include <functional>
#include <iostream>
#include <mutex>
#include <vector>

class EventBus {
    std::mutex m_;
    std::vector<std::function<void()>> handlers_;
public:
    void subscribe(std::function<void()> h) {
        std::lock_guard<std::mutex> g(m_);
        handlers_.push_back(std::move(h));
    }
    void notify() {
        std::vector<std::function<void()>> snapshot;
        {
            std::lock_guard<std::mutex> g(m_);
            snapshot = handlers_;
        }
        for (auto& h : snapshot) h();       // no lock held here
    }
};

int main() {
    EventBus bus;
    bus.subscribe([&bus] {
        std::cout << "handler: subscribing another handler\n";
        bus.subscribe([] {});
    });
    bus.notify();
    std::cout << "done\n";
}
```

---

#### Q12
```cpp
// Q: Each thread writes only its own field. Is this a data race?
#include <iostream>
#include <thread>

struct Status {
    unsigned feed_a : 4;
    unsigned feed_b : 4;
};

Status s{};

int main() {
    std::thread t1([] { for (unsigned i = 0; i < 100000; ++i) s.feed_a = i & 0xF; });
    std::thread t2([] { for (unsigned i = 0; i < 100000; ++i) s.feed_b = i & 0xF; });
    t1.join();
    t2.join();
    std::cout << s.feed_a << ' ' << s.feed_b << '\n';
}
```

**Answer:**
```
Yes: data race, undefined behaviour. Adjacent bit-fields are one memory location. Commonly prints "15 15", but either field can be lost (e.g. "0 15").
```

**Explanation:**
- Writing a bit-field is a read-modify-write of the containing unit. T1's write of `feed_a` can write back a stale `feed_b`, and vice versa.
- The standard defines a memory location as a scalar object or a maximal sequence of adjacent non-zero-width bit-fields. Different ordinary members are different locations; these two bit-fields are one.
- `std::vector<bool>` has the same trap.
- Fix: separate ordinary members (shown below), a zero-width bit-field (`unsigned : 0;`) between them, or a lock/atomic for the shared word.
- Tooling note: GCC 11's ThreadSanitizer instruments bit-field stores as wide accesses and still flags the zero-width version (a false positive; the generated code writes separate bytes). Ordinary members avoid both the race and the noise.
- **Key Concept:** Data races are defined per memory location, and adjacent bit-fields share one.

**Fixed Version:**
```cpp
#include <iostream>
#include <thread>

struct Status {
    unsigned char feed_a;   // ordinary members: separate memory locations
    unsigned char feed_b;
};

Status s{};

int main() {
    std::thread t1([] { for (unsigned i = 0; i < 100000; ++i) s.feed_a = i & 0xF; });
    std::thread t2([] { for (unsigned i = 0; i < 100000; ++i) s.feed_b = i & 0xF; });
    t1.join();
    t2.join();
    std::cout << unsigned(s.feed_a) << ' ' << unsigned(s.feed_b) << '\n';   // 15 15
}
```

---

#### Q13
```cpp
// Q: The author used adopt_lock to "avoid deadlock". Find the bug.
#include <iostream>
#include <mutex>
#include <thread>

std::mutex m1, m2;
int x = 0, y = 0;

void update() {
    for (int i = 0; i < 100000; ++i) {
        std::lock_guard<std::mutex> a(m1, std::adopt_lock);
        std::lock_guard<std::mutex> b(m2, std::adopt_lock);
        ++x; ++y;
    }
}

int main() {
    std::thread t1(update), t2(update);
    t1.join();
    t2.join();
    std::cout << x << ' ' << y << '\n';
}
```

**Answer:**
```
Nothing is ever locked: data race on x and y, plus unlock() of mutexes the thread does not own. Undefined behaviour; typical output is less than "200000 200000" (it may also appear correct).
```

**Explanation:**
- `std::adopt_lock` means "the calling thread already owns this mutex; just take responsibility for unlocking it". It does not lock.
- The missing call is `std::lock(m1, m2);` before constructing the guards.
- Each guard's destructor then calls `unlock()` on a mutex this thread never locked: UB on its own.
- Mnemonic: `defer_lock` = wrapper first, lock later; `adopt_lock` = lock first, wrapper later; `try_to_lock` = try now, check `owns_lock()`.
- **Key Concept:** `adopt_lock` transfers ownership of an already-held lock; it never acquires one.

**Fixed Version:**
```cpp
#include <iostream>
#include <mutex>
#include <thread>

std::mutex m1, m2;
int x = 0, y = 0;

void update() {
    for (int i = 0; i < 100000; ++i) {
        std::scoped_lock lk(m1, m2);   // locks both, unlocks both
        ++x; ++y;
    }
}

int main() {
    std::thread t1(update), t2(update);
    t1.join();
    t2.join();
    std::cout << x << ' ' << y << '\n';   // 200000 200000
}
```
