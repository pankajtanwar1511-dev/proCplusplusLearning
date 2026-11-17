## TOPIC: Mutexes and Lock Types

### INTERVIEW_QA: Interview Questions with Detailed Answers

#### Q1: What does a `std::mutex` guarantee, and what does it not guarantee?
**Difficulty:** #beginner
**Category:** #concurrency #mutex
**Concepts:** #mutual_exclusion #ownership #happens_before

**Answer:**
It guarantees mutual exclusion (one owner at a time), ownership (only the locking thread may unlock), and synchronization (an unlock happens before the next successful lock). It does not guarantee which thread gets it first, fairness, or protection for unlocked accesses.

**Explanation:**
- Protection is a protocol: every access to the shared data, including reads, must hold the same mutex.
- The synchronization part is what makes writes visible: writes before `unlock()` are visible after the next `lock()` of the same mutex.
- No FIFO: a newly arriving thread can acquire the mutex ahead of threads that have been waiting.
- ❌ Common wrong answer: "A mutex makes the variable thread-safe." The mutex knows nothing about the variable. One code path that touches it without the lock reintroduces the data race.
- ✅ What a strong answer adds: the UB list: relocking in the owner thread, unlocking from a non-owner, destroying while locked.

**Key takeaway:** A mutex is exclusion + ownership + synchronization, and it only works if everyone follows the same protocol.

---

#### Q2: Why does a later lock of the same mutex guarantee that thread 2 sees the value thread 1 wrote?
**Difficulty:** #beginner
**Category:** #concurrency #memory_model
**Concepts:** #synchronizes_with #happens_before #mutex

- Thread 1 writes `x = 42` under a mutex.
- Thread 2 later locks the same mutex and reads `x`, and is guaranteed to see 42.

**Answer:**
Because a mutex unlock synchronizes with the next successful lock of the same mutex. That creates a happens-before edge: the write (sequenced before the unlock) happens before the read (sequenced after the lock), so the read must see 42.

**Explanation:**
- Chain: `x = 42` → sequenced before → `unlock()` → synchronizes with → `lock()` in thread 2 → sequenced before → read `x`.
- This holds only if thread 2's lock comes after thread 1's unlock. If thread 2 locks first, it reads 0; both executions are legal.
- Hardware implements this with acquire/release semantics on the lock word (on x86 the locked RMW instructions are full barriers), but that is the mechanism, not the guarantee.
- ❌ Common wrong answer: "Because unlocking flushes the store buffer and the cache." That describes one possible implementation, and it is not how C++ defines the guarantee.
- ✅ What a strong answer adds: "The mutex gives synchronization in the direction the threads actually acquired it; it does not decide that direction."

**Key takeaway:** Explain visibility with unlock synchronizes-with lock (happens-before), not with cache flushes.

---

#### Q3: What is wrong with calling `m.lock()` and `m.unlock()` manually around code that might throw?
**Difficulty:** #beginner
**Category:** #concurrency #raii
**Concepts:** #exception_safety #lock_guard #stack_unwinding

**Answer:**
If the code throws (or returns early), `unlock()` is skipped and the mutex stays locked forever; every other thread that needs it blocks indefinitely. An RAII guard's destructor unlocks during stack unwinding, so it cannot be forgotten.

**Explanation:**
```cpp
#include <iostream>
#include <mutex>
#include <stdexcept>

std::mutex m;

void process() {
    std::lock_guard<std::mutex> g(m);       // unlocks on return AND on exception
    throw std::runtime_error("failure");
}

int main() {
    try { process(); } catch (const std::exception& e) { std::cout << e.what() << '\n'; }
    std::cout << "lock free again: " << m.try_lock() << '\n';   // 1 (try_lock may rarely fail spuriously)
    m.unlock();
}
```
- The guard object's lifetime equals the lock's lifetime: "don't make the programmer remember to unlock".
- ❌ Common wrong answer: "Just add `unlock()` in a catch block." Every new early return or exception path then needs one too; RAII handles all of them.
- ✅ What a strong answer adds: if an exception escapes a `std::thread` entry function, `std::terminate` is called; it does not propagate to the thread that calls `join()`.

