## TOPIC: Async, Promise, and Future - Asynchronous Task Management

### THEORY_SECTION: Core Concepts and Foundations

#### 1. The Async Trio - Overview

**Three Related Components (C++11):**

| Component | Role | Purpose |
|-----------|------|---------|
| **std::future** | Receiver/Consumer | Handle to retrieve async result (blocks on get()) |
| **std::promise** | Sender/Producer | Write-once channel to set value or exception |
| **std::async** | Task Launcher | Combines thread creation + future generation |

**Basic Relationship:**

```cpp
// std::async (easiest):
std::future<int> fut = std::async([]{ return 42; });
int result = fut.get();  // Blocks until ready

// std::promise + std::future (manual control):
std::promise<int> prom;
std::future<int> fut = prom.get_future();

std::thread t([prom = std::move(prom)]() mutable {
    prom.set_value(42);  // Send value to future
});

int result = fut.get();  // Receive value
t.join();
```

**Key Benefits:**

- ✅ Value propagation across threads without explicit mutexes
- ✅ Automatic exception propagation
- ✅ RAII-based thread lifetime management (for async)
- ✅ Type-safe result delivery

---

#### 2. std::async - Launch Policies

**Policy Comparison:**

| Policy | Thread Creation | Execution Timing | Use Case |
|--------|----------------|------------------|----------|
| **launch::async** | ✅ Guaranteed new thread | Immediate, parallel | True parallelism needed |
| **launch::deferred** | ❌ No thread | Lazy (runs on get/wait) | Optional computation |
| **Default (async\|deferred)** | ⚠️ Implementation choice | Unpredictable | ❌ Avoid - portability hazard |

**Critical: Default Policy is Dangerous**

```cpp
// ❌ AVOID: Default policy
auto fut = std::async(task);  // May run synchronously!

// ✅ EXPLICIT: Always specify
auto fut1 = std::async(std::launch::async, task);     // Guaranteed parallel
auto fut2 = std::async(std::launch::deferred, task);  // Guaranteed lazy
```

**Lifetime Management:**

| Primitive | join/detach Required? | Lifetime Management |
|-----------|----------------------|---------------------|
| **std::thread** | ✅ Must call join() or detach() | Manual |
| **std::async** | ❌ Automatic via future destructor | RAII (but blocks!) |

**Future Destructor Blocking:**

```cpp
{
    auto fut = std::async(std::launch::async, []{
        std::this_thread::sleep_for(std::chrono::seconds(5));
        return 42;
    });
    // ❌ fut destructor BLOCKS HERE for 5 seconds!
}
// Execution continues only after task completes
```

---

#### 3. Promise-Future Communication Channel

**Single-Use Semantics:**

| Operation | Effect | Can Call Again? |
|-----------|--------|-----------------|
| **promise.set_value()** | Set result, unblock future | ❌ Throws promise_already_satisfied |
| **promise.set_exception()** | Set exception for future | ❌ Throws promise_already_satisfied |
| **future.get()** | Retrieve value, invalidate future | ❌ Throws future_error: no_state |
| **future.wait()** | Block until ready (no value retrieval) | ✅ Can call multiple times |

**Internal Synchronization:**

```cpp
// No manual mutex needed!
std::promise<int> prom;
std::future<int> fut = prom.get_future();

// Thread 1 (producer):
data = 42;
prom.set_value(100);  // Automatically synchronizes

// Thread 2 (consumer):
int val = fut.get();  // Sees data = 42 (happens-before relationship)
```

**Happens-Before Guarantee:**

| Event | Synchronization |
|-------|----------------|
| promise.set_value() | **synchronizes-with** → future.get() |
| All operations before set_value() | **visible** to operations after get() |

---

#### 4. std::future vs std::shared_future

**Single vs Multiple Consumers:**

| Feature | std::future | std::shared_future |
|---------|-------------|-------------------|
| **Copyable** | ❌ Move-only | ✅ Copyable |
| **get() calls** | Single-use (invalidates) | Multiple non-destructive reads |
| **Use Case** | Single consumer | Broadcast to multiple consumers |
| **Conversion** | `fut.share()` | Construct from future |

**Example: Broadcasting Results**

```cpp
std::promise<int> prom;
std::shared_future<int> shared_fut = prom.get_future().share();

// Multiple threads can all read:
auto reader = [shared_fut]() {
    int val = shared_fut.get();  // ✅ Non-destructive
    process(val);
};

std::thread t1(reader);
std::thread t2(reader);
std::thread t3(reader);

prom.set_value(42);  // All threads unblock

t1.join(); t2.join(); t3.join();
```

