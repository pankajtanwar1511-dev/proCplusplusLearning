## TOPIC: std::unique_ptr

### THEORY_SECTION: Core Concepts

#### 1. Mental model
- `std::unique_ptr<T, D = std::default_delete<T>>` (C++11) is **exclusive ownership** of one object (or one array) plus a **cleanup policy**:

```text
unique_ptr<T, D> object (stack, member, container element...)
+---------------------+
| T*  ptr  -----------|------> T object (usually on the heap)
| D   deleter         |        cleanup: deleter(ptr), default: delete ptr
+---------------------+
```

- `p` **is** the `unique_ptr` object; it **contains** a pointer to the managed object. There is no extra pointer to the `unique_ptr`.
- At any moment there is at most one owner. Copy is deleted; ownership can only be **moved**.
- `unique_ptr` does not create the object: `std::make_unique<T>(args...)` (or `new`) creates it, and the `unique_ptr` takes ownership. Its destructor calls the deleter if it owns something.
- Zero overhead in the common case: with the default (stateless) deleter it is exactly one pointer (8 bytes on 64-bit), and `*p`, `p->`, `p.get()` compile to the same code as a raw pointer.
- Use it as the default owning pointer. Reach for `std::shared_ptr` (topic 07) only when ownership is genuinely shared.

#### 2. Move-only ownership
- `auto p2 = p1;` does not compile: the copy constructor is deleted ("use of deleted function").
- `auto p2 = std::move(p1);`:
  - `std::move` is only a cast to an rvalue (xvalue); it moves nothing (topic 03)
  - the **move constructor** copies the stored pointer into `p2` and sets `p1`'s pointer to `nullptr`
  - the managed object does not move, is not copied, and no allocation happens
- After the move, `p1` is a valid, **empty** `unique_ptr`. This is **guaranteed** by the standard (unlike most moved-from types, whose state is only "valid but unspecified").
  - `p1 == nullptr`, `!p1`, `p1.get() == nullptr` are all true
  - `p1->f()` or `*p1` is a null dereference: UB
  - `p1` can be reused: `p1 = std::make_unique<T>();`
- Move **assignment** `p1 = std::move(p2);` first takes `p2`'s pointer, then deletes the object `p1` owned before (equivalent to `p1.reset(p2.release())`).
- `sizeof` and type never change with state: a moved-from `unique_ptr<Buffer>` is still a `unique_ptr<Buffer>` of the same size.
- Destruction at scope end: both `p1` and `p2` destructors run, in reverse declaration order (`p2` first). `p2` deletes the object; `p1` holds `nullptr`, so its destructor does nothing. The managed object is destroyed exactly once.

#### 3. Observers and modifiers
| Member | Effect | Ownership |
|---|---|---|
| `get()` | Returns the raw pointer | Unchanged (caller only observes) |
| `explicit operator bool` | `get() != nullptr` | Unchanged |
| `*p`, `p->` | Dereference (UB if empty) | Unchanged |
| `release()` | Returns the pointer, sets stored pointer to `nullptr` | **Given up**: caller must free it |
| `reset()` / `reset(nullptr)` | Deletes the owned object, becomes empty | Released |
| `reset(q)` | Stores `q`, then deletes the old object | Takes `q` |
| `swap(other)` | Exchanges pointers and deleters | Swapped |
| `get_deleter()` | Reference to the stored deleter | Unchanged |

- `release()` does **not** delete anything. `p.release();` with the result discarded is a leak (it is not `[[nodiscard]]` in C++20 libstdc++, so the compiler stays silent).
- `reset(q)` order (specified in [unique.ptr.single.modifiers]):
  1. save the old pointer
  2. store `q`
  3. if the old pointer was not null, call the deleter on it
- Why this order: if the old object's destructor reaches back into the owner (`owner.get()`), it sees the new, consistent state instead of a pointer to an object being destroyed. It does not make self-reset safe: `p.reset(p.get())` leaves `p` owning a deleted object (UB).
- `reset()` and the destructor never call the deleter on a null pointer, so a custom deleter is never invoked for an empty `unique_ptr`.
- Comparison with `nullptr` and between `unique_ptr`s compares stored pointers (`operator<=>` since C++20).
- C++23 made `unique_ptr` usable in constant expressions (`constexpr` members).

