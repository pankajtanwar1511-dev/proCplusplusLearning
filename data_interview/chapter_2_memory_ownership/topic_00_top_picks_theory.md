## TOPIC: Top 50: Must-Know Memory and Ownership Interview Questions

### THEORY_SECTION: Start Here

#### 1. How to use this list
- The 50 highest-value items from this chapter: 25 interview questions and 25 code puzzles.
- Every topic in the chapter is represented, so this list doubles as a fast revision pass before an interview.
- Each item is built around a misconception that many engineers hold. Answer it yourself before revealing the answer.
- Every answer ends with a "Deep dive" pointer to the full topic for more questions on the same idea.
- Interview Q&A tab: conceptual and design questions. Practice Tasks tab: output prediction and bug hunting.

#### 2. Coverage map
| Topic | Interview questions | Code puzzles |
|---|---|---|
| 1. Object Lifetime and Storage Duration | 2 | 2 |
| 2. Special Member Functions and the Rule of 0/3/5 | 2 | 2 |
| 3. Value Categories, std::move and Moved-From State | 2 | 2 |
| 4. Copy Elision, RVO and NRVO | 2 | 2 |
| 5. RAII and Exception Safety | 2 | 2 |
| 6. std::unique_ptr | 2 | 2 |
| 7. std::shared_ptr Internals and make_shared | 3 | 2 |
| 8. shared_ptr and Thread Safety | 2 | 3 |
| 9. weak_ptr, Reference Cycles and enable_shared_from_this | 2 | 2 |
| 10. new/delete, Placement New and Object Storage | 2 | 2 |
| 11. Memory Pools and Polymorphic Allocators (PMR) | 2 | 2 |
| 12. Alignment, Padding and Data Layout | 2 | 2 |
| **Total** | **25** | **25** |

#### 3. Suggested order
- First pass: the Practice Tasks tab, top to bottom. Predict each output before revealing it.
- Second pass: the Interview Q&A tab. Say each answer out loud in under a minute, then compare.
- Any item you miss: open its Deep dive topic and work through that topic's full question set.

### EDGE_CASES: The Traps That Catch the Most Engineers

#### Edge Case 1: Where exactly does a temporary bound to a returned reference die?
- Code:
```cpp
std::string create() { return "hello"; }
const std::string& get() { return create(); }   // GCC: returning reference to temporary
const std::string& s = get();
std::cout << s;                                  // UB
```
- A common (and AI-generated) explanation says the temporary "is destroyed at the end of the full expression in the caller". That is wrong. The temporary is created by the `return` statement **inside** `get()`; a temporary bound to the returned value of a function is not extended and is destroyed at the end of the `return` statement's full-expression. By the time `get()` returns, the string is already gone.
- Verified with a tracing type: `~T` prints before the caller's next line runs.
- RVO has nothing to do with it: elision decides where `create()`'s result is built, not how long a reference to it is valid.
- GCC warns (`-Wreturn-local-addr`, on by default). C++26 (P2748) makes binding a returned reference to a temporary ill-formed.
- Deep dive: Topic 1, Object Lifetime and Storage Duration

#### Edge Case 2: A destructor quietly turns moves into copies
- `struct Order { std::string id; ~Order() { log(); } };` looks harmless.
- The user-declared destructor removes the implicit move constructor. `Order b = std::move(a);` compiles and calls the copy constructor: `a.id` keeps its contents, and the string is deep-copied.
- In `std::vector<Order>`, every reallocation copies every element.
- Fix: remove the destructor (logging belongs elsewhere) or add `Order(Order&&) noexcept = default;` and the other defaults.
- The same happens with `~Order() = default;`, which many people add "for clarity".
- Deep dive: Topic 2, Special Member Functions and the Rule of 0/3/5

#### Edge Case 3: std::move on a const object silently copies
- `const std::string s = "..."; std::string t = std::move(s);` compiles without a warning and copies.
- Same with `const` locals returned with `return std::move(x);`, `const` members moved in a constructor, and `const auto&` loop variables: `for (const auto& e : v) out.push_back(std::move(e));` copies every element.
- clang-tidy `performance-move-const-arg` flags these; compilers do not.
- Rule: never move from something declared `const`; drop the `const` when you intend to move.
- Deep dive: Topic 3, Value Categories, std::move and Moved-From State

