## TOPIC: Top 50: Must-Know Memory and Ownership Interview Questions

### INTERVIEW_QA: The Must-Know Interview Questions

#### Q1: When exactly is the temporary destroyed here, and what does the caller hold?
**Difficulty:** #intermediate
**Category:** #object_lifetime #dangling
**Concepts:** #temporary #lifetime_extension #return_by_reference

```cpp
#include <iostream>
#include <string>

std::string create() { return "hello"; }
const std::string& get() { return create(); }

int main() {
    const std::string& s = get();
    std::cout << s;
}
```

**Answer:**
The temporary string is created by the `return` statement inside `get()`. A temporary bound to a function's returned reference is not lifetime-extended; it is destroyed at the end of that `return` statement, still inside `get()`. The caller receives a dangling reference, and `std::cout << s` is undefined behaviour.

**Explanation:**
- Verified with a tracing type: the temporary's destructor prints before the caller's next statement.
- A popular explanation ("destroyed at the end of the full expression in the caller") gets the place wrong: it is the callee's full-expression.
- RVO is irrelevant: elision decides where `create()` builds its result, not how long a reference to it lives.
- GCC warns by default: "returning reference to temporary [-Wreturn-local-addr]". C++26 (P2748) makes this ill-formed.
- Observed with GCC 11 `-O0`: the program **segfaults**. Knowing the reference is dangling, GCC returns a null reference (UBSan: "reference binding to null pointer of type 'const struct string'"). Other compilers may print garbage or even "hello".
- ❌ Common wrong answer: "`s` is `const&`, so the lifetime is extended." Extension needs the reference to bind directly to the prvalue; `s` binds to whatever `get()` returned.
- ✅ What a strong answer adds: the fix is to return `std::string` by value, which costs nothing extra with guaranteed elision (topic 04).
- Deep dive: Topic 1, Object Lifetime and Storage Duration

**Key takeaway:** A temporary in a reference-returning `return` dies inside the callee.

---

#### Q2: What is the static initialization order fiasco and how do you avoid it?
**Difficulty:** #intermediate
**Category:** #object_lifetime #static_initialization
**Concepts:** #siof #constinit #meyers_singleton

**Answer:**
Statics with dynamic initialization in different translation units are initialized in an unspecified order (in practice: link order). If one static's initializer reads another TU's static that is not yet initialized, it sees zero-initialized memory or, for class types, an object whose lifetime has not begun. Fixes: function-local statics (initialized on first use), `constexpr`/`constinit` (constant initialization, no ordering), or no cross-TU global dependencies.

**Explanation:**
- Measured: `int order_port = base_port + 1;` (other file has `int base_port = compute_base_port();`) gave `1` with `g++ main.cpp config.cpp` and `9001` with `g++ config.cpp main.cpp`.
- Initialization phases: zero-initialization, constant initialization (baked into the binary), then dynamic initialization (code before `main`). Only the dynamic phase has the ordering problem.
- `constinit` (C++20) makes the compiler reject a non-constant initializer: "'constinit' variable does not have a constant initializer".
- ASan can detect it at run time: `ASAN_OPTIONS=check_initialization_order=1`.
- ❌ Common wrong answer: "Globals are initialized in the order they appear in the program."
- ✅ What a strong answer adds: the mirror problem at shutdown, the destruction order fiasco (Q14).
- Deep dive: Topic 1, Object Lifetime and Storage Duration

**Key takeaway:** Across files, dynamic static initialization has no order you can rely on.

---

#### Q3: What exactly does the compiler generate if you declare only a destructor? Why does that matter for `std::vector`?
**Difficulty:** #intermediate
**Category:** #special_members #performance
**Concepts:** #implicit_move #deprecated_copy #vector_reallocation

**Answer:**
Default constructor, copy constructor and copy assignment are still generated (the copies are deprecated); move constructor and move assignment are not declared. So every move, including `std::vector` growth, silently becomes a copy.

