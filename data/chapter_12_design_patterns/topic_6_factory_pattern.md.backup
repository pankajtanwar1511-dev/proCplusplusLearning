## TOPIC: Factory Pattern (Factory Method and Abstract Factory)

### THEORY_SECTION: Core Concepts and Design Principles

#### 1. Factory Pattern Overview

**Definition:** Creational design pattern that provides an interface for creating objects without specifying exact classes, delegating instantiation to subclasses or factory methods.

**Two Main Variants:**

| Pattern | Intent | Use Case |
|---------|--------|----------|
| **Factory Method** | Define interface for creating object; subclasses decide which class to instantiate | Single product hierarchy, extension through inheritance |
| **Abstract Factory** | Create families of related objects without specifying concrete classes | Multiple related product hierarchies, consistent product families |

**Core Guarantee:**

| Requirement | Implementation | Purpose |
|-------------|----------------|---------|
| **Decoupling** | Client code uses interfaces, not concrete classes | Reduce dependencies on specific implementations |
| **Extensibility** | Add new product types without modifying existing code | Open/Closed Principle |
| **Consistency** | Factory ensures related objects work together | Prevent incompatible product combinations |
| **Centralized creation** | All instantiation logic in one place | Easier testing, debugging, maintenance |

**When to Use Factory Pattern:**

**Common Use Cases:**
```cpp
class SensorFactory {           // ✅ Multiple sensor types (LIDAR, RADAR, Camera)
class VehicleFactory {           // ✅ Different vehicle configurations (Sedan, Truck, Bus)
class MessageParser {            // ✅ Various message formats (JSON, XML, Binary)
class UIComponentFactory {       // ✅ Platform-specific UI (Windows, Mac, Linux)
class DatabaseConnection {       // ✅ Multiple database backends (MySQL, PostgreSQL, MongoDB)
```

**Inappropriate Uses:**
```cpp
class StringFactory {            // ❌ String is simple, no variants needed
class IntFactory {               // ❌ Primitive types don't need factories
class SingletonFactory {         // ❌ Singleton already manages its instantiation
```

#### 2. Factory Method vs Abstract Factory

**Factory Method Pattern:**

```cpp
// Product interface
class Sensor {
public:
    virtual ~Sensor() = default;
    virtual double readValue() = 0;
    virtual std::string getType() const = 0;
};

// Concrete products
class LidarSensor : public Sensor {
public:
    double readValue() override { return 15.7; }
    std::string getType() const override { return "LIDAR"; }
};

class RadarSensor : public Sensor {
public:
    double readValue() override { return 8.3; }
    std::string getType() const override { return "RADAR"; }
};

// Creator with factory method
class SensorSystem {
public:
    virtual ~SensorSystem() = default;

    // Factory method - subclasses override to create specific sensors
    virtual std::unique_ptr<Sensor> createSensor() = 0;

    void processData() {
        auto sensor = createSensor();  // Use factory method
        double value = sensor->readValue();
        std::cout << sensor->getType() << ": " << value << "\n";
    }
};

// Concrete creators
class LidarSystem : public SensorSystem {
public:
    std::unique_ptr<Sensor> createSensor() override {
        return std::make_unique<LidarSensor>();
    }
};

class RadarSystem : public SensorSystem {
public:
    std::unique_ptr<Sensor> createSensor() override {
        return std::make_unique<RadarSensor>();
    }
};
```

**Abstract Factory Pattern:**

```cpp
// Product families: Sensor + Display + Logger

class Sensor {
public:
    virtual ~Sensor() = default;
    virtual double readValue() = 0;
};

class Display {
public:
    virtual ~Display() = default;
    virtual void show(double value) = 0;
};

class Logger {
public:
    virtual ~Logger() = default;
    virtual void log(const std::string& msg) = 0;
};

// Abstract factory interface
class SystemFactory {
public:
    virtual ~SystemFactory() = default;
    virtual std::unique_ptr<Sensor> createSensor() = 0;
    virtual std::unique_ptr<Display> createDisplay() = 0;
    virtual std::unique_ptr<Logger> createLogger() = 0;
};

// Concrete factory for Production environment
class ProductionFactory : public SystemFactory {
public:
    std::unique_ptr<Sensor> createSensor() override {
        return std::make_unique<HardwareSensor>();  // Real hardware
    }
    std::unique_ptr<Display> createDisplay() override {
        return std::make_unique<LCDDisplay>();      // Physical display
    }
    std::unique_ptr<Logger> createLogger() override {
        return std::make_unique<FileLogger>();      // Log to file
    }
};

// Concrete factory for Testing environment
class TestFactory : public SystemFactory {
public:
    std::unique_ptr<Sensor> createSensor() override {
        return std::make_unique<MockSensor>();      // Simulated sensor
    }
    std::unique_ptr<Display> createDisplay() override {
        return std::make_unique<ConsoleDisplay>();  // Debug output
    }
    std::unique_ptr<Logger> createLogger() override {
        return std::make_unique<MemoryLogger>();    // In-memory logging
    }
};
```

**Key Differences:**

| Aspect | Factory Method | Abstract Factory |
|--------|---------------|------------------|
| **Focus** | Single product | Family of related products |
| **Inheritance** | Subclass decides what to create | Interface for creating multiple related objects |
| **Complexity** | Simpler, one factory method | More complex, multiple factory methods |
| **Use when** | Need to vary one product type | Need consistent families of products |
| **Example** | Document factory (PDF vs Word) | UI toolkit (Windows vs Mac buttons + windows + menus) |

#### 3. C++ Implementation Patterns

**A. Simple Function Factory (No Classes):**

```cpp
enum class SensorType { LIDAR, RADAR, CAMERA };

std::unique_ptr<Sensor> createSensor(SensorType type) {
    switch (type) {
        case SensorType::LIDAR:
            return std::make_unique<LidarSensor>();
        case SensorType::RADAR:
            return std::make_unique<RadarSensor>();
        case SensorType::CAMERA:
            return std::make_unique<CameraSensor>();
        default:
            throw std::invalid_argument("Unknown sensor type");
    }
}
```

**B. Static Factory Method:**

```cpp
class Sensor {
public:
    enum class Type { LIDAR, RADAR, CAMERA };

    // Static factory method
    static std::unique_ptr<Sensor> create(Type type) {
        switch (type) {
            case Type::LIDAR:
                return std::make_unique<LidarSensor>();
            case Type::RADAR:
                return std::make_unique<RadarSensor>();
            case Type::CAMERA:
                return std::make_unique<CameraSensor>();
        }
    }

    virtual ~Sensor() = default;
    virtual double readValue() = 0;
};
```

**C. Registry-Based Factory (Runtime Registration):**

```cpp
class SensorFactory {
    using Creator = std::function<std::unique_ptr<Sensor>()>;
    std::map<std::string, Creator> registry;

public:
    void registerSensor(const std::string& name, Creator creator) {
        registry[name] = creator;
    }

    std::unique_ptr<Sensor> create(const std::string& name) {
        auto it = registry.find(name);
        if (it == registry.end()) {
            throw std::runtime_error("Unknown sensor: " + name);
        }
        return it->second();  // Call creator function
    }
};

// Registration
SensorFactory factory;
factory.registerSensor("lidar", []() { return std::make_unique<LidarSensor>(); });
factory.registerSensor("radar", []() { return std::make_unique<RadarSensor>(); });

// Usage
auto sensor = factory.create("lidar");
```

**D. Template-Based Factory:**

```cpp
template<typename ProductType>
class Factory {
public:
    template<typename ConcreteType, typename... Args>
    static std::unique_ptr<ProductType> create(Args&&... args) {
        return std::make_unique<ConcreteType>(std::forward<Args>(args)...);
    }
};

// Usage
auto lidar = Factory<Sensor>::create<LidarSensor>(/* params */);
auto radar = Factory<Sensor>::create<RadarSensor>(/* params */);
```

#### 4. Autonomous Vehicle Example

**Real-World Factory Use Case:**

```cpp
// Product hierarchy
class PerceptionAlgorithm {
public:
    virtual ~PerceptionAlgorithm() = default;
    virtual void processFrame(const Image& img) = 0;
    virtual std::vector<Detection> getDetections() const = 0;
};

class YOLODetector : public PerceptionAlgorithm { /* YOLO v8 */ };
class RCNNDetector : public PerceptionAlgorithm { /* Faster R-CNN */ };
class TransformerDetector : public PerceptionAlgorithm { /* Vision Transformer */ };

// Factory for different vehicle configurations
class PerceptionFactory {
public:
    enum class VehicleType { URBAN_TAXI, HIGHWAY_TRUCK, ROBOTAXI };

    static std::unique_ptr<PerceptionAlgorithm> createDetector(VehicleType type) {
        switch (type) {
            case VehicleType::URBAN_TAXI:
                // Fast inference for city driving (pedestrians, cyclists)
                return std::make_unique<YOLODetector>(/* optimized for speed */);

            case VehicleType::HIGHWAY_TRUCK:
                // Long-range detection for highways (vehicles, lane markers)
                return std::make_unique<RCNNDetector>(/* optimized for range */);

            case VehicleType::ROBOTAXI:
                // Highest accuracy for full autonomy
                return std::make_unique<TransformerDetector>(/* state-of-the-art */);
        }
    }
};

// Usage in vehicle initialization
auto detector = PerceptionFactory::createDetector(
    PerceptionFactory::VehicleType::ROBOTAXI
);
```

#### 5. Factory Pattern Benefits and Trade-offs

**Benefits:**

| Benefit | Explanation | Example |
|---------|-------------|---------|
| **Open/Closed Principle** | Add new types without modifying existing code | Add new sensor type by creating new class + factory entry |
| **Single Responsibility** | Creation logic separated from business logic | Sensor processing doesn't know about construction details |
| **Dependency Inversion** | Depend on abstractions, not concretions | Client code uses `Sensor*`, not `LidarSensor*` |
| **Testability** | Easy to inject mock implementations | Test factory returns `MockSensor` instead of `HardwareSensor` |
| **Consistency** | Factory ensures compatible object families | Production factory returns all hardware objects; test factory returns all mocks |

**Trade-offs:**

| Drawback | Explanation | Mitigation |
|----------|-------------|------------|
| **Complexity** | More classes and indirection | Use simple function factory for basic cases |
| **Compile-time overhead** | Virtual calls, pointer indirection | Consider templates for compile-time polymorphism |
| **Memory overhead** | Heap allocation via smart pointers | Use object pools for frequent allocations |
| **Registration boilerplate** | Manual registration in registry factories | Use macros or code generation |

#### 6. Why Factory Pattern Matters

**Critical Concepts Demonstrated:**

| Concept | How Factory Tests It | Interview Relevance |
|---------|---------------------|---------------------|
| **Polymorphism** | Client uses base pointer, factory returns derived | Core OOP understanding |
| **Smart pointers** | Ownership transfer via unique_ptr/shared_ptr | Modern C++ resource management |
| **RAII** | Factory returns RAII-wrapped resources | Exception safety, cleanup |
| **Design patterns** | Classic GoF pattern implementation | Software architecture knowledge |
| **Decoupling** | Client doesn't know concrete types | Maintainability, extensibility |

