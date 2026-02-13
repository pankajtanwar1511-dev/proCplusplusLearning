## TOPIC: Pure Virtual Functions and Abstract Base Classes

### THEORY_SECTION: Core Concepts and Interface Design

#### 1. Pure Virtual Functions - Interface Contracts in C++

**Core characteristics:**

| Aspect | Pure Virtual Function | Regular Virtual Function |
|--------|----------------------|-------------------------|
| **Syntax** | `virtual void func() = 0;` | `virtual void func() { /* body */ }` |
| **Implementation in base** | Optional (can have body defined separately) | Required |
| **Override requirement** | **Mandatory** - derived classes must override | Optional - derived classes can override |
| **Makes class abstract** | Yes - class cannot be instantiated | No |
| **Purpose** | Define interface contracts | Provide customizable behavior |
| **When used** | When forcing all derived classes to implement | When providing default behavior that can be customized |

**Key insight:** Despite the `= 0` syntax suggesting "no implementation," pure virtual functions can have a body defined outside the class declaration. This enables shared logic that derived classes can optionally call via `Base::func()` while still enforcing that they must override the function.

**Code example:**
```cpp
class Logger {
public:
    virtual void log(const std::string& msg) = 0;  // Pure virtual
    virtual ~Logger() = default;
};

// Pure virtual CAN have a body
void Logger::log(const std::string& msg) {
    std::cout << "[BASE] " << msg << "\n";  // Shared logic
}

class FileLogger : public Logger {
public:
    void log(const std::string& msg) override {
        Logger::log(msg);  // Optionally call base implementation
        std::cout << "[FILE] Writing to disk\n";
    }
};
```

---

#### 2. Abstract Base Classes (ABCs) - Interface Design

**Definition:** A class becomes abstract when it contains at least one pure virtual function, making it non-instantiable but usable through pointers/references for polymorphism.

**ABC capabilities table:**

| Feature | Abstract Base Class | Pure Interface (Strict) |
|---------|-------------------|------------------------|
| **Pure virtual functions** | At least one | All functions are pure virtual |
| **Regular virtual functions** | Can have | Should not have (interface only) |
| **Non-virtual functions** | Can have | Should not have |
| **Data members** | Can have | Should not have (state-free) |
| **Constructors** | Can have (called during derived construction) | Can have (typically protected) |
| **Destructors** | Must be virtual | Must be virtual (can be pure) |
| **Instantiation** | Cannot instantiate directly | Cannot instantiate directly |
| **Pointers/References** | Can create (for polymorphism) | Can create (for polymorphism) |

**Common ABC usage patterns:**

| Design Pattern | ABC Role | Example |
|---------------|----------|---------|
| **Strategy** | Define algorithm interface | `virtual void execute() = 0;` |
| **Template Method** | Define algorithm structure with hooks | Public non-virtual calls private pure virtuals |
| **Abstract Factory** | Define object creation interface | `virtual Product* create() = 0;` |
| **Observer** | Define update interface | `virtual void notify() = 0;` |
| **Plugin Architecture** | Define plugin interface | Runtime loading of implementations |

---

#### 3. Design Principles and Real-World Impact

**SOLID principles enabled by ABCs:**

| Principle | How ABCs Enable It | Code Impact |
|-----------|-------------------|-------------|
| **Open/Closed** | Add new derived classes without modifying base | New functionality via new classes, not edits |
| **Liskov Substitution** | Any derived object works through base pointer | Polymorphic code uses interfaces uniformly |
| **Interface Segregation** | Create focused, specific interfaces | Clients depend only on methods they use |
| **Dependency Inversion** | High-level code depends on abstractions | Decouples implementation from interface |

**When to use ABCs:**

| Scenario | Use ABC | Use Concrete Class |
|----------|---------|-------------------|
| Multiple implementations of same behavior | ✅ Define interface | ❌ Too rigid |
| Plugin/module system | ✅ Load implementations at runtime | ❌ Compile-time only |
| Testing with mocks | ✅ Mock implementations for tests | ❌ Hard to mock |
| Dependency injection | ✅ Inject different implementations | ❌ Tight coupling |
| Fixed, single implementation | ❌ Unnecessary abstraction | ✅ Simpler |

**Code example - Dependency Inversion:**
```cpp
// ✅ Good: High-level code depends on abstraction
class IDatabase {
public:
    virtual void save(const Data& d) = 0;
    virtual ~IDatabase() = default;
};

class Application {
    IDatabase* db;  // Depends on interface, not concrete class
public:
    Application(IDatabase* database) : db(database) {}
    void processData(const Data& d) {
        db->save(d);  // Works with ANY IDatabase implementation
    }
};

// Can inject MySQL, PostgreSQL, MockDB, etc. at runtime

// ❌ Bad: High-level code depends on concrete implementation
class Application {
    MySQLDatabase db;  // Tightly coupled to MySQL
public:
    void processData(const Data& d) {
        db.save(d);  // Cannot swap database without code changes
    }
};
```

**Key takeaway:** ABCs are essential for writing flexible, testable, maintainable code that depends on interfaces rather than concrete implementations, enabling runtime polymorphism and adherence to SOLID principles.

### EDGE_CASES: Tricky Scenarios and Deep Internals

#### Edge Case 1: Pure Virtual Functions Can Have Implementations

Despite being declared as "pure," a pure virtual function can have a body defined outside the class declaration. This creates an interesting hybrid where the function is still pure (requiring derived classes to override it), but also provides optional default behavior that derived classes can explicitly call.

```cpp
class Logger {
public:
    virtual void log(const std::string& msg) = 0;  // Pure virtual
    virtual ~Logger() = default;
};

// ✅ Pure virtual can have implementation
void Logger::log(const std::string& msg) {
    std::cout << "[BASE LOG] " << msg << "\n";
}

class FileLogger : public Logger {
public:
    void log(const std::string& msg) override {
        Logger::log(msg);  // ✅ Can call base implementation
        std::cout << "[FILE] Writing to disk\n";
    }
};
```

This pattern provides default behavior while enforcing that derived classes must consciously override and acknowledge the function. It's useful for providing common logging, validation, or initialization logic that multiple derived classes can reuse.

#### Edge Case 2: Pure Virtual Destructors Require Definitions

A destructor can be declared pure virtual to make a class abstract, but unlike other pure virtual functions, pure virtual destructors must always have a body defined. This is because destructors are called in the destruction chain, and if the base destructor has no implementation, the program will fail to link.

```cpp
class AbstractBase {
public:
    virtual ~AbstractBase() = 0;  // Pure virtual destructor
};

// ❌ Must define it, or linker error
AbstractBase::~AbstractBase() {
    std::cout << "AbstractBase destructor\n";
}

class Concrete : public AbstractBase {
public:
    ~Concrete() override {
        std::cout << "Concrete destructor\n";
    }
};

int main() {
    AbstractBase* ptr = new Concrete();
    delete ptr;  // ✅ Calls both destructors
}
```

This is a common interview trap—declaring a pure virtual destructor without defining it causes cryptic linker errors. The destructor must be defined because it's called during object destruction, even though the class is abstract.

#### Edge Case 3: Calling Pure Virtual Functions in Constructors

Calling a pure virtual function from a constructor or destructor is undefined behavior and often causes crashes. During base class construction, the vptr points to the base class's vtable, and if the base class has a pure virtual function, attempting to call it accesses an invalid entry.

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

During `Base()` construction, the object's type is still `Base`, not `Derived`. The vptr points to `Base`'s vtable, which contains a placeholder for the pure virtual function. Calling it results in undefined behavior because there's no valid function to call. Never call virtual functions (especially pure virtual ones) from constructors or destructors.

#### Edge Case 4: Intermediate Classes Can Remain Abstract

When inheriting from an abstract base class, intermediate derived classes don't need to override all pure virtual functions. The class remains abstract until some derived class in the hierarchy provides implementations for all pure virtuals.

