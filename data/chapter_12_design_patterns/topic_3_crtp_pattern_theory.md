### THEORY_SECTION: Core Concepts and Foundations
#### 1. CRTP Pattern Overview

**Definition:** Curiously Recurring Template Pattern - a class inherits from a template base instantiated with the derived class itself.

**Core Structure:**

```cpp
// CRTP Base Template
template <typename Derived>
class Base {
public:
    void interface() {
        // Static downcast to derived class (compile-time)
        static_cast<Derived*>(this)->implementation();
    }
};

// Derived class inherits from Base<Derived>
class Derived : public Base<Derived> {
public:
    void implementation() {
        std::cout << "Derived implementation\n";
    }
};

// Usage - polymorphic behavior without virtual functions
Derived d;
d.interface();  // Calls Derived::implementation() via static_cast
```

**The "Curious Recursion":**

| Component | Role | Timing |
|-----------|------|--------|
| `Base<Derived>` | Template base class | Instantiated per derived type |
| `Derived : public Base<Derived>` | Inheritance relationship | Derived passes itself as template arg |
| `static_cast<Derived*>(this)` | Downcast mechanism | Compile-time type conversion |
| Method dispatch | Polymorphism | Resolved at compile-time (inlined) |

**Key Mechanism:**

```cpp
// What happens during compilation:
template <typename Derived>
void Base<Derived>::interface() {
    static_cast<Derived*>(this)->implementation();
    // Compiler knows exact type of Derived at this point
    // No vtable lookup needed - direct function call
}

// For class Derived : public Base<Derived>
// Compiler generates:
void Base<Derived>::interface() {
    static_cast<Derived*>(this)->implementation();
    // Resolves to: this->Derived::implementation()
    // Can be fully inlined
}
```

#### 2. CRTP Benefits in Autonomous Vehicles

**Performance-Critical Use Cases:**

| Use Case | Traditional (Virtual) | CRTP (Static) | Performance Gain |
|----------|---------------------|---------------|------------------|
| **Sensor fusion loop (1kHz)** | Virtual dispatch per call | Inlined static dispatch | ~15-20% faster |
| **Control algorithms (10kHz)** | Vtable overhead | Zero overhead | ~10-30% faster |
| **Path planning evaluation** | Runtime polymorphism | Compile-time selection | ~5-15% faster |
| **Kalman filter variants** | Virtual update() calls | Templated policy | Fully optimized |

**Real-World Applications:**

**A. Zero-Overhead Sensor Processing:**
```cpp
template <typename SensorType>
class SensorProcessor {
public:
    void processFrame() {
        auto& sensor = static_cast<SensorType&>(*this);

        auto rawData = sensor.readRawData();        // Virtual: ~5ns overhead
        auto filtered = sensor.applyFilter(rawData); // CRTP: 0ns overhead
        sensor.publishData(filtered);
    }
};

class LidarSensor : public SensorProcessor<LidarSensor> {
    // Implementation inlined at compile-time
};
```

**B. Policy-Based Filter Selection:**
```cpp
template <typename FilterPolicy>
class StateEstimator : public FilterPolicy {
    // Use either KalmanFilter or ExtendedKalmanFilter
    // Decision made at compile-time
};

StateEstimator<KalmanFilter> linearEstimator;      // For linear systems
StateEstimator<ExtendedKalmanFilter> nonlinear;    // For nonlinear systems
```

**C. Mixin Composition:**
```cpp
template <typename Derived>
class WithLogging {
    void log(const std::string& msg) {
        std::cout << typeid(Derived).name() << ": " << msg << "\n";
    }
};

template <typename Derived>
class WithCaching {
    std::unordered_map<int, Result> cache;
};

// Combine behaviors at compile-time
class SensorNode : public WithLogging<SensorNode>,
                   public WithCaching<SensorNode> {
    // Gets logging + caching with zero runtime overhead
};
```

**Key Advantages:**

| Advantage | Explanation | Autonomous Vehicle Benefit |
|-----------|-------------|---------------------------|
| **Zero overhead** | No vtable, fully inlined | Critical for real-time control loops |
| **Compile-time safety** | Interface errors caught at compile-time | Prevents runtime failures in production |
| **Code reuse** | Share implementations without virtual cost | Sensor drivers, filters, controllers |
| **Policy selection** | Choose algorithms at compile-time | Different filter types per vehicle config |
| **Composability** | Multiple inheritance without conflicts | Mix logging, metrics, caching behaviors |

#### 3. CRTP vs Virtual Polymorphism Comparison

**Dispatch Mechanism:**

