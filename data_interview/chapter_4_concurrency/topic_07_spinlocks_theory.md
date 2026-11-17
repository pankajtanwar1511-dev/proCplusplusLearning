## TOPIC: Spinlocks, Busy-Waiting and Backoff

### THEORY_SECTION: Core Concepts

#### 1. Mental model
- A spinlock is a lock whose waiters **keep running** and re-check the lock instead of going to sleep.
- A blocking mutex says "wake me when it is free"; a spinlock says "I will keep asking, it should be free any moment".
- It trades CPU time for wake-up latency:

| | Spinlock | Blocking mutex (futex-based) |
|---|---|---|
| Waiter state | Running, burning its core | Asleep in the kernel |
| Cost when uncontended | One atomic RMW to lock, one store to unlock | One atomic RMW to lock, one RMW to unlock (no syscall) |
| Cost of a short wait | Tens to hundreds of ns, no syscall | Syscall + context switch + wake-up (microseconds) |
| Cost of a long wait | Wastes a whole core the entire time | Nearly free while asleep |
| Holder preempted | Disaster: waiters spin for a full time slice | Fine: waiters sleep |

- Rule of thumb: spinning only pays when the expected wait is shorter than the cost of sleeping and waking (roughly a few microseconds) **and** the lock holder is guaranteed to be running on another core.

#### 2. A minimal correct spinlock
- Acquire = an atomic read-modify-write that sets "locked" and tells you the previous value.
  - `std::atomic_flag::test_and_set()` or `std::atomic<bool>::exchange(true)`.
  - If the old value was `false`, you own the lock; otherwise somebody else does, so retry.
- Release = a plain atomic store of `false`.
- Memory ordering:
  - `lock()`: `memory_order_acquire` on the successful RMW, so critical-section reads/writes cannot move above it and you see the previous holder's writes.
  - `unlock()`: `memory_order_release`, so your critical-section writes are visible to the next acquirer.
  - Anything weaker (`relaxed`) gives mutual exclusion on the flag but **not** protection of the data: the data accesses become a data race.
- Two threads can never both acquire it: RMW operations on one atomic object are totally ordered (its modification order), and each RMW reads the value written by the previous one in that order. Only one of them can read `false`.
- Name the members `lock()`, `unlock()` (and `try_lock()`) so `std::lock_guard`, `std::unique_lock` and `std::scoped_lock` work with it. Never call them by hand without RAII: an exception would leave it locked forever.

```cpp
class SpinLock {
    std::atomic_flag flag_;                 // C++20: default-initialized to clear
public:
    void lock()     { while (flag_.test_and_set(std::memory_order_acquire)) {} }
    bool try_lock() { return !flag_.test_and_set(std::memory_order_acquire); }
    void unlock()   { flag_.clear(std::memory_order_release); }
};
```

#### 3. Why naive spinning hurts: cache-line ping-pong
- Every `exchange`/`test_and_set` is a **write**, even when it writes `true` over `true`.
- To write, a core needs the cache line in an exclusive state, so with N waiters the line is bounced between cores on every attempt (coherence traffic, MESI-style invalidations).
- Consequences:
  - the interconnect is flooded, slowing unrelated memory traffic on the same line or socket;
  - the **unlocking** store has to fight the same traffic, so the holder releases later;
  - throughput collapses as waiters increase.
- C++ vs hardware: the C++ guarantee is "the RMW is atomic"; cache coherence is how the hardware happens to provide it. Explain correctness in C++ terms, performance in hardware terms.

#### 4. Test-and-test-and-set (TTAS)
- Spin on a plain **load** while the lock is held; attempt the RMW only when it looks free.

```cpp
void lock() {
    while (true) {
        if (!locked_.exchange(true, std::memory_order_acquire)) return;  // try
        while (locked_.load(std::memory_order_relaxed)) cpu_relax();     // test
    }
}
```

