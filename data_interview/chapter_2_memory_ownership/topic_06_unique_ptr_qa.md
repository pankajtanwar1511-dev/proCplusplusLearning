## TOPIC: std::unique_ptr

### INTERVIEW_QA: Interview Questions with Detailed Answers

#### Q1: Why does `std::unique_ptr<Buffer> p2 = p1;` not compile, explained with the ownership model rather than just "it is not copyable"?
**Difficulty:** #beginner
**Category:** #smart_pointers #ownership
**Concepts:** #unique_ptr #deleted_copy #exclusive_ownership

**Answer:**
`p1` is the sole owner of the `Buffer`: its destructor will delete it. A copy would create a second object whose destructor also deletes the same `Buffer`, a double delete. To make exclusive ownership a compile-time property, `unique_ptr` deletes its copy constructor and copy assignment, so the error is "use of deleted function".

**Explanation:**
- `p1` is the `unique_ptr` object itself (often on the stack); it **contains** a `Buffer*` to the dynamically allocated `Buffer`.
- Transfer instead of copy: `auto p2 = std::move(p1);` leaves exactly one owner at every moment.
- If you want a second *reference* (not owner), use `Buffer&` or `p1.get()`; if you need a second *owner*, the design calls for `shared_ptr`.
- ❌ Common wrong answer: "`p1` is a pointer on the stack pointing to the `unique_ptr`." `p1` is the `unique_ptr`; there is no extra indirection.
- ❌ Common wrong answer: "`unique_ptr`'s constructor allocates the memory." `make_unique` (or `new`) creates the object; `unique_ptr` takes ownership.
- ✅ What a strong answer adds: the deleted copy turns a run-time bug (double delete) into a compile-time error, which is the whole point of encoding ownership in types.

**Key takeaway:** One owner, enforced by the type system: copying is deleted, moving transfers.

---

#### Q2: Walk through `auto p2 = std::move(p1);`. What moves, what is `p1` afterwards, and is `p1->f()` safe?
**Difficulty:** #beginner
**Category:** #smart_pointers #move_semantics
**Concepts:** #std_move #moved_from_state #null_dereference

**Answer:**
`std::move(p1)` only casts `p1` to an rvalue (xvalue). That selects `unique_ptr`'s move constructor, which copies the stored pointer into `p2` and sets `p1`'s pointer to `nullptr`. The `Buffer` itself does not move and no allocation happens. `p1` is guaranteed empty, so `p1->f()` dereferences null: UB.

**Explanation:**
```text
before:  p1 ──► Buffer @0x1000        after:  p1 ──► nullptr
         p2                                   p2 ──► Buffer @0x1000
```
- Unlike most moved-from types ("valid but unspecified"), a moved-from `unique_ptr` is **specified** to be null.
- `p1` is still a valid object: `if (p1)`, `p1 = std::make_unique<Buffer>()`, `p1.reset()` are all fine.
- `sizeof(p1)` and its type are unchanged; only the state changes.
- ❌ Common wrong answer: "The Resource on the heap is moved to `p2`." Only the ownership (the pointer value) is transferred.
- ❌ Common wrong answer: "`p1->f()` is safe because `p1` is still a valid object." Valid object, null pointer.
- ✅ What a strong answer adds: transfer is just two pointer writes, which is why `unique_ptr` can be passed around by value with essentially zero cost.

**Key takeaway:** `std::move` casts; the move constructor transfers; the source is guaranteed null.

---

#### Q3: When `foo()` ends, which destructors run and in what order?
**Difficulty:** #intermediate
**Category:** #smart_pointers #object_lifetime
**Concepts:** #destruction_order #moved_from #unique_ptr

```cpp
void foo() {
    auto p1 = std::make_unique<Resource>();
    auto p2 = std::move(p1);
    std::cout << "done\n";
}
```

**Answer:**
Both `unique_ptr` destructors run, in reverse declaration order: `p2` first, which deletes the `Resource` (`~Resource` runs here), then `p1`, which holds `nullptr` and does nothing. `~Resource` runs exactly once.

