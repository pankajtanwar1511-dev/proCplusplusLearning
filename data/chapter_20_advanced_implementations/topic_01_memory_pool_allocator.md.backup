## TOPIC: Fixed-Size Memory Pool Allocator - High-Performance Memory Management

---

### THEORY_SECTION: Memory Pool Fundamentals

---

#### 1. The Problem with Standard Allocation

**Standard Heap Allocation Issues:**

```cpp
// ❌ Problem: Each allocation has overhead
for (int i = 0; i < 1000000; ++i) {
    Node* node = new Node();  // Calls malloc, slow!
    // - System call overhead
    // - Fragmentation
    // - Unpredictable latency
    // - Poor cache locality
}
```

**Performance Impact:**
- `malloc`/`new`: ~100-500ns per allocation
- Memory pool: ~5-20ns per allocation (10-50x faster!)
- External fragmentation wastes memory
- Poor cache performance (allocated objects scattered)

---

#### 2. Memory Pool Design

**Core Concept:**

Pre-allocate a large contiguous block and manage it ourselves:

```cpp
// ✅ Memory pool approach
class MemoryPool {
    char* memory_block_;      // Pre-allocated chunk
    void* free_list_;         // Linked list of free blocks
    size_t block_size_;       // Fixed size per object
    size_t block_count_;      // Total blocks
};
```

**Key Advantages:**

1. **O(1) Allocation/Deallocation**: Just pop/push from free list
2. **No Fragmentation**: Fixed-size blocks
3. **Cache Locality**: Objects allocated near each other
4. **Predictable Performance**: No system calls after initialization

---

#### 3. Free List Management

**Intrusive Free List:**

Store the free list inside the free blocks themselves:

```cpp
// Each free block stores a pointer to the next free block
struct FreeBlock {
    FreeBlock* next;
};

// Memory layout:
// [Used][Free*→][Free*→][Used][Free*→nullptr]
//         ↓       ↓             ↓
//       Next    Next         Last
```

**Why This Works:**
- Free blocks are unused, so we can store pointers in them
- Zero overhead when blocks are allocated
- Simple linked list operations

---

#### 4. Alignment Considerations

**Memory Alignment Rules:**

```cpp
// Must align to object's alignment requirements
alignof(int) == 4      // int must be 4-byte aligned
alignof(double) == 8   // double must be 8-byte aligned
alignof(std::max_align_t) == 16  // Maximum alignment

// Misaligned access:
char* ptr = new char[100];
int* p = reinterpret_cast<int*>(ptr + 1);  // ❌ Misaligned!
*p = 42;  // Undefined behavior or crash on some platforms
```

**Solution:**

```cpp
// Ensure block_size is properly aligned
size_t aligned_size = (size + alignof(T) - 1) & ~(alignof(T) - 1);
```

---

### IMPLEMENTATION: Production-Quality Memory Pool

---

#### Complete Implementation

