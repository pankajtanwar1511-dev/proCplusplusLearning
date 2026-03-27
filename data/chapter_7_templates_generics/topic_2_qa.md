## TOPIC: Advanced Template Techniques - SFINAE and CRTP

### INTERVIEW_QA: SFINAE and CRTP Deep Dive

#### Q1: What does SFINAE stand for and what is its fundamental purpose?
**Difficulty:** #beginner
**Category:** #fundamentals #sfinae
**Concepts:** #sfinae #template_metaprogramming #overload_resolution

**Answer:**
SFINAE stands for "Substitution Failure Is Not An Error," a C++ rule where failed template parameter substitution removes that template from the overload set rather than causing compilation errors.

**Explanation:**
When the compiler evaluates template candidates, it attempts to substitute template arguments into each template. If substitution produces invalid code (like accessing a non-existent member), SFINAE prevents this from being a hard error. Instead, the compiler discards that candidate and continues with other overloads. This mechanism enables conditional template instantiation based on type properties, forming the foundation for C++11 type traits and compile-time dispatch. Only if all candidates fail does compilation error occur.

**Key takeaway:** SFINAE allows templates to "fail gracefully" during substitution, enabling type-based template selection.

---

#### Q2: Why is std::enable_if commonly used in return types rather than function parameters?
**Difficulty:** #intermediate
**Category:** #sfinae #design_pattern
**Concepts:** #enable_if #return_type_sfinae #function_parameters

**Answer:**
Using `enable_if` in return types keeps function signatures clean and doesn't affect function call syntax, while parameter-based approaches alter the calling interface and can cause ambiguity.

**Code example:**
```cpp
// ✅ Return type approach - clean call syntax
template<typename T>
typename std::enable_if<std::is_integral<T>::value>::type
func(T val) { }

// ❌ Parameter approach - requires extra dummy argument
template<typename T>
void func(T val, typename std::enable_if<std::is_integral<T>::value>::type* = nullptr) { }

func(42);  // Clean call - no dummy argument visible
```

**Explanation:**
Return type SFINAE doesn't change how you call the function, making it transparent to users. Parameter-based SFINAE adds extra parameters (often defaulted pointers) that clutter the signature and can cause overload resolution issues. However, return type SFINAE can't be used with constructors or operators with fixed return types, where parameter or template parameter SFINAE is necessary.

**Key takeaway:** Return type `enable_if` provides cleaner interfaces than parameter-based SFINAE.

---

#### Q3: What is the "immediate context" rule in SFINAE?
**Difficulty:** #advanced
**Category:** #sfinae #compilation
**Concepts:** #immediate_context #hard_errors #substitution_failure

**Answer:**
SFINAE only applies to errors in the immediate context of template substitution in function signatures. Errors in function bodies or called functions are hard errors that stop compilation.

**Code example:**
```cpp
template<typename T>
typename std::enable_if<sizeof(T) > 4>::type  // ✅ SFINAE applies here
func(T val) {
    typename T::nonexistent;  // ❌ Hard error if instantiated, not SFINAE
}

template<typename T>
void helper() {
    typename T::invalid;  // ❌ Hard error
}

template<typename T>
auto func2(T val) -> decltype(helper<T>()) { }  // ✅ SFINAE if helper fails
```

**Explanation:**
The immediate context includes the function signature, template parameter list, and return type declaration. Errors outside this context (like in the function body) aren't subject to SFINAE. However, using `decltype` in the return type can make errors in other templates part of the immediate context, enabling SFINAE for them. This subtlety affects what can and cannot be detected via SFINAE.

**Key takeaway:** SFINAE only covers signature substitution errors, not function body errors.

---

#### Q4: How does expression SFINAE with decltype work?
**Difficulty:** #intermediate
**Category:** #sfinae #advanced_techniques
**Concepts:** #expression_sfinae #decltype #member_detection

**Answer:**
Expression SFINAE uses `decltype` to check if an expression is valid for a type. If the expression is ill-formed, SFINAE removes that overload.

**Code example:**
```cpp
template<typename T>
auto hasSize(int) -> decltype(std::declval<T>().size(), std::true_type{}) {
    return std::true_type{};  // ✅ Enabled if T::size() exists
}

template<typename T>
std::false_type hasSize(...) {  // ✅ Fallback
    return std::false_type{};
}

std::cout << decltype(hasSize<std::vector<int>>(0))::value << "\n";  // 1
std::cout << decltype(hasSize<int>(0))::value << "\n";               // 0
```

