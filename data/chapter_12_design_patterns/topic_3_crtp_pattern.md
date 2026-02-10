# TOPIC: CRTP (Curiously Recurring Template Pattern)

---

## THEORY_SECTION

### What is CRTP?

**CRTP** (Curiously Recurring Template Pattern) is a C++ idiom where a class `Derived` inherits from a template base class `Base<Derived>`, passing itself as a template argument. This creates a "curious" recursive relationship that enables compile-time polymorphism without the overhead of virtual functions.

```cpp
// CRTP structure
template <typename Derived>
class Base {
public:
    void interface() {
        // Downcast to derived class at compile-time
        static_cast<Derived*>(this)->implementation();
    }
};

class Derived : public Base<Derived> {
public:
    void implementation() {
        std::cout << "Derived implementation\n";
    }
};
```

### Why CRTP Matters in Autonomous Driving

In autonomous vehicle systems, CRTP is extensively used for:

1. **Zero-Overhead Abstraction**: No virtual function overhead for time-critical sensor processing
2. **Policy-Based Design**: Compile-time selection of algorithms (e.g., Kalman vs Extended Kalman filter)
3. **Mixin Classes**: Adding logging, caching, or metrics to components without runtime cost
4. **Static Interfaces**: Enforcing interface contracts at compile-time
5. **Code Reuse**: Sharing common behavior across sensor types, controllers, or planning algorithms

**Key Advantages**:
- **Performance**: No vtable lookup, fully inlined calls
- **Type Safety**: Compile-time interface checking
- **Zero Runtime Cost**: All polymorphism resolved at compile-time
- **Flexibility**: Easy to compose multiple behaviors via multiple inheritance

### CRTP vs Virtual Polymorphism

| Feature | CRTP (Static) | Virtual Functions (Dynamic) |
|---------|---------------|----------------------------|
| Dispatch Time | Compile-time | Runtime |
| Performance | No overhead (inlined) | Vtable lookup overhead |
| Type Safety | Compile-time errors | Runtime polymorphism |
| Code Size | May increase (template instantiation) | Smaller code |
| Flexibility | Type known at compile-time | Type can change at runtime |
| Use Case | Performance-critical, known types | Runtime polymorphism needed |

**When to Use CRTP**:
- Performance is critical (sensor fusion, control loops)
- Type is known at compile-time
- Want code reuse without virtual overhead
- Policy-based design (compile-time customization)
- Mixins and composable behaviors

**When to Use Virtual Functions**:
- Need true runtime polymorphism
- Type not known until runtime
- Plugin architectures
- Performance overhead acceptable

---

## EDGE_CASES

### 1. Name Hiding in Template Base Classes

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

### 2. Infinite Recursion Without Implementation Override

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

### 3. Multiple CRTP Inheritance Ambiguity

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

### 4. Incomplete Type Issues with sizeof()

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

### 5. Slicing with Value Semantics

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

## CODE_EXAMPLES

### Example 1: Basic CRTP - Static Polymorphism (Easy)

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

### Example 2: Shape Hierarchy with CRTP (Mid)

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

### Example 3: Logging Policy with CRTP (Advanced)

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

### Example 4: Caching Policy with CRTP (Advanced)

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

### Example 5: Multiple Policy Composition (Advanced)

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

### Example 6: Autonomous Vehicle Sensor Fusion with CRTP (Real-World)

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

## INTERVIEW_QA

#### Q1: What is CRTP and how does it differ from traditional virtual inheritance?
**Difficulty:** #beginner
**Category:** #conceptual
**Concepts:** #crtp_basics #static_polymorphism

**Question:** What is CRTP and how does it differ from traditional virtual inheritance?



**Answer**: CRTP (Curiously Recurring Template Pattern) is a C++ idiom where a class inherits from a template base class parameterized by the derived class itself (`class Derived : public Base<Derived>`). Unlike virtual inheritance, CRTP provides compile-time (static) polymorphism with zero runtime overhead, while virtual functions provide runtime (dynamic) polymorphism with vtable lookup cost.

**Explanation**:
```cpp
// CRTP - Compile-time polymorphism
template <typename T>
class CRTPBase {
public:
    void interface() {
        static_cast<T*>(this)->implementation();  // Resolved at compile-time
    }
};

class CRTPDerived : public CRTPBase<CRTPDerived> {
public:
    void implementation() { std::cout << "CRTP\n"; }
};

// Virtual - Runtime polymorphism
class VirtualBase {
public:
    virtual void interface() = 0;  // Resolved at runtime via vtable
};

class VirtualDerived : public VirtualBase {
public:
    void interface() override { std::cout << "Virtual\n"; }
};
```

**Performance Comparison**:
- CRTP: No vtable, fully inlineable, known at compile-time
- Virtual: Vtable lookup, cannot inline through pointer, known at runtime

**Key Takeaway**: Use CRTP when types are known at compile-time and performance is critical; use virtual functions when true runtime polymorphism is needed.

---

#### Q2: Why do we use `static_cast<Derived*>(this)` in CRTP? What happens if we...
**Difficulty:** #beginner
**Category:** #syntax
**Concepts:** #template_instantiation #static_cast

**Question:** Why do we use `static_cast<Derived*>(this)` in CRTP? What happens if we don't cast?



**Answer**: `static_cast<Derived*>(this)` downcasts the base class pointer to the derived class type, enabling access to derived class methods. Without the cast, the base class cannot call derived class methods because `this` has type `Base<Derived>*`, not `Derived*`.

**Explanation**:
```cpp
template <typename T>
class Base {
public:
    void callDerived() {
        // this->derivedMethod();  // ❌ Error: Base doesn't have derivedMethod()
        static_cast<T*>(this)->derivedMethod();  // ✅ Works: downcasts to Derived*
    }
};

class Derived : public Base<Derived> {
public:
    void derivedMethod() {
        std::cout << "Derived method called\n";
    }
};
```

**Why is static_cast safe here?**
- We KNOW `this` actually points to a `Derived` object (guaranteed by inheritance structure)
- The cast is resolved at compile-time (zero runtime cost)
- Compiler can verify correctness

**Key Takeaway**: `static_cast<Derived*>(this)` is the core mechanism enabling CRTP's compile-time polymorphism, allowing base class methods to invoke derived class implementations.

---

#### Q3: How does CRTP enable code reuse without virtual functions? Give an example...
**Difficulty:** #mid
**Category:** #design
**Concepts:** #code_reuse #mixin_pattern

**Question:** How does CRTP enable code reuse without virtual functions? Give an example of a logging mixin.



**Answer**: CRTP enables code reuse by allowing a base template class to provide common functionality that can be customized by derived classes through template parameter specialization. Each derived class gets its own instantiation of the base class, sharing implementation but not data.