#### Edge Case 4: `return std::move(local)` disables NRVO
- Output with a tracing type: `ctor move dtor dtor` instead of `ctor dtor`.
- GCC: `warning: moving a local object in a return statement prevents copy elision [-Wpessimizing-move]`.
- Same problem inside `return std::move(cond ? a : b);`: it moves, but a plain `if` would allow implicit move without the cast and keep code clearer.
- Deep dive: Topic 4, Copy Elision, RVO and NRVO

#### Edge Case 5: An uncaught exception does not guarantee cleanup
- `void work() { Guard g; throw std::runtime_error("boom"); }` called from `main` with no `try`.
- No handler exists, so `std::terminate` is called. Whether the stack is unwound first is **implementation-defined**.
- GCC/libstdc++ does not unwind: `~Guard` never runs; the program prints the terminate message and aborts.
- With a `try`/`catch` around the call, `~Guard` runs before the handler.
- Consequence: cleanup that must happen (flush a log, release an OS-wide lock file) needs a top-level `catch (...)` in `main` and in every thread function.
- Deep dive: Topic 5, RAII and Exception Safety

#### Edge Case 6: unique_ptr<Base> without a virtual destructor
- `std::unique_ptr<Base> b = std::make_unique<Derived>();` compiles silently.
- `default_delete<Base>` deletes through `Base*`: without `virtual ~Base()`, this is UB. Observed: only `~Base` prints; `Derived`'s `std::string` member is never destroyed (its heap buffer leaks).
- ASan (for a `Base` holding one `int` and a `Derived` adding a `std::string`): `new-delete-type-mismatch: object passed to delete has wrong type: size of the allocated type: 40 bytes; size of the deallocated type: 4 bytes`.
- GCC `-Wall` does not warn here (`-Wdelete-non-virtual-dtor` fires only when the class has other virtual functions).
- Deep dive: Topic 6, std::unique_ptr

#### Edge Case 7: Two control blocks for one object
- `Widget* raw = new Widget; std::shared_ptr<Widget> a(raw); std::shared_ptr<Widget> b(raw);`
- Each constructor that takes a raw pointer creates a **new** control block. `a` and `b` both have `use_count() == 1`; both delete the object: double free (ASan: "attempting double-free").
- Same bug in disguise: `std::shared_ptr<D>(static_cast<D*>(base.get()))`, or `std::shared_ptr<T>(this)` inside a member function (topic 09 shows `enable_shared_from_this`).
- Rule: a raw pointer becomes owned **once**. After that, copy the `shared_ptr`, use the pointer casts, or use the aliasing constructor.
- Deep dive: Topic 7, std::shared_ptr Internals and make_shared

#### Edge Case 8: Write-once flag publication is safe; republication is not
- Producer: `data = d; ready.store(true, release);` Consumer: `while (!ready.load(acquire)) {}` then `data->value`.
- Safe: the only write to `data` happens-before every read of it.
- Add a second producer (or the same producer later) doing `data = std::make_shared<Data>();` while consumers read: TSan reports a data race on `data`.
- A source of confusion: some explanations call even the write-once version a race. It is not; the conflict needs two **unordered** accesses.
- Deep dive: Topic 8, shared_ptr and Thread Safety

#### Edge Case 9: expired() followed by lock()
- `if (!w.expired()) { auto sp = w.lock(); sp->run(); }` looks safe, but another thread can release the last owner between the two calls. `sp` is then empty and `sp->run()` dereferences null (UB, usually a crash).
- `expired()` and `lock()` are each atomic; the sequence of two is not.
- Fix: `if (auto sp = w.lock()) sp->run();`. The test and the acquisition of ownership are one operation.
- Same race with `if (w.use_count() > 0)`.
- Deep dive: Topic 9, weak_ptr, Reference Cycles and enable_shared_from_this

#### Edge Case 10: Reusing storage and reading through the old pointer
- `X* p = new (buf) X{1}; p->~X(); new (buf) X{2}; use(p->n);`
  - If `X` has a `const` (or reference) member: UB in C++17 without `std::launder(p)`; allowed in C++20 (transparent replacement).
  - Through `reinterpret_cast<X*>(buf)`: needs `std::launder` in every version.
