# TOPIC: Object Pool & Memory Pool Patterns

---

### THEORY_SECTION: Core Concepts and Foundations
#### 1. Object Pool Pattern Overview

**Definition:** Pre-allocates and manages a collection of reusable objects, lending them to clients instead of creating/destroying on demand.

**Core Concept:**

```cpp
// Simplified Object Pool
template <typename T, size_t PoolSize>
class ObjectPool {
    T storage[PoolSize];           // Pre-allocated objects
    std::vector<T*> freeList;      // Available objects
    bool inUse[PoolSize] = {};     // Track allocation state

public:
    ObjectPool() {
        // Initialize free list with all objects
        for (size_t i = 0; i < PoolSize; ++i) {
            freeList.push_back(&storage[i]);
        }
    }

    T* allocate() {
        if (freeList.empty()) return nullptr;
        T* obj = freeList.back();
        freeList.pop_back();
        return obj;  // ✅ O(1) allocation
    }

    void deallocate(T* obj) {
        freeList.push_back(obj);  // ✅ O(1) deallocation
    }
};
```

**Lifecycle Comparison:**

| Operation | Traditional (new/delete) | Object Pool |
|-----------|------------------------|-------------|
| **Initial cost** | None | Pre-allocate all objects |
| **Per-allocation** | Heap allocation (~100ns) | Pop from free list (~5ns) |
| **Per-deallocation** | Heap deallocation (~100ns) | Push to free list (~5ns) |
| **Fragmentation** | ❌ Increases over time | ✅ Zero (fixed memory) |
| **Timing** | ⚠️ Unpredictable (GC, OS) | ✅ Deterministic O(1) |
| **Cache locality** | ⚠️ Scattered | ✅ Contiguous array |

**Speedup:** 10-100x faster than heap allocation for small, frequently-created objects.

#### 2. Object Pool vs Memory Pool

**Abstraction Levels:**

| Aspect | Object Pool | Memory Pool |
|--------|-------------|-------------|
| **Manages** | Constructed objects (T) | Raw memory blocks (void*) |
| **Type safety** | ✅ Strongly typed | ❌ Type-agnostic |
| **Construction** | Objects pre-constructed | Requires placement new |
| **Destruction** | Optional reset/reuse | Manual destructor calls |
| **Use case** | Single type, frequent reuse | Multiple types, custom allocators |
| **Interface** | `allocate()` returns T* | `allocate(size)` returns void* |

**Object Pool Example:**

```cpp
// Object Pool - type-specific, objects ready
ObjectPool<SensorReading, 1000> sensorPool;

auto* reading = sensorPool.allocate();  // ✅ Ready to use
reading->timestamp = now();
reading->value = 42.0;

sensorPool.deallocate(reading);  // ✅ Object returned to pool
```

**Memory Pool Example:**

```cpp
// Memory Pool - raw bytes, placement new required
MemoryPool pool(1000 * sizeof(SensorReading));

void* mem = pool.allocate(sizeof(SensorReading));
SensorReading* reading = new (mem) SensorReading();  // Placement new

reading->~SensorReading();  // Manual destructor
pool.deallocate(mem);
```

**Decision Matrix:**

```
Same type allocated repeatedly? ──YES──> Object Pool
         │
         NO
         ↓
Multiple types, custom allocator? ──YES──> Memory Pool
         │
         NO
         ↓
Just use heap allocation (new/delete)
```

#### 3. Object Pools in Autonomous Vehicles

**Critical Use Cases:**

| Component | Frequency | Pool Size | Performance Requirement |
|-----------|-----------|-----------|------------------------|
| **LiDAR point clouds** | 10Hz × 100k points | ~1M points | < 10ms processing |
| **Radar detections** | 20Hz × 100 objects | ~2k objects | < 5ms latency |
| **Particle filters** | 100Hz × 1k particles | ~100k particles | < 1ms per cycle |
| **Path planning nodes** | On-demand, ~10k/sec | ~50k nodes | < 100μs per node |
| **Message buffers** | 1kHz inter-process | ~10k buffers | < 10μs allocation |

**Performance Benefits:**

**A. Real-Time Determinism:**

```cpp
// ❌ Traditional heap allocation - unpredictable timing
void processLidarFrame() {
    for (int i = 0; i < 100000; ++i) {
        auto* point = new Point3D();  // ⚠️ May trigger GC, fragmentation
        processPoint(point);
        delete point;  // ⚠️ Timing varies: 50-500ns
    }
}
// Total: 5-50ms (10x variance!)

// ✅ Object pool - deterministic timing
ObjectPool<Point3D, 100000> pointPool;

void processLidarFrame() {
    for (int i = 0; i < 100000; ++i) {
        auto* point = pointPool.allocate();  // ✅ Always ~5ns
        processPoint(point);
        pointPool.deallocate(point);  // ✅ Always ~5ns
    }
}
// Total: ~1ms (consistent)
```

**B. Zero Fragmentation:**

| Scenario | Traditional Heap | Object Pool |
|----------|-----------------|-------------|
| After 1 hour operation | Fragmented, 20% overhead | Contiguous, 0% overhead |
| Allocation success rate | May fail due to fragmentation | Always succeeds (if available) |
| Memory layout | Scattered across heap | Sequential array |
| Cache misses | ⚠️ High (scattered) | ✅ Low (contiguous) |

**C. Cache-Friendly Memory Access:**

```cpp
// Object pool uses contiguous array
Point3D storage[100000];  // Sequential memory

// Accessing nearby objects benefits from cache prefetching
for (int i = 0; i < 100000; ++i) {
    process(&storage[i]);  // ✅ Cache hit rate: ~95%
}

// vs heap allocation (scattered memory)
std::vector<Point3D*> heap_points;
for (auto* p : heap_points) {
    process(p);  // ⚠️ Cache hit rate: ~60% (scattered addresses)
}
```

**Real-World Application:**

```cpp
// Autonomous vehicle perception pipeline
class PerceptionSystem {
    // Pools for different object types
    ObjectPool<Point3D, 1'000'000> lidarPool;      // 1M point pool
    ObjectPool<RadarDetection, 10'000> radarPool;  // 10k detection pool
    ObjectPool<TrackedObject, 1'000> trackPool;    // 1k tracked object pool

public:
    void processFrame() {
        // LiDAR processing (10Hz, 100k points/frame)
        for (int i = 0; i < 100'000; ++i) {
            auto* point = lidarPool.allocate();  // ~5ns
            point->x = rawData[i].x;
            point->y = rawData[i].y;
            point->z = rawData[i].z;

            if (isObstacle(point)) {
                auto* detection = radarPool.allocate();
                detection->position = *point;
                detections.push_back(detection);
            }

            lidarPool.deallocate(point);  // ~5ns
        }

        // Object tracking
        for (auto* det : detections) {
            auto* obj = trackPool.allocate();
            updateTrack(obj, det);
            radarPool.deallocate(det);
        }

        // Timing: ~1ms total (deterministic)
        // vs ~10-50ms with heap allocation (variable)
    }
};
```

**Performance Metrics:**

| Metric | Heap Allocation | Object Pool | Improvement |
|--------|----------------|-------------|-------------|
| **Allocation time** | ~100ns | ~5ns | 20x faster |
| **Deallocation time** | ~100ns | ~5ns | 20x faster |
| **Timing variance** | ±10x (GC spikes) | ±1% | Deterministic |
| **Memory fragmentation** | Increases over time | Zero | Stable |
| **Cache miss rate** | ~40% | ~5% | 8x better locality |

**Critical Benefits:**
- ✅ Meets hard real-time deadlines (control loops at 100Hz+)
- ✅ Prevents memory exhaustion in long-running systems
- ✅ Predictable performance for safety certification
- ✅ No dynamic allocation in critical paths

---

### EDGE_CASES: Tricky Scenarios and Deep Internals
#### Edge Case 1: Double-Free Detection

**Problem**: Deallocating the same pointer twice corrupts the free list, leading to double allocations and undefined behavior.

```cpp
// ❌ Without protection
class UnsafePool {
    std::vector<T*> freeList;
public:
    void deallocate(T* ptr) {
        freeList.push_back(ptr);  // ❌ No duplicate check!
    }
};

ObjectPool pool;
T* obj = pool.allocate();
pool.deallocate(obj);
pool.deallocate(obj);  // ❌ Double-free! Pool corruption

T* a = pool.allocate();
T* b = pool.allocate();
// a == b! ❌ Both clients get same memory

// ✅ With protection using usage tracking
template <typename T, size_t N>
class SafePool {
    T* storage;
    std::vector<T*> freeList;
    bool used[N] = {};  // Track allocated slots

public:
    T* allocate() {
        if (freeList.empty()) throw std::bad_alloc();

        T* obj = freeList.back();
        freeList.pop_back();

        size_t index = obj - storage;
        used[index] = true;  // ✅ Mark as in-use
        return obj;
    }

    void deallocate(T* ptr) {
        size_t index = ptr - storage;

        if (index >= N) {
            throw std::invalid_argument("Pointer not from pool");
        }

        if (!used[index]) {
            throw std::logic_error("Double-free detected!");  // ✅ Catch error
        }

        used[index] = false;
        freeList.push_back(ptr);
    }
};
```

**Key Takeaway**: Always track object usage state with a boolean array or bitset to detect double-frees during development.

---

#### Edge Case 2: Thread-Safety Without Proper Synchronization

**Problem**: Multiple threads accessing the pool concurrently without synchronization causes data races on the free list.

```cpp
// ❌ Not thread-safe
class UnsafePool {
    std::vector<T*> freeList;
public:
    T* allocate() {
        if (freeList.empty()) throw std::bad_alloc();
        T* obj = freeList.back();  // ❌ Race condition
        freeList.pop_back();       // ❌ Concurrent modification
        return obj;
    }
};

// Thread 1 and Thread 2 call allocate() simultaneously
// Both read freeList.back() before either pops
// Both get the same pointer! ❌ Memory corruption

// ✅ Thread-safe with mutex
class ThreadSafePool {
    std::vector<T*> freeList;
    std::mutex poolMutex;

public:
    T* allocate() {
        std::lock_guard<std::mutex> lock(poolMutex);  // ✅ Serialize access

        if (freeList.empty()) throw std::bad_alloc();

        T* obj = freeList.back();
        freeList.pop_back();
        return obj;
    }

    void deallocate(T* ptr) {
        std::lock_guard<std::mutex> lock(poolMutex);  // ✅ Serialize access
        freeList.push_back(ptr);
    }
};

// ✅ Lock-free for SPSC (Single Producer Single Consumer)
template <typename T, size_t N>
class LockFreePoolSPSC {
    T* storage;
    std::atomic<size_t> head{0};  // Producer writes here
    std::atomic<size_t> tail{0};  // Consumer reads here
    T* buffer[N];

public:
    T* allocate() {  // Consumer only
        size_t t = tail.load(std::memory_order_acquire);
        size_t h = head.load(std::memory_order_acquire);

        if (t == h) return nullptr;  // Empty

        T* obj = buffer[t % N];
        tail.store(t + 1, std::memory_order_release);
        return obj;
    }

    void deallocate(T* ptr) {  // Producer only
        size_t h = head.load(std::memory_order_relaxed);
        buffer[h % N] = ptr;
        head.store(h + 1, std::memory_order_release);
    }
};
```

