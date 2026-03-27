## TOPIC: Pure Virtual Functions and Abstract Base Classes

### PRACTICE_TASKS: Output Prediction and Behavior Analysis

#### Q1
```cpp
#include <iostream>

class A {
public:
    virtual void foo() = 0;
};

class B : public A {
    // no override
};

int main() {
    B b;
}
```

**Answer:**
```
Compilation Error
```

**Explanation:**
- B doesn't override pure virtual function foo()
- B remains abstract class
- Cannot instantiate abstract class
- Must provide implementation for all pure virtual functions
- **Key Concept:** Derived class must override all pure virtuals to become concrete


#### Q2
```cpp
#include <iostream>

class A {
public:
    A() { f(); }
    virtual void f() = 0;
};

class B : public A {
public:
    void f() override { std::cout << "B::f()\n"; }
};

int main() {
    B b;
}
```

**Answer:**
```
Compilation Error (or runtime crash)
```

**Explanation:**
- Pure virtual function called from constructor
- During A's construction, B part doesn't exist yet
- Calling pure virtual f() is undefined behavior
- Most compilers: linker error or runtime crash
- **Key Concept:** Never call pure virtual functions from constructors


#### Q3
```cpp
#include <iostream>

class A {
public:
    virtual ~A() = 0;
};

int main() {
    A* a = nullptr;
}
```

**Answer:**
```
(no output)
```

**Explanation:**
- Just creates nullptr, no object construction
- Pure virtual destructor declaration is fine
- No code actually executes (nullptr not dereferenced)
- Abstract class pointers are valid
- **Key Concept:** Can have pointers/references to abstract classes, just can't instantiate them


#### Q4
```cpp
#include <iostream>

class A {
public:
    virtual void f() = 0;
};

class B : public A {};

class C : public B {
public:
    void f() override { std::cout << "C::f\n"; }
};

int main() {
    C c;
    c.f();
}
```

**Answer:**
```
C::f
```

**Explanation:**
- Multi-level inheritance: A (abstract) → B (still abstract) → C (concrete)
- B doesn't override f(), remains abstract
- C provides implementation, becomes concrete
- Can instantiate C and call f()
- **Key Concept:** Pure virtual requirement propagates through inheritance until overridden


#### Q5
```cpp
#include <iostream>

class A {
public:
    virtual void foo() = 0;
    virtual ~A() {}
};

class B : public A {
public:
    void foo() override { std::cout << "B::foo\n"; }
    ~B() { std::cout << "B::~B\n"; }
};

int main() {
    A* a = new B();
    a->foo();
    delete a;
}
```

**Answer:**
```
B::foo
B::~B
```

**Explanation:**
- Abstract base with pure virtual foo() overridden in B
- Virtual destructor ensures proper cleanup
- a->foo() dispatches to B::foo via polymorphism
- Virtual destructor calls B::~B then A::~A
- **Key Concept:** Abstract classes can have virtual destructors; essential for polymorphic deletion


#### Q6
```cpp
#include <iostream>

class A {
public:
    virtual void f() = 0;
    void g() { std::cout << "A::g\n"; }
};

class B : public A {
public:
    void f() override { std::cout << "B::f\n"; }
};

int main() {
    A* a = new B();
    a->g();
    delete a;
}
```

**Answer:**
```
A::g
```

**Explanation:**
- Abstract class can have concrete (non-pure) functions
- g() has implementation in A
- Pure virtual f() makes A abstract
- a->g() calls A's implementation
- **Key Concept:** Abstract classes can mix pure and non-pure virtual functions


#### Q7
```cpp
#include <iostream>

class A {
public:
    virtual void f() = 0;
    virtual ~A() = 0;
};

A::~A() {
    std::cout << "A::~A\n";
}

class B : public A {
public:
    void f() override { std::cout << "B::f\n"; }
    ~B() { std::cout << "B::~B\n"; }
};

int main() {
    A* a = new B();
    delete a;
}
```

**Answer:**
```
B::~B
A::~A
```

