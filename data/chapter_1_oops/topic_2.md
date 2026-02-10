## TOPIC: Encapsulation, Inheritance, and Polymorphism

### THEORY_SECTION: Core Concepts and Foundations

#### What is Encapsulation?

**Encapsulation** is the fundamental OOP principle of binding data and methods that operate on that data into a single unit (a class), while restricting direct access to the object's internal state. This is achieved in C++ through access specifiers: `private`, `protected`, and `public`. Encapsulation enables data hiding, interface-based programming, and maintainability by ensuring that the internal representation of an object is hidden from the outside world. Only designated public methods can interact with the private data, allowing controlled and validated access.

Importantly, encapsulation is enforced by the compiler at compile-time, not at the binary level. This means that while the compiler prevents unauthorized access to private members, the data still exists in memory and could theoretically be accessed through unsafe pointer manipulations (though this is undefined behavior). The `friend` keyword provides a legal mechanism to selectively grant access to private members when tight coupling between classes is necessary.

#### What is Inheritance?

**Inheritance** is a mechanism that allows a class (derived or child class) to acquire properties and behaviors from another class (base or parent class). This promotes code reuse, establishes hierarchical relationships, and is essential for achieving polymorphism. When a derived class inherits from a base class, it contains a base class subobject, and data members are laid out in memory from base to derived order.

Inheritance comes in three flavors based on access specifiers: public inheritance (the "is-a" relationship where the derived class can be used polymorphically as the base class), protected inheritance (rarely used, restricts the interface to derived classes only), and private inheritance (models "implemented-in-terms-of" relationships, hiding the inheritance from external code). The inheritance mode acts as a ceiling on access—it can only restrict, never expand, the accessibility of inherited members.

#### What is Polymorphism?

**Polymorphism** is the ability of objects to be treated as instances of their base class while exhibiting the behavior of their derived class at runtime. C++ supports two types of polymorphism: compile-time polymorphism (achieved through function overloading and templates) and runtime polymorphism (achieved through virtual functions and inheritance). Runtime polymorphism is implemented using virtual function tables (vtables) and virtual pointers (vptr).

When a class declares virtual functions, the compiler generates a vtable—a static lookup table containing pointers to the virtual function implementations. Each object of such a class contains a hidden vptr that points to its class's vtable. At runtime, when a virtual function is called through a base pointer or reference, the program uses the vptr to look up the correct function in the vtable, enabling dynamic dispatch. This mechanism is central to design patterns, interface-based programming, and achieving runtime flexibility in object-oriented systems.

### EDGE_CASES: Tricky Scenarios and Deep Internals

#### Edge Case 1: Function Hiding in Inheritance

When a derived class defines a function with the same name as a base class function (regardless of signature), it hides all base class overloads of that name. This is called function hiding or name hiding, and it's different from overriding. Even if the base class has multiple overloads of a function, defining any function with that name in the derived class makes all base class versions inaccessible unless explicitly brought into scope.

```cpp
class Base {
public:
    void func(int x) { std::cout << "Base::func(int)\n"; }
    void func(double x) { std::cout << "Base::func(double)\n"; }
};

class Derived : public Base {
public:
    void func(double x) { std::cout << "Derived::func(double)\n"; }
};

int main() {
    Derived d;
    d.func(10);    // ✅ Calls Derived::func(double), not Base::func(int)
    // d.func(5);  // ❌ Base::func(int) is hidden
}
```

This occurs because name lookup stops at the first scope where the name is found. Once `func` is found in `Derived`, the compiler doesn't look in `Base`. To fix this, use `using Base::func;` in the derived class to bring base class overloads into scope.

#### Edge Case 2: Object Slicing in Polymorphic Hierarchies

Object slicing occurs when a derived class object is assigned or passed by value to a base class object. The derived portion is "sliced off," leaving only the base class subobject. This destroys polymorphic behavior because the vtable pointer is replaced with the base class vtable, and all derived class data members are lost.

```cpp
class Animal {
public:
    int age = 0;
    virtual void speak() const { std::cout << "Animal speaks\n"; }
};

class Dog : public Animal {
public:
    int barkVolume = 5;
    void speak() const override { std::cout << "Dog barks\n"; }
};

void printAnimal(Animal a) {  // ❌ Pass by value causes slicing
    a.speak();  // Calls Animal::speak, not Dog::speak
}

int main() {
    Dog d;
    d.age = 3;
    d.barkVolume = 10;
    printAnimal(d);  // Output: "Animal speaks"
}
```

Object slicing is one of the most common polymorphism pitfalls. Always pass polymorphic objects by reference or pointer to preserve their dynamic type and enable correct virtual dispatch.

#### Edge Case 3: Virtual Functions in Constructors and Destructors

Calling virtual functions inside constructors or destructors does not produce polymorphic behavior. During base class construction, the derived part of the object doesn't exist yet, so the vptr points to the base class vtable. Similarly, during destruction, the derived part is destroyed first, so the vptr is updated to point to the base class vtable before the base destructor runs.

```cpp
class Base {
public:
    Base() { 
        speak();  // ❌ Calls Base::speak, never Derived::speak
    }
    virtual void speak() { std::cout << "Base speaks\n"; }
};

class Derived : public Base {
public:
    void speak() override { std::cout << "Derived speaks\n"; }
};

int main() {
    Derived d;  // Output: "Base speaks"
}
```

This is a deliberate design choice for safety—if virtual dispatch worked in constructors, calling a derived function before the derived members are initialized could access uninitialized memory. Never rely on virtual dispatch in constructors or destructors.

#### Edge Case 4: Non-Virtual Destructor in Polymorphic Base Classes

If a polymorphic base class (one with virtual functions) has a non-virtual destructor, deleting a derived object through a base pointer causes undefined behavior. Only the base class destructor is called, meaning derived class resources are not cleaned up, leading to resource leaks and potentially corrupted state.

```cpp
class Base {
public:
    ~Base() { std::cout << "Base dtor\n"; }  // ❌ Not virtual
};

class Derived : public Base {
private:
    int* data;
public:
    Derived() : data(new int[100]) {}
    ~Derived() { 
        delete[] data;  // ❌ Never called if deleted via Base*
        std::cout << "Derived dtor\n"; 
    }
};

void destroy(Base* b) {
    delete b;  // ❌ Undefined behavior: only ~Base() runs
}
```

This is such a critical issue that it's considered a fundamental rule: any class with virtual functions must have a virtual destructor. This ensures the correct destruction chain is followed when deleting through a base pointer.

#### Edge Case 5: Access Specifiers and Virtual Function Overriding

Access specifiers control who can call a function, but they do not affect whether a function can be overridden or participate in virtual dispatch. Even private virtual functions are placed in the vtable and can be overridden by derived classes (if the derived class has access to declare the override). The access level only determines calling permissions.

```cpp
class Base {
private:
    virtual void secret() { std::cout << "Base::secret\n"; }
public:
    void callSecret() { secret(); }  // Uses vtable lookup
};

class Derived : public Base {
private:
    void secret() override { std::cout << "Derived::secret\n"; }  // ✅ Legal
};

int main() {
    Derived d;
    d.callSecret();  // Output: "Derived::secret"
}
```

