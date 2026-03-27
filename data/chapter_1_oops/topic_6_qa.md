## TOPIC: Rule of Five, Destructors, and Object Slicing - Advanced Concepts

### INTERVIEW_QA: Comprehensive Questions on Advanced Topics

#### Q1: What is the Rule of Five and why was it introduced?
**Difficulty:** #intermediate  
**Category:** #design_pattern #interview_favorite  
**Concepts:** #rule_of_five #move_semantics #resource_management

**Answer:**
The Rule of Five states that if a class defines any of destructor, copy constructor, copy assignment, move constructor, or move assignment, it should explicitly define or delete all five to ensure correct resource management and clear intent.

**Explanation:**
Introduced with C++11 to incorporate move semantics into the Rule of Three, the Rule of Five recognizes that resource-managing classes need coordinated control over all special member functions. The compiler's implicit generation rules create interdependencies: declaring one function can suppress generation of others. Explicitly defining all five eliminates ambiguity and prevents subtle bugs from relying on compiler-generated defaults that may not match the class's resource semantics.

**Key takeaway:** Define or delete all five special member functions explicitly when managing resources to avoid implicit generation surprises.

---

#### Q2: If you declare a move constructor, what happens to the copy constructor?
**Difficulty:** #advanced  
**Category:** #syntax #interview_favorite  
**Concepts:** #move_constructor #copy_constructor #compiler_generated

**Answer:**
Declaring a move constructor suppresses automatic generation of the copy constructor—the compiler does not generate it, making the class move-only unless you explicitly define or default the copy constructor.

**Explanation:**
The compiler's logic: if you defined a move constructor, you're indicating special resource handling, so it won't presume to know how copying should work. This prevents accidental inefficient copies when moves were intended. To make a class both copyable and movable after defining move operations, explicitly define or default the copy operations. This is part of the Rule of Five's purpose—forcing explicit decisions about all special member functions.

**Key takeaway:** Declaring move operations suppresses copy operations; explicitly default copy operations if both are needed.

---

#### Q3: What happens to move operations if you define a destructor?
**Difficulty:** #advanced  
**Category:** #syntax #interview_favorite  
**Concepts:** #destructors #move_semantics #compiler_generated

**Answer:**
Defining a destructor suppresses automatic generation of move constructor and move assignment—the compiler assumes you're managing resources and won't generate moves automatically.

**Explanation:**
This rule reflects the philosophy that user-defined destructors indicate resource management, which likely requires custom move semantics too. The compiler conservatively avoids generating potentially incorrect moves. While copy operations are still generated (for backward compatibility with pre-C++11 code), modern practice recommends explicitly defining or defaulting all five special members when any one is defined, following the Rule of Five strictly.

**Key takeaway:** User-defined destructors suppress move generation; explicitly define or default moves when needed.

---

#### Q4: Why make base class destructors virtual?
**Difficulty:** #intermediate  
**Category:** #memory #interview_favorite  
**Concepts:** #virtual_destructors #inheritance #polymorphism #undefined_behavior

**Answer:**
Virtual destructors ensure that deleting a derived object through a base pointer correctly calls the derived destructor first, preventing resource leaks and undefined behavior.

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
delete ptr;  // ✅ Calls Derived::~Derived() then Base::~Base()
```

**Explanation:**
Without a virtual destructor, deleting through a base pointer invokes only the base destructor, leaking derived resources and causing undefined behavior. The vtable mechanism ensures the correct destructor chain executes from most derived to base. This is essential for polymorphic hierarchies and applies even with smart pointers, as they determine the deleter based on the static type at construction.

**Key takeaway:** Always make base class destructors virtual in polymorphic hierarchies to ensure proper cleanup.

---

#### Q5: Can pure virtual destructors exist, and do they need definitions?
**Difficulty:** #advanced  
**Category:** #syntax #interview_favorite  
**Concepts:** #pure_virtual #destructors #abstract_class

**Answer:**
Yes, destructors can be pure virtual to make a class abstract, but unlike other pure virtual functions, they must have a body defined because destructors always execute during destruction.

**Code example:**
```cpp
class Abstract {
public:
    virtual ~Abstract() = 0;  // Pure virtual
};

