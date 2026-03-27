## TOPIC: C++ Object-Oriented Programming - Complete Interview Guide

### INTERVIEW_QA: Comprehensive OOP Questions with Detailed Answers

#### Q1: What is the only difference between struct and class in C++?
**Difficulty:** #beginner  
**Category:** #syntax  
**Concepts:** #class #struct #access_specifiers

**Answer:**
The only difference is the default access specifier: `struct` members default to `public`, while `class` members default to `private`.

**Explanation:**
Both `struct` and `class` in C++ support the complete OOP feature set including inheritance, constructors, destructors, and virtual functions. The distinction is purely syntactic convenience. By convention, `struct` is used for simple data aggregates without behavior, while `class` is used for objects with encapsulated behavior, though C++ doesn't enforce this convention. Both can be used interchangeably with appropriate access specifiers.

**Key takeaway:** Struct and class are identical except for default access; choose based on convention, not capability.

---

#### Q2: What is encapsulation and why is it important?
**Difficulty:** #beginner  
**Category:** #fundamentals #design_pattern  
**Concepts:** #encapsulation #access_specifiers #data_hiding

**Answer:**
Encapsulation bundles data and methods that operate on that data within a class, restricting direct access to internal details through access control.

**Code example:**
```cpp
class BankAccount {
private:
    double balance;  // ✅ Hidden implementation detail
public:
    void deposit(double amount) {
        if (amount > 0) balance += amount;
    }
    double getBalance() const { return balance; }
};
```

**Explanation:**
Encapsulation enforces controlled access to data, preventing external code from violating class invariants. By making `balance` private and providing controlled public methods, the class ensures balance can only change through validated operations. This makes code more maintainable—implementation details can change without affecting external code. It also enables enforcement of business rules and prevents invalid state.

**Key takeaway:** Use encapsulation to hide implementation details and enforce invariants through controlled interfaces.

---

#### Q3: Explain runtime polymorphism using virtual functions.
**Difficulty:** #intermediate  
**Category:** #polymorphism #interview_favorite  
**Concepts:** #virtual_functions #vtable #runtime_dispatch

**Answer:**
Runtime polymorphism allows derived class methods to be called through base class pointers/references, with the actual function determined at runtime via the vtable mechanism.

**Code example:**
```cpp
class Animal {
public:
    virtual void speak() { std::cout << "Animal sound\n"; }
    virtual ~Animal() = default;
};

class Dog : public Animal {
public:
    void speak() override { std::cout << "Woof!\n"; }
};

Animal* animal = new Dog();
animal->speak();  // Prints "Woof!" not "Animal sound"
delete animal;
```

**Explanation:**
The `virtual` keyword creates a vtable entry for the function. Each object with virtual functions has a hidden vptr pointing to its class's vtable. When calling a virtual function through a pointer, the call goes through the vtable, dispatching to the actual object's override. This enables polymorphic behavior where the same interface works with different implementations, fundamental to plugin systems, GUI frameworks, and extensible architectures.

**Key takeaway:** Virtual functions enable runtime polymorphism through vtable dispatch; always use virtual destructors in polymorphic bases.

---

#### Q4: What are the vtable and vptr?
**Difficulty:** #intermediate  
**Category:** #memory #interview_favorite  
**Concepts:** #vtable #vptr #virtual_functions #polymorphism

**Answer:**
The vtable is a per-class lookup table of virtual function pointers, and the vptr is a hidden pointer in each object pointing to its class's vtable.

**Explanation:**
When a class has virtual functions, the compiler creates a static vtable containing function pointers for each virtual function. Every object of that class contains a hidden vptr (typically at the start of the object) pointing to the class's vtable. When calling a virtual function, the code looks up the function pointer in the vtable via the vptr and calls it, enabling runtime dispatch. This mechanism adds one pointer per object (8 bytes on 64-bit) but enables powerful polymorphism.

**Key takeaway:** Vtable and vptr enable efficient runtime polymorphism with minimal per-object overhead.

