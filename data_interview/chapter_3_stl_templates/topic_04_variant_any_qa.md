## TOPIC: std::variant, std::visit and std::any

### INTERVIEW_QA: Interview Questions with Detailed Answers

#### Q1: What is `std::variant`, and where does it store the active value?
**Difficulty:** #beginner
**Category:** #stl #vocabulary_types
**Concepts:** #variant #tagged_union #inline_storage

**Answer:**
A type-safe tagged union (C++17): it holds exactly one object whose type is one of a fixed list. The object lives inside the variant itself, in storage big enough for the largest alternative, next to an index recording which alternative is active. The variant never allocates.

**Explanation:**
- `sizeof(variant<int, std::string>)` is 40 on libstdc++ / GCC, x86-64: 32 for the string, plus the index, rounded up to 8-byte alignment.
- The variant runs the right constructor and destructor for the active alternative; a plain `union` leaves that to you.
- Alternatives that allocate internally (a long `std::string`) still do; the variant adds no allocation of its own.
- ❌ Common wrong answer: "It allocates the object on the heap like `any`" or "it is a C union".
- ✅ What a strong answer adds: the standard specifies semantics, not layout; libstdc++ uses a recursive union plus the smallest unsigned index type that fits.

**Key takeaway:** variant = in-place storage for the largest alternative + an index.

---

#### Q2: How do you find out what a variant holds and get the value?
**Difficulty:** #beginner
**Category:** #stl #api
**Concepts:** #index #holds_alternative #get #get_if

**Answer:**
`v.index()` gives the active position; `std::holds_alternative<T>(v)` tests a type; `std::get<T>(v)` / `get<I>(v)` returns a reference and throws `std::bad_variant_access` on a mismatch; `std::get_if<T>(&v)` returns a pointer, or `nullptr` on a mismatch. Most code should use `std::visit` instead.

**Explanation:**
- `get_if` takes a pointer to the variant, not the variant: `if (auto* p = std::get_if<int>(&v))`.
- `get<T>` requires `T` to appear exactly once in the alternatives; with duplicates, use the index form.
- Asking for a type that is not an alternative at all is a compile error.
- ❌ Common wrong answer: "`get` returns nullptr when the type is wrong."
- ✅ What a strong answer adds: `get_if` + `if` is the no-exception style; `visit` is the exhaustive style that survives adding new alternatives.

**Key takeaway:** `get` throws, `get_if` returns nullptr, `visit` handles all.

---

#### Q3: What does a default-constructed variant hold, and what is `std::monostate` for?
**Difficulty:** #beginner
**Category:** #stl #api_design
**Concepts:** #default_construction #monostate

**Answer:**
It holds a value-initialized first alternative (`variant<int, std::string> v;` holds `int` 0). If the first alternative is not default-constructible, the variant is not default-constructible either. `std::monostate` is an empty type you put first to get an explicit "no value yet" state.

**Explanation:**
- `variant<Order, int> v;` fails with "use of deleted function 'std::variant<...>::variant()'" when `Order` has no default constructor.
- `variant<std::monostate, Order, int>`: default state is `monostate`; visitors must handle it, which documents the empty state.
- `std::optional<T>` is effectively `variant<monostate, T>` with a nicer interface.
- ❌ Common wrong answer: "A default variant is empty."
- ✅ What a strong answer adds: monostate is comparable and hashable, so the variant stays usable in maps and sets.

**Key takeaway:** The first alternative is the default; use `monostate` when "nothing" is a real state.

---

#### Q4: Which alternative does `std::variant<bool, std::string> v = "hello";` hold?
**Difficulty:** #intermediate
**Category:** #stl #overload_resolution
**Concepts:** #converting_constructor #p0608 #narrowing

**Answer:**
On current libraries the `std::string` (index 1). Under the original C++17 rules it held `bool` `true`, because pointer-to-bool is a standard conversion and beat the user-defined conversion to string. P0608 (C++20, applied as a DR, GCC 10+) excluded narrowing and pointer-to-bool conversions from the selection.