**Explanation:**
```cpp
#include <iostream>
#include <vector>

struct Order {
    Order() = default;
    Order(const Order&) { std::cout << "copy "; }
    Order(Order&&) noexcept { std::cout << "move "; }
};

struct LoggedOrder {
    Order o;
    ~LoggedOrder() {}               // only a destructor: implicit move is gone
};

int main() {
    std::vector<LoggedOrder> v(2);
    v.reserve(3);                   // reallocation: copy copy
    std::cout << '\n';

    std::vector<Order> w(2);
    w.reserve(3);                   // reallocation: move move
    std::cout << '\n';
}
```
- Output:
```
copy copy 
move move 
```
- `LoggedOrder` has no move constructor, so the vector relocates elements through the copy constructor, which copies the `Order` member.
- `~LoggedOrder() = default;` gives the same result: it is still user-declared.
- ❌ Common wrong answer: "The compiler generates a default move constructor that does a shallow copy." No move constructor is generated at all.
- ✅ What a strong answer adds: the bug is invisible to `std::is_move_constructible` (true, via the copy constructor); only profiling, a trace, or `static_assert(std::is_nothrow_move_constructible_v<T>)` with a throwing copy reveals it.
- Deep dive: Topic 2, Special Member Functions and the Rule of 0/3/5

**Key takeaway:** Do not declare a destructor you do not need; if you need one, default the moves explicitly.

---

#### Q4: Why should move operations be `noexcept`? What happens in `std::vector` if they are not?
**Difficulty:** #intermediate
**Category:** #special_members #performance
**Concepts:** #noexcept #vector_reallocation #strong_guarantee #move_if_noexcept

**Answer:**
`std::vector::push_back` gives the strong guarantee. During reallocation it can only move elements if moving cannot throw; otherwise a failure midway would leave old elements moved-from. So if the move constructor is not `noexcept` and a copy constructor exists, the vector copies every element on growth.

**Explanation:**
- Measured with 1000 `emplace_back` calls (libstdc++): `noexcept` move gave 0 copies and 1023 moves; the identical non-`noexcept` move gave 1023 copies and 0 moves.
- The selection is done with `std::move_if_noexcept` (topic 03).
- If the type is move-only (copy deleted), the vector moves anyway and the guarantee weakens to basic for that operation.
- Implicit and `= default` moves are `noexcept` automatically when all members' moves are.
- Destructors are implicitly `noexcept`; a throwing destructor would break every container.
- ❌ Common wrong answer: "`vector` requires `noexcept` move." It compiles and works without; it just copies.
- ❌ Common wrong answer: "`noexcept` makes the move faster." The move itself is the same code; `noexcept` changes which operation the container chooses.
- ✅ What a strong answer adds: `static_assert(std::is_nothrow_move_constructible_v<T>);` next to the class to lock it in.
- Deep dive: Topic 2, Special Member Functions and the Rule of 0/3/5

**Key takeaway:** `noexcept` on the move constructor is the difference between O(1) and deep-copy relocation in containers.

---

#### Q5: What does `std::move` actually do? Does it move any memory?
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
- Deep dive: Topic 3, Value Categories, std::move and Moved-From State

**Key takeaway:** `std::move` is a cast to xvalue; the move constructor or move assignment does the move.

---

#### Q6: `const Data a; Data b = std::move(a);` Does this move or copy?
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
- Deep dive: Topic 3, Value Categories, std::move and Moved-From State

**Key takeaway:** `std::move` keeps `const`; const rvalues copy.

---

#### Q7: Why is `return std::move(local);` usually wrong?
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
- Deep dive: Topic 4, Copy Elision, RVO and NRVO

**Key takeaway:** Return locals and parameters by name; reserve `std::move` for sub-objects.

---

#### Q8: Can a type with deleted copy and move constructors be returned from a function?
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
- Deep dive: Topic 4, Copy Elision, RVO and NRVO

**Key takeaway:** Non-movable types are returnable as prvalues only.

---

#### Q9: Is a local object's destructor guaranteed to run if an exception is thrown and never caught?
**Difficulty:** #intermediate
**Category:** #exceptions #raii
**Concepts:** #std_terminate #stack_unwinding #implementation_defined

**Answer:**
No. If no matching handler exists, `std::terminate` is called, and whether the stack is unwound before that is implementation-defined. With GCC/libstdc++ the stack is not unwound, so the destructor never runs.

**Explanation:**
```cpp
#include <iostream>
#include <stdexcept>

struct Guard { ~Guard() { std::cout << "~Guard ran" << std::endl; } };

void work() { Guard g; throw std::runtime_error("boom"); }

int main() {
    try { work(); } catch (const std::exception& e) {
        std::cout << "caught " << e.what() << std::endl;   // flush: abort won't
    }
    work();   // no handler anywhere
}
```
- Output (GCC 11, Linux):
```
~Guard ran
caught boom
terminate called after throwing an instance of 'std::runtime_error'
  what():  boom
```
- The process then aborts (exit status 134, SIGABRT). The second `~Guard ran` never appears.
- `std::endl` matters here: `abort` does not flush `std::cout`, so with output redirected to a file or pipe, unflushed lines are lost too.
- Not unwinding is useful for debugging: the core dump shows the stack at the throw point.
- ❌ Common wrong answer: "RAII guarantees cleanup whenever an exception is thrown."
- ✅ What a strong answer adds: put `try { ... } catch (...) { log; return 1; }` in `main` and in every thread entry function when cleanup matters (flushing logs, removing lock files, sending a disconnect).
- Deep dive: Topic 5, RAII and Exception Safety

