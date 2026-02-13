## TOPIC: Advanced Template Techniques - SFINAE and CRTP

### THEORY_SECTION: SFINAE and Compile-Time Dispatch

#### 1. SFINAE - Substitution Failure Is Not An Error and How It Works

**SFINAE** stands for "Substitution Failure Is Not An Error" — a fundamental C++ template principle where failed template parameter substitution during overload resolution doesn't cause compilation errors. Instead, the compiler silently removes that template from the candidate set and continues evaluating other overloads.

**SFINAE Mechanism - Step by Step:**

| Phase | What Happens | Result | Example |
|-------|--------------|--------|---------|
| **1. Template Candidate Identification** | Compiler finds all matching template names | Candidate set created | `func<int>`, `func<double>` candidates for `func` |
| **2. Template Argument Substitution** | Replace template parameters with actual types | Types substituted into signature | `T` → `int`, check if `int::value_type` exists |
| **3. Substitution Success** | All types/expressions valid | Template added to overload set | ✅ `std::enable_if<true>` has `::type` member |
| **4. Substitution Failure** | Invalid type or expression formed | Template silently removed (SFINAE) | ❌ `std::enable_if<false>` has no `::type` member |
| **5. Overload Resolution** | Select best match from remaining candidates | Function call resolved | Choose most specific overload |
| **6. No Candidates Remain** | All templates removed by SFINAE | ❌ Compilation error | "no matching function for call" |

**Where SFINAE Applies - The "Immediate Context" Rule:**

| Location | SFINAE Applies? | Reason | Example |
|----------|-----------------|--------|---------|
| **Function return type** | ✅ Yes | Part of signature | `typename enable_if<...>::type func()` |
| **Function parameter types** | ✅ Yes | Part of signature | `func(typename T::value_type)` |
| **Template parameter list** | ✅ Yes | Part of signature | `template<typename = enable_if<...>::type>` |
| **Trailing return type** | ✅ Yes | Part of signature | `auto func() -> decltype(...)` |
| **Function body** | ❌ No | Not in immediate context | Errors inside `{ }` are hard errors |
| **Called functions** | ❌ No (usually) | Outside immediate context | Errors in called functions fail compilation |
| **Nested class definitions** | ✅ Yes (if in signature) | Depends on location | `typename T::nested_type` in return type |

**Code Example - SFINAE in Action:**

```cpp
#include <type_traits>
#include <iostream>

// ✅ Overload 1: Enabled for integral types
template<typename T>
typename std::enable_if<std::is_integral<T>::value, void>::type
process(T value) {
    std::cout << value << " is integral\n";
}

// ✅ Overload 2: Enabled for floating-point types
template<typename T>
typename std::enable_if<std::is_floating_point<T>::value, void>::type
process(T value) {
    std::cout << value << " is floating-point\n";
}

int main() {
    process(42);        // ✅ Overload 1 selected (integral)
    process(3.14);      // ✅ Overload 2 selected (floating-point)
    // process("text"); // ❌ Error: no matching function (both SFINAE'd out)
}
```

**SFINAE vs Hard Errors:**

```cpp
// ❌ WRONG: Error in function body (hard error, not SFINAE)
template<typename T>
void badExample(T value) {
    typename T::nonexistent_type x;  // ❌ Hard error if T is int
}

// ✅ CORRECT: Error in return type (SFINAE applies)
template<typename T>
typename T::value_type goodExample(T value) {
    return typename T::value_type{};  // Only instantiated if return type valid
}

int main() {
    // badExample(42);       // ❌ Hard error: int::nonexistent_type doesn't exist
    // goodExample(42);      // ✅ SFINAE: silently removed from candidates
    std::vector<int> vec;
    goodExample(vec);        // ✅ Works: std::vector has value_type
}
```

**SFINAE Failure Causes - What Triggers SFINAE:**

| Failure Type | Example | Explanation |
|--------------|---------|-------------|
| **Non-existent type member** | `typename T::value_type` when `T` = `int` | `int` has no nested type `value_type` |
| **Invalid type formation** | `T*` when `T` = `void` (in some contexts) | Cannot form pointer to void in certain contexts |
| **Access control violation** | `typename T::private_type` | Cannot access private members |
| **Ambiguous member** | `T::name` when multiple inherited `name` | Ambiguity in name lookup |
| **enable_if with false condition** | `std::enable_if<false>::type` | `type` member doesn't exist when condition is false |
| **Invalid expression** | `decltype(std::declval<T>().foo())` when no `foo()` | Expression `T::foo()` is ill-formed |
| **Array of references** | `T&[]` | Cannot create arrays of references |
| **Function returning array** | `int[5] func()` | Cannot return arrays by value |

**Benefits of SFINAE:**

| Benefit | Description | Use Case |
|---------|-------------|----------|
| **Conditional Instantiation** | Templates enabled only for certain types | Enable `sort()` only for types with `operator<` |
| **Graceful Degradation** | Provide fallback overloads for unsupported types | Generic `print()` with container-specific optimizations |
| **Type Introspection** | Detect type properties at compile time | Check if type has `.begin()` method |
| **Cleaner Interfaces** | Constraints invisible to users (pre-C++20) | Type constraints without explicit syntax |
| **Overload Resolution** | Select most appropriate overload automatically | Prefer specialized implementations over generic |

---

#### 2. std::enable_if and Expression SFINAE - Practical SFINAE Techniques

`std::enable_if` is the most common SFINAE tool, providing a clean mechanism to conditionally enable templates based on compile-time boolean conditions.

**std::enable_if Structure:**

```cpp
// Simplified implementation
template<bool Condition, typename T = void>
struct enable_if {
    // No 'type' member when Condition is false
};

template<typename T>
struct enable_if<true, T> {
    using type = T;  // 'type' member exists when Condition is true
};

// Usage:
typename std::enable_if<condition, ReturnType>::type  // Has ::type if condition true
```

**enable_if Placement Strategies:**

| Placement | Syntax | Pros | Cons | When to Use |
|-----------|--------|------|------|-------------|
| **Return Type** | `typename enable_if<C>::type func()` | Clean call syntax | Verbose return type | General functions |
| **Template Parameter** | `template<typename = enable_if<C>::type>` | Cleaner signature | Can cause ambiguity | Constructors, operators |
| **Function Parameter** | `func(T, enable_if<C>::type* = nullptr)` | Works everywhere | Extra dummy parameter | Compatibility with older code |
| **Trailing Return** | `auto func() -> enable_if<C>::type` | Modern syntax | C++11+ only | Modern codebases |
| **enable_if_t (C++14)** | `enable_if_t<C> func()` | Shortest syntax | Requires C++14 | New code |

**Code Example - Return Type SFINAE:**

```cpp
#include <type_traits>
#include <iostream>

// ✅ Enabled for pointer types
template<typename T>
typename std::enable_if<std::is_pointer<T>::value, void>::type
handleValue(T ptr) {
    std::cout << "Pointer value\n";
}

// ✅ Enabled for non-pointer types
template<typename T>
typename std::enable_if<!std::is_pointer<T>::value, void>::type
handleValue(T val) {
    std::cout << "Non-pointer value\n";
}

int main() {
    int x = 42;
    handleValue(&x);  // Pointer value
    handleValue(x);   // Non-pointer value
}
```

**Code Example - Template Parameter SFINAE:**

```cpp
#include <type_traits>
#include <iostream>

// ✅ Enabled for integral types
template<typename T,
         typename std::enable_if<std::is_integral<T>::value, int>::type = 0>
void process(T value) {
    std::cout << value << " (integral)\n";
}

// ✅ Enabled for floating-point types
template<typename T,
         typename std::enable_if<std::is_floating_point<T>::value, long>::type = 0>
void process(T value) {
    std::cout << value << " (floating)\n";
}

int main() {
    process(42);    // 42 (integral)
    process(3.14);  // 3.14 (floating)
}
```

**Expression SFINAE with decltype:**

Expression SFINAE uses `decltype` to check if an expression is valid for a type. This is more powerful than simple type trait checks because it can detect member functions, operators, and complex expressions.

**Code Example - Detecting Member Functions:**

```cpp
#include <type_traits>
#include <iostream>
#include <utility>  // std::declval

// ✅ Overload selected if T has a .size() member
template<typename T>
auto callSize(T& container, int)
    -> decltype(container.size()) {
    return container.size();  // Return type deduced from .size()
}

// ✅ Fallback overload for types without .size()
template<typename T>
size_t callSize(T& container, long) {
    return 0;  // Default value
}

int main() {
    std::vector<int> vec = {1, 2, 3, 4, 5};
    int arr[10];

    std::cout << callSize(vec, 0) << "\n";  // 5 (has .size())
    std::cout << callSize(arr, 0) << "\n";  // 0 (no .size(), uses fallback)
}
```

