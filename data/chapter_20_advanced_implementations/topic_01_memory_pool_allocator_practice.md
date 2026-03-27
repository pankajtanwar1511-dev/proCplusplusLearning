## TOPIC: Fixed-Size Memory Pool Allocator - High-Performance Memory Management

### PRACTICE_TASKS: Output Prediction and Code Analysis

#### Q1
```cpp
#include <iostream>

template<typename T>
class MemoryPool {
    char* memory_;
    T* free_list_;
    size_t capacity_;

public:
    MemoryPool(size_t size) : capacity_(size) {
        memory_ = new char[sizeof(T) * size];
        free_list_ = nullptr;

        // Bug: not initializing free list!
    }

    T* allocate() {
        if (!free_list_) {
            throw std::bad_alloc();
        }

        T* result = free_list_;
        free_list_ = *reinterpret_cast<T**>(free_list_);
        return result;
    }

    ~MemoryPool() {
        delete[] memory_;
    }
};

int main() {
    MemoryPool<int> pool(5);
    int* ptr = pool.allocate();  // Bug: what happens?
}
```

**Answer:**
```
Exception: std::bad_alloc thrown immediately
```

**Explanation:**
- Constructor allocates raw memory but doesn't initialize `free_list_`
- `free_list_` remains `nullptr`
- `allocate()` checks `if (!free_list_)` → true immediately
- Throws `std::bad_alloc` even though memory allocated
- Free list must be constructed by linking blocks in constructor
- **Key Concept:** Memory pool requires explicit free list initialization; raw memory allocation alone doesn't create usable blocks; must link each block to next in constructor

**Fixed Version:**
```cpp
MemoryPool(size_t size) : capacity_(size) {
    memory_ = new char[sizeof(T) * size];

    // Initialize free list by linking blocks
    free_list_ = reinterpret_cast<T*>(memory_);

    T* current = free_list_;
    for (size_t i = 0; i < size - 1; i++) {
        T* next = reinterpret_cast<T*>(memory_ + sizeof(T) * (i + 1));
        *reinterpret_cast<T**>(current) = next;
        current = next;
    }
    *reinterpret_cast<T**>(current) = nullptr;  // Last block points to null
}
```

---

#### Q2
```cpp
template<typename T>
class MemoryPool {
    char* memory_;
    T* free_list_;

public:
    T* allocate() {
        if (!free_list_) throw std::bad_alloc();

        T* result = free_list_;
        free_list_ = *reinterpret_cast<T**>(free_list_);
        return result;  // Bug: returns unconstructed memory!
    }

    void deallocate(T* ptr) {
        *reinterpret_cast<T**>(ptr) = free_list_;
        free_list_ = ptr;
    }
};

int main() {
    MemoryPool<std::string> pool(10);

    std::string* s = pool.allocate();
    std::cout << s->length() << "\n";  // Bug: uninitialized string!
}
```

**Answer:**
```
Undefined behavior (likely crash or garbage value)
```

**Explanation:**
- `allocate()` returns raw memory from pool
- No constructor called on `std::string` object
- Dereferencing `s` accesses uninitialized memory → undefined behavior
- `std::string` internal pointers garbage → crash on `length()`
- Must use placement new to construct object after allocation
- **Key Concept:** Memory pools return raw memory; must explicitly construct objects with placement new; separates allocation from construction

**Fixed Version:**
```cpp
std::string* s = pool.allocate();
new (s) std::string();  // Placement new to construct

std::cout << s->length() << "\n";  // Now safe: 0

// When done:
s->~string();  // Explicit destructor call
pool.deallocate(s);
```

---

#### Q3
```cpp
template<typename T>
class MemoryPool {
    char* memory_;
    T* free_list_;
    size_t capacity_;

public:
    void deallocate(T* ptr) {
        // Bug: no bounds checking!
        *reinterpret_cast<T**>(ptr) = free_list_;
        free_list_ = ptr;
    }
};

int main() {
    MemoryPool<int> pool(10);

    int* external = new int(42);

    int* a = pool.allocate();
    pool.deallocate(a);      // OK
    pool.deallocate(external);  // Bug: deallocating external pointer!

    delete external;
}
```

