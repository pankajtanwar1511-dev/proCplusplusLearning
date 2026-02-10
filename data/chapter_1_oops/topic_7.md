I'll format a comprehensive C++ OOP study document based on all the topics covered in this conversation. This will be a complete, interview-ready reference following your formatting rules.

## TOPIC: C++ Object-Oriented Programming - Complete Interview Guide

### THEORY_SECTION: Foundational OOP Concepts in C++

#### Understanding C++ OOP Paradigms

C++ supports multiple programming paradigms, with **Object-Oriented Programming (OOP)** being central to its design. OOP in C++ revolves around encapsulation (bundling data and methods), inheritance (deriving new classes from existing ones), and polymorphism (using common interfaces for different implementations). Classes and structures serve as blueprints for objects, with the only syntactic difference being default access specifiers: `class` members default to private, while `struct` members default to public. This distinction is purely conventional—both support the full feature set of OOP including constructors, destructors, inheritance, and virtual functions.

The power of C++ OOP lies in its support for **compile-time and runtime polymorphism**. Compile-time polymorphism is achieved through function overloading, operator overloading, and templates, resolved at compile time. Runtime polymorphism uses virtual functions and vtables, enabling dynamic dispatch where the actual function called depends on the object's runtime type, not the pointer/reference type. This flexibility makes C++ suitable for everything from systems programming requiring zero-overhead abstractions to complex object hierarchies in game engines and GUIs.

#### Resource Management and Special Member Functions

Modern C++ demands careful resource management through special member functions: constructors (default, parameterized, copy, move), assignment operators (copy, move), and destructors. These functions control object lifetime, copying semantics, and resource ownership. The **Rule of Three** states that if a class manages resources requiring a destructor, it likely needs custom copy constructor and copy assignment. C++11's move semantics extended this to the **Rule of Five**, adding move constructor and move assignment for efficient resource transfer. The **Rule of Zero** advocates using RAII wrappers (smart pointers, standard containers) to avoid defining any special members, letting the compiler handle everything correctly. Understanding when to follow which rule is crucial for writing safe, efficient C++ code that avoids resource leaks, double-deletion, and undefined behavior.

### EDGE_CASES: Advanced OOP Scenarios and Pitfalls

#### Edge Case 1: Virtual Functions in Constructors and Destructors

Calling virtual functions from constructors or destructors doesn't work as expected due to how objects are constructed. During base class construction, the derived portion doesn't exist yet, so the vptr points to the base class vtable. Calling a pure virtual function from a constructor causes undefined behavior, often crashing.

```cpp
class Base {
public:
    Base() {
        init();  // ❌ Dangerous: calls pure virtual during construction
    }
    virtual void init() = 0;
};

class Derived : public Base {
public:
    void init() override {
        std::cout << "Derived init\n";
    }
};

int main() {
    Derived d;  // ❌ Undefined behavior or crash
}
```

During Base construction, the object's type is Base, not Derived. The vptr points to Base's vtable which has an invalid entry for the pure virtual init(). Attempting to call it accesses an invalid pointer. Never call virtual functions from constructors or destructors—use two-phase initialization instead.

#### Edge Case 2: Multiple Definitions of Special Members

When you define some special members but not others, the compiler's generation rules create subtle interdependencies. Defining a destructor suppresses automatic move operation generation. Defining a move constructor suppresses copy operation generation. These rules changed between C++ standards, creating version-dependent behavior.

```cpp
class Problem {
public:
    ~Problem() {}  // ❌ User-defined destructor
    // Move constructor/assignment NOT generated
    // Copy operations still generated (deprecated)
};

static_assert(!std::is_move_constructible_v<Problem>);
// Problem is not move-constructible despite appearing default

class Fixed {
public:
    ~Fixed() {}
    Fixed(Fixed&&) = default;  // ✅ Explicitly default move
    Fixed& operator=(Fixed&&) = default;
    Fixed(const Fixed&) = default;  // ✅ Explicitly default copy
    Fixed& operator=(const Fixed&) = default;
};
```

The automatic generation rules are complex and changed over C++ versions for backward compatibility. Following Rule of Five by explicitly defaulting or deleting all five special members eliminates ambiguity and makes intent clear.

#### Edge Case 3: Private Copy with Public Move

An unusual but valid pattern is making a class copyable only internally (private copy operations) while publicly movable. This enforces single ownership while allowing controlled internal duplication.

```cpp
class SemiUnique {
private:
    std::unique_ptr<int> data;
    
    SemiUnique(const SemiUnique& other)  // ✅ Private copy
        : data(std::make_unique<int>(*other.data)) {}
    
public:
    SemiUnique(int value) : data(std::make_unique<int>(value)) {}
    
    SemiUnique(SemiUnique&&) = default;  // ✅ Public move
    SemiUnique& operator=(SemiUnique&&) = default;
    
    friend SemiUnique duplicate(const SemiUnique& obj) {
        return obj;  // ✅ Friend can use private copy
    }
};
```

This pattern is useful for types that should generally transfer ownership but need controlled duplication through specific APIs. It prevents accidental copying while preserving move semantics.

#### Edge Case 4: Derived Class Cannot Override Non-Virtual Destructor

Even if a derived class defines its own destructor, without a virtual base destructor, the derived destructor won't be called when deleting through a base pointer. This is a critical source of resource leaks.

```cpp
class Base {
public:
    ~Base() { std::cout << "~Base\n"; }  // ❌ Not virtual
};

class Derived : public Base {
    int* largeArray;
public:
    Derived() : largeArray(new int[10000]) {}
    ~Derived() {
        delete[] largeArray;  // ❌ Never called through base pointer
        std::cout << "~Derived\n";
    }
};

int main() {
    Base* ptr = new Derived();
    delete ptr;  // Only prints "~Base", leaks largeArray
}
```

The fix is simple: make Base's destructor virtual. This enables proper polymorphic destruction through the vtable mechanism. Many coding standards require virtual destructors for all polymorphic base classes.

#### Edge Case 5: Implicit Conversions and Explicit Constructors

Single-parameter constructors act as implicit conversion functions unless marked `explicit`. This can cause surprising behavior in overload resolution and function calls.

```cpp
class String {
public:
    String(const char* str);  // ❌ Allows implicit conversion
};

void process(String s);

process("hello");  // Implicitly converts const char* to String

class SafeString {
public:
    explicit SafeString(const char* str);  // ✅ Requires explicit construction
};

void process2(SafeString s);

// process2("hello");  // ❌ Error: no implicit conversion
process2(SafeString("hello"));  // ✅ OK: explicit construction
```

Mark single-parameter constructors `explicit` unless implicit conversion is genuinely desired and makes semantic sense. Copy and move constructors are exempt from this guideline as their implicit behavior is expected.

#### Edge Case 6: Name Hiding in Inheritance

When a derived class defines a function with the same name as a base function (but different signature), it hides all base overloads of that name. This is function hiding, not overloading, and can cause confusing behavior.

```cpp
class Base {
public:
    virtual void func(int x) { std::cout << "Base::func(int)\n"; }
    virtual void func(double x) { std::cout << "Base::func(double)\n"; }
};

class Derived : public Base {
public:
    void func(int x) override { std::cout << "Derived::func(int)\n"; }
    // Base::func(double) is hidden, not overridden
};

int main() {
    Derived d;
    d.func(42);     // ✅ Calls Derived::func(int)
    // d.func(3.14);  // ❌ Error: no matching function
    
    Base* b = &d;
    b->func(3.14);  // ✅ Calls Base::func(double) via vtable
}
```

To bring hidden base functions into scope, use a `using` declaration: `using Base::func;`. This restores overload resolution while allowing selective overriding.

### CODE_EXAMPLES: Practical OOP Patterns and Implementations

#### Example 1: Complete Rule of Five Implementation

