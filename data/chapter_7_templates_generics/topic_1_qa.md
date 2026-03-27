## TOPIC: Template Fundamentals and Specialization

### INTERVIEW_QA: Core Concepts and Specialization

#### Q1: What is the difference between function templates and class templates in terms of template argument deduction?
**Difficulty:** #beginner
**Category:** #syntax #fundamentals
**Concepts:** #template_basics #type_deduction #instantiation

**Answer:**
Function templates support automatic template argument deduction from function call arguments, while class templates (before C++17) require explicit template argument specification.

**Code example:**
```cpp
template<typename T> T add(T a, T b) { return a + b; }
template<typename T> class Box { T value; };

int main() {
    add(5, 10);           // ✅ T deduced as int
    // Box b(5);          // ❌ Error in C++11/14
    Box<int> b(5);        // ✅ Must specify template argument
}
```

**Explanation:**
Function templates can deduce `T` from the types of arguments passed at the call site, making them more convenient to use. Class templates lack this deduction mechanism because there's no analogous "call site" for a class—the template arguments must be part of the type name itself. C++17 introduced CTAD (Class Template Argument Deduction) to address this limitation.

**Key takeaway:** Function templates deduce types automatically from arguments; class templates require explicit type specification (pre-C++17).

---

#### Q2: Why are non-template functions preferred over template functions in overload resolution when both match?
**Difficulty:** #intermediate
**Category:** #overload_resolution #design_pattern
**Concepts:** #function_templates #overloading #template_instantiation

**Answer:**
Non-template functions are preferred because they represent more specific implementations, and the compiler prioritizes exact matches over generic template instantiations to avoid unintended behavior.

**Code example:**
```cpp
void process(int x) { std::cout << "non-template\n"; }
template<typename T> void process(T x) { std::cout << "template\n"; }

int main() {
    process(42);    // ✅ Calls non-template (exact match)
    process(3.14);  // ✅ Calls template (no exact match exists)
}
```

**Explanation:**
When overload resolution encounters both a template and non-template function that could handle a call, it prefers the non-template version if types match exactly. This prevents templates from "hijacking" calls intended for specialized implementations and allows gradual specialization of template code with non-template overloads for specific types.

**Key takeaway:** Exact non-template matches always beat template instantiations in overload resolution.

---

#### Q3: What happens if you attempt to use a template with a type that doesn't support the operations used in the template body?
**Difficulty:** #intermediate
**Category:** #error_handling #template_constraints
**Concepts:** #template_instantiation #compile_time_errors #type_requirements

**Answer:**
Compilation fails at the point of instantiation with an error message indicating that the required operation is not supported for that type.

**Code example:**
```cpp
template<typename T>
T multiply(T a, T b) {
    return a * b;  // ❌ Requires operator*
}

struct NoMultiply { int value; };

int main() {
    multiply(5, 10);                      // ✅ OK: int has operator*
    // multiply(NoMultiply{}, NoMultiply{}); // ❌ Error: no operator* for NoMultiply
}
```

**Explanation:**
Templates don't verify that operations are valid until instantiation. When you try to instantiate `multiply<NoMultiply>`, the compiler attempts to generate code for `a * b` with `NoMultiply` operands and fails because the type doesn't provide `operator*`. This is sometimes called "duck typing" at compile time—if it doesn't quack like a duck, compilation fails.

**Key takeaway:** Templates impose implicit interface requirements that are only checked at instantiation time.

---

#### Q4: Explain the difference between full specialization and partial specialization. Can you fully specialize a function template?
**Difficulty:** #intermediate
**Category:** #specialization #advanced_techniques
**Concepts:** #full_specialization #partial_specialization #function_templates #class_templates

**Answer:**
Full specialization provides a completely custom implementation for specific template arguments, while partial specialization specializes some but not all parameters. Function templates can only be fully specialized, not partially specialized.

**Code example:**
```cpp
// Class template - both full and partial specialization allowed
template<typename T, typename U> struct Pair { };
template<typename T> struct Pair<T, int> { };  // ✅ Partial
template<> struct Pair<double, int> { };        // ✅ Full

// Function template - only full specialization allowed
template<typename T> void func(T) { }
template<> void func<int>(int) { }              // ✅ Full
// template<typename T> void func<T*>(T*) { }   // ❌ Partial not allowed
```

**Explanation:**
Partial specialization requires pattern matching on template parameters, which is supported for class templates but not function templates. For functions, you can achieve similar effects through overloading rather than partial specialization. This asymmetry exists because function overloading already provides a mechanism for selecting different implementations based on argument types.

