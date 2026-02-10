## TOPIC: Move Semantics and std::move

### THEORY_SECTION: Understanding Move Semantics

#### The Problem Move Semantics Solves

Before C++11, copying was the only way to transfer object ownership in C++. For objects managing resources like dynamic memory, file handles, or network connections, copying meant expensive duplication of resources. Even when working with temporary objects that were about to be destroyed anyway, the compiler had no choice but to perform deep copies, leading to significant performance overhead.

Consider a function returning a `std::vector` containing millions of elements. In pre-C++11 code, returning this vector meant copying all elements to the caller's location. The original vector would then be immediately destroyed, wasting both time and memory. Move semantics solves this by allowing the compiler to detect temporary objects and "steal" their resources instead of copying them.

#### What Are Move Semantics?

**Move semantics** is a C++11 feature that enables transferring ownership of resources from one object to another without copying. When an object is about to be destroyed (like a temporary), move semantics allows another object to take ownership of its resources directly, leaving the original in a valid but empty state.

This is implemented through **move constructors** and **move assignment operators**, which are special member functions that accept rvalue references (`T&&`) as parameters. When the compiler detects that an object is an rvalue (temporary or explicitly marked with `std::move`), it preferentially selects these move operations instead of copy operations.

#### The Valid-But-Unspecified State

After an object has been moved from, C++ guarantees it remains in a **valid but unspecified state**. This means:

- The object is safe to destruct
- The object can be assigned a new value
- You can call methods that don't depend on the object's current state
- You should NOT assume anything about the object's contents

For standard library types like `std::string` and `std::vector`, the moved-from state is typically empty (size 0), though this isn't guaranteed by the standard. For primitive types, moving is identical to copying since they don't manage resources.

#### What std::move Actually Does

Despite its name, `std::move` **does not move anything**. It's simply a cast that converts an lvalue into an rvalue reference. The actual moving happens when a move constructor or move assignment operator is called. Think of `std::move` as saying to the compiler: "I'm done with this object; it's okay to steal from it."

```cpp
template<typename T>
typename std::remove_reference<T>::type&& move(T&& t) noexcept {
    return static_cast<typename std::remove_reference<T>::type&&>(t);
}
```

This is essentially what `std::move` does—it's just a type cast. The permission to move is granted by this cast, but the actual resource transfer occurs in the move constructor or move assignment operator of the receiving type.

#### When Move Operations Are Used

Move operations are automatically selected by the compiler in several situations:

1. **Returning local objects from functions** - The compiler uses move or RVO
2. **Passing temporaries to functions** - Rvalue arguments match move parameters
3. **Explicit std::move** - When you explicitly cast an lvalue to rvalue
4. **Initializing from temporaries** - Like `std::vector<int> v = createVector();`
5. **Standard library operations** - Algorithms and containers use moves when possible

The beauty of move semantics is that it's mostly automatic. You write normal code, and the compiler optimizes by using moves for temporaries while preserving correctness with copies for persistent objects.

#### Move Semantics and the Rule of Five

When implementing move semantics, you typically need to follow the **Rule of Five**, which states that if you define any of the following, you should define all five:

1. Destructor
2. Copy constructor
3. Copy assignment operator
4. Move constructor
5. Move assignment operator

This is because if you're managing resources (hence need a custom destructor), you likely need custom copy and move operations to properly transfer ownership. Modern C++ prefers the **Rule of Zero** where possible—letting the compiler generate all special member functions by using smart pointers and RAII types.

---

### EDGE_CASES: Common Pitfalls and Gotchas

#### Edge Case 1: std::move Doesn't Actually Move

The most common misconception is that calling `std::move` moves the object. In reality, `std::move` is just a cast that enables moving.

```cpp
std::string s1 = "hello";
std::string s2 = std::move(s1);  // Move constructor is called here

// s1 is still a valid object
std::cout << s1.length() << "\n";  // ✅ Legal: probably prints 0
s1 = "world";                       // ✅ Legal: assignment works
std::cout << s1 << "\n";            // ✅ Legal: prints "world"
```

After `std::move(s1)`, the variable `s1` still exists and is perfectly usable. The move constructor of `std::string` was called, which likely transferred the internal buffer ownership to `s2` and left `s1` empty. But `s1` remains a valid, destructible, assignable object.

The key insight: `std::move` is permission, not action. The actual move happens in the move constructor, and what "moving" means is type-dependent.

#### Edge Case 2: Moving From const Objects

Moving requires modifying the source object (typically setting pointers to nullptr), which is impossible with const objects.

```cpp
const std::vector<int> cv = {1, 2, 3};
std::vector<int> v = std::move(cv);  // ❌ Calls COPY constructor, not move

void take(std::vector<int>&& vec) { }
// take(std::move(cv));  // ❌ Error: cannot convert const vector&& to vector&&
```

When you `std::move` a const object, you get `const T&&`, which doesn't match the signature of move constructors (which expect `T&&`). The compiler falls back to the copy constructor. This defeats the purpose of moving and is usually a sign of incorrect code.

The practical implication: don't mark objects as const if you intend to move from them. Const is for objects whose values should never change, which is incompatible with move semantics.

#### Edge Case 3: Returning Local Variables

One of the most dangerous patterns is returning references (including rvalue references) to local variables.

```cpp
std::string&& dangerous() {
    std::string local = "temporary";
    return std::move(local);  // ❌ Undefined Behavior
}

int main() {
    std::string&& ref = dangerous();  // ref now dangles
    std::cout << ref;  // ❌ UB: accessing destroyed object
}
```

Even though `std::move(local)` converts it to an rvalue reference, this doesn't prevent `local` from being destroyed when the function returns. The returned reference points to destroyed stack memory, causing undefined behavior when accessed.

The correct approach is to return by value, letting the compiler apply RVO or move automatically:

```cpp
std::string safe() {
    std::string local = "temporary";
    return local;  // ✅ Compiler optimizes (RVO or move)
}
```

#### Edge Case 4: std::move in Return Statements Can Hurt Performance

Adding `std::move` to return statements often seems logical but can actually prevent optimization.

```cpp
std::vector<int> bad() {
    std::vector<int> result = {1, 2, 3};
    return std::move(result);  // ❌ Prevents RVO
}

std::vector<int> good() {
    std::vector<int> result = {1, 2, 3};
    return result;  // ✅ Allows RVO (Copy Elision)
}
```

When you write `return result;`, the compiler can apply **Return Value Optimization (RVO)**, constructing the object directly in the caller's space with zero copies or moves. But `return std::move(result);` forces a move construction, which, while fast, is still slower than RVO.

Modern compilers (C++17+) guarantee copy elision in many cases, making explicit `std::move` in returns not just unnecessary but harmful. The rule: never use `std::move` on local objects being returned by value.

#### Edge Case 5: Moving Container Elements

When you move an element from a container, the container element is left in a valid but unspecified state, which can lead to surprising behavior.

```cpp
std::vector<std::string> vec = {"one", "two", "three"};
std::string s = std::move(vec[1]);  // Move from vec[1]

// vec[1] is now empty but still exists in the vector
std::cout << vec.size() << "\n";     // Prints 3 (size unchanged)
std::cout << vec[1].length() << "\n"; // Likely 0 (empty but valid)

// The moved-from element is still in the vector!
for (const auto& str : vec) {
    std::cout << "[" << str << "]\n";  // Prints [one][]three]
}
```

Moving from a container element doesn't remove it—it just leaves an empty-but-valid element in place. If you want to remove elements, you must explicitly erase them or use algorithms like `std::remove_if`.

#### Edge Case 6: Self-Move Assignment

Moving an object to itself should be safe but can cause problems if not handled correctly.

```cpp
class Buffer {
    int* data;
public:
    Buffer& operator=(Buffer&& other) noexcept {
        delete[] data;              // ❌ Dangerous if this == &other
        data = other.data;
        other.data = nullptr;
        return *this;
    }
};

Buffer b(100);
b = std::move(b);  // Self-move: data is deleted then set to nullptr!
```

The problem: if `this == &other`, we delete our data, then try to copy from ourselves, copying the nullptr we just set. The standard requires self-move to leave the object in a valid state, so we must check for self-assignment:

```cpp
Buffer& operator=(Buffer&& other) noexcept {
    if (this != &other) {  // ✅ Check for self-assignment
        delete[] data;
        data = other.data;
        other.data = nullptr;
    }
    return *this;
}
```

For types using smart pointers or standard containers, self-move is automatically safe because these types handle it correctly.

#### Edge Case 7: Moving Non-Movable Types

Not all types support move semantics. Some types explicitly delete their move operations or only support copying.

```cpp
class NonMovable {
public:
    NonMovable() = default;
    NonMovable(const NonMovable&) = default;  // Copy is OK
    NonMovable(NonMovable&&) = delete;        // Move is deleted
};

NonMovable a;
NonMovable b = std::move(a);  // ❌ Error: move constructor is deleted
NonMovable c = a;             // ✅ OK: uses copy constructor
```

Even if you call `std::move`, if the move constructor is deleted or unavailable, the compiler falls back to copying (if available) or produces an error. Some types (like `std::atomic`) deliberately delete move operations to ensure safety.

#### Edge Case 8: Moved-From Objects in Containers

After moving from an object stored in a container, the container still contains that object in its moved-from state.

```cpp
std::vector<std::unique_ptr<int>> vec;
vec.push_back(std::make_unique<int>(42));
vec.push_back(std::make_unique<int>(100));

auto ptr = std::move(vec[0]);  // Move ownership out
// vec[0] now holds nullptr (moved-from unique_ptr)

std::cout << vec.size() << "\n";  // Still 2 elements
if (vec[0] == nullptr) {
    std::cout << "vec[0] is null\n";  // Will print
}
```

The container size doesn't change—you've just left a moved-from element in place. For `unique_ptr`, moved-from means `nullptr`. For strings or vectors, it typically means empty. Always be aware that moving doesn't remove or replace elements.

---

### CODE_EXAMPLES: Implementing Move Semantics

#### Example 1: Basic Move Constructor Implementation

```cpp
#include <iostream>
#include <cstring>

class Buffer {
    char* data;
    size_t size;
    
public:
    // Constructor
    Buffer(size_t s) : size(s) {
        data = new char[size];
        std::cout << "Constructed Buffer of size " << size << "\n";
    }
    
    // Destructor
    ~Buffer() {
        delete[] data;
        std::cout << "Destroyed Buffer\n";
    }
    
    // Copy constructor (deep copy)
    Buffer(const Buffer& other) : size(other.size) {
        data = new char[size];
        std::memcpy(data, other.data, size);
        std::cout << "Copy constructed Buffer\n";
    }
    
    // Move constructor (transfer ownership)
    Buffer(Buffer&& other) noexcept 
        : data(other.data), size(other.size) {
        other.data = nullptr;  // ✅ Prevent double-delete
        other.size = 0;
        std::cout << "Move constructed Buffer\n";
    }
};

int main() {
    Buffer b1(100);
    Buffer b2 = std::move(b1);  // Move constructor called
    // b1 is now in valid but unspecified state (data=nullptr, size=0)
}
```

This example shows the fundamental pattern for implementing move constructors. The move constructor transfers ownership by copying pointers and then nullifying the source. This is safe because the moved-from object's destructor checks for null pointers (standard behavior in `delete[]`). The `noexcept` specification is crucial for performance in containers.

#### Example 2: Move Assignment Operator

```cpp
#include <iostream>
#include <algorithm>

class DynamicArray {
    int* data;
    size_t size;
    
public:
    DynamicArray(size_t s) : size(s), data(new int[s]) { }
    
    ~DynamicArray() { delete[] data; }
    
    // Copy assignment
    DynamicArray& operator=(const DynamicArray& other) {
        if (this != &other) {
            delete[] data;
            size = other.size;
            data = new int[size];
            std::copy(other.data, other.data + size, data);
            std::cout << "Copy assigned\n";
        }
        return *this;
    }
    
    // Move assignment
    DynamicArray& operator=(DynamicArray&& other) noexcept {
        if (this != &other) {  // ✅ Check self-assignment
            delete[] data;      // Clean up existing resource
            
            data = other.data;  // Steal resource
            size = other.size;
            
            other.data = nullptr;  // Nullify source
            other.size = 0;
            std::cout << "Move assigned\n";
        }
        return *this;
    }
};

int main() {
    DynamicArray arr1(10);
    DynamicArray arr2(20);
    
    arr2 = std::move(arr1);  // Move assignment
    // arr1 is now empty but valid
}
```

The move assignment operator must first clean up the current object's resources (since we're replacing them), then steal the source's resources, and finally nullify the source. The self-assignment check prevents deleting resources we're about to use.

#### Example 3: The Rule of Five in Practice

```cpp
#include <iostream>
#include <string>

class Resource {
    std::string name;
    int* data;
    size_t size;
    
public:
    // 1. Constructor
    Resource(const std::string& n, size_t s) 
        : name(n), size(s), data(new int[s]) {
        std::cout << "Constructed " << name << "\n";
    }
    
    // 2. Destructor
    ~Resource() {
        delete[] data;
        std::cout << "Destroyed " << name << "\n";
    }
    
    // 3. Copy constructor
    Resource(const Resource& other)
        : name(other.name + "_copy"), size(other.size), 
          data(new int[other.size]) {
        std::copy(other.data, other.data + size, data);
        std::cout << "Copy constructed " << name << "\n";
    }
    
    // 4. Copy assignment
    Resource& operator=(const Resource& other) {
        if (this != &other) {
            delete[] data;
            name = other.name + "_assigned";
            size = other.size;
            data = new int[size];
            std::copy(other.data, other.data + size, data);
            std::cout << "Copy assigned " << name << "\n";
        }
        return *this;
    }
    
    // 5. Move constructor
    Resource(Resource&& other) noexcept
        : name(std::move(other.name)), size(other.size), 
          data(other.data) {
        other.data = nullptr;
        other.size = 0;
        std::cout << "Move constructed " << name << "\n";
    }
    
    // 6. Move assignment
    Resource& operator=(Resource&& other) noexcept {
        if (this != &other) {
            delete[] data;
            name = std::move(other.name);
            size = other.size;
            data = other.data;
            other.data = nullptr;
            other.size = 0;
            std::cout << "Move assigned " << name << "\n";
        }
        return *this;
    }
};
```

This complete example implements all five special member functions. Notice how string members use `std::move` in move operations—even member variables need to be moved explicitly. The `noexcept` on move operations allows containers to use moves during reallocation.

#### Example 4: Understanding std::move Is Just a Cast

```cpp
#include <iostream>
#include <string>
#include <type_traits>

void demonstrate_move_cast() {
    std::string s1 = "hello";
    
    // std::move is just a cast to rvalue reference
    decltype(std::move(s1)) moved = std::move(s1);
    // moved has type std::string&&
    
    static_assert(std::is_rvalue_reference<decltype(std::move(s1))>::value,
                  "std::move produces rvalue reference");
    
    // s1 hasn't been modified at all by std::move
    std::cout << "s1 after std::move: [" << s1 << "]\n";  // Still "hello"
    
    // The move only happens when we use the rvalue reference
    std::string s2 = std::move(s1);  // NOW the move happens
    std::cout << "s1 after move constructor: [" << s1 << "]\n";  // Empty
}
```

This example proves that `std::move` itself doesn't change the object. After calling `std::move(s1)`, the string `s1` still contains "hello". Only when the returned rvalue reference is used to initialize `s2` does the move constructor execute and transfer ownership.

#### Example 5: Moved-From State Examples

```cpp
#include <iostream>
#include <vector>
#include <string>

void demonstrate_moved_from_state() {
    // Strings
    std::string s1 = "hello";
    std::string s2 = std::move(s1);
    std::cout << "s1.length(): " << s1.length() << "\n";  // Likely 0
    std::cout << "s1.empty(): " << s1.empty() << "\n";     // Likely true
    s1 = "world";  // ✅ Can be assigned
    std::cout << "s1 after assignment: " << s1 << "\n";
    
    // Vectors
    std::vector<int> v1 = {1, 2, 3, 4, 5};
    std::vector<int> v2 = std::move(v1);
    std::cout << "v1.size(): " << v1.size() << "\n";       // Likely 0
    std::cout << "v1.capacity(): " << v1.capacity() << "\n"; // Likely 0
    v1.push_back(10);  // ✅ Can be used
    std::cout << "v1 after push_back: " << v1[0] << "\n";
    
    // Unique pointers
    std::unique_ptr<int> p1 = std::make_unique<int>(42);
    std::unique_ptr<int> p2 = std::move(p1);
    std::cout << "p1 is null: " << (p1 == nullptr) << "\n";  // true
    // std::cout << *p1;  // ❌ Undefined behavior: dereferencing null
}
```