**Key takeaway:** Lock ownership should be an object's lifetime, not a pair of calls.

---

#### Q4: What is the difference between `std::lock_guard` and `std::unique_lock`? When do you choose each?
**Difficulty:** #beginner
**Category:** #concurrency #raii
**Concepts:** #lock_guard #unique_lock #defer_lock

**Answer:**
Both are RAII wrappers that hold the mutex exclusively. `lock_guard` locks in its constructor and unlocks in its destructor, nothing else. `unique_lock` adds deferred or timed locking, manual unlock/relock, moving ownership, and is required by `condition_variable`.

**Explanation:**
- Choose `lock_guard` (or `scoped_lock`) for "lock now, unlock at end of scope".
- Choose `unique_lock` when you need: `cv.wait(lk)`, `lk.unlock()` before slow work, `std::defer_lock` with `std::lock`, `try_to_lock`, `try_lock_for` on a timed mutex, or returning the lock from a function.
- `unique_lock` tracks an owns flag, so it is slightly larger (16 vs 8 bytes in libstdc++) and its destructor checks the flag. Negligible next to the lock itself.
- ❌ Common wrong answer: "`unique_lock` gives exclusive locking, `lock_guard` doesn't." Both are exclusive; the distinction is flexibility.
- ❌ Common wrong answer: "Both unlock the mutex in their constructor." They lock in the constructor (by default) and unlock in the destructor.
- ✅ What a strong answer adds: a `unique_lock` object can exist without owning its mutex (after `unlock()` or with `defer_lock`); `owns_lock()` tells you which.

**Key takeaway:** Same exclusivity; `unique_lock` is the flexible one and pays a flag for it.

---

#### Q5: What is `std::scoped_lock`, and should it replace `lock_guard`?
**Difficulty:** #beginner
**Category:** #concurrency #raii
**Concepts:** #scoped_lock #ctad #multiple_mutexes

**Answer:**
`std::scoped_lock` (C++17) is a variadic RAII guard: with one mutex it behaves like `lock_guard`; with several it locks them all using the deadlock-avoidance algorithm of `std::lock` and unlocks all on destruction. It is a good default for new code.

**Explanation:**
- With class template argument deduction: `std::scoped_lock lk(m);` or `std::scoped_lock lk(m1, m2);`.
- Like `lock_guard`, it cannot unlock early, cannot be moved, and cannot be used with condition variables.
- Trap: `std::scoped_lock lk;` (no arguments) compiles and locks nothing.
- Passing the same mutex twice (e.g. self-transfer) is UB; check for aliasing first.
- ❌ Common wrong answer: "`scoped_lock` always releases and retries if it can't get all locks." That is one possible strategy; the standard only guarantees that the multi-lock does not deadlock.
- ✅ What a strong answer adds: deadlock theory belongs to lock ordering; `scoped_lock` is the tool that makes "acquire all at once" correct and exception safe.

**Key takeaway:** `scoped_lock` = `lock_guard` for any number of mutexes, with deadlock avoidance.

---

#### Q6: Why does a `const` getter need a `mutable` mutex, and why does adding a mutex member break copying of a class?
**Difficulty:** #beginner
**Category:** #concurrency #class_design
**Concepts:** #mutable #non_copyable #thread_safe_class

**Answer:**
Locking modifies the mutex, which a `const` member function cannot do unless the mutex is declared `mutable`; locking is not a logical change of the object. And `std::mutex` is neither copyable nor movable, so the class loses its implicit copy and move operations.

**Explanation:**
- Pattern: `mutable std::mutex m_;` plus `lock_guard` in every member function, including `const` readers.
- If copies are needed, write the copy constructor: lock the source's mutex, copy the data, and default-construct the new object's own mutex.
```cpp
#include <mutex>
#include <vector>

class Prices {
    mutable std::mutex m_;
    std::vector<double> v_;
public:
    Prices() = default;
    Prices(const Prices& other) {
        std::lock_guard<std::mutex> g(other.m_);   // lock the source, not ourselves
        v_ = other.v_;
    }
    std::size_t size() const {
        std::lock_guard<std::mutex> g(m_);         // needs mutable
        return v_.size();
    }
};

int main() { Prices a; Prices b(a); return static_cast<int>(b.size()); }
```
- Copy assignment needs both locks: `std::scoped_lock lk(m_, other.m_);` after checking `this != &other`.
- ❌ Common wrong answer: "Make the getter non-const so it can lock." That leaks a threading detail into the interface and breaks const-correct callers.
- ✅ What a strong answer adds: a moved-from or copied mutex would make no sense: ownership belongs to a specific object and the threads using it.