**Key takeaway:** Only class templates support partial specialization; function templates must use overloading instead.

---

#### Q5: What is template argument deduction and when does it fail?
**Difficulty:** #intermediate
**Category:** #type_deduction #error_handling
**Concepts:** #template_basics #type_deduction #ambiguity

**Answer:**
Template argument deduction is the compiler's process of determining template parameters from function call arguments. It fails when arguments don't match consistently or when deduction is ambiguous.

**Code example:**
```cpp
template<typename T>
T max(T a, T b) { return a > b ? a : b; }

int main() {
    max(5, 10);        // ✅ T = int
    max(5.0, 10.0);    // ✅ T = double
    // max(5, 10.0);   // ❌ Error: conflicting deduction (int vs double)
    max<double>(5, 10.0); // ✅ Explicit argument resolves conflict
}
```

**Explanation:**
Deduction fails when different arguments suggest different types for the same template parameter. In `max(5, 10.0)`, the first argument suggests `T=int` while the second suggests `T=double`, creating an ambiguity the compiler cannot resolve. Explicit template arguments bypass deduction entirely.

**Key takeaway:** Template argument deduction requires all uses of a template parameter to deduce consistently to the same type.

---

#### Q6: Why must default template arguments be specified from right to left?
**Difficulty:** #beginner
**Category:** #syntax #template_constraints
**Concepts:** #default_arguments #template_basics

**Answer:**
Default arguments must be rightmost so the compiler can unambiguously match provided arguments to parameters, similar to function default parameter rules.

**Code example:**
```cpp
template<typename T = int, typename U>  // ❌ Error: U has no default after T
struct Bad { };

template<typename T, typename U = int>  // ✅ Correct: defaults are rightmost
struct Good { };

Good<float> obj;  // ✅ Unambiguous: T=float, U=int (default)
```

**Explanation:**
If defaults weren't required to be rightmost, the compiler couldn't determine which arguments correspond to which parameters when fewer arguments are provided. With rightmost defaults, the compiler can always assign provided arguments left-to-right, using defaults for any remaining parameters.

**Key takeaway:** Default template arguments must appear rightmost to enable unambiguous parameter matching.

---

#### Q7: What is a non-type template parameter and what types can be used?
**Difficulty:** #intermediate
**Category:** #advanced_techniques #template_parameters
**Concepts:** #non_type_parameters #compile_time_constants #template_metaprogramming

**Answer:**
Non-type template parameters accept compile-time constant values rather than types. Allowed types include integral types, pointers, references, and enums (C++11), and additional types in later standards.

**Code example:**
```cpp
template<int N>
struct ArraySize {
    int data[N];  // ✅ N must be compile-time constant
};

template<const char* Msg>
void log() { std::cout << Msg << "\n"; }

extern const char greeting[] = "Hello";  // ✅ External linkage required

int main() {
    ArraySize<10> arr;  // ✅ 10 is compile-time constant
    log<greeting>();    // ✅ External linkage pointer
}
```

**Explanation:**
Non-type parameters enable compile-time computation and zero-overhead abstractions by embedding constant values in types. The compiler generates different instantiations for different values, similar to how it generates different instantiations for different types. Restrictions exist because the template parameter must be determinable at compile time and have stable addresses for pointers/references.

**Key takeaway:** Non-type template parameters accept compile-time constants and enable template metaprogramming.

---

#### Q8: What is lazy template instantiation and why is it important?
**Difficulty:** #intermediate
**Category:** #template_instantiation #performance
**Concepts:** #lazy_evaluation #compile_time #template_instantiation

**Answer:**
Lazy instantiation means the compiler only generates code for template member functions that are actually used, not for the entire template when it's instantiated.

**Code example:**
```cpp
template<typename T>
struct Container {
    void valid() { std::cout << "valid\n"; }
    
    void invalid() {
        T::nonexistent_member;  // ❌ Only error if called
    }
};

int main() {
    Container<int> c;
    c.valid();     // ✅ OK: only valid() is instantiated
    // c.invalid(); // ❌ Error only if uncommented
}
```

**Explanation:**
The compiler instantiates template code on-demand. If you never call `invalid()`, the compiler never generates code for it and never discovers the error. This allows templates to contain code that's invalid for some types, as long as that code isn't used. This property is fundamental to SFINAE and template metaprogramming techniques.

**Key takeaway:** Templates only instantiate used members, allowing templates to contain code invalid for some types.

---

#### Q9: How do you force template argument deduction for a specific type?
**Difficulty:** #beginner
**Category:** #syntax #type_deduction
**Concepts:** #explicit_instantiation #template_arguments

