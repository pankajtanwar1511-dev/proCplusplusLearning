## TOPIC: Async, Promise, and Future - Asynchronous Task Management

### INTERVIEW_QA: Comprehensive Questions and Answers

#### Q1: What is the difference between std::async and std::thread?
**Difficulty:** #beginner
**Category:** #async #threading
**Concepts:** #async_vs_thread #future #lifetime_management

**Answer:**
std::async returns a future and automatically manages thread lifetime, while std::thread requires explicit join or detach and does not provide a return value mechanism.

**Explanation:**
std::thread is a low-level primitive requiring manual lifetime management via join() or detach(). It does not provide built-in result retrieval—you must use shared variables with synchronization. std::async returns a std::future that blocks on get() until the result is ready, eliminating manual join. The future destructor ensures the task completes, preventing detached thread issues. For simple async tasks, async is higher-level and safer; use raw threads when precise control over thread lifecycle is needed, such as long-lived worker threads in autonomous vehicle sensor processing loops.

**Key takeaway:** Use std::async for task-based parallelism with automatic result handling; use std::thread for fine-grained thread control.

---

#### Q2: What happens if you call get() on a future twice?
**Difficulty:** #beginner
**Category:** #future #error_handling
**Concepts:** #single_use #future_error #shared_future

**Answer:**
Calling get() a second time throws std::future_error with error code future_errc::no_state because futures are single-use and invalidated after the first get().

**Code example:**
```cpp
std::future<int> fut = std::async([]{ return 42; });
int val1 = fut.get();  // ✅ val1 = 42
int val2 = fut.get();  // ❌ Throws future_error
```

**Explanation:**
std::future transfers ownership of the result on get(), moving the value out and invalidating the shared state. This prevents accidental reuse and clarifies that futures represent one-time value delivery. If multiple consumers need the result, convert to std::shared_future using fut.share() which allows multiple get() calls. Shared future copies share the same state, each able to retrieve the value non-destructively.

**Key takeaway:** std::future is move-only and single-use; use std::shared_future for multiple consumers.

---

#### Q3: Explain the difference between std::launch::async and std::launch::deferred.
**Difficulty:** #intermediate
**Category:** #async #launch_policy
**Concepts:** #eager_vs_lazy #execution_timing #thread_creation

**Answer:**
launch::async creates a new thread immediately and executes the task asynchronously, while launch::deferred delays execution until get() or wait() is called, running synchronously in the calling thread.

**Code example:**
```cpp
// Async: task runs immediately in new thread
auto fut1 = std::async(std::launch::async, task);

// Deferred: task runs lazily on get()
auto fut2 = std::async(std::launch::deferred, task);
fut2.get();  // Task executes NOW in this thread
```

**Explanation:**
Async policy guarantees true parallel execution with overhead of thread creation. Deferred policy avoids thread creation entirely, useful for optional computations that may not be needed—if get() is never called, the task never runs. The default policy (async | deferred) lets the implementation choose, often selecting deferred. Always specify explicit policy for predictable behavior. In real-time autonomous systems, async ensures perception tasks start immediately while deferred can handle non-critical analytics.

**Key takeaway:** Explicitly specify launch policy; async for parallelism, deferred for lazy evaluation, avoid default for portability.

---

#### Q4: What is std::promise and how does it differ from std::async?
**Difficulty:** #intermediate
**Category:** #promise #async
**Concepts:** #manual_control #thread_communication #async_vs_promise

**Answer:**
std::promise provides manual control over setting the value or exception for a future, while std::async automatically launches a task and returns a future for its result.

**Code example:**
```cpp
// Promise: manual control
std::promise<int> prom;
std::future<int> fut = prom.get_future();
std::thread t([&prom]{ prom.set_value(42); });

// Async: automatic
auto fut2 = std::async([]{ return 42; });
```

**Explanation:**
Async combines thread creation, callable execution, and future generation in one call, suitable for simple parallel tasks. Promise separates these concerns: you create the promise-future pair, manually launch threads or use callbacks, and explicitly call set_value(). This flexibility is essential for integrating with existing threading models, such as callback-based sensor drivers in autonomous vehicles where the callback thread sets the promise when data arrives.

**Key takeaway:** Use async for simple task launching; use promise for fine-grained control over value delivery timing and threading.

---

