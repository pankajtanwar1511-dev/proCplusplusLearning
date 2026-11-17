## TOPIC: C++20 Synchronization: latch, barrier, semaphore, jthread

### THEORY_SECTION: Core Concepts

#### 1. Mental model: each primitive owns its own state
- Before C++20, most coordination was "mutex + condition variable + a counter or flag you manage yourself". C++20 adds primitives that **carry the state themselves**, so the predicate cannot be forgotten or modified without the lock.

| Primitive | Header | State it holds | Reusable? | Typical use |
|---|---|---|---|---|
| `std::latch` | `<latch>` | countdown to 0 | No (one-shot) | "wait until N things happened": startup, fan-in |
| `std::barrier<F>` | `<barrier>` | per-phase arrival count + completion step | Yes (phases) | iterative parallel algorithms, simulation steps |
| `std::counting_semaphore<N>` | `<semaphore>` | non-negative counter | Yes | limit concurrency (N permits), count of items |
| `std::binary_semaphore` | `<semaphore>` | counter 0 or 1 | Yes | one-shot or ping-pong signalling between threads |
| `std::atomic<T>::wait/notify` | `<atomic>` | the atomic's own value | Yes | block until a value changes, without a CV |
| `std::jthread` + `std::stop_token` | `<thread>`, `<stop_token>` | thread handle + shared stop state | n/a | RAII thread that joins and supports cooperative cancellation |

- All of them provide **memory synchronization**, not just scheduling: writes made before the signalling operation are visible after the corresponding wait returns.
- Implementations typically use atomics plus a futex-style wait (Linux), so waiting threads sleep instead of spinning forever (an implementation may spin briefly first).

#### 2. std::latch: one-shot countdown gate
- `std::latch l{N};` counter starts at N (`N >= 0`, at most `latch::max()`).
- Operations:
  - `count_down(n = 1)`: atomically subtract n; when it reaches 0, all waiters are released. Does not block.
  - `wait()`: block until the counter is 0 (returns immediately if already 0).
  - `try_wait()`: non-blocking check; the standard allows it to return `false` spuriously ("with very low probability") even if the counter is 0.
  - `arrive_and_wait(n = 1)`: `count_down(n)` then `wait()`.
- One-shot: there is no `reset()`. Once at 0 it stays open forever; every later `wait()` returns immediately.
- Decrementing below zero (`n > counter`) is a precondition violation: undefined behaviour, not an exception.
- The waiter does not have to be a counter: workers can `count_down()` while only the main thread `wait()`s.
- Synchronization: every `count_down` **strongly happens before** the return of each `wait` it unblocks, so results written by workers before `count_down()` can be read after `wait()` without another mutex.
- Not copyable or movable; must outlive every thread that uses it.

#### 3. std::barrier: reusable phases with a completion step
- `std::barrier b{N, completion};` N participating threads per phase.
- A phase ends when N arrivals have been counted. Then the **phase completion step** runs:
  1. `completion()` is invoked once, on one of the threads that arrived in that phase (unspecified which; libstdc++ uses the thread whose arrival completed the phase).
  2. All threads blocked in that phase are released, and the counter resets for the next phase.
- Operations:
  - `arrive_and_wait()`: arrive and block until the phase completes (the common case).
  - `arrive(n = 1)`: arrive without blocking, returns an `arrival_token` (`[[nodiscard]]`); later `wait(std::move(token))`. Lets a thread do independent work between arriving and waiting (split-phase).
  - `arrive_and_drop()`: arrive for this phase and permanently reduce the expected count for later phases. Use it when a participant leaves early.
- Completion function requirements:
  - `std::is_nothrow_invocable_v<F&>` must be true: mark the lambda `noexcept`. GCC 11's libstdc++ does not diagnose a missing `noexcept`, other implementations may reject it.
  - Calling member functions of the same barrier (other than `wait`) while the completion step runs is undefined behaviour.
- Synchronization: all arrivals of a phase happen before the completion step, which happens before every waiter of that phase returns. The completion function can therefore safely combine per-thread partial results.
- Latch vs barrier: latch = one countdown, any thread may count or wait; barrier = repeated phases, the same N participants arrive each phase.

