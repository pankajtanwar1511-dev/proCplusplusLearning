## TOPIC: Classes, Structs, and Access Specifiers

### THEORY_SECTION: Core Concepts and Foundations

#### 1. Classes vs Structs - Identical Except Default Access

**Definition:** Classes and structs are user-defined types that bundle data (members) and functions (methods) together. They are **functionally identical** - the ONLY differences are their default access specifiers and default inheritance modes.

**Core Differences Table:**

| Aspect | `struct` | `class` |
|--------|----------|---------|
| **Default member access** | `public` | `private` |
| **Default inheritance mode** | `public` | `private` |
| **Typical usage** | Simple data containers (PODs) | Encapsulated objects with behavior |
| **Can have constructors?** | ✅ Yes | ✅ Yes |
| **Can have virtual functions?** | ✅ Yes | ✅ Yes |
| **Can be used as base class?** | ✅ Yes | ✅ Yes |
| **Memory layout difference** | **None** - identical layout | **None** - identical layout |

**Before/After Examples:**

```cpp
// ✅ Struct - public by default
struct Point {
    int x, y;  // Implicitly public
    void print() { std::cout << x << ", " << y; }
};

Point p;
p.x = 10;  // ✅ Direct access allowed

// ✅ Class - private by default
class Point2 {
    int x, y;  // Implicitly private
public:
    void setX(int val) { x = val; }
    void print() { std::cout << x << ", " << y; }
};

Point2 p2;
// p2.x = 10;  // ❌ Error: x is private
p2.setX(10);   // ✅ Use public setter
```

**When to Use Which:**

| Use `struct` when | Use `class` when |
|-------------------|------------------|
| Simple data container (POD) | Object requires encapsulation |
| All members should be public | Need to enforce invariants |
| C compatibility needed | Implementing design patterns |
| No behavior, just data | Complex behavior and state |
| Aggregate initialization desired | Constructor validation needed |

---

#### 2. Access Specifiers - Compile-Time Visibility Control

**Definition:** Access specifiers are keywords that control the visibility and accessibility of class members, enforcing **encapsulation** at compile time.

**Three Access Levels:**

| Specifier | Accessible From | Use Case | Memory Impact |
|-----------|----------------|----------|---------------|
| **`public`** | Anywhere (inside class, derived classes, outside) | Public interface, API | None |
| **`protected`** | Inside class + derived classes only | Protected interface for inheritance | None |
| **`private`** | Inside class only | Internal implementation details | None |

**Access Control Matrix:**

| Context | Can Access Public | Can Access Protected | Can Access Private |
|---------|-------------------|---------------------|-------------------|
| **Same class** | ✅ | ✅ | ✅ |
| **Derived class** | ✅ | ✅ | ❌ |
| **Outside code** | ✅ | ❌ | ❌ |
| **Friend function/class** | ✅ | ✅ | ✅ |

**Practical Example:**

```cpp
class BankAccount {
private:
    double balance;        // Only accessible within BankAccount
    void validateAmount(double amt) { /* ... */ }

protected:
    std::string accountType;  // Accessible in derived classes

public:
    void deposit(double amt) {  // Public API
        if (amt > 0) balance += amt;
    }
    double getBalance() const { return balance; }
};

class SavingsAccount : public BankAccount {
    void test() {
        // balance = 100;        // ❌ Error: private in base
        accountType = "Savings"; // ✅ OK: protected accessible
        deposit(50);             // ✅ OK: public accessible
    }
};
```

**Critical Characteristics:**

- **Compile-time only:** Access control is checked during compilation, not at runtime
- **No memory impact:** Access specifiers don't affect object size or memory layout
- **Per-class, not per-object:** Member functions can access private members of ANY instance of the same class
- **Not security:** Can be bypassed with unsafe pointer casts (undefined behavior)

---

#### 3. Encapsulation - Why Access Control Matters

**Definition:** Encapsulation is the OOP principle of bundling data and methods together while hiding internal implementation details from external code.

**Benefits of Access Control:**