**Key Takeaway**: Use `std::mutex` for general thread-safety or lock-free atomics for SPSC scenarios. Never access shared pool state without synchronization.

---

#### Edge Case 3: Chunk Expansion Index Tracking

**Problem**: When pools expand dynamically with multiple chunks, index calculations must account for chunk boundaries.

```cpp
// ❌ Wrong: Single chunk assumption
class BrokenExpandablePool {
    std::vector<T*> chunks;
    std::vector<size_t> freeList;  // Global indices

    T* allocate() {
        size_t index = freeList.back();
        freeList.pop_back();
        return &chunks[0][index];  // ❌ Assumes single chunk!
    }
};

// ✅ Correct: Chunk + offset calculation
class ExpandablePool {
    std::vector<T*> chunks;
    std::vector<size_t> freeList;  // Global indices
    static constexpr size_t CHUNK_SIZE = 100;

    T* allocate() {
        if (freeList.empty()) {
            allocateChunk();
        }

        size_t globalIndex = freeList.back();
        freeList.pop_back();

        // ✅ Calculate chunk and offset
        size_t chunkIndex = globalIndex / CHUNK_SIZE;
        size_t offset = globalIndex % CHUNK_SIZE;

        return &chunks[chunkIndex][offset];
    }

    void deallocate(T* ptr) {
        // ✅ Find which chunk contains this pointer
        for (size_t chunkIdx = 0; chunkIdx < chunks.size(); ++chunkIdx) {
            T* chunkStart = chunks[chunkIdx];
            T* chunkEnd = chunkStart + CHUNK_SIZE;

            if (ptr >= chunkStart && ptr < chunkEnd) {
                size_t offset = ptr - chunkStart;
                size_t globalIndex = chunkIdx * CHUNK_SIZE + offset;
                freeList.push_back(globalIndex);
                return;
            }
        }

        throw std::invalid_argument("Pointer not from pool");
    }

private:
    void allocateChunk() {
        T* chunk = new T[CHUNK_SIZE]();
        chunks.push_back(chunk);

        size_t baseIndex = (chunks.size() - 1) * CHUNK_SIZE;
        for (size_t i = 0; i < CHUNK_SIZE; ++i) {
            freeList.push_back(baseIndex + i);
        }
    }
};
```

**Key Takeaway**: In expandable pools, maintain global index space across chunks using `chunkIndex * CHUNK_SIZE + offset` calculations.

---

#### Edge Case 4: Object Destruction and Placement New

**Problem**: For non-trivial types, failing to call destructors before returning objects to the pool causes resource leaks.

```cpp
struct Resource {
    std::string name;
    std::vector<int> data;
    std::unique_ptr<int> ptr;

    Resource() : ptr(std::make_unique<int>(42)) {}
};

// ❌ Without proper destruction
class LeakyPool {
    Resource* storage;
    std::vector<Resource*> freeList;

public:
    void deallocate(Resource* obj) {
        freeList.push_back(obj);  // ❌ Destructor never called!
        // Memory leaks: string, vector, unique_ptr not released
    }

    Resource* allocate() {
        Resource* obj = freeList.back();
        freeList.pop_back();
        return obj;  // ❌ Returns object with stale state
    }
};

// ✅ Proper lifecycle management
class ProperPool {
    alignas(Resource) char storage[sizeof(Resource) * 100];
    Resource* freeList[100];
    size_t freeCount = 100;

public:
    ProperPool() {
        // Initialize free list with addresses
        for (size_t i = 0; i < 100; ++i) {
            freeList[i] = reinterpret_cast<Resource*>(storage + i * sizeof(Resource));
        }
    }

    Resource* allocate() {
        if (freeCount == 0) throw std::bad_alloc();

        Resource* obj = freeList[--freeCount];
        new (obj) Resource();  // ✅ Placement new - construct object
        return obj;
    }

    void deallocate(Resource* obj) {
        obj->~Resource();  // ✅ Explicitly call destructor
        freeList[freeCount++] = obj;
    }

    ~ProperPool() {
        // No objects should be allocated when pool destructs
        // If freeCount < 100, some objects are still in use (leak)
    }
};
```

**Key Takeaway**: For non-POD types, use placement new on allocation and explicit destructor calls on deallocation to manage object lifetimes properly.

---

#### Edge Case 5: Alignment Requirements

**Problem**: Types with strict alignment (SIMD, atomics) require properly aligned memory that may not be guaranteed by `new char[]`.

```cpp
// ❌ Potentially misaligned
struct alignas(32) SIMDData {
    float values[8];  // Requires 32-byte alignment for AVX
};

class MisalignedPool {
    char* storage = new char[sizeof(SIMDData) * 100];  // ❌ Only 1-byte aligned!

    SIMDData* allocate() {
        return reinterpret_cast<SIMDData*>(storage);  // ❌ Undefined behavior if misaligned
    }
};

// ✅ Properly aligned storage
class AlignedPool {
    alignas(32) char storage[sizeof(SIMDData) * 100];  // ✅ Aligned array

    // Or use aligned allocation
    void* allocateAligned(size_t size, size_t alignment) {
        void* ptr = nullptr;
        #ifdef _WIN32
            ptr = _aligned_malloc(size, alignment);
        #else
            ptr = aligned_alloc(alignment, size);
        #endif
        return ptr;
    }

public:
    SIMDData* storage;

    AlignedPool() {
        storage = static_cast<SIMDData*>(allocateAligned(sizeof(SIMDData) * 100, 32));
    }

    ~AlignedPool() {
        #ifdef _WIN32
            _aligned_free(storage);
        #else
            free(storage);
        #endif
    }
};

// ✅ C++17 aligned_storage
template <typename T, size_t N>
class ModernAlignedPool {
    using AlignedStorage = std::aligned_storage_t<sizeof(T), alignof(T)>;
    AlignedStorage storage[N];  // ✅ Correctly aligned

public:
    T* allocate(size_t index) {
        return reinterpret_cast<T*>(&storage[index]);  // ✅ Safe
    }
};
```

**Key Takeaway**: Always respect alignment requirements using `alignas`, `std::aligned_storage`, or platform-specific aligned allocation functions.

---

### CODE_EXAMPLES: Practical Demonstrations
#### Example 1: Fixed-Size Object Pool (Easy)

```cpp
#include <iostream>
#include <vector>
#include <stdexcept>

struct Particle {
    float x, y, z;
    float vx, vy, vz;
    float lifetime;
};

template <typename T, size_t PoolSize = 100>
class ObjectPool {
    T* storage;
    std::vector<T*> freeList;

public:
    ObjectPool() : storage(new T[PoolSize]()) {
        // Initialize free list with all objects
        for (size_t i = 0; i < PoolSize; ++i) {
            freeList.push_back(&storage[i]);
        }
    }

    ~ObjectPool() {
        delete[] storage;
    }

    // Disable copy and move
    ObjectPool(const ObjectPool&) = delete;
    ObjectPool& operator=(const ObjectPool&) = delete;

    T* allocate() {
        if (freeList.empty()) {
            throw std::bad_alloc();
        }

        T* obj = freeList.back();
        freeList.pop_back();
        return obj;
    }

    void deallocate(T* obj) {
        // Optional: reset object state
        *obj = T();
        freeList.push_back(obj);
    }

    size_t available() const {
        return freeList.size();
    }

    size_t capacity() const {
        return PoolSize;
    }
};

int main() {
    ObjectPool<Particle, 1000> particlePool;

    std::cout << "Initial capacity: " << particlePool.capacity() << "\n";
    std::cout << "Available: " << particlePool.available() << "\n";

    // Allocate some particles
    Particle* p1 = particlePool.allocate();
    p1->x = 1.0f; p1->y = 2.0f; p1->z = 3.0f;
    p1->lifetime = 5.0f;

    Particle* p2 = particlePool.allocate();
    p2->x = 10.0f; p2->y = 20.0f; p2->z = 30.0f;

    std::cout << "After allocation: " << particlePool.available() << "\n";

    // Return to pool
    particlePool.deallocate(p1);
    std::cout << "After deallocation: " << particlePool.available() << "\n";

    // Reuse
    Particle* p3 = particlePool.allocate();  // Likely reuses p1's slot
    std::cout << "p3 position: " << p3->x << ", " << p3->y << ", " << p3->z << "\n";

    return 0;
}

// Output:
// Initial capacity: 1000
// Available: 1000
// After allocation: 998
// After deallocation: 999
// p3 position: 0, 0, 0  (reset by deallocate)
```

**Key Concepts**:
- Pre-allocated contiguous storage
- Free list using `std::vector<T*>`
- RAII for automatic cleanup
- Object reset on deallocation

---

#### Example 2: Index-Based Memory Pool (Mid)

