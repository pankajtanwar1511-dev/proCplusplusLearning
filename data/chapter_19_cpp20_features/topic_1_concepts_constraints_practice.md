## TOPIC: C++20 Concepts & Constraints

### PRACTICE_TASKS: Output Prediction and Code Analysis

#### Q1
```cpp
#include <concepts>
#include <iostream>

template<std::integral T>
void process(T x) {
    std::cout << "Integral: " << x << "\n";
}

int main() {
    process(42);
    process(3.14);  // Bug: not integral!
}
```

**Answer:**
```
Compilation error: no matching function for process(double)
```

**Explanation:**
- `42` is `int` → compiles successfully
- `3.14` is `double` → NOT integral
- `std::integral<double>` is `false` → constraint not satisfied
- Compiler error: "constraints not satisfied" for `process<double>`
- **Key Concept:** Concepts enforce constraints at compile-time; constraint violations produce clear error messages instead of cryptic SFINAE errors

**Fixed Version:**
```cpp
template<std::integral T>
void process(T x) {
    std::cout << "Integral: " << x << "\n";
}

template<std::floating_point T>
void process(T x) {
    std::cout << "Float: " << x << "\n";
}

int main() {
    process(42);     // Calls integral version
    process(3.14);   // Calls floating_point version
}
```

---

#### Q2
```cpp
#include <concepts>
#include <iostream>

template<typename T>
concept Numeric = std::integral<T> || std::floating_point<T>;

template<Numeric T>
void func(T x) { std::cout << "Numeric\n"; }

int main() {
    func(42);
    func(3.14);
    func("hello");  // Bug: const char* not Numeric!
}
```

**Answer:**
```
Compilation error: no matching function for func(const char*)
```

**Explanation:**
- `42` (int) and `3.14` (double) satisfy `Numeric` concept
- `"hello"` is `const char*` → neither integral nor floating_point
- Concept constraint fails at compile-time
- Clear error: "constraints not satisfied for func<const char*>"
- **Key Concept:** Concepts with logical OR (||) require at least one disjunct to be satisfied; const char* satisfies neither integral nor floating_point

---

#### Q3
```cpp
#include <concepts>
#include <iostream>

template<typename T>
concept Addable = requires(T a, T b) {
    a + b;  // Bug: doesn't check return type!
};

struct Weird {
    void operator+(const Weird&) const {}  // Returns void!
};

template<Addable T>
T add(T a, T b) {
    return a + b;  // Tries to return void!
}

int main() {
    Weird w1, w2;
    auto result = add(w1, w2);  // Compiles but wrong!
}
```

**Answer:**
```
Compilation error: cannot initialize return object of type 'Weird' with an rvalue of type 'void'
```

**Explanation:**
- `Addable` only checks that expression `a + b` is valid
- Doesn't verify return type is compatible with `T`
- `Weird::operator+` returns `void`, not `Weird`
- Concept constraint satisfied, but function body fails
- Concept too weak → allows invalid types through
- **Key Concept:** requires expressions check syntax validity, not semantic correctness; must also constrain return types with `{ expression } -> std::convertible_to<T>;`

**Fixed Version:**
```cpp
template<typename T>
concept Addable = requires(T a, T b) {
    { a + b } -> std::convertible_to<T>;  // Check return type!
};

// Now Weird doesn't satisfy Addable
// Compilation error at add(w1, w2) call site
```

---

#### Q4
```cpp
#include <concepts>
#include <vector>
#include <iostream>

template<typename T>
concept Container = requires(T c) {
    c.size();
    c.begin();
    c.end();
};

template<Container C>
void print_size(C& c) {
    std::cout << c.size() << "\n";
}

int main() {
    std::vector<int> vec{1, 2, 3};
    int arr[3] = {1, 2, 3};

    print_size(vec);  // OK
    print_size(arr);  // Bug: raw array doesn't satisfy Container!
}
```

**Answer:**
```
Compilation error: no matching function for print_size(int[3])
```

**Explanation:**
- `std::vector` has `.size()`, `.begin()`, `.end()` → satisfies concept
- Raw arrays do NOT have member functions
- `arr.size()` is invalid → concept constraint fails
- Must use `std::size(arr)`, `std::begin(arr)` for arrays
- **Key Concept:** Concepts check specific expressions; member function concepts exclude types that only support free functions (like raw arrays)

**Fixed Version:**
```cpp
template<typename T>
concept Container = requires(T c) {
    std::size(c);   // Works for arrays and containers
    std::begin(c);
    std::end(c);
};

// OR use std::ranges::range concept:
template<std::ranges::range R>
void print_size(R& r) {
    std::cout << std::ranges::size(r) << "\n";
}
```

