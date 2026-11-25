## TOPIC: std::variant, std::visit and std::any

### THEORY_SECTION: Core Concepts

#### 1. Mental model
- `std::variant<A, B, C>` (C++17) holds **exactly one** object whose type is one of a fixed, compile-time list. It is a type-safe tagged union: storage for the largest alternative plus an index saying which one is alive.
- `std::any` (C++17) holds **one object of any copyable type**, decided at run time. It is type erasure: the static type is gone, and you must ask for the exact type back with `any_cast`.
- Both are value types: copying copies the held object, destroying destroys it. Neither shares state.
- The key design question is **closed vs open set**:
  - Closed (all types known where the variant is declared): `std::variant`. The compiler checks that every type is handled.
  - Open (new types added later, by other modules): virtual functions, or `std::any` / `std::function` style type erasure.
- `std::optional<T>` (topic 03) behaves like a `variant<std::monostate, T>` with a friendlier interface.

#### 2. Storage and layout of variant
- The active alternative lives **inside** the variant object (no heap allocation by the variant itself). Size is roughly `max(sizeof(Ts...))` plus a small index, rounded up to the strictest alignment.
- The standard specifies the behaviour, not the layout. libstdc++ implements it as a recursive union of the alternatives plus an index of the smallest unsigned type that fits (`unsigned char` for fewer than 255 alternatives). "Tagged union semantics" is the safe way to describe it.

| Type | sizeof (libstdc++ / GCC, x86-64) |
|---|---|
| `variant<std::monostate, char>` | 2 |
| `variant<char, int>` | 8 |
| `variant<int, double>` | 16 |
| `variant<int, std::string>` | 40 (string is 32) |
| `std::any` | 16 (one pointer of storage + manager function pointer) |

- Triviality propagates: `variant<int, double>` is trivially copyable; `variant<int, std::string>` is not.
- An alternative's own heap use is unchanged: a `variant<int, std::string>` holding a long string still has the string's heap buffer.
- Not allowed as alternatives: references, arrays, `void`. At least one alternative is required (`variant<>` cannot be instantiated). Duplicate types are allowed but restrict the API (section 4).

#### 3. Construction and assignment
- Default construction value-initializes the **first** alternative: `variant<int, std::string> v;` holds `int` 0. If the first alternative is not default-constructible, the variant's default constructor is deleted. Fix: put `std::monostate` first ("empty" state) or reorder.
- Converting constructor `variant<Ts...> v = x;` picks the alternative by overload resolution, as if there were one function `F(T_i)` per alternative, with two filters (P0608, C++20 as a DR; GCC 10+):
  - Narrowing conversions are excluded: `variant<int, double> v = 1L;` does not compile (long to int and long to double are both narrowing).
  - `bool` is only chosen for an argument that is already `bool`: `variant<bool, std::string> v = "hello";` holds the string. Before P0608, the pointer-to-bool conversion won and it held `true`.
  - Ambiguity is a compile error: `variant<std::string, std::string_view> v = "x";` (both are user-defined conversions).
- Explicit selection: `std::variant<A, B> v{std::in_place_type<B>, args...}` or `{std::in_place_index<1>, args...}`; `v.emplace<B>(args...)` / `v.emplace<1>(args...)`.
- What assignment does to the held object:

| Operation | Same alternative already active | Different alternative active |
|---|---|---|
| `v = x` (converting) | `T_j`'s assignment operator | Destroy old, construct new (via a temporary + move when the move is `noexcept` and the direct construction might throw) |
| `v.emplace<T>(args)` | Destroy, then construct | Destroy, then construct |
| `v1 = v2` (variant copy) | Assign alternative | Destroy old, construct copy |

- Any reference, pointer or `get_if` result obtained before an alternative change refers to a dead object afterwards (general lifetime rules: Memory & Ownership, topic 01).

#### 4. Querying and accessing the active alternative

| API | Returns | On wrong alternative |
|---|---|---|
| `v.index()` | Zero-based index of the active alternative | `std::variant_npos` if valueless |
| `std::holds_alternative<T>(v)` | `bool` | `false` |
| `std::get<T>(v)` / `std::get<I>(v)` | Reference (`T&`, `const T&`, `T&&` by value category of `v`) | Throws `std::bad_variant_access` |
| `std::get_if<T>(&v)` / `std::get_if<I>(&v)` | Pointer to the alternative | `nullptr` |
| `std::visit(f, v...)` | `f(active alternative)` | Throws `bad_variant_access` only if valueless |

