# C++ Cast Operators

## TOPIC: C++ Cast Operators and Type Casting Mechanisms

### THEORY_SECTION: Understanding C++ Cast Operators

C++ provides four type-safe cast operators to replace the unsafe and ambiguous C-style cast: `static_cast`, `dynamic_cast`, `const_cast`, and `reinterpret_cast`. Each serves a specific purpose and makes the programmer's intent explicit, enabling better compile-time checking and code clarity.

**static_cast** performs compile-time type conversions between related types, including numeric conversions, pointer conversions in inheritance hierarchies, and conversions to/from void pointers. It's the most commonly used cast and provides compile-time safety for well-defined conversions. Unlike C-style casts, static_cast refuses to cast away const or perform bitwise reinterpretation.

**dynamic_cast** provides runtime type checking for polymorphic types, safely downcasting or cross-casting pointers and references in inheritance hierarchies. It requires the base class to have at least one virtual function (enabling RTTI - Runtime Type Information). Failed casts return nullptr for pointers or throw std::bad_cast for references, making it the safest option for working with polymorphic hierarchies.

**const_cast** is the only cast that can add or remove const and volatile qualifiers. While necessary for interacting with legacy APIs or const-incorrect code, using const_cast to modify truly const objects results in undefined behavior. It should be used sparingly and only when you're certain the underlying object is actually mutable.

**reinterpret_cast** performs low-level bitwise reinterpretation of data, allowing conversions between unrelated pointer types or between pointers and integers. It's the most dangerous cast, platform-dependent, and can break strict aliasing rules. Use it only in systems programming, serialization, or when interfacing with hardware or legacy C code.

#### Why C-Style Casts Are Dangerous

C-style casts `(Type)value` are ambiguous because they can perform any combination of static_cast, const_cast, and reinterpret_cast operations in a single expression. The compiler tries these casts in sequence, and it's not clear which one will be used. This makes code harder to understand and can silently perform dangerous operations like casting away const or reinterpreting bits.

#### When to Use Each Cast

Use **static_cast** for most conversions: numeric types, safe pointer conversions in known hierarchies, and explicit type conversions. Use **dynamic_cast** when you need runtime type safety in polymorphic hierarchies. Use **const_cast** only to interface with const-incorrect APIs when you know the object is actually mutable. Use **reinterpret_cast** only for low-level operations like pointer-to-integer conversions or when working with hardware addresses.

### EDGE_CASES: Tricky Scenarios and Undefined Behavior

#### Edge Case 1: static_cast Downcast Without Runtime Check

static_cast can downcast pointers in an inheritance hierarchy, but it performs **no runtime checking**. If the object isn't actually of the derived type, behavior is undefined.

```cpp
#include <iostream>

struct Base {
    virtual ~Base() { }
    int base_val = 10;
};

struct Derived : Base {
    int derived_val = 20;
};

int main() {
    Base* b1 = new Derived();
    Derived* d1 = static_cast<Derived*>(b1);  // ✅ Safe - actually Derived
    std::cout << d1->derived_val << "\n";      // 20
    
    Base* b2 = new Base();
    Derived* d2 = static_cast<Derived*>(b2);   // ❌ UB - not actually Derived!
    // std::cout << d2->derived_val << "\n";   // Undefined behavior
}
```

This demonstrates why static_cast downcasts are dangerous without additional knowledge. Always prefer dynamic_cast when the object's actual type is uncertain.

#### Edge Case 2: dynamic_cast Requires Polymorphic Types

dynamic_cast only works with polymorphic types (classes with at least one virtual function). Without virtual functions, it won't compile.

```cpp
struct NonPolymorphic {
    int value;
};

struct PolymorphicBase {
    virtual ~PolymorphicBase() { }
    int value;
};

struct DerivedPoly : PolymorphicBase { };

int main() {
    NonPolymorphic* np = new NonPolymorphic();
    // auto* x = dynamic_cast<NonPolymorphic*>(np);  // ❌ Compile error
    
    PolymorphicBase* pb = new DerivedPoly();
    auto* dp = dynamic_cast<DerivedPoly*>(pb);        // ✅ OK - polymorphic
}
```

The requirement for virtual functions ensures RTTI is available for runtime type checking. Without it, dynamic_cast cannot verify types.

#### Edge Case 3: dynamic_cast with References Throws Exception

When dynamic_cast fails on a reference (as opposed to a pointer), it throws std::bad_cast instead of returning nullptr.

```cpp
#include <iostream>
#include <typeinfo>

struct Base {
    virtual ~Base() { }
};

struct Derived : Base { };

int main() {
    Base b;
    
    try {
        Derived& d = dynamic_cast<Derived&>(b);  // Throws std::bad_cast
    } catch (const std::bad_cast& e) {
        std::cout << "Cast failed: " << e.what() << "\n";
    }
    
    Base* pb = &b;
    Derived* pd = dynamic_cast<Derived*>(pb);    // Returns nullptr (no throw)
    if (!pd) {
        std::cout << "Pointer cast failed\n";
    }
}
```

The different failure modes (exception vs nullptr) reflect the fact that references cannot be null, so there's no way to signal failure except through exceptions.

#### Edge Case 4: const_cast on Actually Const Objects

Using const_cast to modify an object that was originally declared const leads to undefined behavior, even if the code compiles.

```cpp
#include <iostream>

void modifyValue(const int* ptr) {
    int* mutable_ptr = const_cast<int*>(ptr);
    *mutable_ptr = 100;  // May work or may crash
}

int main() {
    const int truly_const = 42;
    modifyValue(&truly_const);  // ❌ Undefined behavior
    
    // Compiler may place truly_const in read-only memory
    // Attempting to modify causes a segmentation fault on many platforms
    
    int originally_mutable = 50;
    const int* ptr = &originally_mutable;
    modifyValue(ptr);  // ✅ OK - object wasn't originally const
    std::cout << originally_mutable << "\n";  // 100
}
```

The undefined behavior occurs because the compiler may optimize based on const-correctness, potentially placing const objects in read-only memory sections or caching their values.

#### Edge Case 5: reinterpret_cast and Strict Aliasing

reinterpret_cast can violate the strict aliasing rule, which states that an object of one type shouldn't be accessed through a pointer of an unrelated type.

```cpp
#include <iostream>
#include <cstdint>

int main() {
    float f = 3.14f;
    
    // ❌ Violates strict aliasing - undefined behavior
    int* ip = reinterpret_cast<int*>(&f);
    std::cout << *ip << "\n";  // Reading float bits as int - UB
    
    // ✅ Correct way: use memcpy or type punning with union (C++20)
    int i;
    std::memcpy(&i, &f, sizeof(float));
    std::cout << i << "\n";  // Safe way to read bit pattern
}
```

Modern compilers aggressively optimize based on strict aliasing, so violating it can lead to unexpected results where the compiler assumes memory won't change in ways it doesn't track.

#### Edge Case 6: reinterpret_cast Pointer Arithmetic and Alignment

reinterpret_cast doesn't adjust pointer values for different object sizes or alignment requirements, potentially causing misaligned access.

```cpp
#include <iostream>
#include <cstdint>

struct SmallStruct {
    char c;
};

struct LargeStruct {
    double d;
    int i;
};

int main() {
    SmallStruct s;
    
    // ❌ Dangerous - LargeStruct* assumes 16-byte aligned, may not be
    LargeStruct* lp = reinterpret_cast<LargeStruct*>(&s);
    // lp->d = 3.14;  // May cause misaligned access - UB
    
    // Pointer-to-integer must use wide enough type
    std::uintptr_t addr = reinterpret_cast<std::uintptr_t>(&s);  // ✅ Safe
    // int wrong = reinterpret_cast<int>(&s);  // ❌ May truncate on 64-bit
}
```

Misaligned access can cause crashes on some architectures (like older ARM) or performance penalties on others (x86 handles it but slower).

#### Edge Case 7: static_cast vs reinterpret_cast with void*

static_cast can convert to/from void* safely with type information preserved, while reinterpret_cast is more dangerous and loses type safety.

```cpp
#include <iostream>

int main() {
    int x = 42;
    
    // ✅ static_cast: type-safe roundtrip
    void* vp1 = static_cast<void*>(&x);
    int* ip1 = static_cast<int*>(vp1);
    std::cout << *ip1 << "\n";  // 42
    
    // ✅ reinterpret_cast: works but less safe
    void* vp2 = reinterpret_cast<void*>(&x);
    int* ip2 = reinterpret_cast<int*>(vp2);
    std::cout << *ip2 << "\n";  // 42
    
    // ❌ Dangerous: wrong type conversion
    float* fp = reinterpret_cast<float*>(vp2);
    std::cout << *fp << "\n";  // Interprets int bits as float - UB
}
```

With void*, both casts work for correct type roundtrips, but static_cast is preferred because it conveys intent better and works with more type checking.

#### Edge Case 8: Multiple Inheritance and Pointer Adjustment

static_cast properly adjusts pointer offsets for multiple inheritance, while reinterpret_cast does not, leading to incorrect addresses.

```cpp
#include <iostream>

struct A {
    int a = 1;
    virtual ~A() { }
};

struct B {
    int b = 2;
    virtual ~B() { }
};

struct C : A, B {
    int c = 3;
};

int main() {
    C obj;
    C* cp = &obj;
    
    // ✅ static_cast adjusts pointer offset
    B* bp1 = static_cast<B*>(cp);
    std::cout << "B value: " << bp1->b << "\n";  // 2
    
    // ❌ reinterpret_cast doesn't adjust - wrong address!
    B* bp2 = reinterpret_cast<B*>(cp);
    std::cout << "Wrong B: " << bp2->b << "\n";  // Undefined behavior
}
```

With multiple inheritance, derived class objects have subobjects of each base class at different memory offsets. static_cast knows about this and adjusts pointers; reinterpret_cast blindly reinterprets the address.

#### Edge Case 9: Cross-Casting with dynamic_cast

dynamic_cast can perform **cross-casts** between sibling classes in an inheritance hierarchy, something static_cast cannot do.

