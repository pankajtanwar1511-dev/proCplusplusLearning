## TOPIC: Mutex and Locking Mechanisms - Synchronization Primitives

### INTERVIEW_QA: Comprehensive Questions

#### Q1: Why is std::lock_guard preferred over manual lock/unlock?
**Difficulty:** #beginner
**Category:** #threading #synchronization #best_practices
**Concepts:** #lock_guard #raii #exception_safety #manual_locking

**Answer:**
`std::lock_guard` provides automatic RAII-based unlock, ensuring the mutex is released even if exceptions are thrown.

**Code example:**
```cpp
// ❌ Manual - exception unsafe
mtx.lock();
++counter;  // If this throws, lock never released
mtx.unlock();

// ✅ RAII - exception safe
std::lock_guard<std::mutex> lock(mtx);
++counter;  // Destructor unlocks even on exception
```

**Explanation:**
Manual locking requires matching every `lock()` with `unlock()`. If an exception is thrown or an early return occurs between them, the mutex remains locked, causing deadlock. `std::lock_guard` uses RAII—its destructor automatically unlocks the mutex when the guard goes out of scope, even during stack unwinding from exceptions. This makes code safer and simpler.

**Key takeaway:** Always use RAII lock wrappers (`lock_guard`, `unique_lock`) instead of manual lock/unlock to ensure exception safety and prevent lock leaks.

---

#### Q2: What happens if an exception is thrown while holding a mutex locked with mtx.lock()?
**Difficulty:** #intermediate
**Category:** #threading #exception_handling
**Concepts:** #mutex #exception_safety #deadlock #stack_unwinding

**Answer:**
The mutex remains locked because `unlock()` is never called, potentially causing permanent deadlock.

**Code example:**
```cpp
std::mutex mtx;

void dangerous() {
    mtx.lock();
    throw std::runtime_error("Error!");  // ❌ Lock never released!
    mtx.unlock();  // Never reached
}
```

**Explanation:**
When an exception is thrown, the stack unwinds, destroying local objects and executing their destructors, but it does not magically call `unlock()`. The mutex remains in locked state. Any subsequent attempt to lock it (including from the same thread if non-recursive) will block forever. This is why manual locking is dangerous and RAII wrappers are essential—their destructors execute during unwinding, releasing resources.

**Key takeaway:** Exceptions bypass normal control flow, skipping any code after the throw; use RAII to ensure cleanup happens via destructors during stack unwinding.

---

#### Q3: What is the difference between std::lock_guard and std::unique_lock?
**Difficulty:** #intermediate
**Category:** #threading #synchronization
**Concepts:** #lock_guard #unique_lock #flexibility #ownership

**Answer:**
`std::lock_guard` is simpler and lighter, locking on construction and unlocking on destruction. `std::unique_lock` is more flexible, supporting manual lock/unlock, deferred locking, and try-locking.

**Code example:**
```cpp
// lock_guard - simple, always locked
std::lock_guard<std::mutex> lg(mtx);  // Locks immediately, unlocks on destruction
// Cannot unlock manually

// unique_lock - flexible
std::unique_lock<std::mutex> ul(mtx, std::defer_lock);  // Doesn't lock yet
ul.lock();     // Manual lock
ul.unlock();   // Manual unlock
ul.lock();     // Can re-lock
```

**Explanation:**
`std::lock_guard` has minimal overhead and is sufficient when you need simple scope-based locking. `std::unique_lock` has slightly more overhead but provides additional capabilities: manual locking/unlocking (to minimize lock hold time), deferred locking (lock later), try-locking (non-blocking attempt), and timed locking (timeout). It's required for condition variables which need to release and reacquire the lock. Choose `lock_guard` for simplicity, `unique_lock` when you need flexibility.

**Key takeaway:** Use `std::lock_guard` for simple scope-based locking; use `std::unique_lock` when you need to manually control lock timing or use condition variables.

---

#### Q4: Can the same thread lock the same std::mutex twice? What happens?
**Difficulty:** #intermediate
**Category:** #threading #mutex_types
**Concepts:** #mutex #recursive_mutex #self_deadlock

