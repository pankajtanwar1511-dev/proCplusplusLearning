## TOPIC: Condition Variables - Thread Synchronization and Event Notification

### THEORY_SECTION: Core Concepts and Foundations

**Condition variables** are synchronization primitives that enable threads to wait for specific conditions to become true, avoiding inefficient busy-waiting (polling in loops). A condition variable (`std::condition_variable`) works in conjunction with a mutex to coordinate between threads: one or more threads wait for a condition to be signaled by another thread. When the condition is met, the signaling thread calls `notify_one()` or `notify_all()`, waking waiting threads. This is the foundation for implementing producer-consumer queues, thread pools, event systems, and other coordination patterns.

#### The Wait-Notify Mechanism

The core operation is `wait(lock, predicate)`, which atomically releases the mutex, blocks the thread until notification, and reacquires the mutex before returning. The predicate (a callable returning bool) is checked before and after waiting to handle **spurious wakeups**—situations where the thread wakes without being notified, caused by implementation details or signal handling. The predicate-based `wait()` is equivalent to `while (!predicate()) cv.wait(lock)` but more concise and less error-prone. Without the predicate check, spurious wakeups can cause incorrect program behavior.

#### Why std::unique_lock is Required

Condition variables require `std::unique_lock` (not `std::lock_guard`) because `wait()` needs to unlock the mutex while blocked and relock it when waking. `std::unique_lock` provides this flexibility—it supports manual lock/unlock operations required by the condition variable implementation. The mutex protects the shared state (the condition itself), and the condition variable coordinates waiting/waking. Always protect condition checks and modifications with the same mutex used with the condition variable.

#### Producer-Consumer Pattern

The classic use case is the producer-consumer pattern: producers create work items and add them to a queue, consumers take items and process them. Condition variables coordinate this: consumers wait when the queue is empty (wake when producers add items), and producers wait when the queue is full (wake when consumers remove items, in bounded-buffer scenarios). This avoids busy-waiting and provides efficient thread synchronization with minimal CPU overhead.

#### Real-World Applications in Autonomous Systems

In autonomous driving, perception threads produce sensor data (camera frames, LiDAR point clouds), placing them in queues for processing threads. A planning thread waits for updated world models from sensor fusion. Control threads wait for new path commands from the planner. Condition variables enable efficient event-driven coordination: threads sleep when no work is available, waking instantly when new data arrives, minimizing latency while conserving CPU for computation.

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

### INTERVIEW_QA: Comprehensive Questions

#### Q1: What is a condition variable and why is it needed instead of busy-waiting?
**Difficulty:** #beginner
**Category:** #threading #synchronization
**Concepts:** #condition_variable #busy_waiting #efficiency

**Answer:**
A condition variable allows threads to wait for a condition to become true without consuming CPU in a polling loop.

**Code example:**
```cpp
// ❌ Busy-waiting - wastes CPU
while (!ready) { std::this_thread::yield(); }

// ✅ Condition variable - efficient waiting
std::unique_lock<std::mutex> lock(mtx);
cv.wait(lock, []{ return ready; });
```

**Explanation:**
Busy-waiting (repeatedly checking a condition in a loop) wastes CPU cycles that could be used for productive work. Condition variables use OS primitives to block the thread, removing it from the scheduler's run queue. The thread consumes zero CPU while waiting and is woken instantly when notified. This is essential for responsive systems and power efficiency.

**Key takeaway:** Use condition variables instead of busy-waiting to efficiently wait for conditions without wasting CPU cycles.

---

#### Q2: Why does condition_variable::wait() require std::unique_lock instead of std::lock_guard?
**Difficulty:** #intermediate
**Category:** #threading #synchronization
**Concepts:** #condition_variable #unique_lock #flexibility

**Answer:**
`wait()` needs to unlock the mutex while blocked and relock it when waking; `unique_lock` provides this flexibility, while `lock_guard` cannot be unlocked manually.

**Explanation:**
The `wait()` operation performs three steps atomically: (1) releases the mutex, (2) blocks the thread, (3) reacquires the mutex when woken. This requires a lock type that supports manual unlocking and relocking. `std::lock_guard` is simple but lacks this capability—it only unlocks in its destructor. `std::unique_lock` provides `lock()` and `unlock()` methods, enabling the condition variable implementation to manipulate the lock state.

**Key takeaway:** Condition variables require `std::unique_lock` because they need to release and reacquire the lock during wait operations.

---