**Common Expression SFINAE Patterns:**

| Pattern | Purpose | Example |
|---------|---------|---------|
| **Member Function Detection** | Check if type has specific method | `decltype(std::declval<T>().foo())` |
| **Operator Detection** | Check if operator exists | `decltype(std::declval<T>() + std::declval<U>())` |
| **Nested Type Detection** | Check for nested typedef | `decltype(typename T::value_type{})` |
| **Callable Detection** | Check if type is callable | `decltype(std::declval<T>()(args))` |
| **Iterator Detection** | Check for iterator interface | `decltype(*std::declval<T>(), ++std::declval<T&>())` |
| **Return Type Deduction** | Match return type to expression | `auto func() -> decltype(expr)` |

**Comma Operator Trick in decltype:**

```cpp
// The comma operator evaluates left-to-right, returning the type of the last expression
template<typename T>
auto hasToString(int)
    -> decltype(
        std::declval<T>().to_string(),  // ✅ Check if to_string() exists
        std::true_type{}                 // ✅ Return type is std::true_type
    ) {
    return std::true_type{};
}

template<typename T>
std::false_type hasToString(...) {  // ✅ Fallback
    return std::false_type{};
}

// Usage:
struct WithToString { std::string to_string() { return "value"; } };
struct NoToString { };

static_assert(decltype(hasToString<WithToString>(0))::value, "");     // ✅ true
static_assert(!decltype(hasToString<NoToString>(0))::value, "");      // ✅ true
```

**Overload Priority with int vs ... vs long:**

```cpp
// Overload resolution priority: more specific > less specific
template<typename T>
auto detect(T& t, int)     // ✅ Priority 1 (most specific)
    -> decltype(t.method(), std::true_type{}) {
    return std::true_type{};
}

template<typename T>
auto detect(T& t, long)    // ✅ Priority 2 (intermediate)
    -> std::false_type {
    return std::false_type{};
}

template<typename T>
std::false_type detect(...);  // ✅ Priority 3 (least specific - catches all)

// Calling with literal 0:
// 0 can convert to int (exact match) > long (conversion) > ... (variadic)
```

**Combining Multiple Conditions:**

```cpp
// AND condition: both must be true
template<typename T>
typename std::enable_if<
    std::is_arithmetic<T>::value && !std::is_same<T, bool>::value,
    void
>::type
func(T value) {
    std::cout << "Arithmetic non-bool: " << value << "\n";
}

// C++17: std::conjunction for cleaner AND
template<typename T>
typename std::enable_if<
    std::conjunction<
        std::is_arithmetic<T>,
        std::negation<std::is_same<T, bool>>
    >::value,
    void
>::type
func2(T value) {
    std::cout << "Arithmetic non-bool: " << value << "\n";
}

int main() {
    func(42);       // ✅ Arithmetic non-bool: 42
    func(3.14);     // ✅ Arithmetic non-bool: 3.14
    // func(true);  // ❌ SFINAE removes this (bool excluded)
}
```

**std::declval - Creating "Fake" Objects for Unevaluated Contexts:**

```cpp
// std::declval<T>() creates a "reference" to T without constructing an object
// Only usable in unevaluated contexts (decltype, sizeof, noexcept, etc.)

template<typename T>
auto test() -> decltype(
    std::declval<T>().foo(),           // Call foo() on "fake" T object
    std::declval<T>().bar(42, "x"),    // Call bar() with arguments
    std::declval<const T&>().baz()     // Call baz() on const reference
) {
    // ... implementation
}

// This works even if T has no default constructor, private constructors, etc.
```

**SFINAE vs Tag Dispatch vs C++20 Concepts:**

| Technique | Syntax Complexity | Error Messages | Runtime Cost | When to Use |
|-----------|-------------------|----------------|--------------|-------------|
| **SFINAE (enable_if)** | ❌ High | ❌ Cryptic | ✅ Zero | Pre-C++20, complex conditions |
| **Expression SFINAE** | ❌ Very High | ❌ Very Cryptic | ✅ Zero | Detecting capabilities |
| **Tag Dispatch** | ✅ Low | ✅ Clear | ✅ Zero | Simple binary/ternary dispatch |
| **C++20 Concepts** | ✅ Very Low | ✅ Very Clear | ✅ Zero | C++20+, interface constraints |
| **static_assert** | ✅ Low | ✅ Custom message | ✅ Zero | Hard constraints (not overloading) |

---

#### 3. CRTP - Curiously Recurring Template Pattern for Static Polymorphism

**CRTP** (Curiously Recurring Template Pattern) is a design pattern where a class template takes a derived class as a template parameter: `class Derived : public Base<Derived>`. This enables **static polymorphism** — compile-time dispatch without virtual function overhead.

**CRTP Structure:**

```cpp
// Base class template parameterized by derived class
template<typename Derived>
class Base {
public:
    void interface() {
        // ✅ Static downcast to derived class
        Derived& derived = static_cast<Derived&>(*this);
        derived.implementation();  // ✅ Call derived implementation
    }
};

// Derived class inherits from Base<Derived>
class Derived : public Base<Derived> {
public:
    void implementation() {
        std::cout << "Derived implementation\n";
    }
};

int main() {
    Derived d;
    d.interface();  // ✅ Calls Derived::implementation() via static dispatch
}
```

**CRTP vs Virtual Functions - Performance Comparison:**

| Aspect | CRTP (Static Polymorphism) | Virtual Functions (Runtime Polymorphism) |
|--------|---------------------------|------------------------------------------|
| **Dispatch Mechanism** | ✅ Compile-time `static_cast` | ❌ Runtime vtable lookup |
| **Performance** | ✅ Zero overhead (inlining possible) | ❌ Indirect call + vtable lookup (1-2 cycles) |
| **Memory Overhead** | ✅ None | ❌ vtable pointer per object (8 bytes on 64-bit) |
| **Flexibility** | ❌ Types known at compile time | ✅ Runtime type switching |
| **Common Base Pointer** | ❌ No (Base<D1> ≠ Base<D2>) | ✅ Yes (all inherit from same base) |
| **Polymorphic Containers** | ❌ Cannot store mixed types | ✅ Can store `vector<Base*>` |
| **Inline Optimization** | ✅ Compiler can inline everything | ❌ Virtual calls prevent inlining |
| **Binary Size** | ❌ Larger (code duplication per type) | ✅ Smaller (single implementation) |
| **Error Detection** | ❌ Errors at instantiation time | ✅ Errors at definition time |

**Code Example - CRTP vs Virtual Performance:**

```cpp
// ❌ Virtual function approach (runtime overhead)
class VirtualBase {
public:
    virtual ~VirtualBase() = default;
    virtual int compute() = 0;  // Vtable lookup required
};

class VirtualDerived : public VirtualBase {
public:
    int compute() override { return 42; }
};

// ✅ CRTP approach (zero overhead)
template<typename Derived>
class CRTPBase {
public:
    int compute() {
        return static_cast<Derived*>(this)->computeImpl();  // ✅ Inlined
    }
};

class CRTPDerived : public CRTPBase<CRTPDerived> {
public:
    int computeImpl() { return 42; }  // ✅ Can be inlined
};

// Benchmark: CRTP is 10-30% faster in tight loops due to inlining + no vtable
```

**CRTP Common Patterns:**

| Pattern | Purpose | Example Use Case |
|---------|---------|------------------|
| **Static Interface** | Interface without virtual functions | Shape hierarchy for rendering |
| **Mixin Classes** | Add capabilities via inheritance | Printable, Serializable, Loggable |
| **Instance Counting** | Track object count per type | Resource management, diagnostics |
| **Singleton** | Reusable singleton infrastructure | Database connections, managers |
| **Template Method** | Algorithm structure with customization points | Sorting algorithms, parsers |
| **Enabled Comparison** | Provide comparison operators | Auto-generate `operator!=` from `operator==` |
| **Compile-Time Policies** | Inject behavior at compile time | Memory allocators, locking strategies |

**Code Example - CRTP Mixins:**

