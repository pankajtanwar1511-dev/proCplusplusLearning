## TOPIC: SFINAE, Type Traits and Concepts

### THEORY_SECTION: Core Concepts

#### 1. Mental model
- An unconstrained template `template <class T> void f(T)` accepts **every** type and fails late, deep inside its body, with long errors. Constraining means: decide at the **call site** whether a template applies to a type, and pick between alternatives by type properties.
- Three generations of tools, all still seen in interviews and codebases:

| Era | Tool | How it selects |
|---|---|---|
| C++98/11 | SFINAE, `std::enable_if`, tag dispatch | Make the signature invalid so the overload disappears; or overload on tag types |
| C++17 | `if constexpr`, `std::void_t`, `_v` traits | One template, branches discarded at compile time |
| C++20 | Concepts, `requires` | Named constraints checked before overload resolution, with ordering (subsumption) |
- Everything is compile-time: none of these tools costs anything at runtime; they decide which code is generated.
- Type traits (`<type_traits>`) are the vocabulary for all three: compile-time questions about types (`is_integral`) and type transformations (`remove_cvref`).

#### 2. Type traits: how they work
- A trait is a class template whose result is a static member:
  - **Predicate** traits derive from `std::integral_constant<bool, B>` (`std::true_type`/`std::false_type`), exposing `::value`.
  - **Transformation** traits expose `::type`.
- Helpers: `std::is_integral_v<T>` (C++17) = `std::is_integral<T>::value`; `std::remove_cvref_t<T>` (C++20) = `typename std::remove_cvref<T>::type` (C++14 added the `_t` aliases).
- Implemented with partial specialization (topic 10):
  ```cpp
  template <class T> struct is_ptr : std::false_type {};
  template <class T> struct is_ptr<T*> : std::true_type {};
  ```
  Note: this version says `is_ptr<int* const>` is false; the real `std::is_pointer` handles cv-qualified pointers too.
- Most used traits:

| Trait | Purpose |
|---|---|
| `is_same_v<A, B>` | Exact type equality (`int` vs `const int` differ) |
| `is_integral_v`, `is_floating_point_v`, `is_arithmetic_v` | Number categories (`bool` and `char` are integral) |
| `is_pointer_v`, `is_reference_v`, `is_const_v` | Shape of the type |
| `is_trivially_copyable_v` | Safe to `memcpy` (Ch2) |
| `is_nothrow_move_constructible_v` | Decides vector's move-vs-copy on growth (Ch2) |
| `remove_cvref_t`, `decay_t` | Strip `const`/`&` (decay also turns arrays/functions into pointers) |
| `conditional_t<B, X, Y>` | Compile-time type selection |
| `common_type_t<A, B>` | Type both convert to (`int`, `double` give `double`) |
| `underlying_type_t<E>` | Integer type of an enum |
| `is_invocable_v<F, Args...>`, `invoke_result_t` | Can `F` be called with `Args`? With what result? |
- Many traits need compiler intrinsics (`is_trivially_copyable`, `is_enum`, `is_union`): they cannot be written in portable C++.
- Pitfall: `is_const_v<const int&>` is false (a reference itself is never const); strip the reference first: `is_const_v<std::remove_reference_t<T>>`.

#### 3. SFINAE: Substitution Failure Is Not An Error
- During overload resolution, for each function template the compiler deduces `T` and **substitutes** it into the **signature** (parameter types, return type, template parameter defaults, a C++20 `explicit(bool)` condition).
- If substitution produces an invalid type or expression in that **immediate context**, the template is silently removed from the candidate set. That is SFINAE.
- After that, the remaining **viable** candidates (substitution succeeded, constraints satisfied, arguments convertible) are ranked; the best one wins.
- What is **not** SFINAE (a hard error):
  - Errors inside the function **body** (the body is instantiated only after the function is chosen).
  - Errors inside a class template instantiated as a side effect (e.g. a trait whose definition itself fails).
  - The `noexcept` specifier: it is substituted only when it is needed, after deduction, so `noexcept(T::value)` with `T = int` is a hard error, not SFINAE ([temp.deduct.general]).
  - Return type deduction with `auto`: the signature is just `auto`, so substitution cannot fail and the template stays viable. If it is selected (or its return type is needed), the body is instantiated and errors there are hard. Measured: `template <class T> auto len(T t) { return t.size(); }` plus `long len(...)`, called with `len(5)`: the template is an exact match, beats the `...` fallback, and its body fails: "request for member 'size' in 't', which is of non-class type 'int'".
