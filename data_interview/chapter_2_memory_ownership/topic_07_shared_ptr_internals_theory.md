## TOPIC: std::shared_ptr Internals and make_shared

### THEORY_SECTION: Core Concepts

#### 1. Mental model
- A `std::shared_ptr<T>` is a small **handle**; the interesting state lives in a heap-allocated **control block** that all co-owners share.
- Keep three things apart:
  - **Handle**: the `shared_ptr` object itself (on the stack, in a member, in a container).
  - **Control block**: the ownership bookkeeping (counts, deleter, allocator).
  - **Managed object**: the `T` the user cares about.
- Copying a `shared_ptr` copies the handle and adds one owner. It never copies the `T`.
- Ownership answers exactly one question: "when may the object be destroyed?" It says nothing about who may modify the object or from which thread (see topic 08).
- A `shared_ptr` can also be empty (no control block) or can point at something different from what it owns (aliasing, section 8).

#### 2. What is inside the handle
- Typical implementation (libstdc++, libc++, MSVC): two raw pointers.
  - **Stored pointer**: what `get()`, `*` and `->` return.
  - **Control-block pointer**: what copying, `reset()` and the destructor touch.
- `sizeof(std::shared_ptr<T>)` is 16 bytes on typical 64-bit implementations, and so is `sizeof(std::weak_ptr<T>)`. The standard does not specify either size.
- The size does not depend on the deleter or allocator: those live in the control block. This is why `shared_ptr<int>`s with different deleters have the **same type** and can share one `std::vector` (section 6).
- Why two pointers and not one:
  - The stored pointer can differ from the owned object (aliasing constructor, `static_pointer_cast` to a base subobject at a non-zero offset).
  - Dereferencing does not need to touch the control block, so `*p` costs the same as with a raw pointer.

#### 3. What is inside the control block
| Field | Purpose |
|---|---|
| Strong count (`use_count`) | Number of `shared_ptr` owners; reaching 0 destroys the managed object |
| Weak count | Number of `weak_ptr`s (libstdc++ adds 1 while any strong owner exists); reaching 0 frees the control block |
| Deleter | How to destroy the object (default: `delete p` with the pointer type seen at construction) |
| Allocator | How to free the control block itself (`allocate_shared`) |
| Owned pointer or the object itself | Separate-allocation form stores a pointer; `make_shared` form embeds the `T` |
| vtable pointer | Virtual "dispose" (destroy object) and "destroy" (free block) functions |

- The counts are atomic. Typical memory orders: increment relaxed, decrement acq_rel (details in Chapter 4, topic 06, Q22).
- The deleter and allocator are erased behind the control block's virtual functions: the handle knows only "a control block", never its concrete type.
- libstdc++ x86-64 sizes measured with a counting `operator new`:
  - `std::shared_ptr<int>(new int)`: two allocations: 4 bytes (the `int`) and 24 bytes (vptr + two 4-byte counts + owned pointer).
  - `std::make_shared<int>()`: one allocation of 24 bytes (vptr + counts + the `int` itself, padded).
  - A stateless lambda deleter adds nothing (empty base optimization inside the block).

#### 4. Counting rules and their costs
| Operation | Strong count | Cost |
|---|---|---|
| `auto p = std::make_shared<T>()` | 1 | One allocation |
| `auto q = p;` (copy) | +1 | One atomic increment |
| `auto r = std::move(p);` | unchanged; `p` becomes empty | Two pointer copies, no atomic |
| `q = r;` (copy-assign) | +1 on `r`'s block, -1 on `q`'s old block | Up to two atomics |
| `p.reset()` or `p` destroyed | -1 | One atomic decrement; may run the destructor |
| `p.reset(new T)` | -1 on the old block | Plus a new control-block allocation |
| `T* raw = p.get();` | unchanged | Free; `raw` is not an owner |
| `T& ref = *p;` | unchanged | Free; `ref` is not an owner |

