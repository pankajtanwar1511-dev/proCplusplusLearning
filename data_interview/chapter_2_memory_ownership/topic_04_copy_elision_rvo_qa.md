## TOPIC: Copy Elision, RVO and NRVO

### INTERVIEW_QA: Interview Questions with Detailed Answers

#### Q1: What is copy elision, and what is the difference between RVO and NRVO?
**Difficulty:** #beginner
**Category:** #object_lifetime #performance
**Concepts:** #copy_elision #rvo #nrvo

**Answer:**
Copy elision means an object is constructed directly in its final location, so a copy or move constructor that the code seems to need is never called. RVO is elision for an unnamed prvalue (`return T(args);`), guaranteed since C++17; NRVO is elision for a named local (`T t; return t;`), which is permitted but never required.

**Explanation:**
- Mechanically, the caller passes the address of the result slot; the callee constructs the return value there.
- RVO in C++17 is not even an optimization any more: a prvalue has no temporary, it directly initializes its result object.
- NRVO needs the compiler to place the local at the result address from the start, which is only possible if it is the only candidate.
- ❌ Common wrong answer: "Both are guaranteed in C++17." Only the prvalue case is.
- ✅ What a strong answer adds: elision is allowed to change observable behaviour (skipped constructors with side effects); together with allocation elision it is one of the very few exceptions to the as-if rule.

**Key takeaway:** RVO (prvalue) is guaranteed, NRVO (named) is optional.

---

#### Q2: How many constructor calls does this print in C++17?
**Difficulty:** #beginner
**Category:** #object_lifetime #performance
**Concepts:** #guaranteed_elision #prvalue

```cpp
Widget make() { return Widget{}; }
Widget w = make();
```

**Answer:**
Exactly one constructor (the default constructor) and, at the end of `w`'s scope, one destructor. No copy and no move, and this is guaranteed in C++17.

**Explanation:**
- `Widget{}` is a prvalue whose result object is the function's return object; `make()` is a prvalue whose result object is `w`. The chain collapses into `w`.
- Because nothing is copied or moved, `Widget(const Widget&) = delete; Widget(Widget&&) = delete;` would still compile.
- In C++14 the same code needed an accessible move (or copy) constructor even when the compiler elided it.
- ❌ Common wrong answer: "One constructor plus one move that the compiler optimizes away." That was the C++14 model; in C++17 there is no move to optimize.
- ✅ What a strong answer adds: say "C++17 guarantees copy elision for prvalue cases such as `return Widget{}`; NRVO for a named local remains optional" rather than "RVO is guaranteed", so a follow-up with a named local doesn't catch you.

**Key takeaway:** Prvalue in, object out: one construction, no move, no copy.

---

#### Q3: `Buffer b = Buffer(100);`: copy constructor, move constructor, or neither?
**Difficulty:** #beginner
**Category:** #object_lifetime
**Concepts:** #prvalue #copy_initialization #guaranteed_elision

**Answer:**
Neither. `Buffer(100)` is a prvalue, so in C++17 `b` is constructed directly by `Buffer(std::size_t)`. Any allocation done by that constructor still happens once, for `b`.

**Explanation:**
- `Buffer b = Buffer(100);` is exactly as expensive as `Buffer b(100);`.
- The common slip is calling `Buffer(100)` an lvalue: it has no name and is a prvalue (see topic 03 for the taxonomy).
- Contrast with assignment: `b = Buffer(100);` (b already exists) materializes a temporary and runs move assignment.
- ❌ Common wrong answer: "lvalue, copy elision or copy constructor". There is no copy constructor in the picture at all.
- ✅ What a strong answer adds: "constructor vs assignment depends on whether the destination already exists; elision only exists for construction".

**Key takeaway:** Initializing from a prvalue of the same type is direct construction.

---

#### Q4: A function returns a named local. What happens if NRVO is not applied?
**Difficulty:** #intermediate
**Category:** #object_lifetime #move_semantics
**Concepts:** #nrvo #implicit_move

```cpp
Buffer create() {
    Buffer b(100);
    return b;
}
```

**Answer:**
`b` is treated as an rvalue in the return statement (implicit move), so the move constructor initializes the result. Only if the type has no move constructor declared does the copy constructor get used.

**Explanation:**
- With NRVO: one `Buffer` construction, one allocation, one destruction, one `delete[]`.
- Without NRVO: one construction, one move (the `int[100]` stays where it is; only the pointer is transferred and the source pointer is nulled), two destructions, one real `delete[]` (the other is `delete[] nullptr`).
- The source must be nulled by the move constructor; otherwise both objects own the same array and the second destructor double-deletes (rule of five details: topic 02).
- ❌ Common wrong answer: "If NRVO fails the object is copied." Copy is the last resort, after move.
- ✅ What a strong answer adds: "NRVO is permitted but not guaranteed; GCC and Clang do it whenever a single named local is returned on every path, even at `-O0`."