#### Q3: What is a spurious wakeup and how do you protect against it?
**Difficulty:** #intermediate
**Category:** #threading #condition_variable
**Concepts:** #spurious_wakeup #predicate #robustness

**Answer:**
A spurious wakeup is when a thread wakes from `wait()` without being notified. Protect against it by always using a predicate with `wait()`.

**Code example:**
```cpp
// ❌ Vulnerable to spurious wakeups
cv.wait(lock);
process();  // Might execute when condition is false!

// ✅ Protected with predicate
cv.wait(lock, []{ return ready; });
process();  // Guaranteed ready == true
```

**Explanation:**
The C++ standard allows `wait()` to return without notification for implementation efficiency (e.g., signal handling, OS scheduling artifacts). Without a predicate check, the thread might proceed even though the actual condition isn't met, causing incorrect behavior. The predicate form `wait(lock, pred)` is equivalent to `while (!pred()) cv.wait(lock)` and automatically handles spurious wakeups by rechecking the condition.

**Key takeaway:** Always use the predicate form of `wait()` to automatically handle spurious wakeups and ensure the condition is truly met.

---

#### Q4: What is the difference between notify_one() and notify_all()?
**Difficulty:** #beginner
**Category:** #threading #condition_variable
**Concepts:** #notify_one #notify_all #wakeup_policy

**Answer:**
`notify_one()` wakes one waiting thread; `notify_all()` wakes all waiting threads.

**Code example:**
```cpp
// Single item available - wake one consumer
cv.notify_one();

// Broadcast event to all waiters - wake everyone
cv.notify_all();
```

**Explanation:**
Use `notify_one()` when only one thread can meaningfully proceed (e.g., one item added to queue, only one consumer can pop it). Use `notify_all()` when multiple threads can proceed (e.g., broadcasting a shutdown signal, or when the condition allows multiple threads to proceed simultaneously). `notify_all()` can cause a "thundering herd" where many threads wake and compete for the lock, so use sparingly when truly needed.

**Key takeaway:** Use `notify_one()` when only one thread should wake; use `notify_all()` for broadcast notifications or when multiple threads can proceed.

---

#### Q5: Can you call notify() without holding the mutex? Is it safe?
**Difficulty:** #intermediate
**Category:** #threading #condition_variable
**Concepts:** #notify #mutex #lock_scope

**Answer:**
Yes, calling `notify()` without holding the mutex is safe and often more efficient.

**Code example:**
```cpp
// Both are correct
void notify_inside() {
    std::lock_guard<std::mutex> lock(mtx);
    ready = true;
    cv.notify_one();  // Inside lock
}

void notify_outside() {
    {
        std::lock_guard<std::mutex> lock(mtx);
        ready = true;
    }  // Lock released
    cv.notify_one();  // ✅ Outside lock - often better
}
```

**Explanation:**
The condition variable itself is thread-safe; `notify()` can be called with or without holding the mutex. However, you must hold the lock when *modifying* the condition (shared state). Notifying outside the lock is often more efficient: the woken thread can immediately acquire the lock instead of blocking again waiting for the notifier to release it. This is a performance optimization, not a correctness requirement.

**Key takeaway:** Notifying outside the lock is safe and often faster; the mutex protects the shared state, not the notification itself.

---

#### Q6: What happens if you modify the condition variable's state without holding the mutex?
**Difficulty:** #intermediate
**Category:** #threading #condition_variable #race_condition
**Concepts:** #race_condition #mutex #shared_state

**Answer:**
It creates a race condition—waiters might see inconsistent state or miss the notification.

**Code example:**
```cpp
bool ready = false;

// ❌ Race condition
void producer_wrong() {
    ready = true;  // Modified without lock
    cv.notify_one();
}

// ✅ Correct
void producer_right() {
    {
        std::lock_guard<std::mutex> lock(mtx);
        ready = true;  // Modified under lock
    }
    cv.notify_one();
}
```

**Explanation:**
The condition variable doesn't protect the shared state—it only coordinates waiting and notification. The mutex protects the shared state. If you modify the condition without the lock, a waiter might check the condition (under the lock) concurrently with your modification (without the lock), seeing inconsistent state. This is a classic data race. Always hold the same mutex when both modifying the condition and checking it in `wait()`.

**Key takeaway:** Always hold the mutex when modifying shared state used in condition predicates to prevent data races.

---

