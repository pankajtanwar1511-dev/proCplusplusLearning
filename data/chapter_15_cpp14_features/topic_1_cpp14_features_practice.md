## TOPIC: C++14 Language and Library Enhancements

### PRACTICE_TASKS: Output Prediction and Analysis Questions

#### Q1
```cpp
#include <iostream>
auto foo() { return 42; }
decltype(auto) bar() { int x = 42; return (x); }
int main() {
    auto a = foo();
    auto b = bar();
    std::cout << a << " " << b;
}
```

**Answer:**
```
Undefined behavior (likely crash)
```

**Explanation:**
- `foo()` returns `int` by value (auto deduction drops references)
- `bar()` with `decltype(auto)` preserves exact type: `(x)` is lvalue, so returns `int&`
- Local variable `x` destroyed when `bar()` returns - `b` is dangling reference
- Accessing dangling reference `b` is undefined behavior (crash or garbage)
- **Key Concept:** decltype(auto) preserves reference types; parentheses around expression make it lvalue reference

#### Q2
```cpp
#include <iostream>
auto lambda = [](auto x, auto y) { return x + y; };
int main() {
    std::cout << lambda(1, 2) << " " << lambda(1.5, 2.5);
}
```

**Answer:**
```
3 4
```

**Explanation:**
- C++14 generic lambdas use `auto` parameters for template-like behavior
- First call `lambda(1, 2)`: x=int, y=int → 1+2=3
- Second call `lambda(1.5, 2.5)`: x=double, y=double → 1.5+2.5=4.0
- Double 4.0 printed as integer 4 (default cout formatting)
- **Key Concept:** Generic lambdas with auto parameters enable polymorphic behavior without explicit templates

#### Q3
```cpp
#include <iostream>
#include <memory>
int main() {
    auto ptr = std::make_unique<int>(100);
    auto lam = [p = std::move(ptr)]() { return *p; };
    std::cout << lam() << " " << (ptr == nullptr);
}
```

**Answer:**
```
100 1
```

**Explanation:**
- C++14 init capture allows moving `ptr` into lambda: `[p = std::move(ptr)]`
- unique_ptr ownership transferred to lambda's capture `p`
- Original `ptr` becomes nullptr after move
- `lam()` dereferences captured `p` returning 100, `ptr == nullptr` evaluates to true (1)
- **Key Concept:** Init captures enable move-only types in lambdas; useful for capturing unique_ptr, thread, etc.

#### Q4
```cpp
#include <iostream>
constexpr int factorial(int n) {
    int result = 1;
    for (int i = 2; i <= n; ++i)
        result *= i;
    return result;
}
int main() {
    constexpr int x = factorial(5);
    std::cout << x;
}
```

**Answer:**
```
120
```

**Explanation:**
- C++14 relaxed constexpr restrictions: loops, multiple statements, mutable variables allowed
- `factorial(5)` computes 5! = 5×4×3×2×1 = 120 at compile time
- C++11 would require recursive template metaprogramming for this
- Result stored as compile-time constant `x = 120`
- **Key Concept:** C++14 constexpr functions can use loops and mutable local variables for easier compile-time computation

#### Q5
```cpp
#include <iostream>
#include <utility>
int main() {
    int a = 10;
    int old = std::exchange(a, 20);
    std::cout << old << " " << a;
}
```

**Answer:**
```
10 20
```

**Explanation:**
- `std::exchange(a, 20)` replaces `a` with 20 and returns old value (10)
- Atomic operation: old_value = a; a = new_value; return old_value
- Useful for implementing move operations, resetting values while preserving old state
- After execution: `old = 10` (original value), `a = 20` (new value)
- **Key Concept:** std::exchange provides atomic value replacement with return of old value; cleaner than manual swap

#### Q6
```cpp
#include <iostream>
#include <tuple>
int main() {
    std::tuple<int, double, char> t{1, 2.5, 'a'};
    std::cout << std::get<double>(t);
}
```

**Answer:**
```
2.5
```

**Explanation:**
- C++14 allows `std::get<Type>` to access tuple element by type (not just index)
- `std::get<double>(t)` retrieves element of type double (2.5)
- Requires type to appear exactly once in tuple (ambiguous if multiple doubles)
- More readable than index-based `std::get<1>(t)`
- **Key Concept:** C++14 std::get supports type-based tuple element access for improved code clarity