- `get_if` takes a **pointer** to the variant (`&v`), and returns a pointer: the idiom is `if (auto* p = std::get_if<int>(&v)) use(*p);`.
- With duplicate alternatives (`variant<int, int>`), `get<int>`, `get_if<int>` and `holds_alternative<int>` fail to compile ("T must occur exactly once in alternatives"); index-based access still works.
- Asking for a type that is not in the list at all (`get<float>` on `variant<int, double>`) is a compile error, not a runtime one.
- Type-level helpers: `std::variant_size_v<V>`, `std::variant_alternative_t<I, V>`.

#### 5. std::visit and the overloaded idiom
- `std::visit(visitor, v)` calls the visitor with the active alternative. The visitor must be callable with **every** alternative: a missing case is a compile error, which is the main safety benefit over `switch (v.index())`.
- Three ways to write the visitor:
  - A generic lambda with `if constexpr (std::is_same_v<std::decay_t<decltype(x)>, int>)` chains (an `else static_assert` branch catches missing types: see topic 11 for the `static_assert(false)` rules).
  - A struct with one `operator()` per type.
  - The **overloaded** idiom: one lambda per type, merged into one overload set:
```cpp
template <class... Ts> struct overloaded : Ts... { using Ts::operator()...; };
template <class... Ts> overloaded(Ts...) -> overloaded<Ts...>;   // needed in C++17 (and Clang < 17)
```
- In C++20 the deduction guide is optional (aggregate CTAD, P1816/P2082). Without it, C++17 compilers fail with "class template argument deduction failed".
- Compiler caveat: GCC 11 implements aggregate CTAD, but Clang only from version 17; Clang 14 in `-std=c++20` still fails ("no viable constructor or deduction guide"). Keep the guide in portable code.
- Return type: every call must return the same type, otherwise "std::visit requires the visitor to have the same return type for all alternatives of a variant". C++20 `std::visit<R>(f, v)` converts each result to `R`.
- Multiple variants: `std::visit(f, v1, v2)` calls `f(a, b)` for the active pair; the visitor must handle every combination (N x M overloads, or generic lambdas). Useful for state x event tables and double dispatch.
- Exhaustiveness has a hole: overload resolution still applies implicit conversions. A visitor with only `int` and `std::string` handlers compiles for `variant<int, double, std::string>`, and a `double` goes to the `int` handler (truncated). Generic `auto` handlers have the same effect for "everything else".

#### 6. How visit dispatches (and what it costs)
- The index is a run-time value, so dispatch is a run-time branch: implementations build a table of function pointers (one per alternative, or per combination for multi-variant visit) indexed by `index()`, or a `switch` for small variants.
- Compared with virtual dispatch:

| Aspect | `std::variant` + `visit` | Virtual functions |
|---|---|---|
| Set of types | Closed, known at declaration | Open, extendable later |
| Storage | In-place, no heap needed | Usually heap (`unique_ptr<Base>`) for polymorphic containers |
| Dispatch | Branch/jump on the stored index | Load vptr, load function pointer, indirect call |
| Adding a type | Edit the variant; every visitor fails to compile until updated | Add a class; old code untouched |
| Adding an operation | Write a new visitor; no type changes | Add a virtual to the base; every class may need updating |
| Memory for a container | `vector<variant<...>>`: contiguous, cache-friendly | `vector<unique_ptr<Base>>`: pointer chase per element |
| Size per object | Largest alternative, even for small ones | Only what the object needs (+ vptr) |

- Do not claim visit is "resolved at compile time": it is a run-time selection without a vptr. The optimizer can inline the handlers (they are visible lambdas), and when the index is known (constant propagation) the branch can disappear.
- The main performance win is usually memory layout (no heap per object, contiguous containers), not the dispatch instruction itself.