**Answer:**
No, attempting to lock the same `std::mutex` twice in the same thread causes deadlock (the thread waits for itself).

**Code example:**
```cpp
std::mutex mtx;

void outer() {
    std::lock_guard<std::mutex> lock1(mtx);  // Locked
    inner();  // Deadlock!
}

void inner() {
    std::lock_guard<std::mutex> lock2(mtx);  // ❌ Same thread tries to lock again
}
```

**Explanation:**
Standard `std::mutex` does not support recursive locking—it's non-reentrant. When a thread attempts to lock a mutex it already holds, it blocks waiting for the lock to become available, but only it can release the lock, creating a deadlock. Use `std::recursive_mutex` if you need nested locking from the same thread, though this often indicates design issues. Recursive mutexes track ownership and a lock count, allowing the same thread to lock multiple times (must unlock same number of times).

**Key takeaway:** `std::mutex` is non-recursive; the same thread cannot lock it twice without deadlocking. Use `std::recursive_mutex` for nested locking, but prefer refactoring code instead.

---

#### Q5: What is std::adopt_lock used for?
**Difficulty:** #intermediate
**Category:** #threading #locking_strategies
**Concepts:** #adopt_lock #std_lock #lock_guard

**Answer:**
`std::adopt_lock` tells a lock wrapper (like `std::lock_guard`) that the mutex is already locked and it should only manage its lifetime, not lock it again.

**Code example:**
```cpp
std::mutex mtx1, mtx2;

std::lock(mtx1, mtx2);  // Locks both atomically

// ✅ adopt_lock - mutexes already locked, just manage ownership
std::lock_guard<std::mutex> lock1(mtx1, std::adopt_lock);
std::lock_guard<std::mutex> lock2(mtx2, std::adopt_lock);
```

**Explanation:**
When using `std::lock()` to atomically lock multiple mutexes (avoiding deadlock), the mutexes are already locked when `std::lock()` returns. Passing `std::adopt_lock` to the lock guard's constructor tells it "don't lock the mutex, just take ownership and unlock it in the destructor." Without this, the guard would try to lock an already-locked mutex, causing deadlock. This pattern combines deadlock-free multi-mutex locking with RAII lifetime management.

**Key takeaway:** Use `std::adopt_lock` with lock wrappers when the mutex is already locked and you just want RAII management of its lifetime.

---

#### Q6: How does std::lock prevent deadlock when locking multiple mutexes?
**Difficulty:** #advanced
**Category:** #threading #deadlock_prevention
**Concepts:** #std_lock #deadlock #multi_mutex #algorithm

**Answer:**
`std::lock()` uses a deadlock-avoidance algorithm, typically trying to lock all mutexes and backing off if any fail, retrying until all are acquired.

**Code example:**
```cpp
std::mutex m1, m2, m3;

std::lock(m1, m2, m3);  // ✅ Locks all atomically, no deadlock
```

**Explanation:**
The implementation typically uses a try-lock algorithm: attempt to lock all mutexes in sequence using `try_lock()`. If any fails (already locked), release all successfully acquired locks and retry. This ensures no circular wait condition. The standard doesn't mandate a specific algorithm, but common implementations use backoff strategies to avoid livelock. Unlike manual locking in arbitrary order (which can deadlock), `std::lock()` guarantees either all mutexes are locked or none are, making it safe regardless of lock ordering across threads.

**Key takeaway:** `std::lock()` uses a deadlock-avoidance algorithm (typically try-lock with backoff) to atomically acquire all mutexes without risk of circular wait.

---

#### Q7: When would you use std::recursive_mutex instead of std::mutex?
**Difficulty:** #intermediate
**Category:** #threading #mutex_types #design
**Concepts:** #recursive_mutex #nested_locking #design_patterns

**Answer:**
When a function that acquires a lock may call another function that also acquires the same lock, and refactoring is impractical.

**Code example:**
```cpp
std::recursive_mutex rmtx;

void process() {
    std::lock_guard<std::recursive_mutex> lock(rmtx);
    helper();  // ✅ OK - recursive_mutex allows same thread to relock
}

void helper() {
    std::lock_guard<std::recursive_mutex> lock(rmtx);  // Same thread, same mutex
    // ...
}
```

