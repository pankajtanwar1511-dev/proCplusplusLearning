## TOPIC: Memory Pools and Polymorphic Allocators (PMR)

### THEORY_SECTION: Core Concepts

#### 1. Mental model
- A general-purpose allocator (`operator new` / `malloc`) must serve any size, any lifetime, any thread. That generality costs bookkeeping and makes the cost of one call **unpredictable**.
- A **pool** or **arena** exploits something you know about the workload:
  - **Fixed size**: all objects are the same type (orders, messages) → a fixed-size object pool with a free list.
  - **Grouped lifetime**: everything allocated while handling one request/packet/frame dies together → an arena (bump allocator), freed in one step.
  - **Known thread ownership**: one thread allocates and frees → no synchronization at all.
- Two separate things are managed, and every design must keep them apart:
  - **Storage**: raw bytes owned by the pool for its whole life.
  - **Object lifetime**: starts at construction in a slot (placement new, see topic 10) and ends at the explicit destructor call. "Storage exists" is not "object exists".
- `std::pmr` (C++17, header `<memory_resource>`) standardizes the "where does the memory come from" part:
  - `std::pmr::memory_resource`: an abstract class with virtual allocate/deallocate.
  - `std::pmr::polymorphic_allocator<T>`: an allocator that holds a `memory_resource*` and forwards to it.
  - `std::pmr::vector`, `std::pmr::string`, `std::pmr::map`, ...: ordinary containers whose allocator is `polymorphic_allocator`.
- The container's algorithm stays the same; only its allocation policy changes, chosen at **run time** without changing the container's type.
- The headline benefit is **predictability** (tail latency), not "faster on average". Always measure.

#### 2. Why general-purpose allocation hurts a hot path
- The fast path of a modern allocator is cheap (glibc per-thread tcache: tens of ns). The problem is that you cannot tell which path a call will take:
  - tcache/fastbin hit (user space, cheap),
  - arena search, splitting and coalescing of free chunks,
  - lock contention on a shared arena,
  - growing the heap (`brk`/`mmap`) and first-touch **page faults**,
  - `free` that consolidates or returns memory to the OS (`munmap`, trim).
- Result: good median, bad p99/p99.9. A pool moves the expensive work (getting and touching memory) to startup, so the hot path does a bounded amount of work.
- Other wins: fewer cache misses on allocator metadata, objects packed contiguously (locality), no fragmentation from mixed lifetimes, memory use bounded and visible.
- Do not overstate it: "every `new` is a system call" is false. Most allocations never enter the kernel. The argument is variance, not average cost.
- Allocator internals (tcache, arenas, RSS growth) are covered in topic 10.

#### 3. Designing a fixed-size object pool
- **Storage**: one block sized for N slots, allocated up front and suitably aligned:
  - `alignas(T) std::byte buf[N * sizeof(T)]`, or `::operator new(bytes, std::align_val_t{alignof(T)})` for over-aligned `T` (C++17).
  - Not `new T[N]`: that constructs N objects (runs N constructors) and ties slot lifetime to the array.
- **Slot address**: slot `i` is at `base + i * slot_size` bytes, not `base + i`. `slot_size` must be a multiple of `alignof(T)` (it is if you use `sizeof(T)`, which is always a multiple of `alignof(T)`).
- **Free list**:
  - Index-based: an array/stack of free indices (extra memory, simple).
  - **Intrusive**: a free slot stores the pointer to the next free slot inside its own bytes. No extra memory. Requires `slot_size >= sizeof(void*)` and pointer alignment; a `union Slot { Slot* next; alignas(T) std::byte obj[sizeof(T)]; };` gives both automatically.
- **Acquire** = pop free-list head + construct (placement new or `std::construct_at`); **release** = run `~T()` + push the slot. Both O(1), no search, no system call.
- **Release must not `delete`**: the storage belongs to the pool. `delete p` on a pooled object is UB (it was not allocated by a matching `new`).
- **Exception safety**: if the constructor throws after the slot was popped, push it back, otherwise the pool leaks a slot per failure.
- **Debug aids**: fill freed slots with a pattern, keep an in-use count, assert on double release, poison free slots under ASan (`ASAN_POISON_MEMORY_REGION`), assert all slots are free in the pool's destructor.
- **Handle type**: return `std::unique_ptr<T, PoolDeleter>` so release happens automatically (custom deleter, see topic 06). Raw `T*` handles invite leaks and double release.

#### 4. Sizing and the exhaustion policy
- A bounded pool is only a design once you answer: **what happens when all slots are in use?** Interviewers ask this more than they ask about the free list.