```cpp
#include <iostream>

struct Base {
    virtual ~Base() { }
};

struct Derived1 : Base {
    void func1() { std::cout << "Derived1\n"; }
};

struct Derived2 : Base {
    void func2() { std::cout << "Derived2\n"; }
};

int main() {
    Derived1 d1;
    Base* bp = &d1;
    
    // ❌ static_cast cannot cross-cast (compile error)
    // Derived2* d2_ptr = static_cast<Derived2*>(bp);
    
    // ✅ dynamic_cast safely returns nullptr for invalid cross-cast
    Derived2* d2_ptr = dynamic_cast<Derived2*>(bp);
    if (!d2_ptr) {
        std::cout << "Cross-cast failed (expected)\n";
    }
    
    // ✅ Cast to actual type succeeds
    Derived1* d1_ptr = dynamic_cast<Derived1*>(bp);
    if (d1_ptr) {
        d1_ptr->func1();
    }
}
```

Cross-casting is useful in complex hierarchies, especially with multiple inheritance or virtual inheritance, where you need to navigate between different parts of an object's hierarchy.

#### Edge Case 10: Casting Function Pointers

reinterpret_cast can cast between function pointer types, but calling through an incorrect function pointer type is undefined behavior.

```cpp
#include <iostream>

void funcInt(int x) {
    std::cout << "funcInt: " << x << "\n";
}

void funcDouble(double d) {
    std::cout << "funcDouble: " << d << "\n";
}

int main() {
    void (*fp_int)(int) = &funcInt;
    
    // ❌ Dangerous: casting function pointer to incompatible type
    void (*fp_double)(double) = reinterpret_cast<void(*)(double)>(fp_int);
    
    // fp_double(3.14);  // ❌ Undefined behavior - calling through wrong type
    
    // ✅ Cast back to correct type before calling
    void (*fp_back)(int) = reinterpret_cast<void(*)(int)>(fp_double);
    fp_back(42);  // OK
}
```

Function pointer casts are sometimes needed for callbacks or legacy APIs, but the function must be called through its original signature to avoid undefined behavior.

### CODE_EXAMPLES: Practical Demonstrations

#### Example 1: Safe Numeric Conversion with static_cast

```cpp
#include <iostream>
#include <limits>

int main() {
    // Integer to floating-point (always safe)
    int i = 42;
    double d = static_cast<double>(i);
    std::cout << "int to double: " << d << "\n";  // 42.0
    
    // Floating-point to integer (truncates)
    double pi = 3.14159;
    int truncated = static_cast<int>(pi);
    std::cout << "double to int: " << truncated << "\n";  // 3
    
    // Potential overflow warning
    double large = 1e100;
    int overflow = static_cast<int>(large);  // ❌ Undefined if out of range
    std::cout << "overflow: " << overflow << "\n";  // Undefined result
}
```

static_cast makes numeric conversions explicit and visible. While it doesn't prevent narrowing or overflow, it signals that the conversion is intentional, unlike silent implicit conversions.

#### Example 2: Safe Downcasting with dynamic_cast

```cpp
#include <iostream>
#include <vector>
#include <memory>

struct Animal {
    virtual ~Animal() { }
    virtual void makeSound() = 0;
};

struct Dog : Animal {
    void makeSound() override { std::cout << "Woof!\n"; }
    void fetch() { std::cout << "Fetching ball!\n"; }
};

struct Cat : Animal {
    void makeSound() override { std::cout << "Meow!\n"; }
    void scratch() { std::cout << "Scratching furniture!\n"; }
};

void interact(Animal* animal) {
    animal->makeSound();
    
    // Try to downcast to Dog
    if (Dog* dog = dynamic_cast<Dog*>(animal)) {
        dog->fetch();
    }
    // Try to downcast to Cat
    else if (Cat* cat = dynamic_cast<Cat*>(animal)) {
        cat->scratch();
    }
}

int main() {
    std::vector<Animal*> animals = {
        new Dog(),
        new Cat(),
        new Dog()
    };
    
    for (Animal* animal : animals) {
        interact(animal);
        delete animal;
    }
}
```

This pattern is common when working with polymorphic hierarchies where you need type-specific behavior. dynamic_cast provides safe type identification without crashes.

#### Example 3: Interfacing with Legacy C APIs Using const_cast

```cpp
#include <iostream>
#include <cstring>

// Legacy C function that doesn't modify data but isn't marked const
extern "C" void legacy_process(char* data) {
    // Function only reads data but signature is wrong
    std::cout << "Processing: " << data << "\n";
}

void modern_function(const char* data) {
    // We know legacy_process won't modify data despite signature
    legacy_process(const_cast<char*>(data));
}

int main() {
    const char* message = "Hello, World!";
    modern_function(message);  // Safe because legacy_process only reads
}
```

This is the primary legitimate use case for const_cast: interfacing with const-incorrect APIs where you have external knowledge that the function won't actually modify the data.

#### Example 4: Pointer-to-Integer Conversion with reinterpret_cast

```cpp
#include <iostream>
#include <cstdint>

int main() {
    int value = 42;
    int* ptr = &value;
    
    // Convert pointer to integer (must use uintptr_t for portability)
    std::uintptr_t addr = reinterpret_cast<std::uintptr_t>(ptr);
    std::cout << "Address: 0x" << std::hex << addr << "\n";
    
    // Convert back to pointer
    int* restored = reinterpret_cast<int*>(addr);
    std::cout << "Value: " << std::dec << *restored << "\n";  // 42
    
    // Use case: storing pointers in hash tables or for alignment checks
    if (addr % sizeof(int) == 0) {
        std::cout << "Pointer is properly aligned\n";
    }
}
```

Pointer-to-integer conversions are useful for debugging, logging addresses, implementing custom memory allocators, or checking alignment. Always use std::uintptr_t for portability across 32-bit and 64-bit systems.

#### Example 5: Upcast and Downcast Comparison

```cpp
#include <iostream>

struct Base {
    virtual ~Base() { }
    void baseMethod() { std::cout << "Base method\n"; }
};

struct Derived : Base {
    void derivedMethod() { std::cout << "Derived method\n"; }
};

int main() {
    Derived d;
    
    // ✅ Upcast (always safe, implicit)
    Base* bp1 = &d;                     // Implicit
    Base* bp2 = static_cast<Base*>(&d); // Explicit (unnecessary)
    bp1->baseMethod();
    
    // ✅ Downcast with dynamic_cast (runtime check)
    Base* bp3 = new Derived();
    if (Derived* dp1 = dynamic_cast<Derived*>(bp3)) {
        dp1->derivedMethod();  // Safe
    }
    
    // ❌ Downcast with static_cast (no check, dangerous)
    Base* bp4 = new Base();  // Not actually Derived!
    Derived* dp2 = static_cast<Derived*>(bp4);  // Compiles but wrong
    // dp2->derivedMethod();  // ❌ Undefined behavior
    
    delete bp3;
    delete bp4;
}
```

This example shows the key difference: upcasts are always safe (derived IS-A base), while downcasts need runtime checking (base might not actually be derived).

#### Example 6: Bit Pattern Inspection with reinterpret_cast

```cpp
#include <iostream>
#include <iomanip>
#include <cstring>

void printBytes(const void* ptr, size_t size) {
    const unsigned char* bytes = static_cast<const unsigned char*>(ptr);
    for (size_t i = 0; i < size; ++i) {
        std::cout << std::hex << std::setfill('0') << std::setw(2)
                  << static_cast<int>(bytes[i]) << " ";
    }
    std::cout << std::dec << "\n";
}

int main() {
    float f = 3.14f;
    int i = 42;
    double d = 2.71828;
    
    std::cout << "Float bit pattern: ";
    printBytes(&f, sizeof(f));
    
    std::cout << "Int bit pattern: ";
    printBytes(&i, sizeof(i));
    
    std::cout << "Double bit pattern: ";
    printBytes(&d, sizeof(d));
    
    // ✅ Safe way to reinterpret without aliasing issues
    int float_bits;
    std::memcpy(&float_bits, &f, sizeof(f));
    std::cout << "Float as int: " << float_bits << "\n";
}
```

This demonstrates how to inspect bit patterns safely without violating strict aliasing. memcpy is the portable way to reinterpret bits.

#### Example 7: Virtual Inheritance and dynamic_cast

```cpp
#include <iostream>

struct Base {
    virtual ~Base() { }
    int base_value = 10;
};

struct MiddleA : virtual Base {
    int middle_a = 20;
};

struct MiddleB : virtual Base {
    int middle_b = 30;
};

struct Derived : MiddleA, MiddleB {
    int derived_value = 40;
};

int main() {
    Derived d;
    
    // With virtual inheritance, Base appears only once in Derived
    Base* bp = static_cast<Base*>(&d);
    
    // ✅ dynamic_cast can navigate virtual inheritance
    MiddleA* ma = dynamic_cast<MiddleA*>(bp);
    if (ma) {
        std::cout << "Cast to MiddleA succeeded: " << ma->middle_a << "\n";
    }
    
    // ✅ Cross-cast through virtual base
    MiddleB* mb = dynamic_cast<MiddleB*>(ma);
    if (mb) {
        std::cout << "Cross-cast to MiddleB succeeded: " << mb->middle_b << "\n";
    }
}
```

Virtual inheritance creates complex object layouts where dynamic_cast's runtime type information is essential for navigating the hierarchy correctly.

#### Example 8: const_cast for Implementing Logical Constness

```cpp
#include <iostream>
#include <string>

class Database {
    mutable bool cache_valid = false;
    mutable std::string cached_data;
    
    void updateCache() const {
        // Mutable members allow modification in const methods
        cached_data = "Expensive query result";
        cache_valid = true;
    }
    
public:
    // Const method that maintains logical constness through caching
    const std::string& getData() const {
        if (!cache_valid) {
            updateCache();  // OK - modifies mutable members
        }
        return cached_data;
    }
    
    // Alternative without mutable: use const_cast (less clean)
    const std::string& getData_alternative() const {
        if (!cache_valid) {
            Database* mutable_this = const_cast<Database*>(this);
            mutable_this->cached_data = "Query result";
            mutable_this->cache_valid = true;
        }
        return cached_data;
    }
};

int main() {
    const Database db;
    std::cout << db.getData() << "\n";  // Caches internally despite const
}
```

