## TOPIC: std::shared_ptr Internals and make_shared

### INTERVIEW_QA: Interview Questions with Detailed Answers

#### Q1: What does a `std::shared_ptr` object contain, and how big is it?
**Difficulty:** #beginner
**Category:** #smart_pointers #memory
**Concepts:** #shared_ptr #control_block #object_layout

**Answer:**
Typically two raw pointers: the stored pointer (what `get()` returns) and a pointer to the control block that holds the counts, deleter and allocator. That makes it 16 bytes on common 64-bit implementations, but the standard does not specify the size.

**Explanation:**
- The size does not depend on the deleter or allocator, because those live in the control block, not in the handle.
- Two pointers instead of one: the stored pointer can differ from the owned object (aliasing constructor, cast to a base subobject), and `*p` does not need to touch the control block.
- `weak_ptr` has the same two-pointer layout.
- ❌ Common wrong answer: "`shared_ptr` is always exactly 16 bytes." Say "typically 16 on 64-bit".
- ❌ Common wrong answer: "Copying a `shared_ptr` copies the object." It copies the two pointers and increments the strong count.
- ✅ What a strong answer adds: an empty `shared_ptr` has a null control-block pointer, so `use_count()` is 0.

**Key takeaway:** A `shared_ptr` is a two-pointer handle; all shared state is in the control block.

---

#### Q2: What is the control block, where does it live, and what is in it?
**Difficulty:** #beginner
**Category:** #smart_pointers #memory
**Concepts:** #control_block #reference_counting #type_erasure

**Answer:**
A heap-allocated bookkeeping object shared by all `shared_ptr`s and `weak_ptr`s of one ownership group. It holds the atomic strong count, the atomic weak count, the deleter, the allocator, and either a pointer to the object or (with `make_shared`) the object itself.

**Explanation:**
- It is created by the first owner: `make_shared`, `allocate_shared`, a constructor taking a raw pointer, or conversion from `unique_ptr`.
- Implementations use a base class with virtual "dispose" (destroy the object) and "destroy" (free the block) functions, so the handle never needs the concrete deleter type.
- Measured sizes, libstdc++ x86-64: separate block for `shared_ptr<int>(new int)` is 24 bytes; `make_shared<int>` is one 24-byte allocation containing the `int`.
- libstdc++ keeps the weak count at "number of weak_ptrs + 1 while any strong owner exists", so the block is freed exactly once. Do not quote this as a standard rule.
- ❌ Common wrong answer: "The control block is stored inside the `shared_ptr`." Then copies could not share it.
- ✅ What a strong answer adds: the control block outlives the object when `weak_ptr`s exist (Q5).

**Key takeaway:** One control block per ownership group; counts plus a type-erased deleter.

---

#### Q3: What is the strong count after each line of this code, and when does the destructor run?
**Difficulty:** #beginner
**Category:** #smart_pointers
**Concepts:** #use_count #reset #ownership

```cpp
auto p1 = std::make_shared<Resource>();   // prints "Acquire"
std::shared_ptr<Resource> p2 = p1;
p1.reset();
p2.reset();
```

**Answer:**
After `make_shared`: count 1. After the copy: 2 (both handles point to the same object and block). `p1.reset()`: 1, `p1` is empty, nothing destroyed. `p2.reset()`: 0, the deleter runs, "Release" prints; with no `weak_ptr`s the control block is freed too.

**Explanation:**
- `reset()` empties the handle (`p1 == nullptr`, `use_count() == 0`); the handle itself remains a valid, reusable object.
- The count change is an atomic decrement; the thread that brings it to 0 runs the destructor.
- Calling `p1->f()` after `p1.reset()` is UB (null dereference); it does not throw.
- ❌ Common wrong answer: "`p1.reset()` destroys the object because `p1` created it." Ownership is shared; the creator has no special status.
- ✅ What a strong answer adds: a moved-from `shared_ptr` is also empty, and the move did not change the count.

**Key takeaway:** The object dies at the last release, from whichever owner that is.

---

