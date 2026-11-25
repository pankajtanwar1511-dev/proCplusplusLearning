## TOPIC: std::variant, std::visit and std::any

### PRACTICE_TASKS: Output Prediction and Bug Hunting

#### Q1
```cpp
// Q: What does this print with GCC 11 (-std=c++20)?
#include <iostream>
#include <string>
#include <variant>

int main() {
    std::variant<bool, std::string> a = "hello";
    std::variant<std::string, const char*> b = "hello";
    std::variant<long, double> c = 1;
    std::variant<int, long> d = 1u;
    std::cout << a.index() << ' ' << b.index() << ' '
              << c.index() << ' ' << d.index() << '\n';
}
```

**Answer:**
```
1 1 0 1
```

**Explanation:**
- `a`: since P0608 (GCC 10+), `const char*` to `bool` is not considered, so the string alternative is chosen. Older libraries (original C++17 rules) picked `bool` and printed `0`.
- `b`: `const char[6]` decays to `const char*`, an exact match; the `std::string` route needs a user-defined conversion.
- `c`: `int` to `long` is a widening integral conversion, not narrowing; `int` to `double` is narrowing (for a non-constant source), so it is excluded. Result: `long`.
- `d`: `unsigned` to `int` narrows; `unsigned` to 64-bit `long` does not (x86-64 Linux). Result: `long`. On a platform with 32-bit `long` this line does not compile.
- **Key Concept:** The converting constructor is overload resolution with narrowing and pointer-to-bool removed; state the alternative explicitly when it matters.

---

#### Q2
```cpp
// Q: Does this compile?
#include <iostream>
#include <variant>

int main() {
    long raw_qty = 250;
    std::variant<int, double> qty = raw_qty;
    std::cout << qty.index() << '\n';
}
```

**Answer:**
```
Compile error: conversion from 'long int' to non-scalar type
'std::variant<int, double>' requested
```

**Explanation:**
- `long → int` and `long → double` are both narrowing conversions, so neither alternative is viable for the converting constructor (P0608).
- Before P0608 this was ambiguous (also an error), so the code never worked; the error message just changed.
- Fix: decide the alternative: `std::variant<int, double> qty = static_cast<int>(raw_qty);`, or `std::variant<int, double> qty{std::in_place_type<double>, raw_qty};`, or add `long` to the alternatives.
- **Key Concept:** A variant refuses to guess when every conversion would lose information.

**Fixed Version:**
```cpp
#include <iostream>
#include <variant>

int main() {
    long raw_qty = 250;
    std::variant<int, double> qty{std::in_place_type<double>, raw_qty};
    std::cout << qty.index() << ' ' << std::get<double>(qty) << '\n';   // 1 250
}
```

---

#### Q3
```cpp
// Q: What does this print? Is anything wrong?
#include <iostream>
#include <string>
#include <variant>

template <class... Ts> struct overloaded : Ts... { using Ts::operator()...; };
template <class... Ts> overloaded(Ts...) -> overloaded<Ts...>;

using Field = std::variant<int, double, std::string>;

int main() {
    Field price = 101.75;
    std::visit(overloaded{
        [](int v) { std::cout << "int " << v << '\n'; },
        [](const std::string& s) { std::cout << "text " << s << '\n'; },
    }, price);
}
```

**Answer:**
```
int 101
```

**Explanation:**
- There is no `double` handler, but the visitor still compiles: overload resolution converts `double` to `int` and calls the `int` lambda, truncating 101.75 to 101.
- `std::visit` checks that the visitor is *callable* with every alternative, not that each alternative has its own handler.
- GCC 11 gives no warning at `-Wall -Wextra` (the conversion happens inside the library).
- Guard: add a template catch-all that fails at compile time, so only exact handlers are accepted.
- **Key Concept:** Exhaustiveness in `visit` is "callable with", and implicit conversions count.

**Fixed Version:**
```cpp
#include <iostream>
#include <string>
#include <variant>

template <class... Ts> struct overloaded : Ts... { using Ts::operator()...; };
template <class... Ts> overloaded(Ts...) -> overloaded<Ts...>;

using Field = std::variant<int, double, std::string>;

int main() {
    Field price = 101.75;
    std::visit(overloaded{
        [](int v) { std::cout << "int " << v << '\n'; },
        [](double v) { std::cout << "double " << v << '\n'; },
        [](const std::string& s) { std::cout << "text " << s << '\n'; },
        [](const auto& x) { static_assert(sizeof(x) == 0, "unhandled alternative"); },
    }, price);                                         // double 101.75
}
```

---

#### Q4
```cpp
// Q: Is this well-defined? What may it print?
#include <iostream>
#include <string>
#include <variant>

int main() {
    std::variant<int, std::string> field = 42;
    int& qty = std::get<int>(field);

    field = std::string("pending-confirmation-from-venue");
    std::cout << qty << '\n';
}
```

**Answer:**
```
Undefined behaviour: qty refers to an int whose lifetime ended.
GCC 11, -O0: printed an arbitrary number (on libstdc++ those bytes now hold part of the string's data pointer),
different on each run. ASan reports nothing: no memory was freed.
```

