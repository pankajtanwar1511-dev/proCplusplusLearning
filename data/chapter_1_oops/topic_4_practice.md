## TOPIC: Constructor Types - Default, Parameterized, Copy, and Move

### PRACTICE_TASKS: Constructor Behavior Analysis

#### Q1
```cpp
#include <iostream>

class A {
public:
    A() { std::cout << "A\n"; }
};

class B {
    A a;
public:
    B() : a() { std::cout << "B\n"; }
};

int main() {
    B b;
}
```

**Answer:**
```
A
B
```

**Explanation:**
- Member object `a` constructed before B's constructor body
- Explicit initialization: `a()` in initializer list
- Order: member construction → constructor body
- **Key Concept:** Member objects constructed before class constructor body executes


#### Q2
```cpp
#include <iostream>

class A {
    int x;
public:
    A(int val) { x = val; std::cout << "A: " << x << "\n"; }
};

int main() {
    A a(5);
}
```

**Answer:**
```
A: 5
```

**Explanation:**
- Parameterized constructor with single int parameter
- Initializes x via assignment in constructor body
- Prints value: 5
- **Key Concept:** Parameterized constructors allow custom initialization


#### Q3
```cpp
#include <iostream>

class A {
    int x = 10;
public:
    A() { std::cout << x << "\n"; }
};

int main() {
    A a;
}
```

**Answer:**
```
10
```

**Explanation:**
- In-class member initializer: `int x = 10`
- Default constructor prints x
- Value is 10 from in-class initialization
- **Key Concept:** In-class initializers provide default values for members


#### Q4
```cpp
#include <iostream>

class A {
    int x = 10;
public:
    A(int v) : x(v) { std::cout << x << "\n"; }
};

int main() {
    A a(20);
}
```

**Answer:**
```
20
```

**Explanation:**
- Initializer list: `x(v)` overrides in-class initializer `x = 10`
- Constructor parameter (20) takes precedence
- Prints 20
- **Key Concept:** Initializer list values override in-class initializers


#### Q5
```cpp
#include <iostream>

class A {
    int& ref;
public:
    A(int& r) : ref(r) {
        std::cout << ref << "\n";
    }
};

int main() {
    int x = 100;
    A a(x);
}
```

**Answer:**
```
100
```

**Explanation:**
- Reference member must be initialized in initializer list
- Binds ref to x (value 100)
- Prints referenced value
- **Key Concept:** Reference members MUST be initialized in initializer list


#### Q6
```cpp
#include <iostream>

class A {
    const int val;
public:
    A() {}
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
- const member `val` must be initialized
- Empty constructor body doesn't initialize const member
- Compiler error: uninitialized const member
- **Key Concept:** const members MUST be initialized in initializer list


#### Q7
```cpp
#include <iostream>

class A {
    int x = 1;
    int y = 2;
public:
    A() : y(10), x(20) {
        std::cout << x << " " << y << "\n";
    }
};

int main() {
    A a;
}
```

**Answer:**
```
20 10
```

**Explanation:**
- Initializer list order: `y(10), x(20)`
- Actual initialization order: declaration order (x, then y)
- x initialized to 20, y initialized to 10
- **Key Concept:** Members initialized in DECLARATION order, not initializer list order


#### Q8
```cpp
#include <iostream>

class A {
    int x;
public:
    A() : A(42) { std::cout << "Default\n"; }
    A(int val) : x(val) { std::cout << "Param: " << x << "\n"; }
};

int main() {
    A a;
}
```

**Answer:**
```
Param: 42
Default
```

**Explanation:**
- Delegating constructor: A() delegates to A(int)
- A(42) executes first: "Param: 42"
- Then A() body executes: "Default"
- **Key Concept:** Delegating constructors - one constructor calls another


#### Q9
```cpp
#include <iostream>

class A {
public:
    A() { std::cout << "A\n"; }
};

class B {
    A a;
public:
    B() { std::cout << "B\n"; }
};

int main() {
    B b;
}
```

**Answer:**
```
A
B
```

**Explanation:**
- Member `a` implicitly default-constructed (no initializer list entry)
- A() called first, then B() body
- Order: member default construction → class constructor
- **Key Concept:** Members without explicit initialization are default-constructed


#### Q10
```cpp
#include <iostream>

class A {
public:
    A() { std::cout << "Default\n"; }
    A(const A&) { std::cout << "Copy\n"; }
};

A create() {
    A a;
    return a;
}

int main() {
    A x = create();
}
```

**Answer:**
```
Default
```

**Explanation:**
- RVO (Return Value Optimization) elides copy
- Only one object constructed directly in x's location
- No copy constructor called (C++17 guaranteed)
- **Key Concept:** RVO eliminates unnecessary copies in return statements


#### Q11
```cpp
#include <iostream>

class A {
public:
    A() { std::cout << "Default\n"; }
    A(const A&) { std::cout << "Copy\n"; }
    A(A&&) { std::cout << "Move\n"; }
};

