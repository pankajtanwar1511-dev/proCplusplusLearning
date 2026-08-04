## TOPIC: C++26 std::execution - Senders, Receivers, and Structured Concurrency

### THEORY_SECTION: A Standard Model for Asynchronous and Parallel Work

C++26 adopts **`std::execution`** (proposal **P2300**, "`std::execution`") into the working draft — the first standard-library-level, composable, allocator-aware model for asynchronous and parallel programming in C++. It introduces a small set of vocabulary types — **senders**, **receivers**, **schedulers**, and **operation states** — that let you describe *what* async work should happen and *where* it should run, without committing to a specific threading model, and without needing heap allocation or type erasure on the hot path. This section covers the model as adopted for C++26; some fine-grained naming and a few algorithm signatures were still being refined in later WG21 mailings, so treat exact spelling of lesser-used adaptors as approximate and always check the final wording of your standard library's implementation.

---

#### 1. The Problem: C++ Had No Standard Asynchrony Model

Before C++26, C++ offered three incomplete tools for asynchronous work, and none of them composed well with each other:

**`std::thread` / `std::future` (C++11):**

```cpp
#include <future>

std::future<int> f = std::async(std::launch::async, [] {
    return compute_expensive_result();
});

// Problems:
// 1. std::async's launch policy is unspecified by default - may run synchronously!
// 2. future::get() BLOCKS - no way to "continue" without blocking a thread
// 3. No .then()/continuation support in the standard (only in some libraries)
// 4. Every future/promise pair typically allocates on the heap
// 5. Destroying a future from std::async blocks until the task finishes -
//    a well-known footgun
int result = f.get();  // blocks the calling thread
```

**Callback-based APIs:**

```cpp
// "Callback hell" - nesting grows with each async step
fetch_data(url, [](Data data) {
    process(data, [](Result result) {
        save(result, [](bool ok) {
            if (!ok) {
                // Where do errors from fetch_data or process surface?
                // Usually: ad-hoc, inconsistent, per-API error handling.
            }
        });
    });
});
// No standard shape for "this callback chain was cancelled"
// No standard shape for "this callback threw/failed"
// Composing two independently-written callback APIs requires custom glue code
```

**C++20 coroutines alone:**

```cpp
// Coroutines (C++20) give you syntax for suspension...
task<int> compute() {
    co_return co_await some_async_operation();
}
// ...but the STANDARD LIBRARY provides no scheduler, no thread pool,
// no "run this coroutine on this executor" abstraction. Every library
// (or every project) invents its own task<T>, its own thread pool,
// and its own way to plug them together. Coroutines standardized the
// LANGUAGE mechanism for suspension, not the LIBRARY vocabulary for
// "where and how" work executes.
```

**Comparison table:**

| Approach | Composable? | Structured cancellation? | Allocation | Standardized "where it runs"? |
|---|---|---|---|---|
| `std::future` (`std::async`) | Poor — `.then()` not standard | No | Typically heap (shared state) | No (launch policy is a coarse hint) |
| Raw callbacks | Ad hoc, manual glue per API | No standard shape | Depends on API | No |
| C++20 coroutines alone | Good syntax, no stdlib wiring | Depends on hand-rolled `task` type | Depends on hand-rolled `task` type | No — no standard scheduler concept |
| **`std::execution` (C++26)** | **Yes — senders compose via adaptors** | **Yes — `set_stopped` is first-class** | **Can be zero-allocation** | **Yes — schedulers are the "where"** |

`std::execution` is the library-level piece that was missing: a small set of concepts general enough to describe "run this on a thread pool, then transform the result, then join with this other piece of work, then report completion" — all as a static, composable *value* — while coroutines remain the syntax you can optionally layer on top.

---

#### 2. Core Vocabulary: Senders, Receivers, and Operation States

**A sender describes work; it does not perform it.**

A **sender** is a value that *describes* an asynchronous (or synchronous) operation and its possible completions, without starting anything. This is the same laziness principle as C++20 ranges: a `views::transform(v, f)` doesn't iterate `v` — it describes a transformation to apply when *something else* drives iteration. Similarly, a sender describes an operation to run when *something else* starts it.