```cpp
class ResourceManager {
    int* data;
    size_t size;
    
public:
    // Constructor
    ResourceManager(size_t n) : size(n), data(new int[n]) {
        std::cout << "Constructed with size " << size << "\n";
    }
    
    // ✅ Copy constructor - deep copy
    ResourceManager(const ResourceManager& other) 
        : size(other.size), data(new int[other.size]) {
        std::copy(other.data, other.data + size, data);
        std::cout << "Copy constructed\n";
    }
    
    // ✅ Copy assignment - deep copy with self-assignment check
    ResourceManager& operator=(const ResourceManager& other) {
        if (this != &other) {
            delete[] data;
            size = other.size;
            data = new int[size];
            std::copy(other.data, other.data + size, data);
            std::cout << "Copy assigned\n";
        }
        return *this;
    }
    
    // ✅ Move constructor - transfer ownership
    ResourceManager(ResourceManager&& other) noexcept
        : size(other.size), data(other.data) {
        other.data = nullptr;
        other.size = 0;
        std::cout << "Move constructed\n";
    }
    
    // ✅ Move assignment - transfer ownership
    ResourceManager& operator=(ResourceManager&& other) noexcept {
        if (this != &other) {
            delete[] data;
            data = other.data;
            size = other.size;
            other.data = nullptr;
            other.size = 0;
            std::cout << "Move assigned\n";
        }
        return *this;
    }
    
    // ✅ Destructor
    ~ResourceManager() {
        delete[] data;
        std::cout << "Destroyed\n";
    }
};
```

This demonstrates complete Rule of Five implementation with proper resource management, including deep copying for copy operations, ownership transfer for move operations, and self-assignment checks.

#### Example 2: Polymorphic Interface with Virtual Destructor

```cpp
class ILogger {
public:
    virtual void log(const std::string& message) = 0;
    virtual ~ILogger() = default;  // ✅ Virtual destructor
    
protected:
    ILogger() = default;
    ILogger(const ILogger&) = delete;  // ✅ Prevent slicing
    ILogger& operator=(const ILogger&) = delete;
};

class FileLogger : public ILogger {
    std::ofstream file;
public:
    explicit FileLogger(const std::string& filename) {
        file.open(filename, std::ios::app);
    }
    
    void log(const std::string& message) override {
        if (file.is_open()) {
            file << message << "\n";
        }
    }
    
    ~FileLogger() override {
        if (file.is_open()) {
            file.close();
        }
    }
};

class ConsoleLogger : public ILogger {
public:
    void log(const std::string& message) override {
        std::cout << "[LOG] " << message << "\n";
    }
};

void processWithLogger(ILogger& logger) {
    logger.log("Processing started");
    // ... processing logic
    logger.log("Processing completed");
}
```

This shows a clean polymorphic interface with virtual destructor, protected construction to prevent slicing, and deleted copy operations since loggers represent unique resources.

#### Example 3: Move-Only Type Pattern

```cpp
class FileHandle {
    FILE* handle;
    std::string filename;
    
public:
    explicit FileHandle(const std::string& fname) : filename(fname) {
        handle = fopen(fname.c_str(), "r");
        if (!handle) {
            throw std::runtime_error("Cannot open file: " + fname);
        }
    }
    
    // ❌ Delete copy operations - file handles are unique
    FileHandle(const FileHandle&) = delete;
    FileHandle& operator=(const FileHandle&) = delete;
    
    // ✅ Move operations - transfer ownership
    FileHandle(FileHandle&& other) noexcept
        : handle(other.handle), filename(std::move(other.filename)) {
        other.handle = nullptr;
    }
    
    FileHandle& operator=(FileHandle&& other) noexcept {
        if (this != &other) {
            if (handle) fclose(handle);
            handle = other.handle;
            filename = std::move(other.filename);
            other.handle = nullptr;
        }
        return *this;
    }
    
    ~FileHandle() {
        if (handle) {
            fclose(handle);
        }
    }
    
    bool isOpen() const { return handle != nullptr; }
};
```

Move-only types represent unique ownership where duplication doesn't make sense. Deleting copy operations and providing moves enables efficient transfer while preventing accidental duplication.

#### Example 4: Two-Phase Initialization Pattern

```cpp
class DatabaseConnection {
    std::string connectionString;
    bool connected;
    
protected:
    // ✅ Constructor doesn't call virtual functions
    DatabaseConnection(std::string connStr) 
        : connectionString(connStr), connected(false) {
        // No virtual calls here
    }
    
    // ✅ Virtual initialization function
    virtual bool connectImpl() = 0;
    
public:
    bool connect() {
        if (!connected) {
            connected = connectImpl();
        }
        return connected;
    }
    
    bool isConnected() const { return connected; }
    
    virtual ~DatabaseConnection() = default;
};

class MySQLConnection : public DatabaseConnection {
public:
    MySQLConnection(std::string connStr) 
        : DatabaseConnection(connStr) {}
    
protected:
    bool connectImpl() override {
        std::cout << "Connecting to MySQL...\n";
        // Actual MySQL connection logic
        return true;
    }
};

int main() {
    MySQLConnection conn("localhost:3306");
    conn.connect();  // ✅ Safe: called after construction
}
```

Two-phase initialization separates construction from virtual initialization, avoiding the problem of calling virtual functions from constructors.

#### Example 5: Virtual Clone Pattern

```cpp
class Shape {
public:
    virtual std::unique_ptr<Shape> clone() const = 0;
    virtual void draw() const = 0;
    virtual ~Shape() = default;
    
protected:
    Shape() = default;
    Shape(const Shape&) = default;
};

class Circle : public Shape {
    double radius;
public:
    explicit Circle(double r) : radius(r) {}
    
    std::unique_ptr<Shape> clone() const override {
        return std::make_unique<Circle>(*this);
    }
    
    void draw() const override {
        std::cout << "Drawing circle with radius " << radius << "\n";
    }
};

class Rectangle : public Shape {
    double width, height;
public:
    Rectangle(double w, double h) : width(w), height(h) {}
    
    std::unique_ptr<Shape> clone() const override {
        return std::make_unique<Rectangle>(*this);
    }
    
    void draw() const override {
        std::cout << "Drawing rectangle " << width << "x" << height << "\n";
    }
};

std::vector<std::unique_ptr<Shape>> cloneShapes(
    const std::vector<std::unique_ptr<Shape>>& shapes) {
    std::vector<std::unique_ptr<Shape>> clones;
    for (const auto& shape : shapes) {
        clones.push_back(shape->clone());  // ✅ Polymorphic copying
    }
    return clones;
}
```

The virtual clone pattern provides polymorphic copying for class hierarchies where copy constructors would cause slicing. Each derived class knows how to clone itself correctly.

#### Example 6: Private Destructor Singleton Pattern

```cpp
class ConfigManager {
private:
    static ConfigManager* instance;
    std::map<std::string, std::string> config;
    
    // ✅ Private constructor and destructor
    ConfigManager() {
        std::cout << "ConfigManager created\n";
    }
    
    ~ConfigManager() {
        std::cout << "ConfigManager destroyed\n";
    }
    
    // ❌ Delete copy and move
    ConfigManager(const ConfigManager&) = delete;
    ConfigManager& operator=(const ConfigManager&) = delete;
    ConfigManager(ConfigManager&&) = delete;
    ConfigManager& operator=(ConfigManager&&) = delete;
    
public:
    static ConfigManager& getInstance() {
        static ConfigManager instance;
        return instance;
    }
    
    void set(const std::string& key, const std::string& value) {
        config[key] = value;
    }
    
    std::string get(const std::string& key) const {
        auto it = config.find(key);
        return it != config.end() ? it->second : "";
    }
};

// ConfigManager* ConfigManager::instance = nullptr;

int main() {
    ConfigManager& config = ConfigManager::getInstance();
    config.set("app_name", "MyApp");
    std::cout << config.get("app_name") << "\n";
    
    // ConfigManager c = config;  // ❌ Error: deleted
}
```

