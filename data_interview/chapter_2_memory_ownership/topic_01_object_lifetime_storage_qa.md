## TOPIC: Object Lifetime and Storage Duration

### INTERVIEW_QA: Interview Questions with Detailed Answers

#### Q1: What is the difference between an object's storage, its storage duration, its lifetime, and its scope?
**Difficulty:** #beginner
**Category:** #object_lifetime
**Concepts:** #storage_duration #lifetime #scope

**Answer:**
Storage is the memory that can hold the object; storage duration is the rule for how long that memory stays reserved; lifetime is the period during which the object actually exists (from completed initialization to the start of its destructor); scope is where its *name* is visible in the source.

**Explanation:**
- Storage can outlive the object: after `optional::reset()`, `vector::pop_back()` or an explicit destructor call the bytes remain, the object does not.
- Scope and lifetime differ for `static` locals (block scope, program lifetime) and for heap objects (no name at all, lifetime until `delete`).
- Accessing an object outside its lifetime is UB even if the storage still holds the old bytes.
- ❌ Common wrong answer: using "memory released", "object released" and "resource released" interchangeably. They are three different events.
- ✅ What a strong answer adds: a moved-from object is still alive (valid but unspecified); only destruction ends lifetime.

**Key takeaway:** Storage is memory, lifetime is existence, scope is a name: keep them separate.

---

#### Q2: What are the four storage durations, and where does each typically live?
**Difficulty:** #beginner
**Category:** #object_lifetime #memory_layout
**Concepts:** #automatic #static #thread_local #dynamic

**Answer:**
Automatic (block-scope locals and parameters: typically stack or registers), static (globals, `static` locals, static members: `.data`, `.bss`, `.rodata`), thread (`thread_local`: a per-thread TLS block), and dynamic (`new`: the heap / free store).

**Explanation:**
- Initialized globals with non-zero values go to `.data`; zero-initialized ones to `.bss` (no bytes in the executable); string literals and many `const` globals to `.rodata`; code to `.text`.
- In `int* p = new int(80);` the pointer `p` is automatic and the `int` is dynamic: two objects, two durations.
- Temporaries are not a fifth storage duration; they live until the end of the full-expression unless extended.
- ❌ Common wrong answer: "Local variables are always on the stack and `new` is always on the heap." These are implementation models: locals may live only in registers, and since C++14 compilers may elide `new`/`delete` pairs.
- ✅ What a strong answer adds: the standard defines durations, not segments; the layout is ELF/Linux convention.

**Key takeaway:** Automatic, static, thread, dynamic: language concepts with typical (not mandated) homes.

---

#### Q3: Where is a `volatile` variable stored?
**Difficulty:** #beginner
**Category:** #object_lifetime #volatile
**Concepts:** #volatile #storage_duration #mmio

**Answer:**
Wherever its storage duration puts it: a `volatile` local is automatic (typically stack), a global or `static volatile` has static storage. `volatile` is a qualifier on accesses (each read/write must actually be performed, in order relative to other volatile accesses); it does not choose a location.

**Explanation:**
- `volatile std::uint32_t* status = reinterpret_cast<volatile std::uint32_t*>(0x40000000);` reads a hardware register because the platform maps that address to a device. `volatile` did not put the register there; it stops the compiler from caching or removing the reads.
- `volatile` gives no atomicity and no inter-thread ordering: a data race on a `volatile int` is still UB. Threads need `std::atomic`.
- ❌ Common wrong answer: "`volatile` forces the variable into RAM instead of a register" or "into static memory".
- ✅ What a strong answer adds: legitimate uses are MMIO, `volatile std::sig_atomic_t` in signal handlers, and keeping benchmark loops from being optimized away.

**Key takeaway:** `volatile` changes how accesses are compiled, not where the object lives or whether it is thread-safe.

---

#### Q4: When exactly is the temporary destroyed here, and what does the caller hold?
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

**Key takeaway:** A temporary in a reference-returning `return` dies inside the callee.

---

#### Q5: What is wrong with this getter, and how do you fix it?
**Difficulty:** #beginner
**Category:** #object_lifetime #api_design
**Concepts:** #dangling_reference #return_by_value

```cpp
const std::string& getName() {
    std::string name = "Trading Desk";
    return name;
}
```

