## TOPIC: Type Conversions and Type Deduction in C++

### PRACTICE_TASKS: Output Prediction and Concept Application

#### Q1
```cpp
#include <iostream>

struct A {
    A(int x) { std::cout << "A(" << x << ")\n"; }
};

void test(A obj) {
    std::cout << "test(A)\n";
}

int main() {
    test(42);
}
```

**Answer:**
```
A(42)
test(A)
```

**Explanation:**
- `test(42)` calls test function expecting A object
- 42 is int, not A type
- A has non-explicit constructor `A(int x)` (conversion constructor)
- Compiler implicitly converts: int 42 → A(42)
- Constructor prints "A(42)"
- Then test function executes, prints "test(A)"
- Without explicit keyword, single-arg constructors enable implicit conversions
- **Key Concept:** Non-explicit constructors allow implicit conversions; constructor called automatically

---

#### Q2
```cpp
#include <iostream>

void func(int) { std::cout << "int\n"; }
void func(double) { std::cout << "double\n"; }

int main() {
    short s = 5;
    func(s);
}
```

**Answer:**
```
int
```

**Explanation:**
- `func(s)` where s is short
- Two viable overloads: func(int) and func(double)
- short → int is integral promotion (preferred)
- short → double is standard conversion (less preferred)
- Overload resolution ranking: exact match > promotion > conversion
- Promotion wins, calls func(int)
- Prints "int"
- **Key Concept:** Integral promotions (short/char→int) preferred over standard conversions in overload resolution

---

#### Q3
```cpp
#include <iostream>

int main() {
    const int x = 100;
    auto a = x;
    auto& b = x;
    
    a = 200;
    // b = 300;  // Will this compile?
    
    std::cout << x << " " << a << "\n";
}
```

**Answer:**
```
Compilation error on b = 300
Prints: 100 200
```

**Explanation:**
- `auto a = x` where x is const int
- auto drops top-level const: a deduced as int (mutable copy)
- `auto& b = x` preserves const: b deduced as const int&
- `a = 200` works - a is mutable copy
- `b = 300` fails - cannot modify through const reference
- x remains 100 (unchanged), a is 200
- **Key Concept:** auto drops const/volatile; auto& preserves them; affects mutability

---

#### Q4
```cpp
#include <iostream>

int main() {
    int arr[3] = {1, 2, 3};
    auto x = arr;
    auto& y = arr;
    
    std::cout << sizeof(x) << " " << sizeof(y) << "\n";
}
```

**Answer:**
```
8 12 (on 64-bit systems)
```

**Explanation:**
- `auto x = arr` where arr is int[3]
- auto causes array decay: x deduced as int* (pointer to first element)
- sizeof(x) = sizeof(int*) = 8 bytes (pointer size)
- `auto& y = arr` prevents decay: y is reference to array
- y deduced as int(&)[3] (reference to array of 3 ints)
- sizeof(y) = sizeof(int[3]) = 3 × 4 = 12 bytes (full array size)
- auto decays arrays to pointers, auto& preserves array type
- **Key Concept:** Array decay with auto vs preservation with auto&; affects sizeof behavior

---

#### Q5
```cpp
#include <iostream>

int global = 42;

decltype(auto) getVal() {
    return global;
}

decltype(auto) getRef() {
    return (global);
}

int main() {
    getVal() = 100;    // Will this compile?
    getRef() = 200;    // Will this compile?
    std::cout << global << "\n";
}
```

**Answer:**
```
Compilation error on getVal() = 100
Prints: 200
```

**Explanation:**
- `decltype(auto)` preserves exact type and value category
- `return global` - unparenthesized: returns int by value
- getVal() returns int (prvalue), cannot assign to temporary
- `return (global)` - parenthesized: expression is lvalue
- getRef() returns int& (reference), can assign through it
- `getVal() = 100` fails - assigning to temporary rvalue
- `getRef() = 200` works - assigns through reference to global
- Parentheses change value category in decltype(auto)
- **Key Concept:** decltype(auto) with parentheses returns reference; without returns value

---

#### Q6
```cpp
#include <iostream>

class Wrapper {
public:
    explicit Wrapper(int v) : value(v) { }
    int value;
};

void process(Wrapper w) {
    std::cout << w.value << "\n";
}

int main() {
    process(50);         // Will this compile?
    process(Wrapper(75)); // Will this compile?
}
```

