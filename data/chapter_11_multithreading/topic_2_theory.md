## TOPIC: Mutex and Locking Mechanisms - Synchronization Primitives

### THEORY_SECTION: Core Concepts and Foundations

#### 1. Mutex Overview

**Definition:**
- **Mutex** = Mutual Exclusion
- Fundamental synchronization primitive
- Ensures only ONE thread accesses shared resource at a time
- Protects critical sections from concurrent access

**The Problem: Race Conditions**
```cpp
// ❌ WITHOUT MUTEX - Race condition
int counter = 0;

void increment() {
    ++counter;  // NOT atomic! Actually 3 operations:
                // 1. Load counter from memory
                // 2. Increment in register
                // 3. Store back to memory
}

// Multiple threads → lost updates
```

**Core Mechanism:**

| Operation | Effect | Thread Behavior |
|-----------|--------|----------------|
| `lock()` | Acquire exclusive access | Blocks if already locked |
| `unlock()` | Release exclusive access | Wakes waiting threads |
| Critical section | Code between lock/unlock | Only one thread executes |

---

#### 2. The Need for Synchronization

**What is a Data Race?**
- Multiple threads access shared data concurrently
- At least one is writing
- No synchronization mechanism
- **Result:** Undefined behavior, data corruption

**Example: Counter Increment**

```
Thread 1                Thread 2
--------                --------
Read counter (0)        Read counter (0)
Increment (1)           Increment (1)
Write counter (1)       Write counter (1)

Expected: 2
Actual: 1 (lost update!)
```

**Common Data Race Scenarios:**

| Scenario | Problem | Solution |
|----------|---------|----------|
| Shared counter | Lost updates | Mutex or atomic |
| Shared container | Corruption, crashes | Mutex protection |
| Config reload | Partial reads | Readers-writer lock |
| Bank transfer | Inconsistent state | Multi-mutex locking |

---

#### 3. RAII Locking - The Modern Way

**std::lock_guard - Simple RAII**

```cpp
std::mutex mtx;

void safe_increment() {
    std::lock_guard<std::mutex> lock(mtx);  // ✅ Locks on construction
    ++counter;
    // Exception-safe: always unlocks on destruction
}  // ← Automatic unlock here
```

**Characteristics:**

| Feature | lock_guard | Manual lock/unlock |
|---------|------------|-------------------|
| **Exception Safety** | ✅ Automatic | ❌ Must use try-catch |
| **Early Return Safety** | ✅ Automatic | ❌ Must unlock before return |
| **Overhead** | Zero (compiler optimized) | Same |
| **Flexibility** | Limited | Full control |

**std::unique_lock - Flexible RAII**

```cpp
void flexible_locking() {
    std::unique_lock<std::mutex> lock(mtx);  // Locked

    critical_work();

    lock.unlock();  // ✅ Manual unlock
    non_critical_work();
    lock.lock();    // ✅ Re-lock

    more_critical_work();
}  // Automatic unlock
```

**When to Use Each:**

| Lock Type | Use When... |
|-----------|------------|
| `lock_guard` | Simple scope-based locking |
| `unique_lock` | Need manual lock/unlock control |
| `unique_lock` | Using with condition variables |
| `unique_lock` | Need deferred or timed locking |

---

#### 4. Mutex Types

**Available Mutex Types:**

| Mutex Type | Recursive | Timeout | Shared Lock | Use Case |
|------------|-----------|---------|-------------|----------|
| `std::mutex` | ❌ | ❌ | ❌ | Basic mutual exclusion |
| `std::recursive_mutex` | ✅ | ❌ | ❌ | Nested locking (same thread) |
| `std::timed_mutex` | ❌ | ✅ | ❌ | Timeout-based locking |
| `std::shared_mutex` (C++17) | ❌ | ❌ | ✅ | Multiple readers, one writer |

**std::recursive_mutex Example:**

```cpp
std::recursive_mutex rmtx;

void outer() {
    std::lock_guard<std::recursive_mutex> lock(rmtx);
    inner();  // ✅ OK - can relock
}

void inner() {
    std::lock_guard<std::recursive_mutex> lock(rmtx);  // Same thread
    // Works because mutex is recursive
}
```

