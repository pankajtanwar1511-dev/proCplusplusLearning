## TOPIC: STL Container Thread Safety - Concurrent Access Rules and Patterns

### INTERVIEW_QA: Comprehensive Questions with Detailed Answers

#### Q1: Are STL containers thread-safe?
**Difficulty:** #beginner
**Category:** #concurrency #stl
**Concepts:** #thread_safety #data_race #containers #standard_guarantee

**Answer:**
STL containers provide minimal thread safety: concurrent reads on const-qualified containers are safe, but any write or concurrent read+write requires external synchronization.

**Code example:**
```cpp
const std::vector<int> vec = {1, 2, 3};

// ✅ Safe - concurrent reads
void reader1() { int x = vec[0]; }
void reader2() { int y = vec[1]; }

// ❌ Unsafe - concurrent write + read
std::vector<int> vec2 = {1, 2, 3};
void writer() { vec2.push_back(4); }
void reader3() { int z = vec2[2]; }  // DATA RACE
```

**Explanation:**
The C++ standard (§23.2.2) guarantees thread safety only for simultaneous const-qualified reads. Any modification requires exclusive access through mutexes, locks, or other synchronization. This applies to all standard containers: vector, map, unordered_map, list, deque, etc. Non-const access may modify internal state (e.g., iterator invalidation tracking in debug builds), so even "read-only" operations on non-const containers aren't guaranteed thread-safe.

**Key takeaway:** STL containers are not thread-safe for writes; always synchronize writes and any access concurrent with writes.

---

#### Q2: Why is std::unordered_map more dangerous than std::map for concurrent access?
**Difficulty:** #intermediate
**Category:** #concurrency #stl #data_structures
**Concepts:** #hash_table #rehashing #iterator_invalidation #load_factor

**Answer:**
`std::unordered_map` uses hash table with rehashing that invalidates ALL iterators when load factor is exceeded. `std::map` uses red-black tree with localized rebalancing affecting only modified paths.

**Code example:**
```cpp
std::unordered_map<int, string> umap;
// No reserve() - dangerous!

// Thread 1
umap[50] = "data";  // May trigger rehashing

// Thread 2
auto it = umap.find(25);  // ❌ Invalidated if Thread 1 rehashed
```

**Explanation:**
Hash tables maintain a load factor (elements / buckets, typically max 1.0). When exceeded, the table reallocates a larger bucket array and rehashes **all elements**, moving them to new positions and invalidating every iterator. In `std::map`, insertion only affects nodes along the insertion path through tree rebalancing, not the entire structure. While both require synchronization for thread safety, `unordered_map`'s global rehashing makes unsynchronized concurrent access more likely to cause catastrophic failures.

**Solution:**
```cpp
umap.reserve(1000);  // Pre-allocate to prevent rehashing
```

**Key takeaway:** `std::map` has localized modifications; `std::unordered_map` has global rehashing. Always `reserve()` unordered_map capacity before concurrent access.

---

#### Q3: What happens if two threads call push_back on std::vector simultaneously?
**Difficulty:** #beginner
**Category:** #concurrency #undefined_behavior
**Concepts:** #data_race #vector #reallocation #lost_writes

**Answer:**
Data race leading to undefined behavior: lost writes, memory corruption, or crash during reallocation.

**Code example:**
```cpp
std::vector<int> vec;

// Thread 1: push_back(10)
// 1. Read size = 5
// 2. Check capacity = 8
// 3. Write vec[5] = 10
// 4. Set size = 6

// Thread 2: push_back(20)
// 1. Read size = 5 (same!)
// 2. Check capacity = 8
// 3. Write vec[5] = 20
// 4. Set size = 6 (same!)

// Result: One write lost, size=6 but should be 7
```

