## TOPIC: STL-like Custom Vector Implementation

### THEORY_SECTION: Understanding Custom Vector Implementation

The **Custom Vector** (or STL-like Dynamic Array) is a fundamental container implementation that demonstrates core C++ concepts: RAII, dynamic memory management, move semantics, iterators, and exception safety. While not a "design pattern" in the traditional sense (like Singleton or Factory), implementing a custom `Vector<T>` class is a critical exercise in understanding how STL containers work internally and mastering C++'s memory model.

#### What is a Custom Vector?

A **Custom Vector** is a template class that mimics `std::vector<T>`, providing:
- **Dynamic array behavior**: Automatic growth when capacity is exceeded
- **RAII semantics**: Automatic memory management via constructor/destructor
- **Value semantics**: Proper copy and move constructors/assignments
- **Iterator support**: Range-for loop compatibility and STL algorithm integration
- **Exception safety**: Strong guarantees via copy-and-swap idiom

Key components of a Vector implementation:
```cpp
template <typename T>
class Vector {
    T* data;              // Pointer to heap-allocated array
    std::size_t size;     // Current number of elements
    std::size_t capacity; // Total allocated space
};
```

#### Why Custom Vector Matters in Autonomous Driving

In autonomous vehicle software, understanding dynamic containers is crucial for:
1. **LiDAR point cloud buffers**: Storing variable-sized sensor data (100K-2M points per frame)
2. **Object detection results**: Dynamic lists of detected vehicles, pedestrians, traffic signs
3. **Path planning waypoints**: Variable-length trajectory representations
4. **Memory optimization**: Understanding when to use `reserve()` vs `resize()` for real-time performance
5. **Exception safety**: Ensuring sensor data structures remain valid even when memory allocation fails

Performance considerations:
- **Reallocation cost**: Growing from capacity N to 2N requires O(N) copying
- **Amortized O(1) insertion**: Doubling strategy ensures push_back averages constant time
- **Memory overhead**: Typical capacity is 1.5x-2x actual size
- **Cache locality**: Contiguous storage (unlike `std::list`) for better CPU cache performance

#### Vector vs Array vs List

| Feature | Custom Vector | std::array | std::list |
|---------|--------------|------------|-----------|
| Size | Dynamic | Fixed at compile-time | Dynamic |
| Memory | Contiguous | Contiguous | Non-contiguous (nodes) |
| Reallocation | Yes (when capacity exceeded) | Never | Never |
| Random Access | O(1) | O(1) | O(N) |
| Insertion at end | O(1) amortized | N/A (fixed size) | O(1) |
| Memory locality | Excellent | Excellent | Poor |
| Iterator invalidation | On reallocation | Never | Only deleted elements |
| Use case | Variable-size data | Fixed-size data | Frequent insertion/deletion |

Real-world example from autonomous driving:
```cpp
// LiDAR point cloud processor
class LidarProcessor {
    Vector<Point3D> point_cloud;  // Dynamic size (varies by frame)

    void processFrame(const LidarData& data) {
        point_cloud.clear();
        point_cloud.reserve(data.expected_points);  // Avoid reallocations

        for (const auto& raw_point : data) {
            Point3D processed = preprocess(raw_point);
            point_cloud.push_back(std::move(processed));  // Move semantics
        }

        // point_cloud now contains 100K-2M points in contiguous memory
        // Excellent cache locality for subsequent algorithms
    }
};
```

---

### EDGE_CASES: Tricky Scenarios and Gotchas

#### Edge Case 1: Iterator Invalidation on Reallocation

When `Vector` reallocates (during `push_back`, `reserve`, `resize`), all existing iterators, pointers, and references to elements become **invalid**. This is a common source of bugs.

```cpp
Vector<int> v = {1, 2, 3};
v.reserve(10);  // capacity = 10, no reallocation yet

int* ptr = &v[1];  // ptr points to element at index 1
auto it = v.begin() + 1;

v.push_back(4);  // No reallocation (capacity sufficient)
std::cout << *ptr;  // ✅ OK: ptr still valid

// Now exceed capacity
for (int i = 5; i < 15; ++i) {
    v.push_back(i);  // ❌ Reallocation happens at i=11
}

// After reallocation:
std::cout << *ptr;  // ❌ UNDEFINED BEHAVIOR: ptr points to freed memory
std::cout << *it;   // ❌ UNDEFINED BEHAVIOR: iterator invalidated
```

**Why it happens**: Reallocation involves:
1. Allocate new larger buffer (`new T[new_capacity]`)
2. Copy/move elements from old buffer to new buffer
3. Delete old buffer (`delete[] old_data`)
4. All pointers to old buffer now point to freed memory

**Real-world autonomous vehicle impact**:
```cpp
// ❌ BUG: Processing point cloud with invalidated iterators
void processLidar(Vector<Point3D>& cloud) {
    auto it = cloud.begin();

    for (size_t i = 0; i < cloud.size(); ++i) {
        if (needsFiltering(cloud[i])) {
            cloud.push_back(interpolate(cloud[i]));  // May reallocate!
            // 'it' is now invalid if reallocation occurred
        }
        ++it;  // ❌ CRASH: dereferencing invalidated iterator
    }
}

// ✅ FIX: Reserve capacity or use index-based access
void processLidarSafe(Vector<Point3D>& cloud) {
    size_t original_size = cloud.size();
    cloud.reserve(original_size * 2);  // Prevent reallocation

    for (size_t i = 0; i < original_size; ++i) {
        if (needsFiltering(cloud[i])) {
            cloud.push_back(interpolate(cloud[i]));  // No reallocation
        }
    }
}
```

**Key takeaway**: Always call `reserve()` before a loop that may insert elements, or use index-based access instead of iterators.

---

#### Edge Case 2: Copy Assignment Exception Safety (Basic Guarantee vs Strong Guarantee)

A naive copy assignment operator can leave the object in a **broken state** if an exception is thrown during copying:

```cpp
// ❌ UNSAFE: Basic exception guarantee (broken state possible)
Vector<T>& operator=(const Vector<T>& other) {
    if (this != &other) {
        delete[] data;  // Delete old data first
        size = other.size;
        capacity = other.capacity;
        data = new T[capacity];  // ✅ May throw (allocation failure)

        for (size_t i = 0; i < size; ++i) {
            data[i] = other.data[i];  // ❌ May throw (T's copy throws)
        }
    }
    return *this;
}

// Problem scenario:
struct ExpensiveObject {
    ExpensiveObject(const ExpensiveObject& other) {
        if (rand() % 10 == 0) throw std::runtime_error("copy failed");
        // ... copying logic ...
    }
};

Vector<ExpensiveObject> v1 = {obj1, obj2, obj3};
Vector<ExpensiveObject> v2 = {obj4, obj5};

v1 = v2;  // ❌ If copy throws at i=2:
          //    - v1.data is deleted (old data gone)
          //    - new allocation succeeded
          //    - first 2 elements copied
          //    - exception thrown at element 3
          //    - v1 now has partially-copied data (BROKEN STATE!)
          //    - v1.size=3 but only 2 elements valid
```

**Strong exception guarantee solution** (copy-and-swap idiom):

```cpp
// ✅ SAFE: Strong exception guarantee (all-or-nothing)
Vector<T>& operator=(const Vector<T>& other) {
    if (this != &other) {
        Vector<T> temp(other);  // ✅ May throw, but *this unchanged
        swap(temp);             // ❌ Won't throw (just pointer swaps)
    }
    return *this;
}
// When temp goes out of scope, destructor cleans up old data

void swap(Vector<T>& other) noexcept {
    std::swap(data, other.data);
    std::swap(size, other.size);
    std::swap(capacity, other.capacity);
}
```

**Why this is better**:
1. `Vector<T> temp(other)` does all risky operations (allocation, copying)
2. If temp construction throws → `*this` remains **unchanged** (strong guarantee)
3. If temp construction succeeds → `swap()` just exchanges pointers (noexcept)
4. temp's destructor cleans up old data

**Key takeaway**: Use copy-and-swap idiom for assignment operators to achieve strong exception safety.

---

#### Edge Case 3: Return-by-Reference vs Return-by-Value for Iterators

A common mistake when implementing `begin()` and `end()` is returning references to **local variables**:

```cpp
// ❌ BUG: Returning reference to local variable
Iterator begin() {
    Iterator it(data);  // 'it' is a local variable on the stack
    return it;          // ❌ Returns by value (correct!)
}

// ❌ CRITICAL BUG: Returning reference to local
Iterator& begin() {
    Iterator it(data);  // 'it' is destroyed when function returns
    return it;          // ❌ UNDEFINED BEHAVIOR: dangling reference!
}

// Usage:
Vector<int> v = {1, 2, 3};
auto it = v.begin();  // ❌ 'it' refers to destroyed local variable
std::cout << *it;     // ❌ CRASH or garbage value
```

**Correct implementation** (return by value):

```cpp
// ✅ Correct: Return by value
Iterator begin() { return Iterator(data); }
Iterator end()   { return Iterator(data + size); }

Const_Iterator cbegin() const { return Const_Iterator(data); }
Const_Iterator cend()   const { return Const_Iterator(data + size); }

// Iterator is lightweight (just a pointer wrapper), so returning by value is fine
class Iterator {
    T* ptr;  // 8 bytes on 64-bit systems
public:
    Iterator(T* p) : ptr(p) {}
    // Cheap to copy
};
```

**Why return by value is correct**:
- Iterators are lightweight (typically just a pointer)
- Returning by value creates a copy, avoiding dangling references
- RVO (Return Value Optimization) often eliminates the copy anyway
- Local variable `it` is destroyed, but the **returned copy** is valid

**Key takeaway**: Always return iterators by value, never by reference to locals.

---

#### Edge Case 4: Move Constructor and Moved-From State

After move construction/assignment, the **moved-from object** must remain in a **valid but unspecified state**:

```cpp
// ✅ Correct move constructor
Vector(Vector<T>&& other) noexcept
    : data(nullptr), size(0), capacity(0)
{
    swap(other);  // Exchange internals
}

// After move:
Vector<int> v1 = {1, 2, 3};
Vector<int> v2 = std::move(v1);

// v1 is now in "moved-from" state:
// - v1.data = nullptr
// - v1.size = 0
// - v1.capacity = 0
// ✅ v1 can still be destroyed safely (destructor handles nullptr)
// ✅ v1 can be reassigned: v1 = {4, 5, 6};
// ❌ v1[0] is undefined behavior (size is 0)
```