```cpp
#include <iostream>
#include <stdexcept>
#include <cstring>

struct SensorData {
    uint64_t timestamp;
    float values[16];
    uint8_t sensorId;
};

template <typename T, size_t PoolSize = 100>
class IndexBasedPool {
    T* storage;
    size_t freeList[PoolSize];  // Store indices, not pointers
    size_t freeCount;
    bool used[PoolSize];  // Track allocated slots

public:
    IndexBasedPool() : storage(new T[PoolSize]()), freeCount(PoolSize) {
        // Initialize free list with indices (LIFO order)
        for (size_t i = 0; i < PoolSize; ++i) {
            freeList[i] = PoolSize - 1 - i;
            used[i] = false;
        }
    }

    ~IndexBasedPool() {
        delete[] storage;
    }

    T* allocate() {
        if (freeCount == 0) {
            throw std::bad_alloc();
        }

        // Pop index from free list
        size_t index = freeList[--freeCount];
        used[index] = true;

        // Zero the memory
        std::memset(&storage[index], 0, sizeof(T));

        return &storage[index];
    }

    void deallocate(T* ptr) {
        // Calculate index from pointer
        size_t index = ptr - storage;

        // Validate pointer
        if (index >= PoolSize) {
            throw std::invalid_argument("Pointer not from this pool");
        }

        // Detect double-free
        if (!used[index]) {
            throw std::logic_error("Double-free detected!");
        }

        used[index] = false;

        // Push index back to free list
        freeList[freeCount++] = index;
    }

    size_t available() const { return freeCount; }

    // Debugging helper
    void printStats() const {
        std::cout << "Pool stats:\n";
        std::cout << "  Capacity: " << PoolSize << "\n";
        std::cout << "  Available: " << freeCount << "\n";
        std::cout << "  In use: " << (PoolSize - freeCount) << "\n";
    }
};

int main() {
    IndexBasedPool<SensorData, 5> pool;

    pool.printStats();

    // Allocate
    SensorData* s1 = pool.allocate();
    SensorData* s2 = pool.allocate();
    s1->sensorId = 1;
    s2->sensorId = 2;

    pool.printStats();

    // Deallocate
    pool.deallocate(s1);
    pool.printStats();

    // Try double-free (will throw)
    try {
        pool.deallocate(s1);
    } catch (const std::logic_error& e) {
        std::cout << "Caught: " << e.what() << "\n";
    }

    return 0;
}

// Output:
// Pool stats:
//   Capacity: 5
//   Available: 5
//   In use: 0
// Pool stats:
//   Capacity: 5
//   Available: 3
//   In use: 2
// Pool stats:
//   Capacity: 5
//   Available: 4
//   In use: 1
// Caught: Double-free detected!
```

**Key Concepts**:
- Index-based tracking (more cache-friendly than pointers)
- Double-free detection with `used[]` array
- Pointer validation using pointer arithmetic
- Memory zeroing on allocation

---

#### Example 3: Thread-Safe Object Pool (Advanced)

```cpp
#include <iostream>
#include <vector>
#include <mutex>
#include <thread>
#include <chrono>

struct Message {
    char data[256];
    size_t length;
    uint64_t timestamp;
};

template <typename T, size_t PoolSize>
class ThreadSafePool {
    T* storage;
    std::vector<T*> freeList;
    std::mutex poolMutex;

public:
    ThreadSafePool() : storage(new T[PoolSize]()) {
        for (size_t i = 0; i < PoolSize; ++i) {
            freeList.push_back(&storage[i]);
        }
    }

    ~ThreadSafePool() {
        delete[] storage;
    }

    T* allocate() {
        std::lock_guard<std::mutex> lock(poolMutex);

        if (freeList.empty()) {
            return nullptr;  // Non-throwing version
        }

        T* obj = freeList.back();
        freeList.pop_back();
        return obj;
    }

    void deallocate(T* ptr) {
        std::lock_guard<std::mutex> lock(poolMutex);
        freeList.push_back(ptr);
    }

    size_t available() const {
        std::lock_guard<std::mutex> lock(poolMutex);
        return freeList.size();
    }
};

// Worker thread function
void producer(ThreadSafePool<Message, 100>& pool, int threadId) {
    for (int i = 0; i < 50; ++i) {
        Message* msg = pool.allocate();

        if (msg) {
            msg->timestamp = std::chrono::steady_clock::now().time_since_epoch().count();
            snprintf(msg->data, sizeof(msg->data), "Thread %d - Message %d", threadId, i);
            msg->length = strlen(msg->data);

            // Simulate processing
            std::this_thread::sleep_for(std::chrono::milliseconds(1));

            pool.deallocate(msg);
        } else {
            std::cout << "Thread " << threadId << " - Pool exhausted\n";
        }
    }
}

int main() {
    ThreadSafePool<Message, 100> messagePool;

    std::cout << "Initial available: " << messagePool.available() << "\n";

    // Launch multiple threads
    std::vector<std::thread> threads;
    for (int i = 0; i < 4; ++i) {
        threads.emplace_back(producer, std::ref(messagePool), i);
    }

    // Wait for completion
    for (auto& t : threads) {
        t.join();
    }

    std::cout << "Final available: " << messagePool.available() << "\n";

    return 0;
}

// Output (typical):
// Initial available: 100
// Final available: 100
```

**Key Concepts**:
- `std::mutex` for mutual exclusion
- `std::lock_guard` for RAII-style locking
- Thread-safe allocation and deallocation
- Multiple producer threads sharing pool

---

#### Example 4: Expandable Chunk-Based Pool (Advanced)

```cpp
#include <iostream>
#include <vector>
#include <mutex>

template <typename T>
class ExpandablePool {
    static constexpr size_t CHUNK_SIZE = 100;

    std::vector<T*> chunks;
    std::vector<size_t> freeList;  // Global indices
    std::mutex poolMutex;

public:
    ExpandablePool() {
        allocateChunk();
    }

    ~ExpandablePool() {
        for (T* chunk : chunks) {
            delete[] chunk;
        }
    }

    T* allocate() {
        std::lock_guard<std::mutex> lock(poolMutex);

        if (freeList.empty()) {
            allocateChunk();
        }

        size_t globalIndex = freeList.back();
        freeList.pop_back();

        size_t chunkIndex = globalIndex / CHUNK_SIZE;
        size_t offset = globalIndex % CHUNK_SIZE;

        return &chunks[chunkIndex][offset];
    }

    void deallocate(T* ptr) {
        std::lock_guard<std::mutex> lock(poolMutex);

        // Find which chunk contains this pointer
        for (size_t chunkIdx = 0; chunkIdx < chunks.size(); ++chunkIdx) {
            T* chunkStart = chunks[chunkIdx];
            T* chunkEnd = chunkStart + CHUNK_SIZE;

            if (ptr >= chunkStart && ptr < chunkEnd) {
                size_t offset = ptr - chunkStart;
                size_t globalIndex = chunkIdx * CHUNK_SIZE + offset;
                freeList.push_back(globalIndex);
                return;
            }
        }

        throw std::invalid_argument("Pointer not from pool");
    }

    size_t capacity() const {
        std::lock_guard<std::mutex> lock(poolMutex);
        return chunks.size() * CHUNK_SIZE;
    }

    size_t chunkCount() const {
        std::lock_guard<std::mutex> lock(poolMutex);
        return chunks.size();
    }

private:
    void allocateChunk() {
        T* chunk = new T[CHUNK_SIZE]();
        chunks.push_back(chunk);

        size_t baseIndex = (chunks.size() - 1) * CHUNK_SIZE;
        for (size_t i = 0; i < CHUNK_SIZE; ++i) {
            freeList.push_back(baseIndex + i);
        }

        std::cout << "Allocated chunk #" << chunks.size()
                  << " (capacity now: " << capacity() << ")\n";
    }
};

int main() {
    ExpandablePool<int> pool;

    std::vector<int*> allocated;

    // Allocate beyond initial capacity
    for (int i = 0; i < 250; ++i) {
        int* ptr = pool.allocate();
        *ptr = i;
        allocated.push_back(ptr);
    }

    std::cout << "Total chunks: " << pool.chunkCount() << "\n";
    std::cout << "Total capacity: " << pool.capacity() << "\n";

    // Deallocate all
    for (int* ptr : allocated) {
        pool.deallocate(ptr);
    }

    return 0;
}

// Output:
// Allocated chunk #1 (capacity now: 100)
// Allocated chunk #2 (capacity now: 200)
// Allocated chunk #3 (capacity now: 300)
// Total chunks: 3
// Total capacity: 300
```

**Key Concepts**:
- Dynamic growth with chunks
- Global index space across chunks
- Chunk + offset calculation
- Automatic expansion on exhaustion

---

#### Example 5: Aligned Memory Pool for SIMD (Advanced)

```cpp
#include <iostream>
#include <cstdlib>
#include <cstring>
#include <immintrin.h>  // For AVX

// SIMD-friendly structure requiring 32-byte alignment
struct alignas(32) Vec8f {
    float data[8];

    void add(const Vec8f& other) {
        __m256 a = _mm256_load_ps(data);
        __m256 b = _mm256_load_ps(other.data);
        __m256 result = _mm256_add_ps(a, b);
        _mm256_store_ps(data, result);
    }
};

template <typename T, size_t PoolSize>
class AlignedPool {
    static_assert(alignof(T) <= 64, "Alignment too large");

    T* storage;
    T* freeList[PoolSize];
    size_t freeCount;

public:
    AlignedPool() : freeCount(PoolSize) {
        // Allocate aligned memory
        #ifdef _WIN32
            storage = static_cast<T*>(_aligned_malloc(sizeof(T) * PoolSize, alignof(T)));
        #else
            storage = static_cast<T*>(aligned_alloc(alignof(T), sizeof(T) * PoolSize));
        #endif

        if (!storage) {
            throw std::bad_alloc();
        }

        // Initialize memory
        std::memset(storage, 0, sizeof(T) * PoolSize);

        // Populate free list
        for (size_t i = 0; i < PoolSize; ++i) {
            freeList[i] = &storage[i];
        }
    }

    ~AlignedPool() {
        #ifdef _WIN32
            _aligned_free(storage);
        #else
            free(storage);
        #endif
    }

    T* allocate() {
        if (freeCount == 0) {
            throw std::bad_alloc();
        }

        return freeList[--freeCount];
    }

    void deallocate(T* ptr) {
        freeList[freeCount++] = ptr;
    }

    // Verify alignment
    bool isAligned(void* ptr) const {
        return (reinterpret_cast<uintptr_t>(ptr) % alignof(T)) == 0;
    }
};

int main() {
    AlignedPool<Vec8f, 10> pool;

    Vec8f* v1 = pool.allocate();
    Vec8f* v2 = pool.allocate();

    std::cout << "v1 aligned: " << pool.isAligned(v1) << "\n";
    std::cout << "v2 aligned: " << pool.isAligned(v2) << "\n";

    // Initialize
    for (int i = 0; i < 8; ++i) {
        v1->data[i] = i;
        v2->data[i] = i * 10;
    }

    // SIMD addition
    v1->add(*v2);

    std::cout << "Result: ";
    for (int i = 0; i < 8; ++i) {
        std::cout << v1->data[i] << " ";
    }
    std::cout << "\n";

    pool.deallocate(v1);
    pool.deallocate(v2);

    return 0;
}

// Output:
// v1 aligned: 1
// v2 aligned: 1
// Result: 0 11 22 33 44 55 66 77
```

**Key Concepts**:
- Platform-specific aligned allocation
- SIMD type support (AVX __m256)
- Alignment verification
- Proper cleanup with aligned_free

---