**Key takeaway:** RAII cleanup during exceptions is guaranteed only for exceptions that are caught.

---

#### Q10: A constructor throws halfway through. Which destructors run?
**Difficulty:** #intermediate
**Category:** #exceptions #object_lifetime
**Concepts:** #constructor_failure #member_destruction #leak

**Answer:**
The object's own destructor does not run, because its lifetime never started. Every base and member that was fully constructed is destroyed in reverse order. If the object was created with `new`, the new-expression also frees the memory.

**Explanation:**
```cpp
#include <iostream>
#include <stdexcept>
#include <vector>

struct Holder {
    int* raw_;
    std::vector<int> safe_;
    Holder() : raw_(new int[100]), safe_(100) {
        std::cout << "acquired both\n";
        throw std::runtime_error("init failed");
    }
    ~Holder() { delete[] raw_; std::cout << "~Holder\n"; }
};

int main() {
    try { Holder h; } catch (const std::exception& e) { std::cout << e.what() << '\n'; }
}
```
- Output:
```
acquired both
init failed
```
- `~Holder` never prints, so `raw_` leaks (ASan/LeakSanitizer: "Direct leak of 400 byte(s)"). `safe_` was a finished member and freed its buffer.
- Fix: every resource in its own RAII member; then the class needs no destructor at all.
- ❌ Common wrong answer: "The destructor runs and cleans up whatever was initialized."
- ✅ What a strong answer adds: throwing is the right way to report constructor failure; a half-built "zombie" object that every method must check is worse.
- Deep dive: Topic 5, RAII and Exception Safety

**Key takeaway:** Constructor failure destroys finished members, never the object itself: own resources through members, not raw pointers.

---

#### Q11: What is `sizeof(std::unique_ptr<T>)`, and how does a custom deleter change it?
**Difficulty:** #intermediate
**Category:** #smart_pointers #memory_layout
**Concepts:** #custom_deleter #empty_base_optimization #sizeof

**Answer:**
With the default deleter it is the size of a raw pointer (8 bytes on 64-bit). A stateless deleter (empty functor or captureless lambda) adds nothing, thanks to empty-base optimization. A function pointer deleter adds a pointer (16 bytes), a stateful functor adds its state, and `std::function` makes it 40 bytes in libstdc++.

**Explanation:**
- Measured on libstdc++ x86-64: default 8, stateless functor 8, lambda 8, function pointer 16, functor with one `int` 16 (padded), `std::function` 40.
- Moving does not change size: a moved-from `unique_ptr` has the same type and size, only the stored pointer is null.
- The size is a property of the **type**, so it is a compile-time constant; nothing is allocated for the deleter.
- ❌ Common wrong answer: "A unique_ptr is always 8 bytes." Not with function-pointer or stateful deleters.
- ❌ Common wrong answer: "A custom deleter always increases the size."
- ✅ What a strong answer adds: in a `std::vector` of a million handles, a function-pointer deleter doubles the memory and adds an indirect call per destruction; prefer `struct Closer { void operator()(T*) const; }`.
- Deep dive: Topic 6, std::unique_ptr

**Key takeaway:** Stateless deleters are free; stateful ones cost their state.

---

#### Q12: `std::unique_ptr<Base> b = std::make_unique<Derived>();` compiles. What must be true of `Base` for this to be correct?
**Difficulty:** #intermediate
**Category:** #smart_pointers #polymorphism
**Concepts:** #virtual_destructor #converting_move #undefined_behavior

**Answer:**
`Base` must have a virtual destructor. The converting move turns the deleter into `default_delete<Base>`, which does `delete (Base*)p`; deleting a `Derived` through a `Base*` without a virtual destructor is UB, and in practice `~Derived` (and the destructors of its members) never run.

