## TOPIC: STL Container Thread Safety - Concurrent Access Rules and Patterns

### THEORY_SECTION: Core Concepts and Thread Safety Guarantees

#### STL Container Thread Safety Fundamentals

The C++ Standard Library containers (vector, map, unordered_map, list, etc.) provide **minimal thread safety guarantees**: multiple threads may simultaneously **read** from the same container without synchronization, but any **write** operation requires exclusive access through external synchronization (mutexes, locks, or atomics).

This design philosophy prioritizes performance for single-threaded code while allowing developers to choose appropriate synchronization strategies for concurrent access. Understanding these rules is critical for building correct multithreaded applications, especially in high-performance domains like autonomous driving where sensor data streams must be processed concurrently.

**The Golden Rule:**
- ✅ **Concurrent reads**: Multiple threads reading from the same const-qualified container = **SAFE**
- ❌ **Concurrent writes**: Multiple threads writing to the same container = **DATA RACE**
- ❌ **Concurrent read + write**: One thread reading while another writes = **DATA RACE**

Even operations that appear read-only may perform writes internally. For example, `operator[]` on `std::map` or `std::unordered_map` inserts a default-constructed element if the key doesn't exist, making it a **write operation** despite looking like a read.

#### Container-Specific Thread Safety Characteristics

Different container types have varying internal implementations that affect their behavior under concurrent access:

**std::vector (Dynamic Array):**
- Reallocation invalidates **all** iterators, references, and pointers
- `push_back()`, `insert()`, `resize()` may trigger reallocation
- Reading elements during reallocation = dangling pointer access = **CRASH**
- Solution: Reserve capacity upfront with `reserve()` or use external synchronization

**std::map (Red-Black Tree):**
- Insertion/deletion performs **local** tree rebalancing
- Iterators to unmodified elements remain valid during insertion (single-threaded)
- Tree structure changes are **localized** to the path from root to inserted/deleted node
- Slightly safer than hash tables for unsynchronized access (still **UNSAFE**, but failure modes are more constrained)

**std::unordered_map (Hash Table):**
- Most dangerous for concurrent access
- **Rehashing** occurs when load factor exceeds threshold (default 1.0)
- Rehashing **invalidates ALL iterators** and moves all elements
- `operator[]` can trigger rehashing if key doesn't exist
- `insert()` can trigger rehashing if adding element exceeds load factor
- Solution: Use `reserve()` to pre-allocate buckets, preventing rehashing

**std::list / std::deque:**
- Insertion/deletion doesn't invalidate iterators to other elements (single-threaded)
- However, concurrent modification still causes data races
- Suitable for lock-free algorithms with careful design (e.g., intrusive lists with atomic pointers)

#### Why operator[] is Dangerous

```cpp
std::unordered_map<int, std::string> map;

// Thread 1
map[1] = "hello";  // If key 1 doesn't exist, inserts default-constructed string, THEN assigns

// Thread 2
auto val = map[2];  // If key 2 doesn't exist, inserts default-constructed string AND may trigger rehashing
```

`operator[]` performs **two operations**:
1. Search for key
2. If not found, insert default-constructed value (WRITE operation)
3. If insertion causes load factor to exceed threshold, rehash entire table (GLOBAL WRITE)

This makes `operator[]` unsuitable for concurrent access without synchronization. Use `find()` or `at()` for read-only access.

#### Iterator Invalidation in Concurrent Contexts

Iterator invalidation rules from single-threaded C++ apply, but in multithreaded contexts, the timing becomes critical:

**Scenario: Vector reallocation**
```cpp
std::vector<int> vec = {1, 2, 3};  // capacity = 3

// Thread 1
auto it = vec.begin();  // Points to old buffer

// Thread 2
vec.push_back(4);  // Reallocates to new buffer, invalidates it

// Thread 1
int val = *it;  // ❌ Dangling iterator - accesses freed memory!
```

The time window between obtaining an iterator and using it becomes a race condition in multithreaded code. Even if `vec.begin()` executes before `push_back()` starts, without synchronization, there's no happens-before relationship guaranteeing the iterator remains valid.

#### C++ Standard Guarantees (§23.2.2)

The C++ standard specifies:

1. **Concurrent reads on const objects**: No synchronization required
2. **Concurrent writes to different containers**: No synchronization required
3. **Concurrent writes to the same container**: Requires synchronization
4. **Concurrent read (non-const) + write**: Requires synchronization

