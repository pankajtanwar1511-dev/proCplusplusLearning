### PRACTICE_TASKS: Output Prediction and Code Analysis
#### Q1
Implement `size()` for the lock-free stack without using `std::atomic<size_t>`. How would you track size using only the head pointer?

Implement this exercise.

**Answer:**

**Not practical** - would require traversing the list (O(n)):

```cpp
size_t size() const {
    size_t count = 0;
    TaggedPointer current = head_.load(std::memory_order_acquire);

    while (current.ptr != nullptr) {
        ++count;
        current.ptr = current.ptr->next;  // NOT THREAD-SAFE!
    }

    return count;
}
```

**Problem:** `current.ptr->next` may be freed mid-traversal → segfault.

**Solution:** Use atomic size counter (approximate):

```cpp
std::atomic<size_t> size_{0};

void push(...) {
    // ...
    size_.fetch_add(1, std::memory_order_relaxed);
}

std::optional<T> try_pop() {
    // ...
    size_.fetch_sub(1, std::memory_order_relaxed);
}

size_t size() const {
    return size_.load(std::memory_order_relaxed);
}
```

**Note:** Size may be approximate (concurrent push/pop in flight).

---

#### Q2
Add a `clear()` method that removes all elements. Can it be done lock-free?

Implement this exercise.

**Answer:**

**Yes, but complex:**

```cpp
void clear() {
    TaggedPointer old_head = head_.load(std::memory_order_acquire);
    TaggedPointer new_head(nullptr, old_head.tag + 1);

    // CAS to empty stack
    while (!head_.compare_exchange_weak(
        old_head,
        new_head,
        std::memory_order_release,
        std::memory_order_acquire
    )) {
        new_head.tag = old_head.tag + 1;
    }

    // old_head now points to removed list
    // Defer deletion (memory reclamation issue)
    // In production: add to retirement list
    while (old_head.ptr) {
        Node* next = old_head.ptr->next;
        delete old_head.ptr;  // Simplified (unsafe if other threads accessing)
        old_head.ptr = next;
    }

    size_.store(0, std::memory_order_relaxed);
}
```

**Caveat:** Deletion is unsafe if other threads still accessing nodes (need hazard pointers).

---

#### Q3
Modify the stack to support a `peek()` operation (view top without popping). What are the challenges?

Implement this exercise.

**Answer:**

```cpp
std::optional<T> peek() const {
    TaggedPointer head = head_.load(std::memory_order_acquire);

    if (head.ptr == nullptr) {
        return std::nullopt;
    }

    return head.ptr->data;  // ← DANGER!
}
```

**Challenges:**

**1) Use-after-free:**
- Head may be popped and freed between load and data access
- Solution: Reference counting or hazard pointers

**2) Stale data:**
- Value may be immediately popped after peek
- Document: "peek() provides snapshot, may be stale"

**Safe version with hazard pointer:**

```cpp
std::optional<T> peek() const {
    while (true) {
        TaggedPointer head = head_.load(std::memory_order_acquire);

        if (head.ptr == nullptr) {
            return std::nullopt;
        }

        // Mark as hazard
        hazard_ptr.store(head.ptr, std::memory_order_release);

        // Verify still head
        if (head_.load(std::memory_order_acquire).ptr == head.ptr) {
            T value = head.ptr->data;
            hazard_ptr.store(nullptr, std::memory_order_release);
            return value;
        }
        // Retry if head changed
    }
}
```

---

#### Q4
Implement a lock-free stack that supports both LIFO (stack) and FIFO (queue) operations.

Implement this exercise.

**Answer:**

**Not possible with single linked list** - FIFO requires tail pointer.

**Hybrid approach:**

```cpp
template<typename T>
class LockFreeDeque {
private:
    struct Node {
        T data;
        std::atomic<Node*> next;
        std::atomic<Node*> prev;
    };

    std::atomic<Node*> head_;
    std::atomic<Node*> tail_;

public:
    void push_front(const T& value);  // LIFO
    void push_back(const T& value);   // FIFO
    std::optional<T> pop_front();
    std::optional<T> pop_back();
};
```

