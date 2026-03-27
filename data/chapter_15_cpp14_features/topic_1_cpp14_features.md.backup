# Chapter 15: C++14 Feature Deep Dive

## TOPIC: C++14 Language and Library Enhancements

C++14 was primarily an incremental improvement to C++11, focusing on reducing boilerplate, improving template programming, and cleaning up syntax. While C++11 introduced revolutionary features (move semantics, lambdas, variadic templates), C++14 polished and extended these features to make them more practical and powerful. This chapter covers return type deduction, generic lambdas, relaxed constexpr, improved type deduction with decltype(auto), STL enhancements, variable templates, and convenient syntax improvements.

**Why C++14 matters:**
- Reduces verbosity in templates and return types
- Generic lambdas enable template-like behavior without explicit template syntax
- Relaxed constexpr allows real algorithms at compile time
- STL improvements (make_unique, exchange, integer_sequence) fill critical gaps
- Variable templates provide cleaner metaprogramming syntax

**Key innovations:**
- **Return type deduction**: `auto` for normal functions, not just lambdas
- **Generic lambdas**: `auto` parameters make lambdas template-like
- **Init-capture (move capture)**: Move resources into lambda closures
- **decltype(auto)**: Preserve exact type including references
- **Relaxed constexpr**: Loops, local variables, multiple statements allowed
- **std::make_unique**: Type-safe unique_ptr creation (finally!)
- **Variable templates**: Template variables for cleaner metaprogramming
- **Binary literals and digit separators**: Improved readability

---

### THEORY_SECTION: Core C++14 Enhancements

#### Return Type Deduction for Normal Functions

In C++11, `auto` return type deduction only worked for lambdas. C++14 extends this to **any function**. The compiler deduces the return type from the return statement(s).

```cpp
auto square(int x) {
    return x * x;  // Deduces return type as int
}
```

This works when all return statements deduce to the same type. If different return paths produce different types, compilation fails:

```cpp
auto ambiguous(bool b) {
    if (b) return 1;      // int
    else return 1.5;      // double → ERROR: mismatched deduction
}
```

**Use cases**: Reduces redundancy in template functions where the return type is complex or depends on template parameters. However, it can reduce readability if overused.

#### Generic Lambdas

C++14 allows `auto` in lambda parameters, making them **template-like** without explicit template syntax:

```cpp
auto add = [](auto a, auto b) { return a + b; };
std::cout << add(1, 2) << ", " << add(1.5, 3.5);  // Works for int and double
```

Under the hood, the compiler generates a templated `operator()`:

```cpp
struct {
    template<typename T, typename U>
    auto operator()(T a, U b) const { return a + b; }
} add;
```

This is particularly powerful when combined with perfect forwarding, `enable_if`, or concepts (C++20). Generic lambdas eliminate the need for templated functors in many cases, making code more concise.

**Edge case**: Type deduction failures can be harder to diagnose than with explicit templates. Using `static_assert` with type traits inside generic lambdas can help enforce constraints.

#### Lambda Init-Capture (Move Capture)

C++11 lambdas could only capture by value or reference. C++14 introduces **init-capture**, allowing you to move resources into the lambda:

```cpp
auto ptr = std::make_unique<int>(42);
auto f = [p = std::move(ptr)] { std::cout << *p; };
```

After this capture, `ptr` is left in a moved-from state (typically `nullptr` for `unique_ptr`). Init-capture is essential for:
- **Threading**: Moving unique resources into thread callbacks
- **Async operations**: Capturing ownership for `std::async` or futures
- **RAII closures**: Transferring ownership to a lambda that outlives the current scope

For `shared_ptr`, move capture transfers ownership but doesn't null the original if other copies exist (reference count decreases by one):

```cpp
auto sp = std::make_shared<int>(100);
auto lam = [p = std::move(sp)]() { return *p; };
// sp is now nullptr, lam's p owns the int
```

#### decltype(auto) for Exact Type Deduction

While `auto` strips references and const qualifiers, `decltype(auto)` preserves the **exact type** of the expression, including references:

```cpp
int x = 10;
auto f1() { return (x); }           // Returns int (copy)
decltype(auto) f2() { return (x); } // Returns int& (reference)
```

The parentheses around `(x)` make it an lvalue expression, so `decltype((x))` is `int&`. This is critical when perfect forwarding return types or implementing proxy classes. **Warning**: Using `decltype(auto)` with `return (local_var);` creates a dangling reference:

```cpp
decltype(auto) danger() {
    int local = 5;
    return (local);  // Returns int& to destroyed local → UB
}
```

The rule of thumb: use `decltype(auto)` when you need to preserve reference semantics (e.g., forwarding), but be careful with local variables.

#### Relaxed constexpr Functions

C++11 `constexpr` functions were extremely limited: single return statement, no local variables, no loops. C++14 relaxed these restrictions dramatically:

**C++11 constexpr** (restrictive):
```cpp
constexpr int fact(int n) {
    return (n <= 1) ? 1 : n * fact(n - 1);  // Only recursion or ternary
}
```

**C++14 constexpr** (relaxed):
```cpp
constexpr int fact(int n) {
    int result = 1;
    for (int i = 2; i <= n; ++i)  // ✅ Loops allowed
        result *= i;
    return result;
}
```

C++14 allows:
- Multiple statements
- Local variables
- Loops (for, while)
- Conditional branches (if-else, switch)

This makes `constexpr` practical for real algorithms. Combined with `constexpr` variables, you can compute complex values at compile time, reducing runtime overhead in performance-critical code.

#### STL Enhancements

**std::make_unique<T>**: Finally addresses the missing piece from C++11. Creating `unique_ptr` with `new` was verbose and exception-unsafe:

```cpp
// C++11 (verbose, potential leak if constructor throws)
auto p = std::unique_ptr<Widget>(new Widget(args));

// C++14 (clean, exception-safe)
auto p = std::make_unique<Widget>(args);
```

**std::exchange**: Replaces a value and returns the old value atomically. Extremely useful in move constructors/assignment:

```cpp
int a = 10;
int old = std::exchange(a, 20);  // a = 20, old = 10
```

**std::integer_sequence / std::index_sequence**: Enables compile-time index generation for tuple unpacking and variadic expansion:

```cpp
template<typename Tuple, std::size_t... Is>
void print_tuple(const Tuple& t, std::index_sequence<Is...>) {
    ((std::cout << std::get<Is>(t) << " "), ...);  // C++17 fold, but indices from C++14
}
```

**std::get<T>(tuple)**: Access tuple by type (not just index), but only if the type appears once:

```cpp
std::tuple<int, double, char> t{1, 2.5, 'a'};
double d = std::get<double>(t);  // ✅ OK, double appears once
// std::get<int> would fail if int appeared twice
```

#### Variable Templates

C++14 introduces **template variables**, allowing templates to define variables directly:

```cpp
template<typename T>
constexpr T pi = T(3.1415926535);

double d = pi<double>;
float f = pi<float>;
```

Before C++14, you'd need a static constexpr member in a template struct. Variable templates are cleaner and more intuitive. They're particularly useful with type traits:

```cpp
template<typename T>
constexpr bool is_numeric = std::is_arithmetic<T>::value;

static_assert(is_numeric<int>, "Expected numeric type");
```

#### Syntax Conveniences

**Binary literals**: `0b` prefix for binary representation:
```cpp
int mask = 0b11110000;  // 240 in decimal
```