#### 4. Semaphores: counting permits, no ownership
- `std::counting_semaphore<LeastMax> s{initial};` holds a counter in `[0, max()]`. `LeastMax` is a lower bound for `max()`; the implementation may support more.
- `std::binary_semaphore` is `std::counting_semaphore<1>`.
- Operations:
  - `acquire()`: block until counter > 0, then decrement.
  - `try_acquire()`, `try_acquire_for(d)`, `try_acquire_until(t)`: non-blocking or timed (may fail spuriously under contention; do not treat a failure as an exact "zero" query).
  - `release(n = 1)`: add n and wake waiters. Releasing past `max()` is undefined behaviour.
- Constructor is `explicit` and takes the initial count; there is no default constructor. Choose the initial count deliberately: `0` = "signal not yet given", `N` = "N permits available".
- Semaphore vs mutex:
  - No ownership: any thread may `release`, even one that never acquired. Ideal for signalling, wrong as a mutex replacement where ownership matters.
  - No `lock()`/`unlock()` members, so `std::lock_guard<std::binary_semaphore>` does not compile.
  - No recursive locking, no deadlock detection, no priority inheritance.
- Semaphore vs condition variable:
  - A semaphore **remembers** releases in its count; a release before anyone waits is not lost.
  - A CV remembers nothing; the predicate state lives elsewhere and must be guarded by the mutex.
- Synchronization: a `release` strongly happens before an `acquire` that observes its effect, so data written before `release` is visible after `acquire`.

#### 5. std::atomic::wait / notify_one / notify_all
- `a.wait(old, order = seq_cst)`: block **while** `a`'s value equals `old`. Internally a loop: load, compare, sleep, re-check. It returns only after it has observed a value different from `old` (spurious unblocks are absorbed internally).
- `a.notify_one()` / `a.notify_all()`: wake waiters on that atomic. No mutex required.
- Correct protocol: **change the value, then notify**. Notifying without changing the value wakes the waiter only for it to see the old value and sleep again.
- Lost-wakeup safe: because `wait` compares the value atomically with going to sleep (futex semantics), a store plus notify that happens before the waiter sleeps is seen by the comparison.
- ABA blind spot: if the value changes from `old` and back to `old` before the waiter re-checks, it keeps waiting. Use a monotonically increasing counter (generation), not a toggling flag, when every change matters.
- Comparison is by value representation (like `compare_exchange`), so types with padding bits can behave unexpectedly; prefer integers and enums.
- Also available: `std::atomic_flag::wait/test`, `std::atomic_ref<T>::wait`.
- Use cases: replace "spin forever" with "spin a little, then `wait`"; lightweight one-shot events; implementing latches and semaphores (libstdc++ does exactly this).
- On Linux 4-byte integral atomics map directly to a futex; other sizes go through an internal waiter table keyed by address.

#### 6. std::jthread, stop_token, stop_source, stop_callback
- `std::thread` destructor on a joinable thread calls `std::terminate`. You must `join()` or `detach()` on every path, including exceptions.
- `std::jthread` destructor: if joinable, `request_stop()` then `join()`. RAII for threads.
- Cooperative cancellation:
  - A `std::stop_source` owns the shared stop state; `std::stop_token` is a read-only view (`stop_requested()`, `stop_possible()`).
  - If the callable's first parameter is `std::stop_token`, `jthread` passes its own token automatically.
  - `request_stop()` returns `true` only for the call that actually made the request.
  - Nothing is interrupted: the thread must poll the token or wait in a stop-aware primitive.
- Stop-aware waiting: `std::condition_variable_any::wait(lock, stop_token, pred)` (also `wait_for`/`wait_until`) wakes on stop and returns `pred()`. Plain `std::condition_variable` has no such overload.
- `std::stop_callback cb(token, f);` registers `f` to run when stop is requested:
  - If stop was already requested, `f` runs **immediately, in the constructing thread**.
  - Otherwise `f` runs synchronously **in the thread that calls `request_stop()`**, before `request_stop()` returns.
  - The destructor deregisters; if `f` is running on another thread it waits for it to finish.
  - Typical use: wake something the token cannot reach (close a socket, notify a custom CV, cancel an I/O).
- Joining in a destructor can still hang forever if the thread never checks its token.

#### 7. Choosing the right tool