---

#### Q5: What makes a class abstract and what is its purpose?
**Difficulty:** #intermediate  
**Category:** #syntax #design_pattern  
**Concepts:** #abstract_class #pure_virtual #interface

**Answer:**
A class becomes abstract when it contains at least one pure virtual function (declared with `= 0`), making it non-instantiable and serving as an interface contract.

**Code example:**
```cpp
class IShape {
public:
    virtual double area() const = 0;  // Pure virtual
    virtual void draw() const = 0;
    virtual ~IShape() = default;
};

// IShape s;  // ❌ Error: cannot instantiate abstract class
```

**Explanation:**
Abstract classes define interfaces that derived classes must implement. They cannot be instantiated directly, enforcing that users work with concrete implementations. Pure virtual functions must be overridden in derived classes before those classes can be instantiated. This pattern enables dependency inversion, where high-level code depends on abstractions rather than concrete types, making systems more flexible and testable.

**Key takeaway:** Use abstract classes to define interfaces and enforce implementation contracts in derived classes.

---

#### Q6: When is a copy constructor called versus copy assignment?
**Difficulty:** #beginner  
**Category:** #syntax  
**Concepts:** #copy_constructor #assignment_operator #initialization

**Answer:**
Copy constructor is called during initialization of a new object from an existing one; copy assignment is called when assigning to an already-existing object.

**Code example:**
```cpp
MyClass a;
MyClass b = a;  // ✅ Copy constructor (initialization)
MyClass c(a);   // ✅ Copy constructor (explicit)
MyClass d;
d = a;          // ✅ Copy assignment (existing object)
```

**Explanation:**
The key distinction is whether the target object exists. Copy constructor creates a new object, so there's no previous state to clean up. Copy assignment modifies an existing object, requiring cleanup of old resources before copying new ones and checking for self-assignment. The syntax `=` during declaration is initialization (copy constructor), not assignment. Understanding this difference is crucial for implementing Rule of Three/Five correctly.

**Key takeaway:** Copy constructor creates new objects; copy assignment modifies existing objects requiring cleanup.

---

#### Q7: Explain the Rule of Three, Five, and Zero.
**Difficulty:** #intermediate  
**Category:** #design_pattern #interview_favorite  
**Concepts:** #rule_of_three #rule_of_five #rule_of_zero #resource_management

**Answer:**
Rule of Three: if you define destructor, copy constructor, or copy assignment, define all three. Rule of Five adds move constructor and move assignment. Rule of Zero: use RAII wrappers to avoid defining any.

**Explanation:**
The Rule of Three exists because if you need one of these functions, you're managing a resource requiring special handling. Defining only one creates inconsistent semantics—copy might be shallow while destruction releases resources, causing double-deletion. C++11's Rule of Five adds move operations for efficiency. Rule of Zero is the modern ideal: use smart pointers and standard containers that handle their own resources, letting the compiler generate correct special members. Following these rules prevents resource leaks and undefined behavior.

**Key takeaway:** Follow Rule of Five for resource-managing classes or Rule of Zero by using RAII wrappers.

---

#### Q8: Why must base class destructors be virtual?
**Difficulty:** #intermediate  
**Category:** #memory #interview_favorite  
**Concepts:** #virtual_destructors #polymorphism #undefined_behavior

**Answer:**
Virtual destructors ensure derived class destructors are called when deleting through base pointers, preventing resource leaks and undefined behavior.

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
delete ptr;  // ✅ Calls ~Derived() then ~Base()
```

**Explanation:**
Without virtual destructors, deleting through a base pointer calls only the base destructor, leaking derived resources and causing undefined behavior. Virtual destructors enable proper destruction through vtable dispatch, ensuring the complete destructor chain executes from most derived to base. This applies even with smart pointers—`std::shared_ptr<Base>` needs a virtual Base destructor for correct cleanup. Always make base class destructors virtual in polymorphic hierarchies.

**Key takeaway:** Always use virtual destructors in polymorphic base classes to ensure proper cleanup through base pointers.

---

#### Q9: Can you delete or make a destructor private?
**Difficulty:** #advanced  
**Category:** #syntax #design_pattern  
**Concepts:** #destructors #deleted_functions #controlled_lifetime

**Answer:**
Yes; deleted destructors prevent any object destruction, while private destructors restrict destruction to class members/friends, useful for controlled lifetime patterns.

**Code example:**
```cpp
class NoDestroy {
    ~NoDestroy() = delete;  // ❌ Cannot destroy anywhere
};