The Singleton pattern uses private destructor (or deleted in modern C++) and deleted copy/move operations to ensure exactly one instance exists and is never duplicated.

#### Example 7: Abstract Factory with Virtual Constructor Pattern

```cpp
class Document {
public:
    virtual void open() = 0;
    virtual void save() = 0;
    virtual void close() = 0;
    virtual ~Document() = default;
};

class PDFDocument : public Document {
public:
    void open() override { std::cout << "Opening PDF\n"; }
    void save() override { std::cout << "Saving PDF\n"; }
    void close() override { std::cout << "Closing PDF\n"; }
};

class WordDocument : public Document {
public:
    void open() override { std::cout << "Opening Word doc\n"; }
    void save() override { std::cout << "Saving Word doc\n"; }
    void close() override { std::cout << "Closing Word doc\n"; }
};

class DocumentFactory {
public:
    enum class Type { PDF, WORD };
    
    // ✅ Virtual constructor pattern via factory method
    static std::unique_ptr<Document> create(Type type) {
        switch (type) {
            case Type::PDF:
                return std::make_unique<PDFDocument>();
            case Type::WORD:
                return std::make_unique<WordDocument>();
            default:
                return nullptr;
        }
    }
    
    virtual ~DocumentFactory() = default;
};

int main() {
    auto doc = DocumentFactory::create(DocumentFactory::Type::PDF);
    doc->open();
    doc->save();
    doc->close();
}
```

The factory pattern provides a "virtual constructor" mechanism through static factory methods, enabling object creation without exposing concrete classes.

#### Example 8: RAII and Rule of Zero

```cpp
class ModernResourceManager {
    std::unique_ptr<int[]> data;  // ✅ Smart pointer manages memory
    std::vector<std::string> strings;  // ✅ Vector manages elements
    size_t capacity;
    
public:
    explicit ModernResourceManager(size_t n) 
        : data(std::make_unique<int[]>(n)), capacity(n) {
        strings.reserve(n);
    }
    
    // ✅ No special member functions needed
    // Compiler generates correct copy/move/destructor
    // based on members (unique_ptr is move-only, so class is move-only)
    
    void addString(const std::string& str) {
        strings.push_back(str);
    }
    
    int* getData() { return data.get(); }
    size_t size() const { return strings.size(); }
};

// Usage demonstrates automatic resource management
ModernResourceManager createManager() {
    return ModernResourceManager(100);  // ✅ Move, not copy
}
```

Following Rule of Zero with RAII types eliminates manual resource management. The compiler-generated special members correctly handle ownership based on member types.

#### Example 9: Autonomous Vehicle - Complete OOP System with Polymorphism and Resource Management

```cpp
#include <iostream>
#include <memory>
#include <vector>
#include <string>
#include <cmath>
using namespace std;

// ========= Abstract Base for Vehicle Systems =========

class IVehicleSystem {
public:
    virtual bool initialize() = 0;
    virtual void update(double dt) = 0;
    virtual string getStatus() const = 0;
    virtual ~IVehicleSystem() = default;  // ✅ Virtual destructor

protected:
    IVehicleSystem() = default;
    IVehicleSystem(const IVehicleSystem&) = delete;  // ✅ Prevent slicing
    IVehicleSystem& operator=(const IVehicleSystem&) = delete;
};

// ========= Perception System (Move-Only Type) =========

class PerceptionSystem : public IVehicleSystem {
private:
    double* point_cloud_data;  // Raw pointer to large data buffer
    size_t data_size;
    bool initialized;
    string status;

public:
    explicit PerceptionSystem(size_t buffer_size)
        : data_size(buffer_size), initialized(false), status("uninitialized") {
        point_cloud_data = new double[data_size];
        cout << "PerceptionSystem: Allocated " << data_size << " doubles\n";
    }

    // ✅ Destructor
    ~PerceptionSystem() override {
        delete[] point_cloud_data;
        cout << "PerceptionSystem: Freed resources\n";
    }

    // ❌ Delete copy operations - system is unique
    PerceptionSystem(const PerceptionSystem&) = delete;
    PerceptionSystem& operator=(const PerceptionSystem&) = delete;

    // ✅ Move constructor
    PerceptionSystem(PerceptionSystem&& other) noexcept
        : point_cloud_data(other.point_cloud_data),
          data_size(other.data_size),
          initialized(other.initialized),
          status(move(other.status)) {
        other.point_cloud_data = nullptr;
        other.data_size = 0;
        cout << "PerceptionSystem: Moved\n";
    }

    // ✅ Move assignment
    PerceptionSystem& operator=(PerceptionSystem&& other) noexcept {
        if (this != &other) {
            delete[] point_cloud_data;

            point_cloud_data = other.point_cloud_data;
            data_size = other.data_size;
            initialized = other.initialized;
            status = move(other.status);

            other.point_cloud_data = nullptr;
            other.data_size = 0;
        }
        return *this;
    }

    bool initialize() override {
        initialized = true;
        status = "operational";
        cout << "PerceptionSystem: Initialized\n";
        return true;
    }

    void update(double dt) override {
        if (initialized) {
            // Simulate processing point cloud data
            for (size_t i = 0; i < min(data_size, size_t(10)); ++i) {
                point_cloud_data[i] = sin(dt * i);
            }
            status = "processing " + to_string(data_size) + " points";
        }
    }

    string getStatus() const override {
        return "Perception: " + status;
    }
};

// ========= Planning System (Rule of Zero with Smart Pointers) =========

class PlanningSystem : public IVehicleSystem {
private:
    unique_ptr<vector<double>> trajectory;  // ✅ Smart pointer manages memory
    string planner_name;
    bool initialized;

public:
    explicit PlanningSystem(const string& name)
        : trajectory(make_unique<vector<double>>()),
          planner_name(name),
          initialized(false) {
        cout << "PlanningSystem(" << planner_name << "): Created\n";
    }

    // ✅ Rule of Zero - compiler-generated special members work correctly
    // This class is move-only due to unique_ptr member

    ~PlanningSystem() override {
        cout << "PlanningSystem(" << planner_name << "): Destroyed\n";
    }

    bool initialize() override {
        initialized = true;
        trajectory->reserve(100);
        cout << "PlanningSystem(" << planner_name << "): Initialized\n";
        return true;
    }

    void update(double dt) override {
        if (initialized) {
            // Generate trajectory point
            trajectory->push_back(dt * 10.0);
            if (trajectory->size() > 100) {
                trajectory->erase(trajectory->begin());
            }
        }
    }

    string getStatus() const override {
        return "Planning(" + planner_name + "): " +
               to_string(trajectory->size()) + " waypoints";
    }
};

// ========= Control System (With Copy and Move) =========

class ControlSystem : public IVehicleSystem {
private:
    double* pid_coefficients;  // PID controller gains
    size_t num_coeffs;
    string controller_type;
    bool initialized;

public:
    explicit ControlSystem(const string& type, size_t coeffs = 3)
        : num_coeffs(coeffs), controller_type(type), initialized(false) {
        pid_coefficients = new double[num_coeffs]{1.0, 0.1, 0.01};  // P, I, D
        cout << "ControlSystem(" << type << "): Created\n";
    }

    // ✅ Destructor
    ~ControlSystem() override {
        delete[] pid_coefficients;
        cout << "ControlSystem(" << controller_type << "): Destroyed\n";
    }

    // ✅ Copy constructor - deep copy
    ControlSystem(const ControlSystem& other)
        : num_coeffs(other.num_coeffs),
          controller_type(other.controller_type + "_copy"),
          initialized(other.initialized) {
        pid_coefficients = new double[num_coeffs];
        copy(other.pid_coefficients, other.pid_coefficients + num_coeffs, pid_coefficients);
        cout << "ControlSystem: Copy constructed\n";
    }

    // ✅ Copy assignment
    ControlSystem& operator=(const ControlSystem& other) {
        if (this != &other) {
            double* new_coeffs = new double[other.num_coeffs];
            copy(other.pid_coefficients, other.pid_coefficients + other.num_coeffs, new_coeffs);

            delete[] pid_coefficients;
            pid_coefficients = new_coeffs;
            num_coeffs = other.num_coeffs;
            controller_type = other.controller_type;
            initialized = other.initialized;
        }
        return *this;
    }

    // ✅ Move constructor
    ControlSystem(ControlSystem&& other) noexcept
        : pid_coefficients(other.pid_coefficients),
          num_coeffs(other.num_coeffs),
          controller_type(move(other.controller_type)),
          initialized(other.initialized) {
        other.pid_coefficients = nullptr;
        other.num_coeffs = 0;
        cout << "ControlSystem: Moved\n";
    }

    // ✅ Move assignment
    ControlSystem& operator=(ControlSystem&& other) noexcept {
        if (this != &other) {
            delete[] pid_coefficients;

            pid_coefficients = other.pid_coefficients;
            num_coeffs = other.num_coeffs;
            controller_type = move(other.controller_type);
            initialized = other.initialized;

            other.pid_coefficients = nullptr;
            other.num_coeffs = 0;
        }
        return *this;
    }

    bool initialize() override {
        initialized = true;
        cout << "ControlSystem(" << controller_type << "): Initialized\n";
        return true;
    }

    void update(double dt) override {
        if (initialized) {
            // Simulate PID control calculation
            double control_output = pid_coefficients[0] * dt +
                                   pid_coefficients[1] * dt * dt +
                                   pid_coefficients[2];
            // Use control_output...
        }
    }

    string getStatus() const override {
        return "Control(" + controller_type + "): PID active";
    }
};

// ========= Vehicle Manager (Composition and Polymorphism) =========

class AutonomousVehicle {
private:
    vector<unique_ptr<IVehicleSystem>> systems;  // ✅ Polymorphic container
    string vehicle_id;
    double current_time;

public:
    explicit AutonomousVehicle(const string& id)
        : vehicle_id(id), current_time(0.0) {
        cout << "\n=== AutonomousVehicle(" << vehicle_id << "): Constructed ===\n";
    }

    ~AutonomousVehicle() {
        cout << "\n=== AutonomousVehicle(" << vehicle_id << "): Destroyed ===\n";
    }

    // ❌ Delete copy operations - vehicles are unique
    AutonomousVehicle(const AutonomousVehicle&) = delete;
    AutonomousVehicle& operator=(const AutonomousVehicle&) = delete;

    // ✅ Move operations - can transfer vehicle ownership
    AutonomousVehicle(AutonomousVehicle&&) = default;
    AutonomousVehicle& operator=(AutonomousVehicle&&) = default;

    void addSystem(unique_ptr<IVehicleSystem> system) {
        systems.push_back(move(system));  // ✅ Transfer ownership
    }

    void initializeAllSystems() {
        cout << "\n--- Initializing All Systems ---\n";
        for (auto& system : systems) {
            system->initialize();  // ✅ Polymorphic call
        }
    }

    void updateAllSystems(double dt) {
        current_time += dt;
        for (auto& system : systems) {
            system->update(dt);  // ✅ Polymorphic call
        }
    }

    void printStatus() const {
        cout << "\n--- Vehicle " << vehicle_id << " Status (t=" << current_time << "s) ---\n";
        for (const auto& system : systems) {
            cout << "  " << system->getStatus() << endl;  // ✅ Polymorphic call
        }
    }
};

// ========= Main Function - Demonstration =========

int main() {
    cout << "========== Autonomous Vehicle OOP Demo ==========\n";

    {
        // Create vehicle
        AutonomousVehicle vehicle("AV-001");

        // Add systems with polymorphic behavior
        vehicle.addSystem(make_unique<PerceptionSystem>(10000));
        vehicle.addSystem(make_unique<PlanningSystem>("A*"));
        vehicle.addSystem(make_unique<ControlSystem>("Lateral"));
        vehicle.addSystem(make_unique<ControlSystem>("Longitudinal"));

        // Initialize all systems
        vehicle.initializeAllSystems();

        // Simulation loop
        cout << "\n--- Running Simulation ---\n";
        for (int i = 0; i < 3; ++i) {
            vehicle.updateAllSystems(0.1);
        }

        vehicle.printStatus();

        cout << "\n--- Demonstrating Copy/Move Semantics ---\n";

        // ControlSystem supports copying
        ControlSystem ctrl1("Test", 3);
        ctrl1.initialize();
        ControlSystem ctrl2 = ctrl1;  // ✅ Copy constructed

        // PerceptionSystem is move-only
        PerceptionSystem perc1(100);
        perc1.initialize();
        // PerceptionSystem perc2 = perc1;  // ❌ Error: copy deleted
        PerceptionSystem perc2 = move(perc1);  // ✅ Moved

        cout << "\n--- Scope Ends, Destructors Called ---\n";
    }  // All objects destroyed here with proper cleanup

    cout << "\n========== Demo Complete ==========\n";
    return 0;
}
```