**Explanation:**
- Selection works like overload resolution over imaginary functions `F(bool)`, `F(std::string)`, with narrowing conversions removed and `bool` accepted only from `bool`.
- Related compile errors: `variant<int, double> v = 1L;` (both narrow) and `variant<std::string, std::string_view> v = "x";` (ambiguous).
- `variant<std::string, const char*> v = "x";` picks `const char*`.
- ❌ Common wrong answer: "Always the string, it is obviously a string."
- ✅ What a strong answer adds: in code that must work across toolchains, construct the intended alternative explicitly: `std::string("hello")` or `std::in_place_type<std::string>`.

**Key takeaway:** Converting construction is overload resolution with narrowing removed; be explicit when it matters.

---

#### Q5: What does `std::visit` do, and what is the "overloaded" idiom?
**Difficulty:** #intermediate
**Category:** #stl #visitor
**Concepts:** #visit #overloaded #exhaustiveness

**Answer:**
`std::visit(f, v)` calls `f` with the active alternative. The visitor must accept every alternative, so missing cases are compile errors. The overloaded idiom builds such a visitor from one lambda per type by inheriting from all lambdas and pulling their call operators into one overload set.

**Explanation:**
```cpp
#include <iostream>
#include <string>
#include <variant>

template <class... Ts> struct overloaded : Ts... { using Ts::operator()...; };
template <class... Ts> overloaded(Ts...) -> overloaded<Ts...>;   // C++17 (and Clang < 17)

int main() {
    std::variant<int, double, std::string> v = std::string("abc");
    auto describe = overloaded{
        [](int i) { return "int " + std::to_string(i); },
        [](double d) { return "double " + std::to_string(d); },
        [](const std::string& s) { return "string " + s; },
    };
    std::cout << std::visit(describe, v) << '\n';
    v = 7;
    std::cout << std::visit(describe, v) << '\n';
}
```
- Output: `string abc` then `int 7`.
- `struct overloaded : Ts...` inherits every lambda type; `using Ts::operator()...;` (C++17 pack expansion in using) makes all call operators visible together.
- The deduction guide is required in C++17; in C++20 aggregate CTAD deduces it (GCC 11+, but only Clang 17+: Clang 14 still needs the guide).
- ❌ Common wrong answer: "Use `switch (v.index())`": compiles even when a new alternative is added and not handled.
- ✅ What a strong answer adds: overload resolution still applies, so a `double` alternative silently goes to an `int` handler if no `double` handler exists; a `static_assert` catch-all template prevents it.

**Key takeaway:** visit + overloaded = a type-checked switch over the alternatives.

---

#### Q6: Is `std::visit` resolved at compile time? How does it compare to a virtual call?
**Difficulty:** #advanced
**Category:** #stl #performance
**Concepts:** #visit #dispatch #virtual_functions

**Answer:**
No. Which alternative is active is a run-time fact, so visit branches on the stored index (through a generated function-pointer table or a switch). What is compile-time is the set of handlers and the check that they are complete. Compared with a virtual call it avoids the vptr load, and handlers can be inlined, but the bigger win is usually memory layout.

**Explanation:**
- Virtual: load vptr from the object, load the function pointer, indirect call; the object is typically on the heap behind a pointer.
- Visit: read the index stored in the variant, jump; the object is in place (no pointer chase, contiguous in a `vector`).
- If the optimizer can prove the index (e.g. right after assignment), the branch disappears entirely.
- A variant with one large alternative makes every element large; heterogeneous sizes favour pointers.
- ❌ Common wrong answer: "visit has zero cost because it is static polymorphism."
- ✅ What a strong answer adds: measure; for a hot loop over a `vector<variant<...>>` the cache behaviour typically matters more than the dispatch instruction.

**Key takeaway:** visit = run-time branch on an index without a vptr; benefits come mostly from in-place storage.

---

#### Q7: When would you choose `std::variant` over an inheritance hierarchy, and vice versa?
**Difficulty:** #intermediate
**Category:** #design #polymorphism
**Concepts:** #closed_set #open_set #expression_problem

**Answer:**
Variant for a closed set of types known in one place (protocol messages, states, AST nodes in one module), especially when you keep adding operations. Inheritance for an open set that other modules extend (plugins, strategies), especially when you keep adding types.

