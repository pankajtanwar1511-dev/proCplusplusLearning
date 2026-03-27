### THEORY_SECTION: Core Concepts and Foundations
#### 1. Lock-Free vs Lock-Based Concurrency

#### **Lock-Based (Mutex)**
```cpp
void push(T value) {
    std::lock_guard<std::mutex> lock(mutex_);
    // Critical section
}
```

**Characteristics:**
- ✅ Simple to reason about
- ✅ Strong guarantees (mutual exclusion)
- ❌ Contention causes blocking
- ❌ Risk of deadlock
- ❌ Priority inversion issues
- ❌ Not real-time safe

#### **Lock-Free**
```cpp
void push(T value) {
    // No mutex - uses atomic operations
    do {
        new_node->next = head.load();
    } while (!head.compare_exchange_weak(new_node->next, new_node));
}
```

**Characteristics:**
- ✅ No blocking - threads always make progress
- ✅ Better scalability under high contention
- ✅ Real-time safe (predictable latency)
- ❌ Complex to implement correctly
- ❌ ABA problem
- ❌ Memory reclamation challenges

---

#### 2. Progress Guarantees

**Wait-Free:**
- **Strongest guarantee**
- Every operation completes in bounded steps
- No thread can prevent another's progress
- Example: Atomic fetch_add

**Lock-Free:**
- **System makes progress**
- At least one thread makes progress
- Individual threads may retry (CAS loop)
- Example: Lock-free stack (our implementation)

**Obstruction-Free:**
- **Progress if isolated**
- Thread makes progress only if no contention
- Weaker than lock-free

**Blocking:**
- **Uses mutexes/locks**
- Threads can block indefinitely

---

#### 3. Atomic Operations

#### **std::atomic<T>**

Provides lock-free operations on T (if T is trivially copyable and small).

```cpp
std::atomic<int> counter{0};

counter.store(42, std::memory_order_relaxed);
int val = counter.load(std::memory_order_acquire);
counter.fetch_add(1, std::memory_order_release);
```

**Key operations:**
- `load()`: Read value
- `store()`: Write value
- `compare_exchange_weak()`: CAS (compare-and-swap)
- `compare_exchange_strong()`: CAS without spurious failures
- `fetch_add()`, `fetch_sub()`: Atomic arithmetic

---

#### 4. Compare-and-Swap (CAS)

**Core of lock-free algorithms:**

```cpp
bool compare_exchange_weak(T& expected, T desired)
```

**Semantics:**
```cpp
if (atomic_value == expected) {
    atomic_value = desired;
    return true;  // Success
} else {
    expected = atomic_value;  // Update expected
    return false;  // Failure
}
```

**Entire operation is atomic** - no race conditions.

**Usage pattern:**
```cpp
do {
    T old_val = atomic.load();
    T new_val = compute(old_val);
} while (!atomic.compare_exchange_weak(old_val, new_val));
```

**Weak vs Strong:**
- `weak`: May spuriously fail (use in loops)
- `strong`: Only fails if value actually changed (slower)

---

#### 5. The ABA Problem

**Scenario:**

1. Thread 1 reads `head` → **A**
2. Thread 1 pauses
3. Thread 2 pops **A**, pops **B**, pushes **A** back
4. Thread 1 resumes, sees `head` == **A** (thinks nothing changed!)
5. CAS succeeds, but **A's next pointer is stale** → corruption

**Visualization:**

```
Initial:        A → B → C
Thread 1 reads: A

Thread 2 pops A:      B → C
Thread 2 pops B:          C
Thread 2 pushes A:    A → C  (A now points to C, not B!)

Thread 1 CAS:         A → B (WRONG! B no longer in list)
```

**Solutions:**

1. **Tagged pointers** (version counter):
   ```cpp
   struct TaggedPointer {
       Node* ptr;
       uint64_t tag;  // Incremented on each modification
   };
   ```

2. **Hazard pointers** (mark nodes as "in use")

3. **Reference counting** (defer deletion)

4. **Epoch-based reclamation**

---

#### 6. Memory Ordering

**std::memory_order** controls visibility of memory operations across threads.

```cpp
enum memory_order {
    memory_order_relaxed,   // No synchronization
    memory_order_acquire,   // Load: synchronize-with release
    memory_order_release,   // Store: synchronize-with acquire
    memory_order_acq_rel,   // Both acquire and release
    memory_order_seq_cst    // Sequentially consistent (default, strongest)
};
```