| Policy | Behaviour | When it fits |
|---|---|---|
| Fail fast | `create()` returns `nullptr` / error code; caller rejects the request | Order entry: reject and alert instead of slowing everything down |
| Drop | Discard the new item (or the oldest) and count drops | Market data you can recover by snapshot, telemetry |
| Block | Wait until a slot is released (condition variable) | Producer may be slowed down safely (back-pressure) |
| Fallback to heap | Allocate from `new`, mark it as "not pooled" | Correctness matters more than latency; spikes stay visible in metrics |
| Grow | Allocate another chunk of slots (never move existing ones) | Unknown peak; growth happens off the hot path or rarely |

- Size from **measured peak + headroom**, and export the high-water mark as a metric.
- Pre-fault the memory at startup (touch every page, or `mlock`) so the first use on the hot path does not take page faults.
- Silent fallback to the heap is the worst choice in a latency-critical path: the system "works" while p99 quietly degrades.

#### 5. Pools and threads
- A single shared free list touched by several threads:
  - With a mutex: correct, but every acquire/release serializes on one lock.
  - With an atomic head (CAS): lock-free, but the head's cache line bounces between cores, and a naive CAS pop suffers from **ABA** (see Chapter 4, lock-free and ABA). Still a contention hotspot.
- Usual answer: **per-thread pools** (`thread_local` pool or one pool per worker). No synchronization, no shared cache line.
- Per-thread pools raise the **cross-thread free** problem: object allocated by thread A and released by thread B. Options:
  - Ownership rule: only the owning thread releases (B sends the pointer back through a queue).
  - Remote-free list: B pushes onto A's lock-free "returned" stack; A drains it during its own acquires.
- **Reuse safety**: a slot may only be reused once no reader can still access it. With several consumers this is solved by **deferred reclamation** (per-consumer progress counters, epochs, hazard pointers): covered in Chapter 4.
- Pool bookkeeping (in-use counters per thread) should live on separate cache lines to avoid false sharing (topic 12 and the Systems chapter).
- PMR mirror: `unsynchronized_pool_resource` (one thread, no locking) vs `synchronized_pool_resource` (thread-safe).

#### 6. The PMR model
- `std::pmr::memory_resource` (non-virtual interface pattern):

| Public, non-virtual | Private virtual you override |
|---|---|
| `void* allocate(size_t bytes, size_t align = alignof(max_align_t))` | `do_allocate(bytes, align)` |
| `void deallocate(void* p, size_t bytes, size_t align = alignof(max_align_t))` | `do_deallocate(p, bytes, align)` |
| `bool is_equal(const memory_resource& other) const noexcept` | `do_is_equal(other)` |

  - `deallocate` receives the size and alignment again, so a resource needs no per-block header.
  - `is_equal` answers "can memory allocated by one be freed by the other?". Containers use it to decide whether a move can steal buffers.
- `std::pmr::polymorphic_allocator<T>`:
  - Holds only a `memory_resource*` (8 bytes on x86-64). Implicitly constructible from `memory_resource*`, so `std::pmr::vector<int> v(&res);` works.
  - Default-constructed: uses `std::pmr::get_default_resource()` at that moment.
  - C++20 adds `polymorphic_allocator<>` (= `<std::byte>`) and `allocate_bytes`, `allocate_object<T>`, `new_object<T>(args...)`, `delete_object(p)`.
  - Its copy assignment is **deleted**: the resource of a container is fixed at construction.
- Aliases: `std::pmr::vector<T>` = `std::vector<T, std::pmr::polymorphic_allocator<T>>`; same for `string`, `deque`, `list`, `map`, `unordered_map`, `set`, ...
- Why runtime polymorphism instead of an allocator template parameter:
  - `std::vector<int, ArenaAlloc>` and `std::vector<int>` are different types, so every function taking them must be a template (type infection).
  - All `std::pmr::vector<int>` objects have the same type, whatever resource they use.
- Costs: a virtual call per allocation (often devirtualized or negligible next to the saving), one extra pointer per container (libstdc++ x86-64: `pmr::vector<int>` 32 vs 24 bytes, `pmr::string` 40 vs 32), and allocator-propagation rules that surprise people (section 9).

#### 7. Standard memory resources
| Resource | Strategy | Frees individual blocks? | Thread-safe |
|---|---|---|---|
| `new_delete_resource()` | Calls global `operator new/delete` | Yes | Yes |
| `null_memory_resource()` | Every `allocate` throws `std::bad_alloc` | n/a | Yes |
| `monotonic_buffer_resource` | Bump pointer through a buffer, then upstream chunks | No (`deallocate` is a no-op) | No |
| `unsynchronized_pool_resource` | Pools of fixed-size blocks per size class | Yes, back to its pool for reuse | No |
| `synchronized_pool_resource` | Same, with internal locking | Yes | Yes |