**Explanation:**
`std::recursive_mutex` tracks which thread owns it and maintains a lock count. The owning thread can lock it multiple times without deadlock (must unlock the same number of times). Use cases include recursive algorithms where each level needs locking, or legacy code with complex call graphs where refactoring is risky. However, recursive mutexes have higher overhead and can hide design issues—often a sign of poor separation of concerns. Prefer refactoring: split functions into locking and non-locking versions.

**Key takeaway:** Use `std::recursive_mutex` for nested locking by the same thread when refactoring is impractical, but prefer better design over recursive locking.

---

#### Q8: What is the purpose of std::defer_lock?
**Difficulty:** #intermediate
**Category:** #threading #locking_strategies
**Concepts:** #defer_lock #unique_lock #deferred_locking

**Answer:**
`std::defer_lock` creates a `std::unique_lock` without immediately locking the mutex, allowing you to lock it later manually.

**Code example:**
```cpp
std::mutex mtx;

std::unique_lock<std::mutex> lock(mtx, std::defer_lock);  // Not locked yet
// Do some non-critical work
lock.lock();  // Now lock when needed
```

**Explanation:**
By default, `std::unique_lock` locks the mutex in its constructor. Passing `std::defer_lock` suppresses this, creating an unlocked lock object. This is useful when you want to prepare the lock but delay actual locking until later, or when using `std::lock()` to lock multiple mutexes atomically and then transfer ownership to `unique_lock` objects. It's also used with condition variables where you construct the lock early but lock it conditionally based on program logic.

**Key takeaway:** `std::defer_lock` allows creating a `unique_lock` without immediately locking, giving you control over when the lock is acquired.

---

#### Q9: What are the four Coffman conditions for deadlock?
**Difficulty:** #advanced
**Category:** #threading #deadlock #theory
**Concepts:** #coffman_conditions #deadlock #prevention

**Answer:**
1. Mutual exclusion, 2. Hold and wait, 3. No preemption, 4. Circular wait. All four must be present for deadlock.