**Explanation:**
- New operation: variant needs one new visitor; inheritance needs a new virtual in every class.
- New type: variant needs every visitor updated (the compiler lists them); inheritance needs one new class.
- Variant values are copyable, in place, no heap; polymorphic objects usually need `unique_ptr` and cannot be copied without a `clone()`.
- Variant is not extensible across library boundaries: users of a library cannot add an alternative.
- ❌ Common wrong answer: "variant is always better because it is faster."
- ✅ What a strong answer adds: this is the "expression problem"; the choice depends on which axis changes more.

**Key takeaway:** Fixed types, growing operations: variant. Growing types, fixed operations: virtual.

---

#### Q8: What does `valueless_by_exception` mean? How do you avoid it?
**Difficulty:** #advanced
**Category:** #stl #exception_safety
**Concepts:** #valueless_by_exception #variant_npos #nothrow_move

**Answer:**
A variant becomes valueless when switching to a different alternative throws after the old object has been destroyed: it then holds no object, `index()` returns `variant_npos`, and `get`/`visit` throw `bad_variant_access`. Avoid it by making alternatives nothrow-move-constructible, so the implementation can build the new value in a temporary first.

**Explanation:**
- Typical trigger: `v = x` or `v.emplace<T>(...)` where `T`'s constructor (or copy) throws.
- For converting assignment the standard requires: if direct construction cannot throw, or `T` has no nothrow move, construct in place; otherwise build a temporary `T` and move it in, which protects the old value if the temporary's construction throws.
- `emplace` always destroys first, so a throwing `emplace` can make the variant valueless.
- Recover by assigning a new value.
- ❌ Common wrong answer: "A variant always holds one of its types."
- ✅ What a strong answer adds: `std::monostate` is the intended empty state; valueless is an error state, and code like `names[v.index()]` must not run on it.

**Key takeaway:** Valueless = old destroyed, new failed; nothrow moves make it rare.

---

#### Q9: You hold `int& r = std::get<int>(v);`. When does `r` stop being valid?
**Difficulty:** #intermediate
**Category:** #stl #lifetime
**Concepts:** #dangling_reference #variant_assignment

**Answer:**
As soon as the variant switches to another alternative (assignment of a different type, `emplace` of any type, or the variant is destroyed). Assigning another `int` keeps `r` valid, because it is the same object being assigned.

**Explanation:**
- Switching alternative destroys the `int` and constructs, say, a `std::string` in the same bytes; `r` now aliases part of a string object. Reading is UB; writing corrupts the string.
- `emplace<int>(5)` also destroys and reconstructs, so even "same type" via emplace invalidates `r`.
- Pointers from `get_if` follow the same rule.
- ❌ Common wrong answer: "The storage is still there, so the reference is fine."
- ✅ What a strong answer adds: in multithreaded code the same pattern is also a data race; share snapshots (copies) of the variant or guard it with a mutex (Concurrency chapter).

**Key takeaway:** A reference into a variant lives only as long as that alternative stays active.

---

#### Q10: Why does `std::visit([](auto& x) { return x; }, v)` fail for `variant<int, std::string>`?
**Difficulty:** #intermediate
**Category:** #stl #templates
**Concepts:** #visit_return_type #visit_r

**Answer:**
`visit` must have one return type, but the generic lambda returns `int` for one alternative and `std::string` for the other. libstdc++: "std::visit requires the visitor to have the same return type for all alternatives of a variant".

**Explanation:**
- Fix 1: give the lambda an explicit return type that every alternative converts to.
- Fix 2: C++20 `std::visit<R>(f, v)` converts each call's result to `R` (e.g. `std::visit<std::string>(...)` with handlers that return different string-like types).
- Fix 3: return a variant yourself if the results really have different types.
- ❌ Common wrong answer: "visit returns a variant of the results."
- ✅ What a strong answer adds: the same rule applies to multi-variant visit across all N x M combinations.

**Key takeaway:** All visitor calls must agree on the return type (or use `visit<R>`).

---

