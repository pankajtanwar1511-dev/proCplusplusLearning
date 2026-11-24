## TOPIC: Copy Elision, RVO and NRVO

### THEORY_SECTION: Core Concepts

#### 1. Mental model
- **Copy elision** = the object is built directly in its final destination, so the copy or move that the source code "seems" to need never happens.
- Two very different kinds hide behind the same name:
  - **Guaranteed (C++17)**: initializing an object from a **prvalue** of the same type. Since C++17 a prvalue is not a temporary object at all; it is a recipe that initializes a *result object* chosen by the context. There is no copy to elide, so no copy or move constructor is needed, not even an accessible one.
  - **Permitted (optional)**: **NRVO** (returning a named local) and a few exception cases. The compiler *may* skip the move/copy; the move/copy constructor must still exist and be accessible.
- When elision does not apply to a `return local;`, the language still prefers a **move** (implicit move on return) before falling back to a copy.
- Order of preference when returning a local by value: **NRVO** (zero operations) → **implicit move** (one move) → **copy** (only if no move constructor is declared).
- Copy elision is the one place where the "as-if" rule is relaxed: copy/move constructors with side effects (printing, counting) may be skipped even though that changes observable output.
- Value categories themselves (lvalue/xvalue/prvalue, what `std::move` does) are covered in topic 03; this topic is about what happens at **initialization and return**.

#### 2. How it works mechanically (the ABI view)
- For a class returned by value that is not tiny and trivially copyable, the caller reserves space for the result and passes its address as a hidden argument (x86-64 System V: the "sret" pointer in `rdi`, returned again in `rax`).
- The callee constructs the return value **directly at that address**.
  - `return T{...};`: the constructor runs on the caller's storage. That is RVO.
  - `T t; ... return t;`: if the compiler can place `t` itself at that address from the start, `t` *is* the caller's object. That is NRVO.
- NRVO is impossible when the compiler cannot know, at the point the local is constructed, which object will be returned (two different named locals on different paths), or when the returned object is not a plain local of the function (a parameter, a member, a global).
- Function parameters live in storage the caller set up for the *argument*, not for the result; that is why parameters can be moved from on return but never NRVO'd.
- Small trivially copyable types (e.g. a struct of two `int`s on x86-64) are returned in registers; there is no constructor to observe, so the question does not arise.

#### 3. C++17 guaranteed elision: prvalue semantics
- A **prvalue** initializes a result object; a **temporary** is created only when the program needs a real object (temporary materialization): binding a reference, accessing a member, or a discarded expression.
- Cases where the result object is the destination itself (zero copies, zero moves, guaranteed):

| Code | Result object of the prvalue |
|---|---|
| `T x = T(args);` | `x` |
| `T x = T(T(T()));` | `x` (the nesting collapses) |
| `T f() { return T(args); }` then `T x = f();` | `x` |
| `void g(T p); g(T(args));` | the parameter `p` |
| `T* p = new T(f());` | the heap object |
| `T x = cond ? T(1) : T(2);` | `x` (both branches are prvalues) |
| `auto x = T{};` | `x` |

- Consequences:
  - Non-copyable, non-movable types can be returned from factories: `std::atomic<int> a = 5;` and a function returning `std::lock_guard<std::mutex>` compile in C++17 (both fail in C++14 because the move constructor is deleted).
  - `T x = T(args);` is exactly as cheap as `T x(args);`.
- **Not** covered by the guarantee:
  - Returning a named object (`return t;`): NRVO, optional.
  - Assignment: `x = f();` creates the result object as a temporary and then **move-assigns** it into `x`. Elision is about initialization only.
  - Binding to a reference parameter: `v.push_back(T{})` materializes a temporary and then move-constructs the element. `emplace_back(args)` constructs in place.
  - Returning a prvalue of a *different* type that must be converted (`std::string f() { return "abc"; }` constructs the string from `const char*`, fine, but `Base f() { return Derived{}; }` constructs a `Derived` temporary and then slices it into the `Base` result).