Abstract::~Abstract() {}  // ✅ Must define, or linker error
```

**Explanation:**
Pure virtual destructors serve two purposes: making the class abstract when no other pure virtuals exist, and ensuring proper cleanup through the destructor chain. Even though declared pure, the destructor must have a body because base class destructors always execute after derived destructors. Forgetting to define it causes cryptic linker errors about undefined symbols.

**Key takeaway:** Pure virtual destructors require body definitions; they make classes abstract while ensuring proper cleanup chains.

---

#### Q6: What is object slicing and when does it occur?
**Difficulty:** #intermediate  
**Category:** #inheritance #interview_favorite  
**Concepts:** #object_slicing #polymorphism #inheritance

**Answer:**
Object slicing occurs when a derived class object is copied to a base class object by value, discarding the derived portion and destroying polymorphic behavior.

**Code example:**
```cpp
class Base {
    virtual void func() { std::cout << "Base\n"; }
};

class Derived : public Base {
    int extraData;
    void func() override { std::cout << "Derived\n"; }
};

void process(Base b) {  // ❌ Pass by value
    b.func();  // Always prints "Base"
}

Derived d;
process(d);  // Slicing occurs
```

**Explanation:**
Slicing happens during pass-by-value, container insertion, or assignment to base type. The derived portion is physically cut off, losing data members and changing the vtable pointer to point to the base class, eliminating polymorphism. This violates the Liskov Substitution Principle and is almost never intentional. Always pass polymorphic objects by reference or pointer to preserve their full type.

**Key takeaway:** Prevent slicing by passing polymorphic objects by reference or pointer, never by value.

---

#### Q7: Why is explicitly defaulting special member functions better than relying on implicit generation?
**Difficulty:** #intermediate  
**Category:** #design_pattern  
**Concepts:** #default_functions #rule_of_five #explicit_intent

**Answer:**
Explicitly defaulting special member functions clarifies intent, ensures correct generation even when other special members are declared, and improves code documentation and template compatibility.

**Code example:**
```cpp
class Resource {
public:
    Resource() = default;
    ~Resource() = default;
    Resource(const Resource&) = default;
    Resource& operator=(const Resource&) = default;
    Resource(Resource&&) = default;
    Resource& operator=(Resource&&) = default;
};
```

**Explanation:**
Explicit defaulting documents that you've considered each special member function rather than accidentally relying on implicit rules. It prevents subtle bugs when adding destructors or other special members later, which would otherwise suppress automatic generation. In templates, explicit defaulting ensures functions exist with the expected signatures. It also makes code review easier by showing clear intent rather than requiring reviewers to memorize complex generation rules.

**Key takeaway:** Explicitly default special member functions to document intent and prevent subtle implicit generation changes.

---

#### Q8: How do you make a class move-only?
**Difficulty:** #intermediate  
**Category:** #syntax #design_pattern  
**Concepts:** #move_semantics #move_only #deleted_functions

**Answer:**
Delete the copy constructor and copy assignment operator while defining or defaulting the move constructor and move assignment operator.

**Code example:**
```cpp
class MoveOnly {
public:
    MoveOnly() = default;
    MoveOnly(const MoveOnly&) = delete;
    MoveOnly& operator=(const MoveOnly&) = delete;
    MoveOnly(MoveOnly&&) = default;
    MoveOnly& operator=(MoveOnly&&) = default;
};
```

**Explanation:**
Move-only types represent unique ownership semantics where objects cannot be duplicated but can transfer ownership. Examples include `std::unique_ptr`, file handles, and thread objects. Deleting copy operations makes copying a compile error, while providing moves enables efficient transfer. This pattern enforces single-ownership invariants at compile time, preventing accidental duplication of unique resources.

**Key takeaway:** Delete copy operations and provide move operations to create move-only types with unique ownership semantics.

---

#### Q9: What happens if you delete only the move constructor but not the copy constructor?
**Difficulty:** #advanced  
**Category:** #syntax  
**Concepts:** #move_constructor #deleted_functions #copy_constructor

**Answer:**
The class becomes move-incompatible but remains copyable; in contexts where moves are expected (like return by value without elision), copying occurs if available, or a compile error if copy is also deleted.

**Code example:**
```cpp
class NoMove {
public:
    NoMove(const NoMove&) { std::cout << "Copy\n"; }
    NoMove(NoMove&&) = delete;
};

