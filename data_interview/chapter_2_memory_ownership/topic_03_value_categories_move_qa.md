## TOPIC: Value Categories, std::move and Moved-From State

### INTERVIEW_QA: Interview Questions with Detailed Answers

#### Q1: What are lvalues, xvalues and prvalues? How do glvalue and rvalue fit in?
**Difficulty:** #beginner
**Category:** #value_categories #language_rules
**Concepts:** #lvalue #xvalue #prvalue #glvalue #rvalue

**Answer:**
Every expression is exactly one of lvalue (has identity, not movable by default), xvalue (has identity and may be moved from) or prvalue (no identity, a value that initializes an object). glvalue = lvalue or xvalue (has identity); rvalue = xvalue or prvalue (may be moved from).

**Explanation:**
- Examples:
  - lvalue: `x`, `*p`, `v[i]`, `++x`, `"abc"`, a call returning `T&`.
  - xvalue: `std::move(x)`, `static_cast<T&&>(x)`, a call returning `T&&`, `std::move(obj).member`.
  - prvalue: `42`, `x + 1`, `x++`, `T{}`, a call returning `T` by value.
- Categories are properties of **expressions**, not of variables or types. A variable of type `std::string&&` used by name is an lvalue expression.
- Since C++17 a prvalue is not an object until it is materialized; that is what makes `T x = T{};` construct `x` directly (topic 04).
- ❌ Common wrong answer: "lvalue is on the left of `=`, rvalue on the right." `const int c = 1;` is an lvalue that cannot be assigned; `std::string() = "x"` assigns to a prvalue (class types allow it).
- ✅ What a strong answer adds: a way to check: `decltype((expr))` is `T&` for lvalues, `T&&` for xvalues, `T` for prvalues.

**Key takeaway:** Identity and movability are the two axes; the three leaf categories are their combinations.

---

#### Q2: What does `std::move` actually do? Does it move any memory?
**Difficulty:** #beginner
**Category:** #move_semantics #value_categories
**Concepts:** #std_move #static_cast #xvalue #overload_resolution

**Answer:**
`std::move(x)` is a cast, essentially `static_cast<std::remove_reference_t<T>&&>(x)`. It produces an xvalue so that overload resolution can select a move constructor, move assignment or other `T&&` overload. It moves nothing and touches no memory; the selected function does the moving.

**Explanation:**
- `std::move(a);` as a statement has no effect (libstdc++ marks it `[[nodiscard]]`; GCC warns "ignoring return value").
- `Buffer b(std::move(a));`: the cast is followed by overload resolution, which picks `Buffer(Buffer&&)`; the move constructor transfers the pointer.
- It does not change `a` itself or its type: it changes how the **expression** `a` is treated in that one place. After the line, the expression `a` is an lvalue again.
- ❌ Common wrong answer: "`std::move` changes the variable into an rvalue reference." It produces a new expression; the variable is untouched.
- ❌ Common wrong answer: "`std::move` guarantees a move." If the only viable overload takes `const T&`, a copy happens.
- ✅ What a strong answer adds: "`std::move` is permission, not action: it says *I no longer need this value*; whether anything moves depends on the overload chosen."

**Key takeaway:** `std::move` is a cast to xvalue; the move constructor or move assignment does the move.

---

#### Q3: Is `std::move(a)` a prvalue?
**Difficulty:** #beginner
**Category:** #value_categories
**Concepts:** #xvalue #prvalue #identity

**Answer:**
No, it is an xvalue. It still refers to the same object `a` (it has identity), but it is marked as movable. A prvalue has no identity: `Buffer(100)` or `make()` returning by value.

**Explanation:**
- The difference is observable: `&std::move(a)` does not compile (cannot take the address of an rvalue), but `std::move(a)` refers to `a`'s storage: binding it to `Buffer&& r` gives `&r == &a`.
- Prvalues initialize a new result object directly (guaranteed elision); xvalues are existing objects, so initializing from them runs a constructor (move or copy).
- ❌ Common wrong answer: "`std::move` makes it a prvalue so the move constructor is chosen." The move constructor's `T&&` parameter binds to both kinds of rvalues; the category is xvalue.
- ✅ What a strong answer adds: `T b = std::move(a);` always calls a constructor; `T b = T();` calls none of the copy/move constructors. That is the practical difference between xvalue and prvalue.

