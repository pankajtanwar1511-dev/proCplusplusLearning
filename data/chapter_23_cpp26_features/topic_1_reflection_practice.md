## TOPIC: C++26 Static Reflection - Compile-Time Introspection and Code Generation

### PRACTICE_TASKS: Reflection Design Gotchas and Code Analysis

#### Q1
```cpp
// Conceptual P2996-style code (illustrative working-draft syntax)
void handle_request(int field_index_from_network) {
    // Attempt to reflect "whichever member the caller asked for at runtime"
    std::meta::info r = ^^get_member_by_index(field_index_from_network);
    // ... use [:r:] somehow ...
}
```

**Answer:**
```
Compile error: reflection cannot depend on a runtime value
```

**Explanation:**
- `^^` reflects a *name*, resolved like any other name lookup, entirely at compile time
- `field_index_from_network` is only known when the program runs
- There is no such thing as "reflect whatever this runtime integer points to"
- **Key Concept:** Reflection is a compile-time-only mechanism; the *set* of reflectable members is fixed at compile time, and a runtime value can only *select among* compile-time-known reflections (e.g. via a generated dispatch table), never reflect something itself.

**Fixed Version:**
```cpp
// Build a compile-time table of all members, then index it at runtime
template <typename T>
void handle_request(T& obj, int field_index_from_network) {
    template for (constexpr std::meta::info m : std::meta::nonstatic_data_members_of(^^T)) {
        // generate one runtime-reachable case per compile-time-known member
        // (e.g. via a generated switch/jump table keyed on member index)
    }
}
```

---

#### Q2
```cpp
constexpr std::meta::info r_member = ^^Point3D::x;

using AliasForX = [:r_member:];   // trying to use a member reflection as a type
```

**Answer:**
```
Compile error: r_member does not reflect a type
```

**Explanation:**
- `std::meta::info` is a single, uniform value type — but WHAT it reflects (a type vs. a data member vs. a namespace) still matters at the splice site
- `^^Point3D::x` reflects a *data member*, not a *type*
- Splicing it into a type position (`using ... = [:r:];`) is a category error, caught at the splice, not at the point the reflection was created
- **Key Concept:** Splicing is grammar-position-sensitive; a `std::meta::info` value must reflect the right *kind* of entity for the position it's spliced into (type position, expression position, member-access position, etc.).

**Fixed Version:**
```cpp
constexpr std::meta::info r_type   = ^^double;        // reflects a TYPE
constexpr std::meta::info r_member = ^^Point3D::x;    // reflects a MEMBER

using AliasForDouble = [:r_type:];   // OK: type position, r_type reflects a type

Point3D p{1.0, 2.0, 3.0};
auto v = p.[:r_member:];             // OK: member-access position, r_member reflects a member
```

---

#### Q3
```cpp
// Assume: a reflection-driven "auto-add a debug member" utility that tries to
// inject a new data member named `x` into a struct that already has one.
consteval std::meta::info inject_debug_member() {
    return std::meta::define_class(^^struct, /* spec for a member named "x" */);
}

struct Point3D { double x, y, z; };
// Applying inject_debug_member()'s output to Point3D...
```

**Answer:**
```
Compile error: redefinition of member 'x' (ordinary ODR/redeclaration error)
```

**Explanation:**
- Reflection and `define_class` do not create an exception to C++'s normal rules
- A synthesized member that collides with an existing one fails exactly as if you had typed it by hand
- The error is discovered via a different *path* (a `consteval` function generating a declaration) but is an entirely ordinary compiler diagnostic
- **Key Concept:** Reflection-generated code is still ordinary C++ — it must satisfy the One Definition Rule, access control, and every other well-formedness rule; reflection is a way of *authoring* declarations, not a way around what makes them legal.

**Fixed Version:**
```cpp
// A correct injector checks existing members before adding new ones
consteval std::meta::info inject_debug_member_safe(std::meta::info target) {
    // (conceptually) skip or rename the injected member if a name collision
    // would occur, instead of blindly injecting "x"
    // ...
}
```

