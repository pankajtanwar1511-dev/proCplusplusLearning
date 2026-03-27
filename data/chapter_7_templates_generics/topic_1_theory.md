## TOPIC: Template Fundamentals and Specialization

### THEORY_SECTION: Core Template Concepts

#### 1. What Are Templates and How They Work - Function vs Class Templates

Templates are C++'s primary mechanism for **generic programming**, enabling type-safe code that works with any data type through **compile-time polymorphism**. The compiler generates type-specific code from a single template definition during compilation, creating zero-overhead abstractions without runtime cost.

**Function Templates vs Class Templates - Key Differences:**

| Feature | Function Templates | Class Templates |
|---------|-------------------|-----------------|
| **Purpose** | Generic algorithms and operations | Generic data structures and components |
| **Type Deduction** | ✅ Automatic from call arguments | ❌ Must specify explicitly (pre-C++17)<br>✅ CTAD in C++17+ |
| **Template Syntax** | `template<typename T> T func(T x)` | `template<typename T> class Container { T data; }` |
| **Instantiation** | `func(42)` - deduces `T=int` | `Container<int> c;` - explicit type required |
| **Partial Specialization** | ❌ Not allowed | ✅ Allowed |
| **Overloading** | ✅ Can overload with non-templates | N/A (classes don't overload, but can specialize) |
| **Default Template Args** | ✅ Only in declarations (separate from definition) | ✅ In definition or declaration |
| **Member Functions** | N/A | Lazily instantiated (only used members generate code) |
| **Instantiation Trigger** | Function call | Object creation, member access |

**Template Type Deduction Rules for Function Templates:**

| Parameter Pattern | Argument Type | Deduced `T` | Const/Reference Handling |
|-------------------|---------------|-------------|--------------------------|
| `T param` | `int` | `int` | ❌ Strips top-level const and references |
| `T param` | `const int` | `int` | ❌ Strips top-level const |
| `T param` | `int&` | `int` | ❌ Strips reference |
| `T& param` | `int` | `int` | ✅ Preserves const (if present in argument) |
| `T& param` | `const int` | `const int` | ✅ Preserves const |
| `const T& param` | `int` | `int` | ✅ Reference prevents copying |
| `T&& param` | `int` (lvalue) | `int&` | ✅ Universal reference (forwarding reference) |
| `T&& param` | `42` (rvalue) | `int` | ✅ Universal reference |
| `T* param` | `int*` | `int` | ✅ Pointer to `T` |

**Code Example - Function Template Type Deduction:**

```cpp
template<typename T>
void byValue(T param) { }  // T strips const and references

template<typename T>
void byRef(T& param) { }   // T preserves const in argument

template<typename T>
void byConstRef(const T& param) { }  // Universal const reference

int x = 42;
const int cx = x;
const int& rx = x;

byValue(x);      // T = int (no const)
byValue(cx);     // T = int (const stripped)
byValue(rx);     // T = int (reference and const stripped)

byRef(x);        // T = int, param type = int&
byRef(cx);       // T = const int, param type = const int&
// byRef(42);    // ❌ Error: cannot bind non-const lvalue ref to rvalue

byConstRef(x);   // T = int, param type = const int&
byConstRef(cx);  // T = int, param type = const int&
byConstRef(42);  // ✅ OK: const lvalue ref can bind to rvalue
```

**Code Example - Class Template Explicit Instantiation:**

```cpp
template<typename T>
class Box {
    T value;
public:
    Box(T v) : value(v) { }
    T get() const { return value; }
};

int main() {
    // ❌ Pre-C++17: Box b(42); // Error: cannot deduce template argument

    Box<int> b1(42);              // ✅ Explicit template argument
    Box<std::string> b2("hello"); // ✅ Different instantiation

    // C++17 CTAD (Class Template Argument Deduction):
    Box b3(42);        // ✅ C++17: Deduces Box<int>
    Box b4("hello");   // ✅ C++17: Deduces Box<const char*>
}
```

**Template Instantiation Process:**

| Phase | Timing | What Happens | Errors Detected |
|-------|--------|--------------|-----------------|
| **1. Template Definition** | When compiler sees template code | Syntax checking (non-dependent names) | Syntax errors, non-dependent name lookup failures |
| **2. Template Instantiation** | When template is used with specific type | Code generation for that type | Type-dependent errors (missing operators, invalid operations) |
| **3. Member Lazy Instantiation** | When member is actually called | Generate code only for used members | Member-specific errors (only if member is called) |

**Two-Phase Name Lookup:**

```cpp
// ✅ Phase 1: Definition-time check (non-dependent names)
template<typename T>
void process(T x) {
    nonExistentFunc();  // ❌ Error at definition - non-dependent name
    helper(x);          // ✅ Deferred - dependent name (depends on T)
}

// ✅ Phase 2: Instantiation-time check (dependent names via ADL)
void helper(int x) { std::cout << "int: " << x << "\n"; }

int main() {
    process(42);  // ✅ Finds helper(int) via ADL at instantiation time
}
```

**Why Templates Matter - Zero-Overhead Abstractions:**

| Aspect | Templates | Virtual Functions (Runtime Polymorphism) |
|--------|-----------|------------------------------------------|
| **Performance** | ✅ Zero overhead (inlining, compile-time resolution) | ❌ Vtable lookup overhead, no inlining of virtual calls |
| **Code Size** | ❌ Larger (code bloat - each type generates new code) | ✅ Smaller (single implementation, dynamic dispatch) |
| **Type Safety** | ✅ Compile-time checking | ✅ Runtime type checking (RTTI with `dynamic_cast`) |
| **Flexibility** | ❌ Types must be known at compile time | ✅ Runtime polymorphism, plugin architectures |
| **STL Foundation** | ✅ Basis for containers, algorithms, iterators | ❌ Not used in STL (performance reasons) |
| **Error Messages** | ❌ Notoriously complex error messages | ✅ Clear runtime errors |

---

#### 2. Template Specialization - Full vs Partial Specialization Patterns

Template specialization allows providing custom implementations for specific types or type patterns, enabling type-specific optimizations and behaviors while maintaining a generic interface.

**Specialization Types Comparison:**

| Specialization Type | Syntax | Applies To | Pattern Matching | Use Case |
|---------------------|--------|------------|------------------|----------|
| **Primary Template** | `template<typename T> class C { }` | All types (default) | N/A - base case | Default generic implementation |
| **Full Specialization** | `template<> class C<int> { }` | Exact type match | No patterns | Optimize or customize for specific type |
| **Partial Specialization** | `template<typename T> class C<T*> { }` | Type patterns | ✅ Pattern matching (`T*`, `T&`, `T[]`, etc.) | Handle categories of types (pointers, references) |
| **Member Specialization** | `template<> void C<int>::func() { }` | Single member of specialization | N/A | Specialize one member, keep rest generic |

**Full Specialization - Complete Replacement:**

```cpp
// Primary template
template<typename T>
struct Printer {
    static void print(T value) {
        std::cout << "Generic: " << value << "\n";
    }
};

// ✅ Full specialization for bool
template<>
struct Printer<bool> {
    static void print(bool value) {
        std::cout << "Boolean: " << (value ? "true" : "false") << "\n";
    }
};

int main() {
    Printer<int>::print(42);      // Generic: 42
    Printer<bool>::print(true);   // Boolean: true
}
```

**Partial Specialization - Pattern Matching:**

| Pattern | Matches | Example | `T` Binds To |
|---------|---------|---------|--------------|
| `T*` | Any pointer type | `int*`, `double**` | Pointed-to type (`int`, `double*`) |
| `T&` | Any lvalue reference | `int&`, `const double&` | Referenced type |
| `T[N]` | Arrays of size `N` | `int[10]` | Element type (`int`) |
| `T[]` | Arrays of unknown size | `int[]` | Element type |
| `C<T>` | Specific template with any argument | `std::vector<int>` | Template argument (`int`) |
| `T, T` | Same type for both parameters | `Pair<int, int>` | Common type (`int`) |
| `T, int` | Second parameter is `int` | `Pair<double, int>` | First type (`double`) |
| `T, U*` | Second parameter is pointer | `Pair<int, double*>` | `T=int`, `U=double` |

**Code Example - Partial Specialization for Pointers:**

```cpp
// Primary template
template<typename T>
struct TypeInfo {
    static constexpr bool is_pointer = false;
    static void print() { std::cout << "Regular type\n"; }
};

// ✅ Partial specialization for pointers
template<typename T>
struct TypeInfo<T*> {
    static constexpr bool is_pointer = true;
    using PointeeType = T;  // Extract pointed-to type
    static void print() { std::cout << "Pointer type\n"; }
};

// ✅ Partial specialization for const pointers
template<typename T>
struct TypeInfo<const T*> {
    static constexpr bool is_pointer = true;
    static constexpr bool is_const_pointer = true;
    static void print() { std::cout << "Const pointer type\n"; }
};

int main() {
    TypeInfo<int>::print();        // Regular type
    TypeInfo<int*>::print();       // Pointer type
    TypeInfo<const int*>::print(); // Const pointer type

    std::cout << TypeInfo<double**>::is_pointer << "\n";  // 1 (T = double*)
}
```

**Multi-Parameter Partial Specialization:**

```cpp
// Primary template
template<typename T1, typename T2>
struct Pair {
    static void show() { std::cout << "Generic pair\n"; }
};

// ✅ Partial specialization: both types identical
template<typename T>
struct Pair<T, T> {
    static void show() { std::cout << "Homogeneous pair (T, T)\n"; }
};

// ✅ Partial specialization: second is int
template<typename T>
struct Pair<T, int> {
    static void show() { std::cout << "Second is int (T, int)\n"; }
};

// ✅ Full specialization: exact match
template<>
struct Pair<double, int> {
    static void show() { std::cout << "Full specialization (double, int)\n"; }
};

int main() {
    Pair<float, char>::show();   // Generic pair
    Pair<int, int>::show();      // Homogeneous pair (most specific match)
    Pair<float, int>::show();    // Second is int
    Pair<double, int>::show();   // Full specialization (highest priority)
}
```

**Specialization Selection Priority (Most Specific Wins):**

| Priority | Specialization | Example | When Selected |
|----------|----------------|---------|---------------|
| **1 (Highest)** | Full Specialization | `template<> class C<int, double>` | Exact type match |
| **2 (Medium)** | Partial Specialization | `template<typename T> class C<T, int>` | Pattern match |
| **3 (Lowest)** | Primary Template | `template<typename T, typename U> class C` | No better match |

**Ambiguous Partial Specialization (Compilation Error):**

```cpp
template<typename T, typename U> struct Test { };

template<typename T> struct Test<T, int> { };   // Specialization A
template<typename T> struct Test<int, T> { };   // Specialization B

int main() {
    Test<double, int> t1;  // ✅ OK: A matches
    Test<int, double> t2;  // ✅ OK: B matches
    // Test<int, int> t3;  // ❌ Error: Both A and B match equally - ambiguous!

    // ✅ Solution: Add full specialization to resolve ambiguity
    // template<> struct Test<int, int> { };
}
```

**Function Template Specialization (Only Full Specialization Allowed):**

```cpp
// Primary function template
template<typename T>
void process(T value) {
    std::cout << "Generic: " << value << "\n";
}

// ✅ Full specialization for int
template<>
void process<int>(int value) {
    std::cout << "Specialized for int: " << value << "\n";
}

// ❌ Partial specialization NOT allowed for function templates
// template<typename T>
// void process<T*>(T* value) { }  // ERROR!

// ✅ Use overloading instead of partial specialization
template<typename T>
void process(T* value) {
    std::cout << "Pointer overload: " << *value << "\n";
}

int main() {
    process(42);        // Specialized for int
    process(3.14);      // Generic

    int x = 10;
    process(&x);        // Pointer overload (via overloading, not specialization)
}
```

**Type Traits - Common Use of Partial Specialization:**

```cpp
// Primary template - default case
template<typename T>
struct RemovePointer {
    using type = T;  // Not a pointer - return as-is
};

// Partial specialization - strip one pointer level
template<typename T>
struct RemovePointer<T*> {
    using type = T;  // Remove pointer, return pointed-to type
};

int main() {
    RemovePointer<int>::type x = 42;        // int
    RemovePointer<int*>::type y = 42;       // int (pointer removed)
    RemovePointer<double**>::type* z;       // double* (one level removed)
}
```

---

#### 3. Non-Type Template Parameters and Template Metaprogramming

Non-type template parameters accept compile-time constant values (integers, pointers, references) rather than types, enabling compile-time computation and zero-overhead compile-time configuration.

**Non-Type Parameter Types (C++11/14/17/20 Evolution):**

| C++ Standard | Allowed Non-Type Parameter Types |
|--------------|-----------------------------------|
| **C++11** | Integral types (`int`, `size_t`, `bool`), enums, pointers, references (with external linkage) |
| **C++17** | + `auto` (compiler deduces type from argument) |
| **C++20** | + Floating-point types, literal class types (structural types), `auto` with deduced types |

**Non-Type Parameter Restrictions:**

| Requirement | Reason | Example |
|-------------|--------|---------|
| ✅ Must be compile-time constant | Template instantiation happens at compile time | `template<int N>` - `N` must be `constexpr` |
| ✅ Pointers must have static storage duration | Address must be stable across translation units | `extern const char* str;` |
| ❌ Cannot be floating-point (C++17) | Floating-point comparison issues, precision | `template<double D>` - ERROR in C++17 |
| ❌ Cannot be class type (pre-C++20) | No common representation before structural types | `template<MyClass obj>` - ERROR pre-C++20 |

**Code Example - Fixed-Size Array with Non-Type Parameter:**

```cpp
template<typename T, size_t N>
class FixedArray {
    T data[N];  // ✅ Array size known at compile time (stack allocation)
public:
    constexpr size_t size() const { return N; }

    T& operator[](size_t index) {
        return data[index];  // No bounds checking for performance
    }

    const T& operator[](size_t index) const {
        return data[index];
    }
};

int main() {
    FixedArray<int, 5> arr1;      // Stack-allocated 5-element int array
    FixedArray<double, 10> arr2;  // Stack-allocated 10-element double array

    arr1[0] = 100;
    std::cout << "Size: " << arr1.size() << "\n";  // Size: 5

    // FixedArray<int, 5> and FixedArray<int, 10> are DIFFERENT TYPES
    // arr1 = arr2;  // ❌ Error: incompatible types
}
```

**Different Sizes = Different Types:**

| Instantiation | Actual Type | Memory Layout | Interchangeable? |
|---------------|-------------|---------------|------------------|
| `FixedArray<int, 5>` | `FixedArray_int_5` | 20 bytes (5 × 4 bytes) | ❌ No |
| `FixedArray<int, 10>` | `FixedArray_int_10` | 40 bytes (10 × 4 bytes) | ❌ No |
| `FixedArray<double, 5>` | `FixedArray_double_5` | 40 bytes (5 × 8 bytes) | ❌ No |

**Template Metaprogramming - Compile-Time Computation:**

Template metaprogramming uses recursive template instantiation to perform computations at compile time, eliminating all runtime overhead.

**Code Example - Compile-Time Factorial:**

```cpp
// Recursive case
template<int N>
struct Factorial {
    static constexpr int value = N * Factorial<N - 1>::value;
};

// Base case (specialization)
template<>
struct Factorial<0> {
    static constexpr int value = 1;
};

int main() {
    constexpr int f5 = Factorial<5>::value;   // 120 (computed at compile time)
    constexpr int f10 = Factorial<10>::value; // 3628800

    // ✅ Can use in contexts requiring compile-time constants
    int array[Factorial<4>::value];  // int array[24]

    static_assert(Factorial<6>::value == 720, "Factorial incorrect");
}
```

**Template Metaprogramming Recursion Pattern:**

| Component | Purpose | Example |
|-----------|---------|---------|
| **Primary Template** | Recursive case | `Factorial<N>::value = N * Factorial<N-1>::value` |
| **Specialized Base Case** | Termination condition | `Factorial<0>::value = 1` |
| **Static Member** | Store result | `static constexpr int value` |
| **constexpr** | Compile-time evaluation | Allows use in constant expressions |

**Code Example - Compile-Time Power Calculation:**

```cpp
template<int Base, unsigned Exp>
struct Power {
    static constexpr int value = Base * Power<Base, Exp - 1>::value;
};

template<int Base>
struct Power<Base, 0> {
    static constexpr int value = 1;  // Base^0 = 1
};

int main() {
    constexpr int result = Power<2, 10>::value;  // 1024 (2^10)
    std::cout << "2^10 = " << result << "\n";

    // ✅ Used in array size (compile-time constant required)
    int buffer[Power<2, 8>::value];  // int buffer[256]
}
```

**Template Metaprogramming vs constexpr Functions:**

| Feature | Template Metaprogramming | constexpr Functions (C++11+) |
|---------|--------------------------|------------------------------|
| **Syntax** | ❌ Verbose (requires struct + specialization) | ✅ Natural function syntax |
| **Recursion** | ✅ Via template instantiation | ✅ Via normal function calls |
| **Readability** | ❌ Low (nested templates) | ✅ High (looks like normal code) |
| **Compilation Time** | ❌ Slower (template instantiation overhead) | ✅ Faster |
| **Type Computation** | ✅ Can compute types (e.g., `std::conditional`) | ❌ Cannot compute types |
| **When to Use** | Type-level computation, type traits | Value-level computation |

**Modern Alternative - constexpr Functions:**

```cpp
// ✅ Modern C++11+ approach (preferred for value computation)
constexpr int factorial(int n) {
    return (n <= 1) ? 1 : n * factorial(n - 1);
}

int main() {
    constexpr int f5 = factorial(5);     // ✅ Computed at compile time
    int array[factorial(4)];              // ✅ Can use in array size

    int n;
    std::cin >> n;
    int runtime_result = factorial(n);   // ✅ Can also use at runtime!
}
```

**Non-Type Parameter with auto (C++17):**

```cpp
template<auto N>  // ✅ C++17: auto deduces type from argument
struct Constant {
    static constexpr auto value = N;
};

int main() {
    Constant<42> c1;        // N deduced as int
    Constant<42u> c2;       // N deduced as unsigned
    Constant<true> c3;      // N deduced as bool

    std::cout << c1.value << "\n";  // 42
    std::cout << c2.value << "\n";  // 42
    std::cout << c3.value << "\n";  // 1
}
```

**Template Parameter Pack (Variadic Templates - C++11):**

```cpp
// Variadic template with non-type parameter pack
template<int... Values>
struct Sum;

// Base case: empty pack
template<>
struct Sum<> {
    static constexpr int value = 0;
};

// Recursive case: peel off first value
template<int First, int... Rest>
struct Sum<First, Rest...> {
    static constexpr int value = First + Sum<Rest...>::value;
};

int main() {
    constexpr int result = Sum<1, 2, 3, 4, 5>::value;  // 15
    std::cout << "Sum: " << result << "\n";
}
```

**Summary - When to Use Each Template Feature:**

| Feature | Use Case | Example |
|---------|----------|---------|
| **Function Templates** | Generic algorithms with automatic type deduction | `std::sort`, `std::find` |
| **Class Templates** | Generic containers and data structures | `std::vector`, `std::map` |
| **Full Specialization** | Optimize or customize for specific types | `std::hash<std::string>` |
| **Partial Specialization** | Handle categories of types | Type traits (`is_pointer<T*>`) |
| **Non-Type Parameters** | Compile-time configuration (sizes, counts) | `std::array<T, N>` |
| **Template Metaprogramming** | Compile-time type computation | `std::conditional`, `std::enable_if` |
| **constexpr Functions** | Compile-time value computation | Factorial, power calculations |

---

### EDGE_CASES: Tricky Scenarios and Gotchas

#### Edge Case 1: Template Instantiation is Lazy

The compiler only instantiates template code that is actually used. This means template code with errors won't cause compilation failures unless that specific instantiation is triggered.

```cpp
template<typename T>
void onlyForInt(T x) {
    static_assert(std::is_same<T, int>::value, "Only for int");  // ✅ Compile-time check
}

int main() {
    onlyForInt(5);        // ✅ OK - compiles and runs
    // onlyForInt("abc"); // ❌ Error only if uncommented
}
```

This behavior allows templates to contain code that's invalid for some types, as long as those types never actually use that code path. This is exploited in SFINAE and concept-like programming.

#### Edge Case 2: Function Template Overloading Priority

When both template and non-template functions exist in an overload set, non-template functions are preferred if they match exactly. Templates are only selected when no exact non-template match exists.

```cpp
void print(int x) {
    std::cout << "int: " << x << "\n";  // ✅ Non-template version
}

template<typename T>
void print(T x) {
    std::cout << "template: " << x << "\n";  // ✅ Template version
}

int main() {
    print(5);         // ✅ Calls non-template (exact match)
    print(5.0);       // ✅ Calls template (no exact match for double)
    print("test");    // ✅ Calls template
}
```

This priority system prevents templates from hijacking function calls when more specific implementations exist. However, it can cause subtle bugs if type conversions are involved.

#### Edge Case 3: Template Argument Deduction with References

Template argument deduction behaves differently with references, potentially preserving or discarding const and reference qualifiers depending on the parameter type.

```cpp
template<typename T>
void func1(T param) { }        // ✅ T deduced without reference

template<typename T>
void func2(T& param) { }       // ✅ T deduced, param is reference

template<typename T>
void func3(T&& param) { }      // ✅ Universal reference (forwarding reference)

int main() {
    int x = 42;
    const int cx = x;
    
    func1(cx);   // T = int (const discarded)
    func2(cx);   // T = const int (const preserved)
    func3(x);    // T = int& (lvalue)
    func3(42);   // T = int (rvalue)
}
```

Understanding these deduction rules is critical for writing correct generic code, especially when dealing with perfect forwarding and move semantics.

#### Edge Case 4: Two-Phase Name Lookup

Templates undergo two-phase compilation: first at definition (checking template syntax), second at instantiation (checking type-dependent expressions). This affects when errors are caught.

```cpp
template<typename T>
void process(T x) {
    helper(x);  // ✅ Lookup happens at instantiation
}

void helper(int x) { std::cout << x << "\n"; }

int main() {
    process(42);  // ✅ Finds helper through ADL at instantiation
}
```

If `helper` is only defined after the template, the code still compiles because lookup is deferred. However, this can lead to confusing error messages when instantiation fails.

#### Edge Case 5: Default Arguments Must Be Rightmost

Template parameters with default arguments must appear after all parameters without defaults, similar to function parameter rules.

```cpp
template<typename T = int, typename U>  // ❌ Error: U has no default after T
struct Bad { };

template<typename T, typename U = int>  // ✅ Correct: defaults are rightmost
struct Good { };
```

This restriction ensures the compiler can unambiguously match template arguments to parameters when fewer arguments are provided than parameters exist.

---

### CODE_EXAMPLES: Practical Demonstrations

#### Example 1: Basic Function Template with Type Deduction

```cpp
template<typename T>
T add(T a, T b) {
    return a + b;  // ✅ Generic addition
}

int main() {
    std::cout << add(3, 4) << "\n";         // ✅ T = int, returns 7
    std::cout << add(2.5, 3.7) << "\n";     // ✅ T = double, returns 6.2
    std::cout << add<int>(2.5, 3.7) << "\n"; // ✅ Explicit T = int, returns 5
}
```

The compiler deduces `T` from the function arguments. When both arguments have the same type, deduction succeeds. Explicit template arguments can override deduction and force type conversions.

#### Example 2: Class Template for Generic Container

```cpp
template<typename T>
class Box {
    T value;
public:
    Box(T val) : value(val) { }  // ✅ Constructor
    
    T get() const { return value; }  // ✅ Getter
    
    void set(T val) { value = val; }  // ✅ Setter
};

int main() {
    Box<int> intBox(10);              // ✅ Box holding int
    Box<std::string> strBox("hello");  // ✅ Box holding string
    
    std::cout << intBox.get() << "\n";  // 10
    std::cout << strBox.get() << "\n";  // hello
}
```

Class templates require explicit type specification at instantiation. Each instantiation creates a separate class with its own static members and member functions specialized for that type.

#### Example 3: Full Template Specialization

```cpp
template<typename T>
struct Printer {
    static void print(T value) {
        std::cout << "Generic: " << value << "\n";  // ✅ Primary template
    }
};

template<>
struct Printer<bool> {
    static void print(bool value) {
        std::cout << "Bool: " << (value ? "true" : "false") << "\n";  // ✅ Specialized for bool
    }
};

int main() {
    Printer<int>::print(42);      // Generic: 42
    Printer<bool>::print(true);   // Bool: true
}
```

Full specialization provides a completely custom implementation for specific types. The `template<>` syntax indicates this is a specialization, not a new template. Specializations must be declared after the primary template.

#### Example 4: Partial Specialization for Pointers

```cpp
template<typename T>
struct TypeTraits {
    static const bool is_pointer = false;  // ✅ Primary template
    static void print() { std::cout << "Not a pointer\n"; }
};

template<typename T>
struct TypeTraits<T*> {
    static const bool is_pointer = true;  // ✅ Specialization for pointers
    static void print() { std::cout << "Pointer type\n"; }
};

int main() {
    TypeTraits<int>::print();   // Not a pointer
    TypeTraits<int*>::print();  // Pointer type
    
    std::cout << TypeTraits<double>::is_pointer << "\n";   // 0
    std::cout << TypeTraits<double*>::is_pointer << "\n";  // 1
}
```

Partial specialization matches a subset of possible template arguments using pattern matching. The `T*` pattern matches any pointer type, binding `T` to the pointed-to type. This enables type trait implementations.

#### Example 5: Partial Specialization with Multiple Parameters

```cpp
template<typename T, typename U>
struct Pair {
    static void print() { std::cout << "Generic Pair\n"; }
};

template<typename T>
struct Pair<T, T> {
    static void print() { std::cout << "Same type Pair\n"; }  // ✅ Both types identical
};

template<typename T>
struct Pair<T, int> {
    static void print() { std::cout << "Second is int\n"; }  // ✅ Second parameter is int
};

int main() {
    Pair<double, char>::print();  // Generic Pair
    Pair<int, int>::print();      // Same type Pair
    Pair<float, int>::print();    // Second is int
}
```

Multiple partial specializations can coexist. The compiler selects the most specific match. If multiple specializations match equally, the code is ambiguous and won't compile.

#### Example 6: Default Template Arguments in Class Template

```cpp
template<typename T = int, typename U = double>
class Container {
    T first;
    U second;
public:
    Container(T f = T(), U s = U()) : first(f), second(s) { }
    
    void print() const {
        std::cout << first << ", " << second << "\n";
    }
};

int main() {
    Container<> c1;                    // ✅ T = int, U = double (both defaults)
    Container<float> c2(1.5f);         // ✅ T = float, U = double (U default)
    Container<char, bool> c3('A', true); // ✅ T = char, U = bool (explicit)
    
    c1.print();  // 0, 0
    c2.print();  // 1.5, 0
    c3.print();  // A, 1
}
```

Default template arguments simplify common use cases by providing sensible defaults. Users can override defaults by providing explicit arguments. All defaults must be rightmost in the parameter list.

#### Example 7: Non-Type Template Parameters

```cpp
template<typename T, size_t N>
class FixedArray {
    T data[N];  // ✅ Array size is compile-time constant
public:
    size_t size() const { return N; }
    
    T& operator[](size_t index) { return data[index]; }
    const T& operator[](size_t index) const { return data[index]; }
};

int main() {
    FixedArray<int, 5> arr;     // ✅ Array of 5 ints
    arr[0] = 10;
    arr[1] = 20;
    
    std::cout << "Size: " << arr.size() << "\n";  // Size: 5
    std::cout << arr[0] << ", " << arr[1] << "\n"; // 10, 20
}
```

Non-type template parameters accept compile-time constants like integers, pointers, or references. They enable compile-time computation and zero-overhead abstractions by embedding values in types. The array size is known at compile time, enabling stack allocation.

#### Example 8: Template Metaprogramming with Non-Type Parameters

```cpp
template<int N>
struct Factorial {
    static constexpr int value = N * Factorial<N - 1>::value;  // ✅ Recursive computation
};

template<>
struct Factorial<0> {
    static constexpr int value = 1;  // ✅ Base case
};

int main() {
    std::cout << Factorial<5>::value << "\n";  // 120 (computed at compile time)
    std::cout << Factorial<10>::value << "\n"; // 3628800
    
    constexpr int result = Factorial<7>::value;  // ✅ Can be used in constant expressions
}
```

Template recursion combined with specialization enables compile-time computations. The compiler evaluates `Factorial<5>::value` during compilation, generating no runtime overhead. This technique forms the basis of template metaprogramming.

#### Example 9: Autonomous Vehicle - Generic Sensor Fusion System with Templates

This comprehensive example demonstrates template fundamentals in an autonomous vehicle sensor fusion context, showing function templates, class templates, specialization, and compile-time optimizations for sensor processing.

```cpp
#include <iostream>
#include <vector>
#include <array>
#include <cmath>
#include <memory>
#include <string>

// ============================================================================
// Part 1: Function Templates for Generic Sensor Data Processing
// ============================================================================

// Function template for averaging sensor readings
template<typename T>
T average(const std::vector<T>& values) {
    if (values.empty()) return T{};  // Value-initialization

    T sum = T{};
    for (const auto& val : values) {
        sum = sum + val;  // Requires operator+
    }
    return sum / static_cast<T>(values.size());  // Requires operator/
}

// Function template overloading for different sensor data types
template<typename T>
void processSensorReading(T value) {
    std::cout << "Generic sensor: " << value << "\n";
}

// Specialized overload for float (high-precision sensors)
template<>
void processSensorReading<float>(float value) {
    std::cout << "High-precision sensor: " << value << " (validated)\n";
}

// Non-template overload (takes precedence for exact int match)
void processSensorReading(int value) {
    std::cout << "Integer sensor (discrete): " << value << "\n";
}

// ============================================================================
// Part 2: Class Template for Generic Circular Buffer (Sensor History)
// ============================================================================

template<typename T, size_t Capacity>
class CircularBuffer {
    std::array<T, Capacity> buffer;  // Fixed-size array
    size_t head{0};
    size_t size{0};

public:
    void push(const T& value) {
        buffer[head] = value;
        head = (head + 1) % Capacity;
        if (size < Capacity) ++size;
    }

    size_t getSize() const { return size; }
    size_t getCapacity() const { return Capacity; }

    T getAverage() const {
        if (size == 0) return T{};
        T sum = T{};
        for (size_t i = 0; i < size; ++i) {
            sum = sum + buffer[i];
        }
        return sum / static_cast<T>(size);
    }

    // Access the most recent N elements
    std::vector<T> getRecent(size_t count) const {
        std::vector<T> result;
        count = (count > size) ? size : count;

        for (size_t i = 0; i < count; ++i) {
            size_t index = (head + Capacity - count + i) % Capacity;
            result.push_back(buffer[index]);
        }
        return result;
    }
};

// ============================================================================
// Part 3: Full Specialization for Specific Sensor Types
// ============================================================================

// Primary template for sensor value validation
template<typename T>
struct SensorValidator {
    static bool isValid(T value, T min, T max) {
        return value >= min && value <= max;
    }

    static void printType() {
        std::cout << "Generic sensor validator\n";
    }
};

// Full specialization for boolean sensors (binary: true/false)
template<>
struct SensorValidator<bool> {
    static bool isValid(bool value, bool, bool) {
        // Boolean sensors are always "valid" (no range check needed)
        return true;
    }

    static void printType() {
        std::cout << "Boolean sensor validator (binary)\n";
    }
};

// ============================================================================
// Part 4: Partial Specialization for Pointer Types
// ============================================================================

// Primary template for sensor data
template<typename T>
struct SensorData {
    T value;
    uint64_t timestamp;

    void print() const {
        std::cout << "Value: " << value << ", Timestamp: " << timestamp << "\n";
    }

    static const char* getCategory() { return "Direct sensor"; }
};

// Partial specialization for pointer types (indirect/reference sensors)
template<typename T>
struct SensorData<T*> {
    T* value;
    uint64_t timestamp;

    void print() const {
        if (value) {
            std::cout << "Value (via pointer): " << *value
                      << ", Timestamp: " << timestamp << "\n";
        } else {
            std::cout << "Null pointer sensor data\n";
        }
    }

    static const char* getCategory() { return "Indirect/Reference sensor"; }
};

// ============================================================================
// Part 5: Non-Type Template Parameters for Compile-Time Sensor Configuration
// ============================================================================

// Sensor fusion with compile-time weights
template<typename T, size_t NumSensors>
class WeightedSensorFusion {
    std::array<T, NumSensors> weights;
    std::array<T, NumSensors> readings;

public:
    WeightedSensorFusion(const std::array<T, NumSensors>& w) : weights(w) {
        // Normalize weights at construction
        T sum = T{};
        for (const auto& weight : weights) {
            sum = sum + weight;
        }
        for (auto& weight : weights) {
            weight = weight / sum;
        }
    }

    void setReadings(const std::array<T, NumSensors>& r) {
        readings = r;
    }

    T getFusedValue() const {
        T result = T{};
        for (size_t i = 0; i < NumSensors; ++i) {
            result = result + (readings[i] * weights[i]);
        }
        return result;
    }

    constexpr size_t getSensorCount() const { return NumSensors; }
};

// ============================================================================
// Part 6: Template Metaprogramming for Compile-Time Sensor Calibration
// ============================================================================

// Compute calibration scale factor at compile time
template<int RawMax, int PhysicalMax>
struct CalibrationScale {
    static constexpr double value =
        static_cast<double>(PhysicalMax) / static_cast<double>(RawMax);
};

// Recursive template for computing power (for polynomial calibration)
template<int Base, unsigned Exp>
struct Power {
    static constexpr int value = Base * Power<Base, Exp - 1>::value;
};

template<int Base>
struct Power<Base, 0> {
    static constexpr int value = 1;
};

// ============================================================================
// Part 7: Default Template Arguments for Common Sensor Configurations
// ============================================================================

template<typename T = double, typename TimestampType = uint64_t, size_t BufferSize = 10>
class GenericSensor {
    CircularBuffer<T, BufferSize> history;
    TimestampType last_update{0};
    std::string sensor_id;

public:
    GenericSensor(const std::string& id) : sensor_id(id) {}

    void addReading(T value, TimestampType timestamp) {
        history.push(value);
        last_update = timestamp;
    }

    T getAverage() const {
        return history.getAverage();
    }

    void printInfo() const {
        std::cout << "Sensor: " << sensor_id
                  << ", Buffer: " << BufferSize
                  << " readings, Last update: " << last_update << "\n";
    }
};

// ============================================================================
// Part 8: Partial Specialization for Multi-Parameter Templates
// ============================================================================

// Primary template for sensor pairs
template<typename T1, typename T2>
struct SensorPair {
    static void printTypes() {
        std::cout << "Generic sensor pair\n";
    }
};

// Partial specialization: both sensors same type
template<typename T>
struct SensorPair<T, T> {
    static void printTypes() {
        std::cout << "Homogeneous sensor pair (same type)\n";
    }
};

// Partial specialization: second sensor is always double
template<typename T>
struct SensorPair<T, double> {
    static void printTypes() {
        std::cout << "Sensor pair (first: varied, second: double)\n";
    }
};

// ============================================================================
// Main: Demonstrating All Template Concepts in AV Context
// ============================================================================

int main() {
    std::cout << "=== Autonomous Vehicle Sensor Fusion: Template Fundamentals ===\n\n";

    // 1. Function template with type deduction
    std::cout << "=== Function Template Type Deduction ===\n";
    std::vector<double> lidar_distances = {10.5, 11.2, 10.8, 11.0};
    std::cout << "LiDAR average distance: " << average(lidar_distances) << " m\n";

    std::vector<int> camera_confidence = {85, 90, 88, 92};
    std::cout << "Camera confidence average: " << average(camera_confidence) << "%\n\n";

    // 2. Function template overloading and specialization
    std::cout << "=== Function Template Overloading ===\n";
    processSensorReading(42);        // Calls non-template (exact match)
    processSensorReading(3.14);      // Calls generic template
    processSensorReading(2.5f);      // Calls specialized template<>
    std::cout << "\n";

    // 3. Class template with non-type parameter
    std::cout << "=== Circular Buffer (Class Template + Non-Type Parameter) ===\n";
    CircularBuffer<double, 5> speedBuffer;
    speedBuffer.push(15.0);
    speedBuffer.push(16.5);
    speedBuffer.push(15.8);
    speedBuffer.push(16.2);
    speedBuffer.push(15.5);
    speedBuffer.push(17.0);  // Overwrites oldest

    std::cout << "Speed buffer capacity: " << speedBuffer.getCapacity() << "\n";
    std::cout << "Speed buffer size: " << speedBuffer.getSize() << "\n";
    std::cout << "Average speed: " << speedBuffer.getAverage() << " m/s\n\n";

    // 4. Full specialization
    std::cout << "=== Full Template Specialization ===\n";
    SensorValidator<double>::printType();
    std::cout << "Temperature valid (20.5°C): "
              << SensorValidator<double>::isValid(20.5, -40.0, 85.0) << "\n";

    SensorValidator<bool>::printType();
    std::cout << "Door sensor valid: "
              << SensorValidator<bool>::isValid(true, false, true) << "\n\n";

    // 5. Partial specialization for pointers
    std::cout << "=== Partial Specialization for Pointers ===\n";
    SensorData<double> directSensor{45.7, 1000000};
    directSensor.print();
    std::cout << "Category: " << SensorData<double>::getCategory() << "\n";

    double temp_value = 22.3;
    SensorData<double*> indirectSensor{&temp_value, 1000100};
    indirectSensor.print();
    std::cout << "Category: " << SensorData<double*>::getCategory() << "\n\n";

    // 6. Weighted sensor fusion with non-type parameter
    std::cout << "=== Weighted Sensor Fusion (Non-Type Parameters) ===\n";
    WeightedSensorFusion<double, 3> fusion({0.5, 0.3, 0.2});  // 3 sensors
    fusion.setReadings({15.0, 15.5, 16.0});  // Speed readings from 3 sources
    std::cout << "Fused speed value: " << fusion.getFusedValue() << " m/s\n";
    std::cout << "Number of sensors: " << fusion.getSensorCount() << "\n\n";

    // 7. Template metaprogramming: compile-time calibration
    std::cout << "=== Template Metaprogramming (Compile-Time Computation) ===\n";
    constexpr double scale = CalibrationScale<4095, 100>::value;
    std::cout << "ADC calibration scale (12-bit -> 100 units): " << scale << "\n";

    constexpr int power_result = Power<2, 10>::value;
    std::cout << "2^10 (computed at compile time): " << power_result << "\n\n";

    // 8. Default template arguments
    std::cout << "=== Default Template Arguments ===\n";
    GenericSensor<> sensor1("LiDAR_Front");           // All defaults
    GenericSensor<float> sensor2("Camera_Front");      // Custom value type
    GenericSensor<int, uint32_t, 20> sensor3("IMU");   // All custom

    sensor1.addReading(12.5, 1000);
    sensor1.addReading(13.0, 1001);
    sensor1.printInfo();
    std::cout << "Average: " << sensor1.getAverage() << "\n\n";

    // 9. Partial specialization with multiple parameters
    std::cout << "=== Partial Specialization (Multiple Parameters) ===\n";
    SensorPair<int, float>::printTypes();     // Generic
    SensorPair<double, double>::printTypes(); // Both same
    SensorPair<int, double>::printTypes();    // Second is double
    std::cout << "\n";

    // 10. Demonstrate template type deduction ambiguity resolution
    std::cout << "=== Explicit Template Arguments (Resolving Ambiguity) ===\n";
    std::vector<double> mixed_data = {10, 11.5, 12};  // Mixed int/double
    // average({10, 11.5, 12});  // Would fail: ambiguous types
    std::cout << "Mixed data average (explicit <double>): "
              << average<double>({10, 11.5, 12}) << "\n";

    std::cout << "\n=== Summary: Template Features Demonstrated ===\n";
    std::cout << "✓ Function templates with automatic type deduction\n";
    std::cout << "✓ Function template specialization and overloading\n";
    std::cout << "✓ Class templates with type and non-type parameters\n";
    std::cout << "✓ Full specialization for specific types\n";
    std::cout << "✓ Partial specialization (pointers, multi-parameter)\n";
    std::cout << "✓ Default template arguments\n";
    std::cout << "✓ Template metaprogramming (compile-time computation)\n";
    std::cout << "✓ Non-type parameters for compile-time configuration\n";

    return 0;
}
```

**Output:**
```
=== Autonomous Vehicle Sensor Fusion: Template Fundamentals ===

=== Function Template Type Deduction ===
LiDAR average distance: 10.875 m
Camera confidence average: 88%

=== Function Template Overloading ===
Integer sensor (discrete): 42
Generic sensor: 3.14
High-precision sensor: 2.5 (validated)

=== Circular Buffer (Class Template + Non-Type Parameter) ===
Speed buffer capacity: 5
Speed buffer size: 5
Average speed: 16.2 m/s

=== Full Template Specialization ===
Generic sensor validator
Temperature valid (20.5°C): 1
Boolean sensor validator (binary)
Door sensor valid: 1

=== Partial Specialization for Pointers ===
Value: 45.7, Timestamp: 1000000
Category: Direct sensor
Value (via pointer): 22.3, Timestamp: 1000100
Category: Indirect/Reference sensor

=== Weighted Sensor Fusion (Non-Type Parameters) ===
Fused speed value: 15.25 m/s
Number of sensors: 3

=== Template Metaprogramming (Compile-Time Computation) ===
ADC calibration scale (12-bit -> 100 units): 0.0244200
2^10 (computed at compile time): 1024

=== Default Template Arguments ===
Sensor: LiDAR_Front, Buffer: 10 readings, Last update: 1001
Average: 12.75

=== Partial Specialization (Multiple Parameters) ===
Generic sensor pair
Homogeneous sensor pair (same type)
Sensor pair (first: varied, second: double)

=== Explicit Template Arguments (Resolving Ambiguity) ===
Mixed data average (explicit <double>): 11.1667

=== Summary: Template Features Demonstrated ===
✓ Function templates with automatic type deduction
✓ Function template specialization and overloading
✓ Class templates with type and non-type parameters
✓ Full specialization for specific types
✓ Partial specialization (pointers, multi-parameter)
✓ Default template arguments
✓ Template metaprogramming (compile-time computation)
✓ Non-type parameters for compile-time configuration
```

**Real-World Applications:**

1. **Generic Sensor Averaging (`average` function template)** - Autonomous vehicles process readings from dozens of sensors (LiDAR distances, radar velocities, IMU accelerations). Generic algorithms eliminate code duplication and work with any numeric type.

2. **Circular Buffer with Compile-Time Size** - Sensor history buffers store recent readings for filtering and trend analysis. Using non-type template parameters (`size_t Capacity`) allows stack allocation with zero overhead—the size is compiled into the type itself. Different sensors can have differently-sized buffers without runtime cost.

3. **Weighted Sensor Fusion** - Autonomous vehicles combine multiple sensor readings with confidence-based weighting. The template approach with compile-time sensor count enables the compiler to fully unroll loops and optimize away all indirection.

4. **Full Specialization for Sensor Validators** - Boolean sensors (door open/closed, brake pressed) need different validation logic than continuous sensors (temperature, speed). Full specialization provides type-specific implementations without runtime overhead.

5. **Partial Specialization for Direct vs. Indirect Sensors** - Some sensors provide values directly, others through shared memory or CAN bus pointers. Partial specialization for pointer types handles both cases with a single template design.

6. **Template Metaprogramming for Calibration** - ADC calibration coefficients and polynomial correction factors can be computed at compile time, eliminating runtime division and producing optimal machine code. In safety-critical automotive systems, compile-time computation reduces runtime errors.

7. **Default Template Arguments** - Most sensors use standard configurations (double precision, 64-bit timestamps, 10-sample buffers). Default arguments reduce boilerplate while allowing customization when needed (e.g., high-frequency IMU might need 100-sample buffer).

**Performance Benefits:**
- **Zero abstraction cost**: All template code resolves at compile time
- **Inlining opportunities**: Generic functions can be fully inlined
- **Type safety**: Compile-time checking prevents sensor type mismatches
- **Code size optimization**: Only instantiated templates generate code
- **Cache efficiency**: Fixed-size buffers allow better memory layout

**Template Design Patterns in Automotive:**
- **Policy-based design**: Sensor fusion strategies as template parameters
- **Type traits**: Detecting sensor capabilities at compile time (e.g., `has_temperature_reading<T>`)
- **Tag dispatch**: Selecting algorithms based on sensor category (continuous vs. discrete)
- **Compile-time computation**: Safety margins, calibration tables, conversion factors

This example demonstrates how templates provide the foundation for zero-overhead, type-safe generic programming essential in modern autonomous vehicle software.

---

### QUICK_REFERENCE: Answer Key and Summary Tables

#### Template Specialization Priority

| Specialization Type | Priority | Pattern Example | Use Case |
|---------------------|----------|-----------------|----------|
| Full Specialization | Highest | `template<> struct S<int, double>` | Exact type match customization |
| Partial Specialization | Medium | `template<typename T> struct S<T, int>` | Pattern-based customization |
| Primary Template | Lowest | `template<typename T, typename U> struct S` | Default implementation |

#### Template Parameter Types

| Parameter Type | Syntax Example | Allowed Values | Instantiation |
|----------------|----------------|----------------|---------------|
| Type Parameter | `typename T` | Any type | `Container<int>` |
| Non-Type Parameter | `int N` | Compile-time constants | `Array<int, 10>` |
| Template Template Parameter | `template<typename> class C` | Template names | `Wrapper<std::vector>` |

#### Function vs Class Template Comparison

| Feature | Function Template | Class Template |
|---------|-------------------|----------------|
| Argument Deduction | ✅ Automatic from call arguments | ❌ Must specify explicitly (pre-C++17) |
| Partial Specialization | ❌ Not allowed | ✅ Allowed |
| Default Arguments in Definition | ❌ Only in declaration | ✅ In definition |
| Overloading | ✅ Can overload with non-templates | N/A (classes don't overload) |

#### Common Template Patterns

| Pattern | Purpose | Example |
|---------|---------|---------|
| Type Traits | Query type properties | `std::is_pointer<T>` |
| SFINAE | Enable/disable templates conditionally | `enable_if<condition, T>` |
| Tag Dispatch | Select algorithm via type tags | `iterator_category` |
| Policy Classes | Inject behavior via template parameters | `Allocator` parameter |
| Template Recursion | Compile-time computation | `Factorial<N>` |
| Currying | Bind some template parameters | Partial specialization |