```cpp
#include <execution>  // exposition; exact header/namespace may vary by implementation
namespace ex = std::execution;

// `schedule` on a scheduler returns a sender - nothing has run yet.
ex::sender auto s = ex::schedule(my_scheduler);

// `then` returns a NEW sender describing "run s, then apply this function"
ex::sender auto s2 = ex::then(s, [] { return 42; });

// Still nothing has executed! s2 is just a description of future work.
```

**A receiver is how a sender reports its outcome.**

A **receiver** is the "other end" of a sender — an object with (conceptually) three completion channels:

```cpp
// Conceptual shape of the receiver contract (simplified):
struct my_receiver {
    void set_value(auto&&... vals) &&;   // the operation succeeded with these value(s)
    void set_error(auto&& err) &&;       // the operation failed with this error
    void set_stopped() &&;               // the operation was cancelled/stopped
};
```

Exactly one of these three completion signals fires, exactly once, for any operation. This tri-state completion contract (value / error / stopped) is stricter and more structured than `std::future`, which only distinguishes "has a value" from "holds an exception" and has no first-class cancellation signal at all.

**Connecting a sender and a receiver produces an operation state.**

```cpp
// ex::connect binds a sender to a receiver, producing an "operation state"
auto op_state = ex::connect(s2, my_receiver{});

// The operation state OWNS the resources needed to run the operation.
// Nothing has happened yet - connect() only WIRES things together.

ex::start(op_state);  // <-- THIS is what actually begins the work
```

**Why the three-step split (sender → connect → start) matters:**

| Step | What happens | Analogy |
|---|---|---|
| Build a sender (`schedule`, `then`, ...) | Describe the work, allocate nothing extra | Writing a recipe |
| `connect(sender, receiver)` | Bind a specific completion handler, materialize storage | Assembling ingredients into a pan |
| `start(operation_state)` | Begin execution | Turning on the stove |

Because the description (sender) is separate from the execution (`start`), senders can be composed, stored, passed around, and inspected *before* committing to running them — and because `connect` can allocate the operation state on the caller's stack frame (not the heap), whole pipelines can run with **zero dynamic allocation**, which was a hard design requirement of P2300 for use in embedded and high-performance contexts.

---

#### 3. Schedulers: The Abstraction for "Where" Work Runs

A **scheduler** answers the question every threading API eventually has to answer: *where* does this piece of work actually execute?

```cpp
namespace ex = std::execution;

ex::scheduler auto pool_sched  = thread_pool.get_scheduler();
ex::scheduler auto inline_sched = ex::inline_scheduler{};   // runs on the calling thread
ex::scheduler auto gpu_sched   = my_gpu_context.get_scheduler(); // conceptual - vendor-defined

// schedule() turns a scheduler into a sender that completes ON that scheduler
ex::sender auto work = ex::schedule(pool_sched);
```

This is a strictly more composable replacement for handing a callable directly to a thread pool's `submit()`/`enqueue()` method: a scheduler is a first-class, copyable, comparable value that can be threaded through generic algorithms, stored in variables, and swapped out (e.g. "run on the GPU scheduler in release builds, the inline scheduler in unit tests") without touching the code that builds the sender pipeline.

**Comparison: raw executor `submit()` vs. `schedule()`:**

| | Raw thread-pool `submit(callable)` | `schedule(scheduler)` |
|---|---|---|
| Return value | Usually a `future`, or nothing | A **sender** — composable with `then`, `when_all`, etc. |
| Composability | Must nest callbacks or block on future | Chain via sender adaptors, no blocking |
| Swappable "where" | Tied to a specific pool's API | Any type modeling `scheduler` — thread pool, inline, SIMD/GPU context |
| Generic algorithms | Hard to write against arbitrary pools | Algorithms can be written generically over `scheduler auto` |

---

#### 4. Composing Work: Sender Adaptors and Algorithms

The real power of the model is that senders compose through a set of standard adaptors, building up a pipeline that is only a *description* until something drives it.

**`then` — transform a completion value:**

```cpp
ex::sender auto s = ex::then(
    ex::schedule(pool_sched),
    [] { return 21; }
);
// s completes with the value 21, on pool_sched
```

**`when_all` — structured fan-out / fan-in:**

