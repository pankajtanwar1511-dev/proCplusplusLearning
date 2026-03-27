### PRACTICE_TASKS: Type Deduction Challenges

#### Q1
```cpp
const int x = 10;
auto a = x;
a = 20;
std::cout << a << " " << x;
```

**Answer:**
```
20 10
```

**Explanation:**
- `const int x = 10` creates const integer
- `auto a = x` deduces type of a
- auto drops top-level const qualifiers
- `a` deduced as `int` (not `const int`)
- `a = 20` is valid (a is mutable)
- Prints "20 10"
- x remains unchanged (10)
- auto type deduction rules:
  - Drops top-level const/volatile
  - Preserves low-level const (const in pointer/reference)
  - Arrays decay to pointers
  - Functions decay to function pointers
- To preserve const: use `const auto a = x;`
- **Key Concept:** auto drops top-level const; use const auto to preserve constness

---

#### Q2
```cpp
int arr[5] = {1, 2, 3, 4, 5};
auto p = arr;
auto& r = arr;
std::cout << sizeof(p) << " " << sizeof(r);
```

**Answer:**
```
8 20 (typical 64-bit system)
```

**Explanation:**
- `int arr[5]` creates array of 5 ints
- `auto p = arr` causes array decay
- Arrays decay to pointers in auto deduction
- `p` deduced as `int*` (pointer to first element)
- sizeof(p) = sizeof(int*) = 8 bytes (on 64-bit)
- `auto& r = arr` preserves array type
- References don't cause decay
- `r` deduced as `int (&)[5]` (reference to array of 5 ints)
- sizeof(r) = sizeof(int[5]) = 5 * 4 = 20 bytes
- Output: "8 20" (assuming 64-bit, 4-byte int)
- Use auto& to preserve array type
- Use std::array or std::vector to avoid decay issues
- **Key Concept:** auto causes array decay to pointer; auto& preserves array type and size

---

#### Q3
```cpp
int x = 5;
auto&& a = x;
auto&& b = 10;
a = 15;
std::cout << x << " " << a << " " << typeid(a).name() << " " << typeid(b).name();
```

**Answer:**
```
15 15 i i (GCC/Clang: types shown as 'i' for int)
```

**Explanation:**
- `int x = 5` creates lvalue
- `auto&& a = x` uses forwarding reference (universal reference)
- x is lvalue → a deduced as lvalue reference `int&`
- Reference collapsing: `int& &&` → `int&`
- `auto&& b = 10` binds to rvalue (10 is temporary)
- b deduced as rvalue reference `int&&`
- `a = 15` modifies x through reference
- x becomes 15
- Prints "15 15"
- typeid strips references, shows underlying type
- Both show int type ('i' in GCC/Clang, 'int' in MSVC)
- Forwarding reference (auto&&) is not always rvalue reference!
- Deduction depends on value category:
  - lvalue → lvalue reference
  - rvalue → rvalue reference
- **Key Concept:** auto&& is forwarding reference; deduces lvalue ref for lvalues, rvalue ref for rvalues

---

#### Q4
```cpp
auto lambda = [](int x) { return x * 2; };
std::cout << lambda(5) << " " << sizeof(lambda);
```

**Answer:**
```
10 1 (typical)
```

**Explanation:**
- Lambda with no captures defined
- `lambda(5)` executes lambda body
- Returns 5 * 2 = 10
- Prints "10 "
- sizeof(lambda) depends on captures
- No captures → empty closure object
- Empty class minimum size = 1 byte (C++ rule)
- Prints "1"
- Output: "10 1"
- Lambda type is unique compiler-generated functor class
- Capture variables → sizeof increases
- Example: `[x]` where int x → sizeof ≥ 4
- Stateless lambdas can convert to function pointers
- **Key Concept:** Capture-less lambda has sizeof 1 byte; size increases with captured variables

---

#### Q5
```cpp
int x = 0;
decltype(x) a = 5;
decltype((x)) b = x;
a = 10;
b = 20;
std::cout << x << " " << a << " " << b;
```

**Answer:**
```
20 10 20
```