- Loads let every waiter keep a **shared** copy of the line in its own cache; no traffic while the holder works.
- On unlock the line is invalidated once, everyone reloads, and a burst of RMWs follows (one wins). This burst is why TTAS still degrades with many waiters.
- The relaxed load is fine: it is only a hint. Correctness comes from the acquire RMW.
- C++20 `std::atomic_flag::test()` allows TTAS with `atomic_flag` too.

#### 5. `pause`, `yield` and backoff
- `cpu_relax()` inside the spin loop:
  - x86: `pause` (`_mm_pause()`): tells the core this is a spin-wait. It saves power, frees resources for the hyper-threaded sibling, and avoids a pipeline flush (memory-order mis-speculation) when the loop exits.
  - Latency varies: about 10 cycles on older Intel cores, about 140 cycles on Skylake and several later cores. Tune spin counts in time, not iterations.
  - ARM: `yield` (some runtimes use `isb` instead).
- `std::this_thread::yield()`: a syscall that offers the CPU to another runnable thread. Weak guarantee (the scheduler may run you again immediately), but useful after spinning for a while.
- Exponential backoff: after each failed attempt wait 2x longer (capped), then yield. It spreads out the RMW bursts and reduces contention, at the cost of fairness and some latency.
- Fair alternatives: ticket locks (FIFO via two counters) and queue locks (MCS/CLH, each waiter spins on its own cache line). The Linux kernel's `qspinlock` is MCS-based.

#### 6. When spinning beats sleeping
- Spinning can win when **all** hold:
  - the critical section is tiny (tens to hundreds of ns, no syscalls, no allocation, no I/O);
  - threads are **pinned** to dedicated cores, with no more runnable threads than cores (no oversubscription);
  - the cost of a sleep/wake (syscall + context switch, a few microseconds, plus cache pollution) is unacceptable, as on a low-latency hot path.
- Spinning loses when:
  - hold times are long or unpredictable (a 10 ms section means waiters burn 10 ms of CPU each);
  - threads outnumber cores: the holder gets preempted and waiters spin away their entire time slices;
  - the machine is shared (containers, laptops, power-limited cores).
- Measured example (20 logical CPUs, 8 threads, tiny section): TTAS ≈ 0.6 to 0.8 s, TAS ≈ 0.9 to 1.3 s, `std::mutex` ≈ 0.9 s. With **80** threads: TAS ≈ 16 to 19 s, TTAS ≈ 3.3 to 4 s, `std::mutex` ≈ 0.8 to 0.9 s. Oversubscription turns spinlocks from "slightly faster" into "20x slower".
- Before reaching for a spinlock on a hot path, ask whether a lock is needed at all: SPSC queues, seqlocks, double buffering or per-thread data often remove it.

#### 7. Preemption and priority inversion
- User-space spinlocks cannot stop the OS from preempting the holder.
  - Holder is preempted inside the critical section: every waiter spins uselessly until the holder is scheduled again, typically a full time slice (milliseconds).
  - Kernel spinlocks avoid this by disabling preemption (and optionally interrupts) while held; user space cannot.
- Priority inversion with real-time priorities:
  - low-priority thread L holds the spinlock; high-priority `SCHED_FIFO` thread H on the **same core** starts spinning;
  - H never blocks, so the scheduler never runs L, so L never releases: a livelock.
  - If L is also a lower-priority `SCHED_FIFO` thread, nothing ever lets it run. If L is a normal (`SCHED_OTHER`) thread, Linux RT throttling (by default RT tasks may use 95% of each second) leaves it a small slice, so it crawls forward.
  - A blocking mutex lets H sleep, so L runs. `PTHREAD_PRIO_INHERIT` mutexes go further and boost L. Spinlocks are invisible to the kernel, so no inheritance is possible.
- Single-core machines: spinning is pure waste, because the holder cannot run while you spin.

