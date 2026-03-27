## TOPIC: Operator Overloading

### PRACTICE_TASKS: Output Prediction and Code Analysis

#### Q1
```cpp
class Counter {
    int val;
public:
    Counter(int v) : val(v) {}
    Counter& operator++() { ++val; return *this; }
    Counter operator++(int) { Counter t = *this; ++val; return t; }
    int get() const { return val; }
};

int main() {
    Counter c(5);
    std::cout << (c++).get() << " " << (++c).get() << " " << c.get();
}
```

**Answer:**
```
5 7 7
```

**Explanation:**
- `c++` calls post-increment: saves copy (val=5), increments c to 6, returns copy with val=5
- `(c++).get()` prints 5
- `++c` calls pre-increment: increments c from 6 to 7, returns *this by reference
- `(++c).get()` prints 7
- `c.get()` prints final value 7
- Pre-increment: returns reference, modifies in-place
- Post-increment: returns value (copy), modifies after returning
- **Key Concept:** Pre-increment returns reference; post-increment returns by value (old state)

---

#### Q2
```cpp
class String {
    char* data;
public:
    String(const char* s) { data = new char[strlen(s)+1]; strcpy(data, s); }
    ~String() { delete[] data; }

    String operator+(const String& other) {
        String result("");
        delete[] result.data;
        result.data = new char[strlen(data) + strlen(other.data) + 1];
        strcpy(result.data, data);
        strcat(result.data, other.data);
        return result;
    }
};

int main() {
    String s1("Hello"), s2(" World");
    String s3 = s1 + s2;
}
```

**Answer:**
```
Undefined behavior (double delete, shallow copy issues)
```

**Explanation:**
- Class has destructor but NO copy constructor or assignment operator
- Violates Rule of Three - compiler generates shallow copy versions
- `operator+` returns String by value, triggering copy
- Compiler-generated copy constructor: shallow copy (copies pointer value)
- Multiple String objects now point to same data
- When temporaries destroyed: double delete on same memory
- **Rule of Three:** If you define destructor, also define copy constructor and assignment
- **Key Concept:** Raw pointer members require custom copy operations; shallow copy causes double-delete

---

#### Q3
```cpp
class A {
public:
    void* operator new(size_t sz) {
        std::cout << "1 ";
        return ::operator new(sz);
    }
    
    A() { std::cout << "2 "; }
    ~A() { std::cout << "3 "; }
    
    void operator delete(void* p) {
        std::cout << "4 ";
        ::operator delete(p);
    }
};

int main() {
    A* obj = new A;
    delete obj;
}
```

**Answer:**
```
1 2 3 4
```

**Explanation:**
- `new A` calls operator new first: allocates memory, prints "1"
- Then constructor A() called: prints "2"
- Object lifecycle: allocation → construction
- `delete obj` calls destructor first: prints "3"
- Then operator delete called: deallocates memory, prints "4"
- Destruction lifecycle: destruction → deallocation
- Custom operator new/delete useful for: memory pools, debugging, tracking
- **Key Concept:** operator new runs before constructor; destructor runs before operator delete

---

#### Q4
```cpp
class Bool {
    bool val;
public:
    Bool(bool v) : val(v) {}
    Bool operator&&(const Bool& other) {
        std::cout << "Called ";
        return Bool(val && other.val);
    }
};

Bool expensive() {
    std::cout << "Expensive ";
    return Bool(true);
}

int main() {
    Bool a(false);
    Bool result = a && expensive();
}
```

**Answer:**
```
Expensive Called
```

**Explanation:**
- Built-in && has short-circuit: if left is false, right not evaluated
- Overloaded operator&& loses short-circuit behavior
- Acts as normal function: all arguments evaluated before function call
- `a && expensive()` evaluates both `a` and `expensive()` first
- expensive() prints "Expensive" before function call
- Then operator&& called, prints "Called"
- **Don't overload:** &&, ||, comma (lose special semantics)
- **Key Concept:** Overloading logical operators loses short-circuit evaluation; always evaluates both operands

---

#### Q5
```cpp
class Complex {
    double real;
public:
    Complex(double r) : real(r) {}
    Complex operator+(const Complex& other) { return Complex(real + other.real); }
};

int main() {
    Complex c1(5.0);
    Complex c2 = c1 + 3.0;  // Line A
    Complex c3 = 3.0 + c1;  // Line B
}
```

**Answer:**
```
Line A compiles, Line B compilation error
```