#### 4. RVO vs NRVO: names and status
| Name | Code shape | Status |
|---|---|---|
| RVO / URVO (unnamed) | `return T(args);` | Guaranteed since C++17 (it is no longer even an optimization) |
| NRVO (named) | `T t; ...; return t;` | Permitted, never required |
| Elision of a temporary in init (pre C++17 name) | `T x = T();` | Guaranteed since C++17 |
| Exception object | `throw t;` / `catch (T e)` | Permitted, rarely done |

- Interview wording: "C++17 guarantees copy elision for prvalue cases such as `return T{}`; NRVO for a named local remains optional." Saying "RVO is guaranteed" without qualification invites a follow-up with a case where it is not.
- In practice GCC and Clang perform NRVO whenever a single named local is returned on every path, even at `-O0`. Older MSVC versions performed it only in optimized builds.

#### 5. When NRVO is possible (and when it is not)
- The returned expression must be the **name** of a non-volatile object with automatic storage, declared in the function body (not a parameter), whose type is the same class type as the return type (ignoring cv-qualifiers).
- Typical NRVO killers:

| Code | Why NRVO cannot happen | What actually runs |
|---|---|---|
| `T a, b; if (c) return a; return b;` | Two candidates for one result slot | Implicit move |
| `T f(T p) { return p; }` | Parameter: storage owned by the caller's argument | Implicit move |
| `return std::move(t);` | Not a name any more, it is a function call | Move (forced) |
| `return c ? a : b;` | Conditional expression, not a name | **Copy** (it is an lvalue) |
| `return obj.member;` | Member of a local, not a whole object | **Copy** |
| `auto [x, y] = agg; return x;` | A structured binding names a member of a hidden object | **Copy** (see Edge Case 5 for a GCC difference with tuple-like types) |
| `static T s; return s;` / global | Not automatic storage | Copy |
| `Derived d; return d;` from a function returning `Base` | Different type | C++20 (P1825): implicit move into `Base`, slicing; GCC in `-std=c++17` copies |

- The copy/move constructor must be usable even when NRVO is applied: a type with deleted copy and move constructors cannot be returned by name, only as a prvalue.

#### 6. Implicit move on return: the rules by standard
- Idea: a local that is about to be destroyed can be treated as an rvalue in `return local;`, because nobody can observe it afterwards.
- **C++11**: when NRVO criteria are met (or the expression names a by-value parameter), overload resolution first treats the name as an rvalue; if that fails, it is retried as an lvalue (copy).
- **C++14 (CWG 1579, applied retroactively by compilers)**: the returned local may have a different type than the return type, so a converting constructor taking an rvalue is used:
  - `std::unique_ptr<Base> f() { auto p = std::make_unique<Derived>(); return p; }` compiles and moves.
  - `std::optional<T> f() { T t; return t; }` moves `t` into the optional.
- **C++20 (P1825)**: "implicitly movable entity" also covers local **rvalue reference** variables and parameters: `T f(T&& x) { return x; }` moves in C++20 and copied in C++17 (verified: GCC 11 prints `copy` with `-std=c++17`, `move` with `-std=c++20`; Clang 14 applies P1825 in every mode and prints `move` even with `-std=c++11`). `throw param;` also moves.
  - P1825 also dropped the C++11 restriction that the selected constructor must take an rvalue reference to the returned object's type, so `Derived d; return d;` into `Base` moves the base part in C++20 (GCC 11 copies with `-std=c++17`).
- **C++23 (P2266, "simpler implicit move")**: the returned id-expression *is* an xvalue; there is no two-step overload resolution any more.
  - `T&& g(T&& x) { return x; }` now compiles (error in C++20: "rvalue reference cannot bind to lvalue").
  - `int& h(int&& x) { return x; }` now **fails** to compile (it compiled in C++20): breaking change for code that returned a reference to an rvalue-reference parameter.
  - Verified with Clang 14 (`-std=c++20` vs `-std=c++2b`); GCC implements it from GCC 13.