#### Q11: How does `std::visit` work with two variants? Give a use case.
**Difficulty:** #intermediate
**Category:** #stl #design
**Concepts:** #double_dispatch #state_machine #visit

**Answer:**
`std::visit(f, a, b)` calls `f(active_a, active_b)`; the visitor must handle every combination of alternatives. It implements double dispatch, e.g. a state machine where `f(State, Event)` returns the next state.

**Explanation:**
- With 3 states and 3 events there are 9 combinations; generic `auto` parameters can cover the "ignore" cases.
- Implementations generate a multi-dimensional dispatch table: N x M entries.
- Collision handling (shape x shape), message handling per connection state, and rule tables are common uses.
- ❌ Common wrong answer: "You need nested visits." Nested visits work but are verbose; visit takes any number of variants.
- ✅ What a strong answer adds: a catch-all `auto` handler hides combinations you forgot; list explicitly the transitions that matter.

**Key takeaway:** Multi-variant visit = compile-checked double dispatch.

---

#### Q12: What is `std::any`, and how is it different from `std::variant` and `void*`?
**Difficulty:** #beginner
**Category:** #stl #type_erasure
**Concepts:** #any #type_erasure #any_cast

**Answer:**
`std::any` holds one object of any copy-constructible type, decided at run time; you get it back only with `std::any_cast` and the exact type. Unlike variant, the set of types is open and nothing is checked at compile time. Unlike `void*`, it owns, copies and destroys the object and checks the type on access.

**Explanation:**
- `any_cast<T>(a)` returns a copy (throws `bad_any_cast`), `any_cast<T&>(a)` a reference, `any_cast<T>(&a)` a pointer or `nullptr`.
- `a.type()` returns the `std::type_info` of the held type.
- Copying an `any` deep-copies the contents.
- ❌ Common wrong answer: "any is a variant of all types."
- ✅ What a strong answer adds: use it at boundaries (user data passed through a library, property bags); inside application logic prefer variant or virtual interfaces.

**Key takeaway:** any = owned, copyable, run-time checked type erasure for an open set.

---

#### Q13: `std::any a = "hello";` Why does `std::any_cast<std::string>(a)` throw?
**Difficulty:** #intermediate
**Category:** #stl #type_erasure
**Concepts:** #any_cast #decay #bad_any_cast

**Answer:**
Because `any` stores the decayed type of its argument: the array `const char[6]` decays to `const char*`. `any_cast` requires that exact type, with no conversions, so asking for `std::string` throws `std::bad_any_cast`.

**Explanation:**
```cpp
#include <any>
#include <iostream>
#include <string>

int main() {
    std::any a = "hello";
    std::cout << (a.type() == typeid(const char*)) << '\n';
    try {
        std::any_cast<std::string>(a);
    } catch (const std::bad_any_cast& e) {
        std::cout << e.what() << '\n';
    }
    std::cout << std::any_cast<const char*>(a) << '\n';
}
```
- Output: `1`, `bad any_cast`, `hello`.
- Same rule for numbers: `any(42)` holds `int`, `any_cast<long>` throws; for classes, `any_cast<Base&>` on a stored `Derived` throws.
- Store what you will read back: `std::any a = std::string("hello");`.
- ❌ Common wrong answer: "any_cast converts like `static_cast`."
- ✅ What a strong answer adds: comparing `type_info` per access is the run-time cost variant avoids.

**Key takeaway:** any_cast matches the exact decayed type.

---

#### Q14: Does `std::any` allocate? Is there a small-object optimization?
**Difficulty:** #advanced
**Category:** #stl #performance
**Concepts:** #small_buffer_optimization #any #allocation

**Answer:**
It may. The standard encourages (but does not require) storing small, nothrow-movable objects inline. libstdc++ stores a type inline only if it fits in one pointer (8 bytes on x86-64), is suitably aligned and is nothrow-move-constructible; everything else is heap-allocated. So `any(42)` does not allocate, but `any(std::string("x"))` allocates once on GCC.