This shows the concept of **logical constness** where the observable state doesn't change even though internal state (caches) may be modified. Using `mutable` is cleaner than const_cast for this pattern.

#### Example 9: Autonomous Vehicle - Sensor Hardware Integration with Cast Operators

This comprehensive example demonstrates all four C++ cast operators in a real autonomous vehicle sensor processing context, showing hardware interfacing, type-safe downcasting, legacy C API integration, and direct memory access.

```cpp
#include <iostream>
#include <vector>
#include <memory>
#include <cstdint>
#include <cstring>
#include <iomanip>

// ============================================================================
// Part 1: Polymorphic Sensor Hierarchy (dynamic_cast, static_cast)
// ============================================================================

class Sensor {
protected:
    std::string sensor_id;
    bool is_initialized;
    uint64_t timestamp_ns;

public:
    Sensor(const std::string& id)
        : sensor_id(id), is_initialized(false), timestamp_ns(0) {}

    virtual ~Sensor() = default;

    virtual void readData() = 0;
    virtual std::string getType() const = 0;

    const std::string& getID() const { return sensor_id; }
    bool isInitialized() const { return is_initialized; }
    uint64_t getTimestamp() const { return timestamp_ns; }
};

class LiDARSensor : public Sensor {
    int num_beams;
    double max_range_m;
    std::vector<double> point_cloud;

public:
    LiDARSensor(const std::string& id, int beams, double range)
        : Sensor(id), num_beams(beams), max_range_m(range) {}

    void readData() override {
        point_cloud.clear();
        for (int i = 0; i < 10; ++i) {  // Simulate reading
            point_cloud.push_back(static_cast<double>(i) * 0.5);
        }
        is_initialized = true;
        timestamp_ns = 1000000000ULL;  // Simulated timestamp
    }

    std::string getType() const override { return "LiDAR"; }

    const std::vector<double>& getPointCloud() const { return point_cloud; }
    int getBeamCount() const { return num_beams; }
};

class CameraSensor : public Sensor {
    int width, height;
    std::vector<uint8_t> image_data;

public:
    CameraSensor(const std::string& id, int w, int h)
        : Sensor(id), width(w), height(h) {}

    void readData() override {
        image_data.resize(width * height, 128);  // Gray image
        is_initialized = true;
        timestamp_ns = 1000000000ULL;
    }

    std::string getType() const override { return "Camera"; }

    int getWidth() const { return width; }
    int getHeight() const { return height; }
    const std::vector<uint8_t>& getImageData() const { return image_data; }
};

class IMUSensor : public Sensor {
    double accel_x, accel_y, accel_z;
    double gyro_x, gyro_y, gyro_z;

public:
    IMUSensor(const std::string& id) : Sensor(id) {}

    void readData() override {
        accel_x = 0.1; accel_y = 0.05; accel_z = 9.81;
        gyro_x = 0.001; gyro_y = -0.002; gyro_z = 0.0005;
        is_initialized = true;
        timestamp_ns = 1000000000ULL;
    }

    std::string getType() const override { return "IMU"; }

    void getAcceleration(double& x, double& y, double& z) const {
        x = accel_x; y = accel_y; z = accel_z;
    }
};

// ============================================================================
// Part 2: Hardware Memory-Mapped Registers (reinterpret_cast)
// ============================================================================

// Simulated hardware register layout for sensor controller
struct SensorControllerRegisters {
    volatile uint32_t control;       // Offset 0x00: Control register
    volatile uint32_t status;        // Offset 0x04: Status register
    volatile uint32_t data_addr;     // Offset 0x08: Data buffer address
    volatile uint32_t data_length;   // Offset 0x0C: Data length
};

class HardwareInterface {
    void* hw_base_address;  // Simulated hardware address
    SensorControllerRegisters dummy_registers;  // For simulation

public:
    HardwareInterface() {
        // In real code, hw_base_address would be mapped from physical memory
        // For simulation, we use our dummy registers
        hw_base_address = &dummy_registers;

        // Initialize dummy registers
        dummy_registers.control = 0;
        dummy_registers.status = 0x1;  // Ready status
        dummy_registers.data_addr = 0;
        dummy_registers.data_length = 0;
    }

    // Use reinterpret_cast to access memory-mapped hardware registers
    void initializeController() {
        std::cout << "\n=== Hardware Register Access (reinterpret_cast) ===\n";

        // reinterpret_cast: treating memory as hardware register structure
        SensorControllerRegisters* regs =
            reinterpret_cast<SensorControllerRegisters*>(hw_base_address);

        std::cout << "Hardware base address: 0x" << std::hex
                  << reinterpret_cast<uintptr_t>(hw_base_address) << std::dec << "\n";

        // Write to control register to initialize hardware
        regs->control = 0x01;  // Enable bit
        std::cout << "Control register: 0x" << std::hex << regs->control << std::dec << "\n";
        std::cout << "Status register: 0x" << std::hex << regs->status << std::dec << "\n";
    }

    // Convert pointer to integer for address calculation/alignment checks
    void checkAlignment() {
        std::cout << "\n=== Pointer-to-Integer Conversion (reinterpret_cast) ===\n";

        // reinterpret_cast: pointer → integer for address arithmetic
        uintptr_t addr = reinterpret_cast<uintptr_t>(hw_base_address);

        std::cout << "Address: 0x" << std::hex << addr << std::dec << "\n";
        std::cout << "Aligned to 4 bytes: " << ((addr % 4 == 0) ? "Yes" : "No") << "\n";
        std::cout << "Aligned to 8 bytes: " << ((addr % 8 == 0) ? "Yes" : "No") << "\n";
    }
};

// ============================================================================
// Part 3: Legacy C API Integration (const_cast)
// ============================================================================

// Legacy C function that doesn't use const (const-incorrect signature)
extern "C" void legacy_sensor_log(char* sensor_name, char* message) {
    // This function only reads the strings but signature lacks const
    std::cout << "[Legacy Log] Sensor: " << sensor_name
              << ", Message: " << message << "\n";
}

class LegacyAPIBridge {
public:
    static void logSensorData(const std::string& sensor_name,
                              const std::string& message) {
        std::cout << "\n=== Legacy C API Integration (const_cast) ===\n";

        // const_cast: Remove const to interface with const-incorrect legacy API
        // Safe because legacy_sensor_log only reads the data
        char* name_ptr = const_cast<char*>(sensor_name.c_str());
        char* msg_ptr = const_cast<char*>(message.c_str());

        legacy_sensor_log(name_ptr, msg_ptr);

        std::cout << "Successfully called legacy API with const data\n";
    }
};

// ============================================================================
// Part 4: Safe Type Punning for Bit Inspection (memcpy, not reinterpret_cast)
// ============================================================================

class BitPatternInspector {
public:
    static void inspectFloatBits(float value) {
        std::cout << "\n=== Safe Bit Pattern Inspection ===\n";
        std::cout << "Float value: " << value << "\n";

        // ❌ WRONG: reinterpret_cast violates strict aliasing
        // int* wrong_ptr = reinterpret_cast<int*>(&value);
        // int wrong_bits = *wrong_ptr;  // Undefined behavior!

        // ✅ CORRECT: Use memcpy for type punning (avoids strict aliasing)
        uint32_t bits;
        std::memcpy(&bits, &value, sizeof(value));

        std::cout << "Bit pattern: 0x" << std::hex << std::setfill('0')
                  << std::setw(8) << bits << std::dec << "\n";

        // Extract IEEE 754 components
        uint32_t sign = (bits >> 31) & 0x1;
        uint32_t exponent = (bits >> 23) & 0xFF;
        uint32_t mantissa = bits & 0x7FFFFF;

        std::cout << "Sign: " << sign << "\n";
        std::cout << "Exponent: " << exponent << " (biased)\n";
        std::cout << "Mantissa: 0x" << std::hex << mantissa << std::dec << "\n";
    }
};

// ============================================================================
// Part 5: Sensor Manager with Safe Downcasting (dynamic_cast vs static_cast)
// ============================================================================

class SensorManager {
    std::vector<std::shared_ptr<Sensor>> sensors;

public:
    void addSensor(std::shared_ptr<Sensor> sensor) {
        sensors.push_back(sensor);
    }

    void processAllSensors() {
        std::cout << "\n=== Safe Polymorphic Downcasting (dynamic_cast) ===\n";

        for (auto& sensor : sensors) {
            sensor->readData();
            std::cout << "\nProcessing " << sensor->getType()
                      << " sensor: " << sensor->getID() << "\n";

            // dynamic_cast: Safe runtime type checking for downcasting
            if (LiDARSensor* lidar = dynamic_cast<LiDARSensor*>(sensor.get())) {
                std::cout << "  LiDAR-specific: " << lidar->getBeamCount()
                          << " beams, " << lidar->getPointCloud().size()
                          << " points\n";
            }
            else if (CameraSensor* camera = dynamic_cast<CameraSensor*>(sensor.get())) {
                std::cout << "  Camera-specific: " << camera->getWidth()
                          << "x" << camera->getHeight() << " pixels\n";
            }
            else if (IMUSensor* imu = dynamic_cast<IMUSensor*>(sensor.get())) {
                double ax, ay, az;
                imu->getAcceleration(ax, ay, az);
                std::cout << "  IMU-specific: Accel(" << ax << ", "
                          << ay << ", " << az << ") m/s²\n";
            }
        }
    }

    // Demonstrate difference between static_cast and dynamic_cast
    void demonstrateCastDifference() {
        std::cout << "\n=== static_cast vs dynamic_cast Comparison ===\n";

        // Create base pointer to derived object
        Sensor* sensor = new LiDARSensor("lidar_test", 64, 100.0);
        sensor->readData();

        // ✅ dynamic_cast: Runtime check, safe
        LiDARSensor* lidar1 = dynamic_cast<LiDARSensor*>(sensor);
        if (lidar1) {
            std::cout << "dynamic_cast succeeded: " << lidar1->getBeamCount()
                      << " beams\n";
        } else {
            std::cout << "dynamic_cast failed (returned nullptr)\n";
        }

        // ✅ static_cast: No runtime check, faster but only safe if type is known
        LiDARSensor* lidar2 = static_cast<LiDARSensor*>(sensor);
        std::cout << "static_cast (no check): " << lidar2->getBeamCount()
                  << " beams\n";

        // Now try with wrong type
        Sensor* base_sensor = new IMUSensor("imu_test");
        base_sensor->readData();

        // ✅ dynamic_cast: Safely returns nullptr for wrong type
        LiDARSensor* wrong1 = dynamic_cast<LiDARSensor*>(base_sensor);
        if (!wrong1) {
            std::cout << "dynamic_cast correctly returned nullptr (IMU is not LiDAR)\n";
        }

        // ❌ static_cast: No check, would be undefined behavior if used
        // LiDARSensor* wrong2 = static_cast<LiDARSensor*>(base_sensor);
        // Using wrong2 would be undefined behavior!
        std::cout << "static_cast would compile but cause UB if used incorrectly\n";

        delete sensor;
        delete base_sensor;
    }
};

// ============================================================================
// Main: Demonstrating All Cast Operators in Autonomous Vehicle Context
// ============================================================================

int main() {
    std::cout << "=== Autonomous Vehicle Sensor System: C++ Cast Operators ===\n";

    // 1. Polymorphic sensor management with dynamic_cast
    SensorManager manager;
    manager.addSensor(std::make_shared<LiDARSensor>("lidar_front", 64, 100.0));
    manager.addSensor(std::make_shared<CameraSensor>("camera_front", 1920, 1080));
    manager.addSensor(std::make_shared<IMUSensor>("imu_main"));

    manager.processAllSensors();
    manager.demonstrateCastDifference();

    // 2. Hardware memory-mapped register access with reinterpret_cast
    HardwareInterface hw_interface;
    hw_interface.initializeController();
    hw_interface.checkAlignment();

    // 3. Legacy C API integration with const_cast
    LegacyAPIBridge::logSensorData("LiDAR-Front", "Point cloud captured successfully");

    // 4. Safe bit pattern inspection for sensor data analysis
    BitPatternInspector::inspectFloatBits(9.81f);  // Gravity constant

    // 5. Demonstrate numeric conversions with static_cast
    std::cout << "\n=== Numeric Conversions (static_cast) ===\n";
    double sensor_temp_celsius = 45.7;
    int temp_rounded = static_cast<int>(sensor_temp_celsius);
    std::cout << "Sensor temperature: " << sensor_temp_celsius
              << "°C → " << temp_rounded << "°C (truncated)\n";

    // ADC reading: 12-bit value (0-4095) to voltage (0-5V)
    uint16_t adc_raw = 2048;
    double voltage = static_cast<double>(adc_raw) * (5.0 / 4095.0);
    std::cout << "ADC reading: " << adc_raw << " → " << voltage << "V\n";

    std::cout << "\n=== Summary: When to Use Each Cast ===\n";
    std::cout << "1. static_cast:       Numeric conversions, safe upcasts, known downcasts\n";
    std::cout << "2. dynamic_cast:      Safe polymorphic downcasting with runtime checks\n";
    std::cout << "3. const_cast:        Remove const for legacy API (use sparingly)\n";
    std::cout << "4. reinterpret_cast:  Hardware registers, pointer↔integer conversions\n";
    std::cout << "5. memcpy:            Safe bit-pattern inspection (not a cast, but essential)\n";

    return 0;
}
```

