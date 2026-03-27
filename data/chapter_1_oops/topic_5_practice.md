## TOPIC: Copy Constructor vs Assignment Operator and Rule of Three/Five/Zero

### PRACTICE_TASKS: Output Prediction and Behavior Analysis

#### Q1
```cpp
#include <iostream>
class A {
public:
    A() { std::cout << "Default\n"; }
    A(const A&) { std::cout << "Copy\n"; }
    A& operator=(const A&) { std::cout << "Assign\n"; return *this; }
};

int main() {
    A a1;
    A a2 = a1;
    A a3;
    a3 = a1;
}
```

**Answer:**
```
Default
Copy
Default
Assign
```

**Explanation:**
- `A a1;` - Default constructor called
- `A a2 = a1;` - Copy constructor called (initialization, not assignment)
- `A a3;` - Default constructor called
- `a3 = a1;` - Assignment operator called (a3 already exists)
- **Key Concept:** Initialization uses copy constructor; assignment on existing object uses assignment operator

#### Q2
```cpp
#include <iostream>
class A {
public:
    A& operator=(const A& other) {
        if (this == &other)
            std::cout << "Self-assignment\n";
        return *this;
    }
};

int main() {
    A a;
    a = a;
}
```

**Answer:**
```
Self-assignment
```

**Explanation:**
- `a = a;` triggers assignment operator
- `this == &other` checks if assigning to itself
- Self-assignment detected and message printed
- Critical for preventing bugs when managing resources
- **Key Concept:** Always check for self-assignment in operator= to avoid resource leaks/corruption

#### Q3
```cpp
#include <iostream>
class A {
public:
    A() { std::cout << "Default\n"; }
    A(const A&) { std::cout << "Copy\n"; }
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
Default
```

**Explanation:**
- RVO (Return Value Optimization) applies
- Temporary object constructed directly in `a`'s location
- No copy constructor called despite returning by value
- Only one construction: Default constructor
- **Key Concept:** C++17 guaranteed copy elision eliminates unnecessary copies in return statements