**std::timed_mutex Example:**

```cpp
std::timed_mutex tmtx;

if (tmtx.try_lock_for(std::chrono::milliseconds(100))) {
    // ✅ Got lock within 100ms
    critical_section();
    tmtx.unlock();
} else {
    // ❌ Timeout - handle gracefully
    log_contention();
}
```

**std::shared_mutex Example (Readers-Writer Lock):**

```cpp
std::shared_mutex smtx;
std::unordered_map<int, std::string> cache;

void read(int key) {
    std::shared_lock<std::shared_mutex> lock(smtx);  // ✅ Multiple readers OK
    auto value = cache[key];
}

void write(int key, std::string value) {
    std::unique_lock<std::shared_mutex> lock(smtx);  // Exclusive writer
    cache[key] = value;
}
```

**Performance Trade-offs:**

| Mutex Type | Overhead | Notes |
|------------|----------|-------|
| `std::mutex` | Lowest | Best for simple cases |
| `std::recursive_mutex` | ~1.5-2x | Tracks ownership + lock count |
| `std::timed_mutex` | ~1.5-2x | Timeout logic overhead |
| `std::shared_mutex` | ~2-3x reads, ~3-4x writes | Bookkeeping for multiple readers |

---

#### 5. Mutex Design in Real-Time Systems

**Autonomous Vehicle Example:**

```
Sensor Threads:          Shared World Model           Planning Thread:
- Camera (30 Hz)  ─┐                                 ┌─ Path Planning (10 Hz)
- LiDAR (10 Hz)   ─┼──> [Protected by Mutex] <──────┤
- Radar (20 Hz)   ─┘                                 └─ Uses latest data
```

**Lock Granularity Trade-off:**

| Approach | Pros | Cons |
|----------|------|------|
| **Coarse-grained** (One mutex for all) | Simple, no deadlock | High contention, poor scalability |
| **Fine-grained** (Mutex per region) | Low contention, good scalability | Complex, deadlock risk |

**Coarse-Grained Example:**

```cpp
// ❌ One mutex protects entire world model
std::mutex world_mutex;
WorldModel world;

void update_camera_data() {
    std::lock_guard<std::mutex> lock(world_mutex);  // Blocks everything
    world.update_vision();
}

void update_lidar_data() {
    std::lock_guard<std::mutex> lock(world_mutex);  // Also blocks everything
    world.update_lidar();
}
// Problem: Updates serialize even though they touch different data
```

**Fine-Grained Example:**

```cpp
// ✅ Separate mutexes for different data
struct WorldModel {
    std::mutex vision_mutex;
    std::mutex lidar_mutex;
    VisionData vision;
    LiDARData lidar;
};

void update_camera_data() {
    std::lock_guard<std::mutex> lock(world.vision_mutex);  // Only locks vision
    world.vision.update();
}

void update_lidar_data() {
    std::lock_guard<std::mutex> lock(world.lidar_mutex);  // Only locks lidar
    world.lidar.update();
}
// Benefit: Parallel updates possible
```

**Critical Requirements:**

- **Correctness:** No data races, consistent state
- **Performance:** Minimize lock hold time
- **Latency:** Bounded wait times for real-time threads
- **Deadlock Freedom:** Careful lock ordering or std::lock()

---

#### 6. Key Concepts Summary

**RAII Lock Wrappers:**

| Wrapper | Lock on Construction | Manual Lock/Unlock | Movable | Use Case |
|---------|---------------------|-------------------|---------|----------|
| `lock_guard` | ✅ | ❌ | ❌ | Simple scope lock |
| `unique_lock` | ✅ (unless defer_lock) | ✅ | ✅ | Flexible locking |
| `scoped_lock` (C++17) | ✅ | ❌ | ❌ | Multi-mutex lock |

**Locking Strategies:**