**Answer:**
```
First call fails compilation
Second call prints: 75
```

**Explanation:**
- Wrapper has explicit constructor
- `process(50)` attempts implicit conversion: int → Wrapper
- explicit keyword prevents this implicit conversion (compilation error)
- `process(Wrapper(75))` uses direct construction (allowed)
- Explicitly constructing Wrapper object bypasses implicit conversion rules
- Without explicit, both would compile
- Use explicit to prevent unintended conversions
- **Key Concept:** explicit prevents implicit conversions; direct construction still allowed

---

#### Q7
```cpp
#include <iostream>

void handle(int x) { std::cout << "int: " << x << "\n"; }
void handle(double x) { std::cout << "double: " << x << "\n"; }

int main() {
    char c = 'A';
    float f = 2.5f;
    
    handle(c);
    handle(f);
}
```

**Answer:**
```
int: 65
double: 2.5
```

**Explanation:**
- `handle(c)` where c is char 'A'
- char promotes to int (integral promotion): 'A' = 65 in ASCII
- Calls handle(int), prints "int: 65"
- `handle(f)` where f is float 2.5f
- float promotes to double (floating-point promotion)
- Calls handle(double), prints "double: 2.5"
- Promotions are preferred in overload resolution
- **Key Concept:** Integral promotions (char→int) and floating promotions (float→double) preferred over conversions

---

#### Q8
```cpp
#include <iostream>

int main() {
    auto x = {1, 2, 3};
    std::cout << x.size() << "\n";
    
    for(auto val : x) {
        std::cout << val << " ";
    }
}
```

**Answer:**
```
3
1 2 3
```

**Explanation:**
- `auto x = {1, 2, 3}` with braced-init-list
- Special auto deduction rule: deduces std::initializer_list<int>
- initializer_list has size() method, returns 3
- initializer_list is iterable, supports range-for
- Each element printed: 1 2 3
- Different from `auto x{1, 2, 3}` which would fail (ambiguous)
- Single element `auto x{5}` deduces int (special case)
- **Key Concept:** auto with = and braces deduces initializer_list; has container-like interface

---

#### Q9
```cpp
#include <iostream>

int main() {
    double pi = 3.14159;
    int a = pi;
    int b{pi};  // Will this compile?
    
    std::cout << a << "\n";
}
```

**Answer:**
```
Compilation error on int b{pi}
If only a executed: prints 3
```

**Explanation:**
- `int a = pi` uses copy-initialization (allows narrowing)
- double 3.14159 truncates to int 3 (data loss allowed)
- `int b{pi}` uses brace-initialization (prevents narrowing)
- Narrowing conversion: loss of precision or range (double→int)
- Brace-init detects narrowing at compile time, errors out
- Prevents accidental data loss
- Use braces for safety, = for explicit narrowing intent
- **Key Concept:** Brace-initialization prevents narrowing conversions; safer than copy-initialization

---

#### Q10
```cpp
#include <iostream>

struct Base {
    operator double() const { return 1.5; }
};

struct Derived {
    Derived(double d) { std::cout << "Derived(" << d << ")\n"; }
};

void execute(Derived d) { }

int main() {
    Base b;
    execute(b);  // What happens?
}
```

**Answer:**
```
Derived(1.5)
```

**Explanation:**
- `execute(b)` expects Derived, receives Base
- Base has conversion operator: operator double() returns 1.5
- Derived has conversion constructor: Derived(double)
- Conversion chain: Base → double (user-defined) → Derived (user-defined)
- Standard allows at most one user-defined conversion in chain
- This appears to use two, but it's actually one per step
- Base converts to double, then standard overload resolution finds Derived(double)
- Constructor prints "Derived(1.5)"
- **Key Concept:** Conversion chains allowed with user-defined conversions; enables flexible type compatibility

---

#### Q11
```cpp
#include <iostream>

int main() {
    const int x = 10;
    decltype(x) a = x;
    decltype((x)) b = x;
    
    a = 20;  // Will this compile?
    b = 30;  // Will this compile?
}
```

**Answer:**
```
Both assignments fail compilation
```

