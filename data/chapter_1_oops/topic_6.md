## TOPIC: Rule of Five, Destructors, and Object Slicing - Advanced Concepts

### THEORY_SECTION: Deep Dive into Resource Management Edge Cases

#### The Rule of Five in Complex Scenarios

The **Rule of Five** extends beyond basic resource management to encompass subtle interactions between special member functions, compiler generation rules, and object lifetime management. Understanding when declaring one special member function suppresses others is crucial: defining a destructor prevents automatic move constructor generation, while defining move operations suppresses automatic copy operations. These interdependencies create complex scenarios where partial implementation of the rule leads to surprising behavior, inefficient code, or outright bugs. Modern C++ demands explicit awareness of these generation rules, especially when mixing inheritance hierarchies, polymorphism, and resource ownership patterns.

The relationship between the Rule of Five and virtual destructors introduces additional complexity. When a base class requires polymorphic destruction, the virtual destructor declaration affects which other special members the compiler generates. Combined with move semantics, this creates scenarios where base classes need careful design: virtual destructors should be explicitly defaulted when no custom cleanup is needed, move operations should be explicitly defined or deleted to clarify intent, and derived classes must respect the base class's resource management strategy. Failure to properly coordinate these elements across inheritance hierarchies leads to resource leaks, double-deletion, or slicing issues.

#### Virtual Destructors and Object Slicing Interactions

**Virtual destructors** serve a critical role beyond simple polymorphism—they're the cornerstone of safe polymorphic resource management. Without a virtual destructor, deleting a derived object through a base pointer invokes undefined behavior by calling only the base destructor, leaking derived class resources. This issue becomes particularly insidious with smart pointers: even `std::shared_ptr<Base>` requires a virtual destructor in the base class, as the deleter is determined at construction time. The vtable overhead of virtual destructors is negligible compared to the safety they provide, yet many developers either forget them or incorrectly assume smart pointers eliminate the need.

**Object slicing** represents a fundamental mismatch between C++'s value semantics and polymorphic programming. When a derived object is copied to a base object by value, the derived portion is "sliced off," losing both data members and overridden virtual function behavior. This occurs silently during function parameter passing, container insertion, and assignment operations, making it a common source of bugs. The slicing problem extends beyond simple data loss—sliced objects lose their vtable pointer to derived class virtual functions, destroying polymorphic behavior. Modern C++ addresses this through explicit deletion of copy operations in polymorphic bases, strict use of references and pointers for polymorphic types, and smart pointer containers that preserve object identity.

### EDGE_CASES: Tricky Scenarios and Subtle Behaviors

#### Edge Case 1: Deleting Derived Objects Through Base Pointers Without Virtual Destructors

The most dangerous scenario in C++ inheritance: deleting a derived object through a base pointer when the base class lacks a virtual destructor causes undefined behavior. Only the base class destructor executes, leaking all resources allocated by the derived class and potentially corrupting memory.

```cpp
class Base {
public:
    ~Base() {  // ❌ Not virtual
        std::cout << "Base destructor\n";
    }
};

class Derived : public Base {
    int* largeArray;
public:
    Derived() : largeArray(new int[10000]) {}
    ~Derived() {
        delete[] largeArray;  // ❌ Never called through base pointer
        std::cout << "Derived destructor\n";
    }
};

int main() {
    Base* ptr = new Derived();
    delete ptr;  // ❌ UB: only Base::~Base() runs, leaks largeArray
}
```

This undefined behavior is particularly insidious because it may appear to work in debug builds or simple test cases, only to cause crashes or memory leaks in production. Modern compilers may warn about this, but it's not guaranteed. The fix is simple but must be applied consistently: make base class destructors virtual whenever the class is intended for polymorphic use.

#### Edge Case 2: Pure Virtual Destructors Require Definitions

A pure virtual destructor makes a class abstract while still allowing proper cleanup, but unlike other pure virtual functions, it **must** have a body defined. This is because destructors are always called during object destruction, even for pure virtual ones.

```cpp
class AbstractBase {
public:
    virtual ~AbstractBase() = 0;  // ✅ Makes class abstract
};

// ❌ Linker error without this definition
AbstractBase::~AbstractBase() {
    std::cout << "AbstractBase cleanup\n";
}

class Concrete : public AbstractBase {
public:
    ~Concrete() override {
        std::cout << "Concrete cleanup\n";
    }
};

int main() {
    AbstractBase* obj = new Concrete();
    delete obj;  // Calls Concrete::~Concrete() then AbstractBase::~AbstractBase()
}
```

The pure virtual destructor declaration prevents instantiation of the base class while ensuring the derived destructor chain executes properly. Forgetting to define the pure virtual destructor body causes cryptic linker errors about undefined symbols, confusing developers unfamiliar with this requirement.

#### Edge Case 3: Deleted Destructors for Lifetime Control

Explicitly deleting the destructor prevents object destruction, forcing controlled lifetime management through factory functions or specific deletion methods. This pattern enforces heap-only allocation or ensures objects are destroyed only through specific interfaces.

```cpp
class ControlledLifetime {
private:
    ControlledLifetime() {}
    ~ControlledLifetime() = delete;  // ❌ Cannot destroy normally
    
public:
    static ControlledLifetime* create() {
        return new ControlledLifetime();
    }
    
    void destroy() {
        this->~ControlledLifetime();  // ✅ Can call from within class
        operator delete(this);
    }
};

int main() {
    // ControlledLifetime obj;  // ❌ Error: deleted destructor
    ControlledLifetime* obj = ControlledLifetime::create();
    // delete obj;  // ❌ Error: deleted destructor
    obj->destroy();  // ✅ OK: controlled destruction
}
```

This idiom is useful for reference-counted objects, objects managed by pools, or resources requiring specific cleanup sequences. The deleted destructor prevents accidental stack allocation or direct `delete` calls, forcing users through the controlled interface.

#### Edge Case 4: Object Slicing During Function Parameter Passing

Object slicing silently occurs when passing derived objects by value to functions accepting base class parameters. The derived portion is discarded, and polymorphic behavior is lost because the vtable pointer is changed to point to the base class table.

```cpp
class Shape {
public:
    int id = 0;
    virtual void draw() { std::cout << "Shape\n"; }
};

class Circle : public Shape {
public:
    double radius = 5.0;
    void draw() override { std::cout << "Circle with radius " << radius << "\n"; }
};

void render(Shape s) {  // ❌ Pass by value causes slicing
    s.draw();  // Always calls Shape::draw(), never Circle::draw()
}

int main() {
    Circle c;
    c.id = 42;
    render(c);  // Output: "Shape" (not "Circle")
}
```

The Circle object is sliced to a Shape object when passed to render(), losing the radius member and reverting draw() to Shape's implementation. This violates the principle of polymorphism and is almost never intentional. Always pass polymorphic objects by reference or pointer to preserve their full type.

#### Edge Case 5: Slicing in Container Insertions

Standard containers store elements by value, causing object slicing when derived objects are inserted into containers of base class type. This destroys polymorphism and loses derived class data, making container-based polymorphism impossible with direct object storage.

```cpp
std::vector<Shape> shapes;
Circle c;
c.radius = 10.0;
shapes.push_back(c);  // ❌ Slicing: stores only Shape part

shapes[0].draw();  // Prints "Shape", not "Circle"
```

The solution is to store pointers (raw or smart) to the base class instead of objects directly. Using `std::vector<std::unique_ptr<Shape>>` preserves polymorphism because the container stores pointers, not objects, avoiding slicing entirely.

