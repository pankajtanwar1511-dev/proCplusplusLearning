## TOPIC: Templates: Deduction, Specialization and Variadics

### INTERVIEW_QA: Interview Questions with Detailed Answers

#### Q1: What does "instantiating a template" mean, and why do template definitions usually live in headers?
**Difficulty:** #beginner
**Category:** #templates #compilation
**Concepts:** #instantiation #headers #explicit_instantiation

**Answer:**
Instantiation is the compiler generating a concrete function or class from the template for specific arguments, at the point where it is used. To do that it needs the full definition in the same translation unit, so definitions go in headers; otherwise other translation units fail at link time with "undefined reference".

**Explanation:**
- Each distinct argument set is a separate entity: `Stack<int>` and `Stack<double>` share no code unless the optimizer folds identical functions.
- Explicit instantiation lets you keep the definition in a `.cpp`: `template class Stack<int>;` there, plus `extern template class Stack<int>;` in the header to stop other TUs from instantiating it (C++11). This works when the set of types is closed.
- Duplicate implicit instantiations across TUs are merged by the linker (they are inline-like entities), so the ODR is not violated.
- ❌ Common wrong answer: "Templates are compiled once into generic machine code." C++ templates are expanded per argument set; it is not type erasure like Java generics.
- ✅ What a strong answer adds: compile-time cost and binary bloat grow with instantiations; `extern template`, explicit instantiation and moving type-independent code into a non-template base reduce both.

**Key takeaway:** A template is a recipe compiled per use; the recipe must be visible where it is used.

---

#### Q2: Given `template<class T> void f(T)`, `template<class T> void g(T&)` and `const int c = 1;`, what is T in `f(c)` and in `g(c)`? What about an array argument?
**Difficulty:** #intermediate
**Category:** #templates #deduction
**Concepts:** #top_level_const #array_decay #reference_parameters

**Answer:**
`f(c)`: `T = int` (by-value parameters drop top-level const). `g(c)`: `T = const int` (a reference must preserve the const). For `int arr[3]`: `f(arr)` gives `T = int*` (decay) and `g(arr)` gives `T = int[3]` (no decay).

**Explanation:**
- By value creates a new object; whether the caller's object was const is irrelevant to the copy.
- Low-level const is kept: `const int* p; f(p)` deduces `T = const int*`.
- `const T&` with `const int` gives `T = int` (the const is already in the pattern); it also accepts rvalues like `42`, while `T&` does not.
- `T&` preserving array types is how `template <class T, std::size_t N> std::size_t size(T (&)[N])` recovers `N`.
- Forwarding references `T&&` follow different rules (Ch1, Core Language).
- ❌ Common wrong answer: "`f(c)` deduces `const int`, so `x` can't be modified inside." Inside `f` the parameter is a mutable `int` copy.
- ✅ What a strong answer adds: string literals are `const char[N]` arrays, so `g("abc")` and `g("abcd")` are two different instantiations.

**Key takeaway:** By value strips top-level const and decays arrays; by reference keeps both.

---

#### Q3: Why does `add(10, 20.5)` fail for `template<class T> T add(T, T)`, and how do you fix it?
**Difficulty:** #beginner
**Category:** #templates #deduction
**Concepts:** #conflicting_deduction #explicit_template_arguments

**Answer:**
`T` is deduced independently from each argument: `int` from `10` and `double` from `20.5`. The two deductions conflict and deduction performs no conversions, so there is no viable function ("deduced conflicting types for parameter 'T'"). Fix with `add<double>(10, 20.5)`, matching argument types, or two template parameters.

**Explanation:**
- With an explicit `T`, deduction is skipped and normal implicit conversions apply: `10` converts to `10.0`.
- Two-parameter version: `template <class A, class B> auto add(A a, B b) { return a + b; }` returns `double` here.
- C++20 `std::type_identity_t<T>` on one parameter makes it non-deduced, so only the other argument decides `T`.
- Same root cause as `std::max(1, 2L)` failing.
- ❌ Common wrong answer: "It compiles and returns 30 because 20.5 is truncated." Nothing is converted during deduction; it fails to compile.
- ✅ What a strong answer adds: quoting the GCC note "deduced conflicting types for parameter 'T' ('int' and 'double')".

**Key takeaway:** Deduction must agree across all arguments and never converts; specify `T` to allow conversions.

---

#### Q4: Should you specialize a function template or overload it? Why?
**Difficulty:** #intermediate
**Category:** #templates #overloading
**Concepts:** #explicit_specialization #overload_resolution #partial_ordering

