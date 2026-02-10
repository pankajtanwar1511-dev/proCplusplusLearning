## TOPIC: Operator Overloading

---

### THEORY_SECTION: Core Concepts and Fundamentals

**Operator overloading** in C++ allows you to redefine the behavior of operators (like `+`, `-`, `[]`, `()`, etc.) for user-defined types. This enables objects to behave more naturally and intuitively, making code more readable and expressive. When you overload an operator, you're essentially creating a function with a special name that the compiler recognizes and calls when that operator is used with your class objects.

Operator overloading can be implemented in two primary ways: as **member functions** or as **non-member functions** (typically declared as `friend`). Member functions have implicit access to the left operand through the `this` pointer, while non-member functions treat both operands explicitly. The choice between these approaches depends on the operator's semantics and whether you need commutativity (e.g., allowing both `obj + 5` and `5 + obj`).

#### Why It Matters

Operator overloading is fundamental to creating intuitive class interfaces in C++. It enables you to work with custom types as naturally as built-in types, which is essential for mathematical classes (Complex numbers, Vectors), container classes (custom arrays, matrices), and smart pointers. Understanding operator overloading is critical for interviews because it tests your knowledge of C++ semantics, object lifetime, function overloading rules, and design decisions. It's also the foundation for understanding STL algorithms, functors, and modern C++ features like lambdas.

---

### EDGE_CASES: Tricky Scenarios and Gotchas

#### Edge Case 1: Non-Overloadable Operators

Not all operators can be overloaded in C++. The **scope resolution operator** (`::`), **member access operator** (`.`), **pointer-to-member operator** (`.*`), **ternary conditional** (`?:`), and **sizeof** operator cannot be overloaded because they require compile-time resolution or fixed semantics that the compiler must control.

```cpp
class Attempt {
    // ❌ Cannot overload these operators
    // void operator.();     // Compiler error
    // void operator::();    // Compiler error
    // void operator.*();    // Compiler error
    // void operator?:();    // Compiler error
};
```

The language designers deliberately restricted these operators to maintain predictable compile-time behavior and prevent breaking fundamental language semantics.

#### Edge Case 2: Short-Circuit Behavior Loss

Overloading logical operators `&&` and `||` causes them to lose their **short-circuit evaluation** behavior. When overloaded, they become regular function calls where all arguments are evaluated before the function executes.

```cpp
class Bool {
    bool value;
public:
    Bool(bool v) : value(v) {}
    
    // ❌ This loses short-circuit behavior
    Bool operator&&(const Bool& other) {
        return Bool(value && other.value);
    }
};

Bool expensive_computation() {
    std::cout << "Called!\n";
    return Bool(false);
}

int main() {
    Bool a(false);
    Bool b = a && expensive_computation();  // Still calls expensive_computation()!
}
```

For built-in types, `false && expensive()` would never call `expensive()`, but with overloaded operators, both operands are evaluated first.

#### Edge Case 3: Member vs Friend for Symmetry

When you need symmetric operations (like `Complex + int` and `int + Complex`), member functions fail because the left operand must be an object of the class.

```cpp
class Complex {
    double real, imag;
public:
    Complex(double r, double i) : real(r), imag(i) {}
    
    // ✅ Works for: complex + 5
    Complex operator+(int n) const {
        return Complex(real + n, imag);
    }
    
    // ❌ Cannot make this work as member for: 5 + complex
};

// ✅ Solution: Use friend function for symmetry
friend Complex operator+(int n, const Complex& c) {
    return Complex(c.real + n, c.imag);
}
```

Without the friend version, `5 + complex` would fail to compile because `int` doesn't have an `operator+` that takes `Complex`.

#### Edge Case 4: Return Type Confusion in Increment Operators

A common mistake is returning by reference in post-increment or returning by value in pre-increment, which breaks expected semantics.

```cpp
class Counter {
    int value;
public:
    Counter(int v) : value(v) {}
    
    // ✅ Pre-increment: return by reference for chaining
    Counter& operator++() {
        ++value;
        return *this;
    }
    
    // ❌ WRONG: returning reference to local variable
    Counter& operator++(int) {
        Counter temp = *this;
        ++value;
        return temp;  // Dangling reference!
    }
    
    // ✅ CORRECT: post-increment returns by value
    Counter operator++(int) {
        Counter temp = *this;
        ++value;
        return temp;
    }
};
```

Post-increment must return the old value by value, while pre-increment returns the modified object by reference.

#### Edge Case 5: Sized Deallocation in operator delete

In C++14 and later, `operator delete` can optionally receive the size of the deleted object, but this behavior is implementation-dependent.

```cpp
class A {
public:
    void operator delete(void* p, std::size_t size) {
        std::cout << "Deleting " << size << " bytes\n";
        ::operator delete(p);
    }
};

int main() {
    A* obj = new A;
    delete obj;  // May or may not call sized delete depending on compiler
}
```

For maximum portability, provide both the sized and unsized versions of `operator delete`.

#### Edge Case 6: Assignment Operator Cannot Be Friend

The assignment operator (`operator=`) **must** be a member function and cannot be overloaded as a non-member function.

```cpp
class X {
public:
    // ✅ CORRECT: Assignment as member
    X& operator=(const X& other) {
        if (this != &other) {
            // Copy logic
        }
        return *this;
    }
    
    // ❌ WRONG: Cannot overload as friend
    // friend X& operator=(X& lhs, const X& rhs);  // Compiler error!
};
```

This restriction ensures that assignment always has access to the left operand's private members and prevents ambiguity.

---

### CODE_EXAMPLES: Practical Demonstrations

#### Example 1: Basic Arithmetic Operator (Member Function)

```cpp
class Complex {
    double real, imag;
public:
    Complex(double r = 0, double i = 0) : real(r), imag(i) {}
    
    // Member function: left operand is implicit 'this'
    Complex operator+(const Complex& other) const {
        return Complex(real + other.real, imag + other.imag);
    }
    
    void display() const {
        std::cout << real << " + " << imag << "i\n";
    }
};

int main() {
    Complex c1(3, 4), c2(1, 2);
    Complex c3 = c1 + c2;  // Calls c1.operator+(c2)
    c3.display();  // Outputs: 4 + 6i
}
```

Member function approach works when the left operand is always an object of the class. The operator takes one parameter (the right operand) because `this` provides the left operand.

#### Example 2: Symmetric Operations with Friend Functions

```cpp
class Complex {
    double real, imag;
public:
    Complex(double r = 0, double i = 0) : real(r), imag(i) {}
    
    // ✅ Friend function enables: complex + int AND int + complex
    friend Complex operator+(const Complex& lhs, const Complex& rhs) {
        return Complex(lhs.real + rhs.real, lhs.imag + rhs.imag);
    }
    
    friend Complex operator+(const Complex& c, double val) {
        return Complex(c.real + val, c.imag);
    }
    
    friend Complex operator+(double val, const Complex& c) {
        return Complex(c.real + val, c.imag);
    }
};

int main() {
    Complex c(3, 4);
    Complex r1 = c + 5;    // ✅ Works
    Complex r2 = 5 + c;    // ✅ Also works (due to friend)
}
```

Friend functions provide symmetry for mixed-type operations. The constructor `Complex(double)` enables implicit conversion for seamless integration.

#### Example 3: Pre-increment vs Post-increment

```cpp
class Counter {
    int value;
public:
    Counter(int v = 0) : value(v) {}
    
    // ✅ Pre-increment: ++obj (efficient, returns reference)
    Counter& operator++() {
        ++value;
        return *this;  // Return modified object
    }
    
    // ✅ Post-increment: obj++ (less efficient, returns old value)
    Counter operator++(int) {  // 'int' is dummy parameter
        Counter temp = *this;  // Save old state
        ++value;               // Modify current object
        return temp;           // Return old state
    }
    
    int get() const { return value; }
};

int main() {
    Counter c(5);
    std::cout << (++c).get() << "\n";  // 6 (increments first)
    std::cout << (c++).get() << "\n";  // 6 (returns old value)
    std::cout << c.get() << "\n";      // 7 (now incremented)
}
```

Pre-increment is more efficient because it doesn't create a temporary copy. Post-increment requires the dummy `int` parameter to distinguish it from pre-increment.

#### Example 4: Subscript Operator for Custom Array

```cpp
class IntArray {
    int* data;
    size_t size;
public:
    IntArray(size_t sz) : size(sz), data(new int[sz]()) {}
    ~IntArray() { delete[] data; }
    
    // ✅ Non-const version: allows modification
    int& operator[](size_t index) {
        if (index >= size) throw std::out_of_range("Index out of bounds");
        return data[index];
    }
    
    // ✅ Const version: for read-only access
    const int& operator[](size_t index) const {
        if (index >= size) throw std::out_of_range("Index out of bounds");
        return data[index];
    }
};

int main() {
    IntArray arr(5);
    arr[0] = 10;           // Uses non-const operator[]
    std::cout << arr[0];   // Can read the value
    
    const IntArray carr(3);
    // carr[0] = 20;       // ❌ Error: calls const version
    std::cout << carr[0];  // ✅ OK: reading is allowed
}
```

Providing both const and non-const versions of `operator[]` enables proper const-correctness and allows modification when appropriate.

#### Example 5: Function Call Operator (Functors)

```cpp
class Multiplier {
    int factor;
public:
    Multiplier(int f) : factor(f) {}
    
    // ✅ Makes objects callable like functions
    int operator()(int x) const {
        return x * factor;
    }
};

class Logger {
    std::string prefix;
public:
    Logger(const std::string& p) : prefix(p) {}
    
    // ✅ Can have multiple parameters
    void operator()(const std::string& message) const {
        std::cout << prefix << ": " << message << "\n";
    }
};

int main() {
    Multiplier times3(3);
    std::cout << times3(10) << "\n";  // 30
    
    Logger log("INFO");
    log("System started");  // INFO: System started
    
    // ✅ Use with STL algorithms
    std::vector<int> nums = {1, 2, 3, 4, 5};
    std::transform(nums.begin(), nums.end(), nums.begin(), Multiplier(2));
    // nums is now {2, 4, 6, 8, 10}
}
```

