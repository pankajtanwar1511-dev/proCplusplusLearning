## TOPIC: Operator Overloading

### THEORY_SECTION: Core Concepts and Fundamentals

#### 1. What is Operator Overloading and How It Works

Operator overloading allows you to redefine how operators (`+`, `-`, `*`, `[]`, `()`, etc.) behave when applied to user-defined types (classes). This enables custom types to interact using familiar syntax, making code more intuitive and expressive.

**Core Principle: Operators are functions with special names that the compiler recognizes.**

When you write `a + b`, the compiler translates this to either:
- `a.operator+(b)` (if `operator+` is a member function), or
- `operator+(a, b)` (if `operator+` is a non-member function)

| Aspect | Details |
|--------|---------|
| **What it is** | Giving custom meaning to operators for user-defined types |
| **Syntax** | `ReturnType operator@(parameters)` where `@` is the operator symbol |
| **Mechanism** | Compiler translates `a @ b` to function call `operator@(a, b)` or `a.operator@(b)` |
| **Purpose** | Make custom types behave like built-in types |
| **Scope** | Can only redefine existing operators; cannot create new operators |
| **Semantics** | Behavior changes, but precedence, associativity, and arity remain fixed |

**What Can and Cannot Be Overloaded**

| Category | Operators | Can Overload? |
|----------|-----------|---------------|
| **Arithmetic** | `+`, `-`, `*`, `/`, `%` | ✅ Yes |
| **Comparison** | `==`, `!=`, `<`, `>`, `<=`, `>=`, `<=>` (C++20) | ✅ Yes |
| **Logical** | `&&`, `||`, `!` | ✅ Yes (but avoid `&&` and `||`) |
| **Bitwise** | `&`, `|`, `^`, `~`, `<<`, `>>` | ✅ Yes |
| **Assignment** | `=`, `+=`, `-=`, `*=`, `/=`, etc. | ✅ Yes |
| **Increment/Decrement** | `++`, `--` (both pre and post) | ✅ Yes |
| **Subscript** | `[]` | ✅ Yes |
| **Function call** | `()` | ✅ Yes |
| **Member access** | `->`, `->*` | ✅ Yes (`->` only, `->*` rarely) |
| **Comma** | `,` | ✅ Yes (but shouldn't) |
| **Memory management** | `new`, `delete`, `new[]`, `delete[]` | ✅ Yes |
| **Type conversion** | `operator T()` | ✅ Yes |
| **Scope resolution** | `::` | ❌ **Cannot** overload |
| **Member selection** | `.` | ❌ **Cannot** overload |
| **Pointer-to-member** | `.*` | ❌ **Cannot** overload |
| **Ternary conditional** | `?:` | ❌ **Cannot** overload |
| **sizeof** | `sizeof` | ❌ **Cannot** overload |
| **typeid** | `typeid` | ❌ **Cannot** overload |

**Why Certain Operators Cannot Be Overloaded**

| Operator | Why Not Overloadable | Reasoning |
|----------|---------------------|-----------|
| `::` | Scope resolution | Requires compile-time name resolution |
| `.` | Member access | Compiler needs fixed offset calculation at compile time |
| `.*` | Pointer-to-member | Requires compile-time member offset knowledge |
| `?:` | Ternary conditional | Short-circuit evaluation must be preserved |
| `sizeof` | Size query | Must resolve at compile time |
| `typeid` | Type information | Requires compile-time RTTI access |

**Code Example: Basic Operator Overloading**

```cpp
#include <iostream>

class Complex {
    double real_, imag_;

public:
    Complex(double r = 0, double i = 0) : real_(r), imag_(i) {}

    // ✅ MEMBER FUNCTION: left operand is implicit 'this'
    Complex operator+(const Complex& rhs) const {
        return Complex(real_ + rhs.real_, imag_ + rhs.imag_);
    }

    // ✅ MEMBER FUNCTION: compound assignment
    Complex& operator+=(const Complex& rhs) {
        real_ += rhs.real_;
        imag_ += rhs.imag_;
        return *this;  // Return reference for chaining
    }

    // ✅ FRIEND FUNCTION: enables symmetric operations
    friend Complex operator-(const Complex& lhs, const Complex& rhs) {
        return Complex(lhs.real_ - rhs.real_, lhs.imag_ - rhs.imag_);
    }

    void print() const {
        std::cout << real_ << " + " << imag_ << "i\n";
    }
};

int main() {
    Complex c1(3, 4), c2(1, 2);

    // Using overloaded operators
    Complex c3 = c1 + c2;      // Calls c1.operator+(c2)
    c3.print();                 // 4 + 6i

    c1 += c2;                   // Calls c1.operator+=(c2)
    c1.print();                 // 4 + 6i

    Complex c4 = c1 - c2;       // Calls operator-(c1, c2)
    c4.print();                 // 3 + 4i
}
```

**Operator Overloading vs Regular Functions**

| Feature | Operator Overloading | Regular Function |
|---------|---------------------|------------------|
| **Syntax** | `a + b` | `add(a, b)` |
| **Readability** | More intuitive for mathematical/container types | More explicit about what's happening |
| **Name** | Fixed (`operator+`, `operator[]`, etc.) | Any valid identifier |
| **Call site** | Looks like built-in operation | Function call syntax |
| **Precedence** | Fixed by language (can't change) | N/A (not used in expressions) |
| **When to use** | Types with clear operator semantics (math, containers) | Operations without obvious operator mapping |

---

#### 2. Member Functions vs Friend Functions - When to Use Each

Operator overloading can be implemented as either **member functions** or **non-member functions** (typically `friend` to access private members). The choice significantly impacts design and usage.

**Member Function Approach**

```cpp
class Vector {
    double x_, y_;

public:
    Vector(double x, double y) : x_(x), y_(y) {}

    // Member function: left operand is implicit 'this'
    Vector operator+(const Vector& rhs) const {
        return Vector(x_ + rhs.x_, y_ + rhs.y_);
    }

    // Signature: Vector Vector::operator+(const Vector&) const
    // Usage: v1 + v2  →  v1.operator+(v2)
};
```

**Friend Function Approach**

```cpp
class Vector {
    double x_, y_;

public:
    Vector(double x, double y) : x_(x), y_(y) {}

    // Friend function: both operands are explicit
    friend Vector operator+(const Vector& lhs, const Vector& rhs) {
        return Vector(lhs.x_ + rhs.x_, lhs.y_ + rhs.y_);
    }

    // Signature: Vector operator+(const Vector&, const Vector&)
    // Usage: v1 + v2  →  operator+(v1, v2)
};
```

**Member vs Friend: Key Differences**

| Aspect | Member Function | Friend/Non-Member Function |
|--------|----------------|----------------------------|
| **Left operand** | Must be object of the class (implicit `this`) | Can be any type (explicit parameter) |
| **Parameters** | N-1 (for binary operators) | N (all explicit) |
| **Signature** | `T T::operator@(const T&) const` | `T operator@(const T&, const T&)` |
| **Access to private** | Direct (member of class) | Via `friend` declaration or public interface |
| **Implicit conversions** | Only on right operand | On both operands |
| **Symmetric operations** | ❌ Cannot do `5 + obj` | ✅ Can do both `obj + 5` and `5 + obj` |
| **Typical use** | When left operand is always the class | When symmetry or external types needed |

**When Member Functions Fail: The Symmetry Problem**

```cpp
class Dollars {
    double amount_;

public:
    Dollars(double amt) : amount_(amt) {}

    // ❌ MEMBER FUNCTION: only works one way
    Dollars operator+(double rhs) const {
        return Dollars(amount_ + rhs);
    }
};

Dollars d(100);
Dollars d1 = d + 50;    // ✅ Works: d.operator+(50)
Dollars d2 = 50 + d;    // ❌ ERROR: int doesn't have operator+(Dollars)
```

**Solution: Friend Function for Symmetry**

```cpp
class Dollars {
    double amount_;

public:
    Dollars(double amt) : amount_(amt) {}

    // ✅ FRIEND FUNCTION: symmetric operations
    friend Dollars operator+(const Dollars& lhs, double rhs) {
        return Dollars(lhs.amount_ + rhs);
    }

    friend Dollars operator+(double lhs, const Dollars& rhs) {
        return Dollars(lhs + rhs.amount_);
    }
};

Dollars d(100);
Dollars d1 = d + 50;    // ✅ Works: operator+(d, 50)
Dollars d2 = 50 + d;    // ✅ Works: operator+(50, d)
```

**Which Operators MUST Be Members**

C++ language rules **require** certain operators to be member functions:

| Operator | Must Be Member? | Reason |
|----------|----------------|---------|
| `=` (assignment) | ✅ **Yes** | Ensures left operand is always an object of the class |
| `[]` (subscript) | ✅ **Yes** | Requires object context for array-like access |
| `()` (function call) | ✅ **Yes** | Defines callable behavior of objects (functors) |
| `->` (arrow) | ✅ **Yes** | Smart pointer semantics require object as base |
| Type conversion (`operator T()`) | ✅ **Yes** | Conversion from class type requires member |

**Decision Tree: Member or Friend?**

```
Is the operator one of =, [], (), ->, or a conversion operator?
├─ Yes → MUST be member function (language requirement)
└─ No → Continue...
    ↓
Do you need symmetric operations (like int + Complex AND Complex + int)?
├─ Yes → Use friend/non-member function
└─ No → Continue...
    ↓
Is the left operand always your class?
├─ Yes → Prefer member function (simpler, natural)
└─ No → Use friend/non-member function
    ↓
Does the operator modify the left operand (like +=, -=, *=)?
├─ Yes → Prefer member function (natural to modify 'this')
└─ No → Either works; choose based on style/design
```

**Best Practices Summary**

| Operator Type | Recommended Implementation | Example |
|---------------|---------------------------|---------|
| **Assignment** (`=`, `+=`, `-=`, etc.) | Member (required for `=`) | `T& operator=(const T&)` |
| **Arithmetic** (`+`, `-`, `*`, `/`) | Friend (for symmetry) | `friend T operator+(const T&, const T&)` |
| **Comparison** (`==`, `!=`, `<`, etc.) | Friend (for symmetry) | `friend bool operator==(const T&, const T&)` |
| **Stream I/O** (`<<`, `>>`) | Friend (stream is left operand) | `friend ostream& operator<<(ostream&, const T&)` |
| **Subscript** (`[]`) | Member (required) | `T& operator[](size_t)` |
| **Function call** (`()`) | Member (required) | `RetType operator()(Args...)` |
| **Increment/Decrement** (`++`, `--`) | Member (modifies object) | `T& operator++()` |
| **Arrow** (`->`) | Member (required) | `T* operator->()` |
| **Unary** (`-`, `!`, `~`) | Member (single operand) | `T operator-() const` |

---

#### 3. Common Patterns and Return Type Guidelines

Understanding correct return types is crucial for proper operator overloading. Incorrect return types can break chaining, cause inefficiency, or create dangling references.

**Assignment Operators: Return *this by Reference**

| Operator | Return Type | Reason | Example |
|----------|-------------|--------|---------|
| `operator=` | `T&` | Enable chaining (`a = b = c`), avoid copy | `T& operator=(const T& rhs) { /*...*/ return *this; }` |
| `operator+=` | `T&` | Modify in place, enable chaining | `T& operator+=(const T& rhs) { /*...*/ return *this; }` |
| `operator-=` | `T&` | Modify in place, enable chaining | `T& operator-=(const T& rhs) { /*...*/ return *this; }` |
| All compound assignment | `T&` | Consistent with built-in behavior | `T& operator@=(const T&)` |

**Arithmetic Operators: Return by Value**

| Operator | Return Type | Reason | Example |
|----------|-------------|--------|---------|
| `operator+` | `T` (by value) | Create new object, don't modify operands | `T operator+(const T& lhs, const T& rhs)` |
| `operator-` | `T` (by value) | Create new object | `T operator-(const T& lhs, const T& rhs)` |
| `operator*` | `T` (by value) | Create new object | `T operator*(const T& lhs, const T& rhs)` |
| Unary `-` | `T` (by value) | Return negated copy | `T operator-() const` |

**Increment/Decrement: Pre vs Post**

| Operator | Return Type | Dummy Parameter | Returns | Example |
|----------|-------------|----------------|---------|---------|
| Pre-increment `++obj` | `T&` (reference) | None | Modified object (efficient) | `T& operator++() { ++val; return *this; }` |
| Post-increment `obj++` | `T` (by value) | `int` (unused) | Old value (copy) | `T operator++(int) { T tmp = *this; ++val; return tmp; }` |
| Pre-decrement `--obj` | `T&` (reference) | None | Modified object | `T& operator--() { --val; return *this; }` |
| Post-decrement `obj--` | `T` (by value) | `int` (unused) | Old value (copy) | `T operator--(int) { T tmp = *this; --val; return tmp; }` |

**Why Post-increment is Less Efficient**

```cpp
// Pre-increment: efficient
Iterator& operator++() {
    advance();           // Move forward
    return *this;        // Return reference (no copy)
}

// Post-increment: less efficient
Iterator operator++(int) {
    Iterator old = *this;  // ❌ Create copy
    advance();              // Move forward
    return old;             // ❌ Return copy (another copy on return)
}

// Performance comparison
for (Iterator it = begin; it != end; ++it)   // ✅ Efficient: no copies
for (Iterator it = begin; it != end; it++)   // ❌ Less efficient: 2 copies per iteration
```

**Comparison Operators: Return bool**

| Operator | Return Type | Example |
|----------|-------------|---------|
| `operator==` | `bool` | `bool operator==(const T& lhs, const T& rhs)` |
| `operator!=` | `bool` | `bool operator!=(const T& lhs, const T& rhs)` |
| `operator<` | `bool` | `bool operator<(const T& lhs, const T& rhs)` |
| `operator>` | `bool` | `bool operator>(const T& lhs, const T& rhs)` |
| `operator<=` | `bool` | `bool operator<=(const T& lhs, const T& rhs)` |
| `operator>=` | `bool` | `bool operator>=(const T& lhs, const T& rhs)` |
| `operator<=>` (C++20) | `auto` or ordering type | `auto operator<=>(const T&) const = default;` |

**Subscript Operator: Both Const and Non-Const**

```cpp
class Array {
    int* data_;
    size_t size_;

public:
    // ✅ Non-const: allows modification
    int& operator[](size_t idx) {
        return data_[idx];
    }

    // ✅ Const: read-only access
    const int& operator[](size_t idx) const {
        return data_[idx];
    }
};

Array arr;
arr[0] = 10;          // Calls non-const version

const Array carr;
int x = carr[0];      // Calls const version
// carr[0] = 10;      // ❌ Error: const version returns const reference
```

**Stream Operators: Return Stream by Reference**

| Operator | Signature | Return | Purpose |
|----------|-----------|--------|---------|
| `operator<<` | `ostream& operator<<(ostream& os, const T& obj)` | `ostream&` | Enable chaining: `cout << a << b << c` |
| `operator>>` | `istream& operator>>(istream& is, T& obj)` | `istream&` | Enable chaining: `cin >> a >> b >> c` |

```cpp
class Point {
    int x_, y_;

public:
    friend ostream& operator<<(ostream& os, const Point& p) {
        os << "(" << p.x_ << ", " << p.y_ << ")";
        return os;  // ✅ Must return stream for chaining
    }
};

Point p1(3, 4), p2(5, 6);
cout << "Points: " << p1 << " and " << p2 << "\n";
// Chaining works because each operator<< returns ostream&
```

**Function Call Operator (Functors)**

```cpp
class Multiplier {
    int factor_;

public:
    Multiplier(int f) : factor_(f) {}

    // Can have multiple overloads with different signatures
    int operator()(int x) const {
        return x * factor_;
    }

    int operator()(int x, int y) const {
        return (x + y) * factor_;
    }
};

Multiplier times3(3);
cout << times3(10);       // 30  (calls operator()(int))
cout << times3(10, 20);   // 90  (calls operator()(int, int))
```

**Common Return Type Mistakes**

| Mistake | Code | Problem | Fix |
|---------|------|---------|-----|
| **Return by value from assignment** | `T operator=(const T&)` | Breaks chaining, inefficient | `T& operator=(const T&)` |
| **Return by reference from post-increment** | `T& operator++(int)` | Dangling reference to local | `T operator++(int)` |
| **Not returning stream** | `void operator<<(ostream&, const T&)` | Breaks chaining | `ostream& operator<<(...)` |
| **Return by value from subscript** | `T operator[](size_t)` | Can't modify: `arr[i] = x` fails | `T& operator[](size_t)` |
| **Forgetting const in comparison** | `bool operator==(const T&)` | Can't compare const objects | `bool operator==(const T&) const` |

**Best Practice Checklist**

| Pattern | Guideline |
|---------|-----------|
| ✅ Assignment operators return `*this` by reference | Enables chaining and matches built-in behavior |
| ✅ Arithmetic operators return new object by value | Don't modify operands |
| ✅ Comparison operators marked `const` | Don't modify objects being compared |
| ✅ Pre-increment returns reference, post returns value | Efficiency and correct semantics |
| ✅ Provide both const and non-const `operator[]` | Const-correctness |
| ✅ Stream operators return stream by reference | Enable chaining |
| ✅ Check for self-assignment in `operator=` | Prevent bugs: `if (this != &other)` |
| ✅ Mark conversion operators `explicit` | Prevent unwanted implicit conversions |
| ❌ Don't overload `&&`, `||`, `,` | Lose important built-in semantics |
| ❌ Don't change semantics dramatically | `+` should add, not multiply |

---

### EDGE_CASES: Tricky Scenarios and Gotchas

#### Edge Case 1: Non-Overloadable Operators

Not all operators can be overloaded in C++. The **scope resolution operator** (`::`), **member access operator** (`.`), **pointer-to-member operator** (`.*`), **ternary conditional** (`?:`), and **sizeof** operator cannot be overloaded because they require compile-time resolution or fixed semantics that the compiler must control.

```cpp
class Attempt {
    // ❌ Cannot overload these operators
    // void operator.();     // Compiler error
    // void operator::();    // Compiler error
    // void operator.*();    // Compiler error
    // void operator?:();    // Compiler error
};
```

The language designers deliberately restricted these operators to maintain predictable compile-time behavior and prevent breaking fundamental language semantics.

#### Edge Case 2: Short-Circuit Behavior Loss

Overloading logical operators `&&` and `||` causes them to lose their **short-circuit evaluation** behavior. When overloaded, they become regular function calls where all arguments are evaluated before the function executes.

```cpp
class Bool {
    bool value;
public:
    Bool(bool v) : value(v) {}
    
    // ❌ This loses short-circuit behavior
    Bool operator&&(const Bool& other) {
        return Bool(value && other.value);
    }
};

Bool expensive_computation() {
    std::cout << "Called!\n";
    return Bool(false);
}

int main() {
    Bool a(false);
    Bool b = a && expensive_computation();  // Still calls expensive_computation()!
}
```

For built-in types, `false && expensive()` would never call `expensive()`, but with overloaded operators, both operands are evaluated first.

#### Edge Case 3: Member vs Friend for Symmetry

When you need symmetric operations (like `Complex + int` and `int + Complex`), member functions fail because the left operand must be an object of the class.

```cpp
class Complex {
    double real, imag;
public:
    Complex(double r, double i) : real(r), imag(i) {}
    
    // ✅ Works for: complex + 5
    Complex operator+(int n) const {
        return Complex(real + n, imag);
    }
    
    // ❌ Cannot make this work as member for: 5 + complex
};

// ✅ Solution: Use friend function for symmetry
friend Complex operator+(int n, const Complex& c) {
    return Complex(c.real + n, c.imag);
}
```

Without the friend version, `5 + complex` would fail to compile because `int` doesn't have an `operator+` that takes `Complex`.

#### Edge Case 4: Return Type Confusion in Increment Operators

A common mistake is returning by reference in post-increment or returning by value in pre-increment, which breaks expected semantics.

```cpp
class Counter {
    int value;
public:
    Counter(int v) : value(v) {}
    
    // ✅ Pre-increment: return by reference for chaining
    Counter& operator++() {
        ++value;
        return *this;
    }
    
    // ❌ WRONG: returning reference to local variable
    Counter& operator++(int) {
        Counter temp = *this;
        ++value;
        return temp;  // Dangling reference!
    }
    
    // ✅ CORRECT: post-increment returns by value
    Counter operator++(int) {
        Counter temp = *this;
        ++value;
        return temp;
    }
};
```

Post-increment must return the old value by value, while pre-increment returns the modified object by reference.

#### Edge Case 5: Sized Deallocation in operator delete

In C++14 and later, `operator delete` can optionally receive the size of the deleted object, but this behavior is implementation-dependent.

```cpp
class A {
public:
    void operator delete(void* p, std::size_t size) {
        std::cout << "Deleting " << size << " bytes\n";
        ::operator delete(p);
    }
};

int main() {
    A* obj = new A;
    delete obj;  // May or may not call sized delete depending on compiler
}
```

For maximum portability, provide both the sized and unsized versions of `operator delete`.

#### Edge Case 6: Assignment Operator Cannot Be Friend

The assignment operator (`operator=`) **must** be a member function and cannot be overloaded as a non-member function.

```cpp
class X {
public:
    // ✅ CORRECT: Assignment as member
    X& operator=(const X& other) {
        if (this != &other) {
            // Copy logic
        }
        return *this;
    }
    
    // ❌ WRONG: Cannot overload as friend
    // friend X& operator=(X& lhs, const X& rhs);  // Compiler error!
};
```

This restriction ensures that assignment always has access to the left operand's private members and prevents ambiguity.

---

### CODE_EXAMPLES: Practical Demonstrations

#### Example 1: Basic Arithmetic Operator (Member Function)

```cpp
class Complex {
    double real, imag;
public:
    Complex(double r = 0, double i = 0) : real(r), imag(i) {}
    
    // Member function: left operand is implicit 'this'
    Complex operator+(const Complex& other) const {
        return Complex(real + other.real, imag + other.imag);
    }
    
    void display() const {
        std::cout << real << " + " << imag << "i\n";
    }
};

int main() {
    Complex c1(3, 4), c2(1, 2);
    Complex c3 = c1 + c2;  // Calls c1.operator+(c2)
    c3.display();  // Outputs: 4 + 6i
}
```

Member function approach works when the left operand is always an object of the class. The operator takes one parameter (the right operand) because `this` provides the left operand.

#### Example 2: Symmetric Operations with Friend Functions

```cpp
class Complex {
    double real, imag;
public:
    Complex(double r = 0, double i = 0) : real(r), imag(i) {}
    
    // ✅ Friend function enables: complex + int AND int + complex
    friend Complex operator+(const Complex& lhs, const Complex& rhs) {
        return Complex(lhs.real + rhs.real, lhs.imag + rhs.imag);
    }
    
    friend Complex operator+(const Complex& c, double val) {
        return Complex(c.real + val, c.imag);
    }
    
    friend Complex operator+(double val, const Complex& c) {
        return Complex(c.real + val, c.imag);
    }
};

int main() {
    Complex c(3, 4);
    Complex r1 = c + 5;    // ✅ Works
    Complex r2 = 5 + c;    // ✅ Also works (due to friend)
}
```

Friend functions provide symmetry for mixed-type operations. The constructor `Complex(double)` enables implicit conversion for seamless integration.

#### Example 3: Pre-increment vs Post-increment

```cpp
class Counter {
    int value;
public:
    Counter(int v = 0) : value(v) {}
    
    // ✅ Pre-increment: ++obj (efficient, returns reference)
    Counter& operator++() {
        ++value;
        return *this;  // Return modified object
    }
    
    // ✅ Post-increment: obj++ (less efficient, returns old value)
    Counter operator++(int) {  // 'int' is dummy parameter
        Counter temp = *this;  // Save old state
        ++value;               // Modify current object
        return temp;           // Return old state
    }
    
    int get() const { return value; }
};

int main() {
    Counter c(5);
    std::cout << (++c).get() << "\n";  // 6 (increments first)
    std::cout << (c++).get() << "\n";  // 6 (returns old value)
    std::cout << c.get() << "\n";      // 7 (now incremented)
}
```

Pre-increment is more efficient because it doesn't create a temporary copy. Post-increment requires the dummy `int` parameter to distinguish it from pre-increment.

#### Example 4: Subscript Operator for Custom Array

```cpp
class IntArray {
    int* data;
    size_t size;
public:
    IntArray(size_t sz) : size(sz), data(new int[sz]()) {}
    ~IntArray() { delete[] data; }
    
    // ✅ Non-const version: allows modification
    int& operator[](size_t index) {
        if (index >= size) throw std::out_of_range("Index out of bounds");
        return data[index];
    }
    
    // ✅ Const version: for read-only access
    const int& operator[](size_t index) const {
        if (index >= size) throw std::out_of_range("Index out of bounds");
        return data[index];
    }
};

int main() {
    IntArray arr(5);
    arr[0] = 10;           // Uses non-const operator[]
    std::cout << arr[0];   // Can read the value
    
    const IntArray carr(3);
    // carr[0] = 20;       // ❌ Error: calls const version
    std::cout << carr[0];  // ✅ OK: reading is allowed
}
```

Providing both const and non-const versions of `operator[]` enables proper const-correctness and allows modification when appropriate.

#### Example 5: Function Call Operator (Functors)

```cpp
class Multiplier {
    int factor;
public:
    Multiplier(int f) : factor(f) {}
    
    // ✅ Makes objects callable like functions
    int operator()(int x) const {
        return x * factor;
    }
};

class Logger {
    std::string prefix;
public:
    Logger(const std::string& p) : prefix(p) {}
    
    // ✅ Can have multiple parameters
    void operator()(const std::string& message) const {
        std::cout << prefix << ": " << message << "\n";
    }
};

int main() {
    Multiplier times3(3);
    std::cout << times3(10) << "\n";  // 30
    
    Logger log("INFO");
    log("System started");  // INFO: System started
    
    // ✅ Use with STL algorithms
    std::vector<int> nums = {1, 2, 3, 4, 5};
    std::transform(nums.begin(), nums.end(), nums.begin(), Multiplier(2));
    // nums is now {2, 4, 6, 8, 10}
}
```

Functors are objects that can be called like functions. They're powerful because they can maintain state (unlike function pointers) and are often more efficient than `std::function` due to inlining.

#### Example 6: Stream Insertion and Extraction Operators

```cpp
class Point {
    int x, y;
public:
    Point(int x = 0, int y = 0) : x(x), y(y) {}
    
    // ✅ Output operator (must be friend or non-member)
    friend std::ostream& operator<<(std::ostream& os, const Point& p) {
        os << "(" << p.x << ", " << p.y << ")";
        return os;  // Return stream for chaining
    }
    
    // ✅ Input operator
    friend std::istream& operator>>(std::istream& is, Point& p) {
        is >> p.x >> p.y;
        return is;
    }
};

int main() {
    Point p1(3, 4);
    std::cout << "Point: " << p1 << "\n";  // Point: (3, 4)
    
    Point p2;
    std::cout << "Enter x and y: ";
    std::cin >> p2;  // Can chain: cin >> p2 >> p3;
    std::cout << "You entered: " << p2 << "\n";
}
```

Stream operators must return references to the stream to enable chaining. They're typically implemented as friend functions because the stream is the left operand.

#### Example 7: Custom new and delete Operators

```cpp
class Tracked {
    static int allocation_count;
    int id;
public:
    Tracked() : id(++allocation_count) {
        std::cout << "Object " << id << " constructed\n";
    }
    
    ~Tracked() {
        std::cout << "Object " << id << " destroyed\n";
    }
    
    // ✅ Custom allocation tracking
    void* operator new(std::size_t size) {
        std::cout << "Allocating " << size << " bytes\n";
        void* ptr = ::operator new(size);  // Call global new
        return ptr;
    }
    
    void operator delete(void* ptr) noexcept {
        std::cout << "Deallocating memory\n";
        ::operator delete(ptr);  // Call global delete
    }
    
    // ✅ Array versions
    void* operator new[](std::size_t size) {
        std::cout << "Allocating array: " << size << " bytes\n";
        return ::operator new[](size);
    }
    
    void operator delete[](void* ptr) noexcept {
        std::cout << "Deallocating array\n";
        ::operator delete[](ptr);
    }
};

int Tracked::allocation_count = 0;

int main() {
    Tracked* obj = new Tracked;     // Custom new + constructor
    delete obj;                     // Destructor + custom delete
    
    Tracked* arr = new Tracked[3];  // Custom new[] + constructors
    delete[] arr;                   // Destructors + custom delete[]
}
```

Custom `new` and `delete` operators execute **before** constructors and **after** destructors. The `new` operator allocates raw memory, then the constructor initializes it.

#### Example 8: Comparison Operators with Spaceship Operator (C++20)

```cpp
class Version {
    int major, minor, patch;
public:
    Version(int maj, int min, int pat) : major(maj), minor(min), patch(pat) {}
    
    // ✅ C++20: Single operator generates all six comparison operators
    auto operator<=>(const Version& other) const = default;
    
    // Still need == for exact equality check
    bool operator==(const Version& other) const = default;
};

// Pre-C++20 approach (more verbose)
class VersionOld {
    int major, minor, patch;
public:
    VersionOld(int maj, int min, int pat) : major(maj), minor(min), patch(pat) {}
    
    bool operator<(const VersionOld& other) const {
        if (major != other.major) return major < other.major;
        if (minor != other.minor) return minor < other.minor;
        return patch < other.patch;
    }
    
    bool operator==(const VersionOld& other) const {
        return major == other.major && minor == other.minor && patch == other.patch;
    }
    
    // Need to define: !=, >, <=, >= (can use above definitions)
    bool operator!=(const VersionOld& other) const { return !(*this == other); }
    bool operator>(const VersionOld& other) const { return other < *this; }
    bool operator<=(const VersionOld& other) const { return !(other < *this); }
    bool operator>=(const VersionOld& other) const { return !(*this < other); }
};

int main() {
    Version v1(1, 2, 3), v2(1, 3, 0);
    if (v1 < v2) {  // ✅ All comparison operators work
        std::cout << "v1 is older\n";
    }
}
```

The spaceship operator (`<=>`) in C++20 simplifies comparison operator implementation by automatically generating all six comparison operators from a single definition.

---

#### Example 9: Autonomous Vehicle - Complete VehiclePosition Class with Operator Overloading

```cpp
#include <iostream>
#include <cmath>
#include <iomanip>

// 2D position for autonomous vehicle localization
class VehiclePosition {
    double x_;      // meters (East)
    double y_;      // meters (North)
    double theta_;  // heading (radians)
    unsigned long timestamp_ms_;

public:
    // Constructors
    VehiclePosition(double x = 0, double y = 0, double theta = 0, unsigned long ts = 0)
        : x_(x), y_(y), theta_(theta), timestamp_ms_(ts) {}

    // ========== Arithmetic Operators ==========

    // Addition: combine position offsets (member function)
    VehiclePosition operator+(const VehiclePosition& other) const {
        return VehiclePosition(x_ + other.x_, y_ + other.y_,
                              theta_ + other.theta_, timestamp_ms_);
    }

    // Subtraction: compute relative position
    VehiclePosition operator-(const VehiclePosition& other) const {
        return VehiclePosition(x_ - other.x_, y_ - other.y_,
                              theta_ - other.theta_, timestamp_ms_);
    }

    // Scalar multiplication (member): scale position
    VehiclePosition operator*(double scale) const {
        return VehiclePosition(x_ * scale, y_ * scale,
                              theta_, timestamp_ms_);
    }

    // Symmetric scalar multiplication (friend): enable 2.0 * position
    friend VehiclePosition operator*(double scale, const VehiclePosition& pos) {
        return pos * scale;  // Delegate to member version
    }

    // ========== Compound Assignment Operators ==========

    // Move position incrementally (+=)
    VehiclePosition& operator+=(const VehiclePosition& delta) {
        x_ += delta.x_;
        y_ += delta.y_;
        theta_ += delta.theta_;
        return *this;  // Enable chaining
    }

    // Scale in place (*=)
    VehiclePosition& operator*=(double scale) {
        x_ *= scale;
        y_ *= scale;
        return *this;
    }

    // ========== Comparison Operators ==========

    // Equality: within tolerance for floating-point comparison
    bool operator==(const VehiclePosition& other) const {
        const double EPSILON = 1e-6;
        return std::abs(x_ - other.x_) < EPSILON &&
               std::abs(y_ - other.y_) < EPSILON &&
               std::abs(theta_ - other.theta_) < EPSILON;
    }

    bool operator!=(const VehiclePosition& other) const {
        return !(*this == other);
    }

    // Distance-based comparison (< means closer to origin)
    bool operator<(const VehiclePosition& other) const {
        return getDistanceToOrigin() < other.getDistanceToOrigin();
    }

    bool operator>(const VehiclePosition& other) const {
        return other < *this;
    }

    // ========== Unary Operators ==========

    // Unary minus: reflect position across origin
    VehiclePosition operator-() const {
        return VehiclePosition(-x_, -y_, -theta_, timestamp_ms_);
    }

    // Unary plus: normalize theta to [0, 2π)
    VehiclePosition operator+() const {
        double normalized_theta = std::fmod(theta_, 2 * M_PI);
        if (normalized_theta < 0) normalized_theta += 2 * M_PI;
        return VehiclePosition(x_, y_, normalized_theta, timestamp_ms_);
    }

    // ========== Increment/Decrement Operators ==========

    // Pre-increment: advance 1 meter in heading direction
    VehiclePosition& operator++() {
        x_ += std::cos(theta_);
        y_ += std::sin(theta_);
        return *this;
    }

    // Post-increment: return old position before advancing
    VehiclePosition operator++(int) {
        VehiclePosition old = *this;
        ++(*this);  // Use pre-increment
        return old;  // Return copy of old state
    }

    // ========== Subscript Operator ==========

    // Non-const version: allows modification
    double& operator[](int index) {
        switch (index) {
            case 0: return x_;
            case 1: return y_;
            case 2: return theta_;
            default: throw std::out_of_range("Index must be 0 (x), 1 (y), or 2 (theta)");
        }
    }

    // Const version: read-only access
    const double& operator[](int index) const {
        return const_cast<VehiclePosition*>(this)->operator[](index);
    }

    // ========== Function Call Operator (Functor) ==========

    // Functor: compute distance to another position
    double operator()(const VehiclePosition& other) const {
        double dx = x_ - other.x_;
        double dy = y_ - other.y_;
        return std::sqrt(dx * dx + dy * dy);
    }

    // ========== Type Conversion Operator ==========

    // Explicit conversion to bool: is vehicle away from origin?
    explicit operator bool() const {
        const double EPSILON = 1e-6;
        return std::abs(x_) > EPSILON || std::abs(y_) > EPSILON;
    }

    // ========== Stream Operators (Friend Functions) ==========

    // Output operator: pretty print position
    friend std::ostream& operator<<(std::ostream& os, const VehiclePosition& pos) {
        os << std::fixed << std::setprecision(2)
           << "Position(x=" << pos.x_
           << "m, y=" << pos.y_
           << "m, θ=" << (pos.theta_ * 180.0 / M_PI) << "°"
           << ", t=" << pos.timestamp_ms_ << "ms)";
        return os;
    }

    // Input operator: read position from stream
    friend std::istream& operator>>(std::istream& is, VehiclePosition& pos) {
        is >> pos.x_ >> pos.y_ >> pos.theta_;
        return is;
    }

    // ========== Helper Methods ==========

    double getDistanceToOrigin() const {
        return std::sqrt(x_ * x_ + y_ * y_);
    }

    double getX() const { return x_; }
    double getY() const { return y_; }
    double getTheta() const { return theta_; }
};

// Demonstration of all overloaded operators
int main() {
    VehiclePosition start(0, 0, M_PI/4, 1000);  // 45° heading
    VehiclePosition goal(10, 10, M_PI/2, 2000);  // 90° heading

    std::cout << "=== Initial Positions ===\n";
    std::cout << "Start: " << start << "\n";
    std::cout << "Goal:  " << goal << "\n\n";

    // ========== Arithmetic Operators ==========
    std::cout << "=== Arithmetic Operators ===\n";
    VehiclePosition mid = start + goal;
    std::cout << "start + goal = " << mid << "\n";

    VehiclePosition delta = goal - start;
    std::cout << "goal - start = " << delta << "\n";

    VehiclePosition scaled = start * 2.0;
    std::cout << "start * 2.0 = " << scaled << "\n";

    VehiclePosition scaled2 = 0.5 * goal;
    std::cout << "0.5 * goal = " << scaled2 << "\n\n";

    // ========== Compound Assignment ==========
    std::cout << "=== Compound Assignment ===\n";
    VehiclePosition current = start;
    current += VehiclePosition(1, 1, 0.1);
    std::cout << "After += : " << current << "\n";

    current *= 1.5;
    std::cout << "After *= 1.5: " << current << "\n\n";

    // ========== Comparison Operators ==========
    std::cout << "=== Comparison Operators ===\n";
    std::cout << "start == goal? " << (start == goal ? "yes" : "no") << "\n";
    std::cout << "start != goal? " << (start != goal ? "yes" : "no") << "\n";
    std::cout << "start < goal? " << (start < goal ? "yes" : "no")
              << " (based on distance to origin)\n\n";

    // ========== Unary Operators ==========
    std::cout << "=== Unary Operators ===\n";
    VehiclePosition reflected = -start;
    std::cout << "-start (reflected): " << reflected << "\n";

    VehiclePosition pos_with_large_theta(5, 5, 10 * M_PI);  // Large angle
    VehiclePosition normalized = +pos_with_large_theta;
    std::cout << "Normalized theta: " << normalized << "\n\n";

    // ========== Increment Operators ==========
    std::cout << "=== Increment Operators ===\n";
    VehiclePosition pos(0, 0, 0);
    std::cout << "Initial: " << pos << "\n";
    std::cout << "++pos:   " << ++pos << "\n";  // Pre: advance then return
    std::cout << "pos++:   " << pos++ << "\n";  // Post: return then advance
    std::cout << "After:   " << pos << "\n\n";

    // ========== Subscript Operator ==========
    std::cout << "=== Subscript Operator ===\n";
    VehiclePosition mutable_pos(5, 10, M_PI/3);
    std::cout << "pos[0] (x) = " << mutable_pos[0] << "\n";
    std::cout << "pos[1] (y) = " << mutable_pos[1] << "\n";
    mutable_pos[0] = 7.5;  // Modify x
    std::cout << "After pos[0] = 7.5: " << mutable_pos << "\n\n";

    // ========== Function Call Operator ==========
    std::cout << "=== Function Call Operator ===\n";
    double distance = start(goal);  // Use as functor
    std::cout << "Distance from start to goal: " << distance << "m\n\n";

    // ========== Conversion Operator ==========
    std::cout << "=== Conversion Operator (explicit bool) ===\n";
    VehiclePosition origin(0, 0, 0);
    VehiclePosition non_origin(1, 1, 0);

    if (non_origin) {
        std::cout << "non_origin is away from origin\n";
    }
    if (!origin) {
        std::cout << "origin is at (0,0)\n";
    }
    // bool b = origin;  // ❌ Error: explicit prevents implicit conversion
    bool b = static_cast<bool>(origin);  // ✅ Explicit cast required
    std::cout << "origin as bool (explicit cast): " << b << "\n\n";

    // ========== Practical Usage Example ==========
    std::cout << "=== Practical: Trajectory Following ===\n";
    VehiclePosition vehicle(0, 0, M_PI/4, 0);
    VehiclePosition waypoints[] = {
        VehiclePosition(5, 5, 0),
        VehiclePosition(10, 10, 0),
        VehiclePosition(15, 10, 0)
    };

    for (int i = 0; i < 3; ++i) {
        double dist = vehicle(waypoints[i]);  // Functor usage
        std::cout << "Distance to waypoint " << i << ": "
                  << std::fixed << std::setprecision(2) << dist << "m\n";

        // Move 50% toward waypoint using overloaded operators
        VehiclePosition direction = waypoints[i] - vehicle;
        vehicle += direction * 0.5;
        std::cout << "  Moved to: " << vehicle << "\n";
    }

    return 0;
}
```

**Key Operator Overloading Concepts Demonstrated:**

1. **Arithmetic Operators** (`+`, `-`, `*`): Enable natural position arithmetic for path planning calculations.

2. **Symmetric Operations**: Friend function `operator*(double, Position)` enables both `pos * 2.0` and `2.0 * pos`.

3. **Compound Assignment** (`+=`, `*=`): Modify the object in place and return `*this` by reference for chaining.

4. **Comparison Operators** (`==`, `!=`, `<`, `>`): With proper floating-point tolerance and domain-specific logic (distance-based).

5. **Unary Operators** (`-`, `+`): `-` for negation and `+` for normalization provide useful transformations.

6. **Increment/Decrement**: Pre-increment moves vehicle and returns reference; post-increment returns old position by value.

7. **Subscript Operator** (`[]`): Both const and non-const versions enable `pos[0]` access to x, y, theta components.

8. **Function Call Operator** (`()`): Makes position object callable as distance calculator—functor pattern.

9. **Explicit Type Conversion**: `explicit operator bool()` prevents accidental conversions while allowing contextual boolean usage.

10. **Stream Operators** (`<<`, `>>`): Friend functions enable `cout << position` and `cin >> position` for I/O.

**Real-World Relevance**:

In autonomous vehicle systems:
- **Localization** represents vehicle pose as (x, y, θ) updated at 50-100Hz
- **Position arithmetic** computes relative positions, trajectory offsets, and waypoint deltas
- **Comparison operators** enable priority queues for path planning (A* algorithm)
- **Functor usage** provides distance calculations for nearest-waypoint searches
- **Stream operators** simplify logging and debugging of vehicle positions
- **Subscript operator** allows algorithms to generically access position components
- **Performance**: Operator overloading incurs zero runtime overhead (inlined by compiler) while providing natural, readable syntax

This comprehensive example shows how operator overloading transforms a mathematical type into an intuitive, natural interface that matches the problem domain—essential for complex autonomous driving algorithms like SLAM, path planning, and trajectory optimization.

---

### QUICK_REFERENCE: Answer Key and Summary Tables

#### Operator Overloading Categories

| Category | Operators | Must Be Member | Common Use |
|----------|-----------|----------------|------------|
| Arithmetic | `+`, `-`, `*`, `/`, `%` | No | Math classes, custom types |
| Comparison | `==`, `!=`, `<`, `>`, `<=`, `>=`, `<=>` | No | Sorting, searching |
| Assignment | `=`, `+=`, `-=`, `*=`, `/=`, etc. | Yes (`=` only) | Resource management |
| Increment/Decrement | `++`, `--` | No | Iterators, counters |
| Subscript | `[]` | Yes | Container classes |
| Function Call | `()` | Yes | Functors, callbacks |
| Member Access | `->`, `->*` | Yes (`->` only) | Smart pointers, proxies |
| Stream | `<<`, `>>` | No | I/O operations |
| Memory | `new`, `delete`, `new[]`, `delete[]` | No | Custom allocators |
| Conversion | `operator T()` | Yes | Implicit/explicit conversions |

#### Member vs Friend Function Selection Guide

| Scenario | Implementation | Reason |
|----------|---------------|---------|
| Left operand always class object | Member function | Simpler, natural access to members |
| Need symmetric operations (e.g., `int + Complex`) | Friend function | Enables implicit conversion on left operand |
| Stream operators (`<<`, `>>`) | Friend function | Stream is left operand |
| Must be member by rule (`=`, `[]`, `()`, `->`) | Member function | Language requirement |
| Comparison operators | Friend (or member) | Friend enables symmetry if needed |
| Unary operators | Member (preferred) | Natural use of `this` |

#### Return Type Guidelines

| Operator | Return Type | Reason |
|----------|-------------|---------|
| `operator=` | `T&` (reference to `*this`) | Enable chaining, avoid copies |
| `operator+=`, `-=`, etc. | `T&` (reference to `*this`) | Enable chaining, modify in place |
| `operator+`, `-`, etc. | `T` (by value) | Return new object, don't modify operands |
| `operator++()` (pre) | `T&` (reference to `*this`) | Efficient, return modified object |
| `operator++(int)` (post) | `T` (by value) | Must return old value (copy) |
| `operator[]` (non-const) | `T&` | Enable modification: `arr[i] = value` |
| `operator[]` (const) | `const T&` | Read-only access |
| `operator bool()` | `bool` | Conversion to boolean |
| `operator<<`, `>>` | `ostream&`/`istream&` | Enable chaining |
| `operator->` | `T*` or object with `operator->` | Pointer or chainable |

#### Common Operator Overloading Mistakes

| Mistake | Problem | Solution |
|---------|---------|----------|
| Returning by value from `operator=` | Breaks chaining, inefficient | Return `*this` by reference |
| Returning reference from post-increment | Dangling reference | Return by value (old state) |
| Making `operator<<` a member | Wrong operand order | Make it friend or non-member |
| Forgetting dummy `int` in post-increment | Ambiguity with pre-increment | Add unused `int` parameter |
| Overloading `&&` or `||` | Loses short-circuit evaluation | Don't overload these |
| Not providing both const and non-const `operator[]` | Can't access const objects | Provide both versions |
| Missing matching `operator delete` for custom `new` | Undefined behavior | Always provide matching pair |
| Changing precedence/associativity | Impossible in C++ | Design around fixed grammar |
| Not returning stream by reference | Breaks chaining | Return `ostream&` or `istream&` |
| Forgetting self-assignment check in `operator=` | Undefined behavior | Check `if (this != &other)` |

#### Performance Considerations

| Operation | Performance Impact | Recommendation |
|-----------|-------------------|----------------|
| Pre-increment vs Post-increment | Post requires copy | Prefer `++it` over `it++` |
| Member vs Friend | Minimal difference | Choose based on design, not performance |
| Return by value vs reference | Reference faster for large objects | Return by reference for assignment, by value for arithmetic |
| Functors vs Function pointers | Functors enable inlining | Use functors for STL algorithms |
| Virtual operator overloading | Vtable lookup overhead | Avoid if performance critical |
| Operator chaining | Multiple function calls | Acceptable overhead for clarity |
| Smart pointer operations | Minimal overhead when inlined | Modern compilers optimize well |

#### C++20 Spaceship Operator

| Feature | Pre-C++20 | C++20 with `<=>` |
|---------|-----------|------------------|
| Operators needed | 6 (`<`, `>`, `<=`, `>=`, `==`, `!=`) | 2 (`<=>`, `==`) |
| Lines of code | 30-40 lines | 2-3 lines |
| Consistency | Manual, error-prone | Automatic, guaranteed |
| Syntax | Multiple function definitions | `auto operator<=>(const T&) const = default;` |
| Return type | `bool` for each | `std::strong_ordering`, `std::weak_ordering`, or `std::partial_ordering` |
