# Topic 4: Thread Pool from Scratch

### THEORY_SECTION: Core Concepts and Foundations
#### 1. What is a Thread Pool?

A **thread pool** is a collection of pre-created worker threads that execute tasks from a shared queue.

**Benefits:**
- ✅ **Avoid thread creation overhead** (threads are expensive to create/destroy)
- ✅ **Limit concurrency** (control max number of active threads)
- ✅ **Better resource utilization** (reuse threads for multiple tasks)
- ✅ **Task scheduling** (prioritize important work)

**Typical architecture:**

```
        ┌──────────────┐
        │  Task Queue  │
        └──────┬───────┘
               │
       ┌───────┴────────┐
       │                │
┌──────▼──────┐ ┌───────▼──────┐
│  Worker 1   │ │  Worker 2    │ ...
│ (Thread)    │ │ (Thread)     │
└─────────────┘ └──────────────┘
```

**Worker loop:**
```
while (pool_running):
    task = queue.pop()  // Blocking wait
    task.execute()
```

---

#### 2. Design Decisions

#### **2.1 Task Representation**

**Option 1: `std::function<void()>`**
```cpp
using Task = std::function<void()>;
```
- Simple, type-erased
- No return value

**Option 2: `std::packaged_task`**
```cpp
using Task = std::packaged_task<void()>;
```
- Can return values via `std::future`
- Supports exceptions

**Option 3: Custom callable wrapper**
```cpp
template<typename F>
struct Task {
    F func;
    void operator()() { func(); }
};
```

**We'll use `std::function` for simplicity**, with `std::future` support via `std::packaged_task`.

---

#### **2.2 Queue Type**

**Unbounded queue:**
- Tasks can accumulate without limit
- Risk of memory exhaustion

**Bounded queue:**
- Fixed capacity
- `submit()` blocks when full
- Prevents overload

**We'll implement bounded queue** (Topic 2 reused).

---

#### **2.3 Thread Count**

**Fixed pool:**
- Create N threads at construction
- Simple, predictable

**Dynamic pool:**
- Adjust thread count based on load
- More complex (thread creation/destruction logic)

**We'll implement fixed pool** (simpler).

---

#### **2.4 Shutdown Strategy**

**Graceful shutdown:**
1. Stop accepting new tasks
2. Wait for queued tasks to finish
3. Join all worker threads

**Immediate shutdown:**
1. Stop accepting new tasks
2. Discard queued tasks
3. Join all worker threads

**We'll implement both**.

---

#### 3. Thread Pool Components

**1. Task Queue:**
- Thread-safe bounded queue (from Topic 2)
- Holds `std::function<void()>` tasks

**2. Worker Threads:**
- Each runs a loop: pop task → execute → repeat
- Block when queue empty

**3. Shutdown Signal:**
- Atomic flag: `is_running_`
- Workers check this flag

**4. Future Support:**
- `std::packaged_task` wraps callable
- Returns `std::future` for result

---

#### 4. Exception Handling

**Uncaught exceptions in tasks will terminate the program** (unless caught).

**Solutions:**

**Option 1: Catch in worker loop**
```cpp
try {
    task();
} catch (...) {
    // Log or ignore
}
```

**Option 2: Propagate via std::future**
```cpp
std::packaged_task<void()> pt(task);
auto fut = pt.get_future();
pt();  // Exception stored in future
fut.get();  // Throws here
```

**We'll use Option 1** (catch all exceptions to prevent worker death).

---



