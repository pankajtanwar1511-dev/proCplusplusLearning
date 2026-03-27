## TOPIC: Condition Variables - Thread Synchronization and Event Notification

### THEORY_SECTION: Core Concepts and Foundations

#### 1. Condition Variable Overview

**Definition:**
- Synchronization primitive enabling threads to wait for specific conditions without busy-waiting
- Works with a mutex to coordinate thread communication
- Defined in `<condition_variable>` header (C++11)

**Core Mechanism:**

| Component | Role |
|-----------|------|
| **Mutex** | Protects the shared state (the condition itself) |
| **Condition Variable** | Coordinates waiting and waking of threads |
| **Predicate** | Boolean condition that determines when thread should wake |

**Basic Operations:**

```cpp
std::mutex mtx;
std::condition_variable cv;
bool ready = false;

// Waiter thread:
std::unique_lock<std::mutex> lock(mtx);
cv.wait(lock, []{ return ready; });  // Wait until ready == true

// Notifier thread:
{
    std::lock_guard<std::mutex> lock(mtx);
    ready = true;
}
cv.notify_one();  // Wake one waiting thread
```

---

#### 2. The Wait-Notify Mechanism

**wait() Operation Steps:**

| Step | Action | Details |
|------|--------|---------|
| **1** | Check predicate | If already true, return immediately (no wait) |
| **2** | Unlock mutex | Atomically release lock |
| **3** | Block thread | OS removes thread from scheduler (sleep) |
| **4** | Wake on notification | Triggered by notify_one/notify_all or spuriously |
| **5** | Relock mutex | Atomically reacquire lock before returning |
| **6** | Recheck predicate | Loop back if still false (spurious wakeup) |
| **7** | Return | Predicate guaranteed true |

**Predicate Form:**

```cpp
// ✅ Best practice - handles spurious wakeups automatically
cv.wait(lock, []{ return ready; });

// Equivalent manual loop:
while (!ready) {
    cv.wait(lock);  // Without predicate
}
```

**Spurious Wakeups:**

| Concept | Explanation |
|---------|-------------|
| **What** | Thread wakes from wait() without being notified |
| **Why** | Implementation optimization, signal handling, OS scheduling |
| **Protection** | Always use predicate form of wait() |
| **Consequence without predicate** | Thread might proceed when condition still false → incorrect behavior |

---

#### 3. Why std::unique_lock is Required

**Lock Type Comparison:**

| Feature | std::lock_guard | std::unique_lock | Required for CV? |
|---------|----------------|------------------|------------------|
| **Manual unlock** | ❌ No | ✅ Yes | ✅ Essential |
| **Manual relock** | ❌ No | ✅ Yes | ✅ Essential |
| **Overhead** | Zero | Minimal | Worth it for flexibility |
| **Use with wait()** | ❌ Compilation error | ✅ Works | - |

**Why Flexibility Matters:**

```cpp
void consumer() {
    std::unique_lock<std::mutex> lock(mtx);

    // wait() needs to:
    // 1. Unlock mtx (to let producer modify condition)
    // 2. Sleep thread
    // 3. Relock mtx (when woken)
    // → unique_lock provides unlock()/lock() methods

    cv.wait(lock, []{ return !queue.empty(); });
    process(queue.front());
}
```

---

#### 4. Notification Strategies

**notify_one() vs notify_all():**

| Operation | Wakes | Use When | Example |
|-----------|-------|----------|---------|
| **notify_one()** | One thread | Only one thread can proceed | Single item added to queue |
| **notify_all()** | All threads | Multiple threads can proceed or broadcast event | Shutdown signal, configuration change |

**Notification Timing:**

```cpp
// Option 1: Notify inside lock
{
    std::lock_guard<std::mutex> lock(mtx);
    ready = true;
    cv.notify_one();  // Inside lock
}

// Option 2: Notify outside lock (often better performance)
{
    std::lock_guard<std::mutex> lock(mtx);
    ready = true;
}  // Lock released here
cv.notify_one();  // ✅ Outside lock - woken thread can acquire immediately
```

**Performance Trade-off:**

| Approach | Pros | Cons |
|----------|------|------|
| Notify inside lock | Simple, all state changes atomic | Woken thread blocks again waiting for lock release |
| Notify outside lock | Woken thread acquires lock faster | Slightly more complex (separate scope) |

