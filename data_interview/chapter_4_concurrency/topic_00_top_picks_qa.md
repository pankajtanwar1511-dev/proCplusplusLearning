## TOPIC: Top 50: Must-Know Concurrency Interview Questions

### INTERVIEW_QA: The Must-Know Interview Questions

#### Q1: Is this code safe?
**Difficulty:** #intermediate
**Category:** #concurrency #threads
**Concepts:** #detach #dangling_reference #undefined_behaviour

```cpp
void foo() {
    int value = 42;
    std::thread t([&] { std::cout << value; });
    t.detach();
}
```

**Answer:**
No. The lambda captures value by reference and the thread is detached, so foo() can return and destroy value before the thread reads it. Reading it then is a dangling reference access: undefined behaviour: depending on timing it may print 42, 0 or garbage.

**Explanation:**
- Two interleavings are possible: the worker reads first (appears to work) or `foo()` returns first (UB). In practice `foo()` often returns before the thread even starts, but timing varies, so a passing test proves nothing.
- Fixes: capture by value `[value]`, or `join()` before returning, or pass owning data (`std::make_shared`) to the detached thread.
- Capturing by value fixes this variable only; any pointer, reference or `this` captured is still a lifetime hazard.
- Also: `std::cout` used by a detached thread while `main` returns and static destruction runs is another hazard.
- ❌ Common wrong answer: "It is fine because the thread starts immediately." There is no such guarantee.
- ✅ What a strong answer adds: tools catch this: AddressSanitizer reports `stack-use-after-return` (with detection enabled), ThreadSanitizer may report races. Code review rule: `detach()` plus `[&]` is almost always a bug.
- Deep dive: Topic 1, std::thread: Creation, Lifetime and Argument Passing

**Key takeaway:** detach plus reference capture of locals is a dangling reference waiting for the unlucky schedule.

---

#### Q2: How many threads would you create for purely CPU-bound tasks on 8 cores, and what does hardware_concurrency() tell you?
**Difficulty:** #intermediate
**Category:** #concurrency #threads
**Concepts:** #hardware_concurrency #oversubscription #thread_pool_sizing

**Answer:**
Start with about one worker per logical CPU available to the process, then benchmark. hardware_concurrency() is only a hint, usually the online logical CPU count, and may be 0. More threads than CPUs adds context switches and cache pressure, not throughput.

**Explanation:**
- At most N threads can execute simultaneously on N **logical** CPUs. With SMT, 8 logical CPUs may be only 4 physical cores sharing execution units.
- 100 workers on 8 CPUs: the OS time-slices them. Costs: context switches, scheduler overhead, cache and TLB pollution, lock holders preempted, worse tail latency.
- `hardware_concurrency()` on Linux does not account for affinity masks or container CPU quotas. Guard against `0`.
- Leave headroom for other threads (I/O, logging, the OS) if latency matters.
- I/O-bound work: more threads than CPUs can help, since they block.
- ❌ Common wrong answer: "100 threads gives more parallelism than 8." Not for CPU-bound work.
- ❌ Common wrong answer: "8 threads is always optimal." Memory bandwidth, SMT, contention and other load change the optimum; measure.
- ❌ Imprecise answer: "Context switches cause virtual-to-physical detection." Say: more threads increase cache and TLB pressure and scheduling overhead.
- ✅ What a strong answer adds: for latency-critical work, pin a small number of threads to isolated cores and avoid oversubscription entirely.
- Deep dive: Topic 1, std::thread: Creation, Lifetime and Argument Passing

**Key takeaway:** CPU-bound: about one thread per available logical CPU, verified by measurement.

---

#### Q3: What is the difference between a data race and a race condition?
**Difficulty:** #intermediate
**Category:** #concurrency #correctness
**Concepts:** #data_race #race_condition #determinism

**Answer:**
A data race is a C++ memory-model violation (unsynchronized conflicting access) and makes the program undefined. A race condition is a logic bug where correctness depends on timing or interleaving; it can exist in completely data-race-free code.

**Explanation:**
- Data race: a property of individual memory accesses. Detectable by tools like TSan.
- Race condition: a property of the algorithm. Tools usually cannot see it because every access is "legal".
- The two overlap but neither contains the other:
  - Data race and race condition: unprotected `++counter`.
  - Race condition, no data race: `if (stock.load() > 0) stock.fetch_sub(1);` with atomics.
  - Data race, no race condition: two threads both store `true` into a plain `bool done`. Logically harmless, still UB.