```cpp
#include <vector>
#include <queue>
#include <thread>
#include <mutex>
#include <condition_variable>
#include <functional>
#include <future>
#include <stdexcept>
#include <atomic>
#include <iostream>

class ThreadPool {
private:
    // Worker threads
    std::vector<std::thread> workers_;

    // Task queue
    std::queue<std::function<void()>> tasks_;

    // Synchronization
    std::mutex queue_mutex_;
    std::condition_variable condition_;

    // State
    std::atomic<bool> stop_{false};       // Stop accepting new tasks
    std::atomic<bool> terminate_{false};  // Immediate shutdown flag

    // Statistics (optional)
    std::atomic<size_t> active_tasks_{0};
    std::atomic<size_t> total_tasks_{0};

public:
    // ============================================================
    // CONSTRUCTOR
    // ============================================================

    explicit ThreadPool(size_t num_threads = std::thread::hardware_concurrency())
    {
        if (num_threads == 0) {
            throw std::invalid_argument("Thread count must be > 0");
        }

        workers_.reserve(num_threads);

        // Create worker threads
        for (size_t i = 0; i < num_threads; ++i) {
            workers_.emplace_back([this, i]() {
                worker_loop(i);
            });
        }
    }

    // ============================================================
    // DESTRUCTOR - Graceful Shutdown
    // ============================================================

    ~ThreadPool() {
        shutdown();
    }

    // Disable copy/move (managing threads)
    ThreadPool(const ThreadPool&) = delete;
    ThreadPool& operator=(const ThreadPool&) = delete;
    ThreadPool(ThreadPool&&) = delete;
    ThreadPool& operator=(ThreadPool&&) = delete;

    // ============================================================
    // SUBMIT TASK (FIRE-AND-FORGET)
    // ============================================================

    template<typename F, typename... Args>
    void submit(F&& f, Args&&... args) {
        if (stop_.load(std::memory_order_acquire)) {
            throw std::runtime_error("Cannot submit to stopped pool");
        }

        {
            std::lock_guard<std::mutex> lock(queue_mutex_);

            // Bind arguments to create zero-argument callable
            tasks_.emplace([f = std::forward<F>(f),
                           ...args = std::forward<Args>(args)]() mutable {
                f(std::forward<Args>(args)...);
            });

            total_tasks_.fetch_add(1, std::memory_order_relaxed);
        }

        // Wake one waiting worker
        condition_.notify_one();
    }

    // ============================================================
    // SUBMIT TASK (WITH FUTURE FOR RESULT)
    // ============================================================

    template<typename F, typename... Args>
    auto submit_with_result(F&& f, Args&&... args)
        -> std::future<std::invoke_result_t<F, Args...>>
    {
        using ReturnType = std::invoke_result_t<F, Args...>;

        if (stop_.load(std::memory_order_acquire)) {
            throw std::runtime_error("Cannot submit to stopped pool");
        }

        // Create packaged_task with bound arguments
        auto task = std::make_shared<std::packaged_task<ReturnType()>>(
            std::bind(std::forward<F>(f), std::forward<Args>(args)...)
        );

        std::future<ReturnType> result = task->get_future();

        {
            std::lock_guard<std::mutex> lock(queue_mutex_);

            tasks_.emplace([task]() {
                (*task)();
            });

            total_tasks_.fetch_add(1, std::memory_order_relaxed);
        }

        condition_.notify_one();

        return result;
    }

    // ============================================================
    // SHUTDOWN
    // ============================================================

    // Graceful shutdown: finish queued tasks
    void shutdown() {
        {
            std::lock_guard<std::mutex> lock(queue_mutex_);
            if (stop_.load(std::memory_order_relaxed)) {
                return;  // Already stopped
            }
            stop_.store(true, std::memory_order_release);
        }

        // Wake all workers
        condition_.notify_all();

        // Join all threads
        for (auto& worker : workers_) {
            if (worker.joinable()) {
                worker.join();
            }
        }
    }

    // Immediate shutdown: discard queued tasks
    void shutdown_now() {
        {
            std::lock_guard<std::mutex> lock(queue_mutex_);
            if (terminate_.load(std::memory_order_relaxed)) {
                return;
            }

            stop_.store(true, std::memory_order_release);
            terminate_.store(true, std::memory_order_release);

            // Clear task queue
            std::queue<std::function<void()>> empty;
            std::swap(tasks_, empty);
        }

        condition_.notify_all();

        for (auto& worker : workers_) {
            if (worker.joinable()) {
                worker.join();
            }
        }
    }

    // ============================================================
    // QUERY OPERATIONS
    // ============================================================

    size_t thread_count() const {
        return workers_.size();
    }

    size_t queued_tasks() const {
        std::lock_guard<std::mutex> lock(queue_mutex_);
        return tasks_.size();
    }

    size_t active_tasks() const {
        return active_tasks_.load(std::memory_order_relaxed);
    }

    size_t total_tasks() const {
        return total_tasks_.load(std::memory_order_relaxed);
    }

    bool is_stopped() const {
        return stop_.load(std::memory_order_acquire);
    }

private:
    // ============================================================
    // WORKER LOOP (RUNS IN EACH THREAD)
    // ============================================================

    void worker_loop(size_t worker_id) {
        while (true) {
            std::function<void()> task;

            {
                std::unique_lock<std::mutex> lock(queue_mutex_);

                // Wait for task or shutdown
                condition_.wait(lock, [this]() {
                    return !tasks_.empty() ||
                           stop_.load(std::memory_order_relaxed);
                });

                // Exit if stopped and no tasks remain
                if (stop_.load(std::memory_order_relaxed)) {
                    if (tasks_.empty() || terminate_.load(std::memory_order_relaxed)) {
                        return;  // Exit thread
                    }
                }

                // Pop task
                if (!tasks_.empty()) {
                    task = std::move(tasks_.front());
                    tasks_.pop();
                }
            }

            // Execute task (outside lock)
            if (task) {
                active_tasks_.fetch_add(1, std::memory_order_relaxed);

                try {
                    task();
                } catch (const std::exception& e) {
                    std::cerr << "Worker " << worker_id
                              << " caught exception: " << e.what() << '\n';
                } catch (...) {
                    std::cerr << "Worker " << worker_id
                              << " caught unknown exception\n";
                }

                active_tasks_.fetch_sub(1, std::memory_order_relaxed);
            }
        }
    }
};
```

---

### EDGE_CASES: Tricky Scenarios and Deep Internals
#### Edge Case 1: Submit After Shutdown

**Problem:** Calling `submit()` after `shutdown()` may crash.

```cpp
pool.shutdown();
pool.submit([]() { /* ... */ });  // ← Should throw
```

**Solution:** Check `stop_` flag:

```cpp
if (stop_.load(std::memory_order_acquire)) {
    throw std::runtime_error("Cannot submit to stopped pool");
}
```

---

#### Edge Case 2: Exception in Task

**Problem:** Uncaught exception terminates worker thread.

```cpp
pool.submit([]() {
    throw std::runtime_error("Task failed");
    // Worker dies, pool has fewer threads!
});
```

**Solution:** Catch all exceptions in worker loop:

```cpp
try {
    task();
} catch (const std::exception& e) {
    std::cerr << "Caught: " << e.what() << '\n';
} catch (...) {
    std::cerr << "Unknown exception\n";
}
```

---

#### Edge Case 3: Deadlock on Shutdown

**Problem:** Worker waits on condition variable, shutdown doesn't notify.

```cpp
void shutdown() {
    stop_ = true;
    // Forgot: condition_.notify_all();
    for (auto& t : workers_) t.join();  // Hangs forever
}
```

**Solution:** Always notify after setting stop flag:

```cpp
stop_.store(true, std::memory_order_release);
condition_.notify_all();  // Wake all workers
```