#### 7. valueless_by_exception
- A variant can end up holding **nothing** if an exception is thrown while switching alternatives: the old object has already been destroyed and the new one's construction throws.
- Then `v.valueless_by_exception()` is `true`, `v.index() == std::variant_npos`, `std::get` throws `bad_variant_access`, and `std::visit` throws `bad_variant_access` ("std::visit: variant is valueless" in libstdc++).
- When it can happen: converting assignment or `emplace` to a different alternative whose construction may throw. libstdc++ avoids it where possible: for converting assignment, if the new type is nothrow-move-constructible it first builds a temporary, then moves it in.
- Recovery: assign or `emplace` a new value; the variant is then normal again.
- Design rule: make alternatives nothrow-move-constructible and treat valueless as "the operation failed", not as a normal state. `std::monostate` is the deliberate empty state; valueless is the accidental one.

#### 8. std::any
- Holds one object of any **copy-constructible** type. `std::any a = std::make_unique<int>(1);` does not compile (move-only types are rejected), because `any` itself is copyable.
- Access requires the **exact** type (after decay, no conversions, no base classes):

| Form | Result | On mismatch |
|---|---|---|
| `std::any_cast<T>(a)` | A copy of the value | Throws `std::bad_any_cast` |
| `std::any_cast<T&>(a)` | Reference to the held object | Throws `std::bad_any_cast` |
| `std::any_cast<T>(&a)` | `T*` | `nullptr` |
| `a.type()` | `typeid` of the held type (`typeid(void)` when empty) | |
| `a.has_value()`, `a.reset()`, `std::make_any<T>(args)`, `a.emplace<T>(args)` | | |

- Decay applies on storage: `std::any a = "hello";` stores a `const char*`, so `any_cast<std::string>(a)` throws. `any a = 42;` holds an `int`, so `any_cast<long>(a)` fails.
- Small-object storage is implementation-specific. libstdc++ (GCC, x86-64): stored inline only if the type fits in one pointer-sized slot, has compatible alignment and is nothrow-move-constructible. So `any(42)`, `any(3.14)` and `any(int*)` do not allocate, but `any(std::string("x"))` (32 bytes) and `any(std::array<char,16>)` allocate once. libc++ and MSVC typically use larger inline buffers (libc++: 3 pointers; MSVC: several pointers, `sizeof(std::any)` is typically 64 on x64); do not rely on either.
- Copying an `any` deep-copies the held object (through a type-erased "manager" function): it is never shared.
- Where it fits: heterogeneous property bags at API boundaries, plugin payloads, passing user data through a library that cannot know the type. In most application code, `variant` (closed set) or a virtual interface (open set with behaviour) is better: `any` gives no compile-time checking and every access is a run-time type comparison.
- `void*` vs `any`: `any` owns and destroys its object and checks the type on access; `void*` does neither.

#### 9. Choosing among optional, variant, any and inheritance

| Need | Use |
|---|---|
| A value or nothing | `std::optional<T>` |
| A value or an error | `std::expected<T, E>` (topic 03) |
| One of a fixed list of types, handled exhaustively | `std::variant<Ts...>` + `std::visit` |
| Message/event type in a protocol with a known set of messages | `std::variant` |
| Types added by other modules or plugins, common behaviour | Virtual base class (or a type-erased wrapper like `std::function`) |
| Arbitrary user payload passed through untouched | `std::any` |
| Thread sharing | None of these are thread-safe; reassigning while another thread reads is a data race (see Concurrency chapter) |

#### 10. Misconceptions to unlearn
- ❌ "`std::variant` allocates the alternative on the heap." ✅ It lives in-place in the variant; size is the largest alternative plus an index.
- ❌ "variant is just a C union." ✅ It tracks the active type, runs the right constructors and destructors, and checks access; a plain union does none of that.
- ❌ "`std::visit` is resolved at compile time." ✅ It branches on the run-time index (no vptr), and the handlers can be inlined.
- ❌ "If my visitor compiles, every type is handled correctly." ✅ Implicit conversions (double to int) and catch-all `auto` handlers can silently absorb alternatives.
- ❌ "`variant<bool, std::string> v = "x";` holds bool." ✅ Since P0608 (GCC 10+ and current libc++ and MSVC) it holds the string; older libraries chose bool.
- ❌ "A variant can never be empty." ✅ It can be valueless after a throwing alternative change; use `monostate` for an intentional empty state.
- ❌ "`get<T>` returns nullptr on the wrong type." ✅ `get` throws `bad_variant_access`; `get_if` returns nullptr.
- ❌ "`std::any` stores small strings inline." ✅ libstdc++ stores only pointer-sized, nothrow-movable types inline; a `std::string` always allocates there.
- ❌ "`any_cast` converts between compatible types." ✅ It requires the exact stored type: `"hi"` is stored as `const char*`.
- ❌ "variant is always faster than virtual functions." ✅ It wins on layout and allocation; dispatch cost is similar; a variant with one huge alternative wastes memory for all elements.

