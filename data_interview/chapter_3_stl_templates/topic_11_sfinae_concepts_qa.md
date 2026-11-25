## TOPIC: SFINAE, Type Traits and Concepts

### INTERVIEW_QA: Interview Questions with Detailed Answers

#### Q1: What is SFINAE, and what exactly counts as a "substitution failure"?
**Difficulty:** #intermediate
**Category:** #templates #sfinae
**Concepts:** #substitution #immediate_context #overload_resolution

**Answer:**
Substitution Failure Is Not An Error: when the compiler substitutes deduced template arguments into a function template's signature and gets an invalid type or expression, that template is quietly dropped from the overload set instead of causing an error. Only failures in the immediate context of the signature count; errors in the body are hard errors.

**Explanation:**
- Immediate context: parameter types, return type (including trailing `decltype`), template parameter defaults, the C++20 `explicit(bool)` condition. Not the `noexcept` specifier: it is substituted only when needed, so an invalid `noexcept(T::value)` is a hard error.
- Hard errors (not SFINAE):
  - The function body (instantiated only after the function is selected).
  - `auto` return type deduction, because finding the type needs the body.
  - Errors inside another template that gets instantiated while forming the signature.
- After substitution, the surviving viable candidates are ranked by normal overload resolution.
- ❌ Common wrong answer: "If any overload fails to compile, the compiler tries the next one." Only signature substitution failures are forgiven.
- ✅ What a strong answer adds: the `auto len(T t) { return t.size(); }` example where `len(5)` is a hard error even with a `len(...)` fallback.

**Key takeaway:** SFINAE removes candidates whose signature cannot be formed; it never rescues errors inside bodies.

---

#### Q2: What is a "viable function", and how is the best one picked among templates?
**Difficulty:** #intermediate
**Category:** #templates #overloading
**Concepts:** #viable_function #ranking #partial_ordering

**Answer:**
A viable function is a candidate whose template arguments were deduced and substituted successfully, whose constraints (C++20) are satisfied, and whose parameters can accept the arguments through implicit conversions. The best viable function is chosen by comparing conversion sequences, then preferring non-templates, then the more specialized template (partial ordering), then the more constrained one (subsumption).

**Explanation:**
- Steps: name lookup builds candidates; deduction + substitution (SFINAE drops some); constraint checking; viability (conversions); ranking.
- If two remain equally good: "call of overloaded ... is ambiguous".
- `enable_if` conditions never enter ranking, only viability.
- ❌ Common wrong answer: "Viable means it is the one that gets called." Several can be viable; only the best one is called.
- ✅ What a strong answer adds: the tie-breakers in order, including that constraints only break ties between otherwise equivalent templates.

**Key takeaway:** Viability is pass/fail; ranking picks the winner; SFINAE only affects viability.

---

#### Q3: What are the ways to use std::enable_if, and which form should you prefer?
**Difficulty:** #intermediate
**Category:** #templates #sfinae
**Concepts:** #enable_if #nttp #redefinition

**Answer:**
On the return type, on a function parameter with a default, as a type template parameter default (`class = enable_if_t<C>`), or as a non-type template parameter (`enable_if_t<C, int> = 0`). Prefer the NTTP form: it works for constructors and lets you write two overloads with different conditions.

**Explanation:**
- `template <class T, class = std::enable_if_t<A>>` and the same with `B` are one template declared twice ("redefinition of 'template<class T, class> void f(T)'"): default arguments are not part of the signature.
- With `std::enable_if_t<A, int> = 0`, the condition is in the type of the template parameter, so the two declarations are different templates.
- Return-type form: fine for functions, impossible for constructors and conversion operators.
- Extra-parameter form: changes the function's arity and cannot be used on operators with fixed arity.
- In C++20 code, prefer a `requires` clause.
- ❌ Common wrong answer: "All forms are interchangeable." The type-default form cannot overload on conditions.
- ✅ What a strong answer adds: `enable_if<C>::type` defaults to `void`, so `enable_if_t<C>* = nullptr` is also common in older code.

**Key takeaway:** Use `std::enable_if_t<Cond, int> = 0`, or better, `requires`.

---

#### Q4: You have `template<class T, enable_if_t<is_integral_v<T>, int> = 0> void foo(T)` and `template<class T> void foo(T)`. What does `foo(10)` do?
**Difficulty:** #advanced
**Category:** #templates #sfinae
**Concepts:** #ambiguity #partial_ordering #concepts

**Answer:**
It does not compile: "call of overloaded 'foo(int)' is ambiguous". Both templates are viable with parameter type `int`, and partial ordering does not consider `enable_if` conditions, so neither is more specialized. `foo(3.14)` is fine because only the generic overload is viable.

