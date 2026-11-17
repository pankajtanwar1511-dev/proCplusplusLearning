## TOPIC: Spinlocks, Busy-Waiting and Backoff

### INTERVIEW_QA: Interview Questions with Detailed Answers

#### Q1: What is a spinlock, and how does it differ from a `std::mutex`?
**Difficulty:** #beginner
**Category:** #concurrency #locking
**Concepts:** #spinlock #busy_waiting #mutex

**Answer:**
A spinlock is a lock whose waiters keep running and re-check the lock in a loop instead of sleeping. A mutex puts contended waiters to sleep in the kernel. Spinning avoids the sleep/wake cost but burns a CPU for the whole wait.

**Explanation:**
- Spinlock waiter: running, repeatedly trying an atomic RMW (or loading the flag), never descheduled voluntarily.
- Mutex waiter (Linux): after a failed userspace CAS it calls `futex_wait` and sleeps; the unlocker calls `futex_wake`.
- The uncontended fast path is similar for both (one atomic operation); they differ only under contention.
- ❌ Common wrong answer: "A spinlock is a faster mutex." It is faster only when the wait is shorter than a sleep/wake round trip and the holder is running on another core.
- ✅ What a strong answer adds: the decision depends on hold time, contention, number of runnable threads vs cores, and scheduling policy, not on "latency matters".

**Key takeaway:** Spinlock = pay CPU to save wake-up latency; mutex = pay wake-up latency to save CPU.

---

#### Q2: Can two threads acquire this exchange-based spinlock at the same moment?
**Difficulty:** #beginner
**Category:** #concurrency #atomics
**Concepts:** #exchange #read_modify_write #modification_order

```cpp
// Both threads run this at the same moment:
while (locked.exchange(true, std::memory_order_acquire)) {}
```

**Answer:**
No. `exchange` is an atomic read-modify-write: all RMWs on one atomic object are totally ordered, and each reads the value written by the one before it. Only the first in that order reads `false`; the other reads `true` and keeps spinning.

**Explanation:**
- `exchange(true)` atomically reads the old value and writes `true` as one indivisible step.
- Initial `false`: thread A's RMW returns `false` (A owns it), thread B's RMW returns `true` (B spins).
- The same reasoning applies to `atomic_flag::test_and_set` and to a CAS `false → true`.
- ❌ Common wrong answer: "It works because the cache line is locked by MESI." That is how hardware may implement it; the C++ guarantee is the atomicity of RMW operations in the object's modification order.
- ✅ What a strong answer adds: a split "load, then store" (check-then-set) is **not** atomic and lets both threads in; the RMW is essential.

**Key takeaway:** Mutual exclusion comes from a single atomic RMW, never from a separate read and write.

---

#### Q3: "Spinlocks are faster than mutexes." Do you agree?
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

**Key takeaway:** Spinning is a bet that the lock frees up before a sleep would have paid off.

---

#### Q4: Which memory orders do a spinlock's `lock()` and `unlock()` need, and what breaks if you use `relaxed`?
**Difficulty:** #intermediate
**Category:** #concurrency #memory_model
**Concepts:** #acquire_release #happens_before #data_race

**Answer:**
The successful acquiring RMW needs `acquire` and the releasing store needs `release`. Then an unlock synchronizes-with the next lock, so one holder's writes happen-before the next holder's reads. With `relaxed` the flag still excludes, but the protected data is a data race.

**Explanation:**
- Acquire on lock: section operations cannot be moved before the lock, and the previous holder's writes are visible.
- Release on unlock: section writes cannot be moved after the unlock and are published to the next acquirer.
- A TTAS "test" load can be `relaxed`: it only decides when to retry; the acquire RMW re-validates.
- The failure order of a CAS can be `relaxed`: a failed attempt acquires nothing.
- ❌ Common wrong answer: "It is atomic, so ordering does not matter." Atomicity of the flag says nothing about the non-atomic data around it.
- ❌ Common wrong answer: "Release flushes the store buffer." Describe it by C++ guarantees (synchronizes-with, happens-before); hardware fences are an implementation detail.
- ✅ What a strong answer adds: relaxed locks often pass tests on x86 (strongly ordered hardware) and fail on ARM, or after the compiler reorders the section.

**Key takeaway:** Lock = acquire, unlock = release; that pair is what makes the data safe, not just the flag.

---

#### Q5: What happens at the hardware level when 32 threads spin on `exchange`, and how does test-and-test-and-set help?
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

**Key takeaway:** Spin on loads, attack with RMW only when the lock looks free.

---

#### Q6: What does the x86 `pause` instruction do in a spin loop, and when should a spinner yield or back off instead?
**Difficulty:** #intermediate
**Category:** #concurrency #performance
**Concepts:** #pause_instruction #backoff #yield

**Answer:**
`pause` is a spin-wait hint: it slows the loop, saves power, frees execution resources for the hyper-threaded sibling and avoids a costly pipeline flush when the loop exits. After a bounded spin, back off exponentially and then yield or sleep.