#### 8. Hybrid (spin-then-sleep) mutexes
- Idea: spin briefly in user space (the holder will probably release soon); if not, sleep in the kernel.
- Linux building block: the **futex** (fast userspace mutex). The lock word lives in user memory; the kernel is called only to sleep (`FUTEX_WAIT`, which sleeps only if the word still has the expected value) or to wake (`FUTEX_WAKE`).
- Classic 3-state design: `0` = free, `1` = locked, `2` = locked with possible sleepers. Unlock only issues the wake syscall if the state was `2`.
- Typical implementation facts (glibc, Linux):
  - `std::mutex` maps to a default `pthread_mutex_t`: uncontended lock/unlock is a single atomic op in user space, contended lock goes to `futex_wait` **without** spinning.
  - `PTHREAD_MUTEX_ADAPTIVE_NP` spins a bounded number of times before sleeping (spin count tunable via the `glibc.pthread.mutex_spin_count` tunable).
  - Windows `CRITICAL_SECTION` has a configurable spin count; `SRWLOCK` spins briefly.
- C++20 gives a portable building block: `std::atomic<T>::wait/notify_one` (and `atomic_flag::wait`) are futex-like, so a hybrid lock can be written without platform APIs.

#### 9. Misconceptions to unlearn
- ❌ "Spinlocks are faster than mutexes." ✅ Only for very short, rarely contended sections on dedicated cores; oversubscribed they can be 10x to 20x slower.
- ❌ "Low latency means use spinlocks." ✅ Low latency means avoid sharing; prefer lock-free hand-off structures, then consider spinning.
- ❌ "Waiters in `while (exchange(true))` are only reading." ✅ Each `exchange` is a write that demands cache-line ownership; spin on a load (TTAS).
- ❌ "`relaxed` is enough because the flag is atomic." ✅ Lock needs acquire, unlock needs release, or the protected data races.
- ❌ "A `volatile bool` works as a spinlock flag." ✅ `volatile` gives neither atomicity nor ordering; it is a data race.
- ❌ "Atomics work because MESI locks the cache line." ✅ The C++ memory model defines the guarantee; coherence protocols are one way hardware implements it.
- ❌ "`std::mutex` spins before sleeping." ✅ Implementation-defined; glibc's default mutex does not spin at all.
- ❌ "If the holder gets preempted, waiters just wait a bit longer." ✅ They burn whole time slices, and with real-time priorities on one core they can livelock forever.
- ❌ "A spinlock is safe to use like a recursive mutex." ✅ Re-locking from the same thread spins forever (self-deadlock).

### EDGE_CASES: Traps and Misconceptions

#### Edge Case 1: Spinning on a plain or `volatile bool`
- What people assume: "Reading a bool is atomic on x86, so a `bool` flag is fine".
- What happens: concurrent non-atomic read and write is a data race (undefined behaviour). In practice, at `-O2` the compiler may load the flag once and turn `while (flag) {}` into an infinite loop, or (forward-progress rule) delete the empty loop entirely so the waiter does not wait at all; GCC 11 does the latter. Also, check-then-set on a plain bool lets two threads in.
- `volatile` forces reloads but gives no atomic RMW and no ordering: still a race, still broken.
- Fix: `std::atomic_flag` or `std::atomic<bool>` with acquire/release.

#### Edge Case 2: Relaxed ordering on lock or unlock
- `exchange(true, relaxed)` / `store(false, relaxed)` still lets only one thread "own" the flag.
- But critical-section loads/stores may be reordered across the lock operations, and no happens-before exists between holders: the protected data is raced.
- Often appears to work on x86 (strong hardware ordering) and breaks on ARM/POWER or after compiler reordering.

#### Edge Case 3: `compare_exchange` without resetting `expected`
- On failure, `compare_exchange_weak(expected, true)` writes the **current value** (`true`) into `expected`.
- If the loop does not reset `expected = false`, the next iteration is `CAS(true → true)`, which succeeds while somebody else holds the lock: two owners at once.

```cpp
bool expected = false;
while (!locked.compare_exchange_weak(expected, true, std::memory_order_acquire)) {
    expected = false;    // ✅ mandatory; forgetting it breaks mutual exclusion
}
```