```cpp
class Interface {
public:
    virtual void operation1() = 0;
    virtual void operation2() = 0;
    virtual ~Interface() = default;
};

class PartialImpl : public Interface {
public:
    void operation1() override {
        std::cout << "operation1 implemented\n";
    }
    // operation2 not overridden - PartialImpl is still abstract
};

class ConcreteImpl : public PartialImpl {
public:
    void operation2() override {
        std::cout << "operation2 implemented\n";
    }
    // ✅ Now all pure virtuals are overridden
};

int main() {
    // PartialImpl p;  // ❌ Error: still abstract
    ConcreteImpl c;    // ✅ OK: all pure virtuals overridden
}
```

This allows for incremental implementation of complex interfaces and is useful in large inheritance hierarchies where different levels provide different pieces of functionality.

#### Edge Case 5: Function Hiding vs Pure Virtual Overriding

Adding a function with a different signature in a derived class doesn't override a base pure virtual function—it hides it. This is a common mistake where developers think they're implementing the required interface but are actually hiding it with an overload.

```cpp
class Base {
public:
    virtual void process() = 0;  // Pure virtual with no parameters
};

class Derived : public Base {
public:
    void process(int x) {  // ❌ Different signature - doesn't override
        std::cout << "Derived process\n";
    }
};

int main() {
    // Derived d;  // ❌ Error: Derived is still abstract
}
```

The function `process(int)` is an overload, not an override. The pure virtual `process()` remains unimplemented, so `Derived` is still abstract. Always use the `override` keyword to catch such mistakes at compile-time.

#### Edge Case 6: Abstract Classes Can Have Constructors and Data

Abstract classes are not limited to pure virtual functions—they can have constructors, data members, and regular member functions. The constructors are called during derived class construction, allowing the base class to initialize its data.

```cpp
class AbstractShape {
protected:
    std::string name;
    int id;
    
public:
    AbstractShape(std::string n, int i) : name(n), id(i) {
        std::cout << "AbstractShape constructed\n";
    }
    
    virtual double area() const = 0;  // Pure virtual
    
    std::string getName() const { return name; }  // Regular member
    
    virtual ~AbstractShape() = default;
};

class Circle : public AbstractShape {
    double radius;
public:
    Circle(double r, int id) : AbstractShape("Circle", id), radius(r) {}
    
    double area() const override {
        return 3.14159 * radius * radius;
    }
};
```

This demonstrates that abstract classes can maintain state and provide partial implementation, not just pure interface definitions. The base class constructor ensures consistent initialization across all derived classes.

### CODE_EXAMPLES: Practical Demonstrations

#### Example 1: Basic Abstract Interface

```cpp
class IDrawable {
public:
    virtual void draw() const = 0;
    virtual ~IDrawable() = default;
};

class Circle : public IDrawable {
    double radius;
public:
    Circle(double r) : radius(r) {}
    void draw() const override {
        std::cout << "Drawing circle with radius " << radius << "\n";
    }
};

class Rectangle : public IDrawable {
    double width, height;
public:
    Rectangle(double w, double h) : width(w), height(h) {}
    void draw() const override {
        std::cout << "Drawing rectangle " << width << "x" << height << "\n";
    }
};

void render(const IDrawable& obj) {  // ✅ Program to interface
    obj.draw();
}
```

This demonstrates the fundamental pattern of programming to interfaces. The `render` function works with any `IDrawable` implementation, enabling polymorphism and loose coupling.

#### Example 2: Pure Virtual Destructor Pattern

```cpp
class AbstractResource {
public:
    virtual ~AbstractResource() = 0;  // Makes class abstract via destructor
};

// ✅ Must define the pure virtual destructor
AbstractResource::~AbstractResource() {
    std::cout << "AbstractResource cleanup\n";
}

class FileResource : public AbstractResource {
    std::string filename;
public:
    FileResource(std::string name) : filename(name) {
        std::cout << "Opening file: " << filename << "\n";
    }
    
    ~FileResource() override {
        std::cout << "Closing file: " << filename << "\n";
    }
};

int main() {
    AbstractResource* res = new FileResource("data.txt");
    delete res;  // ✅ Both destructors called
}
```

Using a pure virtual destructor is a clean way to make a class abstract when you don't have other pure virtual functions. The destructor still needs a body because it's called during destruction.

#### Example 3: Template Method Pattern with Pure Virtuals

```cpp
class Algorithm {
private:
    virtual void preProcess() {  // ✅ Non-pure with default
        std::cout << "Default preprocessing\n";
    }
    
    virtual void execute() = 0;  // ✅ Pure virtual - must override
    
    virtual void postProcess() {  // ✅ Non-pure with default
        std::cout << "Default postprocessing\n";
    }
    
public:
    void run() {  // ✅ Template method
        preProcess();
        execute();
        postProcess();
    }
    
    virtual ~Algorithm() = default;
};

class ConcreteAlgorithm : public Algorithm {
private:
    void preProcess() override {
        std::cout << "Custom preprocessing\n";
    }
    
    void execute() override {
        std::cout << "Main algorithm execution\n";
    }
    // Uses default postProcess
};
```

This demonstrates the Template Method pattern where the base class defines the algorithm structure, mixing required overrides (pure virtual) with optional customization points (regular virtual).

#### Example 4: Strategy Pattern with Abstract Interface

```cpp
class SortStrategy {
public:
    virtual void sort(std::vector<int>& data) = 0;
    virtual ~SortStrategy() = default;
};

class BubbleSort : public SortStrategy {
public:
    void sort(std::vector<int>& data) override {
        std::cout << "Sorting with bubble sort\n";
        // Implementation...
    }
};

class QuickSort : public SortStrategy {
public:
    void sort(std::vector<int>& data) override {
        std::cout << "Sorting with quick sort\n";
        // Implementation...
    }
};

class DataProcessor {
    SortStrategy* strategy;
public:
    DataProcessor(SortStrategy* s) : strategy(s) {}
    
    void process(std::vector<int>& data) {
        std::cout << "Processing data...\n";
        strategy->sort(data);  // ✅ Polymorphic call
    }
};
```

The Strategy pattern uses abstract interfaces to allow algorithms to be selected and swapped at runtime, demonstrating dependency injection and the Open/Closed Principle.

#### Example 5: Partial Implementation in Abstract Base

```cpp
class DataStore {
protected:
    std::string connectionString;
    bool connected;
    
    virtual bool connect() = 0;  // Pure virtual
    virtual void disconnect() = 0;  // Pure virtual
    
public:
    DataStore(std::string conn) : connectionString(conn), connected(false) {}
    
    bool isConnected() const { return connected; }  // ✅ Concrete method
    
    void reconnect() {  // ✅ Concrete method using pure virtuals
        if (connected) disconnect();
        connect();
    }
    
    virtual ~DataStore() {
        if (connected) disconnect();
    }
};

class SqlDatabase : public DataStore {
public:
    SqlDatabase(std::string conn) : DataStore(conn) {}
    
    bool connect() override {
        std::cout << "Connecting to SQL: " << connectionString << "\n";
        connected = true;
        return true;
    }
    
    void disconnect() override {
        std::cout << "Disconnecting from SQL\n";
        connected = false;
    }
};
```

This shows how abstract classes can provide substantial shared implementation while leaving specific operations to derived classes. The base class maintains state and provides utility methods.

#### Example 6: Pure Virtual with Body for Optional Shared Logic

```cpp
class Validator {
public:
    virtual bool validate(const std::string& input) = 0;
    virtual ~Validator() = default;
};

// ✅ Provide default implementation
bool Validator::validate(const std::string& input) {
    if (input.empty()) {
        std::cout << "Empty input detected\n";
        return false;
    }
    return true;
}

class EmailValidator : public Validator {
public:
    bool validate(const std::string& input) override {
        if (!Validator::validate(input)) {  // ✅ Call base implementation
            return false;
        }
        
        // Email-specific validation
        bool hasAt = input.find('@') != std::string::npos;
        std::cout << "Email validation: " << (hasAt ? "valid" : "invalid") << "\n";
        return hasAt;
    }
};
```