Importantly, "read" means accessing a **const-qualified** container. Non-const access (even if logically read-only) is not guaranteed thread-safe because internal state may change (e.g., reference counting in older implementations, lazy evaluation).

---

### EDGE_CASES: Tricky Scenarios and Hidden Pitfalls

#### Edge Case 1: operator[] Triggers Rehashing

```cpp
std::unordered_map<int, std::string> sensor_data;
sensor_data.reserve(100);  // Pre-allocate for 100 elements

// Thread 1: Camera sensor
sensor_data[1] = "camera_front";

// Thread 2: Lidar sensor
sensor_data[2] = "lidar_top";

// ... 98 more insertions ...

// Thread 100: Radar sensor
sensor_data[100] = "radar_left";  // ✅ Still safe - within reserved capacity

// Thread 101: GPS sensor
sensor_data[101] = "gps";  // ❌ TRIGGERS REHASHING! Invalidates all iterators across all threads
```

**Why this happens:**
- `reserve(100)` allocates buckets for ~100 elements based on load factor
- Insertion 101 exceeds capacity
- Hash table rehashes, moving all 100 existing elements
- Any thread holding an iterator or pointer to an element now has dangling reference

**Solution:**
```cpp
sensor_data.reserve(200);  // Over-allocate to prevent rehashing
// OR
std::shared_mutex mtx;
{
    std::unique_lock lock(mtx);  // Exclusive lock for writes
    sensor_data[101] = "gps";
}
```

#### Edge Case 2: std::map::operator[] is NOT Const

```cpp
const std::map<int, std::string> const_map = {{1, "one"}, {2, "two"}};

// ❌ COMPILATION ERROR
// auto val = const_map[1];  // operator[] is non-const!

// ✅ Correct - use at() for const access
auto val = const_map.at(1);  // Throws if key doesn't exist

// ✅ Or use find()
auto it = const_map.find(1);
if (it != const_map.end()) {
    auto val = it->second;
}
```

**Implication for multithreading:**
Even if you only want to read from a map, you cannot use `operator[]` on a `const std::map&`. This is by design: `operator[]` **modifies** the map if the key is missing. Use `at()` (throws exception) or `find()` (returns iterator) for read-only access.

#### Edge Case 3: Vector Bool is NOT Thread-Safe Even for Separate Elements

```cpp
std::vector<bool> flags(1000);  // Specialized for space efficiency

// Thread 1
flags[0] = true;

// Thread 2
flags[1] = true;  // ❌ DATA RACE even though indices differ!
```

**Why:**
`std::vector<bool>` is a **space-optimized specialization** that packs bools into bits. Multiple "elements" share the same underlying byte. Modifying `flags[0]` and `flags[1]` may modify the same byte, causing a data race at the hardware level (read-modify-write on the same memory location).

**Solution:**
```cpp
std::vector<char> flags(1000);  // Each element is separate byte - no false sharing
// OR
std::vector<std::atomic<bool>> flags(1000);  // Atomic elements (if lock-free)
// OR
Use external synchronization (mutex per group of bits)
```

#### Edge Case 4: Iterators and References During Concurrent Modification

```cpp
std::map<int, std::string> config;
config[1] = "setting1";
config[2] = "setting2";

// Thread 1: Iterator loop
for (auto& pair : config) {
    std::cout << pair.second << "\n";  // Reading
}

// Thread 2: Concurrent insertion
config[3] = "setting3";  // ❌ Modifies container during iteration
```

Even though `std::map` insertion doesn't invalidate iterators to existing elements (in single-threaded code), **concurrent modification during iteration is a data race**. The internal tree structure is being modified while Thread 1 traverses it, leading to undefined behavior.

**Failure modes:**
- Crash due to inconsistent tree pointers
- Infinite loop if tree structure becomes cyclic during rebalancing
- Skipped or duplicate elements in iteration
- Silent data corruption

#### Edge Case 5: std::string Copy-on-Write (Pre-C++11)

```cpp
// Pre-C++11 implementations (e.g., old libstdc++)
std::string shared = "shared_data";

// Thread 1
char c = shared[0];  // Read operation

// Thread 2
char d = shared[1];  // Another read

// Internal COW (copy-on-write) implementation:
// - Both threads access reference count
// - Reference count increment/decrement = data race!
```

**Historical context:**
Pre-C++11 `std::string` implementations (like GCC 4.x libstdc++) used copy-on-write with reference counting. Even **read operations** modified internal reference counts, causing data races. C++11 **banned COW strings** to enable thread-safe const access.