- `use_count()` of an empty `shared_ptr` is 0; a moved-from `shared_ptr` is empty and compares equal to `nullptr`.
- Returning a local or a `make_shared` result by value does **not** bump the count: C++17 guaranteed elision for prvalues, implicit move for named locals. Reasoning "copy, count 2, temporary dies, count 1" is the wrong model.
- Each atomic on a control block shared across cores is a cache-line transfer under contention (topic 08 measures it).

#### 5. Two lifetimes: object vs control block
- **Strong count reaches 0**: the deleter runs, so the managed object's destructor runs **now**, even if `weak_ptr`s still exist.
- **Weak count reaches 0** (after the strong count did): the control block is freed.
- With separate allocations: the object's memory goes back at strong 0; only the small block waits for the weak references.
- With `make_shared`: the object lives **inside** the control-block allocation:
  - Its **lifetime** still ends at strong 0 (destructor runs).
  - Its **storage** cannot be returned until the control block is freed, i.e. until the last `weak_ptr` is gone.
  - Measured (libstdc++): a 1000-byte object made with `make_shared`: `~Big` runs at `sp.reset()`, the single 1016-byte block is freed only at `w.reset()`.
- Interview phrasing: "a `weak_ptr` never keeps the object alive; with `make_shared` it keeps the object's **memory** allocated". `weak_ptr` semantics themselves are topic 09.

#### 6. Deleters and type erasure
- The deleter type is **not** part of `std::shared_ptr<T>`'s type: it is captured by the constructor and stored in the control block. This is classic type erasure.
- Consequences:
  - `std::vector<std::shared_ptr<FILE>>` can hold handles with different deleters (`fclose`, a pooling deleter, a no-op deleter).
  - Contrast `std::unique_ptr<T, D>`: the deleter is part of the type, so different deleter types cannot share a container (topic 06).
- The deleter remembers the **original pointer type**:
  - `std::shared_ptr<Base> p = std::make_shared<Derived>();` destroys a `Derived` correctly even if `~Base` is not virtual.
  - The same is true for `std::shared_ptr<Base> p(new Derived);`: the constructor is a template on `Derived*`.
  - It fails only when the constructor sees a `Base*`: `std::shared_ptr<Base> p(static_cast<Base*>(new Derived));` deletes through `Base*` (UB without a virtual destructor).
  - `std::shared_ptr<void>` destroys the real type the same way.
- Still give polymorphic bases a virtual destructor: other owners (`unique_ptr`, raw `delete`) do not have this safety net.
- Shared deleter behaviour that differs from `unique_ptr`:
  - `std::shared_ptr<T>(nullptr, d)` creates a control block with `use_count() == 1`, and `d(nullptr)` **is called** when the last owner goes away. `unique_ptr` never calls its deleter on null.
  - If constructing the control block throws, `shared_ptr(p, d)` calls `d(p)` before rethrowing, so the resource does not leak.
- `get_deleter<D>(sp)` returns a pointer to the stored deleter if its type is exactly `D`, otherwise `nullptr`.

#### 7. make_shared: why and when not
- What it does: one allocation holding the control block and the `T`, then constructs `T` in place with the forwarded arguments.
- Benefits:
  - One allocation instead of two (fewer allocator calls, less per-allocation overhead).
  - Object and counts are adjacent: often better locality.
  - Exception safety in expressions, the historical reason:
    - Pre-C++17, `f(std::shared_ptr<A>(new A), g())` could evaluate `new A`, then `g()` (which throws), and leak `A`.
    - C++17 sequences each function argument fully before the next starts, so this specific leak is gone, but `make_shared` remains the idiom (no naked `new`).
- When `make_shared` cannot or should not be used:
  - **Custom deleter** needed: `make_shared` has no deleter parameter. Use `std::shared_ptr<T>(p, d)`.
  - **Private or protected constructor**: `make_shared` calls the constructor from inside the library, which has no access. Compile error.
  - **Large object + long-lived `weak_ptr`s**: memory stays allocated until the last weak reference dies (section 5).
  - **Adopting an existing pointer** (from a C API, from `unique_ptr::release()`): ownership already exists.
  - **Braces**: `make_shared` uses parentheses. `std::make_shared<std::vector<int>>(2, 5)` gives `{5, 5}`, not `{2, 5}`. For an initializer list pass it explicitly: `make_shared<std::vector<int>>(std::initializer_list<int>{2, 5})`.