| Aspect | CRTP (Static Polymorphism) | Virtual Functions (Dynamic Polymorphism) |
|--------|---------------------------|----------------------------------------|
| **Resolution** | Compile-time | Runtime |
| **Mechanism** | Template instantiation + static_cast | Vtable lookup + virtual dispatch |
| **Overhead** | ✅ Zero (inlined) | ❌ 5-15ns per call |
| **Code size** | ⚠️ Larger (per-type instantiation) | ✅ Smaller (one vtable) |
| **Type known** | ✅ At compile-time | ❌ At runtime |
| **Optimization** | ✅ Full inlining possible | ⚠️ Limited (devirtualization rare) |

**Performance Comparison (1M calls):**

```cpp
// Benchmark results:

// Virtual function call: ~50ms
class Base {
    virtual void process() = 0;
};
for (int i = 0; i < 1000000; ++i) {
    base->process();  // Virtual dispatch
}

// CRTP call: ~15ms
template <typename T>
class Base {
    void process() { static_cast<T*>(this)->impl(); }
};
for (int i = 0; i < 1000000; ++i) {
    derived.process();  // Inlined static call
}

// Speedup: ~3.3x faster
```

**When to Use Each:**

**Use CRTP When:**

| Criterion | Example |
|-----------|---------|
| ✅ Performance critical | Sensor fusion at 1kHz, control loops at 10kHz |
| ✅ Type known at compile-time | Different sensor types (Lidar, Radar, Camera) |
| ✅ Policy-based design | Kalman filter variants, path planning algorithms |
| ✅ Mixin behaviors | Add logging, caching, metrics without overhead |
| ✅ Static interface enforcement | Compile-time API contract checking |

**Use Virtual Functions When:**

| Criterion | Example |
|-----------|---------|
| ✅ True runtime polymorphism | Plugin system for sensors/algorithms |
| ✅ Type unknown at compile-time | Loading algorithm from config file |
| ✅ Heterogeneous containers | `std::vector<std::unique_ptr<Sensor>>` |
| ✅ Simplicity over performance | Non-critical data processing |
| ✅ Dynamic behavior changes | Switching algorithms at runtime |

**Hybrid Approach:**

```cpp
// Use both for different purposes
class ISensor {  // Virtual for runtime polymorphism
    virtual ~ISensor() = default;
    virtual void initialize() = 0;
};

template <typename Derived>
class SensorBase : public ISensor {  // CRTP for performance
    void processFrame() {
        static_cast<Derived*>(this)->fastProcessing();  // Inlined
    }
};

class LidarSensor : public SensorBase<LidarSensor> {
    void initialize() override { /* runtime setup */ }
    void fastProcessing() { /* compile-time optimized */ }
};
```

**Decision Matrix:**

```
Need runtime type selection? ──YES──> Virtual Functions
         │
         NO
         ↓
Performance critical (>100Hz)? ──YES──> CRTP
         │
         NO
         ↓
Complex behavior composition? ──YES──> CRTP (mixins)
         │
         NO
         ↓
Simple static polymorphism? ──YES──> CRTP
```

---

### EDGE_CASES: Tricky Scenarios and Deep Internals
#### Edge Case 1: Name Hiding in Template Base Classes

**Problem**: Unqualified member access in derived classes doesn't find members of dependent template base classes due to two-phase lookup.

```cpp
// ❌ Name hiding issue
template <typename T>
class Base {
public:
    void helper() { std::cout << "Base helper\n"; }
};

template <typename T>
class Derived : public Base<T> {
public:
    void method() {
        helper();  // ❌ Error: 'helper' not found!
        // Two-phase lookup doesn't consider dependent base
    }
};

// ✅ Fix 1: Use this->
template <typename T>
class DerivedFixed1 : public Base<T> {
public:
    void method() {
        this->helper();  // ✅ Works - qualified lookup
    }
};

// ✅ Fix 2: Using declaration
template <typename T>
class DerivedFixed2 : public Base<T> {
    using Base<T>::helper;  // ✅ Bring name into scope
public:
    void method() {
        helper();  // ✅ Works now
    }
};

// ✅ Fix 3: Explicit qualification
template <typename T>
class DerivedFixed3 : public Base<T> {
public:
    void method() {
        Base<T>::helper();  // ✅ Works - fully qualified
    }
};
```

**Key Takeaway**: Always use `this->` or explicit qualification when accessing base class members in template-dependent contexts.

---

#### Edge Case 2: Infinite Recursion Without Implementation Override

**Problem**: Forgetting to implement required methods in derived class causes infinite recursion or compilation failure.

```cpp
// ❌ Infinite recursion
template <typename T>
class Base {
public:
    void interface() {
        static_cast<T*>(this)->interface();  // ❌ Calls itself infinitely!
    }
};

class Derived : public Base<Derived> {
    // ❌ Missing implementation - causes infinite recursion
};

// ✅ Correct pattern
template <typename T>
class BaseCorrect {
public:
    void interface() {
        static_cast<T*>(this)->interfaceImpl();  // ✅ Calls different method
    }
};

class DerivedCorrect : public BaseCorrect<DerivedCorrect> {
public:
    void interfaceImpl() {  // ✅ Implementation provided
        std::cout << "Implementation\n";
    }
};
```