**Explanation**:
```cpp
// Logging mixin using CRTP
template <typename T>
class Loggable {
public:
    void log(const std::string& message) const {
        std::cout << "[" << static_cast<const T*>(this)->getLogPrefix()
                  << "] " << message << "\n";
    }
};

class DatabaseConnection : public Loggable<DatabaseConnection> {
public:
    void connect() {
        this->log("Connecting to database...");
        // Connection logic
        this->log("Connected successfully");
    }

    std::string getLogPrefix() const { return "DB"; }
};

class FileHandler : public Loggable<FileHandler> {
public:
    void open(const std::string& filename) {
        this->log("Opening file: " + filename);
        // File open logic
        this->log("File opened");
    }

    std::string getLogPrefix() const { return "FILE"; }
};
```

**Benefits**:
- No virtual function overhead
- Each class gets customized logging behavior
- Shared `log()` implementation
- Compile-time type safety

**Key Takeaway**: CRTP mixins provide reusable functionality across unrelated classes without runtime overhead, making it ideal for cross-cutting concerns like logging, metrics, and caching.

---

#### Q4: Why does this code fail to compile? How do you fix it?
**Difficulty:** #mid
**Category:** #debugging
**Concepts:** #twophase_lookup #templatedependent_names

**Question:** Why does this code fail to compile? How do you fix it?



```cpp
template <typename T>
class Base {
public:
    void helper() { std::cout << "Helper\n"; }
};

template <typename T>
class Derived : public Base<T> {
public:
    void method() {
        helper();  // Error: 'helper' not found
    }
};
```

**Answer**: The code fails due to **two-phase lookup** in templates. During the first phase, the compiler doesn't look in dependent base classes for unqualified names. Fix by using `this->helper()`, `Base<T>::helper()`, or a `using` declaration.

**Explanation**:
```cpp
// ✅ Fix 1: Use this->
template <typename T>
class DerivedFix1 : public Base<T> {
public:
    void method() {
        this->helper();  // ✅ Qualified lookup finds it
    }
};

// ✅ Fix 2: Using declaration
template <typename T>
class DerivedFix2 : public Base<T> {
    using Base<T>::helper;  // ✅ Brings name into scope
public:
    void method() {
        helper();  // ✅ Now visible
    }
};

// ✅ Fix 3: Explicit qualification
template <typename T>
class DerivedFix3 : public Base<T> {
public:
    void method() {
        Base<T>::helper();  // ✅ Fully qualified
    }
};
```

**Why does this happen?**
- Template-dependent base classes are not searched during unqualified lookup
- Prevents surprises from template specializations
- Enforces explicit intent

**Key Takeaway**: Always use `this->`, `using`, or explicit qualification when accessing base class members in template-dependent contexts.

---

#### Q5: What are the performance implications of CRTP compared to virtual functions?...
**Difficulty:** #mid
**Category:** #performance
**Concepts:** #compiletime_vs_runtime_dispatch

**Question:** What are the performance implications of CRTP compared to virtual functions? When is each appropriate?



**Answer**: CRTP has zero runtime overhead (no vtable, fully inlined) but may increase code size due to template instantiations. Virtual functions add vtable lookup overhead (~5-10ns per call) but smaller code size. Use CRTP for performance-critical code with known types; use virtual for runtime polymorphism.

**Explanation**:
```cpp
// CRTP - Compile-time dispatch
template <typename T>
class CRTPProcessor {
public:
    void process(const std::vector<int>& data) {
        for (int val : data) {
            static_cast<T*>(this)->processValue(val);  // Inlined at compile-time
        }
    }
};

class FastProcessor : public CRTPProcessor<FastProcessor> {
public:
    void processValue(int val) {
        result += val * 2;  // Compiler can inline and optimize
    }
private:
    int result = 0;
};

// Virtual - Runtime dispatch
class VirtualProcessor {
public:
    virtual void processValue(int val) = 0;  // Vtable lookup required

    void process(const std::vector<int>& data) {
        for (int val : data) {
            processValue(val);  // Cannot inline through pointer
        }
    }
};
```

**Benchmark Results** (processing 1M integers):
- CRTP: ~5ms (fully inlined loop)
- Virtual: ~15ms (vtable lookup overhead)
- **3x performance difference** in tight loops

**Code Size**:
- CRTP: Separate code for each derived class (larger binary)
- Virtual: One implementation + vtable (smaller binary)

**Key Takeaway**: CRTP is ideal for performance-critical code (sensor processing, control loops) where types are known at compile-time. Use virtual functions when you need true runtime polymorphism or plugin architectures.

---

#### Q6: How do you compose multiple CRTP policies (e.g., logging + caching) in a...
**Difficulty:** #advanced
**Category:** #design_pattern
**Concepts:** #policybased_design #multiple_inheritance

**Question:** How do you compose multiple CRTP policies (e.g., logging + caching) in a single class? What issues can arise?



**Answer**: Compose policies via multiple inheritance: `class Foo : public Logger<Foo>, public Cacheable<Foo>`. Issues include name conflicts (if policies have same method names), increased complexity, and potential for ambiguous method resolution.

**Explanation**:
```cpp
// Multiple CRTP policies
template <typename T>
class Logger {
public:
    void log(const std::string& msg) const {
        std::cout << "[LOG] " << msg << "\n";
    }
};

template <typename T>
class Cacheable {
    mutable std::optional<int> cache;
public:
    int getOrCompute() const {
        if (!cache) {
            cache = static_cast<const T*>(this)->computeImpl();
        }
        return *cache;
    }
};

// ✅ Composition via multiple inheritance
class MyClass : public Logger<MyClass>, public Cacheable<MyClass> {
public:
    void operation() {
        this->log("Computing value...");
        int result = this->getOrCompute();
        this->log("Result: " + std::to_string(result));
    }

    int computeImpl() const {
        return 42;  // Expensive computation
    }
};

// ❌ Potential issue: name conflicts
template <typename T>
class PolicyA {
public:
    void execute() { /* ... */ }
};

template <typename T>
class PolicyB {
public:
    void execute() { /* ... */ }  // ❌ Conflict with PolicyA!
};

class Conflicted : public PolicyA<Conflicted>, public PolicyB<Conflicted> {
public:
    void run() {
        // execute();  // ❌ Ambiguous!
        PolicyA<Conflicted>::execute();  // ✅ Explicitly qualify
    }
};
```

**Best Practices**:
1. Design policies with distinct method names
2. Use explicit qualification for conflicting methods
3. Document policy requirements (e.g., derived class must provide `computeImpl()`)
4. Consider template aliases for complex compositions

**Key Takeaway**: Multiple CRTP inheritance enables powerful policy composition but requires careful design to avoid method name conflicts and ambiguity.

---

#### Q7: How can you enforce that a derived class implements required methods when...
**Difficulty:** #advanced
**Category:** #template_metaprogramming
**Concepts:** #type_traits #sfinae #interface_enforcement

**Question:** How can you enforce that a derived class implements required methods when using CRTP?



**Answer**: Use `static_assert` with type traits (e.g., `std::is_invocable`) to check for required methods at compile-time. Alternatively, trigger compilation errors by calling unimplemented methods from the base class constructor or using SFINAE to conditionally enable functionality.