- In practice compilers rarely miscompile simple cases, which is why the bug is hard to demonstrate; the rule matters in generic containers with inline storage.
- Fix: keep the pointer returned by the newest placement new.
- Deep dive: Topic 10, new/delete, Placement New and Object Storage

#### Edge Case 11: The nested type does not use the resource
- `std::pmr::vector<std::string> v(&res);` allocates its array from `res`, but each long `std::string` element allocates its own buffer with `std::allocator`, i.e. the global heap.
- `std::pmr::vector<std::pmr::string> v(&res);` passes `res` to every element through uses-allocator construction (verified with a counting resource).
- Same trap with `pmr::map<std::string, std::vector<int>>`: use `pmr::string` and `pmr::vector` all the way down.
- Deep dive: Topic 11, Memory Pools and Polymorphic Allocators (PMR)

#### Edge Case 12: memcmp and hashing over padding
- Two objects with equal members can differ in their padding bytes, so `memcmp` says "not equal" and a byte-wise hash puts them in different buckets.
- Zeroed padding is only promised by zero-initialization (statics; value-initialization of a non-aggregate without a user-provided constructor). `T x{}` on a plain aggregate usually zeroes it in practice but does not promise it, and later member assignments and copies do not have to preserve padding values.
- `std::has_unique_object_representations_v<T>` tells you whether byte-wise comparison/hashing is valid for `T`.
- Sending a padded struct over the network or into a file also leaks stale stack or heap bytes.
- Deep dive: Topic 12, Alignment, Padding and Data Layout

### CODE_EXAMPLES: Patterns Worth Memorizing

#### Example 1: Rule of 5 and what noexcept buys inside std::vector
- Two otherwise identical types: one move constructor is `noexcept`, the other is not. Count copies during growth.
```cpp
#include <iostream>
#include <utility>
#include <vector>

template <bool NoExcept>
struct Elem {
    static inline int copies = 0, moves = 0;
    int* p;
    Elem() : p(new int(0)) {}
    ~Elem() { delete p; }
    Elem(const Elem& o) : p(new int(*o.p)) { ++copies; }
    Elem(Elem&& o) noexcept(NoExcept) : p(std::exchange(o.p, nullptr)) { ++moves; }
    Elem& operator=(const Elem& o) { *p = *o.p; return *this; }
    Elem& operator=(Elem&& o) noexcept {
        if (this != &o) { delete p; p = std::exchange(o.p, nullptr); }
        return *this;
    }
};

template <bool NoExcept>
void grow(const char* label) {
    std::vector<Elem<NoExcept>> v;
    for (int i = 0; i < 1000; ++i) v.emplace_back();
    std::cout << label << ": copies=" << Elem<NoExcept>::copies
              << " moves=" << Elem<NoExcept>::moves << '\n';
}

int main() {
    grow<true>("noexcept move ");
    grow<false>("throwing move ");
}
```
- Output (libstdc++, capacity doubling 1, 2, 4, ..., 1024):
```
noexcept move : copies=0 moves=1023
throwing move : copies=1023 moves=0
```
- 1023 relocations = 1 + 2 + 4 + ... + 512. Without `noexcept` every one of them is a heap allocation plus a copy.
- Deep dive: Topic 2, Special Member Functions and the Rule of 0/3/5

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
- Deep dive: Topic 6, std::unique_ptr

#### Example 3: Counting allocations: make_shared vs new
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
- Deep dive: Topic 7, std::shared_ptr Internals and make_shared

