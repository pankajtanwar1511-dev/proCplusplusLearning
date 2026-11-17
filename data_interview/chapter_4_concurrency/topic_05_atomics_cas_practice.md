## TOPIC: std::atomic and Compare-and-Swap

### PRACTICE_TASKS: Output Prediction and Bug Hunting

#### Q1
```cpp
// Q: What values can this program print? Is there a data race?
#include <atomic>
#include <iostream>
#include <thread>

std::atomic<int> counter{0};

void work() {
    for (int i = 0; i < 100000; ++i) {
        int v = counter.load();
        counter.store(v + 1);
    }
}

int main() {
    std::thread a(work), b(work);
    a.join();
    b.join();
    std::cout << counter.load() << '\n';
}
```

**Answer:**
```
Any value from 2 to 200000; typically well below 200000. No data race (no UB): it is a race condition that loses updates.
```

**Explanation:**
- `load` and `store` are each atomic, so there is no data race and no torn value.
- The increment as a whole is not atomic: both threads can load the same value and both store `v + 1`.
- Why the minimum is 2: A loads 0 and pauses; B does 99999 increments; A stores 1; B loads 1 and pauses; A finishes its remaining 99999 iterations; B stores 2.
- The local `v` is not the problem: it is private to each thread. The gap between the two atomic operations is.
- **Key Concept:** Two atomic operations are not one atomic operation.

**Fixed Version:**
```cpp
#include <atomic>
#include <iostream>
#include <thread>

std::atomic<int> counter{0};

void work() {
    for (int i = 0; i < 100000; ++i) {
        counter.fetch_add(1);          // one atomic read-modify-write
    }
}

int main() {
    std::thread a(work), b(work);
    a.join();
    b.join();
    std::cout << counter.load() << '\n';   // always 200000
}
```

---

#### Q2
```cpp
// Q: What is the minimum and maximum value printed? Is this undefined behaviour?
#include <atomic>
#include <iostream>
#include <thread>

std::atomic<int> counter{0};

int main() {
    auto work = [] { for (int i = 0; i < 1000; ++i) ++counter; };
    std::thread t1(work), t2(work);
    t1.join();
    t2.join();
    std::cout << counter << '\n';
}
```

**Answer:**
```
2000
```

**Explanation:**
- Minimum = maximum = 2000. No data race.
- `++counter` on a `std::atomic<int>` is an atomic read-modify-write (equivalent to `fetch_add(1)` plus 1), not a separate load and store.
- A very common wrong answer is "undefined, `++` is not atomic even on an atomic variable". That is true for a plain `int`, not for `std::atomic<int>`.
- Atomic operators on `std::atomic<int>`: `++`, `--`, `+=`, `-=`, `&=`, `|=`, `^=`.
- **Key Concept:** `std::atomic` overloads the compound operators as atomic RMWs.

---

#### Q3
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

#### Q4
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

---

#### Q5
```cpp
// Q: Find the bug. What can this print?
#include <atomic>
#include <iostream>
#include <thread>
#include <vector>

std::atomic<int> counter{0};

void increment() {
    int expected = counter.load();
    int desired = expected + 1;
    while (!counter.compare_exchange_weak(expected, desired)) {
        // retry
    }
}

int main() {
    std::vector<std::thread> ts;
    for (int t = 0; t < 4; ++t)
        ts.emplace_back([] { for (int i = 0; i < 100000; ++i) increment(); });
    for (auto& t : ts) t.join();
    std::cout << counter << '\n';
}
```

**Answer:**
```
Bug: desired is computed once, outside the loop. The program prints a run-dependent value below 400000 (and the counter can even move backwards during the run).
```

**Explanation:**
- Suppose a thread reads 5, so `desired = 6`. Other threads push the counter to 9.
- The CAS fails and refreshes `expected = 9`, but `desired` is still 6.
- Next attempt: CAS(9 to 6) succeeds. The counter **goes backwards**, erasing 3 increments.
- No data race and no UB; the CAS loop is just computing the new value from stale data.
- In a test run with 4 threads it printed well below 400000.
- **Key Concept:** In a CAS loop, recompute `desired` from the refreshed `expected` on every iteration.