A create() {
    return A();
}

int main() {
    A x = create();
}
```

**Answer:**
```
Default
```

**Explanation:**
- RVO again - guaranteed copy elision in C++17
- Even with move constructor available, RVO preferred
- Single construction, no copy/move
- **Key Concept:** RVO applies even when move constructor exists


#### Q12
```cpp
#include <iostream>

class Base {
public:
    Base() { std::cout << "Base\n"; }
};

class Derived : public Base {
public:
    Derived() { std::cout << "Derived\n"; }
};

void func(Base b) {}

int main() {
    Derived d;
    func(d);
}
```

**Answer:**
```
Base
Derived
```

**Explanation:**
- Derived d: Base() → Derived()
- func(d): Pass by value causes object slicing
- Only Base portion copied into func parameter
- **Key Concept:** Pass by value to base class causes slicing


#### Q13
```cpp
#include <iostream>

class A {
public:
    A() { std::cout << "A()\n"; }
    A(int) { std::cout << "A(int)\n"; }
};

int main() {
    A a1;
    A a2(10);
}
```

**Answer:**
```
A()
A(int)
```

**Explanation:**
- Constructor overloading: two constructors with different signatures
- a1 uses A(), a2 uses A(int)
- Compiler selects constructor based on arguments
- **Key Concept:** Constructor overloading allows multiple initialization methods


#### Q14
```cpp
#include <iostream>

class A {
public:
    A() { std::cout << "A\n"; }
    ~A() { std::cout << "~A\n"; }
};

int main() {
    A();
    std::cout << "End\n";
}
```

**Answer:**
```
A
~A
End
```

**Explanation:**
- A() creates temporary object
- Temporary constructed and immediately destroyed (end of statement)
- Destructor called before "End" printed
- **Key Concept:** Temporaries destroyed at end of full expression


#### Q15
```cpp
#include <iostream>

class X {
public:
    X() { std::cout << "X()\n"; }
};

class Y {
    X x;
public:
    Y() { std::cout << "Y()\n"; }
};

int main() {
    Y y;
}
```

**Answer:**
```
X()
Y()
```

**Explanation:**
- Member object x constructed first
- Then Y's constructor body executes
- Order: member construction → containing class constructor
- **Key Concept:** Composition - members constructed before containing class


#### Q16
```cpp
#include <iostream>

class A {
    int x;
    int y;
public:
    A(int val) : y(val), x(y + 1) {
        std::cout << x << " " << y << "\n";
    }
};

int main() {
    A a(10);
}
```

**Answer:**
```
(undefined value) 10
```

**Explanation:**
- Bug! Initialization order: x then y (declaration order)
- y initialized first to 10
- x initialized to y+1, but y hasn't been initialized yet!
- Undefined behavior: x gets garbage value
- **Key Concept:** Don't use later members to initialize earlier members (declaration order matters)


#### Q17
```cpp
#include <iostream>

class A {
public:
    explicit A(int x) { std::cout << "A(" << x << ")\n"; }
};

void func(A a) {}

int main() {
    A a(5);
    func(10);
}
```

**Answer:**
```
Compilation Error
```

**Explanation:**
- explicit keyword prevents implicit conversion
- func(10) tries to implicitly convert int → A
- explicit constructor blocks this conversion
- Must use: func(A(10))
- **Key Concept:** explicit prevents unwanted implicit conversions


#### Q18
```cpp
#include <iostream>

class A {
    int x;
public:
    A(int a = 0) : x(a) { std::cout << "A: " << x << "\n"; }
};

int main() {
    A a1;
    A a2(5);
}
```

**Answer:**
```
A: 0
A: 5
```

**Explanation:**
- Default argument allows constructor to serve as default constructor
- a1: uses default (a=0)
- a2: uses provided value (a=5)
- **Key Concept:** Default parameters allow one constructor to handle multiple cases


#### Q19
```cpp
#include <iostream>

class Base {
public:
    Base(int x) { std::cout << "Base(" << x << ")\n"; }
};

class Derived : public Base {
public:
    Derived() : Base(42) { std::cout << "Derived\n"; }
};

int main() {
    Derived d;
}
```

**Answer:**
```
Base(42)
Derived
```

**Explanation:**
- Derived constructor explicitly calls Base(42) in initializer list
- Base constructor runs first with parameter 42
- Then Derived constructor body
- **Key Concept:** Derived class can explicitly specify which base constructor to call


#### Q20
```cpp
#include <iostream>

class A {
public:
    A() = default;
    A(int) { std::cout << "A(int)\n"; }
};

int main() {
    A a1;
    A a2(10);
}
```

**Answer:**
```
A(int)
```

**Explanation:**
- A() = default: compiler generates default constructor
- A(int): user-defined parameterized constructor
- a1 uses default constructor (no output)
- a2 uses A(int), prints "A(int)"
- **Key Concept:** `= default` explicitly requests compiler-generated constructor