**Expected Output:**
```
========== Autonomous Vehicle OOP Demo ==========

=== AutonomousVehicle(AV-001): Constructed ===
PerceptionSystem: Allocated 10000 doubles
PlanningSystem(A*): Created
ControlSystem(Lateral): Created
ControlSystem(Longitudinal): Created

--- Initializing All Systems ---
PerceptionSystem: Initialized
PlanningSystem(A*): Initialized
ControlSystem(Lateral): Initialized
ControlSystem(Longitudinal): Initialized

--- Running Simulation ---

--- Vehicle AV-001 Status (t=0.3s) ---
  Perception: processing 10000 points
  Planning(A*): 3 waypoints
  Control(Lateral): PID active
  Control(Longitudinal): PID active

--- Demonstrating Copy/Move Semantics ---
ControlSystem(Test): Created
ControlSystem(Test): Initialized
ControlSystem: Copy constructed
PerceptionSystem: Allocated 100 doubles
PerceptionSystem: Initialized
PerceptionSystem: Moved

--- Scope Ends, Destructors Called ---
PerceptionSystem: Freed resources
PerceptionSystem: Freed resources
ControlSystem(Test_copy): Destroyed
ControlSystem(Test): Destroyed

=== AutonomousVehicle(AV-001): Destroyed ===
ControlSystem(Longitudinal): Destroyed
ControlSystem(Lateral): Destroyed
PlanningSystem(A*): Destroyed
PerceptionSystem: Freed resources

========== Demo Complete ==========
```

**What This Complete OOP Example Demonstrates:**

1. **Polymorphic Interface Design**:
   - Abstract base class `IVehicleSystem` defines interface
   - Pure virtual functions enforce implementation contract
   - Virtual destructor ensures proper cleanup through base pointers
   - Protected copy operations prevent slicing

2. **Three Different Resource Management Strategies**:
   - `PerceptionSystem`: Move-only type with raw pointer (Rule of Five, no copy)
   - `PlanningSystem`: Rule of Zero with smart pointers (automatic resource management)
   - `ControlSystem`: Copyable and movable type (full Rule of Five)

3. **Polymorphic Container Usage**:
   - `vector<unique_ptr<IVehicleSystem>>` stores different system types
   - Preserves polymorphic behavior through pointers
   - Automatic cleanup via unique_ptr destructors

4. **Move Semantics Throughout**:
   - `addSystem` uses `move` to transfer ownership
   - Systems can be moved but not copied (unique ownership)
   - Efficient resource transfer without copying

5. **Proper Destructor Chain**:
   - Virtual destructors ensure derived class cleanup
   - RAII pattern guarantees resource release
   - Destruction order: derived → base, reverse of construction

6. **Encapsulation and Data Hiding**:
   - Private data members in each system
   - Public interface for operations
   - Implementation details hidden from users

7. **Real-World Autonomous Vehicle Architecture**:
   - Perception processes sensor data
   - Planning generates trajectories
   - Control executes commands
   - Systems operate independently but coordinate through vehicle manager