- ❌ Common wrong answer: "A data race is just a type of race condition." A data race can exist where the logic does not depend on order at all, and it is a language-level UB rule, not a logic bug.
- ✅ What a strong answer adds: "data-race-free" is the minimum bar for a defined program; "race-condition-free" is the bar for a correct one.
- Deep dive: Topic 2, Data Races, Race Conditions and Deadlocks

**Key takeaway:** Data race = undefined program; race condition = wrong program; fix both.

---

#### Q4: You make every member of a class `std::atomic`. Is the class now thread-safe?
**Difficulty:** #intermediate
**Category:** #concurrency #design
**Concepts:** #invariants #check_then_act #atomics

**Answer:**
Not necessarily. It is data-race-free, but any invariant spanning several members or several steps (check-then-act, read-then-update) can still be broken by interleaving. Such invariants need one critical section, one atomic RMW, or a single owner.

**Explanation:**
- Example: a sequencer with `std::atomic<uint64_t> lastApplied`. Two threads both read 103, both decide 104 is next, both apply 104. Duplicate processing with zero data races.
- Using CAS to claim 104 removes the duplicate, but now `lastApplied == 104` is visible before message 104 has been applied: readers act on half-finished state.
- Better options:
  - One mutex held across check, apply and publish.
  - Funnel all messages to one sequencing thread that owns all the state (single-writer, no locks).
- ❌ Common wrong answer: "Atomics with acquire/release fix it." Memory ordering controls visibility, not the logic of a multi-step algorithm.
- ✅ What a strong answer adds: in low-latency systems, single-owner state plus queues is often simpler and faster than sprinkling atomics over shared mutable state.
- Deep dive: Topic 2, Data Races, Race Conditions and Deadlocks

**Key takeaway:** Thread safety is about invariants, not individual variables.

---

#### Q5: Two threads are started in order T1, T2, and both lock the same mutex. Does T1 get it first? Is `std::mutex` fair?
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
- Deep dive: Topic 3, Mutexes and Lock Types

**Key takeaway:** Mutex = exclusion, not ordering and not fairness.

---

#### Q6: Does every `mutex.lock()` call go into the kernel?
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
- Deep dive: Topic 3, Mutexes and Lock Types

**Key takeaway:** Uncontended mutexes never touch the kernel; contended waits may.

---

#### Q7: Tail latency spikes because a reporting thread holds the order-book mutex too long. What do you do?
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
- Deep dive: Topic 3, Mutexes and Lock Types

**Key takeaway:** Fix lock-induced tail latency by shortening hold time, not by changing the lock type.

---

#### Q8: The producer sets a plain `bool ready` and notifies without locking the mutex. What is wrong?
**Difficulty:** #intermediate
**Category:** #concurrency #data_races
**Concepts:** #data_race #happens_before #lost_wakeup

```cpp
bool ready = false;   // plain bool, read by the consumer's predicate

// Producer, mutex NOT locked:
ready = true;
cv.notify_one();
```

**Answer:**
The write races with the consumer's read of `ready` inside the predicate: a data race, so undefined behaviour. The CV gives no memory ordering for `ready`; the mutex does. It also reopens the lost-wakeup window. Modify `ready` while holding the mutex, then notify.

**Explanation:**
- Two requirements, two tools:
  - mutex: mutual exclusion and happens-before for the shared state;
  - CV: efficient blocking and waking.
- With the mutex: producer `unlock(m)` synchronizes-with the consumer's subsequent `lock(m)`, so everything written before the unlock is visible after the lock.
- `notify_one` is not specified to synchronize your data; never use it as a publication mechanism.
- ❌ Common wrong answer: "It only risks a lost wakeup." The first problem is undefined behaviour from the data race; the lost wakeup is a second, separate failure.
- ❌ Common wrong answer: "The consumer reads `ready` under the lock, so it is protected." Protection needs **both** sides to use the mutex.
- ✅ What a strong answer adds: ThreadSanitizer reports this race immediately; it is a good habit to run CV code under `-fsanitize=thread`.
- Deep dive: Topic 4, Condition Variables and Producer-Consumer Signalling

**Key takeaway:** The mutex protects the predicate; `notify` only rings the bell.

---

#### Q9: Should you call `notify_one` while holding the mutex or after unlocking it?
**Difficulty:** #intermediate
**Category:** #concurrency #performance
**Concepts:** #notify_placement #hurry_up_and_wait #object_lifetime

