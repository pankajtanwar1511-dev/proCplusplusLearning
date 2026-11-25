## TOPIC: Templates: Deduction, Specialization and Variadics

### THEORY_SECTION: Core Concepts

#### 1. Mental model
- A template is a **recipe**, not code. The compiler generates a concrete function or class (a **specialization**) when the template is used with specific arguments: this is **instantiation**.
- Each distinct argument set produces a separate entity: `max<int>` and `max<double>` are two different functions in the binary.
- Consequences:
  - The definition must be visible where it is instantiated, so templates normally live in **headers**. A template defined only in a `.cpp` file gives "undefined reference" link errors for other translation units.
  - Errors appear at instantiation, often deep inside library code (concepts, topic 11, move them to the call site).
  - Code size grows with every distinct instantiation (template bloat).
- Control instantiation explicitly:
  - `template class Matrix<double>;` (explicit instantiation definition) in one `.cpp`.
  - `extern template class Matrix<double>;` (C++11) in the header: other TUs do not instantiate it, which saves compile time.
- Kinds of template parameters:
  - Type: `template <class T>` (`typename` and `class` are identical here).
  - Non-type (NTTP): `template <int N>`, `template <auto V>` (C++17), class types (C++20).
  - Template template: `template <template <class> class C>`.
- Kinds of templates: function, class, variable (`template <class T> constexpr bool is_big_v = sizeof(T) > 8;`, C++14), alias (`template <class T> using Vec = std::vector<T>;`), and concepts (C++20).

#### 2. Function template argument deduction
- The compiler deduces `T` by matching each **parameter type** against the corresponding **argument type**. The rules depend on the form of the parameter.
- Forwarding references (`T&&`) and `auto` deduction are covered in Core Language (Ch1); here are the other three forms.

| Parameter | Argument | Deduced `T` | Parameter type |
|---|---|---|---|
| `T` (by value) | `int` | `int` | `int` |
| `T` | `const int` | `int` (top-level const dropped) | `int` |
| `T` | `const int*` | `const int*` (low-level const kept) | `const int*` |
| `T` | `int[3]` | `int*` (array decays) | `int*` |
| `T` | function `void(int)` | `void(*)(int)` | pointer to function |
| `T&` | `int` | `int` | `int&` |
| `T&` | `const int` | `const int` | `const int&` |
| `T&` | `int[3]` | `int[3]` (no decay) | `int(&)[3]` |
| `T&` | `42` (rvalue) | deduction succeeds (`int`), but `int&` cannot bind: error | |
| `const T&` | `const int` | `int` | `const int&` |
| `const T&` | `42` | `int` | `const int&` |
- By value means "a new copy": the copy's own constness is not inherited, so top-level `const` and references are stripped.
- `T&` keeps everything the argument has, which is why `template <class T, std::size_t N> std::size_t size(T (&)[N])` can recover array sizes.
- **Every** deducible parameter is deduced independently, and the results must agree: `template <class T> T add(T, T); add(10, 20.5);` deduces `T = int` and `T = double`: deduction fails, "no matching function". No conversion is tried during deduction.
- Fixes: `add<double>(10, 20.5)` (explicit argument: now only conversions are needed), `add(10.0, 20.5)`, two parameters `template <class A, class B> auto add(A, B)`, or block deduction on one parameter with `std::type_identity_t<T>` (C++20).
- **Non-deduced contexts**: `T` cannot be deduced from `typename Wrapper<T>::type`, from a default argument, or from `std::function<void(T)>` when passing a lambda (the lambda is not a `std::function`).
- **Explicit arguments** fill parameters left to right; the rest are deduced: `std::make_unique<Order>(1, 2)` specifies `T`, deduces `Args...`.
- Return types are never deduced from the call site: `template <class R> R parse(std::string_view)` must be called as `parse<int>("42")`.

