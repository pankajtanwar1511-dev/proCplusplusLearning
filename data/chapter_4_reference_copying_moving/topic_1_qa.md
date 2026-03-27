## TOPIC: Lvalue and Rvalue References

### INTERVIEW_QA: Core Concepts and Common Pitfalls

#### Q1: What is the fundamental difference between an lvalue and an rvalue?
**Difficulty:** #beginner
**Category:** #fundamentals #value_category
**Concepts:** #lvalue #rvalue #memory_location

**Answer:**
An lvalue has an identifiable memory location and persists beyond a single expression, while an rvalue is a temporary value without a persistent address.

**Code example:**
```cpp
int x = 10;        // x is an lvalue (has address)
int* p = &x;       // ✅ OK: can take address of lvalue
int* q = &(x + 5); // ❌ Error: cannot take address of rvalue
```

**Explanation:**
Lvalues (locator values) occupy storage that we can reference directly, allowing operations like taking addresses. Rvalues (read values) are temporary results of expressions that don't have stable storage. The distinction determines what operations are legal and affects overload resolution and optimization opportunities.

**Key takeaway:** Lvalues persist and have addresses; rvalues are temporaries without addressable storage.

---

#### Q2: What is an lvalue reference and how is it declared?
**Difficulty:** #beginner
**Category:** #syntax #references
**Concepts:** #lvalue_reference #reference_binding

**Answer:**
An lvalue reference is an alias to an existing object declared using `T&` syntax, and it must be initialized to bind to an lvalue.

**Code example:**
```cpp
int x = 10;
int& ref = x;     // ✅ Lvalue reference to x
ref = 20;         // Modifies x through reference
```

**Explanation:**
Lvalue references create an alternative name for an existing object. They must be initialized when declared and cannot be rebound to different objects. They've been part of C++ since the beginning and are primarily used for avoiding copies and allowing functions to modify caller's variables.

**Key takeaway:** Use `T&` to create an alias to an existing lvalue; the reference and the original object are the same.

---

#### Q3: What is an rvalue reference and why was it introduced in C++11?
**Difficulty:** #beginner
**Category:** #fundamentals #modern_cpp
**Concepts:** #rvalue_reference #move_semantics

**Answer:**
An rvalue reference, declared as `T&&`, binds to temporaries and enables move semantics by allowing functions to detect and optimize handling of temporary objects.

**Code example:**
```cpp
int&& rref = 42;           // ✅ Binds to temporary
std::string&& s = std::string("temp");  // ✅ Can steal resources
```

**Explanation:**
Before C++11, there was no way to distinguish temporary objects from persistent ones, forcing expensive copies even when moving resources would suffice. Rvalue references allow functions to have separate overloads for temporaries, enabling efficient resource transfer through move constructors and move assignment operators.

**Key takeaway:** Rvalue references (`T&&`) bind to temporaries and enable efficient resource transfer through move semantics.

---

#### Q4: Can you bind a non-const lvalue reference to a temporary? Why or why not?
**Difficulty:** #intermediate
**Category:** #reference_binding #const_correctness
**Concepts:** #lvalue_reference #rvalue #const

**Answer:**
No, you cannot bind a non-const lvalue reference (`T&`) to a temporary because it would allow modifying an object that's about to be destroyed, which is unsafe.

**Code example:**
```cpp
void modify(int& x) { x = 100; }

int main() {
    modify(5);  // ❌ Error: cannot bind lvalue ref to rvalue
    
    int a = 5;
    modify(a);  // ✅ OK: a is an lvalue
}
```

**Explanation:**
Allowing modification of temporaries through non-const lvalue references would be dangerous because the temporary is destroyed at the end of the expression. C++ prevents this by disallowing binding non-const lvalue references to rvalues. However, const lvalue references (`const T&`) can bind to rvalues since they promise not to modify the temporary.

**Key takeaway:** Non-const lvalue references cannot bind to temporaries to prevent modifying soon-to-be-destroyed objects.

---

#### Q5: What happens when you declare a variable with rvalue reference type like `int&& x = 42;`? Is x an lvalue or rvalue?
**Difficulty:** #intermediate
**Category:** #value_category #common_pitfall
**Concepts:** #rvalue_reference #lvalue #named_rvalue

**Answer:**
The variable `x` has type `int&&` (rvalue reference), but the expression `x` itself is an lvalue because it has a name and persistent storage.