**Common Interview Questions:**
- "When would you use Factory Method vs Abstract Factory?" (Single product vs product family)
- "How do you add new product types without breaking existing code?" (Open/Closed Principle)
- "What's the difference between Factory and Builder pattern?" (Object creation vs object construction)
- "How do you implement type-safe factories in C++?" (Templates, enums, std::variant)

---

### EDGE_CASES: Tricky Scenarios and Implementation Pitfalls

#### Edge Case 1: Exception Safety in Factory Methods

```cpp
// ❌ DANGEROUS: Exception during construction leaks resources
class SensorFactory {
public:
    static Sensor* createSensor(Type type) {  // ❌ Returns raw pointer
        Sensor* sensor = nullptr;
        switch (type) {
            case Type::LIDAR:
                sensor = new LidarSensor();  // May throw
                break;
            case Type::RADAR:
                sensor = new RadarSensor();
                break;
        }

        // If this throws, sensor leaks!
        sensor->initialize();  // ❌ May throw exception
        return sensor;
    }
};

// ✅ CORRECT: Use smart pointers for exception safety
class SensorFactory {
public:
    static std::unique_ptr<Sensor> createSensor(Type type) {
        auto sensor = [type]() -> std::unique_ptr<Sensor> {
            switch (type) {
                case Type::LIDAR:
                    return std::make_unique<LidarSensor>();
                case Type::RADAR:
                    return std::make_unique<RadarSensor>();
                default:
                    throw std::invalid_argument("Unknown type");
            }
        }();

        // Exception here doesn't leak - unique_ptr handles cleanup
        sensor->initialize();
        return sensor;  // ✅ Move semantics, no copy
    }
};
```

**Why This Matters:** Raw pointers in factories are dangerous. If initialization throws after allocation, memory leaks occur. Always return smart pointers from factories to ensure RAII cleanup.

#### Edge Case 2: Object Slicing in Factory Returns

```cpp
// ❌ BROKEN: Returning by value causes slicing
class SensorFactory {
public:
    static Sensor createSensor(Type type) {  // ❌ Returns by value!
        if (type == Type::LIDAR) {
            return LidarSensor();  // ❌ Sliced to Sensor base class
        }
        return RadarSensor();
    }
};

void useFactory() {
    Sensor sensor = SensorFactory::createSensor(Type::LIDAR);
    sensor.readValue();  // ❌ Calls Sensor::readValue(), not LidarSensor::readValue()
    // Derived class data lost due to slicing!
}

// ✅ CORRECT: Return pointer or reference
class SensorFactory {
public:
    static std::unique_ptr<Sensor> createSensor(Type type) {  // ✅ Pointer
        if (type == Type::LIDAR) {
            return std::make_unique<LidarSensor>();  // ✅ No slicing
        }
        return std::make_unique<RadarSensor>();
    }
};
```

**Why This Matters:** Returning polymorphic objects by value destroys the polymorphism through slicing. The derived class data is lost, and virtual functions don't work correctly. Always return pointers (preferably smart pointers) or references for polymorphic objects.

#### Edge Case 3: Static Initialization Order with Registry Factories

```cpp
// ❌ DANGEROUS: Registration happens during static initialization
class SensorFactory {
    static std::map<std::string, Creator>& getRegistry() {
        static std::map<std::string, Creator> registry;  // ✅ Function-local static
        return registry;
    }

public:
    static void registerSensor(const std::string& name, Creator creator) {
        getRegistry()[name] = creator;
    }
};

// ❌ PROBLEM: Order of static initialization across files is undefined
namespace {
    struct LidarRegistrar {
        LidarRegistrar() {
            // What if SensorFactory's static map not initialized yet?
            SensorFactory::registerSensor("lidar", []() {
                return std::make_unique<LidarSensor>();
            });
        }
    } lidarReg;  // Global static object
}
```

**Solution:** Use function-local static (Meyers Singleton) for the registry to avoid static initialization order fiasco. The registry is guaranteed to be initialized on first access.

#### Edge Case 4: Type Erasure and Factory Return Types

```cpp
// Challenge: Factory needs to return different types
class ComponentFactory {
public:
    // ❌ Can't have multiple return types in C++
    // auto create(Type type);  // What does this return?
};

// ✅ SOLUTION 1: Common base class (traditional polymorphism)
class Component { virtual ~Component() = default; };
class Sensor : public Component {};
class Actuator : public Component {};

std::unique_ptr<Component> create(Type type);

// ✅ SOLUTION 2: std::variant (type-safe union)
using ComponentVariant = std::variant<Sensor, Actuator, Display>;

ComponentVariant create(Type type) {
    switch (type) {
        case Type::SENSOR: return Sensor{};
        case Type::ACTUATOR: return Actuator{};
        case Type::DISPLAY: return Display{};
    }
}

// Usage with std::visit
std::visit([](auto&& component) {
    component.process();  // Works for all types with process()
}, factory.create(type));

// ✅ SOLUTION 3: std::any (runtime type erasure)
std::any create(Type type);  // Can return any type

auto sensor = std::any_cast<Sensor>(factory.create(Type::SENSOR));
```

**Why This Matters:** C++ is statically typed, so factories returning different unrelated types require careful design. Choose based on needs: inheritance for polymorphism, std::variant for type-safe known types, std::any for complete type erasure.

#### Edge Case 5: Circular Dependencies in Factory Registration

```cpp
// ❌ PROBLEM: Factory A needs Factory B, Factory B needs Factory A
class SensorFactory {
public:
    static std::unique_ptr<Sensor> create(Type type) {
        // Needs ProcessorFactory to create associated processor
        auto processor = ProcessorFactory::create(type);  // ❌ Circular dependency
        return std::make_unique<Sensor>(std::move(processor));
    }
};

class ProcessorFactory {
public:
    static std::unique_ptr<Processor> create(Type type) {
        // Needs SensorFactory to create associated sensor
        auto sensor = SensorFactory::create(type);  // ❌ Circular dependency
        return std::make_unique<Processor>(std::move(sensor));
    }
};

// ✅ SOLUTION 1: Abstract Factory (create related objects together)
class SystemFactory {
public:
    struct Components {
        std::unique_ptr<Sensor> sensor;
        std::unique_ptr<Processor> processor;
    };

    static Components createSystem(Type type) {
        Components comp;
        comp.sensor = std::make_unique<Sensor>(type);
        comp.processor = std::make_unique<Processor>(type);
        // Wire them together
        comp.sensor->setProcessor(comp.processor.get());
        comp.processor->setSensor(comp.sensor.get());
        return comp;
    }
};

// ✅ SOLUTION 2: Two-phase initialization
auto sensor = SensorFactory::create(type);
auto processor = ProcessorFactory::create(type);
sensor->setProcessor(processor.get());  // Wire after creation
processor->setSensor(sensor.get());
```

**Why This Matters:** Circular dependencies between factories indicate design problems. Use Abstract Factory to create related objects together, or use two-phase initialization (create-then-wire) to break the cycle.

#### Edge Case 6: Thread Safety in Lazy Factory Initialization

```cpp
// ❌ NOT THREAD-SAFE: Lazy initialization without synchronization
class SensorFactory {
    static std::map<std::string, std::unique_ptr<Sensor>> cache;

public:
    static Sensor* getSensor(const std::string& type) {
        // ❌ Race condition: multiple threads may create multiple instances
        if (cache.find(type) == cache.end()) {
            cache[type] = createSensor(type);  // Not atomic!
        }
        return cache[type].get();
    }
};

// ✅ CORRECT: Use mutex or std::call_once
class SensorFactory {
    static std::map<std::string, std::unique_ptr<Sensor>> cache;
    static std::mutex mtx;

public:
    static Sensor* getSensor(const std::string& type) {
        std::lock_guard<std::mutex> lock(mtx);

        auto it = cache.find(type);
        if (it == cache.end()) {
            cache[type] = createSensor(type);
            return cache[type].get();
        }
        return it->second.get();
    }
};
```

**Why This Matters:** Factories with caching or lazy initialization need thread safety. Without synchronization, multiple threads can create duplicate objects or corrupt internal state. Use mutex, std::call_once, or lock-free data structures for thread-safe factories.

---

### CODE_EXAMPLES: Progressive Implementation from Easy to Advanced

#### Example 1: Easy - Simple Function Factory

```cpp
#include <iostream>
#include <memory>
#include <string>

// Product interface
class Sensor {
public:
    virtual ~Sensor() = default;
    virtual double readValue() = 0;
    virtual std::string getType() const = 0;
};

// Concrete products
class LidarSensor : public Sensor {
public:
    double readValue() override {
        return 15.7;  // Simulated distance in meters
    }
    std::string getType() const override {
        return "LIDAR";
    }
};

class RadarSensor : public Sensor {
public:
    double readValue() override {
        return 8.3;  // Simulated distance in meters
    }
    std::string getType() const override {
        return "RADAR";
    }
};

class CameraSensor : public Sensor {
public:
    double readValue() override {
        return 120.5;  // Simulated brightness value
    }
    std::string getType() const override {
        return "CAMERA";
    }
};

// Simple function factory
enum class SensorType { LIDAR, RADAR, CAMERA };

std::unique_ptr<Sensor> createSensor(SensorType type) {
    switch (type) {
        case SensorType::LIDAR:
            return std::make_unique<LidarSensor>();
        case SensorType::RADAR:
            return std::make_unique<RadarSensor>();
        case SensorType::CAMERA:
            return std::make_unique<CameraSensor>();
        default:
            throw std::invalid_argument("Unknown sensor type");
    }
}

int main() {
    std::cout << "Simple Function Factory Example\n\n";

    // Create different sensors using factory
    auto lidar = createSensor(SensorType::LIDAR);
    auto radar = createSensor(SensorType::RADAR);
    auto camera = createSensor(SensorType::CAMERA);

    // Use sensors polymorphically
    std::cout << lidar->getType() << " reading: " << lidar->readValue() << "\n";
    std::cout << radar->getType() << " reading: " << radar->readValue() << "\n";
    std::cout << camera->getType() << " reading: " << camera->readValue() << "\n";

    return 0;
}
```

This simple factory uses a free function with an enum to select the sensor type. The factory returns `unique_ptr<Sensor>` for automatic memory management. Clients don't need to know about concrete sensor classes.

#### Example 2: Mid - Factory Method Pattern

