## TOPIC: new/delete, Placement New and Object Storage

### THEORY_SECTION: Core Concepts

#### 1. Mental model
- Two separate things always exist: **storage** (bytes with an address) and an **object** (a typed thing whose **lifetime** begins when construction completes and ends when its destructor starts).
- Storage can exist without an object (a raw buffer), and many objects can live in the same storage one after another.
- `new T(args)` (the **new-expression**) does two steps:
  1. Calls an **allocation function** `operator new(sizeof(T))` to get raw storage.
  2. Constructs a `T` in that storage.
- `delete p` (the **delete-expression**) does the reverse:
  1. Calls `p->~T()` (destructor).
  2. Calls a **deallocation function** `operator delete(p)` to return the storage.
- `operator new` / `operator delete` are just functions that hand out and take back bytes, like `malloc` / `free`. They know nothing about types or constructors.
- Placement new is the new-expression **without step 1**: you supply the storage, it only constructs. The matching manual cleanup is an explicit destructor call **without** deallocation.
- Everything in this topic (pairing rules, pools, `std::launder`, wire buffers) follows from keeping storage and object lifetime apart.

#### 2. new/delete pairing rules
| Acquired with | Release with | Mismatch |
|---|---|---|
| `new T` | `delete p` | UB |
| `new T[n]` | `delete[] p` | UB (`delete` on array, or `delete[]` on single) |
| `malloc` / `calloc` / `realloc` | `free` | UB with `delete` |
| `new (buf) T` (placement) | `p->~T()` / `std::destroy_at(p)` only | `delete p` is UB |
| `operator new(n)` (raw call) | `operator delete(p)` | No constructors or destructors run |

- Why `delete[]` must match `new[]`:
  - For a type with a non-trivial destructor, `new T[n]` asks for **extra bytes** (an "array cookie", 8 bytes in the Itanium ABI used by GCC/Clang) and stores `n` there so `delete[]` knows how many destructors to run.
  - Measured: `new D[3]` for a 1-byte class with a destructor requested 11 bytes (3 + 8).
  - `delete` on that pointer runs one destructor and passes the wrong address to the deallocator: heap corruption or a crash. For trivially destructible types it often "works", which is why the bug survives code review. ASan reports `alloc-dealloc-mismatch`.
- Mixing `malloc` and `delete` (or `new` and `free`) is UB even if the default `operator new` happens to call `malloc`: a replaced `operator new`, a different allocator, or a cookie breaks it. And `malloc` never runs constructors.
- `delete nullptr` and `delete[] nullptr` are no-ops: never write `if (p) delete p;`.
- Deleting twice, or deleting a pointer not from `new`, is UB (ASan: `double-free`, `bad-free`).
- In modern code you rarely write `delete` at all: `std::make_unique`, containers and RAII (topics 05, 06) do it. Knowing the rules still matters for pools, custom allocators and reviewing legacy code.

#### 3. Initialization forms and failure
- `new T` default-initializes: for `int` or a class with a trivial default constructor, members are **indeterminate**; reading them is UB.
- `new T()` and `new T{}` value-initialize: zero for scalars and for members of classes whose default constructor is not user-provided.
- `new int[5]()` zeroes the array; `new int[5]` does not.
- On failure, the ordinary `operator new` **throws `std::bad_alloc`**; it never returns `nullptr`. So `if (!p)` after a plain `new` is dead code.
- `new (std::nothrow) T` returns `nullptr` on failure instead (but a throwing constructor still throws).
- `new T[n]` with a negative or absurd `n` throws `std::bad_array_new_length` (derived from `bad_alloc`).
- **new_handler**: `std::set_new_handler(h)`. When allocation fails, `operator new` calls `h()` and retries, in a loop. The handler must do one of: free some memory (e.g. release a reserve block), install a different handler, throw `bad_alloc`, or terminate. With no handler installed, `bad_alloc` is thrown.
- Linux reality: with overcommit (the default), `new` of a few GB usually **succeeds**; physical pages are assigned on first touch, and real exhaustion is handled by the OOM killer, not by `bad_alloc`. Only impossible requests (larger than the address space or overcommit heuristics allow) fail immediately.
- If the constructor throws, the new-expression calls the **matching** `operator delete` automatically, so no memory leaks; the object never existed, so no destructor runs.

#### 4. Overloading and replacing operator new
- **Class-specific** `static void* operator new(std::size_t)` / `operator delete(void*)` (implicitly `static`): used by `new T` / `delete p` for that class and its derived classes (which pass their own, larger size).
  - Typical use: route a hot type to a pool or free list (pool design in topic 11).
  - Not used by `new T[n]` unless you also define `operator new[]`; not used by `::new T` (global scope qualifier); **not used by `std::make_shared` / `std::allocate_shared`**, which allocate the control block plus object through `std::allocator` (verified: the class `operator new` was not called).
  - If you define `operator new`, define the matching `operator delete`: when a constructor throws, the new-expression looks for the matching deallocation function.
