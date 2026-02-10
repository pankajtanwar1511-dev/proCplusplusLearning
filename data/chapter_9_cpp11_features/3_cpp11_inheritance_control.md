# TOPIC: Inheritance Control Keywords in C++11

## THEORY_SECTION: Compile-Time Polymorphism Safety

C++11 introduced two critical keywords—`override` and `final`—that address longstanding issues in C++ polymorphism by enabling compile-time verification of programmer intent. Before C++11, virtual function overriding was error-prone: a typo in the function name, a mismatch in const-qualification, or a difference in parameter types would silently create a new function instead of overriding the base class version. Similarly, preventing further inheritance or method overriding required awkward workarounds or was simply impossible.

These keywords transform runtime polymorphism errors into compile-time errors, enabling the compiler to verify that derived classes actually override base class virtual functions as intended, and that classes or methods marked as final cannot be further extended or overridden. This shift from silent failure to explicit compiler enforcement represents a fundamental improvement in C++ type safety, making inheritance hierarchies more maintainable and less prone to subtle bugs.

### The override Keyword

The `override` keyword is placed after a virtual function declaration in a derived class to explicitly state that this function is intended to override a base class virtual function. If no matching virtual function exists in any base class (due to name mismatch, signature difference, or const-qualification difference), the compiler generates an error. This catches overriding mistakes at compile time that would otherwise manifest as runtime bugs or silent behavioral differences.

### The final Keyword

The `final` keyword serves dual purposes: it can prevent a class from being inherited (when applied to the class declaration), or prevent a virtual function from being further overridden in derived classes (when applied to a virtual function). This enables API designers to seal implementation hierarchies at specific points, preventing unintended extensions that might violate class invariants or assumptions. Unlike Java where `final` is a separate keyword for classes and methods, C++ uses a single context-sensitive keyword.

### Why These Keywords Matter

Before these keywords, overriding errors were silent and only detectable through careful testing or code review. A function signature mismatch would simply create a new function rather than overriding the intended one, leading to subtle bugs where virtual dispatch doesn't work as expected. The `override` keyword makes these errors compile-time detectable, dramatically reducing debugging time and increasing code correctness. Similarly, `final` provides explicit control over extensibility that was previously only achievable through private inheritance or other workarounds.

### Design Philosophy

These keywords embody modern C++'s philosophy of making intent explicit and verifiable at compile time. They impose zero runtime overhead—all checking happens during compilation—while providing significant safety benefits. They're also contextual keywords, meaning they only have special meaning in specific contexts and can still be used as identifiers elsewhere, maintaining backward compatibility with existing code.

---

## EDGE_CASES: Virtual Function Override Pitfalls

### Edge Case 1: Name Mismatch Detection

The most common overriding error is a typo in the function name, creating a new virtual function instead of overriding the base class method.

```cpp
class Base {
public:
    virtual void process() { }
};

class Derived : public Base {
public:
    // ❌ Without override: compiles but doesn't override (typo: "procces")
    virtual void procces() { }  // Silent bug!
    
    // ✅ With override: compile error catches typo
    virtual void procces() override { }  // Error: no matching function
};
```

This is one of the primary use cases for `override`. Without it, the typo creates an entirely separate virtual function that will never be called through base class pointers, causing confusing runtime behavior. With `override`, the compiler immediately catches the mistake.

### Edge Case 2: Const-Qualification Mismatch

Forgetting or incorrectly adding `const` qualification creates a signature mismatch that prevents proper overriding.

```cpp
class Base {
public:
    virtual void foo() const { }
    virtual void bar() { }
};

class Derived : public Base {
public:
    // ❌ Not an override: missing const
    void foo() override { }  // Compile error: no matching non-const foo()
    
    // ❌ Not an override: added const
    void bar() const override { }  // Compile error: no matching const bar()
    
    // ✅ Correct overrides
    void foo() const override { }
    void bar() override { }
};
```

Const-qualification is part of the function signature for member functions. The `override` keyword ensures that const-correctness is maintained across the inheritance hierarchy, preventing subtle bugs where the wrong overload is called.

### Edge Case 3: Parameter Type Mismatch

Even subtle differences in parameter types prevent overriding, which `override` detects at compile time.

```cpp
class Base {
public:
    virtual void setValue(int value) { }
};

class Derived : public Base {
public:
    // ❌ Compile error with override: parameter type mismatch
    void setValue(long value) override { }  // int vs long mismatch
    
    // ✅ Correct override with matching parameter type
    void setValue(int value) override { }
};
```

Parameter types must match exactly for overriding to occur. Even promotions like `int` to `long` create different signatures. Without `override`, this would silently create overloads rather than overriding, potentially causing unexpected behavior with base class pointers.

### Edge Case 4: Combining override and final

A virtual function can be both an override of a base class function and final, preventing further overriding in derived classes.

```cpp
class Base {
public:
    virtual void method() { }
};

class Derived : public Base {
public:
    void method() override final { }  // Both override and final
};

class MoreDerived : public Derived {
public:
    // ❌ Compile error: cannot override final function
    void method() override { }
};
```

This pattern is useful when you want to override a base class method but prevent any further overrides. The order doesn't matter—you can write `final override` or `override final`. This ensures that `Derived::method()` is the final implementation in this hierarchy.

### Edge Case 5: Final Class Prevention

When a class is marked `final`, no class can inherit from it, even if the derived class doesn't override any methods.

```cpp
class Base final {
    virtual void method() { }
};

// ❌ Compile error: cannot derive from final class
class Derived : public Base {
    // Even if not overriding anything, derivation itself is forbidden
};
```

Final classes are useful for classes that are designed as complete, sealed implementations. Examples include implementation classes in the pimpl idiom, classes with specific performance assumptions, or utility classes that shouldn't be extended. This prevents accidental misuse through inheritance.

### Edge Case 6: Non-Virtual Function with override

The `override` keyword can only be applied to virtual functions. Attempting to use it on non-virtual functions generates a compile error.

```cpp
class Base {
public:
    void method() { }  // Not virtual
};

class Derived : public Base {
public:
    // ❌ Compile error: method() is not virtual
    void method() override { }
};
```

This error catches cases where a programmer believes they're overriding a virtual function, but the base function is not virtual. This usually indicates a design error—either the base function should be virtual, or the derived class shouldn't be trying to override it.

### Edge Case 7: Reference Qualifiers with override

C++11 also introduced reference qualifiers for member functions (`&` and `&&`), which must match for proper overriding.

```cpp
class Base {
public:
    virtual void method() & { }  // Lvalue reference qualifier
};

class Derived : public Base {
public:
    // ❌ Compile error: reference qualifier mismatch
    void method() && override { }  // Rvalue reference qualifier
    
    // ✅ Correct: matching reference qualifier
    void method() & override { }
};
```

Reference qualifiers allow different behavior when the member function is called on an lvalue vs rvalue object. When overriding, these qualifiers must match exactly. This is a relatively advanced feature but `override` ensures correctness here as well.

---

## CODE_EXAMPLES: Practical Override and Final Patterns

### Example 1: Basic override Usage

```cpp
class Shape {
public:
    virtual double area() const = 0;  // Pure virtual
    virtual void draw() const { }
    virtual ~Shape() = default;
};

class Circle : public Shape {
    double radius;
public:
    Circle(double r) : radius(r) { }
    
    // ✅ Explicitly override pure virtual function
    double area() const override {
        return 3.14159 * radius * radius;
    }
    
    // ✅ Explicitly override virtual function
    void draw() const override {
        std::cout << "Drawing circle\n";
    }
};
```

