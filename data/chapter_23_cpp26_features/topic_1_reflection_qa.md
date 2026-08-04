## TOPIC: C++26 Static Reflection - Compile-Time Introspection and Code Generation

### INTERVIEW_QA: Comprehensive Questions

#### Q1: What problem does C++26 static reflection solve that pre-C++26 C++ could not?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** It gives C++ a first-class, portable way to *ask questions about its own program structure* at compile time — something Java, C#, and Python have long had, and C++ never did.

**Concrete pain points before reflection:**
1. **Enum → string**: required a hand-written `switch` per enum, manually kept in sync
2. **Struct serialization**: required per-type hand-written `to_json`-style functions
3. **Member counting/iteration**: required Boost.PFR-style aggregate-initialization exploits (no names, aggregates only) or macro-heavy libraries (Boost.Describe, Boost.Hana) that duplicate member names by hand

**Key Concept:** #reflection #p2996 #metaprogramming #cpp26

</details>

---

#### Q2: What is `std::meta::info`, and why is there only one such type instead of separate types for "reflected type," "reflected member," etc.?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** `std::meta::info` is the single, uniform, opaque value type that every reflectable entity — types, namespaces, variables, functions, class members, enumerators, templates — reflects down to.

**Why uniform:**
```cpp
constexpr std::meta::info r1 = ^^int;          // a type
constexpr std::meta::info r2 = ^^Point3D::x;   // a data member
constexpr std::meta::info r3 = ^^std;          // a namespace
// all three are the SAME C++ type: std::meta::info
```

Using one uniform value type is what lets a single `consteval` function accept a reflection of *anything* and query "what kind of entity is this?" — without an explosion of overloads for every possible entity kind.

**Key Concept:** #std_meta_info #uniform_representation #reflection

</details>

---

#### Q3: What does the `^^` operator do, and what can you reflect with it?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** `^^` is the prefix **reflection operator** proposed in P2996. It takes the name of almost anything in your program and produces a `std::meta::info` value describing it.

**What can be reflected:**
```cpp
^^int                  // a type
^^Point3D              // a class
^^Point3D::x           // a data member
^^std                  // a namespace
^^my_function          // a function
^^Color::Red           // an enumerator
^^std::vector          // a template (uninstantiated)
```

**Key Concept:** #reflection_operator #p2996

</details>

---

#### Q4: What is "splicing," and why is it necessary in addition to the reflection operator?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Producing a `std::meta::info` value only gives you *inert data describing* an entity — it is not the entity itself. **Splicing**, written `[: ... :]`, is how you turn that data back into real, grammatically-checked C++ code.

```cpp
constexpr std::meta::info r = ^^int;

[:r:] x = 42;      // splices to: int x = 42;
using T = [:r:];   // splices to: using T = int;
```

**The round-trip model:** reflect (`^^`) → inspect/transform as compile-time data → splice (`[: :]`) back into real code. This typically happens inside a `consteval` function that loops over, filters, or builds new reflections before splicing results back out.

**Key Concept:** #splicing #reflection_roundtrip

</details>

---

#### Q5: Why must reflection be a `consteval`-only mechanism? Can you reflect on a value chosen at runtime?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** No — reflection operates on entities the compiler already knows about at compile time (declared types, members, enumerators). `^^name` reflects the *declaration* that `name` resolves to via ordinary compile-time name lookup; it never touches a runtime value.

```cpp
void process(int runtime_choice) {
    // ❌ Not how this works — you can't reflect "whichever member was chosen at runtime"
    // std::meta::info r = ^^get_member_by_index(runtime_choice);
}
```

What a `consteval` function *can* do is iterate a compile-time-known set of members/enumerators and generate runtime dispatch logic (a table, a switch) from that fixed set — the generation is compile-time, the dispatch it produces can run at runtime.

**Key Concept:** #consteval #compile_time_only #reflection_limits

</details>

---

#### Q6: Write (conceptually) a generic `enum_to_string` using reflection, and explain why this was previously impossible to write once for all enums.