**Answer:**
Use explicit template arguments in angle brackets to bypass deduction and force a specific type.

**Code example:**
```cpp
template<typename T>
T add(T a, T b) { return a + b; }

int main() {
    add(5, 10);            // ✅ Deduced: T = int
    add<double>(5, 10);    // ✅ Forced: T = double, arguments converted
    add<int>(5.5, 10.7);   // ✅ Forced: T = int, 5.5 and 10.7 truncated to 5 and 10
}
```

**Explanation:**
Explicit template arguments override deduction entirely. The compiler uses the specified type regardless of actual argument types, performing any necessary conversions. This is useful when deduction would fail (mismatched types) or when you want different behavior than the deduced type would provide.

**Key takeaway:** Angle bracket notation with explicit types overrides automatic template argument deduction.

---

#### Q10: What happens when you specialize a template for a pointer type using partial specialization?
**Difficulty:** #intermediate
**Category:** #specialization #pointers
**Concepts:** #partial_specialization #pointer_types #pattern_matching

**Answer:**
Partial specialization for pointers creates a template that matches any pointer type, binding the template parameter to the pointed-to type.

**Code example:**
```cpp
template<typename T>
struct IsPointer {
    static const bool value = false;
};

template<typename T>
struct IsPointer<T*> {  // ✅ Matches any pointer type
    static const bool value = true;
    using PointeeType = T;  // ✅ T is the pointed-to type
};

int main() {
    std::cout << IsPointer<int>::value << "\n";     // 0
    std::cout << IsPointer<int*>::value << "\n";    // 1
    std::cout << IsPointer<double**>::value << "\n"; // 1 (T = double*)
}
```

**Explanation:**
The `T*` pattern matches when the template argument is a pointer, with `T` binding to whatever type is pointed to. This works recursively—`double**` matches with `T=double*`. Partial specialization for pointers is commonly used in type traits and smart pointer implementations.

**Key takeaway:** Partial specialization with `T*` pattern matches any pointer, extracting the pointed-to type.

---

#### Q11: Can function templates have default template arguments? What are the restrictions?
**Difficulty:** #intermediate
**Category:** #syntax #function_templates
**Concepts:** #default_arguments #function_templates #declaration_vs_definition

**Answer:**
Function templates can have default template arguments, but only in declarations (not definitions unless inline). This differs from class templates where defaults can appear in definitions.

**Code example:**
```cpp
// ✅ Declaration with default
template<typename T = int>
void func(T value);

// ✅ Definition without default
template<typename T>
void func(T value) { std::cout << value << "\n"; }

// ✅ Inline definition can have default
template<typename T = int>
void inlineFunc(T value) { std::cout << value << "\n"; }

int main() {
    func(42);        // ✅ Deduced
    func<>(42);      // ✅ Uses default int
    inlineFunc<>(42); // ✅ Uses default int
}
```

**Explanation:**
The separation between declaration and definition exists because function templates can be declared multiple times (in different translation units) but defined once. Allowing defaults in definitions could create conflicts. Inline definitions combine declaration and definition, so defaults are permitted.

**Key takeaway:** Function template default arguments only appear in declarations, not separate definitions.

---

#### Q12: What is the "two-phase name lookup" in templates and why does it matter?
**Difficulty:** #advanced
**Category:** #compilation #name_lookup
**Concepts:** #two_phase_lookup #dependent_names #compilation_process

**Answer:**
Two-phase lookup means templates undergo two compilation passes: first checking template syntax at definition, second checking type-dependent code at instantiation.

**Code example:**
```cpp
void helper(int x) { std::cout << "int: " << x << "\n"; }

template<typename T>
void process(T x) {
    helper(x);  // ✅ Looked up at instantiation
    unknown();  // ❌ Error at definition (non-dependent name)
}

void helper(double x) { std::cout << "double: " << x << "\n"; }

int main() {
    process(42);    // ✅ Finds helper(int)
    process(3.14);  // ✅ Finds helper(double)
}
```

**Explanation:**
Non-dependent names (like `unknown()`) are looked up at definition time and must be visible then. Dependent names (like `helper(x)` where `x` has template type) are looked up at instantiation time using both normal lookup and Argument-Dependent Lookup (ADL). This allows templates to work with types defined after the template.

**Key takeaway:** Templates check non-dependent code at definition, dependent code at instantiation.

---

#### Q13: How do you create a compile-time constant array size using non-type template parameters?
**Difficulty:** #intermediate
**Category:** #template_parameters #arrays
**Concepts:** #non_type_parameters #compile_time_constants #fixed_size_arrays

