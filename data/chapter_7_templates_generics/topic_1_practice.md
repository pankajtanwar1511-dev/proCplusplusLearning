## TOPIC: Template Fundamentals and Specialization

### PRACTICE_TASKS: Output Prediction and Code Analysis

#### Q1
```cpp
template<typename T>
T getValue() { return T(); }

int main() {
    std::cout << getValue<int>() << "\n";
    std::cout << getValue<double>() << "\n";
}
```

**Answer:**
```
0
0
```

**Explanation:**
- `getValue<int>()` instantiates template with T=int
- `return T()` performs value-initialization
- Value-initialization for int: zero-initialization → 0
- `getValue<double>()` instantiates with T=double
- Value-initialization for double: 0.0
- Value-initialization: T() creates default-initialized object
- For built-in types: zero
- For classes: calls default constructor
- **Key Concept:** T() value-initializes; numeric types become zero, classes call default constructor

---

#### Q2
```cpp
template<typename T>
void print(T) { std::cout << "template\n"; }

void print(int) { std::cout << "non-template\n"; }

int main() {
    print(42);
    print(3.14);
}
```

**Answer:**
```
non-template
template
```

**Explanation:**
- Two print functions: template and non-template (int)
- `print(42)` where 42 is int
- Overload resolution priority: exact match > template
- Non-template print(int) is exact match, selected
- Prints "non-template"
- `print(3.14)` where 3.14 is double
- Only template version can handle double
- Template instantiated with T=double
- Prints "template"
- Templates participate in overload resolution but are less preferred than exact matches
- **Key Concept:** Non-template functions preferred over templates in overload resolution; exact matches beat template deduction

---

#### Q3
```cpp
template<typename T, typename U>
struct Pair {
    static void show() { std::cout << "generic\n"; }
};

template<typename T>
struct Pair<T, T> {
    static void show() { std::cout << "same\n"; }
};

int main() {
    Pair<int, double>::show();
    Pair<float, float>::show();
}
```

**Answer:**
```
generic
same
```

**Explanation:**
- Primary template: `Pair<T, U>` for two different type parameters
- Partial specialization: `Pair<T, T>` when both types are same
- `Pair<int, double>` has different types (int, double)
- Matches primary template, prints "generic"
- `Pair<float, float>` has same type for both parameters
- Matches partial specialization `Pair<T, T>`
- More specific match preferred, prints "same"
- Partial specialization allows specializing on type patterns
- **Key Concept:** Partial specialization matches type patterns; more specific matches preferred over generic template

---

#### Q4
```cpp
template<typename T = double, typename U>
struct Test { };

int main() {
    Test<int, float> t;
}
```

**Answer:**
```
Compilation error
```

**Explanation:**
- Template parameters: `typename T = double, typename U`
- T has default (double), U has no default
- Rule: parameters with defaults must come after those without
- U has no default but comes after T which has default
- Violates template parameter ordering rule
- Compiler error: default argument must be at end
- **Fix:** Reorder: `typename U, typename T = double`
- Or give U a default too
- Similar to function parameters with defaults
- **Key Concept:** Template default arguments must be rightmost; parameters without defaults come first

---

#### Q5
```cpp
template<typename T>
struct Container {
    void valid() { std::cout << "ok\n"; }
    void invalid() { typename T::invalid_type x; }
};

int main() {
    Container<int> c;
    c.valid();
}
```

**Answer:**
```
ok
```

**Explanation:**
- `Container<int>` instantiates template with T=int
- Only used members are instantiated (lazy/two-phase instantiation)
- `valid()` called, instantiated successfully
- `invalid()` attempts `typename T::invalid_type` where T=int
- int has no nested type invalid_type (would be error)
- BUT invalid() never called, never instantiated
- Error never triggered - compiles successfully
- Only definition errors in called/referenced members cause compilation failure
- Unused template members not instantiated
- **Key Concept:** Template lazy instantiation: only used members compiled; errors in unused members ignored

---

#### Q6
```cpp
template<typename T>
struct IsPointer { static const bool value = false; };

template<typename T>
struct IsPointer<T*> { static const bool value = true; };

int main() {
    std::cout << IsPointer<int>::value << " ";
    std::cout << IsPointer<int*>::value << " ";
    std::cout << IsPointer<int**>::value << "\n";
}
```