```cpp
#include <iostream>
#include <memory>
#include <vector>

// Product interface
class Sensor {
public:
    virtual ~Sensor() = default;
    virtual void calibrate() = 0;
    virtual double readValue() = 0;
    virtual std::string getName() const = 0;
};

// Concrete products
class LidarSensor : public Sensor {
    double baseline = 0.0;

public:
    void calibrate() override {
        baseline = 0.5;  // Calibration offset
        std::cout << "  LIDAR calibrated (baseline: " << baseline << ")\n";
    }

    double readValue() override {
        return 15.7 - baseline;
    }

    std::string getName() const override {
        return "LIDAR-HD";
    }
};

class RadarSensor : public Sensor {
    double baseline = 0.0;

public:
    void calibrate() override {
        baseline = 0.3;
        std::cout << "  RADAR calibrated (baseline: " << baseline << ")\n";
    }

    double readValue() override {
        return 8.3 - baseline;
    }

    std::string getName() const override {
        return "RADAR-77GHz";
    }
};

// Creator class with factory method
class SensorSystem {
public:
    virtual ~SensorSystem() = default;

    // Factory method - subclasses override to create specific sensors
    virtual std::unique_ptr<Sensor> createSensor() = 0;

    // Template method using factory method
    void initializeAndRun() {
        std::cout << "\nInitializing sensor system...\n";

        auto sensor = createSensor();  // Factory method
        std::cout << "Created sensor: " << sensor->getName() << "\n";

        sensor->calibrate();

        std::cout << "Reading value: " << sensor->readValue() << "\n";
    }
};

// Concrete creators
class LidarSystem : public SensorSystem {
public:
    std::unique_ptr<Sensor> createSensor() override {
        return std::make_unique<LidarSensor>();
    }
};

class RadarSystem : public SensorSystem {
public:
    std::unique_ptr<Sensor> createSensor() override {
        return std::make_unique<RadarSensor>();
    }
};

int main() {
    std::cout << "Factory Method Pattern Example\n";

    // Create different sensor systems
    std::vector<std::unique_ptr<SensorSystem>> systems;
    systems.push_back(std::make_unique<LidarSystem>());
    systems.push_back(std::make_unique<RadarSystem>());

    // Run each system - factory method creates appropriate sensor
    for (auto& system : systems) {
        system->initializeAndRun();
    }

    return 0;
}
```

Factory Method pattern delegates object creation to subclasses. The base class `SensorSystem` defines the factory method interface, and concrete systems (`LidarSystem`, `RadarSystem`) implement it to create specific sensors.

#### Example 3: Mid - Static Factory Method with Parameters

```cpp
#include <iostream>
#include <memory>
#include <string>

// Product with multiple construction options
class Sensor {
protected:
    std::string name;
    int sampleRate;

public:
    Sensor(const std::string& n, int rate) : name(n), sampleRate(rate) {}
    virtual ~Sensor() = default;

    virtual void displayInfo() const {
        std::cout << "  Sensor: " << name << ", Rate: " << sampleRate << "Hz\n";
    }

    // Static factory methods for different configurations
    static std::unique_ptr<Sensor> createHighPerformance() {
        return std::make_unique<Sensor>("HP-Sensor", 1000);
    }

    static std::unique_ptr<Sensor> createStandard() {
        return std::make_unique<Sensor>("STD-Sensor", 100);
    }

    static std::unique_ptr<Sensor> createLowPower() {
        return std::make_unique<Sensor>("LP-Sensor", 10);
    }

    static std::unique_ptr<Sensor> createCustom(const std::string& name, int rate) {
        if (rate <= 0 || rate > 10000) {
            throw std::invalid_argument("Invalid sample rate");
        }
        return std::make_unique<Sensor>(name, rate);
    }
};

int main() {
    std::cout << "Static Factory Method with Parameters\n\n";

    // Create sensors using descriptive factory methods
    auto hp = Sensor::createHighPerformance();
    auto std = Sensor::createStandard();
    auto lp = Sensor::createLowPower();
    auto custom = Sensor::createCustom("CustomSensor", 500);

    std::cout << "Created sensors:\n";
    hp->displayInfo();
    std->displayInfo();
    lp->displayInfo();
    custom->displayInfo();

    return 0;
}
```

Static factory methods provide named constructors with clear intent. Instead of overloaded constructors, factory methods have descriptive names that clarify what's being created.

#### Example 4: Advanced - Abstract Factory Pattern

```cpp
#include <iostream>
#include <memory>
#include <string>

// Product families: Sensor, Display, Logger

// Abstract products
class Sensor {
public:
    virtual ~Sensor() = default;
    virtual double readValue() = 0;
    virtual std::string getType() const = 0;
};

class Display {
public:
    virtual ~Display() = default;
    virtual void show(const std::string& msg) = 0;
};

class Logger {
public:
    virtual ~Logger() = default;
    virtual void log(const std::string& msg) = 0;
};

// Concrete products for Production family
class HardwareSensor : public Sensor {
public:
    double readValue() override { return 42.5; }  // Real hardware read
    std::string getType() const override { return "HardwareSensor"; }
};

class LCDDisplay : public Display {
public:
    void show(const std::string& msg) override {
        std::cout << "[LCD] " << msg << "\n";
    }
};

class FileLogger : public Logger {
public:
    void log(const std::string& msg) override {
        std::cout << "[FileLog] " << msg << "\n";  // Simulated file write
    }
};

// Concrete products for Testing family
class MockSensor : public Sensor {
    double mockValue = 10.0;

public:
    double readValue() override { return mockValue; }  // Predictable test value
    std::string getType() const override { return "MockSensor"; }
};

class ConsoleDisplay : public Display {
public:
    void show(const std::string& msg) override {
        std::cout << "[Console] " << msg << "\n";
    }
};

class MemoryLogger : public Logger {
    std::vector<std::string> logs;

public:
    void log(const std::string& msg) override {
        logs.push_back(msg);
        std::cout << "[MemLog] " << msg << " (stored in memory)\n";
    }
};

// Abstract factory interface
class SystemFactory {
public:
    virtual ~SystemFactory() = default;
    virtual std::unique_ptr<Sensor> createSensor() = 0;
    virtual std::unique_ptr<Display> createDisplay() = 0;
    virtual std::unique_ptr<Logger> createLogger() = 0;
};

// Concrete factory for Production
class ProductionFactory : public SystemFactory {
public:
    std::unique_ptr<Sensor> createSensor() override {
        return std::make_unique<HardwareSensor>();
    }

    std::unique_ptr<Display> createDisplay() override {
        return std::make_unique<LCDDisplay>();
    }

    std::unique_ptr<Logger> createLogger() override {
        return std::make_unique<FileLogger>();
    }
};

// Concrete factory for Testing
class TestFactory : public SystemFactory {
public:
    std::unique_ptr<Sensor> createSensor() override {
        return std::make_unique<MockSensor>();
    }

    std::unique_ptr<Display> createDisplay() override {
        return std::make_unique<ConsoleDisplay>();
    }

    std::unique_ptr<Logger> createLogger() override {
        return std::make_unique<MemoryLogger>();
    }
};

// Client code - uses abstract factory
class Application {
    std::unique_ptr<Sensor> sensor;
    std::unique_ptr<Display> display;
    std::unique_ptr<Logger> logger;

public:
    Application(SystemFactory& factory) {
        sensor = factory.createSensor();
        display = factory.createDisplay();
        logger = factory.createLogger();
    }

    void run() {
        logger->log("Application started");

        double value = sensor->readValue();
        std::string msg = "Sensor reading: " + std::to_string(value);

        display->show(msg);
        logger->log(msg);
    }
};

int main() {
    std::cout << "Abstract Factory Pattern Example\n\n";

    std::cout << "=== PRODUCTION MODE ===\n";
    ProductionFactory prodFactory;
    Application prodApp(prodFactory);
    prodApp.run();

    std::cout << "\n=== TEST MODE ===\n";
    TestFactory testFactory;
    Application testApp(testFactory);
    testApp.run();

    return 0;
}
```

Abstract Factory creates families of related objects. The `ProductionFactory` creates hardware components for deployment, while `TestFactory` creates mock components for testing. The client code (`Application`) works with both seamlessly.

#### Example 5: Advanced - Registry-Based Factory with Lambda Creators

```cpp
#include <iostream>
#include <memory>
#include <map>
#include <functional>
#include <string>

// Product interface
class Sensor {
public:
    virtual ~Sensor() = default;
    virtual std::string getType() const = 0;
    virtual double readValue() = 0;
};

// Concrete products
class LidarSensor : public Sensor {
public:
    std::string getType() const override { return "LIDAR"; }
    double readValue() override { return 15.7; }
};

class RadarSensor : public Sensor {
public:
    std::string getType() const override { return "RADAR"; }
    double readValue() override { return 8.3; }
};

class CameraSensor : public Sensor {
public:
    std::string getType() const override { return "CAMERA"; }
    double readValue() override { return 120.5; }
};

// Registry-based factory
class SensorFactory {
    using Creator = std::function<std::unique_ptr<Sensor>()>;

    // Use function-local static to avoid initialization order fiasco
    static std::map<std::string, Creator>& getRegistry() {
        static std::map<std::string, Creator> registry;
        return registry;
    }

public:
    // Register a creator function
    static void registerSensor(const std::string& type, Creator creator) {
        getRegistry()[type] = creator;
    }

    // Create sensor by type name
    static std::unique_ptr<Sensor> create(const std::string& type) {
        auto& registry = getRegistry();
        auto it = registry.find(type);

        if (it == registry.end()) {
            throw std::runtime_error("Unknown sensor type: " + type);
        }

        return it->second();  // Call creator function
    }

    // List available sensor types
    static std::vector<std::string> getAvailableTypes() {
        std::vector<std::string> types;
        for (const auto& pair : getRegistry()) {
            types.push_back(pair.first);
        }
        return types;
    }
};

// Self-registering helper
template<typename T>
struct SensorRegistrar {
    SensorRegistrar(const std::string& type) {
        SensorFactory::registerSensor(type, []() {
            return std::make_unique<T>();
        });
    }
};

int main() {
    std::cout << "Registry-Based Factory Example\n\n";

    // Register sensors using lambdas
    SensorFactory::registerSensor("lidar", []() {
        return std::make_unique<LidarSensor>();
    });

    SensorFactory::registerSensor("radar", []() {
        return std::make_unique<RadarSensor>();
    });

    SensorFactory::registerSensor("camera", []() {
        return std::make_unique<CameraSensor>();
    });

    // List available types
    std::cout << "Available sensor types:\n";
    for (const auto& type : SensorFactory::getAvailableTypes()) {
        std::cout << "  - " << type << "\n";
    }
    std::cout << "\n";

    // Create sensors by string name (useful for config files)
    std::vector<std::string> sensorTypes = {"lidar", "radar", "camera"};

    for (const auto& type : sensorTypes) {
        auto sensor = SensorFactory::create(type);
        std::cout << sensor->getType() << " reading: "
                  << sensor->readValue() << "\n";
    }

    return 0;
}
```

Registry-based factory allows runtime registration of creators. Useful when loading sensor types from configuration files or plugins. The factory uses `std::function` to store any callable that creates sensors.

#### Example 6: Real-World - Autonomous Vehicle Sensor Factory with Initialization