**Code example:**
```cpp
int&& x = 42;
// x has TYPE int&&, but EXPRESSION x is lvalue
int& lref = x;          // ✅ OK: x is an lvalue
int&& rref = x;         // ❌ Error: cannot bind rvalue ref to lvalue
int&& rref = std::move(x);  // ✅ OK: std::move casts to rvalue
```

**Explanation:**
This is one of the most confusing aspects of C++. Type and value category are independent. A named entity is always an lvalue regardless of its type. When you name an rvalue reference, it becomes an lvalue that can be used multiple times. To use it as an rvalue again, you must explicitly cast it with `std::move`.

**Key takeaway:** Type tells you what something is; value category tells you how you can use it—named rvalue references are lvalues.

---

#### Q6: Why can `const int&` bind to both lvalues and rvalues?
**Difficulty:** #intermediate
**Category:** #reference_binding #const_correctness
**Concepts:** #const_reference #lvalue #rvalue #lifetime_extension

**Answer:**
`const T&` is special because it promises not to modify the bound object, making it safe to bind to temporaries, and C++ extends the temporary's lifetime to match the reference.

**Code example:**
```cpp
void accept(const int& x) {
    std::cout << x << "\n";
    // x = 100;  // ❌ Cannot modify const reference
}

int main() {
    int a = 10;
    accept(a);    // ✅ Binds to lvalue
    accept(20);   // ✅ Binds to rvalue (lifetime extended)
}
```

**Explanation:**
Before C++11, `const T&` was the primary way to avoid copying while accepting both lvalues and rvalues. Since const references can't modify their referent, it's safe to bind them to temporaries. The language automatically extends the lifetime of the temporary to match the const reference, preventing dangling references.

**Key takeaway:** `const T&` is the universal reference type that safely accepts any value category due to const-correctness guarantees.

---

#### Q7: What is the difference between `decltype(x)` and the value category of the expression `x`?
**Difficulty:** #advanced
**Category:** #type_system #value_category
**Concepts:** #decltype #type_deduction #value_category

**Answer:**
`decltype(x)` gives you the declared type of `x`, while the value category of expression `x` tells you whether it's an lvalue or rvalue at the point of use.

**Code example:**
```cpp
int&& rref = 42;
// decltype(rref) is int&&
// But expression rref is an lvalue

using Type = decltype(rref);  // Type is int&&
Type y = rref;  // ❌ Error: trying int&& = lvalue
```

**Explanation:**
Type and value category are separate concepts. `decltype` gives compile-time type information, while value category is determined by how the expression is formed. A variable declared as `T&&` always has that type, but using that variable in an expression makes it an lvalue because it has a name.

**Key takeaway:** `decltype` reveals type; value category depends on how the expression is written—they're independent properties.

---

#### Q8: Can you return an rvalue reference to a local variable? What happens?
**Difficulty:** #intermediate
**Category:** #lifetime #undefined_behavior
**Concepts:** #rvalue_reference #dangling_reference #local_variable #return_value

**Answer:**
No, returning an rvalue reference to a local variable causes undefined behavior because the local is destroyed when the function returns, creating a dangling reference.

**Code example:**
```cpp
int&& dangerous() {
    int x = 42;
    return std::move(x);  // ❌ UB: x is destroyed, reference dangles
}

int safe() {
    int x = 42;
    return x;  // ✅ OK: return by value (copy/move/RVO)
}
```

**Explanation:**
`std::move` only casts to rvalue; it doesn't prevent destruction of the local variable. When the function returns, `x` is destroyed and stack memory is reclaimed. The returned reference points to destroyed memory. Functions should almost never return `T&&`—return by value instead and let the compiler optimize.

**Key takeaway:** Never return references (lvalue or rvalue) to local variables; they're destroyed when the function exits.

---

#### Q9: What does `std::move` actually do to an object?
**Difficulty:** #intermediate
**Category:** #common_pitfall #move_semantics
**Concepts:** #std_move #rvalue_cast #move_semantics

**Answer:**
`std::move` does nothing to the object itself—it only casts an lvalue to an rvalue reference, enabling move operations if they exist.

**Code example:**
```cpp
std::string s1 = "hello";
std::string s2 = std::move(s1);  // Move constructor is called
// s1 is still valid but in unspecified state
std::cout << s1.size() << "\n";  // ✅ Legal: likely 0, but not guaranteed
```

**Explanation:**
`std::move` is just a cast—specifically `static_cast<T&&>`. It doesn't move anything, delete anything, or modify the object. What actually moves resources is the move constructor or move assignment operator of the type. After moving, the source object remains valid but in an unspecified state, meaning you can still use it but shouldn't rely on its contents.