| Benefit | Description | Example |
|---------|-------------|---------|
| **Invariant enforcement** | Prevent invalid state | `balance` can't go negative if only modified through `deposit()/withdraw()` |
| **Interface stability** | Change internals without breaking users | Can change `balance` storage from `double` to `Cents` class |
| **Reduced coupling** | Users depend on interface, not implementation | External code doesn't know or care about internal data structures |
| **Compile-time safety** | Catch misuse at compile time | Attempt to modify `private` member causes compiler error |

**Encapsulation Patterns:**

```cpp
// ✅ Good encapsulation - private data, public interface
class GoodDesign {
private:
    int value;
    bool isValid() const { return value >= 0; }

public:
    void setValue(int v) {
        if (v < 0) throw std::invalid_argument("Negative value");
        value = v;
    }
    int getValue() const { return value; }
};

// ❌ Poor encapsulation - public data
class PoorDesign {
public:
    int value;  // Anyone can modify without validation
};
```

**Interview Relevance:**

- **Common question:** "What's the difference between struct and class?" → Default access
- **Design questions:** "How would you design a class to ensure X invariant?" → Use private + validation
- **Inheritance questions:** How access specifiers interact with inheritance modes
- **Friend declarations:** When and why to break encapsulation intentionally

### EDGE_CASES: Tricky Scenarios and Deep Internals

#### Edge Case 1: Inheritance and Access Specifiers

Both `struct` and `class` can be used as base classes, and the type doesn't affect inheritance semantics—only the default inheritance specifier changes. When you inherit from a `struct`, the default inheritance is public. When you inherit from a `class`, the default is private. This can lead to surprising behavior if you forget to specify the inheritance type explicitly.

```cpp
struct Base {
    void foo() {}
};

// Inherits publicly by default (struct)
struct Derived1 : Base {
    void bar() { foo(); }  // ✅ Accessible
};

class Base2 {
public:
    void foo() {}
};

// Inherits privately by default (class)
class Derived2 : Base2 {
    void bar() { foo(); }  // ✅ Accessible within class
};

// But from outside:
// Derived2 d;
// d.foo();  // ❌ Error: foo is inaccessible (private inheritance)
```

This demonstrates that private inheritance makes all base class members private in the derived class, regardless of their original access level.

#### Edge Case 2: Memory Layout and Access Specifiers

Access specifiers are purely a compile-time enforcement mechanism and have **no impact on memory layout or object size**. Members are laid out in memory in the order they're declared, regardless of whether they're public, protected, or private. However, compilers may add padding between members for alignment purposes, and access specifier boundaries don't prevent this optimization.

```cpp
struct S1 {
    int a;      // offset 0
    int b;      // offset 4
};

class S2 {
private:
    int a;      // offset 0
public:
    int b;      // offset 4
};

// sizeof(S1) == sizeof(S2), same layout
```

This means you cannot use access specifiers to control memory layout—you need alignment attributes or packing directives for that.

#### Edge Case 3: Private Members and Pointer Hacks

While access specifiers provide compile-time protection, they don't provide runtime security. It's technically possible to access private members through unsafe pointer arithmetic or casting, though this is undefined behavior and violates C++'s type system.

```cpp
class Secret {
private:
    int value = 42;
};

int main() {
    Secret s;
    int* ptr = reinterpret_cast<int*>(&s);  // ❌ Dangerous hack
    std::cout << *ptr;  // May print 42, but undefined behavior
}
```

This "works" because the object has a contiguous memory layout, and `value` is at a predictable offset. However, this approach is implementation-dependent, breaks encapsulation, and should never be used in production code. It's only relevant in reverse engineering, security exploits, or debugging scenarios.

#### Edge Case 4: Virtual Functions and Access Control

Access specifiers control who can **call** a function, but they don't affect whether the function participates in virtual dispatch. Even a private virtual function is placed in the vtable and **can be overridden by a derived class**—overriding does *not* require access to the base function. The derived class may even give its override a wider access level (e.g. `public`).