#### Edge Case 4: Holder preempted while waiters spin (oversubscription)
- With more runnable threads than cores, the holder can be descheduled mid-section.
- Waiters then spin for whole time slices, and they are the very threads stopping the holder from being rescheduled.
- Measured on a 20-CPU machine with 80 threads: a TAS spinlock took 16 to 19 s for work a `std::mutex` did in under 1 s.

#### Edge Case 5: Priority inversion with real-time threads
- Low-priority holder, high-priority spinner, same core, `SCHED_FIFO`: the spinner never yields, the holder never runs.
- Result: livelock (permanent if both are `SCHED_FIFO`).
- A blocking mutex (ideally with priority inheritance) does not have this failure mode.

#### Edge Case 6: Self-deadlock and missing RAII
- Calling `lock()` twice on the same thread spins forever; spinlocks are never recursive.
- `lock(); work(); unlock();` with a throwing `work()` leaves the lock held, and every later `lock()` spins forever.
- Fix: `std::lock_guard<SpinLock>`; keep callbacks and anything that may re-enter the lock out of the critical section.

#### Edge Case 7: The lock shares a cache line with hot data
- Waiters hammering the lock word invalidate the line that also holds the data the holder is writing (or unrelated hot fields: false sharing).
- Fix: `alignas(std::hardware_destructive_interference_size)` (or `alignas(64)`) for the lock word; ticket locks keep `next` and `serving` on separate lines.

#### Edge Case 8: Spinning on a single core
- If only one core is available (pinned, cgroup-limited, or uniprocessor VM), the holder cannot run while you spin.
- Each acquisition attempt by a waiter costs up to a full time slice. Any spin loop must eventually `yield` or sleep.

### CODE_EXAMPLES: Practical Demonstrations

#### Example 1: Minimal `atomic_flag` spinlock with RAII
- `test_and_set` with acquire, `clear` with release, used through `std::lock_guard`.
```cpp
#include <atomic>
#include <iostream>
#include <mutex>
#include <thread>
#include <vector>

class SpinLock {
    std::atomic_flag flag_;   // C++20: default-constructed clear
public:
    void lock() {
        while (flag_.test_and_set(std::memory_order_acquire)) {
            // spin
        }
    }
    bool try_lock() { return !flag_.test_and_set(std::memory_order_acquire); }
    void unlock() { flag_.clear(std::memory_order_release); }
};

int main() {
    SpinLock lock;
    long counter = 0;
    std::vector<std::thread> ts;
    for (int t = 0; t < 4; ++t)
        ts.emplace_back([&] {
            for (int i = 0; i < 100000; ++i) {
                std::lock_guard<SpinLock> g(lock);   // works: lock()/unlock()
                ++counter;
            }
        });
    for (auto& t : ts) t.join();
    std::cout << "counter=" << counter << '\n';
}
```
- Output: `counter=400000` every run.
- `std::atomic_flag` is the only atomic type the standard guarantees to be lock-free.

