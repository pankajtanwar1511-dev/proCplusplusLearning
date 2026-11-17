## TOPIC: Top 50: Must-Know Concurrency Interview Questions

### PRACTICE_TASKS: The Must-Know Code Puzzles

#### Q1
```cpp
// Q: The worker finishes long before main ends. What happens when this program runs?
#include <chrono>
#include <iostream>
#include <thread>

int main() {
    std::thread t([] { std::cout << "worker done\n"; });
    std::this_thread::sleep_for(std::chrono::milliseconds(100));
    std::cout << "main done\n";
}
```

**Answer:**
```
worker done
main done
terminate called without an active exception
(abort, exit status 134 on Linux)
```

**Explanation:**
- The worker almost certainly finished during the sleep, but `t` was never joined or detached.
- `~thread()` checks `joinable()`, which is still `true`: it calls `std::terminate()` (libstdc++ prints the message above, then `abort()`).
- Extra trap: if stdout is redirected to a file or pipe, the two lines may never appear, because `abort()` does not flush stdio buffers.
- **Key Concept:** Finishing the thread does not make the `std::thread` object non-joinable.
- Deep dive: Topic 1, std::thread: Creation, Lifetime and Argument Passing

**Fixed Version:**
```cpp
#include <chrono>
#include <iostream>
#include <thread>

int main() {
    std::thread t([] { std::cout << "worker done\n"; });
    std::this_thread::sleep_for(std::chrono::milliseconds(100));
    t.join();
    std::cout << "main done\n";
}
```

---

#### Q2
```cpp
// Q: Does this compile? If yes, what does it print?
#include <iostream>
#include <thread>

int main() {
    int value = 42;

    std::thread t([](int& x) {
        x++;
        std::cout << x << '\n';
    }, value);

    t.join();
    std::cout << value << '\n';
}
```

**Answer:**
```
Compile error.
libstdc++: static assertion failed: std::thread arguments must be invocable after conversion to rvalues
```

**Explanation:**
- `std::thread` stores a copy of `value` and passes it to the lambda as an **rvalue**.
- An rvalue cannot bind to a non-const `int&`, so the callable is not invocable with the stored arguments.
- It does **not** silently bind the reference to the hidden copy, and nothing dangles: it just fails to compile.
- With `std::ref(value)` the program prints `43` then `43`.
- **Key Concept:** Reference parameters require std::ref; std::thread never preserves references implicitly.
- Deep dive: Topic 1, std::thread: Creation, Lifetime and Argument Passing

**Fixed Version:**
```cpp
#include <functional>
#include <iostream>
#include <thread>

int main() {
    int value = 42;

    std::thread t([](int& x) {
        x++;
        std::cout << x << '\n';
    }, std::ref(value));

    t.join();
    std::cout << value << '\n'; // 43
}
```

---

#### Q3
```cpp
// Q: main dereferences ptr only after join(). Is this program correct?
#include <iostream>
#include <thread>

int* ptr = nullptr;

void worker() {
    int value = 42;
    ptr = &value;
}

int main() {
    std::thread t(worker);
    t.join();
    std::cout << *ptr << '\n';
}
```

**Answer:**
```
Undefined behaviour: ptr points to a destroyed object. Often prints 42 or garbage.
```

**Explanation:**
- `value` lives on the worker's stack and is destroyed when `worker()` **returns**, before `join()` returns.
- The write to `ptr` is properly synchronized (thread completion synchronizes-with `join()`), so there is no data race on `ptr` itself.
- But the object it points to is dead. `join()` does not extend the worker's locals.
- **Key Concept:** Synchronization and object lifetime are separate questions; both must be satisfied.
- Deep dive: Topic 1, std::thread: Creation, Lifetime and Argument Passing

**Fixed Version:**
```cpp
#include <iostream>
#include <thread>

int main() {
    int result = 0;                              // owned by main
    std::thread t([&result] { result = 42; });   // main outlives the use
    t.join();                                    // write is visible after join
    std::cout << result << '\n';
}
```

---

#### Q4
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
- Deep dive: Topic 2, Data Races, Race Conditions and Deadlocks

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

#### Q5
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
- Deep dive: Topic 2, Data Races, Race Conditions and Deadlocks

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

#### Q6
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
- Deep dive: Topic 2, Data Races, Race Conditions and Deadlocks

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