```cpp
// Mixin 1: Adds printing capability
template<typename Derived>
class Printable {
public:
    void print() const {
        std::cout << static_cast<const Derived*>(this)->toString() << "\n";
    }
};

// Mixin 2: Adds comparison capability
template<typename Derived>
class Comparable {
public:
    bool operator<(const Derived& other) const {
        return static_cast<const Derived*>(this)->compare(other) < 0;
    }

    bool operator>(const Derived& other) const {
        return other < static_cast<const Derived&>(*this);
    }
};

// Derived class gets both capabilities
class MyData : public Printable<MyData>, public Comparable<MyData> {
    int value_;
public:
    MyData(int v) : value_(v) { }

    std::string toString() const { return std::to_string(value_); }
    int compare(const MyData& other) const { return value_ - other.value_; }
};

int main() {
    MyData d1(10), d2(20);
    d1.print();            // 10
    std::cout << (d1 < d2) << "\n";  // 1 (true)
}
```

**Code Example - CRTP Instance Counter:**

```cpp
template<typename Derived>
class Counter {
    static inline int count = 0;  // ✅ C++17 inline static
protected:
    Counter() { ++count; }
    Counter(const Counter&) { ++count; }
    Counter(Counter&&) noexcept { ++count; }
    ~Counter() { --count; }
public:
    static int getCount() { return count; }
};

class Widget : public Counter<Widget> { };
class Gadget : public Counter<Gadget> { };

int main() {
    Widget w1, w2;
    Gadget g1;

    std::cout << Widget::getCount() << "\n";  // 2 (each type has its own counter)
    std::cout << Gadget::getCount() << "\n";  // 1
}
```

**CRTP Safety Considerations:**

| Issue | Problem | Solution |
|-------|---------|----------|
| **Wrong Template Parameter** | `class Wrong : public Base<OtherClass>` | ❌ UB when casting | Careful code review, naming conventions |
| **Incomplete Type** | `Base<Derived>` instantiated before `Derived` complete | Usually OK - base only casts, doesn't access members | Use `static_cast`, not member access in base |
| **Virtual Functions** | Mixing CRTP with virtual dispatch | Defeats CRTP purpose | Choose one: CRTP or virtual, not both |
| **Private Implementation** | Base can't call private derived methods | `friend class Base<Derived>` grants access | Add friend declaration |
| **Multiple Inheritance** | Diamond inheritance with CRTP | Each CRTP base is separate type - no diamond | No special handling needed |

**CRTP with Protected Interface (Template Method Pattern):**

```cpp
template<typename Derived>
class Algorithm {
protected:
    void step1() { std::cout << "Common step 1\n"; }
    void step3() { std::cout << "Common step 3\n"; }

public:
    void execute() {
        step1();  // ✅ Common implementation
        static_cast<Derived*>(this)->step2();  // ✅ Derived-specific
        step3();  // ✅ Common implementation
    }
};

class ConcreteAlgorithm : public Algorithm<ConcreteAlgorithm> {
    friend class Algorithm<ConcreteAlgorithm>;  // ✅ Grant access
private:
    void step2() { std::cout << "Custom step 2\n"; }
};

int main() {
    ConcreteAlgorithm algo;
    algo.execute();
    // Output:
    // Common step 1
    // Custom step 2
    // Common step 3
}
```

**When to Use CRTP:**

| Use CRTP When | Use Virtual Functions When |
|---------------|----------------------------|
| ✅ Types known at compile time | ✅ Runtime type switching needed |
| ✅ Performance critical (tight loops) | ✅ Polymorphic containers required |
| ✅ Want zero-overhead abstraction | ✅ Plugin architectures |
| ✅ Need mixins/composable functionality | ✅ Need common base pointer |
| ✅ Building libraries (STL-style) | ✅ Simpler code maintenance priority |
| ✅ Compile-time policies | ✅ Interface inheritance |

**Summary - SFINAE and CRTP Decision Tree:**

```
Need conditional template instantiation?
├─ YES → Use SFINAE
│  ├─ Simple type trait check? → std::enable_if
│  ├─ Detect member function? → Expression SFINAE (decltype + declval)
│  ├─ Binary choice? → Consider Tag Dispatch instead
│  └─ C++20 available? → Consider Concepts instead
│
└─ NO → Need compile-time polymorphism?
   ├─ YES → Use CRTP
   │  ├─ Add capabilities? → CRTP Mixins
   │  ├─ Track instances? → CRTP Instance Counter
   │  ├─ Algorithm customization? → CRTP Template Method
   │  └─ Singleton? → CRTP Singleton
   │
   └─ NO → Need runtime polymorphism? → Use Virtual Functions
```

---

### EDGE_CASES: Advanced SFINAE and CRTP Pitfalls

#### Edge Case 1: SFINAE Only Works in Immediate Context

SFINAE only applies to errors occurring directly during template parameter substitution in the function signature. Errors inside the function body or in called functions are hard errors that stop compilation.

```cpp
template<typename T>
typename std::enable_if<sizeof(T) > 4>::type  // ✅ SFINAE applies here
func(T val) {
    typename T::nonexistent_type x;  // ❌ Hard error if instantiated, not SFINAE
}
```

This limitation means SFINAE can't detect whether a function body would compile — only whether the signature can be formed. Errors in function bodies always cause compilation failure if the template is instantiated.

#### Edge Case 2: Expression SFINAE with decltype

C++11's `decltype` enables **expression SFINAE** — detecting whether specific expressions are valid for a type. This is more powerful than simple type checks.

```cpp
template<typename T>
auto hasToString(int) -> decltype(std::declval<T>().to_string(), std::true_type{}) {
    return std::true_type{};  // ✅ Enabled if T has to_string()
}

template<typename T>
std::false_type hasToString(...) {  // ✅ Fallback overload
    return std::false_type{};
}

struct A { std::string to_string() { return "A"; } };
struct B { };

int main() {
    std::cout << decltype(hasToString<A>(0))::value << "\n";  // 1 (true)
    std::cout << decltype(hasToString<B>(0))::value << "\n";  // 0 (false)
}
```

The comma operator in `decltype((expr1, expr2))` evaluates both expressions but returns the type of the second. This idiom checks if `expr1` is valid (triggering SFINAE if not) while controlling the return type via `expr2`.

#### Edge Case 3: SFINAE with Variadic Templates

SFINAE becomes complex with variadic templates, requiring careful attention to parameter pack expansion.

```cpp
template<typename... Args>
typename std::enable_if<(sizeof...(Args) > 2)>::type  // ✅ Enable if 3+ args
func(Args... args) {
    std::cout << "3+ arguments\n";
}

template<typename... Args>
typename std::enable_if<(sizeof...(Args) <= 2)>::type  // ✅ Enable if 0-2 args
func(Args... args) {
    std::cout << "0-2 arguments\n";
}

int main() {
    func(1);           // 0-2 arguments
    func(1, 2, 3);     // 3+ arguments
}
```

Parameter pack operators like `sizeof...` enable compile-time decisions based on argument counts. This pattern appears in tuple implementations and variadic forwarding functions.

#### Edge Case 4: CRTP with Multiple Inheritance

Using CRTP with multiple inheritance requires careful design to avoid ambiguous base class issues and ensure correct `static_cast` behavior.

```cpp
template<typename Derived>
struct LogMixin {
    void log(const std::string& msg) {
        static_cast<Derived*>(this)->logImpl(msg);  // ✅ Calls derived implementation
    }
};

template<typename Derived>
struct SerializeMixin {
    std::string serialize() {
        return static_cast<Derived*>(this)->serializeImpl();  // ✅ Calls derived
    }
};

class MyClass : public LogMixin<MyClass>, public SerializeMixin<MyClass> {
public:
    void logImpl(const std::string& msg) { std::cout << "LOG: " << msg << "\n"; }
    std::string serializeImpl() { return "{data}"; }
};
```

Each CRTP base must be instantiated with the same derived type. Multiple CRTP bases work fine as long as they don't create diamond inheritance or have conflicting member names.

#### Edge Case 5: CRTP Downcast Safety

The `static_cast<Derived*>(this)` in CRTP is only safe if the base is actually part of a `Derived` object. Incorrect usage creates undefined behavior.

```cpp
template<typename Derived>
struct Base {
    void interface() {
        static_cast<Derived*>(this)->impl();  // ✅ Safe only if 'this' points to Derived
    }
};

class Wrong : public Base<Wrong> { };
class AlsoWrong : public Base<Wrong> { };  // ❌ DANGER: Wrong is not AlsoWrong!

int main() {
    Wrong w;
    w.interface();  // ✅ Safe
    
    Base<Wrong>* ptr = new Wrong();
    ptr->interface();  // ✅ Safe
    
    // Base<AlsoWrong>* bad = new AlsoWrong();  // ❌ UB: cast to wrong type
}
```

