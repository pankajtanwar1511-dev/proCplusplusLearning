# Topic 14: Spin Lock vs Mutex - Performance Comparison

### THEORY_SECTION: Core Concepts and Foundations

**Real-World Analogy: Waiting for Bathroom Door to Unlock**

```
MUTEX (Sleep/Block):
You: Try door → Locked
You: Sit down on bench, take nap 😴
Friend: Finishes, unlocks door, taps your shoulder
You: Wake up, enter bathroom ✓

Pros: Don't waste energy (CPU cycles)
Cons: Takes time to fall asleep and wake up (context switch cost)

SPINLOCK (Busy-Wait):
You: Try door → Locked
You: Stand at door, keep trying handle every millisecond
      "Locked? Try again. Locked? Try again. Locked? Try again..."
Friend: Finishes, unlocks door
You: Instantly enter (already at door!) ✓

Pros: Instant response when unlocked
Cons: Waste energy standing there (CPU cycles burned)
```

**Visual Comparison:**

```
MUTEX (Blocking):
Thread A holds lock
    ↓
Thread B arrives → Tries lock → FAILS → Sleep 😴
    ↓                                       ↓
Thread A releases lock                     ↓
    ↓                                       ↓
OS wakes Thread B (1-10μs) → Thread B acquires lock
    ↓
Thread B enters critical section

Timeline: ~~~~~[Context Switch]~~~~~[Run]
Cost: HIGH (context switch overhead)

SPINLOCK (Busy-Wait):
Thread A holds lock
    ↓
Thread B arrives → Tries lock → FAILS → Spin (loop checking)
    ↓                                       ↓
    ↓                             while (locked) { /* burn CPU */ }
Thread A releases lock                     ↓
    ↓                                       ↓
Thread B immediately detects → Acquires lock (< 1μs)
    ↓
Thread B enters critical section

Timeline: [SpinSpinSpinSpin][Run]
Cost: LOW latency, but wastes CPU if spins long
```

#### 1. Mutex (Blocking Lock)

**Behavior:** Thread sleeps while waiting.

```cpp
std::mutex mtx;

mtx.lock();
// ... critical section ...
mtx.unlock();
```

**When lock contended:**
1. Thread tries to acquire
2. Fails → **yields to OS scheduler**
3. OS puts thread to sleep (context switch ~1-10 μs)
4. Woken when lock available (another context switch)

**Cost:** 2 context switches (~2-20 μs total)

---

#### 2. Spin Lock (Busy-Wait Lock)

**Behavior:** Thread loops (spins) while waiting.

```cpp
std::atomic_flag lock = ATOMIC_FLAG_INIT;

while (lock.test_and_set(std::memory_order_acquire)) {
    // Busy-wait (spin)
}

// ... critical section ...

lock.clear(std::memory_order_release);
```

**When lock contended:**
1. Thread tries to acquire
2. Fails → **spins in loop**
3. Wastes CPU cycles
4. Acquires immediately when available

**Cost:** CPU time (but no context switch)

---

#### 3. When to Use Which?

**Use mutex:**
- Critical section is long (> 1 μs)
- Many threads contending
- Want to yield CPU to other threads

**Use spinlock:**
- Critical section is very short (< 100 ns)
- Low contention
- Real-time requirements (avoid context switch)

---

## Complete Implementations

### Implementation 1: Simple Spin Lock

```cpp
#include <atomic>

class SpinLock {
private:
    std::atomic_flag lock_ = ATOMIC_FLAG_INIT;

public:
    void lock() {
        while (lock_.test_and_set(std::memory_order_acquire)) {
            // Spin (busy-wait)
        }
    }

    void unlock() {
        lock_.clear(std::memory_order_release);
    }
};
```

---

### Implementation 2: Spin Lock with Exponential Backoff

```cpp
#include <atomic>
#include <thread>

class BackoffSpinLock {
private:
    std::atomic_flag lock_ = ATOMIC_FLAG_INIT;

public:
    void lock() {
        int backoff = 1;

        while (lock_.test_and_set(std::memory_order_acquire)) {
            for (int i = 0; i < backoff; ++i) {
                __builtin_ia32_pause();  // CPU pause instruction
            }

            backoff = std::min(backoff * 2, 1024);  // Exponential backoff
        }
    }

    void unlock() {
        lock_.clear(std::memory_order_release);
    }
};
```

**Optimization:** `pause()` reduces power consumption and improves performance.

---

### Implementation 3: Spin-Then-Yield Hybrid

```cpp
#include <atomic>
#include <thread>

class HybridSpinLock {
private:
    std::atomic_flag lock_ = ATOMIC_FLAG_INIT;

public:
    void lock() {
        for (int i = 0; i < 1000; ++i) {  // Spin for a while
            if (!lock_.test_and_set(std::memory_order_acquire)) {
                return;  // Acquired
            }
            __builtin_ia32_pause();
        }

        // Failed to acquire after spinning → yield
        while (lock_.test_and_set(std::memory_order_acquire)) {
            std::this_thread::yield();
        }
    }

    void unlock() {
        lock_.clear(std::memory_order_release);
    }
};
```

---

### EDGE_CASES: Tricky Scenarios and Deep Internals
---

#### Edge Case 1: Priority Inversion

**Problem:** High-priority thread spins while low-priority thread holds lock.

**Solution:** Use mutex (supports priority inheritance on some platforms).

---

#### Edge Case 2: Starvation

**Problem:** Unlucky thread never acquires lock (always preempted).

**Solution:** Backoff or yield.

---