**Explanation:**
`push_back` is not atomic. It involves multiple operations: read size, check capacity, possibly reallocate, write element, update size. Without synchronization, these operations can interleave arbitrarily. Common failure modes: (1) Lost writes - both threads read same size, write to same position, one overwrites the other. (2) Reallocation race - T1 reallocates new buffer, T2 still writes to old buffer → write lost or segfault when old buffer freed. (3) Corrupt size - both increment size independently, resulting size too small.

**Key takeaway:** `push_back` requires exclusive access; protect with mutex or use thread-local vectors with periodic merging.

---

#### Q4: Why is operator[] on std::map not const?
**Difficulty:** #intermediate
**Category:** #stl #const_correctness
**Concepts:** #operator_overload #map #side_effects #const_qualifier

**Answer:**
`operator[]` inserts a default-constructed value if the key doesn't exist, making it a write operation that cannot be const.

**Code example:**
```cpp
std::map<int, std::string> map = {{1, "one"}};

map[1];   // OK - returns "one"
map[2];   // Inserts {2, ""} and returns reference to it!

const std::map<int, std::string> const_map = {{1, "one"}};
// const_map[1];  // ❌ COMPILATION ERROR - operator[] is non-const

// ✅ Use at() for const access (throws if key missing)
std::string val = const_map.at(1);

// ✅ Or use find() (returns iterator)
auto it = const_map.find(1);
if (it != const_map.end()) {
    std::string val = it->second;
}
```

**Explanation:**
`operator[]` is designed for convenient insert-or-update: `map[key] = value` either updates existing key or inserts new one. This requires the ability to modify the map. For read-only access, use `at()` (throws `std::out_of_range` if key missing) or `find()` (returns `end()` iterator if missing). This design has implications for multithreading: you cannot use `operator[]` for "read-only" access even with synchronization, as it may insert elements unexpectedly.

**Key takeaway:** `operator[]` modifies the container; use `at()` or `find()` for read-only access, especially in concurrent code.

---

#### Q5: What is the load factor of std::unordered_map and why does it matter for threading?
**Difficulty:** #intermediate
**Category:** #stl #performance
**Concepts:** #hash_table #load_factor #rehashing #capacity_management

**Answer:**
Load factor is the ratio of elements to buckets (typically max 1.0 by default). Exceeding it triggers rehashing, invalidating all iterators across all threads.

**Code example:**
```cpp
std::unordered_map<int, int> map;
std::cout << "Max load factor: " << map.max_load_factor() << "\n";  // Usually 1.0
std::cout << "Current load: " << map.load_factor() << "\n";  // elements / buckets

map.reserve(100);  // Pre-allocate to prevent rehashing
std::cout << "Bucket count: " << map.bucket_count() << "\n";  // At least 100

// Insert 100 elements - no rehashing
for (int i = 0; i < 100; ++i) {
    map[i] = i * 2;
}

// Insert 101st element - may trigger rehashing if bucket_count * max_load_factor < 101
map[100] = 200;
```

**Explanation:**
Hash tables balance space efficiency (few empty buckets) with performance (few collisions). The load factor threshold determines when to rehash. When `elements / buckets > max_load_factor`, the table allocates a new, larger bucket array (~2x size), rehashes all elements, and deallocates the old array. This operation invalidates **every iterator** in the container. In multithreaded code, if one thread triggers rehashing, all other threads' iterators become dangling, causing crashes or corruption. Using `reserve(expected_size)` pre-allocates sufficient buckets to avoid rehashing.

**Key takeaway:** Call `reserve()` on `unordered_map` before concurrent use to prevent rehashing; understand that load factor exceedance invalidates all iterators globally.

---

#### Q6: Can you safely read different elements of std::vector from different threads?
**Difficulty:** #beginner
**Category:** #concurrency #stl
**Concepts:** #vector #concurrent_reads #const_correctness #thread_safety

**Answer:**
Yes, if the vector is const-qualified and no thread is modifying it. Reading different elements doesn't cause data races.

