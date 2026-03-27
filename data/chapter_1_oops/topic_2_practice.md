## TOPIC: Encapsulation, Inheritance, and Polymorphism

### PRACTICE_TASKS: Output Prediction and Code Analysis

#### Q1
```cpp
#include <iostream>

class Base {
public:
    virtual void show() { std::cout << "Base\n"; }
};

class Derived : public Base {
public:
    void show() override { std::cout << "Derived\n"; }
};

int main() {
    Base b;
    Derived d;
    Base* ptr = &d;
    b.show();
    ptr->show();
}
```

**Answer:**
```
Base
Derived
```

**Explanation:**
- `b.show()` calls Base::show directly (no polymorphism, static binding)
- `ptr->show()` uses polymorphism - ptr points to Derived object
- Virtual function resolves at runtime to Derived::show
- **Key Concept:** Virtual functions enable runtime polymorphism through base class pointers


#### Q2
```cpp
#include <iostream>

class A {
public:
    A() { std::cout << "A\n"; }
    ~A() { std::cout << "~A\n"; }
};

class B : public A {
public:
    B() { std::cout << "B\n"; }
    ~B() { std::cout << "~B\n"; }
};

int main() {
    A* p = new B();
    delete p;
}
```

**Answer:**
```
A
B
~A
```

**Explanation:**
- Constructor order: A() → B() (base before derived)
- Destructor: Only ~A() called! ~B() is SKIPPED
- Missing virtual destructor causes undefined behavior
- Derived class resources may leak
- **Key Concept:** Always make base class destructors virtual when using polymorphism


#### Q3
```cpp
#include <iostream>

class A {
private:
    virtual void foo() { std::cout << "A\n"; }
public:
    void call() { foo(); }
};

class B : public A {
private:
    void foo() override { std::cout << "B\n"; }
};

int main() {
    B b;
    b.call();
}
```

**Answer:**
```
B
```

**Explanation:**
- Virtual function override works even when both are private
- call() is public in A, invokes private virtual foo()
- Runtime binding resolves to B::foo()
- Access control applies at compile-time, not runtime
- **Key Concept:** Virtual dispatch ignores access specifiers


#### Q4
```cpp
#include <iostream>

class A {
public:
    virtual void show() { std::cout << "A\n"; }
};

class B : public A {
public:
    void show() { std::cout << "B\n"; }
};

void func(A a) {
    a.show();
}

int main() {
    B b;
    func(b);
}
```

**Answer:**
```
A
```

**Explanation:**
- func() takes parameter by VALUE, not reference/pointer
- Object slicing occurs: B object copied as A
- Only A's portion is copied, B's data lost
- Virtual function doesn't apply (no polymorphism with value passing)
- **Key Concept:** Pass by value causes object slicing; use pointer/reference for polymorphism


#### Q5
```cpp
#include <iostream>

class Base {
public:
    virtual void fun() const { std::cout << "Base const\n"; }
};

class Derived : public Base {
public:
    void fun() { std::cout << "Derived non-const\n"; }
};

int main() {
    Derived d;
    d.fun();
}
```

**Answer:**
```
Derived non-const
```

**Explanation:**
- Derived::fun() has different signature (non-const) than Base::fun() (const)
- NOT an override - different const qualifier
- Derived::fun() hides Base::fun() (name hiding, not override)
- d.fun() calls Derived's version
- **Key Concept:** const/non-const creates different signatures; must match for override


#### Q6
```cpp
#include <iostream>

class A {
public:
    virtual void foo() { std::cout << "A\n"; }
};

class B : public A {
public:
    void foo(int) { std::cout << "B\n"; }
};

int main() {
    B b;
    b.foo(10);
}
```

**Answer:**
```
B
```

**Explanation:**
- B::foo(int) hides A::foo() (name hiding rule)
- Different signature: foo(int) vs foo()
- b.foo(10) calls B::foo(int), prints "B"
- To call A::foo(), would need b.A::foo() or using declaration
- **Key Concept:** Derived class names hide all base class names with same name, regardless of signature


#### Q7
```cpp
#include <iostream>

class A {
public:
    A() { show(); }
    virtual void show() { std::cout << "A\n"; }
};

class B : public A {
public:
    void show() override { std::cout << "B\n"; }
};

int main() {
    B b;
}
```

**Answer:**
```
A
```

