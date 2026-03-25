## TOPIC: C++20 Language Features - Three-Way Comparison and Modern Syntax

---

### THEORY_SECTION: New Language Features for Cleaner, Safer Code

---

#### 1. Three-Way Comparison Operator (`<=>`) - The Spaceship Operator

**The Problem Before C++20:**

```cpp
struct Point {
    int x, y;

    // ❌ C++17: Need to define all 6 comparison operators manually
    bool operator==(const Point& other) const {
        return x == other.x && y == other.y;
    }
    bool operator!=(const Point& other) const {
        return !(*this == other);
    }
    bool operator<(const Point& other) const {
        if (x < other.x) return true;
        if (x > other.x) return false;
        return y < other.y;
    }
    bool operator<=(const Point& other) const {
        return !(other < *this);
    }
    bool operator>(const Point& other) const {
        return other < *this;
    }
    bool operator>=(const Point& other) const {
        return !(*this < other);
    }
};
// 6 functions, error-prone, boilerplate
```

**The C++20 Solution:**

```cpp
struct Point {
    int x, y;

    // ✅ C++20: Define operator<=> and optionally operator==
    auto operator<=>(const Point& other) const = default;
};

// Automatically generates all 6 comparison operators!
Point p1{1, 2}, p2{3, 4};
p1 == p2;  // ✅ Available
p1 != p2;  // ✅ Available
p1 < p2;   // ✅ Available
p1 <= p2;  // ✅ Available
p1 > p2;   // ✅ Available
p1 >= p2;  // ✅ Available
```

**How `<=>` Works:**

The spaceship operator returns one of three comparison category types:

```cpp
auto result = a <=> b;

// result can be:
// - std::strong_ordering::{less, equal, greater}
// - std::weak_ordering::{less, equivalent, greater}
// - std::partial_ordering::{less, equivalent, greater, unordered}
```

---

#### 2. Comparison Categories - strong, weak, partial

**std::strong_ordering:**

Values are **fully ordered** and **substitutable**:
- `a == b` means `a` and `b` are indistinguishable
- Used for types like `int`, `std::string`, pointers

```cpp
#include <compare>

struct Integer {
    int value;

    std::strong_ordering operator<=>(const Integer& other) const {
        return value <=> other.value;  // int has strong ordering
    }
};

Integer a{5}, b{10};
auto result = a <=> b;  // std::strong_ordering::less
```

**std::weak_ordering:**

Values are **fully ordered** but **not necessarily substitutable**:
- `a == b` means they're equivalent, but may differ in unobserved ways
- Used for case-insensitive strings, normalized forms

```cpp
struct CaseInsensitiveString {
    std::string value;

    std::weak_ordering operator<=>(const CaseInsensitiveString& other) const {
        return to_lower(value) <=> to_lower(other.value);
        // "Hello" and "HELLO" are equivalent (not equal in strong sense)
    }
};
```

**std::partial_ordering:**

Some values may be **unordered** (not comparable):
- Used for floating-point (NaN is unordered)
- Partially ordered sets

```cpp
double a = 1.0, b = std::numeric_limits<double>::quiet_NaN();
auto result = a <=> b;  // std::partial_ordering::unordered

// NaN is unordered with everything
if (result == std::partial_ordering::unordered) {
    std::cout << "Cannot compare\n";
}
```

**Comparison Table:**

| Category | Substitutable | All Values Comparable | Examples |
|----------|--------------|----------------------|----------|
| `strong_ordering` | ✅ Yes | ✅ Yes | `int`, `std::string` |
| `weak_ordering` | ❌ No | ✅ Yes | Case-insensitive strings |
| `partial_ordering` | ❌ No | ❌ No | `float`, `double` (NaN) |

---

#### 3. Defaulted and Custom `operator<=>`

**Defaulted (Compiler-Generated):**

```cpp
struct Person {
    std::string name;
    int age;

    // Compiler generates memberwise comparison (name first, then age)
    auto operator<=>(const Person&) const = default;
};

// Generated comparison:
// 1. Compare name (std::string has strong_ordering)
// 2. If equal, compare age (int has strong_ordering)
// Result: std::strong_ordering
```

**Custom Implementation:**

```cpp
struct Product {
    std::string name;
    double price;

    std::strong_ordering operator<=>(const Product& other) const {
        // Custom logic: Compare by price first, then name
        if (auto cmp = price <=> other.price; cmp != 0)
            return cmp;
        return name <=> other.name;
    }
};
```

**Return Type Deduction:**

```cpp
struct Data {
    int a;
    double b;  // partial_ordering (due to NaN)

    // Return type is auto (deduced as partial_ordering)
    auto operator<=>(const Data&) const = default;
};

// Compiler chooses "weakest" category among members:
// int → strong_ordering
// double → partial_ordering
// Result → partial_ordering (weakest wins)
```

---

#### 4. `operator==` vs `operator<=>`

**Key Insight:** `operator==` is NOT automatically generated from `operator<=>` for efficiency!

```cpp
struct Point {
    int x, y;

    auto operator<=>(const Point&) const = default;  // Generates <, <=, >, >=
    bool operator==(const Point&) const = default;   // Generates ==, !=
};

// Why separate?
// operator<=> might be expensive (compute ordering)
// operator== can be optimized (just check equality, no ordering)
```

**Example:**

```cpp
struct BigData {
    std::vector<int> data;

    // Efficient equality check
    bool operator==(const BigData& other) const {
        return data.size() == other.size() &&
               std::equal(data.begin(), data.end(), other.begin());
    }

    // More expensive ordering
    auto operator<=>(const BigData& other) const {
        return data <=> other.data;  // Lexicographic comparison
    }
};
```

---

#### 5. Designated Initializers

**The Feature:**

Initialize aggregate members by name in any order:

```cpp
struct Config {
    int port;
    std::string host;
    bool ssl;
    int timeout;
};

// ✅ C++20: Clear, self-documenting
Config cfg {
    .port = 8080,
    .host = "localhost",
    .ssl = true,
    .timeout = 30
};

// Can omit members (default-initialized)
Config cfg2 {
    .port = 443,
    .ssl = true
    // host = "", timeout = 0
};
```

**Rules:**

1. **Order must match declaration order:**
   ```cpp
   struct Point { int x, y; };

   // ✅ OK: x before y
   Point p{.x = 1, .y = 2};

   // ❌ Error: y before x
   Point p{.y = 2, .x = 1};
   ```

2. **Cannot mix with positional initialization:**
   ```cpp
   // ❌ Error: Can't mix
   Config cfg{8080, .ssl = true};
   ```

3. **Nested initialization:**
   ```cpp
   struct Address {
       std::string city;
       int zip;
   };

   struct Person {
       std::string name;
       Address addr;
   };

   Person p {
       .name = "Alice",
       .addr = {.city = "NYC", .zip = 10001}
   };
   ```

---

#### 6. `consteval` - Immediate Functions

**Difference from `constexpr`:**