**Explanation:**
The `decltype` examines whether `std::declval<T>().size()` is valid. `std::declval<T>()` creates a "fake" object of type `T` for use in unevaluated contexts. The comma operator evaluates both expressions but returns the type of the second (`std::true_type{}`). If `.size()` doesn't exist, SFINAE removes this overload, leaving the fallback. The `int` vs `...` parameter creates overload priority.

**Key takeaway:** Expression SFINAE with `decltype` detects whether specific expressions compile for a type.

---

#### Q5: What is CRTP and what problem does it solve?
**Difficulty:** #intermediate
**Category:** #crtp #design_pattern
**Concepts:** #crtp #static_polymorphism #inheritance

**Answer:**
CRTP (Curiously Recurring Template Pattern) is a pattern where a class inherits from a template instantiated with itself, enabling static polymorphism without virtual function overhead.

**Code example:**
```cpp
template<typename Derived>
class Base {
public:
    void interface() {
        static_cast<Derived*>(this)->implementation();  // ✅ Static dispatch
    }
};

class Derived : public Base<Derived> {
public:
    void implementation() { std::cout << "Derived\n"; }
};
```

**Explanation:**
CRTP solves the performance cost of runtime polymorphism (virtual functions) by moving dispatch to compile time. The base class casts `this` to the derived type and calls derived methods directly. This enables inlining and eliminates vtable lookups. The pattern is used for mixins, static interfaces, and compile-time policy classes. Unlike virtual functions, CRTP types don't share a common base, preventing accidental object slicing.

**Key takeaway:** CRTP provides zero-overhead compile-time polymorphism as an alternative to virtual functions.

---

#### Q6: Why can't you call a CRTP base class method through a base class pointer?
**Difficulty:** #intermediate
**Category:** #crtp #polymorphism
**Concepts:** #static_polymorphism #type_safety #pointer_casting

**Answer:**
CRTP uses static dispatch with `static_cast`, not dynamic dispatch. Base class pointers don't share a common type, and the cast requires exact type knowledge at compile time.

**Code example:**
```cpp
template<typename Derived>
class Base {
public:
    void func() { static_cast<Derived*>(this)->impl(); }
};

class D1 : public Base<D1> { public: void impl() { } };
class D2 : public Base<D2> { public: void impl() { } };

int main() {
    // Base<D1>* ptr1 = new D1();  // ✅ OK
    // ptr1->func();                // ✅ OK
    
    // Base<?>* ptr = ???;  // ❌ No common base type between Base<D1> and Base<D2>
}
```

**Explanation:**
`Base<D1>` and `Base<D2>` are completely different types with no inheritance relationship. You can't have a pointer to "any CRTP base" because there's no common base class. CRTP sacrifices runtime flexibility for compile-time performance. If you need runtime polymorphism with a common base, use virtual functions instead of CRTP.

**Key takeaway:** CRTP types don't share a common base, preventing polymorphic pointer usage.

---

#### Q7: What happens if you forget to implement a method required by a CRTP base class?
**Difficulty:** #intermediate
**Category:** #crtp #error_handling
**Concepts:** #compile_time_errors #static_cast #undefined_behavior

**Answer:**
Compilation fails when the base class attempts to call the missing method via `static_cast`, producing an error that the method doesn't exist in the derived class.

**Code example:**
```cpp
template<typename Derived>
class Base {
public:
    void doWork() {
        static_cast<Derived*>(this)->requiredMethod();  // ❌ Error if missing
    }
};

class Incomplete : public Base<Incomplete> {
    // Missing requiredMethod()
};

int main() {
    Incomplete obj;
    // obj.doWork();  // ❌ Error: no member named 'requiredMethod' in 'Incomplete'
}
```

**Explanation:**
The error occurs at the point where `doWork()` is called and the template is instantiated. The compiler attempts to generate code for the `static_cast` and method call, discovering the method doesn't exist. This is similar to duck typing — the derived class must "quack like" the interface expected by the base. Pre-C++20, there was no clean way to enforce these requirements at definition time rather than use time.

**Key takeaway:** CRTP interface requirements are checked only when methods are called, not at inheritance time.

---

#### Q8: How do you use SFINAE to detect if a type has a specific member function?
**Difficulty:** #advanced
**Category:** #sfinae #metaprogramming
**Concepts:** #member_detection #expression_sfinae #decltype

