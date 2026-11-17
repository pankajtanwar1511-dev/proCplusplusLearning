## TOPIC: async, future/promise, thread_local and call_once

### THEORY_SECTION: Core Concepts

#### 1. Mental model
- `std::thread` runs code but gives you no result and no error channel. The future/promise family adds a one-shot **channel** for a value or an exception.
- The channel is a heap-allocated, reference-counted **shared state** holding: the result slot (value or `exception_ptr`), a "ready" flag, and the waiting machinery.
- **Producer side** (writes once): `std::promise`, `std::packaged_task`, or the task launched by `std::async`.
- **Consumer side** (reads): `std::future` (one consumer, `get()` once) or `std::shared_future` (many consumers).
- `thread_local` and `std::call_once` solve two other per-thread / once-only problems:
  - `thread_local`: one instance **per thread** (no sharing, so no synchronization).
  - `call_once` / magic statics: run initialization **exactly once across all threads**, with proper publication.

```text
 producer                                consumer
 std::promise<T>  ----\              /---- std::future<T>
 packaged_task<T()> ---+--> shared state <--+
 std::async task  ----/   (value | exception, ready flag)
```

#### 2. promise and future
- `std::promise<T> p; std::future<T> f = p.get_future();` associates both with one shared state. `get_future()` may be called once (second call: `future_error` `future_already_retrieved`).
- Producer: `p.set_value(v)` or `p.set_exception(std::current_exception())`. Only once; a second set throws `future_error` `promise_already_satisfied`.
- Consumer: `f.get()` blocks until the state is **ready**, then returns the value (moved out) or rethrows the stored exception.
- `get()` waits for the **result**, not for the producing thread to exit. The producer can keep running after `set_value`.
- `f.wait()`, `f.wait_for(d)`, `f.wait_until(tp)` wait without consuming; `wait_for` returns `ready`, `timeout`, or `deferred`.
- `std::future` is **one-shot**: after `get()`, `valid() == false`. Calling `get()` again is undefined behaviour by the standard; libstdc++ throws `future_error` `no_state`.
- Synchronization: `set_value` / `set_exception` **synchronizes-with** the successful return of `get()` / `wait()`. Data written before `set_value` is visible after `get()`.
- **Broken promise**: if a promise is destroyed (or a `packaged_task` destroyed) without setting a result, it stores `future_error` with `broken_promise`; `get()` throws it. Waiters are not left hanging forever.
- `set_value_at_thread_exit` / `set_exception_at_thread_exit`: store now, make ready only after the thread's `thread_local` objects are destroyed.
- Shared state lifetime: reference-counted by every promise, future, shared_future, packaged_task and async return object that refers to it. Destroyed when the **last** of them releases it, whichever that is.

#### 3. shared_future
- Copyable; every copy refers to the same shared state. Created by `f.share()` or `std::shared_future<T> sf = std::move(f);`.
- `get()` can be called many times, by many threads; for non-reference `T` it returns `const T&` to the stored value (no move).
- Recommended pattern: give **each thread its own copy** of the `shared_future`. The stored value is shared, so mutating it through a cast or holding a non-thread-safe type is your problem.
- Typical use: one-to-many broadcast of a "start" signal or a configuration loaded once.

#### 4. packaged_task
- Wraps a callable so that calling it stores the return value (or exception) into a shared state: `std::packaged_task<int(int)> task(f); auto fut = task.get_future(); task(5);`.
- It does **not** run by itself. Something must invoke it: the current thread, a `std::thread` (move it in), or a thread pool queue.
- If it is destroyed without being invoked: the future gets `broken_promise`.
- If it is never invoked and never destroyed, `fut.get()` blocks forever.
- This is the natural building block for a thread pool that returns futures: the pool stores type-erased `packaged_task`s (move-only, so the queue needs a move-only function wrapper such as C++23 `std::move_only_function`).

#### 5. std::async and launch policies
- `std::async(policy, f, args...)` returns a `std::future` for `f(args...)`; arguments are decay-copied like `std::thread`.

| Policy | What happens | Thread | When it runs |
|---|---|---|---|
| `std::launch::async` | as if on a new `std::thread` | new thread (fresh `thread_local`s) | starts promptly |
| `std::launch::deferred` | lazy evaluation | the thread that calls `get()`/`wait()` | only on `get()`/`wait()`; never otherwise |
| default (`async \| deferred`) | implementation chooses | unknown | unknown |

