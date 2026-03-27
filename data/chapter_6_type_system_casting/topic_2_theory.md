## TOPIC: C++ Cast Operators and Type Casting Mechanisms

### THEORY_SECTION: Understanding C++ Cast Operators

#### 1. The Four C++ Cast Operators - Purpose and Safety Levels

C++ provides four type-safe cast operators to replace the unsafe and ambiguous C-style cast `(Type)value`. Each operator serves a specific purpose and makes the programmer's intent explicit, enabling better compile-time checking and code clarity.

**Cast Operator Overview**

| Cast Operator | Primary Purpose | Safety Level | Runtime Cost | Typical Use Cases |
|---------------|----------------|--------------|--------------|-------------------|
| `static_cast<T>` | Compile-time conversions between related types | Medium | None | Numeric conversions, inheritance upcasts, known downcasts, void* conversions |
| `dynamic_cast<T>` | Runtime-checked polymorphic conversions | High | Small (RTTI lookup) | Safe downcasting, cross-casting in inheritance hierarchies |
| `const_cast<T>` | Add/remove const or volatile qualifiers | Low | None | Legacy API integration, const-incorrect code |
| `reinterpret_cast<T>` | Low-level bitwise reinterpretation | Very Low | None | Pointer↔integer conversions, hardware register access, platform-specific code |

**static_cast - The Workhorse Cast**

`static_cast<T>` performs compile-time checked conversions between related types. It's the most commonly used cast and provides reasonable safety for well-defined conversions.

| Operation | Example | Safe? | Notes |
|-----------|---------|-------|-------|
| Numeric conversions | `static_cast<int>(3.14)` | ✅ Yes | Makes truncation explicit |
| Upcast (Derived→Base) | `static_cast<Base*>(derived_ptr)` | ✅ Always safe | Implicit also works |
| Downcast (Base→Derived) | `static_cast<Derived*>(base_ptr)` | ⚠️ If type guaranteed | No runtime check - UB if wrong |
| void* conversions | `static_cast<int*>(void_ptr)` | ✅ If correct type | Safe round-trip |
| Enum ↔ integer | `static_cast<int>(MyEnum::Value)` | ✅ Yes | Explicit enum conversions |
| const_cast | N/A | ❌ Cannot | Won't compile |
| Bitwise reinterpretation | N/A | ❌ Cannot | Won't compile |

```cpp
// ✅ static_cast: Compile-time checked conversions
double pi = 3.14159;
int truncated = static_cast<int>(pi);  // Explicit truncation to 3

struct Base { virtual ~Base() {} };
struct Derived : Base { int value = 42; };

Derived d;
Base* bp = static_cast<Base*>(&d);      // ✅ Upcast: always safe

Base* b2 = new Derived();
Derived* dp = static_cast<Derived*>(b2); // ⚠️ Downcast: safe if b2 is actually Derived
std::cout << dp->value << "\n";          // 42 (works because b2 is actually Derived)

Base* b3 = new Base();
Derived* dp2 = static_cast<Derived*>(b3); // ❌ UB: b3 is NOT actually Derived
// Accessing dp2->value is undefined behavior
```

**dynamic_cast - The Safe Cast for Polymorphism**

`dynamic_cast<T>` provides runtime type checking using RTTI, making it the safest option for navigating polymorphic hierarchies.

| Feature | Pointers | References |
|---------|----------|------------|
| **Failure behavior** | Returns `nullptr` | Throws `std::bad_cast` |
| **Performance** | Small runtime overhead (RTTI lookup) | Same |
| **Requirements** | Base must be polymorphic (have virtual functions) | Same |
| **Typical pattern** | `if (Derived* d = dynamic_cast<Derived*>(base))` | `try { Derived& d = dynamic_cast<Derived&>(base); }` |
| **Cross-casting** | ✅ Can cross-cast between siblings | ✅ Can cross-cast |
| **Upcast** | ✅ Works but unnecessary (use implicit) | ✅ Works but unnecessary |

```cpp
#include <iostream>
#include <typeinfo>

struct Animal { virtual ~Animal() {} };
struct Dog : Animal { void bark() { std::cout << "Woof!\n"; } };
struct Cat : Animal { void meow() { std::cout << "Meow!\n"; } };

void interact(Animal* animal) {
    // ✅ dynamic_cast with nullptr check
    if (Dog* dog = dynamic_cast<Dog*>(animal)) {
        dog->bark();  // Safe: we know it's a Dog
    } else if (Cat* cat = dynamic_cast<Cat*>(animal)) {
        cat->meow();  // Safe: we know it's a Cat
    }
}

void interact_ref(Animal& animal) {
    // ✅ dynamic_cast with exception handling
    try {
        Dog& dog = dynamic_cast<Dog&>(animal);
        dog.bark();
    } catch (const std::bad_cast& e) {
        std::cout << "Not a Dog: " << e.what() << "\n";
    }
}

int main() {
    Dog d;
    Cat c;
    interact(&d);  // Prints: Woof!
    interact(&c);  // Prints: Meow!

    interact_ref(d);  // Prints: Woof!
    interact_ref(c);  // Prints: Not a Dog: ...
}
```

**const_cast - The Const-Qualifier Cast**

`const_cast<T>` is the only cast that can add or remove `const` and `volatile` qualifiers. Use sparingly and only when interfacing with const-incorrect code.

| Operation | Safe? | Example |
|-----------|-------|---------|
| Remove const from mutable object | ✅ Safe | `int x; const int* cp = &x; int* p = const_cast<int*>(cp);` |
| Remove const from truly const object | ❌ UB | `const int cx = 5; int* p = const_cast<int*>(&cx); *p = 10;` (UB) |
| Add const (rarely needed) | ✅ Safe | `int* p = ...; const int* cp = const_cast<const int*>(p);` |
| Remove volatile | ⚠️ Depends | Safe if object wasn't originally volatile |

```cpp
#include <iostream>

// Legacy C API that doesn't use const (const-incorrect)
extern "C" void legacy_print(char* str) {
    std::cout << str << "\n";  // Only reads, doesn't modify
}

void modern_function(const char* message) {
    // ✅ Safe: We know legacy_print won't modify the string
    legacy_print(const_cast<char*>(message));
}

int main() {
    const char* msg = "Hello, World!";
    modern_function(msg);  // Prints: Hello, World!

    // ❌ DANGEROUS: Modifying truly const object
    const int truly_const = 42;
    int* p = const_cast<int*>(&truly_const);
    // *p = 100;  // ❌ Undefined behavior - compiler may crash or optimize based on const
}
```

**reinterpret_cast - The Low-Level Cast**

`reinterpret_cast<T>` performs bitwise reinterpretation without conversions. It's the most dangerous cast and should be used only for low-level operations.

| Use Case | Example | Notes |
|----------|---------|-------|
| Pointer → integer | `reinterpret_cast<uintptr_t>(ptr)` | Use `uintptr_t` for portability |
| Integer → pointer | `reinterpret_cast<int*>(address)` | Hardware interfacing |
| Unrelated pointer types | `reinterpret_cast<char*>(int_ptr)` | ❌ Violates strict aliasing if dereferenced |
| Function pointers | `reinterpret_cast<void(*)()>(func_ptr)` | ❌ UB if called through wrong type |

