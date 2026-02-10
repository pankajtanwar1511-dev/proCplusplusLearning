## TOPIC: Constructor Types - Default, Parameterized, Copy, and Move

### THEORY_SECTION: Core Concepts and Object Construction

#### What are Constructors?

**Constructors** are special member functions that are automatically called when an object is created, responsible for initializing the object's state. C++ provides several types of constructors to handle different initialization scenarios: default constructors (taking no arguments), parameterized constructors (taking arguments), copy constructors (creating objects from existing objects of the same type), and move constructors (transferring resources from temporary objects). Each type serves a specific purpose in object lifecycle management and resource handling.

Understanding when the compiler generates constructors automatically is critical. If no constructors are defined, the compiler generates a default constructor. However, defining any constructor prevents automatic generation of the default constructor. Similarly, the compiler generates copy and move constructors under specific conditions, but defining custom special member functions can prevent automatic generation of others. This interplay between user-defined and compiler-generated constructors is governed by the Rule of Three/Five/Zero and affects object semantics significantly.

#### Member Initialization and Default Values

A critical but often misunderstood aspect of constructors is how data members get their initial values. For built-in types (int, float, pointers) in non-static objects, members are **uninitialized by default**—they contain garbage values unless explicitly initialized. This is a common source of undefined behavior. For class-type members, their default constructors are called automatically. Static and global objects are zero-initialized by default, providing safe initial values.

C++ offers multiple ways to initialize members: assignment in the constructor body (least efficient), member initializer lists (most efficient and sometimes mandatory), in-class member initializers (C++11+, good for default values), and delegating constructors (C++11+, reducing code duplication). The member initializer list is preferred because it performs direct initialization rather than default-initialization followed by assignment. It's mandatory for const members, reference members, and members without default constructors. Understanding initialization order—determined by declaration order, not initializer list order—is crucial for avoiding subtle bugs.

### EDGE_CASES: Tricky Scenarios and Deep Internals

#### Edge Case 1: Implicit Default Constructor Suppression

When you define any constructor (even a parameterized one), the compiler no longer generates a default constructor. This is a frequent source of compilation errors when code expects default construction but only parameterized constructors exist.

```cpp
class Resource {
public:
    Resource(std::string name) {  // ✅ Parameterized constructor
        std::cout << "Resource: " << name << "\n";
    }
};

int main() {
    // Resource r;  // ❌ Error: no default constructor
    Resource r("data");  // ✅ OK
}
```

This behavior forces explicit construction and prevents accidental uninitialized objects. To restore default construction capability, explicitly define a default constructor using `= default` or provide your own implementation. This design choice reflects C++'s philosophy of no implicit overhead—if you need special construction, you must be explicit.

#### Edge Case 2: Initialization Order vs Initializer List Order

A subtle and dangerous pitfall: members are initialized in the order they're **declared in the class**, not the order specified in the initializer list. The compiler will warn about this in some cases, but not all.

```cpp
class Tricky {
    int first;
    int second;
public:
    Tricky(int x) : second(x), first(second) {  // ❌ Dangerous!
        // first is initialized before second
        // first gets garbage value from uninitialized second
    }
};
```

This can lead to using uninitialized values, accessing null pointers, or other undefined behavior. The fix is simple: match initializer list order to declaration order, or better yet, avoid dependencies between member initializations. Some compilers warn with `-Wreorder`, but it's not guaranteed. Always initialize members in declaration order to avoid confusion and bugs.

#### Edge Case 3: Const and Reference Members Require Initializer Lists

Const and reference members cannot be assigned—they must be initialized at construction. This mandates using member initializer lists; assignment in the constructor body is illegal and won't compile.

```cpp
class Validator {
    const int maxValue;  // Cannot be reassigned
    int& externalCounter;  // Must bind to existing int
    
public:
    Validator(int max, int& counter) 
        : maxValue(max), externalCounter(counter) {  // ✅ Must use initializer list
        // maxValue = max;  // ❌ Error: cannot assign to const
    }
};
```

This restriction reflects C++'s type system semantics—references are aliases that must be bound at creation, and const objects cannot be modified after initialization. Attempting to use assignment in the constructor body fails because the members must be initialized before the body executes, and const/reference semantics prohibit subsequent modification.

#### Edge Case 4: Copy Elision and Return Value Optimization

Modern compilers perform copy elision and return value optimization (RVO), eliminating copy/move constructors even when they would normally be called. In C++17, copy elision is mandatory in certain cases, changing program behavior.

```cpp
class Logger {
public:
    Logger() { std::cout << "Construct\n"; }
    Logger(const Logger&) { std::cout << "Copy\n"; }
    Logger(Logger&&) { std::cout << "Move\n"; }
};

Logger create() {
    return Logger();  // ❌ C++17: no copy/move, mandatory elision
}

int main() {
    Logger log = create();  // Output: just "Construct"
}
```

Pre-C++17, you might see "Construct" then "Copy" or "Move". C++17 guarantees elision when returning a temporary, so only the constructor runs. This optimization changes observable behavior but improves performance dramatically. Understanding when elision happens helps explain surprising output in constructor counting exercises and affects how you design classes.

#### Edge Case 5: Delegating Constructor Cycle Detection

C++11 allows constructors to delegate to other constructors, reducing code duplication. However, creating circular delegation causes compilation errors or infinite recursion.

```cpp
class Bad {
public:
    Bad() : Bad(0) {}  // ❌ Calls Bad(int)
    Bad(int x) : Bad() {}  // ❌ Calls Bad() - circular!
};
```

The compiler usually detects direct cycles, but indirect cycles through multiple constructors might not be caught, leading to stack overflow at runtime. Delegating constructors must form a directed acyclic graph with exactly one "final" constructor that performs actual initialization. This constructor should not delegate to any other. Use delegation to avoid repeating initialization logic, but design the delegation hierarchy carefully.

#### Edge Case 6: Move Constructor Automatic Generation Rules

The compiler automatically generates a move constructor only under very specific conditions: when no user-declared copy constructor, copy assignment operator, move assignment operator, or destructor exists. Defining any of these suppresses automatic move generation.

```cpp
class HasDestructor {
public:
    ~HasDestructor() {}  // ❌ User-declared destructor
    // Move constructor NOT automatically generated
};

class HasCopy {
public:
    HasCopy(const HasCopy&) {}  // ❌ User-declared copy constructor
    // Move constructor NOT automatically generated
};
```

This is part of the Rule of Five—if you declare any of the five special member functions (destructor, copy constructor, copy assignment, move constructor, move assignment), you should probably explicitly define or delete all five. Relying on automatic generation after declaring one can lead to inefficient copying when moves were expected, or worse, incorrect resource management.

### CODE_EXAMPLES: Practical Demonstrations

#### Example 1: Default Constructor Behavior

```cpp
class Counter {
    int value;  // ❌ Uninitialized for non-static objects
public:
    Counter() {
        std::cout << "Default constructor, value = " << value << "\n";
    }
};

int main() {
    Counter c;  // value contains garbage
}
```

This demonstrates the danger of not initializing built-in types. The value contains whatever bits happened to be in that memory location. The fix is to use a member initializer list: `Counter() : value(0) {}` or in-class initialization: `int value = 0;`. This undefined behavior is a common source of heisenbugs that appear and disappear based on memory state.

