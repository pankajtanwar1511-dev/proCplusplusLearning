## TOPIC: C++ Cast Operators and Type Casting Mechanisms

### PRACTICE_TASKS: Cast Operator Application and Debugging

#### Q1
```cpp
#include <iostream>

struct Base {
    virtual ~Base() { }
    int base_val = 10;
};

struct Derived : Base {
    int derived_val = 20;
};

int main() {
    Base* b = new Derived();
    Derived* d1 = static_cast<Derived*>(b);
    Derived* d2 = dynamic_cast<Derived*>(b);
    
    std::cout << d1->derived_val << " " << d2->derived_val << "\n";
    
    delete b;
}
```

**Answer:**
```
20 20
```

**Explanation:**
- b is Base* pointing to Derived object (polymorphism)
- `static_cast<Derived*>(b)` performs compile-time downcast
- static_cast trusts programmer, doesn't check object type at runtime
- Works because b actually points to Derived
- `dynamic_cast<Derived*>(b)` performs runtime type check
- Uses RTTI to verify b points to Derived (succeeds)
- Both access derived_val safely (20)
- If b pointed to Base only, static_cast would be dangerous
- **Key Concept:** static_cast trusts programmer; dynamic_cast verifies at runtime with RTTI

---

#### Q2
```cpp
#include <iostream>

int main() {
    const int x = 100;
    int* p = const_cast<int*>(&x);
    *p = 200;
    
    std::cout << x << " " << *p << "\n";
}
```

**Answer:**
```
Undefined behavior
Typical: 100 200 or 200 200
```

**Explanation:**
- `const int x = 100` creates truly const object
- const_cast removes const qualification from pointer
- `*p = 200` modifies through cast pointer
- Modifying originally const object is undefined behavior
- Compiler may optimize assuming x never changes
- May print "100 200" (compiler cached x, p sees 200)
- May print "200 200" (both see modification)
- Both outcomes valid under UB
- const_cast only safe for originally mutable objects temporarily made const
- **Key Concept:** const_cast to modify truly const objects causes UB; only use to remove temporarily added const

---

#### Q3
```cpp
#include <iostream>

struct Base { virtual ~Base() { } };
struct Derived : Base { };

int main() {
    Base* b = new Base();
    
    Derived* d1 = static_cast<Derived*>(b);
    Derived* d2 = dynamic_cast<Derived*>(b);
    
    std::cout << (d1 == nullptr) << " " << (d2 == nullptr) << "\n";
    
    delete b;
}
```

**Answer:**
```
0 1
```

**Explanation:**
- b points to Base object (not Derived)
- `static_cast<Derived*>(b)` compiles, performs unchecked downcast
- Returns non-null pointer even though cast is invalid
- d1 is non-null (0 = false), but dereferencing would be UB
- `dynamic_cast<Derived*>(b)` performs runtime type check
- Detects b is not actually Derived, returns nullptr (safe failure)
- d2 is nullptr (1 = true)
- dynamic_cast is safer for downcasts with uncertain types
- **Key Concept:** static_cast unsafe downcast (no runtime check); dynamic_cast safe (returns nullptr on failure)

---

#### Q4
```cpp
#include <iostream>
#include <cstring>

int main() {
    float f = 3.14f;
    int bits;
    std::memcpy(&bits, &f, sizeof(f));
    
    int* fp_bits = reinterpret_cast<int*>(&f);
    
    std::cout << (bits == *fp_bits) << "\n";
}
```

**Answer:**
```
1
```

**Explanation:**
- `memcpy(&bits, &f, sizeof(f))` copies float bits to int
- memcpy is defined behavior for type punning
- `reinterpret_cast<int*>(&f)` casts float* to int*
- Dereferencing violates strict aliasing rule (technically UB)
- But both read same bit pattern
- Result comparison is true (1)
- memcpy is standards-compliant way to inspect representation
- reinterpret_cast + dereference may work but is UB
- **Key Concept:** memcpy is safe for type punning; reinterpret_cast + dereference violates strict aliasing

---

#### Q5
```cpp
#include <iostream>

double performCalc() {
    return 3.14159;
}

int main() {
    int i1 = performCalc();  // What conversion?
    int i2 = static_cast<int>(performCalc());  // What conversion?
    
    std::cout << i1 << " " << i2 << "\n";
}
```

**Answer:**
```
3 3
```

**Explanation:**
- performCalc() returns double 3.14159
- `int i1 = performCalc()` uses implicit conversion
- double → int narrowing conversion (truncates to 3)
- Implicit narrowing allowed in copy-initialization
- `static_cast<int>(performCalc())` explicit conversion
- Same truncation behavior: 3.14159 → 3
- static_cast makes intent explicit (better style)
- Both produce identical result
- Prefer explicit casts for clarity and brace-init safety
- **Key Concept:** static_cast makes conversions explicit; same behavior as implicit but clearer intent