- Default policy pitfalls: the task might be deferred, so it may never run, `thread_local` access is ambiguous, and `wait_for` returns `future_status::deferred` instead of `ready`/`timeout` (polling loops can spin forever).
- Implementations: libstdc++ and libc++ create a new thread per `launch::async` call and use async for the default policy unless thread creation fails. MSVC runs `std::async` tasks on a thread pool. Portable code says `std::launch::async` explicitly when it needs concurrency.
- **The blocking destructor trap**: the last `std::future` referring to a shared state created by `std::async` (with async policy) **blocks in its destructor until the task completes**, as if joining it.
  - `std::async(std::launch::async, f);` with the result discarded runs **synchronously**: the temporary future dies at the end of the full expression and waits.
  - A loop of discarded `std::async` calls runs one task at a time.
  - Futures from `std::promise` or `std::packaged_task` do **not** block in their destructor.
  - C++20 marks `std::async` `[[nodiscard]]`, so compilers warn about the discarded case.
- Exceptions from the task are captured and rethrown by `get()`.

#### 6. Thread pools (basics)
- Why: thread creation costs tens of microseconds (Linux, typical) and causes oversubscription under load. A pool creates N long-lived workers once and feeds them through a queue.
- Core parts: task queue (mutex + condition variable, or a lock-free queue), N workers looping `pop -> run`, shutdown flag, join in destructor.
- Sizing: CPU-bound, about one worker per available logical CPU (then benchmark); I/O-bound, more.
- **Backpressure**: if arrival rate exceeds processing rate, an unbounded queue grows forever (10,000 tasks/s in, 8,000 tasks/s out, means 2,000 more queued every second). A production pool needs a policy:
  - bounded queue that blocks producers, or rejects/drops tasks
  - priorities, load shedding, or upstream flow control
  - adding threads only helps if the work actually scales (not CPU-bound on saturated cores)
- Per-task results via `packaged_task` futures; per-task exceptions must be caught so one task cannot kill a worker.
- Pitfalls: a task that blocks on another task's future inside a fully busy pool can **deadlock** the pool; `thread_local` state persists across tasks on the same worker.
- Low-latency systems go further: no per-message `std::async`, preallocated SPSC queues, pinned threads, no allocation on the hot path.

#### 7. thread_local storage
- `thread_local T x;` gives `x` **thread storage duration**: each thread has its own instance, created for that thread and destroyed when that thread ends.
- Allowed at namespace scope, as a `static` data member, and at block scope (where `thread_local` implies `static`).
- Initialization:
  - constant-initialized ones (e.g. `thread_local int c = 0;`) are set up as part of the thread's TLS image, no runtime cost
  - block-scope ones with dynamic initialization: initialized the first time **that thread** passes the declaration
  - namespace-scope ones with dynamic initialization: initialized before the first odr-use in that thread (GCC/Clang do it lazily through a wrapper function on first use)
- Destruction: when the thread exits normally (returns from its function or calls `std::exit`), in reverse order of construction. For the main thread, its `thread_local`s are destroyed **before** objects with static storage duration.
- Not destroyed when the process ends via `std::quick_exit`, `_exit`, `abort`, or for detached threads still running when the process ends.
- Where it lives: an implementation detail. On Linux x86-64, each thread has a TLS block addressed via the `fs` segment register. It is **not** "a variable on the thread's stack".
- Cost (x86-64 Linux, typical): executable-local access is one `fs:`-relative instruction; access from a dynamically loaded shared library may call `__tls_get_addr`; dynamic initialization adds a guard check on each access.
- Use cases: per-thread counters/statistics merged later, per-thread caches and scratch buffers, per-thread random engines, per-thread memory pools.
- `thread_local` is about **which object** a thread sees, not about synchronization. Passing `&tls_var` to another thread is legal but that thread then shares the object (and its lifetime ends when the owning thread exits).

#### 8. call_once, once_flag and magic statics
- Problem: run initialization exactly once even when many threads race to it, and make the result visible to all of them.
- Naive `if (!initialized) { init(); initialized = true; }`:
  - with plain `bool`: data race (UB), and two threads can both run `init()`
  - with `std::atomic<bool>`: no UB on the flag, but check-then-act is still not atomic, so `init()` can still run twice