#### Example 2: Parameterized Constructor with Validation

```cpp
class BankAccount {
    std::string owner;
    double balance;
    
public:
    BankAccount(std::string name, double initial) 
        : owner(name), balance(initial < 0 ? 0 : initial) {
        // ✅ Member initializer list with validation
        std::cout << "Account for " << owner 
                  << " with balance " << balance << "\n";
    }
};

int main() {
    BankAccount acc("Alice", 1000.0);
    BankAccount invalid("Bob", -50.0);  // balance becomes 0
}
```

This shows how to perform validation during initialization. The ternary operator in the initializer list allows conditional initialization. For more complex validation, consider a factory function or throwing an exception if invalid parameters should prevent object creation entirely.

#### Example 3: Member Initializer List vs Constructor Body

```cpp
class String {
    std::string data;
public:
    // ❌ Inefficient: default-constructs data, then assigns
    String(const char* str) {
        data = str;
    }
    
    // ✅ Efficient: directly constructs data with str
    String(const char* str) : data(str) {}
};
```

The first version default-constructs `data` (empty string), then assigns the value. The second directly constructs `data` with the value, avoiding the temporary empty string. For simple types like int, the difference is negligible, but for complex types like std::string or std::vector, the initializer list can significantly improve performance by avoiding unnecessary default construction and allocation.

#### Example 4: In-Class Member Initializers

```cpp
class Configuration {
    int timeout = 30;  // ✅ Default value
    bool enabled = true;
    std::string mode = "standard";
    
public:
    Configuration() {}  // Uses default values
    
    Configuration(int t) : timeout(t) {
        // ✅ Overrides timeout, uses defaults for others
    }
    
    Configuration(int t, bool e, std::string m)
        : timeout(t), enabled(e), mode(m) {
        // ✅ Overrides all values
    }
};
```

In-class initializers (C++11+) provide default values that are used when not overridden by a constructor's initializer list. This reduces duplication when you have multiple constructors that share common default values. The initializer list takes precedence, allowing selective override of specific members while using defaults for others.

#### Example 5: Copy Constructor Deep vs Shallow Copy

```cpp
class DynamicArray {
    int* data;
    size_t size;
    
public:
    DynamicArray(size_t n) : size(n), data(new int[n]) {}
    
    // ❌ Shallow copy (compiler-generated would do this)
    DynamicArray(const DynamicArray& other) 
        : size(other.size), data(other.data) {
        // Both objects point to same array - double delete!
    }
    
    // ✅ Deep copy
    DynamicArray(const DynamicArray& other) 
        : size(other.size), data(new int[other.size]) {
        std::copy(other.data, other.data + size, data);
    }
    
    ~DynamicArray() { delete[] data; }
};
```

This is the classic example of why custom copy constructors are needed for classes managing resources. The shallow copy creates two objects pointing to the same memory, causing double-delete when both are destroyed. The deep copy allocates new memory and copies the data, giving each object independent ownership. This is a fundamental pattern in resource management.

#### Example 6: Move Constructor Resource Transfer

```cpp
class FileHandle {
    FILE* file;
    std::string filename;
    
public:
    FileHandle(std::string name) : filename(name) {
        file = fopen(name.c_str(), "r");
    }
    
    // ✅ Move constructor - steals resources
    FileHandle(FileHandle&& other) noexcept
        : file(other.file), filename(std::move(other.filename)) {
        other.file = nullptr;  // ✅ Leave other in valid state
    }
    
    ~FileHandle() {
        if (file) fclose(file);
    }
};

FileHandle create() {
    return FileHandle("data.txt");  // ✅ Move, not copy
}
```

The move constructor transfers ownership of resources from the source object (which is being destroyed) to the new object. The source is left in a valid but unspecified state—typically nulled out. This avoids expensive copying of resources like file handles, sockets, or large buffers. Mark move constructors `noexcept` when possible for optimal container performance.

#### Example 7: Delegating Constructors

```cpp
class Rectangle {
    int width, height;
    
    void validate() {
        if (width < 0) width = 0;
        if (height < 0) height = 0;
    }
    
public:
    // Main constructor
    Rectangle(int w, int h) : width(w), height(h) {
        validate();
        std::cout << "Rectangle: " << width << "x" << height << "\n";
    }
    
    // ✅ Delegate to main constructor
    Rectangle() : Rectangle(0, 0) {}
    
    // ✅ Square constructor delegates
    Rectangle(int side) : Rectangle(side, side) {}
};
```

Delegating constructors (C++11+) reduce code duplication by having one constructor call another. The delegating constructor does nothing else—initialization logic is in the target constructor. This ensures consistent initialization and validation across different construction paths. The target constructor executes completely before the delegating constructor's body (if any) runs.

#### Example 8: Explicit Constructor to Prevent Implicit Conversion

```cpp
class Array {
    int* data;
    size_t size;
    
public:
    explicit Array(size_t n) : size(n), data(new int[n]) {}
    
    ~Array() { delete[] data; }
};

void process(Array arr) {
    // ...
}

int main() {
    // Array a = 10;  // ❌ Error: explicit prevents implicit conversion
    Array a(10);      // ✅ OK: explicit construction
    
    // process(20);   // ❌ Error: no implicit conversion
    process(Array(20));  // ✅ OK: explicit construction
}
```

The `explicit` keyword prevents implicit conversions from the constructor's parameter type to the class type. Without it, `Array a = 10;` would implicitly call `Array(10)`, which might be unexpected and lead to bugs. Use `explicit` for single-parameter constructors unless implicit conversion is genuinely desired (e.g., std::string from const char*).

#### Example 9: Autonomous Vehicle - Trajectory with All Constructor Types