**Explanation:**
- Without `pause`, a tight load loop fills the pipeline with speculative loads; when the lock word changes the CPU detects a memory-order violation and flushes.
- Latency differs by CPU: about 10 cycles on older Intel cores, about 140 cycles on Skylake and several later cores. Calibrate spin budgets in time, not iteration counts.
- Exponential backoff: wait 1, 2, 4, ... pauses between attempts (capped), which spreads retries and reduces contention.
- `std::this_thread::yield()`: lets another runnable thread (possibly the preempted holder) run; weak guarantees.
- ❌ Common wrong answer: "`pause` puts the thread to sleep." It is a few to ~140 cycles of delay; the thread stays on the CPU.
- ✅ What a strong answer adds: on ARM use `yield` (or `isb`); C++ has no portable `cpu_relax`, so wrap the intrinsic.

**Key takeaway:** `pause` for every spin iteration; backoff and yield once the spin is clearly not short.

---

#### Q7: What happens if the thread holding a spinlock is preempted?
**Difficulty:** #advanced
**Category:** #concurrency #scheduling
**Concepts:** #preemption #oversubscription #time_slice

**Answer:**
All waiters keep spinning until the holder is scheduled again, often a full time slice of milliseconds, burning CPU that the holder itself may need. With more runnable threads than cores this cascades, and spinlocks become far slower than a blocking mutex.

**Explanation:**
- User-space code cannot disable preemption, so any spinlock holder can be descheduled mid-section.
- Waiters occupy cores (and run queues), delaying the holder's return.
- Measured: 80 threads on 20 CPUs, tiny section: TAS spinlock 16 to 19 s, `std::mutex` under 1 s.
- Ticket locks make it worse: if the **next** ticket holder is preempted, everyone waits for it (convoy).
- ❌ Common wrong answer: "Waiters just wait a bit longer." They waste whole time slices and amplify the delay.
- ✅ What a strong answer adds: Linux kernel spinlocks disable preemption (and optionally interrupts) while held, which is why spinlocks are standard inside the kernel but risky in user space; in user space, pin threads to dedicated cores or use a hybrid lock.

**Key takeaway:** A spinlock assumes the holder is running; preemption breaks that assumption badly.

---

#### Q8: How can a spinlock cause priority inversion or livelock with real-time threads?
**Difficulty:** #advanced
**Category:** #concurrency #scheduling
**Concepts:** #priority_inversion #sched_fifo #livelock

**Answer:**
If a low-priority thread holds the spinlock and a higher-priority `SCHED_FIFO` thread on the same core spins for it, the spinner never blocks, so the scheduler never runs the holder, which never releases. A blocking mutex (ideally with priority inheritance) lets the holder run.

**Explanation:**
- Real-time `SCHED_FIFO` threads run until they block or yield; a higher-priority one always preempts a lower one on the same CPU.
- Both `SCHED_FIFO`: permanent livelock.
- Holder is a normal `SCHED_OTHER` thread: Linux RT throttling (default 95% of each second for RT tasks) leaves it a little CPU, so the system crawls instead of freezing.
- Mutex with `PTHREAD_PRIO_INHERIT`: the kernel temporarily boosts the holder to the waiter's priority. Impossible with a spinlock, because the kernel does not know the lock exists.
- ❌ Common wrong answer: "Priority inversion only affects mutexes." Spinlocks make it worse: the high-priority thread does not even sleep.
- ✅ What a strong answer adds: real-time systems avoid user-space spinlocks across priority levels on shared cores, or bound the spin and fall back to blocking.

**Key takeaway:** Spinning plus strict priorities on one core can stop the holder from ever running.

---

#### Q9: How does a hybrid "spin-then-sleep" mutex work, and does `std::mutex` spin?
**Difficulty:** #advanced
**Category:** #concurrency #internals
**Concepts:** #futex #adaptive_mutex #hybrid_lock

**Answer:**
It spins briefly in user space, betting the holder releases soon, then sleeps on a futex. A 3-state word (free, locked, locked with sleepers) lets unlock skip the wake syscall when nobody sleeps. On glibc, `std::mutex` does not spin; the adaptive pthread mutex type does.

**Explanation:**
- Futex: lock word in user memory; `FUTEX_WAIT(addr, val)` sleeps only if `*addr == val` (no lost wake-up); `FUTEX_WAKE` wakes sleepers.
- Classic algorithm (Drepper, "Futexes Are Tricky"):

```cpp
// state: 0 free, 1 locked, 2 locked + maybe sleepers
void lock() {
    for (int i = 0; i < 100; ++i) {               // bounded spin
        int e = 0;
        if (s.load(std::memory_order_relaxed) == 0 &&
            s.compare_exchange_weak(e, 1, std::memory_order_acquire)) return;
        cpu_relax();
    }
    while (s.exchange(2, std::memory_order_acquire) != 0)
        s.wait(2);                                 // C++20 futex-like wait
}
void unlock() {
    if (s.exchange(0, std::memory_order_release) == 2) s.notify_one();
}
```