**Answer:**
`name` has automatic storage and is destroyed when the function returns, so the returned reference dangles. Return by value (`std::string getName()`), which is cheap thanks to NRVO or an implicit move.

**Explanation:**
- If returning a reference is required, the referenced object must outlive every use by the caller: a data member (`const std::string& name() const { return name_; }`) or a static.
- Even returning a reference to a member has a lifetime contract: it dangles if the owning object is destroyed or the member is reassigned.
- ❌ Common wrong answer: "Return `const&` to avoid a copy." There is no copy to avoid with return by value; there is a dead object to avoid with the reference.
- ✅ What a strong answer adds: compilers warn (`-Wreturn-local-addr` in GCC, `-Wreturn-stack-address` in Clang), and `string_view` return types hide the same bug: GCC (11 to 14) gives no warning for them, only Clang does.

**Key takeaway:** Never return a reference or view to a local; return by value.

---

#### Q6: When does binding a temporary to a reference extend its lifetime, and when doesn't it?
**Difficulty:** #intermediate
**Category:** #object_lifetime
**Concepts:** #lifetime_extension #temporary_materialization

**Answer:**
It extends when a `const T&` or `T&&` is bound directly to a prvalue (or a member of one, or a conditional of prvalues) in a declaration: the temporary then lives as long as the reference. It does not extend when the reference is obtained through a function call (including `std::move`, `std::max`, member functions returning `*this`), for views, for reference members in constructors, or for `new`-initializers.

**Explanation:**
- Verified with a tracing type (GCC 11):
  - `const T& r = T(1);`, `const T& r = Wrap{T(2)}.t;`, `const T& r = c ? T(3) : T(30);`, `RefAgg a{T(7)};`: extended.
  - `const T& r = id(T(4));`, `T&& r = std::move(T(5));`, `const T& r = T(6).self();`, `RefAgg a(T(8));` (C++20 parenthesized aggregate init): destroyed at the `;`.
- The compiler cannot see through a function returning a reference, so it cannot know which object to extend.
- GCC 11 gave no warning for any of the dangling cases; GCC 13 added `-Wdangling-reference`.
- ❌ Common wrong answer: "`const&` always extends the lifetime of a temporary."
- ✅ What a strong answer adds: a reference member initialized from a temporary in a mem-initializer is ill-formed since C++14 (Clang errors, GCC 11 only warns with `-Wextra`).

**Key takeaway:** Lifetime extension is a direct-binding rule; any function call in between breaks it.

---

#### Q7: A thread stores the address of its local in a global, and `main` reads it after `join()`. Is that safe?
**Difficulty:** #intermediate
**Category:** #object_lifetime #concurrency
**Concepts:** #dangling_pointer #thread_join #automatic_storage

```cpp
#include <iostream>
#include <thread>

int* ptr = nullptr;
void worker() { int value = 42; ptr = &value; }

int main() {
    std::thread t(worker);
    t.join();
    std::cout << *ptr << '\n';
}
```

**Answer:**
No. `value` is an automatic object in the worker's stack frame; it dies when `worker` returns, which is before `join()` returns. `join()` only waits for the thread to finish; it cannot extend any lifetime. Dereferencing `ptr` is undefined behaviour.

**Explanation:**
- `ptr` becomes dangling at the closing brace of `worker`, not at `join()` and not at thread exit.
- The thread's whole stack may be unmapped or reused after the thread ends. Observed with GCC 11: `92` at `-O0`, `31688` at `-O2`, a SEGV with `ASAN_OPTIONS=detect_stack_use_after_return=1`.
- `join()` does give a happens-before edge, so *if* the result lived in storage owned by `main`, reading it after `join()` would be race-free.
- Fixes: write the result into a variable owned by `main` (captured by reference), use `std::promise`/`std::future` (or `std::async`), or a `std::shared_ptr` owned by both.
- ❌ Common wrong answer: "It's safe because of `join()`; the thread is finished, so there is no race." No race, but a dead object.
- ✅ What a strong answer adds: the same applies to a pointer to a `thread_local` of a thread that has exited.

**Key takeaway:** `join()` synchronizes; it does not resurrect locals.

---

#### Q8: You keep `const Order& first = orders[0];` and then call `orders.push_back(...)`. Is `first` still valid?
**Difficulty:** #intermediate
**Category:** #object_lifetime #containers
**Concepts:** #reallocation #dangling_reference #element_lifetime