| Feature | `constexpr` | `consteval` |
|---------|------------|-------------|
| **Must** run at compile-time? | No (can run at runtime) | **Yes** (always compile-time) |
| Can return non-constexpr? | Yes | No |
| Use case | Optionally compile-time | Guaranteed compile-time |

**consteval Example:**

```cpp
consteval int square(int x) {
    return x * x;
}

int main() {
    constexpr int a = square(5);  // ✅ OK: Compile-time
    int b = square(10);           // ✅ OK: Still compile-time

    int n;
    std::cin >> n;
    int c = square(n);            // ❌ Error: n is runtime variable
}
```

**Use Cases:**

1. **Meta-programming that must happen at compile-time:**
   ```cpp
   consteval auto get_type_name() {
       return "int";  // Must be evaluated at compile-time
   }
   ```

2. **Enforce compile-time computation:**
   ```cpp
   consteval size_t compute_buffer_size(size_t elements) {
       return elements * sizeof(int);
   }

   // Buffer size is guaranteed known at compile-time
   std::array<char, compute_buffer_size(100)> buffer;
   ```

---

#### 7. `constinit` - Compile-Time Initialization

**The Problem:**

Static initialization order fiasco:

```cpp
// ❌ C++17: Initialization order undefined across translation units
int global1 = compute1();  // When is this initialized?
int global2 = compute2();  // What if compute2() uses global1?
```

**constinit Solution:**

Guarantees variable is initialized at compile-time (or during constant initialization):

```cpp
// ✅ C++20: Guaranteed compile-time initialization
constinit int global1 = 42;
constinit int global2 = global1 * 2;  // Safe: global1 already initialized
```

**Rules:**

```cpp
constinit int a = 10;       // ✅ OK: Compile-time constant
constinit int b = a * 2;    // ✅ OK: Uses compile-time value

int runtime_func() { return 42; }
constinit int c = runtime_func();  // ❌ Error: Not compile-time
```

**constinit vs constexpr:**

```cpp
constexpr int a = 42;  // Compile-time constant, can't be modified
a = 100;               // ❌ Error: Can't modify constexpr

constinit int b = 42;  // Compile-time initialization, but mutable
b = 100;               // ✅ OK: Can modify after initialization
```

---

#### 8. [[likely]] and [[unlikely]] Attributes

**Purpose:** Hint to compiler which branch is more probable for optimization.

**Syntax:**

```cpp
void process(int value) {
    if (value > 0) [[likely]] {
        // This branch is expected to be taken most of the time
        fast_path(value);
    } else [[unlikely]] {
        // This branch is rarely taken
        slow_error_handling();
    }
}
```

**Impact:**

```cpp
// Without attributes:
if (rare_error) {  // Compiler doesn't know this is rare
    handle_error();
}
process_normal();

// With attributes:
if (rare_error) [[unlikely]] {  // Compiler optimizes for unlikely case
    handle_error();
}
process_normal();  // This path is optimized as the common case
```

**Switch Statements:**

```cpp
switch (operation) {
    case OP_ADD: [[likely]]
        return a + b;

    case OP_SUBTRACT:
        return a - b;

    case OP_ERROR: [[unlikely]]
        throw std::runtime_error("Error");
}
```

**Performance:**

- Improves branch prediction
- Better instruction cache utilization
- Can reduce mispredicted branches by 10-30% in hot paths

---

#### 9. `using enum` - Enum Scope Reduction

**The Problem:**

```cpp
enum class Color { Red, Green, Blue };

void paint(Color c) {
    // ❌ C++17: Verbose, repetitive
    switch (c) {
        case Color::Red:   /* ... */ break;
        case Color::Green: /* ... */ break;
        case Color::Blue:  /* ... */ break;
    }
}
```

**C++20 Solution:**

```cpp
void paint(Color c) {
    using enum Color;  // ✅ Bring all enumerators into scope

    switch (c) {
        case Red:   /* ... */ break;
        case Green: /* ... */ break;
        case Blue:  /* ... */ break;
    }
}
```

**Selective Import:**

```cpp
void use_colors() {
    using Color::Red;   // Import only Red
    using Color::Blue;  // Import only Blue

    auto c1 = Red;      // ✅ OK
    auto c2 = Blue;     // ✅ OK
    auto c3 = Green;    // ❌ Error: Not imported
}
```

---

#### 10. Template Improvements

**Template Lambda:**

```cpp
// ✅ C++20: Lambda with explicit template parameter
auto lambda = []<typename T>(T value) {
    std::cout << "Type: " << typeid(T).name() << '\n';
    return value * 2;
};

lambda(42);      // T = int
lambda(3.14);    // T = double
```

**Concepts in Templates:**

```cpp
template<std::integral T>  // ✅ C++20: Concepts as template parameters
T add(T a, T b) {
    return a + b;
}
```

**Non-Type Template Parameters:**

```cpp
// ✅ C++20: Floating-point and class types as template parameters
template<double Ratio>
double scale(double value) {
    return value * Ratio;
}

auto scaled = scale<1.5>(100.0);  // 150.0
```

---

#### 11. Aggregate Improvements

**Direct-List-Initialization of Aggregates:**

```cpp
struct Point { int x, y; };

// ✅ C++20: Parenthesized initialization
Point p1(1, 2);     // Now allowed (was only p{1, 2} before)
Point p2 = Point(3, 4);
```

**Aggregate with Base Class:**

```cpp
struct Base { int a; };
struct Derived : Base { int b; };

// ✅ C++20: Can initialize base in aggregate
Derived d{.a = 1, .b = 2};  // Initialize Base::a and Derived::b
```

---

#### 12. Conditionally `explicit` Constructors

**The Feature:**

```cpp
template<typename T>
struct Optional {
    T value;

    // ✅ C++20: Conditionally explicit based on T
    template<typename U>
    explicit(!std::is_convertible_v<U, T>)
    Optional(U&& val) : value(std::forward<U>(val)) {}
};

Optional<int> o1 = 42;        // OK if int is convertible
Optional<MyClass> o2 = obj;   // explicit if MyClass not convertible
```

---

### EDGE_CASES: Tricky Three-Way Comparison Scenarios

---

#### Edge Case 1: Mixed Comparison Categories

**Problem:**

```cpp
struct Mixed {
    int a;           // strong_ordering
    double b;        // partial_ordering (NaN)

    auto operator<=>(const Mixed&) const = default;
};

// What's the return type?
// Answer: partial_ordering (weakest wins)
```

**Rule:** Compiler selects the **weakest** category among all members.

---

#### Edge Case 2: Base Class Comparison

**Problem:**

```cpp
struct Base {
    int x;
    auto operator<=>(const Base&) const = default;
};

struct Derived : Base {
    int y;
    auto operator<=>(const Derived&) const = default;  // ✅ Includes Base::x
};

Derived d1{.x=1, .y=2}, d2{.x=1, .y=3};
auto cmp = d1 <=> d2;  // Compares Base::x first, then Derived::y
```

---

#### Edge Case 3: `operator==` Not Synthesized from `operator<=>`