**Key takeaway:** `std::move(x)` = xvalue: same object, now movable.

---

#### Q4: `const Data a; Data b = std::move(a);` Does this move or copy?
**Difficulty:** #intermediate
**Category:** #move_semantics #overload_resolution
**Concepts:** #const #std_move #copy_constructor

**Answer:**
It copies. `std::move(a)` has type `const Data&&`. The move constructor `Data(Data&&)` cannot bind a const rvalue (moving would modify the source), but the copy constructor `Data(const Data&)` can, so it is selected.

**Explanation:**
```cpp
#include <iostream>
#include <utility>

struct Data {
    Data() = default;
    Data(const Data&) { std::cout << "copy\n"; }
    Data(Data&&) noexcept { std::cout << "move\n"; }
};

int main() {
    const Data a;
    Data b = std::move(a);    // const Data&& -> copy
    Data c;
    Data d = std::move(c);    // Data&& -> move
}
```
- Output:
```
copy
move
```
- No warning from GCC or Clang; clang-tidy `performance-move-const-arg` catches it.
- `b` itself is not const; a copy of a const object can be non-const.
- ❌ Common wrong answer: "Compile error: cannot move from const." It compiles and silently copies.
- ✅ What a strong answer adds: the same applies to `std::string`, any `const` local you return with `std::move`, and `const auto&` loop variables.

| Expression | Type of the argument | Constructor |
|---|---|---|
| `Data b = a;` (a const) | `const Data&` | Copy |
| `Data b = std::move(a);` (a const) | `const Data&&` | Copy |
| `Data b = std::move(nonConst);` | `Data&&` | Move |

**Key takeaway:** `std::move` keeps `const`; const rvalues copy.

---

#### Q5: Many people write `void process(const Data& d) { Data local = std::move(d); }`. Copy or move? Why is it misleading?
**Difficulty:** #intermediate
**Category:** #move_semantics #api_design
**Concepts:** #const_reference #std_move #sink_parameter

**Answer:**
It copies: `d` is `const Data&`, so `std::move(d)` is `const Data&&`, which only the copy constructor accepts. The `std::move` suggests an optimization that does not happen.

**Explanation:**
- A `const&` parameter promises not to modify the caller's object; moving would modify it, so the type system refuses.
- If the function wants to keep its own copy cheaply, change the signature:
  - Sink by value: `void process(Data d) { store(std::move(d)); }`: lvalue callers pay one copy, rvalue callers pay only moves.
  - Overload pair: `process(const Data&)` (copy) + `process(Data&&)` (move).
- ❌ Common wrong answer: "It moves because of `std::move`."
- ✅ What a strong answer adds: "The callee cannot decide to steal from a `const&`; only the signature can grant that permission."

**Key takeaway:** You cannot move out of a `const&`; change the parameter, not the body.

---

#### Q6: `Buffer&& a = Buffer(100); Buffer b(a);` Is `a` an rvalue here? Which constructor runs?
**Difficulty:** #intermediate
**Category:** #value_categories
**Concepts:** #named_rvalue_reference #lvalue #copy_constructor

**Answer:**
`a` has type `Buffer&&`, but the expression `a` is an lvalue because it has a name. `Buffer b(a);` calls the copy constructor. `Buffer b(std::move(a));` would call the move constructor.

**Explanation:**
- Rule: if it has a name, it is an lvalue. This includes rvalue-reference parameters (`void f(T&& p)`) and `auto&&` variables.
- Reason: a named reference can be used many times. If the first use moved from it, every later use would see a moved-from object.
- `Buffer&& a = Buffer(100);` extends the temporary's lifetime to `a`'s scope (topic 01), so using `a` is safe.
- ❌ Common wrong answer: "`a` is an rvalue reference, so it binds to the move constructor."
- ✅ What a strong answer adds: "Type and value category are independent: `a` has an rvalue-reference type and is an lvalue expression."

**Key takeaway:** Named rvalue references are lvalues; use `std::move` on their last use.