```cpp
class Base {
private:
    // Private in Base: only Base's own members may CALL it directly
    virtual void secret() { std::cout << "Base::secret\n"; }
public:
    void callSecret() { secret(); }  // Triggers virtual dispatch
};

class Derived : public Base {
public:
    // Overriding a private base virtual is perfectly legal—
    // access control does not restrict overriding, only calling.
    // The override may even be made public, as here.
    void secret() override { std::cout << "Derived::secret\n"; }
};

int main() {
    Derived d;
    Base* ptr = &d;
    ptr->callSecret();  // Prints "Derived::secret" — polymorphism works
    d.secret();         // OK: secret() is public in Derived
    // ptr->secret();   // ERROR: secret() is private in Base (static type checked)
}
```

The vtable is a runtime mechanism for polymorphism, while access control is a compile-time check applied to the *static type* at the call site—so they operate independently. This is exactly the mechanism behind the Non-Virtual Interface (NVI) idiom, where a public non-virtual base function calls private virtual functions that derived classes override.

#### Edge Case 5: Friend Declarations Override Access Control

The `friend` keyword allows external functions or classes to access private and protected members, effectively bypassing access control. This is useful for tightly coupled classes but should be used sparingly as it breaks encapsulation.

```cpp
class Box {
private:
    int contents = 100;
    friend class Inspector;
    friend void reveal(const Box&);
};

class Inspector {
public:
    void inspect(const Box& b) {
        std::cout << b.contents;  // ✅ Allowed
    }
};

void reveal(const Box& b) {
    std::cout << b.contents;  // ✅ Allowed
}
```

Friendship is not inherited and must be explicitly granted, making it a powerful but potentially dangerous feature.

#### Edge Case 6: Changing Member Access with `using` Declarations

A `using` declaration inside a derived class can **re-set the access level** of an inherited member — independent of its access in the base — as long as the derived class can already access that member. You place `using Base::member;` under the access specifier (`public`, `protected`, or `private`) you want that member to have in the derived class. This works with any inheritance mode and can either **widen** access (re-expose a member hidden by private inheritance) or **narrow** it. It is the standard tool for "inherit privately, but selectively publish one or two members."

```cpp
class Base {
public:    void pub()  { std::cout << "pub\n"; }
protected: void prot() { std::cout << "prot\n"; }
private:   void priv() {}                 // Derived cannot see this at all
};

// Private inheritance makes pub()/prot() PRIVATE inside Derived...
class Derived : private Base {
public:
    using Base::pub;    // ✅ re-exposed as PUBLIC in Derived
    using Base::prot;   // ✅ protected-in-Base → PUBLIC (Derived has access)
    // using Base::priv;  // ❌ ERROR: priv is private in Base; Derived can't see it
};

// A using-declaration can also NARROW access:
class Locked : public Base {
private:
    using Base::pub;    // pub() is now PRIVATE in Locked
};

// Whatever access Derived sets is what propagates to further-derived classes:
class GrandChild : public Derived {
    // pub() and prot() inherited as PUBLIC, straight from Derived's interface
};

int main() {
    Derived d;    d.pub();  d.prot();   // ✅ both public in Derived
    Locked  l;    (void)l;  // l.pub(); // ❌ private in Locked
    GrandChild g; g.pub();  g.prot();   // ✅ still public, via Derived
}
```

The single rule behind all of this: **you can only re-expose a member you can already access.** A member that is `private` in the base is invisible to the derived class, so `using Base::priv;` fails — unless the derived class obtained access another way, such as being a `friend` of the base. And because the `using` declaration makes the member a genuine part of the derived class's interface, the original base access stops mattering downstream: further-derived classes see only the access level the intermediate class chose (public inheritance keeps it public, private inheritance narrows it again).

### CODE_EXAMPLES: Practical Demonstrations

#### Example 1: Basic Struct vs Class Usage

