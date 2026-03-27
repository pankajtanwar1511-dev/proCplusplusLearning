## TOPIC: Rule of Five, Destructors, and Object Slicing - Advanced Concepts

### THEORY_SECTION: Deep Dive into Resource Management Edge Cases

#### 1. Rule of Five - Complex Interactions and Compiler Generation

**How declaring one special member affects others:**

| You Declare | Default Ctor | Destructor | Copy Ctor | Copy Assign | Move Ctor | Move Assign |
|-------------|--------------|------------|-----------|-------------|-----------|-------------|
| **Nothing** | ✅ Generated | ✅ Generated | ✅ Generated | ✅ Generated | ✅ Generated | ✅ Generated |
| **Destructor** | ✅ Generated | User-defined | ✅ Generated (deprecated) | ✅ Generated (deprecated) | ❌ **Suppressed** | ❌ **Suppressed** |
| **Copy Constructor** | ✅ Generated | ✅ Generated | User-defined | ✅ Generated | ❌ **Suppressed** | ❌ **Suppressed** |
| **Copy Assignment** | ✅ Generated | ✅ Generated | ✅ Generated | User-defined | ❌ **Suppressed** | ❌ **Suppressed** |
| **Move Constructor** | ✅ Generated | ✅ Generated | ❌ **Suppressed** | ❌ **Suppressed** | User-defined | ✅ Generated |
| **Move Assignment** | ✅ Generated | ✅ Generated | ❌ **Suppressed** | ❌ **Suppressed** | ✅ Generated | User-defined |

**CRITICAL:** Declaring any special member triggers suppression of others. Modern practice: **explicitly define or delete all five** when any one is user-defined.

**Rule of Five + Virtual Destructors in inheritance:**

| Base Class Configuration | Effect on Derived | Recommended Pattern |
|------------------------|------------------|-------------------|
| **Virtual destructor only** | Derived moves suppressed | Explicitly default moves in base |
| **Virtual + defaulted all five** | Derived can generate all | ✅ **Best practice** |
| **Virtual + user-defined copies** | Derived copies work, moves suppressed | Define moves too |
| **Non-virtual destructor** | ❌ **Dangerous** | Makes polymorphism unsafe |

**Code example - proper Rule of Five with virtual destructor:**
```cpp
class PolymorphicBase {
protected:
    int* data;
public:
    PolymorphicBase() : data(new int[100]) {}

    // ✅ Virtual destructor
    virtual ~PolymorphicBase() { delete[] data; }

    // ✅ Explicitly define or default all five
    PolymorphicBase(const PolymorphicBase& other)
        : data(new int[100]) {
        std::copy(other.data, other.data + 100, data);
    }

    PolymorphicBase& operator=(const PolymorphicBase& other) {
        if (this != &other) {
            int* temp = new int[100];
            std::copy(other.data, other.data + 100, temp);
            delete[] data;
            data = temp;
        }
        return *this;
    }

    PolymorphicBase(PolymorphicBase&& other) noexcept
        : data(other.data) {
        other.data = nullptr;
    }

    PolymorphicBase& operator=(PolymorphicBase&& other) noexcept {
        if (this != &other) {
            delete[] data;
            data = other.data;
            other.data = nullptr;
        }
        return *this;
    }
};
```

---

#### 2. Virtual Destructors - Polymorphic Destruction Safety

**Why virtual destructors are mandatory for polymorphic classes:**

| Scenario | Without Virtual Destructor | With Virtual Destructor |
|----------|---------------------------|------------------------|
| `delete basePtr;` (pointing to derived) | ❌ **Only base destructor runs (UB)** | ✅ Derived destructor → Base destructor |
| Resource cleanup | ❌ **Derived resources leak** | ✅ All resources cleaned up |
| Smart pointers (`unique_ptr`, `shared_ptr`) | ❌ **Still need virtual!** | ✅ Correct destruction |
| Vtable overhead | +8 bytes per object (vptr) | Same overhead (safety worth it) |
| Observable behavior | ❌ Undefined behavior | ✅ Well-defined |

**Common misconceptions:**