**Answer:**
Use a non-type template parameter with an integral type to specify array size, enabling compile-time memory allocation and bounds checking.

**Code example:**
```cpp
template<typename T, size_t N>
class FixedArray {
    T data[N];  // ✅ Array allocated on stack, size known at compile time
public:
    constexpr size_t size() const { return N; }
    T& operator[](size_t i) { return data[i]; }
};

int main() {
    FixedArray<int, 5> arr;  // ✅ Stack-allocated array of 5 ints
    constexpr size_t sz = arr.size();  // ✅ Usable in constant expressions
}
```

**Explanation:**
Non-type parameters embed constant values in types, creating different types for different sizes. `FixedArray<int, 5>` and `FixedArray<int, 10>` are completely different types. The array size is known at compile time, enabling stack allocation and eliminating bounds-checking overhead when the compiler can verify safety.

**Key takeaway:** Non-type size parameters enable type-safe, zero-overhead fixed-size containers.

---

#### Q14: What is the difference between explicit specialization and explicit instantiation?
**Difficulty:** #advanced
**Category:** #specialization #instantiation
**Concepts:** #explicit_specialization #explicit_instantiation #compilation

**Answer:**
Explicit specialization provides a custom implementation for specific template arguments, while explicit instantiation forces the compiler to generate code for specific template arguments without specializing behavior.

**Code example:**
```cpp
template<typename T> struct Traits { static void print() { std::cout << "generic\n"; } };

// ✅ Explicit specialization - custom implementation
template<> struct Traits<int> { static void print() { std::cout << "int\n"; } };

// ✅ Explicit instantiation - force generation of template code
template struct Traits<double>;  // Generates Traits<double> in this translation unit

int main() {
    Traits<int>::print();     // int (specialized)
    Traits<double>::print();  // generic (instantiated but not specialized)
}
```

**Explanation:**
Specialization changes behavior for specific types; instantiation just generates the standard template code. Explicit instantiation is used to control where template code is generated, reducing compile times and binary size by preventing multiple instantiations across translation units.

**Key takeaway:** Specialization changes implementation; instantiation controls where code is generated.

---

#### Q15: How does partial specialization enable type trait implementations?
**Difficulty:** #advanced
**Category:** #type_traits #metaprogramming
**Concepts:** #partial_specialization #type_traits #compile_time_dispatch

**Answer:**
Partial specialization allows pattern matching on type properties, enabling compile-time type queries by providing different implementations for different type patterns.

**Code example:**
```cpp
// Primary template - default case
template<typename T>
struct RemovePointer {
    using type = T;
};

// Partial specialization - matches pointers
template<typename T>
struct RemovePointer<T*> {
    using type = T;  // ✅ Strips one level of pointer
};

int main() {
    RemovePointer<int>::type x = 42;       // int
    RemovePointer<int*>::type y = 42;      // int (pointer removed)
    RemovePointer<double**>::type* z = nullptr;  // double* (one level removed)
}
```

**Explanation:**
Type traits use partial specialization to detect type properties. The compiler selects the most specific specialization based on pattern matching. This enables compile-time type manipulation and conditional compilation. Standard library traits like `std::is_pointer`, `std::remove_reference`, and `std::decay` all use this technique.

**Key takeaway:** Partial specialization enables pattern matching on types for compile-time type queries and transformations.

---

#### Q16: Why can't you partially specialize function templates directly?
**Difficulty:** #advanced
**Category:** #language_design #function_templates
**Concepts:** #partial_specialization #function_templates #overloading

**Answer:**
Function templates cannot be partially specialized because function overloading already provides equivalent functionality, and allowing both would create ambiguous and complex overload resolution rules.

**Code example:**
```cpp
// ❌ Cannot do this (partial specialization of function)
// template<typename T> void func(T*) { }

// ✅ Use overloading instead
template<typename T> void func(T) { std::cout << "generic\n"; }
template<typename T> void func(T*) { std::cout << "pointer\n"; }  // Overload for pointers

int main() {
    int x = 42;
    func(x);    // generic
    func(&x);   // pointer
}
```

**Explanation:**
Function template overloading achieves the same goals as partial specialization would, without adding complexity. The compiler selects the most specific overload based on argument types. Allowing partial specialization would create two overlapping mechanisms for the same purpose, complicating overload resolution and template argument deduction.

**Key takeaway:** Use function template overloading instead of partial specialization for functions.

---

#### Q17: What happens when multiple partial specializations match a template instantiation equally well?
**Difficulty:** #advanced
**Category:** #specialization #error_handling
**Concepts:** #partial_specialization #ambiguity #compilation_errors