#### Edge Case 6: Smart Pointers and Virtual Destructors

Smart pointers like `std::shared_ptr` and `std::unique_ptr` don't eliminate the need for virtual destructors. While they manage deletion automatically, they determine the deleter based on the pointer type, requiring a virtual destructor for correct polymorphic cleanup.

```cpp
class Base {
public:
    ~Base() { std::cout << "Base\n"; }  // ❌ Not virtual
};

class Derived : public Base {
public:
    ~Derived() { std::cout << "Derived\n"; }
};

int main() {
    std::shared_ptr<Base> ptr = std::make_shared<Derived>();
    // ❌ When ptr is destroyed, only Base::~Base() runs
}
```

The shared_ptr's deleter is set at construction to match the static type, but without a virtual destructor, the wrong destructor chain executes. Virtual destructors are essential for polymorphic smart pointer usage, a commonly misunderstood requirement.

### CODE_EXAMPLES: Practical Demonstrations

#### Example 1: Correct Virtual Destructor Implementation

```cpp
class Resource {
    int* data;
public:
    Resource(int size) : data(new int[size]) {
        std::cout << "Resource allocated\n";
    }
    
    virtual ~Resource() {  // ✅ Virtual for safe inheritance
        delete[] data;
        std::cout << "Resource freed\n";
    }
};

class TrackedResource : public Resource {
    std::string name;
public:
    TrackedResource(int size, std::string n) 
        : Resource(size), name(n) {
        std::cout << "TrackedResource " << name << " created\n";
    }
    
    ~TrackedResource() override {
        std::cout << "TrackedResource " << name << " destroyed\n";
    }
};

int main() {
    Resource* r = new TrackedResource(100, "MyResource");
    delete r;  // ✅ Both destructors called in correct order
}
```

This demonstrates proper virtual destructor usage in an inheritance hierarchy. The base class destructor is virtual, ensuring that deleting through a base pointer correctly calls the derived destructor first, then the base destructor, preventing resource leaks.

#### Example 2: Pure Virtual Destructor Pattern

```cpp
class IInterface {
public:
    virtual void operation() = 0;
    virtual ~IInterface() = 0;  // ✅ Makes class abstract via destructor
};

// ✅ Must define, even though pure
IInterface::~IInterface() {
    std::cout << "IInterface cleanup\n";
}

class Implementation : public IInterface {
public:
    void operation() override {
        std::cout << "Implementation\n";
    }
    
    ~Implementation() override {
        std::cout << "Implementation cleanup\n";
    }
};

int main() {
    // IInterface i;  // ❌ Error: abstract class
    IInterface* i = new Implementation();
    i->operation();
    delete i;  // ✅ Both destructors execute
}
```

Pure virtual destructors provide a way to make a class abstract without requiring any pure virtual functions for operations. The destructor still needs a body because the destructor chain always executes, unlike pure virtual functions which may never be called.

#### Example 3: Deleted Destructor for Factory Pattern

```cpp
class DatabaseConnection {
private:
    std::string connectionString;
    
    DatabaseConnection(std::string conn) 
        : connectionString(conn) {}
    
    ~DatabaseConnection() = delete;  // ❌ Prevents direct destruction
    
public:
    static DatabaseConnection* connect(std::string conn) {
        return new DatabaseConnection(conn);
    }
    
    void disconnect() {
        std::cout << "Disconnecting from " << connectionString << "\n";
        this->~DatabaseConnection();  // ✅ Accessible internally
        operator delete(this);
    }
};

int main() {
    DatabaseConnection* db = DatabaseConnection::connect("localhost:5432");
    // delete db;  // ❌ Error: deleted destructor
    db->disconnect();  // ✅ Controlled cleanup
}
```

The deleted destructor enforces that connections can only be closed through the disconnect() method, preventing accidental destruction and ensuring proper cleanup sequences. This pattern is useful for resources requiring specific shutdown procedures.

#### Example 4: Preventing Slicing Through Interface Design

```cpp
class Shape {
public:
    virtual void draw() const = 0;
    virtual std::unique_ptr<Shape> clone() const = 0;
    virtual ~Shape() = default;
    
protected:
    // ✅ Protected copy operations prevent slicing
    Shape(const Shape&) = default;
    Shape& operator=(const Shape&) = default;
};

class Circle : public Shape {
    double radius;
public:
    explicit Circle(double r) : radius(r) {}
    
    void draw() const override {
        std::cout << "Circle with radius " << radius << "\n";
    }
    
    std::unique_ptr<Shape> clone() const override {
        return std::make_unique<Circle>(*this);
    }
};

void render(const Shape& s) {  // ✅ Pass by reference
    s.draw();
}

int main() {
    Circle c(10.0);
    render(c);  // ✅ Polymorphism works, no slicing
    
    // Shape s = c;  // ❌ Error: copy constructor is protected
}
```

Making copy operations protected in the base class prevents slicing at compile time. Users must pass polymorphic objects by reference or pointer, and cloning must be explicit through a virtual clone() method that preserves the full derived type.

#### Example 5: Safe Container Usage with Polymorphism

```cpp
class Animal {
public:
    virtual void speak() const = 0;
    virtual ~Animal() = default;
    
protected:
    Animal() = default;
    Animal(const Animal&) = delete;  // ✅ Prevent slicing
    Animal& operator=(const Animal&) = delete;
};

class Dog : public Animal {
public:
    void speak() const override {
        std::cout << "Woof!\n";
    }
};

class Cat : public Animal {
public:
    void speak() const override {
        std::cout << "Meow!\n";
    }
};

int main() {
    // std::vector<Animal> animals;  // ❌ Would slice
    
    std::vector<std::unique_ptr<Animal>> animals;  // ✅ Stores pointers
    animals.push_back(std::make_unique<Dog>());
    animals.push_back(std::make_unique<Cat>());
    
    for (const auto& animal : animals) {
        animal->speak();  // ✅ Polymorphism preserved
    }
}
```

Storing smart pointers to the base class in containers preserves polymorphism. Deleting copy operations in the base class prevents accidental slicing while clarifying that these objects should only exist via pointers or references.

#### Example 6: Trivial vs Non-Trivial Destructors

```cpp
struct Trivial {
    int x;
    // ✅ Implicitly generated trivial destructor
};

struct NonTrivial {
    int x;
    ~NonTrivial() {}  // ❌ User-defined, now non-trivial
};

static_assert(std::is_trivially_destructible_v<Trivial>);
static_assert(!std::is_trivially_destructible_v<NonTrivial>);

// Impact on memcpy safety and optimizations
Trivial arr1[100];
Trivial arr2[100];
std::memcpy(arr2, arr1, sizeof(arr1));  // ✅ Safe for trivial types

NonTrivial arr3[100];
NonTrivial arr4[100];
// std::memcpy(arr4, arr3, sizeof(arr3));  // ⚠️ Unsafe, skips destructors
std::copy(std::begin(arr3), std::end(arr3), std::begin(arr4));  // ✅ Safe
```

Trivial destructors enable optimizations like memcpy for bulk operations and affect whether a type is POD (Plain Old Data). Even an empty user-defined destructor makes the type non-trivial, affecting move semantics and standard library optimizations.

#### Example 7: Move Operations Suppressed by Destructor

```cpp
class Resource {
public:
    Resource() = default;
    ~Resource() {}  // ❌ User-defined destructor
    
    // Move constructor NOT generated automatically
};

static_assert(!std::is_move_constructible_v<Resource>);

class BetterResource {
public:
    BetterResource() = default;
    ~BetterResource() {}
    
    // ✅ Explicitly default move operations
    BetterResource(BetterResource&&) = default;
    BetterResource& operator=(BetterResource&&) = default;
};

static_assert(std::is_move_constructible_v<BetterResource>);
```

