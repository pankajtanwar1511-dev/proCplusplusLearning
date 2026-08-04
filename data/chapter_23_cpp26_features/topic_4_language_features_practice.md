## TOPIC: C++26 Language Features - Core Language Improvements

### PRACTICE_TASKS: Bug Analysis Across Pack Indexing, Structured Bindings, Placeholders, and Relocation

#### Q1
```cpp
template<typename... Ts>
using Third = Ts...[2];

using Bad = Third<int, double>;  // Bug: only 2 types supplied!

int main() {
    return 0;
}
```

**Answer:**
```
Compilation error: pack index 2 is out of bounds for a pack of size 2
```

**Explanation:**
- `Ts...[2]` asks for the element at index 2 (the 3rd element)
- `Third<int, double>` only supplies a pack of size 2 (indices 0 and 1 valid)
- The compiler rejects this at the exact point of instantiation, pointing at the indexing expression itself
- Unlike the old recursive-template `NthType` approach, there's no deep instantiation backtrace to dig through
- **Key Concept:** Pack indexing (P2662) is bounds-checked at compile time against the pack's actual size; an out-of-range index is ill-formed, not silently truncated or wrapped

**Fixed Version:**
```cpp
template<typename... Ts>
using Third = Ts...[2];

using Ok = Third<int, double, char>;  // 3 types supplied, index 2 -> char

int main() {
    return 0;
}
```

---

#### Q2
```cpp
template<typename... Args>
auto pick(std::size_t n, Args&&... args) {
    return args...[n];  // Bug: n is a runtime parameter!
}

int main() {
    return pick(1, 10, 20.5, "hi");
}
```

**Answer:**
```
Compilation error: pack index must be a constant expression
```

**Explanation:**
- `args...[n]` requires `n` to be a compile-time constant expression
- Here `n` is an ordinary runtime function parameter (`std::size_t n`), whose value isn't known until the function actually runs
- Pack indexing operates on the pack itself, which is a compile-time construct (fixed length, fixed per-element type/value at instantiation) — it is not `operator[]` on a runtime array
- **Key Concept:** `Ts...[i]` / `args...[i]` requires a constant-expression index; a template non-type parameter, `if constexpr` branch, or `sizeof...`-derived constant works, an ordinary runtime variable does not

**Fixed Version:**
```cpp
template<std::size_t N, typename... Args>
auto pick(Args&&... args) {
    return args...[N];  // N is a template parameter - compile-time constant
}

int main() {
    return static_cast<int>(pick<1>(10, 20.5, "hi"));  // OK -> 20.5 truncated to int
}
```

---

#### Q3
```cpp
#include <tuple>
#include <vector>
#include <string>

auto tup = std::make_tuple(1, 2.5, std::string("three"));

std::vector<int> collect_rest() {
    auto [first, ...rest] = tup;
    std::vector<int> v;
    // Bug: rest is a heterogeneous pack (double, std::string) -
    // it cannot be dumped directly into a homogeneous std::vector<int>!
    (v.push_back(rest), ...);
    return v;
}
```

**Answer:**
```
Compilation error: no viable conversion from 'double'/'std::string' pack elements to int for push_back
```

**Explanation:**
- `...rest` in `auto [first, ...rest] = tup;` captures "everything after `first`" as a pack
- Because `tup`'s remaining elements have *different* types (`double`, `std::string`), `rest` is a **heterogeneous** pack, not a homogeneous collection
- A fold-expression like `(v.push_back(rest), ...)` expands to `v.push_back(2.5); v.push_back(std::string("three"));` — neither of which matches `std::vector<int>::push_back(int)` for the string case, and even the double case is a narrowing/implicit-conversion smell
- Structured-binding packs compose with fold-expressions (calling a function on each element), but they don't automatically become a single runtime container you can bulk-insert into
- **Key Concept:** A pack introduced by a structured binding (P1061) can hold elements of different types; treat it like any other heterogeneous parameter pack (fold-expressions, `if constexpr` per-element handling), not like a homogeneous runtime container

