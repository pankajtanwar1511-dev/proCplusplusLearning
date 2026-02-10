# TOPIC: C++17 Template Improvements and Additional Features
**Part 3 of 3 for Chapter 16 - C++17 Features**

## THEORY_SECTION

### Class Template Argument Deduction (CTAD)

**What is CTAD?**
C++17 introduces Class Template Argument Deduction (CTAD), which allows the compiler to automatically deduce template arguments from constructor arguments, eliminating the need to explicitly specify them.

**Before C++17:**
```cpp
std::pair<int, double> p1(42, 3.14);  // Must specify types
std::vector<int> v1 = {1, 2, 3};      // Must specify element type
```

**With C++17 CTAD:**
```cpp
std::pair p2(42, 3.14);               // Deduces std::pair<int, double>
std::vector v2 = {1, 2, 3};           // Deduces std::vector<int>
```

**How CTAD Works:**
1. Compiler examines constructor arguments
2. Matches them against available constructors
3. Deduces template parameters from constructor parameter types
4. Uses deduction guides if provided for complex cases

**Deduction Guides:**
Custom deduction guides allow you to control how CTAD works for your classes:

```cpp
template<typename T>
struct Container {
    Container(T val) : data(val) {}
    T data;
};

// Deduction guide for initializer_list
template<typename T>
Container(std::initializer_list<T>) -> Container<std::vector<T>>;

Container c1(42);              // Deduces Container<int>
Container c2{1, 2, 3};         // Uses guide: Container<std::vector<int>>
```

**When CTAD Doesn't Work:**
- Template parameters not deducible from constructor arguments
- Ambiguous deduction (multiple possible types)
- User-defined constructors without deduction guides in some cases

**Autonomous Driving Example:**
```cpp
// Before C++17
std::pair<std::string, Coordinate> waypoint1("Start", Coordinate{0, 0});

// With C++17 CTAD
std::pair waypoint2("Start", Coordinate{0, 0});  // Cleaner, no redundancy
```

### Fold Expressions

**What are Fold Expressions?**
Fold expressions provide a compact way to perform operations on all elements of a parameter pack using binary operators. They eliminate the need for recursive template instantiation for variadic templates.

**Syntax:**
1. **Unary Right Fold:** `(pack op ...)`  → `(E1 op (E2 op (E3 op E4)))`
2. **Unary Left Fold:** `(... op pack)`  → `(((E1 op E2) op E3) op E4)`
3. **Binary Right Fold:** `(pack op ... op init)`  → `(E1 op (E2 op (E3 op init)))`
4. **Binary Left Fold:** `(init op ... op pack)`  → `(((init op E1) op E2) op E3)`

**Supported Operators:**
```
+  -  *  /  %  ^  &  |  =  <  >  <<  >>
+=  -=  *=  /=  %=  ^=  &=  |=  <<=  >>=
==  !=  <=  >=  &&  ||  ,  .*  ->*
```

**Basic Examples:**

```cpp
// Sum all arguments
template<typename... Args>
auto sum(Args... args) {
    return (args + ...);  // Unary right fold
}
sum(1, 2, 3, 4);  // Returns 10

// All true (logical AND)
template<typename... Args>
bool all_true(Args... args) {
    return (args && ...);
}
all_true(true, true, false);  // Returns false

// Print all arguments
template<typename... Args>
void print_all(Args... args) {
    (std::cout << ... << args) << '\n';  // Left fold with <<
}
print_all("Speed: ", 60, " km/h");  // Prints: Speed: 60 km/h
```

**Fold with Initial Value:**
```cpp
template<typename... Args>
auto sum_with_init(Args... args) {
    return (0 + ... + args);  // Binary left fold with init value 0
}
sum_with_init();  // Returns 0 (safe for empty pack)
```

**Important: Empty Parameter Packs:**
- For `&&`: empty fold evaluates to `true`
- For `||`: empty fold evaluates to `false`
- For `,`: empty fold evaluates to `void()`
- For all other operators: ill-formed (compilation error)

**Autonomous Driving Example:**
```cpp
// Validate all sensors are operational
template<typename... Sensors>
bool all_sensors_ready(Sensors&&... sensors) {
    return (... && sensors.is_ready());  // Fold with &&
}

// Aggregate multiple sensor readings
template<typename... Readings>
double average_readings(Readings... readings) {
    constexpr size_t count = sizeof...(readings);
    return (readings + ...) / count;
}

// Execute multiple control commands
template<typename... Commands>
void execute_all(Commands&&... cmds) {
    (cmds.execute(), ...);  // Fold with comma operator
}
```

### constexpr Enhancements in C++17

**constexpr Lambda:**
C++17 allows lambdas to be implicitly constexpr if they satisfy constexpr requirements:

```cpp
constexpr auto square = [](int x) { return x * x; };
constexpr int result = square(5);  // Computed at compile time

// Can be used in constant expressions
std::array<int, square(3)> arr;  // Array of size 9
```

**constexpr if:**
Already covered in Topic 1, but worth noting it's a major enhancement for compile-time programming.

### STL Improvements in C++17

**1. insert_or_assign and try_emplace (for maps):**

These methods improve map operations by reducing unnecessary copies and moves:

```cpp
std::map<std::string, Sensor> sensors;

// insert_or_assign: insert if key doesn't exist, assign if it does
sensors.insert_or_assign("lidar", Sensor{/*...*/});

// try_emplace: only constructs value if insertion happens
sensors.try_emplace("camera", /*constructor args*/);
```

**Advantages:**
- `try_emplace`: Never moves key, constructs in-place only if needed
- `insert_or_assign`: Clearer intent than operator[] or insert

**2. std::scoped_lock (Deadlock-Free Locking):**

Multi-mutex RAII lock that prevents deadlock:

```cpp
std::mutex m1, m2;

void f1() {
    std::scoped_lock lock(m1, m2);  // Locks both in safe order
    // ...
}

void f2() {
    std::scoped_lock lock(m2, m1);  // Different order, still safe!
    // ...
}
```

**Benefits:**
- Automatically acquires multiple mutexes in deadlock-free order
- RAII: releases on scope exit
- More convenient than std::lock + std::lock_guard

**3. Parallel Algorithms (std::execution):**

C++17 adds execution policies for parallel and vectorized algorithm execution:

```cpp
#include <execution>
#include <algorithm>

std::vector<int> data = {/*...*/};

// Sequential (default)
std::sort(data.begin(), data.end());

// Parallel
std::sort(std::execution::par, data.begin(), data.end());

// Parallel + Vectorized
std::sort(std::execution::par_unseq, data.begin(), data.end());

// Sequenced (explicitly sequential)
std::sort(std::execution::seq, data.begin(), data.end());
```

**Execution Policies:**
- `std::execution::seq` - Sequential execution
- `std::execution::par` - Parallel execution (multi-threaded)
- `std::execution::par_unseq` - Parallel + vectorized (SIMD)
- `std::execution::unseq` - Vectorized only (C++20)

**Supported Algorithms:** sort, for_each, transform, reduce, find, count, etc.

**Autonomous Driving Example:**
```cpp
// Process large point cloud in parallel
std::vector<Point3D> point_cloud = lidar.get_points();
std::for_each(std::execution::par,
              point_cloud.begin(),
              point_cloud.end(),
              [](Point3D& p) { p.apply_transformation(/*...*/); });

// Parallel obstacle detection
auto obstacle_count = std::count_if(
    std::execution::par,
    point_cloud.begin(),
    point_cloud.end(),
    [](const Point3D& p) { return is_obstacle(p); }
);
```

**4. std::to_chars and std::from_chars (Low-Level Conversion):**

Fast, locale-independent numeric conversions without allocation:

```cpp
char buffer[50];

// int to string
auto [ptr, ec] = std::to_chars(buffer, buffer + sizeof(buffer), 12345);
if (ec == std::errc{}) {
    std::string_view result(buffer, ptr - buffer);  // "12345"
}

// string to int
int value;
std::from_chars_result res = std::from_chars(buffer, ptr, value);
if (res.ec == std::errc{}) {
    // value now contains 12345
}
```

**Benefits over stringstream:**
- 3-10x faster
- No dynamic allocation
- Locale-independent
- No exceptions
- Round-trip guarantee for floating point

### Miscellaneous C++17 Features

**1. Nested Namespaces:**

Simplified syntax for nested namespace declarations:

```cpp
// Before C++17
namespace company {
    namespace autonomous {
        namespace perception {
            class LidarSensor { };
        }
    }
}

// C++17
namespace company::autonomous::perception {
    class LidarSensor { };
}
```

**2. Attributes:**

**[[nodiscard]]** - Warns if function return value is discarded:
```cpp
[[nodiscard]] std::optional<Route> find_route(Point start, Point end);

find_route(A, B);  // Warning: ignoring important return value!
```

**[[maybe_unused]]** - Suppresses unused variable warnings:
```cpp
void process([[maybe_unused]] int debug_flag) {
    #ifdef DEBUG
        std::cout << debug_flag;
    #endif
}
```

