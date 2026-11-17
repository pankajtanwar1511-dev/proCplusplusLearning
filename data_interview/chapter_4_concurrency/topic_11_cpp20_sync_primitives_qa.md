## TOPIC: C++20 Synchronization: latch, barrier, semaphore, jthread

### INTERVIEW_QA: Interview Questions with Detailed Answers

#### Q1: What is std::latch and when would you use it?
**Difficulty:** #beginner
**Category:** #concurrency #cpp20
**Concepts:** #latch #countdown #fan_in

**Answer:**
A C++20 one-shot countdown gate: initialised with N, threads call `count_down()`, and every thread blocked in `wait()` is released when the count reaches zero. Use it for "wait until N things have happened", such as startup or fan-in of worker results.

**Explanation:**
- API: `count_down(n = 1)`, `wait()`, `try_wait()`, `arrive_and_wait(n = 1)`.
- Classic uses:
  - Main waits until N workers finished initialisation.
  - Start gate: `std::latch start{1}`; all workers `wait()`, main `count_down()` once so they begin simultaneously (useful in benchmarks and tests).
- The waiting thread does not have to be one of the counters: workers count down, only main waits.
- It replaces "mutex + CV + int counter + predicate" with one object that carries the state itself.
- ❌ Common wrong answer: "It is like a mutex that N threads must release." There is no ownership or mutual exclusion; it is a counter with a blocking wait.
- ✅ What a strong answer adds: it is single-use, counting below zero is undefined behaviour, and it provides memory synchronization: results written before `count_down()` are visible after `wait()`.

**Key takeaway:** Latch = one-shot "N events happened" gate; anyone can count down, anyone can wait.

---

#### Q2: What is the difference between std::latch and std::barrier?
**Difficulty:** #beginner
**Category:** #concurrency #cpp20
**Concepts:** #latch #barrier #phases

**Answer:**
A latch counts down once and stays open forever; any thread may count or wait. A barrier is reusable: a fixed set of N participants arrive each phase, an optional completion function runs once per phase, then all are released and the count resets for the next phase.

**Explanation:**
- Latch: single phase, decrement amounts may vary (`count_down(n)`), counting and waiting can be done by different threads.
- Barrier: repeated phases, each participant arrives once per phase, the expected count is the same every phase (adjustable only via `arrive_and_drop()`).
- Barrier completion step: runs once per phase, on one of the participants, before anyone is released. Perfect for "combine partial results, then start the next iteration".
- ❌ Common wrong answer: "A barrier is just a latch you can reset." Resetting a latch is not possible, and a barrier also adds the completion step and phase semantics.
- Use a latch for startup and shutdown sync; use a barrier for iterative algorithms (simulation steps, parallel stencil, multi-stage pipelines in lock-step).

**Key takeaway:** Latch: one shot, any thread. Barrier: repeating phases, same participants, completion step.

---

#### Q3: What does std::jthread give you over std::thread?
**Difficulty:** #beginner
**Category:** #concurrency #cpp20
**Concepts:** #jthread #raii #stop_token

**Answer:**
Automatic cleanup and cooperative cancellation. Its destructor calls `request_stop()` and then `join()`, whereas a joinable `std::thread` destructor calls `std::terminate`. It also owns a stop source and passes a `std::stop_token` to the callable if its first parameter accepts one.

**Explanation:**
- `std::thread` must be joined or detached on every path, including exceptions; forgetting crashes the program via `terminate`.
- `std::jthread` makes that RAII. Move assignment also stops and joins the old thread first.
- Stop API: `request_stop()`, `get_stop_token()`, `get_stop_source()`. `request_stop()` returns `true` only for the call that made the request.
- ❌ Common wrong answer: "`jthread` kills or interrupts the thread on destruction." Cancellation is cooperative: the worker must check `stop_requested()` or use stop-aware waits. A worker that ignores the token makes the destructor block forever.
- ❌ Common wrong answer: "`jthread` detaches in its destructor." It joins.
- ✅ What a strong answer adds: as a class member it must be declared **last**, so it is stopped and joined before the members its thread uses are destroyed.