```cpp
#include <iostream>
#include <cstdint>
#include <cstring>

int main() {
    int value = 42;
    int* ptr = &value;

    // ✅ Pointer to integer (for logging, alignment checks)
    uintptr_t addr = reinterpret_cast<uintptr_t>(ptr);
    std::cout << "Address: 0x" << std::hex << addr << std::dec << "\n";

    // ✅ Integer back to pointer
    int* restored = reinterpret_cast<int*>(addr);
    std::cout << "Value: " << *restored << "\n";  // 42

    // ❌ DANGEROUS: Type punning via reinterpret_cast violates strict aliasing
    float f = 3.14f;
    // int* bad = reinterpret_cast<int*>(&f);
    // int bits = *bad;  // ❌ Undefined behavior

    // ✅ SAFE: Use memcpy for type punning
    int bits_safe;
    std::memcpy(&bits_safe, &f, sizeof(f));
    std::cout << "Float bits: 0x" << std::hex << bits_safe << std::dec << "\n";
}
```

---

#### 2. Why C-Style Casts Are Dangerous and When Each Cast Applies

**The Problem with C-Style Casts**

C-style casts `(Type)value` are dangerous because they're **ambiguous** - the compiler tries multiple cast operations in sequence until one succeeds, and it's not clear which one will be used.

**C-Style Cast Sequence (First Match Wins)**

| Step | Operation | Example | Hidden Danger |
|------|-----------|---------|---------------|
| 1 | Try `const_cast` | `(int*)(const int*)` | Silently removes const |
| 2 | Try `static_cast` | `(int)(double)` | May truncate or overflow |
| 3 | Try `static_cast` + `const_cast` | `(int*)(const Base*)` | Combines conversions |
| 4 | Try `reinterpret_cast` | `(char*)(int*)` | Bitwise reinterpretation |
| 5 | Try `reinterpret_cast` + `const_cast` | `(char*)(const int*)` | Most dangerous combination |

```cpp
// ❌ C-style cast: Ambiguous and dangerous
double d = 3.14;
int i = (int)d;                    // Is this static_cast? Could be anything!

const int* cp = &i;
int* p = (int*)cp;                  // ❌ Silently removes const (const_cast hidden)
*p = 100;                           // May be UB if original was const

struct Base { virtual ~Base() {} };
struct Derived : Base { int value; };
Base* b = new Base();
Derived* d2 = (Derived*)b;          // ❌ No runtime check (static_cast hidden)
// d2->value = 10;                  // ❌ Undefined behavior

// ✅ C++ casts: Explicit and searchable
int i2 = static_cast<int>(d);       // Clear: numeric conversion
// int* p2 = static_cast<int*>(cp); // ❌ Won't compile - forced to use const_cast
int* p2 = const_cast<int*>(cp);     // Clear: removing const (searchable in code)
```

**When to Use Each Cast Operator**

| Scenario | Use This Cast | Why | Example |
|----------|--------------|-----|---------|
| **Numeric conversions** | `static_cast` | Makes truncation explicit | `static_cast<int>(3.14)` |
| **Upcast in inheritance** | Implicit or `static_cast` | Always safe, implicit works | `Base* b = derived_ptr;` |
| **Downcast (type guaranteed)** | `static_cast` | Faster (no runtime check) | In controlled factories |
| **Downcast (type uncertain)** | `dynamic_cast` + nullptr check | Safe runtime verification | `if (auto* d = dynamic_cast<Derived*>(b))` |
| **Cross-cast in hierarchy** | `dynamic_cast` | Only dynamic_cast can cross-cast | Navigate between sibling classes |
| **Remove const for legacy API** | `const_cast` | Only cast that can modify cv-qualifiers | `const_cast<char*>(const_str)` |
| **Modify const object** | ❌ **Never** | Always undefined behavior | Don't do it! |
| **Pointer ↔ integer** | `reinterpret_cast` | Low-level address manipulation | `reinterpret_cast<uintptr_t>(ptr)` |
| **Type punning (bit inspection)** | `memcpy` or `std::bit_cast` | Avoids strict aliasing violations | `memcpy(&int_bits, &float_val, 4)` |
| **Hardware register access** | `reinterpret_cast` | Memory-mapped I/O | `reinterpret_cast<volatile uint32_t*>(addr)` |
| **Any conversion** | ❌ C-style cast | Too dangerous, ambiguous | Use specific C++ casts |

**Decision Tree: Which Cast to Use?**

```
What are you trying to do?

├─ Numeric conversion (int ↔ double)?
│  └─ Use static_cast<T>

├─ Inheritance conversion?
│  ├─ Upcast (Derived → Base)?
│  │  └─ Use implicit conversion (or static_cast if you want to be explicit)
│  │
│  ├─ Downcast (Base → Derived)?
│  │  ├─ Type guaranteed (factory pattern, just created)?
│  │  │  └─ Use static_cast<Derived*> (faster)
│  │  └─ Type uncertain (polymorphic code)?
│  │     └─ Use dynamic_cast<Derived*> and check for nullptr
│  │
│  └─ Cross-cast (Sibling1 → Sibling2)?
│     └─ Use dynamic_cast (only option)

├─ Need to remove const?
│  ├─ Object was originally mutable?
│  │  └─ Use const_cast<T> (safe for legacy APIs)
│  └─ Object was originally const?
│     └─ ❌ Don't do it! (undefined behavior)

├─ Pointer ↔ integer conversion?
│  └─ Use reinterpret_cast<uintptr_t> or reinterpret_cast<T*>

├─ Bit-pattern inspection (float bits as int)?
│  └─ Use memcpy or std::bit_cast (NOT reinterpret_cast)

└─ Hardware/low-level programming?
   └─ Use reinterpret_cast (with caution)
```

---

#### 3. Cast Operator Requirements and Common Pitfalls

**Requirements for Each Cast Operator**

| Cast Operator | Compile-Time Requirements | Runtime Requirements | What It Won't Do |
|---------------|--------------------------|---------------------|------------------|
| `static_cast` | Types must be related (inheritance, numeric, void*) | None | Remove const, perform bitwise reinterpretation |
| `dynamic_cast` | Base class must be polymorphic (≥1 virtual function) | Object must actually be target type | Convert non-polymorphic types, cross-cast unrelated types |
| `const_cast` | Target type must differ only in cv-qualifiers | None | Change actual type, perform numeric conversions |
| `reinterpret_cast` | Target must be pointer, reference, or integer type | None (all UB risk on programmer) | Safely convert types, adjust pointers for inheritance |

**dynamic_cast Requirements in Detail**

```cpp
// ❌ Won't compile: No virtual functions (not polymorphic)
struct NonPolymorphic {
    int x;
};

NonPolymorphic* np = new NonPolymorphic();
// auto* x = dynamic_cast<NonPolymorphic*>(np);  // Compile error

// ✅ Compiles: Has virtual function (polymorphic)
struct Polymorphic {
    virtual ~Polymorphic() {}
    int x;
};

Polymorphic* pp = new Polymorphic();
auto* y = dynamic_cast<Polymorphic*>(pp);  // OK

// Why: virtual function creates vtable with RTTI
// Without vtable, there's no type information at runtime
```

**Common Pitfalls and How to Avoid Them**

| Pitfall | Why It's Wrong | How to Avoid | Safe Alternative |
|---------|---------------|--------------|------------------|
| **Using C-style casts** | Ambiguous, hides dangerous operations | Ban in code reviews | Use specific C++ cast operators |
| **static_cast downcast without check** | No runtime verification - UB if wrong | Only use if type is guaranteed | Use `dynamic_cast` + nullptr check |
| **Modifying const object via const_cast** | Compiler optimizes based on const | Only remove const from mutable objects | Redesign to avoid const_cast |
| **reinterpret_cast for type punning** | Violates strict aliasing → UB | Compiler may misoptimize | Use `memcpy` or `std::bit_cast` |
| **reinterpret_cast in inheritance** | Doesn't adjust pointer offsets | Breaks with multiple inheritance | Use `static_cast` or `dynamic_cast` |
| **dynamic_cast without checking result** | nullptr dereference crashes | Always check before using | `if (auto* d = dynamic_cast<Derived*>(b))` |
| **Assuming dynamic_cast is free** | Has runtime cost (RTTI lookup) | Profile before optimizing | Use `static_cast` only in proven hotspots |
| **Casting function pointers** | Calling through wrong type is UB | Only cast for storage, not calling | Cast back to original type before calling |