**Explanation:**
- A frequently repeated wrong answer says "the integral overload is more specialized, so it prints integral". GCC 11 rejects the call.
- Fixes:
  - Make the generic overload exclusive: `enable_if_t<!is_integral_v<T>, int> = 0`.
  - Use `if constexpr` in one function.
  - Use priority tags (preferred overload takes `priority<1>`, fallback takes `priority<0>`).
  - Use concepts: `template <std::integral T> void foo(T)` **is** preferred over `template <class T> void foo(T)`.
- Same story for `auto process(T t) -> decltype(t.size(), void())` vs generic `process(T)` with a `std::string`: ambiguous.
- ❌ Common wrong answer: "The most constrained overload wins." True for concepts, false for SFINAE.
- ✅ What a strong answer adds: explaining why: partial ordering compares parameter types only, and they are identical here.

**Key takeaway:** SFINAE removes, it never prefers; concepts both remove and prefer.

---

#### Q5: What is a type trait, and how is one implemented?
**Difficulty:** #beginner
**Category:** #templates #type_traits
**Concepts:** #integral_constant #partial_specialization #type_transformation

**Answer:**
A class template that answers a compile-time question about a type (`::value`, usually by deriving from `std::true_type`/`std::false_type`) or transforms a type (`::type`). Most are implemented with partial specialization: a primary template gives the default answer and specializations match the patterns.

**Explanation:**
```cpp
#include <iostream>
#include <type_traits>

template <class T> struct remove_ptr { using type = T; };
template <class T> struct remove_ptr<T*> { using type = T; };
template <class T> using remove_ptr_t = typename remove_ptr<T>::type;

template <class T> struct is_ptr : std::false_type {};
template <class T> struct is_ptr<T*> : std::true_type {};

int main() {
    static_assert(std::is_same_v<remove_ptr_t<int*>, int>);
    std::cout << is_ptr<int*>::value << is_ptr<int>::value << '\n';   // 10
}
```
- `_v` (C++17) and `_t` (C++14) helpers avoid `::value` and `typename ...::type`.
- Some traits need compiler intrinsics (`is_trivially_copyable`, `is_enum`, `is_aggregate`).
- Specializing standard type traits yourself is undefined behaviour (except a few designed customization points like `common_type`).
- ❌ Common wrong answer: "Traits are evaluated at runtime with RTTI." They are pure compile-time constructs.
- ✅ What a strong answer adds: references and cv-qualifiers change answers (`is_const_v<const int&>` is false), so strip with `remove_cvref_t`.

**Key takeaway:** Traits are compile-time functions on types, built from partial specialization.

---

#### Q6: Explain the void_t detection idiom. What does std::declval do?
**Difficulty:** #advanced
**Category:** #templates #sfinae
**Concepts:** #void_t #declval #detection_idiom

**Answer:**
A primary template `template <class T, class = void> struct has_x : false_type {}` plus a partial specialization `has_x<T, void_t<decltype(expr)>> : true_type`. If `expr` is valid for `T`, `void_t<...>` is `void` and the specialization matches `has_x<T, void>`; otherwise substitution fails and the primary is used. `std::declval<T>()` yields a `T&&` usable only in unevaluated operands, so you can write `decltype(std::declval<T>().size())` without constructing a `T`.

**Explanation:**
- The default argument `void` is what makes `has_x<T>` match the specialization's second argument.
- `declval` works for types that are not default-constructible or are abstract.
- Calling `declval` in evaluated code is a compile error (it is declared, never defined to be used).
- C++20 equivalent: `template <class T> concept HasSize = requires(const T& t) { t.size(); };`.
- ❌ Common wrong answer: "`void_t` converts any type to void at runtime." It is a type alias used only to trigger SFINAE.
- ✅ What a strong answer adds: the specialization's argument must be exactly `void` (the default); `void_t` guarantees that.

**Key takeaway:** `void_t` + partial specialization + `declval` = "is this expression valid for T?" before C++20.

---

#### Q7: What is tag dispatch, and what are priority tags?
**Difficulty:** #intermediate
**Category:** #templates #design
**Concepts:** #tag_dispatch #iterator_category #priority_tags

**Answer:**
Tag dispatch passes an empty object whose type encodes a property (for example `std::random_access_iterator_tag`) and lets ordinary overload resolution pick an implementation by that type. Priority tags are tags that inherit from each other (`priority<1> : priority<0>`): the overload taking the higher priority is preferred, and the lower one is the fallback when SFINAE removes the higher one.