---

#### Edge Case 4: Double Shutdown

**Problem:** Calling `shutdown()` twice may cause issues.

```cpp
pool.shutdown();
pool.shutdown();  // ← May hang or crash
```

**Solution:** Check if already stopped:

```cpp
void shutdown() {
    if (stop_.load(std::memory_order_relaxed)) {
        return;  // Already stopped
    }
    // ... shutdown logic ...
}
```

---

#### Edge Case 5: Task Captures Reference to Stack Variable

**Problem:** Task outlives captured variable.

```cpp
void foo() {
    ThreadPool pool(4);
    int x = 42;

    pool.submit([&x]() {
        std::cout << x << '\n';  // ← DANGER: x may be destroyed
    });

    // Function returns before task executes → x destroyed → UB
}
```

**Solution:**
- Capture by value: `[x]`
- Or use `shared_ptr`: `[ptr = std::make_shared<int>(42)]`

---

### CODE_EXAMPLES: Practical Demonstrations
#### Example 1: Basic Task Submission

**This example demonstrates core thread pool functionality: distributing tasks across a fixed number of worker threads for parallel execution.**

**What this code does:**
- Creates thread pool with 4 worker threads
- Submits 10 tasks (more tasks than threads, demonstrating queuing)
- Each task prints its ID and the thread executing it, then sleeps 100ms
- Tasks execute concurrently (4 at a time), remaining tasks queue
- Main thread waits 1 second for completion, then graceful shutdown

**Key concepts demonstrated:**
- **Thread reuse**: Same 4 threads execute all 10 tasks (no thread creation overhead per task)
- **Task queuing**: When all workers busy, tasks wait in queue (FIFO order)
- **Concurrency**: Output interleaves showing true parallelism (4 tasks run simultaneously)
- **Graceful shutdown**: Destructor waits for queued tasks to complete before joining threads
- **Fire-and-forget submission**: submit() returns immediately, task executes asynchronously

**Real-world applications:**
- Web servers handling multiple HTTP requests with limited threads
- Image processing pipeline (resize, compress, watermark operations)
- Database connection pools executing queries
- Background job processors (email sending, report generation)
- Parallel test execution frameworks

**Why this matters:**
- **Resource control**: Limit concurrent threads to prevent oversubscription (CPU cores limit)
- **Better than std::async**: async may create unbounded threads; thread pool controls max concurrency
- **Improved latency**: Avoid thread creation cost (~50-100μs) per task
- **Fairness**: FIFO queue ensures tasks processed in submission order

**Performance implications:**
- Thread creation avoided: 10 tasks, 0 thread creations (vs 10 with std::thread per task)
- Context switching: Only 4 threads compete for CPU (vs potential 10+ with naive approach)
- Memory footprint: 4 × ~1MB stack = 4MB (vs 10MB for thread-per-task)

```cpp
#include <iostream>
#include <chrono>

void task(int id) {
    std::cout << "Task " << id << " starting on thread "
              << std::this_thread::get_id() << '\n';

    std::this_thread::sleep_for(std::chrono::milliseconds(100));

    std::cout << "Task " << id << " completed\n";
}

int main() {
    ThreadPool pool(4);  // 4 worker threads

    // Submit 10 tasks
    for (int i = 0; i < 10; ++i) {
        pool.submit(task, i);
    }

    // Wait for all tasks to complete
    std::this_thread::sleep_for(std::chrono::seconds(1));

    pool.shutdown();

    std::cout << "Total tasks processed: " << pool.total_tasks() << '\n';

    return 0;
}
```

**Output (interleaved):**
```
Task 0 starting on thread 140234567
Task 1 starting on thread 140234568
Task 2 starting on thread 140234569
Task 3 starting on thread 140234570
Task 0 completed
Task 4 starting on thread 140234567
...
Total tasks processed: 10
```

---

#### Example 2: Using Futures for Results

**This example demonstrates returning values from thread pool tasks using std::future for synchronization and result retrieval.**

**What this code does:**
- Submits 10 parallel tasks, each computing sum of 1000-element range
- `submit_with_result()` returns `std::future<int>` for each task
- Main thread collects results by calling `fut.get()` (blocks until result ready)
- Aggregates partial sums into final total
- Demonstrates map-reduce pattern: parallel computation + sequential reduction

**Key concepts demonstrated:**
- **std::packaged_task**: Wraps callable with future, stores result/exception
- **Synchronization via futures**: `fut.get()` blocks until task completes (implicit join)
- **Exception propagation**: If task throws, exception stored in future and rethrown on `get()`
- **Type safety**: Future's template parameter ensures type-correct result retrieval
- **Parallel map-reduce**: Divide work across threads, combine results in main thread

**Real-world applications:**
- Parallel numerical computations (matrix operations, Monte Carlo simulations)
- Distributed search (search different parts of dataset in parallel)
- Parallel file processing (parse multiple files, aggregate results)
- Concurrent HTTP requests (fetch from multiple APIs, combine responses)
- Divide-and-conquer algorithms parallelization

**Why this matters:**
- **Clean result handling**: Futures provide type-safe result passing without shared state
- **Automatic synchronization**: No need for manual mutexes/condition variables
- **Exception safety**: Errors propagate cleanly without crashing worker threads
- **Scalability**: Easily parallelize embarrassingly parallel workloads

**Performance implications:**
- Speedup: Ideally ~4× on 4-core CPU (if tasks are CPU-bound and equal-sized)
- Actual speedup: Limited by Amdahl's law (sequential `get()` calls and aggregation)
- Memory: Each future holds result, so 10 futures = 10 ints (~40 bytes)
- Cache effects: Better locality if ranges are contiguous (less cache thrashing)

