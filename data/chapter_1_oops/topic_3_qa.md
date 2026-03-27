## TOPIC: Pure Virtual Functions and Abstract Base Classes

### INTERVIEW_QA: Comprehensive Questions and Answers

#### Q1: What is a pure virtual function?
**Difficulty:** #beginner  
**Category:** #syntax #fundamentals  
**Concepts:** #pure_virtual #abstract_class #interface #polymorphism

**Answer:**
A pure virtual function is a virtual function declared with `= 0` syntax that has no implementation in the base class and must be overridden by derived classes before they can be instantiated.

**Code example:**
```cpp
class Interface {
public:
    virtual void operation() = 0;  // Pure virtual
    virtual ~Interface() = default;
};
```

**Explanation:**
Pure virtual functions define interface contracts that derived classes must fulfill. Any class with at least one pure virtual function becomes an abstract base class (ABC) and cannot be instantiated directly. Derived classes must provide implementations for all pure virtual functions inherited from their base classes before they can be instantiated. Pure virtuals are the C++ mechanism for creating true interfaces.

**Key takeaway:** Use pure virtual functions to define interfaces and enforce implementation contracts in derived classes.

---

#### Q2: What is an abstract base class?
**Difficulty:** #beginner  
**Category:** #fundamentals #design_pattern  
**Concepts:** #abstract_class #pure_virtual #interface #polymorphism

**Answer:**
An abstract base class (ABC) is a class that contains at least one pure virtual function, making it non-instantiable and serving as an interface or contract for derived classes.

**Explanation:**
ABCs cannot be instantiated directly—you cannot create objects of abstract classes. However, you can create pointers and references to ABCs, enabling polymorphic behavior. ABCs can contain data members, constructors, regular member functions, and even implementations for their pure virtual functions. They serve as interfaces that define what operations derived classes must support without specifying how those operations are implemented. This separation of interface from implementation is fundamental to good OOP design.

**Key takeaway:** Use abstract base classes to define interfaces and enable polymorphism through well-defined contracts.

---

#### Q3: Can a pure virtual function have a body/implementation?
**Difficulty:** #intermediate  
**Category:** #syntax #interview_favorite  
**Concepts:** #pure_virtual #function_body #interface

**Answer:**
Yes, a pure virtual function can have an implementation defined outside the class declaration, allowing derived classes to optionally call the base implementation while still being required to override it.

**Code example:**
```cpp
class Base {
public:
    virtual void func() = 0;
};

void Base::func() {  // ✅ Legal
    std::cout << "Base implementation\n";
}

class Derived : public Base {
public:
    void func() override {
        Base::func();  // ✅ Can call base
        std::cout << "Derived addition\n";
    }
};
```

**Explanation:**
This pattern provides default or shared behavior while enforcing that derived classes must consciously override the function. The `= 0` syntax means "this function must be overridden," not "this function has no body." Derived classes can explicitly call the base implementation via `Base::func()`. This is useful for providing common validation, logging, or initialization logic that multiple derived classes can reuse.

**Key takeaway:** Pure virtual functions can have bodies, enabling shared logic while enforcing override requirements.

---

#### Q4: Can an abstract class have a constructor?
**Difficulty:** #intermediate  
**Category:** #syntax #memory  
**Concepts:** #abstract_class #constructors #initialization

**Answer:**
Yes, abstract classes can and often do have constructors, which are called during derived class construction to initialize the base class portion of the object.

**Code example:**
```cpp
class AbstractBase {
protected:
    int value;
public:
    AbstractBase(int v) : value(v) {  // ✅ Constructor in ABC
        std::cout << "AbstractBase constructed\n";
    }
    virtual void operation() = 0;
};

class Concrete : public AbstractBase {
public:
    Concrete(int v) : AbstractBase(v) {}
    void operation() override {}
};
```

**Explanation:**
Abstract classes cannot be instantiated directly, but their constructors are essential for initializing the base class subobject when creating derived class instances. The constructor runs during derived class construction, allowing the base class to set up its data members and perform necessary initialization. Abstract class constructors are often protected to prevent accidental attempts at instantiation while allowing derived classes to call them.