**Multiple Inheritance and Pointer Adjustment**

```cpp
struct A {
    int a = 1;
    virtual ~A() {}
};

struct B {
    int b = 2;
    virtual ~B() {}
};

struct C : A, B {  // Multiple inheritance
    int c = 3;
};

C obj;
std::cout << "C address: " << &obj << "\n";

// ✅ static_cast: Adjusts pointer offset for B subobject
B* bp_static = static_cast<B*>(&obj);
std::cout << "B address (static_cast): " << bp_static << "\n";  // Different from C!
std::cout << "B value: " << bp_static->b << "\n";  // 2 (correct)

// ❌ reinterpret_cast: Does NOT adjust pointer
B* bp_reinterpret = reinterpret_cast<B*>(&obj);
std::cout << "B address (reinterpret_cast): " << bp_reinterpret << "\n";  // Same as C!
// std::cout << bp_reinterpret->b << "\n";  // ❌ Undefined behavior (wrong offset)

// Key: In memory, C object layout is: [A subobject][B subobject][C members]
//      static_cast knows to add offset to reach B subobject
//      reinterpret_cast just reinterprets the bits (wrong!)
```

**Strict Aliasing and reinterpret_cast**

```cpp
#include <cstring>

void demonstrate_strict_aliasing() {
    float f = 3.14f;

    // ❌ WRONG: Violates strict aliasing rule
    int* ip = reinterpret_cast<int*>(&f);
    // int bits = *ip;  // Undefined behavior!
    // Problem: Compiler assumes float* and int* don't alias
    //          Can reorder/optimize in ways that break correctness

    // ✅ CORRECT: memcpy doesn't violate strict aliasing
    int bits_safe;
    std::memcpy(&bits_safe, &f, sizeof(f));
    // Now bits_safe contains the bit pattern of f (safe!)

    // ✅ CORRECT (C++20): Use std::bit_cast
    // auto bits_cpp20 = std::bit_cast<int>(f);
}
```

**When const_cast is UB vs Safe**

```cpp
#include <iostream>

void safe_const_cast() {
    // ✅ SAFE: Object was originally mutable
    int mutable_var = 42;
    const int* cp = &mutable_var;  // Add const
    int* p = const_cast<int*>(cp);  // Remove const
    *p = 100;  // OK - object is actually mutable
    std::cout << mutable_var << "\n";  // 100
}

void unsafe_const_cast() {
    // ❌ UNDEFINED BEHAVIOR: Object was originally const
    const int truly_const = 42;
    int* p = const_cast<int*>(&truly_const);  // Remove const
    *p = 100;  // ❌ UB - compiler may:
               //    - Place truly_const in read-only memory → segfault
               //    - Cache the value 42 → prints 42 not 100
               //    - Any other unpredictable behavior
}
```

**Best Practices Summary**

| Practice | Recommendation | Rationale |
|----------|---------------|-----------|
| ✅ Use `static_cast` for most conversions | Workhorse cast for related types | Explicit, compile-time checked |
| ✅ Use `dynamic_cast` for uncertain downcasts | Safety over performance | Prevents crashes from wrong types |
| ✅ Always check `dynamic_cast` result | Pointer: check `!= nullptr`<br>Reference: use try-catch | Failed cast must be handled |
| ✅ Use `const_cast` only for legacy APIs | And only if object is mutable | Avoid UB from modifying const |
| ✅ Use `memcpy` for type punning | Never `reinterpret_cast` for bit inspection | Avoids strict aliasing violations |
| ✅ Use `reinterpret_cast` only for pointer↔integer | And hardware interfacing | Clearly signals low-level operation |
| ❌ Never use C-style casts in C++ | Ambiguous and dangerous | Use specific C++ cast operators |
| ❌ Never modify truly const objects | Always undefined behavior | No exceptions to this rule |
| ❌ Don't `dynamic_cast` in hot loops | Has runtime cost | Profile first, optimize if needed |
| ✅ Add `virtual ~Base()` to enable `dynamic_cast` | Minimal requirement for RTTI | Virtual destructor is good practice anyway |

### EDGE_CASES: Tricky Scenarios and Undefined Behavior

#### Edge Case 1: static_cast Downcast Without Runtime Check

static_cast can downcast pointers in an inheritance hierarchy, but it performs **no runtime checking**. If the object isn't actually of the derived type, behavior is undefined.

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
    Base* b1 = new Derived();
    Derived* d1 = static_cast<Derived*>(b1);  // ✅ Safe - actually Derived
    std::cout << d1->derived_val << "\n";      // 20
    
    Base* b2 = new Base();
    Derived* d2 = static_cast<Derived*>(b2);   // ❌ UB - not actually Derived!
    // std::cout << d2->derived_val << "\n";   // Undefined behavior
}
```

This demonstrates why static_cast downcasts are dangerous without additional knowledge. Always prefer dynamic_cast when the object's actual type is uncertain.

#### Edge Case 2: dynamic_cast Requires Polymorphic Types

dynamic_cast only works with polymorphic types (classes with at least one virtual function). Without virtual functions, it won't compile.

```cpp
struct NonPolymorphic {
    int value;
};

struct PolymorphicBase {
    virtual ~PolymorphicBase() { }
    int value;
};

struct DerivedPoly : PolymorphicBase { };

int main() {
    NonPolymorphic* np = new NonPolymorphic();
    // auto* x = dynamic_cast<NonPolymorphic*>(np);  // ❌ Compile error
    
    PolymorphicBase* pb = new DerivedPoly();
    auto* dp = dynamic_cast<DerivedPoly*>(pb);        // ✅ OK - polymorphic
}
```

The requirement for virtual functions ensures RTTI is available for runtime type checking. Without it, dynamic_cast cannot verify types.

#### Edge Case 3: dynamic_cast with References Throws Exception

When dynamic_cast fails on a reference (as opposed to a pointer), it throws std::bad_cast instead of returning nullptr.

```cpp
#include <iostream>
#include <typeinfo>

struct Base {
    virtual ~Base() { }
};

struct Derived : Base { };

int main() {
    Base b;
    
    try {
        Derived& d = dynamic_cast<Derived&>(b);  // Throws std::bad_cast
    } catch (const std::bad_cast& e) {
        std::cout << "Cast failed: " << e.what() << "\n";
    }
    
    Base* pb = &b;
    Derived* pd = dynamic_cast<Derived*>(pb);    // Returns nullptr (no throw)
    if (!pd) {
        std::cout << "Pointer cast failed\n";
    }
}
```

The different failure modes (exception vs nullptr) reflect the fact that references cannot be null, so there's no way to signal failure except through exceptions.

#### Edge Case 4: const_cast on Actually Const Objects

Using const_cast to modify an object that was originally declared const leads to undefined behavior, even if the code compiles.

```cpp
#include <iostream>

void modifyValue(const int* ptr) {
    int* mutable_ptr = const_cast<int*>(ptr);
    *mutable_ptr = 100;  // May work or may crash
}

