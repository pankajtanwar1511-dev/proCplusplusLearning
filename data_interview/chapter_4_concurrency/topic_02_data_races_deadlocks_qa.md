## TOPIC: Data Races, Race Conditions and Deadlocks

### INTERVIEW_QA: Interview Questions with Detailed Answers

#### Q1: What exactly is a data race in C++?
**Difficulty:** #beginner
**Category:** #concurrency #memory_model
**Concepts:** #data_race #undefined_behavior #happens_before

**Answer:**
Two potentially concurrent accesses to the same memory location, at least one a write, at least one non-atomic, and neither happens before the other. A program with a data race has undefined behaviour.

**Explanation:**
- Four ingredients: same memory location, at least one write, not both atomic, no happens-before ordering between them.
- Read/read is never a data race. Atomic/atomic is never a data race, even with `memory_order_relaxed`.
- Happens-before comes from synchronization: the same mutex (unlock then lock), a release store read by an acquire load, thread start, `join()`.
- ❌ Common wrong answer: "Multiple threads use the same variable and the value becomes unpredictable." That describes a symptom. The precise point is that the standard gives the whole program no defined behaviour, not just an unpredictable value.
- ✅ What a strong answer adds: "memory location" is a scalar object or a run of adjacent bit-fields, so two different struct members are not a race, but two neighbouring bit-fields are.

**Key takeaway:** Conflicting, unsynchronized, non-atomic access to one memory location: undefined behaviour, full stop.

---

#### Q2: Two threads each run `++counter` one million times on a shared `int`, then both are joined. What does the program print?
**Difficulty:** #beginner
**Category:** #concurrency #data_race
**Concepts:** #lost_update #undefined_behavior #read_modify_write

**Answer:**
Nothing is guaranteed: the unsynchronized increments are a data race, so the program has undefined behaviour. In practice you often see less than 2,000,000 because of lost updates, but sometimes exactly 2,000,000.

**Explanation:**
- `++counter` reads, adds and writes. Two threads can read the same old value and both write old+1: one increment is lost.
- With `-O2` the compiler may fold each loop into one `counter += 1000000`, so the bug hides and the program often prints the "right" answer.
```cpp
#include <iostream>
#include <thread>

int counter = 0;

int main() {
    auto work = [] { for (int i = 0; i < 1'000'000; ++i) ++counter; };
    std::thread t1(work), t2(work);
    t1.join();
    t2.join();
    std::cout << counter << '\n';   // UB: any output, typically <= 2000000
}
```
- ❌ Common wrong answer: "Some value between 1,000,000 and 2,000,000." That range comes from imagining one particular hardware interleaving. The C++ standard promises no range at all.
- ✅ What a strong answer adds: three fixes with their trade-offs: a `std::mutex` around the increment, `std::atomic<int>::fetch_add(1, std::memory_order_relaxed)`, or count locally and combine once (best for throughput).

**Key takeaway:** "Possible hardware interleavings" are not "C++ guarantees"; a data race means UB.

---

#### Q3: Why is `++counter` not atomic? On x86 it compiles to a single `add` instruction.
**Difficulty:** #beginner
**Category:** #concurrency #hardware
**Concepts:** #read_modify_write #lock_prefix #compiler_optimization

**Answer:**
For a plain `int`, `++counter` is a read-modify-write, and C++ does not make it indivisible. Even a single x86 `add [mem], 1` without the `lock` prefix reads and writes memory as separate steps, so another core can interleave.

**Explanation:**
- The atomic x86 form is `lock add` / `lock xadd`. The compiler only emits it for `std::atomic` operations.
- Do not claim `++counter` is "exactly three instructions": the compiler may keep `counter` in a register for a whole loop, merge increments, or reorder them, because it may assume no other thread touches a non-atomic variable.
- ❌ Common wrong answer: "It's one instruction, so it is atomic." Instruction count says nothing about atomicity at the memory-system level, and C++ semantics apply before any instruction is chosen.
- ❌ Common wrong answer: "`std::atomic` means one indivisible CPU instruction." An implementation may use a locked instruction, an LL/SC or CAS loop, or even a hidden lock for large types. The guarantee is that no thread observes the operation half done.
- ✅ What a strong answer adds: atomic operations can run on two cores at the same time; they are not serialized like a mutex, they are just each indivisible.

