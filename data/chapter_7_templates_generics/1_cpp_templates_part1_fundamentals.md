## TOPIC: Template Fundamentals and Specialization

### THEORY_SECTION: Core Template Concepts

#### What are Templates?

Templates are C++'s primary mechanism for **generic programming**, allowing you to write code that works with any data type without sacrificing type safety. They enable compile-time polymorphism by letting the compiler generate type-specific code from a single template definition. Templates are instantiated at compile time, meaning the compiler creates specific versions of the template for each type used.

#### Function Templates

**Function templates** allow writing generic functions where types are parameters. The compiler performs **type deduction** from function arguments, or you can explicitly specify template arguments. Function templates support overloading and can coexist with non-template functions in the same overload set.

#### Class Templates

**Class templates** enable generic data structures and components. Unlike function templates, class templates require explicit template argument specification when instantiating objects (pre-C++17). They can have member function templates, nested types, and static members that are instantiated per-template specialization.

#### Why Templates Matter

Templates are fundamental to modern C++ design, forming the backbone of the Standard Template Library (STL). They enable zero-overhead abstractions by moving work to compile time rather than runtime. Understanding templates is essential for writing efficient, reusable code and is heavily tested in technical interviews. Templates also enable advanced techniques like template metaprogramming, policy-based design, and compile-time computations.

---

### EDGE_CASES: Tricky Scenarios and Gotchas

#### Edge Case 1: Template Instantiation is Lazy

The compiler only instantiates template code that is actually used. This means template code with errors won't cause compilation failures unless that specific instantiation is triggered.

```cpp
template<typename T>
void onlyForInt(T x) {
    static_assert(std::is_same<T, int>::value, "Only for int");  // ✅ Compile-time check
}

int main() {
    onlyForInt(5);        // ✅ OK - compiles and runs
    // onlyForInt("abc"); // ❌ Error only if uncommented
}
```

This behavior allows templates to contain code that's invalid for some types, as long as those types never actually use that code path. This is exploited in SFINAE and concept-like programming.

#### Edge Case 2: Function Template Overloading Priority

When both template and non-template functions exist in an overload set, non-template functions are preferred if they match exactly. Templates are only selected when no exact non-template match exists.

```cpp
void print(int x) {
    std::cout << "int: " << x << "\n";  // ✅ Non-template version
}

template<typename T>
void print(T x) {
    std::cout << "template: " << x << "\n";  // ✅ Template version
}

int main() {
    print(5);         // ✅ Calls non-template (exact match)
    print(5.0);       // ✅ Calls template (no exact match for double)
    print("test");    // ✅ Calls template
}
```

This priority system prevents templates from hijacking function calls when more specific implementations exist. However, it can cause subtle bugs if type conversions are involved.

#### Edge Case 3: Template Argument Deduction with References

Template argument deduction behaves differently with references, potentially preserving or discarding const and reference qualifiers depending on the parameter type.

```cpp
template<typename T>
void func1(T param) { }        // ✅ T deduced without reference

template<typename T>
void func2(T& param) { }       // ✅ T deduced, param is reference

template<typename T>
void func3(T&& param) { }      // ✅ Universal reference (forwarding reference)

int main() {
    int x = 42;
    const int cx = x;
    
    func1(cx);   // T = int (const discarded)
    func2(cx);   // T = const int (const preserved)
    func3(x);    // T = int& (lvalue)
    func3(42);   // T = int (rvalue)
}
```

Understanding these deduction rules is critical for writing correct generic code, especially when dealing with perfect forwarding and move semantics.

#### Edge Case 4: Two-Phase Name Lookup

Templates undergo two-phase compilation: first at definition (checking template syntax), second at instantiation (checking type-dependent expressions). This affects when errors are caught.

```cpp
template<typename T>
void process(T x) {
    helper(x);  // ✅ Lookup happens at instantiation
}

void helper(int x) { std::cout << x << "\n"; }

int main() {
    process(42);  // ✅ Finds helper through ADL at instantiation
}
```

If `helper` is only defined after the template, the code still compiles because lookup is deferred. However, this can lead to confusing error messages when instantiation fails.

#### Edge Case 5: Default Arguments Must Be Rightmost

Template parameters with default arguments must appear after all parameters without defaults, similar to function parameter rules.

```cpp
template<typename T = int, typename U>  // ❌ Error: U has no default after T
struct Bad { };

template<typename T, typename U = int>  // ✅ Correct: defaults are rightmost
struct Good { };
```

This restriction ensures the compiler can unambiguously match template arguments to parameters when fewer arguments are provided than parameters exist.

---

### CODE_EXAMPLES: Practical Demonstrations

#### Example 1: Basic Function Template with Type Deduction

```cpp
template<typename T>
T add(T a, T b) {
    return a + b;  // ✅ Generic addition
}

int main() {
    std::cout << add(3, 4) << "\n";         // ✅ T = int, returns 7
    std::cout << add(2.5, 3.7) << "\n";     // ✅ T = double, returns 6.2
    std::cout << add<int>(2.5, 3.7) << "\n"; // ✅ Explicit T = int, returns 5
}
```

The compiler deduces `T` from the function arguments. When both arguments have the same type, deduction succeeds. Explicit template arguments can override deduction and force type conversions.

#### Example 2: Class Template for Generic Container

```cpp
template<typename T>
class Box {
    T value;
public:
    Box(T val) : value(val) { }  // ✅ Constructor
    
    T get() const { return value; }  // ✅ Getter
    
    void set(T val) { value = val; }  // ✅ Setter
};

int main() {
    Box<int> intBox(10);              // ✅ Box holding int
    Box<std::string> strBox("hello");  // ✅ Box holding string
    
    std::cout << intBox.get() << "\n";  // 10
    std::cout << strBox.get() << "\n";  // hello
}
```

Class templates require explicit type specification at instantiation. Each instantiation creates a separate class with its own static members and member functions specialized for that type.

#### Example 3: Full Template Specialization

```cpp
template<typename T>
struct Printer {
    static void print(T value) {
        std::cout << "Generic: " << value << "\n";  // ✅ Primary template
    }
};

template<>
struct Printer<bool> {
    static void print(bool value) {
        std::cout << "Bool: " << (value ? "true" : "false") << "\n";  // ✅ Specialized for bool
    }
};

int main() {
    Printer<int>::print(42);      // Generic: 42
    Printer<bool>::print(true);   // Bool: true
}
```

Full specialization provides a completely custom implementation for specific types. The `template<>` syntax indicates this is a specialization, not a new template. Specializations must be declared after the primary template.

#### Example 4: Partial Specialization for Pointers

```cpp
template<typename T>
struct TypeTraits {
    static const bool is_pointer = false;  // ✅ Primary template
    static void print() { std::cout << "Not a pointer\n"; }
};

template<typename T>
struct TypeTraits<T*> {
    static const bool is_pointer = true;  // ✅ Specialization for pointers
    static void print() { std::cout << "Pointer type\n"; }
};

int main() {
    TypeTraits<int>::print();   // Not a pointer
    TypeTraits<int*>::print();  // Pointer type
    
    std::cout << TypeTraits<double>::is_pointer << "\n";   // 0
    std::cout << TypeTraits<double*>::is_pointer << "\n";  // 1
}
```

Partial specialization matches a subset of possible template arguments using pattern matching. The `T*` pattern matches any pointer type, binding `T` to the pointed-to type. This enables type trait implementations.

#### Example 5: Partial Specialization with Multiple Parameters

