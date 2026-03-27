### PRACTICE_TASKS: Uniform Initialization, initializer_list, Variadic Templates, and constexpr

#### Q1
```cpp
int x = 3.14;
int y{3.14};
std::cout << x << " " << y;
```

**Answer:**
```
Compilation error
```

**Explanation:**
- Traditional initialization: `int x = 3.14`
  - Allows implicit narrowing conversion
  - 3.14 narrowed to 3
  - x = 3 (compiles with possible warning)
- Brace initialization: `int y{3.14}`
  - Prevents narrowing conversions
  - Double to int is narrowing
  - Compilation error
- **C++ safety feature:** Braces catch type mismatches
- **Best practice:** Use braces for type safety
- Without the second line, would print "3"
- **Key Concept:** Brace initialization prevents narrowing; catches type errors at compile-time

---

#### Q2
```cpp
struct Widget {
    Widget(int, int) { std::cout << "int,int\n"; }
    Widget(std::initializer_list<int>) { std::cout << "list\n"; }
};
Widget w1(10, 20);
Widget w2{10, 20};
```

**Answer:**
```
int,int
list
```

**Explanation:**
- w1(10, 20): Parentheses initialization
  - Calls matching constructor: Widget(int, int)
  - Prints "int,int"
- w2{10, 20}: Brace initialization
  - Strongly prefers initializer_list constructor
  - {10, 20} creates initializer_list<int>
  - Calls Widget(std::initializer_list<int>)
  - Prints "list"
- **Preference rule:** Braces always prefer initializer_list if available
- **Can be surprising:** Even when other constructors match exactly
- **Design tradeoff:** Consistency vs. least surprise
- **Key Concept:** Brace initialization prefers initializer_list constructor over all others

---

#### Q3
```cpp
std::vector<int> v1(10, 5);
std::vector<int> v2{10, 5};
std::cout << v1.size() << " " << v2.size();
```

**Answer:**
```
10 2
```

**Explanation:**
- v1(10, 5): Parentheses call vector(size_t, value)
  - Creates vector with 10 elements
  - Each element initialized to 5
  - v1 = {5, 5, 5, 5, 5, 5, 5, 5, 5, 5}
  - Size: 10
- v2{10, 5}: Braces prefer initializer_list
  - Creates vector from list {10, 5}
  - v2 = {10, 5}
  - Size: 2
- **Common confusion:** Different meanings with () vs {}
- **Must understand:** Which constructor is called
- **Key Concept:** vector initialization differs with () vs {}; braces create list, parens call constructor

---

#### Q4
```cpp
constexpr int factorial(int n) {
    return (n <= 1) ? 1 : n * factorial(n - 1);
}
constexpr int x = factorial(5);
int arr[x];
std::cout << sizeof(arr) / sizeof(int);
```

**Answer:**
```
120
```

**Explanation:**
- constexpr function can execute at compile-time
- factorial(5) = 5 * 4 * 3 * 2 * 1 = 120
- Computed during compilation
- constexpr int x = 120 (compile-time constant)
- Array size must be compile-time constant
- arr has 120 int elements
- sizeof(arr) = 120 * sizeof(int) = 120 * 4 = 480 bytes (typical)
- 480 / 4 = 120
- **No runtime calculation:** Everything known at compile-time
- **Key Concept:** constexpr functions enable compile-time computation; can be used for array sizes

---

#### Q5
```cpp
template<typename... Args>
void count(Args... args) {
    std::cout << sizeof...(args);
}
count(1, 2, 3, 4, 5);
```

**Answer:**
```
5
```

**Explanation:**
- Variadic template: `typename... Args`
- Parameter pack: `Args... args`
- sizeof... operator returns number of arguments
- count(1, 2, 3, 4, 5): 5 arguments
- sizeof...(args) = 5
- **Not sizeof(args):** That would give size in bytes
- **Compile-time operator:** Result known at compile-time
- Works with both type packs and value packs
- **Key Concept:** sizeof... counts parameter pack elements; compile-time operation

---

#### Q6
```cpp
std::initializer_list<int> makeList() {
    return {1, 2, 3};
}
auto list = makeList();
for (int x : list) std::cout << x << " ";
```

**Answer:**
```
Undefined behavior
```

**Explanation:**
- {1, 2, 3} creates temporary array
- initializer_list is lightweight view (two pointers)
- Points to temporary array
- Temporary array destroyed when function returns
- list now has dangling pointers
- Iterating accesses destroyed memory
- Undefined behavior: crash, garbage, or appears to work
- **Common mistake:** Returning initializer_list from function
- **Fix:** Return std::vector<int> or std::array<int, 3>
- **Key Concept:** initializer_list is a view; returning it creates dangling references

---

#### Q7
```cpp
auto x = {1, 2, 3};
std::cout << x.size();
```

**Answer:**
```
3
```

