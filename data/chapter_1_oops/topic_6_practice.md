## TOPIC: Rule of Five, Destructors, and Object Slicing - Advanced Concepts

### PRACTICE_TASKS: Advanced Scenarios and Edge Cases

#### Q1
```cpp
#include <iostream>

class Base {
public:
    ~Base() { std::cout << "Base\n"; }
};

class Derived : public Base {
public:
    ~Derived() { std::cout << "Derived\n"; }
};

int main() {
    Base* ptr = new Derived();
    delete ptr;
}
```

**Answer:**
```
Base
```

**Explanation:**
- Non-virtual destructor in Base
- `delete ptr` only calls Base destructor (~Derived skipped!)
- Undefined behavior: Derived resources not cleaned up
- Memory leak: Derived portion not destroyed
- **Key Concept:** Always make base class destructor virtual when using polymorphism

#### Q2
```cpp
#include <iostream>

class Base {
public:
    virtual ~Base() = 0;
};

class Derived : public Base {
public:
    ~Derived() override { std::cout << "Derived\n"; }
};

int main() {
    Base* ptr = new Derived();
    delete ptr;
}
```

**Answer:**
```
Linker Error
```

**Explanation:**
- Pure virtual destructor declared but not defined
- Even pure virtual destructors MUST have implementation
- Linker error: undefined reference to Base::~Base()
- Fix: provide `Base::~Base() {}` definition outside class
- **Key Concept:** Pure virtual destructor requires implementation (unique rule for pure virtuals)

#### Q3
```cpp
#include <iostream>
#include <memory>

class Base {
public:
    ~Base() { std::cout << "Base\n"; }
};

class Derived : public Base {
public:
    ~Derived() { std::cout << "Derived\n"; }
};

int main() {
    std::shared_ptr<Base> ptr = std::make_shared<Derived>();
}
```

**Answer:**
```
Derived
Base
```

**Explanation:**
- shared_ptr stores actual deleter for Derived
- End of scope: ptr destroyed, triggers correct destructor chain
- Even without virtual destructor, shared_ptr handles it correctly!
- Type erasure magic: shared_ptr remembers the real type
- **Key Concept:** Smart pointers (shared_ptr/unique_ptr) correctly destruct derived objects even without virtual destructors

#### Q4
```cpp
#include <iostream>

class Shape {
public:
    virtual void draw() { std::cout << "Shape\n"; }
};

class Circle : public Shape {
public:
    void draw() override { std::cout << "Circle\n"; }
};

void render(Shape s) {
    s.draw();
}

int main() {
    Circle c;
    render(c);
}
```

**Answer:**
```
Shape
```

**Explanation:**
- Object slicing: render(Shape s) takes parameter by value
- Circle copied as Shape, Circle-specific data lost
- No polymorphism with value semantics
- Virtual function doesn't apply after slicing
- **Key Concept:** Pass polymorphic objects by pointer/reference to avoid slicing

#### Q5
```cpp
#include <iostream>
#include <vector>

class Base {
public:
    virtual void func() { std::cout << "Base\n"; }
    virtual ~Base() = default;
};

class Derived : public Base {
public:
    void func() override { std::cout << "Derived\n"; }
};

int main() {
    std::vector<Base> vec;
    vec.push_back(Derived());
    vec[0].func();
}
```

**Answer:**
```
Base
```

**Explanation:**
- `vector<Base>` stores Base objects by value
- push_back(Derived()) slices Derived → Base
- Polymorphism lost, only Base portion stored
- vec[0] is type Base, calls Base::func()
- **Key Concept:** Use vector<unique_ptr<Base>> for polymorphic collections to avoid slicing

#### Q6
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
- User-defined destructor declared
- Compiler generates move constructor anyway (pre-C++11 compat)
- std::move(a1) triggers compiler-generated move constructor
- Move constructor does memberwise move (trivial for empty class)
- **Key Concept:** User-defined destructor doesn't suppress move constructor in C++11+

#### Q7
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
- Even if a1 existed, `A a2 = a1` requires copy constructor
- User-defined move suppresses implicit copy constructor
- **Key Concept:** Declaring move constructor suppresses both default and copy constructors