Using `override` makes the code self-documenting and catches errors early. If the base class signature changes (e.g., `area()` loses `const`), all derived classes using `override` will fail to compile, forcing updates. Without `override`, the derived class would silently create a new non-overriding method.

### Example 2: Catching Signature Mismatches

```cpp
class Base {
public:
    virtual void process(int value) { }
    virtual void calculate() const { }
};

class Derived : public Base {
public:
    // ❌ These would compile without override, creating new functions
    // ✅ With override, compiler catches all these errors:
    
    // void process(long value) override { }  // Error: int vs long
    // void calculate() override { }          // Error: missing const
    // void proccess(int value) override { } // Error: typo in name
    
    // ✅ Correct overrides
    void process(int value) override { }
    void calculate() const override { }
};
```

This demonstrates the safety net that `override` provides. Each commented error would silently compile without `override`, creating separate functions that never override the base class versions. With `override`, all these mistakes become immediate compile errors.

### Example 3: Final Method to Seal Implementation

```cpp
class Component {
public:
    virtual void initialize() { }
    virtual void cleanup() { }
};

class CriticalComponent : public Component {
public:
    void initialize() override {
        // Complex initialization that must not be changed
        std::cout << "Critical initialization\n";
    }
    
    // ✅ Prevent further overriding of cleanup
    void cleanup() override final {
        // Critical cleanup logic that must always execute
        std::cout << "Critical cleanup\n";
    }
};

class SpecialComponent : public CriticalComponent {
public:
    // ✅ Can still override initialize
    void initialize() override {
        std::cout << "Special initialization\n";
    }
    
    // ❌ Cannot override cleanup (it's final)
    // void cleanup() override { }  // Compile error
};
```

Making `cleanup()` final ensures that critical cleanup logic in `CriticalComponent` always executes, preventing derived classes from accidentally breaking resource management or invariant maintenance. Initialize can still be customized.

### Example 4: Final Class for Complete Sealing

```cpp
class Resource {
public:
    virtual void acquire() { }
    virtual void release() { }
    virtual ~Resource() = default;
};

// ✅ Final implementation prevents further derivation
class FileResource final : public Resource {
    FILE* file;
public:
    FileResource(const char* path) : file(fopen(path, "r")) { }
    
    void acquire() override { /* ... */ }
    void release() override { /* ... */ }
    
    ~FileResource() {
        if (file) fclose(file);
    }
};

// ❌ Cannot derive from final class
// class SpecialFileResource : public FileResource { };  // Compile error
```

Final classes are appropriate when the implementation is complete and further derivation would violate assumptions. Here, `FileResource` manages a `FILE*` pointer with specific lifecycle requirements that derived classes might inadvertently break. Making it final prevents such misuse.

### Example 5: Virtual Destructor with override

```cpp
class Base {
public:
    virtual ~Base() { std::cout << "Base destructor\n"; }
};

class Derived : public Base {
public:
    // ✅ Explicitly override virtual destructor
    ~Derived() override {
        std::cout << "Derived destructor\n";
    }
};

int main() {
    Base* ptr = new Derived();
    delete ptr;  // Calls both destructors in correct order
}
```

Virtual destructors should be overridden in derived classes to ensure proper cleanup. Using `override` on the destructor makes this explicit and catches cases where the base destructor is not virtual, which would lead to undefined behavior when deleting through base pointers.

### Example 6: Multiple Inheritance with override

```cpp
class Interface1 {
public:
    virtual void operation() = 0;
    virtual ~Interface1() = default;
};

class Interface2 {
public:
    virtual void operation() = 0;  // Same signature as Interface1
    virtual ~Interface2() = default;
};

class Implementation : public Interface1, public Interface2 {
public:
    // ✅ Override satisfies both interfaces
    void operation() override {
        std::cout << "Single implementation for both interfaces\n";
    }
};
```

When multiple base classes have virtual functions with the same signature, a single override in the derived class satisfies both. The `override` keyword works correctly in this scenario, providing verification that both base class functions are properly overridden.

### Example 7: Covariant Return Types with override

```cpp
class Base;
class Derived;

class Factory {
public:
    virtual Base* create() { return new Base(); }
};

class DerivedFactory : public Factory {
public:
    // ✅ Covariant return type (more specific) is allowed
    Derived* create() override { return new Derived(); }
};
```

C++ allows covariant return types in overrides—the return type can be a pointer or reference to a more derived class. The `override` keyword correctly recognizes this as a valid override despite the return type difference, because covariance is an exception to the usual signature matching rules.

### Example 8: Private Virtual Functions with override

```cpp
class Base {
public:
    void execute() { doExecute(); }  // Public non-virtual interface
    
private:
    virtual void doExecute() {  // Private virtual implementation
        std::cout << "Base implementation\n";
    }
};

class Derived : public Base {
private:
    // ✅ Override private virtual function
    void doExecute() override {
        std::cout << "Derived implementation\n";
    }
};
```

The Non-Virtual Interface (NVI) idiom uses public non-virtual functions that call private virtual functions. Derived classes can override these private virtual functions even though they can't call them directly. The `override` keyword works with private virtual functions, ensuring correct overriding in NVI patterns.

---

#### Example 9: Autonomous Vehicle - Inheritance Control for Sensor Safety

This comprehensive example demonstrates how `override` and `final` keywords prevent polymorphism bugs in autonomous vehicle sensor hierarchies, ensuring correct virtual function overriding and preventing unsafe inheritance.