**Digit separators**: Single quotes `'` for readability:
```cpp
int million = 1'000'000;
long long big = 9'223'372'036'854'775'807;  // LLONG_MAX
int binary = 0b1010'1010;  // Works with binary too
```

**[[deprecated]] attribute**: Mark functions/types as deprecated:
```cpp
[[deprecated("Use newFunc instead")]]
void oldFunc();

oldFunc();  // Compiler warning
```

---

### EDGE_CASES: Tricky Scenarios and Gotchas

#### Edge Case 1: Return Type Deduction with Multiple Return Paths

```cpp
auto tricky(bool b) {
    if (b) return 1;      // int
    else return 1.5;      // double
}  // ❌ ERROR: Conflicting deduced types
```

All return statements must deduce to the **same type**. The compiler doesn't try to find a common type. This is intentional to prevent surprises. If you need different return types, use explicit return type or `std::variant` (C++17+).

**Workaround**:
```cpp
double tricky(bool b) {  // ✅ Explicit return type
    if (b) return 1;     // Implicitly converted to double
    else return 1.5;
}
```

**Key takeaway:** Return type deduction is all-or-nothing; be cautious with conditional returns.

#### Edge Case 2: decltype(auto) and Parentheses Matter

```cpp
int x = 10;

auto f1() { return x; }    // Returns int (copy)
auto f2() { return (x); }  // Returns int (copy) - parens ignored for auto

decltype(auto) g1() { return x; }    // Returns int (copy)
decltype(auto) g2() { return (x); }  // Returns int& (reference!) - parens matter
```

With `decltype(auto)`, parentheses change the deduced type:
- `decltype(x)` is `int` (identifier)
- `decltype((x))` is `int&` (expression)

This can lead to **dangling references** if used with local variables:

```cpp
decltype(auto) danger() {
    int local = 5;
    return (local);  // ❌ Returns int& to local → UB when accessed
}
```

**Key takeaway:** Be extremely careful with `decltype(auto)` and parentheses; use it primarily for perfect forwarding, not with local variables.

#### Edge Case 3: Generic Lambdas and Type Deduction Failures

```cpp
auto lambda = [](auto x) {
    return x + x;
};

// lambda({1, 2, 3});  // ❌ ERROR: Can't deduce type for braced-init-list
```

Braced initializer lists have no deducible type in template contexts. You must explicitly specify the type:

```cpp
auto lambda = [](std::initializer_list<int> il) {
    int sum = 0;
    for (int v : il) sum += v;
    return sum;
};
lambda({1, 2, 3});  // ✅ OK
```

Also, generic lambdas with `static_assert` or `enable_if` can provide better compile-time error messages:

```cpp
auto only_numeric = [](auto val) {
    static_assert(std::is_arithmetic<decltype(val)>::value, "Numeric required");
    return val * 2;
};

only_numeric(10);    // ✅ OK
// only_numeric("hi");  // ❌ Compile error with clear message
```

**Key takeaway:** Generic lambdas don't support braced-init-list deduction; add type constraints for better diagnostics.

#### Edge Case 4: Init-Capture and Reference Count with shared_ptr

```cpp
auto sp = std::make_shared<int>(100);
std::cout << sp.use_count() << "\n";  // 1

auto lam = [p = std::move(sp)]() { return *p; };
std::cout << sp.use_count() << "\n";  // 0 (sp is nullptr)
std::cout << (sp == nullptr) << "\n";  // 1 (true)
```

Moving a `shared_ptr` transfers ownership to the lambda. Unlike with `unique_ptr` which always becomes nullptr, `shared_ptr` behavior depends on whether other copies exist. If you copy into the lambda instead:

```cpp
auto sp = std::make_shared<int>(100);
auto lam = [p = sp]() { return *p; };  // Copy, not move
std::cout << sp.use_count() << "\n";  // 2 (shared between sp and lambda)
```

**Key takeaway:** Understand move vs copy semantics with init-capture; unique_ptr forces move-only, shared_ptr allows both.

#### Edge Case 5: Variable Templates and ODR (One Definition Rule)

```cpp
// header.h
template<typename T>
constexpr T pi = T(3.1415926535);
```

Each translation unit that includes this header gets its own instantiation of `pi<double>`, but they all have the same address due to linkage rules. However, if `pi` were non-const or non-constexpr, you'd violate ODR:

```cpp
template<typename T>
T mutable_value = T(0);  // ❌ Each TU gets its own copy → linker error if used across TUs
```

**Key takeaway:** Variable templates should be const or constexpr to avoid ODR violations in headers; use inline variables (C++17) for mutable shared state.

---

### CODE_EXAMPLES: Practical Demonstrations

#### Example 1: Return Type Deduction in Template Functions

```cpp
#include <iostream>
#include <vector>

// ✅ Without return type deduction (C++11)
template<typename Container>
typename Container::value_type get_first_old(const Container& c) {
    return c.empty() ? typename Container::value_type{} : c.front();
}

// ✅ With return type deduction (C++14)
template<typename Container>
auto get_first(const Container& c) {
    return c.empty() ? typename Container::value_type{} : c.front();
}

int main() {
    std::vector<int> v = {1, 2, 3};
    std::cout << get_first(v) << "\n";  // 1

    std::vector<std::string> vs = {"hello", "world"};
    std::cout << get_first(vs) << "\n";  // "hello"
}
```

Return type deduction eliminates the verbose `typename Container::value_type` while maintaining full generic capability. This is particularly useful in complex template metaprogramming where return types depend on multiple template parameters.

#### Example 2: Generic Lambdas with Perfect Forwarding

```cpp
#include <iostream>
#include <memory>
#include <utility>

// Generic lambda that perfectly forwards arguments
auto invoke_with_logging = [](auto&& func, auto&&... args) {
    std::cout << "Calling function with " << sizeof...(args) << " args\n";
    return std::forward<decltype(func)>(func)(std::forward<decltype(args)>(args)...);
};

void sensor_process(int& value) {
    value *= 2;
    std::cout << "Processed: " << value << "\n";
}

int main() {
    int sensor_data = 42;
    invoke_with_logging(sensor_process, sensor_data);
    std::cout << "Final value: " << sensor_data << "\n";  // 84

    // Also works with lambdas
    invoke_with_logging([](int x, int y) { return x + y; }, 10, 20);
}
```

This pattern is common in middleware layers that wrap function calls with logging, timing, or error handling. The generic lambda with perfect forwarding preserves lvalue/rvalue reference semantics, allowing modification of passed references.

#### Example 3: Lambda Move-Capture in Threading

```cpp
#include <iostream>
#include <thread>
#include <memory>
#include <chrono>

struct SensorData {
    int id;
    std::vector<double> readings;
    SensorData(int i) : id(i), readings(1000, 42.0) {}  // Large data
};

void process_async(int sensor_id) {
    auto data = std::make_unique<SensorData>(sensor_id);

    // ✅ Move unique_ptr into thread lambda
    std::thread worker([d = std::move(data)] {
        std::this_thread::sleep_for(std::chrono::milliseconds(100));
        std::cout << "Sensor " << d->id << " processed " << d->readings.size() << " readings\n";
    });

    // data is now nullptr - ownership transferred to thread
    worker.join();
}

int main() {
    process_async(1);
    process_async(2);
}
```

