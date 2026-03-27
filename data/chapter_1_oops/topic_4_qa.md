## TOPIC: Constructor Types - Default, Parameterized, Copy, and Move

### INTERVIEW_QA: Comprehensive Questions and Answers

#### Q1: What is a default constructor?
**Difficulty:** #beginner  
**Category:** #syntax #fundamentals  
**Concepts:** #constructors #default_constructor #initialization

**Answer:**
A default constructor is a constructor that can be called with no arguments, either because it has no parameters or all parameters have default values.

**Code example:**
```cpp
class MyClass {
public:
    MyClass() {}  // No parameters
    MyClass(int x = 0) {}  // All parameters have defaults
};
```

**Explanation:**
The default constructor is special because it's called when objects are created without arguments (e.g., `MyClass obj;`). If no constructors are defined, the compiler generates a default constructor automatically. However, if any constructor is defined, the compiler does not generate a default constructor unless you explicitly request it with `= default`. Default constructors are essential for arrays and containers that need to construct objects without arguments.

**Key takeaway:** Define a default constructor explicitly when you have other constructors, or use `= default` to request compiler generation.

---

#### Q2: When does the compiler generate a default constructor automatically?
**Difficulty:** #intermediate  
**Category:** #syntax #interview_favorite  
**Concepts:** #constructors #default_constructor #compiler_generated

**Answer:**
The compiler generates a default constructor only when no other constructors are declared by the user; declaring any constructor prevents automatic generation.

**Code example:**
```cpp
class A {
    // ✅ Compiler generates: A() {}
};

class B {
    B(int) {}  // ❌ No default constructor generated
};

int main() {
    A a;  // ✅ OK
    // B b;  // ❌ Error: no default constructor
}
```

**Explanation:**
This is a deliberate design choice in C++—if you provide any custom constructor, you're indicating that object construction requires specific logic, so the compiler doesn't presume to know how to construct objects without arguments. This prevents accidentally creating uninitialized or improperly initialized objects. To restore default construction while keeping other constructors, explicitly define a default constructor or use `= default`.

**Key takeaway:** Declaring any constructor suppresses automatic default constructor generation—use `= default` to restore it.

---

#### Q3: What is the difference between a copy constructor and assignment operator?
**Difficulty:** #intermediate  
**Category:** #syntax #interview_favorite  
**Concepts:** #copy_constructor #assignment_operator #initialization

**Answer:**
A copy constructor initializes a new object from an existing object, while the assignment operator assigns to an already-existing object, potentially requiring cleanup of the old value.

**Code example:**
```cpp
MyClass a;
MyClass b = a;  // ✅ Copy constructor (initialization)
MyClass c;
c = a;          // ✅ Assignment operator (assignment)
```

**Explanation:**
The key distinction is whether the target object already exists. Copy constructor is called during initialization (creating a new object), so there's no previous value to clean up. Assignment operator works with an existing object that may hold resources needing cleanup before assigning new values. This is why assignment operators typically follow the pattern: check for self-assignment, clean up old resources, copy new values, return *this. The syntax `=` during declaration is initialization, not assignment.

**Key takeaway:** Copy constructor creates new objects; assignment operator modifies existing objects.

---

#### Q4: What is a move constructor and when is it called?
**Difficulty:** #intermediate  
**Category:** #memory #performance  
**Concepts:** #move_constructor #move_semantics #rvalue_reference #optimization

**Answer:**
A move constructor transfers resources from a temporary or moved-from object to a new object, taking an rvalue reference parameter `T(T&& other)`, called when initializing from temporaries or explicit std::move.

**Code example:**
```cpp
class Buffer {
    char* data;
public:
    Buffer(Buffer&& other) noexcept : data(other.data) {
        other.data = nullptr;  // ✅ Transfer ownership
    }
};

Buffer b1 = createBuffer();  // Move constructor called
```

**Explanation:**
Move constructors enable efficient transfer of resources from temporary objects or objects explicitly marked for moving with std::move. Instead of copying data (expensive), the move constructor "steals" the resources (e.g., pointer to heap memory) and leaves the source in a valid but unspecified state. This is a C++11 feature that dramatically improves performance for classes managing resources like dynamic memory, file handles, or network connections. Mark move constructors `noexcept` for optimal container performance.

**Key takeaway:** Move constructors transfer resources from temporaries, avoiding expensive copies; mark them noexcept.

---

#### Q5: Why should you use member initializer lists instead of assignment in constructor bodies?
**Difficulty:** #intermediate  
**Category:** #performance #interview_favorite  
**Concepts:** #constructors #initialization #initializer_list #efficiency