**Explanation:**
- Measured with a counting `operator new` (libstdc++ / GCC, x86-64): `any(int)` 0, `any(double)` 0, `any(std::string("x"))` 1, `any(std::array<char,16>)` 1.
- libc++ and MSVC use bigger inline buffers (several pointers), so the same code allocates differently per platform.
- The nothrow-move requirement exists so that moving an `any` can be `noexcept`.
- ❌ Common wrong answer: "Small strings are stored inline thanks to SBO." The string object itself is 32 bytes, larger than libstdc++'s buffer.
- ✅ What a strong answer adds: if allocation matters, use a variant (closed set) or a custom type-erased wrapper with a buffer size you choose.

**Key takeaway:** any's small-buffer rules are implementation-specific; on libstdc++ only pointer-sized types avoid the heap.

---

#### Q15: Why can't `std::any` hold a `std::unique_ptr`?
**Difficulty:** #intermediate
**Category:** #stl #type_erasure
**Concepts:** #copy_constructible #move_only #any

**Answer:**
`std::any` is copyable, and copying it must copy the contained object, so the contained type must be copy-constructible. `unique_ptr` is move-only; GCC rejects `std::any a = std::make_unique<int>(1);` ("conversion from 'std::unique_ptr<int>' to non-scalar type 'std::any' requested").

**Explanation:**
- The constructor template is constrained on `is_copy_constructible_v<decay_t<T>>`, so it simply drops out of overload resolution.
- Workarounds: `std::shared_ptr` (copyable), or a move-only type-erased wrapper (C++23 `std::move_only_function` follows the same idea for callables).
- ❌ Common wrong answer: "Use `std::move` when constructing the any." The issue is the type, not the value category.
- ✅ What a strong answer adds: `std::function` has the same copyability requirement for its target; `std::move_only_function` (C++23) lifts it.

**Key takeaway:** any is copyable, so its contents must be copyable.

---

#### Q16: `std::variant<int, int>` is legal. Why, and how do you use it?
**Difficulty:** #advanced
**Category:** #stl #api
**Concepts:** #duplicate_alternatives #in_place_index

**Answer:**
Alternatives are identified by position, so two `int` alternatives are two different states that happen to share a type. Type-based access (`get<int>`, `holds_alternative<int>`, `v = 5`) does not compile; you must use indices: `get<0>`, `emplace<1>`, `std::in_place_index<1>`.

**Explanation:**
- libstdc++ error for `get<int>`: "static assertion failed: T must occur exactly once in alternatives".
- `v = 5` fails ("no match for 'operator='"): the converting assignment is ambiguous.
- Useful when the meaning differs (e.g. a timeout in ms vs a retry count), but distinct wrapper types (`struct TimeoutMs { int v; };`) make the code self-documenting and keep type-based access.
- ❌ Common wrong answer: "Duplicate types are a compile error."
- ✅ What a strong answer adds: generic code that builds variants from type lists (e.g. `variant<Ts...>` with repeated `Ts`) must use index-based access.

**Key takeaway:** Duplicates are allowed; access them by index, or wrap them in distinct types.

---

#### Q17: How would you implement a minimal variant? What are the hard parts?
**Difficulty:** #advanced
**Category:** #stl #implementation
**Concepts:** #union #index #dispatch_table

**Answer:**
Storage: a union (or aligned buffer) of all alternatives plus an index. Construction places the chosen type and sets the index. Destruction, copy and visit dispatch on the index, typically through a table of function pointers generated from the type list. The hard parts are the exception guarantees on assignment, conditional triviality, constexpr support and the converting constructor's overload rules.

**Explanation:**
- Destroy: `table[index](storage)` where each entry calls the right destructor.
- Visit: same table idea, with one entry per alternative (per combination for several variants).
- Assignment between different alternatives must destroy the old object before constructing the new one in the same storage; that is where valueless comes from.
- Triviality propagation needs specialized base classes (or C++20 conditionally trivial special members with `requires`).
- ❌ Common wrong answer: "Store a `void*` and a `type_info`." That is `any`, with heap allocation.
- ✅ What a strong answer adds: `get<T>` maps a type to an index at compile time (find `T` in the pack), so a mismatch costs one integer comparison at run time.

**Key takeaway:** variant = union + index + compile-time generated per-alternative operations.

---