Providing a body for pure virtual functions allows derived classes to optionally call shared validation or preprocessing logic while still being required to override the function.

#### Example 7: Multiple Pure Virtual Functions

```cpp
class ISerializable {
public:
    virtual std::string serialize() const = 0;
    virtual void deserialize(const std::string& data) = 0;
    virtual ~ISerializable() = default;
};

class Person : public ISerializable {
    std::string name;
    int age;
    
public:
    Person(std::string n = "", int a = 0) : name(n), age(a) {}
    
    std::string serialize() const override {
        return name + "," + std::to_string(age);
    }
    
    void deserialize(const std::string& data) override {
        size_t pos = data.find(',');
        name = data.substr(0, pos);
        age = std::stoi(data.substr(pos + 1));
    }
};

void saveToFile(const ISerializable& obj, const std::string& filename) {
    std::string data = obj.serialize();
    std::cout << "Saving to " << filename << ": " << data << "\n";
}
```

Interfaces often define multiple related operations that form a cohesive contract. All pure virtual functions must be overridden for the class to be instantiable.

#### Example 8: Abstract Factory Pattern

```cpp
class Document {
public:
    virtual void open() = 0;
    virtual void save() = 0;
    virtual ~Document() = default;
};

class PdfDocument : public Document {
public:
    void open() override { std::cout << "Opening PDF\n"; }
    void save() override { std::cout << "Saving PDF\n"; }
};

class WordDocument : public Document {
public:
    void open() override { std::cout << "Opening Word doc\n"; }
    void save() override { std::cout << "Saving Word doc\n"; }
};

class DocumentFactory {
public:
    virtual Document* createDocument() = 0;  // Factory method
    virtual ~DocumentFactory() = default;
};

class PdfFactory : public DocumentFactory {
public:
    Document* createDocument() override {
        return new PdfDocument();
    }
};

class WordFactory : public DocumentFactory {
public:
    Document* createDocument() override {
        return new WordDocument();
    }
};
```

The Abstract Factory pattern uses abstract base classes to define families of related objects, enabling object creation without specifying concrete classes.

#### Example 9: Autonomous Vehicle - Motion Planning Interface

```cpp
#include <iostream>
#include <string>
#include <vector>
#include <cmath>

// Pure abstract interface for motion planners
class IMotionPlanner {
public:
    // Pure virtual functions define the contract
    virtual bool plan(double start_x, double start_y,
                     double goal_x, double goal_y) = 0;

    virtual std::vector<std::pair<double, double>> getPath() const = 0;

    virtual std::string getPlannerName() const = 0;

    // Virtual destructor is essential for polymorphic deletion
    virtual ~IMotionPlanner() = default;

protected:
    // Protected helper available to derived classes
    double calculateDistance(double x1, double y1, double x2, double y2) const {
        return std::sqrt((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1));
    }
};

// Abstract base class with partial implementation
class PlannerBase : public IMotionPlanner {
protected:
    std::vector<std::pair<double, double>> path;
    std::string name;
    bool valid_plan;

public:
    PlannerBase(std::string planner_name)
        : name(planner_name), valid_plan(false) {}

    // Concrete implementation of interface method
    std::vector<std::pair<double, double>> getPath() const override {
        return path;
    }

    std::string getPlannerName() const override {
        return name;
    }

    // plan() remains pure virtual - derived classes must implement
    virtual ~PlannerBase() = default;
};

// Concrete planner: A* algorithm
class AStarPlanner : public PlannerBase {
private:
    int max_iterations;

public:
    AStarPlanner(int max_iter = 1000)
        : PlannerBase("A* Planner"), max_iterations(max_iter) {}

    bool plan(double start_x, double start_y,
             double goal_x, double goal_y) override {
        std::cout << name << ": Planning from (" << start_x << "," << start_y
                  << ") to (" << goal_x << "," << goal_y << ")" << std::endl;

        // Simplified A* simulation
        path.clear();
        path.push_back({start_x, start_y});

        // Intermediate waypoints (simplified)
        double mid_x = (start_x + goal_x) / 2.0;
        double mid_y = (start_y + goal_y) / 2.0;
        path.push_back({mid_x, mid_y});
        path.push_back({goal_x, goal_y});

        double dist = calculateDistance(start_x, start_y, goal_x, goal_y);
        std::cout << "  Total distance: " << dist << "m" << std::endl;
        std::cout << "  Waypoints: " << path.size() << std::endl;

        valid_plan = true;
        return true;
    }
};

// Concrete planner: Hybrid A* for parking
class HybridAStarPlanner : public PlannerBase {
private:
    double vehicle_width;
    double turning_radius;

public:
    HybridAStarPlanner(double width, double radius)
        : PlannerBase("Hybrid A* Planner"),
          vehicle_width(width), turning_radius(radius) {}

    bool plan(double start_x, double start_y,
             double goal_x, double goal_y) override {
        std::cout << name << ": Planning parking maneuver" << std::endl;
        std::cout << "  Vehicle width: " << vehicle_width << "m" << std::endl;
        std::cout << "  Turning radius: " << turning_radius << "m" << std::endl;

        // Simplified hybrid A* with vehicle constraints
        path.clear();
        path.push_back({start_x, start_y});

        // Arc trajectory considering turning radius
        double steps = 5;
        for (int i = 1; i <= steps; i++) {
            double t = i / steps;
            double x = start_x + (goal_x - start_x) * t;
            double y = start_y + (goal_y - start_y) * t;
            // Add slight curve for realistic turning
            y += turning_radius * std::sin(t * 3.14159) * 0.2;
            path.push_back({x, y});
        }

        std::cout << "  Generated " << path.size() << " waypoints" << std::endl;

        valid_plan = true;
        return true;
    }
};

// Concrete planner: RRT for complex environments
class RRTPlanner : public PlannerBase {
private:
    int num_samples;

public:
    RRTPlanner(int samples = 500)
        : PlannerBase("RRT Planner"), num_samples(samples) {}

    bool plan(double start_x, double start_y,
             double goal_x, double goal_y) override {
        std::cout << name << ": Random tree exploration" << std::endl;
        std::cout << "  Samples: " << num_samples << std::endl;

        // Simplified RRT simulation
        path.clear();
        path.push_back({start_x, start_y});

        // Random-like exploration (simplified)
        double dx = (goal_x - start_x) / 3.0;
        double dy = (goal_y - start_y) / 3.0;

        path.push_back({start_x + dx, start_y + dy + 0.5});
        path.push_back({start_x + 2*dx, start_y + 2*dy - 0.3});
        path.push_back({goal_x, goal_y});

        std::cout << "  Path found with " << path.size() << " nodes" << std::endl;

        valid_plan = true;
        return true;
    }
};

// Abstract factory for creating planners
class PlannerFactory {
public:
    virtual IMotionPlanner* createPlanner() = 0;
    virtual ~PlannerFactory() = default;
};

class AStarFactory : public PlannerFactory {
public:
    IMotionPlanner* createPlanner() override {
        return new AStarPlanner();
    }
};

class HybridAStarFactory : public PlannerFactory {
public:
    IMotionPlanner* createPlanner() override {
        return new HybridAStarPlanner(2.0, 5.0);
    }
};

// Motion planning system using polymorphism
class MotionPlanningSystem {
private:
    IMotionPlanner* planner;  // ✅ Pointer to abstract interface

public:
    MotionPlanningSystem(IMotionPlanner* p) : planner(p) {}

    void executePlanning(double sx, double sy, double gx, double gy) {
        std::cout << "\n=== Motion Planning Request ===" << std::endl;
        std::cout << "Using: " << planner->getPlannerName() << std::endl;

        if (planner->plan(sx, sy, gx, gy)) {
            std::cout << "✓ Planning successful!" << std::endl;

            auto path = planner->getPath();
            std::cout << "Path preview:" << std::endl;
            for (size_t i = 0; i < path.size() && i < 3; i++) {
                std::cout << "  Waypoint " << i << ": ("
                         << path[i].first << ", " << path[i].second << ")" << std::endl;
            }
        } else {
            std::cout << "✗ Planning failed!" << std::endl;
        }
    }

    void switchPlanner(IMotionPlanner* new_planner) {
        delete planner;  // ✅ Virtual destructor ensures proper cleanup
        planner = new_planner;
        std::cout << "\nSwitched to: " << planner->getPlannerName() << std::endl;
    }

    ~MotionPlanningSystem() {
        delete planner;
    }
};

int main() {
    // Demonstrate Strategy pattern with different planners
    MotionPlanningSystem system(new AStarPlanner());

    system.executePlanning(0.0, 0.0, 10.0, 15.0);

    // Switch to parking planner
    system.switchPlanner(new HybridAStarPlanner(2.0, 4.5));
    system.executePlanning(0.0, 0.0, 5.0, 3.0);

    // Switch to RRT for complex environment
    system.switchPlanner(new RRTPlanner(1000));
    system.executePlanning(0.0, 0.0, 20.0, 25.0);

    // Demonstrate Abstract Factory pattern
    std::cout << "\n=== Using Abstract Factory ===" << std::endl;
    PlannerFactory* factory = new AStarFactory();
    IMotionPlanner* planner = factory->createPlanner();
    planner->plan(0.0, 0.0, 8.0, 12.0);

    delete planner;
    delete factory;

    return 0;
}
```