**Explanation:**
- `decltype(x)` where x is const int
- Gives declared type of x: const int
- a is const int, immutable
- `decltype((x))` with parentheses gives value category type
- (x) is lvalue expression → decltype gives const int&
- b is const int& (reference to const)
- Both a and b are const, cannot be modified
- `a = 20` fails - const int
- `b = 30` fails - const int&
- **Key Concept:** decltype(name) gives declared type; decltype((name)) gives reference type based on value category

---

#### Q12
```cpp
#include <iostream>

void foo(int) { std::cout << "int\n"; }
void foo(double) { std::cout << "double\n"; }
void foo(long) { std::cout << "long\n"; }

int main() {
    foo('Z');
    foo(100L);
    foo(3.14f);
}
```

**Answer:**
```
int
long
double
```

**Explanation:**
- `foo('Z')` where 'Z' is char
- char promotes to int (integral promotion), calls foo(int)
- Prints "int"
- `foo(100L)` where 100L is long literal
- Exact match with foo(long), calls foo(long)
- Prints "long"
- `foo(3.14f)` where 3.14f is float literal
- float promotes to double (floating promotion), calls foo(double)
- Prints "double"
- Overload resolution prefers: exact match > promotion > conversion
- **Key Concept:** Overload resolution ranks matches; promotions preferred over standard conversions

---

#### Q13
```cpp
#include <iostream>

int main() {
    int x = 42;
    auto&& r1 = x;
    auto&& r2 = 100;
    
    r1 = 50;
    r2 = 200;
    
    std::cout << x << " " << r2 << "\n";
}
```

**Answer:**
```
50 200
```

**Explanation:**
- `auto&& r1 = x` where x is lvalue int
- Forwarding reference collapses to lvalue reference: r1 is int&
- r1 is alias to x
- `r1 = 50` modifies x through reference
- `auto&& r2 = 100` where 100 is rvalue
- Forwarding reference stays as rvalue reference: r2 is int&&
- r2 binds to temporary, lifetime extended
- `r2 = 200` modifies the temporary
- x becomes 50, r2 is 200
- **Key Concept:** auto&& forwarding references collapse differently for lvalues vs rvalues; preserves value category

---

#### Q14
```cpp
#include <iostream>

const int& getData() {
    static const int value = 999;
    return value;
}

int main() {
    auto v1 = getData();
    auto& v2 = getData();
    const auto& v3 = getData();
    
    v1 = 111;  // Will this compile?
    // v2 = 222;  // Will this compile?
    // v3 = 333;  // Will this compile?
    
    std::cout << v1 << "\n";
}
```

**Answer:**
```
Compilation errors on v2 and v3 assignments
Prints: 111
```

**Explanation:**
- getData() returns const int& to static variable
- `auto v1 = getData()` - auto drops const, v1 is int (mutable copy)
- `auto& v2 = getData()` - auto& preserves const, v2 is const int&
- `const auto& v3 = getData()` - explicitly const, v3 is const int&
- `v1 = 111` works - v1 is mutable copy, doesn't affect original
- `v2 = 222` fails - v2 is const reference
- `v3 = 333` fails - v3 is const reference
- v1 is independent copy with value 111
- **Key Concept:** auto drops const from copies; auto& preserves const from references

---

#### Q15
```cpp
#include <iostream>

class String {
public:
    String(const char* s) { std::cout << "String(" << s << ")\n"; }
};

void display(String str) { }

int main() {
    const char* text = "Hello";
    display(text);
    display("World");
}
```

**Answer:**
```
String(Hello)
String(World)
```

**Explanation:**
- String has non-explicit constructor String(const char*)
- `display(text)` where text is const char* "Hello"
- Implicit conversion: const char* → String via constructor
- Constructor prints "String(Hello)"
- `display("World")` passes string literal directly
- String literal is const char*, converts to String
- Constructor prints "String(World)"
- Without explicit, C-strings convert automatically to String
- Convenient but can hide unintended conversions
- **Key Concept:** Conversion constructors enable implicit conversions from compatible types; use explicit to prevent

---

