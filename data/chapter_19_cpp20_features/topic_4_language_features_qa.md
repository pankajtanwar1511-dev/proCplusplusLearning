## TOPIC: C++20 Language Features - Three-Way Comparison and Modern Syntax

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