**Answer:**
Member initializer lists directly construct members with their final values, while constructor body assignment first default-constructs then assigns, wasting performance for non-trivial types.

**Code example:**
```cpp
class Bad {
    std::string name;
public:
    Bad(std::string n) {
        name = n;  // ❌ Default construct + assign
    }
};

class Good {
    std::string name;
public:
    Good(std::string n) : name(n) {}  // ✅ Direct construct
};
```

**Explanation:**
For types like std::string or std::vector, the "Bad" version default-constructs an empty string, then assigns the value, involving allocation, deallocation, and copying. The "Good" version directly constructs the string with the final value in one operation. Additionally, initializer lists are mandatory for const members, reference members, and base classes or members without default constructors. The performance difference is negligible for primitive types but significant for complex objects.

**Key takeaway:** Always prefer member initializer lists for efficiency and correctness; they're mandatory for const/reference members.

---

#### Q6: What happens to data members if not initialized in the constructor?
**Difficulty:** #intermediate  
**Category:** #memory #interview_favorite  
**Concepts:** #initialization #undefined_behavior #default_values

**Answer:**
Built-in types (int, pointers) in non-static objects contain garbage (uninitialized values), causing undefined behavior; class types call their default constructors automatically.

**Code example:**
```cpp
class Dangerous {
    int x;  // ❌ Uninitialized garbage
    std::string s;  // ✅ Default-constructed to ""
public:
    Dangerous() {}  // x has undefined value
};

int main() {
    Dangerous d;
    std::cout << d.x;  // ❌ Undefined behavior
}
```

**Explanation:**
This is a major source of bugs. For primitive types, memory isn't cleared—you get whatever bits were previously there. This can cause crashes, security vulnerabilities, or non-deterministic behavior. Static and global objects are zero-initialized, but local/member objects are not. Always initialize built-in types explicitly using initializer lists or in-class initializers (C++11+). Class-type members are safer because their default constructors run automatically, but relying on this for built-in types is dangerous.

**Key takeaway:** Always explicitly initialize built-in type members to avoid undefined behavior from garbage values.

---

#### Q7: What is the initialization order of class members?
**Difficulty:** #advanced  
**Category:** #memory #interview_favorite  
**Concepts:** #initialization #constructors #initialization_order #undefined_behavior

**Answer:**
Members are initialized in the order they are declared in the class definition, not the order listed in the constructor's initializer list, regardless of how the initializer list is written.

**Code example:**
```cpp
class Wrong {
    int second;
    int first;
public:
    Wrong(int x) : first(x), second(first) {
        // ❌ second initialized before first (declaration order)
        // second gets garbage from uninitialized first
    }
};
```

**Explanation:**
The compiler follows declaration order for member initialization, which ensures consistent layout and behavior. If initializer list order mattered, reordering the list could change object layout. However, this creates a dangerous trap when members depend on each other. In the example, even though the initializer list shows `first(x), second(first)`, the declaration order (`second` before `first`) means `second` is initialized with an uninitialized `first`. Some compilers warn with `-Wreorder`, but it's not guaranteed. Always list initializers in declaration order and avoid inter-member dependencies.

**Key takeaway:** Members initialize in declaration order, not initializer list order—match list to declaration order to avoid bugs.

---

#### Q8: Can constructors be virtual?
**Difficulty:** #beginner  
**Category:** #syntax #fundamentals  
**Concepts:** #constructors #virtual_functions #polymorphism

**Answer:**
No, constructors cannot be virtual because virtual dispatch requires a vptr, which doesn't exist until after the constructor completes.

**Explanation:**
Virtual functions work by looking up the function pointer in the vtable through the vptr stored in each object. However, constructors are responsible for setting up the vptr in the first place. During construction, the vptr progressively points to each class's vtable in the inheritance hierarchy (base first, then derived). Since the vptr isn't set to the final derived class's vtable until after construction completes, virtual dispatch can't work during construction. This is why calling virtual functions from constructors doesn't produce polymorphic behavior—they're resolved to the currently-constructing class's version.

**Key takeaway:** Constructors cannot be virtual because the vptr needed for virtual dispatch isn't ready during construction.

---

#### Q9: What is a delegating constructor?
**Difficulty:** #intermediate  
**Category:** #syntax #design_pattern  
**Concepts:** #constructors #delegating_constructor #code_reuse

**Answer:**
A delegating constructor (C++11+) calls another constructor of the same class in its initializer list, reducing code duplication by centralizing initialization logic.