```cpp
#include <iostream>
#include <vector>
#include <utility>
#include <algorithm>

struct Waypoint {
    double x, y;
    double heading_deg;

    Waypoint(double x_val = 0.0, double y_val = 0.0, double heading = 0.0)
        : x(x_val), y(y_val), heading_deg(heading) {}
};

class Trajectory {
private:
    std::string name;
    Waypoint* waypoints;  // Dynamic array
    size_t size;
    size_t capacity;
    double max_speed_mps;

    void allocate(size_t cap) {
        capacity = cap;
        waypoints = new Waypoint[capacity];
    }

public:
    // 1. Default Constructor - creates empty trajectory
    Trajectory()
        : name("unnamed"), waypoints(nullptr), size(0), capacity(0), max_speed_mps(15.0) {
        std::cout << "Trajectory(): Default constructed\n";
    }

    // 2. Parameterized Constructor - creates trajectory with capacity
    explicit Trajectory(std::string traj_name, size_t initial_capacity = 10)
        : name(traj_name), size(0), max_speed_mps(15.0) {
        allocate(initial_capacity);
        std::cout << "Trajectory(" << name << "): Parameterized constructed with capacity "
                  << capacity << "\n";
    }

    // 3. Parameterized Constructor with all parameters
    Trajectory(std::string traj_name, double speed, size_t cap)
        : name(traj_name), size(0), max_speed_mps(speed) {
        allocate(cap);
        std::cout << "Trajectory(" << name << "): Full parameterized (speed="
                  << speed << ", cap=" << cap << ")\n";
    }

    // 4. Copy Constructor - deep copy for safe resource management
    Trajectory(const Trajectory& other)
        : name(other.name + "_copy"),
          size(other.size),
          max_speed_mps(other.max_speed_mps) {
        allocate(other.capacity);
        std::copy(other.waypoints, other.waypoints + other.size, waypoints);
        std::cout << "Trajectory(" << name << "): Copy constructed from "
                  << other.name << " (" << size << " waypoints)\n";
    }

    // 5. Move Constructor - efficient resource transfer
    Trajectory(Trajectory&& other) noexcept
        : name(std::move(other.name)),
          waypoints(other.waypoints),
          size(other.size),
          capacity(other.capacity),
          max_speed_mps(other.max_speed_mps) {
        // Leave other in valid but empty state
        other.waypoints = nullptr;
        other.size = 0;
        other.capacity = 0;
        std::cout << "Trajectory(" << name << "): Move constructed (transferred ownership)\n";
    }

    // Destructor - cleanup resources
    ~Trajectory() {
        if (waypoints) {
            std::cout << "~Trajectory(" << name << "): Destroying ("
                      << size << " waypoints)\n";
            delete[] waypoints;
        }
    }

    // Add waypoint to trajectory
    void addWaypoint(const Waypoint& wp) {
        if (size >= capacity) {
            // Resize if needed
            size_t new_capacity = (capacity == 0) ? 10 : capacity * 2;
            Waypoint* new_array = new Waypoint[new_capacity];
            std::copy(waypoints, waypoints + size, new_array);
            delete[] waypoints;
            waypoints = new_array;
            capacity = new_capacity;
        }
        waypoints[size++] = wp;
    }

    void printInfo() const {
        std::cout << "  Trajectory: " << name << " | Waypoints: " << size
                  << "/" << capacity << " | Max speed: " << max_speed_mps << " m/s\n";
        for (size_t i = 0; i < size && i < 3; i++) {
            std::cout << "    WP[" << i << "]: (" << waypoints[i].x
                      << ", " << waypoints[i].y << ") heading="
                      << waypoints[i].heading_deg << "°\n";
        }
        if (size > 3) std::cout << "    ... and " << (size - 3) << " more\n";
    }

    const std::string& getName() const { return name; }
    size_t getSize() const { return size; }
};

// Factory function demonstrating RVO and move semantics
Trajectory createParkingTrajectory() {
    std::cout << "\n[Factory] Creating parking trajectory...\n";
    Trajectory traj("parking_maneuver", 5.0, 20);

    // Add some waypoints
    traj.addWaypoint(Waypoint(0.0, 0.0, 0.0));
    traj.addWaypoint(Waypoint(1.0, 0.5, 15.0));
    traj.addWaypoint(Waypoint(2.0, 1.2, 30.0));
    traj.addWaypoint(Waypoint(3.0, 2.0, 45.0));

    return traj;  // Move or RVO, not copy
}

int main() {
    std::cout << "=== Constructor Demonstrations ===" << std::endl;

    // 1. Default constructor
    std::cout << "\n1. Default Constructor:\n";
    Trajectory traj1;
    traj1.printInfo();

    // 2. Parameterized constructor with single argument
    std::cout << "\n2. Parameterized Constructor (name only):\n";
    Trajectory traj2("highway_lane_change");
    traj2.addWaypoint(Waypoint(0.0, 0.0, 0.0));
    traj2.addWaypoint(Waypoint(10.0, 3.5, 10.0));
    traj2.addWaypoint(Waypoint(20.0, 7.0, 0.0));
    traj2.printInfo();

    // 3. Parameterized constructor with all arguments
    std::cout << "\n3. Full Parameterized Constructor:\n";
    Trajectory traj3("urban_navigation", 10.0, 50);
    traj3.addWaypoint(Waypoint(0.0, 0.0, 90.0));
    traj3.addWaypoint(Waypoint(5.0, 5.0, 45.0));
    traj3.printInfo();

    // 4. Copy constructor - deep copy
    std::cout << "\n4. Copy Constructor:\n";
    Trajectory traj4 = traj2;  // Copy initialization
    traj4.printInfo();

    // Verify deep copy - original and copy are independent
    traj2.addWaypoint(Waypoint(30.0, 10.5, -5.0));
    std::cout << "\nAfter modifying original:\n";
    std::cout << "  Original: " << traj2.getName() << " has " << traj2.getSize() << " waypoints\n";
    std::cout << "  Copy: " << traj4.getName() << " has " << traj4.getSize() << " waypoints\n";

    // 5. Move constructor - efficient transfer
    std::cout << "\n5. Move Constructor (factory function with RVO):\n";
    Trajectory traj5 = createParkingTrajectory();
    traj5.printInfo();

    // 6. Explicit move with std::move
    std::cout << "\n6. Explicit Move:\n";
    Trajectory traj6 = std::move(traj3);  // traj3 is now in moved-from state
    traj6.printInfo();

    std::cout << "\n=== End of scope - destructors will be called ===" << std::endl;

    return 0;
}
```

**Output:**
```
=== Constructor Demonstrations ===

1. Default Constructor:
Trajectory(): Default constructed
  Trajectory: unnamed | Waypoints: 0/0 | Max speed: 15 m/s

2. Parameterized Constructor (name only):
Trajectory(highway_lane_change): Parameterized constructed with capacity 10
  Trajectory: highway_lane_change | Waypoints: 3/10 | Max speed: 15 m/s
    WP[0]: (0, 0) heading=0°
    WP[1]: (10, 3.5) heading=10°
    WP[2]: (20, 7) heading=0°

3. Full Parameterized Constructor:
Trajectory(urban_navigation): Full parameterized (speed=10, cap=50)
  Trajectory: urban_navigation | Waypoints: 2/50 | Max speed: 10 m/s
    WP[0]: (0, 0) heading=90°
    WP[1]: (5, 5) heading=45°

4. Copy Constructor:
Trajectory(highway_lane_change_copy): Copy constructed from highway_lane_change (3 waypoints)
  Trajectory: highway_lane_change_copy | Waypoints: 3/10 | Max speed: 15 m/s
    WP[0]: (0, 0) heading=0°
    WP[1]: (10, 3.5) heading=10°
    WP[2]: (20, 7) heading=0°

After modifying original:
  Original: highway_lane_change has 4 waypoints
  Copy: highway_lane_change_copy has 3 waypoints

5. Move Constructor (factory function with RVO):

[Factory] Creating parking trajectory...
Trajectory(parking_maneuver): Full parameterized (speed=5, cap=20)
Trajectory(parking_maneuver): Move constructed (transferred ownership)
  Trajectory: parking_maneuver | Waypoints: 4/20 | Max speed: 5 m/s
    WP[0]: (0, 0) heading=0°
    WP[1]: (1, 0.5) heading=15°
    WP[2]: (2, 1.2) heading=30°
    ... and 1 more

6. Explicit Move:
Trajectory(urban_navigation): Move constructed (transferred ownership)
  Trajectory: urban_navigation | Waypoints: 2/50 | Max speed: 10 m/s
    WP[0]: (0, 0) heading=90°
    WP[1]: (5, 5) heading=45°

=== End of scope - destructors will be called ===
~Trajectory(urban_navigation): Destroying (2 waypoints)
~Trajectory(parking_maneuver): Destroying (4 waypoints)
~Trajectory(highway_lane_change_copy): Destroying (3 waypoints)
~Trajectory(highway_lane_change): Destroying (4 waypoints)
~Trajectory(unnamed): Destroying (0 waypoints)
```