**Answer:**
If multiple partial specializations match equally well with no clear "most specific" choice, compilation fails with an ambiguity error.

**Code example:**
```cpp
template<typename T, typename U> struct Test { };

template<typename T> struct Test<T, int> { };    // Specialization 1
template<typename T> struct Test<int, T> { };    // Specialization 2

int main() {
    Test<double, int> t1;  // ✅ OK: Specialization 1 matches
    Test<int, double> t2;  // ✅ OK: Specialization 2 matches
    // Test<int, int> t3;  // ❌ Error: Both specializations match equally
}
```

**Explanation:**
For `Test<int, int>`, both specializations match perfectly with no way to prefer one over the other. The compiler cannot arbitrarily choose, so it reports an ambiguity error. You must provide an additional full specialization to resolve the ambiguity: `template<> struct Test<int, int> { };`.

**Key takeaway:** Ambiguous partial specialization matches require explicit full specialization to resolve.

---

#### Q18: How do you use template metaprogramming to compute values at compile time?
**Difficulty:** #advanced
**Category:** #metaprogramming #compile_time_computation
**Concepts:** #template_metaprogramming #non_type_parameters #recursion #constexpr

**Answer:**
Template metaprogramming uses recursive template instantiation with specialization for base cases, computing results as static member values.

**Code example:**
```cpp
template<unsigned N>
struct Fibonacci {
    static constexpr unsigned value = Fibonacci<N-1>::value + Fibonacci<N-2>::value;
};

template<> struct Fibonacci<0> { static constexpr unsigned value = 0; };
template<> struct Fibonacci<1> { static constexpr unsigned value = 1; };

int main() {
    constexpr unsigned fib10 = Fibonacci<10>::value;  // 55 (computed at compile time)
    int arr[Fibonacci<7>::value];  // ✅ Can use in array size (13 elements)
}
```

**Explanation:**
Each template instantiation triggers instantiation of its dependencies, creating a compile-time recursion that terminates at specialized base cases. The compiler evaluates the entire computation during compilation, generating no runtime code. This technique predates `constexpr` functions but is more limited and harder to read.

**Key takeaway:** Template recursion with specialization enables compile-time computation of complex values.

---

#### Q19: What are the advantages and disadvantages of using templates compared to runtime polymorphism?
**Difficulty:** #intermediate
**Category:** #design_pattern #performance
**Concepts:** #static_polymorphism #virtual_functions #performance #code_bloat

**Answer:**
Templates provide zero-overhead static polymorphism with compile-time type checking but increase compile times and binary size. Virtual functions offer flexible runtime polymorphism with uniform code size but incur vtable lookup overhead.

**Code example:**
```cpp
// ✅ Template approach (static polymorphism)
template<typename Shape>
double area(const Shape& s) { return s.area(); }  // No vtable, inline-able

// ✅ Virtual function approach (runtime polymorphism)
struct ShapeBase { virtual double area() const = 0; };  // Vtable pointer overhead
struct Circle : ShapeBase { double area() const override { return 3.14 * r * r; } };
```

**Explanation:**
Templates generate specialized code for each type, enabling inlining and eliminating indirection, but creating multiple copies of code (code bloat). Virtual functions use a single implementation with dynamic dispatch, keeping binary size smaller but adding runtime overhead and preventing many optimizations. Choose templates for performance-critical code with known types; choose virtual functions for extensible type hierarchies and plugin architectures.

**Key takeaway:** Templates offer zero-overhead abstraction; virtual functions offer runtime flexibility and smaller code size.

---

#### Q20: How do default template arguments interact with template argument deduction in function templates?
**Difficulty:** #intermediate
**Category:** #type_deduction #default_arguments
**Concepts:** #default_arguments #type_deduction #template_parameters

**Answer:**
Default template arguments are used only when explicit template arguments are provided but incomplete; they don't participate in deduction from function arguments.

**Code example:**
```cpp
template<typename T, typename U = int>
void func(T t) { std::cout << sizeof(U) << "\n"; }

int main() {
    func(42);          // ✅ T deduced as int, U defaults to int
    func<double>(3.14); // ✅ T = double, U defaults to int
    func<float, long>(1.0f); // ✅ T = float, U = long (both explicit)
}
```

**Explanation:**
When you call `func(42)`, the compiler deduces `T=int` from the argument but has no information to deduce `U`, so it uses the default `int`. Defaults only apply to parameters not deduced and not explicitly specified. If you write `func<double>(3.14)`, you explicitly set `T=double` and leave `U` to use its default.

**Key takeaway:** Default template arguments apply to undeduced/unspecified parameters, not to deduction results.

---