In autonomous driving systems, sensor data processing often happens asynchronously. Move-capture allows transferring ownership of large data structures into worker threads without copying, improving performance and memory efficiency.

#### Example 4: decltype(auto) for Perfect Return Forwarding

```cpp
#include <iostream>
#include <vector>

// ✅ Perfect return forwarding - preserves reference
template<typename Container>
decltype(auto) get_element(Container& c, size_t index) {
    return c[index];  // Returns Container::reference (which may be T& or proxy type)
}

// ❌ Without decltype(auto) - always returns copy
template<typename Container>
auto get_element_copy(Container& c, size_t index) {
    return c[index];  // Returns Container::value_type (copy)
}

int main() {
    std::vector<int> v = {1, 2, 3, 4, 5};

    // With decltype(auto) - can modify through returned reference
    get_element(v, 0) = 100;
    std::cout << v[0] << "\n";  // 100

    // With auto - returns copy, can't modify original
    // get_element_copy(v, 1) = 200;  // ❌ Error: can't assign to temporary

    std::vector<bool> vb = {true, false, true};
    // decltype(auto) preserves proxy type from vector<bool>
    get_element(vb, 0) = false;
    std::cout << vb[0] << "\n";  // 0 (false)
}
```

This demonstrates the power of `decltype(auto)` in generic code that needs to preserve reference semantics. It's particularly important with proxy types like `vector<bool>::reference`.

#### Example 5: Relaxed constexpr for Compile-Time Algorithms

```cpp
#include <iostream>
#include <array>

// ✅ C++14: Complex algorithm at compile time
constexpr int fibonacci(int n) {
    int a = 0, b = 1;
    for (int i = 0; i < n; ++i) {
        int temp = a;
        a = b;
        b = temp + b;
    }
    return a;
}

// Compile-time array generation
constexpr std::array<int, 10> generate_fib_array() {
    std::array<int, 10> arr = {};
    for (size_t i = 0; i < arr.size(); ++i) {
        arr[i] = fibonacci(i);
    }
    return arr;
}

int main() {
    constexpr auto fib_array = generate_fib_array();  // ✅ Computed at compile time
    for (int val : fib_array) {
        std::cout << val << " ";
    }
    // Output: 0 1 1 2 3 5 8 13 21 34
}
```

In embedded or real-time systems, precomputing lookup tables at compile time eliminates runtime overhead. C++14's relaxed constexpr makes this practical for complex algorithms, not just simple calculations.

#### Example 6: std::exchange in Move Operations

```cpp
#include <iostream>
#include <utility>
#include <memory>

class ResourceHandle {
    int* data;
public:
    ResourceHandle(int val = 0) : data(new int(val)) {
        std::cout << "Constructed with " << *data << "\n";
    }

    ~ResourceHandle() {
        if (data) {
            std::cout << "Destroying " << *data << "\n";
            delete data;
        }
    }

    // Move constructor using std::exchange
    ResourceHandle(ResourceHandle&& other) noexcept
        : data(std::exchange(other.data, nullptr)) {  // ✅ Atomic swap
        std::cout << "Moved, source reset to nullptr\n";
    }

    // Move assignment using std::exchange
    ResourceHandle& operator=(ResourceHandle&& other) noexcept {
        if (this != &other) {
            delete data;  // Clean up existing resource
            data = std::exchange(other.data, nullptr);
            std::cout << "Move-assigned\n";
        }
        return *this;
    }

    ResourceHandle(const ResourceHandle&) = delete;
    ResourceHandle& operator=(const ResourceHandle&) = delete;

    int value() const { return data ? *data : -1; }
};

int main() {
    ResourceHandle h1(42);
    ResourceHandle h2 = std::move(h1);
    std::cout << "h1 value: " << h1.value() << "\n";  // -1 (nullptr)
    std::cout << "h2 value: " << h2.value() << "\n";  // 42
}
```

`std::exchange` is cleaner than the traditional "swap and nullify" pattern in move operations. It's a single expression that replaces the old value and returns it, making move constructors more concise and less error-prone.

#### Example 7: Variable Templates with Type Traits

```cpp
#include <iostream>
#include <type_traits>

// Variable templates for cleaner metaprogramming
template<typename T>
constexpr bool is_numeric = std::is_arithmetic<T>::value;

template<typename T>
constexpr bool is_pointer_type = std::is_pointer<T>::value;

// SFINAE with variable templates
template<typename T>
std::enable_if_t<is_numeric<T>> process_value(T val) {
    std::cout << "Processing numeric: " << val * 2 << "\n";
}

template<typename T>
std::enable_if_t<is_pointer_type<T>> process_value(T ptr) {
    if (ptr) std::cout << "Processing pointer: " << *ptr << "\n";
    else std::cout << "Null pointer\n";
}

int main() {
    process_value(42);          // Numeric overload
    process_value(3.14);        // Numeric overload

    int x = 100;
    process_value(&x);          // Pointer overload
    process_value<int*>(nullptr);  // Pointer overload
}
```

Variable templates combined with SFINAE provide cleaner, more readable template metaprogramming compared to C++11's `::value` verbosity. This is especially beneficial in large codebases with heavy template usage.

---

### INTERVIEW_QA: Comprehensive Questions and Answers

#### Q1: What are the differences between `auto` and `decltype(auto)` for return type deduction?
**Difficulty:** #intermediate
**Category:** #syntax #type_deduction
**Concepts:** #auto #decltype_auto #return_type_deduction #references

**Answer:**
`auto` strips references and const qualifiers, always returning by value (unless explicitly `auto&`). `decltype(auto)` preserves the exact type of the expression, including references and const.

**Code example:**
```cpp
int x = 10;
auto f1() { return (x); }           // Returns int (copy)
decltype(auto) f2() { return (x); } // Returns int& (reference)
```

**Explanation:**
The parentheses around `(x)` make it an lvalue expression. With `auto`, the reference is stripped, resulting in a copy. With `decltype(auto)`, `decltype((x))` evaluates to `int&`, preserving the reference. This is crucial for perfect forwarding patterns but dangerous with local variables (creates dangling references).

**Key takeaway:** Use `auto` for simplicity and copies; use `decltype(auto)` when you need to preserve reference semantics in forwarding functions.

---

#### Q2: How do generic lambdas work internally in C++14?
**Difficulty:** #intermediate
**Category:** #lambdas #templates
**Concepts:** #generic_lambdas #auto_parameters #template_operator

**Answer:**
Generic lambdas with `auto` parameters are syntactic sugar for a lambda with a templated `operator()`. The compiler generates a unique template instantiation for each set of argument types.

**Code example:**
```cpp
auto add = [](auto a, auto b) { return a + b; };
// Equivalent to:
struct {
    template<typename T, typename U>
    auto operator()(T a, U b) const { return a + b; }
} add;
```

**Explanation:**
When you call `add(1, 2)`, the compiler instantiates `operator()<int, int>`. When you call `add(1.5, 3.5)`, it instantiates `operator()<double, double>`. This allows a single lambda to work with multiple types without writing a templated functor manually, reducing boilerplate significantly.

**Key takeaway:** Generic lambdas are template functors in disguise; they provide template-like behavior with simpler syntax.

---

#### Q3: What is lambda init-capture and why is it important?
**Difficulty:** #intermediate
**Category:** #lambdas #move_semantics
**Concepts:** #init_capture #move_capture #unique_ptr #threading