**Key takeaway:** NRVO, else implicit move, else copy.

---

#### Q5: Why is `return std::move(local);` usually wrong?
**Difficulty:** #beginner
**Category:** #performance #move_semantics
**Concepts:** #pessimizing_move #nrvo

**Answer:**
`std::move(local)` is not the name of a local object, so NRVO is no longer allowed and a move is forced. `return local;` already gets NRVO or, failing that, an implicit move, so the explicit cast can only make things worse.

**Explanation:**
- Measured with a tracing type: `return t;` prints `ctor dtor`; `return std::move(t);` prints `ctor move dtor dtor`.
- GCC and Clang warn: `-Wpessimizing-move` ("moving a local object in a return statement prevents copy elision"), enabled by `-Wall`.
- For parameters, `return std::move(param);` is merely redundant (`-Wredundant-move`): parameters are moved anyway and never elided.
- ❌ Common wrong answer: "It makes sure the object is moved instead of copied." The language already guarantees that.
- ✅ What a strong answer adds: the cases where `std::move` in a return *is* right: a member (`return std::move(p.first);`), a structured binding, or a data member from an rvalue-qualified member function.

**Key takeaway:** Return locals and parameters by name; reserve `std::move` for sub-objects.

---

#### Q6: Which of these returns copy, which move, which elide?
**Difficulty:** #intermediate
**Category:** #object_lifetime #performance
**Concepts:** #nrvo #implicit_move #structured_bindings

```cpp
T a1(bool c) { T x, y; if (c) return x; return y; }
T a2(bool c) { T x, y; return c ? x : y; }
T a3(T p)    { return p; }
T a4()       { P pr; return pr.first; }
T a5()       { auto [f, s] = P{}; return f; }
```

**Answer:**
`a1` moves (two candidates, so no NRVO, but each is a returned name); `a2` copies (the conditional of two lvalues is an lvalue, not a name); `a3` moves (parameters are never elided); `a4` copies (a member is not implicitly movable); `a5` copies (a structured binding refers to a member of a hidden object).

**Explanation:**
- Verified with `P` = `std::pair<T, T>`: Clang 14 (C++17/20/2b) and GCC 11 (C++17) give `a1` move, `a2` copy, `a3` move, `a4` copy, `a5` copy.
- Compiler difference: GCC 11 and GCC 13 in `-std=c++20` and later **move** in `a5` for a tuple-like `P` such as `std::pair` (they copy for a plain aggregate). Portable code writes `std::move(f)` when a move is wanted.
- Fixes: `a2` → use `if`; `a4` → `return std::move(pr.first);`; `a5` → `return std::move(f);`.
- ❌ Common wrong answer: "All of them move because the locals are about to die." Implicit move only applies to a bare name of a whole local object or parameter.
- ✅ What a strong answer adds: none of the copying cases (`a2`, `a4`, `a5`) produced a warning with `-Wall -Wextra` on GCC 11; code review has to catch them.

**Key takeaway:** Implicit move needs a plain name of a whole local; anything else copies.

---

#### Q7: Can a type with deleted copy and move constructors be returned from a function?
**Difficulty:** #intermediate
**Category:** #object_lifetime
**Concepts:** #guaranteed_elision #non_movable_types

**Answer:**
Yes, if it is returned as a prvalue (`return T(args);` or `return {args};`) in C++17 or later. No, if it is returned by name (`T t; return t;`), because NRVO is optional and the code must be valid without it.

**Explanation:**
- Real uses: factories for types holding a `std::mutex` or `std::atomic`, a function returning a `std::lock_guard`, `std::atomic<int> a = 5;` (all fail in C++14).
- `T x = cond ? T(1) : T(2);` also works: both branches are prvalues.
- Assignment still does not work: `x = make();` needs an assignment operator.
- ❌ Common wrong answer: "The compiler will elide it anyway, so `return t;` is fine." The constructor must be usable even if the compiler elides it.
- ✅ What a strong answer adds: the result is "non-movable values with value semantics at creation": they can be created by a factory but never relocated afterwards (for example, they cannot live in a `std::vector` that grows).

**Key takeaway:** Non-movable types are returnable as prvalues only.

---