---

#### 5. Producer-Consumer Pattern

**Classic Coordination:**

```cpp
std::mutex mtx;
std::condition_variable cv_not_empty;
std::queue<Item> queue;

// Producer:
{
    std::lock_guard<std::mutex> lock(mtx);
    queue.push(item);
}
cv_not_empty.notify_one();  // Wake consumer

// Consumer:
std::unique_lock<std::mutex> lock(mtx);
cv_not_empty.wait(lock, []{ return !queue.empty(); });
Item item = queue.front();
queue.pop();
```

**Bounded Buffer (Two Condition Variables):**

| Condition Variable | Waits When | Woken When |
|-------------------|------------|------------|
| **cv_not_full** | Buffer full (producer waits) | Consumer removes item |
| **cv_not_empty** | Buffer empty (consumer waits) | Producer adds item |

**Benefits vs Busy-Waiting:**

| Approach | CPU Usage When Waiting | Latency | Power Consumption |
|----------|----------------------|---------|-------------------|
| **Busy-waiting** | 100% (spinning in loop) | Low (immediate detection) | High |
| **Condition Variable** | 0% (thread sleeping) | Low (instant wake on notify) | Minimal |

---

#### 6. Real-World: Autonomous Driving Systems

**Perception Pipeline Example:**

| Component | Thread Role | CV Usage |
|-----------|-------------|----------|
| **Camera Capture (30Hz)** | Producer | Pushes frames to queue, notifies processing thread |
| **Perception Processing** | Consumer | Waits for frames, wakes instantly on arrival |
| **Planning (10Hz)** | Consumer | Waits for updated world model from sensor fusion |
| **Control (100Hz)** | Consumer | Waits for new path commands from planner |

**Critical Requirements:**

```cpp
// Camera thread:
void camera_capture_thread() {
    while (!shutdown) {
        Frame frame = capture();  // 30 FPS

        {
            std::lock_guard<std::mutex> lock(mtx);
            frame_queue.push(frame);
        }
        cv_frame_ready.notify_one();  // Instant wake
    }
}

// Perception thread:
void perception_thread() {
    while (true) {
        Frame frame;

        {
            std::unique_lock<std::mutex> lock(mtx);
            cv_frame_ready.wait(lock, []{ return shutdown || !frame_queue.empty(); });

            if (shutdown && frame_queue.empty()) break;

            frame = frame_queue.front();
            frame_queue.pop();
        }

        process_frame(frame);  // Object detection, 33ms deadline
    }
}
```

**Why This Matters:**

| Metric | Requirement | CV Benefit |
|--------|-------------|-----------|
| **Latency** | < 5μs wake-up time | notify() wakes thread in 1-5μs |
| **CPU Efficiency** | Processing thread should sleep when idle | 0% CPU when waiting vs 100% busy-wait |
| **Real-time Deadlines** | Frame processing must start immediately | Instant wake on frame arrival |
| **Power** | Automotive power budget constraints | Sleeping threads consume minimal power |

---

#### 7. Common Patterns Summary

**Pattern Table:**

| Pattern | Use Case | Key Components |
|---------|----------|----------------|
| **Producer-Consumer** | Work queue coordination | 1 CV (not_empty), shared queue |
| **Bounded Buffer** | Limited capacity queue | 2 CVs (not_full, not_empty) |
| **Barrier Sync** | Wait for N threads to reach point | Counter + CV + generation counter |
| **Event Broadcast** | Signal all threads (shutdown) | Flag + notify_all() |
| **Thread Pool** | Task distribution | Queue + workers waiting on CV |

**Best Practices:**

- ✅ Always use predicate form: `cv.wait(lock, predicate)`
- ✅ Hold mutex when modifying condition
- ✅ Same mutex for condition modification and wait()
- ✅ Use `notify_one()` when only one thread can proceed
- ✅ Use `notify_all()` for broadcast events (shutdown)
- ✅ Include shutdown flag in predicates for graceful termination
- ❌ Never use `lock_guard` with wait() (compilation error)
- ❌ Never modify condition without holding mutex (data race)

---

### EDGE_CASES: Tricky Scenarios and Deep Internals