```cpp
#include <iostream>
#include <vector>
#include <string>
#include <memory>
using namespace std;

// Part 1: Base Sensor Interface with Virtual Functions

class Sensor {
protected:
    string sensor_id;
    bool is_calibrated;
    double last_reading;

public:
    Sensor(const string& id)
        : sensor_id(id), is_calibrated(false), last_reading(0.0) {
        cout << "[Sensor] " << sensor_id << " constructed" << endl;
    }

    virtual ~Sensor() {
        cout << "[Sensor] " << sensor_id << " destroyed" << endl;
    }

    // Pure virtual functions that must be overridden
    virtual void calibrate() = 0;
    virtual double readData() = 0;
    virtual string getType() const = 0;

    // Virtual function with default implementation
    virtual void reset() {
        is_calibrated = false;
        last_reading = 0.0;
        cout << "[Sensor] " << sensor_id << " reset to defaults" << endl;
    }

    // Non-virtual function (cannot be overridden)
    string getID() const { return sensor_id; }
    bool isCalibrated() const { return is_calibrated; }
};

// Part 2: LiDAR Sensor - Using override for Safety

class LiDARSensor : public Sensor {
private:
    int num_beams;
    double max_range_m;

public:
    LiDARSensor(const string& id, int beams, double range)
        : Sensor(id), num_beams(beams), max_range_m(range) {}

    // ✅ override ensures these actually override base class functions
    void calibrate() override {
        cout << "[LiDAR] Calibrating " << sensor_id << " with "
             << num_beams << " beams..." << endl;
        is_calibrated = true;
    }

    double readData() override {
        if (!is_calibrated) {
            cout << "[LiDAR] Error: " << sensor_id << " not calibrated!" << endl;
            return -1.0;
        }
        last_reading = 25.5;  // Simulated distance reading
        return last_reading;
    }

    string getType() const override {
        return "LiDAR";
    }

    // ✅ override catches errors if base function signature changes
    void reset() override {
        Sensor::reset();  // Call base implementation
        cout << "[LiDAR] " << sensor_id << " LiDAR-specific reset" << endl;
    }

    // ❌ This would cause compile error if uncommented (demonstrates override safety):
    // void calibrate() const override { }  // Error: base is not const
    // void calIbrate() override { }        // Error: typo in name
    // void readData(int x) override { }    // Error: parameter mismatch
};

// Part 3: Camera Sensor - Demonstrating override Error Detection

class CameraSensor : public Sensor {
private:
    int resolution_width;
    int resolution_height;

public:
    CameraSensor(const string& id, int width, int height)
        : Sensor(id), resolution_width(width), resolution_height(height) {}

    void calibrate() override {
        cout << "[Camera] Calibrating " << sensor_id << " at "
             << resolution_width << "x" << resolution_height << endl;
        is_calibrated = true;
    }

    double readData() override {
        if (!is_calibrated) {
            cout << "[Camera] Error: " << sensor_id << " not calibrated!" << endl;
            return -1.0;
        }
        last_reading = 0.85;  // Simulated confidence score
        return last_reading;
    }

    string getType() const override {
        return "Camera";
    }

    // Without override, typos would silently create new functions:
    // void calibrat() { }  // Compiles but doesn't override!

    // With override, typos become compile errors:
    // void calibrat() override { }  // ❌ Compile error: no matching function
};

// Part 4: Critical Radar Sensor - Using final to Prevent Further Override

class RadarSensor : public Sensor {
private:
    double frequency_ghz;

public:
    RadarSensor(const string& id, double freq)
        : Sensor(id), frequency_ghz(freq) {}

    void calibrate() override {
        cout << "[Radar] Calibrating " << sensor_id << " at "
             << frequency_ghz << " GHz..." << endl;
        is_calibrated = true;
    }

    double readData() override {
        if (!is_calibrated) {
            cout << "[Radar] Error: " << sensor_id << " not calibrated!" << endl;
            return -1.0;
        }
        last_reading = 15.2;  // Simulated velocity reading
        return last_reading;
    }

    string getType() const override {
        return "Radar";
    }

    // ✅ final prevents derived classes from overriding critical reset logic
    void reset() override final {
        cout << "[Radar] CRITICAL: Executing safety-critical reset sequence" << endl;
        Sensor::reset();
        // Critical cleanup that must NOT be overridden
        cout << "[Radar] Safety checks completed" << endl;
    }
};

// Part 5: Attempting to Override final Function (demonstrates compile error)

// This would fail to compile if RadarSensor::reset() is final:
/*
class AdvancedRadarSensor : public RadarSensor {
public:
    AdvancedRadarSensor(const string& id, double freq)
        : RadarSensor(id, freq) {}

    // ❌ Compile error: cannot override final function
    void reset() override {
        cout << "Trying to override final reset" << endl;
    }
};
*/

// Part 6: Final Class - Sealed Implementation

// ✅ final class prevents any further inheritance
class ProductionLiDARSensor final : public Sensor {
private:
    static const int PRODUCTION_BEAMS = 64;
    double max_range_m;

public:
    ProductionLiDARSensor(const string& id)
        : Sensor(id), max_range_m(100.0) {}

    void calibrate() override final {
        // Production-specific calibration that cannot be changed
        cout << "[ProductionLiDAR] Factory-calibrated sensor " << sensor_id << endl;
        is_calibrated = true;
    }

    double readData() override final {
        if (!is_calibrated) {
            cout << "[ProductionLiDAR] Error: not calibrated!" << endl;
            return -1.0;
        }
        last_reading = 30.5;
        return last_reading;
    }

    string getType() const override final {
        return "Production_LiDAR_64";
    }

    void reset() override final {
        cout << "[ProductionLiDAR] Production sensor cannot be reset - factory sealed" << endl;
        // Intentionally doesn't call base reset
    }
};

// ❌ This would fail to compile (cannot derive from final class):
/*
class CustomProductionLiDAR : public ProductionLiDARSensor {
public:
    // Cannot inherit from final class ProductionLiDARSensor
};
*/

// Part 7: Virtual Destructor with override

class SensorWithCleanup : public Sensor {
private:
    int* dynamic_buffer;

public:
    SensorWithCleanup(const string& id)
        : Sensor(id), dynamic_buffer(new int[100]) {
        cout << "[SensorWithCleanup] Allocated dynamic buffer" << endl;
    }

    // ✅ override on destructor ensures base has virtual destructor
    ~SensorWithCleanup() override {
        delete[] dynamic_buffer;
        cout << "[SensorWithCleanup] Freed dynamic buffer" << endl;
    }

    void calibrate() override {
        is_calibrated = true;
    }

    double readData() override {
        return 42.0;
    }

    string getType() const override {
        return "SensorWithCleanup";
    }
};

// Part 8: Sensor Manager Demonstrating Polymorphism

class SensorManager {
private:
    vector<Sensor*> sensors;

public:
    ~SensorManager() {
        cout << "\n[Manager] Cleaning up sensors..." << endl;
        for (auto* sensor : sensors) {
            delete sensor;  // Virtual destructor ensures proper cleanup
        }
    }

    void addSensor(Sensor* sensor) {
        sensors.push_back(sensor);
    }

    void calibrateAll() {
        cout << "\n=== Calibrating All Sensors ===" << endl;
        for (auto* sensor : sensors) {
            sensor->calibrate();  // Polymorphic call - override ensures correctness
        }
    }

    void readAll() {
        cout << "\n=== Reading All Sensors ===" << endl;
        for (auto* sensor : sensors) {
            cout << "[" << sensor->getType() << " " << sensor->getID() << "] "
                 << "Reading: " << sensor->readData() << endl;
        }
    }

    void resetAll() {
        cout << "\n=== Resetting All Sensors ===" << endl;
        for (auto* sensor : sensors) {
            sensor->reset();  // Polymorphic call - final prevents unsafe override
        }
    }
};

int main() {
    cout << "=== Autonomous Vehicle Sensor Hierarchy - override and final Demo ===\n" << endl;

    SensorManager manager;

    cout << "PART 1: Creating Sensor Hierarchy with override" << endl;
    cout << "-----------------------------------------------" << endl;

    manager.addSensor(new LiDARSensor("lidar_front", 64, 100.0));
    manager.addSensor(new CameraSensor("cam_front", 1920, 1080));
    manager.addSensor(new RadarSensor("radar_rear", 77.0));
    manager.addSensor(new ProductionLiDARSensor("prod_lidar_roof"));
    manager.addSensor(new SensorWithCleanup("sensor_cleanup"));

    // Part 2: Demonstrate Polymorphic Behavior with override Safety
    cout << "\nPART 2: Polymorphic Calibration (override ensures correct virtual dispatch)" << endl;
    cout << "------------------------------------------------------------------------" << endl;
    manager.calibrateAll();

    // Part 3: Polymorphic Data Reading
    cout << "\nPART 3: Polymorphic Data Reading" << endl;
    cout << "---------------------------------" << endl;
    manager.readAll();

    // Part 4: Reset with final Protection
    cout << "\nPART 4: Reset Operations (final prevents override of critical logic)" << endl;
    cout << "-------------------------------------------------------------------" << endl;
    manager.resetAll();

    // Part 5: Demonstrate override Error Prevention
    cout << "\n\nPART 5: Safety Features Demonstrated" << endl;
    cout << "=====================================" << endl;
    cout << "✅ override catches:" << endl;
    cout << "   - Function name typos (calibrate vs calibrat)" << endl;
    cout << "   - Signature mismatches (const qualification, parameter types)" << endl;
    cout << "   - Base function not being virtual" << endl;
    cout << "   - Return type mismatches (except covariant)" << endl;

    cout << "\n✅ final prevents:" << endl;
    cout << "   - Unsafe override of critical reset logic in RadarSensor" << endl;
    cout << "   - Any inheritance from ProductionLiDARSensor sealed class" << endl;
    cout << "   - Modification of production-calibrated sensor behavior" << endl;

    cout << "\n✅ Virtual destructor with override ensures:" << endl;
    cout << "   - Proper cleanup through base pointers" << endl;
    cout << "   - Detection if base destructor is not virtual" << endl;

    cout << "\n\n=== Cleanup (Virtual Destructors in Action) ===" << endl;
    cout << "-----------------------------------------------" << endl;

    // Manager destructor will delete all sensors, demonstrating virtual destructor override
    return 0;
}
```