**Key takeaway:** `std::move` is a permission slip, not an action—it casts to rvalue, allowing move operations to occur.

---

#### Q10: Is it safe to use an object after `std::move` has been called on it?
**Difficulty:** #intermediate
**Category:** #move_semantics #undefined_behavior
**Concepts:** #std_move #moved_from_state #valid_but_unspecified

**Answer:**
Yes, it's safe to use the object, but it's in a valid but unspecified state—you can assign to it or destroy it, but you shouldn't rely on its contents.

**Code example:**
```cpp
std::vector<int> v1 = {1, 2, 3};
std::vector<int> v2 = std::move(v1);

// Safe operations on v1:
v1 = {4, 5, 6};        // ✅ Assignment is fine
v1.push_back(7);       // ✅ After assignment, fully usable
std::cout << v1.size(); // ✅ Legal, but don't assume value before assignment
```

**Explanation:**
The C++ standard requires moved-from objects to be in a "valid but unspecified" state, meaning all operations must be safe, but the object's value is undefined. For standard library types, this typically means the object is empty or in a default state. You can safely assign new values, destroy the object, or check its state, but you shouldn't read its data expecting specific contents.

**Key takeaway:** Moved-from objects are valid for assignment and destruction but not for reading their supposedly-moved contents.

---

#### Q11: Why would you use an rvalue reference parameter in a function?
**Difficulty:** #beginner
**Category:** #design_pattern #move_semantics
**Concepts:** #rvalue_reference #function_overload #performance

**Answer:**
To provide an optimized overload that can steal resources from temporary objects, avoiding expensive copies while preserving correct behavior for persistent objects.

**Code example:**
```cpp
class Buffer {
public:
    Buffer(const std::vector<int>& data) : data_(data) {
        std::cout << "Copy constructor\n";
    }
    
    Buffer(std::vector<int>&& data) : data_(std::move(data)) {
        std::cout << "Move constructor\n";
    }
private:
    std::vector<int> data_;
};
```

**Explanation:**
By providing both lvalue and rvalue reference overloads, you can implement different strategies: copy when the caller needs to keep the object, and move when the object is temporary. This is the foundation of move semantics and leads to significant performance improvements for resource-owning types.

**Key takeaway:** Rvalue reference parameters enable efficient resource transfer from temporaries through overload resolution.

---

#### Q12: What is reference collapsing and when does it occur?
**Difficulty:** #advanced
**Category:** #template_metaprogramming #type_deduction
**Concepts:** #reference_collapsing #template #perfect_forwarding

**Answer:**
Reference collapsing is the rule that determines the resulting type when references to references appear in template type deduction—multiple references collapse to a single reference following specific rules.

**Code example:**
```cpp
template<typename T>
void foo(T&& param) {
    // If int x passed: T = int&, T&& = int& && → int&
    // If int(42) passed: T = int, T&& = int&&
}

// Collapsing rules:
// T& & → T&
// T& && → T&
// T&& & → T&
// T&& && → T&&
```

**Explanation:**
References to references don't exist in regular C++ code, but they can appear during template instantiation. When they do, C++ applies collapsing rules: an lvalue reference anywhere in the chain produces an lvalue reference, otherwise you get an rvalue reference. This is crucial for perfect forwarding.

**Key takeaway:** Reference collapsing allows `T&&` in templates to preserve lvalue-ness, enabling perfect forwarding.

---

#### Q13: Can you modify an object through an rvalue reference?
**Difficulty:** #beginner
**Category:** #rvalue_reference #const_correctness
**Concepts:** #rvalue_reference #modifiable #move_semantics

**Answer:**
Yes, rvalue references are fully modifiable unless declared const—this is essential for move operations that need to modify the source object.

**Code example:**
```cpp
void process(std::string&& s) {
    s += " modified";  // ✅ OK: rvalue refs are modifiable
    std::cout << s << "\n";
}

int main() {
    process("hello");  // Temporary string can be modified
}
```

**Explanation:**
Unlike const lvalue references, rvalue references are modifiable by default. This is necessary for move semantics because move constructors typically need to modify the source (e.g., setting pointers to nullptr). The ability to modify temporaries is safe because the object is about to be destroyed anyway.

**Key takeaway:** Rvalue references allow modification of temporaries, which is essential for implementing move operations.

---

#### Q14: What happens if you std::move a const object?
**Difficulty:** #intermediate
**Category:** #const_correctness #move_semantics
**Concepts:** #std_move #const #type_mismatch