**Answer:**
Both are correct; what must be under the mutex is the state change, not the notify. Notifying after unlock is usually cheaper because the woken thread can take the mutex at once. Notify under the lock when the waiter might destroy the CV immediately after seeing the new state.

**Explanation:**
- Notify under lock: the waiter may wake, try to lock, find the notifier still holding it, and block again ("hurry up and wait"). Some implementations mitigate this, but you cannot rely on it.
- Notify after unlock: fewer wasted context switches.
- Lifetime exception: if `done = true` lets the waiter return and delete the object containing the CV, a notify after unlock can touch freed memory. Notifying under the lock prevents the waiter from returning first.
- ❌ Common wrong answer: "Notifying under the lock is a bug" or "notifying after unlock can lose the wakeup". Neither is true when the state was modified under the mutex.
- ❌ Common wrong answer: "The reason we modify the state under the lock is to avoid waking a thread into a locked mutex." That is the reason for notify placement; the state is under the lock for correctness (data race and lost wakeup).
- ✅ What a strong answer adds: separate correctness (state under the mutex) from performance (notify placement), then mention the lifetime case.
- Deep dive: Topic 4, Condition Variables and Producer-Consumer Signalling

**Key takeaway:** Modify under the lock for correctness; notify after unlocking for speed, unless lifetime forces otherwise.

---

#### Q10: After `notify_all`, C1 holds the mutex for 40 s. What do C2 and C3 do, and do they need another notification?
**Difficulty:** #intermediate
**Category:** #concurrency #synchronization
**Concepts:** #notify_all #mutex_contention #critical_section

**Answer:**
C2 and C3 were already unblocked from the CV; they are now blocked on the mutex, not on the CV. When C1 unlocks, they acquire it one at a time and recheck the predicate. No second notification is needed; if the queue is empty they wait on the CV again.

**Explanation:**
- Two distinct waiting states:
  - waiting **on the CV**: needs a notify (or spurious wakeup / timeout) to leave;
  - waiting **for the mutex**: leaves as soon as the mutex is free.
- Holding the mutex for 40 s blocks every consumer and every producer. The fix is structural:

```cpp
cv.wait(lk, [&] { return !q.empty(); });
auto item = std::move(q.front());
q.pop();
lk.unlock();
process(item);   // the 40 seconds happen here, without the lock
```

- ❌ Common wrong answer: "C2 and C3 stay asleep until the next notify." They were already notified.
- ❌ Common wrong answer: "While blocked on the mutex they spin and burn CPU." Whether a mutex spins briefly is implementation-defined; mainstream mutexes block in the kernel.
- ✅ What a strong answer adds: after `notify_all` the woken threads can never run the post-wait code concurrently; the mutex serializes them.
- Deep dive: Topic 4, Condition Variables and Producer-Consumer Signalling

**Key takeaway:** Notification and mutex acquisition are separate events; keep the locked region tiny.

---

#### Q11: Why does a simple bool stop flag need to be `std::atomic<bool>`?
**Difficulty:** #intermediate
**Category:** #concurrency #atomics
**Concepts:** #data_race #undefined_behaviour #compiler_optimization

- A colleague argues: "It's just a bool stop flag, and the CPU writes a bool atomically."

**Answer:**
Because concurrent unsynchronized read and write of a plain bool is a data race, which is undefined behaviour regardless of what the CPU does. The compiler may assume no other thread changes it and hoist the load out of the loop, so the worker can spin forever.

**Explanation:**
- The C++ rule: same memory location, two threads, at least one write, no synchronization, not atomic: **data race, UB**.
- Concrete failure (verified with GCC 11 at `-O2`): `while (running) { ++work; }` is compiled as "read `running` once, then loop forever". The program hangs; at `-O0` it terminates. ThreadSanitizer reports the data race.
- `std::atomic<bool> running{true};` tells the compiler the location is shared: every iteration performs a real atomic load.
- For a pure stop flag that publishes no other data, `relaxed` is enough. Join the worker before destroying what it uses (`join()` provides the synchronization).
- ❌ Common wrong answer: "After one or two iterations it will see `false`, so a plain bool is fine." There is no such guarantee; the loop may never re-read it.
- ❌ Another wrong answer: "Use `volatile bool`." `volatile` forces re-reads in practice but is still a data race in C++ and gives no ordering.
- ✅ What a strong answer adds: hardware atomicity of a load/store is not the same as C++ synchronization; the language model is what the optimizer reasons about.
- Deep dive: Topic 5, std::atomic and Compare-and-Swap