#### Example 2: TTAS spinlock with `pause`, usable with `std::scoped_lock`
- Spins on a relaxed load, uses `pause`, and provides `try_lock` so `std::scoped_lock` can lock two of them without deadlock.
```cpp
#include <atomic>
#include <iostream>
#include <mutex>
#include <thread>
#include <vector>
#if defined(__x86_64__) || defined(__i386__)
#include <immintrin.h>
inline void cpu_relax() { _mm_pause(); }
#elif defined(__aarch64__)
inline void cpu_relax() { asm volatile("yield" ::: "memory"); }
#else
inline void cpu_relax() {}
#endif

class TtasSpinLock {
    alignas(64) std::atomic<bool> locked_{false};
public:
    void lock() {
        while (true) {
            if (!locked_.exchange(true, std::memory_order_acquire)) return;
            while (locked_.load(std::memory_order_relaxed)) cpu_relax();
        }
    }
    bool try_lock() {
        return !locked_.load(std::memory_order_relaxed) &&
               !locked_.exchange(true, std::memory_order_acquire);
    }
    void unlock() { locked_.store(false, std::memory_order_release); }
};

struct Account {
    TtasSpinLock lock;
    long balance = 1000;
};

void transfer(Account& from, Account& to, long amount) {
    std::scoped_lock both(from.lock, to.lock);   // needs try_lock (Lockable)
    from.balance -= amount;
    to.balance += amount;
}

int main() {
    Account a, b;
    std::thread t1([&] { for (int i = 0; i < 100000; ++i) transfer(a, b, 1); });
    std::thread t2([&] { for (int i = 0; i < 100000; ++i) transfer(b, a, 1); });
    t1.join();
    t2.join();
    std::cout << "a=" << a.balance << " b=" << b.balance
              << " total=" << a.balance + b.balance << '\n';
}
```
- Output: `a=1000 b=1000 total=2000` (each direction moved 100000 units).
- Opposite lock orders in `t1` and `t2` would deadlock with naive nested locking; `std::scoped_lock` uses a deadlock-avoidance algorithm that relies on `try_lock`.

#### Example 3: Exponential backoff, then yield
- Spreads out retries under contention; after a cap it yields the CPU.
```cpp
#include <atomic>
#include <iostream>
#include <mutex>
#include <thread>
#include <vector>
#if defined(__x86_64__) || defined(__i386__)
#include <immintrin.h>
inline void cpu_relax() { _mm_pause(); }
#else
inline void cpu_relax() {}
#endif

class BackoffSpinLock {
    std::atomic<bool> locked_{false};
public:
    void lock() {
        unsigned backoff = 1;
        while (true) {
            if (!locked_.load(std::memory_order_relaxed) &&
                !locked_.exchange(true, std::memory_order_acquire))
                return;
            if (backoff <= 1024) {
                for (unsigned i = 0; i < backoff; ++i) cpu_relax();
                backoff *= 2;                      // 1, 2, 4, ... 1024 pauses
            } else {
                std::this_thread::yield();         // give the holder a chance
            }
        }
    }
    void unlock() { locked_.store(false, std::memory_order_release); }
};

int main() {
    BackoffSpinLock lock;
    long counter = 0;
    std::vector<std::thread> ts;
    for (int t = 0; t < 8; ++t)
        ts.emplace_back([&] {
            for (int i = 0; i < 100000; ++i) {
                std::lock_guard<BackoffSpinLock> g(lock);
                ++counter;
            }
        });
    for (auto& t : ts) t.join();
    std::cout << "counter=" << counter << '\n';
}
```
- Output: `counter=800000`.
- Backoff improves throughput under contention but is unfair: a thread that just released (and has no backoff) tends to re-acquire first.

#### Example 4: Hybrid spin-then-sleep mutex with C++20 `atomic::wait`
- Bounded spinning, then a futex-style sleep. State `2` means "someone may be sleeping, unlock must wake".
```cpp
#include <atomic>
#include <iostream>
#include <mutex>
#include <thread>
#include <vector>
#if defined(__x86_64__) || defined(__i386__)
#include <immintrin.h>
inline void cpu_relax() { _mm_pause(); }
#else
inline void cpu_relax() {}
#endif

class HybridMutex {
    // 0 = unlocked, 1 = locked (no sleepers), 2 = locked (maybe sleepers)
    std::atomic<int> state_{0};
public:
    void lock() {
        for (int i = 0; i < 100; ++i) {                  // phase 1: spin briefly
            int expected = 0;
            if (state_.load(std::memory_order_relaxed) == 0 &&
                state_.compare_exchange_weak(expected, 1, std::memory_order_acquire,
                                             std::memory_order_relaxed))
                return;
            cpu_relax();
        }
        // phase 2: announce a sleeper (2) and block until the value changes
        while (state_.exchange(2, std::memory_order_acquire) != 0)
            state_.wait(2, std::memory_order_relaxed);
    }
    void unlock() {
        if (state_.exchange(0, std::memory_order_release) == 2)
            state_.notify_one();                          // only pay for a wake if needed
    }
};

int main() {
    HybridMutex m;
    long counter = 0;
    std::vector<std::thread> ts;
    for (int t = 0; t < 32; ++t)                         // more threads than most machines have cores
        ts.emplace_back([&] {
            for (int i = 0; i < 50000; ++i) {
                std::lock_guard<HybridMutex> g(m);
                ++counter;
            }
        });
    for (auto& t : ts) t.join();
    std::cout << "counter=" << counter << '\n';
}
```
- Output: `counter=1600000`.
- This is the classic three-state futex mutex. `atomic::wait(2)` only blocks if the value is still `2`, so a concurrent unlock cannot be missed.

