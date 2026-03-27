## TOPIC: STL Container Thread Safety - Concurrent Access Rules and Patterns

### PRACTICE_TASKS: Output Prediction and Code Analysis

#### Q1
```cpp
#include <vector>
#include <thread>
#include <iostream>

std::vector<int> vec = {1, 2, 3};

void thread1() {
    vec.push_back(4);
}

void thread2() {
    vec.push_back(5);
}

int main() {
    std::thread t1(thread1);
    std::thread t2(thread2);
    t1.join();
    t2.join();
    std::cout << vec.size() << "\n";
    return 0;
}
```

**Answer:**
```
Undefined behavior (data race)
Possible: crash, corruption, wrong size
```

**Explanation:**
- **std::vector is NOT thread-safe** for concurrent modifications
- push_back modifies internal state (size, capacity, data pointer)
- Both threads modify vec simultaneously
- **Data race on:** size increment, capacity check, memory allocation
- **Possible outcomes:**
  - Crash during reallocation
  - Lost updates (one push_back lost)
  - Corrupted vector state
  - Wrong size (e.g., 4 instead of 5)
- **Fix:** Protect with std::mutex
- **STL guarantee:** Only const operations are thread-safe
- **Key Concept:** STL containers require external synchronization for concurrent writes

---

#### Q2
```cpp
const std::map<int, std::string> config = {{1, "one"}, {2, "two"}};

void thread1() {
    std::string val = config[1];  // Compilation error?
    std::cout << val;
}
```

**Answer:**
```
Compilation error
```

**Explanation:**
- config is const std::map
- **operator[] is non-const** member function
- operator[] can insert if key doesn't exist
- Cannot call non-const function on const object
- **Compilation error:** "discards qualifiers"
- **Should use:** config.at(1) or config.find(1)
- **at() is const-qualified:** Safe for const map
- **find() is const-qualified:** Returns const_iterator
- **Design reason:** operator[] modifies map if key missing
- **Key Concept:** operator[] is non-const; use at() or find() for const maps

---

#### Q3
```cpp
std::unordered_map<int, int> map;

void thread1() {
    for (int i = 0; i < 100; ++i) {
        map[i] = i * 2;
    }
}

void thread2() {
    for (const auto& pair : map) {
        std::cout << pair.first << ": " << pair.second << "\n";
    }
}
```

**Answer:**
```
Undefined behavior (data race + iterator invalidation)
```

**Explanation:**
- thread1 modifies map (inserts elements)
- thread2 iterates map simultaneously
- **Data race:** Concurrent read-write without synchronization
- **Iterator invalidation:** Insertions invalidate iterators
- **Possible outcomes:**
  - Crash during iteration
  - Infinite loop
  - Partial/inconsistent output
  - Accessing deleted memory
- **Hash table structure modified** during iteration
- **Bucket rehashing** can occur during insertions
- **Fix:** Use std::shared_mutex (read-write lock)
  - Exclusive lock for writes
  - Shared lock for reads
- **Key Concept:** Concurrent read-write requires synchronization; insertions invalidate iterators

---

#### Q4
```cpp
std::vector<bool> flags(10);

void thread1() { flags[0] = true; }
void thread2() { flags[1] = true; }
```

**Answer:**
```
Undefined behavior (data race)
```

**Explanation:**
- **std::vector<bool> is specialized:** Packs bits, not bool array
- Each element is a bit, not a byte
- flags[0] and flags[1] might be in **same byte**
- **Read-modify-write operation:**
  - Read byte
  - Modify bit
  - Write byte back
- **Race on same byte:** Both threads modify same storage
- **Data race even though different indices**
- **Classic C++ trap:** vector<bool> is not really a container
- **Fix 1:** Use std::vector<char> or std::vector<int>
- **Fix 2:** Use std::array<std::atomic<bool>, 10>
- **Fix 3:** Protect with mutex
- **Key Concept:** vector<bool> specialization causes false sharing; use different type or synchronization

---

#### Q5
```cpp
std::vector<int> vec = {1, 2, 3, 4, 5};

void thread1() {
    auto it = vec.begin();
    std::this_thread::sleep_for(std::chrono::milliseconds(10));
    std::cout << *it;
}

void thread2() {
    vec.push_back(6);
}
```

**Answer:**
```
Undefined behavior (iterator invalidation)
```

**Explanation:**
- thread1 gets iterator to vec.begin()
- thread1 sleeps (giving thread2 time to run)
- **thread2 calls push_back:**
  - May cause reallocation
  - Old memory freed
  - Iterator points to freed memory
- thread1 wakes, dereferences invalid iterator
- **Crash or garbage output**
- **Iterator invalidation rules:**
  - push_back invalidates all iterators if reallocation occurs
  - capacity() == size() before push_back → guaranteed reallocation
- **Even without reallocation:** Data race on concurrent read/write
- **Fix:** Synchronize access with mutex
- **Key Concept:** Iterator invalidation from reallocation; concurrent access requires synchronization

---