- Related factories:
  - `std::allocate_shared<T>(alloc, args...)`: same single allocation with a custom allocator (e.g. a pool).
  - `std::make_shared<T[]>(n)` and `std::make_shared<T[N]>()`: C++20 array support (libstdc++ from GCC 12; GCC 11 rejects it).
  - `std::make_shared_for_overwrite<T>()`: C++20 (libstdc++ from GCC 12), default-initializes (no zeroing of trivial types); for buffers filled immediately.

#### 8. Aliasing constructor and pointer casts
- `std::shared_ptr<U> q(owner, ptr);` (aliasing constructor):
  - Shares `owner`'s control block (strong count +1).
  - Stores `ptr` as its pointer, which can be anything, typically a member of the owned object.
  - When the count reaches 0, the control block deletes the **original** object; nobody ever calls `delete ptr`.
  - Typical use: hand out `shared_ptr<Member>` that keeps the whole parent alive, or expose an element of a shared array.
  - C++20 adds an rvalue overload: `std::shared_ptr<U> q(std::move(owner), ptr);` steals the ownership (no atomic increment).
  - Traps: aliasing an empty owner gives a non-null pointer with `use_count() == 0` that owns nothing; aliasing a pointer the owner does not keep alive creates a dangling `shared_ptr`.
- Pointer casts all use the aliasing constructor internally, so the result **shares ownership**:
  - `std::static_pointer_cast<D>(b)`, `std::dynamic_pointer_cast<D>(b)` (empty on failure), `std::const_pointer_cast<T>(c)`, `std::reinterpret_pointer_cast<T>(p)` (C++17).
  - Never write `std::shared_ptr<D>(static_cast<D*>(b.get()))`: that creates a second control block for the same object, so double delete.
- Equality (`==`) compares stored pointers; ownership-based ordering (`owner_before`, `owner_less`) compares control blocks (topic 09).

#### 9. Passing, returning and other design rules
| Signature | Meaning | Cost |
|---|---|---|
| `void f(T&)` / `void f(const T&)` / `void f(T*)` | Uses the object, ownership irrelevant | Free |
| `void f(std::shared_ptr<T> p)` | Sink: `f` keeps a co-owner (store it) | One increment if the caller copies, free if the caller moves |
| `void f(const std::shared_ptr<T>& p)` | Might copy it (conditionally retain) | Free unless `f` copies |
| `void f(std::shared_ptr<T>& p)` | Might reseat the caller's pointer | Free |
| `std::shared_ptr<T> make()` | Factory returning shared ownership | Elided; prefer returning `unique_ptr` if callers may not need sharing |

- A factory returning `std::unique_ptr<T>` is more flexible: callers can convert it to `shared_ptr` (`std::shared_ptr<T> s = std::move(u);`, which allocates a control block), but not the other way back.
- Do not make `shared_ptr` the default: shared ownership hides who controls lifetime and pays atomics. Use it when several parts of the program genuinely **own** the object and the last one to finish is not known in advance.
- Raw pointers and references from `get()` or `*p` are fine as **non-owning** access while some owner is guaranteed alive. They are wrong the moment they can outlive every owner.
- Destruction is recursive: destroying the head of a linked list of `shared_ptr<Node>` destroys `next`, which destroys its `next`, and so on. A long chain can overflow the stack (measured, 8 MB stack: 40,000 nodes crash at `-O0`, 80,000 survive at `-O2`, 1,000,000 crash at both). Fix: unlink iteratively in the owner's destructor.

