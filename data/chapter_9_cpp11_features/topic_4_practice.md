### PRACTICE_TASKS: Lambda Expressions, std::function, and std::bind

#### Q1
```cpp
int x = 5;
auto f = [=]() mutable {
    x = 10;
    return x;
};

std::cout << f() << " ";
std::cout << x << " ";
std::cout << f() << "
";
```

**Answer:**
```
10 5 10
```

**Explanation:**
- Lambda captures x by value (copy): lambda has x=5
- `mutable` keyword allows modifying the captured copy
- First `f()` call: modifies lambda's copy from 5 to 10, returns 10
- Original x unchanged: still 5
- Second `f()` call: lambda's copy already 10, returns 10 again
- Same lambda object maintains state between calls
- **Without mutable:** Cannot modify captured-by-value variables
- **Key Concept:** mutable allows modifying copies in lambda; original variable unaffected

---

#### Q2
```cpp
std::vector<std::function<int()>> funcs;
for (int i = 0; i < 3; ++i) {
    funcs.push_back([&i]() { return i; });
}

for (auto& f : funcs) {
    std::cout << f() << " ";
}
```

**Answer:**
```
3 3 3 (or undefined behavior)
```

**Explanation:**
- First loop creates 3 lambdas, all capturing `&i` (reference)
- All lambdas capture reference to same loop variable i
- After first loop ends: i = 3
- Second loop: all lambdas access same i (now 3)
- All print 3
- **Dangling reference risk:** If i goes out of scope, UB
- **Common mistake:** Expecting 0 1 2 (each lambda capturing different value)
- **Fix:** Capture by value: `[i]` or `[i=i]`
- **Key Concept:** Reference captures share same variable; use value capture in loops

---

#### Q3
```cpp
int a = 100;
auto f = [&a]() { return a; };
a = 200;
std::cout << f();
```

**Answer:**
```
200
```

**Explanation:**
- Lambda captures a by reference: `[&a]`
- Reference capture creates reference to original variable
- Modification to a affects what lambda sees
- a changed from 100 to 200
- f() returns current value of a: 200
- Reference capture sees all modifications
- **Use case:** When lambda needs to see updates
- **Risk:** Dangling reference if a goes out of scope
- **Key Concept:** Reference captures reflect real-time state of captured variables

---

#### Q4
```cpp
auto lambda = []() { return 42; };
void (*funcPtr)() = lambda;  // Compile error or OK?
```

**Answer:**
```
Compilation error
```

**Explanation:**
- Lambda returns int: `[]() { return 42; }`
- Function pointer type: `void (*)()` (returns void)
- Return type mismatch: int vs void
- Cannot convert lambda to incompatible function pointer
- **Correct pointer type:** `int (*funcPtr)() = lambda;`
- Stateless lambdas can convert to function pointers
- Must match signature exactly (return type + parameters)
- **Key Concept:** Lambda-to-function-pointer requires exact type match including return type

---

#### Q5
```cpp
int x = 10;
std::function<void()> f;

{
    f = [=]() { std::cout << x << "\n"; };
}
f();  // What happens?
```

**Answer:**
```
10
```

**Explanation:**
- Lambda captures x by value: creates copy (x=10)
- Copy stored inside lambda object
- Inner scope ends, but lambda is safe
- std::function holds lambda with captured copy
- f() executes: prints 10
- **Safe:** Value capture creates independent copy
- **Contrast with reference:** `[&x]` would be dangerous here
- std::function can outlive capture scope with value captures
- **Key Concept:** Value captures create safe copies; lifetime independent of original variable

---

#### Q6
```cpp
class Widget {
    int value = 42;
public:
    auto getLambda() {
        return [=]() { return value; };
    }
};

Widget* w = new Widget();
auto l = w->getLambda();
delete w;
std::cout << l();  // What happens?
```

**Answer:**
```
Undefined behavior
```

**Explanation:**
- Lambda captures `[=]` in member function
- `[=]` captures `this` pointer, not members
- Lambda stores pointer to Widget object
- delete w destroys Widget
- l() accesses through dangling this pointer
- Undefined behavior: crash, garbage value, or appears to work
- **Common misconception:** `[=]` copies members (NO!)
- **Fix:** Explicit capture: `[value=value]` (C++14)
- **C++11 fix:** `[value]() { return value; }` if value is local
- **Key Concept:** [=] in member functions captures this pointer, not object state

---

#### Q7
```cpp
int add(int a, int b, int c) { return a + b + c; }

auto bound = std::bind(add, 10, std::placeholders::_1, std::placeholders::_2);
std::cout << bound(5, 3);
```

**Answer:**
```
18
```