#### Q5: Why does the destructor of a future returned from std::async block?
**Difficulty:** #advanced
**Category:** #future #lifetime_management
**Concepts:** #blocking_destructor #async_special_case #raii

**Answer:**
A future from std::async with launch::async policy blocks in its destructor to prevent detached threads, ensuring the task completes before the future is destroyed.

**Code example:**
```cpp
{
    auto fut = std::async(std::launch::async, slow_task);
    // ❌ fut destructor blocks here until slow_task completes!
}
// Execution only continues after task finishes
```

**Explanation:**
This behavior is unique to futures from async—manually created promise-future pairs do not block on destruction. The design prevents dangling references if the task captures local variables from the launching scope. However, it causes surprising latency if futures are destroyed prematurely. To avoid blocking, explicitly call get() or wait() before destruction, or store futures in containers with controlled lifetimes. In autonomous driving perception loops, unbounded destructor blocking can violate real-time deadlines.

**Key takeaway:** Futures from async with launch::async have blocking destructors; always explicitly retrieve results to control timing.

---

#### Q6: What happens if a promise is destroyed without calling set_value()?
**Difficulty:** #intermediate
**Category:** #promise #error_handling
**Concepts:** #broken_promise #future_error #cleanup

**Answer:**
If a promise is destroyed without setting a value or exception, the associated future receives a std::future_error with code future_errc::broken_promise when get() is called.

**Code example:**
```cpp
std::future<int> fut;
{
    std::promise<int> prom;
    fut = prom.get_future();
    // ❌ prom destroyed without set_value()
}

try {
    int val = fut.get();  // Throws future_error: broken_promise
} catch (const std::future_error& e) {
    // Handle broken promise
}
```

**Explanation:**
This mechanism prevents indefinite blocking when the promise is abandoned (e.g., worker thread crashes). The future can detect the promise's destruction and throw rather than hanging forever. In production code, ensure promises are moved to worker thread scopes or use RAII wrappers that set default values in destructors if not already set. For autonomous vehicle perception, broken promises signal sensor driver failures.

**Key takeaway:** Always set a value or exception before promise destruction; use RAII wrappers for automatic cleanup.

---

#### Q7: How can multiple threads retrieve the result from a single async operation?
**Difficulty:** #intermediate
**Category:** #shared_future #multiple_consumers
**Concepts:** #broadcasting #shared_state #non_destructive_read

**Answer:**
Convert std::future to std::shared_future using share() or the shared_future constructor, allowing multiple threads to call get() non-destructively.

**Code example:**
```cpp
std::promise<int> prom;
std::shared_future<int> shared_fut = prom.get_future().share();

// Multiple threads can all call get()
auto reader = [shared_fut] {
    int val = shared_fut.get();  // ✅ Non-destructive
};
```

**Explanation:**
std::shared_future holds a shared_ptr to the state, allowing copies. Each copy can call get() independently without invalidating other copies. This broadcasts results to multiple consumers without manual synchronization. Use cases include distributing updated map data to perception, planning, and visualization modules in autonomous vehicles, or sharing configuration loaded asynchronously to multiple worker threads.

**Key takeaway:** Use std::shared_future for broadcasting results; regular future is single-consumer.

---

#### Q8: What is std::packaged_task and when would you use it?
**Difficulty:** #advanced
**Category:** #packaged_task #thread_pools
**Concepts:** #task_wrapping #deferred_execution #thread_pool_integration

**Answer:**
std::packaged_task wraps a callable and associates it with a future, allowing manual control over when and where the task executes, essential for thread pool implementations.

**Code example:**
```cpp
std::packaged_task<int(int)> task([](int x) { return x * 2; });
std::future<int> fut = task.get_future();

// Execute in thread pool worker
std::thread t(std::move(task), 21);

int result = fut.get();  // Retrieve result
t.join();
```

**Explanation:**
Unlike async which launches immediately, packaged_task separates task creation from execution. Thread pools create packaged_tasks, enqueue them, and workers dequeue and execute them. The future allows the submitter to retrieve results without knowing which thread executed the task. This pattern is fundamental for autonomous vehicle perception thread pools where hundreds of camera frame processing tasks are queued and executed by a fixed set of worker threads.

**Key takeaway:** Use packaged_task for thread pools and custom task scheduling; it separates task definition from execution.

---

#### Q9: How do you handle timeouts when waiting for a future?
**Difficulty:** #intermediate
**Category:** #future #timeouts
**Concepts:** #wait_for #wait_until #real_time_constraints