---

#### 5. std::packaged_task - Thread Pool Building Block

**Purpose:**

Separates task creation from execution, enabling thread pool implementations.

**Workflow:**

| Step | Action | Component |
|------|--------|-----------|
| **1** | Wrap callable | `packaged_task<RetType()> task(callable)` |
| **2** | Get future | `auto fut = task.get_future()` |
| **3** | Enqueue task | Add to thread pool queue |
| **4** | Worker executes | Worker calls `task()` |
| **5** | Retrieve result | Caller does `fut.get()` |

**Example:**

```cpp
// Create task:
std::packaged_task<int(int)> task([](int x) { return x * 2; });
std::future<int> fut = task.get_future();

// Execute later (possibly in another thread):
std::thread t(std::move(task), 21);

// Retrieve result:
int result = fut.get();  // 42
t.join();
```

---

#### 6. Timeouts and Waiting

**Non-Blocking Wait Operations:**

| Operation | Return Type | Behavior |
|-----------|-------------|----------|
| **wait_for(duration)** | future_status | Wait up to duration |
| **wait_until(timepoint)** | future_status | Wait until absolute time |

**future_status Values:**

| Status | Meaning |
|--------|---------|
| **ready** | Result available |
| **timeout** | Not ready yet (time expired) |
| **deferred** | Deferred task not executed yet |

**Example: Real-Time Deadline**

```cpp
auto fut = std::async(std::launch::async, sensor_processing);

if (fut.wait_for(std::chrono::milliseconds(100)) == std::future_status::ready) {
    auto result = fut.get();
    use_result(result);
} else {
    // Timeout: use fallback data
    use_previous_frame();
}
```

---

#### 7. Exception Propagation

**Automatic Cross-Thread Exception Transfer:**

```cpp
// Producer throws:
auto fut = std::async(std::launch::async, [] {
    throw std::runtime_error("Sensor failure!");
    return 42;
});

// Exception stored (NOT thrown yet)
std::this_thread::sleep_for(std::chrono::seconds(1));

// Consumer retrieves:
try {
    int val = fut.get();  // ⚡ Exception rethrown HERE
} catch (const std::runtime_error& e) {
    handle_sensor_failure(e);
}
```

**Manual Exception Setting:**

```cpp
std::promise<int> prom;
std::future<int> fut = prom.get_future();

try {
    int result = risky_operation();
    prom.set_value(result);
} catch (...) {
    prom.set_exception(std::current_exception());  // Forward exception
}
```

---

#### 8. Real-World: Autonomous Driving

**Sensor Processing Pipeline:**

| Component | Implementation | Benefit |
|-----------|---------------|---------|
| **Camera Capture** | `std::async(process_frame)` returns `future<DetectionResult>` | Parallel frame processing |
| **LiDAR Processing** | Thread pool with `packaged_task` | Efficient worker utilization |
| **Calibration Init** | `promise` set by callback thread | Clean async initialization |
| **Planning Coordination** | `shared_future` for map updates | Broadcast to multiple modules |
| **Real-Time Deadlines** | `wait_for()` with 100ms timeout | Bounded latency guarantees |

**Example: Multi-Sensor Fusion**

```cpp
// Launch parallel sensor processing:
auto camera_fut = std::async(std::launch::async, process_camera);
auto lidar_fut = std::async(std::launch::async, process_lidar);
auto radar_fut = std::async(std::launch::async, process_radar);

// Collect results with timeout:
auto deadline = std::chrono::steady_clock::now() + std::chrono::milliseconds(50);

CameraData cam_data;
if (camera_fut.wait_until(deadline) == std::future_status::ready) {
    cam_data = camera_fut.get();
} else {
    cam_data = use_previous_camera_frame();
}

// Similar for lidar and radar...
fuse_sensor_data(cam_data, lidar_data, radar_data);
```

**Why This Matters:**

| Metric | Raw Threads | std::async + futures |
|--------|-------------|----------------------|
| **Code Complexity** | High (manual sync) | Low (automatic sync) |
| **Exception Handling** | Manual error codes | Automatic propagation |
| **Lifetime Management** | Manual join/detach | RAII via future |
| **Result Retrieval** | Shared variables + mutex | Type-safe get() |
| **Testability** | Hard (threading exposed) | Easy (returns future) |

---

#### 9. Common Pitfalls

**Pitfall Table:**