```cpp
#include <iostream>
#include <numeric>
#include <vector>

int sum_range(int start, int end) {
    int sum = 0;
    for (int i = start; i < end; ++i) {
        sum += i;
    }
    return sum;
}

int main() {
    ThreadPool pool(4);

    std::vector<std::future<int>> futures;

    // Submit 10 parallel sum tasks
    for (int i = 0; i < 10; ++i) {
        futures.push_back(
            pool.submit_with_result(sum_range, i * 1000, (i + 1) * 1000)
        );
    }

    // Collect results
    int total = 0;
    for (auto& fut : futures) {
        total += fut.get();  // Blocks until result ready
    }

    std::cout << "Total sum: " << total << '\n';

    pool.shutdown();

    return 0;
}
```

**Output:**
```
Total sum: 4995000
```

---

#### Example 3: Parallel Matrix Multiplication

**This example demonstrates parallelizing matrix multiplication by distributing row computations across thread pool workers.**

**What this code does:**
- Multiplies two 2×2 matrices (A × B = C) using thread pool
- Each row of result matrix C computed by separate task
- Creates future for each row computation (2 futures for 2×2 matrix)
- Main thread waits for all row computations via `fut.get()`
- Result matrix built collaboratively by parallel workers

**Key concepts demonstrated:**
- **Row-wise parallelization**: Each row independent, perfect for parallel computation
- **std::ref for shared state**: Pass matrices by reference to avoid copying into lambdas
- **Synchronization barrier**: Loop of `get()` calls acts as barrier (all rows must complete)
- **Load balancing**: std::thread::hardware_concurrency() adapts pool size to CPU cores
- **Data parallelism**: Same operation (row multiplication) on different data (different rows)

**Real-world applications:**
- Scientific computing libraries (BLAS, Eigen with threading)
- Graphics pipelines (transformation matrix chains)
- Neural network inference (parallel layer computations)
- Image processing (convolution operations)
- Physics simulations (force calculations on particle systems)

**Why this matters:**
- **Scalability**: For large matrices (1000×1000), N-core CPU gives ~N× speedup
- **Flexibility**: Can choose granularity (rows vs blocks vs elements)
- **Cache efficiency**: Row-wise access is cache-friendly (contiguous memory)
- **Easy parallelization**: Minimal code changes from serial implementation

**Performance implications:**
- Small matrices (2×2): Overhead dominates, serial likely faster
- Large matrices (1000×1000): Thread pool shines, near-linear speedup
- Optimal task size: Rows should be large enough to amortize task submission overhead
- Memory bandwidth: May become bottleneck (matrix data transfer to/from cache)

**Optimization considerations:**
- For small matrices: Use serial code (overhead exceeds benefit)
- For huge matrices: Block-based parallelization for better cache locality
- SIMD: Combine with vectorization (SSE/AVX) for additional speedup

```cpp
#include <vector>
#include <iostream>

using Matrix = std::vector<std::vector<int>>;

void multiply_row(const Matrix& A, const Matrix& B, Matrix& C, int row) {
    int n = B[0].size();
    int k = B.size();

    for (int col = 0; col < n; ++col) {
        C[row][col] = 0;
        for (int i = 0; i < k; ++i) {
            C[row][col] += A[row][i] * B[i][col];
        }
    }
}

Matrix parallel_matmul(const Matrix& A, const Matrix& B) {
    int m = A.size();
    int n = B[0].size();

    Matrix C(m, std::vector<int>(n, 0));

    ThreadPool pool(std::thread::hardware_concurrency());

    std::vector<std::future<void>> futures;

    // Each row computed in parallel
    for (int row = 0; row < m; ++row) {
        futures.push_back(
            pool.submit_with_result(multiply_row,
                                    std::ref(A), std::ref(B), std::ref(C), row)
        );
    }

    // Wait for all rows
    for (auto& fut : futures) {
        fut.get();
    }

    return C;
}

int main() {
    Matrix A = {{1, 2}, {3, 4}};
    Matrix B = {{5, 6}, {7, 8}};

    Matrix C = parallel_matmul(A, B);

    std::cout << "Result:\n";
    for (const auto& row : C) {
        for (int val : row) {
            std::cout << val << " ";
        }
        std::cout << '\n';
    }

    return 0;
}
```

**Output:**
```
Result:
19 22
43 50
```

---

#### Example 4: Immediate Shutdown vs Graceful

**This example compares graceful shutdown (completes queued tasks) vs immediate shutdown (discards queued tasks) in thread pools.**

**What this code does:**
- Defines long-running task (2-second sleep) to make queue behavior visible
- **Graceful test**: Submits 5 tasks to 2-worker pool, waits 100ms, calls `shutdown()`
  - First 2 tasks start immediately
  - Remaining 3 queue
  - shutdown() waits for all 5 to finish (~10 seconds total)
- **Immediate test**: Same setup but calls `shutdown_now()`
  - First 2 tasks complete (already running)
  - Remaining 3 discarded
  - shutdown_now() returns quickly (~4 seconds)

**Key concepts demonstrated:**
- **Graceful shutdown semantics**: Honor all submitted work, useful for critical tasks
- **Immediate shutdown semantics**: Abort pending work, useful for cleanup/cancellation
- **Running vs queued**: shutdown_now() cannot stop running tasks (no thread cancellation in C++)
- **Resource cleanup**: Both methods join threads before returning (safe destruction)
- **Policy choice**: Application decides between throughput (graceful) and responsiveness (immediate)