---

#### Q6
```cpp
#include <iostream>

struct A { int a = 1; virtual ~A() { } };
struct B { int b = 2; virtual ~B() { } };
struct C : A, B { int c = 3; };

int main() {
    C obj;
    B* bp = static_cast<B*>(&obj);
    
    std::cout << bp->b << "\n";
    std::cout << (static_cast<void*>(&obj) == static_cast<void*>(bp)) << "\n";
}
```

**Answer:**
```
2
0
```

**Explanation:**
- C inherits from both A and B (multiple inheritance)
- obj layout: A subobject, then B subobject, then C's own members
- `static_cast<B*>(&obj)` converts C* to B*
- Pointer adjustment: adds offset to point to B subobject within C
- bp points to B subobject, bp->b correctly accesses 2
- `static_cast<void*>(&obj)` points to start of obj (A subobject)
- `static_cast<void*>(bp)` points to B subobject (different address)
- Addresses are different (0 = false)
- Multiple inheritance requires pointer adjustment
- **Key Concept:** Multiple inheritance causes subobjects at different offsets; pointer casts adjust address accordingly

---

#### Q7
```cpp
#include <iostream>

int main() {
    int x = 65;
    char c = static_cast<char>(x);
    
    std::cout << c << " " << static_cast<int>(c) << "\n";
}
```

**Answer:**
```
A 65
```

**Explanation:**
- `static_cast<char>(x)` where x is 65
- int → char narrowing conversion
- Value 65 fits in char range (-128 to 127 or 0 to 255)
- Conversion preserves value: 65
- char 65 is ASCII 'A'
- `std::cout << c` prints character: A
- `static_cast<int>(c)` converts back to int: 65
- Round-trip conversion preserves value in range
- **Key Concept:** static_cast for numeric conversions; value preserved if in target range

---

#### Q8
```cpp
#include <iostream>
#include <typeinfo>

struct Base { virtual ~Base() { } };
struct Derived : Base { };

int main() {
    Base b;
    
    try {
        Derived& d = dynamic_cast<Derived&>(b);
        std::cout << "Cast succeeded\n";
    } catch (const std::bad_cast& e) {
        std::cout << "Cast failed\n";
    }
}
```

**Answer:**
```
Cast failed
```