| Mistake | Problem | Fix |
|---------|---------|-----|
| Default launch policy | May run synchronously! | Always specify `launch::async` or `launch::deferred` |
| Multiple get() calls | Throws `future_error: no_state` | Use `shared_future` for multiple consumers |
| Ignoring future destructor | Unexpected blocking | Explicitly `get()` or `wait()` before scope exit |
| Promise not set | Broken promise exception or hang | Use RAII wrapper to set default value |
| Forgetting exceptions | Silent failures | Always `get()` to detect errors |
| Calling get() on packaged_task without executing | Hangs forever | Execute task before calling `get()` |

**Best Practices:**

- ✅ Always specify explicit launch policy (`launch::async` or `launch::deferred`)
- ✅ Store futures from `std::async` to control lifetime
- ✅ Use `shared_future` for multiple consumers
- ✅ Always call `get()` to detect exceptions
- ✅ Use timeouts (`wait_for`) in real-time systems
- ✅ Prefer `std::async` for simple tasks, `packaged_task` for thread pools
- ❌ Never rely on default launch policy
- ❌ Never call `get()` twice on same future

---

### EDGE_CASES: Tricky Scenarios and Deep Internals

#### Edge Case 1: Future Destructor Blocking Behavior

```cpp
void example() {
    {
        std::future<int> fut = std::async(std::launch::async, []() {
            std::this_thread::sleep_for(std::chrono::seconds(5));
            return 42;
        });
        // ❌ fut destructor blocks here for 5 seconds!
    }
    std::cout << "Future destroyed\n";  // Prints after 5 seconds
}
```

When a future returned from std::async with launch::async policy is destroyed without calling get() or wait(), the destructor blocks until the task completes. This surprising behavior is unique to futures from async—manually created promise-future pairs do not block. The rationale is to prevent detached threads, but it can cause unexpected latency. To avoid blocking, explicitly call get() or store futures in containers to control lifetime.

#### Edge Case 2: Calling get() Multiple Times

```cpp
std::promise<int> prom;
std::future<int> fut = prom.get_future();

prom.set_value(42);

int val1 = fut.get();  // ✅ val1 = 42
int val2 = fut.get();  // ❌ Throws std::future_error: no_state
```

std::future is single-use: get() transfers the value out and invalidates the future. A second get() throws future_error with error code future_errc::no_state because the shared state has been consumed. If multiple threads need the result, use std::shared_future which allows multiple get() calls through copying. Convert a future to shared_future via fut.share() or the shared_future constructor.

#### Edge Case 3: Promise Destroyed Without Setting Value

```cpp
std::future<int> create_broken_future() {
    std::promise<int> prom;
    std::future<int> fut = prom.get_future();
    return fut;  // ❌ prom destroyed without set_value!
}

void caller() {
    auto fut = create_broken_future();
    try {
        int val = fut.get();  // Throws std::future_error: broken_promise
    } catch (const std::future_error& e) {
        std::cout << "Broken promise: " << e.what() << "\n";
    }
}
```

If a promise is destroyed without calling set_value() or set_exception(), the future receives a broken_promise exception. This prevents indefinite blocking when the promise is abandoned. In production code, ensure promises are moved to the worker thread or stored in a scope that guarantees set_value() is called. RAII wrappers can automate this: destructor sets a default value or exception if not already set.

#### Edge Case 4: Launch Policy Ambiguity with Default Policy

```cpp
auto fut = std::async([]() { return expensive_computation(); });
// ❌ Might run synchronously on get()!

// fut.get() may execute the task in the current thread
auto result = fut.get();  // Could be synchronous!
```

The default launch policy (std::launch::async | std::launch::deferred) allows the implementation to choose. Most standard libraries use deferred, meaning the task runs lazily on first get() or wait() in the calling thread. This defeats the purpose of async execution. Always explicitly specify std::launch::async for true asynchronous execution, or std::launch::deferred for guaranteed lazy evaluation. Relying on default policy is a portability hazard.

#### Edge Case 5: Exception Propagation Timing

```cpp
std::future<int> fut = std::async(std::launch::async, []() {
    throw std::runtime_error("Task failed");
    return 42;
});

// Exception stored in shared state, not thrown immediately

std::this_thread::sleep_for(std::chrono::seconds(1));
// Task already threw exception, but no sign yet

try {
    int val = fut.get();  // ⚡ Exception rethrown here
} catch (const std::runtime_error& e) {
    std::cout << "Caught: " << e.what() << "\n";
}
```

