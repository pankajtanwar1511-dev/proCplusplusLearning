## TOPIC: Memory Ordering and the C++ Memory Model

### PRACTICE_TASKS: Output Prediction and Bug Hunting

#### Q1
```cpp
// Q: Find the bug. The author says "ready is atomic, so the consumer always prints 42".
#include <atomic>
#include <iostream>
#include <thread>

int data = 0;
std::atomic<bool> ready{false};

void producer() {
    data = 42;
    ready.store(true, std::memory_order_relaxed);
}

void consumer() {
    while (!ready.load(std::memory_order_relaxed)) {}
    std::cout << data << '\n';
}

int main() {
    std::thread c(consumer), p(producer);
    p.join();
    c.join();
}
```

**Answer:**
```
Data race on `data`: undefined behaviour (not merely "might print 0").
```

**Explanation:**
- `ready` itself is fine: atomic accesses never race.
- Relaxed operations create no synchronizes-with edge, so `data = 42` does not happen-before `std::cout << data`.
- Conflicting non-atomic accesses with no happens-before = data race = UB for the whole program. ThreadSanitizer reports it.
- On x86 with GCC this usually prints 42, which is why the bug survives testing; on ARM, or after a compiler reorders the two stores, it can print 0.
- **Key Concept:** an atomic flag publishes other data only with release on the store and acquire on the load.

**Fixed Version:**
```cpp
#include <atomic>
#include <iostream>
#include <thread>

int data = 0;
std::atomic<bool> ready{false};

void producer() {
    data = 42;
    ready.store(true, std::memory_order_release);      // publish
}

void consumer() {
    while (!ready.load(std::memory_order_acquire)) {}  // import
    std::cout << data << '\n';                          // always 42
}

int main() {
    std::thread c(consumer), p(producer);
    p.join();
    c.join();
}
```

---

#### Q2
```cpp
// Q: Is this thread-safe? The consumer was "fixed" to use acquire.
#include <atomic>
#include <iostream>
#include <thread>

int payload = 100;
std::atomic<bool> ready{false};

int main() {
    std::thread producer([] {
        payload = 500;
        ready.store(true, std::memory_order_relaxed);
    });
    std::thread consumer([] {
        while (!ready.load(std::memory_order_acquire)) {}
        std::cout << payload << '\n';
    });
    producer.join();
    consumer.join();
}
```

**Answer:**
```
No. Data race on `payload`: undefined behaviour.
```

**Explanation:**
- An acquire load synchronizes-with a **release** store (or a release fence) whose value it reads. A relaxed store has no release semantics.
- So there is still no happens-before from `payload = 500` to the read: the half-fix changes nothing formally.
- "The producer probably runs first" is irrelevant: execution order is not synchronization.
- **Key Concept:** release/acquire is a pair on the same atomic; fixing only the consumer side is the classic half-fix.

**Fixed Version:**
```cpp
#include <atomic>
#include <iostream>
#include <thread>

int payload = 100;
std::atomic<bool> ready{false};

int main() {
    std::thread producer([] {
        payload = 500;
        ready.store(true, std::memory_order_release);   // the missing half
    });
    std::thread consumer([] {
        while (!ready.load(std::memory_order_acquire)) {}
        std::cout << payload << '\n';                   // always 500
    });
    producer.join();
    consumer.join();
}
```

---

#### Q3
```cpp
// Q: Is there a data race? Which values can this program print?
#include <atomic>
#include <iostream>
#include <thread>

std::atomic<int> data{0};
std::atomic<bool> ready{false};

int main() {
    std::thread t1([] {
        data.store(42, std::memory_order_relaxed);
        ready.store(true, std::memory_order_relaxed);
    });
    std::thread t2([] {
        while (!ready.load(std::memory_order_relaxed)) {}
        std::cout << data.load(std::memory_order_relaxed) << '\n';
    });
    t1.join();
    t2.join();
}
```

**Answer:**
```
No data race (every access is atomic), so behaviour is defined.
It may print 42 or 0. On x86 with GCC you will practically always see 42,
but 0 is allowed by the standard.
```

**Explanation:**
- `data` and `ready` are separate atomics with separate modification orders. Relaxed operations add no edge between them, so seeing `ready == true` says nothing about `data`.
- Calling this "a data race" is the common wrong answer: that applies only when `data` is a plain `int` (Q1).
- Fix for "must print 42": release on `ready.store`, acquire on `ready.load`. `data` can then stay relaxed.
- **Key Concept:** race-free is not the same as ordered; relaxed atomics are defined behaviour without cross-variable guarantees.

---