- **Global replacement**: define `void* operator new(std::size_t)` and `void operator delete(void*) noexcept` (and preferably the sized, array and aligned forms) in one translation unit. The linker uses yours for the whole program, including the standard library.
  - Uses: counting allocations in tests ("this hot path performs zero allocations"), routing to jemalloc/tcmalloc/mimalloc, adding guards or statistics.
  - Rules: must not return `nullptr` (throw `bad_alloc`), must handle size 0 (return a unique non-null pointer), must not use `std::cout` or anything that allocates before it is set up.
- **Placement forms with extra arguments**: `void* operator new(std::size_t, Arena&)`, called as `new (arena) T(args)`. If the constructor throws, the compiler calls the matching `operator delete(void*, Arena&)`; if none exists, the memory leaks silently.
- **Sized deallocation (C++14)**: `operator delete(void*, std::size_t)` receives the object size, so the allocator can skip a size lookup. With a virtual destructor, deleting through `Base*` passes the **dynamic** type's size.
- **Destroying delete (C++20)**: `void operator delete(T*, std::destroying_delete_t)` takes over both destruction and deallocation (used for variable-sized objects); rare in interviews.

#### 5. Over-aligned types and aligned new (C++17)
- `__STDCPP_DEFAULT_NEW_ALIGNMENT__` (16 on x86-64 GCC/Clang) is the alignment ordinary `operator new` guarantees.
- Before C++17, `new` of `struct alignas(64) Line { ... };` was **not** guaranteed to be 64-byte aligned: a silent bug for cache-line-padded structures and SIMD types.
- C++17: for types with alignment above that value, the new-expression calls `operator new(std::size_t, std::align_val_t)`, and `delete` calls `operator delete(void*, std::align_val_t)`. `std::allocator` (so `std::vector<Line>`) does the same.
- If you replace or overload `operator new` for such types, provide the `align_val_t` overloads too.
- Raw aligned buffers: `alignas(T) std::byte buf[sizeof(T)]`, or `std::aligned_alloc(align, size)` (release with `free`; C11 required `size` to be a multiple of `align`, C17 (DR 460) relaxed that, but rounding `size` up is still the portable choice). `std::aligned_storage` is deprecated in C++23: use `alignas` on a byte array.

#### 6. Placement new and explicit destruction
- Syntax: `T* p = ::new (static_cast<void*>(addr)) T(args);` (the plain `new (addr) T(args)` form is fine for ordinary types; the `::` and `void*` cast guard against class overloads in generic code).
- It performs **no allocation**; the standard `operator new(std::size_t, void*)` just returns `addr`.
- Requirements on the storage: at least `sizeof(T)` bytes, aligned to `alignof(T)`, and not holding a live object you still need (constructing over a live non-trivial object without destroying it first skips its destructor: leaks).
- Use the **pointer returned** by placement new to access the object (see section 7 for why).
- Ending the lifetime: `p->~T();` or `std::destroy_at(p);` (C++17). Never `delete p`: the storage did not come from `operator new(sizeof(T))` (stack buffer: ASan `bad-free`; pool slot: corrupts the pool).
- For trivially destructible types the destructor call is optional, but writing `std::destroy_at` keeps generic code correct.
- Standard helpers in `<memory>`:

| Helper | Since | Does |
|---|---|---|
| `std::destroy_at(p)` | C++17 | `p->~T()` (arrays: destroys elements, C++20) |
| `std::destroy(first, last)`, `std::destroy_n(first, n)` | C++17 | Destroy a range |
| `std::construct_at(p, args...)` | C++20 | `::new (voidify(p)) T(args...)`, usable in `constexpr` |
| `std::uninitialized_copy/move/fill(_n)` | C++98/17 | Construct into raw memory; destroy what was built if one constructor throws |
| `std::uninitialized_default_construct(_n)`, `std::uninitialized_value_construct(_n)` | C++17 | Default/value-construct a range in raw memory |

- `std::construct_at` exists mostly for `constexpr` (placement new is not allowed in constant evaluation until C++26) and for allocator-aware generic code.
- Array placement new `new (buf) T[n]` historically allowed an unspecified extra overhead (a cookie) beyond `n * sizeof(T)`, so `buf` could overflow; CWG 2382 removed this for the non-allocating form. Prefer a loop or `std::uninitialized_value_construct_n` anyway.
- Exception safety when constructing several objects manually: if the k-th constructor throws, destroy the first k-1. The `uninitialized_*` algorithms do this for you.

