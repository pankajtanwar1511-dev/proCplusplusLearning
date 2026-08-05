## TOPIC: Concurrency & Synchronization Primitives

### THEORY_SECTION: How Linux Lets Multiple Threads Safely Touch the Same RAM

Every multi-threaded program eventually asks the same question: *two threads want to touch the same memory at the same time — who wins, and how does the kernel make sure nobody sees garbage?* This topic builds the full answer from the ground up: spinlocks vs mutexes vs read-write locks, the `futex()` mechanism that makes `std::mutex` cheap when there's no contention, deadlocks and how to avoid them, condition variables, lock-free atomics, RCU, and priority inversion. Everything here builds directly on two facts already established earlier in this chapter: a **thread context switch costs ~100-300 ns** (cache-warm, no CR3 reload), and **`LOCK`-prefixed instructions like `LOCK CMPXCHG` are the CPU's atomic read-modify-write primitive**. Keep both numbers in your head — they are the reason every design decision in this topic exists.

---

#### 6.1 Spinlock vs Mutex vs Read-Write Lock — The Core Decision

**The fundamental trade-off:** when a thread can't get a lock, it has exactly two choices — **keep the CPU and burn cycles checking in a tight loop** (spinlock), or **give the CPU back to the scheduler and go to sleep** (mutex). Which is correct depends entirely on *how long the lock will be held*.

**1. Spinlock — busy-wait, zero context switch**

```c
// Simplified spinlock using an atomic flag
typedef struct { atomic_int locked; } spinlock_t;

void spin_lock(spinlock_t *lock) {
    int expected;
    do {
        expected = 0;
        // Atomically: if locked==0, set it to 1 and return true. Else return false.
    } while (!atomic_compare_exchange_weak(&lock->locked, &expected, 1));
    // Loop spins here, burning CPU, until the CAS succeeds
}

void spin_unlock(spinlock_t *lock) {
    atomic_store(&lock->locked, 0);
}
```

- No syscall, no context switch — just a tight `LOCK CMPXCHG` retry loop.
- The waiting thread **never leaves the CPU**. It stays scheduled, spinning, using 100% of its core the entire time it waits.
- Only makes sense if the critical section is **shorter than the cost of a context switch** (~100-300 ns for a thread switch, more like 1,000-3,000 ns for a process switch — both established in Topic 1/3 of this chapter). If the lock is typically held for 50 ns, spinning for 50 ns beats sleeping (sleeping costs you a syscall entry ~100 ns *plus* a context switch *plus* a context switch back later).
- This is exactly why the **Linux kernel itself uses spinlocks internally** for extremely short critical sections (e.g. protecting a few-instruction update to a run-queue), but application code almost never should — kernel code runs with preemption/interrupts controlled, user-space code does not, and the OS scheduler can preempt a spinning user thread at the worst possible moment (see Common Pitfall below).

**2. Mutex — sleep, kernel-mediated**

```c
pthread_mutex_t lock = PTHREAD_MUTEX_INITIALIZER;

pthread_mutex_lock(&lock);   // Blocks the calling thread if contended
// ... critical section ...
pthread_mutex_unlock(&lock);
```

- If uncontended: resolves via a single atomic instruction in **user space**, no syscall at all (see §6.2 — this is the whole point of `futex`).
- If contended: the waiting thread is put to sleep (`TASK_INTERRUPTIBLE`, the same state introduced for blocking I/O earlier in this chapter) and **removed from the CPU entirely** — zero CPU burned while waiting, but paying a syscall + two context switches (one out, one back in when woken) when it actually blocks.
- Correct choice when the critical section is long, or contention is common/unpredictable.

**3. Read-Write Lock — many readers, one writer**

```c
pthread_rwlock_t rwlock = PTHREAD_RWLOCK_INITIALIZER;

pthread_rwlock_rdlock(&rwlock);   // Multiple threads can hold this simultaneously
// ... read-only access ...
pthread_rwlock_unlock(&rwlock);

pthread_rwlock_wrlock(&rwlock);   // Exclusive — blocks ALL readers and writers
// ... mutation ...
pthread_rwlock_unlock(&rwlock);
```