**Output:**
```
=== Motion Planning Request ===
Using: A* Planner
A* Planner: Planning from (0,0) to (10,15)
  Total distance: 18.0278m
  Waypoints: 3
✓ Planning successful!
Path preview:
  Waypoint 0: (0, 0)
  Waypoint 1: (5, 7.5)
  Waypoint 2: (10, 15)

Switched to: Hybrid A* Planner

=== Motion Planning Request ===
Using: Hybrid A* Planner
Hybrid A* Planner: Planning parking maneuver
  Vehicle width: 2m
  Turning radius: 4.5m
  Generated 6 waypoints
✓ Planning successful!
Path preview:
  Waypoint 0: (0, 0)
  Waypoint 1: (1, 0.8)
  Waypoint 2: (2, 1.58)

Switched to: RRT Planner

=== Motion Planning Request ===
Using: RRT Planner
RRT Planner: Random tree exploration
  Samples: 1000
  Path found with 4 nodes
✓ Planning successful!
Path preview:
  Waypoint 0: (0, 0)
  Waypoint 1: (6.66667, 8.83333)
  Waypoint 2: (13.3333, 16.3667)

=== Using Abstract Factory ===
A* Planner: Planning from (0,0) to (8,12)
  Total distance: 14.4222m
  Waypoints: 3
```

This example demonstrates pure virtual functions and abstract base classes in autonomous vehicle motion planning:

1. **Pure Abstract Interface (`IMotionPlanner`)**:
   - Defines the contract with pure virtual functions
   - `plan()`, `getPath()`, and `getPlannerName()` must be implemented
   - Virtual destructor enables polymorphic deletion

2. **Abstract Base Class with Partial Implementation (`PlannerBase`)**:
   - Implements some interface methods (`getPath()`, `getPlannerName()`)
   - Provides shared data members (`path`, `name`, `valid_plan`)
   - Leaves `plan()` pure virtual for derived classes
   - Demonstrates that abstract classes can have constructors and data

3. **Concrete Implementations**:
   - `AStarPlanner`: Grid-based pathfinding
   - `HybridAStarPlanner`: Vehicle-aware parking maneuvers
   - `RRTPlanner`: Random tree exploration for complex environments
   - Each overrides the pure virtual `plan()` method

4. **Abstract Factory Pattern**:
   - `PlannerFactory` abstract class with pure virtual `createPlanner()`
   - Concrete factories create specific planner types
   - Enables runtime planner selection without specifying concrete types

5. **Polymorphism in Action**:
   - `MotionPlanningSystem` works with `IMotionPlanner*` interface
   - Can switch planners at runtime using polymorphism
   - Virtual destructor ensures proper cleanup regardless of concrete type

**Real-world relevance**: Autonomous vehicles use different motion planning algorithms depending on the scenario (highway driving, parking, urban navigation). Abstract interfaces allow the planning system to work uniformly with any planner implementation, enabling runtime algorithm selection based on driving conditions without modifying the core planning system code.

### INTERVIEW_QA: Comprehensive Questions and Answers

#### Q1: What is a pure virtual function?
**Difficulty:** #beginner  
**Category:** #syntax #fundamentals  
**Concepts:** #pure_virtual #abstract_class #interface #polymorphism

**Answer:**
A pure virtual function is a virtual function declared with `= 0` syntax that has no implementation in the base class and must be overridden by derived classes before they can be instantiated.

**Code example:**
```cpp
class Interface {
public:
    virtual void operation() = 0;  // Pure virtual
    virtual ~Interface() = default;
};
```

**Explanation:**
Pure virtual functions define interface contracts that derived classes must fulfill. Any class with at least one pure virtual function becomes an abstract base class (ABC) and cannot be instantiated directly. Derived classes must provide implementations for all pure virtual functions inherited from their base classes before they can be instantiated. Pure virtuals are the C++ mechanism for creating true interfaces.

**Key takeaway:** Use pure virtual functions to define interfaces and enforce implementation contracts in derived classes.

---

#### Q2: What is an abstract base class?
**Difficulty:** #beginner  
**Category:** #fundamentals #design_pattern  
**Concepts:** #abstract_class #pure_virtual #interface #polymorphism

**Answer:**
An abstract base class (ABC) is a class that contains at least one pure virtual function, making it non-instantiable and serving as an interface or contract for derived classes.

**Explanation:**
ABCs cannot be instantiated directly—you cannot create objects of abstract classes. However, you can create pointers and references to ABCs, enabling polymorphic behavior. ABCs can contain data members, constructors, regular member functions, and even implementations for their pure virtual functions. They serve as interfaces that define what operations derived classes must support without specifying how those operations are implemented. This separation of interface from implementation is fundamental to good OOP design.

**Key takeaway:** Use abstract base classes to define interfaces and enable polymorphism through well-defined contracts.

---

#### Q3: Can a pure virtual function have a body/implementation?
**Difficulty:** #intermediate  
**Category:** #syntax #interview_favorite  
**Concepts:** #pure_virtual #function_body #interface

**Answer:**
Yes, a pure virtual function can have an implementation defined outside the class declaration, allowing derived classes to optionally call the base implementation while still being required to override it.

**Code example:**
```cpp
class Base {
public:
    virtual void func() = 0;
};

void Base::func() {  // ✅ Legal
    std::cout << "Base implementation\n";
}

class Derived : public Base {
public:
    void func() override {
        Base::func();  // ✅ Can call base
        std::cout << "Derived addition\n";
    }
};
```

**Explanation:**
This pattern provides default or shared behavior while enforcing that derived classes must consciously override the function. The `= 0` syntax means "this function must be overridden," not "this function has no body." Derived classes can explicitly call the base implementation via `Base::func()`. This is useful for providing common validation, logging, or initialization logic that multiple derived classes can reuse.

**Key takeaway:** Pure virtual functions can have bodies, enabling shared logic while enforcing override requirements.

---

#### Q4: Can an abstract class have a constructor?
**Difficulty:** #intermediate  
**Category:** #syntax #memory  
**Concepts:** #abstract_class #constructors #initialization

**Answer:**
Yes, abstract classes can and often do have constructors, which are called during derived class construction to initialize the base class portion of the object.