**Fixed Version:**
```cpp
#include <atomic>
#include <iostream>
#include <thread>
#include <vector>

std::atomic<int> counter{0};

void increment() {
    int expected = counter.load();
    while (!counter.compare_exchange_weak(expected, expected + 1)) {
        // expected refreshed; desired recomputed by the next call
    }
}

int main() {
    std::vector<std::thread> ts;
    for (int t = 0; t < 4; ++t)
        ts.emplace_back([] { for (int i = 0; i < 100000; ++i) increment(); });
    for (auto& t : ts) t.join();
    std::cout << counter << '\n';   // always 400000
}
```

---

#### Q6
```cpp
// Q: Built with g++ -O2, does this program terminate? Is it correct?
#include <chrono>
#include <iostream>
#include <thread>

bool running = true;
long work = 0;

int main() {
    std::thread worker([] {
        while (running) { ++work; }
    });
    std::this_thread::sleep_for(std::chrono::milliseconds(100));
    running = false;
    worker.join();
    std::cout << "stopped\n";
}
```

**Answer:**
```
Data race on running: undefined behaviour. With GCC 11 at -O2 it hangs forever (nothing printed); at -O0 it happens to print "stopped".
```

**Explanation:**
- `running` is written by `main` and read by `worker` with no synchronization, and it is not atomic: data race, UB.
- The optimizer may assume no other thread modifies `running` during the loop, so it reads it once and turns the loop into `if (running) for (;;) ++work;`. Verified: the `-O2` binary never stops.
- "A bool store is atomic on the CPU, it will be seen after a few iterations" is the classic wrong intuition: the C++ memory model, not the CPU, decides what the compiler may do.
- `volatile bool` would usually stop the hoisting but is still a data race in C++.
- `relaxed` is enough here because the flag publishes no other data; `join()` synchronizes the final read of `work`.
- **Key Concept:** Shared flags must be `std::atomic`, even a single `bool`.

**Fixed Version:**
```cpp
#include <atomic>
#include <chrono>
#include <iostream>
#include <thread>

std::atomic<bool> running{true};
long work = 0;                       // only touched by worker until join()

int main() {
    std::thread worker([] {
        while (running.load(std::memory_order_relaxed)) { ++work; }
    });
    std::this_thread::sleep_for(std::chrono::milliseconds(100));
    running.store(false, std::memory_order_relaxed);
    worker.join();
    std::cout << "stopped\n";
}
```

---

#### Q7
```cpp
// Q: What does this program print?
#include <atomic>
#include <iostream>

int main() {
    std::atomic<double> d{-0.0};
    double expected = 0.0;

    std::cout << std::boolalpha << (expected == d.load()) << '\n';
    bool ok = d.compare_exchange_strong(expected, 1.0);
    std::cout << ok << ' ' << d.load() << ' ' << expected << '\n';
}
```

**Answer:**
```
true
false -0 -0
```

**Explanation:**
- `0.0 == -0.0` is `true` under IEEE comparison.
- `compare_exchange_strong` compares the **value representation** (bitwise, like `memcmp`), not `operator==`. `+0.0` and `-0.0` have different sign bits, so the CAS fails.
- On failure, `expected` receives the current value `-0.0`; `d` is unchanged.
- The reverse surprise also exists: a NaN loaded from the atomic matches itself in CAS although `NaN == NaN` is false.
- **Key Concept:** CAS is bitwise; floating point and padded structs can surprise you.

---

#### Q8
```cpp
// Q: This prints 1 on x86. What is the latent bug?
#include <atomic>
#include <iostream>

std::atomic<bool> initialized{false};
int init_count = 0;

void init_once() {
    bool expected = false;
    if (initialized.compare_exchange_weak(expected, true)) {
        ++init_count;               // the one-time initialization
    }
}

int main() {
    init_once();
    init_once();
    std::cout << init_count << '\n';
}
```