```cpp
template<typename T, typename U>
struct Pair {
    static void print() { std::cout << "Generic Pair\n"; }
};

template<typename T>
struct Pair<T, T> {
    static void print() { std::cout << "Same type Pair\n"; }  // ✅ Both types identical
};

template<typename T>
struct Pair<T, int> {
    static void print() { std::cout << "Second is int\n"; }  // ✅ Second parameter is int
};

int main() {
    Pair<double, char>::print();  // Generic Pair
    Pair<int, int>::print();      // Same type Pair
    Pair<float, int>::print();    // Second is int
}
```

Multiple partial specializations can coexist. The compiler selects the most specific match. If multiple specializations match equally, the code is ambiguous and won't compile.

#### Example 6: Default Template Arguments in Class Template

```cpp
template<typename T = int, typename U = double>
class Container {
    T first;
    U second;
public:
    Container(T f = T(), U s = U()) : first(f), second(s) { }
    
    void print() const {
        std::cout << first << ", " << second << "\n";
    }
};

int main() {
    Container<> c1;                    // ✅ T = int, U = double (both defaults)
    Container<float> c2(1.5f);         // ✅ T = float, U = double (U default)
    Container<char, bool> c3('A', true); // ✅ T = char, U = bool (explicit)
    
    c1.print();  // 0, 0
    c2.print();  // 1.5, 0
    c3.print();  // A, 1
}
```

Default template arguments simplify common use cases by providing sensible defaults. Users can override defaults by providing explicit arguments. All defaults must be rightmost in the parameter list.

#### Example 7: Non-Type Template Parameters

```cpp
template<typename T, size_t N>
class FixedArray {
    T data[N];  // ✅ Array size is compile-time constant
public:
    size_t size() const { return N; }
    
    T& operator[](size_t index) { return data[index]; }
    const T& operator[](size_t index) const { return data[index]; }
};

int main() {
    FixedArray<int, 5> arr;     // ✅ Array of 5 ints
    arr[0] = 10;
    arr[1] = 20;
    
    std::cout << "Size: " << arr.size() << "\n";  // Size: 5
    std::cout << arr[0] << ", " << arr[1] << "\n"; // 10, 20
}
```

Non-type template parameters accept compile-time constants like integers, pointers, or references. They enable compile-time computation and zero-overhead abstractions by embedding values in types. The array size is known at compile time, enabling stack allocation.

#### Example 8: Template Metaprogramming with Non-Type Parameters

```cpp
template<int N>
struct Factorial {
    static constexpr int value = N * Factorial<N - 1>::value;  // ✅ Recursive computation
};

template<>
struct Factorial<0> {
    static constexpr int value = 1;  // ✅ Base case
};

int main() {
    std::cout << Factorial<5>::value << "\n";  // 120 (computed at compile time)
    std::cout << Factorial<10>::value << "\n"; // 3628800
    
    constexpr int result = Factorial<7>::value;  // ✅ Can be used in constant expressions
}
```

Template recursion combined with specialization enables compile-time computations. The compiler evaluates `Factorial<5>::value` during compilation, generating no runtime overhead. This technique forms the basis of template metaprogramming.

#### Example 9: Autonomous Vehicle - Generic Sensor Fusion System with Templates

This comprehensive example demonstrates template fundamentals in an autonomous vehicle sensor fusion context, showing function templates, class templates, specialization, and compile-time optimizations for sensor processing.