#### Q8: The move constructor is `= delete`, the copy constructor is available. Does `return local;` fall back to copy?
**Difficulty:** #advanced
**Category:** #object_lifetime #special_members
**Concepts:** #deleted_functions #implicit_move #overload_resolution

```cpp
struct W {
    W() = default;
    W(const W&) = default;
    W(W&&) = delete;
};
W make() { W b; return b; }
```

**Answer:**
No. A deleted function still takes part in overload resolution; for the rvalue `b` the deleted move constructor is the best match, and selecting a deleted function makes the program ill-formed. C++20: "use of deleted function `W::W(W&&)`".

**Explanation:**
- Contrast: if the move constructor is simply **not declared** (for example suppressed by a user-declared copy constructor), the rvalue binds to `const W&` and the copy constructor is used.
- Compiler differences found when verifying: Clang rejects the code in every mode; GCC 11 rejects it in C++20 but silently copies in `-std=c++17` and earlier. Portable code must assume the error.
- Even `W w = make();` with a guaranteed prvalue does not help here: the problem is inside `make`.
- ❌ Common wrong answer: "If move is deleted it falls back to copy." That conflates "deleted" with "not declared".
- ✅ What a strong answer adds: deleting only the move operations while keeping copy is almost always a design error; either leave move undeclared or delete both.

**Key takeaway:** Deleted is not the same as absent: a deleted move constructor blocks the return.

---

#### Q9: How did implicit move on return change in C++11, C++14, C++20 and C++23?
**Difficulty:** #advanced
**Category:** #language_evolution #move_semantics
**Concepts:** #implicit_move #p1825 #p2266 #cwg1579

**Answer:**
C++11 introduced it for returned locals and by-value parameters (try as rvalue, then as lvalue). C++14 (CWG 1579) allowed a different return type with a converting constructor. C++20 (P1825) extended it to rvalue-reference variables and `throw` of parameters. C++23 (P2266) made the returned name simply an xvalue, which removed the two-step lookup.

**Explanation:**
- C++14 rule in action: `std::unique_ptr<Base> f() { auto p = std::make_unique<Derived>(); return p; }` compiles; `std::optional<T> f() { T t; return t; }` moves.
- C++20: `T f(T&& x) { return x; }` copies with `-std=c++17` and moves with `-std=c++20` (GCC 11). Clang 14 applies P1825 in every mode, so it already moves in C++17 mode.
- P1825 also lets `Derived d; return d;` into a `Base` return type move instead of copy.
- C++23: `T&& g(T&& x) { return x; }` compiles; `int& h(int&& x) { return x; }` stops compiling (Clang 14 `-std=c++2b`: "non-const lvalue reference to type 'int' cannot bind to a temporary of type 'int'").
- ❌ Common wrong answer: "C++11 moves any local you return." It never applied to members, globals, or expressions that are not a bare name, and still does not.
- ✅ What a strong answer adds: compilers applied CWG 1579 retroactively, so in practice C++11 mode already behaves like C++14 on modern GCC/Clang.

**Key takeaway:** Every revision widened implicit move; C++23 turned it into a value-category rule.

---

#### Q10: Is a function parameter eligible for NRVO?
**Difficulty:** #intermediate
**Category:** #object_lifetime
**Concepts:** #nrvo #parameters #abi

**Answer:**
No. A by-value parameter lives in storage created by the caller for the argument, not in the result slot, so it cannot be the result object. It is, however, implicitly moved on `return param;`.

**Explanation:**
- `T pass(T p) { return p; }` called as `pass(T{})` prints `ctor move`: the argument is constructed directly in `p` (guaranteed), then moved out.
- This is why "take by value, modify, return" (e.g. `std::string normalize(std::string s)`) costs one move on the way out, not zero.
- ❌ Common wrong answer: "The compiler can elide it like any other local." The standard excludes function parameters from NRVO.
- ✅ What a strong answer adds: the same exclusion applies to catch-clause parameters.

**Key takeaway:** Parameters: moved on return, never elided.

---

#### Q11: Why does copy elision apply to `T x = f();` but not to `x = f();`?
**Difficulty:** #beginner
**Category:** #object_lifetime #performance
**Concepts:** #initialization_vs_assignment #temporary_materialization

**Answer:**
Elision constructs an object in its destination; in assignment the destination already exists and has a value. `x = f();` materializes a temporary from the prvalue, calls `operator=(T&&)`, and destroys the temporary at the end of the full expression.

**Explanation:**
- Trace: init prints `ctor`; assignment prints `ctor move-assign dtor`.
- For containers this also discards the existing capacity of `x`; in a hot loop, reusing an object via an out-parameter or `clear()` can beat returning a fresh one each time.
- ❌ Common wrong answer: "The compiler builds the result directly in `x`." It cannot: `x`'s old state must be destroyed or reused by the assignment operator, which is user-visible logic.
- ✅ What a strong answer adds: this is one of the few legitimate reasons to prefer an out-parameter in low-latency code.