**Code example:**
```cpp
const std::vector<int> vec = {1, 2, 3, 4, 5};

// ✅ Safe - const vector, concurrent reads of different elements
void thread1() { int x = vec[0]; }
void thread2() { int y = vec[1]; }
void thread3() { int z = vec[2]; }

// ❌ Unsafe if vector is non-const and another thread modifies
std::vector<int> vec2 = {1, 2, 3, 4, 5};
void reader() { int x = vec2[0]; }
void writer() { vec2.push_back(6); }  // DATA RACE with reader
```

**Explanation:**
The C++ standard guarantees thread safety for concurrent const-qualified reads. Reading `vec[0]` and `vec[1]` simultaneously doesn't cause data races because they access different memory locations and no writes occur. However, if any thread modifies the vector (even resizing without writing to existing elements), all concurrent reads become data races due to potential reallocation invalidating pointers, iterators, and references.

**Key takeaway:** Concurrent reads on const containers are safe; any modification makes all concurrent access unsafe without synchronization.

---

#### Q7: What is the danger of using std::vector<bool> in multithreaded code?
**Difficulty:** #advanced
**Category:** #concurrency #stl #undefined_behavior
**Concepts:** #vector_bool #specialization #false_sharing #bit_packing

**Answer:**
`std::vector<bool>` packs bits, so modifying "different" elements may modify the same underlying byte, causing data races even when indices differ.

**Code example:**
```cpp
std::vector<bool> flags(1000);

// Thread 1
flags[0] = true;  // Modifies byte 0, bit 0

// Thread 2
flags[1] = true;  // ❌ Modifies byte 0, bit 1 - DATA RACE!
```

**Explanation:**
`std::vector<bool>` is a space-optimized specialization that packs 8 bools per byte. Modifying `flags[0]` requires: (1) read byte 0, (2) set bit 0, (3) write byte 0. Modifying `flags[1]` does the same for bit 1 of byte 0. These read-modify-write operations on the same byte are not atomic, causing a data race at the hardware level. This violates the expectation that modifying different vector elements is safe.

**Solutions:**
```cpp
// Option 1: Use vector<char> (each element is separate byte)
std::vector<char> flags(1000);  // No bit-packing

// Option 2: Use vector<atomic<bool>> (if lock-free)
std::vector<std::atomic<bool>> flags(1000);

// Option 3: External synchronization (mutex per group)
```

**Key takeaway:** `std::vector<bool>` is NOT safe for concurrent access to different elements; use `std::vector<char>` or synchronization.

---

#### Q8: How do you safely iterate over a container while another thread modifies it?
**Difficulty:** #intermediate
**Category:** #concurrency #design_pattern
**Concepts:** #iteration #concurrent_modification #synchronization_strategies

**Answer:**
You can't safely iterate without synchronization. Solutions: (1) Lock entire iteration, (2) Copy container for iteration, (3) Use concurrent data structure.

**Code example:**
```cpp
std::map<int, std::string> config;
std::shared_mutex mtx;

// ❌ Unsafe - iteration and modification concurrent
void reader() {
    for (const auto& pair : config) { /* use pair */ }
}
void writer() {
    config[10] = "new";  // DATA RACE
}

// ✅ Solution 1: Lock entire iteration
void safe_reader_v1() {
    std::shared_lock lock(mtx);  // Shared lock
    for (const auto& pair : config) { /* use pair */ }
}
void safe_writer_v1() {
    std::unique_lock lock(mtx);  // Exclusive lock
    config[10] = "new";
}

// ✅ Solution 2: Copy for iteration (if practical)
void safe_reader_v2() {
    std::map<int, std::string> local_copy;
    {
        std::shared_lock lock(mtx);
        local_copy = config;  // Copy under lock
    }
    // Iterate without lock
    for (const auto& pair : local_copy) { /* use pair */ }
}

// ✅ Solution 3: Use TBB concurrent_hash_map (external library)
// tbb::concurrent_hash_map<int, std::string> config;
// Supports concurrent iteration and modification
```