Standard library types define predictable moved-from states: containers become empty, unique pointers become null, strings become empty. However, you should never rely on these specifics in generic code—only that the object is valid for destruction and assignment.

#### Example 6: Perfect Forwarding Preview with Move

```cpp
#include <iostream>
#include <utility>

template<typename T>
void process(T&& arg) {
    // arg is an lvalue inside this function (has a name)
    // Even if called with rvalue!
    
    // Wrong: always copies
    // std::string s1 = arg;
    
    // Correct: preserves value category
    std::string s2 = std::forward<T>(arg);
}

void demo_forwarding() {
    std::string s = "lvalue";
    process(s);                    // T = std::string&
    process(std::string("rvalue")); // T = std::string
    
    // Inside process:
    // For lvalue: forward returns lvalue ref → copy
    // For rvalue: forward returns rvalue ref → move
}
```

This previews perfect forwarding (covered in detail in another document). The key insight: named rvalue reference parameters are lvalues, so they need `std::forward` to conditionally cast back to rvalues when appropriate. `std::move` is unconditional; `std::forward` is conditional.

#### Example 7: Move-Only Types

```cpp
#include <iostream>
#include <memory>
#include <thread>

class MoveOnly {
    std::unique_ptr<int> data;
    
public:
    MoveOnly(int value) : data(std::make_unique<int>(value)) { }
    
    // Delete copy operations
    MoveOnly(const MoveOnly&) = delete;
    MoveOnly& operator=(const MoveOnly&) = delete;
    
    // Default move operations
    MoveOnly(MoveOnly&&) = default;
    MoveOnly& operator=(MoveOnly&&) = default;
    
    int get() const { return *data; }
};

MoveOnly create() {
    return MoveOnly(42);  // ✅ Moved or elided
}

int main() {
    MoveOnly obj1(10);
    // MoveOnly obj2 = obj1;  // ❌ Error: copy deleted
    MoveOnly obj2 = std::move(obj1);  // ✅ OK: move works
    
    MoveOnly obj3 = create();  // ✅ OK: move from temporary
}
```

Move-only types like `std::unique_ptr`, `std::thread`, and custom types with deleted copy operations can only be transferred via move semantics. This enforces single ownership and prevents accidental copies that would violate invariants.

#### Example 8: Moving in Containers

```cpp
#include <iostream>
#include <vector>
#include <string>

int main() {
    std::vector<std::string> vec;
    vec.reserve(3);  // Prevent reallocation
    
    std::string s1 = "one";
    std::string s2 = "two";
    std::string s3 = "three";
    
    // Copy into vector
    vec.push_back(s1);
    std::cout << "s1: [" << s1 << "]\n";  // Still "one"
    
    // Move into vector
    vec.push_back(std::move(s2));
    std::cout << "s2: [" << s2 << "]\n";  // Empty (moved-from)
    
    // Move directly from temporary
    vec.push_back(std::string("four"));  // Automatic move
    
    // Emplace constructs in-place (most efficient)
    vec.emplace_back("five");
    
    for (const auto& str : vec) {
        std::cout << "[" << str << "] ";
    }
    std::cout << "\n";
}
```

Containers are move-aware. `push_back` has both copy and move overloads, automatically selecting the appropriate one based on value category. `emplace_back` is even better, constructing the object directly in the container without any copies or moves.

---

#### Example 9: Autonomous Vehicle - Trajectory Transfer with Move Semantics

```cpp
#include <iostream>
#include <vector>
#include <string>
#include <memory>

// Waypoint contains position and velocity information
struct Waypoint {
    double x, y, heading;
    double velocity_mps;

    Waypoint(double x_, double y_, double h, double v)
        : x(x_), y(y_), heading(h), velocity_mps(v) {}
};

// Trajectory can contain thousands of waypoints (expensive to copy)
class Trajectory {
    std::string name_;
    std::vector<Waypoint> waypoints_;
    std::unique_ptr<char[]> metadata_;  // Additional trajectory metadata
    size_t metadata_size_;

public:
    // Constructor
    Trajectory(const std::string& name, size_t reserve_size = 1000)
        : name_(name), metadata_size_(1024) {
        waypoints_.reserve(reserve_size);
        metadata_ = std::make_unique<char[]>(metadata_size_);
        std::cout << "Trajectory '" << name_ << "' constructed with "
                  << reserve_size << " waypoint capacity\n";
    }

    // Copy constructor: expensive deep copy
    Trajectory(const Trajectory& other)
        : name_(other.name_ + "_copy"),
          waypoints_(other.waypoints_),
          metadata_size_(other.metadata_size_) {
        metadata_ = std::make_unique<char[]>(metadata_size_);
        std::memcpy(metadata_.get(), other.metadata_.get(), metadata_size_);
        std::cout << "Trajectory '" << name_ << "' COPIED ("
                  << waypoints_.size() << " waypoints, "
                  << metadata_size_ << " bytes metadata)\n";
    }

    // Move constructor: efficient resource transfer
    Trajectory(Trajectory&& other) noexcept
        : name_(std::move(other.name_)),
          waypoints_(std::move(other.waypoints_)),
          metadata_(std::move(other.metadata_)),
          metadata_size_(other.metadata_size_) {
        other.metadata_size_ = 0;
        std::cout << "Trajectory '" << name_ << "' MOVED (efficient transfer)\n";
    }

    // Copy assignment
    Trajectory& operator=(const Trajectory& other) {
        if (this != &other) {
            name_ = other.name_ + "_assigned";
            waypoints_ = other.waypoints_;
            metadata_size_ = other.metadata_size_;
            metadata_ = std::make_unique<char[]>(metadata_size_);
            std::memcpy(metadata_.get(), other.metadata_.get(), metadata_size_);
            std::cout << "Trajectory COPY assigned\n";
        }
        return *this;
    }

    // Move assignment
    Trajectory& operator=(Trajectory&& other) noexcept {
        if (this != &other) {
            name_ = std::move(other.name_);
            waypoints_ = std::move(other.waypoints_);
            metadata_ = std::move(other.metadata_);
            metadata_size_ = other.metadata_size_;
            other.metadata_size_ = 0;
            std::cout << "Trajectory MOVE assigned\n";
        }
        return *this;
    }

    void addWaypoint(double x, double y, double heading, double velocity) {
        waypoints_.emplace_back(x, y, heading, velocity);
    }

    std::string getName() const { return name_; }
    size_t getWaypointCount() const { return waypoints_.size(); }
};

class TrajectoryPlanner {
    std::vector<Trajectory> trajectory_history_;

public:
    // Accept by value and move - sink parameter pattern
    void storeTrajectory(Trajectory traj) {
        std::cout << "Storing trajectory...\n";
        trajectory_history_.push_back(std::move(traj));  // Move into vector
    }

    // Return by value - enables RVO or move
    Trajectory generateTrajectory(const std::string& name) {
        Trajectory traj(name, 500);
        // Generate waypoints
        for (int i = 0; i < 100; ++i) {
            traj.addWaypoint(i * 1.0, i * 0.5, i * 0.1, 10.0);
        }
        return traj;  // ✅ Automatic move or RVO (don't use std::move here!)
    }
};

// Helper: Create trajectory (demonstrates std::move usage)
Trajectory createEmergencyTrajectory() {
    Trajectory emergency("emergency_stop", 100);
    emergency.addWaypoint(0, 0, 0, 0);  // Immediate stop
    return emergency;  // Automatic move or RVO
}

int main() {
    TrajectoryPlanner planner;

    std::cout << "=== Move from Temporary ===\n";
    // Temporary directly moved into storeTrajectory parameter
    planner.storeTrajectory(Trajectory("temp_path", 200));

    std::cout << "\n=== std::move from Named Object ===\n";
    Trajectory main_path("main_route", 1000);
    main_path.addWaypoint(0, 0, 0, 15.0);
    main_path.addWaypoint(10, 5, 0.5, 15.0);

    // Using std::move to transfer ownership
    planner.storeTrajectory(std::move(main_path));
    // main_path now in valid-but-unspecified state

    std::cout << "\n=== Copy from Named Object (no std::move) ===\n";
    Trajectory backup_path("backup_route", 500);
    backup_path.addWaypoint(0, 0, 0, 10.0);

    planner.storeTrajectory(backup_path);  // Copy (backup_path still needed)
    std::cout << "backup_path still valid: " << backup_path.getName() << "\n";

    std::cout << "\n=== Return Value Optimization ===\n";
    Trajectory generated = planner.generateTrajectory("generated_path");
    // Only one construction (RVO) or one construction + one move

    std::cout << "\n=== Move Assignment ===\n";
    Trajectory path1("path_1", 100);
    Trajectory path2("path_2", 100);
    path1 = std::move(path2);  // Move assignment
    // path2 now in moved-from state

    std::cout << "\n=== Moved-From State Usage ===\n";
    // Safe operations on moved-from object:
    path2 = createEmergencyTrajectory();  // ✅ Can assign new value
    std::cout << "Reused path2: " << path2.getName() << "\n";

    std::cout << "\n=== Move-Only Type (unique_ptr member) ===\n";
    // Trajectory contains unique_ptr, so it's naturally move-friendly
    std::vector<Trajectory> trajectories;
    trajectories.push_back(Trajectory("vec_path_1", 50));  // Move
    trajectories.push_back(std::move(generated));          // Move

    std::cout << "\n=== Complete ===\n";
    return 0;
}
```

