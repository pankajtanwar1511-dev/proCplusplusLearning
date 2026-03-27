## TOPIC: C++ Low-Level Internals and Common Pitfalls

### PRACTICE_TASKS: Output Prediction and Analysis Questions

#### Q1
```cpp
#include <iostream>
struct A {
    int x = 1;
    virtual void foo() { std::cout << "A::foo\n"; }
};
struct B : A {
    int y = 2;
    void foo() override { std::cout << "B::foo\n"; }
};
int main() {
    B b;
    A a = b;
    a.foo();
    std::cout << a.x;
}
```

**Answer:**
```
A::foo
1
```

**Explanation:**
- Object slicing occurs when assigning `B b` to `A a` by value
- Only the Base (A) part of b is copied; derived member `y` and vptr to B's vtable are lost
- `a` is a complete A object (not a B), so `a.foo()` calls A::foo (no polymorphism)
- `a.x` = 1 (copied from b.x which was initialized to 1)
- **Key Concept:** Value assignment slices derived objects; polymorphism requires pointers/references

#### Q2
```cpp
#include <iostream>
struct S {
    char a;
    int b;
    char c;
};
int main() {
    std::cout << sizeof(S);
}
```

**Answer:**
```
12
```

**Explanation:**
- Struct layout with padding for alignment:
  - `char a` (1 byte) + 3 padding bytes
  - `int b` (4 bytes, needs 4-byte alignment)
  - `char c` (1 byte) + 3 padding bytes
- Total: 1 + 3 + 4 + 1 + 3 = 12 bytes
- **Key Concept:** Struct padding ensures proper alignment; reordering members can reduce size

#### Q3
```cpp
#include <iostream>
#include <string>
const std::string& foo() {
    std::string s = "hello";
    return s;
}
int main() {
    const std::string& r = foo();
    std::cout << r;
}
```

**Answer:**
```
Undefined behavior (likely crash or garbage)
```

**Explanation:**
- Local variable `s` destroyed when `foo()` returns
- Returning reference to local variable creates dangling reference
- `r` references destroyed object (memory may be reused or unmapped)
- Accessing `r` is undefined behavior - may crash, print garbage, or appear to work
- **Key Concept:** Never return references to local variables; lifetimes don't extend beyond function scope

#### Q4
```cpp
#include <iostream>
struct A {
    int val = 10;
    void set(int v) const { val = v; }
};
int main() {
    const A a;
    a.set(20);
    std::cout << a.val;
}
```

**Answer:**
```
Compilation Error
```

**Explanation:**
- `set()` is declared const but attempts to modify member `val`
- Const member functions promise not to modify object state
- `val` needs `mutable` qualifier to allow modification in const functions
- Compiler error: "cannot assign to non-mutable member in const function"
- **Key Concept:** Const member functions cannot modify non-mutable members; enforced at compile time

#### Q5
```cpp
#include <iostream>
struct B {
    int* p;
    B(int v) : p(new int(v)) {}
    ~B() { delete p; }
};
int main() {
    B b1(5);
    B b2 = b1;
    std::cout << *b2.p;
}
```

**Answer:**
```
5 (but double delete crash at end)
```

**Explanation:**
- Default copy constructor performs shallow copy: b2.p = b1.p (same pointer)
- Prints 5 successfully
- When destructors run: b2 destructor deletes memory, then b1 destructor tries to delete same memory
- Double delete causes crash (undefined behavior)
- **Key Concept:** Shallow copy with heap-allocated members causes double delete; need custom copy constructor

#### Q6
```cpp
#include <iostream>
struct VBase { int v; };
struct A : virtual VBase { int a; };
struct B : virtual VBase { int b; };
struct C : A, B { int c; };
int main() {
    std::cout << sizeof(C);
}
```

**Answer:**
```
24-32 (platform dependent)
```

**Explanation:**
- Virtual inheritance adds virtual base table pointers (vbptr) to A and B
- Typical 64-bit layout: vbptr(8) + a(4) + padding(4) + vbptr(8) + b(4) + c(4) + v(4) + padding ≈ 32 bytes
- Exact size varies by compiler implementation and platform
- VBase shared: only one copy of v despite multiple inheritance paths
- **Key Concept:** Virtual inheritance has overhead (vbptrs) but solves diamond problem by sharing base