**Answer:**
```
1 on x86-64, but the code is wrong: compare_exchange_weak may fail spuriously, so on LL/SC CPUs (ARM without LSE, POWER, RISC-V) the initialization can be skipped entirely (prints 0).
```

**Explanation:**
- `weak` may return `false` even though `initialized == false`. There is no retry loop, so a spurious failure means nobody ever initializes.
- x86 `lock cmpxchg` never fails spuriously, which is why tests on a laptop pass and the bug appears on ARM servers or phones.
- Use `compare_exchange_strong` for one-shot decisions.
- Second design issue: other threads that lose the CAS return immediately, possibly before the winner has finished initializing. If callers must wait for initialization, use `std::call_once` or a static local.
- **Key Concept:** weak belongs in a loop; strong for a single decisive attempt.

**Fixed Version:**
```cpp
#include <atomic>
#include <iostream>

std::atomic<bool> initialized{false};
int init_count = 0;

void init_once() {
    bool expected = false;
    if (initialized.compare_exchange_strong(expected, true)) {   // no spurious failure
        ++init_count;
    }
}

int main() {
    init_once();
    init_once();
    std::cout << init_count << '\n';   // 1 on every architecture
}
```

---

#### Q9
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

---

#### Q10
```cpp
// Q: Is withdraw() thread-safe? What final balances are possible?
#include <atomic>
#include <iostream>
#include <thread>

std::atomic<int> balance{100};
std::atomic<bool> active{true};

void withdraw(int amount) {
    if (active.load() && balance.load() >= amount) {
        balance -= amount;
    }
}

int main() {
    std::thread t1(withdraw, 80), t2(withdraw, 80);
    t1.join();
    t2.join();
    std::cout << balance << '\n';
}
```

**Answer:**
```
Not thread-safe. Prints 20 (one withdrawal) or -60 (both threads passed the check before either subtracted).
```

**Explanation:**
- Every individual operation is atomic, so there is no data race.
- The invariant "never go negative" needs check and act to be one atomic step. Both threads can read 100, both pass `>= 80`, both subtract.
- Making more variables atomic does not help; the problem is the compound operation.
- Fix options: a mutex around the whole check-and-update (needed if `active` must be part of the decision), or a CAS loop on `balance` that re-checks the condition against each refreshed `expected`.
- **Key Concept:** Atomics protect single operations; invariants spanning several steps or variables need a mutex or a single-word CAS loop.

**Fixed Version:**
```cpp
#include <atomic>
#include <iostream>
#include <thread>

std::atomic<int> balance{100};

bool withdraw(int amount) {
    int expected = balance.load();
    do {
        if (expected < amount) return false;          // decide on the fresh value
    } while (!balance.compare_exchange_weak(expected, expected - amount));
    return true;
}

int main() {
    std::thread t1(withdraw, 80), t2(withdraw, 80);
    t1.join();
    t2.join();
    std::cout << balance << '\n';   // always 20
}
```

---

#### Q11
```cpp
// Q: Does this compile? If not, which line fails and why?
#include <atomic>
#include <iostream>

int main() {
    std::atomic<int> a = 5;     // line A
    std::atomic<int> b = a;     // line B
    std::cout << b << '\n';
}
```

**Answer:**
```
Compile error on line B: use of deleted copy constructor std::atomic<int>::atomic(const std::atomic<int>&). Line A is fine in C++17 and later.
```

**Explanation:**
- `std::atomic` deletes its copy constructor and copy assignment. A copy would be a load from `a` and a store to `b`: two operations that cannot be one atomic step, so the library refuses to pretend.
- Line A uses the `atomic(int)` constructor; with C++17 guaranteed copy elision no copy/move constructor is needed. (In C++11/14 line A was ill-formed.)
- Confirmed with GCC 11: `error: use of deleted function 'std::atomic<int>::atomic(const std::atomic<int>&)'`.
- To copy the value: `std::atomic<int> b{a.load()};`.
- **Key Concept:** Atomics are non-copyable, non-movable objects; copy the value explicitly.