**Problem:**

```cpp
struct Point {
    int x, y;
    auto operator<=>(const Point&) const = default;  // Only generates <, <=, >, >=
};

Point p1{1, 2}, p2{1, 2};
bool eq = (p1 == p2);  // ❌ Error: operator== not defined!

// Solution:
struct Point {
    int x, y;
    auto operator<=>(const Point&) const = default;
    bool operator==(const Point&) const = default;  // ✅ Add this
};
```

---

#### Edge Case 4: Designated Initializers Order Matters

**Problem:**

```cpp
struct Data { int a, b, c; };

// ❌ Error: Designators out of order
Data d{.b = 2, .a = 1, .c = 3};

// ✅ OK: Correct order
Data d{.a = 1, .b = 2, .c = 3};
```

---

#### Edge Case 5: `consteval` Propagation

**Problem:**

```cpp
consteval int compute() { return 42; }

constexpr int use_compute() {
    return compute();  // ❌ Error: constexpr calls consteval
}

// Solution:
consteval int use_compute() {  // ✅ Make it consteval too
    return compute();
}
```

---

### CODE_EXAMPLES: Practical Usage

---

#### Example 1: Spaceship Operator for Custom Type

```cpp
#include <compare>
#include <string>
#include <iostream>

struct Person {
    std::string name;
    int age;

    // Custom spaceship: Compare by age, then name
    std::strong_ordering operator<=>(const Person& other) const {
        if (auto cmp = age <=> other.age; cmp != 0)
            return cmp;
        return name <=> other.name;
    }

    // Also define equality
    bool operator==(const Person& other) const = default;
};

int main() {
    Person p1{"Alice", 30}, p2{"Bob", 25}, p3{"Alice", 30};

    std::cout << std::boolalpha;
    std::cout << (p1 <=> p2 == std::strong_ordering::greater) << '\n';  // true (30 > 25)
    std::cout << (p1 == p3) << '\n';  // true
}
```

---

#### Example 2: Designated Initializers for Configuration

```cpp
#include <string>
#include <iostream>

struct ServerConfig {
    std::string host = "localhost";
    int port = 8080;
    bool use_ssl = false;
    int timeout_ms = 5000;
    int max_connections = 100;
};

int main() {
    // Override only what you need
    ServerConfig dev_config {
        .port = 3000,
        .timeout_ms = 10000
    };

    ServerConfig prod_config {
        .host = "prod.example.com",
        .port = 443,
        .use_ssl = true,
        .max_connections = 1000
    };

    std::cout << "Dev: " << dev_config.host << ":" << dev_config.port << '\n';
    std::cout << "Prod: " << prod_config.host << ":" << prod_config.port << '\n';
}
```

---

#### Example 3: `consteval` for Compile-Time Validation

```cpp
#include <array>

consteval size_t validate_size(size_t n) {
    if (n == 0 || n > 1024)
        throw "Invalid buffer size";  // Compile-time error if condition met
    return n;
}

template<size_t N>
class Buffer {
    std::array<char, validate_size(N)> data_;  // Validated at compile-time
};

int main() {
    Buffer<100> b1;   // ✅ OK
    // Buffer<0> b2;     // ❌ Compile error: Invalid buffer size
    // Buffer<2000> b3;  // ❌ Compile error: Invalid buffer size
}
```

---

#### Example 4: Branch Prediction Hints

```cpp
#include <iostream>
#include <random>

int process_value(int value) {
    if (value < 0) [[unlikely]] {
        std::cerr << "Negative value encountered\n";
        return -1;
    }

    // Hot path (expected case)
    return value * 2;
}

int main() {
    std::random_device rd;
    std::mt19937 gen(rd());
    std::uniform_int_distribution<> dis(0, 1000);

    for (int i = 0; i < 1000000; ++i) {
        int val = dis(gen);
        process_value(val);  // Compiler optimizes for val >= 0
    }
}
```

---

#### Example 5: `using enum` in Switch

```cpp
#include <iostream>

enum class Operation { Add, Subtract, Multiply, Divide };

double calculate(Operation op, double a, double b) {
    using enum Operation;  // Bring enumerators into scope

    switch (op) {
        case Add:      return a + b;
        case Subtract: return a - b;
        case Multiply: return a * b;
        case Divide:   return b != 0 ? a / b : 0;
    }
    return 0;
}

int main() {
    std::cout << calculate(Operation::Add, 10, 5) << '\n';       // 15
    std::cout << calculate(Operation::Multiply, 10, 5) << '\n';  // 50
}
```

---

#### Example 6: Template Lambda with Explicit Template Parameters

```cpp
#include <iostream>
#include <vector>
#include <string>

int main() {
    // ✅ C++20: Lambda with explicit template parameter
    auto print_twice = []<typename T>(T value) {
        std::cout << value << " " << value << '\n';
    };

    print_twice(42);           // int: 42 42
    print_twice(3.14);         // double: 3.14 3.14
    print_twice("Hello");      // const char*: Hello Hello

    // Advanced: Use in algorithms
    auto doubler = []<typename T>(const T& x) { return x + x; };

    std::vector<int> nums{1, 2, 3};
    for (const auto& n : nums) {
        std::cout << doubler(n) << ' ';  // 2 4 6
    }
}
```

**Output:**
```
42 42
3.14 3.14
Hello Hello
2 4 6
```

---

#### Example 7: `constinit` for Safe Global Initialization

```cpp
#include <iostream>

// ❌ Problem without constinit: Static initialization order fiasco
int compute_value() { return 42; }
// int global1 = compute_value();  // When is this initialized?

// ✅ Solution with constinit
constinit int global1 = 42;           // Compile-time init
constinit int global2 = global1 * 2;  // Safe: global1 already exists

// Can still modify after initialization
void modify_globals() {
    global1 = 100;  // ✅ OK: constinit variables are mutable
    global2 = 200;
}

int main() {
    std::cout << "Initial: " << global1 << ", " << global2 << '\n';
    modify_globals();
    std::cout << "Modified: " << global1 << ", " << global2 << '\n';
}
```

**Output:**
```
Initial: 42, 84
Modified: 100, 200
```

---

#### Example 8: `partial_ordering` with NaN

```cpp
#include <compare>
#include <iostream>
#include <limits>

struct FloatWrapper {
    double value;

    auto operator<=>(const FloatWrapper& other) const {
        return value <=> other.value;  // Returns partial_ordering
    }
};

int main() {
    FloatWrapper a{1.0};
    FloatWrapper b{2.0};
    FloatWrapper nan_val{std::numeric_limits<double>::quiet_NaN()};

    auto cmp1 = a <=> b;
    if (cmp1 < 0) {
        std::cout << "1.0 < 2.0\n";  // This executes
    }

    auto cmp2 = a <=> nan_val;
    if (cmp2 == std::partial_ordering::unordered) {
        std::cout << "1.0 and NaN are unordered\n";  // This executes
    }

    // NaN is not equal to anything, including itself
    auto cmp3 = nan_val <=> nan_val;
    if (cmp3 == std::partial_ordering::unordered) {
        std::cout << "NaN is not even equal to itself\n";  // This executes
    }
}
```

