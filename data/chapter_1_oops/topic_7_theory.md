## TOPIC: C++ Object-Oriented Programming - Complete Interview Guide

### THEORY_SECTION: Foundational OOP Concepts in C++

#### 1. The Three Pillars of C++ OOP - Encapsulation, Inheritance, Polymorphism

**Core OOP principles:**

| Pillar | Definition | C++ Mechanism | Benefit |
|--------|------------|---------------|---------|
| **Encapsulation** | Bundling data and methods together with access control | `private`, `protected`, `public` keywords | Data hiding, invariant enforcement, controlled interfaces |
| **Inheritance** | Deriving new classes from existing ones | `: public Base`, `: protected Base`, `: private Base` | Code reuse, hierarchical modeling, "is-a" relationships |
| **Polymorphism** | One interface, multiple implementations | Virtual functions, function/operator overloading, templates | Flexibility, extensibility, runtime behavior selection |

**Class vs Struct - only ONE difference:**

| Aspect | `struct` | `class` |
|--------|----------|---------|
| **Default member access** | `public` | `private` |
| **Default inheritance mode** | `public` | `private` |
| **All other features** | ✅ **Identical** (constructors, destructors, inheritance, virtual functions, etc.) | ✅ **Identical** |
| **Convention** | Simple data aggregates (POD-like) | Objects with behavior and encapsulation |
| **Memory layout** | **Exactly the same** | **Exactly the same** |

**Compile-time vs Runtime polymorphism:**

| Type | Mechanism | Resolution Time | Examples | Performance |
|------|-----------|----------------|----------|-------------|
| **Compile-time (Static)** | Function/operator overloading, templates | Compile time | `void func(int)` vs `void func(double)`, `template<T> func(T)` | ✅ Zero overhead |
| **Runtime (Dynamic)** | Virtual functions via vtable | Runtime | `virtual void func()` overridden in derived classes | Small vtable lookup cost |

**Code example - runtime polymorphism:**
```cpp
class Shape {
public:
    virtual double area() const = 0;  // Runtime polymorphism
    virtual ~Shape() = default;
};

class Circle : public Shape {
    double radius;
public:
    Circle(double r) : radius(r) {}
    double area() const override {
        return 3.14159 * radius * radius;
    }
};

class Rectangle : public Shape {
    double width, height;
public:
    Rectangle(double w, double h) : width(w), height(h) {}
    double area() const override {
        return width * height;
    }
};

// ✅ Polymorphic function - works with any Shape
void printArea(const Shape& shape) {
    std::cout << "Area: " << shape.area() << "\n";  // Runtime dispatch
}
```

---

#### 2. Special Member Functions - The Rule of Three/Five/Zero

**The six special member functions:**

| Function | Signature | When Auto-Generated | Purpose |
|----------|-----------|-------------------|---------|
| **Default Constructor** | `T()` | If no other constructors defined | Initialize object with default values |
| **Destructor** | `~T()` | Always (if not user-defined) | Clean up resources |
| **Copy Constructor** | `T(const T&)` | If no move operations declared | Create new object as copy |
| **Copy Assignment** | `T& operator=(const T&)` | If no move operations declared | Assign to existing object |
| **Move Constructor** | `T(T&&)` | If no special members user-declared | Transfer resources from temporary |
| **Move Assignment** | `T& operator=(T&&)` | If no special members user-declared | Transfer resources to existing object |

**The three rules compared:**

| Rule | Era | When to Apply | What to Define | Modern Preference |
|------|-----|---------------|---------------|------------------|
| **Rule of Zero** | C++11+ | Class doesn't manage resources | **Nothing** - use `unique_ptr`, `vector`, `string` | ✅ **Strongly preferred** |
| **Rule of Three** | C++98 | Class manages resources (pre-move) | Destructor + Copy Ctor + Copy Assign | Legacy code only |
| **Rule of Five** | C++11+ | Class manages resources (with move) | Rule of Three + Move Ctor + Move Assign | When Rule of Zero impossible |

**Decision tree - which rule to follow:**

```
Does your class directly own resources (raw pointers, file handles, etc.)?
│
├─ NO  → ✅ Follow Rule of Zero
│         Use smart pointers and RAII wrappers
│         Let compiler generate everything
│         Example: std::unique_ptr<int[]>, std::vector<T>
│
└─ YES → Follow Rule of Five
          Define/delete all five special member functions
          Ensure move operations are noexcept
          Example: Custom allocators, legacy C interface wrappers
```

