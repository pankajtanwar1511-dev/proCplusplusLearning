### PRACTICE_TASKS: Output Prediction and Code Analysis
#### Q1
Identify the bug in this object pool:
```cpp
template <typename T, size_t N>
class ObjectPool {
    T* storage;
    std::vector<T*> freeList;

public:
    ObjectPool() : storage(new T[N]) {
        for (size_t i = 0; i < N; ++i) {
            freeList.push_back(storage[i]);  // Bug!
        }
    }
};
```

#### Q2
What's wrong with this thread-safe pool?
```cpp
class ThreadSafePool {
    std::mutex mtx;
    std::vector<T*> freeList;

public:
    T* allocate() {
        std::lock_guard<std::mutex> lock(mtx);
        if (freeList.empty()) throw std::bad_alloc();
        T* obj = freeList.back();
        freeList.pop_back();
        return obj;
    }

    void deallocate(T* ptr) {
        freeList.push_back(ptr);  // Bug!
    }
};
```

#### Q3
Fix the double-free vulnerability:
```cpp
void deallocate(T* ptr) {
    freeList.push_back(ptr);
}

// User code
T* obj = pool.allocate();
pool.deallocate(obj);
pool.deallocate(obj);  // Corrupts pool!
```

#### Q4
Complete the index-based allocation:
```cpp
template <typename T, size_t N>
class IndexPool {
    T* storage;
    size_t freeList[N];
    size_t freeCount;

public:
    T* allocate() {
        // Your implementation
    }
};
```

#### Q5
Why does this pool leak memory?
```cpp
struct Resource {
    std::string data;
    std::vector<int> values;
};

class Pool {
    Resource* storage;

    void deallocate(Resource* obj) {
        freeList.push_back(obj);  // Leak!
    }
};
```

#### Q6
Implement chunk boundary checking:
```cpp
class ExpandablePool {
    std::vector<T*> chunks;
    static constexpr size_t CHUNK_SIZE = 100;

    void deallocate(T* ptr) {
        // Find owning chunk - implement this
    }
};
```

#### Q7
Add alignment validation:
```cpp
struct alignas(32) SIMDData {
    float values[8];
};

class Pool {
    SIMDData* allocate() {
        // Ensure returned pointer is 32-byte aligned
    }
};
```

#### Q8
What's the issue with this pool destructor?
```cpp
class Pool {
    T* storage;

public:
    ~Pool() {
        delete storage;  // Bug!
    }
};
```

#### Q9
Fix the race condition:
```cpp
class Pool {
    std::atomic<size_t> head{0};
    T* buffer[100];

    T* allocate() {
        size_t h = head.load();
        T* obj = buffer[h];
        head.store(h + 1);  // Race!
        return obj;
    }
};
```

#### Q10
Implement proper placement new lifecycle:
```cpp
class Pool {
    alignas(Resource) char storage[sizeof(Resource) * 100];

    Resource* allocate() {
        void* mem = getFreeSlot();
        // Construct Resource using placement new
    }

    void deallocate(Resource* obj) {
        // Properly destruct before returning to pool
    }
};
```

#### Q11
Calculate the correct global index:
```cpp
class ChunkedPool {
    std::vector<T*> chunks;
    static constexpr size_t CHUNK_SIZE = 100;

    size_t getGlobalIndex(T* ptr) {
        // Calculate global index from pointer
    }
};
```

#### Q12
Why doesn't this pool reuse memory?
```cpp
class Pool {
    T* storage;
    size_t nextIndex = 0;

    T* allocate() {
        return &storage[nextIndex++];  // Bug!
    }

    void deallocate(T* ptr) {
        // Nothing!
    }
};
```

#### Q13
Fix the false sharing issue:
```cpp
struct Counter {
    int value;  // 4 bytes
};

// Multiple threads allocate and modify Counters
// Performance degrades significantly - why?
```

#### Q14
Implement cache line alignment:
```cpp
template <typename T>
struct AlignedWrapper {
    // Ensure T is on its own cache line
};
```

#### Q15
Add statistics tracking:
```cpp
class MonitoredPool {
    // Track total allocations, deallocations, peak usage
    // Implement getStats() method
};
```

#### Q16
Fix the alignment bug:
```cpp
class Pool {
    char* storage = new char[sizeof(T) * 100];

    T* allocate() {
        return reinterpret_cast<T*>(storage);  // May be misaligned!
    }
};
```

#### Q17
Implement exhaustion handling:
```cpp
class Pool {
    T* allocate() {
        if (freeList.empty()) {
            // Implement 3 different strategies:
            // 1. Throw exception
            // 2. Return nullptr
            // 3. Allocate new chunk
        }
    }
};
```

#### Q18
Detect out-of-pool pointers:
```cpp
void deallocate(T* ptr) {
    // Validate ptr is from this pool before deallocating
}
```

#### Q19
Implement RAII pool handle:
```cpp
template <typename T>
class PoolHandle {
    // Automatically returns object to pool on destruction
};
```

#### Q20
Fix the memory leak on pool destruction:
```cpp
class Pool {
    T* storage;
    std::vector<T*> freeList;
    size_t capacity;

    ~Pool() {
        delete[] storage;
        // What if freeList.size() < capacity?
        // Some objects still allocated - leak!
    }
};
```

---
#### Q1
Identify the bug in this object pool:
```cpp
template <typename T, size_t N>
class ObjectPool {
    T* storage;
    std::vector<T*> freeList;

public:
    ObjectPool() : storage(new T[N]) {
        for (size_t i = 0; i < N; ++i) {
            freeList.push_back(storage[i]);  // Bug!
        }
    }
};
```

**Answer:**
```cpp
// Bug: storage[i] is a T&, but push_back expects T*
// Should be: freeList.push_back(&storage[i]);

template <typename T, size_t N>
class ObjectPool {
    T* storage;
    std::vector<T*> freeList;

public:
    ObjectPool() : storage(new T[N]) {
        for (size_t i = 0; i < N; ++i) {
            freeList.push_back(&storage[i]);  // Fixed: address-of operator
        }
    }

    ~ObjectPool() {
        delete[] storage;  // Use delete[] for array
    }

    T* allocate() {
        if (freeList.empty()) return nullptr;
        T* obj = freeList.back();
        freeList.pop_back();
        return obj;
    }

    void deallocate(T* ptr) {
        freeList.push_back(ptr);
    }
};
```

**Explanation:**
- **The bug - missing address-of operator:** `storage[i]` returns `T&` (reference to T), but `freeList` holds `T*` (pointers); type mismatch causes compilation error; need `&storage[i]` to get pointer
- **Why this compiles in some cases:** If T is small (like int), compiler might try implicit conversion; creates dangling references; would compile but have undefined behavior
- **Correct pattern:** `storage` is `T*` (pointer to array), `storage[i]` is `T&` (reference to i-th element), `&storage[i]` is `T*` (pointer to i-th element)
- **Pointer arithmetic alternative:** `freeList.push_back(storage + i);` also works; `storage + i` = pointer to i-th element; equivalent to `&storage[i]`
- **Array allocation:** Used `new T[N]` to allocate array; must use `delete[]` in destructor, not `delete`; common mistake to forget brackets
- **Pool initialization pattern:** Pre-populate free list with all slots; all objects ready to allocate; constant-time allocation (just pop from vector)
- **What would happen at runtime:** If code compiled, push_back would try to interpret `T&` as `T*`; stores garbage pointers in freeList; allocate() returns garbage; crash when dereferencing
- **Key Concept:** Array indexing returns reference, need address-of for pointer; storage[i] = T&, &storage[i] = T*; common object pool initialization error; always use delete[] for arrays allocated with new[]

---

#### Q2
What's wrong with this thread-safe pool?
```cpp
class ThreadSafePool {
    std::mutex mtx;
    std::vector<T*> freeList;

public:
    T* allocate() {
        std::lock_guard<std::mutex> lock(mtx);
        if (freeList.empty()) throw std::bad_alloc();
        T* obj = freeList.back();
        freeList.pop_back();
        return obj;
    }

    void deallocate(T* ptr) {
        freeList.push_back(ptr);  // Bug!
    }
};
```

**Answer:**
```cpp
// Bug: deallocate() doesn't lock the mutex - data race!

class ThreadSafePool {
    std::mutex mtx;
    std::vector<T*> freeList;

public:
    T* allocate() {
        std::lock_guard<std::mutex> lock(mtx);
        if (freeList.empty()) throw std::bad_alloc();
        T* obj = freeList.back();
        freeList.pop_back();
        return obj;
    }

    void deallocate(T* ptr) {
        std::lock_guard<std::mutex> lock(mtx);  // Fixed: lock mutex
        freeList.push_back(ptr);
    }
};

// Even better: Use RAII lock guard to ensure unlock
class ThreadSafePool {
    std::mutex mtx;
    std::vector<T*> freeList;

public:
    T* allocate() {
        std::lock_guard<std::mutex> lock(mtx);
        if (freeList.empty()) throw std::bad_alloc();
        T* obj = freeList.back();
        freeList.pop_back();
        return obj;
    }

    void deallocate(T* ptr) {
        if (!isValidPointer(ptr)) {
            throw std::invalid_argument("Invalid pointer");
        }
        
        std::lock_guard<std::mutex> lock(mtx);
        freeList.push_back(ptr);
    }

private:
    bool isValidPointer(T* ptr) const {
        // Validation logic
        return ptr != nullptr;
    }
};
```

**Explanation:**
- **The data race:** `allocate()` locks mutex, but `deallocate()` does NOT; both functions access `freeList`; concurrent access to `std::vector` without synchronization = **undefined behavior**
- **What can go wrong - concurrent push_back:** Thread 1: `allocate()` reads `freeList.size()`, Thread 2: `deallocate()` calls `push_back()` (modifies size), Thread 1: continues with invalid size; **crash or corruption**
- **Vector internal state corruption:** `std::vector` has size, capacity, data pointer; unsynchronized modifications corrupt these; might grow during push_back while another thread reads; **dangling pointers, crashes**
- **Why allocate() is protected but deallocate() isn't:** Likely oversight/mistake; common pattern in single-threaded code; easy to forget when converting to thread-safe; **all shared state access must be synchronized**
- **Lock granularity:** Lock held only during vector operations (good); released before returning object to user; user code runs without holding lock; avoids deadlock if user code allocates again
- **Alternative: Lock-free pool:** Use atomic operations and lock-free stack; more complex but higher performance; suitable for high-contention scenarios; requires careful implementation
- **Performance consideration:** Mutex contention on every allocate/deallocate; can become bottleneck in highly concurrent programs; alternatives: thread-local pools, per-thread caches, lock-free structures
- **Key Concept:** All accesses to shared state must be synchronized; forgetting to lock one function creates data race; std::vector is not thread-safe; lock both allocate() and deallocate(); RAII lock guard ensures unlock

---

#### Q3
Fix the double-free vulnerability:
```cpp
void deallocate(T* ptr) {
    freeList.push_back(ptr);
}

// User code
T* obj = pool.allocate();
pool.deallocate(obj);
pool.deallocate(obj);  // Corrupts pool!
```

**Answer:**
```cpp
#include <unordered_set>

class SafePool {
    std::vector<T*> freeList;
    std::unordered_set<T*> allocatedSet;  // Track allocated objects
    std::mutex mtx;

public:
    T* allocate() {
        std::lock_guard<std::mutex> lock(mtx);
        if (freeList.empty()) return nullptr;
        
        T* obj = freeList.back();
        freeList.pop_back();
        
        allocatedSet.insert(obj);  // Mark as allocated
        return obj;
    }

    void deallocate(T* ptr) {
        std::lock_guard<std::mutex> lock(mtx);
        
        // Check if pointer is currently allocated
        if (allocatedSet.find(ptr) == allocatedSet.end()) {
            throw std::invalid_argument("Double-free or invalid pointer");
        }
        
        allocatedSet.erase(ptr);     // Mark as free
        freeList.push_back(ptr);     // Return to pool
    }
};

// Alternative: Index-based allocation (no pointers)
template <typename T, size_t N>
class IndexBasedPool {
    T storage[N];
    bool allocated[N] = {false};  // Track allocation status
    std::vector<size_t> freeIndices;

public:
    IndexBasedPool() {
        for (size_t i = 0; i < N; ++i) {
            freeIndices.push_back(i);
        }
    }

    T* allocate() {
        if (freeIndices.empty()) return nullptr;
        
        size_t idx = freeIndices.back();
        freeIndices.pop_back();
        allocated[idx] = true;
        return &storage[idx];
    }

    void deallocate(T* ptr) {
        // Calculate index
        size_t idx = ptr - storage;
        
        // Validate index
        if (idx >= N) {
            throw std::out_of_range("Pointer not from this pool");
        }
        
        // Check double-free
        if (!allocated[idx]) {
            throw std::invalid_argument("Double-free detected");
        }
        
        allocated[idx] = false;
        freeIndices.push_back(idx);
    }
};
```