- What implicit move never covers: members (`return this->m;`, `return obj.m;`), structured bindings, globals and static locals, and anything that is not a bare name. Those need an explicit `std::move` if a move is wanted.

#### 7. `return std::move(local)`: the pessimization
- `std::move(t)` is an expression of type `T&&`, not the name of a local, so it disables NRVO and forces exactly one move.
- With NRVO: 1 construction, 0 moves. With `return std::move(t);`: 1 construction, 1 move, 1 extra destructor call.
- GCC 9+ and Clang warn: `-Wpessimizing-move` ("moving a local object in a return statement prevents copy elision", in `-Wall`) and `-Wredundant-move` (in `-Wextra` for GCC).
- When `std::move` in a return *is* correct:
  - Returning a member of a local or of `*this` from an rvalue-qualified function: `return std::move(p.first);`, `std::string take() && { return std::move(name_); }`.
  - Returning a structured binding or a sub-object.
  - Returning a different object than the one named (e.g. a member of a parameter).
  - Pre-C++20 code returning a named rvalue reference variable by value.
- Rule: `return local;` and `return param;` never need `std::move`. Everything else is worth a second look.

#### 8. Deleted vs not-declared move constructor on return
- If the move constructor is **not declared** (e.g. suppressed by a user-declared copy constructor or destructor), overload resolution for the rvalue picks the copy constructor (`const T&` binds to an rvalue): `return local;` copies. Correct, just slower.
- If the move constructor is **declared as deleted** (`T(T&&) = delete;`), it participates in overload resolution and wins for an rvalue. Selecting a deleted function makes the program ill-formed. There is **no fallback to copy**.
  - C++20 (GCC 11, Clang 14): "use of deleted function `W::W(W&&)`".
  - GCC 11 in `-std=c++17` (and earlier) accepts the code and silently copies; Clang rejects it in every mode. Do not rely on the GCC behaviour.
- Practical rule: never `= delete` only the move operations while keeping copy; either declare nothing (copy is used for rvalues) or delete both (non-copyable, non-movable).
- Same logic for `= delete` on the copy constructor of a type returned by name when no move constructor is declared: NRVO may be applied, but the code must still be valid without it, so it fails to compile.

#### 9. Elision at call sites, sink parameters and assignment
- **By-value parameter from a prvalue**: `void take(std::string s); take(std::string("abc"));` constructs `s` directly; `take(make_string());` likewise.
- **Sink parameter idiom**: take by value, then move into place.
```cpp
class Order {
    std::string id_;
public:
    explicit Order(std::string id) : id_(std::move(id)) {}
};
```

| Argument | By value + move | `const&` + `&&` overload pair |
|---|---|---|
| lvalue | 1 copy + 1 move | 1 copy |
| xvalue (`std::move(s)`) | 2 moves | 1 move |
| prvalue (`std::string("x")`) | 0 (elided) + 1 move | 1 move (temporary materialized) |

- By value costs one extra move compared with the overload pair, and wins on simplicity (one function instead of 2^N for N parameters). Use it when the function *always* stores the argument and moves are cheap.
- Do **not** use by value for parameters that are only read (use `const&` or a view), or when the move is expensive (`std::array` of large objects, types with no move).
- **Assignment is not initialization**: `x = make();` runs the constructor for a temporary, then move assignment, then the temporary's destructor. If `x` already holds a buffer that could be reused (e.g. `std::vector` capacity), assignment from a fresh object throws that capacity away.

#### 10. Observing elision: `-fno-elide-constructors`
- GCC/Clang flag that disables **non-mandatory** elision. Useful to see what the language would do without it.
- Verified with GCC 11, tracing type, `T rvo() { return T{}; }` and `T nrvo() { T t; return t; }`:

| Mode | `T a = rvo();` | `T b = nrvo();` |
|---|---|---|
| `-std=c++14` | ctor dtor | ctor dtor |
| `-std=c++14 -fno-elide-constructors` | ctor move dtor move dtor dtor | ctor move dtor move dtor dtor |
| `-std=c++17` | ctor dtor | ctor dtor |
| `-std=c++17 -fno-elide-constructors` | ctor dtor | ctor move dtor dtor |

- Reading the table:
  - C++14 without elision: two moves (local → return temporary → `a`/`b`).
  - C++17: the prvalue path cannot be disabled because there is nothing to elide; only NRVO can be turned off, which costs exactly one implicit move.

#### 11. Misconceptions to unlearn
- ❌ "RVO is guaranteed in C++17." ✅ Elision from a **prvalue** is guaranteed; NRVO (`return local;`) is still optional.
- ❌ "`return std::move(local);` is faster." ✅ It disables NRVO and forces a move; the plain `return local;` already moves if NRVO does not happen.
- ❌ "If NRVO fails the object is copied." ✅ It is moved (implicit move); it is copied only if there is no move constructor.
- ❌ "If the move constructor is deleted, return falls back to copy." ✅ A deleted move constructor is selected and the code is ill-formed (C++20, Clang all modes).
- ❌ "Returning a parameter by value is NRVO." ✅ Parameters are moved, never elided.
- ❌ "`return cond ? a : b;` moves." ✅ The conditional of two lvalues is an lvalue: it copies. Use `if (cond) return a; return b;`.
- ❌ "Copy elision is an optimization, so it cannot change program output." ✅ It is explicitly allowed to skip copy/move constructors with side effects.
- ❌ "`x = f();` is elided too." ✅ Elision applies to initialization only; assignment runs move assignment from a temporary.
- ❌ "Non-movable types cannot be returned from functions." ✅ Since C++17 they can, as prvalues.
- ❌ "`-fno-elide-constructors` turns off all elision." ✅ In C++17 and later it cannot turn off guaranteed prvalue elision.

### EDGE_CASES: Traps and Misconceptions

#### Edge Case 1: Deleted move constructor does not fall back to copy
- A learner's answer: "if NRVO does not apply it falls back to move, and if move is deleted or not generated it falls back to copy". Half right.
  - **Not generated** (not declared): copy is used.
  - **Deleted** (`W(W&&) = delete;`): the deleted move constructor is the best match for the rvalue, so `return b;` is ill-formed.
```cpp
struct W {
    W() = default;
    W(const W&) = default;
    W(W&&) = delete;          // declared, so it takes part in overload resolution
};
W make() { W b; return b; }   // C++20: error: use of deleted function 'W::W(W&&)'
```
- Compiler note: GCC 11 accepts this in `-std=c++17` and copies; Clang rejects it in every mode; both reject in C++20.

#### Edge Case 2: Non-movable types: prvalue yes, named local no
- With `NM(const NM&) = delete; NM(NM&&) = delete;`:
  - `NM make() { return NM{1}; }` compiles in C++17 (error in C++14).
  - `NM make() { NM x{1}; return x; }` never compiles, even though the compiler would apply NRVO: the move/copy constructor must be usable for the non-guaranteed case.
  - `NM n = cond ? NM{1} : NM{2};` compiles: both branches are prvalues.
  - `n = make();` fails: assignment needs `operator=`, elision does not help.

#### Edge Case 3: `return std::move(local)` disables NRVO
- Output with a tracing type: `ctor move dtor dtor` instead of `ctor dtor`.
- GCC: `warning: moving a local object in a return statement prevents copy elision [-Wpessimizing-move]`.
- Same problem inside `return std::move(cond ? a : b);`: it moves, but a plain `if` would allow implicit move without the cast and keep code clearer.