**Modern guarantee (C++11+):**
const `std::string` access from multiple threads is guaranteed safe. All major implementations (libc++, libstdc++, MSVC) use **eager copying** or **small string optimization (SSO)**, not COW.

---

### CODE_EXAMPLES: Progressive Demonstrations from Basic to Advanced

#### Example 1: Safe Concurrent Reads (Const Qualification)

```cpp
#include <iostream>
#include <vector>
#include <thread>
#include <string>

// ✅ SAFE: Concurrent reads on const-qualified container
void safe_concurrent_reads() {
    const std::vector<std::string> sensor_names = {
        "camera_front", "lidar_top", "radar_left", "gps"
    };

    auto reader = [&](int id) {
        // Multiple threads reading different elements - SAFE
        for (int i = 0; i < 1000; ++i) {
            std::string name = sensor_names[id % sensor_names.size()];
            // Process sensor name...
        }
    };

    std::thread t1(reader, 0);
    std::thread t2(reader, 1);
    std::thread t3(reader, 2);

    t1.join();
    t2.join();
    t3.join();

    std::cout << "Concurrent reads completed safely\n";
}

int main() {
    safe_concurrent_reads();
    return 0;
}
```

**Key points:**
- Container is `const` qualified
- Multiple threads read simultaneously
- No writes, no data races
- Standard guarantees thread safety for this pattern

---

#### Example 2: Unsafe Concurrent Writes (Data Race)

```cpp
#include <iostream>
#include <vector>
#include <thread>

// ❌ UNSAFE: Concurrent writes cause data race
void unsafe_concurrent_writes() {
    std::vector<int> sensor_readings;  // Non-const, shared

    auto writer = [&](int id) {
        for (int i = 0; i < 100; ++i) {
            sensor_readings.push_back(id * 1000 + i);  // ❌ DATA RACE!
        }
    };

    std::thread t1(writer, 1);
    std::thread t2(writer, 2);

    t1.join();
    t2.join();

    // Undefined behavior occurred during concurrent push_back
    // Possible outcomes:
    // - Size is less than 200 (lost writes)
    // - Crash during reallocation
    // - Memory corruption
    std::cout << "Vector size: " << sensor_readings.size() << " (expected 200)\n";
}

int main() {
    unsafe_concurrent_writes();  // ⚠️ Will likely crash or give wrong results
    return 0;
}
```

**Failure modes:**
1. **Lost writes**: Both threads read same size, increment, write back → one write lost
2. **Reallocation race**: T1 starts realloc, T2 writes to old buffer → write lost or corruption
3. **Crash**: T1 frees old buffer, T2 still writing to it → segfault

---

#### Example 3: Safe Concurrent Writes with Mutex

```cpp
#include <iostream>
#include <vector>
#include <thread>
#include <mutex>

// ✅ SAFE: Mutex protects concurrent writes
void safe_concurrent_writes_with_mutex() {
    std::vector<int> sensor_readings;
    std::mutex mtx;

    auto writer = [&](int id) {
        for (int i = 0; i < 100; ++i) {
            std::lock_guard<std::mutex> lock(mtx);  // ✅ Exclusive access
            sensor_readings.push_back(id * 1000 + i);
        }
    };

    std::thread t1(writer, 1);
    std::thread t2(writer, 2);

    t1.join();
    t2.join();

    std::cout << "Vector size: " << sensor_readings.size() << " (expected 200)\n";
    // Always prints 200 - no data race
}

int main() {
    safe_concurrent_writes_with_mutex();
    return 0;
}
```

**Performance consideration:**
Locking on every `push_back` is expensive. Better approach: each thread writes to local vector, then merge:

```cpp
void optimized_concurrent_writes() {
    std::vector<int> sensor_readings;
    std::mutex mtx;

    auto writer = [&](int id) {
        std::vector<int> local_buffer;  // Thread-local
        local_buffer.reserve(100);

        for (int i = 0; i < 100; ++i) {
            local_buffer.push_back(id * 1000 + i);  // No locking needed
        }

        // Single lock for batch insert
        std::lock_guard<std::mutex> lock(mtx);
        sensor_readings.insert(sensor_readings.end(),
                              local_buffer.begin(),
                              local_buffer.end());
    };

    std::thread t1(writer, 1);
    std::thread t2(writer, 2);

    t1.join();
    t2.join();

    std::cout << "Vector size: " << sensor_readings.size() << "\n";
}
```