Functors are objects that can be called like functions. They're powerful because they can maintain state (unlike function pointers) and are often more efficient than `std::function` due to inlining.

#### Example 6: Stream Insertion and Extraction Operators

```cpp
class Point {
    int x, y;
public:
    Point(int x = 0, int y = 0) : x(x), y(y) {}
    
    // ✅ Output operator (must be friend or non-member)
    friend std::ostream& operator<<(std::ostream& os, const Point& p) {
        os << "(" << p.x << ", " << p.y << ")";
        return os;  // Return stream for chaining
    }
    
    // ✅ Input operator
    friend std::istream& operator>>(std::istream& is, Point& p) {
        is >> p.x >> p.y;
        return is;
    }
};

int main() {
    Point p1(3, 4);
    std::cout << "Point: " << p1 << "\n";  // Point: (3, 4)
    
    Point p2;
    std::cout << "Enter x and y: ";
    std::cin >> p2;  // Can chain: cin >> p2 >> p3;
    std::cout << "You entered: " << p2 << "\n";
}
```

Stream operators must return references to the stream to enable chaining. They're typically implemented as friend functions because the stream is the left operand.

#### Example 7: Custom new and delete Operators

```cpp
class Tracked {
    static int allocation_count;
    int id;
public:
    Tracked() : id(++allocation_count) {
        std::cout << "Object " << id << " constructed\n";
    }
    
    ~Tracked() {
        std::cout << "Object " << id << " destroyed\n";
    }
    
    // ✅ Custom allocation tracking
    void* operator new(std::size_t size) {
        std::cout << "Allocating " << size << " bytes\n";
        void* ptr = ::operator new(size);  // Call global new
        return ptr;
    }
    
    void operator delete(void* ptr) noexcept {
        std::cout << "Deallocating memory\n";
        ::operator delete(ptr);  // Call global delete
    }
    
    // ✅ Array versions
    void* operator new[](std::size_t size) {
        std::cout << "Allocating array: " << size << " bytes\n";
        return ::operator new[](size);
    }
    
    void operator delete[](void* ptr) noexcept {
        std::cout << "Deallocating array\n";
        ::operator delete[](ptr);
    }
};

int Tracked::allocation_count = 0;

int main() {
    Tracked* obj = new Tracked;     // Custom new + constructor
    delete obj;                     // Destructor + custom delete
    
    Tracked* arr = new Tracked[3];  // Custom new[] + constructors
    delete[] arr;                   // Destructors + custom delete[]
}
```

Custom `new` and `delete` operators execute **before** constructors and **after** destructors. The `new` operator allocates raw memory, then the constructor initializes it.

#### Example 8: Comparison Operators with Spaceship Operator (C++20)

```cpp
class Version {
    int major, minor, patch;
public:
    Version(int maj, int min, int pat) : major(maj), minor(min), patch(pat) {}
    
    // ✅ C++20: Single operator generates all six comparison operators
    auto operator<=>(const Version& other) const = default;
    
    // Still need == for exact equality check
    bool operator==(const Version& other) const = default;
};

// Pre-C++20 approach (more verbose)
class VersionOld {
    int major, minor, patch;
public:
    VersionOld(int maj, int min, int pat) : major(maj), minor(min), patch(pat) {}
    
    bool operator<(const VersionOld& other) const {
        if (major != other.major) return major < other.major;
        if (minor != other.minor) return minor < other.minor;
        return patch < other.patch;
    }
    
    bool operator==(const VersionOld& other) const {
        return major == other.major && minor == other.minor && patch == other.patch;
    }
    
    // Need to define: !=, >, <=, >= (can use above definitions)
    bool operator!=(const VersionOld& other) const { return !(*this == other); }
    bool operator>(const VersionOld& other) const { return other < *this; }
    bool operator<=(const VersionOld& other) const { return !(other < *this); }
    bool operator>=(const VersionOld& other) const { return !(*this < other); }
};

int main() {
    Version v1(1, 2, 3), v2(1, 3, 0);
    if (v1 < v2) {  // ✅ All comparison operators work
        std::cout << "v1 is older\n";
    }
}
```

The spaceship operator (`<=>`) in C++20 simplifies comparison operator implementation by automatically generating all six comparison operators from a single definition.

---

#### Example 9: Autonomous Vehicle - Complete VehiclePosition Class with Operator Overloading

```cpp
#include <iostream>
#include <cmath>
#include <iomanip>

// 2D position for autonomous vehicle localization
class VehiclePosition {
    double x_;      // meters (East)
    double y_;      // meters (North)
    double theta_;  // heading (radians)
    unsigned long timestamp_ms_;

public:
    // Constructors
    VehiclePosition(double x = 0, double y = 0, double theta = 0, unsigned long ts = 0)
        : x_(x), y_(y), theta_(theta), timestamp_ms_(ts) {}

    // ========== Arithmetic Operators ==========

    // Addition: combine position offsets (member function)
    VehiclePosition operator+(const VehiclePosition& other) const {
        return VehiclePosition(x_ + other.x_, y_ + other.y_,
                              theta_ + other.theta_, timestamp_ms_);
    }

    // Subtraction: compute relative position
    VehiclePosition operator-(const VehiclePosition& other) const {
        return VehiclePosition(x_ - other.x_, y_ - other.y_,
                              theta_ - other.theta_, timestamp_ms_);
    }

    // Scalar multiplication (member): scale position
    VehiclePosition operator*(double scale) const {
        return VehiclePosition(x_ * scale, y_ * scale,
                              theta_, timestamp_ms_);
    }

    // Symmetric scalar multiplication (friend): enable 2.0 * position
    friend VehiclePosition operator*(double scale, const VehiclePosition& pos) {
        return pos * scale;  // Delegate to member version
    }

    // ========== Compound Assignment Operators ==========

    // Move position incrementally (+=)
    VehiclePosition& operator+=(const VehiclePosition& delta) {
        x_ += delta.x_;
        y_ += delta.y_;
        theta_ += delta.theta_;
        return *this;  // Enable chaining
    }

    // Scale in place (*=)
    VehiclePosition& operator*=(double scale) {
        x_ *= scale;
        y_ *= scale;
        return *this;
    }

    // ========== Comparison Operators ==========

    // Equality: within tolerance for floating-point comparison
    bool operator==(const VehiclePosition& other) const {
        const double EPSILON = 1e-6;
        return std::abs(x_ - other.x_) < EPSILON &&
               std::abs(y_ - other.y_) < EPSILON &&
               std::abs(theta_ - other.theta_) < EPSILON;
    }

    bool operator!=(const VehiclePosition& other) const {
        return !(*this == other);
    }

    // Distance-based comparison (< means closer to origin)
    bool operator<(const VehiclePosition& other) const {
        return getDistanceToOrigin() < other.getDistanceToOrigin();
    }

    bool operator>(const VehiclePosition& other) const {
        return other < *this;
    }

    // ========== Unary Operators ==========

    // Unary minus: reflect position across origin
    VehiclePosition operator-() const {
        return VehiclePosition(-x_, -y_, -theta_, timestamp_ms_);
    }

    // Unary plus: normalize theta to [0, 2π)
    VehiclePosition operator+() const {
        double normalized_theta = std::fmod(theta_, 2 * M_PI);
        if (normalized_theta < 0) normalized_theta += 2 * M_PI;
        return VehiclePosition(x_, y_, normalized_theta, timestamp_ms_);
    }

    // ========== Increment/Decrement Operators ==========

    // Pre-increment: advance 1 meter in heading direction
    VehiclePosition& operator++() {
        x_ += std::cos(theta_);
        y_ += std::sin(theta_);
        return *this;
    }

    // Post-increment: return old position before advancing
    VehiclePosition operator++(int) {
        VehiclePosition old = *this;
        ++(*this);  // Use pre-increment
        return old;  // Return copy of old state
    }

    // ========== Subscript Operator ==========

    // Non-const version: allows modification
    double& operator[](int index) {
        switch (index) {
            case 0: return x_;
            case 1: return y_;
            case 2: return theta_;
            default: throw std::out_of_range("Index must be 0 (x), 1 (y), or 2 (theta)");
        }
    }

    // Const version: read-only access
    const double& operator[](int index) const {
        return const_cast<VehiclePosition*>(this)->operator[](index);
    }

    // ========== Function Call Operator (Functor) ==========

    // Functor: compute distance to another position
    double operator()(const VehiclePosition& other) const {
        double dx = x_ - other.x_;
        double dy = y_ - other.y_;
        return std::sqrt(dx * dx + dy * dy);
    }

    // ========== Type Conversion Operator ==========

    // Explicit conversion to bool: is vehicle away from origin?
    explicit operator bool() const {
        const double EPSILON = 1e-6;
        return std::abs(x_) > EPSILON || std::abs(y_) > EPSILON;
    }

    // ========== Stream Operators (Friend Functions) ==========

    // Output operator: pretty print position
    friend std::ostream& operator<<(std::ostream& os, const VehiclePosition& pos) {
        os << std::fixed << std::setprecision(2)
           << "Position(x=" << pos.x_
           << "m, y=" << pos.y_
           << "m, θ=" << (pos.theta_ * 180.0 / M_PI) << "°"
           << ", t=" << pos.timestamp_ms_ << "ms)";
        return os;
    }

    // Input operator: read position from stream
    friend std::istream& operator>>(std::istream& is, VehiclePosition& pos) {
        is >> pos.x_ >> pos.y_ >> pos.theta_;
        return is;
    }

    // ========== Helper Methods ==========

    double getDistanceToOrigin() const {
        return std::sqrt(x_ * x_ + y_ * y_);
    }

    double getX() const { return x_; }
    double getY() const { return y_; }
    double getTheta() const { return theta_; }
};

// Demonstration of all overloaded operators
int main() {
    VehiclePosition start(0, 0, M_PI/4, 1000);  // 45° heading
    VehiclePosition goal(10, 10, M_PI/2, 2000);  // 90° heading

    std::cout << "=== Initial Positions ===\n";
    std::cout << "Start: " << start << "\n";
    std::cout << "Goal:  " << goal << "\n\n";

    // ========== Arithmetic Operators ==========
    std::cout << "=== Arithmetic Operators ===\n";
    VehiclePosition mid = start + goal;
    std::cout << "start + goal = " << mid << "\n";

    VehiclePosition delta = goal - start;
    std::cout << "goal - start = " << delta << "\n";

    VehiclePosition scaled = start * 2.0;
    std::cout << "start * 2.0 = " << scaled << "\n";

    VehiclePosition scaled2 = 0.5 * goal;
    std::cout << "0.5 * goal = " << scaled2 << "\n\n";

    // ========== Compound Assignment ==========
    std::cout << "=== Compound Assignment ===\n";
    VehiclePosition current = start;
    current += VehiclePosition(1, 1, 0.1);
    std::cout << "After += : " << current << "\n";

    current *= 1.5;
    std::cout << "After *= 1.5: " << current << "\n\n";

    // ========== Comparison Operators ==========
    std::cout << "=== Comparison Operators ===\n";
    std::cout << "start == goal? " << (start == goal ? "yes" : "no") << "\n";
    std::cout << "start != goal? " << (start != goal ? "yes" : "no") << "\n";
    std::cout << "start < goal? " << (start < goal ? "yes" : "no")
              << " (based on distance to origin)\n\n";

    // ========== Unary Operators ==========
    std::cout << "=== Unary Operators ===\n";
    VehiclePosition reflected = -start;
    std::cout << "-start (reflected): " << reflected << "\n";

    VehiclePosition pos_with_large_theta(5, 5, 10 * M_PI);  // Large angle
    VehiclePosition normalized = +pos_with_large_theta;
    std::cout << "Normalized theta: " << normalized << "\n\n";

    // ========== Increment Operators ==========
    std::cout << "=== Increment Operators ===\n";
    VehiclePosition pos(0, 0, 0);
    std::cout << "Initial: " << pos << "\n";
    std::cout << "++pos:   " << ++pos << "\n";  // Pre: advance then return
    std::cout << "pos++:   " << pos++ << "\n";  // Post: return then advance
    std::cout << "After:   " << pos << "\n\n";

    // ========== Subscript Operator ==========
    std::cout << "=== Subscript Operator ===\n";
    VehiclePosition mutable_pos(5, 10, M_PI/3);
    std::cout << "pos[0] (x) = " << mutable_pos[0] << "\n";
    std::cout << "pos[1] (y) = " << mutable_pos[1] << "\n";
    mutable_pos[0] = 7.5;  // Modify x
    std::cout << "After pos[0] = 7.5: " << mutable_pos << "\n\n";

    // ========== Function Call Operator ==========
    std::cout << "=== Function Call Operator ===\n";
    double distance = start(goal);  // Use as functor
    std::cout << "Distance from start to goal: " << distance << "m\n\n";

    // ========== Conversion Operator ==========
    std::cout << "=== Conversion Operator (explicit bool) ===\n";
    VehiclePosition origin(0, 0, 0);
    VehiclePosition non_origin(1, 1, 0);

    if (non_origin) {
        std::cout << "non_origin is away from origin\n";
    }
    if (!origin) {
        std::cout << "origin is at (0,0)\n";
    }
    // bool b = origin;  // ❌ Error: explicit prevents implicit conversion
    bool b = static_cast<bool>(origin);  // ✅ Explicit cast required
    std::cout << "origin as bool (explicit cast): " << b << "\n\n";

    // ========== Practical Usage Example ==========
    std::cout << "=== Practical: Trajectory Following ===\n";
    VehiclePosition vehicle(0, 0, M_PI/4, 0);
    VehiclePosition waypoints[] = {
        VehiclePosition(5, 5, 0),
        VehiclePosition(10, 10, 0),
        VehiclePosition(15, 10, 0)
    };

    for (int i = 0; i < 3; ++i) {
        double dist = vehicle(waypoints[i]);  // Functor usage
        std::cout << "Distance to waypoint " << i << ": "
                  << std::fixed << std::setprecision(2) << dist << "m\n";

        // Move 50% toward waypoint using overloaded operators
        VehiclePosition direction = waypoints[i] - vehicle;
        vehicle += direction * 0.5;
        std::cout << "  Moved to: " << vehicle << "\n";
    }

    return 0;
}
```