**Key takeaway:** `++x` on a non-atomic is a read-modify-write with no atomicity guarantee, whatever the instruction count.

---

#### Q4: Both threads join before `main` reads the shared counter. Doesn't `join()` make the code safe?
**Difficulty:** #beginner
**Category:** #concurrency #threads
**Concepts:** #join #happens_before #data_race

**Answer:**
No. `join()` makes the joined thread's actions happen before the code after `join()`, so `main` can safely read results. It creates no ordering between the two worker threads, whose conflicting accesses already raced.

**Explanation:**
- Timeline: t1 and t2 increment concurrently (race happens here), then `main` joins. The UB cannot be repaired retroactively.
- `join()` is still necessary: once the workers are fixed (mutex or atomic), it is what lets `main` read the final value without its own data race.
- ❌ Common wrong answer: "We call `join()`, so the threads are synchronized." Synchronized with `main`, yes. With each other, no.
- ✅ What a strong answer adds: same logic for `detach()` plus a sleep: sleeping is not synchronization and gives no happens-before at all.

**Key takeaway:** `join()` synchronizes the joiner with the thread, not the threads with each other.

---

#### Q5: What is a deadlock? What are the four Coffman conditions?
**Difficulty:** #beginner
**Category:** #concurrency #deadlock
**Concepts:** #coffman_conditions #circular_wait #hold_and_wait

**Answer:**
A deadlock is a cycle of threads, each waiting for a resource held by another, so none can proceed. It requires all four: mutual exclusion, hold and wait, no preemption, and circular wait. Break any one and deadlock is impossible.

**Explanation:**
- Mutual exclusion: a mutex has one owner at a time.
- Hold and wait: T1 holds `m1` while waiting for `m2`.
- No preemption: nobody can force T1 to give up `m1`.
- Circular wait: T1 waits for T2, T2 waits for T1 (or a longer cycle).
- Prevention mapped to conditions: global lock order breaks circular wait; acquiring all locks at once breaks hold and wait; `try_lock` with release on failure breaks no preemption; avoiding shared mutable state breaks mutual exclusion.
- ❌ Common wrong answer: "A deadlock is when a thread waits too long for a lock." Long waits are contention; deadlock is waiting forever because of a cycle.
- ✅ What a strong answer adds: a deadlocked process uses ~0% CPU (threads are blocked); 100% CPU with no progress points to livelock or a spin, not a mutex deadlock.

**Key takeaway:** M H N C: break any one condition and deadlock cannot occur.

---

#### Q6: Two threads lock `m1` and `m2` in opposite order. What happens, can `lock_guard` detect it, and how do you fix it?
**Difficulty:** #beginner
**Category:** #concurrency #deadlock
**Concepts:** #lock_ordering #scoped_lock #lock_guard

```cpp
// Thread 1
std::lock_guard<std::mutex> a(m1);
std::lock_guard<std::mutex> b(m2);

// Thread 2
std::lock_guard<std::mutex> a(m2);
std::lock_guard<std::mutex> b(m1);
```

**Answer:**
They can deadlock: T1 holds `m1` and waits for `m2` while T2 holds `m2` and waits for `m1`. `lock_guard` detects nothing; it just calls `lock()`. Fix with one global lock order, or acquire both together with `std::scoped_lock(m1, m2)`.

**Explanation:**
- It is intermittent: it needs both threads to grab their first lock before either gets its second. It can pass tests for months.
- Lock ordering: decide "always `m1` before `m2`" and apply it everywhere. The order is a rule you impose, not the order the mutexes were created.
- `std::scoped_lock lk(m1, m2);` (C++17) locks both with a deadlock-avoidance algorithm and unlocks both via RAII.
- ❌ Common wrong answer: "Lock whichever mutex was created first." Creation order is not a protocol; another code path can still acquire them differently.
- ✅ What a strong answer adds: better still, redesign so a thread rarely needs two locks at once (smaller critical sections, merged data, single owner).

**Key takeaway:** Inconsistent lock order is the classic deadlock; fix the order or acquire atomically with `scoped_lock`.

---

#### Q7: What is the difference between a data race and a race condition?
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

**Key takeaway:** Data race = undefined program; race condition = wrong program; fix both.

---

#### Q8: Can you have a race condition without a data race? Give an example.
**Difficulty:** #intermediate
**Category:** #concurrency #correctness
**Concepts:** #race_condition #check_then_act #atomics

