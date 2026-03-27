## TOPIC: Lock-Free Ring Buffer - SPSC Atomic Queue

### PRACTICE_TASKS: Output Prediction and Code Analysis

#### Q1
```cpp
template<typename T, size_t Size>
class RingBuffer {
    T buffer_[Size];
    size_t head_ = 0;
    size_t tail_ = 0;  // Bug: not atomic!

public:
    bool push(const T& item) {
        size_t current_tail = tail_;
        size_t next_tail = (current_tail + 1) % Size;

        if (next_tail == head_) {
            return false;  // Full
        }

        buffer_[current_tail] = item;
        tail_ = next_tail;  // Bug: not atomic update!
        return true;
    }

    bool pop(T& item) {
        if (head_ == tail_) {
            return false;  // Empty
        }

        item = buffer_[head_];
        head_ = (head_ + 1) % Size;
        return true;
    }
};
```

**Answer:**
```
Data race (undefined behavior in concurrent access)
```

**Explanation:**
- `head_` and `tail_` not atomic → data races
- Producer reads `head_`, consumer modifies `head_` → race
- Consumer reads `tail_`, producer modifies `tail_` → race
- Compiler may reorder `buffer_[current_tail] = item` after `tail_ = next_tail`
- Consumer may see updated `tail_` but unwritten data
- Need `std::atomic` with proper memory ordering
- **Key Concept:** Lock-free data structures require atomic variables with memory ordering; plain variables subject to data races and reordering; must use std::atomic with acquire-release semantics

**Fixed Version:**
```cpp
template<typename T, size_t Size>
class RingBuffer {
    T buffer_[Size];
    std::atomic<size_t> head_{0};
    std::atomic<size_t> tail_{0};

public:
    bool push(const T& item) {
        size_t current_tail = tail_.load(std::memory_order_relaxed);
        size_t next_tail = (current_tail + 1) % Size;

        if (next_tail == head_.load(std::memory_order_acquire)) {
            return false;
        }

        buffer_[current_tail] = item;
        tail_.store(next_tail, std::memory_order_release);
        return true;
    }

    bool pop(T& item) {
        size_t current_head = head_.load(std::memory_order_relaxed);

        if (current_head == tail_.load(std::memory_order_acquire)) {
            return false;
        }

        item = buffer_[current_head];
        head_.store((current_head + 1) % Size, std::memory_order_release);
        return true;
    }
};
```

---

#### Q2
```cpp
template<typename T, size_t Size>
class RingBuffer {
    T buffer_[Size];
    std::atomic<size_t> head_{0};
    std::atomic<size_t> tail_{0};

public:
    bool push(const T& item) {
        size_t current_tail = tail_.load(std::memory_order_relaxed);
        size_t next_tail = (current_tail + 1) % Size;

        if (next_tail == head_.load(std::memory_order_relaxed)) {  // Bug: relaxed!
            return false;
        }

        buffer_[current_tail] = item;
        tail_.store(next_tail, std::memory_order_release);
        return true;
    }
};
```

**Answer:**
```
ABA problem or stale read (may incorrectly detect full when slot actually available)
```

**Explanation:**
- `head_.load(std::memory_order_relaxed)` may read stale value
- Consumer incremented `head_` but producer doesn't see it
- Producer thinks buffer full when actually has space
- Need acquire semantics to see consumer's writes
- Relaxed ordering has no synchronization
- **Key Concept:** Lock-free full/empty checks need acquire semantics to synchronize with other thread's releases; relaxed reads may see stale values causing false full/empty detection

**Fixed Version:**
```cpp
if (next_tail == head_.load(std::memory_order_acquire)) {  // Acquire!
    return false;
}
```

---

#### Q3
```cpp
template<typename T, size_t Size>
class RingBuffer {
    std::unique_ptr<T> buffer_[Size];  // Bug: array of unique_ptr!
    std::atomic<size_t> head_{0};
    std::atomic<size_t> tail_{0};

public:
    bool push(T item) {
        size_t current_tail = tail_.load(std::memory_order_relaxed);
        size_t next_tail = (current_tail + 1) % Size;

        if (next_tail == head_.load(std::memory_order_acquire)) {
            return false;
        }

        buffer_[current_tail] = std::make_unique<T>(std::move(item));  // Bug: allocation in push!
        tail_.store(next_tail, std::memory_order_release);
        return true;
    }
};
```

**Answer:**
```
Heap allocation in lock-free path (defeats lock-free performance, possible memory allocation failure)
```

