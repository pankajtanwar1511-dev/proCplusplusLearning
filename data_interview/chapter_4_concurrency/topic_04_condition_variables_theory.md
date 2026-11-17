## TOPIC: Condition Variables and Producer-Consumer Signalling

### THEORY_SECTION: Core Concepts

#### 1. Mental model
- A condition variable (CV) is a **doorbell**, not a mailbox.
  - It lets a thread sleep until someone says "something may have changed, go and look".
  - It does **not** store the condition, and it does **not** remember rings that nobody heard.
- Three separate pieces, three separate jobs:

| Piece | Example | Job |
|---|---|---|
| Shared state (the predicate) | `ready`, `!queue.empty()`, `stopping` | The actual condition. The only thing that is "remembered". |
| Mutex | `std::mutex m` | Protects the shared state and orders reads/writes of it (happens-before). |
| Condition variable | `std::condition_variable cv` | Lets a thread block efficiently and be woken when the state may have changed. |

- One sentence to keep: **wait for the state, not for the notification.**
- Why not just poll?
  - `while (queue.empty()) {}` without a lock burns a full core and is a data race on `queue`.
  - The same loop while **holding** the mutex is worse: the producer can never get the mutex to push, so it never ends.
  - A CV blocks the thread, so the scheduler runs other work, and wakes it when a producer signals.

#### 2. The canonical pattern
- Producer:
  - lock the mutex
  - modify the shared state
  - unlock
  - notify (`notify_one` or `notify_all`)
- Consumer:
  - lock with `std::unique_lock`
  - `cv.wait(lock, predicate)`
  - on return: the mutex is held **and** the predicate is true
  - take what you need from the shared state, unlock, then do the slow work outside the lock

```cpp
// producer
{
    std::lock_guard<std::mutex> lk(m);
    q.push(item);
}
cv.notify_one();

// consumer
std::unique_lock<std::mutex> lk(m);
cv.wait(lk, [&] { return !q.empty(); });
auto item = std::move(q.front());
q.pop();
lk.unlock();
process(item);   // expensive work outside the lock
```

#### 3. What `cv.wait(lock)` does, step by step
- Precondition: the calling thread owns `lock` (calling `wait` with an unlocked lock is undefined behaviour).
- Contract in three lines:

| Phase | Mutex owned by caller? |
|---|---|
| Before calling `wait` | Yes |
| While blocked inside `wait` | No (released so producers can change the state) |
| When `wait` returns (for any reason) | Yes, always reacquired first |

- Inside `wait(lock)`:
  1. **Atomically** release the mutex and register as a waiter on the CV (no gap between the two).
  2. Block.
  3. Unblock because of `notify_one`, `notify_all`, a spurious wakeup, or (timed waits) a timeout.
  4. Reacquire the mutex. This may itself block if another thread holds it.
  5. Return to the caller.
- Only step 1 needs to be atomic for correctness. Step 3 + 4 ("wake then relock") is **not** one atomic operation; another thread can grab the mutex in between.
- `wait` needs a lock it can unlock and relock: that is why it takes `std::unique_lock<std::mutex>&`. `std::lock_guard` has no `unlock()`/`lock()` and does not compile here.
- If reacquiring the mutex fails with an exception, `std::terminate` is called: `wait` never returns without the lock.

#### 4. The predicate overload and why the loop is mandatory
- `cv.wait(lock, pred)` is specified as exactly:

```cpp
while (!pred())
    wait(lock);
```

- Consequences:
  - The predicate is checked **before** blocking: if it is already true, `wait` returns immediately and never sleeps. No notification is needed.
  - The predicate is re-checked after **every** wakeup, always with the mutex held.
- Three reasons a plain `if (!ready) cv.wait(lock);` is wrong:
  - **Spurious wakeup:** the standard permits `wait` to return with no notification at all. The cause (signals, futex races, implementation details) does not matter, only that it is allowed.
  - **Stolen wakeup:** you were notified, but another consumer reacquired the mutex first and consumed the item.
  - **Shared CV:** the notification was about a different condition (for example "space available" instead of "data available").
- The CV never inspects your predicate. It does not know what `ready` or `queue.empty()` means; your lambda does.

#### 5. Lost wakeups: the check-then-sleep gap
- A notification with no current waiter is simply dropped. CVs keep no count (unlike a semaphore).
- The classic broken hand-rolled wait:

```text
Consumer                         Producer
lock(m)
check ready == false
unlock(m)              <- gap
                                 lock(m); ready = true; unlock(m)
                                 notify_one()   (nobody waiting yet: dropped)
go to sleep            <- sleeps forever, although ready == true
```

- How the real `wait` closes the gap:
  - The consumer checks the predicate while holding `m`.
  - `wait` releases `m` and becomes a waiter as one atomic step.
  - The producer must take `m` to change the state, so its change and its notify can only happen **after** the consumer is registered. The notify is guaranteed to find it.
- The protocol only works if **both** sides use the mutex for the state:
  - Plain `bool` written without the mutex: data race, undefined behaviour.
  - `std::atomic<bool>` written without the mutex: no data race, but the lost wakeup is back. The store and the `notify_one` can both land between the consumer's predicate check and its registration as a waiter.
  - Fix: modify the state under the mutex (or at minimum lock and unlock the mutex between the store and the notify).

#### 6. `notify_one` vs `notify_all`, and where to notify
- `notify_one`: unblocks one waiting thread, if any (which one is unspecified).
- `notify_all`: unblocks all current waiters. They then **compete for the mutex one at a time**; each rechecks the predicate.
  - One item + `notify_all` to N consumers: one gets it, the rest wake, find the queue empty, and sleep again. This is the **thundering herd**.
  - Woken threads that are waiting for the mutex are no longer CV waiters. When the mutex is released they proceed **without a second notification**.
- Use `notify_all` when:
  - the state change can satisfy several waiters (shutdown flag, batch of items, "barrier released");
  - different waiters on the same CV wait for **different** predicates (otherwise `notify_one` may wake the wrong kind of waiter and the right one sleeps forever).
- Notify while holding the lock, or after unlocking?
  - **Both are correct.** The state change is what must be under the mutex, not the notify.
  - After unlock is usually more efficient: the woken thread does not immediately block on a mutex the notifier still holds ("hurry up and wait").
  - Notify under the lock when the waiter might destroy the CV as soon as it sees the state (for example a CV inside an object the waiter frees). After unlock, the notifier could touch a destroyed CV.
- A notification does **not**:
  - make the predicate true,
  - run the woken thread immediately,
  - hand it the mutex.

#### 7. Timed waits
- `wait_for(lock, rel)` and `wait_until(lock, abs)` are **blocking** waits with a deadline, not polling loops.
  - They release the mutex, block, and return on notify, spurious wakeup, or timeout, always with the mutex reacquired.
- Return values:

| Call | Returns | Meaning |
|---|---|---|
| `wait_for(lock, d)` | `std::cv_status` | `timeout` if the time elapsed, else `no_timeout`. `no_timeout` does **not** mean the condition is true (spurious wakeups). |
| `wait_for(lock, d, pred)` | `bool` | The final value of `pred()`. `false` means it timed out with the predicate still false. |
| `wait_until(lock, t, pred)` | `bool` | Same, against an absolute time point. |

- The predicate overload of `wait_for` is specified as `wait_until(lock, steady_clock::now() + d, pred)`: one fixed deadline for the whole wait.
- A hand-written loop `while (!ready) cv.wait_for(lock, d);` restarts the timeout on every wakeup, so a stream of unrelated notifications can postpone the "timeout" forever.
- Prefer `steady_clock` deadlines. A `system_clock` deadline moves when the wall clock is adjusted.

#### 8. Shutdown and stop flags
- A worker waiting with `!queue.empty()` as its only predicate cannot be woken for shutdown: there is no state change it accepts.
- Standard worker pool design:

```cpp
cv.wait(lk, [&] { return !q.empty() || stopping; });
if (q.empty() && stopping) return;   // drain first, then exit
```

- Decisions to state explicitly in an interview:
  - **Drain vs abandon:** `if (q.empty() && stopping)` finishes queued work; `if (stopping)` drops it. Pick one on purpose.
  - Set `stopping` **under the mutex**, then `notify_all` (every worker must see it, so `notify_one` is a bug).
  - Reject or ignore new pushes after `stopping` is set.
  - Join the threads after notifying.
- C++20: `std::condition_variable_any::wait(lock, stop_token, pred)` integrates with `std::jthread` cancellation. A stop request wakes the waiter and the wait returns `pred()`.

#### 9. `condition_variable` vs `condition_variable_any` vs alternatives

