## TOPIC: Perfect Forwarding and Reference Collapsing

### PRACTICE_TASKS: Challenge Questions

#### Q1
```cpp
template<typename T>
void mystery(T&& x) {
    std::cout << std::is_lvalue_reference<T>::value;
}

int main() {
    int a = 5;
    mystery(a);
    mystery(10);
}
```

**Answer:**
```
1
0
```

**Explanation:**
- `mystery(a)`: a is lvalue → T deduced as `int&` → prints 1 (true)
- `mystery(10)`: 10 is rvalue → T deduced as `int` → prints 0 (false)
- Universal reference (T&&) deduces lvalue ref for lvalues, plain type for rvalues
- **Key Concept:** Universal references preserve value category through template type deduction

#### Q2
```cpp
template<typename T>
void func(T&& x) {
    T&& y = std::forward<T>(x);
}

int main() {
    int a = 1;
    func(a);
}
```

**Answer:**
```
(no output)
```

**Explanation:**
- `a` is lvalue → T deduced as `int&`
- `T&&` becomes `int& &&` → collapses to `int&`
- `std::forward<int&>(x)` returns `int&`
- `y` is declared as `int&` and binds to forwarded lvalue reference
- Code compiles and runs successfully with no output
- **Key Concept:** Reference collapsing allows binding forwarded lvalue references

#### Q3
```cpp
template<typename... Args>
void forwardMultiple(Args&&... args) {
    process(std::forward<Args>(args)...);
}

void process(int& a, int&& b) {
    std::cout << "overload1\n";
}

void process(int&& a, int& b) {
    std::cout << "overload2\n";
}

int main() {
    int x = 1, y = 2;
    forwardMultiple(x, std::move(y));
}
```

**Answer:**
```
Compilation Error (but would output "overload1" if process declared before forwardMultiple)
```

**Explanation:**
- `x` is lvalue → Args deduces as `int&`
- `std::move(y)` is rvalue → Args deduces as `int`
- Perfect forwarding preserves: `int&` and `int&&`
- Matches `process(int& a, int&& b)` → would print "overload1"
- Compilation error due to template instantiation order (process not visible at instantiation point)
- **Key Concept:** Variadic perfect forwarding preserves value categories of all arguments

#### Q4
```cpp
template<typename T>
void test(T&& x) {
    using Type = std::remove_reference_t<T>&&;
    // What is Type when T is int&?
    // What is Type when T is int?
}
```

**Answer:**
```
When T is int&: Type is int&&
When T is int: Type is int&&
```

**Explanation:**
- When T is `int&` (lvalue):
  - `std::remove_reference_t<int&>` → `int`
  - `int&&` → Type is `int&&` (rvalue reference)
- When T is `int` (rvalue):
  - `std::remove_reference_t<int>` → `int`
  - `int&&` → Type is `int&&` (rvalue reference)
- remove_reference_t strips any reference, then && applied
- **Key Concept:** remove_reference_t normalizes both lvalue and rvalue references to base type

#### Q5
```cpp
template<typename T>
class Wrapper {
public:
    void func(T&& x) { process(std::forward<T>(x)); }
};

void process(int& x) { std::cout << "lvalue\n"; }
void process(int&& x) { std::cout << "rvalue\n"; }

int main() {
    Wrapper<int> w;
    int a = 5;
    w.func(a);
}
```

**Answer:**
```
Compilation Error
```

**Explanation:**
- `Wrapper<int>` → T is `int` (not a reference)
- `func(T&&)` becomes `func(int&&)` (regular rvalue reference, NOT universal reference)
- NOT a universal reference because T already deduced at class level
- `a` is lvalue, cannot bind to `int&&` parameter
- Compilation error: cannot bind rvalue reference to lvalue
- **Key Concept:** T&& is NOT universal reference in non-template member functions of template classes

#### Q6
```cpp
template<typename T>
void outer(T&& x) {
    auto&& y = std::forward<T>(x);
    // What is the type of y when x is int lvalue?
    // What is the type of y when x is int rvalue?
}
```

**Answer:**
```
When x is int lvalue: y is int&
When x is int rvalue: y is int&&
```

**Explanation:**
- When x is lvalue:
  - T deduced as `int&`
  - `std::forward<int&>(x)` returns `int&`
  - `auto&&` deduces as `int&` (lvalue reference)
