## TOPIC: Copy Constructor vs Assignment Operator and Rule of Three/Five/Zero

### INTERVIEW_QA: Comprehensive Questions and Deep Concepts

#### Q1: What is the difference between a copy constructor and copy assignment operator?
**Difficulty:** #intermediate  
**Category:** #syntax #interview_favorite  
**Concepts:** #copy_constructor #assignment_operator #initialization #resource_management

**Answer:**
A copy constructor initializes a new object from an existing object during creation, while the copy assignment operator assigns to an already-existing object that may contain resources requiring cleanup.

**Code example:**
```cpp
MyClass a;
MyClass b = a;  // ✅ Copy constructor (initialization)
MyClass c;
c = a;          // ✅ Copy assignment (assignment to existing object)
```

**Explanation:**
The fundamental difference is object lifecycle stage. Copy constructor is called during initialization when the object doesn't yet exist, so there's no previous state to clean up. Copy assignment modifies an existing object that may hold resources needing cleanup before assigning new values. This is why assignment operators must guard against self-assignment and clean up old resources, while copy constructors simply initialize. The syntax `=` during declaration invokes the copy constructor, not assignment.

**Key takeaway:** Copy constructor creates new objects; copy assignment modifies existing objects requiring cleanup of old state.

---

#### Q2: What is the Rule of Three?
**Difficulty:** #intermediate  
**Category:** #design_pattern #interview_favorite  
**Concepts:** #rule_of_three #destructors #copy_constructor #assignment_operator #resource_management

**Answer:**
The Rule of Three states that if a class requires a user-defined destructor, copy constructor, or copy assignment operator, it almost certainly requires all three explicitly defined.

**Explanation:**
This rule exists because needing any one of these functions indicates the class manages a resource (memory, file handles, locks) requiring special handling. If the destructor releases a resource, the default shallow copy would create multiple objects pointing to the same resource, causing double-deletion when both objects are destroyed. Defining all three ensures consistent resource management throughout copy and destruction operations. Violating this rule is a common source of memory corruption and resource leaks.

**Key takeaway:** Classes managing resources must define destructor, copy constructor, and copy assignment together for safe resource handling.

---

#### Q3: What is the Rule of Five?
**Difficulty:** #intermediate  
**Category:** #design_pattern #interview_favorite  
**Concepts:** #rule_of_five #move_semantics #move_constructor #move_assignment #performance

**Answer:**
The Rule of Five extends the Rule of Three to include move constructor and move assignment operator, stating that if you define any of the five special member functions, you should define or explicitly delete all five.

**Code example:**
```cpp
class Resource {
public:
    ~Resource();
    Resource(const Resource&);
    Resource& operator=(const Resource&);
    Resource(Resource&&) noexcept;
    Resource& operator=(Resource&&) noexcept;
};
```

**Explanation:**
C++11 introduced move semantics for efficient resource transfer from temporaries. If you're managing resources and define copy operations, you should also consider move operations for performance. Defining moves without copies or vice versa creates incomplete semantics—users expect both copy and move to work or both to be explicitly unavailable. The compiler suppresses automatic generation of moves when you define copies, so you must explicitly provide them if desired. Mark move operations `noexcept` for optimal performance.

**Key takeaway:** Define all five special member functions (or explicitly delete them) when managing resources in C++11 and later.

---

#### Q4: What is the Rule of Zero?
**Difficulty:** #intermediate  
**Category:** #design_pattern #interview_favorite  
**Concepts:** #rule_of_zero #raii #smart_pointers #modern_cpp

**Answer:**
The Rule of Zero states that classes should not define any special member functions if possible, relying instead on member types' automatic resource management through RAII wrappers like smart pointers.

**Code example:**
```cpp
class GoodDesign {
    std::unique_ptr<int[]> data;  // ✅ Manages memory automatically
    std::string name;              // ✅ Manages string automatically
    // No special member functions defined
};
```