int main() {
    const int truly_const = 42;
    modifyValue(&truly_const);  // ❌ Undefined behavior
    
    // Compiler may place truly_const in read-only memory
    // Attempting to modify causes a segmentation fault on many platforms
    
    int originally_mutable = 50;
    const int* ptr = &originally_mutable;
    modifyValue(ptr);  // ✅ OK - object wasn't originally const
    std::cout << originally_mutable << "\n";  // 100
}
```

The undefined behavior occurs because the compiler may optimize based on const-correctness, potentially placing const objects in read-only memory sections or caching their values.

#### Edge Case 5: reinterpret_cast and Strict Aliasing

reinterpret_cast can violate the strict aliasing rule, which states that an object of one type shouldn't be accessed through a pointer of an unrelated type.

```cpp
#include <iostream>
#include <cstdint>

int main() {
    float f = 3.14f;
    
    // ❌ Violates strict aliasing - undefined behavior
    int* ip = reinterpret_cast<int*>(&f);
    std::cout << *ip << "\n";  // Reading float bits as int - UB
    
    // ✅ Correct way: use memcpy or type punning with union (C++20)
    int i;
    std::memcpy(&i, &f, sizeof(float));
    std::cout << i << "\n";  // Safe way to read bit pattern
}
```

Modern compilers aggressively optimize based on strict aliasing, so violating it can lead to unexpected results where the compiler assumes memory won't change in ways it doesn't track.

#### Edge Case 6: reinterpret_cast Pointer Arithmetic and Alignment

reinterpret_cast doesn't adjust pointer values for different object sizes or alignment requirements, potentially causing misaligned access.

```cpp
#include <iostream>
#include <cstdint>

struct SmallStruct {
    char c;
};

struct LargeStruct {
    double d;
    int i;
};

int main() {
    SmallStruct s;
    
    // ❌ Dangerous - LargeStruct* assumes 16-byte aligned, may not be
    LargeStruct* lp = reinterpret_cast<LargeStruct*>(&s);
    // lp->d = 3.14;  // May cause misaligned access - UB
    
    // Pointer-to-integer must use wide enough type
    std::uintptr_t addr = reinterpret_cast<std::uintptr_t>(&s);  // ✅ Safe
    // int wrong = reinterpret_cast<int>(&s);  // ❌ May truncate on 64-bit
}
```

Misaligned access can cause crashes on some architectures (like older ARM) or performance penalties on others (x86 handles it but slower).

#### Edge Case 7: static_cast vs reinterpret_cast with void*

static_cast can convert to/from void* safely with type information preserved, while reinterpret_cast is more dangerous and loses type safety.

```cpp
#include <iostream>

int main() {
    int x = 42;
    
    // ✅ static_cast: type-safe roundtrip
    void* vp1 = static_cast<void*>(&x);
    int* ip1 = static_cast<int*>(vp1);
    std::cout << *ip1 << "\n";  // 42
    
    // ✅ reinterpret_cast: works but less safe
    void* vp2 = reinterpret_cast<void*>(&x);
    int* ip2 = reinterpret_cast<int*>(vp2);
    std::cout << *ip2 << "\n";  // 42
    
    // ❌ Dangerous: wrong type conversion
    float* fp = reinterpret_cast<float*>(vp2);
    std::cout << *fp << "\n";  // Interprets int bits as float - UB
}
```

With void*, both casts work for correct type roundtrips, but static_cast is preferred because it conveys intent better and works with more type checking.

#### Edge Case 8: Multiple Inheritance and Pointer Adjustment

static_cast properly adjusts pointer offsets for multiple inheritance, while reinterpret_cast does not, leading to incorrect addresses.

```cpp
#include <iostream>

struct A {
    int a = 1;
    virtual ~A() { }
};

struct B {
    int b = 2;
    virtual ~B() { }
};

struct C : A, B {
    int c = 3;
};

int main() {
    C obj;
    C* cp = &obj;
    
    // ✅ static_cast adjusts pointer offset
    B* bp1 = static_cast<B*>(cp);
    std::cout << "B value: " << bp1->b << "\n";  // 2
    
    // ❌ reinterpret_cast doesn't adjust - wrong address!
    B* bp2 = reinterpret_cast<B*>(cp);
    std::cout << "Wrong B: " << bp2->b << "\n";  // Undefined behavior
}
```

With multiple inheritance, derived class objects have subobjects of each base class at different memory offsets. static_cast knows about this and adjusts pointers; reinterpret_cast blindly reinterprets the address.

#### Edge Case 9: Cross-Casting with dynamic_cast

dynamic_cast can perform **cross-casts** between sibling classes in an inheritance hierarchy, something static_cast cannot do.

```cpp
#include <iostream>

struct Base {
    virtual ~Base() { }
};

struct Derived1 : Base {
    void func1() { std::cout << "Derived1\n"; }
};

struct Derived2 : Base {
    void func2() { std::cout << "Derived2\n"; }
};

int main() {
    Derived1 d1;
    Base* bp = &d1;
    
    // ❌ static_cast cannot cross-cast (compile error)
    // Derived2* d2_ptr = static_cast<Derived2*>(bp);
    
    // ✅ dynamic_cast safely returns nullptr for invalid cross-cast
    Derived2* d2_ptr = dynamic_cast<Derived2*>(bp);
    if (!d2_ptr) {
        std::cout << "Cross-cast failed (expected)\n";
    }
    
    // ✅ Cast to actual type succeeds
    Derived1* d1_ptr = dynamic_cast<Derived1*>(bp);
    if (d1_ptr) {
        d1_ptr->func1();
    }
}
```

Cross-casting is useful in complex hierarchies, especially with multiple inheritance or virtual inheritance, where you need to navigate between different parts of an object's hierarchy.

#### Edge Case 10: Casting Function Pointers

reinterpret_cast can cast between function pointer types, but calling through an incorrect function pointer type is undefined behavior.

```cpp
#include <iostream>

void funcInt(int x) {
    std::cout << "funcInt: " << x << "\n";
}

void funcDouble(double d) {
    std::cout << "funcDouble: " << d << "\n";
}

int main() {
    void (*fp_int)(int) = &funcInt;
    
    // ❌ Dangerous: casting function pointer to incompatible type
    void (*fp_double)(double) = reinterpret_cast<void(*)(double)>(fp_int);
    
    // fp_double(3.14);  // ❌ Undefined behavior - calling through wrong type
    
    // ✅ Cast back to correct type before calling
    void (*fp_back)(int) = reinterpret_cast<void(*)(int)>(fp_double);
    fp_back(42);  // OK
}
```

Function pointer casts are sometimes needed for callbacks or legacy APIs, but the function must be called through its original signature to avoid undefined behavior.

### CODE_EXAMPLES: Practical Demonstrations

#### Example 1: Safe Numeric Conversion with static_cast

```cpp
#include <iostream>
#include <limits>

int main() {
    // Integer to floating-point (always safe)
    int i = 42;
    double d = static_cast<double>(i);
    std::cout << "int to double: " << d << "\n";  // 42.0
    
    // Floating-point to integer (truncates)
    double pi = 3.14159;
    int truncated = static_cast<int>(pi);
    std::cout << "double to int: " << truncated << "\n";  // 3
    
    // Potential overflow warning
    double large = 1e100;
    int overflow = static_cast<int>(large);  // ❌ Undefined if out of range
    std::cout << "overflow: " << overflow << "\n";  // Undefined result
}
```

static_cast makes numeric conversions explicit and visible. While it doesn't prevent narrowing or overflow, it signals that the conversion is intentional, unlike silent implicit conversions.

#### Example 2: Safe Downcasting with dynamic_cast

```cpp
#include <iostream>
#include <vector>
#include <memory>