#### Example 4: Config reload with std::atomic<std::shared_ptr<const T>> (C++20, GCC 12+)
- Readers `load()` a snapshot without a mutex; one writer `store()`s new versions; old versions die with their last reader.
```cpp
#include <atomic>
#include <iostream>
#include <memory>
#include <thread>
#include <vector>

struct Config {
    int version;
    int max_speed;
    int max_distance;     // invariant: max_distance == 5 * max_speed
};

std::atomic<std::shared_ptr<const Config>> g_cfg{
    std::make_shared<const Config>(Config{0, 100, 500})};

int main() {
    std::cout << "lock-free: " << g_cfg.is_lock_free() << '\n';
    std::atomic<bool> stop{false};
    std::atomic<long> reads{0}, bad{0};
    std::vector<std::thread> readers;
    for (int r = 0; r < 4; ++r)
        readers.emplace_back([&] {
            while (!stop.load(std::memory_order_relaxed)) {
                auto c = g_cfg.load(std::memory_order_acquire);   // own snapshot
                if (c->max_distance != 5 * c->max_speed) ++bad;
                ++reads;
            }
        });
    for (int v = 1; v <= 1000; ++v) {
        auto next = std::make_shared<const Config>(Config{v, 100 + v, 5 * (100 + v)});
        g_cfg.store(std::move(next), std::memory_order_release);  // publish
    }
    stop = true;
    for (auto& t : readers) t.join();
    std::cout << "final version: " << g_cfg.load()->version
              << ", inconsistent: " << bad << ", reads > 0: " << (reads > 0) << '\n';
}
```
- Output (GCC 13, libstdc++):
```
lock-free: 0
final version: 1000, inconsistent: 0, reads > 0: 1
```
- TSan: clean. On GCC 11 this does not compile (no `atomic<shared_ptr>` specialization yet).
- The writer is single-threaded here. With several writers, see Example 5.
- Deep dive: Topic 8, shared_ptr and Thread Safety

#### Example 5: A fixed-size object pool with an intrusive free list
- Union slots (the object is a union member, so slot size and alignment come for free), O(1) acquire/release, exception-safe construction, and a "fail fast" exhaustion policy.
```cpp
#include <cstddef>
#include <iostream>
#include <memory>
#include <stdexcept>
#include <utility>

template <class T, std::size_t N>
class FixedPool {
    union Slot {
        Slot* next;                                // active while the slot is free
        T obj;                                     // active while an object lives here
        Slot() : next(nullptr) {}
        ~Slot() {}                                 // the pool decides when obj dies
    };
    Slot slots_[N];
    Slot* free_ = nullptr;
    std::size_t in_use_ = 0;
public:
    FixedPool() {
        for (std::size_t i = N; i-- > 0;) {        // slot 0 ends up at the head
            slots_[i].next = free_;
            free_ = &slots_[i];
        }
    }
    FixedPool(const FixedPool&) = delete;
    FixedPool& operator=(const FixedPool&) = delete;

    template <class... Args>
    T* create(Args&&... args) {
        if (!free_) return nullptr;                // exhaustion: report, no heap fallback
        Slot* s = free_;
        free_ = s->next;
        try {
            T* p = std::construct_at(&s->obj, std::forward<Args>(args)...);
            ++in_use_;
            return p;
        } catch (...) {
            s->next = free_;                       // give the slot back, then rethrow
            free_ = s;
            throw;
        }
    }
    void destroy(T* p) noexcept {
        std::destroy_at(p);                        // end the object's lifetime
        // A union and its member are pointer-interconvertible ([basic.compound]),
        // so this cast yields the Slot itself: no layout guessing involved.
        Slot* s = reinterpret_cast<Slot*>(p);
        s->next = free_;                           // makes next the active member
        free_ = s;
        --in_use_;
    }
    std::size_t in_use() const { return in_use_; }
};

struct Order {
    long id;
    double px;
    Order(long i, double p) : id(i), px(p) {
        if (p < 0) throw std::invalid_argument("negative price");
    }
};

int main() {
    FixedPool<Order, 2> pool;
    Order* a = pool.create(1, 100.5);
    Order* b = pool.create(2, 101.0);
    Order* c = pool.create(3, 102.0);              // pool full
    std::cout << "c is null: " << (c == nullptr) << ", in use: " << pool.in_use() << '\n';

    void* old_a = a;
    pool.destroy(a);
    Order* d = pool.create(4, 99.0);
    std::cout << "slot reused: " << (static_cast<void*>(d) == old_a) << '\n';

    pool.destroy(d);
    try {
        pool.create(5, -1.0);
    } catch (const std::exception& e) {
        std::cout << "ctor threw: " << e.what() << ", in use: " << pool.in_use() << '\n';
    }
    pool.destroy(b);
    std::cout << "sizeof(Order)=" << sizeof(Order)
              << " in use: " << pool.in_use() << '\n';
}
```
- Output:
```
c is null: 1, in use: 2
slot reused: 1
ctor threw: negative price, in use: 1
sizeof(Order)=16 in use: 0
```
- LIFO reuse: the most recently freed slot is handed out next, which is also the one most likely to be in cache.
- Lifetime: `create` starts an `Order`'s lifetime in existing storage; `destroy` ends it; the storage lives as long as the pool.
- Getting back from `T*` to the slot: because `obj` is a union member, the union and `obj` are pointer-interconvertible, so `reinterpret_cast<Slot*>(p)` is well defined. With a `std::byte` array member instead, the cast relies on layout assumptions the standard does not bless.
- Deep dive: Topic 11, Memory Pools and Polymorphic Allocators (PMR)