- Typical SFINAE spots:
  - Trailing return type: `auto f(T t) -> decltype(t.size(), void())`.
  - Template parameter default: `typename = std::enable_if_t<Cond>`.
  - Non-type template parameter: `std::enable_if_t<Cond, int> = 0`.
  - Return type: `std::enable_if_t<Cond, R> f(T)`.

#### 4. std::enable_if: the forms and their traps
- `std::enable_if<true, T>::type` is `T`; `std::enable_if<false, T>` has no `type`: using it is a substitution failure.
- Forms:

| Form | Example | Notes |
|---|---|---|
| Return type | `template <class T> std::enable_if_t<std::is_integral_v<T>, T> twice(T x)` | Clutters the return type; no use for constructors |
| Type template parameter default | `template <class T, class = std::enable_if_t<C>>` | **Trap**: two overloads differing only in the default are a redefinition |
| NTTP | `template <class T, std::enable_if_t<C, int> = 0>` | Preferred form: different conditions give different signatures |
| Function parameter | `void f(T x, std::enable_if_t<C>* = nullptr)` | Changes the arity; not for operators |
- The redefinition trap: default template arguments are not part of the function template's signature, so `template <class T, class = enable_if_t<is_integral_v<T>>> void f(T)` and the same with `is_floating_point_v` declare the **same** template twice: "redefinition of 'template<class T, class> void f(T)'".
- The **ambiguity trap** (a common wrong textbook answer):
  - `template <class T, std::enable_if_t<std::is_integral_v<T>, int> = 0> void foo(T);` plus an unconstrained `template <class T> void foo(T);`.
  - `foo(10)`: both are viable with identical parameter types; SFINAE conditions do not take part in partial ordering, so neither is more specialized: "call of overloaded 'foo(int)' is ambiguous". (`foo(3.14)` works: only the generic one is viable.)
  - Fixes: make the generic overload exclusive (`!is_integral_v<T>`), use a priority tag, use `if constexpr`, or use concepts (where a constrained template **does** beat an unconstrained one).

#### 5. Detection idiom: void_t and declval
- Question: "does `T` have a `.size()` member?" without a compile error when it does not.
- `std::void_t<Ts...>` (C++17) is `void` for any valid types; if any type is invalid, substitution fails.
- `std::declval<T>()` produces a `T&&` in unevaluated contexts (`decltype`, `sizeof`, `noexcept`) without constructing a `T`; calling it in evaluated code is an error.
- The idiom:
  ```cpp
  template <class T, class = void>
  struct has_size : std::false_type {};

  template <class T>
  struct has_size<T, std::void_t<decltype(std::declval<const T&>().size())>>
      : std::true_type {};
  ```
- How it works: `has_size<T>` means `has_size<T, void>`. The partial specialization matches only if its second argument can be formed and equals `void`; for types without `size()` substitution fails and the primary (false) is used.
- C++20 replaces it with a one-liner: `template <class T> concept HasSize = requires(const T& t) { t.size(); };`.