**Code example:**
```cpp
class AbstractBase {
protected:
    int value;
public:
    AbstractBase(int v) : value(v) {  // ✅ Constructor in ABC
        std::cout << "AbstractBase constructed\n";
    }
    virtual void operation() = 0;
};

class Concrete : public AbstractBase {
public:
    Concrete(int v) : AbstractBase(v) {}
    void operation() override {}
};
```

**Explanation:**
Abstract classes cannot be instantiated directly, but their constructors are essential for initializing the base class subobject when creating derived class instances. The constructor runs during derived class construction, allowing the base class to set up its data members and perform necessary initialization. Abstract class constructors are often protected to prevent accidental attempts at instantiation while allowing derived classes to call them.

**Key takeaway:** Abstract classes can have constructors for initializing base class data during derived class construction.

---

#### Q5: Why must a pure virtual destructor have a definition?
**Difficulty:** #advanced  
**Category:** #memory #interview_favorite  
**Concepts:** #pure_virtual #destructors #undefined_behavior #linker_error

**Answer:**
A pure virtual destructor must have a body because destructors are always called during object destruction, and without a definition, the linker cannot find the code to execute, causing a linker error.

**Code example:**
```cpp
class Base {
public:
    virtual ~Base() = 0;  // Pure virtual destructor
};

Base::~Base() {  // ✅ Must define, or linker error
    std::cout << "Base destroyed\n";
}

class Derived : public Base {
public:
    ~Derived() override {
        std::cout << "Derived destroyed\n";
    }
};
```

**Explanation:**
Unlike other pure virtual functions that may never be called if not overridden, destructors are always called in the destruction chain. When deleting a derived object, both the derived and base destructors execute. If the base destructor has no definition, the linker has no code to execute and fails. Pure virtual destructors are useful for making a class abstract when you have no other pure virtual functions, but they always need bodies.

**Key takeaway:** Always provide a definition for pure virtual destructors to avoid linker errors.

---

#### Q6: Can you instantiate an abstract class?
**Difficulty:** #beginner  
**Category:** #syntax #fundamentals  
**Concepts:** #abstract_class #instantiation #pure_virtual

**Answer:**
No, you cannot directly instantiate an abstract class, but you can create pointers and references to abstract classes that point to derived class objects.

**Code example:**
```cpp
class Abstract {
public:
    virtual void func() = 0;
};

class Concrete : public Abstract {
public:
    void func() override {}
};

int main() {
    // Abstract a;  // ❌ Error: cannot instantiate
    Abstract* ptr = new Concrete();  // ✅ OK
    Abstract& ref = *ptr;  // ✅ OK
    delete ptr;
}
```

**Explanation:**
Abstract classes exist to define interfaces, not to be instantiated. Attempting to create an object of an abstract class results in a compilation error. However, pointers and references to abstract classes are essential for polymorphism—they allow you to work with objects through their interface without knowing the concrete type. This is the foundation of runtime polymorphism and enables flexible, extensible designs.

**Key takeaway:** Use pointers or references to abstract classes for polymorphism, never direct instantiation.

---

#### Q7: What happens if a derived class doesn't override all pure virtual functions?
**Difficulty:** #intermediate  
**Category:** #syntax #interview_favorite  
**Concepts:** #pure_virtual #abstract_class #inheritance #override

**Answer:**
The derived class also becomes abstract and cannot be instantiated until all inherited pure virtual functions are overridden in the inheritance hierarchy.

**Code example:**
```cpp
class Base {
public:
    virtual void func1() = 0;
    virtual void func2() = 0;
};

class Partial : public Base {
public:
    void func1() override {}
    // func2 not overridden - Partial is still abstract
};

class Complete : public Partial {
public:
    void func2() override {}  // ✅ Now can instantiate
};

int main() {
    // Partial p;  // ❌ Error: still abstract
    Complete c;    // ✅ OK
}
```

**Explanation:**
A class is only concrete (instantiable) when all pure virtual functions in its inheritance chain have been overridden. Intermediate classes in a hierarchy can remain abstract by implementing only some of the pure virtuals. This allows for incremental implementation of complex interfaces and is useful in large inheritance hierarchies where different levels provide different functionality. The `override` keyword helps catch mistakes where you think you're overriding but aren't.

**Key takeaway:** All pure virtual functions must be overridden somewhere in the inheritance chain before a class becomes instantiable.

---

#### Q8: Can you call a pure virtual function from a base class constructor?
**Difficulty:** #advanced  
**Category:** #memory #interview_favorite  
**Concepts:** #pure_virtual #constructors #undefined_behavior #vptr

**Answer:**
Calling a pure virtual function from a constructor causes undefined behavior and often crashes because the vptr hasn't been set to the derived class's vtable yet.

**Code example:**
```cpp
class Base {
public:
    Base() {
        init();  // ❌ Calling pure virtual in constructor
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

**Explanation:**
During base class construction, the object's dynamic type is the base class, not the derived class. The vptr points to the base class's vtable. For pure virtual functions, the vtable entry is either null or points to an error function. Calling it results in undefined behavior, often a crash. This is a safety feature—if virtual dispatch worked in constructors, calling derived functions before derived members are initialized could access uninitialized memory. Never call virtual functions from constructors or destructors.

**Key takeaway:** Never call virtual (especially pure virtual) functions from constructors or destructors—it causes undefined behavior.

---

#### Q9: Is it legal to have a private pure virtual function?
**Difficulty:** #intermediate  
**Category:** #syntax #design_pattern  
**Concepts:** #pure_virtual #access_specifiers #override #template_method

**Answer:**
Yes, pure virtual functions can be private, and they can still be overridden in derived classes, with access control determining only who can call them.

**Code example:**
```cpp
class Base {
private:
    virtual void impl() = 0;  // ✅ Private pure virtual
public:
    void interface() {
        impl();  // Calls through vtable
    }
};

class Derived : public Base {
private:
    void impl() override {  // ✅ Can override private
        std::cout << "Derived impl\n";
    }
};
```

**Explanation:**
Access specifiers control calling permissions, not overriding capabilities. Private pure virtual functions are the foundation of the Template Method pattern, where the base class defines a public non-virtual interface that calls private virtual "hooks" that derived classes override. This separates the stable interface (public non-virtual) from the customizable implementation (private virtual), giving the base class control over when and how the virtual function is called.

**Key takeaway:** Private pure virtual functions enable the Template Method pattern and protect implementation details while allowing customization.

---

#### Q10: Can you have pointers or references to abstract classes?
**Difficulty:** #beginner  
**Category:** #syntax #memory  
**Concepts:** #abstract_class #pointers #references #polymorphism

**Answer:**
Yes, pointers and references to abstract classes are not only legal but essential for polymorphism, allowing code to work with derived objects through their abstract interface.

**Code example:**
```cpp
class Shape {
public:
    virtual double area() const = 0;
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

void printArea(const Shape& s) {  // ✅ Reference to abstract
    std::cout << "Area: " << s.area() << "\n";
}

int main() {
    Circle c(5.0);
    Shape* ptr = &c;  // ✅ Pointer to abstract
    printArea(c);     // ✅ Reference to abstract
}
```

**Explanation:**
While you cannot instantiate abstract classes, pointers and references to them are the cornerstone of polymorphism. They allow functions to accept any object that implements the interface without knowing the concrete type. This enables generic code that works with interfaces rather than implementations, promoting loose coupling and flexibility. The dynamic type of the object is determined at runtime, enabling virtual function calls to dispatch to the correct implementation.

**Key takeaway:** Use pointers and references to abstract classes to enable polymorphism and write code against interfaces.

---

#### Q11: What is the difference between an interface and an abstract class in C++?
**Difficulty:** #intermediate  
**Category:** #design_pattern #interview_favorite  
**Concepts:** #abstract_class #interface #pure_virtual #inheritance

**Answer:**
C++ doesn't have a distinct interface keyword—an interface is an abstract class with only pure virtual functions and no data members, while abstract classes can mix pure virtuals with data and concrete functions.

**Code example:**
```cpp
// Pure interface
class IInterface {
public:
    virtual void operation() = 0;
    virtual ~IInterface() = default;
    // No data members, no concrete functions
};

// Abstract class (not pure interface)
class AbstractBase {
protected:
    int data;  // ✅ Has data
public:
    AbstractBase(int d) : data(d) {}
    virtual void operation() = 0;  // Pure virtual
    int getData() const { return data; }  // ✅ Concrete function
};
```

**Explanation:**
In languages like Java, interfaces are distinct from abstract classes. C++ has no such distinction—both are abstract classes. By convention, a pure interface has all pure virtual functions, no data members, and no concrete methods (except possibly the destructor). Abstract classes that aren't pure interfaces provide partial implementation, mixing pure virtuals (contract) with concrete members (shared behavior). Pure interfaces enable multiple inheritance more safely because they have no state or implementation to conflict.

**Key takeaway:** Create pure interfaces (no data, only pure virtuals) for maximum flexibility and safe multiple inheritance.

---

#### Q12: Can an abstract class have regular (non-pure) virtual functions?
**Difficulty:** #beginner  
**Category:** #syntax  
**Concepts:** #abstract_class #virtual_functions #pure_virtual

**Answer:**
Yes, abstract classes can mix pure virtual functions (which must be overridden) with regular virtual functions (which can optionally be overridden) and non-virtual functions.

**Code example:**
```cpp
class Base {
public:
    virtual void mustOverride() = 0;  // ✅ Pure virtual
    