| Misconception | Reality |
|--------------|---------|
| "Smart pointers don't need virtual destructors" | ❌ FALSE - smart pointers still require virtual destructors in polymorphic hierarchies |
| "Virtual destructors are slow" | Vtable overhead is negligible (one pointer); safety benefit is enormous |
| "I don't delete through base pointers" | Code evolves; future maintainers may delete polymorphically |
| "Destructors don't need to be virtual if empty" | Virtual dispatch applies to *calling* the destructor, not *contents* |

**Code example - virtual destructor requirement:**
```cpp
class Base {
public:
    virtual ~Base() { std::cout << "~Base\n"; }  // ✅ Virtual
};

class Derived : public Base {
    int* buffer;
public:
    Derived() : buffer(new int[10000]) {}
    ~Derived() override {
        delete[] buffer;  // ✅ Called when deleting through Base*
        std::cout << "~Derived\n";
    }
};

// Usage:
Base* ptr = new Derived();
delete ptr;  // ✅ Calls ~Derived() then ~Base()
// Without virtual: only ~Base() runs → 10000 ints leaked!
```

---

#### 3. Object Slicing - The Silent Polymorphism Killer

**What slicing does to objects:**

| Aspect | Original Derived Object | After Slicing to Base |
|--------|----------------------|---------------------|
| **Object size** | sizeof(Derived) | sizeof(Base) - **smaller!** |
| **Derived data members** | Present | ❌ **Lost/discarded** |
| **Vtable pointer** | Points to Derived vtable | ❌ **Changed to Base vtable** |
| **Virtual function calls** | Calls Derived overrides | ❌ **Calls Base implementations** |
| **Type** | Truly a Derived object | ❌ **Truly a Base object** |

**When slicing occurs:**

| Context | Slicing? | Example |
|---------|---------|---------|
| Pass by value to function | ✅ YES | `void func(Base b)` called with Derived |
| Return by value (different type) | ✅ YES | `Base func() { return Derived(); }` |
| Assignment to base | ✅ YES | `Base b = derivedObj;` |
| Container insertion | ✅ YES | `vector<Base> v; v.push_back(derivedObj);` |
| Pass by reference | ❌ NO | `void func(Base& b)` - safe |
| Pass by pointer | ❌ NO | `void func(Base* b)` - safe |
| Smart pointer containers | ❌ NO | `vector<unique_ptr<Base>>` - safe |

**Prevention strategies:**

| Technique | Implementation | Effectiveness |
|-----------|---------------|--------------|
| **Delete copy operations** | `Base(const Base&) = delete;` | ✅ Compile-time error |
| **Protected copy operations** | `protected: Base(const Base&);` | ✅ Prevents external slicing |
| **Pass by reference** | `void func(const Base& obj)` | ✅ Preserves polymorphism |
| **Pass by pointer** | `void func(Base* obj)` | ✅ Explicit lifetime |
| **Smart pointer containers** | `vector<unique_ptr<Base>>` | ✅ Container polymorphism |
| **Virtual clone method** | `virtual unique_ptr<Base> clone()` | ✅ Explicit polymorphic copy |

**Code example - slicing in action:**
```cpp
class Animal {
public:
    int id = 0;
    virtual void speak() { std::cout << "Animal\n"; }
    virtual ~Animal() = default;
};

class Dog : public Animal {
public:
    double weight = 25.5;
    void speak() override { std::cout << "Woof! (weight: " << weight << ")\n"; }
};

// ❌ DANGER: Slicing function
void makeSound(Animal a) {  // Pass by value
    a.speak();  // Always prints "Animal" - polymorphism destroyed!
}

// ✅ SAFE: Polymorphic function
void makeSoundSafe(const Animal& a) {  // Pass by reference
    a.speak();  // Correctly calls Dog::speak() for Dog objects
}

int main() {
    Dog myDog;
    myDog.id = 42;
    myDog.weight = 30.0;

    makeSound(myDog);      // Output: "Animal" - sliced!
    makeSoundSafe(myDog);  // Output: "Woof! (weight: 30)" - correct!
}
```

**Key takeaway:** Virtual destructors are **mandatory** for polymorphic classes to prevent UB and resource leaks. Object slicing silently destroys polymorphism - always pass polymorphic objects by reference or pointer, never by value. Use deleted/protected copy operations to prevent slicing at compile time.

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