Defining a destructor suppresses automatic move constructor generation, forcing either inefficient copying or explicit move operation definition. This is a common source of performance bugs when legacy code adds destructors without considering move semantics.

#### Example 8: Virtual Destructor Overhead Analysis

```cpp
struct NoVirtual {
    int data;
};

struct WithVirtual {
    int data;
    virtual ~WithVirtual() = default;
};

int main() {
    std::cout << "NoVirtual: " << sizeof(NoVirtual) << " bytes\n";
    std::cout << "WithVirtual: " << sizeof(WithVirtual) << " bytes\n";
    // Typically: 4 vs 16 bytes (64-bit system with vptr)
}
```

Virtual destructors add a vptr to each object, increasing size by one pointer (8 bytes on 64-bit systems). For classes with few data members, this overhead is significant, but for polymorphic classes managing resources, the safety benefit far outweighs the cost.

#### Example 9: Autonomous Vehicle - Planning Algorithm with Rule of Five and Virtual Destructors

```cpp
#include <iostream>
#include <memory>
#include <vector>
#include <cstring>
using namespace std;

// Abstract base for path planning algorithms
class PathPlanner {
protected:
    char* algorithm_name;
    size_t name_length;
    int planning_horizon_ms;

public:
    PathPlanner(const char* name, int horizon)
        : name_length(strlen(name)), planning_horizon_ms(horizon) {
        algorithm_name = new char[name_length + 1];
        strcpy(algorithm_name, name);
        cout << "PathPlanner: Constructed " << algorithm_name << endl;
    }

    // ✅ Virtual destructor for polymorphic hierarchy
    virtual ~PathPlanner() {
        if (algorithm_name != nullptr) {
            cout << "PathPlanner: Destroying " << algorithm_name << endl;
            delete[] algorithm_name;
        }
    }

    // ✅ Copy constructor
    PathPlanner(const PathPlanner& other)
        : name_length(other.name_length),
          planning_horizon_ms(other.planning_horizon_ms) {
        algorithm_name = new char[name_length + 1];
        strcpy(algorithm_name, other.algorithm_name);
        cout << "PathPlanner: Copy constructed " << algorithm_name << endl;
    }

    // ✅ Copy assignment operator
    PathPlanner& operator=(const PathPlanner& other) {
        if (this != &other) {
            // Allocate new before deleting old (exception safety)
            char* new_name = new char[other.name_length + 1];
            strcpy(new_name, other.algorithm_name);

            delete[] algorithm_name;
            algorithm_name = new_name;
            name_length = other.name_length;
            planning_horizon_ms = other.planning_horizon_ms;

            cout << "PathPlanner: Copy assigned to " << algorithm_name << endl;
        }
        return *this;
    }

    // ✅ Move constructor
    PathPlanner(PathPlanner&& other) noexcept
        : algorithm_name(other.algorithm_name),
          name_length(other.name_length),
          planning_horizon_ms(other.planning_horizon_ms) {
        other.algorithm_name = nullptr;
        other.name_length = 0;
        cout << "PathPlanner: Move constructed" << endl;
    }

    // ✅ Move assignment operator
    PathPlanner& operator=(PathPlanner&& other) noexcept {
        if (this != &other) {
            delete[] algorithm_name;

            algorithm_name = other.algorithm_name;
            name_length = other.name_length;
            planning_horizon_ms = other.planning_horizon_ms;

            other.algorithm_name = nullptr;
            other.name_length = 0;

            cout << "PathPlanner: Move assigned" << endl;
        }
        return *this;
    }

    // Pure virtual function
    virtual void plan() const = 0;

    const char* getName() const { return algorithm_name; }

protected:
    // ✅ Protected copy to prevent slicing
    // (Note: We provide public copy for demonstration, but in production
    // consider making these protected and providing a virtual clone() method)
};

// Derived class: A* planner
class AStarPlanner : public PathPlanner {
    int* heuristic_weights;  // Dynamic array
    size_t num_weights;

public:
    AStarPlanner(int horizon, size_t weights_count)
        : PathPlanner("A*", horizon),
          num_weights(weights_count),
          heuristic_weights(new int[weights_count]) {
        for (size_t i = 0; i < num_weights; ++i) {
            heuristic_weights[i] = i * 10;
        }
        cout << "AStarPlanner: Constructed with " << num_weights << " weights" << endl;
    }

    // ✅ Virtual destructor override
    ~AStarPlanner() override {
        cout << "AStarPlanner: Destroying (cleaning up weights)" << endl;
        delete[] heuristic_weights;
    }

    // For completeness, should implement Rule of Five for derived class too
    AStarPlanner(const AStarPlanner& other)
        : PathPlanner(other), num_weights(other.num_weights) {
        heuristic_weights = new int[num_weights];
        memcpy(heuristic_weights, other.heuristic_weights, num_weights * sizeof(int));
    }

    AStarPlanner& operator=(const AStarPlanner& other) {
        if (this != &other) {
            PathPlanner::operator=(other);
            int* new_weights = new int[other.num_weights];
            memcpy(new_weights, other.heuristic_weights, other.num_weights * sizeof(int));
            delete[] heuristic_weights;
            heuristic_weights = new_weights;
            num_weights = other.num_weights;
        }
        return *this;
    }

    void plan() const override {
        cout << "AStarPlanner: Planning with " << num_weights
             << " heuristic weights" << endl;
    }
};

// Derived class: RRT planner
class RRTPlanner : public PathPlanner {
    double* random_samples;
    size_t num_samples;

public:
    RRTPlanner(int horizon, size_t samples)
        : PathPlanner("RRT", horizon),
          num_samples(samples),
          random_samples(new double[samples]) {
        for (size_t i = 0; i < num_samples; ++i) {
            random_samples[i] = i * 0.1;
        }
        cout << "RRTPlanner: Constructed with " << num_samples << " samples" << endl;
    }

    // ✅ Virtual destructor override
    ~RRTPlanner() override {
        cout << "RRTPlanner: Destroying (cleaning up samples)" << endl;
        delete[] random_samples;
    }

    void plan() const override {
        cout << "RRTPlanner: Planning with " << num_samples << " random samples" << endl;
    }
};

// ❌ DANGEROUS: Function that causes slicing
void demonstrateSlicing(PathPlanner planner) {  // Pass by value
    planner.plan();  // ❌ Will call PathPlanner::plan() even for derived types
}

// ✅ SAFE: Function that preserves polymorphism
void demonstratePolymorphism(const PathPlanner& planner) {  // Pass by reference
    planner.plan();  // ✅ Correctly calls derived class implementation
}

int main() {
    cout << "=== Rule of Five with Virtual Destructors ===" << endl;

    // ✅ Polymorphic usage through base pointer
    PathPlanner* planner1 = new AStarPlanner(1000, 5);
    PathPlanner* planner2 = new RRTPlanner(1500, 10);

    cout << "\nPlanning with polymorphic pointers:" << endl;
    planner1->plan();
    planner2->plan();

    cout << "\nDeleting through base pointers (virtual destructors work):" << endl;
    delete planner1;  // ✅ Calls AStarPlanner::~AStarPlanner() then PathPlanner::~PathPlanner()
    delete planner2;  // ✅ Calls RRTPlanner::~RRTPlanner() then PathPlanner::~PathPlanner()

    cout << "\n=== Safe Container Usage (No Slicing) ===" << endl;

    // ✅ Store smart pointers to preserve polymorphism
    vector<unique_ptr<PathPlanner>> planners;
    planners.push_back(make_unique<AStarPlanner>(2000, 3));
    planners.push_back(make_unique<RRTPlanner>(2500, 8));

    cout << "\nExecuting plans from container:" << endl;
    for (const auto& planner : planners) {
        planner->plan();  // ✅ Polymorphism preserved
    }

    cout << "\n=== Demonstrating Object Slicing Danger ===" << endl;

    AStarPlanner astar(1000, 4);
    cout << "\nCalling function with pass-by-value (slicing occurs):" << endl;
    // demonstrateSlicing(astar);  // ❌ Would slice and lose AStarPlanner portion

    cout << "\nCalling function with pass-by-reference (no slicing):" << endl;
    demonstratePolymorphism(astar);  // ✅ Polymorphism preserved

    cout << "\n=== Move Semantics ===" << endl;

    AStarPlanner temp_planner(500, 2);
    cout << "\nMoving planner:" << endl;
    AStarPlanner moved_planner = move(temp_planner);  // ✅ Move constructor

    cout << "\n=== Cleanup (destructors will be called) ===" << endl;
    // planners vector destroyed here (unique_ptrs automatically delete)
    // Local objects destroyed here

    return 0;
}
```