**Answer:**
Overload. Explicit specializations do not take part in overload resolution: the compiler first picks the best primary template (or non-template function), and only then checks whether that primary has a specialization for the deduced arguments. A specialization of a primary that loses is silently ignored.

**Explanation:**
- With `template<class T> void f(T)`, a specialization `f<int*>`, and an overload `template<class T> void f(T*)`, the call `f(&x)` picks the overload `f(T*)` (more specialized) and the specialization never runs.
- Moving the specialization after `f(T*)` changes which primary it belongs to (now `f(T*)` with `T = int`) and it is called: the behaviour depends on declaration order.
- Overloads are visible, rank by normal rules, and cannot be "attached" to the wrong primary.
- Exception: specializing `std::` customization points such as `std::hash<MyType>` (a class template) is correct and expected (see topic 09).
- ❌ Common wrong answer: "A specialization is just a more specific overload, so it wins." It is not a candidate at all.
- ✅ What a strong answer adds: for type-dependent behaviour inside one function, `if constexpr` is often cleaner than either.

**Key takeaway:** Customize function templates with overloads; full specializations are invisible to overload resolution.

---

#### Q5: Why can't you partially specialize a function template? What are the alternatives?
**Difficulty:** #intermediate
**Category:** #templates #specialization
**Concepts:** #partial_specialization #overloading #tag_dispatch

**Answer:**
The language simply does not allow it: overloading already covers the use case, and mixing partial specialization with overloading would make resolution even harder. `template<class T> void foo<T*>(T*)` gives "non-class, non-variable partial specialization 'foo<T*>' is not allowed".

**Explanation:**
- Alternatives:
  - Overload: `template <class T> void foo(T*)`.
  - `if constexpr (std::is_pointer_v<T>)` in a single template.
  - Delegate to a class template, which can be partially specialized: `template <class T> void foo(T x) { FooImpl<T>::run(x); }`.
  - Tag dispatch or concepts (topic 11).
- Class templates and variable templates can be partially specialized.
- ❌ Common wrong answer: "You can, with `template<class T> void foo<T*>(T*)`." It does not compile.
- ✅ What a strong answer adds: the class-delegation trick is what the standard library uses internally when it needs pattern matching on function arguments.

**Key takeaway:** Functions: overload. Classes: partially specialize.

---

#### Q6: With `template<class T> void f(T)` and `template<class T> void f(T*)`, which one does `f(&x)` call for `int x`, and what is T in each?
**Difficulty:** #intermediate
**Category:** #templates #overloading
**Concepts:** #partial_ordering #more_specialized

**Answer:**
`f(T*)` is called. Both are exact matches (`f(T)` with `T = int*`, `f(T*)` with `T = int`), so partial ordering decides: `f(T*)` is more specialized because any argument it accepts could also go to `f(T)`, but not the other way round.

**Explanation:**
- Partial ordering is only a tie-breaker after conversion ranking. If one candidate needs a conversion and the other does not, conversions decide first (e.g. `f(const T*)` vs `f(T*)` for an `int*`: `f(T*)` is an exact match and wins).
- A non-template function with an equally good match beats any template.
- If neither template is more specialized (e.g. `f(T, int)` and `f(int, T)` called with `(1, 1)`), the call is ambiguous.
- ❌ Common wrong answer: "`f(T)` because it was declared first." Declaration order does not affect overload resolution.
- ✅ What a strong answer adds: "more specialized" is computed by deducing each template's parameters from the other's, not by counting characters.

**Key takeaway:** Conversions first, then non-template preference, then partial ordering among templates.

---

#### Q7: What is the difference between full and partial specialization of a class template, and how is a specialization selected?
**Difficulty:** #beginner
**Category:** #templates #specialization
**Concepts:** #full_specialization #partial_specialization #matching

**Answer:**
A full specialization (`template<> struct S<int>`) replaces the class for one exact argument list. A partial specialization (`template<class T> struct S<T*>`) is a pattern for a family of arguments. On use, the compiler finds all matching partial specializations, picks the most specialized one, falls back to the primary if none match, and reports ambiguity if two match equally.

