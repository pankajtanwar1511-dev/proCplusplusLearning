# Topic 2: Thread-Safe Bounded Queue

### THEORY_SECTION: Core Concepts and Foundations
#### 1. The Producer-Consumer Problem

The **bounded buffer** (or **producer-consumer**) problem is a classic synchronization challenge:

- **Producers** add items to a queue
- **Consumers** remove items from the queue
- The queue has a **maximum capacity** (bounded)
- Multiple threads may produce/consume simultaneously

**Challenges:**
- **Race conditions**: Multiple threads accessing shared data
- **Buffer full**: Producers must wait when queue is full
- **Buffer empty**: Consumers must wait when queue is empty
- **Deadlock**: Improper locking can cause threads to wait forever
- **Spurious wakeups**: Condition variables may wake without actual condition change

---

#### 2. Synchronization Primitives

#### **std::mutex**
Provides mutual exclusion - ensures only one thread accesses critical section at a time.

```cpp
std::mutex mtx;
mtx.lock();    // Acquire lock
// Critical section
mtx.unlock();  // Release lock

// RAII approach (preferred):
std::lock_guard<std::mutex> lock(mtx);  // Auto-unlocks on scope exit
```

#### **std::condition_variable**
Allows threads to wait for a condition to become true:

```cpp
std::condition_variable cv;
std::mutex mtx;
bool ready = false;

// Waiting thread:
std::unique_lock<std::mutex> lock(mtx);
cv.wait(lock, []{ return ready; });  // Atomically unlocks and waits

// Notifying thread:
{
    std::lock_guard<std::mutex> lock(mtx);
    ready = true;
}
cv.notify_one();  // or cv.notify_all()
```

**Key Points:**
- `wait()` atomically releases mutex and blocks
- When woken, re-acquires mutex before returning
- Always use predicate version to handle spurious wakeups
- Requires `std::unique_lock` (not `lock_guard`) for unlocking

---

#### 3. Design Considerations

#### **Bounded vs Unbounded**
- **Bounded**: Fixed capacity, producers block when full (prevents memory exhaustion)
- **Unbounded**: Grows dynamically, may cause OOM

#### **FIFO Semantics**
- First-In-First-Out ordering guaranteed
- Use `std::queue` or circular buffer internally

#### **Exception Safety**
- Operations should provide strong exception guarantee
- Lock must be released even if exceptions occur (use RAII)

#### **Timeout Support**
- `wait_for()` / `wait_until()` for timed waits
- Prevents indefinite blocking

---

#### 4. Implementation Strategy

**Core Components:**
1. **Internal container** (std::queue or circular buffer)
2. **Mutex** for protecting shared state
3. **Two condition variables**: one for "not full", one for "not empty"
4. **Capacity tracking**: current size vs max size

**Operations:**
- `push()`: Wait if full, add item, notify consumers
- `pop()`: Wait if empty, remove item, notify producers
- `try_push()` / `try_pop()`: Non-blocking variants
- `size()`, `empty()`, `full()`: Thread-safe queries

---

### IMPLEMENTATION: Production-Quality Code