**Key Operator Overloading Concepts Demonstrated:**

1. **Arithmetic Operators** (`+`, `-`, `*`): Enable natural position arithmetic for path planning calculations.

2. **Symmetric Operations**: Friend function `operator*(double, Position)` enables both `pos * 2.0` and `2.0 * pos`.

3. **Compound Assignment** (`+=`, `*=`): Modify the object in place and return `*this` by reference for chaining.

4. **Comparison Operators** (`==`, `!=`, `<`, `>`): With proper floating-point tolerance and domain-specific logic (distance-based).

5. **Unary Operators** (`-`, `+`): `-` for negation and `+` for normalization provide useful transformations.

6. **Increment/Decrement**: Pre-increment moves vehicle and returns reference; post-increment returns old position by value.

7. **Subscript Operator** (`[]`): Both const and non-const versions enable `pos[0]` access to x, y, theta components.

8. **Function Call Operator** (`()`): Makes position object callable as distance calculator—functor pattern.

9. **Explicit Type Conversion**: `explicit operator bool()` prevents accidental conversions while allowing contextual boolean usage.

10. **Stream Operators** (`<<`, `>>`): Friend functions enable `cout << position` and `cin >> position` for I/O.

**Real-World Relevance**:

In autonomous vehicle systems:
- **Localization** represents vehicle pose as (x, y, θ) updated at 50-100Hz
- **Position arithmetic** computes relative positions, trajectory offsets, and waypoint deltas
- **Comparison operators** enable priority queues for path planning (A* algorithm)
- **Functor usage** provides distance calculations for nearest-waypoint searches
- **Stream operators** simplify logging and debugging of vehicle positions
- **Subscript operator** allows algorithms to generically access position components
- **Performance**: Operator overloading incurs zero runtime overhead (inlined by compiler) while providing natural, readable syntax

This comprehensive example shows how operator overloading transforms a mathematical type into an intuitive, natural interface that matches the problem domain—essential for complex autonomous driving algorithms like SLAM, path planning, and trajectory optimization.

---

### INTERVIEW_QA: Comprehensive Questions

#### Q1: Which operators in C++ cannot be overloaded and why?
**Difficulty:** #beginner
**Category:** #syntax #language_rules
**Concepts:** #operator_overloading #compile_time #language_design

**Answer:**
The operators `::` (scope resolution), `.` (member access), `.*` (pointer-to-member), `?:` (ternary conditional), `sizeof`, `typeid`, `alignof`, and casting operators like `static_cast` cannot be overloaded.

**Explanation:**
These operators require compile-time resolution or have semantics so fundamental to the language that allowing overloading would break type safety or introduce ambiguities. For example, the `.` operator must have fixed compile-time offset calculations for member access, and the `::` operator needs to resolve scopes at compile time before any runtime behavior occurs.

**Key takeaway:** Language designers restrict operator overloading for operators that require compile-time semantics or would break fundamental language guarantees if customized.

---

#### Q2: What is the difference between member function and friend function operator overloading?
**Difficulty:** #beginner
**Category:** #design_pattern #syntax
**Concepts:** #member_function #friend_function #operator_overloading #implicit_conversion

**Answer:**
Member function overloading uses the left operand as the implicit `this` pointer and takes one fewer parameter for binary operators. Friend function overloading treats both operands explicitly and is necessary when the left operand is not an object of the class or when commutativity is needed.

**Code example:**
```cpp
class Complex {
    double real;
public:
    // Member: left operand must be Complex
    Complex operator+(const Complex& rhs) const { /*...*/ }
    
    // Friend: enables int + Complex
    friend Complex operator+(double lhs, const Complex& rhs) { /*...*/ }
};
```

**Explanation:**
Member functions cannot support operations like `5 + complex` because the left operand (5) isn't a Complex object. Friend functions enable symmetric operations by treating both operands explicitly, allowing implicit conversion on either operand.

**Key takeaway:** Use member functions when the left operand is always your class; use friend functions for symmetric operations or when the left operand is a built-in type.

---

#### Q3: Why does post-increment return by value while pre-increment returns by reference?
**Difficulty:** #intermediate
**Category:** #memory #performance #design_pattern
**Concepts:** #increment_operators #return_types #object_lifetime #copy_semantics

**Answer:**
Post-increment must return the original value before incrementing, which requires creating and returning a copy. Pre-increment modifies and returns the same object, so it can safely return by reference for efficiency.

**Code example:**
```cpp
class Counter {
    int val;
public:
    Counter& operator++() {      // Pre: return reference
        ++val; 
        return *this;
    }
    
    Counter operator++(int) {     // Post: return copy
        Counter temp = *this;
        ++val;
        return temp;              // ❌ Can't return reference to temp
    }
};
```