**Explanation:**
```cpp
#include <iostream>
#include <memory>

struct Resource { ~Resource() { std::cout << "~Resource\n"; } };

struct Del {
    const char* who;
    void operator()(Resource* r) const { std::cout << who << " deletes\n"; delete r; }
};

int main() {
    std::unique_ptr<Resource, Del> p1(new Resource, Del{"p1"});
    std::unique_ptr<Resource, Del> p2(std::move(p1));
    p2.get_deleter().who = "p2";
    std::cout << "done\n";
}
```
- Output:
```
done
p2 deletes
~Resource
```
- `p1`'s deleter is never called: the destructor does not invoke the deleter on a null pointer.
- ❌ Common wrong answer: "`p1` is destroyed first (it does nothing), then `p2`." Locals die in reverse declaration order: `p2` first.
- ✅ What a strong answer adds: the order matters when other locals depend on the object; anything declared before `p2` outlives the `Resource`.

**Key takeaway:** Reverse declaration order; the empty handle's destructor is a no-op.

---

#### Q4: When there is only one owner, why choose `unique_ptr` over `shared_ptr`, beyond "it is faster"?
**Difficulty:** #intermediate
**Category:** #smart_pointers #design
**Concepts:** #ownership_model #control_block #atomic_refcount

**Answer:**
Because the type should state the ownership model: `unique_ptr` says "exactly one owner, transferable", `shared_ptr` says "lifetime is shared and ends with the last owner". With one owner, shared ownership adds a control block, atomic reference counting and a two-pointer handle, and it makes lifetime harder to reason about, for no benefit.

**Explanation:**

| | `unique_ptr<T>` | `shared_ptr<T>` |
|---|---|---|
| Handle size | 8 bytes (stateless deleter) | 16 bytes (object ptr + control block ptr) |
| Extra allocation | None | Control block (merged with object by `make_shared`) |
| Copy | Deleted | Atomic increment |
| Move | Two pointer writes | Two pointer writes (no count change) |
| Destruction | Deleter call | Atomic decrement, maybe delete object, maybe control block |
| Deleter | Part of the type | Type-erased in the control block |
| Upgrade path | Converts to `shared_ptr` | Cannot go back to unique |

- Thread-safety angle: `shared_ptr`'s count updates are atomic and therefore cost something even single-threaded; under contention the control block's cache line bounces between cores (topic 08). `unique_ptr` has nothing shared.
- Reasoning angle: with `unique_ptr` you can point to the line where the object dies; with `shared_ptr` the last owner might be anywhere (and cycles can leak, topic 09).
- ❌ Common wrong answer: "`shared_ptr` always causes contention." Only when several threads copy/destroy handles to the same control block concurrently.
- ✅ What a strong answer adds: return `unique_ptr` from factories, since the caller can still convert it to `shared_ptr` if it really needs sharing.

**Key takeaway:** Default to `unique_ptr`; shared ownership is a design decision, not a safety blanket.

---

#### Q5: What is `sizeof(std::unique_ptr<T>)`, and how does a custom deleter change it?
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

**Key takeaway:** Stateless deleters are free; stateful ones cost their state.

---

#### Q6: Why does a `FILE*` need a custom deleter, and when is that deleter called?
**Difficulty:** #intermediate
**Category:** #smart_pointers #raii
**Concepts:** #custom_deleter #fclose #raii_beyond_memory

**Answer:**
Because a `FILE*` from `fopen` must be released with `fclose`, not `delete`; the default deleter would be UB. The custom deleter is called whenever the `unique_ptr` releases a **non-null** pointer: on destruction, on `reset()`, on `reset(q)` for the old pointer, and on move assignment for the old pointer. It is never called for null, and moving the `unique_ptr` transfers the pointer and the deleter without calling it.