struct Animal {
    virtual ~Animal() { }
    virtual void makeSound() = 0;
};

struct Dog : Animal {
    void makeSound() override { std::cout << "Woof!\n"; }
    void fetch() { std::cout << "Fetching ball!\n"; }
};

struct Cat : Animal {
    void makeSound() override { std::cout << "Meow!\n"; }
    void scratch() { std::cout << "Scratching furniture!\n"; }
};

void interact(Animal* animal) {
    animal->makeSound();
    
    // Try to downcast to Dog
    if (Dog* dog = dynamic_cast<Dog*>(animal)) {
        dog->fetch();
    }
    // Try to downcast to Cat
    else if (Cat* cat = dynamic_cast<Cat*>(animal)) {
        cat->scratch();
    }
}

int main() {
    std::vector<Animal*> animals = {
        new Dog(),
        new Cat(),
        new Dog()
    };
    
    for (Animal* animal : animals) {
        interact(animal);
        delete animal;
    }
}
```

This pattern is common when working with polymorphic hierarchies where you need type-specific behavior. dynamic_cast provides safe type identification without crashes.

#### Example 3: Interfacing with Legacy C APIs Using const_cast

```cpp
#include <iostream>
#include <cstring>

// Legacy C function that doesn't modify data but isn't marked const
extern "C" void legacy_process(char* data) {
    // Function only reads data but signature is wrong
    std::cout << "Processing: " << data << "\n";
}

void modern_function(const char* data) {
    // We know legacy_process won't modify data despite signature
    legacy_process(const_cast<char*>(data));
}

int main() {
    const char* message = "Hello, World!";
    modern_function(message);  // Safe because legacy_process only reads
}
```

This is the primary legitimate use case for const_cast: interfacing with const-incorrect APIs where you have external knowledge that the function won't actually modify the data.

#### Example 4: Pointer-to-Integer Conversion with reinterpret_cast

```cpp
#include <iostream>
#include <cstdint>

int main() {
    int value = 42;
    int* ptr = &value;
    
    // Convert pointer to integer (must use uintptr_t for portability)
    std::uintptr_t addr = reinterpret_cast<std::uintptr_t>(ptr);
    std::cout << "Address: 0x" << std::hex << addr << "\n";
    
    // Convert back to pointer
    int* restored = reinterpret_cast<int*>(addr);
    std::cout << "Value: " << std::dec << *restored << "\n";  // 42
    
    // Use case: storing pointers in hash tables or for alignment checks
    if (addr % sizeof(int) == 0) {
        std::cout << "Pointer is properly aligned\n";
    }
}
```

Pointer-to-integer conversions are useful for debugging, logging addresses, implementing custom memory allocators, or checking alignment. Always use std::uintptr_t for portability across 32-bit and 64-bit systems.

#### Example 5: Upcast and Downcast Comparison

```cpp
#include <iostream>

struct Base {
    virtual ~Base() { }
    void baseMethod() { std::cout << "Base method\n"; }
};

struct Derived : Base {
    void derivedMethod() { std::cout << "Derived method\n"; }
};

int main() {
    Derived d;
    
    // ✅ Upcast (always safe, implicit)
    Base* bp1 = &d;                     // Implicit
    Base* bp2 = static_cast<Base*>(&d); // Explicit (unnecessary)
    bp1->baseMethod();
    
    // ✅ Downcast with dynamic_cast (runtime check)
    Base* bp3 = new Derived();
    if (Derived* dp1 = dynamic_cast<Derived*>(bp3)) {
        dp1->derivedMethod();  // Safe
    }
    
    // ❌ Downcast with static_cast (no check, dangerous)
    Base* bp4 = new Base();  // Not actually Derived!
    Derived* dp2 = static_cast<Derived*>(bp4);  // Compiles but wrong
    // dp2->derivedMethod();  // ❌ Undefined behavior
    
    delete bp3;
    delete bp4;
}
```

This example shows the key difference: upcasts are always safe (derived IS-A base), while downcasts need runtime checking (base might not actually be derived).

#### Example 6: Bit Pattern Inspection with reinterpret_cast

```cpp
#include <iostream>
#include <iomanip>
#include <cstring>

void printBytes(const void* ptr, size_t size) {
    const unsigned char* bytes = static_cast<const unsigned char*>(ptr);
    for (size_t i = 0; i < size; ++i) {
        std::cout << std::hex << std::setfill('0') << std::setw(2)
                  << static_cast<int>(bytes[i]) << " ";
    }
    std::cout << std::dec << "\n";
}

int main() {
    float f = 3.14f;
    int i = 42;
    double d = 2.71828;
    
    std::cout << "Float bit pattern: ";
    printBytes(&f, sizeof(f));
    
    std::cout << "Int bit pattern: ";
    printBytes(&i, sizeof(i));
    
    std::cout << "Double bit pattern: ";
    printBytes(&d, sizeof(d));
    
    // ✅ Safe way to reinterpret without aliasing issues
    int float_bits;
    std::memcpy(&float_bits, &f, sizeof(f));
    std::cout << "Float as int: " << float_bits << "\n";
}
```

This demonstrates how to inspect bit patterns safely without violating strict aliasing. memcpy is the portable way to reinterpret bits.

#### Example 7: Virtual Inheritance and dynamic_cast

```cpp
#include <iostream>

struct Base {
    virtual ~Base() { }
    int base_value = 10;
};

struct MiddleA : virtual Base {
    int middle_a = 20;
};

struct MiddleB : virtual Base {
    int middle_b = 30;
};

struct Derived : MiddleA, MiddleB {
    int derived_value = 40;
};

int main() {
    Derived d;
    
    // With virtual inheritance, Base appears only once in Derived
    Base* bp = static_cast<Base*>(&d);
    
    // ✅ dynamic_cast can navigate virtual inheritance
    MiddleA* ma = dynamic_cast<MiddleA*>(bp);
    if (ma) {
        std::cout << "Cast to MiddleA succeeded: " << ma->middle_a << "\n";
    }
    
    // ✅ Cross-cast through virtual base
    MiddleB* mb = dynamic_cast<MiddleB*>(ma);
    if (mb) {
        std::cout << "Cross-cast to MiddleB succeeded: " << mb->middle_b << "\n";
    }
}
```

Virtual inheritance creates complex object layouts where dynamic_cast's runtime type information is essential for navigating the hierarchy correctly.

#### Example 8: const_cast for Implementing Logical Constness

```cpp
#include <iostream>
#include <string>

class Database {
    mutable bool cache_valid = false;
    mutable std::string cached_data;
    
    void updateCache() const {
        // Mutable members allow modification in const methods
        cached_data = "Expensive query result";
        cache_valid = true;
    }
    
public:
    // Const method that maintains logical constness through caching
    const std::string& getData() const {
        if (!cache_valid) {
            updateCache();  // OK - modifies mutable members
        }
        return cached_data;
    }
    
    // Alternative without mutable: use const_cast (less clean)
    const std::string& getData_alternative() const {
        if (!cache_valid) {
            Database* mutable_this = const_cast<Database*>(this);
            mutable_this->cached_data = "Query result";
            mutable_this->cache_valid = true;
        }
        return cached_data;
    }
};

