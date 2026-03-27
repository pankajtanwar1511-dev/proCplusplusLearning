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

### QUICK_REFERENCE: Summary Tables and Answer Keys

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