```cpp
#include <iostream>
using namespace std;

struct MyStruct {
    int x;  // ✅ Public by default
    void show() { cout << "x = " << x << endl; }
};

class MyClass {
    int y;  // ❌ Private by default
public:
    void setY(int val) { y = val; }
    void show() { cout << "y = " << y << endl; }
};

int main() {
    MyStruct s;
    s.x = 10;  // ✅ Direct access allowed
    s.show();

    MyClass c;
    // c.y = 5;  // ❌ Error: 'y' is private
    c.setY(20);  // ✅ Use public setter
    c.show();
}
```

This demonstrates the fundamental difference: struct members are public by default, allowing direct access, while class members are private and require accessor methods for encapsulation.

#### Example 2: Inheritance with Different Access Specifiers

```cpp
class Base {
protected:
    int prot_member = 10;
private:
    int priv_member = 20;
public:
    int pub_member = 30;
};

class PublicDerived : public Base {
    void test() {
        prot_member = 1;  // ✅ Protected remains protected
        pub_member = 2;   // ✅ Public remains public
        // priv_member = 3;  // ❌ Private never accessible
    }
};

class ProtectedDerived : protected Base {
    void test() {
        prot_member = 1;  // ✅ Still accessible
        pub_member = 2;   // ✅ Becomes protected in this class
    }
};

class PrivateDerived : private Base {
    void test() {
        prot_member = 1;  // ✅ Accessible but becomes private
        pub_member = 2;   // ✅ Accessible but becomes private
    }
};
```

The inheritance specifier determines the maximum access level for inherited members—public inheritance preserves access levels, protected makes everything at most protected, and private makes everything private in the derived class.

#### Example 3: Struct as POD (Plain Old Data)

```cpp
// 1. POD basics: aggregate init + the two traits that define "POD"
#include <type_traits>
#include <cstddef>   // offsetof
#include <iostream>

struct Point { double x, y, z; };
struct Color { unsigned char r, g, b, a; };

int main() {
    Point p1 = {1.0, 2.0, 3.0};   // aggregate initialization — no constructor needed
    Color c1 = {255, 0, 0, 255};

    // A POD type is BOTH trivially copyable AND standard-layout:
    static_assert(std::is_trivially_copyable_v<Point>);  // -> bytes can be memcpy'd
    static_assert(std::is_standard_layout_v<Point>);     // -> C-compatible layout

    std::cout << "sizeof(Point)=" << sizeof(Point)        // 24 (3 * 8)
              << " offsetof(y)="  << offsetof(Point, y)   // 8
              << " sizeof(Color)="<< sizeof(Color) << "\n"; // 4 (packed, no padding)
    (void)p1; (void)c1;
}
```

```cpp
// 2. Trivial copy: because Point is trivially copyable, memcpy IS a valid copy
#include <cstring>
#include <cassert>
struct Point { double x, y, z; };

int main() {
    Point a = {1.0, 2.0, 3.0};
    Point b;
    std::memcpy(&b, &a, sizeof(Point));            // no constructor runs — pure byte copy
    assert(b.x == 1.0 && b.y == 2.0 && b.z == 3.0);

    Point cloud[3];
    std::memcpy(cloud, &a, sizeof(Point));         // same reason bulk copies are safe
}
```

```cpp
// 3. Memory mapping / serialization: struct <-> raw bytes
#include <cstring>
#include <cstdint>
#include <cassert>
struct Point { double x, y, z; };

int main() {
    Point p = {1.5, 2.5, 3.5};

    std::uint8_t buffer[sizeof(Point)];
    std::memcpy(buffer, &p, sizeof(Point));        // serialize: object -> raw bytes
    // buffer could now be written to a file, sent over a socket, or already BE
    // a memory-mapped region / an incoming network packet.

    Point restored;
    std::memcpy(&restored, buffer, sizeof(Point)); // deserialize: bytes -> object
    assert(restored.x == 1.5 && restored.z == 3.5);
}
```