**Answer:**
Use expression SFINAE with `decltype` and `std::declval` to check if calling the member function is valid, with a fallback overload for types without the member.

**Code example:**
```cpp
template<typename T>
auto hasReserve(int) -> decltype(std::declval<T>().reserve(0), std::true_type{}) {
    return std::true_type{};
}

template<typename T>
std::false_type hasReserve(...) {
    return std::false_type{};
}

std::cout << decltype(hasReserve<std::vector<int>>(0))::value << "\n";  // 1
std::cout << decltype(hasReserve<std::list<int>>(0))::value << "\n";    // 0
```

**Explanation:**
`std::declval<T>()` creates a "reference" to `T` in an unevaluated context without constructing an object. The `decltype` checks if `.reserve(0)` would be valid. If not, SFINAE removes this overload. The `int` parameter gives it priority over the `...` fallback. The comma operator ensures the return type is `std::true_type` regardless of what `reserve()` returns. This pattern detects any member function, nested type, or expression validity.

**Key takeaway:** Expression SFINAE with `declval` and `decltype` detects member function existence at compile time.

---

#### Q9: What is tag dispatch and how does it differ from SFINAE?
**Difficulty:** #intermediate
**Category:** #design_pattern #dispatch
**Concepts:** #tag_dispatch #sfinae #compile_time_dispatch

**Answer:**
Tag dispatch passes type-based tags to select overloads, while SFINAE uses template parameter substitution failure. Tag dispatch is often cleaner and more readable.

**Code example:**
```cpp
// Tag dispatch approach
template<typename T>
void processImpl(T val, std::true_type) { std::cout << "integral\n"; }

template<typename T>
void processImpl(T val, std::false_type) { std::cout << "other\n"; }

template<typename T>
void process(T val) {
    processImpl(val, std::is_integral<T>{});  // ✅ Dispatch via tag
}

// SFINAE approach
template<typename T>
typename std::enable_if<std::is_integral<T>::value>::type
process(T val) { std::cout << "integral\n"; }
```

**Explanation:**
Tag dispatch creates a tag object (like `std::true_type{}` or `std::false_type{}`) and passes it to implementation functions that overload on the tag type. This is simpler than SFINAE's `enable_if` syntax and produces clearer error messages. However, SFINAE can handle cases where tag dispatch would require many overloads. Tag dispatch is preferred when there are few discrete cases; SFINAE is better for complex conditionals.

**Key takeaway:** Tag dispatch uses value objects to select overloads; SFINAE uses type substitution failure.

---

#### Q10: Can you use CRTP with private inheritance? What changes?
**Difficulty:** #advanced
**Category:** #crtp #inheritance
**Concepts:** #private_inheritance #access_control #interface_hiding

**Answer:**
Yes, private CRTP inheritance works and hides the base interface from external users while keeping it accessible to the derived class.

**Code example:**
```cpp
template<typename Derived>
class Counter {
protected:
    Counter() { ++count; }
    static inline int count = 0;
public:
    static int getCount() { return count; }
};

class Widget : private Counter<Widget> {  // ✅ Private inheritance
public:
    using Counter::getCount;  // ✅ Explicitly expose this method
};

int main() {
    Widget w;
    std::cout << Widget::getCount() << "\n";  // 1
    // Counter<Widget>* ptr = &w;  // ❌ Error: private base
}
```

**Explanation:**
Private inheritance makes the base class an implementation detail. External code can't access base methods unless explicitly exposed via `using` declarations. This is useful when the CRTP base provides internal functionality (like instance counting) that shouldn't be part of the public interface. The `static_cast` in the base still works because it's inside the base class itself.

**Key takeaway:** Private CRTP inheritance hides base functionality, exposing only what the derived class explicitly chooses.

---

#### Q11: What is the difference between SFINAE and C++20 concepts?
**Difficulty:** #advanced
**Category:** #language_evolution #concepts
**Concepts:** #sfinae #concepts #compile_time_constraints

**Answer:**
Concepts provide explicit, named constraints on template parameters with clear error messages, while SFINAE relies on substitution failure with cryptic errors. Concepts are the modern replacement for SFINAE-based constraints.

**Code example:**
```cpp
// SFINAE (pre-C++20)
template<typename T>
typename std::enable_if<std::is_integral<T>::value>::type
func(T val) { }

// Concepts (C++20)
template<typename T>
requires std::integral<T>
void func(T val) { }

// Or:
template<std::integral T>
void func(T val) { }
```

