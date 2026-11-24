## TOPIC: Value Categories, std::move and Moved-From State

### THEORY_SECTION: Core Concepts

#### 1. Mental model
- Every **expression** has two independent properties: a **type** (`int`, `std::string`) and a **value category** (lvalue, xvalue, prvalue).
- Value categories belong to expressions, not to variables or types. "`s` is an lvalue" means "the expression `s` is an lvalue"; the variable `s` has a type.
- The category answers two questions the compiler cares about:
  - **Has identity?** Does the expression refer to an object with an address you can name again (lvalue, xvalue)?
  - **Can be moved from?** May its resources be stolen because nobody will look at it again (xvalue, prvalue)?
- Move semantics is a protocol on top of that:
  1. An expression is marked "may be moved from" (an rvalue).
  2. Overload resolution prefers `T&&` overloads for rvalues.
  3. The selected function (move constructor, move assignment, `push_back(T&&)`) actually transfers resources.
- `std::move` does only step 1. It never moves anything by itself.

#### 2. The taxonomy
```
                expression
               /          \
          glvalue        rvalue
         /       \      /      \
     lvalue      xvalue      prvalue
```
- **glvalue** ("generalized lvalue"): has identity (lvalue or xvalue).
- **rvalue**: can be moved from (xvalue or prvalue).
- **lvalue**: identity, not movable by default.
- **xvalue** ("expiring value"): identity **and** movable. Produced by casts to `T&&` (`std::move(x)`), functions returning `T&&`, member access on an rvalue object.
- **prvalue** ("pure rvalue"): no identity; a recipe that initializes an object. Since C++17 a prvalue is not even an object until it is materialized (which is why guaranteed copy elision works, topic 04).

| Expression | Category | Why |
|---|---|---|
| `x` (any named variable, even of type `T&&`) | lvalue | Has a name |
| `*p`, `arr[i]`, `++x`, `x = y`, `std::cout << 1` | lvalue | Refers to an existing object |
| `"abc"` (string literal) | lvalue | An array with static storage |
| `f()` returning `T&` | lvalue | |
| `42`, `true`, `nullptr`, enumerator | prvalue | |
| `x++`, `a + b`, `&x`, `this`, lambda expression | prvalue | Produces a new value |
| `f()` returning `T` by value, `T{}`, `T(args)` | prvalue | |
| `std::move(x)`, `static_cast<T&&>(x)` | xvalue | Cast to rvalue reference |
| `f()` returning `T&&` | xvalue | |
| `std::move(obj).member`, `T{}.member` | xvalue | Member of an expiring object |
| `cond ? a : b` (both lvalues of same type) | lvalue | |

#### 3. Asking the compiler: decltype((expr))
- `decltype(name)` (no extra parentheses) gives the **declared type** of the variable.
- `decltype((expr))` (double parentheses, or any non-name expression) encodes the value category:
  - lvalue → `T&`
  - xvalue → `T&&`
  - prvalue → `T`
- Example: `int x; int&& r = 1;`
  - `decltype(x)` is `int`; `decltype((x))` is `int&`.
  - `decltype(r)` is `int&&` (declared type); `decltype((r))` is `int&` (the expression `r` is an lvalue).
  - `decltype((std::move(x)))` is `int&&`; `decltype((x + 1))` is `int`.
- Trap: `decltype(auto) f() { int x = 1; return (x); }` deduces `int&` and returns a dangling reference (GCC: "reference to local variable 'x' returned").

