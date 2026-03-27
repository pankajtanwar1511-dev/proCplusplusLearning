## TOPIC: Deadlocks and Race Conditions - Patterns, Detection, and Prevention

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
