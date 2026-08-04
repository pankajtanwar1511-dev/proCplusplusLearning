## TOPIC: C++26 Language Features - Core Language Improvements

### INTERVIEW_QA: Pack Indexing, Structured Bindings, Placeholders, and Relocation

#### Q1: What problem does pack indexing (P2662) solve, and what is its syntax?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Pack indexing lets you grab the Nth element of a template or function parameter pack directly, with `Ts...[N]` or `args...[N]`, instead of writing a recursive-template helper or routing through `std::tuple_element`/`std::get`.

**Before C++26:**
```cpp
template<std::size_t I, typename T, typename... Rest>
struct NthType : NthType<I - 1, Rest...> {};

template<typename T, typename... Rest>
struct NthType<0, T, Rest...> { using type = T; };

using Third = typename NthType<2, int, double, char, float>::type;  // char
```

**C++26:**
```cpp
template<typename... Ts>
using Third = Ts...[2];

using T = Third<int, double, char, float>;  // char, no helper template needed
```

Function parameter packs can be indexed the same way: `args...[N]`.

**Key Concept:** #pack_indexing #p2662 #variadic_templates #cpp26

</details>

---

#### Q2: Can the index in `Ts...[i]` be a runtime value?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** **No.** The index must be a compile-time constant expression.

**Why:** A parameter pack's length and per-element types (or values) are fixed at template instantiation time — it's a compile-time construct, not a runtime array. `Ts...[i]` is therefore a compile-time lookup, conceptually closer to `std::tuple_element_t<i, ...>` than to `some_array[i]`.

```cpp
template<typename... Args>
auto pick(std::size_t n, Args&&... args) {
    return args...[n];   // ❌ Error: n is a runtime parameter
}

template<std::size_t N, typename... Args>
auto pick_ok(Args&&... args) {
    return args...[N];   // ✅ N is a template parameter - compile-time constant
}
```

An out-of-range constant index (e.g. `Ts...[2]` on a 2-element pack) is also rejected at compile time, with the diagnostic pointing directly at the indexing expression rather than several template-instantiation frames deep.

**Key Concept:** #pack_indexing #compile_time #p2662

</details>

---

#### Q3: How do structured bindings introducing a pack (P1061) work, and how do you use the pack afterward?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** C++26 lets a structured binding name the first N elements individually and capture everything else as a pack using `...name`.

```cpp
auto tup = std::make_tuple(1, 2.0, "three", 4, 5);

auto& [first, ...rest] = tup;
// first is int&
// rest is a pack of the remaining bound references

process(first);
(process(rest), ...);   // fold-expression over the introduced pack
```

Before C++26, you had to name every single element (`auto& [a, b, c, d, e] = tup;`), even ones you had no individual use for. This composes with forwarding code that previously needed `std::apply` gymnastics to "peel off" the head of a tuple-like object.

**Key Concept:** #structured_bindings #p1061 #pack #cpp26

</details>

---

#### Q4: Can a structured-binding pack be empty, and can it hold elements of different types?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** **Yes to both** — and both are well-formed, not errors.

**Empty pack:** binding an empty tuple-like's remainder legally produces `sizeof...(rest) == 0`. A fold expression over it (`(process(rest), ...)`) simply expands to nothing — no compile error, but also silently no calls, which can hide a logic bug if you assumed at least one call always happens.

**Heterogeneous pack:** since a `tuple`-like source can have differently-typed remaining elements, the introduced pack is heterogeneous:

```cpp
auto tup = std::make_tuple(1, 2.5, std::string("three"));
auto& [first, ...rest] = tup;
// rest is a pack of: double&, std::string&  (two DIFFERENT types)
```

You can fold-expression over a heterogeneous pack (calling the same function on each element), but you cannot dump it directly into a single homogeneous runtime container without first converting to a common type.

**Key Concept:** #structured_bindings #p1061 #heterogeneous #edge_cases

</details>

---

#### Q5: What changed for `static` and `thread_local` structured bindings in C++26, and what stayed the same?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** C++17 through C++23 forbade giving a structured binding `static` or `thread_local` storage duration — it was automatic-storage-only. C++26 lifts that restriction:

```cpp
void f() {
    static auto [x, y] = get_pair();       // ✅ C++26: initialized once
    thread_local auto [w, z] = get_pair(); // ✅ C++26: one instance per thread
}
```

**What did NOT change:** the initialization semantics. A `static` structured binding follows the exact same "initialized once, on first control flow through the declaration" rule as any other static local — `get_pair()` only actually runs on the first call to `f()`, not on every call. Likewise `thread_local` gives each thread its own independently-initialized copy; it does not share one value across threads. The new syntax doesn't introduce new semantics, it just removes an arbitrary restriction on where existing static/thread-local rules could be applied.

**Key Concept:** #structured_bindings #static #thread_local #initialization_order

</details>

---

#### Q6: What problem does the `_` placeholder (P2169) solve?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Before C++26, declaring a second variable named `_` in the same scope was a hard redefinition error — so code with several "I don't care about this" bindings (structured bindings, RAII guards, unused captures) had to invent a unique dummy name for each one.

```cpp
// ❌ Pre-C++26
auto [_, count] = get_pair_1();
auto [_, total] = get_pair_2();   // Error: redefinition of '_'

// Workarounds people actually used:
auto [unused1, count] = get_pair_1();
auto [unused2, total] = get_pair_2();
```

C++26 makes `_` a genuine language placeholder: multiple `_` declarations in one scope are explicitly permitted because a placeholder isn't treated as introducing an ordinary, referenceable name.

```cpp
// ✅ C++26
auto [_, count] = get_pair_1();
auto [_, total] = get_pair_2();        // OK - distinct placeholder
std::lock_guard<std::mutex> _(mtx1);
std::lock_guard<std::mutex> _(mtx2);   // OK - another placeholder lock
```

**Key Concept:** #placeholder #underscore #p2169 #cpp26

</details>

---

#### Q7: After declaring `auto [_, count] = get_pair();`, can you read `_` back later in the same scope?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** **No.** The relaxation only permits *declaring* multiple `_`s without a redefinition error — it does not turn `_` into a shared, referenceable variable.

```cpp
auto [_, count]  = get_pair_1();
auto [_, total]  = get_pair_2();   // OK - independent placeholder

std::cout << _;   // ❌ Error: ambiguous/ill-formed - which '_' do you mean?
```

With more than one active placeholder in scope, there's no well-defined answer to "which `_`'s value" you'd be referring to, so the language simply doesn't let you reference `_` as an expression. If you need the value again later, give it a real name instead of `_`.

**Key Concept:** #placeholder #underscore #non_referenceable #p2169

</details>

---

#### Q8: What does it mean for a type to be "trivially relocatable" in C++26, and what problem does it solve?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Trivial relocatability (merging the long-running **P1144** and **P2786** proposals) is an opt-in property meaning: "moving this object and then destroying the moved-from original can be replaced by copying its bytes to the new location and treating the old bytes as inert, uninitialized storage — no constructor or destructor call needed at all."

**The problem it solves:** growing a `std::vector<T>` past capacity conceptually means move-constructing each element into a new buffer, then destroying each old element. For a type like `struct Point { double x, y, z; };`, that's logically just a `memcpy` — but the standard required the compiler to still run N move-constructions and N destructions in sequence unless it could otherwise *prove* it was safe to skip straight to bulk memory operations. Trivial relocatability gives containers a standard, portable way to know that's safe for a given type, instead of relying on non-portable, `is_trivially_copyable`-based heuristics that undersold what's actually safe to relocate.

**Key Concept:** #trivial_relocatability #p1144 #p2786 #performance

</details>

---

#### Q9: Why isn't every movable type automatically trivially relocatable?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Being movable only promises "there exists a valid sequence of move-then-destroy." Being **trivially** relocatable promises something stronger: that sequence has *no observable side effects beyond copying bytes* — a guarantee the compiler generally cannot verify on its own, which is why it's opt-in.

**Types where this breaks down:**

