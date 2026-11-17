## TOPIC: async, future/promise, thread_local and call_once

### INTERVIEW_QA: Interview Questions with Detailed Answers

#### Q1: How do std::promise and std::future relate, and what happens if the consumer calls get() before the value is set?
**Difficulty:** #beginner
**Category:** #concurrency #futures
**Concepts:** #promise #future #shared_state

**Answer:**
Both refer to one shared state: the promise is the producer that sets a value or exception once, the future is the consumer that reads it. If get() is called first, it blocks until the producer makes the state ready, then returns the value or rethrows the exception.

**Explanation:**
- `promise.get_future()` creates the association; it may be called only once.
- The shared state is a separate, reference-counted object (usually heap-allocated), not "memory shared between the promise and future objects".
- `set_value` **synchronizes-with** the return of `get()`: all writes the producer made before `set_value` are visible after `get()`.
- `get()` waits for the **result**, not for the producing thread to finish. The producer can continue running after `set_value`.
- So in `int r = future.get(); worker.join();` main can block at `get()`, and `join()` may still wait afterwards if the worker does more work.
- ❌ Common wrong answer: "`get()` waits for the thread to complete." It waits for readiness of the shared state.
- ✅ What a strong answer adds: futures give a one-shot, typed, exception-carrying channel with built-in happens-before, which plain `std::thread` lacks.

**Key takeaway:** promise writes once, future reads once, and get() blocks until the write happens.

---

#### Q2: How are exceptions propagated through a promise/future pair, and through std::async?
**Difficulty:** #beginner
**Category:** #concurrency #futures
**Concepts:** #exception_ptr #set_exception #error_propagation

**Answer:**
The producer catches the exception and calls promise.set_exception(std::current_exception()); the exception_ptr is stored in the shared state and future.get() rethrows it in the consumer's thread. std::async and packaged_task do this capture automatically.

**Explanation:**
- Pattern: `try { p.set_value(compute()); } catch (...) { p.set_exception(std::current_exception()); }`.
- `get()` rethrows the **same** exception object (via `std::rethrow_exception`), with its dynamic type preserved.
- With `std::async(std::launch::async, compute)`, any exception escaping `compute` is stored automatically.
- Without this, an exception escaping a `std::thread` function calls `std::terminate()`.
- ❌ Common wrong answer: "The exception is lost / terminates like with std::thread." Only if nobody catches it inside the thread; futures exist to carry it.
- ✅ What a strong answer adds: if the consumer never calls `get()`, the exception is silently dropped when the shared state is destroyed. Fire-and-forget tasks need their own error reporting.

**Key takeaway:** Futures carry exceptions across threads; get() is where they reappear.

---

#### Q3: What happens if a std::promise is destroyed without ever calling set_value or set_exception?
**Difficulty:** #intermediate
**Category:** #concurrency #futures
**Concepts:** #broken_promise #future_error #shared_state

**Answer:**
The promise's destructor stores a std::future_error with code broken_promise in the shared state and makes it ready. The waiting consumer wakes up and get() throws that future_error, instead of blocking forever.

**Explanation:**
- Typical cause: an early `return` or error path in the producer that forgets to set a result.
- Same behaviour when a `std::packaged_task` is destroyed without being invoked.
- Other `future_error` codes: `promise_already_satisfied` (set twice), `future_already_retrieved` (`get_future()` twice), `no_state` (promise or future with no shared state, e.g. moved-from).
- libstdc++ message: `std::future_error: Broken promise`.
- ❌ Common wrong answer: "The future waits forever." The standard explicitly prevents that through `broken_promise`.
- ❌ Related wrong design: capturing a local promise by reference in a detached thread. If the owning function returns, the thread calls `set_value` on a destroyed object: undefined behaviour, not a broken promise. Move the promise into the thread.
- ✅ What a strong answer adds: RAII-style guarantee, every promise path resolves the future either with data, an exception, or broken_promise.

**Key takeaway:** An abandoned promise breaks loudly with broken_promise, as long as the promise object itself is destroyed properly.

---

#### Q4: Can you call get() twice on a std::future? How do you give the same result to several threads?
**Difficulty:** #intermediate
**Category:** #concurrency #futures
**Concepts:** #shared_future #valid #one_shot

**Answer:**
No. get() moves the result out and releases the shared state, so valid() becomes false; a second get() is undefined behaviour (libstdc++ throws future_error no_state). For multiple reads or readers use std::shared_future, ideally one copy per thread.