**Output:**
```
=== Autonomous Vehicle Sensor System: C++ Cast Operators ===

=== Safe Polymorphic Downcasting (dynamic_cast) ===

Processing LiDAR sensor: lidar_front
  LiDAR-specific: 64 beams, 10 points

Processing Camera sensor: camera_front
  Camera-specific: 1920x1080 pixels

Processing IMU sensor: imu_main
  IMU-specific: Accel(0.1, 0.05, 9.81) m/s²

=== static_cast vs dynamic_cast Comparison ===
dynamic_cast succeeded: 64 beams
static_cast (no check): 64 beams
dynamic_cast correctly returned nullptr (IMU is not LiDAR)
static_cast would compile but cause UB if used incorrectly

=== Hardware Register Access (reinterpret_cast) ===
Hardware base address: 0x7ffc8b3a1a20
Control register: 0x1
Status register: 0x1

=== Pointer-to-Integer Conversion (reinterpret_cast) ===
Address: 0x7ffc8b3a1a20
Aligned to 4 bytes: Yes
Aligned to 8 bytes: Yes

=== Legacy C API Integration (const_cast) ===
[Legacy Log] Sensor: LiDAR-Front, Message: Point cloud captured successfully
Successfully called legacy API with const data

=== Safe Bit Pattern Inspection ===
Float value: 9.81
Bit pattern: 0x411d70a4
Sign: 0
Exponent: 130 (biased)
Mantissa: 0x1d70a4

=== Numeric Conversions (static_cast) ===
Sensor temperature: 45.7°C → 45°C (truncated)
ADC reading: 2048 → 2.500305V

=== Summary: When to Use Each Cast ===
1. static_cast:       Numeric conversions, safe upcasts, known downcasts
2. dynamic_cast:      Safe polymorphic downcasting with runtime checks
3. const_cast:        Remove const for legacy API (use sparingly)
4. reinterpret_cast:  Hardware registers, pointer↔integer conversions
5. memcpy:            Safe bit-pattern inspection (not a cast, but essential)
```

**Real-World Applications:**

1. **dynamic_cast** - Essential for sensor management where you receive a base `Sensor*` pointer but need to access derived class functionality (LiDAR point clouds, camera images, IMU readings). The runtime type checking prevents crashes from incorrect type assumptions.

2. **static_cast** - Used for ADC conversions (raw 12-bit values → voltage → physical units), temperature unit conversions, and safe upcasting in the sensor hierarchy. When the type is known at compile time, static_cast provides zero-overhead conversions.

3. **const_cast** - Required when integrating with legacy automotive C libraries that lack proper const-correctness in their APIs. Many automotive safety standards (MISRA-C) now require const-correctness, but older code may not comply.

4. **reinterpret_cast** - Critical for accessing memory-mapped hardware registers (common in automotive ECUs - Electronic Control Units), checking pointer alignment requirements for DMA transfers, and converting between pointers and addresses for hardware debugging.

5. **memcpy (not a cast)** - The safe way to inspect bit patterns of sensor data (floats, doubles) without violating strict aliasing rules. Essential for implementing custom serialization or analyzing floating-point sensor readings at the bit level.

**Key Safety Principles:**
- **Always use dynamic_cast** when downcasting unless you're absolutely certain of the type and have profiling data showing it's a bottleneck
- **Never use reinterpret_cast** for type punning (accessing one type through a pointer to another) - use memcpy instead
- **Only use const_cast** when interfacing with const-incorrect APIs and you're certain the function won't modify the data
- **Prefer static_cast** for explicit conversions between related types (numeric, inheritance)
- **Avoid C-style casts** - they hide which operation is being performed and can silently do dangerous things

This example comprehensively demonstrates how all four C++ cast operators are used in production autonomous vehicle software, from high-level sensor polymorphism to low-level hardware interfacing.

### INTERVIEW_QA: Comprehensive Questions

#### Q1: What is the difference between C-style casts and C++ cast operators?
**Difficulty:** #beginner  
**Category:** #cast_operators #best_practice  
**Concepts:** #static_cast #c_style_cast #type_safety

**Answer:**
C-style casts `(Type)value` are ambiguous and can perform static_cast, const_cast, and reinterpret_cast in sequence, while C++ cast operators (`static_cast`, `dynamic_cast`, `const_cast`, `reinterpret_cast`) make intent explicit and enable compile-time checking.

**Code example:**
```cpp
double d = 3.14;
int i1 = (int)d;                  // ❌ C-style: unclear intent
int i2 = static_cast<int>(d);     // ✅ C++: explicit conversion

const int* cp = &i2;
int* p1 = (int*)cp;               // ❌ C-style: silently removes const
int* p2 = const_cast<int*>(cp);   // ✅ C++: explicit const removal
```

**Explanation:**
C-style casts can hide dangerous operations and make code harder to review. C++ casts force you to specify what type of conversion you're performing, making code more searchable and reviewable.

**Key takeaway:** Always prefer C++ cast operators over C-style casts for clarity, type safety, and maintainability.

---

#### Q2: When should you use static_cast?
**Difficulty:** #beginner  
**Category:** #cast_operators  
**Concepts:** #static_cast #type_conversion #numeric_conversion

**Answer:**
Use static_cast for compile-time checked conversions between related types: numeric conversions, upcasts in inheritance, downcasts when you're certain of the type, and void* conversions.

**Code example:**
```cpp
// Numeric conversion
double d = 3.14;
int i = static_cast<int>(d);  // Truncates to 3

// Upcast (implicit conversion also works)
struct Base { };
struct Derived : Base { };
Derived* dp = new Derived();
Base* bp = static_cast<Base*>(dp);  // Safe upcast

// void* conversion
void* vp = static_cast<void*>(dp);
Derived* dp2 = static_cast<Derived*>(vp);  // Round-trip safe
```

**Explanation:**
static_cast is the workhorse cast for most conversions. It won't perform unsafe operations like casting away const or arbitrary pointer reinterpretation, providing safety within its domain.

**Key takeaway:** static_cast is the default choice for explicit type conversions when types are related or convertible.

---

#### Q3: What makes dynamic_cast different from static_cast?
**Difficulty:** #intermediate  
**Category:** #cast_operators #polymorphism  
**Concepts:** #dynamic_cast #static_cast #rtti #runtime_checking

**Answer:**
dynamic_cast performs runtime type checking using RTTI and returns nullptr (for pointers) or throws std::bad_cast (for references) if the cast is invalid, while static_cast performs no runtime checking.

**Code example:**
```cpp
struct Base { virtual ~Base() { } };
struct Derived : Base { };

Base* b = new Base();  // Not actually Derived

// ❌ static_cast: no check, undefined behavior
Derived* d1 = static_cast<Derived*>(b);
// Using d1 is UB

// ✅ dynamic_cast: safe, returns nullptr
Derived* d2 = dynamic_cast<Derived*>(b);
if (d2) {  // Check result
    // Use d2
} else {
    // Cast failed safely
}
```