```cpp
// Run two independent pieces of work concurrently, and join their results
// only once BOTH have completed (structured concurrency: no dangling work).
ex::sender auto both = ex::when_all(
    ex::then(ex::schedule(pool_sched), [] { return compute_a(); }),
    ex::then(ex::schedule(pool_sched), [] { return compute_b(); })
);
// `both` completes with a tuple-like (a_result, b_result) once both finish.
// If either fails, the whole operation reports that error - and the
// implementation propagates cancellation to the sibling that's still running.
```

**Scheduling part of a pipeline onto a specific scheduler (`on` / scheduling adaptors):**

```cpp
// Conceptual: run the first part on the CPU pool, then hop to a GPU scheduler
// for the second stage, then hop back to the CPU pool to finalize.
ex::sender auto pipeline =
    ex::on(cpu_pool_sched,
        ex::then(ex::schedule(cpu_pool_sched), [] { return load_input(); }))
    | ex::let_value([&](auto input) {
          return ex::on(gpu_sched,
              ex::then(ex::schedule(gpu_sched),
                       [input] { return run_on_gpu(input); }));
      })
    | ex::then([](auto gpu_result) { return finalize(gpu_result); });
```

**`sync_wait` — bridging back into synchronous code:**

```cpp
int main() {
    ex::sender auto pipeline =
        ex::then(ex::schedule(pool_sched), [] { return 21; })
      | ex::then([](int x) { return x * 2; });

    // sync_wait BLOCKS the calling thread until the sender completes,
    // and unpacks the result (or rethrows the error) - this is the
    // one place the model intentionally reintroduces blocking, so
    // synchronous entry points (like main) can drive an async graph.
    auto result = ex::sync_wait(pipeline);   // result holds 42 (wrapped, e.g. in optional<tuple<int>>)
}
```

**Worked pipeline summary table:**

| Adaptor | Purpose | Roughly analogous to |
|---|---|---|
| `schedule(sched)` | Produce a sender that completes on `sched` | "submit a no-op to this executor" |
| `then(sender, fn)` | Transform the value channel | `future::then` / `.map()` |
| `when_all(s1, s2, ...)` | Join concurrent senders, structured | `std::when_all` for futures, but cancellation-aware |
| `let_value(sender, fn)` | Use a value to build the *next* sender dynamically | monadic bind / `and_then` |
| `on(sched, sender)` | Force part of the chain to run on `sched` | "hop to this executor" |
| `sync_wait(sender)` | Block and extract the result synchronously | `future::get()` |

---

#### 5. Cancellation and Errors Are First-Class, Not an Afterthought

`std::future` has exactly one non-value outcome: an exception captured in the shared state, observed when you call `.get()`. There is no standard way to say "cancel this" and have it propagate through a chain of futures.

`std::execution` bakes **three** completion channels into the contract from the start:

```cpp
// Every operation in the model completes via exactly one of:
//   set_value(receiver, values...)   -> success
//   set_error(receiver, error)       -> failure (not necessarily an exception!)
//   set_stopped(receiver)            -> cancelled, no value, no error
```

This matters for structured concurrency: when `when_all` joins two senders and one of them calls `set_error`, the model can propagate a stop request to the sibling operation that's still running, and wait for it to unwind via `set_stopped` — rather than leaving orphaned work running after the enclosing scope has "moved on," which is exactly the class of bug structured-concurrency designs (and `std::jthread`'s `stop_token` in C++20) are meant to eliminate.

```cpp
ex::sender auto risky = ex::then(ex::schedule(pool_sched), [] {
    if (something_went_wrong()) throw std::runtime_error("failed");
    return 42;
});

// The thrown exception is captured and delivered via set_error - NOT
// left to propagate through arbitrary stack frames the way it would
// on a detached std::thread.
auto result = ex::sync_wait(risky);  // sync_wait rethrows on the error channel
```

---

#### 6. Relationship to C++20 Coroutines: Complementary, Not Competing

A key design goal of P2300 was that **senders are awaitable**. Any sender can (conceptually) be used with `co_await` inside a C++20 coroutine, which means you get sequential-looking async code with the cancellation and scheduling guarantees of the sender model underneath:

```cpp
ex::task<int> compute_pipeline(ex::scheduler auto sched) {
    // co_await on a sender - suspends the coroutine, resumes on completion
    int a = co_await ex::schedule(sched) | ex::then([] { return compute_a(); });
    int b = co_await ex::schedule(sched) | ex::then([] { return compute_b(); });
    co_return a + b;
}
```