### QUICK_REFERENCE: Interview One-Liners for the Whole Chapter

#### Object Lifetime and Storage Duration
| Question | Answer |
|---|---|
| Lifetime vs storage? | Storage is memory; lifetime is when the object exists in it |
| Four storage durations? | Automatic, static, thread, dynamic |
| When does a temporary die? | End of the full-expression, unless bound directly to a local reference |
| Temp in `return` of `const T& f()`? | Dies inside `f`; caller gets a dangling reference |
| Does `join()` fix `&local` of the thread? | No; the local died when the function returned |
| Move vs reset on optional? | Move: alive, unspecified; reset: destroyed |
| Member init order? | Declaration order |
| Static init order across files? | Unspecified: use function-local statics or `constinit` |
| Are function-local statics thread-safe? | Initialization yes (C++11), use no |
| Where does `volatile` store a variable? | Wherever its storage duration says; `volatile` only affects accesses |
| Range-for over `temp().member_ref()`? | Dangles before C++23 (P2718 fixes) |

#### Special Member Functions and the Rule of 0/3/5
| Question | Answer |
|---|---|
| Rule of 3? | Destructor, copy ctor, copy assign: need one, need all three |
| Rule of 5? | Rule of 3 plus move ctor and move assign, because the three suppress implicit moves |
| Rule of 0? | Own resources through RAII members and write none of them |
| `Buffer b = a;` with raw pointer, no copy ctor? | Shallow copy, then double delete (UB) |
| `b = a;` with no copy assign? | Old array leaked plus double delete later |
| Dtor + copy ctor + move ctor, then `b = a`? | Compile error: copy assignment deleted |
| Why null the source in a move? | The source's destructor still runs |
| Why `noexcept` on moves? | `vector` growth moves only if the move cannot throw (else copies) |
| Copy-and-swap gives? | Strong guarantee, self-assignment safety, single cleanup path |
| `const` member effect? | Assignment deleted; construction fine |
| fd owner class? | Move-only: delete copies, `noexcept` move with `-1` sentinel |
| Polymorphic base? | Virtual dtor plus the five `= default` (copy often protected) |

#### Value Categories, std::move and Moved-From State
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

#### Copy Elision, RVO and NRVO
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

#### RAII and Exception Safety
| Question | Answer |
|---|---|
| What is RAII? | Acquire in constructor, release in destructor; lifetime equals ownership |
| Only memory? | No: locks, files, sockets, threads, any handle |
| Why does raw `new` leak on throw? | The pointer dies during unwinding, the pointee has no owner |
| Destructors guaranteed on throw? | Only if the exception is caught |
| Constructor throws? | Its destructor never runs; finished members are destroyed |
| Can a destructor throw? | Implicitly `noexcept`: `terminate` |
| `close()` can fail? | Explicit `close()` that reports, destructor swallows |
| Basic vs strong? | Basic: valid but maybe changed; strong: unchanged |
| How to get strong? | Throwing work first, commit with no-throw operations |
| Two objects own one fd? | Double close, and the second close can hit a reused fd |
| Scope guard? | RAII for an ad hoc action; dismiss at the commit point |
| `lock_guard` on throw? | Its destructor unlocks the mutex during unwinding |

#### std::unique_ptr
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

#### std::shared_ptr Internals and make_shared
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

#### shared_ptr and Thread Safety
| Question | Answer |
|---|---|
| Is `shared_ptr` thread-safe? | Control block yes; same handle with a writer no; object never |
| Two threads reset two copies? | Safe |
| One thread copies `g`, another reassigns `g`? | Data race; mutex or `atomic<shared_ptr>` |
| What does `atomic<shared_ptr>` protect? | The handle (load/store/CAS), not the object |
| Is it lock-free? | Not guaranteed; libstdc++ and MSVC use a lock bit |
| Release/acquire flag + plain `shared_ptr`? | Safe for one write before publication; racy if rewritten |
| Copy-on-write with two writers? | Lost update; serialize writers or CAS loop |
| Why is `shared_ptr` slow under threads? | Atomic RMW on a shared cache line per copy |
| Which thread runs the destructor? | The one that drops the last reference |
| Is `use_count()` reliable? | Only as a hint; `unique()` was removed in C++20 |