**Explanation:**
- Pure virtual destructor MUST have implementation (unique rule)
- ~A() = 0 requires body outside class
- Even pure virtual destructors get called during destruction chain
- Proper RAII cleanup through virtual destructor
- **Key Concept:** Pure virtual destructor must be defined; base destructor always called


#### Q8
```cpp
#include <iostream>

class A {
public:
    virtual void foo() = 0;
};

class B : public A {
public:
    void foo() override final { std::cout << "B::foo\n"; }
};

class C : public B {
public:
    void foo() override { std::cout << "C::foo\n"; }
};
```

**Answer:**
```
Compilation Error
```

**Explanation:**
- B::foo() marked final - cannot be overridden
- C tries to override final function
- Compiler error: overriding final function
- final prevents further overriding in hierarchy
- **Key Concept:** final keyword prevents function override in derived classes


#### Q9
```cpp
#include <iostream>

class A {
public:
    virtual void foo() = 0;
};

void A::foo() {
    std::cout << "A::foo body\n";
}

class B : public A {
public:
    void foo() override {
        A::foo();
        std::cout << "B::foo\n";
    }
};

int main() {
    B b;
    b.foo();
}
```

**Answer:**
```
A::foo body
B::foo
```

**Explanation:**
- Pure virtual can have implementation outside class
- A::foo() defined with body
- B::foo() explicitly calls A::foo() then adds own code
- Pure virtual = 0 just forces override, doesn't prevent implementation
- **Key Concept:** Pure virtuals can have implementations; useful for providing default behavior


#### Q10
```cpp
#include <iostream>

class A {
public:
    virtual void foo() = 0;
};

class B : public A {
private:
    void foo() override { std::cout << "B::foo\n"; }
};

int main() {
    B b;
    b.foo();
}
```

**Answer:**
```
Compilation Error
```

**Explanation:**
- B::foo() is private
- main() cannot access private member function
- Even though it overrides pure virtual, access control applies
- Virtual dispatch respects access control at call site
- **Key Concept:** Access specifiers checked at compile-time based on static type


#### Q11
```cpp
#include <iostream>

class A {
public:
    virtual void f() = 0;
};

class B : public A {
public:
    void f() override { std::cout << "B::f\n"; }
};

class C : public B {
};

int main() {
    C c;
    c.f();
}
```

**Answer:**
```
B::f
```

**Explanation:**
- B implements pure virtual f() from A
- C inherits B's implementation without overriding
- C is concrete (not abstract) - inherited implementation counts
- c.f() calls inherited B::f()
- **Key Concept:** Derived classes inherit implementations of pure virtuals from intermediate bases


#### Q12
```cpp
#include <iostream>

class A {
public:
    virtual void f() = 0;
};

class B : public A {
public:
    void f(int) { std::cout << "B::f(int)\n"; }
};

int main() {
    B b;
}
```

**Answer:**
```
Compilation Error
```