| Need | Use |
|---|---|
| Main waits until N workers finished init | `std::latch` |
| Start N threads at the same instant | `std::latch start{1}`, workers `wait()`, main `count_down()` |
| N threads iterate in lock-step, combine per step | `std::barrier` with a `noexcept` completion |
| At most K threads may use a resource | `std::counting_semaphore<K>` |
| One-shot "data ready" signal | `std::binary_semaphore{0}`, `std::latch{1}`, or `atomic<bool>::wait` |
| Wait for an arbitrary predicate over shared state | mutex + condition variable (still the general tool) |
| Background thread with clean shutdown | `std::jthread` + `stop_token` (+ `condition_variable_any`) |
| Lowest-latency hand-off on a dedicated core | spin on an atomic (optionally `wait` after N spins) |

#### 8. Misconceptions to unlearn
- ❌ "A latch can be reset for the next round." ✅ It is one-shot; use a new latch per round or a `std::barrier`.
- ❌ "Only threads that count down may wait on a latch." ✅ Any thread may wait; counting and waiting are independent.
- ❌ "A latch or barrier only orders execution, I still need a mutex to read the results." ✅ They provide happens-before for writes made before arriving.
- ❌ "The latch counter is basically an int." ✅ It is an atomic counter with an efficient blocking wait, safe for concurrent `count_down`.
- ❌ "`wait()` on these primitives is a busy loop." ✅ Implementations sleep (futex), possibly after a short spin.
- ❌ "A barrier's completion function runs on a separate thread." ✅ It runs on one of the participating threads, once per phase.
- ❌ "`binary_semaphore` is a lightweight mutex." ✅ It has no owner; use it for signalling, use `std::mutex` for mutual exclusion.
- ❌ "`atomic::wait` returns when notified." ✅ It returns only after it sees a value different from `old`.
- ❌ "`request_stop()` interrupts the thread." ✅ It sets a flag and runs callbacks; the thread must cooperate.
- ❌ "`jthread` makes shutdown safe automatically." ✅ It joins, but member order, blocking calls and ignored tokens can still hang or crash.

### EDGE_CASES: Traps and Misconceptions

#### Edge Case 1: Reusing a latch, or counting it down too far
- Assumption: "After `wait()` returns, the latch is ready for the next round."
- Reality: the counter stays at 0. In round 2, `wait()` returns immediately, before workers finish: the main thread reads results while they are being written (data race).
- The workers' `count_down()` on a latch already at 0 violates the precondition `n <= counter`: undefined behaviour, no exception, no assertion in release builds.
- Fix: construct a new `std::latch` per round, or use `std::barrier` for repeated phases.

#### Edge Case 2: `latch::try_wait()` may return false even when the latch is open
- The standard specifies `try_wait()` returns "with very low probability false, otherwise `counter == 0`".
- So `while (!l.try_wait()) {}` is fine as a spin loop, but `if (!l.try_wait()) error("not done");` can misfire.
- Similar spurious-failure latitude exists for `counting_semaphore::try_acquire`.

#### Edge Case 3: Barrier participant count must match every phase
- `std::barrier b{3}` needs exactly 3 arrivals per phase. If one thread finishes its loop early and simply returns, the next phase can never complete: the remaining threads block forever.
- Fix: the leaving thread calls `arrive_and_drop()`, which counts for the current phase and reduces the expected count for all later phases.
- Similarly, a thread calling `arrive_and_wait()` twice in one phase (or an extra thread joining) breaks the phase accounting.

#### Edge Case 4: Barrier completion function must not throw
- Requirement: `std::is_nothrow_invocable_v<CompletionFunction&>`. Mark it `noexcept`.
- GCC 11's libstdc++ compiles a non-`noexcept` lambda without complaint, which hides the problem until an exception escapes in production.
- Do not call `arrive*` on the same barrier from inside the completion function.
```cpp
std::barrier sync{4, []() noexcept { /* combine partial results, no throwing calls */ }};
```

#### Edge Case 5: A semaphore is not a mutex
- No ownership: a thread that never acquired can `release()`. A bug that releases twice silently grants an extra permit (or, for `binary_semaphore`, exceeds `max()`: undefined behaviour).
- `std::lock_guard<std::binary_semaphore>` does not compile (no `lock`/`unlock` members). Writing your own RAII wrapper is possible but you lose ownership checks, recursion detection and priority inheritance.
- Initial value matters: `std::binary_semaphore ready{1};` used as "data is ready" lets the consumer pass before the producer wrote anything.

