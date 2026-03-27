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