- `std::call_once(flag, f, args...)` with a `std::once_flag`:
  - exactly one **returning** (successful) execution of `f` per flag
  - concurrent callers block until it finishes; all calls that return have their completion synchronized with that execution, so the initialized data is visible without extra fences
  - if `f` throws, the exception propagates to that caller, the flag stays unset, and a later call retries (possibly in another thread)
  - `std::once_flag` is neither copyable nor movable
- **Magic statics** (C++11): initialization of a block-scope `static` is thread-safe. `static Widget w;` inside a function is constructed exactly once; concurrent callers wait; if the constructor throws, the next caller retries.
  - Implementation (GCC/Clang): a guard variable checked with an acquire load on every call (fast path is one load and branch), and `__cxa_guard_acquire`/`release` on the slow path.
  - Recursive re-entry into the same static's initialization is undefined behaviour (in practice: deadlock or exception).
  - `-fno-threadsafe-statics` turns the guarantee off.
- Choose: magic static for "one object, lazily constructed"; `call_once` for "an arbitrary one-time action" (init a library, register callbacks), or when the state is a class member, not a local.

#### 9. Misconceptions to unlearn
- ❌ "`future.get()` waits for the thread to finish." ✅ It waits for the result to become ready; the producer may keep running.
- ❌ "`std::async` always creates a new thread." ✅ Only with `std::launch::async`; the default policy may defer.
- ❌ "Ignoring the future of `std::async` runs it in the background." ✅ The temporary future's destructor blocks: it runs synchronously.
- ❌ "Every future blocks in its destructor." ✅ Only the last future from a `std::async` launched task.
- ❌ "The shared state is freed when the promise and future go out of scope." ✅ It is reference-counted by all associated objects; the last one frees it.
- ❌ "A destroyed promise leaves the future waiting forever." ✅ It stores `broken_promise`; `get()` throws.
- ❌ "`thread_local` is a variable on the thread's stack" / "passed to each thread". ✅ It has thread storage duration: one instance per thread, provided by the TLS mechanism.
- ❌ "`thread_local` makes shared data thread-safe." ✅ It removes sharing; it does not protect anything that is shared.
- ❌ "`call_once` is just a wrapper around `if (!done) { f(); done = true; }`." ✅ It is a synchronization primitive: mutual exclusion, waiting, publication, and retry on exception.
- ❌ "`std::atomic<bool>` fixes the naive once pattern." ✅ The check-then-act is still two separate steps.
- ❌ "If the `call_once` function throws, the flag is consumed." ✅ The next call retries.
- ❌ "`std::async` per message is fine in a hot path." ✅ Thread creation, allocation and scheduling jitter destroy tail latency.

### EDGE_CASES: Traps and Misconceptions

#### Edge Case 1: Discarded std::async future runs synchronously
- People assume `std::async(std::launch::async, f);` fires and forgets.
- The returned temporary `std::future` is destroyed at the end of the statement, and that destructor waits for the task. Code that "launches" tasks in a loop this way executes them one after another.
```cpp
for (auto& item : items)
    std::async(std::launch::async, process, item); // sequential! each waits
```
- Keep the futures (e.g. in a `std::vector<std::future<void>>`) or use a pool. C++20 compilers warn (`[[nodiscard]]`).

#### Edge Case 2: Default policy, deferred tasks and wait_for loops
- With `std::launch::deferred` (or a default policy the implementation chose to defer), `wait_for` never returns `ready`; it returns `future_status::deferred` immediately.
- A loop `while (f.wait_for(10ms) != std::future_status::ready) { ... }` spins forever.
- Fix: request `std::launch::async` explicitly, or check for `deferred` first.

#### Edge Case 3: get() twice on a std::future
- `get()` moves the result out and releases the shared state: `valid()` becomes `false`.
- A second `get()` is undefined behaviour by the standard. libstdc++ throws `std::future_error` with code `no_state` ("No associated state").
- Multiple reads or multiple consumers: use `std::shared_future`.

#### Edge Case 4: Promise destroyed without a value
- If a producer returns early (error path) without calling `set_value`/`set_exception`, the promise destructor stores `future_error(broken_promise)`.
- The consumer's `get()` throws `std::future_error: Broken promise` instead of hanging.
- Worse variant: the promise lives in the caller's stack frame, captured by reference by a detached thread, and the caller returns. Now the thread calls `set_value` on a destroyed object: undefined behaviour. Move the promise into the thread instead.