**Explanation:**
Returning a reference to the temporary `temp` in post-increment would create a dangling reference since `temp` is destroyed when the function exits. Post-increment semantics require preserving the old value, necessitating a copy. Pre-increment can return `*this` by reference because the object persists after the function call.

**Key takeaway:** Post-increment is less efficient than pre-increment because it requires creating a temporary copy; prefer `++it` over `it++` for iterators and complex types.

---

#### Q4: Can you overload the assignment operator as a friend function?
**Difficulty:** #beginner
**Category:** #language_rules #syntax
**Concepts:** #assignment_operator #friend_function #member_function #language_restriction

**Answer:**
No, the assignment operator must be overloaded as a member function. It cannot be a friend or non-member function.

**Explanation:**
The C++ standard mandates that `operator=`, `operator[]`, `operator()`, and `operator->` must be non-static member functions. This ensures that the left operand is always an object of the class and prevents potential ambiguities in overload resolution. Assignment semantics require direct access to the object being assigned to.

**Key takeaway:** Assignment, subscript, function call, and arrow operators must always be member functions—this is a language rule, not a design choice.

---

#### Q5: What happens to short-circuit evaluation when you overload && or || operators?
**Difficulty:** #intermediate
**Category:** #gotcha #performance
**Concepts:** #logical_operators #short_circuit #function_call #operator_overloading #evaluation_order

**Answer:**
Overloaded `&&` and `||` operators lose short-circuit evaluation because they become regular function calls, and all function arguments must be evaluated before the function executes.

**Code example:**
```cpp
class Bool {
    bool val;
public:
    Bool operator&&(const Bool& other) {
        return Bool(val && other.val);  // other is always evaluated
    }
};

Bool expensive() { 
    std::cout << "Evaluated!\n"; 
    return Bool(false); 
}

Bool a(false);
a && expensive();  // ❌ Still prints "Evaluated!" even though a is false
```

**Explanation:**
With built-in types, `false && anything` never evaluates `anything`. But when `&&` is overloaded, the compiler must evaluate both operands to pass them as function arguments, destroying the performance benefit of short-circuiting.

**Key takeaway:** Avoid overloading `&&` and `||` operators because it breaks expected short-circuit behavior and can harm performance.

---

#### Q6: What is the dummy int parameter in post-increment operator overloading?
**Difficulty:** #beginner
**Category:** #syntax #interview_favorite
**Concepts:** #increment_operators #function_signature #overload_resolution #dummy_parameter

**Answer:**
The dummy `int` parameter distinguishes post-increment (`obj++`) from pre-increment (`++obj`) overloads. It's not used in the function body; it exists solely for the compiler to differentiate the two signatures.

**Code example:**
```cpp
class Counter {
public:
    Counter& operator++() {           // Pre-increment: no parameters
        // increment logic
        return *this;
    }
    
    Counter operator++(int) {         // Post-increment: int is dummy
        Counter temp = *this;
        ++(*this);
        return temp;
    }
};
```

**Explanation:**
Without the dummy parameter, both pre and post increment would have the same signature `operator++()`, creating ambiguity. The `int` parameter is never given a name because it's never used—it's purely a syntactic device for overload resolution.

**Key takeaway:** The dummy `int` parameter in post-increment is a compile-time signal for overload resolution; the actual value passed (typically 0) is irrelevant.

---

#### Q7: Why must operator new return void* instead of a pointer to the class type?
**Difficulty:** #intermediate
**Category:** #memory #language_rules
**Concepts:** #operator_new #memory_allocation #raw_memory #object_construction #void_pointer

**Answer:**
`operator new` allocates raw, uninitialized memory before the object is constructed, so there is no object to point to yet. It returns `void*` to represent raw memory that will later be initialized by the constructor.

**Explanation:**
When you write `MyClass* obj = new MyClass();`, the process is: (1) `operator new` allocates raw memory, (2) the constructor runs on that memory to create the object. Since `operator new` executes before construction, the memory doesn't contain a valid `MyClass` object yet, so returning `MyClass*` would be semantically incorrect.

**Key takeaway:** `operator new` deals with raw memory allocation, separate from object construction; `void*` correctly represents uninitialized memory.

---

#### Q8: Can you chain operations with overloaded operators? What must you return to enable this?
**Difficulty:** #intermediate
**Category:** #design_pattern #best_practice
**Concepts:** #operator_chaining #return_types #fluent_interface #reference_return

**Answer:**
Yes, you can chain operations by returning a reference to the object. For example, `operator=` should return `*this` by reference to enable `a = b = c`.

**Code example:**
```cpp
class String {
public:
    String& operator=(const String& other) {
        if (this != &other) {
            // assignment logic
        }
        return *this;  // ✅ Enables: s1 = s2 = s3
    }
    
    String& operator+=(const String& other) {
        // concatenation logic
        return *this;  // ✅ Enables: s1 += s2 += s3
    }
};
```

**Explanation:**
Chaining works right-to-left: `a = b = c` evaluates as `a = (b = c)`. The inner assignment `b = c` must return a reference to `b` so the outer assignment can use it. Returning by reference avoids unnecessary copies and enables natural expression syntax.

**Key takeaway:** Compound assignment and modification operators should return `*this` by reference to support chaining and match built-in type behavior.

---

#### Q9: What is a functor and how does it differ from a lambda?
**Difficulty:** #intermediate
**Category:** #design_pattern #interview_favorite
**Concepts:** #functor #lambda #operator_call #callable #stl #closure

**Answer:**
A functor is a class with an overloaded `operator()`, making objects callable like functions. Lambdas are syntactic sugar that the compiler implements as unnamed functor classes.

**Code example:**
```cpp
// Functor
class Multiplier {
    int factor;
public:
    Multiplier(int f) : factor(f) {}
    int operator()(int x) const { return x * factor; }
};

// Lambda (compiler generates similar functor internally)
auto mult = [factor = 5](int x) { return x * factor; };

// Both work with STL
std::vector<int> v = {1, 2, 3};
std::transform(v.begin(), v.end(), v.begin(), Multiplier(5));
std::transform(v.begin(), v.end(), v.begin(), mult);
```

**Explanation:**
Functors provide explicit, reusable classes with state. Lambdas provide convenient inline syntax but generate anonymous classes under the hood. Functors can have multiple `operator()` overloads and custom constructors, while lambdas are more concise for simple cases.

**Key takeaway:** Functors and lambdas are interchangeable in most STL contexts; choose functors for complex, reusable logic and lambdas for simple, one-off operations.

---

#### Q10: How do you provide both const and non-const versions of operator[]?
**Difficulty:** #intermediate
**Category:** #best_practice #const_correctness
**Concepts:** #subscript_operator #const_overload #reference_return #const_correctness

**Answer:**
Provide two overloads: one returning a reference for modification, and a const version returning a const reference for read-only access.

**Code example:**
```cpp
class Array {
    int* data;
public:
    // Non-const: allows modification
    int& operator[](size_t idx) {
        return data[idx];
    }
    
    // Const: for const objects, read-only
    const int& operator[](size_t idx) const {
        return data[idx];
    }
};

void test(const Array& arr) {
    int x = arr[0];  // ✅ Calls const version
    // arr[0] = 5;   // ❌ Error: can't modify through const reference
}
```

**Explanation:**
The non-const version allows `arr[i] = value` syntax for modification. The const version is called when the object is const-qualified, preventing modification. Both return references to avoid unnecessary copying of array elements.

**Key takeaway:** Always provide both const and non-const versions of `operator[]` to maintain const-correctness and enable both read and write operations appropriately.

---

#### Q11: What is the execution order of operator new, constructor, destructor, and operator delete?
**Difficulty:** #intermediate
**Category:** #memory #object_lifetime
**Concepts:** #operator_new #operator_delete #constructor #destructor #object_lifecycle #memory_management

**Answer:**
The order is: (1) `operator new` allocates memory, (2) constructor initializes the object, (3) destructor cleans up the object, (4) `operator delete` deallocates memory.

**Code example:**
```cpp
class Tracked {
public:
    Tracked() { std::cout << "2. Constructor\n"; }
    ~Tracked() { std::cout << "3. Destructor\n"; }
    
    void* operator new(size_t sz) {
        std::cout << "1. operator new\n";
        return ::operator new(sz);
    }
    
    void operator delete(void* p) {
        std::cout << "4. operator delete\n";
        ::operator delete(p);
    }
};

Tracked* obj = new Tracked;  // Prints 1, then 2
delete obj;                  // Prints 3, then 4
```

**Explanation:**
The `new` expression first allocates raw memory via `operator new`, then constructs the object in that memory. The `delete` expression first destructs the object to clean up resources, then deallocates the memory via `operator delete`. This separation allows custom memory management without interfering with object lifetime.

**Key takeaway:** Memory allocation/deallocation (`operator new/delete`) and object lifetime (constructor/destructor) are separate phases that execute in a specific order.

---

#### Q12: Why is pre-increment generally more efficient than post-increment?
**Difficulty:** #beginner
**Category:** #performance #best_practice
**Concepts:** #increment_operators #temporary_objects #copy_semantics #optimization

**Answer:**
Pre-increment (`++i`) is more efficient because it modifies the object in place and returns a reference. Post-increment (`i++`) must create a temporary copy of the original value before incrementing.

**Code example:**
```cpp
// Pre-increment: efficient
Iterator& operator++() {
    advance();
    return *this;  // ✅ No copy
}

// Post-increment: less efficient
Iterator operator++(int) {
    Iterator temp = *this;  // ❌ Copy created
    advance();
    return temp;  // ❌ Another copy on return
}
```

**Explanation:**
For simple types like `int`, the compiler optimizes away the difference. But for complex types like STL iterators or user-defined classes, post-increment incurs copy overhead. This is why experienced C++ developers prefer `++it` over `it++` in loops.