#### 3. Overloading vs specialization of function templates
- Two ways to customize a function template for some types:
  - **Overloading**: declare another function template or a plain function with the same name.
  - **Explicit (full) specialization**: `template <> void f<int>(int);` gives a different body for one exact argument set.
- Overload resolution only looks at **primary templates and non-template functions**. Specializations are not candidates; they are used only after their primary template has won.
- Ranking (simplified):
  1. Best conversion sequences win.
  2. On a tie, a non-template function beats a template.
  3. On a tie between templates, **partial ordering**: the more specialized template wins (`f(T*)` beats `f(T)` for `int*`, because every `T*` call could go to `f(T)` but not the reverse).
  4. Still tied: ambiguous.
- **Function templates cannot be partially specialized**. `template <class T> void f<T*>(T*)` is an error ("non-class, non-variable partial specialization ... is not allowed"). Use an overload instead.
- The classic trap (often called the Dimov/Abrahams example): a full specialization `f<int*>` of `f(T)` is ignored if an overload `f(T*)` exists and wins partial ordering. The specialization's body never runs.
- Guideline: prefer overloading (or `if constexpr`, or a class template with partial specialization) over explicit specialization of function templates.

#### 4. Class template specialization: full and partial
- Full specialization: `template <> struct Traits<bool> { ... };` a completely separate class for one argument set; it shares nothing with the primary (no members are inherited from it).
- Partial specialization: a pattern that matches a family of arguments:
  - `template <class T> struct Traits<T*>` (any pointer)
  - `template <class T> struct Traits<std::vector<T>>`
  - `template <class T> struct Same<T, T>` (both arguments equal)
- Selection: the compiler finds all partial specializations that match; if one is more specialized than all others it is used; if two match equally, the use is ambiguous; if none match, the primary is used.
- A specialization must be declared before the first use that would instantiate it; otherwise the program is ill-formed, no diagnostic required (in practice the primary is often used silently).
- This is how `<type_traits>` is built (`std::is_pointer<T*>`, `std::remove_const<const T>`); writing traits is covered in topic 11.
- Member specialization: a single member function of a class template can be fully specialized (`template <> void Box<int>::print() { }`) without rewriting the class.
- Variable templates can be partially specialized too (`template <class T> constexpr bool is_ptr_v<T*> = true;`).

#### 5. Two-phase lookup and dependent names
- Templates are checked twice:
  - **Phase 1** (definition): non-dependent names are looked up and non-dependent code is checked. `undeclared_function();` with no dependent argument is an error even if the template is never used (GCC, Clang).
  - **Phase 2** (instantiation): names that depend on template parameters are resolved, with ADL at the point of instantiation.
- A **dependent name** is one whose meaning depends on `T`: `T::value_type`, `obj.size()` where `obj` is a `T`, `Base<T>::member`.
- Disambiguators, because in phase 1 the compiler cannot know what a dependent name is:
  - `typename T::value_type x;` says "this is a type" (without it, it is parsed as a value; error).
  - `obj.template get<0>()` says "`get` is a template, `<` is not less-than".
  - C++20 relaxed `typename` in many places where only a type can appear (alias declarations, return types, parameter types of member declarations).
- **Dependent base classes**: members of `Base<T>` are not found by unqualified lookup in a derived class template. `helper()` alone fails ("there are no arguments to 'helper' that depend on a template parameter"). Write `this->helper()` or `Base<T>::helper()` or add `using Base<T>::helper;`.
- Reason: `Base<T>` could be specialized later to not have `helper`, so the compiler refuses to assume.

#### 6. Non-type template parameters (NTTP)
- Values known at compile time: integers, enums, pointers/references to objects with static storage, `std::nullptr_t`; C++20 adds floating point and **structural class types** (all members public and themselves structural).
- `template <auto V>` (C++17) deduces the NTTP's type: `Constant<42>`, `Constant<'x'>`.
- Classic uses: `std::array<T, N>`, fixed-size buffers, compile-time configuration, `std::get<I>`.
- String literals cannot be NTTP arguments directly (`Tag<"x">` with `const char*` is an error), but C++20 allows a class type that copies the characters: `template <FixedString S> struct Field;` used as `Field<"price">`.
- Each distinct value is a distinct type: `Buffer<64>` and `Buffer<128>` share nothing at runtime, which is both the speed (constants folded) and the bloat.