This demonstrates the separation of concerns: access control is a compile-time interface contract, while virtual dispatch is a runtime polymorphism mechanism. They operate independently.

#### Edge Case 6: Default Arguments and Virtual Functions

Default arguments are resolved statically at compile-time based on the static type of the pointer or reference, not the dynamic type of the object. This means that even though virtual function calls use dynamic dispatch, their default arguments do not—they're bound to the type of the pointer used to call the function.

```cpp
class Base {
public:
    virtual void display(int x = 10) { 
        std::cout << "Base: " << x << "\n"; 
    }
};

class Derived : public Base {
public:
    void display(int x = 20) override { 
        std::cout << "Derived: " << x << "\n"; 
    }
};

int main() {
    Base* ptr = new Derived();
    ptr->display();  // Output: "Derived: 10" (not 20!)
}
```

The function call resolves to `Derived::display()` via virtual dispatch, but the default argument `10` comes from the static type `Base*`. This confusing behavior is why many coding standards recommend avoiding default arguments in virtual functions entirely.

### CODE_EXAMPLES: Practical Demonstrations

#### Example 1: Basic Encapsulation with Private Data

```cpp
class BankAccount {
private:
    double balance;
    std::string accountNumber;
    
    bool validateAmount(double amount) {
        return amount > 0;  // ✅ Private helper validation
    }
    
public:
    BankAccount(std::string accNum) : balance(0), accountNumber(accNum) {}
    
    bool deposit(double amount) {
        if (!validateAmount(amount)) return false;
        balance += amount;  // ✅ Controlled access
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

This demonstrates proper encapsulation: the balance cannot be directly manipulated, all access goes through public methods that enforce validation rules, and internal helpers remain private. This ensures that invariants (like non-negative balance) are maintained.

#### Example 2: Function Hiding and Using-Declaration

```cpp
class Base {
public:
    void process(int x) { std::cout << "Base::process(int): " << x << "\n"; }
    void process(double x) { std::cout << "Base::process(double): " << x << "\n"; }
};

class Derived : public Base {
public:
    using Base::process;  // ✅ Brings base overloads into scope
    void process(std::string s) { 
        std::cout << "Derived::process(string): " << s << "\n"; 
    }
};

int main() {
    Derived d;
    d.process(10);          // ✅ Calls Base::process(int)
    d.process(3.14);        // ✅ Calls Base::process(double)
    d.process("hello");     // ✅ Calls Derived::process(string)
}
```

Without the `using` declaration, adding any `process` function in `Derived` would hide all base class `process` overloads. The using-declaration makes all base overloads visible alongside the derived class additions.

#### Example 3: Correct Polymorphic Design with Virtual Destructor

```cpp
class Shape {
private:
    std::string name;
public:
    Shape(std::string n) : name(n) {}
    virtual ~Shape() { std::cout << "~Shape\n"; }  // ✅ Virtual destructor
    
    virtual double area() const = 0;  // Pure virtual
    virtual void draw() const = 0;
    
    std::string getName() const { return name; }
};

class Circle : public Shape {
private:
    double radius;
public:
    Circle(double r) : Shape("Circle"), radius(r) {}
    ~Circle() override { std::cout << "~Circle\n"; }
    
    double area() const override { return 3.14159 * radius * radius; }
    void draw() const override { std::cout << "Drawing circle\n"; }
};

int main() {
    Shape* s = new Circle(5.0);
    std::cout << s->area() << "\n";
    delete s;  // ✅ Correct: both destructors called
}
```

This shows the correct pattern for polymorphic hierarchies: virtual destructor in the base class, pure virtual functions for the interface, and proper override in derived classes. The virtual destructor ensures both `~Circle()` and `~Shape()` are called when deleting through the base pointer.

#### Example 4: Object Slicing Prevention

```cpp
class Animal {
protected:
    Animal(const Animal&) = default;  // ✅ Protected copy constructor
    Animal& operator=(const Animal&) = default;
public:
    Animal() = default;
    virtual ~Animal() = default;
    virtual void speak() const = 0;
};

class Dog : public Animal {
public:
    void speak() const override { std::cout << "Woof!\n"; }
};

// Correct way: pass by reference
void makeSpeak(const Animal& a) {  // ✅ Reference, no slicing
    a.speak();
}

int main() {
    Dog d;
    makeSpeak(d);  // ✅ Polymorphism preserved
    
    // Animal a = d;  // ❌ Would not compile (protected copy)
}
```

By making the copy constructor protected, we prevent accidental slicing while still allowing derived classes to implement copying if needed. Passing by reference ensures polymorphic behavior is preserved.

#### Example 5: Private Virtual Functions and Template Method Pattern

```cpp
class DataProcessor {
private:
    virtual void preProcess() { std::cout << "Default pre-processing\n"; }
    virtual void process() = 0;  // Must override
    virtual void postProcess() { std::cout << "Default post-processing\n"; }
    
public:
    void execute() {  // ✅ Public non-virtual interface
        preProcess();
        process();
        postProcess();
    }
    virtual ~DataProcessor() = default;
};

class CSVProcessor : public DataProcessor {
private:
    void preProcess() override { std::cout << "CSV: Opening file\n"; }
    void process() override { std::cout << "CSV: Parsing data\n"; }
    // Uses default postProcess
};

int main() {
    DataProcessor* proc = new CSVProcessor();
    proc->execute();  // ✅ Calls overridden private virtuals
    delete proc;
}
```

This demonstrates the Template Method pattern: the public interface calls private virtual functions that can be customized by derived classes. The base class controls the algorithm structure while allowing customization of specific steps.

#### Example 6: Multiple Inheritance and vtable Layout

```cpp
class Printable {
public:
    virtual void print() const = 0;
    virtual ~Printable() = default;
};

class Serializable {
public:
    virtual void serialize() const = 0;
    virtual ~Serializable() = default;
};

class Document : public Printable, public Serializable {
private:
    std::string content;
public:
    Document(std::string c) : content(c) {}
    
    void print() const override { 
        std::cout << "Printing: " << content << "\n"; 
    }
    
    void serialize() const override { 
        std::cout << "Serializing: " << content << "\n"; 
    }
};

int main() {
    Document doc("Hello");
    Printable* p = &doc;
    Serializable* s = &doc;
    
    p->print();       // ✅ Virtual dispatch works
    s->serialize();   // ✅ Virtual dispatch works
}
```

With multiple inheritance, the object has multiple vptrs—one for each base class with virtual functions. Pointer conversions adjust the pointer value to point to the correct subobject, ensuring virtual dispatch works correctly for each interface.

#### Example 7: Const Correctness in Overriding

```cpp
class Base {
public:
    virtual void display() const { 
        std::cout << "Base const version\n"; 
    }
    
    virtual void modify() { 
        std::cout << "Base non-const version\n"; 
    }
};

class Derived : public Base {
public:
    void display() const override {  // ✅ Const matches
        std::cout << "Derived const version\n"; 
    }
    
    void modify() override {  // ✅ Non-const matches
        std::cout << "Derived non-const version\n"; 
    }
    