class ControlledLifetime {
private:
    ~ControlledLifetime() {}  // ❌ Cannot destroy externally
public:
    static ControlledLifetime* create() { return new ControlledLifetime(); }
    void destroy() { delete this; }
};
```

**Explanation:**
Deleted destructors prevent objects from being destroyed by any means, useful for types that should never be deallocated (e.g., singletons, memory-mapped objects). Private destructors allow destruction only through class methods or friends, enforcing factory patterns or reference-counted lifetimes. Singleton patterns often use private destructors to prevent external deletion. These are advanced techniques for specialized lifetime management.

**Key takeaway:** Use deleted/private destructors to enforce controlled object lifetimes in specialized scenarios.

---

#### Q10: What is object slicing and why is it dangerous?
**Difficulty:** #intermediate  
**Category:** #inheritance #interview_favorite  
**Concepts:** #object_slicing #polymorphism #copy_constructor

**Answer:**
Object slicing occurs when copying a derived class object to a base class object by value, discarding the derived portion and destroying polymorphic behavior.

**Code example:**
```cpp
class Base {
public:
    int x;
    virtual void func() { std::cout << "Base\n"; }
};

class Derived : public Base {
public:
    int y;
    void func() override { std::cout << "Derived\n"; }
};

void process(Base b) {  // ❌ Pass by value
    b.func();  // Always prints "Base"
}

Derived d;
d.y = 42;
process(d);  // Slicing: y lost, vtable changed
```

**Explanation:**
Slicing physically copies only the base portion of an object, losing derived members and changing the vtable pointer to point to the base class table. This eliminates polymorphism and can cause resource leaks if destructors aren't virtual. Slicing happens during pass-by-value, container insertion, and assignment to base type. Always pass polymorphic objects by pointer or reference to preserve their full type and behavior.

**Key takeaway:** Prevent slicing by passing polymorphic objects by reference or pointer, never by value.

---

#### Q11: Can constructors be virtual?
**Difficulty:** #beginner  
**Category:** #syntax  
**Concepts:** #constructors #virtual_functions #vtable

**Answer:**
No, constructors cannot be virtual because virtual dispatch requires the vptr to exist, which is set up during construction.

**Explanation:**
Virtual function calls use the vptr to look up the function in the vtable. However, constructors are responsible for creating the vptr in the first place. During construction, the object's type progresses through the inheritance hierarchy (base to derived), with the vptr pointing to each class's vtable in turn. There's no complete object yet for virtual dispatch to work on. The virtual constructor pattern is instead implemented using factory methods that return polymorphic types.

**Key takeaway:** Constructors cannot be virtual; use factory methods to achieve virtual construction.

---

#### Q12: What happens if you define only a copy constructor but not copy assignment?
**Difficulty:** #intermediate  
**Category:** #syntax  
**Concepts:** #copy_constructor #assignment_operator #compiler_generated

**Answer:**
If only the copy constructor is defined, the compiler still generates a default copy assignment operator performing memberwise copy.

**Explanation:**
Pre-C++11, defining a copy constructor didn't suppress copy assignment generation. However, this creates inconsistent copying semantics—the copy constructor might do deep copy while the generated assignment does shallow copy. This is dangerous for resource-managing classes. Modern C++ deprecates this behavior. Best practice: define both copy constructor and assignment together (Rule of Three), or delete both if copying shouldn't be allowed, or use Rule of Zero with RAII wrappers.

**Key takeaway:** Define copy constructor and copy assignment together to ensure consistent copying semantics.

---

#### Q13: When does copy elision occur?
**Difficulty:** #intermediate  
**Category:** #optimization  
**Concepts:** #copy_elision #rvo #nrvo

**Answer:**
Copy elision optimizes away copy/move operations by constructing objects directly in their final location; C++17 makes it mandatory for returning temporaries (RVO).

**Code example:**
```cpp
MyClass create() {
    return MyClass();  // ✅ C++17: guaranteed elision
}