```cpp
#include <queue>
#include <mutex>
#include <condition_variable>
#include <chrono>
#include <optional>
#include <stdexcept>

template<typename T>
class BoundedQueue {
private:
    std::queue<T> queue_;
    const size_t capacity_;

    mutable std::mutex mutex_;
    std::condition_variable not_full_;   // Signaled when space available
    std::condition_variable not_empty_;  // Signaled when items available

    bool is_closed_ = false;  // For graceful shutdown

public:
    explicit BoundedQueue(size_t capacity)
        : capacity_(capacity)
    {
        if (capacity == 0) {
            throw std::invalid_argument("Capacity must be positive");
        }
    }

    // Disable copy (mutex not copyable)
    BoundedQueue(const BoundedQueue&) = delete;
    BoundedQueue& operator=(const BoundedQueue&) = delete;

    // Enable move
    BoundedQueue(BoundedQueue&&) noexcept = default;
    BoundedQueue& operator=(BoundedQueue&&) noexcept = default;

    // ============================================================
    // PUSH OPERATIONS
    // ============================================================

    // Blocking push - waits indefinitely if full
    void push(const T& value) {
        std::unique_lock<std::mutex> lock(mutex_);

        // Wait until queue is not full
        not_full_.wait(lock, [this]() {
            return queue_.size() < capacity_ || is_closed_;
        });

        if (is_closed_) {
            throw std::runtime_error("Queue is closed");
        }

        queue_.push(value);

        // Notify one waiting consumer
        not_empty_.notify_one();
    }

    // Move version
    void push(T&& value) {
        std::unique_lock<std::mutex> lock(mutex_);

        not_full_.wait(lock, [this]() {
            return queue_.size() < capacity_ || is_closed_;
        });

        if (is_closed_) {
            throw std::runtime_error("Queue is closed");
        }

        queue_.push(std::move(value));
        not_empty_.notify_one();
    }

    // Non-blocking push - returns false if full
    bool try_push(const T& value) {
        std::lock_guard<std::mutex> lock(mutex_);

        if (is_closed_ || queue_.size() >= capacity_) {
            return false;
        }

        queue_.push(value);
        not_empty_.notify_one();
        return true;
    }

    // Timed push - waits up to timeout duration
    template<typename Rep, typename Period>
    bool push_for(const T& value,
                  const std::chrono::duration<Rep, Period>& timeout)
    {
        std::unique_lock<std::mutex> lock(mutex_);

        if (!not_full_.wait_for(lock, timeout, [this]() {
            return queue_.size() < capacity_ || is_closed_;
        })) {
            return false;  // Timeout
        }

        if (is_closed_) {
            throw std::runtime_error("Queue is closed");
        }

        queue_.push(value);
        not_empty_.notify_one();
        return true;
    }

    // ============================================================
    // POP OPERATIONS
    // ============================================================

    // Blocking pop - waits indefinitely if empty
    T pop() {
        std::unique_lock<std::mutex> lock(mutex_);

        // Wait until queue is not empty
        not_empty_.wait(lock, [this]() {
            return !queue_.empty() || is_closed_;
        });

        if (is_closed_ && queue_.empty()) {
            throw std::runtime_error("Queue is closed and empty");
        }

        T value = std::move(queue_.front());
        queue_.pop();

        // Notify one waiting producer
        not_full_.notify_one();

        return value;
    }

    // Non-blocking pop - returns std::nullopt if empty
    std::optional<T> try_pop() {
        std::lock_guard<std::mutex> lock(mutex_);

        if (queue_.empty()) {
            return std::nullopt;
        }

        T value = std::move(queue_.front());
        queue_.pop();
        not_full_.notify_one();

        return value;
    }

    // Timed pop - waits up to timeout duration
    template<typename Rep, typename Period>
    std::optional<T> pop_for(const std::chrono::duration<Rep, Period>& timeout)
    {
        std::unique_lock<std::mutex> lock(mutex_);

        if (!not_empty_.wait_for(lock, timeout, [this]() {
            return !queue_.empty() || is_closed_;
        })) {
            return std::nullopt;  // Timeout
        }

        if (is_closed_ && queue_.empty()) {
            throw std::runtime_error("Queue is closed and empty");
        }

        T value = std::move(queue_.front());
        queue_.pop();
        not_full_.notify_one();

        return value;
    }

    // ============================================================
    // QUERY OPERATIONS
    // ============================================================

    size_t size() const {
        std::lock_guard<std::mutex> lock(mutex_);
        return queue_.size();
    }

    bool empty() const {
        std::lock_guard<std::mutex> lock(mutex_);
        return queue_.empty();
    }

    bool full() const {
        std::lock_guard<std::mutex> lock(mutex_);
        return queue_.size() >= capacity_;
    }

    size_t capacity() const {
        return capacity_;  // const, no lock needed
    }

    // ============================================================
    // SHUTDOWN SUPPORT
    // ============================================================

    // Close queue - wakes all waiting threads
    void close() {
        std::lock_guard<std::mutex> lock(mutex_);
        is_closed_ = true;
        not_full_.notify_all();
        not_empty_.notify_all();
    }

    bool is_closed() const {
        std::lock_guard<std::mutex> lock(mutex_);
        return is_closed_;
    }
};
```

---

### EDGE_CASES: Tricky Scenarios and Deep Internals
#### Edge Case 1: Spurious Wakeups

**Problem:** Condition variables may wake without actual notification.

```cpp
// WRONG - vulnerable to spurious wakeups:
not_empty_.wait(lock);
T value = queue_.front();  // May be empty!

// CORRECT - always use predicate:
not_empty_.wait(lock, [this]() { return !queue_.empty(); });
T value = queue_.front();  // Safe
```

**Why it happens:** OS-level optimizations, signal handling.

---

#### Edge Case 2: Deadlock with Multiple Locks

**Problem:** Acquiring locks in different orders causes deadlock.

```cpp
// Thread 1:
lock(mutex_A);
lock(mutex_B);

// Thread 2:
lock(mutex_B);  // ← Deadlock!
lock(mutex_A);
```

**Solution:**
- Always acquire locks in same order
- Use `std::scoped_lock` for multiple mutexes (C++17)
- Or design with single mutex

---

#### Edge Case 3: Exception During Push/Pop

**Problem:** If copy constructor throws, state may be inconsistent.

```cpp
T pop() {
    std::unique_lock<std::mutex> lock(mutex_);
    not_empty_.wait(lock, [this]() { return !queue_.empty(); });

    T value = queue_.front();  // Copy may throw
    queue_.pop();              // Never reached!
    return value;
}
```

**Solution:** Use move semantics or strong exception guarantee:

```cpp
T value = std::move(queue_.front());  // Move (typically noexcept)
queue_.pop();  // Only pop after successful move
```

---

#### Edge Case 4: Busy-Waiting (Performance)

**Problem:** Spinning on `try_pop()` wastes CPU.

```cpp
// BAD - busy-wait loop:
while (true) {
    auto item = queue.try_pop();
    if (item) process(*item);
    // CPU at 100%!
}

// GOOD - use blocking pop:
while (true) {
    T item = queue.pop();  // Sleeps when empty
    process(item);
}
```

---

#### Edge Case 5: Forgetting to Notify

**Problem:** Missing notification causes waiting threads to hang forever.

```cpp
void push(const T& value) {
    std::lock_guard<std::mutex> lock(mutex_);
    queue_.push(value);
    // Forgot not_empty_.notify_one(); ← Consumer hangs!
}
```

**Best Practice:** Always pair state changes with notifications.

---

### CODE_EXAMPLES: Practical Demonstrations
#### Example 1: Basic Producer-Consumer

This example demonstrates the **classic producer-consumer pattern** with multiple producers and multiple consumers working concurrently on a shared bounded queue. This is a fundamental concurrency pattern used extensively in multi-threaded applications.

**What this code does:**
- Creates 2 producer threads that each push 10 items to the queue
- Creates 2 consumer threads that each pop 10 items from the queue
- Producers write at 100ms intervals, consumers read at 150ms intervals
- The queue has capacity 5, so producers will block when full (consumers are slower)
- All threads safely share the same queue without data races

**Key concurrency concepts demonstrated:**
- **Thread synchronization**: Multiple threads coordinate access to shared queue
- **Blocking behavior**: When queue is full (5 items), producers wait; when empty, consumers wait
- **FIFO ordering**: Items are consumed in the order they were produced
- **Interleaved execution**: Output shows threads executing in non-deterministic order (this is normal!)
- **Pass by reference**: `std::ref(queue)` ensures all threads share the same queue object

**Why the timing matters:**
- Producers push every 100ms → 20 items/second total (2 threads × 10 items each)
- Consumers pop every 150ms → 13.3 items/second total (2 threads)
- **Producers are faster** → queue fills up → producers block → demonstrates bounded buffer back-pressure

**Real-world application:**
- **Web server**: Producer threads accept connections, consumer threads process requests
- **Data pipeline**: Producers read from disk/network, consumers process and write results
- **Task scheduler**: Producers generate tasks, worker threads consume and execute them

```cpp
#include <thread>
#include <iostream>

void producer(BoundedQueue<int>& queue, int id) {
    for (int i = 0; i < 10; ++i) {
        int value = id * 100 + i;
        queue.push(value);
        std::cout << "Producer " << id << " pushed: " << value << '\n';
        std::this_thread::sleep_for(std::chrono::milliseconds(100));
    }
}

void consumer(BoundedQueue<int>& queue, int id) {
    for (int i = 0; i < 10; ++i) {
        int value = queue.pop();
        std::cout << "Consumer " << id << " popped: " << value << '\n';
        std::this_thread::sleep_for(std::chrono::milliseconds(150));
    }
}

int main() {
    BoundedQueue<int> queue(5);  // Capacity: 5

    std::thread prod1(producer, std::ref(queue), 1);
    std::thread prod2(producer, std::ref(queue), 2);
    std::thread cons1(consumer, std::ref(queue), 1);
    std::thread cons2(consumer, std::ref(queue), 2);

    prod1.join();
    prod2.join();
    cons1.join();
    cons2.join();

    return 0;
}
```

**Output (interleaved):**
```
Producer 1 pushed: 100
Producer 2 pushed: 200
Consumer 1 popped: 100
Producer 1 pushed: 101
Consumer 2 popped: 200
...
```

---

#### Example 2: Timeout-Based Processing

This example demonstrates **timed waiting with timeouts** using `pop_for()`, which is essential for building robust systems that need to detect and handle periods of inactivity. This pattern prevents threads from blocking indefinitely and allows graceful handling of scenarios where producers stop sending data.

**What this code does:**
- Consumer thread calls `pop_for(2s)` - waits up to 2 seconds for an item
- If an item arrives within 2 seconds, process it and continue
- If 2 seconds pass with no item, `pop_for()` returns `std::nullopt` and consumer exits
- Producer sends 3 items spaced 500ms apart, then stops
- After processing the 3rd item, consumer waits 2 seconds, times out, and exits gracefully

**Key concepts demonstrated:**
- **Timeout handling**: Using `std::optional` to distinguish "got value" vs "timeout"
- **Graceful termination**: Consumer can detect when producer has stopped without explicit signaling
- **Resource management**: Thread automatically exits after detecting inactivity
- **Non-blocking with timeout**: Better than infinite blocking (responsive) or busy-wait (CPU-efficient)

