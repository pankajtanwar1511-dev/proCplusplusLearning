## TOPIC: Compile-Time Programming in C++

### PRACTICE_TASKS: Challenge Questions

#### Q1
```cpp
constexpr int add(int a, int b) {
    return a + b;
}

int main() {
    int x = 10;
    constexpr int y = add(5, x);
    std::cout << y;
}
```

**Answer:**
```
Compilation Error
```

**Explanation:**
- `x` is a runtime variable (not constexpr), so its value is unknown at compile time
- `constexpr int y` requires initialization with a constant expression
- `add(5, x)` cannot be evaluated at compile time because `x` is runtime variable
- Compiler error: "constexpr variable must be initialized by constant expression"
- **Key Concept:** constexpr variables require compile-time constant initialization; runtime variables make expressions non-constant

#### Q2
```cpp
constexpr int factorial(int n) {
    int result = 1;
    for (int i = 2; i <= n; ++i) {
        result *= i;
    }
    return result;
}

int main() {
    constexpr int f5 = factorial(5);
}
```

**Answer:**
```
C++11: Compilation Error
C++14+: Compiles successfully (120)
```

**Explanation:**
- C++11 constexpr functions had strict restrictions: single return statement, no loops, no mutable variables
- C++14 relaxed these restrictions, allowing loops, multiple statements, and mutable local variables
- `factorial(5)` uses loop and mutable `result` - only valid in C++14+
- Result: 5! = 5×4×3×2×1 = 120
- **Key Concept:** C++14 significantly expanded constexpr capabilities by allowing loops and mutable variables

#### Q3
```cpp
template<typename T>
void process(T value) {
    if constexpr (std::is_integral_v<T>) {
        std::cout << value + 1 << "\n";
    } else {
        std::cout << value << "\n";
    }
}

int main() {
    process(42);
    process(std::string("hello"));
}
```

**Answer:**
```
43
hello
```

**Explanation:**
- `if constexpr` evaluates condition at compile time based on type T
- For `process(42)`: T=int (integral), only `value+1` branch compiled, prints 43
- For `process("hello")`: T=std::string (not integral), only `value` branch compiled, prints "hello"
- Discarded branch is not instantiated - no compilation errors even if invalid for that type
- **Key Concept:** `if constexpr` enables compile-time branching that eliminates dead code paths

#### Q4
```cpp
static_assert(sizeof(int) == 8, "int must be 8 bytes");

int main() {
    return 0;
}
```

**Answer:**
```
Compilation Error (typically)
```

**Explanation:**
- Most systems have `sizeof(int) == 4` bytes (32-bit int on 64-bit systems)
- `static_assert` performs compile-time check
- When condition is false, compilation fails with custom message "int must be 8 bytes"
- Some systems (older 64-bit platforms) may have 8-byte ints, but this is rare
- **Key Concept:** static_assert validates assumptions at compile time; fails compilation when condition is false

#### Q5
```cpp
constexpr int divide(int a, int b) {
    return b != 0 ? a / b : 0;
}

int main() {
    constexpr int result = divide(10, 0);
}
```

**Answer:**
```
Compiles successfully (result = 0)
```

**Explanation:**
- Ternary guard `b != 0 ?` prevents division by zero
- When b=0, returns 0 immediately without evaluating a/b
- Compile-time division by zero is avoided by the guard
- Result: `divide(10, 0)` evaluates to 0 at compile time
- **Key Concept:** constexpr functions can use conditionals to avoid undefined behavior at compile time

#### Q6
```cpp
template<int N>
struct Fib {
    static constexpr int value = Fib<N-1>::value + Fib<N-2>::value;
};

template<> struct Fib<0> { static constexpr int value = 0; };
template<> struct Fib<1> { static constexpr int value = 1; };

int main() {
    std::cout << Fib<5>::value;
}
```

**Answer:**
```
5
```

**Explanation:**
- Template metaprogramming computes Fibonacci at compile time via recursive template instantiation
- Fib<5> = Fib<4> + Fib<3> = (Fib<3>+Fib<2>) + (Fib<2>+Fib<1>) = ... = 5
- Base cases: Fib<0>=0, Fib<1>=1 (template specializations)
- Sequence: 0, 1, 1, 2, 3, 5 → Fib<5> = 5
- **Key Concept:** Template metaprogramming enables compile-time computation through recursive instantiation

#### Q7
```cpp
constexpr int foo(int x) {
    return x * 2;
}

int main() {
    int arr[foo(5)];
    std::cout << sizeof(arr) / sizeof(int);
}
```