**Explanation:**
Concurrent modification during iteration causes undefined behavior for all standard containers. Even `std::map`, which doesn't invalidate iterators to existing elements during single-threaded insertion, becomes unsafe under concurrent access due to data races in tree structure updates. The best solution depends on use case: lock entire iteration if quick (few elements), copy container if iteration is long and copying is cheap, or use specialized concurrent containers like Intel TBB's `concurrent_hash_map`.

**Key takeaway:** Never iterate over STL containers concurrently with modifications without synchronization; lock iteration or copy container.

---

#### Q9: What is the difference between reserve() and resize() on std::vector regarding thread safety?
**Difficulty:** #intermediate
**Category:** #stl #capacity_management
**Concepts:** #reserve #resize #capacity #size #preallocation

**Answer:**
`reserve()` pre-allocates capacity without changing size, preventing reallocation. `resize()` changes both size and capacity, modifying the container. Only `reserve()` is useful for preemptive thread safety.

**Code example:**
```cpp
std::vector<int> vec1;
vec1.reserve(100);  // Capacity = 100, size = 0
// ✅ Subsequent push_back (up to 100) won't reallocate

std::vector<int> vec2;
vec2.resize(100);   // Capacity = 100, size = 100 (default-initialized)
// vec2 now contains 100 elements (all zeros for int)

// For concurrent writes to different indices:
vec2[0] = 1;  // Thread 1
vec2[1] = 2;  // Thread 2
// ✅ Safe - writing to different elements, no reallocation
```

**Explanation:**
`reserve(n)` allocates memory for `n` elements but leaves size at 0. This prevents `push_back` from reallocating until size exceeds `n`. `resize(n)` sets size to `n`, constructing elements if needed and reallocating if capacity insufficient. For thread safety, `reserve()` is useful when multiple threads will `push_back` concurrently (though still needs locking). `resize()` is useful when you know the exact final size and threads will write to specific indices (e.g., parallel initialization of array).

**Pattern for concurrent indexed writes:**
```cpp
std::vector<int> results(1000);  // resize to 1000 elements

// Each thread writes to disjoint indices - safe
auto worker = [&](int start, int end) {
    for (int i = start; i < end; ++i) {
        results[i] = compute(i);
    }
};

std::thread t1(worker, 0, 500);
std::thread t2(worker, 500, 1000);
```

**Key takeaway:** `reserve()` prevents reallocation for `push_back`; `resize()` sets size for indexed access. Use `resize()` for safe concurrent writes to different indices.

---

#### Q10: Why was copy-on-write banned for std::string in C++11?
**Difficulty:** #advanced
**Category:** #stl #historical #concurrency
**Concepts:** #copy_on_write #reference_counting #C++11 #thread_safety

**Answer:**
Copy-on-write (COW) strings used reference counting where even read operations modified counts, causing data races in multithreaded code. C++11 required const string access to be thread-safe, banning COW.

**Code example (pre-C++11 conceptual):**
```cpp
// Pre-C++11 COW string (conceptual)
class COWString {
    char* data;
    int* ref_count;  // Shared between copies

    char operator[](int i) const {
        // ❌ Even const access modifies ref_count!
        ++(*ref_count);  // Increment for shared access
        char c = data[i];
        --(*ref_count);  // Decrement after access
        return c;
    }
};

// Thread 1
const COWString str = "hello";
char c1 = str[0];  // Increments ref_count

// Thread 2
char c2 = str[1];  // ❌ DATA RACE on ref_count increment/decrement
```

**Explanation:**
Pre-C++11 `std::string` implementations (e.g., GCC 4.x libstdc++) used copy-on-write for efficiency: copies shared the same buffer with a reference count, only duplicating on modification. However, even read operations (`operator[]`, `c_str()`) needed to increment/decrement reference counts to track usage, making even const operations non-thread-safe. C++11 standardized that const-qualified container access must be thread-safe, forcing implementations to abandon COW in favor of eager copying or Small String Optimization (SSO).