**Output:**
```
1.0 < 2.0
1.0 and NaN are unordered
NaN is not even equal to itself
```

---

#### Example 9: `weak_ordering` for Case-Insensitive Comparison

```cpp
#include <compare>
#include <iostream>
#include <string>
#include <algorithm>

struct CaseInsensitiveString {
    std::string value;

    // Helper: Convert to lowercase
    static std::string to_lower(std::string s) {
        std::transform(s.begin(), s.end(), s.begin(), ::tolower);
        return s;
    }

    std::weak_ordering operator<=>(const CaseInsensitiveString& other) const {
        return to_lower(value) <=> to_lower(other.value);
    }

    bool operator==(const CaseInsensitiveString& other) const {
        return to_lower(value) == to_lower(other.value);
    }
};

int main() {
    CaseInsensitiveString s1{"Hello"};
    CaseInsensitiveString s2{"HELLO"};
    CaseInsensitiveString s3{"World"};

    std::cout << std::boolalpha;
    std::cout << "Hello == HELLO: " << (s1 == s2) << '\n';  // true (equivalent)
    std::cout << "Hello < World: " << (s1 < s3) << '\n';    // true

    // But the strings are not identical (weak, not strong)
    std::cout << "Actual strings: " << s1.value << " vs " << s2.value << '\n';
}
```

**Output:**
```
Hello == HELLO: true
Hello < World: true
Actual strings: Hello vs HELLO
```

---

#### Example 10: Aggregate Improvements - Parenthesized Initialization

```cpp
#include <iostream>
#include <string>

struct Point {
    int x;
    int y;
};

struct Person {
    std::string name;
    int age;
};

// Aggregate with base class (C++20 enhancement)
struct Base {
    int id;
};

struct Derived : Base {
    std::string name;
};

int main() {
    // ✅ C++20: Parenthesized aggregate initialization
    Point p1(10, 20);           // Like p1{10, 20}
    Person person1("Alice", 30);

    // ✅ C++20: Designated init with base class
    Derived d{.id = 1, .name = "Bob"};

    std::cout << "Point: (" << p1.x << ", " << p1.y << ")\n";
    std::cout << "Person: " << person1.name << ", age " << person1.age << '\n';
    std::cout << "Derived: id=" << d.id << ", name=" << d.name << '\n';
}
```

**Output:**
```
Point: (10, 20)
Person: Alice, age 30
Derived: id=1, name=Bob
```

---

### INTERVIEW_QA: Common Questions

---

#### Q1: What is the three-way comparison operator and why was it introduced?

**Answer:**

The three-way comparison operator (`<=>`, "spaceship operator") performs a single comparison and returns a result indicating the relative order of two values.

**Before C++20:**
```cpp
struct Point {
    int x, y;

    // Need 6 operators
    bool operator==(const Point& o) const { return x == o.x && y == o.y; }
    bool operator!=(const Point& o) const { return !(*this == o); }
    bool operator<(const Point& o) const { /* ... */ }
    bool operator<=(const Point& o) const { /* ... */ }
    bool operator>(const Point& o) const { /* ... */ }
    bool operator>=(const Point& o) const { /* ... */ }
};
```

**With C++20:**
```cpp
struct Point {
    int x, y;

    auto operator<=>(const Point&) const = default;  // 1 line!
    bool operator==(const Point&) const = default;
};
```

**Why introduce it?**
1. **Reduce boilerplate**: 1-2 lines instead of 6 functions
2. **Avoid errors**: Implementing 6 operators correctly is error-prone
3. **Better performance**: Single comparison for ordering operations
4. **Expressiveness**: Clearly shows type is comparable

---

#### Q2: Explain the three comparison categories.

**Answer:**

| Category | Meaning | Values | Example Types |
|----------|---------|--------|---------------|
| `std::strong_ordering` | Fully ordered, substitutable | `less`, `equal`, `greater` | `int`, `std::string` |
| `std::weak_ordering` | Fully ordered, not substitutable | `less`, `equivalent`, `greater` | Case-insensitive strings |
| `std::partial_ordering` | Some values unordered | `less`, `equivalent`, `greater`, `unordered` | `float`, `double` (NaN) |

**strong_ordering:** `a == b` means `a` and `b` are identical and interchangeable.

**weak_ordering:** `a == b` means they're equivalent for comparison purposes, but may differ in other ways.
```cpp
CaseInsensitiveString a{"Hello"}, b{"HELLO"};
// a == b (equivalent), but string contents differ
```

**partial_ordering:** Some values (like NaN) cannot be compared.
```cpp
double a = 1.0, b = NaN;
a <=> b;  // Returns std::partial_ordering::unordered
```

---

#### Q3: Why do we need both `operator<=>` and `operator==`?

**Answer:**

**Efficiency Reason:** Equality checks can be optimized differently than ordering.

```cpp
struct BigData {
    std::vector<int> data;

    // Fast equality: Check sizes first, short-circuit
    bool operator==(const BigData& other) const {
        return data.size() == other.size() &&  // O(1) check
               std::equal(data.begin(), data.end(), other.begin());
    }

    // Ordering: Must compare elements lexicographically
    auto operator<=>(const BigData& other) const {
        return data <=> other.data;  // Can't short-circuit as easily
    }
};
```

For simple types, you can default both:
```cpp
struct Point {
    int x, y;
    auto operator<=>(const Point&) const = default;
    bool operator==(const Point&) const = default;
};
```

**Why separate?** Compiler doesn't synthesize `operator==` from `operator<=>` to allow optimization opportunities.

---

#### Q4: What's the difference between `constexpr`, `consteval`, and `constinit`?

**Answer:**

| Feature | `constexpr` | `consteval` | `constinit` |
|---------|------------|-------------|-------------|
| **Purpose** | Can run at compile-time | **Must** run at compile-time | Ensures compile-time initialization |
| **Runtime execution** | ✅ Allowed | ❌ Never | N/A (for initialization only) |
| **Mutability** | Immutable if variable | Immutable if variable | ✅ Mutable after init |
| **Use on** | Functions, variables | Functions only | Variables only |

**Examples:**

```cpp
// constexpr: CAN be compile-time
constexpr int square(int x) { return x * x; }

constexpr int a = square(5);  // Compile-time
int b = square(10);           // Could be runtime

// consteval: MUST be compile-time
consteval int cube(int x) { return x * x * x; }

constexpr int c = cube(3);  // ✅ Compile-time
int n = 5;
int d = cube(n);            // ❌ Error: n is runtime

// constinit: Guarantees compile-time initialization, but mutable
constinit int global = 42;  // Initialized at compile-time
global = 100;               // ✅ OK: Can modify later
```

---

#### Q5: How do designated initializers work? What are the restrictions?

**Answer:**

Designated initializers let you initialize aggregate members by name:

```cpp
struct Point { int x, y, z; };

Point p {.x = 1, .y = 2, .z = 3};
```

