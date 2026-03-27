## TOPIC: Lvalue and Rvalue References

### PRACTICE_TASKS: Value Category Analysis and Reference Binding

#### Q1
```cpp
int x = 10;
int& ref = x;
int&& rref = ref;
```

**Answer:**
```
Compilation error
```

**Explanation:**
- `int x = 10` creates lvalue variable x
- `int& ref = x` creates lvalue reference to x (ref is lvalue)
- `int&& rref = ref` attempts to bind rvalue reference to lvalue (illegal!)
- `ref` is a named variable (lvalue), even though it references x
- Rvalue references can only bind to rvalues (temporaries, std::move results)
- **Fix:** `int&& rref = std::move(ref);` to convert lvalue to rvalue
- **Key Concept:** Named variables are always lvalues; rvalue references only bind to rvalues

---

#### Q2
```cpp
void func(int&& x) { }

int main() {
    int a = 5;
    func(a);
}
```

**Answer:**
```
Compilation error
```

**Explanation:**
- `func` parameter is rvalue reference `int&&`
- `a` is named variable (lvalue)
- Cannot pass lvalue to function expecting rvalue reference
- Compiler error: cannot bind lvalue to rvalue reference parameter
- **Fix Option 1:** `func(std::move(a));` to cast a to rvalue
- **Fix Option 2:** Add overload: `void func(int& x) { }`
- **Key Concept:** Function parameters with `T&&` require rvalues (unless template)

---

#### Q3
```cpp
int&& rref = 42;
int* ptr = &rref;
```

**Answer:**
```
Compiles and runs successfully
```

**Explanation:**
- `int&& rref = 42` binds rvalue reference to temporary int(42)
- `rref` is a named variable, which makes it an lvalue (paradox!)
- Type is `int&&` (rvalue reference), but value category is lvalue
- Can take address of lvalue: `&rref` is perfectly valid
- `ptr` points to the temporary int that rref refers to
- Temporary lifetime extended for duration of rref's scope
- **Key Concept:** Named rvalue references are lvalues; type ≠ value category

---

#### Q4
```cpp
const int& ref = 10 + 20;
```

**Answer:**
```
Compiles and runs successfully
```

**Explanation:**
- `10 + 20` is rvalue expression (produces temporary 30)
- Normally non-const lvalue refs can't bind to rvalues
- BUT `const T&` is special: can bind to both lvalues AND rvalues
- Temporary lifetime extended to match lifetime of ref
- Temporary stays alive as long as ref exists
- Common pattern for accepting both lvalues and rvalues
- **Key Concept:** const lvalue references extend temporary lifetimes; bind to rvalues

---

#### Q5
```cpp
int& lref = 5 * 2;
```

**Answer:**
```
Compilation error
```

**Explanation:**
- `5 * 2` is rvalue (produces temporary int with value 10)
- `int& lref` is non-const lvalue reference
- Non-const lvalue references CANNOT bind to rvalues (C++ rule)
- This prevents accidental modification of temporaries
- **Fix Option 1:** `const int& lref = 5 * 2;` (const ref)
- **Fix Option 2:** `int&& lref = 5 * 2;` (rvalue ref)
- **Key Concept:** Non-const lvalue references only bind to lvalues; prevents modifying temporaries

---

#### Q6
```cpp
int x = 10;
int&& rref = std::move(x);
int&& rref2 = rref;
```

**Answer:**
```
Compilation error
```

**Explanation:**
- `std::move(x)` casts x to rvalue, enabling binding to rref
- `rref` successfully binds to rvalue
- BUT `rref` itself is a named variable (lvalue!)
- `int&& rref2 = rref` attempts to bind rvalue ref to lvalue (illegal)
- Once rvalue reference has a name, it becomes lvalue
- **Fix:** `int&& rref2 = std::move(rref);` to re-cast to rvalue
- **Key Concept:** All named variables are lvalues, including rvalue references

---

#### Q7
```cpp
void process(int& x) { std::cout << "lvalue\n"; }
void process(int&& x) { std::cout << "rvalue\n"; }

int&& get() { return 42; }

int main() {
    process(get());
}
```

**Answer:**
```
rvalue
```