**Key takeaway:** Any variable written by one thread and read by another needs an atomic or a lock, even a bool.

---

#### Q12: Many threads increment one std::atomic<long> metrics counter and it does not scale. Why, and how would you fix it?
**Difficulty:** #advanced
**Category:** #concurrency #performance
**Concepts:** #contention #false_sharing #sharding

**Answer:**
Every fetch_add needs exclusive ownership of the same cache line, so the line ping-pongs between cores and operations serialize on line transfers. Fix by removing sharing: per-thread or per-core counters on separate cache lines (alignas(64)), summed on read, or batching local increments.

**Explanation:**
- Measured on a 4-thread run: one hot counter took about 7x longer than 4 padded per-thread counters doing the same total increments.
- Sharded design:
```cpp
#include <atomic>
#include <cstddef>
struct alignas(64) Slot { std::atomic<long> v{0}; };
struct ShardedCounter {
    Slot slots[16];
    void add(std::size_t tid) { slots[tid % 16].v.fetch_add(1, std::memory_order_relaxed); }
    long read() const { long s = 0; for (auto& x : slots) s += x.v.load(std::memory_order_relaxed); return s; }
};
int main() { ShardedCounter c; c.add(0); c.add(1); return c.read() == 2 ? 0 : 1; }
```
- Padding matters: unpadded slots in one array share lines and suffer **false sharing**, which is just as bad.
- `relaxed` is fine for a statistics counter that publishes no other data (topic 06).
- ❌ Common wrong answer: "Atomics are lock-free, so there is no contention." Contention lives at the cache-line level.
- ❌ Another wrong answer: "Atomics cause false sharing." False sharing is independent hot data in one line; atomics only make the cost visible.
- ✅ What a strong answer adds: the read becomes a non-instantaneous sum (fine for metrics); `std::hardware_destructive_interference_size` (C++17) names the line size portably where supported.
- Deep dive: Topic 5, std::atomic and Compare-and-Swap

**Key takeaway:** Scale writes by not sharing them; pad per-thread state to separate cache lines.

---

#### Q13: A colleague says a flag shared by two threads needs `volatile`. Do you agree?
**Difficulty:** #intermediate
**Category:** #concurrency #volatile
**Concepts:** #volatile #atomic

- The claim: "otherwise the compiler caches it in a register".

**Answer:**
No. `volatile` makes the compiler perform every access, which is meant for memory-mapped I/O and signal handlers, but it gives no atomicity, no data-race freedom and no inter-thread ordering. Concurrent access is still a data race. Use `std::atomic<bool>` (relaxed is fine for a pure stop flag).

**Explanation:**

| | `volatile` | `std::atomic` |
|---|---|---|
| Every access performed | ✅ | ✅ (in effect) |
| Atomic read-modify-write | ❌ | ✅ |
| Data-race free | ❌ | ✅ |
| Release/acquire, happens-before | ❌ | ✅ |
| Typical use | MMIO registers, `sig_atomic_t`, `longjmp` locals | Communication between threads |

- `volatile int n; ++n;` from two threads still loses increments.
- The compiler keeps volatile accesses in order among themselves only; plain accesses can move across them, and the CPU can reorder anyway.
- ❌ Common wrong answer: "`volatile` means don't reorder, so it is a lightweight memory barrier". It is neither a barrier nor portable synchronization.
- ✅ What a strong answer adds: MSVC's `/volatile:ms` (default on x86/x64, not on ARM) gives volatile acquire/release semantics, which is why old Windows code "works". It is a non-standard extension; the same code is broken on GCC/Clang and on MSVC ARM.
- Deep dive: Topic 6, Memory Ordering and the C++ Memory Model

**Key takeaway:** Hardware or signal handler → `volatile`; another C++ thread → `std::atomic` or a mutex.

---

#### Q14: An interviewer says release works by flushing the store buffer. Do you agree?
**Difficulty:** #intermediate
**Category:** #concurrency #hardware
**Concepts:** #release_acquire #cache_coherence

- The full claim: "release works because it flushes the store buffer and MESI pushes the new cache line to the other core".