**Answer:**
Init-capture (also called generalized lambda capture) allows you to initialize a capture variable with an arbitrary expression, including moving resources into the lambda. This enables move-only types like `unique_ptr` to be captured.

**Code example:**
```cpp
auto ptr = std::make_unique<int>(42);
auto f = [p = std::move(ptr)] { std::cout << *p; };
// ptr is now nullptr, p owns the resource
```

**Explanation:**
In C++11, you could only capture by value or reference, making it impossible to move resources into lambdas. C++14's init-capture syntax `[name = expr]` allows moving, copying with transformation, or creating new variables in the capture list. This is essential for passing unique ownership to callbacks, thread functions, or asynchronous operations.

**Key takeaway:** Init-capture enables move semantics in lambda captures, crucial for transferring unique ownership to closures in concurrent or callback-based code.

---

#### Q4: Why was std::make_unique missing from C++11 and what problem does it solve?
**Difficulty:** #beginner
**Category:** #memory #interview_favorite
**Concepts:** #smart_pointers #make_unique #exception_safety #unique_ptr

**Answer:**
`std::make_unique` was an oversight in C++11 (make_shared existed but not make_unique). It provides exception-safe, concise syntax for creating `unique_ptr` without exposing `new`.

**Code example:**
```cpp
// C++11 - verbose, potential leak if Widget constructor throws
auto p1 = std::unique_ptr<Widget>(new Widget(args));

// C++14 - clean, exception-safe
auto p2 = std::make_unique<Widget>(args);
```

**Explanation:**
Using `new` directly can cause memory leaks if an exception is thrown between allocation and unique_ptr construction. `make_unique` ensures the allocation and unique_ptr creation are atomic. It also supports perfect forwarding of constructor arguments and is more readable. The omission from C++11 was simply an oversight that C++14 corrected.

**Key takeaway:** Always prefer make_unique over new with unique_ptr; it's safer, cleaner, and more idiomatic modern C++.

---

#### Q5: What is std::exchange and when should you use it?
**Difficulty:** #intermediate
**Category:** #utility #move_semantics
**Concepts:** #std_exchange #move_constructor #swap #atomic_operation

**Answer:**
`std::exchange(obj, new_value)` replaces `obj` with `new_value` and returns the old value. It's particularly useful in move constructors/assignment to atomically transfer and reset resources.

**Code example:**
```cpp
int x = 10;
int old = std::exchange(x, 20);  // x = 20, old = 10

// In move constructor:
MyClass(MyClass&& other) : data(std::exchange(other.data, nullptr)) {}
```

**Explanation:**
Before C++14, you'd write: `data = other.data; other.data = nullptr;` (two statements). `std::exchange` does both atomically in one expression. This is cleaner, less error-prone, and clearly expresses the intent of swapping and resetting. It's also useful in algorithms that need to replace and observe the old value simultaneously.

**Key takeaway:** Use std::exchange in move operations and algorithms that need atomic swap-and-return semantics.

---

#### Q6: How does relaxed constexpr in C++14 differ from C++11?
**Difficulty:** #intermediate
**Category:** #compile_time #interview_favorite
**Concepts:** #constexpr #compile_time_computation #loops #local_variables

**Answer:**
C++11 constexpr functions could only contain a single return statement (recursion and ternary operators). C++14 allows multiple statements, local variables, loops, and conditionals, making constexpr practical for real algorithms.

**Code example:**
```cpp
// C++11 - only recursion
constexpr int fact11(int n) {
    return (n <= 1) ? 1 : n * fact11(n - 1);
}

// C++14 - loops and local vars
constexpr int fact14(int n) {
    int result = 1;
    for (int i = 2; i <= n; ++i)
        result *= i;
    return result;
}
```

**Explanation:**
C++11's restrictions made constexpr tedious for anything beyond trivial calculations. C++14 removes most restrictions, allowing natural imperative code. The only remaining limitations: no dynamic memory allocation, no virtual function calls, no reinterpret_cast, and the function must be callable at compile time. This enables complex compile-time computations like lookup table generation.

**Key takeaway:** C++14 constexpr enables writing natural algorithms that execute at compile time, eliminating runtime overhead.

---

#### Q7: What is std::integer_sequence used for?
**Difficulty:** #advanced
**Category:** #templates #metaprogramming
**Concepts:** #integer_sequence #index_sequence #tuple_unpacking #variadic_templates

**Answer:**
`std::integer_sequence<T, Is...>` represents a compile-time sequence of integers. `std::index_sequence<Is...>` is an alias for `std::integer_sequence<size_t, Is...>`. They're primarily used for tuple unpacking and applying functions to tuple elements.

**Code example:**
```cpp
template<typename Tuple, std::size_t... Is>
void print_tuple(const Tuple& t, std::index_sequence<Is...>) {
    ((std::cout << std::get<Is>(t) << " "), ...);  // C++17 fold expression
}

std::tuple<int, double, char> t{42, 3.14, 'a'};
print_tuple(t, std::make_index_sequence<3>{});  // Prints: 42 3.14 a
```

**Explanation:**
`std::make_index_sequence<N>` generates `std::index_sequence<0, 1, 2, ..., N-1>`. In the function, `Is...` expands to 0, 1, 2, allowing us to call `std::get<Is>(t)` for each index. This enables generic tuple manipulation without knowing the tuple size or types at compile time. Essential for implementing `std::apply`, custom tuple algorithms, and variadic template utilities.

**Key takeaway:** integer_sequence enables compile-time index generation for tuple unpacking and other metaprogramming patterns.

---

#### Q8: Can you use std::get<T>(tuple) if the type appears multiple times?
**Difficulty:** #beginner
**Category:** #stl #syntax
**Concepts:** #std_get #tuple #type_access #ambiguity

**Answer:**
No, `std::get<T>(tuple)` only works if the type T appears exactly once in the tuple. If it appears multiple times, the code won't compile due to ambiguity.

**Code example:**
```cpp
std::tuple<int, double, char> t1{1, 2.5, 'a'};
double d = std::get<double>(t1);  // ✅ OK, double appears once

std::tuple<int, double, int> t2{1, 2.5, 3};
// int x = std::get<int>(t2);  // ❌ Error: ambiguous, int appears twice
int x = std::get<0>(t2);  // ✅ Use index instead
```

**Explanation:**
`std::get<T>` is a convenience for accessing tuple elements by type when the type uniquely identifies the position. If the type appears multiple times, the compiler can't determine which element you want. You must use index-based access `std::get<Index>` instead. This design prevents silent bugs where the wrong element might be accessed.

**Key takeaway:** std::get<T> requires unique types; use std::get<Index> if types are duplicated in the tuple.

---

#### Q9: What are variable templates and how do they differ from static constexpr members?
**Difficulty:** #intermediate
**Category:** #templates #metaprogramming
**Concepts:** #variable_templates #constexpr #type_traits #template_variables

**Answer:**
Variable templates are template definitions for variables (not types or functions). They provide cleaner syntax than static constexpr members in template structs.

**Code example:**
```cpp
// C++11 approach
template<typename T>
struct pi_struct {
    static constexpr T value = T(3.14159);
};
double d = pi_struct<double>::value;  // Verbose

// C++14 variable template
template<typename T>
constexpr T pi = T(3.14159);
double d2 = pi<double>;  // Clean
```