**Why 2-second timeout:**
- Items arrive every 500ms (3 items = 1.5 seconds)
- After last item, no more data for 2+ seconds → consumer detects end of stream
- Timeout duration trades off responsiveness vs tolerance for bursty data

**Real-world applications:**
- **Network server**: Close idle connections after N seconds of no data
- **Batch processor**: Commit accumulated data if no new items arrive within timeout
- **Health monitoring**: Alert if expected heartbeat messages stop arriving
- **Resource cleanup**: Detect stalled producers and release resources

**vs. `close()` method:**
- **Timeout approach**: Consumer decides when to stop (autonomous)
- **`close()` approach**: Producer explicitly signals shutdown (coordinated)
- Use timeouts when producers may fail unexpectedly or when autonomous shutdown is desired

```cpp
#include <iostream>
#include <thread>

void timed_consumer(BoundedQueue<std::string>& queue) {
    using namespace std::chrono_literals;

    while (true) {
        auto item = queue.pop_for(2s);  // Wait up to 2 seconds

        if (item) {
            std::cout << "Processed: " << *item << '\n';
        } else {
            std::cout << "Timeout - no items for 2 seconds\n";
            break;  // Exit after timeout
        }
    }
}

int main() {
    BoundedQueue<std::string> queue(10);

    std::thread consumer(timed_consumer, std::ref(queue));

    // Producer sends a few items then stops
    queue.push("Task 1");
    std::this_thread::sleep_for(std::chrono::milliseconds(500));
    queue.push("Task 2");
    std::this_thread::sleep_for(std::chrono::milliseconds(500));
    queue.push("Task 3");

    // Consumer will timeout after 2s of no items
    consumer.join();

    return 0;
}
```

**Output:**
```
Processed: Task 1
Processed: Task 2
Processed: Task 3
Timeout - no items for 2 seconds
```

---

#### Example 3: Graceful Shutdown

This example demonstrates **coordinated shutdown** using the `close()` method to signal all waiting threads to exit gracefully. This is the preferred approach for cleanly terminating a multi-threaded application with active worker threads, avoiding resource leaks and ensuring all threads join properly.

**What this code does:**
- Spawns 3 worker threads that continuously call `pop()` to fetch and process tasks
- Main thread pushes 10 tasks to the queue
- After 2 seconds, main thread calls `queue.close()` to initiate shutdown
- `close()` sets `is_closed_` flag and wakes ALL waiting threads with `notify_all()`
- Workers' `pop()` calls throw `std::runtime_error("Queue is closed and empty")`
- Workers catch the exception, print exit message, and return (thread terminates)
- Main thread joins all worker threads and confirms clean shutdown

**Key shutdown patterns demonstrated:**
- **Broadcast signal**: `close()` uses `notify_all()` to wake all threads simultaneously
- **Exception-based termination**: Workers exit via exception rather than return value checking
- **Resource cleanup**: All threads properly join before program exits
- **No busy-wait**: Workers sleep in `pop()` until woken by `close()`

**What happens during `close()`:**
1. Acquire mutex (thread-safe state change)
2. Set `is_closed_ = true`
3. Call `not_full_.notify_all()` → wake all waiting producers
4. Call `not_empty_.notify_all()` → wake all waiting consumers
5. Release mutex
6. All waiting `wait()` calls wake up, re-check predicates, see `is_closed_`, throw exception

