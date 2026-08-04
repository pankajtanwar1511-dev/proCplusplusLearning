## TOPIC: C++26 std::execution - Senders, Receivers, and Structured Concurrency

### PRACTICE_TASKS: Sender/Receiver Bug Analysis

#### Q1
```cpp
namespace ex = std::execution;

void backup_database(ex::scheduler auto sched, std::string path) {
    ex::then(ex::schedule(sched), [path] {
        write_backup_file(path);   // Bug: nothing ever drives this sender!
    });
    std::cout << "Backup started for " << path << "\n";
}

int main() {
    backup_database(get_pool_scheduler(), "db.bak");
    std::cout << "Main continuing...\n";
}
```

**Answer:**
```
Only "Backup started..." and "Main continuing..." print. The backup file is never written.
```

**Explanation:**
- `ex::then(...)` builds a sender - a description of work, not the work itself
- The sender is a temporary with no name; it is destroyed at the semicolon
- No `connect()`, `start()`, or `sync_wait()` is ever called on it
- `write_backup_file(path)` never executes, silently
- **Key Concept:** Senders are lazy and inert; constructing one has zero effect until something connects a receiver and calls `start()` (directly or via an algorithm like `sync_wait`)

**Fixed Version:**
```cpp
void backup_database(ex::scheduler auto sched, std::string path) {
    ex::sender auto s = ex::then(ex::schedule(sched), [path] {
        write_backup_file(path);
    });
    ex::sync_wait(s);   // actually drives the work to completion
    std::cout << "Backup started for " << path << "\n";
}
```

---

#### Q2
```cpp
namespace ex = std::execution;

// pool_sched is backed by a fixed 4-thread pool shared by the whole program
ex::sender auto handle_request(ex::scheduler auto pool_sched, std::string url) {
    return ex::then(ex::schedule(pool_sched), [url] {
        std::string body = blocking_http_get(url);   // Bug: real blocking I/O
        return body;
    });
}

int main() {
    auto sched = get_pool_scheduler();
    // 20 requests submitted "concurrently" onto a 4-thread pool
    std::vector<ex::sender auto> work;
    for (int i = 0; i < 20; ++i) work.push_back(handle_request(sched, urls[i]));
    // ...
}
```

**Answer:**
```
The program appears to "hang" or slow to a crawl well before all 20 requests finish, even though nothing is deadlocked.
```

**Explanation:**
- `blocking_http_get` is genuinely blocking, synchronous I/O
- Each in-flight request occupies one of only 4 worker threads for the ENTIRE network round trip
- Once 4 requests are in flight, the other 16 senders cannot even begin running their `then()` body until a thread frees up
- No individual sender is "broken" - the pool is simply oversubscribed by blocking work
- **Key Concept:** A scheduler's worker threads are a shared, finite resource; blocking calls inside sender continuations starve every other piece of work scheduled on the same pool, not just the caller

**Fixed Version:**
```cpp
// Run the blocking call on a scheduler explicitly sized/dedicated for
// blocking I/O (a larger or unbounded "blocking pool"), and hop back to
// the CPU pool afterward for further CPU-bound processing.
ex::sender auto handle_request(ex::scheduler auto io_sched,
                                ex::scheduler auto cpu_sched,
                                std::string url) {
    return ex::on(io_sched, ex::then(ex::schedule(io_sched), [url] {
               return blocking_http_get(url);
           }))
         | ex::let_value([=](auto body) {
               return ex::on(cpu_sched, ex::then(ex::schedule(cpu_sched),
                   [body] { return parse_response(body); }));
           });
}
```

---

#### Q3
```cpp
namespace ex = std::execution;

void render_ui_after_fetch(ex::scheduler auto gpu_sched) {
    ex::sender auto pipeline =
        ex::schedule(gpu_sched)
      | ex::then([] { return run_gpu_computation(); })
      | ex::then([](auto result) {
            // Bug: assumes we're "back" on the UI/main thread by now
            update_ui_widget(result);   // UI toolkit requires this on the UI thread!
        });

    ex::sync_wait(pipeline);
}
```

**Answer:**
```
update_ui_widget may run on a GPU-context worker thread, not the UI thread - undefined/unsafe behavior in most UI toolkits, and no compiler error.
```

