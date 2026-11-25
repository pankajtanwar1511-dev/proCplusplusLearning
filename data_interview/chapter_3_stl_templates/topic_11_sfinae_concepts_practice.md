## TOPIC: SFINAE, Type Traits and Concepts

### PRACTICE_TASKS: Output Prediction and Bug Hunting

#### Q1
```cpp
// Q: Does this compile? If yes, what does it print?
#include <iostream>
#include <type_traits>

template <class T, std::enable_if_t<std::is_floating_point_v<T>, int> = 0>
void print(T v) { std::cout << "floating " << v << '\n'; }

template <class T>
void print(T v) { std::cout << "generic " << v << '\n'; }

int main() {
    print(7);
    print(2.5);
}
```

**Answer:**
```
Compile error: call of overloaded 'print(double)' is ambiguous
(print(7) alone would compile and print "generic 7")
```

**Explanation:**
- `print(7)`: the `enable_if` overload is removed by SFINAE (`int` is not floating point), only the generic one is viable.
- `print(2.5)`: both overloads are viable, both take a `double`. Partial ordering compares parameter types only, and the `enable_if` condition is not part of that comparison, so neither is more specialized.
- Fix: add `std::enable_if_t<!std::is_floating_point_v<T>, int> = 0` to the generic overload, or use `template <std::floating_point T>` (a constrained template beats an unconstrained one).
- **Key Concept:** SFINAE only removes candidates; it never makes one candidate better than another.

**Fixed Version:**
```cpp
#include <concepts>
#include <iostream>

template <std::floating_point T>
void print(T v) { std::cout << "floating " << v << '\n'; }

template <class T>
void print(T v) { std::cout << "generic " << v << '\n'; }

int main() {
    print(7);     // generic 7
    print(2.5);   // floating 2.5
}
```

---

#### Q2
```cpp
// Q: Does this compile? If yes, what does it print?
#include <iostream>
#include <string>

template <class T>
void process(const T&) { std::cout << "generic\n"; }

template <class T>
auto process(const T& t) -> decltype(t.size(), void()) {
    std::cout << "has size " << t.size() << '\n';
}

int main() {
    process(10);
    process(std::string("hello"));
}
```

**Answer:**
```
Compile error: call of overloaded 'process(std::string)' is ambiguous
```

**Explanation:**
- `process(10)`: `decltype(t.size(), void())` fails for `int` (SFINAE), so only the generic overload remains: fine.
- `process(std::string(...))`: both templates are viable with parameter `const std::string&`; the trailing return type does not make the second one more specialized.
- A common wrong explanation claims it prints "has size 5". GCC rejects it.
- Fix: priority tags, or a `requires` clause (`requires requires { t.size(); }` / a `HasSize` concept), which concepts rank above the unconstrained overload.
- **Key Concept:** Expression SFINAE in a return type is still only a viability filter.

**Fixed Version:**
```cpp
#include <iostream>
#include <string>

template <int N> struct priority : priority<N - 1> {};
template <> struct priority<0> {};

template <class T>
void process_impl(const T&, priority<0>) { std::cout << "generic\n"; }

template <class T>
auto process_impl(const T& t, priority<1>) -> decltype(t.size(), void()) {
    std::cout << "has size " << t.size() << '\n';
}

template <class T>
void process(const T& t) { process_impl(t, priority<1>{}); }

int main() {
    process(10);                      // generic
    process(std::string("hello"));    // has size 5
}
```

---

#### Q3
```cpp
// Q: Does this compile?
#include <iostream>
#include <type_traits>

template <class T, class = std::enable_if_t<std::is_integral_v<T>>>
void scale(T v) { std::cout << "int " << v * 2 << '\n'; }

template <class T, class = std::enable_if_t<std::is_floating_point_v<T>>>
void scale(T v) { std::cout << "float " << v * 2 << '\n'; }

int main() {
    scale(3);
    scale(1.5);
}
```

**Answer:**
```
Compile error: redefinition of 'template<class T, class> void scale(T)'
```

**Explanation:**
- Default template arguments are not part of a function template's signature. Both declarations are `template <class T, class> void scale(T)`: the same template defined twice.
- The error is at the second definition, before any call is considered.
- Fix: put the condition into the template parameter's type: `std::enable_if_t<Cond, int> = 0`. Now the two templates have different non-type parameter types and are distinct.
- **Key Concept:** Use the `enable_if_t<C, int> = 0` form when overloading on conditions.

**Fixed Version:**
```cpp
#include <iostream>
#include <type_traits>

template <class T, std::enable_if_t<std::is_integral_v<T>, int> = 0>
void scale(T v) { std::cout << "int " << v * 2 << '\n'; }

template <class T, std::enable_if_t<std::is_floating_point_v<T>, int> = 0>
void scale(T v) { std::cout << "float " << v * 2 << '\n'; }

int main() {
    scale(3);     // int 6
    scale(1.5);   // float 3
}
```