**Fixed Version:**
```cpp
#include <atomic>
#include <iostream>

int main() {
    std::atomic<int> a = 5;
    std::atomic<int> b{a.load()};   // explicit load of the value
    std::cout << b << '\n';         // 5
}
```

---

#### Q12
```cpp
// Q: What does this program print?
#include <atomic>
#include <iostream>

int main() {
    std::atomic<int> x{5};
    int a = x++;
    int b = ++x;
    int c = x.fetch_add(10);
    int d = (x += 3);
    int e = x.exchange(0);
    std::cout << a << ' ' << b << ' ' << c << ' ' << d << ' ' << e << ' ' << x << '\n';
}
```

**Answer:**
```
5 7 7 20 20 0
```

**Explanation:**
- `x++` returns the old value (5), `x` becomes 6.
- `++x` returns the new value (7).
- `fetch_add(10)` returns the **old** value (7), `x` becomes 17.
- `x += 3` returns the **new** value (20), by value, not a reference.
- `exchange(0)` returns the old value (20) and stores 0.
- All `fetch_*` and `exchange` return the previous value; compound assignment operators return the result.
- **Key Concept:** Know which atomic operations return old vs new values.

---

#### Q13
```cpp
// Q: Does this spinlock provide mutual exclusion? What can it print?
#include <atomic>
#include <iostream>
#include <thread>

std::atomic_flag flag;      // C++20: initially clear
long shared = 0;

void lock()   { while (!flag.test_and_set()) {} }
void unlock() { flag.clear(); }

int main() {
    auto work = [] {
        for (int i = 0; i < 100000; ++i) { lock(); ++shared; unlock(); }
    };
    std::thread t1(work), t2(work);
    t1.join();
    t2.join();
    std::cout << shared << '\n';
}
```

**Answer:**
```
No mutual exclusion: data race on shared (undefined behaviour). Typically prints less than 200000.
```

**Explanation:**
- `test_and_set()` returns the **previous** value. The lock is acquired when it returns `false`.
- With the inverted condition `while (!flag.test_and_set())`:
  - If the flag was clear, the call returns `false`, the loop continues, the next call returns `true` and the loop exits: the thread "acquires" a lock it set itself.
  - If another thread holds the lock, the call returns `true` and the loop exits immediately: the thread enters anyway.
- So two threads can be inside the critical section at once, and `++shared` on a plain `long` is a data race.
- **Key Concept:** `test_and_set` returns the old value: spin while it returns `true`.

**Fixed Version:**
```cpp
#include <atomic>
#include <iostream>
#include <thread>

std::atomic_flag flag;
long shared = 0;

void lock()   { while (flag.test_and_set()) { while (flag.test()) {} } }  // spin while held
void unlock() { flag.clear(); }

int main() {
    auto work = [] {
        for (int i = 0; i < 100000; ++i) { lock(); ++shared; unlock(); }
    };
    std::thread t1(work), t2(work);
    t1.join();
    t2.join();
    std::cout << shared << '\n';   // 200000
}
```

---

#### Q14
```cpp
// Q: What does this print? Is there undefined behaviour?
#include <atomic>
#include <climits>
#include <iostream>

int main() {
    std::atomic<int> a{INT_MAX};
    a.fetch_add(1);
    std::cout << a.load() << '\n';

    std::atomic<unsigned> u{0};
    u.fetch_sub(1);
    std::cout << u.load() << '\n';
}
```

**Answer:**
```
-2147483648
4294967295
```

**Explanation:**
- For a plain `int`, `INT_MAX + 1` is undefined behaviour.
- For atomic signed integers the standard defines arithmetic as if performed on the corresponding unsigned type and converted back: two's complement wraparound, **no UB**.
- Unsigned atomics wrap as usual (`0 - 1` gives `UINT_MAX` = 4294967295 with 32-bit `unsigned`).
- Practical consequence: a wrapping atomic sequence number is well-defined, but your logic must still handle the wrap.
- **Key Concept:** Atomic integer arithmetic wraps without UB, unlike plain signed arithmetic.