**Expected Output:**
```
=== Rule of Five with Virtual Destructors ===
PathPlanner: Constructed A*
AStarPlanner: Constructed with 5 weights
PathPlanner: Constructed RRT
RRTPlanner: Constructed with 10 samples

Planning with polymorphic pointers:
AStarPlanner: Planning with 5 heuristic weights
RRTPlanner: Planning with 10 random samples

Deleting through base pointers (virtual destructors work):
AStarPlanner: Destroying (cleaning up weights)
PathPlanner: Destroying A*
RRTPlanner: Destroying (cleaning up samples)
PathPlanner: Destroying RRT

=== Safe Container Usage (No Slicing) ===
PathPlanner: Constructed A*
AStarPlanner: Constructed with 3 weights
PathPlanner: Constructed RRT
RRTPlanner: Constructed with 8 samples

Executing plans from container:
AStarPlanner: Planning with 3 heuristic weights
RRTPlanner: Planning with 8 random samples

=== Demonstrating Object Slicing Danger ===
PathPlanner: Constructed A*
AStarPlanner: Constructed with 4 weights

Calling function with pass-by-reference (no slicing):
AStarPlanner: Planning with 4 heuristic weights

=== Move Semantics ===
PathPlanner: Constructed A*
AStarPlanner: Constructed with 2 weights

Moving planner:
PathPlanner: Move constructed

=== Cleanup (destructors will be called) ===
AStarPlanner: Destroying (cleaning up weights)
PathPlanner: Destroying A*
RRTPlanner: Destroying (cleaning up samples)
PathPlanner: Destroying RRT
AStarPlanner: Destroying (cleaning up weights)
PathPlanner: Destroying A*
AStarPlanner: Destroying (cleaning up weights)
PathPlanner: Destroying A*
```

**What This Example Demonstrates:**

1. **Rule of Five Complete Implementation**:
   - Destructor releases dynamically allocated `algorithm_name`
   - Copy constructor performs deep copy
   - Copy assignment with self-assignment check and exception safety
   - Move constructor transfers ownership with noexcept
   - Move assignment properly nullifies source

2. **Virtual Destructors are Critical**:
   - Base class destructor is virtual
   - Deleting derived objects through base pointers works correctly
   - Both derived and base destructors execute in proper order
   - Without virtual destructor, would cause resource leaks

3. **Preventing Object Slicing**:
   - Pass polymorphic objects by reference (`const PathPlanner&`)
   - Use smart pointer containers (`vector<unique_ptr<PathPlanner>>`)
   - Avoid pass-by-value for polymorphic types
   - Protected copy operations can prevent slicing at compile time

4. **Polymorphic Resource Management**:
   - Each derived class manages its own resources (weights array, samples array)
   - Virtual destructors ensure proper cleanup through base pointers
   - Smart pointers automatically handle deletion with correct vtable dispatch

5. **Move Semantics in Inheritance**:
   - Move operations work correctly in derived classes
   - Base class move operations handle base portion
   - Source objects properly nullified after move

6. **Real-World Autonomous Vehicle Context**:
   - Path planning algorithms (A*, RRT) are commonly swapped at runtime
   - Polymorphic design allows algorithm selection without code changes
   - Proper resource management critical for long-running vehicle systems
   - Container of planners demonstrates common design pattern in autonomous systems

**Why This Matters for Autonomous Vehicles**: Autonomous driving systems often use polymorphic design for interchangeable components (planners, controllers, sensors). Incorrect resource management or object slicing can cause memory leaks or lost functionality. Virtual destructors ensure that switching algorithms at runtime doesn't leak resources, while smart pointers provide automatic lifetime management for safety-critical systems.

### INTERVIEW_QA: Comprehensive Questions on Advanced Topics

#### Q1: What is the Rule of Five and why was it introduced?
**Difficulty:** #intermediate  
**Category:** #design_pattern #interview_favorite  
**Concepts:** #rule_of_five #move_semantics #resource_management

**Answer:**
The Rule of Five states that if a class defines any of destructor, copy constructor, copy assignment, move constructor, or move assignment, it should explicitly define or delete all five to ensure correct resource management and clear intent.

**Explanation:**
Introduced with C++11 to incorporate move semantics into the Rule of Three, the Rule of Five recognizes that resource-managing classes need coordinated control over all special member functions. The compiler's implicit generation rules create interdependencies: declaring one function can suppress generation of others. Explicitly defining all five eliminates ambiguity and prevents subtle bugs from relying on compiler-generated defaults that may not match the class's resource semantics.

**Key takeaway:** Define or delete all five special member functions explicitly when managing resources to avoid implicit generation surprises.

---

#### Q2: If you declare a move constructor, what happens to the copy constructor?
**Difficulty:** #advanced  
**Category:** #syntax #interview_favorite  
**Concepts:** #move_constructor #copy_constructor #compiler_generated

**Answer:**
Declaring a move constructor suppresses automatic generation of the copy constructor—the compiler does not generate it, making the class move-only unless you explicitly define or default the copy constructor.

**Explanation:**
The compiler's logic: if you defined a move constructor, you're indicating special resource handling, so it won't presume to know how copying should work. This prevents accidental inefficient copies when moves were intended. To make a class both copyable and movable after defining move operations, explicitly define or default the copy operations. This is part of the Rule of Five's purpose—forcing explicit decisions about all special member functions.

**Key takeaway:** Declaring move operations suppresses copy operations; explicitly default copy operations if both are needed.

---

#### Q3: What happens to move operations if you define a destructor?
**Difficulty:** #advanced  
**Category:** #syntax #interview_favorite  
**Concepts:** #destructors #move_semantics #compiler_generated

**Answer:**
Defining a destructor suppresses automatic generation of move constructor and move assignment—the compiler assumes you're managing resources and won't generate moves automatically.

**Explanation:**
This rule reflects the philosophy that user-defined destructors indicate resource management, which likely requires custom move semantics too. The compiler conservatively avoids generating potentially incorrect moves. While copy operations are still generated (for backward compatibility with pre-C++11 code), modern practice recommends explicitly defining or defaulting all five special members when any one is defined, following the Rule of Five strictly.