#### Q7: How do you implement a timeout when waiting on a condition variable?
**Difficulty:** #intermediate
**Category:** #threading #condition_variable #timeout
**Concepts:** #wait_for #wait_until #timeout

**Answer:**
Use `wait_for(lock, duration, predicate)` or `wait_until(lock, time_point, predicate)`, which return false on timeout.

**Code example:**
```cpp
std::unique_lock<std::mutex> lock(mtx);

if (cv.wait_for(lock, std::chrono::seconds(5), []{ return ready; })) {
    // Condition met within 5 seconds
    process();
} else {
    // Timeout - condition not met
    handle_timeout();
}
```

**Explanation:**
`wait_for()` waits for a maximum duration, returning true if the predicate becomes true, false if the timeout expires. `wait_until()` waits until an absolute time point. Both recheck the predicate after timeout before returning, so a late notification that arrives during the timeout check can still succeed. Timeouts are useful for implementing watchdogs, retries, or bounded waiting in real-time systems.

**Key takeaway:** Use `wait_for()` or `wait_until()` for bounded waiting with timeouts, returning false if the deadline is exceeded.

---

#### Q8: Why must the predicate lambda capture variables by value or be carefully designed when capturing by reference?
**Difficulty:** #advanced
**Category:** #threading #condition_variable #lifetime
**Concepts:** #lambda_capture #lifetime #predicate

**Answer:**
The predicate lambda is evaluated repeatedly during spurious wakeups; capturing by reference is safe only if captured variables outlive all wait operations.

**Code example:**
```cpp
void safe_capture() {
    bool local_ready = false;  // Stack variable

    std::thread worker([&local_ready]{
        std::unique_lock<std::mutex> lock(mtx);
        cv.wait(lock, [&local_ready]{ return local_ready; });  // ✅ Safe - joined before return
    });

    worker.join();  // local_ready still alive
}

void unsafe_detach() {
    bool local_ready = false;

    std::thread worker([&local_ready]{  // ❌ Dangerous with detach
        std::unique_lock<std::mutex> lock(mtx);
        cv.wait(lock, [&local_ready]{ return local_ready; });  // Might access destroyed variable
    });

    worker.detach();
}  // local_ready destroyed, thread still running
```

**Explanation:**
The predicate is invoked every time the thread wakes (including spurious wakeups). If the predicate captures stack variables by reference and the thread is detached or outlives the scope, accessing those variables causes undefined behavior. Capture by value is safer but requires the shared state to be accessible. Typically, predicates check member variables or static/global state protected by the associated mutex.

**Key takeaway:** Predicates are evaluated repeatedly; ensure captured variables outlive all wait operations, or use member variables protected by the mutex.

---

#### Q9: Can a notification be lost if notify() is called before wait()?
**Difficulty:** #advanced
**Category:** #threading #condition_variable
**Concepts:** #lost_wakeup #predicate #timing

**Answer:**
With predicates, no—the predicate is checked before waiting. Without predicates, yes—early notifications are lost.

**Code example:**
```cpp
// With predicate - safe
ready = true;
cv.notify_one();  // Even if this happens before wait()...

cv.wait(lock, []{ return ready; });  // ...predicate is checked first, returns immediately

// Without predicate - lost wakeup
cv.notify_one();  // Notification sent
cv.wait(lock);    // ❌ Waits forever - missed notification
```

**Explanation:**
Condition variable notifications are not queued. If `notify()` occurs when no thread is waiting, the notification is lost. However, when using predicates, `wait()` checks the predicate *before* blocking. If the condition is already true, it returns immediately without waiting, effectively handling "early" notifications. This is why predicates are essential—they decouple the notification mechanism from the condition itself.

**Key takeaway:** Predicates prevent lost wakeups by checking the condition before waiting, making notification timing irrelevant.

---

#### Q10: What is the thundering herd problem with condition variables?
**Difficulty:** #advanced
**Category:** #threading #condition_variable #performance
**Concepts:** #thundering_herd #notify_all #performance

**Answer:**
When `notify_all()` wakes many threads, they all compete for the lock, causing cache contention and context switch overhead, but only one typically proceeds.

**Code example:**
```cpp
// Many consumers waiting
void consumer() {
    std::unique_lock<std::mutex> lock(mtx);
    cv.wait(lock, []{ return !queue.empty(); });
    auto item = queue.front();  // Only one can pop
    queue.pop();
}

void producer() {
    {
        std::lock_guard<std::mutex> lock(mtx);
        queue.push(item);
    }
    cv.notify_all();  // ❌ Wakes ALL consumers, but only one can pop
    // Better: cv.notify_one();
}
```