**Explanation:**
dynamic_cast requires virtual functions in the base class to enable RTTI. The runtime check has a small performance cost but prevents undefined behavior from invalid casts.

**Key takeaway:** Use dynamic_cast for safe downcasting when the object's actual type is uncertain; use static_cast only when you're certain of the type.

---

#### Q4: What are the requirements for using dynamic_cast?
**Difficulty:** #intermediate  
**Category:** #cast_operators #polymorphism  
**Concepts:** #dynamic_cast #rtti #virtual_functions #polymorphic_type

**Answer:**
dynamic_cast requires the base class to be polymorphic (have at least one virtual function) to enable RTTI, and works only with pointer or reference types in inheritance hierarchies.

**Code example:**
```cpp
// ❌ Non-polymorphic: won't compile
struct NonPoly {
    int x;
};

// ✅ Polymorphic: has virtual function
struct PolyBase {
    virtual ~PolyBase() { }
};

struct PolyDerived : PolyBase { };

NonPoly* np = new NonPoly();
// auto* p1 = dynamic_cast<NonPoly*>(np);  // Compile error

PolyBase* pb = new PolyDerived();
auto* pd = dynamic_cast<PolyDerived*>(pb);  // ✅ OK
```

**Explanation:**
The virtual function requirement ensures a vtable exists, which stores RTTI needed for runtime type checking. Without it, there's no way to determine the actual object type at runtime.

**Key takeaway:** dynamic_cast only works with polymorphic types; add a virtual destructor to enable it if needed.

---

#### Q5: When is it safe to use const_cast?
**Difficulty:** #intermediate  
**Category:** #cast_operators #const_correctness  
**Concepts:** #const_cast #undefined_behavior #const_correctness

**Answer:**
const_cast is safe only when casting away const from an object that wasn't originally declared const, typically when interfacing with const-incorrect APIs where you have external knowledge the function won't modify the data.

**Code example:**
```cpp
void legacyFunc(char* str);  // Doesn't modify but signature wrong

void modern(const char* str) {
    legacyFunc(const_cast<char*>(str));  // ✅ Safe if legacyFunc only reads
}

const int truly_const = 42;
int* p = const_cast<int*>(&truly_const);
*p = 100;  // ❌ Undefined behavior - object was originally const
```

**Explanation:**
Modifying an originally-const object through const_cast is undefined behavior because the compiler may optimize assuming the value never changes, potentially storing it in read-only memory.

**Key takeaway:** Only use const_cast when the underlying object is actually mutable; modifying truly-const objects is always undefined behavior.

---

#### Q6: What is reinterpret_cast used for and why is it dangerous?
**Difficulty:** #intermediate  
**Category:** #cast_operators  
**Concepts:** #reinterpret_cast #undefined_behavior #strict_aliasing #bitwise_conversion

**Answer:**
reinterpret_cast performs low-level bitwise reinterpretation of pointers and integers, bypassing type safety. It's dangerous because it can violate strict aliasing rules, cause misaligned access, and produce platform-dependent results.

**Code example:**
```cpp
float f = 3.14f;
// ❌ Violates strict aliasing
int* ip = reinterpret_cast<int*>(&f);
*ip = 0;  // Undefined behavior

// ✅ Safe pointer-to-integer conversion
std::uintptr_t addr = reinterpret_cast<std::uintptr_t>(&f);

// ✅ Safe way to reinterpret bits
int bits;
std::memcpy(&bits, &f, sizeof(f));
```

**Explanation:**
reinterpret_cast makes no attempt to convert values; it treats the same bit pattern as a different type. This breaks assumptions the compiler makes for optimization.

**Key takeaway:** Use reinterpret_cast only for pointer-to-integer conversions, low-level programming, or hardware interfaces; prefer memcpy for bit-pattern inspection.

---

#### Q7: Can static_cast be used for downcasting? What are the risks?
**Difficulty:** #intermediate  
**Category:** #cast_operators #polymorphism  
**Concepts:** #static_cast #downcasting #undefined_behavior

**Answer:**
Yes, static_cast can downcast pointers in inheritance hierarchies, but it performs no runtime type checking. If the object isn't actually of the derived type, accessing derived members results in undefined behavior.

**Code example:**
```cpp
struct Base { virtual ~Base() { } };
struct Derived : Base { int value = 42; };

Base* b = new Base();  // Not actually Derived
Derived* d = static_cast<Derived*>(b);  // ✅ Compiles
// std::cout << d->value;  // ❌ Undefined behavior - not actually Derived

Base* b2 = new Derived();  // Actually Derived
Derived* d2 = static_cast<Derived*>(b2);  // ✅ Safe
std::cout << d2->value;  // OK: 42
```

**Explanation:**
static_cast trusts the programmer's assertion that the cast is valid. Use it for downcasts only when you're absolutely certain of the object's type, typically in controlled scenarios.

**Key takeaway:** Prefer dynamic_cast for downcasting unless you're certain of the type and need the performance benefit of avoiding runtime checks.

---

#### Q8: How does dynamic_cast handle references vs pointers differently?
**Difficulty:** #advanced  
**Category:** #cast_operators  
**Concepts:** #dynamic_cast #exception_handling #reference_semantics

**Answer:**
For pointers, failed dynamic_cast returns nullptr; for references, it throws std::bad_cast because references cannot be null.

**Code example:**
```cpp
#include <typeinfo>

struct Base { virtual ~Base() { } };
struct Derived : Base { };

Base b;

// Pointer cast: returns nullptr on failure
Base* bp = &b;
Derived* dp = dynamic_cast<Derived*>(bp);
if (!dp) {  // Check for nullptr
    std::cout << "Pointer cast failed\n";
}

// Reference cast: throws on failure
try {
    Derived& dr = dynamic_cast<Derived&>(b);
} catch (const std::bad_cast& e) {
    std::cout << "Reference cast failed: " << e.what() << "\n";
}
```

**Explanation:**
The difference reflects the semantic impossibility of a null reference. The only way to signal failure for reference casts is through an exception.

**Key takeaway:** Always check for nullptr with pointer dynamic_casts; use try-catch with reference dynamic_casts.

---

#### Q9: What is cross-casting and when would you use it?
**Difficulty:** #advanced  
**Category:** #cast_operators #polymorphism  
**Concepts:** #dynamic_cast #multiple_inheritance #cross_casting

**Answer:**
Cross-casting uses dynamic_cast to convert between sibling classes in an inheritance hierarchy (lateral casts), useful in complex hierarchies with multiple inheritance when you need to access different base class interfaces.

**Code example:**
```cpp
struct Base { virtual ~Base() { } };
struct Left : Base { void leftFunc() { } };
struct Right : Base { void rightFunc() { } };

Left l;
Base* bp = &l;

// Cross-cast from Base* to Right* (sibling)
Right* rp = dynamic_cast<Right*>(bp);  // Returns nullptr (l is Left, not Right)

// Cast to actual type works
Left* lp = dynamic_cast<Left*>(bp);  // ✅ Succeeds
if (lp) lp->leftFunc();
```

**Explanation:**
Cross-casting is only possible with dynamic_cast because it requires runtime type information. static_cast cannot perform cross-casts as the types aren't directly related in the hierarchy.

**Key takeaway:** Cross-casting is useful in complex hierarchies where you need to navigate between different base class interfaces of the same object.

---

#### Q10: How does static_cast handle multiple inheritance?
**Difficulty:** #advanced  
**Category:** #cast_operators #inheritance  
**Concepts:** #static_cast #multiple_inheritance #pointer_adjustment

**Answer:**
static_cast properly adjusts pointer offsets for multiple inheritance, accounting for the layout of base class subobjects, while reinterpret_cast does not perform adjustment, leading to incorrect addresses.

**Code example:**
```cpp
struct A { int a = 1; virtual ~A() { } };
struct B { int b = 2; virtual ~B() { } };
struct C : A, B { int c = 3; };

C obj;
C* cp = &obj;

// ✅ static_cast adjusts pointer offset for B subobject
B* bp1 = static_cast<B*>(cp);
std::cout << bp1->b << "\n";  // 2 (correct)

// ❌ reinterpret_cast doesn't adjust - wrong address
B* bp2 = reinterpret_cast<B*>(cp);
std::cout << bp2->b << "\n";  // Undefined behavior (wrong offset)
```

**Explanation:**
With multiple inheritance, base class subobjects exist at different memory offsets within the derived object. static_cast uses compile-time type information to calculate the correct offset.

**Key takeaway:** Always use static_cast or dynamic_cast for pointer conversions in inheritance hierarchies; never use reinterpret_cast.

---

#### Q11: Can const_cast be used to add const?
**Difficulty:** #beginner  
**Category:** #cast_operators #const_correctness  
**Concepts:** #const_cast #cv_qualifiers

**Answer:**
Yes, const_cast can both add and remove const/volatile qualifiers, though adding const is rarely needed since implicit conversion already does that.

**Code example:**
```cpp
int x = 42;
int* ptr = &x;

// Adding const (rarely needed - implicit conversion works)
const int* cp1 = const_cast<const int*>(ptr);
const int* cp2 = ptr;  // ✅ Implicit conversion is cleaner

// Removing const (more common use case)
const int* const_ptr = &x;
int* mutable_ptr = const_cast<int*>(const_ptr);  // Remove const
*mutable_ptr = 100;  // ✅ OK - x wasn't originally const
```

**Explanation:**
Adding const is usually unnecessary because implicit conversion handles it. The primary use of const_cast is removing const when interfacing with legacy or const-incorrect code.

**Key takeaway:** const_cast's main purpose is removing const; adding it is automatic through implicit conversion.

---

#### Q12: What is the relationship between dynamic_cast and virtual functions?
**Difficulty:** #intermediate  
**Category:** #cast_operators #polymorphism  
**Concepts:** #dynamic_cast #virtual_functions #vtable #rtti

**Answer:**
dynamic_cast requires at least one virtual function in the base class because virtual functions create a vtable, which stores RTTI (Run-Time Type Information) needed for runtime type checking.