**Key takeaway:** User-defined destructors suppress move generation; explicitly define or default moves when needed.

---

#### Q4: Why make base class destructors virtual?
**Difficulty:** #intermediate  
**Category:** #memory #interview_favorite  
**Concepts:** #virtual_destructors #inheritance #polymorphism #undefined_behavior

**Answer:**
Virtual destructors ensure that deleting a derived object through a base pointer correctly calls the derived destructor first, preventing resource leaks and undefined behavior.

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
delete ptr;  // ✅ Calls Derived::~Derived() then Base::~Base()
```

**Explanation:**
Without a virtual destructor, deleting through a base pointer invokes only the base destructor, leaking derived resources and causing undefined behavior. The vtable mechanism ensures the correct destructor chain executes from most derived to base. This is essential for polymorphic hierarchies and applies even with smart pointers, as they determine the deleter based on the static type at construction.

**Key takeaway:** Always make base class destructors virtual in polymorphic hierarchies to ensure proper cleanup.

---

#### Q5: Can pure virtual destructors exist, and do they need definitions?
**Difficulty:** #advanced  
**Category:** #syntax #interview_favorite  
**Concepts:** #pure_virtual #destructors #abstract_class

**Answer:**
Yes, destructors can be pure virtual to make a class abstract, but unlike other pure virtual functions, they must have a body defined because destructors always execute during destruction.

**Code example:**
```cpp
class Abstract {
public:
    virtual ~Abstract() = 0;  // Pure virtual
};

Abstract::~Abstract() {}  // ✅ Must define, or linker error
```

**Explanation:**
Pure virtual destructors serve two purposes: making the class abstract when no other pure virtuals exist, and ensuring proper cleanup through the destructor chain. Even though declared pure, the destructor must have a body because base class destructors always execute after derived destructors. Forgetting to define it causes cryptic linker errors about undefined symbols.

**Key takeaway:** Pure virtual destructors require body definitions; they make classes abstract while ensuring proper cleanup chains.

---

#### Q6: What is object slicing and when does it occur?
**Difficulty:** #intermediate  
**Category:** #inheritance #interview_favorite  
**Concepts:** #object_slicing #polymorphism #inheritance

**Answer:**
Object slicing occurs when a derived class object is copied to a base class object by value, discarding the derived portion and destroying polymorphic behavior.

**Code example:**
```cpp
class Base {
    virtual void func() { std::cout << "Base\n"; }
};

class Derived : public Base {
    int extraData;
    void func() override { std::cout << "Derived\n"; }
};

void process(Base b) {  // ❌ Pass by value
    b.func();  // Always prints "Base"
}

Derived d;
process(d);  // Slicing occurs
```

**Explanation:**
Slicing happens during pass-by-value, container insertion, or assignment to base type. The derived portion is physically cut off, losing data members and changing the vtable pointer to point to the base class, eliminating polymorphism. This violates the Liskov Substitution Principle and is almost never intentional. Always pass polymorphic objects by reference or pointer to preserve their full type.

**Key takeaway:** Prevent slicing by passing polymorphic objects by reference or pointer, never by value.

---

#### Q7: Why is explicitly defaulting special member functions better than relying on implicit generation?
**Difficulty:** #intermediate  
**Category:** #design_pattern  
**Concepts:** #default_functions #rule_of_five #explicit_intent

**Answer:**
Explicitly defaulting special member functions clarifies intent, ensures correct generation even when other special members are declared, and improves code documentation and template compatibility.

**Code example:**
```cpp
class Resource {
public:
    Resource() = default;
    ~Resource() = default;
    Resource(const Resource&) = default;
    Resource& operator=(const Resource&) = default;
    Resource(Resource&&) = default;
    Resource& operator=(Resource&&) = default;
};
```

**Explanation:**
Explicit defaulting documents that you've considered each special member function rather than accidentally relying on implicit rules. It prevents subtle bugs when adding destructors or other special members later, which would otherwise suppress automatic generation. In templates, explicit defaulting ensures functions exist with the expected signatures. It also makes code review easier by showing clear intent rather than requiring reviewers to memorize complex generation rules.

**Key takeaway:** Explicitly default special member functions to document intent and prevent subtle implicit generation changes.

---

#### Q8: How do you make a class move-only?
**Difficulty:** #intermediate  
**Category:** #syntax #design_pattern  
**Concepts:** #move_semantics #move_only #deleted_functions

**Answer:**
Delete the copy constructor and copy assignment operator while defining or defaulting the move constructor and move assignment operator.

**Code example:**
```cpp
class MoveOnly {
public:
    MoveOnly() = default;
    MoveOnly(const MoveOnly&) = delete;
    MoveOnly& operator=(const MoveOnly&) = delete;
    MoveOnly(MoveOnly&&) = default;
    MoveOnly& operator=(MoveOnly&&) = default;
};
```

**Explanation:**
Move-only types represent unique ownership semantics where objects cannot be duplicated but can transfer ownership. Examples include `std::unique_ptr`, file handles, and thread objects. Deleting copy operations makes copying a compile error, while providing moves enables efficient transfer. This pattern enforces single-ownership invariants at compile time, preventing accidental duplication of unique resources.

**Key takeaway:** Delete copy operations and provide move operations to create move-only types with unique ownership semantics.

---

#### Q9: What happens if you delete only the move constructor but not the copy constructor?
**Difficulty:** #advanced  
**Category:** #syntax  
**Concepts:** #move_constructor #deleted_functions #copy_constructor

**Answer:**
The class becomes move-incompatible but remains copyable; in contexts where moves are expected (like return by value without elision), copying occurs if available, or a compile error if copy is also deleted.

**Code example:**
```cpp
class NoMove {
public:
    NoMove(const NoMove&) { std::cout << "Copy\n"; }
    NoMove(NoMove&&) = delete;
};

NoMove create() {
    return NoMove();  // ⚠️ May copy or error depending on context
}
```

**Explanation:**
Deleting only the move constructor creates an unusual situation where the class explicitly rejects moves while allowing copies. In practice, this is rare and usually indicates a design problem. Most contexts requiring moves will fall back to copying if available, potentially impacting performance. If no copy exists either, the code won't compile. This asymmetry violates user expectations and should be avoided except in specific cases where moves would violate invariants.

**Key takeaway:** Avoid deleting only move operations; typically delete both copy and move together or provide both.

---

#### Q10: Does std::unique_ptr require a user-defined copy constructor?
**Difficulty:** #intermediate  
**Category:** #syntax  
**Concepts:** #unique_ptr #copy_constructor #move_only

**Answer:**
No, because std::unique_ptr is move-only; the compiler automatically deletes copy operations due to unique_ptr's deleted copy constructor.

**Code example:**
```cpp
class Holder {
    std::unique_ptr<int> data;
public:
    Holder() : data(std::make_unique<int>(42)) {}
    // Copy operations automatically deleted
    // Move operations automatically generated
};

Holder h1;
// Holder h2 = h1;  // ❌ Error: copy deleted
Holder h3 = std::move(h1);  // ✅ OK: moves
```

**Explanation:**
The presence of a move-only member like unique_ptr causes the compiler to delete copy operations for the containing class. Move operations are still generated if no user-defined special members exist. To make the class copyable, you must explicitly define copy operations that handle the unique_ptr appropriately (likely by cloning the pointed-to object). This automatic deletion propagates move-only semantics naturally.

**Key takeaway:** Move-only members automatically make containing classes move-only unless copy operations are explicitly defined.

---

#### Q11: If a base class has a deleted copy constructor, what happens to the derived class?
**Difficulty:** #intermediate  
**Category:** #inheritance  
**Concepts:** #copy_constructor #deleted_functions #inheritance

**Answer:**
The derived class's copy constructor is implicitly deleted because it cannot call the base class's deleted copy constructor, making the derived class non-copyable.

**Code example:**
```cpp
class Base {
public:
    Base(const Base&) = delete;
};