**Explanation:**
Modern C++ favors composition with standard library types that handle their own resource management. Using `unique_ptr`, `shared_ptr`, `vector`, and `string` instead of raw pointers eliminates the need for custom destructors and copy/move operations. The compiler-generated special members correctly handle member-wise operations. This approach is safer (no manual memory management), more maintainable (less code), and leverages well-tested standard library implementations. Only define special members when directly interfacing with C APIs or implementing new RAII wrappers.

**Key takeaway:** Prefer composing with RAII types over manual resource management; define no special member functions when possible.

---

#### Q5: Why must copy assignment operators check for self-assignment?
**Difficulty:** #intermediate  
**Category:** #memory #interview_favorite  
**Concepts:** #assignment_operator #self_assignment #undefined_behavior

**Answer:**
Self-assignment checks prevent corrupting the object when it's assigned to itself, which can happen when an assignment operator deletes resources before copying from the source that is the same object.

**Code example:**
```cpp
class Unsafe {
    int* data;
public:
    Unsafe& operator=(const Unsafe& other) {
        delete[] data;  // ❌ Deletes own data if this == &other
        data = new int[100];
        std::copy(other.data, other.data + 100, data);  // ❌ Copies from deleted memory
        return *this;
    }
};

class Safe {
    int* data;
public:
    Safe& operator=(const Safe& other) {
        if (this != &other) {  // ✅ Prevents self-assignment disaster
            delete[] data;
            data = new int[100];
            std::copy(other.data, other.data + 100, data);
        }
        return *this;
    }
};
```

**Explanation:**
Self-assignment (`obj = obj`) occurs in real code through aliases, references, and generic algorithms. Without a check, the typical pattern of "delete old, allocate new, copy from source" fails catastrophically when source and destination are the same object—you delete the data before copying it. The check `if (this != &other)` prevents this. Alternatively, use the copy-and-swap idiom which is naturally self-assignment safe through its design rather than explicit checking.

**Key takeaway:** Always check for self-assignment in copy assignment operators or use copy-and-swap for automatic protection.

---

#### Q6: What is the copy-and-swap idiom?
**Difficulty:** #advanced  
**Category:** #design_pattern #interview_favorite  
**Concepts:** #copy_and_swap #assignment_operator #exception_safety

**Answer:**
The copy-and-swap idiom implements copy assignment by taking the parameter by value (invoking copy constructor), swapping contents with it, and letting the temporary destroy the old data, providing strong exception safety and automatic self-assignment safety.

**Code example:**
```cpp
class Resource {
    int* data;
public:
    Resource& operator=(Resource other) {  // ✅ Pass by value
        swap(other);  // ✅ Swap contents
        return *this;  // other destroyed, cleaning old data
    }
    
    void swap(Resource& other) noexcept {
        std::swap(data, other.data);
    }
};
```

**Explanation:**
This elegant idiom leverages existing copy constructor logic and RAII. Passing by value creates a copy (via copy constructor), ensuring the new data is valid before modifying the object. Swapping is typically noexcept, so the operation is exception-safe—if copying fails, the original object is untouched. Self-assignment works correctly because swapping with a copy of yourself is harmless. The temporary parameter's destructor automatically cleans up the old data. This pattern is preferred in modern C++ for its simplicity and safety guarantees.

**Key takeaway:** Use copy-and-swap for assignment operators to achieve strong exception safety and self-assignment safety automatically.

---

#### Q7: When is the copy constructor called?
**Difficulty:** #beginner  
**Category:** #syntax  
**Concepts:** #copy_constructor #initialization #pass_by_value

**Answer:**
The copy constructor is called when initializing a new object from an existing object, passing objects by value to functions, and returning objects by value from functions (unless elided).

**Code example:**
```cpp
MyClass a;
MyClass b = a;       // ✅ Copy constructor
MyClass c(a);        // ✅ Copy constructor
func(a);             // ✅ Copy constructor (pass by value)
MyClass d = func();  // ✅ Copy constructor (return by value, if not elided)
```