#### Example 5: Ticket lock (FIFO fairness)
- Each waiter takes a ticket; the lock serves tickets in order, so no thread can starve.
```cpp
#include <atomic>
#include <cstdint>
#include <iostream>
#include <mutex>
#include <thread>
#include <vector>
#if defined(__x86_64__) || defined(__i386__)
#include <immintrin.h>
inline void cpu_relax() { _mm_pause(); }
#else
inline void cpu_relax() {}
#endif

class TicketLock {
    alignas(64) std::atomic<std::uint32_t> next_{0};      // ticket dispenser
    alignas(64) std::atomic<std::uint32_t> serving_{0};   // now serving
public:
    void lock() {
        const std::uint32_t my = next_.fetch_add(1, std::memory_order_relaxed);
        while (serving_.load(std::memory_order_acquire) != my) cpu_relax();
    }
    void unlock() {
        // only the holder writes serving_, so load + store is safe
        serving_.store(serving_.load(std::memory_order_relaxed) + 1,
                       std::memory_order_release);
    }
};

int main() {
    TicketLock lock;
    long counter = 0;
    std::vector<std::thread> ts;
    for (int t = 0; t < 4; ++t)
        ts.emplace_back([&] {
            for (int i = 0; i < 100000; ++i) {
                std::lock_guard<TicketLock> g(lock);
                ++counter;
            }
        });
    for (auto& t : ts) t.join();
    std::cout << "counter=" << counter << '\n';
}
```
- Output: `counter=400000`.
- Downside: strict FIFO hurts under oversubscription. If the next ticket holder is descheduled, everybody waits for it ("convoy").

#### Example 6: Measuring TAS vs TTAS vs `std::mutex`
- Same tiny critical section, 8 threads and then 80 threads. Timings are machine-dependent.
```cpp
#include <atomic>
#include <chrono>
#include <iostream>
#include <mutex>
#include <thread>
#include <vector>
#if defined(__x86_64__) || defined(__i386__)
#include <immintrin.h>
inline void cpu_relax() { _mm_pause(); }
#else
inline void cpu_relax() {}
#endif

class TasLock {
    std::atomic<bool> locked_{false};
public:
    void lock() { while (locked_.exchange(true, std::memory_order_acquire)) {} }
    void unlock() { locked_.store(false, std::memory_order_release); }
};

class TtasLock {
    std::atomic<bool> locked_{false};
public:
    void lock() {
        while (true) {
            if (!locked_.exchange(true, std::memory_order_acquire)) return;
            while (locked_.load(std::memory_order_relaxed)) cpu_relax();
        }
    }
    void unlock() { locked_.store(false, std::memory_order_release); }
};

template <class Lock>
void run(const char* name, int threads, int iters) {
    Lock lk;
    long counter = 0;
    auto t0 = std::chrono::steady_clock::now();
    std::vector<std::thread> ts;
    for (int t = 0; t < threads; ++t)
        ts.emplace_back([&] {
            for (int i = 0; i < iters; ++i) {
                std::lock_guard<Lock> g(lk);
                ++counter;
            }
        });
    for (auto& t : ts) t.join();
    auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(
                  std::chrono::steady_clock::now() - t0).count();
    std::cout << threads << " threads, " << name << ": counter=" << counter
              << " time=" << ms << " ms\n";
}

int main() {
    run<TasLock>("TAS ", 8, 1'000'000);
    run<TtasLock>("TTAS", 8, 1'000'000);
    run<std::mutex>("mutex", 8, 1'000'000);
    run<TasLock>("TAS ", 80, 100'000);
    run<TtasLock>("TTAS", 80, 100'000);
    run<std::mutex>("mutex", 80, 100'000);
}
```
- Sample run on a 20-logical-CPU laptop (i9, Linux, glibc):
```
8 threads, TAS : counter=8000000 time=~900-1300 ms
8 threads, TTAS: counter=8000000 time=~600-800 ms
8 threads, mutex: counter=8000000 time=~850-950 ms
80 threads, TAS : counter=8000000 time=~16000-19000 ms
80 threads, TTAS: counter=8000000 time=~3300-4000 ms
80 threads, mutex: counter=8000000 time=~800-950 ms
```
- With threads ≤ cores, TTAS edges out the mutex. Oversubscribed, the spinlocks lose by 4x to 20x because waiters burn the CPU that preempted holders need.

