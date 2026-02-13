## TOPIC: Compile-Time Programming in C++

### THEORY_SECTION: Understanding Compile-Time Computation

#### 1. What is Compile-Time Programming?

Compile-time programming enables computations, type checks, and logic to execute during compilation rather than at runtime.

**Core Benefits:**
- **Zero runtime overhead**: Results baked into binary
- **Early error detection**: Bugs caught before program runs
- **Deterministic performance**: No runtime variation
- **Type safety**: Strong compile-time guarantees

**Primary Tools:**

| Tool | C++ Version | Purpose | Evaluation |
|------|-------------|---------|------------|
| **constexpr** | C++11+ | Functions/variables that *can* be compile-time | Optional |
| **consteval** | C++20 | Functions that *must* be compile-time | Mandatory |
| **static_assert** | C++11 | Compile-time assertions | Compile-time only |
| **type_traits** | C++11 | Type introspection | Compile-time only |
| **if constexpr** | C++17 | Conditional branching | Compile-time only |
| **Templates** | C++98+ | Turing-complete metaprogramming | Compile-time only |

---

#### 2. constexpr Evolution Across Standards

The `constexpr` keyword has evolved dramatically across C++ versions:

| C++ Version | Restrictions | Example Operations |
|-------------|--------------|-------------------|
| **C++11** | - Single return statement only<br>- No loops<br>- No mutable variables<br>- No runtime deferral | `return (x > 0) ? x : -x;` |
| **C++14** | - Multiple statements allowed<br>- Loops permitted<br>- Local variables allowed<br>- Can defer to runtime | `int sum = 0;`<br>`for(int i=0; i<n; ++i) sum += i;`<br>`return sum;` |
| **C++17** | + Lambda expressions<br>+ `if constexpr` branching | `if constexpr(cond) { ... }` |
| **C++20** | + Virtual functions<br>+ try-catch<br>+ consteval functions | `consteval int foo() { }` |

**Example: Same Function Across Standards**

```cpp
// ❌ C++11: Too complex (no loops, no mutable variables)
// ✅ C++14+: Allowed
constexpr int sum_range(int n) {
    int total = 0;              // Mutable local variable
    for (int i = 1; i <= n; ++i) {  // Loop
        total += i;
    }
    return total;
}

// ✅ C++11: Recursive workaround
constexpr int sum_range_c11(int n) {
    return (n <= 0) ? 0 : n + sum_range_c11(n - 1);
}
```

---

#### 3. constexpr vs consteval vs constinit

| Feature | constexpr | consteval | constinit |
|---------|-----------|-----------|-----------|
| **C++ Version** | C++11 | C++20 | C++20 |
| **Compile-time eval** | Optional (if inputs are constant) | Mandatory (always) | Only for initialization |
| **Runtime eval** | ✅ Allowed with runtime inputs | ❌ Forbidden | N/A (for statics) |
| **Use case** | Flexible functions/variables | Strict compile-time functions | Static/thread_local variables |
| **Context** | Functions, variables, constructors | Functions only | Variables only |

**Code Examples:**

```cpp
// constexpr: Can run at compile-time OR runtime
constexpr int square(int x) {
    return x * x;
}

// consteval: MUST run at compile-time
consteval int square_compile_only(int x) {
    return x * x;
}

// constinit: Ensures compile-time initialization
constinit int global_config = 42;

int main() {
    constexpr int a = square(5);        // ✅ Compile-time
    int runtime_val = 10;
    int b = square(runtime_val);        // ✅ Runtime evaluation

    // int c = square_compile_only(runtime_val);  // ❌ Error: runtime value
    constexpr int d = square_compile_only(5);    // ✅ Compile-time

    global_config++;  // ✅ Can modify at runtime
}
```

---

#### 4. Why Compile-Time Programming Matters in Autonomous Vehicles

In safety-critical autonomous vehicle systems, compile-time guarantees prevent catastrophic failures:

| Benefit | Impact | Autonomous Vehicle Example |
|---------|--------|---------------------------|
| **Zero runtime overhead** | Computations baked into binary | Lookup tables for sine/cosine in control loops |
| **Early error detection** | Bugs caught during compilation | Matrix dimension mismatches in sensor fusion |
| **Deterministic timing** | Zero timing variation | Control algorithms with hard 100Hz deadlines |
| **Configuration validation** | Invalid configs rejected at compile-time | Sensor count, calibration matrix sizes |
| **Type safety** | Type mismatches impossible at runtime | Type-specific sensor processing (LiDAR vs Radar) |

**Real-World Example: Camera Calibration Validation**

```cpp
// ❌ Runtime validation: Crashes in production if wrong dimensions
class CalibrationMatrix_Runtime {
    float data[12];  // No compile-time size check
public:
    CalibrationMatrix_Runtime(size_t rows, size_t cols) {
        assert(rows == 3 && cols == 4);  // Runtime check!
    }
};

// ✅ Compile-time validation: Impossible to create invalid matrix
template<size_t Rows, size_t Cols>
class CalibrationMatrix {
    static_assert(Rows == 3 && Cols == 4,
                  "Camera calibration must be 3x4 projection matrix");
    float data[Rows][Cols];
};

// Compile-time enforcement
CalibrationMatrix<3, 4> cam_matrix;        // ✅ Valid
// CalibrationMatrix<4, 4> invalid_matrix; // ❌ Compile error
```

---

#### 5. Compile-Time Feature Selection Guide

Use this decision matrix to choose the right compile-time feature:

| Scenario | Best Tool | Reason |
|----------|----------|--------|
| Mathematical constants (π, e) | `constexpr` variable | Zero runtime cost, clear intent |
| Configuration validation | `static_assert` + type traits | Compilation fails for invalid configs |
| Type-dependent algorithms | `if constexpr` | Branch elimination, zero overhead |
| Flexible computation | `constexpr` function | Can fall back to runtime if needed |
| Strict compile-time only | `consteval` | No runtime escape, guaranteed |
| Static init order safety | `constinit` | Prevents static initialization fiasco |
| Type-based computation | Template metaprogramming | Turing-complete at compile-time |
| Type checking/constraints | Type traits + `static_assert` | Compile-time type safety |

**Performance Characteristics:**

| Operation | Compilation Time | Binary Size | Runtime Cost |
|-----------|-----------------|-------------|--------------|
| `constexpr` (compile-time) | High | Small increase | **Zero** |
| `constexpr` (runtime) | Low | Function code | Normal |
| Template metaprogramming | Very high (deep recursion) | Minimal | **Zero** |
| `if constexpr` | Low | Smaller (dead code removed) | **Zero** |

---

### EDGE_CASES: Tricky Scenarios and Gotchas

#### Edge Case 1: constexpr Runtime Deferral in C++11 vs C++14+

The behavior of `constexpr` functions with runtime arguments changed dramatically between C++11 and C++14.

```cpp
constexpr int multiply(int x, int y) {
    return x * y;
}

int main() {
    int runtime_val = 5;

    // Scenario 1: Runtime call
    int result = multiply(runtime_val, 3);

    // C++11: ❌ Compile error (constexpr functions cannot be called
    //           with runtime values in non-constexpr context)
    // C++14+: ✅ Compiles and runs at runtime

    // Scenario 2: Compile-time call
    constexpr int compile_result = multiply(10, 20);
    // ✅ Works in all standards (evaluated at compile time)
}
```

**Why the difference?**

In C++11, `constexpr` functions were intended *only* for compile-time contexts. The language specification required that `constexpr` functions be usable as constant expressions, but didn't allow them to be regular functions. C++14 relaxed this, making `constexpr` mean "can be evaluated at compile time *if possible*".

**Real-world implication** (autonomous driving):
```cpp
// C++14+ allows flexible compile-time/runtime switching
constexpr float deg_to_rad(float degrees) {
    return degrees * 3.14159f / 180.0f;
}

// Compile-time: steering angle limits baked into binary
constexpr float MAX_STEERING_RAD = deg_to_rad(30.0f);

// Runtime: dynamic angle conversion
float current_angle_deg = get_steering_angle();
float current_angle_rad = deg_to_rad(current_angle_deg);  // Runtime call
```

**Key takeaway**: In C++14+, `constexpr` functions are dual-purpose (compile-time or runtime), but in C++11 they're compile-time only.

---

#### Edge Case 2: constexpr with Loops and Mutable Variables (C++11 Restrictions)

C++11 `constexpr` functions have severe restrictions that make many intuitive implementations invalid.

```cpp
// ❌ C++11: Compile error (loops not allowed)
// ✅ C++14+: Valid
constexpr int sum_range(int n) {
    int total = 0;  // ❌ C++11: mutable local variable
    for (int i = 1; i <= n; ++i) {  // ❌ C++11: loop
        total += i;
    }
    return total;
}

// ✅ C++11: Valid (single return, ternary operator)
constexpr int sum_range_c11(int n) {
    return n <= 0 ? 0 : n + sum_range_c11(n - 1);
}

int main() {
    constexpr int result = sum_range(10);  // Requires C++14+
    constexpr int result_c11 = sum_range_c11(10);  // Works in C++11
}
```

