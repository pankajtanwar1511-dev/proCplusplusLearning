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

### QUICK_REFERENCE: Answer Keys and Summary Tables

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