**Restrictions:**

1. **Must follow declaration order:**
   ```cpp
   // ❌ Error: z before y
   Point p {.z = 3, .y = 2, .x = 1};

   // ✅ OK
   Point p {.x = 1, .y = 2, .z = 3};
   ```

2. **Can't mix with positional:**
   ```cpp
   // ❌ Error
   Point p {1, .y = 2, .z = 3};
   ```

3. **Can skip members (default-initialized):**
   ```cpp
   // ✅ OK: y and z are zero-initialized
   Point p {.x = 1};
   ```

4. **Works with nested structs:**
   ```cpp
   struct Line {
       Point start;
       Point end;
   };

   Line l {
       .start = {.x = 0, .y = 0},
       .end = {.x = 10, .y = 10}
   };
   ```

**Benefits:**
- Self-documenting
- Less error-prone than positional
- Clear intent

---

#### Q6: How do `[[likely]]` and `[[unlikely]]` attributes improve performance?

**Answer:**

These attributes help the compiler optimize branch prediction and instruction cache layout.

**How they work:**

```cpp
void process_request(Request req) {
    if (req.is_valid()) [[likely]] {
        // Most requests are valid - optimize for this path
        handle_request(req);
    } else [[unlikely]] {
        // Error path - less optimized, may be further away in code
        log_error(req);
    }
}
```

**Performance Benefits:**

1. **Better Branch Prediction:** CPU can prefetch instructions for likely path
2. **Code Layout:** Compiler places `[[likely]]` blocks in hot path, `[[unlikely]]` blocks further away
3. **Instruction Cache:** Keeps common paths in cache, reduces cache misses

**Benchmarks:**
- Can reduce branch mispredictions by 10-30% in hot loops
- Improves performance in error-handling heavy code
- Most effective when the likelihood is asymmetric (90%+ one way)

**Example Impact:**

```cpp
// Hot loop processing millions of items
for (auto& item : items) {
    if (item.is_error()) [[unlikely]] {
        handle_error(item);  // Rare: <0.1% of items
    } else [[likely]] {
        process(item);  // Common: >99.9% of items
    }
}
// Can improve throughput by 15-25% in such scenarios
```

---

#### Q7: What are template lambdas and when should you use them?

**Answer:**

Template lambdas (C++20) allow lambdas to have explicit template parameters:

```cpp
// C++20: Template lambda
auto print = []<typename T>(T value) {
    std::cout << "Value: " << value << ", Type: " << typeid(T).name() << '\n';
};

print(42);      // T = int
print(3.14);    // T = double
print("text");  // T = const char*
```

**When to use:**

1. **When you need the actual type:**
   ```cpp
   // Can't do this with auto:
   auto get_size = []<typename T>(const T& container) {
       using value_type = typename T::value_type;  // Need actual type
       return container.size();
   };
   ```

2. **Perfect forwarding:**
   ```cpp
   auto forward_call = []<typename... Args>(Args&&... args) {
       return some_function(std::forward<Args>(args)...);
   };
   ```

3. **SFINAE or concepts:**
   ```cpp
   auto process = []<std::integral T>(T value) {
       return value * 2;  // Only works with integers
   };
   ```

**Comparison:**

```cpp
// C++14: Generic lambda (auto)
auto lambda1 = [](auto x) { return x * 2; };  // Can't access T

// C++20: Template lambda
auto lambda2 = []<typename T>(T x) { return x * 2; };  // Can use T
```

---

#### Q8: Explain `using enum` and its benefits.

**Answer:**

`using enum` brings enum values into current scope:

**Before C++20:**
```cpp
enum class Color { Red, Green, Blue };

void paint(Color c) {
    switch (c) {
        case Color::Red:   break;  // Verbose
        case Color::Green: break;
        case Color::Blue:  break;
    }
}
```

**With C++20:**
```cpp
void paint(Color c) {
    using enum Color;  // Bring all enumerators into scope

    switch (c) {
        case Red:   break;  // Concise
        case Green: break;
        case Blue:  break;
    }
}
```

**Benefits:**

1. **Less Verbose:** Eliminates repetitive `Color::` prefix
2. **Scoped:** Only affects local scope, no global pollution
3. **Selective Import:** Can import specific values:
   ```cpp
   using Color::Red;
   using Color::Blue;
   // Green still requires Color::Green
   ```

4. **Multiple Enums:**
   ```cpp
   using enum Color;
   using enum Shape;
   // Both sets of enumerators available
   ```

**When NOT to use:**
- Avoid if names conflict with variables
- Don't use at global scope (defeats scoped enum purpose)

---

#### Q9: What's the difference between `constexpr` and `consteval` in practice?

**Answer:**

| Aspect | `constexpr` | `consteval` |
|--------|------------|-------------|
| **Can run at runtime** | ✅ Yes | ❌ No (compile error) |
| **Guaranteed compile-time** | ❌ No | ✅ Yes |
| **Flexibility** | Higher | Lower |
| **Use case** | General purpose | Force compile-time |

**Example:**

```cpp
constexpr int square(int x) { return x * x; }
consteval int cube(int x) { return x * x * x; }

int main() {
    // constexpr: Can be compile-time OR runtime
    constexpr int a = square(5);  // Compile-time ✅
    int n = 10;
    int b = square(n);            // Runtime ✅ (allowed)

    // consteval: MUST be compile-time
    constexpr int c = cube(3);    // Compile-time ✅
    int d = cube(n);              // ❌ Compile error: n is runtime
}
```

**When to use `consteval`:**

1. **Enforce compile-time computation:**
   ```cpp
   consteval size_t buffer_size(size_t n) {
       if (n > 1024) throw "Too large";
       return n * sizeof(int);
   }

   std::array<char, buffer_size(100)> buf;  // ✅ Validated at compile-time
   ```

2. **Meta-programming that makes no sense at runtime:**
   ```cpp
   consteval const char* get_build_timestamp() {
       return __TIMESTAMP__;  // Must be compile-time
   }
   ```

---

#### Q10: How does return type deduction work for `operator<=>`?

**Answer:**

Compiler chooses the **weakest** comparison category among all members:

```cpp
struct Example1 {
    int a;           // strong_ordering
    std::string b;   // strong_ordering

    auto operator<=>(const Example1&) const = default;
    // Deduced: strong_ordering (all members are strong)
};

struct Example2 {
    int a;      // strong_ordering
    double b;   // partial_ordering (due to NaN)

    auto operator<=>(const Example2&) const = default;
    // Deduced: partial_ordering (weakest wins)
};
```

**Category Hierarchy (weakest to strongest):**

```
partial_ordering  (weakest)
    ↓
weak_ordering
    ↓
strong_ordering   (strongest)
```

**Manual Specification:**

```cpp
struct Explicit {
    int a;
    double b;  // Would normally give partial_ordering

    // Force strong_ordering (only safe if you handle NaN yourself)
    std::strong_ordering operator<=>(const Explicit& other) const {
        if (auto cmp = a <=> other.a; cmp != 0)
            return cmp;
        // Custom handling for double (ignore NaN)
        if (b < other.b) return std::strong_ordering::less;
        if (b > other.b) return std::strong_ordering::greater;
        return std::strong_ordering::equal;
    }
};
```

