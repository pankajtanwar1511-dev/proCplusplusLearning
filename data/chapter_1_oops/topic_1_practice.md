## TOPIC: Classes, Structs, and Access Specifiers

### PRACTICE_TASKS: Output Prediction and Code Analysis

#### Q1
```cpp
#include <iostream>
using namespace std;

struct S {
    int x = 10;
};

class C {
    int x = 20;
};

int main() {
    S s;
    s.x = 100;
    
    C c;
    c.x = 200;
    
    cout << s.x << " " << c.x << endl;
}
```

**Answer:**
```
Compilation Error
```

**Explanation:**
- `struct S` has public members by default - `s.x` is accessible
- `class C` has private members by default - `c.x` is NOT accessible from main()
- Error occurs at lines trying to access `c.x` (private member)
- **Key Concept:** Default access specifiers differ between struct (public) and class (private)


#### Q2
```cpp
#include <iostream>
using namespace std;

class Base {
public:
    int pub = 1;
protected:
    int prot = 2;
private:
    int priv = 3;
};

class Derived : private Base {
public:
    void show() {
        cout << pub << " " << prot << endl;
    }
};

int main() {
    Derived d;
    d.show();
    cout << d.pub << endl;
}
```

**Answer:**
```
Compilation Error
```

**Explanation:**
- Private inheritance makes all Base members private in Derived
- `d.pub` tries to access Base::pub from outside Derived, but it's now private
- Inside `show()`, `pub` and `prot` are accessible (inherited as private members)
- **Key Concept:** Private inheritance changes accessibility of inherited members


#### Q3
```cpp
#include <iostream>
using namespace std;

class A {
private:
    virtual void func() { cout << "A::func" << endl; }
public:
    void call() { func(); }
};

class B : public A {
public:
    void func() { cout << "B::func" << endl; }
};

int main() {
    A* ptr = new B();
    ptr->call();
    delete ptr;
}
```

**Answer:**
```
B::func
```

**Explanation:**
- Virtual function works even when declared private!
- Access specifier checked at compile-time; virtual dispatch happens at runtime
- `call()` (public) can invoke private `func()` internally
- Runtime polymorphism calls B::func via virtual table
- **Key Concept:** Virtual functions work regardless of access level; privacy is compile-time concept


#### Q4
```cpp
#include <iostream>
using namespace std;

struct Base {
    void show() { cout << "Base" << endl; }
};

struct Derived : Base {};

int main() {
    Derived d;
    d.show();
}
```

**Answer:**
```
Base
```

**Explanation:**
- Derived inherits `show()` from Base (struct uses public inheritance by default)
- Function is directly available in Derived without override
- Outputs "Base" as expected
- **Key Concept:** Struct inherits publicly by default; member functions inherited normally


#### Q5
```cpp
#include <iostream>
using namespace std;

class Test {
private:
    int x;
public:
    int y;
private:
    int z;
public:
    Test() : x(1), y(2), z(3) {}
    void print() { cout << sizeof(Test) << endl; }
};

int main() {
    Test t;
    t.print();
}
```

**Answer:**
```
12
```

**Explanation:**
- Class contains 3 int members: x, y, z (regardless of access specifiers)
- Each int is 4 bytes on most systems
- Total size: 3 × 4 = 12 bytes
- Access specifiers don't affect memory layout or size
- **Key Concept:** Multiple access specifier blocks don't change sizeof(); only data members count


#### Q6
```cpp
#include <iostream>
using namespace std;

class Box {
private:
    int secret = 100;
    friend void reveal(Box& b);
};

void reveal(Box& b) {
    b.secret = 200;
}

int main() {
    Box b;
    reveal(b);
    cout << b.secret << endl;
}
```

**Answer:**
```
Compilation Error
```

**Explanation:**
- Friend function `reveal()` can access private member `secret` inside the function
- However, `main()` tries to print `b.secret` directly
- `secret` is private, so accessing it from main() is illegal
- Friend function can modify private data, but doesn't make it publicly accessible
- **Key Concept:** Friend function can access private members; doesn't change member's access level