**Explanation:**
- Virtual function called from constructor doesn't use derived version
- During A's constructor, object is still type A (B part not yet constructed)
- show() resolves to A::show(), not B::show()
- This prevents calling functions on uninitialized derived parts
- **Key Concept:** Virtual functions called in constructors don't dispatch to derived classes


#### Q8
```cpp
#include <iostream>

class Base {
public:
    virtual void display(int x = 10) { 
        std::cout << "Base: " << x << "\n"; 
    }
};

class Derived : public Base {
public:
    void display(int x = 20) override { 
        std::cout << "Derived: " << x << "\n"; 
    }
};

int main() {
    Base* ptr = new Derived();
    ptr->display();
    delete ptr;
}
```

**Answer:**
```
Derived: 10
```

**Explanation:**
- Function is resolved at runtime (Derived::display called)
- Default argument is resolved at COMPILE-TIME (uses Base's x=10)
- Pointer type is Base*, so Base's default value used
- Common pitfall: default args don't participate in virtual dispatch
- **Key Concept:** Virtual function resolution is runtime, default arguments are compile-time


#### Q9
```cpp
#include <iostream>

class A {
public:
    virtual void foo() { std::cout << "A\n"; }
};

class B : public A {
public:
    void foo() override { std::cout << "B\n"; }
};

class C : public B {
public:
    void foo() override { std::cout << "C\n"; }
};

int main() {
    A* a = new C();
    a->foo();
    delete a;
}
```

**Answer:**
```
C
```

**Explanation:**
- Multi-level inheritance: A → B → C
- Virtual function dispatch works through entire hierarchy
- a->foo() resolves to most-derived version (C::foo)
- Virtual table pointer maintained through all inheritance levels
- **Key Concept:** Virtual dispatch works through multiple inheritance levels to most-derived override


#### Q10
```cpp
#include <iostream>

class A {
public:
    A() { std::cout << "A\n"; }
};

class B : public A {
public:
    B() { std::cout << "B\n"; }
};

class C : public B {
public:
    C() { std::cout << "C\n"; }
};

int main() {
    C obj;
}
```

**Answer:**
```
A
B
C
```

**Explanation:**
- Constructor chain: A → B → C (base to derived order)
- Each base must be fully constructed before derived constructor runs
- Multi-level inheritance constructs from root to leaf
- **Key Concept:** Multi-level inheritance: constructors called from most base to most derived


#### Q11
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

int main() {
    Base* ptr = new Derived();
    delete ptr;
}
```

**Answer:**
```
~Derived
~Base
```

**Explanation:**
- Virtual destructor enables proper cleanup through base pointer
- ~Derived() called first (most derived)
- ~Base() called second (base after derived)
- Proper destruction order prevents resource leaks
- **Key Concept:** Virtual destructor ensures derived destructors called through base pointers


#### Q12
```cpp
#include <iostream>

class Base {
public:
    void func(int) { std::cout << "Base::int\n"; }
};

class Derived : public Base {
public:
    void func(double) { std::cout << "Derived::double\n"; }
};

int main() {
    Derived d;
    d.func(10);
}
```

**Answer:**
```
Derived::double
```

**Explanation:**
- Derived::func(double) hides Base::func(int)
- Name hiding applies even with different parameter types
- func(10) converted to double (int → double conversion)
- Derived's version called, prints "Derived::double"
- **Key Concept:** Name hiding: derived class names hide ALL base names, even with different signatures


#### Q13
```cpp
#include <iostream>

class A {
public:
    virtual void foo() = 0;
    ~A() { std::cout << "~A\n"; }
};

void A::foo() {
    std::cout << "A::foo implementation\n";
}

class B : public A {
public:
    void foo() override {
        A::foo();
        std::cout << "B::foo\n";
    }
};

int main() {
    A* ptr = new B();
    ptr->foo();
    delete ptr;
}
```

**Answer:**
```
A::foo implementation
B::foo
~A
```

**Explanation:**
- Pure virtual can have implementation: A::foo() defined outside class
- B::foo() calls A::foo() explicitly using A::foo()
- Outputs both implementations
- Pure virtual = 0 forces override but can still provide default implementation
- **Key Concept:** Pure virtual functions can have implementations; derived classes can explicitly call them


#### Q14
```cpp
#include <iostream>

class A {
private:
    virtual void f() { std::cout << "A::f\n"; }
};

class B : public A {
private:
    void f() override { std::cout << "B::f\n"; }
};

int main() {
    B b;
}
```

**Answer:**
```
(no output)
```

**Explanation:**
- Both virtual functions are private
- No code actually calls them
- Object B constructed and destroyed silently
- Private virtual functions valid (used for internal polymorphism patterns)
- **Key Concept:** Private virtual functions are valid; used for Template Method pattern


#### Q15
```cpp
#include <iostream>

class A {
public:
    virtual void show() const { std::cout << "A\n"; }
};

class B : public A {
public:
    void show() const override { std::cout << "B\n"; }
};

int main() {
    B b;
    A a = b;
    a.show();
}
```

**Answer:**
```
A
```

**Explanation:**
- Object slicing: B copied into A, B's portion lost
- a is type A (not reference/pointer), no polymorphism
- a.show() calls A::show directly
- Virtual function doesn't apply to value objects
- **Key Concept:** Copying derived to base by value causes slicing; no polymorphism


#### Q16
```cpp
#include <iostream>

class A {
public:
    A() { who(); }
    virtual void who() { std::cout << "A\n"; }
    ~A() { who(); }
};

class B : public A {
public:
    void who() override { std::cout << "B\n"; }
};

int main() {
    B b;
}
```

**Answer:**
```
A
A
```

**Explanation:**
- Constructor: B under construction, still A-type, calls A::who()
- Destructor: B being destroyed, back to A-type, calls A::who()
- Virtual functions don't dispatch during construction/destruction
- Prevents accessing uninitialized/destroyed derived parts
- **Key Concept:** Virtual functions in constructor/destructor don't use derived versions


#### Q17
```cpp
#include <iostream>

class A {
public:
    virtual void print(int x = 10) { std::cout << "A: " << x << "\n"; }
};

class B : public A {
public:
    void print(int x = 20) override { std::cout << "B: " << x << "\n"; }
};

int main() {
    B* bptr = new B();
    A* aptr = bptr;
    bptr->print();
    aptr->print();
    delete bptr;
}
```

**Answer:**
```
B: 20
B: 10
```

**Explanation:**
- bptr->print(): static type B*, uses B's default (x=20)
- aptr->print(): static type A*, uses A's default (x=10)
- Both call B::print (runtime), but defaults resolved at compile-time
- Default argument binding is static (compile-time), not dynamic
- **Key Concept:** Default arguments bound statically based on pointer type, not runtime type


#### Q18
```cpp
#include <iostream>

class Base {
protected:
    Base(const Base&) = default;
public:
    Base() = default;
    virtual void show() const { std::cout << "Base\n"; }
    virtual ~Base() = default;
};

class Derived : public Base {
public:
    void show() const override { std::cout << "Derived\n"; }
};

void process(Base b) {
    b.show();
}

int main() {
    Derived d;
    process(d);
}
```

**Answer:**
```
Compilation Error
```

**Explanation:**
- Base copy constructor is protected
- process(Base b) requires copy constructor to copy Derived → Base
- Copy constructor not accessible from main()
- Protected prevents slicing by making copying restricted
- **Key Concept:** Protected copy constructor prevents object slicing (good design pattern)


#### Q19
```cpp
#include <iostream>

class A {
public:
    A() { std::cout << "A\n"; }
    ~A() { std::cout << "~A\n"; }
};

class B : public A {
public:
    B() { std::cout << "B\n"; }
    ~B() { std::cout << "~B\n"; }
};

class C : public B {
public:
    C() { std::cout << "C\n"; }
    ~C() { std::cout << "~C\n"; }
};

int main() {
    C obj;
}
```

**Answer:**
```
A
B
C
~C
~B
~A
```

**Explanation:**
- Construction: A → B → C (base to derived)
- Destruction: ~C → ~B → ~A (reverse order)
- Multi-level inheritance: proper LIFO destruction
- Each level properly cleaned up in reverse construction order
- **Key Concept:** Destructors called in exact reverse of construction order


#### Q20
```cpp
#include <iostream>

class Base {
public:
    void func() { std::cout << "Base\n"; }
};

class Derived : public Base {
public:
    void func() { std::cout << "Derived\n"; }
};

int main() {
    Base* ptr = new Derived();
    ptr->func();
    delete ptr;
}
```

**Answer:**
```
Base
```

**Explanation:**
- func() is NOT virtual - no runtime polymorphism
- ptr is Base*, so Base::func() called (static binding)
- Derived::func() would only be called on Derived* or Derived& or Derived object
- Missing virtual keyword prevents polymorphism
- **Key Concept:** Non-virtual functions use static binding based on pointer type, not object type