This comprehensive example demonstrates all constructor types in an autonomous vehicle trajectory planning context:

1. **Default Constructor**:
   - Creates empty trajectory with default values
   - Used when no specific initialization is needed

2. **Parameterized Constructors** (multiple overloads):
   - Single parameter (name only) with default capacity
   - All parameters (name, speed, capacity)
   - Shows constructor overloading
   - Uses `explicit` to prevent implicit conversions

3. **Copy Constructor**:
   - Performs deep copy of waypoint array
   - Essential for safe resource management
   - Demonstrates independence of copied objects

4. **Move Constructor**:
   - Transfers ownership of waypoint array
   - Leaves source in valid but empty state
   - Marked `noexcept` for optimal performance
   - Avoids expensive copying of large trajectory data

5. **Member Initializer Lists**:
   - All constructors use initializer lists for efficiency
   - Required for proper initialization order
   - Demonstrates initialization vs assignment

6. **Destructor**:
   - Cleans up dynamically allocated waypoint array
   - Prevents memory leaks
   - Called automatically in reverse construction order

7. **Return Value Optimization (RVO)**:
   - `createParkingTrajectory()` demonstrates move semantics
   - C++17 likely elides the move constructor entirely
   - Shows efficient return-by-value pattern

**Real-world relevance**: Autonomous vehicles continuously generate, modify, and manage trajectories. Proper constructor design ensures:
- Safe deep copying when trajectories need to be duplicated (copy constructor)
- Efficient transfer when passing trajectories between planning stages (move constructor)
- Default initialization for temporary trajectory containers
- Resource safety through RAII and proper destruction

This pattern is fundamental to managing any resource-heavy objects in autonomous vehicle software like point clouds, maps, sensor data buffers, and planned trajectories.

### INTERVIEW_QA: Comprehensive Questions and Answers

#### Q1: What is a default constructor?
**Difficulty:** #beginner  
**Category:** #syntax #fundamentals  
**Concepts:** #constructors #default_constructor #initialization

**Answer:**
A default constructor is a constructor that can be called with no arguments, either because it has no parameters or all parameters have default values.

**Code example:**
```cpp
class MyClass {
public:
    MyClass() {}  // No parameters
    MyClass(int x = 0) {}  // All parameters have defaults
};
```

**Explanation:**
The default constructor is special because it's called when objects are created without arguments (e.g., `MyClass obj;`). If no constructors are defined, the compiler generates a default constructor automatically. However, if any constructor is defined, the compiler does not generate a default constructor unless you explicitly request it with `= default`. Default constructors are essential for arrays and containers that need to construct objects without arguments.

**Key takeaway:** Define a default constructor explicitly when you have other constructors, or use `= default` to request compiler generation.

---

#### Q2: When does the compiler generate a default constructor automatically?
**Difficulty:** #intermediate  
**Category:** #syntax #interview_favorite  
**Concepts:** #constructors #default_constructor #compiler_generated

**Answer:**
The compiler generates a default constructor only when no other constructors are declared by the user; declaring any constructor prevents automatic generation.

**Code example:**
```cpp
class A {
    // ✅ Compiler generates: A() {}
};

class B {
    B(int) {}  // ❌ No default constructor generated
};

int main() {
    A a;  // ✅ OK
    // B b;  // ❌ Error: no default constructor
}
```

**Explanation:**
This is a deliberate design choice in C++—if you provide any custom constructor, you're indicating that object construction requires specific logic, so the compiler doesn't presume to know how to construct objects without arguments. This prevents accidentally creating uninitialized or improperly initialized objects. To restore default construction while keeping other constructors, explicitly define a default constructor or use `= default`.

**Key takeaway:** Declaring any constructor suppresses automatic default constructor generation—use `= default` to restore it.

---

#### Q3: What is the difference between a copy constructor and assignment operator?
**Difficulty:** #intermediate  
**Category:** #syntax #interview_favorite  
**Concepts:** #copy_constructor #assignment_operator #initialization

**Answer:**
A copy constructor initializes a new object from an existing object, while the assignment operator assigns to an already-existing object, potentially requiring cleanup of the old value.

**Code example:**
```cpp
MyClass a;
MyClass b = a;  // ✅ Copy constructor (initialization)
MyClass c;
c = a;          // ✅ Assignment operator (assignment)
```

**Explanation:**
The key distinction is whether the target object already exists. Copy constructor is called during initialization (creating a new object), so there's no previous value to clean up. Assignment operator works with an existing object that may hold resources needing cleanup before assigning new values. This is why assignment operators typically follow the pattern: check for self-assignment, clean up old resources, copy new values, return *this. The syntax `=` during declaration is initialization, not assignment.

**Key takeaway:** Copy constructor creates new objects; assignment operator modifies existing objects.

---

#### Q4: What is a move constructor and when is it called?
**Difficulty:** #intermediate  
**Category:** #memory #performance  
**Concepts:** #move_constructor #move_semantics #rvalue_reference #optimization

**Answer:**
A move constructor transfers resources from a temporary or moved-from object to a new object, taking an rvalue reference parameter `T(T&& other)`, called when initializing from temporaries or explicit std::move.

**Code example:**
```cpp
class Buffer {
    char* data;
public:
    Buffer(Buffer&& other) noexcept : data(other.data) {
        other.data = nullptr;  // ✅ Transfer ownership
    }
};

Buffer b1 = createBuffer();  // Move constructor called
```

**Explanation:**
Move constructors enable efficient transfer of resources from temporary objects or objects explicitly marked for moving with std::move. Instead of copying data (expensive), the move constructor "steals" the resources (e.g., pointer to heap memory) and leaves the source in a valid but unspecified state. This is a C++11 feature that dramatically improves performance for classes managing resources like dynamic memory, file handles, or network connections. Mark move constructors `noexcept` for optimal container performance.

**Key takeaway:** Move constructors transfer resources from temporaries, avoiding expensive copies; mark them noexcept.

---

#### Q5: Why should you use member initializer lists instead of assignment in constructor bodies?
**Difficulty:** #intermediate  
**Category:** #performance #interview_favorite  
**Concepts:** #constructors #initialization #initializer_list #efficiency

**Answer:**
Member initializer lists directly construct members with their final values, while constructor body assignment first default-constructs then assigns, wasting performance for non-trivial types.

**Code example:**
```cpp
class Bad {
    std::string name;
public:
    Bad(std::string n) {
        name = n;  // ❌ Default construct + assign
    }
};

class Good {
    std::string name;
public:
    Good(std::string n) : name(n) {}  // ✅ Direct construct
};
```