**Why This Matters for Autonomous Vehicles**: This example demonstrates production-quality OOP design for autonomous vehicle software. Each system (perception, planning, control) has different resource management needs, properly handled through appropriate special member functions. Polymorphism enables runtime system configuration without code changes, while RAII ensures no resource leaks in safety-critical automotive systems that run continuously.

### INTERVIEW_QA: Comprehensive OOP Questions with Detailed Answers

#### Q1: What is the only difference between struct and class in C++?
**Difficulty:** #beginner  
**Category:** #syntax  
**Concepts:** #class #struct #access_specifiers

**Answer:**
The only difference is the default access specifier: `struct` members default to `public`, while `class` members default to `private`.

**Explanation:**
Both `struct` and `class` in C++ support the complete OOP feature set including inheritance, constructors, destructors, and virtual functions. The distinction is purely syntactic convenience. By convention, `struct` is used for simple data aggregates without behavior, while `class` is used for objects with encapsulated behavior, though C++ doesn't enforce this convention. Both can be used interchangeably with appropriate access specifiers.

**Key takeaway:** Struct and class are identical except for default access; choose based on convention, not capability.

---

#### Q2: What is encapsulation and why is it important?
**Difficulty:** #beginner  
**Category:** #fundamentals #design_pattern  
**Concepts:** #encapsulation #access_specifiers #data_hiding

**Answer:**
Encapsulation bundles data and methods that operate on that data within a class, restricting direct access to internal details through access control.

**Code example:**
```cpp
class BankAccount {
private:
    double balance;  // ✅ Hidden implementation detail
public:
    void deposit(double amount) {
        if (amount > 0) balance += amount;
    }
    double getBalance() const { return balance; }
};
```

**Explanation:**
Encapsulation enforces controlled access to data, preventing external code from violating class invariants. By making `balance` private and providing controlled public methods, the class ensures balance can only change through validated operations. This makes code more maintainable—implementation details can change without affecting external code. It also enables enforcement of business rules and prevents invalid state.

**Key takeaway:** Use encapsulation to hide implementation details and enforce invariants through controlled interfaces.

---

#### Q3: Explain runtime polymorphism using virtual functions.
**Difficulty:** #intermediate  
**Category:** #polymorphism #interview_favorite  
**Concepts:** #virtual_functions #vtable #runtime_dispatch

**Answer:**
Runtime polymorphism allows derived class methods to be called through base class pointers/references, with the actual function determined at runtime via the vtable mechanism.

**Code example:**
```cpp
class Animal {
public:
    virtual void speak() { std::cout << "Animal sound\n"; }
    virtual ~Animal() = default;
};

class Dog : public Animal {
public:
    void speak() override { std::cout << "Woof!\n"; }
};

Animal* animal = new Dog();
animal->speak();  // Prints "Woof!" not "Animal sound"
delete animal;
```

**Explanation:**
The `virtual` keyword creates a vtable entry for the function. Each object with virtual functions has a hidden vptr pointing to its class's vtable. When calling a virtual function through a pointer, the call goes through the vtable, dispatching to the actual object's override. This enables polymorphic behavior where the same interface works with different implementations, fundamental to plugin systems, GUI frameworks, and extensible architectures.

**Key takeaway:** Virtual functions enable runtime polymorphism through vtable dispatch; always use virtual destructors in polymorphic bases.

---

#### Q4: What are the vtable and vptr?
**Difficulty:** #intermediate  
**Category:** #memory #interview_favorite  
**Concepts:** #vtable #vptr #virtual_functions #polymorphism

**Answer:**
The vtable is a per-class lookup table of virtual function pointers, and the vptr is a hidden pointer in each object pointing to its class's vtable.

**Explanation:**
When a class has virtual functions, the compiler creates a static vtable containing function pointers for each virtual function. Every object of that class contains a hidden vptr (typically at the start of the object) pointing to the class's vtable. When calling a virtual function, the code looks up the function pointer in the vtable via the vptr and calls it, enabling runtime dispatch. This mechanism adds one pointer per object (8 bytes on 64-bit) but enables powerful polymorphism.

**Key takeaway:** Vtable and vptr enable efficient runtime polymorphism with minimal per-object overhead.

---

#### Q5: What makes a class abstract and what is its purpose?
**Difficulty:** #intermediate  
**Category:** #syntax #design_pattern  
**Concepts:** #abstract_class #pure_virtual #interface

**Answer:**
A class becomes abstract when it contains at least one pure virtual function (declared with `= 0`), making it non-instantiable and serving as an interface contract.

**Code example:**
```cpp
class IShape {
public:
    virtual double area() const = 0;  // Pure virtual
    virtual void draw() const = 0;
    virtual ~IShape() = default;
};

// IShape s;  // ❌ Error: cannot instantiate abstract class
```

**Explanation:**
Abstract classes define interfaces that derived classes must implement. They cannot be instantiated directly, enforcing that users work with concrete implementations. Pure virtual functions must be overridden in derived classes before those classes can be instantiated. This pattern enables dependency inversion, where high-level code depends on abstractions rather than concrete types, making systems more flexible and testable.

**Key takeaway:** Use abstract classes to define interfaces and enforce implementation contracts in derived classes.

---

#### Q6: When is a copy constructor called versus copy assignment?
**Difficulty:** #beginner  
**Category:** #syntax  
**Concepts:** #copy_constructor #assignment_operator #initialization

**Answer:**
Copy constructor is called during initialization of a new object from an existing one; copy assignment is called when assigning to an already-existing object.

**Code example:**
```cpp
MyClass a;
MyClass b = a;  // ✅ Copy constructor (initialization)
MyClass c(a);   // ✅ Copy constructor (explicit)
MyClass d;
d = a;          // ✅ Copy assignment (existing object)
```

**Explanation:**
The key distinction is whether the target object exists. Copy constructor creates a new object, so there's no previous state to clean up. Copy assignment modifies an existing object, requiring cleanup of old resources before copying new ones and checking for self-assignment. The syntax `=` during declaration is initialization (copy constructor), not assignment. Understanding this difference is crucial for implementing Rule of Three/Five correctly.

**Key takeaway:** Copy constructor creates new objects; copy assignment modifies existing objects requiring cleanup.

---

#### Q7: Explain the Rule of Three, Five, and Zero.
**Difficulty:** #intermediate  
**Category:** #design_pattern #interview_favorite  
**Concepts:** #rule_of_three #rule_of_five #rule_of_zero #resource_management

**Answer:**
Rule of Three: if you define destructor, copy constructor, or copy assignment, define all three. Rule of Five adds move constructor and move assignment. Rule of Zero: use RAII wrappers to avoid defining any.

**Explanation:**
The Rule of Three exists because if you need one of these functions, you're managing a resource requiring special handling. Defining only one creates inconsistent semantics—copy might be shallow while destruction releases resources, causing double-deletion. C++11's Rule of Five adds move operations for efficiency. Rule of Zero is the modern ideal: use smart pointers and standard containers that handle their own resources, letting the compiler generate correct special members. Following these rules prevents resource leaks and undefined behavior.

**Key takeaway:** Follow Rule of Five for resource-managing classes or Rule of Zero by using RAII wrappers.

---

#### Q8: Why must base class destructors be virtual?
**Difficulty:** #intermediate  
**Category:** #memory #interview_favorite  
**Concepts:** #virtual_destructors #polymorphism #undefined_behavior

**Answer:**
Virtual destructors ensure derived class destructors are called when deleting through base pointers, preventing resource leaks and undefined behavior.

**Code example:**
```cpp
class Base {
public:
    virtual ~Base() = default;  // ✅ Virtual
};

class Derived : public Base {
    int* data;
public:
    Derived() : data(new int[100]) {}
    ~Derived() override { delete[] data; }
};

Base* ptr = new Derived();
delete ptr;  // ✅ Calls ~Derived() then ~Base()
```