**Answer:**
Only if `push_back` did not reallocate. When `size() == capacity()`, the vector allocates a new block, move-constructs (or copies) every element into it, destroys the old elements and frees the old block. `first` referred to an old element object, whose lifetime has ended: using it is undefined behaviour, even though the value "looks" fine in a plain build.

**Explanation:**
- Container elements are separate objects whose lifetime is controlled by the container: `push_back` (on reallocation), `insert`, `erase`, `clear`, `resize` can end them.
- After reallocation, the "same" order lives in a **new** object at a new address; references, pointers and iterators to the old one dangle.
- `reserve(n)` up front guarantees no reallocation until `size()` exceeds `n` (valid references stay valid); it is a fix only when the bound is really known.
- Other fixes: keep an index instead of a reference; copy the value you need before mutating; use `std::deque` (`push_back`/`push_front` keep references to existing elements valid, though they invalidate iterators) or `std::list`; or store `std::unique_ptr<Order>` so the element objects never move.
- The library must handle the self-referencing case itself: `v.push_back(v[0])` is required to work even when it reallocates.
```cpp
#include <iostream>
#include <string>
#include <vector>

struct Order { std::string sym; int qty; };

int main() {
    std::vector<Order> orders;
    orders.push_back({"AAPL", 100});
    const Order& first = orders[0];          // refers to the element object
    std::cout << "capacity before: " << orders.capacity() << '\n';
    orders.push_back({"MSFT", 200});         // capacity 1 -> 2: reallocation
    std::cout << "capacity after: " << orders.capacity() << '\n';
    std::cout << first.qty << '\n';          // UB: the old element is dead
}
```
- Output with GCC 11 / libstdc++ at `-O0`: `capacity before: 1`, `capacity after: 2`, then `100` (the freed bytes were not overwritten yet). Under ASan: `heap-use-after-free` on line 14, with the free inside `new_allocator<Order>::deallocate` during `push_back`.
- ❌ Common wrong answer: "A reference to a vector element is like a reference to a variable: valid as long as the vector exists." The vector outlives its elements' storage.
- ✅ What a strong answer adds: the same bug hides in range-for loops that `push_back` into the vector being iterated, and in code that stores `&v[i]` in a second data structure.

**Key takeaway:** Container operations can end element lifetimes; a reference into a `std::vector` survives only until the next reallocation.

---

#### Q9: An API returns `std::string_view` of a string it builds internally. Callers sometimes see corrupted text. What is the bug, and how do you redesign it?
**Difficulty:** #intermediate
**Category:** #object_lifetime #api_design
**Concepts:** #string_view #dangling_view #ownership

**Answer:**
The view points into a `std::string` that is destroyed when the function returns, so the caller holds a dangling view. If the caller needs ownership, return `std::string`. If non-owning access is the goal, return a view only into storage that outlives the call (a member, a static table) and document that lifetime.

**Explanation:**
- "Sometimes" is typical: short strings are stored inside the dead `std::string` object (SSO) on the stack, long strings in freed heap memory; both may still look valid until something reuses them.
- No lifetime extension applies to views: `std::string_view sv = std::string("abc");` dangles at the `;`.
- Compilers rarely warn here; ASan reports `stack-use-after-return`/`heap-use-after-free` when it triggers.
- ❌ Common wrong answer: "`string_view` is safer than `const std::string&`." It has exactly the same lifetime rules plus no lifetime extension.
- ✅ What a strong answer adds: views are excellent as **parameters** (the argument outlives the call) and dangerous as **return types and members**.

**Key takeaway:** A view never owns; return owning types unless the storage provably outlives the caller.

---

#### Q10: Why can `for (auto x : make_obj().items())` crash, and what did C++23 change?
**Difficulty:** #advanced
**Category:** #object_lifetime #language_evolution
**Concepts:** #range_for #lifetime_extension #p2718

**Answer:**
The range-for expands to `auto&& __range = make_obj().items();`. If `items()` returns a reference into the object, `__range` binds to that reference, not to the temporary returned by `make_obj()`, so the temporary is destroyed before the loop starts and the loop iterates a dead container. C++23 (P2718) extends the lifetime of all temporaries in the range-initializer until the end of the loop.