    // void display() override {}  // ❌ Would not compile - missing const
};

int main() {
    const Derived d;
    d.display();  // Calls const version
    
    Derived d2;
    d2.modify();  // Calls non-const version
}
```

The `const` qualifier is part of the function signature for member functions. Omitting it creates a different function that doesn't override the base version. Always use the `override` keyword to catch such mismatches at compile time.

#### Example 8: Pure Virtual Functions with Default Implementations

```cpp
class Logger {
public:
    virtual void log(const std::string& msg) = 0;  // Pure virtual
    virtual ~Logger() = default;
};

// Provide default implementation
void Logger::log(const std::string& msg) {
    std::cout << "[DEFAULT] " << msg << "\n";
}

class FileLogger : public Logger {
public:
    void log(const std::string& msg) override {
        Logger::log(msg);  // ✅ Call base implementation
        std::cout << "[FILE] Writing to file\n";
    }
};

int main() {
    Logger* logger = new FileLogger();
    logger->log("System started");
    delete logger;
}
```

A pure virtual function can have an implementation, which derived classes can call explicitly. This is useful for providing common functionality that derived classes can reuse or extend.

#### Example 9: Autonomous Vehicle - Perception System with Encapsulation and Polymorphism

```cpp
#include <iostream>
#include <vector>
#include <string>

// Abstract interface for all perception modules
class PerceptionModule {
protected:
    std::string module_id;
    bool initialized;

    // Protected helper for derived classes
    void logStatus(const std::string& msg) const {
        std::cout << "[" << module_id << "] " << msg << std::endl;
    }

private:
    // Encapsulated data - cannot be directly modified
    double confidence_threshold;

    // Private validation
    bool validateConfidence(double conf) const {
        return conf >= 0.0 && conf <= 1.0;
    }

public:
    PerceptionModule(std::string id, double threshold = 0.75)
        : module_id(id), initialized(false), confidence_threshold(threshold) {
        if (!validateConfidence(threshold)) {
            confidence_threshold = 0.75;  // Default safe value
        }
    }

    virtual ~PerceptionModule() = default;

    // Pure virtual - must be implemented by derived classes
    virtual void processData() = 0;
    virtual std::string getModuleType() const = 0;

    // Public interface with controlled access
    void initialize() {
        logStatus("Initializing...");
        initialized = true;
    }

    bool isReady() const { return initialized; }

    double getConfidenceThreshold() const { return confidence_threshold; }

    void setConfidenceThreshold(double threshold) {
        if (validateConfidence(threshold)) {
            confidence_threshold = threshold;
            logStatus("Confidence threshold updated");
        } else {
            logStatus("Invalid confidence value - rejected");
        }
    }
};

// Object detection using camera
class ObjectDetector : public PerceptionModule {
private:
    int objects_detected;
    double detection_confidence;

public:
    ObjectDetector(std::string id)
        : PerceptionModule(id, 0.80), objects_detected(0), detection_confidence(0.0) {}

    void processData() override {
        if (!initialized) {
            logStatus("ERROR: Not initialized");
            return;
        }

        // Simulate object detection
        objects_detected = 5;
        detection_confidence = 0.92;

        if (detection_confidence >= getConfidenceThreshold()) {
            logStatus("Detected " + std::to_string(objects_detected) +
                     " objects (confidence: " + std::to_string(detection_confidence) + ")");
        } else {
            logStatus("Detection confidence too low");
        }
    }

    std::string getModuleType() const override {
        return "ObjectDetector";
    }

    int getDetectedCount() const { return objects_detected; }
};

// Lane detection using camera
class LaneDetector : public PerceptionModule {
private:
    bool lanes_valid;
    double lane_center_offset;

public:
    LaneDetector(std::string id)
        : PerceptionModule(id, 0.85), lanes_valid(false), lane_center_offset(0.0) {}

    void processData() override {
        if (!initialized) {
            logStatus("ERROR: Not initialized");
            return;
        }

        // Simulate lane detection
        lanes_valid = true;
        lane_center_offset = 0.15;  // 15cm offset from center

        logStatus("Lanes detected - offset: " + std::to_string(lane_center_offset) + "m");
    }

    std::string getModuleType() const override {
        return "LaneDetector";
    }

    bool areLanesValid() const { return lanes_valid; }
    double getCenterOffset() const { return lane_center_offset; }
};

// Free space detection using LiDAR
class FreeSpaceDetector : public PerceptionModule {
private:
    double max_free_distance;

public:
    FreeSpaceDetector(std::string id)
        : PerceptionModule(id, 0.90), max_free_distance(0.0) {}

    void processData() override {
        if (!initialized) {
            logStatus("ERROR: Not initialized");
            return;
        }

        // Simulate free space detection
        max_free_distance = 25.5;  // 25.5 meters clear ahead
        logStatus("Free space: " + std::to_string(max_free_distance) + "m ahead");
    }

    std::string getModuleType() const override {
        return "FreeSpaceDetector";
    }

    double getFreeDistance() const { return max_free_distance; }
};

// Perception manager - demonstrates polymorphism
class PerceptionSystem {
private:
    std::vector<PerceptionModule*> modules;

public:
    void addModule(PerceptionModule* module) {
        modules.push_back(module);
    }

    void initializeAll() {
        std::cout << "\n=== Initializing Perception System ===" << std::endl;
        for (auto* module : modules) {
            module->initialize();
        }
    }

    void processAll() {
        std::cout << "\n=== Processing Perception Data ===" << std::endl;
        for (auto* module : modules) {
            if (module->isReady()) {
                module->processData();  // ✅ Polymorphic call
            }
        }
    }

    void listModules() const {
        std::cout << "\n=== Active Modules ===" << std::endl;
        for (const auto* module : modules) {
            std::cout << "  - " << module->getModuleType()
                     << " (threshold: " << module->getConfidenceThreshold() << ")"
                     << std::endl;
        }
    }

    ~PerceptionSystem() {
        for (auto* module : modules) {
            delete module;  // ✅ Virtual destructor ensures proper cleanup
        }
    }
};

int main() {
    PerceptionSystem system;

    // Add different perception modules
    system.addModule(new ObjectDetector("cam_front_obj"));
    system.addModule(new LaneDetector("cam_front_lane"));
    system.addModule(new FreeSpaceDetector("lidar_front"));

    system.listModules();
    system.initializeAll();
    system.processAll();

    return 0;
}
```

**Output:**
```
=== Active Modules ===
  - ObjectDetector (threshold: 0.8)
  - LaneDetector (threshold: 0.85)
  - FreeSpaceDetector (threshold: 0.9)

=== Initializing Perception System ===
[cam_front_obj] Initializing...
[cam_front_lane] Initializing...
[lidar_front] Initializing...