#### Q7
```cpp
#include <iostream>
template<typename T>
constexpr bool is_float = std::is_floating_point<T>::value;
int main() {
    std::cout << is_float<int> << " " << is_float<double>;
}
```

**Answer:**
```
0 1
```

**Explanation:**
- C++14 variable templates allow templated variables (not just classes/functions)
- `is_float<int>` evaluates to false (0), `is_float<double>` evaluates to true (1)
- Cleaner syntax than `std::is_floating_point<T>::value` repeatedly
- Compile-time constant for each template instantiation
- **Key Concept:** Variable templates enable templated constants; simplify type trait usage

#### Q8
```cpp
#include <iostream>
int main() {
    int x = 0b1010;
    int y = 1'000;
    std::cout << x << " " << y;
}
```

**Answer:**
```
10 1000
```

**Explanation:**
- `0b1010` is binary literal (C++14): 1×8 + 0×4 + 1×2 + 0×1 = 10 decimal
- `1'000` uses digit separator (') for readability: 1000 (separator ignored by compiler)
- Both features improve code readability for bit patterns and large numbers
- Can use separators anywhere: `1'000'000` or `0xDEAD'BEEF`
- **Key Concept:** C++14 binary literals (0b) and digit separators (') enhance numeric literal readability

#### Q9
```cpp
#include <iostream>
auto add = [](auto a, auto b) { return a + b; };
int main() {
    std::cout << add(5, 10) << " " << add(2.5, 3.5);
}
```

**Answer:**
```
15 6
```

**Explanation:**
- Generic lambda works with different types via template-like auto parameters
- `add(5, 10)`: int + int = 15
- `add(2.5, 3.5)`: double + double = 6.0, printed as 6 (default formatting)
- Single lambda definition handles multiple types without explicit overloading
- **Key Concept:** Generic lambdas eliminate need for multiple overloaded lambdas or function templates

#### Q10
```cpp
#include <iostream>
int global = 100;
decltype(auto) get_ref() { return (global); }
int main() {
    get_ref() = 200;
    std::cout << global;
}
```

**Answer:**
```
200
```

**Explanation:**
- `decltype(auto)` preserves exact expression type including references
- `(global)` is lvalue expression → returns `int&` (reference to global)
- `get_ref()` returns reference, allowing assignment: `get_ref() = 200` modifies `global`
- Without parentheses, `return global` would return `int` (by value)
- **Key Concept:** Parentheses in decltype(auto) return create lvalue reference; enables reference returns for modification

---
#### Q11
```cpp
#include <iostream>
#include <memory>
int main() {
    auto sp = std::make_shared<int>(42);
    auto lam = [p = sp]() { return *p; };
    std::cout << lam() << " " << sp.use_count();
}
```

**Answer:**
```
42 2
```

**Explanation:**
- Init capture `[p = sp]` copies shared_ptr (not moves)
- Two shared_ptr instances now own the resource: `sp` and captured `p`
- Reference count becomes 2 (shared ownership)
- `lam()` returns 42, `sp.use_count()` returns 2
- **Key Concept:** Init captures without std::move copy shared_ptr, incrementing reference count

#### Q12
```cpp
#include <iostream>
constexpr int square(int x) { return x * x; }
int main() {
    int arr[square(3)];
    std::cout << sizeof(arr) / sizeof(int);
}
```

**Answer:**
```
9
```

**Explanation:**
- `square(3)` evaluated at compile time: 3×3 = 9
- Array declared with compile-time constant size: `int arr[9]`
- `sizeof(arr)` = 9 elements × 4 bytes = 36 bytes (typically)
- `sizeof(arr) / sizeof(int)` = 36 / 4 = 9
- **Key Concept:** constexpr functions usable in constant expression contexts like array bounds

#### Q13
```cpp
#include <iostream>
template<typename T>
constexpr T pi = T(3.14159);
int main() {
    std::cout << pi<int> << " " << pi<double>;
}
```

**Answer:**
```
3 3.14159
```

**Explanation:**
- Variable template `pi<T>` creates type-specific constants
- `pi<int>` converts 3.14159 to int (truncates): 3
- `pi<double>` remains double: 3.14159
- Each instantiation is separate compile-time constant
- **Key Concept:** Variable templates enable type-parametrized constants with compile-time evaluation

#### Q14
```cpp
#include <iostream>
auto foo(bool b) {
    if (b) return 1;
    else return 2;
}
int main() {
    std::cout << foo(true) << " " << foo(false);
}
```

**Answer:**
```
1 2
```

**Explanation:**
- C++14 return type deduction from function body
- Both return paths produce `int`, so deduced return type is `int`
- `foo(true)` returns 1, `foo(false)` returns 2
- Would fail compilation if return types differ (e.g., `return 1` vs `return 1.5`)
- **Key Concept:** Auto return type deduction succeeds when all return statements deduce to same type

#### Q15
```cpp
#include <iostream>
int x = 10;
auto f1() { return x; }
decltype(auto) f2() { return (x); }
int main() {
    f2() = 20;
    std::cout << x;
}
```

**Answer:**
```
20
```

**Explanation:**
- `f1()` returns `int` by value (auto drops references)
- `f2()` with `decltype(auto)` and `(x)` returns `int&` (lvalue reference)
- `f2() = 20` assigns through reference, modifying global `x`
- Demonstrates difference between auto (value semantics) and decltype(auto) (exact type preservation)
- **Key Concept:** decltype(auto) enables perfect forwarding of value category; parentheses matter

#### Q16
```cpp
#include <iostream>
#include <tuple>
int main() {
    std::tuple<int, double, int> t{1, 2.5, 3};
    std::cout << std::get<0>(t);
}
```

**Answer:**
```
1
```

**Explanation:**
- `std::get<0>(t)` accesses first element by index (index 0)
- Works even though `int` appears twice in tuple (ambiguous for type-based access)
- Index-based access unambiguous: always returns first element
- Type-based `std::get<int>(t)` would fail compilation (multiple int types)
- **Key Concept:** Index-based std::get always unambiguous; type-based get requires unique type

#### Q17
```cpp
#include <iostream>
auto lambda = [](auto val) {
    static_assert(std::is_integral<decltype(val)>::value, "Integral required");
    return val * 2;
};
int main() {
    std::cout << lambda(21);
}
```

**Answer:**
```
42
```

**Explanation:**
- Generic lambda with compile-time constraint via static_assert
- `lambda(21)` instantiates with `val` = int (integral type)
- `static_assert` passes (int is integral), returns 21×2 = 42
- Calling `lambda(2.5)` would fail compilation (double not integral)
- **Key Concept:** Generic lambdas combined with static_assert enable compile-time type constraints

#### Q18
```cpp
#include <iostream>
#include <utility>
int main() {
    int x = 5;
    int y = std::exchange(x, std::exchange(x, 10));
    std::cout << x << " " << y;
}
```

**Answer:**
```
5 10
```

**Explanation:**
- Inner `std::exchange(x, 10)`: x changes from 5 to 10, returns 5
- Outer `std::exchange(x, 5)`: x changes from 10 to 5, returns 10
- Final state: `x = 5`, `y = 10`
- Evaluation order: right-to-left for function arguments (inner first)
- **Key Concept:** std::exchange returns old value while setting new; nested exchanges demonstrate evaluation order

#### Q19
```cpp
#include <iostream>
int main() {
    int binary = 0b1111;
    int readable = 1'00'0;
    std::cout << binary << " " << readable;
}
```

**Answer:**
```
15 100
```

**Explanation:**
- `0b1111` binary literal: 1×8 + 1×4 + 1×2 + 1×1 = 15 decimal
- `1'00'0` uses digit separators (flexible placement): 100 decimal
- Separators can be placed anywhere for readability: `1'00'0` or `10'0` both equal 100
- Binary literals useful for bit masks, flags, permissions
- **Key Concept:** Binary literals and digit separators improve readability without changing numeric value

#### Q20
```cpp
#include <iostream>
#include <memory>
auto ptr = std::make_unique<int>(99);
auto f = [p = std::move(ptr)]() mutable {
    return std::exchange(*p, 50);
};
int main() {
    std::cout << f() << " " << f();
}
```

**Answer:**
```
99 50
```

**Explanation:**
- Init capture with move: `ptr` ownership transferred to lambda's `p`
- `mutable` allows modifying captured values (lambda operator() non-const)
- First `f()`: `exchange(*p, 50)` returns 99 (original), sets `*p` to 50
- Second `f()`: `exchange(*p, 50)` returns 50 (current), sets `*p` to 50 (no change)
- **Key Concept:** Mutable lambdas with init capture enable stateful operations on moved-in resources

---