```cpp
#include <iostream>
#include <vector>
#include <array>
#include <cmath>
#include <memory>
#include <string>

// ============================================================================
// Part 1: Function Templates for Generic Sensor Data Processing
// ============================================================================

// Function template for averaging sensor readings
template<typename T>
T average(const std::vector<T>& values) {
    if (values.empty()) return T{};  // Value-initialization

    T sum = T{};
    for (const auto& val : values) {
        sum = sum + val;  // Requires operator+
    }
    return sum / static_cast<T>(values.size());  // Requires operator/
}

// Function template overloading for different sensor data types
template<typename T>
void processSensorReading(T value) {
    std::cout << "Generic sensor: " << value << "\n";
}

// Specialized overload for float (high-precision sensors)
template<>
void processSensorReading<float>(float value) {
    std::cout << "High-precision sensor: " << value << " (validated)\n";
}

// Non-template overload (takes precedence for exact int match)
void processSensorReading(int value) {
    std::cout << "Integer sensor (discrete): " << value << "\n";
}

// ============================================================================
// Part 2: Class Template for Generic Circular Buffer (Sensor History)
// ============================================================================

template<typename T, size_t Capacity>
class CircularBuffer {
    std::array<T, Capacity> buffer;  // Fixed-size array
    size_t head{0};
    size_t size{0};

public:
    void push(const T& value) {
        buffer[head] = value;
        head = (head + 1) % Capacity;
        if (size < Capacity) ++size;
    }

    size_t getSize() const { return size; }
    size_t getCapacity() const { return Capacity; }

    T getAverage() const {
        if (size == 0) return T{};
        T sum = T{};
        for (size_t i = 0; i < size; ++i) {
            sum = sum + buffer[i];
        }
        return sum / static_cast<T>(size);
    }

    // Access the most recent N elements
    std::vector<T> getRecent(size_t count) const {
        std::vector<T> result;
        count = (count > size) ? size : count;

        for (size_t i = 0; i < count; ++i) {
            size_t index = (head + Capacity - count + i) % Capacity;
            result.push_back(buffer[index]);
        }
        return result;
    }
};

// ============================================================================
// Part 3: Full Specialization for Specific Sensor Types
// ============================================================================

// Primary template for sensor value validation
template<typename T>
struct SensorValidator {
    static bool isValid(T value, T min, T max) {
        return value >= min && value <= max;
    }

    static void printType() {
        std::cout << "Generic sensor validator\n";
    }
};

// Full specialization for boolean sensors (binary: true/false)
template<>
struct SensorValidator<bool> {
    static bool isValid(bool value, bool, bool) {
        // Boolean sensors are always "valid" (no range check needed)
        return true;
    }

    static void printType() {
        std::cout << "Boolean sensor validator (binary)\n";
    }
};

// ============================================================================
// Part 4: Partial Specialization for Pointer Types
// ============================================================================

// Primary template for sensor data
template<typename T>
struct SensorData {
    T value;
    uint64_t timestamp;

    void print() const {
        std::cout << "Value: " << value << ", Timestamp: " << timestamp << "\n";
    }

    static const char* getCategory() { return "Direct sensor"; }
};

// Partial specialization for pointer types (indirect/reference sensors)
template<typename T>
struct SensorData<T*> {
    T* value;
    uint64_t timestamp;

    void print() const {
        if (value) {
            std::cout << "Value (via pointer): " << *value
                      << ", Timestamp: " << timestamp << "\n";
        } else {
            std::cout << "Null pointer sensor data\n";
        }
    }

    static const char* getCategory() { return "Indirect/Reference sensor"; }
};

// ============================================================================
// Part 5: Non-Type Template Parameters for Compile-Time Sensor Configuration
// ============================================================================

// Sensor fusion with compile-time weights
template<typename T, size_t NumSensors>
class WeightedSensorFusion {
    std::array<T, NumSensors> weights;
    std::array<T, NumSensors> readings;

public:
    WeightedSensorFusion(const std::array<T, NumSensors>& w) : weights(w) {
        // Normalize weights at construction
        T sum = T{};
        for (const auto& weight : weights) {
            sum = sum + weight;
        }
        for (auto& weight : weights) {
            weight = weight / sum;
        }
    }

    void setReadings(const std::array<T, NumSensors>& r) {
        readings = r;
    }

    T getFusedValue() const {
        T result = T{};
        for (size_t i = 0; i < NumSensors; ++i) {
            result = result + (readings[i] * weights[i]);
        }
        return result;
    }

    constexpr size_t getSensorCount() const { return NumSensors; }
};

// ============================================================================
// Part 6: Template Metaprogramming for Compile-Time Sensor Calibration
// ============================================================================

// Compute calibration scale factor at compile time
template<int RawMax, int PhysicalMax>
struct CalibrationScale {
    static constexpr double value =
        static_cast<double>(PhysicalMax) / static_cast<double>(RawMax);
};

// Recursive template for computing power (for polynomial calibration)
template<int Base, unsigned Exp>
struct Power {
    static constexpr int value = Base * Power<Base, Exp - 1>::value;
};

template<int Base>
struct Power<Base, 0> {
    static constexpr int value = 1;
};

// ============================================================================
// Part 7: Default Template Arguments for Common Sensor Configurations
// ============================================================================

template<typename T = double, typename TimestampType = uint64_t, size_t BufferSize = 10>
class GenericSensor {
    CircularBuffer<T, BufferSize> history;
    TimestampType last_update{0};
    std::string sensor_id;

public:
    GenericSensor(const std::string& id) : sensor_id(id) {}

    void addReading(T value, TimestampType timestamp) {
        history.push(value);
        last_update = timestamp;
    }

    T getAverage() const {
        return history.getAverage();
    }

    void printInfo() const {
        std::cout << "Sensor: " << sensor_id
                  << ", Buffer: " << BufferSize
                  << " readings, Last update: " << last_update << "\n";
    }
};

// ============================================================================
// Part 8: Partial Specialization for Multi-Parameter Templates
// ============================================================================

// Primary template for sensor pairs
template<typename T1, typename T2>
struct SensorPair {
    static void printTypes() {
        std::cout << "Generic sensor pair\n";
    }
};

// Partial specialization: both sensors same type
template<typename T>
struct SensorPair<T, T> {
    static void printTypes() {
        std::cout << "Homogeneous sensor pair (same type)\n";
    }
};

// Partial specialization: second sensor is always double
template<typename T>
struct SensorPair<T, double> {
    static void printTypes() {
        std::cout << "Sensor pair (first: varied, second: double)\n";
    }
};

// ============================================================================
// Main: Demonstrating All Template Concepts in AV Context
// ============================================================================

int main() {
    std::cout << "=== Autonomous Vehicle Sensor Fusion: Template Fundamentals ===\n\n";

    // 1. Function template with type deduction
    std::cout << "=== Function Template Type Deduction ===\n";
    std::vector<double> lidar_distances = {10.5, 11.2, 10.8, 11.0};
    std::cout << "LiDAR average distance: " << average(lidar_distances) << " m\n";

    std::vector<int> camera_confidence = {85, 90, 88, 92};
    std::cout << "Camera confidence average: " << average(camera_confidence) << "%\n\n";

    // 2. Function template overloading and specialization
    std::cout << "=== Function Template Overloading ===\n";
    processSensorReading(42);        // Calls non-template (exact match)
    processSensorReading(3.14);      // Calls generic template
    processSensorReading(2.5f);      // Calls specialized template<>
    std::cout << "\n";

    // 3. Class template with non-type parameter
    std::cout << "=== Circular Buffer (Class Template + Non-Type Parameter) ===\n";
    CircularBuffer<double, 5> speedBuffer;
    speedBuffer.push(15.0);
    speedBuffer.push(16.5);
    speedBuffer.push(15.8);
    speedBuffer.push(16.2);
    speedBuffer.push(15.5);
    speedBuffer.push(17.0);  // Overwrites oldest

    std::cout << "Speed buffer capacity: " << speedBuffer.getCapacity() << "\n";
    std::cout << "Speed buffer size: " << speedBuffer.getSize() << "\n";
    std::cout << "Average speed: " << speedBuffer.getAverage() << " m/s\n\n";

    // 4. Full specialization
    std::cout << "=== Full Template Specialization ===\n";
    SensorValidator<double>::printType();
    std::cout << "Temperature valid (20.5°C): "
              << SensorValidator<double>::isValid(20.5, -40.0, 85.0) << "\n";

    SensorValidator<bool>::printType();
    std::cout << "Door sensor valid: "
              << SensorValidator<bool>::isValid(true, false, true) << "\n\n";

    // 5. Partial specialization for pointers
    std::cout << "=== Partial Specialization for Pointers ===\n";
    SensorData<double> directSensor{45.7, 1000000};
    directSensor.print();
    std::cout << "Category: " << SensorData<double>::getCategory() << "\n";

    double temp_value = 22.3;
    SensorData<double*> indirectSensor{&temp_value, 1000100};
    indirectSensor.print();
    std::cout << "Category: " << SensorData<double*>::getCategory() << "\n\n";

    // 6. Weighted sensor fusion with non-type parameter
    std::cout << "=== Weighted Sensor Fusion (Non-Type Parameters) ===\n";
    WeightedSensorFusion<double, 3> fusion({0.5, 0.3, 0.2});  // 3 sensors
    fusion.setReadings({15.0, 15.5, 16.0});  // Speed readings from 3 sources
    std::cout << "Fused speed value: " << fusion.getFusedValue() << " m/s\n";
    std::cout << "Number of sensors: " << fusion.getSensorCount() << "\n\n";

    // 7. Template metaprogramming: compile-time calibration
    std::cout << "=== Template Metaprogramming (Compile-Time Computation) ===\n";
    constexpr double scale = CalibrationScale<4095, 100>::value;
    std::cout << "ADC calibration scale (12-bit -> 100 units): " << scale << "\n";

    constexpr int power_result = Power<2, 10>::value;
    std::cout << "2^10 (computed at compile time): " << power_result << "\n\n";

    // 8. Default template arguments
    std::cout << "=== Default Template Arguments ===\n";
    GenericSensor<> sensor1("LiDAR_Front");           // All defaults
    GenericSensor<float> sensor2("Camera_Front");      // Custom value type
    GenericSensor<int, uint32_t, 20> sensor3("IMU");   // All custom

    sensor1.addReading(12.5, 1000);
    sensor1.addReading(13.0, 1001);
    sensor1.printInfo();
    std::cout << "Average: " << sensor1.getAverage() << "\n\n";

    // 9. Partial specialization with multiple parameters
    std::cout << "=== Partial Specialization (Multiple Parameters) ===\n";
    SensorPair<int, float>::printTypes();     // Generic
    SensorPair<double, double>::printTypes(); // Both same
    SensorPair<int, double>::printTypes();    // Second is double
    std::cout << "\n";

    // 10. Demonstrate template type deduction ambiguity resolution
    std::cout << "=== Explicit Template Arguments (Resolving Ambiguity) ===\n";
    std::vector<double> mixed_data = {10, 11.5, 12};  // Mixed int/double
    // average({10, 11.5, 12});  // Would fail: ambiguous types
    std::cout << "Mixed data average (explicit <double>): "
              << average<double>({10, 11.5, 12}) << "\n";

    std::cout << "\n=== Summary: Template Features Demonstrated ===\n";
    std::cout << "✓ Function templates with automatic type deduction\n";
    std::cout << "✓ Function template specialization and overloading\n";
    std::cout << "✓ Class templates with type and non-type parameters\n";
    std::cout << "✓ Full specialization for specific types\n";
    std::cout << "✓ Partial specialization (pointers, multi-parameter)\n";
    std::cout << "✓ Default template arguments\n";
    std::cout << "✓ Template metaprogramming (compile-time computation)\n";
    std::cout << "✓ Non-type parameters for compile-time configuration\n";

    return 0;
}
```

