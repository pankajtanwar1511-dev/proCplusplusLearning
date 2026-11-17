## TOPIC: Condition Variables and Producer-Consumer Signalling

### INTERVIEW_QA: Interview Questions with Detailed Answers

#### Q1: What problem does a condition variable solve, and why is busy-waiting on a queue a bad alternative?
**Difficulty:** #beginner
**Category:** #concurrency #synchronization
**Concepts:** #condition_variable #busy_waiting #blocking

**Answer:**
It lets a thread block until shared state may have changed, instead of polling. Busy-waiting burns a core (and is a data race without a lock); polling while holding the mutex is worse, because the producer can never get the lock to make progress.

**Explanation:**
- Polling without a lock: `while (q.empty()) {}`
  - wastes a full CPU while doing nothing useful;
  - reads `q` concurrently with the producer's writes: a data race, undefined behaviour.
- Polling while holding the mutex:
  - the producer needs the same mutex to push, so the loop can never end;
  - the program livelocks or hangs.
- With a CV, the waiting thread is descheduled; the scheduler runs other runnable threads until a producer notifies.
- ❌ Common wrong answer: "A condition variable is a faster mutex." It is not a lock at all; it is always used **together** with a mutex.
- ✅ What a strong answer adds: the CV is only the wake-up mechanism. The condition itself is ordinary shared state protected by the mutex, and the CV never stores it.

**Key takeaway:** A CV replaces polling with blocking; it does not replace the mutex.

---

#### Q2: Why does `std::condition_variable::wait` need a `std::unique_lock` instead of a `std::lock_guard`?
**Difficulty:** #beginner
**Category:** #concurrency #synchronization
**Concepts:** #unique_lock #lock_guard #condition_variable

**Answer:**
`wait` must release the mutex while the thread is blocked and reacquire it before returning. `unique_lock` exposes `unlock()`/`lock()` and ownership tracking; `lock_guard` is fixed for its scope, so passing it to `wait` does not compile.

**Explanation:**
- Signature: `void wait(std::unique_lock<std::mutex>& lock);`
- During the wait the mutex is **released**, so producers can acquire it and change the state.
- Before `wait` returns, it is **reacquired**, so the caller can safely read the state.
- `std::condition_variable` accepts only `unique_lock<std::mutex>`. For other lock types (`shared_lock`, a custom spinlock) use `std::condition_variable_any`.
- ❌ Common wrong answer: "Because `wait` unlocks the mutex when the predicate is false." The plain `wait(lock)` has no predicate; it always unlocks while blocked. The predicate only decides whether to wait again.
- ✅ What a strong answer adds: precondition is that the lock is owned by the caller; calling `wait` on an unlocked `unique_lock` is undefined behaviour.

**Key takeaway:** `wait` = unlock while sleeping, relock before returning; only `unique_lock` supports that.

---

#### Q3: Walk me through exactly what happens to the mutex during `cv.wait(lock)`.
**Difficulty:** #beginner
**Category:** #concurrency #synchronization
**Concepts:** #wait_semantics #mutex_ownership #atomic_release

**Answer:**
The caller owns the mutex on entry. `wait` atomically releases it and registers the thread as a waiter, then blocks. On notify, spurious wakeup or timeout, the thread reacquires the mutex (possibly blocking for it) and only then returns.

**Explanation:**
- Contract:
  - before `wait`: mutex owned;
  - while blocked: mutex **not** owned;
  - after `wait` returns, for any reason: mutex owned again.
- Steps: release + become waiter (atomic) → block → unblock → reacquire mutex → return.
- If the mutex is held by someone else at wake time, the thread blocks again, this time on the mutex.
- ❌ Common wrong answer: "The thread holds the mutex while it sleeps, so how can the producer change `ready`?" It does not; releasing the mutex is the whole point of `wait`.
- ❌ Common wrong answer: "The kernel moves the thread into the mutex queue." That is an implementation detail and is usually not how it works; stay at the C++ contract unless asked about internals.
- ✅ What a strong answer adds: if reacquiring the mutex throws, `std::terminate` is called. `wait` never returns to you without the lock.