**Explanation:**
For types like std::string or std::vector, the "Bad" version default-constructs an empty string, then assigns the value, involving allocation, deallocation, and copying. The "Good" version directly constructs the string with the final value in one operation. Additionally, initializer lists are mandatory for const members, reference members, and base classes or members without default constructors. The performance difference is negligible for primitive types but significant for complex objects.

**Key takeaway:** Always prefer member initializer lists for efficiency and correctness; they're mandatory for const/reference members.

---

#### Q6: What happens to data members if not initialized in the constructor?
**Difficulty:** #intermediate  
**Category:** #memory #interview_favorite  
**Concepts:** #initialization #undefined_behavior #default_values

**Answer:**
Built-in types (int, pointers) in non-static objects contain garbage (uninitialized values), causing undefined behavior; class types call their default constructors automatically.

**Code example:**
```cpp
class Dangerous {
    int x;  // ❌ Uninitialized garbage
    std::string s;  // ✅ Default-constructed to ""
public:
    Dangerous() {}  // x has undefined value
};

int main() {
    Dangerous d;
    std::cout << d.x;  // ❌ Undefined behavior
}
```

**Explanation:**
This is a major source of bugs. For primitive types, memory isn't cleared—you get whatever bits were previously there. This can cause crashes, security vulnerabilities, or non-deterministic behavior. Static and global objects are zero-initialized, but local/member objects are not. Always initialize built-in types explicitly using initializer lists or in-class initializers (C++11+). Class-type members are safer because their default constructors run automatically, but relying on this for built-in types is dangerous.

**Key takeaway:** Always explicitly initialize built-in type members to avoid undefined behavior from garbage values.

---

#### Q7: What is the initialization order of class members?
**Difficulty:** #advanced  
**Category:** #memory #interview_favorite  
**Concepts:** #initialization #constructors #initialization_order #undefined_behavior

**Answer:**
Members are initialized in the order they are declared in the class definition, not the order listed in the constructor's initializer list, regardless of how the initializer list is written.

**Code example:**
```cpp
class Wrong {
    int second;
    int first;
public:
    Wrong(int x) : first(x), second(first) {
        // ❌ second initialized before first (declaration order)
        // second gets garbage from uninitialized first
    }
};
```

**Explanation:**
The compiler follows declaration order for member initialization, which ensures consistent layout and behavior. If initializer list order mattered, reordering the list could change object layout. However, this creates a dangerous trap when members depend on each other. In the example, even though the initializer list shows `first(x), second(first)`, the declaration order (`second` before `first`) means `second` is initialized with an uninitialized `first`. Some compilers warn with `-Wreorder`, but it's not guaranteed. Always list initializers in declaration order and avoid inter-member dependencies.

**Key takeaway:** Members initialize in declaration order, not initializer list order—match list to declaration order to avoid bugs.

---

#### Q8: Can constructors be virtual?
**Difficulty:** #beginner  
**Category:** #syntax #fundamentals  
**Concepts:** #constructors #virtual_functions #polymorphism

**Answer:**
No, constructors cannot be virtual because virtual dispatch requires a vptr, which doesn't exist until after the constructor completes.

**Explanation:**
Virtual functions work by looking up the function pointer in the vtable through the vptr stored in each object. However, constructors are responsible for setting up the vptr in the first place. During construction, the vptr progressively points to each class's vtable in the inheritance hierarchy (base first, then derived). Since the vptr isn't set to the final derived class's vtable until after construction completes, virtual dispatch can't work during construction. This is why calling virtual functions from constructors doesn't produce polymorphic behavior—they're resolved to the currently-constructing class's version.

**Key takeaway:** Constructors cannot be virtual because the vptr needed for virtual dispatch isn't ready during construction.

---

#### Q9: What is a delegating constructor?
**Difficulty:** #intermediate  
**Category:** #syntax #design_pattern  
**Concepts:** #constructors #delegating_constructor #code_reuse

**Answer:**
A delegating constructor (C++11+) calls another constructor of the same class in its initializer list, reducing code duplication by centralizing initialization logic.

**Code example:**
```cpp
class Point {
    int x, y;
public:
    Point(int a, int b) : x(a), y(b) {}
    Point() : Point(0, 0) {}  // ✅ Delegates to main constructor
    Point(int val) : Point(val, val) {}  // ✅ Square point
};
```

**Explanation:**
Before C++11, common initialization code was typically extracted to a private init() function. Delegating constructors provide a cleaner solution by having one constructor call another directly. The target constructor executes completely (including its body) before the delegating constructor's body runs. You cannot use delegating and member initialization together—either delegate OR initialize members, not both. Use delegation to avoid repeating validation, resource acquisition, or initialization logic across multiple constructors.

**Key takeaway:** Use delegating constructors to centralize initialization logic and reduce code duplication.

---

#### Q10: What is the explicit keyword and why is it important?
**Difficulty:** #intermediate  
**Category:** #syntax #interview_favorite  
**Concepts:** #explicit #constructors #implicit_conversion

**Answer:**
The explicit keyword prevents implicit conversions from constructor parameter types to the class type, requiring explicit construction and preventing surprising implicit conversions.

**Code example:**
```cpp
class Array {
public:
    explicit Array(int size);
};

void process(Array arr);

// Array a = 10;  // ❌ Error: implicit conversion prevented
Array a(10);      // ✅ OK: explicit construction
// process(20);   // ❌ Error: no implicit conversion
process(Array(20));  // ✅ OK
```

**Explanation:**
Without explicit, single-parameter constructors act as implicit conversion functions. For example, `Array a = 10;` would implicitly call `Array(10)`, which might be unexpected and lead to bugs or performance issues. The explicit keyword forces users to clearly indicate construction intent. Use explicit for single-parameter constructors unless implicit conversion is genuinely desired and makes sense semantically (like std::string from const char*). Modern C++ guidelines recommend explicit by default for constructors.

**Key takeaway:** Use explicit for single-parameter constructors to prevent surprising implicit conversions.

---

#### Q11: How do const and reference members affect constructor requirements?
**Difficulty:** #intermediate  
**Category:** #syntax #memory  
**Concepts:** #constructors #const #references #initializer_list

**Answer:**
Const and reference members must be initialized in the constructor's member initializer list because they cannot be assigned after construction—they must be bound/set at initialization time.

**Code example:**
```cpp
class Container {
    const int maxSize;
    int& externalCounter;
public:
    Container(int max, int& counter)
        : maxSize(max), externalCounter(counter) {  // ✅ Must use list
        // maxSize = max;  // ❌ Error: cannot assign to const
    }
};
```

**Explanation:**
This reflects fundamental C++ semantics: references are aliases that must be bound to an object at creation and cannot be rebound, while const objects cannot be modified after initialization. Attempting to assign to these members in the constructor body fails because they must be initialized before the body executes. The initializer list provides the mechanism for this initial binding. This same requirement applies to members of types without default constructors—they must be explicitly initialized in the initializer list.

**Key takeaway:** Const and reference members require initializer list initialization; assignment in constructor body is illegal.

---

#### Q12: What is the Rule of Five?
**Difficulty:** #advanced  
**Category:** #design_pattern #interview_favorite  
**Concepts:** #rule_of_five #constructors #destructors #copy_constructor #move_semantics