```cpp
// 4. Safely casting raw bytes: memcpy / std::bit_cast (C++20) vs reinterpret_cast
#include <cstring>
#include <bit>       // std::bit_cast (C++20)
#include <cstdint>
struct Point { double x, y, z; };

Point fromBytes(const std::uint8_t* raw) {
    Point p;
    std::memcpy(&p, raw, sizeof(Point));   // SAFE: launders bytes, handles alignment
    return p;
}

int main() {
    Point p = {1, 2, 3};
    std::uint8_t raw[sizeof(Point)];
    std::memcpy(raw, &p, sizeof(Point));
    Point a = fromBytes(raw);

    std::uint64_t bits = std::bit_cast<std::uint64_t>(3.14); // SAFE reinterpret (C++20)
    double back = std::bit_cast<double>(bits);

    // RISKY: reinterpret_cast<Point*>(raw)->x is undefined behavior if 'raw' is
    // misaligned for double, and it violates strict aliasing. Prefer memcpy/bit_cast.
    (void)a; (void)back;
}
```

```cpp
// 5. C interoperability: identical layout, offsetof, pass a pointer to C code
#include <cstddef>
#include <cstdio>
struct Vec3 { double x, y, z; };            // byte-for-byte identical to a C struct

extern "C" void scale(Vec3* v, double k) {  // C linkage: callable from a C translation unit
    v->x *= k; v->y *= k; v->z *= k;
}

int main() {
    Vec3 v = {1, 2, 3};
    scale(&v, 2.0);                          // pass a pointer across the C boundary
    static_assert(offsetof(Vec3, x) == 0);
    static_assert(offsetof(Vec3, z) == 16);
    std::printf("%.1f %.1f %.1f\n", v.x, v.y, v.z);  // 2.0 4.0 6.0
}
```

```cpp
// 6. When it STOPS being POD: one virtual function breaks both guarantees
#include <type_traits>
struct PodPoint { double x, y, z; };
struct NotPod   { double x, y, z; virtual ~NotPod() {} };  // a vtable pointer sneaks in

int main() {
    static_assert(std::is_trivially_copyable_v<PodPoint>);
    static_assert(std::is_standard_layout_v<PodPoint>);
    static_assert(!std::is_trivially_copyable_v<NotPod>);  // memcpy would now be UB
    static_assert(!std::is_standard_layout_v<NotPod>);     // layout hides a vptr
    // sizeof(NotPod) > 3*sizeof(double) because of that hidden pointer.
}
```

A **POD (Plain Old Data)** struct is one that is both **trivially copyable** (no user-provided copy/move operations and a trivial destructor — the compiler-generated ones just move bytes; note a user-provided *default* constructor does not affect trivial copyability) and **standard-layout** (one access section, no virtual functions, C-compatible member ordering). That combination is what makes `Point` and `Color` special, and it unlocks three "superpowers":

1. **Trivial copy → `memcpy` (Block 2).** A byte-for-byte copy of a trivially-copyable object is a *valid* copy — no constructor needs to run. This is why PODs can be bulk-copied, `memset`, and stored in flat arrays cheaply.
2. **Standard layout → C interop & memory mapping (Blocks 3 and 5).** The struct's bytes are laid out exactly like the equivalent C struct, so you can share pointers with C libraries, and `offsetof` gives the exact byte offset of each field. That fixed layout is what lets you lay a struct directly over raw memory — a file buffer, a network packet, a memory-mapped file, or a hardware register.
3. **Safe reinterpretation (Block 4).** Reading fields through `reinterpret_cast<Point*>(buffer)` is tempting but **undefined behavior** if `buffer` is not correctly aligned for `double`, and it breaks strict aliasing. The safe tools are `std::memcpy` (copies the bytes into a real, correctly-aligned object) and, in C++20, `std::bit_cast` (a safe, `constexpr` reinterpretation for same-size trivially-copyable types).

**Caveats:** structs have **padding** for alignment, so `sizeof` may exceed the sum of the members — never assume packed layout; `offsetof` tells the truth. Raw bytes are only portable within the **same architecture/ABI** (watch **endianness** when sending data across machines). And the moment you add a virtual function, a custom copy constructor, or mix access specifiers (Block 6), the type stops being POD and every one of these tricks becomes undefined behavior. Structs remain ideal for simple data containers that need C compatibility, trivial copying, or memory-mapped I/O — they trade encapsulation for a predictable, copyable memory layout.

