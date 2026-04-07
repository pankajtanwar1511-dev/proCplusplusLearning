### PRACTICE_TASKS

#### Q1

Implement `try_push()` without looking at the solution. What are the key differences from `push()`?

**Solution:**

```cpp
bool try_push(const T& value) {
    std::lock_guard<std::mutex> lock(mutex_);  // lock_guard (not unique_lock)

    if (queue_.size() >= capacity_ || is_closed_) {
        return false;  // Immediately return if full or closed
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
5. Checks capacity immediately without waiting

---

#### Q2

Add a `clear()` method that removes all elements. What synchronization is needed?

**Solution:**

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
- Better to wake all producers at once

---

#### Q3

Implement `emplace()` to construct elements in-place. How does it differ from `push()`?

**Solution:**

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

**Solution:**

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

---

#### Q5

Implement `drain()` that moves all elements to a vector and returns them atomically.

**Solution:**

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