**Explanation:**
- A specialization is a completely separate class: it has only the members you write, nothing from the primary.
- Ambiguity example: `S<T*, U>` and `S<T, U*>` both match `S<int*, int*>`, and neither is more specialized: compile error (add `S<T*, U*>` to resolve).
- The specialization must be declared before the first use that needs it.
- `std::vector<bool>` is the famous (regretted) full specialization: different storage and a proxy reference (topic 05).
- ❌ Common wrong answer: "A specialization inherits the primary's members and overrides some." It shares nothing.
- ✅ What a strong answer adds: partial specializations are the foundation of type traits (`is_pointer<T*>`, `remove_const<const T>`), covered in topic 11.

**Key takeaway:** Full = one exact case; partial = a pattern; the most specialized match wins, ties are errors.

---

#### Q8: What is two-phase lookup, and why do you sometimes need `typename` and `template` inside templates?
**Difficulty:** #intermediate
**Category:** #templates #name_lookup
**Concepts:** #dependent_names #typename #template_disambiguator

**Answer:**
Templates are checked in two phases: at definition, non-dependent names are looked up and checked; at instantiation, names that depend on template parameters are resolved. Because a dependent name's meaning is unknown in phase 1, the compiler assumes it is a value and not a template; `typename T::X` says it is a type, `x.template f<1>()` says it is a template.

**Explanation:**
- `T::value_type v;` without `typename`: GCC says "need 'typename' before 'T::value_type' because 'T' is a dependent scope".
- `obj.get<0>()` with a dependent `obj` may be parsed as `(obj.get < 0) > ()`.
- C++20 removed the `typename` requirement in contexts where only a type can appear (for example `using X = T::value_type;`).
- Phase 1 also means an undeclared, non-dependent function call inside a never-used template is already an error in GCC and Clang.
- ❌ Common wrong answer: "Templates are not checked at all until used." Non-dependent code is checked at definition.
- ✅ What a strong answer adds: ADL for dependent calls happens at the point of instantiation, which is how customization points like `swap(a, b)` find user overloads.

**Key takeaway:** Dependent names are assumed to be values; mark types with `typename` and member templates with `template`.

---

#### Q9: Why does calling a base-class member fail inside a class template that derives from `Base<T>`?
**Difficulty:** #intermediate
**Category:** #templates #name_lookup
**Concepts:** #dependent_base #this_arrow #unqualified_lookup

**Answer:**
`Base<T>` is a dependent base class, and unqualified names are not looked up in dependent bases (a later specialization of `Base<T>` might not have that member). Write `this->helper()`, `Base<T>::helper()`, or `using Base<T>::helper;`.

**Explanation:**
- GCC: "there are no arguments to 'helper' that depend on a template parameter, so a declaration of 'helper' must be available".
- `this->` makes the expression dependent, deferring lookup to phase 2 where `Base<int>` is known.
- `Base<T>::helper()` suppresses virtual dispatch if `helper` is virtual; `this->helper()` does not.
- Common in CRTP-like and policy-based code.
- ❌ Common wrong answer: "Inheritance from templates does not inherit members." They are inherited; they are just not found by unqualified lookup.
- ✅ What a strong answer adds: the reason (specializations) and the virtual-call difference between `this->` and qualification.

**Key takeaway:** In a class template, reach dependent base members via `this->`.

---

#### Q10: What is CTAD, what are deduction guides, and what are its pitfalls?
**Difficulty:** #intermediate
**Category:** #templates #ctad
**Concepts:** #class_template_argument_deduction #deduction_guides #initializer_list

**Answer:**
Class template argument deduction (C++17) deduces class template arguments from constructor arguments: `std::pair p{1, 2.5}` is `pair<int, double>`. Deduction guides (`Wrapper(const char*) -> Wrapper<std::string>;`) add or override deduction rules. Pitfalls: string literals deduce `const char*`, and braces prefer `initializer_list` constructors.

**Explanation:**
- `std::vector v{src.begin(), src.end()}` is a `vector<iterator>` of size 2; parentheses `std::vector v(src.begin(), src.end())` give `vector<int>`.
- `std::vector v{other}` copies (`vector<int>`), while `std::vector v{other, other}` is a `vector<vector<int>>`.
- CTAD is all or nothing: `std::array<int> a{1, 2}` is an error (two template parameters, only one given).
- Standard guides exist for iterator-pair constructors, `std::array`, `std::function` from function pointers, etc.
- C++20 added CTAD for aggregates and alias templates.
- ❌ Common wrong answer: "CTAD works like `auto`, so it always picks the obvious type." It runs overload resolution over constructor-based candidates, with all its surprises.
- ✅ What a strong answer adds: lock guards are the everyday win: `std::scoped_lock lk(m1, m2);`.