**Explanation:**
- `std::make_unique` allocates memory from heap
- Heap allocation not lock-free (may acquire locks internally)
- Defeats purpose of lock-free queue
- Allocation can fail or block
- Lock-free data structures should avoid dynamic allocation in hot path
- Store `T` directly in buffer, not `unique_ptr<T>`
- **Key Concept:** Lock-free data structures must avoid heap allocation in critical path; memory allocation may lock or fail; store values directly in pre-allocated buffer for true lock-free operation

**Fixed Version:**
```cpp
template<typename T, size_t Size>
class RingBuffer {
    T buffer_[Size];  // Direct storage, no unique_ptr
    std::atomic<size_t> head_{0};
    std::atomic<size_t> tail_{0};

    // ... rest of implementation
};
```

---

#### Q4
```cpp
template<typename T, size_t Size>
class RingBuffer {
    T buffer_[Size];
    std::atomic<size_t> head_{0};
    std::atomic<size_t> tail_{0};

public:
    size_t size() const {
        size_t h = head_.load(std::memory_order_relaxed);
        size_t t = tail_.load(std::memory_order_relaxed);
        return (t >= h) ? (t - h) : (Size - h + t);  // Bug: h and t from different times!
    }
};
```

**Answer:**
```
Inconsistent snapshot (size may be inaccurate or negative due to concurrent modifications)
```

**Explanation:**
- `head_` and `tail_` read separately, not atomically
- Between reads, other threads may modify them
- E.g., read `h=5`, then thread modifies both, read `t=3` → negative size!
- Size calculation sees inconsistent state
- Lock-free queues can't provide exact size without synchronization
- Approximate size acceptable, or use separate atomic counter
- **Key Concept:** Reading multiple atomic variables doesn't create atomic snapshot; concurrent modifications between reads cause inconsistent view; lock-free size() inherently imprecise

**Fixed Version:**
```cpp
// Option 1: Accept imprecision (document behavior)
size_t size_approx() const {  // Rename to indicate approximation
    size_t h = head_.load(std::memory_order_relaxed);
    size_t t = tail_.load(std::memory_order_relaxed);
    return (t >= h) ? (t - h) : (Size - h + t);
}

// Option 2: Separate atomic counter (more expensive)
std::atomic<size_t> count_{0};

bool push(const T& item) {
    // ... after successful push:
    count_.fetch_add(1, std::memory_order_relaxed);
}

bool pop(T& item) {
    // ... after successful pop:
    count_.fetch_sub(1, std::memory_order_relaxed);
}

size_t size() const {
    return count_.load(std::memory_order_relaxed);
}
```

---

#### Q5
```cpp
template<typename T, size_t Size>
class RingBuffer {
    T buffer_[Size];
    std::atomic<size_t> head_{0};
    std::atomic<size_t> tail_{0};

public:
    bool push(const T& item) {
        size_t current_tail = tail_.load(std::memory_order_relaxed);
        size_t next_tail = (current_tail + 1) % Size;  // Bug: modulo expensive!

        if (next_tail == head_.load(std::memory_order_acquire)) {
            return false;
        }

        buffer_[current_tail] = item;
        tail_.store(next_tail, std::memory_order_release);
        return true;
    }
};
```

**Answer:**
```
Performance issue (modulo operation expensive, especially on non-power-of-2 sizes)
```

**Explanation:**
- Modulo `%` on arbitrary values requires division (slow instruction)
- Called on every push/pop → significant overhead
- If `Size` is power of 2, can use bitwise AND: `(current_tail + 1) & (Size - 1)`
- Much faster (single cycle vs ~20+ cycles)
- Or use conditional branch for wrap-around
- **Key Concept:** Modulo expensive in hot loops; for power-of-2 sizes use bitwise AND; for arbitrary sizes use conditional branch or document power-of-2 requirement

**Fixed Version:**
```cpp
// Option 1: Require power-of-2 size (enforce with static_assert)
static_assert((Size & (Size - 1)) == 0, "Size must be power of 2");

bool push(const T& item) {
    size_t current_tail = tail_.load(std::memory_order_relaxed);
    size_t next_tail = (current_tail + 1) & (Size - 1);  // Fast bitwise AND
    // ...
}

// Option 2: Conditional branch (works for any size)
bool push(const T& item) {
    size_t current_tail = tail_.load(std::memory_order_relaxed);
    size_t next_tail = current_tail + 1;
    if (next_tail >= Size) next_tail = 0;  // Branch, but still faster than modulo
    // ...
}
```

---