**Explanation:**
SFINAE requires complex `enable_if` machinery and produces error messages that reference substitution failures. Concepts provide first-class syntax for template constraints with human-readable errors. However, SFINAE is still useful for detecting capabilities (like "has member function") where concepts would be verbose. Many C++20 libraries use concepts for interface constraints and SFINAE for implementation details.

**Key takeaway:** Concepts are cleaner and clearer than SFINAE for constraining template interfaces.

---

#### Q12: How do you combine multiple SFINAE conditions with logical operators?
**Difficulty:** #advanced
**Category:** #sfinae #metaprogramming
**Concepts:** #logical_operators #enable_if #type_traits

**Answer:**
Use logical type traits like `std::conjunction`, `std::disjunction`, or manual `&&`/`||` operators within `enable_if` conditions.

**Code example:**
```cpp
// Requires: arithmetic AND not bool
template<typename T>
typename std::enable_if<
    std::is_arithmetic<T>::value && !std::is_same<T, bool>::value
>::type
func(T val) { std::cout << "arithmetic non-bool\n"; }

// C++17 version with conjunction
template<typename T>
typename std::enable_if<
    std::conjunction<std::is_arithmetic<T>, std::negation<std::is_same<T, bool>>>::value
>::type
func2(T val) { std::cout << "arithmetic non-bool\n"; }
```

**Explanation:**
Multiple conditions combine with standard logical operators (`&&`, `||`, `!`) inside `enable_if`. C++17 added `std::conjunction` (AND), `std::disjunction` (OR), and `std::negation` (NOT) for cleaner metaprogramming. These short-circuit during evaluation, avoiding unnecessary instantiations. Complex conditions can also be pre-computed in helper type traits to improve readability.

**Key takeaway:** Combine SFINAE conditions with logical operators or C++17 logical type traits.

---

#### Q13: What are the dangers of using CRTP with virtual functions?
**Difficulty:** #advanced
**Category:** #crtp #polymorphism
**Concepts:** #virtual_functions #static_dispatch #undefined_behavior

**Answer:**
Mixing CRTP static dispatch with virtual functions can cause confusion and bugs. If the base class uses virtual functions, the CRTP `static_cast` bypasses dynamic dispatch, potentially calling wrong implementations.

**Code example:**
```cpp
template<typename Derived>
class Base {
public:
    virtual void func() {  // ❌ Virtual in CRTP is confusing
        static_cast<Derived*>(this)->impl();
    }
};

class D : public Base<D> {
public:
    void impl() { std::cout << "D\n"; }
};

int main() {
    D d;
    Base<D>* ptr = &d;
    ptr->func();  // Which dispatch? Virtual or static?
}
```

**Explanation:**
CRTP is designed for static dispatch to avoid virtual function overhead. Adding `virtual` to a CRTP base defeats its purpose and creates ambiguity about which dispatch mechanism is used. The `static_cast` in the base always resolves to the template parameter type, while virtual dispatch would use runtime type. Mixing these creates confusion and maintenance problems. Keep CRTP bases non-virtual and use pure CRTP or pure virtual, not both.

**Key takeaway:** Don't mix CRTP static dispatch with virtual functions—choose one polymorphism mechanism.

---

#### Q14: How do you use SFINAE in template parameter lists instead of return types?
**Difficulty:** #intermediate
**Category:** #sfinae #syntax
**Concepts:** #template_parameters #enable_if #default_arguments

**Answer:**
Add a defaulted template parameter using `enable_if` to enable/disable the template based on conditions, keeping the return type clean.

**Code example:**
```cpp
template<typename T, 
         typename = typename std::enable_if<std::is_integral<T>::value>::type>
void func(T val) {
    std::cout << val << " is integral\n";
}

template<typename T,
         typename = typename std::enable_if<!std::is_integral<T>::value>::type>
void func(T val) {
    std::cout << val << " is not integral\n";
}

// ❌ This creates ambiguity! Need to differentiate the template parameters:

template<typename T, 
         typename std::enable_if<std::is_integral<T>::value, int>::type = 0>
void func2(T val) { std::cout << "integral\n"; }

template<typename T,
         typename std::enable_if<!std::is_integral<T>::value, long>::type = 0>
void func2(T val) { std::cout << "not integral\n"; }
```