### INTERVIEW_QA: Comprehensive Questions and Answers
#### Q1: What is an object pool and when should you use one instead of `new`/`delete`?
**Difficulty:** #beginner
**Category:** #conceptual
**Concepts:** #object_pools #memory_management

**Question:** What is an object pool and when should you use one instead of `new`/`delete`?



**Answer**: An object pool is a set of pre-allocated, reusable objects that avoids the overhead of dynamic allocation/deallocation. Use it when objects are frequently created and destroyed, object construction is expensive, or deterministic performance is required.

**Explanation**:
```cpp
// Without pool: repeated new/delete overhead
for (int i = 0; i < 1000000; i++) {
    MyObject* obj = new MyObject();  // malloc + constructor
    // use object
    delete obj;  // destructor + free
}

// With pool: reuse pre-allocated objects
ObjectPool<MyObject, 1000> pool;
for (int i = 0; i < 1000000; i++) {
    MyObject* obj = pool.allocate();  // O(1) pointer return
    // use object
    pool.deallocate(obj);  // O(1) add to free list
}
```

**Benefits**:
- **10-100x faster** for small objects
- **Predictable latency** (no OS calls)
- **No fragmentation**
- **Cache-friendly** (memory locality)

**Key Takeaway**: Object pools trade memory (pre-allocation) for speed and determinism, making them essential for real-time systems like games and autonomous vehicles.

---

#### Q2: What is a free list and why is it used in object pools?
**Difficulty:** #beginner
**Category:** #design
**Concepts:** #free_list #allocation_strategy

**Question:** What is a free list and why is it used in object pools?



**Answer**: A free list is a data structure (vector, stack, or linked list) that tracks which objects in the pool are available for allocation. It enables O(1) allocation and deallocation by maintaining pointers or indices to unused objects.

**Explanation**:
```cpp
template <typename T, size_t N>
class ObjectPool {
    T* storage;                  // Pre-allocated array
    std::vector<T*> freeList;    // Tracks available objects

public:
    ObjectPool() : storage(new T[N]()) {
        for (size_t i = 0; i < N; ++i) {
            freeList.push_back(&storage[i]);  // All initially free
        }
    }

    T* allocate() {
        if (freeList.empty()) throw std::bad_alloc();
        T* obj = freeList.back();   // O(1) access
        freeList.pop_back();        // O(1) removal
        return obj;
    }

    void deallocate(T* obj) {
        freeList.push_back(obj);    // O(1) return
    }
};
```

**LIFO vs FIFO**:
- LIFO (stack): Better cache locality (recently used objects)
- FIFO (queue): More fair distribution

**Key Takeaway**: Free lists provide constant-time allocation/deallocation by maintaining a simple stack or queue of available object pointers.

---

#### Q3: What are the advantages of storing indices instead of pointers in the free list?
**Difficulty:** #mid
**Category:** #implementation
**Concepts:** #index_vs_pointer_tracking

**Question:** What are the advantages of storing indices instead of pointers in the free list?



**Answer**: Index-based free lists use less memory (4-8 bytes vs 8 bytes per pointer), are more cache-friendly, work better with pool expansion, and simplify serialization. They trade a pointer dereference for an index calculation.

**Explanation**:
```cpp
// Pointer-based (8 bytes per entry on 64-bit)
std::vector<T*> freeList;  // Stores actual addresses

T* allocate() {
    T* obj = freeList.back();  // Direct pointer
    freeList.pop_back();
    return obj;
}

// Index-based (4 bytes per entry)
size_t freeList[N];
size_t freeCount;

T* allocate() {
    size_t index = freeList[--freeCount];  // Get index
    return &storage[index];  // Calculate address
}
```

**Comparison**:

| Feature | Pointer-Based | Index-Based |
|---------|---------------|-------------|
| Memory per entry | 8 bytes (64-bit) | 4 bytes |
| Cache efficiency | Lower | Higher (smaller data) |
| Expansion support | Pointers invalidate | Indices remain valid |
| Calculation | None | Simple offset |

**Key Takeaway**: Index-based free lists are more memory-efficient and cache-friendly, especially for large pools or systems with memory constraints.

---

#### Q4: How do you detect double-free errors in an object pool?
**Difficulty:** #mid
**Category:** #debugging
**Concepts:** #doublefree #memory_safety

**Question:** How do you detect double-free errors in an object pool?



**Answer**: Maintain a boolean array or bitset tracking whether each slot is currently allocated. Check this array in `deallocate()` and throw an exception if the slot is already free.

**Explanation**:
```cpp
template <typename T, size_t N>
class SafePool {
    T* storage;
    std::vector<T*> freeList;
    bool used[N] = {};  // Track allocation state

public:
    T* allocate() {
        if (freeList.empty()) throw std::bad_alloc();

        T* obj = freeList.back();
        freeList.pop_back();

        size_t index = obj - storage;
        used[index] = true;  // Mark as allocated
        return obj;
    }

    void deallocate(T* ptr) {
        size_t index = ptr - storage;

        if (index >= N) {
            throw std::invalid_argument("Pointer not from pool");
        }

        if (!used[index]) {
            throw std::logic_error("Double-free detected!");  // Catch error
        }

        used[index] = false;  // Mark as free
        freeList.push_back(ptr);
    }
};

// Usage
SafePool<int, 100> pool;
int* p = pool.allocate();
pool.deallocate(p);
pool.deallocate(p);  // ❌ Throws: Double-free detected!
```

**Key Takeaway**: Always use a usage tracking array in development builds to catch double-free bugs early, which would otherwise cause silent memory corruption.

---

#### Q5: What are the different approaches to making an object pool thread-safe?
**Difficulty:** #advanced
**Category:** #thread_safety
**Concepts:** #mutex #atomics #lockfree

**Question:** What are the different approaches to making an object pool thread-safe?



**Answer**: (1) **Mutex-based**: Protect all pool operations with `std::mutex` (simple, moderate overhead). (2) **Lock-free**: Use atomic operations and lock-free data structures (complex, minimal overhead). (3) **Per-thread pools**: Each thread has its own pool (no synchronization needed).

**Explanation**:
```cpp
// 1. Mutex-based (general purpose)
class MutexPool {
    std::mutex mtx;
    std::vector<T*> freeList;

public:
    T* allocate() {
        std::lock_guard<std::mutex> lock(mtx);  // Serialize access
        if (freeList.empty()) throw std::bad_alloc();
        T* obj = freeList.back();
        freeList.pop_back();
        return obj;
    }

    void deallocate(T* ptr) {
        std::lock_guard<std::mutex> lock(mtx);
        freeList.push_back(ptr);
    }
};

// 2. Lock-free SPSC (Single Producer Single Consumer)
class LockFreePoolSPSC {
    std::atomic<size_t> head{0};
    std::atomic<size_t> tail{0};
    T* buffer[N];

public:
    T* allocate() {  // Consumer only
        size_t t = tail.load(std::memory_order_acquire);
        size_t h = head.load(std::memory_order_acquire);

        if (t == h) return nullptr;  // Empty

        T* obj = buffer[t % N];
        tail.store(t + 1, std::memory_order_release);
        return obj;
    }

    void deallocate(T* ptr) {  // Producer only
        size_t h = head.load(std::memory_order_relaxed);
        buffer[h % N] = ptr;
        head.store(h + 1, std::memory_order_release);
    }
};

// 3. Per-thread pools (no sync needed)
class ThreadLocalPool {
    static thread_local ObjectPool<T, 100> pool;

public:
    T* allocate() { return pool.allocate(); }
    void deallocate(T* ptr) { pool.deallocate(ptr); }
};
thread_local ObjectPool<T, 100> ThreadLocalPool::pool;
```

**Performance Comparison**:
- Mutex: ~20-50ns overhead per operation
- Lock-free: ~5-10ns overhead
- Per-thread: ~0ns (no synchronization)

**Key Takeaway**: Choose synchronization strategy based on access pattern: mutex for general MPMC, lock-free for SPSC/MPSC, thread-local for embarrassingly parallel workloads.

---

#### Q6: Why and when do you need placement new and explicit destructor calls in...
**Difficulty:** #advanced
**Category:** #memory_management
**Concepts:** #placement_new #destructors

**Question:** Why and when do you need placement new and explicit destructor calls in object pools?



**Answer**: Placement new and explicit destructors are needed for non-POD types to properly manage object lifetimes. Pools allocate raw memory; placement new constructs objects in that memory, and explicit destructors clean up resources before returning memory to the pool.

**Explanation**:
```cpp
struct Resource {
    std::string name;
    std::vector<int> data;
    std::unique_ptr<int> ptr;

    Resource(const std::string& n) : name(n), ptr(std::make_unique<int>(42)) {}
};

// ❌ Without proper lifecycle management
class NaivePool {
    Resource* storage;  // Pre-allocated but UNCONSTRUCTED

    Resource* allocate() {
        return &storage[index];  // ❌ Returns unconstructed memory!
        // Using this pointer is undefined behavior
    }

    void deallocate(Resource* obj) {
        // ❌ Doesn't call destructor - leaks string, vector, unique_ptr
    }
};

// ✅ Proper lifecycle management
class ProperPool {
    alignas(Resource) char storage[sizeof(Resource) * 100];
    void* freeList[100];
    size_t freeCount = 100;

public:
    ProperPool() {
        for (size_t i = 0; i < 100; ++i) {
            freeList[i] = storage + i * sizeof(Resource);
        }
    }

    Resource* allocate(const std::string& name) {
        if (freeCount == 0) throw std::bad_alloc();

        void* mem = freeList[--freeCount];
        return new (mem) Resource(name);  // ✅ Placement new - construct
    }

    void deallocate(Resource* obj) {
        obj->~Resource();  // ✅ Explicit destructor - cleanup
        freeList[freeCount++] = obj;
    }
};

// Usage
ProperPool pool;
Resource* r = pool.allocate("sensor_data");  // Constructed
// Use r...
pool.deallocate(r);  // Destructed properly
```

**Key Takeaway**: For types with non-trivial constructors/destructors, use placement new to construct and explicit destructor calls to destruct, separating memory allocation from object lifetime management.

---

#### Q7: How do expandable object pools handle dynamic growth while maintaining...
**Difficulty:** #advanced
**Category:** #design
**Concepts:** #chunk_expansion #scaling

**Question:** How do expandable object pools handle dynamic growth while maintaining efficient allocation?



**Answer**: Expandable pools allocate memory in fixed-size chunks and maintain a global index space across chunks. Allocation uses chunk index and offset calculations, while deallocation searches for the owning chunk through pointer range checks.