**Output:**
```
=== Autonomous Vehicle Sensor Fusion: Template Fundamentals ===

=== Function Template Type Deduction ===
LiDAR average distance: 10.875 m
Camera confidence average: 88%

=== Function Template Overloading ===
Integer sensor (discrete): 42
Generic sensor: 3.14
High-precision sensor: 2.5 (validated)

=== Circular Buffer (Class Template + Non-Type Parameter) ===
Speed buffer capacity: 5
Speed buffer size: 5
Average speed: 16.2 m/s

=== Full Template Specialization ===
Generic sensor validator
Temperature valid (20.5°C): 1
Boolean sensor validator (binary)
Door sensor valid: 1

=== Partial Specialization for Pointers ===
Value: 45.7, Timestamp: 1000000
Category: Direct sensor
Value (via pointer): 22.3, Timestamp: 1000100
Category: Indirect/Reference sensor

=== Weighted Sensor Fusion (Non-Type Parameters) ===
Fused speed value: 15.25 m/s
Number of sensors: 3

=== Template Metaprogramming (Compile-Time Computation) ===
ADC calibration scale (12-bit -> 100 units): 0.0244200
2^10 (computed at compile time): 1024

=== Default Template Arguments ===
Sensor: LiDAR_Front, Buffer: 10 readings, Last update: 1001
Average: 12.75

=== Partial Specialization (Multiple Parameters) ===
Generic sensor pair
Homogeneous sensor pair (same type)
Sensor pair (first: varied, second: double)

=== Explicit Template Arguments (Resolving Ambiguity) ===
Mixed data average (explicit <double>): 11.1667

=== Summary: Template Features Demonstrated ===
✓ Function templates with automatic type deduction
✓ Function template specialization and overloading
✓ Class templates with type and non-type parameters
✓ Full specialization for specific types
✓ Partial specialization (pointers, multi-parameter)
✓ Default template arguments
✓ Template metaprogramming (compile-time computation)
✓ Non-type parameters for compile-time configuration
```

**Real-World Applications:**

1. **Generic Sensor Averaging (`average` function template)** - Autonomous vehicles process readings from dozens of sensors (LiDAR distances, radar velocities, IMU accelerations). Generic algorithms eliminate code duplication and work with any numeric type.

2. **Circular Buffer with Compile-Time Size** - Sensor history buffers store recent readings for filtering and trend analysis. Using non-type template parameters (`size_t Capacity`) allows stack allocation with zero overhead—the size is compiled into the type itself. Different sensors can have differently-sized buffers without runtime cost.

3. **Weighted Sensor Fusion** - Autonomous vehicles combine multiple sensor readings with confidence-based weighting. The template approach with compile-time sensor count enables the compiler to fully unroll loops and optimize away all indirection.

4. **Full Specialization for Sensor Validators** - Boolean sensors (door open/closed, brake pressed) need different validation logic than continuous sensors (temperature, speed). Full specialization provides type-specific implementations without runtime overhead.

5. **Partial Specialization for Direct vs. Indirect Sensors** - Some sensors provide values directly, others through shared memory or CAN bus pointers. Partial specialization for pointer types handles both cases with a single template design.

6. **Template Metaprogramming for Calibration** - ADC calibration coefficients and polynomial correction factors can be computed at compile time, eliminating runtime division and producing optimal machine code. In safety-critical automotive systems, compile-time computation reduces runtime errors.

7. **Default Template Arguments** - Most sensors use standard configurations (double precision, 64-bit timestamps, 10-sample buffers). Default arguments reduce boilerplate while allowing customization when needed (e.g., high-frequency IMU might need 100-sample buffer).

**Performance Benefits:**
- **Zero abstraction cost**: All template code resolves at compile time
- **Inlining opportunities**: Generic functions can be fully inlined
- **Type safety**: Compile-time checking prevents sensor type mismatches
- **Code size optimization**: Only instantiated templates generate code
- **Cache efficiency**: Fixed-size buffers allow better memory layout

**Template Design Patterns in Automotive:**
- **Policy-based design**: Sensor fusion strategies as template parameters
- **Type traits**: Detecting sensor capabilities at compile time (e.g., `has_temperature_reading<T>`)
- **Tag dispatch**: Selecting algorithms based on sensor category (continuous vs. discrete)
- **Compile-time computation**: Safety margins, calibration tables, conversion factors

This example demonstrates how templates provide the foundation for zero-overhead, type-safe generic programming essential in modern autonomous vehicle software.

---

### INTERVIEW_QA: Core Concepts and Specialization

#### Q1: What is the difference between function templates and class templates in terms of template argument deduction?
**Difficulty:** #beginner
**Category:** #syntax #fundamentals
**Concepts:** #template_basics #type_deduction #instantiation

**Answer:**
Function templates support automatic template argument deduction from function call arguments, while class templates (before C++17) require explicit template argument specification.

**Code example:**
```cpp
template<typename T> T add(T a, T b) { return a + b; }
template<typename T> class Box { T value; };

int main() {
    add(5, 10);           // ✅ T deduced as int
    // Box b(5);          // ❌ Error in C++11/14
    Box<int> b(5);        // ✅ Must specify template argument
}
```

**Explanation:**
Function templates can deduce `T` from the types of arguments passed at the call site, making them more convenient to use. Class templates lack this deduction mechanism because there's no analogous "call site" for a class—the template arguments must be part of the type name itself. C++17 introduced CTAD (Class Template Argument Deduction) to address this limitation.

**Key takeaway:** Function templates deduce types automatically from arguments; class templates require explicit type specification (pre-C++17).

---

#### Q2: Why are non-template functions preferred over template functions in overload resolution when both match?
**Difficulty:** #intermediate
**Category:** #overload_resolution #design_pattern
**Concepts:** #function_templates #overloading #template_instantiation

**Answer:**
Non-template functions are preferred because they represent more specific implementations, and the compiler prioritizes exact matches over generic template instantiations to avoid unintended behavior.

**Code example:**
```cpp
void process(int x) { std::cout << "non-template\n"; }
template<typename T> void process(T x) { std::cout << "template\n"; }

int main() {
    process(42);    // ✅ Calls non-template (exact match)
    process(3.14);  // ✅ Calls template (no exact match exists)
}
```

**Explanation:**
When overload resolution encounters both a template and non-template function that could handle a call, it prefers the non-template version if types match exactly. This prevents templates from "hijacking" calls intended for specialized implementations and allows gradual specialization of template code with non-template overloads for specific types.

**Key takeaway:** Exact non-template matches always beat template instantiations in overload resolution.

---

#### Q3: What happens if you attempt to use a template with a type that doesn't support the operations used in the template body?
**Difficulty:** #intermediate
**Category:** #error_handling #template_constraints
**Concepts:** #template_instantiation #compile_time_errors #type_requirements

**Answer:**
Compilation fails at the point of instantiation with an error message indicating that the required operation is not supported for that type.