**Key takeaway:** CTAD saves typing; spell the type out when the deduced type matters.

---

#### Q11: What can be a non-type template parameter, and what changed in C++17 and C++20?
**Difficulty:** #intermediate
**Category:** #templates #nttp
**Concepts:** #non_type_template_parameter #auto_nttp #structural_types

**Answer:**
Compile-time values of integral/enum type, pointers and references to objects or functions with static storage, and `std::nullptr_t`. C++17 added `template <auto V>` (type deduced from the argument). C++20 added floating-point NTTPs and structural class types (all members public and structural), which enables string-like NTTPs via a `FixedString` wrapper.

**Explanation:**
- `std::array<int, 4>`, `std::get<2>(t)` and bit widths are everyday NTTP uses.
- A plain string literal cannot be an NTTP argument (no linkage, address unspecified), but `template <FixedString S> struct Field;` with `Field<"price">` works in C++20 because the characters are copied into the class value.
- Every distinct value is a distinct instantiation: `Buffer<64>` and `Buffer<65>` are unrelated types.
- ❌ Common wrong answer: "Any `constexpr` value of any type can be an NTTP." The type must be structural (no private members, no mutable members, no references-to-temporaries).
- ✅ What a strong answer adds: NTTPs let the compiler fold constants (a mask, a size) into the generated code; a runtime member would need a load.

**Key takeaway:** NTTPs are compile-time values; C++20 widened them to floating point and simple class types.

---

#### Q12: How do variadic templates work, and how was a pack processed before C++17?
**Difficulty:** #intermediate
**Category:** #templates #variadics
**Concepts:** #parameter_pack #pack_expansion #recursion

**Answer:**
`template <class... Ts> void f(Ts... args)` declares type and value packs; `pattern...` expands a pattern once per element (`g(args)...`, `std::forward<Ts>(args)...`), and `sizeof...(Ts)` gives the count. Before C++17 you processed a pack by recursion: an overload taking `(Head, Tail...)` that handles `Head` and calls itself with `Tail...`, plus a base case.

**Explanation:**
```cpp
#include <iostream>

void print() { std::cout << '\n'; }                      // base case

template <class Head, class... Tail>
void print(const Head& h, const Tail&... t) {
    std::cout << h << (sizeof...(t) ? ", " : "");
    print(t...);                                         // recurse on the tail
}

int main() { print(1, "two", 3.5); }                     // 1, two, 3.5
```
- Recursion creates one instantiation per pack length: more compile time and deeper call chains (usually inlined away).
- C++17 fold expressions or `if constexpr (sizeof...(t) > 0)` remove the need for a separate base case.
- Pack expansion can appear in function arguments, template arguments, base class lists, initializer lists and lambda captures (C++20 `[...xs = std::move(xs)]`).
- ❌ Common wrong answer: "`args...` loops over the arguments at runtime." Expansion happens at compile time; there is no loop.
- ✅ What a strong answer adds: C++26 pack indexing `Ts...[0]` removes much of the remaining recursion.

**Key takeaway:** Packs are expanded at compile time; recursion was the pre-C++17 way to walk them.

---

#### Q13: Explain the four forms of fold expressions. What do `(a - ...)` and `(... - a)` give for (10, 3, 2), and what happens with an empty pack?
**Difficulty:** #intermediate
**Category:** #templates #variadics
**Concepts:** #fold_expressions #associativity #empty_pack

**Answer:**
Unary right `(a op ...)`, unary left `(... op a)`, binary right `(a op ... op init)`, binary left `(init op ... op a)`. For (10, 3, 2): right fold `10 - (3 - 2) = 9`, left fold `(10 - 3) - 2 = 5`. An empty unary fold is an error except for `&&` (true), `||` (false) and `,` (void()).

**Explanation:**
- The `...` position tells you the grouping: dots on the right group from the right.
- Associative operators (`+`, `*` on integers, `&&`) give the same value either way; `-`, `/`, `<<` do not.
- Floating-point `+` is not associative: with `(1e16, -1e16, 1.0)` the right fold gives 0 and the left fold gives 1.
- Binary folds supply an identity for the empty case and fix the result type: `(0.0 + ... + a)`.
- `(std::cout << ... << args)` is a binary left fold; `((std::cout << args << ' '), ...)` is a unary comma fold that prints with separators.
- ❌ Common wrong answer: "An empty pack is always an error" or "an empty `+` fold gives 0". Both are wrong: three operators have defaults, `+` has none.
- ✅ What a strong answer adds: GCC's error text "fold of empty expansion over operator+".