**Explanation:**
```cpp
#include <cstdio>
#include <iostream>
#include <memory>

struct Closer {
    void operator()(std::FILE* f) const { std::cout << "fclose\n"; std::fclose(f); }
};
using FilePtr = std::unique_ptr<std::FILE, Closer>;

int main() {
    FilePtr missing(std::fopen("/no/such/file", "r"));   // fopen fails: nullptr
    FilePtr a(std::tmpfile());
    FilePtr b = std::move(a);                            // no call: just a transfer
    std::cout << "reset b\n";
    b.reset();                                           // fclose
    std::cout << "end of main\n";                        // a, missing: null, no calls
}
```
- Output:
```
reset b
fclose
end of main
```
- This is RAII beyond memory: the "resource" is an open file, the cleanup policy is part of the type, and the release is automatic on every exit path.
- ❌ Common wrong answer: "After moving, the source still holds something, maybe a closed file." It holds `nullptr`.
- ✅ What a strong answer adds: a `shared_ptr` deleter, by contrast, **is** called with null if the `shared_ptr` was constructed from `nullptr` with a deleter; `unique_ptr` deleters can skip the null check.

**Key takeaway:** The deleter runs exactly once per owned non-null pointer, wherever ownership ends.

---

#### Q7: Is `std::unique_ptr` a type-erasing smart pointer? What follows from your answer?
**Difficulty:** #intermediate
**Category:** #smart_pointers #templates
**Concepts:** #type_erasure #deleter_type #shared_ptr_comparison

**Answer:**
No. The deleter is a template parameter, so `unique_ptr<FILE, A>` and `unique_ptr<FILE, B>` are different, unrelated types. That is what lets it inline the deleter and stay pointer-sized, but it also means handles with different deleters cannot be assigned to each other or stored in the same container. `shared_ptr` is the type-erasing one: its deleter lives in the control block.

**Explanation:**
- `std::vector<std::unique_ptr<int, D1>>` rejects a `unique_ptr<int, D2>` at compile time; `std::vector<std::shared_ptr<int>>` accepts handles with any deleters.
- Every distinct lambda has its own type, so two `unique_ptr`s with "the same" lambda written twice are different types; name the deleter type once (`using FilePtr = ...`).
- To mix deleters in one `unique_ptr` type, you must erase yourself: function pointer or `std::function` deleter (paying size and an indirect call).
- ❌ Common wrong answer: "Both smart pointers store the deleter in the same way."
- ✅ What a strong answer adds: same trade-off as templates vs virtual functions: compile-time policy (fast, rigid) vs run-time policy (flexible, indirect).

**Key takeaway:** `unique_ptr` bakes the deleter into the type; `shared_ptr` erases it.

---

#### Q8: What is wrong with `std::unique_ptr<int> p(new int[10]);`, and how many destructors run for `make_unique<Buffer[]>(5)`?
**Difficulty:** #beginner
**Category:** #smart_pointers #arrays
**Concepts:** #unique_ptr_array #delete_vs_delete_array #undefined_behavior

**Answer:**
`unique_ptr<int>` uses `default_delete<int>`, which calls scalar `delete` on memory from `new[]`: undefined behaviour (not "deletes the first element"). `unique_ptr<int[]>` selects `default_delete<int[]>`, which calls `delete[]`. `make_unique<Buffer[]>(5)` constructs five `Buffer`s and destroys all five, in reverse order (4 to 0).

**Explanation:**
- The `[]` is part of the type: it picks the array partial specialization of `unique_ptr` and `default_delete`, not "the subscript operator".
- `unique_ptr<T[]>` offers `p[i]` and no `*`/`->`.
- ASan reports the scalar version as `alloc-dealloc-mismatch (operator new [] vs operator delete)`.
- With class types, mismatched `delete` typically runs one destructor and hands the allocator a wrong address (the array cookie that stores the count is skipped): heap corruption.
- Prefer `std::vector<T>`; use `unique_ptr<T[]>` for fixed buffers passed to C APIs.
- ❌ Common wrong answer: "`delete` without `[]` frees only the first element."
- ✅ What a strong answer adds: `make_unique<int[]>(n)` zero-initializes; `make_unique_for_overwrite<int[]>(n)` (C++20) skips that when the buffer will be filled anyway.

**Key takeaway:** `T` vs `T[]` chooses `delete` vs `delete[]`; mixing them is UB.

---

#### Q9: Why prefer `std::make_unique`? Is the exception-safety argument still valid in C++17?
**Difficulty:** #intermediate
**Category:** #smart_pointers #exception_safety
**Concepts:** #make_unique #evaluation_order #naked_new