**Answer:**
```
Undefined behavior (heap corruption, double-free, or crash)
```

**Explanation:**
- `external` allocated from heap, not from pool
- `deallocate(external)` adds heap pointer to pool's free list
- Free list now contains pointer outside pool's memory range
- Next `allocate()` may return heap pointer
- When pool destructs → deletes its memory, but `external` still points to heap
- `delete external` → double-free if pool's destructor already freed it
- **Key Concept:** Memory pools must validate pointers belong to pool before deallocation; unchecked deallocate() allows heap corruption

**Fixed Version:**
```cpp
void deallocate(T* ptr) {
    // Bounds check
    char* ptr_as_char = reinterpret_cast<char*>(ptr);
    if (ptr_as_char < memory_ || ptr_as_char >= memory_ + sizeof(T) * capacity_) {
        throw std::invalid_argument("Pointer not from this pool");
    }

    *reinterpret_cast<T**>(ptr) = free_list_;
    free_list_ = ptr;
}
```

---

#### Q4
```cpp
template<typename T>
class MemoryPool {
    char* memory_;
    T* free_list_;

public:
    ~MemoryPool() {
        delete[] memory_;  // Bug: doesn't destroy constructed objects!
    }
};

int main() {
    {
        MemoryPool<std::string> pool(10);

        std::string* s1 = pool.allocate();
        new (s1) std::string("Hello");

        std::string* s2 = pool.allocate();
        new (s2) std::string("World");

        // Only destroy s1
        s1->~string();
        pool.deallocate(s1);

        // Forgot to destroy s2!
    }  // Pool destructor runs
}
```

**Answer:**
```
Memory leak (s2's internal buffer leaked)
```

**Explanation:**
- `s1` properly destroyed → string destructor frees internal buffer
- `s2` never destroyed → string destructor never called
- Pool destructor `delete[] memory_` frees pool's memory
- But `s2`'s internal heap-allocated buffer never freed → leaked
- Pool doesn't track which objects are alive
- User must manually destroy all constructed objects before pool destruction
- **Key Concept:** Memory pools don't track object lifetimes; user must call destructors before pool destruction; pool destructor only frees raw memory, not object resources

**Better Design:**
```cpp
template<typename T>
class MemoryPool {
    std::set<T*> allocated_;  // Track allocated objects

    ~MemoryPool() {
        // Destroy any remaining constructed objects
        for (T* ptr : allocated_) {
            ptr->~T();
        }
        delete[] memory_;
    }
};
```

---

#### Q5
```cpp
template<typename T>
class MemoryPool {
    char* memory_;
    T* free_list_;

public:
    void deallocate(T* ptr) {
        *reinterpret_cast<T**>(ptr) = free_list_;
        free_list_ = ptr;  // Bug: no double-free detection!
    }
};

int main() {
    MemoryPool<int> pool(10);

    int* ptr = pool.allocate();
    pool.deallocate(ptr);  // Free once
    pool.deallocate(ptr);  // Bug: double-free!

    int* a = pool.allocate();
    int* b = pool.allocate();  // a == b (both get same pointer)!
}
```

**Answer:**
```
Undefined behavior (double-free creates cycle in free list, same pointer allocated twice)
```

**Explanation:**
- First `deallocate(ptr)` adds `ptr` to free list
- Second `deallocate(ptr)` adds `ptr` AGAIN → free list has duplicate
- Free list now contains cycle or duplicate entry
- `allocate()` may return same pointer multiple times
- Multiple allocations get same memory address → data corruption
- **Key Concept:** Memory pools vulnerable to double-free; creates cycles in free list causing same block allocated multiple times

**Fixed Version:**
```cpp
#include <set>

std::set<T*> free_set_;  // Track free blocks

void deallocate(T* ptr) {
    if (free_set_.count(ptr)) {
        throw std::logic_error("Double-free detected");
    }

    free_set_.insert(ptr);
    *reinterpret_cast<T**>(ptr) = free_list_;
    free_list_ = ptr;
}

T* allocate() {
    if (!free_list_) throw std::bad_alloc();

    T* result = free_list_;
    free_list_ = *reinterpret_cast<T**>(free_list_);
    free_set_.erase(result);  // Remove from free set
    return result;
}
```