#### 6. Tag dispatch and priority tags
- Tag dispatch: pass a tag object whose **type** encodes a property, and overload on the tag type. No SFINAE needed, and normal overload resolution (with inheritance) does the ranking.
- Classic example: `std::advance` on iterator categories:
  - `random_access_iterator_tag` derives from `bidirectional_iterator_tag`, which derives from `forward_iterator_tag` ...
  - `advance_impl(it, n, std::random_access_iterator_tag)` does `it += n`; the bidirectional version loops in both directions; the input version loops forward.
  - A tag type with no exact overload converts to its base: the most derived matching overload wins.
- Priority tags fix the SFINAE ambiguity: `template <int N> struct priority : priority<N - 1> {}; template <> struct priority<0> {};`
  - Call `impl(x, priority<1>{})`; the preferred overload takes `priority<1>`, the fallback takes `priority<0>` (a derived-to-base conversion, so it ranks lower).
  - If the preferred overload is removed by SFINAE, the fallback is still viable.
- Tag dispatch is also the cleanest pre-C++17 way to branch on `std::true_type`/`std::false_type`.

#### 7. if constexpr (C++17) and the discarded statement
- `if constexpr (cond)` requires a constant expression; the branch not taken becomes a **discarded statement**.
- Inside a template, when the condition depends on a template parameter, the discarded branch is **not instantiated**: it may contain code that would not compile for this `T` (`v.size()` for an `int`).
- Limits (the parts source explanations usually skip):
  - Outside a template, or when the condition is not value-dependent, the discarded branch is still fully checked. `void g(int v) { if constexpr (true) { } else { v.size(); } }` is an error: "request for member 'size' in 'v', which is of non-class type 'int'".
  - The discarded branch must still parse, and non-dependent constructs in it are still checked.
  - `return` statements in a discarded branch do not participate in `auto` return type deduction.
- `static_assert(false, "...")` in a discarded branch:
  - Before C++23 (P2593R1, applied as a defect report), the program was ill-formed because the assertion does not depend on `T`. GCC 11 rejects it: "static assertion failed".
  - GCC 13 and newer accept it (in every `-std` mode, as a DR): it fires only if the branch is instantiated.
  - Portable old workaround: `static_assert(always_false<T>, "...")` with `template <class> constexpr bool always_false = false;`.
- `if constexpr` vs SFINAE: one template with branches (simpler, one place) vs separate overloads (extensible by others: users can add an overload, but cannot add a branch to your function).

#### 8. Concepts and requires (C++20)
- A **concept** is a named compile-time predicate on template arguments:
  ```cpp
  template <class T>
  concept Hashable = requires(const T& a) {
      { std::hash<T>{}(a) } -> std::convertible_to<std::size_t>;
  };
  ```
- Four ways to apply a constraint (equivalent for simple cases):
  - `template <Hashable T> void f(T);` (type-constraint)
  - `template <class T> requires Hashable<T> void f(T);` (requires-clause)
  - `template <class T> void f(T) requires Hashable<T>;` (trailing requires-clause; works on non-template members of class templates)
  - `void f(Hashable auto x);` (abbreviated function template, C++20)
- A **requires-expression** `requires (params) { requirements; }` is a `bool` constant expression. Kinds of requirements:

| Kind | Syntax | Checks |
|---|---|---|
| Simple | `a + b;` | Expression is valid (not its value) |
| Type | `typename T::value_type;` | Type exists |
| Compound | `{ a.size() } -> std::convertible_to<std::size_t>;` | Valid, optionally `noexcept`, result satisfies a concept |
| Nested | `requires sizeof(T) <= 8;` | A constant expression is **true** |
- Trap: `requires { sizeof(T) > 4; }` is a simple requirement: it checks that the expression compiles, which it always does, so the concept is always true. Use `requires (sizeof(T) > 4);` as a nested requirement, or just `sizeof(T) > 4` in the concept definition.
- `requires requires (T x) { x + x; }`: a requires-clause whose condition is an ad hoc requires-expression. Legal, but name it as a concept instead.
- Errors move to the call site. GCC: "no matching function ... constraints not satisfied ... the required expression 'a.size()' is invalid".
- Standard concepts (`<concepts>`, `<iterator>`, `<ranges>`): `same_as`, `convertible_to`, `derived_from`, `integral`, `floating_point`, `invocable`, `predicate`, `equality_comparable`, `totally_ordered`, `copyable`, `movable`, `regular`, `input_iterator` ... `random_access_iterator`, `ranges::range`.