**Answer:**
```
10
```

**Explanation:**
- Array size must be known at compile time
- `foo(5)` is constexpr function called with literal 5 → evaluated at compile time
- Array declared as `int arr[10]` (10 elements)
- `sizeof(arr)` = 10×4 = 40 bytes, `sizeof(int)` = 4 bytes
- **Key Concept:** constexpr functions can be used in contexts requiring compile-time constants (array sizes, template arguments)

#### Q8
```cpp
#include <type_traits>

static_assert(std::is_same_v<int, const int>, "Types match");

int main() {}
```

**Answer:**
```
Compilation Error
```

**Explanation:**
- `std::is_same` performs exact type comparison including cv-qualifiers
- `int` and `const int` are different types (const qualifier matters)
- `static_assert` condition evaluates to false
- Compilation fails with message "Types match"
- **Key Concept:** Type traits check exact types; cv-qualifiers (const/volatile) make types distinct

#### Q9
```cpp
consteval int square(int x) {
    return x * x;
}

int main() {
    int runtime_val = 5;
    int result = square(runtime_val);
}
```

**Answer:**
```
Compilation Error
```

**Explanation:**
- `consteval` (C++20) forces function to ALWAYS execute at compile time (stricter than constexpr)
- `runtime_val` is not a compile-time constant
- `square(runtime_val)` cannot be evaluated at compile time
- Compiler error: "consteval function call must produce compile-time constant"
- **Key Concept:** consteval mandates immediate (compile-time) evaluation; all arguments must be constants

#### Q10
```cpp
constexpr int max_value(int a, int b) {
    return (a > b) ? a : b;
}

int main() {
    constexpr int x = 10;
    constexpr int y = 20;
    constexpr int max_val = max_value(x, y);
    static_assert(max_val == 20);
}
```

**Answer:**
```
Compiles successfully
```

**Explanation:**
- All values (x=10, y=20) are constexpr - known at compile time
- `max_value(10, 20)` evaluates to 20 at compile time
- `max_val` initialized to 20 (compile-time constant)
- `static_assert(20 == 20)` passes - no error
- **Key Concept:** constexpr functions with constexpr arguments produce compile-time constants for validation

---
#### Q11
```cpp
template<typename T>
void print(T value) {
    if (std::is_integral_v<T>) {
        std::cout << "Integer\n";
    } else {
        std::cout << "Not integer\n";
    }
}

int main() {
    print(42);
    print(3.14);
}
```

**Answer:**
```
Integer
Not integer
```

**Explanation:**
- Regular `if` (not `if constexpr`) evaluates condition at runtime
- Type trait `std::is_integral_v<T>` is still computed at compile time
- For `print(42)`: T=int, `is_integral_v` = true, prints "Integer"
- For `print(3.14)`: T=double, `is_integral_v` = false, prints "Not integer"
- **Key Concept:** Type traits can be used with regular runtime if; condition value known at compile time but branching is runtime

#### Q12
```cpp
constexpr int compute(int n) {
    if (n < 0) throw std::invalid_argument("negative");
    return n * 2;
}

int main() {
    constexpr int result = compute(-5);
}
```

**Answer:**
```
Compilation Error
```

**Explanation:**
- C++20 allows exceptions in constexpr functions BUT only if not thrown during constant evaluation
- `compute(-5)` triggers `throw` during compile-time evaluation
- Compile-time evaluation cannot actually throw exceptions (no runtime context)
- Compiler error: "constexpr evaluation must not throw exceptions"
- **Key Concept:** constexpr functions can contain throw statements but constant evaluation must not reach them

#### Q13
```cpp
template<size_t N>
struct Array {
    int data[N];
    static_assert(N > 0, "Size must be positive");
};

int main() {
    Array<5> arr1;
    Array<0> arr2;  // Uncommented
}
```

**Answer:**
```
Compilation Error
```

**Explanation:**
- `Array<0>` instantiates template with N=0
- `static_assert(0 > 0)` evaluates to false
- Compilation stops with error message "Size must be positive"
- `Array<5>` would compile fine (5 > 0 is true)
- **Key Concept:** static_assert in templates validates template parameters; enforces constraints at instantiation time

#### Q14
```cpp
constexpr bool is_even(int x) {
    return x % 2 == 0;
}

int main() {
    if constexpr (is_even(10)) {
        std::cout << "Even\n";
    } else {
        std::cout << "Odd\n";
    }
}
```