**Modern C++11+ guarantees:**
```cpp
const std::string str = "hello";

// Thread 1
char c1 = str[0];  // ✅ Safe - no shared mutable state

// Thread 2
char c2 = str[1];  // ✅ Safe - const access is thread-safe
```

**Key takeaway:** C++11 banned COW strings to guarantee thread-safe const access; modern implementations use eager copying or SSO without shared mutable state.

---

#### Q11: What is the best practice for accumulating results from multiple threads into a single vector?
**Difficulty:** #intermediate
**Category:** #design_pattern #performance
**Concepts:** #thread_local #batching #lock_contention #merge_pattern

**Answer:**
Use thread-local vectors for accumulation, then merge into shared vector with single lock per thread, minimizing contention.

**Code example:**
```cpp
#include <vector>
#include <thread>
#include <mutex>

// ❌ Poor: Lock on every push_back
void poor_approach(std::vector<int>& results, std::mutex& mtx, int start, int end) {
    for (int i = start; i < end; ++i) {
        std::lock_guard lock(mtx);  // Lock for every element!
        results.push_back(compute(i));
    }
}

// ✅ Good: Thread-local accumulation, single merge
void good_approach(std::vector<int>& results, std::mutex& mtx, int start, int end) {
    std::vector<int> local_results;
    local_results.reserve(end - start);

    // Accumulate locally - no locking
    for (int i = start; i < end; ++i) {
        local_results.push_back(compute(i));
    }

    // Single lock for batch merge
    std::lock_guard lock(mtx);
    results.insert(results.end(), local_results.begin(), local_results.end());
}

void demonstrate() {
    std::vector<int> results;
    results.reserve(1000);
    std::mutex mtx;

    std::thread t1(good_approach, std::ref(results), std::ref(mtx), 0, 500);
    std::thread t2(good_approach, std::ref(results), std::ref(mtx), 500, 1000);

    t1.join();
    t2.join();
}
```

**Explanation:**
Locking on every `push_back` causes severe lock contention: each thread must acquire/release mutex thousands of times. Thread-local accumulation allows each thread to work independently without contention, then merge results in bulk with a single lock. This reduces lock acquisitions from N (number of elements) to T (number of threads), dramatically improving performance. In autonomous vehicle perception, this pattern is used when multiple threads process point cloud segments and merge results into a global obstacle list.

**Performance impact:**
- Poor approach: N * (lock_cost + push_back_cost)
- Good approach: N * push_back_cost + T * (lock_cost + merge_cost)
- Typical speedup: 10-100x for lock-heavy workloads

**Key takeaway:** Minimize lock contention by batching operations; use thread-local accumulation with single merge per thread.

---

#### Q12: How do concurrent data structure libraries (like Intel TBB) achieve thread safety?
**Difficulty:** #advanced
**Category:** #lock_free #concurrent_data_structures
**Concepts:** #TBB #fine_grained_locking #lock_free #concurrent_containers

**Answer:**
Concurrent data structures use fine-grained locking (lock per bucket/node) or lock-free algorithms (CAS operations) to allow concurrent access without global locks.

**Code example (conceptual):**
```cpp
// Standard unordered_map: Single global lock
class StandardMap {
    std::unordered_map<K, V> map;
    std::mutex global_lock;  // ❌ All threads contend on this

    void insert(K key, V value) {
        std::lock_guard lock(global_lock);
        map[key] = value;
    }
};

// TBB concurrent_hash_map: Lock per bucket
class ConcurrentMap {
    Bucket buckets[N];  // Array of buckets
    std::mutex locks[N];  // Lock per bucket

    void insert(K key, V value) {
        size_t bucket_idx = hash(key) % N;
        std::lock_guard lock(locks[bucket_idx]);  // ✅ Lock only this bucket
        buckets[bucket_idx].insert(key, value);
    }
    // Threads modifying different buckets don't contend!
};

// Lock-free variant: Use atomic CAS on bucket heads
class LockFreeMap {
    std::atomic<Node*> bucket_heads[N];

    void insert(K key, V value) {
        size_t bucket_idx = hash(key) % N;
        Node* new_node = new Node{key, value, nullptr};

        Node* old_head = bucket_heads[bucket_idx].load();
        do {
            new_node->next = old_head;
        } while (!bucket_heads[bucket_idx].compare_exchange_weak(old_head, new_node));
        // ✅ No locks - uses CAS retry loop
    }
};
```