---

#### Example 4: Reader-Writer Lock for Read-Heavy Workloads

```cpp
#include <iostream>
#include <map>
#include <thread>
#include <shared_mutex>
#include <vector>
#include <chrono>

using namespace std::chrono_literals;

// ✅ SAFE: shared_mutex allows multiple readers, exclusive writer
class SensorDatabase {
private:
    std::map<int, std::string> sensors;
    mutable std::shared_mutex mtx;  // mutable for const member functions

public:
    // Writer: Exclusive lock
    void add_sensor(int id, const std::string& name) {
        std::unique_lock lock(mtx);  // Exclusive lock
        sensors[id] = name;
        std::cout << "Added sensor: " << id << "\n";
    }

    // Reader: Shared lock (multiple readers allowed)
    std::string get_sensor(int id) const {
        std::shared_lock lock(mtx);  // Shared lock
        auto it = sensors.find(id);
        return (it != sensors.end()) ? it->second : "NOT_FOUND";
    }

    // Reader: Shared lock
    size_t count() const {
        std::shared_lock lock(mtx);
        return sensors.size();
    }
};

void demonstrate_reader_writer() {
    SensorDatabase db;

    // Writer thread: Adds sensors periodically
    std::thread writer([&]() {
        for (int i = 1; i <= 5; ++i) {
            db.add_sensor(i, "Sensor_" + std::to_string(i));
            std::this_thread::sleep_for(100ms);
        }
    });

    // Multiple reader threads: Query concurrently
    auto reader = [&](int id) {
        for (int i = 0; i < 20; ++i) {
            std::string name = db.get_sensor(id);
            // Multiple readers can execute simultaneously
            std::this_thread::sleep_for(10ms);
        }
    };

    std::vector<std::thread> readers;
    for (int i = 0; i < 5; ++i) {
        readers.emplace_back(reader, i % 5 + 1);
    }

    writer.join();
    for (auto& t : readers) t.join();

    std::cout << "Final count: " << db.count() << "\n";
}

int main() {
    demonstrate_reader_writer();
    return 0;
}
```

**When to use shared_mutex:**
- Read-heavy workloads (10:1 or higher read:write ratio)
- Readers acquire shared lock (multiple allowed simultaneously)
- Writers acquire unique lock (exclusive access)
- Autonomous driving: Sensor configuration database (frequent reads, rare updates)

---

#### Example 5: std::unordered_map Rehashing Pitfall

```cpp
#include <iostream>
#include <unordered_map>
#include <thread>
#include <vector>
#include <string>

// ❌ DANGEROUS: Rehashing invalidates iterators across threads
void demonstrate_rehashing_danger() {
    std::unordered_map<int, std::string> map;
    // No reserve() - rehashing will occur!

    // Thread 1: Inserts elements (may trigger rehashing)
    std::thread writer([&]() {
        for (int i = 0; i < 100; ++i) {
            map[i] = "data_" + std::to_string(i);
            // Rehashing may occur when load factor exceeds 1.0
        }
    });

    // Thread 2: Iterates over map
    std::thread reader([&]() {
        std::this_thread::sleep_for(std::chrono::milliseconds(10));
        for (const auto& pair : map) {
            // ❌ If writer triggers rehashing during iteration:
            // - Iterator invalidated
            // - Undefined behavior (crash, infinite loop, corruption)
            std::cout << pair.first << ": " << pair.second << "\n";
        }
    });

    writer.join();
    reader.join();
}

// ✅ SAFE: Reserve prevents rehashing
void demonstrate_rehashing_prevention() {
    std::unordered_map<int, std::string> map;
    map.reserve(200);  // Pre-allocate for 200 elements

    std::mutex mtx;

    auto writer = [&](int start) {
        for (int i = start; i < start + 50; ++i) {
            std::lock_guard lock(mtx);
            map[i] = "data_" + std::to_string(i);
            // No rehashing - capacity pre-allocated
        }
    };

    std::thread t1(writer, 0);
    std::thread t2(writer, 50);

    t1.join();
    t2.join();

    std::cout << "Map size: " << map.size() << ", bucket count: "
              << map.bucket_count() << "\n";
}

int main() {
    // demonstrate_rehashing_danger();  // ⚠️ Likely crashes
    demonstrate_rehashing_prevention();  // ✅ Safe
    return 0;
}
```