**Explanation:**
Template parameter SFINAE moves `enable_if` out of the return type. However, multiple overloads with the same defaulted parameter type can cause ambiguity. The solution is to vary the default type or value (`int = 0` vs `long = 0`) to create distinct template signatures. This approach is useful for constructors and operators where return type SFINAE isn't applicable.

**Key takeaway:** Template parameter SFINAE requires careful handling to avoid ambiguous overload signatures.

---

#### Q15: What is the return type of decltype(std::declval<T>().func()) and why is it useful for SFINAE?
**Difficulty:** #advanced
**Category:** #sfinae #type_deduction
**Concepts:** #decltype #declval #return_type_deduction

**Answer:**
It's the return type of `T::func()`, allowing detection of member functions and their return types in unevaluated contexts without constructing T objects.

**Code example:**
```cpp
template<typename T>
auto callFunc(T& obj) -> decltype(obj.func()) {
    return obj.func();  // ✅ Returns whatever func() returns
}

// Won't compile if T doesn't have func()
// callFunc(42);  // ❌ int has no func()

struct WithFunc {
    int func() { return 42; }
};

WithFunc obj;
int result = callFunc(obj);  // ✅ Returns int
```

**Explanation:**
`decltype(std::declval<T>().func())` deduces the return type of `func()` without evaluating the expression. `std::declval<T>()` creates a "reference" to `T` in an unevaluated context, enabling `decltype` to examine members even if `T` isn't constructible. If `func()` doesn't exist, SFINAE removes this overload. This technique enables perfect forwarding of return types and conditional compilation based on member function properties.

**Key takeaway:** `decltype` with `declval` deduces return types and enables SFINAE without evaluating expressions.

---

#### Q16: How do CRTP mixins avoid the diamond problem?
**Difficulty:** #advanced
**Category:** #crtp #multiple_inheritance
**Concepts:** #diamond_inheritance #multiple_inheritance #crtp

**Answer:**
CRTP mixins avoid the diamond problem because each mixin is instantiated with the derived class as a template parameter, creating separate base class instances rather than a shared base.

**Code example:**
```cpp
template<typename Derived>
class Printable {
public:
    void print() { std::cout << "print\n"; }
};

template<typename Derived>
class Serializable {
public:
    void serialize() { std::cout << "serialize\n"; }
};

class MyClass : public Printable<MyClass>, public Serializable<MyClass> {
    // ✅ No diamond: Printable<MyClass> and Serializable<MyClass> are unrelated
};
```

**Explanation:**
The diamond problem occurs when multiple inheritance paths lead to a shared base class. With CRTP, `Printable<MyClass>` and `Serializable<MyClass>` are completely different types with no common base. Even if both inherited from some `Base<Derived>`, they'd be separate instantiations: `Base<MyClass>` appears twice, not once. Virtual inheritance isn't needed because there's no shared base to worry about. Each CRTP mixin is independent.

**Key takeaway:** CRTP naturally avoids diamond inheritance because template instantiations are distinct types.

---

#### Q17: What is the difference between SFINAE and static_assert for compile-time checks?
**Difficulty:** #intermediate
**Category:** #compile_time_checks #error_handling
**Concepts:** #sfinae #static_assert #overload_resolution

**Answer:**
SFINAE silently removes template candidates from overload resolution, while `static_assert` produces hard errors. Use SFINAE for conditional instantiation and `static_assert` for constraint enforcement.

**Code example:**
```cpp
// SFINAE - removes overload if condition false
template<typename T>
typename std::enable_if<std::is_integral<T>::value>::type
func(T val) { }  // ✅ Not an error if not integral, just removed

// static_assert - hard error if condition false
template<typename T>
void func2(T val) {
    static_assert(std::is_integral<T>::value, "T must be integral");  // ❌ Hard error
}

func(3.14);   // ✅ No error, just no matching function
func2(3.14);  // ❌ static_assert fails with error message
```

**Explanation:**
SFINAE enables overload selection by removing non-matching templates without errors. `static_assert` enforces requirements with clear error messages when violated. Use SFINAE when you have alternative overloads for different types. Use `static_assert` when there's only one implementation and you want to enforce constraints with helpful diagnostics. C++20 concepts combine benefits of both.

**Key takeaway:** SFINAE enables conditional compilation; `static_assert` enforces requirements with errors.

---

#### Q18: Can you use CRTP to implement the Singleton pattern? How?
**Difficulty:** #advanced
**Category:** #crtp #design_pattern
**Concepts:** #singleton #crtp #static_members