**Code example:**
```cpp
template<typename T>
T multiply(T a, T b) {
    return a * b;  // ❌ Requires operator*
}

struct NoMultiply { int value; };

int main() {
    multiply(5, 10);                      // ✅ OK: int has operator*
    // multiply(NoMultiply{}, NoMultiply{}); // ❌ Error: no operator* for NoMultiply
}
```

**Explanation:**
Templates don't verify that operations are valid until instantiation. When you try to instantiate `multiply<NoMultiply>`, the compiler attempts to generate code for `a * b` with `NoMultiply` operands and fails because the type doesn't provide `operator*`. This is sometimes called "duck typing" at compile time—if it doesn't quack like a duck, compilation fails.

**Key takeaway:** Templates impose implicit interface requirements that are only checked at instantiation time.

---

#### Q4: Explain the difference between full specialization and partial specialization. Can you fully specialize a function template?
**Difficulty:** #intermediate
**Category:** #specialization #advanced_techniques
**Concepts:** #full_specialization #partial_specialization #function_templates #class_templates

**Answer:**
Full specialization provides a completely custom implementation for specific template arguments, while partial specialization specializes some but not all parameters. Function templates can only be fully specialized, not partially specialized.

**Code example:**
```cpp
// Class template - both full and partial specialization allowed
template<typename T, typename U> struct Pair { };
template<typename T> struct Pair<T, int> { };  // ✅ Partial
template<> struct Pair<double, int> { };        // ✅ Full

// Function template - only full specialization allowed
template<typename T> void func(T) { }
template<> void func<int>(int) { }              // ✅ Full
// template<typename T> void func<T*>(T*) { }   // ❌ Partial not allowed
```

**Explanation:**
Partial specialization requires pattern matching on template parameters, which is supported for class templates but not function templates. For functions, you can achieve similar effects through overloading rather than partial specialization. This asymmetry exists because function overloading already provides a mechanism for selecting different implementations based on argument types.

**Key takeaway:** Only class templates support partial specialization; function templates must use overloading instead.

---

#### Q5: What is template argument deduction and when does it fail?
**Difficulty:** #intermediate
**Category:** #type_deduction #error_handling
**Concepts:** #template_basics #type_deduction #ambiguity

**Answer:**
Template argument deduction is the compiler's process of determining template parameters from function call arguments. It fails when arguments don't match consistently or when deduction is ambiguous.

**Code example:**
```cpp
template<typename T>
T max(T a, T b) { return a > b ? a : b; }

int main() {
    max(5, 10);        // ✅ T = int
    max(5.0, 10.0);    // ✅ T = double
    // max(5, 10.0);   // ❌ Error: conflicting deduction (int vs double)
    max<double>(5, 10.0); // ✅ Explicit argument resolves conflict
}
```

**Explanation:**
Deduction fails when different arguments suggest different types for the same template parameter. In `max(5, 10.0)`, the first argument suggests `T=int` while the second suggests `T=double`, creating an ambiguity the compiler cannot resolve. Explicit template arguments bypass deduction entirely.

**Key takeaway:** Template argument deduction requires all uses of a template parameter to deduce consistently to the same type.

---

#### Q6: Why must default template arguments be specified from right to left?
**Difficulty:** #beginner
**Category:** #syntax #template_constraints
**Concepts:** #default_arguments #template_basics

**Answer:**
Default arguments must be rightmost so the compiler can unambiguously match provided arguments to parameters, similar to function default parameter rules.

**Code example:**
```cpp
template<typename T = int, typename U>  // ❌ Error: U has no default after T
struct Bad { };

template<typename T, typename U = int>  // ✅ Correct: defaults are rightmost
struct Good { };

Good<float> obj;  // ✅ Unambiguous: T=float, U=int (default)
```

**Explanation:**
If defaults weren't required to be rightmost, the compiler couldn't determine which arguments correspond to which parameters when fewer arguments are provided. With rightmost defaults, the compiler can always assign provided arguments left-to-right, using defaults for any remaining parameters.

**Key takeaway:** Default template arguments must appear rightmost to enable unambiguous parameter matching.

---

#### Q7: What is a non-type template parameter and what types can be used?
**Difficulty:** #intermediate
**Category:** #advanced_techniques #template_parameters
**Concepts:** #non_type_parameters #compile_time_constants #template_metaprogramming

**Answer:**
Non-type template parameters accept compile-time constant values rather than types. Allowed types include integral types, pointers, references, and enums (C++11), and additional types in later standards.

**Code example:**
```cpp
template<int N>
struct ArraySize {
    int data[N];  // ✅ N must be compile-time constant
};

template<const char* Msg>
void log() { std::cout << Msg << "\n"; }

extern const char greeting[] = "Hello";  // ✅ External linkage required

int main() {
    ArraySize<10> arr;  // ✅ 10 is compile-time constant
    log<greeting>();    // ✅ External linkage pointer
}
```

**Explanation:**
Non-type parameters enable compile-time computation and zero-overhead abstractions by embedding constant values in types. The compiler generates different instantiations for different values, similar to how it generates different instantiations for different types. Restrictions exist because the template parameter must be determinable at compile time and have stable addresses for pointers/references.

**Key takeaway:** Non-type template parameters accept compile-time constants and enable template metaprogramming.

---

#### Q8: What is lazy template instantiation and why is it important?
**Difficulty:** #intermediate
**Category:** #template_instantiation #performance
**Concepts:** #lazy_evaluation #compile_time #template_instantiation

**Answer:**
Lazy instantiation means the compiler only generates code for template member functions that are actually used, not for the entire template when it's instantiated.

**Code example:**
```cpp
template<typename T>
struct Container {
    void valid() { std::cout << "valid\n"; }
    
    void invalid() {
        T::nonexistent_member;  // ❌ Only error if called
    }
};

int main() {
    Container<int> c;
    c.valid();     // ✅ OK: only valid() is instantiated
    // c.invalid(); // ❌ Error only if uncommented
}
```

**Explanation:**
The compiler instantiates template code on-demand. If you never call `invalid()`, the compiler never generates code for it and never discovers the error. This allows templates to contain code that's invalid for some types, as long as that code isn't used. This property is fundamental to SFINAE and template metaprogramming techniques.

**Key takeaway:** Templates only instantiate used members, allowing templates to contain code invalid for some types.

---

#### Q9: How do you force template argument deduction for a specific type?
**Difficulty:** #beginner
**Category:** #syntax #type_deduction
**Concepts:** #explicit_instantiation #template_arguments

**Answer:**
Use explicit template arguments in angle brackets to bypass deduction and force a specific type.

**Code example:**
```cpp
template<typename T>
T add(T a, T b) { return a + b; }

int main() {
    add(5, 10);            // ✅ Deduced: T = int
    add<double>(5, 10);    // ✅ Forced: T = double, arguments converted
    add<int>(5.5, 10.7);   // ✅ Forced: T = int, 5.5 and 10.7 truncated to 5 and 10
}
```

**Explanation:**
Explicit template arguments override deduction entirely. The compiler uses the specified type regardless of actual argument types, performing any necessary conversions. This is useful when deduction would fail (mismatched types) or when you want different behavior than the deduced type would provide.

**Key takeaway:** Angle bracket notation with explicit types overrides automatic template argument deduction.

---

#### Q10: What happens when you specialize a template for a pointer type using partial specialization?
**Difficulty:** #intermediate
**Category:** #specialization #pointers
**Concepts:** #partial_specialization #pointer_types #pattern_matching

**Answer:**
Partial specialization for pointers creates a template that matches any pointer type, binding the template parameter to the pointed-to type.