**Key takeaway:** Always prefer pre-increment (`++i`) over post-increment (`i++`) unless you specifically need the old value, especially for iterators and complex types.

---

#### Q13: Can operator overloading change the precedence or associativity of operators?
**Difficulty:** #beginner
**Category:** #language_rules #gotcha
**Concepts:** #operator_precedence #associativity #operator_overloading #expression_evaluation

**Answer:**
No, operator overloading cannot change precedence, associativity, or the number of operands. These properties are fixed by the language.

**Explanation:**
When you overload an operator, you only change its behavior, not its grammatical properties. For example, `*` always has higher precedence than `+`, regardless of overloading. Similarly, `=` remains right-associative even for custom types. Attempting to change these properties would break fundamental language rules and create unpredictable expression evaluation.

**Key takeaway:** Operator overloading changes behavior, not grammar; precedence, associativity, and arity are immutable language properties.

---

#### Q14: What happens if you overload operator new but not operator delete?
**Difficulty:** #intermediate
**Category:** #memory #gotcha #undefined_behavior
**Concepts:** #operator_new #operator_delete #memory_leak #undefined_behavior #matching_functions

**Answer:**
The program will likely have undefined behavior because memory allocated by your custom `operator new` may not be compatible with the default `operator delete`.

**Code example:**
```cpp
class Bad {
public:
    void* operator new(size_t sz) {
        return malloc(sz);  // Custom allocation
    }
    // ❌ Missing matching operator delete
};

Bad* obj = new Bad;
delete obj;  // ❌ UB: default delete doesn't match custom new
```

**Explanation:**
If your custom `operator new` uses a special allocator (like a memory pool), the default `operator delete` won't know how to properly deallocate that memory. This can cause crashes, corruption, or leaks. Always provide matching pairs of `new/delete` and `new[]/delete[]`.

**Key takeaway:** Always provide matching `operator delete` when you overload `operator new`; mismatched allocation and deallocation lead to undefined behavior.

---

#### Q15: How do you implement operator<< for your class to work with std::cout?
**Difficulty:** #beginner
**Category:** #syntax #interview_favorite
**Concepts:** #stream_operators #friend_function #operator_overloading #io_streams #chaining

**Answer:**
Implement `operator<<` as a friend or non-member function that takes `std::ostream&` as the first parameter and returns it by reference to enable chaining.

**Code example:**
```cpp
class Point {
    int x, y;
public:
    Point(int x, int y) : x(x), y(y) {}
    
    friend std::ostream& operator<<(std::ostream& os, const Point& p) {
        os << "(" << p.x << ", " << p.y << ")";
        return os;  // ✅ Enable chaining
    }
};

Point p(3, 4);
std::cout << "Point: " << p << "\n";  // Works due to chaining
```

**Explanation:**
The stream must be the left operand, so this cannot be a member function (which would make the object the left operand). Returning the stream by reference allows chaining multiple `<<` operations. The function is typically declared as `friend` to access private members.

**Key takeaway:** Stream insertion operators must be non-member functions that return the stream by reference to support chaining like `cout << a << b << c`.

---

#### Q16: What is placement new and can you overload it?
**Difficulty:** #advanced
**Category:** #memory #advanced_technique
**Concepts:** #placement_new #memory_management #constructor #operator_new #custom_allocator

**Answer:**
Placement new constructs an object at a specific memory address without allocating new memory. The standard placement new is `void* operator new(size_t, void*)`, and you can overload it with additional parameters.

**Code example:**
```cpp
#include <new>

char buffer[sizeof(MyClass)];

// Standard placement new (already provided)
MyClass* obj = new (buffer) MyClass();

// Custom placement new with logging
void* operator new(size_t sz, void* ptr, const char* log) {
    std::cout << "Placement new: " << log << "\n";
    return ptr;
}

MyClass* obj2 = new (buffer, "custom") MyClass();
```

**Explanation:**
Placement new is used when you want control over where objects are constructed, such as in memory pools or shared memory. The first `void*` parameter specifies the address. You can add custom parameters for debugging or tracking. Note that there's no matching placement delete; you must manually call the destructor.

**Key takeaway:** Placement new constructs objects at pre-allocated addresses; it's useful for custom memory management but requires manual destructor calls since there's no placement delete.

---

#### Q17: Can you overload the comma operator? Should you?
**Difficulty:** #intermediate
**Category:** #gotcha #best_practice
**Concepts:** #comma_operator #operator_overloading #sequence_point #unexpected_behavior

**Answer:**
Yes, you can overload the comma operator, but you generally shouldn't because it loses its special sequence point guarantees and can create confusing code.

**Code example:**
```cpp
class Expr {
public:
    Expr operator,(const Expr& other) {
        // Custom behavior
        return other;
    }
};

// Built-in comma: guarantees left-to-right evaluation
int x = (func1(), func2(), func3());  // ✅ func1, then func2, then func3

// Overloaded comma: becomes function call, loses guarantee
Expr e1, e2, e3;
Expr result = (e1, e2, e3);  // ❌ Evaluation order not guaranteed
```

**Explanation:**
The built-in comma operator guarantees left-to-right evaluation with sequence points. When overloaded, it becomes a function call where argument evaluation order is unspecified. This breaks expected behavior and can introduce subtle bugs. The only reasonable use case is expression templates in linear algebra libraries.

**Key takeaway:** Avoid overloading the comma operator; it breaks sequence point guarantees and makes code confusing without providing significant benefits.

---

#### Q18: What is the rule of three/five/zero in relation to operator overloading?
**Difficulty:** #advanced
**Category:** #design_pattern #best_practice #memory
**Concepts:** #rule_of_five #copy_constructor #move_semantics #assignment_operator #destructor #raii

**Answer:**
If you define a custom destructor, copy constructor, or copy assignment operator, you usually need to define all three (rule of three). With move semantics, this extends to five (add move constructor and move assignment). If you use RAII correctly, you may need zero custom special functions.

**Code example:**
```cpp
// Rule of Five
class DynamicArray {
    int* data;
    size_t size;
public:
    ~DynamicArray() { delete[] data; }  // 1. Destructor
    
    DynamicArray(const DynamicArray& other)  // 2. Copy constructor
        : size(other.size), data(new int[size]) {
        std::copy(other.data, other.data + size, data);
    }
    
    DynamicArray& operator=(const DynamicArray& other) {  // 3. Copy assignment
        if (this != &other) {
            delete[] data;
            size = other.size;
            data = new int[size];
            std::copy(other.data, other.data + size, data);
        }
        return *this;
    }
    
    DynamicArray(DynamicArray&& other) noexcept  // 4. Move constructor
        : data(other.data), size(other.size) {
        other.data = nullptr;
        other.size = 0;
    }
    
    DynamicArray& operator=(DynamicArray&& other) noexcept {  // 5. Move assignment
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

**Explanation:**
Classes managing resources need consistent copy and move semantics. If you properly use smart pointers and RAII wrappers, the compiler can generate all five correctly (rule of zero), making custom operators unnecessary.

**Key takeaway:** When managing resources, implement all five special member functions or use RAII wrappers to follow the rule of zero; inconsistent implementation leads to memory leaks or double-deletion bugs.

---

#### Q19: How does the spaceship operator (<=>) simplify comparison operator overloading in C++20?
**Difficulty:** #intermediate
**Category:** #modern_cpp #best_practice
**Concepts:** #spaceship_operator #cpp20 #comparison_operators #defaulted_functions

**Answer:**
The spaceship operator (`<=>`) generates all six comparison operators (`<`, `<=`, `>`, `>=`, `==`, `!=`) from a single definition, reducing boilerplate code significantly.

**Code example:**
```cpp
// C++20: One operator generates all six
class Version {
    int major, minor, patch;
public:
    auto operator<=>(const Version&) const = default;
    bool operator==(const Version&) const = default;
};

// Pre-C++20: Need to define all six manually
class VersionOld {
public:
    bool operator<(const VersionOld&) const { /*...*/ }
    bool operator>(const VersionOld&) const { /*...*/ }
    bool operator<=(const VersionOld&) const { /*...*/ }
    bool operator>=(const VersionOld&) const { /*...*/ }
    bool operator==(const VersionOld&) const { /*...*/ }
    bool operator!=(const VersionOld&) const { /*...*/ }
};
```

**Explanation:**
The spaceship operator returns a comparison category (`strong_ordering`, `weak_ordering`, or `partial_ordering`) that describes the relationship between objects. The compiler uses this to synthesize all comparison operators, ensuring consistency and reducing errors from implementing them separately.

**Key takeaway:** In C++20, use `operator<=>` with `= default` for automatic generation of all comparison operators, eliminating boilerplate and ensuring consistency.

---

#### Q20: Why can't you overload operator. (member access)?
**Difficulty:** #advanced
**Category:** #language_rules #design_decision
**Concepts:** #member_access #compile_time #language_design #vtable

**Answer:**
The member access operator (`.`) cannot be overloaded because the compiler must know the exact memory offset of members at compile time. Allowing overloading would break this requirement and introduce ambiguities with the `->` operator.

**Explanation:**
When you write `obj.member`, the compiler calculates the exact offset of `member` within `obj` at compile time. If `.` were overloadable, this would become a runtime operation, breaking fundamental assumptions about object layout and performance. The `->` operator exists for smart pointers and proxies where runtime indirection is acceptable.

**Key takeaway:** The `.` operator requires compile-time member offset calculation, which is incompatible with runtime overloading; use `operator->` for custom pointer-like types instead.

---

#### Q21: What is the purpose of operator bool() and how does it relate to explicit conversions?
**Difficulty:** #intermediate
**Category:** #design_pattern #type_conversion
**Concepts:** #conversion_operator #explicit_keyword #bool_conversion #implicit_conversion

**Answer:**
`operator bool()` converts an object to a boolean value, commonly used for testing object validity. The `explicit` keyword prevents implicit conversions, requiring explicit casts or contextual conversion to bool.

**Code example:**
```cpp
class File {
    bool is_open;
public:
    // Without explicit: allows implicit conversion
    operator bool() const { return is_open; }
    