**[[fallthrough]]** - Documents intentional switch case fallthrough:
```cpp
switch (state) {
    case State::INIT:
        initialize();
        [[fallthrough]];  // Intentional fallthrough
    case State::RUNNING:
        process();
        break;
}
```

**3. Hexadecimal Floating-Point Literals:**

```cpp
double val = 0x1.2p3;  // 1.125 * 2^3 = 9.0
```

**4. Direct List Initialization of Enums:**

```cpp
enum class Color { Red, Green, Blue };
Color c{0};  // Direct initialization with underlying value
```

## EDGE_CASES

### Edge Case 1: CTAD Ambiguity with Multiple Constructors

**Problem:** CTAD can fail when multiple constructors could match.

```cpp
template<typename T>
struct Container {
    Container(T val);
    Container(T* ptr, size_t size);
};

// Ambiguous: which constructor?
Container c(data);  // Error if data could match both
```

**Solution:** Provide explicit deduction guides or specify template arguments.

```cpp
template<typename T>
Container(T) -> Container<T>;

template<typename T>
Container(T*, size_t) -> Container<T>;
```

**Key Insight:** CTAD works best with unambiguous constructors or explicit deduction guides.

### Edge Case 2: Fold Expression with Empty Parameter Pack

**Problem:** Most operators cause compilation errors with empty packs.

```cpp
template<typename... Args>
auto product(Args... args) {
    return (args * ...);  // Error if args is empty!
}

product();  // Compilation error
```

**Solution:** Use binary fold with initial value:

```cpp
template<typename... Args>
auto product(Args... args) {
    return (1 * ... * args);  // OK: returns 1 for empty pack
}
```

**Special Cases:**
- `&&` → empty fold = `true`
- `||` → empty fold = `false`
- `,` → empty fold = `void()`
- All other operators → ill-formed

### Edge Case 3: Fold Expression Short-Circuit Evaluation

**Problem:** Fold expressions DO support short-circuit evaluation for `&&` and `||`.

```cpp
template<typename... Args>
bool all_true(Args... args) {
    return (... && args);
}

bool expensive_check() { /* costly operation */ return false; }

// If first arg is false, expensive_check() is NOT called
all_true(false, expensive_check());  // Short-circuits!
```

**But:** All arguments are evaluated before folding begins:

```cpp
// This WILL throw even though && would short-circuit
all_true(true, false, throw std::runtime_error("oops"));  // Throws!
```

**Key Insight:** Short-circuiting applies during fold operation, not during argument evaluation.

### Edge Case 4: Parallel Algorithm Thread Safety

**Problem:** Using parallel algorithms with non-thread-safe operations causes data races.

```cpp
int counter = 0;
std::vector<int> data = {1, 2, 3, 4, 5};

// DATA RACE! Multiple threads write to counter
std::for_each(std::execution::par, data.begin(), data.end(),
              [&counter](int) { counter++; });  // UB!
```

**Solution:** Use atomic operations or avoid shared state:

```cpp
std::atomic<int> counter{0};
std::for_each(std::execution::par, data.begin(), data.end(),
              [&counter](int) { counter++; });  // Safe
```

**Key Insight:** Parallel execution policies require thread-safe operations on shared data.

### Edge Case 5: std::to_chars Buffer Overflow

**Problem:** std::to_chars doesn't null-terminate and can fail silently.

```cpp
char buf[5];
auto [ptr, ec] = std::to_chars(buf, buf + 5, 123456);  // Too large!

if (ec == std::errc::value_too_large) {
    // Buffer was too small!
}

// buf is NOT null-terminated! Must check ec and use ptr
std::string result(buf, ptr);  // Correct: use range
```

**Key Insight:** Always check error code and use pointer range, never assume null termination.

## CODE_EXAMPLES

### Example 1: CTAD with Custom Deduction Guides

**Scenario:** Create a coordinate system with automatic type deduction for autonomous vehicle positioning.

```cpp
#include <iostream>
#include <vector>
#include <initializer_list>

template<typename T>
class Coordinate {
public:
    T x, y;

    Coordinate(T x_val, T y_val) : x(x_val), y(y_val) {}

    void print() const {
        std::cout << "(" << x << ", " << y << ")\n";
    }
};

// Deduction guide for aggregate initialization
template<typename T>
Coordinate(T, T) -> Coordinate<T>;

int main() {
    // CTAD automatically deduces types
    Coordinate pos1(10.5, 20.3);      // Coordinate<double>
    Coordinate pos2(100, 200);        // Coordinate<int>

    pos1.print();  // (10.5, 20.3)
    pos2.print();  // (100, 200)

    // Works with std containers too
    std::pair waypoint("Start", Coordinate(0.0, 0.0));
    // Type: std::pair<const char*, Coordinate<double>>

    return 0;
}
```

**Explanation:**
- CTAD eliminates redundant type specifications
- Deduction guide ensures correct type deduction from constructor args
- Makes code cleaner and less error-prone
- Particularly useful with complex nested types

**Output:**
```
(10.5, 20.3)
(100, 200)
```

### Example 2: Fold Expressions for Sensor Validation

**Scenario:** Validate multiple sensor states using fold expressions for autonomous vehicle safety checks.

```cpp
#include <iostream>
#include <string>

class Sensor {
    std::string name;
    bool ready;

public:
    Sensor(std::string n, bool r) : name(std::move(n)), ready(r) {}

    bool is_ready() const { return ready; }
    std::string get_name() const { return name; }
};

// Check if all sensors are ready
template<typename... Sensors>
bool all_sensors_ready(const Sensors&... sensors) {
    return (... && sensors.is_ready());  // Left fold with &&
}

// Count ready sensors
template<typename... Sensors>
int count_ready_sensors(const Sensors&... sensors) {
    return (0 + ... + (sensors.is_ready() ? 1 : 0));
}

// Print all sensor names
template<typename... Sensors>
void print_sensor_names(const Sensors&... sensors) {
    std::cout << "Sensors: ";
    ((std::cout << sensors.get_name() << " "), ...);
    std::cout << "\n";
}

int main() {
    Sensor lidar("LIDAR", true);
    Sensor camera("Camera", true);
    Sensor radar("RADAR", false);
    Sensor gps("GPS", true);

    std::cout << "All ready: " << std::boolalpha
              << all_sensors_ready(lidar, camera, radar, gps) << "\n";

    std::cout << "Ready count: " << count_ready_sensors(lidar, camera, radar, gps) << "\n";

    print_sensor_names(lidar, camera, radar, gps);

    // With all sensors ready
    std::cout << "All ready: " << all_sensors_ready(lidar, camera, gps) << "\n";

    return 0;
}
```

**Explanation:**
- `(... && sensors.is_ready())` creates AND chain of all ready checks
- `(0 + ... + expr)` sums boolean conversions to count ready sensors
- `((std::cout << ...), ...)` uses comma operator for sequential printing
- Fold expressions eliminate need for recursive templates
- More readable than traditional variadic template approaches

**Output:**
```
All ready: false
Ready count: 3
Sensors: LIDAR Camera RADAR GPS
All ready: true
```

### Example 3: Parallel Algorithm for Point Cloud Processing

**Scenario:** Process large LiDAR point cloud in parallel for obstacle detection.

```cpp
#include <iostream>
#include <vector>
#include <algorithm>
#include <execution>
#include <random>
#include <chrono>

struct Point3D {
    double x, y, z;

    bool is_obstacle() const {
        // Simple heuristic: points above ground level
        return z > 0.5;
    }

    void apply_filter() {
        // Noise reduction (simplified)
        x = std::round(x * 10) / 10.0;
        y = std::round(y * 10) / 10.0;
        z = std::round(z * 10) / 10.0;
    }
};

std::vector<Point3D> generate_point_cloud(size_t count) {
    std::vector<Point3D> cloud;
    cloud.reserve(count);

    std::random_device rd;
    std::mt19937 gen(rd());
    std::uniform_real_distribution<> dis(-10.0, 10.0);

    for (size_t i = 0; i < count; ++i) {
        cloud.push_back({dis(gen), dis(gen), dis(gen)});
    }

    return cloud;
}

int main() {
    const size_t POINT_COUNT = 1'000'000;
    auto cloud = generate_point_cloud(POINT_COUNT);

    std::cout << "Processing " << POINT_COUNT << " points...\n";

    // Sequential filtering
    auto cloud_seq = cloud;
    auto start_seq = std::chrono::high_resolution_clock::now();

    std::for_each(std::execution::seq,
                  cloud_seq.begin(),
                  cloud_seq.end(),
                  [](Point3D& p) { p.apply_filter(); });

    auto end_seq = std::chrono::high_resolution_clock::now();
    auto duration_seq = std::chrono::duration_cast<std::chrono::milliseconds>(end_seq - start_seq);

    // Parallel filtering
    auto cloud_par = cloud;
    auto start_par = std::chrono::high_resolution_clock::now();

    std::for_each(std::execution::par,
                  cloud_par.begin(),
                  cloud_par.end(),
                  [](Point3D& p) { p.apply_filter(); });

    auto end_par = std::chrono::high_resolution_clock::now();
    auto duration_par = std::chrono::duration_cast<std::chrono::milliseconds>(end_par - start_par);

    // Count obstacles in parallel
    auto obstacle_count = std::count_if(
        std::execution::par,
        cloud.begin(),
        cloud.end(),
        [](const Point3D& p) { return p.is_obstacle(); }
    );

    std::cout << "Sequential: " << duration_seq.count() << " ms\n";
    std::cout << "Parallel: " << duration_par.count() << " ms\n";
    std::cout << "Speedup: " << static_cast<double>(duration_seq.count()) / duration_par.count() << "x\n";
    std::cout << "Obstacles detected: " << obstacle_count << "\n";

    return 0;
}
```