#### Q7
```cpp
#include <iostream>
using namespace std;

class Base {
protected:
    int val = 10;
};

class Derived1 : public Base {
public:
    void show() { cout << val << endl; }
};

class Derived2 : protected Base {
public:
    void show() { cout << val << endl; }
};

int main() {
    Derived1 d1;
    d1.show();
    
    Derived2 d2;
    d2.show();
}
```

**Answer:**
```
10
10
```

**Explanation:**
- Both Derived1 and Derived2 can access protected member `val` internally
- Public vs protected inheritance only affects external visibility
- Inside member functions, both can print `val` (value is 10)
- Difference: Derived1 exposes Base as public; Derived2 as protected (matters for further derivation)
- **Key Concept:** Protected members accessible in derived class regardless of inheritance type


#### Q8
```cpp
#include <iostream>
using namespace std;

struct Empty {};

struct Derived : Empty {
    int x;
};

int main() {
    cout << sizeof(Empty) << " ";
    cout << sizeof(Derived) << endl;
}
```

**Answer:**
```
1 4
```

**Explanation:**
- `sizeof(Empty)` = 1 byte (empty classes have minimum size of 1 for unique addresses)
- `sizeof(Derived)` = 4 bytes (only int x counts; Empty base uses Empty Base Optimization)
- EBO (Empty Base Optimization): compiler doesn't allocate space for empty base
- No padding needed, just the int member
- **Key Concept:** Empty Base Optimization eliminates size of empty base classes


#### Q9
```cpp
#include <iostream>
using namespace std;

class Test {
public:
    int a = 1;
protected:
    int b = 2;
private:
    int c = 3;
public:
    void compare(const Test& other) {
        cout << (a + b + c) << " ";
        cout << (other.a + other.b + other.c) << endl;
    }
};

int main() {
    Test t1, t2;
    t1.compare(t2);
}
```

**Answer:**
```
6 6
```

**Explanation:**
- Member function can access private members of its own class instances
- `compare()` accesses both `this->c` and `other.c` (both Test objects)
- Access control is per-class, not per-object
- Both objects: a=1, b=2, c=3, sum=6
- **Key Concept:** Member functions can access private members of any instance of the same class


#### Q10
```cpp
#include <iostream>
using namespace std;

class Base {
public:
    void func() { cout << "Base" << endl; }
};

class Derived : private Base {
public:
    using Base::func;
};

int main() {
    Derived d;
    d.func();
}
```

**Answer:**
```
Base
```

**Explanation:**
- Private inheritance makes Base::func private in Derived
- `using Base::func` re-exposes it as public in Derived
- The using declaration changes access level
- `d.func()` works and calls Base::func, printing "Base"
- **Key Concept:** `using` declaration can change inherited member's accessibility


#### Q11
```cpp
#include <iostream>
using namespace std;

struct S1 {
    int a;
    int b;
};

class C1 {
private:
    int a;
public:
    int b;
};

int main() {
    cout << (sizeof(S1) == sizeof(C1)) << endl;
}
```

**Answer:**
```
1
```

**Explanation:**
- Both S1 (struct) and C1 (class) have two int members
- Memory layout is identical: 2 × 4 = 8 bytes
- Access specifiers don't affect size or layout
- sizeof(S1) == sizeof(C1) evaluates to true (1)
- **Key Concept:** Access specifiers are compile-time; don't affect runtime memory layout


#### Q12
```cpp
#include <iostream>
using namespace std;

class Base {
private:
    int x = 5;
public:
    int getX() { return x; }
};

class Derived : public Base {
public:
    void setX(int val) { x = val; }
};

int main() {
    Derived d;
    d.setX(10);
    cout << d.getX() << endl;
}
```

**Answer:**
```
Compilation Error
```

**Explanation:**
- Base::x is private - NOT inherited as accessible in Derived
- `setX()` tries to access x directly, but it's private in Base
- Derived can use public `getX()` but cannot access x directly
- Must use Base's public interface or make x protected
- **Key Concept:** Private members are not accessible in derived classes, even with public inheritance