**Explanation:**
- `for (auto x : make_obj().member)` (direct member access) is fine: binding to a member of a prvalue extends the whole object.
- ASan (GCC 11, C++20) on the `items()` form: `stack-use-after-scope` on the first iteration.
- Fixes for pre-C++23 compilers: name the owner (`auto obj = make_obj(); for (auto x : obj.items())`) or use the C++20 init-statement: `for (auto obj = make_obj(); auto x : obj.items())`.
- GCC 15 implements P2718; check your compiler before relying on it.
- ❌ Common wrong answer: "Range-for binds with `auto&&`, which extends lifetime, so it's safe." It extends only what it binds to directly.
- ✅ What a strong answer adds: the same trap appears with `std::get<0>(make_tuple(...))`, `*make_shared<...>()`, and `optional().value()` chains.

**Key takeaway:** Before C++23, a range-for over a reference into a temporary dangles.

---

#### Q11: In what order are class members initialized, and why does it matter?
**Difficulty:** #beginner
**Category:** #object_lifetime #classes
**Concepts:** #member_initialization_order #destruction_order #wreorder

**Answer:**
Bases first (virtual bases, then direct bases left to right), then non-static members in the order they are **declared** in the class, regardless of the order in the member initializer list. Destruction is the exact reverse. An initializer that reads a member declared later reads an uninitialized value.

**Explanation:**
- `struct Quote { int spread; int bid, ask; Quote(int b, int a) : bid(b), ask(a), spread(ask - bid) {} };` computes `spread` from indeterminate `ask` and `bid` (UB; one run printed `-1015157611`).
- GCC `-Wall` reports `-Wreorder` and, for this simple case, `-Wuninitialized`.
- Reverse destruction lets later members depend on earlier ones: declare a worker `std::thread` after the queue it consumes, so the thread is joined (in the destructor body or by its own wrapper) while the queue is still alive.
- ❌ Common wrong answer: "In the order of the initializer list."
- ✅ What a strong answer adds: the fixed order exists so that destruction can be the exact reverse for every constructor; per-constructor orders would make that impossible.

**Key takeaway:** Declaration order rules construction; reverse order rules destruction.

---

#### Q12: What is the static initialization order fiasco and how do you avoid it?
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

**Key takeaway:** Across files, dynamic static initialization has no order you can rely on.

---

#### Q13: Is a function-local static thread-safe? What does it cost?
**Difficulty:** #intermediate
**Category:** #object_lifetime #concurrency
**Concepts:** #magic_statics #guard_variable #singleton

**Answer:**
Its **initialization** is thread-safe since C++11: if several threads reach the declaration at once, exactly one runs the initializer and the others wait. Using the object afterwards is not synchronized by the language. The cost after initialization is one acquire load of a guard variable and a branch per call.

**Explanation:**
- Eight threads racing into `static const RefData instance;` with a 50 ms constructor: `constructions=1`, TSan clean.
- GCC/Clang implement it with a guard byte and `__cxa_guard_acquire`/`__cxa_guard_release` on the slow path.
- If the initializer throws, the static stays uninitialized and the next call retries.
- Recursive initialization (the initializer calls the same function) is UB.
- `-fno-threadsafe-statics` removes the guard: only for code known to be single-threaded.
- ❌ Common wrong answer: "Meyers singleton is fully thread-safe." Only construction is; mutation needs a lock or atomics.
- ✅ What a strong answer adds: in a hot path, cache the reference (`static const auto& cfg = config();` at a higher level, or pass it in) to skip even the guard check.

**Key takeaway:** Magic statics make initialization safe, not usage.

---

#### Q14: A global object's destructor logs through a logger singleton and the program crashes at exit. Why?
**Difficulty:** #advanced
**Category:** #object_lifetime #static_initialization
**Concepts:** #destruction_order #static_destruction #leaky_singleton

**Answer:**
Static objects are destroyed in the reverse order of the completion of their construction. If the logger was constructed **after** the global (for example on first use, later during the run), it is destroyed **before** the global, and the global's destructor calls into a dead object: the destruction order fiasco.

**Explanation:**
- Fix 1: make sure the dependency is constructed first: call `logger()` in the global's constructor, so the logger completes construction earlier and is destroyed later.
- Fix 2: intentionally leak: `Logger& logger() { static Logger& l = *new Logger; return l; }`. Never destroyed, so always usable; the OS reclaims memory at exit (flush explicitly if it buffers).
- Fix 3: avoid non-trivial global objects; create components in `main` and pass dependencies.
- `std::exit` runs static destructors; `std::quick_exit`, `std::_Exit`, `std::abort` do not.
- ❌ Common wrong answer: "Globals are destroyed in declaration order" or "function statics are never destroyed".
- ✅ What a strong answer adds: thread_local objects of the main thread are destroyed before statics, and a detached thread still running at exit can touch destroyed statics.