**Answer:**
```
Even
```

**Explanation:**
- `if constexpr (is_even(10))` evaluates `10 % 2 == 0` at compile time
- Condition is true (10 is even), so only "Even" branch is compiled
- "Odd" branch completely eliminated from generated code
- No runtime check - branch selection happens at compile time
- **Key Concept:** if constexpr with constexpr functions enables complete code elimination based on compile-time conditions

#### Q15
```cpp
template<int N>
struct Countdown {
    static constexpr int value = Countdown<N-1>::value + 1;
};

template<>
struct Countdown<0> {
    static constexpr int value = 0;
};

int main() {
    std::cout << Countdown<10000>::value;
}
```

**Answer:**
```
Compilation Error (likely)
```

**Explanation:**
- Recursive template instantiation depth: Countdown<10000> → Countdown<9999> → ... → Countdown<0>
- Default compiler template instantiation depth limit is typically 512-1024
- 10000 levels exceeds this limit
- Compiler error: "template instantiation depth exceeds maximum" (can increase with -ftemplate-depth=N)
- **Key Concept:** Template metaprogramming has depth limits; deep recursion may require compiler flag adjustment

#### Q16
```cpp
constexpr int global = 100;

constexpr int get_value() {
    return global;
}

int main() {
    constexpr int val = get_value();
    std::cout << val;
}
```

**Answer:**
```
100
```

**Explanation:**
- `global` declared constexpr - value known at compile time
- `get_value()` is constexpr function reading constexpr variable
- `val` initialized to 100 at compile time
- Entire computation happens during compilation, prints 100 at runtime
- **Key Concept:** constexpr functions can access constexpr global variables during constant evaluation

#### Q17
```cpp
template<typename T>
class Container {
    static_assert(std::is_trivially_copyable_v<T>,
                  "T must be trivially copyable");
    T data;
};

int main() {
    Container<int> c1;         // OK
    Container<std::string> c2;  // Uncommented
}
```

**Answer:**
```
Compilation Error
```

**Explanation:**
- `Container<std::string>` instantiates template with T=std::string
- `std::string` has non-trivial copy constructor and destructor
- `std::is_trivially_copyable_v<std::string>` = false
- `static_assert` fails with message "T must be trivially copyable"
- **Key Concept:** static_assert with type traits enforces template parameter constraints; prevents invalid instantiations

#### Q18
```cpp
constexpr int mystery(int n) {
    return n <= 1 ? 1 : mystery(n-1) + mystery(n-2);
}

int main() {
    constexpr int val = mystery(10);
    std::cout << val;
}
```

**Answer:**
```
89
```

**Explanation:**
- Recursive constexpr function computing Fibonacci numbers
- `mystery(n)` = Fib(n+1): mystery(0)=1, mystery(1)=1, mystery(2)=2, mystery(3)=3, mystery(4)=5...
- `mystery(10)` = Fib(11) = 89
- Entire recursion evaluated at compile time (slow compile, fast runtime)
- **Key Concept:** constexpr functions support recursion for compile-time algorithmic computation

#### Q19
```cpp
#include <type_traits>

template<typename T>
void process(T value) {
    if constexpr (std::is_pointer_v<T>) {
        std::cout << "Pointer: " << *value << "\n";
    } else {
        std::cout << "Value: " << value << "\n";
    }
}

int main() {
    int x = 42;
    process(x);
    process(&x);
}
```

**Answer:**
```
Value: 42
Pointer: 42
```

**Explanation:**
- `if constexpr` selects code path at compile time based on type
- For `process(x)`: T=int (not pointer), only "Value" branch compiled
- For `process(&x)`: T=int* (pointer), only "Pointer" branch compiled - dereferences pointer
- Unused branch not instantiated - no error even though `*value` invalid for non-pointers
- **Key Concept:** if constexpr enables type-dependent logic without SFINAE; discarded branches not type-checked

#### Q20
```cpp
constinit int counter = 0;

int main() {
    counter++;
    std::cout << counter;
}
```

**Answer:**
```
Compiles successfully, prints 1
```

**Explanation:**
- `constinit` (C++20) guarantees compile-time initialization but allows runtime modification
- `counter` initialized to 0 at compile time (before main)
- Unlike `constexpr`, `constinit` variables are mutable at runtime
- `counter++` increments to 1 at runtime, prints 1
- **Key Concept:** constinit ensures constant initialization for performance/safety while preserving runtime mutability

---