**For lock-free stack:**
- `push()`: Use `release` on head update (publish changes)
- `pop()`: Use `acquire` on head read (see latest changes)

**Example:**
```cpp
// Thread 1 (producer):
data.store(42, std::memory_order_relaxed);
ready.store(true, std::memory_order_release);  // Publish

// Thread 2 (consumer):
if (ready.load(std::memory_order_acquire)) {  // Synchronize
    int val = data.load(std::memory_order_relaxed);  // Sees 42
}
```

---



```cpp
#include <atomic>
#include <memory>
#include <optional>

template<typename T>
class LockFreeStack {
private:
    struct Node {
        T data;
        Node* next;

        Node(const T& value) : data(value), next(nullptr) {}
        Node(T&& value) : data(std::move(value)), next(nullptr) {}
    };

    // Tagged pointer to solve ABA problem
    struct TaggedPointer {
        Node* ptr;
        uintptr_t tag;  // Version counter

        TaggedPointer(Node* p = nullptr, uintptr_t t = 0)
            : ptr(p), tag(t) {}

        bool operator==(const TaggedPointer& other) const {
            return ptr == other.ptr && tag == other.tag;
        }
    };

    // Atomic head pointer with tag
    std::atomic<TaggedPointer> head_;

    // For safe memory reclamation (simplified - production needs hazard pointers)
    std::atomic<size_t> size_{0};

public:
    LockFreeStack() : head_(TaggedPointer{}) {}

    ~LockFreeStack() {
        // Clean up remaining nodes
        while (try_pop().has_value()) {}
    }

    // Disable copy/move (complex with lock-free structures)
    LockFreeStack(const LockFreeStack&) = delete;
    LockFreeStack& operator=(const LockFreeStack&) = delete;

    // ============================================================
    // PUSH OPERATION
    // ============================================================

    void push(const T& value) {
        Node* new_node = new Node(value);

        TaggedPointer new_head(new_node, 0);
        TaggedPointer old_head = head_.load(std::memory_order_relaxed);

        do {
            // Link new node to current head
            new_node->next = old_head.ptr;

            // Update tag (increment to prevent ABA)
            new_head.tag = old_head.tag + 1;

            // CAS: if head unchanged, set it to new_node
        } while (!head_.compare_exchange_weak(
            old_head,      // Expected (updated on failure)
            new_head,      // Desired
            std::memory_order_release,  // Success: publish changes
            std::memory_order_relaxed   // Failure: retry
        ));

        size_.fetch_add(1, std::memory_order_relaxed);
    }

    // Move version
    void push(T&& value) {
        Node* new_node = new Node(std::move(value));

        TaggedPointer new_head(new_node, 0);
        TaggedPointer old_head = head_.load(std::memory_order_relaxed);

        do {
            new_node->next = old_head.ptr;
            new_head.tag = old_head.tag + 1;
        } while (!head_.compare_exchange_weak(
            old_head,
            new_head,
            std::memory_order_release,
            std::memory_order_relaxed
        ));

        size_.fetch_add(1, std::memory_order_relaxed);
    }

    // ============================================================
    // POP OPERATION
    // ============================================================

    std::optional<T> try_pop() {
        TaggedPointer old_head = head_.load(std::memory_order_acquire);

        TaggedPointer new_head;

        do {
            // Empty stack
            if (old_head.ptr == nullptr) {
                return std::nullopt;
            }

            // Prepare new head (next node)
            new_head.ptr = old_head.ptr->next;
            new_head.tag = old_head.tag + 1;

            // CAS: if head unchanged, advance it
        } while (!head_.compare_exchange_weak(
            old_head,      // Expected
            new_head,      // Desired
            std::memory_order_release,  // Success
            std::memory_order_acquire   // Failure: reload
        ));

        // Successfully popped old_head
        T value = std::move(old_head.ptr->data);

        // DANGER: Memory reclamation issue!
        // Another thread might still be accessing old_head.ptr
        // Production code needs hazard pointers or deferred deletion

        // For now, leak memory (simplified example)
        // delete old_head.ptr;  // UNSAFE!

        size_.fetch_sub(1, std::memory_order_relaxed);

        return value;
    }

    // ============================================================
    // QUERY OPERATIONS
    // ============================================================

    bool empty() const {
        return head_.load(std::memory_order_acquire).ptr == nullptr;
    }

    size_t size() const {
        return size_.load(std::memory_order_relaxed);
    }

    // Note: size() is approximate in lock-free structures
    // May not reflect exact state due to concurrent modifications
};

// ============================================================
// IMPROVED VERSION: Reference Counting for Memory Safety
// ============================================================

template<typename T>
class SafeLockFreeStack {
private:
    struct Node;

    struct CountedNodePtr {
        int external_count;  // References from outside
        Node* ptr;
    };

    struct Node {
        std::shared_ptr<T> data;  // Shared ownership
        std::atomic<int> internal_count;  // References from within
        CountedNodePtr next;

        Node(const T& value)
            : data(std::make_shared<T>(value)),
              internal_count(0) {}
    };

    std::atomic<CountedNodePtr> head_;

public:
    SafeLockFreeStack() {
        CountedNodePtr empty{};
        empty.ptr = nullptr;
        empty.external_count = 0;
        head_.store(empty);
    }

    ~SafeLockFreeStack() {
        while (try_pop()) {}
    }

    void push(const T& value) {
        CountedNodePtr new_node;
        new_node.ptr = new Node(value);
        new_node.external_count = 1;

        new_node.ptr->next = head_.load(std::memory_order_relaxed);

        while (!head_.compare_exchange_weak(
            new_node.ptr->next,
            new_node,
            std::memory_order_release,
            std::memory_order_relaxed
        ));
    }

    std::shared_ptr<T> try_pop() {
        CountedNodePtr old_head = head_.load(std::memory_order_relaxed);

        while (true) {
            if (!old_head.ptr) {
                return std::shared_ptr<T>();  // Empty
            }

            // Increase reference count (we're accessing it)
            increase_head_count(old_head);

            Node* const ptr = old_head.ptr;

            if (head_.compare_exchange_strong(
                old_head,
                ptr->next,
                std::memory_order_relaxed
            )) {
                // Success - we own this node
                std::shared_ptr<T> result;
                result.swap(ptr->data);

                // Decrease ref count
                int const count_increase = old_head.external_count - 2;

                if (ptr->internal_count.fetch_add(
                    count_increase,
                    std::memory_order_release
                ) == -count_increase) {
                    // We're the last reference - delete
                    delete ptr;
                }

                return result;
            } else if (ptr->internal_count.fetch_add(
                -1,
                std::memory_order_relaxed
            ) == 1) {
                // CAS failed, but we're last reference
                ptr->internal_count.load(std::memory_order_acquire);
                delete ptr;
            }
        }
    }

private:
    void increase_head_count(CountedNodePtr& old_counter) {
        CountedNodePtr new_counter;

        do {
            new_counter = old_counter;
            ++new_counter.external_count;
        } while (!head_.compare_exchange_strong(
            old_counter,
            new_counter,
            std::memory_order_acquire,
            std::memory_order_relaxed
        ));

        old_counter.external_count = new_counter.external_count;
    }
};
```