**Key lesson:**
- **Always** call `reserve()` on `unordered_map` before concurrent access
- Calculate expected size upfront
- Over-allocate to be safe (e.g., reserve 150% of expected size)

---

#### Example 6: Comparing std::map vs std::unordered_map Thread Safety

```cpp
#include <iostream>
#include <map>
#include <unordered_map>
#include <thread>
#include <mutex>
#include <chrono>

using namespace std::chrono_literals;

// Demonstrate why unordered_map is more dangerous
void compare_map_vs_unordered_map() {
    std::map<int, int> tree_map;
    std::unordered_map<int, int> hash_map;
    hash_map.reserve(1000);  // Still need to reserve!

    std::mutex tree_mtx, hash_mtx;

    // Insert into std::map
    auto insert_map = [&]() {
        auto start = std::chrono::high_resolution_clock::now();
        for (int i = 0; i < 1000; ++i) {
            std::lock_guard lock(tree_mtx);
            tree_map[i] = i * 2;
        }
        auto end = std::chrono::high_resolution_clock::now();
        auto duration = std::chrono::duration_cast<std::chrono::microseconds>(end - start);
        std::cout << "map insertion: " << duration.count() << " μs\n";
    };

    // Insert into std::unordered_map
    auto insert_unordered = [&]() {
        auto start = std::chrono::high_resolution_clock::now();
        for (int i = 0; i < 1000; ++i) {
            std::lock_guard lock(hash_mtx);
            hash_map[i] = i * 2;
        }
        auto end = std::chrono::high_resolution_clock::now();
        auto duration = std::chrono::duration_cast<std::chrono::microseconds>(end - start);
        std::cout << "unordered_map insertion: " << duration.count() << " μs\n";
    };

    std::thread t1(insert_map);
    std::thread t2(insert_unordered);

    t1.join();
    t2.join();

    std::cout << "\n✅ Both completed safely with proper synchronization\n";
    std::cout << "map size: " << tree_map.size() << "\n";
    std::cout << "unordered_map size: " << hash_map.size() << "\n";
}

int main() {
    compare_map_vs_unordered_map();
    return 0;
}
```

**Analysis:**
- `std::map`: O(log n) insertion, but localized tree rebalancing
- `std::unordered_map`: O(1) average insertion, but global rehashing risk
- For thread safety: **both require synchronization**, but unordered_map needs `reserve()`

---

#### Example 7: Thread-Safe Wrapper Class (Production Pattern)

```cpp
#include <iostream>
#include <unordered_map>
#include <shared_mutex>
#include <optional>
#include <string>

// ✅ Production-quality thread-safe map wrapper
template<typename Key, typename Value>
class ThreadSafeMap {
private:
    std::unordered_map<Key, Value> map;
    mutable std::shared_mutex mtx;

public:
    // Constructor with capacity hint
    explicit ThreadSafeMap(size_t reserve_size = 100) {
        map.reserve(reserve_size);
    }

    // Thread-safe insert
    void insert(const Key& key, const Value& value) {
        std::unique_lock lock(mtx);
        map[key] = value;
    }

    // Thread-safe find (returns optional)
    std::optional<Value> find(const Key& key) const {
        std::shared_lock lock(mtx);
        auto it = map.find(key);
        if (it != map.end()) {
            return it->second;
        }
        return std::nullopt;
    }

    // Thread-safe contains
    bool contains(const Key& key) const {
        std::shared_lock lock(mtx);
        return map.find(key) != map.end();
    }

    // Thread-safe size
    size_t size() const {
        std::shared_lock lock(mtx);
        return map.size();
    }

    // Thread-safe erase
    bool erase(const Key& key) {
        std::unique_lock lock(mtx);
        return map.erase(key) > 0;
    }

    // Thread-safe clear
    void clear() {
        std::unique_lock lock(mtx);
        map.clear();
    }

    // Apply function to all elements (reader)
    template<typename Func>
    void for_each(Func func) const {
        std::shared_lock lock(mtx);
        for (const auto& pair : map) {
            func(pair.first, pair.second);
        }
    }
};

// Example: Sensor name registry for autonomous vehicle
void autonomous_vehicle_sensor_registry() {
    ThreadSafeMap<int, std::string> sensor_registry(50);

    // Writer thread: Registers sensors
    std::thread registration([&]() {
        sensor_registry.insert(1, "Camera_Front");
        sensor_registry.insert(2, "LiDAR_Top");
        sensor_registry.insert(3, "Radar_Front_Left");
        sensor_registry.insert(4, "GPS");
        sensor_registry.insert(5, "IMU");
        std::cout << "Registered 5 sensors\n";
    });

    // Reader thread: Queries sensors
    std::thread query([&]() {
        std::this_thread::sleep_for(std::chrono::milliseconds(10));

        auto camera = sensor_registry.find(1);
        if (camera) {
            std::cout << "Found sensor 1: " << *camera << "\n";
        }

        std::cout << "Total sensors: " << sensor_registry.size() << "\n";

        sensor_registry.for_each([](int id, const std::string& name) {
            std::cout << "  ID " << id << ": " << name << "\n";
        });
    });

    registration.join();
    query.join();
}

int main() {
    autonomous_vehicle_sensor_registry();
    return 0;
}
```