The relationship is layered, not competing:

| Layer | Provides | Example |
|---|---|---|
| C++20 coroutines (language) | Suspend/resume syntax (`co_await`, `co_return`) | `task<int>` bodies |
| `std::execution` (library, C++26) | Senders/receivers/schedulers — the "engine" a coroutine can plug into | `ex::schedule`, `ex::then`, thread pools |

Before C++26, every project that wanted coroutine-based async code had to *also* invent its own scheduler/executor abstraction by hand. `std::execution` standardizes that missing piece, so coroutine-based `task<T>` types across different libraries can share the same underlying scheduling vocabulary instead of each reinventing it incompatibly.

---

#### 7. Why This Took So Long: Design History and Prior Art

`std::execution` did not appear from nothing — P2300 is the product of years of iteration, informed by production experience with earlier asynchrony libraries:

- **Folly's `Future`/`SemiFuture`** (Meta) explored continuation-based composition at scale in production C++.
- **libunifex** (Facebook/Meta) was an experimental implementation of an earlier sender/receiver design and served as a proving ground for the P2300 model.
- **HPX** and other HPC task-scheduling libraries informed the "scheduler as a first-class, swappable value" design.
- Earlier executor proposals (the long-running "executors" work, e.g. P0443 and its predecessors) went through multiple redesigns across several standards cycles before the committee converged on the sender/receiver formulation as the one general enough to unify CPU thread pools, GPU/accelerator scheduling, and coroutine integration under one set of concepts.

Be honest with yourself (and readers) that this is a genuinely large, still-settling piece of the standard library: expect implementation quality, exact algorithm names, and some corner-case semantics to keep firming up as compiler vendors ship their first conforming implementations after C++26 is finalized.

---

#### 8. Summary Table: The Core Concepts

| Concept | Role | Rough analogy |
|---|---|---|
| **Sender** | A lazy, composable *description* of an async operation and its possible completions | A lazy range / a recipe |
| **Receiver** | The completion callback interface (`set_value` / `set_error` / `set_stopped`) | A structured, tri-state callback |
| **Operation state** | The (often stack-allocated) object produced by connecting a sender to a receiver; owns resources for the run | A pan with ingredients loaded, not yet on the stove |
| **Scheduler** | An abstraction for *where* work executes; `schedule()` turns it into a sender | An executor / thread pool handle, but composable |
| **`then`, `when_all`, `let_value`, `on`, `sync_wait`** | Standard adaptors for composing senders declaratively | `.map()`/`.join()`/`.flatMap()`-style combinators, plus a sync bridge |

**Key takeaway:** `std::execution` gives C++26 what it never had — a single, standard, composable, low-allocation vocabulary for "describe async work, choose where it runs, compose it with other async work, and know precisely how it succeeds, fails, or gets cancelled," with C++20 coroutines available as an optional, complementary syntax layered on top rather than a competing model.

---

#### 9. Compile-Time vs Runtime Breakdown

The single most important thing to internalize about senders/receivers is *when* each piece of work actually happens. Almost everything up to `start()` is pure compile-time template machinery — the "async" part hasn't begun yet.