**Explanation**:
```cpp
class ExpandablePool {
    static constexpr size_t CHUNK_SIZE = 100;
    std::vector<T*> chunks;
    std::vector<size_t> freeList;  // Global indices

    T* allocate() {
        if (freeList.empty()) {
            allocateChunk();  // Grow on demand
        }

        size_t globalIndex = freeList.back();
        freeList.pop_back();

        // Convert global index to chunk + offset
        size_t chunkIdx = globalIndex / CHUNK_SIZE;  // Which chunk
        size_t offset = globalIndex % CHUNK_SIZE;    // Position in chunk

        return &chunks[chunkIdx][offset];
    }

    void deallocate(T* ptr) {
        // Find owning chunk
        for (size_t chunkIdx = 0; chunkIdx < chunks.size(); ++chunkIdx) {
            T* chunkStart = chunks[chunkIdx];
            T* chunkEnd = chunkStart + CHUNK_SIZE;

            if (ptr >= chunkStart && ptr < chunkEnd) {
                size_t offset = ptr - chunkStart;
                size_t globalIndex = chunkIdx * CHUNK_SIZE + offset;
                freeList.push_back(globalIndex);
                return;
            }
        }
        throw std::invalid_argument("Pointer not from pool");
    }

    void allocateChunk() {
        T* chunk = new T[CHUNK_SIZE]();
        chunks.push_back(chunk);

        size_t baseIndex = (chunks.size() - 1) * CHUNK_SIZE;
        for (size_t i = 0; i < CHUNK_SIZE; ++i) {
            freeList.push_back(baseIndex + i);
        }
    }
};
```

**Global Index Calculation**:
- Index 0-99: Chunk 0
- Index 100-199: Chunk 1
- Index N: Chunk (N / 100), Offset (N % 100)

**Key Takeaway**: Chunk-based expansion enables dynamic growth while maintaining O(1) allocation and O(chunks) deallocation through mathematical index transformations.

---

#### Q8: Why are object pools often faster than `new`/`delete` beyond just avoiding...
**Difficulty:** #mid
**Category:** #performance
**Concepts:** #cache_locality #memory_layout

**Question:** Why are object pools often faster than `new`/`delete` beyond just avoiding allocator overhead?



**Answer**: Object pools improve **cache locality** through contiguous memory allocation and temporal locality through object reuse. Recently freed objects remain in cache, and contiguous storage enables better prefetching compared to scattered heap allocations.

**Explanation**:
```cpp
// malloc/free: Objects scattered across heap
for (int i = 0; i < 1000; i++) {
    Object* obj = new Object();  // ❌ Different cache line each time
    process(obj);
    delete obj;
}
// Cache misses: High (each allocation likely in different cache line)

// Object pool: Objects in contiguous array
ObjectPool<Object, 1000> pool;
for (int i = 0; i < 1000; i++) {
    Object* obj = pool.allocate();  // ✅ LIFO reuse = cache-hot
    process(obj);
    pool.deallocate(obj);
}
// Cache misses: Low (recently freed object likely still in cache)
```

**Cache Benefits**:
1. **Spatial locality**: Adjacent objects in memory
2. **Temporal locality**: Reused objects still in cache
3. **Prefetch efficiency**: Sequential access patterns
4. **Reduced TLB misses**: Fewer page table lookups

**Benchmark Results** (1M allocations):
- `new`/`delete`: 150ms, ~70% cache miss rate
- Object pool: 15ms, ~10% cache miss rate
- **10x faster** primarily due to cache efficiency

**Key Takeaway**: Object pools provide performance gains from both eliminated allocator overhead AND improved cache behavior through memory locality and object reuse.

---

#### Q9: What issues arise when using object pools for types with special alignment...
**Difficulty:** #advanced
**Category:** #safety
**Concepts:** #alignment #simd

**Question:** What issues arise when using object pools for types with special alignment requirements (e.g., SIMD types)?



**Answer**: Default allocators may not respect alignment requirements beyond `alignof(std::max_align_t)`. SIMD types requiring 16/32/64-byte alignment need explicit aligned allocation using `alignas`, `std::aligned_storage`, or platform-specific functions like `aligned_alloc`.

**Explanation**:
```cpp
// ❌ Potentially misaligned
struct alignas(32) SIMDData {
    float values[8];  // AVX requires 32-byte alignment
};

class BadPool {
    char* storage = new char[sizeof(SIMDData) * 100];  // ❌ 1-byte aligned!

    SIMDData* allocate() {
        return reinterpret_cast<SIMDData*>(storage);  // ❌ UB if misaligned
        // AVX load/store will fault or silently give wrong results
    }
};

// ✅ Properly aligned
class GoodPool {
    alignas(32) char storage[sizeof(SIMDData) * 100];  // ✅ 32-byte aligned

    // Or use aligned allocation
    SIMDData* storagePtr;

    GoodPool() {
        #ifdef _WIN32
            storagePtr = static_cast<SIMDData*>(
                _aligned_malloc(sizeof(SIMDData) * 100, 32));
        #else
            storagePtr = static_cast<SIMDData*>(
                aligned_alloc(32, sizeof(SIMDData) * 100));
        #endif
    }

    ~GoodPool() {
        #ifdef _WIN32
            _aligned_free(storagePtr);
        #else
            free(storagePtr);
        #endif
    }
};

// ✅ C++17 aligned_storage
template <typename T, size_t N>
class ModernPool {
    using Storage = std::aligned_storage_t<sizeof(T), alignof(T)>;
    Storage storage[N];  // ✅ Correctly aligned

public:
    T* allocate(size_t index) {
        return std::launder(reinterpret_cast<T*>(&storage[index]));
    }
};
```

**Verification**:
```cpp
void* ptr = pool.allocate();
assert(reinterpret_cast<uintptr_t>(ptr) % alignof(SIMDData) == 0);
```

**Key Takeaway**: Always verify and respect alignment requirements for SIMD types using explicit alignment attributes or aligned allocation functions to avoid undefined behavior and performance degradation.

---

#### Q10: What is the difference between an object pool and a memory pool?
**Difficulty:** #mid
**Category:** #design_patterns
**Concepts:** #object_pool_vs_memory_pool

**Question:** What is the difference between an object pool and a memory pool?



**Answer**: An **object pool** manages fully constructed, typed objects ready for use, while a **memory pool** provides raw, uninitialized memory blocks that require placement new for object construction. Object pools handle object lifetimes; memory pools only handle allocation.

**Explanation**:
```cpp
// Object Pool: High-level, manages objects
class ObjectPool {
    std::vector<MyObject*> freeList;

public:
    MyObject* allocate() {
        MyObject* obj = freeList.back();  // ✅ Ready to use
        freeList.pop_back();
        return obj;  // Object already constructed
    }

    void deallocate(MyObject* obj) {
        freeList.push_back(obj);  // May or may not destruct
    }
};

// Memory Pool: Low-level, provides memory
class MemoryPool {
    void* freeList[100];
    size_t freeCount;

public:
    void* allocate(size_t size) {
        return freeList[--freeCount];  // ❌ Raw memory, not initialized
    }

    void deallocate(void* ptr) {
        freeList[freeCount++] = ptr;
    }
};

// Usage comparison
// Object pool - simple
MyObject* obj = objectPool.allocate();  // ✅ Ready to use
obj->method();
objectPool.deallocate(obj);

// Memory pool - requires placement new
void* mem = memoryPool.allocate(sizeof(MyObject));
MyObject* obj = new (mem) MyObject();  // ✅ Must construct
obj->method();
obj->~MyObject();  // ✅ Must destruct
memoryPool.deallocate(mem);
```

**Comparison Table**:

| Feature | Object Pool | Memory Pool |
|---------|-------------|-------------|
| Returns | Constructed objects | Raw memory |
| Type | Strongly typed | Type-agnostic (void*) |
| Construction | Automatic or reused | Manual (placement new) |
| Destruction | Optional | Manual (explicit) |
| Use Case | Same type repeatedly | Custom allocators |

**Key Takeaway**: Object pools manage complete object lifetimes for a specific type; memory pools provide flexible raw memory for mixed-type allocation requiring manual lifecycle management.

---

#### Q11: How does RAII apply to object pool design?
**Difficulty:** #beginner
**Category:** #terminology
**Concepts:** #raii #resource_management

**Question:** How does RAII apply to object pool design?



**Answer**: RAII (Resource Acquisition Is Initialization) ensures the pool's pre-allocated memory is acquired in the constructor and released in the destructor. This guarantees proper cleanup even if exceptions occur, preventing memory leaks.

**Explanation**:
```cpp
// ✅ RAII-compliant object pool
template <typename T, size_t N>
class ObjectPool {
    T* storage;  // Resource

public:
    // Constructor acquires resource
    ObjectPool() : storage(new T[N]()) {
        // Initialize free list...
    }

    // Destructor releases resource
    ~ObjectPool() {
        delete[] storage;  // ✅ Always called, even with exceptions
    }

    // Prevent copying (unique ownership)
    ObjectPool(const ObjectPool&) = delete;
    ObjectPool& operator=(const ObjectPool&) = delete;

    // Allow move (transfer ownership)
    ObjectPool(ObjectPool&& other) noexcept
        : storage(other.storage) {
        other.storage = nullptr;
    }

    T* allocate() { /* ... */ }
    void deallocate(T* ptr) { /* ... */ }
};

// Usage - automatic cleanup
void function() {
    ObjectPool<MyType, 100> pool;  // Resource acquired

    if (error) {
        throw std::runtime_error("error");  // Exception thrown
    }

    // Use pool...

}  // ✅ Destructor called automatically (even if exception thrown)
   // storage deleted, no leak
```

**Key Takeaway**: RAII ensures object pools automatically manage their allocated memory through constructor/destructor pairs, providing exception safety and leak prevention.

---

#### Q12: Why are object pools essential in real-time systems like game engines or...
**Difficulty:** #mid
**Category:** #practical_application
**Concepts:** #realtime_systems #latency

**Question:** Why are object pools essential in real-time systems like game engines or autonomous vehicles?



**Answer**: Real-time systems require **deterministic, bounded latency** for operations. Dynamic allocation via `new`/`delete` involves unpredictable OS calls, locks, and search times. Object pools provide O(1) constant-time allocation with no system calls, ensuring predictable frame times or control loop execution.

**Explanation**:
```cpp
// ❌ Non-deterministic: malloc can take 1µs to 1ms
for (int i = 0; i < particleCount; i++) {
    Particle* p = new Particle();  // Unpredictable latency!
    // If this takes 1ms, we miss our 10ms frame budget
    particles.push_back(p);
}

// ✅ Deterministic: pool allocate always takes ~10ns
ObjectPool<Particle, 10000> pool;
for (int i = 0; i < particleCount; i++) {
    Particle* p = pool.allocate();  // Constant time, no syscalls
    particles.push_back(p);
}
```