### EDGE_CASES: Traps and Misconceptions

#### Edge Case 1: A string literal picks a surprising alternative
- `std::variant<bool, std::string> v = "hello";`
  - C++17 as published: `const char*` to `bool` is a standard conversion and beats the user-defined conversion to `std::string`, so it held `true`.
  - After P0608 (adopted for C++20; GCC 10+ and libc++ also apply it in C++17 mode; MSVC first enabled it only for `/std:c++20` and extended it to C++17 later): pointer-to-bool is excluded, so it holds the string (`index() == 1` on GCC 11 in both `-std=c++17` and `-std=c++20`).
- `std::variant<std::string, const char*> v = "x";` holds the `const char*` (exact match after decay), not the string.
- `std::variant<std::string, std::string_view> v = "x";` does not compile: two user-defined conversions, ambiguous.
- Rule: when the alternative matters, say it: `v = std::string("hello");` or `v.emplace<std::string>("hello");`.

#### Edge Case 2: Narrowing is excluded, so "obvious" conversions fail
- `std::variant<int, double> v = 1L;` is a compile error: both `long → int` and `long → double` are narrowing, so no alternative is viable ("conversion from 'long int' to non-scalar type ... requested").
- `std::variant<float, double> v = 1;` fails for the same reason (int to float/double is narrowing for a non-constant source inside the library check).
- `std::variant<long, double> v = 1;` holds `long` (int to long is not narrowing).
- `std::variant<int, long> v = 1u;` holds `long` on x86-64 Linux (`unsigned` → `int` narrows, `unsigned` → 64-bit `long` does not). Platform-dependent: with a 32-bit `long` it would not compile.

#### Edge Case 3: Duplicate alternatives disable type-based access
- `std::variant<int, int>` is legal (two distinct "slots" with the same type, e.g. "bid qty" vs "ask qty").
- `std::get<int>(v)`, `get_if<int>`, `holds_alternative<int>` and `v = 5` do not compile ("T must occur exactly once in alternatives" / ambiguous).
- Use indices: `std::get<0>(v)`, `v.emplace<1>(5)`, `std::in_place_index<1>`.
- Better design: wrap in distinct types (`struct BidQty { int v; }; struct AskQty { int v; };`) so the meaning is in the type.

#### Edge Case 4: The first alternative decides default construction
- `std::variant<Order, int> v;` needs `Order` to be default-constructible; otherwise "use of deleted function 'std::variant<...>::variant()'".
- Even when it compiles, the default state is "a default `Order`", which may be meaningless.
- `std::variant<std::monostate, Order, int>` gives an explicit "nothing yet" state; `std::holds_alternative<std::monostate>(v)` tests for it and visitors must handle it.

#### Edge Case 5: References into a variant die when the alternative changes
- `int& r = std::get<int>(v); v = std::string("x");` destroys the `int` object; `r` now refers to storage occupied by a `std::string`. Reading it is UB, and writing through it corrupts the string.
- Same for pointers from `get_if` and references captured inside a visitor that are kept after the visit.
- Assigning a new value of the **same** alternative keeps the object alive (assignment), so references stay valid then. This asymmetry makes the bug intermittent.
- Shared between threads, a reassignment while another thread holds such a reference is a data race as well as a lifetime bug.

#### Edge Case 6: valueless_by_exception
- If constructing the new alternative throws after the old one was destroyed, the variant holds nothing: `index() == variant_npos`.
- Every access then fails: `get` and `visit` throw `std::bad_variant_access`, `holds_alternative` is false for every type.
- Code that assumes "a variant always has a value" (e.g. a `switch (v.index())` without a default) silently does nothing or indexes out of range.
- Avoid by keeping alternatives nothrow-move-constructible (libstdc++ then builds the new value in a temporary first). Check `valueless_by_exception()` in recovery paths.