**Explanation:**
- A::f() is pure virtual
- B::f(int) has different signature - NOT an override
- B remains abstract (didn't override A::f())
- Cannot instantiate abstract class B
- **Key Concept:** Override must match signature exactly; different parameters = different function


#### Q13
```cpp
#include <iostream>

class A {
public:
    A() { std::cout << "A()\n"; }
    virtual void f() = 0;
    virtual ~A() { std::cout << "~A()\n"; }
};

class B : public A {
public:
    B() { std::cout << "B()\n"; }
    void f() override { std::cout << "B::f\n"; }
    ~B() { std::cout << "~B()\n"; }
};

int main() {
    A* a = new B();
    delete a;
}
```

**Answer:**
```
A()
B()
~B()
~A()
```

**Explanation:**
- Construction: A() → B() (base before derived)
- Destruction: ~B() → ~A() (reverse order)
- Abstract base constructor/destructor can execute
- Virtual destructor ensures proper cleanup
- **Key Concept:** Abstract classes have constructors/destructors; used when constructing derived objects


#### Q14
```cpp
#include <iostream>

class A {
public:
    virtual void f() = 0;
};

class B : public A {
public:
    void f() override { std::cout << "B\n"; }
};

class C : public B {
public:
    void f() override { std::cout << "C\n"; }
};

int main() {
    A* a = new C();
    a->f();
    delete a;
}
```

**Answer:**
```
C
```

**Explanation:**
- Multi-level: A (abstract) → B (concrete) → C (concrete)
- C overrides B's override of A's pure virtual
- Virtual dispatch goes to most-derived: C::f()
- Works through entire hierarchy
- **Key Concept:** Virtual dispatch finds most-derived override in inheritance chain


#### Q15
```cpp
#include <iostream>

class A {
private:
    virtual void impl() = 0;
public:
    void interface() { impl(); }
    virtual ~A() = default;
};

class B : public A {
private:
    void impl() override { std::cout << "B::impl\n"; }
};

int main() {
    B b;
    b.interface();
}
```

**Answer:**
```
B::impl
```

**Explanation:**
- NVI (Non-Virtual Interface) pattern
- Public non-virtual interface() calls private pure virtual impl()
- B implements private impl()
- Polymorphism works with private virtuals
- **Key Concept:** NVI pattern - public interface, private virtual implementation (Template Method)


#### Q16
```cpp
#include <iostream>

class A {
public:
    virtual void foo() = 0;
    virtual void bar() { std::cout << "A::bar\n"; }
};

class B : public A {
public:
    void foo() override { std::cout << "B::foo\n"; }
};

int main() {
    A* a = new B();
    a->foo();
    a->bar();
    delete a;
}
```

**Answer:**
```
B::foo
A::bar
```

**Explanation:**
- Abstract class with mix of pure (foo) and non-pure (bar) virtuals
- foo() overridden in B, dispatches to B::foo
- bar() not overridden, uses A's implementation
- Abstract classes can provide partial implementation
- **Key Concept:** Abstract classes can mix pure and implemented virtuals


#### Q17
```cpp
#include <iostream>

class Base {
public:
    virtual ~Base() {
        std::cout << "~Base\n";
    }
    virtual void func() = 0;
};

class Derived : public Base {
public:
    ~Derived() {
        std::cout << "~Derived\n";
    }
    void func() override { std::cout << "Derived::func\n"; }
};

int main() {
    Base* b = new Derived();
    delete b;
}
```

**Answer:**
```
~Derived
~Base
```

**Explanation:**
- Virtual destructor with abstract base
- Proper polymorphic deletion through base pointer
- ~Derived() called first, then ~Base()
- Abstract base can have virtual destructor
- **Key Concept:** Virtual destructors essential for abstract base classes used polymorphically


#### Q18
```cpp
#include <iostream>

class A {
public:
    virtual void f() = 0;
};

class B : public A {
public:
    void f() override { std::cout << "B::f\n"; }
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
- A is abstract class (has pure virtual f())
- Cannot instantiate abstract class directly
- Can only create pointers/references to abstract types
- Must instantiate concrete derived class
- **Key Concept:** Abstract classes cannot be instantiated, only derived from


#### Q19
```cpp
#include <iostream>

class Interface {
public:
    virtual void op1() = 0;
    virtual void op2() = 0;
};

class Impl : public Interface {
public:
    void op1() override { std::cout << "op1\n"; }
    void op2() override { std::cout << "op2\n"; }
};

int main() {
    Interface* i = new Impl();
    i->op1();
    i->op2();
    delete i;
}
```

**Answer:**
```
op1
op2
```

**Explanation:**
- Pure interface pattern: all functions pure virtual
- Impl provides all implementations
- Polymorphic usage through interface pointer
- Clean separation of interface and implementation
- **Key Concept:** Interface pattern - abstract base with only pure virtuals


#### Q20
```cpp
#include <iostream>

class A {
public:
    A() { std::cout << "A()\n"; }
    virtual void f() = 0;
};

class B : public A {
public:
    B() : A() { std::cout << "B()\n"; }
    void f() override { std::cout << "B::f\n"; }
};

int main() {
    B b;
}
```

**Answer:**
```
A()
B()
```

**Explanation:**
- Can construct derived class from abstract base
- Abstract base constructor (A()) runs first
- Then derived constructor (B()) runs
- Pure virtual f() has implementation in B, making B concrete
- **Key Concept:** Abstract base constructors called when constructing derived objects

