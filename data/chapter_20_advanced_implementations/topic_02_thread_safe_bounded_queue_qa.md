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