**Explanation:**
`notify_all()` wakes all waiting threads. They all wake, attempt to acquire the lock, most fail and re-block, causing wasted CPU cycles and cache thrashing. For producer-consumer with a single item, only one consumer can proceed, making `notify_all()` wasteful. Use `notify_one()` when only one thread can meaningfully proceed. Use `notify_all()` for broadcast events (shutdown, configuration changes) where multiple threads should respond.

**Key takeaway:** Avoid unnecessary `notify_all()` to prevent thundering herd; use `notify_one()` when only one thread can proceed.

---

#### Q11: How do you implement a graceful shutdown for threads waiting on condition variables?
**Difficulty:** #advanced
**Category:** #threading #condition_variable #shutdown
**Concepts:** #shutdown #termination #notify_all

**Answer:**
Set a shutdown flag (protected by the same mutex), include it in the predicate, and use `notify_all()` to wake all threads.

**Code example:**
```cpp
std::mutex mtx;
std::condition_variable cv;
std::queue<Task> tasks;
bool shutdown = false;

void worker() {
    while (true) {
        std::unique_lock<std::mutex> lock(mtx);
        cv.wait(lock, []{ return shutdown || !tasks.empty(); });  // ✅ Check shutdown

        if (shutdown && tasks.empty()) {
            return;  // Exit cleanly
        }

        auto task = std::move(tasks.front());
        tasks.pop();
        lock.unlock();

        task.execute();
    }
}

void shutdown_threads() {
    {
        std::lock_guard<std::mutex> lock(mtx);
        shutdown = true;
    }
    cv.notify_all();  // Wake all workers to check shutdown flag
}
```

**Explanation:**
The predicate includes the shutdown flag: `shutdown || !tasks.empty()`. When shutting down, set the flag and call `notify_all()` to wake all waiters. Workers check the flag and exit gracefully. This ensures no thread remains blocked indefinitely waiting for work that will never arrive.

**Key takeaway:** Include a shutdown flag in wait predicates and use `notify_all()` during shutdown to wake and terminate all waiting threads gracefully.

---

#### Q12: What is std::condition_variable_any and when would you use it?
**Difficulty:** #advanced
**Category:** #threading #condition_variable
**Concepts:** #condition_variable_any #flexibility #custom_locks

**Answer:**
`std::condition_variable_any` works with any lock type (not just `std::unique_lock<std::mutex>`), providing more flexibility at the cost of performance.

**Code example:**
```cpp
std::condition_variable_any cv_any;
std::shared_mutex smtx;

void worker() {
    std::shared_lock<std::shared_mutex> lock(smtx);  // ✅ Works with condition_variable_any
    cv_any.wait(lock, []{ return ready; });
}
```

**Explanation:**
`std::condition_variable` requires `std::unique_lock<std::mutex>` for efficiency. `std::condition_variable_any` is a template that works with any lock type satisfying BasicLockable (has `lock()` and `unlock()`), including `std::shared_lock`, `std::scoped_lock`, or custom lock types. The trade-off is slightly higher overhead due to type erasure. Use `condition_variable_any` when you need to work with non-standard lock types; otherwise, prefer `condition_variable`.

**Key takeaway:** Use `std::condition_variable_any` when you need to wait with non-standard lock types, accepting slightly higher overhead for flexibility.

---

#### Q13: How do you prevent priority inversion with condition variables in real-time systems?
**Difficulty:** #advanced
**Category:** #threading #real_time #condition_variable
**Concepts:** #priority_inversion #real_time #priority_inheritance

**Answer:**
Use priority-inheritance mutexes (platform-specific), or avoid blocking entirely with lock-free algorithms.

**Explanation:**
Priority inversion occurs when a high-priority thread blocks on a mutex held by a low-priority thread, which is preempted by medium-priority threads. Standard C++ mutexes don't provide priority inheritance on all platforms. Solutions: (1) Use platform-specific priority-inheritance mutexes (PTHREAD_PRIO_INHERIT on POSIX), (2) Design to avoid long critical sections, (3) Use lock-free algorithms where feasible. Condition variables exacerbate priority inversion because waiting threads can be blocked indefinitely if the notifier is low-priority and starved.

**Key takeaway:** Standard condition variables don't address priority inversion; use platform-specific priority protocols or lock-free designs in real-time systems.

---