**Explanation**:
```cpp
#include <type_traits>

// ✅ Method 1: static_assert in base class
template <typename T>
class Base {
public:
    Base() {
        // Check if Derived has required method at compile-time
        static_assert(std::is_invocable_v<decltype(&T::requiredMethod), T&>,
                      "Derived class must implement requiredMethod()");
    }

    void interface() {
        static_cast<T*>(this)->requiredMethod();
    }
};

class GoodDerived : public Base<GoodDerived> {
public:
    void requiredMethod() { std::cout << "Implemented\n"; }
};

// class BadDerived : public Base<BadDerived> {
//     // ❌ Missing requiredMethod() - static_assert fails at compile-time
// };

// ✅ Method 2: Explicit instantiation in constructor
template <typename T>
class EnforcedBase {
public:
    EnforcedBase() {
        // This will fail to compile if requiredMethod doesn't exist
        auto check = &T::requiredMethod;
        (void)check;  // Suppress unused variable warning
    }

    void interface() {
        static_cast<T*>(this)->requiredMethod();
    }
};

// ✅ Method 3: SFINAE with enable_if
template <typename T>
class ConditionalBase {
public:
    // Only enable if T has requiredMethod
    template <typename U = T>
    auto interface() -> decltype(std::declval<U>().requiredMethod(), void()) {
        static_cast<T*>(this)->requiredMethod();
    }
};
```

**Key Takeaway**: Use `static_assert` with type traits to enforce interface contracts in CRTP, providing clear compile-time errors when derived classes don't meet requirements.

---

#### Q8: What is "code bloat" in CRTP and how does it compare to virtual function...
**Difficulty:** #advanced
**Category:** #performance
**Concepts:** #code_bloat #optimization

**Question:** What is "code bloat" in CRTP and how does it compare to virtual function overhead?



**Answer**: Code bloat occurs when templates generate separate code for each instantiation, increasing binary size. CRTP creates one copy of base class methods for each derived class. Virtual functions have smaller code size (one implementation + vtable) but runtime overhead. Trade-off: CRTP optimizes runtime at expense of code size; virtuals optimize code size at expense of runtime.

**Explanation**:
```cpp
// CRTP - Separate code for each type
template <typename T>
class CRTPProcessor {
public:
    void process(int value) {  // Generated for EACH Derived class
        static_cast<T*>(this)->impl(value);
        // Additional processing...
    }
};

class TypeA : public CRTPProcessor<TypeA> {
public:
    void impl(int v) { /* ... */ }
};

class TypeB : public CRTPProcessor<TypeB> {
public:
    void impl(int v) { /* ... */ }
};

// Result: TWO copies of process() in binary (one for TypeA, one for TypeB)

// Virtual - Single code, vtable overhead
class VirtualProcessor {
public:
    virtual void impl(int v) = 0;

    void process(int value) {  // ONE copy in binary
        impl(value);  // Runtime dispatch via vtable
        // Additional processing...
    }
};

class TypeC : public VirtualProcessor {
public:
    void impl(int v) override { /* ... */ }
};

class TypeD : public VirtualProcessor {
public:
    void impl(int v) override { /* ... */ }
};

// Result: ONE copy of process() + vtable entries
```

**Size Comparison** (100 derived classes):
- CRTP: 100 copies of base methods (~10KB per class = 1MB total)
- Virtual: 1 copy of base methods + 100 vtables (~10KB + 800 bytes = ~11KB total)

**Runtime Comparison**:
- CRTP: 0ns overhead (inlined)
- Virtual: ~5-10ns per call (vtable lookup)

**Key Takeaway**: CRTP trades code size for runtime performance. Use CRTP in performance-critical paths where the code size increase is acceptable; use virtual functions when binary size matters more than microseconds.

---

#### Q9: In an autonomous vehicle sensor fusion system, why would you use CRTP...
**Difficulty:** #mid
**Category:** #realworld_application
**Concepts:** #sensor_fusion #compiletime_dispatch

**Question:** In an autonomous vehicle sensor fusion system, why would you use CRTP instead of virtual functions for sensor processing?



**Answer**: Sensor fusion runs in real-time control loops (e.g., 100Hz) where every nanosecond matters. CRTP eliminates vtable overhead, enables full inlining of sensor-specific fusion algorithms, and allows compile-time specialization of Kalman filter variants without runtime cost. Virtual functions would add ~10ns overhead per sensor update, cumulating to microseconds in multi-sensor systems.

**Explanation**:
```cpp
// CRTP-based sensor fusion (zero overhead)
template <typename SensorType>
class SensorFusion {
public:
    void updateEstimate(const Measurement& m) {
        // Sensor-specific filtering - fully inlined
        static_cast<SensorType*>(this)->preprocess(m);

        // Common fusion logic
        kalmanUpdate(m.value, m.variance);

        // Sensor-specific post-processing - fully inlined
        static_cast<SensorType*>(this)->postprocess();
    }

private:
    void kalmanUpdate(double value, double variance) {
        // Kalman filter update equations
        double K = P / (P + variance);
        estimate += K * (value - estimate);
        P *= (1 - K);
    }

    double estimate = 0.0;
    double P = 1.0;
};

class LidarFusion : public SensorFusion<LidarFusion> {
public:
    void preprocess(const Measurement& m) {
        // LiDAR-specific filtering (outlier rejection)
        // Fully inlined - zero overhead
    }

    void postprocess() {
        // LiDAR-specific confidence adjustment
        // Fully inlined - zero overhead
    }
};

class RadarFusion : public SensorFusion<RadarFusion> {
public:
    void preprocess(const Measurement& m) {
        // Radar-specific Doppler compensation
        // Fully inlined - zero overhead
    }

    void postprocess() {
        // Radar-specific noise filtering
        // Fully inlined - zero overhead
    }
};

// Processing loop (100Hz)
void controlLoop() {
    LidarFusion lidar;
    RadarFusion radar;

    while (running) {
        auto lidarMeas = getLidarMeasurement();
        lidar.updateEstimate(lidarMeas);  // ✅ Fully inlined, 0ns overhead

        auto radarMeas = getRadarMeasurement();
        radar.updateEstimate(radarMeas);  // ✅ Fully inlined, 0ns overhead

        // Control decisions based on fused estimates
    }
}
```

**Performance Impact**:
- 10 sensors × 100Hz × 10ns vtable overhead = 10µs per cycle
- At 100Hz control loop, that's 0.1% CPU overhead just from virtual calls
- In safety-critical systems, every microsecond counts

**Key Takeaway**: CRTP is essential in real-time autonomous systems where deterministic performance and zero-overhead abstractions are required for sensor fusion and control algorithms.

---

#### Q10: What are the limitations of CRTP? When can you NOT use it?
**Difficulty:** #advanced
**Category:** #limitations
**Concepts:** #runtime_polymorphism #containers

**Question:** What are the limitations of CRTP? When can you NOT use it?



**Answer**: CRTP cannot provide runtime polymorphism—you cannot store different CRTP-derived types in the same container or select implementations at runtime. Each derived type is a completely different type at compile-time. Use virtual functions when you need heterogeneous collections, plugin architectures, or any scenario where the concrete type isn't known until runtime.