class Derived : public Base {
    // Copy constructor implicitly deleted
};

// Derived d1;
// Derived d2 = d1;  // ❌ Error: implicitly deleted
```

**Explanation:**
Copy constructors must initialize the base class portion by calling the base copy constructor. If that's deleted, there's no way to construct the base, so the derived copy constructor cannot be generated and is implicitly deleted. This deletion propagates down the inheritance hierarchy, enforcing non-copyable semantics throughout. Move operations may still be available if explicitly defined in both base and derived.

**Key takeaway:** Deleted base class copy operations propagate deletion to all derived classes automatically.

---

#### Q12: Why should move operations be marked noexcept?
**Difficulty:** #intermediate  
**Category:** #performance #interview_favorite  
**Concepts:** #move_semantics #noexcept #stl_containers

**Answer:**
Marking move operations noexcept enables optimal performance in standard containers, which only use moves if they're guaranteed not to throw; otherwise, they fall back to copies for exception safety.

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
When std::vector grows, it must move elements to new storage. If moves can throw, strong exception safety is impossible—a failure mid-move leaves elements in inconsistent state. Therefore, vector only uses moves if they're noexcept, copying otherwise. Since most move operations just swap pointers and cannot throw, marking them noexcept is free and dramatically improves performance. Forgetting noexcept on moves is a common performance bug.

**Key takeaway:** Always mark move operations noexcept when possible to enable container optimizations and improve performance.

---

#### Q13: Can you design a class that is copyable but not movable?
**Difficulty:** #intermediate  
**Category:** #design_pattern  
**Concepts:** #copy_constructor #move_semantics #deleted_functions

**Answer:**
Yes, by explicitly deleting move operations while keeping copy operations, though this is unusual since moves are typically optimizations over copies.

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
This pattern is rare because if copying is safe, moving should also be safe and more efficient. However, you might delete moves if move semantics would violate class invariants, or if you want to force observable copy behavior for testing. When moves are deleted, operations that would normally use moves (like returning temporaries) fall back to copying, potentially impacting performance. Use this pattern only when there's a specific reason moves shouldn't be allowed.

**Key takeaway:** Copy-only types are possible but unusual; ensure there's a valid reason to prohibit moves when copies work.

---

#### Q14: What is the impact of a non-virtual destructor in a polymorphic base class?
**Difficulty:** #intermediate  
**Category:** #memory #interview_favorite  
**Concepts:** #virtual_destructors #undefined_behavior #memory_leak

**Answer:**
Deleting a derived object through a base pointer with a non-virtual destructor causes undefined behavior, typically leaking derived resources and potentially corrupting memory.

**Code example:**
```cpp
class Base {
public:
    ~Base() {}  // ❌ Not virtual
};

class Derived : public Base {
    int* data;
public:
    Derived() : data(new int[1000]) {}
    ~Derived() { delete[] data; }
};

Base* ptr = new Derived();
delete ptr;  // ❌ UB: only ~Base() runs, leaks data
```

**Explanation:**
Without virtual dispatch, the base pointer's static type determines which destructor runs, executing only Base::~Base(). The derived destructor never runs, leaking its resources. This is undefined behavior that may crash immediately, corrupt memory silently, or appear to work in simple tests. The solution is simple: make base destructors virtual whenever the class is intended for polymorphic use. Modern compilers may warn, but it's not guaranteed.

**Key takeaway:** Non-virtual destructors in polymorphic bases cause undefined behavior and resource leaks; always use virtual destructors.

---

#### Q15: How does the copy-and-swap idiom relate to the Rule of Five?
**Difficulty:** #advanced  
**Category:** #design_pattern  
**Concepts:** #copy_and_swap #rule_of_five #assignment_operator

**Answer:**
The copy-and-swap idiom implements copy assignment using the copy constructor and a swap function, potentially simplifying Rule of Five implementation by reducing code duplication.

**Code example:**
```cpp
class Resource {
    int* data;
public:
    Resource(const Resource& other);  // Copy constructor
    
    Resource& operator=(Resource other) {  // Pass by value
        swap(other);
        return *this;
    }
    
    void swap(Resource& other) noexcept {
        std::swap(data, other.data);
    }
};
```

**Explanation:**
Copy-and-swap leverages the copy constructor to create a temporary, then swaps with it, providing strong exception safety and automatic self-assignment safety. However, it doesn't eliminate the need for Rule of Five—you still need destructor, copy constructor, and move operations. The idiom can make assignment simpler but adds an extra copy operation compared to direct assignment. It's a trade-off between simplicity and potential performance.

**Key takeaway:** Copy-and-swap simplifies assignment implementation but doesn't replace Rule of Five; all special members still need consideration.

---

#### Q16: What is the significance of protected copy operations in polymorphic base classes?
**Difficulty:** #advanced  
**Category:** #design_pattern #inheritance  
**Concepts:** #object_slicing #protected_members #polymorphism

**Answer:**
Protected copy operations prevent object slicing by making it a compile error to copy base class objects directly, forcing users to pass polymorphic types by reference or pointer.

**Code example:**
```cpp
class Shape {
protected:
    Shape(const Shape&) = default;
    Shape& operator=(const Shape&) = default;
public:
    virtual void draw() const = 0;
    virtual ~Shape() = default;
};

// Shape s1 = s2;  // ❌ Error: protected copy
void render(const Shape& s);  // ✅ Must pass by reference
```

**Explanation:**
This design pattern enforces that polymorphic objects can only be copied by derived classes internally, not by external code. Users must work with references or pointers, preventing accidental slicing. Derived classes can still copy themselves correctly. Combined with a virtual clone() method for explicit copying, this creates a slicing-proof interface that maintains polymorphic behavior while allowing controlled duplication.

**Key takeaway:** Protected copy operations prevent slicing by forcing polymorphic types to be used through references or pointers.

---

#### Q17: How does object slicing affect virtual function behavior?
**Difficulty:** #intermediate  
**Category:** #inheritance  
**Concepts:** #object_slicing #virtual_functions #vtable

**Answer:**
Slicing changes the vtable pointer to point to the base class table, causing virtual function calls to resolve to base implementations instead of derived overrides, destroying polymorphic behavior.

**Code example:**
```cpp
class Animal {
public:
    virtual void speak() { std::cout << "Animal\n"; }
};

class Dog : public Animal {
public:
    void speak() override { std::cout << "Woof\n"; }
};

void makeSound(Animal a) {  // ❌ Pass by value
    a.speak();  // Always prints "Animal"
}

Dog d;
makeSound(d);  // Sliced to Animal
```

**Explanation:**
When an object is sliced, the vtable pointer is rewritten to point to the base class vtable during the copy operation. All subsequent virtual function calls dispatch to base implementations. The sliced object is truly an Animal object, not a Dog anymore—the derived portion no longer exists in memory. This complete loss of polymorphism makes slicing particularly dangerous because it silently changes program behavior.

**Key takeaway:** Slicing destroys polymorphism by changing the vtable pointer; always pass polymorphic types by reference or pointer.

---

#### Q18: Why can't you return local objects by reference?
**Difficulty:** #beginner  
**Category:** #memory  
**Concepts:** #return_value #references #undefined_behavior

**Answer:**
Returning references to local objects causes undefined behavior because the local object is destroyed when the function returns, leaving a dangling reference to dead memory.

**Code example:**
```cpp
const Resource& bad() {
    Resource local;
    return local;  // ❌ UB: local destroyed
}