**Explanation:**
- `std::execution::seq` - explicit sequential execution for baseline
- `std::execution::par` - parallel execution across multiple threads
- `std::for_each` with parallel policy automatically distributes work
- `std::count_if` with parallel policy for efficient counting
- Significant speedup for computationally intensive operations
- Note: Requires compiler/library support (GCC with TBB, MSVC, etc.)

**Sample Output:**
```
Processing 1000000 points...
Sequential: 45 ms
Parallel: 12 ms
Speedup: 3.75x
Obstacles detected: 498234
```

### Example 4: std::scoped_lock for Multi-Sensor Synchronization

**Scenario:** Safely update multiple sensor buffers from different threads without deadlock.

```cpp
#include <iostream>
#include <mutex>
#include <thread>
#include <vector>
#include <chrono>

class SensorBuffer {
    std::mutex mtx;
    std::vector<double> data;
    std::string name;

public:
    SensorBuffer(std::string n) : name(std::move(n)) {}

    void add_reading(double value) {
        std::lock_guard<std::mutex> lock(mtx);
        data.push_back(value);
    }

    std::mutex& get_mutex() { return mtx; }

    size_t size() const { return data.size(); }

    void sync_with(SensorBuffer& other, double value1, double value2) {
        // Deadlock-free locking of both buffers
        std::scoped_lock lock(mtx, other.mtx);

        data.push_back(value1);
        other.data.push_back(value2);

        std::cout << "Synced " << name << " with " << other.name << "\n";
    }
};

int main() {
    SensorBuffer lidar("LIDAR");
    SensorBuffer camera("Camera");

    // Thread 1: sync LIDAR with Camera
    std::thread t1([&]() {
        for (int i = 0; i < 5; ++i) {
            lidar.sync_with(camera, i * 1.0, i * 2.0);
            std::this_thread::sleep_for(std::chrono::milliseconds(10));
        }
    });

    // Thread 2: sync Camera with LIDAR (reversed order!)
    std::thread t2([&]() {
        for (int i = 0; i < 5; ++i) {
            camera.sync_with(lidar, i * 3.0, i * 4.0);
            std::this_thread::sleep_for(std::chrono::milliseconds(10));
        }
    });

    t1.join();
    t2.join();

    std::cout << "LIDAR readings: " << lidar.size() << "\n";
    std::cout << "Camera readings: " << camera.size() << "\n";

    return 0;
}
```

**Explanation:**
- `std::scoped_lock` locks multiple mutexes in deadlock-free order
- Thread 1 locks (lidar, camera), Thread 2 locks (camera, lidar)
- Without `scoped_lock`, this would deadlock with separate lock_guards
- RAII ensures both mutexes released on exception or return
- Safer and more convenient than `std::lock` + `std::lock_guard`

**Output:**
```
Synced LIDAR with Camera
Synced Camera with LIDAR
Synced LIDAR with Camera
Synced Camera with LIDAR
...
LIDAR readings: 10
Camera readings: 10
```

### Example 5: constexpr Lambda for Compile-Time Computation

**Scenario:** Compute lookup tables at compile time for autonomous vehicle trajectory calculations.

```cpp
#include <iostream>
#include <array>
#include <cmath>

// constexpr lambda for compile-time computation
constexpr auto compute_steering_angle = [](double curvature) {
    return curvature * 45.0;  // Simplified: max 45 degrees
};

// Generate lookup table at compile time
template<size_t N>
constexpr auto generate_steering_table() {
    std::array<double, N> table{};

    constexpr auto compute = [](size_t i) {
        double curvature = static_cast<double>(i) / N;
        return compute_steering_angle(curvature);
    };

    for (size_t i = 0; i < N; ++i) {
        table[i] = compute(i);
    }

    return table;
}

// Compile-time constant
constexpr auto STEERING_TABLE = generate_steering_table<100>();

int main() {
    // Access compile-time computed values at runtime
    std::cout << "Steering angles (first 10 entries):\n";
    for (size_t i = 0; i < 10; ++i) {
        std::cout << "Curvature " << i / 100.0 << " -> "
                  << STEERING_TABLE[i] << " degrees\n";
    }

    // Use in constant expression
    constexpr double angle_at_50 = STEERING_TABLE[50];
    std::cout << "\nAngle at 50% curvature: " << angle_at_50 << " degrees\n";

    // Lambda can be used in constexpr context
    static_assert(compute_steering_angle(0.5) == 22.5);

    return 0;
}
```

**Explanation:**
- Lambdas are implicitly constexpr in C++17 if they satisfy requirements
- Used to generate lookup tables at compile time
- Zero runtime overhead - all computation done during compilation
- `constexpr` lambda can be used in constant expressions
- Useful for physics calculations, math tables, config values

**Output:**
```
Steering angles (first 10 entries):
Curvature 0 -> 0 degrees
Curvature 0.01 -> 0.45 degrees
Curvature 0.02 -> 0.9 degrees
...
Angle at 50% curvature: 22.5 degrees
```

## INTERVIEW_QA

### Question 1
**Difficulty:** Medium
**Category:** CTAD
**Concepts:** Class template argument deduction, deduction guides

**Question:** What is the output of this code? Will it compile?

```cpp
template<typename T>
struct Container {
    T value;
    Container(T v) : value(v) {}
};

int main() {
    Container c1(42);          // Line A
    Container c2 = {3.14};     // Line B
    Container c3{std::string("hello")};  // Line C
}
```

**Answer:**
- Line A: Compiles. CTAD deduces `Container<int>`
- Line B: Compiles. CTAD deduces `Container<double>`
- Line C: Compiles. CTAD deduces `Container<std::string>`
- No output (no print statements)

**Explanation:**
C++17 CTAD allows the compiler to deduce template arguments from constructor arguments. All three lines successfully deduce the template parameter `T` from the constructor argument type. The deduction works because there's a clear mapping from constructor parameter to template parameter.

**Key Takeaway:** CTAD works when template parameters can be unambiguously deduced from constructor arguments. This eliminates redundant type specifications and makes code cleaner.

---

### Question 2
**Difficulty:** Hard
**Category:** CTAD Edge Cases
**Concepts:** Deduction guide ambiguity, explicit specification

**Question:** Why does this code fail to compile? How can you fix it?

```cpp
template<typename T>
struct Wrapper {
    Wrapper(T val) {}
    Wrapper(T* ptr, size_t n) {}
};

int main() {
    int x = 42;
    Wrapper w(&x);  // Compilation error - why?
}
```

**Answer:**
**Error:** Ambiguous deduction. `&x` (type `int*`) could match:
1. First constructor with `T = int*`
2. Second constructor with `T = int`

**Fix 1:** Explicit template argument
```cpp
Wrapper<int> w(&x);  // Explicitly choose T = int
```

**Fix 2:** Explicit deduction guide
```cpp
template<typename T>
Wrapper(T*, size_t) -> Wrapper<T>;

Wrapper w(&x, 1);  // Now unambiguous
```

**Explanation:**
When multiple constructors can match with different deductions of `T`, CTAD fails due to ambiguity. The compiler cannot choose between `T = int*` (first constructor) and `T = int` (second constructor with pointer parameter). Deduction guides resolve such ambiguities by explicitly specifying which deduction to use.

**Key Takeaway:** CTAD requires unambiguous deduction. When multiple constructors create ambiguity, provide explicit deduction guides or template arguments.

---

### Question 3
**Difficulty:** Medium
**Category:** Fold Expressions
**Concepts:** Variadic templates, binary operators

**Question:** What does this function return? What happens if called with no arguments?

```cpp
template<typename... Args>
auto sum(Args... args) {
    return (args + ...);
}

int x = sum(1, 2, 3, 4);
int y = sum();
```

**Answer:**
- `x = 10` (compiles successfully: 1 + 2 + 3 + 4)
- `y` causes **compilation error**: fold expression with empty pack

**Explanation:**
Unary fold expression `(args + ...)` requires at least one element. For operator `+`, an empty pack is ill-formed and causes compilation failure. Only three operators have default values for empty packs: `&&` (true), `||` (false), and `,` (void()).

**Fix:**
```cpp
template<typename... Args>
auto sum(Args... args) {
    return (0 + ... + args);  // Binary fold with init value
}
int y = sum();  // Now returns 0
```