MyClass create2() {
    MyClass local;
    return local;  // ⚠️ NRVO: optional elision
}
```

**Explanation:**
Return Value Optimization (RVO) eliminates copies when returning temporaries, made mandatory in C++17. Named Return Value Optimization (NRVO) applies to local variables but is optional. Copy elision can occur even if copy/move constructors are deleted because no constructor call happens—the object is constructed directly in the caller's memory. This fundamentally changes semantics compared to pre-C++17, where constructors had to exist even if elided.

**Key takeaway:** C++17 guarantees copy elision for temporaries; trust the compiler and return local objects naturally.

---

#### Q14: How does const affect move constructor selection?
**Difficulty:** #intermediate  
**Category:** #syntax  
**Concepts:** #move_semantics #const #rvalue_reference

**Answer:**
Move constructors require non-const rvalues (`T&&`); const objects cannot be moved, so attempting to move them selects the copy constructor instead.

**Code example:**
```cpp
class MyClass {
public:
    MyClass(const MyClass&) { std::cout << "Copy\n"; }
    MyClass(MyClass&&) { std::cout << "Move\n"; }
};

const MyClass a;
MyClass b = std::move(a);  // Prints "Copy", not "Move"
```

**Explanation:**
Move semantics involve transferring resources and leaving the source in a valid but unspecified state. This requires modifying the source object, incompatible with const. When you attempt to move a const object, the move constructor signature `T(T&&)` doesn't match `const T`, so overload resolution falls back to the copy constructor `T(const T&)`. This is by design—const objects guarantee immutability, preventing moves.

**Key takeaway:** Const objects cannot be moved; std::move on const objects selects copy constructor.

---

#### Q15: What is the purpose of marking move operations noexcept?
**Difficulty:** #intermediate  
**Category:** #performance #interview_favorite  
**Concepts:** #move_semantics #noexcept #exception_safety

**Answer:**
Marking move operations noexcept enables optimal container performance because standard containers only use moves if they're guaranteed not to throw.

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
When std::vector grows, it must move elements to new storage. If moves can throw, strong exception safety is impossible—a failure mid-move leaves elements in inconsistent state. Therefore, vector only uses moves if they're noexcept, falling back to copies otherwise. Since most move operations just swap pointers and cannot throw, marking them noexcept is free performance. Forgetting noexcept on moves causes containers to copy instead of move, defeating the performance benefit.

**Key takeaway:** Always mark move operations noexcept when possible to enable container optimizations.

---

#### Q16: Can you have a class that is copyable but not movable?
**Difficulty:** #intermediate  
**Category:** #syntax  
**Concepts:** #copy_constructor #move_semantics #deleted_functions

**Answer:**
Yes, by explicitly deleting move operations while keeping copy operations available, though this is unusual since moves are typically optimizations over copies.

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
This pattern is rare because if copying is safe and allowed, moving should also be safe and more efficient. However, you might delete moves if moving would violate class invariants or if you want to force observable copy behavior for debugging or testing. When moves are deleted but copies exist, operations that would use moves fall back to copying, potentially impacting performance but maintaining functionality.

**Key takeaway:** Copy-only types are possible but unusual; typically enable both or neither.

---

#### Q17: What is the difference between private and protected inheritance?
**Difficulty:** #beginner  
**Category:** #inheritance  
**Concepts:** #access_specifiers #inheritance #encapsulation

**Answer:**
Private inheritance makes all base class members private in the derived class; protected inheritance makes public base members protected in the derived class.

**Explanation:**
Both private and protected inheritance implement "is-implemented-in-terms-of" relationships rather than "is-a" relationships. With private inheritance, even derived class's subclasses cannot access base class members. With protected inheritance, derived class's subclasses can access base class's public and protected members as protected. Both hide the base class interface from external users. Public inheritance represents "is-a" relationships and is by far the most common.

**Key takeaway:** Use public inheritance for "is-a"; use private/protected inheritance rarely for implementation inheritance.

---

#### Q18: What is the override specifier and why should you use it?
**Difficulty:** #beginner  
**Category:** #syntax  
**Concepts:** #override #virtual_functions #error_checking

**Answer:**
The override specifier (C++11) explicitly marks that a function is intended to override a base virtual function, causing a compilation error if it doesn't match any base function.

**Code example:**
```cpp
class Base {
public:
    virtual void func(int x);
};