**Common bug: Not resetting moved-from object**:

```cpp
// ❌ BUG: Moved-from object not in valid state
Vector(Vector<T>&& other) noexcept {
    data = other.data;
    size = other.size;
    capacity = other.capacity;
    // ❌ Forgot to reset other.data to nullptr!
}

// Destructor of moved-from object:
~Vector() {
    delete[] data;  // ❌ DOUBLE DELETE! Both objects delete same memory
}
```

**Correct implementation**:

```cpp
// ✅ Using swap (automatic reset)
Vector(Vector<T>&& other) noexcept
    : data(nullptr), size(0), capacity(0)
{
    swap(other);  // other gets nullptr, 0, 0
}

// ✅ Manual reset
Vector(Vector<T>&& other) noexcept
    : data(other.data), size(other.size), capacity(other.capacity)
{
    other.data = nullptr;
    other.size = 0;
    other.capacity = 0;
}
```

**Real-world implication** (autonomous driving):
```cpp
// Sensor data processing with move semantics
Vector<Point3D> processLidar(Vector<Point3D> raw_cloud) {
    Vector<Point3D> filtered;
    filtered.reserve(raw_cloud.size());

    for (const auto& pt : raw_cloud) {
        if (isValid(pt)) filtered.push_back(pt);
    }

    return filtered;  // Move semantics (RVO or move constructor)
}

// Usage:
Vector<Point3D> cloud = getLidarData();
Vector<Point3D> processed = processLidar(std::move(cloud));
// 'cloud' is moved-from but still valid (can be reassigned or destroyed)
```

**Key takeaway**: Always reset moved-from objects to a valid state (nullptr for pointers, 0 for sizes).

---

#### Edge Case 5: Reserve vs Resize Semantics

Confusing `reserve()` and `resize()` leads to bugs because they have **different effects** on size:

```cpp
Vector<int> v;

// reserve(): Changes capacity, NOT size
v.reserve(100);
std::cout << v.size();      // 0 (no elements constructed)
std::cout << v.capacity();  // 100 (space allocated)
v[50] = 42;  // ❌ UNDEFINED BEHAVIOR: index out of bounds (size is 0!)

// resize(): Changes size (constructs/destructs elements)
v.resize(100);
std::cout << v.size();      // 100 (elements default-constructed)
std::cout << v.capacity();  // ≥100 (at least 100)
v[50] = 42;  // ✅ OK: element exists
```

**reserve() behavior**:
```cpp
void reserve(size_t new_cap) {
    if (new_cap <= capacity) return;  // No-op if sufficient

    T* new_data = new T[new_cap];  // Allocate larger buffer
    for (size_t i = 0; i < size; ++i) {
        new_data[i] = std::move(data[i]);  // Move existing elements
    }
    delete[] data;
    data = new_data;
    capacity = new_cap;
    // size UNCHANGED
}
```

**resize() behavior**:
```cpp
void resize(size_t new_size, const T& val = T{}) {
    if (new_size < size) {
        size = new_size;  // Shrink (no reallocation)
    } else if (new_size > size) {
        if (new_size > capacity) reserve(new_size);  // Grow capacity if needed
        for (size_t i = size; i < new_size; ++i) {
            data[i] = val;  // Default-construct new elements
        }
        size = new_size;
    }
}
```

**Real-world scenario** (autonomous driving):
```cpp
// Preallocating LiDAR point buffer
class LidarBuffer {
    Vector<Point3D> points;

    void prepareForFrame(size_t expected_point_count) {
        // ✅ Use reserve() to avoid reallocations during insertion
        points.clear();
        points.reserve(expected_point_count);
        // size = 0, capacity = expected_point_count
        // Ready for push_back() without reallocation
    }

    void initializeWithDefaults(size_t point_count) {
        // ✅ Use resize() to create default-constructed points
        points.resize(point_count);  // Creates point_count elements
        // size = point_count, all elements initialized to Point3D{}

        // Now can assign directly:
        for (size_t i = 0; i < point_count; ++i) {
            points[i] = readSensorData(i);
        }
    }
};
```

**Key takeaway**: Use `reserve()` to optimize insertion performance (avoid reallocations), use `resize()` to actually create elements.

---

### CODE_EXAMPLES: Practical Demonstrations

#### Example 1: Basic Vector Implementation (Easy Level)

```cpp
#include <iostream>
#include <cstddef>

// Minimal Vector implementation with dynamic growth
template <typename T>
class Vector {
private:
    T* data;
    std::size_t size;
    std::size_t capacity;

public:
    // Constructor
    Vector() : data(nullptr), size(0), capacity(0) {}

    // Destructor (RAII cleanup)
    ~Vector() {
        delete[] data;
    }

    // Copy constructor
    Vector(const Vector<T>& other)
        : data(new T[other.capacity]),
          size(other.size),
          capacity(other.capacity)
    {
        for (std::size_t i = 0; i < size; ++i) {
            data[i] = other.data[i];  // Deep copy
        }
    }

    // Copy assignment
    Vector<T>& operator=(const Vector<T>& other) {
        if (this != &other) {
            delete[] data;
            size = other.size;
            capacity = other.capacity;
            data = new T[capacity];
            for (std::size_t i = 0; i < size; ++i) {
                data[i] = other.data[i];
            }
        }
        return *this;
    }

    // Push back with automatic growth
    void push_back(const T& value) {
        if (size == capacity) {
            // Double capacity (or 1 if empty)
            std::size_t new_cap = (capacity == 0) ? 1 : capacity * 2;
            T* new_data = new T[new_cap];

            // Copy existing elements
            for (std::size_t i = 0; i < size; ++i) {
                new_data[i] = data[i];
            }

            delete[] data;
            data = new_data;
            capacity = new_cap;
        }
        data[size++] = value;
    }

    // Element access
    T& operator[](std::size_t index) { return data[index]; }
    const T& operator[](std::size_t index) const { return data[index]; }

    std::size_t get_size() const { return size; }
    std::size_t get_capacity() const { return capacity; }
    bool empty() const { return size == 0; }
};

// Usage example: Simple particle system
struct Particle {
    float x, y, vx, vy;
};

int main() {
    Vector<Particle> particles;

    // Add particles
    for (int i = 0; i < 5; ++i) {
        particles.push_back({float(i), float(i*2), 1.0f, -1.0f});
    }

    std::cout << "Particle count: " << particles.get_size() << "\n";
    std::cout << "Capacity: " << particles.get_capacity() << "\n";
    // Output: Particle count: 5, Capacity: 8 (doubled from 4)

    return 0;
}
```

This basic implementation demonstrates:
- RAII: Memory automatically freed in destructor
- Dynamic growth: Capacity doubles when full (amortized O(1) insertion)
- Deep copy: Copy constructor copies all elements
- No move semantics yet (covered in mid-level)

**Real-world usage**: Storing variable-sized sensor data frames where size is unknown at compile time.

---

#### Example 2: Vector with Reserve and Move Semantics (Mid Level)

```cpp
#include <iostream>
#include <utility>  // std::move, std::swap

template <typename T>
class Vector {
private:
    T* data;
    std::size_t size;
    std::size_t capacity;

public:
    Vector() : data(nullptr), size(0), capacity(0) {}

    ~Vector() { delete[] data; }

    // Copy constructor
    Vector(const Vector<T>& other)
        : data(nullptr), size(0), capacity(0)
    {
        reserve(other.size);
        for (std::size_t i = 0; i < other.size; ++i) {
            data[i] = other.data[i];
        }
        size = other.size;
    }

    // Move constructor (steal resources)
    Vector(Vector<T>&& other) noexcept
        : data(nullptr), size(0), capacity(0)
    {
        std::swap(data, other.data);
        std::swap(size, other.size);
        std::swap(capacity, other.capacity);
        // 'other' now has nullptr, 0, 0
    }

    // Copy assignment (copy-and-swap idiom)
    Vector<T>& operator=(const Vector<T>& other) {
        if (this != &other) {
            Vector<T> temp(other);  // May throw
            std::swap(data, temp.data);
            std::swap(size, temp.size);
            std::swap(capacity, temp.capacity);
            // temp destructor cleans up old data
        }
        return *this;
    }

    // Move assignment
    Vector<T>& operator=(Vector<T>&& other) noexcept {
        if (this != &other) {
            std::swap(data, other.data);
            std::swap(size, other.size);
            std::swap(capacity, other.capacity);
        }
        return *this;
    }

    // Reserve capacity (no size change)
    void reserve(std::size_t new_cap) {
        if (new_cap <= capacity) return;

        T* new_data = new T[new_cap];
        for (std::size_t i = 0; i < size; ++i) {
            new_data[i] = std::move(data[i]);  // Move semantics
        }
        delete[] data;
        data = new_data;
        capacity = new_cap;
    }

    // Resize (change size, construct/destruct elements)
    void resize(std::size_t new_size, const T& val = T{}) {
        if (new_size > capacity) reserve(new_size);

        if (new_size > size) {
            // Construct new elements
            for (std::size_t i = size; i < new_size; ++i) {
                data[i] = val;
            }
        }
        size = new_size;
    }

    // Push back with move overload
    void push_back(const T& value) {
        if (size == capacity) reserve(capacity == 0 ? 1 : capacity * 2);
        data[size++] = value;
    }

    void push_back(T&& value) {
        if (size == capacity) reserve(capacity == 0 ? 1 : capacity * 2);
        data[size++] = std::move(value);  // Move instead of copy
    }

    T& operator[](std::size_t index) { return data[index]; }
    const T& operator[](std::size_t index) const { return data[index]; }

    std::size_t get_size() const { return size; }
    std::size_t get_capacity() const { return capacity; }
    bool empty() const { return size == 0; }

    T& back() { return data[size - 1]; }
    void pop_back() { --size; }
};

// Autonomous driving: Camera frame buffer
struct CameraFrame {
    uint8_t* pixels;  // Large image data
    size_t width, height;

    CameraFrame() : pixels(nullptr), width(0), height(0) {}

    // Move constructor (avoid copying large pixel buffer)
    CameraFrame(CameraFrame&& other) noexcept
        : pixels(other.pixels), width(other.width), height(other.height)
    {
        other.pixels = nullptr;
    }

    ~CameraFrame() { delete[] pixels; }
};

int main() {
    Vector<CameraFrame> frame_buffer;

    // Reserve space to avoid reallocations
    frame_buffer.reserve(60);  // 60 fps buffer

    for (int i = 0; i < 60; ++i) {
        CameraFrame frame;
        frame.width = 1920;
        frame.height = 1080;
        frame.pixels = new uint8_t[1920 * 1080 * 3];  // RGB

        // Move frame into buffer (no copy of large pixel data)
        frame_buffer.push_back(std::move(frame));
    }

    std::cout << "Frames buffered: " << frame_buffer.get_size() << "\n";
    // Output: Frames buffered: 60 (no reallocations due to reserve)

    return 0;
}
```