**Explanation:**
Without virtual destructors, deleting through a base pointer calls only the base destructor, leaking derived resources and causing undefined behavior. Virtual destructors enable proper destruction through vtable dispatch, ensuring the complete destructor chain executes from most derived to base. This applies even with smart pointers—`std::shared_ptr<Base>` needs a virtual Base destructor for correct cleanup. Always make base class destructors virtual in polymorphic hierarchies.

**Key takeaway:** Always use virtual destructors in polymorphic base classes to ensure proper cleanup through base pointers.

---

#### Q9: Can you delete or make a destructor private?
**Difficulty:** #advanced  
**Category:** #syntax #design_pattern  
**Concepts:** #destructors #deleted_functions #controlled_lifetime

**Answer:**
Yes; deleted destructors prevent any object destruction, while private destructors restrict destruction to class members/friends, useful for controlled lifetime patterns.

**Code example:**
```cpp
class NoDestroy {
    ~NoDestroy() = delete;  // ❌ Cannot destroy anywhere
};

class ControlledLifetime {
private:
    ~ControlledLifetime() {}  // ❌ Cannot destroy externally
public:
    static ControlledLifetime* create() { return new ControlledLifetime(); }
    void destroy() { delete this; }
};
```

**Explanation:**
Deleted destructors prevent objects from being destroyed by any means, useful for types that should never be deallocated (e.g., singletons, memory-mapped objects). Private destructors allow destruction only through class methods or friends, enforcing factory patterns or reference-counted lifetimes. Singleton patterns often use private destructors to prevent external deletion. These are advanced techniques for specialized lifetime management.

**Key takeaway:** Use deleted/private destructors to enforce controlled object lifetimes in specialized scenarios.

---

#### Q10: What is object slicing and why is it dangerous?
**Difficulty:** #intermediate  
**Category:** #inheritance #interview_favorite  
**Concepts:** #object_slicing #polymorphism #copy_constructor

**Answer:**
Object slicing occurs when copying a derived class object to a base class object by value, discarding the derived portion and destroying polymorphic behavior.

**Code example:**
```cpp
class Base {
public:
    int x;
    virtual void func() { std::cout << "Base\n"; }
};

class Derived : public Base {
public:
    int y;
    void func() override { std::cout << "Derived\n"; }
};

void process(Base b) {  // ❌ Pass by value
    b.func();  // Always prints "Base"
}

Derived d;
d.y = 42;
process(d);  // Slicing: y lost, vtable changed
```

**Explanation:**
Slicing physically copies only the base portion of an object, losing derived members and changing the vtable pointer to point to the base class table. This eliminates polymorphism and can cause resource leaks if destructors aren't virtual. Slicing happens during pass-by-value, container insertion, and assignment to base type. Always pass polymorphic objects by pointer or reference to preserve their full type and behavior.

**Key takeaway:** Prevent slicing by passing polymorphic objects by reference or pointer, never by value.

---

#### Q11: Can constructors be virtual?
**Difficulty:** #beginner  
**Category:** #syntax  
**Concepts:** #constructors #virtual_functions #vtable

**Answer:**
No, constructors cannot be virtual because virtual dispatch requires the vptr to exist, which is set up during construction.

**Explanation:**
Virtual function calls use the vptr to look up the function in the vtable. However, constructors are responsible for creating the vptr in the first place. During construction, the object's type progresses through the inheritance hierarchy (base to derived), with the vptr pointing to each class's vtable in turn. There's no complete object yet for virtual dispatch to work on. The virtual constructor pattern is instead implemented using factory methods that return polymorphic types.

**Key takeaway:** Constructors cannot be virtual; use factory methods to achieve virtual construction.

---

#### Q12: What happens if you define only a copy constructor but not copy assignment?
**Difficulty:** #intermediate  
**Category:** #syntax  
**Concepts:** #copy_constructor #assignment_operator #compiler_generated

**Answer:**
If only the copy constructor is defined, the compiler still generates a default copy assignment operator performing memberwise copy.

**Explanation:**
Pre-C++11, defining a copy constructor didn't suppress copy assignment generation. However, this creates inconsistent copying semantics—the copy constructor might do deep copy while the generated assignment does shallow copy. This is dangerous for resource-managing classes. Modern C++ deprecates this behavior. Best practice: define both copy constructor and assignment together (Rule of Three), or delete both if copying shouldn't be allowed, or use Rule of Zero with RAII wrappers.

**Key takeaway:** Define copy constructor and copy assignment together to ensure consistent copying semantics.

---

#### Q13: When does copy elision occur?
**Difficulty:** #intermediate  
**Category:** #optimization  
**Concepts:** #copy_elision #rvo #nrvo

**Answer:**
Copy elision optimizes away copy/move operations by constructing objects directly in their final location; C++17 makes it mandatory for returning temporaries (RVO).

**Code example:**
```cpp
MyClass create() {
    return MyClass();  // ✅ C++17: guaranteed elision
}

MyClass create2() {
    MyClass local;
    return local;  // ⚠️ NRVO: optional elision
}
```

**Explanation:**
Return Value Optimization (RVO) eliminates copies when returning temporaries, made mandatory in C++17. Named Return Value Optimization (NRVO) applies to local variables but is optional. Copy elision can occur even if copy/move constructors are deleted because no constructor call happens—the object is constructed directly in the caller's memory. This fundamentally changes semantics compared to pre-C++17, where constructors had to exist even if elided.

**Key takeaway:** C++17 guarantees copy elision for temporaries; trust the compiler and return local objects naturally.

---

#### Q14: How does const affect move constructor selection?
**Difficulty:** #intermediate  
**Category:** #syntax  
**Concepts:** #move_semantics #const #rvalue_reference

**Answer:**
Move constructors require non-const rvalues (`T&&`); const objects cannot be moved, so attempting to move them selects the copy constructor instead.

**Code example:**
```cpp
class MyClass {
public:
    MyClass(const MyClass&) { std::cout << "Copy\n"; }
    MyClass(MyClass&&) { std::cout << "Move\n"; }
};

const MyClass a;
MyClass b = std::move(a);  // Prints "Copy", not "Move"
```

**Explanation:**
Move semantics involve transferring resources and leaving the source in a valid but unspecified state. This requires modifying the source object, incompatible with const. When you attempt to move a const object, the move constructor signature `T(T&&)` doesn't match `const T`, so overload resolution falls back to the copy constructor `T(const T&)`. This is by design—const objects guarantee immutability, preventing moves.

**Key takeaway:** Const objects cannot be moved; std::move on const objects selects copy constructor.

---

#### Q15: What is the purpose of marking move operations noexcept?
**Difficulty:** #intermediate  
**Category:** #performance #interview_favorite  
**Concepts:** #move_semantics #noexcept #exception_safety

**Answer:**
Marking move operations noexcept enables optimal container performance because standard containers only use moves if they're guaranteed not to throw.

**Code example:**
```cpp
class Optimized {
public:
    Optimized(Optimized&&) noexcept;  // ✅ Container uses move
    Optimized& operator=(Optimized&&) noexcept;
};

class Pessimized {
public:
    Optimized(Optimized&&);  // ❌ Container copies instead
};
```

**Explanation:**
When std::vector grows, it must move elements to new storage. If moves can throw, strong exception safety is impossible—a failure mid-move leaves elements in inconsistent state. Therefore, vector only uses moves if they're noexcept, falling back to copies otherwise. Since most move operations just swap pointers and cannot throw, marking them noexcept is free performance. Forgetting noexcept on moves causes containers to copy instead of move, defeating the performance benefit.

**Key takeaway:** Always mark move operations noexcept when possible to enable container optimizations.

---

#### Q16: Can you have a class that is copyable but not movable?
**Difficulty:** #intermediate  
**Category:** #syntax  
**Concepts:** #copy_constructor #move_semantics #deleted_functions