**Explanation:**
- `dynamic_cast<Derived&>(b)` attempts to cast Base to Derived reference
- b is Base object (not Derived)
- Pointer dynamic_cast returns nullptr on failure
- Reference dynamic_cast cannot return null (references can't be null)
- Throws std::bad_cast exception on failure instead
- Runtime type check detects b is not Derived
- Exception thrown, catch block executes
- Prints "Cast failed"
- Use reference dynamic_cast when expecting success (exception on error)
- **Key Concept:** Reference dynamic_cast throws bad_cast on failure; pointer version returns nullptr

---

#### Q9
```cpp
#include <iostream>

void legacyFunc(char* str) {
    std::cout << str << "\n";
}

int main() {
    const char* message = "Hello";
    legacyFunc(const_cast<char*>(message));  // Safe?
}
```

**Answer:**
```
Hello
```

**Explanation:**
- String literal "Hello" is const char*
- legacyFunc expects char* (non-const)
- Old C APIs often had char* parameters even for read-only strings
- `const_cast<char*>(message)` removes const
- Safe IF legacyFunc only reads, doesn't modify
- In this case, legacyFunc just prints (read-only) - safe
- If legacyFunc modified, would be UB (string literals are immutable)
- const_cast useful for interfacing with legacy APIs
- Better: fix legacyFunc signature to const char*
- **Key Concept:** const_cast enables legacy API compatibility; safe only if function doesn't actually modify

---

#### Q10
```cpp
#include <iostream>

struct NonPoly {
    int value = 42;
};

int main() {
    NonPoly np;
    NonPoly* p1 = &np;
    // NonPoly* p2 = dynamic_cast<NonPoly*>(p1);  // Will this compile?
    
    std::cout << p1->value << "\n";
}
```

**Answer:**
```
Compilation error on dynamic_cast line
Prints: 42
```

**Explanation:**
- NonPoly has no virtual functions (non-polymorphic)
- dynamic_cast requires polymorphic type (at least one virtual function)
- Needs vtable for RTTI (Run-Time Type Information)
- `dynamic_cast<NonPoly*>(p1)` fails to compile
- Compiler error: dynamic_cast requires polymorphic class
- static_cast would work (compile-time, no RTTI needed)
- Add virtual destructor to enable dynamic_cast
- **Key Concept:** dynamic_cast requires polymorphic types with vtable; add virtual function to enable RTTI

---

#### Q11
```cpp
#include <iostream>
#include <cstdint>

int main() {
    int value = 1000;
    std::uintptr_t addr = reinterpret_cast<std::uintptr_t>(&value);
    int* restored = reinterpret_cast<int*>(addr);
    
    std::cout << *restored << "\n";
}
```

**Answer:**
```
1000
```

**Explanation:**
- `reinterpret_cast<std::uintptr_t>(&value)` converts pointer to integer
- uintptr_t is integer type guaranteed to hold pointer value
- Stores pointer address as integer
- `reinterpret_cast<int*>(addr)` converts back to pointer
- Round-trip pointer→integer→pointer is safe with uintptr_t
- restored points to same object as &value
- `*restored` accesses original int, prints 1000
- Other integer types may not be large enough (UB)
- **Key Concept:** reinterpret_cast with uintptr_t for safe pointer-to-integer round-trips; other types may truncate

---

#### Q12
```cpp
#include <iostream>

int main() {
    int* ptr = nullptr;
    
    char* c1 = static_cast<char*>(static_cast<void*>(ptr));
    char* c2 = reinterpret_cast<char*>(ptr);
    
    std::cout << (c1 == nullptr) << " " << (c2 == nullptr) << "\n";
}
```

**Answer:**
```
1 1
```

**Explanation:**
- ptr is nullptr (null pointer)
- `static_cast<char*>(static_cast<void*>(ptr))` double cast
- First: int* → void* (nullptr stays nullptr)
- Second: void* → char* (nullptr stays nullptr)
- c1 is nullptr
- `reinterpret_cast<char*>(ptr)` direct cast int* → char*
- nullptr remains nullptr through reinterpret_cast
- c2 is nullptr
- Both comparisons with nullptr are true (1)
- nullptr has special handling in all casts
- **Key Concept:** nullptr preserved through any cast; special-cased in C++ standard

---

#### Q13
```cpp
#include <iostream>

struct Base1 { virtual ~Base1() { } };
struct Base2 { virtual ~Base2() { } };
struct Derived : Base1, Base2 { };

int main() {
    Derived d;
    Base1* b1 = &d;
    
    Base2* b2 = dynamic_cast<Base2*>(b1);
    
    if (b2) {
        std::cout << "Cross-cast succeeded\n";
    } else {
        std::cout << "Cross-cast failed\n";
    }
}
```

**Answer:**
```
Cross-cast succeeded
```

**Explanation:**
- d is Derived object with Base1 and Base2 subobjects
- b1 is Base1* pointing to d's Base1 subobject
- `dynamic_cast<Base2*>(b1)` attempts cross-cast
- Not upcasting or downcasting - sideways between bases
- dynamic_cast uses RTTI to traverse inheritance hierarchy
- Finds that b1 points to Derived, which also has Base2 subobject
- Returns pointer to Base2 subobject (with address adjustment)
- b2 is non-null, prints "Cross-cast succeeded"
- Requires polymorphic types and common derived class
- **Key Concept:** dynamic_cast enables cross-casting in multiple inheritance; uses RTTI to navigate hierarchy

---

#### Q14
```cpp
#include <iostream>

int main() {
    double large = 1e100;
    int overflow = static_cast<int>(large);
    
    std::cout << overflow << "\n";  // What's the output?
}
```

**Answer:**
```
Undefined behavior (implementation-defined)
```

**Explanation:**
- large is 1e100 (10^100, huge double value)
- Typical int range: -2^31 to 2^31-1 (32-bit)
- 1e100 vastly exceeds maximum int value
- `static_cast<int>(large)` attempts narrowing conversion
- Source value not representable in target type
- Result is implementation-defined (compiler-dependent)
- May be INT_MAX, INT_MIN, garbage, or trap
- static_cast doesn't prevent overflow
- Check range before casting or use saturating conversion
- **Key Concept:** static_cast doesn't prevent overflow; out-of-range conversions have implementation-defined behavior

---

#### Q15
```cpp
#include <iostream>

void modify(const int& ref) {
    int& mutable_ref = const_cast<int&>(ref);
    mutable_ref = 999;
}

int main() {
    int x = 42;
    const int& cr = x;
    modify(cr);
    
    std::cout << x << "\n";
}
```

**Answer:**
```
999
```

**Explanation:**
- x is mutable int (originally non-const)
- cr is const reference to x (added const)
- modify() receives const reference
- `const_cast<int&>(ref)` removes const from reference
- Safe because underlying object (x) is mutable
- `mutable_ref = 999` modifies x through non-const reference
- x was never truly const, just temporarily viewed as const
- Modification succeeds, x becomes 999
- const_cast safe when removing temporarily added const
- **Key Concept:** const_cast safe to remove const added by reference/pointer; unsafe for truly const objects

---

#### Q16
```cpp
#include <iostream>

struct Base { virtual ~Base() { } };
struct Derived : Base { };

int main() {
    Base* b1 = new Derived();
    Base* b2 = new Base();
    
    std::cout << (dynamic_cast<Derived*>(b1) != nullptr) << " ";
    std::cout << (dynamic_cast<Derived*>(b2) != nullptr) << "\n";
    
    delete b1;
    delete b2;
}
```

**Answer:**
```
1 0
```

**Explanation:**
- b1 points to Derived object (dynamic type is Derived)
- b2 points to Base object (dynamic type is Base)
- `dynamic_cast<Derived*>(b1)` checks runtime type
- b1's object is actually Derived, cast succeeds
- Returns non-null pointer (true = 1)
- `dynamic_cast<Derived*>(b2)` checks runtime type
- b2's object is only Base, not Derived
- Cast fails, returns nullptr (false = 0)
- dynamic_cast performs runtime type checking via RTTI
- Safe way to check and convert pointer types
- **Key Concept:** dynamic_cast verifies actual object type at runtime; returns nullptr for incompatible types

---

#### Q17
```cpp
#include <iostream>

struct A {
    int x = 10;
    virtual ~A() { }
};

struct B : A {
    int y = 20;
};

int main() {
    A* a = new B();
    B* b = static_cast<B*>(a);
    
    std::cout << b->x << " " << b->y << "\n";
    
    delete a;
}
```

**Answer:**
```
10 20
```

**Explanation:**
- a is A* pointing to B object (polymorphic pointer)
- `static_cast<B*>(a)` performs downcast A* → B*
- Compile-time cast, no runtime checking
- Safe because a actually points to B
- b accesses both inherited member x (10) and own member y (20)
- If a pointed to A only, behavior would be undefined
- static_cast trusts programmer knows actual type
- Prefer dynamic_cast when type uncertain
- **Key Concept:** static_cast for downcasts when you're certain of type; faster than dynamic_cast but unsafe if wrong

---

#### Q18
```cpp
#include <iostream>

int main() {
    float f = -3.99f;
    int i = static_cast<int>(f);
    
    std::cout << i << "\n";
}
```

**Answer:**
```
-3
```

**Explanation:**
- f is float -3.99
- `static_cast<int>(f)` converts float to int
- Floating-point to integer conversion truncates toward zero
- Fractional part discarded: -3.99 → -3
- Not rounding, not floor - truncation
- Positive: 3.99 → 3, Negative: -3.99 → -3
- Always moves toward zero
- Use std::floor, std::ceil, std::round for other rounding modes
- **Key Concept:** Float-to-int conversion truncates toward zero; discards fractional part without rounding

---

#### Q19
```cpp
#include <iostream>

int mutable_int = 50;

void test(const int* ptr) {
    int* p = const_cast<int*>(ptr);
    *p = 100;
}

int main() {
    test(&mutable_int);
    std::cout << mutable_int << "\n";
}
```

**Answer:**
```
100
```

**Explanation:**
- mutable_int is global int (not const)
- test() receives const int* parameter
- const qualification added by parameter type
- `const_cast<int*>(ptr)` removes const from pointer
- Safe because pointed-to object (mutable_int) is mutable
- `*p = 100` modifies mutable_int
- Modification allowed, mutable_int becomes 100
- Common pattern: const interface parameter, modify if allowed
- const_cast safe when object wasn't originally const
- **Key Concept:** const_cast safe for removing temporarily added const; object must be originally mutable

---

#### Q20
```cpp
#include <iostream>
#include <cstring>

int main() {
    int x = 42;
    double d;
    std::memcpy(&d, &x, sizeof(int));
    
    std::cout << d << "\n";  // What happens?
}
```

**Answer:**
```
Undefined behavior
```

**Explanation:**
- memcpy copies 4 bytes from int x to double d
- d is 8 bytes, only first 4 bytes filled (rest uninitialized)
- Interpreting incomplete/wrong bit pattern as double is UB
- d doesn't contain valid double representation
- Reading d invokes undefined behavior
- May print garbage, trap, or crash
- memcpy itself is safe, but incomplete type punning is not
- Correct: copy matching size types (int↔int, double↔double)
- For type inspection, use proper size: sizeof(int) only fills partial double
- **Key Concept:** Type punning with memcpy requires matching sizes; partial copies create invalid representations

---