Resource good() {
    Resource local;
    return local;  // ✅ OK: moves or copies
}
```

**Explanation:**
Local objects have automatic storage duration—they're destroyed when the function exits. Returning a reference to a destroyed object creates a dangling reference that points to invalid memory. Any attempt to use it invokes undefined behavior. Return by value instead, which moves or copies the object to the caller's scope. With move semantics and copy elision, return by value is efficient and safe.

**Key takeaway:** Never return references to local objects; return by value and trust move semantics and copy elision.

---

#### Q19: How do smart pointers interact with virtual destructors?
**Difficulty:** #intermediate  
**Category:** #memory  
**Concepts:** #smart_pointers #virtual_destructors #unique_ptr #shared_ptr

**Answer:**
Smart pointers require virtual destructors in polymorphic bases for correct cleanup; they determine the deleter at construction based on the static type, requiring proper virtual dispatch.

**Code example:**
```cpp
class Base {
public:
    virtual ~Base() = default;  // ✅ Virtual
};

class Derived : public Base {
public:
    ~Derived() override { /* cleanup */ }
};

std::unique_ptr<Base> ptr = std::make_unique<Derived>();
// ✅ ~Derived() then ~Base() called correctly
```

**Explanation:**
Even though smart pointers automate deletion, they don't eliminate the need for virtual destructors. The smart pointer stores a deleter determined at construction time. For unique_ptr, this typically calls delete on the stored pointer. Without a virtual destructor, only the base destructor runs. Virtual destructors ensure the complete destructor chain executes. This is a common misconception that smart pointers solve all destruction issues.

**Key takeaway:** Smart pointers require virtual destructors in polymorphic hierarchies for correct cleanup; they don't eliminate this requirement.

---

#### Q20: What is the relationship between the Rule of Five and the Pimpl idiom?
**Difficulty:** #advanced  
**Category:** #design_pattern  
**Concepts:** #rule_of_five #pimpl #incomplete_type #unique_ptr

**Answer:**
Pimpl classes using unique_ptr must explicitly define or default special member functions in the implementation file where the implementation class is complete, as the compiler needs the complete type to generate destructors and special members.

**Code example:**
```cpp
// Header
class Widget {
    class Impl;
    std::unique_ptr<Impl> pImpl;
public:
    Widget();
    ~Widget();  // ✅ Must declare
    Widget(Widget&&);  // ✅ Must declare
    Widget& operator=(Widget&&);
};

// Implementation
Widget::~Widget() = default;  // ✅ Define where Impl is complete
Widget::Widget(Widget&&) = default;
Widget& Widget::operator=(Widget&&) = default;
```

**Explanation:**
The Pimpl idiom hides implementation details behind a pointer to an incomplete type. The unique_ptr needs to know how to delete the Impl, requiring a complete type when the destructor runs. If destructor and move operations are implicitly generated in the header where Impl is incomplete, compilation fails. Declaring them in the header and defining them in the implementation file where Impl is complete solves this. This is a subtle interaction between Rule of Five and incomplete types.

**Key takeaway:** Pimpl classes with unique_ptr must explicitly declare special members in header and define them where the implementation type is complete.

---

### PRACTICE_TASKS: Advanced Scenarios and Edge Cases

#### Q1
```cpp
#include <iostream>

class Base {
public:
    ~Base() { std::cout << "Base\n"; }
};

class Derived : public Base {
public:
    ~Derived() { std::cout << "Derived\n"; }
};

int main() {
    Base* ptr = new Derived();
    delete ptr;
}
```

#### Q2
```cpp
#include <iostream>

class Base {
public:
    virtual ~Base() = 0;
};

class Derived : public Base {
public:
    ~Derived() override { std::cout << "Derived\n"; }
};

int main() {
    Base* ptr = new Derived();
    delete ptr;
}
```

#### Q3
```cpp
#include <iostream>
#include <memory>

class Base {
public:
    ~Base() { std::cout << "Base\n"; }
};

class Derived : public Base {
public:
    ~Derived() { std::cout << "Derived\n"; }
};

int main() {
    std::shared_ptr<Base> ptr = std::make_shared<Derived>();
}
```

#### Q4
```cpp
#include <iostream>

class Shape {
public:
    virtual void draw() { std::cout << "Shape\n"; }
};

class Circle : public Shape {
public:
    void draw() override { std::cout << "Circle\n"; }
};

void render(Shape s) {
    s.draw();
}

int main() {
    Circle c;
    render(c);
}
```

#### Q5
```cpp
#include <iostream>
#include <vector>

class Base {
public:
    virtual void func() { std::cout << "Base\n"; }
    virtual ~Base() = default;
};

class Derived : public Base {
public:
    void func() override { std::cout << "Derived\n"; }
};

int main() {
    std::vector<Base> vec;
    vec.push_back(Derived());
    vec[0].func();
}
```

#### Q6
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

#### Q7
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

#### Q8
```cpp
#include <iostream>

class A {
public:
    A() = default;
    A(const A&) = delete;
    A(A&&) = default;
};

int main() {
    A a1;
    A a2 = std::move(a1);
    A a3 = a2;
}
```

#### Q9
```cpp
#include <iostream>
#include <memory>

class A {
    std::unique_ptr<int> data;
public:
    A() : data(std::make_unique<int>(42)) {}
};

int main() {
    A a1;
    A a2 = a1;
}
```

#### Q10
```cpp
#include <iostream>

class Base {
public:
    Base(const Base&) = delete;
};

class Derived : public Base {
};

int main() {
    Derived d1;
    Derived d2 = d1;
}
```

#### Q11
```cpp
#include <iostream>

class Resource {
public:
    Resource() = default;
    Resource(Resource&&) noexcept { std::cout << "Move\n"; }
    Resource(const Resource&) { std::cout << "Copy\n"; }
};

Resource create() {
    return Resource();
}

int main() {
    Resource r = create();
}
```

#### Q12
```cpp
#include <iostream>

class A {
public:
    virtual ~A() { std::cout << "A\n"; }
};

class B : public A {
public:
    ~B() override { std::cout << "B\n"; }
};

int main() {
    A* arr[2];
    arr[0] = new B();
    arr[1] = new B();
    
    delete arr[0];
    delete arr[1];
}
```

#### Q13
```cpp
#include <iostream>

struct Trivial {
    int x;
};

struct NonTrivial {
    int x;
    ~NonTrivial() {}
};

int main() {
    std::cout << std::is_trivially_destructible_v<Trivial> << "\n";
    std::cout << std::is_trivially_destructible_v<NonTrivial> << "\n";
}
```

#### Q14
```cpp
#include <iostream>

class Shape {
protected:
    Shape(const Shape&) = default;
public:
    virtual void draw() const = 0;
    virtual ~Shape() = default;
};

class Circle : public Shape {
public:
    Circle() = default;
    void draw() const override { std::cout << "Circle\n"; }
};

int main() {
    Circle c1;
    Circle c2 = c1;
}
```

#### Q15
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
    A* obj = A::create();
    obj->destroy();
}
```

#### Q16
```cpp
#include <iostream>

class Base {
public:
    virtual void func() { std::cout << "Base\n"; }
    virtual ~Base() = default;
};

class Derived : public Base {
public:
    void func() override { std::cout << "Derived\n"; }
};

int main() {
    Base b = Derived();
    b.func();
}
```