| Tool | Waits on | Remembers signals? | Notes |
|---|---|---|---|
| `std::condition_variable` | `unique_lock<std::mutex>` only | No | Fastest CV; maps to the native condvar (pthread/futex on Linux). |
| `std::condition_variable_any` | Any BasicLockable (`shared_lock`, custom locks, `scoped_lock`) | No | Usually bigger and slower (holds its own internal mutex). C++20 adds `stop_token` overloads. |
| `std::atomic<T>::wait/notify` (C++20) | Value of one atomic | Value is the state | `wait(old)` blocks while value == old; spurious wakeups are hidden. Good for a single flag or counter. |
| `std::counting_semaphore` (C++20) | Internal counter | Yes (count) | `release()` before `acquire()` is not lost. |
| `std::latch` / `std::barrier` (C++20) | Countdown / phases | Yes | One-shot or cyclic rendezvous. |

- Rules for `std::condition_variable`:
  - All threads concurrently waiting on one CV must use the **same** mutex (otherwise undefined behaviour).
  - Destroying the CV is allowed once every waiter has been **notified**, even if they have not yet reacquired the mutex. Destroying it while a thread is still blocked on it is undefined behaviour.
  - `std::notify_all_at_thread_exit(cv, std::move(lk))` notifies after thread-local destructors run (useful for detached threads).
- Typical implementation (glibc, Linux): a userspace sequence counter plus `futex` wait/wake. Waking does not transfer the mutex; the woken thread competes for it like anyone else.
- Bounded queues (a second CV for "not full", ring buffers) are a design topic of their own; here only the signalling rules matter.

#### 10. Misconceptions to unlearn
- ❌ "`wait` unlocks the mutex when the predicate is false." ✅ `wait(lock)` (no predicate) always releases the mutex while blocked; the predicate only decides whether to call it again.
- ❌ "The CV checks the condition." ✅ The CV knows nothing about your state; your predicate checks it under the mutex.
- ❌ "If I hold the mutex, how can another thread change `ready`?" ✅ You do not hold it while blocked in `wait`; that is the whole point.
- ❌ "A spurious wakeup is a notification that happened by mistake." ✅ It is a return from `wait` with no matching notification; the standard allows it.
- ❌ "The CV remembers a notify that happened before I waited." ✅ It is dropped; only the predicate remembers.
- ❌ "Wake-up plus mutex reacquisition is one atomic step." ✅ Only release-and-register is atomic; reacquisition is a normal lock that can block.
- ❌ "After `notify_all`, the threads stuck on the mutex need another notify." ✅ They are already woken; they just wait for the mutex.
- ❌ "`notify_one` means the predicate is now true / the thread runs now / it gets the mutex." ✅ None of these is guaranteed.
- ❌ "Notifying while holding the lock is a bug." ✅ It is correct, sometimes slower, and sometimes required for lifetime reasons.
- ❌ "`wait_for` is active polling." ✅ It blocks like `wait`, with a deadline.
- ❌ "`cv_status::no_timeout` means my condition is true." ✅ It only means the time did not run out.
- ❌ "Making the flag `std::atomic` lets me skip the mutex." ✅ It removes the data race but reintroduces the lost wakeup.
- ❌ "Waiting for a mutex means spinning and burning CPU." ✅ Implementation-defined; mainstream mutexes block in the kernel after a short (or no) spin.

### EDGE_CASES: Traps and Misconceptions

#### Edge Case 1: The notification happened before anyone waited
- What people assume: the consumer will "receive" the earlier `notify_one`.
- What happens: the notify found no waiter and was dropped. A raw `cv.wait(lock)` blocks forever (or until a spurious wakeup), even though `ready == true`.
- Why the predicate form is safe: it checks `ready` first and never blocks.

```cpp
// producer already ran: ready = true; notify_one();
std::unique_lock<std::mutex> lk(m);
cv.wait(lk);                          // ❌ may block forever
cv.wait(lk, [] { return ready; });    // ✅ returns immediately
```

#### Edge Case 2: An atomic flag set outside the mutex still loses wakeups
- What people assume: "`ready` is `std::atomic<bool>`, so no lock is needed in the producer".
- What happens:
  - Consumer holds `m`, evaluates `ready` (false), and is about to enter `wait`.
  - Producer stores `ready = true` and calls `notify_one()` without touching `m`. No waiter is registered yet, so the notify is dropped.
  - Consumer then releases `m` and blocks. Nobody will notify again: hang.
- Why: the gap-closing guarantee of `wait` only holds if the state changes while the waiter cannot be between "checked" and "registered", and only the mutex enforces that.
- Fix: write the flag under the mutex, or do `{ std::lock_guard lk(m); }` between the store and the notify.