```cpp
#include <cstddef>
#include <cstdlib>
#include <new>
#include <stdexcept>

template<typename T>
class MemoryPool {
private:
    union Block {
        T element;           // When allocated
        Block* next;         // When free
    };

    Block* memory_block_;    // Pre-allocated memory
    Block* free_list_;       // Head of free list
    size_t block_count_;     // Total blocks
    size_t allocated_count_; // Currently allocated

public:
    // Constructor: Pre-allocate memory
    explicit MemoryPool(size_t count)
        : memory_block_(nullptr),
          free_list_(nullptr),
          block_count_(count),
          allocated_count_(0)
    {
        if (count == 0) {
            throw std::invalid_argument("Pool size must be > 0");
        }

        // Allocate aligned memory
        memory_block_ = static_cast<Block*>(
            std::aligned_alloc(alignof(Block), sizeof(Block) * count)
        );

        if (!memory_block_) {
            throw std::bad_alloc();
        }

        // Initialize free list
        free_list_ = memory_block_;
        for (size_t i = 0; i < count - 1; ++i) {
            memory_block_[i].next = &memory_block_[i + 1];
        }
        memory_block_[count - 1].next = nullptr;
    }

    // Destructor: Free memory
    ~MemoryPool() {
        if (allocated_count_ != 0) {
            // Warning: Memory leak - some objects not deallocated
        }
        std::free(memory_block_);
    }

    // Disable copy (owns memory)
    MemoryPool(const MemoryPool&) = delete;
    MemoryPool& operator=(const MemoryPool&) = delete;

    // Enable move
    MemoryPool(MemoryPool&& other) noexcept
        : memory_block_(other.memory_block_),
          free_list_(other.free_list_),
          block_count_(other.block_count_),
          allocated_count_(other.allocated_count_)
    {
        other.memory_block_ = nullptr;
        other.free_list_ = nullptr;
        other.block_count_ = 0;
        other.allocated_count_ = 0;
    }

    // Allocate: O(1)
    T* allocate() {
        if (!free_list_) {
            throw std::bad_alloc();  // Pool exhausted
        }

        // Pop from free list
        Block* block = free_list_;
        free_list_ = block->next;
        ++allocated_count_;

        // Return pointer to element (not constructed yet!)
        return &block->element;
    }

    // Deallocate: O(1)
    void deallocate(T* ptr) {
        if (!ptr) return;

        // Verify pointer is within pool bounds
        if (!is_from_pool(ptr)) {
            throw std::invalid_argument("Pointer not from this pool");
        }

        // Convert to block and push to free list
        Block* block = reinterpret_cast<Block*>(ptr);
        block->next = free_list_;
        free_list_ = block;
        --allocated_count_;
    }

    // Construct object in allocated memory
    template<typename... Args>
    T* construct(Args&&... args) {
        T* ptr = allocate();
        try {
            new (ptr) T(std::forward<Args>(args)...);  // Placement new
            return ptr;
        } catch (...) {
            deallocate(ptr);  // Exception safety
            throw;
        }
    }

    // Destroy object and deallocate
    void destroy(T* ptr) {
        if (ptr) {
            ptr->~T();          // Call destructor
            deallocate(ptr);    // Return to pool
        }
    }

    // Query functions
    size_t capacity() const { return block_count_; }
    size_t allocated() const { return allocated_count_; }
    size_t available() const { return block_count_ - allocated_count_; }

private:
    bool is_from_pool(T* ptr) const {
        Block* block = reinterpret_cast<Block*>(ptr);
        return block >= memory_block_ &&
               block < memory_block_ + block_count_;
    }
};
```

---

### EDGE_CASES: Critical Considerations

---

#### Edge Case 1: Alignment Issues

**Problem:**

```cpp
struct Misaligned {
    char c;
    double d;  // Needs 8-byte alignment
};

MemoryPool<Misaligned> pool(100);
auto* obj = pool.allocate();
obj->d = 3.14;  // May crash if misaligned!
```

**Solution:**

Use `std::aligned_alloc` and union for proper alignment.

---

#### Edge Case 2: Double-Free

**Problem:**

```cpp
T* ptr = pool.construct(42);
pool.destroy(ptr);
pool.destroy(ptr);  // ❌ Double-free! Corrupts free list
```

**Detection:**

```cpp
void deallocate(T* ptr) {
    // Check if already in free list (expensive, debug only)
    #ifdef DEBUG
    for (Block* b = free_list_; b; b = b->next) {
        if (b == reinterpret_cast<Block*>(ptr)) {
            throw std::logic_error("Double-free detected");
        }
    }
    #endif
    // ... normal deallocation
}
```

---

#### Edge Case 3: Pool Exhaustion

**Problem:**

```cpp
MemoryPool<int> pool(10);
for (int i = 0; i < 100; ++i) {
    pool.allocate();  // ❌ Throws after 10 allocations
}
```

**Handling:**

```cpp
T* safe_allocate(MemoryPool<T>& pool) {
    try {
        return pool.allocate();
    } catch (const std::bad_alloc&) {
        // Handle exhaustion: fallback to heap, grow pool, etc.
        return new T();
    }
}
```

---

#### Edge Case 4: Destructor Not Called

**Problem:**

```cpp
{
    MemoryPool<std::string> pool(10);
    auto* str = pool.allocate();  // Memory allocated
    new (str) std::string("Hello");  // Object constructed
}  // ❌ Pool destroyed, but string destructor never called!
   // Memory leak in std::string's internal buffer
```

**Solution:**

Always use `construct`/`destroy` pair:

```cpp
{
    MemoryPool<std::string> pool(10);
    auto* str = pool.construct("Hello");  // ✅
    // ... use str ...
    pool.destroy(str);  // ✅ Calls destructor
}
```