**Explanation:**
- operator+ is member function: requires left operand to be Complex
- Line A: `c1 + 3.0` → c1.operator+(3.0)
- 3.0 implicitly converts to Complex(3.0) via constructor
- Works because conversion happens on right operand
- Line B: `3.0 + c1` → 3.0.operator+(c1) (impossible!)
- 3.0 is double, has no operator+ taking Complex
- No implicit conversion on left operand for member functions
- **Fix:** Make operator+ friend or non-member function
- **Key Concept:** Member operators require left operand to be class type; non-member for symmetry

---

#### Q6
```cpp
class Holder {
    int val;
public:
    Holder(int v) : val(v) {}
    
    Holder operator=(const Holder& other) {
        val = other.val;
        return *this;
    }
    
    int get() const { return val; }
};

int main() {
    Holder h1(10), h2(20), h3(30);
    h1 = h2 = h3;
    std::cout << h1.get() << " " << h2.get();
}
```

**Answer:**
```
30 20
```

**Explanation:**
- BUG: operator= returns by value, not by reference
- Assignment is right-associative: evaluates right-to-left
- `h2 = h3`: copies h3.val (30) to h2.val, returns COPY with val=30
- `h1 = (copy)`: assigns copy.val (30) to h1.val
- h2.val remains 20 (wasn't reassigned, temporary copy used)
- **Correct:** Return `Holder&` not `Holder`
- Proper: h2 gets 30, then h1 gets 30
- **Key Concept:** Assignment operator must return reference for proper chaining

---

#### Q7
```cpp
class Array {
    int data[5];
public:
    int& operator[](int idx) { return data[idx]; }
    int operator[](int idx) const { return data[idx]; }
};

void test(const Array& arr) {
    arr[0] = 10;
}
```

**Answer:**
```
Compilation error
```

**Explanation:**
- Non-const operator[] returns `int&` (reference, modifiable)
- Const operator[] returns `int` (value, temporary)
- `arr[0] = 10` calls const version (arr is const)
- Returns int by value (temporary)
- Assigning to temporary rvalue is illegal
- **Fix:** Const version should return `const int&`
- Allows reading but prevents modification
- **Key Concept:** Const subscript operators should return const reference, not value

---

#### Q8
```cpp
class Functor {
    int x;
public:
    Functor(int v) : x(v) {}
    int operator()(int a, int b) const { return x + a + b; }
};

int main() {
    Functor f(5);
    std::cout << f(10, 20);
}
```

**Answer:**
```
35
```

**Explanation:**
- Functor is class with operator() overloaded
- Makes objects callable like functions
- `f(10, 20)` calls `f.operator()(10, 20)`
- Calculates: x (5) + a (10) + b (20) = 35
- Functors can hold state (unlike plain functions)
- Commonly used with STL algorithms (transform, for_each, etc.)
- **Key Concept:** operator() makes objects callable; functors store state with behavior

---

#### Q9
```cpp
class Smart {
    int* ptr;
public:
    Smart(int* p) : ptr(p) {}
    ~Smart() { delete ptr; }
    
    int* operator->() { return ptr; }
    int& operator*() { return *ptr; }
};

int main() {
    Smart sp(new int(42));
    std::cout << *sp << " ";
    *sp = 100;
    std::cout << *sp;
}
```

**Answer:**
```
42 100
```

**Explanation:**
- operator* overloaded to return reference to pointed object
- `*sp` dereferences: returns `*ptr` (reference to int)
- First `*sp` reads 42, prints it
- `*sp = 100` modifies through reference
- Second `*sp` reads 100, prints it
- operator-> would enable `sp->member` syntax
- Smart pointer idiom: RAII + operator overloading
- **Key Concept:** operator* and operator-> enable pointer-like syntax for smart pointers

---

#### Q10
```cpp
class Matrix {
public:
    Matrix operator+(const Matrix&) { std::cout << "+ "; return *this; }
    Matrix operator*(const Matrix&) { std::cout << "* "; return *this; }
};

int main() {
    Matrix a, b, c;
    Matrix result = a + b * c;
}
```

**Answer:**
```
* +
```

**Explanation:**
- Operator precedence unchanged by overloading
- Built-in precedence: * higher than +
- Expression: `a + b * c`
- Evaluates as: `a + (b * c)` due to precedence
- `b * c` executes first, prints "*"
- Then `a + result` executes, prints "+"
- Cannot change precedence/associativity via overloading
- **Key Concept:** Overloading preserves built-in operator precedence and associativity

---

#### Q11
```cpp
class Point {
    int x, y;
public:
    Point(int x, int y) : x(x), y(y) {}
    
    friend Point operator+(int lhs, const Point& rhs) {
        return Point(lhs + rhs.x, rhs.y);
    }
    
    Point operator+(int rhs) const {
        return Point(x + rhs, y);
    }
};

int main() {
    Point p(5, 10);
    Point p1 = p + 3;   // Line A
    Point p2 = 3 + p;   // Line B
}
```

**Answer:**
```
Both compile and work
```

**Explanation:**
- Line A: `p + 3` calls member `p.operator+(3)`
- Line B: `3 + p` calls friend `operator+(3, p)`
- Member operator+ handles Point + int
- Friend operator+ handles int + Point (commutativity)
- Friend function accesses private members via friendship
- Friend enables symmetric operations
- Member functions can't have left operand be non-class type
- **Key Concept:** Use friend functions for symmetric/commutative operators

---

#### Q12
```cpp
class Widget {
public:
    Widget& operator++() {
        std::cout << "Pre ";
        return *this;
    }
    
    Widget& operator++(int) {
        std::cout << "Post ";
        return *this;
    }
};

int main() {
    Widget w;
    ++w;
    w++;
}
```

**Answer:**
```
Pre Post
```

**Explanation:**
- BUG: Post-increment returns reference, should return by value
- `++w` calls pre-increment, prints "Pre"
- `w++` calls post-increment, prints "Post"
- Post-increment should return copy of old value
- Returning reference makes it behave like pre-increment
- **Correct:** `Widget operator++(int) { Widget old = *this; /* increment */; return old; }`
- **Key Concept:** Post-increment must return by value (old state); pre-increment returns reference

---

#### Q13
```cpp
class Logged {
public:
    void* operator new(size_t sz, const char* msg) {
        std::cout << msg << " ";
        return ::operator new(sz);
    }
    
    Logged() { std::cout << "Ctor "; }
};

int main() {
    Logged* obj = new ("Allocating") Logged();
}
```

**Answer:**
```
Allocating Ctor
```

**Explanation:**
- Custom operator new with extra parameters (placement-style)
- `new ("Allocating") Logged()` syntax
- Passes "Allocating" to custom operator new
- operator new prints message, allocates memory
- Then constructor runs, prints "Ctor"
- Useful for: logging, custom allocators, placement new variants
- **Key Concept:** operator new can take extra parameters for custom allocation strategies

---

#### Q14
```cpp
class X {
public:
    X operator+(const X&) { return *this; }
};

class Y : public X {
public:
    Y operator+(const Y&) { return *this; }
};

int main() {
    Y y1, y2;
    X x = y1 + y2;
}
```

**Answer:**
```
Compiles, uses Y::operator+
```

**Explanation:**
- Y inherits from X, has own operator+
- `y1 + y2` calls `Y::operator+(const Y&)`
- Returns Y object
- Assignment `X x = result` causes object slicing (Y→X)
- Y's extra data (if any) sliced off
- Overloaded operators don't participate in polymorphism (not virtual)
- **Key Concept:** Derived class operators don't override base; slicing occurs on assignment

---

#### Q15
```cpp
class Index {
    int val;
public:
    Index(int v) : val(v) {}
    
    int operator[](int) & { return val; }
    int operator[](int) && { return val + 100; }
};

Index getIndex() { return Index(5); }

int main() {
    Index idx(10);
    std::cout << idx[0] << " " << getIndex()[0];
}
```

**Answer:**
```
10 105
```

**Explanation:**
- Ref-qualified operators (C++11): & for lvalues, && for rvalues
- `idx[0]` where idx is lvalue calls & version, returns 10
- `getIndex()[0]` where getIndex() returns rvalue calls && version
- Rvalue version calculates: val (5) + 100 = 105
- Allows different behavior for temporary vs persistent objects
- Useful for: avoiding copies on temporaries, move-only operations
- **Key Concept:** Ref qualifiers enable different behavior for lvalue vs rvalue objects

---

#### Q16
```cpp
class Stream {
public:
    Stream& operator<<(int) { std::cout << "int "; return *this; }
    Stream& operator<<(double) { std::cout << "double "; return *this; }
};

int main() {
    Stream s;
    s << 5 << 3.14 << 10;
}
```

**Answer:**
```
int double int
```

**Explanation:**
- Stream class with operator<< overloaded for int and double
- `s << 5 << 3.14 << 10` chains left-to-right
- Evaluates as: `s.operator<<(5).operator<<(3.14).operator<<(10)`
- First call: `s << 5` matches int overload, prints "int", returns s&
- Second call: `result << 3.14` matches double overload, prints "double", returns s&
- Third call: `result << 10` matches int overload, prints "int"
- Each operator<< returns reference enabling chaining
- Overload resolution selects based on parameter type
- **Key Concept:** Operator chaining requires returning reference; overload resolution picks best match per parameter

---

#### Q17
```cpp
class Base {
public:
    virtual Base& operator=(const Base& other) {
        std::cout << "Base= ";
        return *this;
    }
};

class Derived : public Base {
public:
    Derived& operator=(const Derived& other) {
        std::cout << "Derived= ";
        Base::operator=(other);
        return *this;
    }
};

int main() {
    Derived d1, d2;
    Base& b = d1;
    b = d2;
}
```

**Answer:**
```
Derived= Base=
```

**Explanation:**
- Base has virtual operator= (can be overridden)
- Derived overrides with own operator=
- `b = d2` where b is Base& referring to Derived object
- Virtual dispatch: calls Derived::operator= (runtime polymorphism)
- Derived::operator= prints "Derived=", then explicitly calls Base::operator=
- Base::operator= prints "Base="
- Virtual assignment operators enable polymorphic assignment
- Different from non-virtual: would call Base version only
- **Key Concept:** Virtual assignment operators enable polymorphic behavior; derived version can extend base behavior

---

#### Q18
```cpp
class Safe {
public:
    explicit operator bool() const { return true; }
};

int main() {
    Safe s;
    if (s) std::cout << "A ";
    bool b = s;
    int x = s + 5;
}
```

**Answer:**
```
"A" printed, then compile errors
```

**Explanation:**
- Safe class has explicit operator bool
- `if (s)` works - contextual conversion to bool allowed (language rule)
- Contextual conversions: if conditions, loops, \!, &&, ||
- `bool b = s` fails - explicit prevents implicit conversion
- Cannot use in copy-initialization or assignment
- `int x = s + 5` fails - explicit prevents arithmetic conversion
- Would first convert to bool, then bool to int (not allowed)
- Without explicit: dangerous implicit conversions possible
- **Key Concept:** Explicit conversion operators prevent implicit conversions; only allow contextual conversions

---

#### Q19
```cpp
class Mult {
    int factor;
public:
    Mult(int f) : factor(f) {}
    int operator()(int x) const { return x * factor; }
};

int main() {
    std::vector<int> v = {1, 2, 3, 4};
    std::transform(v.begin(), v.end(), v.begin(), Mult(3));
    for (int x : v) std::cout << x << " ";
}
```

**Answer:**
```
3 6 9 12
```

**Explanation:**
- Mult is functor class with operator() overloaded
- operator() takes int parameter, multiplies by stored factor
- `Mult(3)` creates temporary functor with factor=3
- std::transform applies functor to each element in range
- Transformation: v.begin() to v.end(), result stored back in v
- For each element: calls `Mult(3).operator()(element)`
- 1*3=3, 2*3=6, 3*3=9, 4*3=12
- Functors hold state (factor) unlike plain functions
- **Key Concept:** Functors combine behavior with state; perfect for STL algorithms needing parameterized operations

---

#### Q20
```cpp
class Mystery {
public:
    Mystery operator,(const Mystery& other) {
        std::cout << ", ";
        return other;
    }
};

int main() {
    Mystery a, b, c;
    Mystery result = (a, b, c);
}
```

**Answer:**
```
, ,
```

**Explanation:**
- Mystery class overloads comma operator
- Built-in comma: evaluates left, discards, evaluates right, returns right
- Overloaded comma: becomes regular function call (loses special semantics)
- `(a, b, c)` evaluates as: `(a.operator,(b)).operator,(c)`
- First: `a, b` calls operator, prints ",", returns b (as Mystery copy)
- Second: `result, c` calls operator, prints ",", returns c
- Lost sequence point guarantees of built-in comma
- Evaluation order becomes function call semantics
- **Don't overload comma** - loses important properties
- **Key Concept:** Overloading comma operator is anti-pattern; loses sequencing semantics and left-to-right evaluation guarantees

---