#### Q4
```cpp
// Q: What does this program print?
#include <atomic>
#include <iostream>
#include <thread>

std::atomic<int> counter{0};

void work() {
    for (int i = 0; i < 1'000'000; ++i)
        counter.fetch_add(1, std::memory_order_relaxed);
}

int main() {
    std::thread a(work), b(work);
    a.join();
    b.join();
    std::cout << counter.load(std::memory_order_relaxed) << '\n';
}
```

**Answer:**
```
2000000
```

**Explanation:**
- `fetch_add` is an atomic read-modify-write; every RMW reads the latest value in the counter's modification order, so no increment is lost, even with `relaxed`.
- The final load sees all increments because thread completion synchronizes-with the return of `join()`.
- Relaxed is the right choice: the counter publishes no other data.
- **Key Concept:** relaxed removes ordering of other memory, never atomicity.

---

#### Q5
```cpp
// Q: Which of these outputs are possible: "0 20", "10 20", "20 20", "20 10", "10 0"?
#include <atomic>
#include <cstdio>
#include <thread>

std::atomic<int> x{0};

int main() {
    int a = 0, b = 0;
    std::thread writer([] {
        x.store(10, std::memory_order_relaxed);
        x.store(20, std::memory_order_relaxed);
    });
    std::thread reader([&] {
        a = x.load(std::memory_order_relaxed);
        b = x.load(std::memory_order_relaxed);
    });
    writer.join();
    reader.join();
    std::printf("%d %d\n", a, b);
}
```

**Answer:**
```
Possible:   "0 20", "10 20", "20 20"
Impossible: "20 10", "10 0"
(Full allowed set: 0 0, 0 10, 0 20, 10 10, 10 20, 20 20)
```

**Explanation:**
- The modification order of `x` is `0 → 10 → 20` (both stores are in one thread, so sequenced-before fixes their order).
- Read-read coherence: once the reader has observed a value, a later load of the same object cannot return an earlier value in the modification order. This holds even for `relaxed`.
- Reading `a` and `b` in `main` after `join()` is safe: join provides happens-before.
- **Key Concept:** per object, observations never go backward; relaxed only relaxes ordering across different objects.

---

#### Q6
```cpp
// Q: Which outputs are possible: "", "T1", "T2", "T1 T2"? Does the answer change with release/acquire?
#include <atomic>
#include <cstdio>
#include <thread>

std::atomic<bool> x{false}, y{false};

int main() {
    bool p1 = false, p2 = false;
    std::thread t1([&] {
        x.store(true, std::memory_order_seq_cst);
        p1 = y.load(std::memory_order_seq_cst);
    });
    std::thread t2([&] {
        y.store(true, std::memory_order_seq_cst);
        p2 = x.load(std::memory_order_seq_cst);
    });
    t1.join();
    t2.join();
    std::printf("%s%s%s\n", p1 ? "T1" : "", (p1 && p2) ? " " : "", p2 ? "T2" : "");
}
```

**Answer:**
```
With seq_cst: "T1", "T2" or "T1 T2". The empty line is impossible.
With release stores / acquire loads: all four, including the empty line.
```

**Explanation:**
- Empty output means both loads read `false`. Then T1's `y.load` precedes T2's `y.store` and T2's `x.load` precedes T1's `x.store` in the single seq_cst total order. With program order that forms a cycle, so it cannot happen.
- "T1 T2" is possible: total order `x.store, y.store, y.load, x.load`.
- Two common wrong answers: "at most one thread can print" (backwards) and "seq_cst allows every outcome" (misses the cycle).
- With release/acquire the store can be delayed past the later load (store buffer), and the empty line really occurs on x86 (thousands of times per 200,000 trials, see Theory Example 3).
- **Key Concept:** store-then-load across two variables (Dekker pattern) needs seq_cst; acquire/release does not forbid it.

---

#### Q7
```cpp
// Q: Find the bug. "volatile stops the compiler caching the flag, so this is safe."
#include <iostream>
#include <thread>

int result = 0;
volatile bool done = false;

int main() {
    std::thread worker([] {
        result = 123;
        done = true;
    });
    while (!done) {}
    std::cout << result << '\n';
    worker.join();
}
```

**Answer:**
```
Data races on both `done` and `result`: undefined behaviour.
volatile gives no atomicity and no inter-thread ordering.
```

**Explanation:**
- `volatile` only forces the compiler to perform each access to `done`. It creates no happens-before, so `result = 123` is not published.
- Concurrent access to a `volatile` object is still a data race in standard C++.
- The compiler may move the plain `result` store after the volatile `done` store; ARM hardware may reorder them too.
- MSVC's `/volatile:ms` would make it work on x86/x64, which is exactly why such code appears in old Windows codebases. It is non-portable.
- **Key Concept:** `volatile` is for MMIO and signal handlers; threads need `std::atomic` or a mutex.