**Explanation:**
- `std::future` is move-only and models a single consumer.
- `std::shared_future` is copyable; `get()` can be called repeatedly and returns `const T&` for non-reference `T`.
- Create with `f.share()` (leaves `f` invalid) or `std::shared_future<T> sf = std::move(f);`.
- Each thread should hold its **own copy**; all copies refer to one shared state.
- `std::promise<void>` plus `shared_future<void>` is a neat one-shot broadcast "go" signal for many threads.
- ❌ Common wrong answer: "`get()` returns the cached value again." It does not cache for `std::future`; check `valid()` if unsure.
- ✅ What a strong answer adds: the value in a `shared_future` is shared, so if `T` has mutable internals, concurrent use of the value needs its own synchronization.

**Key takeaway:** future is single-shot and single-consumer; shared_future is the multi-reader version.

---

#### Q5: What is std::packaged_task, and how does it differ from std::promise and std::async?
**Difficulty:** #intermediate
**Category:** #concurrency #futures
**Concepts:** #packaged_task #task_queue #thread_pool

**Answer:**
packaged_task wraps a callable so that invoking it stores the return value or exception into its future. Unlike async it does not run itself; unlike promise you do not set the result manually. It is the natural unit of work for a thread pool.

**Explanation:**
- `std::packaged_task<int(int)> task(f); auto fut = task.get_future(); std::thread t(std::move(task), 5);`
- Comparison:
  - `promise`: lowest level, you decide when and from where to set the result
  - `packaged_task`: result comes from the callable's return; you decide where it runs
  - `async`: library decides where it runs (new thread or deferred) and runs it for you
- Move-only. Destroyed without invocation: future gets `broken_promise`. Never invoked and never destroyed: `get()` blocks forever.
- `reset()` creates a fresh shared state so the task can be run again.
- ❌ Common wrong answer: "Creating a packaged_task starts the work." Nothing runs until something calls `task(args)`.
- ✅ What a strong answer adds: pools store tasks type-erased; because `packaged_task` is move-only, `std::function` needs a `shared_ptr` wrapper (C++23 `std::move_only_function` solves this).

**Key takeaway:** packaged_task = callable + promise; you choose who runs it.

---

#### Q6: What are the std::async launch policies, and what is wrong with relying on the default?
**Difficulty:** #intermediate
**Category:** #concurrency #async
**Concepts:** #launch_policy #deferred #async

**Answer:**
launch::async runs the task as if on a new thread; launch::deferred runs it lazily on the thread calling get() or wait(). The default (async | deferred) lets the implementation pick, so the task may run on the caller later, or never.

**Explanation:**
- `deferred` task: never runs if nobody calls `get()`/`wait()`. `wait_for`/`wait_until` return `future_status::deferred` immediately and do not run it.
- Consequences of the default policy:
  - you cannot rely on concurrency (deadlock if the caller waits for something the task must produce first)
  - `wait_for` polling loops expecting `ready` or `timeout` may spin forever
  - `thread_local` variables accessed by the task may be the caller's or a fresh thread's
- Practice: libstdc++ and libc++ choose async unless thread creation fails; MSVC uses a thread pool. Portable code passes `std::launch::async` explicitly when concurrency matters.
- Arguments are decay-copied like `std::thread`; use `std::ref` for references.
- ❌ Common wrong answer: "`std::async` always creates a new thread." Only `launch::async` promises asynchronous execution.
- ✅ What a strong answer adds: `launch::async` behaves "as if" on a new `std::thread`, so implementations that reuse pool threads must still provide fresh `thread_local`s.

**Key takeaway:** Always state the policy; the default makes timing and thread identity unknowable.

---

#### Q7: What happens when the future returned by `std::async` is ignored?
**Difficulty:** #advanced
**Category:** #concurrency #async
**Concepts:** #future_destructor #blocking #nodiscard

```cpp
std::async(std::launch::async, task);   // returned future ignored
```

**Answer:**
It runs the task synchronously. The returned temporary future is the last reference to an async shared state, and its destructor blocks until the task finishes, at the end of the full expression. A loop of such calls executes tasks one at a time.