**Answer:**
`make_unique` avoids naked `new`, states the type once, and creates the object directly into an owner. Before C++17 it also prevented a leak in calls like `f(std::unique_ptr<A>(new A), g())`, where the compiler could run `new A`, then `g()` (throwing), before constructing the `unique_ptr`. C++17 sequenced function-argument initialization so that interleaving can no longer happen; the other reasons remain.

**Explanation:**
- C++17 rule: each parameter's initialization (with all its side effects) completes before another parameter's begins; the order between parameters is still unspecified.
- So `f(std::unique_ptr<A>(new A), g())` is leak-free in C++17: either `A` is fully owned before `g()` runs, or `g()` throws before `new A` is evaluated.
- Remaining benefits: no `new` in application code (a mechanical review rule), less repetition (`auto p = std::make_unique<VeryLongTypeName>(x);`), symmetric with `make_shared`.
- When you cannot use it: custom deleters, adopting a pointer from a C API, private constructors (the factory cannot call them), brace-initialization (`make_unique` uses parentheses).
- Unlike `make_shared`, there is no performance gain: no control block to co-allocate.
- ❌ Common wrong answer: "`make_unique` is faster than `unique_ptr(new T)`." Same code.
- ✅ What a strong answer adds: knowing **why** C++17 changed (P0145, refining expression evaluation order) shows you understand the original leak rather than repeating a rule.

**Key takeaway:** In C++17 `make_unique` is about style and safety by construction, not about argument-evaluation leaks.

---

#### Q10: What is the difference between `get()`, `release()` and `reset()`?
**Difficulty:** #beginner
**Category:** #smart_pointers #api
**Concepts:** #get #release #reset

**Answer:**
`get()` returns the raw pointer and keeps ownership. `release()` returns the raw pointer and gives up ownership without deleting anything: the caller is now responsible. `reset()` deletes the currently owned object (if any) and optionally adopts a new pointer.

**Explanation:**

| Call | Returns | Deletes? | `p` afterwards |
|---|---|---|---|
| `p.get()` | `T*` | No | Unchanged |
| `p.release()` | `T*` | No | Empty |
| `p.reset()` | void | Old object | Empty |
| `p.reset(q)` | void | Old object (after storing `q`) | Owns `q` |

- Typical uses:
  - `get()`: pass to a function/C API that only borrows
  - `release()`: hand ownership to a C API or legacy code that will free it (call it **after** the adopting call succeeds)
  - `reset()`: release early, before the end of scope
- `p.release();` with the result ignored is a leak; libstdc++ 11 does not mark it `[[nodiscard]]`, so there is no warning.
- ❌ Common wrong answer: "`release()` frees the memory."
- ✅ What a strong answer adds: `std::unique_ptr<T> b(a.get());` is a double-delete bug; transfer only with `std::move` or `reset(release())`.

**Key takeaway:** `get` borrows, `release` abandons ownership, `reset` destroys.

---

#### Q11: In `p.reset(new T(2))`, is the old object deleted before or after `p` starts pointing to the new one? Why does it matter?
**Difficulty:** #advanced
**Category:** #smart_pointers #api
**Concepts:** #reset_order #reentrancy #exception_safety

**Answer:**
After. The standard specifies: save the old pointer, store the new pointer, then call the deleter on the old pointer if it was non-null. So while the old object is being destroyed, `p.get()` already returns the new pointer.

**Explanation:**
```cpp
#include <iostream>
#include <memory>

std::unique_ptr<int, void (*)(int*)>* owner = nullptr;

void noisy_delete(int* p) {
    std::cout << "deleting " << *p;
    if (owner) std::cout << ", owner now holds " << *owner->get();
    std::cout << '\n';
    delete p;
}

int main() {
    std::unique_ptr<int, void (*)(int*)> u(new int(1), noisy_delete);
    owner = &u;
    u.reset(new int(2));
    owner = nullptr;                 // u is about to be destroyed
    std::cout << "end\n";
}
```
- Output:
```
deleting 1, owner now holds 2
end
deleting 2
```
- The first line is printed from inside the deleter of the **old** object, and `u.get()` already returns the new one.
- Why the order: if the old object's destructor reaches back into its owner (observers, parent links), it sees a consistent owner, not a dangling pointer to itself; move assignment is defined the same way (`reset(other.release())`).
- ❌ Common wrong answer: "`reset` deletes first, then assigns, like `delete p; p = q;`."
- ✅ What a strong answer adds: the order does not protect against self-reset: `p.reset(p.get())` leaves `p` owning a deleted object, and the later destructor deletes it again (UB; glibc aborts with "double free detected in tcache 2").