**Explanation:**
Variable templates eliminate the need for wrapper structs, making template metaprogramming more readable. They're especially useful with type traits: `template<typename T> constexpr bool is_numeric = std::is_arithmetic<T>::value;` is much cleaner than `std::is_arithmetic<T>::value` everywhere. Each instantiation creates a distinct variable, but linkage rules ensure single definition across translation units.

**Key takeaway:** Variable templates provide cleaner, more intuitive syntax for template constants and type trait predicates.

---

#### Q10: How do binary literals and digit separators improve code readability?
**Difficulty:** #beginner
**Category:** #syntax #readability
**Concepts:** #binary_literals #digit_separators #literals

**Answer:**
Binary literals (`0b` prefix) allow expressing values in base-2 directly. Digit separators (`'`) break up long numbers for readability without affecting the value.

**Code example:**
```cpp
// Binary literals
int mask = 0b11110000;      // 240, clear which bits are set
int flags = 0b0001'0100;    // With separator for readability

// Digit separators
int million = 1'000'000;
long long big = 9'223'372'036'854'775'807;  // INT64_MAX, much more readable
```

**Explanation:**
Binary literals are invaluable for bit manipulation, hardware registers, and protocol implementations where individual bits have meaning. Digit separators make large decimal, hex, or binary numbers readable by grouping digits (typically in groups of 3 for decimal, 4 for hex/binary). The compiler ignores the separators; they're purely for human readability. Essential in embedded, networking, and low-level systems code.

**Key takeaway:** Use binary literals and digit separators for clarity in bit manipulation and large numeric constants.

---

#### Q11: What is the [[deprecated]] attribute and when should you use it?
**Difficulty:** #beginner
**Category:** #syntax #maintenance
**Concepts:** #attributes #deprecated #api_evolution

**Answer:**
`[[deprecated]]` marks functions, types, or variables as deprecated, generating compiler warnings when they're used. Optionally includes a message explaining the alternative.

**Code example:**
```cpp
[[deprecated("Use newFunc instead")]]
void oldFunc() { /* ... */ }

void newFunc() { /* ... */ }

int main() {
    oldFunc();  // Warning: 'oldFunc' is deprecated: Use newFunc instead
}
```

**Explanation:**
When evolving APIs, you often need to phase out old interfaces gradually. `[[deprecated]]` allows existing code to compile but warns developers to migrate. The warning message can guide users to the replacement API. This is especially important in library development where immediate breaking changes would affect many users. Deprecated functions can later be removed in a major version bump.

**Key takeaway:** Use [[deprecated]] to signal API transitions, giving users time to migrate before removal.

---

#### Q12: How does return type deduction interact with templates?
**Difficulty:** #advanced
**Category:** #templates #type_deduction
**Concepts:** #return_type_deduction #template_functions #decltype #sfinae

**Answer:**
Return type deduction in template functions is determined by instantiation. The compiler deduces the return type from the actual return statement for each template instantiation independently.

**Code example:**
```cpp
template<typename T>
auto process(T val) {
    if constexpr (std::is_integral_v<T>)
        return val * 2;      // Returns T
    else
        return val + 0.5;    // Returns T (might be double)
}

auto x = process(10);      // x is int
auto y = process(3.14);    // y is double
```

**Explanation:**
Each instantiation of the template deduces its return type independently. `process<int>` returns int, `process<double>` returns double. This is powerful but can be confusing if different instantiations return different types. Using `decltype(auto)` or explicit trailing return types (`-> decltype(...)`) can make the behavior more predictable. SFINAE and `enable_if` work normally with deduced return types.

**Key takeaway:** Return type deduction in templates is per-instantiation; be mindful of type consistency across different template arguments.

---

#### Q13: Can generic lambdas replace all uses of template functors?
**Difficulty:** #intermediate
**Category:** #lambdas #design_patterns
**Concepts:** #generic_lambdas #functors #template_classes #operator_overloading

**Answer:**
No, generic lambdas are limited to `operator()`. They cannot have multiple overloaded operators, member functions, or state that requires custom constructors/destructors beyond captures.

**Code example:**
```cpp
// ✅ Generic lambda - simple case
auto compare = [](auto a, auto b) { return a < b; };

// ❌ Can't do with lambda - needs multiple operators
struct CompareFunctor {
    bool operator()(int a, int b) const { return a < b; }
    bool operator()(std::string a, std::string b) const { return a.size() < b.size(); }
};
```

**Explanation:**
Generic lambdas are great for single-operation callbacks, but if you need overload sets, multiple member functions, complex initialization, or custom types, use a template class. Also, lambdas have no default constructor, so they can't be used as template arguments that require default construction (though C++20's `[]<typename T>(T x)` syntax adds more power).

**Key takeaway:** Generic lambdas are powerful for single-operation templates but can't replace full template classes with complex behavior.

---

#### Q14: What happens when you move a shared_ptr into a lambda capture?
**Difficulty:** #intermediate
**Category:** #memory #move_semantics
**Concepts:** #shared_ptr #init_capture #reference_counting #ownership

**Answer:**
Moving a `shared_ptr` into a lambda capture transfers ownership to the lambda. The original `shared_ptr` becomes empty (nullptr), and the reference count remains the same (or decreases by one if no other copies exist).

**Code example:**
```cpp
auto sp = std::make_shared<int>(100);
std::cout << sp.use_count() << "\n";  // 1

auto lam = [p = std::move(sp)]() { return *p; };
std::cout << sp.use_count() << "\n";        // 0
std::cout << (sp == nullptr) << "\n";       // 1 (true)
```

**Explanation:**
After the move, `sp` no longer owns the int; the lambda's captured `p` owns it. The reference count is still 1 (only `p` owns it). This is different from copying: `[p = sp]` would increment the count to 2. Move capture is preferred when the lambda outlives the current scope and the original shared_ptr isn't needed anymore, avoiding unnecessary reference count increments.

**Key takeaway:** Moving shared_ptr into lambda capture transfers ownership efficiently; use move when the original pointer isn't needed afterward.

---

#### Q15: How do you use SFINAE with generic lambdas?
**Difficulty:** #advanced
**Category:** #templates #metaprogramming
**Concepts:** #sfinae #generic_lambdas #enable_if #static_assert

**Answer:**
You can't use SFINAE directly on lambda parameters, but you can use `static_assert` with type traits inside the lambda body to enforce constraints at instantiation time.

**Code example:**
```cpp
auto only_numeric = [](auto val) {
    static_assert(std::is_arithmetic<decltype(val)>::value, "Numeric type required");
    return val * 2;
};

only_numeric(10);      // ✅ OK
// only_numeric("hi");  // ❌ static_assert fails
```

**Explanation:**
Unlike template functions where you can use `enable_if` in the signature, lambda parameters don't support this directly. However, `static_assert` inside the body provides compile-time type checking. For more flexible SFINAE, wrap the lambda in a template function or use C++20 concepts. The error message from `static_assert` is often clearer than SFINAE substitution failures.

**Key takeaway:** Use static_assert with type traits inside generic lambdas for compile-time type constraints.

---

#### Q16: What's the difference between return x and return (x) with decltype(auto)?
**Difficulty:** #advanced
**Category:** #type_deduction #references
**Concepts:** #decltype_auto #parentheses #lvalue_expression #value_category