**Explanation:**
- Standard rule: the last future/shared_future referring to a shared state created by `std::async` (async policy) blocks in its destructor until the task completes, as if joining its thread.
- Futures obtained from `std::promise` or `std::packaged_task` do not block in their destructor.
- Also bites when you return a future from a function and the caller ignores it, or store futures in a container that is cleared.
- C++20 marks `std::async` `[[nodiscard]]`; GCC warns about the discarded result.
- Fix: keep the futures alive while you need concurrency, e.g. `std::vector<std::future<void>>`, or use a thread pool for fire-and-forget.
- ❌ Common wrong answer: "It is fire-and-forget; the task runs in the background." The blocking destructor prevents exactly that.
- ✅ What a strong answer adds: the rule exists so that an async task never outlives the future that represents it (no implicit detach). It also makes `std::async` futures behave differently from all other futures, a known design wart.

**Key takeaway:** A std::async future dies by joining its task, so a discarded one serializes your code.

---

#### Q8: Would you use std::async inside a low-latency hot path, for example once per incoming market data message?
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

**Key takeaway:** Convenient is not cheap: keep std::async off any path measured in microseconds.

---

#### Q9: You receive 10,000 tasks per second. Thread per task or a thread pool? What can still go wrong with the pool?
**Difficulty:** #advanced
**Category:** #concurrency #design
**Concepts:** #thread_pool #backpressure #bounded_queue

**Answer:**
A fixed pool of workers fed by a queue, sized to the CPUs for CPU-bound work. But if tasks arrive faster than the pool processes them, an unbounded queue grows without limit; you need a backpressure policy such as a bounded queue that blocks or rejects.

**Explanation:**
- Thread per task: creation cost per task and unbounded oversubscription.
- Arithmetic: 10,000 in, 8,000 processed per second, means 2,000 more queued every second, 20,000 after 10 s, until memory or latency limits break.
- Policies: bounded queue (block producer, reject, or drop oldest), priorities, load shedding, upstream flow control, scaling out if the work is parallelizable.
- Adding threads does not help CPU-bound work on saturated cores; it adds context switching.
- Other pool pitfalls:
  - task waits on another task's future while all workers are busy: pool deadlock
  - an exception escaping a task kills its worker (and the process) unless caught
  - `thread_local` state leaks between tasks on the same worker
  - shutdown: drain or discard pending tasks, join workers
- ❌ Common wrong answer: "Use a pool and the problem is solved." The queue only moves the overload; it does not remove it.
- ✅ What a strong answer adds: queue length and wait time are key metrics; latency-sensitive systems prefer rejecting early to queueing late.

**Key takeaway:** A pool fixes creation cost and oversubscription, not overload; design backpressure explicitly.

---

#### Q10: What does thread_local mean, and what do the threads and main print here?
**Difficulty:** #beginner
**Category:** #concurrency #thread_local
**Concepts:** #thread_storage_duration #tls #per_thread_state

```cpp
thread_local int counter = 0;

void worker() {
    ++counter;
    std::cout << counter << '\n';
}

int main() {
    std::thread t1(worker), t2(worker);
    t1.join();
    t2.join();
    std::cout << counter << '\n';
}
```

**Answer:**
thread_local gives the variable thread storage duration: each thread has its own instance. Each worker increments its own counter from 0 and prints 1; main's instance was never touched, so main prints 0.

**Explanation:**
- Output: `1`, `1` (in either order), then `0`.
- Nothing is "passed" to the thread; each thread simply refers to a different object through the same name.
- It is not "on the thread's stack": storage comes from the thread's TLS block (on x86-64 Linux, addressed through the `fs` register).
- Allowed at namespace scope, as a static data member, and at block scope (implies `static`).
- No synchronization is needed for accesses by the owning thread, because no other thread sees that instance (unless you hand out its address).
- ❌ Common wrong answer: "The variable is passed to each thread" or "it lives on each thread's stack". Neither describes thread storage duration.
- ❌ Common wrong answer: "Main prints 2." Main has its own instance.
- ✅ What a strong answer adds: taking `&counter` in one thread and using it in another is legal, but then it is shared data again and dies when the owner thread exits.

**Key takeaway:** thread_local = same name, different object in every thread.

---

#### Q11: When is a thread_local object constructed and destroyed?
**Difficulty:** #intermediate
**Category:** #concurrency #thread_local
**Concepts:** #initialization #destruction #thread_exit