**Key takeaway:** `mutable` mutex for const readers; mutex members make classes non-copyable unless you write the copy yourself.

---

#### Q7: Two threads are started in order T1, T2, and both lock the same mutex. Does T1 get it first? Is `std::mutex` fair?
**Difficulty:** #intermediate
**Category:** #concurrency #mutex
**Concepts:** #fairness #scheduling #starvation

**Answer:**
No. Creation order says nothing about scheduling, and `std::mutex` makes no fairness or FIFO promise. Whichever thread reaches the lock first wins, and a newly arriving thread can even beat threads that have been waiting.

**Explanation:**
- On glibc, an unlock wakes one sleeping waiter, but a thread that is already running can grab the lock before the woken thread is scheduled (barging). The woken thread re-competes.
- Unfair locks are faster (no forced hand-off to a sleeping thread), at the cost of possible starvation.
- If order matters, use an ordering mechanism: `join()`, a condition variable with a predicate, a semaphore or latch, or a release/acquire flag.
- ❌ Common wrong answer: "Waiters are served in arrival order." There is no queue discipline in the standard, and real implementations do not provide one.
- ✅ What a strong answer adds: a ticket lock gives FIFO fairness if you really need it, at a throughput cost.

**Key takeaway:** Mutex = exclusion, not ordering and not fairness.

---

#### Q8: Why does `std::condition_variable::wait` require a `std::unique_lock` and not a `lock_guard`?
**Difficulty:** #intermediate
**Category:** #concurrency #condition_variable
**Concepts:** #unique_lock #wait #mutex_reacquire

**Answer:**
`wait` must atomically release the mutex while the thread sleeps and reacquire it before returning. That needs a lock object whose owned state can change, which `unique_lock` has and `lock_guard` deliberately does not.

**Explanation:**
- Sequence: holds lock → releases mutex and starts waiting (atomically) → woken (or spuriously) → reacquires the mutex → returns with the lock held.
- After `notify_all`, every awakened waiter must reacquire the mutex before `wait` returns. They do not need another notification to do so; while the mutex is busy they wait (typically sleeping) on the mutex, not on the condition variable.
- `std::condition_variable` works only with `std::unique_lock<std::mutex>`; `std::condition_variable_any` accepts any lockable, at some extra cost.
- ❌ Common wrong answer: "Because `unique_lock` is the exclusive lock." `lock_guard` is just as exclusive; the reason is unlock/relock.
- ✅ What a strong answer adds: always wait with a predicate (`cv.wait(lk, [&]{ return ready; })`) because of spurious wakeups and missed notifications.

**Key takeaway:** CV wait unlocks and relocks; only `unique_lock` can be handed over for that.

---

#### Q9: Explain `std::defer_lock`, `std::try_to_lock` and `std::adopt_lock`.
**Difficulty:** #intermediate
**Category:** #concurrency #raii
**Concepts:** #defer_lock #try_to_lock #adopt_lock

**Answer:**
`defer_lock`: associate the mutex but do not lock it yet. `try_to_lock`: call `try_lock` once and record whether it succeeded. `adopt_lock`: the thread already owns the mutex; the wrapper only takes over the unlock.