int main() {
    const Database db;
    std::cout << db.getData() << "\n";  // Caches internally despite const
}
```

This shows the concept of **logical constness** where the observable state doesn't change even though internal state (caches) may be modified. Using `mutable` is cleaner than const_cast for this pattern.

#### Example 9: Autonomous Vehicle - Sensor Hardware Integration with Cast Operators

This comprehensive example demonstrates all four C++ cast operators in a real autonomous vehicle sensor processing context, showing hardware interfacing, type-safe downcasting, legacy C API integration, and direct memory access.

```cpp
#include <iostream>
#include <vector>
#include <memory>
#include <cstdint>
#include <cstring>
#include <iomanip>

// ============================================================================
// Part 1: Polymorphic Sensor Hierarchy (dynamic_cast, static_cast)
// ============================================================================

class Sensor {
protected:
    std::string sensor_id;
    bool is_initialized;
    uint64_t timestamp_ns;

public:
    Sensor(const std::string& id)
        : sensor_id(id), is_initialized(false), timestamp_ns(0) {}

    virtual ~Sensor() = default;

    virtual void readData() = 0;
    virtual std::string getType() const = 0;

    const std::string& getID() const { return sensor_id; }
    bool isInitialized() const { return is_initialized; }
    uint64_t getTimestamp() const { return timestamp_ns; }
};

class LiDARSensor : public Sensor {
    int num_beams;
    double max_range_m;
    std::vector<double> point_cloud;

public:
    LiDARSensor(const std::string& id, int beams, double range)
        : Sensor(id), num_beams(beams), max_range_m(range) {}

    void readData() override {
        point_cloud.clear();
        for (int i = 0; i < 10; ++i) {  // Simulate reading
            point_cloud.push_back(static_cast<double>(i) * 0.5);
        }
        is_initialized = true;
        timestamp_ns = 1000000000ULL;  // Simulated timestamp
    }

    std::string getType() const override { return "LiDAR"; }

    const std::vector<double>& getPointCloud() const { return point_cloud; }
    int getBeamCount() const { return num_beams; }
};

class CameraSensor : public Sensor {
    int width, height;
    std::vector<uint8_t> image_data;

public:
    CameraSensor(const std::string& id, int w, int h)
        : Sensor(id), width(w), height(h) {}

    void readData() override {
        image_data.resize(width * height, 128);  // Gray image
        is_initialized = true;
        timestamp_ns = 1000000000ULL;
    }

    std::string getType() const override { return "Camera"; }

    int getWidth() const { return width; }
    int getHeight() const { return height; }
    const std::vector<uint8_t>& getImageData() const { return image_data; }
};

class IMUSensor : public Sensor {
    double accel_x, accel_y, accel_z;
    double gyro_x, gyro_y, gyro_z;

public:
    IMUSensor(const std::string& id) : Sensor(id) {}

    void readData() override {
        accel_x = 0.1; accel_y = 0.05; accel_z = 9.81;
        gyro_x = 0.001; gyro_y = -0.002; gyro_z = 0.0005;
        is_initialized = true;
        timestamp_ns = 1000000000ULL;
    }

    std::string getType() const override { return "IMU"; }

    void getAcceleration(double& x, double& y, double& z) const {
        x = accel_x; y = accel_y; z = accel_z;
    }
};

// ============================================================================
// Part 2: Hardware Memory-Mapped Registers (reinterpret_cast)
// ============================================================================

// Simulated hardware register layout for sensor controller
struct SensorControllerRegisters {
    volatile uint32_t control;       // Offset 0x00: Control register
    volatile uint32_t status;        // Offset 0x04: Status register
    volatile uint32_t data_addr;     // Offset 0x08: Data buffer address
    volatile uint32_t data_length;   // Offset 0x0C: Data length
};

class HardwareInterface {
    void* hw_base_address;  // Simulated hardware address
    SensorControllerRegisters dummy_registers;  // For simulation

public:
    HardwareInterface() {
        // In real code, hw_base_address would be mapped from physical memory
        // For simulation, we use our dummy registers
        hw_base_address = &dummy_registers;

        // Initialize dummy registers
        dummy_registers.control = 0;
        dummy_registers.status = 0x1;  // Ready status
        dummy_registers.data_addr = 0;
        dummy_registers.data_length = 0;
    }

    // Use reinterpret_cast to access memory-mapped hardware registers
    void initializeController() {
        std::cout << "\n=== Hardware Register Access (reinterpret_cast) ===\n";

        // reinterpret_cast: treating memory as hardware register structure
        SensorControllerRegisters* regs =
            reinterpret_cast<SensorControllerRegisters*>(hw_base_address);

        std::cout << "Hardware base address: 0x" << std::hex
                  << reinterpret_cast<uintptr_t>(hw_base_address) << std::dec << "\n";

        // Write to control register to initialize hardware
        regs->control = 0x01;  // Enable bit
        std::cout << "Control register: 0x" << std::hex << regs->control << std::dec << "\n";
        std::cout << "Status register: 0x" << std::hex << regs->status << std::dec << "\n";
    }

    // Convert pointer to integer for address calculation/alignment checks
    void checkAlignment() {
        std::cout << "\n=== Pointer-to-Integer Conversion (reinterpret_cast) ===\n";

        // reinterpret_cast: pointer → integer for address arithmetic
        uintptr_t addr = reinterpret_cast<uintptr_t>(hw_base_address);

        std::cout << "Address: 0x" << std::hex << addr << std::dec << "\n";
        std::cout << "Aligned to 4 bytes: " << ((addr % 4 == 0) ? "Yes" : "No") << "\n";
        std::cout << "Aligned to 8 bytes: " << ((addr % 8 == 0) ? "Yes" : "No") << "\n";
    }
};

// ============================================================================
// Part 3: Legacy C API Integration (const_cast)
// ============================================================================

// Legacy C function that doesn't use const (const-incorrect signature)
extern "C" void legacy_sensor_log(char* sensor_name, char* message) {
    // This function only reads the strings but signature lacks const
    std::cout << "[Legacy Log] Sensor: " << sensor_name
              << ", Message: " << message << "\n";
}

class LegacyAPIBridge {
public:
    static void logSensorData(const std::string& sensor_name,
                              const std::string& message) {
        std::cout << "\n=== Legacy C API Integration (const_cast) ===\n";

        // const_cast: Remove const to interface with const-incorrect legacy API
        // Safe because legacy_sensor_log only reads the data
        char* name_ptr = const_cast<char*>(sensor_name.c_str());
        char* msg_ptr = const_cast<char*>(message.c_str());

        legacy_sensor_log(name_ptr, msg_ptr);

        std::cout << "Successfully called legacy API with const data\n";
    }
};

// ============================================================================
// Part 4: Safe Type Punning for Bit Inspection (memcpy, not reinterpret_cast)
// ============================================================================

class BitPatternInspector {
public:
    static void inspectFloatBits(float value) {
        std::cout << "\n=== Safe Bit Pattern Inspection ===\n";
        std::cout << "Float value: " << value << "\n";

        // ❌ WRONG: reinterpret_cast violates strict aliasing
        // int* wrong_ptr = reinterpret_cast<int*>(&value);
        // int wrong_bits = *wrong_ptr;  // Undefined behavior!

        // ✅ CORRECT: Use memcpy for type punning (avoids strict aliasing)
        uint32_t bits;
        std::memcpy(&bits, &value, sizeof(value));

        std::cout << "Bit pattern: 0x" << std::hex << std::setfill('0')
                  << std::setw(8) << bits << std::dec << "\n";

        // Extract IEEE 754 components
        uint32_t sign = (bits >> 31) & 0x1;
        uint32_t exponent = (bits >> 23) & 0xFF;
        uint32_t mantissa = bits & 0x7FFFFF;

        std::cout << "Sign: " << sign << "\n";
        std::cout << "Exponent: " << exponent << " (biased)\n";
        std::cout << "Mantissa: 0x" << std::hex << mantissa << std::dec << "\n";
    }
};