This mid-level implementation adds:
- **Move semantics**: Efficient transfer of resources (no deep copy)
- **reserve()**: Preallocate capacity to avoid reallocations
- **resize()**: Change size, construct/destruct elements
- **Copy-and-swap idiom**: Exception-safe assignment
- **Move overload for push_back**: Optimize temporary insertion

**Performance benefit**: Moving a `CameraFrame` (3 pointer swaps) vs copying (copying 6MB pixel buffer).

---

#### Example 3: Vector with Iterators (Advanced Level)

```cpp
#include <iostream>
#include <iterator>  // std::iterator_traits
#include <algorithm> // std::sort

template <typename T>
class Vector {
private:
    T* data;
    std::size_t size;
    std::size_t capacity;

public:
    // ... constructors, destructor, etc. (same as before) ...

    Vector() : data(nullptr), size(0), capacity(0) {}
    ~Vector() { delete[] data; }

    // Iterator implementation
    class Iterator {
    private:
        T* ptr;
    public:
        // Iterator traits (required for STL compatibility)
        using difference_type = std::ptrdiff_t;
        using value_type = T;
        using pointer = T*;
        using reference = T&;
        using iterator_category = std::random_access_iterator_tag;

        explicit Iterator(T* p = nullptr) : ptr(p) {}

        // Dereference operators
        T& operator*() const { return *ptr; }
        T* operator->() const { return ptr; }

        // Increment/decrement
        Iterator& operator++() { ++ptr; return *this; }
        Iterator operator++(int) { Iterator tmp = *this; ++ptr; return tmp; }
        Iterator& operator--() { --ptr; return *this; }
        Iterator operator--(int) { Iterator tmp = *this; --ptr; return tmp; }

        // Arithmetic operators (random access)
        Iterator operator+(difference_type n) const { return Iterator(ptr + n); }
        Iterator operator-(difference_type n) const { return Iterator(ptr - n); }
        difference_type operator-(const Iterator& other) const { return ptr - other.ptr; }

        // Comparison operators
        bool operator==(const Iterator& other) const { return ptr == other.ptr; }
        bool operator!=(const Iterator& other) const { return ptr != other.ptr; }
        bool operator<(const Iterator& other) const { return ptr < other.ptr; }
        bool operator>(const Iterator& other) const { return ptr > other.ptr; }

        // Subscript operator
        T& operator[](difference_type n) const { return ptr[n]; }
    };

    // Const iterator
    class ConstIterator {
    private:
        const T* ptr;
    public:
        using difference_type = std::ptrdiff_t;
        using value_type = T;
        using pointer = const T*;
        using reference = const T&;
        using iterator_category = std::random_access_iterator_tag;

        explicit ConstIterator(const T* p = nullptr) : ptr(p) {}

        const T& operator*() const { return *ptr; }
        const T* operator->() const { return ptr; }

        ConstIterator& operator++() { ++ptr; return *this; }
        ConstIterator operator++(int) { ConstIterator tmp = *this; ++ptr; return tmp; }

        bool operator==(const ConstIterator& other) const { return ptr == other.ptr; }
        bool operator!=(const ConstIterator& other) const { return ptr != other.ptr; }
    };

    // Iterator access methods
    Iterator begin() { return Iterator(data); }
    Iterator end() { return Iterator(data + size); }

    ConstIterator begin() const { return ConstIterator(data); }
    ConstIterator end() const { return ConstIterator(data + size); }

    ConstIterator cbegin() const { return ConstIterator(data); }
    ConstIterator cend() const { return ConstIterator(data + size); }

    // ... other methods ...
    void push_back(const T& value) {
        if (size == capacity) {
            std::size_t new_cap = capacity == 0 ? 1 : capacity * 2;
            T* new_data = new T[new_cap];
            for (std::size_t i = 0; i < size; ++i) {
                new_data[i] = std::move(data[i]);
            }
            delete[] data;
            data = new_data;
            capacity = new_cap;
        }
        data[size++] = value;
    }

    T& operator[](std::size_t idx) { return data[idx]; }
    std::size_t get_size() const { return size; }
};

// Autonomous driving: Object detection with STL algorithms
struct DetectedObject {
    float distance;
    float confidence;
    std::string type;  // "car", "pedestrian", "bike"
};

int main() {
    Vector<DetectedObject> objects;

    objects.push_back({15.2f, 0.95f, "car"});
    objects.push_back({8.5f, 0.89f, "pedestrian"});
    objects.push_back({22.1f, 0.78f, "bike"});
    objects.push_back({5.3f, 0.98f, "car"});

    // Range-for loop (enabled by begin/end)
    std::cout << "All detected objects:\n";
    for (const auto& obj : objects) {
        std::cout << obj.type << " at " << obj.distance << "m\n";
    }

    // STL algorithm usage (enabled by random access iterators)
    std::sort(objects.begin(), objects.end(),
        [](const DetectedObject& a, const DetectedObject& b) {
            return a.distance < b.distance;  // Sort by distance
        });

    std::cout << "\nSorted by distance:\n";
    for (const auto& obj : objects) {
        std::cout << obj.type << " at " << obj.distance << "m\n";
    }

    // Output:
    // All detected objects:
    // car at 15.2m
    // pedestrian at 8.5m
    // bike at 22.1m
    // car at 5.3m
    //
    // Sorted by distance:
    // car at 5.3m
    // pedestrian at 8.5m
    // car at 15.2m
    // bike at 22.1m

    return 0;
}
```

This advanced implementation adds:
- **Random access iterators**: Full STL iterator traits
- **Range-for support**: `begin()` and `end()` enable `for (auto x : vec)`
- **STL algorithm compatibility**: Works with `std::sort`, `std::find`, `std::copy`, etc.
- **Const iterators**: For read-only traversal
- **Iterator arithmetic**: `it + 5`, `it - 3`, `it2 - it1`

**Real-world benefit**: Seamless integration with STL algorithms for object detection sorting, filtering, and processing.

---

#### Example 4: Exception-Safe Vector with Copy-and-Swap (Advanced)

```cpp
#include <iostream>
#include <stdexcept>
#include <utility>

// Type that throws on copy (for testing exception safety)
struct ThrowOnCopy {
    int value;
    static int copy_count;

    ThrowOnCopy(int v = 0) : value(v) {}

    ThrowOnCopy(const ThrowOnCopy& other) : value(other.value) {
        if (++copy_count == 3) {
            throw std::runtime_error("Simulated copy failure");
        }
    }

    ThrowOnCopy& operator=(const ThrowOnCopy& other) {
        if (++copy_count == 3) {
            throw std::runtime_error("Simulated assignment failure");
        }
        value = other.value;
        return *this;
    }
};
int ThrowOnCopy::copy_count = 0;

template <typename T>
class Vector {
private:
    T* data;
    std::size_t size;
    std::size_t capacity;

    void swap(Vector<T>& other) noexcept {
        std::swap(data, other.data);
        std::swap(size, other.size);
        std::swap(capacity, other.capacity);
    }

public:
    Vector() : data(nullptr), size(0), capacity(0) {}

    ~Vector() { delete[] data; }

    // Copy constructor with exception safety
    Vector(const Vector<T>& other) : data(nullptr), size(0), capacity(0) {
        if (other.size > 0) {
            data = new T[other.capacity];  // May throw (allocation)
            capacity = other.capacity;

            try {
                for (std::size_t i = 0; i < other.size; ++i) {
                    data[i] = other.data[i];  // May throw (copy)
                }
                size = other.size;
            } catch (...) {
                delete[] data;
                data = nullptr;
                capacity = 0;
                throw;  // Rethrow after cleanup
            }
        }
    }

    // Copy assignment with strong exception guarantee (copy-and-swap)
    Vector<T>& operator=(const Vector<T>& other) {
        if (this != &other) {
            Vector<T> temp(other);  // May throw, but *this unchanged
            swap(temp);             // noexcept (just pointer swaps)
        }
        return *this;
    }

    // Move constructor (noexcept)
    Vector(Vector<T>&& other) noexcept : data(nullptr), size(0), capacity(0) {
        swap(other);
    }

    // Move assignment (noexcept)
    Vector<T>& operator=(Vector<T>&& other) noexcept {
        if (this != &other) {
            swap(other);
        }
        return *this;
    }

    void push_back(const T& value) {
        if (size == capacity) {
            std::size_t new_cap = capacity == 0 ? 1 : capacity * 2;
            T* new_data = new T[new_cap];

            try {
                for (std::size_t i = 0; i < size; ++i) {
                    new_data[i] = std::move(data[i]);
                }
            } catch (...) {
                delete[] new_data;
                throw;
            }

            delete[] data;
            data = new_data;
            capacity = new_cap;
        }
        data[size++] = value;
    }

    std::size_t get_size() const { return size; }
};

int main() {
    Vector<ThrowOnCopy> v1;
    v1.push_back(ThrowOnCopy{1});
    v1.push_back(ThrowOnCopy{2});

    Vector<ThrowOnCopy> v2;
    v2.push_back(ThrowOnCopy{10});

    ThrowOnCopy::copy_count = 0;

    try {
        v2 = v1;  // Will throw on 3rd copy
    } catch (const std::exception& e) {
        std::cout << "Exception caught: " << e.what() << "\n";
        std::cout << "v2 size (should be 1, unchanged): " << v2.get_size() << "\n";
        // Output: v2 size (should be 1, unchanged): 1
        // ✅ Strong exception guarantee: v2 remains in original state
    }

    return 0;
}
```