**Sample Output:**
```
=== Autonomous Vehicle Sensor Hierarchy - override and final Demo ===

PART 1: Creating Sensor Hierarchy with override
-----------------------------------------------
[Sensor] lidar_front constructed
[Sensor] cam_front constructed
[Sensor] radar_rear constructed
[Sensor] prod_lidar_roof constructed
[Sensor] sensor_cleanup constructed
[SensorWithCleanup] Allocated dynamic buffer

PART 2: Polymorphic Calibration (override ensures correct virtual dispatch)
------------------------------------------------------------------------

=== Calibrating All Sensors ===
[LiDAR] Calibrating lidar_front with 64 beams...
[Camera] Calibrating cam_front at 1920x1080
[Radar] Calibrating radar_rear at 77 GHz...
[ProductionLiDAR] Factory-calibrated sensor prod_lidar_roof

PART 3: Polymorphic Data Reading
---------------------------------

=== Reading All Sensors ===
[LiDAR lidar_front] Reading: 25.5
[Camera cam_front] Reading: 0.85
[Radar radar_rear] Reading: 15.2
[Production_LiDAR_64 prod_lidar_roof] Reading: 30.5
[SensorWithCleanup sensor_cleanup] Reading: 42

PART 4: Reset Operations (final prevents override of critical logic)
-------------------------------------------------------------------

=== Resetting All Sensors ===
[Sensor] lidar_front reset to defaults
[LiDAR] lidar_front LiDAR-specific reset
[Sensor] cam_front reset to defaults
[Radar] CRITICAL: Executing safety-critical reset sequence
[Sensor] radar_rear reset to defaults
[Radar] Safety checks completed
[ProductionLiDAR] Production sensor cannot be reset - factory sealed
[Sensor] sensor_cleanup reset to defaults


PART 5: Safety Features Demonstrated
=====================================
✅ override catches:
   - Function name typos (calibrate vs calibrat)
   - Signature mismatches (const qualification, parameter types)
   - Base function not being virtual
   - Return type mismatches (except covariant)

✅ final prevents:
   - Unsafe override of critical reset logic in RadarSensor
   - Any inheritance from ProductionLiDARSensor sealed class
   - Modification of production-calibrated sensor behavior

✅ Virtual destructor with override ensures:
   - Proper cleanup through base pointers
   - Detection if base destructor is not virtual


=== Cleanup (Virtual Destructors in Action) ===
-----------------------------------------------

[Manager] Cleaning up sensors...
[Sensor] lidar_front destroyed
[Sensor] cam_front destroyed
[Sensor] radar_rear destroyed
[Sensor] prod_lidar_roof destroyed
[SensorWithCleanup] Freed dynamic buffer
[Sensor] sensor_cleanup destroyed
```

### Real-World Applications in Autonomous Vehicles:

**1. override for Polymorphism Safety:**
- **Prevents typos**: Common errors like `calibrat()` instead of `calibrate()` are caught at compile time
- **Signature verification**: Ensures derived sensors correctly implement interface contracts
- **Refactoring safety**: If base `Sensor` interface changes, all overrides fail to compile until fixed
- **Self-documentation**: Makes inheritance relationships explicit and verifiable

**2. final for Critical Safety Functions:**
- **Safety-critical reset**: `RadarSensor::reset()` marked final prevents derived classes from breaking critical safety sequences
- **Production sealing**: `ProductionLiDARSensor` is final to prevent modification of factory-calibrated behavior
- **Preventing unsafe extensions**: Ensures certified sensor implementations cannot be altered

**3. Virtual Destructor with override:**
- **Memory leak prevention**: Virtual destructors ensure proper cleanup when deleting through base pointers
- **Resource management**: `SensorWithCleanup` demonstrates dynamic buffer cleanup
- **Compiler verification**: `override` on destructor catches cases where base destructor is not virtual

**4. Compile-Time Error Prevention:**
```cpp
// These would be silent bugs without override:
void calibrat() { }              // Typo - creates new function
void calibrate() const { }       // Wrong signature - creates overload
void calibrate(int x) { }        // Wrong parameters - creates overload

// With override, all become compile errors:
void calibrat() override { }     // ❌ Error: no matching base function
void calibrate() const override { } // ❌ Error: const mismatch
void calibrate(int x) override { }  // ❌ Error: parameter mismatch
```

**5. Production Considerations:**
- **Automotive safety standards** (ISO 26262, MISRA C++) require explicit virtual function handling
- **Certified sensors**: Production LiDAR sensors are often factory-calibrated and sealed (`final`)
- **Safety-critical functions**: Reset, calibration, and diagnostic functions may require `final` to prevent unsafe overrides
- **Code review**: `override` makes virtual dispatch explicit for reviewers
- **Compiler optimizations**: `final` classes enable devirtualization for performance

**6. Real-World Example Patterns:**
- **Tesla Autopilot**: Likely uses sealed sensor classes for production hardware
- **Waymo**: Certified LiDAR calibrations cannot be overridden after factory programming
- **Sensor fusion pipelines**: Virtual interfaces with override ensure all sensor types implement required methods
- **Fail-safe mechanisms**: Critical reset sequences use `final` to ensure execution

**7. Zero Runtime Overhead:**
- Both `override` and `final` are compile-time features with zero runtime cost
- `final` enables compiler optimizations (devirtualization) that can improve performance
- Same vtable structure whether or not `override` is used

---

## INTERVIEW_QA: Polymorphism Safety and Design

#### Q1: What problem does the override keyword solve?
**Difficulty:** #beginner
**Category:** #polymorphism #error_prevention
**Concepts:** #override #virtual_functions #compile_time_safety

**Answer:**
The `override` keyword catches at compile time when a function that was intended to override a base class virtual function fails to do so due to signature mismatches, typos, or const-qualification differences.

**Code example:**
```cpp
class Base {
    virtual void process() { }
};

class Derived : public Base {
    void proccess() override { }  // ❌ Compile error catches typo
};
```

**Explanation:**
Before C++11, if you made a mistake in a function signature when trying to override a virtual function, the compiler would silently accept it and create a new virtual function instead. This led to runtime bugs where polymorphic behavior didn't work as expected. The `override` keyword makes overriding intent explicit—if the function doesn't actually override anything, the compiler generates an error, catching mistakes immediately.