**Output:**
```
=== Move from Temporary ===
Trajectory 'temp_path' constructed with 200 waypoint capacity
Trajectory 'temp_path' MOVED (efficient transfer)
Storing trajectory...
Trajectory 'temp_path' MOVED (efficient transfer)

=== std::move from Named Object ===
Trajectory 'main_route' constructed with 1000 waypoint capacity
Trajectory 'main_route' MOVED (efficient transfer)
Storing trajectory...
Trajectory 'main_route' MOVED (efficient transfer)

=== Copy from Named Object (no std::move) ===
Trajectory 'backup_route' constructed with 500 waypoint capacity
Trajectory 'backup_route_copy' COPIED (1 waypoints, 1024 bytes metadata)
Storing trajectory...
Trajectory 'backup_route_copy' MOVED (efficient transfer)
backup_path still valid: backup_route

=== Return Value Optimization ===
Trajectory 'generated_path' constructed with 500 waypoint capacity
Trajectory 'generated_path' MOVED (efficient transfer)

=== Move Assignment ===
Trajectory 'path_1' constructed with 100 waypoint capacity
Trajectory 'path_2' constructed with 100 waypoint capacity
Trajectory MOVE assigned

=== Moved-From State Usage ===
Trajectory 'emergency_stop' constructed with 100 waypoint capacity
Trajectory MOVE assigned
Reused path2: emergency_stop

=== Move-Only Type (unique_ptr member) ===
Trajectory 'vec_path_1' constructed with 50 waypoint capacity
Trajectory 'vec_path_1' MOVED (efficient transfer)
Trajectory 'generated_path' MOVED (efficient transfer)

=== Complete ===
```

**Key Concepts Demonstrated:**

1. **Move Constructor**: Transfers ownership of `vector` and `unique_ptr` resources without copying. The source object is left in a valid but empty state. This is critical for large trajectory data.

2. **Move Assignment**: Efficiently replaces one trajectory with another by stealing resources rather than allocating new memory and copying data.

3. **std::move Usage**: Explicitly cast lvalues to rvalues when you want to enable move semantics. After `std::move(main_path)`, the object `main_path` is in a moved-from state.

4. **Valid-But-Unspecified State**: After moving, `path2` is still a valid object that can be destroyed or assigned to, but its contents are unspecified (typically empty).

5. **Automatic Move on Return**: The `generateTrajectory` function returns a local object without `std::move`—the compiler automatically applies move semantics or RVO.

6. **Copy vs Move Decision**: Without `std::move`, `backup_path` is copied (lvalue). With `std::move`, `main_path` is moved (cast to rvalue). The sink parameter pattern (`void storeTrajectory(Trajectory traj)`) accepts both.

7. **noexcept Specification**: Move operations are marked `noexcept`, which is critical for enabling move optimizations in standard containers during reallocation.

**Real-World Relevance**:

In autonomous driving systems:
- **Trajectory Planning** generates paths with thousands of waypoints (x, y, heading, velocity) multiple times per second
- **Copying** a 5000-waypoint trajectory means allocating ~160KB+ and copying all data (expensive)
- **Moving** transfers ownership of the underlying buffer in constant time (a few pointer assignments)
- **Performance Impact**: At 10Hz planning frequency, avoiding copies can save 1.6MB/s of allocations and significant CPU time
- **Real-time Requirements**: Motion planning must complete within strict deadlines (typically 100ms); unnecessary copies can cause deadline misses in safety-critical systems

The `unique_ptr` member demonstrates that trajectories with exclusive-ownership resources naturally become move-only or move-friendly, enforcing correct resource management through the type system.

---

### INTERVIEW_QA: Move Semantics Deep Dive

#### Q1: What problem does move semantics solve in C++?
**Difficulty:** #beginner
**Category:** #fundamentals #motivation
**Concepts:** #move_semantics #performance #copying

**Answer:**
Move semantics eliminates unnecessary copying of temporary objects by allowing efficient resource transfer, significantly improving performance for resource-owning types.

**Code example:**
```cpp
// Without move semantics (C++03):
std::vector<int> getData() {
    std::vector<int> result(1000000);
    return result;  // ❌ Forces expensive copy
}

// With move semantics (C++11+):
std::vector<int> getData() {
    std::vector<int> result(1000000);
    return result;  // ✅ Move or RVO - no copy
}
```

**Explanation:**
Before C++11, returning large objects meant copying all data even when the original would be destroyed immediately. Move semantics allows detecting temporaries and transferring ownership of their resources instead of duplicating them, providing automatic optimization without changing calling code.

**Key takeaway:** Move semantics enables efficient resource transfer from temporaries, avoiding expensive copies.

---

#### Q2: What does std::move actually do?
**Difficulty:** #beginner
**Category:** #fundamentals #common_pitfall
**Concepts:** #std_move #rvalue_cast #move_semantics

**Answer:**
`std::move` is simply a cast that converts an lvalue to an rvalue reference—it doesn't move anything itself, but enables move operations to be called.

**Code example:**
```cpp
std::string s1 = "hello";
std::string s2 = std::move(s1);  // Move constructor called here, not at std::move

// Equivalent to:
std::string s3 = static_cast<std::string&&>(s1);
```

**Explanation:**
Despite its name, `std::move` performs no moving—it's just `static_cast<T&&>`. The actual resource transfer happens in move constructors or move assignment operators when they receive the rvalue reference. `std::move` is permission for moving, not the move itself.

**Key takeaway:** `std::move` is a cast to rvalue reference, enabling but not performing the actual move.

---

#### Q3: What is the "valid but unspecified" state after moving?
**Difficulty:** #intermediate
**Category:** #move_semantics #object_state
**Concepts:** #moved_from_state #valid_but_unspecified #object_lifetime

**Answer:**
A moved-from object remains in a valid state where it can be destroyed or assigned new values, but its specific contents are unspecified and shouldn't be relied upon.

**Code example:**
```cpp
std::vector<int> v1 = {1, 2, 3};
std::vector<int> v2 = std::move(v1);

// Safe operations on v1:
v1.clear();                  // ✅ OK
v1 = {4, 5, 6};             // ✅ OK  
std::cout << v1.size();     // ✅ OK to call, but value is unspecified

// Unsafe operations:
// Assuming v1 is empty       // ❌ Not guaranteed
// Using v1's data            // ❌ Contents are unspecified
```