#### 7. Storage reuse and std::launder (C++17)
- After `p->~T(); new (buf) T(...);`, the new object is a **different object** in the same storage, even if the address and type are the same. Same address does not mean same object (relevant to ABA reasoning too).
- When may the **old** pointer `p` be used to reach the new object? Only if the new object **transparently replaces** the old one ([basic.life]): same storage, same type (ignoring cv), the old object was not a `const` complete object, and neither is a base-class subobject or `[[no_unique_address]]` member.
  - C++17 also excluded types with `const` or reference **members**: reusing a `struct { const int id; }` through the old pointer was UB, and `std::launder(p)` was required. C++20 removed that restriction.
- `reinterpret_cast<T*>(buf)` where `buf` is a byte array does **not** give a pointer to the `T` that placement new created there: it is a pointer to the bytes with a different type. Formally you need `std::launder(reinterpret_cast<T*>(buf))`. Practical rule: keep and use the pointer returned by placement new (or `construct_at`).
- `std::launder(p)` returns a pointer to the object that currently lives at address `p`. It changes no bits; it tells the optimizer not to assume the old object's values (for example a cached `const` member or vtable pointer).
- Where it matters in practice: containers with inline storage (`optional`, `variant`, small-buffer vectors) that recreate objects in a member byte array.

#### 8. Implicit-lifetime types and wire buffers
- **Implicit-lifetime types** (C++20, P0593; [class.prop]): scalars, arrays, and implicit-lifetime classes, which are either aggregates (whose destructor is not user-provided, per CWG 2605) or classes with at least one trivial eligible constructor and a trivial, non-deleted destructor (e.g. a plain `struct Header { std::uint32_t seq; std::uint16_t len; };`).
- Some operations **implicitly create** such objects in storage if that gives the program defined behaviour: `std::malloc`, `operator new`, `std::allocator::allocate`, `std::memcpy`/`memmove`, and starting the lifetime of an `unsigned char` or `std::byte` array. This blessed the long-standing C idiom `auto* h = static_cast<Header*>(std::malloc(sizeof(Header))); h->seq = 1;` (it was technically UB before; applied as a defect report).
- Network or file bytes are a different matter: `reinterpret_cast<const Header*>(rx_buf + offset)` has several problems at once:
  - Object model: no `Header` object was created there by the C++ program (formally UB).
  - Strict aliasing: reading `char` bytes as `uint32_t` violates the aliasing rules unless an object of that type lives there (only `char`, `unsigned char` and `std::byte` may alias anything).
  - Alignment: `offset` may be odd; misaligned access is UB (traps on some CPUs; UBSan reports it).
  - Layout: padding and endianness must match the wire format exactly.