**Explanation:**
```cpp
#include <iostream>
#include <memory>
#include <string>

struct Base { ~Base() { std::cout << "~Base\n"; } };               // not virtual

struct Derived : Base {
    std::string big = std::string(64, 'd');
    ~Derived() { std::cout << "~Derived\n"; }
};

int main() { std::unique_ptr<Base> b = std::make_unique<Derived>(); }
```
- Output: `~Base` only. Under ASan: `new-delete-type-mismatch ... size of the allocated type: 32 bytes; size of the deallocated type: 1 bytes`. With that check disabled (`ASAN_OPTIONS=new_delete_type_mismatch=0`), LeakSanitizer reports `big`'s 65-byte heap buffer: the string member was never destroyed.
- GCC `-Wall` gives no warning here; `-Wdelete-non-virtual-dtor` only fires for classes with other virtual functions.
- `std::shared_ptr<Base> s = std::make_shared<Derived>();` would call `~Derived` (deleter captured at creation), which hides the bug until someone switches to `unique_ptr` (topic 07).
- ❌ Common wrong answer: "The smart pointer remembers the real type and deletes correctly."
- ✅ What a strong answer adds: alternatively make `~Base` protected and non-virtual to forbid polymorphic deletion entirely; then this line fails to compile instead of being UB.
- Deep dive: Topic 6, std::unique_ptr

**Key takeaway:** Polymorphic ownership through `unique_ptr<Base>` requires `virtual ~Base()`.

---

#### Q13: Why is `std::make_shared<T>()` generally preferred over `std::shared_ptr<T>(new T)`?
**Difficulty:** #beginner
**Category:** #smart_pointers #performance
**Concepts:** #make_shared #allocation #exception_safety

**Answer:**
It performs one allocation for the control block and the object instead of two, which saves an allocator call and per-allocation overhead and keeps the counts next to the object. It also avoids a naked `new`, which historically made it exception-safe in function arguments.

**Explanation:**
- Measured libstdc++: `make_shared<int>` = one 24-byte allocation; `shared_ptr<int>(new int)` = 4 + 24 bytes.
- Historical leak (pre-C++17): `f(std::shared_ptr<A>(new A), g());` could run `new A`, then `g()` which throws, before the `shared_ptr` took ownership. C++17 forbids interleaving argument evaluations, so that specific leak is gone; the idiom remains.
- ❌ Common wrong answer: "Its main benefit is that the prefetcher loads object and counts together." That is a secondary effect, not the guaranteed one.
- ❌ Common wrong answer: "`make_shared` can never leak, `new` always can." `std::shared_ptr<T> p(new T);` on its own line is also safe: if the block allocation throws, the constructor deletes the pointer.
- ✅ What a strong answer adds: the cases where `make_shared` is wrong (Q7).
- Deep dive: Topic 7, std::shared_ptr Internals and make_shared

**Key takeaway:** One allocation, no naked `new`; that is the reason, not cache magic.

---

#### Q14: Is `std::shared_ptr` type-erased? Why can `shared_ptr`s with different deleters live in one vector?
**Difficulty:** #intermediate
**Category:** #smart_pointers #type_erasure
**Concepts:** #custom_deleter #control_block #unique_ptr_comparison

**Answer:**
Yes: the deleter (and allocator) are type-erased. The constructor is a template that captures the deleter into a concrete control-block type, and the handle only keeps a pointer to the control-block base. So `std::shared_ptr<int>` with a lambda deleter and with a functor deleter are the same type and fit in `std::vector<std::shared_ptr<int>>`.

**Explanation:**
- Contrast `std::unique_ptr<T, D>`: `D` is a template parameter, so `unique_ptr<int, D1>` and `unique_ptr<int, D2>` are different types and `std::vector<std::unique_ptr<int, D1>>` rejects a `D2` (topic 06).
- Verified: `sizeof(std::shared_ptr<int>)` is 16 with or without a deleter; the deleter's storage is in the control block.
- Cost of erasure: indirect (virtual) calls through the control block at destruction time (dispose the object, later destroy the block) and an allocation for the block. `unique_ptr` with a stateless deleter costs nothing extra.
- `std::get_deleter<D>(sp)` recovers the deleter if you name its exact type.
- ❌ Common wrong answer: "`shared_ptr` is not type-erased; it is fixed-size because it always holds two pointers." The fixed size is a **consequence** of the erasure.
- ✅ What a strong answer adds: the same mechanism is why `shared_ptr<void>` and `shared_ptr<Base>` still destroy the original concrete type (Q9).
- Deep dive: Topic 7, std::shared_ptr Internals and make_shared

**Key takeaway:** The deleter is erased into the control block; that is why it is not part of the type.

---