- There is **no** `std::pmr::pool_resource`: the two pool classes are `synchronized_pool_resource` and `unsynchronized_pool_resource` (`std::pmr::pool_resource` is a compile error).
- Resources form chains through an **upstream** resource: when a resource runs out, it asks its upstream for more. The default upstream is `get_default_resource()` (normally `new_delete_resource()`).
- `null_memory_resource()` as upstream turns "a buffer with heap fallback" into "a hard bound": exhaustion throws instead of allocating.
- The standard resource classes (`monotonic_buffer_resource`, the two pool resources) are neither copyable nor movable (deleted copy constructor and assignment). Containers refer to resources by pointer.

#### 8. monotonic_buffer_resource and the pool resources in detail
- **monotonic_buffer_resource** (arena):
  - Allocation: align the current pointer, bump it forward. Very cheap.
  - `deallocate`: does nothing. Memory comes back only on `release()` or destruction, all at once.
  - Initial buffer: optional; give it a stack or static buffer to avoid touching the heap at all. Ownership of that buffer stays with you.
  - When the current buffer is full it requests a new chunk from upstream, larger each time (geometric growth, factor implementation-defined; libstdc++ about 1.5x: 1088, 1600, 2368, 3520 bytes for 1000-byte requests). Large requests get a chunk big enough for them.
  - `release()`: returns all upstream chunks and resets to the initial buffer, so the next allocation reuses the stack buffer.
  - Ideal for: per-request / per-message / per-frame scratch data, parse trees, building a result that is discarded together.
  - Bad for: long-lived containers that grow or churn (each `vector` reallocation leaves the old buffer as dead space), mixed lifetimes (one long-lived object pins the whole arena).
- **unsynchronized_pool_resource / synchronized_pool_resource**:
  - Keep a set of pools, one per block-size class; each pool carves chunks from upstream into blocks and keeps freed blocks on a free list for reuse.
  - Freed blocks go back to the pool, **not** to the OS or upstream. Chunks are returned only on `release()` or destruction.
  - Requests larger than `largest_required_pool_block` bypass the pools: allocated directly from upstream and freed back immediately.
  - `std::pmr::pool_options{max_blocks_per_chunk, largest_required_pool_block}` tunes chunk growth and the size limit; the implementation may adjust them (`options()` returns the values actually used; libstdc++ default 16384 / 4096).
  - `synchronized_pool_resource` is safe for concurrent use (libstdc++ keeps per-thread pools plus a shared lock); `unsynchronized` must be used by one thread at a time.
- Choosing:

| Workload | Resource |
|---|---|
| Many small allocations, all freed together at the end of a unit of work | `monotonic_buffer_resource` (+ `release()` per unit) |
| Independent lifetimes, mixed sizes, one thread | `unsynchronized_pool_resource` |
| Same, shared between threads | `synchronized_pool_resource` (or one unsynchronized pool per thread) |
| Hard upper bound, never touch the heap | any of the above with `null_memory_resource()` upstream and a pre-sized buffer |
| One type, fixed count, special policies | your own object pool (section 3) |

#### 9. Allocator propagation: where pmr surprises people
- **Uses-allocator construction**: when a `pmr` container constructs an element whose type "uses an allocator" (`pmr::string`, `pmr::vector`, `pair` of them), `polymorphic_allocator::construct` passes the container's resource down. Nested data lives in the same arena.
  - `std::pmr::vector<std::pmr::string>`: string buffers come from the resource.
  - `std::pmr::vector<std::string>`: only the vector's array comes from the resource; each long `std::string` still allocates from the global heap.
- `polymorphic_allocator` does **not** propagate on copy, move-assignment or swap (`propagate_on_container_*` are false, `select_on_container_copy_construction` returns a default-constructed allocator):

| Operation | Resource of the result |
|---|---|
| `pmr::vector<int> b(a);` copy construction | **default resource**, not `a`'s |
| `pmr::vector<int> b(a, &res);` allocator-extended copy | `res` |
| `pmr::vector<int> b(std::move(a));` move construction | `a`'s resource (buffer stolen) |
| `b = a;` copy assignment | `b` keeps its own resource |
| `b = std::move(a);` same resource (`is_equal`) | buffer stolen, O(1) |
| `b = std::move(a);` different resources | element-wise move into `b`'s resource: allocates, O(n) |
| `swap(a, b)` with different resources | **undefined behaviour** (precondition: equal allocators) |

- Returning a `pmr` container by value moves it: the result still points at the original resource (which may be about to die, see section 10).
- Rule: decide the resource at construction and pass it explicitly everywhere (`v(other, &res)`, `pmr::string s(&res)`); do not rely on assignment to "move data into the arena".