**Explanation:**
Standard containers use a single mutex protecting the entire container, causing all threads to serialize. Concurrent containers reduce contention by: (1) **Fine-grained locking**: Divide container into segments (buckets in hash table, levels in tree), each with its own lock. Threads operating on different segments don't contend. (2) **Lock-free algorithms**: Use atomic compare-and-swap (CAS) operations instead of locks, allowing multiple threads to progress without blocking. (3) **Read-optimized structures**: Separate read and write paths, allowing multiple readers without locking (e.g., using RCU - Read-Copy-Update).

**Intel TBB concurrent_hash_map features:**
- Allows concurrent inserts, lookups, and erasures
- Uses fine-grained locking per hash bucket
- Provides `const_accessor` (reader lock) and `accessor` (writer lock)
- Automatically handles rehashing concurrently

**Key takeaway:** Concurrent data structures use fine-grained locking or lock-free algorithms to reduce contention; consider TBB, Folly, or Abseil for production concurrent containers.

---

#### Q13: What is the C++ standard guarantee for concurrent reads on const-qualified containers?
**Difficulty:** #beginner
**Category:** #standard #thread_safety
**Concepts:** #C++11_standard #const_correctness #concurrent_reads #standard_guarantee

**Answer:**
The C++ standard (§23.2.2 since C++11) guarantees that multiple threads can simultaneously read from the same const-qualified container without synchronization.

**Code example:**
```cpp
const std::vector<int> vec = {1, 2, 3, 4, 5};

// ✅ Guaranteed safe by C++11 standard
void thread1() { int x = vec[0]; }
void thread2() { int y = vec[1]; }
void thread3() { int z = vec[2]; }

// All three threads can read concurrently - no data race
```

**Explanation:**
Before C++11, the standard made no guarantees about thread safety, even for reads. C++11 introduced a formal memory model and specified that const-qualified container access is data-race-free. This guarantee required implementations to eliminate shared mutable state in read operations, leading to the ban on copy-on-write strings (which modified reference counts during reads). The guarantee applies to all standard containers: vector, map, unordered_map, list, deque, etc.

**Important caveats:**
1. Container must be const-qualified (const or passed by const reference)
2. No thread may be modifying the container
3. Guarantee applies to container operations, not to contained objects (e.g., if elements are pointers, dereferencing requires separate synchronization)

**Key takeaway:** C++11 guarantees thread-safe concurrent reads on const containers; this is a formal standard requirement, not implementation-dependent.

---

#### Q14: When should you use std::shared_mutex instead of std::mutex for container access?
**Difficulty:** #intermediate
**Category:** #synchronization #performance
**Concepts:** #shared_mutex #reader_writer_lock #read_heavy_workload #lock_contention

**Answer:**
Use `std::shared_mutex` for read-heavy workloads (10:1 or higher read:write ratio) where multiple concurrent readers benefit from shared access, while writers still get exclusive access.