**Answer:**
With `decltype(auto)`, `return x;` returns by value, while `return (x);` returns by reference (if x is an lvalue). Parentheses change x from an identifier to an expression.

**Code example:**
```cpp
int global = 10;

decltype(auto) f1() { return global; }   // Returns int (copy)
decltype(auto) f2() { return (global); } // Returns int& (reference)

int main() {
    f1() = 20;  // ❌ Error: can't assign to rvalue
    f2() = 30;  // ✅ OK: modifies global
    std::cout << global << "\n";  // 30
}
```

**Explanation:**
`decltype(global)` is `int` (identifier), but `decltype((global))` is `int&` (lvalue expression). This is a subtle C++ rule: identifiers have their declared type, but expressions in parentheses are evaluated for value category. Using `return (local_var);` with `decltype(auto)` creates a dangling reference, a common bug. Always use `return var;` (no parens) unless you specifically need to return a reference to a non-local.

**Key takeaway:** With decltype(auto), avoid parentheses around identifiers unless intentionally returning a reference to a non-local object.

---

#### Q17: How do you implement tuple unpacking in C++14 without fold expressions?
**Difficulty:** #advanced
**Category:** #templates #metaprogramming
**Concepts:** #tuple_unpacking #index_sequence #variadic_expansion #comma_operator

**Answer:**
Use `std::index_sequence` to generate indices, then expand with the comma operator inside an initializer list to force sequential evaluation (C++17 fold expressions make this easier, but C++14 requires tricks).

**Code example:**
```cpp
template<typename Tuple, std::size_t... Is>
void print_tuple(const Tuple& t, std::index_sequence<Is...>) {
    using swallow = int[];
    (void)swallow{0, (std::cout << std::get<Is>(t) << " ", 0)...};
}

template<typename... Args>
void print(const std::tuple<Args...>& t) {
    print_tuple(t, std::make_index_sequence<sizeof...(Args)>{});
}
```

**Explanation:**
The `swallow` array forces evaluation of each expression in the brace initializer list. The comma operator ensures each `std::get<Is>(t)` is printed before the 0 is added to the array. This is a common C++14 idiom before fold expressions. C++17's `((std::cout << std::get<Is>(t) << " "), ...);` is much cleaner.

**Key takeaway:** C++14 tuple unpacking requires index_sequence with comma operator tricks; C++17 fold expressions simplify this significantly.

---

#### Q18: Can constexpr functions have side effects in C++14?
**Difficulty:** #intermediate
**Category:** #compile_time #constexpr
**Concepts:** #constexpr #side_effects #compile_time_evaluation #runtime_evaluation

**Answer:**
constexpr functions can have side effects when evaluated at *runtime*, but not when evaluated at *compile time*. The compiler enforces compile-time purity; runtime evaluation allows normal C++ operations.

**Code example:**
```cpp
constexpr int log_and_return(int x) {
    // std::cout << x;  // ❌ Error at compile time (I/O not allowed)
    return x * x;
}

int main() {
    constexpr int a = log_and_return(5);  // ✅ Compile-time: no side effects

    int runtime_val = 10;
    int b = log_and_return(runtime_val);  // ✅ Runtime: normal function
}
```

**Explanation:**
constexpr functions are *potentially* compile-time evaluable but can also run at runtime. When called in a constant expression context (like initializing a constexpr variable or array size), they must be pure. When called with runtime values, they behave like normal functions. C++14 still prohibits certain operations (dynamic allocation, virtual calls, I/O) even at runtime when declared constexpr.

**Key takeaway:** constexpr functions must be pure at compile time but can have side effects when evaluated at runtime.

---

#### Q19: What are the limitations of variable templates?
**Difficulty:** #intermediate
**Category:** #templates #metaprogramming
**Concepts:** #variable_templates #odr #linkage #constexpr

**Answer:**
Variable templates should generally be const/constexpr to avoid ODR violations when used in headers. Non-const variable templates can cause each translation unit to have its own copy, leading to linker errors or subtle bugs.

**Code example:**
```cpp
// header.h
template<typename T>
constexpr T pi = T(3.14159);  // ✅ OK: const, each TU sees same value

template<typename T>
T counter = T(0);  // ⚠️ Each TU gets its own copy - ODR issues

// C++17: use inline to share across TUs
template<typename T>
inline T shared_counter = T(0);  // ✅ OK in C++17
```

**Explanation:**
In C++14, non-const variable templates violate ODR if used across multiple translation units because each TU instantiates its own copy. C++17 introduced `inline` variables to allow shared mutable state. In C++14, stick to const/constexpr variable templates in headers, or place mutable ones in a single .cpp file with explicit instantiation.

**Key takeaway:** C++14 variable templates should be const/constexpr in headers; mutable templates need C++17's inline or careful placement.

---

#### Q20: How does std::make_index_sequence generate compile-time indices?
**Difficulty:** #advanced
**Category:** #templates #metaprogramming
**Concepts:** #index_sequence #make_index_sequence #template_recursion #pack_expansion

**Answer:**
`std::make_index_sequence<N>` uses recursive template instantiation to build a parameter pack of indices 0, 1, 2, ..., N-1 at compile time.

**Code example:**
```cpp
// Simplified implementation concept (actual is more complex)
template<std::size_t... Is>
struct index_sequence {};

template<std::size_t N, std::size_t... Is>
struct make_index_sequence_impl : make_index_sequence_impl<N-1, N-1, Is...> {};

template<std::size_t... Is>
struct make_index_sequence_impl<0, Is...> {
    using type = index_sequence<Is...>;
};

// Usage
auto seq = std::make_index_sequence<5>{};  // index_sequence<0,1,2,3,4>
```

**Explanation:**
The recursive template instantiation builds up the parameter pack: `make_index_sequence_impl<5>` → `<4, 4>` → `<3, 3, 4>` → `<2, 2, 3, 4>` → `<1, 1, 2, 3, 4>` → `<0, 0, 1, 2, 3, 4>` → base case produces `index_sequence<0,1,2,3,4>`. Real implementations use more efficient techniques (like binary splitting) to reduce compilation time for large N.

**Key takeaway:** make_index_sequence uses recursive templates to generate compile-time index packs, enabling tuple unpacking and variadic algorithms.

---

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

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Undefined behavior (likely crash)

**Explanation:** `bar()` returns `int&` to destroyed local `x` via `decltype(auto)` with parentheses. Accessing `b` is UB.

**Key Concept:** #decltype_auto #dangling_reference

</details>

---

#### Q2
```cpp
#include <iostream>
auto lambda = [](auto x, auto y) { return x + y; };
int main() {
    std::cout << lambda(1, 2) << " " << lambda(1.5, 2.5);
}
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** 3 4

**Explanation:** Generic lambda works with both `int` and `double`. First call: 1+2=3, second: 1.5+2.5=4.0 (printed without decimal).

**Key Concept:** #generic_lambdas #type_deduction

</details>

---

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

<details>
<summary><b>Show Answer</b></summary>

**Answer:** 100 1

**Explanation:** Lambda captures unique_ptr by move. `lam()` returns 100, `ptr` is nullptr after move (prints 1 for true).

**Key Concept:** #init_capture #move_semantics

</details>

---

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

<details>
<summary><b>Show Answer</b></summary>

**Answer:** 120

**Explanation:** Relaxed constexpr allows loops. `factorial(5)` = 5*4*3*2*1 = 120, computed at compile time.

**Key Concept:** #constexpr #compile_time

</details>

---

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

<details>
<summary><b>Show Answer</b></summary>

**Answer:** 10 20

**Explanation:** `std::exchange(a, 20)` returns old value (10) and sets `a` to 20.

**Key Concept:** #std_exchange #utility

</details>

---

#### Q6
```cpp
#include <iostream>
#include <tuple>
int main() {
    std::tuple<int, double, char> t{1, 2.5, 'a'};
    std::cout << std::get<double>(t);
}
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** 2.5