**Answer:**
Constant-initialized ones exist from thread start. Block-scope ones are constructed when that thread first reaches the declaration; namespace-scope ones with dynamic init before first use in that thread. Each is destroyed when its thread exits, in reverse order.

**Explanation:**
- Threads that never use a block-scope `thread_local` never construct it (no cost for unrelated threads).
- GCC/Clang implement dynamic initialization lazily through a TLS wrapper function: each access checks a guard.
- Destruction happens on normal thread exit, before `join()` returns in the joiner. For the main thread, during `std::exit`, **before** static objects are destroyed.
- No destruction on `abort`, `_exit`, `quick_exit`, or for detached threads killed at process exit.
- `promise::set_value_at_thread_exit` makes the future ready only after the thread's `thread_local` destructors run.
- ❌ Common wrong answer: "All thread_locals are created when the thread starts." Dynamic ones are typically lazy and per use site.
- ✅ What a strong answer adds: a `thread_local` destructor flushing per-thread data to a global aggregator must ensure the aggregator (often a static) is still alive and synchronized.

**Key takeaway:** thread_local lifetime is the owning thread's lifetime, with lazy construction for dynamic initializers.

---

#### Q12: Why can thread_local counters be much faster than a shared std::atomic counter in a hot path, and what is the catch?
**Difficulty:** #intermediate
**Category:** #concurrency #thread_local
**Concepts:** #cache_line_contention #per_thread_aggregation #low_latency

**Answer:**
Each thread increments its own instance with a plain add: no atomic RMW and no cache line bouncing between cores. The catch is that the total no longer exists anywhere; you must aggregate per-thread values with separate synchronization when you need it.

**Explanation:**
- Shared `std::atomic<int>` incremented by many cores: every `fetch_add` needs exclusive ownership of the cache line, so the line ping-pongs between cores and throughput collapses as threads are added.
- Per-thread counter: stays in the owning core's cache.
- Aggregation options: each thread publishes its count into a slot (padded to a cache line) read occasionally with atomics; threads add their totals to a global under a lock at exit; a registry of per-thread atomics read by a stats thread.
- Same idea for per-thread scratch buffers, random engines, memory pools.
- ❌ Common wrong answer: "thread_local makes the counter thread-safe." It avoids sharing; reading another thread's value still needs synchronization.
- ✅ What a strong answer adds: access cost is not always zero (shared libraries may call `__tls_get_addr`, dynamic init adds a guard check); in tight loops, copy the TLS value to a local and write back.

**Key takeaway:** thread_local trades contention for an aggregation problem, usually a great trade on hot paths.

---

#### Q13: What pitfalls does thread_local have with thread pools and std::async?
**Difficulty:** #advanced
**Category:** #concurrency #thread_local
**Concepts:** #thread_pool #state_leakage #launch_policy

**Answer:**
Pool threads are reused, so thread_local state left by one task is still there for the next task on that worker. With std::async, launch::async gives fresh instances per task, while a deferred task runs on the caller and touches the caller's thread_locals.

**Explanation:**
- Pool leakage examples: per-thread "current request id", locale, cached user context, an error flag not reset.
- Mitigation: set and reset per-task context explicitly (RAII scope guard), or pass context as parameters.
- Memory: a large `thread_local` buffer is multiplied by the number of threads and lives until each thread exits.
- With the default `std::async` policy you cannot know which instance the task uses.
- Thread pool implementations of `std::async` (MSVC) must still behave "as if" on a new thread with respect to `thread_local`s, which historically was a conformance issue.
- ❌ Common wrong answer: "Each task gets clean thread_local state." Only if each task gets a new thread.
- ✅ What a strong answer adds: `thread_local` is per thread, not per task or per coroutine; a coroutine resumed on another thread sees a different instance.

**Key takeaway:** thread_local is per OS thread; anything that reuses or switches threads changes what you see.

---

#### Q14: Why is this lazy-init check broken with threads, and does making `initialized` a `std::atomic<bool>` fix it?
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

**Key takeaway:** Once-only initialization needs election + waiting + publication; that is what call_once is.

---

#### Q15: 100 threads call std::call_once on the same flag. How many times does the function run, and what happens if it throws?
**Difficulty:** #intermediate
**Category:** #concurrency #initialization
**Concepts:** #call_once #once_flag #exception_safety

**Answer:**
Exactly one execution completes successfully; the other callers block until it finishes and then return without calling it. If the active execution throws, the exception propagates to that caller, the flag is not set, and another caller will retry.