**Answer:**
Yes. If every access is atomic or locked, there is no data race, but a multi-step operation like check-then-act can still interleave badly, for example two threads both seeing `stock > 0` and both selling the last item.

**Explanation:**
- Example with atomics:
```cpp
#include <atomic>

std::atomic<int> stock{1};

bool buy() {
    if (stock.load() > 0) {   // both threads can pass this check
        stock.fetch_sub(1);   // stock ends at -1
        return true;
    }
    return false;
}

int main() { return buy() ? 0 : 1; }
```
- Example with a mutex: thread 1 does `{lock; x = 10;}`, thread 2 does `{lock; x = 20;}`. No data race, but if the requirement is "20 must win", the program is wrong whenever thread 1 gets the lock second.
- ❌ Common wrong answer: "If it compiles clean under TSan, it is thread-safe." TSan only proves no data race happened in that run; it is silent about logic races.
- ✅ What a strong answer adds: fix by making the check and the act one indivisible step: one critical section, or a CAS loop (`compare_exchange_weak(cur, cur - 1)` while `cur > 0`).

**Key takeaway:** Atomic operations do not make an algorithm atomic.

---

#### Q9: Two threads write `x = 10` and `x = 20` inside the same mutex. Is there a data race? Is the final value deterministic?
**Difficulty:** #intermediate
**Category:** #concurrency #mutex
**Concepts:** #mutual_exclusion #determinism #race_condition

**Answer:**
No data race: both writes are in critical sections of the same mutex, so they are ordered. But the final value is 10 or 20 depending on which thread acquires the mutex last. Data-race-free does not mean deterministic.

**Explanation:**
- The mutex guarantees: one owner at a time, and each unlock synchronizes with the next successful lock.
- It does not guarantee: which thread locks first, FIFO fairness, or "the thread created first wins".
- If the program needs an order, add one: `join()` before starting the second thread, a condition variable with a predicate, a semaphore, a latch, or an atomic flag with release/acquire.
- ❌ Common wrong answer: "Thread 1 was started first, so it gets the lock first." Thread start order says nothing about scheduling.
- ✅ What a strong answer adds: whether this is a race condition depends on the specification. Nondeterminism is only a bug if correctness depends on the order.

**Key takeaway:** Mutual exclusion is not execution ordering.

---

#### Q10: If one thread only reads and another writes, the reader just sees an old value. Why call that undefined behaviour?
**Difficulty:** #intermediate
**Category:** #concurrency #memory_model
**Concepts:** #data_race #compiler_optimization #torn_read

**Answer:**
Because the standard says so, and compilers exploit it. The reader may see a torn value, never see the update at all (load hoisted out of a loop), or have its loop deleted. "Stale value" is just one of many possible outcomes.

**Explanation:**
- Hoisting: `while (!done) {}` on a plain `bool` may be compiled as "read once, spin forever".
- Deletion: an infinite loop with no side effects is UB, so GCC at `-O2` can remove the loop entirely and run past it immediately. (Observed with GCC 11.)
- Tearing: a 64-bit `long long` or a struct can be written in pieces on some targets; the reader sees half old, half new.
- ❌ Common wrong answer: "Reads are harmless, only write/write is a race." Read/write is just as much a data race as write/write.
- ✅ What a strong answer adds: the fix is cheap: `std::atomic<bool>` with a relaxed load for a pure stop flag, or acquire/release if the flag publishes other data.

**Key takeaway:** A racing read is UB, not a "slightly stale" read.

---

#### Q11: x86 is cache coherent. Doesn't that make sharing a plain `int` between threads safe? What about `volatile`?
**Difficulty:** #intermediate
**Category:** #concurrency #hardware
**Concepts:** #cache_coherence #volatile #memory_model

**Answer:**
No. The C++ rules apply before hardware: the compiler may cache, merge or reorder non-atomic accesses, and coherence never made read-modify-write atomic. `volatile` prevents some compiler optimizations but provides no atomicity or inter-thread ordering.

**Explanation:**
- Coherence (MESI and similar) guarantees all cores agree on the order of writes to one cache line. It does not stop two cores from both reading 100 and both writing 101.
- MESI is not the cause of a data race and not the cure; it is an implementation layer below the language rules.
- `volatile` is for memory-mapped I/O and signal-style uses; concurrent `volatile` access from two threads is still a data race.
- ❌ Common wrong answer: "It's safe because the cache line is coherent." Coherence is about caches, not about compiler transformations or RMW atomicity.
- ✅ What a strong answer adds: "At the hardware level the implementation uses atomic instructions and the coherence protocol, but I reason in terms of atomicity and happens-before."

