## TOPIC: C++26 Static Reflection - Compile-Time Introspection and Code Generation

### THEORY_SECTION: Reflecting on Your Own Program at Compile Time

C++26 is expected to adopt **static reflection**, standardized through proposal **P2996 ("Reflection for C++26")** by Barry Revzin, Wyatt Childers, Peter Dimov, Andrew Sutton, Faisal Vali, and Daveed Vandevoorde. This is one of the most significant additions to the language since concepts — it gives C++ a portable, first-class way to *ask questions about its own program structure* at compile time, and to *turn those answers back into real code*. As with any feature still moving through WG21 (the C++ standards committee), some surface syntax and exact library entity names in this section reflect the P2996 proposal text as most recently published; a few names could still be adjusted by the time the feature is formally published as part of the C++26 International Standard.

---

#### 1. The Problem: C++ Could Not Look At Itself

Every mainstream language with strong metaprogramming support — Java, C#, Python, Rust (via macros) — gives you *some* way to ask a type "what members do you have?" at either compile time or runtime. Pre-C++26, standard C++ had **no** such mechanism. If you wanted to know the names of a struct's data members, or generate a function for every enumerator of an enum, you were on your own.

**A concrete pain point — converting an enum to a string:**

```cpp
// Pre-C++26: hand-written, and it MUST be kept in sync manually
enum class Color { Red, Green, Blue, Yellow, Purple };

std::string to_string(Color c) {
    switch (c) {
        case Color::Red:    return "Red";
        case Color::Green:  return "Green";
        case Color::Blue:   return "Blue";
        case Color::Yellow: return "Yellow";
        case Color::Purple: return "Purple";
    }
    return "Unknown";
}
// Add a new enumerator? You must remember to update this function too.
// Miss it, and -Wswitch might warn you... or might not, if there's a default case.
```

**A concrete pain point — serializing a struct to JSON:**

```cpp
struct Point3D { double x, y, z; };

// Pre-C++26: you write this by hand for EVERY struct in your codebase
std::string to_json(const Point3D& p) {
    return "{\"x\":" + std::to_string(p.x) +
           ",\"y\":" + std::to_string(p.y) +
           ",\"z\":" + std::to_string(p.z) + "}";
}
```

**What people actually did about this, before C++26:**