#### Q14: Can you use multiple condition variables with the same mutex?
**Difficulty:** #intermediate
**Category:** #threading #condition_variable
**Concepts:** #multiple_conditions #same_mutex #design

**Answer:**
Yes, multiple condition variables can share the same mutex, each signaling different conditions.

**Code example:**
```cpp
std::mutex mtx;
std::condition_variable cv_not_full;
std::condition_variable cv_not_empty;
std::queue<int> queue;
const size_t MAX_SIZE = 10;

void producer() {
    std::unique_lock<std::mutex> lock(mtx);
    cv_not_full.wait(lock, []{ return queue.size() < MAX_SIZE; });
    queue.push(item);
    cv_not_empty.notify_one();  // Signal different condition
}

void consumer() {
    std::unique_lock<std::mutex> lock(mtx);
    cv_not_empty.wait(lock, []{ return !queue.empty(); });
    auto item = queue.front();
    queue.pop();
    cv_not_full.notify_one();  // Signal different condition
}
```

**Explanation:**
Multiple condition variables sharing one mutex allow signaling different events. In bounded buffers, `cv_not_full` signals producers, `cv_not_empty` signals consumers. The mutex protects the shared state (queue), while each condition variable represents a different predicate. This is more efficient than broadcasting all waiters and having them recheck conditions.

**Key takeaway:** Multiple condition variables can share one mutex to signal different conditions, improving efficiency by waking only relevant waiters.

---

#### Q15: What is the relationship between condition variables and semaphores?
**Difficulty:** #advanced
**Category:** #threading #synchronization #theory
**Concepts:** #condition_variable #semaphore #comparison

**Answer:**
Semaphores count resources and allow waiting when count is zero. Condition variables signal arbitrary conditions. Semaphores are simpler but less flexible.

**Code example:**
```cpp
// Semaphore-like (counting) - C++20 has std::counting_semaphore
std::mutex mtx;
std::condition_variable cv;
int count = 0;

void acquire() {
    std::unique_lock<std::mutex> lock(mtx);
    cv.wait(lock, []{ return count > 0; });
    --count;
}

void release() {
    std::lock_guard<std::mutex> lock(mtx);
    ++count;
    cv.notify_one();
}
```

**Explanation:**
Semaphores maintain a count; acquire decrements (blocking if zero), release increments. Condition variables are more general: they signal arbitrary conditions (not just counts). You can implement semaphore behavior with condition variables, but not vice versa for complex conditions. C++20 added `std::counting_semaphore` and `std::binary_semaphore` as lightweight synchronization primitives for resource counting scenarios.

**Key takeaway:** Condition variables are more flexible than semaphores, signaling arbitrary conditions; C++20 provides dedicated semaphore types for resource counting.

---

#### Q16: How do you debug missed notifications or lost wakeups with condition variables?
**Difficulty:** #advanced
**Category:** #threading #debugging #condition_variable
**Concepts:** #debugging #logging #lost_wakeup

**Answer:**
Add logging around wait, notify, and condition changes; use ThreadSanitizer to detect races on shared state; ensure predicates are used.

**Explanation:**
Symptoms: threads block forever despite notifications being sent. Causes: (1) Notification before wait without predicate, (2) Race on condition modification (not holding lock), (3) Wrong mutex/condition variable, (4) Logic error in predicate. Debug: (1) Log entry/exit of `wait()` and `notify()` calls with thread IDs, (2) Log condition state changes, (3) Verify same mutex protects condition and is used with condition variable, (4) Run with ThreadSanitizer to detect races, (5) Always use predicates to avoid lost notifications.

**Key takeaway:** Debug condition variable issues with logging, ThreadSanitizer for races, and always using predicates to prevent lost wakeups.

---

#### Q17: In autonomous driving perception systems, how would you use condition variables for frame synchronization?
**Difficulty:** #advanced
**Category:** #threading #condition_variable #real_world
**Concepts:** #autonomous_driving #synchronization #frame_processing

**Answer:**
Producer thread captures frames, pushes to queue, notifies; processing thread waits for frames, ensuring no busy-waiting and minimal latency.