**Explanation:**
Copy constructor is invoked whenever a new object must be created as a copy of an existing one. Initialization syntax using `=` or parentheses both call it. Passing by value creates a copy in the function's parameter space. Returning by value traditionally copies the return value to the caller (though modern compilers use RVO/NRVO to elide this). Note that copy elision can eliminate some of these calls, especially in C++17 where it's mandatory for temporaries.

**Key takeaway:** Copy constructors create new objects from existing ones during initialization, function parameters, and return values.

---

#### Q8: What is copy elision and when is it guaranteed?
**Difficulty:** #advanced  
**Category:** #optimization #interview_favorite  
**Concepts:** #copy_elision #rvo #nrvo #optimization

**Answer:**
Copy elision is a compiler optimization that eliminates copy/move operations by constructing objects directly in their final destination; in C++17, it's guaranteed when returning temporaries but optional for named objects.

**Code example:**
```cpp
Object factory() {
    return Object();  // ✅ C++17: guaranteed elision (RVO)
}

Object create() {
    Object local;
    return local;  // ⚠️ NRVO: optional elision
}
```

**Explanation:**
Return Value Optimization (RVO) eliminates copies when returning temporaries—C++17 makes this mandatory, fundamentally changing semantics so copy/move constructors don't even need to exist. Named Return Value Optimization (NRVO) applies to named local variables but is never guaranteed; compilers apply it when they can determine the single return object at compile time. Copy elision changes observable behavior by eliminating constructor calls, affecting object counting and side effects. This is why returning local objects by value is now the recommended practice, not `std::move`.

**Key takeaway:** C++17 guarantees copy elision for temporaries; trust the compiler and return local objects naturally without std::move.

---

#### Q9: Should you use std::move when returning local objects?
**Difficulty:** #intermediate  
**Category:** #performance  
**Concepts:** #move_semantics #rvo #return_value #optimization

**Answer:**
No, do not use std::move on return values—it prevents copy elision (RVO/NRVO) and can actually pessimize performance by forcing moves when the compiler would have elided operations entirely.

**Code example:**
```cpp
Object good() {
    Object local;
    return local;  // ✅ Allows RVO/NRVO
}

Object bad() {
    Object local;
    return std::move(local);  // ❌ Prevents NRVO, forces move
}
```

**Explanation:**
Returning local objects by name allows the compiler to apply NRVO, constructing the object directly in the caller's destination. Using `std::move` converts the return to an rvalue, preventing NRVO because you're not returning the variable itself but a moved-from version. The compiler then must use the move constructor instead of eliding. While move is cheaper than copy, elision is free—no operation at all. C++ intentionally treats local return values as rvalues without `std::move` to enable both elision and move as fallback.

**Key takeaway:** Return local objects by name without std::move; trust the compiler to elide or move automatically.

---

#### Q10: What is object slicing and how does it relate to copy operations?
**Difficulty:** #intermediate  
**Category:** #inheritance #interview_favorite  
**Concepts:** #object_slicing #copy_constructor #polymorphism #inheritance

**Answer:**
Object slicing occurs when copying a derived class object to a base class object by value, discarding the derived portion and destroying polymorphic behavior.

**Code example:**
```cpp
class Base {
public:
    virtual void func() { std::cout << "Base\n"; }
};

class Derived : public Base {
    int extraData;
public:
    void func() override { std::cout << "Derived\n"; }
};

Base b = Derived();  // ❌ Slicing: extraData lost, vtable changed
b.func();  // Prints "Base", not "Derived"
```

**Explanation:**
When assigning or initializing a base class object from a derived class object using copy operations, only the base portion is copied. The derived class data members are discarded, and the vtable pointer is set to the base class, losing all polymorphic behavior. This is almost never intentional. Prevent slicing by passing polymorphic objects by pointer or reference, making base class copy operations protected or deleted, or using containers of smart pointers rather than values.

**Key takeaway:** Avoid slicing by passing polymorphic types by pointer or reference, never by value.

---