**Key takeaway:** override transforms silent runtime polymorphism bugs into loud compile-time errors, dramatically improving code safety.

---

#### Q2: Can you use override on a non-virtual function?
**Difficulty:** #beginner
**Category:** #syntax #virtual_functions
**Concepts:** #override #virtual #compile_time_checking

**Answer:**
No, `override` can only be used on virtual functions. Attempting to use it on non-virtual functions results in a compile error.

**Code example:**
```cpp
class Base {
    void method() { }  // Not virtual
};

class Derived : public Base {
    void method() override { }  // ❌ Compile error
};
```

**Explanation:**
The `override` keyword specifically verifies that a function overrides a virtual function in a base class. Non-virtual functions cannot be overridden in C++ (they can be hidden, but not overridden for polymorphic dispatch). If the base function isn't virtual, attempting to use `override` indicates a design error—either the programmer mistakenly believed the function was virtual, or they forgot to make the base function virtual.

**Key takeaway:** override requires a virtual function in the base class, catching cases where virtual dispatch was intended but not implemented.

---

#### Q3: What are the two uses of the final keyword?
**Difficulty:** #beginner
**Category:** #inheritance #design_patterns
**Concepts:** #final #inheritance_control #virtual_functions

**Answer:**
`final` can prevent a class from being further inherited (final class), or prevent a virtual function from being further overridden in derived classes (final method).

**Code example:**
```cpp
class FinalClass final { };  // Cannot inherit from this
// class Derived : public FinalClass { };  // Error

class Base {
    virtual void method() final { }  // Cannot override further
};
```

**Explanation:**
The `final` keyword serves two distinct purposes depending on context. When applied to a class declaration, it prevents any class from inheriting from it, ensuring this class is the final implementation. When applied to a virtual function, it allows that function to override a base class function but prevents any further derived classes from overriding it. Both uses help enforce design constraints and prevent unintended extensions.

**Key takeaway:** final provides explicit control over inheritance and override chains, sealing implementations where further extension is undesirable.

---

#### Q4: Does override have any runtime overhead?
**Difficulty:** #beginner
**Category:** #performance #compile_time
**Concepts:** #override #zero_cost_abstraction #compile_time_checking

**Answer:**
No, `override` has zero runtime overhead. It is purely a compile-time check that generates no additional code or runtime cost.

**Explanation:**
The `override` keyword is a compile-time directive to the compiler, similar to `static_assert`. It affects compilation by enforcing correctness checks, but does not generate any additional runtime code, function calls, or data structures. The resulting virtual function dispatch mechanism is identical whether you use `override` or not. This exemplifies C++'s zero-cost abstraction principle—safety features should not impose runtime penalties.

**Key takeaway:** override is a zero-cost safety feature providing compile-time verification without any runtime performance impact.

---

#### Q5: Can a function be both override and final?
**Difficulty:** #intermediate
**Category:** #inheritance #design_patterns
**Concepts:** #override #final #virtual_functions

**Answer:**
Yes, a virtual function can be both `override` and `final`, meaning it overrides a base class function but cannot be further overridden in derived classes.

**Code example:**
```cpp
class Base {
    virtual void method() { }
};

class Derived : public Base {
    void method() override final { }  // Both override and final
};
```

**Explanation:**
Combining `override` and `final` is useful when you want to provide one final override of a base class virtual function while preventing any further overrides. This pattern allows you to establish a definitive implementation at a specific point in the inheritance hierarchy. The order of the keywords doesn't matter—`final override` and `override final` are equivalent. This is common in implementation classes that complete an interface but shouldn't be further extended.

**Key takeaway:** Combining override and final allows overriding once while preventing further overrides, useful for establishing final implementations.

---

#### Q6: What happens if the base class function is not virtual but you use override?
**Difficulty:** #intermediate
**Category:** #error_detection #virtual_functions
**Concepts:** #override #virtual #non_virtual

**Answer:**
If the base class function is not virtual, using `override` causes a compile error, catching the mistake that virtual polymorphism was intended but not properly set up.

**Code example:**
```cpp
class Base {
    void method() { }  // Missing virtual
};

class Derived : public Base {
    void method() override { }  // ❌ Compile error: Base::method not virtual
};
```

**Explanation:**
This is actually one of the valuable error-detection scenarios for `override`. If a programmer intends to override a function but the base class function isn't virtual, there's a design problem. Either the base class needs `virtual` added, or the derived class shouldn't be trying to override. Without `override`, this mistake would go unnoticed—the derived class would simply hide the base class function, and polymorphic dispatch wouldn't work.

**Key takeaway:** override catches cases where virtual dispatch was intended but the base function lacks the virtual keyword.

---

#### Q7: Can final be used on pure virtual functions?
**Difficulty:** #intermediate
**Category:** #abstract_classes #virtual_functions
**Concepts:** #final #pure_virtual #abstract_class

**Answer:**
Yes, but it's unusual—a pure virtual function can be marked final, though this prevents derived classes from overriding it, typically requiring the same class to provide the definition.

**Code example:**
```cpp
class Base {
    virtual void method() final = 0;  // Pure virtual and final
    // Must provide definition in Base, despite being pure virtual
};

void Base::method() {
    std::cout << "Base implementation\n";
}
```

**Explanation:**
While syntactically valid, combining `final` with pure virtual (`= 0`) is rare because it creates contradictory constraints. Pure virtual functions normally force derived classes to provide implementations, but `final` prevents overriding. The base class must provide a definition (despite `= 0`), which can be called explicitly using `Base::method()`. This pattern is unusual and typically indicates a design problem.

**Key takeaway:** While legal, combining final with pure virtual is rare and usually suggests a design flaw.

---

#### Q8: Does override check the return type of the function?
**Difficulty:** #intermediate
**Category:** #type_checking #virtual_functions
**Concepts:** #override #return_type #covariant_return

**Answer:**
Yes, `override` verifies return type compatibility, allowing exact matches or covariant return types (pointer/reference to derived class).

**Code example:**
```cpp
class Base { };
class Derived : public Base { };

class Factory {
    virtual Base* create() { }
};

class DerivedFactory : public Factory {
    Derived* create() override { }  // ✅ Covariant return type OK
    // int create() override { }    // ❌ Error: incompatible return type
};
```

**Explanation:**
Override checking includes return type verification. Normally, return types must match exactly for valid overrides. However, C++ allows covariant return types as a special case—when overriding a function that returns a pointer or reference to a base class, you can return a pointer or reference to a derived class. This is type-safe because a derived class pointer can always be converted to a base class pointer. Any other return type mismatch causes a compile error with `override`.

**Key takeaway:** override verifies return types, accepting exact matches or covariant returns but rejecting incompatible types.

---

#### Q9: Why might you want to make a class final?
**Difficulty:** #intermediate
**Category:** #design_patterns #api_design
**Concepts:** #final #inheritance #encapsulation

**Answer:**
Making a class final prevents inheritance, useful when further derivation would violate invariants, when the class makes performance assumptions, or when implementing complete sealed types like the pimpl idiom.

**Code example:**
```cpp
class Configuration final {
    // Assumes specific memory layout for serialization
    int setting1;
    int setting2;
public:
    void serialize(std::ostream&) const;
};
```

**Explanation:**
Final classes are appropriate in several scenarios: when the class makes specific assumptions about its memory layout (for serialization or interop), when performance optimizations depend on the class not being extended (devirtualization), when implementing implementation classes in pimpl patterns that shouldn't be subclassed, or when the class represents a complete concept that wouldn't benefit from extension. Final classes also enable compiler optimizations since no virtual dispatch is needed.