#### Edge Case 5: thread_local with std::async and thread pools
- `std::launch::async` behaves as if on a new thread: the task sees fresh `thread_local` instances, destroyed when the task's thread ends.
- `std::launch::deferred` runs on the caller's thread: the task sees and modifies the **caller's** `thread_local`s.
- Thread pools reuse threads: `thread_local` state set by one task is still there for the next task on the same worker. Never assume a clean slate per task.

#### Edge Case 6: thread_local destruction timing
- Block-scope `thread_local` objects are constructed only in threads that actually reach the declaration; threads that never call the function never construct one.
- Destruction happens at thread exit, **before** `join()` returns in the joining thread.
- For the main thread: destroyed during `exit`, before static objects. A `thread_local` destructor that uses a static object is fine; a static destructor that uses a `thread_local` from the main thread is not.
- Detached threads still running at process exit never get their `thread_local` destructors.

#### Edge Case 7: call_once exception retries, atomic<bool> does not help
- `std::call_once` with a throwing callable: the exception reaches the caller and the flag stays "not done". The next caller runs the callable again.
- `std::atomic<bool>` check-then-set: `load() == false` in two threads, both run `init()`. Atomicity of each step is not atomicity of the sequence.
- Correct alternatives: `call_once`, magic static, or a CAS that elects one initializer plus a way for losers to wait (essentially reimplementing `call_once`).

#### Edge Case 8: packaged_task that nobody runs
- Creating a `packaged_task` and calling `get_future()` does not start anything.
- `fut.get()` on the same thread before invoking the task blocks forever (self-deadlock).
- If the task is destroyed un-invoked, the future gets `broken_promise`.

### CODE_EXAMPLES: Practical Demonstrations

#### Example 1: promise/future with value and exception
- One worker produces a value, another produces an exception; `get()` returns or rethrows.
```cpp
#include <exception>
#include <future>
#include <iostream>
#include <stdexcept>
#include <thread>

int calculate(bool fail) {
    if (fail) throw std::runtime_error("calculation failed");
    return 42;
}

int main() {
    for (bool fail : {false, true}) {
        std::promise<int> promise;
        std::future<int> future = promise.get_future();

        std::thread worker([p = std::move(promise), fail]() mutable {
            try {
                p.set_value(calculate(fail));
            } catch (...) {
                p.set_exception(std::current_exception());
            }
        });

        try {
            int value = future.get(); // returns or rethrows
            std::cout << "result: " << value << '\n';
        } catch (const std::exception& e) {
            std::cout << "error: " << e.what() << '\n';
        }
        worker.join();
    }
}
```
- Output: `result: 42` then `error: calculation failed`.
- `get()` is called in its own statement on purpose: in `std::cout << "result: " << future.get()` the text `result: ` is already printed (C++17 left-to-right `<<` evaluation) before `get()` throws.
- The promise is **moved** into the lambda (`mutable` needed to call non-const `set_value`), so its lifetime is tied to the worker, not to `main`'s stack.

#### Example 2: std::async policies and the thread they run on
- Shows that `deferred` runs lazily on the calling thread and `async` on another thread.
```cpp
#include <future>
#include <iostream>
#include <thread>

int main() {
    const auto main_id = std::this_thread::get_id();
    auto where = [main_id] {
        return std::this_thread::get_id() == main_id ? "main thread" : "other thread";
    };

    auto deferred = std::async(std::launch::deferred, where);
    auto async = std::async(std::launch::async, where);

    std::cout << "deferred status: "
              << (deferred.wait_for(std::chrono::seconds(0)) == std::future_status::deferred
                      ? "deferred" : "not deferred") << '\n';
    std::cout << "deferred ran on: " << deferred.get() << '\n';
    std::cout << "async ran on: " << async.get() << '\n';
}
```
- Output: `deferred status: deferred`, `deferred ran on: main thread`, `async ran on: other thread`.