#### Q11: What happens if you don't define a copy constructor for a class with a pointer member?
**Difficulty:** #intermediate  
**Category:** #memory #interview_favorite  
**Concepts:** #copy_constructor #shallow_copy #double_delete #undefined_behavior

**Answer:**
The compiler generates a default copy constructor that performs shallow copy, making multiple objects point to the same memory, causing double-deletion and corruption when both objects are destroyed.

**Code example:**
```cpp
class Dangerous {
    int* data;
public:
    Dangerous() : data(new int[100]) {}
    ~Dangerous() { delete[] data; }
    // ❌ No copy constructor defined
};

int main() {
    Dangerous a;
    Dangerous b = a;  // ❌ Shallow copy: both point to same memory
    // ❌ Double-delete when a and b are destroyed
}
```

**Explanation:**
The default copy constructor copies each member using its own copy semantics. For pointers, this means copying the pointer value (address), not the pointed-to data. Both objects end up with pointers to the same memory. When the first object is destroyed, it deletes the memory. The second object's destructor then attempts to delete already-freed memory, causing undefined behavior—typically a crash or heap corruption. This is why the Rule of Three exists: classes managing resources must define proper deep-copy constructors.

**Key takeaway:** Classes with pointer members need custom copy constructors for deep copying; default shallow copy causes double-deletion.

---

#### Q12: How do deleted copy operations affect movability?
**Difficulty:** #advanced  
**Category:** #syntax  
**Concepts:** #deleted_functions #move_semantics #copy_constructor

**Answer:**
Deleting copy operations doesn't automatically make a type movable—the compiler also suppresses move generation when copies are deleted unless moves are explicitly defined or defaulted.

**Code example:**
```cpp
class OnlyMovable {
public:
    OnlyMovable(const OnlyMovable&) = delete;
    OnlyMovable& operator=(const OnlyMovable&) = delete;
    OnlyMovable(OnlyMovable&&) = default;  // ✅ Must explicitly default
    OnlyMovable& operator=(OnlyMovable&&) = default;
};
```

**Explanation:**
Deleting copy operations doesn't imply move operations should exist—move operations require explicit declaration. The compiler's logic is conservative: if you deleted copies, you're indicating special handling is needed, so it won't generate moves automatically. To create a move-only type, explicitly delete copies AND explicitly default or define moves. This pattern is used for types like `unique_ptr` and `thread` that represent unique ownership or non-duplicable resources.

**Key takeaway:** Explicitly default move operations when creating move-only types; deleting copies doesn't automatically enable moves.

---

#### Q13: What is the significance of returning *this from assignment operators?
**Difficulty:** #intermediate  
**Category:** #syntax #design_pattern  
**Concepts:** #assignment_operator #operator_overloading #chaining

**Answer:**
Returning `*this` from assignment operators enables chaining assignments (`a = b = c`) and matches the behavior of built-in types, maintaining consistency with expected C++ semantics.

**Code example:**
```cpp
class MyClass {
public:
    MyClass& operator=(const MyClass& other) {
        if (this != &other) {
            // Copy logic
        }
        return *this;  // ✅ Enable chaining
    }
};

// Usage:
MyClass a, b, c;
a = b = c;  // ✅ Works due to return *this
```

**Explanation:**
Assignment operators should return a reference to the left-hand operand to support chained assignments, which are evaluated right-to-left. The expression `a = b = c` becomes `a.operator=(b.operator=(c))`, requiring each assignment to return a reference to the assigned object. Returning by value would create copies, defeating efficiency. Returning by reference maintains the object's identity. This convention matches built-in type behavior and is expected throughout the standard library and user code.

**Key takeaway:** Always return *this by reference from assignment operators to enable chaining and match built-in type behavior.

---

#### Q14: How does the compiler decide which special member functions to generate?
**Difficulty:** #advanced  
**Category:** #syntax #interview_favorite  
**Concepts:** #compiler_generated #special_members #rule_of_five

**Answer:**
The compiler generates special member functions based on complex interdependent rules: user-declaring any special member (destructor, copy/move operations) can suppress generation of others following the Rule of Five logic.

