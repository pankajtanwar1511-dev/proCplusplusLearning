## TOPIC: Spinlocks, Busy-Waiting and Backoff

### PRACTICE_TASKS: Output Prediction and Bug Hunting

#### Q1
```cpp
// Q: Find the bug. The test prints counter=400000 on an x86 laptop every time.
#include <atomic>
#include <iostream>
#include <mutex>
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

int main() {
    SpinLock lock;
    long counter = 0;
    std::vector<std::thread> ts;
    for (int t = 0; t < 4; ++t)
        ts.emplace_back([&] {
            for (int i = 0; i < 100000; ++i) {
                std::lock_guard<SpinLock> g(lock);
                ++counter;
            }
        });
    for (auto& t : ts) t.join();
    std::cout << "counter=" << counter << '\n';
}
```

**Answer:**
```
Data race on `counter`: undefined behaviour. It typically still prints counter=400000 on x86, which hides the bug.
```

**Explanation:**
- The flag itself is fine: only one thread at a time sees `exchange` return `false`.
- But with `relaxed`, the unlock does not synchronize-with the next lock, so there is no happens-before between one holder's `++counter` and the next holder's read. Conflicting non-atomic accesses without happens-before = data race.
- The compiler may also move `++counter` across relaxed atomic operations.
- x86 hardware is strongly ordered and GCC rarely moves code across atomics, so tests pass; on ARM/POWER, or with a different compiler, updates can be lost.
- ThreadSanitizer reports a data race on `counter` for this program; the fixed version is clean.
- **Key Concept:** A lock needs acquire on lock and release on unlock; atomicity of the flag alone does not protect the data.

**Fixed Version:**
```cpp
#include <atomic>
#include <iostream>
#include <mutex>
#include <thread>
#include <vector>

class SpinLock {
    std::atomic<bool> locked_{false};
public:
    void lock() {
        while (locked_.exchange(true, std::memory_order_acquire)) {}
    }
    void unlock() { locked_.store(false, std::memory_order_release); }
};

int main() {
    SpinLock lock;
    long counter = 0;
    std::vector<std::thread> ts;
    for (int t = 0; t < 4; ++t)
        ts.emplace_back([&] {
            for (int i = 0; i < 100000; ++i) {
                std::lock_guard<SpinLock> g(lock);
                ++counter;
            }
        });
    for (auto& t : ts) t.join();
    std::cout << "counter=" << counter << '\n';
}
```

---

#### Q2
```cpp
// Q: What does this program print?
#include <atomic>
#include <iostream>
#include <mutex>
#include <thread>
#include <vector>

class CasSpinLock {
    std::atomic<bool> locked_{false};
public:
    void lock() {
        bool expected = false;
        while (!locked_.compare_exchange_weak(expected, true,
                                              std::memory_order_acquire,
                                              std::memory_order_relaxed)) {
            // spin
        }
    }
    void unlock() { locked_.store(false, std::memory_order_release); }
};

int main() {
    CasSpinLock lock;
    long counter = 0;
    std::vector<std::thread> ts;
    for (int t = 0; t < 4; ++t)
        ts.emplace_back([&] {
            for (int i = 0; i < 1000000; ++i) {
                std::lock_guard<CasSpinLock> g(lock);
                ++counter;
            }
        });
    for (auto& t : ts) t.join();
    std::cout << "counter=" << counter << '\n';
}
```

**Answer:**
```
Mutual exclusion is broken (data race, undefined behaviour). It typically prints a value below 4000000, different on every run.
```

**Explanation:**
- On failure, `compare_exchange_weak` stores the **current** value into `expected`. Once the lock is seen held, `expected` becomes `true`.
- The next iteration is `CAS(expected = true → true)`, which **succeeds** while another thread holds the lock. Two threads are now in the critical section.
- Lost `++counter` updates show up as a final count below 4000000 (for example `counter=3999xxx` or much lower).
- ThreadSanitizer reports the race on `counter`.
- **Key Concept:** In a CAS loop, reset `expected` on every failure (or use `exchange`, which has no `expected`).

**Fixed Version:**
```cpp
#include <atomic>
#include <iostream>
#include <mutex>
#include <thread>
#include <vector>

class CasSpinLock {
    std::atomic<bool> locked_{false};
public:
    void lock() {
        bool expected = false;
        while (!locked_.compare_exchange_weak(expected, true,
                                              std::memory_order_acquire,
                                              std::memory_order_relaxed)) {
            expected = false;                              // reset after failure
            while (locked_.load(std::memory_order_relaxed)) {}   // TTAS while held
        }
    }
    void unlock() { locked_.store(false, std::memory_order_release); }
};

int main() {
    CasSpinLock lock;
    long counter = 0;
    std::vector<std::thread> ts;
    for (int t = 0; t < 4; ++t)
        ts.emplace_back([&] {
            for (int i = 0; i < 1000000; ++i) {
                std::lock_guard<CasSpinLock> g(lock);
                ++counter;
            }
        });
    for (auto& t : ts) t.join();
    std::cout << "counter=" << counter << '\n';
}
```