---

#### Q11: Can you mix designated and positional initializers?

**Answer:**

**No, you cannot mix them in C++20.**

```cpp
struct Point { int x, y, z; };

// ❌ Error: Can't mix positional and designated
Point p1{1, .y = 2, .z = 3};

// ✅ OK: All positional
Point p2{1, 2, 3};

// ✅ OK: All designated
Point p3{.x = 1, .y = 2, .z = 3};

// ✅ OK: Partial designated (others default-initialized)
Point p4{.x = 1};  // y=0, z=0
```

**Rationale:** Mixing would be ambiguous and error-prone.

**Nested Structures:**

```cpp
struct Line {
    Point start;
    Point end;
};

// ✅ OK: Each level uses one style
Line l1{
    .start = {1, 2, 3},           // Positional for Point
    .end = {.x=4, .y=5, .z=6}     // Designated for Point
};
```

---

#### Q12: What happens if you don't define `operator==` with `operator<=>`?

**Answer:**

**`operator==` is NOT automatically generated from `operator<=>`.**

```cpp
struct Point {
    int x, y;
    auto operator<=>(const Point&) const = default;
};

Point p1{1, 2}, p2{1, 2};

// ✅ OK: Ordering operators work
bool less = p1 < p2;      // OK
bool greater = p1 > p2;   // OK

// ❌ Error: No operator==
bool equal = p1 == p2;    // Compile error!
```

**Solution: Define both:**

```cpp
struct Point {
    int x, y;
    auto operator<=>(const Point&) const = default;
    bool operator==(const Point&) const = default;  // Add this
};
```

**Why separate?**

Performance optimization:
```cpp
struct BigData {
    std::vector<int> data;

    // Efficient equality: O(n) with early exit
    bool operator==(const BigData& other) const {
        return data.size() == other.size() &&
               std::equal(data.begin(), data.end(), other.begin());
    }

    // Ordering: O(n) lexicographic comparison
    auto operator<=>(const BigData& other) const {
        return data <=> other.data;
    }
};
```

---

#### Q13: How do comparison categories convert?

**Answer:**

**Implicit Conversions (Weaker to Stronger):**

```cpp
std::strong_ordering s = std::strong_ordering::less;

// ✅ OK: strong → weak
std::weak_ordering w = s;

// ✅ OK: strong → partial
std::partial_ordering p1 = s;

// ✅ OK: weak → partial
std::partial_ordering p2 = w;

// ❌ Error: Can't convert stronger to weaker
// std::strong_ordering s2 = w;  // Compile error
```

**Conversion Rules:**

```
strong_ordering
    ↓ (implicit)
weak_ordering
    ↓ (implicit)
partial_ordering
```

**Practical Example:**

```cpp
std::strong_ordering compare_ints(int a, int b) {
    return a <=> b;
}

std::partial_ordering compare_mixed(int a, double b) {
    // int <=> double returns partial_ordering
    return a <=> b;
}

void use_comparison() {
    auto result1 = compare_ints(5, 10);  // strong_ordering

    // Can assign to partial_ordering
    std::partial_ordering result2 = result1;  // ✅ OK
}
```

---

#### Q14: What are the restrictions on designated initializers?

**Answer:**

**1. Must Match Declaration Order:**

```cpp
struct Data { int a, b, c; };

// ❌ Error: Wrong order
Data d1{.c = 3, .b = 2, .a = 1};

// ✅ OK: Correct order
Data d2{.a = 1, .b = 2, .c = 3};
```

**2. Can't Mix with Positional:**

```cpp
// ❌ Error
Data d3{1, .b = 2, .c = 3};
```

**3. Only for Aggregates:**

```cpp
struct NonAggregate {
    int x;
    NonAggregate(int val) : x(val) {}  // Has constructor
};

// ❌ Error: Not an aggregate
// NonAggregate n{.x = 10};
```

**4. Can Skip Members:**

```cpp
// ✅ OK: Skipped members are default-initialized
Data d4{.a = 1};  // b=0, c=0
```

**5. Must Use Brace Initialization:**

```cpp
// ❌ Error: Parentheses not allowed with designators
// Data d5(.a = 1);

// ✅ OK
Data d6{.a = 1};
```

**6. Works with Nested Structs:**

```cpp
struct Inner { int x, y; };
struct Outer { Inner in; int z; };

// ✅ OK
Outer o{.in = {.x = 1, .y = 2}, .z = 3};
```

---

#### Q15: When would you use conditionally explicit constructors?

**Answer:**

Used when convertibility should depend on a compile-time condition:

```cpp
template<typename T>
class SmartPointer {
    T* ptr;

public:
    // Constructor is explicit ONLY if U* is not convertible to T*
    template<typename U>
    explicit(!std::is_convertible_v<U*, T*>)
    SmartPointer(U* p) : ptr(p) {}
};

struct Base {};
struct Derived : Base {};

int main() {
    Derived* d = new Derived;

    // ✅ Implicit conversion OK (Derived* → Base*)
    SmartPointer<Base> ptr1 = new Derived;

    // ✅ Explicit conversion required (unrelated types)
    SmartPointer<int> ptr2 = SmartPointer<int>(new int);
}
```

**Use Cases:**

1. **Type-safe wrappers:**
   ```cpp
   template<typename T>
   struct Optional {
       template<typename U>
       explicit(!std::is_convertible_v<U, T>)
       Optional(U&& value) { /* ... */ }
   };
   ```

2. **Smart pointers with inheritance:**
   ```cpp
   template<typename T>
   class unique_ptr {
       template<typename U>
       explicit(!std::is_convertible_v<U*, T*>)
       unique_ptr(unique_ptr<U>&& other);
   };
   ```

**Benefits:**
- Allows implicit conversion when safe
- Forces explicit conversion when potentially unsafe
- Single constructor instead of two overloads

---

#### Q16: How does `constinit` differ from `constexpr` for global variables?

**Answer:**

| Feature | `constexpr` | `constinit` |
|---------|------------|-------------|
| **Mutability** | Immutable | Mutable |
| **Initialization** | Compile-time | Compile-time |
| **Value known at compile-time** | ✅ Yes (always) | ✅ Yes (initially) |
| **Can modify later** | ❌ No | ✅ Yes |

**Examples:**

```cpp
// constexpr: Constant value
constexpr int MAX_SIZE = 100;
MAX_SIZE = 200;  // ❌ Error: Can't modify

// constinit: Initialized at compile-time, but mutable
constinit int current_size = 100;
current_size = 200;  // ✅ OK: Can modify

// Guarantees no static initialization order fiasco
constinit int global1 = 42;
constinit int global2 = global1 * 2;  // Safe: global1 already exists
```

**When to use `constinit`:**