**Explanation**:
```cpp
// ❌ Cannot do this with CRTP
template <typename T>
class Shape {
public:
    double area() {
        return static_cast<T*>(this)->areaImpl();
    }
};

class Circle : public Shape<Circle> { /* ... */ };
class Rectangle : public Shape<Rectangle> { /* ... */ };

// ❌ Cannot create heterogeneous container
// std::vector<Shape<???>> shapes;  // ❌ What template parameter?

// ❌ Cannot store different shapes together
// std::vector<Shape<Circle>> shapes;
// shapes.push_back(Rectangle{});  // ❌ Type mismatch!

// ✅ Virtual functions allow heterogeneous containers
class VirtualShape {
public:
    virtual double area() = 0;
    virtual ~VirtualShape() = default;
};

class VirtualCircle : public VirtualShape {
public:
    double area() override { /* ... */ }
};

class VirtualRectangle : public VirtualShape {
public:
    double area() override { /* ... */ }
};

// ✅ Works: heterogeneous container
std::vector<std::unique_ptr<VirtualShape>> shapes;
shapes.push_back(std::make_unique<VirtualCircle>());
shapes.push_back(std::make_unique<VirtualRectangle>());

for (auto& shape : shapes) {
    std::cout << shape->area() << "\n";  // ✅ Runtime polymorphism
}
```

**CRTP Limitations**:
1. ❌ No heterogeneous containers
2. ❌ No runtime type selection
3. ❌ No plugin architectures (loading types at runtime)
4. ❌ Cannot change type after construction
5. ❌ More complex error messages

**When to Use Virtual Instead**:
- Need `std::vector<Base*>` of mixed types
- Plugin systems (load `.so`/`.dll` at runtime)
- Strategy pattern (swap algorithms at runtime)
- Factory pattern (type determined by config file)

**Key Takeaway**: CRTP is for compile-time polymorphism only. If you need runtime type selection, heterogeneous containers, or plugins, you must use virtual functions.

---

#### Q11: What is the "curiously recurring" part of CRTP? Why is it called that?
**Difficulty:** #beginner
**Category:** #syntax
**Concepts:** #template_inheritance_syntax

**Question:** What is the "curiously recurring" part of CRTP? Why is it called that?



**Answer**: The "curiously recurring" part refers to the derived class passing itself as a template argument to its own base class (`class Derived : public Base<Derived>`). It's "curious" because the derived class appears to reference itself before it's fully defined, creating a recursive-looking relationship that was unusual when the pattern was first described.

**Explanation**:
```cpp
// The "curious" recursion
template <typename T>
class Base {
public:
    void interface() {
        static_cast<T*>(this)->impl();  // Base knows about Derived type
    }
};

// Derived passes itself to Base!
class Derived : public Base<Derived> {  // ⬅️ "Curiously recurring"
public:
    void impl() {
        std::cout << "Implementation\n";
    }
};
```

**Why is this legal?**
- When `Base<Derived>` is instantiated, `Derived` doesn't need to be complete yet
- The base class only uses `Derived*` (pointer), which doesn't require complete type
- Member functions are only compiled when called, by which point `Derived` is complete

**Historical Note**: James Coplien coined the term in 1995 when describing this pattern, noting it was "curious" because it seemed circular but was actually quite powerful.

**Key Takeaway**: The "curious" recursion (`Derived : Base<Derived>`) is what enables compile-time polymorphism by allowing the base class to know the derived type through the template parameter.

---

#### Q12: What naming convention should you use for CRTP methods to avoid infinite...
**Difficulty:** #mid
**Category:** #best_practices
**Concepts:** #interface_design #naming_conventions

**Question:** What naming convention should you use for CRTP methods to avoid infinite recursion?



**Answer**: Use different method names in the base class (public interface) and derived class (implementation). Common patterns: `interface()` calls `interfaceImpl()`, or `compute()` calls `computeImpl()`. Never have the base class method call a derived method with the same name.

**Explanation**:
```cpp
// ❌ Bad: Same name causes infinite recursion
template <typename T>
class BadBase {
public:
    void process() {
        static_cast<T*>(this)->process();  // ❌ Infinite recursion!
    }
};

class BadDerived : public BadBase<BadDerived> {
public:
    void process() {
        std::cout << "Processing\n";
    }
};

// ✅ Good: Different names
template <typename T>
class GoodBase {
public:
    void process() {  // Public interface
        static_cast<T*>(this)->processImpl();  // ✅ Calls different method
    }
};

class GoodDerived : public GoodBase<GoodDerived> {
public:
    void processImpl() {  // Implementation
        std::cout << "Processing\n";
    }
};

// ✅ Alternative: Prefix pattern
template <typename T>
class PrefixBase {
public:
    void compute() {
        doPreProcessing();
        static_cast<T*>(this)->doCompute();  // ✅ "do" prefix
        doPostProcessing();
    }

private:
    void doPreProcessing() { /* ... */ }
    void doPostProcessing() { /* ... */ }
};
```

**Common Naming Patterns**:
1. `Impl` suffix: `compute()` → `computeImpl()`
2. `do` prefix: `compute()` → `doCompute()`
3. Protected prefix: `compute()` → `compute_impl()`
4. Verb change: `calculate()` → `performCalculation()`

**Key Takeaway**: Always use distinct names for CRTP interface methods (in base) and implementation methods (in derived) to avoid infinite recursion and make the pattern clear.

---

#### Q13: CRTP often produces cryptic compiler errors. What strategies help debug...
**Difficulty:** #advanced
**Category:** #error_messages
**Concepts:** #template_errors #debugging

**Question:** CRTP often produces cryptic compiler errors. What strategies help debug CRTP-related compilation failures?



**Answer**: (1) Use `static_assert` to check template constraints early, (2) add explicit interface enforcement, (3) use type traits to validate derived class, (4) simplify error messages with concepts (C++20), and (5) compile incrementally to isolate errors.

**Explanation**:
```cpp
// ❌ Cryptic error: "no member named 'required' in 'Derived'"
template <typename T>
class Base {
public:
    void interface() {
        static_cast<T*>(this)->required();  // ❌ If missing, terrible error
    }
};

// ✅ Better: Add static_assert for clear errors
template <typename T>
class BetterBase {
public:
    BetterBase() {
        // Check method exists at compile-time
        static_assert(std::is_invocable_v<decltype(&T::required), T&>,
                      "Derived class must implement 'void required()'");
    }

    void interface() {
        static_cast<T*>(this)->required();
    }
};

// ✅ Even better: Use concepts (C++20)
template <typename T>
concept HasRequired = requires(T t) {
    { t.required() } -> std::same_as<void>;
};

template <HasRequired T>
class ConceptBase {
public:
    void interface() {
        static_cast<T*>(this)->required();
    }
};

// ✅ Debugging technique: Explicit instantiation
template <typename T>
class DebugBase {
public:
    DebugBase() {
        // Trigger compile error with clear message
        using RequiredMethod = decltype(&T::required);
        static_assert(!std::is_same_v<RequiredMethod, void>,
                      "T::required() not found or has wrong signature");
    }

    void interface() {
        static_cast<T*>(this)->required();
    }
};
```