#### 7. Class template argument deduction (CTAD, C++17)
- `std::pair p{1, 2.5};` deduces `std::pair<int, double>`; `std::vector v{1, 2, 3};` deduces `std::vector<int>`; `std::lock_guard lk(m);` deduces the mutex type.
- The compiler builds deduction candidates from the constructors (implicit guides) and from **user-written deduction guides**:
  ```cpp
  template <class T> struct Wrapper { Wrapper(T) {} };
  Wrapper(const char*) -> Wrapper<std::string>;   // guide: literals become strings
  ```
- Surprises:
  - `std::pair p{1, "x"};` is `pair<int, const char*>`, not `pair<int, std::string>`.
  - `std::vector v{other_vec};` is a **copy** (`vector<int>`), not a vector of vectors: the copy deduction candidate is preferred for a single argument of the same template.
  - `std::vector v{it1, it2};` with braces deduces `vector<iterator>` (initializer_list of two iterators); `std::vector v(it1, it2)` with parentheses uses the iterator-pair guide and deduces the element type.
  - CTAD is all-or-nothing: `std::array<int> a{1, 2};` is an error; write `std::array a{1, 2}` or specify both arguments.
- C++20: CTAD for aggregates and alias templates.

#### 8. Variadic templates and fold expressions
- `template <class... Ts> void log(const Ts&... args);` declares a **template parameter pack** and a **function parameter pack**.
- `sizeof...(Ts)` gives the count at compile time.
- **Pack expansion** `pattern...` repeats the pattern for each element: `f(std::forward<Ts>(args)...)`, `std::tuple<std::vector<Ts>...>`, `g(h(args)...)`.
- Before C++17, processing a pack needed recursion: a base case plus `head, tail...` overload.
- **Fold expressions** (C++17) reduce a pack with a binary operator:

| Form | Name | Expansion for `(a, b, c)` |
|---|---|---|
| `(args op ...)` | Unary right | `a op (b op c)` |
| `(... op args)` | Unary left | `(a op b) op c` |
| `(args op ... op init)` | Binary right | `a op (b op (c op init))` |
| `(init op ... op args)` | Binary left | `((init op a) op b) op c` |
- Direction matters for non-associative operators: `(args - ...)` on `(10, 3, 2)` is `10 - (3 - 2) = 9`; `(... - args)` is `(10 - 3) - 2 = 5`.
- **Empty pack** in a unary fold: only three operators have a value:
  - `&&` gives `true`, `||` gives `false`, `,` gives `void()`.
  - Any other operator (`+`, `*`, ...) is a compile error ("fold of empty expansion over operator+"). Use a binary fold with an init: `(0 + ... + args)`.
- Comma fold for "do this for each": `(std::cout << ... << args);` (binary left fold over `<<`), or `((std::cout << args << ' '), ...);`.
- The comma fold evaluates left to right (the built-in comma operator sequences its operands).

#### 9. CRTP and deducing this
- **CRTP** (Curiously Recurring Template Pattern): `struct Derived : Base<Derived>`. The base knows the derived type at compile time and calls into it with `static_cast<Derived&>(*this).step()`.
- Uses: static polymorphism (no virtual call, no vptr, inlinable), mixins that add operators or counters to a class, compile-time "interface" enforcement.
- Limits:
  - `Base<A>` and `Base<B>` are unrelated types: no `std::vector<Base*>` of mixed derived objects, no runtime choice of type. Use `virtual` (or `std::variant`, topic 04) for that.
  - Writing `struct B : Base<A>` by mistake compiles and casts `*this` to the wrong type: UB. Guard with a private constructor plus `friend Derived;` in the base.
  - It removes the virtual dispatch and *enables* inlining; the optimizer still decides whether to inline.