**Key Takeaway:** Most fold expressions require non-empty parameter packs. Use binary fold with initial value to handle empty packs safely.

---

### Question 4
**Difficulty:** Hard
**Category:** Fold Expressions
**Concepts:** Short-circuit evaluation, argument evaluation order

**Question:** Does this code short-circuit? What gets printed?

```cpp
bool expensive_false() {
    std::cout << "expensive ";
    return false;
}

bool expensive_true() {
    std::cout << "true ";
    return true;
}

template<typename... Args>
bool all_of(Args... args) {
    return (... && args);
}

bool result = all_of(expensive_true(), expensive_false(), expensive_true());
```

**Answer:**
**Output:** `true expensive true` (exact order may vary)
**Result:** `result = false`

**Explanation:**
**All arguments are evaluated first** before the fold operation begins. This is because arguments are evaluated before being passed to the function. Once all values are obtained, the fold expression `(true && false && true)` short-circuits at the second element (false), but by then all expensive functions have already been called.

**Key Difference:**
```cpp
// This short-circuits during argument evaluation
if (expensive_true() && expensive_false() && expensive_true())
// Output: "true expensive" - third call not executed

// Fold evaluates all arguments first, then folds
all_of(expensive_true(), expensive_false(), expensive_true())
// Output: "true expensive true" - all called
```

**Key Takeaway:** Fold expressions short-circuit during the fold operation, not during argument evaluation. All arguments are evaluated before folding begins.

---

### Question 5
**Difficulty:** Medium
**Category:** Parallel Algorithms
**Concepts:** Execution policies, thread safety

**Question:** What's wrong with this code? How would you fix it?

```cpp
#include <vector>
#include <algorithm>
#include <execution>

int main() {
    std::vector<int> data = {1, 2, 3, 4, 5};
    int sum = 0;

    std::for_each(std::execution::par, data.begin(), data.end(),
                  [&sum](int x) { sum += x; });

    return sum;
}
```

**Answer:**
**Problem:** Data race! Multiple threads writing to `sum` simultaneously without synchronization.

**Fix 1:** Use std::atomic
```cpp
std::atomic<int> sum{0};
std::for_each(std::execution::par, data.begin(), data.end(),
              [&sum](int x) { sum.fetch_add(x); });
```

**Fix 2:** Use std::reduce (better)
```cpp
int sum = std::reduce(std::execution::par, data.begin(), data.end(), 0);
```

**Explanation:**
Parallel execution policies like `std::execution::par` allow algorithms to execute on multiple threads simultaneously. When multiple threads access the same variable without synchronization (like `sum += x`), it causes undefined behavior due to data races. Either use atomic operations for thread-safe access, or preferably use parallel algorithms designed for reduction operations like `std::reduce`.

**Key Takeaway:** Parallel algorithms require thread-safe operations on shared state. Use std::atomic or specialized parallel algorithms like std::reduce instead of manual accumulation.

---

### Question 6
**Difficulty:** Medium
**Category:** STL Improvements
**Concepts:** insert_or_assign, try_emplace

**Question:** What's the difference between these two map operations?

```cpp
std::map<std::string, ExpensiveObject> cache;

// Version 1
cache["key"] = ExpensiveObject(data);

// Version 2
cache.insert_or_assign("key", ExpensiveObject(data));

// Version 3
cache.try_emplace("key", data);
```

**Answer:**

**Version 1 (operator[]):**
- If key doesn't exist: default-constructs value, then assigns
- If key exists: assigns new value
- **Cost:** 1 default construction + 1 assignment OR 1 assignment

**Version 2 (insert_or_assign):**
- If key doesn't exist: constructs and inserts
- If key exists: assigns new value
- **Cost:** 1 construction + 1 move OR 1 assignment
- **Clearer intent** than operator[]

**Version 3 (try_emplace):**
- If key doesn't exist: constructs in-place with args
- If key exists: does nothing (no construction!)
- **Cost:** 1 construction OR 0 operations
- **Most efficient** when insertion may fail

**Explanation:**
`try_emplace` is most efficient because it only constructs the value if insertion succeeds. `insert_or_assign` always constructs the value but has clearer semantics than operator[]. operator[] has the overhead of default construction for new keys.

**Key Takeaway:** Use try_emplace for efficiency (avoids unnecessary construction), insert_or_assign for clarity (explicit insert-or-assign intent), avoid operator[] for expensive types.

---

### Question 7
**Difficulty:** Easy
**Category:** Nested Namespaces
**Concepts:** Namespace syntax

**Question:** Are these two declarations equivalent?

```cpp
// Version 1
namespace company {
    namespace autonomous {
        namespace perception {
            void process();
        }
    }
}

// Version 2
namespace company::autonomous::perception {
    void process();
}
```

**Answer:**
**Yes, they are exactly equivalent.** C++17 nested namespace syntax (Version 2) is just syntactic sugar for the traditional nested declaration (Version 1).

**Explanation:**
C++17 introduced the compact nested namespace syntax to reduce verbosity and nesting depth. Both versions declare the same function in the same namespace hierarchy. The nested syntax is particularly useful for deeply nested namespaces common in large projects.

**Key Takeaway:** C++17 nested namespace syntax (`namespace A::B::C`) is cleaner and less error-prone than traditional nested declarations.

---

### Question 8
**Difficulty:** Medium
**Category:** Attributes
**Concepts:** [[nodiscard]], compiler warnings

**Question:** What happens when this code is compiled and run?

```cpp
[[nodiscard]] int compute() {
    return 42;
}

[[nodiscard]] void process() {
    std::cout << "Processing\n";
}

int main() {
    compute();    // Line A
    process();    // Line B
}
```

**Answer:**
- **Line A:** Compiler warning (return value ignored)
- **Line B:** Compilation error (`[[nodiscard]]` on void function is ill-formed)

**Explanation:**
`[[nodiscard]]` can only be applied to functions with return values. Applying it to a `void` function causes a compilation error. For non-void functions, ignoring the return value triggers a compiler warning (which can be elevated to an error with `-Werror`).

**Correct Usage:**
```cpp
[[nodiscard]] std::optional<int> find_value();

find_value();  // Warning: might miss error indication
auto result = find_value();  // OK
```

**Key Takeaway:** [[nodiscard]] helps prevent bugs by warning when important return values are ignored. Only valid for non-void functions.

---

### Question 9
**Difficulty:** Hard
**Category:** std::to_chars
**Concepts:** Low-level conversion, buffer management

**Question:** What does this code print? Is there any undefined behavior?

```cpp
char buffer[10];
auto [ptr, ec] = std::to_chars(buffer, buffer + 10, 123456789);

std::cout << buffer << "\n";  // Line A
std::cout << std::string(buffer, ptr) << "\n";  // Line B
```

**Answer:**
- **Line A:** Undefined behavior (buffer not null-terminated, reads past intended data)
- **Line B:** Safe, prints "123456789" if it fit, otherwise ec indicates error

**Explanation:**
`std::to_chars` does NOT null-terminate the buffer. Line A invokes UB because `std::cout << buffer` expects a null-terminated string. Line B correctly uses the range [buffer, ptr) which is the safe way to access the result.

**Correct Check:**
```cpp
if (ec == std::errc{}) {
    std::string result(buffer, ptr);  // Safe
    std::cout << result << "\n";
}
```

**But in this case:** The number 123456789 needs 9 chars, buffer has 10, so it fits:
- `ec == std::errc{}` (success)
- `ptr == buffer + 9`
- Line A: UB (no null terminator)
- Line B: Prints "123456789"

**Key Takeaway:** std::to_chars does not null-terminate. Always check error code and use pointer range, never treat buffer as C-string.

---

### Question 10
**Difficulty:** Medium
**Category:** constexpr Lambda
**Concepts:** Compile-time computation, constant expressions

**Question:** Will this code compile? What is the value of `result`?

```cpp
constexpr auto factorial = [](int n) {
    int result = 1;
    for (int i = 2; i <= n; ++i)
        result *= i;
    return result;
};

constexpr int result = factorial(5);
std::array<int, factorial(4)> arr;
```

**Answer:**
**Yes, compiles successfully.**
- `result = 120` (5! = 120)
- `arr` is `std::array<int, 24>` (4! = 24)

**Explanation:**
C++17 allows lambdas to be implicitly `constexpr` if they meet constexpr requirements (no virtual functions, no dynamic allocation, etc.). The factorial lambda can be evaluated at compile time because all operations are constexpr-compatible. This enables using lambdas in constant expressions and template arguments.

**Requirements for constexpr lambda:**
- All operations must be valid in constexpr context
- No `static` or `thread_local` variables
- No virtual function calls
- No dynamic allocation

**Key Takeaway:** C++17 lambdas are implicitly constexpr when possible, enabling compile-time computation and use in template/constexpr contexts.

---

### Question 11
**Difficulty:** Hard
**Category:** std::scoped_lock
**Concepts:** Deadlock prevention, mutex ordering

**Question:** Will this code deadlock? Explain the behavior of std::scoped_lock.