**Key takeaway:** Before: locked. During: unlocked. After: locked again, always.

---

#### Q4: What is a spurious wakeup, and why must `wait` be called in a loop?
**Difficulty:** #beginner
**Category:** #concurrency #synchronization
**Concepts:** #spurious_wakeup #predicate_loop #while_vs_if

**Answer:**
A spurious wakeup is a return from `wait` with no matching notification; the standard explicitly allows it. Because returning from `wait` says nothing about the condition, the condition must be rechecked under the mutex: `while (!pred) cv.wait(lk);` or `cv.wait(lk, pred)`.

**Explanation:**
- `if (!ready) cv.wait(lk); use(data);` can proceed with `ready == false` after a spurious wakeup.
- The loop also covers two non-spurious cases:
  - **stolen wakeup:** you were notified, but another consumer got the mutex first and took the item;
  - **wrong predicate:** the notify on a shared CV was meant for a different condition.
- ❌ Common wrong answer: "Spurious wakeups are caused by context switches or interrupts." Possible implementation causes exist (for example signals interrupting a futex wait), but the C++ answer is simply: the standard permits them, so code must tolerate them.
- ❌ Common wrong answer: "A spurious wakeup is a notification sent by mistake." It is not tied to any notification.
- ✅ What a strong answer adds: even with zero spurious wakeups on your platform, the loop is still required for stolen wakeups with multiple consumers.

**Key takeaway:** Returning from `wait` means "go and look", never "the condition is true".

---

#### Q5: What does `cv.wait(lock, pred)` do internally, and what happens if `pred` is already true when you call it?
**Difficulty:** #intermediate
**Category:** #concurrency #synchronization
**Concepts:** #predicate_overload #spurious_wakeup #lost_wakeup

**Answer:**
It is specified as `while (!pred()) wait(lock);`. The predicate is evaluated first with the mutex held, so if it is already true `wait` returns immediately without blocking or needing any notification. After every wakeup the predicate is evaluated again.

**Explanation:**
- Predicate evaluations always happen with the mutex held, so reading shared state inside the lambda is safe.
- Already-true predicate: zero blocking, zero notifications needed. This is exactly what makes "notify before wait" harmless.
- The predicate may be evaluated many times (once per wakeup); it should be cheap and side-effect free.
- If the predicate throws, the exception propagates out of `wait` with the lock held.
- ❌ Common wrong answer: "With the predicate overload the first lock happens only after a notification." There is no notification step at all if the predicate is true on entry.
- ✅ What a strong answer adds: the CV never interprets the predicate. It is plain user code run by the library in a loop.

```cpp
cv.wait(lk, [&] { return !q.empty(); });
// equivalent to:
while (q.empty())
    cv.wait(lk);
```

**Key takeaway:** The predicate overload is the loop you would write yourself, including the check before the first sleep.

---

#### Q6: Does a condition variable remember a notification sent when nobody was waiting? Why does correct code not care?
**Difficulty:** #intermediate
**Category:** #concurrency #synchronization
**Concepts:** #notification_semantics #predicate_state #semaphore

**Answer:**
No. A notify with no current waiter is simply dropped; a later `wait` does not see it. Correct code does not care because it waits for the state, not the notification: the producer set the predicate under the mutex, so a later waiter sees it true and never blocks.

**Explanation:**
- Raw `cv.wait(lk)` after an early notify can block forever although `ready == true`.
- `cv.wait(lk, [] { return ready; })` checks `ready` first and returns immediately.
- The rule: **the predicate is the memory, the CV is the doorbell.**
- ❌ Common wrong answer: "The CV queues the notification for the next waiter." That is semaphore behaviour (`std::counting_semaphore` keeps a count); CVs keep nothing.
- ✅ What a strong answer adds: this is why designs that use a notification as an event ("I was notified, therefore X happened") are broken. Every event must be recorded in shared state.

**Key takeaway:** Never rely on a notification being remembered; record the event in state.

---