#### 10. Lifetime rules, custom resources, and pmr vs a custom pool
- **The resource must outlive every object that uses it.** A container holds a raw `memory_resource*` and does not own the resource (same relationship as `string_view` to a string).
  - Declare the resource **before** the containers in a scope or class: destruction is in reverse order, so containers release their memory first.
  - Do not return a container that uses a local resource.
  - In a class, member order matters: a container member declared before its resource member is constructed with a pointer to an unconstructed resource and destroyed after the resource died.
- **Custom memory_resource**: derive, override the three private virtuals, forward to an upstream. Typical custom resources:
  - Counting / tracking resource (tests, metrics, "no allocation in the hot path" assertions).
  - A fixed-size slab tuned to one block size.
  - A resource over shared memory or a huge-page region.
  - `do_is_equal`: usually `this == &other` (or a `dynamic_cast` and compare state).
- **Default resource**: `std::pmr::set_default_resource(r)` replaces it process-wide (atomic, returns the old one). Pointing it at a counting resource in tests catches `pmr` objects created without an explicit resource. It does not affect `std::vector`/`std::string` or `new`.
- **pmr vs a hand-written pool**:
  - pmr: standard, composable, works with all containers and nested data, no free-list code to get wrong.
  - Custom pool: exact capacity, explicit exhaustion policy, known thread ownership, cache-line layout, no virtual call, objects rather than bytes.
  - Many systems use both: pmr arenas for request-scoped scratch data, custom pools/rings for the core message objects.

#### 11. Misconceptions to unlearn
- ❌ "A pool makes allocation faster." ✅ Its main value is bounded, predictable cost; measure average and tail separately.
- ❌ "Every `new` goes to the kernel." ✅ Most allocations are served in user space; the problem is the occasional slow path you cannot predict.
- ❌ "`new T[N]` is a good way to create the pool's storage." ✅ It constructs N objects; a pool needs raw aligned storage and constructs on acquire.
- ❌ "Releasing a pooled object means `delete p`." ✅ Run the destructor and return the slot; the storage belongs to the pool.
- ❌ "A monotonic resource over a 4096-byte buffer never touches the heap." ✅ Only if its upstream is `null_memory_resource()`; by default it falls back to the heap.
- ❌ "Monotonic memory is reused after `deallocate`." ✅ `deallocate` is a no-op; reuse only after `release()`.
- ❌ "`std::pmr::pool_resource` is the pool allocator." ✅ It does not exist: use `unsynchronized_pool_resource` or `synchronized_pool_resource`.
- ❌ "`pmr::vector<std::string>` keeps everything in my arena." ✅ Only the vector's array; use `pmr::vector<pmr::string>`.
- ❌ "Copying a pmr container keeps the resource." ✅ Copy construction uses the default resource; copy assignment keeps the target's resource.
- ❌ "The container owns its memory resource." ✅ It stores a pointer; the resource must outlive it.
- ❌ "A pool freeing a block returns memory to the OS." ✅ It returns the block to the pool for reuse; chunks go back only on `release()`/destruction.
- ❌ "PMR replaces custom object pools." ✅ It replaces a lot of allocator plumbing; specialised pools still win when capacity, policy and threading are fixed.

### EDGE_CASES: Traps and Misconceptions

#### Edge Case 1: "The buffer is 4096 bytes, so the heap is never used"
- `monotonic_buffer_resource r(buf.data(), buf.size());` silently falls back to `get_default_resource()` (the heap) when the buffer is exhausted.
- Verified (libstdc++): a 1000-byte request fits the buffer; a following 5000-byte request makes the resource call upstream `allocate(6208)`.
- For a hard bound pass `std::pmr::null_memory_resource()` as upstream: the same 5000-byte request then throws `std::bad_alloc`, which you can catch and handle as an explicit exhaustion policy.

#### Edge Case 2: Vector growth wastes a monotonic arena
- `deallocate` is a no-op, so every reallocation of a growing `pmr::vector` leaves the old array as dead space.
- With a 4096-byte buffer and `null_memory_resource()` upstream, pushing 1000 `int`s (4000 bytes) throws `bad_alloc` at size 512: the capacities 1, 2, 4, ..., 512 already consumed 4092 bytes and 1024 more `int`s do not fit.
- After `v.reserve(1000)` the same 1000 elements fit easily.
- Same effect with `erase`/`insert` churn, rehashing `pmr::unordered_map`, string concatenation in a loop.