---

#### Q5
```cpp
#include <concepts>
#include <iostream>

template<typename T>
concept A = std::integral<T>;

template<typename T>
concept B = A<T> && std::is_signed_v<T>;

template<A T> void func(T) { std::cout << "A\n"; }
template<B T> void func(T) { std::cout << "B\n"; }

int main() {
    func(42);    // int: signed integral
    func(42u);   // unsigned int
    func('x');   // char: integral but signedness implementation-defined!
}
```

**Answer:**
```
B
A
Implementation-defined (A or B depending on platform)
```

**Explanation:**
- `int` (42) → signed integral → satisfies both A and B, but B subsumes A → calls B
- `unsigned int` (42u) → integral but NOT signed → only satisfies A → calls A
- `char` is integral, but `std::is_signed_v<char>` is implementation-defined
- Some platforms: `char` is signed → calls B
- Other platforms: `char` is unsigned → calls A
- **Key Concept:** Concept subsumption resolves overload ambiguity; more specific concepts (B subsumes A) preferred; char signedness varies by platform - use signed char/unsigned char for portability

---

#### Q6
```cpp
#include <concepts>
#include <string>
#include <iostream>

template<typename T>
concept Printable = requires(T t) {
    std::cout << t;
};

template<Printable T>
void print(const T& value) {
    std::cout << value << "\n";
}

struct Custom {
    int x;
    friend std::ostream& operator<<(std::ostream& os, const Custom& c);  // Declaration only!
};

int main() {
    Custom c{42};
    print(c);  // Bug: operator<< declared but not defined!
}
```

**Answer:**
```
Linker error: undefined reference to operator<<(std::ostream&, const Custom&)
```

**Explanation:**
- Concept `Printable` checks if expression `std::cout << t` is well-formed
- Declared (but not defined) `operator<<` makes expression valid during concept checking
- Concept constraint satisfied at compile-time
- Function instantiates successfully
- Linker cannot find definition → linker error
- **Key Concept:** Concepts check syntax/declarations at compile-time, not definitions; missing definitions cause linker errors, not concept failures

**Fixed Version:**
```cpp
struct Custom {
    int x;
    friend std::ostream& operator<<(std::ostream& os, const Custom& c) {
        return os << c.x;  // Inline definition!
    }
};
```

---

#### Q7
```cpp
#include <concepts>
#include <vector>
#include <list>
#include <iostream>

template<typename T>
concept RandomAccess = requires(T c, size_t i) {
    c[i];  // Bug: doesn't check for random access iterator!
};

template<RandomAccess C>
void access_middle(C& c) {
    auto& elem = c[c.size() / 2];  // Direct access!
    std::cout << elem << "\n";
}

int main() {
    std::vector<int> vec{1, 2, 3, 4, 5};
    std::list<int> lst{1, 2, 3, 4, 5};

    access_middle(vec);  // OK
    access_middle(lst);  // Bug: std::list has operator[] but it's O(n)!
}
```

**Answer:**
```
Compilation error: no match for operator[] for std::list
```

**Explanation:**
- `std::vector` has `operator[]` → O(1) random access
- `std::list` does NOT have `operator[]` → only bidirectional iterators
- Concept checks for `c[i]` expression → std::list fails
- Good: concept prevents inefficient usage
- However, concept name `RandomAccess` is misleading (should check iterator category)
- **Key Concept:** operator[] presence doesn't guarantee random access semantics; use std::ranges::random_access_range to check iterator category, not just operator[] existence

**Better Version:**
```cpp
template<std::ranges::random_access_range R>
void access_middle(R& r) {
    auto it = std::ranges::begin(r);
    std::advance(it, std::ranges::size(r) / 2);
    std::cout << *it << "\n";
}
```

---

#### Q8
```cpp
#include <concepts>
#include <iostream>

template<typename T>
concept MustBeInt = std::same_as<T, int>;

template<typename T>
    requires MustBeInt<T> || std::floating_point<T>
void process(T x) {
    std::cout << "Processing: " << x << "\n";
}

int main() {
    process(42);      // int
    process(3.14);    // double
    process(42L);     // long: Bug: not int and not floating_point!
}
```

**Answer:**
```
Compilation error: constraints not satisfied for process<long>
```

**Explanation:**
- `42` is exactly `int` → satisfies `MustBeInt<int>` → compiles
- `3.14` is `double` → satisfies `std::floating_point<double>` → compiles
- `42L` is `long` → NOT exactly `int` (different type)
- `long` is integral but NOT floating_point
- Neither disjunct satisfied → constraint fails
- **Key Concept:** std::same_as checks exact type equality, not compatibility; integral types (short, int, long, long long) are distinct types despite compatibility