**Answer:**
`std::move` on a const object produces `const T&&`, which typically cannot bind to move constructors that expect non-const `T&&`, resulting in copies instead of moves.

**Code example:**
```cpp
void take(std::string&& s) { }  // Expects non-const rvalue ref

const std::string cs = "hello";
// std::move(cs) produces const std::string&&
// take(std::move(cs));  // ❌ Error: cannot convert const T&& to T&&

// Move constructor also can't be called:
const std::vector<int> cv = {1, 2, 3};
std::vector<int> v = std::move(cv);  // Calls copy constructor, not move
```

**Explanation:**
Moving requires modifying the source object (like setting pointers to null), which is impossible with const. When you `std::move` a const object, you get a `const T&&`, which cannot bind to most move constructors that expect `T&&`. The compiler falls back to the copy constructor, defeating the purpose of the move.

**Key takeaway:** Moving from const objects is usually pointless—move operations need to modify the source.

---

#### Q15: Why does this compile: `int& ref = (x = 10);`?
**Difficulty:** #intermediate
**Category:** #value_category #expression_properties
**Concepts:** #lvalue #assignment_operator #value_category

**Answer:**
The assignment operator returns an lvalue reference to the left operand, so the entire expression `(x = 10)` is an lvalue that can bind to an lvalue reference.

**Code example:**
```cpp
int x = 5;
int& ref = (x = 10);  // ✅ OK: assignment returns lvalue
ref = 20;  // Modifies x
std::cout << x;  // Prints 20

// This is why chained assignment works:
int a, b, c;
a = b = c = 0;  // Right-to-left: c=0 returns c, b=c returns b, etc.
```

**Explanation:**
Built-in assignment operators return an lvalue reference to the assigned-to object, enabling chaining. This makes `(x = value)` an lvalue expression. This is different from many other operators like arithmetic, which return rvalues. Understanding which expressions are lvalues vs rvalues is essential for predicting reference binding behavior.

**Key takeaway:** Assignment expressions are lvalues because assignment returns a reference to the left operand.

---

#### Q16: What is the value category of a function call expression?
**Difficulty:** #intermediate
**Category:** #value_category #return_types
**Concepts:** #function_call #value_category #return_type

**Answer:**
The value category depends on the return type: functions returning lvalue references yield lvalues, functions returning rvalue references yield xvalues, and functions returning by value yield prvalues.

**Code example:**
```cpp
int& get_lvalue() { static int x; return x; }
int&& get_rvalue() { static int x; return std::move(x); }
int get_prvalue() { return 42; }

int& r1 = get_lvalue();   // ✅ OK: function call is lvalue
// int& r2 = get_rvalue(); // ❌ Error: function call is xvalue
int&& r3 = get_rvalue();  // ✅ OK: xvalue binds to rvalue ref
// int& r4 = get_prvalue(); // ❌ Error: prvalue cannot bind to lvalue ref
```

**Explanation:**
C++11 introduced xvalues (expiring values) as a third value category. Function calls returning `T&` are lvalues, calls returning `T&&` are xvalues, and calls returning `T` are prvalues (pure rvalues). Together, xvalues and prvalues form the rvalue category, which can bind to rvalue references.

**Key takeaway:** Function return type determines value category—`T&` gives lvalue, `T&&` gives xvalue, `T` gives prvalue.

---

#### Q17: Can an rvalue reference extend the lifetime of a temporary?
**Difficulty:** #advanced
**Category:** #lifetime #rvalue_reference
**Concepts:** #lifetime_extension #temporary #rvalue_reference #dangling_reference

**Answer:**
Yes, binding a temporary directly to an rvalue reference extends its lifetime to the scope of the reference, similar to const lvalue references.

**Code example:**
```cpp
std::string&& rref = std::string("hello");
// Temporary string's lifetime extended to rref's scope
std::cout << rref << "\n";  // ✅ Safe: temporary still alive

// Also works with function returns:
std::string&& rref2 = getStringValue();  // ✅ Lifetime extended
```

**Explanation:**
When a temporary is bound directly to an rvalue reference (or const lvalue reference), C++ extends the temporary's lifetime to match the reference's scope. This prevents dangling references in common cases. However, this only works for direct binding—if a reference to a temporary is returned from a function, the temporary is destroyed in that function.

**Key takeaway:** Direct binding of temporaries to rvalue references extends lifetime, but returned references to temporaries still dangle.

---