#### Q4: What does copying a `shared_ptr` cost compared to moving it?
**Difficulty:** #intermediate
**Category:** #smart_pointers #performance
**Concepts:** #atomic_rmw #move_semantics #cache_coherence

**Answer:**
A copy copies two pointers and performs one atomic increment on the control block (and the copy's destruction later performs an atomic decrement). A move copies two pointers and nulls the source: no atomic at all.

**Explanation:**
- An atomic RMW is cheap when the line is in the local cache (a few ns) and expensive when other cores touch the same control block (cache-line transfer, topic 08 measures it).
- Practical rules:
  - Pass `const T&` or `T*` when the callee only uses the object.
  - Move into sinks: `store(std::move(sp))`.
  - Return by value: elision or implicit move, no count change.
- `shared_ptr` move operations are `noexcept`, so `std::vector<std::shared_ptr<T>>` growth moves elements instead of copying.
- ❌ Common wrong answer: "Atomic increments are free on x86." They are full-barrier locked instructions and the cost explodes under sharing.
- ✅ What a strong answer adds: a copy-assignment `a = b` may do two atomics (increment `b`'s block, decrement `a`'s old one), and the decrement may run a destructor inline.

**Key takeaway:** Copy = atomic increment now plus atomic decrement later; move = free.

---

#### Q5: When the strong count reaches zero but a `weak_ptr` still exists, what is destroyed and what is not?
**Difficulty:** #intermediate
**Category:** #smart_pointers #lifetime
**Concepts:** #weak_count #control_block #make_shared

**Answer:**
The managed object is destroyed immediately (its destructor runs). The control block stays alive so the `weak_ptr` can report `expired()`. With `make_shared` the object's storage is part of that block, so the memory is only freed when the last `weak_ptr` goes away.

**Explanation:**
- Two lifetimes: object lifetime ends at strong 0; control-block lifetime ends at weak 0.
- Measured (libstdc++), 1000-byte object from `make_shared`: `~Big` at `sp.reset()`, the single 1016-byte allocation freed only at `w.reset()`. With `shared_ptr(new Big)` the 1000 bytes are freed at `sp.reset()` and only the 24-byte block waits.
- ❌ Common wrong answer: "The object is released only when both strong and weak counts reach 0." That confuses object lifetime with allocation lifetime.
- ✅ What a strong answer adds: this is the main reason to avoid `make_shared` for large objects observed by long-lived `weak_ptr`s (caches, observer lists). `weak_ptr` usage itself is topic 09.

**Key takeaway:** `weak_ptr` keeps the control block, never the object; with `make_shared` it also keeps the object's memory.

---

#### Q6: Why is `std::make_shared<T>()` generally preferred over `std::shared_ptr<T>(new T)`?
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

**Key takeaway:** One allocation, no naked `new`; that is the reason, not cache magic.

---

#### Q7: When can you not, or should you not, use `make_shared`?
**Difficulty:** #intermediate
**Category:** #smart_pointers #design
**Concepts:** #make_shared #custom_deleter #weak_ptr #access_control

**Answer:**
When you need a custom deleter, when the constructor is private or protected, when the object is large and long-lived `weak_ptr`s would pin its memory, when you are adopting an existing pointer (C API, `unique_ptr`), and when you need brace (initializer-list) construction.

**Explanation:**
- No deleter parameter: `std::shared_ptr<FILE>(fp, closer)` is the only way.
- Private constructor: `make_shared` constructs inside the library, which has no access (compile error "is private within this context"). Workarounds: a passkey type, or `std::shared_ptr<T>(new T(...))` from a static member factory.
- Parentheses vs braces: `std::make_shared<std::vector<int>>(2, 5)` gives `{5, 5}`; to get `{2, 5}` pass `std::initializer_list<int>{2, 5}`.
- Custom allocation strategy: use `std::allocate_shared` (still one allocation).
- ✅ What a strong answer adds: C++20 `make_shared<T[]>(n)` handles arrays and `make_shared_for_overwrite` skips value-initialization for buffers you fill immediately.

**Key takeaway:** `make_shared` is the default, not a rule; know the five exits.

---

#### Q8: Is `std::shared_ptr` type-erased? Why can `shared_ptr`s with different deleters live in one vector?
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

**Key takeaway:** The deleter is erased into the control block; that is why it is not part of the type.

---

#### Q9: `struct Base { ~Base(); };` (non-virtual). Is `std::shared_ptr<Base> p = std::make_shared<Derived>();` destroyed correctly?
**Difficulty:** #intermediate
**Category:** #smart_pointers #inheritance
**Concepts:** #virtual_destructor #deleter #type_erasure

**Answer:**
Yes. The control block was created for a `Derived`, and its deleter destroys a `Derived`, so `~Derived` and then `~Base` run. The same holds for `std::shared_ptr<Base>(new Derived)` because the constructor template sees `Derived*`. It breaks only if the constructor receives a `Base*`.

**Explanation:**
```cpp
#include <iostream>
#include <memory>

struct Base { ~Base() { std::cout << "~Base\n"; } };
struct Derived : Base {
    int extra[4]{};
    ~Derived() { std::cout << "~Derived\n"; }
};

int main() {
    { std::shared_ptr<Base> p = std::make_shared<Derived>(); }   // ~Derived ~Base
    { std::shared_ptr<Base> p(new Derived); }                    // ~Derived ~Base
    Base* b = new Derived;
    { std::shared_ptr<Base> p(b); }        // ~Base only: UB (ASan: type mismatch)
}
```
- ASan on the last block: "new-delete-type-mismatch ... size of the allocated type: 16 bytes; size of the deallocated type: 1 bytes".
- ❌ Common wrong answer: "Without a virtual destructor the derived part always leaks with `shared_ptr<Base>`." Not when the deleter was formed from `Derived*`.
- ✅ What a strong answer adds: still declare `virtual ~Base()` (or a protected non-virtual one) because `unique_ptr<Base>` and `delete base` have no such rescue.

**Key takeaway:** `shared_ptr` remembers the type it was constructed from; `unique_ptr` and `delete` do not.

---

#### Q10: What happens if two `shared_ptr`s are constructed from the same raw pointer?
**Difficulty:** #beginner
**Category:** #smart_pointers #bugs
**Concepts:** #control_block #double_free #ownership

**Answer:**
Each raw-pointer constructor creates its own control block, so there are two independent counts of 1. Each group deletes the object when its count reaches 0: double free (UB; ASan "attempting double-free").

**Explanation:**
- Sharing happens only by copying a `shared_ptr` (or a `weak_ptr::lock()`), never by passing the same raw pointer again.
- Disguised versions:
  - `std::shared_ptr<Derived>(static_cast<Derived*>(base.get()))` instead of `std::static_pointer_cast`.
  - `std::shared_ptr<T>(this)` inside a member function (use `enable_shared_from_this`, topic 09).
  - Wrapping `unique_ptr::get()` instead of moving the `unique_ptr`.
- ❌ Common wrong answer: "The second `shared_ptr` finds the existing control block." There is no global registry from object address to control block.
- ✅ What a strong answer adds: the rule "a raw pointer becomes owned exactly once, immediately after `new`", which `make_shared` enforces.

**Key takeaway:** One raw pointer, one control block; everything else must copy the `shared_ptr`.

---

#### Q11: Is `std::shared_ptr<int> p(&x);` valid if `x` is a local variable or a member of a stack object?
**Difficulty:** #intermediate
**Category:** #smart_pointers #bugs
**Concepts:** #default_deleter #stack_memory #no_op_deleter

**Answer:**
It compiles, but when the count reaches zero the default deleter calls `delete` on an address that was not returned by `new`: undefined behaviour. ASan reports "attempting free on address which was not malloc()-ed".

**Explanation:**
- `shared_ptr` cannot tell where an address came from; it trusts the constructor's caller.
- Legitimate non-owning `shared_ptr`:
  - No-op deleter: `std::shared_ptr<int>(&x, [](int*) {})`, only if `x` outlives every copy.
  - Aliasing constructor from a real owner: `std::shared_ptr<int>(owner, &owner->y)` keeps the parent alive (Q14).
- ❌ Common wrong answer: "It is fine while `x` is alive." The deleter still runs `delete` at the end, regardless of `x`'s state.
- ✅ What a strong answer adds: if an API demands `shared_ptr` but you do not share ownership, the API is probably wrong; take `T&` instead.

**Key takeaway:** A default-deleted `shared_ptr` may only adopt pointers from `new`.

---

#### Q12: Is `const Resource& getResource() { return *create(); }` safe when `create()` returns `std::shared_ptr<Resource>`?
**Difficulty:** #intermediate
**Category:** #smart_pointers #lifetime
**Concepts:** #dangling_reference #temporary #full_expression

**Answer:**
`create()` returns a temporary `shared_ptr` that owns a new `Resource` (count 1, no copy). `*create()` produces a reference to the `Resource`, not to the `shared_ptr`. At the end of the return statement's full expression the temporary `shared_ptr` dies, the count reaches 0, `~Resource` runs, and the caller gets a dangling reference. Any use is UB.

**Explanation:**
```cpp
#include <iostream>
#include <memory>

struct Resource {
    int v = 42;
    ~Resource() { std::cout << "~Resource\n"; }
};

std::shared_ptr<Resource> create() { return std::make_shared<Resource>(); }
const Resource& getResource() { return *create(); }

int main() {
    const Resource& r = getResource();      // "~Resource" already printed
    std::cout << "got reference\n";
    // r.v here would be a heap-use-after-free (UB)
    (void)r;
}
```
- Output: `~Resource` then `got reference`.
- No count of 2 at return: the `make_shared` prvalue initializes the return object directly (C++17 guaranteed elision).
- Binding the result to `const Resource&` in `main` does not extend anything: lifetime extension applies only to a temporary bound directly to the reference.
- ❌ Common wrong answer: "The reference keeps the `shared_ptr` alive." A reference to `T` has no relationship with the owner of `T`.
- ✅ What a strong answer adds: the fix is to return `std::shared_ptr<Resource>` (caller co-owns) or to return a reference only to something owned by a longer-lived owner.

**Key takeaway:** References and `get()` pointers never extend `shared_ptr` ownership.

---

#### Q13: `Resource* raw = p1.get();` then another thread calls `p1.reset(); p2.reset();`. Why can't reference counting protect `raw`?
**Difficulty:** #beginner
**Category:** #smart_pointers #lifetime
**Concepts:** #non_owning_pointer #use_after_free #get

**Answer:**
Because `raw` is not an owner: `get()` does not touch the count. When the last owner releases, the strong count reaches 0 and the object is destroyed while `raw` still holds the old address, so `raw->doSomething()` is a use-after-free (UB, not an exception).

**Explanation:**
- Reference counting can only count what it knows: `shared_ptr` copies (and the `weak_ptr` count for the block).
- The control block may survive (if `weak_ptr`s exist); the object does not.
- Raw pointers from `get()` are fine as **borrowed** access while some owner is provably alive (for the duration of a call, within the owner's scope).
- If the borrower can outlive the owners (async callback, another thread, a cache), it needs its own `shared_ptr` copy or a `weak_ptr` (topic 09).
- ❌ Common wrong answer: "The control block is destroyed too, so `raw` becomes null." Nothing ever writes to `raw`.
- ✅ What a strong answer adds: distinguish ownership (who frees) from access (who reads): raw pointers are access, not ownership.

**Key takeaway:** `get()` is a loan, not a share.

---

#### Q14: What is the aliasing constructor and when would you use it?
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

**Key takeaway:** Aliasing: stored pointer and owned object differ, control block is shared.

---

#### Q15: How do you cast a `shared_ptr<Base>` to `shared_ptr<Derived>`, and why not `shared_ptr<Derived>(static_cast<Derived*>(b.get()))`?
**Difficulty:** #intermediate
**Category:** #smart_pointers #casts
**Concepts:** #static_pointer_cast #dynamic_pointer_cast #control_block

**Answer:**
Use `std::static_pointer_cast<Derived>(b)` or `std::dynamic_pointer_cast<Derived>(b)`. They return a `shared_ptr` that shares `b`'s control block. Constructing a new `shared_ptr` from the raw result creates a second control block and causes a double delete.

**Explanation:**
- The full family: `static_pointer_cast`, `dynamic_pointer_cast` (empty result on failure, no exception), `const_pointer_cast`, `reinterpret_pointer_cast` (C++17).
- All are built on the aliasing constructor: same block, converted stored pointer, count +1.
- C++20 adds rvalue overloads that steal from the source (no increment).
- ❌ Common wrong answer: "`dynamic_pointer_cast` throws `std::bad_cast` on failure." Only `dynamic_cast` to a reference throws; the pointer cast returns empty.
- ✅ What a strong answer adds: after a successful cast both handles count as owners (`use_count()` goes up by one).

**Key takeaway:** Cast the `shared_ptr`, never the raw pointer inside it.

---

#### Q16: How do you manage an array with `shared_ptr`?
**Difficulty:** #intermediate
**Category:** #smart_pointers #arrays
**Concepts:** #shared_ptr_array #default_delete #make_shared_array

**Answer:**
C++17: `std::shared_ptr<T[]> p(new T[n]);` (uses `delete[]`, offers `p[i]`). C++20: `std::make_shared<T[]>(n)` for a single allocation. `std::shared_ptr<T>(new T[n])` is UB because the default deleter calls `delete`, not `delete[]`.

**Explanation:**
- Pre-C++17 workaround: `std::shared_ptr<T>(new T[n], std::default_delete<T[]>())` (no `operator[]`).
- ASan catches the mismatch as "alloc-dealloc-mismatch (operator new [] vs operator delete)".
- In most code `std::vector<T>` (or `std::shared_ptr<std::vector<T>>`) is the better answer; arrays matter for fixed buffers and C interop.
- ❌ Common wrong answer: "`shared_ptr` detects arrays automatically." Only the `T[]` specialization does.
- ✅ What a strong answer adds: `make_shared_for_overwrite<T[]>(n)` (C++20) avoids zero-initializing large trivial buffers.

**Key takeaway:** Use `shared_ptr<T[]>` or `make_shared<T[]>`; never `shared_ptr<T>(new T[n])`.

---

#### Q17: How should a function take a `shared_ptr` parameter?
**Difficulty:** #intermediate
**Category:** #smart_pointers #api_design
**Concepts:** #parameter_passing #ownership #sink

**Answer:**
Match the parameter to what the function does with ownership. Only uses the object: `T&`, `const T&` or `T*`. Stores a co-owner: `std::shared_ptr<T>` by value and move it into place. Might store it: `const std::shared_ptr<T>&`. Might reseat the caller's pointer: `std::shared_ptr<T>&`.

**Explanation:**
- Taking `shared_ptr` by value when you only read the object costs an atomic increment and decrement per call, and ties the function to one ownership model.
- By-value sink: the caller chooses copy (it keeps ownership) or `std::move` (it hands it over, no atomics):
```cpp
class Book {
    std::shared_ptr<const Order> last_;
public:
    void set_last(std::shared_ptr<const Order> o) { last_ = std::move(o); }
};
```
- Returning: by value; prefer a factory returning `std::unique_ptr` if not every caller needs sharing, because it converts to `shared_ptr` but not back.
- ❌ Common wrong answer: "Always pass `const shared_ptr&` for performance." Fine for avoiding atomics, but if the function never stores it, `const T&` is clearer and accepts objects owned any way.
- ✅ What a strong answer adds: when borrowing from a `shared_ptr` that another thread may reset, the caller must hold a local copy for the duration of the call (topic 08).

**Key takeaway:** Ownership in the signature only when the function participates in ownership.

---

#### Q18: Why might a destructor of a `shared_ptr`-linked list crash, and how do you fix it?
**Difficulty:** #advanced
**Category:** #smart_pointers #recursion
**Concepts:** #destructor_recursion #stack_overflow #linked_list

**Answer:**
Destroying a node destroys its `next` member, which destroys the next node, recursively: the stack depth equals the list length. A long list overflows the stack. Fix by unlinking nodes in a loop so each node dies with an empty `next`.

**Explanation:**
- Measured, GCC 11, 8 MB stack: 40,000 nodes already crash at `-O0`; `-O2` survives 80,000 but not 1,000,000.
- Iterative destructor:
```cpp
~List() {
    auto cur = std::move(head_);
    while (cur) {
        auto next = std::move(cur->next);
        cur = std::move(next);   // previous node destroyed with empty next
    }
}
```
- If another `shared_ptr` still shares a middle node, the loop just drops our reference to it; that node and its tail survive as they should.
- Same issue for `unique_ptr` lists and deep trees; same fix.
- ❌ Common wrong answer: "Smart pointers make destruction automatic, so nothing to write." Automatic is recursive.
- ✅ What a strong answer adds: the same recursion appears when the last owner of a large graph is dropped on a latency-critical thread (the whole cascade runs there).

**Key takeaway:** Recursive ownership means recursive destruction; unlink long chains iteratively.

---

#### Q19: What overhead does `shared_ptr` have compared to `unique_ptr`?
**Difficulty:** #intermediate
**Category:** #smart_pointers #performance
**Concepts:** #atomic_rmw #control_block #indirection

**Answer:**
Space: two pointers instead of one, plus a control block (a separate allocation unless `make_shared`). Time: atomic increments and decrements on every copy and destruction, which become cache-line transfers when shared across cores, and a virtual call through the control block at destruction. `unique_ptr` with a stateless deleter is the size of a raw pointer and does no atomics.

**Explanation:**
- Dereferencing costs the same for both: the stored pointer is in the handle.
- Atomic RMW: a few ns uncontended; tens to hundreds of ns when cores fight over one control block.
- The counts are atomic but not necessarily `seq_cst`: increments can be relaxed; the decrement needs acq_rel so the destroying thread sees all prior writes (Chapter 4, topic 06, Q22).
- ❌ Common wrong answer: "`shared_ptr` refcounting follows a total order across all atomics." Each counter has its own modification order; that does not imply a global order or `seq_cst`.
- ✅ What a strong answer adds: choose `unique_ptr` by default; switch to `shared_ptr` only for genuinely shared, non-deterministic lifetime.

**Key takeaway:** `shared_ptr` costs an extra allocation and atomic traffic; pay it only for real shared ownership.

---

#### Q20: What happens when a `shared_ptr` with a custom deleter holds `nullptr`?
**Difficulty:** #advanced
**Category:** #smart_pointers #custom_deleter
**Concepts:** #deleter #nullptr #fclose

**Answer:**
Unlike `unique_ptr`, a `shared_ptr` constructed from `(nullptr, d)` or `(p, d)` with `p == nullptr` still creates a control block with `use_count() == 1`, and calls `d(nullptr)` when the last owner goes away. A deleter that is not null-safe (`fclose`) then has UB.

**Explanation:**
```cpp
#include <iostream>
#include <memory>

int main() {
    {
        std::shared_ptr<int> p(nullptr, [](int* q) {
            std::cout << "deleter called with " << q << '\n';
        });
        std::cout << "use_count " << p.use_count() << '\n';
    }
    {
        std::unique_ptr<int, void (*)(int*)> u(nullptr, [](int*) {
            std::cout << "never printed\n";
        });
    }
}
```
- Output: `use_count 1` then `deleter called with 0`.
- Real case: `std::shared_ptr<FILE> f(std::fopen(path, "r"), std::fclose);` with a missing file calls `fclose(nullptr)`.
- Fix: check before wrapping, or `[](FILE* p) { if (p) std::fclose(p); }`.
- ❌ Common wrong answer: "Smart pointers never call the deleter on null." True for `unique_ptr`, false for `shared_ptr` with a deleter.
- ✅ What a strong answer adds: if building the control block throws (`bad_alloc`), the constructor calls `d(p)` before rethrowing, so a resource is never leaked.

**Key takeaway:** `shared_ptr` deleters must be null-safe.