#### Edge Case 3: `notify_one` wakes the wrong kind of waiter
- Setup: one CV shared by threads waiting for **different** predicates (producers waiting for "not full", consumers waiting for "not empty", or threads waiting for "my turn").
- What happens: `notify_one` wakes a thread whose predicate is still false. It goes back to sleep, and the thread that could have progressed is never woken. The system stalls although work is possible.
- Fix: `notify_all`, or one CV per predicate (the usual "not_full" + "not_empty" pair).

#### Edge Case 4: Woken by `notify_all`, then stuck on the mutex
- Setup: three consumers, one item, `notify_all()`. C1 gets the mutex and holds it for 40 seconds.
- What happens: C2 and C3 have already been unblocked from the CV. They are now blocked **on the mutex**, not on the CV.
- When C1 unlocks, one of them acquires the mutex, sees an empty queue, and waits again. No second notification is needed.
- Lesson: keep the critical section short. Pop the item, unlock, then process.

#### Edge Case 5: Notify after unlock, but the CV is already gone
- Setup: a waiter owns an object containing the CV and destroys it as soon as it observes `done == true`.

```cpp
{ std::lock_guard<std::mutex> lk(s->m); s->done = true; }
// waiter may wake (spuriously or otherwise), see done, and delete s here
s->cv.notify_one();   // ❌ use after free
```

- Fix: notify while still holding the mutex, so the waiter cannot return from `wait` before the notify completes, or tie the object lifetime to both sides (for example `shared_ptr`).

#### Edge Case 6: Timeout is not "condition false", and loops restart the timer
- `wait_for` returning `cv_status::timeout` does not prove the condition is false: the state can change between the timeout and the mutex reacquisition. Always re-read the state.
- `while (!ready) if (cv.wait_for(lk, 1s) == std::cv_status::timeout) return false;` restarts the 1 s budget on every wakeup. If unrelated notifications arrive every 200 ms, it never times out.
- Fix: `cv.wait_for(lk, 1s, pred)` or `cv.wait_until(lk, deadline, pred)` with a fixed deadline.

#### Edge Case 7: Undefined behaviour in the API itself
- Calling `wait` when the `unique_lock` does not own the mutex.
- Two threads waiting concurrently on the same `std::condition_variable` with **different** mutexes.
- Destroying a CV while a thread is still blocked on it (not yet notified).
- Passing `std::lock_guard` to `wait`: not UB, simply a compile error.

#### Edge Case 8: Shutdown that drops work or never wakes anyone
- `if (stopping) return;` right after the wait exits even when items are queued. If the pool must finish accepted work, use `if (q.empty() && stopping) return;`.
- Setting `stopping = true` and calling `notify_one()` wakes one worker; the others sleep forever and `join()` hangs. Use `notify_all()`.
- Setting `stopping` without the mutex (plain `bool`) is a data race; as an atomic it reopens Edge Case 2.

### CODE_EXAMPLES: Practical Demonstrations

#### Example 1: One-shot "data ready" signal
- The minimal correct pattern: state under the mutex, notify after unlock, predicate wait.
```cpp
#include <condition_variable>
#include <iostream>
#include <mutex>
#include <string>
#include <thread>

std::mutex m;
std::condition_variable cv;
bool ready = false;
std::string payload;

void producer() {
    {
        std::lock_guard<std::mutex> lk(m);
        payload = "market snapshot";
        ready = true;                 // state change under the mutex
    }
    cv.notify_one();                  // notify after unlock
}

void consumer() {
    std::unique_lock<std::mutex> lk(m);
    cv.wait(lk, [] { return ready; }); // safe if producer already finished
    std::cout << "consumer got: " << payload << '\n';
}

int main() {
    std::thread c(consumer);
    std::thread p(producer);
    p.join();
    c.join();
}
```
- Output: `consumer got: market snapshot`, regardless of which thread runs first.
- The mutex unlock in `producer` synchronizes-with the lock in `consumer`, so `payload` is visible without being atomic.