**Explanation:**
If no special members are declared, the compiler generates all (Rule of Zero scenario). Declaring a copy constructor or copy assignment suppresses move generation. Declaring move operations suppresses copy generation. Declaring a destructor doesn't suppress copies in C++98 (backward compatibility) but should according to modern guidelines. These rules prevent the compiler from generating potentially incorrect special members when you've indicated custom handling is needed. Understanding these rules is crucial because they changed between C++ versions, and relying on implicit generation can lead to subtle bugs.

**Key takeaway:** Declaring any special member function affects which others the compiler generates; prefer explicit declaration or deletion for clarity.

---

#### Q15: What is the difference between deleted and private special member functions?
**Difficulty:** #intermediate  
**Category:** #syntax  
**Concepts:** #deleted_functions #access_specifiers #move_semantics

**Answer:**
Deleted functions (C++11) produce clear compile errors at the call site and participate in overload resolution, while private functions (C++98) produce cryptic linker errors and don't participate in overload resolution.

**Code example:**
```cpp
class Modern {
public:
    Modern(const Modern&) = delete;  // ✅ Clear error message
};

class Old {
private:
    Old(const Old&);  // ❌ Private, linker error if friend tries to use
};
```

**Explanation:**
The old C++98 idiom of making special members private without definition prevented copying but had problems: member functions and friends could still call them (causing linker errors), and error messages were confusing. C++11's `= delete` is superior: it produces immediate compile errors with clear messages, works from any context (even member functions), and properly participates in overload resolution. Deleted functions are considered in overload resolution but cause errors if selected, enabling better SFINAE and template techniques.

**Key takeaway:** Use `= delete` instead of private declarations to prevent operations; it provides better errors and language semantics.

---

#### Q16: Can you have a class that is copyable but not movable?
**Difficulty:** #intermediate  
**Category:** #syntax  
**Concepts:** #copy_constructor #move_semantics #deleted_functions

**Answer:**
Yes, explicitly delete move operations while keeping copy operations available, though this is unusual since moves are typically at least as permissive as copies.

**Code example:**
```cpp
class CopyOnly {
public:
    CopyOnly(const CopyOnly&) = default;
    CopyOnly& operator=(const CopyOnly&) = default;
    CopyOnly(CopyOnly&&) = delete;  // ❌ Explicitly delete move
    CopyOnly& operator=(CopyOnly&&) = delete;
};
```

**Explanation:**
This pattern is rare because move operations are typically optimizations—if copying is safe, moving should be too. However, you might delete moves if moving would violate class invariants or if you want to force observable copy semantics for testing or debugging. More commonly, types are move-only (like `unique_ptr`) or both copyable and movable. When moves are deleted, temporaries fall back to copying if copies are available, potentially impacting performance.

**Key takeaway:** Classes can be copy-only by deleting moves, though this is unusual; typically moves are enabled if copies are.

---

#### Q17: What is the noexcept specifier's importance for move operations?
**Difficulty:** #advanced  
**Category:** #performance  
**Concepts:** #move_semantics #noexcept #exception_safety #stl_containers

**Answer:**
Marking move operations `noexcept` is critical for performance because standard library containers only use move operations (instead of copies) during reallocations if they're guaranteed not to throw.

**Code example:**
```cpp
class Optimized {
public:
    Optimized(Optimized&&) noexcept;  // ✅ Used by std::vector
    Optimized& operator=(Optimized&&) noexcept;
};

class Pessimized {
public:
    Optimized(Optimized&&);  // ❌ Not noexcept, vector copies instead
};
```

**Explanation:**
When `std::vector` needs to grow, it must move elements to new storage. If move operations can throw, strong exception safety is impossible—a failure mid-move would leave elements in inconsistent state. Therefore, vector only uses moves if they're `noexcept`, falling back to copies otherwise. Since most move operations just swap pointers and trivially cannot throw, mark them `noexcept`. This dramatically improves performance—moving is O(n) pointer swaps versus O(n) expensive copies. Forgetting `noexcept` on moves is a common performance bug.