**Explanation:**
- `then()` does not implicitly return execution to "wherever you were before"
- Unless the pipeline explicitly hops back with `on(ui_sched, ...)`, the continuation after `gpu_sched`'s work still completes in `gpu_sched`'s execution context
- This is unlike some futures/promise ecosystems that resume `.then()` continuations "back where you called them" - this model is explicit-only
- **Key Concept:** Scheduler affinity never "snaps back" automatically; every hop between execution contexts must be spelled out with `on(scheduler, ...)`

**Fixed Version:**
```cpp
void render_ui_after_fetch(ex::scheduler auto gpu_sched, ex::scheduler auto ui_sched) {
    ex::sender auto pipeline =
        ex::schedule(gpu_sched)
      | ex::then([] { return run_gpu_computation(); })
      | ex::let_value([=](auto result) {
            return ex::on(ui_sched, ex::then(ex::schedule(ui_sched),
                [result] { update_ui_widget(result); }));
        });

    ex::sync_wait(pipeline);
}
```

---

#### Q4
```cpp
namespace ex = std::execution;

void log_config_errors(ex::scheduler auto sched) {
    ex::sender auto s = ex::then(ex::schedule(sched), [] {
        if (!config_is_valid()) throw std::runtime_error("bad config");
        return load_config();
    });

    // Bug: this receiver ignores the error channel entirely
    struct silent_receiver {
        void set_value(auto&&...) && {}
        void set_error(auto&&) && {}   // swallows the error - no log, no rethrow
        void set_stopped() && {}
    };

    auto op = ex::connect(s, silent_receiver{});
    ex::start(op);
}
```

**Answer:**
```
If the config is invalid, the exception is captured as data and silently discarded. No log line, no crash, no visible symptom at all.
```

**Explanation:**
- The thrown exception inside `then()`'s callback is captured and delivered via `set_error`, not left to propagate up the call stack as a normal C++ throw
- Whether that error is ever surfaced depends entirely on what the connected receiver DOES with it
- `sync_wait` happens to rethrow on its calling thread - but a hand-written receiver that ignores `set_error` makes the failure vanish with no trace
- **Key Concept:** An exception inside a sender's operation becomes structured error data (`set_error`), not an automatic stack unwind; a receiver that doesn't act on `set_error` silently discards failures

**Fixed Version:**
```cpp
void log_config_errors(ex::scheduler auto sched) {
    ex::sender auto s = ex::then(ex::schedule(sched), [] {
        if (!config_is_valid()) throw std::runtime_error("bad config");
        return load_config();
    });

    try {
        ex::sync_wait(s);   // rethrows on the error channel instead of swallowing it
    } catch (const std::exception& e) {
        log_error(e.what());
    }
}
```

---

#### Q5
```cpp
namespace ex = std::execution;

ex::sender auto fetch_both(ex::scheduler auto sched) {
    return ex::when_all(
        ex::then(ex::schedule(sched), [] {
            std::this_thread::sleep_for(2s);
            return fetch_from_slow_but_reliable_source();   // finishes second
        }),
        ex::then(ex::schedule(sched), [] {
            throw std::runtime_error("fast source unreachable");  // finishes first, fails fast
        })
    );
}

int main() {
    auto start = std::chrono::steady_clock::now();
    try {
        ex::sync_wait(fetch_both(get_pool_scheduler()));
    } catch (const std::exception&) {
        // Bug (assumption): "when_all fails fast - this should print at ~0s"
    }
    std::cout << (std::chrono::steady_clock::now() - start) << "\n";
}
```

**Answer:**
```
The elapsed time is close to 2 seconds, not near-instant, even though the failing branch fails almost immediately.
```

**Explanation:**
- `when_all` does not complete the moment the FIRST error arrives
- On seeing `set_error` from one branch, it requests cancellation of the other (in-flight) branch, but still waits for that sibling to report back (typically via `set_stopped`) before the whole `when_all` operation completes
- The slow branch here doesn't actually observe/respect a stop request in this snippet, so it simply runs to completion regardless - `when_all` still waits for it
- **Key Concept:** `when_all` joins ALL branches before completing, error or not; it is not a "return as soon as anything fails" race - and branches that don't honor cancellation will still be waited on to finish naturally