#### Example 4: Class with Proper Encapsulation

```cpp
class BankAccount {
private:
    double balance;
    string accountNumber;
    
    bool validateAmount(double amount) {
        return amount > 0;
    }
    
public:
    BankAccount(string accNum) : balance(0), accountNumber(accNum) {}
    
    bool deposit(double amount) {
        if (!validateAmount(amount)) return false;
        balance += amount;
        return true;
    }
    
    bool withdraw(double amount) {
        if (!validateAmount(amount) || amount > balance) return false;
        balance -= amount;
        return true;
    }
    
    double getBalance() const { return balance; }
};
```

This demonstrates proper use of a class: private data members ensure the balance can't be manipulated directly, and public methods provide controlled access with validation.

#### Example 5: Protected Members in Inheritance Hierarchies

```cpp
class Animal {
protected:
    string species;
    int age;
    
    void incrementAge() { age++; }
    
public:
    Animal(string s, int a) : species(s), age(a) {}
    virtual void makeSound() = 0;
    int getAge() const { return age; }
};

class Dog : public Animal {
public:
    Dog(int a) : Animal("Canine", a) {}
    
    void makeSound() override {
        cout << "Woof!" << endl;
    }
    
    void birthday() {
        incrementAge();  // ✅ Can access protected method
        cout << species << " is now " << age << endl;
    }
};
```

Protected members strike a balance between private (too restrictive for inheritance) and public (too permissive). They allow derived classes to access implementation details while hiding them from external code.

#### Example 6: Friend Function for Operator Overloading

```cpp
class Complex {
private:
    double real, imag;
    
public:
    Complex(double r, double i) : real(r), imag(i) {}
    
    // Friend function can access private members
    friend Complex operator+(const Complex& a, const Complex& b);
    friend ostream& operator<<(ostream& os, const Complex& c);
};

Complex operator+(const Complex& a, const Complex& b) {
    return Complex(a.real + b.real, a.imag + b.imag);  // ✅ Access private
}

ostream& operator<<(ostream& os, const Complex& c) {
    os << c.real << " + " << c.imag << "i";  // ✅ Access private
    return os;
}
```

Friend functions are commonly used for operator overloading when the operator needs symmetric access to private data of both operands.

#### Example 7: Access Control with Virtual Functions

```cpp
class Base {
public:
    virtual void publicVirtual() {
        cout << "Base::publicVirtual" << endl;
    }
    
protected:
    virtual void protectedVirtual() {
        cout << "Base::protectedVirtual" << endl;
    }
    
private:
    virtual void privateVirtual() {
        cout << "Base::privateVirtual" << endl;
    }
    
public:
    void callAll() {
        publicVirtual();
        protectedVirtual();
        privateVirtual();
    }
};

class Derived : public Base {
public:
    void publicVirtual() override {  // ✅ Can override public
        cout << "Derived::publicVirtual" << endl;
    }
    
protected:
    void protectedVirtual() override {  // ✅ Can override protected
        cout << "Derived::protectedVirtual" << endl;
    }
    
    // privateVirtual is private in Base, so Derived can't name/call it directly -
    // but it COULD still override it (see Edge Case 4). Omitted here only because it isn't called.
};
```

This shows that you can only override virtual functions you have access to, but all virtual functions participate in dynamic dispatch regardless of access level.

#### Example 8: Common Mistake - Forgetting Access Specifier in Class

```cpp
class Employee {
    string name;  // ❌ Private by default - common mistake
    int id;       // ❌ Private by default
public:
    void setName(string n) { name = n; }
};

// Better:
class Employee2 {
public:
    void setName(string n) { name = n; }
private:
    string name;  // ✅ Explicit and clear
    int id;
};
```

Always be explicit about access specifiers in classes to avoid confusion. Placing private members at the end is a common convention that improves readability.

#### Example 9: Autonomous Vehicle - Sensor Class Hierarchy