**Code example:**
```cpp
std::mutex mtx;
std::condition_variable cv_frame_ready;
std::queue<Frame> frame_queue;
bool shutdown = false;

void camera_capture_thread() {
    while (!shutdown) {
        Frame frame = capture_from_sensor();

        {
            std::lock_guard<std::mutex> lock(mtx);
            frame_queue.push(std::move(frame));
        }
        cv_frame_ready.notify_one();
    }
}

void perception_thread() {
    while (true) {
        Frame frame;

        {
            std::unique_lock<std::mutex> lock(mtx);
            cv_frame_ready.wait(lock, []{ return shutdown || !frame_queue.empty(); });

            if (shutdown && frame_queue.empty()) break;

            frame = std::move(frame_queue.front());
            frame_queue.pop();
        }

        process_frame(frame);  // Object detection, segmentation, etc.
    }
}
```

**Explanation:**
Camera thread produces frames at 30Hz, perception thread processes them. Condition variables enable instant wakeup when frames arrive (low latency) without burning CPU polling (efficiency). Critical for real-time systems where processing must start within microseconds of capture to meet safety deadlines.

**Key takeaway:** Condition variables enable efficient low-latency event-driven coordination between sensor capture and processing threads in real-time systems.

---

#### Q18: What are the performance characteristics of condition variable operations?
**Difficulty:** #advanced
**Category:** #threading #condition_variable #performance
**Concepts:** #performance #overhead #benchmarking

**Answer:**
`wait()`: ~1-5μs (syscall to sleep). `notify()`: ~0.1-1μs (syscall to wake). Much faster than busy-waiting under contention.

**Explanation:**
Waiting involves a kernel syscall (futex on Linux) to put the thread to sleep, removing it from the scheduler. Waking involves a kernel call to mark the thread runnable. While microsecond-scale overhead seems high, it's vastly better than busy-waiting which consumes 100% CPU per thread. For sub-microsecond critical sections, consider lock-free algorithms. For anything longer, condition variables are efficient and scale well. Contention increases latency due to cache effects and context switching.

**Key takeaway:** Condition variable operations cost microseconds (syscalls), efficient for waiting but higher overhead than lock-free for sub-microsecond critical sections.

---

#### Q19: How do you implement a barrier synchronization using condition variables?
**Difficulty:** #advanced
**Category:** #threading #condition_variable #patterns
**Concepts:** #barrier #synchronization #coordination

**Answer:**
Use a counter and condition variable; threads wait until all reach the barrier, then release.

**Code example:**
```cpp
class Barrier {
    std::mutex mtx;
    std::condition_variable cv;
    size_t count;
    const size_t threshold;
    size_t generation = 0;

public:
    explicit Barrier(size_t num_threads) : threshold(num_threads), count(num_threads) {}

    void wait() {
        std::unique_lock<std::mutex> lock(mtx);
        size_t gen = generation;

        if (--count == 0) {
            ++generation;
            count = threshold;
            cv.notify_all();  // Release all waiters
        } else {
            cv.wait(lock, [this, gen]{ return gen != generation; });
        }
    }
};

// Usage: All threads wait until all arrive
void worker(Barrier& barrier, int id) {
    std::cout << "Thread " << id << " phase 1\n";
    barrier.wait();  // Sync point
    std::cout << "Thread " << id << " phase 2\n";
}
```

**Explanation:**
Barriers synchronize a fixed number of threads at a rendezvous point. All threads block until the last arrives, then all are released simultaneously. The generation counter prevents early threads from the next iteration from mixing with late threads from the previous iteration. C++20 provides `std::barrier` and `std::latch` as standard synchronization primitives.

**Key takeaway:** Implement barriers with a counter and condition variable; C++20 provides `std::barrier` for this pattern.

---

#### Q20: What is the difference between condition_variable::wait() and condition_variable::wait_for() in terms of guarantees?
**Difficulty:** #intermediate
**Category:** #threading #condition_variable #timeout
**Concepts:** #wait #wait_for #timeout #guarantees

**Answer:**
`wait()` blocks indefinitely until notified and predicate is true. `wait_for()` additionally unblocks after timeout, returning false if predicate is still false.

**Code example:**
```cpp
// wait() - blocks until predicate true
cv.wait(lock, []{ return ready; });  // No timeout, waits forever if never signaled

// wait_for() - bounds maximum wait time
if (cv.wait_for(lock, 5s, []{ return ready; })) {
    // Predicate became true within 5 seconds
} else {
    // Timeout expired, predicate still false
}
```

**Explanation:**
`wait()` provides strong guarantees: it only returns when the predicate is true (handling spurious wakeups automatically). `wait_for()` adds a timing dimension: it returns when either the predicate becomes true OR the timeout expires, returning a bool to distinguish. This is essential for watchdog timers, retries with backoff, and preventing indefinite hangs in distributed systems.