**Real-World Scenarios**:

**Autonomous Vehicle (100Hz control loop = 10ms budget)**:
```cpp
class PerceptionSystem {
    ObjectPool<Detection, 500> detectionPool;

public:
    void processFrame() {
        auto start = std::chrono::high_resolution_clock::now();

        // Process LiDAR point cloud
        for (const auto& cluster : clusters) {
            Detection* det = detectionPool.allocate();  // ✅ <10ns
            classifyObject(cluster, det);
            detections.push_back(det);
        }

        auto end = std::chrono::high_resolution_clock::now();
        auto duration = std::chrono::duration_cast<std::chrono::microseconds>(end - start);

        // Must complete in <10ms to maintain 100Hz
        assert(duration.count() < 10000);
    }
};
```

**Latency Comparison**:
- `new`/`delete`: 100ns-1ms (variable)
- Object pool: 5-20ns (constant)
- **10-100x more predictable**

**Key Takeaway**: Object pools eliminate allocation latency variability, providing the deterministic performance required for real-time systems with strict timing deadlines.

---

#### Q13: How can false sharing occur in object pools and how do you prevent it?
**Difficulty:** #advanced
**Category:** #optimization
**Concepts:** #false_sharing #cache_lines

**Question:** How can false sharing occur in object pools and how do you prevent it?



**Answer**: False sharing occurs when objects from the pool are accessed by different threads and happen to share the same cache line (typically 64 bytes). Even though threads access different objects, cache coherence causes performance degradation. Prevent by ensuring objects are at least cache-line aligned.

**Explanation**:
```cpp
// ❌ False sharing scenario
struct Counter {
    int value;  // Only 4 bytes
    // 60 bytes of padding until next cache line
};

ObjectPool<Counter, 100> pool;

// Thread 1 modifies counter at index 0
// Thread 2 modifies counter at index 1
// If both in same cache line → false sharing!

void thread1(ObjectPool<Counter, 100>& pool) {
    Counter* c1 = pool.allocate();  // Might be at offset 0
    while (running) {
        c1->value++;  // Causes cache line invalidation
    }
}

void thread2(ObjectPool<Counter, 100>& pool) {
    Counter* c2 = pool.allocate();  // Might be at offset 4 (same cache line!)
    while (running) {
        c2->value++;  // Cache line bounces between cores
    }
}
// Performance degrades by 10-100x due to cache coherence traffic

// ✅ Solution: Cache-line aligned objects
struct alignas(64) AlignedCounter {
    int value;
    char padding[60];  // Explicit padding to fill cache line
};

// Or let compiler handle it
struct alignas(std::hardware_destructive_interference_size) Counter {
    int value;
};

ObjectPool<AlignedCounter, 100> pool;
// Now each Counter is guaranteed on separate cache line
```

**Detection**:
```bash
# Use perf to detect false sharing
perf c2c record ./program
perf c2c report
```

**Performance Impact**:
- Without alignment: 1M ops/sec per thread
- With alignment: 100M ops/sec per thread
- **100x performance difference**

**Key Takeaway**: In multi-threaded object pools, ensure objects are cache-line aligned (64 bytes) to prevent false sharing when objects are accessed by different threads concurrently.

---

#### Q14: Do object pools suffer from memory fragmentation? Why or why not?
**Difficulty:** #mid
**Category:** #memory_management
**Concepts:** #fragmentation #defragmentation

**Question:** Do object pools suffer from memory fragmentation? Why or why not?



**Answer**: Object pools do **not** suffer from external fragmentation because all objects are the same size and allocated from a pre-determined block. However, internal fragmentation can occur if the pool size is poorly chosen (allocated but unused memory).

**Explanation**:
```cpp
// Regular heap: External fragmentation
new Object(100);   // [OOOO____________________]
new Object(50);    // [OOOOOO__________________]
delete first;      // [____OO__________________]
new Object(120);   // ❌ Can't fit! Fragmented

// Object pool: No external fragmentation
ObjectPool<Object, 10> pool;  // [##########] (all same size)

Object* o1 = pool.allocate();  // [X#########]
Object* o2 = pool.allocate();  // [XX########]
pool.deallocate(o1);           // [_X########]
Object* o3 = pool.allocate();  // [XX########] (reuses o1's slot)
// ✅ Always fits, no fragmentation
```

**Internal Fragmentation Example**:
```cpp
// Pool sized for peak load
ObjectPool<BigObject, 10000> pool;  // 10,000 objects pre-allocated

// But typical usage is only 100 objects
// 9,900 objects allocated but never used = internal fragmentation
// Wasted memory: 9,900 * sizeof(BigObject)
```

**Mitigation Strategies**:
1. **Right-size pools**: Profile to determine actual peak usage
2. **Chunk-based pools**: Grow dynamically as needed
3. **Multiple pools**: Different sizes for different object types

**Key Takeaway**: Object pools eliminate external fragmentation through uniform object sizes but can have internal fragmentation if overprovisioned; size pools based on actual peak usage metrics.

---

#### Q15: What strategies exist for handling pool exhaustion when all objects are...
**Difficulty:** #advanced
**Category:** #design
**Concepts:** #pool_exhaustion #error_handling

**Question:** What strategies exist for handling pool exhaustion when all objects are allocated?



**Answer**: (1) **Throw exception**: Fail fast (best for development). (2) **Return nullptr**: Allow caller to handle (flexible). (3) **Expand dynamically**: Allocate new chunk (unbounded growth). (4) **Steal from lower priority**: Evict LRU object (complex). (5) **Block and wait**: Sleep until object available (real-time unfriendly).

**Explanation**:
```cpp
// 1. Throw exception - fail fast
T* allocate() {
    if (freeList.empty()) {
        throw std::bad_alloc();  // ✅ Clear error
    }
    return freeList.back();
}

// 2. Return nullptr - flexible
T* allocate() {
    if (freeList.empty()) {
        return nullptr;  // ✅ Caller decides
    }
    return freeList.back();
}

// Usage
if (T* obj = pool.allocate()) {
    // Use obj
} else {
    // Handle exhaustion (skip, wait, etc.)
}

// 3. Expand dynamically - grow on demand
T* allocate() {
    if (freeList.empty()) {
        allocateChunk();  // ✅ Transparent growth
    }
    return freeList.back();
}

// 4. Evict LRU - for cache-like pools
T* allocate() {
    if (freeList.empty()) {
        T* victim = findLRU();  // Find least recently used
        evict(victim);          // Force deallocate
        return victim;          // Reuse
    }
    return freeList.back();
}

// 5. Block and wait - for non-real-time
T* allocate() {
    while (freeList.empty()) {
        std::this_thread::sleep_for(std::chrono::milliseconds(1));
        // Or use condition variable
    }
    return freeList.back();
}
```

**Trade-offs**:

| Strategy | Pros | Cons | Use Case |
|----------|------|------|----------|
| Exception | Clear failure | Requires exception handling | Development/testing |
| nullptr | Flexible handling | Must check every time | Production (optional features) |
| Expand | Transparent | Unbounded memory | Non-critical systems |
| Evict | Bounded size | Complex LRU tracking | Cache-like pools |
| Block | Eventually succeeds | Latency spikes | Background threads |

**Key Takeaway**: Choose exhaustion strategy based on system requirements: throw for development, nullptr for optional operations, expand for flexibility, evict for bounded caches, block for non-real-time producers.

---

#### Q16: Should objects in a pool be reset/cleared when allocated or deallocated?
**Difficulty:** #beginner
**Category:** #implementation
**Concepts:** #constructordestructor_behavior

**Question:** Should objects in a pool be reset/cleared when allocated or deallocated?



**Answer**: **Depends on use case**. Reset on allocation provides clean objects but adds overhead to the critical path. Reset on deallocation cleans up immediately but requires work even if object isn't reused soon. For POD types, often don't reset at all (let user initialize). For non-POD, call destructor on deallocation and constructor on allocation.

**Explanation**:
```cpp
// Option 1: Reset on allocation (lazy cleanup)
T* allocate() {
    T* obj = freeList.back();
    freeList.pop_back();
    *obj = T();  // ✅ Fresh object, but adds latency to allocation
    return obj;
}

void deallocate(T* obj) {
    freeList.push_back(obj);  // Don't modify
}

// Option 2: Reset on deallocation (eager cleanup)
T* allocate() {
    return freeList.back();  // Fast allocation
}

void deallocate(T* obj) {
    *obj = T();  // ✅ Clean up now
    freeList.push_back(obj);
}

// Option 3: No reset (best performance for POD)
T* allocate() {
    return freeList.back();  // ✅ Fastest
}

void deallocate(T* obj) {
    freeList.push_back(obj);  // ✅ Fastest
}
// User responsible for initialization

// Option 4: Explicit lifecycle (non-POD)
T* allocate() {
    void* mem = freeList.back();
    freeList.pop_back();
    return new (mem) T();  // ✅ Construct new object
}

void deallocate(T* obj) {
    obj->~T();  // ✅ Destruct
    freeList.push_back(obj);
}
```

**Performance Comparison** (1M allocations):
- No reset: 10ms
- Reset on alloc: 15ms
- Reset on dealloc: 14ms
- Full construct/destruct: 50ms

**Key Takeaway**: For POD types, avoid reset for maximum performance; for non-POD types with resources, use placement new/explicit destruction; choose reset timing based on whether allocation or deallocation is more critical.

---

#### Q17: What validation checks should an object pool perform in debug builds?
**Difficulty:** #mid
**Category:** #testing
**Concepts:** #validation #debugging

**Question:** What validation checks should an object pool perform in debug builds?



**Answer**: Debug builds should validate: (1) Pointer belongs to pool storage range, (2) No double-free (usage tracking), (3) No memory leaks on pool destruction, (4) Alignment correctness, (5) Corruption detection (canary values).