- **Deducing this** (C++23, explicit object parameter): `void process(this auto& self) { self.step(); }`.
  - `self` is deduced as the actual object type (the derived class) at the call site: no template base, no cast.
  - An error (derived class has no `step`) is reported when `process` is instantiated for that class, at the call.
  - Also removes const/non-const/`&&` overload duplication: one `this auto&& self` member covers all.
  - Needs GCC 14 or Clang 18 (or newer); GCC 11 and 13 do not support it.

#### 10. Misconceptions to unlearn
- ❌ "Templates are type-checked when defined." ✅ Only non-dependent parts; dependent code is checked at instantiation.
- ❌ "`add(10, 20.5)` converts 10 to double." ✅ Deduction does no conversions; it fails.
- ❌ "Pass by value deduces `const int` from a `const int`." ✅ Top-level const is dropped; `T` is `int`.
- ❌ "A full specialization is an overload." ✅ It is not a candidate in overload resolution; only its primary template is.
- ❌ "Function templates can be partially specialized like classes." ✅ They cannot; overload instead.
- ❌ "`typename` and `class` differ in a template parameter list." ✅ Identical there; `typename` is additionally the disambiguator for dependent types.
- ❌ "Members of a templated base are visible like normal inheritance." ✅ Not for unqualified names; use `this->`.
- ❌ "`std::vector v{a, b}` always makes a vector of the element type." ✅ CTAD with braces prefers the initializer list: two iterators make a `vector<iterator>`.
- ❌ "An empty fold is fine for any operator." ✅ Only `&&`, `||` and `,`.
- ❌ "CRTP guarantees inlining." ✅ It removes the virtual call; inlining is still the optimizer's decision.
- ❌ "Templates must go in headers because of a language rule about `.cpp` files." ✅ The rule is visibility at instantiation; explicit instantiation in a `.cpp` works for a closed set of types.

### EDGE_CASES: Traps and Misconceptions

#### Edge Case 1: Conflicting deduction
- `template <class T> T add(T a, T b);` with `add(10, 20.5)`: `T` deduced as `int` from the first argument and `double` from the second.
- GCC: `no matching function for call to 'add(int, double)'`, note: `deduced conflicting types for parameter 'T' ('int' and 'double')`.
- `add<double>(10, 20.5)` compiles: with `T` given, deduction is skipped and 10 converts to `10.0`.
- Similar trap: `std::max(1, 2L)` (int vs long) and `std::min(x, 0)` with `size_t x`.

#### Edge Case 2: The specialization that is never called
```cpp
#include <iostream>

template <class T> void f(T)  { std::cout << "f(T)\n"; }
template <> void f<>(int*)    { std::cout << "f(T) specialized for int*\n"; }
template <class T> void f(T*) { std::cout << "f(T*)\n"; }

int main() {
    int x = 0;
    f(&x);   // f(T*)
}
```
- The specialization belongs to the first template (`f(T)` with `T = int*`), because it was declared before `f(T*)` existed.
- Overload resolution compares the two primaries; `f(T*)` is more specialized and wins. The specialization of the loser is never considered.
- Declaring the specialization **after** `f(T*)` would make it a specialization of `f(T*)` (with `T = int`) and it would be called. Order-dependent behaviour: one more reason to overload instead.

#### Edge Case 3: Partial specialization of a function template
- `template <class T> void print<T*>(T* p);` is rejected: `non-class, non-variable partial specialization 'print<T*>' is not allowed`.
- Workarounds:
  - Overload: `template <class T> void print(T* p);`
  - `if constexpr (std::is_pointer_v<T>)` inside one template.
  - Forward to a class template that can be partially specialized: `PrintImpl<T>::run(x)`.