**Key takeaway:** Dots on the right group right; empty unary folds work only for `&&`, `||` and `,`.

---

#### Q14: What is CRTP, what does it buy you over virtual functions, and what can't it do?
**Difficulty:** #intermediate
**Category:** #templates #design
**Concepts:** #crtp #static_polymorphism #virtual_dispatch

**Answer:**
CRTP is `class D : public Base<D>`: the base is parameterized by the derived class, so it can call derived members with `static_cast<D&>(*this)` resolved at compile time. It removes the virtual call and the vptr and lets the compiler inline. It cannot give runtime polymorphism: `Base<A>` and `Base<B>` are unrelated, so no heterogeneous container or runtime type choice.

**Explanation:**
- Typical uses: static interfaces in hot loops, mixins (adding `operator!=` from `operator==`, instance counters), "template method" without virtual calls.
- Inlining is enabled, not guaranteed; the optimizer still decides.
- Each derived type instantiates its own copy of the base code (binary size).
- Trap: `struct B : Base<A>` compiles and invokes UB; guard with a private base constructor and `friend D;`.
- Virtual call cost itself is small when predicted; the larger win is inlining and keeping the object free of a vptr.
- ❌ Common wrong answer: "CRTP is faster than virtual in every case." With one hot type, devirtualization (`final`, LTO) can make virtual just as fast; with many types chosen at runtime CRTP does not apply.
- ✅ What a strong answer adds: when runtime choice is needed among a closed set of types, `std::variant` + `std::visit` is the middle ground (topic 04).

**Key takeaway:** CRTP = compile-time polymorphism: no vptr, inlinable, but no runtime type choice.

---

#### Q15: What is "deducing this" (C++23), and how does it replace CRTP?
**Difficulty:** #advanced
**Category:** #templates #cpp23
**Concepts:** #explicit_object_parameter #crtp #overload_deduplication

**Answer:**
An explicit object parameter: `void process(this auto& self)`. The type of `self` is deduced from the object the function is called on, which is the derived class when called on a derived object. So a plain (non-template) base can call `self.step()` on the derived type without CRTP's template parameter or cast.

**Explanation:**
- If the derived class lacks `step`, the error appears when `process` is instantiated for that class (at the call), e.g. "'struct E' has no member named 'step'".
- It also merges const/non-const/rvalue overloads: `template <class Self> auto&& value(this Self&& self) { return std::forward<Self>(self).v_; }` replaces four member functions.
- Recursive lambdas become possible: `auto fib = [](this auto self, int n) -> int { return n < 2 ? n : self(n - 1) + self(n - 2); };`.
- Restrictions: such a function cannot be `virtual`, `static`, or have cv/ref qualifiers; `this` is not available inside (use `self`).
- Compiler support: GCC 14, Clang 18 and newer. GCC 11 and 13 reject it.
- ❌ Common wrong answer: "You still need to cast `self` to the derived type." No cast: `self` already has the derived type.
- ✅ What a strong answer adds: unlike CRTP, there is no way to name the wrong derived class.

**Key takeaway:** `this auto& self` gives the base the real object type at each call: CRTP without the template plumbing.

---

#### Q16: Why does a template sometimes beat a non-template function that looks like a perfect fit?
**Difficulty:** #intermediate
**Category:** #templates #overloading
**Concepts:** #overload_resolution #exact_match #non_template_preference

**Answer:**
The non-template is preferred only when the conversion sequences are equally good. A template deduces the exact argument type, so if the non-template needs any conversion (for example `int` to `double`, or adding `const` through a reference), the template's exact match wins first.

**Explanation:**
```cpp
#include <iostream>

void note(double) { std::cout << "note(double)\n"; }
template <class T> void note(T) { std::cout << "note(T)\n"; }

int main() {
    note(1.0);  // tie on exact match: non-template wins
    note(1);    // note<int> is exact; note(double) needs int->double: template wins
}
```
- Output: `note(double)` then `note(T)`.
- The same mechanism makes a forwarding-reference constructor hijack copy construction from a non-const lvalue (Ch1).
- ❌ Common wrong answer: "Non-template functions are always preferred over templates." Only as a tie-breaker.
- ✅ What a strong answer adds: to force the non-template path, constrain the template (concepts, topic 11) or delete the unwanted instantiation.

**Key takeaway:** Better conversions beat the non-template preference; templates win by being exact.