| Code / Mechanism | Phase | What Happens |
|---|---|---|
| `schedule(sched) \| then(f) \| then(g)` pipeline construction | Compile time | Builds a nested, statically-typed sender type via templates (`then_sender<then_sender<schedule_sender, F>, G>`) — zero work is done, zero bytes are allocated |
| `std::execution::connect(sender, receiver)` | Compile time (size computed) | The compiler walks the nested sender type and computes the exact total size of the operation state needed for the *entire* chain — every intermediate result slot, every captured lambda, laid out end-to-end |
| The returned operation-state object | Compile time (type), Runtime (storage) | Its *type and size* are fixed by the compiler; the actual bytes are reserved wherever the caller places it (almost always a local variable, i.e. the stack) |
| `start(op_state)` | Runtime | Scheduling actually begins — the first sender in the chain is submitted to its scheduler (e.g. a thread pool's work queue) |
| Each `then(f)` callback body | Runtime | `f` actually executes on a worker thread, reading the previous stage's result out of the operation state and writing its own result back into it |
| `set_value` / `set_error` / `set_stopped` on the receiver | Runtime | The terminal completion signal fires, unblocking `sync_wait` (or invoking whatever continuation follows) |

Nothing about `schedule | then | then` "runs" in the way a function call runs — it is closer to how building a `std::ranges::filter_view | std::ranges::transform_view` chain is compile-time type composition, not iteration. The iteration (here, the actual async execution) only happens once something drives it — `start()`, typically invoked indirectly via `sync_wait`.

---

#### 10. Memory Model: Stack-Allocated Operation States vs. Heap-Allocated Futures

This is the concrete payoff of "everything is a compile-time-sized type": the entire pipeline's storage requirement is a single, fixed number known before any code runs, so it can live on the **stack** of whichever function starts the pipeline — no heap, no allocator, no atomic reference count.

```
std::execution (C++26) — operation state lives on the caller's stack
┌───────────────────────────────────────────────────────────┐
│ STACK FRAME of sync_wait(pipeline)                         │
│                                                             │
│  OperationState<ScheduleSender, ThenF, ThenG> {             │
│      scheduler_handle   sched_info;      // from schedule() │
│      int                stage1_result;   // written by F    │
│      ThenFCallback      f;               // captured lambda │
│      int                stage2_result;   // written by G     │
│      ThenGCallback      g;               // captured lambda │
│  }                          ← ONE contiguous block, sized    │
│                                at compile time, zero heap    │
└───────────────────────────────────────────────────────────┘

std::future / std::promise (pre-C++26) — shared state on the heap
┌────────────────────┐                    ┌────────────────────┐
│ Producer thread     │                    │ Consumer thread     │
│ stack frame          │                    │ stack frame          │
│  promise<int> p; ────┼──── points to ────┼──▶ future<int> f;    │
└────────────────────┘        │             └────────────────────┘
                               ▼
                    ┌─────────────────────────┐
                    │ HEAP: shared_state<int>  │  ← new-allocated
                    │  value / exception slot  │     once per task
                    │  atomic<int> refcount    │  ← atomic inc/dec
                    │  condition_variable       │     on every copy
                    └─────────────────────────┘     of future/promise
```

**Why this matters for low latency:** because the compiler knows the whole chain's shape up front, it can size and place the operation state as an ordinary local — the same category of storage as an `int` or a small `struct` on the stack. There is no per-task `new`, no atomic refcount traffic, and no condition-variable wakeup path unless you explicitly ask for one (e.g. via `sync_wait`). That is precisely why `std::execution` is viable in latency-sensitive domains — trading systems, real-time audio/video pipelines, game engines — where `std::future`'s mandatory heap allocation and atomic bookkeeping per asynchronous task is disqualifying, not just "a bit slower."

---

### EDGE_CASES: Pitfalls in the Senders/Receivers Model

#### Edge Case 1: Senders Are Lazy - Building a Pipeline Does Nothing

```cpp
namespace ex = std::execution;

void log_and_save(std::string msg) {
    ex::sender auto s =
        ex::then(ex::schedule(pool_sched), [msg] {
            std::cout << "Logging: " << msg << '\n';
            write_to_disk(msg);
        });

    // BUG: the developer assumes the log line has been printed and the
    // file has been written by the time this function returns, because
    // "the code to do it" was written above. It has NOT run.
    // `s` is just a value describing the work - nothing executes until
    // something connects a receiver and calls start() (e.g. via
    // sync_wait, or by handing `s` to a caller that eventually drives it).
}   // <-- s is destroyed here, and the described work may NEVER run at all
```

**Why it's surprising:** every other line of ordinary C++ in the function body above `s` runs immediately, top to bottom. A sender looks like an ordinary expression but behaves like an unevaluated lambda - the asymmetry is the single most common source of confusion for people new to the model, exactly as `std::views::transform(v, f)` not iterating anything is the equivalent trap in ranges.

---

#### Edge Case 2: A Constructed-But-Never-Started Sender Silently Loses Work

```cpp
void fire_and_forget_bug() {
    // Looks like "start a background task and move on":
    ex::then(ex::schedule(pool_sched), [] { do_important_cleanup(); });
    // No connect(), no start(), no sync_wait() - the sender is a temporary
    // that gets destroyed at the semicolon. do_important_cleanup() NEVER RUNS.
}
```

Because this class of bug is so easy to write by accident, many implementations mark the sender-producing functions `[[nodiscard]]` so the compiler warns on a sender expression whose result is thrown away unused - conceptually similar to a discarded `std::future` from `std::async`, except `std::future`'s destructor at least still runs the task; a never-started sender's operation may not run *at all*.

---

#### Edge Case 3: `when_all` Error Propagation to Still-Running Siblings

```cpp
ex::sender auto both = ex::when_all(
    ex::then(ex::schedule(pool_sched), [] {
        std::this_thread::sleep_for(500ms);
        return slow_but_safe_result();          // finishes second
    }),
    ex::then(ex::schedule(pool_sched), [] {
        throw std::runtime_error("fast failure"); // finishes first, and fails
    })
);

auto r = ex::sync_wait(both);
// The FAST sender's error surfaces at sync_wait. The SLOW sender is still
// mid-flight when that error fires - when_all requests it stop (a
// set_stopped completion is expected from it), and when_all does NOT
// complete the whole operation until BOTH siblings have reported back,
// even though only one of them succeeded. Beginners often assume
// when_all returns "as soon as the first error happens" - it does not;
// it waits for orderly shutdown of every branch first.
```

---

#### Edge Case 4: Scheduler Affinity Does Not "Snap Back" Automatically

```cpp
void surprising_thread(ex::scheduler auto gpu_sched) {
    ex::sender auto pipeline =
        ex::schedule(gpu_sched)
      | ex::then([] {
            std::cout << "Running on GPU-adjacent thread: "
                      << std::this_thread::get_id() << '\n';
            return heavy_gpu_result();
        })
      | ex::then([](auto result) {
            // BUG (assumption): "surely we're back on the main/original
            // thread by now, since we called this from main()".
            // Reality: unless the pipeline explicitly `on(original_sched, ...)`
            // hops back, this continuation still runs on gpu_sched's
            // completion context. Thread affinity is EXPLICIT in this
            // model, never implicit - unlike some other futures/promise
            // ecosystems that resume "back where you called .then()".
            touch_ui_state(result);   // may be UNSAFE if this must run on the UI thread!
        });
}
```

---

#### Edge Case 5: Blocking a Shared Scheduler's Worker Thread Stalls Unrelated Work

```cpp
// pool_sched is backed by a FIXED-SIZE thread pool (say, 4 worker threads)
ex::sender auto bad = ex::then(ex::schedule(pool_sched), [] {
    // BUG: a genuinely blocking call (synchronous socket read, blocking
    // file I/O, a mutex held for a long time) occupies one of only 4
    // worker threads for its entire duration.
    std::string data = blocking_network_read();   // ties up a pool thread
    return data;
});

// Every OTHER sender scheduled on pool_sched - including completely
// unrelated work submitted from elsewhere in the program - now has one
// fewer worker thread available, and if enough blocking calls pile up,
// the pool can deadlock or starve even though nothing is "wrong" with
// any single piece of work in isolation.
```

---

#### Edge Case 6: Exceptions Inside `then` Become `set_error`, Not a Propagating Throw

```cpp
ex::sender auto s = ex::then(ex::schedule(pool_sched), [] {
    throw std::runtime_error("boom");
    return 1;
});

// BUG (assumption): "I can wrap sync_wait in a try/catch right where I
// call it and that's equivalent to a normal synchronous throw."
// This part is actually TRUE for sync_wait specifically (it re-throws on
// its calling thread) - but if this same sender were instead connected
// to a custom receiver, or consumed by an adaptor that doesn't rethrow,
// the exception is captured and delivered through set_error() as DATA,
// not as a stack unwind. Code that assumes "throwing == the caller's
// try/catch will always see it" breaks the moment the sender isn't
// terminated by sync_wait - e.g. inside a detached, fire-and-forget
// operation with no receiver that ever rethrows anywhere.
try {
    ex::sync_wait(s);
} catch (const std::exception& e) {
    std::cout << "Caught: " << e.what() << '\n';   // this specific path is fine
}
```

---

#### Edge Case 7: `co_await`-ing a Sender Requires a Compatible Coroutine Environment

```cpp
// Hedge: the exact rules for which promise types/environments a given
// sender can be co_await-ed from are one of the more implementation-
// and-library-dependent corners of the model as of this writing.
ex::task<int> mismatched_environment() {
    // If this coroutine's task type doesn't propagate a compatible
    // scheduler/stop-token environment to the awaited sender, the
    // "runs wherever it wants, cancels however it wants" pieces of the
    // contract can silently fall back to less efficient or less precise
    // behavior instead of a hard compile error - always check your
    // library's documentation for which task/generator types are
    // guaranteed sender-environment-compatible.
    int x = co_await ex::schedule(some_sched) | ex::then([] { return 1; });
    co_return x;
}
```

---

### CODE_EXAMPLES: Practical Senders/Receivers Patterns

#### Example 1: Minimal Pipeline - schedule, then, sync_wait

```cpp
#include <execution>
#include <iostream>

namespace ex = std::execution;

int main() {
    ex::scheduler auto sched = get_some_thread_pool_scheduler();

    ex::sender auto pipeline =
        ex::schedule(sched)
      | ex::then([] { return 21; })
      | ex::then([](int x) { return x * 2; });

    // sync_wait is the one place this model reintroduces blocking, so a
    // plain synchronous main() can drive an asynchronous computation.
    if (auto result = ex::sync_wait(pipeline)) {
        std::cout << "Result: " << std::get<0>(*result) << '\n';  // -> 42
    }
}
```

---

#### Example 2: `when_all` - Structured Concurrent Fan-Out/Fan-In

```cpp
#include <execution>
#include <iostream>

namespace ex = std::execution;

int main() {
    ex::scheduler auto sched = get_some_thread_pool_scheduler();

    ex::sender auto fetch_a = ex::then(ex::schedule(sched), [] {
        return fetch_from_service_a();     // e.g. returns an int
    });
    ex::sender auto fetch_b = ex::then(ex::schedule(sched), [] {
        return fetch_from_service_b();     // e.g. returns a std::string
    });

    ex::sender auto combined = ex::when_all(fetch_a, fetch_b)
        | ex::then([](int a, std::string b) {
              return b + " -> " + std::to_string(a);
          });

    auto result = ex::sync_wait(combined);
    // Both fetch_a and fetch_b run concurrently on the pool; `combined`
    // only completes once BOTH have finished, giving structured
    // concurrency - no dangling background work once main() moves on.
}
```

---

#### Example 3: Hopping Between Schedulers with `on`

```cpp
#include <execution>

namespace ex = std::execution;

auto pipeline(ex::scheduler auto cpu_sched, ex::scheduler auto gpu_sched) {
    return ex::on(cpu_sched, ex::then(ex::schedule(cpu_sched), [] {
               return load_input_from_disk();
           }))
         | ex::let_value([=](auto input) {
               // Explicitly hop to the GPU scheduler for this stage.
               return ex::on(gpu_sched, ex::then(ex::schedule(gpu_sched),
                   [input] { return run_kernel(input); }));
           })
         | ex::let_value([=](auto gpu_result) {
               // Explicitly hop back to the CPU scheduler to finish up.
               return ex::on(cpu_sched, ex::then(ex::schedule(cpu_sched),
                   [gpu_result] { return finalize(gpu_result); }));
           });
    // Every scheduler transition above is explicit and visible in the
    // pipeline's shape - see Edge Case 4 for what happens if you forget one.
}
```

---

#### Example 4: Observing an Error at the `sync_wait` Boundary

```cpp
#include <execution>
#include <iostream>

namespace ex = std::execution;

int main() {
    ex::scheduler auto sched = get_some_thread_pool_scheduler();

    ex::sender auto risky = ex::then(ex::schedule(sched), [] {
        if (!config_is_valid()) {
            throw std::runtime_error("bad configuration");
        }
        return 42;
    });

    try {
        auto result = ex::sync_wait(risky);
        std::cout << "Got: " << std::get<0>(*result) << '\n';
    } catch (const std::exception& e) {
        // sync_wait rethrows whatever arrived on the error channel.
        std::cout << "Pipeline failed: " << e.what() << '\n';
    }
}
```

---

#### Example 5: Sequential-Looking Async Code via Coroutine `co_await`

```cpp
#include <execution>

namespace ex = std::execution;

ex::task<int> compute_pipeline(ex::scheduler auto sched) {
    // Each co_await suspends the coroutine and resumes on completion,
    // while still going through the sender/receiver machinery underneath
    // (scheduling, cancellation, error channel) rather than bespoke
    // hand-rolled continuation glue.
    int a = co_await (ex::schedule(sched) | ex::then([] { return compute_a(); }));
    int b = co_await (ex::schedule(sched) | ex::then([] { return compute_b(); }));
    co_return a + b;
}
```

---

#### Example 6: The Same Task, `std::future` vs. Senders/Receivers

```cpp
// --- Before: std::async / std::future ---
std::future<int> fa = std::async(std::launch::async, fetch_from_service_a);
std::future<std::string> fb = std::async(std::launch::async, fetch_from_service_b);

int a = fa.get();              // blocks
std::string b = fb.get();      // blocks
auto combined_old = b + " -> " + std::to_string(a);
// No standard way to say "cancel fb if fa fails"; each future is an
// independent blocking handle with no shared structured-concurrency story.

// --- After: std::execution ---
namespace ex = std::execution;

ex::sender auto combined_new =
    ex::when_all(
        ex::then(ex::schedule(sched), fetch_from_service_a),
        ex::then(ex::schedule(sched), fetch_from_service_b))
  | ex::then([](int a, std::string b) { return b + " -> " + std::to_string(a); });

auto result = ex::sync_wait(combined_new);
// Both branches run concurrently, are cancellation-aware as a pair, and
// the whole thing composes as one sender value instead of two separate
// blocking handles glued together by hand.
```

---

---

### QUICK_REFERENCE: Senders/Receivers Cheat Sheet

#### Core Vocabulary

| Concept | Role | Analogy |
|---|---|---|
| **Sender** | Lazy, composable description of an async operation and its completions | A recipe / a lazy range |
| **Receiver** | Completion interface: `set_value` / `set_error` / `set_stopped` | A structured, tri-state callback |
| **Operation state** | Result of `connect(sender, receiver)`; owns resources, not yet running | A pan loaded with ingredients, off the stove |
| **Scheduler** | Abstraction for *where* work runs; `schedule()` turns it into a sender | A swappable executor handle |
| `start(op_state)` | Actually begins execution | Turning on the stove |

#### Sender Adaptors at a Glance

| Adaptor | Purpose | Roughly analogous to |
|---|---|---|
| `schedule(sched)` | Sender that completes on `sched` | "submit a no-op" |
| `then(sender, fn)` | Transform the value channel | `.map()` / `future::then` |
| `when_all(s1, s2, ...)` | Structured concurrent join | `std::when_all`, but cancellation-aware |
| `let_value(sender, fn)` | Build the next sender from a value | monadic bind / `and_then` |
| `on(sched, sender)` | Force part of a chain onto `sched` | "hop to this executor" |
| `sync_wait(sender)` | Block and extract the result synchronously | `future::get()` |

#### Completion Contract

```cpp
// Exactly ONE of these fires, exactly once, per operation:
set_value(receiver, values...);   // success
set_error(receiver, error);       // failure (not necessarily std::exception_ptr)
set_stopped(receiver);            // cancelled - no value, no error
```

#### Minimal Pipeline Syntax

```cpp
namespace ex = std::execution;

ex::scheduler auto sched = get_scheduler();

ex::sender auto pipeline =
    ex::schedule(sched)
  | ex::then([] { return 21; })
  | ex::then([](int x) { return x * 2; });

auto result = ex::sync_wait(pipeline);   // blocks main(), unpacks or rethrows
```

#### Three-Step Execution Model

```
build sender  -->  connect(sender, receiver)  -->  start(operation_state)
 (describe)          (wire up, no heap needed)        (actually runs)
```

#### Quick Do/Don't

| Do | Don't |
|---|---|
| Drive every sender to `start`/`sync_wait` (or hand it to a caller that will) | Build a sender and let it fall out of scope unconsumed — the work may never run |
| Use `on(sched, ...)` explicitly for every scheduler hop you need | Assume execution "snaps back" to the original thread automatically |
| Keep blocking calls off shared pool schedulers | Run blocking I/O inside a `then()` on a fixed-size shared pool |
| Treat `set_error` as the normal async failure channel | Assume an exception inside `then()` always unwinds like a synchronous throw |

**Key takeaway:** senders are inert until `start`ed, completions are always exactly one of value/error/stopped, and scheduler placement is always explicit — never implicit — throughout a pipeline.

---

**End of Topic 3: C++26 std::execution**