#### Edge Case 4: Missing typename, template or this->
- `T::value_type x;` is parsed as a value expression: error "need 'typename' before 'T::value_type' because 'T' is a dependent scope".
- `t.get<0>()` where `t` depends on `T`: may parse `<` as less-than; write `t.template get<0>()`.
- In `template <class T> struct D : Base<T> { void g() { helper(); } };`, `helper` is not found in the dependent base: "there are no arguments to 'helper' that depend on a template parameter, so a declaration of 'helper' must be available". Fix: `this->helper()`.
- Some compilers in permissive modes historically accepted these; GCC and Clang reject them.

#### Edge Case 5: Empty packs and unary folds
- `template <class... T> auto sum(T... v) { return (v + ...); }` compiles, but `sum()` fails: "fold of empty expansion over operator+".
- `(v && ...)` with no arguments is `true`; `(v || ...)` is `false`; `(v , ...)` is `void()`.
- Fix: `(0 + ... + v)` (binary fold with an identity) or `if constexpr (sizeof...(v) == 0)`.
- With a binary fold, the init also fixes the result type: `(0.0 + ... + v)` sums in `double`.

#### Edge Case 6: CTAD that deduces the "wrong" type
- `std::vector<int> src{1, 2, 3};`
  - `std::vector a{src};` is `vector<int>` (copy), size 3.
  - `std::vector b{src, src};` is `vector<vector<int>>`, size 2.
  - `std::vector c{src.begin(), src.end()};` is `vector<vector<int>::iterator>`, size 2.
  - `std::vector d(src.begin(), src.end());` is `vector<int>`, size 3.
- `std::pair p{"key", 1};` stores a `const char*`; comparing `p.first == other` compares pointers if `other` is also `const char*`.
- Use an explicit type when the element type matters for correctness.

#### Edge Case 7: Template defined in a .cpp file
- Header declares `template <class T> T clamp01(T);`, `clamp.cpp` defines it, `main.cpp` calls `clamp01(0.5)`.
- Compiles, then fails at link time: `undefined reference to 'double clamp01<double>(double)'`. `clamp.cpp` never instantiated the `double` version because nothing there used it.
- Fixes: define the template in the header, or add `template double clamp01<double>(double);` (explicit instantiation) in `clamp.cpp` for each supported type.

#### Edge Case 8: Arrays: decay by value, size by reference
- `template <class T> void by_val(T)` with `int arr[10]` gives `T = int*`: `sizeof(T)` is 8 (x86-64), the size is lost.
- `template <class T> void by_ref(T&)` gives `T = int[10]`: `sizeof(T)` is 40.
- `template <class T, std::size_t N> constexpr std::size_t count(T (&)[N]) { return N; }` is how `std::size` works for arrays.
- String literals are arrays too: `by_ref("abc")` deduces `T = const char[4]`, so `by_ref("abc")` and `by_ref("abcd")` are two different instantiations.

#### Edge Case 9: CRTP with the wrong derived type
- `struct A : Counter<A> {}; struct B : Counter<A> {};` compiles. Inside `Counter<A>`, `static_cast<A&>(*this)` on a `B` object is UB.
- Guard: make the base's constructor private and befriend the template argument:
  ```cpp
  template <class D> class Counter {
      Counter() = default;
      friend D;              // only D can construct Counter<D>
  };
  ```
  Now `struct B : Counter<A> {}; B b;` fails to compile (GCC: "use of deleted function 'B::B()'", because "'constexpr Counter<D>::Counter() [with D = A]' is private within this context").
- Deducing this (C++23) has no such hole: `self` is always the real object's type.

### CODE_EXAMPLES: Practical Demonstrations