    // With explicit: safer, prevents unexpected conversions
    explicit operator bool() const { return is_open; }
};

File f;
if (f) { /*...*/ }        // ✅ Works (contextual conversion)
bool b = f;               // ✅ Without explicit
bool b = (bool)f;         // ✅ With explicit (requires cast)
int x = f + 5;            // ✅ Without explicit (dangerous!)
int x = (bool)f + 5;      // ❌ With explicit (prevents this)
```

**Explanation:**
Without `explicit`, objects can be implicitly converted to bool in arithmetic expressions, causing unexpected behavior. The `explicit` keyword ensures boolean conversion only happens in boolean contexts (if statements, logical operators) or with explicit casts, preventing accidental integer conversions.

**Key takeaway:** Always mark `operator bool()` as `explicit` to prevent dangerous implicit conversions to integers while still allowing natural boolean testing in conditional contexts.

---

#### Q22: Can you provide a custom allocator by overloading operator new globally?
**Difficulty:** #advanced
**Category:** #memory #advanced_technique
**Concepts:** #global_operator_new #custom_allocator #memory_pool #operator_overloading

**Answer:**
Yes, you can overload `operator new` and `operator delete` globally to provide a custom allocator for all allocations in your program, but this affects every `new` expression unless class-specific overloads exist.

**Code example:**
```cpp
// Global overload affects ALL allocations
void* operator new(std::size_t size) {
    std::cout << "Global new: " << size << " bytes\n";
    void* ptr = std::malloc(size);
    if (!ptr) throw std::bad_alloc();
    return ptr;
}

void operator delete(void* ptr) noexcept {
    std::cout << "Global delete\n";
    std::free(ptr);
}

// Now ALL heap allocations use custom allocator
int* p = new int;        // Uses custom new
MyClass* obj = new MyClass;  // Uses custom new (unless MyClass has its own)
delete p;
delete obj;
```

**Explanation:**
Global operator overloads replace the default allocation functions. Class-specific overloads take precedence for that class. This technique is used for memory debugging, tracking, custom memory pools, or embedded systems with special allocation requirements. Be cautious as this affects the entire program including STL containers.

**Key takeaway:** Global `operator new/delete` overloads provide program-wide custom allocation but must handle all allocation scenarios correctly; class-specific overloads take precedence.

---

#### Q23: What happens when you overload operator-> and what must it return?
**Difficulty:** #advanced
**Category:** #design_pattern #smart_pointers
**Concepts:** #arrow_operator #smart_pointers #proxy_pattern #iterator_pattern

**Answer:**
`operator->` must return either a pointer or another object that also overloads `operator->`. The compiler chains calls until it reaches a raw pointer, then applies the member access.

**Code example:**
```cpp
class SmartPtr {
    MyClass* ptr;
public:
    SmartPtr(MyClass* p) : ptr(p) {}
    
    // Must return pointer or object with operator->
    MyClass* operator->() const {
        if (!ptr) throw std::runtime_error("Null pointer");
        return ptr;
    }
    
    MyClass& operator*() const { return *ptr; }
};

SmartPtr sp(new MyClass);
sp->method();  // Equivalent to: (sp.operator->())->method()
```

**Explanation:**
Unlike other operators, `operator->` is special: if it returns an object, the compiler applies `operator->` again (recursively) until it gets a raw pointer. This enables smart pointers and proxy objects to seamlessly replace raw pointers while adding custom behavior like reference counting or null checking.

**Key takeaway:** `operator->` enables smart pointers by returning a pointer and allowing chained application; this is how `shared_ptr` and `unique_ptr` provide pointer-like syntax with automatic memory management.

---

#### Q24: Why is returning *this by reference important for assignment operators?
**Difficulty:** #intermediate
**Category:** #best_practice #design_pattern
**Concepts:** #assignment_operator #reference_return #chaining #copy_semantics

**Answer:**
Returning `*this` by reference enables assignment chaining (`a = b = c`) and matches the behavior of built-in types, avoiding unnecessary copies.

**Code example:**
```cpp
class String {
public:
    // ✅ Correct: return reference
    String& operator=(const String& other) {
        if (this != &other) {
            // assignment logic
        }
        return *this;  // Enable chaining
    }
    
    // ❌ Wrong: return by value
    String operator=(const String& other) {
        if (this != &other) {
            // assignment logic
        }
        return *this;  // Creates unnecessary copy
    }
};

String s1, s2, s3;
s1 = s2 = s3;  // Works due to reference return
// Evaluates as: s1.operator=(s2.operator=(s3))
```

**Explanation:**
When `s2 = s3` returns by reference, it returns a reference to `s2`, which is then used as the right operand for `s1 = s2`. Returning by value would create a temporary copy, which is inefficient and doesn't match built-in type behavior. All compound assignment operators (`+=`, `-=`, etc.) should also return `*this` by reference.

**Key takeaway:** Assignment operators should return `*this` by reference to enable chaining and avoid unnecessary copies, matching built-in type semantics.

---

#### Q25: How do you prevent an operator from being called with temporary objects?
**Difficulty:** #advanced
**Category:** #advanced_technique #performance
**Concepts:** #rvalue_reference #temporary_objects #ref_qualifiers #overload_resolution

**Answer:**
Use ref-qualifiers (`&` or `&&`) on member functions to control whether they can be called on lvalues or rvalues.

**Code example:**
```cpp
class Array {
public:
    // Can only be called on lvalues (non-temporary objects)
    int& operator[](size_t idx) & {
        return data[idx];
    }
    
    // Can only be called on rvalues (temporary objects)
    int operator[](size_t idx) && {
        return data[idx];  // Return by value for temporaries
    }
    
    // Prevent dangerous operations on temporaries
    Array& operator+=(const Array& other) & {  // lvalue-only
        // modify this object
        return *this;
    }
    
    // Delete rvalue version to prevent: getArray() += other;
    Array& operator+=(const Array& other) && = delete;
};

Array arr;
arr[0] = 5;           // ✅ OK: arr is lvalue
getArray()[0] = 5;    // ❌ Error if rvalue version is deleted
```

**Explanation:**
Ref-qualifiers allow you to provide different implementations or prevent operations based on whether the object is a temporary. This is useful for preventing dangerous operations on temporaries (like modifying an object that's about to be destroyed) and for optimization (e.g., enabling move semantics only when appropriate).

**Key takeaway:** Use ref-qualifiers (`&` and `&&`) on member functions to control usage based on object lifetime, preventing dangerous operations on temporaries.

---

#### Q26: What is the diamond problem in relation to operator overloading in multiple inheritance?
**Difficulty:** #advanced
**Category:** #gotcha #inheritance
**Concepts:** #multiple_inheritance #diamond_problem #operator_overloading #ambiguity #virtual_inheritance

**Answer:**
The diamond problem can cause ambiguity when inheriting operator overloads from multiple base classes. Virtual inheritance or explicit qualification resolves the ambiguity.

**Code example:**
```cpp
class Base {
public:
    Base& operator=(const Base& other) { return *this; }
};

class Left : public Base { };
class Right : public Base { };

class Diamond : public Left, public Right {
public:
    Diamond& operator=(const Diamond& other) {
        // ❌ Ambiguous: which Base::operator= to use?
        // Base::operator=(other);  // Error: ambiguous
        
        // ✅ Solution 1: Explicitly qualify
        Left::operator=(other);
        Right::operator=(other);
        
        // ✅ Solution 2: Use virtual inheritance
        return *this;
    }
};
```

**Explanation:**
When a derived class inherits from multiple base classes that both inherit from a common ancestor, operator overloads from the ancestor become ambiguous. Virtual inheritance ensures only one instance of the base class exists, or you can explicitly specify which path to use.

**Key takeaway:** Multiple inheritance can create ambiguous operator overloads; resolve with virtual inheritance or explicit base class qualification.

---

#### Q27: Can you overload operator new to take custom parameters for debugging?
**Difficulty:** #advanced
**Category:** #memory #debugging
**Concepts:** #operator_new #custom_allocator #debugging #placement_new #variadic_new

**Answer:**
Yes, you can overload `operator new` with custom parameters (like file/line information) for debugging and tracking allocations.

**Code example:**
```cpp
class Tracked {
public:
    // Custom operator new with debug info
    void* operator new(std::size_t size, const char* file, int line) {
        std::cout << "Allocating at " << file << ":" << line 
                  << " (" << size << " bytes)\n";
        return ::operator new(size);
    }
    
    void operator delete(void* ptr) noexcept {
        ::operator delete(ptr);
    }
};

#define DEBUG_NEW new(__FILE__, __LINE__)

int main() {
    Tracked* obj = DEBUG_NEW Tracked();  // Prints file and line
    delete obj;
}
```

**Explanation:**
Custom operator new overloads with additional parameters enable allocation tracking, memory debugging, and profiling. The additional parameters don't affect the basic allocation mechanism but provide context for debugging. Note that there's no matching "placement delete" - exceptions during construction will call regular `operator delete`.

**Key takeaway:** Custom `operator new` overloads with additional parameters enable powerful debugging and tracking capabilities without changing the basic allocation semantics.

---

#### Q28: How do functors compare to function pointers in performance and flexibility?
**Difficulty:** #intermediate
**Category:** #performance #design_pattern
**Concepts:** #functor #function_pointer #inline_optimization #stl #callable

**Answer:**
Functors are generally more performant because they can be inlined by the compiler, whereas function pointers prevent inlining. Functors also provide state management and type safety that function pointers lack.

**Code example:**
```cpp
// Function pointer: cannot be inlined
int (*func_ptr)(int) = [](int x) { return x * 2; };