#### Edge Case 1: Spurious Wakeups Without Predicate Check

```cpp
std::mutex mtx;
std::condition_variable cv;
bool ready = false;

void consumer_unsafe() {
    std::unique_lock<std::mutex> lock(mtx);
    cv.wait(lock);  // ❌ No predicate - vulnerable to spurious wakeups

    // Might execute even if ready is still false!
    process_data();
}

void consumer_safe() {
    std::unique_lock<std::mutex> lock(mtx);
    cv.wait(lock, []{ return ready; });  // ✅ Predicate protects against spurious wakeups

    // Guaranteed ready == true here
    process_data();
}
```

Spurious wakeups are allowed by the standard—implementation may wake threads for optimization or signal handling. Always use the predicate form or manual loop.

**Why spurious wakeups exist**: On some systems, broadcast signals can wake all threads waiting on condition variables. Rather than requiring implementations to filter these perfectly, the standard allows spurious wakeups, pushing the responsibility to user code.

#### Edge Case 2: Notify Before Wait - Lost Wakeup

```cpp
std::mutex mtx;
std::condition_variable cv;
bool ready = false;

void producer() {
    {
        std::lock_guard<std::mutex> lock(mtx);
        ready = true;
    }
    cv.notify_one();  // ✅ Notification sent
}

void consumer() {
    std::this_thread::sleep_for(std::chrono::milliseconds(100));  // Delay

    std::unique_lock<std::mutex> lock(mtx);
    cv.wait(lock, []{ return ready; });  // ❌ Might have missed notification!
    // Actually, this is OK because predicate is checked first
}
```

**Important**: With predicates, this pattern is safe! The predicate is checked *before* waiting. If `ready == true`, `wait()` returns immediately without blocking. Without predicates (`cv.wait(lock)` only), notifications before waiting are lost, causing indefinite blocking.

#### Edge Case 3: Forgetting to Hold Lock When Modifying Condition

```cpp
std::mutex mtx;
std::condition_variable cv;
bool ready = false;

void producer_race() {
    ready = true;  // ❌ Modified without holding lock - race condition!
    cv.notify_one();
}

void consumer() {
    std::unique_lock<std::mutex> lock(mtx);
    cv.wait(lock, []{ return ready; });  // Might see inconsistent state
}

void producer_correct() {
    {
        std::lock_guard<std::mutex> lock(mtx);  // ✅ Lock protects condition
        ready = true;
    }
    cv.notify_one();  // Can notify outside lock (optional optimization)
}
```

The condition variable doesn't protect the shared state—the mutex does. Always hold the lock when modifying the condition.

#### Edge Case 4: Notify Inside vs Outside Lock

```cpp
std::mutex mtx;
std::condition_variable cv;
bool ready = false;

void notify_inside_lock() {
    std::lock_guard<std::mutex> lock(mtx);
    ready = true;
    cv.notify_one();  // Notification while holding lock
}

void notify_outside_lock() {
    {
        std::lock_guard<std::mutex> lock(mtx);
        ready = true;
    }  // Lock released here
    cv.notify_one();  // ✅ Notification after releasing lock (often better)
}
```

**Performance consideration**: Notifying inside the lock means the woken thread immediately blocks again waiting for the lock to be released. Notifying outside allows the woken thread to potentially acquire the lock faster. However, both are correct—notifying outside is a performance optimization.

#### Edge Case 5: notify_one vs notify_all with Multiple Waiters

```cpp
std::mutex mtx;
std::condition_variable cv;
std::queue<int> queue;

// Multiple consumers waiting
void consumer() {
    std::unique_lock<std::mutex> lock(mtx);
    cv.wait(lock, []{ return !queue.empty(); });

    int item = queue.front();
    queue.pop();
    process(item);
}

void producer_wrong() {
    {
        std::lock_guard<std::mutex> lock(mtx);
        queue.push(42);
    }
    cv.notify_all();  // ❌ Wakes ALL consumers, but only one can pop
    // Other consumers re-block immediately (thundering herd)
}

void producer_correct() {
    {
        std::lock_guard<std::mutex> lock(mtx);
        queue.push(42);
    }
    cv.notify_one();  // ✅ Wakes one consumer (the one that can actually proceed)
}
```