#### Edge Case 4: The conditional operator copies
- `T f(bool c) { T a, b; return c ? a : b; }` prints `ctor ctor copy`.
- `c ? a : b` with two lvalues of the same type is an lvalue; it is not "the name of a local", so neither NRVO nor implicit move applies.
- Fix: `if (c) return a; return b;` gives an implicit move (two candidates, so still no NRVO).

#### Edge Case 5: Members and structured bindings are copied
- `T f() { P p; return p.first; }` copies: a member is not an implicitly movable entity.
- `T f() { auto [x, y] = P{}; return x; }` also copies when `P` is an aggregate: `x` names a member of a hidden object, not a variable of its own.
- Compiler difference: when `P` is tuple-like (`std::pair`, `std::tuple`), GCC 11 and GCC 13 in `-std=c++20` and later **move** (they treat the binding as the hidden `T&&` reference variable), while Clang 14 copies in every mode. Do not rely on either; write `std::move(x)` if a move is wanted.
- If the move is intended, write `return std::move(p.first);` and `return std::move(x);`; here `std::move` is correct, not a pessimization.

#### Edge Case 6: Returning a parameter moves, never elides
- `T pass(T p) { return p; }` called as `pass(T{})`: the argument `T{}` is constructed directly into `p` (guaranteed), then `p` is **moved** into the result: `ctor move`.
- Writing `return std::move(p);` gives the same code but triggers `-Wredundant-move`.
- For a `T&&` parameter: `T f(T&& x) { return x; }` **copies** in C++17 and **moves** in C++20 (P1825). Clang 14 already moves in C++17 mode (it applies P1825 to older modes); GCC 11 follows the `-std` flag.

#### Edge Case 7: C++23 changes what `return x;` means for references
- C++23 (P2266) makes a returned implicitly movable name an xvalue.
- Now valid: `T&& forward_it(T&& x) { return x; }`.
- Now invalid: `int& h(int&& x) { return x; }` (non-const lvalue reference cannot bind to an xvalue). It compiled in C++20.
- `decltype(auto)` also changes: `decltype(auto) f() { T x; return (x); }` deduces `T&` in C++20 and `T&&` in C++23 (verified with Clang 14). Both are references to a dead local: the parentheses are the bug in either standard.

#### Edge Case 8: Elision changes observable output (and that is legal)
- A copy constructor that counts calls or logs can be skipped; code that depends on the count of copy/move constructor calls is not portable across NRVO and non-NRVO builds.
- Never put essential side effects (registration, reference counting) only in copy/move constructors.
- Destructor calls match constructor calls in every case; only the *number* of objects changes.

### CODE_EXAMPLES: Practical Demonstrations

#### Example 1: Factories for non-movable types (C++17)
- `std::atomic`, `std::mutex` and `std::lock_guard` have no copy or move constructors; since C++17 they can still be produced by a function or by copy-initialization from a prvalue.
```cpp
#include <atomic>
#include <iostream>
#include <mutex>
#include <thread>

struct Sequencer {
    std::atomic<long> next;
    explicit Sequencer(long start) : next(start) {}
    Sequencer(const Sequencer&) = delete;
    Sequencer(Sequencer&&) = delete;
};

Sequencer make_sequencer() { return Sequencer(1000); }   // prvalue: no move needed

std::mutex m;
std::lock_guard<std::mutex> lock_it() { return std::lock_guard<std::mutex>(m); }

bool held_by_someone() {                     // probe from a thread that is not the owner
    bool held = false;
    std::thread t([&] {
        if (m.try_lock()) m.unlock(); else held = true;
    });
    t.join();
    return held;
}

int main() {
    std::atomic<int> a = 5;                  // C++14: error (deleted copy ctor)
    Sequencer s = make_sequencer();          // constructed directly in s
    std::cout << a << ' ' << s.next++ << ' ' << s.next << '\n';
    {
        auto g = lock_it();                  // the guard lives in this scope
        std::cout << "locked: " << held_by_someone() << '\n';
    }
    std::cout << "locked after scope: " << held_by_someone() << '\n';
}
```
- Output (also clean under ASan/UBSan and TSan):
```
5 1000 1001
locked: 1
locked after scope: 0
```
- With `-std=c++14` the same file fails: "use of deleted function `Sequencer::Sequencer(Sequencer&&)`" (and the same for the `lock_guard` and `atomic<int>` lines).
- The lock state is probed from a second thread: calling `try_lock` on a `std::mutex` the calling thread already owns is undefined behaviour. (`try_lock` may also fail spuriously in principle; it does not here.)