#### 4. make_unique and make_unique_for_overwrite
- `std::make_unique<T>(args...)` (C++14) = `std::unique_ptr<T>(new T(std::forward<Args>(args)...))`.
- Reasons to prefer it:
  - **No naked `new`** in application code: every `new` is immediately owned, and "no `new` outside low-level classes" becomes a reviewable rule.
  - Type is written once: `auto p = std::make_unique<Order>(id, qty);`
  - **Exception safety before C++17**: in `f(std::unique_ptr<A>(new A), g())` a compiler could evaluate `new A`, then `g()`, then construct the `unique_ptr`. If `g()` threw, `A` leaked. `make_unique` performs allocation and ownership in one function call.
- C++17 changed the rules: the initialization of each function parameter is sequenced as a whole (no interleaving), so that specific leak cannot happen any more. The other reasons remain.
- Unlike `make_shared`, `make_unique` gives **no performance benefit**: there is no control block to co-allocate.
- Limitations:
  - no custom deleter: use the constructor `std::unique_ptr<T, D>(ptr, d)`
  - uses parentheses: `make_unique<std::vector<int>>(3, 1)` is `{1, 1, 1}`, not `{3, 1}`
  - aggregates without a constructor work only from C++20 (parenthesized aggregate initialization, P0960)
- Arrays:
  - `make_unique<T[]>(n)`: `new T[n]()`, **value-initialized** (ints zeroed)
  - `make_unique_for_overwrite<T>()` / `<T[]>(n)` (C++20): **default-initialized**, so a large `char` buffer that will be overwritten by `read()` is not zeroed first
  - `make_unique<T[N]>` (known bound) is deleted

#### 5. Custom deleters
- The deleter is the cleanup policy: any callable `d(ptr)`. Needed whenever the resource is not released with `delete`:

| Resource | Deleter |
|---|---|
| `FILE*` from `fopen` | `fclose` |
| Memory from `malloc` / C library | `free` |
| C library handle (`sqlite3*`, `SSL*`, `curl*`) | the library's destroy function |
| Object from a pool | return to the pool (stateful deleter) |

- The deleter type is part of the **unique_ptr type**: `unique_ptr<FILE, CloserA>` and `unique_ptr<FILE, CloserB>` are different types, cannot be assigned to each other, and cannot share one `std::vector`. (Contrast: `shared_ptr` type-erases the deleter into the control block, topic 07.)
- `unique_ptr` is therefore **not** type erasure; it is a template that bakes the policy in, which is why it can be zero-overhead.
- Size depends on the deleter (libstdc++ x86-64, verified):

| Deleter | `sizeof(unique_ptr)` | Why |
|---|---|---|
| `default_delete<T>` | 8 | Empty class, stored with empty-base optimization |
| Stateless functor `struct Closer { void operator()(FILE*) const; }` | 8 | Empty |
| Captureless lambda (`decltype(lam)`) | 8 | Empty closure type |
| Function pointer `int(*)(FILE*)` | 16 | Must store the pointer |
| Stateful functor (one `int`) | 16 | Stores its state, padded |
| `std::function<void(T*)>` | 40 | Type-erased callable, heavy |

- Prefer a stateless functor or a lambda type; a function pointer costs 8 bytes and an indirect call per object.
- C++20: a lambda can appear in an unevaluated context, so `std::unique_ptr<FILE, decltype([](FILE* f) { std::fclose(f); })>` works without a named variable.
- `if (f)` inside a `unique_ptr` deleter is harmless but redundant: the deleter is never called with null. (A `shared_ptr` deleter **can** be called with null: `shared_ptr<FILE>(nullptr, d)` calls `d(nullptr)`.)
- Advanced: if the deleter defines `using pointer = X;`, `unique_ptr` stores an `X` instead of `T*` (a "fancy pointer"; it must behave like a nullable pointer).

#### 6. unique_ptr<T[]>
- The `T[]` partial specialization uses `default_delete<T[]>`, which calls `delete[]`.
- `std::unique_ptr<int> p(new int[10]);` compiles but pairs `new[]` with scalar `delete`: **UB** (ASan: alloc-dealloc-mismatch). It is not "deletes only the first element"; the language gives no such guarantee.
- `unique_ptr<T[]>` provides `operator[]`, no `operator*`/`operator->`.
- `make_unique<Buffer[]>(5)` constructs 5 `Buffer`s; destruction runs 5 destructors, in reverse index order (4 down to 0).
- No conversion from `unique_ptr<Derived[]>` to `unique_ptr<Base[]>` (pointer arithmetic over a `Base*` into a `Derived` array is wrong). Qualification conversions are allowed (`unique_ptr<int[]>` to `unique_ptr<const int[]>`, C++17).
- It does not know its size. Prefer `std::vector<T>` or `std::array<T, N>`; `unique_ptr<T[]>` fits fixed buffers handed to C APIs or `make_unique_for_overwrite` I/O buffers.