#### Edge Case 3: The nested type does not use the resource
- `std::pmr::vector<std::string> v(&res);` allocates its array from `res`, but each long `std::string` element allocates its own buffer with `std::allocator`, i.e. the global heap.
- `std::pmr::vector<std::pmr::string> v(&res);` passes `res` to every element through uses-allocator construction (verified with a counting resource).
- Same trap with `pmr::map<std::string, std::vector<int>>`: use `pmr::string` and `pmr::vector` all the way down.

#### Edge Case 4: Copy construction leaves the arena
- `std::pmr::vector<pmr::string> copy = v;` uses the **default** resource, not `v`'s (`select_on_container_copy_construction` returns a default `polymorphic_allocator`). Verified: `copy.get_allocator().resource() == &res` is false.
- Hidden copies (passing by value, `auto x = container;`, returning a member by value) silently move data to the heap.
- Fix: allocator-extended copy `pmr::vector<pmr::string> copy(v, &res);`.

#### Edge Case 5: Move assignment between different resources is a copy
- `b = std::move(a);` steals `a`'s buffer only if `a` and `b` use equal resources. With different resources, `b` keeps its own resource and moves elements one by one into newly allocated memory: O(n) and allocating (verified: `b.data()` differs from `a`'s old buffer).
- `swap(a, b)` with unequal resources is undefined behaviour.
- Move construction always takes the source's resource, so it is O(1) but carries the (maybe short-lived) resource with it.

#### Edge Case 6: The resource dies before the container
- A container holds a raw pointer to its resource. Three common ways to break that:
  - Returning a `pmr` container from a function that owns the resource as a local.
  - Class members in the wrong order: `struct S { pmr::vector<int> v{&res}; monotonic_buffer_resource res; };` constructs `v` with a pointer to a not-yet-constructed `res`, and destroys `res` before `v`.
  - Storing a `pmr` container in a longer-lived structure (cache, queue) while the per-request arena is released.
- Symptoms: use-after-free (ASan reports heap-use-after-free on the chunks the resource freed), or a call through a destroyed object's vtable.

#### Edge Case 7: Unsynchronized resources shared by threads
- `monotonic_buffer_resource` and `unsynchronized_pool_resource` have no internal locking. Two threads allocating from the same instance is a data race even if each thread uses its own container.
- Fix: one resource per thread (`thread_local` arena), or `synchronized_pool_resource`, or an external lock.
- `new_delete_resource()`, `null_memory_resource()` and `synchronized_pool_resource` are safe to share.

#### Edge Case 8: The pooled object is released twice or to the wrong pool
- An intrusive free list has no protection: releasing the same pointer twice puts one slot on the free list twice, and two later `create()` calls return the **same** address. Two live objects share storage; corruption appears far from the bug.
- Releasing a pointer that was never from this pool links a foreign address into the free list.
- `delete` on a pooled object: UB (not from `new`).
- Defences: `unique_ptr` with a pool deleter as the only handle, debug-mode "in use" bitmap, address-range checks, ASan poisoning of free slots.

#### Edge Case 9: Slot too small or misaligned for the free list
- An intrusive free list stores a pointer inside each free slot. If `sizeof(T) < sizeof(void*)` (e.g. a pool of `char` or `short`), the link overwrites the neighbouring slot.
- If slot storage is not aligned for `T` (`std::byte buf[N * sizeof(T)]` without `alignas(T)`), objects are misaligned: UB, slow or faulting loads on some CPUs, broken atomics.
- A `union Slot { Slot* next; alignas(T) std::byte obj[sizeof(T)]; };` fixes both: the slot is at least pointer-sized and aligned for both members.

### CODE_EXAMPLES: Practical Demonstrations

#### Example 1: A fixed-size object pool with an intrusive free list
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