#### Edge Case 6: `atomic::wait` needs a value change, and can miss an A to B to A change
- `flag.notify_one()` **before** `flag.store(true)` (or a store without any notify) can leave the waiter asleep forever: it was woken, saw the old value, and went back to sleep; the later store has nobody to wake it.
- If a value goes `0 → 1 → 0` quickly, a waiter calling `wait(0)` may never observe the `1` and keeps sleeping.
- Fix: store first, then notify; use a generation counter that only increases when each event matters.

#### Edge Case 7: `request_stop()` does not wake a thread blocked in std::condition_variable
- `std::condition_variable::wait` knows nothing about stop tokens. A `jthread` whose worker sleeps in `cv.wait(lock, pred)` will not wake on `request_stop()`, so the `jthread` destructor's `join()` blocks forever.
- Fixes:
  - `std::condition_variable_any` with the `wait(lock, token, pred)` overload.
  - Or a `std::stop_callback` that sets a flag under the mutex and calls `cv.notify_all()`.

#### Edge Case 8: `std::jthread` as a class member: declaration order matters
- Members are constructed in declaration order and destroyed in reverse order.
- If the `jthread` is declared **before** the members its thread uses:
  - Construction: the thread starts before those members exist.
  - Destruction: those members are destroyed first, while the thread may still be running; only then does the `jthread` destructor request stop and join. Use-after-destruction.
- Fix: declare the `jthread` **last**, so it starts last and is stopped and joined first.

### CODE_EXAMPLES: Practical Demonstrations

#### Example 1: Latch as a start gate and as a completion gate
- One latch releases all workers at the same instant; a second one lets main wait for all results.
```cpp
#include <array>
#include <iostream>
#include <latch>
#include <thread>
#include <vector>

int main() {
    constexpr int kWorkers = 4;
    std::latch start{1};              // main opens it once everyone is created
    std::latch done{kWorkers};        // each worker counts down once
    std::array<long, kWorkers> partial{};

    std::vector<std::jthread> workers;
    for (int id = 0; id < kWorkers; ++id)
        workers.emplace_back([&, id] {
            start.wait();                                   // all start together
            long s = 0;
            for (long i = id * 1000 + 1; i <= (id + 1) * 1000; ++i) s += i;
            partial[id] = s;                                // plain write...
            done.count_down();                              // ...published by count_down
        });

    start.count_down();                // open the start gate
    done.wait();                       // main never counted down `done`, it only waits

    long total = 0;
    for (long p : partial) total += p; // safe: count_down happens-before wait returns
    std::cout << "total = " << total << '\n';
    std::cout << "try_wait after completion: " << std::boolalpha << done.try_wait() << '\n';
}
```
- Output:
```
total = 8002000
try_wait after completion: true
```
- (`try_wait` is allowed to return `false` spuriously; on mainstream implementations it reports `true` once the counter is 0.)
- `partial` needs no mutex or atomics: each slot is written by one thread before `count_down`, read by main after `wait`.

#### Example 2: Barrier with a completion function combining per-phase results
- Three threads run three phases in lock-step; the completion step reduces their partial values once per phase.
```cpp
#include <array>
#include <barrier>
#include <iostream>
#include <thread>
#include <vector>

int main() {
    constexpr int kThreads = 3, kPhases = 3;
    std::array<int, kThreads> partial{};
    int phase = 0;

    auto on_phase_done = [&]() noexcept {          // runs once per phase, on one participant
        int sum = 0;
        for (int p : partial) sum += p;
        std::cout << "phase " << ++phase << " sum = " << sum << '\n';
    };
    std::barrier sync{kThreads, on_phase_done};

    std::vector<std::jthread> threads;
    for (int id = 0; id < kThreads; ++id)
        threads.emplace_back([&, id] {
            for (int step = 1; step <= kPhases; ++step) {
                partial[id] = step * (id + 1);     // write before arriving
                sync.arrive_and_wait();            // completion has run when this returns
            }
        });
}
```
- Output:
```
phase 1 sum = 6
phase 2 sum = 12
phase 3 sum = 18
```
- Phase k sum = k × (1 + 2 + 3). The completion step sees all writes made before the arrivals of that phase, and every thread sees the completion's effects after `arrive_and_wait` returns.
- The `jthread`s join automatically at the end of `main` (they are destroyed before `sync`, `partial`, `phase`, since they were declared later).