**Key takeaway:** `reset(q)`: store `q` first, delete old second.

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

**Key takeaway:** Polymorphic ownership through `unique_ptr<Base>` requires `virtual ~Base()`.

---

#### Q13: How should a function accept a `unique_ptr`, or should it at all?
**Difficulty:** #intermediate
**Category:** #smart_pointers #api_design
**Concepts:** #sink_parameter #reseat #observer

**Answer:**
Most functions should not: if they only use the object, take `T&` (or `T*` if null is allowed) and let callers pass `*p` or `p.get()`. Take `std::unique_ptr<T>` **by value** when the function takes ownership (sink), and `std::unique_ptr<T>&` when it must replace or reset the caller's pointer (reseat). `const std::unique_ptr<T>&` is almost never useful.

**Explanation:**
- Sink by value: the caller must write `f(std::move(p))`, making the transfer visible; after the call `p` is guaranteed null.
- Sink by `unique_ptr&&` also works, but the callee might not actually move from it, so the caller cannot be sure `p` is empty afterwards.
- `T&` parameters work for objects owned by `unique_ptr`, `shared_ptr`, containers or the stack, so the function is reusable.
- Return by value for factories: `std::unique_ptr<T> make();` with `return p;` (no `std::move`, topic 04).
- ❌ Common wrong answer: "Always pass smart pointers by const reference to avoid copies."
- ✅ What a strong answer adds: C++ Core Guidelines R.32 (take `unique_ptr<T>` to express sink), R.33 (take `unique_ptr<T>&` to express reseat), F.7 (take `T*`/`T&` when ownership is not involved).

**Key takeaway:** Signatures document ownership: `T&` to use, by value to sink, by reference to reseat.

---

#### Q14: Why does the pimpl idiom with `std::unique_ptr<Impl>` require an out-of-line destructor?
**Difficulty:** #advanced
**Category:** #smart_pointers #idioms
**Concepts:** #pimpl #incomplete_type #default_delete

**Answer:**
`default_delete<Impl>` must see the complete `Impl` type to delete it (the standard requires it; libstdc++ checks with `static_assert(sizeof(Impl) > 0)`). If `Widget`'s destructor is implicit, it is generated inline in every translation unit that destroys a `Widget`, where `Impl` is incomplete, so compilation fails. Declaring `~Widget();` in the header and defining it `= default` in the .cpp after `Impl` is defined fixes it.

**Explanation:**
- The error (libstdc++): "invalid application of 'sizeof' to incomplete type 'Widget::Impl'", pointing into `unique_ptr.h`.
- The same applies to the move assignment operator (it deletes the old `Impl`) and to anything calling `reset`; declare them in the header, default them in the .cpp.
- Constructors need it too: every constructor (including a defaulted move constructor) potentially invokes the members' destructors in case a later step throws ([class.base.init]), so `Widget(Widget&&) noexcept = default;` written inline in the header fails with the same error once it is used (verified GCC 11, Clang 14). Define the constructors in the .cpp as well.
- Declaring the destructor suppresses the implicit moves, which is why the moves must be declared explicitly.
- `shared_ptr<Impl>` does not need this (its deleter is fixed when the `shared_ptr` is created, in the .cpp), but costs a control block and atomic counts.
- ❌ Common wrong answer: "unique_ptr cannot hold incomplete types." It can be declared and moved around; only deleting needs the complete type.
- ✅ What a strong answer adds: the payoff of pimpl: changing `Impl` does not change the header or `sizeof(Widget)`, so clients do not recompile (ABI stability for libraries).

