## TOPIC: C++17 Language Features - Structured Bindings, if constexpr, Inline Variables

### PRACTICE_TASKS: Output Prediction and Analysis Questions

#### Q1
```cpp
#include <iostream>
std::pair<int, int> get_pair() { return {1, 2}; }
int main() {
    auto [x, y] = get_pair();
    x = 10;
    auto [a, b] = get_pair();
    std::cout << a << " " << b;
}
```

**Answer:**
```
1 2
```

**Explanation:**
- C++17 structured bindings `auto [x, y]` unpacks pair by copying elements by default
- `x = 10` modifies the local copy of first element, not the returned pair
- Second call `get_pair()` returns fresh pair {1, 2} (independent from first call)
- `[a, b]` receives new copies: a=1, b=2
- **Key Concept:** Structured bindings create copies by default; use auto& for references to modify original

#### Q2
```cpp
#include <iostream>
struct Point { int x = 5; int y = 10; };
int main() {
    Point p;
    auto& [a, b] = p;
    a = 100;
    std::cout << p.x << " " << p.y;
}
```

**Answer:**
```
100 10
```

**Explanation:**
- `auto&` creates reference bindings (not copies)
- `[a, b]` are references to `p.x` and `p.y` respectively
- `a = 100` modifies `p.x` through the reference
- Output shows modified `p.x` (100) and unchanged `p.y` (10)
- **Key Concept:** auto& structured bindings create references allowing modification of original object members

#### Q3
```cpp
#include <iostream>
template<typename T>
void func(T val) {
    if constexpr (std::is_integral_v<T>) {
        std::cout << val + 1;
    } else {
        std::cout << val;
    }
}
int main() {
    func(10);
    std::cout << " ";
    func(3.14);
}
```

**Answer:**
```
11 3.14
```

**Explanation:**
- `if constexpr` evaluates condition at compile time, discarding non-taken branch
- `func(10)`: T=int, `is_integral_v<int>` is true → prints 10+1=11
- `func(3.14)`: T=double, `is_integral_v<double>` is false → prints 3.14 as-is
- Unlike regular if, discarded branch is not compiled (no instantiation errors)
- **Key Concept:** if constexpr enables compile-time branching in templates; discarded branches never instantiated

#### Q4
```cpp
#include <iostream>
struct Config {
    inline static int count = 0;
};
int main() {
    Config::count++;
    Config::count++;
    std::cout << Config::count;
}
```

**Answer:**
```
2
```

**Explanation:**
- C++17 `inline static` allows in-class initialization of static members (no separate definition needed)
- Single shared variable across all instances and direct access via class name
- First `Config::count++` increments from 0 to 1
- Second `Config::count++` increments from 1 to 2
- **Key Concept:** inline static variables eliminate need for out-of-class definition; shared state directly accessible

#### Q5
```cpp
#include <iostream>
#include <map>
int main() {
    std::map<int, std::string> m = {{1, "a"}, {2, "b"}};
    for (const auto& [k, v] : m) {
        std::cout << k;
    }
}
```

**Answer:**
```
12
```

**Explanation:**
- Structured bindings unpack map entries (std::pair<const int, std::string>)
- `[k, v]` extracts key and value from each pair
- `const auto&` avoids copying map entries (efficient for large values)
- Loop iterates in sorted order (map keeps keys sorted): key 1, then key 2
- **Key Concept:** Structured bindings simplify range-based loops over maps by unpacking key-value pairs directly

#### Q6
```cpp
#include <iostream>
template<typename T>
void check(T val) {
    if constexpr (sizeof(T) == 4) {
        std::cout << "4";
    } else {
        std::cout << "8";
    }
}
int main() {
    check(10);
    check(10LL);
}
```

**Answer:**
```
48
```

**Explanation:**
- `sizeof(T)` evaluated at compile time for each instantiation
- `check(10)`: T=int, typically 4 bytes → prints "4"
- `check(10LL)`: T=long long, typically 8 bytes → prints "8"
- `if constexpr` allows compile-time size checking without runtime overhead
- **Key Concept:** if constexpr with sizeof enables compile-time type size branching for optimization

#### Q7
```cpp
#include <iostream>
#include <tuple>
int main() {
    auto [a, b, c] = std::make_tuple(1, 2.5, 'x');
    std::cout << a << " " << c;
}
```