Always ensure the template parameter matches the actual derived class. Mismatches create casts to wrong types, causing undefined behavior.

#### Edge Case 6: SFINAE with Overload Resolution Ambiguity

When multiple SFINAE-enabled overloads could match, overload resolution can become ambiguous, requiring additional SFINAE constraints.

```cpp
template<typename T>
typename std::enable_if<std::is_integral<T>::value>::type
process(T val) { std::cout << "integral\n"; }

template<typename T>
typename std::enable_if<std::is_floating_point<T>::value>::type
process(T val) { std::cout << "floating\n"; }

// template<typename T>
// typename std::enable_if<std::is_arithmetic<T>::value>::type  // ❌ Would be ambiguous!
// process(T val) { }

int main() {
    process(42);      // integral
    process(3.14);    // floating
    // process("x");  // ❌ Error: no matching function
}
```

Conditions must be mutually exclusive to avoid ambiguity. Overlapping conditions require additional constraints or a priority mechanism using SFINAE with overload ranking.

---

### CODE_EXAMPLES: SFINAE and CRTP Demonstrations

#### Example 1: Basic SFINAE with enable_if in Return Type

```cpp
#include <type_traits>
#include <iostream>

template<typename T>
typename std::enable_if<std::is_integral<T>::value>::type
processNumber(T val) {
    std::cout << val << " is integral\n";  // ✅ Only instantiated for integral types
}

template<typename T>
typename std::enable_if<std::is_floating_point<T>::value>::type
processNumber(T val) {
    std::cout << val << " is floating-point\n";  // ✅ Only instantiated for floating-point
}

int main() {
    processNumber(42);      // 42 is integral
    processNumber(3.14);    // 3.14 is floating-point
    // processNumber("hi"); // ❌ Error: no matching function
}
```

The `enable_if` in the return type removes non-matching overloads via SFINAE. When `condition` is false, `enable_if<condition>::type` doesn't exist, causing substitution failure. The compiler silently removes that overload and tries the next one.

#### Example 2: SFINAE with Template Parameter Default

```cpp
#include <type_traits>
#include <iostream>

template<typename T, typename = typename std::enable_if<std::is_pointer<T>::value>::type>
void handlePointer(T ptr) {
    std::cout << "Pointer type\n";  // ✅ Only enabled for pointer types
}

template<typename T, typename = typename std::enable_if<!std::is_pointer<T>::value>::type>
void handlePointer(T val) {
    std::cout << "Non-pointer type\n";  // ✅ Only enabled for non-pointer types
}

int main() {
    int x = 42;
    handlePointer(&x);  // Pointer type
    handlePointer(x);   // Non-pointer type
}
```

Using `enable_if` in a defaulted template parameter keeps the function signature clean. The unnamed template parameter (using `typename =`) serves only for SFINAE purposes without cluttering the function interface.

#### Example 3: Expression SFINAE - Detecting Member Functions

```cpp
#include <type_traits>
#include <iostream>
#include <string>

// Detects if type T has a member function to_string()
template<typename T>
auto hasToString(int) -> decltype(std::declval<T>().to_string(), std::true_type{}) {
    return std::true_type{};
}

template<typename T>
std::false_type hasToString(...) {  // Fallback for types without to_string()
    return std::false_type{};
}

struct WithToString {
    std::string to_string() const { return "value"; }
};

struct WithoutToString { };

int main() {
    std::cout << decltype(hasToString<WithToString>(0))::value << "\n";     // 1
    std::cout << decltype(hasToString<WithoutToString>(0))::value << "\n";  // 0
}
```

The first overload uses `decltype` with a comma expression: `declval<T>().to_string()` validates the member call, and `std::true_type{}` provides the return type. If the member doesn't exist, SFINAE removes this overload, leaving the fallback. The `int` vs `...` parameter creates overload priority.

#### Example 4: Tag Dispatch as Alternative to SFINAE

```cpp
#include <iostream>
#include <type_traits>

// Implementation functions that take tag types
template<typename T>
void processImpl(T val, std::true_type) {  // ✅ Integral version
    std::cout << val << " is integral\n";
}

template<typename T>
void processImpl(T val, std::false_type) {  // ✅ Non-integral version
    std::cout << val << " is non-integral\n";
}

// Public interface dispatches to appropriate implementation
template<typename T>
void process(T val) {
    processImpl(val, std::is_integral<T>{});  // ✅ Dispatch via tag type
}

int main() {
    process(42);      // 42 is integral
    process(3.14);    // 3.14 is non-integral
}
```

Tag dispatch is cleaner than SFINAE for many cases. The public function creates a tag object (`std::true_type` or `std::false_type`) and passes it to implementation functions that overload on the tag type. This avoids complex `enable_if` syntax while achieving the same compile-time dispatch.

#### Example 5: SFINAE with Member Type Detection

```cpp
#include <type_traits>
#include <iostream>

// Detects if type T has a nested type named 'value_type'
template<typename T>
auto hasValueType(int) -> decltype(typename T::value_type{}, std::true_type{}) {
    return std::true_type{};
}

template<typename T>
std::false_type hasValueType(...) {
    return std::false_type{};
}

template<typename T>
struct Container { using value_type = T; };

struct NoValueType { };

int main() {
    std::cout << decltype(hasValueType<Container<int>>(0))::value << "\n";  // 1
    std::cout << decltype(hasValueType<NoValueType>(0))::value << "\n";     // 0
}
```

The `typename T::value_type{}` expression attempts to access the nested type. If it doesn't exist, SFINAE removes this overload. This pattern detects nested types, type aliases, or any name accessible via `T::name`.

#### Example 6: Basic CRTP for Static Polymorphism

```cpp
#include <iostream>

template<typename Derived>
class Shape {
public:
    void draw() {
        static_cast<Derived*>(this)->drawImpl();  // ✅ Calls derived implementation
    }
    
    double area() {
        return static_cast<Derived*>(this)->areaImpl();  // ✅ Static dispatch
    }
};

class Circle : public Shape<Circle> {
public:
    void drawImpl() { std::cout << "Drawing circle\n"; }
    double areaImpl() { return 3.14 * 5 * 5; }  // radius = 5
};

class Rectangle : public Shape<Rectangle> {
public:
    void drawImpl() { std::cout << "Drawing rectangle\n"; }
    double areaImpl() { return 10 * 20; }  // width=10, height=20
};

int main() {
    Circle c;
    c.draw();  // Drawing circle
    std::cout << "Area: " << c.area() << "\n";  // Area: 78.5
    
    Rectangle r;
    r.draw();  // Drawing rectangle
    std::cout << "Area: " << r.area() << "\n";  // Area: 200
}
```

CRTP enables static polymorphism without virtual functions. The base class `Shape<Derived>` casts `this` to `Derived*` to call the derived implementation. Each instantiation (`Shape<Circle>`, `Shape<Rectangle>`) is a different type with no common base, preventing accidental runtime polymorphism and enabling complete inlining.

#### Example 7: CRTP Mixin Pattern

```cpp
#include <iostream>
#include <string>

template<typename Derived>
class Printable {
public:
    void print() const {
        std::cout << static_cast<const Derived*>(this)->toString() << "\n";
    }
};

template<typename Derived>
class Comparable {
public:
    bool operator<(const Derived& other) const {
        return static_cast<const Derived*>(this)->compare(other) < 0;
    }
};

class MyData : public Printable<MyData>, public Comparable<MyData> {
    int value;
public:
    MyData(int v) : value(v) { }
    
    std::string toString() const { return "MyData(" + std::to_string(value) + ")"; }
    int compare(const MyData& other) const { return value - other.value; }
};

int main() {
    MyData d1(10), d2(20);
    d1.print();  // MyData(10)
    std::cout << (d1 < d2) << "\n";  // 1 (true)
}
```

CRTP mixins add functionality by inheriting from multiple CRTP bases. Each mixin calls specific methods in the derived class via `static_cast`. This enables modular, composable capabilities without virtual function overhead. The derived class must implement all methods required by its mixins.

#### Example 8: CRTP for Counting Instances

```cpp
#include <iostream>

template<typename Derived>
class Counter {
    static inline int count = 0;  // C++17 inline static
protected:
    Counter() { ++count; }
    Counter(const Counter&) { ++count; }
    ~Counter() { --count; }
public:
    static int getCount() { return count; }
};

class Widget : public Counter<Widget> { };
class Gadget : public Counter<Gadget> { };

int main() {
    Widget w1, w2;
    Gadget g1;
    
    std::cout << "Widgets: " << Widget::getCount() << "\n";  // 2
    std::cout << "Gadgets: " << Gadget::getCount() << "\n";  // 1
    
    {
        Widget w3;
        std::cout << "Widgets: " << Widget::getCount() << "\n";  // 3
    }
    
    std::cout << "Widgets: " << Widget::getCount() << "\n";  // 2 (w3 destroyed)
}
```

