## TOPIC: C++26 std::execution - Senders, Receivers, and Structured Concurrency

### INTERVIEW_QA: Comprehensive Questions

#### Q1: What problem does std::execution (P2300) solve that C++ didn't have a standard answer for before C++26?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** It gives C++ a standard, composable, low-allocation vocabulary for asynchronous and parallel work - something `std::future`, raw callbacks, and C++20 coroutines each addressed only partially.

**Why the earlier tools fell short:**
1. **`std::future`/`std::async`**: no standard `.then()`, `get()` blocks, typically heap-allocates shared state, no cancellation
2. **Raw callbacks**: no standard shape for errors or cancellation, ad hoc composition
3. **C++20 coroutines**: great suspension syntax, but no standard scheduler/executor to plug into - every project invented its own

**What `std::execution` adds:** senders (lazy descriptions of work), receivers (structured value/error/stopped completion), schedulers (the "where"), and a set of standard adaptors (`then`, `when_all`, `on`, `sync_wait`) that compose without heap allocation being required.

**Key Concept:** #std_execution #p2300 #async #cpp26

</details>

---

#### Q2: What is a "sender," precisely, and why is laziness central to the design?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** A sender is a value that *describes* an asynchronous or synchronous operation and its possible completions, without performing any of it until something else drives it.

**The laziness parallel to ranges:**
```cpp
auto v = std::views::transform(data, f);   // describes, doesn't iterate
ex::sender auto s = ex::then(ex::schedule(sched), f);  // describes, doesn't run
```

Just as building a `views::transform` pipeline doesn't touch any elements, building a sender pipeline doesn't run any code. Work only begins once a receiver is connected and `start()` is called (typically via an algorithm like `sync_wait`).

**Why this matters:** laziness lets senders be composed, stored, passed around, and combined with other senders as ordinary values - and lets `connect()` allocate the operation state on the stack instead of the heap, since nothing has to run "right away."

**Key Concept:** #sender #laziness #zero_allocation

</details>

---

#### Q3: Describe the sender / receiver / operation-state relationship in your own words.

<details>
<summary><b>Show Answer</b></summary>

**Answer:** A **sender** describes work; a **receiver** is the completion handler that will be told how the work turned out; **connecting** the two produces an **operation state** that owns whatever resources the run needs; **starting** the operation state actually begins execution.

**Three-step model:**
```
sender  --connect(receiver)-->  operation_state  --start()-->  running
(recipe)                        (pan loaded)                   (on the stove)
```

**Why split into three steps instead of just "run this callback now":** separating description from execution lets senders be inspected, composed, and reused before committing to running them, and lets the operation state's storage be placed wherever the caller wants (stack frame, embedded in another object) rather than forcing a heap allocation per async operation.

**Key Concept:** #sender #receiver #operation_state #connect_start

</details>

---

#### Q4: What are the three completion channels every operation reports through, and why three instead of the two `std::future` has?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** `set_value(...)` (success), `set_error(...)` (failure), and `set_stopped()` (cancelled) - exactly one fires, exactly once, per operation.

**Contrast with `std::future`:**
- `future` only distinguishes "has a value" from "holds an exception" via `.get()`
- There is no first-class cancellation signal for a future at all

**Why a third channel matters:** structured concurrency needs a way to say "this was deliberately stopped, not merely successful or failed" so that constructs like `when_all` can request cooperative cancellation of sibling operations and know when they've actually wound down, rather than treating "stopped" as just another kind of error.

**Key Concept:** #set_value #set_error #set_stopped #cancellation

</details>

---

#### Q5: What does a "scheduler" represent in this model, and how is `schedule()` different from calling a thread pool's `submit()` directly?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** A scheduler answers "where does this work run?" - `schedule(sched)` turns that answer into a sender that completes on `sched`, rather than immediately submitting a callback.

**Comparison:**
| | `pool.submit(callable)` | `ex::schedule(sched)` |
|---|---|---|
| Returns | usually a future, or nothing | a composable sender |
| Composability | must nest/block | chains via `then`, `when_all`, etc. |
| Genericity | tied to one pool's API | any type modeling `scheduler` |

Because a scheduler is a first-class, copyable value rather than an API call, generic code can be written over `scheduler auto` and swap in a thread pool, an inline scheduler (for tests), or a GPU/accelerator context without changing the sender pipeline's shape.

**Key Concept:** #scheduler #schedule #executor_replacement

</details>

---

#### Q6: Explain what `when_all` does and precisely when it completes relative to its inputs.

<details>
<summary><b>Show Answer</b></summary>

**Answer:** `when_all` runs multiple senders concurrently and completes once ALL of them have reported back - it is structured fan-out/fan-in, not a "first one wins" race.

**Key subtlety:** if one branch fails (`set_error`), `when_all` requests cancellation of the other still-running branches, but it does not complete the whole operation until every branch has actually finished (successfully, with an error, or by reporting `set_stopped`). This avoids leaving orphaned background work running after the enclosing operation has "moved on" - the core guarantee of structured concurrency.

**Common misconception:** assuming `when_all` returns "as soon as the first thing fails." It does not - it waits for orderly shutdown of every branch first.