**Answer:**
The Rule of Five states that if you define any of destructor, copy constructor, copy assignment, move constructor, or move assignment, you should define or delete all five to ensure correct resource management.

**Code example:**
```cpp
class Resource {
    int* data;
public:
    ~Resource() { delete[] data; }
    Resource(const Resource& other);
    Resource& operator=(const Resource& other);
    Resource(Resource&& other) noexcept;
    Resource& operator=(Resource&& other) noexcept;
};
```

**Explanation:**
This rule exists because defining one of these functions indicates the class manages resources (memory, file handles, etc.) requiring custom handling. If you define a destructor to release resources, you likely need a copy constructor to properly duplicate those resources and move constructor to transfer them efficiently. Failing to define all five can lead to double-deletes, resource leaks, or inefficient copying when moves were expected. The Rule of Zero suggests avoiding this entirely by using RAII wrappers like std::unique_ptr instead of raw resources.

**Key takeaway:** Define or delete all five special member functions when managing resources; prefer Rule of Zero with RAII wrappers.

---

#### Q13: When does the compiler generate a move constructor?
**Difficulty:** #advanced  
**Category:** #memory #performance  
**Concepts:** #move_constructor #compiler_generated #rule_of_five

**Answer:**
The compiler generates a move constructor only when no user-declared copy constructor, copy assignment, move assignment, or destructor exists; declaring any of these suppresses move generation.

**Code example:**
```cpp
class A {
    // ✅ Compiler generates move constructor
};

class B {
    ~B() {}  // ❌ User-declared destructor
    // Move constructor NOT generated
};

class C {
    C(const C&) {}  // ❌ User-declared copy constructor
    // Move constructor NOT generated
};
```

**Explanation:**
This restrictive policy encourages following the Rule of Five. If you've defined a destructor, copy constructor, or assignment operators, you're managing resources and should consciously decide how moves work. The compiler won't guess. This prevents subtle bugs where the default move (memberwise move) would be incorrect for resource-managing classes. If you want compiler-generated moves while having a custom destructor, explicitly default them: `T(T&&) = default;`. Modern practice recommends defining all five or using `= default/delete` to be explicit.

**Key takeaway:** Move constructors are only auto-generated when no other special member functions are user-declared.

---

#### Q14: What is copy elision and how does it affect constructors?
**Difficulty:** #advanced  
**Category:** #performance #optimization  
**Concepts:** #copy_elision #rvo #optimization #move_semantics

**Answer:**
Copy elision is a compiler optimization that eliminates copy/move constructors when creating objects, especially with return values; in C++17, it's mandatory for returning temporaries (guaranteed RVO).

**Code example:**
```cpp
class Logger {
public:
    Logger() { std::cout << "Construct\n"; }
    Logger(const Logger&) { std::cout << "Copy\n"; }
    Logger(Logger&&) { std::cout << "Move\n"; }
};

Logger create() {
    return Logger();  // C++17: just "Construct", no move/copy
}
```

**Explanation:**
Before C++17, compilers could optionally eliminate copies through Return Value Optimization (RVO) and Named RVO (NRVO), but the copy/move constructor still needed to be accessible. C++17 made elision mandatory when returning temporaries, changing observable behavior—copy/move constructors aren't called at all. This improves performance dramatically but means you can't rely on side effects in copy/move constructors for counting object creations. Named return values may still be copied/moved depending on compiler optimization.

**Key takeaway:** C++17 guarantees copy elision for temporaries, eliminating copy/move constructors; don't rely on their side effects.

---

#### Q15: What are in-class member initializers?
**Difficulty:** #intermediate  
**Category:** #syntax  
**Concepts:** #initialization #constructors #in_class_initializer #default_values

**Answer:**
In-class member initializers (C++11+) provide default values for data members directly in the class definition, used when not overridden by constructor initializer lists.

**Code example:**
```cpp
class Config {
    int timeout = 30;  // ✅ Default value
    bool enabled = true;
public:
    Config() {}  // Uses defaults
    Config(int t) : timeout(t) {}  // Overrides timeout only
};
```

**Explanation:**
This feature reduces code duplication when multiple constructors share common default values. In-class initializers are applied before the constructor runs, and constructor initializer lists override them. They're particularly useful for classes with many data members where most have sensible defaults but some constructors need to override specific ones. Non-static members can use `=` or brace initialization `{}`. Static const integral members can be initialized in-class in older C++ versions, but C++11 extends this to all non-static members.

**Key takeaway:** Use in-class initializers for default member values; constructor initializer lists override them when needed.

---

#### Q16: What happens when you return a local object by value?
**Difficulty:** #intermediate  
**Category:** #memory #performance  
**Concepts:** #rvo #copy_elision #move_semantics #return_value

**Answer:**
Modern compilers perform copy elision (mandatory in C++17 for temporaries), constructing the return value directly in the caller's memory; otherwise, the move constructor is used if available, falling back to copy.

**Code example:**
```cpp
Object create() {
    Object local;
    return local;  // C++17+: likely elided or moved, not copied
}

Object obj = create();  // Direct construction or move
```

**Explanation:**
Return value optimization (RVO) eliminates the copy/move entirely by constructing the object directly in the caller's destination memory. For unnamed temporaries, C++17 guarantees this. For named variables (NRVO), it's optional but common. If elision doesn't occur, the compiler prefers move over copy, binding the return value to rvalue references. Only if no move constructor exists does copy happen. This is why providing move constructors for resource-heavy classes improves performance even though RVO often eliminates it.

**Key takeaway:** Return by value is efficient thanks to RVO and move semantics; provide move constructors for resource-heavy classes.

---

#### Q17: Can you have multiple constructors with the same number of parameters?
**Difficulty:** #beginner  
**Category:** #syntax  
**Concepts:** #constructors #overloading #function_signature

**Answer:**
Yes, constructors can be overloaded based on parameter types (not count), just like regular functions, as long as the signatures are distinguishable.

**Code example:**
```cpp
class Value {
public:
    Value(int x) { std::cout << "int: " << x << "\n"; }
    Value(double x) { std::cout << "double: " << x << "\n"; }
    Value(const char* s) { std::cout << "string: " << s << "\n"; }
};

Value v1(10);      // Calls int version
Value v2(3.14);    // Calls double version
Value v3("hello"); // Calls const char* version
```

**Explanation:**
Constructor overloading follows normal function overloading rules—signatures must be distinguishable by parameter types. The compiler selects the best match based on argument types. Be careful with ambiguous cases like `Value(0)` if you have both `int` and `char*` constructors (0 is a valid null pointer constant). Use explicit when appropriate, and consider whether you truly need multiple overloads or if a single constructor with default parameters would suffice.

**Key takeaway:** Constructors overload by parameter type, enabling different construction strategies for different argument types.

---

#### Q18: What is aggregate initialization?
**Difficulty:** #intermediate  
**Category:** #syntax  
**Concepts:** #initialization #aggregate #pod #brace_initialization

**Answer:**
Aggregate initialization allows initializing aggregate types (classes/structs with no user-defined constructors, no private/protected members, no base classes, no virtual functions) using brace syntax with member values in declaration order.