#### Q15: What is the aliasing constructor and when would you use it?
**Difficulty:** #advanced
**Category:** #smart_pointers #advanced
**Concepts:** #aliasing_constructor #stored_pointer #owned_object

**Answer:**
`std::shared_ptr<U> q(owner, ptr)` creates a `shared_ptr` that shares `owner`'s control block (count +1) but stores an arbitrary pointer `ptr`, typically a member of the owned object. `q` keeps the whole object alive, and when the count reaches zero the original object is destroyed; `ptr` itself is never deleted.

**Explanation:**
```cpp
#include <iostream>
#include <memory>

struct Data {
    int x = 1, y = 2;
    ~Data() { std::cout << "~Data\n"; }
};

int main() {
    auto p = std::make_shared<Data>();
    std::shared_ptr<int> q(p, &p->y);     // aliasing
    std::cout << *q << ' ' << q.use_count() << '\n';   // 2 2
    p.reset();
    std::cout << *q << ' ' << q.use_count() << '\n';   // 2 1, Data alive
    q.reset();                                          // ~Data
}
```
- Output: `2 2`, `2 1`, `~Data`.
- Uses: expose a member or array element with ownership of the parent; pointer casts (`static_pointer_cast` is implemented with it).
- C++20 rvalue overload `std::shared_ptr<U>(std::move(owner), ptr)` transfers ownership without an atomic increment.
- Traps: aliasing an **empty** owner gives a non-null pointer with `use_count() == 0`; pointing to something the owner does not keep alive gives a dangling `shared_ptr`.
- ❌ Common wrong answer: "`q` has its own count of 1 because it points to a different address." The count lives in the shared control block: 2.
- ✅ What a strong answer adds: `q.get()` is `&p->y`, not the `Data*`; comparisons and hashing use the stored pointer, while `!q.owner_before(p) && !p.owner_before(q)` shows that they share ownership.
- Deep dive: Topic 7, std::shared_ptr Internals and make_shared

**Key takeaway:** Aliasing: stored pointer and owned object differ, control block is shared.

---

#### Q16: Is `std::shared_ptr` thread-safe?
**Difficulty:** #beginner
**Category:** #concurrency #smart_pointers
**Concepts:** #control_block #data_race #ownership

**Answer:**
It depends on which layer you mean. The control block's reference counting is thread-safe, so different `shared_ptr` objects that share ownership can be copied, reset and destroyed concurrently. The same `shared_ptr` object is not safe if one thread modifies it while another accesses it. And the managed object gets no protection at all.

**Explanation:**
- Three questions to ask:
  - Is the same handle shared between threads with a writer? Needs a mutex or `atomic<shared_ptr>`.
  - Does each thread own a copy? Then lifetime is protected.
  - Is the object's data modified concurrently? Needs its own synchronization or immutability.
- Same rule as any ordinary object for the handle: concurrent `const` access is fine; a writer requires exclusion.
- ❌ Common wrong answer: "Yes, the counter is atomic." That covers only one of three layers.
- ❌ Common wrong answer: "No, so every copy needs a lock." Copies living in different threads are exactly what the atomic count is for.
- ✅ What a strong answer adds: "`shared_ptr` answers *when may this be destroyed*, not *who may modify it*."
- Deep dive: Topic 8, shared_ptr and Thread Safety

**Key takeaway:** Thread-safe ownership, not a thread-safe handle variable, not a thread-safe object.

---

#### Q17: Design a configuration hot-reload with `std::atomic<std::shared_ptr<const Config>>`. What do readers and the writer do, and what does it not protect?
**Difficulty:** #intermediate
**Category:** #concurrency #design
**Concepts:** #atomic_shared_ptr #immutability #snapshot

**Answer:**
Readers call `auto c = cfg.load();` once per operation and read every field through `c`. The writer builds a complete new `Config`, then `cfg.store(std::move(next));`. Old configs are freed when their last reader drops its snapshot. It protects the handle only: the `Config` objects must be immutable after publication.

**Explanation:**
- `load()` returns an owning `shared_ptr`, so a writer's `store()` can never free a config that a reader still uses.
- Ordering: the default `seq_cst`, or `store(release)` with `load(acquire)`, makes the fields written before publication visible to any reader that obtains the new pointer.
- Rules:
  - One `load()` per operation; two loads may return two versions (`a` from v1, `b` from v2).
  - `shared_ptr<const Config>` so readers cannot mutate.
  - One writer, or serialize writers (Q10).