#### Edge Case 7: Visitors with different return types, and conversions that hide missing cases
- `std::visit([](auto& x) { return x; }, variant<int, std::string>{})` fails: "std::visit requires the visitor to have the same return type for all alternatives of a variant".
- Fix with an explicit return type on the lambda, or C++20 `std::visit<R>(...)`.
- Opposite problem: a visitor built with `overloaded{[](int){...}, [](const std::string&){...}}` compiles for `variant<int, double, std::string>`: the `double` alternative converts to `int`. Exhaustiveness is checked by overload resolution, not by exact type.
- Defence: add a generic guard handler. Exact non-template handlers still win for their own types, and the template catches everything else at compile time:
```cpp
[](const auto& x) { static_assert(sizeof(x) == 0, "unhandled alternative"); }
```
- With that guard the `double` case fails to compile with "static assertion failed: unhandled alternative" (GCC 11).

#### Edge Case 8: any_cast wants the exact decayed type
- `std::any a = "hello";` stores `const char*`. `any_cast<std::string>(a)` throws `bad_any_cast`; `any_cast<const char*>(a)` works.
- `std::any b = 42;` stores `int`; `any_cast<long>(b)` throws, `any_cast<unsigned>(b)` throws.
- `std::any c = derived_object;` stores `Derived`; `any_cast<Base&>(c)` throws: no base-class lookup.
- `any_cast<T>(a)` (by value) copies the whole object each time; use `any_cast<T&>` or the pointer form for large objects.

#### Edge Case 9: any rejects move-only types and may allocate
- `std::any a = std::make_unique<int>(5);` fails: "conversion from 'std::unique_ptr<int>' to non-scalar type 'std::any' requested". `any` must be copyable, so its content must be copy-constructible. Wrap in `std::shared_ptr` if needed.
- Allocation (libstdc++): inline only for pointer-sized, nothrow-movable types. A type with a throwing move, or anything larger than 8 bytes (including `std::string`), is heap-allocated on every construction and copy.
- On hot paths a variant (closed set) avoids both the allocation and the run-time type comparison.

### CODE_EXAMPLES: Practical Demonstrations

#### Example 1: An event type with visit and the overloaded idiom
- A closed set of messages; adding a new message type makes every visitor that lacks a handler fail to compile.
```cpp
#include <iostream>
#include <string>
#include <variant>
#include <vector>

struct NewOrder { int id; int qty; double price; };
struct Cancel   { int id; };
struct Heartbeat {};

using Event = std::variant<NewOrder, Cancel, Heartbeat>;

template <class... Ts> struct overloaded : Ts... { using Ts::operator()...; };
template <class... Ts> overloaded(Ts...) -> overloaded<Ts...>;   // C++17 (and Clang < 17)

int main() {
    std::vector<Event> events{NewOrder{1, 100, 9.5}, Heartbeat{}, Cancel{1}};
    int live = 0;
    for (const Event& e : events) {
        std::visit(overloaded{
            [&](const NewOrder& o) {
                ++live;
                std::cout << "new " << o.id << " x" << o.qty << '\n';
            },
            [&](const Cancel& c)   { --live; std::cout << "cancel " << c.id << '\n'; },
            [](const Heartbeat&)   { std::cout << "heartbeat\n"; },
        }, e);
    }
    std::cout << "live orders: " << live << '\n';
    std::cout << "sizeof(Event) = " << sizeof(Event) << '\n';
}
```
- Output:
```
new 1 x100
heartbeat
cancel 1
live orders: 0
sizeof(Event) = 24
```
- `sizeof(Event)` is 24 on libstdc++ / GCC, x86-64: `NewOrder` is 16 bytes, plus the index, rounded to alignment 8.
- The events are stored contiguously in the vector: no heap allocation per event, unlike `vector<unique_ptr<EventBase>>`.