**Key takeaway:** `jthread` = thread + RAII join + cooperative stop; it never forcibly interrupts.

---

#### Q4: Can main read a plain results array after `latch.wait()` without a mutex?
**Difficulty:** #intermediate
**Category:** #concurrency #memory_model
**Concepts:** #happens_before #latch #memory_visibility

- Workers write results into a plain array, then call `latch.count_down()`.

**Answer:**
Yes. Each `count_down()` strongly happens before the return of the `wait()` it unblocks, so every write sequenced before a worker's `count_down()` is visible to the main thread after `wait()` returns, provided workers do not touch the data afterwards.

**Explanation:**
- Chain: `results[i] = x` is sequenced-before `count_down()` → strongly happens before → `wait()` returns → main reads `results[i]`.
- Same idea as a release store and an acquire load, but packaged in the primitive.
- The same holds for `std::barrier` (arrivals → completion → released waiters) and semaphores (`release` → `acquire` that observes it).
- ❌ Common wrong answer: "A latch only coordinates timing; you still need a mutex or atomics for the data." Not needed for data written before the count-down.
- ❌ Common wrong answer: "The latch counter is just an int that threads decrement." It is an atomic counter with a blocking wait; concurrent `count_down` calls are safe.
- Caveat: writes made **after** `count_down()` are not covered, and if two workers write the same element there is still a race between them.

**Key takeaway:** Count-down publishes; wait acquires. No extra lock for results written before counting down.

---

#### Q5: When and on which thread does a std::barrier's completion function run, and what are the requirements on it?
**Difficulty:** #intermediate
**Category:** #concurrency #cpp20
**Concepts:** #barrier #completion_function #noexcept

**Answer:**
Once per phase, after the last expected arrival and before any waiting thread is released, on one of the threads that arrived in that phase (unspecified which). It must be invocable without throwing (`is_nothrow_invocable`), so mark it `noexcept`.

**Explanation:**
- Order per phase: all N arrivals → completion function → all waiters of that phase released → counter reset.
- It sees every write made by participants before they arrived, and participants see its writes after `arrive_and_wait()` returns. So it can reduce partial results without locks.
- libstdc++ runs it on the thread whose arrival completed the phase; do not depend on that.
- ❌ Common wrong answer: "It runs on a separate helper thread" or "it runs on every thread". One call, on a participant.
- Calling `arrive*` on the same barrier from inside the completion function is undefined behaviour.
- GCC 11's libstdc++ accepts a non-`noexcept` lambda silently; other implementations may reject it. Either way, an escaping exception is a bug.
```cpp
std::barrier sync{kThreads, [&]() noexcept {
    total += std::accumulate(partial.begin(), partial.end(), 0L);   // single-threaded here
}};
```

**Key takeaway:** The completion step is a single-threaded, non-throwing reduction point between phases.

---

#### Q6: One of the barrier's participants finishes early and returns. What happens, and how do you handle it?
**Difficulty:** #intermediate
**Category:** #concurrency #cpp20
**Concepts:** #barrier #arrive_and_drop #deadlock

**Answer:**
The next phase can never collect N arrivals, so the remaining threads block forever. The leaving thread must call `arrive_and_drop()`, which arrives for the current phase and lowers the expected count for every later phase.