=== Processing Perception Data ===
[cam_front_obj] Detected 5 objects (confidence: 0.920000)
[cam_front_lane] Lanes detected - offset: 0.150000m
[lidar_front] Free space: 25.500000m ahead
```

This example demonstrates all three core OOP principles in an autonomous vehicle context:

1. **Encapsulation**:
   - Private `confidence_threshold` with controlled access via getters/setters
   - Private `validateConfidence()` ensures data integrity
   - Protected `logStatus()` available only to derived classes

2. **Inheritance**:
   - `ObjectDetector`, `LaneDetector`, and `FreeSpaceDetector` inherit from `PerceptionModule`
   - Each derived class extends functionality while maintaining common interface
   - Protected members allow derived classes to use shared functionality

3. **Polymorphism**:
   - Pure virtual `processData()` and `getModuleType()` enable runtime polymorphism
   - `PerceptionSystem` treats all modules uniformly through base class interface
   - Virtual destructor ensures proper cleanup of derived objects

**Real-world relevance**: Autonomous vehicles process data from multiple perception modules (cameras, LiDAR, RADAR). Using polymorphism allows the perception system to manage different sensor types uniformly while each implements its specific detection algorithm. Encapsulation protects critical parameters like confidence thresholds from invalid modifications.

### INTERVIEW_QA: Comprehensive Questions and Answers

#### Q1: What is encapsulation and how is it implemented in C++?
**Difficulty:** #beginner  
**Category:** #fundamentals #design_pattern  
**Concepts:** #encapsulation #access_specifiers #data_hiding #interface

**Answer:**
Encapsulation is the binding of data and methods that manipulate that data into a single unit (class), with restricted access to internal details through access specifiers: private, protected, and public.

**Explanation:**
Encapsulation enforces information hiding by making data members private and providing public methods for controlled access. This prevents external code from directly manipulating internal state, allowing the class to maintain invariants and change implementation details without affecting client code. The friend keyword can selectively grant access when tight coupling is necessary. Encapsulation is enforced at compile-time by the compiler, not at runtime.

**Key takeaway:** Use encapsulation to hide implementation details and provide a stable public interface that protects class invariants.

---

#### Q2: How does function hiding differ from function overriding?
**Difficulty:** #intermediate  
**Category:** #inheritance #interview_favorite  
**Concepts:** #function_hiding #override #name_lookup #using_declaration

**Answer:**
Function hiding occurs when a derived class defines any function with the same name as a base class function, making all base class overloads of that name inaccessible, while overriding replaces a virtual function's implementation for polymorphic behavior.

**Code example:**
```cpp
class Base {
public:
    void func(int) {}
    void func(double) {}
    virtual void vfunc() {}
};

class Derived : public Base {
public:
    void func(char) {}  // ❌ Hides both Base::func overloads
    void vfunc() override {}  // ✅ Overrides Base::vfunc
};
```

**Explanation:**
Hiding is a name lookup issue—once the compiler finds the name in the derived class, it stops looking in base classes. This happens regardless of signatures. Overriding requires matching signatures and the virtual keyword. Use `using Base::func;` to bring hidden base overloads into scope. Overriding enables polymorphism; hiding breaks it.

**Key takeaway:** Use the override keyword to catch hiding when you intended to override, and use using-declarations to prevent accidental hiding.

---

#### Q3: What is object slicing and how can it be prevented?
**Difficulty:** #intermediate  
**Category:** #inheritance #memory  
**Concepts:** #object_slicing #polymorphism #pass_by_reference #copy_constructor

**Answer:**
Object slicing occurs when a derived class object is copied into a base class object by value, discarding the derived portion and destroying polymorphic behavior.

**Code example:**
```cpp
class Base {
public:
    virtual void func() { std::cout << "Base\n"; }
};

class Derived : public Base {
    int extra;
public:
    void func() override { std::cout << "Derived\n"; }
};

void process(Base b) {  // ❌ Slicing
    b.func();  // Calls Base::func
}
```

**Explanation:**
When passing by value, only the Base subobject is copied, losing all Derived members and the derived class's vtable. The result is a pure Base object with Base behavior. Prevention strategies include: always pass polymorphic objects by pointer or reference, make base class copy/move constructors protected or deleted, or use smart pointers. Slicing destroys the fundamental premise of polymorphism.

**Key takeaway:** Never pass polymorphic objects by value—always use references or pointers to preserve dynamic type.

---

#### Q4: Why should polymorphic base classes have virtual destructors?
**Difficulty:** #intermediate  
**Category:** #memory #interview_favorite  
**Concepts:** #virtual_functions #destructors #memory_leak #undefined_behavior #raii

**Answer:**
Virtual destructors ensure that when deleting a derived object through a base pointer, both the derived and base destructors are called in the correct order, preventing resource leaks and undefined behavior.

**Code example:**
```cpp
class Base {
public:
    virtual ~Base() {}  // ✅ Virtual destructor
};

class Derived : public Base {
    int* data;
public:
    Derived() : data(new int[100]) {}
    ~Derived() { delete[] data; }  // ✅ Will be called
};

Base* ptr = new Derived();
delete ptr;  // ✅ Both destructors called
```

**Explanation:**
Without a virtual destructor, `delete ptr` only calls the Base destructor, leaving Derived resources unreleased—this is undefined behavior. Virtual destructors enable proper polymorphic destruction by using the vtable to find the correct destructor chain. This is critical for RAII and resource management. Any class with virtual functions should have a virtual destructor, even if it does nothing.

**Key takeaway:** Always declare virtual destructors in polymorphic base classes to ensure correct cleanup of derived objects.

---

#### Q5: Can you call virtual functions from constructors or destructors?
**Difficulty:** #advanced  
**Category:** #inheritance #interview_favorite  
**Concepts:** #virtual_functions #constructors #destructors #vptr #undefined_behavior

**Answer:**
Yes, you can call them, but virtual dispatch does not work—the base class version is always called because the vptr points to the current construction/destruction phase's vtable, not the most derived class.

**Code example:**
```cpp
class Base {
public:
    Base() { init(); }  // ❌ Calls Base::init
    virtual void init() { std::cout << "Base init\n"; }
};

class Derived : public Base {
public:
    void init() override { std::cout << "Derived init\n"; }
};

Derived d;  // Output: "Base init"
```

**Explanation:**
During Base construction, the Derived part doesn't exist yet, so calling virtual functions on uninitialized memory would be dangerous. C++ prevents this by making the vptr point to Base's vtable during Base construction. Similarly, during destruction, the Derived part is destroyed before Base, so the vptr is updated to Base's vtable. This is deliberate for safety—never rely on virtual dispatch in constructors or destructors.

**Key takeaway:** Virtual function calls in constructors and destructors always resolve to the current class's version, never to overrides.

---

#### Q6: What is the difference between overloading and overriding?
**Difficulty:** #beginner  
**Category:** #syntax #fundamentals  
**Concepts:** #function_overloading #override #polymorphism #compile_time #runtime

**Answer:**
Overloading creates multiple functions with the same name but different parameters in the same scope (compile-time polymorphism), while overriding replaces a base class virtual function in a derived class (runtime polymorphism).

**Code example:**
```cpp
class Example {
public:
    void func(int x) {}     // ✅ Overload
    void func(double x) {}  // ✅ Overload
    
    virtual void vfunc() {}
};