**Answer:**
Not as a definition. C++ release means: if an acquire reads this store's value, everything before the release happens-before everything after that acquire. How it is achieved is the compiler's and CPU's choice. MESI is the hardware mechanism that keeps cache lines coherent; it is related but is not the guarantee.

**Explanation:**
- On x86 a release store is a plain `mov` with no flush at all; TSO already keeps stores in order. On ARMv8 it is `stlr`. Neither is "flush the store buffer".
- Coherence (MESI) alone does not give ordering: a core can still delay its own stores in a store buffer or process invalidations late, which is why fences and ordered instructions exist.
- ❌ Common wrong answer: "release flushes the store buffer; acquire invalidates stale cache and registers".
- ❌ Overcorrection to avoid: "MESI is completely unrelated". Coherence is part of how hardware implements atomicity and visibility.
- ✅ What a strong answer adds: answer in three layers. C++: synchronizes-with and happens-before. Compiler: forbids moving earlier accesses below the store and emits the right instruction. Hardware: store buffers, coherence protocol, barriers. Go to the hardware layer only if asked.
- Deep dive: Topic 6, Memory Ordering and the C++ Memory Model

**Key takeaway:** Define release/acquire with happens-before; treat store buffers and MESI as implementation details.

---

#### Q15: "Spinlocks are faster than mutexes." Do you agree?
**Difficulty:** #intermediate
**Category:** #concurrency #performance
**Concepts:** #spinlock #context_switch #oversubscription

**Answer:**
Only in a narrow case: very short critical sections, low contention, and threads pinned to dedicated cores. Then spinning skips a microseconds-long sleep/wake. With long holds or more runnable threads than cores, spinlocks waste CPU and can be many times slower.

**Explanation:**
- Sleep/wake cost: syscall, context switch, scheduler latency, cache pollution; typically a few microseconds or more.
- Spinning cost: a whole core for the duration of the wait.
- Measured on a 20-CPU machine, tiny section:
  - 8 threads: TTAS spinlock ≈ 0.6 to 0.8 s, `std::mutex` ≈ 0.85 to 0.95 s;
  - 80 threads: TAS spinlock ≈ 16 to 19 s, `std::mutex` ≈ 0.9 s.
- ❌ Common wrong answer: "Low-latency systems always use spinlocks." They spin where cores are dedicated and sections are tiny, but first try to remove sharing entirely.
- ✅ What a strong answer adds: "A spinlock can win when the expected wait is shorter than a context switch and the holder is guaranteed to be running; otherwise blocking is better."
- Deep dive: Topic 7, Spinlocks, Busy-Waiting and Backoff

**Key takeaway:** Spinning is a bet that the lock frees up before a sleep would have paid off.

---

#### Q16: What happens at the hardware level when 32 threads spin on `exchange`, and how does test-and-test-and-set help?
**Difficulty:** #intermediate
**Category:** #concurrency #performance
**Concepts:** #cache_coherence #ttas #cache_line_bouncing

```cpp
// 32 threads wait on:
while (locked.exchange(true)) {}
```

**Answer:**
Each `exchange` is a write, so every waiter keeps demanding exclusive ownership of the lock's cache line, bouncing it between cores and delaying the holder's unlock. TTAS spins on a plain load, which keeps a shared copy locally, and only tries the RMW when the lock looks free.

**Explanation:**
- TAS loop: RMW, RMW, RMW... Each one invalidates the other cores' copies; the line ping-pongs.
- TTAS loop:

```cpp
while (true) {
    if (!locked.exchange(true, std::memory_order_acquire)) break;  // try
    while (locked.load(std::memory_order_relaxed)) cpu_relax();    // test, local
}
```

- While the lock is held, TTAS waiters generate no coherence traffic. On release there is one invalidation and a burst of RMWs, one of which wins.
- ❌ Common wrong answer: "Waiters are just reading the value until it changes." In the TAS loop they are writing; that is the whole problem.
- ✅ What a strong answer adds: TTAS still has a thundering-herd burst on every release; backoff, ticket locks, or MCS queue locks (each waiter spins on its own line) scale further.
- Deep dive: Topic 7, Spinlocks, Busy-Waiting and Backoff

**Key takeaway:** Spin on loads, attack with RMW only when the lock looks free.

---

#### Q17: My code uses only std::atomic and no mutex. Is it lock-free?
**Difficulty:** #intermediate
**Category:** #concurrency #lock_free
**Concepts:** #spinlock #is_lock_free #progress_guarantee