**Answer:**
```
1 x
```

**Explanation:**
- Structured bindings unpack tuple elements in declaration order
- `a` receives first element (int 1)
- `b` receives second element (double 2.5, unused)
- `c` receives third element (char 'x')
- Types automatically deduced: a=int, b=double, c=char
- **Key Concept:** Structured bindings work with tuples for convenient multi-value unpacking with automatic type deduction

#### Q8
```cpp
#include <iostream>
struct S {
    inline static constexpr int val = 42;
};
int main() {
    std::cout << S::val;
}
```

**Answer:**
```
42
```

**Explanation:**
- `inline static constexpr` combines three specifiers: inline (in-class definition), static (shared), constexpr (compile-time constant)
- No separate definition required outside class (inline eliminates ODR issues)
- Accessible via class name without instance: `S::val`
- Value 42 computed at compile time (constexpr)
- **Key Concept:** inline static constexpr enables compile-time constants defined directly in class without external definition

#### Q9
```cpp
#include <iostream>
int main() {
    int arr[3] = {10, 20, 30};
    auto [x, y, z] = arr;
    x = 100;
    std::cout << arr[0];
}
```

**Answer:**
```
10
```

**Explanation:**
- Structured bindings copy array elements by default
- `[x, y, z]` creates three independent variables: x=10, y=20, z=30
- `x = 100` modifies the copy, not `arr[0]`
- `arr[0]` remains 10 (original array unchanged)
- **Key Concept:** Structured bindings copy arrays; use auto& to bind to original array elements

#### Q10
```cpp
#include <iostream>
template<bool B>
void func() {
    if constexpr (B) {
        std::cout << "true";
    } else {
        std::cout << "false";
    }
}
int main() {
    func<true>();
    func<false>();
}
```

**Answer:**
```
truefalse
```

**Explanation:**
- Template parameter `B` is compile-time constant (non-type template parameter)
- `func<true>()`: B=true, if constexpr takes true branch → prints "true"
- `func<false>()`: B=false, if constexpr takes else branch → prints "false"
- Each instantiation compiles only the taken branch (discarded branch removed)
- **Key Concept:** if constexpr with template parameters enables compile-time conditional compilation based on template arguments

---
#### Q11
```cpp
#include <iostream>
#include <string>
int main() {
    auto [x, y] = std::pair{1, std::string("hello")};
    std::cout << x << " " << y.size();
}
```

**Answer:**
```
1 5
```

**Explanation:**
- C++17 CTAD (Class Template Argument Deduction) deduces `pair<int, string>` from initializer
- Structured bindings unpack pair: x=1, y="hello"
- `x` is int, `y` is std::string (move-constructed from temporary)
- `y.size()` returns 5 (length of "hello")
- **Key Concept:** Structured bindings combined with CTAD simplify pair/tuple creation and unpacking

#### Q12
```cpp
#include <iostream>
struct Point { int x; int y; };
int main() {
    Point p{5, 10};
    const auto& [a, b] = p;
    std::cout << a << " " << b;
}
```

**Answer:**
```
5 10
```

**Explanation:**
- `const auto&` creates const reference bindings to struct members
- `a` is const reference to `p.x`, `b` is const reference to `p.y`
- Cannot modify through `a` or `b` (const references)
- Efficient: no copying, just references to existing members
- **Key Concept:** const auto& structured bindings create const references for read-only access without copying

#### Q13
```cpp
#include <iostream>
template<typename T>
void process(T val) {
    if constexpr (std::is_pointer_v<T>) {
        std::cout << *val;
    } else {
        std::cout << val;
    }
}
int main() {
    int x = 42;
    process(&x);
    std::cout << " ";
    process(x);
}
```

**Answer:**
```
42 42
```

**Explanation:**
- `process(&x)`: T=int*, `is_pointer_v<int*>` is true → dereferences: `*val` prints 42
- `process(x)`: T=int, `is_pointer_v<int>` is false → prints value directly: 42
- `if constexpr` prevents compilation errors in discarded branches
- Without constexpr, `*val` for non-pointer would fail to compile
- **Key Concept:** if constexpr enables type-dependent operations that would be invalid in discarded branches