---

#### Q4
```cpp
// Q: Only process<int> is ever used. Does this compile?
#include <iostream>
#include <type_traits>

template <class T>
void process(T v) {
    int counter = 0;
    if constexpr (std::is_integral_v<T>) {
        std::cout << "integral " << v << '\n';
    } else {
        std::cout << v.name() << counter.size() << '\n';
    }
}

int main() { process(5); }
```

**Answer:**
```
Compile error: request for member 'size' in 'counter', which is of non-class type 'int'
```

**Explanation:**
- `v.name()` depends on `T`, so in the discarded branch it is never instantiated: no error for it.
- `counter.size()` does not depend on `T`: `counter` is always an `int`. Non-dependent code is checked when the template is defined (phase 1), whether or not the branch is discarded.
- The discarded-branch rule means "not instantiated", not "not compiled".
- **Key Concept:** `if constexpr` only hides code that depends on the template parameters.

---

#### Q5
```cpp
// Q: Does this compile with GCC 11? With GCC 13?
#include <iostream>
#include <string>
#include <type_traits>

template <class T>
std::string encode(const T& v) {
    if constexpr (std::is_integral_v<T>) {
        return std::to_string(v);
    } else {
        static_assert(false, "encode: unsupported type");
    }
}

int main() { std::cout << encode(42) << '\n'; }
```

**Answer:**
```
GCC 11: compile error: static assertion failed: encode: unsupported type
GCC 13 and newer: compiles and prints 42
```

**Explanation:**
- Old rule: `static_assert(false)` does not depend on `T`, so it is evaluated at template definition time, and a template that can never be valid in some branch was ill-formed.
- P2593R1 (C++23, applied as a defect report to earlier modes) changed it: a `static_assert` in a discarded branch of a template is checked only when the branch is instantiated. GCC 13 implements it, even with `-std=c++17`.
- Portable form for older compilers: `template <class> constexpr bool always_false = false;` and `static_assert(always_false<T>, "...")`.
- **Key Concept:** Know your compiler version before relying on `static_assert(false)` in a discarded branch.

**Fixed Version:**
```cpp
#include <iostream>
#include <string>
#include <type_traits>

template <class> constexpr bool always_false = false;

template <class T>
std::string encode(const T& v) {
    if constexpr (std::is_integral_v<T>) {
        return std::to_string(v);
    } else {
        static_assert(always_false<T>, "encode: unsupported type");   // dependent
    }
}

int main() { std::cout << encode(42) << '\n'; }   // 42 on every compiler
```

---

#### Q6
```cpp
// Q: What does this print?
#include <iostream>

template <class T>
concept Big = requires { sizeof(T) > 4; };

template <class T>
concept ReallyBig = requires { requires sizeof(T) > 4; };

int main() {
    std::cout << Big<char> << Big<double> << ReallyBig<char> << ReallyBig<double> << '\n';
}
```

**Answer:**
```
1101
```

**Explanation:**
- `Big` uses a **simple requirement**: it checks that `sizeof(T) > 4` is a valid expression. It is valid (and false) for `char`, so `Big<char>` is true.
- `ReallyBig` uses a **nested requirement** (`requires` inside the body), which checks that the expression is `true`.
- Simplest correct form: `concept Big = sizeof(T) > 4;`.
- **Key Concept:** Inside a requires-expression only nested requirements test values; everything else tests validity.

---

#### Q7
```cpp
// Q: Does this compile? If yes, what does it print?
#include <iostream>
#include <type_traits>

template <class T>
    requires std::is_integral_v<T>
const char* kind(T) { return "integral"; }

template <class T>
    requires (std::is_integral_v<T> && std::is_signed_v<T>)
const char* kind(T) { return "signed integral"; }

int main() {
    std::cout << kind(5u) << '\n';
    std::cout << kind(5) << '\n';
}
```

**Answer:**
```
Compile error: call of overloaded 'kind(int)' is ambiguous
(kind(5u) alone is fine: only the first overload is satisfied)
```

**Explanation:**
- For `int` both constraints are satisfied. The second looks "more constrained", but subsumption compares **atomic constraints by source identity**: the two `std::is_integral_v<T>` expressions are written in different places, so they are different atoms and neither constraint subsumes the other.
- Using named concepts fixes it: `std::signed_integral` is defined as `std::integral<T> && std::is_signed_v<T>`, so it subsumes `std::integral`.
- **Key Concept:** Build overload hierarchies from named concepts; raw trait expressions never subsume each other.

**Fixed Version:**
```cpp
#include <concepts>
#include <iostream>

template <std::integral T>
const char* kind(T) { return "integral"; }

template <std::signed_integral T>
const char* kind(T) { return "signed integral"; }

int main() {
    std::cout << kind(5u) << '\n';   // integral
    std::cout << kind(5) << '\n';    // signed integral
}
```