```cpp
#include <iostream>
#include <memory>
#include <vector>
#include <string>
#include <stdexcept>

// Configuration structure
struct SensorConfig {
    std::string name;
    int sampleRate;  // Hz
    double minRange;  // meters
    double maxRange;  // meters
};

// Product hierarchy
class Sensor {
protected:
    SensorConfig config;
    bool initialized = false;

public:
    Sensor(const SensorConfig& cfg) : config(cfg) {}
    virtual ~Sensor() = default;

    virtual void initialize() {
        std::cout << "  Initializing " << config.name << "...\n";
        // Hardware initialization would happen here
        initialized = true;
    }

    virtual double readValue() = 0;

    virtual void displayInfo() const {
        std::cout << "  " << config.name
                  << " [" << config.minRange << "m - " << config.maxRange << "m] "
                  << "@ " << config.sampleRate << "Hz\n";
    }

    bool isInitialized() const { return initialized; }
};

// Concrete sensors for autonomous vehicle
class LidarSensor : public Sensor {
public:
    LidarSensor(const SensorConfig& cfg) : Sensor(cfg) {}

    void initialize() override {
        Sensor::initialize();
        std::cout << "    Calibrating LIDAR laser diodes...\n";
        std::cout << "    Setting point cloud density...\n";
    }

    double readValue() override {
        if (!initialized) throw std::runtime_error("Sensor not initialized");
        return 15.7;  // Simulated distance reading
    }
};

class RadarSensor : public Sensor {
public:
    RadarSensor(const SensorConfig& cfg) : Sensor(cfg) {}

    void initialize() override {
        Sensor::initialize();
        std::cout << "    Tuning 77GHz radar frequency...\n";
        std::cout << "    Setting detection threshold...\n";
    }

    double readValue() override {
        if (!initialized) throw std::runtime_error("Sensor not initialized");
        return 8.3;
    }
};

class CameraSensor : public Sensor {
public:
    CameraSensor(const SensorConfig& cfg) : Sensor(cfg) {}

    void initialize() override {
        Sensor::initialize();
        std::cout << "    Setting camera exposure and gain...\n";
        std::cout << "    Loading lens calibration...\n";
    }

    double readValue() override {
        if (!initialized) throw std::runtime_error("Sensor not initialized");
        return 120.5;  // Simulated brightness
    }
};

// Factory for autonomous vehicle sensors
class VehicleSensorFactory {
public:
    enum class Type { LIDAR_FRONT, LIDAR_REAR, RADAR_FRONT, CAMERA_360 };

    static std::unique_ptr<Sensor> createSensor(Type type) {
        SensorConfig config;

        switch (type) {
            case Type::LIDAR_FRONT:
                config = {"LIDAR-Front-HD", 20, 0.5, 200.0};
                return std::make_unique<LidarSensor>(config);

            case Type::LIDAR_REAR:
                config = {"LIDAR-Rear", 20, 0.5, 50.0};
                return std::make_unique<LidarSensor>(config);

            case Type::RADAR_FRONT:
                config = {"RADAR-77GHz-Front", 100, 1.0, 300.0};
                return std::make_unique<RadarSensor>(config);

            case Type::CAMERA_360:
                config = {"Camera-360-4K", 30, 0.0, 100.0};
                return std::make_unique<CameraSensor>(config);

            default:
                throw std::invalid_argument("Unknown sensor type");
        }
    }

    // Factory method to create all sensors for a vehicle
    static std::vector<std::unique_ptr<Sensor>> createFullSensorSuite() {
        std::vector<std::unique_ptr<Sensor>> sensors;

        sensors.push_back(createSensor(Type::LIDAR_FRONT));
        sensors.push_back(createSensor(Type::LIDAR_REAR));
        sensors.push_back(createSensor(Type::RADAR_FRONT));
        sensors.push_back(createSensor(Type::CAMERA_360));

        return sensors;
    }
};

int main() {
    std::cout << "Autonomous Vehicle Sensor Factory\n";
    std::cout << "==================================\n\n";

    // Create full sensor suite for autonomous vehicle
    auto sensors = VehicleSensorFactory::createFullSensorSuite();

    std::cout << "Created " << sensors.size() << " sensors:\n";
    for (const auto& sensor : sensors) {
        sensor->displayInfo();
    }

    std::cout << "\nInitializing all sensors...\n";
    for (auto& sensor : sensors) {
        sensor->initialize();
    }

    std::cout << "\nReading sensor values...\n";
    for (const auto& sensor : sensors) {
        double value = sensor->readValue();
        std::cout << "  Reading: " << value << "\n";
    }

    return 0;
}
```

Real-world autonomous vehicle factory creates multiple sensor types with complex initialization. The factory handles configuration, ensures proper initialization order, and creates complete sensor suites.

#### Example 7: Advanced - Template-Based Factory with Perfect Forwarding

```cpp
#include <iostream>
#include <memory>
#include <string>
#include <utility>

// Product base
class Sensor {
protected:
    std::string id;

public:
    Sensor(const std::string& identifier) : id(identifier) {
        std::cout << "  Creating sensor: " << id << "\n";
    }

    virtual ~Sensor() = default;
    virtual std::string getType() const = 0;
};

// Concrete products with different constructors
class LidarSensor : public Sensor {
    int beamCount;

public:
    LidarSensor(const std::string& id, int beams)
        : Sensor(id), beamCount(beams) {
        std::cout << "    LIDAR with " << beamCount << " beams\n";
    }

    std::string getType() const override { return "LIDAR"; }
};

class RadarSensor : public Sensor {
    double frequency;
    bool longRange;

public:
    RadarSensor(const std::string& id, double freq, bool lr)
        : Sensor(id), frequency(freq), longRange(lr) {
        std::cout << "    RADAR at " << frequency << "GHz, "
                  << (longRange ? "long" : "short") << " range\n";
    }

    std::string getType() const override { return "RADAR"; }
};

class CameraSensor : public Sensor {
    std::string resolution;
    int fps;

public:
    CameraSensor(const std::string& id, const std::string& res, int framerate)
        : Sensor(id), resolution(res), fps(framerate) {
        std::cout << "    Camera " << resolution << " @ " << fps << "fps\n";
    }

    std::string getType() const override { return "CAMERA"; }
};

// Template-based factory with perfect forwarding
template<typename BaseType>
class Factory {
public:
    template<typename ConcreteType, typename... Args>
    static std::unique_ptr<BaseType> create(Args&&... args) {
        return std::make_unique<ConcreteType>(std::forward<Args>(args)...);
    }
};

int main() {
    std::cout << "Template Factory with Perfect Forwarding\n\n";

    // Create different sensors with varying constructor parameters
    auto lidar = Factory<Sensor>::create<LidarSensor>("LIDAR-001", 64);

    auto radar = Factory<Sensor>::create<RadarSensor>("RADAR-002", 77.0, true);

    auto camera = Factory<Sensor>::create<CameraSensor>("CAM-003", "4K", 60);

    std::cout << "\nCreated sensors:\n";
    std::cout << "  " << lidar->getType() << "\n";
    std::cout << "  " << radar->getType() << "\n";
    std::cout << "  " << camera->getType() << "\n";

    return 0;
}
```

Template factory with perfect forwarding allows creating objects with any constructor signature. The factory forwards all arguments to the concrete type's constructor without copying.

#### Example 8: Performance - Object Pool Factory (Reusable Objects)

```cpp
#include <iostream>
#include <memory>
#include <vector>
#include <queue>
#include <mutex>

// Expensive object to create
class SensorData {
    std::vector<double> pointCloud;  // Large data structure

public:
    SensorData() {
        pointCloud.reserve(100000);  // Reserve large buffer
        std::cout << "  [Expensive] Allocating SensorData (100K points)\n";
    }

    void reset() {
        pointCloud.clear();
    }

    void addPoint(double value) {
        pointCloud.push_back(value);
    }

    size_t size() const { return pointCloud.size(); }
};

// Object pool factory - recycles expensive objects
class SensorDataPool {
    std::queue<std::unique_ptr<SensorData>> pool;
    std::mutex mtx;
    size_t created = 0;
    size_t recycled = 0;

public:
    // Acquire object from pool (or create new if pool empty)
    std::unique_ptr<SensorData> acquire() {
        std::lock_guard<std::mutex> lock(mtx);

        if (pool.empty()) {
            created++;
            return std::make_unique<SensorData>();
        }

        recycled++;
        auto obj = std::move(pool.front());
        pool.pop();
        obj->reset();
        return obj;
    }

    // Release object back to pool
    void release(std::unique_ptr<SensorData> obj) {
        std::lock_guard<std::mutex> lock(mtx);
        pool.push(std::move(obj));
    }

    void printStats() const {
        std::cout << "\nPool Statistics:\n";
        std::cout << "  Objects created: " << created << "\n";
        std::cout << "  Objects recycled: " << recycled << "\n";
        std::cout << "  Objects in pool: " << pool.size() << "\n";
    }
};

// RAII wrapper for auto-release
class PooledSensorData {
    std::unique_ptr<SensorData> data;
    SensorDataPool* pool;

public:
    PooledSensorData(std::unique_ptr<SensorData> d, SensorDataPool* p)
        : data(std::move(d)), pool(p) {}

    ~PooledSensorData() {
        if (data && pool) {
            pool->release(std::move(data));
        }
    }

    SensorData* operator->() { return data.get(); }
    SensorData& operator*() { return *data; }
};

int main() {
    std::cout << "Object Pool Factory Pattern\n\n";

    SensorDataPool pool;

    std::cout << "First batch (creates new objects):\n";
    {
        auto data1 = pool.acquire();
        auto data2 = pool.acquire();
        auto data3 = pool.acquire();

        data1->addPoint(1.0);
        data2->addPoint(2.0);
        data3->addPoint(3.0);

        std::cout << "  Using 3 objects...\n";

        // Return to pool
        pool.release(std::move(data1));
        pool.release(std::move(data2));
        pool.release(std::move(data3));
    }

    std::cout << "\nSecond batch (recycles from pool):\n";
    {
        auto data1 = pool.acquire();  // Recycled
        auto data2 = pool.acquire();  // Recycled
        auto data3 = pool.acquire();  // Recycled
        auto data4 = pool.acquire();  // New (pool exhausted)

        std::cout << "  Using 4 objects (3 recycled, 1 new)...\n";

        pool.release(std::move(data1));
        pool.release(std::move(data2));
        pool.release(std::move(data3));
        pool.release(std::move(data4));
    }

    pool.printStats();

    return 0;
}
```

Object pool factory reuses expensive objects instead of creating new ones each time. Critical for real-time systems (autonomous vehicles) where allocation latency is unacceptable. Pool reduces allocations from O(n) to O(1) after warmup.

---

### INTERVIEW_QA: Comprehensive Questions with Detailed Answers

#### Q1: What is the Factory pattern and when should you use it?
**Difficulty:** #beginner
**Category:** #design_pattern
**Concepts:** #factory #creational_pattern #decoupling

**Answer:**
Factory pattern is a creational design pattern that provides an interface for creating objects without specifying their exact class, delegating instantiation decisions to factory methods or classes.

**Code example:**
```cpp
// Without factory
LidarSensor* sensor = new LidarSensor();  // Client knows concrete class

// With factory
std::unique_ptr<Sensor> sensor = SensorFactory::create(Type::LIDAR);
// Client uses interface, doesn't know LidarSensor exists
```

**Explanation:**
Use factory when: (1) client code shouldn't depend on concrete classes, (2) object creation is complex and needs centralization, (3) you need to support multiple product variants, (4) creation logic might change independently of client code. Factories promote Open/Closed Principle - add new types by extending factory, not modifying clients.

**Key takeaway:** Factory decouples object creation from usage, making code more maintainable and extensible.

---

#### Q2: What's the difference between Factory Method and Abstract Factory?
**Difficulty:** #intermediate
**Category:** #design_patterns #comparison
**Concepts:** #factory_method #abstract_factory #pattern_comparison