**Fixed Version:**
```cpp
// To actually observe fast failure, the slow branch must itself be
// stop-token-aware so it can unwind early instead of running to completion:
ex::sender auto fetch_both(ex::scheduler auto sched) {
    return ex::when_all(
        ex::then(ex::schedule(sched), [](auto stop_token) {
            for (int i = 0; i < 20 && !stop_token.stop_requested(); ++i)
                std::this_thread::sleep_for(100ms);
            return fetch_from_slow_but_reliable_source();
        }),
        ex::then(ex::schedule(sched), [] {
            throw std::runtime_error("fast source unreachable");
        })
    );
}
```

---

#### Q6
```cpp
namespace ex = std::execution;

ex::sender auto s = ex::then(ex::schedule(get_pool_scheduler()), [] {
    return compute_value();
});

int main() {
    auto result = ex::sync_wait(s);
    auto result2 = ex::sync_wait(s);   // calling sync_wait on the SAME sender again
    // No bug here (this one works) - what happens?
}
```

**Answer:**
```
Both calls succeed and independently re-run compute_value() - the sender itself is just a reusable description, not a one-shot handle.
```

**Explanation:**
- `s` is a value describing "schedule, then compute" - it is not consumed or invalidated by driving it once
- Each `sync_wait(s)` independently connects a fresh receiver and starts a fresh operation state
- `compute_value()` genuinely runs twice, once per `sync_wait` call
- **No bug here** - this is intentional: senders can be described once and driven multiple times, exactly like a `std::ranges::view` can be iterated more than once
- **Key Concept:** A sender is a reusable description of work, not a single-use ticket; running it twice via two separate `sync_wait`/`connect`+`start` calls performs the work twice

---

#### Q7
```cpp
namespace ex = std::execution;

ex::sender auto pipeline(ex::scheduler auto sched, int input) {
    return ex::then(ex::schedule(sched), [input] {
        return input * 2;
    });
}

int main() {
    auto sched = get_pool_scheduler();
    // Bug: capturing `sched` by reference in a sender that outlives main's scope
    ex::sender auto s = [&sched] {
        return pipeline(sched, 21);
    }();

    std::thread t([s = std::move(s)] {
        std::this_thread::sleep_for(1s);
        auto r = ex::sync_wait(s);   // main() may have already returned by now!
    });
    t.detach();
}
```

**Answer:**
```
Undefined behavior if main() returns and destroys `sched` (or the scheduler's backing thread pool) before the detached thread calls sync_wait.
```

**Explanation:**
- Senders (and the schedulers/data they reference) still obey ordinary C++ object-lifetime rules - the sender/receiver model changes WHEN work runs, not whether dangling references are still dangling
- Capturing `sched` by value into `pipeline` would only copy a lightweight scheduler handle - but if the thread pool it refers to is itself destroyed when `main()` exits, using it afterward is UB regardless
- The detached thread with a `sleep_for(1s)` racing against `main()`'s own lifetime is the real bug, unrelated to senders specifically
- **Key Concept:** Senders don't grant automatic lifetime extension to anything they reference; the caller is still responsible for ensuring every referenced object (scheduler, captured data) outlives every operation that might use it

**Fixed Version:**
```cpp
int main() {
    auto sched = get_pool_scheduler();
    ex::sender auto s = pipeline(sched, 21);

    // Don't detach + race against main's own lifetime; join instead, or
    // keep the pool/scheduler alive for as long as any spawned work needs it.
    std::thread t([s = std::move(s)] {
        auto r = ex::sync_wait(s);
    });
    t.join();
}
```

---

#### Q8
```cpp
namespace ex = std::execution;

ex::sender auto step1 = ex::then(ex::schedule(sched), [] { return 10; });
ex::sender auto step2 = ex::then(step1, [](int x) { return x + 5; });

int main() {
    auto r1 = ex::sync_wait(step1);   // drives step1 to completion directly
    auto r2 = ex::sync_wait(step2);   // Bug (assumption): "step1 already ran, so this reuses that result"
}
```

**Answer:**
```
compute for `step1`'s body runs AGAIN as part of driving step2 - the earlier sync_wait(step1) call has no effect on step2.
```