**Why exception-based termination:**
- **Propagates immediately**: Unlike return value, exception unwinds stack regardless of code structure
- **Hard to ignore**: Forces caller to handle shutdown (can't accidentally continue)
- **RAII-friendly**: Exception unwinding triggers destructors, ensuring cleanup
- **Clear intent**: Exception type communicates "abnormal termination" vs "normal empty queue"

**Real-world applications:**
- **Thread pool shutdown**: Signal all workers to stop processing tasks
- **Server termination**: Close request queue on SIGINT/SIGTERM, drain existing work
- **Pipeline stages**: Coordinated shutdown of multi-stage processing pipelines
- **Test cleanup**: Reliably terminate test threads without hanging

**Common pitfall:** Forgetting to call `close()` before joining threads leads to **deadlock** - workers block forever in `pop()` waiting for items that will never arrive.

```cpp
#include <iostream>
#include <thread>
#include <vector>

void worker(BoundedQueue<int>& queue, int id) {
    try {
        while (true) {
            int task = queue.pop();
            std::cout << "Worker " << id << " processing: " << task << '\n';
            std::this_thread::sleep_for(std::chrono::milliseconds(100));
        }
    } catch (const std::runtime_error& e) {
        std::cout << "Worker " << id << " exiting: " << e.what() << '\n';
    }
}

int main() {
    BoundedQueue<int> queue(5);

    std::vector<std::thread> workers;
    for (int i = 0; i < 3; ++i) {
        workers.emplace_back(worker, std::ref(queue), i);
    }

    // Add some tasks
    for (int i = 0; i < 10; ++i) {
        queue.push(i);
    }

    std::this_thread::sleep_for(std::chrono::seconds(2));

    // Shutdown: close queue to wake all waiting threads
    std::cout << "Shutting down...\n";
    queue.close();

    for (auto& t : workers) {
        t.join();
    }

    std::cout << "All workers stopped\n";
    return 0;
}
```

**Output:**
```
Worker 0 processing: 0
Worker 1 processing: 1
Worker 2 processing: 2
...
Shutting down...
Worker 0 exiting: Queue is closed and empty
Worker 1 exiting: Queue is closed and empty
Worker 2 exiting: Queue is closed and empty
All workers stopped
```

---

### INTERVIEW_QA: Comprehensive Questions and Answers
#### Q1: Why use two condition variables instead of one?
Implement this exercise.

**Answer:**

**Separate condition variables improve performance:**
- `not_full_`: Only producers wait on this
- `not_empty_`: Only consumers wait on this

**With one CV:**
```cpp
cv.notify_one();  // May wake wrong type (producer wakes producer)
```

**With two CVs:**
```cpp
not_empty_.notify_one();  // Always wakes a consumer
not_full_.notify_one();   // Always wakes a producer
```

**Alternative:** Use `notify_all()` with one CV, but this wakes all threads (inefficient).

---
#### Q2: What are spurious wakeups and how do you handle them?
Implement this exercise.

**Answer:**

**Spurious wakeup:** Condition variable wakes without actual notification.

**Causes:**
- OS-level signal handling
- Implementation optimizations
- Multi-core race conditions

**Solution:** Always use predicate with `wait()`:

```cpp
// WRONG - vulnerable:
cv.wait(lock);

// CORRECT - predicate handles spurious wakeups:
cv.wait(lock, [&]() { return condition_is_true; });
```

The predicate is re-checked after each wakeup, returning to sleep if false.

---
#### Q3: Why does `wait()` require `std::unique_lock` instead of `std::lock_guard`?
Implement this exercise.

**Answer:**

`wait()` must **unlock** the mutex while waiting, then **re-lock** when woken:

```cpp
cv.wait(lock);  // Internally: lock.unlock() → sleep → lock.lock()
```

- `std::unique_lock`: Supports manual locking/unlocking
- `std::lock_guard`: Cannot be unlocked (locked until destruction)

`lock_guard` is lighter but less flexible; `unique_lock` enables conditional unlocking.

---
#### Q4: What happens if you forget to notify after changing state?
Implement this exercise.

**Answer:**

**Problem:** Waiting threads hang forever (deadlock).

```cpp
void push(T value) {
    std::lock_guard<std::mutex> lock(mutex_);
    queue_.push(value);
    // Missing: not_empty_.notify_one();
}

// Consumer thread waits forever:
T item = queue.pop();  // wait() never wakes up
```

**Best practice:**
- Always notify after state changes
- Pair each `wait()` call with corresponding `notify()`

---
#### Q5: When should you use `notify_one()` vs `notify_all()`?
Implement this exercise.

**Answer:**

**`notify_one()`:**
- Wake **one** waiting thread
- Use when any waiting thread can proceed
- More efficient (less context switching)

**`notify_all()`:**
- Wake **all** waiting threads
- Use when:
  - Multiple threads may proceed
  - Broadcast shutdown signal
  - Complex conditions (safer but slower)

**Example:**
```cpp
// Producer adds one item → wake one consumer:
not_empty_.notify_one();

// Shutdown → wake all threads:
is_closed_ = true;
not_empty_.notify_all();
not_full_.notify_all();
```

---
#### Q6: How does exception safety work with RAII locks?
Implement this exercise.

**Answer:**

**RAII locks guarantee unlock even during exceptions:**

```cpp
void push(T value) {
    std::lock_guard<std::mutex> lock(mutex_);

    queue_.push(value);  // May throw
    not_empty_.notify_one();

    // If exception thrown:
    // 1. Stack unwinding begins
    // 2. lock_guard destructor runs → mutex unlocked
    // 3. Exception propagates
}
```

**Without RAII (dangerous):**
```cpp
mutex_.lock();
queue_.push(value);  // Throws → mutex stays locked forever!
mutex_.unlock();     // Never reached
```

---
#### Q7: What is the ABA problem in lock-free structures? Does it apply here?
Implement this exercise.

**Answer:**

**ABA problem:** A lock-free algorithm reads A, pauses, sees A again, but A was changed to B then back to A.

```cpp
// Thread 1:
old_head = head.load();  // Reads A
// ... preempted ...

// Thread 2:
pop();  // Changes A → B
push(A);  // Changes B → A

// Thread 1 resumes:
compare_exchange(old_head, new_head);  // Succeeds (thinks nothing changed!)
```

**Does it apply to BoundedQueue?**

**No** - we use **mutex-based locking**, not lock-free compare-and-swap. Mutexes prevent concurrent modifications entirely.

**Would apply to:** Lock-free queues using atomics (Topic 3).

---
#### Q8: How would you implement size() thread-safely?
Implement this exercise.

**Answer:**

**Option 1: Lock and read** (our approach):
```cpp
size_t size() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return queue_.size();
}
```
**Pros:** Accurate snapshot
**Cons:** May block briefly

**Option 2: Atomic counter:**
```cpp
std::atomic<size_t> size_{0};

void push(T value) {
    std::unique_lock<std::mutex> lock(mutex_);
    queue_.push(value);
    ++size_;  // Atomic increment
}

size_t size() const {
    return size_.load();  // No lock needed
}
```
**Pros:** Lock-free read
**Cons:** More complexity, may be stale by the time caller uses it

---
#### Q9: What is the difference between `std::queue` and `BoundedQueue`?
Implement this exercise.

**Answer:**

| Feature | `std::queue` | `BoundedQueue` |
|---------|-------------|----------------|
| **Thread-safe** | ❌ No | ✅ Yes |
| **Bounded** | ❌ Unbounded | ✅ Fixed capacity |
| **Blocking** | ❌ No | ✅ Waits when full/empty |
| **Use case** | Single-threaded | Multi-threaded producer-consumer |

`std::queue` is a container adapter (wraps deque/list), not designed for concurrency.

---
#### Q10: How would you implement priority-based pop?
**Answer:**

**Replace `std::queue` with `std::priority_queue`:**

```cpp
template<typename T, typename Compare = std::less<T>>
class BoundedPriorityQueue {
private:
    std::priority_queue<T, std::vector<T>, Compare> queue_;
    // ... same mutex/CV logic ...

public:
    T pop() {
        std::unique_lock<std::mutex> lock(mutex_);
        not_empty_.wait(lock, [this]() { return !queue_.empty(); });

        T value = std::move(const_cast<T&>(queue_.top()));  // top() returns const&
        queue_.pop();
        not_full_.notify_one();

        return value;
    }
};
```

**Usage:**
```cpp
BoundedPriorityQueue<Task> queue(100);
queue.push(Task{priority: 5});
queue.push(Task{priority: 10});
Task highest = queue.pop();  // Returns priority 10 first
```

---
### PRACTICE_TASKS: Output Prediction and Code Analysis
#### Q1
Implement `try_push()` without looking at the solution. What are the key differences from `push()`?

Implement this exercise.

**Answer:**

```cpp
bool try_push(const T& value) {
    std::lock_guard<std::mutex> lock(mutex_);  // lock_guard (not unique_lock)

    if (queue_.size() >= capacity_) {
        return false;  // Immediately return if full
    }

    queue_.push(value);
    not_empty_.notify_one();
    return true;
}
```

**Key differences:**
1. Uses `lock_guard` (no need for `unique_lock` since no waiting)
2. No `wait()` call - returns immediately
3. Returns `bool` to indicate success/failure
4. Non-blocking - never sleeps

---

#### Q2
Add a `clear()` method that removes all elements. What synchronization is needed?

Implement this exercise.

**Answer:**

```cpp
void clear() {
    std::lock_guard<std::mutex> lock(mutex_);

    // Clear the queue
    while (!queue_.empty()) {
        queue_.pop();
    }

    // Notify all waiting producers (space now available)
    not_full_.notify_all();
}
```

**Why `notify_all()` instead of `notify_one()`?**
- Multiple producers may be waiting
- Clearing creates space for all of them

---

#### Q3
Implement `emplace()` to construct elements in-place. How does it differ from `push()`?

Implement this exercise.

**Answer:**

```cpp
template<typename... Args>
void emplace(Args&&... args) {
    std::unique_lock<std::mutex> lock(mutex_);

    not_full_.wait(lock, [this]() {
        return queue_.size() < capacity_;
    });

    queue_.emplace(std::forward<Args>(args)...);  // Construct in-place
    not_empty_.notify_one();
}
```

**Difference from `push()`:**
- `push(T value)`: Constructs object, then moves into queue (2 constructions)
- `emplace(Args...)`: Constructs directly in queue (1 construction)

**Usage:**
```cpp
struct Task {
    Task(int id, std::string name) { /*...*/ }
};

// push: constructs temp Task, then moves:
queue.push(Task{42, "work"});

// emplace: constructs directly in queue:
queue.emplace(42, "work");  // More efficient
```

---

#### Q4
Add statistics tracking: total pushed, total popped, max size reached. Ensure thread-safety.

Implement this exercise.

**Answer:**

```cpp
template<typename T>
class BoundedQueue {
private:
    std::queue<T> queue_;
    const size_t capacity_;

    std::mutex mutex_;
    std::condition_variable not_full_, not_empty_;

    // Statistics (protected by same mutex)
    size_t total_pushed_ = 0;
    size_t total_popped_ = 0;
    size_t max_size_reached_ = 0;

public:
    void push(const T& value) {
        std::unique_lock<std::mutex> lock(mutex_);
        not_full_.wait(lock, [this]() { return queue_.size() < capacity_; });

        queue_.push(value);
        ++total_pushed_;  // Update stat

        if (queue_.size() > max_size_reached_) {
            max_size_reached_ = queue_.size();
        }

        not_empty_.notify_one();
    }

    T pop() {
        std::unique_lock<std::mutex> lock(mutex_);
        not_empty_.wait(lock, [this]() { return !queue_.empty(); });

        T value = std::move(queue_.front());
        queue_.pop();
        ++total_popped_;  // Update stat

        not_full_.notify_one();
        return value;
    }

    struct Stats {
        size_t total_pushed;
        size_t total_popped;
        size_t max_size_reached;
        size_t current_size;
    };

    Stats get_stats() const {
        std::lock_guard<std::mutex> lock(mutex_);
        return Stats{
            total_pushed_,
            total_popped_,
            max_size_reached_,
            queue_.size()
        };
    }
};
```

**Usage:**
```cpp
auto stats = queue.get_stats();
std::cout << "Pushed: " << stats.total_pushed
          << ", Popped: " << stats.total_popped
          << ", Max size: " << stats.max_size_reached << '\n';
```

---

#### Q5
Modify the queue to support multiple priorities (3 levels: HIGH, MEDIUM, LOW). Ensure HIGH priority items are popped first.

Implement this exercise.

**Answer:**

```cpp
enum class Priority { LOW, MEDIUM, HIGH };

template<typename T>
class MultiPriorityQueue {
private:
    std::array<std::queue<T>, 3> queues_;  // One per priority
    const size_t capacity_;
    size_t total_size_ = 0;

    std::mutex mutex_;
    std::condition_variable not_full_, not_empty_;

    static size_t priority_index(Priority p) {
        return static_cast<size_t>(p);
    }

public:
    explicit MultiPriorityQueue(size_t capacity) : capacity_(capacity) {}

    void push(const T& value, Priority priority) {
        std::unique_lock<std::mutex> lock(mutex_);

        not_full_.wait(lock, [this]() {
            return total_size_ < capacity_;
        });

        queues_[priority_index(priority)].push(value);
        ++total_size_;
        not_empty_.notify_one();
    }

    T pop() {
        std::unique_lock<std::mutex> lock(mutex_);

        not_empty_.wait(lock, [this]() {
            return total_size_ > 0;
        });

        // Pop from highest priority non-empty queue
        for (int i = 2; i >= 0; --i) {  // HIGH → MEDIUM → LOW
            if (!queues_[i].empty()) {
                T value = std::move(queues_[i].front());
                queues_[i].pop();
                --total_size_;
                not_full_.notify_one();
                return value;
            }
        }

        throw std::logic_error("Queue empty despite wait condition");
    }
};
```

**Usage:**
```cpp
MultiPriorityQueue<Task> queue(100);
queue.push(task1, Priority::LOW);
queue.push(task2, Priority::HIGH);
queue.push(task3, Priority::MEDIUM);

Task t = queue.pop();  // Gets task2 (HIGH priority)
```

---

#### Q6
Implement a `wait_until_empty()` method that blocks until the queue is empty.

Implement this exercise.

**Answer:**

```cpp
void wait_until_empty() {
    std::unique_lock<std::mutex> lock(mutex_);

    // Add a new condition variable for "empty" event
    // (Or reuse not_full_ if you modify pop() to notify it when empty)

    std::condition_variable empty_cv;
    empty_cv.wait(lock, [this]() {
        return queue_.empty();
    });
}
```

**Better approach** - notify when empty in `pop()`:

```cpp
private:
    std::condition_variable not_full_, not_empty_, empty_cv_;

public:
    T pop() {
        std::unique_lock<std::mutex> lock(mutex_);
        not_empty_.wait(lock, [this]() { return !queue_.empty(); });

        T value = std::move(queue_.front());
        queue_.pop();

        not_full_.notify_one();

        if (queue_.empty()) {
            empty_cv_.notify_all();  // Notify waiters
        }

        return value;
    }

    void wait_until_empty() {
        std::unique_lock<std::mutex> lock(mutex_);
        empty_cv_.wait(lock, [this]() { return queue_.empty(); });
    }
};
```

---

#### Q7
Add a `peek()` method that returns a copy of the front element without removing it. Is it thread-safe?

Implement this exercise.

**Answer:**

```cpp
std::optional<T> peek() const {
    std::lock_guard<std::mutex> lock(mutex_);

    if (queue_.empty()) {
        return std::nullopt;
    }

    return queue_.front();  // Copy
}
```

**Thread-safety considerations:**

This is thread-safe for the **read**, but the value may be stale:

```cpp
// Thread 1:
auto item = queue.peek();  // Gets item X
// ... Thread 2 pops X here ...
if (item) {
    process(*item);  // X may no longer be in queue!
}
```

**Solution:** Document that `peek()` provides a **snapshot** - caller must handle race conditions.

---

#### Q8
Implement batch operations: `push_batch(vector<T>)` and `pop_batch(size_t n)`.

Implement this exercise.

**Answer:**

```cpp
void push_batch(const std::vector<T>& items) {
    std::unique_lock<std::mutex> lock(mutex_);

    // Wait until enough space available
    not_full_.wait(lock, [this, &items]() {
        return queue_.size() + items.size() <= capacity_;
    });

    for (const auto& item : items) {
        queue_.push(item);
    }

    // Notify multiple consumers
    not_empty_.notify_all();
}

std::vector<T> pop_batch(size_t n) {
    std::unique_lock<std::mutex> lock(mutex_);

    // Wait until at least n items available
    not_empty_.wait(lock, [this, n]() {
        return queue_.size() >= n;
    });

    std::vector<T> result;
    result.reserve(n);

    for (size_t i = 0; i < n; ++i) {
        result.push_back(std::move(queue_.front()));
        queue_.pop();
    }

    // Notify producers (space freed)
    not_full_.notify_all();

    return result;
}
```

**Usage:**
```cpp
queue.push_batch({1, 2, 3, 4, 5});
auto batch = queue.pop_batch(3);  // Gets [1, 2, 3]
```

---

#### Q9
Add support for callbacks: `on_push_callback` and `on_pop_callback` that execute after each operation.

Implement this exercise.

**Answer:**

```cpp
template<typename T>
class BoundedQueue {
private:
    std::queue<T> queue_;
    const size_t capacity_;
    std::mutex mutex_;
    std::condition_variable not_full_, not_empty_;

    // Callbacks (optional)
    std::function<void(const T&)> on_push_callback_;
    std::function<void(const T&)> on_pop_callback_;

public:
    void set_on_push_callback(std::function<void(const T&)> callback) {
        std::lock_guard<std::mutex> lock(mutex_);
        on_push_callback_ = std::move(callback);
    }

    void set_on_pop_callback(std::function<void(const T&)> callback) {
        std::lock_guard<std::mutex> lock(mutex_);
        on_pop_callback_ = std::move(callback);
    }

    void push(const T& value) {
        std::unique_lock<std::mutex> lock(mutex_);
        not_full_.wait(lock, [this]() { return queue_.size() < capacity_; });

        queue_.push(value);
        not_empty_.notify_one();

        if (on_push_callback_) {
            on_push_callback_(value);  // Execute callback
        }
    }

    T pop() {
        std::unique_lock<std::mutex> lock(mutex_);
        not_empty_.wait(lock, [this]() { return !queue_.empty(); });

        T value = std::move(queue_.front());
        queue_.pop();
        not_full_.notify_one();

        if (on_pop_callback_) {
            on_pop_callback_(value);  // Execute callback
        }

        return value;
    }
};
```

**Usage:**
```cpp
queue.set_on_push_callback([](const int& val) {
    std::cout << "Pushed: " << val << '\n';
});

queue.set_on_pop_callback([](const int& val) {
    std::cout << "Popped: " << val << '\n';
});
```

---

#### Q10
Implement `drain()` that moves all elements to a vector and returns them atomically.



**Answer:**

```cpp
std::vector<T> drain() {
    std::lock_guard<std::mutex> lock(mutex_);

    std::vector<T> result;
    result.reserve(queue_.size());

    while (!queue_.empty()) {
        result.push_back(std::move(queue_.front()));
        queue_.pop();
    }

    // Queue now empty - notify all waiting producers
    not_full_.notify_all();

    return result;
}
```

**Usage:**
```cpp
queue.push(1);
queue.push(2);
queue.push(3);

auto all_items = queue.drain();  // [1, 2, 3], queue now empty
```

**Use case:** Graceful shutdown - drain remaining work before exiting.

---

### QUICK_REFERENCE: Key Takeaways and Comparison Tables
```cpp
// Construction
BoundedQueue<T> queue(capacity);

// Blocking operations
queue.push(value);          // Wait if full
T val = queue.pop();        // Wait if empty

// Non-blocking operations
bool ok = queue.try_push(value);    // false if full
std::optional<T> val = queue.try_pop();  // nullopt if empty

// Timed operations
queue.push_for(value, 1s);  // Wait up to 1 second
queue.pop_for(1s);          // Wait up to 1 second

// Queries
size_t sz = queue.size();
bool is_empty = queue.empty();
bool is_full = queue.full();

// Shutdown
queue.close();              // Wake all threads
```

**Key concepts:**
- Mutex protects shared state
- Condition variables enable waiting
- Always use predicates with `wait()`
- Notify after state changes
- Use RAII locks for exception safety