#### Q7: What is a lost wakeup, and how does `condition_variable::wait` prevent it?
**Difficulty:** #intermediate
**Category:** #concurrency #synchronization
**Concepts:** #lost_wakeup #atomic_release #check_then_act

**Answer:**
A lost wakeup is a notify that lands between a waiter checking the condition and actually starting to wait, so the waiter sleeps with the condition already true. `wait` prevents it by releasing the mutex and registering as a waiter atomically, while the producer must hold that mutex to change the state.

**Explanation:**
- Broken hand-rolled wait:

```text
Consumer: lock; ready == false; unlock      <- gap
Producer:                 lock; ready = true; unlock; notify (no waiter: dropped)
Consumer: sleep forever
```

- With `wait`:
  - the consumer checks the predicate while holding the mutex;
  - "release mutex + become waiter" is one indivisible step;
  - the producer can only change `ready` after acquiring the mutex, i.e. after the consumer is already a registered waiter, so its notify will find it.
- ❌ Common wrong answer: "The `while` loop prevents lost wakeups." The loop handles spurious and stolen wakeups. Lost wakeups are prevented by the atomic release-and-wait plus the mutex-protected state.
- ✅ What a strong answer adds: the guarantee only holds if the producer modifies the state under the **same** mutex; see the atomic-flag trap.

**Key takeaway:** The mutex makes "check, then sleep" atomic with respect to the producer's "change, then notify".

---

#### Q8: Is "wake up and reacquire the mutex" also a single atomic operation?
**Difficulty:** #intermediate
**Category:** #concurrency #synchronization
**Concepts:** #wait_semantics #mutex_reacquire #notify_all

**Answer:**
No. Only "release the mutex and become a waiter" is atomic. After being unblocked, the thread competes for the mutex like any other thread and may block on it. The guarantee is that `wait` does not return to your code until the mutex has been reacquired.

**Explanation:**
- Between the wake and the reacquire, other threads (including brand-new ones that never waited) can take the mutex and change the state.
- That is precisely why the predicate is rechecked after every return.
- A thread unblocked by `notify_all` but blocked on the mutex is no longer a CV waiter; it proceeds when the mutex is released, without another notify.
- ❌ Common wrong answer: "If the woken thread cannot get the mutex, it releases and goes back to sleep on the CV." It waits for the **mutex**; it only goes back to the CV if, once it holds the mutex, the predicate is false.
- ✅ What a strong answer adds: on Linux/glibc the woken thread is not handed the mutex; it calls the normal lock path, which may block on the mutex's futex.

**Key takeaway:** Wake and relock are separate steps; the predicate recheck covers whatever happened in between.

---

#### Q9: The producer sets a plain `bool ready` and notifies without locking the mutex. What is wrong?
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

**Key takeaway:** The mutex protects the predicate; `notify` only rings the bell.

---

#### Q10: If `ready` is `std::atomic<bool>`, can the producer set it and notify without taking the mutex?
**Difficulty:** #advanced
**Category:** #concurrency #synchronization
**Concepts:** #lost_wakeup #atomic #condition_variable

**Answer:**
It removes the data race but not the lost wakeup. The store and notify can both happen after the consumer saw `false` but before it became a waiter, so the consumer can sleep forever. Store under the mutex, or lock and unlock the mutex between the store and the notify.

**Explanation:**
- Interleaving:
  1. Consumer holds `m`, predicate reads `ready == false`.
  2. Producer: `ready.store(true)`, `cv.notify_one()`: no waiter registered yet, dropped.
  3. Consumer: `wait` releases `m` and blocks. Nobody notifies again.
- Why the mutex fixes it: if the producer must acquire `m` before notifying, it cannot do so while the consumer is between step 1 and step 3.
- Minimal fix if the flag must stay atomic (for lock-free readers elsewhere):

```cpp
ready.store(true);
{ std::lock_guard<std::mutex> lk(m); }   // wait until no waiter is mid-check
cv.notify_one();
```

- ❌ Common wrong answer: "Atomics make the mutex unnecessary." For a CV the mutex is part of the wait protocol, not only race protection.
- ✅ What a strong answer adds: if the whole condition is one atomic value, C++20 `std::atomic<T>::wait/notify_one` is the better tool; it has no such gap.