Exceptions thrown in async tasks or set via set_exception() are stored in the shared state and rethrown when get() is called. The exception does not propagate immediately when thrown—it waits until the future is consumed. This deferred exception delivery means errors are not discovered until results are requested, potentially hiding failures in fire-and-forget scenarios. Always call get() or wait() to ensure task completion and error detection.

---

### CODE_EXAMPLES: Practical Demonstrations

#### Example 1: Basic std::async with Launch Policy

```cpp
#include <future>
#include <iostream>
#include <chrono>

int expensive_computation() {
    std::this_thread::sleep_for(std::chrono::seconds(2));
    return 42;
}

int main() {
    // ✅ Explicitly async: runs in new thread
    std::future<int> fut = std::async(std::launch::async, expensive_computation);

    std::cout << "Computation started, doing other work...\n";
    std::this_thread::sleep_for(std::chrono::seconds(1));

    std::cout << "Getting result...\n";
    int result = fut.get();  // Blocks until ready
    std::cout << "Result: " << result << "\n";

    return 0;
}
```

This demonstrates std::async with explicit launch::async policy ensuring true asynchronous execution. The main thread continues work while the computation runs in parallel. The get() call blocks until the result is available, but work can proceed beforehand. For autonomous vehicle perception, this pattern allows launching multiple sensor processing tasks and collecting results later.

#### Example 2: std::promise and std::future for Thread Communication

```cpp
#include <future>
#include <thread>
#include <iostream>

void worker_thread(std::promise<int> prom) {
    std::this_thread::sleep_for(std::chrono::seconds(1));

    // Simulate computation
    int result = 123;

    // Send result via promise
    prom.set_value(result);  // ✅ Value delivered to future
}

int main() {
    std::promise<int> prom;
    std::future<int> fut = prom.get_future();

    // Launch worker with moved promise (promises are move-only)
    std::thread worker(worker_thread, std::move(prom));

    std::cout << "Waiting for result...\n";
    int value = fut.get();  // Blocks until set_value() called
    std::cout << "Received: " << value << "\n";

    worker.join();
    return 0;
}
```

This pattern manually creates a promise-future pair for explicit thread communication. The promise is moved into the worker thread where set_value() signals completion. This is more flexible than async for scenarios requiring custom thread management, such as sensor callback threads in autonomous vehicle middleware that must run on specific cores for real-time guarantees.

#### Example 3: Exception Propagation Through Future

```cpp
#include <future>
#include <stdexcept>
#include <iostream>

int risky_operation() {
    throw std::runtime_error("Operation failed!");
    return 0;  // Never reached
}

int main() {
    std::future<int> fut = std::async(std::launch::async, risky_operation);

    std::cout << "Task launched\n";

    try {
        int result = fut.get();  // ⚡ Exception rethrown here
    } catch (const std::runtime_error& e) {
        std::cout << "Caught exception: " << e.what() << "\n";
    }

    return 0;
}
```

Exceptions thrown in async tasks are captured and stored in the shared state. When get() is called, the exception is rethrown in the calling thread. This provides clean exception propagation without manual error code handling. In autonomous driving perception pipelines, sensor processing failures (invalid calibration, missing data) propagate to the planning layer as exceptions rather than special error values.

#### Example 4: std::shared_future for Multiple Consumers

```cpp
#include <future>
#include <thread>
#include <iostream>
#include <vector>

int main() {
    std::promise<int> prom;
    std::shared_future<int> shared_fut = prom.get_future().share();  // ✅ Convert to shared

    // Multiple threads can call get() on shared_future
    auto reader = [shared_fut]() {
        int val = shared_fut.get();  // ✅ Non-destructive read
        std::cout << "Thread " << std::this_thread::get_id()
                  << " read: " << val << "\n";
    };

    std::vector<std::thread> readers;
    for (int i = 0; i < 3; ++i) {
        readers.emplace_back(reader);
    }

    std::this_thread::sleep_for(std::chrono::milliseconds(100));
    prom.set_value(42);  // All waiting threads unblock

    for (auto& t : readers) {
        t.join();
    }

    return 0;
}
```

std::shared_future allows multiple threads to retrieve the same value. Unlike std::future which is invalidated by get(), shared_future can be copied and get() called multiple times. This is useful for broadcasting results to multiple consumers, such as updated HD map data distributed to perception, planning, and visualization modules in autonomous vehicles.

#### Example 5: Deferred Execution with std::launch::deferred