**Key takeaway:** Abstract classes can have constructors for initializing base class data during derived class construction.

---

#### Q5: Why must a pure virtual destructor have a definition?
**Difficulty:** #advanced  
**Category:** #memory #interview_favorite  
**Concepts:** #pure_virtual #destructors #undefined_behavior #linker_error

**Answer:**
A pure virtual destructor must have a body because destructors are always called during object destruction, and without a definition, the linker cannot find the code to execute, causing a linker error.

**Code example:**
```cpp
class Base {
public:
    virtual ~Base() = 0;  // Pure virtual destructor
};

Base::~Base() {  // ✅ Must define, or linker error
    std::cout << "Base destroyed\n";
}

class Derived : public Base {
public:
    ~Derived() override {
        std::cout << "Derived destroyed\n";
    }
};
```

**Explanation:**
Unlike other pure virtual functions that may never be called if not overridden, destructors are always called in the destruction chain. When deleting a derived object, both the derived and base destructors execute. If the base destructor has no definition, the linker has no code to execute and fails. Pure virtual destructors are useful for making a class abstract when you have no other pure virtual functions, but they always need bodies.

**Key takeaway:** Always provide a definition for pure virtual destructors to avoid linker errors.

---

#### Q6: Can you instantiate an abstract class?
**Difficulty:** #beginner  
**Category:** #syntax #fundamentals  
**Concepts:** #abstract_class #instantiation #pure_virtual

**Answer:**
No, you cannot directly instantiate an abstract class, but you can create pointers and references to abstract classes that point to derived class objects.

**Code example:**
```cpp
class Abstract {
public:
    virtual void func() = 0;
};

class Concrete : public Abstract {
public:
    void func() override {}
};

int main() {
    // Abstract a;  // ❌ Error: cannot instantiate
    Abstract* ptr = new Concrete();  // ✅ OK
    Abstract& ref = *ptr;  // ✅ OK
    delete ptr;
}
```

**Explanation:**
Abstract classes exist to define interfaces, not to be instantiated. Attempting to create an object of an abstract class results in a compilation error. However, pointers and references to abstract classes are essential for polymorphism—they allow you to work with objects through their interface without knowing the concrete type. This is the foundation of runtime polymorphism and enables flexible, extensible designs.

**Key takeaway:** Use pointers or references to abstract classes for polymorphism, never direct instantiation.

---

#### Q7: What happens if a derived class doesn't override all pure virtual functions?
**Difficulty:** #intermediate  
**Category:** #syntax #interview_favorite  
**Concepts:** #pure_virtual #abstract_class #inheritance #override

**Answer:**
The derived class also becomes abstract and cannot be instantiated until all inherited pure virtual functions are overridden in the inheritance hierarchy.

**Code example:**
```cpp
class Base {
public:
    virtual void func1() = 0;
    virtual void func2() = 0;
};

class Partial : public Base {
public:
    void func1() override {}
    // func2 not overridden - Partial is still abstract
};

class Complete : public Partial {
public:
    void func2() override {}  // ✅ Now can instantiate
};

int main() {
    // Partial p;  // ❌ Error: still abstract
    Complete c;    // ✅ OK
}
```

**Explanation:**
A class is only concrete (instantiable) when all pure virtual functions in its inheritance chain have been overridden. Intermediate classes in a hierarchy can remain abstract by implementing only some of the pure virtuals. This allows for incremental implementation of complex interfaces and is useful in large inheritance hierarchies where different levels provide different functionality. The `override` keyword helps catch mistakes where you think you're overriding but aren't.

**Key takeaway:** All pure virtual functions must be overridden somewhere in the inheritance chain before a class becomes instantiable.

---

#### Q8: Can you call a pure virtual function from a base class constructor?
**Difficulty:** #advanced  
**Category:** #memory #interview_favorite  
**Concepts:** #pure_virtual #constructors #undefined_behavior #vptr

**Answer:**
Calling a pure virtual function from a constructor causes undefined behavior and often crashes because the vptr hasn't been set to the derived class's vtable yet.

