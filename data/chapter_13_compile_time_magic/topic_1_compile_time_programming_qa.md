## TOPIC: Compile-Time Programming in C++

### INTERVIEW_QA: Comprehensive Questions

#### Q1: What is the difference between constexpr and const?
**Difficulty:** #beginner
**Category:** #fundamentals #syntax
**Concepts:** #constexpr #const #compile_time #runtime

**Answer:**
`const` means "read-only at runtime" (value set once, then immutable), while `constexpr` means "evaluable at compile time" (value computed during compilation).

**Code example:**
```cpp
const int x = get_runtime_value();    // ✅ const: runtime init
constexpr int y = get_runtime_value(); // ❌ Error: must be compile-time

constexpr int z = 42;                  // ✅ constexpr implies const
const int w = 42;                      // ✅ const (not necessarily constexpr)
```

**Explanation:**
`const` variables can be initialized with runtime values (like function returns), but `constexpr` variables must be initialized with compile-time constant expressions. All `constexpr` variables are implicitly `const`, but not all `const` variables are `constexpr`. `constexpr` functions can be used in constant expressions (like array sizes, template arguments), while regular `const` variables cannot.

**Key takeaway:** Use `constexpr` when you need compile-time constants; use `const` for runtime immutability.

---

#### Q2: Can a constexpr function call a non-constexpr function?
**Difficulty:** #intermediate
**Category:** #constexpr #functions
**Concepts:** #compile_time #runtime_deferral #context_dependent

**Answer:**
Yes, in C++14+, but the `constexpr` function will be evaluated at runtime if called in a runtime context.

**Code example:**
```cpp
int runtime_func(int x) {  // Not constexpr
    return x * 2;
}

constexpr int wrapper(int x) {
    return runtime_func(x);  // ✅ Allowed in C++14+
}

int main() {
    int a = wrapper(5);           // ✅ Evaluated at runtime
    // constexpr int b = wrapper(5); // ❌ Error: calls non-constexpr function
}
```

**Explanation:**
A `constexpr` function doesn't guarantee compile-time evaluation—it means "can be evaluated at compile time *if all inputs are compile-time constants and all called functions are constexpr*". If the function calls non-constexpr functions or receives runtime inputs, it's evaluated at runtime. In the example, `wrapper(5)` runs at runtime because `runtime_func` isn't constexpr, so `wrapper` cannot be evaluated at compile time.

**Key takeaway:** `constexpr` is a permission, not a mandate (except for `consteval`); calling non-constexpr functions forces runtime evaluation.

---

#### Q3: What happens if a static_assert condition fails?
**Difficulty:** #beginner
**Category:** #compile_time #assertions
**Concepts:** #static_assert #compile_error #validation

**Answer:**
Compilation stops with an error message showing the failed assertion and the provided error text.

**Code example:**
```cpp
template<typename T>
class OnlyIntegers {
    static_assert(std::is_integral<T>::value, "T must be an integer type");
    T value;
};

OnlyIntegers<int> valid;     // ✅ Compiles
// OnlyIntegers<float> invalid; // ❌ Error: static assertion failed:
                                //    T must be an integer type
```

**Explanation:**
`static_assert` performs compile-time checks. If the condition evaluates to `false`, the compiler emits an error with the provided message and stops compilation. This is useful for enforcing constraints (type requirements, size limits, configuration validation) that should never be violated. Unlike runtime assertions (`assert`), `static_assert` has zero runtime cost and catches errors before the program runs.

**Key takeaway:** Use `static_assert` to enforce compile-time invariants; failed assertions prevent compilation.

---

#### Q4: How does template instantiation depth limit affect template metaprogramming?
**Difficulty:** #advanced
**Category:** #templates #metaprogramming
**Concepts:** #template_recursion #instantiation_depth #compiler_limits

**Answer:**
Recursive template instantiation can exceed the compiler's default depth limit (usually 512-1024), causing compilation to fail with a "template instantiation depth exceeded" error.