    virtual void canOverride() {  // ✅ Regular virtual
        std::cout << "Default implementation\n";
    }
    
    void concrete() {  // ✅ Non-virtual
        std::cout << "Base concrete\n";
    }
    
    virtual ~Base() = default;
};
```

**Explanation:**
Abstract classes aren't limited to pure virtuals—they can provide default implementations for some behaviors while requiring derived classes to implement others. This allows for sophisticated designs where the base class provides substantial shared functionality while leaving specific operations to derived classes. Regular virtual functions give derived classes the option to customize behavior, while pure virtuals mandate it. Non-virtual functions provide shared implementation that shouldn't be overridden.

**Key takeaway:** Mix pure virtual (required) with regular virtual (optional) and non-virtual (shared) functions in abstract classes.

---

#### Q13: Does adding a pure virtual function change object size?
**Difficulty:** #intermediate  
**Category:** #memory #performance  
**Concepts:** #pure_virtual #vtable #vptr #sizeof

**Answer:**
Adding the first virtual (or pure virtual) function adds a vptr to the object (typically 8 bytes on 64-bit), but additional virtual functions don't increase object size—they only add entries to the vtable.

**Code example:**
```cpp
class NoVirtual {
    int x;
};  // sizeof: typically 4

class OneVirtual {
    int x;
    virtual void f() = 0;
};  // sizeof: typically 16 (4 + 8 vptr + 4 padding)

class TwoVirtual {
    int x;
    virtual void f() = 0;
    virtual void g() = 0;
};  // sizeof: still typically 16
```

**Explanation:**
The first virtual function triggers the compiler to add a vptr (virtual pointer) to each object, pointing to the class's vtable. This increases object size by one pointer (8 bytes on 64-bit systems). However, additional virtual functions don't add more vptrs—they just add more entries to the shared vtable. The vtable is per-class (one copy shared by all objects), not per-object, so more virtual functions increase the vtable size but not the object size.

**Key takeaway:** The first virtual function adds a vptr to objects; additional virtuals don't increase object size.

---

#### Q14: Can you delete an object through a base pointer if the destructor isn't virtual?
**Difficulty:** #intermediate  
**Category:** #memory #interview_favorite  
**Concepts:** #destructors #virtual_functions #undefined_behavior #memory_leak

**Answer:**
Deleting through a base pointer without a virtual destructor causes undefined behavior—only the base destructor runs, leaking derived class resources.

**Code example:**
```cpp
class Base {
public:
    ~Base() {  // ❌ Not virtual
        std::cout << "~Base\n";
    }
    virtual void func() = 0;
};

class Derived : public Base {
    int* data;
public:
    Derived() : data(new int[100]) {}
    ~Derived() {
        delete[] data;  // ❌ Never called
        std::cout << "~Derived\n";
    }
    void func() override {}
};

Base* ptr = new Derived();
delete ptr;  // ❌ UB: only ~Base() runs, leaks data
```

**Explanation:**
Without a virtual destructor, the destructor call is resolved statically based on the pointer type. Since ptr is `Base*`, only `Base::~Base()` runs. The derived destructor never executes, so derived class resources aren't released. This is undefined behavior and causes resource leaks. Always make destructors virtual in polymorphic base classes, even if they do nothing. This ensures the complete destruction chain executes from most derived to base.

**Key takeaway:** Always use virtual destructors in polymorphic base classes to ensure proper cleanup.

---

#### Q15: What is the Template Method design pattern with pure virtuals?
**Difficulty:** #advanced  
**Category:** #design_pattern #interview_favorite  
**Concepts:** #pure_virtual #template_method #inheritance #polymorphism

**Answer:**
The Template Method pattern uses a base class to define an algorithm's structure with pure virtual "hooks" that derived classes override, allowing customization while maintaining the overall algorithm flow.

**Code example:**
```cpp
class DataProcessor {
private:
    virtual void readData() = 0;     // ✅ Must override
    virtual void processData() = 0;  // ✅ Must override
    virtual void writeData() = 0;    // ✅ Must override
    
public:
    void execute() {  // ✅ Template method (non-virtual)
        readData();
        processData();
        writeData();
    }
    virtual ~DataProcessor() = default;
};

class CSVProcessor : public DataProcessor {
private:
    void readData() override { /* CSV reading */ }
    void processData() override { /* Processing */ }
    void writeData() override { /* CSV writing */ }
};
```

**Explanation:**
The Template Method pattern inverts control—the base class controls the algorithm flow through a public non-virtual method, calling private pure virtual functions that derived classes must implement. This ensures the algorithm structure is preserved while allowing customization of specific steps. Making the hook methods private (or protected) prevents external code from calling them directly and ensures they're only called in the intended sequence. This pattern is common in frameworks and library code.

**Key takeaway:** Use Template Method with pure virtuals to enforce algorithm structure while allowing step customization.

---

#### Q16: Can you override only some pure virtual functions in a derived class?
**Difficulty:** #intermediate  
**Category:** #syntax #inheritance  
**Concepts:** #pure_virtual #abstract_class #partial_implementation

**Answer:**
Yes, a derived class can override some pure virtuals while leaving others unimplemented, remaining abstract until all pure virtuals are eventually overridden in the inheritance chain.

**Code example:**
```cpp
class Interface {
public:
    virtual void op1() = 0;
    virtual void op2() = 0;
    virtual void op3() = 0;
};

class PartialImpl : public Interface {
public:
    void op1() override { /* impl */ }
    // op2 and op3 not overridden - still abstract
};

class FullImpl : public PartialImpl {
public:
    void op2() override { /* impl */ }
    void op3() override { /* impl */ }
    // ✅ Now concrete
};
```

**Explanation:**
This allows for incremental implementation of complex interfaces and is useful in large inheritance hierarchies. Intermediate classes can provide partial implementations, grouping related operations or sharing code for subset of functionality. A class only becomes concrete (instantiable) when all inherited pure virtuals have been overridden somewhere in the chain. This design enables flexibility in how interfaces are implemented across an inheritance hierarchy.

**Key takeaway:** Classes remain abstract until all inherited pure virtuals are overridden, allowing partial implementations.

---

#### Q17: What happens if you hide a pure virtual function with a different signature?
**Difficulty:** #advanced  
**Category:** #syntax #interview_favorite  
**Concepts:** #pure_virtual #function_hiding #override

**Answer:**
Adding a function with the same name but different signature doesn't override the pure virtual—it hides it, leaving the class abstract and causing compilation errors.

**Code example:**
```cpp
class Base {
public:
    virtual void func() = 0;  // No parameters
};

class Derived : public Base {
public:
    void func(int x) {  // ❌ Different signature - hiding, not override
        std::cout << "Derived::func\n";
    }
};

int main() {
    // Derived d;  // ❌ Error: Derived is still abstract
}
```

**Explanation:**
Function hiding occurs when a derived class declares a function with the same name as a base function, regardless of signature. This hides all base overloads with that name. The pure virtual `func()` remains unimplemented, so `Derived` is still abstract. The `override` keyword would catch this error at compile-time by failing when the signature doesn't match. Always use `override` when you intend to override a virtual function to catch signature mismatches.

**Key takeaway:** Use the override keyword to catch accidental hiding when you intended to override pure virtuals.

---

#### Q18: Can abstract classes participate in multiple inheritance?
**Difficulty:** #intermediate  
**Category:** #inheritance #design_pattern  
**Concepts:** #abstract_class #multiple_inheritance #interface #diamond_problem

**Answer:**
Yes, abstract classes (especially pure interfaces) work well with multiple inheritance, allowing a class to implement multiple interfaces without the diamond problem if the base classes have no state.

**Code example:**
```cpp
class IDrawable {
public:
    virtual void draw() const = 0;
    virtual ~IDrawable() = default;
};

class ISerializable {
public:
    virtual std::string serialize() const = 0;
    virtual ~ISerializable() = default;
};

class Shape : public IDrawable, public ISerializable {
public:
    void draw() const override { /* impl */ }
    std::string serialize() const override { /* impl */ }
};
```

**Explanation:**
Multiple inheritance of pure interfaces is safe because there's no state or implementation to conflict. Each interface adds its own vtable, and the derived class must implement all pure virtuals from all bases. This pattern is common in component-based architectures where objects have multiple capabilities. The diamond problem only occurs when multiple bases share a common base with state, which pure interfaces avoid by having no data members.

**Key takeaway:** Pure interfaces enable safe multiple inheritance by avoiding state conflicts.

---

#### Q19: Why would you make a destructor pure virtual?
**Difficulty:** #advanced  
**Category:** #design_pattern #memory  
**Concepts:** #pure_virtual #destructors #abstract_class

**Answer:**
Making a destructor pure virtual is a way to make a class abstract when you have no other pure virtual functions, ensuring the class cannot be instantiated while providing a clean destructor chain.

**Code example:**
```cpp
class AbstractResource {
public:
    virtual ~AbstractResource() = 0;  // Makes class abstract
};

AbstractResource::~AbstractResource() {  // ✅ Must define
    // Cleanup code
}

class ConcreteResource : public AbstractResource {
public:
    ~ConcreteResource() override {
        // Derived cleanup
    }
};
```

**Explanation:**
Sometimes you want a class to be abstract but have no specific operations to make pure virtual. A pure virtual destructor solves this—it makes the class abstract while ensuring proper polymorphic destruction. Unlike other pure virtuals, the destructor must have a body because it's always called during destruction. This pattern is useful for abstract base classes that primarily provide common data or behavior rather than defining operations.

**Key takeaway:** Use a pure virtual destructor to make a class abstract when you have no other pure virtual functions.

---

#### Q20: Can you call a pure virtual function through a base class pointer?
**Difficulty:** #intermediate  
**Category:** #syntax #polymorphism  
**Concepts:** #pure_virtual #polymorphism #virtual_functions #vtable

**Answer:**
Yes, if the pointer points to a fully constructed derived object that has overridden the pure virtual function, calling it through a base pointer works correctly via dynamic dispatch.

**Code example:**
```cpp
class Base {
public:
    virtual void operation() = 0;
    virtual ~Base() = default;
};

class Derived : public Base {
public:
    void operation() override {
        std::cout << "Derived operation\n";
    }
};

int main() {
    Base* ptr = new Derived();  // ✅ Points to Derived
    ptr->operation();  // ✅ Calls Derived::operation via vtable
    delete ptr;
}
```

**Explanation:**
Pure virtual doesn't mean "cannot be called"—it means "must be overridden before instantiation." Once a derived class provides an implementation and you have a fully constructed object, calling the function through a base pointer works normally via virtual dispatch. The vptr in the derived object points to Derived's vtable, which contains the address of Derived's implementation. This is the whole point of pure virtuals: defining interfaces that work polymorphically once implemented.

**Key takeaway:** Pure virtual functions are called polymorphically through base pointers when overridden in derived classes.

---

### PRACTICE_TASKS: Output Prediction and Behavior Analysis

#### Q1
```cpp
#include <iostream>

class A {
public:
    virtual void foo() = 0;
};

class B : public A {
    // no override
};

int main() {
    B b;
}
```

#### Q2
```cpp
#include <iostream>

class A {
public:
    A() { f(); }
    virtual void f() = 0;
};

class B : public A {
public:
    void f() override { std::cout << "B::f()\n"; }
};

int main() {
    B b;
}
```

#### Q3
```cpp
#include <iostream>

class A {
public:
    virtual ~A() = 0;
};

int main() {
    A* a = nullptr;
}
```

#### Q4
```cpp
#include <iostream>

class A {
public:
    virtual void f() = 0;
};

class B : public A {};

class C : public B {
public:
    void f() override { std::cout << "C::f\n"; }
};

int main() {
    C c;
    c.f();
}
```

#### Q5
```cpp
#include <iostream>

class A {
public:
    virtual void foo() = 0;
    virtual ~A() {}
};

class B : public A {
public:
    void foo() override { std::cout << "B::foo\n"; }
    ~B() { std::cout << "B::~B\n"; }
};

int main() {
    A* a = new B();
    a->foo();
    delete a;
}
```

#### Q6
```cpp
#include <iostream>

class A {
public:
    virtual void f() = 0;
    void g() { std::cout << "A::g\n"; }
};

class B : public A {
public:
    void f() override { std::cout << "B::f\n"; }
};

int main() {
    A* a = new B();
    a->g();
    delete a;
}
```

#### Q7
```cpp
#include <iostream>

class A {
public:
    virtual void f() = 0;
    virtual ~A() = 0;
};

A::~A() {
    std::cout << "A::~A\n";
}

class B : public A {
public:
    void f() override { std::cout << "B::f\n"; }
    ~B() { std::cout << "B::~B\n"; }
};

int main() {
    A* a = new B();
    delete a;
}
```

#### Q8
```cpp
#include <iostream>

class A {
public:
    virtual void foo() = 0;
};

class B : public A {
public:
    void foo() override final { std::cout << "B::foo\n"; }
};

class C : public B {
public:
    void foo() override { std::cout << "C::foo\n"; }
};
```

#### Q9
```cpp
#include <iostream>

class A {
public:
    virtual void foo() = 0;
};

void A::foo() {
    std::cout << "A::foo body\n";
}

class B : public A {
public:
    void foo() override {
        A::foo();
        std::cout << "B::foo\n";
    }
};

int main() {
    B b;
    b.foo();
}
```

#### Q10
```cpp
#include <iostream>

class A {
public:
    virtual void foo() = 0;
};

class B : public A {
private:
    void foo() override { std::cout << "B::foo\n"; }
};

int main() {
    B b;
    b.foo();
}
```

#### Q11
```cpp
#include <iostream>

class A {
public:
    virtual void f() = 0;
};

class B : public A {
public:
    void f() override { std::cout << "B::f\n"; }
};

class C : public B {
};

int main() {
    C c;
    c.f();
}
```

#### Q12
```cpp
#include <iostream>

class A {
public:
    virtual void f() = 0;
};

class B : public A {
public:
    void f(int) { std::cout << "B::f(int)\n"; }
};

int main() {
    B b;
}
```

#### Q13
```cpp
#include <iostream>

class A {
public:
    A() { std::cout << "A()\n"; }
    virtual void f() = 0;
    virtual ~A() { std::cout << "~A()\n"; }
};

class B : public A {
public:
    B() { std::cout << "B()\n"; }
    void f() override { std::cout << "B::f\n"; }
    ~B() { std::cout << "~B()\n"; }
};

int main() {
    A* a = new B();
    delete a;
}
```

#### Q14
```cpp
#include <iostream>

class A {
public:
    virtual void f() = 0;
};

class B : public A {
public:
    void f() override { std::cout << "B\n"; }
};

class C : public B {
public:
    void f() override { std::cout << "C\n"; }
};

int main() {
    A* a = new C();
    a->f();
    delete a;
}
```

#### Q15
```cpp
#include <iostream>

class A {
private:
    virtual void impl() = 0;
public:
    void interface() { impl(); }
    virtual ~A() = default;
};

class B : public A {
private:
    void impl() override { std::cout << "B::impl\n"; }
};

int main() {
    B b;
    b.interface();
}
```

#### Q16
```cpp
#include <iostream>

class A {
public:
    virtual void foo() = 0;
    virtual void bar() { std::cout << "A::bar\n"; }
};

class B : public A {
public:
    void foo() override { std::cout << "B::foo\n"; }
};

int main() {
    A* a = new B();
    a->foo();
    a->bar();
    delete a;
}
```

#### Q17
```cpp
#include <iostream>

class Base {
public:
    virtual ~Base() {
        std::cout << "~Base\n";
    }
    virtual void func() = 0;
};

class Derived : public Base {
public:
    ~Derived() {
        std::cout << "~Derived\n";
    }
    void func() override { std::cout << "Derived::func\n"; }
};

int main() {
    Base* b = new Derived();
    delete b;
}
```

#### Q18
```cpp
#include <iostream>

class A {
public:
    virtual void f() = 0;
};

class B : public A {
public:
    void f() override { std::cout << "B::f\n"; }
};

int main() {
    A a;
}
```

#### Q19
```cpp
#include <iostream>

class Interface {
public:
    virtual void op1() = 0;
    virtual void op2() = 0;
};

class Impl : public Interface {
public:
    void op1() override { std::cout << "op1\n"; }
    void op2() override { std::cout << "op2\n"; }
};

int main() {
    Interface* i = new Impl();
    i->op1();
    i->op2();
    delete i;
}
```

#### Q20
```cpp
#include <iostream>

class A {
public:
    A() { std::cout << "A()\n"; }
    virtual void f() = 0;
};

class B : public A {
public:
    B() : A() { std::cout << "B()\n"; }
    void f() override { std::cout << "B::f\n"; }
};

int main() {
    B b;
}
```

### QUICK_REFERENCE: Answer Keys and Summary Tables

#### Answer Key for Practice Questions

| Q# | Answer | Explanation | Key Concept |
|----|--------|-------------|-------------|
| 1 | Compilation Error | B doesn't override pure virtual foo(), so B is abstract and cannot be instantiated | #abstract_class #pure_virtual |
| 2 | Undefined Behavior or Crash | Calling pure virtual f() from A's constructor before vptr is set to B's vtable causes UB | #constructors #undefined_behavior |
| 3 | Compiles but Linker Error | Pure virtual destructor declared but not defined causes linker error if instantiation attempted | #pure_virtual #destructors |
| 4 | C::f | C overrides the pure virtual, making it concrete; intermediate B can remain abstract | #inheritance #override |
| 5 | B::foo<br>B::~B | Virtual destructor ensures proper cleanup; foo() called polymorphically | #virtual_destructors #polymorphism |
| 6 | A::g | Non-virtual g() called on base pointer uses static binding, calls A's version | #static_binding |
| 7 | B::~B<br>A::~A | Pure virtual destructor with body enables proper destruction chain | #pure_virtual #destructors |
| 8 | Compilation Error | final prevents further overriding; C's attempt to override causes error | #final #override |
| 9 | A::foo body<br>B::foo | Pure virtual can have body; B explicitly calls it then adds own logic | #pure_virtual #function_body |
| 10 | Compilation Error | Private foo() in B cannot be called from main; access violation | #access_specifiers #override |
| 11 | B::f | C inherits B's override of f(); C is concrete because f() is overridden in hierarchy | #inheritance #override |
| 12 | Compilation Error | f(int) doesn't override f(); B is still abstract and cannot be instantiated | #function_hiding #pure_virtual |
| 13 | A()<br>B()<br>~B()<br>~A() | Construction order: base to derived; destruction order: derived to base | #constructors #destructors |
| 14 | C | Multi-level inheritance with virtual dispatch correctly calls C's override | #polymorphism #inheritance |
| 15 | B::impl | Private pure virtual overridden in B, called through public interface (Template Method) | #template_method #pure_virtual |
| 16 | B::foo<br>A::bar | foo() overridden in B; bar() not overridden, uses A's implementation | #polymorphism #virtual_functions |
| 17 | ~Derived<br>~Base | Virtual destructor ensures derived destructor called before base | #virtual_destructors |
| 18 | Compilation Error | Cannot instantiate abstract class A directly | #abstract_class #instantiation |
| 19 | op1<br>op2 | Both pure virtuals overridden in Impl; polymorphic calls work correctly | #interface #polymorphism |
| 20 | A()<br>B() | Explicit call to A() in initializer list is redundant but legal; base constructed then derived | #constructors #initialization |

#### Pure Virtual vs Regular Virtual

| Feature | Pure Virtual | Regular Virtual |
|---------|--------------|-----------------|
| Syntax | `= 0` suffix | No suffix |
| Body | Optional (can have) | Always has body |
| Override Required | Yes, to make class concrete | No, override optional |
| Makes Class Abstract | Yes | No |
| Can Be Called | Yes, if overridden | Yes, always |
| Used For | Defining interfaces | Providing customizable behavior |

#### Abstract Class Characteristics

| Aspect | Behavior |
|--------|----------|
| Instantiation | Cannot instantiate directly |
| Pointers/References | Can create pointers and references |
| Constructors | Can have constructors (called during derived construction) |
| Destructors | Should be virtual; can be pure virtual |
| Data Members | Can have data members |
| Concrete Methods | Can have regular member functions |
| Purpose | Define interfaces and contracts |

#### Common Pure Virtual Patterns

| Pattern | Use Case | Example |
|---------|----------|---------|
| Pure Interface | No data, only pure virtuals | Interface with multiple pure virtuals |
| Template Method | Algorithm structure with hooks | Public non-virtual calls private pure virtuals |
| Abstract Factory | Object creation interface | Pure virtual `create()` methods |
| Strategy | Interchangeable algorithms | Pure virtual `execute()` method |
| Pure Virtual Destructor | Make class abstract | When no other pure virtuals exist |

#### Virtual Destructor Rules

| Scenario | Destructor Type | Reason |
|----------|----------------|---------|
| Polymorphic base class | Virtual | Ensures derived destructors called |
| Non-polymorphic class | Non-virtual | No inheritance intended |
| Abstract class, no other pure virtuals | Pure virtual (with body) | Makes class abstract |
| Interface (pure abstract) | Virtual (defaulted) | Enables polymorphic deletion |

#### Common Mistakes and Solutions

| Mistake | Problem | Solution |
|---------|---------|----------|
| Forgot to override pure virtual | Class remains abstract | Use override keyword to catch |
| No body for pure virtual destructor | Linker error | Always define pure virtual destructors |
| Called pure virtual in constructor | Undefined behavior/crash | Never call virtuals in constructors |
| Non-virtual destructor in base | Resource leak, UB | Always use virtual destructors |
| Wrong signature "override" | Function hiding, not override | Use override keyword for compile-time check |
| Forgot to make destructor virtual | Derived destructor not called | Make base destructor virtual |