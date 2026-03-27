## TOPIC: C++ Low-Level Internals and Common Pitfalls

### INTERVIEW_QA: Comprehensive Questions and Answers

#### Q1: What is a vtable and how does it enable runtime polymorphism?
**Difficulty:** #intermediate
**Category:** #memory #performance
**Concepts:** #vtable #vptr #virtual_functions #runtime_polymorphism #dynamic_dispatch

**Answer:**
A vtable (virtual table) is a static, per-class table of function pointers to virtual function implementations. Each object with virtual functions contains a vptr (virtual pointer) pointing to its class's vtable. When calling a virtual function, the compiler generates code to dereference the vptr and call the function through the vtable.

**Code example:**
```cpp
struct Base {
    virtual void foo() { std::cout << "Base\n"; }
};
struct Derived : Base {
    void foo() override { std::cout << "Derived\n"; }
};

Base* b = new Derived();
b->foo();  // ✅ Calls Derived::foo via vtable lookup
```

**Explanation:**
The `b->foo()` call is translated to roughly `b->vptr[index_of_foo]()`. Since b points to a Derived object, its vptr points to Derived's vtable, which contains the address of Derived::foo. This indirection allows runtime polymorphism but adds one level of indirection compared to non-virtual calls.

**Key takeaway:** Vtables enable runtime polymorphism through indirection, trading a small performance cost for flexibility.

---

#### Q2: What is object slicing and why is it dangerous?
**Difficulty:** #intermediate
**Category:** #memory #design_pattern
**Concepts:** #object_slicing #inheritance #virtual_functions #polymorphism

**Answer:**
Object slicing occurs when assigning a derived class object to a base class object by value. Only the base class portion is copied, losing derived class members and the vptr, destroying polymorphic behavior.

**Code example:**
```cpp
Derived d;
Base b = d;  // ❌ Object slicing - loses Derived parts
b.foo();     // Calls Base::foo, not Derived::foo
```

**Explanation:**
When copying d to b, only Base's members (including vptr pointing to Base's vtable) are copied. The Derived-specific members and vtable connection are lost. This breaks polymorphism and can cause logic errors. Always use pointers or references (`Base* b = &d;` or `Base& b = d;`) to maintain polymorphic behavior.

**Key takeaway:** Pass polymorphic objects by pointer or reference, never by value, to avoid slicing.

---

#### Q3: How does struct member ordering affect memory usage?
**Difficulty:** #beginner
**Category:** #memory #performance
**Concepts:** #alignment #padding #memory_optimization #struct_layout

**Answer:**
The compiler inserts padding bytes between struct members to satisfy alignment requirements. Ordering members from largest to smallest type minimizes padding waste.

**Code example:**
```cpp
struct Bad {
    char a;  // 1 byte + 3 padding
    int b;   // 4 bytes
    char c;  // 1 byte + 3 padding
};  // Total: 12 bytes

struct Good {
    int b;   // 4 bytes
    char a;  // 1 byte
    char c;  // 1 byte (+ 2 padding at end)
};  // Total: 8 bytes
```

**Explanation:**
In Bad, padding after a aligns b to 4-byte boundary, and padding after c aligns the struct size to 4 bytes. Good places all chars together, reducing padding. This 33% size reduction multiplies across millions of allocations in data-intensive applications like sensor processing.

**Key takeaway:** Order struct members from largest to smallest to minimize padding and memory usage.

---

#### Q4: Explain the difference between `const int* p` and `int* const p`.
**Difficulty:** #beginner
**Category:** #syntax #interview_favorite
**Concepts:** #const_correctness #pointers #const_pointer

**Answer:**
`const int* p` is a pointer to a const int (can't modify `*p`, can reassign `p`). `int* const p` is a const pointer to int (can modify `*p`, can't reassign `p`).

