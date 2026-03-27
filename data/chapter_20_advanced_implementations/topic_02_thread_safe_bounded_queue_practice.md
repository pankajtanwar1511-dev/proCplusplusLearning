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