```cpp
// Strategy 1: Simple scope lock
{
    std::lock_guard<std::mutex> lock(mtx);
    // Critical section
}  // Auto unlock

// Strategy 2: Deferred lock
std::unique_lock<std::mutex> lock(mtx, std::defer_lock);
// ... preparation ...
lock.lock();  // Lock when ready

// Strategy 3: Multi-mutex (deadlock-free)
std::lock(mtx1, mtx2);  // Atomic acquisition
std::lock_guard<std::mutex> lock1(mtx1, std::adopt_lock);
std::lock_guard<std::mutex> lock2(mtx2, std::adopt_lock);
```

---

### EDGE_CASES: Tricky Scenarios and Deep Internals

#### Edge Case 1: Exception Safety Without RAII

```cpp
std::mutex mtx;
int shared_counter = 0;

void unsafe_increment() {
    mtx.lock();
    ++shared_counter;

    if (shared_counter == 100) {
        throw std::runtime_error("Error!");  // ❌ Lock never released!
    }

    mtx.unlock();  // Never reached if exception thrown
}
```

If an exception is thrown between `lock()` and `unlock()`, the mutex remains locked forever, causing deadlock when any other thread attempts to acquire it. This is why manual locking is dangerous.

**Solution with RAII:**
```cpp
void safe_increment() {
    std::lock_guard<std::mutex> lock(mtx);  // ✅ Auto-unlocks on exception
    ++shared_counter;

    if (shared_counter == 100) {
        throw std::runtime_error("Error!");  // Lock released by destructor
    }
}
```

The `lock_guard` destructor is called during stack unwinding, ensuring the mutex is always released.

#### Edge Case 2: Self-Deadlock with Non-Recursive Mutex

```cpp
std::mutex mtx;

void inner_function() {
    std::lock_guard<std::mutex> lock(mtx);  // ❌ Tries to lock already-held mutex
    // ... code ...
}

void outer_function() {
    std::lock_guard<std::mutex> lock(mtx);
    inner_function();  // Deadlock! Same thread tries to reacquire same mutex
}
```

Standard `std::mutex` does not support recursive locking. When the same thread attempts to lock it twice, it deadlocks waiting for itself to release the lock.

**Solutions:**
1. Use `std::recursive_mutex` (allows same thread to lock multiple times)
2. Refactor to avoid nested locking (better design)

```cpp
std::recursive_mutex rmtx;

void inner_function() {
    std::lock_guard<std::recursive_mutex> lock(rmtx);  // ✅ OK with recursive_mutex
    // ... code ...
}

void outer_function() {
    std::lock_guard<std::recursive_mutex> lock(rmtx);
    inner_function();  // No deadlock - recursive locking allowed
}
```

**Note:** Recursive mutexes have higher overhead and can hide design issues. Prefer refactoring over recursive mutexes.

#### Edge Case 3: Lock Ordering Deadlock

```cpp
std::mutex mtx1, mtx2;

void thread_A() {
    std::lock_guard<std::mutex> lock1(mtx1);  // Lock mtx1 first
    std::this_thread::sleep_for(std::chrono::milliseconds(10));
    std::lock_guard<std::mutex> lock2(mtx2);  // Then lock mtx2
    // Critical section
}

void thread_B() {
    std::lock_guard<std::mutex> lock2(mtx2);  // ❌ Lock mtx2 first
    std::this_thread::sleep_for(std::chrono::milliseconds(10));
    std::lock_guard<std::mutex> lock1(mtx1);  // Then lock mtx1 → DEADLOCK
    // Critical section
}
```

Classic deadlock scenario: Thread A holds mtx1 and waits for mtx2; Thread B holds mtx2 and waits for mtx1. Neither can proceed.

**Solution 1: Consistent Lock Ordering**
```cpp
// Both threads acquire locks in same order
void thread_A() {
    std::lock_guard<std::mutex> lock1(mtx1);  // ✅ Same order
    std::lock_guard<std::mutex> lock2(mtx2);
}

void thread_B() {
    std::lock_guard<std::mutex> lock1(mtx1);  // ✅ Same order
    std::lock_guard<std::mutex> lock2(mtx2);
}
```