**Answer:**
Not necessarily. If a thread can wait on a condition another thread must clear (a spinlock built from atomic_flag, a "busy" flag), it is blocking. It also needs every atomic it uses to be lock-free and every call on the path (such as the allocator) to be non-blocking.

**Explanation:**
- `while (flag.test_and_set()) {}` is a lock: if the holder is preempted, all other threads spin without progress. That is blocking.
- `std::atomic<T>` with a large `T` uses an internal lock (check `is_always_lock_free`); a 16-byte tagged pointer is reported not lock-free by GCC.
- `new` / `malloc` in a push can take allocator locks.
- ❌ Common wrong answer: "No `std::mutex`, therefore lock-free." Locks can be hand-rolled from atomics, and hidden in library calls.
- ✅ What a strong answer adds: lock-freedom is a property of the whole operation path; the typical proof is "every failed CAS implies another thread's CAS succeeded, and no step waits on another thread's state".
- Deep dive: Topic 8, Lock-Free Programming and the ABA Problem

**Key takeaway:** Lock-free is about who can stall whom, not which headers you include.

---

#### Q18: What is the ABA problem? Walk through a concrete interleaving.
**Difficulty:** #intermediate
**Category:** #concurrency #lock_free
**Concepts:** #aba_problem #compare_and_swap #treiber_stack

**Answer:**
CAS checks only that a value equals what you read, not that it never changed. If it goes A to B and back to A, CAS succeeds although the state your update depended on is gone. In a stack pop, T1 reads head A and next B, sleeps; others pop A, pop B, push A; T1's CAS installs stale B.

**Explanation:**
```text
stack: head -> A -> B -> C
T1: old = A, next = B         (preempted)
T2: pop A, pop B (free B), push A     -> head -> A -> C
T1: CAS(head, A, B) succeeds          -> head -> B (freed), A is lost
```
- The name: the value went A, then B, then A again.
- The bug is not the CAS itself; it is the **cached `next`**, computed from a state that no longer exists.
- Where the recycled A comes from: the same node pushed back (pools/free lists) or `malloc` returning the freed address for a new node.
- ❌ Common wrong answer: "CAS guarantees nothing changed since I read it." It guarantees only equality at the moment of the CAS.
- ✅ What a strong answer adds: ABA matters when the CAS value **stands for** more state (a pointer with a `next` behind it). For a plain counter, A to B to A is harmless.
- Deep dive: Topic 8, Lock-Free Programming and the ABA Problem

**Key takeaway:** CAS compares values, not histories; pointers recycle.

---

#### Q19: Is a lock-free data structure faster than a mutex-protected one?
**Difficulty:** #intermediate
**Category:** #concurrency #performance
**Concepts:** #contention #cache_line_bouncing #tail_latency

**Answer:**
Not necessarily. Both serialize on the same hot cache line, lock-free adds failed-CAS retries and reclamation overhead, and an uncontended mutex is just two atomic RMWs. Lock-free wins on progress (no stalling behind a preempted holder) and often tail latency, not raw throughput.

**Explanation:**
- Measured (4 threads, push/pop on one stack): both versions about 20x slower than single-threaded; lock-free modestly faster, not dramatically.
- Where lock-free loses or ties:
  - high contention on one word (retry storms),
  - per-node allocation (`new` may lock) and reclamation fences,
  - more CASes per operation than a mutex's lock + unlock.
- Where it wins:
  - oversubscription: a mutex holder preempted mid-critical-section stalls everyone,
  - real-time/priority constraints, signal handlers,
  - predictable worst-case progress.
- ❌ Common wrong answer: "Lock-free is always faster because there is no kernel call." Uncontended mutexes do not enter the kernel either.
- ✅ What a strong answer adds: the bigger win is usually removing sharing (sharded data, SPSC queues per pair). Decide by requirements, then measure p50 and p99.
- Deep dive: Topic 8, Lock-Free Programming and the ABA Problem

**Key takeaway:** Choose lock-free for its progress guarantee, not on an assumption of speed.

---

#### Q20: Why is the capacity of a ring buffer usually a power of two? Is `%` really that slow?
**Difficulty:** #beginner
**Category:** #concurrency #performance
**Concepts:** #power_of_two #bit_mask #modulo

**Answer:**
With a power of two, `i % N` equals `i & (N - 1)` for unsigned `i`, a single AND instead of a division. For a compile-time constant N the compiler already does this for unsigned types; the mask matters when N is a runtime value or the index is signed.