**Debugging Strategies**:
1. **Incremental compilation**: Comment out derived classes one-by-one
2. **Explicit instantiation**: Force template instantiation to isolate errors
3. **Static asserts**: Check constraints in base class constructor
4. **Type trait checks**: Use `std::is_invocable`, `std::is_base_of`, etc.
5. **Concepts** (C++20): Explicit interface requirements

**Key Takeaway**: Proactively add compile-time checks (`static_assert`, concepts) to CRTP base classes to produce clear error messages when derived classes don't meet requirements.

---

#### Q14: How does CRTP enable the "mixin" design pattern? Give an example with...
**Difficulty:** #mid
**Category:** #design_pattern
**Concepts:** #mixin_pattern #composability

**Question:** How does CRTP enable the "mixin" design pattern? Give an example with logging and metrics.



**Answer**: CRTP enables mixins by allowing multiple base classes to inject functionality into a derived class without runtime overhead. Each mixin is a CRTP base providing specific behavior (logging, metrics, caching), and the derived class composes them via multiple inheritance. Unlike traditional mixins, CRTP mixins have zero runtime cost.

**Explanation**:
```cpp
// Logging mixin
template <typename T>
class Loggable {
public:
    void logInfo(const std::string& msg) const {
        std::cout << "[INFO] " << getDerivedName() << ": " << msg << "\n";
    }

    void logError(const std::string& msg) const {
        std::cerr << "[ERROR] " << getDerivedName() << ": " << msg << "\n";
    }

private:
    std::string getDerivedName() const {
        return static_cast<const T*>(this)->name();
    }
};

// Metrics mixin
template <typename T>
class Metricsable {
    mutable size_t callCount = 0;
    mutable std::chrono::steady_clock::time_point lastCall;

public:
    void recordCall() const {
        callCount++;
        lastCall = std::chrono::steady_clock::now();
    }

    size_t getCallCount() const { return callCount; }

    void printMetrics() const {
        std::cout << static_cast<const T*>(this)->name()
                  << " metrics: " << callCount << " calls\n";
    }
};

// Class using multiple mixins
class DataProcessor
    : public Loggable<DataProcessor>,
      public Metricsable<DataProcessor> {

public:
    void process(const std::vector<int>& data) {
        this->recordCall();
        this->logInfo("Starting processing...");

        // Process data
        for (int val : data) {
            // ...
        }

        this->logInfo("Processing complete");
    }

    std::string name() const { return "DataProcessor"; }

    void showStats() const {
        this->printMetrics();
    }
};

int main() {
    DataProcessor processor;

    processor.process({1, 2, 3});
    processor.process({4, 5, 6});

    processor.showStats();
    return 0;
}

// Output:
// [INFO] DataProcessor: Starting processing...
// [INFO] DataProcessor: Processing complete
// [INFO] DataProcessor: Starting processing...
// [INFO] DataProcessor: Processing complete
// DataProcessor metrics: 2 calls
```

**Benefits of CRTP Mixins**:
- Zero runtime overhead
- Compile-time composition
- Type-safe access to derived class
- No diamond inheritance issues (each base is unique template instantiation)

**Key Takeaway**: CRTP mixins provide the flexibility of multiple inheritance with the performance of compile-time dispatch, making them ideal for cross-cutting concerns in performance-critical code.

---

#### Q15: How does `std::enable_shared_from_this` use CRTP? Why is this design necessary?
**Difficulty:** #advanced
**Category:** #comparison
**Concepts:** #stdenable_shared_from_this

**Question:** How does `std::enable_shared_from_this` use CRTP? Why is this design necessary?



**Answer**: `std::enable_shared_from_this<T>` is a CRTP base class that allows an object managed by `shared_ptr` to safely create additional `shared_ptr` instances pointing to itself. This is necessary because creating `shared_ptr` from raw `this` would create independent control blocks, leading to double deletion.

**Explanation**:
```cpp
#include <memory>
#include <iostream>

// ❌ Wrong: Creates separate control blocks
class BadShared {
public:
    std::shared_ptr<BadShared> getShared() {
        return std::shared_ptr<BadShared>(this);  // ❌ New control block!
    }
};

void bad_usage() {
    auto ptr1 = std::make_shared<BadShared>();
    auto ptr2 = ptr1->getShared();  // ❌ Different control block!
    // ptr1 and ptr2 have separate ref counts → double delete!
}

// ✅ Correct: Uses CRTP enable_shared_from_this
class GoodShared : public std::enable_shared_from_this<GoodShared> {
public:
    std::shared_ptr<GoodShared> getShared() {
        return shared_from_this();  // ✅ Uses existing control block
    }

    void registerCallback() {
        // Can safely register callbacks that capture shared_ptr
        auto self = shared_from_this();
        // register(self);
    }
};

void good_usage() {
    auto ptr1 = std::make_shared<GoodShared>();
    auto ptr2 = ptr1->getShared();  // ✅ Same control block!
    // ptr1 and ptr2 share ref count → safe
}

// Simplified implementation of enable_shared_from_this
template <typename T>
class enable_shared_from_this_impl {
    mutable std::weak_ptr<T> weak_this;  // Doesn't affect ref count

    friend class std::shared_ptr<T>;  // Allow shared_ptr to set weak_this

public:
    std::shared_ptr<T> shared_from_this() {
        return weak_this.lock();  // Promote weak_ptr to shared_ptr
    }

    std::shared_ptr<const T> shared_from_this() const {
        return weak_this.lock();
    }
};
```

**How it works**:
1. `std::enable_shared_from_this<T>` contains a `weak_ptr<T>` member
2. When `make_shared<T>()` creates the object, it sets the weak_ptr
3. `shared_from_this()` promotes the `weak_ptr` to `shared_ptr`
4. All `shared_ptr` instances share the same control block

**Key Takeaway**: `std::enable_shared_from_this` demonstrates a practical STL use of CRTP to solve the problem of creating shared_ptr from `this` safely by maintaining a weak reference to the shared control block.

---

#### Q16: How can CRTP be used to implement custom iterator types that work with STL...
**Difficulty:** #mid
**Category:** #practical_usage
**Concepts:** #iterator_pattern #stl_integration

**Question:** How can CRTP be used to implement custom iterator types that work with STL algorithms?



**Answer**: CRTP can provide common iterator functionality (operators++, *, ->, ==, etc.) in a base class while allowing derived classes to provide container-specific implementation details. This reduces boilerplate when creating STL-compatible iterators.