---

#### Q3
```cpp
// Q: Is this "test-and-test-and-set" spinlock correct? What does it print?
#include <atomic>
#include <iostream>
#include <mutex>
#include <thread>
#include <vector>

class TtasLock {
    std::atomic<bool> locked_{false};
public:
    void lock() {
        while (locked_.load(std::memory_order_relaxed)) {}   // test
        locked_.store(true, std::memory_order_relaxed);      // "set"
        std::atomic_thread_fence(std::memory_order_acquire);
    }
    void unlock() { locked_.store(false, std::memory_order_release); }
};

int main() {
    TtasLock lock;
    long counter = 0;
    std::vector<std::thread> ts;
    for (int t = 0; t < 4; ++t)
        ts.emplace_back([&] {
            for (int i = 0; i < 1000000; ++i) {
                std::lock_guard<TtasLock> g(lock);
                ++counter;
            }
        });
    for (auto& t : ts) t.join();
    std::cout << "counter=" << counter << '\n';
}
```

**Answer:**
```
Not correct: two threads can enter together (data race, undefined behaviour). It typically prints a value below 4000000.
```

**Explanation:**
- "Load, then store" is a check-then-act sequence, not an atomic RMW. Two threads can both load `false` and both store `true`.
- Every individual operation is atomic, yet the **pair** is not; fences cannot fix that.
- In real TTAS the load is only a hint; acquisition must still be an RMW (`exchange` or CAS) that can fail.
- **Key Concept:** Test with a load, set with an RMW.

**Fixed Version:**
```cpp
#include <atomic>
#include <iostream>
#include <mutex>
#include <thread>
#include <vector>

class TtasLock {
    std::atomic<bool> locked_{false};
public:
    void lock() {
        while (true) {
            while (locked_.load(std::memory_order_relaxed)) {}            // test
            if (!locked_.exchange(true, std::memory_order_acquire)) return; // test-and-set
        }
    }
    void unlock() { locked_.store(false, std::memory_order_release); }
};

int main() {
    TtasLock lock;
    long counter = 0;
    std::vector<std::thread> ts;
    for (int t = 0; t < 4; ++t)
        ts.emplace_back([&] {
            for (int i = 0; i < 1000000; ++i) {
                std::lock_guard<TtasLock> g(lock);
                ++counter;
            }
        });
    for (auto& t : ts) t.join();
    std::cout << "counter=" << counter << '\n';
}
```

---

#### Q4
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

#### Q5
```cpp
// Q: What does this program print?
#include <atomic>
#include <iostream>
#include <stdexcept>

class SpinLock {
    std::atomic_flag flag_;
public:
    void lock() { while (flag_.test_and_set(std::memory_order_acquire)) {} }
    bool try_lock() { return !flag_.test_and_set(std::memory_order_acquire); }
    void unlock() { flag_.clear(std::memory_order_release); }
};

SpinLock lock;
int balance = 100;

void withdraw(int amount) {
    lock.lock();
    if (amount > balance) throw std::runtime_error("insufficient funds");
    balance -= amount;
    lock.unlock();
}

int main() {
    try {
        withdraw(500);
    } catch (const std::exception& e) {
        std::cout << "caught: " << e.what() << '\n';
    }
    bool ok = lock.try_lock();
    std::cout << "try_lock after exception: " << std::boolalpha << ok << '\n';
}
```

**Answer:**
```
caught: insufficient funds
try_lock after exception: false
```

**Explanation:**
- `withdraw` throws between `lock()` and `unlock()`, so `unlock()` never runs.
- The spinlock stays held forever. `try_lock` returns `false`; a real `lock()` call would spin forever and burn a core (unlike a mutex deadlock, which at least sleeps).
- Spinlocks have no owner tracking and no timeout, so this failure is silent.
- **Key Concept:** Always use RAII (`std::lock_guard<SpinLock>`); give your spinlock `lock`/`unlock`/`try_lock` so it works with standard lock wrappers.

