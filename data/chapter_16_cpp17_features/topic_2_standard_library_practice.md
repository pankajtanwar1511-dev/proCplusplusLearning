## TOPIC: C++17 Standard Library - optional, variant, any, string_view, filesystem

### PRACTICE_TASKS: Output Prediction and Analysis Questions

#### Q1
```cpp
#include <optional>
#include <iostream>
std::optional<int> get() { return std::nullopt; }
int main() {
    auto opt = get();
    std::cout << opt.value_or(42);
}
```

**Answer:**
```
42
```

**Explanation:**
- `std::nullopt` represents an empty optional (no value contained)
- `get()` returns empty optional
- `value_or(42)` returns contained value if present, otherwise returns default (42)
- Since optional is empty, returns the provided default value 42
- **Key Concept:** value_or provides safe access with fallback, avoiding exceptions when optional is empty

#### Q2
```cpp
#include <variant>
#include <iostream>
int main() {
    std::variant<int, double> v = 3.14;
    std::cout << std::get<1>(v);
}
```

**Answer:**
```
3.14
```

**Explanation:**
- `variant<int, double>` can hold either int or double
- Initialized with 3.14 (double), so variant holds double at index 1
- `std::get<1>(v)` accesses alternative by index (0=int, 1=double)
- Returns the double value 3.14
- **Key Concept:** std::get with index accesses variant alternatives by position; throws if wrong index

#### Q3
```cpp
#include <any>
#include <iostream>
int main() {
    std::any a = 42;
    if (auto* p = std::any_cast<int>(&a)) {
        std::cout << *p;
    }
}
```

**Answer:**
```
42
```

**Explanation:**
- `std::any` can hold any type with type erasure
- `any_cast<int>(&a)` with pointer argument returns pointer if type matches, nullptr otherwise
- Type matches (any contains int), so returns valid int* pointer
- Dereferences pointer to print 42
- **Key Concept:** any_cast with pointer returns nullptr on type mismatch instead of throwing; safer for checking

#### Q4
```cpp
#include <optional>
#include <iostream>
int main() {
    std::optional<int> opt;
    if (opt) {
        std::cout << "has value";
    } else {
        std::cout << "empty";
    }
}
```

**Answer:**
```
empty
```

**Explanation:**
- Default-constructed optional is empty (no value)
- `if (opt)` checks `has_value()` implicitly via bool conversion operator
- Since opt is empty, condition is false
- Prints "empty"
- **Key Concept:** optional provides implicit bool conversion to check presence; cleaner than explicit has_value()

#### Q5
```cpp
#include <variant>
#include <iostream>
int main() {
    std::variant<int, std::string> v = "hello";
    if (std::holds_alternative<std::string>(v)) {
        std::cout << std::get<std::string>(v);
    }
}
```

**Answer:**
```
hello
```

**Explanation:**
- Variant initialized with string literal, holds std::string (via conversion)
- `holds_alternative<std::string>(v)` checks if variant currently holds string (true)
- `std::get<std::string>(v)` retrieves by type (alternative to index access)
- Prints "hello"
- **Key Concept:** holds_alternative checks type before access; prevents bad_variant_access exceptions

#### Q6
```cpp
#include <optional>
#include <iostream>
int main() {
    std::optional<bool> opt = false;
    if (opt) {
        std::cout << "has value: " << *opt;
    }
}
```

**Answer:**
```
has value: 0
```

**Explanation:**
- `optional<bool>` initialized with false (has a value, the value is false)
- `if (opt)` checks presence (has_value()), NOT the contained bool value
- Since opt contains a value, condition is true
- `*opt` dereferences to get bool false, printed as 0
- **Key Concept:** optional's bool conversion checks presence, not the contained value; subtle with bool types

#### Q7
```cpp
#include <any>
#include <iostream>
int main() {
    std::any a = 3.14;
    try {
        std::cout << std::any_cast<int>(a);
    } catch(...) {
        std::cout << "error";
    }
}
```

**Answer:**
```
error
```

**Explanation:**
- `std::any` holds double (3.14)
- `any_cast<int>(a)` with value argument throws `bad_any_cast` if type mismatch
- Attempting to cast double to int fails (no implicit conversion)
- Exception caught, prints "error"
- **Key Concept:** any_cast by value throws on type mismatch; use pointer version for non-throwing check

#### Q8
```cpp
#include <variant>
#include <iostream>
int main() {
    std::variant<int, float> v = 42;
    std::cout << v.index();
}
```

**Answer:**
```
0
```

**Explanation:**
- Variant initialized with int 42
- `index()` returns zero-based index of currently active alternative
- int is first type (index 0), float is second (index 1)
- Returns 0
- **Key Concept:** variant's index() provides runtime type identification via alternative position

#### Q9
```cpp
#include <optional>
#include <iostream>
int main() {
    std::optional<int> opt1 = 10;
    std::optional<int> opt2;
    std::cout << (opt1.value() + opt2.value_or(5));
}
```

**Answer:**
```
15
```

**Explanation:**
- `opt1` contains 10, `opt2` is empty
- `opt1.value()` returns 10 (safe because opt1 has value)
- `opt2.value_or(5)` returns 5 (default, since opt2 is empty)
- Sum: 10 + 5 = 15
- **Key Concept:** Combining value() and value_or() allows safe operations mixing present and empty optionals

#### Q10
```cpp
#include <variant>
#include <iostream>
int main() {
    std::variant<int, double, std::string> v = 42.0;
    std::visit([](auto&& val) {
        std::cout << val;
    }, v);
}
```

**Answer:**
```
42
```

**Explanation:**
- Variant initialized with double 42.0
- `std::visit` applies callable (lambda) to currently held alternative
- Generic lambda with `auto&&` deduces double type
- `std::cout << 42.0` prints as "42" (default formatting drops unnecessary decimals)
- **Key Concept:** std::visit provides type-safe variant access via visitor pattern without explicit type checking

---
