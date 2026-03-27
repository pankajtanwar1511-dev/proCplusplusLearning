## TOPIC: Spinlock vs Mutex - Lock Performance Comparison

### PRACTICE_TASKS: Output Prediction and Code Analysis

#### Q1
```cpp
class Spinlock {
    std::atomic<bool> locked_{false};

public:
    void lock() {
        while (locked_.exchange(true, std::memory_order_acquire)) {
            // Busy-wait - Bug: burns CPU!
        }
    }

    void unlock() {
        locked_.store(false, std::memory_order_release);
    }
};

void worker() {
    Spinlock lock;
    lock.lock();
    std::this_thread::sleep_for(100ms);  // Simulate work
    lock.unlock();
}
```

**Answer:**
```
CPU waste (other threads spin-wait burning 100% CPU while lock held for 100ms)
```

**Explanation:**
- Spinlock busy-waits in tight loop
- Lock held for 100ms → other threads spin for 100ms
- CPU at 100% doing nothing useful
- Mutex would yield CPU to other threads
- Spinlocks only good for very short critical sections
- **Key Concept:** Spinlocks waste CPU when lock held long; appropriate only for microsecond-scale critical sections; use mutex for longer waits

**When to Use:**
```cpp
// Good: Very short critical section
Spinlock lock;
lock.lock();
counter++;  // Few CPU cycles
lock.unlock();

// Bad: Long critical section
std::mutex mutex;
mutex.lock();
std::this_thread::sleep_for(100ms);  // Mutex yields CPU
mutex.unlock();
```

---

#### Q2
```cpp
class Spinlock {
    std::atomic<bool> locked_{false};

public:
    void lock() {
        while (locked_.load(std::memory_order_acquire)) {  // Bug: load in loop!
            // Spin while locked
        }
        locked_.store(true, std::memory_order_acquire);  // Bug: TOCTOU race!
    }
};
```

**Answer:**
```
Race condition (check and set not atomic, multiple threads can acquire lock)
```

**Explanation:**
- Thread 1 sees `locked_ == false`, exits loop
- Thread 2 also sees `locked_ == false`, exits loop
- Both threads execute `locked_.store(true)` → both think they have lock
- Classic TOCTOU (Time-Of-Check-Time-Of-Use) bug
- Must use atomic read-modify-write: `exchange()` or `compare_exchange()`
- **Key Concept:** Spinlock acquisition must be atomic RMW operation; separate load and store creates race; use exchange() or CAS

**Fixed Version:**
```cpp
void lock() {
    while (locked_.exchange(true, std::memory_order_acquire)) {
        // Atomic exchange: returns old value, sets new value
        // If old value was true, spin again
    }
}
```

---

#### Q3
```cpp
class Spinlock {
    std::atomic<bool> locked_{false};

public:
    void lock() {
        while (locked_.exchange(true, std::memory_order_acquire)) {
            // Busy-wait
        }
    }
};

int main() {
    Spinlock lock;

    std::thread t1([&] {
        lock.lock();
        // ... work ...
        lock.unlock();
    });

    std::thread t2([&] {
        lock.lock();  // Bug: excessive cache coherency traffic!
        // ... work ...
        lock.unlock();
    });
}
```

**Answer:**
```
Cache thrashing (exchange() on every iteration causes cache line ping-pong)
```

**Explanation:**
- `exchange()` is atomic RMW → writes to cache line
- Every iteration writes, even when lock unavailable
- Causes cache line to bounce between CPUs (MESI protocol)
- Massive coherency traffic
- Better: read-only spin before exchange
- Only write when likely to succeed
- **Key Concept:** Atomic writes expensive due to cache coherency; spinlock should test-and-test-and-set pattern; read (cheap) before write (expensive)

**Fixed Version:**
```cpp
void lock() {
    while (true) {
        // First, check without writing (cheap)
        if (!locked_.load(std::memory_order_relaxed) &&
            // Then try to acquire (expensive write)
            !locked_.exchange(true, std::memory_order_acquire)) {
            break;  // Got lock
        }
    }
}

// Or with explicit loop
void lock() {
    while (locked_.exchange(true, std::memory_order_acquire)) {
        // Spin with read-only (no writes)
        while (locked_.load(std::memory_order_relaxed)) {
            // Pure spin, no cache coherency traffic
        }
    }
}
```

---

#### Q4
```cpp
class Spinlock {
    std::atomic<bool> locked_{false};

public:
    void lock() {
        while (locked_.exchange(true, std::memory_order_acquire)) {
            // Busy-wait without pause instruction!
        }
    }
};
```

**Answer:**
```
Performance issue (tight loop without pause causes pipeline inefficiencies)
```