#### Example 3: shared_future broadcasting a start signal
- One `promise<void>` releases many waiting threads at once.
```cpp
#include <future>
#include <iostream>
#include <thread>
#include <vector>

int main() {
    std::promise<void> go;
    std::shared_future<void> ready = go.get_future().share();
    std::vector<int> results(4, 0);

    std::vector<std::thread> workers;
    for (int i = 0; i < 4; ++i) {
        workers.emplace_back([ready, i, &results] { // each thread owns a copy
            ready.wait();                            // block until broadcast
            results[i] = i * 10;
        });
    }

    go.set_value(); // release all workers at once
    for (auto& w : workers) w.join();

    for (int r : results) std::cout << r << ' ';
    std::cout << '\n';
}
```
- Output: `0 10 20 30`
- `ready` is captured **by value**, so each thread holds its own `shared_future` copy.

#### Example 4: packaged_task as the unit of work in a minimal thread pool
- Fixed workers, a mutex + condition variable queue, futures for results, clean shutdown.
```cpp
#include <condition_variable>
#include <functional>
#include <future>
#include <iostream>
#include <memory>
#include <mutex>
#include <queue>
#include <thread>
#include <vector>

class ThreadPool {
public:
    explicit ThreadPool(unsigned n) {
        for (unsigned i = 0; i < n; ++i)
            workers_.emplace_back([this] { run(); });
    }
    ~ThreadPool() {
        {
            std::lock_guard lock(m_);
            stopping_ = true;
        }
        cv_.notify_all();
        for (auto& w : workers_) w.join();
    }

    template <class F>
    auto submit(F f) -> std::future<decltype(f())> {
        using R = decltype(f());
        // shared_ptr because std::function requires copyable callables
        auto task = std::make_shared<std::packaged_task<R()>>(std::move(f));
        auto fut = task->get_future();
        {
            std::lock_guard lock(m_);
            queue_.push([task] { (*task)(); });
        }
        cv_.notify_one();
        return fut;
    }

private:
    void run() {
        for (;;) {
            std::function<void()> job;
            {
                std::unique_lock lock(m_);
                cv_.wait(lock, [this] { return stopping_ || !queue_.empty(); });
                if (stopping_ && queue_.empty()) return;
                job = std::move(queue_.front());
                queue_.pop();
            }
            job(); // packaged_task captures exceptions into the future
        }
    }

    std::mutex m_;
    std::condition_variable cv_;
    std::queue<std::function<void()>> queue_;
    bool stopping_ = false;
    std::vector<std::thread> workers_;
};

int main() {
    ThreadPool pool(4);
    std::vector<std::future<int>> results;
    for (int i = 1; i <= 5; ++i)
        results.push_back(pool.submit([i] { return i * i; }));

    int sum = 0;
    for (auto& f : results) sum += f.get();
    std::cout << "sum of squares: " << sum << '\n';
}
```
- Output: `sum of squares: 55`
- Missing for production: bounded queue (backpressure), exception policy for fire-and-forget tasks, avoiding `std::function` allocation (C++23 `std::move_only_function` removes the `shared_ptr`).

#### Example 5: thread_local counters, constructed per thread
- Each thread gets its own counter; main's instance is untouched; results collected after join.
```cpp
#include <array>
#include <iostream>
#include <thread>

thread_local int counter = 0;

void foo() { ++counter; }

int main() {
    std::array<int, 3> seen{};
    std::array<std::thread, 3> threads;
    for (int t = 0; t < 3; ++t) {
        threads[t] = std::thread([t, &seen] {
            for (int i = 0; i < 100; ++i) foo();
            seen[t] = counter; // this thread's instance
        });
    }
    for (auto& th : threads) th.join();

    std::cout << seen[0] << ' ' << seen[1] << ' ' << seen[2] << '\n';
    std::cout << "main: " << counter << '\n';
}
```
- Output: `100 100 100` then `main: 0`
- No atomics or mutexes needed for `counter`: there is no sharing. Aggregating a global total needs a separate synchronized step.

#### Example 6: call_once retrying after an exception
- First attempt throws, second succeeds, third is skipped.
```cpp
#include <iostream>
#include <mutex>
#include <stdexcept>

std::once_flag flag;
int attempts = 0;

void init() {
    ++attempts;
    if (attempts == 1) throw std::runtime_error("transient failure");
    std::cout << "initialized on attempt " << attempts << '\n';
}

int main() {
    for (int i = 0; i < 3; ++i) {
        try {
            std::call_once(flag, init);
        } catch (const std::exception& e) {
            std::cout << "attempt failed: " << e.what() << '\n';
        }
    }
    std::cout << "total attempts: " << attempts << '\n';
}
```
- Output: `attempt failed: transient failure`, `initialized on attempt 2`, `total attempts: 2`.
- `attempts` needs no extra synchronization here: only the active `call_once` execution writes it, and each completion synchronizes with later calls.