**Fixed Version:**
```cpp
#include <tuple>
#include <iostream>
#include <string>

auto tup = std::make_tuple(1, 2.5, std::string("three"));

void print_rest() {
    auto& [first, ...rest] = tup;
    std::cout << "first = " << first << ", rest: ";
    (std::cout << ... << (rest, ' '));  // fold-print each heterogeneous element
    std::cout << '\n';
}
```

---

#### Q4
```cpp
#include <tuple>

std::tuple<> get_empty();

void f() {
    auto [...rest] = get_empty();  // Bug (assumed): binding an empty tuple?
    (process(rest), ...);          // does this even compile?
}
```

**Answer:**
```
Compiles fine: rest is a valid, empty pack (sizeof...(rest) == 0); the fold expands to nothing
```

**Explanation:**
- `...rest` binding the entirety of an empty `std::tuple<>` legally produces an **empty pack** — `sizeof...(rest) == 0`
- This is well-formed, not an error; it's a common point of confusion since people expect a pack to always have "at least one" element
- `(process(rest), ...)` is a fold expression using the comma operator; over an empty pack it simply expands to nothing at all — no calls to `process` happen, and no error occurs
- The pitfall is *silent* no-op behavior, not a compile error — code that assumes `process` was called at least once could have a latent logic bug
- **Key Concept:** A structured-binding pack can legitimately be empty; fold expressions over an empty pack are well-formed and simply produce no expansion, which can silently skip logic the author assumed would always run

**Fixed Version:**
```cpp
#include <tuple>
#include <iostream>

std::tuple<> get_empty();

template<typename... Rest>
void process(Rest&&...);

void f() {
    auto [...rest] = get_empty();
    if constexpr (sizeof...(rest) == 0) {
        std::cout << "note: rest is empty, nothing to process\n";
    } else {
        (process(rest), ...);
    }
}
```

---

#### Q5
```cpp
#include <utility>
#include <iostream>

std::pair<int, int> compute_once() {
    std::cout << "computing...\n";
    return {1, 2};
}

void f() {
    // Bug (assumed): "surely this recomputes on every call to f()?"
    static auto [x, y] = compute_once();
    std::cout << x + y << '\n';
}

int main() {
    f();
    f();
    f();
}
```

**Answer:**
```
"computing..." is printed exactly ONCE (on the first call to f()), then "3" is printed three times
```

**Explanation:**
- A `static` structured binding follows the exact same initialization rule as any other function-local `static` variable: initialized once, the first time control passes through the declaration, and never again for the lifetime of the program
- `compute_once()` therefore only actually runs on the first call to `f()`; the second and third calls skip straight past the (already-initialized) `static` declaration
- This isn't new or surprising behavior for `static` locals in general — the surprise only comes from assuming the new structured-binding *syntax* implies new semantics, when it doesn't
- **Key Concept:** `static`/`thread_local` structured bindings (C++26) follow the pre-existing static/thread-local-storage initialization rules exactly; the right-hand-side expression runs once, not once per call

**Fixed Version:**
```cpp
// If you actually want fresh computation on every call, don't use `static`:
void f_recompute_each_time() {
    auto [x, y] = compute_once();  // runs on every call, as expected
    std::cout << x + y << '\n';
}
```

---

#### Q6
```cpp
#include <utility>
#include <thread>
#include <iostream>

std::pair<int, int> get_pair();

void worker() {
    // Bug (assumed): "thread_local means every thread computes and shares the SAME values"
    thread_local auto [x, y] = get_pair();
    std::cout << x + y << '\n';
}

int main() {
    std::thread t1(worker);
    std::thread t2(worker);
    t1.join();
    t2.join();
}
```

**Answer:**
```
get_pair() runs ONCE PER THREAD (once for t1's worker, once for t2's worker) - values are NOT shared across threads
```