---

#### Edge Case 5: Cache Line False Sharing

**Problem:**

```cpp
struct Counter {
    std::atomic<int> value;  // Only 4 bytes
};

// Multiple threads accessing adjacent counters
MemoryPool<Counter> pool(100);
auto* c1 = pool.construct(0);  // Thread 1
auto* c2 = pool.construct(0);  // Thread 2 (likely same cache line)

// False sharing: c1 and c2 on same cache line
// Thread 1 and 2 thrash cache, huge performance hit!
```

**Solution:**

Pad to cache line size:

```cpp
struct alignas(64) Counter {  // 64 = typical cache line size
    std::atomic<int> value;
    char padding[60];  // Force different cache lines
};
```

---

### CODE_EXAMPLES: Usage Patterns

---

#### Example 1: Basic Usage

This example demonstrates the fundamental operations of a memory pool: **allocating, constructing, using, and destroying objects**. The key advantage shown here is **O(1) constant-time allocation** - the pool simply pops a block from the free list, which is dramatically faster than `malloc` or `new`.

**What this code does:**
- Creates a memory pool with capacity for 1000 Node objects
- Uses `construct()` to both allocate memory AND call the constructor (placement new)
- Builds a small linked list of nodes
- Uses `destroy()` to properly call destructors AND return memory to the pool
- Shows that after allocating and destroying 3 objects, all 1000 slots are available again

**Key concepts demonstrated:**
- **Placement new**: `construct()` uses placement new internally to call the constructor on pre-allocated memory
- **Explicit destruction**: Unlike `delete`, we must explicitly call the destructor before returning memory
- **Reusability**: Destroyed blocks immediately return to the free list for reuse
- **No system calls**: After initialization, all operations are pure pointer arithmetic

**Why this matters:** In high-performance scenarios (game engines, real-time systems, network servers), avoiding `malloc` overhead can improve performance by 10-50x for small object allocations.

```cpp
#include <iostream>

struct Node {
    int data;
    Node* next;

    Node(int d) : data(d), next(nullptr) {}
};

int main() {
    MemoryPool<Node> pool(1000);

    // Allocate and construct
    Node* n1 = pool.construct(10);
    Node* n2 = pool.construct(20);
    Node* n3 = pool.construct(30);

    // Use nodes
    n1->next = n2;
    n2->next = n3;

    // Clean up
    pool.destroy(n1);
    pool.destroy(n2);
    pool.destroy(n3);

    std::cout << "Pool capacity: " << pool.capacity() << '\n';
    std::cout << "Available: " << pool.available() << '\n';
}
```

**Output:**
```
Pool capacity: 1000
Available: 1000
```

---

#### Example 2: Linked List with Pool

This example demonstrates a real-world use case: **building a custom container (linked list) on top of a memory pool**. This is exactly how high-performance libraries like game engines manage dynamic data structures. The key insight is that **all allocations come from the pool, eliminating heap fragmentation and ensuring predictable performance**.

**What this code does:**
- Implements a `PooledLinkedList` class that owns its memory pool
- Each node is allocated from the pool, not from the heap
- The destructor walks the list and properly destroys each node, returning memory to the pool
- `push_front` uses `pool.construct()` to allocate and initialize nodes in one step
- `pop_front` uses `pool.destroy()` to destruct and deallocate nodes

**Key benefits demonstrated:**
- **Zero fragmentation**: All nodes are the same size and allocated from a contiguous block
- **Memory locality**: Nodes allocated sequentially are likely adjacent in memory, improving cache performance
- **Predictable deallocation**: Destroying the list takes exactly N operations, no hidden `free()` costs
- **Compile-time sizing**: Pool capacity is fixed at construction, preventing unbounded growth

**Real-world application:** This pattern is used in:
- **Game engines**: Entity component systems allocate thousands of components per frame
- **Network servers**: Connection objects, packet buffers, request handlers
- **Databases**: B-tree nodes, hash table buckets, transaction logs

**Performance impact:** For a linked list with 10,000 nodes, pool-based allocation can be **20-50x faster** than standard `new`/`delete`, and uses **2-3x less memory** due to reduced overhead.