**Explanation:**
- **The double-free bug:** Calling `deallocate(ptr)` twice adds same pointer to freeList twice; next two `allocate()` calls return **same object** to two different users; both users modify same memory; **data corruption, unpredictable crashes**
- **Real-world impact:** Thread 1 allocates → gets object A, Thread 2 allocates → gets same object A (double-allocated), Both threads write to A's fields simultaneously; race conditions, memory corruption; extremely hard to debug
- **Solution 1: Track allocated pointers:** Use `std::unordered_set<T*>` to track allocated objects; `allocate()` inserts into set, `deallocate()` removes from set; if ptr not in set → double-free or invalid pointer; O(1) check with hash set
- **Solution 2: Index-based with flags:** Each slot has `allocated` boolean flag; `deallocate()` checks flag before returning to pool; if flag already false → double-free detected; simpler than hash set, faster for small pools
- **Pointer validation:** Calculate index: `idx = ptr - storage`; if idx >= N → pointer not from pool; catches invalid pointers (not from pool); prevents corruption from external pointers
- **Performance trade-off:** Tracking adds overhead (set operations, flag checks); worth it for safety in development; can be disabled in release builds with `#ifndef NDEBUG`; detect-and-throw vs. assert-and-crash trade-off
- **Alternative: RAII handle:** Return smart pointer that auto-deallocates on destruction; user can't double-free (handle destroyed once); cleaner API, harder to misuse; next question covers this
- **Production pattern:** Debug builds: Full validation with set/flags, Release builds: Disable validation for performance, Use RAII handles to prevent user errors, Add asserts for sanity checks
- **Key Concept:** Double-free corrupts pool by adding same pointer twice; causes double-allocation of same object; track allocated pointers with set or flags; validate on deallocate; use RAII to prevent user errors

---

#### Q4
Complete the index-based allocation:
```cpp
template <typename T, size_t N>
class IndexPool {
    T* storage;
    size_t freeList[N];
    size_t freeCount;

public:
    T* allocate() {
        // Your implementation
    }
};
```

**Answer:**
```cpp
template <typename T, size_t N>
class IndexPool {
    T* storage;
    size_t freeList[N];  // Stack of free indices
    size_t freeCount;    // Number of free slots

public:
    IndexPool() : storage(new T[N]), freeCount(N) {
        // Initialize free list with all indices
        for (size_t i = 0; i < N; ++i) {
            freeList[i] = i;
        }
    }

    ~IndexPool() {
        delete[] storage;
    }

    T* allocate() {
        if (freeCount == 0) {
            return nullptr;  // Pool exhausted
        }

        // Pop index from free list
        --freeCount;
        size_t idx = freeList[freeCount];
        
        return &storage[idx];
    }

    void deallocate(T* ptr) {
        // Calculate index from pointer
        size_t idx = ptr - storage;

        // Validate pointer
        if (idx >= N) {
            throw std::out_of_range("Pointer not from this pool");
        }

        // Check double-free (optional, requires allocated tracking)
        // For simplicity, we trust the user here

        // Push index back to free list
        freeList[freeCount] = idx;
        ++freeCount;
    }

    size_t capacity() const { return N; }
    size_t available() const { return freeCount; }
    size_t used() const { return N - freeCount; }
};

// Usage example:
IndexPool<Resource, 100> pool;

Resource* r1 = pool.allocate();
Resource* r2 = pool.allocate();

pool.deallocate(r1);
pool.deallocate(r2);
```

**Explanation:**
- **Index-based design:** Store indices in freeList, not pointers; `freeList[N]` is array of indices (0 to N-1); `freeCount` tracks how many slots are free; simpler than `std::vector<T*>`
- **Free list as stack:** freeList acts like stack; allocate() pops from top (--freeCount), deallocate() pushes to top (freeCount++); O(1) operations, very fast
- **Allocation algorithm:** Check if freeCount > 0 (pool not empty), Decrement freeCount (pop operation), Get index: `idx = freeList[freeCount]`, Return pointer: `&storage[idx]`
- **Deallocation algorithm:** Calculate index from pointer: `idx = ptr - storage`, Validate index: `if (idx >= N) throw`, Push index back: `freeList[freeCount] = idx`, Increment freeCount
- **Pointer arithmetic validation:** `ptr - storage` gives offset in array; if ptr from this pool → offset in [0, N); if ptr from elsewhere → offset can be huge (or negative); validates pool ownership
- **Cache efficiency:** freeList is array (contiguous memory); better cache locality than linked list or vector; freeCount keeps track without traversing; very fast in tight loops
- **No dynamic allocation:** All memory allocated upfront (storage + freeList); no allocations during allocate()/deallocate(); deterministic performance; suitable for real-time systems
- **Advantages over pointer-based:** No pointer chasing (better cache), Easier double-free detection (check allocated flags), Simpler implementation (array vs vector), Faster (no vector resize)
- **Limitations:** Fixed capacity N (no growth), Wasted space if N too large, Must calculate index from pointer (pointer arithmetic)
- **Key Concept:** Index-based pool stores indices in array, not pointers; freeList as stack with freeCount; O(1) allocate/deallocate; validate pointer with arithmetic; better cache locality; fixed capacity

---

#### Q5
Why does this pool leak memory?
```cpp
struct Resource {
    std::string data;
    std::vector<int> values;
};

class Pool {
    Resource* storage;

    void deallocate(Resource* obj) {
        freeList.push_back(obj);  // Leak!
    }
};
```

**Answer:**
```cpp
// Problem: Resource has dynamic members (string, vector)
// When returned to pool, data and values still hold allocated memory
// That memory is never freed until pool destroyed

// Fix 1: Explicitly reset/clear in deallocate
void deallocate(Resource* obj) {
    // Clear dynamic allocations
    obj->data.clear();
    obj->data.shrink_to_fit();  // Release capacity
    
    obj->values.clear();
    obj->values.shrink_to_fit();  // Release capacity
    
    freeList.push_back(obj);
}

// Fix 2: Destruct and reconstruct (placement new)
template <typename T>
class ProperPool {
    alignas(T) char storage[sizeof(T) * 100];
    std::vector<void*> freeList;

public:
    T* allocate() {
        void* mem = freeList.empty() ? getNewSlot() : popFreeList();
        return new (mem) T();  // Placement new: construct fresh T
    }

    void deallocate(T* obj) {
        obj->~T();  // Explicit destructor: frees string, vector
        freeList.push_back(static_cast<void*>(obj));
    }
};

// Fix 3: Use resource reset method
struct Resource {
    std::string data;
    std::vector<int> values;

    void reset() {
        data.clear();
        data.shrink_to_fit();
        values.clear();
        values.shrink_to_fit();
    }
};

void deallocate(Resource* obj) {
    obj->reset();  // Release internal allocations
    freeList.push_back(obj);
}

// Demonstration of the leak:
int main() {
    Pool pool;
    
    for (int i = 0; i < 1000; ++i) {
        Resource* r = pool.allocate();
        r->data = std::string(10000, 'x');  // Allocate 10KB string
        r->values.resize(10000);            // Allocate 40KB vector
        pool.deallocate(r);  // Returns to pool but keeps 50KB!
    }
    
    // Pool now "contains" 1000 Resources
    // But each Resource still holds 50KB of memory
    // Total leaked: 50 MB!
}
```

**Explanation:**
- **The memory leak:** Resource has `std::string data` and `std::vector<int> values`; these own heap-allocated memory; `deallocate()` returns pointer to pool but **doesn't free internal allocations**; memory stays allocated even though Resource is "free"
- **Why it's a leak:** User allocates Resource → fills data/values (allocates memory), User deallocates Resource → returns to pool, Resource stays allocated in pool with data/values still holding memory, Next user allocates same Resource → fills NEW data/values, **Old memory never freed** until pool destroyed
- **Accumulation over time:** Each allocate-use-deallocate cycle adds memory; pool thinks Resource is reused (good), but Resource's members keep growing (bad); can leak gigabytes in long-running program
- **Fix 1: Explicit clear + shrink_to_fit:** Call `clear()` to remove elements (size → 0), Call `shrink_to_fit()` to release capacity, **Warning:** shrink_to_fit is "request" not guarantee; may not actually free memory (implementation-defined)
- **Fix 2: Destruct and reconstruct (best):** Call destructor explicitly: `obj->~T()`; frees all internal allocations; use placement new on next allocation: `new (mem) T()`; constructs fresh object with empty members; **guaranteed** to free memory
- **Fix 3: Custom reset method:** Add `reset()` member function to Resource; reset() clears all internal state and frees memory; cleaner API, self-documenting; can be more efficient than destruct-reconstruct
- **Performance consideration:** Destroy-reconstruct has overhead (destructor + constructor); clearing without destroying is faster; trade-off: performance vs guaranteed memory release; choose based on use case
- **Real-world example:** Game object pools with textures, sounds, buffers; reusing objects without clearing → memory leak; can consume gigabytes during gameplay; must explicitly release resources
- **Detection:** Run with memory profiler (Valgrind, AddressSanitizer); shows memory growth even though pool size is constant; hard to detect without tools (no "leak" at pool destruction)
- **Key Concept:** Object pool reuses objects but members may hold allocations; deallocate must free internal memory (string, vector, etc.); use explicit destructor + placement new; or clear() + shrink_to_fit(); or custom reset(); prevents gradual memory leak

---

#### Q6
Implement chunk boundary checking:
```cpp
class ExpandablePool {
    std::vector<T*> chunks;
    static constexpr size_t CHUNK_SIZE = 100;

    void deallocate(T* ptr) {
        // Find owning chunk - implement this
    }
};
```

**Answer:**
```cpp
template <typename T>
class ExpandablePool {
    std::vector<T*> chunks;          // Each chunk is array of T
    std::vector<T*> freeList;
    static constexpr size_t CHUNK_SIZE = 100;

public:
    ExpandablePool() {
        addChunk();  // Start with one chunk
    }

    ~ExpandablePool() {
        for (T* chunk : chunks) {
            delete[] chunk;
        }
    }

    T* allocate() {
        if (freeList.empty()) {
            addChunk();  // Expand pool
        }

        T* obj = freeList.back();
        freeList.pop_back();
        return obj;
    }

    void deallocate(T* ptr) {
        // Find which chunk owns this pointer
        T* owningChunk = findOwningChunk(ptr);

        if (owningChunk == nullptr) {
            throw std::invalid_argument("Pointer not from this pool");
        }

        freeList.push_back(ptr);
    }

private:
    void addChunk() {
        T* newChunk = new T[CHUNK_SIZE];
        chunks.push_back(newChunk);

        // Add all elements to free list
        for (size_t i = 0; i < CHUNK_SIZE; ++i) {
            freeList.push_back(&newChunk[i]);
        }
    }

    T* findOwningChunk(T* ptr) const {
        for (T* chunk : chunks) {
            // Check if ptr is within this chunk's memory range
            T* chunkStart = chunk;
            T* chunkEnd = chunk + CHUNK_SIZE;

            if (ptr >= chunkStart && ptr < chunkEnd) {
                // Verify pointer is aligned correctly
                ptrdiff_t offset = ptr - chunk;
                if (offset % sizeof(T) == 0) {
                    return chunk;  // Found owning chunk
                }
            }
        }

        return nullptr;  // Pointer not from any chunk
    }

    // Alternative: Use map for faster lookup
    std::unordered_map<T*, T*> ptrToChunk;  // Maps object ptr to chunk ptr

    T* findOwningChunkFast(T* ptr) const {
        auto it = ptrToChunk.find(ptr);
        return (it != ptrToChunk.end()) ? it->second : nullptr;
    }

    void addChunkWithMap() {
        T* newChunk = new T[CHUNK_SIZE];
        chunks.push_back(newChunk);

        for (size_t i = 0; i < CHUNK_SIZE; ++i) {
            T* obj = &newChunk[i];
            freeList.push_back(obj);
            ptrToChunk[obj] = newChunk;  // Map object to chunk
        }
    }
};

// Usage:
ExpandablePool<Resource> pool;

for (int i = 0; i < 250; ++i) {
    Resource* r = pool.allocate();  // Allocates 3 chunks automatically
}
```

**Explanation:**
- **Expandable pool design:** Starts with one chunk (array of CHUNK_SIZE objects), When freeList empty → allocates new chunk, Grows automatically on demand; no fixed capacity limit
- **Chunk ownership problem:** Have multiple chunks (different memory ranges), Given pointer, must find which chunk owns it, Can't use simple `ptr - storage` (multiple arrays)
- **Linear search solution:** Iterate through all chunks, For each chunk, check if `ptr >= chunkStart && ptr < chunkEnd`, If in range → found owning chunk; O(num_chunks) time
- **Alignment verification:** `offset = ptr - chunk` gives offset in bytes, `offset % sizeof(T)` checks alignment, Must be zero (ptr points to valid element), Catches pointers to middle of objects (invalid)
- **Boundary conditions:** `ptr >= chunkStart` - inclusive start, `ptr < chunkEnd` - exclusive end, `chunkEnd = chunk + CHUNK_SIZE` - one past last element, Standard C++ pointer comparison rules
- **Map-based optimization:** Store `std::unordered_map<T*, T*>` mapping object ptr → chunk ptr, O(1) lookup instead of O(num_chunks), Trade-off: Extra memory (map overhead), Faster for large number of chunks
- **When to use which:** Linear search: Few chunks (< 10), small overhead; Map: Many chunks, frequent deallocations; Hybrid: Cache last chunk used (locality of reference)
- **Alternative: Store chunk ID in header:** Allocate extra bytes before each object for chunk ID, `struct Header { size_t chunkId; };`, Faster lookup but wastes memory
- **Real-world pattern:** STL allocators often use similar chunked design, Boost.Pool uses segregated storage, tcmalloc uses span-based ownership tracking
- **Key Concept:** Expandable pool has multiple chunks; must find owning chunk to validate pointer; linear search checks ptr in [chunkStart, chunkEnd); verify alignment; O(chunks) search or O(1) map lookup; trade-off: performance vs memory