#### 4. Reference binding and overload resolution
| Parameter | Binds to lvalues | Binds to rvalues | Typical use |
|---|---|---|---|
| `T&` | non-const only | ❌ | Out-parameter, modify caller's object |
| `const T&` | ✅ | ✅ (extends a temporary's lifetime) | Read-only, "accept anything" |
| `T&&` | ❌ | non-const only | Sink: steal from the argument |
| `const T&&` | ❌ | ✅ | Almost never; used to `= delete` rvalue overloads (`std::ref(T&&)`) |

- When several overloads are viable, the more specific binding wins:
  - non-const lvalue: `T&` beats `const T&`.
  - const lvalue: only `const T&` (and `const T&&` does not bind lvalues).
  - non-const rvalue: `T&&` beats `const T&&` beats `const T&`.
  - const rvalue (`std::move(constObj)`): `const T&&` if declared, otherwise `const T&`.
- This ranking is exactly why "move or copy?" works: copy constructor takes `const T&`, move constructor takes `T&&`; an rvalue prefers the move constructor, and anything the move constructor cannot accept falls back to the copy constructor.
- `T&&` in a template parameter (`template<class T> void f(T&& x)`) is a **forwarding reference**, not an rvalue reference; it binds to everything (Chapter 1 covers `std::forward`).

#### 5. std::move is a cast
- Essentially:
```cpp
template <class T>
constexpr std::remove_reference_t<T>&& move(T&& t) noexcept {
    return static_cast<std::remove_reference_t<T>&&>(t);
}
```
- It produces an xvalue of the same type, keeping `const`. No code runs, no memory changes. `std::move(a);` as a statement does nothing at all (libstdc++ marks it `[[nodiscard]]`, so GCC warns "ignoring return value").
- The **move happens later**, in whichever function receives the xvalue: `T b(std::move(a));` runs the move constructor; `f(std::move(a))` with `f(const T&)` moves nothing.
- Three classic "it copies anyway" cases:
  1. **const source**: `const T a; T b = std::move(a);` → `std::move(a)` is `const T&&`; `T(T&&)` cannot bind it (moving modifies the source); `T(const T&)` can. Copy.
  2. **const reference parameter**: `void f(const T& p) { T local = std::move(p); }` → same: copy. The `std::move` is misleading noise.
  3. **No move constructor**: a class with a user-declared destructor or copy (topic 02). Copy.
- Moving a scalar (`int`, `double`, raw pointer) is a copy; the source keeps its value.
- Interview sentence: "`std::move` doesn't move; it casts to an xvalue so that overload resolution can choose a move. Whether anything moves depends on the overload chosen."

#### 6. Named rvalue references are lvalues
- `void sink(std::string&& s)`: inside the function, the **expression** `s` is an lvalue (it has a name and can be used many times).
  - `std::string x = s;` copies.
  - `std::string x = std::move(s);` moves.
- Rationale: if a named rvalue reference were an rvalue, the first use would steal it and every later use would see a moved-from object.
- Same for local `T&& r = make();` and for `auto&& r = ...;`.
- Binding to `T&&` does not move: `process(std::move(s))` where `process(std::string&& p)` only reads `p` leaves `s` unchanged. The parameter is a reference to the caller's object.
- Corollary for API design: a function taking `T&&` promises "I may steal"; it is not forced to. Callers must assume the object is moved-from after the call.

#### 7. Ref-qualified member functions
- A member function can overload on the value category of `*this` with `&` and `&&` qualifiers (C++11):
```cpp
class Message {
    std::string body_;
public:
    const std::string& body() const& { return body_; }        // lvalue object: view
    std::string body() && { return std::move(body_); }         // rvalue object: steal
};
```
- `msg.body()` returns a reference; `std::move(msg).body()` and `makeMessage().body()` move the string out (one move, no copy).
- Also used to forbid calls on temporaries: `int* data() && = delete;` prevents `make().data()` (a pointer into a dying object).
- If one overload of a member function has a ref-qualifier, every overload with the same parameter list must have one too (mixing `body() const&` with an unqualified `body()` is an error).
- The standard library uses this: `std::optional::value() &&`, `std::move(opt).value()` moves the contained value; `std::get<I>(std::move(tuple))` returns `T&&`.
- C++23 "deducing this" (`template<class Self> auto&& get(this Self&& self)`) writes all four `&`/`const&`/`&&`/`const&&` versions once.

#### 8. Moved-from state: valid but unspecified
- After a move, the source **object still exists**: its lifetime has not ended, its destructor will run, references to it are not dangling.
- Its **value** is "valid but unspecified" for standard library types ([lib.types.movedfrom]):
  - ✅ Always allowed: destroy it, assign a new value, call functions with no preconditions (`size()`, `empty()`, `clear()`).
  - ❌ Not allowed to assume: its old value, or that it is empty. Functions with preconditions (`front()`, `operator*`, `back()`) need a check first.
- Many types do specify more. Know which:

| Type | After move construction from it | Guaranteed? |
|---|---|---|
| `int`, `double`, raw `T*` | Unchanged (move = copy) | Yes |
| `std::unique_ptr<T>` | `nullptr` | Yes |
| `std::shared_ptr<T>`, `std::weak_ptr<T>` | Empty, `use_count() == 0` | Yes |
| `std::thread`, `std::unique_lock`, `std::jthread` | No thread / no mutex | Yes |
| `std::vector<T>` (move ctor) | Empty | Effectively yes (constant-time move ctor, elements now belong to the new vector) |
| `std::vector<T>` (move assign) | Empty with `std::allocator` | Not in general (unequal allocators move element-wise) |
| `std::string` | Empty in libstdc++, libc++, MSVC | No: valid but unspecified |
| `std::optional<T>` | **Still engaged**; the contained `T` is moved-from | Yes (`has_value()` stays `true`) |
| `std::variant<...>` | Same alternative, moved-from | Yes (index unchanged) |
| `std::function`, `std::any` | Empty in libstdc++ | No: valid but unspecified |
| Your own class | Whatever you document | You decide |

- Distinguish **move** from **destruction**: `std::string s2 = std::move(*opt);` leaves `opt` engaged with a moved-from string (references into `*opt` still refer to a live object); `opt.reset()` destroys the string and makes such references dangling.
- Safe reuse pattern: assign or `clear()` before reading a moved-from object: `buf.clear(); buf += "next";`.

#### 9. Pointers and references into a moved-from object's resource
- "The move transferred the pointer, so my old pointer is still valid" is only true when the **type guarantees** it.

| Type | Old pointer/reference/iterator into the resource after `T b = std::move(a);` |
|---|---|
| `std::unique_ptr<T>` / `shared_ptr<T>` | Valid: the pointee never moved; only the owner changed |
| `std::vector<T>`, `std::deque`, `std::list`, maps | Valid in every implementation, now refer into `b` (the move constructor is constant time and takes over the elements; making this explicit wording is LWG 2321, still open; `std::array` excluded; past-the-end iterators excluded: node containers such as `std::list` keep their sentinel inside the object) |
| `std::string` | **May be invalidated** ([string.require]: any library function taking a non-const `basic_string&` may invalidate) |
| Your class | Whatever your move contract says |

- Why `std::string` differs: SSO. A short string stores its characters inside the object, so moving copies them into `b`, and a pointer from `a.data()` still points into `a`. With libstdc++:
  - short string: `b.data() != old pointer` (the old pointer points into `a`, which now holds an empty string).
  - long (heap) string: `b.data() == old pointer` in practice, but the standard does not promise it.
- Vector reallocation is a different event: it moves every element to new storage and invalidates all pointers, references and iterators **to the elements**.

#### 10. move_if_noexcept and the strong guarantee
- `std::move_if_noexcept(x)` returns `T&&` if `T`'s move constructor is `noexcept` **or** `T` is not copyable; otherwise it returns `const T&` (so the copy constructor is chosen).
- It is a conditional cast: the trait test is `!is_nothrow_move_constructible_v<T> && is_copy_constructible_v<T>` (then `const T&`), decided at compile time from the declared `noexcept` of the move constructor (move assignment is irrelevant).
- `std::vector` passes each element through it when relocating during growth (`push_back`, `reserve`, `resize`); why it wants to copy rather than risk a throwing move (the strong guarantee) is explained in topic 02.
- Outcomes:
  - `noexcept` move → moves.
  - Throwing move + copy available → copies.
  - Throwing move + no copy (move-only) → moves anyway; the guarantee drops to basic.
- The class-side fix (mark moves `noexcept`, do not add needless destructors) and the measured cost of getting it wrong are in topic 02.

#### 11. Misconceptions to unlearn
- ❌ "`std::move` makes it a prvalue." ✅ It produces an xvalue.
- ❌ "`std::move` moves the object." ✅ It is a cast; the move constructor or move assignment moves.
- ❌ "An rvalue reference variable is an rvalue." ✅ A named variable is always an lvalue expression, whatever its type.
- ❌ "lvalue/rvalue is part of the type." ✅ It is a property of the expression; `std::string&&` is a type, "xvalue" is a category.
- ❌ "Passing `std::move(s)` to a function means `s` is now empty." ✅ Only if the callee actually moved from it.
- ❌ "`std::move` on a const object moves." ✅ It copies, silently.
- ❌ "A moved-from object is destroyed / dangling." ✅ It is alive, in a valid but unspecified state.
- ❌ "A moved-from string or vector is guaranteed empty." ✅ `vector`'s move constructor effectively is; `string` is only "valid but unspecified" (empty in practice).
- ❌ "A moved-from `optional` is empty." ✅ It stays engaged.
- ❌ "If the move constructor is deleted, the copy constructor is used instead." ✅ A deleted function still wins overload resolution; the code does not compile.
- ❌ "After a move, pointers into the old buffer are always valid because the pointer was stolen." ✅ Type-specific: guaranteed for `unique_ptr`, reliable in practice for containers (except `std::array`), explicitly not promised for `std::string`.

### EDGE_CASES: Traps and Misconceptions

#### Edge Case 1: std::move on a const object silently copies
- `const std::string s = "..."; std::string t = std::move(s);` compiles without a warning and copies.
- Same with `const` locals returned with `return std::move(x);`, `const` members moved in a constructor, and `const auto&` loop variables: `for (const auto& e : v) out.push_back(std::move(e));` copies every element.
- clang-tidy `performance-move-const-arg` flags these; compilers do not.
- Rule: never move from something declared `const`; drop the `const` when you intend to move.

#### Edge Case 2: A non-mutable lambda capture is const
- `auto job = [buf = std::move(buf)] { send(std::move(buf)); };` moves `buf` **into** the closure, but inside a non-mutable lambda the captured member is `const`. `std::move(buf)` is `const std::string&&`: copy.
- Calling the lambda twice "works" twice, which hides the bug.
- Fix: `[buf = std::move(buf)]() mutable { send(std::move(buf)); }`.

#### Edge Case 3: Named rvalue reference parameters copy unless moved again
- `Order(std::string&& id) : id_(id) {}` copies: `id` is an lvalue inside the constructor.
- Correct: `id_(std::move(id))`.
- The same applies to every use of an rvalue-reference parameter: move it exactly once, on its last use.
- Better API for sinks: take by value, `Order(std::string id) : id_(std::move(id)) {}`, one overload for both lvalue and rvalue callers (topic 04 discusses sink parameters).

#### Edge Case 4: Binding to T&& does not move
- `void log(std::string&& m) { std::cout << m; }` then `log(std::move(s));` leaves `s` intact: the parameter is a reference to `s`.
- Code that later reads `s` works today and breaks when someone changes `log` to store the message (`queue.push_back(std::move(m))`).
- Treat every `std::move(x)` as "x is moved-from after this line" regardless of what the callee currently does.

#### Edge Case 5: Moving and reading the same object in one call
- `f(std::move(s), s.size())` with `f(std::string, std::size_t)`: the order in which function parameters are initialized is unspecified (C++17 made them indeterminately sequenced, not left to right).
- Measured: GCC 11 (x86-64) evaluates right to left and passes `n=30`; Clang 14 evaluates left to right, moves first, and passes `n=0`.
- Same trap with constructor arguments, `map.emplace(std::move(key), key.size())`, and builder chains.
- Fix: read first into a local (`auto n = s.size(); f(std::move(s), n);`).

#### Edge Case 6: A deleted move constructor does not fall back to copy
- `struct W { W(const W&); W(W&&) = delete; };` then `W b(std::move(a));` is a compile error: "use of deleted function 'W::W(W&&)'".
- Overload resolution happens first (the `W&&` overload is the best match for an xvalue), deletion is checked after. Deleting the move constructor makes rvalue copies impossible, not "copy-only".
- To make a type copy-only, do not declare a move constructor at all; declare the copy operations (topic 02). For the `return local;` version of this trap see topic 04.

#### Edge Case 7: Pointers into a moved string
- `const char* p = s.data(); std::string t = std::move(s);`
- Short string (SSO): `p` points into `s`'s inline buffer, which now holds an empty string; `t.data() != p`. Reading `p` reads `s`'s current (empty) contents, not `t`'s.
- Long string: in libstdc++ `t.data() == p`, but [string.require] allows invalidation, so code that keeps `p` relies on an implementation detail.
- `std::string_view` into a string has the same problem: a view of a moved-from string is not a view of the moved-to string.

#### Edge Case 8: The moved-from optional is still engaged
- `std::optional<std::string> o = "order"; std::string s = std::move(*o);`
- `o.has_value()` is still `true`; `*o` is a moved-from (empty in practice) string. Code testing `if (o)` to mean "not consumed yet" is wrong.
- `std::move(o)` into another optional also leaves `o` engaged.
- To consume: `std::string s = std::move(*o); o.reset();` (C++23 has no `take()`; some codebases write `std::exchange(o, std::nullopt)`).

#### Edge Case 9: decltype((x)) and decltype(auto)
- `decltype(auto) get() { return (member_); }` returns `T&`, `return member_;` returns `T`: parentheses change the deduced type.
- With a local variable this returns a dangling reference (warning `-Wreturn-local-addr`, then UB).
- Rule: in `decltype(auto)` functions, never parenthesize a returned name unless you mean to return a reference to it.

### CODE_EXAMPLES: Practical Demonstrations

#### Example 1: Printing the value category of expressions
- A variable template specialized on `decltype((e))` reports the category.
```cpp
#include <iostream>
#include <string>
#include <utility>

template <class T> constexpr const char* category = "prvalue";
template <class T> constexpr const char* category<T&> = "lvalue";
template <class T> constexpr const char* category<T&&> = "xvalue";
#define CAT(e) std::cout << #e << " -> " << category<decltype((e))> << '\n'

struct Pair { std::string first; };
int& ref_fn();
int&& rref_fn();
int val_fn();

int main() {
    int x = 0;
    int&& r = 5;
    int* p = &x;
    CAT(x);
    CAT(r);                 // named rvalue reference: still an lvalue
    CAT(*p);
    CAT("abc");
    CAT(++x);
    CAT(x++);
    CAT(42);
    CAT(x + 1);
    CAT(std::move(x));
    CAT(static_cast<int&&>(x));
    CAT(ref_fn());
    CAT(rref_fn());
    CAT(val_fn());
    CAT(Pair{}.first);      // member of a prvalue: materialized, then xvalue
    CAT(std::string("s"));
}
```
- Output:
```
x -> lvalue
r -> lvalue
*p -> lvalue
"abc" -> lvalue
++x -> lvalue
x++ -> prvalue
42 -> prvalue
x + 1 -> prvalue
std::move(x) -> xvalue
static_cast<int&&>(x) -> xvalue
ref_fn() -> lvalue
rref_fn() -> xvalue
val_fn() -> prvalue
Pair{}.first -> xvalue
std::string("s") -> prvalue
```
- `decltype` does not evaluate its operand, so the undefined `ref_fn` etc. never need definitions, and `++x`/`x++` do not run.

#### Example 2: Overload resolution with all four reference kinds
- Shows which overload each argument selects, and what happens when the `const T&&` overload is missing.
```cpp
#include <iostream>
#include <utility>

struct T {};
const T make_const() { return {}; }

void f(T&)        { std::cout << "T&\n"; }
void f(const T&)  { std::cout << "const T&\n"; }
void f(T&&)       { std::cout << "T&&\n"; }
void f(const T&&) { std::cout << "const T&&\n"; }

void g(const T&)  { std::cout << "g(const T&)\n"; }
void g(T&&)       { std::cout << "g(T&&)\n"; }

int main() {
    T a;
    const T ca;
    f(a);                 // non-const lvalue
    f(ca);                // const lvalue
    f(T{});               // prvalue
    f(std::move(a));      // xvalue
    f(std::move(ca));     // const xvalue
    f(make_const());      // const prvalue
    g(std::move(ca));     // no const&& overload: falls back to const&
    T&& named = T{};
    g(named);             // named rvalue reference is an lvalue
}
```
- Output:
```
T&
const T&
T&&
T&&
const T&&
const T&&
g(const T&)
g(const T&)
```
- `g` mirrors a class with copy constructor `(const T&)` and move constructor `(T&&)`: a const rvalue and a named rvalue reference both end up in the "copy".
- Returning `const T` by value (like `make_const`) is an anti-pattern: the caller gets a const rvalue that cannot be moved from. GCC warns only for scalar return types (`-Wignored-qualifiers`), not for class types like this one.

#### Example 3: std::move is only a cast
- A home-made `my_move` behaves identically; nothing happens until a function consumes the xvalue.
```cpp
#include <iostream>
#include <string>
#include <type_traits>
#include <utility>

template <class T>
constexpr std::remove_reference_t<T>&& my_move(T&& t) noexcept {
    return static_cast<std::remove_reference_t<T>&&>(t);
}

void reads(std::string&& s) { std::cout << "reads: " << s << '\n'; }
void steals(std::string&& s) { std::string mine = std::move(s); std::cout << "steals: " << mine << '\n'; }

int main() {
    std::string s = "market data";
    const std::string cs = "const";
    static_assert(std::is_same_v<decltype(my_move(s)), std::string&&>);
    static_assert(std::is_same_v<decltype(std::move(cs)), const std::string&&>);

    std::string&& r = my_move(s);           // a reference: nothing moved
    std::cout << "after cast: '" << s << "'\n";
    reads(std::move(s));                    // binds, does not move
    std::cout << "after reads: '" << s << "'\n";
    steals(std::move(s));                   // move constructor runs inside steals
    std::cout << "after steals: size " << s.size() << '\n';
    (void)r;
}
```
- Output:
```
after cast: 'market data'
reads: market data
after reads: 'market data'
steals: market data
after steals: size 0
```
- `size 0` is libstdc++ behaviour for a moved-from string; the standard only says "valid but unspecified".

#### Example 4: Moved-from states of standard types
- What libstdc++ leaves behind, and which lines are guaranteed by the standard.
```cpp
#include <iostream>
#include <memory>
#include <optional>
#include <string>
#include <utility>
#include <vector>

int main() {
    std::cout << std::boolalpha;
    int i = 7;
    int j = std::move(i);
    std::cout << "int: " << i << '\n';                                  // guaranteed (copy)

    auto up = std::make_unique<int>(1);
    auto up2 = std::move(up);
    std::cout << "unique_ptr null: " << (up == nullptr) << '\n';        // guaranteed

    auto sp = std::make_shared<int>(1);
    auto sp2 = std::move(sp);
    std::cout << "shared_ptr use_count: " << sp.use_count() << '\n';    // guaranteed 0

    std::vector<int> v{1, 2, 3};
    auto v2 = std::move(v);
    std::cout << "vector size: " << v.size() << '\n';                   // move ctor: empty
    v.push_back(4);                                                     // reuse is fine
    std::cout << "vector reused: " << v.size() << '\n';

    std::string s(40, 'x');
    auto s2 = std::move(s);
    std::cout << "string size: " << s.size() << '\n';                   // unspecified

    std::optional<std::string> o = std::string(40, 'y');
    auto s3 = std::move(*o);
    std::cout << "optional engaged: " << o.has_value()
              << ", inner size " << o->size() << '\n';                  // engaged guaranteed
    (void)j; (void)up2; (void)sp2; (void)v2; (void)s2; (void)s3;
}
```
- Output (g++ 11, libstdc++):
```
int: 7
unique_ptr null: true
shared_ptr use_count: 0
vector size: 0
vector reused: 1
string size: 0
optional engaged: true, inner size 0
```

#### Example 5: Which pointers survive a move?
- `unique_ptr` and `vector` keep their pointees in place; a short `std::string` does not.
```cpp
#include <iostream>
#include <memory>
#include <string>
#include <utility>
#include <vector>

int main() {
    std::cout << std::boolalpha;

    auto up = std::make_unique<int>(42);
    int* raw = up.get();
    auto up2 = std::move(up);
    std::cout << "unique_ptr pointee same: " << (raw == up2.get()) << '\n';

    std::vector<int> v{1, 2, 3};
    int* first = &v[0];
    auto v2 = std::move(v);
    std::cout << "vector element same: " << (first == &v2[0]) << '\n';

    std::string shortS = "hi";
    const char* ps = shortS.data();
    std::string t1 = std::move(shortS);
    std::cout << "short string buffer same: " << (ps == t1.data()) << '\n';

    std::string longS(100, 'z');
    const char* pl = longS.data();
    std::string t2 = std::move(longS);
    std::cout << "long string buffer same: " << (pl == t2.data()) << '\n';
}
```
- Output (g++ 11, libstdc++):
```
unique_ptr pointee same: true
vector element same: true
short string buffer same: false
long string buffer same: true
```
- Line 1 is guaranteed by the standard. Line 2 holds in every implementation (constant-time move constructor; the explicit wording is LWG 2321, still open). Line 4 is an implementation result: `std::string` is allowed to invalidate.

#### Example 6: Ref-qualified getters
- An `&&`-qualified overload moves the member out of an expiring object; the `const&` overload hands out a reference.
```cpp
#include <iostream>
#include <string>
#include <utility>

class Message {
    std::string body_;
public:
    explicit Message(std::string b) : body_(std::move(b)) {}
    const std::string& body() const& { std::cout << "[const&] "; return body_; }
    std::string body() && { std::cout << "[&&] "; return std::move(body_); }
};

Message receive() { return Message(std::string(40, 'p')); }

int main() {
    Message m(std::string(40, 'q'));
    const std::string& view = m.body();          // lvalue object: reference
    std::cout << view.size() << '\n';

    std::string owned = receive().body();        // temporary object: moved out
    std::cout << owned.size() << '\n';

    std::string taken = std::move(m).body();     // explicit: m is now moved-from
    std::cout << taken.size() << ' ' << m.body().size() << '\n';
}
```
- Output:
```
[const&] 40
[&&] 40
[&&] 40 [const&] 0
```
- Without the `&&` overload, `receive().body()` would return a reference into a temporary and `owned` would be a copy (or, with `auto&&`, a dangling reference).

#### Example 7: move_if_noexcept decides vector's relocation strategy
- Three element types: `noexcept` move, throwing move with copy, throwing move-only.
```cpp
#include <iostream>
#include <type_traits>
#include <utility>
#include <vector>

struct NoThrowMove {
    NoThrowMove() = default;
    NoThrowMove(const NoThrowMove&) { std::cout << "copy "; }
    NoThrowMove(NoThrowMove&&) noexcept { std::cout << "move "; }
};
struct ThrowingMove {
    ThrowingMove() = default;
    ThrowingMove(const ThrowingMove&) { std::cout << "copy "; }
    ThrowingMove(ThrowingMove&&) { std::cout << "move "; }
};
struct MoveOnly {
    MoveOnly() = default;
    MoveOnly(const MoveOnly&) = delete;
    MoveOnly(MoveOnly&&) { std::cout << "move "; }          // may throw, but no copy
};

template <class T>
void relocate(const char* name) {
    using R = decltype(std::move_if_noexcept(std::declval<T&>()));
    std::cout << name << " (move_if_noexcept gives "
              << (std::is_rvalue_reference_v<R> ? "T&&" : "const T&") << "): ";
    std::vector<T> v(2);
    v.reserve(3);
    std::cout << '\n';
}

int main() {
    relocate<NoThrowMove>("NoThrowMove");
    relocate<ThrowingMove>("ThrowingMove");
    relocate<MoveOnly>("MoveOnly");
}
```
- Output:
```
NoThrowMove (move_if_noexcept gives T&&): move move 
ThrowingMove (move_if_noexcept gives const T&): copy copy 
MoveOnly (move_if_noexcept gives T&&): move move 
```
- `MoveOnly` is moved even though the move may throw: there is no alternative. If one of those moves threw, `reserve` would offer only the basic guarantee.

### QUICK_REFERENCE: Cheat Sheet

#### Category quick test
| Expression form | Category |
|---|---|
| Name of a variable (any type, incl. `T&&`) | lvalue |
| `*p`, `a[i]`, `++x`, `x = y`, string literal, call returning `T&` | lvalue |
| Literal (non-string), `x++`, `a + b`, `&x`, `this`, lambda, call returning `T`, `T{}` | prvalue |
| `std::move(x)`, `static_cast<T&&>(x)`, call returning `T&&`, `rvalue.member` | xvalue |
| `decltype((e))` | `T&` / `T&&` / `T` for lvalue / xvalue / prvalue |

#### Does it move?
| Code | Result |
|---|---|
| `T b = std::move(a);` | Move ctor (copy if `T` has no move ctor) |
| `const T a; T b = std::move(a);` | Copy |
| `void f(const T& p) { T x = std::move(p); }` | Copy |
| `void f(T&& p) { T x = p; }` | Copy (`p` is an lvalue) |
| `void f(T&& p) { T x = std::move(p); }` | Move |
| `f(std::move(a))` with `f(T&&)` that only reads | Nothing moves |
| `[s = std::move(s)] { use(std::move(s)); }` | Capture moves; inner move copies (const) |
| `W b(std::move(a));` with `W(W&&) = delete` | Compile error |
| `std::move(x)` for `int`/pointer | Copy; source unchanged |

#### Moved-from guarantees
| Type | State |
|---|---|
| `unique_ptr`, `shared_ptr`, `thread`, `unique_lock` | Empty (guaranteed) |
| `vector` move-constructed from | Empty (effectively guaranteed) |
| `string`, `function`, `any` | Valid but unspecified (empty in practice) |
| `optional<T>` | Still engaged, `T` moved-from |
| Scalars | Unchanged |

#### Interview one-liners
| Question | Answer |
|---|---|
| What does `std::move` do? | `static_cast<T&&>`: makes an xvalue; moves nothing |
| What category is `std::move(x)`? | xvalue (not prvalue) |
| Is a `T&&` parameter an rvalue inside the function? | No, a named variable is an lvalue |
| `std::move` on const? | `const T&&` → copy constructor |
| Moved-from object? | Alive; valid but unspecified; destroy or assign it |
| Moved-from `optional`? | Still engaged |
| Pointer into moved `unique_ptr`'s object? | Still valid |
| Pointer into moved `std::string`? | Not guaranteed (SSO makes it fail in practice) |
| Deleted move ctor? | No fallback to copy: compile error |
| `move_if_noexcept`? | `T&&` if nothrow-movable or not copyable, else `const T&` |
| Ref-qualifiers? | Overload members on `*this` being lvalue (`&`) or rvalue (`&&`) |