**Explanation:**
- Tight loop without hints to CPU
- CPU predicts loop will exit soon, keeps executing speculatively
- Branch mispredictions waste energy
- Modern CPUs have `pause` instruction (x86) / `yield` (ARM)
- Hints to CPU: "I'm spinning, conserve power"
- Reduces power consumption and improves hyperthreading
- **Key Concept:** Spinloops should use CPU pause hints; reduces power and improves performance on hyperthreaded cores; portable via std::this_thread::yield() or intrinsics

**Fixed Version:**
```cpp
#ifdef _MSC_VER
#include <intrin.h>
#define cpu_relax() _mm_pause()
#elif defined(__x86_64__) || defined(__i386__)
#define cpu_relax() __builtin_ia32_pause()
#else
#define cpu_relax() std::this_thread::yield()
#endif

void lock() {
    while (locked_.exchange(true, std::memory_order_acquire)) {
        while (locked_.load(std::memory_order_relaxed)) {
            cpu_relax();  // Hint to CPU
        }
    }
}
```

---

#### Q5
```cpp
class Spinlock {
    std::atomic<bool> locked_{false};

public:
    void lock() {
        while (locked_.exchange(true)) {  // Bug: no memory order!
            // Spin
        }
    }

    void unlock() {
        locked_.store(false);  // Bug: no memory order!
    }
};

int shared_data = 0;
Spinlock lock;

void writer() {
    lock.lock();
    shared_data = 42;  // Bug: may be reordered before lock!
    lock.unlock();
}
```

**Answer:**
```
Data race (no memory ordering on lock/unlock, shared_data write may be reordered)
```

**Explanation:**
- `exchange()` without memory order → implementation-defined (usually seq_cst)
- `store()` without memory order → `memory_order_seq_cst` (default)
- But explicitly should use acquire/release for clarity
- Lock: acquire semantics (synchronize-with previous release)
- Unlock: release semantics (make writes visible)
- **Key Concept:** Locks require memory ordering: acquire on lock, release on unlock; ensures critical section not reordered; default seq_cst works but explicit acquire/release more efficient

**Fixed Version:**
```cpp
void lock() {
    while (locked_.exchange(true, std::memory_order_acquire)) {
        while (locked_.load(std::memory_order_relaxed)) {
            // Spin
        }
    }
}

void unlock() {
    locked_.store(false, std::memory_order_release);
}
```

---

#### Q6
```cpp
void benchmark() {
    Spinlock lock;
    int counter = 0;

    auto worker = [&] {
        for (int i = 0; i < 1000000; i++) {
            lock.lock();
            counter++;  // Bug: single increment under lock!
            lock.unlock();
        }
    };

    std::vector<std::thread> threads;
    for (int i = 0; i < 8; i++) {
        threads.emplace_back(worker);
    }

    for (auto& t : threads) t.join();
}
```

**Answer:**
```
Severe lock contention (lock acquired 8 million times for single increments)
```

**Explanation:**
- Each thread acquires lock 1M times
- 8 threads = 8M lock acquisitions
- Critical section tiny (one increment)
- But lock/unlock overhead dominates
- Other threads spin-wait for every single increment
- Better: use atomic counter or batch operations
- **Key Concept:** Fine-grained locking has high overhead; lock acquisition cost often exceeds protected operation; use atomics for simple operations or batch under locks

**Fixed Version:**
```cpp
// Option 1: Use atomic (no lock needed)
std::atomic<int> counter{0};

auto worker = [&] {
    for (int i = 0; i < 1000000; i++) {
        counter.fetch_add(1, std::memory_order_relaxed);
    }
};

// Option 2: Batch operations
auto worker = [&] {
    int local_sum = 0;
    for (int i = 0; i < 1000000; i++) {
        local_sum++;  // Local, no lock
    }
    lock.lock();
    counter += local_sum;  // One lock for all
    lock.unlock();
};
```

---

#### Q7
```cpp
class Spinlock {
    std::atomic_flag locked_ = ATOMIC_FLAG_INIT;  // Bug: using atomic_flag!

public:
    void lock() {
        while (locked_.test_and_set(std::memory_order_acquire)) {
            // Spin
        }
    }

    void unlock() {
        locked_.clear(std::memory_order_release);
    }
};
```

**Answer:**
```
Inefficient (atomic_flag has no load operation, can't implement test-and-test-and-set optimization)
```

**Explanation:**
- `atomic_flag` only supports `test_and_set()` and `clear()`
- No `load()` method → can't read without writing
- Can't implement efficient test-and-test-and-set pattern
- Every spin iteration does RMW (write) → cache thrashing
- `atomic<bool>` better: has `load()` for read-only spinning
- **Key Concept:** atomic_flag too limited for efficient spinlocks; lacks load() for read-only spinning; prefer atomic<bool> for spinlock implementation