**Explanation:**
- `thread_local` means each thread gets its own independent instance of `x`/`y`, each initialized once *for that thread* the first time the declaration is reached on it
- This is the opposite of sharing: `t1` and `t2` each compute and store their own `x, y` pair completely independently — there is no cross-thread synchronization or shared state implied by `thread_local`
- The common confusion is mixing up `thread_local` (one instance per thread) with `static` at namespace/class scope shared across a whole program (one instance, period)
- **Key Concept:** `thread_local` structured bindings (C++26) give each thread its own independently-initialized copy; they do not create a single value shared across threads the way an ordinary `static` at broader scope would

**Fixed Version:**
```cpp
// If you actually want ONE shared pair computed once across all threads,
// use an ordinary function-local static plus explicit synchronization
// for the one-time computation (e.g. std::call_once), not thread_local:
#include <mutex>

std::pair<int, int> get_pair();

void worker_shared() {
    static std::once_flag flag;
    static std::pair<int, int> shared_pair;
    std::call_once(flag, [] { shared_pair = get_pair(); });
    std::cout << shared_pair.first + shared_pair.second << '\n';
}
```

---

#### Q7
```cpp
#include <utility>
#include <iostream>

std::pair<int, int> get_pair_1();
std::pair<int, int> get_pair_2();

void f() {
    auto [_, count] = get_pair_1();
    auto [_, total] = get_pair_2();

    // Bug: trying to read "_" back as if it were one shared variable
    std::cout << _ << '\n';
}
```

**Answer:**
```
Compilation error: '_' is ambiguous / not a referenceable name here
```

**Explanation:**
- C++26's relaxation (P2169) only permits *declaring* multiple `_` placeholders in the same scope without a redefinition error
- It does **not** turn `_` into a single named variable whose value persists and can be read back later
- With two independent `_` placeholders active in the same scope, there is no well-defined answer to "which `_`'s value do you mean" — so the language simply does not let you refer to `_` as an expression afterward
- **Key Concept:** `_` communicates "I will never need this value again"; the compiler enforces that intent by making the placeholder non-referenceable, not by aliasing it to whichever `_` was declared most recently

**Fixed Version:**
```cpp
#include <utility>
#include <iostream>

std::pair<int, int> get_pair_1();
std::pair<int, int> get_pair_2();

void f() {
    // Give it a real name if you actually need to read it back later.
    auto [ignored1, count] = get_pair_1();
    auto [_, total] = get_pair_2();   // still fine to throw this one away

    std::cout << count << '\n';       // use the real name, not '_'
}
```

---

#### Q8
```cpp
#include <mutex>

std::mutex m1, m2;

void critical_section() {
    std::lock_guard<std::mutex> _(m1);
    {
        // Bug (assumed): "this inner _ will conflict with the outer one"
        std::lock_guard<std::mutex> _(m2);
        // ... both m1 and m2 held here ...
    }  // inner guard (m2) released here
}  // outer guard (m1) released here
```

**Answer:**
```
Compiles and behaves correctly: both locks are held simultaneously, released in reverse order, no conflict
```

**Explanation:**
- Even though both RAII guards are named `_`, they are declared in **different, nested scopes** — one in `critical_section`'s body, one in the inner block
- Each `_` is its own independent placeholder entity regardless of whether it shares a scope with another `_` or is in a nested scope; there was never an actual naming conflict here even under pre-C++26 rules for this *particular* nested-scope case
- The genuinely new C++26 capability being exercised is having multiple `_`s available for reuse in the same scope (as in Q7) — nesting scopes already worked, but this example is included because people sometimes second-guess even the safe, already-legal nested case once they've learned "duplicate names are now allowed" without checking which restriction was actually lifted
- **Key Concept:** Placeholder-name relaxation is about permitting redeclaration of `_` within the *same* scope; ordinary scoping rules (inner scopes can already shadow/reuse names from outer scopes) were never the problem, and continue to apply normally alongside the new same-scope allowance