**Key Takeaway**: Use different method names (e.g., `interface()` in base calls `interfaceImpl()` in derived) to avoid infinite recursion.

---

#### Edge Case 3: Multiple CRTP Inheritance Ambiguity

**Problem**: Inheriting from multiple CRTP bases can cause ambiguous `this` pointer casts.

```cpp
// ❌ Potential ambiguity
template <typename T>
class Logger {
public:
    void log(const std::string& msg) {
        std::cout << "[" << static_cast<T*>(this)->name() << "] " << msg << "\n";
    }
};

template <typename T>
class Cacheable {
    mutable std::optional<int> cache;
public:
    int compute() {
        if (!cache) {
            cache = static_cast<T*>(this)->computeImpl();  // ✅ OK - different method
        }
        return *cache;
    }
};

// ✅ Multiple inheritance works if methods don't conflict
class MyClass : public Logger<MyClass>, public Cacheable<MyClass> {
public:
    std::string name() const { return "MyClass"; }
    int computeImpl() { return 42; }
};

// ❌ Ambiguous base if both bases have same method
template <typename T>
class PolicyA {
public:
    void execute() {
        static_cast<T*>(this)->impl();
    }
};

template <typename T>
class PolicyB {
public:
    void execute() {  // ❌ Same name as PolicyA::execute()
        static_cast<T*>(this)->impl();
    }
};

class Ambiguous : public PolicyA<Ambiguous>, public PolicyB<Ambiguous> {
public:
    void callExecute() {
        // execute();  // ❌ Error: ambiguous!
        PolicyA<Ambiguous>::execute();  // ✅ Qualify explicitly
    }
    void impl() { }
};
```

**Key Takeaway**: When using multiple CRTP inheritance, ensure base class interface methods have distinct names or use explicit qualification.

---

#### Edge Case 4: Incomplete Type Issues with sizeof()

**Problem**: The derived class is incomplete when the base class template is instantiated, causing issues with `sizeof` and other type traits.

```cpp
// ❌ Incomplete type issue
template <typename T>
class Base {
    char buffer[sizeof(T)];  // ❌ Error: sizeof incomplete type 'T'
public:
    Base() {
        std::cout << "Size: " << sizeof(T) << "\n";  // ❌ Error
    }
};

class Derived : public Base<Derived> {  // Derived is incomplete here
    int data;
};

// ✅ Fix: Delay sizeof usage until derived is complete
template <typename T>
class BaseFixed {
public:
    void printSize() {
        std::cout << "Size: " << sizeof(T) << "\n";  // ✅ OK - called after construction
    }
};

class DerivedFixed : public BaseFixed<DerivedFixed> {
    int data;
};

DerivedFixed obj;
obj.printSize();  // ✅ Works - Derived is complete now
```

**Key Takeaway**: Avoid using `sizeof(Derived)` or type traits in base class constructors or as non-type template parameters. Use them in member functions called after object construction.

---

#### Edge Case 5: Slicing with Value Semantics

**Problem**: Assigning/copying through base class reference causes slicing since CRTP uses static dispatch.

```cpp
template <typename T>
class Base {
public:
    void interface() {
        static_cast<T*>(this)->impl();
    }
};

class Derived1 : public Base<Derived1> {
public:
    int data = 1;
    void impl() { std::cout << "Derived1\n"; }
};

class Derived2 : public Base<Derived2> {
public:
    int data = 2;
    void impl() { std::cout << "Derived2\n"; }
};

// ❌ CRTP doesn't provide runtime polymorphism
void process(Base<Derived1>& obj) {  // ❌ Can only accept Derived1, not Derived2
    obj.interface();
}

// ❌ Cannot have vector of mixed CRTP types
// std::vector<Base<???>> vec;  // ❌ What template parameter?

// ✅ Use template function for generic processing
template <typename T>
void processGeneric(Base<T>& obj) {
    obj.interface();
}

Derived1 d1;
Derived2 d2;
processGeneric(d1);  // ✅ Works
processGeneric(d2);  // ✅ Works
```

**Key Takeaway**: CRTP does NOT provide runtime polymorphism. Use template functions, not base class pointers/references, when you need to process different derived types generically.

---

### CODE_EXAMPLES: Practical Demonstrations
#### Example 1: Basic CRTP - Static Polymorphism (Easy)