**Why C++11 is so restrictive?**

The original design philosophy was that `constexpr` functions should be "pure" expressions without side effects. This made compiler implementation simpler but severely limited expressiveness. C++14 recognized this was too restrictive for practical use.

**Workaround for C++11** (recursive approach):
```cpp
// C++11-compatible recursive sum
constexpr int sum_recursive(int n) {
    return (n <= 1) ? n : n + sum_recursive(n - 1);
}

// But watch out for template instantiation depth limits!
constexpr int huge_sum = sum_recursive(10000);  // May hit recursion limit
```

**Key takeaway**: C++11 `constexpr` functions must be expressed as single-expression recursions; C++14+ allows imperative-style loops.

---

#### Edge Case 3: if constexpr vs Regular if in Templates

`if constexpr` (C++17) performs **compile-time branch elimination**, which is fundamentally different from runtime `if`.

```cpp
#include <type_traits>
#include <iostream>

template<typename T>
void process(T value) {
    // Version 1: Regular if (runtime check)
    if (std::is_integral<T>::value) {
        // ❌ PROBLEM: This branch is instantiated even for non-integral types
        // If this code is invalid for T=float, compilation fails!
        value++;  // Would fail for std::string
        std::cout << "Integral: " << value << "\n";
    } else {
        std::cout << "Non-integral\n";
    }
}

template<typename T>
void process_constexpr(T value) {
    // Version 2: if constexpr (compile-time elimination)
    if constexpr (std::is_integral<T>::value) {
        // ✅ This branch is ONLY instantiated for integral types
        value++;
        std::cout << "Integral: " << value << "\n";
    } else {
        // ✅ This branch is ONLY instantiated for non-integral types
        std::cout << "Non-integral\n";
    }
}

int main() {
    process_constexpr(42);           // ✅ "Integral: 43"
    process_constexpr(3.14);         // ✅ "Non-integral"
    process_constexpr(std::string("test"));  // ✅ "Non-integral"

    // process(std::string("test"));  // ❌ Would fail: can't ++ a string
}
```

**Why this matters:**

Without `if constexpr`, **both branches** of the `if` must be syntactically valid for the instantiated type, even though only one runs. With `if constexpr`, the discarded branch is **never instantiated**, so it can contain code that wouldn't compile for that type.

**Real-world scenario** (sensor data processing):
```cpp
template<typename SensorData>
void calibrate(SensorData& data) {
    if constexpr (std::is_same_v<SensorData, LidarPoint>) {
        // LiDAR-specific calibration (angle correction, intensity scaling)
        data.angle += angle_offset;
        data.intensity *= intensity_gain;
    } else if constexpr (std::is_same_v<SensorData, RadarReturn>) {
        // Radar-specific calibration (doppler correction)
        data.doppler_shift += doppler_offset;
    } else {
        // Generic calibration
        data.timestamp = adjust_timestamp(data.timestamp);
    }
}
```

**Key takeaway**: Use `if constexpr` for type-dependent code paths in templates; regular `if` checks at runtime and instantiates all branches.

---

#### Edge Case 4: Template Instantiation Depth Limits

Recursive template metaprogramming can hit compiler-imposed depth limits, causing compilation to fail.

```cpp
// Compile-time factorial using template recursion
template<int N>
struct Factorial {
    static constexpr int value = N * Factorial<N - 1>::value;
};

template<>
struct Factorial<0> {
    static constexpr int value = 1;
};

int main() {
    constexpr int f5 = Factorial<5>::value;      // ✅ 120
    constexpr int f10 = Factorial<10>::value;    // ✅ 3628800

    // ❌ Most compilers fail: exceeds default depth limit (~512-1024)
    // constexpr int f2000 = Factorial<2000>::value;
    // Error: template instantiation depth exceeds maximum of 1024
}
```

**Why this happens:**

Template metaprogramming works by recursive template instantiation. The compiler must generate `Factorial<N>`, which requires `Factorial<N-1>`, which requires `Factorial<N-2>`, and so on. This creates a chain of 2000 instantiations, exceeding compiler limits.

**Solutions:**

1. **Increase compiler limit**:
   ```bash
   g++ -ftemplate-depth=5000 program.cpp
   clang++ -ftemplate-depth=5000 program.cpp
   ```

2. **Use constexpr functions instead** (C++14+):
   ```cpp
   // ✅ No instantiation depth limit (regular recursion at compile time)
   constexpr int factorial_constexpr(int n) {
       return (n <= 1) ? 1 : n * factorial_constexpr(n - 1);
   }

   constexpr int f2000 = factorial_constexpr(2000);  // ✅ Works (huge number)
   ```

**Why constexpr doesn't hit the limit:**

`constexpr` functions use regular function call recursion (evaluated at compile time), not template instantiation. The recursion limit is typically much higher (stack depth limit), not a hard-coded compiler constant.

**Real-world consideration**:
```cpp
// Computing polynomial coefficients at compile time
template<int Degree>
struct PolynomialCoefficients {
    // Recursive computation...
    // If Degree = 1000, template instantiation may fail
};

// ✅ Better: Use constexpr function
constexpr std::array<double, N> compute_coefficients() {
    // Iterative or recursive computation
}
```

**Key takeaway**: For deep recursion (>100 levels), prefer `constexpr` functions over template metaprogramming to avoid instantiation depth limits.

---

#### Edge Case 5: consteval Forces Compile-Time Evaluation (C++20)

`consteval` (immediate functions) **must** produce a constant expression and cannot be called with runtime values.

```cpp
// consteval: MUST be compile-time evaluated
consteval int square(int x) {
    return x * x;
}

// constexpr: CAN be compile-time evaluated
constexpr int cube(int x) {
    return x * x * x;
}

int main() {
    // ✅ Compile-time: both work
    constexpr int sq = square(5);   // 25
    constexpr int cb = cube(5);     // 125

    // Runtime value
    int runtime_val = 10;

    // ❌ Compile error: consteval cannot accept runtime argument
    // int result = square(runtime_val);

    // ✅ constexpr can accept runtime argument (evaluated at runtime)
    int result = cube(runtime_val);  // Runs at runtime

    // ✅ Workaround: force compile-time evaluation
    constexpr int val = 10;
    int result2 = square(val);  // OK: val is constexpr
}
```

**Use cases for consteval:**

1. **Configuration validation** that should never happen at runtime:
   ```cpp
   consteval bool validate_sensor_config(int sensor_count, int sample_rate) {
       if (sensor_count < 1 || sensor_count > 16) return false;
       if (sample_rate < 100 || sample_rate > 10000) return false;
       return true;
   }

   // ✅ Validated at compile time
   static_assert(validate_sensor_config(8, 1000), "Invalid sensor config");

   // ❌ Cannot validate runtime values
   // int count = get_sensor_count();
   // validate_sensor_config(count, 1000);  // Compile error
   ```

2. **Embedded systems** where runtime computation is forbidden:
   ```cpp
   consteval size_t compute_buffer_size(size_t sensors, size_t samples) {
       return sensors * samples * sizeof(float);
   }

   // Buffer size computed at compile time (no runtime overhead)
   alignas(64) char buffer[compute_buffer_size(8, 1024)];
   ```

**Key takeaway**: Use `consteval` when you want to guarantee compile-time evaluation and prevent accidental runtime usage.

---

### CODE_EXAMPLES: Practical Demonstrations

#### Example 1: Basic constexpr Function (Easy Level)

```cpp
#include <iostream>

// Simple constexpr function (works in C++11+)
constexpr int factorial(int n) {
    return (n <= 1) ? 1 : n * factorial(n - 1);
}

// constexpr variable
constexpr int MAX_CONNECTIONS = 10;

// constexpr with static_assert
constexpr int compute_buffer_size(int elements) {
    return elements * sizeof(int);
}

int main() {
    // Compile-time evaluation
    constexpr int fact5 = factorial(5);
    std::cout << "5! = " << fact5 << "\n";  // 120

    // Can also use at runtime (C++14+, but this simple version works in C++11)
    int n = 7;
    int fact7 = factorial(n);  // Evaluated at runtime
    std::cout << "7! = " << fact7 << "\n";  // 5040

    // Compile-time buffer size calculation
    constexpr int buffer_size = compute_buffer_size(100);
    char buffer[buffer_size];  // Array size must be compile-time constant

    // Compile-time assertion
    static_assert(factorial(3) == 6, "Factorial calculation wrong");
    static_assert(MAX_CONNECTIONS > 0, "Must have at least 1 connection");

    return 0;
}
```