#### 9. Constraint ordering: subsumption
- When two constrained templates are both viable and otherwise equal, the one whose constraints **subsume** the other's (is "more constrained") wins. An unconstrained template loses to a constrained one.
- Constraints are normalized into conjunctions (`&&`) and disjunctions (`||`) of **atomic constraints**. `A && B` subsumes `A`.
- Atomic constraints are compared by **identity of the expression as written in the source**, not by meaning:
  - `template <class T> requires std::is_integral_v<T>` and `template <class T> requires (std::is_integral_v<T> && sizeof(T) == 4)`: the two `is_integral_v<T>` are different atomic constraints (different source locations), so no subsumption: `f(1)` is ambiguous (verified with GCC 11).
  - Define named concepts (`concept Int = ...; concept Int4 = Int<T> && sizeof(T) == 4;`) and the same calls resolve: `Int4` subsumes `Int` because concepts are expanded to the same atomic constraint.
- Standard concepts are designed for this: `std::random_access_iterator` subsumes `std::bidirectional_iterator`, so concept overloads can replace tag dispatch.
- SFINAE/`enable_if` conditions are never compared: that is why the enable_if ambiguity trap exists and concepts fix it.

#### 10. Misconceptions to unlearn
- ❌ "Any compile error during overload resolution is SFINAE." ✅ Only failures in the immediate context of substitution into the signature.
- ❌ "An `enable_if`-constrained overload is more specialized than an unconstrained one." ✅ Partial ordering ignores SFINAE conditions; the call is ambiguous. Concepts do order.
- ❌ "Two `enable_if` overloads with `typename = ...` defaults are fine." ✅ Redefinition; use `enable_if_t<C, int> = 0`.
- ❌ "`if constexpr` never compiles the other branch." ✅ Only inside a template with a value-dependent condition.
- ❌ "`static_assert(false)` in an `if constexpr` else is always an error." ✅ Accepted since P2593 (GCC 13+); older compilers need a dependent `false`.
- ❌ "`requires { sizeof(T) > 4; }` checks the size." ✅ It checks the expression is valid; use a nested `requires`.
- ❌ "Concepts change the generated code." ✅ They only choose which template is used; no runtime cost.
- ❌ "`is_const_v<const int&>` is true." ✅ False; references are not cv-qualified.
- ❌ "Concepts with the same meaning subsume each other." ✅ Subsumption compares atomic constraints by source identity, so reuse named concepts.

### EDGE_CASES: Traps and Misconceptions

#### Edge Case 1: enable_if overload vs a generic overload is ambiguous
```cpp
#include <iostream>
#include <type_traits>

template <class T, std::enable_if_t<std::is_integral_v<T>, int> = 0>
void foo(T) { std::cout << "integral\n"; }

template <class T>
void foo(T) { std::cout << "generic\n"; }

int main() {
    foo(3.14);   // only the generic overload is viable: generic
    // foo(10);  // error: call of overloaded 'foo(int)' is ambiguous
}
```
- For `foo(10)` both candidates are viable with the same parameter type `int`. Partial ordering does not look at the `enable_if` condition, so neither wins.
- Many tutorials (and AI answers) claim "the integral one is more specialized and prints integral". GCC rejects the call.
- Fix: constrain the generic one with the negated condition, or switch to `template <std::integral T> void foo(T)`, which is preferred over the unconstrained template.