**Code example:**
```cpp
template<typename T>
struct IsPointer {
    static const bool value = false;
};

template<typename T>
struct IsPointer<T*> {  // ✅ Matches any pointer type
    static const bool value = true;
    using PointeeType = T;  // ✅ T is the pointed-to type
};

int main() {
    std::cout << IsPointer<int>::value << "\n";     // 0
    std::cout << IsPointer<int*>::value << "\n";    // 1
    std::cout << IsPointer<double**>::value << "\n"; // 1 (T = double*)
}
```

**Explanation:**
The `T*` pattern matches when the template argument is a pointer, with `T` binding to whatever type is pointed to. This works recursively—`double**` matches with `T=double*`. Partial specialization for pointers is commonly used in type traits and smart pointer implementations.

**Key takeaway:** Partial specialization with `T*` pattern matches any pointer, extracting the pointed-to type.

---

#### Q11: Can function templates have default template arguments? What are the restrictions?
**Difficulty:** #intermediate
**Category:** #syntax #function_templates
**Concepts:** #default_arguments #function_templates #declaration_vs_definition

**Answer:**
Function templates can have default template arguments, but only in declarations (not definitions unless inline). This differs from class templates where defaults can appear in definitions.

**Code example:**
```cpp
// ✅ Declaration with default
template<typename T = int>
void func(T value);

// ✅ Definition without default
template<typename T>
void func(T value) { std::cout << value << "\n"; }

// ✅ Inline definition can have default
template<typename T = int>
void inlineFunc(T value) { std::cout << value << "\n"; }

int main() {
    func(42);        // ✅ Deduced
    func<>(42);      // ✅ Uses default int
    inlineFunc<>(42); // ✅ Uses default int
}
```

**Explanation:**
The separation between declaration and definition exists because function templates can be declared multiple times (in different translation units) but defined once. Allowing defaults in definitions could create conflicts. Inline definitions combine declaration and definition, so defaults are permitted.

**Key takeaway:** Function template default arguments only appear in declarations, not separate definitions.

---

#### Q12: What is the "two-phase name lookup" in templates and why does it matter?
**Difficulty:** #advanced
**Category:** #compilation #name_lookup
**Concepts:** #two_phase_lookup #dependent_names #compilation_process

**Answer:**
Two-phase lookup means templates undergo two compilation passes: first checking template syntax at definition, second checking type-dependent code at instantiation.

**Code example:**
```cpp
void helper(int x) { std::cout << "int: " << x << "\n"; }

template<typename T>
void process(T x) {
    helper(x);  // ✅ Looked up at instantiation
    unknown();  // ❌ Error at definition (non-dependent name)
}

void helper(double x) { std::cout << "double: " << x << "\n"; }

int main() {
    process(42);    // ✅ Finds helper(int)
    process(3.14);  // ✅ Finds helper(double)
}
```

**Explanation:**
Non-dependent names (like `unknown()`) are looked up at definition time and must be visible then. Dependent names (like `helper(x)` where `x` has template type) are looked up at instantiation time using both normal lookup and Argument-Dependent Lookup (ADL). This allows templates to work with types defined after the template.

**Key takeaway:** Templates check non-dependent code at definition, dependent code at instantiation.

---

#### Q13: How do you create a compile-time constant array size using non-type template parameters?
**Difficulty:** #intermediate
**Category:** #template_parameters #arrays
**Concepts:** #non_type_parameters #compile_time_constants #fixed_size_arrays

**Answer:**
Use a non-type template parameter with an integral type to specify array size, enabling compile-time memory allocation and bounds checking.

**Code example:**
```cpp
template<typename T, size_t N>
class FixedArray {
    T data[N];  // ✅ Array allocated on stack, size known at compile time
public:
    constexpr size_t size() const { return N; }
    T& operator[](size_t i) { return data[i]; }
};

int main() {
    FixedArray<int, 5> arr;  // ✅ Stack-allocated array of 5 ints
    constexpr size_t sz = arr.size();  // ✅ Usable in constant expressions
}
```

**Explanation:**
Non-type parameters embed constant values in types, creating different types for different sizes. `FixedArray<int, 5>` and `FixedArray<int, 10>` are completely different types. The array size is known at compile time, enabling stack allocation and eliminating bounds-checking overhead when the compiler can verify safety.

**Key takeaway:** Non-type size parameters enable type-safe, zero-overhead fixed-size containers.

---

#### Q14: What is the difference between explicit specialization and explicit instantiation?
**Difficulty:** #advanced
**Category:** #specialization #instantiation
**Concepts:** #explicit_specialization #explicit_instantiation #compilation

**Answer:**
Explicit specialization provides a custom implementation for specific template arguments, while explicit instantiation forces the compiler to generate code for specific template arguments without specializing behavior.

**Code example:**
```cpp
template<typename T> struct Traits { static void print() { std::cout << "generic\n"; } };

// ✅ Explicit specialization - custom implementation
template<> struct Traits<int> { static void print() { std::cout << "int\n"; } };

// ✅ Explicit instantiation - force generation of template code
template struct Traits<double>;  // Generates Traits<double> in this translation unit

int main() {
    Traits<int>::print();     // int (specialized)
    Traits<double>::print();  // generic (instantiated but not specialized)
}
```

**Explanation:**
Specialization changes behavior for specific types; instantiation just generates the standard template code. Explicit instantiation is used to control where template code is generated, reducing compile times and binary size by preventing multiple instantiations across translation units.

**Key takeaway:** Specialization changes implementation; instantiation controls where code is generated.

---

#### Q15: How does partial specialization enable type trait implementations?
**Difficulty:** #advanced
**Category:** #type_traits #metaprogramming
**Concepts:** #partial_specialization #type_traits #compile_time_dispatch

**Answer:**
Partial specialization allows pattern matching on type properties, enabling compile-time type queries by providing different implementations for different type patterns.

**Code example:**
```cpp
// Primary template - default case
template<typename T>
struct RemovePointer {
    using type = T;
};

// Partial specialization - matches pointers
template<typename T>
struct RemovePointer<T*> {
    using type = T;  // ✅ Strips one level of pointer
};

int main() {
    RemovePointer<int>::type x = 42;       // int
    RemovePointer<int*>::type y = 42;      // int (pointer removed)
    RemovePointer<double**>::type* z = nullptr;  // double* (one level removed)
}
```

**Explanation:**
Type traits use partial specialization to detect type properties. The compiler selects the most specific specialization based on pattern matching. This enables compile-time type manipulation and conditional compilation. Standard library traits like `std::is_pointer`, `std::remove_reference`, and `std::decay` all use this technique.

**Key takeaway:** Partial specialization enables pattern matching on types for compile-time type queries and transformations.

---

#### Q16: Why can't you partially specialize function templates directly?
**Difficulty:** #advanced
**Category:** #language_design #function_templates
**Concepts:** #partial_specialization #function_templates #overloading

**Answer:**
Function templates cannot be partially specialized because function overloading already provides equivalent functionality, and allowing both would create ambiguous and complex overload resolution rules.

**Code example:**
```cpp
// ❌ Cannot do this (partial specialization of function)
// template<typename T> void func(T*) { }

// ✅ Use overloading instead
template<typename T> void func(T) { std::cout << "generic\n"; }
template<typename T> void func(T*) { std::cout << "pointer\n"; }  // Overload for pointers

int main() {
    int x = 42;
    func(x);    // generic
    func(&x);   // pointer
}
```