#### 7. Polymorphism and the virtual destructor
- Converting move: `std::unique_ptr<Base> b = std::make_unique<Derived>();` compiles because `Derived*` converts to `Base*` and `default_delete<Derived>` converts to `default_delete<Base>`.
- The stored deleter is now `default_delete<Base>`, which calls `delete (Base*)p`.
- If `Base` has **no virtual destructor**, deleting a `Derived` through `Base*` is **UB**: in practice `~Derived` and its members' destructors never run (ASan: new-delete-type-mismatch, e.g. 40 vs 4 bytes).
- Rule: a class meant to be owned polymorphically needs `virtual ~Base() = default;` (or a protected non-virtual destructor to forbid deletion through `Base*`).
- `std::shared_ptr<Base>` created by `make_shared<Derived>()` does call `~Derived` even without a virtual destructor, because its control block captured the right deleter at creation. Do not rely on it; the virtual destructor is still required for every other way of deleting (topic 07).

#### 8. Passing unique_ptr to and from functions
- The parameter type documents the ownership intent (Herb Sutter, GotW #91; C++ Core Guidelines R.32 to R.33):

| Signature | Meaning | Caller writes |
|---|---|---|
| `void f(T&)` / `void f(const T&)` | Use the object, no ownership involved | `f(*p)` |
| `void f(T*)` | Use the object, may be null, no ownership | `f(p.get())` |
| `void f(std::unique_ptr<T> p)` | **Sink**: f takes ownership | `f(std::move(p))` |
| `void f(std::unique_ptr<T>& p)` | **Reseat**: f may replace or reset the caller's pointer | `f(p)` |
| `void f(const std::unique_ptr<T>&)` | Almost never useful: use `T&` or `T*` | |
| `std::unique_ptr<T> make()` | **Factory**: caller receives ownership | `auto p = make();` |

- Most functions should not mention `unique_ptr` at all; they operate on `T&`. Ownership appears only where it is transferred.
- Sink by value (not `&&`): the move happens at the call site and is visible; after the call the argument is guaranteed empty.
- Returning a local `unique_ptr` needs no `std::move`: `return p;` uses copy elision or the implicit move on return (topic 04).
- `const std::unique_ptr<T> p` is a non-transferable "scoped pointer": it cannot be moved out or reset; ownership is locked to that scope.

#### 9. Incomplete types and the pimpl idiom
- The standard requires `T` to be complete when `default_delete<T>::operator()` is instantiated (libstdc++ enforces it with `static_assert(sizeof(T) > 0)`): `delete` must call the right destructor.
- `unique_ptr<Impl>` itself can be declared with an incomplete `Impl` (that is what makes pimpl work), but every function that may delete must be compiled where `Impl` is complete:
  - the destructor of the owning class
  - its move assignment (deletes the old Impl)
  - its constructors, including the move constructor: a constructor potentially invokes the destructors of already-built members in case a later step throws ([class.base.init]), so an inline `Widget() {}` or `Widget(Widget&&) noexcept = default;` in the header also fails (verified GCC 11, Clang 14)
  - any `reset()` call
- So in pimpl:
  - header: `struct Impl; std::unique_ptr<Impl> impl_;` and **declare** `~Widget();`, `Widget(Widget&&) noexcept;`, `Widget& operator=(Widget&&) noexcept;`
  - .cpp: define `struct Impl { ... };` first, then `Widget::~Widget() = default;` and the moves `= default`
- If the destructor is implicit (inline in the header), it is instantiated in every file that destroys a `Widget`, where `Impl` is incomplete: libstdc++ reports "invalid application of 'sizeof' to incomplete type" from `unique_ptr.h`.
- `shared_ptr<Impl>` does not have this restriction (deleter captured at construction), but costs a control block and atomic counts.

#### 10. Conversions and ownership hand-off
- `unique_ptr` to `shared_ptr`: implicit from an rvalue: `std::shared_ptr<T> s = std::move(u);` (or directly from a factory's return value). The custom deleter is moved into the new control block. One extra allocation (the control block), since the object was not created by `make_shared`.
- Therefore factories should return `unique_ptr`: the caller can keep unique ownership, or upgrade to shared for free in terms of API.
- `shared_ptr` to `unique_ptr`: impossible. Other owners may exist; there is no `release()` on `shared_ptr`.
- To a C API that takes ownership: `c_api_adopt(p.release());` (after the call succeeds).
- To a C API that only borrows: `c_api_use(p.get());`.
- Thread safety: same as a raw pointer. Different `unique_ptr` objects can be used from different threads freely; one `unique_ptr` object modified by one thread while another reads it is a data race. The pointee needs its own synchronization.

#### 11. Misconceptions to unlearn
- ❌ "`std::move(p1)` moves the Resource to `p2`." ✅ Only the stored pointer is transferred; the Resource stays at the same address.
- ❌ "After the move, `p1` is unspecified." ✅ For `unique_ptr` it is guaranteed empty (`nullptr`).
- ❌ "Calling `p1->f()` after the move is safe." ✅ It dereferences null: UB.
- ❌ "`unique_ptr` constructs the object." ✅ `make_unique`/`new` constructs it; `unique_ptr` owns and destroys it.
- ❌ "`unique_ptr<int>(new int[10])` only deletes the first element." ✅ It is UB; use `unique_ptr<int[]>` or `vector`.
- ❌ "`make_unique<Buffer[]>(5)` calls one destructor." ✅ Five, in reverse order.
- ❌ "A custom deleter always increases the size." ✅ Stateless deleters (functor, captureless lambda) add nothing; function pointers and state do.
- ❌ "`unique_ptr` is type-erased like `shared_ptr`." ✅ The deleter is part of the type.
- ❌ "`release()` frees the object." ✅ It gives up ownership and returns the pointer; nothing is freed.
- ❌ "`reset(q)` deletes the old object, then stores `q`." ✅ It stores `q` first, then deletes the old object.
- ❌ "`make_unique` is still needed for exception safety in C++17." ✅ That specific argument-interleaving leak is gone in C++17; `make_unique` is still preferred for no naked `new`.
- ❌ "`unique_ptr<Base>` handles derived destruction automatically." ✅ Only with a virtual destructor in `Base`.

### EDGE_CASES: Traps and Misconceptions

#### Edge Case 1: Destruction order after a move
- `auto p1 = std::make_unique<R>(); auto p2 = std::move(p1);` then scope ends.
- Locals are destroyed in reverse declaration order: **`p2` first** (it owns R, so `~R` runs now), then `p1` (empty, does nothing).
- A common wrong trace says "`p1` is destroyed first and does nothing, then `p2` deletes". The result (one `~R`) is the same, but the order is not.
- Matters when other locals depend on the object: anything declared between `p1` and `p2` is destroyed **after** `~R`.

#### Edge Case 2: The deleter is never called on null
- `std::unique_ptr<FILE, Closer> f(std::fopen("missing", "r"));` with a failed `fopen` stores `nullptr`.
- At scope exit, the destructor sees `nullptr` and does **not** call `Closer`. Same for a moved-from `unique_ptr` and after `reset()`.
- So `fclose(nullptr)` can never happen through `unique_ptr`, and an `if (f)` in the deleter is redundant.
- Not true for `shared_ptr`: `std::shared_ptr<FILE>(nullptr, closer)` calls `closer(nullptr)` when the last owner dies, so `shared_ptr` deleters must handle null.

#### Edge Case 3: reset stores the new pointer before deleting the old one
- `p.reset(new T(2));`: after step 2 `p.get()` already returns the new pointer; the old object is destroyed in step 3.
- An object whose destructor looks at its owner (`owner.get()`) observes the new object, never a half-destroyed one.
- If the old object's destructor throws (it must not), `p` already owns the new object, so the new one is not leaked.
- Move assignment behaves the same way: it is `reset(other.release())`.

#### Edge Case 4: unique_ptr<Base> without a virtual destructor
- `std::unique_ptr<Base> b = std::make_unique<Derived>();` compiles silently.
- `default_delete<Base>` deletes through `Base*`: without `virtual ~Base()`, this is UB. Observed: only `~Base` prints; `Derived`'s `std::string` member is never destroyed (its heap buffer leaks).
- ASan (for a `Base` holding one `int` and a `Derived` adding a `std::string`): `new-delete-type-mismatch: object passed to delete has wrong type: size of the allocated type: 40 bytes; size of the deallocated type: 4 bytes`.
- GCC `-Wall` does not warn here (`-Wdelete-non-virtual-dtor` fires only when the class has other virtual functions).

#### Edge Case 5: Scalar unique_ptr owning an array
- `std::unique_ptr<int> p(new int[10]);` compiles: the constructor takes any `int*`.
- Destruction calls `delete` on memory from `new[]`: UB (ASan: `alloc-dealloc-mismatch (operator new [] vs operator delete)`).
- For class types with destructors the damage is typically worse (Itanium C++ ABI, GCC/Clang): only one destructor runs and the allocator receives the wrong pointer (the array cookie is skipped).
- Fix: `std::unique_ptr<int[]>` or `std::make_unique<int[]>(10)`; better, `std::vector<int>(10)`.

#### Edge Case 6: Owning something that was never allocated with new
- `int x = 42; std::unique_ptr<int> p(&x);` compiles.
- Two bugs: if `p` outlives `x` it dangles; and whenever it is destroyed it calls `delete` on stack memory: UB.
- ASan: `attempting free on address which was not malloc()-ed: ... in stack`.
- Same bug class: `unique_ptr` to a static object, to a member of another object, or to memory from `malloc` with the default deleter.

#### Edge Case 7: Two unique_ptrs from one raw pointer
- `T* raw = new T; std::unique_ptr<T> a(raw); std::unique_ptr<T> b(raw);` compiles; it double-deletes (ASan: attempting double-free).
- Also `std::unique_ptr<T> b(a.get());`: `get()` does not transfer ownership.
- Rule: transfer only with `std::move(a)` or `b.reset(a.release())`.

#### Edge Case 8: vector<unique_ptr<T>> from an initializer list
- `std::vector<std::unique_ptr<int>> v{std::make_unique<int>(1), std::make_unique<int>(2)};` does not compile.
- `std::initializer_list<E>` gives access to its elements only as `const E&`, so the vector must **copy** them, and `unique_ptr` is not copyable. libstdc++: "static assertion failed: result type must be constructible from value type of input range" (plus "use of deleted function").
- Fix: `reserve` then `push_back(std::make_unique<int>(1))` / `emplace_back(...)` in a loop, or move from an array of `unique_ptr`s with `std::make_move_iterator`.

#### Edge Case 9: Implicit destructor with an incomplete pimpl type
- Header: `class Widget { struct Impl; std::unique_ptr<Impl> impl_; public: Widget(); };` with no destructor declared.
- Any file that destroys a `Widget` instantiates `~unique_ptr<Impl>` where `Impl` is incomplete: compile error "invalid application of 'sizeof' to incomplete type 'Widget::Impl'".
- Fix: declare `~Widget();` in the header and define it as `= default` in the .cpp after `Impl` is defined (same for move assignment).

#### Edge Case 10: release() without taking the result
- `p.release();` written as "free it now" leaks: it only nulls the stored pointer and returns the old one.
- Correct intent mapping: free now → `p.reset()`; hand to another owner → `q.reset(p.release())` or `q = std::move(p)`; hand to a C API that adopts → `api(p.release())`.

### CODE_EXAMPLES: Practical Demonstrations

#### Example 1: Ownership transfer, moved-from state and destruction order
- Traces addresses: the managed object never moves; the source becomes null; the destructor runs once.
```cpp
#include <iostream>
#include <memory>

struct Resource {
    Resource() { std::cout << "Resource acquired\n"; }
    ~Resource() { std::cout << "Resource released\n"; }
};

struct Tag {                        // shows when each handle dies
    const char* name;
    ~Tag() { std::cout << "end of " << name << "'s scope slot\n"; }
};

int main() {
    auto p1 = std::make_unique<Resource>();
    Tag t1{"p1"};
    Resource* addr = p1.get();

    auto p2 = std::move(p1);        // pointer transferred, no allocation
    Tag t2{"p2"};

    std::cout << std::boolalpha
              << "p1 empty: " << (p1 == nullptr) << '\n'
              << "p2 owns same object: " << (p2.get() == addr) << '\n'
              << "sizeof p1 == sizeof p2: " << (sizeof p1 == sizeof p2) << '\n';
    std::cout << "leaving main\n";
}
```
- Output:
```
Resource acquired
p1 empty: true
p2 owns same object: true
sizeof p1 == sizeof p2: true
leaving main
end of p2's scope slot
Resource released
end of p1's scope slot
```
- Reverse declaration order: `t2`, then `p2` (deletes the Resource), then `t1`, then `p1` (empty, nothing printed).

#### Example 2: Custom deleters for C resources, and their cost
- Wraps `FILE*` (via `tmpfile()`, so nothing is left on disk) and `malloc` memory; prints the size of each deleter flavour.
```cpp
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <functional>
#include <iostream>
#include <memory>

struct FileCloser {
    void operator()(std::FILE* f) const noexcept {
        std::cout << "fclose\n";
        std::fclose(f);
    }
};
using FilePtr = std::unique_ptr<std::FILE, FileCloser>;

struct FreeDeleter {
    void operator()(void* p) const noexcept { std::free(p); }
};

struct Tagged { int tag; void operator()(std::FILE* f) const { std::fclose(f); } };

int main() {
    {
        FilePtr f(std::tmpfile());
        std::fputs("tick 101.25\n", f.get());       // C API borrows: get()
        std::unique_ptr<char, FreeDeleter> buf(static_cast<char*>(std::malloc(16)));
        std::strcpy(buf.get(), "from malloc");
        std::cout << buf.get() << '\n';
    }                                                // free, then fclose
    auto lam = [](std::FILE* f) { std::fclose(f); };
    using F = std::FILE;
    std::cout << "default:           " << sizeof(std::unique_ptr<int>) << '\n'
              << "stateless functor: " << sizeof(FilePtr) << '\n'
              << "lambda:            " << sizeof(std::unique_ptr<F, decltype(lam)>) << '\n'
              << "function pointer:  " << sizeof(std::unique_ptr<F, int (*)(F*)>) << '\n'
              << "stateful functor:  " << sizeof(std::unique_ptr<F, Tagged>) << '\n'
              << "std::function:     "
              << sizeof(std::unique_ptr<F, std::function<void(F*)>>) << '\n';
}
```
- Output (libstdc++, x86-64):
```
from malloc
fclose
default:           8
stateless functor: 8
lambda:            8
function pointer:  16
stateful functor:  16
std::function:     40
```
- `buf` is declared after `f`, so it is released first.
- Prefer the stateless functor: same size as a raw pointer, and the call is inlined.

#### Example 3: Arrays: make_unique<T[]>, destructor count, make_unique_for_overwrite
```cpp
#include <cstring>
#include <iostream>
#include <memory>

struct Buffer {
    static inline int next = 0;
    int id = next++;
    Buffer() { std::cout << "construct " << id << '\n'; }
    ~Buffer() { std::cout << "destroy " << id << '\n'; }
};

int main() {
    {
        auto p = std::make_unique<Buffer[]>(3);     // new Buffer[3]()
        std::cout << "p[1].id = " << p[1].id << '\n';
    }                                               // delete[]: 3 destructors

    auto zeros = std::make_unique<int[]>(4);        // value-initialized
    std::cout << "zeros: " << zeros[0] + zeros[1] + zeros[2] + zeros[3] << '\n';

    // C++20: default-initialized, not zeroed: fine because we overwrite it
    auto io = std::make_unique_for_overwrite<char[]>(64);
    std::strcpy(io.get(), "payload");
    std::cout << io.get() << '\n';
}
```
- Output:
```
construct 0
construct 1
construct 2
p[1].id = 1
destroy 2
destroy 1
destroy 0
zeros: 0
payload
```
- Array elements are destroyed in reverse order of construction.
- Reading `io` before writing it would read indeterminate values (UB); that is the price of skipping the zeroing.

#### Example 4: Factory, converting move into a base class, and the passing conventions
- `Base` has a virtual destructor, so ownership through `unique_ptr<Base>` destroys correctly.
```cpp
#include <iostream>
#include <memory>
#include <string>
#include <vector>

struct Order {
    virtual ~Order() { std::cout << "~Order\n"; }
    virtual std::string describe() const = 0;
};

struct LimitOrder : Order {
    double px;
    explicit LimitOrder(double p) : px(p) {}
    ~LimitOrder() override { std::cout << "~LimitOrder\n"; }
    std::string describe() const override { return "LIMIT @" + std::to_string(px); }
};

std::unique_ptr<LimitOrder> make_limit(double px) {          // factory
    auto o = std::make_unique<LimitOrder>(px);
    return o;                                                 // no std::move needed
}

void print(const Order& o) { std::cout << o.describe() << '\n'; }   // observe

class Book {
    std::vector<std::unique_ptr<Order>> orders_;
public:
    void add(std::unique_ptr<Order> o) { orders_.push_back(std::move(o)); }  // sink
    std::size_t size() const { return orders_.size(); }
};

void replace(std::unique_ptr<Order>& slot) { slot = make_limit(99.5); }    // reseat

int main() {
    Book book;
    auto o = make_limit(101.0);
    print(*o);
    book.add(std::move(o));             // converting move: LimitOrder -> Order
    std::cout << "o empty after sink: " << (o == nullptr) << ", book=" << book.size() << '\n';

    std::unique_ptr<Order> slot = make_limit(100.0);
    replace(slot);                      // old order destroyed during the reseat
    print(*slot);
    std::cout << "end of main\n";
}
```
- Output:
```
LIMIT @101.000000
o empty after sink: 1, book=1
~LimitOrder
~Order
LIMIT @99.500000
end of main
~LimitOrder
~Order
~LimitOrder
~Order
```
- Without `virtual ~Order()`, every `~LimitOrder` line would disappear (and it would be UB).
- `print` takes `const Order&`: it works for orders owned by `unique_ptr`, `shared_ptr`, or on the stack.

#### Example 5: Pimpl with an incomplete type
- One file stands in for header + source; the comments mark the split.
```cpp
#include <iostream>
#include <memory>
#include <string>

// ---- widget.h ----
class Widget {
public:
    explicit Widget(std::string name);
    ~Widget();                                   // declared only
    Widget(Widget&&) noexcept;
    Widget& operator=(Widget&&) noexcept;
    void greet() const;
private:
    struct Impl;                                 // incomplete here
    std::unique_ptr<Impl> impl_;
};

// ---- widget.cpp ----
struct Widget::Impl {
    std::string name;
    int calls = 0;
};

Widget::Widget(std::string name) : impl_(std::make_unique<Impl>(Impl{std::move(name)})) {}
Widget::~Widget() = default;                     // Impl complete: deletion compiles
Widget::Widget(Widget&&) noexcept = default;
Widget& Widget::operator=(Widget&&) noexcept = default;
void Widget::greet() const { std::cout << "hello from " << impl_->name << '\n'; }

// ---- main.cpp ----
int main() {
    Widget a("engine");
    Widget b = std::move(a);
    b.greet();
    std::cout << "sizeof(Widget) = " << sizeof(Widget) << '\n';
}
```
- Output:
```
hello from engine
sizeof(Widget) = 8
```
- Remove the declaration `~Widget();` (and its definition) and put the header part in a separate file: every translation unit that destroys a `Widget` fails with "invalid application of 'sizeof' to incomplete type 'Widget::Impl'".
- Changing `Impl`'s members no longer recompiles clients: the header and `sizeof(Widget)` stay the same.
- Copying is disabled (the move declarations suppress the copy operations); add a deep-copying copy constructor in the .cpp if needed.

#### Example 6: A stateful deleter that returns objects to a pool
- The deleter carries a pointer to its pool, so the `unique_ptr` grows to 16 bytes; in exchange, "free" means "put back on the free list".
```cpp
#include <iostream>
#include <memory>
#include <vector>

struct Msg { int seq = 0; };

class MsgPool {
    std::vector<std::unique_ptr<Msg>> storage_;
    std::vector<Msg*> free_;
public:
    struct Returner {
        MsgPool* pool;
        void operator()(Msg* m) const noexcept { pool->free_.push_back(m); }
    };
    using Handle = std::unique_ptr<Msg, Returner>;

    explicit MsgPool(int n) {
        free_.reserve(n);                // capacity n: returning never allocates
        for (int i = 0; i < n; ++i) {
            storage_.push_back(std::make_unique<Msg>());
            free_.push_back(storage_.back().get());
        }
    }
    Handle acquire() {
        if (free_.empty()) return Handle(nullptr, Returner{this});
        Msg* m = free_.back();
        free_.pop_back();
        return Handle(m, Returner{this});
    }
    std::size_t available() const { return free_.size(); }
};

int main() {
    MsgPool pool(2);
    {
        auto a = pool.acquire();
        auto b = pool.acquire();
        auto c = pool.acquire();         // exhausted: empty handle
        a->seq = 1;
        std::cout << "available=" << pool.available() << " c empty=" << !c << '\n';
    }                                    // a and b go back, c's deleter not called
    std::cout << "available=" << pool.available()
              << " sizeof(Handle)=" << sizeof(MsgPool::Handle) << '\n';
}
```
- Output:
```
available=0 c empty=1
available=2 sizeof(Handle)=16
```
- `c` is empty, and the deleter is never invoked on null, so nothing bogus is pushed onto the free list.
- The pool must outlive every handle (the deleter holds a raw `MsgPool*`). Pools in depth: topic 11.

#### Example 7: Handing a unique_ptr over to shared ownership
- A factory returns `unique_ptr`; one caller keeps it unique, another upgrades to `shared_ptr`; the custom deleter travels along.
```cpp
#include <iostream>
#include <memory>

struct Session { int id; };

struct Closer {
    void operator()(Session* s) const {
        std::cout << "closing session " << s->id << '\n';
        delete s;
    }
};

using SessionPtr = std::unique_ptr<Session, Closer>;

SessionPtr open_session(int id) { return SessionPtr(new Session{id}); }

int main() {
    SessionPtr mine = open_session(1);                  // stays unique
    std::shared_ptr<Session> shared = open_session(2);  // rvalue: converts
    auto copy = shared;
    std::cout << "use_count=" << shared.use_count() << '\n';

    SessionPtr later = open_session(3);
    std::shared_ptr<Session> s3 = std::move(later);     // named: needs std::move
    std::cout << "later empty: " << (later == nullptr) << '\n';
}
```
- Output:
```
use_count=2
later empty: 1
closing session 3
closing session 2
closing session 1
```
- `std::shared_ptr<Session> s = mine;` (lvalue) does not compile: the conversion consumes the `unique_ptr`.
- The conversion allocates a control block (the object already exists, so `make_shared`'s single allocation is impossible). Control block details: topic 07.

### QUICK_REFERENCE: Cheat Sheet

#### Operations
| Expression | Result |
|---|---|
| `auto p = std::make_unique<T>(args...)` | Owns a new `T` (C++14) |
| `auto a = std::make_unique<T[]>(n)` | Owns `n` value-initialized `T`s |
| `std::make_unique_for_overwrite<T[]>(n)` | Default-initialized (C++20) |
| `auto q = p;` | Compile error (copy deleted) |
| `auto q = std::move(p);` | `q` owns, `p == nullptr` (guaranteed) |
| `p.get()` | Raw pointer, no ownership change |
| `p.release()` | Returns pointer, `p` empty, **nothing freed** |
| `p.reset()` | Deletes owned object, `p` empty |
| `p.reset(q)` | Stores `q`, **then** deletes old |
| `p = std::move(q)` | `p.reset(q.release())` |
| `std::shared_ptr<T> s = std::move(p)` | Upgrade to shared ownership |

#### Sizes (libstdc++ x86-64)
| Deleter | Size |
|---|---|
| default, stateless functor, captureless lambda | 8 |
| function pointer, stateful (one `int`) | 16 |
| `std::function` | 40 |

#### UB and compile errors
| Code | Result |
|---|---|
| `p1->f()` after `std::move(p1)` | Null dereference: UB |
| `unique_ptr<int>(new int[10])` | `new[]`/`delete` mismatch: UB |
| `unique_ptr<int>(&local)` | Deleting stack memory: UB |
| Two `unique_ptr`s from one raw pointer | Double delete: UB |
| `unique_ptr<Base>` owning `Derived`, non-virtual `~Base` | UB, `~Derived` skipped |
| `vector<unique_ptr<T>> v{make_unique<T>()}` | Compile error (init-list copies) |
| Implicit destructor with incomplete pimpl `Impl` | Compile error (`sizeof` incomplete) |
| `p.release();` result ignored | Leak |

#### Interview one-liners
| Question | Answer |
|---|---|
| What does `std::move(p1)` move? | Nothing; it is a cast. The move constructor transfers the pointer |
| State of `p1` after move? | Guaranteed null |
| Destruction order of `p1`, `p2`? | `p2` first (deletes), then `p1` (empty) |
| Why `unique_ptr` over `shared_ptr` for one owner? | Expresses intent; one pointer, no control block, no atomic counts, cheap move |
| Is the deleter part of the type? | Yes (`shared_ptr`: no, type-erased) |
| Deleter called on null? | Never (for `unique_ptr`) |
| `reset(q)` order? | Store `q`, then delete old |
| Why `make_unique` in C++17? | No naked `new`, type once; the argument-interleaving leak was fixed by C++17 |
| `unique_ptr<int[]>` vs `unique_ptr<int>`? | `delete[]` vs `delete`; mixing is UB |
| How to pass? | `T&`/`T*` to use, by value to sink, `unique_ptr&` to reseat |
| Pimpl needs what? | Out-of-line destructor, constructors and move operations where `Impl` is complete |
| Thread-safe? | Like a raw pointer: distinct objects yes, one object shared with writers no |