**Solution 2: std::lock for Atomic Multi-Lock**
```cpp
void thread_A() {
    std::lock(mtx1, mtx2);  // ✅ Atomically locks both, deadlock-free
    std::lock_guard<std::mutex> lock1(mtx1, std::adopt_lock);
    std::lock_guard<std::mutex> lock2(mtx2, std::adopt_lock);
}

void thread_B() {
    std::lock(mtx1, mtx2);  // ✅ Same - deadlock-free
    std::lock_guard<std::mutex> lock1(mtx1, std::adopt_lock);
    std::lock_guard<std::mutex> lock2(mtx2, std::adopt_lock);
}
```

#### Edge Case 4: Forgetting std::adopt_lock After std::lock

```cpp
std::mutex mtx1, mtx2;

void incorrect_usage() {
    std::lock(mtx1, mtx2);  // ✅ Both mutexes now locked

    std::lock_guard<std::mutex> lock1(mtx1);  // ❌ Tries to lock again → deadlock!
    std::lock_guard<std::mutex> lock2(mtx2);
}

void correct_usage() {
    std::lock(mtx1, mtx2);

    std::lock_guard<std::mutex> lock1(mtx1, std::adopt_lock);  // ✅ Don't re-lock
    std::lock_guard<std::mutex> lock2(mtx2, std::adopt_lock);
}
```

`std::adopt_lock` tells the guard "the mutex is already locked, just manage its lifetime, don't lock it again."

#### Edge Case 5: Mutex Granularity Trade-off

```cpp
// ❌ Too coarse-grained - single mutex for entire data structure
class CoarseGrainedMap {
    std::mutex mtx;
    std::unordered_map<int, std::string> data;
public:
    void insert(int key, std::string value) {
        std::lock_guard<std::mutex> lock(mtx);  // Blocks ALL operations
        data[key] = value;
    }

    std::string lookup(int key) {
        std::lock_guard<std::mutex> lock(mtx);  // Even lookups block each other
        return data[key];
    }
};

// ✅ Fine-grained with shared_mutex - multiple readers, single writer
class FineGrainedMap {
    std::shared_mutex mtx;
    std::unordered_map<int, std::string> data;
public:
    void insert(int key, std::string value) {
        std::unique_lock<std::shared_mutex> lock(mtx);  // Exclusive lock
        data[key] = value;
    }

    std::string lookup(int key) {
        std::shared_lock<std::shared_mutex> lock(mtx);  // ✅ Shared lock - multiple readers OK
        return data[key];
    }
};
```

Coarse-grained locking is simple but creates contention. Fine-grained locking (readers-writer locks, per-bucket locks) improves parallelism but increases complexity.

---

### CODE_EXAMPLES: Practical Demonstrations

#### Example 1: Race Condition Without Synchronization

```cpp
#include <iostream>
#include <thread>
#include <vector>

int counter = 0;  // Shared mutable state

void increment_unsafe() {
    for (int i = 0; i < 100000; ++i) {
        ++counter;  // ❌ Race condition - not atomic
    }
}

int main() {
    std::vector<std::thread> threads;
    for (int i = 0; i < 10; ++i) {
        threads.emplace_back(increment_unsafe);
    }

    for (auto& t : threads) {
        t.join();
    }

    std::cout << "Counter: " << counter << "\n";  // Expected: 1000000, Actual: varies!
}
```

Without synchronization, the counter value is unpredictable, typically much less than 1,000,000 due to lost updates from concurrent increments.

#### Example 2: Fixing Race Condition with std::mutex

```cpp
#include <iostream>
#include <thread>
#include <vector>
#include <mutex>

std::mutex mtx;
int counter = 0;

void increment_safe() {
    for (int i = 0; i < 100000; ++i) {
        mtx.lock();       // Acquire exclusive access
        ++counter;        // ✅ Safe - only one thread at a time
        mtx.unlock();     // Release lock
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

    std::cout << "Counter: " << counter << "\n";  // Always 1000000
}
```

Manual lock/unlock works but is error-prone. Prefer RAII wrappers.

#### Example 3: Exception-Safe Locking with std::lock_guard