**Code example:**
```cpp
template<int N>
struct Countdown {
    static constexpr int value = Countdown<N-1>::value + 1;
};

template<>
struct Countdown<0> {
    static constexpr int value = 0;
};

constexpr int c10 = Countdown<10>::value;     // ✅ OK
// constexpr int c2000 = Countdown<2000>::value; // ❌ Exceeds limit

// Workaround: Use constexpr function (no instantiation limit)
constexpr int countdown_func(int n) {
    return (n == 0) ? 0 : countdown_func(n-1) + 1;
}

constexpr int c2000 = countdown_func(2000);   // ✅ OK
```

**Explanation:**
Each recursive template instantiation creates a new type (e.g., `Countdown<2000>`, `Countdown<1999>`, ..., `Countdown<0>`), and compilers limit how deep this can go. The limit is configurable (`-ftemplate-depth=N` in GCC/Clang), but excessively deep recursion can cause very slow compilation. `constexpr` functions don't have this limitation because they use regular function recursion at compile time, not type instantiation.

**Key takeaway:** For deep recursion (>100 levels), prefer `constexpr` functions over template metaprogramming to avoid hitting instantiation depth limits.

---

#### Q5: What is the difference between if constexpr and a regular if statement in templates?
**Difficulty:** #intermediate
**Category:** #templates #control_flow
**Concepts:** #if_constexpr #compile_time #branch_elimination

**Answer:**
`if constexpr` performs compile-time branch elimination (discarded branches are never instantiated), while regular `if` instantiates both branches and checks at runtime.

**Code example:**
```cpp
template<typename T>
void process(T value) {
    if (std::is_integral_v<T>) {
        value++;  // ❌ Error for non-integral types (both branches instantiated)
    }
}

template<typename T>
void process_constexpr(T value) {
    if constexpr (std::is_integral_v<T>) {
        value++;  // ✅ OK: only instantiated for integral types
    }
}

process(3.14);          // ❌ Compile error: can't ++ a double
process_constexpr(3.14); // ✅ OK: ++ branch not instantiated
```

**Explanation:**
With regular `if`, the compiler must instantiate both branches for all template instantiations, even if only one branch runs. If a branch contains type-invalid code (like `value++` for a non-integral type), compilation fails. `if constexpr` eliminates discarded branches at compile time, so they're never instantiated. This enables type-dependent code paths that would otherwise be ill-formed.

**Key takeaway:** Use `if constexpr` for type-dependent logic in templates to avoid instantiating invalid code paths.

---

#### Q6: What is the purpose of consteval and how does it differ from constexpr?
**Difficulty:** #intermediate
**Category:** #cpp20 #compile_time
**Concepts:** #consteval #constexpr #immediate_functions #mandatory_evaluation

**Answer:**
`consteval` (C++20) creates immediate functions that **must** be evaluated at compile time, while `constexpr` functions **can** be evaluated at compile time but may run at runtime.

**Code example:**
```cpp
consteval int square_eval(int x) {
    return x * x;
}

constexpr int square_expr(int x) {
    return x * x;
}

int main() {
    constexpr int a = square_eval(5);   // ✅ Compile-time
    constexpr int b = square_expr(5);   // ✅ Compile-time

    int runtime_val = 10;
    // int c = square_eval(runtime_val); // ❌ Error: consteval requires constant
    int d = square_expr(runtime_val);   // ✅ OK: evaluated at runtime
}
```

**Explanation:**
`consteval` enforces compile-time evaluation: it's a compilation error to call a `consteval` function with runtime values. This is useful for configuration validation, embedded systems, and ensuring zero runtime overhead. `constexpr` is more flexible: it runs at compile time when possible, but can fall back to runtime. Use `consteval` when runtime evaluation should be impossible (e.g., safety-critical constant expressions).

**Key takeaway:** `consteval` guarantees compile-time evaluation; `constexpr` allows but doesn't require it.

---