#### Q18: What is a universal reference (forwarding reference)?
**Difficulty:** #advanced
**Category:** #template #perfect_forwarding
**Concepts:** #universal_reference #forwarding_reference #template #type_deduction

**Answer:**
A universal (forwarding) reference is `T&&` in a template context where `T` is deduced, and it can bind to both lvalues and rvalues through reference collapsing.

**Code example:**
```cpp
template<typename T>
void foo(T&& param) {  // Universal reference: T is deduced
    // Binds to lvalues: T = U&, T&& collapses to U&
    // Binds to rvalues: T = U, T&& stays as U&&
}

int x = 10;
foo(x);    // T = int&, param is int&
foo(20);   // T = int, param is int&&
```

**Explanation:**
Not all `T&&` are rvalue references. In template contexts where `T` is deduced, `T&&` is a universal reference that can bind to any value category through reference collapsing. This is distinct from concrete rvalue references like `std::string&&`. Universal references are the foundation of perfect forwarding.

**Key takeaway:** `T&&` in templates with type deduction is a universal reference that binds to both lvalues and rvalues.

---

#### Q19: Why can't you take the address of an rvalue?
**Difficulty:** #beginner
**Category:** #fundamentals #memory
**Concepts:** #rvalue #address_of #temporary #memory_location

**Answer:**
Rvalues don't have stable storage locations that can be addressed—they're temporary values that exist only within an expression.

**Code example:**
```cpp
int x = 10;
int* p1 = &x;        // ✅ OK: x has an address
// int* p2 = &42;    // ❌ Error: cannot take address of rvalue
// int* p3 = &(x+5); // ❌ Error: expression result is rvalue

int&& rref = 42;     // ✅ But this is OK
int* p4 = &rref;     // ✅ Because rref (the variable) is an lvalue
```

**Explanation:**
Rvalues represent temporary computation results or literals that don't occupy addressable memory locations. The inability to take their address prevents creating pointers to soon-to-be-destroyed objects. Once bound to a reference (even rvalue reference), the object becomes accessible through a named variable, which is an lvalue.

**Key takeaway:** Rvalues lack addressable storage, but binding them to references creates addressable lvalue variables.

---

#### Q20: What is the difference between `T&&` in a template and `std::string&&` in a regular function?
**Difficulty:** #advanced
**Category:** #template #type_system
**Concepts:** #universal_reference #rvalue_reference #type_deduction #forwarding_reference

**Answer:**
`T&&` with type deduction is a universal/forwarding reference that can bind to both lvalues and rvalues, while `std::string&&` is specifically an rvalue reference that only binds to rvalues.

**Code example:**
```cpp
template<typename T>
void universal(T&& param) {  // Universal reference
    // Can receive lvalues and rvalues
}

void specific(std::string&& param) {  // Rvalue reference only
    // Only accepts rvalues
}

std::string s = "hello";
universal(s);        // ✅ OK: T = std::string&
specific(s);         // ❌ Error: cannot bind lvalue to rvalue ref
specific(std::move(s));  // ✅ OK: std::move creates rvalue
```

**Explanation:**
The key difference is type deduction. When `T` is deduced, `T&&` uses special rules (reference collapsing) to bind to any value category. Without deduction, `T&&` is a regular rvalue reference. This distinction is crucial for writing generic forwarding code.

**Key takeaway:** `T&&` with deduction is universal; concrete `Type&&` is rvalue-only—deduction context determines semantics.

---

#### Q21: How does reference binding differ for const vs non-const objects?
**Difficulty:** #intermediate
**Category:** #const_correctness #reference_binding
**Concepts:** #const #reference_binding #lvalue_reference #const_reference

**Answer:**
Non-const objects can bind to both const and non-const references, while const objects can only bind to const references—constness cannot be cast away through references.

**Code example:**
```cpp
void modify(int& x) { x = 100; }
void read(const int& x) { std::cout << x; }

int a = 10;
const int ca = 20;

modify(a);   // ✅ OK
read(a);     // ✅ OK: non-const can bind to const ref
// modify(ca);  // ❌ Error: cannot bind const to non-const ref
read(ca);    // ✅ OK
```

**Explanation:**
C++ enforces const-correctness through references. A non-const reference promises it might modify the object, so it cannot bind to const objects. However, const references promise not to modify, so they can bind to both const and non-const objects. This ensures that const objects cannot be accidentally modified.

**Key takeaway:** Const references accept anything; non-const references only accept non-const objects—maintains const-correctness.

---