1. **Thread-local storage:**
   ```cpp
   thread_local constinit int thread_counter = 0;  // Initialized at compile-time
   ```

2. **Avoid initialization order fiasco:**
   ```cpp
   // header.h
   extern constinit int shared_config;

   // source1.cpp
   constinit int shared_config = 42;

   // source2.cpp
   constinit int derived_config = shared_config * 2;  // Safe
   ```

---

#### Q17: Can you have a base class comparison with `operator<=>`?

**Answer:**

**Yes, defaulted `operator<=>` automatically includes base class comparison:**

```cpp
struct Base {
    int x;
    auto operator<=>(const Base&) const = default;
};

struct Derived : Base {
    int y;
    auto operator<=>(const Derived&) const = default;  // Compares Base::x first!
};

int main() {
    Derived d1{.x = 1, .y = 2};
    Derived d2{.x = 1, .y = 3};

    auto cmp = d1 <=> d2;
    // Order of comparison:
    // 1. Base::x (1 <=> 1 = equal)
    // 2. Derived::y (2 <=> 3 = less)
    // Result: less
}
```

**Custom Base Class Comparison:**

```cpp
struct Derived : Base {
    int y;

    // Custom: Compare y first, then base
    auto operator<=>(const Derived& other) const {
        if (auto cmp = y <=> other.y; cmp != 0)
            return cmp;
        return Base::operator<=>(other);  // Then compare base
    }
};
```

---

#### Q18: What's the performance impact of branch prediction attributes?

**Answer:**

**Measurable Performance Gains in Specific Scenarios:**

**Scenario 1: Error Handling**

```cpp
// Without attribute
Result process(Data data) {
    if (data.is_corrupt()) {  // Happens <0.01% of the time
        return handle_error(data);
    }
    return fast_process(data);
}

// With attribute
Result process(Data data) {
    if (data.is_corrupt()) [[unlikely]] {
        return handle_error(data);
    }
    return fast_process(data);
}

// Benchmark: 8-15% faster with [[unlikely]] (millions of iterations)
```

**Scenario 2: Hot Loop**

```cpp
for (auto& item : million_items) {
    if (item.needs_special_processing()) [[unlikely]] {  // 1% of items
        special_process(item);
    } else [[likely]] {  // 99% of items
        normal_process(item);
    }
}

// Benchmark: 12-18% improvement with proper attributes
```

**When It Doesn't Help:**

1. **Balanced branches (50/50):** No benefit
2. **Already-optimal CPU prediction:** Minimal gain
3. **Cold code paths:** Branch prediction not critical

**Best Practices:**

- Use when branch probability is >90% in one direction
- Profile first: Don't guess likelihood
- Most effective in hot loops and error handling

---

#### Q19: How do template lambdas help with perfect forwarding?

**Answer:**

Template lambdas enable perfect forwarding in lambdas:

**Problem with Generic Lambdas (C++14):**

```cpp
// C++14: Can't perfect forward
auto wrapper1 = [](auto&& arg) {
    // Can't use std::forward properly
    return func(std::forward<???>(arg));  // What type?
};
```

**Solution with Template Lambda (C++20):**

```cpp
// C++20: Can perfectly forward
auto wrapper2 = []<typename T>(T&& arg) {
    return func(std::forward<T>(arg));  // ✅ Correct type
};

// Variadic version
auto wrapper3 = []<typename... Args>(Args&&... args) {
    return func(std::forward<Args>(args)...);
};
```

**Practical Example:**

```cpp
#include <utility>
#include <iostream>

void process(int& x) { std::cout << "lvalue: " << x << '\n'; }
void process(int&& x) { std::cout << "rvalue: " << x << '\n'; }

int main() {
    auto forwarder = []<typename T>(T&& arg) {
        process(std::forward<T>(arg));
    };

    int a = 10;
    forwarder(a);     // Calls lvalue version
    forwarder(20);    // Calls rvalue version
}
```

**Output:**
```
lvalue: 10
rvalue: 20
```

---

#### Q20: What are aggregate improvements in C++20?

**Answer:**

**C++20 Added Two Major Aggregate Enhancements:**

**1. Parenthesized Initialization:**

```cpp
struct Point { int x, y; };

// C++17: Only braces
Point p1{1, 2};

// ✅ C++20: Parentheses also work
Point p2(1, 2);
Point p3 = Point(3, 4);
```

**2. Aggregates with Base Classes:**

```cpp
struct Base { int id; };
struct Derived : Base { std::string name; };

// ✅ C++20: Can initialize base class members
Derived d1{.id = 1, .name = "Alice"};

// Also works with positional
Derived d2{2, "Bob"};
```

**What Qualifies as an Aggregate in C++20:**

```cpp
// ✅ Aggregate
struct A {
    int x;
    double y;
};

// ✅ Aggregate (with base)
struct B : A {
    std::string s;
};

// ❌ Not Aggregate (has constructor)
struct C {
    int x;
    C(int val) : x(val) {}
};

// ❌ Not Aggregate (has virtual function)
struct D {
    virtual void foo();
};
```

**Benefits:**

- More flexible initialization syntax
- Simpler inheritance initialization
- Better integration with designated initializers

---

### PRACTICE_TASKS: Predict the Output

---

#### Q1

Spaceship Operator Basics

```cpp
#include <compare>
#include <iostream>

struct Point {
    int x, y;
    auto operator<=>(const Point&) const = default;
};

int main() {
    Point p1{1, 2}, p2{1, 3};
    auto result = p1 <=> p2;

    if (result < 0) {
        std::cout << "less";
    } else if (result > 0) {
        std::cout << "greater";
    } else {
        std::cout << "equal";
    }
}
```

**Answer:**
```
less
```

**Explanation:** Compares `x` first (1 == 1), then `y` (2 < 3) → `less`.

---

#### Q2

Designated Initializers

```cpp
#include <iostream>

struct Config {
    int a = 10;
    int b = 20;
    int c = 30;
};

int main() {
    Config cfg{.b = 100};
    std::cout << cfg.a << " " << cfg.b << " " << cfg.c;
}
```

**Answer:**
```
10 100 30
```

**Explanation:** Only `b` is overridden, `a` and `c` use default values.

---

#### Q3

Comparison Category Deduction

```cpp
#include <compare>
#include <iostream>

struct Data {
    int a;
    double b;  // Has partial_ordering
    auto operator<=>(const Data&) const = default;
};

int main() {
    Data d1{1, 2.0};
    Data d2{1, 3.0};

    auto result = d1 <=> d2;

    // What type is result?
    if (result < 0) {
        std::cout << "less";
    }
}
```

**Answer:**
```
less
```

**Explanation:**
- `result` type is `std::partial_ordering` (weakest member wins)
- `int` → strong_ordering, `double` → partial_ordering
- Compiler chooses `partial_ordering`
- Compares: `a` first (1 == 1), then `b` (2.0 < 3.0) → less

---

#### Q4

Designated Initializer Order

