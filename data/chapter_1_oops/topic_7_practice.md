## TOPIC: C++ Object-Oriented Programming - Complete Interview Guide

### PRACTICE_TASKS: Mixed OOP Concept Output Prediction

#### Q1
```cpp
#include <iostream>

struct S {
    int x;
};

class C {
    int x;
};

int main() {
    S s;
    s.x = 10;

    C c;
    c.x = 20;
}
```

**Answer:**
```
Compilation Error
```

**Explanation:**
- `struct S`: members public by default - s.x accessible
- `class C`: members private by default - c.x NOT accessible
- Error at `c.x = 20;` (private member access)
- **Key Concept:** struct vs class only differ in default access specifier (public vs private)

#### Q2
```cpp
#include <iostream>

class Base {
public:
    virtual void func() { std::cout << "Base\n"; }
};

class Derived : public Base {
public:
    void func() { std::cout << "Derived\n"; }
};

int main() {
    Base* b = new Derived();
    b->func();
    delete b;
}
```

**Answer:**
```
Derived
```

**Explanation:**
- Virtual function enables runtime polymorphism
- b points to Derived object
- b->func() dispatches to Derived::func()
- Virtual destructor should be added for proper cleanup
- **Key Concept:** Virtual functions enable dynamic dispatch through base pointers

#### Q3
```cpp
#include <iostream>

class A {
public:
    A() { std::cout << "A\n"; }
    A(const A&) { std::cout << "Copy A\n"; }
    A(A&&) noexcept { std::cout << "Move A\n"; }
};

A create() {
    return A();
}

int main() {
    A a = create();
}
```

**Answer:**
```
A
```

**Explanation:**
- RVO (Return Value Optimization) applies
- Object constructed directly in a's location
- Neither copy nor move constructor called
- C++17 guaranteed copy elision
- **Key Concept:** RVO bypasses both copy and move constructors for efficiency

#### Q4
```cpp
#include <iostream>

class Base {
public:
    ~Base() { std::cout << "~Base\n"; }
};

class Derived : public Base {
public:
    ~Derived() { std::cout << "~Derived\n"; }
};

int main() {
    Base* ptr = new Derived();
    delete ptr;
}
```

**Answer:**
```
~Base
```

**Explanation:**
- Non-virtual destructor in Base
- delete ptr only calls ~Base(), skips ~Derived()
- Undefined behavior: Derived resources leak
- Memory leak and potential corruption
- **Key Concept:** Always use virtual destructor in polymorphic base classes

#### Q5
```cpp
#include <iostream>

class A {
public:
    virtual void func() = 0;
};

int main() {
    A a;
}
```

**Answer:**
```
Compilation Error
```

**Explanation:**
- A is abstract class (has pure virtual function)
- Cannot instantiate abstract classes
- Error: cannot declare variable 'a' to be of abstract type
- Can only create pointers/references to abstract types
- **Key Concept:** Abstract classes cannot be instantiated directly

#### Q6
```cpp
#include <iostream>

class A {
public:
    A(const A&) { std::cout << "Copy\n"; }
};

int main() {
    A a1;
    A a2 = a1;
    a2 = a1;
}
```

**Answer:**
```
Compilation Error
```

**Explanation:**
- User-defined copy constructor suppresses default constructor
- `A a1;` requires default constructor - ERROR
- No default constructor available
- Need to add `A() = default;` or `A() {}`
- **Key Concept:** Declaring any constructor suppresses compiler-generated default constructor

#### Q7
```cpp
#include <iostream>

class Base {
public:
    virtual void func() { std::cout << "Base\n"; }
};

class Derived : public Base {
public:
    void func() override { std::cout << "Derived\n"; }
};

int main() {
    Derived d;
    Base b = d;
    b.func();
}
```

**Answer:**
```
Base
```

**Explanation:**
- Object slicing: Derived copied as Base by value
- b is type Base (not pointer/reference) - no polymorphism
- Virtual function doesn't apply to value objects
- Only Base portion copied
- **Key Concept:** Pass by value causes slicing; use pointers/references for polymorphism

#### Q8
```cpp
#include <iostream>

class A {
    int* data;
public:
    A() : data(new int(42)) {}
    ~A() { delete data; }
};

int main() {
    A a1;
    A a2 = a1;
}
```

**Answer:**
```
(no output, but undefined behavior/crash likely)
```

**Explanation:**
- Compiler-generated copy constructor does shallow copy
- Both a1.data and a2.data point to same memory
- Double delete when both destructors run
- Undefined behavior: crash or corruption
- **Key Concept:** Rule of Three: define destructor → must define copy constructor

#### Q9
```cpp
#include <iostream>

class A {
public:
    A(A&&) { std::cout << "Move\n"; }
};

int main() {
    A a1;
    A a2 = a1;
}
```

**Answer:**
```
Compilation Error
```

**Explanation:**
- Move constructor declared, suppresses default constructor
- `A a1;` requires default constructor - ERROR
- User-defined move also suppresses copy constructor
- Even if a1 existed, `A a2 = a1;` would fail (no copy constructor)
- **Key Concept:** Declaring move constructor suppresses default and copy constructors

#### Q10
```cpp
#include <iostream>

class A {
private:
    ~A() {}
public:
    static A* create() { return new A(); }
    void destroy() { delete this; }
};

int main() {
    A* a = A::create();
    a->destroy();
}
```

**Answer:**
```
(no output)
```

**Explanation:**
- Private destructor prevents direct deletion and stack allocation
- Factory pattern enforces heap allocation only
- destroy() member function can call private destructor
- Forces controlled resource management
- **Key Concept:** Private destructor enforces factory pattern and prevents misuse