**Answer:**
Use wait_for() or wait_until() to check if the future is ready within a timeout, returning future_status indicating ready, timeout, or deferred.

**Code example:**
```cpp
auto fut = std::async(std::launch::async, slow_task);

if (fut.wait_for(std::chrono::milliseconds(100)) == std::future_status::ready) {
    int result = fut.get();
} else {
    // Timeout: task still running
}
```

**Explanation:**
wait_for() returns future_status: ready (result available), timeout (not ready yet), or deferred (lazy task not executed). Unlike get() which blocks indefinitely, wait_for allows bounded waiting essential for real-time systems. If timeout occurs, the future remains valid—you can wait again or proceed with fallback logic. In autonomous driving, perception tasks have hard deadlines; timing out lidar processing allows using previous frame data rather than blocking the entire pipeline.

**Key takeaway:** Use wait_for/wait_until for bounded waiting in real-time systems; always handle timeout scenarios.

---

#### Q10: Can you cancel a task launched with std::async?
**Difficulty:** #intermediate
**Category:** #async #cancellation
**Concepts:** #task_cancellation #cooperative_cancellation #limitations

**Answer:**
std::async provides no built-in cancellation mechanism; tasks run to completion or must implement cooperative cancellation via atomic flags.

**Code example:**
```cpp
std::atomic<bool> cancel_flag(false);

auto fut = std::async(std::launch::async, [&cancel_flag] {
    for (int i = 0; i < 1000000; ++i) {
        if (cancel_flag.load()) return -1;  // ✅ Cooperative cancellation
        // Do work
    }
    return 0;
});

cancel_flag.store(true);  // Request cancellation
```

**Explanation:**
C++20 std::jthread provides cancellation tokens, but std::async does not. Implement cooperative cancellation by passing atomic flags or cancellation tokens that the task periodically checks. This allows graceful shutdown but requires task cooperation—tasks cannot be forcibly killed. For autonomous vehicle perception, if the vehicle enters a parking state, active object tracking tasks can check a cancellation flag and exit early rather than wasting CPU.

**Key takeaway:** std::async lacks cancellation; implement cooperative cancellation with atomic flags or use std::jthread in C++20.

---

#### Q11: What is the difference between wait() and get() on a future?
**Difficulty:** #beginner
**Category:** #future #operations
**Concepts:** #wait_vs_get #value_retrieval #blocking

**Answer:**
wait() blocks until the result is ready but does not retrieve it, while get() blocks and returns the value, invalidating the future.

**Code example:**
```cpp
std::future<int> fut = std::async([]{ return 42; });

fut.wait();  // ✅ Blocks until ready, future still valid
int val = fut.get();  // ✅ Retrieves value, future invalidated
```

**Explanation:**
Use wait() when you need to ensure the task has completed but don't need the value yet, or when checking readiness before a separate get() call. wait() preserves the future's validity while get() consumes it. This separation allows structured error handling: wait(), check exception with future.valid(), then conditionally get(). In practice, get() is more common as it combines waiting and retrieval.

**Key takeaway:** wait() blocks without consuming the future; get() blocks and retrieves the value.

---

#### Q12: How do exceptions propagate through std::future?
**Difficulty:** #intermediate
**Category:** #future #exception_handling
**Concepts:** #exception_propagation #stored_exception #rethrow

**Answer:**
Exceptions thrown in async tasks or set via promise.set_exception() are captured in the shared state and rethrown when future.get() is called.

**Code example:**
```cpp
auto fut = std::async(std::launch::async, [] {
    throw std::runtime_error("Error");
});

try {
    fut.get();  // ⚡ Exception rethrown here
} catch (const std::runtime_error& e) {
    // Handle exception
}
```

**Explanation:**
The exception is stored using std::exception_ptr and rethrown with the original type when get() is invoked. This provides clean error propagation across thread boundaries without manual error codes. If get() is never called, the exception remains stored but never surfaces. Always call get() or wait() to ensure error detection. In autonomous vehicle perception, invalid sensor calibration exceptions propagate to the planning layer for appropriate fallback behavior.

**Key takeaway:** Exceptions stored in futures are rethrown on get(); always call get() to detect errors.

---

#### Q13: What is the purpose of std::future::valid()?
**Difficulty:** #beginner
**Category:** #future #state_management
**Concepts:** #valid_state #shared_state #error_checking