class Derived : public Example {
public:
    void vfunc() override {}  // ✅ Override
};
```

**Explanation:**
Overloading is resolved at compile-time based on argument types—the compiler selects the best match. Overriding requires the virtual keyword and matching signature, and is resolved at runtime via the vtable based on the object's dynamic type. Overloading enables convenient APIs with the same operation name, while overriding enables polymorphism and dynamic behavior customization.

**Key takeaway:** Overloading is compile-time function selection; overriding is runtime behavior customization for virtual functions.

---

#### Q7: What are vtables and vptrs?
**Difficulty:** #advanced  
**Category:** #memory #performance  
**Concepts:** #vtable #vptr #virtual_functions #polymorphism #dynamic_dispatch

**Answer:**
A vtable is a per-class lookup table containing function pointers for virtual functions, and a vptr is a hidden pointer in each object that points to its class's vtable, enabling runtime polymorphic dispatch.

**Code example:**
```cpp
class Base {
public:
    virtual void foo() {}
    virtual void bar() {}
};  // Creates Base vtable with &Base::foo, &Base::bar

class Derived : public Base {
public:
    void foo() override {}  // Derived vtable has &Derived::foo, &Base::bar
};

Base* ptr = new Derived();
ptr->foo();  // Uses ptr->vptr->vtable[0] to call Derived::foo
```

**Explanation:**
The compiler generates one vtable per class with virtual functions, containing function pointers in declaration order. Each object of such a class has a vptr (usually as the first member) pointing to its class's vtable. When calling a virtual function, the program dereferences the vptr to find the vtable, then indexes into it to get the correct function pointer. This indirection enables runtime polymorphism but adds memory (one pointer per object) and performance costs (extra indirection).

**Key takeaway:** Vtables enable dynamic dispatch through per-class function pointer tables accessed via per-object vptrs.

---

#### Q8: Can virtual functions be private or protected?
**Difficulty:** #intermediate  
**Category:** #inheritance #design_pattern  
**Concepts:** #virtual_functions #access_specifiers #override #template_method

**Answer:**
Yes, virtual functions can be private or protected—they can still be overridden and participate in dynamic dispatch, as access specifiers only control calling permissions, not vtable behavior.

**Code example:**
```cpp
class Base {
private:
    virtual void impl() { std::cout << "Base\n"; }
public:
    void interface() { impl(); }  // ✅ Uses vtable
};

class Derived : public Base {
private:
    void impl() override { std::cout << "Derived\n"; }  // ✅ Legal
};
```

**Explanation:**
Access control is orthogonal to virtual dispatch—it's checked at compile-time based on where the call is made, while virtual dispatch is a runtime mechanism. Private virtual functions are the basis of the Template Method pattern, where the base class defines a public non-virtual interface that calls private virtual hooks that derived classes override. Protected virtuals allow customization only within the inheritance hierarchy.

**Key takeaway:** Access specifiers don't prevent virtual function overriding—they only control who can call the function directly.

---

#### Q9: What happens if you forget the virtual keyword on a destructor?
**Difficulty:** #intermediate  
**Category:** #memory #interview_favorite  
**Concepts:** #destructors #virtual_functions #memory_leak #undefined_behavior

**Answer:**
Deleting a derived object through a base pointer without a virtual destructor causes undefined behavior—only the base destructor runs, leaving derived resources unreleased and potentially causing memory leaks or corruption.

**Code example:**
```cpp
class Base {
public:
    ~Base() {}  // ❌ Not virtual
};

class Derived : public Base {
    int* data;
public:
    Derived() : data(new int[100]) {}
    ~Derived() { delete[] data; }  // ❌ Never called
};

Base* ptr = new Derived();
delete ptr;  // ❌ UB: only ~Base() runs, data leaks
```

**Explanation:**
Without virtual, the destructor call is resolved statically based on the pointer type. Since ptr is Base*, only Base's destructor runs. The Derived destructor never executes, so its cleanup code doesn't run. This violates RAII principles and creates resource leaks. The solution is simple: always make destructors virtual in polymorphic base classes, even if empty.

**Key takeaway:** Non-virtual destructors in polymorphic bases cause undefined behavior—always use virtual destructors.

---

#### Q10: How does const affect virtual function overriding?
**Difficulty:** #intermediate  
**Category:** #syntax #interview_favorite  
**Concepts:** #const_correctness #override #virtual_functions #function_signature

**Answer:**
The const qualifier is part of the function signature for member functions—a const function and non-const function are completely different, so omitting const prevents overriding and creates a new function.

**Code example:**
```cpp
class Base {
public:
    virtual void func() const { std::cout << "Base\n"; }
};

class Derived : public Base {
public:
    void func() { std::cout << "Derived\n"; }  // ❌ Not override!
};

Base* ptr = new Derived();
ptr->func();  // Calls Base::func, not Derived::func
```

**Explanation:**
The signatures `void func() const` and `void func()` are distinct—they can coexist as overloads. Without const in Derived, the function doesn't match Base's signature, so it's not an override. Using the override keyword would catch this error at compile-time. The const version can be called on const objects, while the non-const version cannot. Always match const-ness exactly when overriding.

**Key takeaway:** Const is part of the signature—omitting it breaks overriding; always use override to catch mismatches.

---

#### Q11: What is the Rule of Five and why does it matter for polymorphism?
**Difficulty:** #advanced  
**Category:** #memory #design_pattern  
**Concepts:** #rule_of_five #copy_constructor #move_semantics #destructors #raii

**Answer:**
The Rule of Five states that if you define any of destructor, copy constructor, copy assignment, move constructor, or move assignment, you should explicitly define all five to ensure correct resource management and copying behavior.

**Code example:**
```cpp
class Resource {
    int* data;
public:
    Resource() : data(new int[100]) {}
    ~Resource() { delete[] data; }
    
    Resource(const Resource& other) : data(new int[100]) {
        std::copy(other.data, other.data+100, data);
    }
    
    Resource& operator=(const Resource& other) {
        if (this != &other) {
            int* newData = new int[100];
            std::copy(other.data, other.data+100, newData);
            delete[] data;
            data = newData;
        }
        return *this;
    }
    
    Resource(Resource&& other) noexcept : data(other.data) {
        other.data = nullptr;
    }
    
    Resource& operator=(Resource&& other) noexcept {
        if (this != &other) {
            delete[] data;
            data = other.data;
            other.data = nullptr;
        }
        return *this;
    }
};
```

**Explanation:**
For polymorphic classes, the Rule of Five is critical because derived classes may allocate resources that need proper cleanup. If the base class manages resources, all five special members should be defined (or explicitly deleted/defaulted). Polymorphic classes should typically have virtual destructors, protected copy/move constructors to prevent slicing, and deleted or carefully implemented assignment operators. Following the Rule of Five prevents resource leaks, double deletions, and slicing issues.

**Key takeaway:** Define or delete all five special members when managing resources, especially in polymorphic hierarchies.

---

#### Q12: Can you override a non-virtual function?
**Difficulty:** #beginner  
**Category:** #syntax #fundamentals  
**Concepts:** #override #virtual_functions #static_binding #polymorphism

**Answer:**
No, you cannot override a non-virtual function—you can redefine it in a derived class, but this creates function hiding, not polymorphic overriding, and calls are resolved statically.

**Code example:**
```cpp
class Base {
public:
    void func() { std::cout << "Base\n"; }  // Not virtual
};