#### Example 2: RAII handles: unique_ptr with a pool deleter
- The deleter returns the object to its pool; leaks and double release become impossible in normal use.
```cpp
#include <cstddef>
#include <iostream>
#include <memory>
#include <new>
#include <vector>

struct Msg {
    int seq;
    explicit Msg(int s) : seq(s) { std::cout << "construct " << seq << '\n'; }
    ~Msg() { std::cout << "destroy " << seq << '\n'; }
};

class MsgPool {
    std::vector<Msg*> free_;
    alignas(Msg) std::byte buf_[4 * sizeof(Msg)];
public:
    MsgPool() {
        for (int i = 3; i >= 0; --i)
            free_.push_back(reinterpret_cast<Msg*>(buf_ + i * sizeof(Msg)));
    }
    struct Deleter {
        MsgPool* pool;
        void operator()(Msg* m) const noexcept {
            m->~Msg();
            pool->free_.push_back(m);
        }
    };
    using Ptr = std::unique_ptr<Msg, Deleter>;

    Ptr make(int seq) {
        if (free_.empty()) return Ptr(nullptr, Deleter{this});
        Msg* slot = free_.back();
        Msg* m = ::new (static_cast<void*>(slot)) Msg(seq);
        free_.pop_back();                                  // pop only after success
        return Ptr(m, Deleter{this});
    }
    std::size_t available() const { return free_.size(); }
};

int main() {
    MsgPool pool;
    {
        auto a = pool.make(1);
        auto b = pool.make(2);
        std::cout << "available: " << pool.available() << '\n';
        auto c = std::move(a);                             // ownership moves, no release
        std::cout << "sizeof(Ptr)=" << sizeof(MsgPool::Ptr) << '\n';
    }                                                      // b then c released here
    std::cout << "available: " << pool.available() << '\n';
}
```
- Output:
```
construct 1
construct 2
available: 2
sizeof(Ptr)=16
destroy 1
destroy 2
available: 4
```
- The free list here is an index-style side vector (simple, allocates once at startup); Example 1 is the intrusive version.
- `sizeof(Ptr)` is 16: the deleter carries a pool pointer (stateful deleter, see topic 06).
- Destruction order: `c` (declared last, holding message 1) dies first, then `b` (message 2), then `a`, which is empty after the move and releases nothing.
- Moving a pool handle transfers ownership without touching the pool: no destroy, no re-acquire.

#### Example 3: monotonic_buffer_resource: stack buffer, upstream fallback, hard bound
- A logging upstream shows exactly when the arena leaves the stack buffer.
```cpp
#include <array>
#include <cstddef>
#include <iostream>
#include <memory_resource>
#include <new>

struct LoggingUpstream : std::pmr::memory_resource {
    void* do_allocate(std::size_t n, std::size_t a) override {
        std::cout << "  upstream allocate(" << n << ")\n";
        return std::pmr::new_delete_resource()->allocate(n, a);
    }
    void do_deallocate(void* p, std::size_t n, std::size_t a) override {
        std::cout << "  upstream deallocate(" << n << ")\n";
        std::pmr::new_delete_resource()->deallocate(p, n, a);
    }
    bool do_is_equal(const memory_resource& o) const noexcept override {
        return this == &o;
    }
};

int main() {
    std::array<std::byte, 4096> buf{};
    LoggingUpstream up;
    {
        std::pmr::monotonic_buffer_resource arena(buf.data(), buf.size(), &up);
        void* p1 = arena.allocate(1000);
        std::cout << "1000 bytes in stack buffer: "
                  << (p1 >= buf.data() && p1 < buf.data() + buf.size()) << '\n';
        arena.deallocate(p1, 1000);                 // no-op
        std::cout << "allocate 5000:\n";
        void* p2 = arena.allocate(5000);            // does not fit: goes upstream
        (void)p2;
        std::cout << "release:\n";
        arena.release();                            // chunks returned, reset to buf
        void* p3 = arena.allocate(10);
        std::cout << "after release, back at buffer start: "
                  << (p3 == buf.data()) << '\n';
    }
    {
        std::pmr::monotonic_buffer_resource bounded(buf.data(), buf.size(),
                                                    std::pmr::null_memory_resource());
        try {
            void* p = bounded.allocate(5000);
            (void)p;
        } catch (const std::bad_alloc&) {
            std::cout << "null upstream: bad_alloc instead of heap\n";
        }
    }
}
```
- Output (libstdc++; the 6208 chunk size is implementation-specific):
```
1000 bytes in stack buffer: 1
allocate 5000:
  upstream allocate(6208)
release:
  upstream deallocate(6208)
after release, back at buffer start: 1
null upstream: bad_alloc instead of heap
```
- The upstream chunk is larger than the request: the resource grows geometrically to amortize future requests.
- The destructor of a monotonic resource calls `release()`; the stack buffer itself is yours.

#### Example 4: Pool resource reuses blocks; monotonic does not
- Same allocate/free pattern against both resources; large requests bypass the pool.
```cpp
#include <cstddef>
#include <iostream>
#include <memory_resource>

int main() {
    std::pmr::monotonic_buffer_resource mono;
    void* m1 = mono.allocate(64);
    mono.deallocate(m1, 64);
    void* m2 = mono.allocate(64);
    std::cout << "monotonic reuses freed block: " << (m1 == m2) << '\n';

    std::pmr::unsynchronized_pool_resource pool;
    void* p1 = pool.allocate(64);
    pool.deallocate(p1, 64);
    void* p2 = pool.allocate(64);
    std::cout << "pool reuses freed block:      " << (p1 == p2) << '\n';
    pool.deallocate(p2, 64);

    std::pmr::pool_options opts;
    opts.max_blocks_per_chunk = 16;
    opts.largest_required_pool_block = 256;
    std::pmr::unsynchronized_pool_resource tuned(opts);
    auto used = tuned.options();
    std::cout << "options used: " << used.max_blocks_per_chunk << ", "
              << used.largest_required_pool_block << '\n';
    void* big = tuned.allocate(1024);   // > 256: goes straight to upstream
    tuned.deallocate(big, 1024);        // and straight back
}
```
- Output (libstdc++):
```
monotonic reuses freed block: 0
pool reuses freed block:      1
options used: 16, 256
```
- `options()` reports what the implementation actually uses; it may round values.
- Freed pool blocks stay in the pool; nothing returns to the OS until `release()` or destruction.