#### Q7: Can constexpr functions have side effects?
**Difficulty:** #intermediate
**Category:** #constexpr #semantics
**Concepts:** #side_effects #pure_functions #compile_time

**Answer:**
No, constexpr functions evaluated at compile time cannot have side effects (I/O, global state modification), but they can have side effects when evaluated at runtime.

**Code example:**
```cpp
int global_counter = 0;

constexpr int increment_counter(int x) {
    // global_counter++;  // ❌ Not allowed in constant expression
    return x + 1;
}

int main() {
    constexpr int a = increment_counter(5);  // ✅ Compile-time (no side effects)
    int b = increment_counter(10);           // ✅ Runtime (side effects possible if uncommented)
}
```

**Explanation:**
Compile-time evaluation requires pure functions: no I/O, no global state mutation, no volatile access. This is enforced by the compiler for constant expressions. However, if a `constexpr` function is called at runtime, it's just a regular function and can have side effects (though this defeats the purpose of `constexpr`). Best practice: keep `constexpr` functions pure even for runtime calls.

**Key takeaway:** `constexpr` functions must be pure for compile-time evaluation; side effects force runtime evaluation.

---

#### Q8: What are type traits and how are they used?
**Difficulty:** #beginner
**Category:** #type_traits #templates
**Concepts:** #compile_time #type_introspection #metaprogramming

**Answer:**
Type traits provide compile-time information about types (e.g., `is_integral`, `is_pointer`, `is_const`), enabling conditional compilation and type-based logic.

**Code example:**
```cpp
#include <type_traits>

template<typename T>
void process(T value) {
    if constexpr (std::is_integral_v<T>) {
        std::cout << "Integer: " << value << "\n";
    } else if constexpr (std::is_floating_point_v<T>) {
        std::cout << "Float: " << value << "\n";
    }
}

static_assert(std::is_same_v<int, int>, "Same type");
static_assert(!std::is_same_v<int, const int>, "Different types (cv-qualifiers matter)");
```

**Explanation:**
Type traits are template classes/variables in `<type_traits>` that query type properties at compile time. They return `bool` values (accessed via `::value` or `_v` suffix in C++17+) or type aliases. Common uses: SFINAE, `if constexpr`, `static_assert`, and template constraints. They enable type-dependent code without runtime overhead.

**Key takeaway:** Type traits provide compile-time type introspection for conditional compilation and validation.

---

#### Q9: How do you write a custom type trait?
**Difficulty:** #advanced
**Category:** #type_traits #metaprogramming
**Concepts:** #template_specialization #compile_time #custom_traits

**Answer:**
Use template specialization and inherit from `std::true_type` or `std::false_type` to create compile-time boolean traits.

**Code example:**
```cpp
#include <type_traits>

// Primary template: default to false
template<typename T>
struct is_sensor_type : std::false_type {};

// Specializations for sensor types
template<>
struct is_sensor_type<LidarPoint> : std::true_type {};

template<>
struct is_sensor_type<RadarReturn> : std::true_type {};

template<>
struct is_sensor_type<CameraFrame> : std::true_type {};

// Helper variable template (C++17)
template<typename T>
inline constexpr bool is_sensor_type_v = is_sensor_type<T>::value;

// Usage
static_assert(is_sensor_type_v<LidarPoint>, "LidarPoint is a sensor type");
static_assert(!is_sensor_type_v<int>, "int is not a sensor type");
```

**Explanation:**
Custom type traits follow the same pattern as standard traits: a primary template (default case) and specializations (specific cases). Inheriting from `std::true_type` (`value = true`) or `std::false_type` (`value = false`) provides the boolean result. The `_v` helper (C++17) simplifies usage. This technique enables compile-time type categorization for generic programming.

**Key takeaway:** Custom type traits use template specialization with `std::true_type`/`std::false_type` to classify types at compile time.

---

#### Q10: What is the difference between std::is_same and typeid?
**Difficulty:** #intermediate
**Category:** #type_traits #rtti
**Concepts:** #compile_time #runtime #type_comparison