- When x is rvalue:
  - T deduced as `int`
  - `std::forward<int>(x)` returns `int&&`
  - `auto&&` deduces as `int&&` (rvalue reference)
- `auto&&` is also universal reference in declaration
- **Key Concept:** auto&& preserves value category from forwarded expression

#### Q7
```cpp
void func(int& x) { std::cout << "1"; }
void func(const int& x) { std::cout << "2"; }
void func(int&& x) { std::cout << "3"; }

template<typename T>
void forward_call(T&& x) {
    func(std::forward<T>(x));
}

int main() {
    int a = 1;
    const int b = 2;
    forward_call(a);
    forward_call(b);
    forward_call(3);
}
```

**Answer:**
```
123
```

**Explanation:**
- `forward_call(a)`: T is `int&` → forwards as `int&` → calls func(int&) → prints "1"
- `forward_call(b)`: T is `const int&` → forwards as `const int&` → calls func(const int&) → prints "2"
- `forward_call(3)`: T is `int` → forwards as `int&&` → calls func(int&&) → prints "3"
- Perfect forwarding preserves cv-qualifiers and value category
- Each call selects exact matching overload
- **Key Concept:** Perfect forwarding preserves const-ness and value category for overload resolution

#### Q8
```cpp
template<typename T>
void test() {
    using A = T&;
    using B = T&&;
    using C = A&&;
    using D = B&;
    // What are C and D when T is int?
}
```

**Answer:**
```
C is int&
D is int&
```

**Explanation:**
- When T is `int`:
  - A is `int&` (lvalue reference)
  - B is `int&&` (rvalue reference)
  - C is `A&&` = `int& &&` → collapses to `int&` (reference collapsing rule)
  - D is `B&` = `int&& &` → collapses to `int&` (reference collapsing rule)
- Reference collapsing rules: & always wins, only && + && → &&
- Both C and D collapse to lvalue references
- **Key Concept:** Reference collapsing: adding & to any reference type always produces lvalue reference

#### Q9
```cpp
template<typename T>
auto make_unique(T&& x) {
    return std::unique_ptr<std::remove_reference_t<T>>(
        new std::remove_reference_t<T>(std::forward<T>(x))
    );
}

int main() {
    std::string s = "hello";
    auto p1 = make_unique(s);
    auto p2 = make_unique(std::string("world"));
}
```

**Answer:**
```
(no output)
```

**Explanation:**
- `make_unique(s)`: T is `std::string&`, remove_reference_t gives `std::string`, forwards as lvalue → copy constructs
- `make_unique(std::string("world"))`: T is `std::string`, remove_reference_t gives `std::string`, forwards as rvalue → move constructs
- p1 holds copy of "hello", p2 holds moved-from "world"
- remove_reference_t strips reference to get actual type for unique_ptr
- Perfect forwarding enables copy/move based on value category
- **Key Concept:** Universal reference + std::forward + remove_reference_t enables efficient factory functions

#### Q10
```cpp
template<typename F, typename... Args>
void invoke_twice(F&& f, Args&&... args) {
    f(std::forward<Args>(args)...);
    f(std::forward<Args>(args)...);
}

void consume(std::unique_ptr<int> p) {
    std::cout << *p << "\n";
}

int main() {
    invoke_twice(consume, std::make_unique<int>(42));
}
```

**Answer:**
```
Runtime Error (Segmentation Fault)
```

**Explanation:**
- First call: `std::forward<std::unique_ptr<int>>(args)...` moves unique_ptr into consume
- unique_ptr transferred ownership, args becomes null
- Second call: forwards already-moved-from unique_ptr (now null)
- consume dereferences null pointer → segmentation fault
- std::forward can be called multiple times but moves the value only once
- **Key Concept:** Perfect forwarding of move-only types can only be done ONCE safely

#### Q11
```cpp
struct S {
    template<typename T>
    S(T&& x) : value(std::forward<T>(x)) {}

    int value;
};

int main() {
    int a = 5;
    S s1(a);
    S s2(10);
    // Does this compile? What constructors are called?
}
```

**Answer:**
```
(no output)
```

**Explanation:**
- Yes, compiles successfully
- `S s1(a)`: T is `int&`, forwards as lvalue int, value initialized with 5
- `S s2(10)`: T is `int`, forwards as rvalue int, value initialized with 10
- Universal reference constructor template accepts any type
- Perfect forwarding constructor pattern common for wrapper classes
- Both constructions use the same template constructor with different deductions
- **Key Concept:** Forwarding constructors enable perfect forwarding in initialization