**Answer:**
```
0 1 1
```

**Explanation:**
- IsPointer primary template: value = false for all types
- Partial specialization `IsPointer<T*>` for pointer types: value = true
- `IsPointer<int>` matches primary (int is not pointer): 0
- `IsPointer<int*>` matches specialization (int* matches T* pattern): 1
- `IsPointer<int**>` matches specialization (int** = (int*)* matches T* where T=int*): 1
- Pattern matching: T* matches any pointer type
- Type trait pattern for compile-time type checking
- **Key Concept:** Partial specialization for type patterns (T*); enables compile-time type categorization

---

#### Q7
```cpp
template<int N>
struct Power2 {
    static constexpr int value = 2 * Power2<N-1>::value;
};

template<>
struct Power2<0> { static constexpr int value = 1; };

int main() {
    std::cout << Power2<5>::value << "\n";
}
```

**Answer:**
```
32
```

**Explanation:**
- Template metaprogramming: computation at compile time
- `Power2<5>` instantiates recursive template
- Recursion: Power2<5> = 2 * Power2<4> = 2 * (2 * Power2<3>) ...
- Base case: Power2<0> = 1 (full specialization)
- Expansion: 2 * 2 * 2 * 2 * 2 * 1 = 32
- Computed during compilation, not runtime
- constexpr allows compile-time evaluation
- Result is compile-time constant
- **Key Concept:** Template recursion for compile-time computation; base case specialization terminates recursion

---

#### Q8
```cpp
template<typename T, size_t N>
class Array {
    T data[N];
public:
    size_t size() const { return N; }
};

int main() {
    Array<int, 3> a1;
    Array<int, 5> a2;
    std::cout << a1.size() << " " << a2.size() << "\n";
}
```

**Answer:**
```
3 5
```

**Explanation:**
- Template with non-type parameter: `size_t N`
- `Array<int, 3>` and `Array<int, 5>` are different types
- N is compile-time constant, part of type signature
- `T data[N]` uses N to size array at compile time
- a1 has array of 3 ints, size() returns 3
- a2 has array of 5 ints, size() returns 5
- Different N values create incompatible types
- Cannot assign Array<int, 3> to Array<int, 5>
- Non-type parameters: integral types, pointers, enums
- **Key Concept:** Non-type template parameters create distinct types; enable compile-time array sizing

---

#### Q9
```cpp
template<typename T>
void func(T val) { std::cout << "value\n"; }

template<typename T>
void func(T* val) { std::cout << "pointer\n"; }

int main() {
    int x = 42;
    func(x);
    func(&x);
}
```

**Answer:**
```
value
pointer
```

**Explanation:**
- Two template overloads: func(T) and func(T*)
- `func(x)` where x is int
- T deduced as int, calls func(T), prints "value"
- `func(&x)` where &x is int*
- Two possible deductions: T=int* for func(T), or T=int for func(T*)
- Both viable, but func(T*) is more specific (partial ordering)
- More specialized template preferred
- Calls func(T*) with T=int, prints "pointer"
- Template partial ordering resolves ambiguity
- **Key Concept:** Template overload resolution prefers more specialized templates; func(T*) more specific than func(T)

---

#### Q10
```cpp
template<typename T>
struct Traits {
    static void print() { std::cout << "primary\n"; }
};

template<>
struct Traits<int> {
    static void print() { std::cout << "int\n"; }
};

template<>
struct Traits<const int> {
    static void print() { std::cout << "const int\n"; }
};

int main() {
    Traits<int>::print();
    Traits<const int>::print();
}
```

**Answer:**
```
int
const int
```

**Explanation:**
- Primary template: Traits<T> prints "primary"
- Full specialization for int: Traits<int> prints "int"
- Full specialization for const int: Traits<const int> prints "const int"
- `Traits<int>` exact match with int specialization
- `Traits<const int>` exact match with const int specialization
- int and const int are distinct types
- Each has separate full specialization
- Full specialization provides completely different implementation
- Not partial specialization (no template parameters left)
- **Key Concept:** Full specializations for distinct types; const qualifier creates different type requiring separate specialization

---

#### Q11
```cpp
template<typename T>
T add(T a, T b) { return a + b; }

int main() {
    std::cout << add(5, 10) << "\n";
    std::cout << add<double>(5, 10) << "\n";
}
```

