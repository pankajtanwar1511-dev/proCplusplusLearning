### PRACTICE_TASKS

#### Q1

What is the output?

```cpp
MemoryPool<int> pool(5);

int* a = pool.create(10);
int* b = pool.create(20);
pool.destroy(a);
int* c = pool.create(30);

std::cout << pool.available() << "\n";
std::cout << (c == a) << "\n";  // Same address?
```

**Answer:**

```
3
1
```

**Explanation:**

- Started with 5 capacity
- Allocated 2 (a, b): available = 3
- Freed 1 (a): available = 4
- Allocated 1 (c): available = 3
- `c == a` is true (1) because freed block `a` was reused for `c`

**Key Concept:** Memory pools reuse freed blocks immediately (LIFO free list).

---

#### Q2

What happens here?

```cpp
MemoryPool<int> pool(2);

int* a = pool.create(1);
int* b = pool.create(2);
int* c = pool.create(3);  // What happens?
```

**Answer:**

```
Throws std::bad_alloc exception
```

**Explanation:**

- Pool capacity is 2
- First two allocations succeed
- Third allocation fails: no free blocks left
- `allocate()` throws `std::bad_alloc`

**Key Concept:** Fixed-size pools have hard capacity limits.

---

#### Q3

Identify the bug:

```cpp
struct Data {
    std::string name;
    int value;
};

MemoryPool<Data> pool(10);

Data* d = pool.allocate();  // Bug here
d->name = "test";
d->value = 42;

pool.deallocate(d);
```

**Answer:**

**Bug:** Using `allocate()` instead of `create()` - constructor never runs!

**Problems:**
1. `d->name` is uninitialized `std::string` - undefined behavior
2. `d->value` might work (POD) but still UB
3. `deallocate()` doesn't call destructor - `std::string` internal buffer leaks

**Fixed Version:**

```cpp
Data* d = pool.create();  // Constructor runs
d->name = "test";         // ✅ Safe
d->value = 42;

pool.destroy(d);  // ✅ Destructor runs, no leak
```

**Key Concept:** Always use `create`/`destroy` for non-trivial types.

---

#### Q4

Calculate alignment:

```cpp
struct Widget {
    char a;         // 1 byte, alignof = 1
    int b;          // 4 bytes, alignof = 4
    double c;       // 8 bytes, alignof = 8
};

// What is:
// 1. sizeof(Widget)?
// 2. alignof(Widget)?
// 3. Aligned block size for pool?
```

**Answer:**

1. `sizeof(Widget) = 16 bytes`
2. `alignof(Widget) = 8` (strictest member: double)
3. Aligned block size = 16 bytes

**Explanation:**

```
Memory layout with padding:
[char: 1][pad: 3][int: 4][double: 8] = 16 bytes

Address allocation:
0x0: char a
0x1-0x3: padding (align int to 4)
0x4-0x7: int b
0x8-0xF: double c (aligned to 8)

Total: 16 bytes (already multiple of 8, no extra padding needed)
```

**Formula Check:**
```cpp
aligned_size = (16 + 8 - 1) & ~(8 - 1)
             = 23 & 0xFFFFFFF8
             = 16  ✅
```

**Key Concept:** Alignment = max(member alignments). Size includes padding to match alignment.

---

#### Q5

Thread-safe pool bottleneck:

```cpp
class ThreadSafePool {
    MemoryPool<Object> pool_;
    std::mutex mutex_;

public:
    Object* allocate() {
        std::lock_guard<std::mutex> lock(mutex_);
        return pool_.allocate();
    }
};

// 4 threads, each allocates 100K objects
// Pool size: 400K
// What's the bottleneck?
```

**Answer:**

**Bottleneck:** Lock contention - threads serialize at the mutex.

**Explanation:**

Even though pool has enough capacity (400K for 4×100K), threads must wait for each other:

```
Thread 1: [allocating....] (holds lock)
Thread 2: [waiting......] (blocked on mutex)
Thread 3: [waiting......] (blocked)
Thread 4: [waiting......] (blocked)

Only 1 thread makes progress at a time!
```

**Performance Impact:**
- Theoretical: 4 threads = 4× speedup
- Actual: 4 threads = 1.2× speedup (lock overhead)

**Solution:** Use thread-local pools:

```cpp
thread_local MemoryPool<Object> pool(100000);

Object* allocate() {
    return pool.allocate();  // No lock!
}
```

**Key Concept:** Shared mutable state is a scalability bottleneck.

---