**Answer:**
Factory Method defines an interface for creating a single object type, letting subclasses decide which class to instantiate. Abstract Factory provides an interface for creating families of related objects.

**Code example:**
```cpp
// Factory Method: Creates ONE product type
class SensorSystem {
public:
    virtual unique_ptr<Sensor> createSensor() = 0;  // Subclasses implement
};

// Abstract Factory: Creates FAMILY of products
class SystemFactory {
public:
    virtual unique_ptr<Sensor> createSensor() = 0;
    virtual unique_ptr<Display> createDisplay() = 0;
    virtual unique_ptr<Logger> createLogger() = 0;
};
```

**Explanation:**
Factory Method focuses on varying a single product through inheritance. Abstract Factory ensures consistent product families (e.g., all "production" components or all "test" components). Use Factory Method when you have one varying product type; use Abstract Factory when you need to create multiple related products that must work together.

**Key takeaway:** Factory Method = single product variation via inheritance; Abstract Factory = multiple related products for consistency.

---

#### Q3: How do you implement exception-safe factories in C++?
**Difficulty:** #intermediate
**Category:** #exception_safety #resource_management
**Concepts:** #raii #smart_pointers #exception_handling

**Answer:**
Exception-safe factories return smart pointers (unique_ptr/shared_ptr) and use RAII to ensure no resource leaks even if initialization throws.

**Code example:**
```cpp
// ❌ NOT exception-safe
Sensor* create() {
    Sensor* s = new Sensor();
    s->initialize();  // If throws, s leaks
    return s;
}

// ✅ Exception-safe
unique_ptr<Sensor> create() {
    auto s = make_unique<Sensor>();  // RAII
    s->initialize();  // If throws, unique_ptr cleans up
    return s;
}
```

**Explanation:**
Raw pointers leak if exceptions occur after allocation but before return. Smart pointers automatically delete the object if an exception unwinds the stack. Always return unique_ptr (exclusive ownership) or shared_ptr (shared ownership) from factories. Use make_unique/make_shared to combine allocation and construction atomically.

**Key takeaway:** Always return smart pointers from factories for automatic exception-safe cleanup.

---

#### Q4: What causes object slicing in factory returns and how do you prevent it?
**Difficulty:** #intermediate
**Category:** #polymorphism #undefined_behavior
**Concepts:** #object_slicing #virtual_functions #pointers

**Answer:**
Object slicing occurs when returning polymorphic objects by value, causing derived class data to be "sliced off" and virtual functions to fail.

**Code example:**
```cpp
// ❌ BROKEN: Returns by value (slicing!)
Sensor createSensor() {
    return LidarSensor();  // Sliced to base Sensor
}

Sensor s = createSensor();
s.readValue();  // Calls Sensor::readValue(), NOT LidarSensor::readValue()

// ✅ CORRECT: Return pointer to maintain polymorphism
unique_ptr<Sensor> createSensor() {
    return make_unique<LidarSensor>();  // No slicing
}

unique_ptr<Sensor> s = createSensor();
s->readValue();  // Correctly calls LidarSensor::readValue()
```

**Explanation:**
Returning by value copies only the base class part of the object. Virtual function table pointer is reset to base class, destroying polymorphism. Always return pointers (preferably smart pointers) or references for polymorphic types. Slicing only affects value semantics, not pointer/reference semantics.

**Key takeaway:** Never return polymorphic objects by value from factories; always use pointers or references.

---

#### Q5: How do you implement thread-safe lazy factory initialization?
**Difficulty:** #advanced
**Category:** #concurrency #thread_safety
**Concepts:** #lazy_initialization #mutex #call_once

**Answer:**
Thread-safe lazy factories need synchronization to prevent race conditions during object creation. Use mutex, std::call_once, or C++11 static locals.

**Code example:**
```cpp
// ❌ NOT thread-safe
unique_ptr<Sensor> instance;
Sensor& getSensor() {
    if (!instance) {  // Race condition!
        instance = make_unique<Sensor>();
    }
    return *instance;
}

// ✅ Thread-safe with call_once
unique_ptr<Sensor> instance;
once_flag flag;

Sensor& getSensor() {
    call_once(flag, []() {
        instance = make_unique<Sensor>();
    });
    return *instance;
}
```

**Explanation:**
Without synchronization, multiple threads can see null and create multiple instances. std::call_once ensures the lambda runs exactly once even with concurrent access. Alternative: use mutex with double-checked locking, or rely on C++11 static local guarantees. For high-performance scenarios, consider lock-free atomic operations.

**Key takeaway:** Use std::call_once or mutex for thread-safe lazy initialization in factories.

---

#### Q6: What are the trade-offs between compile-time (template) and runtime (virtual) factories?
**Difficulty:** #advanced
**Category:** #design_tradeoffs #performance
**Concepts:** #templates #virtual_functions #static_polymorphism

**Answer:**
Template factories provide zero-cost abstraction and type safety but increase binary size. Virtual factories add runtime overhead but support dynamic type selection.

**Code example:**
```cpp
// Runtime factory (virtual)
unique_ptr<Sensor> create(Type type) {  // Type chosen at runtime
    if (type == LIDAR) return make_unique<LidarSensor>();
    else return make_unique<RadarSensor>();
}  // Virtual calls, runtime polymorphism

// Compile-time factory (template)
template<typename SensorType>
unique_ptr<SensorType> create() {  // Type known at compile-time
    return make_unique<SensorType>();
}
auto lidar = create<LidarSensor>();  // No virtual calls, inlined
```

**Explanation:**
Virtual factories support runtime decisions (e.g., sensor type from config file) but pay for vtable indirection (~5-10ns per call). Template factories eliminate runtime overhead through inlining but require compile-time type knowledge and increase binary size. Hybrid approach: template factory creates concrete types, returned through abstract interface when needed.

**Key takeaway:** Use virtual factories for runtime flexibility; use templates when type known at compile-time for better performance.

---

#### Q7: How do you handle factory creation of objects with dependencies (dependency injection)?
**Difficulty:** #advanced
**Category:** #dependency_injection #design_patterns
**Concepts:** #di #factory #composition

**Answer:**
Factories can inject dependencies through constructor parameters or provide dependency resolution mechanisms like service locators or DI containers.

**Code example:**
```cpp
// Factory with dependency injection
class SensorFactory {
    Logger& logger;  // Dependency

public:
    SensorFactory(Logger& log) : logger(log) {}

    unique_ptr<Sensor> createSensor(Type type) {
        auto sensor = make_unique<Sensor>(type);
        sensor->setLogger(logger);  // Inject dependency
        logger.log("Created sensor");
        return sensor;
    }
};

// Usage
Logger logger;
SensorFactory factory(logger);  // Factory gets dependencies
auto sensor = factory.createSensor(Type::LIDAR);
```

**Explanation:**
Factories themselves can have dependencies injected via constructor. When creating objects, the factory injects their dependencies. This separates object construction from dependency resolution. For complex systems, consider DI containers that handle dependency graphs automatically.

**Key takeaway:** Factories can inject dependencies into created objects, separating construction from dependency management.

---

#### Q8: What is a registry-based factory and when is it useful?
**Difficulty:** #intermediate
**Category:** #design_patterns #extensibility
**Concepts:** #registry #plugin_architecture #runtime_registration

**Answer:**
Registry-based factory maps string identifiers to creator functions, allowing runtime registration of new types without modifying factory code.

**Code example:**
```cpp
class Factory {
    map<string, function<unique_ptr<Sensor>()>> registry;

public:
    void registerType(const string& name, auto creator) {
        registry[name] = creator;
    }

    unique_ptr<Sensor> create(const string& name) {
        return registry[name]();  // Call registered creator
    }
};

// Registration (can happen from plugins)
factory.registerType("lidar", []() { return make_unique<LidarSensor>(); });
factory.registerType("radar", []() { return make_unique<RadarSensor>(); });

// Usage with string names (from config files)
auto sensor = factory.create("lidar");
```

**Explanation:**
Registry factories store creator functions (usually lambdas or function objects) in a map keyed by type name. New types can be registered at runtime without recompiling the factory. Useful for plugin architectures, configuration-driven systems, and extensible frameworks. Trade-off: runtime overhead of map lookup vs flexibility.

**Key takeaway:** Registry factories enable runtime extensibility and plugin architectures through dynamic type registration.

---

#### Q9: How do you implement a factory that caches created objects (Flyweight pattern)?
**Difficulty:** #advanced
**Category:** #design_patterns #optimization
**Concepts:** #flyweight #caching #object_pooling

**Answer:**
Caching factory stores created objects and returns existing instances for repeated requests, reducing allocation overhead.

**Code example:**
```cpp
class SensorFactory {
    map<string, shared_ptr<Sensor>> cache;

public:
    shared_ptr<Sensor> getSensor(const string& id) {
        // Check cache first
        auto it = cache.find(id);
        if (it != cache.end()) {
            return it->second;  // Return cached instance
        }

        // Create new and cache
        auto sensor = make_shared<Sensor>(id);
        cache[id] = sensor;
        return sensor;
    }
};
```

**Explanation:**
Caching factory implements Flyweight pattern - objects with same identity return the same instance. Use shared_ptr for reference counting, allowing multiple clients to hold references. Add thread safety with mutex for concurrent access. Consider weak_ptr to allow garbage collection when no external references exist.

**Key takeaway:** Caching factories reduce allocation overhead by reusing objects; use shared_ptr for reference counting.

---

#### Q10: What's the difference between Factory pattern and Builder pattern?
**Difficulty:** #intermediate
**Category:** #design_patterns #comparison
**Concepts:** #factory #builder #pattern_differences

**Answer:**
Factory creates complete objects in one step, focusing on *what* to create. Builder constructs complex objects step-by-step, focusing on *how* to create.

**Code example:**
```cpp
// Factory: One-step creation
auto sensor = SensorFactory::create(Type::LIDAR);  // Done

// Builder: Step-by-step construction
auto sensor = SensorBuilder()
    .setType(Type::LIDAR)
    .setRange(200.0)
    .setSampleRate(20)
    .setCalibration(calibData)
    .build();  // Multi-step configuration
```

**Explanation:**
Factory emphasizes *polymorphism* - returning different types through same interface. Builder emphasizes *complex construction* - assembling object with many optional parameters. Use Factory when you need different product types; use Builder when construction requires many parameters or complex initialization sequence.

**Key takeaway:** Factory = polymorphic creation; Builder = complex step-by-step construction.

---

#### Q11: How do you test code that uses factories?
**Difficulty:** #intermediate
**Category:** #testing #testability
**Concepts:** #dependency_injection #mocking #test_doubles

**Answer:**
Inject factory as dependency to allow swapping with mock factory in tests, or use abstract factory interface with test-specific implementations.

**Code example:**
```cpp
// Production code takes factory as dependency
class Application {
    SensorFactory& factory;

public:
    Application(SensorFactory& f) : factory(f) {}

    void run() {
        auto sensor = factory.create(Type::LIDAR);
        sensor->readValue();
    }
};

// Test with mock factory
class MockFactory : public SensorFactory {
public:
    unique_ptr<Sensor> create(Type) override {
        return make_unique<MockSensor>();  // Return test double
    }
};

// Test
MockFactory mockFactory;
Application app(mockFactory);  // Inject mock
app.run();  // Uses mock sensors
```