#### Q7
```cpp
#include <iostream>
struct Base {
    Base() { foo(); }
    virtual void foo() { std::cout << "Base\n"; }
};
struct Derived : Base {
    void foo() override { std::cout << "Derived\n"; }
};
int main() {
    Derived d;
}
```

**Answer:**
```
Base
```

**Explanation:**
- During Base's constructor, vptr still points to Base's vtable (Derived part not yet constructed)
- `foo()` resolves to Base::foo to prevent accessing uninitialized Derived members
- After Base constructor completes, vptr updated to Derived's vtable
- Construction order safety: base before derived
- **Key Concept:** Virtual functions called in constructors resolve to current class, not most derived

#### Q8
```cpp
#include <iostream>
struct S {
    int b;
    char a;
    char c;
};
int main() {
    std::cout << sizeof(S);
}
```

**Answer:**
```
8
```

**Explanation:**
- Optimized layout by reordering members:
  - `int b` (4 bytes)
  - `char a` (1 byte)
  - `char c` (1 byte)
  - 2 padding bytes
- Total: 4 + 1 + 1 + 2 = 8 bytes (better than Q2's 12 bytes)
- **Key Concept:** Member declaration order affects padding; group small members together to reduce struct size

#### Q9
```cpp
#include <iostream>
void test() {
    const int& r = 42;
    std::cout << r;
}
int main() {
    test();
}
```

**Answer:**
```
42
```

**Explanation:**
- Temporary literal `42` created
- Binding const reference to temporary extends temporary's lifetime to reference's scope
- `r` valid throughout `test()` function - temporary destroyed when r goes out of scope
- Prints 42 safely
- **Key Concept:** Const references extend lifetime of temporaries they bind to; safe pattern for initialization

#### Q10
```cpp
#include <iostream>
struct A {
    mutable int cache = 0;
    int get() const {
        cache = 100;
        return cache;
    }
};
int main() {
    const A a;
    std::cout << a.get();
}
```

**Answer:**
```
100
```

**Explanation:**
- `mutable` keyword allows modification of `cache` even in const member functions
- Useful for caching, lazy initialization, internal state that doesn't affect logical constness
- `cache` set to 100 and returned, prints 100
- No violation of const correctness - `mutable` explicitly marks exceptions
- **Key Concept:** mutable allows specific members to be modified in const contexts; useful for implementation details

---
#### Q11
```cpp
#include <iostream>
int main() {
    int* p = nullptr;
    *p = 5;
    std::cout << *p;
}
```

**Answer:**
```
Undefined behavior (likely segmentation fault)
```

**Explanation:**
- Dereferencing null pointer is undefined behavior
- `*p = 5` attempts to write to address 0 (protected memory)
- Operating system typically generates segmentation fault (SIGSEGV)
- Program crashes before reaching cout statement
- **Key Concept:** Null pointer dereference is UB; always check pointers before dereferencing

#### Q12
```cpp
#include <iostream>
int main() {
    unsigned int u = 4294967295u;  // UINT_MAX
    u = u + 1;
    std::cout << u;
}
```

**Answer:**
```
0
```

**Explanation:**
- Unsigned integer overflow is well-defined behavior (wraps around modulo 2^32)
- UINT_MAX (4294967295) + 1 = 0 (wraps to 0)
- Unlike signed overflow (UB), unsigned overflow follows modular arithmetic rules
- Result: 0
- **Key Concept:** Unsigned overflow wraps around (well-defined); signed overflow is undefined behavior

#### Q13
```cpp
#include <iostream>
struct Base {
    virtual ~Base() = default;
    int x = 1;
};
struct Derived : Base {
    int y = 2;
};
int main() {
    Derived* d = new Derived();
    Base* b = d;
    delete b;
    std::cout << "OK";
}
```

**Answer:**
```
OK
```

**Explanation:**
- Virtual destructor ensures correct cleanup when deleting through base pointer
- `delete b` calls Derived's destructor, then Base's destructor (proper chain)
- Without virtual destructor, only Base destructor would run (resource leak if Derived had resources)
- Prints "OK" after proper cleanup
- **Key Concept:** Virtual destructor essential for polymorphic deletion; ensures derived destructors called

#### Q14
```cpp
#include <iostream>
struct S {
    char a;
    double d;
    char b;
};
int main() {
    std::cout << sizeof(S);
}
```

**Answer:**
```
24
```

**Explanation:**
- Struct layout with double's strict alignment requirement:
  - `char a` (1 byte) + 7 padding bytes
  - `double d` (8 bytes, needs 8-byte alignment)
  - `char b` (1 byte) + 7 padding bytes
- Total: 1 + 7 + 8 + 1 + 7 = 24 bytes
- **Key Concept:** Larger types (double, long) require stricter alignment; causes more padding

#### Q15
```cpp
#include <iostream>
#include <memory>
struct A {
    std::unique_ptr<int> p;
    A(int v) : p(std::make_unique<int>(v)) {}
};
int main() {
    A a1(10);
    A a2 = std::move(a1);
    std::cout << *a2.p;
}
```

**Answer:**
```
10
```

**Explanation:**
- `unique_ptr` is move-only (non-copyable)
- `std::move(a1)` transfers ownership: a1.p set to nullptr, a2.p receives pointer
- a2.p points to int with value 10, prints 10
- a1.p now nullptr (accessing it would crash, but we don't)
- **Key Concept:** unique_ptr ownership transfer via move semantics; source pointer becomes null

#### Q16
```cpp
#include <iostream>
struct VBase {
    VBase() { std::cout << "VBase "; }
};
struct A : virtual VBase {
    A() { std::cout << "A "; }
};
struct B : virtual VBase {
    B() { std::cout << "B "; }
};
struct C : A, B {
    C() { std::cout << "C"; }
};
int main() {
    C c;
}
```

**Answer:**
```
VBase A B C
```

**Explanation:**
- Virtual inheritance: most derived class (C) constructs virtual base first
- Construction order: VBase (constructed once by C), then A, then B, then C
- Normal multiple inheritance would construct VBase twice (once via A, once via B)
- Virtual inheritance ensures single VBase instance shared by A and B
- **Key Concept:** Virtual base constructed first by most derived class; solves diamond duplication

#### Q17
```cpp
#include <iostream>
int main() {
    alignas(16) char x = 'A';
    std::cout << sizeof(x) << " " << alignof(decltype(x));
}
```

**Answer:**
```
1 16
```

**Explanation:**
- `sizeof(char)` always 1 byte (size unchanged)
- `alignas(16)` changes alignment requirement to 16 bytes
- `alignof(decltype(x))` reports 16 (alignment, not size)
- `x` stored at 16-byte aligned address, but still occupies 1 byte
- **Key Concept:** alignas changes alignment requirement without changing size; useful for SIMD/cache optimization

#### Q18
```cpp
#include <iostream>
struct A {
    const int* p;
    A(int v) : p(new int(v)) {}
    void set(int v) const {
        *p = v;
    }
};
int main() {
    const A a(10);
    a.set(20);
    std::cout << *a.p;
}
```

**Answer:**
```
Compilation Error
```

**Explanation:**
- `p` is `const int*` (pointer to const int), not `int* const` (const pointer to int)
- `const int*` means the pointed-to int is const, cannot be modified
- `*p = v` attempts to modify const data - compilation error
- Even though function is const, cannot modify const-qualified pointed-to data
- **Key Concept:** const int* means pointed-to data is const; different from mutable pointer

#### Q19
```cpp
#include <iostream>
struct Base {
    int x;
    virtual void foo() {}
};
struct D1 : Base {};
struct D2 : Base {};
struct Final : D1, D2 {};
int main() {
    Final f;
    f.x = 10;
}
```

**Answer:**
```
Compilation Error (ambiguous)
```

**Explanation:**
- Diamond problem without virtual inheritance
- Final inherits from D1 and D2, each inheriting from Base
- Final has TWO copies of Base (D1::Base and D2::Base)
- `f.x` is ambiguous: D1::Base::x or D2::Base::x?
- **Key Concept:** Diamond inheritance without virtual creates ambiguity; need virtual inheritance or explicit scope

#### Q20
```cpp
#include <iostream>
#include <string>
int main() {
    std::string s1 = "test";
    std::string s2 = s1;
    s2[0] = 'b';
    std::cout << s1 << " " << s2;
}
```

**Answer:**
```
test best
```

**Explanation:**
- `std::string` has proper copy constructor performing deep copy
- s2 gets its own copy of the string data (separate heap allocation)
- Modifying s2[0] doesn't affect s1 (independent strings)
- Prints: "test best"
- **Key Concept:** std::string implements Rule of Three/Five correctly; deep copy prevents shared state issues

---