**Fixed Version:**
```cpp
// No fix needed - the original snippet is correct C++26 (and was already
// legal nested-scope behavior even before P2169). Shown for contrast with
// the genuinely new same-scope case:
#include <mutex>

std::mutex m1, m2;

void two_guards_same_scope() {
    std::lock_guard<std::mutex> _(m1);
    std::lock_guard<std::mutex> _(m2);  // NEW in C++26: same scope, no clash
}
```

---

#### Q9
```cpp
#include <cstring>

// Bug: this type is marked (illustrative attribute) trivially relocatable,
// but it points INTO its own storage.
struct SmallString {
    char inline_buf[16];
    char* data = inline_buf;  // self-referential!
    // [[trivially_relocatable]]  -- illustrative marker; DO NOT actually do this
};

void grow(std::vector<SmallString>& v) {
    v.push_back(SmallString{});
    // if the vector reallocates here, a trivially-relocatable SmallString
    // would be bulk-memcpy'd to the new buffer...
}
```

**Answer:**
```
Silent memory corruption: after reallocation, data still points at the OLD (now-deallocated) buffer's inline_buf address, not the relocated copy's
```

**Explanation:**
- Marking `SmallString` trivially relocatable asserts "moving this object and destroying the original is equivalent to copying its bytes and treating the old bytes as inert" — but that's false here
- `data` stores the *address of `inline_buf` itself* — a small-buffer-optimization-style self-reference. A `memcpy` copies the pointer's bit pattern, which still points at the **old** object's address, not the new one
- After the old buffer is freed (or reused), `data` is a dangling pointer — every subsequent access through `data` is undefined behavior, and the bug won't reproduce reliably (it depends on when/whether the vector actually reallocates and what overwrites the old memory)
- This is exactly why trivial relocatability is opt-in and asserted by the type author: the compiler generally can't prove or disprove "does any member point into `this`" for you in every case
- **Key Concept:** Trivial relocatability (P1144/P2786) must never be applied to a type with address-dependent state (self-referential pointers, SBO-style inline-pointing members); doing so compiles fine and fails only later, silently, when a container actually reallocates

**Fixed Version:**
```cpp
// Either don't mark it trivially relocatable (accept the per-element
// move+destroy cost, which correctly re-points `data` at the NEW object's
// inline_buf via the move constructor), or redesign to avoid self-reference:
struct SmallString {
    char inline_buf[16];
    char* data = inline_buf;

    SmallString(const SmallString&) = delete;
    SmallString(SmallString&& other) noexcept {
        std::memcpy(inline_buf, other.inline_buf, sizeof(inline_buf));
        data = inline_buf;  // re-point at THIS object's buffer, not the old one
    }
    // NOT marked trivially relocatable - the move constructor above is required
};
```

---

#### Q10
```cpp
// Bug: an intrusive-list-style node stores its address in a global registry,
// then gets marked trivially relocatable "for performance."
struct RegisteredNode {
    int value;
    RegisteredNode() { global_registry.add(this); }
    ~RegisteredNode() { global_registry.remove(this); }
    // [[trivially_relocatable]]  -- illustrative marker; WRONG here
};

std::vector<RegisteredNode> nodes;
// ... nodes grows past capacity, vector reallocates ...
// global_registry now holds dangling pointers to the OLD addresses!
```

**Answer:**
```
The registry ends up holding stale pointers to freed memory - using them later is undefined behavior (use-after-free)
```

**Explanation:**
- `RegisteredNode`'s constructor/destructor maintain an *external* invariant: "the registry always has the current address of every live node"
- A real move-construct + destroy sequence would run the destructor of the OLD node (removing the stale entry) and the constructor of the NEW node (adding the fresh address) — correctly keeping the registry in sync
- A bulk `memcpy` (what trivial relocatability authorizes) skips both the constructor and destructor entirely — the registry is never updated, so it keeps pointing at addresses that are about to be freed/reused
- This is the exact class of "address-dependent side effect in the constructor/destructor" case trivial relocatability is unsafe for, distinct from Q9's self-referential-member case — here the address-dependence lives in an *external* structure, not a member pointer inside the object itself
- **Key Concept:** Trivial relocatability requires that a type's move-then-destroy sequence have no observable side effects beyond copying bytes; any constructor/destructor that registers/deregisters the object's address somewhere external (registries, intrusive containers, observer lists) makes the type unsafe to mark trivially relocatable, even though the object's own members look simple