NoMove create() {
    return NoMove();  // ⚠️ May copy or error depending on context
}
```

**Explanation:**
Deleting only the move constructor creates an unusual situation where the class explicitly rejects moves while allowing copies. In practice, this is rare and usually indicates a design problem. Most contexts requiring moves will fall back to copying if available, potentially impacting performance. If no copy exists either, the code won't compile. This asymmetry violates user expectations and should be avoided except in specific cases where moves would violate invariants.

**Key takeaway:** Avoid deleting only move operations; typically delete both copy and move together or provide both.

---

#### Q10: Does std::unique_ptr require a user-defined copy constructor?
**Difficulty:** #intermediate  
**Category:** #syntax  
**Concepts:** #unique_ptr #copy_constructor #move_only

**Answer:**
No, because std::unique_ptr is move-only; the compiler automatically deletes copy operations due to unique_ptr's deleted copy constructor.

**Code example:**
```cpp
class Holder {
    std::unique_ptr<int> data;
public:
    Holder() : data(std::make_unique<int>(42)) {}
    // Copy operations automatically deleted
    // Move operations automatically generated
};

Holder h1;
// Holder h2 = h1;  // ❌ Error: copy deleted
Holder h3 = std::move(h1);  // ✅ OK: moves
```

**Explanation:**
The presence of a move-only member like unique_ptr causes the compiler to delete copy operations for the containing class. Move operations are still generated if no user-defined special members exist. To make the class copyable, you must explicitly define copy operations that handle the unique_ptr appropriately (likely by cloning the pointed-to object). This automatic deletion propagates move-only semantics naturally.

**Key takeaway:** Move-only members automatically make containing classes move-only unless copy operations are explicitly defined.

---

#### Q11: If a base class has a deleted copy constructor, what happens to the derived class?
**Difficulty:** #intermediate  
**Category:** #inheritance  
**Concepts:** #copy_constructor #deleted_functions #inheritance

**Answer:**
The derived class's copy constructor is implicitly deleted because it cannot call the base class's deleted copy constructor, making the derived class non-copyable.

**Code example:**
```cpp
class Base {
public:
    Base(const Base&) = delete;
};

class Derived : public Base {
    // Copy constructor implicitly deleted
};

// Derived d1;
// Derived d2 = d1;  // ❌ Error: implicitly deleted
```

**Explanation:**
Copy constructors must initialize the base class portion by calling the base copy constructor. If that's deleted, there's no way to construct the base, so the derived copy constructor cannot be generated and is implicitly deleted. This deletion propagates down the inheritance hierarchy, enforcing non-copyable semantics throughout. Move operations may still be available if explicitly defined in both base and derived.

**Key takeaway:** Deleted base class copy operations propagate deletion to all derived classes automatically.

---

#### Q12: Why should move operations be marked noexcept?
**Difficulty:** #intermediate  
**Category:** #performance #interview_favorite  
**Concepts:** #move_semantics #noexcept #stl_containers

**Answer:**
Marking move operations noexcept enables optimal performance in standard containers, which only use moves if they're guaranteed not to throw; otherwise, they fall back to copies for exception safety.

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
When std::vector grows, it must move elements to new storage. If moves can throw, strong exception safety is impossible—a failure mid-move leaves elements in inconsistent state. Therefore, vector only uses moves if they're noexcept, copying otherwise. Since most move operations just swap pointers and cannot throw, marking them noexcept is free and dramatically improves performance. Forgetting noexcept on moves is a common performance bug.

**Key takeaway:** Always mark move operations noexcept when possible to enable container optimizations and improve performance.

---

#### Q13: Can you design a class that is copyable but not movable?
**Difficulty:** #intermediate  
**Category:** #design_pattern  
**Concepts:** #copy_constructor #move_semantics #deleted_functions

**Answer:**
Yes, by explicitly deleting move operations while keeping copy operations, though this is unusual since moves are typically optimizations over copies.

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
This pattern is rare because if copying is safe, moving should also be safe and more efficient. However, you might delete moves if move semantics would violate class invariants, or if you want to force observable copy behavior for testing. When moves are deleted, operations that would normally use moves (like returning temporaries) fall back to copying, potentially impacting performance. Use this pattern only when there's a specific reason moves shouldn't be allowed.

**Key takeaway:** Copy-only types are possible but unusual; ensure there's a valid reason to prohibit moves when copies work.

---

#### Q14: What is the impact of a non-virtual destructor in a polymorphic base class?
**Difficulty:** #intermediate  
**Category:** #memory #interview_favorite  
**Concepts:** #virtual_destructors #undefined_behavior #memory_leak

**Answer:**
Deleting a derived object through a base pointer with a non-virtual destructor causes undefined behavior, typically leaking derived resources and potentially corrupting memory.

**Code example:**
```cpp
class Base {
public:
    ~Base() {}  // ❌ Not virtual
};