**Explanation:**
- The barrier knows nothing about thread lifetimes; it only counts arrivals.
- `arrive_and_drop()` is the "I am leaving the group" operation.
- Other count bugs with the same symptom: constructing the barrier with N but starting N - 1 threads; a thread arriving twice in one phase (steals another thread's arrival, the next phase is short one).
- ❌ Common wrong answer: "The barrier detects that the thread ended." It does not; the result is a silent hang.
- ✅ What a strong answer adds: for split-phase work, `auto tok = b.arrive(); do_independent_work(); b.wait(std::move(tok));` overlaps useful work with waiting for stragglers.

**Key takeaway:** Every phase needs exactly the expected number of arrivals; leaving threads must `arrive_and_drop()`.

---

#### Q7: How does std::counting_semaphore differ from std::mutex? Could binary_semaphore replace a mutex?
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

**Key takeaway:** Semaphore = permits without ownership (signalling, throttling); mutex = ownership (exclusion).

---

#### Q8: Why can a semaphore be simpler than a condition variable for signalling between threads?
**Difficulty:** #intermediate
**Category:** #concurrency #cpp20
**Concepts:** #semaphore #condition_variable #lost_wakeup

**Answer:**
A semaphore stores the signal in its count, so a `release()` that happens before anyone waits is not lost. A condition variable stores nothing: you need a separate predicate guarded by a mutex, and must check it in a loop, or a notification can be missed.

**Explanation:**
- CV recipe: mutex + predicate state + `wait(lock, pred)` + modify state under lock + notify. Forget any part and you get lost wake-ups or spurious-wakeup bugs.
- Semaphore recipe: producer `release()`, consumer `acquire()`. Order of the two calls does not matter.
- Latch is similar for the one-shot case: the counter is the remembered state.
- ❌ Common wrong answer: "A CV remembers that it was notified." It does not; notifying with nobody waiting does nothing.
- CVs are still the general tool when the condition is an arbitrary predicate over shared state (queue not empty AND not paused AND ...).

**Key takeaway:** Semaphores and latches carry their own state; CVs need you to manage the state.

---

#### Q9: What do std::atomic<T>::wait and notify_one do, and how are they better than a spin loop or a condition variable?
**Difficulty:** #intermediate
**Category:** #concurrency #atomics
**Concepts:** #atomic_wait #futex #busy_waiting

**Answer:**
`a.wait(old)` blocks while the atomic's value equals `old` and returns only after it sees a different value; `notify_one/all` wake waiters. It sleeps instead of burning a core like a spin loop, and needs no mutex or separate predicate like a CV.

**Explanation:**
- Protocol: writer stores the new value, then calls `notify_one()` / `notify_all()`. Reader calls `wait(expected_old)`.
- Internally a loop: load, compare, sleep (futex on Linux for 4-byte integers, a hashed waiter table otherwise), re-check. Spurious wake-ups are absorbed internally.
- No lost wake-up: the value comparison happens before sleeping, atomically with respect to the futex.
- Memory ordering: give `wait` an acquire order and the store a release order to publish data, exactly as with a flag.
- Typical pattern in low-latency code: spin a bounded number of iterations, then fall back to `wait()`.
- ❌ Common wrong answer: "`wait()` returns as soon as someone calls notify." It returns only when the value differs from `old`.
- ❌ Common wrong answer: "It is the same as polling with sleep." It wakes on the change, not after a fixed delay.
- libstdc++ builds `std::latch`, `std::barrier` and semaphores on this facility.

**Key takeaway:** `atomic::wait` = "sleep until this value changes", the C++ face of a futex.

---

#### Q10: What goes wrong with this `atomic::wait` handoff, and can `wait` miss a change entirely?
**Difficulty:** #advanced
**Category:** #concurrency #atomics
**Concepts:** #atomic_wait #aba #notify_order

```cpp
// Producer
flag.notify_one();
flag.store(true);

// Consumer
flag.wait(false);
```

**Answer:**
The consumer can sleep forever: it is woken, re-reads `false`, sleeps again, and the later store has no notify. Change the value first, then notify. And yes, if the value changes from `old` and back to `old` before the waiter re-checks, it keeps sleeping (ABA).

**Explanation:**
- `notify` wakes only threads already asleep; it does not mark anything. The store afterwards changes the value but nobody wakes the waiter to re-compare.
- Correct: `flag.store(true, release); flag.notify_one();`.
- ABA: `wait(0)` while another thread does `store(1); notify; store(0); notify;` quickly. The waiter may only ever observe 0 and keep sleeping.
- Fix for ABA: a monotonically increasing generation counter; wait on the last seen generation.
- ❌ Common wrong answer: "Notify and store order does not matter because both are atomic." Atomicity of each operation says nothing about the waiter's check-then-sleep cycle.
- The comparison is bitwise on the value representation; for types with padding prefer integers or enums.
```cpp
std::atomic<unsigned> gen{0};
// producer: publish data, then
gen.fetch_add(1, std::memory_order_release);
gen.notify_all();
// consumer
unsigned seen = gen.load(std::memory_order_acquire);
gen.wait(seen, std::memory_order_acquire);   // returns after any increment
```

**Key takeaway:** Store then notify, and wait on a generation counter when every event matters.

---

#### Q11: A jthread's worker is blocked in a condition-variable wait. How do you make request_stop() wake it?
**Difficulty:** #advanced
**Category:** #concurrency #cpp20
**Concepts:** #condition_variable_any #stop_token #cancellation

**Answer:**
Use `std::condition_variable_any` and its overload `wait(lock, stop_token, pred)`, which wakes on stop and returns `pred()`. Plain `std::condition_variable` has no stop-token support, so the worker would sleep and the jthread destructor's `join()` would hang.

**Explanation:**
- `cv_any.wait(lk, st, pred)` returns when `pred()` is true or stop is requested; the return value is `pred()` so you can tell which.
- Internally it registers a stop callback that notifies the CV.
- Alternatives when you must keep `std::condition_variable` (it can be faster than `_any`):
  - Add `|| st.stop_requested()` to the predicate **and** register a `std::stop_callback` that locks the mutex and calls `notify_all()`.
- Blocking system calls (socket `recv`, `read`) do not know about stop tokens either: use a `stop_callback` to close or shut down the fd, or use timeouts or non-blocking I/O.
- ❌ Common wrong answer: "Just check `stop_requested()` in the loop." A thread that is asleep never reaches the check.
```cpp
std::jthread worker([&](std::stop_token st) {
    std::unique_lock lk(m);
    while (cv_any.wait(lk, st, [&] { return !jobs.empty(); })) {
        auto job = std::move(jobs.front());
        jobs.pop_front();
        lk.unlock();
        job();
        lk.lock();
    }
    // stop requested (and queue empty)
});
```

**Key takeaway:** Cancellation needs a wake-up path: stop-aware waits or a stop_callback that unblocks the thread.

---

#### Q12: In which thread does a std::stop_callback run, and what happens if stop was already requested when it is constructed?
**Difficulty:** #advanced
**Category:** #concurrency #cpp20
**Concepts:** #stop_callback #stop_source #cancellation

**Answer:**
It runs synchronously in the thread that calls `request_stop()`, before that call returns. If stop was already requested when the callback is constructed, it runs immediately in the constructing thread, inside the constructor.

**Explanation:**
- Only the first successful `request_stop()` invokes callbacks; later calls return `false` and do nothing.
- The callback's destructor deregisters it; if the callback is executing on another thread at that moment, the destructor waits for it to finish (so captured references stay valid).
- Consequences:
  - Keep callbacks short and non-blocking: they run inside someone else's `request_stop()`, e.g. inside a `jthread` destructor.
  - They must be thread-safe with respect to the worker, because they usually run on a different thread.
  - Order between multiple callbacks is unspecified.
- Typical use: wake something the token cannot reach (notify a custom CV, close a socket, cancel an async operation).
- ❌ Common wrong answer: "The callback runs later in the worker thread" or "it is never called if stop was requested before registration".

**Key takeaway:** stop_callback runs in the requester's thread, or immediately if stop already happened.