Each CRTP instantiation has its own static member. `Counter<Widget>::count` is separate from `Counter<Gadget>::count`, enabling per-type instance counting. The derived class inherits increment/decrement logic automatically through CRTP constructor/destructor calls.

#### Example 9: SFINAE for Function Overload Selection

```cpp
#include <iostream>
#include <vector>
#include <type_traits>

// Version for types with begin() and end() (containers)
template<typename T>
auto printElements(const T& container) 
    -> decltype(container.begin(), container.end(), void()) {
    for (const auto& elem : container) {
        std::cout << elem << " ";
    }
    std::cout << "\n";
}

// Version for single values
template<typename T>
auto printElements(const T& value) 
    -> typename std::enable_if<!std::is_class<T>::value>::type {
    std::cout << value << "\n";
}

int main() {
    std::vector<int> vec = {1, 2, 3, 4, 5};
    printElements(vec);   // 1 2 3 4 5
    printElements(42);    // 42
}
```

The first overload uses expression SFINAE with `decltype` to check for `begin()` and `end()` methods. The `void()` cast ensures the return type is always `void` regardless of what `end()` returns. The second overload is disabled for class types to avoid ambiguity with the container version.

#### Example 10: CRTP with Protected Interface

```cpp
#include <iostream>

template<typename Derived>
class Interface {
protected:
    // Protected interface only accessible to derived
    void executeImpl() {
        static_cast<Derived*>(this)->doExecute();
    }
    
public:
    void execute() {
        std::cout << "Before execution\n";
        executeImpl();  // ✅ Calls derived implementation
        std::cout << "After execution\n";
    }
};

class ConcreteClass : public Interface<ConcreteClass> {
    friend class Interface<ConcreteClass>;  // Grant access to base
private:
    void doExecute() {
        std::cout << "ConcreteClass execution\n";
    }
};

int main() {
    ConcreteClass obj;
    obj.execute();
    // Before execution
    // ConcreteClass execution
    // After execution
}
```

The protected CRTP interface prevents external code from calling implementation methods directly while allowing the base template to access them. The `friend` declaration grants the base class access to private derived methods. This enables the Template Method pattern at compile time.

#### Example 11: Autonomous Vehicle - Advanced Sensor Framework with SFINAE and CRTP

This comprehensive example demonstrates SFINAE and CRTP in an autonomous vehicle sensor processing framework, showing capability detection, compile-time polymorphism, and zero-overhead abstractions essential for real-time safety-critical systems.