**Explanation:**
- `decltype(x)` yields type of x (int)
- `a` declared as int, initialized to 5
- `decltype((x))` with parentheses yields reference!
- Parenthesized expression is lvalue
- `decltype((x))` yields `int&` (lvalue reference)
- `b` is reference to x
- `a = 10` modifies a only
- `b = 20` modifies x through reference
- x becomes 20
- b is alias to x, so b also 20
- Prints "20 10 20"
- decltype rules:
  - decltype(name) → declared type
  - decltype((name)) → lvalue reference
  - decltype(expression) → depends on value category
- Subtle but critical distinction!
- **Key Concept:** decltype(x) yields type; decltype((x)) yields lvalue reference; parentheses matter!

---

#### Q6
```cpp
std::vector<int> vec{1, 2, 3};
for (auto x : vec) { x *= 2; }
for (auto x : vec) { std::cout << x << " "; }
```

**Answer:**
```
1 2 3
```

**Explanation:**
- Vector initially: {1, 2, 3}
- First loop: `for (auto x : vec)`
- `auto x` creates copy of each element
- `x *= 2` modifies copy, not original
- Copies: 2, 4, 6 (discarded after each iteration)
- vec unchanged: {1, 2, 3}
- Second loop prints original values
- Prints "1 2 3"
- To modify original: use `auto& x` (reference)
  ```cpp
  for (auto& x : vec) { x *= 2; }  // Modifies original
  ```
- Range-for patterns:
  - `auto x` → copy (read-only semantics)
  - `auto& x` → modifiable reference
  - `const auto& x` → const reference (avoid copies for expensive types)
- **Key Concept:** Range-for with auto copies elements; use auto& to modify originals

---

#### Q7
```cpp
const int* ptr = new int(42);
auto a = ptr;
decltype(ptr) b = ptr;
// Can we write: *a = 50; ?
// Can we write: *b = 50; ?
delete ptr;
```

**Answer:**
```
Both NO - compilation errors
```

**Explanation:**
- `const int* ptr` points to const int
- `auto a = ptr` deduces type
- Low-level const preserved (const in pointee)
- `a` deduced as `const int*`
- `*a = 50` compilation error (cannot modify const)
- `decltype(ptr) b = ptr` explicitly types b
- `b` is `const int*`
- `*b = 50` compilation error (cannot modify const)
- Both a and b point to const int
- const qualifier applies to pointed-to value
- Pointer itself is mutable: `a = nullptr;` OK
- But pointed-to value is const: `*a = 50;` ERROR
- auto preserves:
  - Low-level const (const T*, const in reference)
  - Drops top-level const (T const → T)
- **Key Concept:** auto preserves low-level const (pointer to const); both auto and decltype respect const in pointee

---

#### Q8
```cpp
auto x = {1, 2, 3};
std::cout << x.size() << " " << typeid(x).name();
```

**Answer:**
```
3 St16initializer_listIiE (or similar, implementation-dependent)
```

**Explanation:**
- `auto x = {1, 2, 3}` uses initializer list
- Special auto deduction rule for braced init
- `x` deduced as `std::initializer_list<int>`
- Not std::vector or array!
- Unique to auto with braces
- `x.size()` returns 3 (three elements)
- Prints "3 "
- typeid shows mangled name
- Typical: "St16initializer_listIiE" (GCC/Clang)
- "St" = std::, "16" = length, "initializer_list", "IiE" = template<int>
- MSVC shows: "class std::initializer_list<int>"
- Output format implementation-dependent
- Direct initialization vs copy initialization:
  - `auto x = {1, 2, 3};` → std::initializer_list
  - `auto x{1, 2, 3};` → std::initializer_list (C++11-16), int (C++17+)
- **Key Concept:** auto with braced init deduces std::initializer_list; special deduction rule

---

#### Q9
```cpp
int func1() { return 5; }
int& func2() { static int x = 5; return x; }

decltype(func1()) a = func1();
decltype(func2()) b = func2();
b = 10;
std::cout << func2();
```

**Answer:**
```
10
```