**Code example - Rule of Zero (MODERN APPROACH):**
```cpp
class ModernBuffer {
    std::unique_ptr<int[]> data;  // ✅ Smart pointer manages memory
    size_t size;
public:
    explicit ModernBuffer(size_t n)
        : data(std::make_unique<int[]>(n)), size(n) {}

    // ✅ No special member functions defined
    // unique_ptr provides correct move-only semantics automatically
    // Compiler generates: destructor, move ctor, move assign
    // Copy is deleted (unique_ptr is move-only)
};
```

**Code example - Rule of Five (when necessary):**
```cpp
class LegacyBuffer {
    int* data;  // Raw pointer (C interface, legacy code)
    size_t size;
public:
    explicit LegacyBuffer(size_t n) : size(n), data(new int[n]) {}

    // ✅ Rule of Five - all five explicitly defined
    ~LegacyBuffer() { delete[] data; }

    LegacyBuffer(const LegacyBuffer& other)
        : size(other.size), data(new int[other.size]) {
        std::copy(other.data, other.data + size, data);
    }

    LegacyBuffer& operator=(const LegacyBuffer& other) {
        if (this != &other) {
            int* new_data = new int[other.size];
            std::copy(other.data, other.data + other.size, new_data);
            delete[] data;
            data = new_data;
            size = other.size;
        }
        return *this;
    }

    LegacyBuffer(LegacyBuffer&& other) noexcept
        : data(other.data), size(other.size) {
        other.data = nullptr;
        other.size = 0;
    }

    LegacyBuffer& operator=(LegacyBuffer&& other) noexcept {
        if (this != &other) {
            delete[] data;
            data = other.data;
            size = other.size;
            other.data = nullptr;
            other.size = 0;
        }
        return *this;
    }
};
```

---

#### 3. Resource Management Dangers - Common Pitfalls

**What happens with wrong resource management:**

| Mistake | Symptom | Cause | Fix |
|---------|---------|-------|-----|
| **Double-deletion crash** | Crash when second object destroyed | Shallow copy with raw pointers | Deep copy or Rule of Zero |
| **Memory leak** | Growing memory usage | No destructor or improper cleanup | RAII and proper destructor |
| **Use-after-free** | Crash or undefined behavior | Dangling pointer after move | Nullify pointers in move operations |
| **Resource leak** | File handles/sockets exhausted | Missing cleanup in exception paths | RAII wrappers auto-cleanup |
| **Object slicing** | Lost data and polymorphism | Pass polymorphic types by value | Pass by reference/pointer |

**Why Rule of Zero is strongly preferred:**

| Rule of Zero Benefit | Why It Matters |
|---------------------|----------------|
| **No manual memory management** | Eliminates entire class of bugs (leaks, double-delete) |
| **Exception-safe by default** | RAII wrappers clean up even during exceptions |
| **Move semantics automatic** | unique_ptr, vector, etc. provide optimal moves |
| **Less code to maintain** | Compiler-generated special members always correct |
| **Clearer intent** | Composition shows exactly what resources are owned |
| **Standard library tested** | Battle-tested implementations vs custom code |

**Code example - dangers of shallow copy:**
```cpp
class DangerousBuffer {
    int* data;
    size_t size;
public:
    DangerousBuffer(size_t n) : size(n), data(new int[n]) {}
    ~DangerousBuffer() { delete[] data; }

    // ❌ Compiler-generated copy constructor does shallow copy!
    // Both objects point to same memory
};

int main() {
    DangerousBuffer buf1(100);
    DangerousBuffer buf2 = buf1;  // ❌ Shallow copy
    // When buf2 destroys: delete[] data
    // When buf1 destroys: delete[] data again (same pointer!)
    // CRASH: Double-deletion
}
```

**Key takeaway:** Follow Rule of Zero using smart pointers and RAII wrappers whenever possible. Only use Rule of Five when directly managing resources for legacy interfaces or custom allocators. Understanding OOP pillars (encapsulation, inheritance, polymorphism) combined with proper resource management is essential for safe, efficient C++ programming.

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

### QUICK_REFERENCE: Answer Keys and Summary Tables

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