```cpp
#include <iostream>
#include <vector>
#include <string>
#include <type_traits>
#include <chrono>
#include <memory>

// ============================================================================
// Part 1: SFINAE for Sensor Capability Detection
// ============================================================================

// Expression SFINAE: Detect if sensor has calibration capability
template<typename T>
auto hasCalibrate(int) -> decltype(std::declval<T>().calibrate(), std::true_type{}) {
    return std::true_type{};
}

template<typename T>
std::false_type hasCalibrate(...) {
    return std::false_type{};
}

// Expression SFINAE: Detect if sensor has self-diagnostic capability
template<typename T>
auto hasSelfDiagnostic(int) -> decltype(std::declval<T>().runDiagnostic(), std::true_type{}) {
    return std::true_type{};
}

template<typename T>
std::false_type hasSelfDiagnostic(...) {
    return std::false_type{};
}

// SFINAE in return type: Only enable for sensors with calibration
template<typename T>
typename std::enable_if<decltype(hasCalibrate<T>(0))::value>::type
setupSensor(T& sensor) {
    std::cout << "Calibrating sensor...\n";
    sensor.calibrate();
}

template<typename T>
typename std::enable_if<!decltype(hasCalibrate<T>(0))::value>::type
setupSensor(T& sensor) {
    std::cout << "Sensor doesn't require calibration\n";
}

// ============================================================================
// Part 2: CRTP Base for Static Polymorphic Sensor Processing
// ============================================================================

template<typename Derived>
class SensorBase {
public:
    void processReading() {
        // Template Method pattern - algorithm structure defined in base
        std::cout << "  [Base] Starting sensor read cycle\n";

        // Static dispatch to derived implementation
        auto& derived = static_cast<Derived&>(*this);
        auto reading = derived.readImpl();

        if (derived.validateImpl(reading)) {
            derived.storeImpl(reading);
            std::cout << "  [Base] Reading processed successfully\n";
        } else {
            std::cout << "  [Base] WARNING: Invalid reading detected\n";
        }
    }

    // Common utility available to all sensors
    uint64_t getTimestamp() const {
        return std::chrono::duration_cast<std::chrono::milliseconds>(
            std::chrono::system_clock::now().time_since_epoch()
        ).count();
    }
};

// ============================================================================
// Part 3: CRTP Mixin for Adding Sensor Capabilities
// ============================================================================

// Mixin: Add logging capability
template<typename Derived>
class LoggableMixin {
public:
    void log(const std::string& message) const {
        std::cout << "[LOG] " << static_cast<const Derived*>(this)->getSensorName()
                  << ": " << message << "\n";
    }
};

// Mixin: Add health monitoring
template<typename Derived>
class HealthMonitorMixin {
    int failure_count{0};
    static constexpr int MAX_FAILURES = 3;

public:
    void recordFailure() {
        ++failure_count;
        if (failure_count >= MAX_FAILURES) {
            std::cout << "[HEALTH] " << static_cast<Derived*>(this)->getSensorName()
                      << " exceeded failure threshold!\n";
        }
    }

    bool isHealthy() const {
        return failure_count < MAX_FAILURES;
    }

    int getFailureCount() const { return failure_count; }
};

// ============================================================================
// Part 4: Concrete Sensor Implementations Using CRTP
// ============================================================================

class LiDARSensor : public SensorBase<LiDARSensor>,
                    public LoggableMixin<LiDARSensor>,
                    public HealthMonitorMixin<LiDARSensor> {
    std::vector<double> point_cloud;

public:
    std::string getSensorName() const { return "LiDAR-Front"; }

    // Required by SensorBase CRTP
    double readImpl() {
        log("Reading point cloud data");
        return 12.5;  // Simulated distance reading
    }

    bool validateImpl(double reading) {
        bool valid = (reading >= 0.1 && reading <= 100.0);
        if (!valid) recordFailure();
        return valid;
    }

    void storeImpl(double reading) {
        point_cloud.push_back(reading);
        log("Stored reading: " + std::to_string(reading) + "m");
    }

    // Calibration capability (detected by SFINAE)
    void calibrate() {
        std::cout << "  [LiDAR] Running laser calibration sequence\n";
    }

    // Self-diagnostic capability
    void runDiagnostic() {
        std::cout << "  [LiDAR] Running beam alignment diagnostic\n";
    }
};

class CameraSensor : public SensorBase<CameraSensor>,
                     public LoggableMixin<CameraSensor> {
public:
    std::string getSensorName() const { return "Camera-Front"; }

    double readImpl() {
        log("Capturing image frame");
        return 1920.0;  // Simulated pixel count
    }

    bool validateImpl(double reading) {
        return reading > 0;
    }

    void storeImpl(double reading) {
        log("Stored frame data");
    }

    // Calibration capability
    void calibrate() {
        std::cout << "  [Camera] Running lens and exposure calibration\n";
    }

    // NOTE: No runDiagnostic() - will be detected by SFINAE
};

class IMUSensor : public SensorBase<IMUSensor> {
public:
    std::string getSensorName() const { return "IMU-Main"; }

    double readImpl() {
        return 9.81;  // Simulated acceleration reading
    }

    bool validateImpl(double reading) {
        return reading >= -20.0 && reading <= 20.0;
    }

    void storeImpl(double reading) {
        std::cout << "  [IMU] Stored acceleration: " << reading << " m/s²\n";
    }

    // NOTE: No calibrate() - will be detected by SFINAE
    // NOTE: No runDiagnostic() - will be detected by SFINAE
};

// ============================================================================
// Part 5: CRTP for Per-Type Instance Counting
// ============================================================================

template<typename Derived>
class InstanceCounter {
    static inline int count = 0;

protected:
    InstanceCounter() { ++count; }
    InstanceCounter(const InstanceCounter&) { ++count; }
    ~InstanceCounter() { --count; }

public:
    static int getInstanceCount() { return count; }
};

class CountedLiDAR : public InstanceCounter<CountedLiDAR> {
public:
    void doWork() { std::cout << "CountedLiDAR working\n"; }
};

class CountedCamera : public InstanceCounter<CountedCamera> {
public:
    void doWork() { std::cout << "CountedCamera working\n"; }
};

// ============================================================================
// Part 6: Tag Dispatch for Sensor Priority Processing
// ============================================================================

struct HighPriority {};
struct LowPriority {};

// Implementation for high-priority sensors (real-time processing)
template<typename T>
void processSensorImpl(T& sensor, HighPriority) {
    std::cout << "[PRIORITY] Real-time processing for " << sensor.getSensorName() << "\n";
    sensor.processReading();
}

// Implementation for low-priority sensors (deferred processing)
template<typename T>
void processSensorImpl(T& sensor, LowPriority) {
    std::cout << "[PRIORITY] Queued processing for " << sensor.getSensorName() << "\n";
    sensor.processReading();
}

// Public interface uses tag dispatch
template<typename T, typename Priority>
void processSensor(T& sensor, Priority priority) {
    processSensorImpl(sensor, priority);
}

// ============================================================================
// Part 7: SFINAE for Conditional Diagnostic Execution
// ============================================================================

// Run diagnostic if sensor supports it (SFINAE)
template<typename T>
typename std::enable_if<decltype(hasSelfDiagnostic<T>(0))::value>::type
runDiagnosticIfAvailable(T& sensor) {
    std::cout << "Running diagnostic on " << sensor.getSensorName() << "\n";
    sensor.runDiagnostic();
}

template<typename T>
typename std::enable_if<!decltype(hasSelfDiagnostic<T>(0))::value>::type
runDiagnosticIfAvailable(T& sensor) {
    std::cout << "Diagnostic not available for " << sensor.getSensorName() << "\n";
}

// ============================================================================
// Part 8: CRTP Singleton for Sensor Manager
// ============================================================================

template<typename Derived>
class Singleton {
protected:
    Singleton() = default;
    ~Singleton() = default;
    Singleton(const Singleton&) = delete;
    Singleton& operator=(const Singleton&) = delete;

public:
    static Derived& instance() {
        static Derived inst;
        return inst;
    }
};

class SensorManager : public Singleton<SensorManager> {
    friend class Singleton<SensorManager>;

private:
    SensorManager() {
        std::cout << "[Manager] Sensor management system initialized\n";
    }

public:
    void manage() {
        std::cout << "[Manager] Managing all vehicle sensors\n";
    }
};

// ============================================================================
// Main: Demonstrating SFINAE and CRTP in Autonomous Vehicle Context
// ============================================================================

int main() {
    std::cout << "=== Autonomous Vehicle: Advanced Sensor Framework ===\n\n";

    // 1. SFINAE capability detection at compile time
    std::cout << "=== Compile-Time Capability Detection (SFINAE) ===\n";
    LiDARSensor lidar;
    CameraSensor camera;
    IMUSensor imu;

    std::cout << "LiDAR has calibrate: " << decltype(hasCalibrate<LiDARSensor>(0))::value << "\n";
    std::cout << "Camera has calibrate: " << decltype(hasCalibrate<CameraSensor>(0))::value << "\n";
    std::cout << "IMU has calibrate: " << decltype(hasCalibrate<IMUSensor>(0))::value << "\n\n";

    std::cout << "LiDAR has diagnostic: " << decltype(hasSelfDiagnostic<LiDARSensor>(0))::value << "\n";
    std::cout << "Camera has diagnostic: " << decltype(hasSelfDiagnostic<CameraSensor>(0))::value << "\n";
    std::cout << "IMU has diagnostic: " << decltype(hasSelfDiagnostic<IMUSensor>(0))::value << "\n\n";

    // 2. SFINAE-based conditional calibration
    std::cout << "=== Conditional Setup (SFINAE) ===\n";
    setupSensor(lidar);    // Has calibrate()
    setupSensor(camera);   // Has calibrate()
    setupSensor(imu);      // No calibrate()
    std::cout << "\n";

    // 3. CRTP static polymorphism for sensor processing
    std::cout << "=== CRTP Static Polymorphism (Zero-Overhead Dispatch) ===\n";
    std::cout << "Processing LiDAR:\n";
    lidar.processReading();

    std::cout << "\nProcessing Camera:\n";
    camera.processReading();

    std::cout << "\nProcessing IMU:\n";
    imu.processReading();
    std::cout << "\n";

    // 4. CRTP mixins for added functionality
    std::cout << "=== CRTP Mixins (Composable Functionality) ===\n";
    std::cout << "LiDAR health status: "
              << (lidar.isHealthy() ? "HEALTHY" : "DEGRADED") << "\n";
    std::cout << "LiDAR failure count: " << lidar.getFailureCount() << "\n";
    // Note: Camera doesn't have HealthMonitorMixin
    // Note: IMU has neither LoggableMixin nor HealthMonitorMixin
    std::cout << "\n";

    // 5. SFINAE for conditional diagnostic execution
    std::cout << "=== Conditional Diagnostics (SFINAE) ===\n";
    runDiagnosticIfAvailable(lidar);    // Has runDiagnostic()
    runDiagnosticIfAvailable(camera);   // No runDiagnostic()
    runDiagnosticIfAvailable(imu);      // No runDiagnostic()
    std::cout << "\n";

    // 6. Tag dispatch for priority-based processing
    std::cout << "=== Tag Dispatch (Priority-Based Processing) ===\n";
    processSensor(lidar, HighPriority{});   // Critical sensor
    processSensor(camera, HighPriority{});  // Critical sensor
    processSensor(imu, LowPriority{});      // Non-critical sensor
    std::cout << "\n";

    // 7. CRTP instance counting (per-type)
    std::cout << "=== CRTP Instance Counting (Per-Type Tracking) ===\n";
    {
        CountedLiDAR l1, l2;
        CountedCamera c1;

        std::cout << "Active LiDAR instances: " << CountedLiDAR::getInstanceCount() << "\n";
        std::cout << "Active Camera instances: " << CountedCamera::getInstanceCount() << "\n";

        {
            CountedLiDAR l3;
            std::cout << "After creating l3 - LiDAR instances: "
                      << CountedLiDAR::getInstanceCount() << "\n";
        }

        std::cout << "After l3 destroyed - LiDAR instances: "
                  << CountedLiDAR::getInstanceCount() << "\n";
    }
    std::cout << "After scope exit - LiDAR instances: "
              << CountedLiDAR::getInstanceCount() << "\n";
    std::cout << "After scope exit - Camera instances: "
              << CountedCamera::getInstanceCount() << "\n\n";

    // 8. CRTP Singleton for centralized management
    std::cout << "=== CRTP Singleton (Centralized Management) ===\n";
    SensorManager& mgr1 = SensorManager::instance();
    SensorManager& mgr2 = SensorManager::instance();

    std::cout << "Same instance: " << (&mgr1 == &mgr2 ? "YES" : "NO") << "\n";
    mgr1.manage();
    std::cout << "\n";

    std::cout << "=== Summary: Techniques Demonstrated ===\n";
    std::cout << "✓ SFINAE expression detection (hasCalibrate, hasSelfDiagnostic)\n";
    std::cout << "✓ SFINAE return type enable_if (setupSensor, runDiagnosticIfAvailable)\n";
    std::cout << "✓ CRTP static polymorphism (SensorBase with zero-overhead dispatch)\n";
    std::cout << "✓ CRTP mixins (LoggableMixin, HealthMonitorMixin)\n";
    std::cout << "✓ CRTP instance counting (per-type static members)\n";
    std::cout << "✓ CRTP singleton pattern (SensorManager)\n";
    std::cout << "✓ Tag dispatch (HighPriority/LowPriority processing)\n";
    std::cout << "✓ Template Method pattern via CRTP (processReading)\n";

    return 0;
}
```