- Practical notes:
  - Not lock-free (libstdc++ GCC 12+ and MSVC use a lock bit): `is_lock_free()` is `false`.
  - GCC 11 does not provide it; use the mutex version (Q5) there.
  - Basic `atomic<shared_ptr>` facts are in Chapter 4, topic 05, Q20.
- ❌ Common wrong answer: "Because the pointer is atomic, readers can also update fields of the config." That is a race on the object.
- ✅ What a strong answer adds: whichever thread drops the last reference to an old config destroys it; keep heavy destruction off hot reader threads.
- Deep dive: Topic 8, shared_ptr and Thread Safety

**Key takeaway:** Atomic handle + immutable object + one snapshot per operation.

---

#### Q18: Two objects hold `shared_ptr`s to each other. What happens? Is it a deadlock?
**Difficulty:** #beginner
**Category:** #smart_pointers #memory_leaks
**Concepts:** #reference_cycle #strong_count

```cpp
struct A; struct B;
struct A { std::shared_ptr<B> b; };
struct B { std::shared_ptr<A> a; };

auto a = std::make_shared<A>();
auto b = std::make_shared<B>();
a->b = b;
b->a = a;
a.reset();
b.reset();
```

**Answer:**
It is a memory leak, not a deadlock. After the assignments both strong counts are 2; the two `reset()` calls bring each to 1, and nothing can bring them to 0 because each object owns the other. Neither destructor ever runs.

**Explanation:**
- Trace: after `make_shared`: A=1, B=1. `a->b = b`: B=2. `b->a = a`: A=2. `a.reset()`: A=1. `b.reset()`: B=1.
- Both objects are now unreachable from the program but still owned by each other.
- A deadlock needs threads waiting on each other; here nothing waits, nothing runs.
- LeakSanitizer reports such a cycle as "Indirect leak" entries only (each block is referenced by another leaked block).
- ❌ Common wrong answer: "Deadlock: each waits for the other to be destroyed." Nothing is waiting; it is just reference counting that never reaches zero.
- ✅ What a strong answer adds: the side effects of the destructors (closing sockets, flushing files, unregistering) are also lost, not just the memory.
- Deep dive: Topic 9, weak_ptr, Reference Cycles and enable_shared_from_this

**Key takeaway:** A strong cycle is a silent leak; `shared_ptr` is reference counting, not garbage collection.

---

#### Q19: When does `shared_from_this()` fail, and what happens?
**Difficulty:** #intermediate
**Category:** #smart_pointers #enable_shared_from_this
**Concepts:** #bad_weak_ptr #weak_from_this #factory

**Answer:**
Whenever no `shared_ptr` currently owns the object: in the constructor, in the destructor, for stack or `unique_ptr`-owned objects, and when the base is inherited privately. Since C++17 it throws `std::bad_weak_ptr`; before C++17 it was undefined behaviour.

**Explanation:**
- Constructor: the `shared_ptr` that will own the object is created only after the constructor returns.
- Destructor: the strong count is already 0.
- Private inheritance: the `shared_ptr` constructor cannot see the base, so the weak this is never set; `shared_from_this()` throws even with `make_shared` (verified with GCC 11).
- `weak_from_this()` (C++17) never throws: it returns an empty `weak_ptr` when unowned.
- Enforce the precondition with a factory: private or passkey constructor + `static std::shared_ptr<T> create()`; do the registration in a `start()` called by the factory after construction.
```cpp
#include <iostream>
#include <memory>

struct S : std::enable_shared_from_this<S> {};

int main() {
    S local;
    try {
        local.shared_from_this();
    } catch (const std::bad_weak_ptr& e) {
        std::cout << "stack object: " << e.what() << '\n';
    }
    std::cout << "weak_from_this expired: " << local.weak_from_this().expired() << '\n';
    auto sp = std::make_shared<S>();
    std::cout << "owned: " << sp->shared_from_this().use_count() << '\n';
}
```
- Output: `stack object: bad_weak_ptr`, `weak_from_this expired: 1`, `owned: 2`.
- ❌ Common wrong answer: "It returns nullptr if the object is not shared." It throws.
- ✅ What a strong answer adds: converting a `unique_ptr<T>` into a `shared_ptr<T>` later does enable it, because that `shared_ptr` constructor sets the weak this.
- Deep dive: Topic 9, weak_ptr, Reference Cycles and enable_shared_from_this

**Key takeaway:** `shared_from_this()` requires an existing owner; enforce it with a factory.

---