class Derived : public Base {
public:
    void func() { std::cout << "Derived\n"; }  // ❌ Hides, not overrides
};

Base* ptr = new Derived();
ptr->func();  // Calls Base::func (static binding)
```

**Explanation:**
Without the virtual keyword, function calls are resolved at compile-time based on the pointer type, not the object's dynamic type. The derived class version hides the base version but doesn't participate in polymorphism. To get polymorphic behavior, the base function must be virtual. Attempting to use override on a non-virtual function causes a compilation error, which helps catch this mistake.

**Key takeaway:** Only virtual functions can be overridden—non-virtual functions use static binding regardless of object type.

---

#### Q13: What is the difference between public, protected, and private inheritance?
**Difficulty:** #intermediate  
**Category:** #inheritance #design_pattern  
**Concepts:** #public_inheritance #protected_inheritance #private_inheritance #is_a_relationship

**Answer:**
Public inheritance models "is-a" relationships and preserves member access levels, protected inheritance makes public members protected, and private inheritance makes all accessible members private, modeling implementation reuse rather than type relationships.

**Code example:**
```cpp
class Base {
public:
    void pub() {}
protected:
    void prot() {}
};

class PublicDerived : public Base {
    // pub() is public, prot() is protected
};

class ProtectedDerived : protected Base {
    // pub() is protected, prot() is protected
};

class PrivateDerived : private Base {
    // pub() is private, prot() is private
};
```

**Explanation:**
Public inheritance is the most common and enables polymorphic use of derived objects as base objects. Protected inheritance is rare and restricts the base interface to the inheritance hierarchy. Private inheritance completely hides the inheritance relationship from external code—it's similar to composition and is used for implementation reuse without implying an "is-a" relationship. The inheritance mode acts as a ceiling on accessibility—it can only restrict, never expand, access to inherited members.

**Key takeaway:** Use public inheritance for polymorphic "is-a" relationships; private inheritance for implementation reuse without exposing the base type.

---

#### Q14: Do default arguments work with virtual functions?
**Difficulty:** #advanced  
**Category:** #syntax #interview_favorite  
**Concepts:** #virtual_functions #default_arguments #static_binding #polymorphism

**Answer:**
Default arguments are resolved statically at compile-time based on the pointer type, not the dynamic object type, even though the virtual function call itself uses dynamic dispatch.

**Code example:**
```cpp
class Base {
public:
    virtual void show(int x = 10) { std::cout << x << "\n"; }
};

class Derived : public Base {
public:
    void show(int x = 20) override { std::cout << x << "\n"; }
};

Base* ptr = new Derived();
ptr->show();  // ✅ Calls Derived::show but uses default 10 from Base
```

**Explanation:**
This confusing behavior occurs because default arguments are not part of the function signature—they're substituted by the compiler at the call site based on the static type of the expression. The function call resolves to Derived::show() via virtual dispatch, but the argument value comes from Base's default. This inconsistency is why many style guides prohibit default arguments in virtual functions.

**Key takeaway:** Avoid default arguments in virtual functions—they're resolved statically while the function call is resolved dynamically.

---

#### Q15: What is a pure virtual function and can it have an implementation?
**Difficulty:** #intermediate  
**Category:** #syntax #design_pattern  
**Concepts:** #pure_virtual #abstract_class #interface #override

**Answer:**
A pure virtual function is declared with `= 0`, making the class abstract (cannot be instantiated), and it can optionally have an implementation that derived classes can explicitly call.

**Code example:**
```cpp
class Interface {
public:
    virtual void operation() = 0;  // Pure virtual
    virtual ~Interface() = default;
};

void Interface::operation() {  // ✅ Can have implementation
    std::cout << "Default implementation\n";
}

class Concrete : public Interface {
public:
    void operation() override {
        Interface::operation();  // ✅ Call base implementation
        std::cout << "Concrete implementation\n";
    }
};
```

**Explanation:**
Marking a function pure virtual enforces that derived classes must provide an override, making the class abstract and non-instantiable. However, providing a body for the pure virtual function allows derived classes to optionally call the base implementation for common functionality. This is useful for providing default behavior while still requiring derived classes to explicitly opt-in. Pure virtual functions are the foundation of interface design in C++.

**Key takeaway:** Pure virtual functions define interfaces and can provide optional default implementations for derived classes to call.

---

#### Q16: How does multiple inheritance affect vtables and vptrs?
**Difficulty:** #advanced  
**Category:** #memory #performance  
**Concepts:** #multiple_inheritance #vtable #vptr #memory_layout #polymorphism

**Answer:**
With multiple inheritance from classes with virtual functions, a derived object contains multiple vptrs—one for each base class—and the compiler generates multiple vtables to handle polymorphism for each base class interface.

**Code example:**
```cpp
class A {
public:
    virtual void aFunc() {}
};

class B {
public:
    virtual void bFunc() {}
};

class C : public A, public B {
public:
    void aFunc() override {}
    void bFunc() override {}
};
// sizeof(C) includes two vptrs plus C's members
```

**Explanation:**
Each base class with virtual functions adds a vptr to the derived object's layout. When you cast a C* to B*, the pointer value is adjusted to point to the B subobject (and its vptr). Each vtable contains function pointers for that class's virtual functions. This enables polymorphic behavior through either base class interface but adds memory overhead (multiple vptrs) and complexity to pointer conversions. Diamond inheritance with virtual base classes adds even more complexity.

**Key takeaway:** Multiple inheritance with virtual functions creates multiple vptrs per object and requires careful pointer adjustment for polymorphism.

---

#### Q17: What is the Empty Base Optimization and how does it relate to polymorphism?
**Difficulty:** #advanced  
**Category:** #memory #performance  
**Concepts:** #empty_base_optimization #memory_layout #sizeof #inheritance

**Answer:**
Empty Base Optimization (EBO) allows empty base classes to occupy zero bytes in derived class layout, which is useful for policy classes and traits in polymorphic designs, though empty classes cannot benefit from EBO when used as members.

**Code example:**
```cpp
struct Empty {};

struct WithMember {
    Empty e;    // sizeof at least 1
    int x;
};  // sizeof typically 8 (4 bytes padding + 4 bytes int)