#### Edge Case 2: The decltype-SFINAE overload is not "better" either
- `template <class T> void process(T);` and `template <class T> auto process(T t) -> decltype(t.size(), void());`
- `process(std::string("x"))`: both viable, same parameter types: "call of overloaded 'process(std::string)' is ambiguous". `process(10)` works (only the first survives).
- Fix: priority tags (`process_impl(t, priority<1>{})` vs `priority<0>`) or a `requires` clause.

#### Edge Case 3: Two overloads that differ only in a default template argument
- `template <class T, class = std::enable_if_t<std::is_integral_v<T>>> void f(T);` plus the same with `is_floating_point_v`.
- GCC: "redefinition of 'template<class T, class> void f(T)'": default arguments are not part of the signature, so both declare `template <class, class> void f(T)`.
- Fix: `template <class T, std::enable_if_t<std::is_integral_v<T>, int> = 0>`: now the condition is part of the template parameter's **type**, so the two templates differ.

#### Edge Case 4: Errors outside the immediate context are hard errors
- SFINAE only protects the signature. Examples that still fail to compile:
  - `auto` return type deduction: the body is instantiated to find the type. `template <class T> auto len(T t) { return t.size(); }` with a `long len(...)` fallback: `len(5)` is a hard error.
  - A trait or helper class whose own definition errors for `T` (e.g. it uses `typename T::type` in its body, not in a partial specialization pattern).
  - Default member initializers, lambdas in the body, `static_assert` in the body.
- Fix: put the check in the signature (`-> decltype(t.size())`) or in a constraint.

#### Edge Case 5: if constexpr in a non-template function
```cpp
#include <iostream>

void show(int v) {
    if constexpr (sizeof(int) == 4) {
        std::cout << v << '\n';
    } else {
        // std::cout << v.size();   // still an error here: v is not dependent
    }
}

int main() { show(7); }
```
- Uncommenting the `else` line fails: "request for member 'size' in 'v', which is of non-class type 'int'".
- The discarded branch is only skipped for **instantiation**; outside a template nothing is instantiated, so everything is checked normally.
- Same inside a template if the condition or expression does not depend on `T`.

#### Edge Case 6: static_assert(false) in a discarded branch
- `if constexpr (std::is_integral_v<T>) { ... } else { static_assert(false, "unsupported type"); }`
- GCC 11: "static assertion failed: unsupported type" even when only `int` is used (pre-P2593 rule: a non-dependent false assertion makes the template ill-formed).
- GCC 13+ (any `-std`, P2593R1 as a defect report): compiles; fires only if the else branch is instantiated.
- Portable form: `static_assert(always_false<T>, "...")` (`template <class> constexpr bool always_false = false;`).

#### Edge Case 7: Ad hoc constraints do not subsume
- `template <class T> requires std::is_integral_v<T> int f(T);` and `template <class T> requires (std::is_integral_v<T> && sizeof(T) == 4) int f(T);`
- Intuitively the second is "more constrained", but `f(1)` is ambiguous: atomic constraints from different source expressions are never identical.
- With named concepts, `concept Int4 = Int<T> && sizeof(T) == 4;`, the same calls resolve to the `Int4` overload.

#### Edge Case 8: A requires-expression checks validity, not truth
- `template <class T> concept Big = requires { sizeof(T) > 4; };` is true for `char`: the expression `sizeof(char) > 4` is valid (and false), and only validity is checked.
- Correct: `concept Big = sizeof(T) > 4;` or `requires { requires sizeof(T) > 4; }`.
- Similarly `requires (T a) { a == a; }` checks that `==` exists, not that it returns true or even `bool`; use a compound requirement `{ a == a } -> std::convertible_to<bool>;`.

#### Edge Case 9: Traits and references
- `std::is_const_v<const int&>` is false; `std::is_integral_v<int&>` is false; `std::is_same_v<T, int>` is false for `T = const int`.
- In a forwarding function `template <class T> void f(T&& x)`, `T` is `int&` for lvalues, so `is_integral_v<T>` silently fails. Use `std::remove_cvref_t<T>` (C++20) or `std::decay_t<T>` before testing.