```cpp
#include <future>
#include <iostream>

int lazy_computation(int x) {
    std::cout << "Computation executing now\n";
    return x * 2;
}

int main() {
    // ✅ Deferred: computation only runs on get()
    auto fut = std::async(std::launch::deferred, lazy_computation, 21);

    std::cout << "Future created, but computation not started\n";
    std::this_thread::sleep_for(std::chrono::seconds(1));
    std::cout << "Still not started...\n";

    std::cout << "Calling get()...\n";
    int result = fut.get();  // Computation executes NOW in this thread
    std::cout << "Result: " << result << "\n";

    return 0;
}
```

With launch::deferred, the task does not execute until get() or wait() is called, and it runs synchronously in the calling thread. This is useful for lazy evaluation where you want to defer expensive computations until needed. In autonomous driving, deferred tasks can represent optional high-resolution map queries that only execute if the planning layer requests them.

#### Example 6: Waiting with Timeout

```cpp
#include <future>
#include <iostream>
#include <chrono>

int slow_task() {
    std::this_thread::sleep_for(std::chrono::seconds(5));
    return 42;
}

int main() {
    auto fut = std::async(std::launch::async, slow_task);

    std::cout << "Waiting for result with timeout...\n";

    if (fut.wait_for(std::chrono::seconds(2)) == std::future_status::ready) {
        std::cout << "Result: " << fut.get() << "\n";
    } else {
        std::cout << "Timeout! Task still running.\n";
        // ⚠️ Future still valid, can wait again or get() later
        fut.wait();  // Wait until completion
        std::cout << "Result after wait: " << fut.get() << "\n";
    }

    return 0;
}
```

wait_for() and wait_until() allow non-blocking checks with timeouts. If the future is not ready, the calling thread is not blocked indefinitely. This is critical for real-time autonomous driving systems where perception cycles have hard deadlines (e.g., 100ms). If a lidar processing task exceeds its budget, the system can timeout and use fallback data rather than blocking the entire pipeline.

#### Example 7: std::packaged_task for Deferred Execution

```cpp
#include <future>
#include <iostream>

int compute(int x, int y) {
    return x + y;
}

int main() {
    // ✅ packaged_task wraps callable and provides future
    std::packaged_task<int(int, int)> task(compute);
    std::future<int> fut = task.get_future();

    // Task can be executed later, possibly in another thread
    std::thread t(std::move(task), 10, 20);  // Execute in thread

    std::cout << "Waiting for result...\n";
    int result = fut.get();
    std::cout << "Result: " << result << "\n";

    t.join();
    return 0;
}
```

std::packaged_task wraps a callable and associates it with a future. Unlike async which launches immediately, packaged_task allows manual control over when and where execution happens. This is useful for thread pools: tasks are created, queued, and workers execute them when available. In autonomous vehicle thread pools, packaged_tasks represent individual camera frame processing jobs with futures for collecting results.

#### Example 8: Setting Exception via Promise

```cpp
#include <future>
#include <thread>
#include <iostream>
#include <stdexcept>

void worker(std::promise<int> prom, bool succeed) {
    try {
        if (!succeed) {
            throw std::runtime_error("Task failed");
        }
        prom.set_value(42);  // Success case
    } catch (...) {
        // ✅ Capture and forward exception to future
        prom.set_exception(std::current_exception());
    }
}

int main() {
    std::promise<int> prom;
    std::future<int> fut = prom.get_future();

    std::thread t(worker, std::move(prom), false);  // Fail mode

    try {
        int val = fut.get();  // ⚡ Exception rethrown
        std::cout << "Value: " << val << "\n";
    } catch (const std::runtime_error& e) {
        std::cout << "Caught: " << e.what() << "\n";
    }

    t.join();
    return 0;
}
```

When a promise-based worker encounters an error, call set_exception() with std::current_exception() to forward the exception to the future. This maintains exception propagation across thread boundaries without losing error information. For autonomous vehicle sensor drivers, calibration failures or hardware errors can be propagated to the perception layer as exceptions via promises.

---

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

### PRACTICE_TASKS: Output Prediction and Code Analysis

#### Q1
```cpp
auto fut = std::async(std::launch::deferred, []{ return 42; });
std::cout << "Before get\n";
int val = fut.get();
std::cout << "After get: " << val << "\n";

// When does the lambda execute?
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Lambda executes during fut.get()

**Explanation:** Deferred execution runs synchronously when get() or wait() is called

**Key Concept:** launch::deferred

</details>

---

#### Q2
```cpp
std::promise<int> prom;
std::future<int> fut = prom.get_future();

prom.set_value(10);
int a = fut.get();
int b = fut.get();