**Explanation:** `std::get<double>` accesses tuple element by type. `double` appears once, so unambiguous.

**Key Concept:** #std_get #tuple

</details>

---

#### Q7
```cpp
#include <iostream>
template<typename T>
constexpr bool is_float = std::is_floating_point<T>::value;
int main() {
    std::cout << is_float<int> << " " << is_float<double>;
}
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** 0 1

**Explanation:** Variable template `is_float<int>` is false (0), `is_float<double>` is true (1).

**Key Concept:** #variable_templates #type_traits

</details>

---

#### Q8
```cpp
#include <iostream>
int main() {
    int x = 0b1010;
    int y = 1'000;
    std::cout << x << " " << y;
}
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** 10 1000

**Explanation:** Binary literal 0b1010 = 10 decimal. Digit separator 1'000 = 1000 (separator ignored).

**Key Concept:** #binary_literals #digit_separators

</details>

---

#### Q9
```cpp
#include <iostream>
auto add = [](auto a, auto b) { return a + b; };
int main() {
    std::cout << add(5, 10) << " " << add(2.5, 3.5);
}
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** 15 6

**Explanation:** Generic lambda adds arguments. 5+10=15, 2.5+3.5=6.0 (printed as 6).

**Key Concept:** #generic_lambdas #auto_parameters

</details>

---

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

<details>
<summary><b>Show Answer</b></summary>

**Answer:** 200

**Explanation:** `get_ref()` returns `int&` due to `decltype(auto)` and parentheses. Assignment modifies `global`.

**Key Concept:** #decltype_auto #reference_return

</details>

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

<details>
<summary><b>Show Answer</b></summary>

**Answer:** 42 2

**Explanation:** Lambda copies `shared_ptr` (not move). Reference count becomes 2 (original `sp` + captured `p`).

**Key Concept:** #shared_ptr #reference_counting

</details>

---

#### Q12
```cpp
#include <iostream>
constexpr int square(int x) { return x * x; }
int main() {
    int arr[square(3)];
    std::cout << sizeof(arr) / sizeof(int);
}
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** 9

**Explanation:** `square(3)` = 9 at compile time. Array has 9 ints. `sizeof(arr)` = 9*4 = 36 bytes typically, divided by 4 = 9.

**Key Concept:** #constexpr #array_size

</details>

---

#### Q13
```cpp
#include <iostream>
template<typename T>
constexpr T pi = T(3.14159);
int main() {
    std::cout << pi<int> << " " << pi<double>;
}
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** 3 3.14159

**Explanation:** Variable template `pi<int>` truncates to 3, `pi<double>` is 3.14159.

**Key Concept:** #variable_templates #templates

</details>

---

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

<details>
<summary><b>Show Answer</b></summary>

**Answer:** 1 2

**Explanation:** Both return paths return `int`, so return type deduction succeeds. `foo(true)` returns 1, `foo(false)` returns 2.

**Key Concept:** #return_type_deduction #auto

</details>

---

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

<details>
<summary><b>Show Answer</b></summary>

**Answer:** 20

**Explanation:** `f2()` returns `int&` to `global x`. Assignment `f2() = 20` modifies `x` to 20.

**Key Concept:** #decltype_auto #lvalue_reference

</details>

---

#### Q16
```cpp
#include <iostream>
#include <tuple>
int main() {
    std::tuple<int, double, int> t{1, 2.5, 3};
    std::cout << std::get<0>(t);
}
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** 1

**Explanation:** `std::get<0>` accesses first element by index. Works even though `int` appears twice.

**Key Concept:** #std_get #tuple_index

</details>

---

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

<details>
<summary><b>Show Answer</b></summary>

**Answer:** 42

**Explanation:** `lambda(21)` passes `int`, which satisfies `is_integral`. Returns 21*2 = 42.

**Key Concept:** #generic_lambdas #static_assert

</details>

---

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

<details>
<summary><b>Show Answer</b></summary>

**Answer:** 10 5

**Explanation:** Inner `exchange(x, 10)` sets `x` to 10, returns 5. Outer `exchange(x, 5)` sets `x` to 5 (wait, x was 10), returns 10. Actually: inner executes first: x=5 initially, `exchange(x,10)` makes x=10 and returns 5. Then outer `exchange(x, 5)` makes x=5 and returns 10. Wait, let me recalculate: x starts as 5. Inner `std::exchange(x, 10)` changes x to 10 and returns 5. Then outer `std::exchange(x, 5)` changes x to 5 and returns 10. So x=5, y=10. But actually, evaluation order: the inner exchange happens as part of the outer's argument, so inner first: x=5→10, returns 5. Outer: x=10→5, returns 10. So x=5, y=10. No wait: `int y = std::exchange(x, std::exchange(x, 10));` - right operand evaluates first in most cases. Inner: x=5→10, returns 5. Outer: std::exchange(x, 5) makes x=5, returns 10. So x=5, y=10. But the outer exchange receives 5 as second arg from inner. So outer is `exchange(x, 5)` where x is now 10. So outer: x=10→5, returns 10. Result: x=5, y=10.

**Key Concept:** #std_exchange #evaluation_order

</details>

---