---

#### Q7
Add alignment validation:
```cpp
struct alignas(32) SIMDData {
    float values[8];
};

class Pool {
    SIMDData* allocate() {
        // Ensure returned pointer is 32-byte aligned
    }
};
```

**Answer:**
```cpp
#include <cstddef>
#include <cstdlib>
#include <new>

struct alignas(32) SIMDData {
    float values[8];
};

class Pool {
    static constexpr size_t ALIGNMENT = alignof(SIMDData);  // 32 bytes
    static constexpr size_t POOL_SIZE = 100;

    // Option 1: Use aligned_alloc (C++17)
    void* storage;
    SIMDData* freeList[POOL_SIZE];
    size_t freeCount = POOL_SIZE;

public:
    Pool() {
        // Allocate aligned memory
        storage = std::aligned_alloc(ALIGNMENT, sizeof(SIMDData) * POOL_SIZE);

        if (storage == nullptr) {
            throw std::bad_alloc();
        }

        // Initialize free list
        SIMDData* arr = static_cast<SIMDData*>(storage);
        for (size_t i = 0; i < POOL_SIZE; ++i) {
            freeList[i] = &arr[i];
        }
    }

    ~Pool() {
        std::free(storage);  // aligned_alloc requires free(), not delete
    }

    SIMDData* allocate() {
        if (freeCount == 0) return nullptr;

        SIMDData* obj = freeList[--freeCount];

        // Validate alignment
        uintptr_t addr = reinterpret_cast<uintptr_t>(obj);
        if (addr % ALIGNMENT != 0) {
            throw std::runtime_error("Misaligned allocation!");
        }

        return obj;
    }

    void deallocate(SIMDData* ptr) {
        // Validate alignment on deallocation too
        uintptr_t addr = reinterpret_cast<uintptr_t>(ptr);
        if (addr % ALIGNMENT != 0) {
            throw std::invalid_argument("Misaligned pointer!");
        }

        freeList[freeCount++] = ptr;
    }
};

// Option 2: Use alignas with placement new (C++11)
class Pool2 {
    static constexpr size_t ALIGNMENT = 32;
    static constexpr size_t POOL_SIZE = 100;

    alignas(32) char storage[sizeof(SIMDData) * POOL_SIZE];  // Aligned buffer
    std::vector<void*> freeList;

public:
    Pool2() {
        // Initialize free list
        for (size_t i = 0; i < POOL_SIZE; ++i) {
            void* slot = storage + (i * sizeof(SIMDData));
            freeList.push_back(slot);
        }
    }

    SIMDData* allocate() {
        if (freeList.empty()) return nullptr;

        void* mem = freeList.back();
        freeList.pop_back();

        // Verify alignment
        assert(reinterpret_cast<uintptr_t>(mem) % ALIGNMENT == 0);

        // Construct object with placement new
        return new (mem) SIMDData();
    }

    void deallocate(SIMDData* ptr) {
        // Call destructor
        ptr->~SIMDData();

        // Verify alignment
        assert(reinterpret_cast<uintptr_t>(ptr) % ALIGNMENT == 0);

        freeList.push_back(ptr);
    }
};

// Compile-time alignment check
static_assert(alignof(SIMDData) == 32, "SIMDData must be 32-byte aligned");
static_assert(sizeof(SIMDData) == 32, "SIMDData unexpected size");

// Usage:
Pool pool;
SIMDData* data = pool.allocate();

// Use with SIMD instructions
#include <immintrin.h>
__m256 vec = _mm256_load_ps(data->values);  // Requires 32-byte alignment!
```

**Explanation:**
- **Why alignment matters:** SIMD instructions (AVX, SSE) require aligned data; `_mm256_load_ps` requires 32-byte alignment; **crashes** (segfault) on misaligned access; or falls back to slow unaligned load
- **alignas specifier:** `alignas(32)` tells compiler to align to 32-byte boundary; works for types, variables, arrays; compiler ensures alignment; part of C++11 standard
- **Aligned allocation:** `std::aligned_alloc(alignment, size)` - C++17 function; allocates memory with specified alignment; returns `void*` aligned to boundary; must use `std::free()` (not delete) to deallocate
- **Alignment validation at runtime:** Convert pointer to integer: `uintptr_t addr = reinterpret_cast<uintptr_t>(ptr)`; Check alignment: `addr % ALIGNMENT == 0`; If not aligned → bug in allocator or corrupted pointer
- **Option 1: aligned_alloc:** Use `std::aligned_alloc` for dynamic allocation; guarantees alignment; portable (C++17); must use `free()` for deallocation; doesn't call constructors
- **Option 2: alignas buffer:** Use `alignas(32) char storage[...]`; aligned at compile time; no runtime allocation; can use placement new for construction; better for fixed-size pools
- **Alignment of array elements:** If first element aligned AND `sizeof(SIMDData)` is multiple of alignment → all elements aligned; `static_assert(sizeof(SIMDData) % 32 == 0)` to verify
- **Common alignment values:** 8 bytes: double, 64-bit ints; 16 bytes: SSE (128-bit SIMD); 32 bytes: AVX (256-bit SIMD); 64 bytes: Cache line alignment; Choose based on use case
- **Debugging misalignment:** Enable alignment checks: `-fsanitize=alignment` (GCC/Clang); Runtime assertions on allocate/deallocate; Static assertions at compile time; Print pointer values: `printf("%p", ptr)`
- **Cache line alignment:** `alignas(64)` for cache line alignment; prevents false sharing between threads; each object on own cache line; important for multithreaded performance
- **Key Concept:** SIMD requires aligned data (16, 32, 64 bytes); use alignas specifier for types/buffers; std::aligned_alloc for dynamic allocation; validate alignment with modulo check; misalignment causes crashes or slow code; alignment of array = alignment of first element + aligned sizeof

---

#### Q8
What's the issue with this pool destructor?
```cpp
class Pool {
    T* storage;

public:
    ~Pool() {
        delete storage;  // Bug!
    }
};
```

**Answer:**
```cpp
// Bug: storage was allocated with new T[N], must use delete[]

class Pool {
    T* storage;
    size_t capacity;

public:
    Pool(size_t n) : capacity(n) {
        storage = new T[n];  // Array allocation
    }

    ~Pool() {
        delete[] storage;  // Correct: delete[] for arrays
    }
};

// What happens with delete instead of delete[]:
// - Only first object's destructor is called
// - Memory for array header is incorrectly freed
// - Heap corruption
// - Undefined behavior (crash, leak, silent corruption)
```

**Explanation:**
- **The bug - delete vs delete[]:** `storage = new T[N]` allocates array (multiple objects); must use `delete[]` to deallocate; using `delete` (no brackets) is **undefined behavior**; common C++ mistake
- **What delete[] does:** Calls destructor for **each** array element (N times), Then frees entire array memory, Array header stores count (implementation detail)
- **What delete does (wrong):** Calls destructor only for **first** element, Tries to free memory assuming single object, **Heap corruption** - array header not handled correctly
- **Real-world consequences:** Non-POD types: Leaks memory (destructors not called for elements 1..N-1), POD types: May seem to work but still UB, Debug builds: Often crash immediately (good for debugging), Release builds: Silent corruption, crashes later
- **Example with std::string:** Array of 10 std::strings allocated, `delete storage` calls destructor only for `storage[0]`, `storage[1]` through `storage[9]` never destroyed, Memory for 9 strings leaked, Plus heap corruption from incorrect deallocation
- **How to detect:** Enable compiler warnings: `-Wall -Wextra`, Use sanitizers: `-fsanitize=address`, Valgrind: "Mismatched free() / delete / delete []", Static analysis: clang-tidy, cppcheck
- **Prevention with smart pointers:** Use `std::unique_ptr<T[]>` for arrays, Automatically uses `delete[]` in deleter, No manual delete needed, Array-aware smart pointer
- **Matching allocation/deallocation rules:** `new` → `delete`, `new[]` → `delete[]`, `malloc` → `free`, `aligned_alloc` → `free`, **Never mix** different allocation/deallocation pairs
- **Why compiler can't catch this:** `T*` is same type for single object and array, Type system doesn't distinguish, Impossible to enforce at compile time, Must remember allocation method
- **Modern C++ alternative:** Use `std::vector<T>` instead of `new T[]`, Automatic memory management, No manual delete needed, Exception-safe
- **Key Concept:** Array allocation (new[]) requires array deallocation (delete[]); single object delete causes UB; only first destructor called; heap corruption; use smart pointers or vector; compiler warnings help detect; matching new/delete pairs critical

---

#### Q9
Fix the race condition:
```cpp
class Pool {
    std::atomic<size_t> head{0};
    T* buffer[100];

    T* allocate() {
        size_t h = head.load();
        T* obj = buffer[h];
        head.store(h + 1);  // Race!
        return obj;
    }
};
```

**Answer:**
```cpp
// Bug: Load-modify-store is not atomic as a whole
// Two threads can read same h value before either increments

class Pool {
    std::atomic<size_t> head{0};
    T* buffer[100];
    static constexpr size_t CAPACITY = 100;

public:
    // Fix 1: Use compare_exchange (lock-free)
    T* allocate() {
        size_t h = head.load();
        
        while (h < CAPACITY) {
            // Try to atomically increment if still at h
            if (head.compare_exchange_weak(h, h + 1)) {
                return buffer[h];  // Success: got index h
            }
            // Failed: another thread changed head
            // h now contains new value, retry
        }
        
        return nullptr;  // Pool exhausted
    }

    // Fix 2: Use fetch_add (simpler, lock-free)
    T* allocate2() {
        size_t h = head.fetch_add(1);  // Atomic increment, returns old value
        
        if (h >= CAPACITY) {
            return nullptr;  // Pool exhausted
        }
        
        return buffer[h];
    }

    // For deallocation, need different approach (stack-based)
    std::atomic<size_t> tail{0};

    void deallocate(T* ptr) {
        size_t t = tail.fetch_add(1);
        buffer[t % CAPACITY] = ptr;  // Wrap around (if pool is circular)
    }
};

// Complete lock-free pool (more complex):
template <typename T, size_t N>
class LockFreePool {
    T* buffer[N];
    
    struct Node {
        size_t next;
    };
    
    std::atomic<size_t> freeListHead{0};
    
public:
    LockFreePool() {
        // Initialize linked free list
        for (size_t i = 0; i < N; ++i) {
            buffer[i] = new T();
            reinterpret_cast<Node*>(&buffer[i])->next = i + 1;
        }
        reinterpret_cast<Node*>(&buffer[N-1])->next = N;  // Sentinel
    }

    T* allocate() {
        size_t oldHead = freeListHead.load(std::memory_order_acquire);
        
        while (oldHead < N) {
            size_t next = reinterpret_cast<Node*>(&buffer[oldHead])->next;
            
            if (freeListHead.compare_exchange_weak(oldHead, next,
                                                   std::memory_order_release,
                                                   std::memory_order_acquire)) {
                return buffer[oldHead];
            }
            // Retry with updated oldHead
        }
        
        return nullptr;
    }
};
```

**Explanation:**
- **The race condition:** Thread 1: loads h = 5, Thread 2: loads h = 5 (same!), Thread 1: stores h = 6, Thread 2: stores h = 6 (overwrites!), **Both threads get buffer[5]** - same object allocated twice!
- **Why atomic doesn't help here:** `head.load()` is atomic, `head.store()` is atomic, But the **combination** "read-modify-write" is NOT atomic, Gap between load and store allows race
- **ABA problem:** Even worse: Thread 1 reads h=5, Thread 2 reads h=5, increments to 6, allocates buffer[5], Thread 3 deallocates buffer[5], head back to 5, Thread 1 thinks nothing changed, allocates same object!
- **Fix 1: compare_exchange_weak:** Atomically: "If head == expected, set head = desired, return true; else set expected = head, return false", Fails if another thread modified head, Loop retries until success, **Lock-free** but may spuriously fail (weak version)
- **Fix 2: fetch_add (simpler):** `fetch_add(1)` atomically increments AND returns old value, One atomic operation, no loop needed, Simpler than compare_exchange, **Best for monotonic counters**
- **Why fetch_add is better here:** Allocation is monotonic (always increasing), No need for complex CAS logic, Single atomic instruction, Hardware-optimized on most CPUs
- **Deallocation is harder:** Can't just decrement head (breaks LIFO order), Need separate tail pointer for FIFO, Or use lock-free stack (more complex), Or use mutex for deallocation only
- **Lock-free stack for pool:** Maintain linked list of free slots, Head pointer is atomic, Pop: CAS to update head to next, Push: CAS to insert at head, Classic lock-free stack algorithm
- **Memory ordering:** `fetch_add` default: `memory_order_seq_cst` (strongest), Can optimize: `memory_order_relaxed` for counters, `memory_order_acquire/release` for synchronization, Trade-off: performance vs correctness
- **When to use lock-free:** High contention (many threads), Real-time requirements (no waiting), Simple operations (counter, stack), **Not suitable for complex state**
- **When to use mutex:** Complex state updates, Easier to reason about, Less error-prone, Good enough performance for most cases
- **Key Concept:** Load-modify-store on atomic is not atomic as whole; race condition allows double-allocation; use compare_exchange_weak/strong for read-modify-write; fetch_add for monotonic increment; lock-free complex for deallocation; mutex simpler for pools