#### Example 2: Counting operations: RVO, NRVO, two paths, pessimizing move
- A tracing type prints every special member call.
```cpp
#include <iostream>
#include <utility>

struct T {
    T() { std::cout << "ctor "; }
    T(const T&) { std::cout << "copy "; }
    T(T&&) noexcept { std::cout << "move "; }
    ~T() { std::cout << "dtor "; }
};

T rvo() { return T{}; }
T nrvo() { T t; return t; }
T two_paths(bool c) { T a, b; if (c) return a; return b; }
T pessimized() { T t; return std::move(t); }
T ternary(bool c) { T a, b; return c ? a : b; }

int main() {
    { std::cout << "rvo:       "; T x = rvo(); }          std::cout << '\n';
    { std::cout << "nrvo:      "; T x = nrvo(); }         std::cout << '\n';
    { std::cout << "two paths: "; T x = two_paths(true); } std::cout << '\n';
    { std::cout << "std::move: "; T x = pessimized(); }   std::cout << '\n';
    { std::cout << "ternary:   "; T x = ternary(true); }  std::cout << '\n';
}
```
- Output (GCC 11 and Clang 14, `-O0` and `-O2`):
```
rvo:       ctor dtor 
nrvo:      ctor dtor 
two paths: ctor ctor move dtor dtor dtor 
std::move: ctor move dtor dtor 
ternary:   ctor ctor copy dtor dtor dtor 
```
- `nrvo` is not guaranteed by the standard; GCC and Clang do it here even at `-O0`.
- GCC emits `-Wpessimizing-move` for `pessimized()`.

#### Example 3: Implicit move into a different return type
- The returned local and the return type differ; a converting constructor taking an rvalue is used (CWG 1579).
```cpp
#include <iostream>
#include <memory>
#include <optional>
#include <string>

struct Base { virtual ~Base() = default; virtual const char* name() const { return "Base"; } };
struct Derived : Base { const char* name() const override { return "Derived"; } };

std::unique_ptr<Base> make_shape() {
    auto p = std::make_unique<Derived>();
    return p;                                  // moves unique_ptr<Derived> into unique_ptr<Base>
}

struct Trace {
    std::string s = "payload";
    Trace() = default;
    Trace(const Trace& o) : s(o.s) { std::cout << "copy\n"; }
    Trace(Trace&& o) noexcept : s(std::move(o.s)) { std::cout << "move\n"; }
};

std::optional<Trace> maybe(bool ok) {
    Trace t;
    if (!ok) return std::nullopt;
    return t;                                  // moves t into the optional
}

int main() {
    auto shape = make_shape();
    std::cout << shape->name() << '\n';
    auto o = maybe(true);
    std::cout << o->s << '\n';
}
```
- Output:
```
Derived
move
payload
```
- `unique_ptr` is move-only, so this would not compile at all if the local were treated as an lvalue.
- Writing `return std::optional<Trace>(t);` would copy: the argument is an lvalue expression inside a call, not a returned name.