**Answer:**
`std::is_same` performs compile-time type comparison, while `typeid` performs runtime type identification (RTTI).

**Code example:**
```cpp
#include <type_traits>
#include <typeinfo>

int main() {
    // Compile-time comparison
    constexpr bool same = std::is_same_v<int, int>;  // true at compile time
    static_assert(std::is_same_v<int, int>, "Types must match");

    // Runtime comparison
    int x = 42;
    if (typeid(x) == typeid(int)) {  // Runtime check
        // ...
    }

    // Key difference:
    // std::is_same: known at compile time, zero runtime cost
    // typeid: evaluated at runtime, has cost (RTTI overhead)
}
```

**Explanation:**
`std::is_same` is a compile-time template that compares types exactly (including cv-qualifiers). It's evaluated during compilation and has zero runtime cost. `typeid` is a runtime operator that returns `std::type_info` objects, requiring RTTI support (can be disabled with `-fno-rtti`). Use `std::is_same` for template metaprogramming and static assertions; use `typeid` for runtime polymorphic type checks.

**Key takeaway:** `std::is_same` is compile-time (zero cost), `typeid` is runtime (RTTI overhead).

---

#### Q11: Why might a constexpr function fail to evaluate at compile time?
**Difficulty:** #intermediate
**Category:** #constexpr #debugging
**Concepts:** #compile_time #runtime_deferral #constant_expressions

**Answer:**
A `constexpr` function evaluates at runtime if: (1) inputs are not compile-time constants, (2) it calls non-constexpr functions, or (3) it performs operations not allowed in constant expressions.

**Code example:**
```cpp
constexpr int add(int a, int b) {
    return a + b;
}

int get_runtime_value() { return 42; }

int main() {
    constexpr int x = add(5, 10);       // ✅ Compile-time

    int runtime_val = get_runtime_value();
    int y = add(runtime_val, 10);       // ❌ Runtime (input not constant)

    // Force compile-time:
    // constexpr int z = add(runtime_val, 10);  // ❌ Compile error
}
```

**Explanation:**
`constexpr` is a permission, not a guarantee. For compile-time evaluation, all inputs must be constant expressions and all operations must be valid in constant contexts (no I/O, no reinterpret_cast, etc.). If any condition fails, the function runs at runtime. To force compile-time evaluation, assign to a `constexpr` variable or use in a context requiring constants (array size, template argument).

**Key takeaway:** `constexpr` functions evaluate at compile time only when all inputs and operations allow it; otherwise they run at runtime.

---

#### Q12: What is the purpose of std::integral_constant?
**Difficulty:** #advanced
**Category:** #type_traits #metaprogramming
**Concepts:** #integral_constant #compile_time #value_wrapping

**Answer:**
`std::integral_constant` wraps a compile-time constant value as a type, enabling type-based metaprogramming and value passing through template parameters.

**Code example:**
```cpp
#include <type_traits>

// std::integral_constant wraps a value as a type
using five = std::integral_constant<int, 5>;
using ten = std::integral_constant<int, 10>;

std::cout << five::value;     // 5
std::cout << five{}();        // 5 (operator() returns value)

// Common usage: true_type and false_type
static_assert(std::is_same_v<std::true_type, std::integral_constant<bool, true>>);
static_assert(std::is_same_v<std::false_type, std::integral_constant<bool, false>>);

// Custom: Fibonacci as types
template<int N>
struct Fib : std::integral_constant<int, Fib<N-1>{} + Fib<N-2>{}> {};

template<> struct Fib<0> : std::integral_constant<int, 0> {};
template<> struct Fib<1> : std::integral_constant<int, 1> {};

std::cout << Fib<10>::value;  // 55
```

**Explanation:**
`std::integral_constant` is a template class that stores a compile-time constant value as a type member (`value`) and provides a call operator to retrieve it. This enables passing values through type parameters rather than function parameters. `std::true_type` and `std::false_type` are specializations for `bool`. It's fundamental to type traits and metaprogramming, allowing algorithms to operate on types that encode values.