#### Example 3: counting_semaphore limits concurrency
- Eight tasks, at most two in the "connection pool" at any time.
```cpp
#include <algorithm>
#include <atomic>
#include <chrono>
#include <iostream>
#include <semaphore>
#include <thread>
#include <vector>

std::counting_semaphore<2> pool{2};     // 2 permits
std::atomic<int> active{0};
std::atomic<int> max_active{0};

void use_connection() {
    pool.acquire();                                         // take a permit (may block)
    const int now = active.fetch_add(1) + 1;
    int prev = max_active.load();
    while (prev < now && !max_active.compare_exchange_weak(prev, now)) {}
    std::this_thread::sleep_for(std::chrono::milliseconds(20));   // "use" it
    active.fetch_sub(1);
    pool.release();                                         // give it back
}

int main() {
    {
        std::vector<std::jthread> tasks;
        for (int i = 0; i < 8; ++i) tasks.emplace_back(use_connection);
    }                                                       // all joined here
    std::cout << "max concurrent users = " << max_active << '\n';
}
```
- Output: `max concurrent users = 2` (never more than 2; with the 20 ms hold it is 2 in practice).
- Unlike a mutex, the permit count can be any number, and release could come from a different thread.

#### Example 4: binary_semaphore ping-pong
- Two semaphores, both starting at 0 or 1, force strict alternation between two threads.
```cpp
#include <iostream>
#include <semaphore>
#include <thread>

std::binary_semaphore ping_turn{1};   // ping goes first
std::binary_semaphore pong_turn{0};

int main() {
    std::jthread ping([] {
        for (int i = 0; i < 3; ++i) {
            ping_turn.acquire();
            std::cout << "ping " << i << '\n';
            pong_turn.release();      // hand the turn to the other thread
        }
    });
    std::jthread pong([] {
        for (int i = 0; i < 3; ++i) {
            pong_turn.acquire();
            std::cout << "pong " << i << '\n';
            ping_turn.release();
        }
    });
}
```
- Output:
```
ping 0
pong 0
ping 1
pong 1
ping 2
pong 2
```
- The thread that releases is never the one that acquired: exactly what a mutex forbids and a semaphore allows.
- `std::cout` needs no extra lock here: the release/acquire chain orders every print.

#### Example 5: atomic wait/notify instead of spinning
- A consumer sleeps until a generation counter changes; the producer stores first, then notifies, then sleeps until the consumer acknowledges.
```cpp
#include <atomic>
#include <iostream>
#include <thread>

std::atomic<unsigned> generation{0};   // producer -> consumer: "new data"
std::atomic<unsigned> acked{0};        // consumer -> producer: "done with it"
int payload = 0;                       // plain data published by the atomics

int main() {
    std::jthread consumer([] {
        for (unsigned g = 1; g <= 3; ++g) {
            generation.wait(g - 1, std::memory_order_acquire);   // sleeps while value == g - 1
            std::cout << "generation " << generation.load(std::memory_order_relaxed)
                      << " payload " << payload << '\n';
            acked.store(g, std::memory_order_release);
            acked.notify_one();
        }
    });

    for (unsigned g = 1; g <= 3; ++g) {
        payload = static_cast<int>(g) * 100;               // write data
        generation.store(g, std::memory_order_release);    // change the value first
        generation.notify_one();                           // then wake
        acked.wait(g - 1, std::memory_order_acquire);      // do not overwrite payload too early
    }
}
```
- Output:
```
generation 1 payload 100
generation 2 payload 200
generation 3 payload 300
```
- `wait(old)` returns only once the value differs from `old`; a notify that arrives before the consumer sleeps is not lost, because the value comparison happens before sleeping.
- Release store + acquire `wait` publish `payload` exactly like a release/acquire flag.
- Monotonically increasing generations (instead of a toggling bool) avoid the A to B to A blind spot.