**Key takeaway:** Use final classes to prevent unintended inheritance that would violate assumptions, break optimizations, or misuse interfaces.

---

#### Q10: Can you override a virtual function with a different exception specification?
**Difficulty:** #advanced
**Category:** #exceptions #virtual_functions #interview_favorite
**Concepts:** #override #exception_specification #noexcept

**Answer:**
In C++11 and later, you can override with a more restrictive exception specification (including `noexcept`), and `override` accepts this as valid.

**Code example:**
```cpp
class Base {
    virtual void method() { }  // May throw anything
};

class Derived : public Base {
    void method() noexcept override { }  // ✅ More restrictive OK
};
```

**Explanation:**
Exception specifications follow Liskov Substitution Principle rules—derived classes can have more restrictive (stronger) exception specifications than base classes because this maintains substitutability. A function that throws nothing can safely substitute for one that might throw. The `override` keyword recognizes this and allows `noexcept` overrides of potentially-throwing base functions. This enables derived classes to provide stronger guarantees while maintaining interface compatibility.

**Key takeaway:** override allows more restrictive exception specifications including noexcept, following substitutability principles.

---

#### Q11: What is the interaction between final and pure virtual functions?
**Difficulty:** #advanced
**Category:** #abstract_classes #virtual_functions
**Concepts:** #final #pure_virtual #abstract_class

**Answer:**
A class with pure virtual functions is abstract and cannot be instantiated. Marking such functions final prevents derived classes from overriding them while still requiring implementation.

**Code example:**
```cpp
class Abstract {
    virtual void interface() = 0;  // Pure virtual
    virtual void sealed() final = 0;  // Pure virtual and final
};

class Concrete : public Abstract {
    void interface() override { }  // ✅ Must override
    // void sealed() override { }  // ❌ Cannot override final
};
```

**Explanation:**
When a pure virtual function is also final, derived classes cannot override it, yet the base class remains abstract due to the pure virtual function. This seems contradictory but is valid C++. The pattern forces derived classes to implement other pure virtuals while preventing override of specific functions. However, if all pure virtuals are final, the class becomes permanently abstract with no way to instantiate any derived class, which is likely a design error.

**Key takeaway:** Pure virtual and final can coexist but typically indicates unusual design; ensures interface implementation without allowing override.

---

#### Q12: How does override interact with const member functions?
**Difficulty:** #intermediate
**Category:** #const_correctness #virtual_functions
**Concepts:** #override #const #member_functions

**Answer:**
Const-qualification is part of the function signature. Override checking includes const-correctness, catching mismatches where one version is const and the other is not.

**Code example:**
```cpp
class Base {
    virtual void foo() const { }
    virtual void bar() { }
};

class Derived : public Base {
    // void foo() override { }        // ❌ Error: missing const
    // void bar() const override { }  // ❌ Error: added const
    void foo() const override { }     // ✅ Correct
    void bar() override { }           // ✅ Correct
};
```

**Explanation:**
In C++, const-qualified member functions have different signatures than non-const versions—they can even coexist as overloads. When overriding, the const-qualification must match exactly. Using `override` catches const-correctness mismatches that would otherwise create new virtual functions instead of overriding. This is particularly important for const-correct designs where base classes provide both const and non-const interfaces.

**Key takeaway:** override enforces const-correctness in overriding, catching mismatches between const and non-const member functions.

---

#### Q13: Can constructors or static functions use override or final?
**Difficulty:** #beginner
**Category:** #syntax #special_members
**Concepts:** #override #final #constructors #static_functions

**Answer:**
No, neither `override` nor `final` can be used with constructors, destructors (except for `override` on virtual destructors), or static functions, as these cannot participate in polymorphism.

**Code example:**
```cpp
class Base {
    static void method() { }
};

class Derived : public Base {
    // static void method() override { }  // ❌ Error: static functions
    // Derived() override { }             // ❌ Error: constructors
};
```

**Explanation:**
The `override` and `final` keywords only apply to virtual functions that participate in runtime polymorphism through virtual dispatch. Constructors and static functions cannot be virtual—constructors because the object is being created and the vtable doesn't exist yet, static functions because they don't have a `this` pointer. Attempting to use these keywords on non-virtual contexts results in compile errors.

**Key takeaway:** override and final only apply to instance virtual functions, not constructors, static functions, or non-virtual functions.

---

#### Q14: What happens when you delete through a base pointer to a final class?
**Difficulty:** #intermediate
**Category:** #memory_management #polymorphism
**Concepts:** #final #virtual_destructor #delete

**Answer:**
If the base class has a virtual destructor, deletion works correctly. If not, the behavior is undefined even with a final derived class.

**Code example:**
```cpp
class Base {
public:
    virtual ~Base() = default;  // Virtual destructor
};

class Derived final : public Base {
    ~Derived() override { }
};

int main() {
    Base* ptr = new Derived();
    delete ptr;  // ✅ Safe: virtual destructor ensures correct cleanup
}
```

**Explanation:**
Making a class final doesn't change the requirement for virtual destructors when deleting through base pointers. The `final` keyword prevents further derivation but doesn't affect the polymorphic deletion mechanism. Without a virtual destructor in the base class, deleting through a base pointer invokes undefined behavior regardless of whether the derived class is final. Virtual destructors remain essential for proper cleanup in inheritance hierarchies.

**Key takeaway:** final doesn't eliminate the need for virtual destructors; they're still required for safe polymorphic deletion.

---

#### Q15: Can you use override with reference qualifiers (&, &&)?
**Difficulty:** #advanced
**Category:** #move_semantics #virtual_functions #interview_favorite
**Concepts:** #override #reference_qualifier #lvalue #rvalue

**Answer:**
Yes, reference qualifiers are part of the function signature. Override checking includes them, requiring exact matches between base and derived versions.

**Code example:**
```cpp
class Base {
    virtual void method() & { }  // Lvalue reference qualifier
    virtual void method() && { } // Rvalue reference qualifier
};

class Derived : public Base {
    void method() & override { }   // ✅ Overrides lvalue version
    void method() && override { }  // ✅ Overrides rvalue version
    // void method() override { }  // ❌ Error: ambiguous
};
```

**Explanation:**
C++11 introduced reference qualifiers (`&` and `&&`) for member functions, allowing different behavior when called on lvalues versus rvalues. These qualifiers are part of the function signature and must match for proper overriding. The `override` keyword correctly handles reference qualifiers, ensuring that lvalue and rvalue overloads match their base class counterparts. This enables proper move optimization in inheritance hierarchies.

**Key takeaway:** override checking includes reference qualifiers, ensuring lvalue/rvalue overrides match their base class versions.

---

#### Q16: How do override and final interact with multiple inheritance?
**Difficulty:** #advanced
**Category:** #multiple_inheritance #virtual_functions
**Concepts:** #override #final #multiple_inheritance #diamond_problem

**Answer:**
In multiple inheritance, `override` can satisfy virtual functions from multiple base classes if they have matching signatures, and `final` prevents overriding in all inheritance paths.

**Code example:**
```cpp
class Interface1 {
    virtual void method() = 0;
};

class Interface2 {
    virtual void method() = 0;
};

class Implementation : public Interface1, public Interface2 {
    void method() override { }  // Overrides both base methods
};
```