- Correct when reads vastly outnumber writes (e.g. a config table read on every request, updated once a minute).
- Internally still uses the same futex-style fast/slow path machinery as a mutex — a reader "lock" is really just an atomic increment of a shared reader-count, with a writer needing that count to hit zero.
- **Not automatically faster than a plain mutex** — if writes are frequent, the extra bookkeeping (tracking reader counts, avoiding writer starvation) can make an `rwlock` *slower* than a simple mutex. Always benchmark before assuming.

**Decision table:**

| Situation | Use | Why |
|---|---|---|
| Critical section shorter than ~100-300 ns, low contention expected | Spinlock (kernel code, or a carefully audited lock-free hot path) | Sleeping would cost more than spinning |
| Critical section length unpredictable / usually longer than a context switch | Mutex | Sleeping frees the CPU for other work instead of burning cycles |
| Read-heavy, write-rare, reads can tolerate the rwlock's own overhead | Read-Write Lock | Lets concurrent readers proceed in parallel |
| Read-heavy, near-zero reader overhead required, writer latency less critical | RCU (§6.7) | Readers pay literally nothing — no atomic instruction at all |
| Multiple threads producing/waiting on a state change (not just protecting data) | Mutex + Condition Variable (§6.5) | Locks alone can't make a thread *wait for an event* efficiently |

**Common Pitfall — the "preempted lock holder" spinlock trap:** if Thread A grabs a spinlock and then gets **preempted by the scheduler** (its timeslice simply ran out, unrelated to the lock), every other thread spinning on that lock keeps burning CPU for the *entire remainder of Thread A's involuntary wait* — potentially milliseconds, not nanoseconds. This is why user-space spinlocks are dangerous without real-time scheduling guarantees: the OS gives no promise about *when* the lock holder resumes running.

---

#### 6.2 Fast Userspace Mutexes — `sys_futex()`

**The core insight `futex` is built on:** most lock acquisitions in real programs are **uncontended** — nobody else wants the lock right now. Paying a syscall (a Ring 3 → Ring 0 transition, easily 100+ ns) on *every single lock/unlock*, even when nothing is contended, would be wasteful. `futex` ("fast userspace mutex") is designed so the **overwhelmingly common uncontended case never enters the kernel at all**.

**The uncontended fast path (100% user space):**

```c
// Simplified userspace mutex state: 0 = unlocked, 1 = locked, no waiters
atomic_int lock_word = 0;

void fast_lock(atomic_int *lock_word) {
    int expected = 0;
    // Single atomic instruction: LOCK CMPXCHG
    if (atomic_compare_exchange_strong(lock_word, &expected, 1)) {
        return;   // Got it! Zero syscalls, just one LOCK CMPXCHG (~20-30ns).
    }
    slow_lock(lock_word);   // Someone else holds it — fall through to the syscall path
}
```

1. `pthread_mutex_lock()` executes a single `LOCK CMPXCHG` on the mutex's memory word — atomically: "if the word is 0 (unlocked), set it to 1 (locked) and tell me it worked."
2. If the CAS succeeds → **done**. This is the entire cost of acquiring an uncontended lock: one atomic instruction, no syscall, no context switch, a handful of nanoseconds.

**The contended slow path (enters the kernel):**

```c
void slow_lock(atomic_int *lock_word) {
    int expected;
    do {
        expected = atomic_load(lock_word);
        if (expected == 0) {
            if (atomic_compare_exchange_weak(lock_word, &expected, 1)) return;
            continue;
        }
        // Word is 1 (locked) — mark it as "2 = locked, has waiters" so the unlocker knows to wake someone
        if (expected == 1) atomic_compare_exchange_strong(lock_word, &expected, 2);
        // Ask the kernel to sleep THIS thread until *lock_word changes from 2
        syscall(SYS_futex, lock_word, FUTEX_WAIT, 2, NULL, NULL, 0);
    } while (1);
}

void unlock(atomic_int *lock_word) {
    if (atomic_fetch_sub(lock_word, 1) != 1) {
        // Value wasn't 1 (i.e. was 2 — there ARE waiters) — must wake one
        atomic_store(lock_word, 0);
        syscall(SYS_futex, lock_word, FUTEX_WAKE, 1, NULL, NULL, 0);
    }
    // else: value was 1, nobody was waiting — just decremented to 0, done, no syscall!
}
```

Step by step, contended case:

```
Thread A: holds the lock (lock_word = 1)
Thread B: tries to lock -> CAS(0,1) fails, word is already 1
          -> Thread B sets word to 2 ("locked, waiter present")
          -> Thread B calls futex(FUTEX_WAIT, lock_word, 2)
             |
             v
KERNEL: looks up the futex wait queue keyed by the PHYSICAL address of lock_word
        checks: is *lock_word still == 2? (avoids a lost-wakeup race)
        YES -> puts Thread B on the wait queue, sets Thread B state = TASK_INTERRUPTIBLE
               Thread B is now OFF the CPU entirely (0% CPU burned while waiting)

Thread A: finishes critical section, calls unlock()
          -> atomic_fetch_sub sees old value was 2 (not 1) -> there's a waiter!
          -> sets lock_word = 0
          -> calls futex(FUTEX_WAKE, lock_word, 1)
             |
             v
KERNEL: looks up the SAME wait queue (keyed by lock_word's physical address)
        finds Thread B, sets it back to TASK_RUNNING, schedules it

Thread B: wakes up inside the futex() syscall, returns to slow_lock(),
          loops back, CASes lock_word from 0 to 1 -> succeeds -> lock acquired
```

**Why the kernel keys the wait queue by physical address, not a kernel object:** this is what makes futex "fast" and lightweight — there is no persistent kernel object (no kernel-allocated semaphore/mutex structure) until contention actually happens. The "lock" *is* just 4 bytes of ordinary user-space memory; the kernel only builds a temporary wait-queue entry for it at the moment a thread actually calls `FUTEX_WAIT`.

**Uncontended vs contended cost comparison:**

| Path | What happens | Approximate cost |
|---|---|---|
| Uncontended lock | One `LOCK CMPXCHG` in user space | ~20-30 ns |
| Uncontended unlock | One atomic decrement in user space | ~5-10 ns |
| Contended lock (waiter) | CAS fails, `futex(FUTEX_WAIT)` syscall, thread parked, later woken, context switch back in | ~1-10 µs (syscall + scheduling latency) |
| Contended unlock (waking someone) | Atomic store + `futex(FUTEX_WAKE)` syscall | syscall cost (~100s of ns) + wakeup scheduling |

This is precisely why `std::mutex`/`pthread_mutex_t` are described as "cheap when uncontended" — in the common case they cost about as much as a couple of atomic instructions, nowhere near a full syscall.

---

#### 6.3 How `std::mutex` Maps to `futex` Under the Hood

On Linux, glibc's `pthread_mutex_t` (and therefore C++'s `std::mutex`, which is a thin wrapper) is implemented **exactly** as described in §6.2: a single word of memory manipulated with `LOCK CMPXCHG` on the fast path, falling back to `sys_futex()` only on contention.

```cpp
#include <mutex>

std::mutex mtx;

void critical_section() {
    std::lock_guard<std::mutex> lock(mtx);   // Calls mtx.lock() -> pthread_mutex_lock() -> LOCK CMPXCHG fast path
    // ... shared state access ...
}   // lock_guard destructor -> mtx.unlock() -> pthread_mutex_unlock() -> atomic decrement, futex(FUTEX_WAKE) only if needed
```

**Nothing about `std::mutex` is special C++ machinery** — it is a RAII wrapper around exactly the `futex`-backed `pthread_mutex_t` mechanism above. This is why `std::mutex` (uncontended) and a raw `std::atomic<int>` CAS loop have **similar best-case cost** — they bottom out in the same `LOCK`-prefixed hardware instruction.

`std::atomic` operations (`.compare_exchange_strong`, `.fetch_add`, etc.) compile directly to the CPU's `LOCK`-prefixed read-modify-write instructions (`LOCK CMPXCHG`, `LOCK XADD`, `LOCK INC`) already introduced earlier in this chapter — no futex, no kernel involvement at all, ever, for a plain atomic. A mutex adds the futex fallback *on top of* an atomic CAS specifically so a thread that truly can't proceed gets **off the CPU** instead of spinning.

---

#### 6.4 Deadlocks — The 4 Coffman Conditions and How to Avoid Them

A deadlock requires **all four** of these conditions simultaneously — remove any one, and deadlock becomes impossible:

| # | Condition | Meaning |
|---|---|---|
| 1 | **Mutual Exclusion** | At least one resource (lock) can only be held by one thread at a time |
| 2 | **Hold and Wait** | A thread holds one lock while blocked waiting for another |
| 3 | **No Preemption** | A lock can't be forcibly taken away from the thread holding it |
| 4 | **Circular Wait** | A cycle exists: Thread A waits on a lock Thread B holds, and Thread B waits on a lock Thread A holds |