**Explanation:**
The C++ standard requires moved-from objects to be in a state where all operations are valid, but the actual value is implementation-defined. For standard types, this typically means empty/default state, but portable code shouldn't assume this. You can safely destroy the object, assign to it, or call methods, but reading its data is unreliable.

**Key takeaway:** Moved-from objects are safe for destruction and assignment but not for reading their supposedly-moved data.

---

#### Q4: How do you implement a move constructor?
**Difficulty:** #intermediate
**Category:** #implementation #move_semantics
**Concepts:** #move_constructor #resource_management #noexcept

**Answer:**
A move constructor transfers ownership by copying pointers/handles and nullifying the source, typically marked `noexcept` for optimal container performance.

**Code example:**
```cpp
class Buffer {
    int* data;
    size_t size;
public:
    // Move constructor
    Buffer(Buffer&& other) noexcept 
        : data(other.data), size(other.size) {
        other.data = nullptr;  // Nullify source
        other.size = 0;
    }
};
```

**Explanation:**
Move constructors steal resources by copying pointers and resetting the source to a safe state. The `noexcept` specification is crucial—without it, standard containers use copy constructors during reallocation for exception safety. The source must be left in a valid state where its destructor can run safely (hence nullifying pointers).

**Key takeaway:** Move constructors transfer ownership by copying handles and nullifying the source, marked `noexcept` for performance.

---

#### Q5: What's the difference between a move constructor and copy constructor?
**Difficulty:** #beginner
**Category:** #fundamentals #move_semantics
**Concepts:** #move_constructor #copy_constructor #resource_transfer

**Answer:**
Copy constructors create independent duplicates of resources (deep copy), while move constructors transfer ownership by stealing resources, leaving the source empty.

**Code example:**
```cpp
class Data {
    int* ptr;
public:
    // Copy: allocates new memory
    Data(const Data& other) {
        ptr = new int(*other.ptr);  // Deep copy
    }
    
    // Move: steals pointer
    Data(Data&& other) noexcept {
        ptr = other.ptr;       // Steal
        other.ptr = nullptr;   // Nullify
    }
};
```

**Explanation:**
Copy constructors preserve both objects independently, requiring resource duplication. Move constructors optimize for temporaries by transferring ownership instead of duplicating. The copy parameter is `const T&` (must preserve source), move parameter is `T&&` (can modify source). Moves are much faster for resource-heavy types.

**Key takeaway:** Copy duplicates resources; move transfers them—fundamentally different resource management strategies.

---

#### Q6: Why should move constructors be marked noexcept?
**Difficulty:** #intermediate
**Category:** #performance #exception_safety
**Concepts:** #noexcept #move_constructor #container_optimization

**Answer:**
Containers like `std::vector` only use move operations during reallocation if they're `noexcept`, otherwise they use copying for strong exception safety guarantee.

**Code example:**
```cpp
class Data {
public:
    Data(Data&& other);  // Not noexcept
    // std::vector will COPY when reallocating
    
    Data(Data&& other) noexcept;  // ✅ noexcept
    // std::vector will MOVE when reallocating
};

std::vector<Data> vec;
vec.push_back(Data());
vec.push_back(Data());  // May trigger reallocation
// Without noexcept: copies existing elements
// With noexcept: moves existing elements
```

**Explanation:**
When `std::vector` grows, it must relocate existing elements. If move operations can throw, a partial move followed by exception would leave the vector corrupted. To maintain strong exception safety, the vector copies instead of moving unless moves are guaranteed not to throw. Marking moves `noexcept` unlocks container optimizations.

**Key takeaway:** `noexcept` on move operations enables container optimizations by guaranteeing exception safety.

---

#### Q7: Can you move from a const object?
**Difficulty:** #intermediate
**Category:** #const_correctness #move_semantics
**Concepts:** #const #move_semantics #std_move

**Answer:**
You can call `std::move` on const objects, but it produces `const T&&` which cannot bind to move constructors, resulting in copying instead.

**Code example:**
```cpp
const std::string cs = "hello";
std::string s = std::move(cs);  // ❌ Calls COPY constructor, not move

void take(std::string&& s) { }
// take(std::move(cs));  // ❌ Error: const string&& → string&& conversion fails
```

**Explanation:**
Moving requires modifying the source (setting pointers to null, etc.), which const forbids. When you `std::move` a const object, you get `const T&&`, but move constructors expect `T&&` (non-const). The compiler falls back to the copy constructor which accepts `const T&`. This defeats the purpose of moving and indicates incorrect code.

**Key takeaway:** Moving from const objects fails or falls back to copying—const prevents resource transfer.

---

#### Q8: Is it safe to use an object after calling std::move on it?
**Difficulty:** #intermediate
**Category:** #move_semantics #object_lifetime
**Concepts:** #std_move #moved_from_state #safe_operations

**Answer:**
Yes, the object remains valid and can be destroyed or assigned new values, but you shouldn't assume anything about its contents until reassignment.

**Code example:**
```cpp
std::string s1 = "hello";
std::string s2 = std::move(s1);

// Safe operations:
s1.clear();          // ✅ OK
s1 = "world";        // ✅ OK
s1.~basic_string();  // ✅ OK (automatic in scope)

// Unsafe assumptions:
// if (s1.empty()) { }  // ❌ Not guaranteed
// std::cout << s1;     // ❌ Contents unspecified
```

**Explanation:**
Moved-from objects are guaranteed valid but not empty or in any specific state. All operations must remain safe, but observable state is implementation-defined. Best practice: after moving from an object, either let it be destroyed, or explicitly assign a new value before using it again.

**Key takeaway:** Moved-from objects are safe for assignment and destruction but not for reading data.

---

#### Q9: What's wrong with `return std::move(local);` for local variables?
**Difficulty:** #advanced
**Category:** #optimization #copy_elision
**Concepts:** #return_value #rvo #std_move #copy_elision

**Answer:**
Using `std::move` on returned locals can prevent Return Value Optimization (RVO), forcing a move instead of allowing the compiler to elide copies entirely.

**Code example:**
```cpp
std::vector<int> bad() {
    std::vector<int> v = {1, 2, 3};
    return std::move(v);  // ❌ Prevents RVO, forces move
}

std::vector<int> good() {
    std::vector<int> v = {1, 2, 3};
    return v;  // ✅ Allows RVO (zero copies/moves)
}
```

**Explanation:**
C++17 guarantees copy elision in many cases, constructing the return value directly in the caller's space with zero copies or moves. Writing `return std::move(v)` converts the return statement to a move, which while fast, is still slower than elision. The compiler automatically moves from locals when needed, so explicit `std::move` is both unnecessary and harmful.

**Key takeaway:** Never use `std::move` on returned locals—it prevents RVO and hurts performance.

---

#### Q10: What is the Rule of Five?
**Difficulty:** #intermediate
**Category:** #design_pattern #resource_management
**Concepts:** #rule_of_five #special_member_functions #move_semantics

**Answer:**
If you define any of destructor, copy constructor, copy assignment, move constructor, or move assignment, you should define all five to properly manage resources.

**Code example:**
```cpp
class Resource {
public:
    ~Resource();                              // 1. Destructor
    Resource(const Resource&);                // 2. Copy constructor
    Resource& operator=(const Resource&);     // 3. Copy assignment
    Resource(Resource&&) noexcept;            // 4. Move constructor
    Resource& operator=(Resource&&) noexcept; // 5. Move assignment
};
```

**Explanation:**
Classes managing resources (memory, files, locks) need custom special member functions. If you define a destructor to clean up, you likely need copy operations for correct duplication and move operations for efficient transfer. Defining only some can lead to resource leaks, double-frees, or performance issues. Modern C++ prefers the Rule of Zero using smart pointers to avoid this.

**Key takeaway:** Custom resource management requires all five special member functions for correctness and performance.

---

#### Q11: Why can't you return an rvalue reference to a local variable?
**Difficulty:** #intermediate
**Category:** #lifetime #undefined_behavior
**Concepts:** #dangling_reference #local_variable #return_value

**Answer:**
Local variables are destroyed when the function returns, so returning a reference (including rvalue reference) to them creates dangling references pointing to destroyed memory.