**Explanation:**
When multiple base classes declare virtual functions with identical signatures, a single override in the derived class can satisfy all of them, and `override` verifies this correctly. If one base version is marked `final` through an intermediate class, the derived class cannot override it. In diamond inheritance scenarios with `virtual` inheritance, `override` and `final` work as expected, with `final` preventing overrides in all paths through the hierarchy.

**Key takeaway:** override and final work correctly with multiple inheritance, with single overrides satisfying multiple base functions.

---

#### Q17: Can a virtual function declared in one class be final in another without intermediate override?
**Difficulty:** #advanced
**Category:** #inheritance #virtual_functions
**Concepts:** #final #virtual #inheritance_hierarchy

**Answer:**
Yes, a derived class can mark a base class virtual function as final without explicitly overriding it, which both overrides and seals it in one declaration.

**Code example:**
```cpp
class Base {
    virtual void method() { }
};

class Derived : public Base {
    void method() final { }  // Implicitly overrides and makes final
};

class MoreDerived : public Derived {
    // void method() override { }  // ❌ Error: final prevents this
};
```

**Explanation:**
When you declare a function with the same signature as a base virtual function and mark it `final`, you're implicitly overriding it and preventing further overrides. While you can also explicitly add `override` (`void method() override final`), it's not required—the matching signature implies override. This pattern is useful when you want to provide a final implementation without the verbosity of both keywords.

**Key takeaway:** final implicitly overrides when signatures match, allowing derived classes to seal base virtual functions concisely.

---

#### Q18: What are the benefits of using override even if code compiles without it?
**Difficulty:** #intermediate
**Category:** #best_practices #maintainability
**Concepts:** #override #code_quality #refactoring

**Answer:**
Override provides compile-time verification of intent, catches refactoring errors when base signatures change, serves as documentation, and enables better tooling support and warnings.

**Explanation:**
While code compiles and runs correctly without `override`, adding it provides multiple benefits beyond immediate error detection. It documents programmer intent, making code more readable and maintainable. When base class signatures are refactored, all overriding functions with `override` will fail to compile, forcing updates rather than silently breaking polymorphism. IDEs and static analysis tools use `override` to provide better navigation, refactoring, and error detection. It's a form of defensive programming that catches bugs during development rather than production.

**Key takeaway:** Always use override for self-documentation, refactoring safety, tooling support, and catching signature mismatches early.

---

#### Q19: Can override be used on operator overloads?
**Difficulty:** #intermediate
**Category:** #operator_overloading #virtual_functions
**Concepts:** #override #operator_overloading #virtual

**Answer:**
Yes, operator overloads can be virtual and can use `override` if they override a base class virtual operator.

**Code example:**
```cpp
class Base {
public:
    virtual bool operator==(const Base& other) const {
        return true;
    }
};

class Derived : public Base {
public:
    bool operator==(const Base& other) const override {
        // Override base class operator
        return false;
    }
};
```

**Explanation:**
Operator overloads are member functions and can be virtual like any other member function. When overriding virtual operators, the `override` keyword should be used for the same safety benefits it provides for regular functions. This is particularly useful for comparison operators and stream insertion/extraction operators in polymorphic hierarchies. The same signature matching rules apply—parameter types, const-qualification, and return types must match (or be covariant for return types).

**Key takeaway:** Virtual operator overloads support override, providing the same safety benefits as regular virtual functions.

---

#### Q20: How do override and final affect compiler optimizations?
**Difficulty:** #advanced
**Category:** #optimization #performance
**Concepts:** #final #override #devirtualization #optimization

**Answer:**
`final` enables devirtualization optimizations where virtual calls can be resolved at compile time, while `override` has no runtime impact but aids static analysis.

**Code example:**
```cpp
class Interface {
    virtual void method() = 0;
};

class Implementation final : public Interface {
    void method() override final { }  // Can be devirtualized
};

void use(Implementation& obj) {
    obj.method();  // Compiler can optimize to direct call
}
```

**Explanation:**
When a class is marked `final`, the compiler knows no derived classes exist, enabling devirtualization—replacing virtual function calls with direct function calls, which can be inlined. Similarly, when a method is marked `final`, calls on instances of that type can be devirtualized. The `override` keyword doesn't directly enable optimizations but helps static analyzers understand code flow. Modern compilers can sometimes deduce finality through whole program optimization, but explicit `final` keywords make these optimizations reliable.

**Key takeaway:** final enables devirtualization optimizations by preventing further inheritance, allowing virtual calls to become direct calls.

---

## PRACTICE_TASKS: Override and Final Scenarios

### PRACTICE_TASKS: Error Detection and Design Validation

#### Q1
```cpp
class Base {
    virtual void process() { }
};

class Derived : public Base {
    void proccess() override { }  // Note: typo in name
};
// Does this compile?
```

#### Q2
```cpp
class Base {
    virtual void method() const { }
};

class Derived : public Base {
    void method() override { }
};
// Does this compile?
```

#### Q3
```cpp
class Base {
    virtual void func(int x) { }
};

class Derived : public Base {
    void func(long x) override { }
};
// Does this compile?
```

#### Q4
```cpp
class Base {
    void method() { }  // Not virtual
};

class Derived : public Base {
    void method() override { }
};
// Does this compile?
```

#### Q5
```cpp
class Base {
    virtual void method() final { }
};

class Derived : public Base {
    void method() override { }
};
// Does this compile?
```

#### Q6
```cpp
class Base final {
    virtual void method() { }
};

class Derived : public Base {
};
// Does this compile?
```

#### Q7
```cpp
class Base {
    virtual void method() { }
};

class Derived : public Base {
    void method() override final { }
};

class MoreDerived : public Derived {
    void method() override { }
};
// Does this compile?
```

#### Q8
```cpp
class Base {
    virtual ~Base() { }
};

class Derived : public Base {
    ~Derived() override { }
};
// Does this compile and is it good practice?
```

#### Q9
```cpp
class Base {
    virtual void method() { }
};

class Derived : public Base {
    virtual void method() final override { }  // Order: final override
};
// Does this compile? Does order matter?
```

#### Q10
```cpp
class Interface {
    virtual void method() = 0;
};

class Implementation : public Interface {
    void method() final { }  // No override keyword
};
// Does this compile?
```

#### Q11
```cpp
class Base {
    virtual void method() & { }  // Lvalue reference qualifier
};

class Derived : public Base {
    void method() && override { }  // Rvalue reference qualifier
};
// Does this compile?
```

#### Q12
```cpp
class Base {
    virtual void method() { }
};

class Derived : public Base {
    void method() noexcept override { }
};
// Does this compile?
```

#### Q13
```cpp
class Base {
    static void method() { }
};

class Derived : public Base {
    static void method() override { }
};
// Does this compile?
```

#### Q14
```cpp
class Base { };

class Derived final : public Base { };

class MoreDerived : public Derived { };
// Does this compile?
```

#### Q15
```cpp
class Base {
public:
    virtual Base* create() { return new Base(); }
};

class Derived : public Base {
public:
    Derived* create() override { return new Derived(); }
};
// Does this compile? What concept is this?
```

#### Q16
```cpp
class Base {
    virtual void method() = 0;  // Pure virtual
};

class Derived : public Base {
    void method() override final { }
};

Base* ptr = new Derived();
// Is this valid? Can Derived be instantiated?
```

#### Q17
```cpp
class Base {
private:
    virtual void method() { }
};

class Derived : public Base {
private:
    void method() override { }
};
// Does this compile? Can private virtual functions be overridden?
```