Use `notify_one()` when only one thread can proceed. Use `notify_all()` when the condition might allow multiple threads to proceed, or when you can't predict which thread should wake.

---

### CODE_EXAMPLES: Practical Demonstrations

#### Example 1: Basic Wait and Notify

```cpp
#include <iostream>
#include <thread>
#include <mutex>
#include <condition_variable>

std::mutex mtx;
std::condition_variable cv;
bool ready = false;

void worker() {
    std::unique_lock<std::mutex> lock(mtx);
    cv.wait(lock, []{ return ready; });  // Wait until ready == true

    std::cout << "Worker proceeding\n";
}

void coordinator() {
    std::this_thread::sleep_for(std::chrono::seconds(1));

    {
        std::lock_guard<std::mutex> lock(mtx);
        ready = true;
    }

    cv.notify_one();
    std::cout << "Coordinator notified\n";
}

int main() {
    std::thread t1(worker);
    std::thread t2(coordinator);

    t1.join();
    t2.join();
}
```

This demonstrates the fundamental wait-notify pattern: worker waits for coordinator to set the ready flag.

#### Example 2: Producer-Consumer with Single Item

```cpp
#include <iostream>
#include <thread>
#include <mutex>
#include <condition_variable>

std::mutex mtx;
std::condition_variable cv;
int data = 0;
bool data_ready = false;

void producer() {
    std::this_thread::sleep_for(std::chrono::seconds(1));

    {
        std::lock_guard<std::mutex> lock(mtx);
        data = 42;
        data_ready = true;
    }

    cv.notify_one();
    std::cout << "Producer: Data produced\n";
}

void consumer() {
    std::unique_lock<std::mutex> lock(mtx);
    cv.wait(lock, []{ return data_ready; });

    std::cout << "Consumer: Received data = " << data << "\n";
}

int main() {
    std::thread t_consumer(consumer);
    std::thread t_producer(producer);

    t_consumer.join();
    t_producer.join();
}
```

Consumer waits for producer to populate data, avoiding busy-waiting.

#### Example 3: Bounded Buffer Producer-Consumer

```cpp
#include <iostream>
#include <thread>
#include <queue>
#include <mutex>
#include <condition_variable>

const size_t MAX_BUFFER_SIZE = 5;

std::mutex mtx;
std::condition_variable cv_not_full;
std::condition_variable cv_not_empty;
std::queue<int> buffer;

void producer(int id, int items) {
    for (int i = 0; i < items; ++i) {
        std::unique_lock<std::mutex> lock(mtx);

        // Wait if buffer is full
        cv_not_full.wait(lock, []{ return buffer.size() < MAX_BUFFER_SIZE; });

        buffer.push(i);
        std::cout << "Producer " << id << " produced " << i
                  << " (buffer size: " << buffer.size() << ")\n";

        cv_not_empty.notify_one();  // Wake consumer
    }
}

void consumer(int id, int items) {
    for (int i = 0; i < items; ++i) {
        std::unique_lock<std::mutex> lock(mtx);

        // Wait if buffer is empty
        cv_not_empty.wait(lock, []{ return !buffer.empty(); });

        int value = buffer.front();
        buffer.pop();
        std::cout << "Consumer " << id << " consumed " << value
                  << " (buffer size: " << buffer.size() << ")\n";

        cv_not_full.notify_one();  // Wake producer
    }
}

int main() {
    std::thread p1(producer, 1, 10);
    std::thread c1(consumer, 1, 10);

    p1.join();
    c1.join();
}
```

Two condition variables coordinate bounded buffer: producers wait when full, consumers wait when empty.

#### Example 4: Thread-Safe Queue Class