#### Example 4: Sink parameters: by value then move
- Counting what each argument kind costs for the "take by value, move into member" idiom.
```cpp
#include <iostream>
#include <utility>

struct Id {
    Id() = default;
    Id(const Id&) { std::cout << "copy "; }
    Id(Id&&) noexcept { std::cout << "move "; }
};

class Order {
    Id id_;
public:
    explicit Order(Id id) : id_(std::move(id)) {}   // one sink overload for every case
};

int main() {
    Id a;
    std::cout << "lvalue:  "; Order o1(a);            std::cout << '\n';
    std::cout << "xvalue:  "; Order o2(std::move(a)); std::cout << '\n';
    std::cout << "prvalue: "; Order o3(Id{});         std::cout << '\n';
}
```
- Output:
```
lvalue:  copy move 
xvalue:  move move 
prvalue: move 
```
- The prvalue `Id{}` initializes the parameter directly (guaranteed elision); only the move into the member remains.
- A `const Id&` + `Id&&` overload pair would save one move per call (copy / move / move), at the cost of writing two functions.

#### Example 5: One allocation, one free: Buffer returned by value
- The learner's claim "one allocation, one destruction" checked with counters, with and without NRVO.
```cpp
#include <cstddef>
#include <iostream>
#include <utility>

int allocs = 0, frees = 0, moves = 0;

class Buffer {
    int* data_;
    std::size_t n_;
public:
    explicit Buffer(std::size_t n) : data_(new int[n]{}), n_(n) { ++allocs; }
    Buffer(Buffer&& o) noexcept : data_(std::exchange(o.data_, nullptr)), n_(o.n_) {
        ++moves;                                // pointer transferred, array untouched
    }
    Buffer(const Buffer&) = delete;
    Buffer& operator=(const Buffer&) = delete;
    ~Buffer() { if (data_) ++frees; delete[] data_; }   // delete[] nullptr is fine
    std::size_t size() const { return n_; }
};

Buffer create() {
    Buffer b(100);
    return b;                                   // one candidate: NRVO
}

Buffer create_two(bool flag) {
    Buffer a(100), b(100);
    if (flag) return a;
    return b;                                   // two candidates: implicit move
}

int main() {
    { Buffer x = create(); }
    std::cout << "nrvo:  allocs=" << allocs << " frees=" << frees << " moves=" << moves << '\n';
    allocs = frees = moves = 0;
    { Buffer y = create_two(false); }
    std::cout << "moved: allocs=" << allocs << " frees=" << frees << " moves=" << moves << '\n';
}
```
- Output (GCC 11):
```
nrvo:  allocs=1 frees=1 moves=0
moved: allocs=2 frees=2 moves=1
```
- Pitfall found while testing: a first version used one function with `if (flag) { Buffer b(100); return b; }` plus a second path returning another local. GCC then did **no** NRVO on either path (`moves=1` for both): NRVO is decided per function, and any second named candidate can disable it.
- In the second case: two arrays allocated (`a` and `b`), `b` moved into the result (pointer copied, source nulled), `a` freed at return, result freed at the end of scope. The moved-from `b` frees nothing.
- The NRVO result (`moves=0`) is compiler behaviour, not a guarantee.
- The source nulling in the move constructor is what prevents a double `delete[]`; the full rule of five is topic 02.

#### Example 6: `-fno-elide-constructors` across standards
- Same program, four builds.
```cpp
#include <iostream>

struct T {
    T() { std::cout << "ctor "; }
    T(const T&) { std::cout << "copy "; }
    T(T&&) noexcept { std::cout << "move "; }
    ~T() { std::cout << "dtor "; }
};

T rvo() { return T{}; }
T nrvo() { T t; return t; }

int main() {
    { std::cout << "rvo:  "; T a = rvo(); }  std::cout << '\n';
    { std::cout << "nrvo: "; T b = nrvo(); } std::cout << '\n';
}
```
- Output with `g++ -std=c++17` (or `-std=c++20`):
```
rvo:  ctor dtor 
nrvo: ctor dtor 
```
- Output with `g++ -std=c++17 -fno-elide-constructors`:
```
rvo:  ctor dtor 
nrvo: ctor move dtor dtor 
```
- Output with `g++ -std=c++14 -fno-elide-constructors`:
```
rvo:  ctor move dtor move dtor dtor 
nrvo: ctor move dtor move dtor dtor 
```
- C++17 removed the temporaries from the prvalue path, so the flag can only disable NRVO.