---

#### Q4
```cpp
template <typename T>
consteval std::size_t member_count() {
    std::size_t n = 0;
    template for (constexpr std::meta::info m : std::meta::nonstatic_data_members_of(^^T)) {
        ++n;
    }
    return n;
}

struct HugeStruct { /* 200 data members */ };
struct AnotherHugeStruct { /* 200 data members, different types */ };
// member_count<HugeStruct>() and member_count<AnotherHugeStruct>() are both
// instantiated across a codebase with hundreds of such structs.
```

**Answer:**
```
No compile ERROR — but a real compile-TIME cost
```

**Explanation:**
- Nothing here is incorrect; `member_count` works exactly as intended for both structs
- But `template for` iteration over `nonstatic_data_members_of` is compile-time work, instantiated separately for every distinct `T`
- Applied across hundreds of large structs, this adds up in the same general cost family as heavy template metaprogramming
- **Key Concept:** Reflection metafunctions are `consteval` functions and `template for` is compile-time iteration — pervasive reflection-based codegen trades hand-written boilerplate for increased build time, the same trade-off templates have always made.

---

#### Q5
```cpp
// Team assumes: "we can ship our new reflection-based serializer as a drop-in
// replacement, no fallback needed."
template <typename T>
std::string to_json(const T& obj) {
    // ... uses ^^, [: :], template for ...
}
```

**Answer:**
```
Will fail to compile on any pre-C++26 toolchain, or a C++26-mode compiler
without this specific proposal implemented
```

**Explanation:**
- `^^`, `[: :]`, and `<meta>` are brand-new grammar and library surface as of C++26
- Code using them simply does not compile anywhere that support hasn't landed yet
- This is a real, current adoption consideration for any library wanting broad compatibility
- **Key Concept:** Reflection-based APIs cannot be offered as an unconditional drop-in without either duplicating a non-reflection implementation or gating the reflection path behind a feature-test macro once one is standardized.

**Fixed Version:**
```cpp
#ifdef __cpp_impl_reflection   // illustrative; exact macro name not yet finalized
template <typename T>
std::string to_json(const T& obj) { /* reflection-based implementation */ }
#else
template <typename T>
std::string to_json(const T& obj) { /* hand-written fallback per type, or macro-based */ }
#endif
```

---

#### Q6
```cpp
class Account {
    double balance_;   // private
public:
    Account(double b) : balance_(b) {}
};

// A generic debug-printer built on nonstatic_data_members_of(^^Account)
// tries to print `balance_` from outside the class.
```

**Answer:**
```
Uncertain / still-settling area of the proposal — do not assume unconditional access
```

**Explanation:**
- Whether reflection queries can see **private** members, and whether splicing a private member's reflection from outside the class is allowed, has been a genuinely debated design point across P2996's revisions
- Some revisions lean toward requiring some form of friend-like access for private-member reflection outside the class; this is not a settled guarantee
- **Key Concept:** Reflection intersects with C++'s access-control guarantees, one of its oldest invariants — treat private-member reflection behavior as illustrative of design *direction*, not final behavior, until the published C++26 standard confirms it.

---

#### Q7
```cpp
template <typename E>
    requires std::is_enum_v<E>
constexpr std::string_view enum_to_string(E value) {
    std::string_view result = "<unknown>";
    template for (constexpr std::meta::info e : std::meta::enumerators_of(^^E)) {
        if (value == [:e:]) {
            result = std::meta::identifier_of(e);
        }
    }
    return result;
}

enum class Suit { Clubs, Diamonds, Hearts, Spades };
enum class HttpStatus { Ok = 200, NotFound = 404 };

// Both enum_to_string(Suit::Hearts) and enum_to_string(HttpStatus::NotFound)
// are called in the same program. No new overload was written for HttpStatus.
```

**Answer:**
```
No bug — this is exactly the intended benefit of reflection-based genericity
```