#### Example 1: Deduction for by-value, by-reference and const-reference parameters
- `__PRETTY_FUNCTION__` is a GCC/Clang extension that prints the deduced `T`.
```cpp
#include <iostream>

template <class T> void by_value(T)      { std::cout << __PRETTY_FUNCTION__ << '\n'; }
template <class T> void by_ref(T&)       { std::cout << __PRETTY_FUNCTION__ << '\n'; }
template <class T> void by_cref(const T&) { std::cout << __PRETTY_FUNCTION__ << '\n'; }

int main() {
    const int ci = 1;
    const int* pci = &ci;
    int arr[3] = {1, 2, 3};

    by_value(ci);     // top-level const dropped
    by_value(pci);    // low-level const kept
    by_value(arr);    // array decays
    by_ref(ci);       // const kept
    by_ref(arr);      // no decay
    by_cref(42);      // rvalue binds to const T&
}
```
- Output (GCC):
```
void by_value(T) [with T = int]
void by_value(T) [with T = const int*]
void by_value(T) [with T = int*]
void by_ref(T&) [with T = const int]
void by_ref(T&) [with T = int [3]]
void by_cref(const T&) [with T = int]
```
- `by_ref(42)` would not compile: `T = int` is deduced, but a non-const lvalue reference cannot bind to an rvalue.

#### Example 2: Overloads, partial ordering, and a non-template winner
```cpp
#include <iostream>

template <class T> void show(T)        { std::cout << "show(T)\n"; }
template <class T> void show(T*)       { std::cout << "show(T*)\n"; }
template <class T> void show(const T*) { std::cout << "show(const T*)\n"; }
void show(int)                         { std::cout << "show(int) non-template\n"; }

int main() {
    int x = 0;
    const int cx = 0;
    show(x);          // exact match: non-template preferred over show<int>(int)
    show(1.5);        // only show(T) fits
    show(&x);         // show(T*): exact match, more specialized than show(T)
    show(&cx);        // show(const T*): most specialized for const int*
    show<int>(x);     // explicit template args: the non-template is not a candidate
}
```
- Output:
```
show(int) non-template
show(T)
show(T*)
show(const T*)
show(T)
```
- For `&x` (`int*`), `show(const T*)` needs a qualification conversion, so `show(T*)` (exact match) wins on conversions before partial ordering is even needed.

#### Example 3: Class template partial specialization
```cpp
#include <iostream>
#include <string>
#include <vector>

template <class T>
struct TypeInfo { static std::string name() { return "generic"; } };

template <>
struct TypeInfo<int> { static std::string name() { return "int"; } };

template <class T>
struct TypeInfo<T*> {
    static std::string name() { return "pointer to " + TypeInfo<T>::name(); }
};

template <class T>
struct TypeInfo<std::vector<T>> {
    static std::string name() { return "vector of " + TypeInfo<T>::name(); }
};

template <class A, class B> struct SameType       { static constexpr bool value = false; };
template <class A>          struct SameType<A, A> { static constexpr bool value = true; };

int main() {
    std::cout << TypeInfo<double>::name() << '\n';
    std::cout << TypeInfo<int**>::name() << '\n';
    std::cout << TypeInfo<std::vector<int*>>::name() << '\n';
    std::cout << SameType<int, int>::value << SameType<int, long>::value << '\n';
}
```
- Output:
```
generic
pointer to pointer to int
vector of pointer to int
10
```
- The pointer specialization recurses through `TypeInfo<T>`, so patterns compose.