**Code example:**
```cpp
// ❌ Without virtual: no RTTI, dynamic_cast won't compile
struct NonVirtual {
    void func() { }
};

// ✅ With virtual: RTTI available
struct Virtual {
    virtual ~Virtual() { }  // Virtual destructor enables RTTI
};

struct Derived : Virtual { };

Virtual* vp = new Derived();
auto* dp = dynamic_cast<Derived*>(vp);  // ✅ Works - has RTTI
```

**Explanation:**
The compiler stores type information in the vtable when virtual functions exist. dynamic_cast uses this RTTI to verify types at runtime, enabling safe downcasting.

**Key takeaway:** Adding a virtual destructor is the minimal change to enable dynamic_cast for a class hierarchy.

---

#### Q13: Why is reinterpret_cast platform-dependent?
**Difficulty:** #advanced  
**Category:** #cast_operators #portability  
**Concepts:** #reinterpret_cast #endianness #alignment #platform_dependency

**Answer:**
reinterpret_cast is platform-dependent because it exposes low-level details like endianness, pointer size, alignment requirements, and bit representation that vary across architectures.

**Code example:**
```cpp
#include <iostream>
#include <cstdint>

int main() {
    int x = 0x12345678;
    char* bytes = reinterpret_cast<char*>(&x);
    
    // Result depends on endianness
    std::cout << std::hex;
    std::cout << static_cast<int>(bytes[0]) << "\n";  // Little-endian: 78
                                                       // Big-endian: 12
    
    // Pointer size varies: 4 bytes (32-bit) vs 8 bytes (64-bit)
    std::cout << sizeof(void*) << "\n";  // Platform-dependent
}
```

**Explanation:**
reinterpret_cast performs no conversions; it treats the same memory as a different type. This exposes machine-level details that differ across platforms.

**Key takeaway:** Avoid reinterpret_cast in portable code; use it only for platform-specific operations like hardware interfacing.

---

#### Q14: Can you cast away const and then modify the object safely?
**Difficulty:** #intermediate  
**Category:** #cast_operators #undefined_behavior  
**Concepts:** #const_cast #const_correctness #undefined_behavior

**Answer:**
It's only safe to modify an object through const_cast if the object wasn't originally declared const. Modifying a truly const object is always undefined behavior.

**Code example:**
```cpp
// ✅ Safe: object is mutable
int mutable_obj = 42;
const int* cp = &mutable_obj;
int* p = const_cast<int*>(cp);
*p = 100;  // OK - object wasn't originally const
std::cout << mutable_obj << "\n";  // 100

// ❌ Undefined behavior: object is const
const int const_obj = 50;
int* p2 = const_cast<int*>(&const_obj);
*p2 = 200;  // UB - compiler may crash or produce wrong results
```

**Explanation:**
The compiler may optimize based on const-correctness, placing const objects in read-only memory or caching values. Modifying them breaks these assumptions.

**Key takeaway:** Only use const_cast when you know the underlying object is actually mutable, such as when interfacing with const-incorrect legacy code.

---

#### Q15: What happens when you use static_cast between unrelated types?
**Difficulty:** #beginner  
**Category:** #cast_operators  
**Concepts:** #static_cast #type_safety #compile_error

**Answer:**
static_cast will not compile when attempting to convert between completely unrelated types, providing compile-time safety. It only works for types with some relationship.

**Code example:**
```cpp
struct A { };
struct B { };  // Unrelated to A

A a;
// B* bp = static_cast<B*>(&a);  // ❌ Compile error - unrelated types

// ✅ Works: types are related through inheritance
struct Base { };
struct Derived : Base { };

Derived d;
Base* bp = static_cast<Base*>(&d);  // OK - inheritance relationship
```

**Explanation:**
static_cast enforces type relationships at compile time, preventing arbitrary conversions that would be unsafe. This is a key advantage over C-style casts.

**Key takeaway:** static_cast's compile-time checking prevents many categories of errors that C-style casts would allow.

---

#### Q16: How do you safely inspect the bit pattern of a floating-point number?
**Difficulty:** #advanced  
**Category:** #cast_operators #type_punning  
**Concepts:** #reinterpret_cast #strict_aliasing #memcpy #type_punning

**Answer:**
Use std::memcpy or (in C++20) std::bit_cast to safely reinterpret bit patterns without violating strict aliasing rules. Do not use reinterpret_cast to access through a pointer of different type.

**Code example:**
```cpp
#include <cstring>
#include <iostream>

float f = 3.14f;

// ❌ Violates strict aliasing
int* ip = reinterpret_cast<int*>(&f);
// int bits_wrong = *ip;  // Undefined behavior

// ✅ Safe: memcpy doesn't violate strict aliasing
int bits_safe;
std::memcpy(&bits_safe, &f, sizeof(f));
std::cout << std::hex << bits_safe << "\n";

// ✅ C++20: use std::bit_cast
// auto bits = std::bit_cast<int>(f);
```

**Explanation:**
Accessing an object through a pointer of unrelated type violates strict aliasing, allowing the compiler to make assumptions that break correctness. memcpy is explicitly safe.

**Key takeaway:** Always use memcpy (or std::bit_cast in C++20) for type punning; never access through reinterpreted pointers.

---

#### Q17: What is the cost of dynamic_cast?
**Difficulty:** #intermediate  
**Category:** #cast_operators #performance  
**Concepts:** #dynamic_cast #rtti #performance #runtime_overhead

**Answer:**
dynamic_cast has runtime overhead due to RTTI lookup and type hierarchy traversal. The cost is typically small (O(depth)) but measurable in performance-critical code.

**Code example:**
```cpp
struct Base { virtual ~Base() { } };
struct Derived : Base { };

Base* b = new Derived();

// Runtime cost: RTTI lookup
Derived* d1 = dynamic_cast<Derived*>(b);  // Slower

// No runtime cost: compile-time check
Derived* d2 = static_cast<Derived*>(b);   // Faster (but less safe)

// Best practice: cache the result if used repeatedly
if (Derived* d = dynamic_cast<Derived*>(b)) {
    d->func();  // Use d multiple times
    d->other();
}
```

**Explanation:**
The runtime type check involves comparing type information and traversing inheritance hierarchies. In most applications this is negligible, but in tight loops it can matter.

**Key takeaway:** Use dynamic_cast for safety; optimize with static_cast only in proven hotspots where type is guaranteed.

---

#### Q18: Can static_cast convert between different pointer types in inheritance?
**Difficulty:** #beginner  
**Category:** #cast_operators #inheritance  
**Concepts:** #static_cast #upcast #downcast

**Answer:**
Yes, static_cast works for both upcasts (derived→base, always safe) and downcasts (base→derived, safe only if object is actually derived type).

**Code example:**
```cpp
struct Base { virtual ~Base() { } };
struct Derived : Base { };

Derived d;

// ✅ Upcast: always safe (implicit also works)
Base* bp1 = static_cast<Base*>(&d);
Base* bp2 = &d;  // Implicit conversion also works

// ⚠️ Downcast: safe only if actually Derived
Base* bp3 = new Derived();
Derived* dp1 = static_cast<Derived*>(bp3);  // Safe - actually Derived

Base* bp4 = new Base();
Derived* dp2 = static_cast<Derived*>(bp4);  // ❌ UB - not actually Derived
```

**Explanation:**
Upcasting (treating derived as base) is always safe because derived has all base members. Downcasting requires knowledge that the object is actually the derived type.

**Key takeaway:** Prefer dynamic_cast for downcasts unless you're certain of the type and need maximum performance.

---

#### Q19: What is the difference between reinterpret_cast and static_cast for void*?
**Difficulty:** #intermediate  
**Category:** #cast_operators  
**Concepts:** #static_cast #reinterpret_cast #void_pointer

**Answer:**
Both can convert to/from void*, but static_cast maintains type safety for round-trip conversions while reinterpret_cast is more flexible but loses type information.

**Code example:**
```cpp
int x = 42;

// ✅ static_cast: type-safe round-trip
void* vp1 = static_cast<void*>(&x);
int* ip1 = static_cast<int*>(vp1);  // Safe back to original type

// ✅ reinterpret_cast: also works
void* vp2 = reinterpret_cast<void*>(&x);
int* ip2 = reinterpret_cast<int*>(vp2);  // Works

// ❌ Danger with wrong type (both are UB)
double* dp1 = static_cast<double*>(vp1);  // Compiles but UB
double* dp2 = reinterpret_cast<double*>(vp2);  // Compiles but UB
```

**Explanation:**
For void* conversions, the choice doesn't matter much functionally, but static_cast better expresses intent for type-safe void* usage, while reinterpret_cast signals low-level operations.

**Key takeaway:** Prefer static_cast for void* conversions as it's more idiomatic; reserve reinterpret_cast for truly low-level operations.

---

#### Q20: How does const_cast interact with volatile?
**Difficulty:** #advanced  
**Category:** #cast_operators  
**Concepts:** #const_cast #volatile #cv_qualifiers

**Answer:**
const_cast can add or remove both const and volatile qualifiers, though volatile is rarely used. Both qualifiers can be cast independently or together.

**Code example:**
```cpp
int x = 42;

// Add volatile
volatile int* vp = const_cast<volatile int*>(&x);

// Remove volatile
int* p = const_cast<int*>(vp);

// Work with both const and volatile
const volatile int cv_x = 10;
int* p2 = const_cast<int*>(&cv_x);  // Removes both const and volatile
// *p2 = 20;  // ❌ UB - cv_x was originally const

// Add both
const volatile int* cvp = const_cast<const volatile int*>(&x);
```

**Explanation:**
volatile tells the compiler the value may change unexpectedly (hardware registers, signal handlers). const_cast affects cv-qualifiers (const and volatile) but not storage class or type.

**Key takeaway:** const_cast works with both const and volatile; modifying originally cv-qualified objects is undefined behavior.

---

#### Q21: What are the rules for converting function pointers with casts?
**Difficulty:** #advanced  
**Category:** #cast_operators  
**Concepts:** #reinterpret_cast #function_pointer #undefined_behavior

**Answer:**
Function pointers can be converted using reinterpret_cast, but calling through an incorrect function pointer type is undefined behavior. Round-trip conversions to the original type are safe.

