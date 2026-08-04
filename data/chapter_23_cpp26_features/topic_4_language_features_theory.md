## TOPIC: C++26 Language Features - Core Language Improvements

### THEORY_SECTION: Pack Indexing, Structured Bindings, Placeholders, Relocation, and Safer Uninitialized Reads

C++26 is not yet a ratified ISO standard at the time of writing — everything below describes a proposal that has been **adopted into the C++26 working draft** by WG21 (the ISO C++ committee). Wording can still be refined by further papers before final ratification, but the design direction described here reflects the accepted proposals. This topic covers core language improvements outside of reflection, contracts, and `std::execution`, which have their own dedicated topics in this chapter.

---

#### 1. Pack Indexing (P2662) - Direct Indexing into a Parameter Pack

**The Pre-C++26 Problem:**

Getting the Nth element out of a template parameter pack has never had direct syntax. Every prior standard forced you into recursion, `std::tuple`, or index-sequence tricks just to answer a question as simple as "what is the 3rd type in this pack?"

```cpp
// ❌ Pre-C++26: Recursive template metaprogramming just to index a pack
template<std::size_t I, typename T, typename... Rest>
struct NthType : NthType<I - 1, Rest...> {};

template<typename T, typename... Rest>
struct NthType<0, T, Rest...> {
    using type = T;
};

template<std::size_t I, typename... Ts>
using NthType_t = typename NthType<I, Ts...>::type;

// Usage:
using Third = NthType_t<2, int, double, char, float>;  // char
```

```cpp
// ❌ Pre-C++26: Or route through std::tuple_element / std::get
template<typename... Ts>
using First = std::tuple_element_t<0, std::tuple<Ts...>>;

template<typename... Args>
auto get_second(Args&&... args) {
    return std::get<1>(std::forward_as_tuple(std::forward<Args>(args)...));
}
```

Both approaches work, but they are indirect: you pay for an unrelated template instantiation (or a `tuple` construction at runtime) just to answer a compile-time indexing question.

**The C++26 Solution - `pack...[index]` Syntax:**

```cpp
// ✅ C++26: Direct pack indexing, no helper templates needed
template<typename... Ts>
using First  = Ts...[0];

template<typename... Ts>
using Second = Ts...[1];

template<typename... Ts>
using Last   = Ts...[sizeof...(Ts) - 1];

// Usage:
using T = First<int, double, char>;   // int
using U = Last<int, double, char>;    // char
```

Function parameter packs can be indexed the same way:

```cpp
template<typename... Args>
decltype(auto) get_nth(std::size_t /*compile-time only*/, Args&&... args) {
    // Indexing a *function parameter pack* requires a compile-time constant index
    return (args...[2]);   // grabs the 3rd argument, no std::get/tuple needed
}

template<typename... Args>
auto second_arg(Args&&... args) {
    return args...[1];   // works directly on the function parameter pack
}

second_arg(10, 20.5, "hi");  // → 20.5
```

**Comparison Table:**

| Task | Pre-C++26 | C++26 |
|------|-----------|-------|
| Nth type in a pack | Recursive template struct | `Ts...[N]` |
| Nth function argument | `std::get<N>(std::forward_as_tuple(args...))` | `args...[N]` |
| First / Last type | Specialize base case | `Ts...[0]` / `Ts...[sizeof...(Ts)-1]` |
| Compile cost | Extra template instantiations per index | Direct language construct, no extra instantiations |

**Key restriction:** the index must be a compile-time constant expression (it can depend on other template parameters, but it cannot be a runtime value) — this is a compile-time indexing facility, not a runtime one. Out-of-range indices are ill-formed, just like an out-of-bounds `std::get`.

---

#### 2. Structured Bindings Improvements - Packs, and `static`/`thread_local` Storage

C++17 introduced structured bindings (`auto [a, b, c] = tuple_like;`) but shipped with two restrictions that always felt arbitrary: you had to name every single element, and you could not give the binding `static` or `thread_local` storage duration. C++26 adopts papers (built around **P1061, "Structured Bindings can introduce a Pack"**, together with companion wording removing the storage-duration restriction) that lift both limits.

**2a. Structured Bindings Can Introduce a Pack**

```cpp
// ❌ Before: every element needs an explicit name, even ones you don't want individually
auto tup = std::make_tuple(1, 2.0, "three", 4, 5);
auto& [a, b, c, d, e] = tup;   // must name all 5, even if you only care about `a`

// ✅ C++26: bind the head, and capture "everything else" as a pack
auto& [first, ...rest] = tup;
// first is int&      -> 1
// rest is a pack of the remaining bound references: double&, const char*&, int&, int&

process(first);
(process(rest), ...);   // fold-expression over the introduced pack
```

This also composes naturally with function parameter packs and forwarding code that used to require manual `std::apply` gymnastics to "peel off" the first element of a tuple-like object:

```cpp
template<typename Tuple>
void log_head_and_tail(Tuple&& t) {
    auto&& [head, ...tail] = std::forward<Tuple>(t);
    std::cout << "head = " << head << ", " << sizeof...(tail) << " more\n";
}
```

**2b. `static` and `thread_local` Structured Bindings**

```cpp
// ❌ Before C++26: ill-formed - structured bindings were automatic-storage only
void old_code() {
    static auto [x, y] = get_pair();   // ❌ Error (pre-C++26)
}

// ✅ C++26: static/thread_local structured bindings are allowed
void new_code() {
    static auto [x, y] = get_pair();       // ✅ initialized once, like any static local
    thread_local auto [w, z] = get_pair(); // ✅ one instance per thread
}
```

Before C++26, working around this meant giving up structured bindings entirely and manually naming `.first`/`.second`, or wrapping the pair in a `static` helper struct just to get static storage duration. The restriction was implementation-arbitrary rather than fundamental, and this paper simply removes it.

| Capability | C++17-C++23 | C++26 |
|---|---|---|
| Bind every element by name | ✅ | ✅ |
| Bind a subset + "rest" as a pack | ❌ | ✅ (`[first, ...rest]`) |
| `static` structured binding | ❌ | ✅ |
| `thread_local` structured binding | ❌ | ✅ |

---

#### 3. Placeholder Variables with No Name, `_` (P2169)

**The Pre-C++26 Problem:**

C++ has always allowed exactly one unnamed *thing* per scope in a few contexts (e.g., an unused function parameter can be left nameless), but you could never declare **multiple** same-named "I don't care about this" variables in one scope — a second `auto _ = ...;` was a hard redefinition error. Structured bindings made this especially painful, because you're often forced to name every element even when you only want one or two of them.

```cpp
// ❌ Pre-C++26: can't reuse the same throwaway name twice in one scope
auto [_, count] = get_pair_1();
auto [_, total] = get_pair_2();   // ❌ Error: redefinition of '_'

// Workarounds people actually used:
auto [unused1, count] = get_pair_1();
auto [unused2, total] = get_pair_2();
// or
[[maybe_unused]] auto ignore1 = ...;
[[maybe_unused]] auto ignore2 = ...;
```

Similarly, lambdas capturing multiple things you don't use, or `std::lock_guard` style RAII objects created purely for their side effect, all needed distinct dummy names purely to satisfy the "no two declarations share a name" rule.

**The C++26 Solution:**

`_` becomes a genuine language placeholder: multiple declarations named `_` in the same scope are explicitly permitted and do **not** conflict, because a placeholder isn't treated as introducing an ordinary, referenceable name.

```cpp
// ✅ C++26: as many `_` placeholders as you like, no redefinition error
auto [_, count] = get_pair_1();
auto [_, total] = get_pair_2();       // ✅ OK - distinct placeholder, not a redeclaration

std::lock_guard<std::mutex> _(mtx1);  // RAII lock, name never needed
std::lock_guard<std::mutex> _(mtx2);  // ✅ another placeholder lock, same scope

for (auto _ : {1, 2, 3}) {            // range-for where the loop variable is unused
    do_side_effecting_thing();
}
```

**Comparison Table:**

| Use Case | Pre-C++26 | C++26 |
|---|---|---|
| Two throwaway structured-binding fields | Distinct dummy names required | `_` reused freely |
| Multiple RAII guards, value never read | `guard1`, `guard2`, ... | `_`, `_`, ... |
| Signal intent "this is genuinely unused" | `[[maybe_unused]]` + a name | `_` alone communicates it |
| Redeclaring `_` in the same scope | Hard error | Explicitly allowed |

**Key restriction:** `_` still must be *usable* as an ordinary identifier where the language requires one (for example you can't reference "the value of `_`" later if there are multiple placeholders active, since which `_` you'd mean is ambiguous by design) — its entire purpose is "I will never refer to this again."

---

#### 4. Trivial Relocatability - Bulk-Moving Objects Without Per-Element Move+Destroy

**The Problem Relocation Solves:**