---

#### Q6
```cpp
template<typename T>
class MemoryPool {
    char* memory_;
    T* free_list_;

public:
    MemoryPool(size_t size) {
        memory_ = new char[sizeof(T) * size];  // Bug: no alignment!

        free_list_ = reinterpret_cast<T*>(memory_);
        // ... initialize free list
    }
};

struct alignas(64) CacheLine {  // Requires 64-byte alignment
    char data[64];
};

int main() {
    MemoryPool<CacheLine> pool(10);
    CacheLine* ptr = pool.allocate();  // Bug: may be misaligned!
    // Accessing misaligned ptr causes crash or performance degradation
}
```

**Answer:**
```
Undefined behavior (misaligned access, possible crash or performance degradation)
```

**Explanation:**
- `new char[]` only guarantees alignment for `char` (1-byte alignment)
- `CacheLine` requires 64-byte alignment
- Casting `char*` to `CacheLine*` creates misaligned pointer
- Accessing misaligned data → crash on some platforms, performance penalty on others
- Must use `std::aligned_alloc` or `new` with alignment
- **Key Concept:** Memory pools must respect alignment requirements; new char[] insufficient for over-aligned types; use aligned_alloc or allocator with alignment

**Fixed Version:**
```cpp
MemoryPool(size_t size) {
    size_t alignment = alignof(T);
    size_t total_size = sizeof(T) * size;

    memory_ = static_cast<char*>(std::aligned_alloc(alignment, total_size));
    if (!memory_) throw std::bad_alloc();

    // ... initialize free list
}

~MemoryPool() {
    std::free(memory_);  // Use free() for aligned_alloc()
}
```

---

#### Q7
```cpp
#include <mutex>
#include <thread>

template<typename T>
class ThreadSafePool {
    MemoryPool<T> pool_;
    std::mutex mutex_;

public:
    T* allocate() {
        std::lock_guard<std::mutex> lock(mutex_);
        return pool_.allocate();
    }

    void deallocate(T* ptr) {
        std::lock_guard<std::mutex> lock(mutex_);
        pool_.deallocate(ptr);
    }
};

void worker(ThreadSafePool<int>& pool) {
    for (int i = 0; i < 1000000; i++) {
        int* ptr = pool.allocate();
        // ... use ptr ...
        pool.deallocate(ptr);
    }
}

int main() {
    ThreadSafePool<int> pool(100);  // Only 100 slots

    std::vector<std::thread> threads;
    for (int i = 0; i < 4; i++) {
        threads.emplace_back(worker, std::ref(pool));
    }

    for (auto& t : threads) t.join();
}
```

**Answer:**
```
Severe lock contention - performance degradation (threads serialize)
```

**Explanation:**
- Global mutex serializes all allocations/deallocations
- 4 threads, each doing 1M allocations → 4M lock acquisitions
- Threads wait for each other even though pool has capacity
- Lock held during allocation → completely serializes threads
- Defeats parallelism benefits of multithreading
- **Key Concept:** Global lock on memory pool creates severe contention; threads serialize at allocate/deallocate; use thread-local pools or lock-free techniques

**Better Approaches:**
```cpp
// 1. Thread-local pools (best for many allocations)
thread_local MemoryPool<int> local_pool(100);

// 2. Lock-free pool with atomic operations
std::atomic<T*> free_list_;

// 3. Hazard pointers for safe lock-free deallocation
```

---

#### Q8
```cpp
template<typename T>
class MemoryPool {
    char* memory_;
    T* free_list_;
    size_t capacity_;
    size_t allocated_count_;  // Track allocations

public:
    MemoryPool(size_t size) : capacity_(size), allocated_count_(0) {
        memory_ = new char[sizeof(T) * size];
        // ... initialize free list
    }

    T* allocate() {
        if (!free_list_) throw std::bad_alloc();

        T* result = free_list_;
        free_list_ = *reinterpret_cast<T**>(free_list_);
        allocated_count_++;  // Bug: in multi-threaded environment!
        return result;
    }

    void deallocate(T* ptr) {
        *reinterpret_cast<T**>(ptr) = free_list_;
        free_list_ = ptr;
        allocated_count_--;  // Bug: race condition!
    }
};
```