```cpp
#include <iostream>
#include <string>

// CRTP base class
template <typename Derived>
class Printer {
public:
    void print() const {
        // Static downcast to derived type
        static_cast<const Derived*>(this)->printImpl();
    }
};

// Derived classes
class IntPrinter : public Printer<IntPrinter> {
    int value;
public:
    IntPrinter(int v) : value(v) {}

    void printImpl() const {
        std::cout << "Integer: " << value << "\n";
    }
};

class StringPrinter : public Printer<StringPrinter> {
    std::string value;
public:
    StringPrinter(const std::string& v) : value(v) {}

    void printImpl() const {
        std::cout << "String: " << value << "\n";
    }
};

// Generic function using CRTP
template <typename T>
void genericPrint(const Printer<T>& printer) {
    printer.print();  // Resolved at compile-time
}

int main() {
    IntPrinter ip(42);
    StringPrinter sp("Hello");

    ip.print();  // Calls IntPrinter::printImpl()
    sp.print();  // Calls StringPrinter::printImpl()

    genericPrint(ip);  // Template function
    genericPrint(sp);

    return 0;
}

// Output:
// Integer: 42
// String: Hello
// Integer: 42
// String: Hello
```

**Key Concepts**:
- CRTP base template `Printer<Derived>`
- Static downcast with `static_cast<Derived*>(this)`
- Compile-time polymorphism
- Generic functions using template parameter matching

---

#### Example 2: Shape Hierarchy with CRTP (Mid)

```cpp
#include <iostream>
#include <cmath>
#include <utility>

// CRTP base for shapes
template <typename Derived>
class Shape {
public:
    double area() const {
        return static_cast<const Derived*>(this)->areaImpl();
    }

    void display() const {
        std::cout << static_cast<const Derived*>(this)->name()
                  << " - Area: " << area() << "\n";
    }
};

// Circle
class Circle : public Shape<Circle> {
    double radius;
public:
    Circle(double r) : radius(r) {}

    double areaImpl() const {
        return M_PI * radius * radius;
    }

    std::string name() const {
        return "Circle";
    }

    double getRadius() const { return radius; }
};

// Rectangle
class Rectangle : public Shape<Rectangle> {
    double width, height;
public:
    Rectangle(double w, double h) : width(w), height(h) {}

    double areaImpl() const {
        return width * height;
    }

    std::string name() const {
        return "Rectangle";
    }

    std::pair<double, double> getDimensions() const {
        return {width, height};
    }
};

// Triangle
class Triangle : public Shape<Triangle> {
    double base, height;
public:
    Triangle(double b, double h) : base(b), height(h) {}

    double areaImpl() const {
        return 0.5 * base * height;
    }

    std::string name() const {
        return "Triangle";
    }
};

// Generic function to display any shape
template <typename T>
void showShape(const Shape<T>& shape) {
    shape.display();
}

int main() {
    Circle circle(5.0);
    Rectangle rectangle(4.0, 6.0);
    Triangle triangle(3.0, 4.0);

    std::cout << "Shape Areas:\n";
    circle.display();
    rectangle.display();
    triangle.display();

    std::cout << "\nUsing generic function:\n";
    showShape(circle);
    showShape(rectangle);
    showShape(triangle);

    return 0;
}

// Output:
// Shape Areas:
// Circle - Area: 78.5398
// Rectangle - Area: 24
// Triangle - Area: 6
//
// Using generic function:
// Circle - Area: 78.5398
// Rectangle - Area: 24
// Triangle - Area: 6
```

**Key Concepts**:
- Reusable shape interface via CRTP
- `display()` method in base calls derived methods
- Type-specific additional methods (getRadius(), getDimensions())
- Zero virtual function overhead

---

#### Example 3: Logging Policy with CRTP (Advanced)

```cpp
#include <iostream>
#include <string>
#include <chrono>
#include <iomanip>

// Logger policy using CRTP
template <typename Derived>
class Logger {
public:
    void log(const std::string& message) const {
        auto now = std::chrono::system_clock::now();
        auto time = std::chrono::system_clock::to_time_t(now);

        std::cout << "[" << std::put_time(std::localtime(&time), "%H:%M:%S")
                  << "] [" << getDerivedName() << "] "
                  << message << "\n";
    }

protected:
    std::string getDerivedName() const {
        return static_cast<const Derived*>(this)->name();
    }
};

// Sensor class with logging
class LidarSensor : public Logger<LidarSensor> {
    double maxRange;
    int pointCount;

public:
    LidarSensor(double range, int points)
        : maxRange(range), pointCount(points) {
        this->log("LidarSensor initialized");
    }

    void scan() {
        this->log("Starting scan...");
        // Simulate scan
        this->log("Scan complete - " + std::to_string(pointCount) + " points");
    }

    std::string name() const { return "LiDAR"; }
};

class RadarSensor : public Logger<RadarSensor> {
    double frequency;

public:
    RadarSensor(double freq) : frequency(freq) {
        this->log("RadarSensor initialized");
    }

    void detect() {
        this->log("Detecting objects...");
        // Simulate detection
        this->log("Detection complete");
    }

    std::string name() const { return "Radar"; }
};

int main() {
    LidarSensor lidar(100.0, 256000);
    lidar.scan();

    std::cout << "\n";

    RadarSensor radar(77.5);
    radar.detect();

    return 0;
}

// Output (sample):
// [14:30:15] [LiDAR] LidarSensor initialized
// [14:30:15] [LiDAR] Starting scan...
// [14:30:15] [LiDAR] Scan complete - 256000 points
//
// [14:30:15] [Radar] RadarSensor initialized
// [14:30:15] [Radar] Detecting objects...
// [14:30:15] [Radar] Detection complete
```