**Explanation:**
- `get()` returns `int&&` (rvalue reference type)
- Function call `get()` produces xvalue (expiring value, category of rvalue)
- Overload resolution: rvalue binds to `process(int&&)` overload
- Prints "rvalue"
- Even though return type is reference, function call itself is rvalue expression
- **Key Concept:** Function returning rvalue reference produces xvalue (rvalue category)

---

#### Q8
```cpp
int&& rref = 100;
int& lref = rref;
lref = 200;
std::cout << rref;
```

**Answer:**
```
200
```

**Explanation:**
- `int&& rref = 100` binds to temporary, lifetime extended
- `int& lref = rref` binds lvalue ref to rref (rref is lvalue!)
- Both lref and rref refer to same object (the temporary 100)
- `lref = 200` modifies the object through lref
- `rref` also sees modification, prints 200
- References are aliases - all refer to same object
- **Key Concept:** Multiple references can alias same object; modifications visible through all

---

#### Q9
```cpp
void take(const int& x) { }
void take(int&& x) { }

int main() {
    take(42);
}
```

**Answer:**
```
Calls take(int&&)
```

**Explanation:**
- `42` is rvalue (prvalue - pure rvalue)
- Two viable overloads: `const int&` and `int&&`
- Both can bind to rvalue, but `int&&` is exact match
- Overload resolution prefers exact match over conversion
- `const int&` requires const conversion (less preferred)
- Calls rvalue overload: `take(int&&)`
- **Key Concept:** Overload resolution prefers rvalue reference over const lvalue reference for rvalues

---

#### Q10
```cpp
int x = 5;
int&& rref = x++;
```

**Answer:**
```
Compiles and runs successfully
```

**Explanation:**
- Post-increment `x++` returns old value as rvalue (copy before increment)
- Returns temporary int containing 5 (rvalue)
- x itself incremented to 6
- Rvalue reference binds to temporary, lifetime extended
- Contrast with pre-increment `++x` which returns lvalue reference to x
- **Key Concept:** Post-increment returns rvalue; pre-increment returns lvalue

---

#### Q11
```cpp
struct A { };
A&& getA() { A a; return std::move(a); }

int main() {
    A&& ref = getA();
}
```

**Answer:**
```
Undefined behavior (dangling reference)
```

**Explanation:**
- `A a` creates local variable in getA()
- `std::move(a)` casts a to rvalue, returns `A&&`
- BUT a is destroyed when getA() returns (end of scope)
- ref now refers to destroyed object (dangling reference)
- Using ref causes undefined behavior
- std::move doesn't prevent destruction - just casts to rvalue
- **Key Concept:** Never return references to local variables; they don't survive function return

---

#### Q12
```cpp
const int cx = 10;
int&& rref = std::move(cx);
```

**Answer:**
```
Compilation error
```

**Explanation:**
- `cx` has type `const int`
- `std::move(cx)` casts to `const int&&` (preserves const)
- `int&& rref` is non-const rvalue reference
- Cannot bind non-const ref to const object (drops const - illegal!)
- **Fix:** `const int&& rref = std::move(cx);`
- Rarely need const rvalue references in practice
- **Key Concept:** std::move preserves const-ness; cannot drop const through binding

---

#### Q13
```cpp
int a = 5;
decltype(a) b = 10;      // Type of b?
decltype((a)) c = a;     // Type of c?
```

**Answer:**
```
b is int
c is int&
```

**Explanation:**
- `decltype(a)` gives declared type of a: `int`
- `b` is `int`, initialized to 10
- `decltype((a))` with extra parentheses gives value category type
- Parenthesized expression `(a)` is lvalue, so decltype gives `int&`
- `c` is `int&` (lvalue reference), must initialize with lvalue
- Rule: `decltype(name)` = type, `decltype((name))` = reference type if lvalue
- **Key Concept:** decltype with parentheses returns reference for lvalue expressions

---

#### Q14
```cpp
int x = 10;
int& ref = (x = 20);
ref = 30;
std::cout << x;
```

**Answer:**
```
30
```