**Key Concept:** #when_all #structured_concurrency #fan_out_fan_in

</details>

---

#### Q7: If code inside a `then()` callback throws an exception, what actually happens to it?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** The exception is captured and delivered through the `set_error` completion channel as data - it does not propagate up the call stack the way a normal synchronous throw would.

**Why this surprises people:**
```cpp
ex::sender auto s = ex::then(ex::schedule(sched), [] {
    throw std::runtime_error("boom");
    return 1;
});
```
Whether the exception is ever "seen" as a C++ exception again depends entirely on the connected receiver. `sync_wait` happens to rethrow it on the calling thread, so wrapping `sync_wait` in try/catch works - but a custom receiver that doesn't act on `set_error`, or a fire-and-forget operation with no rethrowing consumer, will simply lose the error silently.

**Key Concept:** #set_error #exceptions #error_channel

</details>

---

#### Q8: How does `std::execution` relate to C++20 coroutines - are they competing models?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** They're complementary layers, not competitors. Coroutines (C++20) give you the *syntax* for suspension (`co_await`/`co_return`); `std::execution` (C++26) gives you the standard *library* vocabulary - schedulers, senders, receivers - that a coroutine's `task<T>` type can plug into.

**Before C++26:** every project that wanted coroutine-based async code had to also hand-roll its own scheduler/executor abstraction, so different libraries' `task<T>` types were mutually incompatible even though they used the same language feature.

**After C++26:** a sender is awaitable (`co_await`-able), so coroutine bodies can read sequentially while still going through the same standard scheduling/cancellation machinery underneath - and different libraries' coroutine types can share that one vocabulary instead of reinventing it.

**Key Concept:** #coroutines #complementary #task_type

</details>

---

#### Q9: Why did it take so long for C++ to get a standard asynchrony model like this?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** P2300 is the product of years of iteration on prior art, not a first attempt - earlier "executors" proposals (going back to P0443 and its predecessors) went through multiple redesigns before the committee converged on senders/receivers as general enough to unify CPU thread pools, GPU/accelerator scheduling, and coroutine integration under one set of concepts.

**Influential prior art:**
- Meta's Folly `Future`/`SemiFuture` explored continuation composition at production scale
- **libunifex** was an experimental sender/receiver implementation that served as a proving ground for the P2300 design
- HPC task-scheduling libraries (e.g. HPX) informed the "scheduler as a swappable first-class value" idea

**Honest caveat:** this is a large, still-settling piece of the standard library as C++26 finalizes - expect some algorithm names and corner-case semantics to keep firming up as vendors ship their first implementations.

**Key Concept:** #p2300 #design_history #libunifex #folly

</details>

---

#### Q10: What's the difference between `connect()` and `start()`, and why isn't there just one combined "run this now" function?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** `connect(sender, receiver)` wires a specific completion handler to a sender and materializes the storage (the operation state) needed to run it - it does not begin execution. `start(operation_state)` is the separate step that actually begins the work.

**Why split them:** separating "wire it up" from "go" lets the operation state be constructed in a specific location (e.g. on the caller's stack frame) before anything runs, which is what makes zero-allocation async pipelines possible - if `connect` immediately started the operation, there'd be no window to place/store the operation state deliberately before execution begins.

**Analogy:** `connect` is assembling ingredients into a pan; `start` is turning on the stove.

**Key Concept:** #connect #start #operation_state #zero_allocation

</details>

---

#### Q11: What happens if you call `sync_wait` on the same sender value twice?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** The described work runs again, independently, for the second call - a sender is a reusable description, not a one-shot ticket that gets consumed or invalidated by driving it once.

**Why:** each `sync_wait` call performs its own `connect()` + `start()` against the same sender value, producing a brand-new operation state each time. There is no built-in memoization of a prior run's result.

**Practical implication:** if you actually want to reuse a previously computed result rather than recompute it, you need to extract the VALUE from the first run and pass that value forward - not re-drive the same sender expecting it to "remember."

**Key Concept:** #reusable_sender #no_memoization #sync_wait

</details>

---

#### Q12: Name one real-world danger of blocking calls inside sender continuations that isn't really about senders/receivers at all, but about scheduler design.

<details>
<summary><b>Show Answer</b></summary>

**Answer:** A blocking call (synchronous I/O, a long-held lock) inside a `then()` running on a fixed-size thread-pool scheduler ties up one of that pool's limited worker threads for the whole blocking duration - starving every OTHER piece of work scheduled on that same pool, even work completely unrelated to the blocking call.

**Why it's not really a senders/receivers problem:** this is the same "don't block a shared worker pool" hazard that exists for any thread-pool-based system (raw `submit()`-based executors have it too) - the sender/receiver model doesn't cause it, but it also doesn't automatically protect you from it, since schedulers are still backed by finite real resources.

**Mitigation:** route blocking work onto a scheduler explicitly sized/dedicated for blocking I/O, and hop back to a CPU-bound scheduler for the rest of the pipeline via `on(...)`.

**Key Concept:** #blocking #shared_scheduler #thread_starvation

</details>

---