**Explanation:**
- auto with single braced-init-list
- Deduces std::initializer_list<int>
- x has type std::initializer_list<int>
- Contains 3 elements: {1, 2, 3}
- x.size() returns 3
- **Special rule:** auto + braces = initializer_list
- **C++17 change:** `auto x{1}` deduces int, not initializer_list
- **C++11/14:** Both `auto x{1}` and `auto x = {1}` deduce initializer_list
- **Key Concept:** auto with braces deduces initializer_list; special deduction rule

---

#### Q8
```cpp
struct Point { int x, y; };
Point p1{10};
Point p2{};
std::cout << p1.x << "," << p1.y << " " << p2.x << "," << p2.y;
```

**Answer:**
```
10,0 0,0
```

**Explanation:**
- Point is aggregate (no user-defined constructors)
- Aggregate initialization with braces
- p1{10}: Initialize x=10, remaining members zero-initialized
  - x = 10, y = 0
- p2{}: Empty braces, all members zero-initialized
  - x = 0, y = 0
- **Zero initialization:** Unspecified members become 0
- **Aggregate rules:** Public members, no constructors
- Works with structs, arrays
- **Key Concept:** Aggregate initialization with braces; unspecified members zero-initialized

---

#### Q9
```cpp
constexpr int add(int a, int b) {
    return a + b;
}
int x = 5;
constexpr int y = add(x, 10);
```

**Answer:**
```
Compilation error
```

**Explanation:**
- add is constexpr function (can run at compile-time)
- x is runtime variable (not constexpr)
- constexpr int y requires compile-time value
- add(x, 10) cannot be evaluated at compile-time (x not constant)
- Compilation error: y must be initialized with constant expression
- **Fix 1:** constexpr int x = 5;
- **Fix 2:** int y = add(x, 10); (runtime evaluation)
- **constexpr requirement:** All inputs must be compile-time constants
- **Key Concept:** constexpr variables require compile-time constant initialization

---

#### Q10
```cpp
template<typename T, typename... Rest>
T first(T f, Rest... r) {
    return f;
}
std::cout << first(1, 2, 3, 4, 5);
```

**Answer:**
```
1
```

**Explanation:**
- Variadic template with explicit first parameter
- T deduced from first argument: int
- Rest... captures remaining arguments (2, 3, 4, 5)
- Function returns first argument: f = 1
- **Pattern:** Common for head/tail decomposition
- Rest... ignored in this function
- Could be used for recursive processing
- **Key Concept:** Variadic templates can separate first argument; useful for recursive patterns

---

#### Q11
```cpp
std::vector<char> v{65, 66, 67, 300};
for (char c : v) std::cout << c;
```

**Answer:**
```
Compilation error
```

**Explanation:**
- char range: -128 to 127 (signed) or 0 to 255 (unsigned)
- 300 exceeds maximum char value
- Brace initialization prevents narrowing
- 300 to char is narrowing conversion
- Compilation error
- **Without braces:** `vector<char> v(65, 66)` would compile
- **Type safety:** Braces catch this error
- **65, 66, 67:** Would be 'A', 'B', 'C' if 300 wasn't there
- **Key Concept:** Brace initialization prevents narrowing to smaller types; catches overflow errors

---

#### Q12
```cpp
struct Widget {
    Widget() { std::cout << "default\n"; }
    Widget(std::initializer_list<int>) { std::cout << "list\n"; }
};
Widget w1;
Widget w2{};
Widget w3{{}};
```

**Answer:**
```
default
default
list
```

**Explanation:**
- w1: No arguments, calls default constructor
  - Prints "default"
- w2{}: Empty braces
  - **Special case:** Calls default constructor, not initializer_list
  - Empty braces = default initialization
  - Prints "default"
- w3{{}}: Explicit empty initializer_list
  - Outer braces: brace-initialization
  - Inner braces: empty initializer_list
  - Calls Widget(std::initializer_list<int>)
  - Prints "list"
- **Subtle distinction:** {} vs {{}}
- **Key Concept:** Empty {} calls default constructor; {{}} calls initializer_list constructor

---

#### Q13
```cpp
constexpr int x = 10;
x = 20;
std::cout << x;
```

**Answer:**
```
Compilation error
```

**Explanation:**
- constexpr variables are implicitly const
- constexpr int x = 10 means const int x = 10
- Cannot modify const variable
- x = 20 is compilation error
- **constexpr properties:**
  - Value computed at compile-time
  - Implicitly const
  - Cannot be modified
- **Use case:** Compile-time constants
- **Key Concept:** constexpr implies const; variables cannot be modified after initialization

---

#### Q14
```cpp
template<typename... Args>
void print(Args... args) {
    int dummy[] = {(std::cout << args << " ", 0)...};
}
print(1, 2, 3, 4);
```

**Answer:**
```
1 2 3 4 
```