**Explanation:**
- Assignment expression `(x = 20)` returns lvalue reference to x
- x modified to 20
- `ref` binds to this lvalue reference (aliases x)
- `ref = 30` modifies x through reference
- `x` now contains 30, printed
- All built-in assignment operators return lvalue references
- **Key Concept:** Assignment expressions return lvalue references; enable chaining and binding

---

#### Q15
```cpp
void func(int& x) { x = 100; }

int main() {
    func(5 + 5);
}
```

**Answer:**
```
Compilation error
```

**Explanation:**
- `5 + 5` produces temporary rvalue (10)
- `func` expects non-const lvalue reference `int&`
- Cannot bind non-const lvalue ref to rvalue
- Prevents modifying temporaries that disappear immediately
- **Fix Option 1:** `func(int&& x)` or `func(const int& x)`
- **Fix Option 2:** Store in variable: `int val = 5 + 5; func(val);`
- **Key Concept:** Non-const lvalue references reject temporaries; prevents dangling modifications

---

#### Q16
```cpp
int&& rref1 = 42;
int&& rref2 = std::move(rref1);
rref2 = 100;
std::cout << rref1;
```

**Answer:**
```
100
```

**Explanation:**
- `int&& rref1 = 42` binds to temporary 42, lifetime extended
- `std::move(rref1)` casts rref1 to rvalue
- `rref2` binds to rvalue, BUT refers to same object as rref1
- Both rref1 and rref2 are aliases to same temporary
- `rref2 = 100` modifies the shared object
- `rref1` sees modification, prints 100
- std::move doesn't move anything - just enables move semantics
- **Key Concept:** std::move is just a cast; multiple rvalue refs can alias same object

---

#### Q17
```cpp
void process(const int& x) { std::cout << "const&\n"; }
void process(int&& x) { std::cout << "&&\n"; }

int main() {
    int x = 10;
    process(x);
}
```

**Answer:**
```
const&
```

**Explanation:**
- `x` is lvalue (named variable)
- Cannot bind to `process(int&&)` - requires rvalue
- Can bind to `process(const int&)` - accepts lvalues
- Calls const lvalue reference overload
- No non-const lvalue ref overload available
- If we had `process(int& x)`, that would be called instead
- **Key Concept:** Lvalues prefer non-const lvalue refs, then const lvalue refs; can't bind to rvalue refs

---

#### Q18
```cpp
std::string&& rref = "hello";
```

**Answer:**
```
Compiles and runs successfully
```

**Explanation:**
- `"hello"` is string literal (const char array)
- Implicitly converts to temporary `std::string` object (rvalue)
- Rvalue reference binds to temporary
- Temporary lifetime extended to scope of rref
- rref behaves like normal string variable
- Common pattern for accepting string literals as rvalue refs
- **Key Concept:** Temporary objects' lifetimes extended when bound to references

---

#### Q19
```cpp
int getValue() { return 42; }

int main() {
    int& ref = getValue();
}
```

**Answer:**
```
Compilation error
```

**Explanation:**
- `getValue()` returns by value: prvalue (pure rvalue)
- Return creates temporary int containing 42
- `int& ref` is non-const lvalue reference
- Cannot bind non-const lvalue ref to rvalue
- **Fix Option 1:** `const int& ref = getValue();` (extends lifetime)
- **Fix Option 2:** `int&& ref = getValue();` (rvalue ref)
- **Fix Option 3:** `int value = getValue();` (copy to variable)
- **Key Concept:** Function return values are rvalues; need const/rvalue refs or copy

---

#### Q20
```cpp
int x = 10;
auto&& a = x;           // Type of a?
auto&& b = 20;          // Type of b?
```

**Answer:**
```
a is int& (lvalue reference)
b is int&& (rvalue reference)
```

**Explanation:**
- `auto&&` is forwarding reference (universal reference)
- NOT the same as `T&&` for concrete type T
- Forwarding ref with lvalue: deduces lvalue reference
- Forwarding ref with rvalue: deduces rvalue reference
- `x` is lvalue → `a` deduced as `int&`
- `20` is rvalue → `b` deduced as `int&&`
- Reference collapsing: `int& &&` → `int&`, `int&& &&` → `int&&`
- **Key Concept:** auto&& and T&& (template) are forwarding references; preserve value category

---