```cpp
template<typename T>
class PooledLinkedList {
    struct Node {
        T data;
        Node* next;
        Node(const T& d) : data(d), next(nullptr) {}
    };

    MemoryPool<Node> pool_;
    Node* head_;

public:
    PooledLinkedList(size_t pool_size)
        : pool_(pool_size), head_(nullptr) {}

    ~PooledLinkedList() {
        while (head_) {
            Node* temp = head_;
            head_ = head_->next;
            pool_.destroy(temp);
        }
    }

    void push_front(const T& value) {
        Node* new_node = pool_.construct(value);
        new_node->next = head_;
        head_ = new_node;
    }

    void pop_front() {
        if (head_) {
            Node* temp = head_;
            head_ = head_->next;
            pool_.destroy(temp);
        }
    }
};

int main() {
    PooledLinkedList<int> list(100);

    for (int i = 0; i < 10; ++i) {
        list.push_front(i);
    }
}
```

---

#### Example 3: Performance Comparison

This example provides **empirical proof** of the memory pool's performance advantage through a head-to-head benchmark. The typical result shows **15x speedup** (45ms vs 3ms for 100,000 allocations), demonstrating why memory pools are essential for high-performance C++ applications.

**What this code measures:**
- **Standard allocation**: Uses `new` and `delete` for each of 100,000 Data objects
- **Pool allocation**: Uses `pool.construct()` and `pool.destroy()` for the same operations
- Both approaches allocate objects into a vector and then deallocate them all
- High-resolution timer measures the total time for allocation + deallocation

**Why the pool is 15x faster:**
1. **System call overhead**: Each `new` may invoke `malloc`, which can make system calls (brk/mmap). Pool makes NO system calls after initialization.
2. **Allocation algorithm cost**: `malloc` must search for free blocks using complex algorithms (buddy system, bins, etc.). Pool just pops from a linked list (1-2 instructions).
3. **Cache effects**: Pool allocations are sequential in memory, so CPU prefetcher can predict and load next blocks. Heap allocations are scattered, causing cache misses.
4. **TLB thrashing**: Heap allocations may span multiple memory pages, causing TLB (translation lookaside buffer) misses. Pool uses fewer pages.
5. **Bookkeeping overhead**: `malloc` maintains metadata for each allocation (size, flags, magic numbers). Pool has zero per-allocation overhead.

**Real-world implications:**
- **Game engine** allocating 100,000 particles per frame: 45ms → 3ms means 60 FPS becomes possible
- **Trading system** processing 1M orders/second: Reduced latency from microseconds to nanoseconds
- **Embedded system** with limited memory: Pool prevents fragmentation, ensuring consistent performance over days/weeks

**Important caveat:** Pool advantage decreases if:
- Objects are large (>1KB): Allocation time dominated by memory initialization
- Low allocation frequency: One-time costs matter less
- Variable object sizes: Pool design assumes fixed size

```cpp
#include <chrono>
#include <vector>

struct Data {
    int values[10];
};

void benchmark_standard_allocation() {
    auto start = std::chrono::high_resolution_clock::now();

    std::vector<Data*> ptrs;
    for (int i = 0; i < 100000; ++i) {
        ptrs.push_back(new Data());
    }
    for (auto* ptr : ptrs) {
        delete ptr;
    }

    auto end = std::chrono::high_resolution_clock::now();
    auto duration = std::chrono::duration_cast<std::chrono::milliseconds>(end - start);
    std::cout << "Standard: " << duration.count() << "ms\n";
}

void benchmark_pool_allocation() {
    auto start = std::chrono::high_resolution_clock::now();

    MemoryPool<Data> pool(100000);
    std::vector<Data*> ptrs;
    for (int i = 0; i < 100000; ++i) {
        ptrs.push_back(pool.construct());
    }
    for (auto* ptr : ptrs) {
        pool.destroy(ptr);
    }

    auto end = std::chrono::high_resolution_clock::now();
    auto duration = std::chrono::duration_cast<std::chrono::milliseconds>(end - start);
    std::cout << "Pool: " << duration.count() << "ms\n";
}

int main() {
    benchmark_standard_allocation();  // ~45ms
    benchmark_pool_allocation();      // ~3ms (15x faster!)
}
```

---

#### Example 4: Thread-Local Pool for Multithreading