**Code example:**
```cpp
class Point {
    int x, y;
public:
    Point(int a, int b) : x(a), y(b) {}
    Point() : Point(0, 0) {}  // ✅ Delegates to main constructor
    Point(int val) : Point(val, val) {}  // ✅ Square point
};
```

**Explanation:**
Before C++11, common initialization code was typically extracted to a private init() function. Delegating constructors provide a cleaner solution by having one constructor call another directly. The target constructor executes completely (including its body) before the delegating constructor's body runs. You cannot use delegating and member initialization together—either delegate OR initialize members, not both. Use delegation to avoid repeating validation, resource acquisition, or initialization logic across multiple constructors.

**Key takeaway:** Use delegating constructors to centralize initialization logic and reduce code duplication.

---

#### Q10: What is the explicit keyword and why is it important?
**Difficulty:** #intermediate  
**Category:** #syntax #interview_favorite  
**Concepts:** #explicit #constructors #implicit_conversion

**Answer:**
The explicit keyword prevents implicit conversions from constructor parameter types to the class type, requiring explicit construction and preventing surprising implicit conversions.

**Code example:**
```cpp
class Array {
public:
    explicit Array(int size);
};

void process(Array arr);

// Array a = 10;  // ❌ Error: implicit conversion prevented
Array a(10);      // ✅ OK: explicit construction
// process(20);   // ❌ Error: no implicit conversion
process(Array(20));  // ✅ OK
```

**Explanation:**
Without explicit, single-parameter constructors act as implicit conversion functions. For example, `Array a = 10;` would implicitly call `Array(10)`, which might be unexpected and lead to bugs or performance issues. The explicit keyword forces users to clearly indicate construction intent. Use explicit for single-parameter constructors unless implicit conversion is genuinely desired and makes sense semantically (like std::string from const char*). Modern C++ guidelines recommend explicit by default for constructors.

**Key takeaway:** Use explicit for single-parameter constructors to prevent surprising implicit conversions.

---

#### Q11: How do const and reference members affect constructor requirements?
**Difficulty:** #intermediate  
**Category:** #syntax #memory  
**Concepts:** #constructors #const #references #initializer_list

**Answer:**
Const and reference members must be initialized in the constructor's member initializer list because they cannot be assigned after construction—they must be bound/set at initialization time.

**Code example:**
```cpp
class Container {
    const int maxSize;
    int& externalCounter;
public:
    Container(int max, int& counter)
        : maxSize(max), externalCounter(counter) {  // ✅ Must use list
        // maxSize = max;  // ❌ Error: cannot assign to const
    }
};
```

**Explanation:**
This reflects fundamental C++ semantics: references are aliases that must be bound to an object at creation and cannot be rebound, while const objects cannot be modified after initialization. Attempting to assign to these members in the constructor body fails because they must be initialized before the body executes. The initializer list provides the mechanism for this initial binding. This same requirement applies to members of types without default constructors—they must be explicitly initialized in the initializer list.

**Key takeaway:** Const and reference members require initializer list initialization; assignment in constructor body is illegal.

---

#### Q12: What is the Rule of Five?
**Difficulty:** #advanced  
**Category:** #design_pattern #interview_favorite  
**Concepts:** #rule_of_five #constructors #destructors #copy_constructor #move_semantics

**Answer:**
The Rule of Five states that if you define any of destructor, copy constructor, copy assignment, move constructor, or move assignment, you should define or delete all five to ensure correct resource management.

**Code example:**
```cpp
class Resource {
    int* data;
public:
    ~Resource() { delete[] data; }
    Resource(const Resource& other);
    Resource& operator=(const Resource& other);
    Resource(Resource&& other) noexcept;
    Resource& operator=(Resource&& other) noexcept;
};
```

**Explanation:**
This rule exists because defining one of these functions indicates the class manages resources (memory, file handles, etc.) requiring custom handling. If you define a destructor to release resources, you likely need a copy constructor to properly duplicate those resources and move constructor to transfer them efficiently. Failing to define all five can lead to double-deletes, resource leaks, or inefficient copying when moves were expected. The Rule of Zero suggests avoiding this entirely by using RAII wrappers like std::unique_ptr instead of raw resources.

**Key takeaway:** Define or delete all five special member functions when managing resources; prefer Rule of Zero with RAII wrappers.

---

#### Q13: When does the compiler generate a move constructor?
**Difficulty:** #advanced  
**Category:** #memory #performance  
**Concepts:** #move_constructor #compiler_generated #rule_of_five

**Answer:**
The compiler generates a move constructor only when no user-declared copy constructor, copy assignment, move assignment, or destructor exists; declaring any of these suppresses move generation.