**Key takeaway:** Always mark move operations noexcept when they truly can't throw to enable optimal container performance.

---

#### Q18: What happens if you don't implement a destructor for a class managing resources?
**Difficulty:** #beginner  
**Category:** #memory  
**Concepts:** #destructors #memory_leak #resource_management

**Answer:**
Without a destructor, resources are never released, causing memory leaks, resource leaks, and resource exhaustion as objects are destroyed without cleanup.

**Code example:**
```cpp
class Leaky {
    int* data;
public:
    Leaky() : data(new int[1000]) {}
    // ❌ No destructor
};

int main() {
    for (int i = 0; i < 1000; i++) {
        Leaky obj;  // ❌ Allocates 1000 ints
    }  // ❌ Memory never freed, leaks 1000*1000 ints
}
```

**Explanation:**
The default destructor performs memberwise destruction, calling destructors on class-type members but doing nothing for raw pointers. Allocated memory, opened files, network connections, locks—none are released automatically. This causes resource exhaustion: memory fills up, file handles are exhausted, locks remain held. The solution is defining a destructor that releases all resources, following RAII (Resource Acquisition Is Initialization) principles. Better yet, use smart pointers and RAII wrappers that handle cleanup automatically (Rule of Zero).

**Key takeaway:** Classes managing resources must define destructors to release them; prefer RAII wrappers like smart pointers to avoid manual management.

---

#### Q19: Can copy assignment operator call the copy constructor?
**Difficulty:** #intermediate  
**Category:** #design_pattern  
**Concepts:** #assignment_operator #copy_constructor #copy_and_swap

**Answer:**
Yes, through the copy-and-swap idiom where the assignment operator takes its parameter by value (invoking copy constructor), then swaps with it.

**Code example:**
```cpp
class Smart {
public:
    Smart(const Smart& other);  // Copy constructor
    
    Smart& operator=(Smart other) {  // ✅ Takes by value, calls copy ctor
        swap(other);
        return *this;
    }
    
    void swap(Smart& other) noexcept;
};
```

**Explanation:**
The traditional approach implements copy constructor and copy assignment separately with duplicated logic. The copy-and-swap idiom eliminates duplication: the assignment operator takes its parameter by value, which invokes the copy constructor automatically. Then it swaps contents with the temporary, and the temporary's destructor cleans up the old data. This provides strong exception safety (copying happens before modifying the object) and automatic self-assignment safety. It's elegant but may be less efficient for types where assignment can reuse existing capacity.

**Key takeaway:** Copy-and-swap idiom leverages the copy constructor in assignment implementation for safer, more maintainable code.

---

#### Q20: What is the impact of not following the Rule of Three/Five?
**Difficulty:** #intermediate  
**Category:** #memory #interview_favorite  
**Concepts:** #rule_of_three #rule_of_five #undefined_behavior #memory_leak

**Answer:**
Violating the Rule of Three/Five causes double-deletion crashes, memory leaks, resource leaks, data corruption, and unpredictable behavior due to shallow copies and improper resource management.

**Code example:**
```cpp
class Broken {
    char* buffer;
public:
    Broken() : buffer(new char[1024]) {}
    ~Broken() { delete[] buffer; }
    // ❌ No copy constructor or assignment
};

Broken a;
Broken b = a;  // ❌ Shallow copy
// ❌ Both destructors delete same memory
```

**Explanation:**
Without proper copy operations, the default shallow copy makes multiple objects share the same resource. The first destructor releases it, leaving other objects with dangling pointers. When they destruct, they attempt to release already-freed memory, causing crashes. If objects are assigned, old resources leak because the default assignment doesn't clean them up. Move operations are inefficient or broken if not implemented. These bugs are subtle, often appearing only under specific conditions, making them hard to debug. Following the rules eliminates these issues.

**Key takeaway:** Violating Rule of Three/Five causes memory corruption and leaks; always implement all special members together for resource-managing classes.

---