**Code example:**
```cpp
int x = 1, y = 2;

const int* p1 = &x;
// *p1 = 5;  // ❌ Error - can't modify via p1
p1 = &y;     // ✅ OK - can reassign pointer

int* const p2 = &x;
*p2 = 5;     // ✅ OK - can modify via p2
// p2 = &y;  // ❌ Error - can't reassign pointer
```

**Explanation:**
Read pointer declarations right-to-left: "const int*" is "pointer to const int", while "int* const" is "const pointer to int". The position of const determines what is immutable. `const int* const p` makes both immutable.

**Key takeaway:** const applies to what's immediately to its left (or right if nothing is to its left); use this to reason about pointer constness.

---

#### Q5: Why can't you call a non-const member function on a const object?
**Difficulty:** #beginner
**Category:** #syntax #const_correctness
**Concepts:** #const_member_functions #const_correctness #encapsulation

**Answer:**
Non-const member functions don't promise to leave the object unchanged, so calling them on const objects would violate const correctness. The compiler enforces this at compile time.

**Code example:**
```cpp
struct S {
    int x;
    void modify() { x = 10; }           // Non-const
    void read() const { /* no modify */ } // Const
};

const S s;
// s.modify();  // ❌ Error - can't call non-const on const object
s.read();       // ✅ OK - const function promises not to modify
```

**Explanation:**
The const qualifier on a member function is part of its signature and guarantees the function won't modify the object. Allowing non-const functions on const objects would break this guarantee. This enables the compiler to optimize const objects (e.g., placing them in read-only memory).

**Key takeaway:** const member functions can be called on const objects; non-const functions cannot, enforcing const correctness at compile time.

---

#### Q6: What is the purpose of the `mutable` keyword?
**Difficulty:** #intermediate
**Category:** #syntax #design_pattern
**Concepts:** #mutable #const_correctness #logical_constness #caching

**Answer:**
`mutable` allows specific class members to be modified even in const member functions, enabling logical constness (observable state unchanged) while allowing internal optimizations like caching.

**Code example:**
```cpp
struct Cache {
    mutable int cached_value;
    mutable bool is_valid;

    int compute() const {  // Const function
        if (!is_valid) {
            cached_value = /* expensive */;
            is_valid = true;  // ✅ OK - mutable members
        }
        return cached_value;
    }
};
```