**Fixed Version:**
```cpp
#include <atomic>
#include <iostream>
#include <thread>

int result = 0;
std::atomic<bool> done{false};

int main() {
    std::thread worker([] {
        result = 123;
        done.store(true, std::memory_order_release);
    });
    while (!done.load(std::memory_order_acquire)) {}
    std::cout << result << '\n';      // always 123
    worker.join();
}
```

---

#### Q8
```cpp
// Q: What can this print? Is there undefined behaviour if the consumer runs first?
#include <atomic>
#include <iostream>
#include <thread>

int data = 0;
std::atomic<bool> ready{false};

int main() {
    std::thread consumer([] {
        if (ready.load(std::memory_order_acquire))
            std::cout << data << '\n';
        else
            std::cout << "not ready\n";
    });
    std::thread producer([] {
        data = 42;
        ready.store(true, std::memory_order_release);
    });
    consumer.join();
    producer.join();
}
```

**Answer:**
```
Either "not ready" or "42". Never "0". No undefined behaviour.
```

**Explanation:**
- Acquire does not wait for a release. If the load runs first it reads `false`, synchronizes with nothing, and the program prints "not ready" without ever touching `data`: no access, no race.
- If the load reads `true`, it read the release store's value, so `data = 42` happens-before the read and `42` is printed.
- A later release store does not update the value already loaded; to wait, loop, use `ready.wait(false)` (C++20), or a condition variable.
- **Key Concept:** synchronization happens only when the acquire reads the released value; acquire is a filter, not a wait.

---

#### Q9
```cpp
// Q: Does this compile? What is wrong with it?
#include <atomic>
#include <iostream>

int main() {
    std::atomic<int> ready{0};
    ready.store(1, std::memory_order_acquire);
    std::cout << ready.load(std::memory_order_release) << '\n';
}
```

**Answer:**
```
It compiles without warnings (GCC 11 / Clang, -Wall -Wextra) and normally prints 1,
but both calls violate preconditions: undefined behaviour.
With -D_GLIBCXX_ASSERTIONS (libstdc++) the program aborts at the store.
```

**Explanation:**
- A store accepts only `relaxed`, `release` or `seq_cst`. A load accepts only `relaxed`, `consume`, `acquire` or `seq_cst`.
- Acquire is about the *read* side of synchronization and release about the *write* side; they have no meaning on the other operation.
- If you need both on one operation, it must be an RMW (`exchange`, `fetch_add`, CAS) with `acq_rel`.
- **Key Concept:** invalid memory-order arguments are UB, not "the strongest order"; enable library assertions in debug builds.

**Fixed Version:**
```cpp
#include <atomic>
#include <iostream>

int main() {
    std::atomic<int> ready{0};
    ready.store(1, std::memory_order_release);
    std::cout << ready.load(std::memory_order_acquire) << '\n';   // prints 1
}
```

---

#### Q10
```cpp
// Q: Find the bug. The author used fences "to make it fast".
#include <atomic>
#include <iostream>
#include <thread>

int value = 0;
std::atomic<int> flag{0};

int main() {
    std::thread producer([] {
        value = 7;
        flag.store(1, std::memory_order_relaxed);
        std::atomic_thread_fence(std::memory_order_release);
    });
    std::thread consumer([] {
        while (flag.load(std::memory_order_relaxed) == 0) {}
        std::atomic_thread_fence(std::memory_order_acquire);
        std::cout << value << '\n';
    });
    producer.join();
    consumer.join();
}
```

**Answer:**
```
Data race on `value`: undefined behaviour. The release fence is on the wrong side of the store.
```

**Explanation:**
- Fence-fence synchronization requires the release fence to be **sequenced before** the store that the consumer reads. Here the store comes first, so the fence publishes nothing to that store's readers.
- The consumer side is correct: acquire fence after the relaxed load that saw `1`.
- A fence is not a "flush everything" instruction; it only upgrades the relaxed atomic operations on the correct side of it.
- Tooling note: ThreadSanitizer (GCC 11) does not model standalone fences, so it flags the fixed version too (a false positive). Fence code needs reasoning, not just TSan.
- **Key Concept:** release fence before the publishing store, acquire fence after the observing load.