**Explanation**:
```cpp
template <typename T, size_t N>
class DebugPool {
    static constexpr uint32_t CANARY = 0xDEADBEEF;

    struct DebugBlock {
        uint32_t canary;  // Detect buffer overflow
        T object;
    };

    DebugBlock* storage;
    bool used[N] = {};
    int allocationCount = 0;

public:
    T* allocate() {
        #ifdef DEBUG
            // Check for leaks
            if (freeCount == 0) {
                std::cerr << "Pool exhausted! "
                         << allocationCount << " allocations, "
                         << (N - freeCount) << " still allocated\n";
                dumpAllocations();
            }
        #endif

        size_t index = freeList[--freeCount];
        DebugBlock* block = &storage[index];

        #ifdef DEBUG
            // Check canary
            if (block->canary != CANARY) {
                std::cerr << "Corruption detected at index " << index << "!\n";
                std::terminate();
            }

            used[index] = true;
            allocationCount++;
        #endif

        return &block->object;
    }

    void deallocate(T* ptr) {
        #ifdef DEBUG
            // Validate pointer range
            DebugBlock* block = reinterpret_cast<DebugBlock*>(
                reinterpret_cast<char*>(ptr) - offsetof(DebugBlock, object));

            if (block < storage || block >= storage + N) {
                std::cerr << "Pointer " << ptr << " not from this pool!\n";
                std::terminate();
            }

            size_t index = block - storage;

            // Check double-free
            if (!used[index]) {
                std::cerr << "Double-free detected at index " << index << "!\n";
                dumpBacktrace();
                std::terminate();
            }

            // Check alignment
            if (reinterpret_cast<uintptr_t>(ptr) % alignof(T) != 0) {
                std::cerr << "Misaligned pointer " << ptr << "!\n";
                std::terminate();
            }

            used[index] = false;
        #endif

        freeList[freeCount++] = ptr - storage;
    }

    ~DebugPool() {
        #ifdef DEBUG
            // Check for leaks
            int leaks = 0;
            for (size_t i = 0; i < N; ++i) {
                if (used[i]) {
                    std::cerr << "Leak: Object at index " << i << " not deallocated\n";
                    leaks++;
                }
            }

            if (leaks > 0) {
                std::cerr << "Pool destroyed with " << leaks << " leaked objects!\n";
            }
        #endif
    }

private:
    void dumpAllocations() {
        for (size_t i = 0; i < N; ++i) {
            if (used[i]) {
                std::cerr << "  Index " << i << ": allocated\n";
            }
        }
    }
};
```

**Validation Levels**:
- **Minimal**: Pointer range check only
- **Standard**: + Double-free detection
- **Paranoid**: + Canaries + Leak tracking + Alignment

**Key Takeaway**: Comprehensive debug validation catches bugs early at development time with minimal overhead; disable checks in release builds for maximum performance.

---

#### Q18: Design an object pool system for an autonomous vehicle's LiDAR point cloud...
**Difficulty:** #advanced
**Category:** #realworld_design
**Concepts:** #autonomous_vehicles #sensor_data

**Question:** Design an object pool system for an autonomous vehicle's LiDAR point cloud processing that handles 1 million points at 10Hz. What are the key design considerations?



**Answer**: Key considerations: (1) **Pool size**: 10M points (1M × 10 frames buffered), (2) **Thread-safety**: Multiple threads (capture, process, track), (3) **Alignment**: 16-byte for SIMD processing, (4) **Chunked growth**: Handle bursts beyond 1M, (5) **Cache efficiency**: Contiguous storage for sequential access, (6) **Zero-copy**: Return ownership, not copies.

**Explanation**:
```cpp
// Point cloud data structure
struct alignas(16) Point3D {
    float x, y, z;        // Position
    float intensity;      // Reflectivity
    uint16_t ring;        // Laser ring ID
    uint16_t flags;       // Status flags
};

// High-performance pool for point cloud
class PointCloudPool {
    static constexpr size_t POINTS_PER_CHUNK = 1'000'000;
    static constexpr size_t MAX_CHUNKS = 10;  // 10M points max

    struct Chunk {
        Point3D* points;
        std::atomic<size_t> allocated{0};
        std::atomic<size_t> freed{0};

        Chunk() : points(static_cast<Point3D*>(
            aligned_alloc(16, sizeof(Point3D) * POINTS_PER_CHUNK))) {}

        ~Chunk() { free(points); }
    };

    std::vector<std::unique_ptr<Chunk>> chunks;
    std::mutex chunkMutex;
    size_t currentChunk = 0;

public:
    PointCloudPool() {
        // Pre-allocate initial chunks
        for (size_t i = 0; i < 2; ++i) {
            chunks.push_back(std::make_unique<Chunk>());
        }
    }

    // Bulk allocation for entire point cloud
    Point3D* allocateCloud(size_t pointCount) {
        std::lock_guard<std::mutex> lock(chunkMutex);

        Chunk* chunk = chunks[currentChunk].get();

        size_t available = POINTS_PER_CHUNK - chunk->allocated.load();

        if (pointCount > available) {
            // Move to next chunk or allocate new one
            currentChunk++;
            if (currentChunk >= chunks.size()) {
                if (chunks.size() >= MAX_CHUNKS) {
                    throw std::bad_alloc();  // Hard limit
                }
                chunks.push_back(std::make_unique<Chunk>());
            }
            chunk = chunks[currentChunk].get();
        }

        size_t offset = chunk->allocated.fetch_add(pointCount);
        return &chunk->points[offset];
    }

    // Return entire cloud
    void deallocateCloud(Point3D* cloud, size_t pointCount) {
        // Find owning chunk and update freed counter
        std::lock_guard<std::mutex> lock(chunkMutex);

        for (auto& chunk : chunks) {
            if (cloud >= chunk->points &&
                cloud < chunk->points + POINTS_PER_CHUNK) {

                chunk->freed.fetch_add(pointCount);

                // If chunk fully freed, reset for reuse
                if (chunk->freed.load() == chunk->allocated.load()) {
                    chunk->allocated.store(0);
                    chunk->freed.store(0);
                }
                return;
            }
        }
    }

    void printStats() {
        std::lock_guard<std::mutex> lock(chunkMutex);
        std::cout << "PointCloudPool Stats:\n";
        std::cout << "  Chunks: " << chunks.size() << "\n";
        std::cout << "  Capacity: " << (chunks.size() * POINTS_PER_CHUNK) << " points\n";

        for (size_t i = 0; i < chunks.size(); ++i) {
            std::cout << "  Chunk " << i << ": "
                      << chunks[i]->allocated << " allocated, "
                      << chunks[i]->freed << " freed\n";
        }
    }
};

// Usage in perception pipeline
class LiDARProcessor {
    PointCloudPool pool;

public:
    void processScan(const std::vector<float>& rawData) {
        size_t pointCount = rawData.size() / 4;  // x,y,z,intensity

        // Allocate from pool (no malloc!)
        Point3D* cloud = pool.allocateCloud(pointCount);

        // Convert raw data to points
        for (size_t i = 0; i < pointCount; ++i) {
            cloud[i].x = rawData[i * 4 + 0];
            cloud[i].y = rawData[i * 4 + 1];
            cloud[i].z = rawData[i * 4 + 2];
            cloud[i].intensity = rawData[i * 4 + 3];
        }

        // Process point cloud (SIMD-optimized due to alignment)
        processCluster(cloud, pointCount);

        // Return to pool
        pool.deallocateCloud(cloud, pointCount);
    }

private:
    void processCluster(Point3D* cloud, size_t count) {
        // SIMD processing enabled by 16-byte alignment
        for (size_t i = 0; i < count; i += 4) {
            // AVX operations on 4 points at once
            // ...
        }
    }
};
```

**Performance Requirements**:
- **Latency**: <1ms per frame (10Hz = 100ms budget)
- **Throughput**: 10M points/sec
- **Memory**: ~160MB (10M × 16 bytes)
- **Thread-safety**: Multiple threads accessing pool

**Key Takeaway**: High-throughput sensor processing requires specialized pools with bulk allocation, SIMD alignment, chunk-based growth, and careful thread-safety to meet real-time constraints.

---

#### Q19: What API design choices improve object pool usability and safety?
**Difficulty:** #mid
**Category:** #best_practices
**Concepts:** #api_design #usability

**Question:** What API design choices improve object pool usability and safety?



**Answer**: (1) **RAII wrappers**: Return smart pointers that auto-deallocate, (2) **Type safety**: Template on object type, (3) **Clear ownership**: Explicit allocate/deallocate, (4) **Statistics**: Provide usage metrics, (5) **Exception safety**: No-throw guarantee or clear exception specifications.

**Explanation**:
```cpp
// 1. RAII wrapper for automatic deallocation
template <typename T>
class PoolPtr {
    T* ptr;
    ObjectPool<T>* pool;

public:
    PoolPtr(T* p, ObjectPool<T>* pl) : ptr(p), pool(pl) {}

    ~PoolPtr() {
        if (ptr && pool) {
            pool->deallocate(ptr);  // ✅ Automatic return
        }
    }

    // Move semantics
    PoolPtr(PoolPtr&& other) noexcept
        : ptr(other.ptr), pool(other.pool) {
        other.ptr = nullptr;
    }

    // Disable copy
    PoolPtr(const PoolPtr&) = delete;

    T* get() const { return ptr; }
    T* operator->() const { return ptr; }
    T& operator*() const { return *ptr; }
};

// Usage - automatic cleanup
{
    PoolPtr<MyObject> obj = pool.allocate();  // ✅ RAII
    obj->method();
}  // ✅ Automatically returned to pool

// 2. Type-safe API
template <typename T, size_t N>
class TypeSafePool {
public:
    PoolPtr<T> allocate() {  // ✅ Returns RAII wrapper
        T* obj = storage[--freeCount];
        return PoolPtr<T>(obj, this);
    }

    // No raw pointer exposure
};

// 3. Statistics API
class MonitoredPool {
public:
    struct Stats {
        size_t totalAllocations;
        size_t totalDeallocations;
        size_t currentlyAllocated;
        size_t peakAllocated;
        size_t capacity;
    };

    Stats getStats() const {
        return {totalAllocs, totalDeallocs,
                capacity - freeCount, peakUsage, capacity};
    }

    void printStats() const {
        auto s = getStats();
        std::cout << "Pool Statistics:\n"
                  << "  Capacity: " << s.capacity << "\n"
                  << "  Current: " << s.currentlyAllocated << "\n"
                  << "  Peak: " << s.peakAllocated << "\n"
                  << "  Total allocs: " << s.totalAllocations << "\n";
    }
};

// 4. Exception specifications
class ExceptionSafePool {
public:
    // Clear exception contract
    T* allocate();  // throws std::bad_alloc if exhausted

    // No-throw guarantee
    void deallocate(T* ptr) noexcept;

    // Or return optional
    std::optional<T*> tryAllocate() noexcept {
        if (freeCount == 0) return std::nullopt;
        return freeList[--freeCount];
    }
};
```

**Best Practices Summary**:
- ✅ Return RAII wrappers for automatic cleanup
- ✅ Provide statistics for monitoring
- ✅ Clear exception contracts
- ✅ Delete copy, implement move
- ✅ Document thread-safety guarantees