**Key takeaway:** Cache coherence is not synchronization, and `volatile` is not atomic.

---

#### Q12: You make every member of a class `std::atomic`. Is the class now thread-safe?
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

**Key takeaway:** Thread safety is about invariants, not individual variables.

---

#### Q13: In Coffman's conditions, what does "no preemption" mean? If the OS preempts a thread holding a mutex, is the mutex released?
**Difficulty:** #intermediate
**Category:** #concurrency #deadlock
**Concepts:** #no_preemption #scheduler #priority_inversion

**Answer:**
It means a held resource cannot be forcibly taken from its owner; only the owner releases it. CPU preemption is unrelated: a descheduled thread keeps its mutex, and all waiters must wait until it runs again and unlocks.

**Explanation:**
- Resource preemption would be "T2 grabs `m1` away from T1". Mutexes never allow that.
- Scheduler preemption pauses T1 but keeps ownership. This is why a lock holder being descheduled causes latency spikes (lock convoys).
- Same mechanism behind priority inversion: a low-priority holder is preempted by medium-priority work while a high-priority thread waits for the lock. Fix: priority-inheritance mutexes.
- ❌ Common wrong answer: "The OS preempts threads all the time, so the no-preemption condition doesn't hold." It confuses CPU preemption with resource preemption.
- ✅ What a strong answer adds: one mutex alone has all three of mutual exclusion, hold and no preemption; deadlock still needs a cycle.

**Key takeaway:** CPU preemption never releases a lock.

---

#### Q14: How do `std::lock` and `std::scoped_lock` avoid deadlock? Do they lock in a fixed order?
**Difficulty:** #intermediate
**Category:** #concurrency #deadlock
**Concepts:** #std_lock #scoped_lock #try_and_back_off

**Answer:**
They lock all the given mutexes using an unspecified deadlock-avoidance algorithm built from `lock`, `try_lock` and `unlock`, typically try-and-back-off. The standard guarantees no deadlock among such calls, not any particular order.

**Explanation:**
- Typical implementation (libstdc++): block on the first mutex, `try_lock` the rest; if one fails, unlock everything and retry.
- Because of that, two threads calling `std::scoped_lock(a, b)` and `std::scoped_lock(b, a)` are still safe.
- `std::lock` itself is not RAII. Classic patterns:
```cpp
#include <mutex>

std::mutex m1, m2;

void with_defer() {
    std::unique_lock<std::mutex> a(m1, std::defer_lock);   // do not lock yet
    std::unique_lock<std::mutex> b(m2, std::defer_lock);
    std::lock(a, b);                                        // lock both safely
}

void with_adopt() {
    std::lock(m1, m2);                                      // lock both safely
    std::lock_guard<std::mutex> a(m1, std::adopt_lock);    // take ownership for unlock
    std::lock_guard<std::mutex> b(m2, std::adopt_lock);
}

int main() { with_defer(); with_adopt(); }
```
- ❌ Common wrong answer: "`std::lock` needs `adopt_lock`." `adopt_lock` belongs to the wrapper constructed after `std::lock` locked the raw mutexes; `defer_lock` belongs to wrappers constructed before.
- ❌ Common wrong answer: "It always releases and retries, so it can livelock." The algorithm is unspecified; implementations make progress in practice. Describe try-and-back-off as an implementation strategy, not the guarantee.
- ✅ What a strong answer adds: passing the same non-recursive mutex twice (`scoped_lock(a.m, a.m)`) is UB; with libstdc++ it spins forever.

**Key takeaway:** `scoped_lock` = all-or-nothing multi-lock + RAII; the algorithm is unspecified, the no-deadlock guarantee is not.

---

#### Q15: Are `try_lock` and timed locks a good way to prevent deadlock? What's the difference between `try_lock` and `try_lock_for`?
**Difficulty:** #intermediate
**Category:** #concurrency #deadlock
**Concepts:** #try_lock #timed_mutex #livelock

**Answer:**
`try_lock` returns immediately with success or failure; `try_lock_for` waits up to a duration and needs a timed mutex. They avoid waiting forever, but they are escape hatches and diagnostics, not the primary prevention; naive retry loops can livelock.