// ============================================================================
// Part 5: Sensor Manager with Safe Downcasting (dynamic_cast vs static_cast)
// ============================================================================

class SensorManager {
    std::vector<std::shared_ptr<Sensor>> sensors;

public:
    void addSensor(std::shared_ptr<Sensor> sensor) {
        sensors.push_back(sensor);
    }

    void processAllSensors() {
        std::cout << "\n=== Safe Polymorphic Downcasting (dynamic_cast) ===\n";

        for (auto& sensor : sensors) {
            sensor->readData();
            std::cout << "\nProcessing " << sensor->getType()
                      << " sensor: " << sensor->getID() << "\n";

            // dynamic_cast: Safe runtime type checking for downcasting
            if (LiDARSensor* lidar = dynamic_cast<LiDARSensor*>(sensor.get())) {
                std::cout << "  LiDAR-specific: " << lidar->getBeamCount()
                          << " beams, " << lidar->getPointCloud().size()
                          << " points\n";
            }
            else if (CameraSensor* camera = dynamic_cast<CameraSensor*>(sensor.get())) {
                std::cout << "  Camera-specific: " << camera->getWidth()
                          << "x" << camera->getHeight() << " pixels\n";
            }
            else if (IMUSensor* imu = dynamic_cast<IMUSensor*>(sensor.get())) {
                double ax, ay, az;
                imu->getAcceleration(ax, ay, az);
                std::cout << "  IMU-specific: Accel(" << ax << ", "
                          << ay << ", " << az << ") m/s²\n";
            }
        }
    }

    // Demonstrate difference between static_cast and dynamic_cast
    void demonstrateCastDifference() {
        std::cout << "\n=== static_cast vs dynamic_cast Comparison ===\n";

        // Create base pointer to derived object
        Sensor* sensor = new LiDARSensor("lidar_test", 64, 100.0);
        sensor->readData();

        // ✅ dynamic_cast: Runtime check, safe
        LiDARSensor* lidar1 = dynamic_cast<LiDARSensor*>(sensor);
        if (lidar1) {
            std::cout << "dynamic_cast succeeded: " << lidar1->getBeamCount()
                      << " beams\n";
        } else {
            std::cout << "dynamic_cast failed (returned nullptr)\n";
        }

        // ✅ static_cast: No runtime check, faster but only safe if type is known
        LiDARSensor* lidar2 = static_cast<LiDARSensor*>(sensor);
        std::cout << "static_cast (no check): " << lidar2->getBeamCount()
                  << " beams\n";

        // Now try with wrong type
        Sensor* base_sensor = new IMUSensor("imu_test");
        base_sensor->readData();

        // ✅ dynamic_cast: Safely returns nullptr for wrong type
        LiDARSensor* wrong1 = dynamic_cast<LiDARSensor*>(base_sensor);
        if (!wrong1) {
            std::cout << "dynamic_cast correctly returned nullptr (IMU is not LiDAR)\n";
        }

        // ❌ static_cast: No check, would be undefined behavior if used
        // LiDARSensor* wrong2 = static_cast<LiDARSensor*>(base_sensor);
        // Using wrong2 would be undefined behavior!
        std::cout << "static_cast would compile but cause UB if used incorrectly\n";

        delete sensor;
        delete base_sensor;
    }
};

// ============================================================================
// Main: Demonstrating All Cast Operators in Autonomous Vehicle Context
// ============================================================================

int main() {
    std::cout << "=== Autonomous Vehicle Sensor System: C++ Cast Operators ===\n";

    // 1. Polymorphic sensor management with dynamic_cast
    SensorManager manager;
    manager.addSensor(std::make_shared<LiDARSensor>("lidar_front", 64, 100.0));
    manager.addSensor(std::make_shared<CameraSensor>("camera_front", 1920, 1080));
    manager.addSensor(std::make_shared<IMUSensor>("imu_main"));

    manager.processAllSensors();
    manager.demonstrateCastDifference();

    // 2. Hardware memory-mapped register access with reinterpret_cast
    HardwareInterface hw_interface;
    hw_interface.initializeController();
    hw_interface.checkAlignment();

    // 3. Legacy C API integration with const_cast
    LegacyAPIBridge::logSensorData("LiDAR-Front", "Point cloud captured successfully");

    // 4. Safe bit pattern inspection for sensor data analysis
    BitPatternInspector::inspectFloatBits(9.81f);  // Gravity constant

    // 5. Demonstrate numeric conversions with static_cast
    std::cout << "\n=== Numeric Conversions (static_cast) ===\n";
    double sensor_temp_celsius = 45.7;
    int temp_rounded = static_cast<int>(sensor_temp_celsius);
    std::cout << "Sensor temperature: " << sensor_temp_celsius
              << "°C → " << temp_rounded << "°C (truncated)\n";

    // ADC reading: 12-bit value (0-4095) to voltage (0-5V)
    uint16_t adc_raw = 2048;
    double voltage = static_cast<double>(adc_raw) * (5.0 / 4095.0);
    std::cout << "ADC reading: " << adc_raw << " → " << voltage << "V\n";

    std::cout << "\n=== Summary: When to Use Each Cast ===\n";
    std::cout << "1. static_cast:       Numeric conversions, safe upcasts, known downcasts\n";
    std::cout << "2. dynamic_cast:      Safe polymorphic downcasting with runtime checks\n";
    std::cout << "3. const_cast:        Remove const for legacy API (use sparingly)\n";
    std::cout << "4. reinterpret_cast:  Hardware registers, pointer↔integer conversions\n";
    std::cout << "5. memcpy:            Safe bit-pattern inspection (not a cast, but essential)\n";

    return 0;
}
```

**Output:**
```
=== Autonomous Vehicle Sensor System: C++ Cast Operators ===

=== Safe Polymorphic Downcasting (dynamic_cast) ===

Processing LiDAR sensor: lidar_front
  LiDAR-specific: 64 beams, 10 points

Processing Camera sensor: camera_front
  Camera-specific: 1920x1080 pixels

Processing IMU sensor: imu_main
  IMU-specific: Accel(0.1, 0.05, 9.81) m/s²

=== static_cast vs dynamic_cast Comparison ===
dynamic_cast succeeded: 64 beams
static_cast (no check): 64 beams
dynamic_cast correctly returned nullptr (IMU is not LiDAR)
static_cast would compile but cause UB if used incorrectly

=== Hardware Register Access (reinterpret_cast) ===
Hardware base address: 0x7ffc8b3a1a20
Control register: 0x1
Status register: 0x1

=== Pointer-to-Integer Conversion (reinterpret_cast) ===
Address: 0x7ffc8b3a1a20
Aligned to 4 bytes: Yes
Aligned to 8 bytes: Yes

=== Legacy C API Integration (const_cast) ===
[Legacy Log] Sensor: LiDAR-Front, Message: Point cloud captured successfully
Successfully called legacy API with const data

=== Safe Bit Pattern Inspection ===
Float value: 9.81
Bit pattern: 0x411d70a4
Sign: 0
Exponent: 130 (biased)
Mantissa: 0x1d70a4

=== Numeric Conversions (static_cast) ===
Sensor temperature: 45.7°C → 45°C (truncated)
ADC reading: 2048 → 2.500305V