```cpp
#include <iostream>
#include <string>
using namespace std;

// Base sensor class with protected members for inheritance
class Sensor {
protected:
    string sensor_id;
    double sampling_rate_hz;
    bool is_calibrated;

public:
    Sensor(string id, double rate)
        : sensor_id(id), sampling_rate_hz(rate), is_calibrated(false) {}

    virtual ~Sensor() = default;
    virtual void readData() = 0;  // Pure virtual

    void calibrate() {
        cout << "Calibrating " << sensor_id << "..." << endl;
        is_calibrated = true;
    }

    bool isReady() const { return is_calibrated; }
    string getID() const { return sensor_id; }
};

// LiDAR sensor - public inheritance models "is-a" relationship
class LiDARSensor : public Sensor {
private:
    int num_beams;
    double max_range_m;

public:
    LiDARSensor(string id, int beams, double range)
        : Sensor(id, 10.0), num_beams(beams), max_range_m(range) {}

    void readData() override {
        if (!is_calibrated) {
            cout << "Error: LiDAR not calibrated!" << endl;
            return;
        }
        cout << "Reading " << num_beams << " beams from LiDAR "
             << sensor_id << " (range: " << max_range_m << "m)" << endl;
    }
};

// Camera sensor
class CameraSensor : public Sensor {
private:
    int resolution_width;
    int resolution_height;

public:
    CameraSensor(string id, int width, int height)
        : Sensor(id, 30.0),
          resolution_width(width), resolution_height(height) {}

    void readData() override {
        if (!is_calibrated) {
            cout << "Error: Camera not calibrated!" << endl;
            return;
        }
        cout << "Capturing " << resolution_width << "x" << resolution_height
             << " image from " << sensor_id << endl;
    }
};

int main() {
    // Demonstrate polymorphism with sensor array
    Sensor* sensors[] = {
        new LiDARSensor("lidar_front", 64, 100.0),
        new CameraSensor("cam_front", 1920, 1080),
        new LiDARSensor("lidar_rear", 32, 50.0)
    };

    // Calibrate all sensors
    for (int i = 0; i < 3; i++) {
        sensors[i]->calibrate();
    }

    // Read data from all sensors
    cout << "\nReading sensor data:" << endl;
    for (int i = 0; i < 3; i++) {
        sensors[i]->readData();
    }

    // Cleanup
    for (int i = 0; i < 3; i++) {
        delete sensors[i];
    }

    return 0;
}
```

This example demonstrates:
- **Protected members** (`sensor_id`, `is_calibrated`) accessible to derived classes
- **Public inheritance** modeling "is-a" relationships (LiDAR/Camera are Sensors)
- **Virtual functions** for polymorphic behavior
- **Abstract base class** (pure virtual `readData()`)
- **Encapsulation** of sensor-specific data (private members)

**Real-world relevance**: Autonomous vehicles use multiple sensor types that share common interfaces but have specific implementations. This design allows treating different sensors uniformly through polymorphism while maintaining type-specific behavior.

---

### QUICK_REFERENCE: Answer Key and Comparison Tables

#### Struct vs Class Comparison

| Feature | struct | class |
|---------|--------|-------|
| Default member access | public | private |
| Default inheritance mode | public | private |
| Can have constructors | Yes | Yes |
| Can have destructors | Yes | Yes |
| Can have virtual functions | Yes | Yes |
| Can be used as base | Yes | Yes |
| Typical use case | POD types, data containers | Encapsulated objects with behavior |
| Memory layout difference | None | None |

#### Inheritance Mode Effects

| Base Member | Public Inheritance | Protected Inheritance | Private Inheritance |
|-------------|-------------------|----------------------|---------------------|
| public | public | protected | private |
| protected | protected | protected | private |
| private | inaccessible | inaccessible | inaccessible |

#### Access Specifier Quick Reference

| Specifier | Accessible in Class | Accessible in Derived | Accessible Outside |
|-----------|---------------------|----------------------|-------------------|
| public | ✅ | ✅ | ✅ |
| protected | ✅ | ✅ | ❌ |
| private | ✅ | ❌ | ❌ |