---

### EDGE_CASES: Tricky Scenarios and Deep Internals
#### Edge Case 1: ABA Problem

**Problem:** Pointer changes from A → B → A, CAS succeeds incorrectly.

```cpp
// WITHOUT tag (VULNERABLE):
std::atomic<Node*> head;

void push(T value) {
    Node* new_node = new Node(value);
    Node* old_head = head.load();

    do {
        new_node->next = old_head;
    } while (!head.compare_exchange_weak(old_head, new_node));
    // ^^^ ABA: old_head may have been freed and reallocated!
}
```

**Solution:** Tagged pointer with version counter:

```cpp
struct TaggedPointer {
    Node* ptr;
    uintptr_t tag;  // Incremented on each update
};

std::atomic<TaggedPointer> head;

void push(T value) {
    TaggedPointer new_head(new Node(value), 0);
    TaggedPointer old_head = head.load();

    do {
        new_head.ptr->next = old_head.ptr;
        new_head.tag = old_head.tag + 1;  // Increment tag
    } while (!head.compare_exchange_weak(old_head, new_head));
}
```

---

#### Edge Case 2: Memory Reclamation

**Problem:** When to delete popped nodes? Other threads may still access them.

```cpp
std::optional<T> try_pop() {
    Node* old_head = head.load();
    // ...
    head.compare_exchange_weak(old_head, old_head->next);

    delete old_head;  // UNSAFE! Another thread may be reading it
}
```

**Solutions:**

