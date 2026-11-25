## TOPIC: Templates: Deduction, Specialization and Variadics

### PRACTICE_TASKS: Output Prediction and Bug Hunting

#### Q1
```cpp
// Q: Does this compile? If not, what is the smallest change to the call that fixes it?
#include <iostream>

template <class T>
T add(T a, T b) { return a + b; }

int main() {
    std::cout << add(10, 20.5) << '\n';
}
```

**Answer:**
```
Compile error: no matching function for call to 'add(int, double)'
note: deduced conflicting types for parameter 'T' ('int' and 'double')
Fix: add<double>(10, 20.5), which prints 30.5
```

**Explanation:**
- `T` is deduced from each argument separately: `int` from `10`, `double` from `20.5`. The results must agree, and deduction never applies conversions.
- With an explicit template argument there is nothing to deduce, so `10` is converted to `10.0` as for any normal function call.
- Alternatives: `add(10.0, 20.5)`, or two template parameters with `auto` return type.
- **Key Concept:** All deductions of the same `T` must match exactly; conversions only happen after `T` is fixed.

---

#### Q2
```cpp
// Q: What does this print?
#include <iostream>

template <class T> void f(T)  { std::cout << "f(T)\n"; }
template <class T> void f(T*) { std::cout << "f(T*)\n"; }
template <>        void f<>(int*) { std::cout << "explicit specialization\n"; }

int main() {
    int x = 0;
    f(&x);
}
```

**Answer:**
```
explicit specialization
```

**Explanation:**
- The specialization is declared after `f(T*)`, so `template <> void f<>(int*)` matches the more specialized primary: it is `f(T*)` with `T = int`.
- Overload resolution between the two primaries picks `f(T*)` (partial ordering); its specialization for `T = int` exists, so that body runs.
- Swap the order (specialization right after `f(T)`) and it becomes `f(T)` with `T = int*`: the same call then prints `f(T*)` and the specialization is never used.
- **Key Concept:** Explicit specializations attach to whichever primary they match at their point of declaration and do not take part in overload resolution. Prefer overloads.

---

#### Q3
```cpp
// Q: Does this compile? If so, what does it print?
#include <iostream>
#include <type_traits>

template <class T>
void bump(T x) {
    ++x;
    std::cout << std::is_const_v<T> << ' ' << x << '\n';
}

int main() {
    const int limit = 1;
    bump(limit);
    std::cout << limit << '\n';
}
```

**Answer:**
```
0 2
1
```

**Explanation:**
- A by-value parameter drops the argument's top-level const: `T = int`, so `x` is a modifiable copy and `++x` compiles.
- The caller's `limit` is untouched.
- With `void bump(T& x)` the deduction is `T = const int` and `++x` fails to compile ("increment of read-only reference 'x'").
- **Key Concept:** By-value deduction strips top-level const; reference deduction keeps it.

---

#### Q4
```cpp
// Q: What does this print on a typical x86-64 build?
#include <iostream>

template <class T> std::size_t by_value(T)   { return sizeof(T); }
template <class T> std::size_t by_ref(T&)    { return sizeof(T); }

template <class T, std::size_t N>
constexpr std::size_t count(T (&)[N]) { return N; }

int main() {
    double prices[8] = {};
    std::cout << by_value(prices) << ' ' << by_ref(prices) << ' '
              << count(prices) << '\n';
}
```

**Answer:**
```
8 64 8
(typical x86-64: 8-byte pointers and doubles)
```

**Explanation:**
- `by_value(prices)`: the array decays, `T = double*`, `sizeof(T)` is the pointer size.
- `by_ref(prices)`: no decay through a reference, `T = double[8]`, `sizeof(T)` is 64.
- `count` deduces both the element type and `N` from the array reference; this is how `std::size(arr)` is implemented.
- **Key Concept:** Pass arrays by reference to a template when the size matters; by value they become pointers.

---

#### Q5
```cpp
// Q: What does this print?
#include <iostream>

template <class... Ts>
auto right(Ts... v) { return (v / ...); }

template <class... Ts>
auto left(Ts... v) { return (... / v); }

int main() {
    std::cout << right(64, 8, 2) << ' ' << left(64, 8, 2) << '\n';
}
```

**Answer:**
```
16 4
```