#### Q20: What is the difference between the `new` expression and `operator new`?
**Difficulty:** #beginner
**Category:** #memory #object_lifetime
**Concepts:** #new_expression #operator_new #allocation_function

**Answer:**
The `new` expression (`new T(args)`) is a language operation that calls an allocation function to get raw storage and then constructs a `T` in it. `operator new(std::size_t)` is only the allocation function: it returns bytes, like `malloc`, and constructs nothing. You can overload or replace `operator new`; you cannot change what the `new` expression does.

**Explanation:**
- `delete p` is symmetric: destructor first, then `operator delete(p)`.
- Calling `operator new(sizeof(T))` directly gives raw memory with no object in it; you must construct one with placement new before use.
- Customization points are the functions (`operator new/delete` at global or class scope), which is how pools and allocation counters hook in.
- ❌ Common wrong answer: "They're the same; `operator new` is just the name of the `new` keyword." Mixing them up leads to "I overloaded `operator new`, why does my constructor still run?" confusion.
- ✅ What a strong answer adds: placement new is the new-expression with a non-allocating allocation function (`operator new(std::size_t, void*)` just returns the pointer).
- Deep dive: Topic 10, new/delete, Placement New and Object Storage

**Key takeaway:** New-expression = allocate + construct; `operator new` = allocate only.

---

#### Q21: What is `std::launder` for?
**Difficulty:** #advanced
**Category:** #object_model #optimization
**Concepts:** #launder #storage_reuse #pointer_provenance

**Answer:**
`std::launder(p)` (C++17) returns a pointer to the object that currently lives at address `p`, when the pointer you have cannot legally be used to reach it: the old object was not transparently replaceable (e.g. `const` members in C++17, a base-class subobject), or the pointer was obtained by casting the storage (`reinterpret_cast<T*>(buf)`) rather than from the construction. It generates no code; it stops the optimizer from assuming the old object's values.

**Explanation:**
- Example of the hazard: the compiler may cache a `const int id` read through `p`, or a vtable pointer, across the reconstruction.
- Typical users: implementations of `std::optional`, `std::variant`, small-buffer vectors and pools, which recreate objects in member byte arrays.
- Practical rule that avoids it: store and use the pointer returned by placement new / `construct_at`.
- ❌ Common wrong answer: "`std::launder` fixes alignment or makes a cast safe." It does not create objects and does not fix alignment, aliasing of a different type, or lifetime problems.
- ✅ What a strong answer adds: C++20's relaxation means most reuse-through-old-pointer cases of the same complete type no longer need it.
- Deep dive: Topic 10, new/delete, Placement New and Object Storage

**Key takeaway:** `launder` gets you a valid pointer to a new object in reused storage; prefer keeping the pointer from construction.

---

#### Q22: What does `monotonic_buffer_resource` do, and for which workloads is it ideal or harmful?
**Difficulty:** #beginner
**Category:** #memory #pmr
**Concepts:** #arena #bump_allocator #release

**Answer:**
It is an arena: each allocation bumps a pointer forward through a buffer (asking upstream for bigger chunks when full), `deallocate` does nothing, and all memory is reclaimed at once by `release()` or destruction. It is ideal when many allocations share one lifetime (per request, per message, per frame) and harmful when objects have independent lifetimes or containers grow and churn.

**Explanation:**
- Very cheap allocation: align, bump, bounds check.
- Grouped lifetime pattern: build scratch structures for one message, process, `release()`.
- Harmful cases:
  - A long-lived object in the arena pins all the dead space around it.
  - A growing `pmr::vector` leaves every old array as dead space (reserve first).
  - Long-running containers with insert/erase churn grow without bound.
- Not thread-safe: one arena per thread.
- ❌ Common wrong answer: "When an object is freed its memory is reused by the next allocation." Not until `release()`.
- ✅ What a strong answer adds: "monotonic" (not "monolithic") refers to the allocation pointer only moving forward.
- Deep dive: Topic 11, Memory Pools and Polymorphic Allocators (PMR)

**Key takeaway:** Monotonic = bump allocate, never free individually, release everything together.

---

#### Q23: Why does `std::pmr::vector<std::string>` still allocate from the heap, while `std::pmr::vector<std::pmr::string>` does not?
**Difficulty:** #intermediate
**Category:** #memory #pmr
**Concepts:** #uses_allocator #propagation #nested_containers

**Answer:**
Only the vector's own array uses the resource. A `std::string` element uses `std::allocator`, so each long string allocates its buffer on the global heap. `std::pmr::string` is allocator-aware with a `polymorphic_allocator`, so the vector passes its resource to each element through uses-allocator construction.