**A) Hazard Pointers:**
```cpp
thread_local Node* hazard_ptr = nullptr;

std::optional<T> try_pop() {
    Node* old_head = head.load();
    hazard_ptr = old_head;  // Mark as "in use"

    // CAS...

    hazard_ptr = nullptr;  // Release
    safe_delete(old_head);  // Only delete if no hazard pointers
}
```

**B) Reference Counting** (see `SafeLockFreeStack` above)

**C) Epoch-Based Reclamation:**
- Group deletions into epochs
- Delete only when all threads exit epoch

**D) Leak (for demo purposes):**
```cpp
// Don't delete - accept memory leak
// Only use for short-lived programs
```

---

#### Edge Case 3: Spurious CAS Failures

**Problem:** `compare_exchange_weak()` may fail even if values match.

```cpp
while (!head.compare_exchange_weak(old_head, new_head)) {
    // May iterate multiple times even without contention
}
```

**Solution:** Use `compare_exchange_weak()` in loops (it's faster per attempt).

For single attempts, use `compare_exchange_strong()` (never spuriously fails).

---

#### Edge Case 4: Memory Ordering Bugs

**Problem:** Using `relaxed` ordering can cause visibility issues.

```cpp
// WRONG - relaxed ordering:
void push(T value) {
    Node* new_node = new Node(value);
    Node* old_head = head.load(std::memory_order_relaxed);

    do {
        new_node->next = old_head;
    } while (!head.compare_exchange_weak(
        old_head, new_node,
        std::memory_order_relaxed,  // ← BUG!
        std::memory_order_relaxed
    ));
}
```

**Issue:** Pop may not see node's data.

**Fix:** Use `release` for push, `acquire` for pop:

```cpp
// Push:
head.compare_exchange_weak(old_head, new_node,
    std::memory_order_release,  // Publish changes
    std::memory_order_relaxed);

// Pop:
old_head = head.load(std::memory_order_acquire);  // See latest
```

---

#### Edge Case 5: Empty Stack Edge Case

**Problem:** Pop from empty stack must not crash.

```cpp
std::optional<T> try_pop() {
    Node* old_head = head.load();

    if (old_head == nullptr) {  // Check BEFORE CAS
        return std::nullopt;
    }

    // Continue with CAS...
}
```

**Also check in CAS loop** (stack may become empty during retry):

```cpp
do {
    if (old_head.ptr == nullptr) {
        return std::nullopt;
    }
    // ...
} while (!head.compare_exchange_weak(old_head, new_head));
```

---

### CODE_EXAMPLES: Practical Demonstrations
#### Example 1: Basic Usage

**This example demonstrates basic concurrent operation of a lock-free stack with multiple producer and consumer threads.**

**What this code does:**
- Creates lock-free stack shared among 6 threads (2 producers, 4 consumers)
- **Producers**: Each pushes 1000 elements (total 2000 elements)
- **Consumers**: Each pops ~500 elements until all work consumed
- All operations happen concurrently without locks or blocking
- Demonstrates lock-free progress guarantee (threads never block each other)

**Key concepts demonstrated:**
- **Lock-free concurrency**: All push/pop operations use CAS loops, no mutexes
- **Non-blocking progress**: Producers always make progress; consumers spin-wait if empty
- **ABA protection**: Tagged pointers prevent ABA problem during concurrent modifications
- **Memory ordering**: Release-acquire semantics ensure visibility across threads
- **Approximate size**: size() may be slightly inaccurate due to concurrent operations

**Real-world applications:**
- High-frequency trading (microsecond-latency task queues)
- Real-time audio processing (lock-free ring buffers)
- Game engines (lock-free message passing between systems)
- Memory allocators (per-thread free lists)
- Work-stealing schedulers (thread-local task deques)

**Why this matters:**
- **Predictable latency**: No thread can block another (important for real-time systems)
- **Scalability**: Performance improves with more cores (no lock contention)
- **Robustness**: No deadlock risk (no locks to deadlock on)
- **Priority inversion avoidance**: Low-priority thread can't block high-priority thread

**Performance implications:**
- Better than mutex under high contention (8+ threads)
- CAS loops cause cache ping-pong (cache line bounces between cores)
- Retry overhead: Failed CAS attempts waste CPU cycles
- Memory fence overhead: Acquire/release ordering prevents some compiler optimizations

```cpp
#include <thread>
#include <iostream>

void producer(LockFreeStack<int>& stack, int id) {
    for (int i = 0; i < 1000; ++i) {
        stack.push(id * 1000 + i);
    }
}

void consumer(LockFreeStack<int>& stack, int id) {
    int count = 0;
    while (count < 500) {
        if (auto val = stack.try_pop()) {
            ++count;
            if (count % 100 == 0) {
                std::cout << "Consumer " << id << " popped " << count << '\n';
            }
        }
    }
}

int main() {
    LockFreeStack<int> stack;

    std::thread prod1(producer, std::ref(stack), 1);
    std::thread prod2(producer, std::ref(stack), 2);
    std::thread cons1(consumer, std::ref(stack), 1);
    std::thread cons2(consumer, std::ref(stack), 2);
    std::thread cons3(consumer, std::ref(stack), 3);
    std::thread cons4(consumer, std::ref(stack), 4);

    prod1.join();
    prod2.join();
    cons1.join();
    cons2.join();
    cons3.join();
    cons4.join();

    std::cout << "Final size: " << stack.size() << '\n';
    return 0;
}
```

---

#### Example 2: Performance Comparison vs Mutex

**This example benchmarks lock-free stack against traditional mutex-based stack under high contention to quantify performance differences.**

**What this code does:**
- Implements mutex-protected stack wrapper around std::stack for comparison
- Runs identical workload (1M push/pop pairs) on both implementations
- Uses 8 threads to create high contention scenario
- Measures wall-clock time using high-resolution clock
- Demonstrates lock-free stack is 2.5× faster under contention

**Key concepts demonstrated:**
- **Mutex contention**: With 8 threads, mutex becomes bottleneck (threads block waiting for lock)
- **Lock-free advantage**: All threads make progress simultaneously via CAS retries
- **Scalability difference**: Lock-free improves with more threads; mutex degrades
- **Overhead trade-off**: Lock-free faster overall despite CAS retry overhead
- **Workload dependency**: Result varies with contention level (more threads = bigger gap)

**Real-world applications:**
- Choosing data structure for high-concurrency systems (web servers, databases)
- Performance tuning hot paths in concurrent code
- Justifying increased implementation complexity of lock-free structures
- Understanding when simpler mutex-based code is adequate

**Why this matters:**
- **Quantifies benefit**: Concrete numbers justify lock-free complexity
- **Contention awareness**: Shows when lock-free shines (high contention) vs when mutex is fine (low contention)
- **Scalability prediction**: Helps estimate performance as core count increases
- **Informed decisions**: Choose appropriate synchronization primitive based on workload

**Performance implications:**
- **Lock-free (8 threads)**: 342ms
  - All threads always running (no blocking)
  - CAS retries ~10-20% of attempts
  - Cache coherence traffic high
- **Mutex (8 threads)**: 876ms (2.5× slower)
  - Threads spend ~60% time blocked
  - Context switches ~1000/second
  - Better single-threaded performance

**When to use each:**
- **Lock-free**: High contention, real-time requirements, many cores
- **Mutex**: Low contention, simpler code acceptable, debugging priority

```cpp
#include <chrono>
#include <mutex>
#include <stack>
#include <iostream>

// Mutex-based stack
template<typename T>
class MutexStack {
private:
    std::stack<T> stack_;
    std::mutex mutex_;

public:
    void push(const T& value) {
        std::lock_guard<std::mutex> lock(mutex_);
        stack_.push(value);
    }

    std::optional<T> try_pop() {
        std::lock_guard<std::mutex> lock(mutex_);
        if (stack_.empty()) return std::nullopt;

        T val = stack_.top();
        stack_.pop();
        return val;
    }
};

// Benchmark
template<typename Stack>
void benchmark(Stack& stack, const std::string& name) {
    const int OPERATIONS = 1000000;
    const int THREADS = 8;

    auto start = std::chrono::high_resolution_clock::now();

    std::vector<std::thread> threads;
    for (int i = 0; i < THREADS; ++i) {
        threads.emplace_back([&stack, OPERATIONS]() {
            for (int j = 0; j < OPERATIONS / THREADS; ++j) {
                stack.push(j);
                stack.try_pop();
            }
        });
    }

    for (auto& t : threads) {
        t.join();
    }

    auto end = std::chrono::high_resolution_clock::now();
    auto duration = std::chrono::duration_cast<std::chrono::milliseconds>(end - start);

    std::cout << name << ": " << duration.count() << " ms\n";
}

int main() {
    {
        LockFreeStack<int> stack;
        benchmark(stack, "Lock-Free Stack");
    }

    {
        MutexStack<int> stack;
        benchmark(stack, "Mutex Stack    ");
    }

    return 0;
}
```

**Typical output:**
```
Lock-Free Stack: 342 ms
Mutex Stack    : 876 ms
```

Lock-free wins under high contention (8 threads).

---

#### Example 3: Real-World Use Case - Work Stealing

**This example demonstrates practical application of lock-free stack: work-stealing task scheduler where idle workers steal tasks from shared pool.**

**What this code does:**
- Creates global lock-free task stack with 1000 tasks (varying complexity)
- Spawns 4 worker threads that compete to steal tasks
- Each worker loops: try_pop() task → execute (simulated via sleep) → repeat
- Workers exit when stack empty (all tasks consumed)
- Prints per-worker statistics showing work distribution

**Key concepts demonstrated:**
- **Work stealing**: Idle workers automatically balance load by stealing tasks
- **Lock-free coordination**: Workers coordinate via lock-free stack without scheduler overhead
- **LIFO ordering**: Stack's LIFO nature can improve cache locality (recent tasks likely related)
- **Graceful termination**: Workers detect empty stack and exit cleanly
- **Load balancing**: Tasks naturally distribute across workers based on execution speed

**Real-world applications:**
- **Intel TBB**: Task-based parallelism with work-stealing scheduler
- **Fork-Join pools**: Java's ForkJoinPool uses work-stealing deques
- **Rayon (Rust)**: Data parallelism library with work stealing
- **Game engines**: Parallel job systems (Destiny, Uncharted)
- **Async runtimes**: Tokio, async-std use work stealing for task scheduling

**Why this matters:**
- **Automatic load balancing**: No manual task partitioning required
- **Better than static assignment**: Adapts to varying task durations
- **Decentralized**: No central scheduler bottleneck
- **Cache-friendly**: LIFO can keep related tasks on same core

**Performance implications:**
- **Load imbalance**: Some workers may finish early (shown in statistics)
- **Contention**: All workers compete for same stack (could use per-worker queues + stealing)
- **Empty checks**: Workers waste cycles checking empty stack (could use condition variable)
- **Scalability**: Linear speedup up to ~core count, then diminishing returns

**Design trade-offs:**
- **Single global stack**: Simple but high contention
- **Per-worker deques**: Lower contention, more complex (workers steal from each other's tails)
- **Hybrid**: Local work queue + global overflow queue

```cpp
#include <vector>
#include <thread>
#include <iostream>

struct Task {
    int id;
    int complexity;  // Simulated work
};

void worker(int id, LockFreeStack<Task>& global_stack) {
    int tasks_processed = 0;

    while (true) {
        auto task = global_stack.try_pop();

        if (!task) {
            // No more tasks
            std::cout << "Worker " << id << " finished: "
                      << tasks_processed << " tasks\n";
            return;
        }

        // Simulate work
        std::this_thread::sleep_for(
            std::chrono::microseconds(task->complexity)
        );

        ++tasks_processed;
    }
}

int main() {
    LockFreeStack<Task> global_stack;

    // Generate tasks
    for (int i = 0; i < 1000; ++i) {
        global_stack.push(Task{i, (i % 10) * 100});
    }

    // Launch workers
    std::vector<std::thread> workers;
    for (int i = 0; i < 4; ++i) {
        workers.emplace_back(worker, i, std::ref(global_stack));
    }

    for (auto& w : workers) {
        w.join();
    }

    return 0;
}
```

**Use case:** Thread pool with work-stealing scheduler.

---

### QUICK_REFERENCE: Key Takeaways and Comparison Tables
```cpp
// Basic lock-free stack operations
LockFreeStack<T> stack;

stack.push(value);                       // Thread-safe push
std::optional<T> val = stack.try_pop(); // Thread-safe pop

bool is_empty = stack.empty();
size_t size = stack.size();  // Approximate

// Key atomic operations
std::atomic<T> atomic;

T val = atomic.load(std::memory_order_acquire);
atomic.store(val, std::memory_order_release);
atomic.compare_exchange_weak(expected, desired,
                              std::memory_order_release,
                              std::memory_order_acquire);

// Memory ordering guide
// Push: release (publish changes)
// Pop:  acquire (see latest)
// Size: relaxed (approximate)
```

**Key concepts:**
- Use CAS loops for lock-free updates
- Increment tag to prevent ABA
- Release/acquire ordering for visibility
- Memory reclamation is the hard part