**Explanation:**
- `std::advance` / `std::distance` are classic: O(1) for random access, a loop otherwise. Tag inheritance (`random_access` derives from `bidirectional` ...) makes the most derived matching overload win.
- Priority tags turn an ambiguous SFINAE pair into an ordered one: the derived-to-base conversion to `priority<0>` ranks below the exact `priority<1>`.
- Pure compile-time: tags are empty and optimized away.
- In C++20, concept subsumption on `std::random_access_iterator` etc. replaces both.
- ❌ Common wrong answer: "Tag dispatch is a runtime switch on a type enum." The choice is made at compile time.
- ✅ What a strong answer adds: tag dispatch keeps each implementation a separate, unconstrained function, which gives clear errors and easy extension.

**Key takeaway:** Encode the property in a type, overload on it; inheritance between tags gives ordering.

---

#### Q8: Compare `if constexpr`, a normal `if`, and `enable_if` inside a template.
**Difficulty:** #intermediate
**Category:** #templates #compile_time
**Concepts:** #if_constexpr #discarded_statement #sfinae

**Answer:**
A normal `if` requires both branches to compile for every `T`, even if the condition is a constant. `if constexpr` (C++17) discards the untaken branch, and inside a template with a dependent condition the discarded branch is not instantiated. `enable_if` works at the overload level: whole functions are added or removed from overload resolution.

**Explanation:**
```cpp
#include <iostream>
#include <string>
#include <type_traits>

template <class T>
std::size_t length(const T& v) {
    if constexpr (std::is_arithmetic_v<T>) return 1;
    else return v.size();             // not instantiated for int
}

int main() {
    std::cout << length(42) << ' ' << length(std::string("abcd")) << '\n';   // 1 4
}
```
- With a plain `if`, `length(42)` fails: "request for member 'size' in 'v', which is of non-class type 'const int'".
- `if constexpr` keeps all cases in one function (closed set); overloads (SFINAE or concepts) let other code add cases (open set).
- `if constexpr` does not participate in overload resolution: it cannot make a call ill-formed for unsupported types (add a `static_assert` or a constraint for that).
- ❌ Common wrong answer: "A normal `if` with a constant condition is optimized away, so it's the same." Optimization happens after type checking; the code must still compile.
- ✅ What a strong answer adds: the discarded-branch rule only applies in templates with value-dependent conditions (next question).

**Key takeaway:** `if constexpr` = compile-time branch in one template; `enable_if`/concepts = compile-time choice between functions.

---

#### Q9: When does `if constexpr` NOT protect you, and what about `static_assert(false)` in the else branch?
**Difficulty:** #advanced
**Category:** #templates #compile_time
**Concepts:** #discarded_statement #value_dependent #p2593

**Answer:**
Outside a template, or when the condition or the code is not dependent on a template parameter, the discarded branch is fully checked: `void g(int v) { if constexpr (true) {} else { v.size(); } }` does not compile. `static_assert(false, "...")` in a discarded branch was ill-formed before P2593R1 (GCC 11 fires it always); since that C++23 defect report (GCC 13+) it fires only if the branch is instantiated.

**Explanation:**
- "Discarded" only means "not instantiated". A non-template has nothing to instantiate, so everything is compiled normally.
- In a template, non-dependent expressions in the discarded branch are still checked at definition time (two-phase lookup, topic 10).
- Portable pre-GCC-13 idiom: `template <class> constexpr bool always_false = false;` and `static_assert(always_false<T>, "...")`.
- ❌ Common wrong answer: "`if constexpr` never compiles the false branch." It always parses it and, outside templates, fully checks it.
- ✅ What a strong answer adds: compiler version matters here; know which toolchain the team uses before relying on `static_assert(false)`.

**Key takeaway:** `if constexpr` skips instantiation, not compilation; it helps only in templates with dependent conditions.

---

#### Q10: What are concepts, and what do they improve over SFINAE?
**Difficulty:** #beginner
**Category:** #templates #concepts
**Concepts:** #concepts #constraints #diagnostics

**Answer:**
A concept (C++20) is a named compile-time predicate on template arguments, used to constrain templates: `template <std::integral T> T gcd(T, T)`. Compared with SFINAE they are readable, they produce errors at the call site that name the unsatisfied requirement, and constrained overloads are ordered by subsumption, so a more constrained overload beats a less constrained one.