**Code example:**
```cpp
class A {
    // ✅ Compiler generates move constructor
};

class B {
    ~B() {}  // ❌ User-declared destructor
    // Move constructor NOT generated
};

class C {
    C(const C&) {}  // ❌ User-declared copy constructor
    // Move constructor NOT generated
};
```

**Explanation:**
This restrictive policy encourages following the Rule of Five. If you've defined a destructor, copy constructor, or assignment operators, you're managing resources and should consciously decide how moves work. The compiler won't guess. This prevents subtle bugs where the default move (memberwise move) would be incorrect for resource-managing classes. If you want compiler-generated moves while having a custom destructor, explicitly default them: `T(T&&) = default;`. Modern practice recommends defining all five or using `= default/delete` to be explicit.

**Key takeaway:** Move constructors are only auto-generated when no other special member functions are user-declared.

---

#### Q14: What is copy elision and how does it affect constructors?
**Difficulty:** #advanced  
**Category:** #performance #optimization  
**Concepts:** #copy_elision #rvo #optimization #move_semantics

**Answer:**
Copy elision is a compiler optimization that eliminates copy/move constructors when creating objects, especially with return values; in C++17, it's mandatory for returning temporaries (guaranteed RVO).

**Code example:**
```cpp
class Logger {
public:
    Logger() { std::cout << "Construct\n"; }
    Logger(const Logger&) { std::cout << "Copy\n"; }
    Logger(Logger&&) { std::cout << "Move\n"; }
};

Logger create() {
    return Logger();  // C++17: just "Construct", no move/copy
}
```

**Explanation:**
Before C++17, compilers could optionally eliminate copies through Return Value Optimization (RVO) and Named RVO (NRVO), but the copy/move constructor still needed to be accessible. C++17 made elision mandatory when returning temporaries, changing observable behavior—copy/move constructors aren't called at all. This improves performance dramatically but means you can't rely on side effects in copy/move constructors for counting object creations. Named return values may still be copied/moved depending on compiler optimization.

**Key takeaway:** C++17 guarantees copy elision for temporaries, eliminating copy/move constructors; don't rely on their side effects.

---

#### Q15: What are in-class member initializers?
**Difficulty:** #intermediate  
**Category:** #syntax  
**Concepts:** #initialization #constructors #in_class_initializer #default_values

**Answer:**
In-class member initializers (C++11+) provide default values for data members directly in the class definition, used when not overridden by constructor initializer lists.

**Code example:**
```cpp
class Config {
    int timeout = 30;  // ✅ Default value
    bool enabled = true;
public:
    Config() {}  // Uses defaults
    Config(int t) : timeout(t) {}  // Overrides timeout only
};
```

**Explanation:**
This feature reduces code duplication when multiple constructors share common default values. In-class initializers are applied before the constructor runs, and constructor initializer lists override them. They're particularly useful for classes with many data members where most have sensible defaults but some constructors need to override specific ones. Non-static members can use `=` or brace initialization `{}`. Static const integral members can be initialized in-class in older C++ versions, but C++11 extends this to all non-static members.

**Key takeaway:** Use in-class initializers for default member values; constructor initializer lists override them when needed.

---

#### Q16: What happens when you return a local object by value?
**Difficulty:** #intermediate  
**Category:** #memory #performance  
**Concepts:** #rvo #copy_elision #move_semantics #return_value

**Answer:**
Modern compilers perform copy elision (mandatory in C++17 for temporaries), constructing the return value directly in the caller's memory; otherwise, the move constructor is used if available, falling back to copy.

**Code example:**
```cpp
Object create() {
    Object local;
    return local;  // C++17+: likely elided or moved, not copied
}

Object obj = create();  // Direct construction or move
```

**Explanation:**
Return value optimization (RVO) eliminates the copy/move entirely by constructing the object directly in the caller's destination memory. For unnamed temporaries, C++17 guarantees this. For named variables (NRVO), it's optional but common. If elision doesn't occur, the compiler prefers move over copy, binding the return value to rvalue references. Only if no move constructor exists does copy happen. This is why providing move constructors for resource-heavy classes improves performance even though RVO often eliminates it.

**Key takeaway:** Return by value is efficient thanks to RVO and move semantics; provide move constructors for resource-heavy classes.

---

#### Q17: Can you have multiple constructors with the same number of parameters?
**Difficulty:** #beginner  
**Category:** #syntax  
**Concepts:** #constructors #overloading #function_signature

**Answer:**
Yes, constructors can be overloaded based on parameter types (not count), just like regular functions, as long as the signatures are distinguishable.