class Derived : public Base {
    int* data;
public:
    Derived() : data(new int[1000]) {}
    ~Derived() { delete[] data; }
};

Base* ptr = new Derived();
delete ptr;  // ❌ UB: only ~Base() runs, leaks data
```

**Explanation:**
Without virtual dispatch, the base pointer's static type determines which destructor runs, executing only Base::~Base(). The derived destructor never runs, leaking its resources. This is undefined behavior that may crash immediately, corrupt memory silently, or appear to work in simple tests. The solution is simple: make base destructors virtual whenever the class is intended for polymorphic use. Modern compilers may warn, but it's not guaranteed.

**Key takeaway:** Non-virtual destructors in polymorphic bases cause undefined behavior and resource leaks; always use virtual destructors.

---

#### Q15: How does the copy-and-swap idiom relate to the Rule of Five?
**Difficulty:** #advanced  
**Category:** #design_pattern  
**Concepts:** #copy_and_swap #rule_of_five #assignment_operator

**Answer:**
The copy-and-swap idiom implements copy assignment using the copy constructor and a swap function, potentially simplifying Rule of Five implementation by reducing code duplication.

**Code example:**
```cpp
class Resource {
    int* data;
public:
    Resource(const Resource& other);  // Copy constructor
    
    Resource& operator=(Resource other) {  // Pass by value
        swap(other);
        return *this;
    }
    
    void swap(Resource& other) noexcept {
        std::swap(data, other.data);
    }
};
```

**Explanation:**
Copy-and-swap leverages the copy constructor to create a temporary, then swaps with it, providing strong exception safety and automatic self-assignment safety. However, it doesn't eliminate the need for Rule of Five—you still need destructor, copy constructor, and move operations. The idiom can make assignment simpler but adds an extra copy operation compared to direct assignment. It's a trade-off between simplicity and potential performance.

**Key takeaway:** Copy-and-swap simplifies assignment implementation but doesn't replace Rule of Five; all special members still need consideration.

---

#### Q16: What is the significance of protected copy operations in polymorphic base classes?
**Difficulty:** #advanced  
**Category:** #design_pattern #inheritance  
**Concepts:** #object_slicing #protected_members #polymorphism

**Answer:**
Protected copy operations prevent object slicing by making it a compile error to copy base class objects directly, forcing users to pass polymorphic types by reference or pointer.

**Code example:**
```cpp
class Shape {
protected:
    Shape(const Shape&) = default;
    Shape& operator=(const Shape&) = default;
public:
    virtual void draw() const = 0;
    virtual ~Shape() = default;
};

// Shape s1 = s2;  // ❌ Error: protected copy
void render(const Shape& s);  // ✅ Must pass by reference
```

**Explanation:**
This design pattern enforces that polymorphic objects can only be copied by derived classes internally, not by external code. Users must work with references or pointers, preventing accidental slicing. Derived classes can still copy themselves correctly. Combined with a virtual clone() method for explicit copying, this creates a slicing-proof interface that maintains polymorphic behavior while allowing controlled duplication.

**Key takeaway:** Protected copy operations prevent slicing by forcing polymorphic types to be used through references or pointers.

---

#### Q17: How does object slicing affect virtual function behavior?
**Difficulty:** #intermediate  
**Category:** #inheritance  
**Concepts:** #object_slicing #virtual_functions #vtable

**Answer:**
Slicing changes the vtable pointer to point to the base class table, causing virtual function calls to resolve to base implementations instead of derived overrides, destroying polymorphic behavior.

**Code example:**
```cpp
class Animal {
public:
    virtual void speak() { std::cout << "Animal\n"; }
};

class Dog : public Animal {
public:
    void speak() override { std::cout << "Woof\n"; }
};