**Code example:**
```cpp
class Base {
public:
    Base() {
        init();  // ❌ Calling pure virtual in constructor
    }
    virtual void init() = 0;
};

class Derived : public Base {
public:
    void init() override {
        std::cout << "Derived init\n";
    }
};

int main() {
    Derived d;  // ❌ Undefined behavior or crash
}
```

**Explanation:**
During base class construction, the object's dynamic type is the base class, not the derived class. The vptr points to the base class's vtable. For pure virtual functions, the vtable entry is either null or points to an error function. Calling it results in undefined behavior, often a crash. This is a safety feature—if virtual dispatch worked in constructors, calling derived functions before derived members are initialized could access uninitialized memory. Never call virtual functions from constructors or destructors.

**Key takeaway:** Never call virtual (especially pure virtual) functions from constructors or destructors—it causes undefined behavior.

---

#### Q9: Is it legal to have a private pure virtual function?
**Difficulty:** #intermediate  
**Category:** #syntax #design_pattern  
**Concepts:** #pure_virtual #access_specifiers #override #template_method

**Answer:**
Yes, pure virtual functions can be private, and they can still be overridden in derived classes, with access control determining only who can call them.

**Code example:**
```cpp
class Base {
private:
    virtual void impl() = 0;  // ✅ Private pure virtual
public:
    void interface() {
        impl();  // Calls through vtable
    }
};

class Derived : public Base {
private:
    void impl() override {  // ✅ Can override private
        std::cout << "Derived impl\n";
    }
};
```

**Explanation:**
Access specifiers control calling permissions, not overriding capabilities. Private pure virtual functions are the foundation of the Template Method pattern, where the base class defines a public non-virtual interface that calls private virtual "hooks" that derived classes override. This separates the stable interface (public non-virtual) from the customizable implementation (private virtual), giving the base class control over when and how the virtual function is called.

**Key takeaway:** Private pure virtual functions enable the Template Method pattern and protect implementation details while allowing customization.

---

#### Q10: Can you have pointers or references to abstract classes?
**Difficulty:** #beginner  
**Category:** #syntax #memory  
**Concepts:** #abstract_class #pointers #references #polymorphism

**Answer:**
Yes, pointers and references to abstract classes are not only legal but essential for polymorphism, allowing code to work with derived objects through their abstract interface.

**Code example:**
```cpp
class Shape {
public:
    virtual double area() const = 0;
    virtual ~Shape() = default;
};

class Circle : public Shape {
    double radius;
public:
    Circle(double r) : radius(r) {}
    double area() const override {
        return 3.14159 * radius * radius;
    }
};

void printArea(const Shape& s) {  // ✅ Reference to abstract
    std::cout << "Area: " << s.area() << "\n";
}

int main() {
    Circle c(5.0);
    Shape* ptr = &c;  // ✅ Pointer to abstract
    printArea(c);     // ✅ Reference to abstract
}
```

**Explanation:**
While you cannot instantiate abstract classes, pointers and references to them are the cornerstone of polymorphism. They allow functions to accept any object that implements the interface without knowing the concrete type. This enables generic code that works with interfaces rather than implementations, promoting loose coupling and flexibility. The dynamic type of the object is determined at runtime, enabling virtual function calls to dispatch to the correct implementation.

**Key takeaway:** Use pointers and references to abstract classes to enable polymorphism and write code against interfaces.

---

#### Q11: What is the difference between an interface and an abstract class in C++?
**Difficulty:** #intermediate  
**Category:** #design_pattern #interview_favorite  
**Concepts:** #abstract_class #interface #pure_virtual #inheritance

**Answer:**
C++ doesn't have a distinct interface keyword—an interface is an abstract class with only pure virtual functions and no data members, while abstract classes can mix pure virtuals with data and concrete functions.

**Code example:**
```cpp
// Pure interface
class IInterface {
public:
    virtual void operation() = 0;
    virtual ~IInterface() = default;
    // No data members, no concrete functions
};

// Abstract class (not pure interface)
class AbstractBase {
protected:
    int data;  // ✅ Has data
public:
    AbstractBase(int d) : data(d) {}
    virtual void operation() = 0;  // Pure virtual
    int getData() const { return data; }  // ✅ Concrete function
};
```