**Key takeaway:** With a CV, the state change must be serialized with the waiter's check through the same mutex, even when the state is atomic.

---

#### Q11: Should you call `notify_one` while holding the mutex or after unlocking it?
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

**Key takeaway:** Modify under the lock for correctness; notify after unlocking for speed, unless lifetime forces otherwise.

---

#### Q12: Five consumers wait on the same CV and one item is pushed. What is the difference between `notify_one` and `notify_all` here?
**Difficulty:** #intermediate
**Category:** #concurrency #performance
**Concepts:** #notify_one #notify_all #thundering_herd

**Answer:**
`notify_one` unblocks one waiter, which takes the item. `notify_all` unblocks all five; they serialize on the mutex, one takes the item and four find the queue empty and wait again. That wasted wake-and-sleep is the thundering herd.

**Explanation:**
- Correctness is the same in both cases thanks to the predicate; only the cost differs.
- Prefer `notify_one` when:
  - one unit of work was added, and
  - every waiter waits for the same predicate (any one of them can use it).
- Prefer `notify_all` when:
  - the change can satisfy many waiters (shutdown, batch of N items, a gate opening);
  - waiters on the same CV wait for **different** predicates.
- ❌ Common wrong answer: "With `notify_all` only one thread actually wakes because there is one mutex." All are unblocked from the CV; the mutex only serializes them afterwards.
- ✅ What a strong answer adds: `notify_one` with heterogeneous waiters can stall the system (the wrong waiter wakes and sleeps again), so "always use `notify_one` for speed" is unsafe advice.

**Key takeaway:** `notify_one` for one interchangeable unit of work; `notify_all` for broadcasts or mixed predicates.

---

#### Q13: After `notify_all`, C1 holds the mutex for 40 s. What do C2 and C3 do, and do they need another notification?
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

**Key takeaway:** Notification and mutex acquisition are separate events; keep the locked region tiny.

---

#### Q14: Does `notify_one` guarantee that the woken thread runs immediately, gets the mutex, or finds the predicate true?
**Difficulty:** #intermediate
**Category:** #concurrency #synchronization
**Concepts:** #notification_semantics #scheduling #stolen_wakeup

**Answer:**
None of these. `notify_one` only makes one waiter eligible to run. The scheduler decides when it runs, it must then compete for the mutex, and by the time it holds the mutex another thread may have consumed or changed the state.

**Explanation:**
- No immediate execution: the notifier keeps running; the woken thread is just runnable.
- No mutex handoff: another thread, even one that never waited, can lock the mutex first ("barging").
- No predicate guarantee: a different consumer may have taken the item (stolen wakeup).
- ❌ Common wrong answer: "The kernel picks one waiter and gives it the mutex." The standard says nothing about handoff, and common implementations do not hand off.
- ✅ What a strong answer adds: which waiter is chosen is unspecified, so CV-based queues are not FIFO-fair. If fairness matters, use a ticketed design or per-thread CVs.

**Key takeaway:** A notification is a hint to re-check, with no ordering or ownership guarantees.

---

#### Q15: How does `wait_for` behave? Is it polling, and what do its return values mean?
**Difficulty:** #intermediate
**Category:** #concurrency #timeouts
**Concepts:** #wait_for #cv_status #timed_wait

**Answer:**
`wait_for` is a blocking wait with a deadline, not polling: it releases the mutex, blocks, and returns on notify, spurious wakeup or timeout, with the mutex reacquired. The raw form returns `cv_status`; the predicate form returns the final value of the predicate.

**Explanation:**
- `cv.wait_for(lk, 100ms)`:
  - `cv_status::timeout`: the time elapsed;
  - `cv_status::no_timeout`: woken earlier, possibly spuriously. It does **not** mean the condition is true.
- `cv.wait_for(lk, 100ms, pred)`:
  - specified as `wait_until(lk, steady_clock::now() + 100ms, pred)`;
  - returns `true` if `pred()` became true, `false` if the deadline passed with `pred()` false.