#### Q18
```cpp
class Base {
    virtual void method(int x = 10) { }
};

class Derived : public Base {
    void method(int x = 20) override { }
};

Base* ptr = new Derived();
ptr->method();  // Which default value is used?
```

#### Q19
```cpp
class Base {
    virtual void method() { }
};

class Derived : public Base {
    void method() override;  // Declaration only
};

void Derived::method() { }  // Definition outside class
// Is this valid?
```

#### Q20
```cpp
class Base {
    virtual void method() final = 0;  // Pure virtual and final
};

class Derived : public Base {
    void method() override { }
};
// Does this compile?
```

---

## QUICK_REFERENCE: Override and Final Design Guide

### Answer Key for Practice Questions

| Q# | Answer | Explanation | Key Concept |
|----|--------|-------------|-------------|
| 1 | No, compile error | `override` catches typo in function name (proccess vs process) | #override #typo_detection |
| 2 | No, compile error | `override` catches const-qualification mismatch (base is const, derived is not) | #override #const_correctness |
| 3 | No, compile error | `override` catches parameter type mismatch (int vs long) | #override #signature_matching |
| 4 | No, compile error | `override` requires base function to be virtual | #override #non_virtual_error |
| 5 | No, compile error | Cannot override `final` function from base class | #final #inheritance_prevention |
| 6 | No, compile error | Cannot inherit from `final` class | #final #class_sealing |
| 7 | No, compile error | `MoreDerived` cannot override `final` function from `Derived` | #final #override_prevention |
| 8 | Yes, good practice | Destructors can be overridden; using `override` is recommended | #override #virtual_destructor |
| 9 | Yes, order doesn't matter | Both `final override` and `override final` are valid and equivalent | #final #override #syntax |
| 10 | Yes | `final` implicitly overrides matching signature; `override` keyword optional | #final #implicit_override |
| 11 | No, compile error | Reference qualifiers must match; `&` in base, `&&` in derived is mismatch | #override #reference_qualifier |
| 12 | Yes | Can override with more restrictive exception specification (`noexcept`) | #override #noexcept #exception_spec |
| 13 | No, compile error | Static functions cannot be virtual or use `override` | #static #override_error |
| 14 | No, compile error | Cannot inherit from `final` class `Derived` | #final #inheritance_error |
| 15 | Yes, covariant return | Covariant return types allowed: derived can return more specific pointer type | #covariant_return #override |
| 16 | Yes, valid | Pure virtual can be overridden and made final; `Derived` is concrete and instantiable | #final #pure_virtual |
| 17 | Yes | Private virtual functions can be overridden (Non-Virtual Interface idiom) | #override #private_virtual |
| 18 | Base default (10) | Default arguments bound at compile-time based on pointer type, not runtime type | #default_arguments #virtual |
| 19 | Yes | `override` can be used in declaration; definition follows normal rules | #override #declaration_definition |
| 20 | No, compile error | Pure virtual and final contradicts: cannot override but must provide implementation | #final #pure_virtual #contradiction |

### Override and Final Quick Reference

| Keyword | Applies To | Purpose | Compile-Time Check |
|---------|-----------|---------|-------------------|
| `override` | Virtual functions | Verify function actually overrides base | Yes—error if no matching base |
| `final` (method) | Virtual functions | Prevent further overriding | Yes—error if derived overrides |
| `final` (class) | Class declaration | Prevent inheritance | Yes—error if derived inherits |
| `override final` | Virtual functions | Override and seal in one step | Both checks apply |

### Common Override Errors Caught

| Error Type | Without override | With override | Description |
|-----------|------------------|---------------|-------------|
| Name typo | Silently creates new function | Compile error | `process` vs `proccess` |
| Missing const | Silently creates non-const overload | Compile error | const mismatch |
| Added const | Silently creates const overload | Compile error | const mismatch |
| Parameter type | Silently creates overload | Compile error | int vs long, etc. |
| Return type | Silently fails or creates error | Compile error | Incompatible return types |
| Base not virtual | Silently hides base function | Compile error | Overriding non-virtual |
| Reference qualifier | Silently creates new overload | Compile error | `&` vs `&&` mismatch |

### Design Decision Matrix

| Scenario | Use override | Use final | Rationale |
|----------|-------------|-----------|-----------|
| Standard derived class | ✅ Always | ❌ No | Verify correct overriding |
| Intermediate class | ✅ Always | Maybe | Override now, seal if needed |
| Leaf implementation | ✅ Always | ✅ Recommended | Override and prevent further extension |
| Interface implementation | ✅ Always | Depends | Verify interface satisfaction |
| Critical cleanup logic | ✅ Always | ✅ final method | Prevent override of critical code |
| Performance-critical class | ✅ Always | ✅ final class | Enable devirtualization |
| Public API base class | N/A | ❌ No | Allow extensibility |
| Private implementation | ✅ Always | ✅ final class | Seal internal implementation |

### Virtual Function Override Rules

| Aspect | Requirement | Notes |
|--------|------------|-------|
| Function name | Must match exactly | Typos create new functions |
| Parameter types | Must match exactly | No conversions allowed |
| Const qualification | Must match exactly | Part of signature |
| Return type | Exact or covariant | Covariant: pointer/ref to derived class |
| Exception spec | Can be more restrictive | `noexcept` override of throwing is OK |
| Reference qualifier | Must match exactly | `&`, `&&`, or none |
| Access specifier | Can differ | Private virtual can be overridden |
| Virtual in derived | Optional | Implicitly virtual if overriding |

### Best Practices Checklist

- [ ] Always use `override` on all virtual function overrides
- [ ] Use `final` on classes that shouldn't be inherited
- [ ] Use `final` on methods with critical invariants
- [ ] Combine `override final` for leaf implementations
- [ ] Make virtual destructors `override` in derived classes
- [ ] Use `override` even if virtual keyword is present in derived class
- [ ] Mark implementation classes (pimpl) as `final`
- [ ] Use `final` for performance when devirtualization matters
- [ ] Never use `override` without ensuring base is virtual
- [ ] Consider `final` for all concrete classes in public APIs

### Interview Talking Points

**override keyword:**
- "Transforms runtime polymorphism bugs into compile-time errors"
- "Catches typos, signature mismatches, and const-correctness issues"
- "Zero runtime overhead—pure compile-time safety"
- "Should be used on all virtual function overrides without exception"

**final keyword:**
- "Provides explicit control over inheritance and override chains"
- "Enables devirtualization optimizations for performance"
- "Useful for sealing implementations with critical invariants"
- "Two contexts: final classes prevent inheritance, final methods prevent override"

**Design philosophy:**
- "Make intent explicit and compiler-verifiable"
- "Fail early at compile-time rather than late at runtime"
- "Zero-cost abstractions—safety without performance penalty"
- "Essential for maintainable inheritance hierarchies"

### Common Interview Questions

1. **"Why use override if code compiles without it?"**
   - Catches refactoring errors, documents intent, enables tooling, maintains correctness

2. **"When should a class be final?"**
   - Implementation classes, performance-critical code, sealed API implementations

3. **"Can you combine override and final?"**
   - Yes, provides one final override then seals the hierarchy at that point

4. **"Does override affect runtime performance?"**
   - No, purely compile-time with zero runtime overhead

5. **"What's the difference between final method and final class?"**
   - Final method prevents that specific function's override; final class prevents any inheritance