#### Q14
```cpp
#include <iostream>
struct Counter {
    inline static int count = 0;
    Counter() { ++count; }
};
int main() {
    Counter c1, c2, c3;
    std::cout << Counter::count;
}
```

**Answer:**
```
3
```

**Explanation:**
- `inline static int count = 0` initialized once, shared across all instances
- Constructor increments shared `count` for each object created
- c1 construction: count becomes 1
- c2 construction: count becomes 2
- c3 construction: count becomes 3
- **Key Concept:** inline static members track instance count or shared state across all objects

#### Q15
```cpp
#include <iostream>
#include <vector>
int main() {
    std::vector<std::pair<int, int>> v = {{1,2}, {3,4}};
    for (const auto& [a, b] : v) {
        std::cout << a + b << " ";
    }
}
```

**Answer:**
```
3 7
```

**Explanation:**
- Vector contains pairs: {1,2} and {3,4}
- Structured bindings in range-based for loop unpack each pair
- First iteration: a=1, b=2 → prints 1+2=3
- Second iteration: a=3, b=4 → prints 3+4=7
- **Key Concept:** Structured bindings in range-based loops simplify iteration over containers of pairs/tuples

#### Q16
```cpp
#include <iostream>
template<typename T>
constexpr bool is_large() {
    if constexpr (sizeof(T) > 4) {
        return true;
    } else {
        return false;
    }
}
int main() {
    std::cout << is_large<int>() << " " << is_large<long long>();
}
```

**Answer:**
```
0 1
```

**Explanation:**
- `constexpr` function evaluated at compile time when possible
- `is_large<int>()`: sizeof(int)=4, not > 4 → returns false (printed as 0)
- `is_large<long long>()`: sizeof(long long)=8, > 4 → returns true (printed as 1)
- `if constexpr` ensures only one branch exists per instantiation
- **Key Concept:** constexpr functions with if constexpr enable compile-time type trait queries

#### Q17
```cpp
#include <iostream>
struct Data {
    int a = 1;
    int b = 2;
};
int main() {
    Data d;
    auto [x, y] = d;
    std::cout << x << y;
}
```

**Answer:**
```
12
```

**Explanation:**
- Structured bindings unpack struct members in declaration order
- `x` receives copy of `d.a` (1)
- `y` receives copy of `d.b` (2)
- `std::cout << x << y` prints 1 then 2 without space: "12"
- **Key Concept:** Structured bindings work with simple structs, unpacking public members in declaration order

#### Q18
```cpp
#include <iostream>
namespace Config {
    inline constexpr int Size = 100;
}
int main() {
    std::cout << Config::Size;
}
```

**Answer:**
```
100
```

**Explanation:**
- `inline constexpr` in namespace defines compile-time constant with internal linkage
- No separate definition needed (inline eliminates ODR issues across translation units)
- Accessible via namespace qualification: `Config::Size`
- Value known at compile time (constexpr)
- **Key Concept:** inline constexpr in namespaces provides header-only compile-time constants

#### Q19
```cpp
#include <iostream>
#include <tuple>
int main() {
    auto t = std::make_tuple(1, 2, 3);
    auto& [a, b, c] = t;
    a = 10;
    std::cout << std::get<0>(t);
}
```

**Answer:**
```
10
```

**Explanation:**
- `auto&` creates reference bindings to tuple elements
- `a` is reference to first element of `t`
- `a = 10` modifies `std::get<0>(t)` through reference
- `std::get<0>(t)` returns modified value: 10
- **Key Concept:** auto& structured bindings allow modification of tuple elements via references

#### Q20
```cpp
#include <iostream>
template<typename T>
void func(T val) {
    if constexpr (std::is_same_v<T, int>) {
        std::cout << "int";
    } else if constexpr (std::is_same_v<T, double>) {
        std::cout << "double";
    } else {
        std::cout << "other";
    }
}
int main() {
    func(10);
    func(3.14);
    func("hi");
}
```

**Answer:**
```
intdoubleother
```

**Explanation:**
- `if constexpr` chain for compile-time type checking
- `func(10)`: T=int, first condition true → prints "int"
- `func(3.14)`: T=double, second condition true → prints "double"
- `func("hi")`: T=const char*, both conditions false → prints "other"
- Each instantiation has only relevant code (other branches discarded)
- **Key Concept:** if constexpr chains enable compile-time type dispatch without runtime overhead

---
