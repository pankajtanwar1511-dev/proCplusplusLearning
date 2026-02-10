## TOPIC: Deadlocks and Race Conditions - Patterns, Detection, and Prevention

### THEORY_SECTION: Core Concepts and Foundations

**Race conditions** and **deadlocks** are the two most critical bugs in concurrent programming, often manifesting as intermittent failures that disappear when debugging (Heisenbugs). A **race condition** occurs when multiple threads access shared mutable state concurrently, with at least one performing a write operation, and the outcome depends on the unpredictable timing of thread execution. A **deadlock** occurs when two or more threads are permanently blocked, each waiting for resources held by the others, creating a circular dependency from which no thread can escape.

#### Understanding Race Conditions

At the machine level, seemingly atomic operations like `++counter` decompose into multiple instructions: load from memory into register, increment register, store back to memory. When two threads execute this sequence concurrently without synchronization, both might read the same initial value (say, 100), increment it to 101, and write back 101—losing one increment. The program produces 101 instead of the expected 102. This is a **lost update**, the simplest form of race condition. More subtle variants include **read-modify-write races**, **check-then-act races** (checking a condition then acting on it, but the condition changes between check and act), and **publication races** (one thread publishes a reference before the object is fully constructed).

#### The Four Coffman Conditions for Deadlock