```cpp
std::mutex m1, m2, m3;

// Thread 1
void task1() {
    std::scoped_lock lock(m1, m2, m3);
    // critical section
}

// Thread 2
void task2() {
    std::scoped_lock lock(m3, m1, m2);
    // critical section
}

// Thread 3
void task3() {
    std::scoped_lock lock(m2, m3, m1);
    // critical section
}
```

**Answer:**
**No deadlock.** `std::scoped_lock` locks all mutexes in a deadlock-free order using a deadlock avoidance algorithm (similar to `std::lock`).

**Explanation:**
Despite the different mutex orders in each thread, `std::scoped_lock` internally uses a deadlock avoidance strategy (often based on mutex addresses) to acquire all locks in a consistent order. This prevents the circular wait condition required for deadlock.

**Under the hood (conceptual):**
```cpp
std::scoped_lock lock(m3, m1, m2);
// Internally might lock in address order: m1 -> m2 -> m3
// Regardless of argument order
```

**Contrast with manual locking (deadlock!):**
```cpp
// Thread 1
std::lock_guard g1(m1);
std::lock_guard g2(m2);

// Thread 2
std::lock_guard g2_first(m2);  // Deadlock risk!
std::lock_guard g1_second(m1);
```

**Key Takeaway:** std::scoped_lock provides deadlock-free locking of multiple mutexes regardless of lock order, making it safer than multiple individual lock_guards.

---

### Question 12
**Difficulty:** Medium
**Category:** Fold Expressions
**Concepts:** Comma operator, evaluation order

**Question:** What does this code print?

```cpp
template<typename... Args>
void print_all(Args... args) {
    ((std::cout << args << " "), ...);
}

print_all(1, 2, 3, 4);
```

**Answer:**
**Output:** `1 2 3 4 `

**Explanation:**
The fold expression `((std::cout << args << " "), ...)` uses the comma operator with a left fold, expanding to:
```cpp
(((std::cout << 1 << " "), (std::cout << 2 << " ")), (std::cout << 3 << " ")), (std::cout << 4 << " ")
```

The comma operator evaluates left-to-right, discarding left operand and returning right operand. This ensures sequential printing in order.

**Parentheses are important:**
```cpp
((std::cout << args << " "), ...);  // Correct: prints all
(std::cout << ... << args);          // Wrong: chains << without spaces
```

**Key Takeaway:** Comma operator in fold expressions enables ordered evaluation of side effects (like printing) for parameter packs.

---

### Question 13
**Difficulty:** Easy
**Category:** Attributes
**Concepts:** [[maybe_unused]], compiler warnings

**Question:** Why is [[maybe_unused]] needed in this code?

```cpp
void debug_log([[maybe_unused]] const std::string& msg,
               [[maybe_unused]] int level) {
    #ifdef DEBUG_MODE
        std::cout << "[" << level << "] " << msg << "\n";
    #endif
}
```

**Answer:**
Without `[[maybe_unused]]`, the compiler would warn about unused parameters `msg` and `level` when `DEBUG_MODE` is not defined, because they're not referenced in the function body.

**Explanation:**
`[[maybe_unused]]` suppresses compiler warnings for variables that are intentionally unused in some compilation configurations. This is common for debug-only parameters, platform-specific code, and conditional compilation scenarios.

**Alternative (worse):**
```cpp
void debug_log(const std::string& msg, int level) {
    (void)msg;    // Ugly hack to suppress warning
    (void)level;
    #ifdef DEBUG_MODE
        std::cout << "[" << level << "] " << msg << "\n";
    #endif
}
```

**Key Takeaway:** [[maybe_unused]] cleanly suppresses warnings for conditionally-used variables without ugly void-cast hacks.

---

### Question 14
**Difficulty:** Hard
**Category:** CTAD with std::pair
**Concepts:** Type deduction, reference collapsing

**Question:** What are the types of p1, p2, and p3?

```cpp
std::string s = "hello";

auto p1 = std::pair(s, 42);
auto p2 = std::pair(std::ref(s), 42);
auto p3 = std::pair(std::move(s), 42);
```

**Answer:**
- **p1:** `std::pair<std::string, int>` (copy of s)
- **p2:** `std::pair<std::reference_wrapper<std::string>, int>` (reference to s)
- **p3:** `std::pair<std::string, int>` (moved from s)

**Explanation:**
CTAD deduces types from constructor arguments:
- `p1`: String argument copied, deduces `std::string`
- `p2`: `std::ref(s)` returns `std::reference_wrapper<std::string>`
- `p3`: `std::move(s)` is still type `std::string`, just an rvalue reference

**After this code:**
- `s` still contains "hello" (copied for p1)
- `p2.first` refers to `s` (modifying it modifies `s`)
- `s` is in valid but unspecified state after p3 (moved)

**Key Takeaway:** CTAD with std::pair correctly deduces types including reference_wrapper for std::ref and handles move semantics.

---

### Question 15
**Difficulty:** Medium
**Category:** Parallel Algorithms
**Concepts:** Execution policies, algorithm requirements

**Question:** Which of these will compile and why?

```cpp
std::list<int> lst = {5, 2, 8, 1, 9};
std::vector<int> vec = {5, 2, 8, 1, 9};

std::sort(std::execution::par, lst.begin(), lst.end());    // A
std::sort(std::execution::par, vec.begin(), vec.end());    // B
std::for_each(std::execution::par, lst.begin(), lst.end(), // C
              [](int& x) { x *= 2; });
```

**Answer:**
- **A:** Compilation error (std::sort requires RandomAccessIterator, list has BidirectionalIterator)
- **B:** Compiles (vector provides RandomAccessIterator)
- **C:** Compiles (std::for_each accepts any Iterator type)

**Explanation:**
Not all algorithms work with all execution policies and iterator types:
- `std::sort` requires RandomAccessIterator (vector, deque, array)
- `std::for_each` works with any Iterator type (vector, list, forward_list, etc.)
- Parallel policies don't change iterator requirements

**Key Takeaway:** Parallel execution policies don't relax iterator requirements. Use appropriate containers (vector, deque) for algorithms needing RandomAccessIterator.

---

### Question 16
**Difficulty:** Hard
**Category:** Fold Expressions
**Concepts:** Empty parameter pack, operator defaults

**Question:** Which of these compile and what do they return?

```cpp
template<typename... Args>
auto test_and(Args... args) { return (... && args); }

template<typename... Args>
auto test_or(Args... args) { return (... || args); }

template<typename... Args>
auto test_add(Args... args) { return (... + args); }

bool a = test_and();   // A
bool b = test_or();    // B
int c = test_add();    // C
```

**Answer:**
- **A:** Compiles, returns `true` (empty && fold = true)
- **B:** Compiles, returns `false` (empty || fold = false)
- **C:** Compilation error (empty + fold is ill-formed)

**Explanation:**
C++17 defines default values for only three operators with empty packs:
- `&&` → `true` (identity for logical AND)
- `||` → `false` (identity for logical OR)
- `,` → `void()` (useful for side effects)

All other operators (including `+`, `-`, `*`) are ill-formed with empty packs.

**Fix for C:**
```cpp
template<typename... Args>
auto test_add(Args... args) { return (0 + ... + args); }
int c = test_add();  // Returns 0
```

**Key Takeaway:** Only &&, ||, and comma operator have default values for empty fold expressions. Use binary fold with init value for other operators.

---

### Question 17
**Difficulty:** Medium
**Category:** std::to_chars
**Concepts:** Error handling, performance

**Question:** What's the advantage of std::to_chars over std::stringstream?

```cpp
// Version 1: stringstream
std::stringstream ss;
ss << 12345;
std::string result = ss.str();

// Version 2: to_chars
char buffer[20];
auto [ptr, ec] = std::to_chars(buffer, buffer + 20, 12345);
std::string result2(buffer, ptr);
```

**Answer:**

**Advantages of std::to_chars:**
1. **3-10x faster** (no virtual functions, minimal overhead)
2. **Zero dynamic allocation** (uses provided buffer)
3. **Locale-independent** (always uses "C" locale, predictable)
4. **No exceptions** (returns error code)
5. **Round-trip guarantee** for floating-point (to_chars + from_chars = exact)
6. **Thread-safe** without locks

**Disadvantages:**
- More verbose (manual buffer management)
- No formatting options (yet)
- Requires sufficient buffer size (error if too small)

**Explanation:**
`std::to_chars` is designed for high-performance, low-latency scenarios where allocation and locale overhead are unacceptable (logging, serialization, embedded systems). `std::stringstream` is more convenient but much slower.

**Key Takeaway:** Use std::to_chars for performance-critical numeric conversion; use stringstream for convenience and formatting.

---

### Question 18
**Difficulty:** Hard
**Category:** CTAD with Inheritance
**Concepts:** Deduction guides, base classes

**Question:** Will this code compile? What happens?

```cpp
template<typename T>
struct Base {
    T value;
    Base(T v) : value(v) {}
};

template<typename T>
struct Derived : Base<T> {
    Derived(T v) : Base<T>(v) {}
};

int main() {
    Derived d(42);  // CTAD?
}
```

