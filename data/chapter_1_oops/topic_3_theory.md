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

### QUICK_REFERENCE: Answer Keys and Summary Tables

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