**Key takeaway:** Statics die in reverse order of construction; a dependency constructed later dies earlier.

---

#### Q15: What is the difference between `const`, `constexpr`, and `constinit` on a global?
**Difficulty:** #intermediate
**Category:** #static_initialization #cpp20
**Concepts:** #constinit #constexpr #constant_initialization

**Answer:**
`const` means the object cannot be modified, but its initializer may run at run time. `constexpr` means it is `const` and initialized at compile time, usable in constant expressions. `constinit` (C++20) means only "must be constant-initialized"; the variable itself remains mutable.

**Explanation:**
- `const int a = read_env();` dynamic initialization: still subject to SIOF.
- `constexpr int b = 9000;` compile-time constant, implicitly `const`.
- `constinit int c = 9000;` statically initialized, can be changed later (`c = 9100;`); `constinit int d = read_env();` is a compile error.
- `constinit` is useful for mutable globals and `thread_local` variables: for `thread_local`, it also removes the per-access "initialized yet?" check of dynamic TLS initialization.
- ❌ Common wrong answer: "`constinit` is the same as `constexpr`."
- ✅ What a strong answer adds: `constinit` cannot fix a type whose constructor is not `constexpr`; `std::mutex` works because its default constructor is `constexpr`.

**Key takeaway:** `constinit` = guaranteed static initialization, not immutability.

---

#### Q16: When is a `thread_local` object constructed and destroyed?
**Difficulty:** #intermediate
**Category:** #object_lifetime #concurrency
**Concepts:** #thread_local #tls #thread_exit

**Answer:**
Each thread has its own instance. If its initializer is constant, it exists from thread start; if dynamic, it is guaranteed to be initialized before its first odr-use in that thread (GCC/Clang do it lazily on first use, so threads that never touch it never construct it). It is destroyed when its thread exits, before `join()` returns; the main thread's instances are destroyed at `exit`, before static objects.

**Explanation:**
- Measured: thread a used `session` → `open t1 ... close t1 after 3 requests`; a thread that never touched it printed no open/close.
- Accessing a `thread_local` is a segment-relative load (`%fs` on x86-64 Linux) in the executable; in a shared library it may call `__tls_get_addr`. Dynamic initialization adds a guard check per access.
- Typical uses: per-thread caches, per-thread memory pools, per-thread random engines, error state like `errno`.
- ❌ Common wrong answer: "Every thread constructs all `thread_local` objects when it starts."
- ✅ What a strong answer adds: a pointer to a `thread_local` handed to another thread dangles after the owner thread exits; thread pools keep threads alive, so per-thread caches there live for the whole program.

**Key takeaway:** One instance per thread, constructed by first use, destroyed at that thread's exit.

---

#### Q17: A lambda captures a local by reference and is stored for later. What happens?
**Difficulty:** #intermediate
**Category:** #object_lifetime #lambdas
**Concepts:** #dangling_capture #std_function #callbacks

**Answer:**
The closure holds a reference to the local; once the function returns, the local is dead and calling the lambda reads a dangling reference (UB). Capture by value (or move-capture with `[p = std::move(p)]`) anything the callback needs after the scope ends, or capture a `std::shared_ptr`/`std::weak_ptr` when lifetime is shared.

**Explanation:**
- Classic shape: `std::function<int()> make_counter() { int n = 0; return [&] { return ++n; }; }`.
- The same bug with `this`: `[this]` (or `[=]`, which captures `this` in C++17) in a callback registered with a longer-lived component.
- ASan reports `stack-use-after-return` (with `detect_stack_use_after_return=1`) or `stack-use-after-scope`.
- ❌ Common wrong answer: "`[&]` is fine because the lambda is defined in the same scope." Where it is defined does not matter; where it is **called** does.
- ✅ What a strong answer adds: `[&]` is safe for lambdas used immediately (algorithms, `std::thread` joined in the same scope); for stored callbacks, default to explicit by-value captures.

**Key takeaway:** A stored lambda must own what it uses, or prove the referent outlives it.

---