**Why atomic<bool> Better:**
```cpp
class Spinlock {
    std::atomic<bool> locked_{false};  // Has load()!

public:
    void lock() {
        while (locked_.exchange(true, std::memory_order_acquire)) {
            // Can use load() for read-only spin
            while (locked_.load(std::memory_order_relaxed)) {
                // No writes, no cache traffic!
            }
        }
    }
};
```

---

#### Q8
```cpp
class Spinlock {
    std::atomic<bool> locked_{false};

public:
    bool try_lock() {
        return !locked_.exchange(true, std::memory_order_acquire);  // Correct!
    }

    void lock() {
        while (!try_lock()) {  // Bug: try_lock in loop!
            // Spin
        }
    }
};
```

**Answer:**
```
Performance issue (try_lock() always does exchange, no read-only spinning)
```

**Explanation:**
- `try_lock()` always calls `exchange()` (write)
- Every spin iteration writes → cache thrashing
- No read-only spinning optimization
- Should use dedicated `lock()` with test-and-test-and-set
- `try_lock()` meant for single-shot attempts, not loops
- **Key Concept:** try_lock() not for busy-waiting; meant for opportunistic locking; using in loop defeats test-and-test-and-set optimization

**Fixed Version:**
```cpp
bool try_lock() {
    return !locked_.exchange(true, std::memory_order_acquire);
}

void lock() {
    // Optimized lock, don't use try_lock()
    while (locked_.exchange(true, std::memory_order_acquire)) {
        while (locked_.load(std::memory_order_relaxed)) {
            cpu_relax();
        }
    }
}
```

---

#### Q9
```cpp
struct Data {
    Spinlock lock;
    int value alignas(64);  // Bug: only value aligned!
};

Data data1;
Data data2;  // May be on same cache line as data1!

void thread1() {
    while (true) {
        data1.lock.lock();
        data1.value++;
        data1.lock.unlock();
    }
}

void thread2() {
    while (true) {
        data2.lock.lock();  // Bug: false sharing with data1!
        data2.value++;
        data2.lock.unlock();
    }
}
```

**Answer:**
```
False sharing (data1 and data2 may share cache line, causing ping-pong)
```

**Explanation:**
- `alignas(64)` aligns `value`, not entire `Data` struct
- `data1` and `data2` may be adjacent → share cache line
- Thread1 writes to cache line (data1)
- Thread2 writes to cache line (data2)
- Even though different structs, same cache line → false sharing
- Must align entire struct
- **Key Concept:** Aligning members insufficient; must align entire objects to cache line for true isolation; use alignas on struct/class or placement new with alignment

**Fixed Version:**
```cpp
struct alignas(64) Data {  // Align entire struct!
    Spinlock lock;
    int value;
    char padding[64 - sizeof(Spinlock) - sizeof(int)];  // Explicit padding
};

// Or ensure global objects cache-line aligned
alignas(64) Data data1;
alignas(64) Data data2;
```

---

#### Q10
```cpp
class Spinlock {
    std::atomic<bool> locked_{false};

public:
    void lock() {
        while (locked_.exchange(true, std::memory_order_acquire)) {
            while (locked_.load(std::memory_order_relaxed)) {
                cpu_relax();
            }
        }
    }

    void unlock() {
        locked_.store(false, std::memory_order_release);
    }
};

int main() {
    Spinlock lock;

    lock.lock();
    lock.lock();  // Bug: double-lock deadlock!
}
```

**Answer:**
```
Deadlock (spinlock not recursive, double-lock deadlocks immediately)
```

**Explanation:**
- First `lock()` acquires successfully
- Second `lock()` spins forever (same thread!)
- Spinlocks not recursive by default
- Unlike `std::recursive_mutex`, spinlock deadlocks
- Must track owner thread for recursion
- **Key Concept:** Basic spinlocks non-recursive; double-locking causes deadlock; implement recursive spinlock with owner tracking or use recursive_mutex

**Recursive Spinlock:**
```cpp
class RecursiveSpinlock {
    std::atomic<bool> locked_{false};
    std::thread::id owner_;
    int recursion_count_ = 0;

public:
    void lock() {
        auto this_id = std::this_thread::get_id();

        if (owner_ == this_id) {
            recursion_count_++;  // Recursive lock
            return;
        }

        // Acquire lock
        while (locked_.exchange(true, std::memory_order_acquire)) {
            while (locked_.load(std::memory_order_relaxed)) {
                cpu_relax();
            }
        }

        owner_ = this_id;
        recursion_count_ = 1;
    }

    void unlock() {
        if (--recursion_count_ == 0) {
            owner_ = std::thread::id();
            locked_.store(false, std::memory_order_release);
        }
    }
};
```

---