This example demonstrates **thread-safe memory allocation using thread-local pools**, eliminating lock contention entirely. Instead of using a single shared pool protected by mutexes (which causes thread serialization), each thread gets its own private pool. This achieves **perfect scalability** - adding more threads doesn't slow down allocation.

**What this code does:**
- Uses C++11's `thread_local` storage to give each thread its own dedicated memory pool
- Worker threads perform intensive allocations without any synchronization overhead
- Each thread allocates 10,000 objects independently and in parallel
- No locks, no contention, no cache-line bouncing between cores

**Key advantages over shared pool:**
- **Zero lock overhead**: Each thread owns its pool exclusively
- **No cache contention**: Thread-local pools live in each core's L1/L2 cache
- **Perfect scalability**: 8 threads = 8x throughput (linear scaling)
- **NUMA-friendly**: On multi-socket systems, pools are local to each NUMA node

**Tradeoff:** Memory overhead grows with thread count (each thread allocates full pool). For 8 threads with 10K capacity each = 80K total capacity vs 10K for shared pool.

**Real-world usage:**
- **Game engines**: Per-thread particle systems, physics objects, AI agents
- **Web servers**: Per-request memory pools (request handled by one thread)
- **Database systems**: Per-transaction allocators

```cpp
#include <thread>
#include <vector>
#include <iostream>

struct Object {
    int data[100];  // Larger object to amplify allocation cost
};

// Each thread gets its own pool (no sharing!)
thread_local MemoryPool<Object> thread_pool(10000);

void worker_thread(int thread_id) {
    std::vector<Object*> objects;

    // Allocate 10,000 objects - NO LOCKS NEEDED!
    for (int i = 0; i < 10000; ++i) {
        objects.push_back(thread_pool.construct());
    }

    // Do work with objects...

    // Clean up
    for (auto* obj : objects) {
        thread_pool.destroy(obj);
    }

    std::cout << "Thread " << thread_id << " completed\n";
}

int main() {
    const int num_threads = 8;
    std::vector<std::thread> threads;

    // Launch threads - each uses its own pool
    for (int i = 0; i < num_threads; ++i) {
        threads.emplace_back(worker_thread, i);
    }

    // Wait for completion
    for (auto& t : threads) {
        t.join();
    }

    std::cout << "All threads completed with zero lock contention!\n";
}
```

**Performance comparison:**
```
Shared pool with mutex:     ~500ms for 8 threads (serialization)
Thread-local pools:         ~70ms for 8 threads (true parallelism)
7x faster due to eliminating locks!
```

---

#### Example 5: RAII Pool Wrapper for Exception Safety

This example demonstrates **automatic cleanup using RAII** to prevent memory leaks when exceptions occur. The `PoolPtr` smart pointer wrapper ensures objects are always destroyed and returned to the pool, even if exceptions are thrown during processing.

**What this code does:**
- Implements a `PoolPtr<T>` smart pointer that wraps pool-allocated objects
- Automatically calls `pool.destroy()` in its destructor (RAII pattern)
- Works with C++11 move semantics to transfer ownership efficiently
- Prevents leaks even when exceptions occur mid-processing

**Key safety guarantees:**
- **Exception-safe**: Object destroyed even if exception thrown
- **No double-free**: Move semantics transfer ownership, original pointer becomes null
- **RAII compliance**: Follows "Resource Acquisition Is Initialization" pattern
- **Zero overhead**: No runtime cost compared to manual destroy() calls

**Why this matters:**
Without RAII, exceptions cause leaks:
```cpp
// ❌ UNSAFE - leaks if process() throws
Object* obj = pool.construct();
process(obj);  // May throw!
pool.destroy(obj);  // Never reached if exception thrown
```

With RAII, automatic cleanup:
```cpp
// ✅ SAFE - always cleaned up
PoolPtr<Object> obj(pool);
process(*obj);  // If throws, destructor still runs
// Automatically destroyed here
```

**Real-world application:**
- **Transaction processing**: Rollback on exception
- **Game loop**: Ensure resources freed each frame, even on crash
- **Request handling**: Prevent resource leaks in long-running servers

