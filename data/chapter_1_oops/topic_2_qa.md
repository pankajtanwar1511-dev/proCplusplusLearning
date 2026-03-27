## TOPIC: Encapsulation, Inheritance, and Polymorphism

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