**Answer:**
valid() returns true if the future has a shared state (result or exception pending), false if it was default-constructed or already consumed by get().

**Code example:**
```cpp
std::future<int> fut1;  // Default constructed
std::cout << fut1.valid() << "\n";  // 0 (false)

std::future<int> fut2 = std::async([]{ return 42; });
std::cout << fut2.valid() << "\n";  // 1 (true)

fut2.get();
std::cout << fut2.valid() << "\n";  // 0 (false after get())
```

**Explanation:**
valid() checks if the future is associated with a shared state. A default-constructed or moved-from future has no state. After get(), the future is invalidated and valid() returns false. Check valid() before calling get() to avoid future_error exceptions. This is useful in error handling paths where futures may be in unknown states after partial exception recovery.

**Key takeaway:** Check valid() before operations on futures that may be default-constructed or already consumed.

---

#### Q14: Can you move a std::future? Can you copy it?
**Difficulty:** #beginner
**Category:** #future #ownership
**Concepts:** #move_semantics #unique_ownership #non_copyable

**Answer:**
std::future is move-only (not copyable), transferring ownership of the shared state to the moved-to future.

**Code example:**
```cpp
std::future<int> fut1 = std::async([]{ return 42; });
std::future<int> fut2 = std::move(fut1);  // ✅ Move

// auto fut3 = fut1;  // ❌ Compile error: no copy constructor

std::cout << fut1.valid() << "\n";  // 0 (moved-from)
std::cout << fut2.valid() << "\n";  // 1 (owns state)
```

**Explanation:**
Move-only semantics enforce unique ownership of the result. Only one future can retrieve the value, preventing accidental duplication. If multiple consumers need access, use std::shared_future which is copyable. Moving futures allows returning them from functions and storing them in containers without copying overhead.

**Key takeaway:** std::future is move-only; use std::shared_future for copyable futures.

---

#### Q15: What is the return type of std::async when the callable returns void?
**Difficulty:** #beginner
**Category:** #async #return_types
**Concepts:** #void_future #completion_signaling

**Answer:**
std::async returns std::future<void> for callables with void return type, used for signaling completion rather than retrieving a value.

**Code example:**
```cpp
auto fut = std::async(std::launch::async, [] {
    std::cout << "Task executing\n";
    // No return
});

fut.wait();  // ✅ Wait for completion
// No value to retrieve with get(), but get() can be called to check for exceptions
```

**Explanation:**
future<void> represents a completion signal. Calling get() on it returns void but still blocks until completion and rethrows any exceptions. This is useful for synchronizing on task completion without returning data. In autonomous vehicle systems, future<void> can signal initialization completion of a sensor driver or calibration routine.

**Key takeaway:** future<void> signals completion without returning a value; useful for synchronization.

---

#### Q16: How would you implement a thread pool using std::packaged_task?
**Difficulty:** #advanced
**Category:** #thread_pools #packaged_task
**Concepts:** #task_queue #worker_threads #future_collection

**Answer:**
Create a queue of packaged_tasks, worker threads dequeue and execute tasks, and submitters retrieve results via returned futures.

**Code example:**
```cpp
class ThreadPool {
    std::vector<std::thread> workers;
    std::queue<std::packaged_task<void()>> tasks;
    std::mutex mtx;
    std::condition_variable cv;
    bool stop = false;

public:
    ThreadPool(size_t num_threads) {
        for (size_t i = 0; i < num_threads; ++i) {
            workers.emplace_back([this] {
                while (true) {
                    std::packaged_task<void()> task;
                    {
                        std::unique_lock<std::mutex> lock(mtx);
                        cv.wait(lock, [this]{ return stop || !tasks.empty(); });
                        if (stop && tasks.empty()) return;
                        task = std::move(tasks.front());
                        tasks.pop();
                    }
                    task();  // Execute task
                }
            });
        }
    }

    template<typename F>
    auto submit(F&& f) -> std::future<decltype(f())> {
        using RetType = decltype(f());
        auto task = std::packaged_task<RetType()>(std::forward<F>(f));
        auto fut = task.get_future();

        {
            std::lock_guard<std::mutex> lock(mtx);
            tasks.emplace(std::move(task));
        }
        cv.notify_one();
        return fut;
    }

    ~ThreadPool() {
        {
            std::lock_guard<std::mutex> lock(mtx);
            stop = true;
        }
        cv.notify_all();
        for (auto& t : workers) t.join();
    }
};
```