This demonstrates:
- **Strong exception guarantee**: Copy assignment uses copy-and-swap idiom
- **Exception handling in copy constructor**: Try-catch with cleanup
- **Moved-from state validity**: Objects can still be destroyed after move
- **Testing exception safety**: Simulating copy failures

**Key insight**: Copy-and-swap ensures that if copying fails, the original object (`*this`) remains **unchanged**. Without this idiom, `*this` could be left in a **broken state** (partially copied, invalid pointers).

---

#### Example 5: Real-World LiDAR Point Cloud Processing

```cpp
#include <iostream>
#include <cmath>

// High-performance Vector for real-time sensor processing
template <typename T>
class Vector {
private:
    T* data;
    std::size_t size;
    std::size_t capacity;

public:
    Vector() : data(nullptr), size(0), capacity(0) {}
    ~Vector() { delete[] data; }

    Vector(const Vector&) = delete;  // No copy for large sensor data
    Vector& operator=(const Vector&) = delete;

    Vector(Vector&& other) noexcept
        : data(other.data), size(other.size), capacity(other.capacity)
    {
        other.data = nullptr;
        other.size = 0;
        other.capacity = 0;
    }

    void reserve(std::size_t new_cap) {
        if (new_cap <= capacity) return;
        T* new_data = new T[new_cap];
        for (std::size_t i = 0; i < size; ++i) {
            new_data[i] = std::move(data[i]);
        }
        delete[] data;
        data = new_data;
        capacity = new_cap;
    }

    void push_back(T&& value) {
        if (size == capacity) reserve(capacity == 0 ? 1 : capacity * 2);
        data[size++] = std::move(value);
    }

    void clear() { size = 0; }
    std::size_t get_size() const { return size; }
    T& operator[](std::size_t idx) { return data[idx]; }
    const T& operator[](std::size_t idx) const { return data[idx]; }
};

// LiDAR point structure (16 bytes, cache-friendly)
struct alignas(16) Point3D {
    float x, y, z;      // 3D coordinates
    float intensity;    // Reflectivity (0-1)
};

// Autonomous driving: LiDAR processing pipeline
class LidarProcessor {
private:
    Vector<Point3D> raw_cloud;
    Vector<Point3D> filtered_cloud;

public:
    void processFrame(const Point3D* sensor_data, size_t point_count) {
        // Step 1: Load raw data
        raw_cloud.clear();
        raw_cloud.reserve(point_count);  // Avoid reallocations

        for (size_t i = 0; i < point_count; ++i) {
            raw_cloud.push_back(std::move(sensor_data[i]));
        }

        std::cout << "Raw points: " << raw_cloud.get_size() << "\n";

        // Step 2: Filter by distance (keep points within 50m)
        filtered_cloud.clear();
        filtered_cloud.reserve(point_count / 2);  // Estimate half pass filter

        for (size_t i = 0; i < raw_cloud.get_size(); ++i) {
            const Point3D& pt = raw_cloud[i];
            float dist = std::sqrt(pt.x*pt.x + pt.y*pt.y + pt.z*pt.z);

            if (dist < 50.0f && pt.intensity > 0.3f) {
                filtered_cloud.push_back(std::move(raw_cloud[i]));
            }
        }

        std::cout << "Filtered points: " << filtered_cloud.get_size() << "\n";
    }

    const Vector<Point3D>& getFilteredCloud() const {
        return filtered_cloud;
    }
};

int main() {
    // Simulate LiDAR sensor data (100K points per frame)
    constexpr size_t POINTS_PER_FRAME = 100'000;
    Point3D* sensor_data = new Point3D[POINTS_PER_FRAME];

    // Generate random points
    for (size_t i = 0; i < POINTS_PER_FRAME; ++i) {
        sensor_data[i] = {
            static_cast<float>(rand() % 100 - 50),  // x: -50 to 50
            static_cast<float>(rand() % 100 - 50),  // y: -50 to 50
            static_cast<float>(rand() % 10),         // z: 0 to 10
            static_cast<float>(rand() % 100) / 100.0f // intensity: 0-1
        };
    }

    LidarProcessor processor;
    processor.processFrame(sensor_data, POINTS_PER_FRAME);

    // Output:
    // Raw points: 100000
    // Filtered points: ~33000 (approx 1/3 pass distance+intensity filter)

    delete[] sensor_data;
    return 0;
}
```

This real-world example demonstrates:
- **Move-only semantics**: Disabled copy for large sensor buffers (millions of points)
- **reserve() optimization**: Preallocate capacity to avoid reallocations during 10Hz processing
- **Cache-friendly data**: Contiguous storage with 16-byte aligned points for SIMD
- **Two-stage processing**: Raw → Filtered pipeline typical in autonomous systems

**Performance characteristics**:
- 100K points × 16 bytes = 1.6 MB per frame
- At 10 Hz LiDAR rate: 16 MB/s data throughput
- Zero reallocations due to `reserve()` → deterministic latency
- Sequential memory access → excellent CPU cache utilization

---

### INTERVIEW_QA: Comprehensive Questions

#### Q1: What is the difference between size and capacity in a Vector?
**Difficulty:** #beginner
**Category:** #memory #fundamentals
**Concepts:** #dynamic_array #vector #capacity_management #memory_allocation

**Answer:**
**Size** is the number of elements currently stored in the vector, while **capacity** is the total number of elements the vector can hold before needing to reallocate memory.

**Code example:**
```cpp
Vector<int> v;
v.reserve(10);
std::cout << v.size();      // 0 (no elements)
std::cout << v.capacity();  // 10 (space for 10 elements)

v.push_back(5);
std::cout << v.size();      // 1 (one element)
std::cout << v.capacity();  // 10 (still space for 10)
```

**Explanation:**
Size tracks constructed elements (accessible via `operator[]`), while capacity tracks allocated memory. When `size == capacity`, the next `push_back()` triggers reallocation (typically doubling capacity). The gap between size and capacity allows for efficient amortized O(1) insertion without reallocating on every `push_back()`.

**Key takeaway:** Use `reserve()` to set capacity without changing size; use `resize()` to change size (construct/destruct elements).

---

#### Q2: Why does Vector typically double its capacity when growing?
**Difficulty:** #beginner
**Category:** #performance #algorithms
**Concepts:** #amortized_analysis #dynamic_array #reallocation #complexity

**Answer:**
Doubling capacity ensures **amortized O(1) insertion** for `push_back()`. If capacity grew by a fixed amount (e.g., +10), insertion would be O(N) amortized.

**Code example:**
```cpp
// Doubling strategy
void push_back(const T& val) {
    if (size == capacity) {
        reserve(capacity == 0 ? 1 : capacity * 2);  // ✅ Double
    }
    data[size++] = val;
}

// ❌ Bad: Fixed increment (O(N) amortized)
void push_back_bad(const T& val) {
    if (size == capacity) {
        reserve(capacity + 10);  // Only grow by 10
    }
    data[size++] = val;
}
```

**Explanation:**
With doubling: inserting N elements requires ~N copies total (1 + 2 + 4 + ... + N ≈ 2N), averaging 2 copies per element (constant). With fixed increment: inserting N elements requires N²/20 copies (1×10 + 2×10 + ... + (N/10)×10), averaging N/10 copies per element (linear). Doubling trades memory overhead (50% unused capacity on average) for time efficiency.

**Key takeaway:** Doubling capacity is a space-time tradeoff that achieves amortized constant-time insertion.

---

#### Q3: What is the copy-and-swap idiom and why is it used in assignment operators?
**Difficulty:** #intermediate
**Category:** #exception_safety #design_pattern
**Concepts:** #copy_and_swap #strong_guarantee #exception_safety #raii

**Answer:**
Copy-and-swap ensures **strong exception safety** in assignment: either the assignment succeeds completely, or the object remains unchanged. It copies the source into a temporary, then swaps internals.

**Code example:**
```cpp
// ✅ Strong exception guarantee
Vector<T>& operator=(const Vector<T>& other) {
    if (this != &other) {
        Vector<T> temp(other);  // May throw, but *this unchanged
        swap(temp);             // noexcept (just pointer swaps)
    }
    return *this;
}

void swap(Vector<T>& other) noexcept {
    std::swap(data, other.data);
    std::swap(size, other.size);
    std::swap(capacity, other.capacity);
}
```