```cpp
#include <queue>
#include <mutex>
#include <condition_variable>
#include <optional>

template<typename T>
class ThreadSafeQueue {
private:
    mutable std::mutex mtx;
    std::condition_variable cv;
    std::queue<T> queue;

public:
    void push(T value) {
        {
            std::lock_guard<std::mutex> lock(mtx);
            queue.push(std::move(value));
        }
        cv.notify_one();
    }

    T pop() {
        std::unique_lock<std::mutex> lock(mtx);
        cv.wait(lock, [this]{ return !queue.empty(); });

        T value = std::move(queue.front());
        queue.pop();
        return value;
    }

    std::optional<T> try_pop(std::chrono::milliseconds timeout) {
        std::unique_lock<std::mutex> lock(mtx);

        if (!cv.wait_for(lock, timeout, [this]{ return !queue.empty(); })) {
            return std::nullopt;  // Timeout
        }

        T value = std::move(queue.front());
        queue.pop();
        return value;
    }

    bool empty() const {
        std::lock_guard<std::mutex> lock(mtx);
        return queue.empty();
    }
};

// Usage
int main() {
    ThreadSafeQueue<int> queue;

    std::thread producer([&]{
        for (int i = 0; i < 5; ++i) {
            queue.push(i);
            std::cout << "Pushed " << i << "\n";
        }
    });

    std::thread consumer([&]{
        for (int i = 0; i < 5; ++i) {
            int value = queue.pop();
            std::cout << "Popped " << value << "\n";
        }
    });

    producer.join();
    consumer.join();
}
```

Reusable thread-safe queue with blocking `pop()` and timeout-based `try_pop()`.

#### Example 5: Wait with Timeout

```cpp
#include <iostream>
#include <thread>
#include <mutex>
#include <condition_variable>
#include <chrono>

std::mutex mtx;
std::condition_variable cv;
bool ready = false;

void worker() {
    std::unique_lock<std::mutex> lock(mtx);

    // Wait for 2 seconds
    if (cv.wait_for(lock, std::chrono::seconds(2), []{ return ready; })) {
        std::cout << "Worker: Condition met\n";
    } else {
        std::cout << "Worker: Timeout\n";
    }
}

void coordinator_slow() {
    std::this_thread::sleep_for(std::chrono::seconds(3));  // Exceeds timeout

    {
        std::lock_guard<std::mutex> lock(mtx);
        ready = true;
    }
    cv.notify_one();
}

int main() {
    std::thread t1(worker);
    std::thread t2(coordinator_slow);

    t1.join();
    t2.join();
}
```

`wait_for()` returns false if timeout expires before condition is met.

#### Example 6: Multiple Consumers with notify_all

```cpp
#include <iostream>
#include <thread>
#include <mutex>
#include <condition_variable>
#include <vector>

std::mutex mtx;
std::condition_variable cv;
bool start_processing = false;

void worker(int id) {
    std::unique_lock<std::mutex> lock(mtx);
    cv.wait(lock, []{ return start_processing; });

    std::cout << "Worker " << id << " started processing\n";
}

void coordinator() {
    std::this_thread::sleep_for(std::chrono::seconds(1));

    {
        std::lock_guard<std::mutex> lock(mtx);
        start_processing = true;
    }

    cv.notify_all();  // Wake ALL workers simultaneously
    std::cout << "Coordinator: All workers notified\n";
}

int main() {
    std::vector<std::thread> workers;
    for (int i = 0; i < 5; ++i) {
        workers.emplace_back(worker, i);
    }

    std::thread coord(coordinator);

    for (auto& t : workers) {
        t.join();
    }
    coord.join();
}
```

`notify_all()` wakes all waiting threads when condition allows multiple threads to proceed.

#### Example 7: Avoiding Lost Wakeups

```cpp
#include <iostream>
#include <thread>
#include <mutex>
#include <condition_variable>

std::mutex mtx;
std::condition_variable cv;
int counter = 0;

void early_notifier() {
    {
        std::lock_guard<std::mutex> lock(mtx);
        counter = 10;
    }
    cv.notify_one();  // Notification happens before waiter starts
    std::cout << "Notified early\n";
}

void late_waiter() {
    std::this_thread::sleep_for(std::chrono::milliseconds(100));  // Delay

    std::unique_lock<std::mutex> lock(mtx);
    cv.wait(lock, []{ return counter > 0; });  // ✅ Predicate checked first

    std::cout << "Waiter: counter = " << counter << "\n";  // Works despite early notification
}

int main() {
    std::thread t1(early_notifier);
    std::thread t2(late_waiter);

    t1.join();
    t2.join();
}
```

Predicates prevent lost wakeups—condition is checked before waiting, so early notifications don't cause issues.

#### Example 8: Termination Signal for Thread Pool