**Code example:**
```cpp
struct Point {
    int x;
    int y;
    int z;
};

Point p1 = {1, 2, 3};     // ✅ Aggregate initialization
Point p2{4, 5, 6};        // ✅ Also valid
Point p3 = {.x=1, .z=3};  // ✅ C++20: designated initializers
```

**Explanation:**
Aggregate initialization provides simple syntax for initializing simple structures without needing constructors. The values correspond to members in declaration order. Omitted trailing members are value-initialized (zero for primitives). C++20 adds designated initializers allowing explicit member names for clarity. Adding any constructor removes aggregate status, requiring explicit construction. This feature is useful for POD types, configuration structs, and interfacing with C code. Use aggregate initialization for simple data structures; add constructors for validation or invariants.

**Key takeaway:** Use aggregate initialization for simple structs without constructors; it provides concise syntax for value lists.

---

#### Q19: What is the difference between direct initialization and copy initialization?
**Difficulty:** #intermediate  
**Category:** #syntax  
**Concepts:** #initialization #direct_initialization #copy_initialization #explicit

**Answer:**
Direct initialization uses parentheses or braces and can call explicit constructors; copy initialization uses `=` and cannot call explicit constructors, potentially performing implicit conversions.

**Code example:**
```cpp
class Array {
public:
    explicit Array(int size);
};

Array a1(10);    // ✅ Direct initialization - OK
Array a2{10};    // ✅ Direct initialization - OK
// Array a3 = 10;  // ❌ Copy initialization - error with explicit
```

**Explanation:**
The distinction matters for explicit constructors and performance. Direct initialization directly calls the constructor with the arguments. Copy initialization creates a temporary from the right-hand side and copies/moves it to the destination (though copy elision usually eliminates the copy). Since C++17, copy elision is mandatory for temporaries, but explicit still prevents copy initialization syntax. Use direct initialization (parentheses or braces) for explicit constructors and when you want to avoid implicit conversions. The `=` syntax is more readable for simple cases but has limitations.

**Key takeaway:** Direct initialization (parentheses/braces) works with explicit constructors; copy initialization (`=`) does not.

---

#### Q20: How do constructors work with inheritance?
**Difficulty:** #intermediate  
**Category:** #inheritance #memory  
**Concepts:** #constructors #inheritance #base_class #initialization_order

**Answer:**
Base class constructors are called before derived class constructors; derived constructors must explicitly initialize base classes in their initializer list, or the base default constructor is called automatically.

**Code example:**
```cpp
class Base {
public:
    Base(int x) { std::cout << "Base(" << x << ")\n"; }
};

class Derived : public Base {
public:
    Derived(int x, int y) : Base(x) {  // ✅ Must initialize base
        std::cout << "Derived(" << y << ")\n";
    }
};

Derived d(10, 20);  // Output: Base(10), Derived(20)
```

**Explanation:**
Construction proceeds from base to derived to ensure the base class portion is fully initialized before derived class initialization begins. If the base class lacks a default constructor, derived constructors must explicitly call a base constructor using initializer list syntax. Multiple inheritance constructs bases in declaration order. This construction order ensures that derived class constructors can safely use base class members. Destruction happens in reverse order (derived to base) to maintain invariants.

**Key takeaway:** Base constructors execute first; derived constructors must explicitly initialize bases without default constructors.

---

### PRACTICE_TASKS: Constructor Behavior Analysis

#### Q1
```cpp
#include <iostream>

class A {
public:
    A() { std::cout << "A\n"; }
};

class B {
    A a;
public:
    B() : a() { std::cout << "B\n"; }
};

int main() {
    B b;
}
```

#### Q2
```cpp
#include <iostream>

class A {
    int x;
public:
    A(int val) { x = val; std::cout << "A: " << x << "\n"; }
};

int main() {
    A a(5);
}
```

#### Q3
```cpp
#include <iostream>

class A {
    int x = 10;
public:
    A() { std::cout << x << "\n"; }
};

int main() {
    A a;
}
```

#### Q4
```cpp
#include <iostream>

class A {
    int x = 10;
public:
    A(int v) : x(v) { std::cout << x << "\n"; }
};

int main() {
    A a(20);
}
```

#### Q5
```cpp
#include <iostream>

class A {
    int& ref;
public:
    A(int& r) : ref(r) {
        std::cout << ref << "\n";
    }
};

int main() {
    int x = 100;
    A a(x);
}
```

#### Q6
```cpp
#include <iostream>

class A {
    const int val;
public:
    A() {}
};

int main() {
    A a;
}
```

#### Q7
```cpp
#include <iostream>

class A {
    int x = 1;
    int y = 2;
public:
    A() : y(10), x(20) {
        std::cout << x << " " << y << "\n";
    }
};

int main() {
    A a;
}
```

#### Q8
```cpp
#include <iostream>

class A {
    int x;
public:
    A() : A(42) { std::cout << "Default\n"; }
    A(int val) : x(val) { std::cout << "Param: " << x << "\n"; }
};

int main() {
    A a;
}
```

#### Q9
```cpp
#include <iostream>

class A {
public:
    A() { std::cout << "A\n"; }
};

class B {
    A a;
public:
    B() { std::cout << "B\n"; }
};

int main() {
    B b;
}
```

#### Q10
```cpp
#include <iostream>

class A {
public:
    A() { std::cout << "Default\n"; }
    A(const A&) { std::cout << "Copy\n"; }
};

A create() {
    A a;
    return a;
}

int main() {
    A x = create();
}
```

#### Q11
```cpp
#include <iostream>

class A {
public:
    A() { std::cout << "Default\n"; }
    A(const A&) { std::cout << "Copy\n"; }
    A(A&&) { std::cout << "Move\n"; }
};

A create() {
    return A();
}

int main() {
    A x = create();
}
```

#### Q12
```cpp
#include <iostream>

class Base {
public:
    Base() { std::cout << "Base\n"; }
};

class Derived : public Base {
public:
    Derived() { std::cout << "Derived\n"; }
};

void func(Base b) {}

int main() {
    Derived d;
    func(d);
}
```

#### Q13
```cpp
#include <iostream>

class A {
public:
    A() { std::cout << "A()\n"; }
    A(int) { std::cout << "A(int)\n"; }
};

int main() {
    A a1;
    A a2(10);
}
```

#### Q14
```cpp
#include <iostream>

class A {
public:
    A() { std::cout << "A\n"; }
    ~A() { std::cout << "~A\n"; }
};

int main() {
    A();
    std::cout << "End\n";
}
```

#### Q15
```cpp
#include <iostream>

class X {
public:
    X() { std::cout << "X()\n"; }
};

class Y {
    X x;
public:
    Y() { std::cout << "Y()\n"; }
};

int main() {
    Y y;
}
```

#### Q16
```cpp
#include <iostream>

class A {
    int x;
    int y;
public:
    A(int val) : y(val), x(y + 1) {
        std::cout << x << " " << y << "\n";
    }
};

int main() {
    A a(10);
}
```

#### Q17
```cpp
#include <iostream>

class A {
public:
    explicit A(int x) { std::cout << "A(" << x << ")\n"; }
};

void func(A a) {}

int main() {
    A a(5);
    func(10);
}
```