**Fixed Version:**
```cpp
// Do not mark RegisteredNode trivially relocatable. Let the container use
// the normal move-construct + destroy path, which keeps the registry correct:
struct RegisteredNode {
    int value;
    RegisteredNode() { global_registry.add(this); }
    RegisteredNode(RegisteredNode&& other) noexcept : value(other.value) {
        global_registry.add(this);  // correctly registers the NEW address
    }
    ~RegisteredNode() { global_registry.remove(this); }
    // deliberately NOT trivially relocatable
};
```

---

#### Q11
```cpp
#include <iostream>

void handle(bool flag) {
    int* p;              // uninitialized pointer
    if (flag) {
        int local = 42;
        p = &local;
    }
    // Bug (assumed): "C++26's erroneous-behaviour change makes this safe now"
    std::cout << *p << '\n';  // dereferencing p when flag was false
}
```

**Answer:**
```
Still full undefined behaviour - P2795 does NOT cover this case at all
```

**Explanation:**
- P2795's erroneous-behaviour narrowing applies specifically to **reading the value of an uninitialized trivial automatic variable itself** (e.g. `int x; use(x);`)
- Here, `p` is a pointer, and the bug is **dereferencing** an uninitialized/invalid pointer (`*p`), not merely reading the pointer's own bit-pattern — dereferencing a wild pointer remains exactly as undefined as it always was
- Even reading `p` itself (its raw address value, without dereferencing) when `flag` was false would fall under the erroneous-behaviour rule for the pointer variable's own bits, but `*p` — actually following that pointer — is a completely different, still-fully-undefined operation
- **Key Concept:** Erroneous behaviour (P2795) narrows exactly one specific pattern (reading an uninitialized trivial automatic variable's own value); it says nothing about pointer dereferences, which remain full undefined behaviour regardless of this change

**Fixed Version:**
```cpp
#include <iostream>
#include <optional>

std::optional<int> handle_safe(bool flag) {
    if (flag) {
        int local = 42;
        return local;
    }
    return std::nullopt;  // explicit "no value" instead of a dangling pointer
}

int main() {
    if (auto v = handle_safe(true)) std::cout << *v << '\n';
}
```

---

#### Q12
```cpp
#include <iostream>

int global_x;  // Bug (assumed): "this is uninitialized too, right? Erroneous behaviour applies here?"

void f() {
    std::cout << global_x << '\n';
}
```

**Answer:**
```
Not erroneous behaviour and not a bug at all: global_x is zero-initialized by the language before main() even runs
```

**Explanation:**
- `global_x` has **static storage duration** (it's a namespace-scope variable), not automatic storage duration
- Objects with static storage duration are always zero-initialized before any dynamic initialization runs (and, having no explicit initializer here, that's the end of it) — reading `global_x` reliably yields `0`, exactly as C++ has always specified
- P2795's erroneous-behaviour change is scoped specifically to *automatic* storage duration trivial variables (ordinary local variables) that lack this automatic zero-initialization guarantee — it has nothing to add for statics/globals, which were never a problem in this respect
- **Key Concept:** Erroneous behaviour for uninitialized reads (P2795) only concerns automatic-storage-duration trivial variables; static/thread-local/global variables are unaffected because they are already zero-initialized by long-standing C++ rules, independent of this proposal

**Fixed Version:**
```cpp
// No fix needed - global_x == 0 reliably, both before and after C++26.
// Shown to contrast with the genuinely relevant case:
#include <iostream>

void f() {
    int local_x;               // automatic storage duration - THIS is what P2795 covers
    std::cout << local_x << '\n';  // erroneous-but-fixed value, not full UB (C++26)
}
```

---