**Key takeaway:** `std::integral_constant` turns compile-time values into types, enabling value-based template metaprogramming.

---

#### Q13: Can you use constexpr with constructors? What does it enable?
**Difficulty:** #intermediate
**Category:** #constexpr #classes
**Concepts:** #constexpr_constructor #compile_time #literal_types

**Answer:**
Yes, `constexpr` constructors enable compile-time construction of class objects, making the class a literal type usable in constant expressions.

**Code example:**
```cpp
struct Point {
    float x, y;

    constexpr Point(float x, float y) : x(x), y(y) {}

    constexpr float distance() const {
        return std::sqrt(x*x + y*y);  // Requires constexpr sqrt (C++26)
    }
};

constexpr Point origin(0, 0);
constexpr Point p1(3, 4);

// Can use in constant expressions
constexpr float arr[int(origin.x) + 5] = {};  // Array size from constexpr object
static_assert(p1.x == 3.0f, "X coordinate check");
```

**Explanation:**
A `constexpr` constructor allows objects to be created at compile time if all initialization is from constant expressions. This makes the class a "literal type", usable in contexts requiring compile-time constants. Member functions can also be `constexpr`, enabling compile-time method calls. This is powerful for configuration objects, mathematical types (points, vectors, matrices), and embedded systems where compile-time initialization is critical.

**Key takeaway:** `constexpr` constructors enable compile-time object creation, making classes usable in constant expressions.

---

#### Q14: What is SFINAE and how does it relate to type traits?
**Difficulty:** #advanced
**Category:** #templates #metaprogramming
**Concepts:** #sfinae #enable_if #type_traits #template_substitution

**Answer:**
SFINAE (Substitution Failure Is Not An Error) allows template overload resolution to silently discard invalid candidates instead of erroring. Type traits enable SFINAE-based function selection.

**Code example:**
```cpp
#include <type_traits>

// Overload 1: Only for integral types
template<typename T>
std::enable_if_t<std::is_integral_v<T>, void>
process(T value) {
    std::cout << "Integer: " << value << "\n";
}

// Overload 2: Only for floating-point types
template<typename T>
std::enable_if_t<std::is_floating_point_v<T>, void>
process(T value) {
    std::cout << "Float: " << value << "\n";
}

process(42);     // Calls overload 1
process(3.14);   // Calls overload 2
// process(std::string("hi"));  // ❌ No matching overload
```

**Explanation:**
SFINAE says that if template substitution (replacing `T` with actual type) results in invalid code, that template candidate is silently removed from overload resolution (rather than causing an error). `std::enable_if` exploits this: if the condition is false, it doesn't define a `type` alias, causing substitution failure. Type traits provide the conditions. This enables type-based function overloading without `if constexpr`.

**Key takeaway:** SFINAE + type traits enable compile-time function selection based on type properties.

---

#### Q15: How do you prevent template instantiation depth issues?
**Difficulty:** #advanced
**Category:** #templates #performance
**Concepts:** #instantiation_depth #recursion_limits #constexpr_alternative

**Answer:**
Use `constexpr` functions instead of template recursion, increase compiler depth limits, or use iterative algorithms.

**Code example:**
```cpp
// ❌ Template recursion (hits depth limit for large N)
template<int N>
struct Factorial {
    static constexpr int value = N * Factorial<N-1>::value;
};

template<> struct Factorial<0> { static constexpr int value = 1; };

// ✅ constexpr function (no depth limit)
constexpr int factorial(int n) {
    return (n <= 1) ? 1 : n * factorial(n - 1);
}

// ✅ Even better: iterative
constexpr int factorial_iter(int n) {
    int result = 1;
    for (int i = 2; i <= n; ++i) result *= i;
    return result;
}

// Usage:
constexpr int f2000_template = Factorial<2000>::value;  // ❌ Depth exceeded
constexpr int f2000_func = factorial(2000);            // ✅ OK (but stack limit)
constexpr int f2000_iter = factorial_iter(2000);       // ✅ OK (no recursion)
```