| Workaround | How it worked | Downside |
|---|---|---|
| **External code generators** | A separate tool (e.g. a Python script, protobuf's `protoc`) parses a schema and emits C++ | Extra build step, extra language, schema duplicated outside C++ |
| **X-Macros** | `#define POINT_FIELDS(X) X(x) X(y) X(z)` expanded repeatedly | Works, but unreadable, fragile, breaks IDE tooling |
| **Boost.PFR-style "aggregate hacks"** | Exploit structured bindings / aggregate initialization limits to count and bind members | Clever but limited: no member *names*, no access to member attributes, aggregates only |
| **Macro-heavy libraries** (e.g. Boost.Describe, Boost.Hana) | Require you to explicitly *redeclare* every member's name as a macro argument | Boilerplate duplicated by hand, must stay in sync with the real declaration |

Every one of these is a workaround for a **missing language feature**. Reflection makes it a first-class capability of the compiler itself.

---

#### 2. The Reflection Operator: `^^` and `std::meta::info`

P2996 introduces a prefix reflection operator — written as `^^` in the current proposal text — that takes the name of *almost anything* in your program (a type, a variable, a namespace, a class member, a function, a template, an enumerator) and produces a single, uniform, opaque compile-time value of type `std::meta::info`.

```cpp
#include <meta>       // proposed header for the reflection library
#include <string>

struct Point3D { double x, y, z; };

constexpr std::meta::info r1 = ^^int;          // reflection of a type
constexpr std::meta::info r2 = ^^Point3D;      // reflection of a class
constexpr std::meta::info r3 = ^^Point3D::x;   // reflection of a data member
constexpr std::meta::info r4 = ^^std;          // reflection of a namespace
```

**The key design idea:** instead of inventing a different C++ type for "reflected type," "reflected member," "reflected namespace," etc., the proposal uses **one uniform value type**, `std::meta::info`. Every kind of program entity — types, templates, namespaces, functions, variables, enumerators, class members — reflects down to the *same* `std::meta::info` value type. This is what lets you write generic `consteval` functions that operate on reflections without an explosion of overloads: a single function taking `std::meta::info` can be handed a reflection of *anything*, and it can then ask "what kind of entity is this, and what do I know about it?"

| Entity you can reflect | Example |
|---|---|
| A type | `^^int`, `^^std::vector<int>`, `^^Point3D` |
| A namespace | `^^std` |
| A class member (data or function) | `^^Point3D::x` |
| A variable | `^^my_global` |
| A function or function template | `^^my_function` |
| An enumerator | `^^Color::Red` |
| A template (uninstantiated) | `^^std::vector` |

---

#### 3. Splicing: Turning Data Back Into Code

Producing a `std::meta::info` value is only half the story — it is *inert data* describing a program entity, not the entity itself. To turn that data back into a real type, expression, or template argument that the compiler treats as ordinary C++, you **splice** it using the `[: ... :]` syntax.

```cpp
constexpr std::meta::info r = ^^int;

[:r:] x = 42;          // splices to: int x = 42;
using T = [:r:];       // splices to: using T = int;
```

**The reflection round-trip** is the core mental model of the whole feature:

```
 reflect (^^)              inspect / transform                splice ([: :])
entity ───────────► std::meta::info ───────────────► (new) std::meta::info ───────────────► real code
              "turn code into data"      "manipulate as compile-time data"     "turn data back into code"
```

This round-trip typically happens inside a `consteval` function: you take reflections in, you compute — loop over them, filter them, build new ones — using ordinary (compile-time) C++ control flow, and you splice the results back out, often through a `template for` / expansion-statement construct proposed alongside reflection for iterating compile-time ranges of `std::meta::info`.

```cpp
// Conceptual sketch of iterating reflections at compile time
template <typename T>
consteval auto count_members() {
    std::size_t n = 0;
    for (std::meta::info member : std::meta::nonstatic_data_members_of(^^T)) {
        ++n;
    }
    return n;
}

static_assert(count_members<Point3D>() == 3);
```

---

#### 4. Querying Reflections: The `std::meta` Metafunction Library

Alongside the `^^` operator and splicing syntax, P2996 defines a library of `consteval` **metafunctions** in namespace `std::meta` that let you *ask questions* about a `std::meta::info` value. These are ordinary `consteval` functions — no new core-language query syntax is needed beyond what's shown below — which is part of the elegance of the design: reflection queries are just a library, callable, composable, and testable like any other function.

The exact final names may still shift slightly before ISO publication, but the *kinds* of queries the library exposes are stable in intent:

| Conceptual query | What it tells you |
|---|---|
| `std::meta::identifier_of(r)` | The member/entity's name, as a string |
| `std::meta::type_of(r)` | The type of a reflected variable/member, as another reflection |
| `std::meta::is_public(r)` / `is_static(r)` / `is_function(r)` | Access and kind predicates |
| `std::meta::nonstatic_data_members_of(^^T)` | A compile-time range of reflections, one per non-static data member of class `T` |
| `std::meta::enumerators_of(^^E)` | A compile-time range of reflections, one per enumerator of enum `E` |
| `std::meta::members_of(r)` | All members (of any kind) of a reflected class or namespace |
| `std::meta::template_of(r)` / `substitute(...)` | Working with, and instantiating, reflected templates |

```cpp
// Conceptual: printing every member name of a struct, entirely at compile time
template <typename T>
consteval void print_member_names() {
    template for (constexpr std::meta::info member :
                  std::meta::nonstatic_data_members_of(^^T)) {
        std::cout << std::meta::identifier_of(member) << '\n';
    }
}
```

---

#### 5. Worked Example: A Generic `enum_to_string`

This is the flagship "hello world" of reflection — because every enum's structure differs, this was previously impossible to write *once* for all enums; you needed a switch statement (or a macro that fakes one) per enum type.

```cpp
#include <meta>
#include <string_view>

// Works for ANY enum type, automatically, with zero per-enum boilerplate.
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

enum class Color { Red, Green, Blue, Yellow, Purple };

int main() {
    Color c = Color::Blue;
    std::cout << enum_to_string(c) << '\n';   // → "Blue"
    // Add a new enumerator to Color? enum_to_string needs ZERO changes.
}
```

**Compare to the pre-C++26 hand-written switch:** the reflection version is written **once**, for **every** enum in the program, and it can never drift out of sync with the enum definition — it *is* the enum definition, read directly from the compiler's own knowledge of the type.

---

#### 6. Worked Example: A Generic Struct Serializer

The same technique generalizes to serialization — arguably the single most-requested C++ metaprogramming capability for the last decade (it's why libraries like Boost.Describe, protobuf, and Cap'n Proto exist).

```cpp
#include <meta>
#include <string>
#include <format>

// A single function, written once, that JSON-serializes ANY aggregate struct.
template <typename T>
std::string to_json(const T& obj) {
    std::string result = "{";
    bool first = true;

    template for (constexpr std::meta::info member :
                  std::meta::nonstatic_data_members_of(^^T)) {
        if (!first) result += ",";
        first = false;

        result += std::format("\"{}\":{}",
                               std::meta::identifier_of(member),
                               obj.[:member:]);   // splice a member access
    }

    result += "}";
    return result;
}

struct Point3D { double x, y, z; };
struct Employee { std::string name; int id; double salary; };

int main() {
    Point3D p{1.0, 2.0, 3.0};
    std::cout << to_json(p) << '\n';
    // → {"x":1,"y":2,"z":3}

    Employee e{"Ada", 7, 125000.0};
    std::cout << to_json(e) << '\n';
    // → {"name":"Ada","id":7,"salary":125000}
}
```

No macros. No external schema file. No per-type boilerplate. `to_json` genuinely works for any struct made of reflectable, formattable members — new structs get JSON serialization "for free" the moment they're declared.

---

#### 7. Beyond Introspection: Generating New Code

The most advanced part of P2996 goes beyond *reading* program structure — it lets a `consteval` function *synthesize new types and members* by describing them as data and then materializing them, via facilities the proposal calls things like `define_class`. Conceptually:

```cpp
// Highly simplified conceptual sketch — exact API is still evolving in the proposal.
// The idea: describe a set of member "specs" (name + type) as ordinary compile-time
// data, then ask the compiler to synthesize a genuinely new class from that data.
consteval std::meta::info make_point_type(std::vector<std::meta::info> member_specs) {
    return std::meta::define_class(^^struct, member_specs);
}
```

This "data-driven class generation" is what ultimately unlocks fully declarative serialization frameworks, ORMs, and interface-generation tools *inside* the language — the kind of thing that today requires an external code generator reading a `.proto` file. Because this part of the design is the newest and most likely to see refinement before ISO publication, treat it here as a *capability the proposal is aiming for* rather than a locked-down API.

---

#### 8. Why This Matters

| Benefit | Explanation |
|---|---|
| **Eliminates external tooling** | Serialization frameworks, ORMs, and RPC stub generators (protobuf, Thrift, Cap'n Proto codegen) can move their code-generation step *into* the compiler |
| **Single source of truth** | The struct/enum definition itself is the only place information lives — reflection reads it directly, so it can never drift out of sync |
| **Composability with existing features** | Reflection queries are ordinary `consteval` functions; they compose naturally with **concepts** (constrain what kinds of reflections a function accepts) and **templates** (write one generic algorithm instead of one per type) |
| **Portable and standard** | Unlike compiler-specific extensions (`__builtin_dump_struct`) or third-party libraries, reflection works the same way across every conforming C++26 compiler |
| **Better error messages** | Because reflection is checked like any other compile-time code, misuse produces ordinary compiler diagnostics rather than cryptic macro-expansion errors |

Reflection is designed to be the capstone that ties together a decade of C++ metaprogramming evolution: `constexpr` (C++11/14) gave you compile-time *computation*; concepts (C++20) gave you compile-time *constraints*; reflection (C++26) gives you compile-time *introspection and generation* — the third leg needed for C++ to do, natively, what code generators have bolted on from the outside for 30 years.

---

#### 9. Summary: Capability Comparison

| Capability | Pre-C++26 workaround | C++26 reflection equivalent |
|---|---|---|
| Enum → string | Hand-written `switch`, kept in sync manually | `enum_to_string<E>()` generic over any `E` |
| Struct → JSON/binary serialization | Per-type hand-written function, or macro-based library (Boost.Describe) | Single generic `to_json<T>()` using `nonstatic_data_members_of` |
| Counting/iterating struct members | Boost.PFR aggregate hacks (no names, aggregates only) | `nonstatic_data_members_of(^^T)`, full names and types, any class |
| Generating new types/members from a schema | External code generator (protoc-style), separate build step | `define_class` and related metafunctions, in-language |
| Getting a member's name as a string | Macro that duplicates the member name as a string literal | `std::meta::identifier_of(member)` |

---

#### 10. Compile-Time vs Runtime Breakdown

Reflection's entire value proposition rests on one fact: every reflection-specific construct disappears during compilation. Only ordinary field access survives into the compiled binary. Here is exactly where the line falls:

| Construct | Phase | What actually happens |
|---|---|---|
| `^^T`, `^^Point3D::x` | Compile time | The compiler produces a `std::meta::info` value describing the entity. This value lives only inside the compiler's internal representation — it is never emitted as data in the object file. |
| `std::meta::nonstatic_data_members_of(^^T)` | Compile time | A `consteval` metafunction. The compiler evaluates it while compiling, producing a compile-time range of `std::meta::info` values (conceptually similar to evaluating a `constexpr` array). |
| `std::meta::identifier_of(member)`, `std::meta::type_of(member)` | Compile time | Also `consteval`. Return a compile-time string view / type, resolved and folded away before code generation begins. |
| `template for (constexpr std::meta::info member : ...)` | Compile time | This is **not** a runtime loop. The compiler literally unrolls it, generating one copy of the loop body per element in the reflected range — the same way `if constexpr` discards a branch instead of branching at runtime. |
| `obj.[:member:]` | **Runtime** | The one part of the whole pipeline that survives into the binary. After splicing, `obj.[:member:]` is indistinguishable from hand-typing `obj.x` — a plain, direct memory access at a fixed offset. |

**Worked example — what `template for` actually expands into:**

```cpp
struct Point3D { double x, y, z; };

template <typename T>
void print_fields(const T& obj) {
    template for (constexpr std::meta::info member :
                  std::meta::nonstatic_data_members_of(^^T)) {
        std::cout << std::meta::identifier_of(member) << " = "
                   << obj.[:member:] << '\n';
    }
}
```

For `T = Point3D`, the compiler generates the equivalent of this — three unrolled, concrete statements, with every trace of `^^`, `nonstatic_data_members_of`, `identifier_of`, and `template for` gone:

```cpp
// What the compiler actually emits for print_fields<Point3D>:
void print_fields_Point3D(const Point3D& obj) {
    std::cout << "x" << " = " << obj.x << '\n';
    std::cout << "y" << " = " << obj.y << '\n';
    std::cout << "z" << " = " << obj.z << '\n';
}
```

#### 11. Memory Model

Because everything except the final splice happens at compile time, reflection metadata has **zero footprint in the compiled binary** — no member-name table, no type-descriptor array, nothing that a debugger or `objdump` could find at runtime. This is a sharper guarantee than two things people often compare it to:

- **RTTI (`typeid`)**: the compiler *does* emit real `std::type_info` objects into the binary for polymorphic types, and `dynamic_cast`/`typeid` do real work (vtable lookups, string comparisons) at runtime.
- **Runtime reflection (Java, C#, Python)**: these languages keep live class/field metadata in memory for the entire life of the process, and every reflective field access walks that metadata — a real, per-access cost.

```
SOURCE CODE (what you write)              COMPILED BINARY (what ships)
──────────────────────────────            ───────────────────────────
^^T                                    │
nonstatic_data_members_of(^^T)         │   (nothing — compiled away)
identifier_of(member)                  │
template for (...)                     │
                                        ┼─────────────────────────────
obj.[:member:]  ─────────────────────────▶  obj.x   (plain load, fixed offset)
                                              obj.y   (plain load, fixed offset)
                                              obj.z   (plain load, fixed offset)
```

No metadata survives past compilation — the right-hand side is the *entire* runtime footprint.

**Why this matters for low latency:** a reflection-generated `to_json`, `enum_to_string`, or field-iterator function runs at *exactly* the same speed as if you had hand-written that specific function for that specific type — same instructions, same cache behavior, zero indirection. There is no "reflection tax" paid on every call the way there is with `typeid`-based dispatch or a Java/Python reflective field get. That makes it safe to reach for in hot-path serialization, logging, or wire-protocol code where a runtime-reflection system in another language would be a profiler red flag.

---

### EDGE_CASES: Design Gotchas in a Compile-Time-Only Metaprogramming Model

#### Edge Case 1: Reflection Cannot Depend On Runtime Information

Reflection in P2996 is a **compile-time** mechanism: `^^` and splicing operate on entities the compiler already knows about at compile time (types, declared members, enumerators). Programmers coming from Java/C#/Python reflection — which routinely inspects objects built or chosen *at runtime* — often expect to reflect on "whatever value this variable happens to hold right now." That is not what C++ reflection does.

```cpp
void process(int runtime_choice) {
    // ❌ Conceptually wrong: you cannot reflect "the member the user picked at runtime"
    // std::meta::info r = ^^get_member_by_index(runtime_choice);   // not how this works

    // ✅ What actually works: the SET of members is known at compile time;
    // runtime_choice can select *among* compile-time-known reflections,
    // e.g. via a runtime dispatch built from a compile-time-generated table.
}
```

**Why:** `^^name` reflects the *declaration* `name` refers to, resolved like any other name lookup — at compile time. A `consteval` function can *loop over* a compile-time-known set of members and build runtime dispatch logic (a jump table, a `switch`, a lookup array) from that set, but the reflection step itself never touches a runtime value.

---

#### Edge Case 2: A `std::meta::info` Is Uniform, But What You Splice It As Is Not

Because every reflectable entity — a type, a value, a namespace, a member — collapses to the same `std::meta::info` value type, nothing in the type system stops you from *holding* a reflection of the wrong kind of thing. The error only appears at the point you try to **splice** it into a grammatical position that doesn't match what it reflects.

```cpp
constexpr std::meta::info r_type   = ^^int;         // reflects a TYPE
constexpr std::meta::info r_member = ^^Point3D::x;  // reflects a DATA MEMBER

using T = [:r_type:];        // ✅ OK: spliced in a type position
// using Bad = [:r_member:]; // ❌ Error: r_member doesn't reflect a type

Point3D p{1.0, 2.0, 3.0};
// auto v = p.[:r_type:];    // ❌ Error: r_type doesn't reflect a member
auto v2 = p.[:r_member:];    // ✅ OK: spliced in a member-access position
```

**Why:** splicing is grammar-position-sensitive. The compiler checks, at the splice site, whether the reflected entity is *the kind of thing* that's legal in that position (type, expression, template-argument, member-name, …) — mismatches are compile errors, not silently wrong code, but they can be confusing until you internalize that `std::meta::info` is "one value type wrapping many different *kinds* of program entities."

---

#### Edge Case 3: Generated Code Still Obeys Every Ordinary C++ Rule

Reflection and `define_class` do not grant an escape hatch from the type system. A member synthesized via reflection that would violate the One Definition Rule, access control, or any other normal rule fails to compile exactly as if you had typed the equivalent code by hand — it's simply discovered via a different code path (a `consteval` function generating a declaration) rather than literal source text.

```cpp
// Conceptual: a reflection-driven "add a member to every processed type" utility
// that accidentally tries to add a member name that already exists on T.
// Result: an ordinary "redefinition" error, not a special reflection error.
```

**Why:** reflection is a way of *authoring* declarations at compile time, not a way of bypassing what makes a declaration well-formed. This is a feature, not a limitation — it's what keeps reflection-generated code as safe and checkable as hand-written code.

---

#### Edge Case 4: Compile-Time Cost Scales With Reflection Complexity

Heavy use of `template for` loops over `nonstatic_data_members_of`, nested reflection queries, and `define_class`-based type synthesis all execute during compilation, in the same general cost family as heavy template metaprogramming. A generic serializer applied across hundreds of large structs, or reflection-based code generation used pervasively across a large codebase, can noticeably lengthen build times.

```cpp
// Applying a generic reflection-based to_json<T>() across a codebase with
// hundreds of large structs compiles each instantiation separately —
// analogous to how heavily-templated code multiplies compile work per
// instantiation, just driven by member-iteration instead of type deduction.
```

**Why:** reflection metafunctions are `consteval` functions, and `template for` expansion is still, fundamentally, compile-time iteration and instantiation — it inherits the same "more compile-time work in exchange for less hand-written code" trade-off that has always existed with templates, just with a much nicer authoring experience.

---

#### Edge Case 5: Reflection-Using Code Requires a Conforming C++26 Toolchain

Because `^^`, `[: :]`, and `<meta>` are brand-new grammar and library surface, any code using them simply will not compile with a pre-C++26 compiler, or with a C++26-mode compiler that hasn't yet implemented this specific proposal. For library authors, this is a real, current adoption consideration: reflection-based APIs cannot be offered as a drop-in replacement without either duplicating a non-reflection implementation or gating the reflection-based path behind a feature-test macro once one is standardized.

```cpp
#ifdef __cpp_impl_reflection   // illustrative; exact macro name is not yet finalized
    // reflection-based implementation
#else
    // fallback hand-written implementation
#endif
```

**Why:** this is simply the reality of adopting any brand-new standard feature — worth calling out explicitly here because reflection's benefits are so large that teams may be tempted to assume broader toolchain support than currently exists.

---

#### Edge Case 6: Access Control and Reflection Are Still Being Worked Out

Whether (and how) a reflection query can see **private** members — and whether *splicing* a private member's reflection from outside the class should be allowed the way friend access would be — has been a genuinely debated design point across P2996's revisions. Treat any specific behavior shown for private-member reflection as illustrative of the *design direction*, not a guarantee of final behavior; check the published C++26 standard (or your compiler's release notes) once reflection ships.

```cpp
class Account {
    double balance_;   // private
public:
    Account(double b) : balance_(b) {}
};

// Whether generic reflection-based tooling (e.g. a debug-printer) can see
// `balance_` from outside Account, and under what conditions, is a
// still-settling area of the proposal as of this writing.
```

**Why:** reflection intersects with one of C++'s oldest guarantees — that access control is enforced by the compiler, not by convention — so the committee has been deliberately careful here, and the final rule may still shift.

---

### CODE_EXAMPLES: Reflection in Practice

#### Example 1: Generic `enum_to_string` Across Two Unrelated Enums

```cpp
#include <meta>
#include <string_view>
#include <iostream>

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

enum class Color { Red, Green, Blue };
enum class HttpStatus { Ok = 200, NotFound = 404, ServerError = 500 };

int main() {
    std::cout << enum_to_string(Color::Green) << '\n';         // → "Green"
    std::cout << enum_to_string(HttpStatus::NotFound) << '\n'; // → "NotFound"
}
```

The **same** `enum_to_string` template serves both an unrelated 3-value enum and a numerically-valued HTTP-status enum — no per-enum code was written.

---

#### Example 2: Compile-Time Member Count via `static_assert`

```cpp
#include <meta>

template <typename T>
consteval std::size_t member_count() {
    std::size_t n = 0;
    template for (constexpr std::meta::info m : std::meta::nonstatic_data_members_of(^^T)) {
        ++n;
    }
    return n;
}

struct Point3D { double x, y, z; };
struct Employee { std::string name; int id; double salary; };

static_assert(member_count<Point3D>() == 3);
static_assert(member_count<Employee>() == 3);
```

A single `consteval` function computes a member count for *any* aggregate, usable directly in a `static_assert` — no hand-maintained "arity" constant per struct.

---

#### Example 3: Generic Serializer Applied to Two Different Shapes

```cpp
#include <meta>
#include <format>
#include <string>
#include <iostream>

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

struct Vec2 { double x, y; };
struct User { std::string name; int age; };

int main() {
    std::cout << to_json(Vec2{1.5, 2.5}) << '\n';        // → {"x":1.5,"y":2.5}
    std::cout << to_json(User{"Ada", 30}) << '\n';       // → {"name":"Ada","age":30}
}
```

`to_json` never mentions `Vec2` or `User` by name — it discovers each struct's shape entirely through reflection.

---

#### Example 4: Reflection-Generated Equality Comparison

```cpp
#include <meta>

// Conceptual: a generic structural equality, comparing every
// non-static data member, for any aggregate type.
template <typename T>
constexpr bool structural_equals(const T& a, const T& b) {
    bool equal = true;
    template for (constexpr std::meta::info member :
                  std::meta::nonstatic_data_members_of(^^T)) {
        if (a.[:member:] != b.[:member:]) {
            equal = false;
        }
    }
    return equal;
}

struct Point3D { double x, y, z; };

int main() {
    Point3D a{1, 2, 3}, b{1, 2, 3}, c{1, 2, 4};
    // structural_equals(a, b) is expected to evaluate to true
    // structural_equals(a, c) is expected to evaluate to false
}
```

Before reflection, this required either a hand-written `operator==` per struct or a macro that re-lists every member name a second time; here, the member list is read directly from the type.

---

#### Example 5: Reflection vs. a Boost.PFR-Style Pre-C++26 Workaround

```cpp
// Pre-C++26 workaround (conceptual Boost.PFR style): count members via
// structured-binding aggregate-arity tricks — no member NAMES available,
// aggregates only, and the technique is a clever exploit of initialization
// rules rather than a real introspection facility.
template <typename T>
constexpr std::size_t pfr_style_count() {
    // Implementation relies on trying successively larger brace-init
    // patterns until one stops compiling — intricate, and returns only
    // a count, never a member's name or type.
    return /* ...aggregate-arity detection... */ 0;
}

// C++26 reflection equivalent: direct, explicit, and gives you names too.
template <typename T>
consteval std::size_t reflect_count() {
    std::size_t n = 0;
    template for (constexpr std::meta::info m : std::meta::nonstatic_data_members_of(^^T)) {
        ++n;
    }
    return n;
}
```

The reflection version reads the compiler's own knowledge of the type directly, rather than reverse-engineering member count from aggregate-initialization behavior — and, unlike the PFR-style trick, it can also retrieve each member's **name** and **type**, not just a count.

---

---

### QUICK_REFERENCE: Reflection Vocabulary Cheat Sheet

#### Core Vocabulary

| Term | What it is |
|---|---|
| `^^entity` | The prefix **reflection operator** (P2996 spelling). Turns a type, namespace, variable, function, class member, or enumerator into a `std::meta::info` value. |
| `std::meta::info` | The **single, uniform value type** that represents a reflection of *any* kind of program entity. |
| `[: r :]` | The **splice** operator. Turns a `std::meta::info` value back into real code — a type, an expression, a member name, a template argument — depending on grammatical position. |
| `consteval` | The evaluation context reflection lives in; reflection queries and splices are compile-time only. |
| `template for` | A proposed expansion-statement construct for iterating a compile-time range of `std::meta::info` (e.g. a class's members). |
| `<meta>` | The proposed standard header housing `std::meta::info` and the reflection metafunction library. |

#### Key `std::meta` Metafunctions (names may still shift before ISO publication)

| Metafunction | Purpose |
|---|---|
| `std::meta::identifier_of(r)` | Get an entity's name as a string. |
| `std::meta::type_of(r)` | Get the type of a reflected variable/member (as another reflection). |
| `std::meta::is_public(r)`, `is_static(r)`, `is_function(r)` | Predicates about a reflected entity. |
| `std::meta::nonstatic_data_members_of(^^T)` | All non-static data members of class `T`, as a compile-time range. |
| `std::meta::enumerators_of(^^E)` | All enumerators of enum `E`, as a compile-time range. |
| `std::meta::members_of(r)` | All members (any kind) of a class or namespace. |
| `std::meta::define_class(...)` | Synthesize a brand-new class from compile-time-described member specs. |

#### Syntax Cheat Sheet (illustrative P2996 working-draft syntax)

```cpp
#include <meta>

// Reflect: entity -> std::meta::info
constexpr std::meta::info r = ^^SomeType;

// Query: ask a question about the reflection
constexpr auto name = std::meta::identifier_of(^^SomeType::member);

// Splice: std::meta::info -> real code, position-dependent
using T = [:r:];                 // type position
auto v  = obj.[:member_refl:];   // member-access position

// Iterate: compile-time range of reflections
template for (constexpr std::meta::info m : std::meta::nonstatic_data_members_of(^^T)) {
    // m is a fresh compile-time constant each iteration
}
```

#### At a Glance: What Problem Each Piece Solves

| Problem | Reflection tool |
|---|---|
| "What are this struct's fields?" | `nonstatic_data_members_of` |
| "What's this enum's Nth value called?" | `enumerators_of` + `identifier_of` |
| "Turn this compile-time data back into a type/expression" | Splicing `[: :]` |
| "Generate a brand-new type from a schema" | `define_class` |

**End of Topic 1: C++26 Static Reflection**