**Real-world applications:**
- **Graceful**: Web server shutdown (finish in-flight requests), batch job processor
- **Immediate**: Interactive application exit (discard background tasks), timeout handling
- **Hybrid**: Critical tasks use graceful, optional tasks use immediate
- **Staged shutdown**: First try graceful with timeout, fallback to immediate

**Why this matters:**
- **User experience**: Graceful prevents data loss; immediate prevents hang on exit
- **Resource management**: Immediate releases resources faster (important in tight loops)
- **Testing**: Immediate shutdown reduces test runtime (don't wait for all tasks)
- **Error handling**: Immediate useful when exception detected (abort remaining work)

**Performance implications:**
- Graceful: Predictable completion (all tasks finish), longer shutdown time
- Immediate: Faster shutdown (~2× in this example), potential wasted work
- Memory: Immediate frees task queue earlier (matters with large queued tasks)

**Design decisions:**
- Destructor uses graceful shutdown (safe default, prevents task loss)
- Provide explicit shutdown_now() for applications needing fast exit
- Document behavior clearly (surprising behavior causes bugs)

```cpp
#include <iostream>
#include <chrono>

void long_task(int id) {
    std::cout << "Task " << id << " started\n";
    std::this_thread::sleep_for(std::chrono::seconds(2));
    std::cout << "Task " << id << " completed\n";
}

void test_graceful_shutdown() {
    std::cout << "=== Graceful Shutdown ===\n";
    ThreadPool pool(2);

    for (int i = 0; i < 5; ++i) {
        pool.submit(long_task, i);
    }

    std::this_thread::sleep_for(std::chrono::milliseconds(100));

    std::cout << "Shutting down gracefully...\n";
    pool.shutdown();  // Waits for all 5 tasks
    std::cout << "All tasks completed\n\n";
}

void test_immediate_shutdown() {
    std::cout << "=== Immediate Shutdown ===\n";
    ThreadPool pool(2);

    for (int i = 0; i < 5; ++i) {
        pool.submit(long_task, i);
    }

    std::this_thread::sleep_for(std::chrono::milliseconds(100));

    std::cout << "Shutting down immediately...\n";
    pool.shutdown_now();  // Only running tasks finish, queued discarded
    std::cout << "Shutdown complete\n\n";
}

int main() {
    test_graceful_shutdown();
    test_immediate_shutdown();

    return 0;
}
```

**Output:**
```
=== Graceful Shutdown ===
Task 0 started
Task 1 started
Shutting down gracefully...
Task 0 completed
Task 1 completed
Task 2 started
Task 3 started
Task 2 completed
Task 3 completed
Task 4 started
Task 4 completed
All tasks completed

=== Immediate Shutdown ===
Task 0 started
Task 1 started
Shutting down immediately...
Task 0 completed
Task 1 completed
Shutdown complete
```

---

### INTERVIEW_QA: Comprehensive Questions and Answers
#### Q1: Why use a thread pool instead of creating a thread per task?
Implement this exercise.

**Answer:**

**Thread creation is expensive:**
- Kernel-level resource allocation (~1 MB stack per thread)
- OS scheduler overhead
- Typical thread creation: 50-100 microseconds

**Example:**
```cpp
// BAD - creates 1000 threads:
for (int i = 0; i < 1000; ++i) {
    std::thread([i]() { work(i); }).detach();
}
// Overhead: 50-100 ms total
// Memory: ~1 GB (1 MB × 1000)

// GOOD - reuses 8 threads:
ThreadPool pool(8);
for (int i = 0; i < 1000; ++i) {
    pool.submit(work, i);
}
// Overhead: <1 ms
// Memory: ~8 MB
```

**Benefits of thread pool:**
- ✅ Amortize creation cost
- ✅ Limit concurrency (prevent oversubscription)
- ✅ Better cache locality (threads reused)

---
#### Q2: What is the ideal number of threads for a thread pool?
Implement this exercise.

**Answer:**

**Depends on workload:**

**CPU-bound tasks:**
- **Ideal:** `std::thread::hardware_concurrency()` (number of cores)
- More threads = wasted context switching

**I/O-bound tasks:**
- **Ideal:** 2× to 10× number of cores
- Threads block on I/O, more threads = better utilization

**Formula (empirical):**
```
Optimal threads = Cores × (1 + Wait_Time / Compute_Time)
```

**Example:**
- 8 cores
- Task: 20% compute, 80% I/O wait
- Wait/Compute ratio = 0.8 / 0.2 = 4
- Optimal threads = 8 × (1 + 4) = **40 threads**

**Best practice:** Make configurable, benchmark to find optimal value.

---
#### Q3: How does `std::packaged_task` work with futures?
Implement this exercise.

**Answer:**

**`std::packaged_task` wraps a callable and connects it to a `std::future`:**

```cpp
std::packaged_task<int(int, int)> task([](int a, int b) {
    return a + b;
});

std::future<int> result = task.get_future();

task(2, 3);  // Execute

int sum = result.get();  // Blocks until result ready, returns 5
```

**In thread pool:**
```cpp
auto task = std::make_shared<std::packaged_task<int()>>(
    std::bind(func, args...)
);

std::future<int> fut = task->get_future();

tasks_.emplace([task]() {
    (*task)();  // Execute, result stored in future
});

return fut;  // Caller can wait for result
```

**Key points:**
- Future and task share state (move-only)
- Exception propagation: task throws → stored in future → `get()` rethrows
- One-time use: can't call task twice

---
#### Q4: What happens if a worker thread throws an unhandled exception?
Implement this exercise.

**Answer:**

**Without catch:** Thread terminates, pool has fewer workers.

```cpp
void worker_loop() {
    while (!stop_) {
        task = get_task();
        task();  // ← Exception thrown here
        // Thread dies, never returns to loop!
    }
}
```

**Effect:**
- Pool permanently loses one worker
- Remaining workers handle all tasks (higher load)
- No notification (silent failure)

**Solution:** Catch all exceptions:

```cpp
try {
    task();
} catch (const std::exception& e) {
    log_error(e.what());
} catch (...) {
    log_error("Unknown exception");
}
// Worker continues running
```

**Alternative:** Propagate via future (if using `packaged_task`).

---
#### Q5: How would you implement task priorities?
Implement this exercise.

**Answer:**

**Replace `std::queue` with `std::priority_queue`:**

```cpp
struct PriorityTask {
    int priority;
    std::function<void()> func;

    bool operator<(const PriorityTask& other) const {
        return priority < other.priority;  // Higher priority first
    }
};

class PriorityThreadPool {
private:
    std::priority_queue<PriorityTask> tasks_;
    // ... rest same ...

public:
    void submit(std::function<void()> func, int priority) {
        std::lock_guard<std::mutex> lock(mutex_);
        tasks_.push(PriorityTask{priority, std::move(func)});
        cv_.notify_one();
    }

    void worker_loop() {
        while (true) {
            PriorityTask task;

            {
                std::unique_lock<std::mutex> lock(mutex_);
                cv_.wait(lock, [this]() { return !tasks_.empty() || stop_; });

                if (stop_ && tasks_.empty()) return;

                task = std::move(const_cast<PriorityTask&>(tasks_.top()));
                tasks_.pop();
            }

            task.func();
        }
    }
};
```

**Usage:**
```cpp
pool.submit(low_priority_task, 1);
pool.submit(high_priority_task, 10);
// high_priority_task executes first
```

---
#### Q6: How would you implement dynamic thread pool sizing?
Implement this exercise.

**Answer:**

**Strategy:**
- Monitor queue size
- If queue grows → spawn more threads (up to max)
- If idle → kill threads (down to min)

**Implementation sketch:**

```cpp
class DynamicThreadPool {
private:
    size_t min_threads_;
    size_t max_threads_;
    std::atomic<size_t> active_threads_{0};

    void monitor_loop() {
        while (!stop_) {
            std::this_thread::sleep_for(std::chrono::seconds(1));

            size_t queued = tasks_.size();
            size_t active = active_threads_.load();

            if (queued > 10 && active < max_threads_) {
                // Spawn new thread
                workers_.emplace_back([this]() { worker_loop(); });
                active_threads_.fetch_add(1);
            } else if (queued == 0 && active > min_threads_) {
                // Signal one thread to exit (complex - need ID tracking)
            }
        }
    }
};
```

**Challenges:**
- Thread creation latency (50-100μs)
- Oscillation (threads spawn/die repeatedly)
- Complexity (tracking thread IDs for selective shutdown)

**Better:** Use fixed pool, benchmark to find optimal size.

---
#### Q7: What is the difference between thread pool and `std::async`?
Implement this exercise.

**Answer:**

**`std::async`:**
- Launches **single task** (may or may not create thread)
- No thread reuse (implementation-defined)
- Returns `std::future`

```cpp
auto fut = std::async(std::launch::async, []() {
    return 42;
});
int result = fut.get();
```

**Thread pool:**
- **Reuses threads** for multiple tasks
- Explicitly controls concurrency
- More efficient for many small tasks

**Comparison:**

```cpp
// Using std::async (may create 1000 threads):
for (int i = 0; i < 1000; ++i) {
    futures.push_back(std::async(std::launch::async, work, i));
}

// Using thread pool (reuses 8 threads):
ThreadPool pool(8);
for (int i = 0; i < 1000; ++i) {
    futures.push_back(pool.submit_with_result(work, i));
}
```

**When to use `std::async`:** Single background task, simplicity.

**When to use thread pool:** Many tasks, performance critical.

---
#### Q8: How would you prevent a thread pool from being destroyed while tasks are running?
Implement this exercise.

**Answer:**

**Problem:** Destructor called while tasks executing → workers access destroyed queue → crash.

**Solution:** Graceful shutdown in destructor:

```cpp
~ThreadPool() {
    {
        std::lock_guard<std::mutex> lock(mutex_);
        stop_ = true;
    }

    cv_.notify_all();  // Wake all workers

    for (auto& worker : workers_) {
        if (worker.joinable()) {
            worker.join();  // Wait for completion
        }
    }

    // Now safe to destroy queue
}
```

**Alternative:** Use `std::shared_ptr` for pool:

```cpp
auto pool = std::make_shared<ThreadPool>(4);

pool->submit([pool]() {
    // Captures shared_ptr → keeps pool alive
    std::this_thread::sleep_for(std::chrono::seconds(10));
});

// pool can go out of scope, tasks keep it alive
```

---
#### Q9: What is work stealing? How would you implement it?
Implement this exercise.

**Answer:**

**Work stealing:** Idle threads steal tasks from busy threads' queues.

**Architecture:**
- Each thread has its own **local queue** (deque)
- Thread pops from its own queue (LIFO, cache-friendly)
- If empty, steals from another thread's queue (FIFO)

**Benefits:**
- Better cache locality (threads work on their own data)
- Load balancing (busy threads offload work)

**Implementation sketch:**

```cpp
class WorkStealingPool {
private:
    struct WorkerData {
        std::deque<Task> local_queue;
        std::mutex mutex;
    };

    std::vector<WorkerData> worker_queues_;

    void worker_loop(int id) {
        while (!stop_) {
            Task task;

            // Try local queue first
            {
                std::lock_guard<std::mutex> lock(worker_queues_[id].mutex);
                if (!worker_queues_[id].local_queue.empty()) {
                    task = std::move(worker_queues_[id].local_queue.back());
                    worker_queues_[id].local_queue.pop_back();
                }
            }

            // If empty, steal from random other queue
            if (!task) {
                int victim = (id + 1) % worker_queues_.size();
                std::lock_guard<std::mutex> lock(worker_queues_[victim].mutex);
                if (!worker_queues_[victim].local_queue.empty()) {
                    task = std::move(worker_queues_[victim].local_queue.front());
                    worker_queues_[victim].local_queue.pop_front();
                }
            }

            if (task) {
                task();
            } else {
                std::this_thread::yield();
            }
        }
    }
};
```

**Used by:** Intel TBB, Fork-Join pools.

---
#### Q10: How would you handle tasks that spawn more tasks?
**Answer:**

**Recursive task spawning:**

```cpp
void recursive_task(ThreadPool& pool, int depth) {
    if (depth == 0) return;

    pool.submit(recursive_task, std::ref(pool), depth - 1);
    pool.submit(recursive_task, std::ref(pool), depth - 1);
}
```

**Problem:** May deadlock if pool size < task tree depth.

**Solutions:**

**1) Unbounded queue:**
- Tasks never block on submit
- Risk of memory exhaustion