#### Q6
```cpp
template<typename T, size_t Size>
class RingBuffer {
    alignas(64) T buffer_[Size];
    alignas(64) std::atomic<size_t> head_{0};
    alignas(64) std::atomic<size_t> tail_{0};  // Bug: tail_ on separate cache line from buffer_!
};
```

**Answer:**
```
False sharing (head_ and tail_ on separate cache lines causes cache thrashing)
```

**Explanation:**
- `alignas(64)` puts each variable on separate cache line
- Producer writes `tail_` (on cache line 2)
- Consumer writes `head_` (on cache line 1)
- Each write invalidates the other's cache line
- Constant cache coherency traffic (ping-pong)
- This IS false sharing - separate variables on separate lines still share cache line effects
- Should place frequently-written-by-same-thread variables together
- **Key Concept:** Cache lines (64 bytes) are unit of coherency; false sharing occurs when different threads write to different variables on same cache line OR when cache line ping-pongs between cores; pad to isolate producer/consumer state

**Fixed Version:**
```cpp
template<typename T, size_t Size>
class RingBuffer {
    alignas(64) std::atomic<size_t> head_{0};  // Producer writes
    char padding1_[64 - sizeof(std::atomic<size_t>)];

    alignas(64) std::atomic<size_t> tail_{0};  // Consumer writes
    char padding2_[64 - sizeof(std::atomic<size_t>)];

    alignas(64) T buffer_[Size];  // Shared read-write
};
```

---

#### Q7
```cpp
template<typename T, size_t Size>
class RingBuffer {
    T buffer_[Size];
    std::atomic<size_t> head_{0};
    std::atomic<size_t> tail_{0};

public:
    bool pop(T& item) {
        size_t current_head = head_.load(std::memory_order_relaxed);

        if (current_head == tail_.load(std::memory_order_acquire)) {
            return false;  // Empty
        }

        item = buffer_[current_head];  // Bug: what if T has throwing copy constructor?
        head_.store((current_head + 1) % Size, std::memory_order_release);
        return true;
    }
};
```

**Answer:**
```
Lost data (exception during copy leaves item in buffer but head_ not updated)
```

**Explanation:**
- `item = buffer_[current_head]` may throw exception
- If throws, `head_.store()` never executes
- Item remains in buffer but consumer thinks it's popped
- Next pop() returns same item again
- Original item effectively lost
- Need exception safety: either commit update before copy or rollback
- **Key Concept:** Lock-free operations with potentially-throwing operations need exception safety; throwing during critical section leaves data structure in inconsistent state; prefer move semantics or noexcept operations

**Fixed Version:**
```cpp
// Option 1: Require trivially copyable T
static_assert(std::is_trivially_copyable_v<T>, "T must be trivially copyable");

// Option 2: Use move semantics (noexcept move)
bool pop(T& item) {
    size_t current_head = head_.load(std::memory_order_relaxed);

    if (current_head == tail_.load(std::memory_order_acquire)) {
        return false;
    }

    item = std::move(buffer_[current_head]);  // Move instead of copy
    head_.store((current_head + 1) % Size, std::memory_order_release);
    return true;
}

// Require noexcept move
static_assert(std::is_nothrow_move_assignable_v<T>, "T must have noexcept move");
```

---

#### Q8
```cpp
template<typename T, size_t Size>
class RingBuffer {
    T buffer_[Size];
    std::atomic<size_t> head_{0};
    std::atomic<size_t> tail_{0};
    std::atomic<bool> full_{false};  // Bug: added full flag!

public:
    bool push(const T& item) {
        if (full_.load(std::memory_order_acquire)) {
            return false;
        }

        size_t current_tail = tail_.load(std::memory_order_relaxed);
        buffer_[current_tail] = item;

        size_t next_tail = (current_tail + 1) % Size;
        tail_.store(next_tail, std::memory_order_release);

        if (next_tail == head_.load(std::memory_order_acquire)) {
            full_.store(true, std::memory_order_release);
        }
        return true;
    }
};
```

**Answer:**
```
Race condition on full flag (producer and consumer may disagree on full state)
```

**Explanation:**
- Producer checks `full_`, consumer may be popping simultaneously
- Consumer pops item → buffer not full anymore
- But producer already saw `full_=true` → rejects push
- Or: producer sets `full_=true` after consumer already checked and found space
- `full_` flag adds synchronization point without benefit
- Original design (comparing `head_` and `tail_`) sufficient and correct
- **Key Concept:** Adding redundant state to lock-free structures introduces race conditions; derived state (like full flag) must be kept consistent with primary state (head/tail); prefer computing state from primary variables

