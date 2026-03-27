## TOPIC: C++20 Language Features - Three-Way Comparison and Modern Syntax

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