**Answer:**
**Compiles successfully.** CTAD deduces `Derived<int>`.

**Explanation:**
CTAD works with inheritance. The compiler examines `Derived`'s constructor, which takes `T`, and deduces `T = int` from the argument `42`.

**More complex case (needs deduction guide):**
```cpp
template<typename T>
struct Derived : Base<T> {
    Derived(const Base<T>& b) : Base<T>(b) {}
};

// Without deduction guide, this fails
Derived d2(Base(42));

// Add deduction guide
template<typename T>
Derived(const Base<T>&) -> Derived<T>;

Derived d2(Base(42));  // Now works
```

**Key Takeaway:** CTAD works with inheritance when template parameters can be deduced from constructors. Complex cases may require explicit deduction guides.

---

### Question 19
**Difficulty:** Medium
**Category:** inline Variables
**Concepts:** ODR, header-only libraries

**Question:** What problem does inline static solve in this code?

```cpp
// config.h
struct Config {
    static inline const int MAX_SPEED = 120;
    static inline std::string DEFAULT_MODE = "autonomous";
};

// Included in multiple .cpp files
```

**Answer:**
**Problem solved:** Allows static member definition in header without violating ODR (One Definition Rule).

**Before C++17:**
```cpp
// config.h
struct Config {
    static const int MAX_SPEED;
    static std::string DEFAULT_MODE;
};

// config.cpp (required!)
const int Config::MAX_SPEED = 120;
std::string Config::DEFAULT_MODE = "autonomous";
```

**With C++17 inline:**
```cpp
// config.h only (no .cpp needed!)
struct Config {
    static inline const int MAX_SPEED = 120;
    static inline std::string DEFAULT_MODE = "autonomous";
};
```

**Explanation:**
`inline` on static members (C++17) allows definition in header files without multiple definition errors. The compiler ensures only one instance exists across all translation units, enabling true header-only libraries for static members.

**Key Takeaway:** inline static variables (C++17) enable header-only static member definitions, eliminating the need for separate .cpp files.

---

### Question 20
**Difficulty:** Hard
**Category:** Fold Expressions + Perfect Forwarding
**Concepts:** Parameter packs, forwarding references

**Question:** What's wrong with this code? How would you fix it?

```cpp
template<typename... Args>
void process_all(Args... args) {
    (process(args), ...);
}

void process(std::string&& s) {
    s += " processed";
}

int main() {
    std::string temp = "data";
    process_all(std::move(temp));
}
```

**Answer:**
**Problem:** `args` is lvalue inside function, even though `std::move(temp)` passes rvalue.