**Explanation:**
Function template overloading achieves the same goals as partial specialization would, without adding complexity. The compiler selects the most specific overload based on argument types. Allowing partial specialization would create two overlapping mechanisms for the same purpose, complicating overload resolution and template argument deduction.

**Key takeaway:** Use function template overloading instead of partial specialization for functions.

---

#### Q17: What happens when multiple partial specializations match a template instantiation equally well?
**Difficulty:** #advanced
**Category:** #specialization #error_handling
**Concepts:** #partial_specialization #ambiguity #compilation_errors

**Answer:**
If multiple partial specializations match equally well with no clear "most specific" choice, compilation fails with an ambiguity error.

**Code example:**
```cpp
template<typename T, typename U> struct Test { };

template<typename T> struct Test<T, int> { };    // Specialization 1
template<typename T> struct Test<int, T> { };    // Specialization 2

int main() {
    Test<double, int> t1;  // ✅ OK: Specialization 1 matches
    Test<int, double> t2;  // ✅ OK: Specialization 2 matches
    // Test<int, int> t3;  // ❌ Error: Both specializations match equally
}
```

**Explanation:**
For `Test<int, int>`, both specializations match perfectly with no way to prefer one over the other. The compiler cannot arbitrarily choose, so it reports an ambiguity error. You must provide an additional full specialization to resolve the ambiguity: `template<> struct Test<int, int> { };`.

**Key takeaway:** Ambiguous partial specialization matches require explicit full specialization to resolve.

---

#### Q18: How do you use template metaprogramming to compute values at compile time?
**Difficulty:** #advanced
**Category:** #metaprogramming #compile_time_computation
**Concepts:** #template_metaprogramming #non_type_parameters #recursion #constexpr

**Answer:**
Template metaprogramming uses recursive template instantiation with specialization for base cases, computing results as static member values.

**Code example:**
```cpp
template<unsigned N>
struct Fibonacci {
    static constexpr unsigned value = Fibonacci<N-1>::value + Fibonacci<N-2>::value;
};

template<> struct Fibonacci<0> { static constexpr unsigned value = 0; };
template<> struct Fibonacci<1> { static constexpr unsigned value = 1; };

int main() {
    constexpr unsigned fib10 = Fibonacci<10>::value;  // 55 (computed at compile time)
    int arr[Fibonacci<7>::value];  // ✅ Can use in array size (13 elements)
}
```

**Explanation:**
Each template instantiation triggers instantiation of its dependencies, creating a compile-time recursion that terminates at specialized base cases. The compiler evaluates the entire computation during compilation, generating no runtime code. This technique predates `constexpr` functions but is more limited and harder to read.

**Key takeaway:** Template recursion with specialization enables compile-time computation of complex values.

---

#### Q19: What are the advantages and disadvantages of using templates compared to runtime polymorphism?
**Difficulty:** #intermediate
**Category:** #design_pattern #performance
**Concepts:** #static_polymorphism #virtual_functions #performance #code_bloat

**Answer:**
Templates provide zero-overhead static polymorphism with compile-time type checking but increase compile times and binary size. Virtual functions offer flexible runtime polymorphism with uniform code size but incur vtable lookup overhead.

**Code example:**
```cpp
// ✅ Template approach (static polymorphism)
template<typename Shape>
double area(const Shape& s) { return s.area(); }  // No vtable, inline-able

// ✅ Virtual function approach (runtime polymorphism)
struct ShapeBase { virtual double area() const = 0; };  // Vtable pointer overhead
struct Circle : ShapeBase { double area() const override { return 3.14 * r * r; } };
```

**Explanation:**
Templates generate specialized code for each type, enabling inlining and eliminating indirection, but creating multiple copies of code (code bloat). Virtual functions use a single implementation with dynamic dispatch, keeping binary size smaller but adding runtime overhead and preventing many optimizations. Choose templates for performance-critical code with known types; choose virtual functions for extensible type hierarchies and plugin architectures.

**Key takeaway:** Templates offer zero-overhead abstraction; virtual functions offer runtime flexibility and smaller code size.

---

#### Q20: How do default template arguments interact with template argument deduction in function templates?
**Difficulty:** #intermediate
**Category:** #type_deduction #default_arguments
**Concepts:** #default_arguments #type_deduction #template_parameters

**Answer:**
Default template arguments are used only when explicit template arguments are provided but incomplete; they don't participate in deduction from function arguments.

**Code example:**
```cpp
template<typename T, typename U = int>
void func(T t) { std::cout << sizeof(U) << "\n"; }

int main() {
    func(42);          // ✅ T deduced as int, U defaults to int
    func<double>(3.14); // ✅ T = double, U defaults to int
    func<float, long>(1.0f); // ✅ T = float, U = long (both explicit)
}
```

**Explanation:**
When you call `func(42)`, the compiler deduces `T=int` from the argument but has no information to deduce `U`, so it uses the default `int`. Defaults only apply to parameters not deduced and not explicitly specified. If you write `func<double>(3.14)`, you explicitly set `T=double` and leave `U` to use its default.

**Key takeaway:** Default template arguments apply to undeduced/unspecified parameters, not to deduction results.

---

### PRACTICE_TASKS: Output Prediction and Code Analysis

#### Q1
```cpp
template<typename T>
T getValue() { return T(); }

int main() {
    std::cout << getValue<int>() << "\n";
    std::cout << getValue<double>() << "\n";
}
```

#### Q2
```cpp
template<typename T>
void print(T) { std::cout << "template\n"; }

void print(int) { std::cout << "non-template\n"; }

int main() {
    print(42);
    print(3.14);
}
```

#### Q3
```cpp
template<typename T, typename U>
struct Pair {
    static void show() { std::cout << "generic\n"; }
};

template<typename T>
struct Pair<T, T> {
    static void show() { std::cout << "same\n"; }
};

int main() {
    Pair<int, double>::show();
    Pair<float, float>::show();
}
```

#### Q4
```cpp
template<typename T = double, typename U>
struct Test { };

int main() {
    Test<int, float> t;
}
```

#### Q5
```cpp
template<typename T>
struct Container {
    void valid() { std::cout << "ok\n"; }
    void invalid() { typename T::invalid_type x; }
};

int main() {
    Container<int> c;
    c.valid();
}
```

#### Q6
```cpp
template<typename T>
struct IsPointer { static const bool value = false; };

template<typename T>
struct IsPointer<T*> { static const bool value = true; };

int main() {
    std::cout << IsPointer<int>::value << " ";
    std::cout << IsPointer<int*>::value << " ";
    std::cout << IsPointer<int**>::value << "\n";
}
```

#### Q7
```cpp
template<int N>
struct Power2 {
    static constexpr int value = 2 * Power2<N-1>::value;
};

template<>
struct Power2<0> { static constexpr int value = 1; };

int main() {
    std::cout << Power2<5>::value << "\n";
}
```

#### Q8
```cpp
template<typename T, size_t N>
class Array {
    T data[N];
public:
    size_t size() const { return N; }
};

int main() {
    Array<int, 3> a1;
    Array<int, 5> a2;
    std::cout << a1.size() << " " << a2.size() << "\n";
}
```

#### Q9
```cpp
template<typename T>
void func(T val) { std::cout << "value\n"; }

template<typename T>
void func(T* val) { std::cout << "pointer\n"; }

int main() {
    int x = 42;
    func(x);
    func(&x);
}
```