**Explanation:**
- `std::mutex` has `try_lock()` only. `try_lock_for` / `try_lock_until` exist on `std::timed_mutex`, `std::recursive_timed_mutex`, `std::shared_timed_mutex`.
- `try_lock` may fail spuriously even if the mutex is free; never treat failure as proof that someone holds it.
- Back-off pattern breaks "no preemption" (you release voluntarily), so deadlock cannot happen, but symmetric threads can retry in lockstep: livelock. Add randomized back-off.
- What to do on timeout matters: retry, abort the operation, log loudly. A silent timeout just hides a lock-order bug.
- ❌ Common wrong answer: "`try_lock` waits for some time and then gives up." That is `try_lock_for`.
- ✅ What a strong answer adds: in low-latency code, `try_lock` is useful to skip optional work (stats, housekeeping) instead of blocking the hot path.

**Key takeaway:** Fix deadlocks with ordering or `scoped_lock`; use timeouts to detect or degrade, not to design.

---

#### Q16: Can you get a deadlock with only one mutex?
**Difficulty:** #intermediate
**Category:** #concurrency #deadlock
**Concepts:** #self_deadlock #join #reentrancy

**Answer:**
Yes. A thread can relock a non-recursive mutex it already owns (UB, usually a permanent hang), or hold a mutex while waiting for another thread (`join()`, `future::get()`) that itself needs that mutex. The second resource is thread completion.

**Explanation:**
- Self-deadlock usually arrives via re-entrancy: a public method locks `m` and calls a callback that calls another public method that locks `m` again.
- Lock + join: `main` holds `m` and joins the worker; the worker is blocked on `m`. Circular wait between one lock and one "thread finished" event.
- Thread pools: a task waits on a future for another task queued behind it, and all workers are busy waiting: pool starvation deadlock.
- ❌ Common wrong answer: "Deadlock needs at least two mutexes." It needs a cycle of waits; the resources can be a mutex plus a join, a condition, or a pool slot.
- ✅ What a strong answer adds: rules: never block on another thread while holding a lock, and keep a private "already locked" helper instead of reaching for `recursive_mutex`.

**Key takeaway:** Any cycle of waiting deadlocks, even with one mutex.

---

#### Q17: What are livelock and starvation, and how do they differ from deadlock?
**Difficulty:** #intermediate
**Category:** #concurrency #progress
**Concepts:** #livelock #starvation #fairness

**Answer:**
In deadlock, threads are blocked forever in a cycle. In livelock, threads keep running and reacting to each other but make no progress. In starvation, the system progresses but one thread is perpetually denied the resource.

**Explanation:**
- Livelock example: two threads that lock their first mutex, `try_lock` the second, fail, release and retry in lockstep. CPU is high, throughput is zero. Fix: randomized back-off or a fixed order.
- Starvation examples:
  - A writer on a reader-preferring reader-writer lock while readers keep arriving.
  - A thread that keeps losing the race for a `std::mutex` (no FIFO guarantee).
  - Priority inversion starving a high-priority thread.
- Diagnosis by symptom: blocked and ~0% CPU suggests deadlock; busy and no progress suggests livelock; one victim with long tail latency suggests starvation.
- ❌ Common wrong answer: "Livelock is a deadlock where threads spin." The key difference is that livelocked threads are actively changing state, so a debugger shows them moving, not blocked on one lock.
- ✅ What a strong answer adds: lock-free algorithms remove deadlock but can still starve individual threads; only wait-free guarantees per-thread progress.

**Key takeaway:** Deadlock = blocked cycle; livelock = busy, no progress; starvation = one thread left behind.

---

#### Q18: How would you detect data races and deadlocks, in testing and in a hung production process?
**Difficulty:** #intermediate
**Category:** #concurrency #debugging
**Concepts:** #thread_sanitizer #helgrind #gdb

**Answer:**
In testing: ThreadSanitizer (`-fsanitize=thread`) for data races and lock-order inversions, Helgrind/DRD without recompiling, Clang `-Wthread-safety` statically. For a live hang: attach gdb and dump every thread's stack to see who waits on which lock.