**Explanation**:
```cpp
#include <iterator>
#include <iostream>
#include <vector>

// CRTP base for forward iterators
template <typename Derived, typename Value>
class ForwardIteratorCRTP {
public:
    using iterator_category = std::forward_iterator_tag;
    using value_type = Value;
    using difference_type = std::ptrdiff_t;
    using pointer = Value*;
    using reference = Value&;

    // Operators implemented using CRTP
    reference operator*() const {
        return static_cast<const Derived*>(this)->dereference();
    }

    pointer operator->() const {
        return &(operator*());
    }

    Derived& operator++() {
        static_cast<Derived*>(this)->increment();
        return static_cast<Derived&>(*this);
    }

    Derived operator++(int) {
        Derived tmp = static_cast<Derived&>(*this);
        ++(*this);
        return tmp;
    }

    bool operator==(const Derived& other) const {
        return static_cast<const Derived*>(this)->equals(other);
    }

    bool operator!=(const Derived& other) const {
        return !(*this == other);
    }
};

// Custom container
class MyContainer {
    std::vector<int> data;

public:
    MyContainer(std::initializer_list<int> init) : data(init) {}

    // Custom iterator using CRTP
    class Iterator : public ForwardIteratorCRTP<Iterator, int> {
        int* ptr;

    public:
        explicit Iterator(int* p) : ptr(p) {}

        // Implement required methods for CRTP
        int& dereference() const { return *ptr; }
        void increment() { ++ptr; }
        bool equals(const Iterator& other) const { return ptr == other.ptr; }
    };

    Iterator begin() { return Iterator(&data[0]); }
    Iterator end() { return Iterator(&data[0] + data.size()); }
};

int main() {
    MyContainer container = {1, 2, 3, 4, 5};

    // Works with STL algorithms!
    for (auto it = container.begin(); it != container.end(); ++it) {
        std::cout << *it << " ";
    }
    std::cout << "\n";

    // Range-based for loop
    for (int val : container) {
        std::cout << val * 2 << " ";
    }
    std::cout << "\n";

    return 0;
}

// Output:
// 1 2 3 4 5
// 2 4 6 8 10
```

**Benefits**:
- Reduces boilerplate for iterator implementation
- Ensures STL compliance
- Type-safe and zero-overhead
- Reusable across different container types

**Key Takeaway**: CRTP is excellent for implementing STL-compatible interfaces like iterators, providing compile-time code reuse while maintaining full type safety and performance.

---

#### Q17: Can you partially specialize a CRTP base class? Give an example where this...
**Difficulty:** #advanced
**Category:** #template_specialization
**Concepts:** #partial_specialization_with_crtp

**Question:** Can you partially specialize a CRTP base class? Give an example where this would be useful.



**Answer**: Yes, you can partially specialize CRTP base classes to provide different implementations for different type categories. This is useful for optimizing specific type families (e.g., arithmetic types vs custom types) or providing specialized behavior without modifying derived classes.

**Explanation**:
```cpp
#include <iostream>
#include <type_traits>
#include <cstring>

// Primary template: Generic serialization
template <typename T, typename Enable = void>
class Serializable {
public:
    std::string serialize() const {
        return static_cast<const T*>(this)->serializeImpl();
    }
};

// Partial specialization for arithmetic types
template <typename T>
class Serializable<T, std::enable_if_t<std::is_arithmetic_v<T>>> {
public:
    std::string serialize() const {
        T value = static_cast<const T*>(this)->getValue();
        return std::to_string(value);  // Optimized for numbers
    }
};

// Partial specialization for classes with std::string member
template <typename T>
class Serializable<T, std::enable_if_t<std::is_class_v<T>>> {
public:
    std::string serialize() const {
        // Assume classes have toString() method
        return static_cast<const T*>(this)->toString();
    }
};

// Example classes using specialized CRTP
class IntWrapper : public Serializable<IntWrapper> {
    int value;
public:
    IntWrapper(int v) : value(v) {}
    int getValue() const { return value; }
};

class Person : public Serializable<Person> {
    std::string name;
    int age;
public:
    Person(const std::string& n, int a) : name(n), age(a) {}

    std::string toString() const {
        return name + " (" + std::to_string(age) + ")";
    }
};

int main() {
    IntWrapper num(42);
    Person person("Alice", 30);

    std::cout << "IntWrapper: " << num.serialize() << "\n";
    std::cout << "Person: " << person.serialize() << "\n";

    return 0;
}

// Output:
// IntWrapper: 42
// Person: Alice (30)
```

**Real-World Use Case**: Optimized containers
```cpp
// Primary: Generic copy
template <typename T, typename = void>
class CopyOptimized {
public:
    void copy(const T* src, T* dst, size_t count) {
        for (size_t i = 0; i < count; ++i) {
            dst[i] = src[i];  // Element-wise copy
        }
    }
};

// Specialization: Trivially copyable types use memcpy
template <typename T>
class CopyOptimized<T, std::enable_if_t<std::is_trivially_copyable_v<T>>> {
public:
    void copy(const T* src, T* dst, size_t count) {
        std::memcpy(dst, src, count * sizeof(T));  // Fast bulk copy
    }
};
```

**Key Takeaway**: Partial specialization of CRTP base classes enables compile-time optimization for specific type categories without modifying derived classes, following the "zero-overhead principle."

---

#### Q18: What happens if you forget to inherit from the CRTP base class with the...
**Difficulty:** #mid
**Category:** #practical_debugging
**Concepts:** #common_crtp_mistakes

**Question:** What happens if you forget to inherit from the CRTP base class with the correct template parameter? How do you detect this error?



**Answer**: Forgetting the correct template parameter causes a mismatch between the base class expectation and actual derived type, leading to incorrect static_cast behavior (undefined behavior at best, compiler error at worst). Detect with `static_assert(std::is_base_of_v<Base<Derived>, Derived>)` in the base class.

**Explanation**:
```cpp
// CRTP base
template <typename T>
class Base {
public:
    void interface() {
        static_cast<T*>(this)->impl();
    }
};

// ❌ Wrong: Incorrect template parameter
class Wrong1 : public Base<int> {  // ❌ Should be Base<Wrong1>
public:
    void impl() { std::cout << "Implementation\n"; }
};

// ❌ Wrong: Typo in class name
class MyClass : public Base<MyClass_> {  // ❌ Typo: MyClass_ instead of MyClass
public:
    void impl() { std::cout << "Implementation\n"; }
};

// ✅ Correct
class Correct : public Base<Correct> {
public:
    void impl() { std::cout << "Implementation\n"; }
};

// ✅ Detection: Add compile-time check
template <typename T>
class SafeBase {
public:
    SafeBase() {
        static_assert(std::is_base_of_v<SafeBase<T>, T>,
                      "CRTP Error: Template parameter must be the derived class type");
    }

    void interface() {
        static_cast<T*>(this)->impl();
    }
};

// class WrongDetected : public SafeBase<int> {  // ❌ Compile error with clear message
// };

class CorrectDetected : public SafeBase<CorrectDetected> {  // ✅ Passes check
public:
    void impl() { std::cout << "Implementation\n"; }
};
```

**Common Mistakes**:
1. ❌ `class Derived : public Base<SomeOtherClass>`
2. ❌ `class Derived : public Base<Derived_>` (typo)
3. ❌ `class Derived : public Base<Base<Derived>>` (double wrapping)
4. ❌ Copy-paste error: `class NewClass : public Base<OldClass>`

**Key Takeaway**: Always add `static_assert(std::is_base_of_v<Base<T>, T>)` in CRTP base classes to catch template parameter mismatches at compile-time with clear error messages.

---

#### Q19: How does Empty Base Optimization (EBO) interact with CRTP? Why does this...
**Difficulty:** #advanced
**Category:** #performance_optimization
**Concepts:** #empty_base_optimization_ebo