#### Q17
```cpp
#include <iostream>

class Resource {
    int* data;
public:
    Resource() : data(new int[100]) {}
    ~Resource() { delete[] data; std::cout << "Destroyed\n"; }
    Resource(const Resource&) = delete;
    Resource(Resource&&) noexcept = default;
};

int main() {
    Resource r1;
    Resource r2 = std::move(r1);
}
```

#### Q18
```cpp
#include <iostream>

class A {
public:
    A() { std::cout << "A()\n"; }
    ~A() { std::cout << "~A()\n"; }
    A(A&&) noexcept { std::cout << "Move\n"; }
};

A factory() {
    return A();
}

int main() {
    A obj = factory();
}
```

#### Q19
```cpp
#include <iostream>

class A {
public:
    A() = default;
    A(const A&) = default;
    A(A&&) noexcept { std::cout << "Move\n"; }
};

int main() {
    A a1;
    A a2 = a1;
    A a3 = std::move(a1);
}
```

#### Q20
```cpp
#include <iostream>

class Base {
public:
    virtual ~Base() { std::cout << "~Base\n"; }
};

class Derived : public Base {
public:
    ~Derived() override { std::cout << "~Derived\n"; }
};

void process(Base b) {
    std::cout << "Processing\n";
}

int main() {
    Derived d;
    process(d);
}
```

### QUICK_REFERENCE: Answer Keys and Summary Tables

#### Answer Key for Practice Questions

| Q# | Answer | Explanation | Key Concept |
|----|--------|-------------|-------------|
| 1 | Base | Non-virtual destructor causes UB; only Base::~Base() called, Derived::~Derived() never runs | #virtual_destructors #undefined_behavior |
| 2 | Linker Error | Pure virtual destructor declared but not defined; must provide body | #pure_virtual #destructors |
| 3 | Base | shared_ptr with non-virtual destructor; only Base::~Base() runs when ptr destroyed | #smart_pointers #virtual_destructors |
| 4 | Shape | Object slicing in pass-by-value; Circle sliced to Shape, calls Shape::draw() | #object_slicing |
| 5 | Base | Container slicing; Derived sliced when pushed to vector<Base>, calls Base::func() | #object_slicing #containers |
| 6 | Compilation Error | User-defined destructor suppresses move constructor generation; no move available | #move_semantics #compiler_generated |
| 7 | Compilation Error | Move constructor defined but no copy constructor; cannot copy a1 to a2 | #copy_constructor #move_semantics |
| 8 | Move<br>Compilation Error | a2 created via move; a3 fails because copy constructor deleted | #move_only #deleted_functions |
| 9 | Compilation Error | unique_ptr member makes class move-only; copy constructor implicitly deleted | #unique_ptr #move_only |
| 10 | Compilation Error | Base class copy constructor deleted; derived class copy implicitly deleted | #inheritance #deleted_functions |
| 11 | (Likely no output) | Copy elision in C++17; direct construction without move or copy | #copy_elision #rvo |
| 12 | B<br>A<br>B<br>A | Virtual destructors work correctly; both destructors called for each object in correct order | #virtual_destructors #polymorphism |
| 13 | 1<br>0 | Trivial has implicitly generated trivial destructor; NonTrivial's user-defined destructor makes it non-trivial | #trivial_destructor |
| 14 | (No output) | Protected copy constructor accessible within derived class; c2 copy constructed from c1 | #protected_members #copy_constructor |
| 15 | (No output) | Private destructor controlled lifetime pattern; object created and destroyed through controlled interface | #controlled_lifetime #private_destructor |
| 16 | Base | Object slicing in assignment; Derived sliced to Base, calls Base::func() | #object_slicing #assignment |
| 17 | Compilation Error | defaulted move constructor with deleted copy doesn't handle pointer member correctly; undefined behavior or error | #move_semantics #resource_management |
| 18 | A()<br>~A()<br>(likely) | RVO likely elides move; if not elided shows A(), Move, ~A(), ~A() | #copy_elision #move_constructor |
| 19 | Move | Explicit move via std::move calls move constructor | #move_semantics #std_move |
| 20 | Processing<br>~Derived<br>~Base | Slicing occurs in parameter; then d destroyed normally with both destructors | #object_slicing #destructors |

#### Rule of Five Special Member Functions

| Function | Signature | When Auto-Generated | Suppressed By |
|----------|-----------|-------------------|---------------|
| Destructor | `~T()` | Always | User declaration |
| Copy Constructor | `T(const T&)` | If no move/copy/destructor declared | Move constructor/assignment, destructor |
| Copy Assignment | `T& operator=(const T&)` | If no move/copy/destructor declared | Move constructor/assignment, destructor |
| Move Constructor | `T(T&&)` | If no special members declared | Any special member declaration |
| Move Assignment | `T& operator=(T&&)` | If no special members declared | Any special member declaration |

#### Virtual Destructor Rules

| Scenario | Virtual Destructor Needed | Why |
|----------|-------------------------|-----|
| Polymorphic base class | Yes | Ensure correct destruction through base pointers |
| Deleting via base pointer | Yes | Prevent resource leaks and UB |
| Using with smart pointers | Yes | Smart pointers need correct deleter |
| Pure virtual functions exist | Yes | Maintain consistent polymorphic interface |
| Non-polymorphic class | No | No inheritance/polymorphism, avoid vtable overhead |

#### Object Slicing Prevention

| Technique | Implementation | Effect |
|-----------|---------------|--------|
| Pass by reference | `void func(Base& b)` | Preserves polymorphism, no slicing |
| Pass by pointer | `void func(Base* b)` | Preserves polymorphism, explicit lifetime |
| Protected copy ops | `protected: Base(const Base&)` | Prevents external copying, compile-time error |
| Delete copy ops | `Base(const Base&) = delete` | Makes non-copyable, prevents slicing |
| Use smart pointer containers | `vector<unique_ptr<Base>>` | Stores pointers, preserves polymorphism |
| Virtual clone method | `virtual unique_ptr<Base> clone()` | Explicit polymorphic copying |

#### Common Destructor Pitfalls

| Pitfall | Problem | Solution |
|---------|---------|----------|
| Non-virtual destructor in base | Resource leaks, UB | Make virtual |
| Pure virtual without body | Linker error | Provide definition |
| Deleted destructor misuse | Cannot destroy objects | Use for controlled lifetime only |
| User-defined destructor | Suppresses moves | Explicitly default moves |
| Private destructor | Limits destruction | Use for factory pattern |
| Non-virtual in smart pointer base | Wrong destructor called | Make virtual |

#### Object Slicing Scenarios

| Context | Slicing Occurs | Prevention |
|---------|---------------|-----------|
| Pass by value | Yes | Pass by reference/pointer |
| Assignment to base | Yes | Delete copy assignment or use references |
| Container insertion | Yes | Use pointer containers |
| Return by value | No (if types match) | Return actual type or pointer |
| Copy construction | Yes (if base type) | Protected/deleted copy operations |

#### Move Semantics Best Practices

| Practice | Reason | Example |
|----------|--------|---------|
| Mark move ops noexcept | Container performance | `T(T&&) noexcept` |
| Nullify moved-from pointers | Safety | `other.ptr = nullptr;` |
| Define all five if any | Consistency | Follow Rule of Five |
| Delete both copy and move for unique types | Clear semantics | Move-only types |
| Don't use std::move on return | Prevents RVO | `return local;` not `return std::move(local);` |