void makeSound(Animal a) {  // ❌ Pass by value
    a.speak();  // Always prints "Animal"
}

Dog d;
makeSound(d);  // Sliced to Animal
```

**Explanation:**
When an object is sliced, the vtable pointer is rewritten to point to the base class vtable during the copy operation. All subsequent virtual function calls dispatch to base implementations. The sliced object is truly an Animal object, not a Dog anymore—the derived portion no longer exists in memory. This complete loss of polymorphism makes slicing particularly dangerous because it silently changes program behavior.

**Key takeaway:** Slicing destroys polymorphism by changing the vtable pointer; always pass polymorphic types by reference or pointer.

---

#### Q18: Why can't you return local objects by reference?
**Difficulty:** #beginner  
**Category:** #memory  
**Concepts:** #return_value #references #undefined_behavior

**Answer:**
Returning references to local objects causes undefined behavior because the local object is destroyed when the function returns, leaving a dangling reference to dead memory.

**Code example:**
```cpp
const Resource& bad() {
    Resource local;
    return local;  // ❌ UB: local destroyed
}

Resource good() {
    Resource local;
    return local;  // ✅ OK: moves or copies
}
```

**Explanation:**
Local objects have automatic storage duration—they're destroyed when the function exits. Returning a reference to a destroyed object creates a dangling reference that points to invalid memory. Any attempt to use it invokes undefined behavior. Return by value instead, which moves or copies the object to the caller's scope. With move semantics and copy elision, return by value is efficient and safe.

**Key takeaway:** Never return references to local objects; return by value and trust move semantics and copy elision.

---

#### Q19: How do smart pointers interact with virtual destructors?
**Difficulty:** #intermediate  
**Category:** #memory  
**Concepts:** #smart_pointers #virtual_destructors #unique_ptr #shared_ptr

**Answer:**
Smart pointers require virtual destructors in polymorphic bases for correct cleanup; they determine the deleter at construction based on the static type, requiring proper virtual dispatch.

**Code example:**
```cpp
class Base {
public:
    virtual ~Base() = default;  // ✅ Virtual
};

class Derived : public Base {
public:
    ~Derived() override { /* cleanup */ }
};

std::unique_ptr<Base> ptr = std::make_unique<Derived>();
// ✅ ~Derived() then ~Base() called correctly
```

**Explanation:**
Even though smart pointers automate deletion, they don't eliminate the need for virtual destructors. The smart pointer stores a deleter determined at construction time. For unique_ptr, this typically calls delete on the stored pointer. Without a virtual destructor, only the base destructor runs. Virtual destructors ensure the complete destructor chain executes. This is a common misconception that smart pointers solve all destruction issues.

**Key takeaway:** Smart pointers require virtual destructors in polymorphic hierarchies for correct cleanup; they don't eliminate this requirement.

---

#### Q20: What is the relationship between the Rule of Five and the Pimpl idiom?
**Difficulty:** #advanced  
**Category:** #design_pattern  
**Concepts:** #rule_of_five #pimpl #incomplete_type #unique_ptr

**Answer:**
Pimpl classes using unique_ptr must explicitly define or default special member functions in the implementation file where the implementation class is complete, as the compiler needs the complete type to generate destructors and special members.

**Code example:**
```cpp
// Header
class Widget {
    class Impl;
    std::unique_ptr<Impl> pImpl;
public:
    Widget();
    ~Widget();  // ✅ Must declare
    Widget(Widget&&);  // ✅ Must declare
    Widget& operator=(Widget&&);
};

// Implementation
Widget::~Widget() = default;  // ✅ Define where Impl is complete
Widget::Widget(Widget&&) = default;
Widget& Widget::operator=(Widget&&) = default;
```

**Explanation:**
The Pimpl idiom hides implementation details behind a pointer to an incomplete type. The unique_ptr needs to know how to delete the Impl, requiring a complete type when the destructor runs. If destructor and move operations are implicitly generated in the header where Impl is incomplete, compilation fails. Declaring them in the header and defining them in the implementation file where Impl is complete solves this. This is a subtle interaction between Rule of Five and incomplete types.

**Key takeaway:** Pimpl classes with unique_ptr must explicitly declare special members in header and define them where the implementation type is complete.

---