**Explanation:**
- Terminology: the call that runs the function is an **active** execution; calls that find it done are **passive**.
- Exceptional executions do not count. Retries continue until one returns normally.
- All active executions on one flag are totally ordered; the completion of the successful one synchronizes-with every passive return.
- `std::once_flag` cannot be copied or moved; one flag per "once" you need. A member `once_flag` gives once-per-object initialization.
- Do not call `call_once` recursively on the same flag from inside the function: it waits for itself, which deadlocks in practice.
- ❌ Common wrong answer: "If it throws, the flag is consumed and initialization never happens." Retry is the specified behaviour.
- ✅ What a strong answer adds: after one-time init, `call_once` fast path is essentially an acquire load on the flag, cheap enough for frequent calls.

**Key takeaway:** call_once guarantees one successful run, waits for it, publishes it, and retries on failure.

---

#### Q16: Function-local static (magic static) or std::call_once for lazy initialization? How is the static made thread-safe?
**Difficulty:** #advanced
**Category:** #concurrency #initialization
**Concepts:** #magic_statics #singleton #guard_variable

**Answer:**
Since C++11, initializing a block-scope static is thread-safe: one thread constructs it, others wait, a throwing constructor is retried. Prefer it to build one object lazily; use call_once for arbitrary one-time actions or per-object initialization.

**Explanation:**
- `const Config& config() { static const Config c = load(); return c; }` is the idiomatic thread-safe lazy singleton.
- Implementation (GCC/Clang Itanium ABI): a guard variable; fast path is an acquire load of the guard byte and a branch; slow path `__cxa_guard_acquire`/`__cxa_guard_release` with a lock and wait.
- Retry: if the initializer throws, the static is not initialized and the next call tries again (same as `call_once`).
- Recursive initialization of the same static from its own initializer: undefined behaviour (deadlock or exception in practice).
- `call_once` is better when: the work is not "construct this object" (registering handlers, initializing a C library), you need once per object (`once_flag` member), or the state lives in members/globals.
- Destruction order of the static at exit can still bite (use after destruction from other statics or detached threads).
- ❌ Common wrong answer: "Function statics need a mutex for thread safety." Not since C++11, unless compiled with `-fno-threadsafe-statics`.
- ✅ What a strong answer adds: in a latency-critical loop, even the guard check costs a load and branch; hoist the reference out of the loop.

**Key takeaway:** Magic statics are the simplest correct lazy init; call_once covers what a single static cannot.

---

#### Q17: How would you implement double-checked locking for a shared, expensive object, and what makes it correct or broken?
**Difficulty:** #advanced
**Category:** #concurrency #initialization
**Concepts:** #double_checked_locking #acquire_release #publication

**Answer:**
Check an atomic pointer with an acquire load; if null, lock a mutex, recheck, construct, and publish with a release store. It is broken with a plain pointer, because a reader can see a non-null pointer before seeing the object's constructed fields.

**Explanation:**
```cpp
#include <atomic>
#include <mutex>

struct Expensive { int value = 42; };

std::atomic<Expensive*> instance{nullptr};
std::mutex init_mutex;

Expensive* get() {
    Expensive* p = instance.load(std::memory_order_acquire);   // fast path
    if (!p) {
        std::lock_guard lock(init_mutex);
        p = instance.load(std::memory_order_relaxed);          // recheck under lock
        if (!p) {
            p = new Expensive();
            instance.store(p, std::memory_order_release);      // publish
        }
    }
    return p;
}

int main() { return get()->value == 42 ? 0 : 1; }
```
- The release store synchronizes-with an acquire load that sees the pointer, so the constructor's writes happen-before the reader's use.
- With a plain `Expensive*`: data race on the pointer (UB), and the compiler or CPU may let other threads observe the pointer before the fields.
- The relaxed recheck is fine under the mutex because only threads holding the mutex store to `instance`.
- In practice, a magic static or `call_once` does the same thing with less room for error.
- ❌ Common wrong answer: "Checking twice with a mutex is enough." Without atomics and ordering on the first check, the pattern is a data race.
- ✅ What a strong answer adds: DCLP is exactly what compilers generate for magic statics; write it by hand only when you need custom behaviour (e.g. resettable instances).

**Key takeaway:** Double-checked locking works only with an atomic pointer published by release and read by acquire.