#### Q12
```cpp
template<typename T>
void func(T&& x) {
    std::forward<T>(x);
    std::forward<T>(x);
}

void process(std::vector<int>&& v) {
    std::cout << v.size() << "\n";
}

int main() {
    func(std::vector<int>{1, 2, 3});
}
```

**Answer:**
```
(no output, compiler warnings about unused results)
```

**Explanation:**
- func receives rvalue vector, T deduced as `std::vector<int>`
- `std::forward<T>(x)` called twice but results ignored
- std::forward returns rvalue reference but doesn't actually move
- Nothing consumes the forwarded value (process() never called)
- Compiler warns about [[nodiscard]] attribute on std::forward
- x remains valid after both forward calls (no actual move occurred)
- **Key Concept:** std::forward itself doesn't move; it only casts to appropriate reference type

#### Q13
```cpp
template<typename T>
constexpr bool is_universal_ref = false;

template<typename T>
constexpr bool is_universal_ref<T&&> = true;

template<typename T>
void check(T&&) {
    std::cout << is_universal_ref<T&&>;
}

int main() {
    int a = 1;
    check(a);
    check(10);
}
```

**Answer:**
```
01
```

**Explanation:**
- `check(a)`: T is `int&`, `T&&` becomes `int& &&` → collapses to `int&`, not matched by `<T&&>` pattern → prints 0
- `check(10)`: T is `int`, `T&&` is `int&&`, matches `<T&&>` pattern → prints 1
- Variable template specialization matches only when T&& is rvalue reference form
- After reference collapsing, lvalue case doesn't match T&& pattern
- Demonstrates that universal references collapse differently based on value category
- **Key Concept:** Template pattern matching happens after type deduction and reference collapsing

#### Q14
```cpp
template<typename T>
struct Wrapper {
    template<typename U>
    void forward_to_method(U&& arg) {
        obj.method(std::forward<U>(arg));
    }

    T obj;
};

struct MyClass {
    void method(std::string& s) { std::cout << "lvalue\n"; }
    void method(std::string&& s) { std::cout << "rvalue\n"; }
};

int main() {
    Wrapper<MyClass> w;
    std::string str = "test";
    w.forward_to_method(str);
    w.forward_to_method("literal");
}
```

**Answer:**
```
lvalue
rvalue
```

**Explanation:**
- `forward_to_method(str)`: U is `std::string&`, forwards as lvalue → calls method(std::string&) → prints "lvalue"
- `forward_to_method("literal")`: U is `const char(&)[8]`, but method expects string → temporary string created from literal (rvalue) → calls method(std::string&&) → prints "rvalue"
- U&& is universal reference in member function template (different from Q5!)
- Perfect forwarding wrapper enables forwarding to wrapped object methods
- String literal converted to temporary std::string (rvalue)
- **Key Concept:** Member function templates can have universal references when function itself is templated

#### Q15
```cpp
template<typename T>
void mystery(T&& x) {
    decltype(x) y = std::forward<T>(x);
    decltype(std::forward<T>(x)) z = std::forward<T>(x);
    // What are the types of y and z when x is int lvalue?
}
```

**Answer:**
```
When x is int lvalue:
y is int&
z is int&
```

**Explanation:**
- When x is int lvalue, T is `int&`, parameter x is `int&`
- `decltype(x)`: x is named lvalue reference → type is `int&`
- `decltype(std::forward<T>(x))`: forward returns `int&`, expression is lvalue → type is `int&`
- Both y and z are lvalue references
- decltype preserves exact type of expression including reference-ness
- Named references evaluated as lvalue references in decltype
- **Key Concept:** decltype of reference variable gives reference type; decltype of forwarded lvalue gives lvalue reference

#### Q16
```cpp
void overload(int&, int&)   { std::cout << "1"; }
void overload(int&, int&&)  { std::cout << "2"; }
void overload(int&&, int&)  { std::cout << "3"; }
void overload(int&&, int&&) { std::cout << "4"; }

template<typename T1, typename T2>
void forward_both(T1&& a, T2&& b) {
    overload(std::forward<T1>(a), std::forward<T2>(b));
}

int main() {
    int x = 1, y = 2;
    forward_both(x, y);
    forward_both(x, std::move(y));
    forward_both(std::move(x), y);
    forward_both(std::move(x), std::move(y));
}
```