---

#### Q10
Implement proper placement new lifecycle:
```cpp
class Pool {
    alignas(Resource) char storage[sizeof(Resource) * 100];

    Resource* allocate() {
        void* mem = getFreeSlot();
        // Construct Resource using placement new
    }

    void deallocate(Resource* obj) {
        // Properly destruct before returning to pool
    }
};
```

**Answer:**
```cpp
#include <new>
#include <vector>

struct Resource {
    std::string data;
    std::vector<int> values;
    
    Resource() {
        std::cout << "Resource constructed\n";
    }
    
    ~Resource() {
        std::cout << "Resource destroyed\n";
    }
};

class Pool {
    static constexpr size_t POOL_SIZE = 100;
    alignas(Resource) char storage[sizeof(Resource) * POOL_SIZE];
    
    std::vector<void*> freeList;
    bool initialized[POOL_SIZE] = {false};  // Track construction status

public:
    Pool() {
        // Initialize free list with all slots
        for (size_t i = 0; i < POOL_SIZE; ++i) {
            void* slot = &storage[i * sizeof(Resource)];
            freeList.push_back(slot);
        }
    }

    ~Pool() {
        // Destroy all constructed objects
        for (size_t i = 0; i < POOL_SIZE; ++i) {
            if (initialized[i]) {
                Resource* obj = reinterpret_cast<Resource*>(&storage[i * sizeof(Resource)]);
                obj->~Resource();  // Explicit destructor call
            }
        }
    }

    Resource* allocate() {
        if (freeList.empty()) {
            return nullptr;  // Pool exhausted
        }

        void* mem = freeList.back();
        freeList.pop_back();

        // Calculate index for tracking
        size_t idx = getIndex(mem);
        
        // Construct new Resource using placement new
        Resource* obj = new (mem) Resource();
        initialized[idx] = true;

        return obj;
    }

    void deallocate(Resource* obj) {
        // Calculate index
        size_t idx = getIndex(obj);

        if (!initialized[idx]) {
            throw std::logic_error("Deallocating uninitialized object");
        }

        // Call destructor explicitly (frees std::string, std::vector)
        obj->~Resource();
        initialized[idx] = false;

        // Return memory to pool (no need to clear, will be reconstructed)
        freeList.push_back(static_cast<void*>(obj));
    }

private:
    size_t getIndex(void* ptr) const {
        char* charPtr = static_cast<char*>(ptr);
        char* storageStart = const_cast<char*>(storage);
        ptrdiff_t offset = charPtr - storageStart;
        return offset / sizeof(Resource);
    }
};

// Usage:
int main() {
    Pool pool;

    {
        Resource* r1 = pool.allocate();  // Constructs Resource
        r1->data = "Hello";
        r1->values = {1, 2, 3};

        pool.deallocate(r1);  // Destroys Resource, frees string/vector
    }

    {
        Resource* r2 = pool.allocate();  // Constructs fresh Resource
        // r2->data is empty (fresh construction)
        // r2->values is empty (fresh construction)
        pool.deallocate(r2);
    }

    return 0;
}
```

**Explanation:**
- **Placement new:** `new (mem) T()` constructs object at address `mem`; doesn't allocate memory (memory already allocated); calls constructor on raw memory; returns pointer to constructed object
- **Why use placement new:** Pool pre-allocates memory (char buffer), Need to construct objects on demand, Separate allocation (done once) from construction (per object), Allows custom memory management
- **Explicit destructor call:** `obj->~Resource()` calls destructor without deallocating memory; destructor frees internal resources (string data, vector elements); memory remains allocated (returned to pool); rare case where explicit destructor call is correct
- **Lifecycle phases:** Memory allocation (once, in pool constructor), Object construction (placement new on allocate), Object destruction (explicit destructor on deallocate), Memory deallocation (once, in pool destructor)
- **Importance of destruction:** Resource has `std::string` and `std::vector` with dynamic allocations; if not destroyed, memory leaks; explicit destructor frees these; fresh construction on next allocation prevents stale data
- **Tracking construction status:** `initialized[]` array tracks which slots have constructed objects; prevents double-destruction (UB); prevents destroying unconstructed memory (UB); used in pool destructor to destroy only live objects
- **Pool destructor:** Must destroy all currently constructed objects; iterates through `initialized[]`, calls destructor for constructed objects; **doesn't** destroy unconstructed slots (UB); then char array automatically freed
- **Raw memory (char buffer):** Using `char storage[]` gives raw memory; `alignas(Resource)` ensures proper alignment; sizeof(Resource) * N bytes total; no constructors called initially
- **Alternative: std::aligned_storage (deprecated C++23):** `std::aligned_storage<sizeof(T), alignof(T)>::type storage[N];`, Same effect as `alignas(T) char`, More verbose, Deprecated in C++23
- **Common mistakes:** Forgetting explicit destructor → memory leak, Calling destructor twice → undefined behavior, Not tracking construction status → can't safely destroy pool, Misalignment → crashes on SIMD types
- **When to use this pattern:** Custom allocators, Memory pools, Embedded systems (pre-allocated buffers), Object reuse with state reset, **Not** for simple cases (use vector)
- **Key Concept:** Placement new constructs object at pre-allocated memory; explicit destructor destroys object without freeing memory; separate allocation/construction phases; track construction status; pool destructor must destroy live objects; critical for types with dynamic members

---

#### Q11
Calculate the correct global index:
```cpp
class ChunkedPool {
    std::vector<T*> chunks;
    static constexpr size_t CHUNK_SIZE = 100;

    size_t getGlobalIndex(T* ptr) {
        // Calculate global index from pointer
    }
};
```

**Answer:**
```cpp
template <typename T>
class ChunkedPool {
    std::vector<T*> chunks;
    static constexpr size_t CHUNK_SIZE = 100;

public:
    size_t getGlobalIndex(T* ptr) const {
        // Find which chunk contains this pointer
        for (size_t chunkIdx = 0; chunkIdx < chunks.size(); ++chunkIdx) {
            T* chunkStart = chunks[chunkIdx];
            T* chunkEnd = chunkStart + CHUNK_SIZE;

            if (ptr >= chunkStart && ptr < chunkEnd) {
                // Calculate offset within chunk
                size_t offsetInChunk = ptr - chunkStart;
                
                // Global index = chunk index * CHUNK_SIZE + offset in chunk
                return chunkIdx * CHUNK_SIZE + offsetInChunk;
            }
        }

        // Pointer not from this pool
        throw std::invalid_argument("Pointer not from pool");
    }

    // Alternative: Store chunk index with each allocation
    std::unordered_map<T*, size_t> ptrToGlobalIndex;

    size_t getGlobalIndexFast(T* ptr) const {
        auto it = ptrToGlobalIndex.find(ptr);
        if (it != ptrToGlobalIndex.end()) {
            return it->second;
        }
        throw std::invalid_argument("Pointer not found");
    }

    // Reverse: Get pointer from global index
    T* getPointerFromIndex(size_t globalIndex) const {
        size_t chunkIdx = globalIndex / CHUNK_SIZE;
        size_t offsetInChunk = globalIndex % CHUNK_SIZE;

        if (chunkIdx >= chunks.size()) {
            throw std::out_of_range("Invalid global index");
        }

        return &chunks[chunkIdx][offsetInChunk];
    }

    // Example usage: Iteration over all allocated objects
    void processAll(std::function<void(T&)> fn) {
        for (size_t i = 0; i < getTotalCapacity(); ++i) {
            T* obj = getPointerFromIndex(i);
            fn(*obj);
        }
    }

    size_t getTotalCapacity() const {
        return chunks.size() * CHUNK_SIZE;
    }
};

// Usage:
ChunkedPool<Resource> pool;

// Allocate across multiple chunks
std::vector<Resource*> objects;
for (int i = 0; i < 250; ++i) {
    objects.push_back(pool.allocate());  // Creates 3 chunks
}

// Get global index
Resource* obj = objects[175];
size_t globalIdx = pool.getGlobalIndex(obj);
// globalIdx = 175 (chunk 1, offset 75)
// Chunk 0: indices 0-99
// Chunk 1: indices 100-199
// Chunk 2: indices 200-249

// Reverse lookup
Resource* sameObj = pool.getPointerFromIndex(175);
assert(sameObj == obj);
```