**Code example:**
```cpp
int&& dangerous() {
    int x = 42;
    return std::move(x);  // ❌ UB: x destroyed, reference dangles
}

int safe() {
    int x = 42;
    return x;  // ✅ OK: return by value (copy/move/RVO)
}
```

**Explanation:**
`std::move` only casts to rvalue reference—it doesn't prevent the local variable from being destroyed. When the function returns, `x` is destroyed and stack memory is reclaimed. Any reference to `x` (lvalue or rvalue) now points to invalid memory. Functions should return by value, letting the compiler optimize with RVO or automatic moves.

**Key takeaway:** Never return references to locals—return by value and let the compiler optimize.

---

#### Q12: What happens when you move from a container element?
**Difficulty:** #intermediate
**Category:** #containers #move_semantics
**Concepts:** #container #moved_from_state #element_access

**Answer:**
The element remains in the container in a moved-from state; the container's size doesn't change, but the element is now empty or invalid.

**Code example:**
```cpp
std::vector<std::string> vec = {"one", "two", "three"};
std::string s = std::move(vec[1]);  // Move from vec[1]

std::cout << vec.size() << "\n";    // Still 3
std::cout << vec[1] << "\n";        // Empty string (moved-from)

// To actually remove: vec.erase(vec.begin() + 1);
```

**Explanation:**
Moving from a container element doesn't remove it—it just leaves an empty-but-valid element in place. For `std::string`, this means an empty string. For `std::unique_ptr`, it means `nullptr`. The container still has the same number of elements. To remove elements, use `erase()` or algorithms like `std::remove_if` followed by `erase`.

**Key takeaway:** Moving from container elements leaves moved-from elements in place—use erase to actually remove them.

---

#### Q13: How does std::move interact with const references?
**Difficulty:** #intermediate
**Category:** #const_correctness #reference_binding
**Concepts:** #std_move #const_reference #type_mismatch

**Answer:**
`std::move` on const objects produces `const T&&`, which cannot bind to most move operations, causing copies or compilation errors.

**Code example:**
```cpp
void accept_move(std::string&& s) { }

const std::string cs = "hello";
// accept_move(std::move(cs));  // ❌ Error: const string&& vs string&&

const std::string& cref = "world";
// accept_move(std::move(cref)); // ❌ Same error
```

**Explanation:**
Move operations need to modify the source (nullifying pointers, etc.). When you `std::move` a const object or const reference, you get `const T&&`, which cannot bind to `T&&` parameters in move constructors or functions accepting rvalue references. This either causes compilation errors or falls back to copying.

**Key takeaway:** Const and move semantics are incompatible—moving requires modification which const forbids.

---

#### Q14: What is a move-only type and when would you use one?
**Difficulty:** #intermediate
**Category:** #design_pattern #ownership
**Concepts:** #move_only #unique_ownership #deleted_functions

**Answer:**
A move-only type deletes copy operations but allows moves, enforcing unique ownership semantics like `std::unique_ptr` or `std::thread`.

**Code example:**
```cpp
class FileHandle {
public:
    FileHandle(const char* path);
    
    // Delete copies
    FileHandle(const FileHandle&) = delete;
    FileHandle& operator=(const FileHandle&) = delete;
    
    // Allow moves
    FileHandle(FileHandle&&) noexcept = default;
    FileHandle& operator=(FileHandle&&) noexcept = default;
};
```

**Explanation:**
Move-only types represent resources that should have exactly one owner, like file handles, network connections, or unique pointers. Copying them would create shared ownership and require complex management. By deleting copy operations, you enforce unique ownership at compile time, preventing bugs from accidental copies while still allowing explicit ownership transfer via moves.

**Key takeaway:** Move-only types enforce unique ownership by deleting copies while allowing explicit ownership transfer.

---

#### Q15: Does std::move delete or invalidate the source object?
**Difficulty:** #beginner
**Category:** #common_pitfall #move_semantics
**Concepts:** #std_move #object_lifetime #moved_from_state

**Answer:**
No, `std::move` doesn't delete, invalidate, or even modify the object—it only casts to rvalue, enabling move operations that may modify it.

**Code example:**
```cpp
std::string s1 = "hello";
auto&& ref = std::move(s1);  // Just a cast
std::cout << s1 << "\n";     // Still prints "hello"

std::string s2 = std::move(s1);  // NOW move constructor executes
std::cout << s1.length() << "\n"; // Probably 0 (moved-from)
```

**Explanation:**
`std::move` is purely a type conversion—it doesn't call any functions or modify any data. After `std::move(x)`, the object `x` is unchanged until a move constructor or move assignment operator uses the returned rvalue reference. Only then does resource transfer occur, leaving the source in a valid-but-empty state.

**Key takeaway:** `std::move` is a cast, not an action—the object is unchanged until used in a move operation.

---

#### Q16: How do you implement move assignment with self-assignment safety?
**Difficulty:** #advanced
**Category:** #implementation #correctness
**Concepts:** #move_assignment #self_assignment #resource_management

**Answer:**
Check `this != &other` before moving to prevent destroying resources you're about to use in self-assignment scenarios.

**Code example:**
```cpp
class Buffer {
    int* data;
public:
    Buffer& operator=(Buffer&& other) noexcept {
        if (this != &other) {  // ✅ Essential check
            delete[] data;      // Safe: not deleting other's data
            data = other.data;
            other.data = nullptr;
        }
        return *this;
    }
};

Buffer b(100);
b = std::move(b);  // Without check: deletes own data!
```

**Explanation:**
Self-move assignment `x = std::move(x)` is valid code that must be handled correctly. Without the self-assignment check, you'd delete your own resources before trying to "steal" them from yourself, resulting in nullptr. While self-moves are rare, the standard requires them to be safe, and the check adds negligible overhead.

**Key takeaway:** Always check for self-assignment in move assignment to prevent destroying your own resources.

---

#### Q17: What's the difference between std::move and std::forward?
**Difficulty:** #advanced
**Category:** #template #perfect_forwarding
**Concepts:** #std_move #std_forward #conditional_cast

**Answer:**
`std::move` unconditionally casts to rvalue, while `std::forward` conditionally casts to rvalue only if the original argument was an rvalue.

**Code example:**
```cpp
template<typename T>
void wrapper(T&& arg) {
    func(std::move(arg));      // Always rvalue
    func(std::forward<T>(arg)); // Preserves original category
}

int x = 10;
wrapper(x);      // std::forward keeps as lvalue
wrapper(20);     // std::forward keeps as rvalue
```

**Explanation:**
`std::move` is for when you know you want to move regardless of the source. `std::forward` is for perfect forwarding in templates where you want to preserve the original value category (lvalue stays lvalue, rvalue stays rvalue). `std::forward` is conditional based on the template parameter, while `std::move` is unconditional.

**Key takeaway:** Use `std::move` for unconditional rvalue cast; use `std::forward` to preserve original value category.

---

#### Q18: Why do standard library types have both copy and move operations?
**Difficulty:** #intermediate
**Category:** #design_pattern #standard_library
**Concepts:** #move_semantics #copy_semantics #backward_compatibility

**Answer:**
Copy operations preserve both source and destination (needed for lvalues), while move operations optimize for temporaries (rvalues), providing both correctness and performance.

**Code example:**
```cpp
std::vector<int> v1 = {1, 2, 3};
std::vector<int> v2 = v1;           // Copy: v1 still usable
std::vector<int> v3 = std::move(v1); // Move: v1 is empty

void use_vector(std::vector<int> v);
use_vector(v2);           // Copy (v2 needed later)
use_vector(std::move(v3)); // Move (v3 not needed)
```

**Explanation:**
Different scenarios require different behaviors. When you need both the source and destination (lvalues), copying is essential. When the source is temporary (rvalue), moving is more efficient. By providing both, the standard library automatically selects the optimal operation based on value category through overload resolution, giving correctness and performance without manual intervention.

**Key takeaway:** Copy and move operations handle different scenarios—both are needed for complete, efficient resource management.

---

#### Q19: Can you move from an object multiple times?
**Difficulty:** #advanced
**Category:** #move_semantics #edge_cases
**Concepts:** #moved_from_state #multiple_moves #valid_but_unspecified

**Answer:**
Yes, you can move from an already-moved-from object, but the result is implementation-defined since the object is in an unspecified state.