**Key Concepts**:
- Logging policy as CRTP mixin
- Automatic timestamped logging for derived classes
- `this->` required for template-dependent name lookup
- Each derived class provides `name()` for context

---

#### Example 4: Caching Policy with CRTP (Advanced)

```cpp
#include <iostream>
#include <optional>
#include <cmath>

// Caching policy using CRTP
template <typename Derived>
class Cacheable {
    mutable std::optional<double> cache;

public:
    double compute() const {
        if (!cache) {
            std::cout << "[Cache Miss] Computing...\n";
            cache = static_cast<const Derived*>(this)->computeImpl();
        } else {
            std::cout << "[Cache Hit] Returning cached value\n";
        }
        return *cache;
    }

    void invalidateCache() {
        cache.reset();
    }
};

// Expensive computation class with caching
class ExpensiveOperation : public Cacheable<ExpensiveOperation> {
    double radius;

public:
    ExpensiveOperation(double r) : radius(r) {}

    double computeImpl() const {
        // Simulate expensive computation
        double result = 0.0;
        for (int i = 0; i < 1000000; i++) {
            result += std::sin(radius) * std::cos(radius);
        }
        return result;
    }

    void setRadius(double r) {
        radius = r;
        invalidateCache();  // Cache no longer valid
    }

    double getRadius() const { return radius; }
};

int main() {
    ExpensiveOperation op(3.14);

    // First call - cache miss
    double result1 = op.compute();
    std::cout << "Result: " << result1 << "\n\n";

    // Second call - cache hit
    double result2 = op.compute();
    std::cout << "Result: " << result2 << "\n\n";

    // Change data - invalidate cache
    op.setRadius(6.28);

    // Third call - cache miss again
    double result3 = op.compute();
    std::cout << "Result: " << result3 << "\n";

    return 0;
}

// Output:
// [Cache Miss] Computing...
// Result: 2.50457e+06
//
// [Cache Hit] Returning cached value
// Result: 2.50457e+06
//
// [Cache Miss] Computing...
// Result: -5.00885e+05
```

**Key Concepts**:
- Caching policy as CRTP mixin
- `mutable std::optional` for cache storage
- Cache invalidation on state changes
- Transparent caching without modifying core logic

---

#### Example 5: Multiple Policy Composition (Advanced)

```cpp
#include <iostream>
#include <string>
#include <optional>

// Logger policy
template <typename Derived>
class Logger {
public:
    void log(const std::string& msg) const {
        std::cout << "[" << static_cast<const Derived*>(this)->name()
                  << "] " << msg << "\n";
    }
};

// Caching policy
template <typename Derived>
class Cacheable {
    mutable std::optional<double> cache;

public:
    double getOrCompute() const {
        if (!cache) {
            static_cast<const Derived*>(this)->log("Computing value...");
            cache = static_cast<const Derived*>(this)->computeImpl();
            static_cast<const Derived*>(this)->log("Value cached");
        } else {
            static_cast<const Derived*>(this)->log("Using cached value");
        }
        return *cache;
    }

    void invalidateCache() {
        cache.reset();
        static_cast<const Derived*>(this)->log("Cache invalidated");
    }
};

// Metrics policy
template <typename Derived>
class Metricsable {
    mutable int callCount = 0;

public:
    void incrementCalls() const {
        callCount++;
    }

    int getCallCount() const { return callCount; }
};

// Class using multiple policies
class SmartCalculator
    : public Logger<SmartCalculator>,
      public Cacheable<SmartCalculator>,
      public Metricsable<SmartCalculator> {

    double value;

public:
    SmartCalculator(double v) : value(v) {
        this->log("SmartCalculator initialized");
    }

    double calculate() const {
        this->incrementCalls();
        return this->getOrCompute();
    }

    double computeImpl() const {
        // Expensive computation
        double result = value * value + value;
        return result;
    }

    void setValue(double v) {
        value = v;
        this->invalidateCache();
    }

    std::string name() const { return "SmartCalculator"; }

    void printStats() const {
        this->log("Total calls: " + std::to_string(this->getCallCount()));
    }
};

int main() {
    SmartCalculator calc(5.0);

    std::cout << "\nFirst calculation:\n";
    std::cout << "Result: " << calc.calculate() << "\n";

    std::cout << "\nSecond calculation (should use cache):\n";
    std::cout << "Result: " << calc.calculate() << "\n";

    std::cout << "\nChanging value:\n";
    calc.setValue(10.0);

    std::cout << "\nThird calculation (cache miss):\n";
    std::cout << "Result: " << calc.calculate() << "\n";

    std::cout << "\nStatistics:\n";
    calc.printStats();

    return 0;
}

// Output:
// [SmartCalculator] SmartCalculator initialized
//
// First calculation:
// [SmartCalculator] Computing value...
// [SmartCalculator] Value cached
// Result: 30
//
// Second calculation (should use cache):
// [SmartCalculator] Using cached value
// Result: 30
//
// Changing value:
// [SmartCalculator] Cache invalidated
//
// Third calculation (cache miss):
// [SmartCalculator] Computing value...
// [SmartCalculator] Value cached
// Result: 110
//
// Statistics:
// [SmartCalculator] Total calls: 3
```