**Answer:**
```
1234
```

**Explanation:**
- `forward_both(x, y)`: both lvalues → forwards as `int&, int&` → calls overload 1 → prints "1"
- `forward_both(x, std::move(y))`: lvalue, rvalue → forwards as `int&, int&&` → calls overload 2 → prints "2"
- `forward_both(std::move(x), y)`: rvalue, lvalue → forwards as `int&&, int&` → calls overload 3 → prints "3"
- `forward_both(std::move(x), std::move(y))`: both rvalues → forwards as `int&&, int&&` → calls overload 4 → prints "4"
- Perfect forwarding preserves all 4 combinations of value categories
- **Key Concept:** Perfect forwarding enables exact forwarding of value category combinations to overload sets

#### Q17
```cpp
template<typename T>
struct Identity {
    using type = T;
};

template<typename T>
void func(typename Identity<T>::type&& x) {
    // Is this a universal reference?
}

int main() {
    int a = 5;
    func<int>(a);
}
```

**Answer:**
```
Compilation Error
```

**Explanation:**
- NO, this is NOT a universal reference
- Universal reference requires form `T&&` where T is being deduced
- Here, `typename Identity<T>::type&&` is dependent type but NOT deducible form
- T must be explicitly specified `<int>`, no type deduction occurs
- `Identity<int>::type&&` resolves to `int&&` (regular rvalue reference)
- Cannot bind lvalue `a` to rvalue reference `int&&`
- **Key Concept:** Universal references require direct T&& form; qualified/nested types are not universal references

#### Q18
```cpp
template<typename T>
void accept_array(T&& arr) {
    constexpr size_t size = std::extent_v<std::remove_reference_t<T>>;
    std::cout << size << "\n";
}

int main() {
    int arr1[5];
    int arr2[10];
    accept_array(arr1);
    accept_array(arr2);
}
```

**Answer:**
```
5
10
```

**Explanation:**
- `accept_array(arr1)`: T deduced as `int(&)[5]`, extent extracts 5 → prints "5"
- `accept_array(arr2)`: T deduced as `int(&)[10]`, extent extracts 10 → prints "10"
- Universal references preserve array types (arrays don't decay to pointers)
- std::extent extracts array dimension from type
- remove_reference_t needed because T is reference type `int(&)[N]`
- Array size is part of the type information preserved through perfect forwarding
- **Key Concept:** Universal references prevent array decay, preserving size information

#### Q19
```cpp
template<typename... Args>
auto make_tuple_forward(Args&&... args) {
    return std::make_tuple(std::forward<Args>(args)...);
}

int main() {
    std::string s = "hello";
    auto t1 = make_tuple_forward(s, std::string("world"), 42);
    // What types are stored in the tuple?
}
```

**Answer:**
```
Tuple stores: std::string, std::string, int
```

**Explanation:**
- `s` (lvalue string): Args deduces `std::string&`, forwarded as lvalue → std::make_tuple copies → stores `std::string`
- `std::string("world")` (rvalue): Args deduces `std::string`, forwarded as rvalue → std::make_tuple moves → stores `std::string`
- `42` (rvalue int): Args deduces `int`, forwarded as rvalue → copied (cheap) → stores `int`
- std::make_tuple decays references to values
- Tuple always stores values, not references (unless std::ref used)
- Perfect forwarding enables copy vs move optimization
- **Key Concept:** make_tuple stores values; perfect forwarding optimizes copy/move but result is always by-value

#### Q20
```cpp
template<typename T>
void outer(T&& x) {
    [y = std::forward<T>(x)]() {
        // What is the type of y in the lambda?
    }();
}

int main() {
    int a = 5;
    outer(a);
    outer(10);
}
```

**Answer:**
```
outer(a): y is int (copy of lvalue)
outer(10): y is int (moved from rvalue)
```

**Explanation:**
- Lambda init-capture `y = std::forward<T>(x)` creates member variable in lambda
- `outer(a)`: T is `int&`, forward returns `int&`, y initialized by copy → y is `int`
- `outer(10)`: T is `int`, forward returns `int&&`, y initialized by move → y is `int`
- Init-captures always store by value (unless reference explicitly specified)
- Perfect forwarding determines copy vs move, but capture type is always value
- Lambda captures own copy/moved value, independent of original
- **Key Concept:** Lambda init-captures with std::forward enable efficient value capture (copy for lvalues, move for rvalues)

---