#### Example 2: Worker pool with graceful (draining) shutdown
- Multiple consumers, `notify_one` per item, `notify_all` for shutdown, work processed outside the lock.
```cpp
#include <condition_variable>
#include <iostream>
#include <mutex>
#include <queue>
#include <thread>
#include <vector>

class WorkQueue {
public:
    void push(int v) {
        {
            std::lock_guard<std::mutex> lk(m_);
            if (stopping_) return;           // reject new work after shutdown
            q_.push(v);
        }
        cv_.notify_one();                    // one item -> one waiter
    }

    // Returns false when the queue is drained and shutdown was requested.
    bool pop(int& out) {
        std::unique_lock<std::mutex> lk(m_);
        cv_.wait(lk, [&] { return !q_.empty() || stopping_; });
        if (q_.empty()) return false;        // implies stopping_
        out = q_.front();
        q_.pop();
        return true;
    }

    void shutdown() {
        {
            std::lock_guard<std::mutex> lk(m_);
            stopping_ = true;
        }
        cv_.notify_all();                    // every worker must observe it
    }

private:
    std::mutex m_;
    std::condition_variable cv_;
    std::queue<int> q_;
    bool stopping_ = false;
};

int main() {
    WorkQueue wq;
    std::mutex sum_m;
    long sum = 0;
    int processed = 0;

    std::vector<std::thread> workers;
    for (int i = 0; i < 4; ++i) {
        workers.emplace_back([&] {
            int v;
            while (wq.pop(v)) {               // lock released inside pop
                long r = static_cast<long>(v) * v;   // "expensive" work, no lock
                std::lock_guard<std::mutex> lk(sum_m);
                sum += r;
                ++processed;
            }
        });
    }

    for (int i = 1; i <= 1000; ++i) wq.push(i);
    wq.shutdown();
    for (auto& t : workers) t.join();

    std::cout << "processed=" << processed << " sum=" << sum << '\n';
}
```
- Output: `processed=1000 sum=333833500` on every run: shutdown drains the queue before workers exit.
- Swap the exit test for `if (stopping_) return false;` and the count becomes nondeterministic.

#### Example 3: Timed wait with a predicate
- `wait_for` with a predicate returns the predicate's value, so timeout handling is one `if`.
```cpp
#include <chrono>
#include <condition_variable>
#include <iostream>
#include <mutex>
#include <thread>

using namespace std::chrono_literals;

std::mutex m;
std::condition_variable cv;
bool ready = false;

int main() {
    {
        std::unique_lock<std::mutex> lk(m);
        bool ok = cv.wait_for(lk, 50ms, [] { return ready; });
        std::cout << "first wait: " << (ok ? "ready" : "timed out") << '\n';
    }

    std::thread producer([] {
        std::this_thread::sleep_for(20ms);
        {
            std::lock_guard<std::mutex> lk(m);
            ready = true;
        }
        cv.notify_one();
    });

    {
        std::unique_lock<std::mutex> lk(m);
        bool ok = cv.wait_for(lk, 5s, [] { return ready; });
        std::cout << "second wait: " << (ok ? "ready" : "timed out") << '\n';
    }
    producer.join();
}
```
- Output:
```
first wait: timed out
second wait: ready
```
- The second wait returns after about 20 ms, not 5 s: the deadline is only an upper bound.

#### Example 4: Strict alternation (ping-pong) with a turn variable
- A classic interview exercise. The predicate is "is it my turn?", which is real shared state.
```cpp
#include <condition_variable>
#include <iostream>
#include <mutex>
#include <thread>

std::mutex m;
std::condition_variable cv;
int turn = 0;   // 0: ping's turn, 1: pong's turn

void player(int me, const char* word, int rounds) {
    for (int i = 0; i < rounds; ++i) {
        std::unique_lock<std::mutex> lk(m);
        cv.wait(lk, [&] { return turn == me; });
        std::cout << word << (me == 1 ? "\n" : " ");
        turn = 1 - me;
        lk.unlock();
        cv.notify_one();   // only one other thread exists, so notify_one is enough
    }
}

int main() {
    std::thread a(player, 0, "ping", 3);
    std::thread b(player, 1, "pong", 3);
    a.join();
    b.join();
}
```
- Output:
```
ping pong
ping pong
ping pong
```
- With three or more players on one CV, `notify_one` can wake the wrong player (Edge Case 3): use `notify_all` there.