**Explanation:**
Without copy-and-swap, assignment might delete old data first, then throw during copying, leaving the object in a broken state (no data, invalid size). Copy-and-swap does all risky operations (allocation, copying) on a temporary object. If it throws, `*this` is untouched. If it succeeds, `swap()` just exchanges pointers (which doesn't throw). The temporary's destructor cleans up the old data.

**Key takeaway:** Copy-and-swap provides automatic exception safety by leveraging RAII (temp's destructor) and noexcept swap.

---

#### Q4: When do iterators become invalidated in a Vector?
**Difficulty:** #intermediate
**Category:** #memory #iterators
**Concepts:** #iterator_invalidation #reallocation #undefined_behavior #memory_safety

**Answer:**
Iterators are invalidated when the Vector **reallocates** (during `push_back`, `reserve`, `resize` that exceeds capacity) or when elements are **erased**. Accessing invalidated iterators is undefined behavior.

**Code example:**
```cpp
Vector<int> v = {1, 2, 3};
v.reserve(10);  // capacity = 10

auto it = v.begin();
v.push_back(4);  // ✅ No reallocation (capacity sufficient)
std::cout << *it;  // ✅ OK: iterator still valid

// Exceed capacity
for (int i = 5; i < 15; ++i) {
    v.push_back(i);  // ❌ Reallocation at i=11
}
std::cout << *it;  // ❌ UNDEFINED BEHAVIOR: iterator invalidated
```

**Explanation:**
Reallocation involves allocating a new buffer, copying elements, and deleting the old buffer. Iterators (and pointers/references) to the old buffer now point to freed memory. The solution is to either (1) call `reserve()` before a loop to prevent reallocation, or (2) use index-based access instead of iterators when insertions occur.

**Key takeaway:** Always `reserve()` before loops that insert elements, or re-acquire iterators after potential reallocation.

---

#### Q5: What is the difference between reserve() and resize()?
**Difficulty:** #intermediate
**Category:** #memory #fundamentals
**Concepts:** #vector #capacity #size #memory_allocation #element_construction

**Answer:**
`reserve(n)` allocates space for `n` elements without constructing them (changes capacity, not size). `resize(n)` changes the size to `n`, constructing or destructing elements as needed.

**Code example:**
```cpp
Vector<int> v;

v.reserve(100);
std::cout << v.size();      // 0 (no elements constructed)
std::cout << v.capacity();  // 100 (space allocated)
v[50] = 42;  // ❌ UNDEFINED BEHAVIOR: out of bounds

v.resize(100);
std::cout << v.size();      // 100 (elements default-constructed)
std::cout << v.capacity();  // ≥100
v[50] = 42;  // ✅ OK: element exists
```

**Explanation:**
`reserve()` is an optimization: it preallocates memory to avoid multiple reallocations during a series of `push_back()` calls, but doesn't change the number of valid elements. `resize()` actually creates or destroys elements, making them accessible via `operator[]`. Use `reserve()` before inserting many elements for performance, and `resize()` when you need a specific number of elements initialized.

**Key takeaway:** `reserve()` is for optimization (avoid reallocations), `resize()` is for initialization (create elements).

---

#### Q6: Why should move constructors and move assignments be marked noexcept?
**Difficulty:** #intermediate
**Category:** #move_semantics #exception_safety
**Concepts:** #noexcept #move_constructor #move_assignment #stl_compatibility #strong_guarantee

**Answer:**
Marking move operations `noexcept` enables STL containers to use them for strong exception safety. If moves can throw, containers must fall back to copying (slower).

**Code example:**
```cpp
// ✅ Correct: noexcept move operations
Vector(Vector<T>&& other) noexcept {
    data = other.data;
    size = other.size;
    capacity = other.capacity;
    other.data = nullptr;
    other.size = 0;
    other.capacity = 0;
}

Vector<T>& operator=(Vector<T>&& other) noexcept {
    swap(other);
    return *this;
}

// Example: std::vector<Vector<int>> resizing
std::vector<Vector<int>> vec_of_vecs;
vec_of_vecs.reserve(10);
vec_of_vecs.push_back(Vector<int>());  // Uses move if noexcept
```

**Explanation:**
`std::vector` (and other STL containers) check `std::is_nothrow_move_constructible` when reallocating. If your type's move constructor is `noexcept`, it moves elements; otherwise, it copies them for strong exception safety (if move throws during reallocation, the container can't rollback). Moving is typically O(1) (pointer swap), while copying is O(N), so `noexcept` is critical for performance.

**Key takeaway:** Always mark move constructors/assignments `noexcept` unless they can genuinely throw.

---

#### Q7: What is the Rule of Five and how does it apply to Vector?
**Difficulty:** #intermediate
**Category:** #resource_management #design_pattern
**Concepts:** #rule_of_five #raii #copy_constructor #move_constructor #destructor #assignment

**Answer:**
The Rule of Five states: if you define a destructor, copy constructor, copy assignment, move constructor, or move assignment, you should define all five (or explicitly delete them).

**Code example:**
```cpp
template <typename T>
class Vector {
public:
    // 1. Destructor (manages heap memory)
    ~Vector() { delete[] data; }

    // 2. Copy constructor
    Vector(const Vector& other);

    // 3. Copy assignment
    Vector& operator=(const Vector& other);

    // 4. Move constructor
    Vector(Vector&& other) noexcept;

    // 5. Move assignment
    Vector& operator=(Vector&& other) noexcept;
};
```

**Explanation:**
Vector manages a raw pointer (`T* data`), so it needs a custom destructor to free memory. Once you define a destructor, the compiler-generated copy/move operations are wrong: they'd do shallow copies (copying the pointer, not the data), leading to double-delete bugs. You must define all five to correctly handle deep copying (copy ops), resource stealing (move ops), and cleanup (destructor).

**Key takeaway:** Managing raw resources (pointers, file handles) requires implementing all five special member functions.

---

#### Q8: How do you achieve strong exception safety in Vector::reserve()?
**Difficulty:** #advanced
**Category:** #exception_safety #memory
**Concepts:** #strong_guarantee #exception_handling #try_catch #cleanup #memory_leak

**Answer:**
Allocate new memory, copy elements in a try-catch block, clean up on exception, only commit changes on success.

**Code example:**
```cpp
void reserve(std::size_t new_cap) {
    if (new_cap <= capacity) return;

    T* new_data = new T[new_cap];  // May throw (allocation)

    try {
        // Copy existing elements (may throw)
        for (std::size_t i = 0; i < size; ++i) {
            new_data[i] = std::move(data[i]);
        }
    } catch (...) {
        delete[] new_data;  // Clean up on failure
        throw;              // Rethrow exception
    }

    // Success: commit changes
    delete[] data;
    data = new_data;
    capacity = new_cap;
}
```

**Explanation:**
The risky operations are allocation (`new T[new_cap]`) and element copying/moving. If either throws, we must not leave the Vector in a broken state. The try-catch ensures that if copying throws, we delete the new buffer and rethrow the exception, leaving the original `data` pointer untouched. Only after all copying succeeds do we delete the old buffer and update the pointer.

**Key takeaway:** Strong exception safety requires transactional semantics: all-or-nothing, with cleanup on failure.

---

#### Q9: What is iterator invalidation and how do you prevent it?
**Difficulty:** #intermediate
**Category:** #iterators #memory_safety
**Concepts:** #iterator_invalidation #reallocation #reserve #dangling_pointer #memory_management

**Answer:**
Iterator invalidation occurs when a Vector reallocates, making existing iterators point to freed memory. Prevent it by calling `reserve()` before insertion loops or using index-based access.

**Code example:**
```cpp
// ❌ Bug: Iterator invalidation
Vector<int> v = {1, 2, 3};
v.reserve(5);
auto it = v.begin();
for (int i = 0; i < 10; ++i) {
    v.push_back(i);  // Reallocation invalidates 'it'
}
std::cout << *it;  // ❌ UNDEFINED BEHAVIOR

// ✅ Fix 1: Reserve sufficient capacity
Vector<int> v2 = {1, 2, 3};
v2.reserve(13);  // No reallocation up to 13 elements
auto it2 = v2.begin();
for (int i = 0; i < 10; ++i) {
    v2.push_back(i);  // No reallocation
}
std::cout << *it2;  // ✅ OK

// ✅ Fix 2: Use index-based access
Vector<int> v3 = {1, 2, 3};
for (size_t i = 0; i < 10; ++i) {
    v3.push_back(i);
    std::cout << v3[0];  // Always valid (recalculates address)
}
```

**Explanation:**
Iterators are lightweight wrappers around pointers. When reallocation occurs, the old buffer is deleted, but the iterator still holds the old pointer (now dangling). `reserve()` prevents this by preallocating enough space. Index-based access (`v[i]`) recalculates the address each time, so it's always valid even after reallocation.

**Key takeaway:** Call `reserve()` with the final expected size before insertion loops to avoid iterator invalidation.

---

#### Q10: Why is push_back amortized O(1) instead of O(1)?
**Difficulty:** #intermediate
**Category:** #algorithms #performance
**Concepts:** #amortized_analysis #complexity #reallocation #dynamic_array #geometric_growth

**Answer:**
Each `push_back` is O(1) except when reallocation occurs (O(N) to copy all elements). With doubling capacity, reallocations become exponentially rare, averaging to O(1) per insertion.

**Code example:**
```cpp
// Inserting N elements with doubling strategy
Vector<int> v;
for (int i = 0; i < 16; ++i) {
    v.push_back(i);
    // Capacity doubles at i=0,1,2,4,8,16
    // Copies: 0,1,2,4,8 = 15 total copies for 16 insertions
}
// Amortized cost: 15/16 ≈ 0.94 copies per insertion (constant)
```

**Explanation:**
Without doubling (e.g., +1 capacity each time), inserting N elements requires 0+1+2+...+N-1 = N²/2 copies (quadratic). With doubling, inserting N elements requires 1+2+4+8+...+N ≈ 2N copies (linear total), averaging 2 copies per element (constant). This is called **amortized analysis**: distributing rare expensive operations over many cheap ones.

**Key takeaway:** Geometric growth (doubling) transforms O(N) worst-case reallocation into O(1) amortized insertion cost.

---

#### Q11: What happens to a moved-from Vector, and can it still be used?
**Difficulty:** #intermediate
**Category:** #move_semantics #memory_safety
**Concepts:** #moved_from_state #resource_management #valid_but_unspecified #destructor_safety

**Answer:**
A moved-from Vector is in a **valid but unspecified state**. It can be destroyed or reassigned, but accessing elements is undefined behavior.

**Code example:**
```cpp
Vector<int> v1 = {1, 2, 3};
Vector<int> v2 = std::move(v1);

// v1 is moved-from:
// ✅ Can be destroyed (destructor handles nullptr)
// ✅ Can be reassigned: v1 = {4, 5, 6};
// ❌ Accessing elements: v1[0] is undefined behavior (size=0)
// ❌ Using iterators: v1.begin() may be invalid

// Typical moved-from state:
// v1.data = nullptr
// v1.size = 0
// v1.capacity = 0

// Destructor is safe:
// ~Vector() { delete[] data; }  // delete[] nullptr is safe
```

**Explanation:**
Move constructors should leave the moved-from object in a state where the destructor can safely run. For Vector, this means `data = nullptr` (since `delete[] nullptr` is a no-op). The C++ standard requires moved-from objects to be "valid but unspecified", meaning they can be destroyed or reassigned but shouldn't be used otherwise.

**Key takeaway:** After moving, the moved-from object should have safe destructor semantics (nullptr pointers, zero sizes).

---

#### Q12: How do you implement exception-safe push_back?
**Difficulty:** #advanced
**Category:** #exception_safety #implementation
**Concepts:** #strong_guarantee #try_catch #reallocation #rollback #cleanup

**Answer:**
Perform reallocation in a try-catch block, clean up new buffer on failure, only commit on success. Use move semantics to minimize throwing operations.

**Code example:**
```cpp
void push_back(const T& value) {
    if (size == capacity) {
        std::size_t new_cap = capacity == 0 ? 1 : capacity * 2;
        T* new_data = nullptr;

        try {
            new_data = new T[new_cap];  // May throw

            // Move existing elements (prefer move over copy)
            for (std::size_t i = 0; i < size; ++i) {
                new_data[i] = std::move(data[i]);  // May throw
            }
        } catch (...) {
            delete[] new_data;  // Clean up on failure
            throw;              // Rethrow
        }

        // Success: commit changes
        delete[] data;
        data = new_data;
        capacity = new_cap;
    }

    data[size++] = value;  // May throw, but Vector still valid
}
```

**Explanation:**
If allocation fails, `new_data` is nullptr, and `delete[] nullptr` is safe. If moving throws mid-copy, we delete the partially-filled new buffer and rethrow, leaving `data` pointer unchanged. Only after all moves succeed do we delete the old buffer. The final assignment (`data[size++] = value`) can throw, but at this point the Vector is already in a valid state with increased capacity.

**Key takeaway:** Exception safety requires transactional semantics: changes are atomic (all succeed or none).

---

#### Q13: Why does Vector use T* instead of T[] as a member?
**Difficulty:** #intermediate
**Category:** #memory #design_choice
**Concepts:** #dynamic_array #heap_allocation #pointer_arithmetic #reallocation #array_decay

**Answer:**
`T*` allows dynamic reallocation (changing the pointer to a new buffer), while `T[]` is fixed at construction. Vectors need to reallocate as they grow.

**Code example:**
```cpp
// ✅ Correct: T* allows reallocation
class Vector {
    T* data;  // Can be reassigned to new buffer

    void reserve(size_t new_cap) {
        T* new_data = new T[new_cap];
        // ... copy elements ...
        delete[] data;
        data = new_data;  // ✅ OK: reassign pointer
    }
};

// ❌ Wrong: T[] is fixed
class Vector {
    T data[];  // ❌ Can't be resized or reallocated
    // How do you grow this? You can't.
};

// ❌ Also wrong: std::array
class Vector {
    std::array<T, 100> data;  // Fixed size at compile time
    // Can't grow beyond 100 elements
};
```

**Explanation:**
Reallocation requires allocating a new buffer, copying elements, and deleting the old buffer. This only works if the buffer is accessed via a reassignable pointer (`T*`). Arrays (`T[]` or `std::array`) have fixed size and can't be reallocated. The `T*` member is the fundamental building block of dynamic containers.

**Key takeaway:** Use `T*` for dynamic resizable containers; arrays are for fixed-size storage.

---

#### Q14: What is the purpose of shrink_to_fit()?
**Difficulty:** #beginner
**Category:** #memory #optimization
**Concepts:** #capacity_management #memory_overhead #reallocation #memory_optimization

**Answer:**
`shrink_to_fit()` reduces capacity to match size, freeing unused memory. It's useful after removing many elements to reclaim memory.

**Code example:**
```cpp
Vector<int> v;
v.reserve(1000);
for (int i = 0; i < 1000; ++i) {
    v.push_back(i);
}
std::cout << v.size();      // 1000
std::cout << v.capacity();  // 1000

// Remove most elements
for (int i = 0; i < 900; ++i) {
    v.pop_back();
}
std::cout << v.size();      // 100
std::cout << v.capacity();  // 1000 (unchanged!)

v.shrink_to_fit();
std::cout << v.capacity();  // 100 (reduced to match size)
// Freed 900 * sizeof(int) = 3600 bytes
```

**Explanation:**
Removing elements (via `pop_back`, `resize`) doesn't reduce capacity, so memory remains allocated. `shrink_to_fit()` reallocates a smaller buffer matching the current size. This is useful in scenarios like: (1) processing a large dataset, then keeping only summary results, or (2) long-running processes where memory footprint matters.

**Key takeaway:** Use `shrink_to_fit()` to reclaim memory after removing many elements.

---

#### Q15: How would you implement a Vector that supports custom allocators?
**Difficulty:** #advanced
**Category:** #stl_compatibility #memory
**Concepts:** #allocator #template_template_parameter #stl_allocator #memory_management #customization

**Answer:**
Add an `Allocator` template parameter (defaulting to `std::allocator<T>`), and use allocator methods (`allocate`, `deallocate`, `construct`, `destroy`) instead of `new`/`delete`.

**Code example:**
```cpp
template <typename T, typename Allocator = std::allocator<T>>
class Vector {
private:
    T* data;
    std::size_t size;
    std::size_t capacity;
    Allocator alloc;  // Allocator instance

public:
    void reserve(std::size_t new_cap) {
        if (new_cap <= capacity) return;

        // Use allocator instead of new[]
        T* new_data = alloc.allocate(new_cap);

        // Construct elements using allocator
        for (std::size_t i = 0; i < size; ++i) {
            alloc.construct(&new_data[i], std::move(data[i]));
            alloc.destroy(&data[i]);
        }

        alloc.deallocate(data, capacity);
        data = new_data;
        capacity = new_cap;
    }

    ~Vector() {
        for (std::size_t i = 0; i < size; ++i) {
            alloc.destroy(&data[i]);
        }
        alloc.deallocate(data, capacity);
    }
};

// Usage with custom allocator
template <typename T>
class PoolAllocator {
    // ... custom allocation from memory pool ...
};

Vector<int, PoolAllocator<int>> v;  // Uses pool allocator
```

**Explanation:**
Allocators decouple memory allocation from object construction. `allocate(n)` returns raw memory (like `operator new`), `construct(ptr, args...)` calls placement new, `destroy(ptr)` calls destructor, `deallocate(ptr, n)` frees memory. This allows custom memory management (e.g., pool allocators for real-time systems, aligned allocators for SIMD).

**Key takeaway:** Allocator support enables STL-compatible custom memory management.

---

#### Q16: What is the difference between emplace_back and push_back?
**Difficulty:** #intermediate
**Category:** #performance #move_semantics
**Concepts:** #emplace #perfect_forwarding #in_place_construction #variadic_templates #move_semantics

**Answer:**
`push_back` takes a constructed object (copy or move), while `emplace_back` constructs the object in-place using perfect forwarding, avoiding temporary objects.

**Code example:**
```cpp
struct Expensive {
    int x;
    std::string s;

    Expensive(int x, std::string s) : x(x), s(std::move(s)) {
        std::cout << "Expensive constructed\n";
    }

    Expensive(const Expensive&) {
        std::cout << "Expensive copied\n";
    }
};

Vector<Expensive> v;

// push_back: constructs temporary, then moves
v.push_back(Expensive(42, "hello"));
// Output: Expensive constructed (temp)
//         Expensive copied/moved (into vector)

// emplace_back: constructs directly in vector
v.emplace_back(42, "hello");
// Output: Expensive constructed (in-place)
```

**Explanation:**
`push_back(Expensive(42, "hello"))` creates a temporary `Expensive` object, then copies/moves it into the vector (2 operations). `emplace_back(42, "hello")` forwards the arguments to the constructor and constructs the object directly in the vector's memory using placement new (1 operation). This eliminates the temporary and is more efficient for complex types.

**Implementation:**
```cpp
template <typename... Args>
void emplace_back(Args&&... args) {
    if (size == capacity) reserve(capacity == 0 ? 1 : capacity * 2);
    new (&data[size++]) T(std::forward<Args>(args)...);  // Placement new
}
```

**Key takeaway:** Use `emplace_back` for complex types to avoid temporary construction/destruction.

---

#### Q17: How do you prevent memory leaks in Vector when T's destructor throws?
**Difficulty:** #advanced
**Category:** #exception_safety #memory
**Concepts:** #destructor_exceptions #std_terminate #memory_leak #exception_handling #cleanup

**Answer:**
You can't fully prevent termination if T's destructor throws (C++ calls `std::terminate`), but you can use try-catch in cleanup loops to destroy as many elements as possible.

**Code example:**
```cpp
~Vector() {
    // Destroy elements (may throw)
    for (std::size_t i = 0; i < size; ++i) {
        try {
            data[i].~T();  // Explicit destructor call
        } catch (...) {
            // Log error, but continue destroying other elements
            std::cerr << "Element destructor threw at index " << i << "\n";
        }
    }

    // Always deallocate memory (even if some destructors threw)
    delete[] data;
}

// Note: If using placement new (allocator), need explicit destruction:
~Vector() {
    for (std::size_t i = 0; i < size; ++i) {
        try {
            alloc.destroy(&data[i]);
        } catch (...) {
            // Continue
        }
    }
    alloc.deallocate(data, capacity);
}
```

**Explanation:**
C++ standard: destructors should not throw (marked `noexcept` by default in C++11+). If a destructor throws during stack unwinding (exception handling), `std::terminate` is called. In Vector's destructor, we can try-catch around element destruction to log errors and continue, ensuring memory is freed even if some destructors throw. However, if T's destructor throws during exception handling in user code, the program terminates.

**Key takeaway:** Always make destructors `noexcept`; throwing destructors break exception safety guarantees.

---

#### Q18: Why is contiguous memory (Vector) faster than linked memory (list)?
**Difficulty:** #intermediate
**Category:** #performance #hardware
**Concepts:** #cache_locality #memory_hierarchy #cpu_cache #prefetching #sequential_access

**Answer:**
Contiguous memory (Vector) has excellent CPU cache locality: accessing element i+1 after i is fast because the data is already in cache. Linked lists suffer cache misses on each node access.

**Code example:**
```cpp
// Vector: contiguous memory
Vector<int> v = {1, 2, 3, 4, 5};
// Memory: [1][2][3][4][5] (sequential)
// Accessing v[1], v[2], v[3] -> all in same cache line

// std::list: non-contiguous nodes
std::list<int> l = {1, 2, 3, 4, 5};
// Memory: [1|next] -> [2|next] -> [3|next] (scattered)
// Accessing each element -> cache miss

// Benchmark: sum elements
// Vector: ~10ns (all in L1 cache)
// List: ~50ns (pointer chasing, cache misses)
```

**Explanation:**
Modern CPUs have a memory hierarchy: L1 cache (~1ns), L2 (~5ns), L3 (~20ns), RAM (~100ns). When you access `v[0]`, the CPU loads a cache line (64 bytes) containing `v[0]` through `v[15]` (assuming 4-byte ints). Subsequent accesses to `v[1]`-`v[15]` are instant. Lists store each node separately in random memory locations, so each access is a cache miss (100ns). The CPU's prefetcher can predict sequential access patterns (Vector) but not pointer chasing (list).

**Key takeaway:** Use Vector for random access and sequential processing; use list only when frequent insertion/deletion in the middle is required.

---

#### Q19: What is the Small Vector Optimization (SVO) and how would you implement it?
**Difficulty:** #advanced
**Category:** #optimization #memory
**Concepts:** #small_buffer_optimization #union #placement_new #cache_optimization #memory_allocation

**Answer:**
Small Vector Optimization stores a small number of elements inline (without heap allocation) for small sizes. When size exceeds the inline capacity, it switches to heap allocation.

**Code example:**
```cpp
template <typename T, std::size_t InlineCapacity = 16>
class SmallVector {
private:
    std::size_t size;
    std::size_t capacity;

    // Union: either inline storage or heap pointer
    union {
        T inline_storage[InlineCapacity];
        T* heap_storage;
    };

    bool is_heap_allocated() const {
        return capacity > InlineCapacity;
    }

    T* data_ptr() {
        return is_heap_allocated() ? heap_storage : inline_storage;
    }

public:
    SmallVector() : size(0), capacity(InlineCapacity) {
        // Use inline_storage by default (no allocation)
    }

    ~SmallVector() {
        if (is_heap_allocated()) {
            delete[] heap_storage;
        }
    }

    void push_back(const T& value) {
        if (size == capacity) {
            // Transition from inline to heap
            if (!is_heap_allocated()) {
                T* new_data = new T[capacity * 2];
                for (size_t i = 0; i < size; ++i) {
                    new_data[i] = std::move(inline_storage[i]);
                }
                heap_storage = new_data;
                capacity *= 2;
            } else {
                // Already on heap, grow normally
                T* new_data = new T[capacity * 2];
                for (size_t i = 0; i < size; ++i) {
                    new_data[i] = std::move(heap_storage[i]);
                }
                delete[] heap_storage;
                heap_storage = new_data;
                capacity *= 2;
            }
        }
        data_ptr()[size++] = value;
    }

    T& operator[](size_t idx) { return data_ptr()[idx]; }
};

// Usage: No heap allocation for small vectors
SmallVector<int, 8> v;  // First 8 elements stored inline
for (int i = 0; i < 5; ++i) {
    v.push_back(i);  // No malloc (uses inline_storage)
}
v.push_back(10);  // Still inline
v.push_back(11);  // Still inline
v.push_back(12);  // Exceeds capacity=8 -> heap allocation
```

**Explanation:**
Small objects (≤8 elements) benefit from inline storage: no malloc overhead (~100ns), better cache locality (part of the vector object itself). The union lets us reuse the same memory for either inline storage or heap pointer. When transitioning from inline to heap, we allocate heap storage, move elements, and switch the flag.

**Key takeaway:** SVO optimizes the common case of small vectors, avoiding heap allocation for sizes ≤ InlineCapacity.

---

#### Q20: How would you implement a thread-safe Vector?
**Difficulty:** #advanced
**Category:** #concurrency #multithreading
**Concepts:** #thread_safety #mutex #shared_mutex #concurrent_access #lock_free #atomic

**Answer:**
Use a mutex to protect all member functions that modify or read shared state. For reader-writer scenarios, use `std::shared_mutex` (multiple readers, exclusive writer).

**Code example:**
```cpp
#include <mutex>
#include <shared_mutex>

template <typename T>
class ThreadSafeVector {
private:
    T* data;
    std::size_t size;
    std::size_t capacity;
    mutable std::shared_mutex mtx;  // Reader-writer lock

public:
    void push_back(const T& value) {
        std::unique_lock lock(mtx);  // Exclusive lock (writer)

        if (size == capacity) {
            reserve_impl(capacity == 0 ? 1 : capacity * 2);
        }
        data[size++] = value;
    }

    T operator[](std::size_t idx) const {
        std::shared_lock lock(mtx);  // Shared lock (reader)
        return data[idx];  // Return by value (avoid dangling ref)
    }

    std::size_t get_size() const {
        std::shared_lock lock(mtx);
        return size;
    }

private:
    void reserve_impl(std::size_t new_cap) {
        // Called with lock held
        T* new_data = new T[new_cap];
        for (std::size_t i = 0; i < size; ++i) {
            new_data[i] = std::move(data[i]);
        }
        delete[] data;
        data = new_data;
        capacity = new_cap;
    }
};

// Usage: Multiple threads can safely access
ThreadSafeVector<int> v;

// Thread 1: Write
std::thread t1([&]() { v.push_back(42); });

// Thread 2: Read
std::thread t2([&]() { std::cout << v[0]; });

t1.join();
t2.join();
```

**Explanation:**
`std::shared_mutex` allows multiple readers (`std::shared_lock`) or one writer (`std::unique_lock`). Writes (push_back, reserve) require exclusive access. Reads (operator[], size) allow concurrent access. **Important**: Return elements by value (not reference) to avoid dangling references if the vector reallocates after the lock is released.

**Alternative (lock-free)**: For high-performance scenarios, use atomic operations and copy-on-write (COW) semantics, but this is complex and requires deep understanding of memory ordering.

**Key takeaway:** Mutex-based thread safety is simple but may be a bottleneck; lock-free data structures are faster but much harder to implement correctly.

---

### PRACTICE_TASKS: Challenge Questions

#### Q1
```cpp
Vector<int> v;
v.reserve(10);
v[5] = 42;
std::cout << v[5];
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Undefined behavior (likely crashes)

**Explanation:** `reserve()` allocates capacity but doesn't construct elements; accessing `v[5]` is out of bounds (size=0)

**Key Concept:** reserve vs resize

</details>

---

#### Q2
```cpp
Vector<int> v = {1, 2, 3};
v.reserve(5);
auto it = v.begin();
v.push_back(4);
v.push_back(5);
std::cout << *it;
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Safe, prints 1

**Explanation:** `reserve(5)` ensures capacity ≥5, so no reallocation during push_back; iterator remains valid

**Key Concept:** Iterator invalidation

</details>

---

#### Q3
```cpp
Vector<int> v;
for (int i = 0; i < 8; ++i) {
    v.push_back(i);
}
std::cout << v.capacity();
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** 8

**Explanation:** Capacity doubles: 0→1→2→4→8 (8th element fits in capacity 8)

**Key Concept:** Doubling strategy

</details>

---

#### Q4
```cpp
Vector<int> v1 = {1, 2, 3};
Vector<int> v2 = v1;
v2[0] = 99;
std::cout << v1[0];
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** 1

**Explanation:** Copy constructor creates deep copy; modifying `v2` doesn't affect `v1`

**Key Concept:** Deep copy semantics

</details>

---

#### Q5
```cpp
Vector<int> v1 = {1, 2, 3};
Vector<int> v2 = std::move(v1);
std::cout << v1.size();
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** 0 (safe)

**Explanation:** Move constructor leaves `v1` in valid moved-from state (size=0, data=nullptr); accessing size is safe

**Key Concept:** Moved-from state

</details>

---

#### Q6
```cpp
Vector<int> v;
v.resize(5);
std::cout << v[3];
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** 0 (default value)

**Explanation:** `resize(5)` default-constructs 5 ints (initialized to 0)

**Key Concept:** resize default construction

</details>

---

#### Q7
```cpp
Vector<int> v = {1, 2, 3};
v.resize(10);
std::cout << v.size() << ", " << v.capacity();
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** 10, ≥10

**Explanation:** `resize(10)` sets size to 10; capacity is at least 10 (may be larger)

**Key Concept:** resize capacity behavior

</details>

---

#### Q8
```cpp
Vector<int> v = {1, 2, 3, 4};
v.pop_back();
v.pop_back();
std::cout << v.capacity();
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** 4 (unchanged)

**Explanation:** `pop_back()` decreases size but doesn't reduce capacity

**Key Concept:** Capacity unchanged by pop

</details>

---

#### Q9
```cpp
Vector<int> v;
v.reserve(100);
v.resize(50);
std::cout << v.size() << ", " << v.capacity();
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** 50, 100

**Explanation:** `reserve(100)` sets capacity, then `resize(50)` sets size; capacity remains 100

**Key Concept:** reserve then resize

</details>

---

#### Q10
```cpp
Vector<std::string> v;
v.push_back("hello");
v.push_back("world");
v.clear();
std::cout << v.capacity();
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** ≥2 (unchanged)

**Explanation:** `clear()` sets size to 0 but doesn't reduce capacity; capacity remains allocated

**Key Concept:** clear vs shrink

</details>

---

#### Q11
```cpp
Vector<int> v = {1, 2, 3};
Vector<int>& ref = v;
ref.push_back(4);
std::cout << v.size();
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** 4

**Explanation:** `ref` is a reference to `v`; modifying via reference modifies original

**Key Concept:** Reference semantics

</details>

---

#### Q12
```cpp
Vector<int> v1 = {1, 2, 3};
Vector<int> v2;
v2 = v1;
v2 = v1;  // Assign again
std::cout << v2.size();
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Safe, prints 3

**Explanation:** Copy assignment checks `this != &other` to prevent self-assignment issues

**Key Concept:** Self-assignment check

</details>

---

#### Q13
```cpp
struct NonCopyable {
    NonCopyable() = default;
    NonCopyable(const NonCopyable&) = delete;
    NonCopyable(NonCopyable&&) = default;
};

Vector<NonCopyable> v;
NonCopyable obj;
v.push_back(obj);
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** No

**Explanation:** `push_back(obj)` requires copy constructor (lvalue); `NonCopyable` deleted copy constructor

**Key Concept:** Copy vs move

</details>

---

#### Q14
```cpp
Vector<int> v = {1, 2, 3};
auto it = v.begin();
v.reserve(100);
std::cout << *it;
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Yes, prints 1

**Explanation:** `reserve(100)` with capacity 3→100 reallocates, but since 100 > current capacity, elements move; iterator points to old memory → UB if not careful, but many implementations handle this; **actually UB**

**Key Concept:** Iterator invalidation

</details>

---

#### Q15
```cpp
Vector<int> createVector() {
    Vector<int> v = {1, 2, 3};
    return v;
}

Vector<int> result = createVector();
std::cout << result.size();
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** RVO/NRVO (Return Value Optimization)

**Explanation:** Compiler elides copy/move, constructing `result` directly in caller's stack frame

**Key Concept:** RVO/NRVO

</details>

---

#### Q16
```cpp
Vector<int> v;
v.resize(5, 10);
std::cout << v[0] << ", " << v[4];
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** 10, 10

**Explanation:** `resize(5, 10)` creates 5 elements, each initialized to 10

**Key Concept:** resize with default value

</details>

---

#### Q17
```cpp
Vector<int> v = {1, 2, 3, 4, 5};
v.shrink_to_fit();
std::cout << v.capacity();
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** 5

**Explanation:** `shrink_to_fit()` reduces capacity to match size (5 elements)

**Key Concept:** shrink_to_fit

</details>

---

#### Q18
```cpp
Vector<int> v;
try {
    v.reserve(SIZE_MAX);
} catch (const std::bad_alloc& e) {
    std::cout << "Allocation failed";
}
std::cout << v.size();
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Allocation failed0

**Explanation:** `reserve(SIZE_MAX)` throws `std::bad_alloc`; exception caught; size remains 0

**Key Concept:** Exception handling

</details>

---

#### Q19
```cpp
Vector<int> v = {1, 2, 3};
for (auto& elem : v) {
    elem *= 2;
}
std::cout << v[1];
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** 4

**Explanation:** Range-for allows modification via reference; `v[1]=2` becomes `2*2=4`

**Key Concept:** Range-for with references

</details>

---

#### Q20
```cpp
Vector<int> v1 = {1, 2, 3};
Vector<int> v2 = {4, 5};
std::swap(v1, v2);
std::cout << v1.size() << ", " << v2.size();
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** 2, 3

**Explanation:** `std::swap` exchanges contents; `v1` gets `{4,5}` (size 2), `v2` gets `{1,2,3}` (size 3)

**Key Concept:** std::swap semantics

</details>

---


### QUICK_REFERENCE: Summary Tables and Answer Keys

#### Answer Key for Practice Questions

| Q# | Answer | Explanation | Key Concept |
|----|--------|-------------|-------------|
| 1 | Undefined behavior (likely crashes) | `reserve()` allocates capacity but doesn't construct elements; accessing `v[5]` is out of bounds (size=0) | reserve vs resize |
| 2 | Safe, prints 1 | `reserve(5)` ensures capacity ≥5, so no reallocation during push_back; iterator remains valid | Iterator invalidation |
| 3 | 8 | Capacity doubles: 0→1→2→4→8 (8th element fits in capacity 8) | Doubling strategy |
| 4 | 1 | Copy constructor creates deep copy; modifying `v2` doesn't affect `v1` | Deep copy semantics |
| 5 | 0 (safe) | Move constructor leaves `v1` in valid moved-from state (size=0, data=nullptr); accessing size is safe | Moved-from state |
| 6 | 0 (default value) | `resize(5)` default-constructs 5 ints (initialized to 0) | resize default construction |
| 7 | 10, ≥10 | `resize(10)` sets size to 10; capacity is at least 10 (may be larger) | resize capacity behavior |
| 8 | 4 (unchanged) | `pop_back()` decreases size but doesn't reduce capacity | Capacity unchanged by pop |
| 9 | 50, 100 | `reserve(100)` sets capacity, then `resize(50)` sets size; capacity remains 100 | reserve then resize |
| 10 | ≥2 (unchanged) | `clear()` sets size to 0 but doesn't reduce capacity; capacity remains allocated | clear vs shrink |
| 11 | 4 | `ref` is a reference to `v`; modifying via reference modifies original | Reference semantics |
| 12 | Safe, prints 3 | Copy assignment checks `this != &other` to prevent self-assignment issues | Self-assignment check |
| 13 | No | `push_back(obj)` requires copy constructor (lvalue); `NonCopyable` deleted copy constructor | Copy vs move |
| 14 | Yes, prints 1 | `reserve(100)` with capacity 3→100 reallocates, but since 100 > current capacity, elements move; iterator points to old memory → UB if not careful, but many implementations handle this; **actually UB** | Iterator invalidation |
| 15 | RVO/NRVO (Return Value Optimization) | Compiler elides copy/move, constructing `result` directly in caller's stack frame | RVO/NRVO |
| 16 | 10, 10 | `resize(5, 10)` creates 5 elements, each initialized to 10 | resize with default value |
| 17 | 5 | `shrink_to_fit()` reduces capacity to match size (5 elements) | shrink_to_fit |
| 18 | Allocation failed0 | `reserve(SIZE_MAX)` throws `std::bad_alloc`; exception caught; size remains 0 | Exception handling |
| 19 | 4 | Range-for allows modification via reference; `v[1]=2` becomes `2*2=4` | Range-for with references |
| 20 | 2, 3 | `std::swap` exchanges contents; `v1` gets `{4,5}` (size 2), `v2` gets `{1,2,3}` (size 3) | std::swap semantics |

**Note on Q14**: Calling `reserve()` when `new_cap > capacity` **does invalidate iterators** because reallocation occurs. The answer should be "Undefined behavior" for safety. The iterator `it` points to the old buffer (freed after reallocation).

---

#### Vector Design Patterns Comparison

| Pattern | Description | Use Case | Example |
|---------|-------------|----------|---------|
| **Fixed-size Vector** | Allocate once, no reallocation | Known size upfront | Camera frame buffer (1920×1080 pixels) |
| **Doubling Vector** | Capacity doubles on growth | Unknown size, frequent insertions | LiDAR point cloud (variable points per frame) |
| **Small Vector Optimization** | Inline storage for small sizes | Most vectors are small (≤16 elements) | Function call argument lists |
| **Move-only Vector** | Delete copy, only move | Large objects, unique ownership | High-res image buffers (GB-sized) |
| **Thread-safe Vector** | Mutex-protected operations | Concurrent access | Shared object detection results |

---

#### Vector Operations Complexity

| Operation | Time Complexity | Notes |
|-----------|----------------|-------|
| `operator[]` | O(1) | Direct index access |
| `push_back` | O(1) amortized | O(N) on reallocation |
| `pop_back` | O(1) | Decrements size only |
| `insert(it, val)` | O(N) | Shift elements after insertion point |
| `erase(it)` | O(N) | Shift elements after deletion point |
| `reserve(n)` | O(N) | Copies all elements if reallocation needed |
| `resize(n)` | O(N) | Constructs/destructs elements |
| `clear` | O(N) | Calls destructors for all elements |
| `shrink_to_fit` | O(N) | Reallocates and copies |

---

#### Exception Safety Guarantees

| Operation | Guarantee | Explanation |
|-----------|-----------|-------------|
| Destructor | No-throw | `delete[]` doesn't throw; marked `noexcept` |
| Move constructor | No-throw | Pointer swaps; marked `noexcept` |
| Move assignment | No-throw | Pointer swaps; marked `noexcept` |
| Copy constructor | Strong | If copy throws, no resources allocated yet |
| Copy assignment (copy-and-swap) | Strong | If copy fails, original object unchanged |
| `push_back` | Basic | If reallocation succeeds but element copy throws, vector still valid but element not added |
| `reserve` | Strong | If allocation/copy fails, original data unchanged |
| `resize` | Strong | If construction fails, size remains unchanged |

---

#### Memory Layout Characteristics

| Container | Memory Layout | Cache Performance | Random Access | Insertion Cost |
|-----------|---------------|-------------------|---------------|----------------|
| Vector | Contiguous (sequential) | Excellent (prefetching) | O(1) | O(N) middle, O(1) end |
| Array | Contiguous (fixed) | Excellent | O(1) | N/A (fixed size) |
| Deque | Chunked (multiple blocks) | Good | O(1) | O(1) both ends |
| List | Scattered (nodes) | Poor (cache misses) | O(N) | O(1) anywhere |

---

#### When to Use Vector vs Other Containers

| Scenario | Best Choice | Reason |
|----------|-------------|--------|
| Unknown size, frequent append | Vector | Amortized O(1) push_back |
| Fixed size, known at compile time | `std::array` | No heap allocation |
| Fixed size, known at runtime | Vector + `reserve()` | Avoid reallocations |
| Frequent insertion/deletion in middle | `std::list` | O(1) splice |
| Frequent insertion at both ends | `std::deque` | O(1) push_front/push_back |
| Large objects, unique ownership | Vector with move-only semantics | Avoid copying |
| Real-time systems (no malloc) | Small Vector Optimization or pre-reserved Vector | Deterministic latency |

---

#### Autonomous Driving Use Cases

| Subsystem | Data Structure | Vector Usage | Performance Requirement |
|-----------|---------------|--------------|-------------------------|
| **LiDAR Processing** | `Vector<Point3D>` | Store 100K-2M points per frame (10-20Hz) | <10ms processing, contiguous memory for SIMD |
| **Camera Object Detection** | `Vector<BoundingBox>` | Store 10-50 detected objects per frame (30Hz) | <5ms inference, frequent reallocation |
| **Path Planning** | `Vector<Waypoint>` | Store 100-500 waypoints (1Hz replanning) | <100ms, sparse insertions |
| **Sensor Fusion** | `Vector<SensorData>` | Buffer 60 frames (1 second at 60Hz) | Circular buffer behavior, no reallocation |
| **Map Tiles** | `Vector<MapTile>` | Load/unload tiles dynamically | Reserve based on visible area |

---

#### Rule of Five Checklist

| Special Member Function | Purpose | Vector Implementation |
|-------------------------|---------|----------------------|
| **Destructor** | Free resources | `delete[] data;` |
| **Copy Constructor** | Deep copy | Allocate new buffer, copy elements |
| **Copy Assignment** | Deep copy with cleanup | Copy-and-swap idiom |
| **Move Constructor** | Steal resources | Swap pointers, set other to nullptr |
| **Move Assignment** | Steal resources with cleanup | Swap pointers |

**Template for Vector Rule of Five:**
```cpp
~Vector() { delete[] data; }

Vector(const Vector& other) : data(new T[other.capacity]), size(other.size), capacity(other.capacity) {
    for (size_t i = 0; i < size; ++i) data[i] = other.data[i];
}

Vector& operator=(const Vector& other) {
    if (this != &other) {
        Vector temp(other);
        swap(temp);
    }
    return *this;
}

Vector(Vector&& other) noexcept : data(nullptr), size(0), capacity(0) {
    swap(other);
}

Vector& operator=(Vector&& other) noexcept {
    if (this != &other) swap(other);
    return *this;
}
```