**Fixed Version:**
```cpp
#include <atomic>
#include <iostream>
#include <thread>

int value = 0;
std::atomic<int> flag{0};

int main() {
    std::thread producer([] {
        value = 7;
        std::atomic_thread_fence(std::memory_order_release);   // moved before the store
        flag.store(1, std::memory_order_relaxed);
    });
    std::thread consumer([] {
        while (flag.load(std::memory_order_relaxed) == 0) {}
        std::atomic_thread_fence(std::memory_order_acquire);
        std::cout << value << '\n';                             // always 7
    });
    producer.join();
    consumer.join();
}
```

---

#### Q11
```cpp
// Q: Is there a data race on `data`? What can this program print?
#include <iostream>
#include <mutex>
#include <thread>

int data = 0;
std::mutex m;

int main() {
    std::thread writer([] {
        std::lock_guard<std::mutex> lk(m);
        data = 42;
    });
    std::thread reader([] {
        std::lock_guard<std::mutex> lk(m);
        std::cout << data << '\n';
    });
    writer.join();
    reader.join();
}
```

**Answer:**
```
No data race. Prints 42 or 0, depending on which thread locks first.
```

**Explanation:**
- Lock is an acquire, unlock is a release, and each unlock synchronizes-with the next lock of the same mutex. Whichever critical section comes second sees everything the first one wrote.
- If the reader locks first it prints `0`: a well-defined outcome, a logical ordering problem, not UB.
- To force "42", the reader must wait for a state change: a condition variable with a predicate, an atomic flag, or simply joining the writer first.
- **Key Concept:** a mutex orders whole critical sections; it does not decide which thread goes first.

---

#### Q12
```cpp
// Q: Is T3's read of `config` safe?
#include <atomic>
#include <iostream>
#include <thread>

int config = 0;
std::atomic<bool> a{false}, b{false};

int main() {
    std::thread t1([] {
        config = 10;
        a.store(true, std::memory_order_release);
    });
    std::thread t2([] {
        while (!a.load(std::memory_order_acquire)) {}
        b.store(true, std::memory_order_relaxed);
    });
    std::thread t3([] {
        while (!b.load(std::memory_order_acquire)) {}
        std::cout << config << '\n';
    });
    t1.join(); t2.join(); t3.join();
}
```

**Answer:**
```
No. Data race on `config` in T3: undefined behaviour.
```

**Explanation:**
- T1 → T2 is a proper link: release on `a`, acquire that reads it.
- T2 → T3 is broken: the store to `b` is relaxed, so T3's acquire has no release to synchronize with.
- Happens-before is transitive only through real links; one relaxed hop cuts the whole chain.
- With `b.store(true, std::memory_order_release)` the chain `config = 10 → release a → acquire a → release b → acquire b → read` holds, and T3 always prints `10`, even though T3 never touches `a`.
- **Key Concept:** transitivity works through any number of threads, but every hop needs its own release/acquire pair.

**Fixed Version:**
```cpp
#include <atomic>
#include <iostream>
#include <thread>

int config = 0;
std::atomic<bool> a{false}, b{false};

int main() {
    std::thread t1([] {
        config = 10;
        a.store(true, std::memory_order_release);
    });
    std::thread t2([] {
        while (!a.load(std::memory_order_acquire)) {}
        b.store(true, std::memory_order_release);   // the missing link
    });
    std::thread t3([] {
        while (!b.load(std::memory_order_acquire)) {}
        std::cout << config << '\n';                // always 10
    });
    t1.join(); t2.join(); t3.join();
}
```

---

#### Q13
```cpp
// Q: T2's CAS is relaxed. Is T3's read of `data` safe? What does it print?
#include <atomic>
#include <iostream>
#include <thread>

int data = 0;
std::atomic<int> stage{0};

int main() {
    std::thread t1([] {
        data = 42;
        stage.store(1, std::memory_order_release);
    });
    std::thread t2([] {
        int expected = 1;
        while (!stage.compare_exchange_weak(expected, 2, std::memory_order_relaxed))
            expected = 1;                                  // wait until stage == 1, then make it 2
    });
    std::thread t3([] {
        while (stage.load(std::memory_order_acquire) != 2) {}
        std::cout << data << '\n';
    });
    t1.join(); t2.join(); t3.join();
}
```

**Answer:**
```
Safe. Always prints 42.
```

**Explanation:**
- T3 reads the value `2`, written by T2's relaxed CAS, not by T1's release store. It looks like the chain is broken.
- But a successful CAS is a read-modify-write, and an RMW on the same atomic continues the **release sequence** headed by T1's release store. An acquire that reads any value in that release sequence synchronizes-with the head.
- So `data = 42` happens-before T3's read, even though T2 used `relaxed`.
- Since C++20 only RMWs extend a release sequence. If T2 had done a plain `stage.store(2, relaxed)` instead, T3 would race on `data`.
- **Key Concept:** RMWs in the middle (counters, CAS) do not break a release/acquire publication; plain stores do.