class Derived : public Base {
public:
    void func(int x) override;  // ✅ OK: matches base
    // void func(double x) override;  // ❌ Error: doesn't match
};
```

**Explanation:**
Without override, mismatches in signature (different parameters, const-ness, etc.) silently create a new function instead of overriding. This leads to confusing bugs where virtual dispatch doesn't work as expected. The override keyword catches these mistakes at compile time, documenting intent and preventing common errors. Modern C++ guidelines recommend always using override on virtual function overrides.

**Key takeaway:** Always use override on overriding functions to catch signature mismatches at compile time.

---

#### Q19: What is the final specifier and when should you use it?
**Difficulty:** #intermediate  
**Category:** #syntax  
**Concepts:** #final #virtual_functions #optimization

**Answer:**
The final specifier (C++11) prevents further overriding of virtual functions or derivation from classes, enabling optimizations and enforcing design intent.

**Code example:**
```cpp
class Base {
public:
    virtual void func();
};

class Derived final : public Base {  // ✅ Cannot derive from Derived
    void func() override final;  // ✅ Cannot override func further
};

// class MoreDerived : public Derived {};  // ❌ Error
```

**Explanation:**
Marking functions final allows the compiler to devirtualize calls when the object type is known, improving performance by avoiding vtable lookups. Marking classes final prevents further derivation, useful for classes designed to be leaves in the hierarchy. Use final when you've intentionally closed an interface for extension, when you need the performance benefit of devirtualization, or when further derivation would violate class invariants.

**Key takeaway:** Use final to prevent overriding/derivation and enable compiler optimizations when extension isn't intended.

---

#### Q20: What is multiple inheritance and what problems can it cause?
**Difficulty:** #advanced  
**Category:** #inheritance  
**Concepts:** #multiple_inheritance #diamond_problem #virtual_base

**Answer:**
Multiple inheritance allows deriving from multiple base classes, which can cause the diamond problem where a base class appears multiple times in the hierarchy.

**Code example:**
```cpp
class Device { int id; };
class Scanner : public Device {};
class Printer : public Device {};
class Multifunction : public Scanner, public Printer {};
// Multifunction has two Device subobjects (ambiguous)

class Scanner2 : virtual public Device {};  // ✅ Virtual inheritance
class Printer2 : virtual public Device {};
class Multifunction2 : public Scanner2, public Printer2 {};
// Multifunction2 has single Device subobject
```

**Explanation:**
The diamond problem occurs when a class inherits from multiple classes that share a common base. Without virtual inheritance, the derived class gets multiple copies of the base, causing ambiguity and wasted space. Virtual inheritance solves this by ensuring only one shared base subobject, but adds complexity and slight performance overhead. Many C++ guidelines recommend avoiding multiple inheritance except for pure interfaces (classes with only pure virtual functions and no data).

**Key takeaway:** Multiple inheritance can cause diamond problem; use virtual inheritance to share base subobject or prefer interface-only multiple inheritance.

---