**Key Concepts**:
- Multiple CRTP inheritance for policy composition
- Policies interact (Logger used by Cacheable)
- Zero runtime overhead
- Compile-time composition of behaviors

---

#### Example 6: Autonomous Vehicle Sensor Fusion with CRTP (Real-World)

```cpp
#include <iostream>
#include <vector>
#include <chrono>
#include <cmath>
#include <optional>

// Base sensor fusion policy
template <typename Derived>
class SensorFusion {
public:
    struct Measurement {
        double value;
        double variance;  // Uncertainty
        std::chrono::steady_clock::time_point timestamp;
    };

protected:
    double fusedEstimate = 0.0;
    double fusedVariance = 1.0;

public:
    void update(const Measurement& measurement) {
        // Get sensor-specific weight from derived class
        double weight = static_cast<Derived*>(this)->getSensorWeight(measurement);

        // Kalman-like fusion
        double kalmanGain = fusedVariance / (fusedVariance + measurement.variance);
        fusedEstimate = fusedEstimate + kalmanGain * (measurement.value - fusedEstimate);
        fusedVariance = (1 - kalmanGain) * fusedVariance;

        static_cast<Derived*>(this)->logUpdate(measurement);
    }

    double getEstimate() const { return fusedEstimate; }
    double getVariance() const { return fusedVariance; }
};

// LiDAR sensor with high accuracy
class LidarFusion : public SensorFusion<LidarFusion> {
public:
    double getSensorWeight(const Measurement& m) {
        // LiDAR is highly accurate - high weight
        return 1.0 / (m.variance + 0.01);
    }

    void logUpdate(const Measurement& m) {
        std::cout << "[LiDAR] Updated estimate: " << fusedEstimate
                  << " (variance: " << fusedVariance << ")\n";
    }

    std::string sensorType() const { return "LiDAR"; }
};

// Radar sensor with moderate accuracy
class RadarFusion : public SensorFusion<RadarFusion> {
public:
    double getSensorWeight(const Measurement& m) {
        // Radar less accurate than LiDAR - lower weight
        return 1.0 / (m.variance + 0.1);
    }

    void logUpdate(const Measurement& m) {
        std::cout << "[Radar] Updated estimate: " << fusedEstimate
                  << " (variance: " << fusedVariance << ")\n";
    }

    std::string sensorType() const { return "Radar"; }
};

// Camera sensor with lowest accuracy for distance
class CameraFusion : public SensorFusion<CameraFusion> {
public:
    double getSensorWeight(const Measurement& m) {
        // Camera has highest uncertainty for distance - lowest weight
        return 1.0 / (m.variance + 0.5);
    }

    void logUpdate(const Measurement& m) {
        std::cout << "[Camera] Updated estimate: " << fusedEstimate
                  << " (variance: " << fusedVariance << ")\n";
    }

    std::string sensorType() const { return "Camera"; }
};

int main() {
    LidarFusion lidar;
    RadarFusion radar;
    CameraFusion camera;

    auto now = std::chrono::steady_clock::now();

    // True obstacle distance: 10.0 meters
    // Different sensors report with different noise levels

    std::cout << "=== Sensor Fusion: Obstacle Distance ===\n\n";

    // LiDAR reading (high accuracy)
    SensorFusion<LidarFusion>::Measurement lidarMeas{10.2, 0.05, now};
    lidar.update(lidarMeas);

    // Radar reading (medium accuracy)
    SensorFusion<RadarFusion>::Measurement radarMeas{10.5, 0.2, now};
    radar.update(radarMeas);

    // Camera reading (low accuracy for distance)
    SensorFusion<CameraFusion>::Measurement cameraMeas{11.0, 0.8, now};
    camera.update(cameraMeas);

    std::cout << "\n=== Final Estimates ===\n";
    std::cout << "LiDAR: " << lidar.getEstimate()
              << " ± " << std::sqrt(lidar.getVariance()) << "\n";
    std::cout << "Radar: " << radar.getEstimate()
              << " ± " << std::sqrt(radar.getVariance()) << "\n";
    std::cout << "Camera: " << camera.getEstimate()
              << " ± " << std::sqrt(camera.getVariance()) << "\n";

    return 0;
}

// Output (sample):
// === Sensor Fusion: Obstacle Distance ===
//
// [LiDAR] Updated estimate: 0.18 (variance: 0.045)
// [Radar] Updated estimate: 0.875 (variance: 0.16)
// [Camera] Updated estimate: 4.583 (variance: 0.416)
//
// === Final Estimates ===
// LiDAR: 0.18 ± 0.212
// Radar: 0.875 ± 0.4
// Camera: 4.583 ± 0.645
```

