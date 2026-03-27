## TOPIC: Copy Constructor vs Assignment Operator and Rule of Three/Five/Zero

### THEORY_SECTION: Core Concepts in Resource Management

#### 1. Copy Constructor vs Copy Assignment Operator - Fundamental Distinction

**When each is called:**

| Operation | Which Function | Object State | Syntax Example |
|-----------|---------------|--------------|----------------|
| **Initialization from existing object** | Copy Constructor | New object being created | `MyClass b = a;` or `MyClass b(a);` |
| **Pass by value to function** | Copy Constructor | New parameter object created | `void func(MyClass obj)` |
| **Return by value from function** | Copy Constructor (or elided) | New object in caller's scope | `return localObj;` |
| **Assignment to existing object** | Copy Assignment | Existing object being modified | `a = b;` (both already exist) |
| **Chained assignment** | Copy Assignment | Multiple existing objects | `a = b = c;` |

**Key differences table:**

| Aspect | Copy Constructor | Copy Assignment Operator |
|--------|------------------|-------------------------|
| **Signature** | `T(const T& other)` | `T& operator=(const T& other)` |
| **Purpose** | Initialize NEW object from existing | Modify EXISTING object to copy another |
| **Previous state** | No previous state (object being created) | Must clean up old resources first |
| **Return type** | None (constructor) | `T&` (reference to *this for chaining) |
| **Self-assignment check** | Not needed | **Required** to prevent corruption |
| **Initializer list** | Can use | Cannot use |

**Compiler-generated behavior:**

| Member Type | Default Copy Constructor | Default Copy Assignment |
|-------------|------------------------|----------------------|
| **Built-in types** (int, pointers) | Bitwise copy (shallow) | Bitwise copy (shallow) |
| **Class types** | Calls member's copy constructor | Calls member's copy assignment |
| **Pointers** | ❌ **Shallow copy (dangerous!)** | ❌ **Shallow copy (dangerous!)** |
| **Smart pointers** | Defined by smart pointer type | Defined by smart pointer type |

**CRITICAL:** Default shallow copy of raw pointers causes **double-deletion** - multiple objects delete the same memory, causing crashes.

**Code example:**
```cpp
class Data {
    int* ptr;
public:
    // ✅ Copy Constructor - creates new object
    Data(const Data& other) : ptr(new int(*other.ptr)) {
        // No previous state to clean up
    }

    // ✅ Copy Assignment - modifies existing object
    Data& operator=(const Data& other) {
        if (this != &other) {  // Self-assignment check required
            delete ptr;  // Clean up old resource first
            ptr = new int(*other.ptr);
        }
        return *this;  // Return *this for chaining
    }
};
```

---

#### 2. Rule of Three, Five, and Zero - Resource Management Guidelines

**The three rules compared:**

| Rule | Era | When to Apply | Special Members to Define | Modern Recommendation |
|------|-----|---------------|-------------------------|----------------------|
| **Rule of Zero** | C++11+ | Class doesn't manage resources | **None** - use smart pointers | ✅ **Preferred approach** |
| **Rule of Three** | C++98 | Class manages resources | Destructor + Copy Ctor + Copy Assign | Use only if legacy/C interface |
| **Rule of Five** | C++11+ | Class manages resources | Rule of Three + Move Ctor + Move Assign | Use when Rule of Zero impossible |

**Rule of Five - all special member functions:**

| Function | Signature | Purpose | Mark noexcept? |
|----------|-----------|---------|----------------|
| **Destructor** | `~T()` | Release resources | Yes (implicit) |
| **Copy Constructor** | `T(const T&)` | Deep copy resources | No (may allocate) |
| **Copy Assignment** | `T& operator=(const T&)` | Copy with cleanup | No (may allocate) |
| **Move Constructor** | `T(T&&)` | Transfer ownership | **Yes (critical for performance)** |
| **Move Assignment** | `T& operator=(T&&)` | Transfer with cleanup | **Yes (critical for performance)** |

**When each rule applies:**

| Scenario | Which Rule | Example |
|----------|-----------|---------|
| Using `std::unique_ptr`, `std::vector`, `std::string` | ✅ Rule of Zero | `std::unique_ptr<int[]> data;` - no manual management |
| Managing raw pointers (C interface) | Rule of Five | `int* data = new int[100];` - must define all five |
| Legacy C++98 code | Rule of Three | No move semantics available |
| Implementing new RAII wrapper | Rule of Five | Creating custom smart pointer |

**Code example - Rule of Zero (MODERN APPROACH):**
```cpp
class ModernBuffer {
    std::unique_ptr<int[]> data;  // ✅ Automatic resource management
    size_t size;
public:
    ModernBuffer(size_t n) : data(std::make_unique<int[]>(n)), size(n) {}
    // ✅ No special member functions defined
    // unique_ptr provides correct move-only semantics automatically
};

// Usage:
ModernBuffer buf1(100);
// ModernBuffer buf2 = buf1;  // ❌ Error: not copyable (correct!)
ModernBuffer buf3 = std::move(buf1);  // ✅ Movable
```

---

#### 3. Why Copy Semantics Matter - Safety, Performance, and Correctness

**Common bugs from incorrect copy handling:**

| Bug Type | Cause | Symptom | Fix |
|----------|-------|---------|-----|
| **Double-deletion crash** | Shallow copy of pointers | Crash when second object destructs | Implement deep copy or use smart pointers |
| **Memory leak** | No cleanup in assignment | Growing memory usage | Implement proper assignment with cleanup |
| **Data corruption** | Self-assignment without check | Object corrupts itself | Add `if (this != &other)` check |
| **Use-after-free** | Dangling pointer after move | Crash or undefined behavior | Nullify pointers after move |
| **Performance degradation** | Unnecessary deep copies | Slow performance with large objects | Implement move semantics |

**Performance impact table:**

| Operation | With Copy Only | With Move Semantics | Speedup |
|-----------|---------------|-------------------|---------|
| Returning large vector from function | O(n) copy | O(1) pointer swap | 100x-1000x faster |
| Inserting into std::vector (reallocation) | O(n) copies | O(n) moves | 10x-100x faster |
| Swapping two large objects | 3 deep copies | 3 pointer swaps | 100x-1000x faster |
| Passing temporary to function | Copy temporary | Move temporary | No allocation |

**Self-assignment safety:**