**Explanation:**
- A 64-bit integer division costs tens of cycles on many CPUs; an AND costs one.
- `static_assert((N & (N - 1)) == 0)`: with N = 6, `i & 5` maps 0..7 to 0,1,0,1,4,5,4,5, so slots collide and others are never used.
- Power-of-two N also keeps monotonic `size_t` indices consistent across 2^64 wraparound.
- ❌ Common wrong answer: "Masking is required for correctness." Correctness needs either mask-with-power-of-two or a true modulo; the power of two buys speed and wrap safety.
- ✅ What a strong answer adds: a power-of-two size may waste memory (need 1100 slots, get 2048); some designs accept a non-power-of-two size with a conditional reset (`if (++i == N) i = 0;`), which is also cheap and branch-predictable.
- Deep dive: Topic 9, Concurrent Queues and Ring Buffers

**Key takeaway:** Power of two makes wrapping a mask; only mask if N really is a power of two.

---

#### Q21: Your market-data SPSC ring is full and the feed handler has another message. What do you do?
**Difficulty:** #intermediate
**Category:** #concurrency #system_design
**Concepts:** #backpressure #overflow_policy #market_data

**Answer:**
It depends on the data semantics. Blocking stalls the feed handler (and the socket), dropping or overwriting creates a sequence gap that corrupts an incremental book. For incremental data: never drop silently; flag overflow, alarm, and resynchronise from a snapshot; fix the slow consumer.

**Explanation:**
- Options and costs:
  - Block or spin: backpressure moves upstream; the kernel socket buffer fills and the NIC/kernel starts dropping UDP packets instead.
  - Drop newest / fail push: lose the incoming message, count it, raise a gap.
  - Overwrite oldest: lose an **unprocessed** message; also needs two writers of `head` in a lock-free SPSC, which is a race.
  - Conflate per instrument: only valid if messages are full snapshots (latest value wins).
- ❌ Common wrong answer: "Overwrite the oldest so the consumer gets the latest first." The consumer still reads in order; you silently destroyed a message it had not processed.
- ❌ Common wrong answer: answering with UDP gap recovery. That handles **network** loss. Internal queue overflow is a capacity problem in your own pipeline; recovery only cleans up after it.
- ✅ What a strong answer adds: the ring absorbs bursts; persistent fullness means the consumer's sustained rate is too low, so profile and optimise the consumer (allocations, cache misses, syscalls, page faults, contention, core isolation) or split the work.
- Deep dive: Topic 9, Concurrent Queues and Ring Buffers

**Key takeaway:** Pick the full policy from message semantics; for incremental feeds, overflow means resync, not silent loss.

---

#### Q22: Why not simply make the ring buffer huge so it never fills?
**Difficulty:** #intermediate
**Category:** #concurrency #system_design
**Concepts:** #queueing_latency #stale_data #capacity_planning

**Answer:**
A larger queue only postpones overflow under sustained overload and converts it into latency: messages are still valid but stale by the time they are processed. It also increases memory and cache footprint. Size for legitimate bursts and monitor depth.

**Explanation:**
- If sustained arrival > service, any finite queue fills; size only changes when.
- Depth is delay: 90k queued at 20k/s means trading on prices 4.5 s old.
- "Valid but stale": the messages are correct records of the past, just not useful for a decision now.
- A huge ring also hurts locality (the working set no longer fits in L2/L3) and can hide overload from monitoring.
- ❌ Common wrong answer: "The data is all valid, so a bigger buffer is pure upside."
- ❌ Common wrong answer: "The fix is to slow down the producer." You cannot throttle an exchange feed; the consumer must keep up (consumer capacity ≥ arrival rate).
- ✅ What a strong answer adds: export queue depth, high-water mark and estimated queueing delay as metrics, alarm on them, and benchmark p99/p99.9 end-to-end latency.
- Deep dive: Topic 9, Concurrent Queues and Ring Buffers

**Key takeaway:** Capacity absorbs bursts; it never fixes a rate mismatch, and depth is latency.

---

#### Q23: Would you use std::async inside a low-latency hot path, for example once per incoming market data message?
**Difficulty:** #advanced
**Category:** #concurrency #async
**Concepts:** #low_latency #tail_latency #thread_pool