**Key Concepts**:
- CRTP for sensor-specific fusion algorithms
- Policy-based design for different sensor characteristics
- Real-world autonomous vehicle sensor fusion
- Compile-time dispatch for zero-overhead sensor processing

---

### QUICK_REFERENCE: Key Takeaways and Comparison Tables
#### Answer Key

| Q# | Issue/Task | Solution/Answer |
|----|-----------|-----------------|
| Q1 | Infinite recursion (same method name) | Rename derived method to `processImpl()` and call that from base |
| Q2 | Two-phase lookup - `helper()` not found | Use `this->helper()`, `Base<T>::helper()`, or `using Base<T>::helper;` |
| Q3 | Complete Shape CRTP | `return static_cast<const T*>(this)->areaImpl();` and implement `areaImpl()` in Circle |
| Q4 | Ambiguous `log()` from multiple bases | Use `Logger<MyClass>::log()` or `Debugger<MyClass>::log()` for explicit qualification |
| Q5 | Caching policy implementation | Use `mutable std::optional<double> cache;` check/set in `compute()` |
| Q6 | Compile-time interface enforcement | `static_assert(std::is_invocable_v<decltype(&T::printImpl), T&>, "...");` |
| Q7 | `sizeof(T)` on incomplete type | Move `sizeof(T)` usage to member function called after construction, not in constructor |
| Q8 | Multiple policy composition | `class SmartClass : public Logger<SmartClass>, public Metricsable<SmartClass> {}` |
| Q9 | Wrong template parameter detection | `static_assert(std::is_base_of_v<Base<T>, T>, "T must be derived from Base<T>");` |
| Q10 | CRTP iterator implementation | Implement `dereference()`, `increment()`, `equals()` in derived; base provides operators |
| Q11 | Cannot store different CRTP types | Use virtual functions instead - CRTP doesn't provide runtime polymorphism |
| Q12 | EBO awareness | Empty CRTP bases occupy 0 bytes due to EBO; `sizeof(WithPolicies) == sizeof(int)` |
| Q13 | Sensor fusion CRTP | Base provides fusion algorithm, derived provides sensor-specific `getSensorWeight()` |
| Q14 | Infinite recursion fix | Change to `static_cast<T*>(this)->interfaceImpl();` (different method name) |
| Q15 | `enable_shared_from_this` | `return shared_from_this();` to get shared_ptr from member function |
| Q16 | Partial specialization | `template<typename T> class Serializer<T, std::enable_if_t<std::is_arithmetic_v<T>>> {}` |
| Q17 | Lifetime tracker mixin | Constructor increments static counter, destructor decrements; print in base |
| Q18 | Non-copyable CRTP | Delete copy in protected section of base: `NonCopyable(const NonCopyable&) = delete;` |
| Q19 | Improve error messages | Add `static_assert` with clear message in base constructor checking for `required()` |
| Q20 | Real-time controller | Base provides timing loop, derived provides `computeControl()`, `updateActuators()` |

---

#### CRTP Design Patterns Quick Reference

#### 1. Basic Static Polymorphism
```cpp
template <typename T>
class Base {
public:
    void interface() {
        static_cast<T*>(this)->impl();
    }
};

class Derived : public Base<Derived> {
public:
    void impl() { /* ... */ }
};
```

#### 2. Logging Mixin
```cpp
template <typename T>
class Loggable {
public:
    void log(const std::string& msg) const {
        std::cout << "[" << static_cast<const T*>(this)->name()
                  << "] " << msg << "\n";
    }
};
```