**Explanation:**
- func1() returns int by value
- `decltype(func1())` yields `int`
- `a` is int, initialized to 5
- func2() returns reference to static variable
- `decltype(func2())` yields `int&` (reference)
- `b` is reference to static x
- `b = 10` modifies static x through reference
- Static x becomes 10
- func2() called again, returns reference to x
- Prints 10
- decltype with function call expression:
  - Preserves return type exactly
  - int → int
  - int& → int& (not int!)
- Contrast with auto:
  - `auto a = func1();` → int
  - `auto b = func2();` → int (drops reference!)
- **Key Concept:** decltype preserves exact return type including references; auto drops references

---

#### Q10
```cpp
template<typename T>
auto process(T t) -> decltype(t * 2) {
    return t * 2;
}

auto result1 = process(5);
auto result2 = process(3.5);
std::cout << typeid(result1).name() << " " << typeid(result2).name();
```

**Answer:**
```
i d (GCC/Clang: 'i' for int, 'd' for double)
```

**Explanation:**
- Trailing return type syntax: `auto ... -> decltype(...)`
- C++11 feature for return type deduction
- `process(5)` called with int
- `decltype(5 * 2)` yields int
- Returns int
- result1 is int
- `process(3.5)` called with double
- `decltype(3.5 * 2)` yields double
- Returns double
- result2 is double
- typeid shows underlying types
- GCC/Clang: 'i' (int), 'd' (double)
- MSVC: "int", "double"
- Prints "i d" (or "int double")
- Trailing return type allows using function parameters in return type
- C++14 simplifies: just `auto process(T t)` (no trailing return needed)
- **Key Concept:** Trailing return type (C++11) allows decltype using function parameters; enables return type deduction

---

#### Q11
```cpp
const int x = 100;
auto& a = x;
// Can we write: a = 200; ?
const auto& b = x;
// Can we write: b = 200; ?
```

**Answer:**
```
Both NO - compilation errors
```

**Explanation:**
- `const int x = 100` creates const variable
- `auto& a = x` deduces type of a
- Reference to const: `a` is `const int&`
- auto& preserves const when binding to const
- `a = 200` compilation error (a is const reference)
- `const auto& b = x` explicitly adds const
- `b` is `const int&`
- `b = 200` compilation error (b is const reference)
- Both references are const
- Cannot modify through const reference
- Pattern: auto& preserves const-ness of referent
- Reference deduction rules:
  - `auto& a = const_var` → const reference
  - `auto& a = non_const_var` → non-const reference
- Explicitly adding const (const auto&) always makes const reference
- Use case: const auto& for function parameters to avoid copies
- **Key Concept:** auto& preserves const when binding to const; both auto& and const auto& create const references to const objects

---

#### Q12
```cpp
int x = 10;
auto lambda = [=]() mutable { x = 20; return x; };
std::cout << lambda() << " " << x;
```

**Answer:**
```
20 10
```

**Explanation:**
- `int x = 10` creates local variable
- `[=]` captures x by value (creates copy)
- Lambda stores copy of x (initially 10)
- `mutable` keyword allows modifying captured copy
- Without mutable: captured values are const
- `lambda()` executes lambda body
- `x = 20` modifies lambda's copy (not original)
- Lambda's copy: 10 → 20
- Returns 20 (prints "20 ")
- Original x unchanged (still 10)
- Prints "10"
- Output: "20 10"
- Lambda capture modes:
  - `[=]` capture by value (copy)
  - `[&]` capture by reference
  - `[x]` capture specific variable by value
  - `[&x]` capture specific variable by reference
- mutable only makes sense with value capture
- **Key Concept:** Lambda capture by value with mutable allows modifying copy; original unchanged

---

#### Q13
```cpp
std::vector<bool> vec{true, false, true};
auto x = vec[0];
x = false;
std::cout << vec[0];  // What is printed?
```

**Answer:**
```
true (1)
```