#### Q6
```cpp
std::unordered_map<int, int> map;
map.reserve(100);

void thread1() {
    for (int i = 0; i < 100; ++i) {
        map[i] = i * 2;
    }
}

void thread2() {
    for (int i = 100; i < 200; ++i) {
        map[i] = i * 2;
    }
}
```

**Answer:**
```
Undefined behavior (data race)
reserve() doesn't help
```

**Explanation:**
- reserve(100) pre-allocates bucket array
- **Does NOT prevent data races**
- Both threads modify map simultaneously
- **Data race on:**
  - Size counter
  - Bucket assignments
  - Load factor calculation
  - Internal pointers
- **Different keys doesn't matter** - shared state modified
- reserve() only reduces reallocations, doesn't add thread-safety
- **Still need synchronization** even with reserve()
- **Fix:** Protect all map operations with mutex
- **Key Concept:** reserve() is optimization, not thread-safety; concurrent modifications always require synchronization

---

#### Q7
```cpp
const std::vector<int> vec = {1, 2, 3, 4, 5};

void reader1() { int x = vec[0]; }
void reader2() { int y = vec[1]; }
void reader3() { int z = vec[2]; }
```

**Answer:**
```
Safe - concurrent reads of const container allowed
```

**Explanation:**
- vec is const std::vector
- **All operations are reads**
- No modifications to container
- **STL guarantee:** Concurrent const operations are thread-safe
- **Accessing different elements:** No false sharing (ints are separate)
- No synchronization needed
- **Multiple readers:** Always safe for const containers
- **Important:** Only works because vec is const and never modified
- **If vec modified elsewhere:** Would need synchronization
- **Key Concept:** Concurrent const reads are thread-safe; const operations don't require synchronization

---

#### Q8
```cpp
std::map<int, int> map;
std::mutex mtx;

void insert(int key, int value) {
    std::lock_guard lock(mtx);
    map[key] = value;
}

void find(int key) {
    std::lock_guard lock(mtx);
    auto it = map.find(key);
    if (it != map.end()) {
        std::cout << it->second;
    }
}
```

**Answer:**
```
Thread-safe but suboptimal
Improvement: Use std::shared_mutex for read-write lock
```

**Explanation:**
- **Currently thread-safe:** All map access protected by mutex
- insert() exclusive access
- find() exclusive access (even though it's read-only)
- **Performance issue:** Readers block each other unnecessarily
- **Improvement:** Use std::shared_mutex
  ```cpp
  std::shared_mutex mtx;

  void insert(int key, int value) {
      std::unique_lock lock(mtx);  // Exclusive
      map[key] = value;
  }

  void find(int key) {
      std::shared_lock lock(mtx);  // Shared
      // ... find logic
  }
  ```
- **Benefits:** Multiple concurrent readers
- **Pattern:** Readers-writer lock for read-heavy workloads
- **Key Concept:** Thread-safe but can optimize with shared_mutex for concurrent reads

---

#### Q9
```cpp
std::vector<int> results;

void compute_worker(int start, int end) {
    for (int i = start; i < end; ++i) {
        results.push_back(i * i);  // No lock
    }
}

// Multiple threads call compute_worker concurrently
```

**Answer:**
```
Undefined behavior (data race)
Multiple threads modify shared vector
```

**Explanation:**
- Multiple threads call push_back on same vector
- **Data race on vector's internal state:**
  - Size counter
  - Capacity checks
  - Memory allocations
  - Data pointer updates
- **Possible outcomes:**
  - Crash
  - Lost updates
  - Corrupted vector
  - Wrong results
- **Fix 1:** Lock before each push_back (slow)
  ```cpp
  std::mutex mtx;
  std::lock_guard lock(mtx);
  results.push_back(i * i);
  ```
- **Fix 2:** Local vectors + merge (better)
  ```cpp
  std::vector<int> local_results;
  // ... fill local_results ...
  std::lock_guard lock(mtx);
  results.insert(results.end(), local_results.begin(), local_results.end());
  ```
- **Fix 3:** Pre-allocate and assign to indices
- **Key Concept:** Shared container modification requires synchronization; minimize lock contention with local buffers

---

#### Q10
```cpp
std::unordered_map<int, int> map;

void thread1() {
    map[1] = 10;
}

void thread2() {
    auto it = map.find(1);
    if (it != map.end()) {
        std::cout << it->second;
    }
}
```

**Answer:**
```
Undefined behavior (data race)
```

**Explanation:**
- thread1 writes to map (inserts/modifies)
- thread2 reads from map (find operation)
- **Concurrent read-write without synchronization:** Data race
- **operator[] can insert:** If key doesn't exist
- **find() accesses internal structure**
- **Possible outcomes:**
  - Crash during find()
  - Inconsistent state
  - Iterator to corrupted data
  - Accessing deallocated memory
- **Even reading while writing is UB** without synchronization
- **Not just about element:** Hash table structure accessed
- **Fix:** Protect both operations with mutex
  ```cpp
  std::mutex mtx;
  // Both threads lock mtx before accessing map
  ```
- **Key Concept:** Concurrent read-write is data race; even non-modifying operations require synchronization during writes

---