#### Q18
```cpp
#include <iostream>

class A {
    int x;
public:
    A(int a = 0) : x(a) { std::cout << "A: " << x << "\n"; }
};

int main() {
    A a1;
    A a2(5);
}
```

#### Q19
```cpp
#include <iostream>

class Base {
public:
    Base(int x) { std::cout << "Base(" << x << ")\n"; }
};

class Derived : public Base {
public:
    Derived() : Base(42) { std::cout << "Derived\n"; }
};

int main() {
    Derived d;
}
```

#### Q20
```cpp
#include <iostream>

class A {
public:
    A() = default;
    A(int) { std::cout << "A(int)\n"; }
};

int main() {
    A a1;
    A a2(10);
}
```

### QUICK_REFERENCE: Answer Keys and Summary Tables

#### Answer Key for Practice Questions

| Q# | Answer | Explanation | Key Concept |
|----|--------|-------------|-------------|
| 1 | A<br>B | Member object A constructed before B's body executes | #initialization_order |
| 2 | A: 5 | Constructor body assignment works but less efficient than initializer list | #constructor_body |
| 3 | 10 | In-class initializer provides default value when no initializer list entry | #in_class_initializer |
| 4 | 20 | Initializer list overrides in-class initializer value | #initializer_list |
| 5 | 100 | Reference member correctly initialized via initializer list | #reference_members |
| 6 | Compilation Error | Const member must be initialized in initializer list, cannot be assigned | #const_members |
| 7 | 20 10 | Members initialized in declaration order (x first, y second) despite list order | #initialization_order |
| 8 | Param: 42<br>Default | Delegating constructor calls parameterized constructor first, then default body | #delegating_constructor |
| 9 | A<br>B | Member objects constructed before containing object's constructor body | #composition |
| 10 | Default<br>(Copy elided in C++17) | Likely just "Default" due to RVO; pre-C++17 might show Copy | #copy_elision #rvo |
| 11 | Default<br>(Move elided in C++17) | C++17 mandatory elision: just "Default"; older: Default then Move | #copy_elision #move_constructor |
| 12 | Base<br>Derived<br>Base | Object d constructed (Base, Derived), then sliced copy to Base for func parameter | #object_slicing |
| 13 | A()<br>A(int) | Two constructor overloads called based on arguments provided | #constructor_overloading |
| 14 | A<br>~A<br>End | Temporary destroyed immediately after statement, before "End" | #temporary_lifetime |
| 15 | X()<br>Y() | Member X constructed before Y's constructor body | #composition #initialization_order |
| 16 | Garbage 10<br>(Undefined) | x initialized before y (declaration order), so x gets garbage from uninitialized y | #initialization_order #undefined_behavior |
| 17 | Compilation Error | explicit prevents implicit conversion from int to A in func(10) | #explicit #implicit_conversion |
| 18 | A: 0<br>A: 5 | Default parameter allows default construction; a1 uses default 0, a2 passes 5 | #default_parameters |
| 19 | Base(42)<br>Derived | Base constructor called with 42 before Derived constructor body | #inheritance #base_initialization |
| 20 | (No output)<br>A(int) | `= default` generates default constructor; a1 uses it silently, a2 uses explicit version | #default_constructor |

#### Constructor Types Comparison

| Constructor Type | Signature | When Called | Can Be Implicit | Auto-Generated |
|-----------------|-----------|-------------|-----------------|----------------|
| Default | `T()` | No arguments | Yes | Only if no other constructors |
| Parameterized | `T(args)` | With arguments | Yes (unless explicit) | No |
| Copy | `T(const T&)` | From same-type lvalue | Yes | If no move/copy/destructor defined |
| Move | `T(T&&)` | From same-type rvalue | Yes | If no special members defined |

#### Member Initialization Methods

| Method | Syntax | When to Use | Performance | Restrictions |
|--------|--------|-------------|-------------|--------------|
| Constructor body assignment | `x = val;` | Avoid if possible | ❌ Slow for complex types | Cannot use for const/ref |
| Member initializer list | `: x(val)` | Preferred method | ✅ Optimal | Required for const/ref/no-default |
| In-class initializer | `int x = 0;` | Default values | ✅ Optimal | C++11+, overridden by list |
| Delegating constructor | `: T(args)` | Reduce duplication | ✅ Optimal | C++11+, exclusive with member init |

#### Default Values by Type

| Type | Non-Static Local/Member | Static/Global | How to Initialize |
|------|------------------------|---------------|-------------------|
| Built-in (int, float) | ❌ Garbage (undefined) | ✅ Zero | Always use initializer list or in-class init |
| Pointer | ❌ Garbage | ✅ nullptr | Always initialize explicitly |
| Class type | ✅ Default constructor | ✅ Default constructor | Automatic, but can override |
| const | Must initialize | Must initialize | Initializer list mandatory |
| Reference | Must initialize | Must initialize | Initializer list mandatory |

#### Constructor Generation Rules

| User-Declared | Default | Copy | Move | Reason |
|---------------|---------|------|------|--------|
| Nothing | ✅ Generated | ✅ Generated | ✅ Generated | Full automatic |
| Any constructor | ❌ Not generated | ✅ Generated | ✅ Generated | Constructor declared |
| Copy constructor | ❌ Not generated | User-defined | ❌ Not generated | Rule of Five |
| Move constructor | ❌ Not generated | ❌ Not generated | User-defined | Rule of Five |
| Destructor | ❌ Not generated | ✅ Generated* | ❌ Not generated | *Deprecated behavior |
| Copy assignment | ❌ Not generated | ✅ Generated | ❌ Not generated | Rule of Five |

#### Initialization Order

| Step | What Happens | Notes |
|------|-------------|-------|
| 1 | Virtual base classes | Most derived initialization |
| 2 | Direct base classes | In declaration order |
| 3 | Member variables | In declaration order (NOT list order) |
| 4 | Constructor body | After all members initialized |

#### Common Constructor Mistakes

| Mistake | Problem | Solution |
|---------|---------|----------|
| Forgetting default constructor | Can't create arrays or containers | Use `= default` or define explicitly |
| Assignment instead of initialization | Performance loss, can't use for const/ref | Use initializer list |
| Wrong initializer list order | Relying on list order instead of declaration | Match list to declaration order |
| Missing explicit | Unexpected implicit conversions | Mark single-param constructors explicit |
| Circular delegation | Infinite recursion or compile error | Ensure delegation forms acyclic graph |
| Uninitialized members | Undefined behavior for built-in types | Always initialize all members |
| Missing move constructor | Inefficient copies of temporaries | Define or default move constructor |

#### Best Practices Checklist

| Practice | Why |
|----------|-----|
| Use initializer lists | Efficient, required for const/ref |
| Use in-class initializers for defaults | Reduces duplication, clear intent |
| Mark single-param constructors explicit | Prevents implicit conversions |
| Initialize all built-in members | Avoid undefined behavior |
| Follow Rule of Five | Correct resource management |
| Use delegating constructors | Reduce duplication, centralize logic |
| Make move constructors noexcept | Optimal container performance |
| Match initializer list to declaration order | Avoid initialization order bugs |