## TOPIC: Deadlocks and Race Conditions - Patterns, Detection, and Prevention

### THEORY_SECTION: Core Concepts and Foundations

#### 1. Race Conditions and Deadlocks - Overview

**Definitions:**

| Concurrency Bug | Definition | Symptom |
|----------------|------------|---------|
| **Race Condition** | Multiple threads access shared mutable state; at least one writes; outcome depends on unpredictable timing | Non-deterministic results, data corruption |
| **Deadlock** | Two or more threads permanently blocked, each waiting for resources held by others | System hang, no progress |

**Key Characteristics:**
- Both manifest as **Heisenbugs** - bugs that disappear when you try to observe them (debugging changes timing)
- Race conditions cause incorrect results
- Deadlocks cause complete program freeze

---

#### 2. Understanding Race Conditions

**At the Machine Level:**

Seemingly atomic operations decompose into multiple instructions:

```cpp
++counter;  // Looks atomic, but...

// Actually executed as:
// 1. LOAD counter into register (R1 = memory[counter])
// 2. INCREMENT register (R1 = R1 + 1)
// 3. STORE register to memory (memory[counter] = R1)
```

**Race Scenario:**

| Time | Thread 1 | Thread 2 | Counter Value |
|------|----------|----------|---------------|
| T0 | - | - | 100 |
| T1 | LOAD (R1=100) | - | 100 |
| T2 | - | LOAD (R2=100) | 100 |
| T3 | INCREMENT (R1=101) | - | 100 |
| T4 | - | INCREMENT (R2=101) | 100 |
| T5 | STORE (101) | - | 101 |
| T6 | - | STORE (101) | 101 |

**Expected: 102, Actual: 101** - Lost one increment

**Common Race Patterns:**

| Pattern | Description | Example |
|---------|-------------|---------|
| **Lost Update** | Concurrent read-modify-write loses changes | Two threads increment same counter |
| **Read-Modify-Write Race** | Multi-step update without atomicity | `counter++`, `balance -= amount` |
| **Check-Then-Act (TOCTOU)** | Condition changes between check and action | `if (cache.empty()) cache.insert()` |
| **Publication Race** | Object published before full initialization | Publishing pointer before constructor completes |

---

#### 3. The Four Coffman Conditions for Deadlock

**All four must hold simultaneously for deadlock to occur:**

| # | Condition | Meaning | Example |
|---|-----------|---------|---------|
| **1** | **Mutual Exclusion** | Resources cannot be shared (only one owner) | Only one thread can hold a mutex |
| **2** | **Hold and Wait** | Hold resources while waiting for others | Holding lock A while waiting for lock B |
| **3** | **No Preemption** | Resources cannot be forcibly taken | Can't force a thread to release a lock |
| **4** | **Circular Wait** | Circular chain of waiting threads | T1→T2→T3→T1 (where → means "waits for") |

**Breaking Any One Condition Prevents Deadlock:**

| Break Which? | How? | Example Technique |
|--------------|------|-------------------|
| Circular Wait | Enforce global lock ordering | Always lock in address order |
| Hold and Wait | Acquire all locks atomically | `std::lock(m1, m2, m3)` |
| No Preemption | Allow timeout-based release | `try_lock_for()` with retry |
| Mutual Exclusion | Use shareable resources | `shared_mutex` for readers |

**ABBA Deadlock Example:**

```cpp
// Thread 1:          Thread 2:
lock(A)              lock(B)
lock(B)  ← waits     lock(A)  ← waits
         DEADLOCK!
```

---

#### 4. Deadlock Strategies

**Three Approaches:**