**Question:** How does Empty Base Optimization (EBO) interact with CRTP? Why does this matter for policy-based design?



**Answer**: Empty Base Optimization allows empty CRTP base classes to occupy zero bytes when used as base classes, enabling zero-overhead policy composition. This is critical for policy-based design where multiple stateless mixins are composed—without EBO, each empty base would add padding bytes.

**Explanation**:
```cpp
#include <iostream>

// Empty policy classes (no data members)
template <typename T>
class Loggable {
public:
    void log(const std::string& msg) const {
        std::cout << "[LOG] " << msg << "\n";
    }
};

template <typename T>
class Validatable {
public:
    bool validate() const {
        return true;  // Validation logic
    }
};

template <typename T>
class Metricsable {
public:
    void recordMetric() const {
        // Record metric (typically to external system)
    }
};

// ❌ Without EBO (if not inheriting)
class WithoutEBO {
    Loggable<WithoutEBO> logger;      // Takes space even though empty
    Validatable<WithoutEBO> validator; // Takes space
    Metricsable<WithoutEBO> metrics;   // Takes space
    int data;

public:
    int getData() const { return data; }
};

// ✅ With EBO (inheriting from empty bases)
class WithEBO
    : public Loggable<WithEBO>,
      public Validatable<WithEBO>,
      public Metricsable<WithEBO> {

    int data;  // Only data member takes space

public:
    int getData() const { return data; }
};

int main() {
    std::cout << "Size without EBO: " << sizeof(WithoutEBO) << " bytes\n";
    std::cout << "Size with EBO: " << sizeof(WithEBO) << " bytes\n";

    return 0;
}

// Output (typical):
// Size without EBO: 16 bytes  (3 empty objects + padding + int)
// Size with EBO: 4 bytes      (just the int, empty bases optimized away)
```

**Real-World Impact**:
```cpp
// Sensor data structure with multiple policies
struct SensorData
    : public Loggable<SensorData>,
      public Cacheable<SensorData>,
      public Metricsable<SensorData>,
      public Serializable<SensorData> {

    double timestamp;
    double value;
    // Total size: 16 bytes (just data)
    // Without EBO: 32+ bytes (policies would add overhead)
};

// In a real-time system processing millions of sensor readings:
// EBO saves: (32 - 16) * 1,000,000 = 16MB of memory
```

**When EBO Applies**:
- ✅ Empty base classes (no data members)
- ✅ Class inheritance (not composition)
- ✅ First base class (guaranteed)
- ⚠️ Additional bases (compiler-dependent)

**Key Takeaway**: CRTP with empty policy base classes leverages EBO to achieve true zero-overhead policy composition, making it ideal for memory-constrained real-time systems.

---

#### Q20: Design a CRTP base class that enforces a complete interface contract at...
**Difficulty:** #advanced
**Category:** #realworld_design
**Concepts:** #interface_enforcement #compiletime_contracts

**Question:** Design a CRTP base class that enforces a complete interface contract at compile-time, including method signatures and return types. How would you use this in an autonomous vehicle perception pipeline?



**Answer**: Create a CRTP base with `static_assert` checks in the constructor using type traits to verify method existence, signatures, and return types. Use this to enforce standardized sensor interfaces across LiDAR, Radar, and Camera classes, ensuring compile-time safety in perception pipelines.

**Explanation**:
```cpp
#include <type_traits>
#include <vector>
#include <chrono>

// Enforced sensor interface using CRTP
template <typename Derived>
class SensorInterface {
public:
    // Point cloud data type
    struct PointCloud {
        std::vector<float> points;
        std::chrono::steady_clock::time_point timestamp;
    };

    SensorInterface() {
        // Enforce interface at compile-time
        static_assert(std::is_invocable_r_v<PointCloud, decltype(&Derived::capture), Derived&>,
                      "Derived must implement: PointCloud capture()");

        static_assert(std::is_invocable_r_v<bool, decltype(&Derived::initialize), Derived&>,
                      "Derived must implement: bool initialize()");

        static_assert(std::is_invocable_r_v<void, decltype(&Derived::shutdown), Derived&>,
                      "Derived must implement: void shutdown()");

        static_assert(std::is_invocable_r_v<double, decltype(&Derived::getMaxRange), const Derived&>,
                      "Derived must implement: double getMaxRange() const");
    }

    // Public interface
    PointCloud acquireData() {
        return static_cast<Derived*>(this)->capture();
    }

    bool init() {
        return static_cast<Derived*>(this)->initialize();
    }

    void stop() {
        static_cast<Derived*>(this)->shutdown();
    }

    double maxRange() const {
        return static_cast<const Derived*>(this)->getMaxRange();
    }
};

// LiDAR sensor implementation
class LidarSensor : public SensorInterface<LidarSensor> {
public:
    PointCloud capture() {
        // Capture LiDAR point cloud
        PointCloud pc;
        pc.timestamp = std::chrono::steady_clock::now();
        // ... LiDAR-specific capture logic
        return pc;
    }

    bool initialize() {
        std::cout << "LiDAR initialized\n";
        return true;
    }

    void shutdown() {
        std::cout << "LiDAR shut down\n";
    }

    double getMaxRange() const {
        return 100.0;  // 100 meters
    }
};

// Radar sensor implementation
class RadarSensor : public SensorInterface<RadarSensor> {
public:
    PointCloud capture() {
        // Capture Radar detections
        PointCloud pc;
        pc.timestamp = std::chrono::steady_clock::now();
        // ... Radar-specific capture logic
        return pc;
    }

    bool initialize() {
        std::cout << "Radar initialized\n";
        return true;
    }

    void shutdown() {
        std::cout << "Radar shut down\n";
    }

    double getMaxRange() const {
        return 200.0;  // 200 meters
    }
};

// ❌ This will fail to compile with clear error
// class BadSensor : public SensorInterface<BadSensor> {
//     // Missing required methods - static_assert will fail
// };

// Perception pipeline using enforced interface
template <typename SensorType>
class PerceptionPipeline {
    static_assert(std::is_base_of_v<SensorInterface<SensorType>, SensorType>,
                  "SensorType must inherit from SensorInterface<SensorType>");

    SensorType sensor;

public:
    void run() {
        if (sensor.init()) {
            std::cout << "Sensor range: " << sensor.maxRange() << "m\n";

            auto data = sensor.acquireData();
            processPointCloud(data);

            sensor.stop();
        }
    }

private:
    void processPointCloud(const typename SensorInterface<SensorType>::PointCloud& pc) {
        std::cout << "Processing " << pc.points.size() << " points\n";
    }
};

int main() {
    PerceptionPipeline<LidarSensor> lidarPipeline;
    lidarPipeline.run();

    std::cout << "\n";

    PerceptionPipeline<RadarSensor> radarPipeline;
    radarPipeline.run();

    return 0;
}

// Output:
// LiDAR initialized
// Sensor range: 100m
// Processing 0 points
// LiDAR shut down
//
// Radar initialized
// Sensor range: 200m
// Processing 0 points
// Radar shut down
```