```cpp
#include <iostream>
#include <thread>
#include <mutex>
#include <stdexcept>

std::mutex mtx;
int counter = 0;

void increment_with_exception() {
    for (int i = 0; i < 100; ++i) {
        std::lock_guard<std::mutex> lock(mtx);  // ✅ RAII - auto-unlocks
        ++counter;

        if (counter == 50) {
            throw std::runtime_error("Simulated error");  // Lock released automatically
        }
    }
}

int main() {
    try {
        std::thread t1(increment_with_exception);
        std::thread t2(increment_with_exception);

        t1.join();
        t2.join();
    } catch (const std::exception& e) {
        std::cout << "Caught: " << e.what() << "\n";
    }

    std::cout << "Counter: " << counter << "\n";  // Lock was released despite exception
}
```

The `lock_guard` destructor releases the mutex even when exceptions are thrown, preventing deadlocks.

#### Example 4: Protecting Shared Container

```cpp
#include <iostream>
#include <thread>
#include <vector>
#include <mutex>

std::mutex mtx;
std::vector<int> shared_data;

void add_data(int value) {
    std::lock_guard<std::mutex> lock(mtx);
    shared_data.push_back(value);  // ✅ Thread-safe
}

void print_data() {
    std::lock_guard<std::mutex> lock(mtx);
    for (int val : shared_data) {
        std::cout << val << " ";
    }
    std::cout << "\n";
}

int main() {
    std::thread t1(add_data, 1);
    std::thread t2(add_data, 2);
    std::thread t3(add_data, 3);

    t1.join();
    t2.join();
    t3.join();

    print_data();  // Output: 1 2 3 (order may vary)
}
```

All operations on the shared container are protected by the same mutex, ensuring thread safety.

#### Example 5: std::unique_lock for Flexible Locking

```cpp
#include <iostream>
#include <thread>
#include <mutex>

std::mutex mtx;

void flexible_locking() {
    std::unique_lock<std::mutex> lock(mtx);  // Locked

    // Critical section 1
    std::cout << "First critical section\n";

    lock.unlock();  // ✅ Explicitly unlock

    // Non-critical work
    std::this_thread::sleep_for(std::chrono::milliseconds(10));

    lock.lock();  // ✅ Re-lock

    // Critical section 2
    std::cout << "Second critical section\n";

    // Automatically unlocks when lock goes out of scope
}

int main() {
    std::thread t1(flexible_locking);
    std::thread t2(flexible_locking);

    t1.join();
    t2.join();
}
```

`std::unique_lock` allows manual lock/unlock, useful for minimizing lock hold time by releasing during non-critical work.

#### Example 6: Deferred Locking

```cpp
#include <iostream>
#include <thread>
#include <mutex>

std::mutex mtx;

void deferred_lock_example() {
    std::unique_lock<std::mutex> lock(mtx, std::defer_lock);  // ✅ Don't lock yet

    // Do some work without holding the lock
    std::cout << "Preparation work\n";

    lock.lock();  // Now lock when needed
    std::cout << "Critical section\n";
    // Auto-unlocks when lock destructs
}

int main() {
    std::thread t1(deferred_lock_example);
    std::thread t2(deferred_lock_example);

    t1.join();
    t2.join();
}
```

`std::defer_lock` creates an unlocked `unique_lock`, allowing you to control when locking occurs.

#### Example 7: std::lock for Deadlock-Free Multi-Mutex Locking

```cpp
#include <iostream>
#include <thread>
#include <mutex>

std::mutex mtx1, mtx2;
int resource1 = 0, resource2 = 0;

void transfer(int amount) {
    std::lock(mtx1, mtx2);  // ✅ Atomic lock - no deadlock possible

    std::lock_guard<std::mutex> lock1(mtx1, std::adopt_lock);
    std::lock_guard<std::mutex> lock2(mtx2, std::adopt_lock);

    resource1 -= amount;
    resource2 += amount;

    std::cout << "Transferred " << amount << "\n";
}

int main() {
    resource1 = 1000;
    resource2 = 0;

    std::thread t1(transfer, 100);
    std::thread t2(transfer, 200);

    t1.join();
    t2.join();

    std::cout << "Resource1: " << resource1 << ", Resource2: " << resource2 << "\n";
}
```