- Correct options:
  - `std::memcpy(&h, rx_buf + offset, sizeof h);`: well defined, alignment-free; compilers turn it into a plain load (no call) at `-O2`.
  - `std::bit_cast<To>(from)` (C++20): reinterpret the bytes of one trivially copyable value as another of the same size (`float` ↔ `uint32_t`, `std::array<std::byte, 8>` → `double`). `constexpr`, compile error if sizes differ.
  - `std::start_lifetime_as<T>(p)` (C++23): explicitly starts the lifetime of an implicit-lifetime `T` over existing bytes, keeping their values, with no copy. Library support is still limited (not in GCC 11's libstdc++ used for this chapter).
- Still convert byte order (`std::byteswap` in C++23, `ntohl`, or `std::endian` checks in C++20) and validate lengths before trusting any field.

#### 9. What malloc really costs (glibc, typical Linux)
- C++ says nothing about speed; everything below is implementation behaviour (glibc 2.35, x86-64).
- `new` → `operator new` → `malloc`. The path a call takes is not predictable from the call site:

| Path | When | Cost (order of magnitude) |
|---|---|---|
| **tcache** hit | Small sizes (up to 1032 bytes by default), per-thread cache of up to 7 freed chunks per size class | Tens of ns, no lock |
| Arena bins (fastbins, small/large bins) | tcache empty or full | Lock on the arena, bin search, possible coalescing |
| Grow heap with `brk`/`sbrk` (main arena) | No suitable free chunk | System call |
| `mmap` a dedicated region | Request ≥ mmap threshold (128 KiB default, adapts upward to 32 MiB) | System call; `free` does `munmap` immediately |
| First touch of a new page | After any of the growth paths | Page fault + kernel zeroes the page (µs level per page) |

- Threads: glibc creates additional **arenas** under contention (up to 8 × cores on 64-bit) so threads rarely share one lock, at the cost of more memory spread across arenas.
- Cross-thread free (allocate in producer, free in consumer) pushes chunks into another thread's arena or tcache: more locking and worse locality.
- `free` is not free either: coalescing neighbours, trimming the top of the heap, `munmap` (which on multi-threaded processes may need TLB shootdowns across cores).
- Low-latency conclusion: the problem is **variance** (tail latency), not the average. A hot path that is fast 99.9 % of the time and occasionally hits a syscall plus page faults ruins p99.9. Remedies: preallocate and reuse (reserve, pools, arenas, `std::pmr`, topic 11), pre-fault memory at startup (touch pages, `mlock`), replace the allocator (jemalloc, tcmalloc, mimalloc), and verify with an allocation-counting `operator new` in tests.
- ❌ "Every `new` takes a lock and makes a system call." ✅ The common small-allocation path is a user-space tcache pop; the expensive paths are rare but unpredictable.

#### 10. Fragmentation and RSS growth without a leak
- **External fragmentation**: plenty of free bytes in total, but split into holes too small or badly placed to satisfy a request (or to give back to the OS).
- **Internal fragmentation**: the allocator hands out more than requested (size classes, 16-byte alignment, chunk headers: a 24-byte request uses a 32-byte chunk).
- Why RSS stays high after `free` (glibc): the heap can only shrink from the top. One live block near the top pins everything below it; freed chunks inside the heap stay mapped (and counted in RSS) until `malloc_trim` or reuse. Measured: 200 000 × 256 B blocks (about 55 MB RSS), all freed except the last one: RSS unchanged; after `malloc_trim(0)` it dropped back to about 5 MB.
- Other causes of "growing memory, no leak":
  - Containers keep their capacity: a `vector` that once held 10 million elements keeps that buffer after `clear()` (`shrink_to_fit` or swap with an empty vector).
  - Unbounded queues/backlogs during bursts, caches without eviction, pools that grow to their high-water mark and never shrink.
  - Objects still reachable but retained longer than intended (a `shared_ptr` held in a map, a `weak_ptr` pinning a `make_shared` block: topic 07/09).
  - Per-thread arenas each holding their own free memory.
- Investigation: track RSS over time against workload; heap profilers (heaptrack, massif, jemalloc/tcmalloc profiling); `malloc_info`/`malloc_stats`; container sizes and capacities; pool high-water marks. Valgrind/LSan find leaks, not retention.

#### 11. Misconceptions to unlearn
- ❌ "`new` and `operator new` are the same thing." ✅ The new-expression allocates via `operator new` **and** constructs; `operator new` only allocates.
- ❌ "`new` returns `nullptr` when memory runs out." ✅ It throws `std::bad_alloc`; only `new (std::nothrow)` returns null. On Linux it often succeeds and the OOM killer acts later.
- ❌ "`delete` on an array just leaks the other elements." ✅ It is UB: wrong destructor count and wrong address passed to the deallocator.
- ❌ "Placement new allocates in the buffer." ✅ It allocates nothing; it constructs in storage you own.
- ❌ "After placement new, `delete p` cleans up." ✅ Call the destructor (`std::destroy_at`); the storage owner releases the storage.
- ❌ "Same address, same type: it's the same object." ✅ A new lifetime is a new object; old pointers are only valid under the transparent-replacement rules.
- ❌ "Casting the receive buffer to a struct pointer is fine." ✅ Aliasing, alignment, object lifetime and endianness all bite; use `memcpy`, `bit_cast` or `start_lifetime_as`.
- ❌ "Class `operator new` controls every allocation of that class." ✅ Not `make_shared`, not `::new`, not arrays without `operator new[]`.
- ❌ "`destroy_at` is C++20." ✅ `destroy_at` is C++17; `construct_at` is C++20.
- ❌ "RSS growing means a leak." ✅ Retention, fragmentation, capacity and unbounded queues grow RSS with every allocation correctly freed.

### EDGE_CASES: Traps and Misconceptions

#### Edge Case 1: delete on memory from new[]
- `auto* p = new Order[3]; delete p;` compiles silently.
- For types with destructors the pointer returned by `new[]` is 8 bytes past the real allocation (after the cookie), so `delete` runs one destructor and passes a wrong address to `operator delete`. Measured: glibc aborted with "munmap_chunk(): invalid pointer"; ASan: "attempting free on address which was not malloc()-ed". GCC 11 even warns at compile time: "'operator delete' called on pointer with nonzero offset 8 [-Wfree-nonheap-object]".
- For `new int[3]; delete p;` there is no cookie and it may appear to work: still UB, and ASan reports `alloc-dealloc-mismatch (operator new [] vs operator delete)`.
- Fix: `delete[]`, or better `std::vector` / `std::unique_ptr<T[]>`.

#### Edge Case 2: delete on a placement-new object
- `alignas(T) std::byte buf[sizeof(T)]; T* p = new (buf) T; delete p;` runs the destructor, then frees a stack address: crash. ASan: "attempting free on address which was not malloc()-ed".
- In a pool the same mistake hands a slot inside the pool's block to `free`, corrupting the heap.
- Fix: `std::destroy_at(p);` and let the owner of `buf` manage the storage.

#### Edge Case 3: Forgetting the destructor after placement new
- Constructing a `std::string` (or any resource owner) in a buffer and later just reusing or discarding the buffer leaks whatever the object owned.
- A long string's heap buffer is reported by LeakSanitizer as a direct leak; a short (SSO) string leaks nothing visible, which hides the bug in tests with short data.
- Constructing a second object over a live one has the same effect: the first destructor never runs.

#### Edge Case 4: Misaligned storage
- `unsigned char buf[sizeof(T)];` has alignment 1. Placement new into it (or into `buf + 1`) can create a misaligned object: UB. UBSan: "constructor call on misaligned address ... which requires 4 byte alignment".
- On x86 most misaligned loads work (slower, and not atomic); on other architectures, or with SIMD/atomic instructions, they trap.
- Fix: `alignas(T) std::byte buf[sizeof(T)];`, or align offsets inside a pool to `alignof(T)`.

#### Edge Case 5: A throwing constructor and custom placement forms
- With ordinary `new T`, a throwing constructor causes `operator delete` to be called automatically: no leak.
- With `new (arena) T` using a custom `operator new(std::size_t, Arena&)`, the compiler calls `operator delete(void*, Arena&)` only if you declared it. Without it, nothing is called (the memory leaks from the arena) and there is no warning.
- The non-allocating `new (void*) T` needs nothing: there is no memory to give back.

#### Edge Case 6: Class operator new is bypassed
- `std::make_shared<T>()` allocates control block + object through `std::allocator`: `T::operator new` is not called.
- `new T[n]` uses `T::operator new[]` if declared, otherwise the global one.
- `::new T` explicitly selects the global allocation function.
- If the class allocator exists for correctness (e.g. shared memory, a special heap), these bypasses are bugs: use `std::allocate_shared` with a matching allocator, or `= delete` the array forms.

#### Edge Case 7: Reusing storage and reading through the old pointer
- `X* p = new (buf) X{1}; p->~X(); new (buf) X{2}; use(p->n);`
  - If `X` has a `const` (or reference) member: UB in C++17 without `std::launder(p)`; allowed in C++20 (transparent replacement).
  - Through `reinterpret_cast<X*>(buf)`: needs `std::launder` in every version.
- In practice compilers rarely miscompile simple cases, which is why the bug is hard to demonstrate; the rule matters in generic containers with inline storage.
- Fix: keep the pointer returned by the newest placement new.

#### Edge Case 8: if (p == nullptr) after new
- `int* p = new int[n]; if (!p) return error;` never takes the error branch: plain `new` throws.
- The opposite mistake: `new (std::nothrow) T` and no null check.
- On Linux, `new char[8ULL << 30]` (8 GiB) typically succeeds on a 16 GB machine because of overcommit; failure shows up later as an OOM kill when pages are touched.

#### Edge Case 9: Implicit object creation is not a license for any cast
- `malloc` then use as `Header*` is fine (C++20 implicit object creation for implicit-lifetime types).
- `malloc` then use as `std::string*` is not: `std::string` is not an implicit-lifetime type; its constructor must run (placement new).
- A `char` array (not `unsigned char` / `std::byte`) does not provide storage for implicit object creation.

### CODE_EXAMPLES: Practical Demonstrations

#### Example 1: Tracing a new-expression: allocate, construct, and cleanup on throw
- A class-specific `operator new`/`operator delete` makes the two steps visible, including the automatic deallocation when the constructor throws.
```cpp
#include <cstddef>
#include <iostream>
#include <new>
#include <stdexcept>

struct Order {
    int qty;
    explicit Order(int q) : qty(q) {
        std::cout << "  ctor qty=" << q << '\n';
        if (q < 0) throw std::invalid_argument("negative qty");
    }
    ~Order() { std::cout << "  dtor\n"; }
    static void* operator new(std::size_t n) {
        std::cout << "  operator new(" << n << ")\n";
        return ::operator new(n);
    }
    static void operator delete(void* p) noexcept {
        std::cout << "  operator delete\n";
        ::operator delete(p);
    }
};

int main() {
    std::cout << "new Order(5):\n";
    Order* p = new Order(5);
    std::cout << "delete p:\n";
    delete p;
    std::cout << "new Order(-1):\n";
    try {
        Order* q = new Order(-1);
        delete q;
    } catch (const std::exception& e) {
        std::cout << "  caught: " << e.what() << '\n';
    }
}
```
- Output:
```
new Order(5):
  operator new(4)
  ctor qty=5
delete p:
  dtor
  operator delete
new Order(-1):
  operator new(4)
  ctor qty=-1
  operator delete
  caught: negative qty
```
- The throwing case shows no `dtor`: the object never finished construction, so its lifetime never began. The memory is still returned.

#### Example 2: Counting allocations with a replaced global operator new
- A test harness to prove a hot path does not allocate; also shows growth and SSO.
```cpp
#include <cstdlib>
#include <iostream>
#include <new>
#include <string>
#include <vector>

static long g_allocs = 0;

void* operator new(std::size_t n) {
    ++g_allocs;
    if (void* p = std::malloc(n ? n : 1)) return p;
    throw std::bad_alloc{};
}
void operator delete(void* p) noexcept { std::free(p); }
void operator delete(void* p, std::size_t) noexcept { std::free(p); }

template <class F>
long count_allocs(F f) {
    long before = g_allocs;
    f();
    return g_allocs - before;
}

int main() {
    std::cout << "push_back x1000: " << count_allocs([] {
        std::vector<int> v;
        for (int i = 0; i < 1000; ++i) v.push_back(i);
    }) << '\n';
    std::cout << "reserve + push_back x1000: " << count_allocs([] {
        std::vector<int> v;
        v.reserve(1000);
        for (int i = 0; i < 1000; ++i) v.push_back(i);
    }) << '\n';
    std::cout << "string(15): " << count_allocs([] { std::string s(15, 'x'); }) << '\n';
    std::cout << "string(16): " << count_allocs([] { std::string s(16, 'x'); }) << '\n';
}
```
- Output (libstdc++, growth factor 2, SSO capacity 15):
```
push_back x1000: 11
reserve + push_back x1000: 1
string(15): 0
string(16): 1
```
- 11 allocations = capacities 1, 2, 4, ..., 1024.
- A real harness also replaces the array and aligned forms, and uses no allocating code (like `std::cout`) inside `operator new`.

#### Example 3: Placement new lifecycle in an aligned buffer
- Two objects, one after another, in the same storage; explicit destruction; C++17/20 helpers.
```cpp
#include <cstddef>
#include <iostream>
#include <memory>
#include <new>
#include <string>

struct Order {
    int id;
    std::string sym;
    Order(int i, std::string s) : id(i), sym(std::move(s)) {
        std::cout << "construct " << id << ' ' << sym << '\n';
    }
    ~Order() { std::cout << "destroy " << id << '\n'; }
};

int main() {
    alignas(Order) std::byte storage[sizeof(Order)];   // storage, no object yet

    Order* p = new (storage) Order(10, "a long symbol name, heap allocated");
    std::cout << "same address: " << (static_cast<void*>(p) == storage) << '\n';
    std::destroy_at(p);                                 // C++17: p->~Order()

    Order* q = std::construct_at(reinterpret_cast<Order*>(storage), 20, "ES"); // C++20
    std::cout << "q->id=" << q->id << " (new object, same storage)\n";
    q->~Order();                                        // equivalent manual form
}
```
- Output:
```
construct 10 a long symbol name, heap allocated
same address: 1
destroy 10
construct 20 ES
q->id=20 (new object, same storage)
destroy 20
```
- Skipping `std::destroy_at(p)` leaks the long string's heap buffer (LeakSanitizer: direct leak).
- `delete p` instead would try to free a stack address.
- Access goes through `p` and `q` (returned by the construction), not through a cast of `storage`.

#### Example 4: A minimal optional-like holder: inline storage done right
- Inline storage, explicit lifetime tracking, destruction in the destructor, copy via placement new.
```cpp
#include <cstddef>
#include <iostream>
#include <memory>
#include <new>
#include <string>
#include <utility>

template <class T>
class Maybe {
    alignas(T) std::byte buf_[sizeof(T)];
    T* obj_ = nullptr;                        // pointer returned by construction
public:
    Maybe() = default;
    Maybe(const Maybe& o) {
        if (o.obj_) obj_ = ::new (static_cast<void*>(buf_)) T(*o.obj_);
    }
    Maybe& operator=(const Maybe&) = delete;  // kept short for the example
    ~Maybe() { reset(); }

    template <class... A>
    T& emplace(A&&... a) {
        reset();                              // end the old lifetime first
        obj_ = ::new (static_cast<void*>(buf_)) T(std::forward<A>(a)...);
        return *obj_;
    }
    void reset() {
        if (obj_) { std::destroy_at(obj_); obj_ = nullptr; }
    }
    explicit operator bool() const { return obj_ != nullptr; }
    T& operator*() { return *obj_; }
};

int main() {
    Maybe<std::string> m;
    std::cout << "engaged: " << bool(m) << '\n';
    m.emplace(40, 'x');                       // long string: owns heap memory
    m.emplace("short");                       // destroys the 40-char string first
    Maybe<std::string> copy = m;
    m.reset();
    std::cout << "copy: " << *copy << ", m engaged: " << bool(m) << '\n';
}
```
- Output:
```
engaged: 0
copy: short, m engaged: 0
```
- ASan/LSan clean: every constructed string is destroyed exactly once.
- Storing the returned `T*` avoids the `std::launder` question entirely (section 7). `std::optional` does essentially this with a `union` member instead of a byte array.
- If the constructor in `emplace` throws, `obj_` stays `nullptr` (it was reset first), so the holder stays consistent: basic guarantee.

#### Example 5: Aligned new (C++17) and sized delete
- The compiler picks the `align_val_t` overload for over-aligned types; sized delete receives the dynamic size through a virtual destructor.
```cpp
#include <cstddef>
#include <cstdint>
#include <iostream>
#include <new>

struct alignas(64) CacheLine {
    char data[64];
    static void* operator new(std::size_t n, std::align_val_t a) {
        std::cout << "aligned new(" << n << ", " << static_cast<std::size_t>(a) << ")\n";
        return ::operator new(n, a);
    }
    static void operator delete(void* p, std::align_val_t a) noexcept {
        std::cout << "aligned delete\n";
        ::operator delete(p, a);
    }
};

struct Base {
    virtual ~Base() = default;
    static void operator delete(void* p, std::size_t n) noexcept {
        std::cout << "sized delete(" << n << ")\n";
        ::operator delete(p);
    }
};
struct Derived : Base { double payload[4]; };

int main() {
    std::cout << "default new alignment: " << __STDCPP_DEFAULT_NEW_ALIGNMENT__ << '\n';
    auto* c = new CacheLine;
    auto addr = reinterpret_cast<std::uintptr_t>(c);
    std::cout << "64-aligned: " << (addr % 64 == 0) << '\n';
    delete c;
    Base* b = new Derived;
    delete b;                       // size of Derived, found via the virtual dtor
}
```
- Output (x86-64, GCC):
```
default new alignment: 16
aligned new(64, 64)
64-aligned: 1
aligned delete
sized delete(40)
```
- `sizeof(Derived)` is 40: vptr (8) + 4 doubles (32).

#### Example 6: Parsing a wire buffer: memcpy and bit_cast instead of reinterpret_cast
- Bytes at an odd offset in a receive buffer; well-defined extraction.
```cpp
#include <array>
#include <bit>
#include <cstddef>
#include <cstdint>
#include <cstring>
#include <iostream>

struct Header {                 // implicit-lifetime, trivially copyable
    std::uint32_t seq;
    std::uint16_t len;
    std::uint16_t type;
};

int main() {
    unsigned char rx[64] = {};
    const std::size_t off = 3;                      // misaligned for uint32_t
    Header sent{1001, 24, 7};
    std::memcpy(rx + off, &sent, sizeof sent);      // pretend this came from recv()

    // UB (lifetime, aliasing, alignment):
    // Header* h = reinterpret_cast<Header*>(rx + off);
    Header h;
    std::memcpy(&h, rx + off, sizeof h);            // defined; a plain load at -O2
    std::cout << "seq=" << h.seq << " len=" << h.len << " type=" << h.type << '\n';

    float f = 1.0f;
    auto bits = std::bit_cast<std::uint32_t>(f);    // C++20, same size required
    std::cout << std::hex << "1.0f bits=0x" << bits << '\n';

    std::array<unsigned char, 4> raw{};
    std::memcpy(raw.data(), rx + off, 4);
    auto seq = std::bit_cast<std::uint32_t>(raw);
    std::cout << std::dec << "seq via bit_cast=" << seq << '\n';
}
```
- Output (little-endian x86-64; a real protocol also converts byte order):
```
seq=1001 len=24 type=7
1.0f bits=0x3f800000
seq via bit_cast=1001
```
- Under UBSan the commented-out cast followed by `h->seq` reports "member access within misaligned address ... for type 'struct Header', which requires 4 byte alignment".
- C++23 `std::start_lifetime_as<Header>(rx + off)` would make an aligned in-place view legal without copying (alignment is still required).

#### Example 7: RSS stays high after free (glibc)
- Many small blocks freed except one near the top of the heap; then `malloc_trim`; a large block uses `mmap`.
```cpp
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <iostream>
#include <malloc.h>
#include <string>
#include <vector>

long rss_kb() {
    std::ifstream f("/proc/self/status");
    std::string line;
    while (std::getline(f, line))
        if (line.rfind("VmRSS:", 0) == 0) return std::stol(line.substr(6));
    return -1;
}

int main() {
    std::cout << "start            RSS " << rss_kb() << " kB\n";
    std::vector<char*> blocks;
    for (int i = 0; i < 200000; ++i) {
        char* p = static_cast<char*>(std::malloc(256));
        std::memset(p, 1, 256);
        blocks.push_back(p);
    }
    std::cout << "200k x 256 B     RSS " << rss_kb() << " kB\n";
    for (std::size_t i = 0; i + 1 < blocks.size(); ++i) std::free(blocks[i]);
    std::cout << "freed all but 1  RSS " << rss_kb() << " kB\n";
    malloc_trim(0);                                  // glibc extension
    std::cout << "malloc_trim(0)   RSS " << rss_kb() << " kB\n";
    std::free(blocks.back());

    void* big = std::malloc(64 << 20);               // above mmap threshold
    std::cout << "malloc 64 MiB    RSS " << rss_kb() << " kB (not touched)\n";
    std::memset(big, 1, 64 << 20);                   // page faults happen here
    std::cout << "touched          RSS " << rss_kb() << " kB\n";
    std::free(big);                                  // munmap: returned at once
    std::cout << "free 64 MiB      RSS " << rss_kb() << " kB\n";
}
```
- Output (one run, glibc 2.35 x86-64; exact numbers vary):
```
start            RSS 3344 kB
200k x 256 B     RSS 58084 kB
freed all but 1  RSS 58088 kB
malloc_trim(0)   RSS 4968 kB
malloc 64 MiB    RSS 4972 kB (not touched)
touched          RSS 70508 kB
free 64 MiB      RSS 4968 kB
```
- Every block was freed, yet RSS stayed at 58 MB: no leak, only retention behind one live block at the top of the heap.
- `malloc` of 64 MiB did not raise RSS; touching the pages did (page faults). This is why latency-sensitive systems pre-touch memory at startup.

### QUICK_REFERENCE: Cheat Sheet

#### Expression vs function
| You write | Allocation | Construction | Destruction | Deallocation |
|---|---|---|---|---|
| `new T(a)` | `operator new(sizeof(T))` | yes | | |
| `delete p` | | | `~T()` | `operator delete(p)` |
| `new T[n]` | `operator new[](n*sizeof(T) + cookie)` | n times | | |
| `delete[] p` | | | n times (reverse) | `operator delete[]` |
| `new (buf) T(a)` | none | yes | | |
| `std::destroy_at(p)` (C++17) | | | `~T()` | none |
| `std::construct_at(p, a)` (C++20) | none | yes | | |
| `operator new(n)` | yes | no | | |

#### Failure behaviour
| Form | On failure |
|---|---|
| `new T` | throws `std::bad_alloc` (after calling the new_handler in a loop) |
| `new (std::nothrow) T` | returns `nullptr` |
| `new T[bad_n]` | throws `std::bad_array_new_length` |
| Constructor throws | memory released via matching `operator delete`, no destructor |
| Linux overcommit | big `new` may succeed; OOM killer later |

#### Standard versions
| Feature | Since |
|---|---|
| Sized `operator delete(void*, size_t)` | C++14 |
| Aligned new (`std::align_val_t`) | C++17 |
| `std::launder`, `std::destroy_at`, `std::destroy(_n)`, `uninitialized_*_construct` | C++17 |
| `std::construct_at`, `std::bit_cast`, implicit object creation, destroying delete | C++20 |
| `std::start_lifetime_as`, `std::byteswap`; `std::aligned_storage` deprecated | C++23 |

#### glibc malloc facts (not guaranteed by C++)
| Fact | Value |
|---|---|
| Default `new` alignment | 16 bytes |
| tcache | per thread, up to 7 chunks per size class, sizes up to 1032 bytes |
| mmap threshold | 128 KiB default, adapts upward (max 32 MiB) |
| Arenas | up to 8 × cores (64-bit) |
| Array cookie | 8 bytes for types with non-trivial destructors (Itanium ABI) |
| Heap trimming | Only from the top; `malloc_trim(0)` also releases free pages inside |

#### Interview one-liners
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