**The canonical 2-lock circular-wait deadlock:**

```c
pthread_mutex_t mutex1 = PTHREAD_MUTEX_INITIALIZER;
pthread_mutex_t mutex2 = PTHREAD_MUTEX_INITIALIZER;

void* thread_A(void* arg) {
    pthread_mutex_lock(&mutex1);     // A holds mutex1
    sleep(1);                        // (simulated work — widens the race window)
    pthread_mutex_lock(&mutex2);     // A now waits for mutex2 ... held by B!
    // never reached
    pthread_mutex_unlock(&mutex2);
    pthread_mutex_unlock(&mutex1);
    return NULL;
}

void* thread_B(void* arg) {
    pthread_mutex_lock(&mutex2);     // B holds mutex2
    sleep(1);
    pthread_mutex_lock(&mutex1);     // B now waits for mutex1 ... held by A!
    // never reached — DEADLOCK: A waits on B, B waits on A, forever
    pthread_mutex_unlock(&mutex1);
    pthread_mutex_unlock(&mutex2);
    return NULL;
}
```

```
Thread A: [holds mutex1] --waiting for--> mutex2 [held by B]
                                              ^
                                              |
Thread B: [holds mutex2] --waiting for--> mutex1 [held by A]
```
Neither thread can ever proceed. Both are asleep in the kernel's futex wait queue forever — no CPU is burned (they're not spinning), but no forward progress happens either. `strace`/`gdb` on either PID would show it permanently blocked inside a `futex()` syscall.

**Fix 1 — Consistent lock ordering:** if *every* thread in the program always acquires `mutex1` before `mutex2` (never the reverse), circular wait becomes structurally impossible — Thread B in the example above would instead block on `mutex1` *before* taking `mutex2`, so it never holds `mutex2` while waiting on `mutex1`.

**Fix 2 — `std::lock` / `std::scoped_lock` (C++17+):** acquire multiple locks atomically as a single operation using a deadlock-avoidance algorithm internally, so lock *order* no longer matters:

```cpp
std::mutex mutex1, mutex2;

void thread_A_safe() {
    std::scoped_lock lock(mutex1, mutex2);   // Locks BOTH, in whatever order avoids deadlock
    // ... critical section using both resources ...
}   // Both released automatically
```
`std::scoped_lock`'s multi-mutex constructor internally uses a try-lock-and-backoff algorithm (conceptually: try to lock all; if any fails, release everything already acquired and retry) so that even if different call sites lock the same two mutexes in different orders, deadlock can't occur.

---

#### 6.5 Condition Variables — Waiting for a Change, Not Just Protecting Data

A mutex alone answers "can I touch this data right now?" — it does **not** answer "has the data reached the state I care about yet?" For that you need a **condition variable**, which lets a thread sleep efficiently until another thread explicitly signals a change.

**Why polling with just a mutex is wasteful:**

```cpp
// BAD: busy-polls, burning CPU, re-locking/unlocking constantly
while (true) {
    std::lock_guard<std::mutex> lock(mtx);
    if (ready) break;
}   // Wastes an entire core spinning on lock+check+unlock
```

**The correct pattern — mutex + condition variable:**

```cpp
#include <mutex>
#include <condition_variable>

std::mutex mtx;
std::condition_variable cv;
bool ready = false;

// Consumer thread
void wait_for_ready() {
    std::unique_lock<std::mutex> lock(mtx);
    cv.wait(lock, [] { return ready; });   // Sleeps efficiently until notified AND predicate is true
    // ... proceed, 'ready' is guaranteed true here ...
}

// Producer thread
void signal_ready() {
    {
        std::lock_guard<std::mutex> lock(mtx);
        ready = true;
    }
    cv.notify_one();   // Wake ONE waiting thread (notify_all() wakes everyone)
}
```