**Explanation:**
- `polymorphic_allocator::construct` checks `std::uses_allocator<T, polymorphic_allocator<...>>` and, if true, appends the allocator to the constructor arguments.
- It works recursively: `pmr::map<pmr::string, pmr::vector<pmr::string>>` keeps everything in the same resource.
- Short strings fit the SSO buffer (no allocation at all), so the leak only shows with longer strings: easy to miss in tests.
- Verified with a counting resource: `pmr::vector<std::string>` element allocation did not hit the resource; `pmr::vector<pmr::string>` did, and `v[0].get_allocator().resource()` was the vector's resource.
- ❌ Common wrong answer: "Once the outer container is pmr, everything inside is in the arena."
- ✅ What a strong answer adds: a counting or guard resource in tests is the cheapest way to prove where allocations go.
- Deep dive: Topic 11, Memory Pools and Polymorphic Allocators (PMR)

**Key takeaway:** Use pmr types all the way down, or nested data escapes the arena.

---

#### Q24: What are `sizeof(A)` and `sizeof(B)` on a typical x86-64 system, and why do they differ?
**Difficulty:** #beginner
**Category:** #memory #layout
**Concepts:** #padding #alignment #member_order

```cpp
struct A { char c; int i; char d; };
struct B { int i; char c; char d; };
```

**Answer:**
`sizeof(A)` is 12 and `sizeof(B)` is 8. In `A`, the `int` needs a 4-aligned offset, so 3 padding bytes follow `c`, and 3 bytes of tail padding follow `d` so the size is a multiple of the struct's alignment (4). In `B` the two `char`s share the space after the `int`, leaving only 2 bytes of tail padding.

**Explanation:**
```cpp
#include <cstddef>
#include <iostream>

struct A { char c; int i; char d; };
struct B { int i; char c; char d; };

int main() {
    std::cout << "A " << sizeof(A) << " (" << offsetof(A, c) << ','
              << offsetof(A, i) << ',' << offsetof(A, d) << ")\n";
    std::cout << "B " << sizeof(B) << " (" << offsetof(B, i) << ','
              << offsetof(B, c) << ',' << offsetof(B, d) << ")\n";
}
```
- Output: `A 12 (0,4,8)` and `B 8 (0,4,5)`.
- Layout of `A`: c@0, padding 1-3, i@4-7, d@8, tail padding 9-11. Layout of `B`: i@0-3, c@4, d@5, tail padding 6-7.
- Both have `alignof` 4 (the strictest member).
- ❌ Common wrong answer: "6 bytes, the sum of the members." Padding is part of `sizeof`.
- ✅ What a strong answer adds: the exact numbers are implementation-defined (ABI), and for 10 million objects the difference is 120 MB vs 80 MB plus fewer cache lines touched.
- Deep dive: Topic 12, Alignment, Padding and Data Layout

**Key takeaway:** Padding depends on member order; `sizeof` includes interior and tail padding.

---

#### Q25: What is a packed struct, and what are the risks of using one?
**Difficulty:** #intermediate
**Category:** #memory #layout
**Concepts:** #pragma_pack #misalignment #wire_formats

**Answer:**
A packed struct (`#pragma pack(1)` or `__attribute__((packed))`) has no padding: members follow each other byte by byte and the struct's alignment drops to 1. Its members are therefore misaligned, which makes access slower, breaks atomicity and SIMD, can fault on strict-alignment CPUs, and makes pointers or references to members dangerous.

**Explanation:**
- `struct { char c; int i; }` packed: size 5, `i` at offset 1.
- Direct access `p.i` is safe: the compiler knows the member is packed and emits unaligned-safe code.
- `int* q = &p.i;` loses that knowledge. GCC refuses to bind `int&` to an `__attribute__((packed))` member and warns for the pointer (Clang 14 warns for the pointer but accepts the reference); with `#pragma pack` GCC 11 and Clang 14 accepted both silently.
- Arrays of packed structs place most elements at odd addresses.
- Typical legitimate use: describing a wire or file header. Even there, `memcpy`-based parsing into a naturally aligned struct is usually cleaner.
- ❌ Common wrong answer: "Packing is a free memory optimisation." It trades memory for slower, riskier access.
- ✅ What a strong answer adds: reorder members first; pack only when an external byte format forces it.
- Deep dive: Topic 12, Alignment, Padding and Data Layout

**Key takeaway:** Packing removes padding by creating misaligned members; keep it at the I/O boundary.

---