#### Q11
```cpp
#include <iostream>

class A {
public:
    A() = default;
    A(const A&) = delete;
};

A get() {
    return A();
}

int main() {
    A a = get();
}
```

**Answer:**
```
(no output)
```

**Explanation:**
- Copy constructor deleted but code compiles!
- C++17 guaranteed copy elision applies
- Object constructed directly in place
- No copy operation performed
- **Key Concept:** Copy elision allows returning non-copyable types by value

#### Q12
```cpp
#include <iostream>

class A {
public:
    A& operator=(const A&) {
        std::cout << "Copy assign\n";
        return *this;
    }
};

int main() {
    A a1, a2;
    a1 = std::move(a2);
}
```

**Answer:**
```
Copy assign
```

**Explanation:**
- No move assignment operator defined
- std::move(a2) converts to rvalue
- Copy assignment selected (accepts const lvalue ref binds to rvalue)
- Move semantics not utilized
- **Key Concept:** std::move without move assignment operator falls back to copy assignment

#### Q13
```cpp
#include <iostream>

class Base {
public:
    virtual ~Base() = default;
    virtual void func() = 0;
};

class Derived : public Base {
public:
    void func() override { std::cout << "Derived\n"; }
};

int main() {
    Base* b = new Derived();
    b->func();
    delete b;
}
```

**Answer:**
```
Derived
```

**Explanation:**
- Abstract base with pure virtual function
- Derived provides implementation
- Virtual function dispatch works correctly
- Virtual destructor ensures proper cleanup
- **Key Concept:** Abstract interfaces with virtual destructors enable safe polymorphism

#### Q14
```cpp
#include <iostream>

class A {
public:
    A() { std::cout << "A()\n"; }
    A(const A&) { std::cout << "Copy\n"; }
};

void func(A a) {}

int main() {
    A a;
    func(a);
}
```

**Answer:**
```
A()
Copy
```

**Explanation:**
- `A a;` calls default constructor: "A()"
- func(a) passes by value, requires copy
- Copy constructor called: "Copy"
- Pass by value expensive for large objects
- **Key Concept:** Pass by value invokes copy constructor; prefer const reference for efficiency

#### Q15
```cpp
#include <iostream>

class A {
public:
    virtual void func() { std::cout << "A\n"; }
};

class B : public A {
public:
    void func() override final { std::cout << "B\n"; }
};

class C : public B {
public:
    void func() override { std::cout << "C\n"; }
};
```

**Answer:**
```
Compilation Error
```

**Explanation:**
- B::func() marked final - cannot be overridden
- C attempts to override final function
- Compiler error: overriding final function
- final prevents further inheritance modifications
- **Key Concept:** final keyword prevents function override in derived classes

#### Q16
```cpp
#include <iostream>

class Base {
public:
    Base() { init(); }
    virtual void init() = 0;
};

class Derived : public Base {
public:
    void init() override { std::cout << "Derived init\n"; }
};

int main() {
    Derived d;
}
```

**Answer:**
```
Compilation Error or Runtime Crash
```

**Explanation:**
- Calling pure virtual function from constructor
- During Base construction, Derived part doesn't exist yet
- Pure virtual call = undefined behavior
- Most compilers: linker error or runtime crash
- **Key Concept:** Never call virtual functions (especially pure virtuals) from constructors

#### Q17
```cpp
#include <iostream>

class A {
public:
    A() = default;
    ~A() {}
};

int main() {
    A a1;
    A a2 = std::move(a1);
}
```

**Answer:**
```
(no output)
```

**Explanation:**
- User-defined destructor doesn't suppress move constructor
- Compiler generates move constructor (memberwise move)
- std::move(a1) triggers implicit move constructor
- Move semantics work despite user-defined destructor
- **Key Concept:** User-defined destructor doesn't suppress move in C++11+ (deprecated but allowed)

#### Q18
```cpp
#include <iostream>

struct Base {
    int x;
};

struct Derived : Base {
    int y;
};

int main() {
    Derived d{1, 2};
    Base b = d;
    std::cout << b.x << "\n";
}
```

**Answer:**
```
1
```

**Explanation:**
- Object slicing: Derived copied as Base
- Aggregate initialization: d.x = 1, d.y = 2
- Only Base portion (x = 1) copied to b
- b.y doesn't exist (sliced away)
- **Key Concept:** Slicing copies only base portion; derived members lost

#### Q19
```cpp
#include <iostream>

class A {
public:
    explicit A(int) {}
};

void func(A a) {}

int main() {
    func(42);
}
```

**Answer:**
```
Compilation Error
```

**Explanation:**
- explicit prevents implicit conversion int → A
- func(42) tries implicit conversion
- Compiler error: could not convert '42' from 'int' to 'A'
- Must use explicit: func(A(42)) or func(A{42})
- **Key Concept:** explicit prevents unwanted implicit conversions

#### Q20
```cpp
#include <iostream>

class A {
    int* data;
public:
    A(int x) : data(new int(x)) {}
    A(const A& other) = default;
    A& operator=(const A& other) = default;
    ~A() { delete data; }
};

int main() {
    A a1(10);
    A a2 = a1;
}
```

**Answer:**
```
(no output, but undefined behavior/crash likely)
```

**Explanation:**
- Defaulted copy constructor does shallow copy
- Both a1.data and a2.data point to same memory
- Both destructors call delete on same pointer - double delete!
- Undefined behavior despite Rule of Three warning
- **Key Concept:** Don't use = default for copy with raw pointers; implement deep copy manually