**Key takeaway:** Elision is for construction only.

---

#### Q12: You pass a `std::string` to a constructor that stores it. `const std::string&`, `std::string&&`, or by value?
**Difficulty:** #intermediate
**Category:** #api_design #performance
**Concepts:** #sink_parameter #pass_by_value #move

**Answer:**
For a parameter that is always stored, take it by value and move it into the member (the sink idiom). It costs one extra move compared with a `const&`/`&&` overload pair, but gives one function that is optimal up to that move for lvalues, xvalues and prvalues.

**Explanation:**
- Measured with a tracing type: lvalue argument → `copy move`; `std::move(x)` → `move move`; prvalue → `move` (the parameter is built in place).
- Overload pair: lvalue → `copy`; rvalue → `move`. With N sink parameters you would need 2^N overloads, or a constrained forwarding template.
- Do not use by-value for read-only parameters (`const&` or `std::string_view`), or when the type is expensive to move (`std::array<double, 1000>`).
- For `std::string` specifically, a short string (SSO) "move" copies its characters, so the extra move is cheap but not free.
- ❌ Common wrong answer: "Always `const std::string&`, by value means a copy." For a stored parameter, `const&` forces a copy even when the caller passes a temporary.
- ✅ What a strong answer adds: setters that may reuse existing capacity (`name_ = s;` into an already-large string) are a case where `const&` can beat by-value.

**Key takeaway:** Stored parameter: by value + `std::move`; read-only parameter: `const&` or a view.

---

#### Q13: Can copy elision change the output of a program?
**Difficulty:** #intermediate
**Category:** #language_rules
**Concepts:** #as_if_rule #copy_elision #side_effects

**Answer:**
Yes. Copy elision is explicitly allowed to omit copy/move constructors (and the matching destructors) even when they have side effects, such as printing or counting. It is the main exception to the as-if rule.

**Explanation:**
- Example: a constructor counter reads 1 move with `-fno-elide-constructors` (C++17) and 0 without it, for the same NRVO-able function.
- Destructor calls always match constructions; only the number of objects changes.
- Consequence: never put required behaviour (registration, refcount increments, logging that audit depends on) only in copy/move constructors.
- ❌ Common wrong answer: "Optimizations cannot change observable behaviour." True for everything else, not for elision.
- ✅ What a strong answer adds: since C++14 the compiler may also elide or merge `new`/`delete` allocations (allocation elision), the other notable exception.

**Key takeaway:** Elision may skip side-effecting constructors; design for it.

---

#### Q14: What does `-fno-elide-constructors` show in C++14 vs C++17?
**Difficulty:** #intermediate
**Category:** #tooling #language_evolution
**Concepts:** #fno_elide_constructors #guaranteed_elision

**Answer:**
In C++14 it disables all elision, so `T a = rvo();` shows two moves (local → return temporary → `a`). In C++17 it can only disable NRVO: `T a = rvo();` still prints just `ctor dtor`, while `T b = nrvo();` shows one move.

**Explanation:**
- Measured with GCC 11:
  - `-std=c++14 -fno-elide-constructors`: rvo `ctor move dtor move dtor dtor`; nrvo same.
  - `-std=c++17 -fno-elide-constructors`: rvo `ctor dtor`; nrvo `ctor move dtor dtor`.
- This is the clearest demonstration that C++17 changed the *language*, not the optimizer.
- ❌ Common wrong answer: "The flag turns off RVO in every standard."
- ✅ What a strong answer adds: use the flag to check that a type's move constructor is correct, because NRVO normally hides it in tests.

**Key takeaway:** In C++17 the flag can only reveal the NRVO fallback.

---

#### Q15: A type registers `this` in a global registry in its constructor and removes it in its destructor. Can a factory return it by value safely?
**Difficulty:** #intermediate
**Category:** #object_identity #design
**Concepts:** #guaranteed_elision #nrvo #self_referential_types

**Answer:**
Yes, if the factory returns a prvalue (`return Tracked{id};`): since C++17 the object is constructed directly in the caller's storage, so the address it registered is its final address. Returning a named local is the trap: NRVO is optional, and when it does not happen a copy or move creates a second object at a different address, so the type must either fix up the registry in its copy/move constructor or delete them.