**Explanation:**
In languages like Java, interfaces are distinct from abstract classes. C++ has no such distinction—both are abstract classes. By convention, a pure interface has all pure virtual functions, no data members, and no concrete methods (except possibly the destructor). Abstract classes that aren't pure interfaces provide partial implementation, mixing pure virtuals (contract) with concrete members (shared behavior). Pure interfaces enable multiple inheritance more safely because they have no state or implementation to conflict.

**Key takeaway:** Create pure interfaces (no data, only pure virtuals) for maximum flexibility and safe multiple inheritance.

---

#### Q12: Can an abstract class have regular (non-pure) virtual functions?
**Difficulty:** #beginner  
**Category:** #syntax  
**Concepts:** #abstract_class #virtual_functions #pure_virtual

**Answer:**
Yes, abstract classes can mix pure virtual functions (which must be overridden) with regular virtual functions (which can optionally be overridden) and non-virtual functions.

**Code example:**
```cpp
class Base {
public:
    virtual void mustOverride() = 0;  // ✅ Pure virtual
    
    virtual void canOverride() {  // ✅ Regular virtual
        std::cout << "Default implementation\n";
    }
    
    void concrete() {  // ✅ Non-virtual
        std::cout << "Base concrete\n";
    }
    
    virtual ~Base() = default;
};
```

**Explanation:**
Abstract classes aren't limited to pure virtuals—they can provide default implementations for some behaviors while requiring derived classes to implement others. This allows for sophisticated designs where the base class provides substantial shared functionality while leaving specific operations to derived classes. Regular virtual functions give derived classes the option to customize behavior, while pure virtuals mandate it. Non-virtual functions provide shared implementation that shouldn't be overridden.

**Key takeaway:** Mix pure virtual (required) with regular virtual (optional) and non-virtual (shared) functions in abstract classes.

---

#### Q13: Does adding a pure virtual function change object size?
**Difficulty:** #intermediate  
**Category:** #memory #performance  
**Concepts:** #pure_virtual #vtable #vptr #sizeof

**Answer:**
Adding the first virtual (or pure virtual) function adds a vptr to the object (typically 8 bytes on 64-bit), but additional virtual functions don't increase object size—they only add entries to the vtable.

**Code example:**
```cpp
class NoVirtual {
    int x;
};  // sizeof: typically 4

class OneVirtual {
    int x;
    virtual void f() = 0;
};  // sizeof: typically 16 (4 + 8 vptr + 4 padding)

class TwoVirtual {
    int x;
    virtual void f() = 0;
    virtual void g() = 0;
};  // sizeof: still typically 16
```

**Explanation:**
The first virtual function triggers the compiler to add a vptr (virtual pointer) to each object, pointing to the class's vtable. This increases object size by one pointer (8 bytes on 64-bit systems). However, additional virtual functions don't add more vptrs—they just add more entries to the shared vtable. The vtable is per-class (one copy shared by all objects), not per-object, so more virtual functions increase the vtable size but not the object size.

**Key takeaway:** The first virtual function adds a vptr to objects; additional virtuals don't increase object size.

---

#### Q14: Can you delete an object through a base pointer if the destructor isn't virtual?
**Difficulty:** #intermediate  
**Category:** #memory #interview_favorite  
**Concepts:** #destructors #virtual_functions #undefined_behavior #memory_leak

**Answer:**
Deleting through a base pointer without a virtual destructor causes undefined behavior—only the base destructor runs, leaking derived class resources.

**Code example:**
```cpp
class Base {
public:
    ~Base() {  // ❌ Not virtual
        std::cout << "~Base\n";
    }
    virtual void func() = 0;
};

class Derived : public Base {
    int* data;
public:
    Derived() : data(new int[100]) {}
    ~Derived() {
        delete[] data;  // ❌ Never called
        std::cout << "~Derived\n";
    }
    void func() override {}
};

Base* ptr = new Derived();
delete ptr;  // ❌ UB: only ~Base() runs, leaks data
```