**Explanation:**
The compute() function is logically const (doesn't change the observable value) but physically modifies internal cache members. Without mutable, this wouldn't compile. Common use cases include lazy evaluation, caching, mutex locks in thread-safe classes, and reference counting in smart pointers.

**Key takeaway:** Use mutable for members that don't affect logical state but need modification in const contexts (caching, locking, counters).

---

#### Q7: What happens when you dereference a null pointer?
**Difficulty:** #beginner
**Category:** #undefined_behavior #interview_favorite
**Concepts:** #null_pointer #undefined_behavior #segfault

**Answer:**
Dereferencing a null pointer invokes undefined behavior. It typically causes a segmentation fault (crash) but could behave unpredictably depending on compiler optimizations.

**Code example:**
```cpp
int* p = nullptr;
*p = 5;  // ❌ UB - likely crashes with segfault
```

**Explanation:**
Null pointer dereference is undefined behavior, meaning the C++ standard places no requirements on what happens. Most systems catch this with memory protection (segfault), but some embedded systems without MMU might read/write arbitrary memory, causing silent corruption. The compiler may also optimize based on the assumption that UB never occurs, leading to unexpected behavior.

**Key takeaway:** Always validate pointers before dereferencing; use smart pointers and defensive checks to avoid null pointer UB.

---

#### Q8: Is signed integer overflow defined behavior in C++?
**Difficulty:** #intermediate
**Category:** #undefined_behavior #interview_favorite
**Concepts:** #integer_overflow #undefined_behavior #signed_arithmetic

**Answer:**
No, signed integer overflow is undefined behavior. Unsigned integer overflow is well-defined (wraps around via modulo arithmetic).

**Code example:**
```cpp
int max = INT_MAX;
int overflow = max + 1;  // ❌ UB - signed overflow

unsigned int umax = UINT_MAX;
unsigned int wrap = umax + 1;  // ✅ Defined - wraps to 0
```

**Explanation:**
The C++ standard specifies that signed overflow is UB, allowing compilers to assume it never happens and optimize aggressively. For example, the compiler might assume `x + 1 > x` is always true for signed int x, which isn't true if overflow occurs. Unsigned overflow wraps around (modulo 2^N), making it well-defined and suitable for hash functions or cyclic counters.

**Key takeaway:** Use unsigned types for wrapping arithmetic; detect signed overflow explicitly before it happens, or use compiler flags like `-ftrapv` for debugging.

---

#### Q9: What is the difference between shallow copy and deep copy?
**Difficulty:** #beginner
**Category:** #memory #design_pattern
**Concepts:** #shallow_copy #deep_copy #copy_constructor #memory_management

**Answer:**
Shallow copy copies pointer values (both objects share the same memory), while deep copy allocates new memory and copies the data (independent ownership).

**Code example:**
```cpp
struct Shallow {
    int* p;
    Shallow(int v) : p(new int(v)) {}
    ~Shallow() { delete p; }
    // Default copy = shallow copy -> double delete!
};

struct Deep {
    int* p;
    Deep(int v) : p(new int(v)) {}
    Deep(const Deep& other) : p(new int(*other.p)) {}  // ✅ Deep copy
    ~Deep() { delete p; }
};
```

**Explanation:**
With shallow copy, both objects' p pointers point to the same memory. When one destructs and deletes p, the other's p becomes dangling, leading to double delete or use-after-free. Deep copy gives each object independent memory, avoiding these bugs. Always implement Rule of Three/Five for classes managing resources.

**Key takeaway:** Default copy constructor does shallow copy for pointers; implement deep copy manually or use smart pointers for automatic ownership management.

---

#### Q10: What is the Rule of Three?
**Difficulty:** #intermediate
**Category:** #design_pattern #interview_favorite
**Concepts:** #rule_of_three #copy_constructor #destructor #copy_assignment #resource_management

**Answer:**
If a class needs a custom destructor, copy constructor, or copy assignment operator, it almost certainly needs all three, because it likely manages resources (memory, file handles, etc.).

**Code example:**
```cpp
class MyString {
    char* data;
public:
    MyString(const char* s);
    ~MyString() { delete[] data; }                    // 1. Destructor
    MyString(const MyString& o);                       // 2. Copy constructor
    MyString& operator=(const MyString& o);            // 3. Copy assignment
};
```

**Explanation:**
If you need a custom destructor, you're managing a resource. The default copy operations do shallow copies, causing double delete or resource leaks. You must implement copy constructor and assignment to properly duplicate or transfer ownership. In C++11+, extend this to Rule of Five by adding move constructor and move assignment for efficiency.

**Key takeaway:** When managing resources, implement Rule of Three (or Five); otherwise, use smart pointers to automate resource management.

---

#### Q11: How do smart pointers help avoid shallow copy problems?
**Difficulty:** #intermediate
**Category:** #memory #design_pattern
**Concepts:** #smart_pointers #unique_ptr #shared_ptr #resource_management #raii

**Answer:**
Smart pointers manage ownership automatically. `unique_ptr` is move-only (no copying), and `shared_ptr` uses reference counting for shared ownership, both avoiding manual memory management bugs.

**Code example:**
```cpp
// ❌ Raw pointer - manual management
class Bad {
    int* p;
public:
    Bad(int v) : p(new int(v)) {}
    ~Bad() { delete p; }
    // Need Rule of Three to avoid bugs
};

// ✅ unique_ptr - automatic, move-only
class Good1 {
    std::unique_ptr<int> p;
public:
    Good1(int v) : p(std::make_unique<int>(v)) {}
    // No need for custom destructor/copy - compiler-generated is correct
};

// ✅ shared_ptr - automatic, shared ownership
class Good2 {
    std::shared_ptr<int> p;
public:
    Good2(int v) : p(std::make_shared<int>(v)) {}
    // Copying shares ownership, last owner deletes
};
```

**Explanation:**
`unique_ptr` deletes copy operations by default (move-only), preventing shallow copy bugs. `shared_ptr` allows copying but uses reference counting to track ownership, deleting the resource when the last owner is destroyed. Both follow RAII (Resource Acquisition Is Initialization), ensuring correct cleanup without manual intervention.

**Key takeaway:** Prefer smart pointers over raw pointers for ownership; they automate resource management and prevent common bugs.

---

#### Q12: What problem does virtual inheritance solve?
**Difficulty:** #intermediate
**Category:** #design_pattern #inheritance
**Concepts:** #virtual_inheritance #diamond_problem #multiple_inheritance

**Answer:**
Virtual inheritance solves the diamond problem in multiple inheritance, ensuring only one shared base class subobject exists instead of duplicates.

**Code example:**
```cpp
struct Base { int x; };

// ❌ Without virtual - two Base subobjects
struct A : Base {};
struct B : Base {};
struct C : A, B {};  // C has two Base::x members - ambiguous!

// ✅ With virtual - one shared Base subobject
struct A2 : virtual Base {};
struct B2 : virtual Base {};
struct C2 : A2, B2 {};  // C2 has one Base::x - unambiguous
```

**Explanation:**
Without virtual inheritance, C contains two copies of Base (one through A, one through B), causing ambiguity when accessing Base members. Virtual inheritance ensures all paths to Base share a single Base subobject, eliminating ambiguity. This is implemented using a virtual base pointer in derived classes to locate the shared base.

**Key takeaway:** Use virtual inheritance to solve the diamond problem, ensuring a single shared base class instance in multiple inheritance hierarchies.

---

#### Q13: How does virtual inheritance affect object size?
**Difficulty:** #intermediate
**Category:** #memory #performance
**Concepts:** #virtual_inheritance #memory_layout #vptr #overhead

**Answer:**
Virtual inheritance adds virtual base pointers to derived classes, increasing object size and introducing indirection when accessing virtual base members.

**Code example:**
```cpp
struct Base { int x; };
struct Normal : Base { int y; };
struct Virtual : virtual Base { int y; };

std::cout << sizeof(Normal) << "\n";   // ~8 bytes (x + y)
std::cout << sizeof(Virtual) << "\n";  // ~16 bytes (vptr + y + x)
```

**Explanation:**
With virtual inheritance, the derived class needs a virtual base pointer (vptr) to locate the shared base subobject, which isn't at a fixed offset. This pointer adds 8 bytes on 64-bit systems. Additionally, accessing base members requires following the vptr indirection, slightly reducing performance. The tradeoff is correctness in diamond inheritance scenarios.

**Key takeaway:** Virtual inheritance adds pointer overhead and indirection; use it only when necessary to solve diamond problems.

---

#### Q14: Who constructs the virtual base class in virtual inheritance?
**Difficulty:** #advanced
**Category:** #memory #inheritance
**Concepts:** #virtual_inheritance #constructor_order #initialization

**Answer:**
The most derived class (the final concrete class being instantiated) is responsible for constructing the virtual base class, not the intermediate base classes.

**Code example:**
```cpp
struct VBase {
    VBase(int v) { std::cout << "VBase(" << v << ")\n"; }
};

struct A : virtual VBase {
    A(int v) : VBase(v) {}  // Called when constructing A directly
};

struct B : virtual VBase {
    B(int v) : VBase(v) {}  // Called when constructing B directly
};

struct C : A, B {
    C(int v) : VBase(v), A(v), B(v) {}  // ✅ C constructs VBase
};

C c(42);  // Output: VBase(42) - constructed by C, not A or B
```

**Explanation:**
When constructing C, the compiler ensures VBase is constructed only once by the most derived class (C). Even though A and B's constructors specify how to initialize VBase, those initializers are ignored when A and B are base classes of C. This prevents multiple initialization of the shared base. Construction order: virtual bases, then direct bases in declaration order, then the derived class.

**Key takeaway:** The most derived class constructs virtual base classes to ensure single initialization in diamond inheritance.

---

#### Q15: When are virtual functions resolved during object construction?
**Difficulty:** #advanced
**Category:** #memory #undefined_behavior
**Concepts:** #virtual_functions #constructor #vptr #dynamic_dispatch

**Answer:**
During construction, virtual function calls are resolved to the class currently being constructed, not the most derived class, preventing access to uninitialized derived members.

**Code example:**
```cpp
struct Base {
    Base() { foo(); }  // Calls Base::foo, not Derived::foo
    virtual void foo() { std::cout << "Base::foo\n"; }
};

struct Derived : Base {
    int data = 42;
    void foo() override {
        std::cout << "Derived::foo: " << data << "\n";
    }
};

Derived d;  // Output: "Base::foo" - not "Derived::foo"
```

**Explanation:**
When Base's constructor runs, the Derived portion hasn't been constructed yet, so data is uninitialized. If Base::foo() could call Derived::foo(), it would access uninitialized data (UB). To prevent this, the vptr points to Base's vtable during Base construction, ensuring only Base's virtual functions are called. Similarly, during destruction, the vptr is reset to Base before Derived's destructor runs.

**Key takeaway:** Virtual dispatch is disabled during construction/destruction to prevent accessing uninitialized or destroyed derived class members; avoid calling virtual functions in constructors/destructors.

---

#### Q16: What is the lifetime extension rule for const references?
**Difficulty:** #intermediate
**Category:** #memory #lifetime
**Concepts:** #lifetime_extension #const_reference #temporary #rvalue

**Answer:**
Binding a temporary (rvalue) to a const lvalue reference extends the temporary's lifetime to match the reference's scope. This does not apply to named objects or returned references.

**Code example:**
```cpp
// ✅ Lifetime extended
const std::string& r1 = std::string("temp");  // Temp lives until r1 goes out of scope
std::cout << r1;  // Safe

// ❌ No lifetime extension - named variable
std::string s = "local";
const std::string& r2 = s;  // r2 refers to s, no extension needed
// If s goes out of scope, r2 dangles

// ❌ Returning reference doesn't extend lifetime beyond function
const std::string& bad() {
    return std::string("temp");  // Temp destroyed immediately
}
```

**Explanation:**
Lifetime extension applies only when binding an unnamed temporary to a const lvalue reference in the same scope. The temporary object is destroyed when the reference goes out of scope, not immediately. This doesn't help when returning references from functions, as the temporary is destroyed at the end of the return statement, before the caller can use the reference.

**Key takeaway:** Const reference lifetime extension works for temporaries in the same scope, but doesn't prevent dangling references from returned references.

---

#### Q17: Why is `alignas` useful in multithreading scenarios?
**Difficulty:** #advanced
**Category:** #performance #concurrency
**Concepts:** #alignment #cache_line #false_sharing #multithreading

**Answer:**
`alignas(64)` aligns data to cache line boundaries (typically 64 bytes), preventing false sharing where different threads' data share a cache line, causing performance degradation.

**Code example:**
```cpp
// ❌ False sharing - both counters on same cache line
struct Bad {
    int counter1;  // Thread 1 modifies this
    int counter2;  // Thread 2 modifies this
};  // Both fit in one cache line, causing false sharing

// ✅ Cache line aligned - each counter on separate cache line
struct Good {
    alignas(64) int counter1;  // Thread 1
    alignas(64) int counter2;  // Thread 2
};  // Each counter in its own cache line
```

**Explanation:**
When two threads modify different variables on the same cache line, the cache line bounces between CPU cores, causing cache invalidation and slowdowns (false sharing). Aligning each variable to its own cache line (64 bytes on most systems) eliminates false sharing. This is crucial in high-performance multithreaded code like lock-free data structures or per-thread counters.

**Key takeaway:** Use cache line alignment (`alignas(64)`) for frequently modified variables accessed by different threads to prevent false sharing.

---

#### Q18: What is the difference between bitwise and logical constness?
**Difficulty:** #advanced
**Category:** #design_pattern #const_correctness
**Concepts:** #const_correctness #bitwise_constness #logical_constness #mutable

**Answer:**
Bitwise constness means no bits of the object change. Logical constness means the observable state doesn't change, even if internal members (like caches) are modified. C++ enforces bitwise constness by default; `mutable` enables logical constness.

**Code example:**
```cpp
struct BitwiseConst {
    int value;
    void set() const {
        // value = 5;  // ❌ Error - violates bitwise constness
    }
};

struct LogicalConst {
    int value;
    mutable int cache;
    void get() const {
        if (cache == 0) cache = value * 2;  // ✅ OK - logical constness
        return cache;
    }
};
```

**Explanation:**
Bitwise constness is strict: no member can be modified in a const function. Logical constness is more flexible: the externally visible state is unchanged, but internal optimizations (caching, lazy evaluation) are allowed via `mutable`. This is common in classes that cache expensive computations or need mutex locks in const functions for thread safety.

**Key takeaway:** C++ enforces bitwise constness; use mutable for members that don't affect logical state but need modification in const contexts.

---

#### Q19: Can you modify a const object through a non-const pointer?
**Difficulty:** #advanced
**Category:** #undefined_behavior #const_correctness
**Concepts:** #const_cast #undefined_behavior #const_correctness

**Answer:**
Casting away constness and modifying a truly const object invokes undefined behavior. Modifying an object that was originally non-const is defined.

**Code example:**
```cpp
// ✅ Originally non-const - safe to modify via cast
int x = 10;
const int* cp = &x;
int* p = const_cast<int*>(cp);
*p = 20;  // OK - x was originally non-const

// ❌ Originally const - UB to modify
const int y = 10;
int* p2 = const_cast<int*>(&y);
*p2 = 20;  // ❌ UB - y was declared const
```

**Explanation:**
If an object is declared const, the compiler may place it in read-only memory (.rodata section) or optimize based on the assumption it never changes. Modifying it via const_cast causes UB. However, if an object is originally non-const but accessed via a const pointer/reference, casting away constness and modifying is well-defined. const_cast should be used rarely, typically when interfacing with legacy C APIs.

**Key takeaway:** Never use const_cast to modify a truly const object (declared const) - it's UB; only cast away const when the object was originally non-const.

---

#### Q20: What is the effect of struct padding on cache performance?
**Difficulty:** #advanced
**Category:** #performance #memory
**Concepts:** #padding #cache #memory_optimization #performance

**Answer:**
Padding can waste memory but also improve cache performance by ensuring frequently accessed members align to cache line boundaries. Reordering members trades off size vs. access patterns.

**Code example:**
```cpp
// Small but poor cache utilization
struct Compact {
    char flag;     // 1 byte
    int data[15];  // 60 bytes
};  // 64 bytes total - fits in one cache line

// Larger but better for parallel access
struct Padded {
    alignas(64) char flag;      // 64 bytes (padded)
    alignas(64) int data[15];   // 64 bytes (padded)
};  // 128 bytes - flag and data on separate cache lines
```

**Explanation:**
Compact fits in one cache line (good if accessed together), but if one thread modifies flag while another reads data, false sharing occurs. Padded wastes memory but prevents false sharing by placing flag and data on separate cache lines. The tradeoff depends on access patterns: optimize for size if accessed together, optimize for isolation if accessed by different threads.

**Key takeaway:** Balance struct size and cache performance based on access patterns; use padding and alignment strategically for multithreaded performance.

---