**Answer:**
Yes, by explicitly deleting move operations while keeping copy operations available, though this is unusual since moves are typically optimizations over copies.

**Code example:**
```cpp
class CopyOnly {
public:
    CopyOnly(const CopyOnly&) = default;
    CopyOnly& operator=(const CopyOnly&) = default;
    CopyOnly(CopyOnly&&) = delete;
    CopyOnly& operator=(CopyOnly&&) = delete;
};
```

**Explanation:**
This pattern is rare because if copying is safe and allowed, moving should also be safe and more efficient. However, you might delete moves if moving would violate class invariants or if you want to force observable copy behavior for debugging or testing. When moves are deleted but copies exist, operations that would use moves fall back to copying, potentially impacting performance but maintaining functionality.

**Key takeaway:** Copy-only types are possible but unusual; typically enable both or neither.

---

#### Q17: What is the difference between private and protected inheritance?
**Difficulty:** #beginner  
**Category:** #inheritance  
**Concepts:** #access_specifiers #inheritance #encapsulation

**Answer:**
Private inheritance makes all base class members private in the derived class; protected inheritance makes public base members protected in the derived class.

**Explanation:**
Both private and protected inheritance implement "is-implemented-in-terms-of" relationships rather than "is-a" relationships. With private inheritance, even derived class's subclasses cannot access base class members. With protected inheritance, derived class's subclasses can access base class's public and protected members as protected. Both hide the base class interface from external users. Public inheritance represents "is-a" relationships and is by far the most common.

**Key takeaway:** Use public inheritance for "is-a"; use private/protected inheritance rarely for implementation inheritance.

---

#### Q18: What is the override specifier and why should you use it?
**Difficulty:** #beginner  
**Category:** #syntax  
**Concepts:** #override #virtual_functions #error_checking

**Answer:**
The override specifier (C++11) explicitly marks that a function is intended to override a base virtual function, causing a compilation error if it doesn't match any base function.

**Code example:**
```cpp
class Base {
public:
    virtual void func(int x);
};

class Derived : public Base {
public:
    void func(int x) override;  // ✅ OK: matches base
    // void func(double x) override;  // ❌ Error: doesn't match
};
```

**Explanation:**
Without override, mismatches in signature (different parameters, const-ness, etc.) silently create a new function instead of overriding. This leads to confusing bugs where virtual dispatch doesn't work as expected. The override keyword catches these mistakes at compile time, documenting intent and preventing common errors. Modern C++ guidelines recommend always using override on virtual function overrides.

**Key takeaway:** Always use override on overriding functions to catch signature mismatches at compile time.

---

#### Q19: What is the final specifier and when should you use it?
**Difficulty:** #intermediate  
**Category:** #syntax  
**Concepts:** #final #virtual_functions #optimization

**Answer:**
The final specifier (C++11) prevents further overriding of virtual functions or derivation from classes, enabling optimizations and enforcing design intent.

**Code example:**
```cpp
class Base {
public:
    virtual void func();
};

class Derived final : public Base {  // ✅ Cannot derive from Derived
    void func() override final;  // ✅ Cannot override func further
};

// class MoreDerived : public Derived {};  // ❌ Error
```

**Explanation:**
Marking functions final allows the compiler to devirtualize calls when the object type is known, improving performance by avoiding vtable lookups. Marking classes final prevents further derivation, useful for classes designed to be leaves in the hierarchy. Use final when you've intentionally closed an interface for extension, when you need the performance benefit of devirtualization, or when further derivation would violate class invariants.

**Key takeaway:** Use final to prevent overriding/derivation and enable compiler optimizations when extension isn't intended.

---

#### Q20: What is multiple inheritance and what problems can it cause?
**Difficulty:** #advanced  
**Category:** #inheritance  
**Concepts:** #multiple_inheritance #diamond_problem #virtual_base

**Answer:**
Multiple inheritance allows deriving from multiple base classes, which can cause the diamond problem where a base class appears multiple times in the hierarchy.

**Code example:**
```cpp
class Device { int id; };
class Scanner : public Device {};
class Printer : public Device {};
class Multifunction : public Scanner, public Printer {};
// Multifunction has two Device subobjects (ambiguous)

class Scanner2 : virtual public Device {};  // ✅ Virtual inheritance
class Printer2 : virtual public Device {};
class Multifunction2 : public Scanner2, public Printer2 {};
// Multifunction2 has single Device subobject
```

**Explanation:**
The diamond problem occurs when a class inherits from multiple classes that share a common base. Without virtual inheritance, the derived class gets multiple copies of the base, causing ambiguity and wasted space. Virtual inheritance solves this by ensuring only one shared base subobject, but adds complexity and slight performance overhead. Many C++ guidelines recommend avoiding multiple inheritance except for pure interfaces (classes with only pure virtual functions and no data).

**Key takeaway:** Multiple inheritance can cause diamond problem; use virtual inheritance to share base subobject or prefer interface-only multiple inheritance.

---

### PRACTICE_TASKS: Mixed OOP Concept Output Prediction

#### Q1
```cpp
#include <iostream>

struct S {
    int x;
};

class C {
    int x;
};

int main() {
    S s;
    s.x = 10;
    
    C c;
    c.x = 20;
}
```

#### Q2
```cpp
#include <iostream>

class Base {
public:
    virtual void func() { std::cout << "Base\n"; }
};

class Derived : public Base {
public:
    void func() { std::cout << "Derived\n"; }
};

int main() {
    Base* b = new Derived();
    b->func();
    delete b;
}
```

#### Q3
```cpp
#include <iostream>

class A {
public:
    A() { std::cout << "A\n"; }
    A(const A&) { std::cout << "Copy A\n"; }
    A(A&&) noexcept { std::cout << "Move A\n"; }
};

A create() {
    return A();
}

int main() {
    A a = create();
}
```

#### Q4
```cpp
#include <iostream>

class Base {
public:
    ~Base() { std::cout << "~Base\n"; }
};

class Derived : public Base {
public:
    ~Derived() { std::cout << "~Derived\n"; }
};

int main() {
    Base* ptr = new Derived();
    delete ptr;
}
```

#### Q5
```cpp
#include <iostream>

class A {
public:
    virtual void func() = 0;
};

int main() {
    A a;
}
```

#### Q6
```cpp
#include <iostream>

class A {
public:
    A(const A&) { std::cout << "Copy\n"; }
};

int main() {
    A a1;
    A a2 = a1;
    a2 = a1;
}
```

#### Q7
```cpp
#include <iostream>

class Base {
public:
    virtual void func() { std::cout << "Base\n"; }
};

class Derived : public Base {
public:
    void func() override { std::cout << "Derived\n"; }
};

int main() {
    Derived d;
    Base b = d;
    b.func();
}
```

#### Q8
```cpp
#include <iostream>

class A {
    int* data;
public:
    A() : data(new int(42)) {}
    ~A() { delete data; }
};

int main() {
    A a1;
    A a2 = a1;
}
```

#### Q9
```cpp
#include <iostream>

class A {
public:
    A(A&&) { std::cout << "Move\n"; }
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
private:
    ~A() {}
public:
    static A* create() { return new A(); }
    void destroy() { delete this; }
};

int main() {
    A* a = A::create();
    a->destroy();
}
```

#### Q11
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

#### Q12
```cpp
#include <iostream>

class A {
public:
    A& operator=(const A&) {
        std::cout << "Copy assign\n";
        return *this;
    }
};

int main() {
    A a1, a2;
    a1 = std::move(a2);
}
```

#### Q13
```cpp
#include <iostream>

class Base {
public:
    virtual ~Base() = default;
    virtual void func() = 0;
};

class Derived : public Base {
public:
    void func() override { std::cout << "Derived\n"; }
};

int main() {
    Base* b = new Derived();
    b->func();
    delete b;
}
```