**Explanation:**
- std::vector<bool> is specialized (space-optimized)
- Stores bits, not actual bool objects
- `vec[0]` returns proxy object, not bool&
- Proxy type: std::vector<bool>::reference
- `auto x = vec[0]` deduces x as proxy type
- x is copy of proxy (not reference to vec[0])
- `x = false` modifies proxy copy, not original
- vec[0] unchanged (still true)
- Prints "true" (or 1)
- This is a gotcha with std::vector<bool>!
- To modify original: don't use auto
  ```cpp
  vec[0] = false;  // Direct assignment works
  ```
- Or use explicit type:
  ```cpp
  std::vector<bool>::reference x = vec[0];
  x = false;  // Now modifies original
  ```
- Avoid std::vector<bool> when possible
- Use std::vector<char> or std::deque<bool> for normal behavior
- **Key Concept:** std::vector<bool> operator[] returns proxy, not reference; auto deduces proxy type, not bool&

---

#### Q14
```cpp
int a = 5, b = 10;
decltype(a + b) sum = a + b;
decltype((a)) ref = a;
ref = 20;
std::cout << a << " " << sum;
```

**Answer:**
```
20 15
```

**Explanation:**
- `a = 5, b = 10`
- `decltype(a + b)` evaluates type of expression
- a + b is prvalue (temporary)
- `decltype(prvalue)` yields value type: int
- `sum` is int, initialized to 5 + 10 = 15
- `decltype((a))` with parentheses
- (a) is lvalue expression
- `decltype(lvalue)` yields lvalue reference: int&
- `ref` is reference to a
- `ref = 20` modifies a through reference
- a becomes 20
- sum unchanged (15)
- Prints "20 15"
- decltype value category rules:
  - prvalue → T
  - lvalue → T&
  - xvalue → T&&
- Parentheses make single variable an lvalue expression
- Without parentheses: decltype(a) → int (not reference)
- With parentheses: decltype((a)) → int& (reference)
- **Key Concept:** decltype((variable)) yields lvalue reference; decltype(variable) yields declared type; subtle but important

---

#### Q15
```cpp
auto add = [](auto x, auto y) { return x + y; };  // C++14 feature
// Is this valid in C++11?
```

**Answer:**
```
NO - Compilation error in C++11
```

**Explanation:**
- Generic lambdas (auto parameters) introduced in C++14
- C++11 requires explicit parameter types
- `[](auto x, auto y)` is C++14 syntax
- Compilation error in C++11
- C++11 equivalent:
  ```cpp
  auto add = [](int x, int y) { return x + y; };
  ```
- Or use template functor:
  ```cpp
  struct Add {
      template<typename T, typename U>
      auto operator()(T x, U y) const -> decltype(x + y) {
          return x + y;
      }
  };
  Add add;
  ```
- Generic lambdas are syntactic sugar for template operator()
- Compiler generates template functor with auto parameters
- C++14 feature, not available in C++11
- **Key Concept:** Generic lambdas (auto parameters) require C++14; C++11 requires explicit types

---

#### Q16
```cpp
std::string str = "hello";
auto a = std::move(str);
std::cout << str.length() << " " << a.length();
```

**Answer:**
```
0 5 (typical, implementation-dependent)
```