**2) Larger pool:**
- Ensure pool size > max recursion depth

**3) Inline execution when queue full:**
```cpp
void submit(Task task) {
    if (tasks_.size() >= capacity_) {
        task();  // Execute inline instead of queueing
    } else {
        tasks_.push(std::move(task));
    }
}
```

**4) Structured parallelism (C++20 executors):**
- Parent task waits for children
- Prevents unbounded spawning

---
### PRACTICE_TASKS: Output Prediction and Code Analysis
#### Q1
Add a `wait_for_all()` method that blocks until all submitted tasks complete.

Implement this exercise.

**Answer:**

```cpp
class ThreadPool {
private:
    std::atomic<size_t> active_tasks_{0};
    std::atomic<size_t> queued_tasks_{0};
    std::condition_variable all_done_cv_;
    std::mutex all_done_mutex_;

public:
    void submit(...) {
        // ...
        queued_tasks_.fetch_add(1);
    }

    void worker_loop() {
        // ...
        active_tasks_.fetch_add(1);
        queued_tasks_.fetch_sub(1);

        task();

        active_tasks_.fetch_sub(1);

        if (active_tasks_.load() == 0 && queued_tasks_.load() == 0) {
            all_done_cv_.notify_all();
        }
    }

    void wait_for_all() {
        std::unique_lock<std::mutex> lock(all_done_mutex_);
        all_done_cv_.wait(lock, [this]() {
            return active_tasks_.load() == 0 && queued_tasks_.load() == 0;
        });
    }
};
```