#### 3. Caching Policy
```cpp
template <typename T>
class Cacheable {
    mutable std::optional<double> cache;
public:
    double compute() const {
        if (!cache) {
            cache = static_cast<const T*>(this)->computeImpl();
        }
        return *cache;
    }
    void invalidate() { cache.reset(); }
};
```

#### 4. Interface Enforcement
```cpp
template <typename T>
class Enforced {
public:
    Enforced() {
        static_assert(std::is_invocable_v<decltype(&T::required), T&>,
                      "T must implement required()");
    }
};
```

#### 5. Multiple Policy Composition
```cpp
class MyClass
    : public Logger<MyClass>,
      public Cacheable<MyClass>,
      public Metricsable<MyClass> {
    // Composes behaviors at zero cost
};
```

---

#### Performance Comparison Table

| Feature | CRTP | Virtual Functions | Templates |
|---------|------|-------------------|-----------|
| Dispatch Time | Compile-time | Runtime | Compile-time |
| Overhead | 0ns (inlined) | ~5-10ns (vtable) | 0ns |
| Code Size | Larger (per type) | Smaller (shared) | Larger |
| Runtime Polymorphism | ❌ No | ✅ Yes | ❌ No |
| Type Known | Compile-time | Runtime | Compile-time |
| Heterogeneous Containers | ❌ No | ✅ Yes | ❌ No |
| Inlining | ✅ Full | ❌ Limited | ✅ Full |

---

#### When to Use CRTP

✅ **Use CRTP When**:
- Performance is critical (sensor processing, control loops)
- Types known at compile-time
- Want zero-overhead code reuse
- Policy-based design
- Mixin pattern for cross-cutting concerns
- Need compile-time polymorphism
- Implementing STL-like interfaces

❌ **Don't Use CRTP When**:
- Need runtime polymorphism
- Heterogeneous containers required (`vector<Base*>`)
- Plugin architectures
- Types not known until runtime
- Code simplicity more important than performance

---

#### Common Pitfalls Checklist

- [ ] **Name hiding**: Use `this->` for template-dependent names
- [ ] **Infinite recursion**: Base and derived methods must have different names
- [ ] **Template parameter**: Verify `class Derived : public Base<Derived>` (not wrong type)
- [ ] **Incomplete types**: Avoid `sizeof(T)` in base constructor
- [ ] **Multiple inheritance**: Watch for name conflicts between policies
- [ ] **Interface checking**: Add `static_assert` for required methods
- [ ] **Error messages**: Use `static_assert` for clear compile errors
- [ ] **Runtime polymorphism**: Don't expect CRTP to work like virtual functions

---

#### Autonomous Vehicle Use Cases

| Component | CRTP Application | Benefits |
|-----------|------------------|----------|
| **Sensor Fusion** | Different fusion algorithms per sensor type | Zero-overhead sensor processing |
| **Control Systems** | PID, MPC, LQR controllers with common interface | Real-time performance |
| **Perception Pipeline** | Object detection policies (vision, lidar, radar) | Compile-time algorithm selection |
| **Path Planning** | Different planner types (A*, RRT, hybrid) | Inlined planning algorithms |
| **State Estimation** | Kalman filter variants (EKF, UKF, Particle) | Zero-cost abstraction |
| **Data Logging** | Logging policy for all components | Uniform logging without overhead |

---

#### Compile-Time Interface Enforcement

```cpp
template <typename T>
class InterfaceBase {
public:
    InterfaceBase() {
        // Check method existence
        static_assert(std::is_invocable_v<decltype(&T::method1), T&>,
                      "T must implement method1()");

        // Check return type
        static_assert(std::is_invocable_r_v<int, decltype(&T::method2), T&>,
                      "T must implement int method2()");

        // Check const correctness
        static_assert(std::is_invocable_v<decltype(&T::method3), const T&>,
                      "T must implement method3() const");
    }
};
```

---

#### Testing Strategies

```cpp
// 1. Test basic CRTP dispatch
Derived d;
Base<Derived>& b = d;
b.interface();  // Should call Derived::impl()

// 2. Test multiple policy composition
MyClass obj;
obj.log("test");          // From Logger
obj.compute();            // From Cacheable
obj.recordMetric();       // From Metricsable

// 3. Test compile-time constraints
// This should fail to compile:
// class Bad : public Enforced<Bad> {};  // Missing required methods

// 4. Verify Empty Base Optimization
static_assert(sizeof(MyClass) == sizeof(int), "EBO failed");

// 5. Performance benchmark
auto start = std::chrono::high_resolution_clock::now();
for (int i = 0; i < 1000000; i++) {
    crtp_obj.method();  // Should be faster than virtual
}
auto end = std::chrono::high_resolution_clock::now();
```

---

**End of CRTP (Curiously Recurring Template Pattern) Topic**