#### Q8
```cpp
#include <iostream>

class A {
public:
    A() = default;
    A(const A&) = delete;
    A(A&&) = default;
};

int main() {
    A a1;
    A a2 = std::move(a1);
    A a3 = a2;
}
```

**Answer:**
```
Compilation Error
```

**Explanation:**
- Move-only type: copy deleted, move defaulted
- a2 is lvalue after std::move(a1) completes
- `A a3 = a2;` tries to copy a2 (lvalue)
- Copy constructor deleted - ERROR
- **Key Concept:** Move-only types cannot be copied; must use std::move to transfer ownership

#### Q9
```cpp
#include <iostream>
#include <memory>

class A {
    std::unique_ptr<int> data;
public:
    A() : data(std::make_unique<int>(42)) {}
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
- unique_ptr is non-copyable (copy constructor deleted)
- Compiler tries to generate copy constructor for A
- Memberwise copy requires copying unique_ptr - ERROR
- Compiler-generated copy constructor deleted implicitly
- **Key Concept:** Classes with non-copyable members become non-copyable themselves

#### Q10
```cpp
#include <iostream>

class Base {
public:
    Base(const Base&) = delete;
};

class Derived : public Base {
};

int main() {
    Derived d1;
    Derived d2 = d1;
}
```

**Answer:**
```
Compilation Error
```

**Explanation:**
- Base copy constructor deleted
- Derived inherits deletion (cannot copy base portion)
- Derived implicitly non-copyable
- `Derived d1;` fails - no default constructor (suppressed by deleted copy)
- **Key Concept:** Deleted special members in base class propagate to derived classes

#### Q11
```cpp
#include <iostream>

class Resource {
public:
    Resource() = default;
    Resource(Resource&&) noexcept { std::cout << "Move\n"; }
    Resource(const Resource&) { std::cout << "Copy\n"; }
};

Resource create() {
    return Resource();
}

int main() {
    Resource r = create();
}
```

**Answer:**
```
(no output)
```

**Explanation:**
- RVO (Return Value Optimization) applies
- Object constructed directly in r's location
- Neither move nor copy constructor called
- Elision bypasses both constructors
- **Key Concept:** Copy elision takes precedence over move/copy constructors

#### Q12
```cpp
#include <iostream>

class A {
public:
    virtual ~A() { std::cout << "A\n"; }
};

class B : public A {
public:
    ~B() override { std::cout << "B\n"; }
};

int main() {
    A* arr[2];
    arr[0] = new B();
    arr[1] = new B();

    delete arr[0];
    delete arr[1];
}
```

**Answer:**
```
B
A
B
A
```

**Explanation:**
- Virtual destructor enables proper polymorphic deletion
- delete arr[0]: ~B() then ~A() for first object
- delete arr[1]: ~B() then ~A() for second object
- Correct destruction order: derived → base
- **Key Concept:** Virtual destructors ensure proper cleanup of derived objects through base pointers

#### Q13
```cpp
#include <iostream>

struct Trivial {
    int x;
};

struct NonTrivial {
    int x;
    ~NonTrivial() {}
};

int main() {
    std::cout << std::is_trivially_destructible_v<Trivial> << "\n";
    std::cout << std::is_trivially_destructible_v<NonTrivial> << "\n";
}
```

**Answer:**
```
1
0
```

**Explanation:**
- Trivial: no user-defined destructor → trivially destructible (true = 1)
- NonTrivial: user-defined destructor → not trivially destructible (false = 0)
- Trivial types can be memcpy'd and don't need destructor calls
- Type traits help optimize generic code
- **Key Concept:** Trivially destructible types have no user-defined destructors and enable optimizations

#### Q14
```cpp
#include <iostream>

class Shape {
protected:
    Shape(const Shape&) = default;
public:
    virtual void draw() const = 0;
    virtual ~Shape() = default;
};

class Circle : public Shape {
public:
    Circle() = default;
    void draw() const override { std::cout << "Circle\n"; }
};