`std::lock()` locks all mutexes atomically without deadlock, regardless of order. `std::adopt_lock` tells guards the mutexes are already locked.

#### Example 8: std::scoped_lock (C++17) - Simplified Multi-Mutex

```cpp
#include <iostream>
#include <thread>
#include <mutex>

std::mutex mtx1, mtx2;

void modern_multi_lock() {
    std::scoped_lock lock(mtx1, mtx2);  // ✅ C++17 - locks all, RAII, deadlock-free

    // Critical section with both mutexes held
    std::cout << "Both locks acquired\n";

    // Auto-releases both when lock goes out of scope
}

int main() {
    std::thread t1(modern_multi_lock);
    std::thread t2(modern_multi_lock);

    t1.join();
    t2.join();
}
```

`std::scoped_lock` (C++17) combines the benefits of `std::lock()` and `std::lock_guard`, simplifying multi-mutex locking.

---

### QUICK_REFERENCE: Answer Key and Summary Tables

#### Answer Key for Practice Questions

| Q# | Answer | Explanation | Key Concept |
|----|--------|-------------|-------------|
| 1 | Output: < 2000 (value varies, typically 1000-1999) | Race condition - concurrent increments without synchronization | Data race |
| 2 | Deadlock | Same thread tries to lock non-recursive mutex twice | Self-deadlock |
| 3 | Program terminates (std::terminate called) | Uncaught exception in thread (not caught in main) | Thread exception |
| 4 | Undefined behavior (or exception) | Unlocking already-unlocked mutex | Double unlock |
| 5 | Likely deadlock | Lock ordering creates circular wait | Lock ordering deadlock |
| 6 | Deadlock | try to lock already-locked mutexes without adopt_lock | Missing adopt_lock |
| 7 | Output: "Inner" | Recursive mutex allows same thread to relock | Recursive locking |
| 8 | Output: "false" then "true" | defer_lock doesn't lock initially, manual lock acquires it | Deferred locking |
| 9 | Output: "Locked" (if mutex available) | Timeout-based locking succeeds immediately when uncontended | Timed locking |
| 10 | Output includes "Reading" (2x) and "Writing" (order varies) | Multiple readers or single writer | Shared mutex |
| 11 | Deadlock | Non-recursive mutex locked twice by same thread | Self-deadlock |
| 12 | Output: "1 2 3" (order may vary) | Thread-safe container modifications | Container protection |
| 13 | Deadlock on subsequent calls | Early return without unlock | Missing unlock |
| 14 | Output: "Init" (once only) | call_once ensures function runs exactly once | One-time initialization |
| 15 | Output: "Locked both" | Correct use of std::lock with adopt_lock | Multi-mutex locking |
| 16 | Output: "Work" then "Locked again" | unique_lock supports manual lock/unlock | Flexible locking |
| 17 | Compilation error | Mutex is not movable | Non-movable type |
| 18 | Output: "3 2 1" | Recursive mutex allows nested locking | Recursive locking |
| 19 | Program terminates | Uncaught exception in thread | Exception in thread |
| 20 | Output: "true" | Zero timeout try-lock succeeds if uncontended | Try-lock with timeout |

#### Mutex Types Comparison

| Type | Recursive | Timeout | Shared | Use Case |
|------|-----------|---------|--------|----------|
| `std::mutex` | ❌ | ❌ | ❌ | Basic mutual exclusion |
| `std::recursive_mutex` | ✅ | ❌ | ❌ | Nested locking (same thread) |
| `std::timed_mutex` | ❌ | ✅ | ❌ | Timeout-based locking |
| `std::recursive_timed_mutex` | ✅ | ✅ | ❌ | Recursive + timeout |
| `std::shared_mutex` (C++17) | ❌ | ❌ | ✅ | Multiple readers, single writer |
| `std::shared_timed_mutex` (C++14) | ❌ | ✅ | ✅ | Shared + timeout |

#### Lock Wrapper Comparison