**Explanation:**
- TSan tracks happens-before, so it catches races even when the timing did not cause a wrong result. It only sees code paths that actually ran.
- TSan's deadlock detector builds a lock-order graph and reports `lock-order-inversion (potential deadlock)` for `m1→m2` in one thread and `m2→m1` in another, even if the run never hung.
- Live process: `gdb -p <pid>`, then `thread apply all bt`. Threads blocked in `__lll_lock_wait` / `futex_wait` show which mutex they want; with debug info you can inspect the mutex owner field (glibc stores the owner TID).
- Production: watchdog/heartbeat, `try_lock_for` with a loud log on timeout, lock-order logging in debug builds.
- ❌ Common wrong answer: "TSan only finds data races, not deadlocks." It also reports potential deadlocks from lock-order cycles; what it cannot do is debug an already-hung production process.
- ✅ What a strong answer adds: TSan costs roughly 5 to 15x CPU and more memory, cannot be combined with ASan, and finds nothing on paths your tests never execute.

**Key takeaway:** TSan for races and lock-order cycles in CI; gdb thread backtraces for a live hang.

---

#### Q19: A worker thread polls a plain `bool stop` member, and the destructor sets `stop = true` and returns. What is wrong?
**Difficulty:** #intermediate
**Category:** #concurrency #lifetime
**Concepts:** #stop_flag #join #object_lifetime

**Answer:**
Two bugs: the unsynchronized `bool` is a data race (the worker may never see the change), and returning without `join()` lets the thread keep using `this` after the object is destroyed. Use `std::atomic<bool>` and join in the destructor (or `std::jthread`).

**Explanation:**
- Also note: if the `std::thread` member is still joinable when it is destroyed, `std::terminate` is called.
- Fix:
```cpp
#include <atomic>
#include <thread>

class Worker {
    std::atomic<bool> stop_{false};
    std::thread t_;   // declared after stop_ so it starts after stop_ exists
public:
    Worker() : t_([this] { while (!stop_.load(std::memory_order_relaxed)) { /* work */ } }) {}
    ~Worker() {
        stop_.store(true, std::memory_order_relaxed);
        if (t_.joinable()) t_.join();
    }
};

int main() { Worker w; }
```
- `relaxed` is fine for a pure stop request; if the flag also publishes data for the worker to read, use release/acquire.
- ❌ Common wrong answer: "Make the flag `volatile`." `volatile` does not prevent the data race.
- ✅ What a strong answer adds: C++20 `std::jthread` requests stop and joins automatically in its destructor, and `std::stop_token` integrates with `condition_variable_any` waits.

**Key takeaway:** Stop flags must be atomic, and an owning object must join before it dies.

---

#### Q20: Is it a data race if two threads write two different members of the same struct? What about two bit-fields?
**Difficulty:** #advanced
**Category:** #concurrency #memory_model
**Concepts:** #memory_location #bit_fields #false_sharing

**Answer:**
Different non-bit-field members are different memory locations, so no data race (possibly false sharing, a performance issue). Adjacent non-zero-width bit-fields form one memory location, so writing two of them concurrently is a data race.

**Explanation:**
- Bit-fields are written by reading the containing unit, modifying bits, writing it back: one thread's write can overwrite the other's.
- A zero-width bit-field (`unsigned : 0;`) ends the memory location and separates them.
- `std::vector<bool>` packs elements into words, and the standard explicitly excludes it from the "different elements may be modified concurrently" guarantee.
- ❌ Common wrong answer: "Threads touch different fields, so it's always safe." True for ordinary members, false for bit-fields and `vector<bool>`.
- ✅ What a strong answer adds: different members on the same cache line are correct but slow (false sharing). Correctness is decided by memory locations; performance by cache lines.

**Key takeaway:** Data races are about memory locations, and adjacent bit-fields share one.

---

#### Q21: Implement `transfer(Account& from, Account& to, int amount)` safely when any two accounts can be passed in either order.
**Difficulty:** #advanced
**Category:** #concurrency #design
**Concepts:** #lock_ordering #scoped_lock #self_deadlock

**Answer:**
First return early if `&from == &to`, then lock both with `std::scoped_lock(from.m, to.m)`. Alternatively order the two locks by a stable key such as account id (or address via `std::less`) so every thread uses the same order.