**Code example:**
```cpp
void func_int(int x) { std::cout << x << "\n"; }
void func_double(double d) { std::cout << d << "\n"; }

void (*fp_int)(int) = &func_int;

// Convert to different function pointer type
void (*fp_double)(double) = reinterpret_cast<void(*)(double)>(fp_int);

// ❌ Calling through wrong type is UB
// fp_double(3.14);  // Undefined behavior

// ✅ Convert back and call through correct type
void (*fp_back)(int) = reinterpret_cast<void(*)(int)>(fp_double);
fp_back(42);  // OK - correct type
```

**Explanation:**
Function pointer conversions are needed for callbacks or type-erased APIs, but the function must ultimately be called through its original signature to maintain ABI compatibility.

**Key takeaway:** Function pointers can be stored as different types but must be called through their original signature.

---

#### Q22: Can dynamic_cast be used with private inheritance?
**Difficulty:** #advanced  
**Category:** #cast_operators #inheritance  
**Concepts:** #dynamic_cast #private_inheritance #access_control

**Answer:**
dynamic_cast respects access control; it cannot cast to a private base class from outside the derived class, but works with private inheritance from within member functions.

**Code example:**
```cpp
struct Base { virtual ~Base() { } };

struct Derived : private Base {  // Private inheritance
    static Base* expose(Derived* d) {
        return dynamic_cast<Base*>(d);  // ✅ Works inside class
    }
};

Derived d;
// Base* bp = dynamic_cast<Base*>(&d);  // ❌ Error - private inheritance
Base* bp = Derived::expose(&d);  // ✅ OK from inside
```

**Explanation:**
dynamic_cast observes the same access rules as normal inheritance. Private base classes are inaccessible to external code but accessible within the class itself.

**Key takeaway:** dynamic_cast respects access control; private inheritance prevents external dynamic_cast but allows it within the class.

---

#### Q23: What is the result of casting nullptr with different casts?
**Difficulty:** #beginner  
**Category:** #cast_operators  
**Concepts:** #nullptr #static_cast #dynamic_cast #const_cast #reinterpret_cast

**Answer:**
All C++ casts preserve nullptr when cast between pointer types, returning nullptr of the target type.

**Code example:**
```cpp
int* p = nullptr;

// All casts preserve nullptr
int* p1 = static_cast<int*>(nullptr);           // nullptr
const int* p2 = const_cast<const int*>(nullptr);  // nullptr
char* p3 = reinterpret_cast<char*>(nullptr);    // nullptr

struct Base { virtual ~Base() { } };
struct Derived : Base { };
Base* bp = nullptr;
Derived* dp = dynamic_cast<Derived*>(bp);       // nullptr
```

**Explanation:**
nullptr is a special null pointer constant that converts to null for any pointer type. All casts maintain this null property.

**Key takeaway:** Casting nullptr is always safe and produces nullptr of the target type; no special handling needed.

---

#### Q24: How do you cast between unrelated types safely?
**Difficulty:** #advanced  
**Category:** #cast_operators #type_safety  
**Concepts:** #reinterpret_cast #memcpy #type_punning #strict_aliasing

**Answer:**
For bit-pattern reinterpretation between unrelated types, use memcpy or std::bit_cast (C++20) instead of reinterpret_cast to avoid violating strict aliasing rules.

**Code example:**
```cpp
#include <cstring>
#include <cstdint>

struct A { int x, y; };
struct B { uint64_t value; };

A a{1, 2};

// ❌ Violates strict aliasing
B* bp = reinterpret_cast<B*>(&a);
// uint64_t val = bp->value;  // Undefined behavior

// ✅ Safe: memcpy
B b;
std::memcpy(&b, &a, sizeof(A));  // Safe if sizes compatible
uint64_t val = b.value;  // OK

// ✅ C++20: use std::bit_cast if sizes match
// static_assert(sizeof(A) == sizeof(B));
// auto b2 = std::bit_cast<B>(a);
```

**Explanation:**
memcpy is explicitly designed to safely copy memory representations without triggering strict aliasing violations. The compiler recognizes it and optimizes accordingly.

**Key takeaway:** Never access objects through reinterpreted pointers; always use memcpy or std::bit_cast for type punning.

---

#### Q25: Can you explain pointer adjustment in multiple inheritance downcasting?
**Difficulty:** #advanced  
**Category:** #cast_operators #inheritance  
**Concepts:** #static_cast #multiple_inheritance #pointer_adjustment #object_layout

**Answer:**
In multiple inheritance, derived objects contain multiple base subobjects at different memory offsets. static_cast and dynamic_cast adjust pointer values to point to the correct subobject, while reinterpret_cast does not.

**Code example:**
```cpp
struct A {
    int a = 1;
    virtual ~A() { }
};

struct B {
    int b = 2;
    virtual ~B() { }
};

struct C : A, B {  // Multiple inheritance
    int c = 3;
};

C obj;
std::cout << "C address: " << &obj << "\n";

// Cast to first base (A) - typically same address
A* ap = static_cast<A*>(&obj);
std::cout << "A address: " << ap << "\n";  // Usually same as C

// Cast to second base (B) - address adjusted
B* bp = static_cast<B*>(&obj);
std::cout << "B address: " << bp << "\n";  // Different address (offset)

// Cast back - pointer adjusted again
C* cp = static_cast<C*>(bp);
std::cout << "C from B: " << cp << "\n";  // Back to original address
```

**Explanation:**
Memory layout with multiple inheritance places base subobjects sequentially. Pointers must be adjusted to point to the correct subobject's location. Only proper casts perform this adjustment.

**Key takeaway:** Multiple inheritance requires pointer arithmetic; never use reinterpret_cast with inheritance hierarchies as it doesn't adjust pointers.

---

### PRACTICE_TASKS: Cast Operator Application and Debugging

#### Q1
```cpp
#include <iostream>

struct Base {
    virtual ~Base() { }
    int base_val = 10;
};

struct Derived : Base {
    int derived_val = 20;
};

int main() {
    Base* b = new Derived();
    Derived* d1 = static_cast<Derived*>(b);
    Derived* d2 = dynamic_cast<Derived*>(b);
    
    std::cout << d1->derived_val << " " << d2->derived_val << "\n";
    
    delete b;
}
```

#### Q2
```cpp
#include <iostream>

int main() {
    const int x = 100;
    int* p = const_cast<int*>(&x);
    *p = 200;
    
    std::cout << x << " " << *p << "\n";
}
```

#### Q3
```cpp
#include <iostream>

struct Base { virtual ~Base() { } };
struct Derived : Base { };

int main() {
    Base* b = new Base();
    
    Derived* d1 = static_cast<Derived*>(b);
    Derived* d2 = dynamic_cast<Derived*>(b);
    
    std::cout << (d1 == nullptr) << " " << (d2 == nullptr) << "\n";
    
    delete b;
}
```

#### Q4
```cpp
#include <iostream>
#include <cstring>

int main() {
    float f = 3.14f;
    int bits;
    std::memcpy(&bits, &f, sizeof(f));
    
    int* fp_bits = reinterpret_cast<int*>(&f);
    
    std::cout << (bits == *fp_bits) << "\n";
}
```

#### Q5
```cpp
#include <iostream>

double performCalc() {
    return 3.14159;
}

int main() {
    int i1 = performCalc();  // What conversion?
    int i2 = static_cast<int>(performCalc());  // What conversion?
    
    std::cout << i1 << " " << i2 << "\n";
}
```

#### Q6
```cpp
#include <iostream>

struct A { int a = 1; virtual ~A() { } };
struct B { int b = 2; virtual ~B() { } };
struct C : A, B { int c = 3; };

int main() {
    C obj;
    B* bp = static_cast<B*>(&obj);
    
    std::cout << bp->b << "\n";
    std::cout << (static_cast<void*>(&obj) == static_cast<void*>(bp)) << "\n";
}
```

#### Q7
```cpp
#include <iostream>

int main() {
    int x = 65;
    char c = static_cast<char>(x);
    
    std::cout << c << " " << static_cast<int>(c) << "\n";
}
```

#### Q8
```cpp
#include <iostream>
#include <typeinfo>

struct Base { virtual ~Base() { } };
struct Derived : Base { };

int main() {
    Base b;
    
    try {
        Derived& d = dynamic_cast<Derived&>(b);
        std::cout << "Cast succeeded\n";
    } catch (const std::bad_cast& e) {
        std::cout << "Cast failed\n";
    }
}
```

#### Q9
```cpp
#include <iostream>

void legacyFunc(char* str) {
    std::cout << str << "\n";
}

int main() {
    const char* message = "Hello";
    legacyFunc(const_cast<char*>(message));  // Safe?
}
```

#### Q10
```cpp
#include <iostream>

struct NonPoly {
    int value = 42;
};

int main() {
    NonPoly np;
    NonPoly* p1 = &np;
    // NonPoly* p2 = dynamic_cast<NonPoly*>(p1);  // Will this compile?
    
    std::cout << p1->value << "\n";
}
```

#### Q11
```cpp
#include <iostream>
#include <cstdint>

int main() {
    int value = 1000;
    std::uintptr_t addr = reinterpret_cast<std::uintptr_t>(&value);
    int* restored = reinterpret_cast<int*>(addr);
    
    std::cout << *restored << "\n";
}
```

#### Q12
```cpp
#include <iostream>

int main() {
    int* ptr = nullptr;
    
    char* c1 = static_cast<char*>(static_cast<void*>(ptr));
    char* c2 = reinterpret_cast<char*>(ptr);
    
    std::cout << (c1 == nullptr) << " " << (c2 == nullptr) << "\n";
}
```

#### Q13
```cpp
#include <iostream>

struct Base1 { virtual ~Base1() { } };
struct Base2 { virtual ~Base2() { } };
struct Derived : Base1, Base2 { };

int main() {
    Derived d;
    Base1* b1 = &d;
    
    Base2* b2 = dynamic_cast<Base2*>(b1);
    
    if (b2) {
        std::cout << "Cross-cast succeeded\n";
    } else {
        std::cout << "Cross-cast failed\n";
    }
}
```