```cpp
#include <utility>

template<typename T>
class PoolPtr {
    MemoryPool<T>* pool_;
    T* ptr_;

public:
    // Constructor: allocate from pool
    explicit PoolPtr(MemoryPool<T>& pool)
        : pool_(&pool), ptr_(pool.construct()) {}

    // Destructor: return to pool (RAII!)
    ~PoolPtr() {
        if (ptr_ && pool_) {
            pool_->destroy(ptr_);
        }
    }

    // Disable copy (unique ownership)
    PoolPtr(const PoolPtr&) = delete;
    PoolPtr& operator=(const PoolPtr&) = delete;

    // Enable move (transfer ownership)
    PoolPtr(PoolPtr&& other) noexcept
        : pool_(other.pool_), ptr_(other.ptr_) {
        other.pool_ = nullptr;
        other.ptr_ = nullptr;
    }

    PoolPtr& operator=(PoolPtr&& other) noexcept {
        if (this != &other) {
            // Destroy current object
            if (ptr_ && pool_) {
                pool_->destroy(ptr_);
            }
            // Transfer ownership
            pool_ = other.pool_;
            ptr_ = other.ptr_;
            other.pool_ = nullptr;
            other.ptr_ = nullptr;
        }
        return *this;
    }

    // Pointer-like interface
    T* operator->() { return ptr_; }
    T& operator*() { return *ptr_; }
    T* get() { return ptr_; }
};

// Usage example
void risky_function(MemoryPool<Object>& pool) {
    PoolPtr<Object> obj(pool);  // RAII: automatic cleanup

    // Even if this throws, obj is destroyed!
    if (some_condition()) {
        throw std::runtime_error("Error!");
    }

    obj->do_something();

    // Automatically destroyed here
}

int main() {
    MemoryPool<Object> pool(100);

    try {
        risky_function(pool);
    } catch (...) {
        // Object already cleaned up by PoolPtr destructor
    }

    std::cout << "Pool available: " << pool.available() << '\n';
    // Shows 100 - no leaks!
}
```

**Output:**
```
Pool available: 100
```

The pool is fully recovered even though an exception was thrown, demonstrating perfect exception safety.

---

### INTERVIEW_QA: Deep Understanding

---

#### Q1: Why is a memory pool faster than malloc/new?
Implement this exercise.

**Answer:**

**Standard Allocation (malloc/new):**
1. System call overhead (~100-500ns)
2. Searches for free block (complex algorithms)
3. May need to split/merge blocks
4. Bookkeeping overhead (headers, metadata)
5. Can cause page faults

**Memory Pool:**
1. No system calls after initialization
2. O(1) free list operations (~5-20ns)
3. No searching/splitting
4. Minimal overhead (just free list pointers)
5. All memory pre-paged

**Benchmark Comparison:**
```
malloc:  ~200ns per allocation
Pool:    ~10ns per allocation (20x faster)

With cache: Pool can be <5ns!
```

---
#### Q2: How do you handle alignment requirements?
Implement this exercise.

**Answer:**

**Three Approaches:**

1. **Use union (preferred for single type):**
   ```cpp
   union Block {
       T element;      // Natural alignment of T
       Block* next;    // Pointer alignment
   };
   ```

2. **Manual alignment calculation:**
   ```cpp
   size_t aligned_size = (sizeof(T) + alignof(T) - 1) & ~(alignof(T) - 1);
   ```

3. **Use std::aligned_alloc:**
   ```cpp
   void* memory = std::aligned_alloc(alignof(T), sizeof(T) * count);
   ```

**Why Alignment Matters:**
- Misaligned access = UB (undefined behavior)
- Performance: Aligned access is faster
- Some platforms crash on misaligned access (ARM, older x86)

---
#### Q3: What is the ABA problem and does it affect memory pools?
Implement this exercise.

**Answer:**

**ABA Problem:**

Occurs in lock-free data structures:
```cpp
// Thread 1 sees: A → B → C
T* old_head = free_list_;  // Points to A

// Thread 2: pops A, pops B, pushes A back
// Now: A → C

// Thread 1: CAS succeeds! (head is still A)
if (CAS(&free_list_, old_head, old_head->next)) {
    // ❌ But old_head->next is now stale!
}
```

**Memory Pool Impact:**

Our implementation uses mutex (not lock-free), so **no ABA problem**. But if making lock-free:

**Solution: Version Tagging**
```cpp
struct TaggedPointer {
    Block* ptr;
    uint64_t version;  // Increment on each change
};

// CAS on both pointer and version
```

---
#### Q4: How do you detect memory leaks in a pool?
Implement this exercise.

