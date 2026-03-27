## TOPIC: C++14 Language and Library Enhancements

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