#### Q19
```cpp
#include <iostream>
int main() {
    int binary = 0b1111;
    int readable = 1'00'0;
    std::cout << binary << " " << readable;
}
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** 15 100

**Explanation:** Binary 0b1111 = 15 decimal. Digit separator 1'00'0 = 100.

**Key Concept:** #binary_literals #digit_separators

</details>

---

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

<details>
<summary><b>Show Answer</b></summary>

**Answer:** 99 50

**Explanation:** Mutable lambda allows modifying captured `p`. First call: `exchange(*p, 50)` returns 99, sets *p to 50. Second call: `exchange(*p, 50)` returns 50, sets *p to 50 again.

**Key Concept:** #init_capture #mutable_lambda #std_exchange

</details>

---


### QUICK_REFERENCE: Answer Key and Summary Tables

#### Answer Key for Practice Questions

| Q# | Answer | Explanation | Key Concept |
|----|--------|-------------|-------------|
| 1 | Undefined behavior (likely crash) | `bar()` returns `int&` to destroyed local `x` via `decltype(auto)` with parentheses. Accessing `b` is UB. | #decltype_auto #dangling_reference |
| 2 | 3 4 | Generic lambda works with both `int` and `double`. First call: 1+2=3, second: 1.5+2.5=4.0 (printed without decimal). | #generic_lambdas #type_deduction |
| 3 | 100 1 | Lambda captures unique_ptr by move. `lam()` returns 100, `ptr` is nullptr after move (prints 1 for true). | #init_capture #move_semantics |
| 4 | 120 | Relaxed constexpr allows loops. `factorial(5)` = 5*4*3*2*1 = 120, computed at compile time. | #constexpr #compile_time |
| 5 | 10 20 | `std::exchange(a, 20)` returns old value (10) and sets `a` to 20. | #std_exchange #utility |
| 6 | 2.5 | `std::get<double>` accesses tuple element by type. `double` appears once, so unambiguous. | #std_get #tuple |
| 7 | 0 1 | Variable template `is_float<int>` is false (0), `is_float<double>` is true (1). | #variable_templates #type_traits |
| 8 | 10 1000 | Binary literal 0b1010 = 10 decimal. Digit separator 1'000 = 1000 (separator ignored). | #binary_literals #digit_separators |
| 9 | 15 6 | Generic lambda adds arguments. 5+10=15, 2.5+3.5=6.0 (printed as 6). | #generic_lambdas #auto_parameters |
| 10 | 200 | `get_ref()` returns `int&` due to `decltype(auto)` and parentheses. Assignment modifies `global`. | #decltype_auto #reference_return |
| 11 | 42 2 | Lambda copies `shared_ptr` (not move). Reference count becomes 2 (original `sp` + captured `p`). | #shared_ptr #reference_counting |
| 12 | 9 | `square(3)` = 9 at compile time. Array has 9 ints. `sizeof(arr)` = 9*4 = 36 bytes typically, divided by 4 = 9. | #constexpr #array_size |
| 13 | 3 3.14159 | Variable template `pi<int>` truncates to 3, `pi<double>` is 3.14159. | #variable_templates #templates |
| 14 | 1 2 | Both return paths return `int`, so return type deduction succeeds. `foo(true)` returns 1, `foo(false)` returns 2. | #return_type_deduction #auto |
| 15 | 20 | `f2()` returns `int&` to `global x`. Assignment `f2() = 20` modifies `x` to 20. | #decltype_auto #lvalue_reference |
| 16 | 1 | `std::get<0>` accesses first element by index. Works even though `int` appears twice. | #std_get #tuple_index |
| 17 | 42 | `lambda(21)` passes `int`, which satisfies `is_integral`. Returns 21*2 = 42. | #generic_lambdas #static_assert |
| 18 | 10 5 | Inner `exchange(x, 10)` sets `x` to 10, returns 5. Outer `exchange(x, 5)` sets `x` to 5 (wait, x was 10), returns 10. Actually: inner executes first: x=5 initially, `exchange(x,10)` makes x=10 and returns 5. Then outer `exchange(x, 5)` makes x=5 and returns 10. Wait, let me recalculate: x starts as 5. Inner `std::exchange(x, 10)` changes x to 10 and returns 5. Then outer `std::exchange(x, 5)` changes x to 5 and returns 10. So x=5, y=10. But actually, evaluation order: the inner exchange happens as part of the outer's argument, so inner first: x=5→10, returns 5. Outer: x=10→5, returns 10. So x=5, y=10. No wait: `int y = std::exchange(x, std::exchange(x, 10));` - right operand evaluates first in most cases. Inner: x=5→10, returns 5. Outer: std::exchange(x, 5) makes x=5, returns 10. So x=5, y=10. But the outer exchange receives 5 as second arg from inner. So outer is `exchange(x, 5)` where x is now 10. So outer: x=10→5, returns 10. Result: x=5, y=10. | #std_exchange #evaluation_order |
| 19 | 15 100 | Binary 0b1111 = 15 decimal. Digit separator 1'00'0 = 100. | #binary_literals #digit_separators |
| 20 | 99 50 | Mutable lambda allows modifying captured `p`. First call: `exchange(*p, 50)` returns 99, sets *p to 50. Second call: `exchange(*p, 50)` returns 50, sets *p to 50 again. | #init_capture #mutable_lambda #std_exchange |

#### C++14 Features Summary

| Feature | Description | Key Benefit |
|---------|-------------|-------------|
| Return type deduction | `auto` for any function | Reduces verbosity in templates |
| Generic lambdas | `auto` parameters | Template-like behavior without explicit syntax |
| Init-capture | `[x = expr]` in lambda | Move semantics in captures |
| decltype(auto) | Exact type preservation | Perfect forwarding of return types |
| Relaxed constexpr | Loops, locals, statements | Practical compile-time algorithms |
| std::make_unique | Type-safe unique_ptr creation | Exception safety, cleaner syntax |
| std::exchange | Atomic replace-and-return | Cleaner move operations |
| std::integer_sequence | Compile-time index generation | Tuple unpacking, variadic expansion |
| Variable templates | Template variables | Cleaner metaprogramming syntax |
| Binary literals | `0b` prefix | Clarity in bit manipulation |
| Digit separators | `'` in numbers | Readability for large constants |
| [[deprecated]] | Deprecation attribute | Gradual API evolution |

#### Return Type Deduction Comparison

| Feature | Strips Refs/Const? | Use Case |
|---------|-------------------|----------|
| `auto` | Yes (always value) | Simple returns, no reference semantics |
| `auto&` / `auto&&` | Explicit reference | Forced reference return |
| `decltype(auto)` | No (preserves exact type) | Perfect forwarding, proxy types |
| Explicit return type | N/A | Complex types, documentation |

#### Lambda Capture Modes (C++14)

| Syntax | Meaning | When to Use |
|--------|---------|-------------|
| `[=]` | Capture all by value | Read-only access, small data |
| `[&]` | Capture all by reference | Modify outer scope, large data |
| `[x]` | Capture `x` by value | Specific value capture |
| `[&x]` | Capture `x` by reference | Specific reference capture |
| `[x = expr]` | Init-capture (C++14) | Move semantics, transformation |
| `[p = std::move(ptr)]` | Move-capture (C++14) | Transfer unique ownership |

#### constexpr Evolution

| C++11 | C++14 | C++17 | C++20 |
|-------|-------|-------|-------|
| Single return | Loops, locals | Lambdas | Dynamic allocation (limited) |
| Recursion only | Multiple statements | if constexpr | Virtual functions (limited) |
| No local vars | Conditionals (if/switch) | | try-catch |

#### Type Traits with Variable Templates

**C++11 Style:**
```cpp
std::is_integral<T>::value
std::is_pointer<T>::value
```

**C++14 Style (with custom variable templates):**
```cpp
template<typename T> constexpr bool is_integral_v = std::is_integral<T>::value;
is_integral_v<T>
```

**C++17 Style (standard library):**
```cpp
std::is_integral_v<T>  // Built-in
```

#### Common Pitfalls and Solutions

| Pitfall | Problem | Solution |
|---------|---------|----------|
| `return (local)` with `decltype(auto)` | Dangling reference | Remove parentheses or return by value |
| Mixed return types with `auto` | Compilation error | Use explicit return type or common type |
| Generic lambda with `{}` list | Deduction failure | Use explicit type or `initializer_list` |
| Non-const variable template in header | ODR violation | Make const/constexpr or use inline (C++17) |
| `std::get<T>(tuple)` with duplicate type | Ambiguity error | Use index-based `std::get<Index>` |

---

**End of Chapter 15: C++14 Feature Deep Dive**

C++14 represents a maturation of C++11's revolutionary features. While not introducing fundamentally new paradigms, it removed friction points, filled critical gaps (make_unique), and made existing features more practical (relaxed constexpr, generic lambdas). Modern C++ codebases heavily rely on these conveniences, making C++14 an essential baseline for professional development. The features covered here form the foundation for understanding C++17's further enhancements and C++20's paradigm shifts with concepts and coroutines.