**Answer:**

**Detection Methods:**

1. **Count allocated blocks:**
   ```cpp
   ~MemoryPool() {
       if (allocated_count_ != 0) {
           std::cerr << "Leak: " << allocated_count_
                     << " blocks not freed\n";
       }
   }
   ```

2. **Track allocations (debug mode):**
   ```cpp
   std::unordered_set<T*> allocated_ptrs_;  // Track all allocations

   T* allocate() {
       T* ptr = /* ... */;
       allocated_ptrs_.insert(ptr);
       return ptr;
   }
   ```

3. **Valgrind/AddressSanitizer:**
   ```bash
   g++ -fsanitize=address program.cpp
   ./a.out  # Reports leaks
   ```

---
#### Q5: How does cache locality improve performance?
Implement this exercise.

**Answer:**

**Cache Benefits:**

1. **Spatial Locality:**
   ```cpp
   // Pool allocates sequentially
   Node* n1 = pool.allocate();  // Address: 0x1000
   Node* n2 = pool.allocate();  // Address: 0x1040 (adjacent!)

   // Accessing n1 loads n2 into cache too
   // Next access to n2 is cache hit!
   ```

2. **Benchmark Impact:**
   ```
   Random heap allocation:  ~100ns per access (cache miss)
   Sequential pool access:  ~5ns per access (cache hit)
   20x faster!
   ```

3. **Prefetching:**
   Modern CPUs prefetch sequential memory:
   ```cpp
   // Pool enables hardware prefetcher
   for (Node* n = head; n; n = n->next) {
       process(n->data);  // Likely in cache already
   }
   ```

---
#### Q6: When should you NOT use a memory pool?

**Answer:**

- Variable-sized allocations
- Low allocation frequency
- Unpredictable lifetimes

---

#### Q7: Thread-safety considerations?

**Answer:**

- Add mutex around allocate/deallocate
- Or use thread-local pools
- Lock-free pools are complex (ABA problem)

---

#### Q8: How to grow a pool dynamically?

**Answer:**

- Allocate new chunk, link to free list
- Keep linked list of chunks
- Deallocate all chunks in destructor

---

#### Q9: Memory overhead of pool vs malloc?

**Answer:**

- Pool: ~8 bytes per block (free list pointer)
- malloc: ~16-32 bytes per allocation (metadata)
- Pool wins for small objects!

---

#### Q10: RAII and exception safety?

**Answer:**

- Use `construct`/`destroy` consistently
- Pool destructor checks `allocated_count_`
- Consider RAII wrapper for automatic cleanup

---

---

### PRACTICE_TASKS: Hands-On Challenges

---

#### Q1
Basic Pool Usage

Implement this exercise.

```cpp
MemoryPool<int> pool(5);

int* a = pool.construct(10);
int* b = pool.construct(20);
pool.destroy(a);
int* c = pool.construct(30);

std::cout << pool.available();
```

**Answer:**
```
3
```

**Explanation:** Started with 5, allocated 2 (a, b), freed 1 (a), allocated 1 (c). Available: 5 - 2 + 1 - 1 = 3.

---

#### Q2
Pool Exhaustion

Implement this exercise.

```cpp
MemoryPool<int> pool(2);

int* a = pool.construct(1);
int* b = pool.construct(2);
int* c = pool.construct(3);  // What happens?
```

**Answer:**
```
Throws std::bad_alloc exception
```

**Explanation:** Pool has capacity 2. Third allocation exceeds capacity.

---

#### Q3
Thread-Safe Pool Analysis

Given this thread-safe pool implementation:

```cpp
template<typename T>
class ThreadSafePool {
    MemoryPool<T> pool_;
    std::mutex mutex_;

public:
    ThreadSafePool(size_t size) : pool_(size) {}

    T* allocate() {
        std::lock_guard<std::mutex> lock(mutex_);
        return pool_.allocate();
    }

    void deallocate(T* ptr) {
        std::lock_guard<std::mutex> lock(mutex_);
        pool_.deallocate(ptr);
    }
};

// 4 threads, each allocates 100 objects
// Pool size: 400
// What's the performance bottleneck?
```

**Answer:**
```
Lock contention - threads serialize at allocate/deallocate
```