---

#### Q7: Given `f(Buffer&)`, `f(const Buffer&)`, `f(Buffer&&)`, which overload is called for `f(a)`, `f(b)` (b const), `f(Buffer{})` and `f(std::move(a))`?
**Difficulty:** #intermediate
**Category:** #overload_resolution
**Concepts:** #reference_binding #rvalue_reference #const_reference

**Answer:**
`f(a)` → `f(Buffer&)`; `f(b)` → `f(const Buffer&)`; `f(Buffer{})` → `f(Buffer&&)`; `f(std::move(a))` → `f(Buffer&&)`.

**Explanation:**
- Non-const lvalue: `Buffer&` is an exact match and beats `const Buffer&` (less cv-qualification added).
- Const lvalue: only `const Buffer&` can bind.
- Rvalues (prvalue or xvalue): `Buffer&&` beats `const Buffer&` (rvalues prefer rvalue references).
- Extra cases worth knowing:
  - `f(std::move(b))` with `b` const: `const Buffer&&` does not bind to `Buffer&&`, so `f(const Buffer&)` is chosen.
  - With only `f(const Buffer&)` declared, all four calls compile and go there.
  - With only `f(Buffer&&)` declared, `f(a)` and `f(b)` do not compile.
- ❌ Common wrong answer: "`f(a)` is ambiguous between `Buffer&` and `const Buffer&`." Not ambiguous; the less-qualified binding wins.
- ✅ What a strong answer adds: this ranking *is* the copy/move constructor selection mechanism (`const T&` vs `T&&`).

**Key takeaway:** Lvalues prefer `T&`, const lvalues need `const T&`, rvalues prefer `T&&`.

---

#### Q8: `void process(std::string&& s) { std::cout << s << '\n'; }` and the caller does `std::string s = "Hello"; process(std::move(s)); std::cout << s;`. What prints?
**Difficulty:** #intermediate
**Category:** #move_semantics
**Concepts:** #rvalue_reference_binding #no_move #named_rvalue_reference

**Answer:**
`Hello` twice. `std::move(s)` only lets the argument bind to `std::string&&`; `process` receives a reference to the caller's `s` and only reads it. No move constructor runs, so `s` is unchanged.