#### weak_ptr, Reference Cycles and enable_shared_from_this
| Question | Answer |
|---|---|
| What does `weak_ptr` keep alive? | The control block, never the object |
| Reference cycle: deadlock or leak? | Leak: counts never reach 0, destructors never run |
| How to access through a `weak_ptr`? | `if (auto sp = w.lock())` |
| Why not `expired()` then `lock()`? | Race between the two calls |
| Why does `weak_ptr` have no `->`? | Access without ownership could hit a dead object |
| `lock()` on expired? | Empty `shared_ptr`, no exception |
| Why `enable_shared_from_this`? | `shared_ptr(this)` would create a second control block |
| `shared_from_this()` in constructor? | Throws `bad_weak_ptr` (C++17) |
| Capture in a stored callback? | `weak_ptr`; strong `self` only for external one-shot work |
| `weak_ptr` as a map key? | `std::owner_less<>` comparator |
| Raw pointer always bad? | No: fine for non-owning access with a guaranteed lifetime |
| `shared_ptr` refcount too hot? | Rethink ownership: single owner + observers, pools, explicit reclamation; measure |

#### new/delete, Placement New and Object Storage
| Question | Answer |
|---|---|
| `new` vs `operator new`? | Expression = allocate + construct; function = bytes only |
| Why `delete[]`? | Cookie and destructor count; mismatch is UB |
| Does `new` return null? | No, throws `bad_alloc` (except `nothrow`) |
| Constructor throws in `new`? | Memory freed automatically, no destructor |
| Does placement new allocate? | No; it constructs in your storage |
| Clean up placement new? | `std::destroy_at(p)`; never `delete p` |
| Same storage, new object: same object? | No, a new lifetime |
| What is `std::launder` for? | Getting a usable pointer to a new object in reused storage |
| Cast recv buffer to struct? | Use `memcpy` / `bit_cast` / C++23 `start_lifetime_as`; mind alignment and endianness |
| Is `malloc` slow? | Usually a fast tcache pop; the problem is unpredictable slow paths (tail latency) |
| RSS grows but no leak? | Retention: heap top pinned, capacity kept, unbounded queues, caches, arenas |
| `destroy_at` / `construct_at`? | C++17 / C++20 |

#### Memory Pools and Polymorphic Allocators (PMR)
- "A pool trades generality for predictability: bounded hot-path work, no surprise page faults, bounded memory."
- "Storage exists is not object exists: construct on acquire, destroy on release, keep the storage."
- "A bounded pool needs an exhaustion policy, and that decision matters more than the free list."
- "PMR separates what a container stores from where its memory comes from, at run time, without changing the type."
- "Monotonic: bump allocation, no individual free, release everything together; perfect when lifetimes are grouped."
- "Pool resources reuse freed blocks per size class; synchronized for sharing, unsynchronized for one thread."
- "Use `null_memory_resource()` upstream if the buffer must be a hard bound."
- "pmr::vector of std::string leaks out of the arena; use pmr types all the way down."
- "Copying a pmr container goes to the default resource; pass the resource explicitly."
- "The resource must outlive every container that uses it: declare it first."

#### Alignment, Padding and Data Layout
- "Members go at multiples of their alignment; the struct's size is rounded to a multiple of its alignment so arrays stay aligned."
- "Alignment is not size: `alignof`, not `sizeof`, decides valid addresses."
- "Sort members by decreasing alignment to cut padding, unless hot/cold grouping or ABI says otherwise."
- "`alignas` only raises alignment; packing lowers it and makes members misaligned."
- "Misaligned access is UB even if x86 tolerates it; copy bytes out with `memcpy`."
- "Padding bytes are unspecified: never `memcmp` or hash a padded struct."
- "Empty members cost a byte plus padding; use a base or `[[no_unique_address]]`."
- "Adjacent bit-fields are one memory location: two threads writing different fields is a data race."
- "`alignas(64)` separates hot variables written by different threads: false sharing is a layout bug."