---

#### Q14
```cpp
// Q: Find the bug in this spinlock.
#include <atomic>
#include <iostream>
#include <thread>
#include <vector>

class SpinLock {
    std::atomic<bool> locked_{false};
public:
    void lock() {
        while (locked_.exchange(true, std::memory_order_relaxed)) {}
    }
    void unlock() { locked_.store(false, std::memory_order_relaxed); }
};

SpinLock lk;
long total = 0;

int main() {
    std::vector<std::thread> ts;
    for (int t = 0; t < 4; ++t)
        ts.emplace_back([] {
            for (int i = 0; i < 100000; ++i) { lk.lock(); ++total; lk.unlock(); }
        });
    for (auto& t : ts) t.join();
    std::cout << total << '\n';
}
```

**Answer:**
```
Data race on `total`: undefined behaviour. On x86 it usually still prints 400000,
because the locked xchg is a full barrier there; on ARM, or after compiler reordering, increments can be lost.
```

**Explanation:**
- Mutual exclusion on the flag works (the `exchange` is atomic), but relaxed ordering means the critical section's accesses to `total` are not ordered with the lock operations.
- The compiler may move `++total` outside the lock/unlock pair, and a weak CPU may make the store to `total` visible after the unlock.
- Lock must be acquire (later accesses stay below it), unlock must be release (earlier accesses stay above it). Then unlock synchronizes-with the next successful lock.
- Bonus improvement: spin on a plain load (test-and-test-and-set) so waiting cores do not keep stealing the cache line with RMWs.
- **Key Concept:** a lock is mutual exclusion plus acquire/release; relaxed gives only the first.

**Fixed Version:**
```cpp
#include <atomic>
#include <iostream>
#include <thread>
#include <vector>

class SpinLock {
    std::atomic<bool> locked_{false};
public:
    void lock() {
        while (locked_.exchange(true, std::memory_order_acquire)) {
            while (locked_.load(std::memory_order_relaxed)) {}   // test-and-test-and-set
        }
    }
    void unlock() { locked_.store(false, std::memory_order_release); }
};

SpinLock lk;
long total = 0;

int main() {
    std::vector<std::thread> ts;
    for (int t = 0; t < 4; ++t)
        ts.emplace_back([] {
            for (int i = 0; i < 100000; ++i) { lk.lock(); ++total; lk.unlock(); }
        });
    for (auto& t : ts) t.join();
    std::cout << total << '\n';    // always 400000
}
```

---

#### Q15
```cpp
// Q: Find the bug in this double-checked locking singleton.
#include <iostream>
#include <mutex>
#include <thread>

struct Config {
    int port = 0;
    Config() { port = 8080; }
};

Config* instance = nullptr;
std::mutex m;

Config* get() {
    if (instance == nullptr) {                  // unlocked check
        std::lock_guard<std::mutex> lk(m);
        if (instance == nullptr)
            instance = new Config;
    }
    return instance;
}

int main() {
    std::thread a([] { std::cout << get()->port << '\n'; });
    std::thread b([] { std::cout << get()->port << '\n'; });
    a.join();
    b.join();
    delete instance;
}
```

**Answer:**
```
Data race on `instance`: undefined behaviour.
A thread can see a non-null pointer before the Config constructor's writes are visible.
```

**Explanation:**
- The first check reads `instance` without the mutex while another thread writes it under the mutex. The mutex only orders threads that both lock it.
- `instance = new Config` is allocation, construction, then pointer store. Nothing stops the compiler or CPU from making the pointer store visible before `port = 8080`, so the fast path can read `port == 0`.
- `volatile Config*` would not fix either problem.
- Fix 1: `std::atomic<Config*>` with an acquire load on the fast path and a release store after construction.
- Fix 2 (preferred): a function-local static. Its initialization is thread-safe since C++11, and compilers implement it with an acquire-load fast path.
- **Key Concept:** an unlocked fast path must carry its own release/acquire publication.

**Fixed Version:**
```cpp
#include <iostream>
#include <thread>

struct Config {
    int port = 0;
    Config() { port = 8080; }
};

Config& get() {
    static Config instance;     // thread-safe initialization, published to every caller
    return instance;
}

int main() {
    std::thread a([] { std::cout << get().port << '\n'; });
    std::thread b([] { std::cout << get().port << '\n'; });
    a.join();
    b.join();
}
```

---