#### Example 6: jthread with stop_token, condition_variable_any and stop_callback
- A worker blocked on a condition variable wakes promptly when the `jthread` is destroyed.
```cpp
#include <atomic>
#include <condition_variable>
#include <deque>
#include <iostream>
#include <mutex>
#include <stop_token>
#include <thread>

int main() {
    std::mutex m;
    std::condition_variable_any cv;              // _any: has stop_token-aware waits
    std::deque<int> jobs;
    const auto main_id = std::this_thread::get_id();
    std::atomic<bool> callback_in_main{false};

    {
        std::jthread worker([&](std::stop_token st) {
            std::stop_callback on_stop(st, [&] {
                callback_in_main = (std::this_thread::get_id() == main_id);
            });
            std::unique_lock lk(m);
            while (true) {
                // returns when pred() is true OR stop is requested; the result is pred()
                if (!cv.wait(lk, st, [&] { return !jobs.empty(); })) break;
                const int job = jobs.front();
                jobs.pop_front();
                std::cout << "job " << job << '\n';
            }
            std::cout << "worker exits\n";
        });

        for (int j = 1; j <= 2; ++j) {
            { std::lock_guard lk(m); jobs.push_back(j); }
            cv.notify_one();
        }
        while (true) {                               // let the worker drain the jobs
            std::lock_guard lk(m);
            if (jobs.empty()) break;
        }
    }   // ~jthread: request_stop() (runs on_stop here), the wait wakes, then join()

    std::cout << "callback ran in main thread: " << std::boolalpha << callback_in_main << '\n';
}
```
- Output:
```
job 1
job 2
worker exits
callback ran in main thread: true
```
- The callback runs synchronously in the thread that calls `request_stop()`, which is the main thread inside `~jthread`.
- With a plain `std::condition_variable` the worker would never wake and the destructor's `join()` would hang.

### QUICK_REFERENCE: Cheat Sheet

#### API at a glance
| Primitive | Signal side | Wait side | Gotcha |
|---|---|---|---|
| `std::latch l{N}` | `count_down(n)` | `wait()`, `try_wait()`, `arrive_and_wait(n)` | one-shot; below zero is UB; `try_wait` may spuriously be false |
| `std::barrier b{N, f}` | `arrive(n)` → token | `wait(std::move(tok))`, `arrive_and_wait()` | same N every phase; `arrive_and_drop()` to leave; `f` must be `noexcept` |
| `std::counting_semaphore<K> s{init}` | `release(n)` | `acquire()`, `try_acquire*()` | no ownership; past `max()` is UB; pick `init` carefully |
| `std::binary_semaphore s{0 or 1}` | `release()` | `acquire()` | not a mutex; no `lock_guard` |
| `std::atomic<T>::wait(old)` | store, then `notify_one/all()` | `wait(old)` returns when value != old | notify without change does nothing; ABA blind spot |
| `std::jthread` | `request_stop()` / destructor | `stop_token::stop_requested()`, `condition_variable_any::wait(lk, st, pred)` | cooperative only; declare as last member |
| `std::stop_callback cb(tok, f)` | runs `f` on stop | n/a | runs in requester's thread, or immediately if already stopped |

#### Memory ordering guarantees
| Operation pair | Guarantee |
|---|---|
| `latch::count_down` → `latch::wait` returns | strongly happens before |
| arrivals of a phase → completion → `barrier` waiters return | happens before, in that order |
| `semaphore::release` → `acquire` that observes it | strongly happens before |
| `atomic` store (release) → `wait` (acquire) that returns because of it | synchronizes-with (ordinary atomic rules) |
| `request_stop` → `stop_requested()` returning true | synchronizes-with |

#### Interview one-liners
| Question | One-liner |
|---|---|
| Latch vs barrier? | Latch: one-shot countdown, anyone counts or waits. Barrier: reusable phases for a fixed set of participants, with a completion step. |
| Can a latch be reset? | No; make a new one or use a barrier. |
| Do I need a mutex to read worker results after `latch.wait()`? | No; `count_down` happens-before the return from `wait`. |
| Where does a barrier completion run? | On one participating thread, once per phase, before anyone is released. |
| Semaphore vs mutex? | Semaphore counts permits and has no owner; mutex enforces ownership. |
| Semaphore vs CV? | Semaphore remembers releases; a CV forgets notifications. |
| What does `atomic::wait(old)` do? | Sleeps while the value equals `old`; returns only after seeing a different value. |
| `jthread` vs `thread`? | `jthread` requests stop and joins in its destructor; `thread` calls `terminate` if still joinable. |
| Does `request_stop` interrupt? | No; it sets the stop state and runs callbacks; code must poll or use stop-aware waits. |
| Where does a `stop_callback` run? | In the thread calling `request_stop`, or immediately in the constructor if stop was already requested. |