**Fixed Version:**
```cpp
template<typename T>
    requires std::integral<T> || std::floating_point<T>
void process(T x) {
    std::cout << "Processing: " << x << "\n";
}
```

---

#### Q9
```cpp
#include <concepts>
#include <iostream>

template<typename T>
concept Numeric = requires(T a, T b) {
    a + b;
    a - b;
    a * b;
    a / b;  // Bug: doesn't check for division by zero protection!
};

template<Numeric T>
T divide(T a, T b) {
    return a / b;  // No zero check!
}

int main() {
    std::cout << divide(10, 0) << "\n";  // Undefined behavior!
}
```

**Answer:**
```
Undefined behavior (likely: floating point exception or garbage value)
```

**Explanation:**
- `Numeric` concept only checks that operators exist
- Does NOT enforce runtime constraints (like `b != 0`)
- Division by zero is undefined behavior for integers
- For floats, produces `inf` or `nan`
- Concepts cannot express runtime constraints
- **Key Concept:** Concepts constrain compile-time type properties, not runtime values; runtime checks (like division by zero) must be implemented separately with assertions or exceptions

**Fixed Version:**
```cpp
template<Numeric T>
T divide(T a, T b) {
    if (b == T{0}) {
        throw std::invalid_argument("Division by zero");
    }
    return a / b;
}
```

---

#### Q10
```cpp
#include <concepts>
#include <iostream>

template<typename T, typename U>
concept Comparable = requires(T a, U b) {
    { a < b } -> std::convertible_to<bool>;
};

template<typename T, typename U>
    requires Comparable<T, U>
bool less_than(T a, U b) {
    return a < b;
}

int main() {
    std::cout << less_than(5, 10) << "\n";      // OK
    std::cout << less_than(10, 5) << "\n";      // OK
    std::cout << less_than(5, "hello") << "\n"; // Bug: int < const char* compiles but nonsensical!
}
```

**Answer:**
```
1
0
Implementation-defined (likely 1, but semantically wrong)
```

**Explanation:**
- `5 < 10` → true (1)
- `10 < 5` → false (0)
- `5 < "hello"` → compares `int` with pointer address
- `"hello"` decays to `const char*` → pointer value
- Comparison is pointer arithmetic (5 < address) → compiles but meaningless
- Result depends on where string literal is stored in memory
- **Key Concept:** Syntactic validity doesn't guarantee semantic correctness; concepts check if operations compile, not if they make logical sense

**Better Version:**
```cpp
template<typename T, typename U>
concept Comparable = requires(T a, U b) {
    { a < b } -> std::convertible_to<bool>;
    { b < a } -> std::convertible_to<bool>;
} && std::common_reference_with<T, U>;  // Ensure types are related!
```

---

#### Q11
```cpp
#include <concepts>
#include <iostream>

template<std::integral T>
void func(T x) { std::cout << "Integral\n"; }

template<typename T>
    requires std::integral<T> && std::is_signed_v<T>
void func(T x) { std::cout << "Signed Integral\n"; }

int main() {
    func(42);   // int: integral and signed
    func(42u);  // unsigned int: integral but not signed
}
```

**Answer:**
```
Signed Integral
Integral
```

**Explanation:**
- `int` satisfies both overloads, but second is more constrained
- Second overload has additional constraint `std::is_signed_v<T>`
- More constrained overload preferred (subsumption)
- Calls "Signed Integral" for `int`
- `unsigned int` only satisfies first overload → calls "Integral"
- **Key Concept:** Overload resolution uses subsumption; if concept A implies concept B, A subsumes B and is preferred; additional constraints make overload more specific

---

#### Q12
```cpp
#include <concepts>
#include <vector>
#include <iostream>

template<typename T>
concept HasPushBack = requires(T c, typename T::value_type v) {
    c.push_back(v);
};

template<HasPushBack C>
void add_element(C& c, const typename C::value_type& v) {
    c.push_back(v);
}

int main() {
    std::vector<int> vec;
    int arr[5] = {0};  // Bug: no value_type typedef!

    add_element(vec, 42);  // OK
    add_element(arr, 42);  // Compilation error
}
```

**Answer:**
```
Compilation error: 'int[5]' does not have nested type 'value_type'
```

**Explanation:**
- Concept requires `typename T::value_type` to exist
- `std::vector<int>` has nested typedef `value_type = int`
- Raw arrays do NOT have nested typedefs
- Attempting to use `typename T::value_type` for array fails immediately
- Concept constraint not even evaluated → hard error
- **Key Concept:** Concepts with nested type requirements fail hard on types lacking those members; use std::ranges concepts or SFINAE-friendly trait checks for broader compatibility