### CODE_EXAMPLES: Practical Demonstrations

#### Example 1: Writing and using type traits
```cpp
#include <iostream>
#include <string>
#include <type_traits>

template <class T> struct is_ptr : std::false_type {};
template <class T> struct is_ptr<T*> : std::true_type {};
template <class T> constexpr bool is_ptr_v = is_ptr<T>::value;

template <class T>
using storage_t = std::conditional_t<(sizeof(T) <= 8), T, const T&>;   // by value if small

template <class T>
void describe(T&&) {
    using U = std::remove_cvref_t<T>;
    std::cout << std::boolalpha << is_ptr_v<U> << ' ' << std::is_integral_v<T>
              << ' ' << std::is_integral_v<U> << '\n';
}

int main() {
    int x = 1;
    describe(&x);     // T = int*        -> true false false
    describe(x);      // T = int&        -> false false true (T itself is a reference)
    static_assert(std::is_same_v<storage_t<int>, int>);
    static_assert(std::is_same_v<storage_t<std::string>, const std::string&>);
    static_assert(std::is_same_v<std::common_type_t<int, double>, double>);
    std::cout << std::is_const_v<const int&> << '\n';
}
```
- Output:
```
true false false
false false true
false
```
- `std::is_integral_v<T>` is false for `T = int&`: always strip references before asking about a forwarded type.

#### Example 2: Detection idiom (C++17) vs requires (C++20)
```cpp
#include <iostream>
#include <string>
#include <type_traits>
#include <utility>
#include <vector>

template <class T, class = void>
struct has_size : std::false_type {};

template <class T>
struct has_size<T, std::void_t<decltype(std::declval<const T&>().size())>>
    : std::true_type {};

template <class T>
concept HasSize = requires(const T& t) { t.size(); };

template <class T>
std::size_t count_of(const T& x) {
    if constexpr (has_size<T>::value) return x.size();
    else return 1;
}

int main() {
    std::cout << has_size<std::string>::value << has_size<int>::value
              << HasSize<std::vector<int>> << HasSize<double> << '\n';
    std::cout << count_of(std::string("abc")) << ' ' << count_of(42) << '\n';
}
```
- Output:
```
1010
3 1
```
- The concept and the trait answer the same question; the concept is shorter and also usable directly in a constraint.

#### Example 3: enable_if done right, and the concept version
```cpp
#include <concepts>
#include <iostream>
#include <type_traits>

// C++11/17: mutually exclusive conditions, NTTP form
template <class T, std::enable_if_t<std::is_integral_v<T>, int> = 0>
const char* kind(T) { return "integral"; }

template <class T, std::enable_if_t<!std::is_integral_v<T>, int> = 0>
const char* kind(T) { return "other"; }

// C++20: a constrained template beats the unconstrained one
template <class T>
const char* kind20(T) { return "other"; }

template <std::integral T>
const char* kind20(T) { return "integral"; }

int main() {
    std::cout << kind(10) << ' ' << kind(2.5) << '\n';
    std::cout << kind20(10) << ' ' << kind20(2.5) << '\n';
}
```
- Output:
```
integral other
integral other
```
- With `enable_if`, the generic overload must carry the negated condition; with concepts, subsumption does it automatically.