**Explanation:**
- std::bind creates partial function application
- First parameter fixed to 10
- `_1` maps to first argument of bound (5)
- `_2` maps to second argument of bound (3)
- Calls add(10, 5, 3)
- Returns 10 + 5 + 3 = 18
- Placeholders specify argument positions
- **Modern alternative:** Lambdas often clearer: `[](int x, int y) { return add(10, x, y); }`
- **Key Concept:** std::bind creates partial application with fixed and placeholder parameters

---

#### Q8
```cpp
int x = 5;
auto f = [=]() {
    x = 10;  // Compile error or OK?
    return x;
};
```

**Answer:**
```
Compilation error
```

**Explanation:**
- Lambda captures x by value: creates copy
- By-value captured variables are const by default
- Cannot modify const copy
- Compilation error: x is const
- **Fix:** Add mutable keyword: `[=]() mutable { x = 10; ... }`
- mutable allows modifying captured copies
- Original x still unchanged (copy modified, not original)
- **Design rationale:** Prevent accidental modifications
- **Key Concept:** By-value captures are const; use mutable to modify copies

---

#### Q9
```cpp
auto counter = [n = 0]() mutable { return ++n; };
std::cout << counter() << " ";
std::cout << counter() << " ";
std::cout << counter();
```

**Answer:**
```
1 2 3
```

**Explanation:**
- Init capture (C++14 syntax): `[n = 0]`
- Creates member variable n initialized to 0
- mutable allows modifying n
- First call: ++n (0→1), returns 1
- Second call: ++n (1→2), returns 2
- Third call: ++n (2→3), returns 3
- Lambda maintains state across calls
- **Stateful lambda:** Behaves like functor with state
- Each counter instance has own n
- **Key Concept:** mutable lambdas maintain state across calls; useful for stateful operations

---

#### Q10
```cpp
auto f1 = [](int x) { return x * 2; };
auto f2 = [](int x) { return x * 2; };

bool same = std::is_same<decltype(f1), decltype(f2)>::value;
std::cout << same;
```

**Answer:**
```
0 (false)
```

**Explanation:**
- Each lambda has unique compiler-generated type
- Even identical lambda expressions have different types
- Compiler generates unique closure type per lambda
- decltype(f1) ≠ decltype(f2)
- std::is_same returns false
- **Consequence:** Cannot put lambdas of different types in same container
- **Solution:** Use std::function<int(int)> for type erasure
- **Design:** Unique types enable optimizations
- **Key Concept:** Every lambda has unique type; identical lambdas have different types

---

#### Q11
```cpp
const int x = 100;
auto f = [&x]() {
    x = 200;  // Compile error or OK?
    return x;
};
```

**Answer:**
```
Compilation error
```

**Explanation:**
- x is const int
- Lambda captures by reference: `[&x]`
- Reference to const int
- Cannot modify const variable
- Compilation error: assignment to const
- const-ness preserved through reference
- **Would work with:** non-const x
- **By-value capture:** Also error (captured copy is const)
- **Key Concept:** const-ness preserved in captures; cannot modify const variables through lambda

---

#### Q12
```cpp
std::vector<int> vec = {3, 1, 4, 1, 5};
std::sort(vec.begin(), vec.end(), [](int a, int b) {
    return a > b;
});

for (int x : vec) std::cout << x << " ";
```

**Answer:**
```
5 4 3 1 1
```

**Explanation:**
- std::sort with custom comparator lambda
- Comparator: `[](int a, int b) { return a > b; }`
- Returns true if a should come before b
- `a > b`: larger values come first
- Descending order sort
- Original: {3, 1, 4, 1, 5}
- Sorted: {5, 4, 3, 1, 1}
- **Default sort:** `a < b` (ascending)
- **Common use:** Lambdas as inline comparators
- **Key Concept:** Lambdas as predicates in STL algorithms; comparator determines sort order

---

#### Q13
```cpp
int value = 10;
auto f = std::bind([](int& x) { x += 5; }, value);
f();
std::cout << value;
```

**Answer:**
```
10
```

**Explanation:**
- Lambda expects int& (reference parameter)
- std::bind copies arguments by default
- value copied to bind (copy = 10)
- f() modifies the copy, not original
- Original value unchanged: still 10
- **Fix:** Use std::ref: `std::bind(..., std::ref(value))`
- std::ref creates reference wrapper
- **Better alternative:** Lambda: `[&value]() { value += 5; }`
- **Key Concept:** std::bind copies arguments; use std::ref for reference semantics

---

#### Q14
```cpp
auto noCap = []() { return 42; };
int x = 10;
auto oneCap = [x]() { return x; };

std::cout << sizeof(noCap) << " " << sizeof(oneCap);
```

**Answer:**
```
1 4 (typical)
```