**Fixed Version:**
```cpp
template<typename T>
concept HasPushBack = requires(T c, std::ranges::range_value_t<T> v) {
    c.push_back(v);
};

// Or use ranges directly:
template<std::ranges::range R>
    requires requires(R r, std::ranges::range_value_t<R> v) {
        r.push_back(v);
    }
void add_element(R& r, const std::ranges::range_value_t<R>& v) {
    r.push_back(v);
}
```

---

#### Q13
```cpp
#include <concepts>
#include <iostream>

template<typename T>
concept Incrementable = requires(T t) {
    ++t;
    t++;
};

class Counter {
    int value = 0;
public:
    Counter& operator++() { ++value; return *this; }
    int operator++(int) { return value++; }  // Bug: returns int, not Counter!
};

template<Incrementable T>
T increment_twice(T t) {
    ++t;
    return t++;  // Expects T, but postfix returns int!
}

int main() {
    Counter c;
    auto result = increment_twice(c);  // Type mismatch!
}
```

**Answer:**
```
Compilation error: cannot initialize return object of type 'Counter' with an rvalue of type 'int'
```

**Explanation:**
- `Incrementable` checks that `++t` and `t++` are valid expressions
- Does NOT check return types
- `Counter::operator++()` (prefix) returns `Counter&` → correct
- `Counter::operator++(int)` (postfix) returns `int` → incorrect
- Concept satisfied because expressions compile
- But `return t++` tries to return `int` as `Counter` → type error
- **Key Concept:** requires expressions check syntactic validity without type constraints; use compound requirements `{ t++ } -> std::same_as<T>;` to enforce return types

**Fixed Version:**
```cpp
template<typename T>
concept Incrementable = requires(T t) {
    { ++t } -> std::same_as<T&>;
    { t++ } -> std::same_as<T>;
};

// Or fix Counter:
class Counter {
    int value = 0;
public:
    Counter& operator++() { ++value; return *this; }
    Counter operator++(int) { Counter tmp = *this; ++value; return tmp; }
};
```

---

#### Q14
```cpp
#include <concepts>
#include <iostream>
#include <memory>

template<typename T>
concept Pointer = requires(T p) {
    *p;
    p->foo;  // Bug: assumes 'foo' member exists!
};

template<Pointer P>
void use_pointer(P p) {
    std::cout << *p << "\n";
}

int main() {
    int* p1 = new int(42);
    std::unique_ptr<int> p2 = std::make_unique<int>(42);

    use_pointer(p1);   // int* has operator* and operator->
    use_pointer(p2);   // unique_ptr has operator* and operator->
}
```

**Answer:**
```
Compilation error: 'int' has no member named 'foo'
```

**Explanation:**
- Concept checks if `p->foo` is valid expression
- For `int*`, `p->` tries to access member of `int`
- `int` has no member `foo` → concept constraint fails
- Same for `std::unique_ptr<int>`
- Concept too specific → rejects valid pointer types
- **Key Concept:** Don't assume specific members exist; use requires expressions without specific member names, or check only operator* and operator-> existence

**Fixed Version:**
```cpp
template<typename T>
concept Pointer = requires(T p) {
    *p;
    p.operator->();  // Check operator-> exists without requiring specific member
};

// Or simpler:
template<typename T>
concept Pointer = requires(T p) {
    { *p };
    { p.operator->() };
};
```

---

#### Q15
```cpp
#include <concepts>
#include <iostream>

template<typename T>
concept Movable = std::movable<T>;

template<Movable T>
T process(T value) {
    return value;  // Bug: copies if T is lvalue reference!
}

int main() {
    int x = 42;
    int& ref = x;

    auto result = process(x);    // Copies x
    auto result2 = process(ref); // Bug: T deduced as int&, which is NOT movable!
}
```

**Answer:**
```
Compilation error: constraints not satisfied for process<int&>
```

**Explanation:**
- `std::movable<int>` is `true` → `int` is movable
- `std::movable<int&>` is `false` → references are NOT movable
- When passing `ref`, `T` deduced as `int&`
- `int&` does not satisfy `Movable` concept
- Compilation error at `process(ref)` call
- **Key Concept:** std::movable requires object types; references, const types, and non-move-constructible types don't satisfy movable; use std::remove_reference_t or perfect forwarding for references

**Fixed Version:**
```cpp
template<typename T>
    requires std::movable<std::remove_cvref_t<T>>
T process(T value) {
    return value;
}

// Or use forwarding:
template<typename T>
    requires std::movable<std::remove_cvref_t<T>>
decltype(auto) process(T&& value) {
    return std::forward<T>(value);
}
```

---