**Explanation:**
Without a virtual destructor, the destructor call is resolved statically based on the pointer type. Since ptr is `Base*`, only `Base::~Base()` runs. The derived destructor never executes, so derived class resources aren't released. This is undefined behavior and causes resource leaks. Always make destructors virtual in polymorphic base classes, even if they do nothing. This ensures the complete destruction chain executes from most derived to base.

**Key takeaway:** Always use virtual destructors in polymorphic base classes to ensure proper cleanup.

---

#### Q15: What is the Template Method design pattern with pure virtuals?
**Difficulty:** #advanced  
**Category:** #design_pattern #interview_favorite  
**Concepts:** #pure_virtual #template_method #inheritance #polymorphism

**Answer:**
The Template Method pattern uses a base class to define an algorithm's structure with pure virtual "hooks" that derived classes override, allowing customization while maintaining the overall algorithm flow.

**Code example:**
```cpp
class DataProcessor {
private:
    virtual void readData() = 0;     // ✅ Must override
    virtual void processData() = 0;  // ✅ Must override
    virtual void writeData() = 0;    // ✅ Must override
    
public:
    void execute() {  // ✅ Template method (non-virtual)
        readData();
        processData();
        writeData();
    }
    virtual ~DataProcessor() = default;
};

class CSVProcessor : public DataProcessor {
private:
    void readData() override { /* CSV reading */ }
    void processData() override { /* Processing */ }
    void writeData() override { /* CSV writing */ }
};
```

**Explanation:**
The Template Method pattern inverts control—the base class controls the algorithm flow through a public non-virtual method, calling private pure virtual functions that derived classes must implement. This ensures the algorithm structure is preserved while allowing customization of specific steps. Making the hook methods private (or protected) prevents external code from calling them directly and ensures they're only called in the intended sequence. This pattern is common in frameworks and library code.

**Key takeaway:** Use Template Method with pure virtuals to enforce algorithm structure while allowing step customization.

---

#### Q16: Can you override only some pure virtual functions in a derived class?
**Difficulty:** #intermediate  
**Category:** #syntax #inheritance  
**Concepts:** #pure_virtual #abstract_class #partial_implementation

**Answer:**
Yes, a derived class can override some pure virtuals while leaving others unimplemented, remaining abstract until all pure virtuals are eventually overridden in the inheritance chain.

**Code example:**
```cpp
class Interface {
public:
    virtual void op1() = 0;
    virtual void op2() = 0;
    virtual void op3() = 0;
};

class PartialImpl : public Interface {
public:
    void op1() override { /* impl */ }
    // op2 and op3 not overridden - still abstract
};

class FullImpl : public PartialImpl {
public:
    void op2() override { /* impl */ }
    void op3() override { /* impl */ }
    // ✅ Now concrete
};
```

**Explanation:**
This allows for incremental implementation of complex interfaces and is useful in large inheritance hierarchies. Intermediate classes can provide partial implementations, grouping related operations or sharing code for subset of functionality. A class only becomes concrete (instantiable) when all inherited pure virtuals have been overridden somewhere in the chain. This design enables flexibility in how interfaces are implemented across an inheritance hierarchy.

**Key takeaway:** Classes remain abstract until all inherited pure virtuals are overridden, allowing partial implementations.

---

#### Q17: What happens if you hide a pure virtual function with a different signature?
**Difficulty:** #advanced  
**Category:** #syntax #interview_favorite  
**Concepts:** #pure_virtual #function_hiding #override

**Answer:**
Adding a function with the same name but different signature doesn't override the pure virtual—it hides it, leaving the class abstract and causing compilation errors.

**Code example:**
```cpp
class Base {
public:
    virtual void func() = 0;  // No parameters
};

class Derived : public Base {
public:
    void func(int x) {  // ❌ Different signature - hiding, not override
        std::cout << "Derived::func\n";
    }
};

int main() {
    // Derived d;  // ❌ Error: Derived is still abstract
}
```