**Explanation:**
Named parameters are always lvalues, even if they have rvalue reference type. `Args...` deduces to `std::string&&`, but `args` inside the function body is an lvalue, so `process(args)` calls the wrong overload (or doesn't compile if only rvalue overload exists).

**Fix: Perfect forwarding**
```cpp
template<typename... Args>
void process_all(Args&&... args) {  // Forwarding reference
    (process(std::forward<Args>(args)), ...);
}
```

**Now:**
- `Args&&` is forwarding reference (deduces to `std::string&&`)
- `std::forward<Args>(args)` preserves value category
- `process` receives rvalue as intended

**Key Takeaway:** Use forwarding references (T&&) and std::forward to preserve value categories when passing parameter packs to other functions.

---

## PRACTICE_TASKS

### Task 1: CTAD with Smart Pointers
**Difficulty:** Medium

Create a `Resource` class template that manages different types of autonomous vehicle resources (sensors, actuators, etc.). Implement proper CTAD so that `Resource r(sensor_ptr)` correctly deduces the template type from the smart pointer argument.

**Answer:**
```cpp
#include <memory>
#include <iostream>
#include <string>

template<typename T>
class Resource {
    std::shared_ptr<T> ptr;
    std::string name;

public:
    // Constructor from shared_ptr
    Resource(std::shared_ptr<T> p, std::string n = "unnamed")
        : ptr(p), name(n) {}

    // Constructor from raw pointer (creates shared_ptr)
    Resource(T* p, std::string n = "unnamed")
        : ptr(p), name(n) {}

    void print() const {
        std::cout << "Resource: " << name << "\n";
    }

    T* get() { return ptr.get(); }
};

// Deduction guides
template<typename T>
Resource(std::shared_ptr<T>, std::string) -> Resource<T>;

template<typename T>
Resource(T*, std::string) -> Resource<T>;

// Test classes
struct Sensor {
    std::string type;
    Sensor(std::string t) : type(t) {}
};

int main() {
    auto sensor_ptr = std::make_shared<Sensor>("LIDAR");

    // CTAD deduces Resource<Sensor>
    Resource r1(sensor_ptr, "front_lidar");
    Resource r2(new Sensor("Camera"), "rear_camera");

    r1.print();
    r2.print();

    return 0;
}
```

**Explanation:** CTAD deduction guides map shared_ptr<T> and T* to Resource<T>, enabling clean type deduction.

---

### Task 2: Fold Expression for Validator
**Difficulty:** Medium

Write a variadic template function `validate_all` that takes multiple predicate functions and returns true only if all predicates return true. Use fold expressions.

**Answer:**
```cpp
#include <iostream>
#include <functional>

template<typename... Predicates>
bool validate_all(Predicates... preds) {
    return (... && preds());  // Left fold with &&
}

bool check_speed() {
    std::cout << "Checking speed... ";
    bool ok = true;
    std::cout << (ok ? "OK\n" : "FAIL\n");
    return ok;
}

bool check_sensors() {
    std::cout << "Checking sensors... ";
    bool ok = true;
    std::cout << (ok ? "OK\n" : "FAIL\n");
    return ok;
}

bool check_battery() {
    std::cout << "Checking battery... ";
    bool ok = false;
    std::cout << (ok ? "OK\n" : "FAIL\n");
    return ok;
}

int main() {
    bool all_ok = validate_all(check_speed, check_sensors, check_battery);

    std::cout << "System ready: " << std::boolalpha << all_ok << "\n";

    return 0;
}
```

**Explanation:** Fold expression `(... && preds())` short-circuits on first false, efficient validation.

---

### Task 3: Parallel Point Cloud Filter
**Difficulty:** Hard

Implement a parallel point cloud filter that removes outliers based on distance threshold. Compare sequential vs parallel performance.

**Answer:**
```cpp
#include <vector>
#include <algorithm>
#include <execution>
#include <random>
#include <chrono>
#include <iostream>
#include <cmath>

struct Point3D {
    double x, y, z;

    double distance_from_origin() const {
        return std::sqrt(x*x + y*y + z*z);
    }
};

std::vector<Point3D> generate_cloud(size_t n) {
    std::vector<Point3D> cloud;
    std::random_device rd;
    std::mt19937 gen(rd());
    std::uniform_real_distribution<> dis(-100.0, 100.0);

    for (size_t i = 0; i < n; ++i) {
        cloud.push_back({dis(gen), dis(gen), dis(gen)});
    }
    return cloud;
}

template<typename Policy>
std::vector<Point3D> filter_outliers(Policy&& policy,
                                      const std::vector<Point3D>& cloud,
                                      double threshold) {
    std::vector<Point3D> filtered;
    std::copy_if(policy, cloud.begin(), cloud.end(),
                 std::back_inserter(filtered),
                 [threshold](const Point3D& p) {
                     return p.distance_from_origin() <= threshold;
                 });
    return filtered;
}

int main() {
    const size_t N = 1'000'000;
    const double THRESHOLD = 50.0;

    auto cloud = generate_cloud(N);
    std::cout << "Generated " << N << " points\n";

    // Sequential
    auto start_seq = std::chrono::high_resolution_clock::now();
    auto filtered_seq = filter_outliers(std::execution::seq, cloud, THRESHOLD);
    auto end_seq = std::chrono::high_resolution_clock::now();
    auto dur_seq = std::chrono::duration_cast<std::chrono::milliseconds>(end_seq - start_seq);

    // Parallel
    auto start_par = std::chrono::high_resolution_clock::now();
    auto filtered_par = filter_outliers(std::execution::par, cloud, THRESHOLD);
    auto end_par = std::chrono::high_resolution_clock::now();
    auto dur_par = std::chrono::duration_cast<std::chrono::milliseconds>(end_par - start_par);

    std::cout << "Sequential: " << filtered_seq.size() << " points in "
              << dur_seq.count() << " ms\n";
    std::cout << "Parallel: " << filtered_par.size() << " points in "
              << dur_par.count() << " ms\n";
    std::cout << "Speedup: " << static_cast<double>(dur_seq.count()) / dur_par.count() << "x\n";

    return 0;
}
```

**Explanation:** Parallel copy_if can significantly speed up filtering large datasets on multi-core systems.

---

### Task 4: scoped_lock for Multi-Resource Access
**Difficulty:** Medium

Implement a resource manager that safely acquires multiple resources simultaneously using std::scoped_lock to prevent deadlock.

**Answer:**
```cpp
#include <mutex>
#include <thread>
#include <vector>
#include <iostream>
#include <chrono>

class Resource {
    std::mutex mtx;
    int value;
    std::string name;

public:
    Resource(std::string n, int v) : name(n), value(v) {}

    std::mutex& get_mutex() { return mtx; }

    void modify(int delta) {
        // Assumes mutex is already locked
        value += delta;
    }

    int get_value() const { return value; }
    std::string get_name() const { return name; }
};

class ResourceManager {
    std::vector<Resource*> resources;

public:
    void add_resource(Resource* r) {
        resources.push_back(r);
    }

    // Safely transfer value between two resources
    void transfer(Resource& from, Resource& to, int amount) {
        // Deadlock-free locking regardless of order
        std::scoped_lock lock(from.get_mutex(), to.get_mutex());

        from.modify(-amount);
        to.modify(amount);

        std::cout << "Transferred " << amount << " from "
                  << from.get_name() << " to " << to.get_name() << "\n";
    }
};

int main() {
    Resource r1("BatteryA", 100);
    Resource r2("BatteryB", 100);
    Resource r3("BatteryC", 100);

    ResourceManager mgr;
    mgr.add_resource(&r1);
    mgr.add_resource(&r2);
    mgr.add_resource(&r3);

    // Multiple threads transferring in different directions
    std::thread t1([&]() {
        for (int i = 0; i < 5; ++i) {
            mgr.transfer(r1, r2, 10);
            std::this_thread::sleep_for(std::chrono::milliseconds(10));
        }
    });

    std::thread t2([&]() {
        for (int i = 0; i < 5; ++i) {
            mgr.transfer(r2, r3, 5);
            std::this_thread::sleep_for(std::chrono::milliseconds(10));
        }
    });

    std::thread t3([&]() {
        for (int i = 0; i < 5; ++i) {
            mgr.transfer(r3, r1, 8);
            std::this_thread::sleep_for(std::chrono::milliseconds(10));
        }
    });

    t1.join();
    t2.join();
    t3.join();

    std::cout << "\nFinal values:\n";
    std::cout << r1.get_name() << ": " << r1.get_value() << "\n";
    std::cout << r2.get_name() << ": " << r2.get_value() << "\n";
    std::cout << r3.get_name() << ": " << r3.get_value() << "\n";

    return 0;
}
```

**Explanation:** scoped_lock prevents deadlock even when multiple threads lock resources in different orders.

---

### Task 5: constexpr Lambda Table Generation
**Difficulty:** Medium

Create compile-time lookup tables for trigonometric functions used in autonomous vehicle trajectory planning using constexpr lambdas.

**Answer:**
```cpp
#include <iostream>
#include <array>
#include <cmath>

// constexpr pi
constexpr double PI = 3.14159265358979323846;

// Generate sine lookup table at compile time
template<size_t N>
constexpr auto generate_sin_table() {
    std::array<double, N> table{};

    constexpr auto sine = [](double angle) {
        // Use Taylor series for constexpr sine (simplified)
        // For actual use, use std::sin (constexpr in C++26)
        double x = angle;
        double term = x;
        double result = term;

        for (int i = 1; i < 10; ++i) {
            term *= -x * x / ((2 * i) * (2 * i + 1));
            result += term;
        }

        return result;
    };

    for (size_t i = 0; i < N; ++i) {
        double angle = (static_cast<double>(i) / N) * 2 * PI;
        table[i] = sine(angle);
    }

    return table;
}

// Compile-time constant
constexpr auto SIN_TABLE = generate_sin_table<360>();

// Fast sine lookup
double fast_sin(double degrees) {
    int index = static_cast<int>(degrees) % 360;
    if (index < 0) index += 360;
    return SIN_TABLE[index];
}

int main() {
    std::cout << "Compile-time sine table (first 10 entries):\n";
    for (int i = 0; i < 10; ++i) {
        std::cout << "sin(" << i << "°) ≈ " << SIN_TABLE[i] << "\n";
    }

    std::cout << "\nFast lookup:\n";
    std::cout << "sin(30°) ≈ " << fast_sin(30) << "\n";
    std::cout << "sin(90°) ≈ " << fast_sin(90) << "\n";

    // Can be used in constant expressions
    static_assert(SIN_TABLE[0] < 0.1);  // sin(0) ≈ 0

    return 0;
}
```

**Explanation:** constexpr lambda enables compile-time generation of lookup tables, eliminating runtime computation overhead.

---

### Task 6: to_chars for High-Performance Logging
**Difficulty:** Medium

Implement a fast logger using std::to_chars that formats sensor readings without allocations.

**Answer:**
```cpp
#include <charconv>
#include <string_view>
#include <iostream>
#include <chrono>
#include <vector>

class FastLogger {
    char buffer[1024];
    char* current;

public:
    FastLogger() : current(buffer) {}

    void reset() { current = buffer; }

    void add(std::string_view str) {
        size_t len = str.size();
        std::copy(str.begin(), str.end(), current);
        current += len;
    }

    void add(int value) {
        auto [ptr, ec] = std::to_chars(current, buffer + sizeof(buffer), value);
        if (ec == std::errc{}) {
            current = ptr;
        }
    }

    void add(double value) {
        auto [ptr, ec] = std::to_chars(current, buffer + sizeof(buffer), value);
        if (ec == std::errc{}) {
            current = ptr;
        }
    }

    std::string_view get_log() const {
        return std::string_view(buffer, current - buffer);
    }

    void flush() {
        std::cout << get_log();
        reset();
    }
};

struct SensorReading {
    std::string name;
    double value;
    int timestamp;
};

int main() {
    std::vector<SensorReading> readings = {
        {"LIDAR", 12.456, 1000},
        {"Camera", 30.123, 1001},
        {"RADAR", 45.678, 1002},
        {"GPS", 100.234, 1003}
    };

    FastLogger logger;

    auto start = std::chrono::high_resolution_clock::now();

    for (const auto& reading : readings) {
        logger.add("[");
        logger.add(reading.timestamp);
        logger.add("] ");
        logger.add(reading.name);
        logger.add(": ");
        logger.add(reading.value);
        logger.add("\n");
    }

    auto end = std::chrono::high_resolution_clock::now();
    auto duration = std::chrono::duration_cast<std::chrono::microseconds>(end - start);

    logger.flush();
    std::cout << "\nLogging took " << duration.count() << " μs\n";

    return 0;
}
```

**Explanation:** std::to_chars provides zero-allocation, high-performance numeric formatting for logging systems.

---

### Task 7: Fold Expression for Function Composition
**Difficulty:** Hard

Implement a function composer using fold expressions that chains multiple transformation functions.

**Answer:**
```cpp
#include <iostream>
#include <functional>

// Compose functions using fold expressions
template<typename... Funcs>
auto compose(Funcs... funcs) {
    return [=](auto x) {
        // Right fold: f(g(h(x)))
        return (... (funcs(x)));  // Error: this doesn't work!

        // Need to manually chain
    };
}

// Better approach: using fold with function call chaining
template<typename T, typename... Funcs>
auto apply_all(T value, Funcs... funcs) {
    // Left fold that threads value through functions
    T result = value;
    ((result = funcs(result)), ...);
    return result;
}

// Alternative: using fold to build composed function
template<typename... Funcs>
auto compose_right(Funcs... funcs) {
    return [=](auto x) {
        auto apply = [&](auto&& f, auto&& val) {
            return f(val);
        };

        // Store in tuple and apply in reverse
        auto tuple = std::make_tuple(funcs...);

        // For simplicity, use apply_all approach
        auto result = x;
        ((result = funcs(result)), ...);
        return result;
    };
}

int main() {
    auto add_10 = [](int x) { return x + 10; };
    auto multiply_2 = [](int x) { return x * 2; };
    auto subtract_5 = [](int x) { return x - 5; };

    // Apply functions in sequence
    int result = apply_all(5, add_10, multiply_2, subtract_5);
    // (((5 + 10) * 2) - 5) = 25

    std::cout << "Result: " << result << "\n";

    // Composed function
    auto composed = compose_right(add_10, multiply_2, subtract_5);
    std::cout << "Composed: " << composed(5) << "\n";

    return 0;
}
```

**Explanation:** Fold expressions enable compact function composition, though true composition requires careful ordering.

---

### Task 8: CTAD for Variant Construction
**Difficulty:** Medium

Create a type-safe message system using std::variant with CTAD for autonomous vehicle communication.

**Answer:**
```cpp
#include <variant>
#include <string>
#include <iostream>

struct SpeedCommand {
    double speed;
};

struct StopCommand {
    std::string reason;
};

struct TurnCommand {
    double angle;
    std::string direction;
};

using Command = std::variant<SpeedCommand, StopCommand, TurnCommand>;

class CommandHandler {
public:
    void handle(const Command& cmd) {
        std::visit([](const auto& c) {
            using T = std::decay_t<decltype(c)>;

            if constexpr (std::is_same_v<T, SpeedCommand>) {
                std::cout << "Setting speed to " << c.speed << " km/h\n";
            }
            else if constexpr (std::is_same_v<T, StopCommand>) {
                std::cout << "Stopping: " << c.reason << "\n";
            }
            else if constexpr (std::is_same_v<T, TurnCommand>) {
                std::cout << "Turning " << c.angle << "° " << c.direction << "\n";
            }
        }, cmd);
    }
};

int main() {
    CommandHandler handler;

    // CTAD for variant construction
    Command cmd1 = SpeedCommand{60.0};
    Command cmd2 = StopCommand{"Obstacle detected"};
    Command cmd3 = TurnCommand{15.0, "left"};

    handler.handle(cmd1);
    handler.handle(cmd2);
    handler.handle(cmd3);

    return 0;
}
```

**Explanation:** std::variant with CTAD provides type-safe message passing without inheritance overhead.

---

### Task 9: Parallel reduce for Sensor Fusion
**Difficulty:** Hard

Implement sensor fusion that combines multiple sensor readings using parallel std::reduce.

**Answer:**
```cpp
#include <vector>
#include <numeric>
#include <execution>
#include <iostream>
#include <random>

struct SensorReading {
    double value;
    double confidence;  // 0.0 to 1.0

    SensorReading operator+(const SensorReading& other) const {
        // Weighted average based on confidence
        double total_conf = confidence + other.confidence;
        if (total_conf == 0) return {0, 0};

        double fused_value = (value * confidence + other.value * other.confidence) / total_conf;
        double fused_conf = (confidence + other.confidence) / 2.0;

        return {fused_value, fused_conf};
    }
};

int main() {
    // Generate random sensor readings
    std::vector<SensorReading> readings;
    std::random_device rd;
    std::mt19937 gen(rd());
    std::uniform_real_distribution<> val_dis(50.0, 100.0);
    std::uniform_real_distribution<> conf_dis(0.7, 1.0);

    for (int i = 0; i < 1000; ++i) {
        readings.push_back({val_dis(gen), conf_dis(gen)});
    }

    // Sequential fusion
    auto start_seq = std::chrono::high_resolution_clock::now();
    SensorReading fused_seq = std::reduce(
        std::execution::seq,
        readings.begin(),
        readings.end(),
        SensorReading{0, 0}
    );
    auto end_seq = std::chrono::high_resolution_clock::now();

    // Parallel fusion
    auto start_par = std::chrono::high_resolution_clock::now();
    SensorReading fused_par = std::reduce(
        std::execution::par,
        readings.begin(),
        readings.end(),
        SensorReading{0, 0}
    );
    auto end_par = std::chrono::high_resolution_clock::now();

    auto dur_seq = std::chrono::duration_cast<std::chrono::microseconds>(end_seq - start_seq);
    auto dur_par = std::chrono::duration_cast<std::chrono::microseconds>(end_par - start_par);

    std::cout << "Fused reading: " << fused_par.value
              << " (confidence: " << fused_par.confidence << ")\n";
    std::cout << "Sequential: " << dur_seq.count() << " μs\n";
    std::cout << "Parallel: " << dur_par.count() << " μs\n";

    return 0;
}
```

**Explanation:** Parallel reduce efficiently combines large datasets using associative operations.

---

### Task 10: Complete C++17 Feature Demo
**Difficulty:** Hard

Create a comprehensive example that uses multiple C++17 features together in a realistic autonomous vehicle scenario.

**Answer:**
```cpp
#include <iostream>
#include <vector>
#include <optional>
#include <variant>
#include <string_view>
#include <filesystem>
#include <algorithm>
#include <execution>
#include <map>

namespace fs = std::filesystem;

// Structured binding ready struct
struct SensorData {
    std::string name;
    double value;
    int timestamp;
};

// Variant for different message types
using Message = std::variant<SensorData, std::string>;

// CTAD-enabled container
template<typename T>
class DataBuffer {
    std::vector<T> data;

public:
    DataBuffer(std::initializer_list<T> init) : data(init) {}

    // Try to find element
    [[nodiscard]] std::optional<T> find_if(auto pred) const {
        auto it = std::find_if(data.begin(), data.end(), pred);
        if (it != data.end()) return *it;
        return std::nullopt;
    }

    void process_parallel() {
        std::for_each(std::execution::par, data.begin(), data.end(),
                      [](T& item) { /* process */ });
    }

    auto begin() { return data.begin(); }
    auto end() { return data.end(); }
};

// Deduction guide
template<typename T>
DataBuffer(std::initializer_list<T>) -> DataBuffer<T>;

// Fold expression utility
template<typename... Sensors>
bool all_ready(const Sensors&... sensors) {
    return (... && sensors.is_ready());
}

// constexpr lambda for compile-time config
constexpr auto get_max_speed = []() { return 120; };

int main() {
    // Structured bindings
    auto [name, value, time] = SensorData{"LIDAR", 42.5, 1000};
    std::cout << "Sensor: " << name << " = " << value << "\n";

    // CTAD
    DataBuffer buffer{SensorData{"S1", 10, 100},
                      SensorData{"S2", 20, 200}};

    // std::optional
    auto found = buffer.find_if([](const SensorData& s) {
        return s.value > 15;
    });

    if (found) {
        std::cout << "Found: " << found->name << "\n";
    }

    // Nested namespace
    namespace config::vehicle::limits {
        inline constexpr int max_speed = 120;
    }

    // constexpr lambda
    static_assert(get_max_speed() == 120);

    // if constexpr
    auto process = [](auto val) {
        if constexpr (std::is_integral_v<decltype(val)>) {
            return val * 2;
        } else {
            return val;
        }
    };

    std::cout << "Process int: " << process(42) << "\n";
    std::cout << "Process double: " << process(3.14) << "\n";

    // std::variant with std::visit
    std::vector<Message> messages = {
        SensorData{"Temp", 25.0, 500},
        std::string("System ready"),
        SensorData{"Speed", 60.0, 501}
    };

    for (const auto& msg : messages) {
        std::visit([](const auto& m) {
            using T = std::decay_t<decltype(m)>;
            if constexpr (std::is_same_v<T, SensorData>) {
                std::cout << "Data: " << m.name << " = " << m.value << "\n";
            } else {
                std::cout << "Message: " << m << "\n";
            }
        }, msg);
    }

    return 0;
}
```

**Explanation:** This example integrates CTAD, structured bindings, optional, variant, if constexpr, fold expressions, nested namespaces, inline variables, constexpr lambda, and parallel algorithms in a cohesive autonomous vehicle scenario.

---

## QUICK_REFERENCE

### CTAD (Class Template Argument Deduction)
```cpp
std::pair p(42, 3.14);              // Deduces std::pair<int, double>
std::vector v{1, 2, 3};             // Deduces std::vector<int>

// Custom deduction guide
template<typename T>
Container(T) -> Container<T>;
```

### Fold Expressions
```cpp
// Unary folds
(args + ...)        // Right: (a + (b + (c + d)))
(... + args)        // Left: (((a + b) + c) + d)

// Binary folds with init
(0 + ... + args)    // Left with init
(args + ... + 0)    // Right with init

// Common patterns
(... && preds())    // All true
(... || checks())   // Any true
((cout << vals), ...) // Print all
```

### Parallel Algorithms
```cpp
std::sort(std::execution::par, vec.begin(), vec.end());
std::for_each(std::execution::par_unseq, v.begin(), v.end(), func);
auto sum = std::reduce(std::execution::par, v.begin(), v.end(), 0);
```

### STL Improvements
```cpp
// Maps
map.insert_or_assign(key, value);
map.try_emplace(key, constructor_args...);

// Locking
std::scoped_lock lock(m1, m2, m3);  // Deadlock-free

// Conversion
std::to_chars(buf, buf+size, 12345);
std::from_chars(buf, buf+size, value);
```

### constexpr Lambda
```cpp
constexpr auto square = [](int x) { return x * x; };
constexpr int result = square(5);  // Compile-time
```

### Attributes
```cpp
[[nodiscard]] int compute();        // Warn if ignored
[[maybe_unused]] int debug_val;     // Suppress warning
[[fallthrough]];                     // Intentional fallthrough
```

### Nested Namespaces
```cpp
namespace company::project::module {
    // ...
}
```

### inline Variables
```cpp
struct Config {
    static inline const int MAX = 100;  // No .cpp needed
};
```

### Performance Tips
- Use `std::execution::par` for large datasets (>10k elements)
- Prefer `try_emplace` over `operator[]` for maps
- Use `std::to_chars` for high-performance numeric formatting
- Use fold expressions to eliminate variadic template recursion
- Use `std::scoped_lock` for multi-mutex locking

### Common Pitfalls
- CTAD fails with ambiguous constructors
- Empty fold expressions fail for most operators (use binary fold)
- Parallel algorithms require thread-safe operations
- `std::to_chars` doesn't null-terminate
- Structured bindings to temporaries can dangle

---

**End of Topic 3 - Template Improvements and Additional Features**
**Part 3 of 3 for Chapter 16 - C++17 Features**