#### 10. Misconceptions to unlearn
- ❌ "`shared_ptr` is always 16 bytes." ✅ Typical on 64-bit, not guaranteed.
- ❌ "`shared_ptr` is not type-erased; only `std::function` is." ✅ The deleter and allocator are type-erased inside the control block; that is why the deleter is not in the type.
- ❌ "Returning a `shared_ptr` by value temporarily makes the count 2." ✅ Elision or move: no extra owner.
- ❌ "The object is freed when both counts reach 0." ✅ The object is **destroyed** at strong 0; only the control block (and, with `make_shared`, the object's storage) waits for the weak count.
- ❌ "`shared_ptr<Base>` needs a virtual destructor to destroy `Derived` correctly." ✅ Not when it was created from a `Derived*` or `make_shared<Derived>`: the deleter remembers the type. Still declare one.
- ❌ "`make_shared` is preferred mainly for cache prefetching." ✅ Main point: one allocation instead of two. Locality is a bonus.
- ❌ "Moving a `shared_ptr` costs the same as copying." ✅ Moving touches no counter.
- ❌ "Two `shared_ptr`s built from the same raw pointer share a count." ✅ Each raw-pointer constructor creates a new control block: double delete.
- ❌ "Dereferencing a reset `shared_ptr` throws." ✅ Dereferencing an empty `shared_ptr` is UB.

### EDGE_CASES: Traps and Misconceptions

#### Edge Case 1: Two control blocks for one object
- `Widget* raw = new Widget; std::shared_ptr<Widget> a(raw); std::shared_ptr<Widget> b(raw);`
- Each constructor that takes a raw pointer creates a **new** control block. `a` and `b` both have `use_count() == 1`; both delete the object: double free (ASan: "attempting double-free").
- Same bug in disguise: `std::shared_ptr<D>(static_cast<D*>(base.get()))`, or `std::shared_ptr<T>(this)` inside a member function (topic 09 shows `enable_shared_from_this`).
- Rule: a raw pointer becomes owned **once**. After that, copy the `shared_ptr`, use the pointer casts, or use the aliasing constructor.

#### Edge Case 2: shared_ptr to something that was not allocated with new
- `std::shared_ptr<int> p(&local);` or `std::shared_ptr<int> p(&obj.member);` compiles.
- When the count reaches 0 the default deleter calls `delete` on a stack or interior address: UB. ASan reports "attempting free on address which was not malloc()-ed".
- If a non-owning `shared_ptr` is really needed (API demands one, object outlives it), use a no-op deleter: `std::shared_ptr<int>(&local, [](int*) {})`, or the aliasing constructor from a real owner.

#### Edge Case 3: Base pointer seen at construction
- Safe: `std::shared_ptr<Base> p = std::make_shared<Derived>();` and `std::shared_ptr<Base> p(new Derived);` both call `~Derived` even with a non-virtual `~Base`.
- Unsafe: `Base* b = new Derived; std::shared_ptr<Base> p(b);` The constructor sees only `Base*`, so the deleter is `delete (Base*)`: UB without a virtual destructor (ASan: new-delete-type-mismatch when sizes differ).
- The "it worked" version is not proof of design quality: `unique_ptr<Base>` and plain `delete` have no such protection.

#### Edge Case 4: Array with the default deleter
- `std::shared_ptr<int> p(new int[4]);` uses `delete`, not `delete[]`: UB (ASan: alloc-dealloc-mismatch).
- C++17: `std::shared_ptr<int[]> p(new int[4]);` uses `delete[]` and provides `p[i]`.
- C++20: `std::make_shared<int[]>(4)` (single allocation, value-initialized).
- Before C++17 the fix was `std::shared_ptr<int>(new int[4], std::default_delete<int[]>())`.

#### Edge Case 5: Reference to an object owned by a temporary
- `const Resource& getResource() { return *create(); }` where `create()` returns `std::shared_ptr<Resource>` by value.
- `*create()` yields a reference to the `Resource`, not to the `shared_ptr`. The temporary `shared_ptr` is destroyed at the end of the full expression (inside `getResource`), the count drops to 0, `~Resource` runs, and the caller receives a dangling reference.
- Binding the result to `const Resource&` in the caller does not help: lifetime extension applies only to temporaries bound directly, not to objects reached through a returned reference.
- Same family: `Resource* raw = sp.get();` followed by the last `reset()`; then `raw->f()` is a use-after-free. `get()` never extends lifetime.
- Fix: return the `shared_ptr` itself, or keep an owner alive for as long as the reference is used.

#### Edge Case 6: make_shared + weak_ptr keeps the memory
- The object's destructor runs at strong count 0, but the combined allocation is freed only when the last `weak_ptr` dies.
- Big object + cache of `weak_ptr`s that are never cleaned = memory that looks leaked (RSS stays high) although every destructor ran.
- Choose `std::shared_ptr<T>(new T)` for large objects that are commonly observed by long-lived `weak_ptr`s, or purge expired weak entries.

#### Edge Case 7: Deleter called with nullptr
- `std::shared_ptr<FILE> f(std::fopen("missing.txt", "r"), std::fclose);` If `fopen` fails, the control block still exists (`use_count() == 1`), and `fclose(nullptr)` is called at the end: UB in C.
- `unique_ptr` never calls its deleter for a null pointer; `shared_ptr` constructed with a deleter does.
- Fix: check before wrapping, or make the deleter null-safe: `[](FILE* p) { if (p) std::fclose(p); }`.

#### Edge Case 8: Destruction recursion on long chains
- `struct Node { std::shared_ptr<Node> next; };` with 1,000,000 nodes: destroying the head calls `~Node`, which destroys `next`, which calls `~Node`... one stack frame set per node.
- Measured with GCC 11 on an 8 MB stack: 20,000 nodes are fine, 40,000 already crash at `-O0`; `-O2` survives 80,000 but not 1,000,000. The limit depends on frame size and optimization, so never rely on it.
- Same for `unique_ptr` chains and trees. Fix: in the list's destructor, detach nodes in a loop so each one is destroyed with an empty `next`.

### CODE_EXAMPLES: Practical Demonstrations

#### Example 1: Tracing the counts through copy, move, reset
- Copy adds an owner, move transfers one, `reset()` releases one; the destructor runs at the last release.
```cpp
#include <iostream>
#include <memory>

struct Resource {
    Resource() { std::cout << "Acquire\n"; }
    ~Resource() { std::cout << "Release\n"; }
};

int main() {
    auto p1 = std::make_shared<Resource>();
    std::cout << "p1 created: " << p1.use_count() << '\n';

    std::shared_ptr<Resource> p2 = p1;                // copy: +1
    std::cout << "after copy: " << p1.use_count() << '\n';

    std::shared_ptr<Resource> p3 = std::move(p2);     // move: no change
    std::cout << "after move: " << p1.use_count()
              << ", p2 empty: " << (p2 == nullptr) << '\n';

    p1.reset();                                       // -1, object survives
    std::cout << "after p1.reset: " << p3.use_count() << '\n';

    p3.reset();                                       // last owner
    std::cout << "end of main\n";
}
```
- Output:
```
Acquire
p1 created: 1
after copy: 2
after move: 2, p2 empty: 1
after p1.reset: 1
Release
end of main
```
- `p2.use_count()` after the move would print 0: an empty `shared_ptr` has no control block.

#### Example 2: Counting allocations: make_shared vs new
- A replacement `operator new` prints every allocation size, showing one block vs two.
```cpp
#include <cstdio>
#include <cstdlib>
#include <memory>
#include <new>

static bool g_trace = false;

void* operator new(std::size_t n) {
    if (g_trace) std::printf("  alloc %zu\n", n);
    if (void* p = std::malloc(n)) return p;
    throw std::bad_alloc{};
}
void operator delete(void* p) noexcept { std::free(p); }
void operator delete(void* p, std::size_t n) noexcept {
    if (g_trace) std::printf("  free  %zu\n", n);
    std::free(p);
}

int main() {
    g_trace = true;
    std::puts("make_shared<int>:");
    { auto p = std::make_shared<int>(42); }
    std::puts("shared_ptr<int>(new int):");
    { std::shared_ptr<int> p(new int(42)); }
    std::puts("unique_ptr -> shared_ptr:");
    {
        auto u = std::make_unique<int>(42);
        std::shared_ptr<int> s = std::move(u);   // control block allocated here
    }
    g_trace = false;
}
```
- Output (typical x86-64, libstdc++):
```
make_shared<int>:
  alloc 24
  free  24
shared_ptr<int>(new int):
  alloc 4
  alloc 24
  free  4
  free  24
unique_ptr -> shared_ptr:
  alloc 4
  alloc 24
  free  4
  free  24
```
- With separate allocations the object (4 bytes) is freed first, at strong 0; the control block (24 bytes) is freed after, when the weak count also reaches 0.
- Exact sizes are implementation details; "one vs two allocations" is the portable fact.

#### Example 3: Type-erased deleters in one container
- Three handles with three different deleter types share one `std::vector`; the same is impossible with `unique_ptr<T, D>`.
```cpp
#include <cstdio>
#include <iostream>
#include <memory>
#include <vector>

struct Conn { int id; };

int main() {
    auto logging_delete = [](Conn* c) {
        std::cout << "logging delete " << c->id << '\n';
        delete c;
    };
    struct PoolReturn {
        void operator()(Conn* c) const {
            std::cout << "return " << c->id << " to pool\n";
            delete c;
        }
    };
    static Conn global_conn{3};

    std::vector<std::shared_ptr<Conn>> conns;
    conns.push_back(std::make_shared<Conn>(Conn{0}));            // default
    conns.emplace_back(new Conn{1}, logging_delete);             // lambda
    conns.emplace_back(new Conn{2}, PoolReturn{});               // functor
    conns.emplace_back(&global_conn, [](Conn*) {});              // no-op

    std::cout << "sizeof(shared_ptr<Conn>) = " << sizeof(conns[0]) << '\n';
    std::cout << "conns[2] has PoolReturn: "
              << (std::get_deleter<PoolReturn>(conns[2]) != nullptr) << '\n';
    conns.clear();                                               // destroys in order
    std::cout << "done\n";
}
```
- Output (typical 64-bit):
```
sizeof(shared_ptr<Conn>) = 16
conns[2] has PoolReturn: 1
logging delete 1
return 2 to pool
done
```
- The no-op deleter is the correct way to hand a non-heap object to an API that insists on a `shared_ptr`.

#### Example 4: The deleter remembers the original type
- `~Base` is deliberately non-virtual. Two constructions are safe, the third is not.
```cpp
#include <iostream>
#include <memory>

struct Base {
    ~Base() { std::cout << "~Base\n"; }      // NOT virtual
};
struct Derived : Base {
    ~Derived() { std::cout << "~Derived\n"; }
};

int main() {
    std::cout << "make_shared<Derived>:\n";
    { std::shared_ptr<Base> p = std::make_shared<Derived>(); }
    std::cout << "shared_ptr<Base>(new Derived):\n";
    { std::shared_ptr<Base> p(new Derived); }
    std::cout << "shared_ptr<void>(new Derived):\n";
    { std::shared_ptr<void> p(new Derived); }
    std::cout << "shared_ptr<Base>(Base* to Derived):\n";
    {
        Base* b = new Derived;
        std::shared_ptr<Base> p(b);          // deleter sees Base*: UB
    }
}
```
- Output (the last block is UB; this is what GCC printed):
```
make_shared<Derived>:
~Derived
~Base
shared_ptr<Base>(new Derived):
~Derived
~Base
shared_ptr<void>(new Derived):
~Derived
~Base
shared_ptr<Base>(Base* to Derived):
~Base
```
- Here `Derived` adds no data, so ASan stays quiet; with a data member it reports new-delete-type-mismatch (see practice).

#### Example 5: Aliasing constructor: hand out a member, keep the parent alive
- `price` points to one field but co-owns the whole `Order`.
```cpp
#include <iostream>
#include <memory>
#include <string>

struct Order {
    int id;
    std::string symbol;
    double price;
    ~Order() { std::cout << "~Order " << id << '\n'; }
};

std::shared_ptr<const double> price_view(std::shared_ptr<Order> o) {
    return std::shared_ptr<const double>(o, &o->price);   // aliasing
}

int main() {
    auto order = std::make_shared<Order>(7, "ABC", 101.5);   // C++20 aggregate ()
    auto price = price_view(order);
    std::cout << "use_count: " << order.use_count() << '\n';

    order.reset();                                          // Order still alive
    std::cout << "after reset, price = " << *price
              << ", use_count = " << price.use_count() << '\n';

    price.reset();                                          // destroys the Order
    std::cout << "end\n";
}
```
- Output:
```
use_count: 2
after reset, price = 101.5, use_count = 1
~Order 7
end
```
- `make_shared<Order>(7, "ABC", 101.5)` relies on C++20 parenthesized aggregate initialization (P0960: GCC 10+, Clang 16+; Clang 14 rejects it); before C++20 an aggregate needed a constructor or `make_shared<Order>(Order{...})` (which creates and destroys an extra temporary).
- `price.reset()` destroys the `Order`, not a `double`: the control block knows the real owned object.

#### Example 6: Pointer casts share ownership
- `dynamic_pointer_cast` returns a co-owner (or empty); a cast through `get()` would create a second control block.
```cpp
#include <iostream>
#include <memory>

struct Shape { virtual ~Shape() = default; };
struct Circle : Shape { double r = 2.0; };
struct Square : Shape {};

int main() {
    std::shared_ptr<Shape> s = std::make_shared<Circle>();

    auto c = std::dynamic_pointer_cast<Circle>(s);
    auto q = std::dynamic_pointer_cast<Square>(s);
    std::cout << "circle r = " << c->r << '\n';
    std::cout << "square empty: " << (q == nullptr) << '\n';
    std::cout << "use_count: " << s.use_count() << '\n';     // s and c

    std::shared_ptr<const Shape> cs = s;
    auto back = std::const_pointer_cast<Shape>(cs);
    std::cout << "use_count: " << s.use_count() << '\n';     // s, c, cs, back
}
```
- Output:
```
circle r = 2
square empty: 1
use_count: 2
use_count: 4
```

#### Example 7: make_shared + weak_ptr: destructor now, memory later
- Allocation tracing shows that the 1000-byte object's storage outlives its destructor while a `weak_ptr` exists.
```cpp
#include <cstdio>
#include <cstdlib>
#include <memory>
#include <new>

void* operator new(std::size_t n) {
    std::printf("  alloc %zu\n", n);
    if (void* p = std::malloc(n)) return p;
    throw std::bad_alloc{};
}
void operator delete(void* p) noexcept { std::free(p); }
void operator delete(void* p, std::size_t n) noexcept {
    std::printf("  free  %zu\n", n);
    std::free(p);
}

struct Big {
    char buf[1000];
    ~Big() { std::puts("  ~Big"); }
};

int main() {
    std::puts("make_shared:");
    auto sp = std::make_shared<Big>();
    std::weak_ptr<Big> w = sp;
    std::puts("sp.reset():");
    sp.reset();
    std::puts("w.reset():");
    w.reset();

    std::puts("shared_ptr(new Big):");
    std::shared_ptr<Big> sp2(new Big);
    std::weak_ptr<Big> w2 = sp2;
    std::puts("sp2.reset():");
    sp2.reset();
    std::puts("w2.reset():");
    w2.reset();
}
```
- Output (typical x86-64, libstdc++):
```
make_shared:
  alloc 1016
sp.reset():
  ~Big
w.reset():
  free  1016
shared_ptr(new Big):
  alloc 1000
  alloc 24
sp2.reset():
  ~Big
  free  1000
w2.reset():
  free  24
```

#### Example 8: Destroying a long chain without blowing the stack
- The default destructor recurses once per node; an iterative destructor unlinks first.
```cpp
#include <iostream>
#include <memory>

struct Node {
    int value = 0;
    std::shared_ptr<Node> next;
};

class List {
    std::shared_ptr<Node> head_;
public:
    void push_front(int v) {
        auto n = std::make_shared<Node>();
        n->value = v;
        n->next = std::move(head_);
        head_ = std::move(n);
    }
    ~List() {
        auto cur = std::move(head_);
        while (cur) {
            // Detach the successor before cur's node dies, unless someone else shares it
            auto next = std::move(cur->next);
            cur = std::move(next);          // old node destroyed with an empty next
        }
    }
};

int main() {
    {
        List big;
        for (int i = 0; i < 1'000'000; ++i) big.push_front(i);
    }   // iterative: fine
    std::cout << "1,000,000 nodes destroyed iteratively\n";
}
```
- Output: `1,000,000 nodes destroyed iteratively`.
- Remove the `~List()` body and the program crashes with a stack overflow (segfault) on a default 8 MB stack.

### QUICK_REFERENCE: Cheat Sheet

#### Layout (typical 64-bit, not guaranteed)
| Thing | Contents | Size |
|---|---|---|
| `shared_ptr<T>`, `weak_ptr<T>` | stored pointer + control-block pointer | 16 bytes |
| Control block, separate form | vptr, strong, weak, owned pointer (+ deleter, allocator) | 24 bytes (libstdc++, default deleter) |
| Control block, `make_shared` form | vptr, strong, weak, the `T` itself | 16 + `sizeof(T)` rounded |

#### Construction choices
| Want | Write |
|---|---|
| New object, shared | `auto p = std::make_shared<T>(args...);` |
| New object, custom allocator | `std::allocate_shared<T>(alloc, args...)` |
| Custom deleter | `std::shared_ptr<T> p(raw, deleter);` |
| Array (C++17 / C++20) | `std::shared_ptr<T[]>(new T[n])` / `std::make_shared<T[]>(n)` |
| From `unique_ptr` | `std::shared_ptr<T> s = std::move(u);` |
| Pointer to a member, keep parent alive | `std::shared_ptr<M>(owner, &owner->m)` |
| Down/cross cast | `std::static_pointer_cast`, `std::dynamic_pointer_cast` |
| Non-owning handle for an API | `std::shared_ptr<T>(&obj, [](T*) {})` |

#### Bugs that compile
| Code | Result |
|---|---|
| `shared_ptr<T> a(raw), b(raw);` | Two control blocks, double delete |
| `shared_ptr<T>(&local)` | Deletes a stack address |
| `shared_ptr<D>(static_cast<D*>(b.get()))` | Second control block |
| `shared_ptr<int>(new int[n])` | `delete` instead of `delete[]` |
| `shared_ptr<Base>(base_ptr_to_derived)` | Wrong destructor without virtual dtor |
| `return *make();` as `T&` | Dangling reference |
| `shared_ptr<FILE>(fopen(...), fclose)` | `fclose(nullptr)` if open fails |
| Long `shared_ptr` chain | Recursive destruction, stack overflow |

#### Interview one-liners
| Question | Answer |
|---|---|
| What is in a `shared_ptr`? | Stored pointer + control-block pointer (16 bytes typical) |
| What is in the control block? | Strong and weak counts, deleter, allocator, the object (make_shared) |
| Copy vs move cost? | Copy: atomic increment; move: no atomic |
| When is the object destroyed? | Strong count 0 |
| When is the control block freed? | Weak count 0 too |
| Main `make_shared` benefit? | One allocation instead of two |
| `make_shared` downsides? | No deleter, needs public ctor, parentheses init, weak_ptr retains memory |
| Is the deleter part of the type? | No (type-erased); for `unique_ptr` it is |
| `shared_ptr<Base>` from `make_shared<Derived>`, no virtual dtor? | Correct `~Derived` runs |
| Aliasing constructor? | Shares ownership, stores a different pointer |
| Does `get()` extend lifetime? | No |
| How to pass to a function that only uses the object? | `T&` or `T*`, not `shared_ptr` |