### QUICK_REFERENCE: Cheat Sheet

#### Spinlock variants
| Variant | Spin on | Pros | Cons |
|---|---|---|---|
| TAS (`exchange` / `test_and_set` loop) | RMW | Simplest | Cache-line ping-pong, collapses under contention |
| TTAS | Relaxed load, RMW when free | Quiet while held | Thundering burst on release; unfair |
| TTAS + backoff | Load + growing pauses + yield | Better throughput under contention | More latency, unfair |
| Ticket lock | Load of `serving` | FIFO fair | All waiters on one line; convoys if a waiter is preempted |
| MCS / CLH queue lock | Own cache line | Scales, fair | More complex, per-waiter node |
| Hybrid (spin then futex) | Bounded spin, then sleep | Good default for user space | Two code paths, tuning |

#### Memory orders for a lock
| Operation | Order | Why |
|---|---|---|
| Successful acquire RMW | `acquire` | See previous holder's writes; keep section after it |
| Spin "test" load | `relaxed` | Only a hint; the RMW re-checks |
| Release store | `release` | Publish section writes to next acquirer |
| CAS failure order | `relaxed` | Failed attempt synchronizes nothing |

#### When to spin
| Condition | Spin? |
|---|---|
| Section < ~1 µs, threads pinned, threads ≤ cores | Possibly |
| Unknown or long hold time, syscalls or I/O inside | No |
| More runnable threads than cores / shared machine | No |
| Real-time priorities sharing a core | Never |
| Single core | Never (or yield immediately) |

#### Interview one-liners
| Question | One-liner |
|---|---|
| Spinlock vs mutex? | Spinlock burns CPU to avoid sleep/wake cost; a mutex sleeps. Spin only for tiny sections on dedicated cores. |
| Can two threads both acquire? | No: atomic RMWs on one object are totally ordered; only one reads `false`. |
| Why TTAS? | Spinning on an RMW keeps stealing the cache line; spinning on a load keeps a shared copy. |
| What does `pause` do? | Spin-wait hint: saves power, helps the SMT sibling, avoids a pipeline flush on loop exit. |
| Memory orders? | Acquire on lock, release on unlock; relaxed is only OK for the test load. |
| Holder preempted? | Waiters spin away whole time slices; oversubscription makes spinlocks catastrophically slow. |
| Priority inversion? | High-priority spinner on the holder's core never lets the holder run: livelock. |
| Hybrid mutex? | Spin briefly, then sleep on a futex; unlock wakes only if someone sleeps. |
| Does `std::mutex` spin? | Implementation-defined; glibc's default mutex goes straight to futex wait. |
| Better than a spinlock on a hot path? | Often no lock at all: SPSC queue, seqlock, double buffering, per-thread data. |