<details>
<summary><b>Show Answer</b></summary>

**Answer:**

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
```

**Why it was impossible before:** every enum has a different set of enumerators, and pre-C++26 C++ had no way to enumerate them generically — you needed a hand-written `switch` (or a macro faking one) per enum type, which drifts out of sync whenever the enum changes. This single template works for *any* enum, automatically.

**Key Concept:** #enum_to_string #enumerators_of #generic_reflection

</details>

---

#### Q7: What role do `std::meta::nonstatic_data_members_of` and `template for` play in a generic struct serializer?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** `nonstatic_data_members_of(^^T)` produces a compile-time range of reflections, one per non-static data member of `T`. `template for` is the proposed expansion-statement construct for iterating such a compile-time range, expanding the loop body once per member at compile time.

```cpp
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
```

This single function serializes *any* struct made of reflectable, formattable members — it never mentions a struct's field names directly.

**Key Concept:** #nonstatic_data_members_of #template_for #serialization

</details>

---

#### Q8: What is `define_class`, and what class of problems does it target?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** `define_class` (and related facilities) is the part of P2996 that goes beyond *reading* program structure — it lets a `consteval` function *synthesize a brand-new class* from a compile-time description of member specs (names + types).

```cpp
// Simplified conceptual sketch — exact API still evolving in the proposal
consteval std::meta::info make_point_type(std::vector<std::meta::info> member_specs) {
    return std::meta::define_class(^^struct, member_specs);
}
```

This "data-driven class generation" is what ultimately enables declarative serialization frameworks, ORMs, and interface-generation tools *inside the language* — capabilities that today require an external code generator (e.g. reading a `.proto` schema file). This is the newest, least locked-down part of the proposal, so treat exact API details as a capability the proposal is aiming for rather than a finalized spec.

**Key Concept:** #define_class #code_generation #data_driven_types

</details>

---

#### Q9: Does using reflection or `define_class` bypass normal C++ rules like access control or the One Definition Rule?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** No. Reflection is a way of *authoring* declarations at compile time, not a way of bypassing what makes a declaration well-formed. A member synthesized via reflection that would violate the ODR, access control, or any other rule fails to compile exactly as if you had typed the equivalent code by hand — it's simply discovered through a `consteval` function generating a declaration instead of literal source text.

**Why this matters:** it's what keeps reflection-generated code just as safe and checkable as hand-written code — reflection doesn't create a special "anything goes" code path.

**Key Concept:** #odr #access_control #reflection_safety

</details>

---

#### Q10: What's a real, current adoption caveat teams should know before relying on reflection in library code?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Because `^^`, `[: :]`, and `<meta>` are brand-new grammar and library surface, code using them simply will not compile on any pre-C++26 toolchain, or a C++26-mode compiler that hasn't yet implemented this specific proposal.

```cpp
#ifdef __cpp_impl_reflection   // illustrative; exact macro name not yet finalized
    // reflection-based implementation
#else
    // fallback hand-written implementation
#endif
```

Library authors wanting broad compatibility currently need to either duplicate a non-reflection implementation or gate the reflection-based path behind a feature-test macro once one is standardized.

**Key Concept:** #toolchain_support #adoption #feature_test_macro

</details>

---

#### Q11: Is it settled whether reflection can see a class's `private` members from outside the class?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** No — this has been a genuinely debated design point across P2996's revisions, and is not fully settled as of this writing. Whether a reflection query can see private members, and whether splicing a private member's reflection from outside the class should be allowed (the way friend access would be), intersects with one of C++'s oldest guarantees: that access control is enforced by the compiler, not by convention.

**Why it's treated carefully here:** any specific behavior shown for private-member reflection in illustrative examples should be read as showing the *design direction* the committee has been exploring, not a guarantee of final standardized behavior — check the published C++26 standard or your compiler's release notes once reflection ships.

**Key Concept:** #access_control #private_members #open_design_question

</details>

---