**Explanation:**
- noCap: no captures, empty closure
- Empty class minimum size: 1 byte
- oneCap: captures one int
- Closure contains one int member: 4 bytes (typical)
- Lambda size = size of captured variables + overhead
- **Multiple captures:** Sum of all capture sizes
- **Reference captures:** Typically pointer size (4 or 8 bytes)
- **Implementation detail:** May vary by compiler
- **Key Concept:** Lambda size depends on captures; empty lambdas have minimal size

---

#### Q15
```cpp
auto make_lambda() {
    int x = 42;
    return [&x]() { return x; };
}

auto l = make_lambda();
std::cout << l();  // What happens?
```

**Answer:**
```
Undefined behavior
```

**Explanation:**
- x is local variable in make_lambda
- Lambda captures x by reference
- make_lambda returns, x destroyed
- l holds lambda with dangling reference
- l() accesses destroyed variable
- Undefined behavior: crash, garbage value, or apparent success
- **Classic bug:** Returning lambda with reference to local
- **Fix:** Capture by value: `[x]` or `[=]`
- **Warning:** Compiler may not catch this
- **Key Concept:** Reference captures must outlive lambda usage; avoid capturing locals by reference

---

#### Q16
```cpp
std::function<int(int)> f = [](int x) { return x * 2; };
std::function<int(int)> g = [](int x) { return x + 10; };
f = g;
std::cout << f(5);
```

**Answer:**
```
15
```

**Explanation:**
- Both f and g are std::function<int(int)>
- f initially holds "multiply by 2" lambda
- g holds "add 10" lambda
- Assignment f = g: f now holds copy of g's lambda
- f(5) executes "add 10": 5 + 10 = 15
- **std::function features:**
  - Type erasure: can hold any callable with matching signature
  - Assignable: can reassign to different callables
  - Copyable: can copy between std::functions
- **Use case:** Storing/passing different lambdas in same variable
- **Key Concept:** std::function provides type erasure; allows runtime reassignment of callables

---

#### Q17
```cpp
int x = 5, y = 10;
auto f = [=, &y]() {
    y += x;
    return y;
};

std::cout << f() << " ";
std::cout << y;
```

**Answer:**
```
15 15
```

**Explanation:**
- Mixed capture: `[=, &y]`
- `=` captures everything by value (x copied: 5)
- `&y` explicitly captures y by reference
- f() executes:
  - Reads x copy (5)
  - Modifies y through reference: y = 10 + 5 = 15
  - Returns 15
- y actually modified (reference capture)
- Both print 15
- **Alternative syntax:** `[x, &y]` (explicit captures)
- **Invalid:** `[&, =]` (cannot mix in this order)
- **Key Concept:** Mixed captures allow fine-grained control; combine by-value and by-reference

---

#### Q18
```cpp
auto lambda = [](auto x) { return x * 2; };  // Valid in C++11?
```

**Answer:**
```
Compilation error in C++11
```

**Explanation:**
- Generic lambda with auto parameter
- Generic lambdas introduced in C++14
- Not available in C++11
- C++11 lambdas require explicit parameter types
- **C++11 alternative:** Template function or functor
- **C++14+:** `[](auto x)` creates template lambda
- **Equivalent C++11 code:**
  ```cpp
  struct Lambda {
      template<typename T>
      auto operator()(T x) const { return x * 2; }
  };
  ```
- **Key Concept:** Generic lambdas require C++14; C++11 lambdas need explicit types

---

#### Q19
```cpp
static int counter = 0;
auto f = []() { return ++counter; };

std::cout << f() << " ";
std::cout << f() << " ";
std::cout << counter;
```

**Answer:**
```
1 2 2
```

**Explanation:**
- counter is static variable (global scope)
- Lambda has no captures: `[]`
- Static variables accessible without capture
- First f(): ++counter (0→1), returns 1
- Second f(): ++counter (1→2), returns 2
- counter directly modified (not a copy)
- Prints: "1 2 2"
- **Static/global access:** No capture needed
- **Contrast:** Local variables must be captured
- **Thread safety:** Not thread-safe without synchronization
- **Key Concept:** Static and global variables accessible without capture; directly modified

---

#### Q20
```cpp
std::function<int(int)> f;
std::unique_ptr<int> ptr = std::make_unique<int>(42);
f = [ptr = std::move(ptr)]() { return *ptr; };  // Valid in C++11?
```

**Answer:**
```
Compilation error in C++11
```

**Explanation:**
- Init capture with move: `[ptr = std::move(ptr)]`
- Init captures introduced in C++14
- C++11 std::function cannot store move-only types
- unique_ptr is move-only (non-copyable)
- C++11 std::function requires copyable callables
- **C++11 workaround:** shared_ptr (copyable)
  ```cpp
  auto ptr = std::make_shared<int>(42);
  f = [ptr]() { return *ptr; };
  ```
- **C++14+:** Init captures support move-only types
- **Key Concept:** C++11 std::function requires copyable callables; use shared_ptr for C++11

---