**Explanation:**
- `(v / ...)` is a unary right fold: `64 / (8 / 2) = 64 / 4 = 16`.
- `(... / v)` is a unary left fold: `(64 / 8) / 2 = 4`.
- The position of the dots shows the grouping: dots on the right, grouping from the right.
- **Key Concept:** Fold direction changes the result for non-associative operators.

---

#### Q6
```cpp
// Q: Does this compile?
#include <iostream>

template <class... Ts>
auto product(Ts... v) { return (v * ...); }

template <class... Ts>
bool any_negative(Ts... v) { return ((v < 0) || ...); }

int main() {
    std::cout << any_negative() << ' ' << product(2, 3) << ' ' << product() << '\n';
}
```

**Answer:**
```
Compile error: fold of empty expansion over operator*
(any_negative() alone is fine: an empty || fold is false)
```

**Explanation:**
- An empty unary fold is valid only for `&&` (true), `||` (false) and `,` (void()).
- `product()` instantiates `(v * ...)` with zero elements, and `*` has no defined empty value.
- Fix: a binary fold with the identity, `(1 * ... * v)`, which makes `product()` return 1.
- **Key Concept:** Use a binary fold with an init value whenever the pack can be empty.

**Fixed Version:**
```cpp
#include <iostream>

template <class... Ts>
auto product(Ts... v) { return (1 * ... * v); }

template <class... Ts>
bool any_negative(Ts... v) { return ((v < 0) || ...); }

int main() {
    std::cout << any_negative() << ' ' << product(2, 3) << ' ' << product() << '\n';
    // prints: 0 6 1
}
```

---

#### Q7
```cpp
// Q: Does this compile? If not, why, and how do you fix it?
#include <iostream>

template <class T>
struct Storage {
    T value{};
    void reset() { value = T{}; }
};

template <class T>
struct Cache : Storage<T> {
    void clear() {
        reset();
        std::cout << "cleared\n";
    }
};

int main() {
    Cache<int> c;
    c.clear();
}
```

**Answer:**
```
Compile error: there are no arguments to 'reset' that depend on a template parameter,
so a declaration of 'reset' must be available
```

**Explanation:**
- `Storage<T>` is a dependent base. Unqualified lookup in phase 1 does not search it, because `Storage<T>` might be specialized later without `reset`.
- `reset()` has no dependent arguments, so it is looked up immediately and nothing is found.
- Fix: `this->reset();` (makes the call dependent), `Storage<T>::reset();`, or `using Storage<T>::reset;` in the class.
- **Key Concept:** Members of a dependent base class need `this->` (or qualification) in a class template.

**Fixed Version:**
```cpp
#include <iostream>

template <class T>
struct Storage {
    T value{};
    void reset() { value = T{}; }
};

template <class T>
struct Cache : Storage<T> {
    void clear() {
        this->reset();
        std::cout << "cleared\n";
    }
};

int main() {
    Cache<int> c;
    c.clear();   // cleared
}
```

---

#### Q8
```cpp
// Q: What does this print?
#include <iostream>
#include <vector>

int main() {
    std::vector<int> src{5, 6, 7, 8};
    std::vector a{src};
    std::vector b{src.begin(), src.end()};
    std::vector c(src.begin(), src.end());
    std::cout << a.size() << ' ' << b.size() << ' ' << c.size() << '\n';
}
```

**Answer:**
```
4 2 4
```

**Explanation:**
- `a{src}`: CTAD prefers the copy deduction candidate for a single argument of the same template, so `a` is a `vector<int>` copy.
- `b{src.begin(), src.end()}`: braces make the `initializer_list` constructor win, so `b` is a `vector<vector<int>::iterator>` holding two iterators.
- `c(src.begin(), src.end())`: parentheses select the iterator-pair constructor and its deduction guide: `vector<int>` with 4 elements.
- **Key Concept:** CTAD plus braces can deduce a container of iterators; use parentheses or spell out the element type.

---

#### Q9
```cpp
// Q: Does this compile?
template <class T, class U> struct Pair         { static constexpr int id = 0; };
template <class T, class U> struct Pair<T*, U>  { static constexpr int id = 1; };
template <class T, class U> struct Pair<T, U*>  { static constexpr int id = 2; };

int main() {
    static_assert(Pair<int*, int>::id == 1);
    static_assert(Pair<int, int*>::id == 2);
    return Pair<int*, int*>::id;
}
```

**Answer:**
```
Compile error: ambiguous template instantiation for 'struct Pair<int*, int*>'
(the two static_asserts on their own are fine)
```