**Design patterns:**
- RAII-style locking (automatic unlock)
- Reader-writer lock for read-heavy workloads
- `std::optional` for find (avoids throwing exceptions)
- Template for reusability
- Reserve in constructor to prevent rehashing

---

#### Example 8: Autonomous Vehicle - Sensor Data Aggregation

```cpp
#include <iostream>
#include <vector>
#include <thread>
#include <mutex>
#include <map>
#include <string>
#include <chrono>

struct SensorReading {
    int sensor_id;
    double value;
    std::chrono::system_clock::time_point timestamp;
};

// ✅ Thread-safe sensor data aggregator
class SensorDataAggregator {
private:
    std::map<int, std::vector<SensorReading>> readings_by_sensor;
    std::mutex mtx;

public:
    void add_reading(const SensorReading& reading) {
        std::lock_guard lock(mtx);
        readings_by_sensor[reading.sensor_id].push_back(reading);
    }

    std::vector<SensorReading> get_readings(int sensor_id) const {
        std::lock_guard lock(mtx);
        auto it = readings_by_sensor.find(sensor_id);
        if (it != readings_by_sensor.end()) {
            return it->second;  // Copy returned
        }
        return {};
    }

    void print_summary() const {
        std::lock_guard lock(mtx);
        std::cout << "=== Sensor Data Summary ===\n";
        for (const auto& [sensor_id, readings] : readings_by_sensor) {
            std::cout << "Sensor " << sensor_id << ": "
                      << readings.size() << " readings\n";
        }
    }
};

void simulate_autonomous_vehicle_sensors() {
    SensorDataAggregator aggregator;

    // Camera thread: 30 Hz
    std::thread camera([&]() {
        for (int i = 0; i < 30; ++i) {
            SensorReading reading{
                1,  // camera sensor_id
                static_cast<double>(i),
                std::chrono::system_clock::now()
            };
            aggregator.add_reading(reading);
            std::this_thread::sleep_for(std::chrono::milliseconds(33));  // ~30 Hz
        }
    });

    // LiDAR thread: 10 Hz
    std::thread lidar([&]() {
        for (int i = 0; i < 10; ++i) {
            SensorReading reading{
                2,  // lidar sensor_id
                static_cast<double>(i * 10),
                std::chrono::system_clock::now()
            };
            aggregator.add_reading(reading);
            std::this_thread::sleep_for(std::chrono::milliseconds(100));  // 10 Hz
        }
    });

    // Radar thread: 20 Hz
    std::thread radar([&]() {
        for (int i = 0; i < 20; ++i) {
            SensorReading reading{
                3,  // radar sensor_id
                static_cast<double>(i * 5),
                std::chrono::system_clock::now()
            };
            aggregator.add_reading(reading);
            std::this_thread::sleep_for(std::chrono::milliseconds(50));  // 20 Hz
        }
    });

    camera.join();
    lidar.join();
    radar.join();

    aggregator.print_summary();

    // Query specific sensor
    auto camera_readings = aggregator.get_readings(1);
    std::cout << "\nCamera readings count: " << camera_readings.size() << "\n";
}

int main() {
    simulate_autonomous_vehicle_sensors();
    return 0;
}
```

**Real-world insights:**
- Multiple sensor threads producing data at different rates
- Central aggregator with mutex-protected map
- Each sensor_id maps to vector of readings
- Thread-safe add and query operations
- Pattern used in perception pipelines for sensor fusion

---

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

### PRACTICE_TASKS: Output Prediction and Code Analysis

#### Task 1
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