- Typical implementations (not guaranteed by C++):
  - glibc default mutex (used by `std::mutex`): CAS fast path, then straight to `futex_wait`;
  - `PTHREAD_MUTEX_ADAPTIVE_NP`: bounded spin first (tunable spin count);
  - Windows `CRITICAL_SECTION`: configurable spin count.
- ❌ Common wrong answer: "A mutex always does a syscall." The uncontended path is pure user space.
- ❌ Common wrong answer: "`std::mutex` always spins first." Implementation-defined; glibc's default does not.
- ✅ What a strong answer adds: C++20 `std::atomic::wait/notify` makes this portable; the key subtlety is the "2" state so unlock knows whether a wake is needed.

**Key takeaway:** Hybrid lock = short spin for the common case, futex sleep for the long tail.

---

#### Q10: `std::atomic_flag` or `std::atomic<bool>` for a spinlock? What changed in C++20?
**Difficulty:** #intermediate
**Category:** #concurrency #atomics
**Concepts:** #atomic_flag #lock_free #cpp20

**Answer:**
`atomic_flag` is the only type guaranteed lock-free, but before C++20 it had only `test_and_set` and `clear`, so TTAS needed `atomic<bool>`. C++20 adds `test()`, `wait()` and `notify_one/all()` and default-initializes it to clear, making either type fine.

**Explanation:**
- Pre-C++20: `std::atomic_flag f = ATOMIC_FLAG_INIT;` was required; no plain read existed.
- C++20: `std::atomic_flag f;` is clear; `f.test()` enables TTAS; `f.wait(true)` enables a sleeping fallback.
- `std::atomic<bool>` is lock-free on every mainstream platform (`is_always_lock_free`), but the standard only guarantees it for `atomic_flag`.
- Either way, align the lock to its own cache line if it sits next to hot data.
- ❌ Common wrong answer: "`volatile bool` is enough." `volatile` provides neither atomic RMW nor inter-thread ordering; it is a data race.
- ✅ What a strong answer adds: lock-free matters for spinlocks because a lock-based "atomic" would hide a real mutex inside your spinlock.

**Key takeaway:** Use `atomic_flag` (C++20 API) or `atomic<bool>`; never a plain or `volatile` bool.

---

#### Q11: What is a ticket lock and what problem does it solve?
**Difficulty:** #advanced
**Category:** #concurrency #locking
**Concepts:** #ticket_lock #fairness #starvation

**Answer:**
A ticket lock has two counters: a waiter takes `my = next.fetch_add(1)` and spins until `serving == my`; unlock increments `serving`. It grants the lock in FIFO order, preventing the starvation that TAS/TTAS allow, at the cost of convoys if a waiting thread is preempted.

**Explanation:**
- TAS/TTAS are unfair: the releasing thread, with the line hot in its cache, often re-acquires immediately.
- Ticket lock waiters only **load** `serving` while waiting; one RMW per acquisition (`fetch_add` on `next`).
- Only the holder writes `serving`, so `store(load + 1, release)` is enough in `unlock`.
- Downsides:
  - all waiters still spin on one cache line (invalidated on every release);
  - strict order: if the next ticket's thread is descheduled, nobody else can proceed.
- ❌ Common wrong answer: "Fair means faster." Fairness usually costs throughput.
- ✅ What a strong answer adds: MCS/CLH queue locks keep FIFO order and let each waiter spin on its own cache line; the Linux `qspinlock` is built on MCS.

**Key takeaway:** Ticket locks trade throughput for FIFO fairness; queue locks fix the shared-line spinning.

---

#### Q12: A market-data thread updates a small quote (bid, ask, sizes) that a strategy thread reads. Would you protect it with a spinlock?
**Difficulty:** #advanced
**Category:** #concurrency #design
**Concepts:** #spinlock #seqlock #low_latency

**Answer:**
A spinlock is defensible: the section is a few stores, threads are usually pinned, and sleeping would cost more than the wait. But the better answer often removes the lock: a seqlock, double buffering, or an SPSC queue lets the reader never block the writer.

**Explanation:**
- Why a spinlock can be OK here: tiny section, two threads, dedicated cores, no syscalls inside.
- Why it is not ideal:
  - the reader can delay the writer, and the writer is the latency-critical side;
  - both threads hammer the same cache line.
- Lock-free alternatives:
  - **seqlock:** writer increments a sequence counter (odd = writing), writes, increments again; reader retries if the sequence was odd or changed. The writer never waits.
  - **double buffer / snapshot index:** writer fills the inactive copy and publishes its index with a release store.
  - **SPSC ring buffer:** if the reader needs every update, not just the latest.
- ❌ Common wrong answer: "Latency matters, so use a spinlock." First ask whether shared mutable state is needed at all.
- ✅ What a strong answer adds: whichever you choose, put the lock/sequence word and the data on cache lines that the reader does not write.

**Key takeaway:** For hot single-writer data, prefer designs where the writer never waits; a spinlock is the fallback, not the goal.