**Key takeaway:** Pimpl + `unique_ptr`: declare special members in the header, define them where `Impl` is complete.

---

#### Q15: Can you convert between `unique_ptr` and `shared_ptr`?
**Difficulty:** #intermediate
**Category:** #smart_pointers #ownership
**Concepts:** #unique_to_shared #factory_return_type #control_block

**Answer:**
`unique_ptr` to `shared_ptr`: yes, implicitly from an rvalue (`std::shared_ptr<T> s = std::move(u);` or directly from a function returning `unique_ptr`); the deleter is moved into a newly allocated control block. `shared_ptr` to `unique_ptr`: no, because other owners may exist and `shared_ptr` has no `release()`.

**Explanation:**
- This is why factories should return `unique_ptr`: it is the most flexible return type; callers that need sharing convert for the cost of one control-block allocation.
- Converting from an lvalue `unique_ptr` does not compile: it must be moved, which empties the source.
- The converted object was not created by `make_shared`, so object and control block are separate allocations (topic 07).
- ❌ Common wrong answer: "Use `shared_ptr` everywhere because you might need to share later."
- ✅ What a strong answer adds: `std::shared_ptr<T> s(u.release());` loses a custom deleter (it would use `delete`); always convert from the `unique_ptr` itself.

**Key takeaway:** Unique converts to shared, never back: start unique.

---

#### Q16: Why does `std::vector<std::unique_ptr<int>> v{std::make_unique<int>(1), std::make_unique<int>(2)};` fail to compile?
**Difficulty:** #intermediate
**Category:** #smart_pointers #containers
**Concepts:** #initializer_list #move_only #const_elements

**Answer:**
A braced list creates a `std::initializer_list<std::unique_ptr<int>>`, whose elements can only be accessed as `const` references, so the vector would have to copy them, and `unique_ptr` is not copyable. Build the vector with `push_back`/`emplace_back`, or move from an array.

**Explanation:**
```cpp
#include <iostream>
#include <iterator>
#include <memory>
#include <vector>

int main() {
    std::vector<std::unique_ptr<int>> v;
    v.reserve(2);
    v.push_back(std::make_unique<int>(1));
    v.emplace_back(std::make_unique<int>(2));

    std::unique_ptr<int> arr[] = {std::make_unique<int>(3), std::make_unique<int>(4)};
    v.insert(v.end(), std::make_move_iterator(std::begin(arr)),
             std::make_move_iterator(std::end(arr)));

    for (const auto& p : v) std::cout << *p << ' ';
    std::cout << '\n';
}
```
- Output: `1 2 3 4`.
- libstdc++'s error for the braced version: "static assertion failed: result type must be constructible from value type of input range".
- Iterate with `const auto&` (or `auto&`): `for (auto p : v)` tries to copy each element and also fails.
- ❌ Common wrong answer: "The temporaries are rvalues, so they should be moved." They are moved into the `initializer_list`'s array, but the vector can only read that array through `const&`.
- ✅ What a strong answer adds: the same limitation affects any move-only type (`std::thread`, `std::jthread`, `std::fstream`).

**Key takeaway:** `initializer_list` is copy-only; fill containers of move-only types with `push_back`/`emplace_back`.

---

#### Q17: Can `std::unique_ptr` manage a POSIX file descriptor, which is an `int` and not a pointer?
**Difficulty:** #advanced
**Category:** #smart_pointers #raii
**Concepts:** #custom_deleter #fancy_pointer #nullable_pointer

**Answer:**
Yes, but not as `unique_ptr<int>`. If the deleter declares `using pointer = X;`, `unique_ptr` stores an `X` instead of `T*`. `X` must satisfy the *NullablePointer* requirements (default and `nullptr` construction give the "null" value, comparable with `nullptr`, copyable), so you wrap the `int` in a small type where `-1` means null. The result is a 4-byte, move-only owner that calls `close` exactly once.