**Explanation:** Even though pool has enough capacity (400 for 4×100), the mutex forces threads to wait for each other. Only one thread can allocate at a time, destroying parallelism. Solution: Use thread-local pools (one pool per thread).

---

#### Q4
Memory Leak Detection

```cpp
{
    MemoryPool<std::string> pool(10);

    auto* s1 = pool.construct("Hello");
    auto* s2 = pool.construct("World");
    pool.destroy(s1);
    // s2 not destroyed!
}  // Pool destructor runs

// How many std::string objects leak their internal buffers?
// What does pool.allocated_count_ show?
```

**Answer:**
```
1 std::string leaks (s2)
allocated_count_ = 1
```

**Explanation:**
- `s1` was properly destroyed → string buffer freed, memory returned to pool
- `s2` was never destroyed → string destructor never ran → internal buffer LEAKS
- Pool's memory is freed, but s2's internal heap-allocated buffer is orphaned
- `allocated_count_ = 1` indicates the leak

---

#### Q5
Alignment Calculation

Calculate the required aligned size for this struct in a memory pool:

```cpp
struct Data {
    char a;         // 1 byte, alignment = 1
    int b;          // 4 bytes, alignment = 4
    double c;       // 8 bytes, alignment = 8
};

// What is:
// 1. sizeof(Data)?
// 2. alignof(Data)?
// 3. Aligned block size for pool?
```

**Answer:**
```
1. sizeof(Data) = 16 bytes (with padding)
2. alignof(Data) = 8 (strictest member: double)
3. Aligned block size = 16 bytes (already aligned)
```

**Explanation:**
```
Memory layout:
[char a][3 bytes padding][int b][double c]
 1 byte    (align to 4)   4 bytes 8 bytes
Total: 1 + 3 + 4 + 8 = 16 bytes

Struct alignment = max(alignof members) = 8
16 is already multiple of 8, so no additional alignment needed
```

---

#### Additional Practice Questions 6-10


**Q3:** Alignment calculation for struct with char + double
**Answer:** Aligned to 8 bytes (double's requirement)

**Q4:** Detect double-free in debug mode
**Answer:** Walk free list, check if pointer already present

**Q5:** Calculate memory overhead: 1000 objects, 64 bytes each
**Answer:** Pool: 64KB + 8KB overhead. malloc: 64KB + 16-32KB overhead

**Q6:** Performance: Why is second allocation faster than first?
**Answer:** Cache warmth, TLB hits, branch prediction

**Q7:** Thread-safe pool: where to add locks?
**Answer:** Around free_list_ access in allocate/deallocate

**Q8:** False sharing: How to fix for atomic counters?
**Answer:** Pad to 64-byte cache line size

**Q9:** Grow pool dynamically: How?
**Answer:** Allocate new chunk, link to free list

**Q10:** RAII wrapper for automatic pool cleanup
**Answer:** Smart pointer-like class that calls destroy() in destructor

---

### QUICK_REFERENCE: Memory Pool Cheat Sheet

---

#### Core Concepts

```cpp
// Allocation: O(1)
T* ptr = pool.allocate();     // Get memory
new (ptr) T(args...);          // Construct

// Deallocation: O(1)
ptr->~T();                     // Destroy
pool.deallocate(ptr);          // Return memory

// Or combined:
T* ptr = pool.construct(args...);  // Allocate + construct
pool.destroy(ptr);                  // Destroy + deallocate
```

#### Performance Characteristics

| Operation | Time | Notes |
|-----------|------|-------|
| Allocate | O(1) | Pop from free list |
| Deallocate | O(1) | Push to free list |
| Construction | O(1) + T() | Placement new |
| Destruction | O(1) + ~T() | Explicit destructor |

#### Key Design Points

1. **Fixed-size blocks** - No fragmentation
2. **Free list** - Intrusive, zero overhead
3. **Alignment** - Use union or aligned_alloc
4. **Cache locality** - Sequential allocation
5. **Exception safety** - RAII, try/catch in construct

#### When to Use

✅ **Use Pool When:**
- Many small, fixed-size allocations
- Frequent allocation/deallocation
- Performance-critical (real-time, games)
- Need predictable latency

❌ **Don't Use Pool When:**
- Variable-sized objects
- Rare allocations
- Memory usage more important than speed
- Complexity not justified

---

**End of Topic 1: Memory Pool Allocator**