**Usage:**
```cpp
pool.submit(task1);
pool.submit(task2);
pool.wait_for_all();  // Blocks until both complete
std::cout << "All done\n";
```

---

#### Q2
Modify the pool to support task cancellation. How would you implement a `cancel(task_id)` method?

Implement this exercise.

**Answer:**

```cpp
class ThreadPool {
private:
    using TaskID = uint64_t;

    struct Task {
        TaskID id;
        std::function<void()> func;
        std::atomic<bool> cancelled{false};
    };

    std::atomic<TaskID> next_id_{0};
    std::map<TaskID, std::shared_ptr<Task>> tasks_;  // Track by ID

public:
    TaskID submit(std::function<void()> func) {
        TaskID id = next_id_.fetch_add(1);
        auto task = std::make_shared<Task>(Task{id, std::move(func), false});

        {
            std::lock_guard<std::mutex> lock(mutex_);
            tasks_[id] = task;
            task_queue_.push(task);
        }

        cv_.notify_one();
        return id;
    }

    bool cancel(TaskID id) {
        std::lock_guard<std::mutex> lock(mutex_);

        auto it = tasks_.find(id);
        if (it == tasks_.end()) {
            return false;  // Already executed or doesn't exist
        }

        it->second->cancelled.store(true);  // Mark cancelled
        return true;
    }

    void worker_loop() {
        // ...
        if (!task->cancelled.load()) {
            task->func();
        }
        // ...
    }
};
```

**Usage:**
```cpp
TaskID id = pool.submit(long_running_task);
std::this_thread::sleep_for(std::chrono::milliseconds(100));
pool.cancel(id);  // Cancel before execution
```

---

#### Q3
Implement a thread pool with timeout: tasks that run longer than X seconds are terminated.

Implement this exercise.

**Answer:**

**Not directly possible in C++** (no `pthread_cancel` equivalent).

**Workarounds:**

**Option 1: Cooperative cancellation (token-based):**

```cpp
class CancellationToken {
    std::atomic<bool> cancelled_{false};

public:
    void cancel() { cancelled_.store(true); }
    bool is_cancelled() const { return cancelled_.load(); }
};

void long_task(CancellationToken& token) {
    for (int i = 0; i < 1000000; ++i) {
        if (token.is_cancelled()) {
            std::cout << "Task cancelled\n";
            return;
        }
        // Work...
    }
}

// In pool:
auto token = std::make_shared<CancellationToken>();

auto timeout_future = std::async(std::launch::async, [token]() {
    std::this_thread::sleep_for(std::chrono::seconds(5));
    token->cancel();
});

pool.submit(long_task, std::ref(*token));
```

**Option 2: Separate process (kill via signal):**
- Fork process for each task
- Kill process if timeout
- Heavy overhead

**Best practice:** Design tasks to be interruptible (check flag periodically).