**Code example:**
```cpp
class SensorConfig {
    std::map<int, std::string> config;
    mutable std::shared_mutex mtx;  // Reader-writer lock

public:
    // Writer: Exclusive lock (blocks all readers and writers)
    void update(int id, const std::string& value) {
        std::unique_lock lock(mtx);
        config[id] = value;
    }

    // Reader: Shared lock (multiple readers allowed, blocks writers)
    std::string get(int id) const {
        std::shared_lock lock(mtx);
        auto it = config.find(id);
        return (it != config.end()) ? it->second : "";
    }
};

// Workload: 95% reads, 5% writes
// Without shared_mutex: All operations serialize
// With shared_mutex: 19 readers can execute concurrently while 1 writer waits
```

**Explanation:**
`std::mutex` provides exclusive access: only one thread can hold the lock. `std::shared_mutex` (C++17) provides two lock modes: **shared** (multiple threads can hold simultaneously for reading) and **unique** (exclusive access for writing). This improves throughput for read-heavy workloads by allowing concurrent reads. However, shared_mutex has higher overhead than mutex (~20-30% slower for exclusive access), so only use it when reads significantly outnumber writes.

**When NOT to use shared_mutex:**
- Write-heavy workloads (50%+ writes): overhead not justified
- Very short critical sections (microseconds): mutex overhead dominates anyway
- Single-threaded or low-contention scenarios: no benefit

**Autonomous vehicle example:**
- ✅ Good: Sensor configuration (read every frame, updated rarely)
- ✅ Good: Map data (read by all sensors, updated occasionally)
- ❌ Bad: Real-time sensor readings (high write rate)

**Key takeaway:** Use `std::shared_mutex` for read-heavy workloads (10:1 or better) to allow concurrent reads; stick with `std::mutex` for write-heavy or balanced workloads.

---

#### Q15: What happens if you call reserve() on std::unordered_map with an insufficient size?
**Difficulty:** #intermediate
**Category:** #stl #capacity_management
**Concepts:** #reserve #rehashing #capacity_planning #load_factor

**Answer:**
If you insert more elements than reserved capacity, the map will rehash automatically, invalidating all iterators and potentially causing data races if concurrent access occurs.

**Code example:**
```cpp
std::unordered_map<int, int> map;
map.reserve(50);  // Reserves capacity for ~50 elements

std::cout << "Bucket count: " << map.bucket_count() << "\n";  // ~50
std::cout << "Max load factor: " << map.max_load_factor() << "\n";  // 1.0

// Insert 50 elements - no rehashing
for (int i = 0; i < 50; ++i) {
    map[i] = i * 2;
}

std::cout << "After 50 inserts - Bucket count: " << map.bucket_count() << "\n";  // Still ~50

// Insert 51st element - may trigger rehashing!
map[50] = 100;
std::cout << "After 51st insert - Bucket count: " << map.bucket_count() << "\n";  // ~100 (rehashed!)

// ❌ In concurrent context: any iterator obtained before rehashing is now invalid
```

**Explanation:**
`reserve(n)` calculates bucket count as `n / max_load_factor` (typically `n / 1.0 = n`) and allocates that many buckets. However, `reserve()` is a hint, not a guarantee. Some implementations round up to the next prime number or power of 2. Once the actual element count exceeds `bucket_count * max_load_factor`, rehashing occurs. To be safe, over-allocate: `reserve(expected_size * 1.5)`.

**Thread safety implications:**
```cpp
// Thread 1: Holds iterator
auto it = map.find(25);

// Thread 2: Inserts 51st element, triggers rehashing
map[50] = 100;  // Invalidates it in Thread 1

// Thread 1: Uses iterator
std::cout << it->second;  // ❌ DANGLING ITERATOR - crash!
```

**Best practices:**
```cpp
// Over-allocate to be safe
map.reserve(expected_size * 2);

// Or check and prevent rehashing
if (map.size() >= map.bucket_count() * map.max_load_factor() - 5) {
    map.reserve(map.bucket_count() * 2);  // Pre-emptive rehash
}
```

**Key takeaway:** `reserve()` is a hint, not a guarantee; over-allocate (1.5-2x expected size) to prevent rehashing; insufficient reservation causes rehashing and iterator invalidation.

---