**Output:**
```
=== Autonomous Vehicle: Advanced Sensor Framework ===

=== Compile-Time Capability Detection (SFINAE) ===
LiDAR has calibrate: 1
Camera has calibrate: 1
IMU has calibrate: 0

LiDAR has diagnostic: 1
Camera has diagnostic: 0
IMU has diagnostic: 0

=== Conditional Setup (SFINAE) ===
Calibrating sensor...
  [LiDAR] Running laser calibration sequence
Calibrating sensor...
  [Camera] Running lens and exposure calibration
Sensor doesn't require calibration

=== CRTP Static Polymorphism (Zero-Overhead Dispatch) ===
Processing LiDAR:
  [Base] Starting sensor read cycle
[LOG] LiDAR-Front: Reading point cloud data
[LOG] LiDAR-Front: Stored reading: 12.500000m
  [Base] Reading processed successfully

Processing Camera:
  [Base] Starting sensor read cycle
[LOG] Camera-Front: Capturing image frame
[LOG] Camera-Front: Stored frame data
  [Base] Reading processed successfully

Processing IMU:
  [Base] Starting sensor read cycle
  [IMU] Stored acceleration: 9.81 m/s²
  [Base] Reading processed successfully

=== CRTP Mixins (Composable Functionality) ===
LiDAR health status: HEALTHY
LiDAR failure count: 0

=== Conditional Diagnostics (SFINAE) ===
Running diagnostic on LiDAR-Front
  [LiDAR] Running beam alignment diagnostic
Diagnostic not available for Camera-Front
Diagnostic not available for IMU-Main

=== Tag Dispatch (Priority-Based Processing) ===
[PRIORITY] Real-time processing for LiDAR-Front
  [Base] Starting sensor read cycle
[LOG] LiDAR-Front: Reading point cloud data
[LOG] LiDAR-Front: Stored reading: 12.500000m
  [Base] Reading processed successfully
[PRIORITY] Real-time processing for Camera-Front
  [Base] Starting sensor read cycle
[LOG] Camera-Front: Capturing image frame
[LOG] Camera-Front: Stored frame data
  [Base] Reading processed successfully
[PRIORITY] Queued processing for IMU-Main
  [Base] Starting sensor read cycle
  [IMU] Stored acceleration: 9.81 m/s²
  [Base] Reading processed successfully

=== CRTP Instance Counting (Per-Type Tracking) ===
Active LiDAR instances: 2
Active Camera instances: 1
After creating l3 - LiDAR instances: 3
After l3 destroyed - LiDAR instances: 2
After scope exit - LiDAR instances: 0
After scope exit - Camera instances: 0

=== CRTP Singleton (Centralized Management) ===
[Manager] Sensor management system initialized
Same instance: YES
[Manager] Managing all vehicle sensors

=== Summary: Techniques Demonstrated ===
✓ SFINAE expression detection (hasCalibrate, hasSelfDiagnostic)
✓ SFINAE return type enable_if (setupSensor, runDiagnosticIfAvailable)
✓ CRTP static polymorphism (SensorBase with zero-overhead dispatch)
✓ CRTP mixins (LoggableMixin, HealthMonitorMixin)
✓ CRTP instance counting (per-type static members)
✓ CRTP singleton pattern (SensorManager)
✓ Tag dispatch (HighPriority/LowPriority processing)
✓ Template Method pattern via CRTP (processReading)
```

**Real-World Applications in Autonomous Vehicles:**

1. **SFINAE Capability Detection** - Different sensor models support different features (calibration, diagnostics, self-tests). SFINAE enables compile-time detection of capabilities without runtime reflection, eliminating overhead in safety-critical real-time loops. This is essential when integrating sensors from multiple vendors with varying feature sets.

2. **CRTP Static Polymorphism** - Traditional virtual function calls add 1-2 CPU cycles per call plus cache misses from vtable lookups. In a sensor processing loop running at 100Hz with 20 sensors, this becomes 4000 indirections/second. CRTP eliminates this entirely—the compiler inlines everything, generating identical machine code to hand-written type-specific functions.

3. **CRTP Mixins for Composable Functionality** - Not all sensors need logging or health monitoring. CRTP mixins let you add capabilities selectively without bloat. LiDAR (safety-critical) gets logging + health monitoring; camera gets only logging; IMU gets neither. Each combination generates a different type with zero unused code.

4. **Per-Type Instance Counting** - Resource management in autonomous vehicles requires knowing how many instances of each sensor type exist for memory budgeting and diagnostics. CRTP provides per-type counters with zero overhead—each sensor type has its own static counter automatically.

5. **CRTP Singleton for Central Management** - The sensor manager controls calibration sequences, shutdown procedures, and emergency protocols. CRTP Singleton ensures exactly one manager instance while allowing type-specific initialization.

6. **Tag Dispatch for Priority Scheduling** - Safety-critical sensors (LiDAR, camera for object detection) require real-time processing; non-critical sensors (temperature, ambient light) can be deferred. Tag dispatch enables compile-time selection of processing paths without runtime branching.

**Performance Benefits Over Virtual Functions:**

```cpp
// Virtual function approach (runtime overhead)
class SensorBase {
    virtual double read() = 0;  // Vtable lookup + call indirection
};

// CRTP approach (zero overhead)
template<typename Derived>
class SensorBase {
    double read() { return static_cast<Derived*>(this)->readImpl(); }  // Inlined
};
```

Benchmarks in real autonomous vehicle systems show CRTP reducing sensor processing latency by 15-30% compared to virtual functions—critical when processing 2 million LiDAR points per second at 10Hz.

**Safety-Critical Considerations:**
- **Compile-time verification**: SFINAE detects missing methods at compile time, not during driving
- **No runtime failures**: CRTP eliminates vtable corruption risks from memory errors
- **Deterministic performance**: No cache misses from virtual dispatch—critical for meeting real-time deadlines
- **Code generation transparency**: Assembly inspection shows exactly what code executes (no hidden indirection)

**When to Use Each Technique:**
- **SFINAE**: Detecting optional sensor capabilities, conditional API selection
- **CRTP**: Performance-critical sensor loops, zero-overhead abstractions
- **Tag Dispatch**: Compile-time algorithm selection with clear intent
- **Virtual Functions**: Plugin architectures, sensor hot-swapping (not shown here)

This example demonstrates how modern C++ metaprogramming techniques enable automotive-grade software: type-safe, zero-overhead, and deterministically verifiable at compile time.

---

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

### PRACTICE_TASKS: SFINAE and CRTP Code Analysis

#### Q1
```cpp
template<typename T>
typename std::enable_if<std::is_integral<T>::value>::type
process(T val) { std::cout << "integral\n"; }

int main() {
    process(42);
    process(3.14);
}
```

#### Q2
```cpp
template<typename T>
auto hasSize(int) -> decltype(std::declval<T>().size(), std::true_type{});

template<typename T>
std::false_type hasSize(...);

int main() {
    std::cout << decltype(hasSize<std::vector<int>>(0))::value << "\n";
    std::cout << decltype(hasSize<int>(0))::value << "\n";
}
```

#### Q3
```cpp
template<typename Derived>
class Base {
public:
    void interface() {
        static_cast<Derived*>(this)->impl();
    }
};

class D : public Base<D> {
public:
    void impl() { std::cout << "D::impl\n"; }
};

int main() {
    D d;
    d.interface();
}
```

#### Q4
```cpp
template<typename T>
typename std::enable_if<std::is_pointer<T>::value>::type
func(T) { std::cout << "pointer\n"; }

template<typename T>
typename std::enable_if<!std::is_pointer<T>::value>::type
func(T) { std::cout << "non-pointer\n"; }

int main() {
    int x = 42;
    func(&x);
    func(x);
}
```

#### Q5
```cpp
template<typename Derived>
class Counter {
    static inline int count = 0;
protected:
    Counter() { ++count; }
public:
    static int getCount() { return count; }
};

class Widget : public Counter<Widget> { };

int main() {
    Widget w1, w2, w3;
    std::cout << Widget::getCount() << "\n";
}
```

#### Q6
```cpp
template<typename T>
void processImpl(T val, std::true_type) { std::cout << "integral\n"; }

template<typename T>
void processImpl(T val, std::false_type) { std::cout << "other\n"; }

template<typename T>
void process(T val) { processImpl(val, std::is_integral<T>{}); }

int main() {
    process(10);
    process(3.14);
}
```

#### Q7
```cpp
template<typename T, typename = typename std::enable_if<std::is_class<T>::value>::type>
void func(T) { std::cout << "class\n"; }

int main() {
    struct MyClass { };
    func(MyClass{});
    func(42);
}
```

#### Q8
```cpp
template<typename Derived>
class Printable {
public:
    void print() const {
        std::cout << static_cast<const Derived*>(this)->toString() << "\n";
    }
};

class Data : public Printable<Data> {
public:
    std::string toString() const { return "Data"; }
};

int main() {
    Data d;
    d.print();
}
```

#### Q9
```cpp
template<typename T>
auto callFunc(T& obj) -> decltype(obj.func()) {
    return obj.func();
}

struct HasFunc { int func() { return 42; } };

int main() {
    HasFunc h;
    std::cout << callFunc(h) << "\n";
}
```