**Answer:**
```
15
15
```

**Explanation:**
- `add(5, 10)` deduces T from arguments
- Both 5 and 10 are int, T deduced as int
- Returns 5 + 10 = 15
- `add<double>(5, 10)` explicitly specifies T=double
- Template instantiated with T=double
- Arguments 5 and 10 converted to double
- Returns 5.0 + 10.0 = 15.0 (printed as 15)
- Explicit template arguments override deduction
- Can use explicit specification when deduction fails or needs override
- **Key Concept:** Template argument deduction infers types; explicit specification overrides deduction

---

#### Q12
```cpp
template<typename T, typename U = int>
void process(T) { std::cout << sizeof(U) << "\n"; }

int main() {
    process(42);
    process<double>(3.14);
    process<float, long>(1.0f);
}
```

**Answer:**
```
4
4
8
```

**Explanation:**
- Template has default argument: `U = int`
- `process(42)` deduces T=int, U defaults to int
- sizeof(int) = 4
- `process<double>(3.14)` explicitly sets T=double, U defaults to int
- sizeof(int) = 4
- `process<float, long>(1.0f)` sets T=float, U=long explicitly
- sizeof(long) = 8
- Default arguments used when not explicitly provided
- Can override defaults with explicit specification
- **Key Concept:** Template default arguments provide fallback types; can be overridden explicitly

---

#### Q13
```cpp
template<typename T>
struct Base {
    void interface() { std::cout << "Base\n"; }
};

template<>
struct Base<int> {
    void interface() { std::cout << "Base<int>\n"; }
};

int main() {
    Base<double> b1;
    Base<int> b2;
    b1.interface();
    b2.interface();
}
```

**Answer:**
```
Base
Base<int>
```

**Explanation:**
- Primary template Base<T> has interface() printing "Base"
- Full specialization Base<int> overrides with different implementation
- `Base<double> b1` instantiates primary template
- b1.interface() prints "Base"
- `Base<int> b2` uses full specialization
- b2.interface() prints "Base<int>"
- Full specialization provides completely custom implementation
- Not just parameter change, entire class body replaced
- Common pattern: general behavior + optimized special cases
- **Key Concept:** Full template specialization provides custom implementation for specific types

---

#### Q14
```cpp
template<int N>
struct Factorial {
    static constexpr int value = N * Factorial<N-1>::value;
};

template<>
struct Factorial<0> {
    static constexpr int value = 1;
};

int main() {
    constexpr int f = Factorial<4>::value;
    std::cout << f << "\n";
}
```

**Answer:**
```
24
```

**Explanation:**
- Classic template metaprogramming: factorial at compile time
- `Factorial<4>` recursively expands
- Factorial<4> = 4 * Factorial<3>
- Factorial<3> = 3 * Factorial<2>
- Factorial<2> = 2 * Factorial<1>
- Factorial<1> = 1 * Factorial<0>
- Factorial<0> = 1 (base case specialization)
- Result: 4 * 3 * 2 * 1 * 1 = 24
- Computed during compilation, constexpr value
- Used to initialize constexpr variable f
- **Key Concept:** Template recursion with specialization base case enables compile-time computation

---

#### Q15
```cpp
template<typename T1, typename T2>
struct Pair { static void show() { std::cout << "A\n"; } };

template<typename T>
struct Pair<T, int> { static void show() { std::cout << "B\n"; } };

template<>
struct Pair<double, int> { static void show() { std::cout << "C\n"; } };

int main() {
    Pair<float, char>::show();
    Pair<float, int>::show();
    Pair<double, int>::show();
}
```

**Answer:**
```
A
B
C
```

**Explanation:**
- Three template versions: primary, partial specialization, full specialization
- `Pair<float, char>` matches only primary template
- No specializations match, prints "A"
- `Pair<float, int>` matches partial specialization Pair<T, int>
- More specific than primary, prints "B"
- `Pair<double, int>` matches both partial specialization and full specialization
- Full specialization Pair<double, int> most specific
- Specialization priority: full > partial > primary
- Prints "C"
- Compiler selects most specialized matching template
- **Key Concept:** Template specialization priority: full specialization > partial specialization > primary template

---