| Scenario | Self-Assignment Possible? | Why? |
|----------|-------------------------|------|
| `obj = obj;` | Yes (obviously) | Direct self-assignment |
| `*ptr1 = *ptr2;` | Yes (if ptr1 == ptr2) | Aliased pointers |
| `arr[i] = arr[j];` | Yes (if i == j) | Array index aliasing |
| `container[key1] = container[key2];` | Yes (if key1 == key2) | Container aliasing |
| Generic algorithms | Yes (algorithm doesn't know) | `std::copy`, `std::swap`, etc. |

**Code example - self-assignment bug:**
```cpp
class Unsafe {
    int* data;
public:
    Unsafe& operator=(const Unsafe& other) {
        delete[] data;  // ❌ If this == &other, deleted own data!
        data = new int[100];
        std::copy(other.data, other.data + 100, data);  // ❌ Copying from deleted memory
        return *this;
    }
};

class Safe {
    int* data;
public:
    Safe& operator=(const Safe& other) {
        if (this != &other) {  // ✅ Self-assignment check
            delete[] data;
            data = new int[100];
            std::copy(other.data, other.data + 100, data);
        }
        return *this;
    }
};
```

**Key takeaway:** Follow Rule of Zero whenever possible using smart pointers and RAII. When managing raw resources, implement Rule of Five correctly with self-assignment checks, deep copying, and noexcept moves. Copy semantics bugs cause crashes, leaks, and corruption that are difficult to debug.

### EDGE_CASES: Tricky Scenarios and Deep Internals

#### Edge Case 1: Self-Assignment Safety

Self-assignment occurs when an object is assigned to itself: `obj = obj;`. While seemingly unlikely, it happens in generic code with aliases, references, and during algorithm operations. A naive copy assignment operator that deletes resources before copying can corrupt the object during self-assignment.

```cpp
class Unsafe {
    int* data;
public:
    Unsafe& operator=(const Unsafe& other) {
        delete[] data;  // ❌ Dangerous if this == &other
        data = new int[100];
        std::copy(other.data, other.data + 100, data);  // ❌ Copying from deleted memory
        return *this;
    }
};

class Safe {
    int* data;
public:
    Safe& operator=(const Safe& other) {
        if (this != &other) {  // ✅ Self-assignment check
            delete[] data;
            data = new int[100];
            std::copy(other.data, other.data + 100, data);
        }
        return *this;
    }
};
```

The standard idiom is to check `if (this != &other)` at the start of the assignment operator. Alternatively, use the copy-and-swap idiom, which is naturally self-assignment safe: create a temporary copy, then swap contents with it. The temporary's destructor cleans up the old resources. This technique also provides strong exception safety—if copying fails, the original object remains unchanged.

#### Edge Case 2: Copy Elision and Mandatory Optimization

Copy elision is a compiler optimization that eliminates copy/move operations, directly constructing objects in their final destination. Before C++17, it was optional; compilers could elide copies but weren't required to. C++17 made copy elision **mandatory** in certain cases, fundamentally changing the language semantics.

```cpp
class NoCopy {
public:
    NoCopy() = default;
    NoCopy(const NoCopy&) = delete;  // ❌ Copy deleted
    NoCopy(NoCopy&&) = delete;        // ❌ Move deleted
};

NoCopy factory() {
    return NoCopy();  // ✅ C++17: guaranteed elision, compiles
}

int main() {
    NoCopy obj = factory();  // ✅ No copy/move needed in C++17
}
```

Pre-C++17, this code wouldn't compile because the copy/move constructor must be accessible even if elided. C++17's guaranteed copy elision means the object is constructed directly in the caller's storage, so copy/move constructors don't need to exist. This changes observable behavior—copy/move constructor side effects no longer occur. Understanding when elision is guaranteed versus optional is crucial for reasoning about object lifetimes and performance.

#### Edge Case 3: Implicit Generation Suppression Rules

The compiler generates special member functions under complex interdependent rules. Defining one function can prevent generation of others, and these rules changed between C++98 and C++11, creating subtle version-dependent behavior.

```cpp
class Suppressed {
public:
    Suppressed(const Suppressed&) { }  // User-defined copy constructor
    // ❌ Move constructor NOT generated
    // ❌ Move assignment NOT generated
    // ✅ Copy assignment still generated (deprecated behavior)
};

class Modern {
public:
    Modern(Modern&&) = default;  // User-defined move constructor
    // ❌ Copy constructor NOT generated
    // ❌ Copy assignment NOT generated
    // ✅ Move assignment may be generated
};
```

Defining a copy constructor or copy assignment suppresses move operations. Defining move operations suppresses copy operations. Defining a destructor doesn't suppress copy operations in C++98 (for backward compatibility) but should, according to modern guidelines. This is why the Rule of Five exists—to explicitly control all special member functions rather than relying on complex implicit rules that vary by C++ version and compiler.

#### Edge Case 4: Object Slicing in Copy Operations

Object slicing occurs when copying a derived class object to a base class object, discarding the derived portion. This destroys polymorphic behavior because only the base part is copied, and the vtable pointer points to the base class.

```cpp
class Base {
public:
    int baseData;
    virtual void identify() { std::cout << "Base\n"; }
};

class Derived : public Base {
public:
    int derivedData;
    void identify() override { std::cout << "Derived\n"; }
};

void processBase(Base b) {  // ❌ Pass by value causes slicing
    b.identify();  // Always prints "Base"
}

int main() {
    Derived d;
    d.derivedData = 42;
    Base b = d;  // ❌ Slicing: derivedData lost, vtable changed
    b.identify();  // Prints "Base"
    
    processBase(d);  // ❌ Slicing in function parameter
}
```

Slicing is rarely intentional and usually indicates a design error. Prevent it by passing polymorphic objects by pointer or reference, making base class copy constructor protected or deleted, or using `std::reference_wrapper`. Slicing also occurs in containers—`std::vector<Base>` cannot hold Derived objects polymorphically; use `std::vector<std::unique_ptr<Base>>` instead.

#### Edge Case 5: Return Value and Named Return Value Optimization

Return Value Optimization (RVO) and Named Return Value Optimization (NRVO) eliminate copy/move operations when returning objects. RVO applies to returning temporaries; NRVO applies to returning named local variables. Understanding when these optimizations apply helps write efficient code.

```cpp
Object createRVO() {
    return Object();  // ✅ RVO: definitely elided in C++17
}

Object createNRVO() {
    Object local;
    // ... use local
    return local;  // ⚠️ NRVO: might be elided (not guaranteed)
}

Object ambiguousNRVO(bool condition) {
    Object a, b;
    return condition ? a : b;  // ❌ NRVO cannot apply (ambiguous)
}
```

RVO is guaranteed in C++17 for returning temporaries. NRVO is never guaranteed—if the compiler can't determine which object is returned at compile time, it cannot apply NRVO. Multiple return paths or conditional returns prevent NRVO. Using `std::move` on return values can prevent NRVO while forcing a move, potentially pessimizing performance. The best practice is to return local objects directly without `std::move` and let the compiler optimize.

#### Edge Case 6: Deleted Special Members and Copy Elision Interaction

Deleting copy/move constructors prevents explicit copying/moving, but doesn't prevent all object creation due to mandatory copy elision in C++17. This creates counterintuitive situations where objects with deleted constructors can still be returned and initialized.

```cpp
class Uncopyable {
public:
    Uncopyable() = default;
    Uncopyable(const Uncopyable&) = delete;
    Uncopyable(Uncopyable&&) = delete;
};

Uncopyable factory() {
    return Uncopyable();  // ✅ C++17: elision, no copy/move needed
}

Uncopyable createLocal() {
    Uncopyable local;
    return local;  // ❌ Error: NRVO not guaranteed, move needed but deleted
}

int main() {
    Uncopyable obj = factory();  // ✅ Works in C++17
}
```

Returning a temporary with deleted copy/move works due to mandatory elision. Returning a named local variable fails because NRVO isn't guaranteed, and the fallback move is deleted. This behavior is useful for types that should only be constructed in-place, like `std::atomic` or unique resource handles. However, it limits usage patterns—you cannot store them in containers or pass them through interfaces that require copying/moving.

### CODE_EXAMPLES: Practical Demonstrations

#### Example 1: Basic Copy Constructor and Assignment Operator

```cpp
class SimpleString {
    char* data;
    size_t length;
    
public:
    SimpleString(const char* str) {
        length = strlen(str);
        data = new char[length + 1];
        strcpy(data, str);
    }
    
    // ✅ Copy constructor - creates new object
    SimpleString(const SimpleString& other) 
        : length(other.length), data(new char[other.length + 1]) {
        strcpy(data, other.data);
        std::cout << "Copy constructor\n";
    }
    
    // ✅ Copy assignment operator - modifies existing object
    SimpleString& operator=(const SimpleString& other) {
        if (this != &other) {  // Self-assignment check
            delete[] data;  // Clean up old resource
            length = other.length;
            data = new char[length + 1];
            strcpy(data, other.data);
        }
        std::cout << "Copy assignment\n";
        return *this;
    }
    
    ~SimpleString() {
        delete[] data;
    }
};
```

This demonstrates the fundamental pattern: copy constructor allocates new resources and copies data, while assignment operator must first clean up existing resources before allocating and copying. The self-assignment check prevents disaster if an object is assigned to itself.

#### Example 2: Rule of Three Implementation

```cpp
class DynamicArray {
    int* data;
    size_t size;
    
public:
    DynamicArray(size_t n) : size(n), data(new int[n]) {
        std::fill(data, data + size, 0);
    }
    
    // ✅ Copy constructor
    DynamicArray(const DynamicArray& other)
        : size(other.size), data(new int[other.size]) {
        std::copy(other.data, other.data + size, data);
    }
    
    // ✅ Copy assignment operator
    DynamicArray& operator=(const DynamicArray& other) {
        if (this != &other) {
            delete[] data;
            size = other.size;
            data = new int[size];
            std::copy(other.data, other.data + size, data);
        }
        return *this;
    }
    
    // ✅ Destructor
    ~DynamicArray() {
        delete[] data;
    }
};
```

The Rule of Three is fully implemented: destructor releases resources, copy constructor performs deep copy, and copy assignment handles cleanup before copying. All three work together to ensure proper resource management throughout the object's lifetime.

#### Example 3: Rule of Five with Move Semantics

```cpp
class Buffer {
    char* data;
    size_t capacity;
    
public:
    Buffer(size_t n) : capacity(n), data(new char[n]) {}
    
    // Copy constructor
    Buffer(const Buffer& other)
        : capacity(other.capacity), data(new char[other.capacity]) {
        std::copy(other.data, other.data + capacity, data);
        std::cout << "Copy\n";
    }
    
    // Copy assignment
    Buffer& operator=(const Buffer& other) {
        if (this != &other) {
            delete[] data;
            capacity = other.capacity;
            data = new char[capacity];
            std::copy(other.data, other.data + capacity, data);
        }
        std::cout << "Copy assign\n";
        return *this;
    }
    
    // ✅ Move constructor
    Buffer(Buffer&& other) noexcept
        : capacity(other.capacity), data(other.data) {
        other.data = nullptr;  // ✅ Nullify source
        other.capacity = 0;
        std::cout << "Move\n";
    }
    
    // ✅ Move assignment
    Buffer& operator=(Buffer&& other) noexcept {
        if (this != &other) {
            delete[] data;  // Clean up current resource
            data = other.data;
            capacity = other.capacity;
            other.data = nullptr;  // ✅ Nullify source
            other.capacity = 0;
        }
        std::cout << "Move assign\n";
        return *this;
    }
    
    ~Buffer() {
        delete[] data;
    }
};
```

Move operations transfer ownership by stealing resources from the source object, which is left in a valid but empty state (nullified pointers). Move operations should be `noexcept` for optimal container performance—containers use move operations only if they're guaranteed not to throw.

#### Example 4: Copy-and-Swap Idiom

```cpp
class SafeResource {
    int* data;
    size_t size;
    
public:
    SafeResource(size_t n) : size(n), data(new int[n]) {}
    
    SafeResource(const SafeResource& other)
        : size(other.size), data(new int[other.size]) {
        std::copy(other.data, other.data + size, data);
    }
    
    // ✅ Copy-and-swap idiom
    SafeResource& operator=(SafeResource other) {  // Pass by value (copy)
        swap(other);  // Swap with temporary
        return *this;  // Temporary destroyed, cleaning up old data
    }
    
    void swap(SafeResource& other) noexcept {
        std::swap(data, other.data);
        std::swap(size, other.size);
    }
    
    ~SafeResource() {
        delete[] data;
    }
};
```

The copy-and-swap idiom provides strong exception safety and automatic self-assignment safety. The assignment operator takes its parameter by value (invoking copy constructor), then swaps contents. The temporary (containing the old data) is destroyed automatically, cleaning up resources. This elegant pattern combines assignment with the copy constructor's logic.

#### Example 5: Preventing Copying and Moving

```cpp
class Singleton {
public:
    static Singleton& getInstance() {
        static Singleton instance;
        return instance;
    }
    
    // ❌ Delete copy operations
    Singleton(const Singleton&) = delete;
    Singleton& operator=(const Singleton&) = delete;
    
    // ❌ Delete move operations
    Singleton(Singleton&&) = delete;
    Singleton& operator=(Singleton&&) = delete;
    
private:
    Singleton() = default;  // Private constructor
    ~Singleton() = default;
};
```

Explicitly deleting copy and move operations prevents object duplication, useful for singletons, resource managers, or types representing unique system resources. This is preferable to the old C++98 technique of declaring them private without definition.

#### Example 6: Rule of Zero with Smart Pointers

```cpp
class ModernBuffer {
    std::unique_ptr<int[]> data;  // ✅ Smart pointer manages memory
    size_t size;
    
public:
    ModernBuffer(size_t n) : data(std::make_unique<int[]>(n)), size(n) {}
    
    // ✅ No special member functions defined
    // unique_ptr is movable but not copyable
    // ModernBuffer inherits this behavior
    
    int& operator[](size_t i) { return data[i]; }
};

// Usage:
ModernBuffer buf1(100);
// ModernBuffer buf2 = buf1;  // ❌ Error: not copyable
ModernBuffer buf3 = std::move(buf1);  // ✅ OK: movable
```

Following the Rule of Zero, this class defines no special member functions. The unique_ptr automatically manages memory, provides move semantics, and prevents copying. The class inherits these properties naturally. This is the modern C++ approach—use RAII wrappers instead of manual resource management.

#### Example 7: Distinguishing Copy Constructor from Assignment

```cpp
class Demo {
public:
    Demo() { std::cout << "Default\n"; }
    Demo(const Demo&) { std::cout << "Copy ctor\n"; }
    Demo& operator=(const Demo&) { 
        std::cout << "Copy assign\n"; 
        return *this;
    }
};

int main() {
    Demo a;               // Default constructor
    Demo b = a;           // ✅ Copy constructor (initialization)
    Demo c(a);            // ✅ Copy constructor (explicit)
    
    Demo d;               // Default constructor
    d = a;                // ✅ Copy assignment (existing object)
    
    Demo e;
    e = Demo();           // Copy assignment (temporary)
}
```

The key distinction: `=` during declaration is initialization (copy constructor), while `=` for an existing object is assignment. This syntax confusion catches many developers. Parentheses notation `Demo c(a)` makes the copy constructor explicit.

#### Example 8: Self-Assignment Without Check

```cpp
class Dangerous {
    int* data;
public:
    Dangerous& operator=(const Dangerous& other) {
        delete[] data;  // ❌ Deletes resource
        data = new int[100];
        std::copy(other.data, other.data + 100, data);  // ❌ Copies from deleted memory
        return *this;
    }
};

class Safe {
    int* data;
public:
    Safe& operator=(const Safe& other) {
        if (this != &other) {  // ✅ Self-assignment check
            int* newData = new int[100];  // ✅ Allocate first
            std::copy(other.data, other.data + 100, newData);
            delete[] data;  // ✅ Delete old after copy succeeds
            data = newData;
        }
        return *this;
    }
};
```

The dangerous version fails on self-assignment because it deletes the resource before copying, corrupting itself. The safe version checks for self-assignment or allocates new resources before deleting old ones (strong exception safety). This demonstrates why self-assignment checks or copy-and-swap are essential.

#### Example 9: Autonomous Vehicle - SensorData with Rule of Five

```cpp
#include <iostream>
#include <cstring>
#include <algorithm>
using namespace std;

// Autonomous vehicle sensor data buffer with proper resource management
class SensorDataBuffer {
private:
    char* buffer;           // Raw data buffer (simulating sensor data)
    size_t capacity;        // Buffer capacity in bytes
    size_t data_size;       // Actual data size
    double timestamp_ms;    // Timestamp of data capture
    string sensor_name;     // Sensor identifier

public:
    // ✅ Parameterized Constructor
    SensorDataBuffer(const string& name, size_t size, double ts = 0.0)
        : capacity(size), data_size(0), timestamp_ms(ts), sensor_name(name) {
        buffer = new char[capacity];
        memset(buffer, 0, capacity);
        cout << "SensorDataBuffer: Allocated " << capacity
             << " bytes for " << sensor_name << endl;
    }

    // ✅ Copy Constructor - Deep copy for safety
    SensorDataBuffer(const SensorDataBuffer& other)
        : capacity(other.capacity),
          data_size(other.data_size),
          timestamp_ms(other.timestamp_ms),
          sensor_name(other.sensor_name + "_copy") {

        buffer = new char[capacity];
        memcpy(buffer, other.buffer, capacity);
        cout << "SensorDataBuffer: Copy constructed " << sensor_name
             << " (deep copy of " << capacity << " bytes)" << endl;
    }

    // ✅ Copy Assignment Operator - Self-assignment safe
    SensorDataBuffer& operator=(const SensorDataBuffer& other) {
        cout << "SensorDataBuffer: Copy assignment to " << sensor_name << endl;

        if (this != &other) {  // ✅ Self-assignment check
            // Allocate new buffer before deleting old (exception safety)
            char* new_buffer = new char[other.capacity];
            memcpy(new_buffer, other.buffer, other.capacity);

            // Now safe to delete old buffer
            delete[] buffer;

            // Update all members
            buffer = new_buffer;
            capacity = other.capacity;
            data_size = other.data_size;
            timestamp_ms = other.timestamp_ms;
            sensor_name = other.sensor_name;
        }
        return *this;
    }

    // ✅ Move Constructor - Efficient resource transfer
    SensorDataBuffer(SensorDataBuffer&& other) noexcept
        : buffer(other.buffer),
          capacity(other.capacity),
          data_size(other.data_size),
          timestamp_ms(other.timestamp_ms),
          sensor_name(move(other.sensor_name)) {

        // Nullify source to prevent double-deletion
        other.buffer = nullptr;
        other.capacity = 0;
        other.data_size = 0;

        cout << "SensorDataBuffer: Move constructed " << sensor_name
             << " (transferred ownership)" << endl;
    }

    // ✅ Move Assignment Operator
    SensorDataBuffer& operator=(SensorDataBuffer&& other) noexcept {
        cout << "SensorDataBuffer: Move assignment to " << sensor_name << endl;

        if (this != &other) {  // ✅ Self-assignment check
            // Clean up current resources
            delete[] buffer;

            // Transfer ownership from source
            buffer = other.buffer;
            capacity = other.capacity;
            data_size = other.data_size;
            timestamp_ms = other.timestamp_ms;
            sensor_name = move(other.sensor_name);

            // Nullify source
            other.buffer = nullptr;
            other.capacity = 0;
            other.data_size = 0;
        }
        return *this;
    }

    // ✅ Destructor - Release resources
    ~SensorDataBuffer() {
        if (buffer != nullptr) {
            cout << "SensorDataBuffer: Destroying " << sensor_name
                 << " (freeing " << capacity << " bytes)" << endl;
            delete[] buffer;
        } else {
            cout << "SensorDataBuffer: Destroying moved-from object" << endl;
        }
    }

    // Simulate writing sensor data
    void writeSensorData(const char* data, size_t len) {
        data_size = min(len, capacity);
        memcpy(buffer, data, data_size);
    }

    void printInfo() const {
        cout << "  [" << sensor_name << "] Capacity: " << capacity
             << "B, DataSize: " << data_size << "B, Timestamp: "
             << timestamp_ms << "ms" << endl;
    }

    const string& getName() const { return sensor_name; }
};

// Factory function that returns by value (demonstrates RVO)
SensorDataBuffer createLidarBuffer() {
    return SensorDataBuffer("lidar_front", 1024000, 1500.0);  // ✅ RVO in C++17
}

int main() {
    cout << "=== Demonstrating Copy vs Assignment ===" << endl;

    // 1. Initialization - calls copy constructor
    SensorDataBuffer original("camera_left", 512000, 1000.0);
    original.writeSensorData("IMAGE_DATA_12345", 16);

    cout << "\nCopy initialization (copy constructor):" << endl;
    SensorDataBuffer copy1 = original;  // ✅ Copy constructor

    cout << "\nAssignment to existing object (copy assignment):" << endl;
    SensorDataBuffer copy2("temp", 10);
    copy2 = original;  // ✅ Copy assignment operator

    cout << "\n=== Demonstrating Move Semantics ===" << endl;

    cout << "\nMove initialization (move constructor):" << endl;
    SensorDataBuffer moved1 = createLidarBuffer();  // ✅ RVO or move constructor

    cout << "\nMove assignment with std::move:" << endl;
    SensorDataBuffer radar("radar_rear", 256000, 2000.0);
    SensorDataBuffer moved2("placeholder", 10);
    moved2 = move(radar);  // ✅ Move assignment (radar is now empty)

    cout << "\n=== Demonstrating Self-Assignment Safety ===" << endl;
    copy1 = copy1;  // ✅ Self-assignment check prevents corruption

    cout << "\n=== Current State ===" << endl;
    original.printInfo();
    copy1.printInfo();
    copy2.printInfo();
    moved1.printInfo();
    moved2.printInfo();

    cout << "\n=== Destructors will now be called ===" << endl;
    return 0;
}
```

**Expected Output:**
```
=== Demonstrating Copy vs Assignment ===
SensorDataBuffer: Allocated 512000 bytes for camera_left

Copy initialization (copy constructor):
SensorDataBuffer: Copy constructed camera_left_copy (deep copy of 512000 bytes)

Assignment to existing object (copy assignment):
SensorDataBuffer: Allocated 10 bytes for temp
SensorDataBuffer: Copy assignment to temp

=== Demonstrating Move Semantics ===

Move initialization (move constructor):
SensorDataBuffer: Allocated 1024000 bytes for lidar_front

Move assignment with std::move:
SensorDataBuffer: Allocated 256000 bytes for radar_rear
SensorDataBuffer: Allocated 10 bytes for placeholder
SensorDataBuffer: Move assignment to placeholder
SensorDataBuffer: Destroying placeholder (freeing 10 bytes)

=== Demonstrating Self-Assignment Safety ===
SensorDataBuffer: Copy assignment to camera_left_copy

=== Current State ===
  [camera_left] Capacity: 512000B, DataSize: 16B, Timestamp: 1000ms
  [camera_left_copy] Capacity: 512000B, DataSize: 16B, Timestamp: 1000ms
  [camera_left] Capacity: 512000B, DataSize: 16B, Timestamp: 1000ms
  [lidar_front] Capacity: 1024000B, DataSize: 0B, Timestamp: 1500ms
  [radar_rear] Capacity: 256000B, DataSize: 0B, Timestamp: 2000ms

=== Destructors will now be called ===
SensorDataBuffer: Destroying moved-from object
SensorDataBuffer: Destroying radar_rear (freeing 256000 bytes)
SensorDataBuffer: Destroying lidar_front (freeing 1024000 bytes)
SensorDataBuffer: Destroying camera_left (freeing 512000 bytes)
SensorDataBuffer: Destroying camera_left_copy (freeing 512000 bytes)
SensorDataBuffer: Destroying camera_left (freeing 512000 bytes)
```

**What This Example Demonstrates:**

1. **Copy Constructor vs Copy Assignment**:
   - Copy constructor (`SensorDataBuffer copy1 = original`) creates a new object from an existing one
   - Copy assignment (`copy2 = original`) modifies an existing object, requiring cleanup first

2. **Rule of Five Complete Implementation**:
   - Destructor releases dynamically allocated buffer
   - Copy constructor performs deep copy (allocates new buffer)
   - Copy assignment handles self-assignment and strong exception safety
   - Move constructor transfers ownership (no allocation, just pointer transfer)
   - Move assignment cleans up old resource before transferring

3. **Self-Assignment Safety**:
   - Both copy and move assignment check `if (this != &other)` to prevent corruption
   - Copy assignment allocates new buffer before deleting old (strong exception safety)

4. **Move Semantics Performance**:
   - Move operations marked `noexcept` for optimal container performance
   - Source object nullified after move to prevent double-deletion
   - Move is O(1) pointer transfer vs O(n) memory copy

5. **Resource Management (RAII)**:
   - Constructor acquires resource (allocates buffer)
   - Destructor releases resource (deletes buffer)
   - All copies and moves properly manage ownership

6. **Real-World Autonomous Vehicle Context**:
   - Sensor data buffers are frequently copied for processing pipelines
   - Large buffers (256KB-1MB) make move semantics critical for performance
   - Proper resource management prevents memory leaks in long-running vehicle systems

**Why This Matters for Autonomous Vehicles**: In autonomous driving systems, sensor data flows through multiple processing stages (perception, fusion, planning). Efficiently managing large data buffers (camera images, LiDAR point clouds) requires understanding copy vs move semantics. Improper resource management can cause memory leaks in safety-critical systems that run for hours or days continuously.

### INTERVIEW_QA: Comprehensive Questions and Deep Concepts

#### Q1: What is the difference between a copy constructor and copy assignment operator?
**Difficulty:** #intermediate  
**Category:** #syntax #interview_favorite  
**Concepts:** #copy_constructor #assignment_operator #initialization #resource_management

**Answer:**
A copy constructor initializes a new object from an existing object during creation, while the copy assignment operator assigns to an already-existing object that may contain resources requiring cleanup.

**Code example:**
```cpp
MyClass a;
MyClass b = a;  // ✅ Copy constructor (initialization)
MyClass c;
c = a;          // ✅ Copy assignment (assignment to existing object)
```

**Explanation:**
The fundamental difference is object lifecycle stage. Copy constructor is called during initialization when the object doesn't yet exist, so there's no previous state to clean up. Copy assignment modifies an existing object that may hold resources needing cleanup before assigning new values. This is why assignment operators must guard against self-assignment and clean up old resources, while copy constructors simply initialize. The syntax `=` during declaration invokes the copy constructor, not assignment.

**Key takeaway:** Copy constructor creates new objects; copy assignment modifies existing objects requiring cleanup of old state.

---

#### Q2: What is the Rule of Three?
**Difficulty:** #intermediate  
**Category:** #design_pattern #interview_favorite  
**Concepts:** #rule_of_three #destructors #copy_constructor #assignment_operator #resource_management

**Answer:**
The Rule of Three states that if a class requires a user-defined destructor, copy constructor, or copy assignment operator, it almost certainly requires all three explicitly defined.

**Explanation:**
This rule exists because needing any one of these functions indicates the class manages a resource (memory, file handles, locks) requiring special handling. If the destructor releases a resource, the default shallow copy would create multiple objects pointing to the same resource, causing double-deletion when both objects are destroyed. Defining all three ensures consistent resource management throughout copy and destruction operations. Violating this rule is a common source of memory corruption and resource leaks.

**Key takeaway:** Classes managing resources must define destructor, copy constructor, and copy assignment together for safe resource handling.

---

#### Q3: What is the Rule of Five?
**Difficulty:** #intermediate  
**Category:** #design_pattern #interview_favorite  
**Concepts:** #rule_of_five #move_semantics #move_constructor #move_assignment #performance

**Answer:**
The Rule of Five extends the Rule of Three to include move constructor and move assignment operator, stating that if you define any of the five special member functions, you should define or explicitly delete all five.

**Code example:**
```cpp
class Resource {
public:
    ~Resource();
    Resource(const Resource&);
    Resource& operator=(const Resource&);
    Resource(Resource&&) noexcept;
    Resource& operator=(Resource&&) noexcept;
};
```

**Explanation:**
C++11 introduced move semantics for efficient resource transfer from temporaries. If you're managing resources and define copy operations, you should also consider move operations for performance. Defining moves without copies or vice versa creates incomplete semantics—users expect both copy and move to work or both to be explicitly unavailable. The compiler suppresses automatic generation of moves when you define copies, so you must explicitly provide them if desired. Mark move operations `noexcept` for optimal performance.

**Key takeaway:** Define all five special member functions (or explicitly delete them) when managing resources in C++11 and later.

---

#### Q4: What is the Rule of Zero?
**Difficulty:** #intermediate  
**Category:** #design_pattern #interview_favorite  
**Concepts:** #rule_of_zero #raii #smart_pointers #modern_cpp

**Answer:**
The Rule of Zero states that classes should not define any special member functions if possible, relying instead on member types' automatic resource management through RAII wrappers like smart pointers.

**Code example:**
```cpp
class GoodDesign {
    std::unique_ptr<int[]> data;  // ✅ Manages memory automatically
    std::string name;              // ✅ Manages string automatically
    // No special member functions defined
};
```

**Explanation:**
Modern C++ favors composition with standard library types that handle their own resource management. Using `unique_ptr`, `shared_ptr`, `vector`, and `string` instead of raw pointers eliminates the need for custom destructors and copy/move operations. The compiler-generated special members correctly handle member-wise operations. This approach is safer (no manual memory management), more maintainable (less code), and leverages well-tested standard library implementations. Only define special members when directly interfacing with C APIs or implementing new RAII wrappers.

**Key takeaway:** Prefer composing with RAII types over manual resource management; define no special member functions when possible.

---

#### Q5: Why must copy assignment operators check for self-assignment?
**Difficulty:** #intermediate  
**Category:** #memory #interview_favorite  
**Concepts:** #assignment_operator #self_assignment #undefined_behavior

**Answer:**
Self-assignment checks prevent corrupting the object when it's assigned to itself, which can happen when an assignment operator deletes resources before copying from the source that is the same object.

**Code example:**
```cpp
class Unsafe {
    int* data;
public:
    Unsafe& operator=(const Unsafe& other) {
        delete[] data;  // ❌ Deletes own data if this == &other
        data = new int[100];
        std::copy(other.data, other.data + 100, data);  // ❌ Copies from deleted memory
        return *this;
    }
};

class Safe {
    int* data;
public:
    Safe& operator=(const Safe& other) {
        if (this != &other) {  // ✅ Prevents self-assignment disaster
            delete[] data;
            data = new int[100];
            std::copy(other.data, other.data + 100, data);
        }
        return *this;
    }
};
```

**Explanation:**
Self-assignment (`obj = obj`) occurs in real code through aliases, references, and generic algorithms. Without a check, the typical pattern of "delete old, allocate new, copy from source" fails catastrophically when source and destination are the same object—you delete the data before copying it. The check `if (this != &other)` prevents this. Alternatively, use the copy-and-swap idiom which is naturally self-assignment safe through its design rather than explicit checking.

**Key takeaway:** Always check for self-assignment in copy assignment operators or use copy-and-swap for automatic protection.

---

#### Q6: What is the copy-and-swap idiom?
**Difficulty:** #advanced  
**Category:** #design_pattern #interview_favorite  
**Concepts:** #copy_and_swap #assignment_operator #exception_safety

**Answer:**
The copy-and-swap idiom implements copy assignment by taking the parameter by value (invoking copy constructor), swapping contents with it, and letting the temporary destroy the old data, providing strong exception safety and automatic self-assignment safety.

**Code example:**
```cpp
class Resource {
    int* data;
public:
    Resource& operator=(Resource other) {  // ✅ Pass by value
        swap(other);  // ✅ Swap contents
        return *this;  // other destroyed, cleaning old data
    }
    
    void swap(Resource& other) noexcept {
        std::swap(data, other.data);
    }
};
```

**Explanation:**
This elegant idiom leverages existing copy constructor logic and RAII. Passing by value creates a copy (via copy constructor), ensuring the new data is valid before modifying the object. Swapping is typically noexcept, so the operation is exception-safe—if copying fails, the original object is untouched. Self-assignment works correctly because swapping with a copy of yourself is harmless. The temporary parameter's destructor automatically cleans up the old data. This pattern is preferred in modern C++ for its simplicity and safety guarantees.

**Key takeaway:** Use copy-and-swap for assignment operators to achieve strong exception safety and self-assignment safety automatically.

---

#### Q7: When is the copy constructor called?
**Difficulty:** #beginner  
**Category:** #syntax  
**Concepts:** #copy_constructor #initialization #pass_by_value

**Answer:**
The copy constructor is called when initializing a new object from an existing object, passing objects by value to functions, and returning objects by value from functions (unless elided).

**Code example:**
```cpp
MyClass a;
MyClass b = a;       // ✅ Copy constructor
MyClass c(a);        // ✅ Copy constructor
func(a);             // ✅ Copy constructor (pass by value)
MyClass d = func();  // ✅ Copy constructor (return by value, if not elided)
```

**Explanation:**
Copy constructor is invoked whenever a new object must be created as a copy of an existing one. Initialization syntax using `=` or parentheses both call it. Passing by value creates a copy in the function's parameter space. Returning by value traditionally copies the return value to the caller (though modern compilers use RVO/NRVO to elide this). Note that copy elision can eliminate some of these calls, especially in C++17 where it's mandatory for temporaries.

**Key takeaway:** Copy constructors create new objects from existing ones during initialization, function parameters, and return values.

---

#### Q8: What is copy elision and when is it guaranteed?
**Difficulty:** #advanced  
**Category:** #optimization #interview_favorite  
**Concepts:** #copy_elision #rvo #nrvo #optimization

**Answer:**
Copy elision is a compiler optimization that eliminates copy/move operations by constructing objects directly in their final destination; in C++17, it's guaranteed when returning temporaries but optional for named objects.

**Code example:**
```cpp
Object factory() {
    return Object();  // ✅ C++17: guaranteed elision (RVO)
}

Object create() {
    Object local;
    return local;  // ⚠️ NRVO: optional elision
}
```

**Explanation:**
Return Value Optimization (RVO) eliminates copies when returning temporaries—C++17 makes this mandatory, fundamentally changing semantics so copy/move constructors don't even need to exist. Named Return Value Optimization (NRVO) applies to named local variables but is never guaranteed; compilers apply it when they can determine the single return object at compile time. Copy elision changes observable behavior by eliminating constructor calls, affecting object counting and side effects. This is why returning local objects by value is now the recommended practice, not `std::move`.

**Key takeaway:** C++17 guarantees copy elision for temporaries; trust the compiler and return local objects naturally without std::move.

---

#### Q9: Should you use std::move when returning local objects?
**Difficulty:** #intermediate  
**Category:** #performance  
**Concepts:** #move_semantics #rvo #return_value #optimization

**Answer:**
No, do not use std::move on return values—it prevents copy elision (RVO/NRVO) and can actually pessimize performance by forcing moves when the compiler would have elided operations entirely.

**Code example:**
```cpp
Object good() {
    Object local;
    return local;  // ✅ Allows RVO/NRVO
}

Object bad() {
    Object local;
    return std::move(local);  // ❌ Prevents NRVO, forces move
}
```

**Explanation:**
Returning local objects by name allows the compiler to apply NRVO, constructing the object directly in the caller's destination. Using `std::move` converts the return to an rvalue, preventing NRVO because you're not returning the variable itself but a moved-from version. The compiler then must use the move constructor instead of eliding. While move is cheaper than copy, elision is free—no operation at all. C++ intentionally treats local return values as rvalues without `std::move` to enable both elision and move as fallback.

**Key takeaway:** Return local objects by name without std::move; trust the compiler to elide or move automatically.

---

#### Q10: What is object slicing and how does it relate to copy operations?
**Difficulty:** #intermediate  
**Category:** #inheritance #interview_favorite  
**Concepts:** #object_slicing #copy_constructor #polymorphism #inheritance

**Answer:**
Object slicing occurs when copying a derived class object to a base class object by value, discarding the derived portion and destroying polymorphic behavior.

**Code example:**
```cpp
class Base {
public:
    virtual void func() { std::cout << "Base\n"; }
};

class Derived : public Base {
    int extraData;
public:
    void func() override { std::cout << "Derived\n"; }
};

Base b = Derived();  // ❌ Slicing: extraData lost, vtable changed
b.func();  // Prints "Base", not "Derived"
```

**Explanation:**
When assigning or initializing a base class object from a derived class object using copy operations, only the base portion is copied. The derived class data members are discarded, and the vtable pointer is set to the base class, losing all polymorphic behavior. This is almost never intentional. Prevent slicing by passing polymorphic objects by pointer or reference, making base class copy operations protected or deleted, or using containers of smart pointers rather than values.

**Key takeaway:** Avoid slicing by passing polymorphic types by pointer or reference, never by value.

---

#### Q11: What happens if you don't define a copy constructor for a class with a pointer member?
**Difficulty:** #intermediate  
**Category:** #memory #interview_favorite  
**Concepts:** #copy_constructor #shallow_copy #double_delete #undefined_behavior

**Answer:**
The compiler generates a default copy constructor that performs shallow copy, making multiple objects point to the same memory, causing double-deletion and corruption when both objects are destroyed.

**Code example:**
```cpp
class Dangerous {
    int* data;
public:
    Dangerous() : data(new int[100]) {}
    ~Dangerous() { delete[] data; }
    // ❌ No copy constructor defined
};

int main() {
    Dangerous a;
    Dangerous b = a;  // ❌ Shallow copy: both point to same memory
    // ❌ Double-delete when a and b are destroyed
}
```

**Explanation:**
The default copy constructor copies each member using its own copy semantics. For pointers, this means copying the pointer value (address), not the pointed-to data. Both objects end up with pointers to the same memory. When the first object is destroyed, it deletes the memory. The second object's destructor then attempts to delete already-freed memory, causing undefined behavior—typically a crash or heap corruption. This is why the Rule of Three exists: classes managing resources must define proper deep-copy constructors.

**Key takeaway:** Classes with pointer members need custom copy constructors for deep copying; default shallow copy causes double-deletion.

---

#### Q12: How do deleted copy operations affect movability?
**Difficulty:** #advanced  
**Category:** #syntax  
**Concepts:** #deleted_functions #move_semantics #copy_constructor

**Answer:**
Deleting copy operations doesn't automatically make a type movable—the compiler also suppresses move generation when copies are deleted unless moves are explicitly defined or defaulted.

**Code example:**
```cpp
class OnlyMovable {
public:
    OnlyMovable(const OnlyMovable&) = delete;
    OnlyMovable& operator=(const OnlyMovable&) = delete;
    OnlyMovable(OnlyMovable&&) = default;  // ✅ Must explicitly default
    OnlyMovable& operator=(OnlyMovable&&) = default;
};
```

**Explanation:**
Deleting copy operations doesn't imply move operations should exist—move operations require explicit declaration. The compiler's logic is conservative: if you deleted copies, you're indicating special handling is needed, so it won't generate moves automatically. To create a move-only type, explicitly delete copies AND explicitly default or define moves. This pattern is used for types like `unique_ptr` and `thread` that represent unique ownership or non-duplicable resources.

**Key takeaway:** Explicitly default move operations when creating move-only types; deleting copies doesn't automatically enable moves.

---

#### Q13: What is the significance of returning *this from assignment operators?
**Difficulty:** #intermediate  
**Category:** #syntax #design_pattern  
**Concepts:** #assignment_operator #operator_overloading #chaining

**Answer:**
Returning `*this` from assignment operators enables chaining assignments (`a = b = c`) and matches the behavior of built-in types, maintaining consistency with expected C++ semantics.

**Code example:**
```cpp
class MyClass {
public:
    MyClass& operator=(const MyClass& other) {
        if (this != &other) {
            // Copy logic
        }
        return *this;  // ✅ Enable chaining
    }
};

// Usage:
MyClass a, b, c;
a = b = c;  // ✅ Works due to return *this
```

**Explanation:**
Assignment operators should return a reference to the left-hand operand to support chained assignments, which are evaluated right-to-left. The expression `a = b = c` becomes `a.operator=(b.operator=(c))`, requiring each assignment to return a reference to the assigned object. Returning by value would create copies, defeating efficiency. Returning by reference maintains the object's identity. This convention matches built-in type behavior and is expected throughout the standard library and user code.

**Key takeaway:** Always return *this by reference from assignment operators to enable chaining and match built-in type behavior.

---

#### Q14: How does the compiler decide which special member functions to generate?
**Difficulty:** #advanced  
**Category:** #syntax #interview_favorite  
**Concepts:** #compiler_generated #special_members #rule_of_five

**Answer:**
The compiler generates special member functions based on complex interdependent rules: user-declaring any special member (destructor, copy/move operations) can suppress generation of others following the Rule of Five logic.

**Explanation:**
If no special members are declared, the compiler generates all (Rule of Zero scenario). Declaring a copy constructor or copy assignment suppresses move generation. Declaring move operations suppresses copy generation. Declaring a destructor doesn't suppress copies in C++98 (backward compatibility) but should according to modern guidelines. These rules prevent the compiler from generating potentially incorrect special members when you've indicated custom handling is needed. Understanding these rules is crucial because they changed between C++ versions, and relying on implicit generation can lead to subtle bugs.

**Key takeaway:** Declaring any special member function affects which others the compiler generates; prefer explicit declaration or deletion for clarity.

---

#### Q15: What is the difference between deleted and private special member functions?
**Difficulty:** #intermediate  
**Category:** #syntax  
**Concepts:** #deleted_functions #access_specifiers #move_semantics

**Answer:**
Deleted functions (C++11) produce clear compile errors at the call site and participate in overload resolution, while private functions (C++98) produce cryptic linker errors and don't participate in overload resolution.

**Code example:**
```cpp
class Modern {
public:
    Modern(const Modern&) = delete;  // ✅ Clear error message
};

class Old {
private:
    Old(const Old&);  // ❌ Private, linker error if friend tries to use
};
```

**Explanation:**
The old C++98 idiom of making special members private without definition prevented copying but had problems: member functions and friends could still call them (causing linker errors), and error messages were confusing. C++11's `= delete` is superior: it produces immediate compile errors with clear messages, works from any context (even member functions), and properly participates in overload resolution. Deleted functions are considered in overload resolution but cause errors if selected, enabling better SFINAE and template techniques.

**Key takeaway:** Use `= delete` instead of private declarations to prevent operations; it provides better errors and language semantics.

---

#### Q16: Can you have a class that is copyable but not movable?
**Difficulty:** #intermediate  
**Category:** #syntax  
**Concepts:** #copy_constructor #move_semantics #deleted_functions

**Answer:**
Yes, explicitly delete move operations while keeping copy operations available, though this is unusual since moves are typically at least as permissive as copies.

**Code example:**
```cpp
class CopyOnly {
public:
    CopyOnly(const CopyOnly&) = default;
    CopyOnly& operator=(const CopyOnly&) = default;
    CopyOnly(CopyOnly&&) = delete;  // ❌ Explicitly delete move
    CopyOnly& operator=(CopyOnly&&) = delete;
};
```

**Explanation:**
This pattern is rare because move operations are typically optimizations—if copying is safe, moving should be too. However, you might delete moves if moving would violate class invariants or if you want to force observable copy semantics for testing or debugging. More commonly, types are move-only (like `unique_ptr`) or both copyable and movable. When moves are deleted, temporaries fall back to copying if copies are available, potentially impacting performance.

**Key takeaway:** Classes can be copy-only by deleting moves, though this is unusual; typically moves are enabled if copies are.

---

#### Q17: What is the noexcept specifier's importance for move operations?
**Difficulty:** #advanced  
**Category:** #performance  
**Concepts:** #move_semantics #noexcept #exception_safety #stl_containers

**Answer:**
Marking move operations `noexcept` is critical for performance because standard library containers only use move operations (instead of copies) during reallocations if they're guaranteed not to throw.

**Code example:**
```cpp
class Optimized {
public:
    Optimized(Optimized&&) noexcept;  // ✅ Used by std::vector
    Optimized& operator=(Optimized&&) noexcept;
};

class Pessimized {
public:
    Optimized(Optimized&&);  // ❌ Not noexcept, vector copies instead
};
```

**Explanation:**
When `std::vector` needs to grow, it must move elements to new storage. If move operations can throw, strong exception safety is impossible—a failure mid-move would leave elements in inconsistent state. Therefore, vector only uses moves if they're `noexcept`, falling back to copies otherwise. Since most move operations just swap pointers and trivially cannot throw, mark them `noexcept`. This dramatically improves performance—moving is O(n) pointer swaps versus O(n) expensive copies. Forgetting `noexcept` on moves is a common performance bug.

**Key takeaway:** Always mark move operations noexcept when they truly can't throw to enable optimal container performance.

---

#### Q18: What happens if you don't implement a destructor for a class managing resources?
**Difficulty:** #beginner  
**Category:** #memory  
**Concepts:** #destructors #memory_leak #resource_management

**Answer:**
Without a destructor, resources are never released, causing memory leaks, resource leaks, and resource exhaustion as objects are destroyed without cleanup.

**Code example:**
```cpp
class Leaky {
    int* data;
public:
    Leaky() : data(new int[1000]) {}
    // ❌ No destructor
};

int main() {
    for (int i = 0; i < 1000; i++) {
        Leaky obj;  // ❌ Allocates 1000 ints
    }  // ❌ Memory never freed, leaks 1000*1000 ints
}
```

**Explanation:**
The default destructor performs memberwise destruction, calling destructors on class-type members but doing nothing for raw pointers. Allocated memory, opened files, network connections, locks—none are released automatically. This causes resource exhaustion: memory fills up, file handles are exhausted, locks remain held. The solution is defining a destructor that releases all resources, following RAII (Resource Acquisition Is Initialization) principles. Better yet, use smart pointers and RAII wrappers that handle cleanup automatically (Rule of Zero).

**Key takeaway:** Classes managing resources must define destructors to release them; prefer RAII wrappers like smart pointers to avoid manual management.

---

#### Q19: Can copy assignment operator call the copy constructor?
**Difficulty:** #intermediate  
**Category:** #design_pattern  
**Concepts:** #assignment_operator #copy_constructor #copy_and_swap

**Answer:**
Yes, through the copy-and-swap idiom where the assignment operator takes its parameter by value (invoking copy constructor), then swaps with it.

**Code example:**
```cpp
class Smart {
public:
    Smart(const Smart& other);  // Copy constructor
    
    Smart& operator=(Smart other) {  // ✅ Takes by value, calls copy ctor
        swap(other);
        return *this;
    }
    
    void swap(Smart& other) noexcept;
};
```

**Explanation:**
The traditional approach implements copy constructor and copy assignment separately with duplicated logic. The copy-and-swap idiom eliminates duplication: the assignment operator takes its parameter by value, which invokes the copy constructor automatically. Then it swaps contents with the temporary, and the temporary's destructor cleans up the old data. This provides strong exception safety (copying happens before modifying the object) and automatic self-assignment safety. It's elegant but may be less efficient for types where assignment can reuse existing capacity.

**Key takeaway:** Copy-and-swap idiom leverages the copy constructor in assignment implementation for safer, more maintainable code.

---

#### Q20: What is the impact of not following the Rule of Three/Five?
**Difficulty:** #intermediate  
**Category:** #memory #interview_favorite  
**Concepts:** #rule_of_three #rule_of_five #undefined_behavior #memory_leak

**Answer:**
Violating the Rule of Three/Five causes double-deletion crashes, memory leaks, resource leaks, data corruption, and unpredictable behavior due to shallow copies and improper resource management.

**Code example:**
```cpp
class Broken {
    char* buffer;
public:
    Broken() : buffer(new char[1024]) {}
    ~Broken() { delete[] buffer; }
    // ❌ No copy constructor or assignment
};

Broken a;
Broken b = a;  // ❌ Shallow copy
// ❌ Both destructors delete same memory
```

**Explanation:**
Without proper copy operations, the default shallow copy makes multiple objects share the same resource. The first destructor releases it, leaving other objects with dangling pointers. When they destruct, they attempt to release already-freed memory, causing crashes. If objects are assigned, old resources leak because the default assignment doesn't clean them up. Move operations are inefficient or broken if not implemented. These bugs are subtle, often appearing only under specific conditions, making them hard to debug. Following the rules eliminates these issues.

**Key takeaway:** Violating Rule of Three/Five causes memory corruption and leaks; always implement all special members together for resource-managing classes.

---

### PRACTICE_TASKS: Output Prediction and Behavior Analysis

#### Q1
```cpp
#include <iostream>
class A {
public:
    A() { std::cout << "Default\n"; }
    A(const A&) { std::cout << "Copy\n"; }
    A& operator=(const A&) { std::cout << "Assign\n"; return *this; }
};

int main() {
    A a1;
    A a2 = a1;
    A a3;
    a3 = a1;
}
```

#### Q2
```cpp
#include <iostream>
class A {
public:
    A& operator=(const A& other) {
        if (this == &other)
            std::cout << "Self-assignment\n";
        return *this;
    }
};

int main() {
    A a;
    a = a;
}
```

#### Q3
```cpp
#include <iostream>
class A {
public:
    A() { std::cout << "Default\n"; }
    A(const A&) { std::cout << "Copy\n"; }
};

A get() {
    return A();
}

int main() {
    A a = get();
}
```

#### Q4
```cpp
#include <iostream>
class A {
public:
    A() {}
    virtual void show() { std::cout << "A\n"; }
};

class B : public A {
public:
    void show() override { std::cout << "B\n"; }
};

int main() {
    B b;
    A a = b;
    a.show();
}
```

#### Q5
```cpp
#include <iostream>
class A {
public:
    A() = default;
    A(const A&) = delete;
};

int main() {
    A a1;
    A a2 = a1;
}
```

#### Q6
```cpp
#include <iostream>
class A {
public:
    A() = default;
    A(A&&) = delete;
};

A get() {
    return A();
}

int main() {
    A a = get();
}
```

#### Q7
```cpp
#include <iostream>
class A {
public:
    A() {}
    A(A&&) { std::cout << "Moved\n"; }
};

int main() {
    A a = A();
}
```

#### Q8
```cpp
#include <iostream>
class A {
public:
    A& operator=(A&&) {
        std::cout << "Move Assign\n";
        return *this;
    }
};

int main() {
    A a;
    a = A();
}
```

#### Q9
```cpp
#include <iostream>
class A {
    int* p;
public:
    A() { p = new int[10]; }
    A(const A& other) { p = new int[10]; }
};

int main() {
    A a1;
    A a2 = a1;
}
```

#### Q10
```cpp
#include <iostream>
class A {
    int* p;
public:
    A() { p = new int(5); }
    ~A() { delete p; }
};

int main() {
    A a1;
    A a2 = a1;
}
```

#### Q11
```cpp
#include <iostream>
class A {
    int* p;
public:
    A() { p = new int(5); }
    A(const A& other) { p = new int(*other.p); }
    A& operator=(const A& other) {
        if (this != &other) {
            delete p;
            p = new int(*other.p);
        }
        return *this;
    }
    ~A() { delete p; }
};

int main() {
    A a1;
    A a2 = a1;
    A a3;
    a3 = a2;
}
```

#### Q12
```cpp
#include <iostream>
class A {
public:
    A() {}
    A(const A&) { std::cout << "Copy\n"; }
    A(A&&) { std::cout << "Move\n"; }
};

A create() {
    A a;
    return std::move(a);
}

int main() {
    A a = create();
}
```

#### Q13
```cpp
#include <iostream>
class A {
public:
    A(const A&) { std::cout << "Copy\n"; }
};

void take(A a) {}

int main() {
    A a1;
    take(a1);
}
```

#### Q14
```cpp
#include <iostream>
class A {
public:
    ~A() { std::cout << "Destroyed\n"; }
};

int main() {
    A a1;
    A a2 = a1;
}
```

#### Q15
```cpp
#include <iostream>
class A {
public:
    A() = default;
    A(const A&) { std::cout << "Copy\n"; }
};

A make() {
    return A();
}

int main() {
    A a = make();
}
```

#### Q16
```cpp
#include <iostream>
class A {
public:
    A() = default;
    A(const A&) = delete;
};

A get() {
    return A();
}

int main() {
    A a = get();
}
```

#### Q17
```cpp
#include <iostream>
class A {
public:
    A() = default;
    A(A&&) { std::cout << "Move\n"; }
};

A get() {
    A a;
    return a;
}

int main() {
    A a = get();
}
```

#### Q18
```cpp
#include <iostream>
class A {
public:
    A() {}
    A(A&&) = delete;
    A(const A&) = delete;
};

A get() {
    return A();
}

int main() {
    A a = get();
}
```

#### Q19
```cpp
#include <iostream>
class A {
public:
    A() = default;
    A(const A&) = delete;
    A(A&&) = default;
};

A f() {
    A a;
    return a;
}

int main() {
    A a = f();
}
```

#### Q20
```cpp
#include <iostream>
class A {
    int* data;
public:
    A() { data = new int(5); }
    A(const A& rhs) { data = new int(*rhs.data); std::cout << "Deep Copy\n"; }
    ~A() { delete data; }
};

int main() {
    A a1;
    A a2 = a1;
}
```

#### Q21
```cpp
#include <iostream>
class A {
public:
    A() = default;
    ~A() = default;
};

class B {
    A a;
public:
    B(const B&) { std::cout << "Copy\n"; }
};

int main() {
    B b1;
    B b2 = b1;
}
```

#### Q22
```cpp
#include <iostream>
class A {
public:
    A() {}
    A(const A&) { std::cout << "Copy\n"; }
    A(A&&) { std::cout << "Move\n"; }
};

A create() {
    A a;
    return std::move(a);
}

int main() {
    A a = create();
}
```

#### Q23
```cpp
#include <iostream>
class A {
public:
    A() = default;
    A(const A&) = default;
    A& operator=(const A&) = delete;
};

int main() {
    A a1;
    A a2 = a1;
    a2 = a1;
}
```

#### Q24
```cpp
#include <iostream>
class A {
public:
    A() = default;
    ~A() = default;
    A(const A&) = delete;
};

void take(A a) {}

int main() {
    A a;
    take(a);
}
```

#### Q25
```cpp
#include <iostream>
class A {
public:
    A() { std::cout << "Ctor\n"; }
    A(const A&) { std::cout << "Copy\n"; }
    ~A() { std::cout << "Dtor\n"; }
};

A factory() {
    return A();
}

int main() {
    A obj = factory();
    std::cout << "End\n";
}
```

### QUICK_REFERENCE: Answer Keys and Summary Tables

#### Answer Key for Practice Questions

| Q# | Answer | Explanation | Key Concept |
|----|--------|-------------|-------------|
| 1 | Default<br>Copy<br>Default<br>Assign | a1 default constructed; a2 copy constructed from a1; a3 default constructed; a3 assigned from a1 | #copy_constructor #assignment_operator |
| 2 | Self-assignment | Assignment operator detects self-assignment and prints message | #self_assignment |
| 3 | Default<br>(likely) | RVO/copy elision likely eliminates copy; without optimization might show "Copy" | #copy_elision #rvo |
| 4 | A | Object slicing: only base part copied, vtable points to A, calls A::show | #object_slicing |
| 5 | Compilation Error | Copy constructor deleted, cannot copy a1 to a2 | #deleted_functions |
| 6 | Compiles in C++17 | Mandatory copy elision in C++17 for returning temporaries; pre-C++17 might error | #copy_elision #cpp17 |
| 7 | Moved<br>(or nothing) | Move constructor called; RVO may elide it entirely | #move_constructor #rvo |
| 8 | Move Assign | Temporary rvalue invokes move assignment operator | #move_assignment |
| 9 | No output<br>(memory leak) | Copy constructor allocates but no destructor, leaks memory | #memory_leak #rule_of_three |
| 10 | Runtime Error | Shallow copy (default); both objects delete same pointer causing double-free | #double_delete #shallow_copy |
| 11 | No output | Rule of Three correctly implemented; deep copies work, no leaks or double-free | #rule_of_three |
| 12 | Move | std::move forces move constructor; explicit move prevents NRVO | #move_semantics #std_move |
| 13 | Compilation Error | No default constructor defined; A a1 fails to compile | #default_constructor |
| 14 | Destroyed<br>Destroyed | Both objects destroyed; copy used default shallow copy (safe for this class) | #destructors |
| 15 | Default<br>(or Copy) | RVO likely elides; might show "Copy" without optimization | #copy_elision #rvo |
| 16 | Compiles in C++17 | Guaranteed copy elision for temporaries; copy constructor not needed | #copy_elision #cpp17 |
| 17 | Move<br>(or nothing) | NRVO may elide; otherwise move constructor called | #move_constructor #nrvo |
| 18 | Compilation Error | Both copy and move deleted; cannot return even with elision guarantee | #deleted_functions |
| 19 | Move<br>(or nothing) | Move available for fallback if NRVO doesn't apply | #move_semantics |
| 20 | Deep Copy | Rule of Three: copy constructor performs deep copy, destructor cleans up safely | #rule_of_three #deep_copy |
| 21 | Copy | User-defined copy constructor in B called | #copy_constructor |
| 22 | Move | std::move on return forces move constructor call | #move_semantics |
| 23 | Compilation Error | Copy assignment deleted; a2 = a1 fails | #deleted_functions #assignment_operator |
| 24 | Compilation Error | Copy constructor deleted; pass-by-value requires copy | #deleted_functions |
| 25 | Ctor<br>End<br>Dtor<br>(likely) | RVO constructs object directly; if elided shows only Ctor, End, Dtor | #copy_elision #rvo |

#### Copy Constructor vs Copy Assignment

| Aspect | Copy Constructor | Copy Assignment Operator |
|--------|------------------|-------------------------|
| Signature | `T(const T&)` | `T& operator=(const T&)` |
| When Called | Object initialization | Assignment to existing object |
| Syntax | `T b = a;` or `T b(a);` | `a = b;` (existing objects) |
| Return Type | None (constructor) | `T&` (reference to *this) |
| Self-Assignment Check | Not applicable | Required for safety |
| Previous State | No previous state | Must clean up old resources |
| Initialization List | Can use | Cannot use |

#### Rule of Three/Five/Zero Summary

| Rule | When to Apply | What to Define/Delete |
|------|--------------|----------------------|
| Rule of Zero | Class doesn't manage resources | Define nothing; use smart pointers and RAII |
| Rule of Three | Class manages resources (C++98) | Destructor, Copy Constructor, Copy Assignment |
| Rule of Five | Class manages resources (C++11+) | Destructor, Copy Ctor, Copy Assign, Move Ctor, Move Assign |

#### Special Member Function Generation Rules

| User Declares | Default Ctor | Destructor | Copy Ctor | Copy Assign | Move Ctor | Move Assign |
|--------------|--------------|------------|-----------|-------------|-----------|-------------|
| Nothing | ✅ Generated | ✅ Generated | ✅ Generated | ✅ Generated | ✅ Generated | ✅ Generated |
| Any Constructor | ❌ Not generated | ✅ Generated | ✅ Generated | ✅ Generated | ✅ Generated | ✅ Generated |
| Destructor | ✅ Generated | User-defined | ✅ Generated* | ✅ Generated* | ❌ Not generated | ❌ Not generated |
| Copy Constructor | ✅ Generated | ✅ Generated | User-defined | ✅ Generated | ❌ Not generated | ❌ Not generated |
| Copy Assignment | ✅ Generated | ✅ Generated | ✅ Generated | User-defined | ❌ Not generated | ❌ Not generated |
| Move Constructor | ✅ Generated | ✅ Generated | ❌ Not generated | ❌ Not generated | User-defined | ✅ Generated |
| Move Assignment | ✅ Generated | ✅ Generated | ❌ Not generated | ❌ Not generated | ✅ Generated | User-defined |

*Deprecated behavior; modern guidelines recommend against relying on this

#### Copy Elision Rules

| Scenario | C++14 and Earlier | C++17 and Later |
|----------|------------------|-----------------|
| Return temporary `return T();` | Optional (RVO) | Mandatory (guaranteed) |
| Return named local `return local;` | Optional (NRVO) | Optional (NRVO) |
| Initialize from temporary `T a = T();` | Optional | Mandatory |
| Pass temporary to function | Optional | Optional |
| Copy/move required to exist | Yes | No (for guaranteed cases) |

#### Best Practices Checklist

| Practice | Rationale |
|----------|-----------|
| Follow Rule of Zero when possible | Leverage automatic resource management; safer and more maintainable |
| Check self-assignment in copy assignment | Prevents corruption when `obj = obj` occurs |
| Return *this from assignment operators | Enables chaining and matches built-in type behavior |
| Mark move operations noexcept | Enables optimal container performance |
| Use copy-and-swap for assignment | Provides strong exception safety automatically |
| Don't use std::move on return values | Prevents copy elision; compiler handles optimization |
| Delete copy/move for unique resources | Makes non-copyable semantics explicit and compiler-enforced |
| Pass polymorphic objects by pointer/reference | Prevents object slicing |
| Use smart pointers instead of raw pointers | Automatic memory management following Rule of Zero |
| Explicitly default or delete special members | Makes intent clear; prevents accidental generation |

#### Common Pitfalls

| Pitfall | Problem | Solution |
|---------|---------|----------|
| Default shallow copy with pointers | Double-delete, memory corruption | Implement deep copy or use smart pointers |
| No self-assignment check | Object corruption on `obj = obj` | Check `if (this != &other)` or use copy-and-swap |
| Forgot destructor with new/delete | Memory leaks | Follow Rule of Three or use smart pointers |
| Forgot to return *this | Can't chain assignments | Always return *this from assignment |
| Missing noexcept on moves | Containers copy instead of move | Mark moves noexcept |
| std::move on return value | Prevents RVO/NRVO | Return local objects naturally |
| Object slicing in polymorphic code | Lost derived data, wrong behavior | Pass by pointer/reference |
| Defined only some of Rule of Five | Inconsistent or broken semantics | Define or delete all five |