// What are the possible outputs? Is this code safe?
```

#### Task 2
```cpp
const std::map<int, std::string> config = {{1, "one"}, {2, "two"}};

void thread1() {
    std::string val = config[1];  // Compilation error?
    std::cout << val;
}

// Does this compile? Why or why not?
```

#### Task 3
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

// What can go wrong in this code?
```

#### Task 4
```cpp
std::vector<bool> flags(10);

void thread1() { flags[0] = true; }
void thread2() { flags[1] = true; }

// Is this safe? Why or why not?
```

#### Task 5
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

// What could happen when thread1 dereferences the iterator?
```

#### Task 6
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

// Is this safe because we called reserve(100)?
```

#### Task 7
```cpp
const std::vector<int> vec = {1, 2, 3, 4, 5};

void reader1() { int x = vec[0]; }
void reader2() { int y = vec[1]; }
void reader3() { int z = vec[2]; }

// Can all three threads run concurrently without synchronization?
```

#### Task 8
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

// Is this implementation thread-safe? Any improvements possible?
```

#### Task 9
```cpp
std::vector<int> results;

void compute_worker(int start, int end) {
    for (int i = start; i < end; ++i) {
        results.push_back(i * i);  // No lock
    }
}

// Multiple threads call compute_worker concurrently
// What's the problem?
```

#### Task 10
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

// Can this cause undefined behavior? Explain.
```

---

### QUICK_REFERENCE: Answer Key and Summary Tables

#### Answer Key for Practice Tasks

| Task | Answer | Explanation | Key Concept |
|------|--------|-------------|-------------|
| 1 | Output: 4 or 5 (or crash). Not safe. | Concurrent `push_back` is data race: lost writes, wrong size, or crash during reallocation. Need mutex. | #data_race #concurrent_writes |
| 2 | Compilation error | `operator[]` is non-const (inserts if key missing). Use `at()` or `find()` for const access. | #const_correctness #operator_overload |
| 3 | Crash, infinite loop, or wrong output | thread1 insertions may trigger rehashing while thread2 iterates, invalidating iterator. Need synchronization. | #rehashing #iterator_invalidation |
| 4 | Not safe - data race | `vector<bool>` packs bits. flags[0] and flags[1] share same byte → race on read-modify-write. Use `vector<char>`. | #vector_bool #false_sharing |
| 5 | Crash or garbage | thread2's `push_back` may reallocate vector, invalidating thread1's iterator. Iterator becomes dangling pointer. | #iterator_invalidation #reallocation |
| 6 | Not safe | reserve(100) doesn't prevent thread2 from exceeding capacity, triggering rehashing. Both threads need synchronization. | #reserve #concurrent_writes |
| 7 | Yes, safe | C++11 guarantees concurrent reads on const containers are thread-safe. No writes, no data race. | #concurrent_reads #standard_guarantee |
| 8 | Thread-safe but suboptimal | Works correctly with mutex. Improvement: use `shared_mutex` with shared_lock for `find()` (read-heavy optimization). | #mutex #shared_mutex #optimization |
| 9 | Data race on `push_back` | Multiple threads modify `results` concurrently without synchronization → lost writes, wrong size, or crash. Need mutex or thread-local vectors. | #data_race #concurrent_modification |
| 10 | Yes, undefined behavior | Concurrent write (thread1) and read (thread2) without synchronization is data race, even if accessing different keys (map internal structure modified). | #data_race #concurrent_read_write |

---

#### STL Container Thread Safety Summary

| Container | Concurrent Reads (const) | Concurrent Writes | Concurrent Read+Write | Notes |
|-----------|-------------------------|-------------------|----------------------|-------|
| `std::vector` | ✅ Safe | ❌ Unsafe | ❌ Unsafe | Reallocation invalidates all iterators |
| `std::map` | ✅ Safe | ❌ Unsafe | ❌ Unsafe | Tree rebalancing is localized |
| `std::unordered_map` | ✅ Safe | ❌ Unsafe | ❌ Unsafe | Rehashing invalidates ALL iterators |
| `std::list` | ✅ Safe | ❌ Unsafe | ❌ Unsafe | Insertion doesn't invalidate other iterators (single-thread) |
| `std::deque` | ✅ Safe | ❌ Unsafe | ❌ Unsafe | Reallocation invalidates all iterators |
| `std::set` | ✅ Safe | ❌ Unsafe | ❌ Unsafe | Similar to map (tree-based) |
| `std::unordered_set` | ✅ Safe | ❌ Unsafe | ❌ Unsafe | Similar to unordered_map (rehashing) |
| `std::vector<bool>` | ❌ Unsafe for separate elements | ❌ Unsafe | ❌ Unsafe | Bit-packing causes false sharing |