**Explanation:**
Function hiding occurs when a derived class declares a function with the same name as a base function, regardless of signature. This hides all base overloads with that name. The pure virtual `func()` remains unimplemented, so `Derived` is still abstract. The `override` keyword would catch this error at compile-time by failing when the signature doesn't match. Always use `override` when you intend to override a virtual function to catch signature mismatches.

**Key takeaway:** Use the override keyword to catch accidental hiding when you intended to override pure virtuals.

---

#### Q18: Can abstract classes participate in multiple inheritance?
**Difficulty:** #intermediate  
**Category:** #inheritance #design_pattern  
**Concepts:** #abstract_class #multiple_inheritance #interface #diamond_problem

**Answer:**
Yes, abstract classes (especially pure interfaces) work well with multiple inheritance, allowing a class to implement multiple interfaces without the diamond problem if the base classes have no state.

**Code example:**
```cpp
class IDrawable {
public:
    virtual void draw() const = 0;
    virtual ~IDrawable() = default;
};

class ISerializable {
public:
    virtual std::string serialize() const = 0;
    virtual ~ISerializable() = default;
};

class Shape : public IDrawable, public ISerializable {
public:
    void draw() const override { /* impl */ }
    std::string serialize() const override { /* impl */ }
};
```

**Explanation:**
Multiple inheritance of pure interfaces is safe because there's no state or implementation to conflict. Each interface adds its own vtable, and the derived class must implement all pure virtuals from all bases. This pattern is common in component-based architectures where objects have multiple capabilities. The diamond problem only occurs when multiple bases share a common base with state, which pure interfaces avoid by having no data members.

**Key takeaway:** Pure interfaces enable safe multiple inheritance by avoiding state conflicts.

---

#### Q19: Why would you make a destructor pure virtual?
**Difficulty:** #advanced  
**Category:** #design_pattern #memory  
**Concepts:** #pure_virtual #destructors #abstract_class

**Answer:**
Making a destructor pure virtual is a way to make a class abstract when you have no other pure virtual functions, ensuring the class cannot be instantiated while providing a clean destructor chain.

**Code example:**
```cpp
class AbstractResource {
public:
    virtual ~AbstractResource() = 0;  // Makes class abstract
};

AbstractResource::~AbstractResource() {  // ✅ Must define
    // Cleanup code
}

class ConcreteResource : public AbstractResource {
public:
    ~ConcreteResource() override {
        // Derived cleanup
    }
};
```

**Explanation:**
Sometimes you want a class to be abstract but have no specific operations to make pure virtual. A pure virtual destructor solves this—it makes the class abstract while ensuring proper polymorphic destruction. Unlike other pure virtuals, the destructor must have a body because it's always called during destruction. This pattern is useful for abstract base classes that primarily provide common data or behavior rather than defining operations.

**Key takeaway:** Use a pure virtual destructor to make a class abstract when you have no other pure virtual functions.

---

#### Q20: Can you call a pure virtual function through a base class pointer?
**Difficulty:** #intermediate  
**Category:** #syntax #polymorphism  
**Concepts:** #pure_virtual #polymorphism #virtual_functions #vtable

**Answer:**
Yes, if the pointer points to a fully constructed derived object that has overridden the pure virtual function, calling it through a base pointer works correctly via dynamic dispatch.

**Code example:**
```cpp
class Base {
public:
    virtual void operation() = 0;
    virtual ~Base() = default;
};

class Derived : public Base {
public:
    void operation() override {
        std::cout << "Derived operation\n";
    }
};

int main() {
    Base* ptr = new Derived();  // ✅ Points to Derived
    ptr->operation();  // ✅ Calls Derived::operation via vtable
    delete ptr;
}
```

**Explanation:**
Pure virtual doesn't mean "cannot be called"—it means "must be overridden before instantiation." Once a derived class provides an implementation and you have a fully constructed object, calling the function through a base pointer works normally via virtual dispatch. The vptr in the derived object points to Derived's vtable, which contains the address of Derived's implementation. This is the whole point of pure virtuals: defining interfaces that work polymorphically once implemented.

**Key takeaway:** Pure virtual functions are called polymorphically through base pointers when overridden in derived classes.

---