**Explanation:**
Inject factory through constructor/setter to enable dependency injection. Tests provide mock factory that returns test doubles instead of real objects. This isolates the unit under test from external dependencies. Abstract Factory pattern naturally supports this through polymorphism.

**Key takeaway:** Inject factories as dependencies to enable testing with mock implementations.

---

#### Q12: What are the memory management implications of different factory return types?
**Difficulty:** #advanced
**Category:** #memory_management #ownership
**Concepts:** #unique_ptr #shared_ptr #ownership_semantics

**Answer:**
Factory return type determines ownership semantics: unique_ptr (exclusive), shared_ptr (shared), raw pointer (ambiguous - avoid).

**Code example:**
```cpp
// Exclusive ownership - client takes ownership
unique_ptr<Sensor> create() {
    return make_unique<Sensor>();
}
auto sensor = create();  // Client owns, deletes on destruction

// Shared ownership - multiple references
shared_ptr<Sensor> create() {
    return make_shared<Sensor>();
}
auto s1 = create();
auto s2 = s1;  // Shared ownership, deleted when both destroyed

// ❌ Ambiguous - who owns/deletes?
Sensor* create() {
    return new Sensor();  // Memory leak risk!
}
```

**Explanation:**
unique_ptr transfers exclusive ownership to caller - clear, efficient. shared_ptr allows multiple owners - uses atomic reference counting (~10% overhead). Raw pointers are ambiguous about ownership - avoid in modern C++. For return values, prefer unique_ptr (convertible to shared_ptr if needed).

**Key takeaway:** Return unique_ptr for exclusive ownership, shared_ptr for shared ownership; avoid raw pointers.

---

#### Q13: How do factories handle object lifetime and destruction order?
**Difficulty:** #advanced
**Category:** #resource_management #lifetime
**Concepts:** #raii #destruction_order #resource_cleanup

**Answer:**
Factories return RAII-wrapped objects (smart pointers) that handle destruction automatically. Destruction order follows scope rules and smart pointer semantics.

**Code example:**
```cpp
void process() {
    auto sensor1 = factory.create(Type::LIDAR);   // Created first
    auto sensor2 = factory.create(Type::RADAR);   // Created second

    sensor1->readValue();
    sensor2->readValue();

}  // Destroyed in reverse order: sensor2, then sensor1 (automatic)

// Explicit control with optional
optional<unique_ptr<Sensor>> maybeSensor;
if (condition) {
    maybeSensor = factory.create(Type::LIDAR);
}
// ... later ...
maybeSensor.reset();  // Explicit destruction
```

**Explanation:**
Smart pointers follow RAII - constructed objects are destroyed in reverse order when leaving scope. Factory doesn't control destruction; ownership transfer gives that control to caller. For complex lifetime requirements, use shared_ptr, weak_ptr, or explicit lifetime management with optional/unique_ptr.

**Key takeaway:** Factories delegate lifetime management to smart pointers; destruction follows RAII and scope rules.

---

#### Q14: What is the relationship between Factory and Dependency Inversion Principle?
**Difficulty:** #intermediate
**Category:** #design_principles #solid
**Concepts:** #dip #abstractions #coupling

**Answer:**
Factory supports Dependency Inversion Principle by making high-level code depend on abstract interfaces (products) rather than concrete implementations.

**Code example:**
```cpp
// ❌ Violates DIP - depends on concrete class
class Application {
    LidarSensor sensor;  // ❌ Depends on concrete type
public:
    void run() {
        sensor.readValue();
    }
};

// ✅ Follows DIP - depends on abstraction
class Application {
    unique_ptr<Sensor> sensor;  // ✅ Depends on interface
public:
    Application(SensorFactory& factory) {
        sensor = factory.create(Type::LIDAR);  // Factory provides concrete
    }
    void run() {
        sensor->readValue();  // Uses abstraction
    }
};
```

**Explanation:**
DIP states high-level modules shouldn't depend on low-level modules; both should depend on abstractions. Factory returns abstract interface, hiding concrete implementation from client. Client code depends only on Sensor interface, not LidarSensor. New sensor types don't require client changes.

**Key takeaway:** Factory enables DIP by returning abstractions, decoupling clients from concrete implementations.

---

#### Q15: How do you implement type-safe factories with compile-time checking?
**Difficulty:** #advanced
**Category:** #type_safety #templates
**Concepts:** #type_safety #constexpr #template_metaprogramming

**Answer:**
Use enums, templates, or std::variant for type-safe factories that catch errors at compile-time rather than runtime.

**Code example:**
```cpp
// Runtime type safety (enum)
enum class Type { LIDAR, RADAR };
unique_ptr<Sensor> create(Type type) {
    switch (type) {
        case Type::LIDAR: return make_unique<LidarSensor>();
        case Type::RADAR: return make_unique<RadarSensor>();
    }
}  // Compiler warns if case missing

// Compile-time type safety (template)
template<typename T>
unique_ptr<T> create() {
    return make_unique<T>();
}
auto lidar = create<LidarSensor>();  // Type checked at compile-time

// Type-safe variant return
using SensorVariant = variant<LidarSensor, RadarSensor>;
SensorVariant create(Type type);  // Can only return known types
```

**Explanation:**
Enums with switch provide some type safety - compiler warns about missing cases. Templates offer complete compile-time type safety but require static type knowledge. std::variant combines runtime flexibility with compile-time type safety - can only hold listed types.

**Key takeaway:** Use enums/switch for runtime safety, templates for compile-time safety, std::variant for both.

---

#### Q16: What are the performance implications of virtual factories vs static factories?
**Difficulty:** #advanced
**Category:** #performance #optimization
**Concepts:** #vtable #inlining #devirtualization

**Answer:**
Virtual factories incur vtable lookup overhead (~3-5ns per call); static factories can be inlined for zero overhead but sacrifice runtime flexibility.

**Code example:**
```cpp
// Virtual factory - runtime overhead
class Factory {
public:
    virtual unique_ptr<Sensor> create() = 0;  // Virtual
};
// ~3-5ns overhead per create() call (vtable lookup)

// Static factory - zero overhead but less flexible
class Factory {
public:
    static unique_ptr<Sensor> create() {  // Static
        return make_unique<Sensor>();
    }
};
// Can be inlined - zero overhead

// Hybrid: static factory returning abstract type
static unique_ptr<Sensor> create() {
    return make_unique<LidarSensor>();  // Static creation
}  // Returns abstract pointer, but creation inlined
```

**Explanation:**
Virtual factories allow polymorphic factories (different factory implementations) but pay for indirection. Static factories are faster but fixed at compile-time. For performance-critical code (e.g., 10kHz sensor processing), measure impact. Often the object creation cost dominates vtable lookup.

**Key takeaway:** Virtual factories sacrifice ~3-5ns for flexibility; static factories are inlined but less flexible.

---

#### Q17: How do factories interact with move semantics and perfect forwarding?
**Difficulty:** #advanced
**Category:** #move_semantics #modern_cpp
**Concepts:** #move #perfect_forwarding #rvalue_references

**Answer:**
Factories use move semantics to transfer ownership efficiently and perfect forwarding to pass constructor arguments without copying.

**Code example:**
```cpp
// Move semantics - efficient ownership transfer
unique_ptr<Sensor> create() {
    unique_ptr<Sensor> sensor = make_unique<Sensor>();
    return sensor;  // Move, not copy (RVO/NRVO may elide)
}

auto s = create();  // Ownership moved to s

// Perfect forwarding - forward constructor args
template<typename T, typename... Args>
unique_ptr<T> create(Args&&... args) {
    return make_unique<T>(std::forward<Args>(args)...);
}

auto sensor = create<Sensor>("ID-001", 100);  // Args forwarded perfectly
```

**Explanation:**
Returning unique_ptr uses move semantics (or return value optimization) for efficient ownership transfer - no copying. Perfect forwarding with `std::forward` preserves lvalue/rvalue-ness of arguments, avoiding unnecessary copies. Template factories with perfect forwarding support any constructor signature.

**Key takeaway:** Factories leverage move semantics for efficient returns and perfect forwarding for flexible construction.

---

#### Q18: What is the "virtual constructor idiom" and how does Factory implement it?
**Difficulty:** #intermediate
**Category:** #idioms #polymorphism
**Concepts:** #virtual_constructor #clone_pattern #copy_construction

**Answer:**
Virtual constructor idiom uses factory methods to create copies of polymorphic objects without knowing their concrete type.

**Code example:**
```cpp
class Sensor {
public:
    virtual ~Sensor() = default;

    // Virtual constructor idiom
    virtual unique_ptr<Sensor> clone() const = 0;  // Create copy
    virtual unique_ptr<Sensor> create() const = 0;  // Create new
};

class LidarSensor : public Sensor {
public:
    unique_ptr<Sensor> clone() const override {
        return make_unique<LidarSensor>(*this);  // Copy constructor
    }

    unique_ptr<Sensor> create() const override {
        return make_unique<LidarSensor>();  // Default constructor
    }
};

// Usage - polymorphic copying
void duplicate(const Sensor& sensor) {
    auto copy = sensor.clone();  // Virtual call, correct type copied
}
```

**Explanation:**
C++ constructors can't be virtual, but factory methods can. `clone()` creates a copy (virtual copy constructor), `create()` creates fresh instance (virtual default constructor). Each derived class implements these to return correct type. Enables polymorphic copying without knowing concrete type.

**Key takeaway:** Virtual constructor idiom uses factory methods to enable polymorphic object creation and copying.

---

#### Q19: How do you handle factory creation failures and error reporting?
**Difficulty:** #intermediate
**Category:** #error_handling #robustness
**Concepts:** #exceptions #error_codes #optional

**Answer:**
Factories can report errors through exceptions, optional return types, or error codes, depending on error handling strategy.

**Code example:**
```cpp
// Exception-based error handling
unique_ptr<Sensor> create(Type type) {
    if (type == Type::UNKNOWN) {
        throw invalid_argument("Unknown sensor type");
    }
    return make_unique<Sensor>(type);
}

// Optional-based error handling (no exceptions)
optional<unique_ptr<Sensor>> create(Type type) {
    if (type == Type::UNKNOWN) {
        return nullopt;  // Indicates failure
    }
    return make_unique<Sensor>(type);
}

// Error code with output parameter
enum class Error { OK, INVALID_TYPE, INIT_FAILED };
Error create(Type type, unique_ptr<Sensor>& out) {
    if (type == Type::UNKNOWN) return Error::INVALID_TYPE;
    out = make_unique<Sensor>(type);
    return Error::OK;
}
```

**Explanation:**
Exceptions provide detailed error information but have overhead and stack unwinding. `std::optional` indicates success/failure without exceptions (useful in no-exception code). Error codes are explicit but require checking. Choose based on error handling policy and performance requirements.

**Key takeaway:** Use exceptions for exceptional errors, optional for expected failures, error codes for no-exception environments.

---