**Key takeaway:** `wait()` guarantees predicate is true on return; `wait_for()` also returns on timeout (predicate may be false), indicated by return value.

---

### PRACTICE_TASKS: Output Prediction and Code Analysis

#### Q1
```cpp
std::mutex mtx;
std::condition_variable cv;
bool ready = false;

void worker() {
    std::unique_lock<std::mutex> lock(mtx);
    cv.wait(lock);  // No predicate
    std::cout << "Working\n";
}

void notifier() {
    std::this_thread::sleep_for(std::chrono::milliseconds(100));
    cv.notify_one();
}
```

#### Q2
```cpp
std::mutex mtx;
std::condition_variable cv;
bool ready = false;

void producer() {
    ready = true;  // No lock
    cv.notify_one();
}

void consumer() {
    std::unique_lock<std::mutex> lock(mtx);
    cv.wait(lock, []{ return ready; });
    std::cout << "Ready\n";
}
```

#### Q3
```cpp
std::mutex mtx;
std::condition_variable cv;
bool ready = false;

void notifier() {
    {
        std::lock_guard<std::mutex> lock(mtx);
        ready = true;
    }
    cv.notify_one();
}

void waiter() {
    std::this_thread::sleep_for(std::chrono::seconds(1));
    std::unique_lock<std::mutex> lock(mtx);
    cv.wait(lock, []{ return ready; });
    std::cout << "Done\n";
}
```

#### Q4
```cpp
std::mutex mtx;
std::condition_variable cv;
std::queue<int> q;

void producer() {
    for (int i = 0; i < 5; ++i) {
        std::lock_guard<std::mutex> lock(mtx);
        q.push(i);
        cv.notify_all();
    }
}

void consumer() {
    for (int i = 0; i < 5; ++i) {
        std::unique_lock<std::mutex> lock(mtx);
        cv.wait(lock, [&]{ return !q.empty(); });
        std::cout << q.front() << " ";
        q.pop();
    }
}
```

#### Q5
```cpp
std::mutex mtx;
std::condition_variable cv;
bool ready = false;

void worker() {
    std::unique_lock<std::mutex> lock(mtx);
    if (cv.wait_for(lock, std::chrono::milliseconds(100), []{ return ready; })) {
        std::cout << "Ready\n";
    } else {
        std::cout << "Timeout\n";
    }
}
```

#### Q6
```cpp
std::mutex mtx;
std::condition_variable cv;
int counter = 0;

void waiter() {
    std::unique_lock<std::mutex> lock(mtx);
    cv.wait(lock, [&]{ return counter > 0; });
    std::cout << counter << "\n";
}

void notifier() {
    cv.notify_one();  // Notify before setting counter
    {
        std::lock_guard<std::mutex> lock(mtx);
        counter = 10;
    }
}
```

#### Q7
```cpp
std::mutex mtx;
std::condition_variable cv;
bool start = false;

void worker(int id) {
    std::unique_lock<std::mutex> lock(mtx);
    cv.wait(lock, []{ return start; });
    std::cout << id << " ";
}

int main() {
    std::vector<std::thread> threads;
    for (int i = 0; i < 3; ++i) {
        threads.emplace_back(worker, i);
    }

    {
        std::lock_guard<std::mutex> lock(mtx);
        start = true;
    }
    cv.notify_one();  // Only notify_one

    for (auto& t : threads) t.join();
}
```

#### Q8
```cpp
std::mutex mtx;
std::condition_variable cv;

void waiter() {
    std::lock_guard<std::mutex> lock(mtx);  // lock_guard
    cv.wait(lock, []{ return true; });
}
```

#### Q9
```cpp
std::mutex mtx;
std::condition_variable cv;
std::queue<int> q;

void producer() {
    {
        std::lock_guard<std::mutex> lock(mtx);
        q.push(42);
        cv.notify_one();  // Notify inside lock
    }
}

void consumer() {
    std::unique_lock<std::mutex> lock(mtx);
    cv.wait(lock, [&]{ return !q.empty(); });
    std::cout << q.front() << "\n";
}
```

#### Q10
```cpp
std::mutex mtx;
std::condition_variable cv;
bool ready = false;

void setup() {
    std::lock_guard<std::mutex> lock(mtx);
    ready = true;
    cv.notify_one();
}

void worker() {
    std::this_thread::sleep_for(std::chrono::seconds(2));
    std::unique_lock<std::mutex> lock(mtx);
    cv.wait(lock, []{ return ready; });
    std::cout << "Working\n";
}

int main() {
    std::thread t1(setup);
    std::thread t2(worker);
    t1.join(); t2.join();
}
```