**Explanation:**
Deadlock occurs when all four conditions hold simultaneously: (1) **Mutual exclusion**: resources cannot be shared (mutexes allow only one owner). (2) **Hold and wait**: threads hold resources while waiting for others (holding lock A while waiting for lock B). (3) **No preemption**: resources cannot be forcibly taken away (you can't force a thread to release a lock). (4) **Circular wait**: circular chain of threads each waiting for a resource held by the next (Thread 1 waits for Thread 2's lock, Thread 2 waits for Thread 1's lock). Breaking any one condition prevents deadlock. Common strategies: enforce lock ordering (prevent circular wait), use `std::lock()` (atomic acquisition), or use try-lock with timeout (allow preemption-like behavior).

**Key takeaway:** Deadlock requires all four Coffman conditions; prevention strategies target breaking at least one condition (commonly circular wait via lock ordering).

---

#### Q10: How does std::timed_mutex differ from std::mutex?
**Difficulty:** #intermediate
**Category:** #threading #mutex_types
**Concepts:** #timed_mutex #timeout #try_lock_for

**Answer:**
`std::timed_mutex` supports timeout-based locking (`try_lock_for`, `try_lock_until`), allowing bounded waiting for a lock.

**Code example:**
```cpp
std::timed_mutex tmtx;

if (tmtx.try_lock_for(std::chrono::milliseconds(100))) {
    // ✅ Got the lock within 100ms
    // Critical section
    tmtx.unlock();
} else {
    // ❌ Timeout - lock not acquired
    std::cout << "Could not acquire lock\n";
}
```

**Explanation:**
`std::mutex::lock()` blocks indefinitely until the lock is acquired. `std::timed_mutex` adds `try_lock_for(duration)` and `try_lock_until(time_point)`, which attempt to acquire the lock within a timeout period. If the lock is acquired before the timeout, they return true; otherwise, they return false. This enables deadlock avoidance (timeout and retry with logging), soft real-time guarantees (bounded wait time), and responsive UI threads (don't block indefinitely). The timeout mechanisms have higher overhead than plain `std::mutex`.

**Key takeaway:** Use `std::timed_mutex` when you need bounded waiting with timeouts, enabling deadlock recovery and responsive real-time systems.

---

#### Q11: What is std::shared_mutex and when would you use it?
**Difficulty:** #advanced
**Category:** #threading #mutex_types #performance
**Concepts:** #shared_mutex #readers_writer_lock #shared_lock

**Answer:**
`std::shared_mutex` (C++17) allows multiple readers or one exclusive writer, improving parallelism for read-heavy workloads.

**Code example:**
```cpp
std::shared_mutex smtx;
std::unordered_map<int, std::string> cache;

void read(int key) {
    std::shared_lock<std::shared_mutex> lock(smtx);  // ✅ Multiple readers allowed
    auto it = cache.find(key);
}

void write(int key, std::string value) {
    std::unique_lock<std::shared_mutex> lock(smtx);  // Exclusive writer
    cache[key] = value;
}
```

**Explanation:**
Traditional `std::mutex` allows only one thread at a time, even for read-only operations. `std::shared_mutex` implements a readers-writer lock: multiple threads can hold shared ownership (readers) simultaneously, but exclusive ownership (writers) requires no other owners. This significantly improves performance for read-heavy scenarios like caches, configuration data, or lookup tables. Use `std::shared_lock` for readers (shared ownership) and `std::unique_lock` for writers (exclusive ownership). Note: write operations are slower than with `std::mutex` due to bookkeeping overhead.

**Key takeaway:** Use `std::shared_mutex` for read-heavy workloads where multiple concurrent readers improve throughput without data races.

---

#### Q12: Why should you avoid holding locks while calling unknown code or I/O operations?
**Difficulty:** #advanced
**Category:** #threading #best_practices #performance
**Concepts:** #lock_duration #latency #deadlock_risk

**Answer:**
Unknown code might acquire other locks (risking deadlock), block for long periods (causing contention), or throw exceptions (complicating recovery).

**Explanation:**
Holding a lock during slow operations (I/O, network calls, unknown callbacks) keeps the lock held longer, increasing contention and reducing parallelism. Other threads block waiting for the lock, degrading throughput. Additionally, calling unknown code while holding a lock risks deadlock if that code attempts to acquire locks in different order. Long critical sections violate the principle of minimizing lock hold time. Best practice: acquire lock, copy/move needed data, release lock, then perform slow operations. For writes, prepare data outside lock, then acquire lock briefly to update shared state.

**Key takeaway:** Minimize lock hold time; avoid I/O and unknown code in critical sections to reduce contention and deadlock risk.

---

#### Q13: What is the performance cost of a mutex lock/unlock operation?
**Difficulty:** #advanced
**Category:** #threading #performance
**Concepts:** #mutex_overhead #performance #benchmarking

**Answer:**
Uncontended: ~10-30ns (atomic operations). Contended: ~1-10μs+ (kernel syscalls for futex sleep/wake).

**Explanation:**
Modern mutexes use futexes (fast userspace mutexes) on Linux: uncontended lock is just an atomic compare-and-swap (~10-30 nanoseconds). Contention requires kernel syscalls to put threads to sleep and wake them, costing microseconds. For fine-grained locking (locking per operation on small data), overhead can dominate useful work. Lock-free algorithms using atomics can avoid this overhead but are complex. For coarse-grained locking (lock per batch of operations), overhead is amortized. Profile before optimizing—premature lock removal can introduce race conditions.

**Key takeaway:** Mutex overhead is low when uncontended (~10-30ns) but rises significantly under contention (~μs); design lock granularity based on profiling actual workload.

---

#### Q14: Can you move a std::mutex? Why or why not?
**Difficulty:** #intermediate
**Category:** #threading #move_semantics
**Concepts:** #mutex #non_movable #deleted_operations

**Answer:**
No, `std::mutex` is neither copyable nor movable; both operations are deleted.

**Code example:**
```cpp
std::mutex m1;
std::mutex m2 = std::move(m1);  // ❌ Compilation error
```

**Explanation:**
Mutexes represent system resources (kernel objects on many platforms). Moving a mutex is problematic: what happens if a thread holds the lock on the source mutex during move? The lock would point to the old mutex, creating undefined behavior. Additionally, mutexes are often referenced by address (e.g., in condition variables). Moving would invalidate these references. The standard prevents these issues by making mutexes non-copyable and non-movable. If you need movable locking, wrap the mutex in a container (e.g., `std::unique_ptr<std::mutex>`) or use higher-level abstractions.

**Key takeaway:** Mutexes are non-copyable and non-movable to prevent resource aliasing issues; use indirection (pointers) if you need transferable locking.

---

#### Q15: What is lock-free programming and how does it differ from using mutexes?
**Difficulty:** #advanced
**Category:** #threading #lock_free #performance
**Concepts:** #lock_free #atomic #mutex #comparison

**Answer:**
Lock-free programming uses atomic operations to coordinate threads without mutexes, guaranteeing system-wide progress even if individual threads are delayed.

**Explanation:**
Mutex-based programming can suffer from priority inversion, deadlock, and convoy effects (all threads blocked on slow critical section). Lock-free algorithms use atomic compare-and-swap (CAS) operations to ensure at least one thread makes progress at all times, regardless of thread scheduling. They're harder to implement correctly but offer better worst-case latency and scalability. Mutexes are simpler, easier to reason about, and sufficient for most applications. Lock-free is used in high-performance scenarios: memory allocators, concurrent data structures, real-time systems. Not all operations can be made lock-free (e.g., operations requiring global invariants).

**Key takeaway:** Lock-free programming uses atomics instead of mutexes for guaranteed progress, better latency, but higher complexity; use mutexes for simplicity unless profiling shows contention bottlenecks.

---

#### Q16: How would you implement a thread-safe singleton using mutexes?
**Difficulty:** #advanced
**Category:** #threading #design_pattern
**Concepts:** #singleton #double_checked_locking #meyers_singleton

**Answer:**
Use Meyers' Singleton (C++11 guarantees thread-safe static initialization) or double-checked locking pattern.

**Code example:**
```cpp
// ✅ Meyers' Singleton - simplest and safest (C++11+)
class Singleton {
public:
    static Singleton& instance() {
        static Singleton instance;  // Thread-safe initialization
        return instance;
    }
private:
    Singleton() = default;
    Singleton(const Singleton&) = delete;
};

// ✅ Double-checked locking (explicit control)
class Singleton2 {
    static std::atomic<Singleton2*> instance;
    static std::mutex mtx;
public:
    static Singleton2* getInstance() {
        Singleton2* tmp = instance.load(std::memory_order_acquire);
        if (tmp == nullptr) {
            std::lock_guard<std::mutex> lock(mtx);
            tmp = instance.load(std::memory_order_relaxed);
            if (tmp == nullptr) {
                tmp = new Singleton2();
                instance.store(tmp, std::memory_order_release);
            }
        }
        return tmp;
    }
};
```

**Explanation:**
Pre-C++11, singleton initialization required manual locking. C++11 guarantees thread-safe static local variable initialization—the simplest solution. For explicit control or C++03, use double-checked locking: check instance without lock (fast path), lock only if null, check again inside lock (thread may have initialized while waiting), then create. Requires atomic operations for correctness. Prefer Meyers' Singleton for simplicity.

**Key takeaway:** Use Meyers' Singleton (static local variable) for thread-safe singleton in C++11+; it's simpler and guaranteed safe by the standard.

---

#### Q17: What is priority inversion and how do mutexes contribute to it?
**Difficulty:** #advanced
**Category:** #threading #real_time #scheduling
**Concepts:** #priority_inversion #real_time #mutex

**Answer:**
Priority inversion occurs when a high-priority thread waits for a lock held by a low-priority thread, which is preempted by medium-priority threads.

**Explanation:**
In real-time systems with priority scheduling: Low-priority thread L locks a mutex. High-priority thread H arrives and blocks waiting for the mutex. Medium-priority threads M preempt L (higher priority than L but lower than H), preventing L from releasing the lock. H is effectively blocked by M, inverting their priorities. This caused the Mars Pathfinder mission failure. Solutions: priority inheritance (temporarily boost L's priority to H's while holding the lock), priority ceiling (lock owner inherits highest priority of all threads that might use that lock), or use lock-free algorithms. Standard mutexes don't provide priority inheritance on all platforms.

**Key takeaway:** Priority inversion in mutex-based systems can cause high-priority threads to be blocked by low-priority work; use priority inheritance or lock-free algorithms in real-time systems.

---

#### Q18: How does std::call_once with std::once_flag compare to mutex-based initialization?
**Difficulty:** #advanced
**Category:** #threading #initialization
**Concepts:** #call_once #once_flag #initialization

**Answer:**
`std::call_once` guarantees a function executes exactly once across all threads, simpler and more efficient than manual mutex-based initialization.

**Code example:**
```cpp
std::once_flag flag;

void initialize() {
    std::cout << "Initialized\n";
}

void thread_func() {
    std::call_once(flag, initialize);  // ✅ Executed only once total
}

int main() {
    std::thread t1(thread_func);
    std::thread t2(thread_func);
    std::thread t3(thread_func);

    t1.join(); t2.join(); t3.join();  // "Initialized" printed once
}
```

**Explanation:**
Manual initialization with a flag and mutex requires careful double-checked locking to avoid race conditions and minimize overhead. `std::call_once` encapsulates this pattern: it ensures the callable is executed exactly once, blocking other threads until completion. If the callable throws, another thread may retry. It's optimized internally (likely using similar techniques to double-checked locking) and provides clearer intent than manual patterns. Use for lazy initialization of expensive resources.

**Key takeaway:** Use `std::call_once` with `std::once_flag` for thread-safe one-time initialization; it's simpler and clearer than manual mutex-based patterns.

---

#### Q19: In autonomous driving systems, why might spinlocks be preferred over mutexes for very short critical sections?
**Difficulty:** #advanced
**Category:** #threading #real_time #performance
**Concepts:** #spinlock #mutex #real_time #latency

**Answer:**
Spinlocks avoid kernel context switches for sub-microsecond critical sections, providing lower latency than mutexes which involve syscalls.

**Explanation:**
When a thread blocks on a mutex, the kernel puts it to sleep (context switch, ~1-10μs overhead) and wakes it later (another context switch). For critical sections shorter than this (~100-500ns), the overhead dominates useful work. Spinlocks busy-wait (loop checking lock state), avoiding kernel involvement. For real-time perception algorithms processing 30Hz camera frames, a 10μs mutex overhead is acceptable, but for inter-thread communication in microsecond-scale control loops, spinlocks reduce jitter. Downsides: spinlocks waste CPU, are unfair, and can cause starvation. Use only when critical section is shorter than context switch cost and threads won't be preempted.

**Key takeaway:** Spinlocks trade CPU cycles for lower latency, suitable for very short critical sections in real-time systems where context switch overhead is unacceptable.

---

#### Q20: What is the convoy effect and how do mutexes contribute to it?
**Difficulty:** #advanced
**Category:** #threading #performance
**Concepts:** #convoy_effect #mutex #performance

**Answer:**
The convoy effect occurs when threads queue behind a slow critical section holder, all waking serially and re-blocking, creating bursts of contention.

**Explanation:**
When one thread holds a mutex and performs slow work (page fault, I/O, cache miss), waiting threads queue. When the holder releases the lock, the kernel wakes the next waiter, which acquires the lock, performs its work, and releases. Each wake-acquire-release cycle has overhead. If multiple threads wake simultaneously (thundering herd), they all compete for the lock, causing cache bouncing. This creates periodic bursts of contention. Solutions: minimize lock hold time, use readers-writer locks for read-heavy workloads, batch operations outside locks, or use lock-free algorithms. The effect is worse on NUMA systems with cross-socket synchronization.

**Key takeaway:** Convoy effect causes serialized execution and periodic contention bursts when many threads queue on a mutex; minimize lock hold time and avoid slow operations in critical sections.

---