**Explanation:**
Template metaprogramming recursion is limited by compiler instantiation depth (~512-1024 by default). Solutions: (1) Use `constexpr` functions (C++14+) which have higher stack limits, (2) Increase limit with `-ftemplate-depth=N`, (3) Use iterative algorithms instead of recursion. For most use cases, `constexpr` functions are superior: no depth limits, faster compilation, easier to read.

**Key takeaway:** Prefer `constexpr` functions over template recursion for deep computations to avoid instantiation depth limits.

---

#### Q16: What is constinit and when would you use it?
**Difficulty:** #intermediate
**Category:** #cpp20 #initialization
**Concepts:** #constinit #static_initialization #compile_time #thread_safety

**Answer:**
`constinit` (C++20) guarantees static/thread_local variables are initialized at compile time, preventing the static initialization order fiasco.

**Code example:**
```cpp
// ❌ Potential initialization order problem
int get_default() { return 42; }
const int x = get_default();  // Runtime init (order undefined across TUs)

// ✅ constinit: guaranteed compile-time initialization
constinit const int y = 42;   // Must be constant expression

// ✅ Mutable constinit variable (init at compile time, modify at runtime)
constinit int counter = 0;
counter++;  // OK: mutable

// ❌ Error: not a constant expression
// constinit int z = get_default();  // Compile error
```

**Explanation:**
`constinit` enforces that static/thread_local variables are initialized with constant expressions, avoiding runtime initialization (which can cause order-dependent bugs across translation units). Unlike `constexpr`, `constinit` variables can be mutable (modified at runtime). This is critical for globals in embedded systems or multi-threaded code where initialization order matters.

**Key takeaway:** Use `constinit` for static/thread_local variables to guarantee compile-time initialization and avoid order fiascos.

---

#### Q17: How does template argument deduction work with constexpr?
**Difficulty:** #advanced
**Category:** #templates #constexpr
**Concepts:** #template_deduction #auto #compile_time #type_inference

**Answer:**
Template arguments can be deduced from `constexpr` values, and `auto` can deduce `constexpr`-ness from the initializer.

**Code example:**
```cpp
template<auto Value>
struct Wrapper {
    static constexpr auto value = Value;
};

constexpr int x = 42;
Wrapper<x> w1;               // Deduces Wrapper<42>
Wrapper<100> w2;             // Explicit: Wrapper<100>

// auto deduction preserves constexpr
constexpr int y = 10;
auto a = y;                  // int a (not constexpr, copy of y)
constexpr auto b = y;        // constexpr int b = 10
const auto c = y;            // const int c = 10

// Template deduction with constexpr functions
template<typename T>
constexpr T add(T a, T b) { return a + b; }

constexpr auto result = add(5, 10);  // Deduces T=int, result is constexpr
```

**Explanation:**
C++17's `auto` template parameters allow deducing values (not just types). `constexpr` values can be used as template arguments, enabling value-parameterized types. `auto` in variable declarations doesn't preserve `constexpr`-ness unless explicitly marked `constexpr auto`. Template deduction works seamlessly with `constexpr` functions: if the result is assigned to a `constexpr` variable, it's evaluated at compile time.

**Key takeaway:** Use `constexpr auto` to preserve compile-time evaluation in deduced variables; `auto` template parameters enable value-based templates.

---

#### Q18: What are the limitations of C++11 constexpr functions?
**Difficulty:** #beginner
**Category:** #cpp11 #constexpr
**Concepts:** #compile_time #constexpr_restrictions #evolution

**Answer:**
C++11 `constexpr` functions can only have a single return statement, no loops, no local variables, and no mutable operations.