struct WithBase : Empty {
    int x;
};  // sizeof typically 4 (EBO eliminates Empty's storage)
```

**Explanation:**
Empty classes must have size at least 1 to ensure distinct addresses, but when used as a base class, EBO allows the compiler to give them zero size. This is critical for template metaprogramming where empty policy classes provide compile-time behavior without runtime cost. In polymorphic hierarchies, even empty abstract interfaces add vptr overhead, so EBO doesn't apply to classes with virtual functions—only to truly empty classes.

**Key takeaway:** Use inheritance rather than composition for empty policy classes to leverage EBO and avoid wasting memory.

---

#### Q18: Can static member functions be virtual?
**Difficulty:** #beginner  
**Category:** #syntax  
**Concepts:** #static #virtual_functions #polymorphism

**Answer:**
No, static member functions cannot be virtual because they are not associated with object instances and therefore have no this pointer or vptr to enable dynamic dispatch.

**Explanation:**
Virtual functions require a vptr in each object to determine which implementation to call at runtime. Static functions belong to the class, not to instances, so there's no object and no vptr. Static functions are resolved at compile-time based on the class name used to call them. Attempting to declare a static function as virtual results in a compilation error. If you need polymorphic behavior with class-level operations, use virtual member functions that operate on class data.

**Key takeaway:** Virtual functions require object instances—static functions are class-level and cannot be virtual.

---

#### Q19: What is the diamond problem in multiple inheritance?
**Difficulty:** #advanced  
**Category:** #inheritance  
**Concepts:** #multiple_inheritance #diamond_problem #virtual_inheritance #ambiguity

**Answer:**
The diamond problem occurs when a class inherits from two classes that both inherit from a common base, creating ambiguity and duplicate base subobjects, which is solved using virtual inheritance.

**Code example:**
```cpp
class Base {
public:
    int value;
};

class Left : public Base {};
class Right : public Base {};

class Diamond : public Left, public Right {
public:
    void use() {
        // value = 10;  // ❌ Ambiguous: Left::value or Right::value?
        Left::value = 10;  // ✅ Must qualify
    }
};

// Solution with virtual inheritance:
class Left2 : virtual public Base {};
class Right2 : virtual public Base {};
class Diamond2 : public Left2, public Right2 {
    // Only one Base subobject, no ambiguity
};
```

**Explanation:**
Without virtual inheritance, Diamond contains two separate Base subobjects (one through Left, one through Right), causing ambiguity when accessing Base members and wasting memory. Virtual inheritance ensures only one shared Base subobject exists, but adds complexity and performance cost due to indirect access through virtual base pointers. Most designs avoid the diamond problem by using interfaces (pure virtual base classes) or composition.

**Key takeaway:** Use virtual inheritance to solve the diamond problem, but prefer composition or interfaces to avoid it entirely.

---

#### Q20: How does the override keyword help prevent bugs?
**Difficulty:** #beginner  
**Category:** #syntax #interview_favorite  
**Concepts:** #override #virtual_functions #compiler_errors #const_correctness

**Answer:**
The override keyword explicitly declares intent to override a virtual function, causing compilation errors if the function doesn't actually override anything due to signature mismatches, preventing silent bugs.

**Code example:**
```cpp
class Base {
public:
    virtual void func() const {}
    virtual void process(int x) {}
};

class Derived : public Base {
public:
    void func() override {}  // ❌ Error: missing const
    void process(double x) override {}  // ❌ Error: wrong parameter type
    void extra() override {}  // ❌ Error: nothing to override
};
```

**Explanation:**
Without override, subtle signature mismatches (missing const, different parameters, typos in function names) create new functions that hide rather than override base versions, breaking polymorphism silently. The override keyword makes your intent explicit, and the compiler verifies that the function actually overrides a base class virtual function. This catches common errors like const mismatch, wrong parameter types, and typos. Always use override for clarity and error detection.

**Key takeaway:** Always use override when overriding virtual functions to catch signature mismatches at compile-time.

---

### PRACTICE_TASKS: Output Prediction and Code Analysis

#### Q1
```cpp
#include <iostream>

class Base {
public:
    virtual void show() { std::cout << "Base\n"; }
};

class Derived : public Base {
public:
    void show() override { std::cout << "Derived\n"; }
};

int main() {
    Base b;
    Derived d;
    Base* ptr = &d;
    b.show();
    ptr->show();
}
```

#### Q2
```cpp
#include <iostream>

class A {
public:
    A() { std::cout << "A\n"; }
    ~A() { std::cout << "~A\n"; }
};

class B : public A {
public:
    B() { std::cout << "B\n"; }
    ~B() { std::cout << "~B\n"; }
};

int main() {
    A* p = new B();
    delete p;
}
```

#### Q3
```cpp
#include <iostream>

class A {
private:
    virtual void foo() { std::cout << "A\n"; }
public:
    void call() { foo(); }
};

class B : public A {
private:
    void foo() override { std::cout << "B\n"; }
};

int main() {
    B b;
    b.call();
}
```

#### Q4
```cpp
#include <iostream>

class A {
public:
    virtual void show() { std::cout << "A\n"; }
};

class B : public A {
public:
    void show() { std::cout << "B\n"; }
};

void func(A a) {
    a.show();
}

int main() {
    B b;
    func(b);
}
```

#### Q5
```cpp
#include <iostream>

class Base {
public:
    virtual void fun() const { std::cout << "Base const\n"; }
};

class Derived : public Base {
public:
    void fun() { std::cout << "Derived non-const\n"; }
};

int main() {
    Derived d;
    d.fun();
}
```

#### Q6
```cpp
#include <iostream>

class A {
public:
    virtual void foo() { std::cout << "A\n"; }
};

class B : public A {
public:
    void foo(int) { std::cout << "B\n"; }
};

int main() {
    B b;
    b.foo(10);
}
```

#### Q7
```cpp
#include <iostream>

class A {
public:
    A() { show(); }
    virtual void show() { std::cout << "A\n"; }
};

class B : public A {
public:
    void show() override { std::cout << "B\n"; }
};

int main() {
    B b;
}
```

#### Q8
```cpp
#include <iostream>

class Base {
public:
    virtual void display(int x = 10) { 
        std::cout << "Base: " << x << "\n"; 
    }
};

class Derived : public Base {
public:
    void display(int x = 20) override { 
        std::cout << "Derived: " << x << "\n"; 
    }
};

int main() {
    Base* ptr = new Derived();
    ptr->display();
    delete ptr;
}
```

#### Q9
```cpp
#include <iostream>

class A {
public:
    virtual void foo() { std::cout << "A\n"; }
};

class B : public A {
public:
    void foo() override { std::cout << "B\n"; }
};

class C : public B {
public:
    void foo() override { std::cout << "C\n"; }
};

int main() {
    A* a = new C();
    a->foo();
    delete a;
}
```

#### Q10
```cpp
#include <iostream>

class A {
public:
    A() { std::cout << "A\n"; }
};

class B : public A {
public:
    B() { std::cout << "B\n"; }
};

class C : public B {
public:
    C() { std::cout << "C\n"; }
};

int main() {
    C obj;
}
```

#### Q11
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

int main() {
    Base* ptr = new Derived();
    delete ptr;
}
```

#### Q12
```cpp
#include <iostream>

class Base {
public:
    void func(int) { std::cout << "Base::int\n"; }
};

class Derived : public Base {
public:
    void func(double) { std::cout << "Derived::double\n"; }
};

int main() {
    Derived d;
    d.func(10);
}
```

#### Q13
```cpp
#include <iostream>

class A {
public:
    virtual void foo() = 0;
    ~A() { std::cout << "~A\n"; }
};

void A::foo() {
    std::cout << "A::foo implementation\n";
}

class B : public A {
public:
    void foo() override {
        A::foo();
        std::cout << "B::foo\n";
    }
};

int main() {
    A* ptr = new B();
    ptr->foo();
    delete ptr;
}
```