**Explanation:**
- Constraints are checked after deduction, before the function is considered viable.
- No runtime cost: like SFINAE, they only decide which template is used.
- They also work on non-template members of class templates (`void push(T) requires std::copyable<T>;`), which SFINAE cannot do without making the member a template.
- Concepts check syntax (expressions compile, types exist); semantic requirements (e.g. "`<` is a strict weak order") are documented, not checked.
- ❌ Common wrong answer: "Concepts are like interfaces with virtual functions." There is no runtime dispatch or vtable; types satisfy them structurally, without inheriting.
- ✅ What a strong answer adds: the subsumption rule and its source-identity limitation.

**Key takeaway:** Concepts = named, ordered, readable constraints; same zero runtime cost as SFINAE.

---

#### Q11: What is the difference between a requires-clause, a requires-expression, and `requires requires`?
**Difficulty:** #intermediate
**Category:** #templates #concepts
**Concepts:** #requires_clause #requires_expression #syntax

**Answer:**
A requires-clause (`template <class T> requires C<T> void f(T);`) attaches a constraint to a declaration. A requires-expression (`requires (T a) { a + a; }`) is a `bool` constant expression that tests whether the listed requirements are valid. `requires requires (T a) { a + a; }` is a requires-clause whose condition is an ad hoc requires-expression.

**Explanation:**
- A requires-clause takes any constant `bool` expression combined with `&&`/`||` (parenthesize anything more complex than a primary expression).
- A requires-expression can also be used outside constraints, e.g. `if constexpr (requires { v.reserve(10); })`.
- `requires requires` is legal but signals that the predicate deserves a concept name (named concepts also subsume properly).
- ❌ Common wrong answer: "`requires` always introduces a block of requirements." The keyword has two different roles depending on position.
- ✅ What a strong answer adds: named concepts are not just style: ad hoc expressions never subsume each other.

**Key takeaway:** Clause = "this template requires X"; expression = "is X valid?"; `requires requires` = both at once.

---

#### Q12: What kinds of requirements can a requires-expression contain? What is the classic mistake?
**Difficulty:** #intermediate
**Category:** #templates #concepts
**Concepts:** #simple_requirement #compound_requirement #nested_requirement

**Answer:**
Simple (`a.size();`: valid expression), type (`typename T::value_type;`: type exists), compound (`{ a.size() } noexcept -> std::convertible_to<std::size_t>;`: valid, optionally noexcept, result satisfies a concept) and nested (`requires sizeof(T) <= 8;`: value is true). The classic mistake is `requires { sizeof(T) > 4; }`: a simple requirement only checks validity, so it is true for every complete type.

**Explanation:**
- `template <class T> concept Big = requires { sizeof(T) > 4; };` gives `Big<char> == true`.
- Correct: `concept Big = sizeof(T) > 4;` or `requires { requires sizeof(T) > 4; };`.
- Compound requirement return checks use a concept, not a type: `-> std::same_as<int>`, not `-> int`.
- `{ a == b }` alone checks only that `==` exists; add `-> std::convertible_to<bool>` to check the result.
- ❌ Common wrong answer: "Every line in a requires block must evaluate to true." Lines must only be valid, except nested requirements.
- ✅ What a strong answer adds: verifying concepts with `static_assert(MyConcept<GoodType> && !MyConcept<BadType>);` in tests.

**Key takeaway:** Requires-expressions test validity; only a nested `requires` tests truth.

---

#### Q13: What is constraint subsumption, and why can two "obviously ordered" constraints still be ambiguous?
**Difficulty:** #advanced
**Category:** #templates #concepts
**Concepts:** #subsumption #atomic_constraints #normal_form

**Answer:**
Subsumption decides which of two viable constrained templates is more constrained: constraints are normalized into conjunctions/disjunctions of atomic constraints, and P subsumes Q if P implies Q structurally. Atomic constraints are only identical if they come from the same expression in the source (typically the same concept), so `requires is_integral_v<T>` and `requires (is_integral_v<T> && sizeof(T) == 4)` written separately do not subsume: the call is ambiguous.

**Explanation:**
- `concept Int = std::is_integral_v<T>; concept Int4 = Int<T> && sizeof(T) == 4;`: `Int4` subsumes `Int`, so `f(1)` picks the `Int4` overload and `f(short{1})` the `Int` overload.
- The compiler does not reason about meaning (it will not prove that `sizeof(T) == 4` implies anything); it only matches atoms.
- Standard library concepts are built to subsume (`std::totally_ordered` refines `std::equality_comparable`, `random_access_iterator` refines `bidirectional_iterator`).
- An unconstrained template is always less constrained than a constrained one.
- ❌ Common wrong answer: "The compiler picks the logically stricter constraint." Only structurally, through named concepts.
- ✅ What a strong answer adds: build concept hierarchies (`Base`, `Refined = Base<T> && extra`) whenever you overload on them.