**Explanation:**
- Variadic template print function
- **Trick:** Dummy array with comma operator
- Pack expansion: `{(expr, 0)...}`
- For each arg: (std::cout << args << " ", 0)
  - Prints arg followed by space
  - Comma operator returns 0
  - 0 goes into dummy array
- Expands to: {(print 1, 0), (print 2, 0), (print 3, 0), (print 4, 0)}
- Array initialization forces left-to-right evaluation
- **Old technique:** Before C++17 fold expressions
- **Modern:** Use fold: `(std::cout << ... << args);`
- **Key Concept:** Dummy array trick forces parameter pack expansion in order

---

#### Q15
```cpp
std::vector<int> v1{};
std::vector<int> v2();
std::cout << v1.size();
```

**Answer:**
```
0
```

**Explanation:**
- v1{}: Brace initialization, creates empty vector
  - v1.size() = 0
  - Prints "0"
- v2(): **Most vexing parse**
  - Not a variable declaration
  - Declares function named v2
  - Returns std::vector<int>
  - Takes no parameters
- Accessing v2.size() would be compilation error
- **Classic C++ trap:** Parentheses can declare functions
- **Fix:** Use braces {} or extra parentheses (())
- **Key Concept:** Most vexing parse makes () declare functions; use {} for objects

---

#### Q16
```cpp
constexpr int square(int x) {
    int temp = x * x;
    return temp;
}
constexpr int y = square(5);
```

**Answer:**
```
Compilation error (C++11)
```

**Explanation:**
- C++11 constexpr functions very restricted
- Cannot have local variables
- Can only have single return statement
- square has local variable temp
- Compilation error in C++11
- **C++11 fix:**
  ```cpp
  constexpr int square(int x) {
      return x * x;
  }
  ```
- **C++14+:** Relaxed rules, allows local variables
- **C++14:** This code would compile
- **Key Concept:** C++11 constexpr functions very limited; C++14 relaxed restrictions

---

#### Q17
```cpp
auto list = std::initializer_list<int>{1, 2, 3};
auto list2 = list;
std::cout << list.size() << " " << list2.size();
```

**Answer:**
```
3 3
```

**Explanation:**
- initializer_list is lightweight view
- Contains two pointers: begin and end
- Points to underlying array {1, 2, 3}
- Copying initializer_list copies pointers
- list and list2 both point to same array
- Both have size 3
- **Shallow copy:** Only pointers copied
- **Underlying array:** Shared between copies
- **Lifetime:** Both valid as long as array exists
- **Key Concept:** initializer_list is lightweight view; copying shares underlying array

---

#### Q18
```cpp
template<typename... Args>
void process() {
    std::cout << "empty\n";
}
template<typename T, typename... Args>
void process(T first, Args... rest) {
    std::cout << first << " ";
    process(rest...);
}
process(1, 2, 3);
```

**Answer:**
```
1 2 3 empty
```

**Explanation:**
- Variadic template recursion pattern
- process(1, 2, 3):
  - Prints 1, calls process(2, 3)
- process(2, 3):
  - Prints 2, calls process(3)
- process(3):
  - Prints 3, calls process()
- process():
  - Base case, prints "empty"
- **Output:** "1 2 3 empty"
- **Classic pattern:** Recursive parameter pack processing
- **Modern alternative:** Fold expressions (C++17)
- **Key Concept:** Variadic template recursion with base case; classic parameter pack pattern

---

#### Q19
```cpp
struct Agg { int x; double y; };
Agg a{10, 3.14};
Agg b{10};
std::cout << b.x << " " << b.y;
```

**Answer:**
```
10 0
```

**Explanation:**
- Agg is aggregate type (no constructors)
- a{10, 3.14}: Initialize both members
  - x = 10, y = 3.14
- b{10}: Partial initialization
  - x = 10 (explicitly initialized)
  - y = 0 (zero-initialized, remaining member)
- **Zero initialization rule:** Uninitialized members get zero
- Works for int, double, pointers (nullptr)
- **Aggregate initialization:** List-initialization for aggregates
- **Key Concept:** Partial aggregate initialization zero-initializes remaining members

---

#### Q20
```cpp
constexpr int getValue() { return 42; }
int arr[getValue()];
std::cout << sizeof(arr) / sizeof(int);
```

**Answer:**
```
42
```

**Explanation:**
- constexpr function getValue() returns 42
- Array size requires compile-time constant
- getValue() evaluated at compile-time
- arr has size 42
- sizeof(arr) = 42 * sizeof(int) = 168 bytes (typical)
- 168 / 4 = 42
- **Compile-time evaluation:** No runtime overhead
- **constexpr advantage:** Can use in constant expressions
- **Non-constexpr:** Would not compile as array size
- **Key Concept:** constexpr functions can provide compile-time constants for array sizes

---
