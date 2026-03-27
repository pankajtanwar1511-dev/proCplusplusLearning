## TOPIC: Factory Pattern (Factory Method and Abstract Factory)

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