#### Q7
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
- Deep dive: Topic 3, Mutexes and Lock Types

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

#### Q8
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
- Deep dive: Topic 3, Mutexes and Lock Types

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

#### Q9
```cpp
// Q: What does this program print? (The producer thread finishes before the consumer starts.)
#include <chrono>
#include <condition_variable>
#include <iostream>
#include <mutex>
#include <thread>

std::mutex m;
std::condition_variable cv;
bool ready = false;

int main() {
    std::thread producer([] {
        { std::lock_guard<std::mutex> lk(m); ready = true; }
        cv.notify_one();
    });
    producer.join();

    std::unique_lock<std::mutex> lk(m);
    auto st = cv.wait_for(lk, std::chrono::milliseconds(200));
    std::cout << (st == std::cv_status::timeout ? "timeout" : "no_timeout")
              << " ready=" << ready << '\n';
}
```

**Answer:**
```
timeout ready=1
```

**Explanation:**
- `notify_one` ran when nobody was waiting, so it was dropped. CVs do not remember notifications.
- The raw `wait_for` therefore blocks for the full 200 ms and reports `timeout`, although `ready` has been `true` the whole time.
- With a plain `cv.wait(lk)` this program would hang forever.
- (A spurious wakeup could in theory print `no_timeout`; that would not mean anything was signalled either.)
- `cv.wait_for(lk, 200ms, [] { return ready; })` returns `true` immediately without blocking.
- **Key Concept:** Wait for the state, not for the notification.
- Deep dive: Topic 4, Condition Variables and Producer-Consumer Signalling

---

#### Q10
```cpp
// Q: Nobody ever calls notify. What does this program print?
#include <condition_variable>
#include <iostream>
#include <mutex>

std::mutex m;
std::condition_variable cv;
bool ready = true;
int calls = 0;

int main() {
    std::unique_lock<std::mutex> lk(m);
    cv.wait(lk, [] { ++calls; return ready; });
    std::cout << "returned, predicate calls=" << calls
              << ", owns lock=" << lk.owns_lock() << '\n';
}
```

**Answer:**
```
returned, predicate calls=1, owns lock=1
```

**Explanation:**
- `wait(lk, pred)` is `while (!pred()) wait(lk);`. The predicate is evaluated once, before any blocking.
- It is already `true`, so the thread never blocks and no notification is needed.
- The lock is still owned on return (it was never released).
- This is exactly why "notify before wait" is harmless with the predicate form.
- **Key Concept:** The predicate is checked first; a CV wait on an already-true condition costs one function call.
- Deep dive: Topic 4, Condition Variables and Producer-Consumer Signalling

---

#### Q11
```cpp
// Q: What can this print? Is there a data race?
#include <atomic>
#include <iostream>
#include <thread>

std::atomic<int> counter{0};

int main() {
    auto work = [] { for (int i = 0; i < 1000; ++i) counter = counter + 4; };
    std::thread t1(work), t2(work);
    t1.join();
    t2.join();
    std::cout << counter << '\n';
}
```

**Answer:**
```
No data race, but updates can be lost: any multiple of 4 from 8 to 8000. Run-dependent (eight test runs printed 8000, 4368, 6320, 8000, 7516, 8000, 7584, 8000).
```

**Explanation:**
- `counter = counter + 4` is `operator int()` (atomic load), an addition in a register, then `operator=` (atomic store).
- Two threads can both load 40 and both store 44: one increment of 4 is lost.
- Because each half is atomic, there is no UB; the bug is a lost update (race condition).
- With only 1000 iterations one thread may finish before the other starts, so 8000 appears in some runs. A passing run proves nothing about correctness.
- `counter += 4` is a single atomic RMW and always gives 8000.
- **Key Concept:** `x += 4` is atomic; `x = x + 4` is load plus store.
- Deep dive: Topic 5, std::atomic and Compare-and-Swap

**Fixed Version:**
```cpp
#include <atomic>
#include <iostream>
#include <thread>

std::atomic<int> counter{0};

int main() {
    auto work = [] { for (int i = 0; i < 1000; ++i) counter += 4; };   // atomic RMW
    std::thread t1(work), t2(work);
    t1.join();
    t2.join();
    std::cout << counter << '\n';   // always 8000
}
```

---