#### Example 7: Assignment is not elided
- Initialization constructs in place; assignment needs a temporary plus move assignment.
```cpp
#include <iostream>

struct T {
    T() { std::cout << "ctor "; }
    T(T&&) noexcept { std::cout << "move-ctor "; }
    T& operator=(T&&) noexcept { std::cout << "move-assign "; return *this; }
    ~T() { std::cout << "dtor "; }
};

T make() { return T{}; }

int main() {
    std::cout << "init:   "; T a = make(); std::cout << '\n';
    std::cout << "assign: "; a = make();   std::cout << '\n';
    std::cout << "end:    ";
}
```
- Output:
```
init:   ctor 
assign: ctor move-assign dtor 
end:    dtor 
```
- In the assignment the prvalue is materialized as a temporary (the argument of `operator=(T&&)`), then destroyed at the end of the full expression.
- For containers this also means the target's old capacity is released; when reusing a buffer in a hot loop, prefer filling an existing object through a reference parameter.

### QUICK_REFERENCE: Cheat Sheet

#### What happens on `return`
| Return statement | C++17/20 result |
|---|---|
| `return T(args);` | Guaranteed elision: 1 ctor |
| `return local;` (one candidate) | NRVO usually: 1 ctor; else 1 move |
| `return a;` / `return b;` on different paths | 1 move (no NRVO) |
| `return param;` | 1 move |
| `return std::move(local);` | 1 move (NRVO disabled, warning) |
| `return c ? a : b;` | 1 copy |
| `return local.member;` | 1 copy (use `std::move` if intended) |
| `return binding;` (structured binding of an aggregate) | 1 copy (GCC moves tuple-like bindings in C++20) |
| `return derived_local;` into `Base` | move + slice (C++20; copy + slice in GCC C++17 mode) |
| `return local;` into `unique_ptr<Base>` / `optional<T>` | 1 move via converting ctor |
| `T&& f(T&& x) { return x; }` | Error before C++23, OK in C++23 |
| `T f(T&& x) { return x; }` | Copy in C++17 (GCC), move in C++20 (Clang moves in all modes) |

#### Guaranteed vs permitted
| Guaranteed (C++17) | Permitted only |
|---|---|
| `T x = T(...)`, `T x = f()` (f returns prvalue) | NRVO `return local;` |
| `return T(...)` | `throw local;` / catch by value |
| By-value parameter from prvalue | |
| `new T(f())` | |
| Works with deleted copy/move | Copy/move must be accessible |

#### Warnings and flags
| Flag | Purpose |
|---|---|
| `-Wpessimizing-move` (in `-Wall`) | `return std::move(local);` |
| `-Wredundant-move` (GCC `-Wextra`) | `return std::move(param);` |
| `-fno-elide-constructors` | Disable non-mandatory elision (NRVO) to observe moves |

#### Interview one-liners
| Question | Answer |
|---|---|
| Is RVO guaranteed? | Prvalue elision is guaranteed since C++17; NRVO is not |
| What if NRVO doesn't happen? | Implicit move; copy only if no move constructor is declared |
| Deleted move ctor on `return local;`? | Ill-formed, no fallback to copy |
| Should I `return std::move(local)`? | No: it disables NRVO |
| When is `std::move` in return correct? | Members, structured bindings, sub-objects |
| Can I return a `std::mutex`-like type? | Yes as a prvalue (C++17), never by name |
| Is a parameter NRVO'd? | No, moved |
| Does `x = f()` elide? | No: temporary + move assignment |
| Can elision change output? | Yes, explicitly allowed |
| Sink parameter cost? | lvalue: copy+move; rvalue: move(+move); one extra move vs overloads |
| C++23 change? | Returned local names are xvalues (P2266) |