| Wrapper | Manual unlock | Deferred lock | Try-lock | Ownership transfer | Use with |
|---------|---------------|---------------|----------|-------------------|----------|
| `std::lock_guard` | ❌ | ❌ | ❌ | ❌ | Simple scope-based locking |
| `std::unique_lock` | ✅ | ✅ | ✅ | ✅ (movable) | Flexible locking, condition variables |
| `std::shared_lock` (C++14) | ✅ | ✅ | ✅ | ✅ (movable) | Shared ownership (readers) |
| `std::scoped_lock` (C++17) | ❌ | ❌ | ❌ | ❌ | Multi-mutex locking |

#### Lock Strategies

| Strategy | Technique | Prevents Deadlock | Complexity |
|----------|-----------|-------------------|------------|
| Lock ordering | Always acquire in same order | ✅ | Low |
| `std::lock()` | Atomic multi-lock with backoff | ✅ | Medium |
| `std::scoped_lock` | C++17 multi-lock RAII | ✅ | Low |
| Try-lock with timeout | Non-blocking attempt, retry | ✅ (with backoff) | Medium |
| Lock-free algorithms | Atomics, no locks | ✅ (no locks) | High |

#### Common Locking Patterns

| Pattern | Code | Use Case |
|---------|------|----------|
| Simple scope lock | `std::lock_guard<std::mutex> lock(mtx);` | Basic mutual exclusion |
| Deferred lock | `std::unique_lock<std::mutex> lock(mtx, std::defer_lock);` | Lock later manually |
| Timed lock | `if (lock.try_lock_for(100ms)) { ... }` | Timeout-based acquisition |
| Multi-mutex | `std::lock(m1, m2);`<br>`std::lock_guard lg1(m1, std::adopt_lock);` | Deadlock-free multi-lock |
| Readers-writer | `std::shared_lock<std::shared_mutex> lock(smtx);` | Multiple readers |
| Exclusive write | `std::unique_lock<std::shared_mutex> lock(smtx);` | Single writer |

#### Deadlock Prevention Summary

| Method | How It Works | Trade-off |
|--------|--------------|-----------|
| Lock ordering | Global order for all locks | Requires discipline across codebase |
| `std::lock()` | Try-lock with backoff | Higher overhead than ordered locking |
| Timeout + retry | Back off if lock not acquired | May cause livelock without backoff |
| Lock hierarchy | Nested locks have ascending levels | Design complexity |
| Avoid nested locks | Single lock per operation | May reduce parallelism |

#### Performance Characteristics

| Operation | Uncontended | Contended | Notes |
|-----------|-------------|-----------|-------|
| `std::mutex` lock/unlock | ~10-30 ns | ~1-10 μs | Futex syscall under contention |
| `std::recursive_mutex` | ~15-40 ns | ~1-10 μs | Higher overhead due to bookkeeping |
| `std::timed_mutex` | ~20-50 ns | ~1-20 μs | Additional timeout logic |
| `std::shared_mutex` read | ~15-40 ns | ~2-15 μs | Scales with reader count |
| `std::shared_mutex` write | ~20-60 ns | ~2-20 μs | Higher overhead than std::mutex |
| Spinlock (busy-wait) | ~5-15 ns | Wastes CPU | Only for very short critical sections |

#### Best Practices Checklist

| Practice | Reason |
|----------|--------|
| ✅ Use RAII lock wrappers | Exception safety, prevent lock leaks |
| ✅ Minimize lock hold time | Reduce contention |
| ✅ Avoid I/O in critical sections | Long hold times degrade performance |
| ✅ Use consistent lock ordering | Prevent deadlock |
| ✅ Prefer `lock_guard` for simple cases | Lowest overhead, simplest API |
| ✅ Use `unique_lock` with condition variables | Required for wait/notify |
| ✅ Profile before optimizing | Avoid premature lock-free complexity |
| ❌ Don't use recursive locks unless necessary | Higher overhead, masks design issues |
| ❌ Don't lock around unknown callbacks | Deadlock and latency risk |
| ❌ Don't move/copy mutexes | Not supported, causes compilation error |