**Code example:**
```cpp
// ✅ C++11: Single return statement
constexpr int square(int x) {
    return x * x;
}

// ❌ C++11: Multiple statements (OK in C++14+)
constexpr int sum(int n) {
    int total = 0;  // ❌ C++11: local variable
    for (int i = 1; i <= n; ++i) {  // ❌ C++11: loop
        total += i;
    }
    return total;
}

// ✅ C++11: Workaround using recursion
constexpr int sum_c11(int n) {
    return (n <= 1) ? n : n + sum_c11(n - 1);
}
```

**Explanation:**
C++11's initial `constexpr` design was extremely restrictive: only a single `return` statement with a conditional expression (ternary operator `?:`). No loops, no mutable variables, no multiple statements. This forced recursive implementations for anything complex. C++14 relaxed these restrictions dramatically, allowing imperative-style code. C++11 code must use recursion and conditional expressions.

**Key takeaway:** C++11 `constexpr` functions are limited to single-expression recursions; C++14+ allows loops and local variables.

---

#### Q19: How do you debug constexpr functions that fail at compile time?
**Difficulty:** #intermediate
**Category:** #debugging #constexpr
**Concepts:** #compile_time #error_messages #debugging_techniques

**Answer:**
Use compiler errors to identify which operations aren't allowed in constant expressions, test with runtime calls first, and use `static_assert` to check intermediate values.

**Code example:**
```cpp
constexpr int buggy_func(int x) {
    int result = 0;
    // BUG: Forgot to return
    result = x * 2;
    // return result;  // ❌ Missing return
}

// Debugging technique 1: Test at runtime first
void test_runtime() {
    int val = buggy_func(5);  // May give warning about missing return
}

// Debugging technique 2: Use static_assert for intermediate checks
constexpr int debug_func(int x) {
    constexpr int step1 = x * 2;
    static_assert(step1 == 10, "Step 1 failed");  // Validate intermediate value
    return step1 + 5;
}

// Debugging technique 3: Check compilability in stages
constexpr int stage1(int x) { return x * 2; }
constexpr int stage2(int x) { return stage1(x) + 5; }
```

**Explanation:**
Compile-time errors can be cryptic. Debug strategies: (1) Test as a regular function first to catch logic errors, (2) Use `static_assert` to validate intermediate results, (3) Break complex functions into smaller `constexpr` functions, (4) Read compiler errors carefully—they often indicate which operation isn't allowed in constant expressions (e.g., "call to non-constexpr function"). Modern compilers (GCC 9+, Clang 10+) have improved `constexpr` error messages significantly.

**Key takeaway:** Debug `constexpr` functions by testing at runtime first, using `static_assert` for validation, and breaking into smaller functions.

---

#### Q20: What is the performance impact of using constexpr?
**Difficulty:** #intermediate
**Category:** #performance #optimization
**Concepts:** #compile_time #runtime_overhead #binary_size

**Answer:**
Compile-time evaluation has **zero** runtime overhead (result baked into binary), but may increase compilation time and binary size.

**Code example:**
```cpp
// Compile-time: zero runtime cost
constexpr int factorial(int n) {
    return (n <= 1) ? 1 : n * factorial(n - 1);
}

constexpr int fact10 = factorial(10);  // Computed at compile time
// Disassembly: just loads immediate value (mov eax, 3628800)

// Runtime: function call overhead
int runtime_fact(int n) {
    return (n <= 1) ? 1 : n * runtime_fact(n - 1);
}

int fact10_rt = runtime_fact(10);  // Recursive calls at runtime
// Disassembly: call instructions, stack setup, etc.
```

**Explanation:**
When a `constexpr` function is evaluated at compile time, the result is a literal constant in the binary—no runtime computation, no function call overhead. This is ideal for hot paths in real-time systems. However, tradeoffs: (1) longer compilation (compiler does more work), (2) larger binaries if many different constant expressions are used (each gets a unique value), (3) less flexibility (values fixed at compile time). Use `constexpr` for frequently-used constants and performance-critical calculations.

**Key takeaway:** Compile-time evaluation has zero runtime cost but increases compilation time; use for hot-path constants.

---