**Fixed Version:**
```cpp
#include <atomic>
#include <iostream>
#include <mutex>
#include <stdexcept>

class SpinLock {
    std::atomic_flag flag_;
public:
    void lock() { while (flag_.test_and_set(std::memory_order_acquire)) {} }
    bool try_lock() { return !flag_.test_and_set(std::memory_order_acquire); }
    void unlock() { flag_.clear(std::memory_order_release); }
};

SpinLock lock;
int balance = 100;

void withdraw(int amount) {
    std::lock_guard<SpinLock> g(lock);       // unlocks during stack unwinding
    if (amount > balance) throw std::runtime_error("insufficient funds");
    balance -= amount;
}

int main() {
    try {
        withdraw(500);
    } catch (const std::exception& e) {
        std::cout << "caught: " << e.what() << '\n';
    }
    bool ok = lock.try_lock();
    std::cout << "try_lock after exception: " << std::boolalpha << ok << '\n';
    if (ok) lock.unlock();
}
```

---

#### Q6
```cpp
// Q: Can this program deadlock?
#include <atomic>
#include <iostream>
#include <mutex>

class SpinLock {
    std::atomic_flag flag_;
public:
    void lock() { while (flag_.test_and_set(std::memory_order_acquire)) {} }
    void unlock() { flag_.clear(std::memory_order_release); }
};

SpinLock lock;
int hits = 0;

void log_hit() {
    std::lock_guard<SpinLock> g(lock);
    ++hits;
}

void handle_request() {
    std::lock_guard<SpinLock> g(lock);
    // ... update shared state ...
    log_hit();                 // helper also takes the lock
}

int main() {
    handle_request();
    std::cout << "hits=" << hits << '\n';
}
```

**Answer:**
```
Yes. It self-deadlocks with a single thread: it spins forever at 100% CPU and prints nothing.
```

**Explanation:**
- `handle_request` holds the spinlock; `log_hit` tries to take it again on the same thread.
- A spinlock has no owner, so it cannot detect re-entry; the thread waits for itself forever.
- A `std::mutex` would also deadlock here (undefined behaviour), but typically sleeping; the spinlock burns a core while hung.
- Fix by restructuring: an unlocked internal helper called with the lock already held, or move the call outside the critical section. Recursive locks hide design problems; avoid them.
- **Key Concept:** Spinlocks are never recursive; never call code that may take the same lock while holding it.

**Fixed Version:**
```cpp
#include <atomic>
#include <iostream>
#include <mutex>

class SpinLock {
    std::atomic_flag flag_;
public:
    void lock() { while (flag_.test_and_set(std::memory_order_acquire)) {} }
    void unlock() { flag_.clear(std::memory_order_release); }
};

SpinLock lock;
int hits = 0;

void log_hit_locked() { ++hits; }   // precondition: caller holds `lock`

void log_hit() {
    std::lock_guard<SpinLock> g(lock);
    log_hit_locked();
}

void handle_request() {
    std::lock_guard<SpinLock> g(lock);
    // ... update shared state ...
    log_hit_locked();
}

int main() {
    handle_request();
    log_hit();
    std::cout << "hits=" << hits << '\n';
}
```

---

#### Q7
```cpp
// Q: Does this compile? The spinlock works fine with std::lock_guard elsewhere.
#include <atomic>
#include <mutex>

class SpinLock {
    std::atomic_flag flag_;
public:
    void lock() { while (flag_.test_and_set(std::memory_order_acquire)) {} }
    void unlock() { flag_.clear(std::memory_order_release); }
};

SpinLock a, b;
int x = 0, y = 0;

int main() {
    std::scoped_lock both(a, b);   // lock two spinlocks without deadlock
    ++x;
    ++y;
}
```

**Answer:**
```
Compile error: std::scoped_lock with two locks calls std::lock, which needs try_lock(); SpinLock has no member named 'try_lock'.
```

**Explanation:**
- `std::lock_guard` and single-argument `std::scoped_lock` only need **BasicLockable**: `lock()` and `unlock()`.
- Multi-lock `std::scoped_lock` (and `std::lock`) uses a deadlock-avoidance algorithm: lock one, `try_lock` the others, back off and retry on failure. That needs **Lockable**: `try_lock()` as well.
- Adding `bool try_lock() { return !flag_.test_and_set(std::memory_order_acquire); }` fixes it.
- **Key Concept:** Give custom locks the full `lock`/`try_lock`/`unlock` interface so standard RAII wrappers and `std::lock` work.

**Fixed Version:**
```cpp
#include <atomic>
#include <iostream>
#include <mutex>

class SpinLock {
    std::atomic_flag flag_;
public:
    void lock() { while (flag_.test_and_set(std::memory_order_acquire)) {} }
    bool try_lock() { return !flag_.test_and_set(std::memory_order_acquire); }
    void unlock() { flag_.clear(std::memory_order_release); }
};

SpinLock a, b;
int x = 0, y = 0;

int main() {
    {
        std::scoped_lock both(a, b);
        ++x;
        ++y;
    }
    std::cout << "x=" << x << " y=" << y << '\n';
}
```