// Functor: can be inlined
struct Multiplier {
    int factor;
    int operator()(int x) const { return x * factor; }
};

std::vector<int> v(1000000);

// Function pointer: no inline optimization
std::transform(v.begin(), v.end(), v.begin(), func_ptr);

// Functor: compiler can inline operator()
std::transform(v.begin(), v.end(), v.begin(), Multiplier{2});
```

**Explanation:**
Functors enable the compiler to see the complete implementation of `operator()` at the call site, allowing aggressive inlining and optimization. Function pointers are addresses that can only be dereferenced at runtime, preventing this optimization. Functors also maintain state via member variables and provide compile-time polymorphism.

**Key takeaway:** Prefer functors over function pointers for performance-critical code; they enable inlining and optimization while providing state management and type safety.

---

#### Q29: What is the purpose of operator,() and when would you use it?
**Difficulty:** #advanced
**Category:** #advanced_technique #gotcha
**Concepts:** #comma_operator #expression_template #sequence_point #operator_overloading

**Answer:**
Overloading the comma operator allows custom sequencing behavior, primarily used in expression templates for linear algebra libraries. It should generally be avoided due to loss of sequence point guarantees.

**Code example:**
```cpp
// Expression template for matrix initialization
class Matrix {
public:
    Matrix& operator,(int value) {
        add_element(value);
        return *this;
    }
};

// Usage: Matrix m; m << 1, 2, 3, 4;  // Initialize with values

// Problem: loses built-in comma semantics
int a = (f1(), f2(), f3());  // Built-in: guaranteed left-to-right
Matrix m = (m1, m2, m3);     // Overloaded: no guarantee!
```

**Explanation:**
The built-in comma operator evaluates left operand, discards its value, evaluates right operand, and returns it - with guaranteed left-to-right evaluation. Overloading transforms it into a function call, losing these guarantees. The only legitimate use is in domain-specific languages (DSLs) like matrix libraries where the custom behavior is more valuable than standard semantics.

**Key takeaway:** Avoid overloading the comma operator except in expression templates or DSLs where the custom semantics provide significant value that outweighs the loss of standard behavior.

---

#### Q30: How does operator overloading interact with template argument deduction?
**Difficulty:** #advanced
**Category:** #templates #advanced_technique
**Concepts:** #template_deduction #operator_overloading #sfinae #type_traits

**Answer:**
Overloaded operators in template classes can be templates themselves, enabling type-agnostic operations. Template argument deduction works with overloaded operators just like regular functions.

**Code example:**
```cpp
template<typename T>
class Optional {
    T value;
    bool has_value;
public:
    // Template operator for any comparable type
    template<typename U>
    bool operator==(const Optional<U>& other) const {
        if (!has_value && !other.has_value) return true;
        if (has_value != other.has_value) return false;
        return value == other.value;  // Uses T's operator==
    }
    
    // SFINAE: only available if T supports <
    template<typename U = T>
    auto operator<(const Optional& other) const 
        -> decltype(std::declval<U>() < std::declval<U>(), bool()) {
        if (!has_value) return other.has_value;
        if (!other.has_value) return false;
        return value < other.value;
    }
};

Optional<int> o1(5), o2(10);
bool eq = (o1 == o2);  // Template argument deduced as int
bool less = (o1 < o2); // Works because int supports <
```

**Explanation:**
Template operators enable generic comparisons while preserving type safety. SFINAE (Substitution Failure Is Not An Error) can conditionally enable operators based on whether the underlying type supports them, preventing compilation errors and enabling concepts-like constraints pre-C++20.

**Key takeaway:** Combining operator overloading with templates enables powerful generic programming; use SFINAE or concepts to conditionally enable operators based on type requirements.

---

### PRACTICE_TASKS: Output Prediction and Code Analysis

#### Q1
```cpp
class Counter {
    int val;
public:
    Counter(int v) : val(v) {}
    Counter& operator++() { ++val; return *this; }
    Counter operator++(int) { Counter t = *this; ++val; return t; }
    int get() const { return val; }
};

int main() {
    Counter c(5);
    std::cout << (c++).get() << " " << (++c).get() << " " << c.get();
}
```

#### Q2
```cpp
class String {
    char* data;
public:
    String(const char* s) { data = new char[strlen(s)+1]; strcpy(data, s); }
    ~String() { delete[] data; }
    
    String operator+(const String& other) {
        String result("");
        delete[] result.data;
        result.data = new char[strlen(data) + strlen(other.data) + 1];
        strcpy(result.data, data);
        strcat(result.data, other.data);
        return result;
    }
};

int main() {
    String s1("Hello"), s2(" World");
    String s3 = s1 + s2;
}
```

What is the problem with this code?

#### Q3
```cpp
class A {
public:
    void* operator new(size_t sz) {
        std::cout << "1 ";
        return ::operator new(sz);
    }
    
    A() { std::cout << "2 "; }
    ~A() { std::cout << "3 "; }
    
    void operator delete(void* p) {
        std::cout << "4 ";
        ::operator delete(p);
    }
};

int main() {
    A* obj = new A;
    delete obj;
}
```

#### Q4
```cpp
class Bool {
    bool val;
public:
    Bool(bool v) : val(v) {}
    Bool operator&&(const Bool& other) {
        std::cout << "Called ";
        return Bool(val && other.val);
    }
};

Bool expensive() {
    std::cout << "Expensive ";
    return Bool(true);
}

int main() {
    Bool a(false);
    Bool result = a && expensive();
}
```

#### Q5
```cpp
class Complex {
    double real;
public:
    Complex(double r) : real(r) {}
    Complex operator+(const Complex& other) { return Complex(real + other.real); }
};

int main() {
    Complex c1(5.0);
    Complex c2 = c1 + 3.0;  // Line A
    Complex c3 = 3.0 + c1;  // Line B
}
```

Which lines compile? Why?

#### Q6
```cpp
class Holder {
    int val;
public:
    Holder(int v) : val(v) {}
    
    Holder operator=(const Holder& other) {
        val = other.val;
        return *this;
    }
    
    int get() const { return val; }
};

int main() {
    Holder h1(10), h2(20), h3(30);
    h1 = h2 = h3;
    std::cout << h1.get() << " " << h2.get();
}
```

#### Q7
```cpp
class Array {
    int data[5];
public:
    int& operator[](int idx) { return data[idx]; }
    int operator[](int idx) const { return data[idx]; }
};

void test(const Array& arr) {
    arr[0] = 10;
}
```

Will this compile? Why or why not?

#### Q8
```cpp
class Functor {
    int x;
public:
    Functor(int v) : x(v) {}
    int operator()(int a, int b) const { return x + a + b; }
};

int main() {
    Functor f(5);
    std::cout << f(10, 20);
}
```

#### Q9
```cpp
class Smart {
    int* ptr;
public:
    Smart(int* p) : ptr(p) {}
    ~Smart() { delete ptr; }
    
    int* operator->() { return ptr; }
    int& operator*() { return *ptr; }
};

int main() {
    Smart sp(new int(42));
    std::cout << *sp << " ";
    *sp = 100;
    std::cout << *sp;
}
```

#### Q10
```cpp
class Matrix {
public:
    Matrix operator+(const Matrix&) { std::cout << "+ "; return *this; }
    Matrix operator*(const Matrix&) { std::cout << "* "; return *this; }
};

int main() {
    Matrix a, b, c;
    Matrix result = a + b * c;
}
```

#### Q11
```cpp
class Point {
    int x, y;
public:
    Point(int x, int y) : x(x), y(y) {}
    
    friend Point operator+(int lhs, const Point& rhs) {
        return Point(lhs + rhs.x, rhs.y);
    }
    
    Point operator+(int rhs) const {
        return Point(x + rhs, y);
    }
};

int main() {
    Point p(5, 10);
    Point p1 = p + 3;   // Line A
    Point p2 = 3 + p;   // Line B
}
```

Which lines work and why?

#### Q12
```cpp
class Widget {
public:
    Widget& operator++() {
        std::cout << "Pre ";
        return *this;
    }
    
    Widget& operator++(int) {
        std::cout << "Post ";
        return *this;
    }
};

int main() {
    Widget w;
    ++w;
    w++;
}
```

What is the problem with post-increment here?

#### Q13
```cpp
class Logged {
public:
    void* operator new(size_t sz, const char* msg) {
        std::cout << msg << " ";
        return ::operator new(sz);
    }
    
    Logged() { std::cout << "Ctor "; }
};

int main() {
    Logged* obj = new ("Allocating") Logged();
}
```

#### Q14
```cpp
class X {
public:
    X operator+(const X&) { return *this; }
};

class Y : public X {
public:
    Y operator+(const Y&) { return *this; }
};

int main() {
    Y y1, y2;
    X x = y1 + y2;
}
```

#### Q15
```cpp
class Index {
    int val;
public:
    Index(int v) : val(v) {}
    
    int operator[](int) & { return val; }
    int operator[](int) && { return val + 100; }
};

Index getIndex() { return Index(5); }

int main() {
    Index idx(10);
    std::cout << idx[0] << " " << getIndex()[0];
}
```

#### Q16
```cpp
class Stream {
public:
    Stream& operator<<(int) { std::cout << "int "; return *this; }
    Stream& operator<<(double) { std::cout << "double "; return *this; }
};

int main() {
    Stream s;
    s << 5 << 3.14 << 10;
}
```

#### Q17
```cpp
class Base {
public:
    virtual Base& operator=(const Base& other) {
        std::cout << "Base= ";
        return *this;
    }
};