#### Q11
```cpp
std::mutex mtx;
std::condition_variable cv;
int value = 0;

void waiter() {
    std::unique_lock<std::mutex> lock(mtx);
    cv.wait(lock, [&]{ return value == 10; });
    std::cout << "Got 10\n";
}

void setter() {
    for (int i = 1; i <= 10; ++i) {
        {
            std::lock_guard<std::mutex> lock(mtx);
            value = i;
        }
        cv.notify_one();
    }
}
```

#### Q12
```cpp
std::mutex m1;
std::condition_variable cv;

void thread1() {
    std::unique_lock<std::mutex> lock(m1);
    cv.wait(lock, []{ return false; });  // Predicate always false
}
```

#### Q13
```cpp
std::mutex mtx;
std::condition_variable_any cv;
std::shared_lock<std::shared_mutex> smtx;

void worker() {
    cv.wait(smtx, []{ return true; });
}
```

#### Q14
```cpp
std::mutex mtx;
std::condition_variable cv;
bool ready = false;

void producer() {
    std::this_thread::sleep_for(std::chrono::milliseconds(50));
    {
        std::lock_guard<std::mutex> lock(mtx);
        ready = true;
    }
    cv.notify_all();
}

void consumer(int id) {
    std::unique_lock<std::mutex> lock(mtx);
    cv.wait(lock, []{ return ready; });
    std::cout << "Consumer " << id << " done\n";
}

int main() {
    std::thread p(producer);
    std::thread c1(consumer, 1);
    std::thread c2(consumer, 2);
    std::thread c3(consumer, 3);

    p.join(); c1.join(); c2.join(); c3.join();
}
```

#### Q15
```cpp
std::mutex mtx;
std::condition_variable cv;
bool flag = false;

void waiter() {
    std::unique_lock<std::mutex> lock(mtx);
    cv.wait_until(lock,
                  std::chrono::steady_clock::now() + std::chrono::seconds(1),
                  []{ return flag; });
    std::cout << (flag ? "Flag set" : "Timeout") << "\n";
}
```

#### Q16
```cpp
std::mutex mtx;
std::condition_variable cv;
std::queue<int> q;

void producer() {
    for (int i = 0; i < 3; ++i) {
        {
            std::lock_guard<std::mutex> lock(mtx);
            q.push(i);
        }
        cv.notify_one();
        std::this_thread::sleep_for(std::chrono::milliseconds(100));
    }
}

void consumer() {
    while (true) {
        std::unique_lock<std::mutex> lock(mtx);
        cv.wait(lock, [&]{ return !q.empty(); });
        std::cout << q.front() << " ";
        q.pop();
    }
}
```

#### Q17
```cpp
std::mutex mtx;
std::condition_variable cv;
int counter = 0;

void increment() {
    std::lock_guard<std::mutex> lock(mtx);
    ++counter;
    if (counter == 5) {
        cv.notify_one();
    }
}

void waiter() {
    std::unique_lock<std::mutex> lock(mtx);
    cv.wait(lock, [&]{ return counter >= 5; });
    std::cout << "Counter is " << counter << "\n";
}
```

#### Q18
```cpp
std::mutex mtx;
std::condition_variable cv;

void waiter() {
    std::unique_lock<std::mutex> lock(mtx);
    bool result = cv.wait_for(lock, std::chrono::seconds(0), []{ return false; });
    std::cout << std::boolalpha << result << "\n";
}
```

#### Q19
```cpp
std::mutex mtx1, mtx2;
std::condition_variable cv;
bool ready = false;

void producer() {
    std::lock_guard<std::mutex> lock(mtx1);
    ready = true;
    cv.notify_one();
}

void consumer() {
    std::unique_lock<std::mutex> lock(mtx2);  // Different mutex!
    cv.wait(lock, []{ return ready; });
}
```

#### Q20
```cpp
std::mutex mtx;
std::condition_variable cv;
bool done = false;

void worker() {
    std::unique_lock<std::mutex> lock(mtx);
    cv.wait(lock, []{ return done; });
    std::cout << "Worker done\n";
}

void coordinator() {
    {
        std::lock_guard<std::mutex> lock(mtx);
        done = true;
    }
    // Forgot to call cv.notify_one()
}
```

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