**Explanation:**
- **Global index concept:** Each object has unique index across all chunks; Chunk 0: indices 0-99, Chunk 1: indices 100-199, Chunk 2: indices 200-299, etc.; allows flat indexing into chunked storage
- **Calculation formula:** `globalIndex = chunkIndex * CHUNK_SIZE + offsetInChunk`, `chunkIndex = globalIndex / CHUNK_SIZE`, `offsetInChunk = globalIndex % CHUNK_SIZE`; simple integer arithmetic
- **Finding chunk:** Linear search through chunks: `if (ptr >= chunkStart && ptr < chunkEnd)`, Once found, calculate offset: `ptr - chunkStart`, Combine with chunk index: `chunkIdx * CHUNK_SIZE + offset`
- **Reverse operation:** Given global index, find chunk: `chunkIdx = globalIndex / CHUNK_SIZE`, Find offset: `offsetInChunk = globalIndex % CHUNK_SIZE`, Get pointer: `&chunks[chunkIdx][offsetInChunk]`
- **Why this is useful:** Serialize pool state (save/load by indices), Implement handles instead of pointers (index-based), Iterate over all objects in order, Debug/logging (print object indices), External references (other systems use indices)
- **Performance consideration:** Linear search O(num_chunks) for getGlobalIndex, Use map for O(1) lookup if frequent, getPointerFromIndex is O(1) always (just division/modulo), Cache last chunk for locality of reference
- **Validation:** Check `ptr >= chunkStart && ptr < chunkEnd` for ownership, Check alignment: `(ptr - chunkStart) % sizeof(T) == 0`, Check chunk index bounds: `chunkIdx < chunks.size()`
- **Example: Save/load system:** Save: Write global indices to file, Load: Reconstruct pointers from indices, Pointers may differ between runs, Indices stay consistent
- **Handle-based API:** Instead of returning `T*`, return `Handle` (just `size_t`), User stores handles, not pointers, Pool converts handle to pointer internally, Safer (can't dereference invalid pointer)
- **Limitations:** Assumes chunks never deallocated (or reordered), Global indices change if chunks are removed, Must track chunk lifetimes for correctness
- **Key Concept:** Global index = chunkIndex × CHUNK_SIZE + offsetInChunk; reverse: chunkIndex = index / CHUNK_SIZE, offset = index % CHUNK_SIZE; enables flat indexing across chunks; useful for serialization, handles, iteration; O(chunks) to find chunk, O(1) to compute pointer from index

---

#### Q12
Why doesn't this pool reuse memory?
```cpp
class Pool {
    T* storage;
    size_t nextIndex = 0;

    T* allocate() {
        return &storage[nextIndex++];  // Bug!
    }

    void deallocate(T* ptr) {
        // Nothing!
    }
};
```

**Answer:**
```cpp
// Problem: No free list - deallocate() does nothing
// Allocations are linear (nextIndex always increases)
// Never reuses deallocated objects - defeats purpose of pool

class BrokenPool {
    T* storage;
    size_t nextIndex = 0;
    size_t capacity;

public:
    BrokenPool(size_t n) : capacity(n) {
        storage = new T[n];
    }

    T* allocate() {
        if (nextIndex >= capacity) {
            return nullptr;  // Pool exhausted
        }
        return &storage[nextIndex++];  // Linear allocation
    }

    void deallocate(T* ptr) {
        // BUG: Does nothing! Memory not returned to pool
    }

    ~BrokenPool() {
        delete[] storage;
    }
};

// Fixed version with free list:
class FixedPool {
    T* storage;
    std::vector<T*> freeList;
    size_t capacity;
    size_t nextIndex = 0;

public:
    FixedPool(size_t n) : capacity(n) {
        storage = new T[n];
    }

    T* allocate() {
        // First try free list (reuse deallocated objects)
        if (!freeList.empty()) {
            T* obj = freeList.back();
            freeList.pop_back();
            return obj;  // Reused object
        }

        // Free list empty - allocate from unused portion
        if (nextIndex < capacity) {
            return &storage[nextIndex++];
        }

        // Pool exhausted
        return nullptr;
    }

    void deallocate(T* ptr) {
        // Return object to free list for reuse
        freeList.push_back(ptr);
    }

    ~FixedPool() {
        delete[] storage;
    }
};

// Demonstration of the problem:
int main() {
    BrokenPool pool(10);  // Capacity: 10 objects

    // Allocate 10 objects
    std::vector<T*> objects;
    for (int i = 0; i < 10; ++i) {
        objects.push_back(pool.allocate());  // OK
    }

    // Deallocate all
    for (T* obj : objects) {
        pool.deallocate(obj);  // Does nothing!
    }

    // Try to allocate again
    T* obj = pool.allocate();  // Returns nullptr! Pool still "exhausted"

    // With fixed version:
    FixedPool fixedPool(10);
    
    for (int i = 0; i < 10; ++i) {
        objects[i] = fixedPool.allocate();
    }
    
    for (T* obj : objects) {
        fixedPool.deallocate(obj);  // Returns to free list
    }
    
    obj = fixedPool.allocate();  // Returns reused object! Works!
}
```

**Explanation:**
- **The fundamental flaw:** Pool allocator's purpose is **reuse** memory; this pool allocates linearly (nextIndex++); never returns memory to pool (deallocate does nothing); **defeats entire purpose** of object pool
- **What happens:** Allocate 10 objects → nextIndex = 10, Deallocate all → nextIndex still 10, Try to allocate → nextIndex >= capacity → nullptr, Pool appears "exhausted" even though all objects are "free"
- **Why deallocate is empty:** Likely incomplete implementation or misunderstanding; forgot to implement free list; or thought linear allocation was sufficient (wrong)
- **Free list necessity:** Track which objects are available for reuse, deallocate() adds to free list, allocate() checks free list first, Falls back to linear allocation if free list empty
- **Allocate strategy (fixed version):** 1. Check free list → if not empty, pop and return (reuse), 2. If free list empty → use nextIndex (fresh allocation), 3. If nextIndex >= capacity → nullptr (exhausted)
- **Memory usage pattern:** Without free list: Memory usage only grows (never shrinks), With free list: Memory usage grows to peak, then reuses (stays at peak)
- **Performance comparison:** Broken: Fast allocate until exhausted (just increment), then useless, Fixed: Slightly slower allocate (check free list), but reuses indefinitely
- **Real-world analogy:** Library without returns: Borrow books until library empty, even if you finish reading, Proper library: Return books for others to borrow
- **Detection in practice:** Pool "runs out" too quickly, Memory usage keeps growing, Pool size doesn't match expected usage, Profiling shows no reuse
- **When linear allocation is OK:** Arena allocator (no individual deallocation), Temporary allocations (freed in bulk), Single-frame allocations in games, **Not** for long-lived object pools
- **Key Concept:** Object pool must reuse memory via free list; linear allocation without reuse defeats purpose; deallocate must return to free list; allocate checks free list before fresh allocation; without reuse, pool exhausted after initial allocations

---

#### Q13
Fix the false sharing issue:
```cpp
struct Counter {
    int value;  // 4 bytes
};

// Multiple threads allocate and modify Counters
// Performance degrades significantly - why?
```

**Answer:**
```cpp
// Problem: False sharing - multiple Counters share cache line
// Cache line = 64 bytes on most CPUs
// Multiple 4-byte Counters fit in one cache line
// Different threads modify different Counters → cache line bounces between CPUs

// Without fix: False sharing
struct Counter {
    int value;  // 4 bytes
};

// Pool allocates Counters sequentially:
// [Counter0][Counter1][Counter2]...[Counter15] all in same 64-byte cache line
// Thread 1 modifies Counter0 → invalidates cache line
// Thread 2 modifies Counter1 → cache line moved to CPU 2, invalidates CPU 1's cache
// Constant cache line ping-pong → severe performance degradation

// Fix 1: Pad to cache line size
struct alignas(64) Counter {
    int value;
    char padding[60];  // Total 64 bytes = one cache line
};

// Now each Counter on its own cache line:
// [Counter0 (64B)][Counter1 (64B)][Counter2 (64B)]...
// No false sharing between Counters

// Fix 2: Use std::hardware_destructive_interference_size (C++17)
#include <new>

struct Counter {
    alignas(std::hardware_destructive_interference_size) int value;
    // Compiler inserts padding to prevent false sharing
};

// Fix 3: Allocate cache line aligned
class Pool {
    static constexpr size_t CACHE_LINE_SIZE = 64;

    struct alignas(64) AlignedCounter {
        Counter counter;
        // Implicit padding to 64 bytes
    };

    AlignedCounter* storage;

public:
    Counter* allocate() {
        // Returns cache-line-aligned Counter
    }
};

// Benchmark demonstrating the problem:
#include <thread>
#include <vector>
#include <chrono>

void benchmark() {
    constexpr size_t NUM_THREADS = 4;
    constexpr size_t ITERATIONS = 10'000'000;

    // Without padding - false sharing
    Counter counters_bad[NUM_THREADS];  // All in same cache line
    
    auto start = std::chrono::high_resolution_clock::now();
    
    std::vector<std::thread> threads;
    for (size_t i = 0; i < NUM_THREADS; ++i) {
        threads.emplace_back([&, i]() {
            for (size_t j = 0; j < ITERATIONS; ++j) {
                counters_bad[i].value++;  // False sharing!
            }
        });
    }
    
    for (auto& t : threads) t.join();
    
    auto end = std::chrono::high_resolution_clock::now();
    auto duration_bad = std::chrono::duration_cast<std::chrono::milliseconds>(end - start);

    // With padding - no false sharing
    alignas(64) Counter counters_good[NUM_THREADS];  // Each on own cache line
    
    start = std::chrono::high_resolution_clock::now();
    
    threads.clear();
    for (size_t i = 0; i < NUM_THREADS; ++i) {
        threads.emplace_back([&, i]() {
            for (size_t j = 0; j < ITERATIONS; ++j) {
                counters_good[i].value++;  // No false sharing
            }
        });
    }
    
    for (auto& t : threads) t.join();
    
    end = std::chrono::high_resolution_clock::now();
    auto duration_good = std::chrono::duration_cast<std::chrono::milliseconds>(end - start);

    std::cout << "Without padding: " << duration_bad.count() << " ms\n";
    std::cout << "With padding: " << duration_good.count() << " ms\n";
    std::cout << "Speedup: " << (duration_bad.count() / (double)duration_good.count()) << "x\n";

    // Typical output:
    // Without padding: 2500 ms
    // With padding: 250 ms
    // Speedup: 10x
}
```

**Explanation:**
- **False sharing definition:** Multiple threads access **different** variables on **same cache line**; CPU cache operates on cache line granularity (typically 64 bytes); modifying one variable invalidates entire cache line for other CPUs
- **Why it happens with Counters:** Counter is 4 bytes, cache line is 64 bytes; 16 Counters fit in one cache line; Thread 1 modifies Counter[0], Thread 2 modifies Counter[1]; **both modifications affect same cache line**
- **Cache coherency protocol (MESI):** Modified: CPU owns cache line exclusively, Exclusive: CPU has cache line, not modified, Shared: Multiple CPUs have copy (read-only), Invalid: Cache line invalidated; modification causes transition M→I on other CPUs
- **Performance impact:** Each modification triggers cache invalidation, Cache line bounces between CPUs ("ping-pong"), Memory bandwidth exhausted, **10x-100x slowdown** vs no false sharing
- **Fix 1: Explicit padding:** Pad Counter to 64 bytes (cache line size); each Counter gets own cache line; no sharing between adjacent Counters; wastes memory (60 bytes padding per Counter)
- **Fix 2: hardware_destructive_interference_size (C++17):** `std::hardware_destructive_interference_size` = cache line size (implementation-defined); `alignas(std::hardware_destructive_interference_size)` pads to cache line; portable across architectures
- **Fix 3: Pool-level alignment:** Pool allocates cache-line-aligned objects; wraps Counter in aligned struct; achieves same result; cleaner for pool users
- **Trade-off: Performance vs memory:** Padding wastes memory (60 bytes per 4-byte Counter); but 10x+ performance gain in multithreaded code; **worth it** for hot contended data
- **When false sharing matters:** High contention (many threads), High modification rate (tight loops), Adjacent memory accesses (arrays of small objects), Performance-critical code (hot paths)
- **Detection:** Performance profiling (perf, VTune), Cache miss counters (high L1 miss rate), Thread scaling (doesn't scale linearly), Benchmark with/without padding
- **Related: True sharing:** Multiple threads access **same** variable; requires synchronization (mutex, atomic); different from false sharing (different variables, same cache line)
- **Key Concept:** False sharing occurs when threads modify different variables on same cache line; cache coherency causes ping-pong invalidations; pad to cache line size (64 bytes); 10x-100x performance improvement; use alignas(64) or std::hardware_destructive_interference_size; trade-off: memory vs performance

---

#### Q14
Implement cache line alignment:
```cpp
template <typename T>
struct AlignedWrapper {
    // Ensure T is on its own cache line
};
```

**Answer:**
```cpp
#include <new>  // For std::hardware_destructive_interference_size

// C++17 solution with std::hardware_destructive_interference_size
template <typename T>
struct alignas(std::hardware_destructive_interference_size) AlignedWrapper {
    T value;

    // Ensure total size is multiple of cache line
    char padding[std::hardware_destructive_interference_size - sizeof(T)];

    // Constructors
    AlignedWrapper() = default;
    
    template <typename... Args>
    AlignedWrapper(Args&&... args) : value(std::forward<Args>(args)...) {}

    // Accessors
    T& get() { return value; }
    const T& get() const { return value; }

    T& operator*() { return value; }
    const T& operator*() const { return value; }

    T* operator->() { return &value; }
    const T* operator->() const { return &value; }
};

// Pre-C++17 solution with manual cache line size
template <typename T, size_t CacheLineSize = 64>
struct AlignedWrapperManual {
    alignas(CacheLineSize) T value;
    
    // Padding to full cache line
    static constexpr size_t PaddingSize = 
        (sizeof(T) < CacheLineSize) ? (CacheLineSize - sizeof(T)) : 0;
    
    char padding[PaddingSize];

    AlignedWrapperManual() = default;
    
    template <typename... Args>
    AlignedWrapperManual(Args&&... args) : value(std::forward<Args>(args)...) {}

    T& get() { return value; }
    const T& get() const { return value; }
};

// Static assertions to verify alignment
static_assert(sizeof(AlignedWrapper<int>) >= 64, "Not cache-line sized");
static_assert(alignof(AlignedWrapper<int>) == 64, "Not cache-line aligned");

// Usage in object pool:
template <typename T>
class CacheAlignedPool {
    using AlignedT = AlignedWrapper<T>;
    AlignedT* storage;
    size_t capacity;
    std::vector<AlignedT*> freeList;

public:
    CacheAlignedPool(size_t n) : capacity(n) {
        storage = new AlignedT[n];
        
        for (size_t i = 0; i < n; ++i) {
            freeList.push_back(&storage[i]);
        }
    }

    ~CacheAlignedPool() {
        delete[] storage;
    }

    T* allocate() {
        if (freeList.empty()) return nullptr;

        AlignedT* wrapped = freeList.back();
        freeList.pop_back();
        
        return &wrapped->get();  // Return pointer to T inside wrapper
    }

    void deallocate(T* ptr) {
        // Calculate wrapper address
        AlignedT* wrapped = reinterpret_cast<AlignedT*>(
            reinterpret_cast<char*>(ptr) - offsetof(AlignedT, value)
        );

        freeList.push_back(wrapped);
    }
};

// Alternative: Allocate with alignment guarantees
template <typename T>
class AlignedPool {
    void* storage;
    size_t capacity;
    static constexpr size_t CACHE_LINE = 64;

public:
    AlignedPool(size_t n) : capacity(n) {
        // Allocate aligned memory
        storage = std::aligned_alloc(CACHE_LINE, sizeof(T) * n);
        
        if (!storage) throw std::bad_alloc();
        
        // Verify alignment
        assert(reinterpret_cast<uintptr_t>(storage) % CACHE_LINE == 0);
    }

    ~AlignedPool() {
        std::free(storage);  // Must use free for aligned_alloc
    }
};

// Usage example with counters (from Q13):
struct Counter {
    std::atomic<int> value{0};
};

using AlignedCounter = AlignedWrapper<Counter>;

void benchmark_aligned() {
    constexpr size_t NUM_THREADS = 8;
    constexpr size_t ITERATIONS = 10'000'000;

    AlignedCounter counters[NUM_THREADS];  // Each on own cache line

    std::vector<std::thread> threads;
    for (size_t i = 0; i < NUM_THREADS; ++i) {
        threads.emplace_back([&, i]() {
            for (size_t j = 0; j < ITERATIONS; ++j) {
                counters[i]->value.fetch_add(1, std::memory_order_relaxed);
            }
        });
    }

    for (auto& t : threads) t.join();

    // No false sharing - maximum performance
}
```

**Explanation:**
- **AlignedWrapper purpose:** Wraps type T to ensure it occupies entire cache line; prevents false sharing with adjacent objects; padding to cache line size (64 bytes); alignment to cache line boundary
- **C++17 std::hardware_destructive_interference_size:** Compile-time constant for cache line size; platform-specific (64 on x86, varies on others); portable way to avoid false sharing; guaranteed by compiler
- **Alignment vs size:** `alignas(64)` ensures **start** of wrapper on 64-byte boundary; padding ensures **entire** wrapper spans full cache line; both necessary for complete isolation
- **Padding calculation:** If `sizeof(T) < 64` → pad to 64 bytes, If `sizeof(T) >= 64` → no padding (already cache-line-sized or larger), Padding = CacheLineSize - sizeof(T)
- **Accessor methods:** `get()` returns reference to wrapped value; `operator*` for dereference-like syntax; `operator->` for member access; makes wrapper transparent
- **Perfect forwarding constructors:** `template <typename... Args> AlignedWrapper(Args&&... args)` forwards arguments to T's constructor; enables in-place construction; avoids copies
- **offsetof for deallocation:** Pool stores AlignedWrapper, returns T*; deallocate receives T*, must find containing AlignedWrapper; `offsetof(AlignedT, value)` gives offset of value in wrapper; subtract to get wrapper address
- **std::aligned_alloc alternative:** Allocates cache-line-aligned memory directly; no wrapper needed; must use `std::free()` for deallocation; simpler but less type-safe
- **Static assertions:** `static_assert(sizeof(...) == 64)` verifies wrapper is cache-line-sized; `static_assert(alignof(...) == 64)` verifies alignment; compile-time checks prevent errors
- **Memory cost:** 4-byte Counter → 64-byte AlignedCounter (16x overhead); 8-byte atomic → 64-byte (8x overhead); Expensive but worth it for contended data
- **When to use:** Hot loop counters (high contention), Thread-local accumulators, Lock-free data structures, Performance-critical shared state, **Not** for rarely accessed data
- **Key Concept:** AlignedWrapper pads and aligns type to cache line; prevents false sharing; uses alignas + padding; std::hardware_destructive_interference_size (C++17) for portability; accessor methods for transparency; offsetof to find wrapper from value pointer; expensive memory-wise but huge performance gain

---

#### Q15
Add statistics tracking:
```cpp
class MonitoredPool {
    // Track total allocations, deallocations, peak usage
    // Implement getStats() method
};
```

**Answer:**
```cpp
#include <iostream>
#include <atomic>

template <typename T>
class MonitoredPool {
    static constexpr size_t POOL_SIZE = 100;
    T* storage;
    std::vector<T*> freeList;

    // Statistics (thread-safe with atomics)
    std::atomic<size_t> totalAllocations{0};
    std::atomic<size_t> totalDeallocations{0};
    std::atomic<size_t> currentUsage{0};
    std::atomic<size_t> peakUsage{0};
    std::atomic<size_t> allocationFailures{0};

public:
    MonitoredPool() {
        storage = new T[POOL_SIZE];
        
        for (size_t i = 0; i < POOL_SIZE; ++i) {
            freeList.push_back(&storage[i]);
        }
    }

    ~MonitoredPool() {
        delete[] storage;
    }

    T* allocate() {
        if (freeList.empty()) {
            ++allocationFailures;
            return nullptr;
        }

        T* obj = freeList.back();
        freeList.pop_back();

        // Update statistics
        ++totalAllocations;
        ++currentUsage;

        // Update peak usage
        size_t current = currentUsage.load();
        size_t peak = peakUsage.load();
        while (current > peak && !peakUsage.compare_exchange_weak(peak, current)) {
            // Retry if another thread updated peak
        }

        return obj;
    }

    void deallocate(T* ptr) {
        freeList.push_back(ptr);

        // Update statistics
        ++totalDeallocations;
        --currentUsage;
    }

    struct Stats {
        size_t totalAllocations;
        size_t totalDeallocations;
        size_t currentUsage;
        size_t peakUsage;
        size_t allocationFailures;
        size_t capacity;
        double utilizationPercent;
        double failureRate;
    };

    Stats getStats() const {
        Stats stats;
        stats.totalAllocations = totalAllocations.load();
        stats.totalDeallocations = totalDeallocations.load();
        stats.currentUsage = currentUsage.load();
        stats.peakUsage = peakUsage.load();
        stats.allocationFailures = allocationFailures.load();
        stats.capacity = POOL_SIZE;
        
        stats.utilizationPercent = (stats.peakUsage * 100.0) / stats.capacity;
        
        if (stats.totalAllocations > 0) {
            stats.failureRate = (stats.allocationFailures * 100.0) / 
                               (stats.totalAllocations + stats.allocationFailures);
        } else {
            stats.failureRate = 0.0;
        }

        return stats;
    }

    void printStats() const {
        Stats stats = getStats();

        std::cout << "=== Pool Statistics ===\n";
        std::cout << "Capacity: " << stats.capacity << "\n";
        std::cout << "Total Allocations: " << stats.totalAllocations << "\n";
        std::cout << "Total Deallocations: " << stats.totalDeallocations << "\n";
        std::cout << "Current Usage: " << stats.currentUsage << "\n";
        std::cout << "Peak Usage: " << stats.peakUsage 
                  << " (" << stats.utilizationPercent << "%)\n";
        std::cout << "Allocation Failures: " << stats.allocationFailures
                  << " (" << stats.failureRate << "%)\n";
    }

    void resetStats() {
        totalAllocations.store(0);
        totalDeallocations.store(0);
        // Don't reset currentUsage (reflects actual state)
        peakUsage.store(currentUsage.load());
        allocationFailures.store(0);
    }
};

// Usage:
int main() {
    MonitoredPool<Resource> pool;

    // Allocate some objects
    std::vector<Resource*> objects;
    for (int i = 0; i < 50; ++i) {
        Resource* r = pool.allocate();
        if (r) objects.push_back(r);
    }

    // Deallocate half
    for (int i = 0; i < 25; ++i) {
        pool.deallocate(objects[i]);
    }

    // Try to allocate more (will use deallocated + fresh)
    for (int i = 0; i < 60; ++i) {
        Resource* r = pool.allocate();
        if (r) objects.push_back(r);
    }

    pool.printStats();
    // Output:
    // === Pool Statistics ===
    // Capacity: 100
    // Total Allocations: 110
    // Total Deallocations: 25
    // Current Usage: 85
    // Peak Usage: 85 (85%)
    // Allocation Failures: 10 (8.33%)

    return 0;
}
```

**Explanation:**
- **Why monitor pools:** Detect capacity issues (too small?), Track memory usage patterns, Identify leaks (deallocations < allocations), Performance tuning (failure rate), Production diagnostics
- **Atomic counters for thread safety:** `std::atomic<size_t>` for each statistic; thread-safe increment/decrement; no mutex needed for counters; lock-free performance
- **Statistics tracked:** `totalAllocations` - lifetime allocation count, `totalDeallocations` - lifetime deallocation count, `currentUsage` - currently allocated objects, `peakUsage` - maximum concurrent usage, `allocationFailures` - requests that returned nullptr
- **Peak usage update:** Read current usage; compare with stored peak; if current > peak, attempt CAS (compare_exchange_weak); retry if another thread updated peak; ensures accurate peak even under contention
- **Derived metrics:** Utilization: `peakUsage / capacity × 100%`, Failure rate: `failures / (allocations + failures) × 100%`, Leak indicator: `currentUsage - (totalAllocations - totalDeallocations)`
- **Stats struct:** Return snapshot of all statistics; immutable struct (all const values); thread-safe to read (atomics); user can store and compare snapshots
- **Reset functionality:** Clear counters for new measurement period; preserve currentUsage (reflects actual state); reset peak to current (start fresh tracking); useful for phase-based profiling
- **Performance overhead:** Atomic increment/decrement per operation; minimal overhead (few cycles); compare-exchange for peak (slightly more); **worth it for diagnostics**
- **Production usage:** Enable in debug/staging builds; conditionally compile out in release (#ifndef NDEBUG); or use template parameter to enable/disable; or runtime flag
- **Advanced monitoring:** Histogram of allocation durations, Fragmentation metrics, Thread-contention counters, Allocation size distribution, Time-series data
- **Key Concept:** Monitor pools with atomic counters for diagnostics; track allocations, deallocations, current usage, peak usage, failures; thread-safe atomics avoid mutex overhead; compute utilization and failure rate; reset for periodic measurement; minimal performance cost for valuable insights

---

#### Q16
Fix the alignment bug:
```cpp
class Pool {
    char* storage = new char[sizeof(T) * 100];

    T* allocate() {
        return reinterpret_cast<T*>(storage);  // May be misaligned!
    }
};
```

**Answer:**
```cpp
// Problem: new char[] has no alignment guarantees beyond alignof(char) = 1
// If T requires 8, 16, or more byte alignment, storage may be misaligned

// Fix 1: Use alignas with array (C++11)
template <typename T>
class Pool {
    static constexpr size_t POOL_SIZE = 100;
    alignas(T) char storage[sizeof(T) * POOL_SIZE];  // Aligned to T's requirement
    
public:
    T* allocate() {
        // storage guaranteed aligned for T
        return reinterpret_cast<T*>(storage);
    }
};

// Fix 2: Use std::aligned_alloc (C++17)
template <typename T>
class Pool {
    void* storage;
    static constexpr size_t POOL_SIZE = 100;
    
public:
    Pool() {
        storage = std::aligned_alloc(alignof(T), sizeof(T) * POOL_SIZE);
        if (!storage) throw std::bad_alloc();
    }
    
    ~Pool() {
        std::free(storage);  // Must use free, not delete
    }
    
    T* allocate() {
        return static_cast<T*>(storage);
    }
};

// Fix 3: Verify alignment at runtime
template <typename T>
class Pool {
    char* storage = new char[sizeof(T) * 100];
    
public:
    Pool() {
        uintptr_t addr = reinterpret_cast<uintptr_t>(storage);
        if (addr % alignof(T) != 0) {
            delete[] storage;
            throw std::runtime_error("Storage misaligned");
        }
    }
    
    T* allocate() {
        return reinterpret_cast<T*>(storage);
    }
};

// Example demonstrating the bug:
struct alignas(16) Vec4 {
    float x, y, z, w;
};

int main() {
    // Buggy version:
    char* storage = new char[sizeof(Vec4) * 10];
    Vec4* v = reinterpret_cast<Vec4*>(storage);
    
    uintptr_t addr = reinterpret_cast<uintptr_t>(v);
    std::cout << "Alignment: " << (addr % 16) << "\n";
    // Output: Alignment: 8 (or other non-zero value)
    // MISALIGNED! Causes crash if using SIMD instructions
    
    // Fixed version:
    alignas(Vec4) char fixedStorage[sizeof(Vec4) * 10];
    Vec4* vFixed = reinterpret_cast<Vec4*>(fixedStorage);
    
    addr = reinterpret_cast<uintptr_t>(vFixed);
    std::cout << "Alignment: " << (addr % 16) << "\n";
    // Output: Alignment: 0
    // CORRECTLY ALIGNED!
    
    return 0;
}
```

**Explanation:**
- **The alignment bug:** `new char[]` allocates with `alignof(char)` = 1 byte alignment; no guarantee for larger alignments (8, 16, 32, 64 bytes); if T requires alignment > 1, storage may be misaligned; **undefined behavior** or crash
- **Why alignment matters:** CPU performance (aligned access faster), SIMD requirements (SSE, AVX require 16/32-byte alignment), Atomic operations (some architectures require natural alignment), Hardware restrictions (some types must be aligned)
- **Alignment requirements:** `alignof(T)` gives required alignment for type T; `int`: 4 bytes, `double`: 8 bytes, SIMD types (Vec4, __m128): 16 bytes, AVX (__m256): 32 bytes, Cache line: 64 bytes
- **Fix 1: alignas array (C++11):** `alignas(T) char storage[...]` aligns array to T's requirement; compiler guarantees proper alignment; works for stack/static arrays; simple and type-safe
- **Fix 2: std::aligned_alloc (C++17):** Allocates heap memory with specified alignment; `std::aligned_alloc(alignof(T), size)`; **must use std::free()**, not delete; portable across platforms
- **Fix 3: Runtime verification:** Check `addr % alignof(T) == 0` after allocation; throws if misaligned; catches bugs early; but better to fix at allocation
- **What happens with misalignment:** SIMD crash (segfault on misaligned load/store), Performance penalty (CPU does two memory accesses), Atomic operations fail (undefined behavior on some architectures), Silent data corruption (rare but possible)
- **new char[] alignment:** C++ standard: "new returns pointer aligned for any type"; **but** this is for "new T", not "new char[]"; "new char[]" only guarantees alignof(char) = 1; common misconception
- **C++17 new with alignment:** `new (std::align_val_t{64}) char[100]` allocates with specified alignment; equivalent to aligned_alloc but uses operator new; less common
- **Detection:** Enable alignment sanitizer: `-fsanitize=alignment`; crashes on misaligned access; static analysis tools (clang-tidy); manual verification (print addresses % alignof)
- **Key Concept:** new char[] doesn't guarantee alignment beyond 1 byte; types requiring larger alignment may be misaligned; use alignas for arrays or std::aligned_alloc for heap; verify alignment at runtime; misalignment causes crashes, performance issues, UB; SIMD types especially sensitive

---

#### Q17
Implement exhaustion handling:
```cpp
class Pool {
    T* allocate() {
        if (freeList.empty()) {
            // Implement 3 different strategies:
            // 1. Throw exception
            // 2. Return nullptr
            // 3. Allocate new chunk
        }
    }
};
```

**Answer:**
```cpp
#include <stdexcept>

// Strategy 1: Throw exception
template <typename T>
class ThrowingPool {
    std::vector<T*> freeList;
    
public:
    T* allocate() {
        if (freeList.empty()) {
            throw std::bad_alloc();  // Or custom exception
        }
        
        T* obj = freeList.back();
        freeList.pop_back();
        return obj;
    }
};

// Strategy 2: Return nullptr
template <typename T>
class NullablePool {
    std::vector<T*> freeList;
    
public:
    T* allocate() noexcept {
        if (freeList.empty()) {
            return nullptr;  // Caller must check
        }
        
        T* obj = freeList.back();
        freeList.pop_back();
        return obj;
    }
};

// Strategy 3: Allocate new chunk (expandable pool)
template <typename T>
class ExpandablePool {
    std::vector<T*> chunks;
    std::vector<T*> freeList;
    static constexpr size_t CHUNK_SIZE = 100;
    
public:
    ExpandablePool() {
        addChunk();  // Start with one chunk
    }
    
    ~ExpandablePool() {
        for (T* chunk : chunks) {
            delete[] chunk;
        }
    }
    
    T* allocate() {
        if (freeList.empty()) {
            addChunk();  // Expand pool automatically
        }
        
        T* obj = freeList.back();
        freeList.pop_back();
        return obj;
    }
    
    void deallocate(T* ptr) {
        freeList.push_back(ptr);
    }
    
private:
    void addChunk() {
        T* newChunk = new T[CHUNK_SIZE];
        chunks.push_back(newChunk);
        
        for (size_t i = 0; i < CHUNK_SIZE; ++i) {
            freeList.push_back(&newChunk[i]);
        }
    }
};

// Strategy 4: Hybrid - try expand, then throw/return null
template <typename T>
class HybridPool {
    std::vector<T*> chunks;
    std::vector<T*> freeList;
    static constexpr size_t CHUNK_SIZE = 100;
    static constexpr size_t MAX_CHUNKS = 10;  // Limit growth
    
public:
    T* allocate() {
        if (freeList.empty()) {
            if (chunks.size() < MAX_CHUNKS) {
                addChunk();  // Expand if below limit
            } else {
                return nullptr;  // Hit limit, return nullptr
                // Or: throw std::bad_alloc();
            }
        }
        
        T* obj = freeList.back();
        freeList.pop_back();
        return obj;
    }
};

// Strategy comparison:
void compare_strategies() {
    // Strategy 1: Throwing
    {
        ThrowingPool<int> pool;
        try {
            int* p = pool.allocate();
            // Use p...
        } catch (const std::bad_alloc&) {
            // Handle exhaustion
        }
        
        // Pros: Can't forget to check (exception forces handling)
        // Cons: Exception overhead, stack unwinding
        // Use when: Allocation failure is exceptional, not expected
    }
    
    // Strategy 2: Nullable
    {
        NullablePool<int> pool;
        int* p = pool.allocate();
        if (!p) {
            // Handle exhaustion
        } else {
            // Use p...
        }
        
        // Pros: No exception overhead, explicit check
        // Cons: Easy to forget null check (UB if dereferenced)
        // Use when: Allocation failure is common, performance-critical
    }
    
    // Strategy 3: Expandable
    {
        ExpandablePool<int> pool;
        int* p = pool.allocate();  // Never fails (until OOM)
        // Use p...
        
        // Pros: No failure handling needed, automatic growth
        // Cons: Unbounded memory growth, fragmentation
        // Use when: Unpredictable demand, memory available
    }
    
    // Strategy 4: Hybrid
    {
        HybridPool<int> pool;
        int* p = pool.allocate();
        if (!p) {
            // Hit limit
        }
        
        // Pros: Controlled growth, explicit limit
        // Cons: Still need to handle failure
        // Use when: Want growth but with limits
    }
}
```

**Explanation:**
- **Strategy 1: Throw exception - Pros:** Forces error handling (can't ignore), Clean error propagation (exceptions), No null checks needed (strong guarantee); **Cons:** Exception overhead (stack unwinding, performance), Control flow complexity (harder to reason about), May terminate if uncaught
- **Strategy 1 - When to use:** Allocation failure is **exceptional** (rare), Prefer strong error guarantees, Not performance-critical path, Consistent with STL (std::vector throws)
- **Strategy 2: Return nullptr - Pros:** Zero overhead (no exception), Explicit check at call site, Works in no except code (`noexcept`); **Cons:** Easy to forget null check (UB if missed), Verbose (if (!p) everywhere), Error-prone (silent bugs)
- **Strategy 2 - When to use:** Performance-critical (hot path), Allocation failure common/expected, Embedded systems (no exceptions), Interfacing with C code
- **Strategy 3: Expandable pool - Pros:** Never fails (until OS OOM), No failure handling needed, Adapts to demand automatically; **Cons:** Unbounded memory growth, Can't predict memory usage, Fragmentation (many chunks), Slower deallocation (find owning chunk)
- **Strategy 3 - When to use:** Demand unpredictable, Memory plentiful, Development/testing (ease of use), Not real-time (growth has latency)
- **Strategy 4: Hybrid - Pros:** Controlled growth (max limit), Graceful degradation, Balance of expansion and safety; **Cons:** More complex logic, Still need failure handling, Limit may be arbitrary
- **Error handling patterns:** Exception: Use RAII (auto-cleanup), Nullable: Check at every call site, Expandable: Assume success (check OOM only), Hybrid: Check after allocation
- **Performance comparison:** Exception: Slowest (stack unwinding), Nullable: Fastest (just branch), Expandable: Medium (allocation overhead), Hybrid: Like expandable until limit
- **Real-world examples:** STL containers: Throw (std::bad_alloc), C malloc: Return nullptr, Game engines: Expandable pools, Database pools: Hybrid with limits
- **Key Concept:** Three exhaustion strategies: throw exception (forces handling), return nullptr (explicit check), expand pool (auto-growth); trade-offs: exception overhead vs null-check burden vs unbounded growth; choose based on: failure frequency, performance needs, memory constraints; hybrid combines expansion with limits

---

#### Q18
Detect out-of-pool pointers:
```cpp
void deallocate(T* ptr) {
    // Validate ptr is from this pool before deallocating
}
```

**Answer:**
```cpp
template <typename T>
class ValidatingPool {
    static constexpr size_t POOL_SIZE = 100;
    T* storage;
    std::vector<T*> freeList;

public:
    ValidatingPool() {
        storage = new T[POOL_SIZE];
        
        for (size_t i = 0; i < POOL_SIZE; ++i) {
            freeList.push_back(&storage[i]);
        }
    }

    ~ValidatingPool() {
        delete[] storage;
    }

    T* allocate() {
        if (freeList.empty()) return nullptr;
        
        T* obj = freeList.back();
        freeList.pop_back();
        return obj;
    }

    void deallocate(T* ptr) {
        // Validation 1: Nullptr check
        if (ptr == nullptr) {
            throw std::invalid_argument("Cannot deallocate nullptr");
        }

        // Validation 2: Range check
        if (ptr < storage || ptr >= storage + POOL_SIZE) {
            throw std::out_of_range("Pointer not from this pool");
        }

        // Validation 3: Alignment check
        ptrdiff_t offset = ptr - storage;
        if (offset % sizeof(T) != 0) {
            throw std::invalid_argument("Pointer misaligned (not pointing to object boundary)");
        }

        // Validation 4: Double-free check (optional, requires tracking)
        for (const T* free_ptr : freeList) {
            if (free_ptr == ptr) {
                throw std::logic_error("Double-free detected");
            }
        }

        // All checks passed - return to pool
        freeList.push_back(ptr);
    }

    // More efficient double-free check with set
    std::unordered_set<T*> freeSet;

    void deallocateWithSet(T* ptr) {
        // Null check
        if (!ptr) {
            throw std::invalid_argument("nullptr deallocate");
        }

        // Range check
        if (!isFromPool(ptr)) {
            throw std::out_of_range("Not from pool");
        }

        // Alignment check
        if (!isAligned(ptr)) {
            throw std::invalid_argument("Misaligned pointer");
        }

        // Double-free check (O(1) with set)
        if (freeSet.count(ptr) > 0) {
            throw std::logic_error("Double-free");
        }

        freeList.push_back(ptr);
        freeSet.insert(ptr);
    }

private:
    bool isFromPool(T* ptr) const {
        return ptr >= storage && ptr < storage + POOL_SIZE;
    }

    bool isAligned(T* ptr) const {
        ptrdiff_t offset = ptr - storage;
        return offset >= 0 && offset % sizeof(T) == 0;
    }
};

// For chunked pools:
template <typename T>
class ChunkedValidatingPool {
    std::vector<T*> chunks;
    static constexpr size_t CHUNK_SIZE = 100;

public:
    void deallocate(T* ptr) {
        if (!ptr) {
            throw std::invalid_argument("nullptr");
        }

        // Find owning chunk
        T* owningChunk = nullptr;
        for (T* chunk : chunks) {
            if (ptr >= chunk && ptr < chunk + CHUNK_SIZE) {
                owningChunk = chunk;
                break;
            }
        }

        if (!owning Chunk) {
            throw std::out_of_range("Pointer not from any chunk");
        }

        // Validate alignment
        ptrdiff_t offset = ptr - owningChunk;
        if (offset % sizeof(T) != 0) {
            throw std::invalid_argument("Misaligned within chunk");
        }

        // Return to free list
        freeList.push_back(ptr);
    }

    // Alternative: Store valid range per chunk
    struct ChunkInfo {
        T* start;
        T* end;
    };
    
    std::vector<ChunkInfo> chunkRanges;

    bool isFromAnyChunk(T* ptr) const {
        for (const auto& range : chunkRanges) {
            if (ptr >= range.start && ptr < range.end) {
                return true;
            }
        }
        return false;
    }
};

// Compile-time validation with type tags
template <typename T>
class TaggedPool {
    struct PoolTag {};  // Unique tag for this pool
    
public:
    struct Handle {
        T* ptr;
        PoolTag tag;  // Carries pool identity
    };

    Handle allocate() {
        T* ptr = internalAllocate();
        return {ptr, PoolTag{}};
    }

    void deallocate(Handle handle) {
        // handle.tag proves this came from this pool
        // Compile-time check!
        internalDeallocate(handle.ptr);
    }

    // Won't compile: can't pass raw pointer
    // void deallocate(T* ptr);  // Not defined
};
```

**Explanation:**
- **Validation necessity:** User may pass random pointer (not from pool), May pass pointer to middle of object (misaligned), May deallocate twice (double-free), May pass nullptr; **all cause corruption** - must detect
- **Validation 1: Nullptr check:** `if (ptr == nullptr) throw`; simplest check; prevents freeList from storing nullptr; catches common mistake
- **Validation 2: Range check:** `if (ptr < storage || ptr >= storage + POOL_SIZE) throw`; ensures pointer within pool's memory range; catches completely external pointers; O(1) check for single-chunk
- **Validation 3: Alignment check:** `offset = ptr - storage; if (offset % sizeof(T) != 0) throw`; ensures pointer aligned to object boundary; catches pointers to middle of objects (e.g., `&obj.member`); prevents corrupting pool structure
- **Validation 4: Double-free check:** Linear search O(n): iterate freeList, check if ptr already there; Set-based O(1): maintain `unordered_set<T*>` of free pointers, check membership; trade-off: memory for speed
- **Chunked pools - more complex:** Must check **all** chunks: linear search through chunks; for each chunk: `if (ptr >= start && ptr < end)`; can optimize: cache last chunk, store chunk ranges in vector
- **Performance cost:** Null check: ~0 cycles (optimized away), Range check: ~2 cycles (two comparisons), Alignment check: ~5 cycles (division/modulo), Double-free O(n): expensive (avoid in hot path), Double-free O(1) with set: ~10-20 cycles (hash lookup)
- **Debug vs release:** Full validation in debug builds (`#ifndef NDEBUG`), Minimal validation in release (null + range only), Or compile-time flag to enable/disable, Balance: safety vs performance
- **Type-based validation (Handle):** Return Handle (wrapper) instead of raw pointer; Handle contains pool identity tag; deallocate requires Handle (can't pass raw pointer); **compile-time enforcement** of pool ownership; harder to misuse
- **Alternative: Cookies/magic numbers:** Store "magic number" before/after each object; check magic on deallocate; detects buffer overruns too; overhead: extra bytes per object
- **Real-world patterns:** STL debug mode: Full validation with iterators, Valgrind/AddressSanitizer: Runtime checks for invalid free, Production pools: Minimal checks (null + range)
- **Key Concept:** Validate pointers on deallocate to prevent corruption; check: null, range (in pool bounds), alignment (object boundary), double-free (already in free list); range check O(1) single-chunk, O(chunks) multi-chunk; double-free O(1) with set; debug builds: full validation, release: minimal; type-safe handles prevent raw pointer misuse

---

#### Q19
Implement RAII pool handle:
```cpp
template <typename T>
class PoolHandle {
    // Automatically returns object to pool on destruction
};
```

**Answer:**
```cpp
#include <memory>

template <typename T>
class Pool;  // Forward declaration

// RAII handle that auto-returns to pool
template <typename T>
class PoolHandle {
    T* ptr;
    Pool<T>* pool;

public:
    // Constructor
    PoolHandle(T* p, Pool<T>* owner) : ptr(p), pool(owner) {}

    // Move constructor/assignment (transfer ownership)
    PoolHandle(PoolHandle&& other) noexcept 
        : ptr(other.ptr), pool(other.pool) {
        other.ptr = nullptr;
        other.pool = nullptr;
    }

    PoolHandle& operator=(PoolHandle&& other) noexcept {
        if (this != &other) {
            release();  // Return current object
            ptr = other.ptr;
            pool = other.pool;
            other.ptr = nullptr;
            other.pool = nullptr;
        }
        return *this;
    }

    // Delete copy (unique ownership)
    PoolHandle(const PoolHandle&) = delete;
    PoolHandle& operator=(const PoolHandle&) = delete;

    // Destructor - auto-return to pool
    ~PoolHandle() {
        release();
    }

    // Access operators
    T* operator->() { return ptr; }
    const T* operator->() const { return ptr; }

    T& operator*() { return *ptr; }
    const T& operator*() const { return *ptr; }

    T* get() { return ptr; }
    const T* get() const { return ptr; }

    explicit operator bool() const { return ptr != nullptr; }

    // Manual release (return to pool before destruction)
    void release() {
        if (ptr && pool) {
            pool->deallocate(ptr);
            ptr = nullptr;
            pool = nullptr;
        }
    }
};

// Pool that returns handles instead of raw pointers
template <typename T>
class Pool {
    static constexpr size_t POOL_SIZE = 100;
    T* storage;
    std::vector<T*> freeList;

public:
    Pool() {
        storage = new T[POOL_SIZE];
        for (size_t i = 0; i < POOL_SIZE; ++i) {
            freeList.push_back(&storage[i]);
        }
    }

    ~Pool() {
        delete[] storage;
    }

    // Return handle instead of raw pointer
    PoolHandle<T> allocate() {
        if (freeList.empty()) {
            return PoolHandle<T>(nullptr, this);
        }

        T* obj = freeList.back();
        freeList.pop_back();
        return PoolHandle<T>(obj, this);
    }

    // Internal deallocation (called by handle)
    void deallocate(T* ptr) {
        freeList.push_back(ptr);
    }

    friend class PoolHandle<T>;
};

// Alternative: Use std::unique_ptr with custom deleter
template <typename T>
class PoolWithDeleter {
    static constexpr size_t POOL_SIZE = 100;
    T* storage;
    std::vector<T*> freeList;

public:
    Pool() { /* ... */ }

    // Custom deleter that returns to pool
    struct PoolDeleter {
        Pool* pool;

        void operator()(T* ptr) const {
            if (pool) {
                pool->deallocate(ptr);
            }
        }
    };

    using PoolPtr = std::unique_ptr<T, PoolDeleter>;

    PoolPtr allocate() {
        if (freeList.empty()) {
            return PoolPtr(nullptr, PoolDeleter{this});
        }

        T* obj = freeList.back();
        freeList.pop_back();
        return PoolPtr(obj, PoolDeleter{this});
    }

    void deallocate(T* ptr) {
        freeList.push_back(ptr);
    }
};

// Usage examples:
void example_usage() {
    Pool<Resource> pool;

    // Automatic return to pool
    {
        auto handle = pool.allocate();
        handle->data = "Hello";
        handle->values = {1, 2, 3};
        // ... use handle
    }  // handle destroyed → automatically returned to pool

    // Move semantics
    {
        auto h1 = pool.allocate();
        auto h2 = std::move(h1);  // Transfer ownership
        // h1 is now empty
        // h2 owns the object
    }  // h2 destroyed → object returned

    // Can't copy (prevents double-free)
    {
        auto h1 = pool.allocate();
        // auto h2 = h1;  // ERROR: copy deleted
    }

    // Early release
    {
        auto handle = pool.allocate();
        // ... use handle
        handle.release();  // Return now, before destruction
        // handle is now empty
    }

    // With std::unique_ptr
    PoolWithDeleter<Resource> pool2;
    {
        auto ptr = pool2.allocate();  // std::unique_ptr
        ptr->data = "World";
        // Works with unique_ptr API
        if (ptr) { /* ... */ }
    }  // Custom deleter returns to pool
}
```

**Explanation:**
- **RAII principle:** Resource Acquisition Is Initialization; allocate in constructor, deallocate in destructor; automatic lifetime management; can't forget to deallocate
- **PoolHandle design:** Holds `T*` (the object) and `Pool<T>*` (owner pool); destructor calls `pool->deallocate(ptr)`; move-only (unique ownership); prevents double-free and leaks
- **Move semantics:** Move constructor transfers ownership; sets source `ptr` to nullptr (moved-from state); move assignment releases old object first; enables return by value, storage in containers
- **Deleted copy:** `PoolHandle(const PoolHandle&) = delete`; prevents copying (would cause double-free); ensures unique ownership; compile-time error if attempted
- **Access operators:** `operator->`, `operator*` for pointer-like syntax; `get()` for raw pointer access; `operator bool` to check if valid; transparent usage like raw pointer
- **Manual release:** `release()` returns object early; sets ptr/pool to nullptr; useful for early return; destructor safe (checks nullptr)
- **std::unique_ptr alternative:** Use `std::unique_ptr<T, PoolDeleter>`; custom deleter returns to pool; standard library guarantee (move-only, exception-safe); familiar API
- **Benefits over raw pointers:** Can't forget to deallocate (automatic), Can't double-free (move-only), Can't leak (RAII), Exception-safe (destructor always runs), Self-documenting (handle = pool-allocated)
- **Performance:** Zero overhead vs manual deallocate; compiler optimizes (inlines destructor); move is cheap (two pointer copies); same as std::unique_ptr
- **Trade-offs:** Slightly more complex API (handle vs pointer), Must use handle (can't pass raw pointer), May complicate interfaces (takes handle not ptr), Worth it for safety
- **Real-world usage:** Database connection pools (auto-return connections), Thread pools (auto-return threads), Memory pools (auto-return allocations), Resource managers (textures, files, sockets)
- **Key Concept:** RAII handle auto-returns object to pool on destruction; holds ptr + pool owner; move-only for unique ownership; access operators for transparency; manual release for early return; std::unique_ptr with custom deleter is alternative; prevents leaks, double-frees; exception-safe; zero overhead

---

#### Q20
Fix the memory leak on pool destruction:
```cpp
class Pool {
    T* storage;
    std::vector<T*> freeList;
    size_t capacity;

    ~Pool() {
        delete[] storage;
        // What if freeList.size() < capacity?
        // Some objects still allocated - leak!
    }
};
```

**Answer:**
```cpp
// Problem: User still holds pointers to allocated objects
// Pool destructor deletes storage but user has dangling pointers
// User dereferences → use-after-free (UB)

// Fix 1: Require all objects returned before destruction
template <typename T>
class StrictPool {
    static constexpr size_t POOL_SIZE = 100;
    T* storage;
    std::vector<T*> freeList;

public:
    StrictPool() {
        storage = new T[POOL_SIZE];
        for (size_t i = 0; i < POOL_SIZE; ++i) {
            freeList.push_back(&storage[i]);
        }
    }

    ~StrictPool() {
        // Assert all objects returned
        if (freeList.size() != POOL_SIZE) {
            std::cerr << "ERROR: Pool destroyed with " 
                      << (POOL_SIZE - freeList.size()) 
                      << " objects still allocated!\n";
            std::terminate();  // Or assert in debug
        }

        delete[] storage;
    }
};

// Fix 2: Track allocated objects and destroy them
template <typename T>
class SafePool {
    static constexpr size_t POOL_SIZE = 100;
    T* storage;
    std::vector<T*> freeList;
    std::unordered_set<T*> allocatedSet;  // Track allocated

public:
    SafePool() {
        storage = new T[POOL_SIZE];
        for (size_t i = 0; i < POOL_SIZE; ++i) {
            freeList.push_back(&storage[i]);
        }
    }

    T* allocate() {
        if (freeList.empty()) return nullptr;

        T* obj = freeList.back();
        freeList.pop_back();
        allocatedSet.insert(obj);  // Track
        return obj;
    }

    void deallocate(T* ptr) {
        allocatedSet.erase(ptr);
        freeList.push_back(ptr);
    }

    ~SafePool() {
        // Destroy all still-allocated objects
        for (T* obj : allocatedSet) {
            // Call destructor if needed
            obj->~T();
        }

        // Now safe to delete storage
        delete[] storage;

        // User pointers now dangling but won't crash pool
    }
};

// Fix 3: Use shared ownership (shared_ptr)
template <typename T>
class SharedPool {
    struct PoolData {
        T* storage;
        size_t capacity;
        std::vector<T*> freeList;

        PoolData(size_t n) : capacity(n) {
            storage = new T[n];
            for (size_t i = 0; i < n; ++i) {
                freeList.push_back(&storage[i]);
            }
        }

        ~PoolData() {
            delete[] storage;
        }
    };

    std::shared_ptr<PoolData> data;

public:
    SharedPool(size_t n) 
        : data(std::make_shared<PoolData>(n)) {}

    std::shared_ptr<T> allocate() {
        if (data->freeList.empty()) return nullptr;

        T* obj = data->freeList.back();
        data->freeList.pop_back();

        // Custom deleter returns to pool
        return std::shared_ptr<T>(obj, [weak = std::weak_ptr<PoolData>(data)](T* ptr) {
            if (auto pool = weak.lock()) {
                pool->freeList.push_back(ptr);
            }
            // If pool destroyed, just don't return
        });
    }

    // Pool can be destroyed while objects alive
    // Storage kept alive by shared_ptr
    // When last object destroyed, storage deleted
};

// Fix 4: Document and enforce with RAII handles (from Q19)
template <typename T>
class HandlePool {
    // Returns PoolHandle, not raw pointer
    // PoolHandle destructor auto-returns to pool
    // If user destroys pool first:
    //   - Handles become invalid
    //   - Handle destructor checks if pool alive
    //   - Safe even if misused
};

// Demonstration of the problem:
void demonstrate_leak() {
    std::vector<int*> leakedPointers;

    {
        StrictPool<int> pool;

        // Allocate some objects
        for (int i = 0; i < 10; ++i) {
            int* obj = pool.allocate();
            leakedPointers.push_back(obj);
            // Don't return to pool!
        }

        // Pool destroyed here
        // ERROR: Objects still allocated!
        // Terminates program in StrictPool
    }

    // Now leakedPointers contains dangling pointers
    // Using them is undefined behavior:
    // *leakedPointers[0] = 42;  // Use-after-free!
}

// Best practices:
void best_practices() {
    // 1. Use RAII handles (auto-return)
    {
        Pool<Resource> pool;
        auto handle = pool.allocate();  // RAII handle
        // ... use handle
    }  // Auto-returned, pool can destroy safely

    // 2. Document pool lifetime requirements
    // "Pool must outlive all allocated objects"
    // Static analysis can help enforce

    // 3. Debug assertions
    #ifndef NDEBUG
        // Assert all returned in destructor
    #endif

    // 4. Shared ownership for complex lifetimes
    // Use shared_ptr if pool/object lifetimes unclear
}
```

**Explanation:**
- **The leak problem:** Pool destroyed while objects still allocated; `delete[] storage` frees memory; user still holds pointers → **dangling pointers**; dereferencing = use-after-free (UB); hard to debug (crashes later, not at destruction)
- **Why this happens:** User forgets to return objects, Exception thrown before deallocation, Complex control flow (early returns), Pool destroyed before objects; **common mistake** in manual memory management
- **Fix 1: Assert all returned:** Check `freeList.size() == POOL_SIZE` in destructor; if not → log error and `std::terminate()`; **detects** problem but doesn't fix; forces user to fix code; good for development/testing
- **Fix 2: Destroy allocated objects:** Track allocated objects in `std::unordered_set`; in destructor: iterate allocated objects, call destructors (`obj->~T()`), then delete storage; **prevents** use-after-free of storage; but user pointers still dangle (safer than crashing)
- **Fix 3: Shared ownership:** Pool data in `std::shared_ptr<PoolData>`; allocated objects hold weak_ptr to pool; custom deleter checks if pool alive; storage kept alive until last object destroyed; **solves** lifetime issue but complex and overhead
- **Fix 4: RAII handles (best):** Return handles, not raw pointers; handles auto-return on destruction; can't forget to deallocate; pool can safely destroy when all handles gone; **prevents** problem at design level
- **Comparison:** Assert: Detects but doesn't fix; Destroy allocated: Prevents crash; Shared: Solves lifetime; Handles: Prevents problem; Best: Handles for new code, Assert for debug, Shared for complex cases
- **Use-after-free consequences:** Reading: May return garbage or crash, Writing: Corrupts other allocations or crashes, Hard to debug: Crash far from cause, Silent corruption possible
- **Detection tools:** AddressSanitizer: Detects use-after-free, Valgrind: Reports invalid reads/writes, Static analysis: Finds lifetime issues, Debug allocators: Fill freed memory with pattern
- **Real-world impact:** Production crashes (intermittent), Security vulnerabilities (exploitable), Data corruption (silent failures); **must** prevent or detect
- **Best practice order:** 1. Use RAII handles (prevention), 2. Static lifetime analysis (detection at compile-time), 3. Runtime assertions (detection at runtime), 4. Documentation (user awareness), 5. Shared ownership (complex cases only)
- **Key Concept:** Pool destruction with live allocations creates dangling pointers; use-after-free is UB; assert all returned (detect), destroy allocated objects (mitigate), shared ownership (solve lifetimes), RAII handles (prevent); handles best for new code; problem common in manual management; serious consequences (crashes, corruption, exploits)

---