**Benefits**:
1. **Compile-Time Safety**: Missing/incorrect methods cause clear compile errors
2. **Zero Runtime Cost**: All checks at compile-time
3. **Standardized Interface**: All sensors have identical API
4. **Documentation**: Interface requirements explicit in code
5. **Refactoring Safety**: Changing interface breaks all non-compliant implementations at compile-time

**Key Takeaway**: CRTP with compile-time interface enforcement using `static_assert` and type traits provides the safety of interfaces with the performance of templates, ideal for safety-critical autonomous systems where runtime errors are unacceptable.

---

## PRACTICE_TASKS

### Q1
Identify the issue with this CRTP implementation:
```cpp
template <typename T>
class Base {
public:
    void process() {
        static_cast<T*>(this)->process();
    }
};

class Derived : public Base<Derived> {
public:
    void process() {
        std::cout << "Processing\n";
    }
};
```

### Q2
Fix the two-phase lookup error:
```cpp
template <typename T>
class Base {
public:
    void helper() { std::cout << "Helper\n"; }
};

template <typename T>
class Derived : public Base<T> {
public:
    void method() {
        helper();  // Error!
    }
};
```

### Q3
Complete this Shape hierarchy using CRTP:
```cpp
template <typename T>
class Shape {
public:
    double area() const {
        // Your code here
    }
};

class Circle : public Shape<Circle> {
    double radius;
public:
    Circle(double r) : radius(r) {}
    // Your code here
};
```

### Q4
What's wrong with this multiple CRTP inheritance?
```cpp
template <typename T>
class Logger {
public:
    void log() { /* ... */ }
};

template <typename T>
class Debugger {
public:
    void log() { /* ... */ }
};

class MyClass : public Logger<MyClass>, public Debugger<MyClass> {
public:
    void execute() {
        log();  // What happens?
    }
};
```

### Q5
Implement a caching policy using CRTP:
```cpp
template <typename T>
class Cacheable {
    // Your implementation
};

class ExpensiveCalculation : public Cacheable<ExpensiveCalculation> {
    double value;
public:
    double compute() const {
        // Your code to integrate caching
    }
};
```

### Q6
Add compile-time interface enforcement:
```cpp
template <typename T>
class Printable {
public:
    // Add static_assert to check T has printImpl()
    void print() const {
        static_cast<const T*>(this)->printImpl();
    }
};
```

### Q7
Why won't this compile and how do you fix it?
```cpp
template <typename T>
class Base {
    char buffer[sizeof(T)];  // Error!
};

class Derived : public Base<Derived> {
    int data[100];
};
```

### Q8
Create a policy composition with logging and metrics:
```cpp
// Implement Logger<T> and Metricsable<T>
// then compose them in SmartClass
```

### Q9
Detect and fix the CRTP template parameter error:
```cpp
class MyClass : public Base<SomeOtherClass> {  // Wrong!
    // How to detect this at compile-time?
};
```

### Q10
Implement a CRTP-based iterator:
```cpp
template <typename Derived, typename Value>
class IteratorBase {
    // Implement operator++, *, ->, ==, !=
};

class MyIterator : public IteratorBase<MyIterator, int> {
    // Your implementation
};
```

### Q11
Why is CRTP unsuitable here? What should you use instead?
```cpp
template <typename T>
class Animal {
public:
    void makeSound() {
        static_cast<T*>(this)->makeSoundImpl();
    }
};

// Want to store different animals in a vector
std::vector<???> animals;  // Problem!
```

### Q12
Add Empty Base Optimization awareness:
```cpp
// Measure sizeof() with and without EBO
class WithPolicies
    : public Logger<WithPolicies>,
      public Cacheable<WithPolicies> {
    int data;
};
```

### Q13
Implement sensor fusion using CRTP:
```cpp
template <typename T>
class SensorFusion {
    // Base functionality
};

class LidarFusion : public SensorFusion<LidarFusion> {
    // Sensor-specific implementation
};
```

### Q14
Fix the infinite recursion:
```cpp
template <typename T>
class Base {
public:
    void interface() {
        // This causes infinite recursion - fix it
        static_cast<T*>(this)->interface();
    }
};
```

### Q15
Use `std::enable_shared_from_this` pattern:
```cpp
class MyClass : public std::enable_shared_from_this<MyClass> {
public:
    std::shared_ptr<MyClass> getPtr() {
        // Implement using shared_from_this()
    }
};
```

### Q16
Partially specialize CRTP for arithmetic types:
```cpp
template <typename T, typename Enable = void>
class Serializer {
    // Generic implementation
};

// Add specialization for arithmetic types
```

### Q17
Create a mixin that tracks constructor/destructor calls:
```cpp
template <typename T>
class LifetimTracker {
    // Track construction/destruction
};

class MyClass : public LifetimeTracker<MyClass> {
    // Your code
};
```

### Q18
Implement a CRTP base that prevents copying:
```cpp
template <typename T>
class NonCopyable {
    // Prevent copy, allow move
};

class Resource : public NonCopyable<Resource> {
    // Should not be copyable
};
```

### Q19
Debug this CRTP error message:
```cpp
template <typename T>
class Base {
public:
    void method() {
        static_cast<T*>(this)->required();
    }
};

class Derived : public Base<Derived> {
    // Missing required() - what error message appears?
    // How to improve it?
};
```

### Q20
Design a real-time control loop using CRTP:
```cpp
template <typename T>
class Controller {
    // Base control logic with CRTP hooks
};

class PIDController : public Controller<PIDController> {
    // Specific PID implementation
};
```

---

## QUICK_REFERENCE

### Answer Key

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

### CRTP Design Patterns Quick Reference

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

### Performance Comparison Table

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

### When to Use CRTP

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

### Common Pitfalls Checklist

- [ ] **Name hiding**: Use `this->` for template-dependent names
- [ ] **Infinite recursion**: Base and derived methods must have different names
- [ ] **Template parameter**: Verify `class Derived : public Base<Derived>` (not wrong type)
- [ ] **Incomplete types**: Avoid `sizeof(T)` in base constructor
- [ ] **Multiple inheritance**: Watch for name conflicts between policies
- [ ] **Interface checking**: Add `static_assert` for required methods
- [ ] **Error messages**: Use `static_assert` for clear compile errors
- [ ] **Runtime polymorphism**: Don't expect CRTP to work like virtual functions

---

### Autonomous Vehicle Use Cases

| Component | CRTP Application | Benefits |
|-----------|------------------|----------|
| **Sensor Fusion** | Different fusion algorithms per sensor type | Zero-overhead sensor processing |
| **Control Systems** | PID, MPC, LQR controllers with common interface | Real-time performance |
| **Perception Pipeline** | Object detection policies (vision, lidar, radar) | Compile-time algorithm selection |
| **Path Planning** | Different planner types (A*, RRT, hybrid) | Inlined planning algorithms |
| **State Estimation** | Kalman filter variants (EKF, UKF, Particle) | Zero-cost abstraction |
| **Data Logging** | Logging policy for all components | Uniform logging without overhead |

---

### Compile-Time Interface Enforcement

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

### Testing Strategies

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
