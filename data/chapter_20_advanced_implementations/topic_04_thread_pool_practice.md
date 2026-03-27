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