**Key takeaway:** Subsumption is structural, by concept identity; ad hoc trait expressions never order.

---

#### Q14: What are abbreviated function templates, and how does `auto` in a parameter interact with concepts?
**Difficulty:** #beginner
**Category:** #templates #concepts
**Concepts:** #abbreviated_templates #constrained_auto #cpp20

**Answer:**
In C++20, a function with an `auto` parameter is a function template: `void log(const auto& x)` equals `template <class T> void log(const T& x)`. Prefixing a concept constrains it: `void send(std::integral auto id)` equals `template <std::integral T> void send(T id)`.

**Explanation:**
- Each `auto` parameter introduces its own template parameter: `void f(auto a, auto b)` has two, so `f(1, 2.0)` deduces `int` and `double` (no conflict, unlike `T, T`).
- Because it is a template, the definition must be visible at the call site (usually in a header).
- Constrained `auto` also works for variables: `std::integral auto n = compute();` fails to compile if `compute` returns `double`.
- Same idea as generic lambdas (C++14), now for ordinary functions.
- ❌ Common wrong answer: "`auto` parameters are dynamically typed like in scripting languages." Each call with a new type instantiates a new function.
- ✅ What a strong answer adds: you cannot name the type directly; use `decltype(x)` or switch to the full template syntax when you need `T`.

**Key takeaway:** `auto` parameter = implicit template parameter; `Concept auto` = constrained template parameter.

---

#### Q15: How do you check "can F be called with these arguments" in C++17 and in C++20?
**Difficulty:** #intermediate
**Category:** #templates #type_traits
**Concepts:** #is_invocable #invocable #invoke_result

**Answer:**
C++17: `std::is_invocable_v<F, Args...>` (and `std::is_invocable_r_v<R, F, Args...>`, `std::invoke_result_t<F, Args...>` for the result type). C++20: the concept `std::invocable<F, Args...>` (or `std::predicate`, `std::regular_invocable`), usable directly as a constraint.

**Explanation:**
```cpp
#include <concepts>
#include <iostream>
#include <string>
#include <type_traits>

template <class F>
    requires std::invocable<F, int>
auto apply_to_42(F f) { return f(42); }

int main() {
    auto twice = [](int x) { return 2 * x; };
    auto upper = [](std::string s) { return s; };
    std::cout << std::is_invocable_v<decltype(twice), int> << ' '
              << std::is_invocable_v<decltype(upper), int> << ' '
              << apply_to_42(twice) << '\n';                    // 1 0 84
    static_assert(std::is_same_v<std::invoke_result_t<decltype(twice), int>, int>);
}
```
- These follow `std::invoke` rules, so member function pointers and member data pointers count as callable.
- Before C++17: `decltype(std::declval<F>()(std::declval<Args>()...))` in a SFINAE context.
- ❌ Common wrong answer: "Use `std::is_function_v<F>`." That is false for lambdas, functors and function pointers.
- ✅ What a strong answer adds: `std::predicate` additionally requires a result convertible to `bool`, the right constraint for filters.

**Key takeaway:** `is_invocable_v` (C++17) or `std::invocable` (C++20), both based on `std::invoke` semantics.

---

#### Q16: What is the difference between std::decay_t and std::remove_cvref_t, and when do you need them?
**Difficulty:** #intermediate
**Category:** #templates #type_traits
**Concepts:** #decay #remove_cvref #forwarding

**Answer:**
Both remove references and top-level cv-qualifiers. `decay_t` additionally converts arrays to pointers and functions to function pointers (what pass-by-value does). `remove_cvref_t` (C++20) only strips; use it when you want the "plain" type of a forwarded argument without changing arrays.

**Explanation:**
- `decay_t<const int&>` and `remove_cvref_t<const int&>` are both `int`.
- `decay_t<int[3]>` is `int*`; `remove_cvref_t<int[3]>` stays `int[3]`.
- Needed in forwarding templates: with `template <class T> void f(T&& x)`, `T` is `int&` for an lvalue, so `std::is_integral_v<T>` is false and `std::is_same_v<T, int>` is false.
- `std::decay_t` is what `std::thread` and `std::bind` use to store copies of arguments (`std::make_pair` uses `std::unwrap_ref_decay_t`: decay plus unwrapping `std::reference_wrapper`).
- ❌ Common wrong answer: "`decay` and `remove_reference` are the same." `remove_reference` keeps `const` and arrays.
- ✅ What a strong answer adds: test traits on `std::remove_cvref_t<T>` in any constraint on a forwarding reference.

**Key takeaway:** `decay_t` = "type after pass by value"; `remove_cvref_t` = "strip const and reference only".