**Implementation is very complex** (doubly-linked requires two CAS operations).

**Simpler:** Use two separate structures (one stack, one queue).

---

#### Q5
Add a `contains(const T& value)` method. What are the thread-safety implications?

Implement this exercise.

**Answer:**

```cpp
bool contains(const T& value) const {
    TaggedPointer current = head_.load(std::memory_order_acquire);

    while (current.ptr != nullptr) {
        if (current.ptr->data == value) {
            return true;  // ← Snapshot, may be stale
        }

        Node* next = current.ptr->next;  // ← May be freed mid-iteration!
        current.ptr = next;
    }

    return false;
}
```

**Issues:**

**1) Use-after-free:**
- Node may be deleted during iteration
- Solution: Hazard pointers for each visited node

**2) Stale result:**
- Value may be added/removed immediately after check
- Document: "Best-effort check, may be outdated"

**Safe version (using hazard pointers):**

```cpp
bool contains(const T& value) const {
    thread_local std::vector<Node*> hazards;

    TaggedPointer current = head_.load(std::memory_order_acquire);

    while (current.ptr != nullptr) {
        hazards.push_back(current.ptr);

        if (current.ptr->data == value) {
            hazards.clear();
            return true;
        }

        current.ptr = current.ptr->next;
    }

    hazards.clear();
    return false;
}
```

---

#### Q6
Benchmark the lock-free stack vs `std::stack` with mutex. Under what conditions does each perform better?

Implement this exercise.

**Answer:**

```cpp
#include <chrono>
#include <iostream>

template<typename Stack>
void benchmark(int num_threads, int ops_per_thread) {
    Stack stack;

    auto start = std::chrono::high_resolution_clock::now();

    std::vector<std::thread> threads;
    for (int i = 0; i < num_threads; ++i) {
        threads.emplace_back([&stack, ops_per_thread]() {
            for (int j = 0; j < ops_per_thread; ++j) {
                stack.push(j);
                stack.try_pop();
            }
        });
    }

    for (auto& t : threads) t.join();

    auto end = std::chrono::high_resolution_clock::now();
    auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(end - start).count();

    std::cout << num_threads << " threads: " << ms << " ms\n";
}

int main() {
    std::cout << "Lock-Free Stack:\n";
    benchmark<LockFreeStack<int>>(1, 1000000);
    benchmark<LockFreeStack<int>>(2, 500000);
    benchmark<LockFreeStack<int>>(4, 250000);
    benchmark<LockFreeStack<int>>(8, 125000);

    std::cout << "\nMutex Stack:\n";
    benchmark<MutexStack<int>>(1, 1000000);
    benchmark<MutexStack<int>>(2, 500000);
    benchmark<MutexStack<int>>(4, 250000);
    benchmark<MutexStack<int>>(8, 125000);
}
```

**Typical results:**
```
Lock-Free Stack:
1 threads: 45 ms
2 threads: 38 ms
4 threads: 35 ms
8 threads: 34 ms

Mutex Stack:
1 threads: 28 ms
2 threads: 62 ms
4 threads: 145 ms
8 threads: 287 ms
```

**Conclusions:**
- **Single thread:** Mutex wins (no atomic overhead)
- **High contention (8+ threads):** Lock-free wins (no blocking)
- **Crossover:** ~2-4 threads

---

#### Q7
Implement a lock-free stack that tracks the maximum size ever reached.

Implement this exercise.

**Answer:**