This basic example demonstrates:
- **constexpr functions** that work in both compile-time and runtime contexts
- **constexpr variables** as named constants
- **static_assert** for compile-time validation
- **Recursive constexpr** functions (single-expression recursion for C++11 compatibility)

The factorial function is evaluated at compile time when `fact5` is initialized (because it's `constexpr`), but evaluated at runtime for `fact7` (because `n` is not a constant expression).

---

#### Example 2: constexpr with Loops and Branches (C++14 Features)

```cpp
#include <iostream>

// C++14: constexpr with loops and mutable variables
constexpr int sum_range(int n) {
    int total = 0;
    for (int i = 1; i <= n; ++i) {
        total += i;
    }
    return total;
}

// C++14: constexpr with multiple return statements and conditionals
constexpr int abs_value(int x) {
    if (x < 0) return -x;
    return x;
}

// C++14: constexpr with complex control flow
constexpr int fibonacci(int n) {
    if (n <= 1) return n;

    int a = 0, b = 1;
    for (int i = 2; i <= n; ++i) {
        int temp = a + b;
        a = b;
        b = temp;
    }
    return b;
}

// Real-world: Compile-time CRC table generation
constexpr unsigned int crc32_byte(unsigned int crc, unsigned char byte) {
    crc ^= byte;
    for (int i = 0; i < 8; ++i) {
        crc = (crc >> 1) ^ (0xEDB88320 & -(crc & 1));
    }
    return crc;
}

constexpr unsigned int crc32_string(const char* str, size_t len) {
    unsigned int crc = 0xFFFFFFFF;
    for (size_t i = 0; i < len; ++i) {
        crc = crc32_byte(crc, str[i]);
    }
    return ~crc;
}

int main() {
    // Compile-time evaluation
    constexpr int sum = sum_range(100);          // Sum 1-100 = 5050
    constexpr int fib10 = fibonacci(10);         // 55
    constexpr int abs_neg = abs_value(-42);      // 42

    std::cout << "Sum 1-100: " << sum << "\n";
    std::cout << "Fib(10): " << fib10 << "\n";
    std::cout << "abs(-42): " << abs_neg << "\n";

    // Compile-time string hashing for switch-case on strings
    constexpr unsigned int sensor_type = crc32_string("LIDAR", 5);

    // Can use compile-time hash in switch
    unsigned int incoming_sensor = get_sensor_type_hash();
    switch (incoming_sensor) {
        case crc32_string("LIDAR", 5):
            process_lidar();
            break;
        case crc32_string("RADAR", 5):
            process_radar();
            break;
        case crc32_string("CAMERA", 6):
            process_camera();
            break;
    }

    return 0;
}
```

This C++14 example shows:
- **Loops in constexpr functions** (not allowed in C++11)
- **Mutable local variables** in constexpr functions
- **Multiple return statements** and complex control flow
- **Real-world use case**: Compile-time CRC32 hashing for efficient string comparisons

The CRC32 example is particularly powerful: string hashes are computed at compile time, allowing switch-case on strings (which normally isn't possible in C++).

---

#### Example 3: static_assert with type_traits (Type Checking)

```cpp
#include <type_traits>
#include <iostream>

// Template function with compile-time type checking
template<typename T>
void process_numeric(T value) {
    // ✅ Ensure T is arithmetic (int, float, double, etc.)
    static_assert(std::is_arithmetic<T>::value,
                  "T must be an arithmetic type");

    std::cout << "Processing: " << value * 2 << "\n";
}

// Template class with size constraints
template<typename T, size_t Size>
class FixedArray {
    static_assert(Size > 0, "Array size must be greater than 0");
    static_assert(Size <= 1024, "Array size too large (max 1024)");
    static_assert(std::is_trivially_copyable<T>::value,
                  "T must be trivially copyable for memcpy optimization");

    T data[Size];

public:
    constexpr size_t size() const { return Size; }
    T& operator[](size_t idx) { return data[idx]; }
};

// Autonomous vehicle: Compile-time matrix dimension validation
template<size_t Rows, size_t Cols>
class Matrix {
    static_assert(Rows > 0 && Cols > 0, "Matrix dimensions must be positive");

    float data[Rows][Cols];

public:
    static constexpr size_t rows() { return Rows; }
    static constexpr size_t cols() { return Cols; }

    // Only allow multiplication if dimensions match
    template<size_t OtherCols>
    Matrix<Rows, OtherCols> multiply(const Matrix<Cols, OtherCols>& other) const {
        // Inner dimensions must match (this->Cols == other->Rows)
        // This is guaranteed by the template parameter Cols
        Matrix<Rows, OtherCols> result{};
        for (size_t i = 0; i < Rows; ++i) {
            for (size_t j = 0; j < OtherCols; ++j) {
                for (size_t k = 0; k < Cols; ++k) {
                    result.data[i][j] += data[i][k] * other.data[k][j];
                }
            }
        }
        return result;
    }
};

int main() {
    // ✅ Valid: int is arithmetic
    process_numeric(42);

    // ❌ Compile error: std::string is not arithmetic
    // process_numeric(std::string("hello"));

    // ✅ Valid: size within limits
    FixedArray<int, 100> arr;

    // ❌ Compile error: size is 0
    // FixedArray<int, 0> invalid_arr;

    // ✅ Valid matrix operations (dimensions checked at compile time)
    Matrix<3, 4> projection;   // 3x4 projection matrix
    Matrix<4, 4> transform;    // 4x4 transformation matrix

    // ✅ Valid: 3x4 * 4x4 = 3x4
    auto result = projection.multiply(transform);

    // ❌ Compile error: dimension mismatch (3x4 * 3x4 invalid)
    // auto invalid = projection.multiply(projection);

    return 0;
}
```

This example demonstrates:
- **static_assert with type_traits** for compile-time type validation
- **Template constraints** enforced at compile time
- **Dimension checking** for matrix multiplication (impossible dimension mismatches caught at compile time)
- **Real-world safety**: In autonomous vehicles, matrix dimension errors can cause catastrophic failures; catching them at compile time is critical

---

#### Example 4: if constexpr for Type-Dependent Code (C++17)

```cpp
#include <iostream>
#include <type_traits>
#include <string>
#include <vector>

// Generic serialization with type-dependent logic
template<typename T>
void serialize(const T& value) {
    if constexpr (std::is_arithmetic_v<T>) {
        // Arithmetic types: write binary
        std::cout << "Binary serialize: " << value << "\n";
    } else if constexpr (std::is_same_v<T, std::string>) {
        // Strings: write length + data
        std::cout << "String serialize: " << value.size() << " bytes\n";
    } else if constexpr (std::is_pointer_v<T>) {
        // Pointers: serialize pointed-to value
        std::cout << "Pointer serialize: " << *value << "\n";
    } else {
        // Unknown types: static assertion failure
        static_assert(std::is_arithmetic_v<T>, "Unsupported type for serialization");
    }
}

// Autonomous vehicle: Type-specific sensor data processing
template<typename SensorData>
class SensorProcessor {
public:
    void process(const SensorData& data) {
        if constexpr (std::is_same_v<SensorData, LidarPoint>) {
            // LiDAR-specific processing
            process_lidar(data);
        } else if constexpr (std::is_same_v<SensorData, RadarReturn>) {
            // Radar-specific processing
            process_radar(data);
        } else if constexpr (std::is_same_v<SensorData, CameraFrame>) {
            // Camera-specific processing
            process_camera(data);
        } else {
            static_assert(always_false<SensorData>::value,
                          "Unknown sensor type");
        }
    }

private:
    template<typename T>
    struct always_false : std::false_type {};

    void process_lidar(const LidarPoint& point) {
        // Distance filtering, ground removal, clustering
        if (point.distance < 100.0f && point.z > -2.0f) {
            // Valid point for obstacle detection
        }
    }

    void process_radar(const RadarReturn& ret) {
        // Doppler velocity extraction, range-rate filtering
        if (ret.doppler_velocity > 0.0f) {
            // Approaching object
        }
    }

    void process_camera(const CameraFrame& frame) {
        // Object detection, lane marking extraction
    }
};

// Template function that adapts behavior based on container type
template<typename Container>
void print_container(const Container& c) {
    if constexpr (std::is_same_v<Container, std::string>) {
        // Special handling for strings
        std::cout << "String: \"" << c << "\"\n";
    } else {
        // Generic container iteration
        std::cout << "Container: [";
        bool first = true;
        for (const auto& elem : c) {
            if (!first) std::cout << ", ";
            std::cout << elem;
            first = false;
        }
        std::cout << "]\n";
    }
}

int main() {
    // Arithmetic serialization
    serialize(42);
    serialize(3.14);

    // String serialization
    serialize(std::string("hello"));

    // Pointer serialization
    int value = 100;
    serialize(&value);

    // Container printing with type adaptation
    print_container(std::vector<int>{1, 2, 3, 4, 5});
    print_container(std::string("hello world"));

    return 0;
}
```

This example shows:
- **if constexpr for type-dependent code paths** (branches not taken are never instantiated)
- **Multiple type checks** with `is_same_v`, `is_arithmetic_v`, `is_pointer_v`
- **Real-world sensor processing** with type-specific algorithms
- **Compile-time branch elimination** for zero runtime overhead

The key advantage: Each instantiation only contains the code path for that specific type. `serialize<int>` doesn't contain string handling code, and `serialize<std::string>` doesn't contain arithmetic handling code.

---

#### Example 5: Template Metaprogramming (Advanced)

```cpp
#include <iostream>

// Classic: Compile-time factorial using template recursion
template<int N>
struct Factorial {
    static constexpr int value = N * Factorial<N - 1>::value;
};

template<>
struct Factorial<0> {
    static constexpr int value = 1;
};

// Compile-time power calculation
template<int Base, int Exponent>
struct Power {
    static constexpr int value = Base * Power<Base, Exponent - 1>::value;
};

template<int Base>
struct Power<Base, 0> {
    static constexpr int value = 1;
};

// Compile-time Fibonacci
template<int N>
struct Fibonacci {
    static constexpr int value = Fibonacci<N - 1>::value + Fibonacci<N - 2>::value;
};

template<>
struct Fibonacci<0> {
    static constexpr int value = 0;
};

template<>
struct Fibonacci<1> {
    static constexpr int value = 1;
};

// Type list (metaprogramming foundation)
template<typename... Types>
struct TypeList {};

// Length of type list
template<typename List>
struct Length;

template<typename... Types>
struct Length<TypeList<Types...>> {
    static constexpr size_t value = sizeof...(Types);
};

// Get type at index
template<size_t Index, typename List>
struct TypeAt;

template<size_t Index, typename Head, typename... Tail>
struct TypeAt<Index, TypeList<Head, Tail...>> {
    using type = typename TypeAt<Index - 1, TypeList<Tail...>>::type;
};

template<typename Head, typename... Tail>
struct TypeAt<0, TypeList<Head, Tail...>> {
    using type = Head;
};

// Check if type exists in list
template<typename T, typename List>
struct Contains;

template<typename T, typename... Types>
struct Contains<T, TypeList<Types...>> {
    static constexpr bool value = (std::is_same_v<T, Types> || ...);
};

// Real-world: Compile-time lookup table generation
template<size_t Size>
struct SineLookupTable {
    static constexpr double PI = 3.14159265358979323846;

    double data[Size];

    constexpr SineLookupTable() : data{} {
        for (size_t i = 0; i < Size; ++i) {
            data[i] = compute_sin(2.0 * PI * i / Size);
        }
    }

private:
    // Taylor series approximation for sine (compile-time)
    static constexpr double compute_sin(double x) {
        double result = x;
        double term = x;
        for (int n = 1; n < 10; ++n) {
            term *= -x * x / ((2 * n) * (2 * n + 1));
            result += term;
        }
        return result;
    }
};

int main() {
    // Template metaprogramming results
    constexpr int fact5 = Factorial<5>::value;
    constexpr int pow2_10 = Power<2, 10>::value;
    constexpr int fib10 = Fibonacci<10>::value;

    std::cout << "5! = " << fact5 << "\n";        // 120
    std::cout << "2^10 = " << pow2_10 << "\n";    // 1024
    std::cout << "Fib(10) = " << fib10 << "\n";   // 55

    // Type list operations
    using SensorTypes = TypeList<LidarPoint, RadarReturn, CameraFrame>;
    constexpr size_t num_sensors = Length<SensorTypes>::value;
    std::cout << "Number of sensor types: " << num_sensors << "\n";  // 3

    // Check if type exists
    constexpr bool has_lidar = Contains<LidarPoint, SensorTypes>::value;
    constexpr bool has_gps = Contains<GpsCoordinate, SensorTypes>::value;
    std::cout << "Has LiDAR: " << has_lidar << "\n";  // true
    std::cout << "Has GPS: " << has_gps << "\n";      // false

    // Compile-time sine table (256 entries computed at compile time)
    constexpr SineLookupTable<256> sine_table;
    std::cout << "sin(π/2) ≈ " << sine_table.data[64] << "\n";  // ~1.0

    return 0;
}
```

This advanced example demonstrates:
- **Template recursion** for compile-time computation
- **Template specialization** for base cases
- **Type lists** and metaprogramming abstractions
- **Variadic templates** with fold expressions (C++17)
- **Compile-time lookup tables** for runtime efficiency

Template metaprogramming is Turing-complete: you can compute anything at compile time that you could compute at runtime, but with zero runtime overhead.

---

### INTERVIEW_QA: Comprehensive Questions

#### Q1: What is the difference between constexpr and const?
**Difficulty:** #beginner
**Category:** #fundamentals #syntax
**Concepts:** #constexpr #const #compile_time #runtime

**Answer:**
`const` means "read-only at runtime" (value set once, then immutable), while `constexpr` means "evaluable at compile time" (value computed during compilation).

**Code example:**
```cpp
const int x = get_runtime_value();    // ✅ const: runtime init
constexpr int y = get_runtime_value(); // ❌ Error: must be compile-time

constexpr int z = 42;                  // ✅ constexpr implies const
const int w = 42;                      // ✅ const (not necessarily constexpr)
```

**Explanation:**
`const` variables can be initialized with runtime values (like function returns), but `constexpr` variables must be initialized with compile-time constant expressions. All `constexpr` variables are implicitly `const`, but not all `const` variables are `constexpr`. `constexpr` functions can be used in constant expressions (like array sizes, template arguments), while regular `const` variables cannot.

**Key takeaway:** Use `constexpr` when you need compile-time constants; use `const` for runtime immutability.

---

#### Q2: Can a constexpr function call a non-constexpr function?
**Difficulty:** #intermediate
**Category:** #constexpr #functions
**Concepts:** #compile_time #runtime_deferral #context_dependent

**Answer:**
Yes, in C++14+, but the `constexpr` function will be evaluated at runtime if called in a runtime context.

**Code example:**
```cpp
int runtime_func(int x) {  // Not constexpr
    return x * 2;
}

constexpr int wrapper(int x) {
    return runtime_func(x);  // ✅ Allowed in C++14+
}

int main() {
    int a = wrapper(5);           // ✅ Evaluated at runtime
    // constexpr int b = wrapper(5); // ❌ Error: calls non-constexpr function
}
```

**Explanation:**
A `constexpr` function doesn't guarantee compile-time evaluation—it means "can be evaluated at compile time *if all inputs are compile-time constants and all called functions are constexpr*". If the function calls non-constexpr functions or receives runtime inputs, it's evaluated at runtime. In the example, `wrapper(5)` runs at runtime because `runtime_func` isn't constexpr, so `wrapper` cannot be evaluated at compile time.

**Key takeaway:** `constexpr` is a permission, not a mandate (except for `consteval`); calling non-constexpr functions forces runtime evaluation.

---

#### Q3: What happens if a static_assert condition fails?
**Difficulty:** #beginner
**Category:** #compile_time #assertions
**Concepts:** #static_assert #compile_error #validation

**Answer:**
Compilation stops with an error message showing the failed assertion and the provided error text.

**Code example:**
```cpp
template<typename T>
class OnlyIntegers {
    static_assert(std::is_integral<T>::value, "T must be an integer type");
    T value;
};

OnlyIntegers<int> valid;     // ✅ Compiles
// OnlyIntegers<float> invalid; // ❌ Error: static assertion failed:
                                //    T must be an integer type
```

**Explanation:**
`static_assert` performs compile-time checks. If the condition evaluates to `false`, the compiler emits an error with the provided message and stops compilation. This is useful for enforcing constraints (type requirements, size limits, configuration validation) that should never be violated. Unlike runtime assertions (`assert`), `static_assert` has zero runtime cost and catches errors before the program runs.

**Key takeaway:** Use `static_assert` to enforce compile-time invariants; failed assertions prevent compilation.

---

#### Q4: How does template instantiation depth limit affect template metaprogramming?
**Difficulty:** #advanced
**Category:** #templates #metaprogramming
**Concepts:** #template_recursion #instantiation_depth #compiler_limits

**Answer:**
Recursive template instantiation can exceed the compiler's default depth limit (usually 512-1024), causing compilation to fail with a "template instantiation depth exceeded" error.

**Code example:**
```cpp
template<int N>
struct Countdown {
    static constexpr int value = Countdown<N-1>::value + 1;
};

template<>
struct Countdown<0> {
    static constexpr int value = 0;
};

constexpr int c10 = Countdown<10>::value;     // ✅ OK
// constexpr int c2000 = Countdown<2000>::value; // ❌ Exceeds limit

// Workaround: Use constexpr function (no instantiation limit)
constexpr int countdown_func(int n) {
    return (n == 0) ? 0 : countdown_func(n-1) + 1;
}

constexpr int c2000 = countdown_func(2000);   // ✅ OK
```

**Explanation:**
Each recursive template instantiation creates a new type (e.g., `Countdown<2000>`, `Countdown<1999>`, ..., `Countdown<0>`), and compilers limit how deep this can go. The limit is configurable (`-ftemplate-depth=N` in GCC/Clang), but excessively deep recursion can cause very slow compilation. `constexpr` functions don't have this limitation because they use regular function recursion at compile time, not type instantiation.

**Key takeaway:** For deep recursion (>100 levels), prefer `constexpr` functions over template metaprogramming to avoid hitting instantiation depth limits.

---

#### Q5: What is the difference between if constexpr and a regular if statement in templates?
**Difficulty:** #intermediate
**Category:** #templates #control_flow
**Concepts:** #if_constexpr #compile_time #branch_elimination

**Answer:**
`if constexpr` performs compile-time branch elimination (discarded branches are never instantiated), while regular `if` instantiates both branches and checks at runtime.

**Code example:**
```cpp
template<typename T>
void process(T value) {
    if (std::is_integral_v<T>) {
        value++;  // ❌ Error for non-integral types (both branches instantiated)
    }
}

template<typename T>
void process_constexpr(T value) {
    if constexpr (std::is_integral_v<T>) {
        value++;  // ✅ OK: only instantiated for integral types
    }
}

process(3.14);          // ❌ Compile error: can't ++ a double
process_constexpr(3.14); // ✅ OK: ++ branch not instantiated
```

**Explanation:**
With regular `if`, the compiler must instantiate both branches for all template instantiations, even if only one branch runs. If a branch contains type-invalid code (like `value++` for a non-integral type), compilation fails. `if constexpr` eliminates discarded branches at compile time, so they're never instantiated. This enables type-dependent code paths that would otherwise be ill-formed.

**Key takeaway:** Use `if constexpr` for type-dependent logic in templates to avoid instantiating invalid code paths.

---

#### Q6: What is the purpose of consteval and how does it differ from constexpr?
**Difficulty:** #intermediate
**Category:** #cpp20 #compile_time
**Concepts:** #consteval #constexpr #immediate_functions #mandatory_evaluation

**Answer:**
`consteval` (C++20) creates immediate functions that **must** be evaluated at compile time, while `constexpr` functions **can** be evaluated at compile time but may run at runtime.

**Code example:**
```cpp
consteval int square_eval(int x) {
    return x * x;
}

constexpr int square_expr(int x) {
    return x * x;
}

int main() {
    constexpr int a = square_eval(5);   // ✅ Compile-time
    constexpr int b = square_expr(5);   // ✅ Compile-time

    int runtime_val = 10;
    // int c = square_eval(runtime_val); // ❌ Error: consteval requires constant
    int d = square_expr(runtime_val);   // ✅ OK: evaluated at runtime
}
```

**Explanation:**
`consteval` enforces compile-time evaluation: it's a compilation error to call a `consteval` function with runtime values. This is useful for configuration validation, embedded systems, and ensuring zero runtime overhead. `constexpr` is more flexible: it runs at compile time when possible, but can fall back to runtime. Use `consteval` when runtime evaluation should be impossible (e.g., safety-critical constant expressions).

**Key takeaway:** `consteval` guarantees compile-time evaluation; `constexpr` allows but doesn't require it.

---

#### Q7: Can constexpr functions have side effects?
**Difficulty:** #intermediate
**Category:** #constexpr #semantics
**Concepts:** #side_effects #pure_functions #compile_time

**Answer:**
No, constexpr functions evaluated at compile time cannot have side effects (I/O, global state modification), but they can have side effects when evaluated at runtime.

**Code example:**
```cpp
int global_counter = 0;

constexpr int increment_counter(int x) {
    // global_counter++;  // ❌ Not allowed in constant expression
    return x + 1;
}

int main() {
    constexpr int a = increment_counter(5);  // ✅ Compile-time (no side effects)
    int b = increment_counter(10);           // ✅ Runtime (side effects possible if uncommented)
}
```

**Explanation:**
Compile-time evaluation requires pure functions: no I/O, no global state mutation, no volatile access. This is enforced by the compiler for constant expressions. However, if a `constexpr` function is called at runtime, it's just a regular function and can have side effects (though this defeats the purpose of `constexpr`). Best practice: keep `constexpr` functions pure even for runtime calls.

**Key takeaway:** `constexpr` functions must be pure for compile-time evaluation; side effects force runtime evaluation.

---

#### Q8: What are type traits and how are they used?
**Difficulty:** #beginner
**Category:** #type_traits #templates
**Concepts:** #compile_time #type_introspection #metaprogramming

**Answer:**
Type traits provide compile-time information about types (e.g., `is_integral`, `is_pointer`, `is_const`), enabling conditional compilation and type-based logic.

**Code example:**
```cpp
#include <type_traits>

template<typename T>
void process(T value) {
    if constexpr (std::is_integral_v<T>) {
        std::cout << "Integer: " << value << "\n";
    } else if constexpr (std::is_floating_point_v<T>) {
        std::cout << "Float: " << value << "\n";
    }
}

static_assert(std::is_same_v<int, int>, "Same type");
static_assert(!std::is_same_v<int, const int>, "Different types (cv-qualifiers matter)");
```

**Explanation:**
Type traits are template classes/variables in `<type_traits>` that query type properties at compile time. They return `bool` values (accessed via `::value` or `_v` suffix in C++17+) or type aliases. Common uses: SFINAE, `if constexpr`, `static_assert`, and template constraints. They enable type-dependent code without runtime overhead.

**Key takeaway:** Type traits provide compile-time type introspection for conditional compilation and validation.

---

#### Q9: How do you write a custom type trait?
**Difficulty:** #advanced
**Category:** #type_traits #metaprogramming
**Concepts:** #template_specialization #compile_time #custom_traits

**Answer:**
Use template specialization and inherit from `std::true_type` or `std::false_type` to create compile-time boolean traits.

**Code example:**
```cpp
#include <type_traits>

// Primary template: default to false
template<typename T>
struct is_sensor_type : std::false_type {};

// Specializations for sensor types
template<>
struct is_sensor_type<LidarPoint> : std::true_type {};

template<>
struct is_sensor_type<RadarReturn> : std::true_type {};

template<>
struct is_sensor_type<CameraFrame> : std::true_type {};

// Helper variable template (C++17)
template<typename T>
inline constexpr bool is_sensor_type_v = is_sensor_type<T>::value;

// Usage
static_assert(is_sensor_type_v<LidarPoint>, "LidarPoint is a sensor type");
static_assert(!is_sensor_type_v<int>, "int is not a sensor type");
```

**Explanation:**
Custom type traits follow the same pattern as standard traits: a primary template (default case) and specializations (specific cases). Inheriting from `std::true_type` (`value = true`) or `std::false_type` (`value = false`) provides the boolean result. The `_v` helper (C++17) simplifies usage. This technique enables compile-time type categorization for generic programming.

**Key takeaway:** Custom type traits use template specialization with `std::true_type`/`std::false_type` to classify types at compile time.

---

#### Q10: What is the difference between std::is_same and typeid?
**Difficulty:** #intermediate
**Category:** #type_traits #rtti
**Concepts:** #compile_time #runtime #type_comparison

**Answer:**
`std::is_same` performs compile-time type comparison, while `typeid` performs runtime type identification (RTTI).

**Code example:**
```cpp
#include <type_traits>
#include <typeinfo>

int main() {
    // Compile-time comparison
    constexpr bool same = std::is_same_v<int, int>;  // true at compile time
    static_assert(std::is_same_v<int, int>, "Types must match");

    // Runtime comparison
    int x = 42;
    if (typeid(x) == typeid(int)) {  // Runtime check
        // ...
    }

    // Key difference:
    // std::is_same: known at compile time, zero runtime cost
    // typeid: evaluated at runtime, has cost (RTTI overhead)
}
```

**Explanation:**
`std::is_same` is a compile-time template that compares types exactly (including cv-qualifiers). It's evaluated during compilation and has zero runtime cost. `typeid` is a runtime operator that returns `std::type_info` objects, requiring RTTI support (can be disabled with `-fno-rtti`). Use `std::is_same` for template metaprogramming and static assertions; use `typeid` for runtime polymorphic type checks.

**Key takeaway:** `std::is_same` is compile-time (zero cost), `typeid` is runtime (RTTI overhead).

---

#### Q11: Why might a constexpr function fail to evaluate at compile time?
**Difficulty:** #intermediate
**Category:** #constexpr #debugging
**Concepts:** #compile_time #runtime_deferral #constant_expressions

**Answer:**
A `constexpr` function evaluates at runtime if: (1) inputs are not compile-time constants, (2) it calls non-constexpr functions, or (3) it performs operations not allowed in constant expressions.

**Code example:**
```cpp
constexpr int add(int a, int b) {
    return a + b;
}

int get_runtime_value() { return 42; }

int main() {
    constexpr int x = add(5, 10);       // ✅ Compile-time

    int runtime_val = get_runtime_value();
    int y = add(runtime_val, 10);       // ❌ Runtime (input not constant)

    // Force compile-time:
    // constexpr int z = add(runtime_val, 10);  // ❌ Compile error
}
```

**Explanation:**
`constexpr` is a permission, not a guarantee. For compile-time evaluation, all inputs must be constant expressions and all operations must be valid in constant contexts (no I/O, no reinterpret_cast, etc.). If any condition fails, the function runs at runtime. To force compile-time evaluation, assign to a `constexpr` variable or use in a context requiring constants (array size, template argument).

**Key takeaway:** `constexpr` functions evaluate at compile time only when all inputs and operations allow it; otherwise they run at runtime.

---

#### Q12: What is the purpose of std::integral_constant?
**Difficulty:** #advanced
**Category:** #type_traits #metaprogramming
**Concepts:** #integral_constant #compile_time #value_wrapping

**Answer:**
`std::integral_constant` wraps a compile-time constant value as a type, enabling type-based metaprogramming and value passing through template parameters.

**Code example:**
```cpp
#include <type_traits>

// std::integral_constant wraps a value as a type
using five = std::integral_constant<int, 5>;
using ten = std::integral_constant<int, 10>;

std::cout << five::value;     // 5
std::cout << five{}();        // 5 (operator() returns value)

// Common usage: true_type and false_type
static_assert(std::is_same_v<std::true_type, std::integral_constant<bool, true>>);
static_assert(std::is_same_v<std::false_type, std::integral_constant<bool, false>>);

// Custom: Fibonacci as types
template<int N>
struct Fib : std::integral_constant<int, Fib<N-1>{} + Fib<N-2>{}> {};

template<> struct Fib<0> : std::integral_constant<int, 0> {};
template<> struct Fib<1> : std::integral_constant<int, 1> {};

std::cout << Fib<10>::value;  // 55
```

**Explanation:**
`std::integral_constant` is a template class that stores a compile-time constant value as a type member (`value`) and provides a call operator to retrieve it. This enables passing values through type parameters rather than function parameters. `std::true_type` and `std::false_type` are specializations for `bool`. It's fundamental to type traits and metaprogramming, allowing algorithms to operate on types that encode values.

**Key takeaway:** `std::integral_constant` turns compile-time values into types, enabling value-based template metaprogramming.

---

#### Q13: Can you use constexpr with constructors? What does it enable?
**Difficulty:** #intermediate
**Category:** #constexpr #classes
**Concepts:** #constexpr_constructor #compile_time #literal_types

**Answer:**
Yes, `constexpr` constructors enable compile-time construction of class objects, making the class a literal type usable in constant expressions.

**Code example:**
```cpp
struct Point {
    float x, y;

    constexpr Point(float x, float y) : x(x), y(y) {}

    constexpr float distance() const {
        return std::sqrt(x*x + y*y);  // Requires constexpr sqrt (C++26)
    }
};

constexpr Point origin(0, 0);
constexpr Point p1(3, 4);

// Can use in constant expressions
constexpr float arr[int(origin.x) + 5] = {};  // Array size from constexpr object
static_assert(p1.x == 3.0f, "X coordinate check");
```

**Explanation:**
A `constexpr` constructor allows objects to be created at compile time if all initialization is from constant expressions. This makes the class a "literal type", usable in contexts requiring compile-time constants. Member functions can also be `constexpr`, enabling compile-time method calls. This is powerful for configuration objects, mathematical types (points, vectors, matrices), and embedded systems where compile-time initialization is critical.

**Key takeaway:** `constexpr` constructors enable compile-time object creation, making classes usable in constant expressions.

---

#### Q14: What is SFINAE and how does it relate to type traits?
**Difficulty:** #advanced
**Category:** #templates #metaprogramming
**Concepts:** #sfinae #enable_if #type_traits #template_substitution

**Answer:**
SFINAE (Substitution Failure Is Not An Error) allows template overload resolution to silently discard invalid candidates instead of erroring. Type traits enable SFINAE-based function selection.

**Code example:**
```cpp
#include <type_traits>

// Overload 1: Only for integral types
template<typename T>
std::enable_if_t<std::is_integral_v<T>, void>
process(T value) {
    std::cout << "Integer: " << value << "\n";
}

// Overload 2: Only for floating-point types
template<typename T>
std::enable_if_t<std::is_floating_point_v<T>, void>
process(T value) {
    std::cout << "Float: " << value << "\n";
}

process(42);     // Calls overload 1
process(3.14);   // Calls overload 2
// process(std::string("hi"));  // ❌ No matching overload
```

**Explanation:**
SFINAE says that if template substitution (replacing `T` with actual type) results in invalid code, that template candidate is silently removed from overload resolution (rather than causing an error). `std::enable_if` exploits this: if the condition is false, it doesn't define a `type` alias, causing substitution failure. Type traits provide the conditions. This enables type-based function overloading without `if constexpr`.

**Key takeaway:** SFINAE + type traits enable compile-time function selection based on type properties.

---

#### Q15: How do you prevent template instantiation depth issues?
**Difficulty:** #advanced
**Category:** #templates #performance
**Concepts:** #instantiation_depth #recursion_limits #constexpr_alternative

**Answer:**
Use `constexpr` functions instead of template recursion, increase compiler depth limits, or use iterative algorithms.

**Code example:**
```cpp
// ❌ Template recursion (hits depth limit for large N)
template<int N>
struct Factorial {
    static constexpr int value = N * Factorial<N-1>::value;
};

template<> struct Factorial<0> { static constexpr int value = 1; };

// ✅ constexpr function (no depth limit)
constexpr int factorial(int n) {
    return (n <= 1) ? 1 : n * factorial(n - 1);
}

// ✅ Even better: iterative
constexpr int factorial_iter(int n) {
    int result = 1;
    for (int i = 2; i <= n; ++i) result *= i;
    return result;
}

// Usage:
constexpr int f2000_template = Factorial<2000>::value;  // ❌ Depth exceeded
constexpr int f2000_func = factorial(2000);            // ✅ OK (but stack limit)
constexpr int f2000_iter = factorial_iter(2000);       // ✅ OK (no recursion)
```

**Explanation:**
Template metaprogramming recursion is limited by compiler instantiation depth (~512-1024 by default). Solutions: (1) Use `constexpr` functions (C++14+) which have higher stack limits, (2) Increase limit with `-ftemplate-depth=N`, (3) Use iterative algorithms instead of recursion. For most use cases, `constexpr` functions are superior: no depth limits, faster compilation, easier to read.

**Key takeaway:** Prefer `constexpr` functions over template recursion for deep computations to avoid instantiation depth limits.

---

#### Q16: What is constinit and when would you use it?
**Difficulty:** #intermediate
**Category:** #cpp20 #initialization
**Concepts:** #constinit #static_initialization #compile_time #thread_safety

**Answer:**
`constinit` (C++20) guarantees static/thread_local variables are initialized at compile time, preventing the static initialization order fiasco.

**Code example:**
```cpp
// ❌ Potential initialization order problem
int get_default() { return 42; }
const int x = get_default();  // Runtime init (order undefined across TUs)

// ✅ constinit: guaranteed compile-time initialization
constinit const int y = 42;   // Must be constant expression

// ✅ Mutable constinit variable (init at compile time, modify at runtime)
constinit int counter = 0;
counter++;  // OK: mutable

// ❌ Error: not a constant expression
// constinit int z = get_default();  // Compile error
```

**Explanation:**
`constinit` enforces that static/thread_local variables are initialized with constant expressions, avoiding runtime initialization (which can cause order-dependent bugs across translation units). Unlike `constexpr`, `constinit` variables can be mutable (modified at runtime). This is critical for globals in embedded systems or multi-threaded code where initialization order matters.

**Key takeaway:** Use `constinit` for static/thread_local variables to guarantee compile-time initialization and avoid order fiascos.

---

#### Q17: How does template argument deduction work with constexpr?
**Difficulty:** #advanced
**Category:** #templates #constexpr
**Concepts:** #template_deduction #auto #compile_time #type_inference

**Answer:**
Template arguments can be deduced from `constexpr` values, and `auto` can deduce `constexpr`-ness from the initializer.

**Code example:**
```cpp
template<auto Value>
struct Wrapper {
    static constexpr auto value = Value;
};

constexpr int x = 42;
Wrapper<x> w1;               // Deduces Wrapper<42>
Wrapper<100> w2;             // Explicit: Wrapper<100>

// auto deduction preserves constexpr
constexpr int y = 10;
auto a = y;                  // int a (not constexpr, copy of y)
constexpr auto b = y;        // constexpr int b = 10
const auto c = y;            // const int c = 10

// Template deduction with constexpr functions
template<typename T>
constexpr T add(T a, T b) { return a + b; }

constexpr auto result = add(5, 10);  // Deduces T=int, result is constexpr
```

**Explanation:**
C++17's `auto` template parameters allow deducing values (not just types). `constexpr` values can be used as template arguments, enabling value-parameterized types. `auto` in variable declarations doesn't preserve `constexpr`-ness unless explicitly marked `constexpr auto`. Template deduction works seamlessly with `constexpr` functions: if the result is assigned to a `constexpr` variable, it's evaluated at compile time.

**Key takeaway:** Use `constexpr auto` to preserve compile-time evaluation in deduced variables; `auto` template parameters enable value-based templates.

---

#### Q18: What are the limitations of C++11 constexpr functions?
**Difficulty:** #beginner
**Category:** #cpp11 #constexpr
**Concepts:** #compile_time #constexpr_restrictions #evolution

**Answer:**
C++11 `constexpr` functions can only have a single return statement, no loops, no local variables, and no mutable operations.

**Code example:**
```cpp
// ✅ C++11: Single return statement
constexpr int square(int x) {
    return x * x;
}

// ❌ C++11: Multiple statements (OK in C++14+)
constexpr int sum(int n) {
    int total = 0;  // ❌ C++11: local variable
    for (int i = 1; i <= n; ++i) {  // ❌ C++11: loop
        total += i;
    }
    return total;
}

// ✅ C++11: Workaround using recursion
constexpr int sum_c11(int n) {
    return (n <= 1) ? n : n + sum_c11(n - 1);
}
```

**Explanation:**
C++11's initial `constexpr` design was extremely restrictive: only a single `return` statement with a conditional expression (ternary operator `?:`). No loops, no mutable variables, no multiple statements. This forced recursive implementations for anything complex. C++14 relaxed these restrictions dramatically, allowing imperative-style code. C++11 code must use recursion and conditional expressions.

**Key takeaway:** C++11 `constexpr` functions are limited to single-expression recursions; C++14+ allows loops and local variables.

---

#### Q19: How do you debug constexpr functions that fail at compile time?
**Difficulty:** #intermediate
**Category:** #debugging #constexpr
**Concepts:** #compile_time #error_messages #debugging_techniques

**Answer:**
Use compiler errors to identify which operations aren't allowed in constant expressions, test with runtime calls first, and use `static_assert` to check intermediate values.

**Code example:**
```cpp
constexpr int buggy_func(int x) {
    int result = 0;
    // BUG: Forgot to return
    result = x * 2;
    // return result;  // ❌ Missing return
}

// Debugging technique 1: Test at runtime first
void test_runtime() {
    int val = buggy_func(5);  // May give warning about missing return
}

// Debugging technique 2: Use static_assert for intermediate checks
constexpr int debug_func(int x) {
    constexpr int step1 = x * 2;
    static_assert(step1 == 10, "Step 1 failed");  // Validate intermediate value
    return step1 + 5;
}

// Debugging technique 3: Check compilability in stages
constexpr int stage1(int x) { return x * 2; }
constexpr int stage2(int x) { return stage1(x) + 5; }
```

**Explanation:**
Compile-time errors can be cryptic. Debug strategies: (1) Test as a regular function first to catch logic errors, (2) Use `static_assert` to validate intermediate results, (3) Break complex functions into smaller `constexpr` functions, (4) Read compiler errors carefully—they often indicate which operation isn't allowed in constant expressions (e.g., "call to non-constexpr function"). Modern compilers (GCC 9+, Clang 10+) have improved `constexpr` error messages significantly.

**Key takeaway:** Debug `constexpr` functions by testing at runtime first, using `static_assert` for validation, and breaking into smaller functions.

---

#### Q20: What is the performance impact of using constexpr?
**Difficulty:** #intermediate
**Category:** #performance #optimization
**Concepts:** #compile_time #runtime_overhead #binary_size

**Answer:**
Compile-time evaluation has **zero** runtime overhead (result baked into binary), but may increase compilation time and binary size.

**Code example:**
```cpp
// Compile-time: zero runtime cost
constexpr int factorial(int n) {
    return (n <= 1) ? 1 : n * factorial(n - 1);
}

constexpr int fact10 = factorial(10);  // Computed at compile time
// Disassembly: just loads immediate value (mov eax, 3628800)

// Runtime: function call overhead
int runtime_fact(int n) {
    return (n <= 1) ? 1 : n * runtime_fact(n - 1);
}

int fact10_rt = runtime_fact(10);  // Recursive calls at runtime
// Disassembly: call instructions, stack setup, etc.
```

**Explanation:**
When a `constexpr` function is evaluated at compile time, the result is a literal constant in the binary—no runtime computation, no function call overhead. This is ideal for hot paths in real-time systems. However, tradeoffs: (1) longer compilation (compiler does more work), (2) larger binaries if many different constant expressions are used (each gets a unique value), (3) less flexibility (values fixed at compile time). Use `constexpr` for frequently-used constants and performance-critical calculations.

**Key takeaway:** Compile-time evaluation has zero runtime cost but increases compilation time; use for hot-path constants.

---

### PRACTICE_TASKS: Challenge Questions

#### Q1
```cpp
constexpr int add(int a, int b) {
    return a + b;
}

int main() {
    int x = 10;
    constexpr int y = add(5, x);
    std::cout << y;
}
```
What happens when you compile this code?

#### Q2
```cpp
constexpr int factorial(int n) {
    int result = 1;
    for (int i = 2; i <= n; ++i) {
        result *= i;
    }
    return result;
}

int main() {
    constexpr int f5 = factorial(5);
}
```
Will this compile in C++11? In C++14?

#### Q3
```cpp
template<typename T>
void process(T value) {
    if constexpr (std::is_integral_v<T>) {
        std::cout << value + 1 << "\n";
    } else {
        std::cout << value << "\n";
    }
}

int main() {
    process(42);
    process(std::string("hello"));
}
```
What is the output?

#### Q4
```cpp
static_assert(sizeof(int) == 8, "int must be 8 bytes");

int main() {
    return 0;
}
```
Will this compile on a typical 64-bit system?

#### Q5
```cpp
constexpr int divide(int a, int b) {
    return b != 0 ? a / b : 0;
}

int main() {
    constexpr int result = divide(10, 0);
}
```
What happens at compile time?

#### Q6
```cpp
template<int N>
struct Fib {
    static constexpr int value = Fib<N-1>::value + Fib<N-2>::value;
};

template<> struct Fib<0> { static constexpr int value = 0; };
template<> struct Fib<1> { static constexpr int value = 1; };

int main() {
    std::cout << Fib<5>::value;
}
```
What is the output?

#### Q7
```cpp
constexpr int foo(int x) {
    return x * 2;
}

int main() {
    int arr[foo(5)];
    std::cout << sizeof(arr) / sizeof(int);
}
```
What is printed?

#### Q8
```cpp
#include <type_traits>

static_assert(std::is_same_v<int, const int>, "Types match");

int main() {}
```
Will this compile?

#### Q9
```cpp
consteval int square(int x) {
    return x * x;
}

int main() {
    int runtime_val = 5;
    int result = square(runtime_val);
}
```
What happens?

#### Q10
```cpp
constexpr int max_value(int a, int b) {
    return (a > b) ? a : b;
}

int main() {
    constexpr int x = 10;
    constexpr int y = 20;
    constexpr int max_val = max_value(x, y);
    static_assert(max_val == 20);
}
```
Does this code compile successfully?

#### Q11
```cpp
template<typename T>
void print(T value) {
    if (std::is_integral_v<T>) {
        std::cout << "Integer\n";
    } else {
        std::cout << "Not integer\n";
    }
}

int main() {
    print(42);
    print(3.14);
}
```
What is the output?

#### Q12
```cpp
constexpr int compute(int n) {
    if (n < 0) throw std::invalid_argument("negative");
    return n * 2;
}

int main() {
    constexpr int result = compute(-5);
}
```
What happens at compile time?

#### Q13
```cpp
template<size_t N>
struct Array {
    int data[N];
    static_assert(N > 0, "Size must be positive");
};

int main() {
    Array<5> arr1;
    // Array<0> arr2;
}
```
What happens if you uncomment the second line?

#### Q14
```cpp
constexpr bool is_even(int x) {
    return x % 2 == 0;
}

int main() {
    if constexpr (is_even(10)) {
        std::cout << "Even\n";
    } else {
        std::cout << "Odd\n";
    }
}
```
What is the output?

#### Q15
```cpp
template<int N>
struct Countdown {
    static constexpr int value = Countdown<N-1>::value + 1;
};

template<>
struct Countdown<0> {
    static constexpr int value = 0;
};

int main() {
    std::cout << Countdown<10000>::value;
}
```
What happens during compilation?

#### Q16
```cpp
constexpr int global = 100;

constexpr int get_value() {
    return global;
}

int main() {
    constexpr int val = get_value();
    std::cout << val;
}
```
What is printed?

#### Q17
```cpp
template<typename T>
class Container {
    static_assert(std::is_trivially_copyable_v<T>,
                  "T must be trivially copyable");
    T data;
};

int main() {
    Container<int> c1;
    // Container<std::string> c2;
}
```
What happens if you uncomment the second line?

#### Q18
```cpp
constexpr int mystery(int n) {
    return n <= 1 ? 1 : mystery(n-1) + mystery(n-2);
}

int main() {
    constexpr int val = mystery(10);
    std::cout << val;
}
```
What is the output and what does this compute?

#### Q19
```cpp
#include <type_traits>

template<typename T>
void process(T value) {
    if constexpr (std::is_pointer_v<T>) {
        std::cout << "Pointer: " << *value << "\n";
    } else {
        std::cout << "Value: " << value << "\n";
    }
}

int main() {
    int x = 42;
    process(x);
    process(&x);
}
```
What is the output?

#### Q20
```cpp
constinit int counter = 0;

int main() {
    counter++;
    std::cout << counter;
}
```
Does this compile and if so, what is printed?

---

### QUICK_REFERENCE: Summary Tables and Answer Keys

#### Answer Key for Practice Questions

| Q# | Answer | Explanation | Key Concept |
|----|--------|-------------|-------------|
| 1 | Compile error | `x` is not a constant expression (runtime variable); `constexpr int y` requires compile-time initialization | constexpr requirements |
| 2 | C++11: No<br>C++14: Yes | C++11 forbids loops and mutable variables in constexpr; C++14 allows them | constexpr evolution |
| 3 | 43<br>hello | `if constexpr` branches based on type: integral types print `value+1`, others print `value` | if constexpr |
| 4 | No (typically) | Most 64-bit systems have `sizeof(int) == 4`, so static_assert fails; compilation error | static_assert |
| 5 | Evaluates to 0 | Division by zero in constexpr is defined behavior (returns 0 with ternary guard); compiles and `result = 0` | constexpr safety |
| 6 | 5 | Fib<5> = 3+2 = 5 (Fibonacci sequence: 0,1,1,2,3,5...) | Template metaprogramming |
| 7 | 10 | Array size is `foo(5) = 10` elements; `sizeof(arr)/sizeof(int) = 40/4 = 10` | constexpr in array size |
| 8 | No | `std::is_same` checks exact types; `int` ≠ `const int` (cv-qualifiers differ) | Type comparison |
| 9 | Compile error | `consteval` requires compile-time constant argument; `runtime_val` is not constant | consteval restriction |
| 10 | Yes | All values are compile-time constants; `max_value(10, 20) = 20`; static_assert passes | constexpr validation |
| 11 | Integer<br>Not integer | Regular `if` (not `if constexpr`) evaluates at runtime; checks type and prints accordingly | Runtime vs compile-time |
| 12 | Compile error | Throwing exception in constexpr function requires runtime context; compile-time evaluation can't throw | Exception limitations |
| 13 | Compile error | `static_assert(0 > 0)` fails; compilation stops with "Size must be positive" message | static_assert enforcement |
| 14 | Even | `if constexpr (is_even(10))` evaluates to `if constexpr (true)` at compile time; only Even branch compiled | Compile-time branching |
| 15 | Compile error (likely) | Template instantiation depth (10000 levels) exceeds default compiler limit (~512-1024); "depth exceeded" error | Instantiation depth limit |
| 16 | 100 | `global` is constexpr (compile-time constant); `get_value()` returns it at compile time; prints 100 | constexpr variables |
| 17 | Compile error | `std::string` is not trivially copyable; static_assert fails with error message | Type trait validation |
| 18 | 89 | Computes Fibonacci sequence via recursion; `mystery(10) = Fib(11) = 89` | constexpr recursion |
| 19 | Value: 42<br>Pointer: 42 | `if constexpr` selects branch at compile time based on pointer-ness; first call prints value, second dereferences pointer | Type-dependent logic |
| 20 | Yes, prints 1 | `constinit` ensures compile-time init but allows runtime mutation; `counter++` runs at runtime, prints 1 | constinit mutability |

---

#### constexpr Evolution Timeline

| C++ Version | Allowed in constexpr functions | Example |
|-------------|--------------------------------|---------|
| C++11 | Single return statement only | `return (x > 0) ? x : -x;` |
| C++14 | Loops, branches, local variables, multiple returns | `int sum = 0; for(...) sum += i; return sum;` |
| C++17 | Lambda expressions, if constexpr | `if constexpr (...) { }` |
| C++20 | Virtual functions, try-catch, dynamic_cast, consteval | `consteval int foo() { }` |
| C++23 | static, thread_local variables in constexpr | |

---

#### Compile-Time Features Comparison

| Feature | Evaluation Time | Can Defer to Runtime? | Primary Use Case |
|---------|----------------|----------------------|------------------|
| `const` | Runtime initialization, compile-time immutability | N/A (not a function) | Read-only variables |
| `constexpr` | Compile-time if possible | Yes | Flexible constants/functions |
| `consteval` | Compile-time mandatory | No | Strict compile-time only |
| `constinit` | Compile-time initialization only | N/A (for statics) | Static initialization order |
| `static_assert` | Compile-time validation | N/A | Enforce constraints |
| `if constexpr` | Compile-time branching | N/A | Type-dependent code |
| Template metaprogramming | Compile-time | No | Type/value computation |

---

#### Common Type Traits

| Trait | Checks | Example |
|-------|--------|---------|
| `std::is_same<T, U>` | T and U are identical types | `is_same_v<int, int> == true` |
| `std::is_integral<T>` | T is integer type | `is_integral_v<int> == true` |
| `std::is_floating_point<T>` | T is float/double | `is_floating_point_v<float> == true` |
| `std::is_pointer<T>` | T is pointer | `is_pointer_v<int*> == true` |
| `std::is_reference<T>` | T is reference | `is_reference_v<int&> == true` |
| `std::is_const<T>` | T is const-qualified | `is_const_v<const int> == true` |
| `std::is_arithmetic<T>` | T is integral or floating-point | `is_arithmetic_v<int> == true` |
| `std::is_trivially_copyable<T>` | T can be memcpy'd | `is_trivially_copyable_v<int> == true` |

---

#### When to Use Each Compile-Time Feature

| Scenario | Best Feature | Reason |
|----------|-------------|--------|
| Mathematical constants | `constexpr` variable | Zero runtime cost, clear intent |
| Configuration validation | `static_assert` + type traits | Fails at compile time, prevents bugs |
| Type-dependent algorithms | `if constexpr` | Branch elimination, zero overhead |
| Compile-time computation | `constexpr` function | Flexible (runtime fallback available) |
| Strict compile-time only | `consteval` | No runtime escape, guaranteed compile-time |
| Static initialization order | `constinit` | Prevents order fiasco, compile-time init |
| Template value computation | Template metaprogramming | Type-based computation, legacy support |
| Type checking/constraints | Type traits + `static_assert` | Compile-time type safety |

---

#### Performance Characteristics

| Operation | Compilation Time | Binary Size | Runtime Cost |
|-----------|-----------------|-------------|--------------|
| `constexpr` compile-time eval | +++ (longer) | + (slightly larger) | None (literal value) |
| `constexpr` runtime eval | + (minimal) | ++ (function code) | Same as normal function |
| Template metaprogramming | ++++ (very long for deep recursion) | + (minimal type instantiation) | None (values in types) |
| `static_assert` | + (validation only) | None (no runtime code) | None |
| `if constexpr` | + (one branch per instantiation) | - (smaller, dead code eliminated) | None (eliminated branches) |

---

#### Autonomous Driving Use Cases

| Use Case | Feature | Benefit |
|----------|---------|---------|
| Sensor calibration matrix validation | `static_assert` + constexpr dimensions | Compile-time dimension mismatch detection |
| CRC32 hash for string IDs | `constexpr` CRC function | Zero runtime hashing, fast switch-case on strings |
| Sine/cosine lookup tables | `constexpr` constructor | Tables computed at compile time, instant runtime access |
| Type-specific sensor processing | `if constexpr` + type traits | Zero overhead type dispatch, no virtual calls |
| Configuration constants (max speed, sensor count) | `constexpr` variables | Hardcoded into binary, no memory access |
| Matrix multiplication dimension checks | Template metaprogramming + `static_assert` | Impossible dimension errors caught at compile time |
| Fixed-size buffers (LiDAR points) | `constexpr` size calculation | Buffer size computed at compile time, no runtime malloc |