- ❌ Common wrong answer: "`wait_for` unlocks, actively waits for 100 ms, then relocks." It sleeps; no CPU is used while blocked.
- ❌ Common wrong answer: "After `wait_for` the library has checked my predicate." Only the predicate overload does that.
- ✅ What a strong answer adds: a timeout result does not prove the condition is false; the state may have changed just before the mutex was reacquired. Read the state, not the status.

**Key takeaway:** Use `wait_for(lk, d, pred)` and branch on its `bool`.

---

#### Q16: Why does this loop fail to wait at most one second?
**Difficulty:** #advanced
**Category:** #concurrency #timeouts
**Concepts:** #wait_until #deadline #spurious_wakeup

```cpp
while (!ready) {
    if (cv.wait_for(lk, 1s) == std::cv_status::timeout)
        return false;
}
```

**Answer:**
Every wakeup restarts a fresh 1 s timeout, so the total wait is unbounded: unrelated notifications or spurious wakeups keep postponing it. Use a fixed deadline: `wait_until(lk, deadline, pred)` or `wait_for(lk, 1s, pred)`, which computes one deadline.

**Explanation:**
- Scenario: another component calls `notify_all` every 200 ms on the same CV for its own purposes. The function above never times out.
- Correct versions:

```cpp
bool ok = cv.wait_for(lk, 1s, [&] { return ready; });
// or, when several waits share one budget:
auto deadline = std::chrono::steady_clock::now() + 1s;
bool ok2 = cv.wait_until(lk, deadline, [&] { return ready; });
```

- Use `steady_clock` for deadlines; a `system_clock` deadline jumps when the wall clock is adjusted (NTP, manual change).
- ❌ Common wrong answer: "Looping on `wait_for` is the standard spurious-wakeup protection." The loop is right, the relative timeout inside it is wrong.
- ✅ What a strong answer adds: older libstdc++ versions implemented steady-clock waits on top of the system clock; modern glibc/libstdc++ use `pthread_cond_clockwait` with `CLOCK_MONOTONIC`.

**Key takeaway:** Timeouts belong to the whole wait, so compute an absolute steady-clock deadline once.

---

#### Q17: Design the waiting logic of a thread pool worker so that the pool can be shut down cleanly.
**Difficulty:** #intermediate
**Category:** #concurrency #design
**Concepts:** #shutdown #stop_flag #producer_consumer

**Answer:**
Wait on `!q.empty() || stopping`. After waking: if there is work, pop it, unlock and process it; if the queue is empty and `stopping` is set, exit. Shutdown sets `stopping` under the mutex, calls `notify_all`, then joins all workers.

**Explanation:**

```cpp
void worker() {
    while (true) {
        std::unique_lock<std::mutex> lk(m);
        cv.wait(lk, [&] { return !q.empty() || stopping; });
        if (q.empty() && stopping) return;   // drained and asked to stop
        auto task = std::move(q.front());
        q.pop();
        lk.unlock();
        task();
    }
}
```

- Three cases after waking:
  - work available: process it (even if `stopping`, when draining);
  - empty + stopping: exit;
  - empty + not stopping: cannot happen on return, the predicate loop waits again.
- ❌ Common wrong answer: "Wait only on `!q.empty()` and set `stopping`." Workers never wake for it, so `join()` hangs.
- ❌ Common wrong answer: "Use `notify_one` after setting `stopping`." Only one worker exits; the rest sleep forever.
- ✅ What a strong answer adds: decide explicitly between draining (`q.empty() && stopping`) and abandoning (`stopping`); reject pushes after shutdown; with C++20, `std::jthread` + `condition_variable_any` + `stop_token` gives the same behaviour built in.

**Key takeaway:** Shutdown is just another predicate: set it under the lock, broadcast it, and choose drain or abandon on purpose.

---

#### Q18: A consumer pops an item and processes it while still holding the queue mutex. What is the cost, and how do you fix it?
**Difficulty:** #beginner
**Category:** #concurrency #performance
**Concepts:** #critical_section #lock_scope #throughput