**Code example:**
```cpp
std::string s1 = "hello";
std::string s2 = std::move(s1);  // First move: s1 likely empty
std::string s3 = std::move(s1);  // ✅ Legal: second move
// s3 likely empty, behavior depends on what s1's move constructor does
```

**Explanation:**
After moving, an object is valid but unspecified, meaning all operations are legal but state is undefined. Moving again is syntactically valid, but you're moving from an unknown state. For `std::string`, moving from an empty string likely gives another empty string. However, relying on this is poor practice—if you need to reuse an object after moving, explicitly assign a known value.

**Key takeaway:** Multiple moves are legal but unreliable—explicitly assign new values to moved-from objects before reuse.

---

#### Q20: How do move semantics interact with exception safety?
**Difficulty:** #advanced
**Category:** #exception_safety #move_semantics
**Concepts:** #noexcept #exception_safety #strong_guarantee

**Answer:**
Move operations should be `noexcept` to guarantee exception safety; throwing moves can violate strong exception guarantee in containers and algorithms.

**Code example:**
```cpp
class Data {
public:
    Data(Data&&);  // Can throw
    // Problem: std::vector uses copies to maintain strong guarantee
    
    Data(Data&&) noexcept;  // Cannot throw
    // std::vector can safely use moves
};

void risky() {
    std::vector<Data> v;
    v.resize(1000);  // Without noexcept: copies during reallocation
}
```

**Explanation:**
Strong exception guarantee promises that if an operation fails, the state is unchanged. With throwing move operations, this becomes impossible—partial moves followed by exceptions leave objects in inconsistent states. Standard containers check `noexcept` and only use moves if they're guaranteed not to throw, otherwise falling back to copies for safety.

**Key takeaway:** Mark move operations `noexcept` to enable optimizations and maintain exception safety guarantees.

---

#### Q21: What is copy elision and how does it relate to move semantics?
**Difficulty:** #intermediate
**Category:** #optimization #copy_elision
**Concepts:** #rvo #copy_elision #move_semantics

**Answer:**
Copy elision is a compiler optimization that eliminates copies/moves entirely by constructing objects directly in their final location, even more efficient than moving.

**Code example:**
```cpp
std::string create() {
    return std::string("hello");  // Copy elision: no copy, no move
}

std::string s = create();  // Constructed directly in s
// No copy constructor called, no move constructor called
```

**Explanation:**
Copy elision (including RVO) allows the compiler to skip copy/move constructors entirely, constructing the return value directly in the caller's space. C++17 guarantees this in many cases. Move semantics is a fallback when elision isn't possible—better than copying but not as fast as elision. Modern code relies on both: elision where possible, moves as fallback.

**Key takeaway:** Copy elision is better than moving; modern C++ uses both for optimal performance.

---

#### Q22: Why doesn't std::move work on arrays directly?
**Difficulty:** #advanced
**Category:** #arrays #move_semantics
**Concepts:** #array #std_move #element_wise_move

**Answer:**
Arrays decay to pointers, which are trivial types, so moving arrays requires element-wise moves using algorithms like `std::move` (the algorithm, not the cast).

**Code example:**
```cpp
std::string arr1[3] = {"one", "two", "three"};
// std::string arr2[3] = std::move(arr1);  // ❌ Cannot move array

std::string arr2[3];
std::move(std::begin(arr1), std::end(arr1), std::begin(arr2));  // ✅ OK
```

**Explanation:**
The array type itself doesn't have move operations—arrays aren't movable in C++. The `std::move` algorithm (different from `std::move` cast) applies the cast to each element, enabling element-wise moves. For containers and objects owning arrays, the containing object's move operations handle the transfer, but raw arrays need manual element-wise moves.

**Key takeaway:** Use `std::move` algorithm for element-wise moves; raw arrays don't have move operations.

---

#### Q23: How do you move data members in a move constructor?
**Difficulty:** #intermediate
**Category:** #implementation #move_semantics
**Concepts:** #move_constructor #member_initialization #std_move

**Answer:**
Use member initializer lists with `std::move` on each member that should be moved, as members aren't automatically moved even in move constructors.

**Code example:**
```cpp
class Composite {
    std::string name;
    std::vector<int> data;
    int* ptr;
public:
    Composite(Composite&& other) noexcept
        : name(std::move(other.name)),    // ✅ Explicitly move
          data(std::move(other.data)),    // ✅ Explicitly move
          ptr(other.ptr) {                // Just copy pointer
        other.ptr = nullptr;
    }
};
```

**Explanation:**
Even inside a move constructor, member variables are lvalues (they have names), so you must explicitly `std::move` them to invoke their move constructors. Without `std::move`, you'd call copy constructors instead. For pointers, direct copying followed by nullification is appropriate. Each member needs individual attention based on its type.

**Key takeaway:** Explicitly `std::move` each data member in move constructors—automatic moving doesn't happen.

---

#### Q24: What's the relationship between move semantics and smart pointers?
**Difficulty:** #intermediate
**Category:** #smart_pointers #move_semantics
**Concepts:** #unique_ptr #shared_ptr #move_only #ownership

**Answer:**
Smart pointers use move semantics to transfer ownership efficiently—`unique_ptr` is move-only to enforce exclusive ownership, while `shared_ptr` uses moves to avoid reference count overhead when possible.

**Code example:**
```cpp
std::unique_ptr<int> p1 = std::make_unique<int>(42);
// std::unique_ptr<int> p2 = p1;  // ❌ Copy deleted
std::unique_ptr<int> p2 = std::move(p1);  // ✅ Transfer ownership

std::shared_ptr<int> s1 = std::make_shared<int>(100);
std::shared_ptr<int> s2 = s1;           // Copy: increment refcount
std::shared_ptr<int> s3 = std::move(s1); // Move: no refcount change
```

**Explanation:**
`unique_ptr` embodies exclusive ownership through move-only semantics—you cannot copy it, only transfer ownership via move. `shared_ptr` allows copying but also provides move operations to avoid atomic reference count operations when transferring ownership. This makes smart pointers efficient and safe through judicious use of move semantics.

**Key takeaway:** Smart pointers leverage move semantics for efficient ownership transfer with strong type safety.

---

#### Q25: How does std::move affect primitive types?
**Difficulty:** #beginner
**Category:** #primitive_types #move_semantics
**Concepts:** #primitive_type #trivial_move #copy_vs_move

**Answer:**
For primitive types like `int`, `float`, `char`, etc., moving is identical to copying—there's no performance benefit since they don't manage resources.

**Code example:**
```cpp
int x = 42;
int y = std::move(x);  // Just copies the value

std::cout << x << "\n";  // Still 42 (unlike with std::string)
std::cout << y << "\n";  // Also 42

// Move constructor for int is same as copy
// No such thing as "moved-from int"
```

**Explanation:**
Primitive types are trivially copyable—they have no resources to manage, just bit patterns. Their move constructors are identical to copy constructors, performing simple memory copies. After moving a primitive, the source retains its value. Move semantics provides no benefit for primitives but causes no harm either.

**Key takeaway:** Moving primitives is identical to copying—move semantics only benefits resource-managing types.

---

### PRACTICE_TASKS: Move Semantics Analysis

#### Q1
```cpp
std::string s1 = "hello";
std::string s2 = std::move(s1);
std::cout << s1.length();
```

#### Q2
```cpp
class A {
    int* ptr;
public:
    A() : ptr(new int(42)) { }
    A(A&& other) noexcept : ptr(other.ptr) { }
    ~A() { delete ptr; }
};

A a1;
A a2 = std::move(a1);
```

#### Q3
```cpp
const std::vector<int> cv = {1, 2, 3};
std::vector<int> v = std::move(cv);
```

#### Q4
```cpp
int x = 10;
int y = std::move(x);
std::cout << x << " " << y;
```

#### Q5
```cpp
std::unique_ptr<int> p1 = std::make_unique<int>(42);
std::unique_ptr<int> p2 = p1;
```

#### Q6
```cpp
std::vector<int> getVector() {
    std::vector<int> v = {1, 2, 3};
    return std::move(v);
}
```