#### Q14
```cpp
#include <iostream>

int main() {
    double large = 1e100;
    int overflow = static_cast<int>(large);
    
    std::cout << overflow << "\n";  // What's the output?
}
```

#### Q15
```cpp
#include <iostream>

void modify(const int& ref) {
    int& mutable_ref = const_cast<int&>(ref);
    mutable_ref = 999;
}

int main() {
    int x = 42;
    const int& cr = x;
    modify(cr);
    
    std::cout << x << "\n";
}
```

#### Q16
```cpp
#include <iostream>

struct Base { virtual ~Base() { } };
struct Derived : Base { };

int main() {
    Base* b1 = new Derived();
    Base* b2 = new Base();
    
    std::cout << (dynamic_cast<Derived*>(b1) != nullptr) << " ";
    std::cout << (dynamic_cast<Derived*>(b2) != nullptr) << "\n";
    
    delete b1;
    delete b2;
}
```

#### Q17
```cpp
#include <iostream>

struct A {
    int x = 10;
    virtual ~A() { }
};

struct B : A {
    int y = 20;
};

int main() {
    A* a = new B();
    B* b = static_cast<B*>(a);
    
    std::cout << b->x << " " << b->y << "\n";
    
    delete a;
}
```

#### Q18
```cpp
#include <iostream>

int main() {
    float f = -3.99f;
    int i = static_cast<int>(f);
    
    std::cout << i << "\n";
}
```

#### Q19
```cpp
#include <iostream>

int mutable_int = 50;

void test(const int* ptr) {
    int* p = const_cast<int*>(ptr);
    *p = 100;
}

int main() {
    test(&mutable_int);
    std::cout << mutable_int << "\n";
}
```

#### Q20
```cpp
#include <iostream>
#include <cstring>

int main() {
    int x = 42;
    double d;
    std::memcpy(&d, &x, sizeof(int));
    
    std::cout << d << "\n";  // What happens?
}
```

### QUICK_REFERENCE: Answer Key and Summary Tables

#### Answer Key for Practice Questions

| Q# | Answer | Explanation | Key Concept |
|----|--------|-------------|-------------|
| 1 | Prints: `20 20` | Both casts succeed; b actually points to Derived object | #static_cast #dynamic_cast |
| 2 | Undefined behavior<br>Typical: `100 200` or `200 200` | Modifying truly const object is UB; compiler may optimize | #const_cast #undefined_behavior |
| 3 | Prints: `0 1` | static_cast doesn't check (not nullptr), dynamic_cast fails safely (nullptr) | #static_cast #dynamic_cast |
| 4 | Prints: `1` | Both methods read same bits; memcpy avoids strict aliasing issues | #memcpy #reinterpret_cast |
| 5 | Prints: `3 3` | Both are implicit narrowing (first) and explicit (second); same result | #implicit_conversion #static_cast |
| 6 | Prints: `2`<br>`0` | B subobject at different offset due to multiple inheritance | #multiple_inheritance #pointer_adjustment |
| 7 | Prints: `A 65` | 65 is ASCII 'A'; conversion preserves value | #numeric_conversion #static_cast |
| 8 | Prints: `Cast failed` | Reference dynamic_cast throws std::bad_cast on failure | #dynamic_cast #exception |
| 9 | Prints: `Hello` | Safe only if legacyFunc doesn't modify (we assume it doesn't) | #const_cast #legacy_api |
| 10 | Commented line fails to compile | dynamic_cast requires polymorphic type (virtual function) | #dynamic_cast #polymorphic |
| 11 | Prints: `1000` | Safe pointer→integer→pointer round-trip with uintptr_t | #reinterpret_cast #pointer_to_integer |
| 12 | Prints: `1 1` | Both produce nullptr; casting nullptr always yields nullptr | #nullptr #static_cast |
| 13 | Prints: `Cross-cast succeeded` | dynamic_cast can cross-cast within multiple inheritance hierarchy | #cross_cast #dynamic_cast |
| 14 | Undefined behavior | Value exceeds int range; result is implementation-defined | #narrowing_conversion #overflow |
| 15 | Prints: `999` | Safe because x wasn't originally const | #const_cast #const_correctness |
| 16 | Prints: `1 0` | First is actually Derived (succeeds), second is Base only (fails) | #dynamic_cast #runtime_check |
| 17 | Prints: `10 20` | Safe downcast; a actually points to B object | #static_cast #downcasting |
| 18 | Prints: `-3` | Truncates toward zero: -3.99 becomes -3 | #static_cast #truncation |
| 19 | Prints: `100` | Safe: mutable_int wasn't originally const | #const_cast #mutable_object |
| 20 | Undefined behavior | memcpy copies int bytes into double; interpreting as double is UB | #type_punning #undefined_behavior |

#### Cast Operator Comparison

| Cast Type | Use Case | Compile-Time | Runtime Cost | Safety Level | Can Cast Away Const? |
|-----------|----------|--------------|--------------|--------------|---------------------|
| `static_cast` | Related type conversions, numeric, inheritance | ✅ Checked | None | Medium | ❌ No |
| `dynamic_cast` | Safe polymorphic downcasting/cross-casting | ✅ Checked | Small | High | ❌ No |
| `const_cast` | Add/remove const or volatile | ✅ Syntax only | None | Low | ✅ Yes |
| `reinterpret_cast` | Low-level bit reinterpretation | ⚠️ Minimal | None | Very Low | ❌ No |
| C-style cast | Don't use (ambiguous) | ❌ Minimal | Varies | Very Low | ✅ Yes (hidden) |

#### When to Use Each Cast

| Scenario | Recommended Cast | Alternative | Notes |
|----------|-----------------|-------------|-------|
| Numeric conversions | `static_cast<int>(double_val)` | Implicit | Make truncation explicit |
| Upcast in inheritance | Implicit / `static_cast` | None needed | Upcast always safe |
| Downcast (type certain) | `static_cast<Derived*>` | `dynamic_cast` | Use dynamic_cast if uncertain |
| Downcast (type uncertain) | `dynamic_cast<Derived*>` | Check & static_cast | Always check result for nullptr |
| Cross-cast in hierarchy | `dynamic_cast<Sibling*>` | N/A | Only dynamic_cast can cross-cast |
| Remove const for legacy API | `const_cast<T*>` | Avoid if possible | Ensure object is mutable |
| Pointer to integer | `reinterpret_cast<uintptr_t>` | N/A | Use uintptr_t for portability |
| Type punning / bit inspection | `memcpy` or `std::bit_cast` | Never reinterpret_cast | Avoid strict aliasing violations |
| Function pointer conversion | `reinterpret_cast` | Avoid if possible | Call through original type |

#### dynamic_cast Behavior

| Source Type | Target Type | Success Result | Failure Result |
|-------------|-------------|----------------|----------------|
| Pointer | Pointer | Valid pointer | `nullptr` |
| Reference | Reference | Valid reference | Throws `std::bad_cast` |
| Upcast | Always succeeds | N/A | N/A |
| Downcast | If type matches | `nullptr` / exception | |
| Cross-cast | If valid sibling | `nullptr` / exception | |

#### Common Casting Mistakes

| Mistake | Why It's Wrong | Correct Approach |
|---------|---------------|------------------|
| `(Type)value` C-style cast | Ambiguous, hides operations | Use specific C++ cast operators |
| `static_cast<Derived*>` without type check | No runtime verification, UB if wrong | Use `dynamic_cast` and check result |
| `const_cast` then modify truly const | Undefined behavior | Only cast const-incorrect APIs |
| `reinterpret_cast` for type punning | Violates strict aliasing | Use `memcpy` or `std::bit_cast` |
| `reinterpret_cast` in inheritance | Doesn't adjust pointer offset | Use `static_cast` or `dynamic_cast` |
| Casting `nullptr` without checking | Dereferencing nullptr crashes | Always check pointer before use |
| `dynamic_cast` on non-polymorphic | Won't compile | Add virtual function to base |
| Casting away const then modifying | UB if originally const | Ensure object is mutable |

#### Cast Safety Checklist

| Question | Cast to Use |
|----------|-------------|
| Converting between numeric types? | `static_cast` |
| Need runtime type checking in hierarchy? | `dynamic_cast` |
| Interfacing with const-incorrect legacy code? | `const_cast` (verify object is mutable) |
| Converting pointer to integer or vice versa? | `reinterpret_cast` (use `uintptr_t`) |
| Need to inspect bit pattern safely? | `memcpy` or `std::bit_cast` (C++20) |
| Uncertain if downcast is valid? | `dynamic_cast` + nullptr check |
| Navigating complex multiple inheritance? | `dynamic_cast` for safety |
| Want maximum performance with known type? | `static_cast` (only if type guaranteed) |

#### Undefined Behavior Scenarios

| Code Pattern | Result | Fix |
|--------------|--------|-----|
| `const_cast` + modify truly const object | UB | Don't modify; ensure object is mutable |
| `static_cast<Derived*>` on Base object | UB when accessing derived members | Use `dynamic_cast` with check |
| `reinterpret_cast` + access through pointer | Violates strict aliasing → UB | Use `memcpy` for type punning |
| `reinterpret_cast` in inheritance hierarchy | Wrong pointer offset → UB | Use `static_cast` or `dynamic_cast` |
| Call through wrong function pointer type | UB due to ABI mismatch | Cast back to original type before calling |
| `static_cast` numeric overflow | Implementation-defined / UB | Check range before casting |

#### C++ Cast vs C-Style Cast Behavior

| Operation | C-Style Cast | C++ Cast Equivalent | Visibility |
|-----------|--------------|-------------------|-----------|
| Remove const | `(int*)const_ptr` | `const_cast<int*>` | Hidden vs Explicit |
| Numeric conversion | `(int)3.14` | `static_cast<int>` | Hidden vs Explicit |
| Pointer reinterpretation | `(char*)int_ptr` | `reinterpret_cast<char*>` | Hidden vs Explicit |
| Inheritance downcast | `(Derived*)base` | `static_cast<Derived*>` or `dynamic_cast` | Unsafe vs Checked |
| Multiple operations | Single cast | Multiple explicit casts | Hidden vs Clear |