**Explanation:**
```cpp
#include <iostream>
#include <mutex>

std::mutex a, b, c;

int main() {
    std::unique_lock<std::mutex> la(a, std::defer_lock);     // not locked yet
    std::unique_lock<std::mutex> lb(b, std::defer_lock);
    std::lock(la, lb);                                        // lock both safely

    std::unique_lock<std::mutex> lc(c, std::try_to_lock);    // one attempt, no wait
    if (lc.owns_lock()) std::cout << "got c\n";
    lc.unlock();

    c.lock();                                                 // locked by hand...
    std::lock_guard<std::mutex> gc(c, std::adopt_lock);      // ...the guard only takes over the unlock
}
```
- `lock_guard` and `scoped_lock` accept `adopt_lock`; only `unique_lock` (and `shared_lock`) accept `defer_lock` and `try_to_lock`.
- ❌ Common wrong answer: "`adopt_lock` locks the mutex and adopts it." It never locks. Using it on a mutex you do not own leads to unlocking an unowned mutex: UB.
- ✅ What a strong answer adds: `unique_lock::release()` gives up responsibility without unlocking; the opposite of `adopt_lock`.

**Key takeaway:** defer = wrapper now, lock later; adopt = lock earlier, wrapper now; try = one attempt.

---

#### Q10: Can one thread lock a `std::mutex` and another thread unlock it?
**Difficulty:** #intermediate
**Category:** #concurrency #mutex
**Concepts:** #ownership #semaphore #undefined_behavior

**Answer:**
No. `std::mutex` has ownership: `unlock()` requires that the calling thread owns it, so unlocking from another thread is undefined behaviour. For cross-thread signaling use a semaphore, a condition variable, or an atomic flag.