#### Example 5: Propagation: nested strings, copy construction, allocator-extended copy
- A counting resource shows which allocations really land in the arena.
```cpp
#include <cstddef>
#include <iostream>
#include <memory_resource>
#include <string>
#include <vector>

struct Counting : std::pmr::memory_resource {
    int count = 0;
    void* do_allocate(std::size_t n, std::size_t a) override {
        ++count;
        return std::pmr::new_delete_resource()->allocate(n, a);
    }
    void do_deallocate(void* p, std::size_t n, std::size_t a) override {
        std::pmr::new_delete_resource()->deallocate(p, n, a);
    }
    bool do_is_equal(const memory_resource& o) const noexcept override {
        return this == &o;
    }
};

const char* kLong = "a symbol name long enough to defeat the small string buffer";

int main() {
    Counting res;
    std::pmr::vector<std::string> v1(&res);
    v1.reserve(4);
    int before = res.count;
    v1.emplace_back(kLong);
    std::cout << "vector<std::string> element from arena: "
              << (res.count > before) << '\n';

    std::pmr::vector<std::pmr::string> v2(&res);
    v2.reserve(4);
    before = res.count;
    v2.emplace_back(kLong);
    std::cout << "vector<pmr::string> element from arena: "
              << (res.count > before) << '\n';
    std::cout << "element's resource is res: "
              << (v2[0].get_allocator().resource() == &res) << '\n';

    std::pmr::vector<std::pmr::string> copy = v2;
    std::cout << "copy ctor uses res: " << (copy.get_allocator().resource() == &res)
              << ", uses default: "
              << (copy.get_allocator().resource() == std::pmr::get_default_resource())
              << '\n';

    std::pmr::vector<std::pmr::string> copy2(v2, &res);
    std::cout << "allocator-extended copy uses res: "
              << (copy2.get_allocator().resource() == &res) << '\n';
}
```
- Output:
```
vector<std::string> element from arena: 0
vector<pmr::string> element from arena: 1
element's resource is res: 1
copy ctor uses res: 0, uses default: 1
allocator-extended copy uses res: 1
```
- The element's resource came from the vector, not from the `emplace_back` argument: uses-allocator construction at work.

#### Example 6: A custom memory_resource that guards the hot path
- Counts allocations and can be armed to throw if anything allocates while the hot path runs; also installed as the default resource to catch pmr objects created without an explicit resource.
```cpp
#include <cstddef>
#include <iostream>
#include <memory_resource>
#include <new>
#include <string>

class HotPathGuard : public std::pmr::memory_resource {
    std::pmr::memory_resource* up_;
    bool armed_ = false;
    std::size_t allocs_ = 0, bytes_ = 0;

    void* do_allocate(std::size_t n, std::size_t a) override {
        if (armed_) throw std::bad_alloc();         // allocation in the hot path is a bug
        ++allocs_;
        bytes_ += n;
        return up_->allocate(n, a);
    }
    void do_deallocate(void* p, std::size_t n, std::size_t a) override {
        up_->deallocate(p, n, a);
    }
    bool do_is_equal(const memory_resource& o) const noexcept override {
        return this == &o;
    }
public:
    explicit HotPathGuard(std::pmr::memory_resource* up) : up_(up) {}
    void arm(bool on) { armed_ = on; }
    std::size_t allocs() const { return allocs_; }
    std::size_t bytes() const { return bytes_; }
};

int main() {
    HotPathGuard guard(std::pmr::new_delete_resource());
    auto* old = std::pmr::set_default_resource(&guard);

    std::pmr::string sym;                           // no resource given: uses default
    sym.reserve(64);                                // warm-up allocation, allowed
    std::cout << "warm-up allocs: " << guard.allocs() << '\n';

    guard.arm(true);
    sym = "short";                                  // fits the reserved capacity
    std::cout << "hot path ok, sym=" << sym << '\n';
    try {
        sym.append(100, 'x');                       // needs to grow: caught
    } catch (const std::bad_alloc&) {
        std::cout << "hot-path allocation detected\n";
    }
    guard.arm(false);

    std::pmr::set_default_resource(old);
    std::cout << "total allocs: " << guard.allocs() << '\n';
}
```
- Output:
```
warm-up allocs: 1
hot path ok, sym=short
hot-path allocation detected
total allocs: 1
```
- `set_default_resource` is process-wide and returns the previous resource; restore it.
- `sym` is destroyed at the end of `main` and frees into `guard`, which is still alive: the guard was declared first.
- Only pmr types consult the default resource. `std::string` and plain `new` are not affected; catching those needs a replaced global `operator new` (topic 10).