#### Q20: How do factories support the Open/Closed Principle?
**Difficulty:** #intermediate
**Category:** #design_principles #solid
**Concepts:** #ocp #extensibility #maintenance

**Answer:**
Factories enable Open/Closed Principle by allowing extension (new types) without modification (existing factory code).

**Code example:**
```cpp
// ❌ Violates OCP - must modify for new types
unique_ptr<Sensor> create(Type type) {
    switch (type) {
        case Type::LIDAR: return make_unique<LidarSensor>();
        case Type::RADAR: return make_unique<RadarSensor>();
        // Adding camera requires modifying this function!
    }
}

// ✅ Follows OCP - registry-based extension
class Factory {
    map<Type, function<unique_ptr<Sensor>()>> creators;
public:
    void registerCreator(Type type, auto creator) {
        creators[type] = creator;  // Extension without modification
    }

    unique_ptr<Sensor> create(Type type) {
        return creators[type]();
    }
};

// Add new type without modifying factory
factory.registerCreator(Type::CAMERA, []() {
    return make_unique<CameraSensor>();
});
```

**Explanation:**
OCP states software entities should be open for extension but closed for modification. Registry-based factories allow adding new types through registration, without changing factory code. Alternative: use plugin system where new types are loaded dynamically. Switch-based factories violate OCP.

**Key takeaway:** Registry-based factories support OCP by allowing type registration without modifying factory code.

---

### PRACTICE_TASKS: Code Analysis and Implementation Challenges

#### Q1
```cpp
class SensorFactory {
public:
    static Sensor* createSensor(Type type) {
        if (type == Type::LIDAR) {
            return new LidarSensor();
        }
        return new RadarSensor();
    }
};

// Used in a loop that processes thousands of sensor readings
for (int i = 0; i < 10000; ++i) {
    Sensor* s = SensorFactory::createSensor(Type::LIDAR);
    process(s);
    delete s;
}

// What's the problem and how do you fix it?
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Memory fragmentation and allocation overhead from creating/deleting 10,000 objects

**Explanation:** Each iteration allocates and deallocates a sensor, causing heap fragmentation and ~100ns allocation overhead per iteration. Use object pool factory to reuse sensors or stack allocation if possible.

**Fix:**
```cpp
// Object pool factory
SensorPool pool;
for (int i = 0; i < 10000; ++i) {
    auto s = pool.acquire();  // Reuse from pool
    process(*s);
}  // Auto-release back to pool
```

**Key Concept:** #memory_management #object_pooling #performance

</details>

---

#### Q2
```cpp
class Factory {
public:
    static Sensor createSensor() {  // Note: returns by value
        return LidarSensor();
    }
};

Sensor s = Factory::createSensor();
s.readValue();  // What happens here?
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Object slicing - derived class data lost, virtual functions won't work correctly

**Explanation:** Returning by value slices LidarSensor to base Sensor. Virtual function table pointer is reset to base class, so `readValue()` calls Sensor's version, not LidarSensor's.

**Fix:** Return unique_ptr or reference to maintain polymorphism

**Key Concept:** #object_slicing #polymorphism

</details>

---

#### Q3
```cpp
class SensorFactory {
    static map<string, unique_ptr<Sensor>> cache;

public:
    static Sensor* getSensor(const string& id) {
        if (cache.find(id) == cache.end()) {
            cache[id] = make_unique<Sensor>(id);
        }
        return cache[id].get();
    }
};

// Called from multiple threads simultaneously
// Is this thread-safe?
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Not thread-safe - race condition in cache access and modification

**Explanation:** Multiple threads can execute find() and create simultaneously, potentially inserting duplicate entries or corrupting the map.

**Fix:** Use mutex to protect cache access or use concurrent containers

**Key Concept:** #thread_safety #race_condition

</details>

---

#### Q4
```cpp
class Factory {
public:
    virtual unique_ptr<Sensor> create() = 0;
};

class LidarFactory : public Factory {
public:
    unique_ptr<Sensor> create() override {
        return make_unique<LidarSensor>();
    }
};

// How does this differ from a static factory method?
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Virtual factory allows runtime polymorphism of factories; static factory is fixed at compile-time

**Explanation:** Virtual factory enables selecting different factory implementations at runtime. Static factory is faster (no vtable lookup) but less flexible.

**Trade-off:** Runtime flexibility vs compile-time efficiency

**Key Concept:** #polymorphism #design_tradeoffs

</details>

---

#### Q5
```cpp
template<typename T>
class Factory {
public:
    static unique_ptr<Sensor> create() {
        return make_unique<T>();
    }
};

auto sensor = Factory<LidarSensor>::create();

// What are the advantages and limitations?
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Advantages: type-safe, zero overhead, inlined. Limitations: type must be known at compile-time

**Explanation:** Template factory provides compile-time type safety and performance (no virtual calls), but cannot be used when type is determined at runtime (e.g., from config file).

**Use case:** When type is statically known and performance matters

**Key Concept:** #templates #compile_time_polymorphism

</details>

---

#### Q6
```cpp
class SensorFactory {
public:
    static unique_ptr<Sensor> create(Type type) {
        Sensor* s = nullptr;

        switch (type) {
            case Type::LIDAR:
                s = new LidarSensor();
                break;
            case Type::RADAR:
                s = new RadarSensor();
                break;
        }

        s->initialize();  // May throw exception
        return unique_ptr<Sensor>(s);
    }
};

// What's the problem if initialize() throws?
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Memory leak if initialize() throws before unique_ptr takes ownership

**Explanation:** Raw pointer `s` is not protected by RAII. If `initialize()` throws, the exception unwinds the stack before unique_ptr construction, leaking memory.

**Fix:** Construct unique_ptr immediately: `auto s = make_unique<Sensor>(); s->initialize();`

**Key Concept:** #exception_safety #raii

</details>

---

#### Q7
```cpp
class Factory {
    map<string, function<unique_ptr<Sensor>()>> registry;

public:
    void registerType(const string& name, auto creator) {
        registry[name] = creator;
    }

    unique_ptr<Sensor> create(const string& name) {
        return registry[name]();  // What if name not found?
    }
};

auto sensor = factory.create("unknown_type");
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Undefined behavior - accessing non-existent map entry creates null function, calling it crashes

**Explanation:** `operator[]` on map creates default-constructed entry if key doesn't exist. Default-constructed std::function is null, invoking it is undefined behavior.

**Fix:** Check existence with `find()` and throw exception if not found

**Key Concept:** #error_handling #undefined_behavior

</details>

---

#### Q8
```cpp
enum class SensorType { LIDAR, RADAR, CAMERA };

unique_ptr<Sensor> createSensor(SensorType type) {
    switch (type) {
        case SensorType::LIDAR:
            return make_unique<LidarSensor>();
        case SensorType::RADAR:
            return make_unique<RadarSensor>();
    }
}

// What compile-time safety does this provide?
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Compiler warns if not all enum cases handled (with warnings enabled)

**Explanation:** Switch on enum without default case allows compiler to detect missing cases. Adding CAMERA to enum triggers warning that it's not handled in switch.

**Benefit:** Compile-time detection of incomplete handling when enum changes

**Key Concept:** #type_safety #compile_time_checking

</details>

---

#### Q9
```cpp
class AbstractFactory {
public:
    virtual unique_ptr<Sensor> createSensor() = 0;
    virtual unique_ptr<Display> createDisplay() = 0;
    virtual unique_ptr<Logger> createLogger() = 0;
};

class ProductionFactory : public AbstractFactory { /* ... */ };
class TestFactory : public AbstractFactory { /* ... */ };

// When should you use Abstract Factory over Factory Method?
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** When you need to create families of related objects that must work together consistently

**Explanation:** Abstract Factory ensures all created objects (sensor, display, logger) come from the same family (production or test). Factory Method creates single product type.

**Example:** UI toolkit where buttons, windows, and menus must all match the same style (Windows/Mac)

**Key Concept:** #abstract_factory #consistency

</details>

---

#### Q10
```cpp
class SensorFactory {
public:
    static unique_ptr<Sensor> create(int type) {  // int instead of enum
        if (type == 1) return make_unique<LidarSensor>();
        if (type == 2) return make_unique<RadarSensor>();
        return nullptr;  // Invalid type
    }
};

auto sensor = SensorFactory::create(5);  // Typo or invalid

// What's wrong with this design?
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** No type safety - magic numbers allow invalid values, returning nullptr is error-prone

**Explanation:** Using `int` instead of enum allows any value (5, -1, 1000000). Returning nullptr for errors requires null-checking, which is easy to forget.

**Fix:** Use enum class for type safety and throw exception or return optional for errors

**Key Concept:** #type_safety #error_handling

</details>

---

#### Q11
```cpp
class Factory {
public:
    shared_ptr<Sensor> getSensor(const string& id) {
        static map<string, weak_ptr<Sensor>> cache;

        auto it = cache.find(id);
        if (it != cache.end()) {
            if (auto sensor = it->second.lock()) {
                return sensor;  // Reuse existing
            }
        }

        // Create new
        auto sensor = make_shared<Sensor>(id);
        cache[id] = sensor;
        return sensor;
    }
};

// Why use weak_ptr in cache instead of shared_ptr?
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** weak_ptr allows cached objects to be destroyed when no external references exist

**Explanation:** If cache stored shared_ptr, objects would never be destroyed (cache holds reference). weak_ptr doesn't affect reference count, so objects are destroyed when all clients release them.

**Benefit:** Automatic cache eviction without manual cleanup

**Key Concept:** #weak_ptr #cache_management

</details>

---

#### Q12
```cpp
class SensorFactory {
    static once_flag initFlag;
    static unique_ptr<HardwareInterface> hardware;

public:
    static unique_ptr<Sensor> create(Type type) {
        call_once(initFlag, []() {
            hardware = make_unique<HardwareInterface>();
            hardware->initialize();
        });

        return make_unique<Sensor>(hardware.get(), type);
    }
};

// What is the purpose of std::call_once here?
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Ensures hardware interface is initialized exactly once in thread-safe manner

**Explanation:** First sensor creation initializes shared hardware. Subsequent creates reuse initialized hardware. call_once guarantees single initialization even with concurrent access.

**Use case:** Lazy initialization of shared resources in factories

**Key Concept:** #lazy_initialization #thread_safety

</details>

---

#### Q13
```cpp
class Sensor {
public:
    virtual ~Sensor() = default;
    virtual unique_ptr<Sensor> clone() const = 0;
};

class LidarSensor : public Sensor {
public:
    unique_ptr<Sensor> clone() const override {
        return make_unique<LidarSensor>(*this);
    }
};

void duplicate(const Sensor& sensor) {
    auto copy = sensor.clone();
}

// What design pattern is clone() implementing?
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Virtual constructor idiom (also called Prototype pattern)

**Explanation:** C++ constructors can't be virtual, but clone() achieves virtual copying. Each derived class implements clone() to create copy of correct type.

**Benefit:** Polymorphic copying without knowing concrete type

**Key Concept:** #virtual_constructor #prototype_pattern

</details>

---

#### Q14
```cpp
class Factory {
public:
    template<typename T, typename... Args>
    static unique_ptr<Sensor> create(Args&&... args) {
        return make_unique<T>(std::forward<Args>(args)...);
    }
};