**Explanation:**
Packaged_task wraps arbitrary callables with futures, allowing the thread pool to handle heterogeneous tasks. Submitters receive futures for result retrieval without knowing which worker executed the task. This pattern scales to hundreds of concurrent tasks in autonomous vehicle perception where camera frames, lidar scans, and radar updates are all processed in parallel by a shared worker pool.

**Key takeaway:** Packaged_task is the foundation for thread pools, separating task submission from execution and result retrieval.

---

#### Q17: What is the relationship between std::promise::set_value() and future::get()?
**Difficulty:** #intermediate
**Category:** #promise #future
**Concepts:** #synchronization #happens_before #value_transfer

**Answer:**
set_value() on the promise synchronizes-with get() on the future, establishing a happens-before relationship ensuring the value is visible.

**Explanation:**
The promise-future pair uses internal synchronization (atomics or mutexes) to coordinate value transfer. When set_value() is called, the value is atomically made available. If get() was already blocked, the thread is woken. The synchronization ensures that all operations before set_value() are visible after get() returns, similar to release-acquire memory ordering. This built-in synchronization eliminates the need for manual mutexes around the promise-future communication channel.

**Key takeaway:** Promise and future automatically synchronize; set_value() happens-before get(), ensuring correct visibility.

---

#### Q18: Can you reuse a std::promise for multiple values?
**Difficulty:** #beginner
**Category:** #promise #single_use
**Concepts:** #promise_lifecycle #reusability #promise_error

**Answer:**
No, std::promise is single-use; calling set_value() or set_exception() more than once throws std::future_error with code promise_already_satisfied.

**Code example:**
```cpp
std::promise<int> prom;
prom.set_value(10);
prom.set_value(20);  // ❌ Throws future_error: promise_already_satisfied
```

**Explanation:**
Promise represents a one-time value delivery mechanism. Once satisfied, it cannot be reused. For repeated signaling, create a new promise-future pair for each event, or use condition variables for ongoing producer-consumer patterns. In autonomous vehicle sensor processing, each sensor frame gets its own promise-future pair for asynchronous result delivery.

**Key takeaway:** Promise is single-use; create new promises for each value delivery.

---

#### Q19: How do you implement a timeout for an entire async operation including setup?
**Difficulty:** #advanced
**Category:** #timeouts #real_time
**Concepts:** #deadline_based_waiting #composite_timeouts

**Answer:**
Use std::chrono clocks to calculate remaining time budgets and pass them to wait_for() in a deadline-based pattern.

**Code example:**
```cpp
auto deadline = std::chrono::steady_clock::now() + std::chrono::milliseconds(100);

auto fut = std::async(std::launch::async, sensor_task);

// Other setup work...

auto remaining = deadline - std::chrono::steady_clock::now();
if (fut.wait_for(remaining) == std::future_status::ready) {
    auto result = fut.get();
} else {
    // Overall timeout exceeded
}
```

**Explanation:**
Real-time systems have end-to-end deadlines including task setup, execution, and result processing. Calculate remaining time budget before each blocking call using steady_clock. This prevents cumulative delays from exceeding the overall deadline. In autonomous driving perception cycles, the total time from sensor data arrival to planning input must be bounded (e.g., 100ms), requiring careful time budget management across multiple async operations.

**Key takeaway:** Use deadline-based time budgets with steady_clock for composite real-time operations.

---

#### Q20: What happens to a future if its associated promise is moved?
**Difficulty:** #intermediate
**Category:** #promise #future #move_semantics
**Concepts:** #shared_state_stability #promise_ownership

**Answer:**
The future remains valid; the shared state is not affected by moving the promise, only by promise destruction or value setting.

**Code example:**
```cpp
std::promise<int> prom1;
std::future<int> fut = prom1.get_future();

std::promise<int> prom2 = std::move(prom1);  // Move promise

// fut still valid
prom2.set_value(42);
int val = fut.get();  // ✅ Works fine
```

**Explanation:**
The promise and future share ownership of the internal state via reference counting or similar mechanism. Moving the promise transfers promise-side ownership but does not invalidate the future. The future remains associated with the shared state regardless of promise moves. This allows passing promises to worker threads via move while keeping futures in the calling scope for result retrieval.

**Key takeaway:** Moving promises does not invalidate futures; the shared state remains stable.

---