Deadlock occurs when all four Coffman conditions hold simultaneously: **(1) Mutual exclusion** - resources cannot be shared (only one thread can hold a mutex); **(2) Hold and wait** - threads hold resources while waiting for others (holding lock A while waiting for lock B); **(3) No preemption** - resources cannot be forcibly taken away (you cannot force a thread to release a lock); **(4) Circular wait** - a circular chain of threads, each waiting for a resource held by the next (Thread 1 waits for Thread 2's lock, Thread 2 waits for Thread 3's lock, Thread 3 waits for Thread 1's lock). Breaking any one condition prevents deadlock.

#### Detection vs Prevention

**Deadlock prevention** designs systems to avoid deadlock by breaking one of the Coffman conditions (most commonly circular wait through lock ordering). **Deadlock avoidance** uses algorithms like banker's algorithm to dynamically ensure safe states (impractical in general-purpose systems). **Deadlock detection** allows deadlocks to occur but periodically detects them (lock timeout, cycle detection in wait-for graphs) and recovers (abort transactions, kill threads). Prevention is preferred in most systems as detection and recovery are complex and have performance costs.

#### Why This Matters in Mission-Critical Systems

In autonomous driving, a deadlock in the sensor fusion thread means no updated world model, causing the vehicle to continue with stale data—potentially catastrophic at highway speeds. A race condition in the planning algorithm might cause inconsistent path decisions, leading to erratic vehicle behavior. Real-time requirements mean debugging these issues in production is impractical; they must be prevented through design. Understanding race condition patterns, deadlock prevention strategies, and debugging tools (ThreadSanitizer, Helgrind) is essential for building safe concurrent systems.

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

### INTERVIEW_QA: Comprehensive Questions

#### Q1: What is a race condition and how does it differ from a data race?
**Difficulty:** #intermediate
**Category:** #threading #race_condition #theory
**Concepts:** #race_condition #data_race #undefined_behavior #synchronization

**Answer:**
A race condition is when program correctness depends on thread timing. A data race is concurrent unsynchronized access to shared memory with at least one write—undefined behavior in C++.

**Code example:**
```cpp
// Data race (undefined behavior)
int x = 0;
Thread 1: x = 1;  // No synchronization
Thread 2: x = 2;

// Race condition (defined behavior, but incorrect)
std::atomic<int> flag{0};
Thread 1: if (flag == 0) { flag = 1; doA(); }
Thread 2: if (flag == 0) { flag = 1; doA(); }  // Both might execute doA()
```

**Explanation:**
Data races are a language-level concept: concurrent unsynchronized access where at least one is a write causes undefined behavior (optimizer assumes single-threaded execution). Race conditions are algorithm-level: even with proper synchronization, incorrect logic can cause timing-dependent bugs. All data races are race conditions, but not all race conditions are data races (you can have timing bugs even with atomics).

**Key takeaway:** Data races are undefined behavior requiring synchronization; race conditions are logic errors requiring correct algorithm design, often needing atomics or locks for critical sections.

---

#### Q2: What are the four Coffman conditions required for deadlock to occur?
**Difficulty:** #intermediate
**Category:** #threading #deadlock #theory
**Concepts:** #coffman_conditions #deadlock #prevention

**Answer:**
1. Mutual exclusion, 2. Hold and wait, 3. No preemption, 4. Circular wait. All four must be present for deadlock.

**Explanation:**
**Mutual exclusion**: Resources cannot be shared (only one thread holds a mutex). **Hold and wait**: Threads hold resources while waiting for others (holding lock A while requesting lock B). **No preemption**: Resources cannot be forcibly taken (can't force unlock). **Circular wait**: Circular chain of waiting (T1→T2→T3→T1 where → means "waiting for"). Deadlock occurs only when all four hold. Prevention targets breaking one condition: lock ordering breaks circular wait, `std::lock()` combines hold-and-wait into atomic operation, timeouts provide preemption-like recovery.

**Key takeaway:** Breaking any one of the four Coffman conditions prevents deadlock; lock ordering (preventing circular wait) is the most common prevention strategy.

---

#### Q3: How does the ABBA deadlock pattern occur, and how do you prevent it?
**Difficulty:** #beginner
**Category:** #threading #deadlock #patterns
**Concepts:** #abba_deadlock #lock_ordering #prevention

**Answer:**
ABBA deadlock occurs when Thread 1 locks A then B, while Thread 2 locks B then A, creating circular wait. Prevent with consistent lock ordering.

**Code example:**
```cpp
// ❌ ABBA Deadlock
Thread 1: lock(A); lock(B);
Thread 2: lock(B); lock(A);  // Deadlock

// ✅ Prevention: Same order
Thread 1: lock(A); lock(B);
Thread 2: lock(A); lock(B);  // No deadlock
```

**Explanation:**
When Thread 1 holds A and waits for B, while Thread 2 holds B and waits for A, both block forever in circular wait. This violates the circular wait Coffman condition if prevented. Solutions: (1) Establish global lock ordering (always A before B), (2) Use `std::lock()` for atomic multi-lock, (3) Lock by address order when lock order is dynamic. The key is consistency across all code paths.

**Key takeaway:** ABBA deadlock results from inconsistent lock ordering; prevent by establishing and enforcing a global lock order across all threads.

---

#### Q4: What is a Heisenbug, and why are race conditions often called Heisenbugs?
**Difficulty:** #intermediate
**Category:** #threading #debugging
**Concepts:** #heisenbug #race_condition #debugging #timing

**Answer:**
A Heisenbug is a bug that changes behavior when you try to observe it. Race conditions are Heisenbugs because debugging tools (logging, breakpoints) alter timing.

**Explanation:**
Race conditions depend on precise thread interleaving timing. Adding logging, breakpoints, or running under a debugger changes timing (context switches, cache effects, instruction reordering) often making the bug disappear. The bug "runs away" when observed, like Heisenberg's uncertainty principle. This makes race conditions notoriously hard to debug with traditional techniques. Solutions: static analysis (ThreadSanitizer), code review for shared data access, careful lock invariants, systematic testing with thread scheduling randomization.

**Key takeaway:** Race conditions often disappear when debugging due to timing changes; use static analysis tools (TSan) and design reviews rather than relying on traditional debugging.

---

#### Q5: How does std::lock prevent deadlock when acquiring multiple mutexes?
**Difficulty:** #advanced
**Category:** #threading #deadlock #prevention
**Concepts:** #std_lock #deadlock_avoidance #algorithm

**Answer:**
`std::lock()` uses a try-lock algorithm with backoff, atomically acquiring all mutexes or none, preventing partial acquisition that causes circular wait.

**Code example:**
```cpp
std::lock(m1, m2, m3);  // Atomically locks all or none
std::lock_guard<std::mutex> lg1(m1, std::adopt_lock);
std::lock_guard<std::mutex> lg2(m2, std::adopt_lock);
std::lock_guard<std::mutex> lg3(m3, std::adopt_lock);
```

**Explanation:**
The implementation attempts to lock all mutexes using `try_lock()`. If any fails, it releases all successfully acquired locks and retries. This prevents partial acquisition (holding some locks while waiting for others), breaking the hold-and-wait Coffman condition. The algorithm has backoff strategies to avoid livelock. Regardless of argument order, `std::lock()` ensures deadlock-free acquisition. Callers use `std::adopt_lock` to transfer ownership to RAII guards without re-locking.

**Key takeaway:** `std::lock()` provides atomic all-or-nothing lock acquisition using try-lock with backoff, preventing deadlock regardless of lock order.

---

#### Q6: What is priority inversion and how does it relate to deadlocks?
**Difficulty:** #advanced
**Category:** #threading #real_time #deadlock
**Concepts:** #priority_inversion #real_time #mutex #priority

**Answer:**
Priority inversion occurs when a high-priority thread waits for a lock held by a low-priority thread, which is preempted by medium-priority threads, inverting their priorities.

**Explanation:**
Scenario: Low-priority thread L locks mutex M. High-priority thread H arrives and blocks on M. Medium-priority threads M preempt L (since L has lower priority than M but holds the lock H needs). H is effectively blocked by M, inverting their priorities. This caused the Mars Pathfinder mission failure. Solutions: **Priority inheritance** (L temporarily inherits H's priority while holding the lock), **Priority ceiling** (lock owner inherits highest priority of all threads that might use that lock), or **Avoid locks** (lock-free algorithms). Standard mutexes don't provide priority inheritance on all platforms.

**Key takeaway:** Priority inversion in mutex-based systems causes high-priority threads to be blocked by low-priority work; use priority inheritance protocols or lock-free algorithms in real-time systems.

---

#### Q7: What is the difference between deadlock, livelock, and starvation?
**Difficulty:** #intermediate
**Category:** #threading #concurrency_issues
**Concepts:** #deadlock #livelock #starvation #fairness

**Answer:**
**Deadlock**: Threads permanently blocked, no progress. **Livelock**: Threads actively changing state but not progressing. **Starvation**: Some threads never get resources due to unfair scheduling.

**Code example:**
```cpp
// Deadlock: No progress, threads blocked
T1: lock(A); lock(B);
T2: lock(B); lock(A);  // Both stuck

// Livelock: Activity but no progress
T1: while (!tryLock(A)) yield();
T2: while (!tryLock(A)) yield();  // Both retry forever

// Starvation: Low priority thread never scheduled
while (highPriorityWork()) {}  // Starves low-priority threads
```

**Explanation:**
**Deadlock** is permanent blocking with circular wait—threads are stuck. **Livelock** is active failure—threads respond to each other but make no progress (like two people in a hallway both stepping aside repeatedly in the same direction). **Starvation** is unfair resource allocation—some threads never get CPU or locks (not inherently deadlocked, just unlucky in scheduling). Deadlock requires intervention (timeout, kill). Livelock needs randomized backoff. Starvation needs fair scheduling or priority adjustments.

**Key takeaway:** Deadlock is permanent block, livelock is active but non-progressing, starvation is indefinite waiting due to unfair scheduling—all require different solutions.

---

#### Q8: How do you detect deadlocks in a running system?
**Difficulty:** #advanced
**Category:** #threading #deadlock #debugging
**Concepts:** #deadlock_detection #debugging #tools

**Answer:**
Use lock timeout detection, wait-for graph cycle detection, or runtime analysis tools like ThreadSanitizer or Helgrind.

**Explanation:**
**Timeout approach**: If a thread waits for a lock beyond a threshold, log potential deadlock. Requires `std::timed_mutex`. **Wait-for graph**: Maintain a directed graph where nodes are threads and edges represent "T1 waits for resource held by T2". Periodically run cycle detection. Costly but precise. **Static analysis**: ThreadSanitizer (TSan) detects potential deadlocks by tracking lock acquisition order violations. **Manual**: Thread dumps (`gdb` with `thread apply all bt`) show all threads; look for multiple threads blocked on mutex waits. Prevention is cheaper than detection.

**Key takeaway:** Deadlock detection uses timeouts (runtime), wait-for graph cycle detection (expensive), or static analysis tools (TSan); prevention through lock ordering is preferred.

---

#### Q9: What is a check-then-act race condition? Provide an example.
**Difficulty:** #intermediate
**Category:** #threading #race_condition #patterns
**Concepts:** #check_then_act #toctou #atomic_operation

**Answer:**
A race where a thread checks a condition then acts on it, but the condition changes between check and act due to lack of atomicity.

**Code example:**
```cpp
// ❌ Check-then-act race (TOCTOU)
if (cache.find(key) == cache.end()) {  // Check
    // Another thread might insert key here!
    cache[key] = compute();  // Act
}

// ✅ Fix: Atomic check-and-act
std::lock_guard<std::mutex> lock(mtx);
if (cache.find(key) == cache.end()) {
    cache[key] = compute();
}
```

**Explanation:**
Time-of-check to time-of-use (TOCTOU) bugs occur when the system state changes between evaluating a condition and acting on it. In multithreaded code, another thread can modify shared state in the gap. The check and act must be atomic (within a single critical section). Common in file systems (check file exists, then open), caching (check key exists, then insert), and resource allocation (check available, then allocate).

**Key takeaway:** Check-then-act operations must be atomic; protect both the check and the action with the same lock to prevent TOCTOU races.

---

#### Q10: Why are race conditions especially dangerous in real-time autonomous driving systems?
**Difficulty:** #advanced
**Category:** #threading #real_time #safety
**Concepts:** #race_condition #real_time #safety_critical #autonomous_driving

**Answer:**
Race conditions cause non-deterministic behavior, violating safety requirements for predictable response times and correct state updates in safety-critical systems.

**Explanation:**
Autonomous vehicles have strict timing deadlines (e.g., sensor fusion at 30Hz, control at 100Hz). A race condition might cause: (1) **Stale data**: Planning uses partially-updated world model, generating incorrect paths. (2) **Timing violations**: Lost updates cause skipped processing cycles, missing deadlines. (3) **Heisenbugs**: Intermittent failures impossible to reproduce in testing but occurring in production. (4) **Safety violations**: Inconsistent brake/acceleration commands. Certification (ISO 26262) requires demonstrable absence of data races, necessitating static analysis and formal verification.

**Key takeaway:** In safety-critical real-time systems like autonomous driving, race conditions cause unpredictable timing and state corruption, violating safety requirements; prevention through design is mandatory.

---

#### Q11: What is the ABA problem and how does it relate to race conditions?
**Difficulty:** #advanced
**Category:** #threading #lock_free #race_condition
**Concepts:** #aba_problem #lock_free #cas #race_condition

**Answer:**
ABA is a race in lock-free algorithms where a value changes A→B→A, and compare-and-swap (CAS) succeeds on the final A, missing intermediate changes.

**Code example:**
```cpp
// Lock-free stack pop
Node* old_head = head.load();
// ❌ Another thread pops A, pushes B, pops B, pushes A
// head is back to A, but it's a different A!
if (head.compare_exchange_weak(old_head, old_head->next)) {
    // CAS succeeds but intermediate state was different
}
```

**Explanation:**
Thread T1 reads `head = A`. Thread T2 pops A (head=B), pops B (head=C), pushes A back (head=A, but a different node). T1's CAS succeeds because head==A, but the stack changed underneath. This can cause use-after-free or corruption. Solutions: **Tagged pointers** (version counter with pointer), **Hazard pointers** (delay deletion until no references), **Epoch-based reclamation** (generational garbage collection). ABA is a subtle race in lock-free code.

**Key takeaway:** ABA problem in lock-free algorithms occurs when CAS succeeds despite intermediate changes; mitigate with tagged pointers, hazard pointers, or epoch-based reclamation.

---

#### Q12: How does ThreadSanitizer (TSan) detect race conditions?
**Difficulty:** #advanced
**Category:** #threading #debugging #tools
**Concepts:** #thread_sanitizer #race_detection #dynamic_analysis

**Answer:**
TSan instruments memory accesses and lock operations, tracking happens-before relationships to detect unsynchronized conflicting accesses.

**Explanation:**
ThreadSanitizer is a dynamic analysis tool (compile-time instrumentation, runtime detection). It tracks: (1) Every memory access (read/write), (2) All synchronization operations (locks, atomics), (3) Happens-before relationships between threads. When it detects two threads accessing the same memory location without a happens-before relationship, with at least one write, it reports a data race. TSan uses vector clocks to efficiently track causality. Overhead is significant (~5-15x slowdown, 5-10x memory) but catches races that occur during execution. Use in testing/CI, not production.

**Key takeaway:** ThreadSanitizer detects data races by tracking memory accesses and synchronization, reporting conflicting unsynchronized accesses; use in testing despite overhead.

---

#### Q13: What is the convoy effect and how does it amplify race condition symptoms?
**Difficulty:** #advanced
**Category:** #threading #performance #race_condition
**Concepts:** #convoy_effect #mutex #contention

**Answer:**
The convoy effect occurs when threads queue behind a slow lock holder, creating bursts of serialized execution that worsen race-induced timing variations.

**Explanation:**
When one thread holds a mutex and experiences a delay (page fault, cache miss, context switch), waiting threads queue. Upon release, they wake serially, each acquiring the lock, performing work, and releasing—creating a convoy of serialized execution. This amplifies timing variations from race conditions: if a race causes one thread to hold the lock longer, it delays all queued threads, creating cascading delays. In real-time systems, this causes deadline misses. Solutions: minimize lock hold time, use readers-writer locks, partition data to reduce sharing, or use lock-free algorithms.

**Key takeaway:** Convoy effect causes periodic serialization bursts when threads queue on locks, amplifying timing issues; minimize lock hold time and contention to reduce impact.

---

#### Q14: How do you prevent race conditions on lazy initialization of a shared resource?
**Difficulty:** #intermediate
**Category:** #threading #initialization #patterns
**Concepts:** #lazy_initialization #double_checked_locking #call_once

**Answer:**
Use `std::call_once` with `std::once_flag`, or Meyers' Singleton (C++11 guarantees thread-safe static local initialization).

**Code example:**
```cpp
// ✅ Meyers' Singleton (simplest)
Resource& get_resource() {
    static Resource instance;  // Thread-safe in C++11+
    return instance;
}

// ✅ std::call_once (explicit control)
std::once_flag flag;
std::unique_ptr<Resource> resource;

void init() {
    resource = std::make_unique<Resource>();
}

Resource& get_resource_explicit() {
    std::call_once(flag, init);
    return *resource;
}
```

**Explanation:**
Naive lazy initialization (`if (!resource) resource = new Resource()`) is a check-then-act race—multiple threads might initialize. Double-checked locking is complex and error-prone (requires atomics). C++11 guarantees thread-safe static local initialization—the compiler generates code to ensure only one thread initializes. `std::call_once` provides similar semantics with explicit control. Both prevent race conditions on initialization.

**Key takeaway:** Use Meyers' Singleton (static local) or `std::call_once` for thread-safe lazy initialization; avoid manual double-checked locking.

---

#### Q15: What is a benign race and when is it acceptable?
**Difficulty:** #advanced
**Category:** #threading #race_condition #theory
**Concepts:** #benign_race #false_positive #performance

**Answer:**
A benign race is a data race that doesn't affect program correctness (e.g., racy statistics counters where approximate values are acceptable). Still technically undefined behavior in C++.

**Code example:**
```cpp
// Benign race (but still undefined behavior in C++)
int approx_counter = 0;

void increment() {
    ++approx_counter;  // ❌ Data race, but "benign" if approximate count OK
}

// ✅ Proper: Use atomic even for benign cases
std::atomic<int> counter{0};
void increment_proper() {
    counter.fetch_add(1, std::memory_order_relaxed);
}
```

**Explanation:**
Some races don't affect correctness: approximate statistics, debug counters, progress indicators. However, in C++, data races are undefined behavior—optimizers assume no races and can generate broken code. ThreadSanitizer flags all races, including benign ones. Solution: use `std::atomic` with relaxed memory ordering for low overhead. "Benign race" is a dangerous concept—what's benign today might break under optimization changes. Always use proper synchronization.

**Key takeaway:** "Benign races" are still undefined behavior in C++; use `std::atomic` with relaxed ordering for low-overhead synchronization even when approximate values are acceptable.

---

#### Q16: How do memory reordering and race conditions interact?
**Difficulty:** #advanced
**Category:** #threading #memory_model #race_condition
**Concepts:** #memory_reordering #race_condition #memory_ordering

**Answer:**
Compiler and CPU reordering can make race conditions worse, causing threads to see operations out of order unless memory barriers prevent reordering.

**Code example:**
```cpp
int data = 0;
bool ready = false;

// Writer
data = 42;        // Might be reordered after ready = true
ready = true;

// Reader
if (ready) {      // ❌ Might see ready=true but data=0 (reordering)
    use(data);
}

// ✅ Fix with atomics + memory ordering
std::atomic<bool> ready{false};
data = 42;
ready.store(true, std::memory_order_release);  // Barrier

if (ready.load(std::memory_order_acquire)) {  // Barrier
    use(data);  // Guaranteed to see data=42
}
```

**Explanation:**
CPUs and compilers reorder instructions for performance, but this breaks assumptions in race conditions. Without barriers, the reader might see `ready=true` but `data=0` because writes were reordered. Acquire-release memory ordering creates happens-before relationships: release ensures prior writes complete before the store, acquire ensures subsequent reads happen after the load. This prevents dangerous reorderings in concurrent code.

**Key takeaway:** Memory reordering makes race conditions unpredictable; use atomic operations with appropriate memory ordering to enforce happens-before relationships.

---

#### Q17: What tools are available for detecting race conditions in C++ code?
**Difficulty:** #intermediate
**Category:** #threading #debugging #tools
**Concepts:** #tsan #helgrind #static_analysis

**Answer:**
ThreadSanitizer (TSan), Helgrind (Valgrind), static analyzers, and manual code review. TSan is most effective for runtime detection.

**Explanation:**
**ThreadSanitizer (TSan)**: Compiler-based instrumentation (GCC/Clang `-fsanitize=thread`), detects data races during execution, low false positive rate, ~5-15x overhead. **Helgrind**: Valgrind tool, slower than TSan but doesn't require recompilation. **Static analyzers**: Clang Static Analyzer, Coverity—detect potential races without execution. **Intel Inspector**: Commercial tool with GUI. **Manual review**: Systematic review of shared data access patterns. TSan is the industry standard for C++—use in testing/CI pipelines.

**Key takeaway:** ThreadSanitizer (TSan) is the most effective tool for detecting data races in C++; use during testing and CI, despite performance overhead.

---

#### Q18: How do you design a deadlock-free locking hierarchy?
**Difficulty:** #advanced
**Category:** #threading #deadlock #design
**Concepts:** #lock_hierarchy #deadlock_prevention #design_pattern

**Answer:**
Assign a total order to all locks (e.g., by level/layer), and enforce that threads only acquire locks in ascending order.

**Code example:**
```cpp
class HierarchicalMutex {
    std::mutex mtx;
    const unsigned long hierarchy_value;
    static thread_local unsigned long this_thread_hierarchy;
public:
    explicit HierarchicalMutex(unsigned long value) : hierarchy_value(value) {}

    void lock() {
        if (this_thread_hierarchy <= hierarchy_value) {
            throw std::logic_error("Lock order violation");
        }
        mtx.lock();
        this_thread_hierarchy = hierarchy_value;
    }

    void unlock() {
        this_thread_hierarchy = std::numeric_limits<unsigned long>::max();
        mtx.unlock();
    }
};

// Usage
HierarchicalMutex low_level(100);
HierarchicalMutex high_level(200);

high_level.lock();  // ✅ OK
low_level.lock();   // ✅ OK (ascending order)
```

**Explanation:**
Lock hierarchy assigns each lock a level. Rules: (1) Only acquire locks in ascending order, (2) Track current thread's lowest held lock level, (3) Throw if attempting to acquire a lock at lower/equal level. This prevents circular wait by enforcing strict ordering. Useful in layered architectures (e.g., UI layer locks > business logic locks > data layer locks). Requires discipline and runtime checks.

**Key takeaway:** Lock hierarchy enforces ascending lock order through runtime checks, preventing circular wait and deadlock in complex systems.

---

#### Q19: What is the reader-writer problem and how does it relate to race conditions?
**Difficulty:** #intermediate
**Category:** #threading #synchronization #patterns
**Concepts:** #readers_writer #shared_mutex #race_condition

**Answer:**
Multiple threads reading shared data can coexist safely, but writes require exclusive access. Without proper synchronization, readers see inconsistent state.

**Code example:**
```cpp
// ❌ Race: Readers see inconsistent state during writes
int data1 = 0, data2 = 0;

void writer() {
    data1 = 42;
    data2 = 42;  // Reader might see data1=42, data2=0
}

void reader() {
    int snapshot1 = data1;
    int snapshot2 = data2;  // Inconsistent if writer interleaved
}

// ✅ Fix with shared_mutex
std::shared_mutex smtx;

void safe_writer() {
    std::unique_lock lock(smtx);  // Exclusive
    data1 = 42;
    data2 = 42;
}

void safe_reader() {
    std::shared_lock lock(smtx);  // Shared with other readers
    int snapshot1 = data1;
    int snapshot2 = data2;  // Consistent
}
```

**Explanation:**
Read-only operations don't conflict with each other, but read-write or write-write do. `std::shared_mutex` allows multiple readers (shared lock) or one writer (unique/exclusive lock) but not both. This improves concurrency for read-heavy workloads while preventing races. Writers must wait for all readers to finish; readers block during writes.

**Key takeaway:** Readers-writer synchronization uses `std::shared_mutex` to allow concurrent reads while ensuring exclusive write access, preventing read-write races.

---

#### Q20: How do you recover from a detected deadlock in a running system?
**Difficulty:** #advanced
**Category:** #threading #deadlock #recovery
**Concepts:** #deadlock_recovery #timeout #transaction_abort

**Answer:**
Use timeout-based detection with rollback (abort transactions, retry), or kill and restart threads/processes. Prevention is vastly preferred over recovery.

**Explanation:**
**Timeout recovery**: Use `timed_mutex::try_lock_for()`. On timeout, assume deadlock, release held locks, backoff, retry. Requires careful state management. **Transaction abort**: In database-like systems, abort one transaction in the deadlock cycle, rollback its changes, retry. Requires atomic commit/rollback. **Thread termination**: Kill one thread in the cycle (harsh, requires cleanup). **Process restart**: Ultimate fallback for critical systems (automotive systems might reboot the module). Recovery is complex and error-prone—deadlock prevention through design is much better.

**Key takeaway:** Deadlock recovery uses timeouts, transaction abort, or thread/process restart, but is complex; prevention through lock ordering is vastly preferred.

---

### PRACTICE_TASKS: Output Prediction and Code Analysis

#### Q1
```cpp
int counter = 0;

void increment() {
    for (int i = 0; i < 10000; ++i) {
        ++counter;
    }
}

int main() {
    std::thread t1(increment);
    std::thread t2(increment);
    t1.join(); t2.join();
    std::cout << counter << "\n";
}
```

#### Q2
```cpp
std::mutex m1, m2;

void thread1() {
    std::lock_guard<std::mutex> lock1(m1);
    std::this_thread::sleep_for(std::chrono::milliseconds(100));
    std::lock_guard<std::mutex> lock2(m2);
    std::cout << "Thread 1\n";
}

void thread2() {
    std::lock_guard<std::mutex> lock2(m2);
    std::this_thread::sleep_for(std::chrono::milliseconds(100));
    std::lock_guard<std::mutex> lock1(m1);
    std::cout << "Thread 2\n";
}
```

#### Q3
```cpp
std::mutex m1, m2;

void safe_thread1() {
    std::lock(m1, m2);
    std::lock_guard<std::mutex> lg1(m1, std::adopt_lock);
    std::lock_guard<std::mutex> lg2(m2, std::adopt_lock);
    std::cout << "Thread 1\n";
}

void safe_thread2() {
    std::lock(m2, m1);
    std::lock_guard<std::mutex> lg2(m2, std::adopt_lock);
    std::lock_guard<std::mutex> lg1(m1, std::adopt_lock);
    std::cout << "Thread 2\n";
}
```

#### Q4
```cpp
std::mutex mtx;
int value = 0;

void check_then_act() {
    if (value < 100) {
        std::this_thread::sleep_for(std::chrono::milliseconds(10));
        std::lock_guard<std::mutex> lock(mtx);
        value += 50;
    }
}

int main() {
    std::thread t1(check_then_act);
    std::thread t2(check_then_act);
    t1.join(); t2.join();
    std::cout << value << "\n";
}
```

#### Q5
```cpp
class Account {
public:
    std::mutex mtx;
    int balance = 100;
};

void transfer(Account& from, Account& to, int amount) {
    std::lock_guard<std::mutex> lock1(from.mtx);
    std::lock_guard<std::mutex> lock2(to.mtx);
    from.balance -= amount;
    to.balance += amount;
}

int main() {
    Account a1, a2;
    std::thread t1(transfer, std::ref(a1), std::ref(a2), 50);
    std::thread t2(transfer, std::ref(a2), std::ref(a1), 30);
    t1.join(); t2.join();
}
```

#### Q6
```cpp
std::mutex mtx;
std::vector<int> data;

int get_or_default(int index) {
    if (index < data.size()) {
        return data[index];
    }
    return -1;
}

void add_item(int value) {
    std::lock_guard<std::mutex> lock(mtx);
    data.push_back(value);
}
```

#### Q7
```cpp
std::atomic<bool> flag1{false};
std::atomic<bool> flag2{false};

void polite1() {
    while (true) {
        flag1 = true;
        if (flag2) {
            flag1 = false;
            std::this_thread::yield();
            continue;
        }
        break;
    }
    std::cout << "Thread 1\n";
    flag1 = false;
}

void polite2() {
    while (true) {
        flag2 = true;
        if (flag1) {
            flag2 = false;
            std::this_thread::yield();
            continue;
        }
        break;
    }
    std::cout << "Thread 2\n";
    flag2 = false;
}
```

#### Q8
```cpp
std::once_flag flag;
int shared_resource = 0;

void initialize() {
    shared_resource = 100;
}

void thread_func() {
    std::call_once(flag, initialize);
    std::cout << shared_resource << "\n";
}

int main() {
    std::thread t1(thread_func);
    std::thread t2(thread_func);
    std::thread t3(thread_func);
    t1.join(); t2.join(); t3.join();
}
```

#### Q9
```cpp
std::timed_mutex tm1, tm2;

void timeout_thread1() {
    if (tm1.try_lock_for(std::chrono::milliseconds(50))) {
        std::this_thread::sleep_for(std::chrono::milliseconds(100));
        if (tm2.try_lock_for(std::chrono::milliseconds(50))) {
            std::cout << "T1 got both\n";
            tm2.unlock();
        } else {
            std::cout << "T1 timeout\n";
        }
        tm1.unlock();
    }
}

void timeout_thread2() {
    if (tm2.try_lock_for(std::chrono::milliseconds(50))) {
        std::this_thread::sleep_for(std::chrono::milliseconds(100));
        if (tm1.try_lock_for(std::chrono::milliseconds(50))) {
            std::cout << "T2 got both\n";
            tm1.unlock();
        } else {
            std::cout << "T2 timeout\n";
        }
        tm2.unlock();
    }
}
```

#### Q10
```cpp
std::shared_mutex smtx;
int data = 0;

void reader(int id) {
    std::shared_lock<std::shared_mutex> lock(smtx);
    std::cout << "Reader " << id << ": " << data << "\n";
}

void writer(int value) {
    std::unique_lock<std::shared_mutex> lock(smtx);
    data = value;
    std::cout << "Wrote " << value << "\n";
}

int main() {
    std::thread r1(reader, 1);
    std::thread r2(reader, 2);
    std::thread w(writer, 42);
    r1.join(); r2.join(); w.join();
}
```

#### Q11
```cpp
std::mutex mtx;
bool initialized = false;
int resource = 0;

void lazy_init() {
    if (!initialized) {
        std::lock_guard<std::mutex> lock(mtx);
        if (!initialized) {
            resource = 100;
            initialized = true;
        }
    }
    std::cout << resource << "\n";
}
```

#### Q12
```cpp
int data1 = 0;
int data2 = 0;

void writer() {
    data1 = 42;
    data2 = 42;
}

void reader() {
    int snapshot1 = data1;
    int snapshot2 = data2;
    if (snapshot1 != snapshot2) {
        std::cout << "Inconsistent\n";
    }
}
```

#### Q13
```cpp
std::atomic<int> flag{0};

void thread1() {
    if (flag.load() == 0) {
        flag.store(1);
        std::cout << "Thread 1 executed\n";
    }
}

void thread2() {
    if (flag.load() == 0) {
        flag.store(1);
        std::cout << "Thread 2 executed\n";
    }
}
```

#### Q14
```cpp
std::mutex mtx;
int counter = 0;

void increment() {
    int temp = counter;
    std::lock_guard<std::mutex> lock(mtx);
    counter = temp + 1;
}

int main() {
    std::thread t1(increment);
    std::thread t2(increment);
    t1.join(); t2.join();
    std::cout << counter << "\n";
}
```

#### Q15
```cpp
class Resource {
public:
    static Resource& instance() {
        static Resource res;
        return res;
    }
private:
    Resource() { std::cout << "Initialized\n"; }
};

int main() {
    std::thread t1([]{ Resource::instance(); });
    std::thread t2([]{ Resource::instance(); });
    std::thread t3([]{ Resource::instance(); });
    t1.join(); t2.join(); t3.join();
}
```

#### Q16
```cpp
std::mutex m1, m2, m3;

void thread_func() {
    std::lock(m1, m2, m3);
    std::lock_guard<std::mutex> lg1(m1);  // Missing adopt_lock
    std::lock_guard<std::mutex> lg2(m2);
    std::lock_guard<std::mutex> lg3(m3);
    std::cout << "Locked all\n";
}
```

#### Q17
```cpp
std::atomic<bool> ready{false};
int data = 0;

void writer() {
    data = 42;
    ready.store(true);
}

void reader() {
    while (!ready.load()) {}
    std::cout << data << "\n";
}
```

#### Q18
```cpp
std::mutex mtx;
std::unordered_map<int, int> cache;

void update(int key) {
    {
        std::lock_guard<std::mutex> lock(mtx);
        int current = cache[key];
    }

    int updated = current + 1;  // current out of scope!

    {
        std::lock_guard<std::mutex> lock(mtx);
        cache[key] = updated;
    }
}
```

#### Q19
```cpp
std::recursive_mutex rmtx;

void outer() {
    std::lock_guard<std::recursive_mutex> lock1(rmtx);
    inner();
    std::cout << "Outer\n";
}

void inner() {
    std::lock_guard<std::recursive_mutex> lock2(rmtx);
    std::cout << "Inner\n";
}

int main() {
    std::thread t(outer);
    t.join();
}
```

#### Q20
```cpp
std::mutex m1, m2;

void thread1() {
    std::lock_guard<std::mutex> lock1(m1);
    std::lock_guard<std::mutex> lock2(m2);
    std::cout << "Thread 1\n";
}

void thread2() {
    std::lock_guard<std::mutex> lock1(m1);
    std::lock_guard<std::mutex> lock2(m2);
    std::cout << "Thread 2\n";
}
```

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