#### Example 7: Per-message arena: reset after every unit of work
- Each message is parsed into pmr containers that live in a stack arena; `release()` resets it. After warm-up there are zero upstream allocations.
```cpp
#include <array>
#include <cstddef>
#include <iostream>
#include <memory_resource>
#include <sstream>
#include <string>
#include <vector>

struct Counting : std::pmr::memory_resource {
    int count = 0;
    void* do_allocate(std::size_t n, std::size_t a) override {
        ++count;
        return std::pmr::new_delete_resource()->allocate(n, a);
    }
    void do_deallocate(void* p, std::size_t n, std::size_t a) override {
        std::pmr::new_delete_resource()->deallocate(p, n, a);
    }
    bool do_is_equal(const memory_resource& o) const noexcept override {
        return this == &o;
    }
};

double process(const std::string& msg, std::pmr::memory_resource* arena) {
    std::pmr::vector<std::pmr::string> fields(arena);
    fields.reserve(8);
    std::size_t start = 0;
    while (start <= msg.size()) {
        std::size_t end = msg.find(',', start);
        if (end == std::string::npos) end = msg.size();
        fields.emplace_back(msg.substr(start, end - start));   // string lives in arena
        start = end + 1;
    }
    return std::stod(std::string(fields.at(2)));
}

int main() {
    std::array<std::byte, 2048> buf{};
    Counting heap;
    std::pmr::monotonic_buffer_resource arena(buf.data(), buf.size(), &heap);

    const char* msgs[] = {"NEW,ORD1,101.25,100", "NEW,ORD2,99.75,250",
                          "CXL,ORD1,101.25,0"};
    for (const char* m : msgs) {
        double px = process(m, &arena);
        arena.release();                         // all scratch data freed in one step
        std::cout << "px=" << px << " heap allocs so far=" << heap.count << '\n';
    }
}
```
- Output:
```
px=101.25 heap allocs so far=0
px=99.75 heap allocs so far=0
px=101.25 heap allocs so far=0
```
- Only safe because nothing built from the arena outlives `process` (the result is a `double`).
- `msg.substr` creates a temporary `std::string` on the global heap; a production parser would use `std::string_view` and construct the `pmr::string` from it directly.

### QUICK_REFERENCE: Cheat Sheet

#### Object pool checklist
| Item | Rule |
|---|---|
| Storage | Raw, aligned for `T`, allocated once at startup; not `new T[N]` |
| Slot | `union { Slot* next; alignas(T) std::byte obj[sizeof(T)]; }` |
| Acquire | Pop head, placement new; push back if the constructor throws |
| Release | `p->~T()`, push slot; never `delete p` |
| Handle | `unique_ptr<T, PoolDeleter>` |
| Exhaustion | Decide: fail fast, drop, block, fallback (visible), grow |
| Threads | Per-thread pools; cross-thread free via queue or remote-free list |
| Reuse with many readers | Deferred reclamation (Chapter 4) |

#### Standard resources
| Need | Use |
|---|---|
| Heap, through the pmr interface | `std::pmr::new_delete_resource()` |
| Fail every allocation | `std::pmr::null_memory_resource()` |
| Bump arena, free all at once | `std::pmr::monotonic_buffer_resource` + `release()` |
| Reusable blocks, one thread | `std::pmr::unsynchronized_pool_resource` |
| Reusable blocks, many threads | `std::pmr::synchronized_pool_resource` |
| Hard memory bound | Any resource with `null_memory_resource()` upstream |
| Pool tuning | `std::pmr::pool_options{max_blocks_per_chunk, largest_required_pool_block}` |
| Change default | `std::pmr::set_default_resource(&r)` (returns old) |

#### Propagation table (polymorphic_allocator)
| Operation | Resulting resource |
|---|---|
| Copy construct | Default resource |
| `T b(a, &r)` | `r` |
| Move construct | Source's resource |
| Copy assign | Target keeps its own |
| Move assign, equal resources | Target, buffer stolen |
| Move assign, different resources | Target, element-wise move (allocates) |
| Swap, different resources | UB |

#### Interview one-liners
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