**Explanation:**
- Mutex = ownership of a critical section. Semaphore = a counter of permits with no owner; any thread may `release()`.
- C++20 provides `std::counting_semaphore` and `std::binary_semaphore` for "thread A finishes, thread B continues" hand-offs.
- RAII naturally respects ownership: the guard is created and destroyed in the thread that locked.
- ❌ Common wrong answer: "A mutex is just a locked/unlocked flag, so anyone can clear it." That describes a binary semaphore or a spinlock you wrote yourself, not `std::mutex`.
- ✅ What a strong answer adds: some implementations happen to allow it (glibc's default mutex does not check the owner), which is exactly why the bug survives testing and fails elsewhere (error-checking or robust mutexes, other platforms).

**Key takeaway:** Mutexes have owners; signals between threads need a semaphore or a condition variable.

---

#### Q11: A thread catches an exception and returns without unlocking its mutex. What happens to the mutex, thread and program?
**Difficulty:** #intermediate
**Category:** #concurrency #mutex
**Concepts:** #thread_exit #mutex_lifetime #undefined_behavior

**Answer:**
A thread ending while it owns a `std::mutex` is undefined behaviour. In practice (glibc) the thread ends, `join()` succeeds, and the mutex stays locked forever: thread exit releases nothing. Other threads that need it block indefinitely, and destroying the still-locked mutex (e.g. at program exit) is undefined behaviour.

**Explanation:**
- Locked state does not keep the thread alive, and the thread ending does not unlock.
- No one can fix it afterwards: only the owner may unlock, and the owner no longer exists.
- If `main` joins a second thread that is blocked on that mutex, `main` hangs too. The hang is caused by the leaked lock, not by `join()` itself.
- ❌ Common wrong answer: "When the thread exits, the OS releases its locks." That is true for some OS-level robust mutexes (`PTHREAD_MUTEX_ROBUST` reports `EOWNERDEAD`), not for `std::mutex`.
- ✅ What a strong answer adds: even single-threaded, a leaked lock is a bug because the mutex will be destroyed while locked.

**Key takeaway:** Thread exit does not unlock; a leaked lock is permanent.

---

#### Q12: What happens if a thread locks the same `std::mutex` twice? When would you use `std::recursive_mutex`?
**Difficulty:** #intermediate
**Category:** #concurrency #mutex
**Concepts:** #recursive_mutex #self_deadlock #reentrancy

**Answer:**
Relocking a `std::mutex` you already own is undefined behaviour; with glibc it blocks forever. `std::recursive_mutex` lets the owner lock repeatedly (unlocking the same number of times), but it is usually a sign of unclear locking design.

**Explanation:**
- The usual source is re-entrancy: public `add_pair()` locks and calls public `add()`, which locks again.
- Preferred fix: private `add_locked()` helpers that document "caller holds the lock", and public methods that lock once.
- Problems with recursive mutexes: they hide which code holds the lock, let nested calls observe half-updated invariants, and cannot be used with `std::condition_variable`.
- Legitimate uses: legacy code, or callbacks into the same object where restructuring is impractical.
- ❌ Common wrong answer: "Relocking just returns immediately because you already own it." That is recursive-mutex behaviour; for `std::mutex` it is UB.
- ✅ What a strong answer adds: `std::unique_lock::lock()` on a lock that already owns its mutex throws `std::system_error` (`resource_deadlock_would_occur`); the wrapper checks its own flag, the raw mutex does not.

**Key takeaway:** `std::mutex` is non-recursive; restructure before reaching for `recursive_mutex`.

---

#### Q13: You have a cache read by many threads and updated rarely. Would you use `std::shared_mutex`? Is it faster than `std::mutex`?
**Difficulty:** #intermediate
**Category:** #concurrency #reader_writer
**Concepts:** #shared_mutex #shared_lock #benchmarking

**Answer:**
It is a reasonable starting point: readers take `std::shared_lock` and run concurrently, writers take `std::unique_lock`. But it is not automatically faster; its bookkeeping costs more than a plain mutex, so short reads often run as fast or faster with `std::mutex`. Benchmark.

**Explanation:**
```cpp
#include <mutex>
#include <shared_mutex>
#include <string>
#include <unordered_map>

class Cache {
    mutable std::shared_mutex m_;
    std::unordered_map<int, std::string> data_;
public:
    std::string read(int k) const {
        std::shared_lock<std::shared_mutex> lk(m_);    // shared: many readers
        auto it = data_.find(k);
        return it == data_.end() ? std::string{} : it->second;
    }
    void write(int k, std::string v) {
        std::unique_lock<std::shared_mutex> lk(m_);    // exclusive (lock_guard also works)
        data_[k] = std::move(v);
    }
};

int main() { Cache c; c.write(1, "x"); return c.read(1) == "x" ? 0 : 1; }
```
- Every reader still does an atomic RMW on the shared lock word, so with many cores the lock's cache line bounces even though readers never block each other.
- Wins appear when read critical sections are long relative to lock overhead and writes are rare.
- `std::atomic` cannot protect an `unordered_map`: the map is many pieces of state (buckets, nodes, size) that must stay consistent together.
- ❌ Common wrong answer: "Use `scoped_lock` for readers." `scoped_lock` takes exclusive ownership; readers need `shared_lock`.
- ✅ What a strong answer adds: alternatives for read-mostly hot paths: immutable snapshots behind an atomic `shared_ptr`, RCU, seqlocks, or sharding.

**Key takeaway:** `shared_mutex` buys reader concurrency, not lower overhead; measure before choosing.

---

#### Q14: What are `try_lock`, `try_lock_for` and `try_lock_until`? Which mutex types support them?
**Difficulty:** #intermediate
**Category:** #concurrency #mutex
**Concepts:** #try_lock #timed_mutex #spurious_failure

**Answer:**
`try_lock` attempts once and returns immediately; every standard mutex has it. `try_lock_for(duration)` and `try_lock_until(time_point)` wait up to a limit and exist only on timed types: `timed_mutex`, `recursive_timed_mutex`, `shared_timed_mutex`.

**Explanation:**
- `std::mutex::try_lock_for` does not exist; such code does not compile.
- `try_lock` may fail spuriously even when the mutex is free. Its `false` means "did not acquire", not "someone holds it".
- `try_lock_for` uses a steady clock; `try_lock_until` with `system_clock` can be affected by wall-clock changes.
- Uses: skip optional work on the hot path (statistics, housekeeping), degrade gracefully, or log a diagnostic when a lock is held suspiciously long.
- ❌ Common wrong answer: "`try_lock` tries for a little while." It does not wait at all.
- ✅ What a strong answer adds: calling `try_lock` on a non-recursive mutex you already own is UB, not a convenient "do I hold it?" check.

**Key takeaway:** `try_lock` never waits; timed waits need a timed mutex.

---

#### Q15: Does every `mutex.lock()` call go into the kernel?
**Difficulty:** #intermediate
**Category:** #concurrency #internals
**Concepts:** #futex #fast_path #syscall

**Answer:**
No. An uncontended lock and unlock are atomic operations in user space. Only when the mutex is held and the waiter decides to sleep does it make a system call (`futex` wait on Linux), and the unlocker makes a wake call only if waiters exist.

**Explanation:**
- glibc's scheme (implementation detail, not a C++ guarantee):
  - Lock fast path: CAS the lock word 0 → 1. Success: done, no kernel.
  - Contended: set the word to 2 ("locked, maybe waiters") and call `futex(FUTEX_WAIT)`; the thread sleeps.
  - Unlock: atomically set it back to 0; if the old value was 2, call `futex(FUTEX_WAKE, 1)`.
- The lock word lives in the process's memory. The kernel only keeps a wait queue keyed by its address while threads sleep.
- ❌ Common wrong answer: "A mutex always goes through the kernel, so atomics are always faster." Uncontended, a mutex costs about two atomic RMWs.
- ❌ Common wrong answer: "The kernel maintains a counter that goes 0, 1, 2." The 0/1/2 states are one library's user-space design; describe it as an example, not as how `std::mutex` works.
- ✅ What a strong answer adds: "Uncontended, a mutex is user-space atomics; under contention it may block via an OS mechanism such as a futex."

**Key takeaway:** Uncontended mutexes never touch the kernel; contended waits may.

---

#### Q16: A thread holds a mutex for 10 minutes and other threads are waiting for it. Are the waiters burning CPU for those 10 minutes?
**Difficulty:** #intermediate
**Category:** #concurrency #internals
**Concepts:** #blocking #spinning #adaptive_mutex

**Answer:**
Normally no. A `std::mutex` waiter may spin briefly (implementation choice), but then it blocks: the OS deschedules it and it uses no CPU until the mutex is released and it is woken. A spinlock, by contrast, would burn a core the whole time.

**Explanation:**
- Why spin at all: if the owner releases within a few hundred nanoseconds, spinning avoids two syscalls and a context switch (microseconds).
- Why not spin forever: with long holds, spinning wastes cores the owner might need, especially when there are more threads than cores.
- glibc's default mutex goes straight to a futex wait after a failed fast path; its adaptive mutex type and many other runtimes spin first.
- Waiting is not the same as blocking: a waiter can spin (active) or sleep (passive).
- ❌ Common wrong answer: "A thread waiting on a mutex keeps checking it in a loop." That describes a spinlock.
- ✅ What a strong answer adds: low-latency systems sometimes choose busy polling on dedicated cores on purpose, trading CPU for avoiding wake-up latency and jitter.

**Key takeaway:** Mutex waiters sleep (maybe after a short spin); spinlock waiters burn CPU.

---

#### Q17: What is lock contention? In a producer/consumer queue protected by one mutex, is the mutex always contended?
**Difficulty:** #intermediate
**Category:** #concurrency #performance
**Concepts:** #contention #producer_consumer #cache_coherence

**Answer:**
Contention means a thread tries to acquire a mutex that another thread currently holds. A shared mutex is not contended by default: if producer and consumer critical sections do not overlap, both acquire it on the fast path. Contention grows with throughput and critical-section length.

**Explanation:**
- No overlap: `[lock push unlock] ... [lock pop unlock]`: synchronized, zero contention.
- High throughput with both threads hammering the queue: overlaps become frequent and some acquisitions must wait, possibly sleep, adding latency and jitter.
- Even "uncontended" hand-offs between two cores move the mutex's cache line back and forth (~50 to 150 ns), which is not free.
- An SPSC ring buffer removes **mutex** contention (no lock, one owner per index) but not **cache-coherence** traffic on the shared indices; that is why head and tail live on separate cache lines.
- ❌ Common wrong answer: "Producer/consumer with a mutex means 99% contention, so the kernel is always involved." Contention depends on overlap, and even contended waits do not necessarily enter the kernel.
- ✅ What a strong answer adds: "SPSC has no contention" is imprecise; say "no lock contention, but the producer and consumer still share cache lines".

**Key takeaway:** Contention = overlapping acquisition attempts; sharing a lock does not imply it.

---

#### Q18: With `std::shared_mutex` and 100 active readers, what happens to an arriving writer? Do new readers queue behind it?
**Difficulty:** #advanced
**Category:** #concurrency #reader_writer
**Concepts:** #writer_starvation #fairness #tail_latency

**Answer:**
The writer must wait until all current readers release. Whether new readers are held back once a writer waits is implementation-defined; with a reader-preferring implementation (glibc's default rwlock) overlapping readers can starve the writer indefinitely.

**Explanation:**
- libstdc++ on Linux builds `std::shared_mutex` on `pthread_rwlock_t` with glibc's default reader-preferring policy. Observed: with 4 overlapping readers, a writer waited about 1 s, exactly until the readers stopped.
- Other implementations may prefer writers or alternate phases; portable code must not rely on either.
- Low-latency consequence: even without full starvation, writer waits are unpredictable, so p99/p99.9 latency spikes on the write path (and on readers queued behind a writer, under writer-preferring policies).
- ❌ Common wrong answer: "Once a writer is waiting, new readers queue after it, so the writer gets in next." That is one possible policy, not a guarantee.
- ✅ What a strong answer adds: choose the lock from the latency requirements, not just the read/write ratio: plain mutex for short sections, copy-on-write snapshots for wait-free reads, or a single-writer design.

**Key takeaway:** `shared_mutex` fairness is unspecified; writers can starve and tail latency suffers.

---

#### Q19: A reader holds a `shared_lock`, finds the key missing, and wants to insert it. Can it upgrade to an exclusive lock?
**Difficulty:** #advanced
**Category:** #concurrency #reader_writer
**Concepts:** #lock_upgrade #self_deadlock #double_checked

**Answer:**
No. `std::shared_mutex` has no upgrade. Requesting `lock()` while the same thread holds a shared lock waits for all readers including itself: undefined behaviour, a self-deadlock in practice. Release the shared lock, take the exclusive lock, then re-check.

**Explanation:**
```cpp
#include <mutex>
#include <shared_mutex>
#include <unordered_map>

std::shared_mutex m;
std::unordered_map<int, int> table;

int get_or_insert(int k) {
    {
        std::shared_lock<std::shared_mutex> r(m);
        if (auto it = table.find(k); it != table.end()) return it->second;
    }                                                // shared lock released here
    std::unique_lock<std::shared_mutex> w(m);
    auto [it, inserted] = table.try_emplace(k, k * 10);   // re-check and insert atomically
    return it->second;
}

int main() { return get_or_insert(3) == 30 ? 0 : 1; }
```
- The re-check matters: between releasing and reacquiring, another thread may have inserted the key.
- Even if upgrades existed, two readers upgrading at once would each wait for the other to leave: a guaranteed deadlock. That is why upgradable locks (e.g. Boost `upgrade_lock`) allow only one upgrader at a time.
- ❌ Common wrong answer: "Just construct a `unique_lock` while still holding the `shared_lock`." It hangs.
- ✅ What a strong answer adds: this is a check-then-act pattern; the gap between the two locks is exactly where the race condition lives.

**Key takeaway:** No upgrade: release, lock exclusively, re-check.

---

#### Q20: Roughly how expensive is an uncontended lock versus a contended one, and where does the cost come from?
**Difficulty:** #advanced
**Category:** #concurrency #performance
**Concepts:** #lock_cost #context_switch #cache_line_bouncing

**Answer:**
Uncontended: two atomic RMWs, a few to ~25 ns when the line is cache-local. Contended but short: cache-line ping-pong, roughly 50 to a few hundred ns per acquisition. Contended with sleeping: futex syscalls plus context switch and wake-up latency, several µs or more.

**Explanation:**
- Measured on one 20-core Linux machine (GCC 11, glibc): uncontended `lock_guard` + increment about 3 ns; 2 threads competing about 50 ns per increment; 8 threads about 100 ns; a relaxed `std::atomic` increment with 8 threads about 13 ns. Numbers vary a lot by CPU; quote orders of magnitude, not exact values.
- Deeper costs of contention:
  - Serialization: only one core makes progress in the critical section (Amdahl's law).
  - Tail latency: the unlucky request waits for a full critical section or a sleep/wake cycle.
  - Lock convoys: if the owner is preempted, every waiter waits for it to be rescheduled.
- ❌ Common wrong answer: "Atomics are always faster than mutexes." A single atomic hammered by many cores also bounces its cache line; per-thread counters or sharding beat both.
- ✅ What a strong answer adds: the fix for contention is structural (shorter critical sections, sharding, single owner), not a "faster lock".

**Key takeaway:** Uncontended locks are cheap; contention costs serialization and tail latency.

---

#### Q21: Tail latency spikes because a reporting thread holds the order-book mutex too long. What do you do?
**Difficulty:** #advanced
**Category:** #concurrency #performance
**Concepts:** #critical_section #snapshot #tail_latency

- p50 latency is normal, but p99.9 jumps to milliseconds.
- Tracing shows a reporting thread occasionally holds the order-book mutex for 5 to 8 ms.

**Answer:**
Shrink the critical section: copy only the needed state under the lock, release it, and build the report from the private snapshot. Better, decouple completely: have the hot path publish snapshots or events to the reporting thread through a queue, so reporting can never block it.

**Explanation:**
- Why only the tail suffers: most market-data messages never collide with a report; the few that do wait milliseconds (and may sleep in a futex wait).
- Snapshot pattern:
```cpp
#include <map>
#include <mutex>
#include <string>

std::mutex m;
std::map<std::string, long> book;

std::string build_report(const std::map<std::string, long>& snap) {
    std::string r;
    for (const auto& [k, v] : snap) r += k + ":" + std::to_string(v) + "\n";
    return r;
}

std::string generate_report() {
    std::map<std::string, long> snapshot;
    {
        std::lock_guard<std::mutex> g(m);
        snapshot = book;               // critical section = one copy
    }
    return build_report(snapshot);     // slow work, no lock
}

int main() { book["AAPL"] = 10; return generate_report().empty() ? 1 : 0; }
```
- Moving code outside the lock is only safe if that code no longer touches shared mutable state; that is why the copy is taken first.
- If even the copy is too large: copy-on-write snapshots (the writer publishes a new immutable version) or an SPSC queue to the reporter.
- ❌ Common wrong answer: "Use a faster mutex or a spinlock." The lock is not slow; the hold time is.
- ✅ What a strong answer adds: never hold a lock across I/O, logging, allocation, callbacks, or waiting on another thread; audit hot-path locks for these.

**Key takeaway:** Fix lock-induced tail latency by shortening hold time, not by changing the lock type.

---

#### Q22: 12 threads share one `unordered_map` behind a global mutex. CPU is 50% but latency is high. How do you redesign it?
**Difficulty:** #advanced
**Category:** #concurrency #design
**Concepts:** #lock_striping #sharding #single_owner

**Answer:**
The global mutex serializes unrelated keys. Partition by key: either one mutex per shard (lock striping), or better, route each shard to a single owning worker so it needs no lock at all. Then check for hot shards and pad shard locks to separate cache lines.

**Explanation:**
- Low CPU plus high latency is the classic sign of threads waiting on a lock rather than working.
- Striping: `shard = hash(key) % N`, each shard `{alignas(64) mutex, map}`. Contention drops roughly by N if keys are evenly spread.
- Single-owner: requests for key K always go to worker `hash(K) % 12`. No lock, preserved per-key ordering, better cache locality.
- Costs: cross-shard operations (multi-key transactions, global iteration) need multiple locks in a fixed order or a coordination step; a hot key still bottlenecks one shard.
- ❌ Common wrong answer: "Sharding means no mutex is needed." Only true if each shard has exactly one owner thread; if several workers can touch a shard, each shard still needs its lock.
- ✅ What a strong answer adds: an array of unpadded `{mutex, data}` shards puts several mutexes on one cache line, so "independent" shards still false-share.

**Key takeaway:** Split by key; prefer single-owner shards over lock-per-shard when routing allows it.