**Answer:**
Yes, CRTP can provide singleton functionality to any derived class by implementing instance management in the CRTP base, with each derived class getting its own singleton instance.

**Code example:**
```cpp
template<typename Derived>
class Singleton {
protected:
    Singleton() = default;
    ~Singleton() = default;
public:
    Singleton(const Singleton&) = delete;
    Singleton& operator=(const Singleton&) = delete;
    
    static Derived& instance() {
        static Derived inst;  // ✅ Thread-safe in C++11
        return inst;
    }
};

class Database : public Singleton<Database> {
    friend class Singleton<Database>;  // Allow base to construct
private:
    Database() { std::cout << "Database created\n"; }
};

int main() {
    Database& db1 = Database::instance();
    Database& db2 = Database::instance();  // Same instance
    std::cout << (&db1 == &db2) << "\n";   // 1 (true)
}
```

**Explanation:**
The CRTP base provides singleton infrastructure that each derived class inherits. `Singleton<Database>` has its own static instance variable separate from `Singleton<Logger>`. The derived class must friend the base to allow it to call the private constructor. This approach lets any class become a singleton by simply inheriting from the CRTP base.

**Key takeaway:** CRTP Singleton provides reusable singleton infrastructure for any derived class.

---

#### Q19: What happens if you try to use SFINAE on a non-dependent type?
**Difficulty:** #advanced
**Category:** #sfinae #compilation
**Concepts:** #dependent_types #two_phase_lookup #sfinae

**Answer:**
SFINAE doesn't apply to non-dependent types because they're checked at template definition time, before substitution occurs. This causes immediate hard errors.

**Code example:**
```cpp
template<typename T>
typename std::enable_if<sizeof(int) > 10>::type  // ❌ Non-dependent condition
func(T val) { }

// Always false, evaluated at definition time, not instantiation
// This template definition would be accepted but never usable

template<typename T>
typename std::enable_if<sizeof(T) > 4>::type  // ✅ Dependent on T
func2(T val) { }  // SFINAE applies at instantiation
```

**Explanation:**
Non-dependent expressions (those not involving template parameters) are evaluated during template definition. If `sizeof(int) > 10` is false (it always is), this overload could never be instantiated, but the compiler accepts the definition. SFINAE only applies to dependent expressions that are evaluated during substitution at instantiation time. Always ensure SFINAE conditions depend on template parameters.

**Key takeaway:** SFINAE requires conditions dependent on template parameters to work correctly.

---

#### Q20: How do you use CRTP to implement compile-time polymorphic algorithms?
**Difficulty:** #advanced
**Category:** #crtp #algorithms
**Concepts:** #static_polymorphism #algorithm_design #crtp

**Answer:**
Implement the algorithm in the CRTP base using static dispatch to call derived-specific operations, enabling customization without virtual function overhead.

**Code example:**
```cpp
template<typename Derived>
class SortAlgorithm {
public:
    template<typename Container>
    void sort(Container& cont) {
        std::cout << "Starting sort...\n";
        auto begin = cont.begin();
        auto end = cont.end();
        static_cast<Derived*>(this)->sortImpl(begin, end);  // ✅ Customization point
        std::cout << "Sort complete.\n";
    }
};

class QuickSort : public SortAlgorithm<QuickSort> {
public:
    template<typename Iterator>
    void sortImpl(Iterator begin, Iterator end) {
        std::cout << "Using QuickSort\n";
        std::sort(begin, end);  // Use std::sort as example
    }
};

class BubbleSort : public SortAlgorithm<BubbleSort> {
public:
    template<typename Iterator>
    void sortImpl(Iterator begin, Iterator end) {
        std::cout << "Using BubbleSort\n";
        // Bubble sort implementation
    }
};

int main() {
    std::vector<int> data = {3, 1, 4, 1, 5};
    QuickSort qs;
    qs.sort(data);  // Starting sort... Using QuickSort Sort complete.
}
```

**Explanation:**
The CRTP base implements the common algorithm structure (the "template method"), calling `sortImpl` via static dispatch to get the derived-specific behavior. Each derived class provides its own implementation. This achieves the Template Method design pattern at compile time with zero overhead. The compiler can inline everything, unlike virtual functions which prevent many optimizations.

**Key takeaway:** CRTP enables compile-time polymorphic algorithms with the Template Method pattern.

---