```cpp
#include <iostream>
#include <thread>
#include <vector>
#include <queue>
#include <mutex>
#include <condition_variable>
#include <functional>

class SimpleThreadPool {
private:
    std::vector<std::thread> workers;
    std::queue<std::function<void()>> tasks;
    std::mutex mtx;
    std::condition_variable cv;
    bool stop = false;

public:
    SimpleThreadPool(size_t num_threads) {
        for (size_t i = 0; i < num_threads; ++i) {
            workers.emplace_back([this] {
                while (true) {
                    std::function<void()> task;

                    {
                        std::unique_lock<std::mutex> lock(mtx);
                        cv.wait(lock, [this]{ return stop || !tasks.empty(); });

                        if (stop && tasks.empty()) {
                            return;  // Exit thread
                        }

                        task = std::move(tasks.front());
                        tasks.pop();
                    }

                    task();  // Execute outside lock
                }
            });
        }
    }

    void enqueue(std::function<void()> task) {
        {
            std::lock_guard<std::mutex> lock(mtx);
            tasks.push(std::move(task));
        }
        cv.notify_one();
    }

    ~SimpleThreadPool() {
        {
            std::lock_guard<std::mutex> lock(mtx);
            stop = true;
        }
        cv.notify_all();  // Wake all workers to check stop flag

        for (auto& worker : workers) {
            worker.join();
        }
    }
};

int main() {
    SimpleThreadPool pool(4);

    for (int i = 0; i < 10; ++i) {
        pool.enqueue([i]{ std::cout << "Task " << i << "\n"; });
    }

    std::this_thread::sleep_for(std::chrono::seconds(1));
    // Destructor stops pool
}
```

Condition variables enable graceful thread pool shutdown: workers wait for tasks or stop signal.

---

### QUICK_REFERENCE: Answer Key and Summary Tables

#### Answer Key for Practice Questions

| Q# | Answer | Explanation | Key Concept |
|----|--------|-------------|-------------|
| 1 | May work or spurious wakeup may cause issues | No predicate - vulnerable to spurious wakeups | Spurious wakeup |
| 2 | Race condition possible but predicate likely saves it | ready modified without lock - race, but predicate checks before waiting | Race on condition |
| 3 | Output: "Done" | Predicate checked before waiting - early notification OK | Predicate prevents lost wakeup |
| 4 | Output: "0 1 2 3 4" (order guaranteed within consumer) | notify_all wastes CPU but works | Thundering herd |
| 5 | Output: "Timeout" (no notifier) | wait_for times out after 100ms | Timeout |
| 6 | Waiter blocks forever | Notification before predicate true - lost wakeup | Lost wakeup |
| 7 | Only one thread prints (0, 1, or 2), others wait forever | notify_one wakes only one thread | notify_one limitation |
| 8 | Compilation error | wait() requires unique_lock, not lock_guard | Lock type requirement |
| 9 | Output: "42" | Notify inside lock is correct, just potentially less efficient | Notify inside lock |
| 10 | Output: "Working" | Predicate checked first despite late wait - works | Late wait OK with predicate |
| 11 | Output: "Got 10" | Spurious wakeups handled by predicate rechecking | Multiple notifications |
| 12 | Blocks forever | Predicate always false - infinite wait | Infinite wait |
| 13 | Compilation error | shared_lock should use shared_mutex, not passed directly | condition_variable_any usage |
| 14 | All three consumers print "done" | notify_all wakes all waiters | notify_all broadcast |
| 15 | Output: "Timeout" (if flag not set within 1 second) | wait_until with time point | Absolute timeout |
| 16 | Prints "0 1 2" then blocks forever | Producer finishes, consumer waits infinitely | Missing shutdown mechanism |
| 17 | Output: "Counter is 5" (or higher) | Predicate rechecked each notification | Predicate handles races |
| 18 | Output: "false" | Zero timeout with false predicate - instant return | Zero timeout |
| 19 | Undefined behavior (different mutexes) | Consumer waits with wrong mutex - violates cv contract | Mutex mismatch |
| 20 | Worker blocks forever | Coordinator forgot notify - waiter never woken | Missing notification |

#### Condition Variable Operations