**Explanation:**
- Assigning a `std::string` destroys the `int` alternative and constructs a string in the same storage. `qty` still points at those bytes, which now belong to the string object (its first member is the heap pointer).
- Reading prints garbage; writing through `qty` would corrupt the string's pointer and crash later in its destructor.
- ASan is silent because the bytes are valid stack memory: only the object changed.
- Assigning another `int` (`field = 7;`) would have kept `qty` valid: same alternative, assignment instead of destroy + construct.
- **Key Concept:** A reference into a variant is valid only while that alternative stays active; re-fetch after every possible alternative change.

**Fixed Version:**
```cpp
#include <iostream>
#include <string>
#include <variant>

int main() {
    std::variant<int, std::string> field = 42;
    int qty = std::get<int>(field);                  // copy the value out

    field = std::string("pending-confirmation-from-venue");
    std::cout << qty << '\n';                        // 42
    if (auto* p = std::get_if<int>(&field)) std::cout << *p << '\n';   // not printed
}
```

---

#### Q5
```cpp
// Q: What does this print?
#include <iostream>
#include <stdexcept>
#include <string>
#include <variant>

struct Snapshot {
    Snapshot() = default;
    Snapshot(const Snapshot&) { throw std::runtime_error("copy failed"); }
};

int main() {
    std::variant<std::string, Snapshot> state = std::string("ready");
    Snapshot snap;
    try {
        state = snap;
    } catch (const std::exception&) {
        std::cout << "assignment failed\n";
    }
    std::cout << state.index() << '\n';
    std::cout << std::holds_alternative<std::string>(state)
              << std::holds_alternative<Snapshot>(state) << '\n';
}
```

**Answer:**
```
assignment failed
18446744073709551615
00
```

**Explanation:**
- `Snapshot` has a user-declared copy constructor, so it has no move constructor. The library therefore destroys the string first and copy-constructs `Snapshot` in place; the copy throws.
- The variant now holds nothing: `valueless_by_exception()` is true and `index()` returns `std::variant_npos` (`size_t(-1)`, printed as 18446744073709551615 on 64-bit).
- `holds_alternative` is false for every type; `get` and `visit` would throw `bad_variant_access`.
- Code like `names[state.index()]` would index far out of bounds.
- **Key Concept:** A throwing switch of alternatives can leave a variant valueless; nothrow-movable alternatives let the library avoid it.

---

#### Q6
```cpp
// Q: Does this compile?
#include <iostream>
#include <string>
#include <variant>

int main() {
    std::variant<int, std::string> v = 5;
    auto doubled = std::visit([](const auto& x) { return x + x; }, v);
    std::cout << doubled << '\n';
}
```

**Answer:**
```
Compile error (GCC 11): static assertion failed: std::visit requires the visitor
to have the same return type for all alternatives of a variant
```

**Explanation:**
- For `int` the lambda returns `int`; for `std::string` it returns `std::string`. `visit` must have a single return type.
- Fixes: return a common type explicitly (e.g. `-> std::string` with `std::to_string` for numbers), use C++20 `std::visit<R>`, or return a new variant.
- **Key Concept:** Every branch of a visit returns the same type.

**Fixed Version:**
```cpp
#include <iostream>
#include <string>
#include <type_traits>
#include <variant>

int main() {
    std::variant<int, std::string> v = 5;
    auto doubled = std::visit([](const auto& x) -> std::string {
        if constexpr (std::is_same_v<std::decay_t<decltype(x)>, int>)
            return std::to_string(x + x);
        else
            return x + x;
    }, v);
    std::cout << doubled << '\n';                    // 10
}
```

---

#### Q7
```cpp
// Q: What does this print?
#include <any>
#include <iostream>

int main() {
    std::any a = 42;
    std::cout << (std::any_cast<long>(&a) == nullptr) << ' ';
    std::cout << (std::any_cast<int>(&a) == nullptr) << ' ';
    try {
        std::cout << std::any_cast<unsigned>(a) << '\n';
    } catch (const std::bad_any_cast&) {
        std::cout << "bad cast\n";
    }
}
```

**Answer:**
```
1 0 bad cast
```

**Explanation:**
- `any` remembers the exact stored type: `int`. The pointer form `any_cast<T>(&a)` returns `nullptr` for any other `T`, even `long` or `unsigned`.
- The value form `any_cast<T>(a)` throws `std::bad_any_cast` instead.
- No numeric promotions or conversions happen; the check is a `type_info` comparison.
- **Key Concept:** `any_cast` matches the exact stored type; there are no conversions.

---

#### Q8
```cpp
// Q: Does this compile?
#include <any>
#include <iostream>
#include <memory>
#include <vector>

struct Order { int id; };

int main() {
    std::vector<std::any> payloads;
    payloads.push_back(std::make_unique<Order>(Order{7}));
    std::cout << payloads.size() << '\n';
}
```

**Answer:**
```
Compile error: no matching function for call to 'std::vector<std::any>::push_back(...)'
(std::any cannot be constructed from the move-only std::unique_ptr<Order>)
```