**Explanation:**
- The *same* `enum_to_string` template works for both an ordinal enum (`Suit`) and a numerically-valued enum (`HttpStatus`)
- `enumerators_of(^^E)` produces the right enumerator set for whichever `E` is instantiated, no per-enum code required
- Adding a new enumerator to either enum requires zero changes to `enum_to_string`
- **Key Concept:** This is the flagship reflection use case — a function written once, generically, replaces what used to require a hand-written (and easily-outdated) `switch` per enum type.

---

#### Q8
```cpp
template <typename T>
consteval std::size_t member_count() {
    std::size_t n = 0;
    for (std::meta::info m : std::meta::nonstatic_data_members_of(^^T)) {
        // note: plain range-based for, not `template for`
        ++n;
    }
    return n;
}
```

**Answer:**
```
Likely compile error or ill-formed use — `nonstatic_data_members_of` yields a
compile-time range meant to be walked with `template for`, not an ordinary
runtime range-based for
```

**Explanation:**
- A regular `for` loop over a range typically implies runtime iteration semantics
- The proposal's compile-time member ranges are intended to be consumed with `template for`, which expands each iteration at compile time with the loop variable as a compile-time constant
- Mixing up the two loop forms is an easy mistake when first learning the reflection library, since ordinary ranges and compile-time reflection ranges look superficially similar
- **Key Concept:** Iterating a `std::meta::info` range from `nonstatic_data_members_of`/`enumerators_of` requires the `template for` expansion-statement form, not a plain runtime range-based for loop.

**Fixed Version:**
```cpp
template <typename T>
consteval std::size_t member_count() {
    std::size_t n = 0;
    template for (constexpr std::meta::info m : std::meta::nonstatic_data_members_of(^^T)) {
        ++n;
    }
    return n;
}
```

---

#### Q9
```cpp
struct Point3D { double x, y, z; };

template <typename T>
std::string to_json(const T& obj) {
    std::string result = "{";
    bool first = true;
    template for (constexpr std::meta::info member :
                  std::meta::nonstatic_data_members_of(^^T)) {
        if (!first) result += ",";
        first = false;
        result += std::format("\"{}\":{}", std::meta::identifier_of(member), obj.[:member:]);
    }
    return result + "}";
}

// Called as: to_json(Point3D{1.0, 2.0, 3.0})
```

**Answer:**
```
No bug — produces {"x":1,"y":2,"z":3}
```

**Explanation:**
- `nonstatic_data_members_of(^^T)` yields each of `x`, `y`, `z` as a compile-time reflection
- `identifier_of(member)` gives the field's name as a string; `obj.[:member:]` splices a genuine member access for that field
- The function never mentions `x`, `y`, or `z` by name — it discovers the struct's shape entirely through reflection
- **Key Concept:** This is the generic-serializer pattern — one function, written once, correctly serializes any aggregate whose members are formattable, with the member list read directly from the type rather than duplicated by hand.

---

#### Q10
```cpp
// A generic structural-equality helper, called on two DIFFERENT struct types
template <typename T>
constexpr bool structural_equals(const T& a, const T& b) {
    bool equal = true;
    template for (constexpr std::meta::info member :
                  std::meta::nonstatic_data_members_of(^^T)) {
        if (a.[:member:] != b.[:member:]) equal = false;
    }
    return equal;
}

struct Point2D { double x, y; };
struct Point3D { double x, y, z; };

Point2D p{1, 2};
Point3D q{1, 2, 3};
// structural_equals(p, q);   // attempted call
```

**Answer:**
```
Compile error: no viable call to structural_equals(Point2D, Point3D) — T
must be a single type, deduced consistently for both parameters
```

**Explanation:**
- `structural_equals` takes `const T& a, const T& b` with a single template parameter `T`
- Template argument deduction requires both arguments to deduce the *same* `T`
- `Point2D` and `Point3D` are unrelated, differently-shaped types, so deduction fails before reflection is ever involved
- **Key Concept:** Reflection lets you write one generic function per *shape-agnostic* operation on a single type `T`, but it does not make two genuinely different types comparable to each other — `structural_equals` compares two instances of the *same* reflectable type, not two different ones.