#### Q4
```cpp
#include <iostream>
class A {
public:
    A() {}
    virtual void show() { std::cout << "A\n"; }
};

class B : public A {
public:
    void show() override { std::cout << "B\n"; }
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
- Object slicing occurs when copying B to A by value
- Only A's portion copied, B's data lost
- `a` is type A, not a reference/pointer - no polymorphism
- Virtual function doesn't apply to value objects
- **Key Concept:** Copying derived to base by value causes slicing; use pointers/references for polymorphism

#### Q5
```cpp
#include <iostream>
class A {
public:
    A() = default;
    A(const A&) = delete;
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
- Copy constructor explicitly deleted with `= delete`
- `A a2 = a1;` requires copy constructor
- Compiler error: use of deleted function
- Prevents copying of objects (non-copyable type)
- **Key Concept:** `= delete` explicitly disables copy constructor, making objects non-copyable

#### Q6
```cpp
#include <iostream>
class A {
public:
    A() = default;
    A(A&&) = delete;
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
- Move constructor deleted, but code compiles!
- C++17 guaranteed copy elision applies
- Object constructed directly in place, no move needed
- Even with deleted move constructor, elision bypasses it
- **Key Concept:** Copy elision works even when copy/move constructors are deleted

#### Q7
```cpp
#include <iostream>
class A {
public:
    A() {}
    A(A&&) { std::cout << "Moved\n"; }
};

int main() {
    A a = A();
}
```

**Answer:**
```
(no output)
```

**Explanation:**
- Temporary `A()` constructed directly in `a`'s location
- Copy elision applies, move constructor not called
- Even though move constructor exists, elision preferred
- C++17 guaranteed elision for prvalue temporaries
- **Key Concept:** Copy elision bypasses move constructor for temporaries

#### Q8
```cpp
#include <iostream>
class A {
public:
    A& operator=(A&&) {
        std::cout << "Move Assign\n";
        return *this;
    }
};

int main() {
    A a;
    a = A();
}
```

**Answer:**
```
Move Assign
```

**Explanation:**
- `a` already exists (default constructed)
- `a = A();` assigns temporary to existing object
- Move assignment operator called (not constructor)
- Temporary is rvalue, triggers move assignment
- **Key Concept:** Move assignment used when assigning rvalue to existing object

#### Q9
```cpp
#include <iostream>
class A {
    int* p;
public:
    A() { p = new int[10]; }
    A(const A& other) { p = new int[10]; }
};

int main() {
    A a1;
    A a2 = a1;
}
```

**Answer:**
```
(no output)
```

**Explanation:**
- Custom copy constructor allocates new memory
- Avoids shallow copy (both pointing to same memory)
- However, missing destructor causes memory leak!
- Rule of Three violated: has copy constructor but no destructor
- **Key Concept:** Deep copy allocates separate memory; Rule of Three requires destructor too

#### Q10
```cpp
#include <iostream>
class A {
    int* p;
public:
    A() { p = new int(5); }
    ~A() { delete p; }
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
- Both a1.p and a2.p point to same memory
- Both destructors try to delete same memory (double-delete!)
- Undefined behavior: crash or corruption
- **Key Concept:** Rule of Three: if you define destructor, must define copy constructor to avoid double-delete

#### Q11
```cpp
#include <iostream>
class A {
    int* p;
public:
    A() { p = new int(5); }
    A(const A& other) { p = new int(*other.p); }
    A& operator=(const A& other) {
        if (this != &other) {
            delete p;
            p = new int(*other.p);
        }
        return *this;
    }
    ~A() { delete p; }
};

int main() {
    A a1;
    A a2 = a1;
    A a3;
    a3 = a2;
}
```

**Answer:**
```
(no output)
```

**Explanation:**
- Proper Rule of Three implementation
- Copy constructor: allocates new memory, copies value
- Assignment operator: deletes old, allocates new, copies value
- Destructor: cleans up allocated memory
- Self-assignment check prevents bugs
- **Key Concept:** Rule of Three: destructor, copy constructor, copy assignment operator work together for safe resource management

#### Q12
```cpp
#include <iostream>
class A {
public:
    A() {}
    A(const A&) { std::cout << "Copy\n"; }
    A(A&&) { std::cout << "Move\n"; }
};

A create() {
    A a;
    return std::move(a);
}

int main() {
    A a = create();
}
```

**Answer:**
```
Move
```

**Explanation:**
- `std::move(a)` converts local `a` to rvalue
- Prevents RVO (copy elision) - forces move constructor call
- Anti-pattern: explicit std::move on return prevents optimization
- Without std::move, RVO would apply (no output)
- **Key Concept:** Don't use std::move on local return values - it disables RVO

#### Q13
```cpp
#include <iostream>
class A {
public:
    A(const A&) { std::cout << "Copy\n"; }
};

void take(A a) {}

int main() {
    A a1;
    take(a1);
}
```

**Answer:**
```
Compilation Error
```

**Explanation:**
- No default constructor defined
- `A a1;` requires default constructor
- Only copy constructor declared - suppresses implicit default
- Compiler error: no matching function for call to 'A::A()'
- **Key Concept:** Declaring any constructor suppresses compiler-generated default constructor

#### Q14
```cpp
#include <iostream>
class A {
public:
    ~A() { std::cout << "Destroyed\n"; }
};

int main() {
    A a1;
    A a2 = a1;
}
```

**Answer:**
```
Destroyed
Destroyed
```

**Explanation:**
- Compiler-generated copy constructor used (memberwise copy)
- Two separate objects created: a1 and a2
- End of main(): a2 destroyed first, then a1 (reverse construction order)
- Two destructor calls
- **Key Concept:** Compiler generates copy constructor if not defined; objects destroyed in reverse order

#### Q15
```cpp
#include <iostream>
class A {
public:
    A() = default;
    A(const A&) { std::cout << "Copy\n"; }
};

A make() {
    return A();
}

int main() {
    A a = make();
}
```

**Answer:**
```
(no output)
```

**Explanation:**
- RVO (Return Value Optimization) applies
- Temporary constructed directly in `a`'s location
- Copy constructor not called despite being defined
- C++17 guaranteed copy elision for prvalue returns
- **Key Concept:** RVO applies even when copy constructor has side effects (like printing)

#### Q16
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
- Copy constructor deleted, but code compiles!
- Guaranteed copy elision (C++17) applies
- Object constructed directly in place
- No copy/move needed, deleted constructor irrelevant
- **Key Concept:** Copy elision allows returning non-copyable types by value

#### Q17
```cpp
#include <iostream>
class A {
public:
    A() = default;
    A(A&&) { std::cout << "Move\n"; }
};

A get() {
    A a;
    return a;
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
- NRVO (Named Return Value Optimization) applies
- Local `a` constructed directly in caller's location
- Move constructor not called despite being defined
- Compiler optimizes away the move
- **Key Concept:** NRVO eliminates moves for named local return values

#### Q18
```cpp
#include <iostream>
class A {
public:
    A() {}
    A(A&&) = delete;
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
- Both copy and move constructors deleted
- Still compiles due to guaranteed copy elision (C++17)
- Object constructed directly in place
- No copy/move operation performed
- **Key Concept:** Non-copyable, non-movable types can still be returned by value with elision

#### Q19
```cpp
#include <iostream>
class A {
public:
    A() = default;
    A(const A&) = delete;
    A(A&&) = default;
};

A f() {
    A a;
    return a;
}

int main() {
    A a = f();
}
```

**Answer:**
```
(no output)
```

**Explanation:**
- Move-only type (copy deleted, move defaulted)
- NRVO eliminates the move operation
- Object constructed directly in place
- Move constructor available but not called due to elision
- **Key Concept:** Move-only types work with return by value due to NRVO

#### Q20
```cpp
#include <iostream>
class A {
    int* data;
public:
    A() { data = new int(5); }
    A(const A& rhs) { data = new int(*rhs.data); std::cout << "Deep Copy\n"; }
    ~A() { delete data; }
};

int main() {
    A a1;
    A a2 = a1;
}
```

**Answer:**
```
Deep Copy
```

**Explanation:**
- Copy constructor performs deep copy
- Allocates new memory: `new int(*rhs.data)`
- Copies value, not pointer
- Each object owns separate memory
- **Key Concept:** Deep copy allocates separate memory and copies values for safe resource management

#### Q21
```cpp
#include <iostream>
class A {
public:
    A() = default;
    ~A() = default;
};

class B {
    A a;
public:
    B(const B&) { std::cout << "Copy\n"; }
};

int main() {
    B b1;
    B b2 = b1;
}
```

**Answer:**
```
Compilation Error
```

**Explanation:**
- B has user-defined copy constructor
- User-defined constructor suppresses implicit default constructor
- `B b1;` requires default constructor
- Compiler error: no matching function for call to 'B::B()'
- **Key Concept:** User-defined copy constructor suppresses default constructor generation

#### Q22
```cpp
#include <iostream>
class A {
public:
    A() {}
    A(const A&) { std::cout << "Copy\n"; }
    A(A&&) { std::cout << "Move\n"; }
};

A create() {
    A a;
    return std::move(a);
}

int main() {
    A a = create();
}
```

**Answer:**
```
Move
```

**Explanation:**
- `std::move(a)` forces move constructor call
- Prevents NRVO optimization
- Anti-pattern: explicit std::move on return disables optimization
- Without std::move, NRVO would eliminate any constructor call
- **Key Concept:** Don't std::move local return values - compiler handles it better

#### Q23
```cpp
#include <iostream>
class A {
public:
    A() = default;
    A(const A&) = default;
    A& operator=(const A&) = delete;
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
- Copy constructor allowed (= default)
- Assignment operator deleted (= delete)
- `A a2 = a1;` uses copy constructor - OK
- `a2 = a1;` uses assignment operator - ERROR
- **Key Concept:** Can make types copy-constructible but not assignable for specific use cases

#### Q24
```cpp
#include <iostream>
class A {
public:
    A() = default;
    ~A() = default;
    A(const A&) = delete;
};

void take(A a) {}

int main() {
    A a;
    take(a);
}
```

**Answer:**
```
Compilation Error
```

**Explanation:**
- Copy constructor deleted (= delete)
- `take(a)` passes by value - requires copy
- Compiler error: use of deleted function
- Non-copyable types must be passed by reference or pointer
- **Key Concept:** Deleted copy constructor prevents passing by value

#### Q25
```cpp
#include <iostream>
class A {
public:
    A() { std::cout << "Ctor\n"; }
    A(const A&) { std::cout << "Copy\n"; }
    ~A() { std::cout << "Dtor\n"; }
};

A factory() {
    return A();
}

int main() {
    A obj = factory();
    std::cout << "End\n";
}
```

**Answer:**
```
Ctor
End
Dtor
```

**Explanation:**
- RVO (Return Value Optimization) applies
- Single object constructed directly in `obj`'s location
- No copy constructor called despite being defined
- "End" printed before destruction
- Destructor called when obj goes out of scope
- **Key Concept:** RVO eliminates copies even when copy constructor has observable side effects