**Explanation:**
- `step2` is built from `step1` as a description, composed via `then` - it does not "consume" or cache a prior run's result
- `sync_wait(step1)` and `sync_wait(step2)` are two entirely independent operation states, each starting from `schedule(sched)` fresh
- The value `10` is produced twice: once for the standalone `step1` run, once again as part of `step2`'s chain
- **Key Concept:** Composing senders builds a bigger description that still re-describes every upstream step; running one sender doesn't memoize results for a different (even related) sender built from the same building blocks

**Fixed Version:**
```cpp
// If step1's result should genuinely be reused, drive it once and hand the
// VALUE (not the sender) into the next stage:
int main() {
    auto r1 = ex::sync_wait(step1);
    int reused_value = std::get<0>(*r1);
    // Now do whatever "step2" needed to do, using reused_value directly -
    // no second execution of step1's body.
    int r2 = reused_value + 5;
}
```

---

#### Q9
```cpp
namespace ex = std::execution;

ex::task<int> compute_pipeline(ex::scheduler auto sched) {
    int a = co_await (ex::schedule(sched) | ex::then([] { return compute_a(); }));
    int b = co_await (ex::schedule(sched) | ex::then([] { return compute_b(); }));
    co_return a + b;
    // Bug (assumption): "co_await-ing two senders back to back means
    // compute_a() and compute_b() run concurrently, like when_all would."
}
```

**Answer:**
```
compute_a() and compute_b() run SEQUENTIALLY, one after the other - not concurrently.
```

**Explanation:**
- Each `co_await` suspends the coroutine until that specific sender completes, then resumes and moves to the next line
- Writing two `co_await` expressions in sequence is inherently sequential composition, exactly like two consecutive `co_await`s on any other awaitable
- To get the CONCURRENT behavior the author wanted here, the two senders need to be combined with `when_all` and the combined sender `co_await`-ed once
- **Key Concept:** `co_await` on a sender gives you sequential-looking code by design; concurrency still has to be requested explicitly via a fan-out adaptor like `when_all`, coroutines don't parallelize independent `co_await` statements for you

**Fixed Version:**
```cpp
ex::task<int> compute_pipeline(ex::scheduler auto sched) {
    auto [a, b] = co_await ex::when_all(
        ex::schedule(sched) | ex::then([] { return compute_a(); }),
        ex::schedule(sched) | ex::then([] { return compute_b(); })
    );
    co_return a + b;   // compute_a() and compute_b() now genuinely run concurrently
}
```

---

#### Q10
```cpp
namespace ex = std::execution;

void cleanup_on_shutdown(ex::scheduler auto sched) {
    ex::sender auto s = ex::then(ex::schedule(sched), [] {
        flush_logs();
        return 0;
    });

    auto op_state = ex::connect(s, my_receiver{});
    // No bug here - what's true about op_state's lifetime?
    ex::start(op_state);
}   // op_state's scope ends here
```

**Answer:**
```
This is a real, common bug in practice: op_state is a local variable that gets destroyed when the function returns, but start() may not have completed the asynchronous work yet - destroying a still-running operation state is undefined behavior.
```

**Explanation:**
- `connect()` produces an operation state that owns the resources for the run, but `start()` merely BEGINS the operation - it does not block until completion (that's what `sync_wait` is for)
- If the scheduled work is asynchronous and hasn't finished by the time `cleanup_on_shutdown` returns, `op_state`'s destructor runs while the operation may still be in flight
- The model requires the operation state to outlive the operation it started; for a fire-and-forget local like this, that guarantee doesn't hold
- **Key Concept:** An operation state must stay alive for the entire duration of the operation it started; a local `connect()`+`start()` pair with no blocking wait is a lifetime bug unless the operation is guaranteed synchronous or the operation state is kept alive elsewhere (e.g. heap-allocated and self-owning, or joined via `sync_wait`)

**Fixed Version:**
```cpp
void cleanup_on_shutdown(ex::scheduler auto sched) {
    ex::sender auto s = ex::then(ex::schedule(sched), [] {
        flush_logs();
        return 0;
    });

    ex::sync_wait(s);   // blocks until the operation state's work is truly done
    // safe to let everything go out of scope now
}
```

---