```cpp
#include <iostream>

struct Point {
    int x = 0;
    int y = 0;
    int z = 0;
};

int main() {
    Point p{.x = 10, .z = 30};
    std::cout << p.x << " " << p.y << " " << p.z;
}
```

**Answer:**
```
10 0 30
```

**Explanation:** Skipped member `y` is default-initialized to 0.

---

#### Q5

consteval Compile-Time Enforcement

```cpp
#include <iostream>

consteval int compute(int x) {
    return x * x;
}

int main() {
    constexpr int a = compute(5);  // Line 1
    int b = 10;
    int c = compute(b);             // Line 2

    std::cout << a;
}
```

**Answer:**
```
Compilation Error at Line 2
```

**Explanation:**
- Line 1: ✅ `compute(5)` is compile-time (literal)
- Line 2: ❌ `compute(b)` fails - `b` is a runtime variable
- `consteval` functions MUST be called with compile-time constants

---

#### Q6

constinit Mutability

```cpp
#include <iostream>

constinit int global1 = 100;
constexpr int global2 = 200;

int main() {
    global1 = 150;  // Line 1
    global2 = 250;  // Line 2

    std::cout << global1;
}
```

**Answer:**
```
Compilation Error at Line 2
```

**Explanation:**
- `constinit`: Compile-time initialization, but **mutable** ✅
- `constexpr`: Compile-time constant, **immutable** ❌
- Line 1: ✅ OK
- Line 2: ❌ Error: can't modify constexpr variable

---

#### Q7

using enum in Switch

```cpp
#include <iostream>

enum class Status { Ready, Running, Error };

int main() {
    Status s = Status::Running;

    using enum Status;

    switch (s) {
        case Ready:   std::cout << "R"; break;
        case Running: std::cout << "U"; break;
        case Error:   std::cout << "E"; break;
    }
}
```

**Answer:**
```
U
```

**Explanation:** `using enum Status` brings `Ready`, `Running`, `Error` into scope. `s` is `Running` → prints "U".

---

#### Q8

operator<=> Without operator==

```cpp
#include <compare>

struct Point {
    int x, y;
    auto operator<=>(const Point&) const = default;
    // Missing operator==
};

int main() {
    Point p1{1, 2}, p2{1, 2};
    bool less = p1 < p2;      // Line 1
    bool equal = p1 == p2;    // Line 2
}
```

**Answer:**
```
Compilation Error at Line 2
```

**Explanation:**
- `operator<=>` generates: `<`, `<=`, `>`, `>=` ✅
- `operator<=>` does NOT generate: `==`, `!=` ❌
- Line 1: ✅ OK (`<` is available)
- Line 2: ❌ Error (no `operator==`)

---

#### Q9

Template Lambda Type Access

```cpp
#include <iostream>
#include <vector>

int main() {
    auto get_size = []<typename T>(const T& container) {
        using value_type = typename T::value_type;
        return sizeof(value_type);
    };

    std::vector<int> v{1, 2, 3};
    std::vector<double> d{1.0, 2.0};

    std::cout << get_size(v) << " " << get_size(d);
}
```

**Answer:**
```
4 8
```

**Explanation:**
- Template lambda can access `T` type
- `vector<int>` → `value_type` = `int` → `sizeof(int)` = 4
- `vector<double>` → `value_type` = `double` → `sizeof(double)` = 8

---

#### Q10

Branch Hints with Nested Conditions

```cpp
#include <iostream>

void process(int x) {
    if (x > 0) [[likely]] {
        if (x > 100) [[unlikely]] {
            std::cout << "A";
        } else {
            std::cout << "B";
        }
    } else [[unlikely]] {
        std::cout << "C";
    }
}

int main() {
    process(50);
}
```

**Answer:**
```
B
```

**Explanation:**
- `x = 50`
- `x > 0` is true (likely path) ✅
- `x > 100` is false (50 < 100) → else branch
- Prints "B"

---

#### Q11

Comparison Category Conversion

```cpp
#include <compare>
#include <iostream>

int main() {
    std::strong_ordering s = std::strong_ordering::less;

    std::weak_ordering w = s;        // Line 1
    std::partial_ordering p = w;     // Line 2
    std::strong_ordering s2 = p;     // Line 3

    std::cout << "OK";
}
```

**Answer:**
```
Compilation Error at Line 3
```

**Explanation:**
- Implicit conversion: strong → weak → partial ✅
- Cannot convert back: partial → strong ❌
- Line 1: ✅ strong → weak
- Line 2: ✅ weak → partial
- Line 3: ❌ partial → strong (not allowed)

---

#### Q12

Parenthesized Aggregate Initialization

```cpp
#include <iostream>

struct Point { int x, y; };

int main() {
    Point p1{10, 20};     // Line 1
    Point p2(10, 20);     // Line 2
    Point p3 = Point(30, 40);  // Line 3

    std::cout << p2.x << " " << p3.y;
}
```

**Answer:**
```
10 40
```

**Explanation:** C++20 allows parenthesized aggregate initialization. All three lines are valid.

---

#### Q13

consteval Propagation

```cpp
#include <array>

consteval int square(int x) {
    return x * x;
}

constexpr int use_square(int x) {  // Line 1
    return square(x);
}

int main() {
    constexpr int result = use_square(5);
}
```

**Answer:**
```
Compilation Error at Line 1
```

**Explanation:**
- `consteval` functions can only be called from `consteval` context
- `constexpr` function tries to call `consteval` → error
- Solution: Change `use_square` to `consteval`

---

#### Q14

Mixed Designated and Positional Initializers

```cpp
#include <iostream>

struct Data {
    int a, b, c;
};

int main() {
    Data d{1, .b = 2, .c = 3};  // Line 1
    std::cout << d.a << d.b << d.c;
}
```

**Answer:**
```
Compilation Error at Line 1
```

**Explanation:** Cannot mix positional (`1`) and designated (`.b = 2`) initializers in C++20.

---

### QUICK_REFERENCE: Language Features Cheat Sheet

---

#### Three-Way Comparison

```cpp
// Default spaceship
struct T {
    auto operator<=>(const T&) const = default;
    bool operator==(const T&) const = default;
};

// Comparison categories
std::strong_ordering    // Fully ordered, substitutable
std::weak_ordering      // Fully ordered, not substitutable
std::partial_ordering   // Some values unordered
```

#### Designated Initializers

```cpp
struct Point { int x, y; };
Point p{.x = 1, .y = 2};  // Must match declaration order
```

#### Immediate Functions

```cpp
consteval int func() { /* must be compile-time */ }
constinit int global = 42;  // Compile-time init, mutable
```

#### Branch Hints

```cpp
if (condition) [[likely]] { /* ... */ }
if (error) [[unlikely]] { /* ... */ }
```

#### Enum Shortcuts

```cpp
enum class Color { Red, Green, Blue };
using enum Color;  // Red, Green, Blue in scope
```

#### Template Improvements

```cpp
[]<typename T>(T x) { /* template lambda */ };
template<double Ratio> /* floating-point NTTP */
```

---

**End of Topic 4: Language Features** (2,000+ lines)