---

#### Q8
```cpp
// Q: What does this print on x86-64 Linux (GCC)?
#include <concepts>
#include <iostream>

template <class T>             const char* pick(T) { return "any"; }
template <std::integral T>      const char* pick(T) { return "integral"; }
template <std::signed_integral T> const char* pick(T) { return "signed"; }

int main() {
    std::cout << pick(true) << ' ' << pick('a') << ' ' << pick(7u) << ' '
              << pick(7L) << ' ' << pick(7.0) << '\n';
}
```

**Answer:**
```
integral signed integral signed any
(pick('a') gives "signed" because plain char is signed on x86-64 Linux;
 it is unsigned on AArch64 Linux)
```

**Explanation:**
- `bool` satisfies `std::integral` but not `std::signed_integral` (`is_signed_v<bool>` is false).
- `char` is integral; its signedness is implementation-defined (signed on x86-64, unsigned by default on AArch64 Linux).
- `7u` is unsigned: integral only. `7L` is signed. `7.0` satisfies neither concept, so the unconstrained overload is used.
- At each call, the most constrained satisfied overload wins because `signed_integral` subsumes `integral`, and both beat the unconstrained one.
- **Key Concept:** `bool` and `char` are integral types; check concept membership for them explicitly if they should be excluded.

---

#### Q9
```cpp
// Q: What does this print?
#include <iostream>
#include <type_traits>

template <class T>
void check(T&&) {
    std::cout << std::is_same_v<T, int> << std::is_integral_v<T>
              << std::is_integral_v<std::remove_cvref_t<T>> << ' ';
}

int main() {
    int x = 1;
    const int cx = 2;
    check(x);
    check(cx);
    check(3);
    std::cout << '\n' << std::is_const_v<const int&> << std::is_const_v<const int*>
              << std::is_const_v<int* const> << '\n';
}
```

**Answer:**
```
001 001 111
001
```

**Explanation:**
- With a forwarding reference, an lvalue `int` deduces `T = int&`, a const lvalue `T = const int&`, an rvalue `T = int` (Ch1 covers the rules).
- `is_integral_v<int&>` is false: references are not integral types. Only `remove_cvref_t` gives the plain `int`.
- `is_const_v` looks at the top level only: `const int&` is a reference (never const itself), `const int*` is a non-const pointer to const, `int* const` is a const pointer.
- **Key Concept:** Strip references (`remove_cvref_t`) before asking a trait about a forwarded type; `is_const_v` checks top-level const only.

---

#### Q10
```cpp
// Q: The fallback overload should handle int. Does this compile?
#include <iostream>
#include <string>

template <class T>
auto length(const T& v) { return v.size(); }

long length(...) { return -1; }

int main() {
    std::cout << length(std::string("abc")) << ' ' << length(5) << '\n';
}
```

**Answer:**
```
Compile error: request for member 'size' in 'v', which is of non-class type 'const int'
```

**Explanation:**
- The template's signature is `auto length(const T&)`, which substitutes fine for `int`; SFINAE has nothing to remove.
- The template is an exact match for `int`, so it beats the `...` fallback (an ellipsis conversion ranks last) and is selected.
- Its body is then instantiated (also to deduce `auto`), and `v.size()` fails there: a hard error, not a substitution failure.
- Fix: move the expression into the signature (`-> decltype(v.size())`) or constrain the template with `requires`.
- **Key Concept:** A deduced `auto` return type puts nothing checkable in the signature, so SFINAE cannot remove the template; body errors are never SFINAE.

**Fixed Version:**
```cpp
#include <iostream>
#include <string>

template <class T>
auto length(const T& v) -> decltype(v.size()) { return v.size(); }   // SFINAE-friendly

long length(...) { return -1; }

int main() {
    std::cout << length(std::string("abc")) << ' ' << length(5) << '\n';   // 3 -1
}
```

---

#### Q11
```cpp
// Q: What does this print?
#include <iostream>
#include <type_traits>
#include <utility>

template <class T, class = void>
struct has_reset : std::false_type {};

template <class T>
struct has_reset<T, std::void_t<decltype(std::declval<T&>().reset())>> : std::true_type {};

struct Public  { void reset() {} };
struct Private { private: void reset() {} };
struct Field   { int reset = 0; };

int main() {
    std::cout << has_reset<Public>::value << has_reset<Private>::value
              << has_reset<Field>::value << has_reset<int>::value << '\n';
}
```

**Answer:**
```
1000
```

**Explanation:**
- `Public`: `reset()` is callable, the specialization matches: true.
- `Private`: since C++11, access checking is part of substitution, so calling a private member from outside is a substitution failure: false (no hard error).
- `Field`: `reset` exists but is an `int`; `x.reset()` is not a valid call: false.
- `int`: no members at all: false.
- **Key Concept:** Detection tests "is this expression valid here", including access, not "does a member with this name exist".

---