auto sensor = Factory::create<LidarSensor>("ID-001", 100, 200.0);

// What is std::forward doing here?
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Perfect forwarding - preserves lvalue/rvalue-ness of arguments

**Explanation:** `std::forward` ensures arguments are forwarded to constructor exactly as passed - lvalues as lvalues, rvalues as rvalues. Avoids unnecessary copies.

**Benefit:** Factory can accept any argument types without knowing them, forwarding efficiently

**Key Concept:** #perfect_forwarding #move_semantics

</details>

---

#### Q15
```cpp
using SensorVariant = variant<LidarSensor, RadarSensor, CameraSensor>;

SensorVariant createSensor(Type type) {
    switch (type) {
        case Type::LIDAR: return LidarSensor{};
        case Type::RADAR: return RadarSensor{};
        case Type::CAMERA: return CameraSensor{};
    }
}

auto sensor = createSensor(Type::LIDAR);
// How do you call methods on sensor?
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Use std::visit with lambda or visitor pattern

**Explanation:** variant requires std::visit to access contained type. Visit calls lambda with actual type, enabling method calls.

**Usage:**
```cpp
std::visit([](auto& s) {
    s.readValue();  // Works if all types have readValue()
}, sensor);
```

**Benefit:** Type-safe runtime polymorphism without pointers

**Key Concept:** #variant #type_erasure

</details>

---

#### Q16
```cpp
class SensorFactory {
public:
    static unique_ptr<Sensor> create(Type type) {
        switch (type) {
            case Type::LIDAR:
                return make_unique<LidarSensor>();
            case Type::RADAR:
                return make_unique<RadarSensor>();
            case Type::CAMERA:
                return make_unique<CameraSensor>();
        }
    }
};

// What happens when you add a new sensor type?
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Must modify factory code to add new case - violates Open/Closed Principle

**Explanation:** Switch-based factories require modification when adding types. Not ideal for extensibility.

**Better approach:** Registry-based factory where new types register themselves

**Key Concept:** #ocp #extensibility

</details>

---

#### Q17
```cpp
class Factory {
public:
    optional<unique_ptr<Sensor>> create(Type type) {
        if (type == Type::INVALID) {
            return nullopt;  // Error: invalid type
        }
        return make_unique<Sensor>(type);
    }
};

auto result = factory.create(type);
if (result) {
    auto sensor = std::move(*result);
    // use sensor
}

// Why use optional instead of exceptions?
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** optional avoids exception overhead and makes failure explicit in return type

**Explanation:** Invalid type is expected/common error, not exceptional. optional forces caller to check for failure explicitly, avoiding runtime overhead of exceptions.

**Trade-off:** Explicit error checking vs automatic error propagation

**Key Concept:** #error_handling #optional

</details>

---

#### Q18
```cpp
class SensorFactory {
    static atomic<int> instanceCount;

public:
    static unique_ptr<Sensor> create(Type type) {
        instanceCount++;
        auto sensor = make_unique<Sensor>(type);
        sensor->setID(instanceCount);
        return sensor;
    }
};

// Called from multiple threads - is this safe?
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Mostly safe, but instanceCount++ and setID() are not atomic as a unit

**Explanation:** instanceCount increment is atomic, but another thread might increment before setID() is called, causing ID mismatch or gaps.

**Fix:** Use mutex around entire operation or pass count directly to constructor

**Key Concept:** #atomics #thread_safety

</details>

---

#### Q19
```cpp
class Factory {
    static shared_ptr<Sensor> cached;

public:
    static shared_ptr<Sensor> getInstance() {
        if (!cached) {
            cached = make_shared<Sensor>();
        }
        return cached;
    }
};

// Is this a Factory pattern or Singleton pattern?
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Hybrid - Factory-like interface but Singleton-like behavior (single cached instance)

**Explanation:** Returns same instance every time (Singleton), but uses factory-like static method. True factory creates new instance each call; true Singleton has private constructor.

**Pattern name:** Flyweight or cached factory

**Key Concept:** #pattern_hybrid #singleton_factory

</details>

---

#### Q20
```cpp
class Factory {
public:
    static unique_ptr<Sensor> create(const string& config) {
        json j = json::parse(config);
        Type type = j["type"];
        int rate = j["sampleRate"];

        auto sensor = make_unique<Sensor>(type);
        sensor->setSampleRate(rate);
        return sensor;
    }
};

// What happens if JSON parsing fails or fields are missing?
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Exception thrown - need error handling and validation

**Explanation:** JSON parsing can throw `json::parse_error`, field access can throw if missing. Factory should validate config and provide meaningful errors.

**Best practice:** Wrap in try-catch, return optional or throw domain-specific exception

**Key Concept:** #error_handling #validation

</details>

---

### QUICK_REFERENCE: Answer Key and Comparison Tables

#### Answer Key for Practice Questions

| Q# | Answer | Key Concept |
|----|--------|-------------|
| 1 | Memory fragmentation and allocation overhead - use object pool | #object_pooling |
| 2 | Object slicing - return pointer not value | #object_slicing |
| 3 | Not thread-safe - need mutex for cache access | #thread_safety |
| 4 | Virtual factory allows runtime polymorphism; static is faster | #polymorphism |
| 5 | Type-safe and zero overhead, but requires compile-time type | #templates |
| 6 | Memory leak if initialize() throws - wrap in unique_ptr immediately | #exception_safety |
| 7 | Undefined behavior calling null function - check existence first | #error_handling |
| 8 | Compiler warns if enum cases missing (type safety) | #type_safety |
| 9 | Use Abstract Factory for families of related objects | #abstract_factory |
| 10 | No type safety with int - use enum class | #type_safety |
| 11 | weak_ptr allows cached objects to be destroyed | #weak_ptr |
| 12 | call_once ensures single initialization in thread-safe manner | #lazy_initialization |
| 13 | Virtual constructor idiom (Prototype pattern) | #virtual_constructor |
| 14 | Perfect forwarding preserves argument value categories | #perfect_forwarding |
| 15 | Use std::visit to access variant contents | #variant |
| 16 | Switch-based factory violates Open/Closed Principle | #ocp |
| 17 | optional avoids exception overhead for expected errors | #optional |
| 18 | Atomic increment safe, but increment+setID not atomic as unit | #atomics |
| 19 | Hybrid Factory/Singleton - Flyweight or cached factory | #pattern_hybrid |
| 20 | JSON parsing can throw - need validation and error handling | #error_handling |

#### Factory Pattern Comparison

| Aspect | Factory Method | Abstract Factory | Simple Factory | Registry Factory |
|--------|---------------|------------------|----------------|------------------|
| **Complexity** | Medium | High | Low | Medium |
| **Flexibility** | High (inheritance) | Very High (families) | Low (fixed types) | Very High (runtime) |
| **Type Safety** | High | High | Medium | Low (string keys) |
| **Performance** | Good (virtual call) | Good (virtual calls) | Excellent (static) | Good (map lookup) |
| **Extensibility** | Via subclassing | Via new factories | Modify code | Runtime registration |
| **Use Case** | Single varying product | Product families | Simple scenarios | Plugin systems |

#### Factory Return Type Comparison

| Return Type | Ownership | Overhead | Use Case |
|-------------|-----------|----------|----------|
| `unique_ptr<T>` | Exclusive | Minimal | Default choice, single owner |
| `shared_ptr<T>` | Shared | Atomic refcount (~10%) | Multiple owners, caching |
| `T*` raw pointer | Ambiguous | None | ❌ Avoid - unclear ownership |
| `T` by value | Copy | Copy cost | ❌ Causes slicing for polymorphic types |
| `optional<unique_ptr<T>>` | Exclusive + error | Minimal | Error handling without exceptions |
| `variant<T1, T2...>` | Value | None | Fixed set of unrelated types |

#### Thread Safety Considerations

| Scenario | Thread-Safe? | Solution |
|----------|--------------|----------|
| Static factory function | ✅ Yes | Stateless, no shared data |
| Factory with instance cache | ❌ No | Use mutex or concurrent map |
| Lazy initialization | ❌ No | Use std::call_once or mutex |
| Object pool factory | ❌ No | Mutex or lock-free queue |
| Registry factory | ❌ No | Mutex for registration and creation |
| C++11 static local init | ✅ Yes | Compiler generates thread-safe guards |

#### Factory Pattern Performance

| Factory Type | Creation Cost | Lookup Cost | Memory | Cache Performance |
|--------------|---------------|-------------|--------|-------------------|
| Switch-based | ~1ns | O(1) | Minimal | Excellent (predictable branches) |
| Virtual factory | ~3-5ns | O(1) | Vtable ptr | Good (vtable likely cached) |
| Map-based registry | ~20-50ns | O(log n) | Map overhead | Good (map nodes may be scattered) |
| Object pool | ~5-10ns | O(1) | Pool storage | Excellent (reuse reduces allocations) |
| Template factory | ~0ns (inlined) | O(1) | Code bloat | Excellent (inlined, no indirection) |

#### Design Principles and Factory Pattern

| Principle | How Factory Supports It |
|-----------|------------------------|
| **Open/Closed** | Add new types via registration without modifying factory code |
| **Dependency Inversion** | Clients depend on abstract interfaces, not concrete classes |
| **Single Responsibility** | Separates creation logic from business logic |
| **Liskov Substitution** | All factory products usable through common interface |
| **Interface Segregation** | Factories provide minimal interface for object creation |

#### Common Factory Use Cases in Autonomous Vehicles

| Component | Factory Type | Rationale |
|-----------|--------------|-----------|
| Sensor suite | Abstract Factory | Create consistent families (production vs test sensors) |
| Perception algorithms | Registry Factory | Load algorithms from config, support plugins |
| Path planners | Factory Method | Different planners for highway/urban/parking scenarios |
| Sensor data buffers | Object Pool Factory | Frequent allocation/deallocation, real-time requirements |
| Message parsers | Simple Factory | Fixed set of message types, performance critical |
| Control strategies | Strategy Factory + DI | Runtime selection, need dependency injection |

#### Error Handling Strategies

| Strategy | Syntax | Use Case | Performance |
|----------|--------|----------|-------------|
| **Exceptions** | `throw runtime_error()` | Exceptional errors, complex propagation | Overhead on throw (~1μs) |
| **optional** | `return nullopt` | Expected failures, explicit checking | Zero overhead |
| **Error codes** | `return Error::INVALID` | No-exception environments, C compatibility | Zero overhead |
| **Expected/Result** | `return unexpected(error)` | Value or error, functional style | Minimal overhead |
| **nullptr** | `return nullptr` | ❌ Avoid - easy to forget null check | Zero overhead but error-prone |

#### Memory Management Patterns

| Pattern | Ownership | Allocation | Destruction |
|---------|-----------|------------|-------------|
| **Factory returns unique_ptr** | Transfer to caller | Heap | Automatic (RAII) |
| **Factory returns shared_ptr** | Shared ownership | Heap | Refcount-based |
| **Object pool** | Pool owns, lends references | Heap (once) | Pool controls |
| **Placement new** | Caller-managed buffer | Pre-allocated | Manual/custom |
| **Factory emplace** | Caller's container | Container's allocator | Container manages |

---