#### Q16
```cpp
template<typename T>
void test(T) { std::cout << "1\n"; }

template<typename T>
void test(T&) { std::cout << "2\n"; }

int main() {
    int x = 42;
    test(x);
    test(42);
}
```

**Answer:**
```
2
1
```

**Explanation:**
- Two template overloads: test(T) and test(T&)
- `test(x)` where x is lvalue int
- T deduced as int for both overloads
- test(T&) is more specific (reference binding)
- Lvalue prefers reference overload, calls test(T&)
- Prints "2"
- `test(42)` where 42 is rvalue
- test(T&) cannot bind to rvalue (non-const lvalue ref)
- Only test(T) viable, T deduced as int
- Prints "1"
- Template partial ordering: reference version more specialized
- **Key Concept:** Lvalues prefer reference templates; rvalues bind to value parameter templates

---

#### Q17
```cpp
template<typename T>
struct RemoveConst { using type = T; };

template<typename T>
struct RemoveConst<const T> { using type = T; };

int main() {
    RemoveConst<int>::type a = 10;
    RemoveConst<const int>::type b = 20;
    std::cout << a << " " << b << "\n";
}
```

**Answer:**
```
10 20
```

**Explanation:**
- Type trait RemoveConst for stripping const
- Primary template: type = T (no change)
- Partial specialization for const T: type = T (removes const)
- `RemoveConst<int>::type` matches primary
- int has no const, type = int
- a is int, assigned 10
- `RemoveConst<const int>::type` matches specialization
- const int matches pattern const T where T=int
- type = int (const removed)
- b is int (not const), assigned 20
- Similar to std::remove_const in <type_traits>
- **Key Concept:** Partial specialization patterns enable type transformations; basis for type traits

---

#### Q18
```cpp
template<bool B, typename T = void>
struct EnableIf { };

template<typename T>
struct EnableIf<true, T> { using type = T; };

int main() {
    EnableIf<true, int>::type x = 42;
    std::cout << x << "\n";
}
```

**Answer:**
```
42
```

**Explanation:**
- EnableIf primary template: no type member defined
- Partial specialization EnableIf<true, T>: defines type = T
- `EnableIf<true, int>::type` matches specialization
- true matches bool pattern, T=int
- type member exists, equals int
- x is int, assigned 42
- `EnableIf<false, int>::type` would match primary (no type member - error)
- SFINAE-like: Substitution Failure Is Not An Error
- Used to conditionally enable templates
- Similar to std::enable_if
- **Key Concept:** Partial specialization on bool enables conditional type definitions; foundational for SFINAE

---

#### Q19
```cpp
template<typename T>
struct Wrapper {
    static void print() { std::cout << sizeof(T) << "\n"; }
};

int main() {
    Wrapper<char>::print();
    Wrapper<int>::print();
    Wrapper<double>::print();
}
```

**Answer:**
```
1
4
8
```

**Explanation:**
- Template uses sizeof(T) to get type size
- `Wrapper<char>::print()` instantiates with T=char
- sizeof(char) = 1 byte (always 1 by standard)
- `Wrapper<int>::print()` with T=int
- sizeof(int) = 4 bytes (typical, platform-dependent)
- `Wrapper<double>::print()` with T=double
- sizeof(double) = 8 bytes (typical)
- sizeof evaluated at compile time
- Template instantiation generates different static methods
- Each prints size of its type parameter
- **Key Concept:** sizeof works with template parameters; enables compile-time size queries

---

#### Q20
```cpp
template<typename T, int N>
struct Array {
    T data[N];
    constexpr int size() const { return N; }
};

int main() {
    Array<int, 5> a;
    constexpr int s = a.size();
    int arr[s];
    std::cout << sizeof(arr) / sizeof(int) << "\n";
}
```

**Answer:**
```
5
```

**Explanation:**
- Non-type template parameter N = 5
- `Array<int, 5>` instantiates with N=5
- size() is constexpr function, returns N
- `constexpr int s = a.size()` evaluates at compile time
- s = 5 (compile-time constant)
- `int arr[s]` uses s as array size
- Array size must be compile-time constant
- sizeof(arr) = 5 * sizeof(int) = 20 bytes
- 20 / 4 = 5
- Non-type parameters enable compile-time computation
- constexpr propagates compile-time constants
- **Key Concept:** Non-type parameters with constexpr enable compile-time array sizing and computation

---