class Derived : public Base {
public:
    Derived& operator=(const Derived& other) {
        std::cout << "Derived= ";
        Base::operator=(other);
        return *this;
    }
};

int main() {
    Derived d1, d2;
    Base& b = d1;
    b = d2;
}
```

#### Q18
```cpp
class Safe {
public:
    explicit operator bool() const { return true; }
};

int main() {
    Safe s;
    if (s) std::cout << "A ";
    bool b = s;
    int x = s + 5;
}
```

What happens at each line?

#### Q19
```cpp
class Mult {
    int factor;
public:
    Mult(int f) : factor(f) {}
    int operator()(int x) const { return x * factor; }
};

int main() {
    std::vector<int> v = {1, 2, 3, 4};
    std::transform(v.begin(), v.end(), v.begin(), Mult(3));
    for (int x : v) std::cout << x << " ";
}
```

#### Q20
```cpp
class Mystery {
public:
    Mystery operator,(const Mystery& other) {
        std::cout << ", ";
        return other;
    }
};

int main() {
    Mystery a, b, c;
    Mystery result = (a, b, c);
}
```

---

### QUICK_REFERENCE: Answer Key and Summary Tables

#### Answer Key for Practice Questions

| Q# | Answer | Explanation | Key Concept |
|----|--------|-------------|-------------|
| 1 | 5 7 7 | Post-increment returns old value (5), then pre-increment returns modified value (7), final value is 7 | #increment_operators #return_types |
| 2 | Double-delete bug and memory leak | Class is missing copy constructor and assignment operator; uses compiler-generated versions causing shallow copy. When temporary is destroyed, it deletes the same memory. | #rule_of_three #shallow_copy #memory_leak |
| 3 | 1 2 3 4 | operator new runs before constructor (1 2), destructor runs before operator delete (3 4) | #operator_new #object_lifecycle |
| 4 | Called Expensive | Overloaded && loses short-circuit behavior; both operands are evaluated as function parameters regardless of left operand value | #short_circuit #logical_operators |
| 5 | Line A compiles, Line B fails | Line A works due to implicit conversion of 3.0 to Complex. Line B fails because operator+ is a member function requiring left operand to be Complex. | #member_function #implicit_conversion #symmetry |
| 6 | 30 20 | operator= returns by value (creates copy), not by reference. Assignment is right-associative: h2=h3 returns copy with val=30, then h1=copy sets h1.val=30, but h2.val=20 unchanged. | #assignment_operator #return_types #chaining |
| 7 | No, won't compile | Const version returns by value (int), not reference (int&), so assignment is to a temporary rvalue which is illegal | #const_correctness #subscript_operator #reference_return |
| 8 | 35 | Functor's operator() adds x (5) + a (10) + b (20) = 35 | #functor #operator_call |
| 9 | 42 100 | operator* provides dereferencing like a pointer. First prints 42, then modifies to 100, prints 100 | #smart_pointers #operator_overloading |
| 10 | * + | Operator precedence is unchanged by overloading; * has higher precedence than +, so b*c executes first, then +. | #operator_precedence #evaluation_order |
| 11 | Both work | Line A uses member operator+(int), Line B uses friend operator+(int, Point). Friend function enables commutativity. | #friend_function #symmetry #commutative_operations |
| 12 | Returns reference to local | Post-increment should return by value (copy of old state), not by reference. This returns reference to *this after modification, making it behave like pre-increment. | #increment_operators #return_types #dangling_reference |
| 13 | Allocating Ctor | Custom operator new with parameters (placement-like) runs first with message, then constructor | #placement_new #custom_parameters #operator_new |
| 14 | Compiles, uses Y::operator+ | Y has its own operator+ that returns Y, which implicitly converts to X. No object slicing during operation. | #inheritance #operator_overloading #implicit_conversion |
| 15 | 10 105 | lvalue idx calls & version (returns 10), rvalue getIndex() calls && version (returns 5+100=105) | #ref_qualifiers #lvalue_rvalue #operator_overloading |
| 16 | int double int | Chaining works left-to-right: s.operator<<(5).operator<<(3.14).operator<<(10). Each operator<< selects overload based on parameter type. | #operator_chaining #stream_operators #overload_resolution |
| 17 | Derived= Base= | Virtual operator= in Base is overridden. Through Base reference, virtual dispatch calls Derived::operator=, which calls Base::operator= explicitly. | #virtual_functions #operator_overloading #polymorphism |
| 18 | "A" printed, then compile errors | if statement works (contextual conversion), bool b = s fails (explicit prevents implicit conversion), int x fails (explicit prevents conversion to int) | #explicit_conversion #operator_bool #implicit_conversion |
| 19 | 3 6 9 12 | std::transform applies Mult(3) functor to each element: 1*3=3, 2*3=6, 3*3=9, 4*3=12 | #functor #stl_algorithms #transform |
| 20 | , , | Overloaded comma operator is called as function: a, b returns b (prints ,), then result is assigned c (prints ,) | #comma_operator #sequence_point #operator_overloading |

#### Operator Overloading Categories

| Category | Operators | Must Be Member | Common Use |
|----------|-----------|----------------|------------|
| Arithmetic | `+`, `-`, `*`, `/`, `%` | No | Math classes, custom types |
| Comparison | `==`, `!=`, `<`, `>`, `<=`, `>=`, `<=>` | No | Sorting, searching |
| Assignment | `=`, `+=`, `-=`, `*=`, `/=`, etc. | Yes (`=` only) | Resource management |
| Increment/Decrement | `++`, `--` | No | Iterators, counters |
| Subscript | `[]` | Yes | Container classes |
| Function Call | `()` | Yes | Functors, callbacks |
| Member Access | `->`, `->*` | Yes (`->` only) | Smart pointers, proxies |
| Stream | `<<`, `>>` | No | I/O operations |
| Memory | `new`, `delete`, `new[]`, `delete[]` | No | Custom allocators |
| Conversion | `operator T()` | Yes | Implicit/explicit conversions |

#### Member vs Friend Function Selection Guide

| Scenario | Implementation | Reason |
|----------|---------------|---------|
| Left operand always class object | Member function | Simpler, natural access to members |
| Need symmetric operations (e.g., `int + Complex`) | Friend function | Enables implicit conversion on left operand |
| Stream operators (`<<`, `>>`) | Friend function | Stream is left operand |
| Must be member by rule (`=`, `[]`, `()`, `->`) | Member function | Language requirement |
| Comparison operators | Friend (or member) | Friend enables symmetry if needed |
| Unary operators | Member (preferred) | Natural use of `this` |

#### Return Type Guidelines

| Operator | Return Type | Reason |
|----------|-------------|---------|
| `operator=` | `T&` (reference to `*this`) | Enable chaining, avoid copies |
| `operator+=`, `-=`, etc. | `T&` (reference to `*this`) | Enable chaining, modify in place |
| `operator+`, `-`, etc. | `T` (by value) | Return new object, don't modify operands |
| `operator++()` (pre) | `T&` (reference to `*this`) | Efficient, return modified object |
| `operator++(int)` (post) | `T` (by value) | Must return old value (copy) |
| `operator[]` (non-const) | `T&` | Enable modification: `arr[i] = value` |
| `operator[]` (const) | `const T&` | Read-only access |
| `operator bool()` | `bool` | Conversion to boolean |
| `operator<<`, `>>` | `ostream&`/`istream&` | Enable chaining |
| `operator->` | `T*` or object with `operator->` | Pointer or chainable |

#### Common Operator Overloading Mistakes

| Mistake | Problem | Solution |
|---------|---------|----------|
| Returning by value from `operator=` | Breaks chaining, inefficient | Return `*this` by reference |
| Returning reference from post-increment | Dangling reference | Return by value (old state) |
| Making `operator<<` a member | Wrong operand order | Make it friend or non-member |
| Forgetting dummy `int` in post-increment | Ambiguity with pre-increment | Add unused `int` parameter |
| Overloading `&&` or `||` | Loses short-circuit evaluation | Don't overload these |
| Not providing both const and non-const `operator[]` | Can't access const objects | Provide both versions |
| Missing matching `operator delete` for custom `new` | Undefined behavior | Always provide matching pair |
| Changing precedence/associativity | Impossible in C++ | Design around fixed grammar |
| Not returning stream by reference | Breaks chaining | Return `ostream&` or `istream&` |
| Forgetting self-assignment check in `operator=` | Undefined behavior | Check `if (this != &other)` |

#### Performance Considerations

| Operation | Performance Impact | Recommendation |
|-----------|-------------------|----------------|
| Pre-increment vs Post-increment | Post requires copy | Prefer `++it` over `it++` |
| Member vs Friend | Minimal difference | Choose based on design, not performance |
| Return by value vs reference | Reference faster for large objects | Return by reference for assignment, by value for arithmetic |
| Functors vs Function pointers | Functors enable inlining | Use functors for STL algorithms |
| Virtual operator overloading | Vtable lookup overhead | Avoid if performance critical |
| Operator chaining | Multiple function calls | Acceptable overhead for clarity |
| Smart pointer operations | Minimal overhead when inlined | Modern compilers optimize well |

#### C++20 Spaceship Operator

| Feature | Pre-C++20 | C++20 with `<=>` |
|---------|-----------|------------------|
| Operators needed | 6 (`<`, `>`, `<=`, `>=`, `==`, `!=`) | 2 (`<=>`, `==`) |
| Lines of code | 30-40 lines | 2-3 lines |
| Consistency | Manual, error-prone | Automatic, guaranteed |
| Syntax | Multiple function definitions | `auto operator<=>(const T&) const = default;` |
| Return type | `bool` for each | `std::strong_ordering`, `std::weak_ordering`, or `std::partial_ordering` |