int main() {
    Circle c1;
    Circle c2 = c1;
}
```

**Answer:**
```
Compilation Error
```

**Explanation:**
- Shape has protected copy constructor
- Circle doesn't define default constructor explicitly
- Circle() = default fails - no accessible base default constructor
- Protected copy prevents slicing but breaks default construction
- **Key Concept:** Protected copy constructor pattern needs explicit derived constructors

#### Q15
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
    A* obj = A::create();
    obj->destroy();
}
```

**Answer:**
```
(no output)
```

**Explanation:**
- Private destructor prevents direct deletion and stack allocation
- Factory pattern: only create() can allocate
- destroy() can call private destructor (member function)
- Forces heap allocation and controlled destruction
- **Key Concept:** Private destructor enforces resource management patterns and prevents stack allocation

#### Q16
```cpp
#include <iostream>

class Base {
public:
    virtual void func() { std::cout << "Base\n"; }
    virtual ~Base() = default;
};

class Derived : public Base {
public:
    void func() override { std::cout << "Derived\n"; }
};

int main() {
    Base b = Derived();
    b.func();
}
```

**Answer:**
```
Base
```

**Explanation:**
- Object slicing: Derived() copied as Base
- Temporary Derived object sliced to Base b
- b is type Base (not pointer/reference) - no polymorphism
- Virtual function doesn't apply to value objects
- **Key Concept:** Assignment/initialization by value causes slicing; use pointers/references for polymorphism

#### Q17
```cpp
#include <iostream>

class Resource {
    int* data;
public:
    Resource() : data(new int[100]) {}
    ~Resource() { delete[] data; std::cout << "Destroyed\n"; }
    Resource(const Resource&) = delete;
    Resource(Resource&&) noexcept = default;
};

int main() {
    Resource r1;
    Resource r2 = std::move(r1);
}
```

**Answer:**
```
(no output or potential crash)
```

**Explanation:**
- Defaulted move constructor does shallow copy
- Both r1.data and r2.data point to same memory after move
- Both destructors try to delete[] same memory - double delete!
- Undefined behavior: likely crash
- **Key Concept:** Default move with raw pointers requires custom implementation to transfer ownership properly

#### Q18
```cpp
#include <iostream>

class A {
public:
    A() { std::cout << "A()\n"; }
    ~A() { std::cout << "~A()\n"; }
    A(A&&) noexcept { std::cout << "Move\n"; }
};

A factory() {
    return A();
}

int main() {
    A obj = factory();
}
```

**Answer:**
```
A()
~A()
```

**Explanation:**
- RVO (Return Value Optimization) applies
- Single object constructed directly in obj's location
- Move constructor not called despite being defined
- One construction (A()), one destruction (~A())
- **Key Concept:** RVO bypasses move constructor; elision is preferred optimization

#### Q19
```cpp
#include <iostream>

class A {
public:
    A() = default;
    A(const A&) = default;
    A(A&&) noexcept { std::cout << "Move\n"; }
};

int main() {
    A a1;
    A a2 = a1;
    A a3 = std::move(a1);
}
```

**Answer:**
```
Move
```

**Explanation:**
- `A a2 = a1;` uses defaulted copy constructor (no output)
- `A a3 = std::move(a1);` uses move constructor
- std::move casts a1 to rvalue, selects move constructor
- Only move constructor has visible side effect (printing)
- **Key Concept:** std::move enables explicit selection of move constructor over copy constructor

#### Q20
```cpp
#include <iostream>

class Base {
public:
    virtual ~Base() { std::cout << "~Base\n"; }
};

class Derived : public Base {
public:
    ~Derived() override { std::cout << "~Derived\n"; }
};

void process(Base b) {
    std::cout << "Processing\n";
}

int main() {
    Derived d;
    process(d);
}
```

**Answer:**
```
Processing
~Base
~Derived
~Base
```

**Explanation:**
- Object slicing: d copied as Base parameter b
- "Processing" printed inside function
- End of process(): ~Base called for sliced copy b
- End of main(): ~Derived then ~Base called for original d
- **Key Concept:** Pass by value causes slicing; parameter destruction happens before original object destruction