---

#### Common Thread Safety Patterns

| Pattern | Use Case | Pros | Cons |
|---------|----------|------|------|
| Global mutex | Simple, infrequent access | Easy to implement, correct | High contention, serializes all access |
| Reader-writer lock (`shared_mutex`) | Read-heavy workloads (10:1+) | Concurrent reads, good throughput | Higher overhead than mutex for writes |
| Thread-local accumulation | Parallel computation → merge | Low contention, high throughput | Requires merge step, more memory |
| Fine-grained locking | Large containers, localized access | Lower contention, better scalability | Complex, risk of deadlocks |
| Lock-free structures (TBB, Folly) | High-performance, low-latency | No blocking, excellent scalability | Complex, requires expertise, ABA issues |
| Copy-on-access | Rare writes, frequent reads | Simple, no contention on reads | High memory usage, expensive copies |

---

#### Container-Specific Thread Safety Recommendations

| Scenario | Recommended Approach | Rationale |
|----------|---------------------|-----------|
| Frequent reads, rare writes | `shared_mutex` with `shared_lock` for reads | Allows concurrent reads without contention |
| Write-heavy workload | Thread-local containers + periodic merge | Minimizes lock contention |
| Concurrent indexed writes | `resize()` container, write to disjoint indices | No synchronization needed if indices don't overlap |
| Hash table with unknown size | `unordered_map` with `reserve(2x expected)` + mutex | Prevents rehashing, protects concurrent access |
| Iteration during modification | Copy container for iteration OR lock entire iteration | Prevents iterator invalidation |
| High-performance concurrent access | Intel TBB `concurrent_hash_map` or Folly | Optimized for concurrency with fine-grained locking |
| Real-time system | Pre-allocate all containers (`reserve`), avoid runtime allocation | Prevents reallocation and ensures deterministic timing |

---

#### Iterator Invalidation Rules (Single-Threaded, for reference)

| Container | Insert | Erase | Notes |
|-----------|--------|-------|-------|
| `vector` | All if realloc, else after insert point | After erase point | Reallocation invalidates everything |
| `deque` | All | All if not end | Special case: inserting/erasing at ends may not invalidate |
| `list` | None | Only erased elements | Stable iterators |
| `map/set` | None | Only erased elements | Tree-based, stable iterators |
| `unordered_map/set` | All if rehash, else none | Only erased elements | Rehashing invalidates all |

**Multithreading implication:** These rules assume single-threaded access. In multithreaded contexts, **any modification** makes all concurrent access (even reads) unsafe without synchronization.

---

#### C++ Standard Guarantees (§23.2.2)

1. **Concurrent reads on const-qualified containers**: ✅ Safe (C++11+)
2. **Concurrent writes to different containers**: ✅ Safe
3. **Concurrent writes to same container**: ❌ Data race (requires synchronization)
4. **Concurrent read (non-const) + write to same container**: ❌ Data race (requires synchronization)

**Key insight:** The standard only guarantees thread safety for const-qualified reads. Everything else requires explicit synchronization.

---

#### Autonomous Vehicle Example Patterns

| Component | Access Pattern | Solution |
|-----------|---------------|----------|
| Sensor configuration | Read every frame (100Hz), update rarely (1Hz) | `shared_mutex`: shared_lock for reads, unique_lock for updates |
| Point cloud aggregation | Multiple sensors write concurrently | Thread-local vectors per sensor + batch merge with mutex |
| Map data | Read by all modules, updated periodically | `shared_mutex` or copy-on-write with atomic pointer swap |
| Obstacle list | Written by perception, read by planning/control | Double-buffering: perception writes to back buffer, readers use front buffer, swap atomically |
| Telemetry counters | High-frequency updates from all modules | Atomic counters OR thread-local counters + periodic aggregation |

---

**End of Topic: STL Container Thread Safety**

This comprehensive guide covers the critical thread safety rules for C++ standard containers, essential for writing correct multithreaded code in high-performance domains like autonomous driving. Understanding concurrent access patterns, iterator invalidation, and container-specific behaviors (especially `unordered_map` rehashing) is crucial for avoiding data races and building robust concurrent systems.