=== Summary: When to Use Each Cast ===
1. static_cast:       Numeric conversions, safe upcasts, known downcasts
2. dynamic_cast:      Safe polymorphic downcasting with runtime checks
3. const_cast:        Remove const for legacy API (use sparingly)
4. reinterpret_cast:  Hardware registers, pointer↔integer conversions
5. memcpy:            Safe bit-pattern inspection (not a cast, but essential)
```

**Real-World Applications:**

1. **dynamic_cast** - Essential for sensor management where you receive a base `Sensor*` pointer but need to access derived class functionality (LiDAR point clouds, camera images, IMU readings). The runtime type checking prevents crashes from incorrect type assumptions.

2. **static_cast** - Used for ADC conversions (raw 12-bit values → voltage → physical units), temperature unit conversions, and safe upcasting in the sensor hierarchy. When the type is known at compile time, static_cast provides zero-overhead conversions.

3. **const_cast** - Required when integrating with legacy automotive C libraries that lack proper const-correctness in their APIs. Many automotive safety standards (MISRA-C) now require const-correctness, but older code may not comply.

4. **reinterpret_cast** - Critical for accessing memory-mapped hardware registers (common in automotive ECUs - Electronic Control Units), checking pointer alignment requirements for DMA transfers, and converting between pointers and addresses for hardware debugging.

5. **memcpy (not a cast)** - The safe way to inspect bit patterns of sensor data (floats, doubles) without violating strict aliasing rules. Essential for implementing custom serialization or analyzing floating-point sensor readings at the bit level.

**Key Safety Principles:**
- **Always use dynamic_cast** when downcasting unless you're absolutely certain of the type and have profiling data showing it's a bottleneck
- **Never use reinterpret_cast** for type punning (accessing one type through a pointer to another) - use memcpy instead
- **Only use const_cast** when interfacing with const-incorrect APIs and you're certain the function won't modify the data
- **Prefer static_cast** for explicit conversions between related types (numeric, inheritance)
- **Avoid C-style casts** - they hide which operation is being performed and can silently do dangerous things

This example comprehensively demonstrates how all four C++ cast operators are used in production autonomous vehicle software, from high-level sensor polymorphism to low-level hardware interfacing.

### QUICK_REFERENCE: Answer Key and Summary Tables

#### Cast Operator Comparison

| Cast Type | Use Case | Compile-Time | Runtime Cost | Safety Level | Can Cast Away Const? |
|-----------|----------|--------------|--------------|--------------|---------------------|
| `static_cast` | Related type conversions, numeric, inheritance | ✅ Checked | None | Medium | ❌ No |
| `dynamic_cast` | Safe polymorphic downcasting/cross-casting | ✅ Checked | Small | High | ❌ No |
| `const_cast` | Add/remove const or volatile | ✅ Syntax only | None | Low | ✅ Yes |
| `reinterpret_cast` | Low-level bit reinterpretation | ⚠️ Minimal | None | Very Low | ❌ No |
| C-style cast | Don't use (ambiguous) | ❌ Minimal | Varies | Very Low | ✅ Yes (hidden) |

#### When to Use Each Cast

| Scenario | Recommended Cast | Alternative | Notes |
|----------|-----------------|-------------|-------|
| Numeric conversions | `static_cast<int>(double_val)` | Implicit | Make truncation explicit |
| Upcast in inheritance | Implicit / `static_cast` | None needed | Upcast always safe |
| Downcast (type certain) | `static_cast<Derived*>` | `dynamic_cast` | Use dynamic_cast if uncertain |
| Downcast (type uncertain) | `dynamic_cast<Derived*>` | Check & static_cast | Always check result for nullptr |
| Cross-cast in hierarchy | `dynamic_cast<Sibling*>` | N/A | Only dynamic_cast can cross-cast |
| Remove const for legacy API | `const_cast<T*>` | Avoid if possible | Ensure object is mutable |
| Pointer to integer | `reinterpret_cast<uintptr_t>` | N/A | Use uintptr_t for portability |
| Type punning / bit inspection | `memcpy` or `std::bit_cast` | Never reinterpret_cast | Avoid strict aliasing violations |
| Function pointer conversion | `reinterpret_cast` | Avoid if possible | Call through original type |

#### dynamic_cast Behavior

| Source Type | Target Type | Success Result | Failure Result |
|-------------|-------------|----------------|----------------|
| Pointer | Pointer | Valid pointer | `nullptr` |
| Reference | Reference | Valid reference | Throws `std::bad_cast` |
| Upcast | Always succeeds | N/A | N/A |
| Downcast | If type matches | `nullptr` / exception | |
| Cross-cast | If valid sibling | `nullptr` / exception | |

#### Common Casting Mistakes

| Mistake | Why It's Wrong | Correct Approach |
|---------|---------------|------------------|
| `(Type)value` C-style cast | Ambiguous, hides operations | Use specific C++ cast operators |
| `static_cast<Derived*>` without type check | No runtime verification, UB if wrong | Use `dynamic_cast` and check result |
| `const_cast` then modify truly const | Undefined behavior | Only cast const-incorrect APIs |
| `reinterpret_cast` for type punning | Violates strict aliasing | Use `memcpy` or `std::bit_cast` |
| `reinterpret_cast` in inheritance | Doesn't adjust pointer offset | Use `static_cast` or `dynamic_cast` |
| Casting `nullptr` without checking | Dereferencing nullptr crashes | Always check pointer before use |
| `dynamic_cast` on non-polymorphic | Won't compile | Add virtual function to base |
| Casting away const then modifying | UB if originally const | Ensure object is mutable |

#### Cast Safety Checklist

| Question | Cast to Use |
|----------|-------------|
| Converting between numeric types? | `static_cast` |
| Need runtime type checking in hierarchy? | `dynamic_cast` |
| Interfacing with const-incorrect legacy code? | `const_cast` (verify object is mutable) |
| Converting pointer to integer or vice versa? | `reinterpret_cast` (use `uintptr_t`) |
| Need to inspect bit pattern safely? | `memcpy` or `std::bit_cast` (C++20) |
| Uncertain if downcast is valid? | `dynamic_cast` + nullptr check |
| Navigating complex multiple inheritance? | `dynamic_cast` for safety |
| Want maximum performance with known type? | `static_cast` (only if type guaranteed) |

#### Undefined Behavior Scenarios

| Code Pattern | Result | Fix |
|--------------|--------|-----|
| `const_cast` + modify truly const object | UB | Don't modify; ensure object is mutable |
| `static_cast<Derived*>` on Base object | UB when accessing derived members | Use `dynamic_cast` with check |
| `reinterpret_cast` + access through pointer | Violates strict aliasing → UB | Use `memcpy` for type punning |
| `reinterpret_cast` in inheritance hierarchy | Wrong pointer offset → UB | Use `static_cast` or `dynamic_cast` |
| Call through wrong function pointer type | UB due to ABI mismatch | Cast back to original type before calling |
| `static_cast` numeric overflow | Implementation-defined / UB | Check range before casting |

#### C++ Cast vs C-Style Cast Behavior

| Operation | C-Style Cast | C++ Cast Equivalent | Visibility |
|-----------|--------------|-------------------|-----------|
| Remove const | `(int*)const_ptr` | `const_cast<int*>` | Hidden vs Explicit |
| Numeric conversion | `(int)3.14` | `static_cast<int>` | Hidden vs Explicit |
| Pointer reinterpretation | `(char*)int_ptr` | `reinterpret_cast<char*>` | Hidden vs Explicit |
| Inheritance downcast | `(Derived*)base` | `static_cast<Derived*>` or `dynamic_cast` | Unsafe vs Checked |
| Multiple operations | Single cast | Multiple explicit casts | Hidden vs Clear |