**Answer:**
No. With libstdc++ each launch::async call creates a thread (tens of microseconds), allocates a shared state, and depends on OS scheduling, so latency is high and unpredictable. Hot paths use preallocated queues feeding long-lived, pinned worker threads.

**Explanation:**
- Per call costs: thread creation (`clone`, stack mapping), heap allocation of the shared state, context switches, cache misses on a cold thread, plus the blocking-destructor behaviour.
- `std::async` gives no control over core affinity, priority, queue bounds, or allocation.
- Even a thread-pool implementation (MSVC) still allocates and has unknown scheduling.
- Low-latency pattern: market data thread pushes into a preallocated SPSC ring buffer, consumed by a processing thread pinned to an isolated core, with no allocation per message.
- Capturing `[&]` the message in an async task that outlives the callback is also a lifetime bug.
- ❌ Common wrong answer: "async is cheap because the library optimizes it." The standard gives no performance guarantees, and mainstream Linux implementations spawn a thread per call.
- ✅ What a strong answer adds: `std::async` is fine for coarse-grained, occasional work (startup, batch jobs) where microseconds do not matter.
- Deep dive: Topic 10, async, future/promise, thread_local and call_once

**Key takeaway:** Convenient is not cheap: keep std::async off any path measured in microseconds.

---

#### Q24: Why is this lazy-init check broken with threads, and does making `initialized` a `std::atomic<bool>` fix it?
**Difficulty:** #intermediate
**Category:** #concurrency #initialization
**Concepts:** #check_then_act #data_race #call_once

```cpp
if (!initialized) {
    init();
    initialized = true;
}
```

**Answer:**
With a plain bool it is a data race, undefined behaviour, and two threads can both see false and both run init(). An atomic<bool> removes the UB but not the double init: the check and the set are separate steps. Use std::call_once or a function-local static.

**Explanation:**
- Interleaving: T1 reads false, T2 reads false, both call `init()`, both set true.
- Even when `init()` runs once, other threads that see `initialized == true` may not see the data `init()` wrote unless the flag uses release/acquire (plain bool gives no ordering at all).
- `std::call_once` provides: election of one executor, blocking of the others until it finishes, publication of its writes to all returning callers, retry on exception.
- ❌ Common wrong answer: "`call_once` is just a wrapper around these three lines." The three lines have none of these guarantees.
- ❌ Common wrong answer: "atomic<bool> fixes it." Atomic steps do not make an atomic sequence.
- ✅ What a strong answer adds: a CAS on an atomic state (0 = uninit, 1 = running, 2 = done) can elect one initializer, but losers must then wait for state 2, which is reimplementing `call_once`.
- Deep dive: Topic 10, async, future/promise, thread_local and call_once

**Key takeaway:** Once-only initialization needs election + waiting + publication; that is what call_once is.

---

#### Q25: How does std::counting_semaphore differ from std::mutex? Could binary_semaphore replace a mutex?
**Difficulty:** #intermediate
**Category:** #concurrency #cpp20
**Concepts:** #semaphore #mutex #ownership

**Answer:**
A semaphore is a counter of permits with no owner: any thread may `release()`, even one that never acquired. A mutex has an owner that must unlock it. A binary semaphore can provide exclusion, but you lose ownership checks, so it is meant for signalling, not as a mutex replacement.

**Explanation:**
- `counting_semaphore<K> s{init}`: `acquire()` blocks while the count is 0, then decrements; `release(n)` increments and wakes waiters.
- Use cases: limit concurrency to K (connection pools, in-flight requests), count available items, cross-thread signalling (`binary_semaphore` initialised to 0).
- Mutex-only properties a semaphore lacks: owner thread, unlock-by-owner rule, `lock()`/`unlock()` so `std::lock_guard`/`std::scoped_lock` work, recursive variants, potential priority inheritance on some platforms.
- `std::lock_guard<std::binary_semaphore>` does not even compile: there are no `lock`/`unlock` members.
- ❌ Common wrong answer: "A binary semaphore is just a faster mutex." Semantics differ: a stray `release()` from another thread silently "unlocks" it; releasing past `max()` is undefined behaviour.
- ✅ What a strong answer adds: the initial count is a design decision: `{0}` means "signal not yet given", `{K}` means "K permits free". Getting it wrong lets a consumer pass before data exists.
- Deep dive: Topic 11, C++20 Synchronization: latch, barrier, semaphore, jthread

**Key takeaway:** Semaphore = permits without ownership (signalling, throttling); mutex = ownership (exclusion).

---