| Operation | Syntax | Purpose | Behavior |
|-----------|--------|---------|----------|
| wait with predicate | `cv.wait(lock, pred)` | Wait until predicate true | Handles spurious wakeups |
| wait without predicate | `cv.wait(lock)` | Wait for notification | Vulnerable to spurious wakeups |
| wait_for | `cv.wait_for(lock, duration, pred)` | Wait with timeout | Returns false on timeout |
| wait_until | `cv.wait_until(lock, time_point, pred)` | Wait until absolute time | Returns false on timeout |
| notify_one | `cv.notify_one()` | Wake one waiting thread | Efficient for single waiter |
| notify_all | `cv.notify_all()` | Wake all waiting threads | Use for broadcast events |

#### Common Patterns

| Pattern | Use Case | Implementation Sketch |
|---------|----------|----------------------|
| Producer-Consumer | Queue coordination | Producer: push + notify; Consumer: wait + pop |
| Bounded Buffer | Limited queue size | Two CVs: not_full, not_empty |
| Barrier | Synchronize N threads | Counter + CV; last arrival notifies all |
| Event Signal | Broadcast event | Flag + CV; notify_all on event |
| Shutdown | Graceful termination | shutdown flag in predicate; notify_all on shutdown |
| Thread Pool | Task queue | Workers wait for tasks; shutdown flag for exit |

#### wait() Mechanics

| Step | Action | Details |
|------|--------|---------|
| 1 | Check predicate | If true, return immediately (no wait) |
| 2 | Unlock mutex | Atomically release lock |
| 3 | Block thread | OS removes from scheduler |
| 4 | Wake on notify | Notification or spurious wakeup occurs |
| 5 | Relock mutex | Atomically reacquire lock |
| 6 | Recheck predicate | Loop if still false (spurious wakeup) |
| 7 | Return | Predicate guaranteed true |

#### Spurious Wakeup Handling

| Approach | Code | Safety |
|----------|------|--------|
| Predicate form (best) | `cv.wait(lock, []{ return ready; })` | ✅ Automatic protection |
| Manual loop | `while (!ready) cv.wait(lock);` | ✅ Correct but verbose |
| No check | `cv.wait(lock);` | ❌ Vulnerable to spurious wakeups |

#### notify Inside vs Outside Lock

| Approach | Performance | Correctness |
|----------|-------------|-------------|
| Notify inside lock | Woken thread immediately blocks again | ✅ Correct but potentially slower |
| Notify outside lock | Woken thread can acquire lock faster | ✅ Correct and often faster |

#### Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| No predicate in wait() | Spurious wakeups cause incorrect behavior | Always use predicate form |
| Modify condition without lock | Data race on shared state | Hold mutex when modifying condition |
| Wrong mutex | Undefined behavior, crashes | Same mutex for condition modification and wait |
| notify_one for broadcast | Only one thread wakes; others stuck | Use notify_all for broadcast events |
| No shutdown mechanism | Threads wait forever on shutdown | Include shutdown flag in predicate |
| Using lock_guard with wait() | Compilation error | Use unique_lock instead |

#### Performance Characteristics

| Operation | Typical Latency | Notes |
|-----------|----------------|-------|
| wait() entry | ~1-5 μs | Syscall to sleep thread |
| notify() | ~0.1-1 μs | Syscall to wake thread |
| Spurious wakeup overhead | ~2-10 μs | Relock + predicate check |
| Context switch | ~1-10 μs | OS scheduler overhead |

#### Best Practices Summary

| Practice | Reason |
|----------|--------|
| ✅ Always use predicate form of wait() | Handles spurious wakeups automatically |
| ✅ Hold mutex when modifying condition | Prevents races on shared state |
| ✅ Same mutex for condition and wait() | Required by CV contract |
| ✅ Notify outside lock when possible | Performance optimization |
| ✅ Use notify_one when only one thread can proceed | Avoids thundering herd |
| ✅ Include shutdown flag in predicates | Enables graceful termination |
| ✅ Use std::unique_lock with CVs | Provides required lock/unlock flexibility |
| ❌ Don't wait without predicate | Vulnerable to spurious wakeups |
| ❌ Don't modify condition outside lock | Data race |
| ❌ Don't use different mutexes for same CV | Undefined behavior |