**Answer:**
Processing under the lock serializes the whole pipeline: producers cannot push and other consumers cannot pop until it finishes, so adding consumers adds no throughput. Move the item out, unlock, then process.

**Explanation:**
- Effects of a long critical section:
  - all consumers effectively run one at a time;
  - producers block on `push`, which can back up the upstream (for example a network reader);
  - notified waiters pile up on the mutex.
- Fix: `auto item = std::move(q.front()); q.pop(); lk.unlock(); process(item);`
- If processing can throw, unlocking first also avoids holding the lock during unwinding.
- ❌ Common wrong answer: "It is fine because the CV releases the mutex." The CV releases it only while blocked inside `wait`; after `wait` returns you hold it until you unlock.
- ✅ What a strong answer adds: the same rule applies to the producer: build the item outside the lock, then lock only to push.

**Key takeaway:** Lock to move data in or out of the shared structure, never to do the work.

---

#### Q19: A bounded buffer uses one CV for both "not full" and "not empty" with `notify_one`. What can go wrong?
**Difficulty:** #advanced
**Category:** #concurrency #design
**Concepts:** #notify_one #mixed_waiters #deadlock

**Answer:**
`notify_one` can wake a waiter of the wrong kind, for example a producer when a consumer was needed. Its predicate is false, so it sleeps again, and the thread that could make progress is never woken: everyone ends up waiting. Use two CVs or `notify_all`.

**Explanation:**
- Example with capacity 1, producers P1, P2 and consumers C1, C2:
  - buffer full, P2 waiting for "not full";
  - C1 takes the item and `notify_one` wakes C2 instead of P2;
  - C2 sees "empty" and waits; P2 never hears about the free slot; nothing moves.
- Fixes:
  - one CV per predicate: `not_full` (producers wait, consumers notify) and `not_empty` (consumers wait, producers notify);
  - or `notify_all` on the shared CV (correct, more wakeups).
- ❌ Common wrong answer: "The predicate loop protects against this." The predicate prevents wrong **progress**; it cannot create a missing notification.
- ✅ What a strong answer adds: the general rule is that `notify_one` is only safe when every waiter on that CV can make use of the change. Full bounded-queue and ring-buffer design is a separate topic.

**Key takeaway:** One CV per condition, or broadcast.

---

#### Q20: What is the difference between `std::condition_variable` and `std::condition_variable_any`?
**Difficulty:** #intermediate
**Category:** #concurrency #stl
**Concepts:** #condition_variable_any #stop_token #lockable

**Answer:**
`condition_variable` works only with `std::unique_lock<std::mutex>` and maps directly onto the native condvar, so it is the fastest. `condition_variable_any` works with any lock that has `lock()`/`unlock()` (shared locks, custom locks) and in C++20 accepts a `stop_token`, at some size and speed cost.

**Explanation:**
- Use `condition_variable_any` when:
  - waiting with a `std::shared_lock<std::shared_mutex>` (readers waiting on a condition);
  - using a custom mutex type;
  - you want `wait(lock, stop_token, pred)` so a `std::jthread` stop request wakes the waiter.
- Cost: implementations typically keep an internal `std::mutex` plus a `condition_variable` and juggle both locks.
- Both have identical semantics for spurious wakeups, lost notifications, and predicate loops.
- ❌ Common wrong answer: "`condition_variable_any` can wait without any lock." It still needs a lock protecting the predicate.
- ✅ What a strong answer adds: the `stop_token` overload returns `pred()`, so a stop request with work still queued returns `true`; check the token (or the queue) to decide whether to exit.

**Key takeaway:** Default to `condition_variable`; reach for `_any` for non-`std::mutex` locks or stop-token integration.

---

#### Q21: C++20 added `std::atomic<T>::wait` and `std::counting_semaphore`. When would you use them instead of a condition variable?
**Difficulty:** #advanced
**Category:** #concurrency #cpp20
**Concepts:** #atomic_wait #semaphore #condition_variable