// What happens at the second get()?
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Throws std::future_error

**Explanation:** Second get() throws future_error with no_state because future is single-use

**Key Concept:** single-use future

</details>

---

#### Q3
```cpp
auto fut = std::async(std::launch::async, []{
    std::this_thread::sleep_for(std::chrono::seconds(2));
    return 100;
});

// fut goes out of scope here

std::cout << "Done\n";

// When does "Done" print?
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** "Done" prints after 2 seconds

**Explanation:** Future destructor from async blocks until task completes

**Key Concept:** blocking destructor

</details>

---

#### Q4
```cpp
std::promise<int> prom;
std::future<int> fut = prom.get_future();

std::thread t([prom = std::move(prom)]() mutable {
    std::this_thread::sleep_for(std::chrono::seconds(1));
    prom.set_value(42);
});

int val = fut.get();
t.join();

// Is this code correct? What is val?
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Correct, val = 42

**Explanation:** Promise properly moved into thread, set_value called, future receives value

**Key Concept:** promise move semantics

</details>

---

#### Q5
```cpp
auto fut = std::async(std::launch::async, []{
    throw std::runtime_error("Error!");
    return 42;
});

std::this_thread::sleep_for(std::chrono::seconds(1));
// What happens here? Is exception thrown?

int val = fut.get();

// When is the exception thrown?
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Exception not thrown during sleep

**Explanation:** Exception stored in shared state, rethrown on fut.get() call

**Key Concept:** exception propagation

</details>

---

#### Q6
```cpp
std::future<int> fut;
std::cout << fut.valid() << "\n";

fut = std::async([]{ return 10; });
std::cout << fut.valid() << "\n";

fut.get();
std::cout << fut.valid() << "\n";

// What are the three outputs?
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** 0, 1, 0

**Explanation:** Default-constructed invalid (0), after async valid (1), after get() invalid (0)

**Key Concept:** future validity

</details>

---

#### Q7
```cpp
std::promise<int> prom;
std::future<int> fut = prom.get_future();

{
    std::thread t([&prom] {
        std::this_thread::sleep_for(std::chrono::seconds(1));
        prom.set_value(100);
    });
    t.detach();
}

int val = fut.get();

// Is this code safe? What could go wrong?
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Unsafe: race condition

**Explanation:** Detached thread may not complete before main exits; also lambda capture by reference dangerous

**Key Concept:** detached thread hazard

</details>

---

#### Q8
```cpp
auto fut = std::async(std::launch::async, []{ return 42; });

if (fut.wait_for(std::chrono::milliseconds(10)) == std::future_status::ready) {
    std::cout << "Ready\n";
} else {
    std::cout << "Not ready\n";
}

int val = fut.get();

// Can we still call get() after wait_for()?
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Yes, future remains valid

**Explanation:** wait_for() does not consume future; get() can still be called afterward

**Key Concept:** non-destructive wait

</details>

---

#### Q9
```cpp
std::promise<void> prom;
std::future<void> fut = prom.get_future();

std::thread t([prom = std::move(prom)]() mutable {
    std::cout << "Task done\n";
    prom.set_value();
});

fut.get();
std::cout << "Main done\n";
t.join();

// What is the order of output?
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** "Task done", "Main done"

**Explanation:** Promise set_value() unblocks fut.get(), ensuring task output before main output

**Key Concept:** synchronization order

</details>

---

#### Q10
```cpp
std::packaged_task<int()> task([]{ return 42; });
std::future<int> fut = task.get_future();

// Task not executed yet

int val = fut.get();

// What happens? Will this block forever?
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Blocks forever

**Explanation:** Packaged_task not executed; get() waits indefinitely for value that never arrives

**Key Concept:** task execution requirement

</details>

---

#### Q11
```cpp
std::promise<int> prom;
std::future<int> fut = prom.get_future();

prom.set_value(10);
prom.set_value(20);

// What happens at the second set_value?
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Throws std::future_error

**Explanation:** Second set_value() throws promise_already_satisfied

**Key Concept:** single-set promise

</details>

---

#### Q12
```cpp
std::shared_future<int> create_shared() {
    std::promise<int> prom;
    prom.set_value(42);
    return prom.get_future().share();
}

auto sf = create_shared();
int a = sf.get();
int b = sf.get();

// Can we call get() twice on shared_future?
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Yes, both succeed

**Explanation:** shared_future allows multiple get() calls; both return 42

**Key Concept:** shared_future semantics

</details>

---