**Explanation:**
- Why plain `int` fails: `unique_ptr` needs to construct a null value, compare against `nullptr` and store "empty" after a move; an `int` cannot be constructed from `nullptr`, and `0` is a valid descriptor (stdin), so it would be the wrong null anyway.
- The usual wrong workaround, `unique_ptr<int, Closer>(new int(fd))`, adds a heap allocation per descriptor just to have a pointer.
- With `pointer = Fd`: `get()` returns the `Fd`, `release()` returns it and stores `Fd{}`, the deleter is called only when the stored value is not null, so a failed `open` (`-1`) is never closed.
- The element type is irrelevant once `pointer` is overridden; `void` makes it clear that `operator*` is not meant to be used.
- In practice many codebases still write a 30-line dedicated class (topic 05 Example 2): it can offer a nicer API (`fd()`, `read()`), whereas the `unique_ptr` route gives move semantics, `reset` and `release` for free.
```cpp
#include <fcntl.h>
#include <unistd.h>
#include <cstddef>
#include <iostream>
#include <memory>

struct Fd {                                  // a "nullable pointer" around an int
    int value = -1;
    Fd() = default;
    Fd(int v) : value(v) {}
    Fd(std::nullptr_t) {}
    explicit operator bool() const { return value >= 0; }
    friend bool operator==(Fd, Fd) = default;
    friend bool operator==(Fd a, std::nullptr_t) { return a.value < 0; }
};

struct FdCloser {
    using pointer = Fd;                      // unique_ptr stores an Fd, not a T*
    void operator()(Fd f) const {
        std::cout << "close(" << f.value << ")\n";
        ::close(f.value);
    }
};

using UniqueFd = std::unique_ptr<void, FdCloser>;

int main() {
    UniqueFd a(::open("/dev/null", O_RDONLY));
    std::cout << "sizeof: " << sizeof(UniqueFd) << ", owns: " << bool(a) << '\n';
    UniqueFd b = std::move(a);               // moved-from a holds Fd{-1}
    std::cout << "a owns: " << bool(a) << ", b fd >= 0: " << (b.get().value >= 0) << '\n';
    UniqueFd bad(::open("/no/such", O_RDONLY));  // -1 is "null": no close(-1)
    std::cout << "bad owns: " << bool(bad) << '\n';
}
```
- Output (GCC 11, libstdc++; the descriptor number is typically 3):
```
sizeof: 4, owns: 1
a owns: 0, b fd >= 0: 1
bad owns: 0
close(3)
```
- `sizeof(UniqueFd)` is 4: the stored `Fd` plus an empty deleter (no state).
- ❌ Common wrong answer: "`unique_ptr` only works with pointers from `new`." Both the storage type and the release action are customizable.
- ✅ What a strong answer adds: `std::shared_ptr` has no `pointer` customization; for shared ownership of a handle you need a heap-allocated wrapper object or a dedicated class.

**Key takeaway:** A deleter with `using pointer = Handle;` turns `unique_ptr` into a zero-overhead owner for non-pointer handles.

---

#### Q18: Is `std::unique_ptr` thread-safe?
**Difficulty:** #intermediate
**Category:** #smart_pointers #concurrency
**Concepts:** #data_race #ownership_transfer #thread_safety

**Answer:**
It has the same thread-safety as a raw pointer: different `unique_ptr` objects can be used concurrently from different threads; one `unique_ptr` object accessed by several threads where at least one modifies it (move, reset, assignment) is a data race. The pointed-to object needs its own synchronization either way.

**Explanation:**
- There is no internal state shared between handles (unlike `shared_ptr`'s control block), so there is nothing to synchronize.
- Passing ownership to another thread is a natural fit: `std::thread t(worker, std::move(p));` moves the pointer into the thread's arguments; afterwards only the worker owns it.
- Handing results back typically goes through a queue of `unique_ptr<Msg>`: the queue's mutex provides the synchronization; ownership guarantees nobody else touches the message.
- ❌ Common wrong answer: "Smart pointers are thread-safe." Neither `unique_ptr` nor `shared_ptr` makes the pointee thread-safe; `shared_ptr` only makes its reference count safe (topic 08).
- ✅ What a strong answer adds: unique ownership is a concurrency tool: data that only one thread owns needs no lock.

**Key takeaway:** `unique_ptr` adds no synchronization; it makes single-owner hand-offs between threads explicit.

---