| Strategy | Description | Pros | Cons |
|----------|-------------|------|------|
| **Prevention** | Design system to never deadlock (break Coffman condition) | No runtime cost, guaranteed safe | Requires design discipline |
| **Avoidance** | Dynamically ensure safe states (Banker's algorithm) | Theoretical elegance | Complex, impractical for general use |
| **Detection + Recovery** | Allow deadlocks, detect (timeouts/graphs), recover (abort/kill) | Flexible | High complexity, performance cost |

**Most Common: Prevention via Lock Ordering**

```cpp
// ✅ Correct: Same order everywhere
Thread 1: lock(A); lock(B);
Thread 2: lock(A); lock(B);  // No deadlock

// ❌ Wrong: Different orders
Thread 1: lock(A); lock(B);
Thread 2: lock(B); lock(A);  // Deadlock!
```

---

#### 5. Mission-Critical Systems Impact

**Autonomous Driving Example:**

| Component | Race Condition Impact | Deadlock Impact |
|-----------|----------------------|-----------------|
| **Sensor Fusion (30Hz)** | Inconsistent world model → wrong obstacle positions | Thread freeze → vehicle uses stale data at 120 km/h |
| **Path Planning (10Hz)** | Erratic path decisions → sudden lane changes | No new paths generated → follows obsolete trajectory |
| **Control Loop (100Hz)** | Inconsistent brake/throttle commands → jerky motion | Complete freeze → loss of vehicle control |

**Why Prevention is Mandatory:**

- **Heisenbugs**: Intermittent failures impossible to reproduce in testing
- **Real-time deadlines**: No time for detection/recovery mechanisms
- **Safety certification (ISO 26262)**: Requires demonstrable absence of data races
- **Production debugging impractical**: Can't add logging when car is at highway speed

**Required Practices:**
- Static analysis during development (ThreadSanitizer)
- Formal verification of lock orderings
- Lock-free algorithms where feasible
- Systematic code reviews for shared data access

---

#### 6. Key Debugging Tools

**Detection Methods:**

| Tool | Type | What It Detects | Overhead | Use Case |
|------|------|----------------|----------|----------|
| **ThreadSanitizer (TSan)** | Dynamic analysis | Data races via happens-before tracking | 5-15x slowdown | Development, CI testing |
| **Helgrind (Valgrind)** | Dynamic analysis | Data races via lock-set algorithm | 20-50x slowdown | Legacy code without recompilation |
| **Timeout Detection** | Runtime check | Potential deadlocks (lock wait > threshold) | Low | Production monitoring |
| **Wait-for Graph** | Runtime analysis | Circular dependencies | Medium | Database systems |

**Best Practice:**
- Use TSan during development and in CI pipeline
- Prevention through design is far superior to runtime detection

---

### EDGE_CASES: Tricky Scenarios and Deep Internals

#### Edge Case 1: Read-Modify-Write Race on "Thread-Safe" Containers

```cpp
std::mutex mtx;
std::unordered_map<int, int> cache;

void increment_cached_value(int key) {
    std::lock_guard<std::mutex> lock(mtx);
    int current = cache[key];  // Read
    // ❌ Lock released here when lock destructs

    // Some computation
    int updated = current + 1;  // Modify

    std::lock_guard<std::mutex> lock2(mtx);
    cache[key] = updated;  // Write
    // ❌ Race! Another thread might have updated cache[key] between locks
}
```

This appears safe (operations are locked) but creates a race because the lock is released between read and write. Another thread can interleave its update, causing lost updates.

**Fix: Extend critical section**
```cpp
void increment_cached_value_safe(int key) {
    std::lock_guard<std::mutex> lock(mtx);
    cache[key]++;  // ✅ Atomic read-modify-write under single lock
}
```

#### Edge Case 2: ABBA Deadlock with Pointer-Based Locking

```cpp
class Account {
public:
    std::mutex mtx;
    int balance;
};

void transfer(Account* from, Account* to, int amount) {
    std::lock_guard<std::mutex> lock1(from->mtx);  // ❌ Order depends on arguments!
    std::lock_guard<std::mutex> lock2(to->mtx);

    from->balance -= amount;
    to->balance += amount;
}

// Thread 1: transfer(&accountA, &accountB, 100)  → locks A, then B
// Thread 2: transfer(&accountB, &accountA, 50)   → locks B, then A  → DEADLOCK
```

The lock order depends on function arguments, creating unpredictable lock ordering across different call sites.

**Fix: Lock by address order**
```cpp
void transfer_safe(Account* from, Account* to, int amount) {
    Account* first = (from < to) ? from : to;  // ✅ Always lock lower address first
    Account* second = (from < to) ? to : from;

    std::lock_guard<std::mutex> lock1(first->mtx);
    std::lock_guard<std::mutex> lock2(second->mtx);

    from->balance -= amount;
    to->balance += amount;
}
```

#### Edge Case 3: Time-of-Check to Time-of-Use (TOCTOU) Race

```cpp
std::mutex mtx;
std::unordered_map<std::string, User*> users;

User* get_user(const std::string& name) {
    std::lock_guard<std::mutex> lock(mtx);
    if (users.find(name) != users.end()) {  // ❌ Check
        return users[name];
    }
    return nullptr;
}

void update_user(const std::string& name) {
    User* user = get_user(name);  // Lock released after return

    if (user != nullptr) {  // ❌ Use - but user might be deleted by another thread!
        user->update();  // Potential use-after-free
    }
}
```

The pointer becomes dangling if another thread removes the user between `get_user()` returning and `user->update()`.

**Fix: Hold lock across check and use**
```cpp
void update_user_safe(const std::string& name) {
    std::lock_guard<std::mutex> lock(mtx);  // ✅ Hold lock for both check and use
    auto it = users.find(name);
    if (it != users.end()) {
        it->second->update();
    }
}
```

#### Edge Case 4: Publish-Subscribe Race with Incomplete Initialization

```cpp
class Config {
public:
    std::vector<int> settings;
    bool ready = false;
};

Config* global_config = nullptr;

void publisher_thread() {
    Config* cfg = new Config();
    cfg->settings = {1, 2, 3, 4, 5};  // Initialize

    global_config = cfg;  // ❌ Publish before ready flag set
    cfg->ready = true;     // Other threads might read settings before this
}

void subscriber_thread() {
    while (global_config == nullptr) {  // Wait for publication
        std::this_thread::yield();
    }

    // ❌ global_config->ready might still be false
    // ❌ settings might not be fully initialized (memory reordering)
    if (global_config->ready) {
        process(global_config->settings);
    }
}
```

Without proper memory ordering, the subscriber might see `global_config` as non-null but with incomplete initialization.

**Fix: Use memory barriers**
```cpp
std::atomic<Config*> global_config{nullptr};

void publisher_thread_safe() {
    Config* cfg = new Config();
    cfg->settings = {1, 2, 3, 4, 5};
    cfg->ready = true;

    global_config.store(cfg, std::memory_order_release);  // ✅ Release barrier
}

void subscriber_thread_safe() {
    Config* cfg = global_config.load(std::memory_order_acquire);  // ✅ Acquire barrier

    while (cfg == nullptr) {
        std::this_thread::yield();
        cfg = global_config.load(std::memory_order_acquire);
    }

    process(cfg->settings);  // Guaranteed fully initialized
}
```

#### Edge Case 5: Livelock - Threads Actively Changing State Without Progress

```cpp
std::atomic<bool> flag1{false};
std::atomic<bool> flag2{false};

void polite_thread1() {
    while (true) {
        flag1 = true;

        if (flag2) {  // If other thread wants access
            flag1 = false;  // ❌ Be polite, back off
            std::this_thread::yield();
            continue;  // Try again
        }

        // Critical section
        break;
    }

    flag1 = false;
}

void polite_thread2() {
    while (true) {
        flag2 = true;

        if (flag1) {
            flag2 = false;  // ❌ Be polite, back off
            std::this_thread::yield();
            continue;
        }

        // Critical section
        break;
    }

    flag2 = false;
}
```

Both threads continuously back off for each other, making progress but never entering the critical section—a livelock.

**Fix: Use proper synchronization**
```cpp
std::mutex mtx;

void proper_thread() {
    std::lock_guard<std::mutex> lock(mtx);  // ✅ Guaranteed progress
    // Critical section
}
```

---

### CODE_EXAMPLES: Practical Demonstrations

#### Example 1: Classic Data Race - Lost Updates

```cpp
#include <iostream>
#include <thread>
#include <vector>

int shared_counter = 0;  // ❌ No synchronization

void increment_race() {
    for (int i = 0; i < 100000; ++i) {
        ++shared_counter;  // Read-modify-write race
    }
}

int main() {
    std::vector<std::thread> threads;
    for (int i = 0; i < 10; ++i) {
        threads.emplace_back(increment_race);
    }

    for (auto& t : threads) {
        t.join();
    }

    std::cout << "Expected: 1000000, Actual: " << shared_counter << "\n";
    // Typical output: 300000-800000 (lost updates)
}
```

Multiple threads perform non-atomic read-modify-write, causing lost updates. The final value is unpredictable and less than expected.

#### Example 2: Fixing Race with Mutex

```cpp
#include <iostream>
#include <thread>
#include <vector>
#include <mutex>

std::mutex mtx;
int shared_counter = 0;

void increment_safe() {
    for (int i = 0; i < 100000; ++i) {
        std::lock_guard<std::mutex> lock(mtx);
        ++shared_counter;  // ✅ Protected
    }
}

int main() {
    std::vector<std::thread> threads;
    for (int i = 0; i < 10; ++i) {
        threads.emplace_back(increment_safe);
    }

    for (auto& t : threads) {
        t.join();
    }

    std::cout << "Counter: " << shared_counter << "\n";  // Always 1000000
}
```

Protecting the critical section with a mutex ensures atomicity of the read-modify-write operation.

#### Example 3: ABBA Deadlock Scenario

```cpp
#include <iostream>
#include <thread>
#include <mutex>

std::mutex mutex_A;
std::mutex mutex_B;

void thread_function_1() {
    std::lock_guard<std::mutex> lock_A(mutex_A);  // Lock A first
    std::this_thread::sleep_for(std::chrono::milliseconds(10));

    std::cout << "Thread 1 trying to lock B...\n";
    std::lock_guard<std::mutex> lock_B(mutex_B);  // Wait for B

    std::cout << "Thread 1 got both locks\n";
}

void thread_function_2() {
    std::lock_guard<std::mutex> lock_B(mutex_B);  // ❌ Lock B first (opposite order)
    std::this_thread::sleep_for(std::chrono::milliseconds(10));

    std::cout << "Thread 2 trying to lock A...\n";
    std::lock_guard<std::mutex> lock_A(mutex_A);  // Wait for A

    std::cout << "Thread 2 got both locks\n";
}

int main() {
    std::thread t1(thread_function_1);
    std::thread t2(thread_function_2);

    t1.join();  // ❌ Hangs forever - deadlock
    t2.join();
}
```

Thread 1 holds A and waits for B; Thread 2 holds B and waits for A. Classic circular wait deadlock.

#### Example 4: Fixing Deadlock with Lock Ordering

```cpp
#include <iostream>
#include <thread>
#include <mutex>

std::mutex mutex_A;
std::mutex mutex_B;

void safe_thread_1() {
    std::lock_guard<std::mutex> lock_A(mutex_A);  // ✅ Same order
    std::lock_guard<std::mutex> lock_B(mutex_B);
    std::cout << "Thread 1 got both locks\n";
}

void safe_thread_2() {
    std::lock_guard<std::mutex> lock_A(mutex_A);  // ✅ Same order
    std::lock_guard<std::mutex> lock_B(mutex_B);
    std::cout << "Thread 2 got both locks\n";
}

int main() {
    std::thread t1(safe_thread_1);
    std::thread t2(safe_thread_2);

    t1.join();  // ✅ No deadlock
    t2.join();
}
```

Both threads acquire locks in the same order (A then B), preventing circular wait.

#### Example 5: Using std::lock for Deadlock-Free Multi-Locking

```cpp
#include <iostream>
#include <thread>
#include <mutex>

std::mutex mutex_A;
std::mutex mutex_B;

void atomic_multi_lock_1() {
    std::lock(mutex_A, mutex_B);  // ✅ Atomic lock, no deadlock

    std::lock_guard<std::mutex> lock_A(mutex_A, std::adopt_lock);
    std::lock_guard<std::mutex> lock_B(mutex_B, std::adopt_lock);

    std::cout << "Thread 1 got both locks\n";
}

void atomic_multi_lock_2() {
    std::lock(mutex_B, mutex_A);  // ✅ Order doesn't matter with std::lock

    std::lock_guard<std::mutex> lock_B(mutex_B, std::adopt_lock);
    std::lock_guard<std::mutex> lock_A(mutex_A, std::adopt_lock);

    std::cout << "Thread 2 got both locks\n";
}

int main() {
    std::thread t1(atomic_multi_lock_1);
    std::thread t2(atomic_multi_lock_2);

    t1.join();  // ✅ No deadlock
    t2.join();
}
```

`std::lock()` uses a deadlock-avoidance algorithm, making it safe regardless of argument order.

#### Example 6: Bank Account Transfer with Deadlock Prevention

```cpp
#include <iostream>
#include <thread>
#include <mutex>
#include <algorithm>

class Account {
public:
    std::mutex mtx;
    int balance;

    Account(int initial) : balance(initial) {}
};

void transfer(Account& from, Account& to, int amount) {
    // ✅ Lock in address order to prevent deadlock
    Account* first = std::min(&from, &to);
    Account* second = std::max(&from, &to);

    std::lock_guard<std::mutex> lock1(first->mtx);
    std::lock_guard<std::mutex> lock2(second->mtx);

    from.balance -= amount;
    to.balance += amount;

    std::cout << "Transferred " << amount << "\n";
}

int main() {
    Account acc1(1000);
    Account acc2(500);

    std::thread t1(transfer, std::ref(acc1), std::ref(acc2), 100);
    std::thread t2(transfer, std::ref(acc2), std::ref(acc1), 50);

    t1.join();
    t2.join();

    std::cout << "Account 1: " << acc1.balance << ", Account 2: " << acc2.balance << "\n";
}
```

Locking accounts by address order ensures consistent lock ordering regardless of function call order.

#### Example 7: Check-Then-Act Race Condition

```cpp
#include <iostream>
#include <thread>
#include <mutex>
#include <unordered_map>

std::mutex mtx;
std::unordered_map<int, int> cache;

void racy_get_or_create(int key) {
    // ❌ Check outside lock
    if (cache.find(key) == cache.end()) {
        // Race window here! Another thread might insert between check and act

        std::lock_guard<std::mutex> lock(mtx);
        cache[key] = key * 2;  // Might insert duplicate work
    }

    std::lock_guard<std::mutex> lock(mtx);
    std::cout << "Value: " << cache[key] << "\n";
}

void safe_get_or_create(int key) {
    std::lock_guard<std::mutex> lock(mtx);  // ✅ Lock covers both check and act

    if (cache.find(key) == cache.end()) {
        cache[key] = key * 2;
    }

    std::cout << "Value: " << cache[key] << "\n";
}

int main() {
    std::thread t1(safe_get_or_create, 10);
    std::thread t2(safe_get_or_create, 10);

    t1.join();
    t2.join();
}
```

The critical section must cover both the check and the action to prevent races.

#### Example 8: Detecting Deadlock with Timeout

```cpp
#include <iostream>
#include <thread>
#include <mutex>
#include <chrono>

std::timed_mutex mutex_A;
std::timed_mutex mutex_B;

void try_with_timeout_1() {
    if (mutex_A.try_lock_for(std::chrono::milliseconds(100))) {
        std::cout << "Thread 1 got A\n";

        if (mutex_B.try_lock_for(std::chrono::milliseconds(100))) {
            std::cout << "Thread 1 got both\n";
            mutex_B.unlock();
        } else {
            std::cout << "Thread 1 timeout on B (potential deadlock detected)\n";
        }

        mutex_A.unlock();
    }
}

void try_with_timeout_2() {
    if (mutex_B.try_lock_for(std::chrono::milliseconds(100))) {
        std::cout << "Thread 2 got B\n";

        if (mutex_A.try_lock_for(std::chrono::milliseconds(100))) {
            std::cout << "Thread 2 got both\n";
            mutex_A.unlock();
        } else {
            std::cout << "Thread 2 timeout on A (potential deadlock detected)\n";
        }

        mutex_B.unlock();
    }
}

int main() {
    std::thread t1(try_with_timeout_1);
    std::thread t2(try_with_timeout_2);

    t1.join();
    t2.join();
}
```

Timeout-based locking detects potential deadlocks and allows recovery (backoff and retry).

---

### QUICK_REFERENCE: Answer Key and Summary Tables

#### Answer Key for Practice Questions

| Q# | Answer | Explanation | Key Concept |
|----|--------|-------------|-------------|
| 1 | Output: < 20000 (varies, typically 10000-19000) | Race condition - concurrent unsynchronized increments | Data race / lost updates |
| 2 | Likely deadlock | ABBA deadlock - T1 locks m1→m2, T2 locks m2→m1 | Lock ordering deadlock |
| 3 | Output: "Thread 1" and "Thread 2" (order varies) | std::lock prevents deadlock regardless of argument order | std::lock deadlock prevention |
| 4 | Possible output: 100 (race allows both threads to pass check) | Check-then-act race (TOCTOU) - check outside lock | TOCTOU race |
| 5 | Possible deadlock | ABBA deadlock with accounts - lock order depends on arguments | Pointer-based deadlock |
| 6 | Potential crash or wrong value | get_or_default has race - data.size() can change | TOCTOU / unsynchronized read |
| 7 | Possible livelock | Both threads continuously back off for each other | Livelock |
| 8 | Output: "100" printed 3 times | call_once ensures initialize runs exactly once | One-time initialization |
| 9 | Output: "T1 timeout" and "T2 timeout" (or one succeeds) | Timeout-based deadlock detection | Timeout recovery |
| 10 | Multiple readers or single writer executes (order varies) | shared_mutex allows concurrent reads | Readers-writer lock |
| 11 | Output: "100" from all threads (correct double-checked locking) | Proper double-checked locking pattern | Lazy initialization |
| 12 | May print "Inconsistent" | Reader sees partial write without synchronization | Read-write race |
| 13 | Both threads might print (race on check-then-act) | Atomic doesn't make check-then-act atomic | Atomic check-then-act race |
| 14 | Output: 1 (lost update) | Read outside lock, write inside - classic race | Read-modify-write race |
| 15 | Output: "Initialized" once | C++11 guarantees thread-safe static local init | Meyers' Singleton |
| 16 | Deadlock | Mutexes already locked, try to lock again without adopt_lock | Missing adopt_lock |
| 17 | May print 0 or 42 (memory reordering) | No memory ordering on atomic store/load | Memory reordering race |
| 18 | Compilation error | current not declared in outer scope | Scoping error + race |
| 19 | Output: "Inner" then "Outer" | Recursive mutex allows same thread to relock | Recursive locking |
| 20 | Output: "Thread 1" and "Thread 2" (serialized, no deadlock) | Same lock order prevents deadlock | Consistent lock ordering |

#### Coffman Conditions for Deadlock

| Condition | Description | How to Break |
|-----------|-------------|--------------|
| Mutual exclusion | Resource cannot be shared (only one owner) | Use shared resources (shared_mutex) |
| Hold and wait | Hold resources while waiting for others | Acquire all atomically (std::lock) |
| No preemption | Cannot force resource release | Use timeouts (try_lock_for) |
| Circular wait | Circular chain of waiting threads | Enforce lock ordering |

#### Common Race Condition Patterns

| Pattern | Description | Fix |
|---------|-------------|-----|
| Lost update | Concurrent read-modify-write loses changes | Protect entire RMW with lock |
| Check-then-act (TOCTOU) | Condition changes between check and action | Atomic check+act under same lock |
| Read-write inconsistency | Reader sees partial write | Protect both with same lock |
| Publication race | Object published before fully initialized | Use memory barriers (acquire/release) |
| Double-checked locking | Lazy init without proper synchronization | Use std::call_once or Meyers' Singleton |
| ABA problem | Lock-free CAS succeeds despite intermediate changes | Tagged pointers, hazard pointers |

#### Deadlock Prevention Strategies

| Strategy | Technique | Pros | Cons |
|----------|-----------|------|------|
| Lock ordering | Always acquire in same global order | Simple, low overhead | Requires discipline across codebase |
| std::lock() | Atomic multi-lock with try-lock algorithm | Deadlock-free regardless of order | Slightly higher overhead than ordered |
| Lock hierarchy | Enforce ascending level ordering | Catches violations at runtime | Additional bookkeeping overhead |
| Timeout + retry | try_lock_for with backoff | Detects and recovers from deadlock | May cause livelock without proper backoff |
| Avoid nested locks | Never hold multiple locks | Eliminates deadlock possibility | May reduce concurrency |
| Lock-free algorithms | Use atomics instead of locks | No deadlock possible | High complexity, hard to verify |

#### Debugging Tools Comparison

| Tool | Type | Detection Method | Overhead | False Positives |
|------|------|------------------|----------|-----------------|
| ThreadSanitizer (TSan) | Dynamic analysis | Happens-before tracking | 5-15x slowdown, 5-10x memory | Very low |
| Helgrind (Valgrind) | Dynamic analysis | Lock-set algorithm | 20-50x slowdown | Medium (conservative) |
| Clang Static Analyzer | Static analysis | Code path analysis | Compile-time only | Medium-high |
| Intel Inspector | Dynamic/hybrid | Instrumentation + heuristics | 2-10x slowdown | Low |
| Manual code review | Human analysis | Pattern recognition | High effort | Depends on reviewer |

#### Race Condition vs Deadlock Comparison

| Aspect | Race Condition | Deadlock |
|--------|----------------|----------|
| Definition | Outcome depends on timing | Threads permanently blocked |
| Symptom | Incorrect results, corruption | Hung program, no progress |
| Determinism | Non-deterministic | Deterministic if conditions met |
| Detection | ThreadSanitizer, testing | Timeout, wait-for graph cycles |
| Prevention | Synchronization (locks, atomics) | Lock ordering, std::lock() |
| Recovery | N/A (prevent only) | Timeout, transaction abort |
| Severity | Data corruption, crash | System hang, requires restart |

#### Best Practices Summary

| Practice | Reason |
|----------|--------|
| ✅ Establish global lock ordering | Prevents circular wait deadlocks |
| ✅ Use std::lock for multi-mutex operations | Deadlock-free atomic acquisition |
| ✅ Minimize lock hold time | Reduces contention and convoy effect |
| ✅ Protect check-then-act with single lock | Prevents TOCTOU races |
| ✅ Use std::call_once for lazy init | Thread-safe initialization |
| ✅ Run ThreadSanitizer in CI/testing | Catches races during development |
| ✅ Use atomics with proper memory ordering | Prevents publication races |
| ❌ Don't check condition outside lock then act inside | TOCTOU race |
| ❌ Don't hold locks during I/O or callbacks | Risk of deadlock and high latency |
| ❌ Don't rely on "benign" races | Undefined behavior, breaks with optimization |

#### Common Deadlock Scenarios

| Scenario | Cause | Prevention |
|----------|-------|------------|
| ABBA deadlock | Inconsistent lock order across threads | Global lock ordering |
| Self-deadlock | Same thread locks non-recursive mutex twice | Use recursive_mutex or refactor |
| Callback deadlock | Callback acquires lock already held by caller | Document lock requirements, minimize |
| Priority inversion | High-priority blocked by low-priority via lock | Priority inheritance, lock-free |
| Distributed deadlock | Cross-network resources in circular wait | Timeout, deadlock detection service |