#### Example 4: Two-phase lookup: typename, template and this->
```cpp
#include <iostream>
#include <tuple>
#include <vector>

template <class Container>
typename Container::value_type first_or(const Container& c,
                                        typename Container::value_type fallback) {
    return c.empty() ? fallback : *c.begin();       // typename: dependent type
}

template <class Tuple>
auto second(const Tuple& t) {
    return std::get<1>(t);                          // free function: no disambiguator needed
}

template <class T>
struct Holder {
    template <int I> T get() const { return value * I; }
    T value;
};

template <class T>
T triple(const Holder<T>& h) {
    return h.template get<3>();                     // template: dependent member template
}

template <class T>
struct Base {
    void helper() const { std::cout << "Base::helper\n"; }
};

template <class T>
struct Derived : Base<T> {
    void run() const { this->helper(); }            // this->: name in a dependent base
};

int main() {
    std::vector<int> v{7, 8};
    std::cout << first_or(v, -1) << ' ' << first_or(std::vector<int>{}, -1) << '\n';
    std::cout << second(std::tuple{1, 2.5, 'c'}) << '\n';
    std::cout << triple(Holder<int>{5}) << '\n';
    Derived<int>{}.run();
}
```
- Output:
```
7 -1
2.5
15
Base::helper
```
- Remove `this->` and GCC reports: "there are no arguments to 'helper' that depend on a template parameter, so a declaration of 'helper' must be available".

#### Example 5: CTAD, deduction guides and class-type NTTP (C++20)
```cpp
#include <algorithm>
#include <cstddef>
#include <iostream>
#include <string>
#include <type_traits>
#include <vector>

template <class T>
struct Named {
    Named(T v) : value(v) {}
    T value;
};
Named(const char*) -> Named<std::string>;          // deduction guide

template <std::size_t N>
struct FixedString {                               // structural type: usable as NTTP
    char text[N];
    constexpr FixedString(const char (&s)[N]) { std::copy_n(s, N, text); }
};

template <FixedString Name>
struct Field {
    double value;
    void print() const { std::cout << Name.text << '=' << value << '\n'; }
};

int main() {
    Named a{42};
    Named b{"order"};
    static_assert(std::is_same_v<decltype(a), Named<int>>);
    static_assert(std::is_same_v<decltype(b), Named<std::string>>);
    std::cout << b.value.size() << '\n';

    std::vector<int> src{1, 2, 3};
    std::vector braces{src.begin(), src.end()};    // vector<iterator>, size 2
    std::vector parens(src.begin(), src.end());    // vector<int>, size 3
    std::cout << braces.size() << ' ' << parens.size() << '\n';

    Field<"price"> f{101.5};
    f.print();
}
```
- Output:
```
5
2 3
price=101.5
```
- Without the guide, `Named b{"order"}` would be `Named<const char*>`.

#### Example 6: Variadics: sizeof..., fold direction, comma folds
```cpp
#include <iostream>
#include <string>

template <class... Ts>
auto sub_right(Ts... v) { return (v - ...); }        // a - (b - c)

template <class... Ts>
auto sub_left(Ts... v) { return (... - v); }         // (a - b) - c

template <class... Ts>
auto sum(Ts... v) { return (0 + ... + v); }          // binary: works when empty

template <class... Ts>
bool all_positive(Ts... v) { return ((v > 0) && ...); }   // empty: true

template <class... Ts>
void log_line(const Ts&... args) {
    std::cout << sizeof...(Ts) << " fields:";
    ((std::cout << ' ' << args), ...);               // comma fold, left to right
    std::cout << '\n';
}

int main() {
    std::cout << sub_right(10, 3, 2) << ' ' << sub_left(10, 3, 2) << '\n';
    std::cout << sum() << ' ' << sum(1, 2, 3.5) << '\n';
    std::cout << std::boolalpha << all_positive() << ' ' << all_positive(1, -2) << '\n';
    log_line("order", 42, 101.25, std::string("filled"));
}
```
- Output:
```
9 5
0 6.5
true false
4 fields: order 42 101.25 filled
```
- `sum()` with a unary `(v + ...)` would not compile.