#### Q13
```cpp
auto fut1 = std::async(std::launch::async, []{ return 1; });
auto fut2 = std::move(fut1);

std::cout << fut1.valid() << " " << fut2.valid() << "\n";

// What is the output?
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** 0 1

**Explanation:** fut1 invalid after move (0), fut2 valid with ownership (1)

**Key Concept:** move semantics

</details>

---

#### Q14
```cpp
std::promise<int> prom;
std::future<int> fut = prom.get_future();

std::promise<int> prom2 = std::move(prom);

prom2.set_value(42);
int val = fut.get();

// Does moving the promise affect the future?
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** No effect, val = 42

**Explanation:** Moving promise does not invalidate future; shared state remains accessible

**Key Concept:** shared state stability

</details>

---

#### Q15
```cpp
auto fut = std::async([]{ return 42; });  // Default policy

// Is this guaranteed to run in a separate thread?
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** No guarantee

**Explanation:** Default policy allows implementation to choose; may be deferred

**Key Concept:** launch policy ambiguity

</details>

---

#### Q16
```cpp
std::promise<int> prom;
std::future<int> fut = prom.get_future();

// Promise destroyed without setting value

try {
    int val = fut.get();
} catch (const std::future_error& e) {
    std::cout << "Error\n";
}

// What exception is thrown?
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** future_error: broken_promise

**Explanation:** Promise destroyed without setting value triggers broken_promise exception

**Key Concept:** broken promise

</details>

---

#### Q17
```cpp
std::future<int> create_future() {
    return std::async(std::launch::deferred, []{ return 42; });
}

auto fut = create_future();
std::cout << "After create\n";
int val = fut.get();
std::cout << "After get: " << val << "\n";

// When does the task execute?
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** On fut.get() call

**Explanation:** Deferred task executes synchronously when get() invoked

**Key Concept:** lazy evaluation

</details>

---

#### Q18
```cpp
std::promise<int> prom;
std::future<int> fut = prom.get_future();

try {
    prom.set_exception(std::make_exception_ptr(std::runtime_error("Error")));
    int val = fut.get();
} catch (const std::runtime_error& e) {
    std::cout << "Caught: " << e.what() << "\n";
}

// What is the output?
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** "Caught: Error"

**Explanation:** Exception set via set_exception() and rethrown on get()

**Key Concept:** exception propagation

</details>

---

#### Q19
```cpp
std::vector<std::future<int>> futures;

for (int i = 0; i < 5; ++i) {
    futures.push_back(std::async(std::launch::async, [i]{ return i * 2; }));
}

for (auto& fut : futures) {
    std::cout << fut.get() << " ";
}

// What is the output pattern?
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** 0 2 4 6 8 (order may vary)

**Explanation:** Five async tasks run in parallel, results retrieved in loop order

**Key Concept:** parallel execution

</details>

---

#### Q20
```cpp
std::promise<int> prom;
std::future<int> fut = prom.get_future();

std::thread t([&prom] {
    prom.set_value(42);
    prom.set_value(100);  // Second set
});

t.join();
int val = fut.get();

// What happens in the thread?
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Thread throws future_error

**Explanation:** Second set_value() throws promise_already_satisfied; program likely terminates

**Key Concept:** promise single-use error

</details>

---


### QUICK_REFERENCE: Answer Key and Summary Tables

#### Answer Key for Practice Questions

| Q# | Answer | Explanation | Key Concept |
|----|--------|-------------|-------------|
| 1 | Lambda executes during fut.get() | Deferred execution runs synchronously when get() or wait() is called | launch::deferred |
| 2 | Throws std::future_error | Second get() throws future_error with no_state because future is single-use | single-use future |
| 3 | "Done" prints after 2 seconds | Future destructor from async blocks until task completes | blocking destructor |
| 4 | Correct, val = 42 | Promise properly moved into thread, set_value called, future receives value | promise move semantics |
| 5 | Exception not thrown during sleep | Exception stored in shared state, rethrown on fut.get() call | exception propagation |
| 6 | 0, 1, 0 | Default-constructed invalid (0), after async valid (1), after get() invalid (0) | future validity |
| 7 | Unsafe: race condition | Detached thread may not complete before main exits; also lambda capture by reference dangerous | detached thread hazard |
| 8 | Yes, future remains valid | wait_for() does not consume future; get() can still be called afterward | non-destructive wait |
| 9 | "Task done", "Main done" | Promise set_value() unblocks fut.get(), ensuring task output before main output | synchronization order |
| 10 | Blocks forever | Packaged_task not executed; get() waits indefinitely for value that never arrives | task execution requirement |
| 11 | Throws std::future_error | Second set_value() throws promise_already_satisfied | single-set promise |
| 12 | Yes, both succeed | shared_future allows multiple get() calls; both return 42 | shared_future semantics |
| 13 | 0 1 | fut1 invalid after move (0), fut2 valid with ownership (1) | move semantics |
| 14 | No effect, val = 42 | Moving promise does not invalidate future; shared state remains accessible | shared state stability |
| 15 | No guarantee | Default policy allows implementation to choose; may be deferred | launch policy ambiguity |
| 16 | future_error: broken_promise | Promise destroyed without setting value triggers broken_promise exception | broken promise |
| 17 | On fut.get() call | Deferred task executes synchronously when get() invoked | lazy evaluation |
| 18 | "Caught: Error" | Exception set via set_exception() and rethrown on get() | exception propagation |
| 19 | 0 2 4 6 8 (order may vary) | Five async tasks run in parallel, results retrieved in loop order | parallel execution |
| 20 | Thread throws future_error | Second set_value() throws promise_already_satisfied; program likely terminates | promise single-use error |