**Explanation:**
- `std::any` is copyable, so it only accepts copy-constructible contents; its constructor template is constrained away for `unique_ptr`.
- `std::move` does not help: the problem is the type, not the value category.
- Options: `std::shared_ptr<Order>` (copyable handle), store `Order` by value, or use a `std::variant` / a move-only type-erased wrapper.
- **Key Concept:** `std::any` requires copy-constructible contents.

**Fixed Version:**
```cpp
#include <any>
#include <iostream>
#include <memory>
#include <vector>

struct Order { int id; };

int main() {
    std::vector<std::any> payloads;
    payloads.push_back(std::make_shared<Order>(Order{7}));
    auto p = std::any_cast<std::shared_ptr<Order>>(payloads[0]);
    std::cout << payloads.size() << ' ' << p->id << '\n';   // 1 7
}
```

---

#### Q9
```cpp
// Q: Does this compile?
#include <iostream>
#include <string>
#include <variant>

struct Order {
    explicit Order(int id) : id(id) {}
    int id;
};

int main() {
    std::variant<Order, std::string> slot;
    slot = Order{5};
    std::cout << std::get<Order>(slot).id << '\n';
}
```

**Answer:**
```
Compile error: use of deleted function
'std::variant<_Types>::variant() [with _Types = {Order, std::__cxx11::basic_string<char>}]'
```

**Explanation:**
- A default-constructed variant holds a value-initialized **first** alternative. `Order` has no default constructor, so the variant's default constructor is deleted.
- Even if `Order` had one, "a default Order" may not be a meaningful initial state.
- Fix: put `std::monostate` first to represent "nothing yet" explicitly.
- **Key Concept:** The first alternative decides default construction; use `std::monostate` for an explicit empty state.

**Fixed Version:**
```cpp
#include <iostream>
#include <string>
#include <variant>

struct Order {
    explicit Order(int id) : id(id) {}
    int id;
};

int main() {
    std::variant<std::monostate, Order, std::string> slot;
    std::cout << std::holds_alternative<std::monostate>(slot) << '\n';   // 1
    slot = Order{5};
    std::cout << std::get<Order>(slot).id << '\n';                       // 5
}
```

---

#### Q10
```cpp
// Q: What does this print?
#include <iostream>
#include <string>
#include <variant>

int main() {
    std::variant<int, std::string> a = 100;
    std::variant<int, std::string> b = std::string("1");
    std::variant<int, std::string> c = 5;

    std::cout << (a < b) << ' ' << (b < a) << ' ' << (c < a) << '\n';
}
```

**Answer:**
```
1 0 1
```

**Explanation:**
- Variants compare by **index first**: if the active alternatives differ, the one with the smaller index is smaller, whatever the values.
- `a` holds index 0 (`int`), `b` index 1 (`string`): `a < b` is true even though "100 vs 1" might suggest otherwise.
- `c < a`: same index, so the values are compared: `5 < 100`.
- Reordering the alternatives in the type changes the sort order of all stored data.
- **Key Concept:** Variant ordering is (index, then value); alternatives of different types never compare their values.

---

#### Q11
```cpp
// Q: What does this print?
#include <any>
#include <iostream>
#include <vector>

int main() {
    std::any a = std::vector<int>{1, 2};
    std::any b = a;

    std::any_cast<std::vector<int>&>(b).push_back(3);
    std::any_cast<std::vector<int>>(a).push_back(9);

    std::cout << std::any_cast<std::vector<int>&>(a).size() << ' '
              << std::any_cast<std::vector<int>&>(b).size() << '\n';
}
```

**Answer:**
```
2 3
```

**Explanation:**
- `std::any b = a;` deep-copies the vector: `a` and `b` are independent.
- `any_cast<std::vector<int>&>(b)` returns a reference to the vector inside `b`, so `push_back(3)` changes `b`.
- `any_cast<std::vector<int>>(a)` (no `&`) returns a **copy**; `push_back(9)` modifies that temporary copy, and `a` is unchanged.
- **Key Concept:** `any` has value semantics; `any_cast<T>` copies, `any_cast<T&>` refers.

---

#### Q12
```cpp
// Q: What does this print? Which line would throw?
#include <iostream>
#include <variant>

int main() {
    std::variant<int, int> timeout_or_retries{std::in_place_index<1>, 3};
    std::cout << timeout_or_retries.index() << ' '
              << std::get<1>(timeout_or_retries) << '\n';
    try {
        std::cout << std::get<0>(timeout_or_retries) << '\n';
    } catch (const std::bad_variant_access& e) {
        std::cout << "get<0>: " << e.what() << '\n';
    }
}
```

**Answer:**
```
1 3
get<0>: std::get: wrong index for variant
```

**Explanation:**
- Duplicate alternatives are legal; each index is a separate state even though both hold `int`.
- `std::in_place_index<1>` selects the second slot; `get<1>` reads it.
- `get<0>` throws `bad_variant_access` because index 0 is not active (the `what()` text is libstdc++'s).
- `get<int>`, `holds_alternative<int>` or `timeout_or_retries = 3;` would not compile: `int` occurs twice.
- **Key Concept:** With duplicate types, a variant is addressed only by index; distinct wrapper types are clearer.

---