**Answer:**
`atomic::wait(old)` blocks while one atomic's value equals `old`, ideal when the whole condition is a single flag or counter, with no mutex and no lost-wakeup gap. A semaphore keeps a count, so releases are never lost. Use a CV when the condition spans mutex-protected state such as a queue.

**Explanation:**
- `atomic::wait`:
  - compares and blocks atomically with respect to `notify_one/notify_all` (Linux: futex);
  - returns only when the value differs from `old`, so spurious wakeups are absorbed;
  - can be notified without any lock.
- `std::counting_semaphore` / `std::binary_semaphore`:
  - `release()` before `acquire()` is remembered as a count;
  - good for "N slots available" or one-shot signals.
- CV:
  - required when the predicate involves several variables or a container that needs a mutex anyway.
- ❌ Common wrong answer: "`atomic::wait` is a spin loop." It is a blocking wait (implementations may spin briefly first).
- ✅ What a strong answer adds: `atomic::wait` is not guaranteed to notice an A→B→A change (ABA): if the value returns to `old` before the waiter looks, it keeps waiting.

**Key takeaway:** Single atomic value: `atomic::wait`. Counted permits: semaphore. Compound state under a mutex: CV.

---

#### Q22: How is `std::condition_variable` typically implemented on Linux, and what does that explain about its behaviour?
**Difficulty:** #advanced
**Category:** #concurrency #internals
**Concepts:** #futex #glibc #spurious_wakeup

**Answer:**
On glibc it wraps `pthread_cond_t`: userspace sequence counters plus futex syscalls. Conceptually, `wait` takes a ticket, unlocks the mutex and calls `futex_wait`; `notify` updates a counter and calls `futex_wake`. That explains dropped notifications, spurious wakeups and no mutex handoff.

**Explanation:**
- Why the release is atomic in practice: the waiter registers (takes its ticket) while still holding the mutex, and `futex_wait(addr, expected)` only sleeps if the futex word still holds the expected value; a notify that slipped in after the unlock changes the word, so the waiter returns instead of sleeping.
- Why notifications are not remembered: with no waiters, `notify` has nobody to wake (glibc even skips the syscall).
- Why spurious wakeups exist: futex waits can return early (signals, counter races), and the algorithm accepts that rather than paying for exact accounting.
- Why no handoff: the woken thread calls the normal mutex lock path afterwards; it can lose to a barging thread.
- ❌ Common wrong answer: "`cv.wait` is a kernel function." It is library code that enters the kernel only when it actually has to block or wake.
- ✅ What a strong answer adds: label this as "typical glibc/Linux behaviour", separate from what the C++ standard guarantees.

**Key takeaway:** Standard semantics first; futex-based implementation details second, clearly labelled.

---

#### Q23: Can you destroy a condition variable while threads are waiting on it, and how does that affect where you notify?
**Difficulty:** #advanced
**Category:** #concurrency #object_lifetime
**Concepts:** #destructor #notify_placement #use_after_free

**Answer:**
Destroying it while a thread is still blocked on it is undefined behaviour. It may be destroyed once every waiter has been notified, even if they have not yet reacquired the mutex. If a waiter may destroy the CV right after seeing the state change, notify while still holding the mutex.

**Explanation:**
- Dangerous pattern: a one-shot "completion" object on the waiter's stack or heap:

```cpp
// signaller
{ std::lock_guard<std::mutex> lk(c->m); c->done = true; }
c->cv.notify_one();   // ❌ waiter may already have returned and freed c
```

- The waiter can observe `done == true` after a spurious wakeup (or before ever blocking) and free `c` before `notify_one` runs.
- Fixes:
  - notify inside the locked scope (the waiter cannot return from `wait` until the signaller unlocks);
  - or share ownership (`std::shared_ptr`) so the object outlives both sides;
  - or use `std::promise`/`std::future` for one-shot completion.
- ❌ Common wrong answer: "Always notify after unlocking, it is the best practice." It is a performance default, not a rule.
- ✅ What a strong answer adds: the same hazard exists for the mutex inside the object; the safest one-shot primitives are designed so the signaller touches nothing after publishing.

**Key takeaway:** Lifetime can override the "notify after unlock" performance habit.