**Explanation:**
- `str = "hello"` creates string with 5 chars
- `std::move(str)` casts str to rvalue reference
- Enables move semantics
- `auto a = std::move(str)` invokes move constructor
- a takes ownership of str's resources
- str left in moved-from state (valid but unspecified)
- Moved-from string typically empty (length 0)
- str.length() returns 0 (typical)
- a.length() returns 5 (a owns "hello")
- Prints "0 5"
- Moved-from state guarantees:
  - Object remains valid
  - Can be safely destroyed or reassigned
  - Unspecified state (don't rely on specific value)
- Don't use moved-from objects except to destroy or reassign
- auto deduces value type (std::string), invokes move constructor
- **Key Concept:** Move leaves source in valid but unspecified state; typically empty for strings

---

#### Q17
```cpp
int* ptr = new int(10);
auto a = ptr;
auto& b = ptr;
delete ptr;
ptr = nullptr;
// Is 'a' now nullptr?
// Is 'b' now nullptr?
```

**Answer:**
```
a: NO (still points to deleted memory)
b: YES (reference to ptr, which is now nullptr)
```

**Explanation:**
- `ptr` points to heap-allocated int
- `auto a = ptr` creates copy of pointer
- `a` is `int*`, stores same address as ptr
- `auto& b = ptr` creates reference to ptr
- `b` is `int*&` (reference to pointer)
- `delete ptr` deallocates memory
- Both a and ptr now dangling (point to freed memory)
- `ptr = nullptr` sets ptr to null
- `b` is reference to ptr → b now also nullptr
- But `a` is independent copy → still has old address
- `a` is NOT nullptr (still dangling)
- `b` IS nullptr (reference to ptr)
- Using a or dereferencing old value of b = undefined behavior
- References are aliases, not independent copies
- Pattern demonstrates reference vs value semantics
- **Key Concept:** Copy stores independent value; reference is alias that reflects changes to original

---

#### Q18
```cpp
const int x = 5;
auto&& a = x;
auto&& b = 10;
std::cout << typeid(a).name() << " " << typeid(b).name();
```

**Answer:**
```
i i (both show int)
```

**Explanation:**
- `auto&& a = x` uses forwarding reference
- x is const lvalue
- Deduced as `const int&` (lvalue reference)
- Reference collapsing: `const int& &&` → `const int&`
- `auto&& b = 10` binds to rvalue
- 10 is prvalue (temporary)
- Deduced as `int&&` (rvalue reference)
- typeid strips references and const
- Shows underlying non-reference type
- Both show int ('i' in GCC/Clang, "int" in MSVC)
- Prints "i i"
- typeid behavior:
  - Strips references (T&, T&&, const T& → T)
  - Strips top-level const (const T → T)
  - Shows underlying type only
- To preserve references in type: use decltype
  ```cpp
  typeid(decltype(a)).name()  // Shows reference type
  ```
- **Key Concept:** typeid strips references and const; shows underlying value type only

---

#### Q19
```cpp
auto make_lambda() {
    int x = 42;
    return [&]() { return x; };
}
auto l = make_lambda();
std::cout << l();  // Safe or undefined behavior?
```

**Answer:**
```
Undefined behavior
```

**Explanation:**
- make_lambda() creates local variable x
- Lambda captures x by reference: `[&]`
- Lambda returned from function
- make_lambda() exits → x destroyed
- Returned lambda contains dangling reference
- `l()` executes lambda
- Accesses destroyed variable x
- Undefined behavior: crash, garbage, or appears to work
- Classic dangling reference bug
- Reference capture must outlive lambda
- **Fix:** Capture by value
  ```cpp
  return [=]() { return x; };  // Captures copy
  ```
- Or use shared state:
  ```cpp
  auto x = std::make_shared<int>(42);
  return [x]() { return *x; };  // Captures shared_ptr
  ```
- Lambda lifetime considerations critical for reference captures
- **Key Concept:** Capturing local by reference creates dangling reference when lambda outlives scope; use value capture or shared ownership

---

#### Q20
```cpp
std::map<int, std::string> m = {{1, "one"}, {2, "two"}};
for (auto [key, value] : m) {  // C++17 feature
    std::cout << key << " " << value << "\n";
}
// Is this valid in C++11?
```

**Answer:**
```
NO - Compilation error in C++11
```

**Explanation:**
- Structured bindings introduced in C++17
- `auto [key, value]` is C++17 syntax
- Decomposes pair into named variables
- Not available in C++11
- C++11 equivalent:
  ```cpp
  for (const auto& pair : m) {
      std::cout << pair.first << " " << pair.second << "\n";
  }
  ```
- Or use explicit destructuring:
  ```cpp
  for (const auto& p : m) {
      const int& key = p.first;
      const std::string& value = p.second;
      std::cout << key << " " << value << "\n";
  }
  ```
- C++17 structured bindings work with:
  - std::pair, std::tuple
  - Arrays
  - Structs with public members
- Syntactic sugar for cleaner code
- **Key Concept:** Structured bindings (auto [x, y]) require C++17; C++11 uses .first/.second for pairs

---