#### std::async Launch Policies

| Policy | Execution Timing | Thread Creation | Use Case |
|--------|-----------------|-----------------|----------|
| launch::async | Immediate, parallel | New thread guaranteed | True parallelism, independent tasks |
| launch::deferred | Lazy, on get/wait | No thread (synchronous) | Optional computation, may not be needed |
| Default (async\|deferred) | Implementation-defined | May or may not create | Not recommended: unpredictable behavior |

#### Future vs Shared_Future Comparison

| Feature | std::future | std::shared_future |
|---------|-------------|-------------------|
| Copyable | ❌ Move-only | ✅ Copyable |
| Multiple get() calls | ❌ Single-use | ✅ Non-destructive |
| Use case | Single consumer | Multiple consumers |
| Performance | Slightly faster | Small overhead for shared state |
| Conversion | Use share() | Construct from future |

#### Promise Operations and Errors

| Operation | Effect | Errors |
|-----------|--------|--------|
| set_value(val) | Sets result, unblocks future | promise_already_satisfied if called twice |
| set_exception(ptr) | Sets exception, future rethrows on get() | promise_already_satisfied if already set |
| get_future() | Returns associated future | future_already_retrieved if called twice |
| Destructor | If not set, future receives broken_promise | N/A |

#### Future Operations Reference

| Operation | Blocks | Consumes Future | Returns | Use Case |
|-----------|--------|-----------------|---------|----------|
| get() | ✅ Until ready | ✅ Invalidates | Value or rethrows exception | Retrieve result |
| wait() | ✅ Until ready | ❌ Remains valid | void | Synchronize without value |
| wait_for(duration) | ⏱️ Until ready or timeout | ❌ Remains valid | future_status | Bounded waiting |
| wait_until(timepoint) | ⏱️ Until ready or deadline | ❌ Remains valid | future_status | Deadline-based waiting |
| valid() | ❌ | ❌ | bool | Check if future has shared state |
| share() | ❌ | ✅ Converts to shared_future | shared_future | Enable multiple consumers |

#### Common Mistakes and Solutions

| Mistake | Problem | Solution |
|---------|---------|----------|
| Relying on default launch policy | Unpredictable execution (often deferred) | Always specify launch::async or launch::deferred |
| Calling get() twice | future_error: no_state | Use shared_future for multiple consumers |
| Ignoring future destructor blocking | Unexpected latency in async futures | Explicitly call get() or wait() before destruction |
| Not setting promise value | Future waits forever or gets broken_promise | Use RAII wrappers to set default values |
| Forgetting to check exceptions | Silent failures | Always call get() or wait() to detect errors |
| Mixing async with detached threads | Lifetime issues | Use async for short tasks, threads for long-lived workers |

#### Autonomous Driving Use Cases

| Scenario | Async Primitive | Rationale |
|----------|----------------|-----------|
| Sensor frame processing | std::async with launch::async | Parallel processing of camera/lidar frames |
| Calibration initialization | std::promise + std::future | Callback-based driver signals completion |
| Planning result delivery | std::packaged_task in thread pool | Queue planning tasks, retrieve trajectories via futures |
| Emergency stop signaling | std::promise<void> | Safety-critical completion notification |
| Timeout-based perception | future.wait_for() with deadlines | Bounded waiting for real-time constraints |
| Broadcasting map updates | std::shared_future | Distribute updated HD map to multiple modules |