**Code example:**
```cpp
class Value {
public:
    Value(int x) { std::cout << "int: " << x << "\n"; }
    Value(double x) { std::cout << "double: " << x << "\n"; }
    Value(const char* s) { std::cout << "string: " << s << "\n"; }
};

Value v1(10);      // Calls int version
Value v2(3.14);    // Calls double version
Value v3("hello"); // Calls const char* version
```

**Explanation:**
Constructor overloading follows normal function overloading rules—signatures must be distinguishable by parameter types. The compiler selects the best match based on argument types. Be careful with ambiguous cases like `Value(0)` if you have both `int` and `char*` constructors (0 is a valid null pointer constant). Use explicit when appropriate, and consider whether you truly need multiple overloads or if a single constructor with default parameters would suffice.

**Key takeaway:** Constructors overload by parameter type, enabling different construction strategies for different argument types.

---

#### Q18: What is aggregate initialization?
**Difficulty:** #intermediate  
**Category:** #syntax  
**Concepts:** #initialization #aggregate #pod #brace_initialization

**Answer:**
Aggregate initialization allows initializing aggregate types (classes/structs with no user-defined constructors, no private/protected members, no base classes, no virtual functions) using brace syntax with member values in declaration order.

**Code example:**
```cpp
struct Point {
    int x;
    int y;
    int z;
};

Point p1 = {1, 2, 3};     // ✅ Aggregate initialization
Point p2{4, 5, 6};        // ✅ Also valid
Point p3 = {.x=1, .z=3};  // ✅ C++20: designated initializers
```

**Explanation:**
Aggregate initialization provides simple syntax for initializing simple structures without needing constructors. The values correspond to members in declaration order. Omitted trailing members are value-initialized (zero for primitives). C++20 adds designated initializers allowing explicit member names for clarity. Adding any constructor removes aggregate status, requiring explicit construction. This feature is useful for POD types, configuration structs, and interfacing with C code. Use aggregate initialization for simple data structures; add constructors for validation or invariants.

**Key takeaway:** Use aggregate initialization for simple structs without constructors; it provides concise syntax for value lists.

---

#### Q19: What is the difference between direct initialization and copy initialization?
**Difficulty:** #intermediate  
**Category:** #syntax  
**Concepts:** #initialization #direct_initialization #copy_initialization #explicit

**Answer:**
Direct initialization uses parentheses or braces and can call explicit constructors; copy initialization uses `=` and cannot call explicit constructors, potentially performing implicit conversions.

**Code example:**
```cpp
class Array {
public:
    explicit Array(int size);
};

Array a1(10);    // ✅ Direct initialization - OK
Array a2{10};    // ✅ Direct initialization - OK
// Array a3 = 10;  // ❌ Copy initialization - error with explicit
```

**Explanation:**
The distinction matters for explicit constructors and performance. Direct initialization directly calls the constructor with the arguments. Copy initialization creates a temporary from the right-hand side and copies/moves it to the destination (though copy elision usually eliminates the copy). Since C++17, copy elision is mandatory for temporaries, but explicit still prevents copy initialization syntax. Use direct initialization (parentheses or braces) for explicit constructors and when you want to avoid implicit conversions. The `=` syntax is more readable for simple cases but has limitations.

**Key takeaway:** Direct initialization (parentheses/braces) works with explicit constructors; copy initialization (`=`) does not.

---

#### Q20: How do constructors work with inheritance?
**Difficulty:** #intermediate  
**Category:** #inheritance #memory  
**Concepts:** #constructors #inheritance #base_class #initialization_order

**Answer:**
Base class constructors are called before derived class constructors; derived constructors must explicitly initialize base classes in their initializer list, or the base default constructor is called automatically.

**Code example:**
```cpp
class Base {
public:
    Base(int x) { std::cout << "Base(" << x << ")\n"; }
};

class Derived : public Base {
public:
    Derived(int x, int y) : Base(x) {  // ✅ Must initialize base
        std::cout << "Derived(" << y << ")\n";
    }
};

Derived d(10, 20);  // Output: Base(10), Derived(20)
```

**Explanation:**
Construction proceeds from base to derived to ensure the base class portion is fully initialized before derived class initialization begins. If the base class lacks a default constructor, derived constructors must explicitly call a base constructor using initializer list syntax. Multiple inheritance constructs bases in declaration order. This construction order ensures that derived class constructors can safely use base class members. Destruction happens in reverse order (derived to base) to maintain invariants.

**Key takeaway:** Base constructors execute first; derived constructors must explicitly initialize bases without default constructors.

---