#### Example 4: Tag dispatch on iterator categories
```cpp
#include <forward_list>
#include <iostream>
#include <iterator>
#include <list>
#include <vector>

template <class It>
void advance_impl(It& it, long n, std::random_access_iterator_tag) {
    std::cout << "[random access] ";
    it += n;
}

template <class It>
void advance_impl(It& it, long n, std::bidirectional_iterator_tag) {
    std::cout << "[bidirectional] ";
    if (n >= 0) while (n--) ++it;
    else while (n++) --it;
}

template <class It>
void advance_impl(It& it, long n, std::input_iterator_tag) {
    std::cout << "[forward/input] ";
    while (n--) ++it;
}

template <class It>
void my_advance(It& it, long n) {
    advance_impl(it, n, typename std::iterator_traits<It>::iterator_category{});
}

int main() {
    std::vector<int> v{1, 2, 3, 4};
    std::list<int> l{1, 2, 3, 4};
    std::forward_list<int> f{1, 2, 3, 4};
    auto a = v.begin(); my_advance(a, 2); std::cout << *a << '\n';
    auto b = l.end();   my_advance(b, -1); std::cout << *b << '\n';
    auto c = f.begin(); my_advance(c, 3); std::cout << *c << '\n';
}
```
- Output:
```
[random access] 3
[bidirectional] 4
[forward/input] 4
```
- `forward_iterator_tag` has no exact overload; it converts to its base `input_iterator_tag`. Inheritance between tags does the ranking.

#### Example 5: if constexpr for a generic serializer
```cpp
#include <iostream>
#include <string>
#include <type_traits>
#include <vector>

template <class> constexpr bool always_false = false;

template <class T>
std::string to_text(const T& v) {
    if constexpr (std::is_same_v<T, bool>) {
        return v ? "true" : "false";
    } else if constexpr (std::is_arithmetic_v<T>) {
        return std::to_string(v);
    } else if constexpr (std::is_convertible_v<T, std::string>) {
        return "\"" + std::string(v) + "\"";
    } else if constexpr (requires { v.begin(); v.end(); }) {   // C++20 inline check
        std::string out = "[";
        for (const auto& e : v) out += (out.size() > 1 ? "," : "") + to_text(e);
        return out + "]";
    } else {
        static_assert(always_false<T>, "to_text: unsupported type");   // portable form
    }
}

int main() {
    std::cout << to_text(true) << ' ' << to_text(42) << ' ' << to_text("id") << ' '
              << to_text(std::vector<int>{1, 2, 3}) << '\n';
}
```
- Output:
```
true 42 "id" [1,2,3]
```
- `bool` must be tested before `is_arithmetic_v` (bool is arithmetic). Discarded branches are not instantiated, so `v.begin()` is never compiled for `int`.
- Calling `to_text(3.5)` would print `3.500000` (`std::to_string` uses `%f`).

#### Example 6: Writing concepts with all four requirement kinds
```cpp
#include <concepts>
#include <cstddef>
#include <iostream>
#include <string>
#include <vector>

template <class T>
concept MessageLike = requires(const T& m) {
    typename T::id_type;                                      // type requirement
    m.payload();                                              // simple requirement
    { m.id() } -> std::same_as<typename T::id_type>;          // compound requirement
    { m.size() } noexcept -> std::convertible_to<std::size_t>;
    requires sizeof(typename T::id_type) <= 8;                // nested requirement
};

struct Order {
    using id_type = long;
    long id() const { return 7; }
    std::string payload() const { return "BUY 100"; }
    std::size_t size() const noexcept { return 7; }
};

struct Blob {
    std::vector<char> payload() const { return {}; }
};

template <MessageLike M>
void send(const M& m) {
    std::cout << "send id=" << m.id() << " bytes=" << m.size() << '\n';
}

int main() {
    send(Order{});
    std::cout << std::boolalpha << MessageLike<Order> << ' ' << MessageLike<Blob> << '\n';
    // send(Blob{});   // error: constraints not satisfied: 'typename T::id_type' is invalid
}
```
- Output:
```
send id=7 bytes=7
true false
```
- The compound requirement with `noexcept` also fails if `size()` may throw.