#### Example 5: `condition_variable_any` with `std::jthread` stop tokens (C++20)
- The stop request is a wake-up source; no hand-written `stopping` flag needed.
```cpp
#include <chrono>
#include <condition_variable>
#include <iostream>
#include <mutex>
#include <queue>
#include <stop_token>
#include <thread>

using namespace std::chrono_literals;

std::mutex m;
std::condition_variable_any cv;
std::queue<int> q;

int main() {
    int handled = 0;
    std::jthread worker([&](std::stop_token st) {
        std::unique_lock<std::mutex> lk(m);
        while (true) {
            // returns pred(); wakes on notify OR on a stop request
            if (!cv.wait(lk, st, [&] { return !q.empty(); }))
                break;                         // stop requested, queue empty
            q.pop();
            ++handled;
        }
    });

    for (int i = 0; i < 3; ++i) {
        { std::lock_guard<std::mutex> lk(m); q.push(i); }
        cv.notify_one();
    }
    // wait until the worker emptied the queue, then stop it
    while (true) {
        std::this_thread::sleep_for(1ms);
        std::lock_guard<std::mutex> lk(m);
        if (q.empty()) break;
    }
    worker.request_stop();
    worker.join();
    std::cout << "handled=" << handled << '\n';
}
```
- Output: `handled=3`.
- `jthread`'s destructor would also call `request_stop()` and `join()`; explicit calls are shown for clarity.

#### Example 6: C++20 `std::atomic::wait` for a single flag
- When the "state" is one atomic value, no mutex or CV is needed, and there is no lost-wakeup gap.
```cpp
#include <atomic>
#include <iostream>
#include <thread>

std::atomic<int> stage{0};
int data = 0;

int main() {
    std::thread consumer([] {
        stage.wait(0, std::memory_order_acquire);   // blocks while stage == 0
        std::cout << "data=" << data << '\n';
    });

    data = 42;
    stage.store(1, std::memory_order_release);
    stage.notify_one();
    consumer.join();
}
```
- Output: `data=42`.
- `wait(old)` compares and blocks atomically with respect to `notify`, and returns only once the value differs from `old` (spurious wakeups are absorbed inside).

### QUICK_REFERENCE: Cheat Sheet

#### Wait API at a glance
| Call | Blocks? | Returns | Mutex on return |
|---|---|---|---|
| `wait(lk)` | Yes | `void`, any reason (notify / spurious) | Held |
| `wait(lk, pred)` | Only while `!pred()` | `void`, `pred()` is true | Held |
| `wait_for(lk, d)` | Yes, max `d` | `cv_status` | Held |
| `wait_for(lk, d, pred)` | While `!pred()`, max `d` total | `bool` = `pred()` | Held |
| `wait_until(lk, t, pred)` | Same, absolute deadline | `bool` = `pred()` | Held |
| `cv_any.wait(lk, stoken, pred)` (C++20) | Until `pred()` or stop request | `bool` = `pred()` | Held |

#### Why `wait` can return
| Reason | Predicate guaranteed true? |
|---|---|
| `notify_one` / `notify_all` | No (another thread may have consumed it, or it was for another predicate) |
| Spurious wakeup | No |
| Timeout | No (and not guaranteed false either) |
| Stop request (`condition_variable_any` + `stop_token`) | No |

#### Notification rules
| Situation | Use |
|---|---|
| One item added, waiters are interchangeable | `notify_one` |
| Shutdown / broadcast / batch / several items | `notify_all` |
| Waiters on one CV wait for different predicates | `notify_all` or separate CVs |
| Waiter may destroy the CV right after waking | Notify while holding the mutex |
| Otherwise | Unlock, then notify (fewer wasted wakeups) |

#### Interview one-liners
| Question | One-liner |
|---|---|
| What is a CV? | A way to block until shared state may have changed; the predicate is the state, the CV is only the doorbell. |
| Why a mutex? | It protects the predicate and lets `wait` release-and-register atomically, closing the lost-wakeup gap. |
| Why `unique_lock`? | `wait` must unlock while blocked and relock before returning; `lock_guard` cannot. |
| Why a loop / predicate? | Spurious wakeups, stolen wakeups, and notifications meant for other predicates. |
| Lost wakeup? | A notify that happens between "checked the state" and "started waiting"; it is dropped because CVs keep no memory. |
| Notify under lock? | Correct either way; after unlock is usually cheaper. |
| `notify_all` cost? | Thundering herd: all wake, serialize on the mutex, most go back to sleep. |
| `wait_for`? | Blocking wait with a deadline; use the predicate overload; timeout is not "condition false". |
| Shutdown? | Predicate `!q.empty() || stopping`, set `stopping` under the lock, `notify_all`, drain or abandon on purpose. |
| Atomic flag without lock? | No data race, but lost wakeup returns; lock the mutex between the store and the notify. |
| CV vs semaphore? | A semaphore remembers releases as a count; a CV forgets notifications. |