#### Q10
```cpp
template<typename T>
struct Traits {
    static void print() { std::cout << "primary\n"; }
};

template<>
struct Traits<int> {
    static void print() { std::cout << "int\n"; }
};

template<>
struct Traits<const int> {
    static void print() { std::cout << "const int\n"; }
};

int main() {
    Traits<int>::print();
    Traits<const int>::print();
}
```

#### Q11
```cpp
template<typename T>
T add(T a, T b) { return a + b; }

int main() {
    std::cout << add(5, 10) << "\n";
    std::cout << add<double>(5, 10) << "\n";
}
```

#### Q12
```cpp
template<typename T, typename U = int>
void process(T) { std::cout << sizeof(U) << "\n"; }

int main() {
    process(42);
    process<double>(3.14);
    process<float, long>(1.0f);
}
```

#### Q13
```cpp
template<typename T>
struct Base {
    void interface() { std::cout << "Base\n"; }
};

template<>
struct Base<int> {
    void interface() { std::cout << "Base<int>\n"; }
};

int main() {
    Base<double> b1;
    Base<int> b2;
    b1.interface();
    b2.interface();
}
```

#### Q14
```cpp
template<int N>
struct Factorial {
    static constexpr int value = N * Factorial<N-1>::value;
};

template<>
struct Factorial<0> {
    static constexpr int value = 1;
};

int main() {
    constexpr int f = Factorial<4>::value;
    std::cout << f << "\n";
}
```

#### Q15
```cpp
template<typename T1, typename T2>
struct Pair { static void show() { std::cout << "A\n"; } };

template<typename T>
struct Pair<T, int> { static void show() { std::cout << "B\n"; } };

template<>
struct Pair<double, int> { static void show() { std::cout << "C\n"; } };

int main() {
    Pair<float, char>::show();
    Pair<float, int>::show();
    Pair<double, int>::show();
}
```

#### Q16
```cpp
template<typename T>
void test(T) { std::cout << "1\n"; }

template<typename T>
void test(T&) { std::cout << "2\n"; }

int main() {
    int x = 42;
    test(x);
    test(42);
}
```

#### Q17
```cpp
template<typename T>
struct RemoveConst { using type = T; };

template<typename T>
struct RemoveConst<const T> { using type = T; };

int main() {
    RemoveConst<int>::type a = 10;
    RemoveConst<const int>::type b = 20;
    std::cout << a << " " << b << "\n";
}
```

#### Q18
```cpp
template<bool B, typename T = void>
struct EnableIf { };

template<typename T>
struct EnableIf<true, T> { using type = T; };

int main() {
    EnableIf<true, int>::type x = 42;
    std::cout << x << "\n";
}
```

#### Q19
```cpp
template<typename T>
struct Wrapper {
    static void print() { std::cout << sizeof(T) << "\n"; }
};

int main() {
    Wrapper<char>::print();
    Wrapper<int>::print();
    Wrapper<double>::print();
}
```

#### Q20
```cpp
template<typename T, int N>
struct Array {
    T data[N];
    constexpr int size() const { return N; }
};

int main() {
    Array<int, 5> a;
    constexpr int s = a.size();
    int arr[s];
    std::cout << sizeof(arr) / sizeof(int) << "\n";
}
```

---

### QUICK_REFERENCE: Answer Key and Summary Tables

#### Answer Key for Practice Questions

| Q# | Answer | Explanation | Key Concept |
|----|--------|-------------|-------------|
| 1 | `0`<br>`0` | `T()` performs value-initialization, giving 0 for numeric types | #value_initialization |
| 2 | `non-template`<br>`template` | Non-template exact match preferred over template for `int` | #overload_resolution |
| 3 | `generic`<br>`same` | Partial specialization `Pair<T, T>` matches when both types are identical | #partial_specialization |
| 4 | Compilation error | Default template argument must be rightmost; `U` has no default after `T` | #default_arguments |
| 5 | `ok` | Lazy instantiation: `invalid()` never called, so its error never triggered | #lazy_instantiation |
| 6 | `0 1 1` | Primary template for `int`, partial specialization matches `int*` and `int**` | #partial_specialization |
| 7 | `32` | Template recursion: 2^5 = 32 computed at compile time | #template_metaprogramming |
| 8 | `3 5` | Non-type parameter `N` creates different types with different sizes | #non_type_parameters |
| 9 | `value`<br>`pointer` | Overload resolution: pointer version selected for `&x` | #function_overloading |
| 10 | `int`<br>`const int` | Both specializations are distinct; each matches its exact type | #full_specialization |
| 11 | `15`<br>`15` | First deduces `T=int`, second forces `T=double` with conversion | #type_deduction |
| 12 | `4`<br>`4`<br>`8` | `U` defaults to `int` (4 bytes), explicitly set to `long` (8 bytes) in third call | #default_arguments |
| 13 | `Base`<br>`Base<int>` | Full specialization for `int` provides different implementation | #full_specialization |
| 14 | `24` | 4! = 4 × 3 × 2 × 1 = 24, computed at compile time via template recursion | #template_metaprogramming |
| 15 | `A`<br>`B`<br>`C` | Most specific match selected: primary → partial → full specialization | #specialization_priority |
| 16 | `2`<br>`1` | Lvalue prefers reference overload; rvalue matches value parameter | #reference_binding |
| 17 | `10 20` | Partial specialization strips `const` qualifier from type | #type_traits |
| 18 | `42` | SFINAE-like pattern: only `true` case defines `type` member | #enable_if_pattern |
| 19 | `1`<br>`4`<br>`8` | `sizeof` operator returns size of type in bytes (platform-dependent) | #sizeof_operator |
| 20 | `5` | Non-type parameter used as `constexpr` to size array at compile time | #compile_time_constants |

#### Template Specialization Priority

| Specialization Type | Priority | Pattern Example | Use Case |
|---------------------|----------|-----------------|----------|
| Full Specialization | Highest | `template<> struct S<int, double>` | Exact type match customization |
| Partial Specialization | Medium | `template<typename T> struct S<T, int>` | Pattern-based customization |
| Primary Template | Lowest | `template<typename T, typename U> struct S` | Default implementation |

#### Template Parameter Types

| Parameter Type | Syntax Example | Allowed Values | Instantiation |
|----------------|----------------|----------------|---------------|
| Type Parameter | `typename T` | Any type | `Container<int>` |
| Non-Type Parameter | `int N` | Compile-time constants | `Array<int, 10>` |
| Template Template Parameter | `template<typename> class C` | Template names | `Wrapper<std::vector>` |

#### Function vs Class Template Comparison

| Feature | Function Template | Class Template |
|---------|-------------------|----------------|
| Argument Deduction | ✅ Automatic from call arguments | ❌ Must specify explicitly (pre-C++17) |
| Partial Specialization | ❌ Not allowed | ✅ Allowed |
| Default Arguments in Definition | ❌ Only in declaration | ✅ In definition |
| Overloading | ✅ Can overload with non-templates | N/A (classes don't overload) |

#### Common Template Patterns

| Pattern | Purpose | Example |
|---------|---------|---------|
| Type Traits | Query type properties | `std::is_pointer<T>` |
| SFINAE | Enable/disable templates conditionally | `enable_if<condition, T>` |
| Tag Dispatch | Select algorithm via type tags | `iterator_category` |
| Policy Classes | Inject behavior via template parameters | `Allocator` parameter |
| Template Recursion | Compile-time computation | `Factorial<N>` |
| Currying | Bind some template parameters | Partial specialization |