**Fixed Version:**
```cpp
// Remove full_ flag entirely, use original design
template<typename T, size_t Size>
class RingBuffer {
    T buffer_[Size];
    std::atomic<size_t> head_{0};
    std::atomic<size_t> tail_{0};

public:
    bool push(const T& item) {
        size_t current_tail = tail_.load(std::memory_order_relaxed);
        size_t next_tail = (current_tail + 1) % Size;

        if (next_tail == head_.load(std::memory_order_acquire)) {
            return false;  // Full - derived from head and tail
        }

        buffer_[current_tail] = item;
        tail_.store(next_tail, std::memory_order_release);
        return true;
    }
};
```

---

#### Q9
```cpp
template<typename T, size_t Size = 1024>
class RingBuffer {
    T buffer_[Size];  // Bug: T may not be trivial!
    std::atomic<size_t> head_{0};
    std::atomic<size_t> tail_{0};

public:
    bool push(const T& item) {
        // ... push logic ...
        buffer_[current_tail] = item;
        // ...
    }
};

struct ComplexType {
    std::string data;
    ~ComplexType() { /* destructor */ }
};

int main() {
    RingBuffer<ComplexType> ring;  // Bug: buffer_ never calls destructors!

    ring.push(ComplexType{"data"});
    ring.push(ComplexType{"more"});

    // Elements never popped, destructors never called - memory leak!
}
```

**Answer:**
```
Memory leak (non-trivial destructors never called for unconsumed elements)
```

**Explanation:**
- `buffer_` is array of `T`, constructed with default constructor
- Push assigns to elements (copy/move assignment)
- If elements never popped, destructors never called
- `ComplexType` has `std::string` → internal buffer leaked
- Need manual lifetime management (placement new/explicit destructor calls)
- Or require trivially destructible types
- **Key Concept:** Arrays in lock-free structures with non-trivial types need explicit lifetime management; unconsumed elements never destroyed; use placement new or require trivial types for lock-free queues

**Fixed Version:**
```cpp
// Option 1: Require trivially destructible
template<typename T, size_t Size>
class RingBuffer {
    static_assert(std::is_trivially_destructible_v<T>, "T must be trivially destructible");

    T buffer_[Size];
    // ...
};

// Option 2: Manual lifetime management (more complex)
template<typename T, size_t Size>
class RingBuffer {
    alignas(T) char buffer_[Size * sizeof(T)];  // Raw storage
    std::atomic<size_t> head_{0};
    std::atomic<size_t> tail_{0};

public:
    bool push(const T& item) {
        // ... check full ...

        T* slot = reinterpret_cast<T*>(&buffer_[current_tail * sizeof(T)]);
        new (slot) T(item);  // Placement new

        // ...
    }

    bool pop(T& item) {
        // ... check empty ...

        T* slot = reinterpret_cast<T*>(&buffer_[current_head * sizeof(T)]);
        item = std::move(*slot);
        slot->~T();  // Explicit destructor

        // ...
    }
};
```

---

#### Q10
```cpp
template<typename T, size_t Size>
class RingBuffer {
    T buffer_[Size];
    std::atomic<size_t> head_{0};
    std::atomic<size_t> tail_{0};

public:
    void clear() {  // Bug: not thread-safe!
        head_.store(0, std::memory_order_relaxed);
        tail_.store(0, std::memory_order_relaxed);
    }
};

// Multiple producers/consumers
void producer() {
    RingBuffer<int, 100> ring;
    ring.push(42);
    ring.clear();  // Bug: while consumer might be popping!
}
```

**Answer:**
```
Data race (clear() called concurrently with push/pop causes undefined behavior)
```

**Explanation:**
- `clear()` resets `head_` and `tail_` to 0
- If consumer currently in `pop()` reading `buffer_[current_head]`
- Producer calls `clear()`, then `push()` overwrites `buffer_[0]`
- Consumer may read partially-written data
- Lock-free queues don't support concurrent clear()
- Need external synchronization or prohibit clear() on active queue
- **Key Concept:** Lock-free data structures support specific concurrent operations (push/pop); operations like clear() that reset state not safe concurrently; document and enforce single-threaded access for administrative operations

**Fixed Version:**
```cpp
// Option 1: Document clear() as unsafe during concurrent access
// clear() - NOT thread-safe! Ensure no concurrent push/pop operations
void clear() {
    head_.store(0, std::memory_order_relaxed);
    tail_.store(0, std::memory_order_relaxed);
}

// Option 2: Drain queue instead of clearing
void drain() {
    T dummy;
    while (pop(dummy)) {
        // Discard elements
    }
}

// Option 3: Use epoch-based reclamation (advanced, complex)
```

---