**Explanation:**
```cpp
#include <iostream>
#include <string>
#include <utility>

void process(std::string&& s) { std::cout << s << '\n'; }
void consume(std::string&& s) { std::string mine = std::move(s); }

int main() {
    std::string s = "Hello";
    process(std::move(s));
    std::cout << s << '\n';                       // unchanged
    consume(std::move(s));
    std::cout << "size after consume: " << s.size() << '\n';
}
```
- Output:
```
Hello
Hello
size after consume: 0
```
- Inside `process`, the parameter `s` is an lvalue expression (named). A real move requires `std::move(s)` inside, as in `consume`.
- After `consume`, `s` is valid but unspecified (`0` is libstdc++'s result).
- ❌ Common wrong answer: "`s` is empty after `process(std::move(s))`."
- ✅ What a strong answer adds: "Code must not depend on this. Treat `s` as moved-from after any `std::move(s)`, because the callee is allowed to change its implementation to steal."

**Key takeaway:** Binding to `T&&` is not moving; only a constructor or assignment from the xvalue moves.

---

#### Q9: After `std::string b = std::move(a);` is `a` destroyed? Can you print it? Is `a.size() == 0` guaranteed?
**Difficulty:** #beginner
**Category:** #move_semantics #object_lifetime
**Concepts:** #moved_from_state #valid_but_unspecified

**Answer:**
`a` is not destroyed: its lifetime continues until its scope ends. It is in a valid but unspecified state, so printing it is safe (no preconditions), but its content is not specified: `size() == 0` is what libstdc++, libc++ and MSVC do, not a guarantee.

**Explanation:**
- "Valid but unspecified" (standard library rule for moved-from objects):
  - ✅ Destroy it, assign to it, call functions without preconditions (`size()`, `empty()`, `clear()`, `operator<<`).
  - ❌ Assume its old value or emptiness; call functions with preconditions (`front()`, `back()`, `pop_back()`) without checking.
- `std::string` is explicitly in the "unspecified" group. A conforming implementation could leave a short string's characters in place (copying a short string is as cheap as moving it).
- Not destroyed, not dangling: references to `a` remain valid references to a live (moved-from) object.
- ❌ Common wrong answer: "`a` is dead after the move; using it is UB."
- ❌ Common wrong answer: "`a` is guaranteed to be empty."
- ✅ What a strong answer adds: the reuse idiom: `a.clear();` or `a = "new value";` puts it back into a known state.

**Key takeaway:** Moved-from: alive, valid, value unknown.

---

#### Q10: `std::string s = "...long..."; std::vector<std::string> v; v.push_back(std::move(s));` Is `s` destroyed? Does `v[0]` depend on `s` staying alive?
**Difficulty:** #intermediate
**Category:** #move_semantics #ownership
**Concepts:** #push_back_rvalue #moved_from_state #independent_objects

**Answer:**
`s` is not destroyed and is not guaranteed empty. `v[0]` is a separate `std::string` object, move-constructed from `s`, which owns its buffer independently. When `s` later goes out of scope, `v[0]` is unaffected.

**Explanation:**
- `push_back(T&&)` constructs the element from the xvalue: the move constructor transfers the heap buffer pointer from `s` to `v[0]`.
- After that, the two strings share nothing. Destroying `s` destroys only its own (now empty, in practice) representation.
- Wording matters: `v[0]` is not a "copy" of `s` here; it is an object constructed by moving from `s`.
- ❌ Common wrong answer: "`v[0]` points to `s`'s data, so it dangles when `s` dies." Ownership moved with the buffer.
- ✅ What a strong answer adds: contrast with `std::vector<std::string_view>`: there `v[0]` *would* depend on `s`'s buffer.

**Key takeaway:** A move creates an independent owner; the source's later death is irrelevant.

---

#### Q11: `std::vector<int> v1 = {1, 2, 3}; std::vector<int> v2 = std::move(v1); v1.push_back(4);` Is the `push_back` safe? What is `v1.size()`?
**Difficulty:** #intermediate
**Category:** #move_semantics #containers
**Concepts:** #moved_from_vector #reuse_after_move

**Answer:**
Safe: `v1` is a valid vector and `push_back` has no preconditions. For a move-**constructed-from** vector, the source is empty (the move constructor must be constant time and the elements now belong to `v2`), so `v1.size()` is `1` after the `push_back`.

**Explanation:**
- In practice every implementation sets `v1`'s pointer, size and capacity to zero; cppreference documents "other is guaranteed to be empty()" for the move constructor.
- Move **assignment** is weaker: with an allocator that does not propagate and compares unequal, elements are moved one by one and the source may keep its size. With `std::allocator`, empty in practice.
- Generic code that must work for any `T` should not read a moved-from object before reassigning it; `clear()` first if in doubt.
- ❌ Common wrong answer: "Using `v1` after the move is UB."
- ✅ What a strong answer adds: the difference between the guarantee of a specific type (`vector` move constructor) and the generic library rule (valid but unspecified).

**Key takeaway:** Moved-from containers are reusable; `vector`'s move constructor leaves the source empty.

---

#### Q12: Why is moving a `std::vector<std::string>` O(1), and are pointers to its elements still valid afterwards?
**Difficulty:** #intermediate
**Category:** #move_semantics #containers
**Concepts:** #buffer_transfer #iterator_validity #reallocation

**Answer:**
The vector owns one heap block holding all elements; its move constructor transfers that block's pointer, size and capacity, so no element is touched. Pointers, references and iterators to the elements stay valid and now refer to elements of the new vector (this holds in every implementation for every container except `std::array`; it follows from the constant-time move constructor taking over the elements, and LWG 2321, still open, would state it explicitly).

**Explanation:**
```cpp
#include <iostream>
#include <string>
#include <vector>

int main() {
    std::vector<std::string> v1{"order-1", "order-2"};
    const std::string* p = &v1[0];
    std::vector<std::string> v2 = std::move(v1);
    std::cout << std::boolalpha << (p == &v2[0]) << ' ' << *p << '\n';
}
```
- Output: `true order-1`
- Different event: vector **reallocation** (growth) moves each element into a new block, invalidating every pointer to the elements.
- `std::array<std::string, N>` has no separate block: moving it moves each element (O(N)).
- ❌ Common wrong answer: "Moving a vector moves every string." That happens on reallocation, not on moving the vector itself.
- ✅ What a strong answer adds: moving the owner vs moving the owned: the elements never moved, only the owner changed.

**Key takeaway:** Moving a heap-backed container transfers its block; element addresses do not change.

---

#### Q13: You keep `const char* p = s.data();` and then do `std::string t = std::move(s);`. Is `p` valid? Would the answer differ for `unique_ptr`?
**Difficulty:** #advanced
**Category:** #move_semantics #standard_guarantees
**Concepts:** #sso #pointer_invalidation #type_specific_guarantees

**Answer:**
Not guaranteed. [string.require] lets any library function that takes a non-const `basic_string&` (the move constructor takes `basic_string&&`) invalidate pointers into it. In practice: a short (SSO) string's characters live inside `s`, so `p` does not point into `t`; a long string's buffer is usually transferred, so `p == t.data()` in libstdc++. For `unique_ptr`, a raw pointer obtained with `get()` stays valid after the move, because the pointee never moves.

**Explanation:**
- Measured (libstdc++): short string `p == t.data()` is `false`; 100-char string `true`.
- C++ has no universal "after a move, pointers survive" rule; each type specifies its own:

| Type | Pointer into the resource after move |
|---|---|
| `unique_ptr<T>`, `shared_ptr<T>` | Valid (object not moved) |
| `vector`, `deque`, `list`, maps | Valid in practice, now refers into the destination (explicit wording pending: LWG 2321) |
| `std::string` | May be invalidated |
| Your own `Buffer` | What your move contract documents |

- SSO makes the danger visible, but it is not the root reason; the root reason is that `std::string`'s specification does not promise it.
- ❌ Common wrong answer: "The move constructor transfers the pointer, so `p` must stay valid." That is an implementation detail for long strings only.
- ✅ What a strong answer adds: "Ask what the *type* guarantees, not what the implementation happens to do."

**Key takeaway:** Pointer validity after a move is a per-type contract; `std::string` does not give it.

---

#### Q14: `std::optional<std::string> o = "order"; std::string& ref = *o; std::string s = std::move(*o);` Is `o` still engaged? Is `ref` dangling? What about after `o.reset()`?
**Difficulty:** #advanced
**Category:** #move_semantics #object_lifetime
**Concepts:** #optional #moved_from_state #dangling_reference

**Answer:**
`o` is still engaged (`has_value()` is `true`) and `ref` is not dangling: it refers to the contained string, which is alive but moved-from (contents unspecified). `o.reset()` destroys the contained string; then `ref` dangles.

**Explanation:**
```cpp
#include <iostream>
#include <optional>
#include <string>
#include <utility>

int main() {
    std::optional<std::string> o = std::string(30, 'x');
    std::string& ref = *o;
    std::string s = std::move(*o);
    std::cout << std::boolalpha << o.has_value() << ' ' << ref.size() << ' ' << s.size() << '\n';
    o.reset();
    std::cout << o.has_value() << '\n';         // ref now dangles: do not use it
}
```
- Output: `true 0 30` then `false` (inner size 0 is libstdc++).
- Move changes **state**; reset/destruction ends **lifetime**. Only the second makes references dangle.
- Same for `std::move(o)` into another optional: the source stays engaged.
- ❌ Common wrong answer: "Moving out of an optional empties it."
- ✅ What a strong answer adds: keep three words separate: lifetime (object exists), state (its value), storage (the bytes it occupies).

**Key takeaway:** Moving out of `*o` leaves `o` engaged; only `reset()` ends the contained object's lifetime.

---

#### Q15: What is the difference between `decltype(x)` and `decltype((x))`?
**Difficulty:** #intermediate
**Category:** #value_categories #type_deduction
**Concepts:** #decltype #lvalue_reference #decltype_auto

**Answer:**
`decltype(x)` for a plain name gives the variable's declared type. `decltype((x))` treats `(x)` as an expression and encodes its category: lvalue → `T&`, xvalue → `T&&`, prvalue → `T`. For `int x;`, they are `int` and `int&`.

**Explanation:**
- For `int&& r = 1;`: `decltype(r)` is `int&&`, `decltype((r))` is `int&`: a direct demonstration that named rvalue references are lvalues.
- Danger with `decltype(auto)`:
  - `decltype(auto) f() { int x = 1; return (x); }` returns `int&` to a local: GCC warns "reference to local variable 'x' returned"; using the result is UB.
  - `return x;` would return `int`.
- Useful as a category probe in tests: `static_assert(std::is_same_v<decltype((std::move(x))), int&&>);`.
- ❌ Common wrong answer: "Parentheses never matter in C++."
- ✅ What a strong answer adds: the same parentheses rule matters in `decltype(auto)` return types and in generic code that forwards return values.

**Key takeaway:** `decltype(name)` = declared type; `decltype((expr))` = type plus category.

---

#### Q16: What are ref-qualified member functions, and when would you use them?
**Difficulty:** #advanced
**Category:** #class_design #move_semantics
**Concepts:** #ref_qualifiers #rvalue_this #optional_value

**Answer:**
`&` and `&&` after a member function's parameter list overload it on the value category of `*this`. Use them to move members out of expiring objects (`std::string body() &&`), to forbid calls on temporaries (`int* data() && = delete;`), or to return references only from lvalue objects.

**Explanation:**
```cpp
class Message {
    std::string body_;
public:
    const std::string& body() const& { return body_; }   // msg.body()
    std::string body() && { return std::move(body_); }    // make().body(), std::move(msg).body()
};
```
- `receive().body()` moves the string out of the temporary instead of copying it (or returning a reference to a dying object).
- Standard examples: `std::optional::value() &&`, `std::move(opt).value()`; `std::get<I>(std::move(tuple))`; builder patterns `Builder{}.with_x(1).build()`.
- Rule: if one overload has a ref-qualifier, every overload of that name with the same parameter list must have one too.
- C++23 "deducing this" (`this Self&& self`) writes one template instead of four overloads.
- ❌ Common wrong answer: "`&&` after a function means it returns an rvalue reference."
- ✅ What a strong answer adds: the cost argument: one move instead of a copy for every chained call on a temporary.

**Key takeaway:** Ref-qualifiers let a member function know whether its object is about to die.

---

#### Q17: What does `std::move_if_noexcept` return, and how does `std::vector` use it?
**Difficulty:** #advanced
**Category:** #move_semantics #exception_safety
**Concepts:** #move_if_noexcept #type_traits #vector_reallocation

**Answer:**
It is a cast, like `std::move`, but conditional: it returns `const T&` when `T`'s move constructor may throw **and** `T` is copy constructible; otherwise `T&&`. `std::vector` passes each old element through it when relocating, so overload resolution then picks the copy or the move constructor. Why the vector wants this (strong guarantee of `push_back`) is covered in topic 02 Q12.

**Explanation:**
- Exact condition (C++11, [utility]): `const T&` if `!std::is_nothrow_move_constructible_v<T> && std::is_copy_constructible_v<T>`, else `T&&`.
- Compile-time only: it looks at the declared `noexcept` of the move constructor, never at what happens at runtime.
- Only the move **constructor** matters: relocation constructs into new storage; the `noexcept` of move assignment does not affect it.
- Three outcomes (theory Example 7): `noexcept` move → moved; throwing move with copy → copied; throwing move with deleted copy → moved anyway (the operation only gives the basic guarantee).
- `is_nothrow_move_constructible` asks about the whole expression `T(std::declval<T>())`, so a type without any move constructor but with a `noexcept` copy constructor also counts as "nothrow move".
- Same mechanism in `reserve`, `resize`, `shrink_to_fit` and insertion that triggers growth; `std::deque` and `std::list` never relocate existing elements.
- ❌ Common wrong answer: "`move_if_noexcept` checks at runtime whether an exception happened." It is a compile-time choice based on type traits.
- ✅ What a strong answer adds: you can use it the same way in your own containers or buffers that relocate elements and promise the strong guarantee.

**Key takeaway:** `move_if_noexcept` = a conditional cast: move when it cannot throw or when there is no copy, otherwise copy.

---

#### Q18: Can you move an element out of a `std::set` (or a key out of a `std::map`) with `std::move(*it)`? How do you take it without copying?
**Difficulty:** #intermediate
**Category:** #move_semantics #containers
**Concepts:** #const_rvalue #node_handle #extract

**Answer:**
No. Set elements and map keys are `const` (changing them would break the tree's ordering), so `std::move(*it)` yields `const Key&&`, which binds to the copy constructor: it silently copies. Since C++17, `extract(it)` unlinks the node and returns a node handle whose `value()` (set) or `key()` (map) is non-const, so the element can really be moved out, with no reallocation of the node.

**Explanation:**
- Same rule as `const Data a; Data b = std::move(a);` (Q4), applied to containers where the `const` is hidden in the element type (`std::map<K, V>::value_type` is `std::pair<const K, V>`).
- `std::move(it->second)` on a map is fine: the mapped value is not `const`.
- `extract` transfers ownership of the node itself: the element is neither copied nor moved; the container's `size()` drops by one.
- Node handles also allow "rename the key" without reallocation: `auto n = m.extract(old); n.key() = new_key; m.insert(std::move(n));`, and moving nodes between containers with `merge` or `insert(std::move(node))`.
- `std::initializer_list` elements are `const` too, which is why `std::set<Key> keys{"a", "b"}` (and `vector<unique_ptr>` from braces, topic 06) copies.
```cpp
#include <iostream>
#include <set>
#include <string>

struct Key {
    std::string s;
    Key(const char* p) : s(p) {}
    Key(const Key& o) : s(o.s) { std::cout << "copy\n"; }
    Key(Key&& o) noexcept : s(std::move(o.s)) { std::cout << "move\n"; }
    bool operator<(const Key& o) const { return s < o.s; }
};

int main() {
    std::set<Key> keys{"order-1", "order-2"};          // init-list: 2 copies
    std::cout << "-- move from *begin() --\n";
    Key a = std::move(*keys.begin());                 // const Key&&: copy
    std::cout << "-- extract --\n";
    auto node = keys.extract(keys.begin());           // no copy, no move
    Key b = std::move(node.value());                  // non-const: move
    std::cout << a.s << ' ' << b.s << ' ' << keys.size() << '\n';
}
```
- Output (GCC 11, libstdc++):
```
copy
copy
-- move from *begin() --
copy
-- extract --
move
order-1 order-1 1
```
- ❌ Common wrong answer: "`std::move` always moves, so the element is moved out and the set holds a moved-from key." The set's element is untouched, and a moved-from key inside a set would corrupt its ordering anyway.
- ✅ What a strong answer adds: no warning is emitted for a copy from `const T&&`; `clang-tidy` (`performance-move-const-arg`) is what flags it.

**Key takeaway:** Container keys are `const`: `std::move` copies them; `extract()` (C++17) is the way to take them out.

---

#### Q19: Is `std::move` on an `int` or a trivially copyable struct faster than copying it?
**Difficulty:** #beginner
**Category:** #move_semantics #performance
**Concepts:** #trivially_copyable #scalar_move #cost_model

**Answer:**
No. Moving a scalar or a trivially copyable type is a copy: the bytes are copied and the source keeps its value. Moves are only cheaper when the type owns indirect resources (heap buffers, handles) that can be transferred instead of duplicated.

**Explanation:**
- `int i = 7; int j = std::move(i);` leaves `i == 7`.
- `struct Point { double x, y; };` moved = copied (16 bytes).
- `std::array<int, 1000>` moved = 4000 bytes copied; `std::vector<int>` moved = three pointers.
- `std::string` with SSO: moving a short string copies its inline characters (still cheap); moving a long string transfers the pointer.
- ❌ Common wrong answer: "`std::move` always avoids copying data."
- ✅ What a strong answer adds: a cost model: move cost ≈ size of the object's direct representation; copy cost ≈ that plus everything it owns.

**Key takeaway:** Move saves work only for indirectly owned resources.
