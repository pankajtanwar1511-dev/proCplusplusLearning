## TOPIC: Constructor Types - Default, Parameterized, Copy, and Move

### THEORY_SECTION: Core Concepts and Object Construction

#### 1. Constructor Types - Object Initialization Mechanisms

**Constructor overview:**

| Constructor Type | Signature | When Called | Purpose | Auto-Generated |
|-----------------|-----------|-------------|---------|----------------|
| **Default** | `T()` or `T(args=defaults)` | No arguments provided | Initialize with default values | ✅ Only if no other constructors exist |
| **Parameterized** | `T(Type1 arg1, Type2 arg2, ...)` | With specific arguments | Initialize with custom values | ❌ Never auto-generated |
| **Copy** | `T(const T& other)` | From lvalue of same type | Create duplicate of existing object | ✅ Unless move/copy/destructor user-defined |
| **Move** | `T(T&& other)` noexcept | From rvalue of same type | Transfer resources from temporary | ✅ Only if no special members user-defined |

**Compiler-generated constructor rules (Rule of Five):**

| You Declare | Default | Copy | Move | Reason |
|-------------|---------|------|------|--------|
| **Nothing** | ✅ Generated | ✅ Generated | ✅ Generated | Full automatic support |
| **Any constructor** | ❌ Suppressed | ✅ Generated | ✅ Generated | Explicit construction required |
| **Copy constructor** | ❌ Suppressed | User-defined | ❌ Suppressed | Resource management indicated |
| **Move constructor** | ❌ Suppressed | ❌ Suppressed | User-defined | Resource management indicated |
| **Destructor** | ❌ Suppressed | ✅ Generated (deprecated) | ❌ Suppressed | Resource management indicated |
| **Copy assignment** | ❌ Suppressed | ✅ Generated | ❌ Suppressed | Resource management indicated |

**Key insight:** Declaring any constructor suppresses automatic default constructor generation. Use `= default` to restore: `T() = default;`

**Code example:**
```cpp
class Resource {
public:
    Resource() { /* default */ }                    // Default constructor
    Resource(int size) { /* param */ }              // Parameterized
    Resource(const Resource& other) { /* copy */ }  // Copy constructor
    Resource(Resource&& other) noexcept { /* move */ }  // Move constructor
    ~Resource() { /* cleanup */ }                   // Destructor
};
```

---

#### 2. Member Initialization - Default Values and Initialization Methods

**Default values by type and context:**

| Member Type | Non-Static Local/Member Object | Static/Global Object | Safe? |
|-------------|-------------------------------|---------------------|-------|
| **Built-in types** (int, float, char) | ❌ **Garbage (undefined behavior)** | ✅ Zero-initialized | ❌ Must explicitly initialize |
| **Pointers** (T*) | ❌ **Garbage (dangerous)** | ✅ nullptr | ❌ Must explicitly initialize |
| **Class types** (std::string, std::vector) | ✅ Default constructor called | ✅ Default constructor called | ✅ Automatic initialization |
| **const members** | Must initialize (initializer list) | Must initialize | N/A - Requires explicit initialization |
| **Reference members** | Must initialize (initializer list) | Must initialize | N/A - Requires explicit initialization |

**CRITICAL:** Built-in types in non-static objects contain **garbage values** unless explicitly initialized. This is a common source of undefined behavior, security vulnerabilities, and heisenbugs.

**Member initialization methods comparison:**

| Method | Syntax | Performance | When to Use | Restrictions |
|--------|--------|-------------|-------------|--------------|
| **Constructor body assignment** | `T() { member = value; }` | ❌ Slow (default-construct + assign) | Avoid if possible | Cannot use for const/ref members |
| **Member initializer list** | `T() : member(value) {}` | ✅ Optimal (direct initialization) | **Preferred method** | Required for const/ref/no-default-ctor |
| **In-class initializer (C++11+)** | `int member = 0;` | ✅ Optimal | Default values for all constructors | Overridden by initializer list |
| **Delegating constructor (C++11+)** | `T() : T(default_value) {}` | ✅ Optimal | Reduce code duplication | Cannot mix with member initialization |

**Code example - initialization methods:**
```cpp
class Configuration {
    // In-class initializers (C++11+) - provide defaults
    int timeout = 30;
    bool enabled = true;
    std::string mode = "standard";
    const int maxConnections;  // Must initialize in initializer list

public:
    // ✅ Good: Member initializer list (direct initialization)
    Configuration(int max) : maxConnections(max) {
        // timeout, enabled, mode use in-class defaults
    }

    // ✅ Good: Overrides defaults with initializer list
    Configuration(int max, int t, bool e)
        : maxConnections(max), timeout(t), enabled(e) {}

    // ❌ Bad: Assignment in constructor body (inefficient)
    // Configuration(int max) {
    //     maxConnections = max;  // ❌ Error: cannot assign to const
    //     mode = "custom";       // ❌ Inefficient: default-construct then assign
    // }
};
```

---

#### 3. Initialization Order and Pitfalls

**Member initialization order (CRITICAL):**

| Order Step | What Initializes | Determined By | Common Mistake |
|-----------|------------------|---------------|----------------|
| **1. Virtual base classes** | Most derived class controls initialization | Inheritance hierarchy | Forgetting virtual base init |
| **2. Direct base classes** | Left to right in declaration order | Class declaration | Wrong base init order assumed |
| **3. Member variables** | **Declaration order (NOT initializer list order)** | Class declaration | **Relying on list order instead** |
| **4. Constructor body** | Executes after all members initialized | Code execution | Assuming members uninitialized in body |

**DANGER:** Members are initialized in **declaration order**, not initializer list order. Relying on list order causes undefined behavior.

**Code example - initialization order bug:**
```cpp
class Dangerous {
    int second;  // Declared first
    int first;   // Declared second

public:
    // ❌ Bug: initializer list order doesn't matter
    Dangerous(int x) : first(x), second(first + 1) {
        // Actual order: second initialized first (declaration order)
        // second = first + 1, but first is UNINITIALIZED
        // Result: second contains garbage
    }

    // ✅ Fix: Match initializer list to declaration order
    Dangerous(int x) : second(x), first(second + 1) {
        // Now safe: second initialized first with x,
        // then first initialized with second + 1
    }
};
```

**Best practices for avoiding initialization bugs:**

| Practice | Why | Example |
|----------|-----|---------|
| **Match initializer list to declaration order** | Prevents using uninitialized members | List members top-to-bottom as declared |
| **Avoid inter-member dependencies** | Safer initialization | Each member initialized independently |
| **Always initialize built-in types** | Prevent garbage values | `int x = 0;` or `: x(0)` |
| **Use const for values that shouldn't change** | Compile-time enforcement | `const int maxSize = 100;` |
| **Use initializer lists, not body assignment** | Required for const/ref, more efficient | `: member(value)` |

**Key takeaway:** Always use member initializer lists for efficiency and correctness. Members initialize in **declaration order**, not list order. Explicitly initialize all built-in types to avoid undefined behavior.

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