| Type shape | Movable? | Trivially relocatable? |
|---|---|---|
| `struct { double x, y, z; }` | ✅ | ✅ |
| `std::unique_ptr<T>` | ✅ | ✅ (owns a pointer, not a self-reference) |
| A type registering `this` in a global registry in its constructor | ✅ | ❌ - memcpy'ing it leaves a dangling registry entry |
| A type with a pointer/reference *into itself* (SBO-style) | ✅ | ❌ unless specially handled |

A type author must explicitly assert trivial relocatability, and getting it wrong for a type with address-dependent state compiles fine but corrupts memory silently once a container actually reallocates.

**Key Concept:** #trivial_relocatability #address_dependent_state #opt_in

</details>

---

#### Q10: What is the difference between "undefined behaviour" and the new C++26 "erroneous behaviour" (P2795)?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** They apply to the same historically dangerous pattern — reading a variable before it's initialized — but give very different guarantees.

| Aspect | Undefined Behaviour (old) | Erroneous Behaviour (P2795) |
|---|---|---|
| Value read | Unspecified, could be *anything* | A fixed, well-defined "erroneous" value |
| Optimizer assumptions | May assume the UB path never executes | May **not** assume the read never happens |
| Diagnosability | Not guaranteed, often silent | Encouraged/required to be diagnosable (sanitizers, debug builds) |
| Runtime cost | N/A | Designed to avoid new mandatory cost in optimized builds |

```cpp
void classic_bug() {
    int x;          // uninitialized, trivial, automatic storage duration
    if (x == 42) {  // C++26: fixed erroneous value, diagnosable - not full UB
        launch_missiles();
    }
}
```

The change specifically covers default-initialized, *trivial*, *automatic-storage-duration* variables — narrowing one of C++'s most notorious bug classes to something a conforming toolchain can reliably flag, without a language-wide "everything is zero-initialized" performance tax.

**Key Concept:** #erroneous_behaviour #undefined_behaviour #p2795 #safety

</details>

---

#### Q11: Does P2795's erroneous-behaviour change make dereferencing an uninitialized pointer safe?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** **No.** P2795 only covers reading the value of an uninitialized *trivial automatic variable itself* (like a bare `int` or `double`, or a trivial struct of such fields) — it does not touch pointer dereferences, non-trivial types, or writes through garbage pointers.

```cpp
void still_dangerous() {
    int* p;          // uninitialized pointer
    // *p = 42;       // ❌ STILL full undefined behaviour - dereferencing, not
                       //    just reading the pointer's own uninitialized bits

    std::string s;    // NOT covered either way - std::string's default
                       // constructor always runs and establishes a valid,
                       // well-defined empty state; this was never uninitialized
                       // in the sense P2795 targets.
}
```

A common over-generalization is assuming the change makes uninitialized-variable bugs "safe" across the board. It narrowly targets one specific, extremely common pattern; everything else that was undefined behavior before remains exactly as undefined as before.

**Key Concept:** #erroneous_behaviour #pointer_dereference #scope_of_change #p2795

</details>

---

#### Q12: Name the five C++26 core language features covered in this topic and their driving papers.

<details>
<summary><b>Show Answer</b></summary>

**Answer:**

| Feature | Paper | One-Line Purpose |
|---|---|---|
| Pack indexing | P2662 | `Ts...[i]` / `args...[i]` indexes a pack directly at compile time |
| Structured bindings introduce a pack | P1061 | `auto [head, ...rest] = x;` binds the head, captures the rest as a pack |
| `static`/`thread_local` structured bindings | (companion wording) | Structured bindings can now have static/thread storage duration |
| Placeholder variables `_` | P2169 | Multiple `_` declarations coexist in one scope without conflict |
| Trivial relocatability | P1144 / P2786 (merged) | Opt-in trait letting containers bulk-relocate eligible types |
| Erroneous behaviour for uninitialized reads | P2795 | Uninitialized trivial-automatic reads get a fixed, diagnosable value instead of full UB |

As with everything in this chapter, these are described as **adopted into the C++26 working draft** — final wording details may still be refined before ISO ratification, but the design direction reflected here is the accepted committee direction.

**Key Concept:** #cpp26 #summary #wg21 #working_draft

</details>

---