**Answer:**
```
Data race on allocated_count_ (undefined behavior in multithreaded use)
```

**Explanation:**
- `allocated_count_++` and `--` are not atomic operations
- Multiple threads can read-modify-write simultaneously
- Race condition: increments/decrements can be lost
- Example: Thread 1 reads 5, Thread 2 reads 5, both write 6 → should be 7
- `allocated_count_` becomes inaccurate
- **Key Concept:** Non-atomic counters in multithreaded pools cause race conditions; use std::atomic for counters or protect with mutex

**Fixed Version:**
```cpp
std::atomic<size_t> allocated_count_{0};

T* allocate() {
    if (!free_list_) throw std::bad_alloc();

    T* result = free_list_;
    free_list_ = *reinterpret_cast<T**>(free_list_);
    allocated_count_.fetch_add(1, std::memory_order_relaxed);
    return result;
}
```

---

#### Q9
```cpp
template<typename T>
class MemoryPool {
    char* memory_;
    T* free_list_;

public:
    MemoryPool(const MemoryPool&) = delete;
    MemoryPool& operator=(const MemoryPool&) = delete;

    // Bug: no move constructor!

    ~MemoryPool() {
        delete[] memory_;
    }
};

MemoryPool<int> create_pool() {
    return MemoryPool<int>(100);  // Return by value
}

int main() {
    MemoryPool<int> pool = create_pool();  // Bug: move required but missing!
}
```

**Answer:**
```
Compilation error (implicitly deleted move constructor) or double-delete
```

**Explanation:**
- Copy constructor deleted → prevents copying
- No move constructor defined → compiler attempts implicit move
- Implicit move performs memberwise move (shallow copy)
- `memory_` pointer copied → both objects point to same memory
- First object destructs → `delete[] memory_`
- Second object destructs → `delete[] memory_` AGAIN on freed memory → double-delete
- **Key Concept:** Deleting copy constructor doesn't prevent moves; must explicitly define move semantics or delete move operations for RAII types

**Fixed Version:**
```cpp
MemoryPool(MemoryPool&& other) noexcept
    : memory_(other.memory_), free_list_(other.free_list_) {
    other.memory_ = nullptr;
    other.free_list_ = nullptr;
}

MemoryPool& operator=(MemoryPool&& other) noexcept {
    if (this != &other) {
        delete[] memory_;

        memory_ = other.memory_;
        free_list_ = other.free_list_;

        other.memory_ = nullptr;
        other.free_list_ = nullptr;
    }
    return *this;
}

~MemoryPool() {
    if (memory_) {  // Check before delete
        delete[] memory_;
    }
}
```

---

#### Q10
```cpp
template<typename T>
class MemoryPool {
    char* memory_;
    T* free_list_;

public:
    template<typename... Args>
    T* construct(Args&&... args) {
        T* ptr = allocate();
        new (ptr) T(std::forward<Args>(args)...);  // Placement new
        return ptr;
    }

    void destroy(T* ptr) {
        ptr->~T();  // Explicit destructor
        deallocate(ptr);
    }
};

int main() {
    MemoryPool<std::string> pool(10);

    std::string* s = pool.construct("Hello");

    try {
        std::string* s2 = pool.construct(1000000000, 'x');  // Bug: throws in constructor!
    } catch (...) {
        // Exception caught
    }

    pool.destroy(s);
}
```

**Answer:**
```
Memory leak (allocation successful but construction threw, pointer not returned)
```

**Explanation:**
- `allocate()` succeeds → removes block from free list
- Placement new throws `std::bad_alloc` (string too large)
- Exception propagates, `ptr` lost
- Block removed from free list but never returned
- Pool thinks block allocated, but no pointer to deallocate it
- Memory leaked until pool destroyed
- **Key Concept:** Exceptions during placement new after allocation cause memory leaks; must deallocate on construction failure

**Fixed Version:**
```cpp
template<typename... Args>
T* construct(Args&&... args) {
    T* ptr = allocate();

    try {
        new (ptr) T(std::forward<Args>(args)...);
        return ptr;
    } catch (...) {
        deallocate(ptr);  // Return to pool on construction failure
        throw;
    }
}
```

---