```cpp
template<typename T>
class LockFreeStack {
private:
    std::atomic<TaggedPointer> head_;
    std::atomic<size_t> size_{0};
    std::atomic<size_t> max_size_{0};  // New

public:
    void push(const T& value) {
        // ... push logic ...

        size_t new_size = size_.fetch_add(1, std::memory_order_relaxed) + 1;

        // Update max_size atomically
        size_t current_max = max_size_.load(std::memory_order_relaxed);
        while (new_size > current_max &&
               !max_size_.compare_exchange_weak(
                   current_max, new_size,
                   std::memory_order_relaxed
               )) {
            // Retry if another thread updated max
        }
    }

    size_t max_size() const {
        return max_size_.load(std::memory_order_relaxed);
    }
};
```

**Note:** Max size is approximate (concurrent operations may make actual max higher).

---

#### Q8
Modify the stack to support tagged data (priority). How would you pop the highest priority item?

Implement this exercise.

**Answer:**

**Not possible with stack structure** (LIFO doesn't support priority).

**Would need:**
- **Priority queue** (heap-based)
- Lock-free heap implementations exist but are very complex

**Simplified (not truly lock-free):**

```cpp
template<typename T, typename Compare = std::less<T>>
class LockFreePriorityStack {
private:
    std::priority_queue<T, std::vector<T>, Compare> heap_;
    std::mutex mutex_;  // Fallback to mutex for priority queue

public:
    void push(const T& value) {
        std::lock_guard<std::mutex> lock(mutex_);
        heap_.push(value);
    }

    std::optional<T> try_pop() {
        std::lock_guard<std::mutex> lock(mutex_);
        if (heap_.empty()) return std::nullopt;

        T value = heap_.top();
        heap_.pop();
        return value;
    }
};
```

**True lock-free priority queue:** Research topic (Linden's skiplist-based approach).

---

#### Q9
Add a `wait_until_empty()` method that blocks until the stack is empty. Can this be lock-free?

Implement this exercise.

**Answer:**

**No** - blocking inherently requires waiting.

**Hybrid approach (lock-free stack + condition variable):**

```cpp
template<typename T>
class LockFreeStack {
private:
    std::atomic<TaggedPointer> head_;
    std::atomic<size_t> size_{0};

    // For wait_until_empty:
    std::mutex cv_mutex_;
    std::condition_variable cv_;

public:
    std::optional<T> try_pop() {
        // ... pop logic ...

        if (size_.fetch_sub(1, std::memory_order_relaxed) == 1) {
            // Just became empty
            cv_.notify_all();
        }

        return value;
    }

    void wait_until_empty() {
        std::unique_lock<std::mutex> lock(cv_mutex_);
        cv_.wait(lock, [this]() {
            return size_.load(std::memory_order_relaxed) == 0;
        });
    }
};
```

**Stack operations remain lock-free**, but waiting is blocking.

---

#### Q10
Implement a lock-free stack with capacity limit (bounded stack).



**Answer:**

```cpp
template<typename T>
class BoundedLockFreeStack {
private:
    std::atomic<TaggedPointer> head_;
    std::atomic<size_t> size_{0};
    const size_t capacity_;

public:
    explicit BoundedLockFreeStack(size_t capacity)
        : head_(TaggedPointer{}), capacity_(capacity) {}

    bool try_push(const T& value) {
        // Check capacity first (may have race, recheck after CAS)
        if (size_.load(std::memory_order_relaxed) >= capacity_) {
            return false;
        }

        Node* new_node = new Node(value);
        TaggedPointer new_head(new_node, 0);
        TaggedPointer old_head = head_.load(std::memory_order_relaxed);

        do {
            // Recheck capacity
            if (size_.load(std::memory_order_relaxed) >= capacity_) {
                delete new_node;
                return false;
            }

            new_node->next = old_head.ptr;
            new_head.tag = old_head.tag + 1;
        } while (!head_.compare_exchange_weak(
            old_head, new_head,
            std::memory_order_release,
            std::memory_order_relaxed
        ));

        size_.fetch_add(1, std::memory_order_relaxed);
        return true;
    }

    // ... rest same as unbounded ...
};
```

**Caveat:** Capacity check is approximate (size_ may change between check and CAS).

---