#### Q16
```cpp
#include <iostream>

struct Meters {
    Meters(int m) : value(m) { }
    int value;
};

void travel(Meters m) {
    std::cout << m.value << "m\n";
}

int main() {
    char distance = 50;
    travel(distance);  // What conversion happens?
}
```

**Answer:**
```
50m
```

**Explanation:**
- `travel(distance)` where distance is char with value 50
- char promotes to int (integral promotion): 50
- travel expects Meters object
- Meters has conversion constructor Meters(int)
- Conversion: char → int (promotion) → Meters (constructor)
- Constructor initializes value to 50
- Prints "50m"
- Two-step conversion: promotion + user-defined
- **Key Concept:** Promotions can chain with user-defined conversions; promotion happens first

---

#### Q17
```cpp
#include <iostream>

int main() {
    int large = 300;
    char c1 = large;
    // char c2{large};  // Will this compile?
    
    std::cout << static_cast<int>(c1) << "\n";
}
```

**Answer:**
```
Compilation error on char c2{large}
Prints: 44 (or implementation-defined)
```

**Explanation:**
- `char c1 = large` where large is 300 (exceeds char range)
- Copy-initialization allows narrowing (data loss)
- Signed char range: -128 to 127
- 300 wraps/truncates (implementation-defined behavior)
- Typical: 300 % 256 = 44 or similar truncation
- `char c2{large}` uses brace-initialization
- Brace-init detects narrowing at compile time, errors out
- Prevents silent data loss from out-of-range values
- **Key Concept:** Brace-initialization prevents narrowing; catches out-of-range conversions at compile time

---

#### Q18
```cpp
#include <iostream>

void process(int&) { std::cout << "lvalue\n"; }
void process(int&&) { std::cout << "rvalue\n"; }

int main() {
    int x = 10;
    auto&& r1 = x;
    auto&& r2 = 20;
    
    process(r1);
    process(r2);
}
```

**Answer:**
```
lvalue
lvalue
```

**Explanation:**
- `auto&& r1 = x` where x is lvalue
- r1 collapses to int& (lvalue reference)
- `auto&& r2 = 20` where 20 is rvalue
- r2 stays as int&& (rvalue reference)
- BUT both r1 and r2 are named variables
- Named variables are always lvalues (regardless of type)
- `process(r1)` passes lvalue → calls process(int&)
- `process(r2)` passes lvalue (r2 has name!) → calls process(int&)
- To pass r2 as rvalue: need std::move(r2)
- **Key Concept:** Value category determined by expression, not type; named rvalue references are lvalues

---

#### Q19
```cpp
#include <iostream>

struct Number {
    operator int() const { return 42; }
    operator double() const { return 3.14; }
};

void calculate(int x) { std::cout << "int: " << x << "\n"; }
void calculate(double x) { std::cout << "double: " << x << "\n"; }

int main() {
    Number n;
    calculate(n);  // Will this compile?
}
```

**Answer:**
```
Compilation error: ambiguous conversion
```

**Explanation:**
- Number has two conversion operators: operator int() and operator double()
- `calculate(n)` has two overloads: calculate(int) and calculate(double)
- Compiler considers conversions: n → int or n → double
- Both conversions are user-defined, equally ranked
- No preference between them (ambiguous)
- Overload resolution fails, compilation error
- **Fix:** Explicit conversion: `calculate(static_cast<int>(n))`
- Or explicit call: `calculate(n.operator int())`
- **Key Concept:** Multiple conversion operators can cause ambiguity; prefer explicit conversions

---

#### Q20
```cpp
#include <iostream>

int main() {
    const int x = 50;
    int* p = const_cast<int*>(&x);
    *p = 100;
    
    std::cout << x << " " << *p << "\n";
}
```

**Answer:**
```
Undefined behavior
Typical output: 50 100 or 100 100
```

**Explanation:**
- `const int x = 50` creates truly const object
- `const_cast<int*>(&x)` removes const from pointer
- `*p = 100` modifies through non-const pointer
- Modifying originally const object is undefined behavior
- Compiler may optimize assuming x never changes
- May print "50 100" (compiler cached x value)
- May print "100 100" (modification actually occurred)
- Both valid UB outcomes
- const_cast only safe for originally non-const objects temporarily made const
- **Key Concept:** const_cast to modify truly const objects is UB; only use to remove const added elsewhere

---