#### Example 7: CRTP vs deducing this (C++23)
- Compiled with GCC 14, `-std=c++23` (GCC 11 and 13 reject `this auto`).
```cpp
// C++23
#include <iostream>

// CRTP: base template knows the derived type
template <class Derived>
class Handler {
public:
    void handle(int msg) {
        auto& self = static_cast<Derived&>(*this);
        if (self.accept(msg)) self.process(msg);
    }
private:
    Handler() = default;
    friend Derived;                                  // only Derived can derive correctly
};

class EvenHandler : public Handler<EvenHandler> {
public:
    bool accept(int m) const { return m % 2 == 0; }
    void process(int m) { std::cout << "CRTP processed " << m << '\n'; }
};

// Deducing this: a plain base, self is the most-derived type
struct Pipeline {
    void handle(this auto& self, int msg) {
        if (self.accept(msg)) self.process(msg);
    }
};

struct OddHandler : Pipeline {
    bool accept(int m) const { return m % 2 != 0; }
    void process(int m) { std::cout << "deducing-this processed " << m << '\n'; }
};

int main() {
    EvenHandler e;
    OddHandler o;
    for (int m : {1, 2, 3}) {
        e.handle(m);
        o.handle(m);
    }
}
```
- Output:
```
deducing-this processed 1
CRTP processed 2
deducing-this processed 3
```
- Neither version has a vptr or a virtual call. Both lose the ability to store different handlers behind one base pointer; that still needs `virtual` or `std::variant`.

### QUICK_REFERENCE: Cheat Sheet

#### Deduction summary
| Parameter | Drops top-level const | Array/function decays | Binds rvalues |
|---|---|---|---|
| `T` | Yes | Yes | Yes (copy) |
| `T&` | No (`T` may become `const X`) | No | No |
| `const T&` | n/a (`const` added) | No | Yes |
| `T&&` (forwarding) | See Ch1 | No | Yes |

#### Specialization rules
| Construct | Allowed? | Notes |
|---|---|---|
| Function: full specialization | Yes | Not an overload; avoid, prefer overloads |
| Function: partial specialization | No | Overload or forward to a class |
| Class: full specialization | Yes | Unrelated to the primary's members |
| Class: partial specialization | Yes | Most specialized match wins; ties are ambiguous |
| Variable template: partial | Yes | C++14 |
| Single member of a class template | Full only | `template <> void Box<int>::f()` |

#### Disambiguators
| Situation | Write |
|---|---|
| Dependent type | `typename T::value_type` |
| Dependent member template | `x.template get<0>()` / `T::template rebind<U>` |
| Member of dependent base | `this->m` / `Base<T>::m` / `using Base<T>::m;` |

#### Folds
| Code | Empty pack |
|---|---|
| `(a + ...)` | Error |
| `(0 + ... + a)` | `0` |
| `(a && ...)` | `true` |
| `(a \|\| ...)` | `false` |
| `(f(a), ...)` | `void()` |

#### Version map
| Feature | Standard |
|---|---|
| Variadic templates, `extern template`, alias templates | C++11 |
| Variable templates | C++14 |
| Folds, CTAD, `template <auto>`, `if constexpr` | C++17 |
| Class-type NTTP, aggregate/alias CTAD, concepts, `type_identity` | C++20 |
| Deducing this (explicit object parameter) | C++23 |
| Pack indexing `Ts...[0]` | C++26 |

#### Interview one-liners
| Question | Answer |
|---|---|
| `add(10, 20.5)` with `T add(T, T)`? | Deduction conflict, no match; `add<double>` works |
| `f(T)` with `const int`? | `T = int` |
| `f(T&)` with `const int`? | `T = const int` |
| Specialize or overload a function template? | Overload |
| Partial specialization of a function? | Not allowed |
| Which wins, `f(T)` or `f(T*)` for `int*`? | `f(T*)`, more specialized |
| Why `typename`? | Dependent name is assumed to be a value |
| Why `this->` in a template derived class? | Dependent base members are not found otherwise |
| Why are templates in headers? | Definition needed at instantiation |
| `(a - ...)` on 10,3,2? | 9; `(... - a)` gives 5 |
| CRTP vs virtual? | Compile-time type, no vptr; no heterogeneous containers |
| Deducing this? | C++23 `this auto& self`: CRTP without the template base |