**Why `cv.wait` takes a predicate lambda — the spurious wakeup problem:** `pthread_cond_wait` (which `std::condition_variable::wait` wraps) is permitted by POSIX to occasionally wake up **with no corresponding `notify` call at all** — a "spurious wakeup," an artifact of how the underlying futex-based wakeup mechanism is implemented (it's cheaper for the kernel to allow rare spurious wakeups than to guarantee perfect precision). **This is why you must always re-check the actual condition in a loop, never assume "I woke up, therefore the condition is true":**

```cpp
// What cv.wait(lock, predicate) actually does internally:
while (!predicate()) {
    cv.wait(lock);   // Equivalent bare wait — MUST be in a loop, not an if!
}
```

**How this relates to futex:** `pthread_cond_wait` is, at the kernel level, ultimately another `futex(FUTEX_WAIT, ...)` call on an internal counter associated with the condition variable — the same wait-queue machinery from §6.2, just layered with the extra mutex-release-then-reacquire dance (the mutex must be released *while* sleeping, so other threads can modify `ready` and call `notify`, then reacquired automatically before `wait()` returns).

---

#### 6.6 Atomics and Compare-And-Swap — Building Blocks for Lock-Free Code

Every synchronization primitive in this topic — spinlocks, futex's fast path, `std::mutex`'s uncontended path — bottoms out in a `LOCK`-prefixed **read-modify-write** instruction:

| Instruction | C++ equivalent | What it guarantees atomically |
|---|---|---|
| `LOCK CMPXCHG` | `compare_exchange_strong`/`_weak` | Compare memory to expected; if equal, swap in new value; report success/failure — all as one indivisible hardware step |
| `LOCK XADD` | `fetch_add` | Add to memory and return the OLD value, indivisibly |
| `LOCK INC`/`LOCK DEC` | `++`/`--` on `std::atomic<T>` | Increment/decrement memory indivisibly |

**A lock-free counter (trivial CAS usage):**

```cpp
#include <atomic>

std::atomic<int> counter{0};

void increment() {
    counter.fetch_add(1, std::memory_order_relaxed);   // Single LOCK XADD, no lock needed at all
}
```

**A lock-free stack push (the canonical CAS-loop pattern for lock-free structures):**

```cpp
struct Node { int value; Node* next; };
std::atomic<Node*> head{nullptr};

void lock_free_push(int value) {
    Node* new_node = new Node{value, nullptr};
    new_node->next = head.load(std::memory_order_relaxed);
    // Keep retrying until nobody else changed 'head' between our load and our CAS
    while (!head.compare_exchange_weak(
               new_node->next,      // expected: what we last read 'head' as
               new_node,            // desired: our new node
               std::memory_order_release,
               std::memory_order_relaxed)) {
        // compare_exchange_weak automatically refreshes new_node->next with the
        // CURRENT value of head on failure, so the retry uses fresh data
    }
}
```

Step by step: (1) build the new node, pointing its `next` at whatever `head` currently is; (2) attempt to atomically swap `head` from that remembered value to the new node; (3) if some other thread pushed in between our read and our CAS, the CAS fails, `new_node->next` is automatically refreshed to the *new* current `head`, and we retry — no lock ever taken, no thread ever sleeps, progress is guaranteed for *some* thread on every retry round (this is the definition of "lock-free": the system as a whole always makes progress, even if one individual thread could in theory retry many times under heavy contention).

**Common Pitfall — the ABA problem:** if `head` is read as pointer `A`, another thread pops `A`, frees it, and a *new* allocation happens to reuse the exact same memory address for a new node — the CAS in the code above would see "head is still `A`" and succeed, even though the actual list contents changed underneath it. Real lock-free implementations guard against this with tagged pointers (a version counter packed alongside the pointer) or hazard pointers — a full treatment is out of scope here, but knowing the ABA problem exists is a common interview checkpoint.

---

#### 6.7 RCU (Read-Copy-Update) — Zero-Cost Reads

Locks, `rwlock`, and even lock-free CAS all impose *some* per-access cost on readers (at minimum, an atomic instruction). RCU is the Linux kernel's own technique for the read-mostly case where even that is too expensive: **readers pay absolutely nothing — not even an atomic instruction.**

**The mechanism:**
1. Readers simply dereference a pointer directly — a plain, non-atomic pointer load. No lock, no CAS, no memory barrier from the reader's perspective on many architectures.
2. A writer wanting to update the data **never modifies it in place**. It allocates a brand-new copy, updates the copy, then atomically swaps a single pointer to make the new copy visible to future readers.
3. Old readers that grabbed the pointer *before* the swap keep safely using the *old* copy — nobody's data changes under them mid-read.
4. The writer must wait for a **grace period** (long enough to guarantee every reader that could have seen the old pointer has finished) before actually freeing the old copy.

```
BEFORE UPDATE:                      AFTER SWAP:
 global_ptr ──> [ Old Data ]         global_ptr ──> [ New Data ]
                                      (old copy kept alive until
                                       grace period elapses, then freed)
```

**Why this matters:** the Linux kernel uses RCU extensively for data that is read constantly (on every syscall, every packet) but modified rarely (e.g. routing tables, module lists) — exactly the profile where even a single atomic instruction per read would be measurable overhead at kernel scale. The trade-off is entirely pushed onto writers: writes become more expensive (allocate a copy, wait out a grace period, free later) so that reads become as cheap as physically possible.

**Contrast with hazard pointers (from earlier chapters' lock-free discussions):** hazard pointers require a small per-access bookkeeping cost from readers (publishing "I'm using this pointer" so a reclaimer knows not to free it yet); RCU requires zero per-access reader cost, at the price of the writer waiting out a grace period rather than reclaiming immediately.

---

#### 6.8 Priority Inversion — When a Low-Priority Thread Blocks a High-Priority One

**The scenario:**

```
Priority:  LOW (Thread L)      MEDIUM (Thread M)      HIGH (Thread H)
           ────────────        ─────────────────      ───────────────
 t0:       Locks mutex X
 t1:                                                    Tries to lock mutex X
                                                         -> blocks, waiting on L to unlock
 t2:                            Becomes runnable,
                                 PREEMPTS L (M has
                                 higher priority than L!)
 t3:                            Runs indefinitely...
                                 L never gets scheduled
                                 again to finish and
                                 unlock X ...
 t4:                                                    STILL WAITING! Effectively
                                                         blocked by MEDIUM priority
                                                         work it has nothing to do with!
```

Thread H (highest priority) is indirectly starved by Thread M (medium priority) — even though H never contends with M for anything, and H's *only* dependency is on L, which M has now indirectly frozen out of the CPU. This is called **priority inversion**: the effective priority of the blocking chain collapses to the lowest priority involved.

**Real-world consequence:** this exact bug caused the Mars Pathfinder rover's watchdog timer to repeatedly reset the system in 1997 — a textbook, famous instance of priority inversion in a real-time embedded system, and a strong reason this is a recurring systems-interview topic.

**The fix — Priority Inheritance:** when Thread H blocks on a mutex held by Thread L, the kernel **temporarily boosts L's priority to match H's** for as long as L holds that mutex. Now Thread M (medium priority) can no longer preempt L — L's boosted priority is higher than M's — so L runs to completion, unlocks the mutex, drops back to its original low priority, and H immediately acquires the lock and proceeds.

```
WITH PRIORITY INHERITANCE:
 t0: L locks mutex X (priority LOW)
 t1: H tries to lock X -> blocks -> kernel boosts L's priority to HIGH (inherited from H)
 t2: M becomes runnable, but L (now boosted to HIGH) is NOT preempted by M (MEDIUM)
 t3: L finishes, unlocks X, priority drops back to LOW
 t4: H immediately acquires X and proceeds — total block time bounded, not indefinite
```

Linux implements this via **PI-futexes** (`FUTEX_LOCK_PI` / `FUTEX_UNLOCK_PI`) — a futex variant specifically designed to carry out this priority-boosting protocol in the kernel, used by `pthread_mutex_t` when initialized with the `PTHREAD_PRIO_INHERIT` protocol attribute. This is standard practice in real-time and safety-critical Linux systems (robotics control loops, automotive, aerospace) precisely because unbounded priority inversion is unacceptable when a hard deadline is on the line.

---

**Why this whole topic matters for low-latency systems:** every mechanism above exists because *locking is fundamentally a latency/throughput trade-off*, and low-latency systems (HFT, real-time control loops, game engines) routinely go out of their way to avoid locks in the hottest paths entirely — favoring single-producer/single-consumer lock-free ring buffers, RCU-style read paths, or carefully audited spinlocks with a hard bound on hold time — specifically to sidestep the futex slow path's syscall-plus-context-switch cost and the unbounded tail latency that priority inversion or scheduler unfairness can introduce.

**End of Topic 6: Concurrency & Synchronization Primitives**