#### Q10
```cpp
template<typename T>
typename std::enable_if<std::is_arithmetic<T>::value && !std::is_same<T, bool>::value>::type
func(T) { std::cout << "arithmetic non-bool\n"; }

int main() {
    func(42);
    func(3.14);
    func(true);
}
```

#### Q11
```cpp
template<typename Derived>
class Base {
public:
    void doWork() { static_cast<Derived*>(this)->impl(); }
};

class Incomplete : public Base<Incomplete> {
    // Missing impl()
};

int main() {
    Incomplete obj;
    obj.doWork();
}
```

#### Q12
```cpp
template<typename T>
auto test(int) -> decltype(typename T::value_type{}, std::true_type{});

template<typename T>
std::false_type test(...);

template<typename T>
struct Container { using value_type = T; };

int main() {
    std::cout << decltype(test<Container<int>>(0))::value << "\n";
    std::cout << decltype(test<int>(0))::value << "\n";
}
```

#### Q13
```cpp
template<typename Derived>
class Singleton {
    static Derived* instance;
protected:
    Singleton() = default;
public:
    static Derived& getInstance() {
        if (!instance) instance = new Derived();
        return *instance;
    }
};

template<typename T>
T* Singleton<T>::instance = nullptr;

class Database : public Singleton<Database> {
    friend class Singleton<Database>;
private:
    Database() { std::cout << "DB created\n"; }
};

int main() {
    Database& db1 = Database::getInstance();
    Database& db2 = Database::getInstance();
    std::cout << (&db1 == &db2) << "\n";
}
```

#### Q14
```cpp
template<typename T, 
         typename std::enable_if<std::is_integral<T>::value, int>::type = 0>
void func(T) { std::cout << "int version\n"; }

template<typename T,
         typename std::enable_if<std::is_floating_point<T>::value, long>::type = 0>
void func(T) { std::cout << "float version\n"; }

int main() {
    func(42);
    func(3.14);
}
```

#### Q15
```cpp
template<typename Derived>
class LogMixin {
public:
    void log(const std::string& msg) {
        std::cout << "LOG: " << msg << "\n";
        static_cast<Derived*>(this)->extraLog();
    }
};

class MyClass : public LogMixin<MyClass> {
public:
    void extraLog() { std::cout << "Extra\n"; }
};

int main() {
    MyClass obj;
    obj.log("test");
}
```

#### Q16
```cpp
template<typename T>
typename std::enable_if<sizeof(T) > 4, void>::type
func(T) { std::cout << "large type\n"; }

int main() {
    func(42L);
    func('c');
}
```

#### Q17
```cpp
template<typename T>
struct RemoveConst { using type = T; };

template<typename T>
struct RemoveConst<const T> { using type = T; };

template<typename T>
auto func(T) -> typename RemoveConst<T>::type {
    return typename RemoveConst<T>::type{};
}

int main() {
    const int x = 42;
    auto result = func(x);
    std::cout << std::is_const<decltype(result)>::value << "\n";
}
```

#### Q18
```cpp
template<typename Derived>
class Interface {
public:
    void execute() {
        std::cout << "Before\n";
        static_cast<Derived*>(this)->doExecute();
        std::cout << "After\n";
    }
};

class Impl : public Interface<Impl> {
public:
    void doExecute() { std::cout << "Executing\n"; }
};

int main() {
    Impl obj;
    obj.execute();
}
```

#### Q19
```cpp
template<typename T>
void process(T val) {
    static_assert(std::is_integral<T>::value, "T must be integral");
    std::cout << val << "\n";
}

int main() {
    process(42);
    process(3.14);
}
```

#### Q20
```cpp
template<typename T>
auto add(T a, T b) -> decltype(a + b) {
    return a + b;
}

int main() {
    std::cout << add(5, 10) << "\n";
    std::cout << add(3.14, 2.86) << "\n";
    std::cout << add(std::string("Hello"), std::string(" World")) << "\n";
}
```

---

### QUICK_REFERENCE: Answer Key and Technique Comparison

#### Answer Key for Practice Questions

| Q# | Answer | Explanation | Key Concept |
|----|--------|-------------|-------------|
| 1 | `integral`<br>Compilation error | First call matches integral SFINAE; second fails (no float overload) | #sfinae |
| 2 | `1`<br>`0` | `std::vector` has `.size()` method; `int` doesn't | #expression_sfinae |
| 3 | `D::impl` | CRTP static dispatch calls derived implementation | #crtp |
| 4 | `pointer`<br>`non-pointer` | SFINAE selects correct overload based on pointer trait | #sfinae |
| 5 | `3` | Each `Widget` instance increments static counter in base | #crtp |
| 6 | `integral`<br>`other` | Tag dispatch selects overload via `true_type`/`false_type` | #tag_dispatch |
| 7 | `class`<br>Compilation error | SFINAE only enables for class types; `int` fails | #sfinae |
| 8 | `Data` | CRTP mixin calls derived `toString()` via static cast | #crtp |
| 9 | `42` | `decltype` deduces return type from `func()` method | #decltype |
| 10 | `arithmetic non-bool`<br>`arithmetic non-bool`<br>Compilation error | Combined SFINAE conditions; `bool` fails both conditions | #sfinae |
| 11 | Compilation error | Missing `impl()` method in derived class | #crtp |
| 12 | `1`<br>`0` | Expression SFINAE detects nested `value_type` | #expression_sfinae |
| 13 | `DB created`<br>`1` | Singleton pattern via CRTP; both references point to same instance | #crtp |
| 14 | `int version`<br>`float version` | Template parameter SFINAE with different default types | #sfinae |
| 15 | `LOG: test`<br>`Extra` | CRTP mixin calls derived `extraLog()` method | #crtp |
| 16 | `large type`<br>Compilation error | `long` is 8 bytes; `char` is 1 byte (fails SFINAE) | #sfinae |
| 17 | `0` | `RemoveConst` strips const qualifier; result is non-const | #type_traits |
| 18 | `Before`<br>`Executing`<br>`After` | CRTP Template Method pattern with static dispatch | #crtp |
| 19 | `42`<br>Compilation error | `static_assert` enforces integral constraint; double fails | #static_assert |
| 20 | `15`<br>`6`<br>`Hello World` | `decltype(a + b)` deduces result type of addition | #decltype |

#### SFINAE Techniques Comparison

| Technique | Syntax | Use Case | Readability |
|-----------|--------|----------|-------------|
| Return Type SFINAE | `typename enable_if<cond>::type func()` | Any function | Medium |
| Template Parameter SFINAE | `template<typename = enable_if<cond>::type>` | Constructors, operators | Low |
| Expression SFINAE | `auto func() -> decltype(expr)` | Member detection | Low |
| Tag Dispatch | `func(val, true_type{})` | Simple conditions | High |
| Concepts (C++20) | `template<Concept T>` | Interface constraints | Very High |

#### CRTP Usage Patterns

| Pattern | Purpose | Example Use Case |
|---------|---------|------------------|
| Static Interface | Interface implementation without virtuals | Shape hierarchy |
| Mixin | Add capabilities via inheritance | Printable, Serializable |
| Instance Counter | Track object instances per type | Resource management |
| Singleton | Reusable singleton infrastructure | Database connections |
| Template Method | Algorithm structure with customization | Sorting algorithms |
| Policy Class | Compile-time behavior configuration | Allocator policies |

#### SFINAE vs CRTP Decision Matrix

| Need | Use SFINAE | Use CRTP |
|------|-----------|----------|
| Conditional instantiation | ✅ Yes | ❌ No |
| Static polymorphism | ❌ No | ✅ Yes |
| Member detection | ✅ Yes | ❌ No |
| Zero-overhead interface | ❌ No | ✅ Yes |
| Mixins | ❌ No | ✅ Yes |
| Overload selection | ✅ Yes | ❌ No |
| Type constraints | ✅ Yes | ❌ No |
| Derived implementation access | ❌ No | ✅ Yes |

#### Common SFINAE Idioms

| Idiom | Code Pattern | Purpose |
|-------|--------------|---------|
| Return Type Enable | `typename enable_if<C>::type func()` | Basic SFINAE |
| Expression Test | `decltype(expr, true_type{})` | Capability detection |
| Member Detection | `declval<T>().member()` | Check for members |
| Logical Combination | `enable_if<C1 && C2>` | Multiple conditions |
| Overload Priority | `func(..., int)` vs `func(..., long)` | Fallback ordering |
| Comma Operator | `decltype((expr1, expr2))` | Test + return type |