#### Q7
```cpp
std::string&& getRvalue() {
    std::string s = "temp";
    return std::move(s);
}

int main() {
    std::string result = getRvalue();
}
```

#### Q8
```cpp
void process(std::string s) { }

std::string str = "test";
process(std::move(str));
std::cout << str.length();
```

#### Q9
```cpp
std::vector<std::string> vec = {"a", "b", "c"};
std::string s = std::move(vec[1]);
std::cout << vec.size() << " " << vec[1].length();
```

#### Q10
```cpp
class Buffer {
    int* data;
public:
    Buffer& operator=(Buffer&& other) noexcept {
        delete[] data;
        data = other.data;
        other.data = nullptr;
        return *this;
    }
};

Buffer b(100);
b = std::move(b);
```

#### Q11
```cpp
std::string s1 = "hello";
std::string&& rref = std::move(s1);
std::cout << s1;
```

#### Q12
```cpp
struct Data {
    std::string name;
    Data(Data&& other) : name(other.name) { }
};

Data d1{"test"};
Data d2 = std::move(d1);
std::cout << d1.name;
```

#### Q13
```cpp
std::vector<int> v1 = {1, 2, 3};
std::vector<int> v2;
v2 = std::move(v1);
v1.push_back(4);
```

#### Q14
```cpp
void func(std::vector<int>&& v) {
    std::vector<int> local = v;
}
```

#### Q15
```cpp
std::string s1 = "hello";
std::string s2 = std::move(s1);
std::string s3 = std::move(s1);
```

#### Q16
```cpp
int x = 42;
int&& rref = std::move(x);
int y = std::move(rref);
std::cout << x;
```

#### Q17
```cpp
std::shared_ptr<int> p1 = std::make_shared<int>(42);
std::shared_ptr<int> p2 = std::move(p1);
if (p1) std::cout << "p1 valid";
else std::cout << "p1 null";
```

#### Q18
```cpp
std::vector<std::unique_ptr<int>> vec;
vec.push_back(std::make_unique<int>(10));
std::unique_ptr<int> p = vec[0];
```

#### Q19
```cpp
std::string create() {
    std::string s = "temp";
    return s;
}

std::string result = create();
```

#### Q20
```cpp
class A {
public:
    A(A&&) noexcept { std::cout << "move\n"; }
    A(const A&) { std::cout << "copy\n"; }
};

const A a1;
A a2 = std::move(a1);
```

---

### QUICK_REFERENCE: Answer Key and Move Semantics Tables

#### Answer Key for Practice Questions

| Q# | Answer | Explanation | Key Concept |
|----|--------|-------------|-------------|
| 1 | Output: 0 (likely) | String moved, `s1` in moved-from state (typically empty) | #moved_from_state |
| 2 | Undefined behavior | Move constructor doesn't nullify `other.ptr`, causing double-delete | #move_constructor_bug |
| 3 | Calls copy constructor | `const vector&&` cannot bind to move constructor expecting `vector&&` | #const_move_fails |
| 4 | Output: 10 10 | Moving primitive types is identical to copying—both retain value | #primitive_move |
| 5 | Compilation error | `unique_ptr` copy constructor is deleted—must use `std::move` | #move_only_type |
| 6 | Compiles but suboptimal | `std::move` in return prevents RVO, forcing move instead of elision | #rvo_pessimization |
| 7 | Undefined behavior | Returning reference to local variable—`s` destroyed when function exits | #dangling_reference |
| 8 | Output: 0 (likely) | String moved into function parameter, `str` is now in moved-from state | #move_to_parameter |
| 9 | Output: 3 0 | Element moved but not removed; `vec[1]` is empty string, size unchanged | #container_element_move |
| 10 | Undefined behavior | Self-move without check: deletes own data before attempting to use it | #self_move_bug |
| 11 | Output: hello | `std::move` alone doesn't modify—just casts; `s1` unchanged until used | #std_move_is_cast |
| 12 | Output: test (probably) | Move constructor uses copy for `name` member—should use `std::move(other.name)` | #member_move_bug |
| 13 | Compiles and runs | After move, `v1` is valid and can be reused; `push_back` works fine | #moved_from_reuse |
| 14 | Copies vector | `v` is lvalue inside function (has name), so copies to `local` | #named_rvalue_ref |
| 15 | Compiles, both likely empty | Second move from already-moved-from object is legal but gives empty | #multiple_moves |
| 16 | Output: 42 | Moving int is same as copying; both `x` and `y` have value 42 | #primitive_unchanged |
| 17 | Output: p1 null | `shared_ptr` move transfers ownership, leaving `p1` as nullptr | #shared_ptr_move |
| 18 | Compilation error | Cannot copy `unique_ptr`—must use `std::move(vec[0])` | #unique_ptr_no_copy |
| 19 | Compiles, efficient | RVO likely applies, constructing directly in `result` with no copies/moves | #rvo_optimization |
| 20 | Output: copy | `const A` cannot be moved (const prevents modification); copy constructor used | #const_no_move |

#### Move vs Copy Comparison

| Aspect | Copy | Move |
|--------|------|------|
| **Parameter Type** | `const T&` | `T&&` |
| **Source Modification** | Source unchanged | Source set to empty/null state |
| **Resource Handling** | Duplicates resources | Transfers ownership |
| **Performance** | Expensive for large types | Fast (constant time) |
| **Source After Operation** | Fully usable | Valid but unspecified state |
| **Use Case** | When source needed later | When source is temporary |
| **Exception Specification** | Can throw | Should be `noexcept` |

#### Move Semantics Implementation Checklist

| Component | Required? | Implementation Notes |
|-----------|-----------|---------------------|
| **Move Constructor** | If managing resources | Initialize from rvalue, nullify source |
| **Move Assignment** | If managing resources | Check self-assignment, cleanup old, steal new |
| **noexcept Specification** | Highly recommended | Required for container optimizations |
| **Null Checks in Destructor** | Yes | Handle moved-from state safely |
| **Member std::move** | Yes | Move each non-trivial member explicitly |
| **Self-Assignment Check** | Yes (move assignment) | Prevent destroying resources before using |
| **Default if Possible** | Preferred | Use `= default` if compiler version works |

#### When to Use std::move

| Scenario | Use std::move? | Explanation |
|----------|---------------|-------------|
| Passing to rvalue ref parameter | ✅ Yes | Enables move semantics |
| Returning local variable | ❌ No | Prevents RVO, hurts performance |
| Moving container elements | ✅ Yes | Explicitly move from container |
| Reusing moved-from object | ❌ No | Assign new value instead |
| Inside move constructor | ✅ Yes | Move each non-trivial member |
| With const objects | ❌ No | Falls back to copy anyway |
| Primitive types | ⚠️ Harmless | No effect (same as copy) |
| Unique ownership transfer | ✅ Yes | Move-only types require it |

#### Moved-From State Guarantees

| Type | Guaranteed State After Move | Safe Operations |
|------|---------------------------|----------------|
| **std::string** | Valid but unspecified (typically empty) | Assign, destroy, `clear()`, `empty()` |
| **std::vector** | Valid but unspecified (typically empty) | Assign, destroy, `clear()`, `size()` |
| **std::unique_ptr** | `nullptr` | Assign, destroy, boolean check, reset |
| **std::shared_ptr** | `nullptr` | Assign, destroy, boolean check, reset |
| **int, float, char** | Original value unchanged | All operations (move = copy) |
| **User-defined** | Implementation-defined | Assign, destroy, methods not depending on state |

#### Common Move Semantics Bugs

| Bug Pattern | Problem | Solution |
|------------|---------|----------|
| No nullification in move constructor | Double-delete on destruction | Set pointers to `nullptr` after stealing |
| Missing self-assignment check | Deleting own resources in self-move | Check `this != &other` |
| Copying members in move constructor | Performance loss | Use `std::move` on each member |
| Not marking moves `noexcept` | Container uses copies instead | Add `noexcept` specification |
| `return std::move(local)` | Prevents RVO optimization | Remove `std::move` from returns |
| Moving from const | Falls back to expensive copy | Remove `const` or accept copies |
| Returning reference to local | Dangling reference UB | Return by value instead |
| Assuming moved-from is empty | Relying on undefined state | Explicitly assign if reusing |