---

#### Q4
Add support for task dependencies: task B cannot run until task A completes.

Implement this exercise.

**Answer:**

```cpp
class ThreadPool {
private:
    struct Task {
        std::function<void()> func;
        std::vector<TaskID> dependencies;
        std::atomic<bool> ready{false};
    };

    std::map<TaskID, std::shared_ptr<Task>> tasks_;
    std::multimap<TaskID, TaskID> dependents_;  // dep_id → dependent_id

public:
    TaskID submit(std::function<void()> func,
                  std::vector<TaskID> dependencies = {}) {
        TaskID id = next_id_++;
        auto task = std::make_shared<Task>(Task{std::move(func), dependencies});

        {
            std::lock_guard<std::mutex> lock(mutex_);
            tasks_[id] = task;

            for (TaskID dep : dependencies) {
                dependents_.insert({dep, id});
            }

            if (dependencies.empty()) {
                task->ready = true;
                ready_queue_.push(task);
                cv_.notify_one();
            }
        }

        return id;
    }

    void on_task_complete(TaskID completed_id) {
        std::lock_guard<std::mutex> lock(mutex_);

        // Find all tasks dependent on this one
        auto range = dependents_.equal_range(completed_id);

        for (auto it = range.first; it != range.second; ++it) {
            TaskID dependent_id = it->second;
            auto& dependent_task = tasks_[dependent_id];

            // Remove this dependency
            auto& deps = dependent_task->dependencies;
            deps.erase(std::remove(deps.begin(), deps.end(), completed_id), deps.end());

            // If all dependencies met, make ready
            if (deps.empty()) {
                dependent_task->ready = true;
                ready_queue_.push(dependent_task);
                cv_.notify_one();
            }
        }
    }
};
```

**Usage:**
```cpp
TaskID task_a = pool.submit([]() { /* ... */ });
TaskID task_b = pool.submit([]() { /* ... */ }, {task_a});  // Depends on A
```

---

#### Q5
Benchmark thread pool vs serial execution for 1000 small tasks. At what task granularity does parallelism stop being beneficial?

Implement this exercise.

**Answer:**

```cpp
#include <chrono>
#include <iostream>

void benchmark(int task_duration_us) {
    const int NUM_TASKS = 1000;

    auto work = [task_duration_us]() {
        auto start = std::chrono::high_resolution_clock::now();
        while (std::chrono::duration_cast<std::chrono::microseconds>(
                   std::chrono::high_resolution_clock::now() - start
               ).count() < task_duration_us) {
            // Busy wait
        }
    };

    // Serial execution
    auto serial_start = std::chrono::high_resolution_clock::now();
    for (int i = 0; i < NUM_TASKS; ++i) {
        work();
    }
    auto serial_duration = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::high_resolution_clock::now() - serial_start
    ).count();

    // Parallel execution
    ThreadPool pool(std::thread::hardware_concurrency());

    auto parallel_start = std::chrono::high_resolution_clock::now();
    for (int i = 0; i < NUM_TASKS; ++i) {
        pool.submit(work);
    }
    pool.wait_for_all();
    auto parallel_duration = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::high_resolution_clock::now() - parallel_start
    ).count();

    std::cout << "Task duration: " << task_duration_us << " μs\n";
    std::cout << "  Serial:   " << serial_duration << " ms\n";
    std::cout << "  Parallel: " << parallel_duration << " ms\n";
    std::cout << "  Speedup:  " << (float)serial_duration / parallel_duration << "x\n\n";
}

int main() {
    benchmark(1);      // 1 μs tasks
    benchmark(10);     // 10 μs tasks
    benchmark(100);    // 100 μs tasks
    benchmark(1000);   // 1 ms tasks

    return 0;
}
```

**Typical output (8-core CPU):**
```
Task duration: 1 μs
  Serial:   1 ms
  Parallel: 15 ms
  Speedup:  0.07x  ← Slower!

Task duration: 10 μs
  Serial:   10 ms
  Parallel: 8 ms
  Speedup:  1.25x

Task duration: 100 μs
  Serial:   100 ms
  Parallel: 15 ms
  Speedup:  6.67x

Task duration: 1000 μs
  Serial:   1000 ms
  Parallel: 130 ms
  Speedup:  7.69x
```

**Conclusion:** Parallelism beneficial when task > ~10-50 μs.

---

#### Additional Practice Questions 6-10


**Q6:** Implement a `pause()` and `resume()` method to temporarily stop task execution.

**Q7:** Add per-thread statistics tracking (tasks completed, total execution time).

**Q8:** Implement a thread pool that supports multiple priority levels (HIGH, MEDIUM, LOW).

**Q9:** Add a `drain()` method that removes all queued tasks and returns them.

**Q10:** Implement a callback system: `on_task_start`, `on_task_complete`, `on_task_error`.

*(Implementations follow similar patterns as above)*

---

### QUICK_REFERENCE: Key Takeaways and Comparison Tables
```cpp
// Construction
ThreadPool pool(num_threads);

// Submit fire-and-forget task
pool.submit(func, args...);

// Submit with result
auto future = pool.submit_with_result(func, args...);
ReturnType result = future.get();  // Blocks

// Queries
size_t queued = pool.queued_tasks();
size_t active = pool.active_tasks();
size_t threads = pool.thread_count();

// Shutdown
pool.shutdown();      // Graceful (finish queued tasks)
pool.shutdown_now();  // Immediate (discard queued tasks)
```

**Key concepts:**
- Worker threads share task queue
- Condition variable for blocking wait
- Exception handling in worker loop
- Graceful shutdown in destructor
- Use `std::packaged_task` for futures