#### Q14
```cpp
#include <iostream>

class A {
public:
    A() { std::cout << "A()\n"; }
    A(const A&) { std::cout << "Copy\n"; }
};

void func(A a) {}

int main() {
    A a;
    func(a);
}
```

#### Q15
```cpp
#include <iostream>

class A {
public:
    virtual void func() { std::cout << "A\n"; }
};

class B : public A {
public:
    void func() override final { std::cout << "B\n"; }
};

class C : public B {
public:
    void func() override { std::cout << "C\n"; }
};
```

#### Q16
```cpp
#include <iostream>

class Base {
public:
    Base() { init(); }
    virtual void init() = 0;
};

class Derived : public Base {
public:
    void init() override { std::cout << "Derived init\n"; }
};

int main() {
    Derived d;
}
```

#### Q17
```cpp
#include <iostream>

class A {
public:
    A() = default;
    ~A() {}
};

int main() {
    A a1;
    A a2 = std::move(a1);
}
```

#### Q18
```cpp
#include <iostream>

struct Base {
    int x;
};

struct Derived : Base {
    int y;
};

int main() {
    Derived d{1, 2};
    Base b = d;
    std::cout << b.x << "\n";
}
```

#### Q19
```cpp
#include <iostream>

class A {
public:
    explicit A(int) {}
};

void func(A a) {}

int main() {
    func(42);
}
```

#### Q20
```cpp
#include <iostream>

class A {
    int* data;
public:
    A(int x) : data(new int(x)) {}
    A(const A& other) = default;
    A& operator=(const A& other) = default;
    ~A() { delete data; }
};

int main() {
    A a1(10);
    A a2 = a1;
}
```

### QUICK_REFERENCE: Answer Keys and Summary Tables

#### Answer Key for Practice Questions

| Q# | Answer | Explanation | Key Concept |
|----|--------|-------------|-------------|
| 1 | Compilation Error | s.x is accessible (struct defaults public), c.x is private (class defaults private) | #access_specifiers |
| 2 | Derived | Virtual function dispatch through base pointer calls Derived's override | #polymorphism #virtual_functions |
| 3 | A<br>(likely) | C++17 copy elision constructs directly without calling copy or move | #copy_elision #rvo |
| 4 | ~Base | Non-virtual destructor causes only Base destructor to run, leaking Derived resources | #virtual_destructors #undefined_behavior |
| 5 | Compilation Error | Cannot instantiate abstract class with pure virtual function | #abstract_class #pure_virtual |
| 6 | Compilation Error | No default constructor; a1 construction fails | #default_constructor |
| 7 | Base | Object slicing: d copied to b loses Derived part, calls Base::func | #object_slicing |
| 8 | Runtime Error | Shallow copy causes double-delete when a1 and a2 destroyed | #shallow_copy #rule_of_three |
| 9 | Compilation Error | Move constructor defined but no copy constructor; cannot copy a1 | #copy_constructor #move_semantics |
| 10 | (No output) | Private destructor controlled lifetime pattern works correctly | #private_destructor #controlled_lifetime |
| 11 | Compiles (C++17) | Mandatory copy elision allows compilation despite deleted copy constructor | #copy_elision #cpp17 |
| 12 | Copy assign | No move assignment defined; std::move falls back to copy assignment | #move_assignment #copy_assignment |
| 13 | Derived | Virtual function and virtual destructor work correctly for polymorphic behavior | #polymorphism #virtual_destructors |
| 14 | A()<br>Copy | Pass by value invokes copy constructor | #copy_constructor #pass_by_value |
| 15 | Compilation Error | final prevents further overriding; C's override attempt fails | #final #override |
| 16 | Undefined Behavior | Calling pure virtual from constructor causes UB or crash | #pure_virtual #constructors #undefined_behavior |
| 17 | Compilation Error | User-defined destructor suppresses move constructor generation | #move_constructor #compiler_generated |
| 18 | 1 | Object slicing during copy; b gets only Base part with x=1 | #object_slicing |
| 19 | Compilation Error | explicit prevents implicit conversion from int to A | #explicit #implicit_conversion |
| 20 | Runtime Error | Default copy does shallow copy causing double-delete | #shallow_copy #rule_of_three |

#### OOP Core Concepts Summary

| Concept | Definition | Purpose |
|---------|------------|---------|
| Encapsulation | Bundling data and methods, restricting access | Data hiding, invariant enforcement |
| Inheritance | Deriving classes from base classes | Code reuse, hierarchy modeling |
| Polymorphism | One interface, multiple implementations | Flexibility, extensibility |
| Virtual Functions | Functions resolved at runtime via vtable | Enable runtime polymorphism |
| Abstract Class | Class with pure virtual functions | Define interfaces, prevent instantiation |

#### Special Member Functions Generation Rules

| User Defines | Default Ctor | Copy Ctor | Copy Assign | Move Ctor | Move Assign | Destructor |
|--------------|--------------|-----------|-------------|-----------|-------------|------------|
| Nothing | ✅ Generated | ✅ Generated | ✅ Generated | ✅ Generated | ✅ Generated | ✅ Generated |
| Any Constructor | ❌ Not generated | ✅ Generated | ✅ Generated | ✅ Generated | ✅ Generated | ✅ Generated |
| Destructor | ✅ Generated | ✅ Generated | ✅ Generated | ❌ Not generated | ❌ Not generated | User-defined |
| Copy Ctor/Assign | ✅ Generated | User-defined | ✅/User-defined | ❌ Not generated | ❌ Not generated | ✅ Generated |
| Move Ctor/Assign | ✅ Generated | ❌ Not generated | ❌ Not generated | User-defined | ✅/User-defined | ✅ Generated |

#### Access Specifiers Behavior

| Specifier | Same Class | Derived Class | Outside Class |
|-----------|------------|---------------|---------------|
| public | ✅ Accessible | ✅ Accessible | ✅ Accessible |
| protected | ✅ Accessible | ✅ Accessible | ❌ Not accessible |
| private | ✅ Accessible | ❌ Not accessible | ❌ Not accessible |

#### Inheritance Types

| Type | Base Public Members | Base Protected Members | Base Private Members | Use Case |
|------|-------------------|----------------------|---------------------|----------|
| Public | public in derived | protected in derived | inaccessible | "is-a" relationship |
| Protected | protected in derived | protected in derived | inaccessible | Implementation inheritance |
| Private | private in derived | private in derived | inaccessible | Implementation detail hiding |

#### Virtual Function Behavior

| Scenario | Function Resolution | Notes |
|----------|-------------------|-------|
| Non-virtual function | Static (compile-time) | Based on pointer/reference type |
| Virtual function | Dynamic (runtime) | Based on actual object type via vtable |
| Pure virtual function | Must be overridden | Makes class abstract |
| final virtual function | Cannot be overridden further | Enables optimization |

#### Rule Comparison

| Rule | When to Apply | What to Define |
|------|--------------|----------------|
| Rule of 0 | No resource management | Nothing (use RAII) |
| Rule of 3 | Managing resources (C++98) | Destructor, Copy Ctor, Copy Assign |
| Rule of 5 | Managing resources (C++11+) | Rule of 3 + Move Ctor + Move Assign |

#### Common OOP Pitfalls

| Pitfall | Problem | Solution |
|---------|---------|----------|
| Non-virtual base destructor | Resource leaks, UB | Make destructor virtual |
| Object slicing | Lost derived data/behavior | Pass by pointer/reference |
| Shallow copy with pointers | Double-delete, corruption | Implement deep copy or use smart pointers |
| Calling virtual in constructor | Wrong function called, UB | Use two-phase initialization |
| Forgetting override | Accidental hiding, not overriding | Always use override keyword |
| Missing move noexcept | Container copies instead of moves | Mark move operations noexcept |
| Partial Rule of Five | Inconsistent semantics | Define all five or none |

---

This comprehensive guide covers all major C++ OOP concepts with detailed explanations, practical examples, and interview-ready Q&A. Use it as your complete reference for mastering object-oriented programming in C++!