**Key Takeaway**: Well-designed pool APIs use RAII wrappers for safety, provide statistics for monitoring, and clearly specify exception behavior for reliable integration.

---

#### Q20: How would you implement a lock-free object pool for single-producer/single-co...
**Difficulty:** #advanced
**Category:** #optimization
**Concepts:** #lockfree #atomic_operations

**Question:** How would you implement a lock-free object pool for single-producer/single-consumer scenarios?



**Answer**: Use two atomic indices (head and tail) forming a ring buffer. Producer writes to head, consumer reads from tail. Atomics with acquire/release memory ordering ensure visibility without locks. This achieves wait-free allocation/deallocation.

**Explanation**:
```cpp
template <typename T, size_t Capacity>
class LockFreePoolSPSC {
    static_assert((Capacity & (Capacity - 1)) == 0, "Capacity must be power of 2");

    T storage[Capacity];
    T* freeList[Capacity];

    alignas(64) std::atomic<size_t> head{0};  // Producer writes here
    alignas(64) std::atomic<size_t> tail{0};  // Consumer reads here

public:
    LockFreePoolSPSC() {
        // Initialize free list
        for (size_t i = 0; i < Capacity; ++i) {
            freeList[i] = &storage[i];
        }
        head.store(Capacity, std::memory_order_relaxed);
    }

    // Producer only - deallocate (return to pool)
    bool deallocate(T* ptr) noexcept {
        size_t h = head.load(std::memory_order_relaxed);
        size_t t = tail.load(std::memory_order_acquire);

        // Check if full (rare)
        if (h - t >= Capacity) {
            return false;  // Queue full
        }

        freeList[h % Capacity] = ptr;
        head.store(h + 1, std::memory_order_release);  // Publish
        return true;
    }

    // Consumer only - allocate (get from pool)
    T* allocate() noexcept {
        size_t t = tail.load(std::memory_order_relaxed);
        size_t h = head.load(std::memory_order_acquire);

        // Check if empty
        if (t == h) {
            return nullptr;  // Queue empty
        }

        T* obj = freeList[t % Capacity];
        tail.store(t + 1, std::memory_order_release);  // Publish
        return obj;
    }

    // Safe from any thread (uses acquire)
    size_t size() const noexcept {
        size_t h = head.load(std::memory_order_acquire);
        size_t t = tail.load(std::memory_order_acquire);
        return h - t;
    }
};

// Usage - producer thread
void producer(LockFreePoolSPSC<Message, 1024>& pool) {
    Message* msg = getMessageFromNetwork();
    pool.deallocate(msg);  // ✅ No lock, wait-free
}

// Consumer thread
void consumer(LockFreePoolSPSC<Message, 1024>& pool) {
    Message* msg = pool.allocate();  // ✅ No lock, wait-free
    if (msg) {
        processMessage(msg);
    }
}
```

**Memory Ordering Explanation**:
- `relaxed`: No synchronization (local reads)
- `acquire`: Synchronizes-with releases (read published data)
- `release`: Makes writes visible to acquires (publish data)

**Performance**:
- Lock-free: ~5ns per operation
- Mutex-based: ~20-50ns per operation
- **4-10x faster** for SPSC

**Key Takeaway**: Lock-free SPSC pools use atomic head/tail indices with acquire/release memory ordering for wait-free, cache-efficient allocation with zero contention.

---

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

### QUICK_REFERENCE: Key Takeaways and Comparison Tables
#### Answer Key

| Q# | Issue/Answer | Explanation | Key Concept |
|----|--------------|-------------|-------------|
| 1 | `storage[i]` should be `&storage[i]` | Pushing object by value, not pointer address | Pointer vs reference |
| 2 | Missing lock in `deallocate()` | Race condition on freeList modification | Thread-safety |
| 3 | Add `bool used[]` array to track state | Check `used[index]` in deallocate, throw if already false | Double-free detection |
| 4 | `size_t idx = freeList[--freeCount]; return &storage[idx];` | Get index, calculate address from storage base | Index-based allocation |
| 5 | Never calls destructors for `string` and `vector` | Must call `obj->~Resource()` before returning to pool | Placement new/delete |
| 6 | Loop chunks: `if (ptr >= chunk && ptr < chunk + CHUNK_SIZE)` | Check if pointer in range `[chunkStart, chunkEnd)` | Pointer validation |
| 7 | Use `aligned_alloc(32, size)` or `alignas(32) char storage[]` | Ensure storage meets alignment requirement | Aligned allocation |
| 8 | Should be `delete[] storage` (array delete) | Single delete for array causes undefined behavior | Array vs single delete |
| 9 | Use `head.fetch_add(1)` atomic operation | Non-atomic read-modify-write causes race | Atomic operations |
| 10 | Alloc: `new (mem) Resource();` Dealloc: `obj->~Resource();` | Placement new to construct, explicit destructor to destruct | Lifecycle management |
| 11 | `size_t chunkIdx = findChunk(ptr); return chunkIdx * CHUNK_SIZE + (ptr - chunks[chunkIdx]);` | Chunk index * size + offset within chunk | Global indexing |
| 12 | Never adds freed slots back to free list | Deallocate must push index/pointer to reuse structure | Free list requirement |
| 13 | Adjacent Counters share cache line (64 bytes) | Threads cause cache line bouncing between cores | False sharing |
| 14 | `alignas(64) T value; char padding[64 - sizeof(T)];` | Pad to cache line size (typically 64 bytes) | Cache line alignment |
| 15 | Track `allocs`, `deallocs`, `peak = max(allocs - deallocs)` | Increment counters on alloc/dealloc, calculate metrics | Statistics |
| 16 | Use `alignas(T) char storage[]` or `aligned_alloc(alignof(T), size)` | `new char[]` only guarantees 1-byte alignment | Type alignment |
| 17 | `1: throw std::bad_alloc(); 2: return nullptr; 3: allocateChunk();` | Different strategies for different requirements | Exhaustion handling |
| 18 | Check `ptr >= storage && ptr < storage + N` | Validate pointer is within pool bounds | Bounds checking |
| 19 | Store `T* ptr` and `Pool* pool`; destructor calls `pool->deallocate(ptr)` | RAII wrapper for automatic return | Smart pointer pattern |
| 20 | Check `freeList.size() != capacity` in destructor, log warning | Indicates allocated objects not returned (leak) | Leak detection |

---

#### Object Pool Design Patterns

#### 1. Fixed-Size Pool
```cpp
template <typename T, size_t N>
class FixedPool {
    T storage[N];
    T* freeList[N];
    size_t freeCount = N;
};
```

#### 2. Index-Based Pool
```cpp
template <typename T, size_t N>
class IndexPool {
    T* storage;
    size_t freeList[N];
    size_t freeCount = N;
};
```

#### 3. Thread-Safe Pool
```cpp
template <typename T>
class ThreadSafePool {
    std::mutex mtx;
    std::vector<T*> freeList;
    // Lock all operations
};
```

#### 4. Expandable Pool
```cpp
template <typename T>
class ExpandablePool {
    std::vector<T*> chunks;
    std::vector<size_t> freeList;
    // Grow dynamically
};
```

#### 5. Lock-Free SPSC
```cpp
template <typename T, size_t N>
class LockFreePoolSPSC {
    std::atomic<size_t> head, tail;
    T* buffer[N];
};
```

---

#### Performance Comparison

| Pool Type | Alloc Time | Thread-Safe | Growth | Memory Overhead |
|-----------|------------|-------------|--------|-----------------|
| Fixed | ~10ns | ❌ | No | Minimal |
| Fixed + Mutex | ~30ns | ✅ | No | Mutex |
| Expandable | ~15ns | ❌ | Yes | Chunk pointers |
| Expandable + Mutex | ~35ns | ✅ | Yes | Mutex + chunks |
| Lock-Free SPSC | ~5ns | ⚠️ SPSC only | No | Minimal |
| `new`/`delete` | 100-1000ns | ✅ | N/A | Per-allocation |

---

#### Common Use Cases

| Application | Pool Type | Key Requirements |
|-------------|-----------|------------------|
| **Game Particles** | Fixed, Lock-Free | High frequency, known max count |
| **Network Buffers** | Expandable, Thread-Safe | Variable load, multiple threads |
| **Sensor Data** | Fixed, Aligned | Real-time, SIMD processing |
| **Database Connections** | Expandable, Thread-Safe | Expensive creation, shared access |
| **Message Queues** | Lock-Free SPSC | Minimal latency, producer-consumer |

---

#### Autonomous Vehicle Applications

| Component | Pool Configuration | Rationale |
|-----------|-------------------|-----------|
| **LiDAR Points** | 10M points, 16-byte aligned, Chunked | High volume, SIMD processing |
| **Detections** | 500 objects, Thread-safe, Fixed | Bounded count, shared access |
| **Trajectories** | 1000 paths, Index-based, Fixed | Frequent alloc/dealloc, deterministic |
| **Messages** | Lock-free SPSC, 4KB buffers | Inter-thread communication, low latency |

---

#### Memory Layout Strategies

**Contiguous Array**:
```
[Obj0][Obj1][Obj2]...[ObjN]  ← Good cache locality
```

**Chunked Growth**:
```
Chunk 0: [Obj0...Obj99]
Chunk 1: [Obj100...Obj199]
Chunk 2: [Obj200...Obj299]
```

**Cache-Line Aligned**:
```
[Obj0________64B________][Obj1________64B________]
```

---

#### Debug vs Release Build

**Debug** (paranoid validation):
- Usage tracking (`bool used[]`)
- Pointer range checks
- Canary values
- Leak detection on destruction
- **~2x slower**

**Release** (minimal checks):
- Only critical validations
- Inline everything
- Strip asserts
- **Maximum performance**

---

#### Testing Strategies

```cpp
// 1. Exhaustion test
for (size_t i = 0; i < capacity; ++i) {
    assert(pool.allocate() != nullptr);
}
assert_throws(pool.allocate());

// 2. Reuse test
T* obj1 = pool.allocate();
pool.deallocate(obj1);
T* obj2 = pool.allocate();
// Likely obj1 == obj2 (reused)

// 3. Thread-safety test (TSan)
std::vector<std::thread> threads;
for (int i = 0; i < 10; ++i) {
    threads.emplace_back([&] {
        for (int j = 0; j < 1000; ++j) {
            T* obj = pool.allocate();
            pool.deallocate(obj);
        }
    });
}

// 4. Leak test
{
    Pool pool;
    pool.allocate();
    // Don't deallocate
}  // Pool destructor should detect leak
```

---

**End of Object Pool & Memory Pool Patterns Topic**