### CODE_EXAMPLES: Practical Demonstrations
---

#### Example 1: Benchmark Spin Lock vs Mutex

This example demonstrates **a direct performance comparison between spin locks and mutexes** under concurrent workload, revealing when each synchronization mechanism is optimal. The benchmark creates multiple threads that repeatedly acquire a lock, increment a counter, and release the lock - simulating a very short critical section typical in high-performance systems.

**What this code does:**
- Uses a templated `benchmark()` function that works with any lock type (SpinLock or std::mutex)
- Creates 4 worker threads that each perform 100,000 lock-acquire-increment-release cycles
- Measures total execution time using high-resolution clock
- The critical section is minimal (just `++counter`), taking only ~1-2 nanoseconds
- Joins all threads before stopping the timer to measure total parallel execution time

**Key concepts demonstrated:**
- **Template-based polymorphism** for lock abstraction (works with any type having `lock()`/`unlock()`)
- **Contention measurement** - 4 threads competing for the same lock creates realistic contention
- **Short critical section advantage** - the ~1ns increment operation is where spinlocks excel
- **Context switch overhead** - mutex threads sleep/wake on contention, adding ~1-10μs per cycle
- **Busy-wait efficiency** - spinlock threads immediately acquire when available (no OS scheduler latency)

**Why this matters:**
In high-frequency trading systems, game engines, and real-time systems, **every microsecond counts**. When critical sections are shorter than a context switch (< 1μs), spinlocks eliminate OS scheduling overhead. However, the benchmark also reveals the tradeoff: spinlocks waste CPU cycles spinning, so they only win when contention is low and critical sections are extremely short.

**Performance implications:**
- Spinlock wins here because 100,000 × (1-2ns critical section + lock overhead) << context switch cost
- With longer critical sections (>1μs), mutex would win by allowing other work during sleep
- With more threads (>CPU cores), spinlocks degrade as threads spin instead of yielding
- Typical output shows 35-40% speedup for spinlock in this short-critical-section scenario

**Real-world applications:**
- **Network packet processing**: Incrementing packet counters (critical section ~2ns)
- **Memory allocators**: Updating free lists in lock-free-adjacent designs
- **Game physics**: Collision detection result aggregation
- **High-frequency trading**: Updating order book snapshots


```cpp
#include <iostream>
#include <chrono>
#include <vector>
#include <thread>

template<typename Lock>
void benchmark(const std::string& name, int num_threads, int iterations) {
    Lock lock;
    int counter = 0;

    auto worker = [&]() {
        for (int i = 0; i < iterations; ++i) {
            lock.lock();
            ++counter;
            lock.unlock();
        }
    };

    auto start = std::chrono::high_resolution_clock::now();

    std::vector<std::thread> threads;
    for (int i = 0; i < num_threads; ++i) {
        threads.emplace_back(worker);
    }

    for (auto& t : threads) {
        t.join();
    }

    auto end = std::chrono::high_resolution_clock::now();
    auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(end - start).count();

    std::cout << name << " (" << num_threads << " threads, " << iterations << " iterations): "
              << ms << " ms\n";
}

int main() {
    benchmark<SpinLock>("Spin Lock", 4, 100000);
    benchmark<std::mutex>("Mutex", 4, 100000);

    return 0;
}
```

**Typical output:**
```
Spin Lock (4 threads, 100000 iterations): 42 ms
Mutex (4 threads, 100000 iterations): 65 ms
```

**Spin lock wins for short critical sections.**

---

### INTERVIEW_QA: Comprehensive Questions and Answers
---

#### Q1: Why does spinlock waste CPU?
Implement this exercise.

Spinning thread consumes 100% of one CPU core:

```cpp
while (lock.test_and_set()) {
    // Infinite loop consuming CPU
}
```

**Mutex:** Sleeping thread uses 0% CPU.

---
#### Q2: What is the pause instruction?
Implement this exercise.

**x86 `pause` instruction:**
- Hints CPU: "I'm in a spin loop"
- Reduces power consumption
- Improves performance on hyperthreaded CPUs

```cpp
while (lock.test_and_set()) {
    _mm_pause();  // or __builtin_ia32_pause()
}
```

---
#### Q3: When is spinlock better than mutex?
Implement this exercise.

**Spin lock wins when:**
- Critical section < 100 ns
- Low contention
- Real-time system (avoid context switch jitter)

**Example:** Incrementing a counter:
```cpp
lock.lock();
++counter;  // ~1 ns
lock.unlock();
```

Context switch (~1 μs) is 1000× longer than critical section!

---
### PRACTICE_TASKS: Output Prediction and Code Analysis
---

#### Q1
Implement ticket spinlock (fair ordering)

Implement this exercise.
#### Q2
Add try_lock() to spinlock

Implement this exercise.
#### Q3
Benchmark critical section length vs performance

Implement this exercise.
#### Q4
Implement reader-writer spinlock

Implement this exercise.
#### Q5
Measure cache coherency traffic (MESI protocol)

Implement this exercise.

---

### QUICK_REFERENCE: Key Takeaways and Comparison Tables
```cpp
// Spin Lock
SpinLock spin;
spin.lock();
// Critical section (< 100 ns)
spin.unlock();

// Mutex
std::mutex mtx;
mtx.lock();
// Critical section (any length)
mtx.unlock();

// RAII
std::lock_guard<std::mutex> guard(mtx);
```

**Key points:**
- Spinlock: Busy-wait (wastes CPU)
- Mutex: Blocks (context switch)
- Spinlock faster for very short critical sections
- Mutex better for long critical sections or high contention