#### Q12
```cpp
// Q: What does this program print?
#include <atomic>
#include <iostream>

int main() {
    std::atomic<int> value{10};
    int expected = 10;

    value.store(15);   // simulate another thread changing value before our CAS

    if (value.compare_exchange_strong(expected, 20)) {
        std::cout << "success: ";
    } else {
        std::cout << "failed: ";
    }
    std::cout << "value=" << value << " expected=" << expected << '\n';

    if (value.compare_exchange_strong(expected, 20)) {
        std::cout << "retry success: value=" << value << " expected=" << expected << '\n';
    }
}
```

**Answer:**
```
failed: value=15 expected=15
retry success: value=20 expected=15
```

**Explanation:**
- First CAS: `15 != 10`, so it fails. The atomic is unchanged (15), and `expected` is overwritten with the current value (15).
- Second CAS: `expected` is now 15, which matches, so `value` becomes 20. On success `expected` is not modified.
- This automatic refresh of `expected` is exactly what makes CAS retry loops work without an extra `load()`.
- **Key Concept:** CAS failure writes the current value into `expected`.
- Deep dive: Topic 5, std::atomic and Compare-and-Swap

---

#### Q13
```cpp
// Q: What does this print on x86-64 with GCC? What does it tell you?
#include <atomic>
#include <iostream>

struct Small { int a; int b; };          // 8 bytes
struct Large { long a; long b; long c; }; // 24 bytes

int main() {
    std::cout << std::boolalpha
              << std::atomic<int*>::is_always_lock_free << ' '
              << std::atomic<Small>::is_always_lock_free << ' '
              << std::atomic<Large>::is_always_lock_free << '\n';
}
```

**Answer:**
```
true true false
```