#### Example 2: The access APIs side by side
- `index`, `holds_alternative`, `get` (throws) and `get_if` (pointer) on the same variant.
```cpp
#include <iostream>
#include <string>
#include <variant>

int main() {
    std::variant<int, std::string> v = 42;
    std::cout << "index " << v.index()
              << ", holds int " << std::holds_alternative<int>(v) << '\n';

    if (auto* p = std::get_if<int>(&v)) std::cout << "get_if<int> -> " << *p << '\n';
    if (std::get_if<std::string>(&v) == nullptr)
        std::cout << "get_if<string> -> nullptr\n";

    try {
        std::cout << std::get<std::string>(v) << '\n';
    } catch (const std::bad_variant_access& e) {
        std::cout << "get<string> threw: " << e.what() << '\n';
    }

    v = std::string("hello");
    std::cout << "index " << v.index() << ", get<1> -> " << std::get<1>(v) << '\n';
}
```
- Output (the `what()` text is libstdc++'s):
```
index 0, holds int 1
get_if<int> -> 42
get_if<string> -> nullptr
get<string> threw: std::get: wrong index for variant
index 1, get<1> -> hello
```

#### Example 3: What assignment does to the held object
- Same alternative: assignment. Different alternative: destroy, then construct. `emplace`: always construct.
```cpp
#include <iostream>
#include <string>
#include <variant>

struct Quote {
    std::string sym;
    Quote(const char* s) : sym(s) { std::cout << "  ctor " << sym << '\n'; }
    Quote(Quote&& o) noexcept : sym(o.sym) { std::cout << "  move-ctor " << sym << '\n'; }
    Quote& operator=(Quote&& o) noexcept {
        sym = o.sym;
        std::cout << "  move-assign " << sym << '\n';
        return *this;
    }
    ~Quote() { std::cout << "  dtor " << sym << '\n'; }
};

int main() {
    std::variant<int, Quote> v;              // holds int 0
    std::cout << "int -> Quote\n";
    v = Quote("A");
    std::cout << "Quote -> Quote\n";
    v = Quote("B");
    std::cout << "Quote -> int\n";
    v = 7;
    std::cout << "emplace\n";
    v.emplace<Quote>("C");
    std::cout << "end\n";
}
```
- Output:
```
int -> Quote
  ctor A
  move-ctor A
  dtor A
Quote -> Quote
  ctor B
  move-assign B
  dtor B
Quote -> int
  dtor B
emplace
  ctor C
end
  dtor C
```
- The `dtor A` / `dtor B` after a move are the temporaries; the held objects die on "Quote -> int" and at the end of `main`.

#### Example 4: valueless_by_exception in action
- The old alternative is destroyed, then the new one's copy constructor throws.
```cpp
#include <iostream>
#include <stdexcept>
#include <string>
#include <variant>

struct Fragile {
    Fragile() = default;
    Fragile(const Fragile&) { throw std::runtime_error("copy failed"); }
};

int main() {
    std::variant<std::string, Fragile> v = std::string("state");
    Fragile f;
    try {
        v = f;                                  // destroy string, copy Fragile: throws
    } catch (const std::exception& e) {
        std::cout << "caught: " << e.what() << '\n';
    }
    std::cout << "valueless " << v.valueless_by_exception()
              << ", index is npos " << (v.index() == std::variant_npos) << '\n';
    try {
        std::visit([](auto&) {}, v);
    } catch (const std::bad_variant_access& e) {
        std::cout << "visit threw: " << e.what() << '\n';
    }
    v = std::string("recovered");
    std::cout << "after reassign: " << std::get<std::string>(v) << '\n';
}
```
- Output (`what()` texts are libstdc++'s):
```
caught: copy failed
valueless 1, index is npos 1
visit threw: std::visit: variant is valueless
after reassign: recovered
```
- `Fragile` has a user-declared copy constructor, so it has no move constructor: libstdc++ cannot use the "build a temporary, then move" path and constructs in place after destroying the string.

#### Example 5: A state machine with double dispatch (visit over two variants)
- States and events are types; `visit(f, state, event)` selects the handler for the pair.
```cpp
#include <iostream>
#include <variant>

struct Disconnected {};
struct Connecting { int attempt; };
struct Connected {};

struct Connect {};
struct Ok {};
struct Fail {};

using State = std::variant<Disconnected, Connecting, Connected>;
using Event = std::variant<Connect, Ok, Fail>;

template <class... Ts> struct overloaded : Ts... { using Ts::operator()...; };
template <class... Ts> overloaded(Ts...) -> overloaded<Ts...>;

State step(const State& s, const Event& e) {
    return std::visit(overloaded{
        [](Disconnected, Connect) -> State { return Connecting{1}; },
        [](Connecting c, Fail) -> State {
            if (c.attempt < 3) return Connecting{c.attempt + 1};
            return Disconnected{};
        },
        [](Connecting, Ok) -> State { return Connected{}; },
        [](Connected, Fail) -> State { return Disconnected{}; },
        [](const auto& st, const auto&) -> State { return st; },   // ignore others
    }, s, e);
}

const char* name(const State& s) {
    static const char* names[] = {"Disconnected", "Connecting", "Connected"};
    return names[s.index()];
}

int main() {
    State s;
    const Event script[] = {Connect{}, Fail{}, Fail{}, Ok{}, Connect{}};
    for (const Event& e : script) {
        s = step(s, e);
        std::cout << name(s);
        if (auto* c = std::get_if<Connecting>(&s))
            std::cout << " (attempt " << c->attempt << ')';
        std::cout << '\n';
    }
}
```
- Output:
```
Connecting (attempt 1)
Connecting (attempt 2)
Connecting (attempt 3)
Connected
Connected
```
- The catch-all `auto` handler keeps the table small, but it also hides combinations that should have been handled: a deliberate trade-off.
- Each handler states `-> State` so that all 9 combinations return the same type.

#### Example 6: std::any: exact-type access and where it allocates
- A property bag keyed by name; `any_cast` forms and a global allocation counter.
```cpp
#include <any>
#include <array>
#include <cstdio>
#include <cstdlib>
#include <map>
#include <new>
#include <string>

static int allocs = 0;
void* operator new(std::size_t n) {
    ++allocs;
    if (void* p = std::malloc(n)) return p;
    throw std::bad_alloc{};
}
void operator delete(void* p) noexcept { std::free(p); }
void operator delete(void* p, std::size_t) noexcept { std::free(p); }

template <class T>
void count(const char* label, T value) {
    int before = allocs;
    std::any a = value;
    std::printf("%-22s allocations: %d\n", label, allocs - before);
}

int main() {
    count("any(int)", 42);
    count("any(double)", 3.14);
    count("any(std::string \"x\")", std::string("x"));
    count("any(array<char,16>)", std::array<char, 16>{});

    std::map<std::string, std::any> props;
    props["qty"] = 100;
    props["name"] = "widget";                     // stored as const char*

    std::printf("qty = %d\n", std::any_cast<int>(props["qty"]));
    if (auto* p = std::any_cast<const char*>(&props["name"]))
        std::printf("name = %s\n", *p);
    try {
        std::any_cast<std::string>(props["name"]);
    } catch (const std::bad_any_cast& e) {
        std::printf("any_cast<std::string>: %s\n", e.what());
    }
}
```
- Output (libstdc++ / GCC, x86-64):
```
any(int)               allocations: 0
any(double)            allocations: 0
any(std::string "x")   allocations: 1
any(array<char,16>)    allocations: 1
qty = 100
name = widget
any_cast<std::string>: bad any_cast
```
- The `std::string` case allocates for the `any`'s storage (the string is 32 bytes), not for the one-character text, which fits in SSO.
- Other standard libraries have larger inline buffers; the rule "small types are inline" is not portable.

#### Example 7: The same shapes with variant and with virtual functions
- Same behaviour, different trade-offs: contiguous values vs heap objects behind pointers.
```cpp
#include <iostream>
#include <memory>
#include <variant>
#include <vector>

// Closed set: variant
struct Circle { double r; };
struct Rect { double w, h; };
using Shape = std::variant<Circle, Rect>;

double area(const Shape& s) {
    struct Visitor {
        double operator()(const Circle& c) const { return 3.0 * c.r * c.r; }
        double operator()(const Rect& r) const { return r.w * r.h; }
    };
    return std::visit(Visitor{}, s);
}

// Open set: virtual
struct ShapeBase {
    virtual ~ShapeBase() = default;
    virtual double area() const = 0;
};
struct CircleV : ShapeBase {
    double r;
    explicit CircleV(double x) : r(x) {}
    double area() const override { return 3.0 * r * r; }
};
struct RectV : ShapeBase {
    double w, h;
    RectV(double a, double b) : w(a), h(b) {}
    double area() const override { return w * h; }
};

int main() {
    std::vector<Shape> a{Circle{1}, Rect{2, 3}};
    std::vector<std::unique_ptr<ShapeBase>> b;
    b.push_back(std::make_unique<CircleV>(1));
    b.push_back(std::make_unique<RectV>(2, 3));

    double sa = 0, sb = 0;
    for (const auto& s : a) sa += area(s);
    for (const auto& s : b) sb += s->area();
    std::cout << sa << ' ' << sb << '\n';
    std::cout << "sizeof(Shape)=" << sizeof(Shape)
              << " sizeof(RectV)=" << sizeof(RectV) << '\n';
}
```
- Output (sizes: libstdc++ / GCC, x86-64):
```
9 9
sizeof(Shape)=24 sizeof(RectV)=24
```
- Variant: elements live in the vector itself; adding `Triangle` forces every visitor to be updated (compile errors guide you).
- Virtual: one heap allocation per shape and a pointer chase per call; adding `Triangle` needs no change to existing code, but adding a new operation touches every class.

### QUICK_REFERENCE: Cheat Sheet

#### variant API
| Expression | Result |
|---|---|
| `variant<A, B> v;` | Holds value-initialized `A` (deleted if `A` not default-constructible) |
| `v = x;` | Picks alternative by overload resolution, no narrowing, bool only from bool |
| `v.emplace<T>(args)` / `emplace<I>` | Destroy current, construct in place |
| `v.index()` | Active index, `variant_npos` if valueless |
| `holds_alternative<T>(v)` | `bool` |
| `get<T>(v)` / `get<I>(v)` | Reference, throws `bad_variant_access` |
| `get_if<T>(&v)` | Pointer or `nullptr` (takes `&v`) |
| `visit(f, v1, v2...)` | Calls `f` with active alternatives; same return type required |
| `visit<R>(f, v)` (C++20) | Converts results to `R` |
| `std::monostate` | Explicit empty alternative |

#### Compile errors you should recognize
| Code | Why |
|---|---|
| `variant<int, double> v = 1L;` | Both conversions narrow |
| `variant<string, string_view> v = "x";` | Ambiguous |
| `get<int>(variant<int, int>)` | Type occurs twice |
| `variant<NoDefault, int> v;` | First alternative not default-constructible |
| `variant<int&>` | References not allowed |
| visitor returns `int` and `string` | Return types differ |
| `std::any a = std::make_unique<int>(1);` | `any` needs copyable contents |

#### Implementation facts (libstdc++ / GCC, x86-64, not guaranteed by C++)
| Fact | Value |
|---|---|
| `sizeof(variant<int, std::string>)` | 40 |
| `sizeof(variant<char, int>)` | 8 |
| Index type | Smallest unsigned type that fits (1 byte for < 255 alternatives) |
| `sizeof(std::any)` | 16 |
| `any` inline storage | Types of at most 8 bytes, suitable alignment, nothrow move |
| `any(std::string)` | 1 allocation |
| P0608 (`variant<bool, string> = "x"` → string) | GCC 10+, also in `-std=c++17` mode |

#### Interview one-liners
| Question | Answer |
|---|---|
| Where is a variant's value stored? | In-place, inside the variant; no heap |
| How does variant know the active type? | A stored index |
| `get` vs `get_if`? | Reference + throw vs pointer + nullptr |
| Why `std::visit` over `switch(index())`? | Compile-time check that every type is handled |
| Is visit compile-time dispatch? | No; run-time branch on the index, no vptr |
| variant vs virtual? | Closed set, in-place, easy new operations vs open set, heap, easy new types |
| What is `monostate`? | An intentional empty alternative |
| What is valueless_by_exception? | Old value destroyed, new construction threw: no value |
| `variant<bool, string> v = "hi"`? | string (since P0608) |
| any vs variant? | Run-time open type erasure vs compile-time closed set |
| `any a = "hi"; any_cast<string>(a)`? | Throws: stored type is `const char*` |
| Does any allocate? | Implementation-specific; libstdc++ inline only for pointer-sized nothrow-movable types |