**Explanation:**
- Address-sensitive types: objects registered by address (registries, intrusive lists, callbacks holding `this`, objects with internal pointers to their own members).
- Prvalue return (C++17): there is only ever one object, built in the result slot; deleted copy and move constructors are fine.
- Named local: even when the compiler performs NRVO, the language still requires an accessible copy or move constructor, so with both deleted `Tracked t{id}; return t;` does not compile (GCC: "use of deleted function 'Tracked::Tracked(const Tracked&)'"). That compile error is the safety net you want.
- If the type must stay movable, the move constructor has to re-register the new address and the destructor of the moved-from object must unregister the old one; `this` captured anywhere else (lambdas, other objects) is not updated.
- Elision only covers initialization from a return value: putting the object in a `std::vector` and letting it grow, or `std::swap`, still relocates it.
```cpp
#include <iostream>
#include <set>

std::set<const void*> registry;   // objects announce their address

struct Tracked {
    int id;
    explicit Tracked(int i) : id(i) { registry.insert(this); }
    ~Tracked() { registry.erase(this); }
    Tracked(const Tracked&) = delete;            // address is identity:
    Tracked& operator=(const Tracked&) = delete; // never copy or move
};

Tracked make(int id) { return Tracked{id}; }     // prvalue: guaranteed elision

int main() {
    Tracked t = make(7);
    std::cout << "registered: " << registry.count(&t) << '\n';
    std::cout << "size: " << registry.size() << '\n';
}
```
- Output: `registered: 1` and `size: 1` (one object, at the address it registered from inside its constructor).
- ❌ Common wrong answer: "Returning by value always copies, so registering `this` cannot work with factories." In C++17 a prvalue return creates exactly one object.
- ❌ Common wrong answer: "NRVO will keep the address." It usually does, but it is not guaranteed, and the code must compile without it.
- ✅ What a strong answer adds: delete copy and move for address-sensitive types; the compiler then rejects every path (named-local return, container growth, copies) that would silently create a second identity.

**Key takeaway:** Guaranteed elision makes "construct in place, never relocate" types returnable; only prvalue returns qualify.

---

#### Q16: Does returning by value mean returning a copy in modern C++?
**Difficulty:** #beginner
**Category:** #api_design
**Concepts:** #return_by_value #dangling_reference

**Answer:**
No. Returning by value means the caller gets its own object; with guaranteed elision, NRVO or implicit move, building it typically costs zero or one move. It is the default for factories and for anything computed inside the function.

**Explanation:**
- The usual alternative, returning a reference to a local (`const std::string& getName() { std::string n = "x"; return n; }`), is a dangling reference (see topic 01).
- Return a `const&` only to an object that outlives the call (a member, a static).
- ❌ Common wrong answer: "Return `const&` to avoid the copy." The referenced local is destroyed at return.
- ✅ What a strong answer adds: return by value is also thread-friendly: the caller's copy cannot change under it.

**Key takeaway:** Return values by value; elision and move make it cheap.

---

#### Q17: Why does `v.push_back(T{})` call a move constructor while `T x = T{};` does not?
**Difficulty:** #intermediate
**Category:** #object_lifetime #containers
**Concepts:** #temporary_materialization #emplace_back

**Answer:**
`push_back` takes `T&&`; binding a reference to a prvalue materializes a temporary, and the vector then move-constructs its element from that temporary. Guaranteed elision does not pass through a reference parameter. `emplace_back(args)` forwards the constructor arguments and builds the element in place.

**Explanation:**
- `v.push_back(T{})`: `ctor move dtor` (plus any reallocation moves).
- `v.emplace_back()`: `ctor`.
- `v.emplace_back(T{})` gains nothing over `push_back(T{})`: the argument is still a materialized temporary.
- ❌ Common wrong answer: "C++17 guarantees elision, so `push_back(T{})` constructs in place."
- ✅ What a strong answer adds: guaranteed elision only works when the prvalue directly initializes an object of the same type: a by-value parameter, a variable, a return value.
```cpp
#include <iostream>
#include <vector>

struct T {
    T() { std::cout << "ctor "; }
    T(T&&) noexcept { std::cout << "move "; }
    ~T() { std::cout << "dtor "; }
};

int main() {
    std::vector<T> v;
    v.reserve(4);                                     // no reallocation moves
    std::cout << "push_back: ";   v.push_back(T{});   std::cout << '\n';
    std::cout << "emplace_back: "; v.emplace_back();  std::cout << '\n';
    std::cout << "end: ";
}
```
- Output:
```
push_back: ctor move dtor 
emplace_back: ctor 
end: dtor dtor 
```

**Key takeaway:** Reference parameters materialize temporaries; only `emplace` constructs in place.

---