**Explanation:**
```cpp
#include <functional>
#include <mutex>

struct Account {
    int id;
    std::mutex m;
    long balance = 0;
    explicit Account(int i) : id(i) {}
};

void transfer(Account& from, Account& to, long amount) {
    if (&from == &to) return;                    // same mutex twice is UB
    std::scoped_lock lk(from.m, to.m);           // option 1: deadlock avoidance
    from.balance -= amount;
    to.balance += amount;
}

void transfer_ordered(Account& from, Account& to, long amount) {
    if (&from == &to) return;
    Account& first  = from.id < to.id ? from : to;   // option 2: global order by id
    Account& second = from.id < to.id ? to : from;
    std::lock_guard<std::mutex> l1(first.m);
    std::lock_guard<std::mutex> l2(second.m);
    from.balance -= amount;
    to.balance += amount;
}

int main() {
    Account a{1}, b{2};
    transfer(a, b, 10);
    transfer_ordered(b, a, 10);
}
```
- Ordering by address: use `std::less<Account*>{}(&from, &to)`, which gives a total order even where raw `<` on unrelated pointers is unspecified.
- ❌ Common wrong answer: "Lock `from` then `to`." `transfer(a, b)` and `transfer(b, a)` running concurrently then deadlock.
- ✅ What a strong answer adds: the self-transfer check. Without it, locking the same `std::mutex` twice is UB (a hang or a busy retry loop in practice).

**Key takeaway:** When the lock set is chosen at runtime, impose an order by a stable key or use `scoped_lock`, and handle aliasing.

---

#### Q22: Why is calling a callback or virtual function while holding a lock dangerous?
**Difficulty:** #advanced
**Category:** #concurrency #design
**Concepts:** #callbacks_under_lock #lock_ordering #observer_pattern

**Answer:**
Unknown code may take other locks (creating an order you do not control), call back into your object and relock your mutex (self-deadlock), or simply run long (latency for every waiter). Copy what you need under the lock, release it, then call out.

**Explanation:**
- Typical observer bug: `notify()` holds `m_` while iterating subscribers, and a subscriber calls `unsubscribe()`, which locks `m_` again.
- Two subsystems calling into each other under their own locks recreate the `m1`/`m2` inversion across module boundaries, invisible in either module's code review.
- Pattern:
```cpp
#include <functional>
#include <mutex>
#include <vector>

class Subject {
    std::mutex m_;
    std::vector<std::function<void()>> observers_;
public:
    void subscribe(std::function<void()> f) {
        std::lock_guard<std::mutex> g(m_);
        observers_.push_back(std::move(f));
    }
    void notify() {
        std::vector<std::function<void()>> copy;
        {
            std::lock_guard<std::mutex> g(m_);
            copy = observers_;          // snapshot under the lock
        }
        for (auto& f : copy) f();       // call out with no lock held
    }
};

int main() {
    Subject s;
    s.subscribe([&s] { s.subscribe([] {}); });   // re-entrant call is now safe
    s.notify();
}
```
- ❌ Common wrong answer: "Use a recursive mutex so re-entry works." It hides the design problem and lets the callback observe your object mid-update with broken invariants.
- ✅ What a strong answer adds: the snapshot means a just-unsubscribed observer may still get one call; document it or use a generation counter.

**Key takeaway:** Never call code you do not control while holding a lock.

---

#### Q23: You must avoid holding two locks at once but need to update two structures consistently. What design options do you have?
**Difficulty:** #advanced
**Category:** #concurrency #design
**Concepts:** #lock_granularity #single_owner #deadlock_prevention

**Answer:**
Put both structures under one mutex if they share an invariant, use `std::scoped_lock` when two locks are unavoidable, or remove shared mutation: route updates to one owning thread, or publish immutable snapshots that readers swap atomically.

**Explanation:**
- If two structures must always change together, they are one piece of state: one lock is the honest model, and it cannot deadlock with itself.
- Splitting into two locks for "performance" invites both deadlock (nested locks) and race conditions (an observer sees one updated, the other not).
- Single-owner: all mutations go through a queue to one thread; others only read snapshots or send messages. No lock ordering problem exists.
- Copy-on-write snapshot: build a new version privately, then publish it with one atomic pointer swap (`std::atomic<std::shared_ptr<T>>` in C++20).
- ❌ Common wrong answer: "Use finer-grained locks everywhere." Finer locks reduce contention but increase the number of lock-order rules and the chance of exposing broken invariants.
- ✅ What a strong answer adds: measure contention first; the simplest correct lock design is often fast enough, and complexity should be bought with data.

**Key takeaway:** Lock granularity follows invariants: one invariant, one critical section.