#### Example 7: Magic static vs call_once for lazy initialization
- Both are thread-safe; the static is simpler when the job is "construct one object".
```cpp
#include <iostream>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

struct Config {
    Config() { std::cout << "Config constructed once\n"; }
    std::string name = "prod";
};

const Config& config() {
    static const Config instance; // C++11 thread-safe initialization
    return instance;
}

class Registry {
public:
    void ensure_loaded() {
        std::call_once(loaded_, [this] {
            entries_ = {"a", "b", "c"};
            std::cout << "Registry loaded once\n";
        });
    }
    std::size_t size() const { return entries_.size(); }
private:
    std::once_flag loaded_;               // per-object once, not possible with a local static
    std::vector<std::string> entries_;
};

int main() {
    Registry reg;
    std::vector<std::thread> ts;
    for (int i = 0; i < 8; ++i)
        ts.emplace_back([&reg] {
            (void)config().name;
            reg.ensure_loaded();
        });
    for (auto& t : ts) t.join();
    std::cout << "entries: " << reg.size() << '\n';
}
```
- Output: `Config constructed once` and `Registry loaded once` (either order), then `entries: 3`.
- `once_flag` as a member gives "once per object", which a function-local static (once per program) cannot express.

### QUICK_REFERENCE: Cheat Sheet

#### future / promise / async API at a glance
| Thing | Role | Key rules |
|---|---|---|
| `std::promise<T>` | producer | `set_value`/`set_exception` once; destroyed unset gives `broken_promise` |
| `std::future<T>` | single consumer | move-only; `get()` once, then `valid()==false` |
| `std::shared_future<T>` | many consumers | copyable; `get()` many times; one copy per thread |
| `std::packaged_task<R(A...)>` | callable that fills a future | must be invoked by someone; move-only |
| `std::async(policy, f, ...)` | run f, return future | `async`: new thread; `deferred`: on `get()`; last future blocks in dtor |

#### future_error codes
| Code | When |
|---|---|
| `broken_promise` | promise/packaged_task destroyed without a result |
| `future_already_retrieved` | `get_future()` called twice |
| `promise_already_satisfied` | `set_value`/`set_exception` called twice |
| `no_state` | operation on a promise/future without shared state (libstdc++ also uses it for a second `get()`) |

#### thread_local and once-initialization
| Tool | Guarantee | Use when |
|---|---|---|
| `thread_local T x` | one instance per thread, destroyed at thread exit | per-thread counters, caches, buffers |
| `static T x` in a function | thread-safe one-time construction, retry on throw | lazy singleton object |
| `std::call_once` + `once_flag` | exactly one successful execution, publication, retry on throw | arbitrary once-only action, per-object once |
| `if (!flag) {...}` with `bool` | none, data race | never in multithreaded code |
| `atomic<bool>` check-then-set | no UB, but may run twice | never for once-only init |

#### Interview one-liners
| Question | One-liner |
|---|---|
| promise vs future? | Producer and consumer ends of one shared state carrying a value or exception. |
| Does `get()` wait for the thread to exit? | No, only for the result to be ready. |
| `get()` twice? | UB on `std::future` (libstdc++ throws `no_state`); use `shared_future`. |
| Promise destroyed unset? | Future gets `broken_promise`. |
| Default `std::async` policy? | `async \| deferred`, implementation picks; may never run. |
| Discarded `std::async` future? | Destructor blocks: runs synchronously. |
| `std::async` in a hot path? | No: thread creation, allocation, scheduling jitter. Use a pinned pool/queue. |
| Why a thread pool? | Amortize thread creation, cap concurrency; must handle backpressure. |
| What is `thread_local`? | Thread storage duration: one instance per thread. |
| `thread_local` lifetime? | Per thread: lazily or at first use, destroyed at that thread's exit. |
| `call_once` vs if-flag? | call_once synchronizes, waits, publishes, retries on throw; the if-flag races. |
| `call_once` callable throws? | Flag not set; the next call retries. |
| Magic static or `call_once`? | Static for one lazily built object; call_once for arbitrary or per-object once. |