#### Q22: What happens when you pass a temporary to a function taking `T&` vs `const T&` vs `T&&`?
**Difficulty:** #intermediate
**Category:** #reference_binding #overload_resolution
**Concepts:** #temporary #reference_binding #lvalue_reference #const_reference #rvalue_reference

**Answer:**
Temporaries cannot bind to `T&`, can bind to `const T&` with lifetime extension, and prefer binding to `T&&` when available.

**Code example:**
```cpp
void f1(int& x) { }
void f2(const int& x) { }
void f3(int&& x) { }

int main() {
    // f1(42);  // ❌ Error: cannot bind rvalue to non-const lvalue ref
    f2(42);     // ✅ OK: const lvalue ref binds to rvalue
    f3(42);     // ✅ OK: rvalue ref binds to rvalue
}

// When both f2 and f3 exist:
void g(const int& x) { std::cout << "const&\n"; }
void g(int&& x) { std::cout << "&&\n"; }

g(42);  // Calls g(int&&) - exact match preferred
```

**Explanation:**
Overload resolution prefers exact matches. Temporaries are rvalues, so they match `T&&` exactly. They can also bind to `const T&` as a fallback (pre-C++11 behavior), but not to non-const `T&`. This enables the compiler to select move operations for temporaries while preserving backward compatibility.

**Key takeaway:** Temporaries prefer `T&&` (exact match) over `const T&` (allowed) and reject `T&` (forbidden).

---

#### Q23: Why does overload resolution prefer rvalue references for temporaries?
**Difficulty:** #intermediate
**Category:** #overload_resolution #performance
**Concepts:** #overload_resolution #rvalue_reference #exact_match #move_semantics

**Answer:**
Temporaries are rvalues, and rvalue references provide an exact match, allowing the compiler to select more efficient move operations while maintaining const lvalue reference as a fallback.

**Code example:**
```cpp
class Data {
public:
    Data(const Data& other) { std::cout << "Copy\n"; }
    Data(Data&& other) { std::cout << "Move\n"; }
};

Data create() { return Data(); }

int main() {
    Data d = create();  // Calls move constructor (or RVO)
    // Without Data(Data&&), would call copy constructor
}
```

**Explanation:**
Before C++11, temporaries bound to `const T&`, forcing copies. With rvalue references, the compiler can distinguish temporaries from persistent objects and select optimized move operations. Overload resolution ranks exact matches higher than conversions, so `T&&` wins for rvalues.

**Key takeaway:** Rvalue references enable efficient handling of temporaries through exact match in overload resolution.

---

#### Q24: Can you have a reference to a reference in C++?
**Difficulty:** #advanced
**Category:** #type_system #reference_collapsing
**Concepts:** #reference #reference_collapsing #type_system

**Answer:**
No, you cannot directly declare references to references in normal code, but they can appear during template instantiation and are resolved through reference collapsing.

**Code example:**
```cpp
// int& & ref;  // ❌ Syntax error: cannot declare reference to reference

// But in templates:
template<typename T>
void foo(T&& param) { }

int& getRef();
foo(getRef());  // T = int&, T&& = int& && → collapses to int&
```

**Explanation:**
While you can't write `T& &` directly, reference-to-reference types can arise during template type deduction. When this happens, C++ applies reference collapsing rules to produce a valid reference type. This mechanism is essential for perfect forwarding and universal references.

**Key takeaway:** References to references don't exist in normal code but appear in templates and collapse to single references.

---

#### Q25: What is the relationship between value categories and the rule of five?
**Difficulty:** #advanced
**Category:** #design_pattern #move_semantics
**Concepts:** #rule_of_five #value_category #move_semantics #copy_semantics

**Answer:**
The rule of five requires implementing both copy and move operations (constructor and assignment) to properly handle different value categories, ensuring efficiency with temporaries and correctness with lvalues.

**Code example:**
```cpp
class Resource {
public:
    Resource(const Resource&);           // Copy constructor (lvalues)
    Resource(Resource&&) noexcept;       // Move constructor (rvalues)
    Resource& operator=(const Resource&); // Copy assignment (lvalues)
    Resource& operator=(Resource&&) noexcept; // Move assignment (rvalues)
    ~Resource();
};
```

**Explanation:**
Value categories directly influence which member functions are called. Lvalues use copy operations, rvalues use move operations. The rule of five ensures you handle both categories correctly. Without move operations, rvalues fall back to copying (inefficient). Without copy operations, you can't handle lvalues (compilation error or deleted functions).

**Key takeaway:** The rule of five provides overloads for both value categories, enabling optimal handling of lvalues and rvalues.

---