#### Example 7: Subsumption: named concepts order, ad hoc ones do not
```cpp
#include <concepts>
#include <iostream>

template <class T> concept Number = std::integral<T> || std::floating_point<T>;
template <class T> concept SmallInt = std::integral<T> && (sizeof(T) <= 2);

template <class T> const char* pick(T)                      { return "any"; }
template <Number T> const char* pick(T)                     { return "number"; }
template <std::integral T> const char* pick(T)              { return "integral"; }
template <SmallInt T> const char* pick(T)                   { return "small integral"; }

int main() {
    std::cout << pick("text") << '\n';
    std::cout << pick(2.5) << '\n';
    std::cout << pick(100) << '\n';
    std::cout << pick(short{1}) << '\n';
}
```
- Output:
```
any
number
integral
small integral
```
- `std::integral` subsumes `Number` (a disjunction containing it), and `SmallInt` (a conjunction containing `std::integral`) subsumes `std::integral`. The most constrained viable overload wins at each step.
- Writing the last overload as `requires (std::is_integral_v<T> && sizeof(T) <= 2)` instead makes `pick(short{1})` ambiguous with the `std::integral` overload (GCC: "call of overloaded 'pick(short int)' is ambiguous").

### QUICK_REFERENCE: Cheat Sheet

#### Which tool?
| Need | C++11/14 | C++17 | C++20 |
|---|---|---|---|
| Remove an overload for some types | `enable_if` (NTTP form) | same | `requires` / concept |
| Pick behaviour inside one function | Tag dispatch | `if constexpr` | `if constexpr` + `requires` expression |
| "Does T have member X?" | `decltype` + SFINAE | `void_t` detection | `requires (T t) { t.x(); }` |
| Prefer one overload over another | Priority tags | Priority tags | Subsumption |
| Readable errors | No | No | Yes (constraint failure at call site) |

#### enable_if forms
| Form | Overload two conditions? |
|---|---|
| `template <class T, class = enable_if_t<C>>` | No: redefinition |
| `template <class T, enable_if_t<C, int> = 0>` | Yes |
| `enable_if_t<C, R> f(T)` (return type) | Yes |
| `f(T, enable_if_t<C>* = nullptr)` | Yes |

#### SFINAE vs hard error
| Failure location | Result |
|---|---|
| Parameter types, return type, template parameter defaults | SFINAE: overload removed |
| Function body | Hard error |
| `auto` return type deduction (needs the body) | Hard error |
| Inside a class template instantiated by the signature | Hard error |

#### requires-expression cheat sheet
| Requirement | Meaning |
|---|---|
| `expr;` | `expr` compiles |
| `typename T::X;` | `T::X` names a type |
| `{ expr } -> C<...>;` | compiles and result satisfies concept `C` |
| `{ expr } noexcept;` | compiles and is `noexcept` |
| `requires cond;` | `cond` is true |

#### Version map
| Feature | Standard |
|---|---|
| `enable_if`, `integral_constant`, `declval`, most traits | C++11 |
| `_t` aliases (`enable_if_t`) | C++14 |
| `_v` variables, `void_t`, `if constexpr`, `conjunction` | C++17 |
| Concepts, `requires`, abbreviated templates, `remove_cvref_t`, `type_identity` | C++20 |
| `static_assert(false)` in discarded branch (P2593, DR) | C++23 (GCC 13+) |

#### Interview one-liners
| Question | Answer |
|---|---|
| What is SFINAE? | Invalid substitution in the signature removes the overload instead of erroring |
| Does a body error count? | No, hard error |
| enable_if overload vs generic `T` for `int`? | Ambiguous |
| Concept-constrained vs unconstrained? | Constrained wins |
| Why `enable_if_t<C, int> = 0`? | Conditions become part of the signature: no redefinition |
| `if constexpr` in a non-template? | Both branches are checked |
| `static_assert(false)` in a discarded branch? | OK since P2593 (GCC 13+); use a dependent false before |
| `requires { sizeof(T) > 4; }`? | Always true if it compiles; use `requires (sizeof(T) > 4)` |
| What decides subsumption? | Atomic constraints identical by source: use named concepts |
| `declval`? | Fake object in unevaluated context |
| Tag dispatch? | Overload on a tag type; inheritance ranks the tags |