**Explanation:**
- `Pair<int*, int*>` matches both partial specializations, and neither is more specialized than the other (each accepts arguments the other rejects).
- The compiler does not fall back to the primary when specializations tie: it is an error.
- Fix: add a specialization for the overlap, `template <class T, class U> struct Pair<T*, U*>`, which is more specialized than both.
- **Key Concept:** Among matching class partial specializations, a unique most specialized one must exist.

---

#### Q10
```cpp
// Q: What does this print?
#include <iostream>

template <class T>
struct Counter {
    static inline int created = 0;
    Counter() { ++created; }
};

int main() {
    Counter<int> a, b;
    Counter<double> c;
    Counter<const int> d;
    std::cout << Counter<int>::created << ' ' << Counter<double>::created << ' '
              << Counter<const int>::created << '\n';
}
```

**Answer:**
```
2 1 1
```

**Explanation:**
- Every instantiation is a separate class with its own static members. `Counter<int>`, `Counter<double>` and `Counter<const int>` share nothing.
- `const int` and `int` are different template arguments, so they are different classes too.
- To share a counter across all instantiations, move it into a non-template base class.
- **Key Concept:** A class template's statics exist once per instantiation, not once per template.

---

#### Q11
```cpp
// Q: What does this print?
#include <iostream>

void handle(long)               { std::cout << "handle(long)\n"; }
template <class T> void handle(T) { std::cout << "handle(T)\n"; }
void handle(int)                { std::cout << "handle(int)\n"; }

int main() {
    short s = 1;
    handle(1);
    handle(1L);
    handle(s);
}
```

**Answer:**
```
handle(int)
handle(long)
handle(T)
```

**Explanation:**
- `handle(1)`: `handle(int)` and `handle<int>` are both exact matches; on a tie the non-template wins.
- `handle(1L)`: same tie with `handle(long)` and `handle<long>`: the non-template wins.
- `handle(s)`: `handle<short>` is an exact match, while `handle(int)` needs a promotion and `handle(long)` a conversion. The better match wins before "prefer non-template" is considered.
- **Key Concept:** The non-template preference is only a tie-breaker; a template's exact match beats a non-template that needs a promotion.

---

#### Q12
```cpp
// Q: B was copy-pasted from A. What happens? (compile, run, defined or not?)
#include <iostream>

template <class Derived>
struct Shape {
    double area() const { return static_cast<const Derived&>(*this).area_impl(); }
};

struct Square : Shape<Square> {
    double side = 2;
    double area_impl() const { return side * side; }
};

struct Circle : Shape<Square> {            // should be Shape<Circle>
    double r = 1;
    double area_impl() const { return 3.14159 * r * r; }
};

int main() {
    Circle c;
    std::cout << c.area() << '\n';
}
```

**Answer:**
```
Compiles, but undefined behaviour: Shape<Square>::area casts a Circle to Square&.
At -O0 on GCC it printed 1 (Circle's r = 1.0 read as Square::side), not 3.14159.
```

**Explanation:**
- `Circle` derives from `Shape<Square>`, so `c.area()` runs `static_cast<const Square&>(*this)` on an object that is not a `Square`: UB.
- It calls `Square::area_impl` on Circle's memory: `side` overlays `r`, so it computes `1 * 1`.
- Guard against this at compile time: give `Shape` a private constructor and `friend Derived;`. Then `Circle c;` fails ("use of deleted function 'Circle::Circle()'"), because only `Square` may construct `Shape<Square>`.
- C++23 deducing this (`double area(this const auto& self)`) cannot be pointed at the wrong type at all.
- **Key Concept:** CRTP trusts you to pass the right derived type; enforce it with a private constructor plus `friend Derived`.

**Fixed Version:**
```cpp
#include <iostream>

template <class Derived>
class Shape {
public:
    double area() const { return static_cast<const Derived&>(*this).area_impl(); }
private:
    Shape() = default;
    friend Derived;                         // only Derived can construct Shape<Derived>
};

struct Square : Shape<Square> {
    double side = 2;
    double area_impl() const { return side * side; }
};

struct Circle : Shape<Circle> {
    double r = 1;
    double area_impl() const { return 3.14159 * r * r; }
};

int main() {
    Circle c;
    std::cout << c.area() << '\n';   // 3.14159
}
```

---