#### Q14
```cpp
#include <iostream>

class A {
private:
    virtual void f() { std::cout << "A::f\n"; }
};

class B : public A {
private:
    void f() override { std::cout << "B::f\n"; }
};

int main() {
    B b;
}
```

#### Q15
```cpp
#include <iostream>

class A {
public:
    virtual void show() const { std::cout << "A\n"; }
};

class B : public A {
public:
    void show() const override { std::cout << "B\n"; }
};

int main() {
    B b;
    A a = b;
    a.show();
}
```

#### Q16
```cpp
#include <iostream>

class A {
public:
    A() { who(); }
    virtual void who() { std::cout << "A\n"; }
    ~A() { who(); }
};

class B : public A {
public:
    void who() override { std::cout << "B\n"; }
};

int main() {
    B b;
}
```

#### Q17
```cpp
#include <iostream>

class A {
public:
    virtual void print(int x = 10) { std::cout << "A: " << x << "\n"; }
};

class B : public A {
public:
    void print(int x = 20) override { std::cout << "B: " << x << "\n"; }
};

int main() {
    B* bptr = new B();
    A* aptr = bptr;
    bptr->print();
    aptr->print();
    delete bptr;
}
```

#### Q18
```cpp
#include <iostream>

class Base {
protected:
    Base(const Base&) = default;
public:
    Base() = default;
    virtual void show() const { std::cout << "Base\n"; }
    virtual ~Base() = default;
};

class Derived : public Base {
public:
    void show() const override { std::cout << "Derived\n"; }
};

void process(Base b) {
    b.show();
}

int main() {
    Derived d;
    process(d);
}
```

#### Q19
```cpp
#include <iostream>

class A {
public:
    A() { std::cout << "A\n"; }
    ~A() { std::cout << "~A\n"; }
};

class B : public A {
public:
    B() { std::cout << "B\n"; }
    ~B() { std::cout << "~B\n"; }
};

class C : public B {
public:
    C() { std::cout << "C\n"; }
    ~C() { std::cout << "~C\n"; }
};

int main() {
    C obj;
}
```

#### Q20
```cpp
#include <iostream>

class Base {
public:
    void func() { std::cout << "Base\n"; }
};

class Derived : public Base {
public:
    void func() { std::cout << "Derived\n"; }
};

int main() {
    Base* ptr = new Derived();
    ptr->func();
    delete ptr;
}
```



### QUICK_REFERENCE: Answer Keys and Summary Tables

#### Answer Key for Practice Questions

| Q# | Answer | Explanation | Key Concept |
|----|--------|-------------|-------------|
| 1 | Base<br>Derived | Direct call to Base object calls Base version; virtual dispatch through pointer calls Derived version | #virtual_functions #polymorphism |
| 2 | A<br>B<br>~A | Destructor is not virtual so only ~A() is called, causing resource leak (UB) | #virtual_destructors #undefined_behavior |
| 3 | B | Private virtual function is overridden and called through public interface via vtable | #private #virtual_functions |
| 4 | A | Object slicing: passing by value copies only Base part, losing polymorphism | #object_slicing |
| 5 | Derived non-const | Not an override (const mismatch), defines new function; calls Derived version | #const_correctness #function_hiding |
| 6 | B | Not override—different signature (overload); foo(int) hides foo() | #function_hiding #overload |
| 7 | A | Virtual call in constructor calls Base version (vptr not yet pointing to Derived) | #constructors #virtual_functions |
| 8 | Derived: 10 | Virtual dispatch calls Derived::display, but default arg comes from static type (Base*) | #default_arguments #virtual_functions |
| 9 | C | Virtual dispatch works through multi-level inheritance | #polymorphism #inheritance |
| 10 | A<br>B<br>C | Constructors called base-to-derived order | #constructors #inheritance |
| 11 | ~Derived<br>~Base | Virtual destructor ensures proper cleanup chain | #virtual_destructors |
| 12 | Derived::double | func(double) hides Base::func(int); 10 converted to double | #function_hiding #type_conversion |
| 13 | A::foo implementation<br>B::foo<br>~A | Pure virtual can have implementation; destructor not virtual causes issue but compiles | #pure_virtual #virtual_destructors |
| 14 | (No output, compiles) | Private virtual override is legal but never called externally | #private #virtual_functions |
| 15 | A | Object slicing: copying B into A loses vtable, calls A::show | #object_slicing |
| 16 | A<br>A | Virtual calls in ctor/dtor call current class version, not overrides | #constructors #destructors #virtual_functions |
| 17 | B: 20<br>B: 10 | bptr uses Derived's default (20); aptr uses Base's default (10) despite same function | #default_arguments #virtual_functions |
| 18 | Compilation Error | Protected copy constructor prevents slicing—cannot pass Derived by value as Base | #object_slicing #copy_constructor |
| 19 | A<br>B<br>C<br>~C<br>~B<br>~A | Constructor order: base→derived; Destructor order: derived→base | #constructors #destructors #inheritance |
| 20 | Base | Non-virtual function uses static binding based on pointer type | #static_binding #polymorphism |

#### Encapsulation vs Inheritance vs Polymorphism

| Concept | Purpose | Implementation | Key Feature |
|---------|---------|----------------|-------------|
| Encapsulation | Data hiding and controlled access | Access specifiers (private/protected/public) | Compiler-enforced at compile-time |
| Inheritance | Code reuse and hierarchy | Derived classes inherit from base | Object contains base subobject |
| Polymorphism | Dynamic behavior selection | Virtual functions + vtable/vptr | Runtime dispatch via vptr |

#### Access Specifiers in Inheritance

| Base Member | Public Inheritance | Protected Inheritance | Private Inheritance |
|-------------|-------------------|----------------------|---------------------|
| public | public | protected | private |
| protected | protected | protected | private |
| private | inaccessible | inaccessible | inaccessible |

#### Virtual Function Behavior

| Context | Virtual Dispatch | Why |
|---------|-----------------|-----|
| Normal call | ✅ Yes | vptr points to correct vtable |
| Constructor | ❌ No | vptr points to current construction phase |
| Destructor | ❌ No | vptr updated after derived destruction |
| Static function | ❌ N/A | No object instance or vptr |

#### Common Polymorphism Pitfalls

| Issue | Cause | Prevention |
|-------|-------|-----------|
| Object slicing | Pass by value | Use references or pointers |
| Memory leak | Non-virtual destructor | Always use virtual destructors in polymorphic bases |
| Wrong function called | Signature mismatch (const, parameters) | Use override keyword |
| Static default args | Default args not polymorphic | Avoid default args in virtual functions |
| No polymorphism in ctor | vptr not yet set to derived | Never rely on virtual calls in constructors |

#### Virtual Function Overhead

| Aspect | Cost |
|--------|------|
| Memory per object | 1 vptr (typically 8 bytes on 64-bit) |
| Memory per class | 1 vtable (shared by all objects) |
| Performance | 1 extra indirection (vptr→vtable→function) |
| Multiple inheritance | Multiple vptrs per object |