**Explanation:**
- Pointers and 8-byte trivially copyable structs fit a native 8-byte atomic instruction: lock-free.
- A 24-byte struct cannot be updated by one instruction, so `std::atomic<Large>` is implemented with a lock (in GCC's `libatomic`). It is still fully atomic, just not lock-free.
- Doing actual operations on `std::atomic<Large>` with GCC requires linking `-latomic`.
- Platform-specific: the standard only guarantees `std::atomic_flag` is lock-free.
- A "lock-free" algorithm built on `std::atomic<Large>` would silently contain a lock.
- **Key Concept:** `std::atomic<T>` does not imply lock-free; check `is_always_lock_free`.
- Deep dive: Topic 5, std::atomic and Compare-and-Swap

---

#### Q14
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
- Deep dive: Topic 6, Memory Ordering and the C++ Memory Model

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

#### Q15
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
- Deep dive: Topic 6, Memory Ordering and the C++ Memory Model

---

#### Q16
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
- Deep dive: Topic 6, Memory Ordering and the C++ Memory Model

---

#### Q17
```cpp
// Q: Compiled with g++ -O2. What does this program print?
#include <chrono>
#include <iostream>
#include <thread>

bool locked = true;   // plain bool: "held" by main at start
int data = 0;

void waiter() {
    while (locked) {
        // spin until main releases
    }
    std::cout << "waiter sees data=" << data << '\n';
}

int main() {
    std::thread t(waiter);
    std::this_thread::sleep_for(std::chrono::milliseconds(100));
    data = 42;
    locked = false;   // "unlock"
    t.join();
}
```

**Answer:**
```
Data race: undefined behaviour. With g++ 11 -O2 it prints "waiter sees data=0" immediately; other compilers or flags may instead spin forever.
```

**Explanation:**
- `locked` and `data` are shared without atomics or locks: a data race, so the optimizer may assume no other thread modifies them.
- The loop body has no side effects, and C++ lets the compiler assume such a loop terminates (forward-progress rule). GCC 11 at `-O2` deletes the loop completely: `waiter` prints at once, long before `main` writes `42`.
- Another legal outcome: load `locked` once and turn the loop into `for (;;) {}`, a hang. Both are "correct" compilations of a racy program.
- `volatile bool` would force a reload each iteration but still gives no ordering for `data` and no atomic RMW for building a real lock: still a data race.
- **Key Concept:** Any flag shared between threads must be `std::atomic` (or protected by a lock); with release/acquire it also publishes the data written before it.
- Deep dive: Topic 7, Spinlocks, Busy-Waiting and Backoff

**Fixed Version:**
```cpp
#include <atomic>
#include <chrono>
#include <iostream>
#include <thread>

std::atomic<bool> locked{true};
int data = 0;

void waiter() {
    while (locked.load(std::memory_order_acquire)) {
        // spin until main releases
    }
    std::cout << "waiter sees data=" << data << '\n';   // guaranteed 42
}

int main() {
    std::thread t(waiter);
    std::this_thread::sleep_for(std::chrono::milliseconds(100));
    data = 42;
    locked.store(false, std::memory_order_release);
    t.join();
}
```

---

#### Q18
```cpp
// Q: What does this print on x86-64 with GCC, and what does it mean for a "lock-free" tagged-pointer stack?
#include <atomic>
#include <cstdint>
#include <iostream>

struct Node;
struct TaggedPtr { Node* ptr; std::uint64_t tag; };

int main() {
    std::cout << sizeof(TaggedPtr) << ' ' << std::boolalpha
              << std::atomic<TaggedPtr>::is_always_lock_free << ' '
              << std::atomic<std::uint64_t>::is_always_lock_free << '\n';
}
```

**Answer:**
```
16 false true
```

**Explanation:**
- `{pointer, 64-bit tag}` is 16 bytes. The CPU has `cmpxchg16b`, but GCC routes 16-byte atomics through `libatomic`, reports them as not always lock-free, and requires `-latomic` to link any operation on them.
- A Treiber stack built on `std::atomic<TaggedPtr>` therefore may contain a hidden lock: not lock-free, even though the source has no mutex.
- Alternatives that fit in one lock-free 8-byte word: a 32-bit node index plus a 32-bit tag (preallocated pool), or a tag in the unused upper bits of a 48-bit x86-64 pointer (narrower, can wrap).
- Clang may inline `cmpxchg16b` with `-mcx16`; results are compiler and flag dependent, so assert it: `static_assert(std::atomic<Head>::is_always_lock_free);`.
- **Key Concept:** Verify the lock-freedom of the atomics your algorithm depends on.
- Deep dive: Topic 8, Lock-Free Programming and the ABA Problem

---

#### Q19
```cpp
// Q: What does this program print? (single-threaded on purpose: check the full test)
#include <array>
#include <cstddef>
#include <iostream>

constexpr std::size_t N = 4, MASK = N - 1;
std::array<int, N> buf{};
std::size_t head = 0, tail = 0;   // wrapped on use

bool full()  { return (tail & MASK) + 1 == (head & MASK); }
bool empty() { return (tail & MASK) == (head & MASK); }

bool push(int v) {
    if (full()) return false;
    buf[tail & MASK] = v;
    ++tail;
    return true;
}

int main() {
    int accepted = 0;
    for (int i = 1; i <= 4; ++i) accepted += push(i);
    std::cout << "accepted=" << accepted << " empty=" << std::boolalpha << empty() << '\n';
}
```

**Answer:**
```
accepted=4 empty=true
```

**Explanation:**
- `full()` is checked with `tail` at 0, 1, 2, 3. At `tail == 3`, `(3) + 1 == 0` compares `4 == 0`: false, so the 4th push is accepted.
- `tail` becomes 4, `4 & MASK == 0 == head & MASK`, so the queue that holds 4 items now reports **empty**. The consumer would never read them.
- The masked left side can reach `N`, which no masked value ever equals; the test can never fire at the wrap point.
- **Key Concept:** Use monotonic indices (`full = tail - head == N`) or wrapped indices with one sacrificed slot (`full = ((tail + 1) & MASK) == head`).
- Deep dive: Topic 9, Concurrent Queues and Ring Buffers

**Fixed Version:**
```cpp
#include <array>
#include <cstddef>
#include <iostream>

constexpr std::size_t N = 4, MASK = N - 1;
std::array<int, N> buf{};
std::size_t head = 0, tail = 0;   // monotonic, masked only when indexing

bool full()  { return tail - head == N; }
bool empty() { return tail == head; }

bool push(int v) {
    if (full()) return false;
    buf[tail & MASK] = v;
    ++tail;
    return true;
}

int main() {
    int accepted = 0;
    for (int i = 1; i <= 5; ++i) accepted += push(i);
    std::cout << "accepted=" << accepted << " empty=" << std::boolalpha << empty() << '\n';
    // prints: accepted=4 empty=false
}
```

---

#### Q20
```cpp
// Q: What does this program print on x86-64 with GCC or Clang? Which layout avoids false sharing?
#include <atomic>
#include <cstddef>
#include <iostream>

struct Packed {
    std::atomic<std::size_t> head{0};
    std::atomic<std::size_t> tail{0};
};

struct HeadOnly {
    alignas(64) std::atomic<std::size_t> head{0};
    std::atomic<std::size_t> tail{0};
};

struct Both {
    alignas(64) std::atomic<std::size_t> head{0};
    alignas(64) std::atomic<std::size_t> tail{0};
};

int main() {
    std::cout << "Packed   " << sizeof(Packed) << '\n'
              << "HeadOnly " << sizeof(HeadOnly) << '\n'
              << "Both     " << sizeof(Both) << '\n';
}
```

**Answer:**
```
Packed   16
HeadOnly 64
Both     128
```

**Explanation:**
- `Packed`: both 8-byte atomics share one cache line.
- `HeadOnly`: the struct is 64-byte aligned and padded to 64, but `tail` sits at offset 8, on the **same** line as `head`. Still false sharing.
- `Both`: `tail` starts at offset 64, a different line. Only this layout separates the producer-written and consumer-written indices.
- None of these layouts changes synchronization; the atomics and memory orders do that.
- **Key Concept:** `alignas` aligns the start of one member; give every independently written hot variable its own line.
- Deep dive: Topic 9, Concurrent Queues and Ring Buffers

---

#### Q21
```cpp
// Q: What does this program print?
#include <array>
#include <iostream>
#include <thread>

thread_local int counter = 0;

void foo() { ++counter; }

int main() {
    std::array<int, 3> result{};
    std::array<std::thread, 3> ts;
    for (int i = 0; i < 3; ++i)
        ts[i] = std::thread([i, &result] {
            for (int k = 0; k < 100; ++k) foo();
            result[i] = counter;
        });
    for (auto& t : ts) t.join();

    std::cout << result[0] << ' ' << result[1] << ' ' << result[2] << '\n';
    std::cout << counter << '\n';
}
```

**Answer:**
```
100 100 100
0
```

**Explanation:**
- Each thread has its own `counter`, starting at 0, incremented 100 times by that thread only.
- No data race: no instance of `counter` is touched by two threads. `result[i]` slots are distinct objects, read after `join()`.
- `main`'s own instance was never incremented.
- **Key Concept:** thread_local means one instance per thread, not one shared variable.
- Deep dive: Topic 10, async, future/promise, thread_local and call_once

---

#### Q22
```cpp
// Q: What does this program print, and in what order?
#include <chrono>
#include <future>
#include <iostream>
#include <thread>

int main() {
    std::cout << "start\n";
    std::async(std::launch::async, [] {
        std::this_thread::sleep_for(std::chrono::milliseconds(200));
        std::cout << "task finished\n";
    });
    std::cout << "after async\n";
}
```

**Answer:**
```
start
task finished
after async
```
(GCC also warns: ignoring return value of 'std::async', declared with attribute 'nodiscard'.)

**Explanation:**
- `std::async` returns a temporary `std::future`. It is destroyed at the end of the full expression.
- The last future of an async-launched task **blocks in its destructor** until the task completes.
- So the "background" task runs to completion before `after async` is printed. Deterministic.
- **Key Concept:** A discarded std::async future makes the call synchronous.
- Deep dive: Topic 10, async, future/promise, thread_local and call_once

**Fixed Version:**
```cpp
#include <chrono>
#include <future>
#include <iostream>
#include <thread>

int main() {
    std::cout << "start\n";
    auto fut = std::async(std::launch::async, [] {
        std::this_thread::sleep_for(std::chrono::milliseconds(200));
        std::cout << "task finished\n";
    });
    std::cout << "after async\n"; // now printed first (task sleeps 200 ms)
    fut.get();
}
```

---

#### Q23
```cpp
// Q: What does this program print?
#include <future>
#include <iostream>
#include <thread>

int main() {
    std::promise<int> p;
    std::future<int> f = p.get_future();

    std::thread producer([pr = std::move(p)](bool fail) mutable {
        if (fail) return;            // early exit: forgot to set the promise
        pr.set_value(1);
    }, true);

    try {
        std::cout << f.get() << '\n';
    } catch (const std::future_error& e) {
        std::cout << "future_error: " << e.what() << '\n';
        std::cout << std::boolalpha
                  << (e.code() == std::future_errc::broken_promise) << '\n';
    }
    producer.join();
}
```

**Answer:**
```
future_error: std::future_error: Broken promise
true
```

**Explanation:**
- The promise was moved into the lambda, so it is destroyed with the thread's callable after the early `return`.
- A promise destroyed without a result stores `future_error(broken_promise)` and makes the state ready.
- `get()` wakes up and throws. No hang.
- The `what()` text is libstdc++'s; the error code is portable.
- **Key Concept:** An abandoned promise breaks loudly instead of leaving waiters stuck.
- Deep dive: Topic 10, async, future/promise, thread_local and call_once

---

#### Q24
```cpp
// Q: Find the bug. Main wants to wait for both workers in EVERY round.
#include <iostream>
#include <latch>
#include <thread>

int main() {
    std::latch done{2};
    int results[2] = {};

    for (int round = 1; round <= 3; ++round) {
        std::thread a([&] { results[0] = round * 10; done.count_down(); });
        std::thread b([&] { results[1] = round * 10 + 1; done.count_down(); });
        done.wait();
        std::cout << "round " << round << ": " << results[0] + results[1] << '\n';
        a.join();
        b.join();
    }
}
```

**Answer:**
```
Round 1 is correct ("round 1: 21"). From round 2 on: undefined behaviour (count_down() on a latch
already at 0, data race on results). Observed with GCC 11: "round 1: 21", "round 2: 21" (stale), then a hang.
```

**Explanation:**
- A latch is one-shot. After round 1 the counter is 0 and stays 0.
- Round 2: `done.wait()` returns immediately, so main reads `results` while the workers may still be writing them: data race (TSan reports it); the printed sums may be stale.
- Each worker's `count_down()` now violates the precondition `update <= counter`: undefined behaviour. libstdc++ simply drives the counter negative; a later `wait()` then waits for a 0 that never comes, which is why the observed run hangs in round 3.
- **Key Concept:** Latches cannot be reset: create one per round, or use `std::barrier` for repeated phases.
- Deep dive: Topic 11, C++20 Synchronization: latch, barrier, semaphore, jthread

**Fixed Version:**
```cpp
#include <iostream>
#include <latch>
#include <thread>

int main() {
    int results[2] = {};

    for (int round = 1; round <= 3; ++round) {
        std::latch done{2};                     // fresh latch per round
        std::jthread a([&] { results[0] = round * 10; done.count_down(); });
        std::jthread b([&] { results[1] = round * 10 + 1; done.count_down(); });
        done.wait();
        std::cout << "round " << round << ": " << results[0] + results[1] << '\n';
    }   // jthreads join before the latch is destroyed (declared after it)
}
// round 1: 21
// round 2: 41
// round 3: 61
```

---

#### Q25
```cpp
// Q: What does this program print? What would happen with std::thread instead of std::jthread?
#include <chrono>
#include <iostream>
#include <stop_token>
#include <thread>

int main() {
    {
        std::jthread worker([](std::stop_token st) {
            int ticks = 0;
            while (!st.stop_requested()) {
                std::this_thread::sleep_for(std::chrono::milliseconds(1));
                ++ticks;
            }
            std::cout << "worker: stop seen\n";
        });
        std::this_thread::sleep_for(std::chrono::milliseconds(20));
        std::cout << "leaving scope\n";
    }
    std::cout << "after scope\n";
}
```

**Answer:**
```
leaving scope
worker: stop seen
after scope
```

**Explanation:**
- At the closing brace `~jthread` runs: `request_stop()`, then `join()`.
- The worker notices `stop_requested()` within about 1 ms, prints, and returns; only then does `join()` return and `main` prints "after scope".
- `jthread` passes its own stop token because the lambda's first parameter is a `std::stop_token`.
- With `std::thread` (and a lambda without the token parameter) the destructor of a joinable thread calls `std::terminate`: the program aborts right after "leaving scope".
- **Key Concept:** `jthread` = request stop + join in the destructor; cancellation is cooperative (the loop must check the token).
- Deep dive: Topic 11, C++20 Synchronization: latch, barrier, semaphore, jthread

---