Growing a `std::vector<T>` beyond its capacity has always meant, conceptually: allocate a bigger buffer, **move-construct** each existing element into the new buffer, then **destroy** each old element. For a type whose move constructor and destructor are both trivial in effect (no heap ownership tricks, no self-referential pointers, nothing that depends on the object's *address*), that's logically equivalent to a single `memcpy` of the whole buffer — but the standard, strictly speaking, still required the compiler to run N move-constructions and N destructions in sequence.

```cpp
struct Point { double x, y, z; };   // move ctor + dtor are both trivial in EFFECT

std::vector<Point> pts;
// ... pts grows past capacity ...
// Conceptually: this could just be memcpy(new_buf, old_buf, n * sizeof(Point));
// Historically: still expressed as n individual move-constructs + n destructs
```

For simple aggregates the optimizer often manages to see through this and generate the `memcpy` anyway, but for anything with a user-provided move constructor/destructor (even a "trivial-looking" one, or one hidden behind a non-inlined function boundary), the compiler had no *standard, portable* way to know it was safe to skip straight to a bulk-memory operation — and library-internal tricks to detect this were non-portable, `is_trivially_copyable`-based heuristics that undersold what's actually safe to relocate.

**The C++26 Design (merging the long-running P1144 and P2786 proposals):**

C++26 introduces a standard notion of a type being **trivially relocatable**: a property (opt-in via a trait/attribute — the exact standard spelling refined the two competing proposals into one, so treat any exact syntax shown here as illustrative of the *concept* rather than a guaranteed final spelling) meaning "moving this object and then destroying the moved-from object can be replaced by copying its bytes to the new location and treating the old bytes as inert, uninitialized storage — no constructor or destructor call needed at all."

```cpp
// Illustrative: the standard exposes a trait/attribute-based mechanism.
// A type that owns no self-referential state and doesn't register `this`
// anywhere (no intrusive lists, no "this" captured by an external observer)
// can be declared/deduced trivially relocatable:

struct Point { double x, y, z; };                 // trivially relocatable "for free"
struct Widget { std::unique_ptr<Impl> impl; };    // can OPT IN — owns no self-reference

struct SelfReferential {
    char buffer[64];
    char* view = buffer;   // ❌ NOT safely relocatable: `view` points into `this`
};
```

The library-facing payoff is that containers (`std::vector`, `std::deque`, and friends) can detect "is `T` trivially relocatable?" and, when true, use a single bulk memory operation for growth/reallocation instead of a loop of individual move+destroy calls — a real, measurable throughput win for large containers of medium-sized, pointer-free-of-self-reference types.

**Why This Isn't Automatic for Every Movable Type:**

| Type shape | Movable? | Trivially relocatable? |
|---|---|---|
| `struct { double x, y, z; }` | ✅ | ✅ (no address-dependent state) |
| `std::unique_ptr<T>` | ✅ (move-only) | ✅ (owns a pointer, not a self-reference) |
| A type storing `this` in a global registry in its constructor | ✅ | ❌ (moving/memcpy'ing it leaves a dangling registry entry) |
| A type with a pointer/reference *into itself* (e.g. small-buffer-optimized string-like types) | ✅ | ❌ unless specially handled (the whole point of SBO types is they're address-dependent) |

Being movable only promises "there exists a valid sequence of move-then-destroy." Being **trivially** relocatable promises something stronger: that sequence has *no observable side effects beyond copying bytes* — which is a stricter, opt-in guarantee the compiler/library can rely on for optimization, not something safely inferred just because a move constructor exists.

---

#### 5. Erroneous Behaviour for Uninitialized Reads of Trivial Automatic Variables (P2795)

**Undefined Behaviour vs. Erroneous Behaviour - The Core Distinction:**

Reading a variable of automatic storage duration before it's been initialized has always been one of C++'s most notorious classes of bugs:

```cpp
// ❌ Classic C++ (pre-C++26): full undefined behaviour
void classic_bug() {
    int x;              // uninitialized
    if (x == 42) {      // ❌ UB: reading uninitialized int
        launch_missiles();
    }
}
```

Under **undefined behaviour**, the standard makes *no promise whatsoever* about what happens: the optimizer is legally entitled to assume the UB path is unreachable, which historically has led to bizarre, surprising results — branches that "shouldn't" be possible getting taken, code before the UB being affected by "time-traveling" optimizations, or the classic "it happened to work in debug builds and crashed mysteriously in release."

C++26 introduces a new, narrower category for exactly this case (default-initialization of a trivial automatic object followed by reading it before assignment): **erroneous behaviour**. Under erroneous behaviour:

- The read still produces a value — but it's a fixed, well-defined "erroneous value" (conceptually, the implementation is expected to give it a deterministic, typically zero-like, value rather than arbitrary garbage), **not** "anything can happen."
- Implementations are encouraged (and, in many cases, required in debug/instrumented modes) to **diagnose** the erroneous read — e.g. at runtime via sanitizers or a debug build trap — rather than silently propagating a wrong value forever.
- Crucially, this is *not* the same relaxation as "just zero-initialize everything by default": performance-sensitive code that truly wants uninitialized memory (e.g. via an explicit escape hatch) can still opt out, and the change is designed to avoid new mandatory runtime cost in optimized builds while still eliminating the worst class of "UB makes the optimizer assume this branch never happens" surprises.

```cpp
// ✅ C++26: erroneous behaviour instead of UB
void modern_code() {
    int x;              // still not "initialized" in the traditional sense
    if (x == 42) {      // reads a fixed erroneous value; well-behaved
                        // implementations can flag this at compile-time
                        // or diagnose it at runtime in debug builds
        // reachable only if the erroneous value happens to equal 42,
        // which a conforming diagnostic build will flag as a bug either way
    }
}
```

**Why the Distinction Matters:**

| Aspect | Undefined Behaviour (old) | Erroneous Behaviour (P2795) |
|---|---|---|
| Value read | Unspecified, could be *anything*, including values that never "existed" | A fixed, well-defined value (implementation gives a real, predictable value) |
| Optimizer assumptions | May assume the UB path never executes at all | May **not** assume the read never happens - the read is a real, well-defined event |
| Diagnosability | Not guaranteed; often silent | Encouraged/required to be diagnosable (sanitizers, debug instrumentation) |
| ABI / mandatory runtime cost | N/A | Designed to avoid new mandatory cost in optimized, non-instrumented builds |
| Backward compatibility | N/A | Existing code that (accidentally) "worked" continues to behave the same in optimized builds; the win is in catching the bug, not silently changing correct-looking output |

The net effect: one of the most dangerous, hardest-to-diagnose bug categories in C++ becomes something a conforming toolchain can reliably flag, without requiring a language-wide "everything is zero-initialized" performance tax.

---

#### 6. C++26 Language Features at a Glance

| Feature | Paper | One-Line Purpose | Why It Matters |
|---|---|---|---|
| Pack indexing | P2662 | `Ts...[i]` / `args...[i]` indexes a pack directly | Removes recursive-template/`tuple_element` boilerplate for a compile-time lookup |
| Structured bindings introduce a pack | P1061 | `auto [head, ...rest] = x;` | Bind "the first N" without naming every remaining element |
| `static`/`thread_local` structured bindings | (companion wording) | Structured bindings can now have static storage duration | Removes an arbitrary C++17 restriction |
| Placeholder variables `_` | P2169 | Multiple `_` declarations coexist in one scope | Ends the "invent a unique dummy name" ritual for intentionally-unused bindings/guards |
| Trivial relocatability | P1144 / P2786 (merged) | Opt-in trait marking a type as bulk-memcpy-relocatable | Lets containers skip per-element move+destroy on reallocation for eligible types |
| Erroneous behaviour for uninitialized reads | P2795 | Reading an uninitialized trivial automatic variable is erroneous, not undefined | Narrows a top class of C++ bugs to a diagnosable, well-defined value without new mandatory runtime cost |

---

#### 7. Compile-Time vs Runtime Breakdown

Not every feature in this topic costs the same at runtime — some are purely compile-time bookkeeping, one has a genuine (small) per-access runtime check, and one changes *how much runtime work* a completely different operation (container growth) does.

| Feature | Compile Time | Runtime | Runtime Cost |
|---|---|---|---|
| Pack indexing (`Ts...[i]`) | Resolves directly to the concrete Nth type/value; no recursive template instantiation chain to walk | Nothing — for type packs there is no runtime artifact at all; for value packs (`args...[i]`) it reads the already-materialized argument, same as writing the name directly | **Zero.** Actually *cheaper at compile time too* than the old recursive-`NthType`/`tuple_element` approach, since there's no chain of intermediate template instantiations to elaborate |
| Structured bindings introduce a pack (`auto [head, ...rest] = x`) | The compiler decides, per name, which tuple/struct element it aliases | Reading `head` or any element of `rest` is a plain memory read of that element — identical codegen to naming it by hand | **Zero extra** beyond what accessing the underlying elements always cost |
| `static`/`thread_local` structured bindings | Storage duration and layout fixed at compile time | **This one is different:** every access after the first goes through the same thread-safe initialization-guard check any function-local `static` uses (a flag test, "have I run the initializer yet?") | **Small but real** — a guard-flag branch per access; worth knowing about if the binding sits in a hot loop, though it's the same cost you'd already pay for an equivalent hand-written `static` variable |
| Placeholder `_` | Purely a name-lookup rule — the compiler stops treating `_` as "redeclaration" and stops complaining about "unused" | The underlying object still has a real address, a real constructor, and a real destructor that runs at scope exit exactly as if it had a normal name | **Zero.** `_` changes what the compiler *lets you write*, not what code it *emits* — an unnamed `std::lock_guard _(mtx);` locks and unlocks exactly like a named one |
| Trivial relocatability (opt-in trait) | The trait check (`is_trivially_relocatable_v<T>`) is evaluated at compile time and selects, at compile time, *which relocation strategy the container's growth code compiles to* | The strategy itself runs at runtime — but which one runs is fixed at compile time, not decided per-call | See the Memory Model below — this is where trivial relocatability actually pays off, by changing the *shape* of the runtime work container growth does |
| Erroneous behaviour for uninitialized reads | The standard's *promise* about the read changes; no new instrumentation is inserted, no check is added | The read itself was always going to load whatever bit pattern sits at that stack address — that load still happens exactly as before | **Zero added cost.** This is a pure semantic reclassification: "undefined (anything can happen)" becomes "erroneous (a real, fixed, possibly-diagnosable value)" without the compiler doing any extra work at the point of the read |

---

#### 8. Memory Model

The one feature here with a genuinely interesting memory story is **trivial relocatability**, because it changes how a container like `std::vector` moves its elements to a bigger buffer on growth.

**Before (classic move-construct-then-destroy relocation), growing a vector of N elements:**

```
Old buffer (capacity 4, size 4):        New buffer (capacity 8):
┌───┬───┬───┬───┐                      ┌───┬───┬───┬───┬───┬───┬───┬───┐
│ A │ B │ C │ D │                      │ ? │ ? │ ? │ ? │ ? │ ? │ ? │ ? │
└───┴───┴───┴───┘                      └───┴───┴───┴───┴───┴───┴───┴───┘

For EACH element (N calls, here N=4):
  1. move-construct new[i] from old[i]   ← function call, runs T's move ctor body
  2. destroy old[i]                       ← function call, runs T's dtor body
= 8 function calls total for 4 elements (2 per element)
```

**After (trivially relocatable, opt-in trait), growing the same vector:**

```
Old buffer (capacity 4, size 4):        New buffer (capacity 8):
┌───┬───┬───┬───┐   one bulk memcpy    ┌───┬───┬───┬───┬───┬───┬───┬───┐
│ A │ B │ C │ D │ ───────────────────► │ A │ B │ C │ D │ ? │ ? │ ? │ ? │
└───┴───┴───┴───┘   (raw bytes)        └───┴───┴───┴───┴───┴───┴───┴───┘

ONE call: memcpy(new_buffer, old_buffer, 4 * sizeof(T))
= 1 bulk memory operation instead of 8 function calls
```

The other two features have simpler footprints worth noting: pack indexing leaves **zero runtime bytes anywhere** — it only exists while the template is being instantiated, and is gone by the time code is emitted. A `static`/`thread_local` structured binding, by contrast, lives in **static storage** (not the stack, not the heap) for the life of the program or thread, exactly like any other `static` variable — the only "extra" memory is the one-time init-guard flag the runtime already needs for ordinary statics.

**Why this matters for low latency:** container reallocation is a well-known source of latency spikes in hot paths — a `std::vector<T>` that outgrows its capacity mid-loop pays for N move-constructions and N destructions synchronously, right when you can least afford it. Trivial relocatability collapses that into a single `memcpy`/`memmove`, trading N small function calls for one bulk copy the CPU can execute with tight, predictable, cache-friendly throughput. For simple, safely-relocatable payloads (small structs, fixed buffers, anything without self-referential pointers or external registration of `this`), opting into this trait is one of the more direct, measurable wins C++26 offers for allocation-and-growth-sensitive hot-path code.

---

### EDGE_CASES: Pitfalls in Pack Indexing, Placeholders, and Relocation

#### Edge Case 1: Pack Indexing Out of Bounds

```cpp
template<typename... Ts>
using Third = Ts...[2];

using Bad = Third<int, double>;   // ❌ Error: pack only has 2 elements (indices 0, 1)
```

`Ts...[i]` is checked against the pack's actual size at compile time, so an out-of-range index is ill-formed — but the diagnostic is direct: "pack index 2 is out of bounds for a pack of size 2," pointing straight at the indexing expression. Compare this to the pre-C++26 recursive-template equivalent:

```cpp
template<std::size_t I, typename T, typename... Rest>
struct NthType : NthType<I - 1, Rest...> {};
// no explicit base case reached for I=2 with only 2 types...

using Bad2 = NthType<2, int, double>::type;  // ❌ Error, but buried several
                                              // template-instantiation frames deep,
                                              // often reported at the *recursive base
                                              // case* rather than at the call site.
```

The recursion-based approach fails "downstream" — the error surfaces inside the metaprogramming helper, not at the line the programmer actually wrote. Pack indexing fails exactly where the mistake was made.

---

#### Edge Case 2: Pack Indexing Is Compile-Time Only, Not a Runtime Array Access

```cpp
template<typename... Args>
auto pick(std::size_t n, Args&&... args) {
    // ❌ Error: `n` is a runtime value, but pack indexing needs a
    // compile-time constant expression — this is NOT operator[] on an array.
    return args...[n];
}
```

A common misconception is that `args...[n]` behaves like indexing a `std::array` or `std::vector` at runtime. It does not: the pack itself is a compile-time construct (its length and the type/value of each element are fixed when the template is instantiated), so the index must be a constant expression — usable with `if constexpr`, a template non-type parameter, or `sizeof...(Args)`-derived constants, but never with an ordinary runtime `std::size_t` parameter:

```cpp
template<std::size_t N, typename... Args>
auto pick_constant(Args&&... args) {
    return args...[N];   // ✅ N is a template parameter - a compile-time constant
}

pick_constant<1>(10, 20.5, "hi");  // ✅ OK -> 20.5
```

---

#### Edge Case 3: Structured-Binding Packs with Heterogeneous Types and `auto` vs `auto&&`

```cpp
auto tup = std::make_tuple(1, 2.0, std::string("three"));

auto [first, ...rest] = tup;
// `rest` is a pack of *copies*: double, std::string  (auto -> by value)

auto& [first_r, ...rest_r] = tup;
// `rest_r` is a pack of *references* into `tup`: double&, std::string&

auto&& [first_f, ...rest_f] = std::move(tup);
// `rest_f` is a pack of rvalue references, enabling moves out of `tup`
```

Because each element of the pack can have a *different* underlying type, `rest`/`rest_r`/`rest_f` are heterogeneous packs — you can fold-expression over them (`(use(rest), ...)`) but you cannot store them all in one homogeneous container without first converting to a common type or a `std::tuple`. And when the source has exactly one element, `...rest` legally binds to an **empty pack** — `sizeof...(rest) == 0` — which is well-formed but means any fold expression over `rest` silently does nothing rather than erroring.

---

#### Edge Case 4: `static` Structured Bindings and Initialization-Order Surprises

```cpp
std::pair<int, int> make_pair_with_side_effect() {
    std::cout << "computing pair\n";
    return {1, 2};
}

void f() {
    static auto [x, y] = make_pair_with_side_effect();
    // "computing pair" printed exactly ONCE, on first call to f(),
    // just like any other function-local static - the structured-binding
    // sugar doesn't change C++'s existing static-local initialization rules.
}
```

The pitfall isn't new semantics — it's that people sometimes *expect* new semantics because the syntax is new. A `static`/`thread_local` structured binding follows the exact same "initialized once, on first control flow through the declaration" and "destroyed in reverse order of construction at program/thread exit" rules as any other static or thread-local variable. Forgetting that a `static auto [x, y] = expensive_call();` inside a function only calls `expensive_call()` once (not once per invocation of the function) is the same classic static-local mistake C++ programmers have always had to watch for — it just now also applies to structured bindings.

---

#### Edge Case 5: `_` Placeholders Are Independent, Not a Shared Variable

```cpp
auto [_, count]  = get_pair_1();
auto [_, total]  = get_pair_2();   // ✅ OK - a second, independent placeholder

// std::cout << _;   // ❌ Error: ambiguous / ill-formed - which `_` do you mean?
```

The relaxation only permits *declaring* multiple `_`s in one scope without a redefinition error — it does **not** turn `_` into a single mutable shared variable you can read back later. Each `_` is its own unnamed entity that exists purely to satisfy "a name is required here," and the language does not let you refer to "the value of `_`" afterward, since with more than one active placeholder there would be no well-defined answer to *which* `_` you meant. If you need the value later, you must give it a real name — `_` communicates "I will never read this again," and the compiler holds you to that.

---

#### Edge Case 6: A Trivially-Relocatable Type That Secretly Isn't Safe

```cpp
struct Observer {
    void* tag;
    Observer() { tag = this; registry.add(this); }  // stores its OWN address externally
    ~Observer() { registry.remove(this); }
};

// Marking `Observer` trivially relocatable would be a bug, not an optimization:
// bulk-memcpy'ing it to a new address leaves `registry` holding a stale,
// dangling pointer to the OLD memory location - a real, silent memory-safety
// bug, not a compile error, because the opt-in trait is a *promise the
// programmer makes*, and the compiler generally cannot verify it for you.
```

This is the sharp edge of an opt-in feature: trivial relocatability is a contract the type author asserts, not something the compiler exhaustively proves in all cases. A type with any address-dependent state (external registries, intrusive linked-list nodes pointing at `this`, small-buffer-optimized storage pointing into itself) that is incorrectly marked trivially relocatable will *compile fine* and then corrupt memory only when a container actually reallocates — making this a "looks fine until the vector grows past its initial capacity" class of bug.

---

#### Edge Case 7: What Erroneous Behaviour Does *Not* Fix

```cpp
void still_dangerous() {
    int* p;              // uninitialized pointer
    // *p = 42;          // ❌ STILL full undefined behaviour - erroneous-behaviour
                         //    only covers reads of uninitialized TRIVIAL automatic
                         //    variables of certain types, not pointer dereferences,
                         //    not non-trivial types, and not writes through garbage
                         //    pointers.

    std::string s;       // default-constructed, NOT "uninitialized" in this sense -
                          // std::string's default constructor always runs and
                          // establishes a valid empty-string state; this was never
                          // the class of bug P2795 targets.
}
```

A common over-generalization is assuming P2795 makes uninitialized-variable bugs "safe" across the board. It narrowly targets one specific, extremely common pattern — reading a *trivial* automatic variable (like a bare `int`, `double`, or a trivial struct of such fields) before any initialization — and gives that specific read a fixed, diagnosable value instead of full UB. It says nothing about dereferencing wild pointers, calling member functions on non-trivial objects in a moved-from-but-not-reset state, or any of C++'s many other UB sources — those remain exactly as dangerous as before.

---

### CODE_EXAMPLES: Applying C++26 Language Features

#### Example 1: Pack Indexing Replacing a Recursive Type-Trait Helper

```cpp
#include <cstddef>
#include <iostream>

// ❌ Pre-C++26: recursive helper just to get the first/last pack element
template<std::size_t I, typename T, typename... Rest>
struct NthType : NthType<I - 1, Rest...> {};

template<typename T, typename... Rest>
struct NthType<0, T, Rest...> { using type = T; };

template<typename... Ts>
using OldFirst = typename NthType<0, Ts...>::type;

template<typename... Ts>
using OldLast = typename NthType<sizeof...(Ts) - 1, Ts...>::type;

// ✅ C++26: direct pack indexing, no helper template at all
template<typename... Ts>
using First = Ts...[0];

template<typename... Ts>
using Last = Ts...[sizeof...(Ts) - 1];

static_assert(std::is_same_v<OldFirst<int, double, char>, First<int, double, char>>);
static_assert(std::is_same_v<OldLast<int, double, char>,  Last<int, double, char>>);

int main() {
    std::cout << "First is int, Last is char - verified at compile time\n";
}
```

---

#### Example 2: Indexing a Function Parameter Pack Directly

```cpp
#include <iostream>
#include <string>

template<std::size_t N, typename... Args>
decltype(auto) nth_arg(Args&&... args) {
    return (args...[N]);   // parentheses: return by reference where possible
}

int main() {
    std::cout << nth_arg<0>(10, 20.5, "hello") << '\n';   // → 10
    std::cout << nth_arg<1>(10, 20.5, "hello") << '\n';   // → 20.5
    std::cout << nth_arg<2>(10, 20.5, "hello") << '\n';   // → hello
}
```

---

#### Example 3: Structured Binding Introducing a Pack Over a Tuple

```cpp
#include <tuple>
#include <iostream>

template<typename... Ts>
void describe(const std::tuple<Ts...>& t) {
    auto& [head, ...rest] = t;
    std::cout << "head = " << head
              << ", " << sizeof...(rest) << " more elements\n";
    (std::cout << ... << (rest, ' '));   // fold-print the remaining elements
    std::cout << '\n';
}

int main() {
    describe(std::make_tuple(1, 2.5, 3, 4));
    // head = 1, 3 more elements
    // 2.5 3 4
}
```

---

#### Example 4: A `static` Structured Binding for a Memoized Decomposition

```cpp
#include <utility>
#include <iostream>

std::pair<int, int> expensive_min_max(std::initializer_list<int> data) {
    std::cout << "(computing min/max)\n";
    auto [mn, mx] = std::pair{*data.begin(), *data.begin()};
    for (int v : data) { mn = std::min(mn, v); mx = std::max(mx, v); }
    return {mn, mx};
}

void report() {
    static auto [lo, hi] = expensive_min_max({4, 1, 9, 2, 7});
    std::cout << "range: [" << lo << ", " << hi << "]\n";
}

int main() {
    report();  // prints "(computing min/max)" then "range: [1, 9]"
    report();  // prints only "range: [1, 9]" - computed once, cached forever
    report();  // same
}
```

---

#### Example 5: Multiple `_` Placeholders for Intentionally-Unused Bindings

```cpp
#include <mutex>
#include <tuple>
#include <iostream>

std::tuple<int, int, int> get_triplet_1() { return {1, 2, 3}; }
std::tuple<int, int, int> get_triplet_2() { return {4, 5, 6}; }

std::mutex m1, m2;

void f() {
    // ❌ Before C++26 this required unique dummy names for every throwaway value
    auto [_, mid1, _] = get_triplet_1();   // ✅ C++26: both outer fields ignored
    auto [_, mid2, _] = get_triplet_2();   // ✅ another independent set of placeholders

    std::lock_guard<std::mutex> _(m1);     // RAII guard, name never needed
    std::lock_guard<std::mutex> _(m2);     // ✅ second guard, same scope, no clash

    std::cout << mid1 << ' ' << mid2 << '\n';  // → 2 5
}
```

---

#### Example 6: Trivially Relocatable vs. Self-Referential Types

```cpp
#include <memory>
#include <vector>
#include <iostream>

// Safe to relocate in bulk: no pointer/reference depends on this object's address.
struct Vec3 { double x, y, z; };

// Also safe: owns a pointer, doesn't point INTO itself.
struct Node { std::unique_ptr<int> payload; };

// NOT safe to mark trivially relocatable: `self` points into the object itself.
struct SelfPointing {
    char buffer[32] = {};
    char* self = buffer;   // address-dependent - memcpy would strand `self`
};

int main() {
    std::vector<Vec3> pts;
    for (int i = 0; i < 1000; ++i) pts.push_back({double(i), 0, 0});
    // Growth reallocations for Vec3-like trivially-relocatable types can use a
    // single bulk memory operation instead of 1000 individual move+destroy calls.

    std::cout << "pts.size() = " << pts.size() << '\n';
}
```

---

#### Example 7: Erroneous Behaviour for an Uninitialized Trivial Read

```cpp
#include <iostream>

int classify(bool seed_it) {
    int x;                  // trivial automatic variable, not initialized
    if (seed_it) x = 42;

    // Pre-C++26: reading `x` here when seed_it is false is full UB - the
    // optimizer may assume this branch is unreachable and generate
    // surprising, non-local miscompilations.
    //
    // C++26: the read instead yields a fixed, well-defined erroneous value,
    // and a conforming diagnostic build is encouraged/required to flag the
    // read of `x` as a bug - it does not silently vanish into "anything goes."
    return x;
}

int main() {
    std::cout << classify(true) << '\n';   // → 42, unaffected by the change
    // classify(false) exercises the erroneous-but-fixed-value path;
    // a real project should never rely on this - always initialize `x`.
}
```

---

---

### QUICK_REFERENCE: C++26 Language Features Cheat Sheet

#### Feature Summary

| Feature | Paper | Syntax | One-Line Purpose |
|---|---|---|---|
| Pack indexing | P2662 | `Ts...[i]` / `args...[i]` | Index a template/function parameter pack directly at compile time |
| Structured bindings introduce a pack | P1061 | `auto [head, ...rest] = x;` | Bind the first N elements and capture the remainder as a pack |
| `static`/`thread_local` structured bindings | (companion wording) | `static auto [a, b] = f();` | Structured bindings can now have static/thread storage duration |
| Placeholder variables `_` | P2169 | `auto [_, count] = f();` (repeatable) | Multiple `_` declarations coexist in one scope without redefinition errors |
| Trivial relocatability | P1144 / P2786 (merged) | opt-in trait/attribute (exact spelling still settling) | Lets containers bulk-memcpy eligible types instead of per-element move+destroy |
| Erroneous behaviour for uninitialized reads | P2795 | (no new syntax - a semantic change) | Reading an uninitialized trivial automatic variable yields a fixed, diagnosable value instead of full UB |

#### Syntax Quick Reference

```cpp
// Pack indexing (compile-time constant index only)
template<typename... Ts>
using First = Ts...[0];
template<typename... Ts>
using Last  = Ts...[sizeof...(Ts) - 1];

template<std::size_t N, typename... Args>
decltype(auto) nth_arg(Args&&... args) { return (args...[N]); }

// Structured bindings: pack + static/thread_local
auto& [head, ...rest] = some_tuple_like;   // rest is a pack
static auto [x, y] = get_pair();           // initialized once
thread_local auto [w, z] = get_pair();     // one instance per thread

// Placeholder variables - repeatable in one scope
auto [_, count] = get_pair_1();
auto [_, total] = get_pair_2();            // OK, independent placeholder
std::lock_guard<std::mutex> _(mtx);        // RAII guard, name never needed

// Trivial relocatability - illustrative only, exact spelling still settling
struct Point { double x, y, z; };          // eligible: no address-dependent state

// Erroneous behaviour - no new syntax, just a narrower semantic guarantee
int x;          // uninitialized trivial automatic variable
if (x == 42) {} // reads a fixed, diagnosable "erroneous" value, not full UB
```

#### When Each Feature Applies

| Situation | Reach for |
|---|---|
| Need the Nth type/argument out of a variadic template | Pack indexing (`Ts...[N]` / `args...[N]`) |
| Only care about the first element(s) of a tuple-like, want "the rest" without naming each | Structured-binding pack (`auto [head, ...rest] = x;`) |
| Want a structured binding to persist across calls or be per-thread | `static`/`thread_local` structured binding |
| Need several intentionally-unused bindings/guards in the same scope | `_` placeholders |
| Have a pointer-free, address-independent type stored in hot-path containers | Consider opting into trivial relocatability |
| Debugging a "worked in debug, broke in release" bug involving a plain `int`/`double` | Check for a read-before-initialization now caught as erroneous behaviour |

---

**End of Topic 4: C++26 Language Features**
