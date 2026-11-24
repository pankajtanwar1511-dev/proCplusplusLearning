## TOPIC: Memory Pools and Polymorphic Allocators (PMR)

### INTERVIEW_QA: Interview Questions with Detailed Answers

#### Q1: What is a memory pool, and why would a low-latency system use one?
**Difficulty:** #beginner
**Category:** #memory #low_latency
**Concepts:** #object_pool #preallocation #predictability

**Answer:**
A memory pool preallocates a block of storage and hands out reusable slots from it instead of calling the general-purpose allocator for every object. Allocation and release become a bounded, O(1) operation on the pool's own free list, which makes hot-path latency predictable.

**Explanation:**
- Startup: allocate (and pre-touch) storage for N objects. Hot path: pop a slot, construct the object in it; on release destroy the object and push the slot back.
- Benefits: no allocator bookkeeping or locking on the hot path, no surprise page faults, memory bounded and measurable, objects packed together (locality), no fragmentation from mixed lifetimes.
- Costs: fixed capacity, an exhaustion policy to design, manual lifetime management, thread-ownership rules.
- ❌ Common wrong answer: "Because `new` is slow and always calls the kernel." Most allocations are served in user space in tens of nanoseconds.
- ✅ What a strong answer adds: the win is variance (p99/p99.9), so prove it with latency percentiles, not just an average benchmark.

**Key takeaway:** A pool replaces "unknown allocator path" with "bounded free-list operation" on the hot path.

---

#### Q2: malloc's fast path is only tens of nanoseconds. What exactly does a pool change that removes allocation jitter?
**Difficulty:** #intermediate
**Category:** #memory #low_latency
**Concepts:** #tail_latency #object_pool #preallocation

**Answer:**
A pool replaces "usually fast, occasionally slow" with "always the same few instructions". All memory is obtained and touched at startup; on the hot path acquire and release are a pop and a push on a free list, with no searching, no lock, no system call and no first-touch page fault. Why general-purpose `malloc` has a slow tail (bins, arena locks, `brk`/`mmap`, page faults) is covered in topic 10 Q14.

**Explanation:**
- Why the tail matters at all: at 500k messages/s, a 1-in-10,000 slow allocation still happens 50 times a second, and each one lands on some message's latency.
- What the pool removes from the hot path:
  - Variable work: no size-class lookup, no splitting or coalescing; every slot has the same size.
  - Kernel involvement: memory is allocated and pre-faulted (written once) at startup, so no `brk`/`mmap` and no page faults later.
  - Contention: a per-thread (or single-threaded) pool needs no lock and no atomic.
  - Poor locality: slots are contiguous, and LIFO reuse hands out the slot that was freed most recently, which is likely still in cache.
- What it does not remove:
  - Allocations inside the object (a `std::string` or `std::vector` member still uses the heap unless it is a pmr type or fixed-capacity).
  - Constructor and destructor cost.
  - The exhaustion decision: a pool makes capacity explicit, so running out needs a policy (Q6).
  - Cross-thread release: a slot freed on another thread needs a return path (Q7).
- ❌ Common wrong answer: "Pools are faster because malloc always takes a lock." The average gain can be small; the win is the bounded worst case.
- ✅ What a strong answer adds: prove it with a latency histogram (p99/p99.9) before and after, not with an average (Q20).

**Key takeaway:** A pool trades flexibility for a bounded, constant-time hot path; it fixes variance, not just the mean.

---

#### Q3: A candidate creates the pool with `new Order[10000]`. What is wrong with that?
**Difficulty:** #beginner
**Category:** #memory #object_lifetime
**Concepts:** #raw_storage #placement_new #lifetime

**Answer:**
`new Order[10000]` constructs 10,000 `Order` objects up front, requires a default constructor, and ties all their lifetimes to the array. A pool needs raw, suitably aligned storage, constructs an object only when a slot is acquired and destroys it when the slot is released.

**Explanation:**
- "Storage exists" is not "object exists": the pool owns bytes; each object's lifetime starts at placement new (or `std::construct_at`) and ends at `p->~Order()` (topic 10).
- Raw storage options: `alignas(Order) std::byte buf[N * sizeof(Order)]`, or `::operator new(bytes, std::align_val_t{alignof(Order)})` for over-aligned types (C++17).
- With an array of live objects you would have to "reset" objects instead of constructing them, and `delete[]` would run 10,000 destructors at shutdown.
- ❌ Common wrong answer: "It's fine, placement new on top of an existing object is the same thing." Constructing over a live non-trivial object without destroying it first skips its destructor and leaks its resources.
- ✅ What a strong answer adds: slot `i` lives at `base + i * sizeof(Order)` bytes, not `base + i`.

**Key takeaway:** Allocate raw aligned bytes once; construct on acquire, destroy on release.

---

#### Q4: How do you make acquire and release O(1), and what constraints does an intrusive free list put on the slot?
**Difficulty:** #intermediate
**Category:** #memory #data_structures
**Concepts:** #free_list #intrusive #alignment

**Answer:**
Keep the free slots in a singly linked list whose "next" pointer is stored inside the free slot itself. Acquire pops the head, release pushes onto the head: both O(1) with no search. The slot must be at least `sizeof(void*)` bytes and aligned for both a pointer and `T`.

**Explanation:**
- A union does both for free:
```cpp
union Slot {
    Slot* next;                                // meaningful while free
    alignas(T) std::byte storage[sizeof(T)];   // meaningful while in use
};
```
- Alternatives: a stack of free indices (extra memory, but works for tiny `T` and makes double-free checks easy), or a bitmap (needs a search).
- LIFO reuse returns the most recently freed (cache-warm) slot.
- If the constructor throws after popping, push the slot back or the pool slowly leaks.
- ❌ Common wrong answer: "Scan the array for a free slot." O(N) and unpredictable, which defeats the purpose.
- ✅ What a strong answer adds: a pool of `char` with an intrusive list would let the link overwrite neighbouring slots; the union's size and alignment prevent that.

**Key takeaway:** Intrusive free list = zero extra memory and O(1), provided the slot can hold an aligned pointer.

---

#### Q5: How must a pooled object be released? What happens if someone calls `delete` on it?
**Difficulty:** #beginner
**Category:** #memory #object_lifetime
**Concepts:** #explicit_destructor #undefined_behavior #custom_deleter

**Answer:**
Call the destructor explicitly (`p->~T()` or `std::destroy_at(p)`) and return the slot to the pool's free list. `delete p` is undefined behaviour: the pointer did not come from a matching `new`, so the global allocator would try to free memory it never handed out. The symptom varies with where the pool storage lives (observed with glibc 2.35): "free(): invalid pointer" for a slot inside a heap block, "double free or corruption (out)" for stack-backed storage, or no message at all when the slot happens to be the first byte of the pool's own heap block (that `delete` frees the entire pool, and the crash comes later, far from the bug).

**Explanation:**
- The storage belongs to the pool for the pool's whole life; only the object's lifetime ends at release.
- Make the right thing automatic: hand out `std::unique_ptr<T, PoolDeleter>` where the deleter calls `pool.destroy(p)`. Stateful deleter: 16 bytes per handle (topic 06).
- Releasing twice puts one slot on the free list twice; two later acquires get the same address. Debug builds should track in-use slots.
- ❌ Common wrong answer: "Just skip the destructor, the memory is reused anyway." Fine only for trivially destructible types; otherwise strings, vectors and file handles inside leak.
- ✅ What a strong answer adds: in debug builds, poison freed slots (fill pattern, ASan poisoning) so use-after-release is caught.

**Key takeaway:** Release = destroy the object + return the slot; never `delete`, and wrap it in a deleter.

---

#### Q6: Your pool has 10,000 slots and all are in use. What should happen on the next acquire?
**Difficulty:** #intermediate
**Category:** #memory #system_design
**Concepts:** #exhaustion_policy #backpressure #capacity

**Answer:**
It depends on the domain, but it must be an explicit decision: fail fast (return an error and reject the request), drop (and count drops), block until a slot frees (back-pressure), fall back to the heap visibly, or grow by another chunk. Silent fallback in a latency-critical path is the worst choice.

**Explanation:**
- Order entry: rejecting a new order with an alert is often better than slowing every order down.
- Recoverable market data: dropping and resynchronizing from a snapshot can be acceptable.
- Back-pressure: blocking the producer is safe only if the producer can afford to wait.
- Growth: allocate a new chunk (never move live objects); do it off the hot path or accept a rare spike.
- Sizing: measured peak plus headroom, export the high-water mark, alert well before exhaustion.
- ❌ Common wrong answer: "Make the pool big enough so it never happens." Load is bounded by the outside world, not by your estimate.
- ✅ What a strong answer adds: exhaustion is usually a symptom of a stuck consumer or a leak of handles; the metric matters as much as the policy.

**Key takeaway:** A bounded pool is only a design once the exhaustion policy is defined.

---

#### Q7: Several threads acquire and release from one pool. What problems appear, and how do you design around them?
**Difficulty:** #advanced
**Category:** #memory #concurrency
**Concepts:** #per_thread_pool #contention #aba #cross_thread_free

**Answer:**
A shared free list needs synchronization: a mutex serializes every acquire, and an atomic CAS head is lock-free but its cache line bounces between cores and a naive pop suffers from ABA. The usual design is per-thread pools, which then need a rule for objects freed by a thread other than the one that allocated them.

**Explanation:**
- Per-thread pools: `thread_local` or one pool per worker; no locks, no shared cache line.
- Cross-thread free: either only the owner releases (send the pointer back through a queue), or the freeing thread pushes onto the owner's lock-free "remote free" stack that the owner drains.
- Multiple readers of one pooled message: a slot can be reused only when no reader can still see it; use deferred reclamation (progress counters, epochs, hazard pointers: Chapter 4).
- Keep per-thread counters and pool headers on separate cache lines (false sharing, topic 12).
- PMR equivalent: `synchronized_pool_resource` (shared) vs `unsynchronized_pool_resource` per thread.
- ❌ Common wrong answer: "Make the head atomic and it's solved." Correctness needs ABA protection (tagged pointer or similar), and performance still suffers from contention.
- ✅ What a strong answer adds: ownership design first (who allocates, who frees), synchronization second.

**Key takeaway:** Prefer partitioning (one pool per thread) over sharing; then solve cross-thread frees explicitly.

---

#### Q8: What is `std::pmr`, and why use polymorphic allocators instead of a custom allocator template parameter?
**Difficulty:** #intermediate
**Category:** #memory #pmr
**Concepts:** #memory_resource #polymorphic_allocator #type_erasure

**Answer:**
`std::pmr` (C++17, `<memory_resource>`) separates a container from its allocation strategy: containers use `polymorphic_allocator`, which forwards to a `memory_resource*` chosen at run time. Unlike a template allocator, the strategy is not part of the type, so `std::pmr::vector<int>` objects using a heap, an arena or a pool are all the same type.

**Explanation:**
- `std::vector<int, ArenaAlloc<int>>` and `std::vector<int>` are different types: every function that accepts them must be a template, and you cannot store them in the same container.
- `memory_resource` is an abstract class: public `allocate`/`deallocate`/`is_equal`, private virtual `do_*` functions.
- Standard resources: `new_delete_resource()`, `null_memory_resource()`, `monotonic_buffer_resource`, `unsynchronized_pool_resource`, `synchronized_pool_resource`.
- Resources chain through an upstream resource used when they run out.
- ❌ Common wrong answer: "pmr is a faster allocator." It is a framework; speed depends on the resource and workload.
- ✅ What a strong answer adds: nested allocator-aware types (pmr strings inside a pmr vector) receive the same resource automatically through uses-allocator construction.

**Key takeaway:** PMR = runtime-selected allocation strategy without changing the container's type.

---

#### Q9: What does `monotonic_buffer_resource` do, and for which workloads is it ideal or harmful?
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

**Key takeaway:** Monotonic = bump allocate, never free individually, release everything together.

---

#### Q10: I gave a monotonic resource a 4096-byte stack buffer. Can it still touch the heap?
**Difficulty:** #intermediate
**Category:** #memory #pmr
**Concepts:** #upstream #null_memory_resource #hard_bound

**Answer:**
Yes. When the buffer is exhausted it asks its upstream resource, which defaults to `get_default_resource()` (normally `new_delete_resource()`, the heap). To make the buffer a hard bound, pass `std::pmr::null_memory_resource()` as upstream; exhaustion then throws `std::bad_alloc`.

**Explanation:**
```cpp
#include <array>
#include <cstddef>
#include <iostream>
#include <memory_resource>
#include <new>

int main() {
    std::array<std::byte, 4096> buf{};
    std::pmr::monotonic_buffer_resource soft(buf.data(), buf.size());
    void* p = soft.allocate(5000);                 // silently comes from the heap
    std::cout << "soft: in buffer? "
              << (p >= buf.data() && p < buf.data() + buf.size()) << '\n';

    std::pmr::monotonic_buffer_resource hard(buf.data(), buf.size(),
                                             std::pmr::null_memory_resource());
    try {
        void* q = hard.allocate(5000);
        (void)q;
    } catch (const std::bad_alloc&) {
        std::cout << "hard: bad_alloc\n";
    }
}
```
- Output: `soft: in buffer? 0` then `hard: bad_alloc`.
- With a logging upstream (theory Example 3), libstdc++ requests a 6208-byte chunk for the 5000-byte allocation: chunks grow geometrically.
- ❌ Common wrong answer: "A buffer resource can never allocate beyond its buffer."
- ✅ What a strong answer adds: treat the `bad_alloc` as your exhaustion policy, and size the buffer for the worst case including container growth waste.

**Key takeaway:** Buffer + default upstream = soft limit; buffer + `null_memory_resource()` = hard limit.

---

#### Q11: How do `monotonic_buffer_resource`, `unsynchronized_pool_resource` and `synchronized_pool_resource` differ?
**Difficulty:** #intermediate
**Category:** #memory #pmr
**Concepts:** #pool_resource #size_classes #thread_safety

**Answer:**
Monotonic never reuses individual blocks and frees all at once. The pool resources keep per-size-class pools of blocks and reuse freed blocks, so they suit independent lifetimes; `unsynchronized` has no locking and must be used by one thread at a time, `synchronized` is safe to share between threads.

**Explanation:**
- Pool resources carve chunks from upstream into fixed-size blocks; `deallocate` returns a block to its pool (not to the OS). Chunks go back on `release()` or destruction.
- Requests above `largest_required_pool_block` bypass the pools and go directly to upstream.
- `std::pmr::pool_options{max_blocks_per_chunk, largest_required_pool_block}` tunes them; `options()` returns the effective values (libstdc++ defaults 16384 and 4096).
- Typical combination: per-thread `unsynchronized_pool_resource` with a `monotonic_buffer_resource` upstream for a fully preallocated region.
- ❌ Common wrong answer: "Use `std::pmr::pool_resource`." There is no such class; it is a compile error.
- ✅ What a strong answer adds: `synchronized` is not free; one unsynchronized pool per thread avoids lock traffic entirely.

**Key takeaway:** Grouped lifetimes → monotonic; independent lifetimes → pool (unsynchronized per thread, synchronized when shared).

---

#### Q12: Why does `std::pmr::vector<std::string>` still allocate from the heap, while `std::pmr::vector<std::pmr::string>` does not?
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

**Key takeaway:** Use pmr types all the way down, or nested data escapes the arena.

---

#### Q13: Which memory resource does a copy of a pmr container use? What about copy assignment and move construction?
**Difficulty:** #advanced
**Category:** #memory #pmr
**Concepts:** #select_on_container_copy_construction #propagate_on_container #allocator_extended

**Answer:**
Copy construction uses the default resource, not the source's (`polymorphic_allocator::select_on_container_copy_construction` returns a default-constructed allocator). Copy and move assignment keep the target's own resource. Move construction takes the source's resource. To copy into a specific resource use the allocator-extended constructor `T copy(src, &res)`.

**Explanation:**
```cpp
#include <iostream>
#include <memory_resource>
#include <vector>

int main() {
    std::pmr::monotonic_buffer_resource r1, r2;
    std::pmr::vector<int> a({1, 2, 3}, &r1);

    std::pmr::vector<int> copy(a);                   // copy construction
    std::pmr::vector<int> copy2(a, &r2);             // allocator-extended copy
    std::pmr::vector<int> target(&r2);
    target = a;                                      // copy assignment
    std::pmr::vector<int> moved(std::move(a));       // move construction

    auto* def = std::pmr::get_default_resource();
    std::cout << "copy -> default: "
              << (copy.get_allocator().resource() == def) << '\n'
              << "copy2 -> r2: " << (copy2.get_allocator().resource() == &r2) << '\n'
              << "assigned keeps r2: " << (target.get_allocator().resource() == &r2) << '\n'
              << "moved -> r1: " << (moved.get_allocator().resource() == &r1) << '\n';
}
```
- Output: all four lines print `1`.
- `polymorphic_allocator`'s copy assignment operator is deleted; the `propagate_on_container_*` traits are false, so a container's resource never changes after construction.
- ❌ Common wrong answer: "A copy is a copy: it uses the same arena." Hidden copies (by-value parameters, `auto x = member;`) silently move data to the heap.
- ✅ What a strong answer adds: the design intent: the resource is chosen by whoever creates the object, typically scoped to that object's lifetime, so copying it along could outlive the resource.

**Key takeaway:** Copy construct → default resource; assign → keep own; move construct → source's. Pass the resource explicitly.

---

#### Q14: What does `b = std::move(a)` cost when `a` and `b` are pmr vectors on different resources? And `swap(a, b)`?
**Difficulty:** #advanced
**Category:** #memory #pmr
**Concepts:** #move_assignment #is_equal #swap_ub

**Answer:**
If the resources compare equal (`is_equal`), the buffer is stolen in O(1). If they differ, `b` must keep its own resource, so it allocates in its resource and moves the elements one by one: O(n) and allocating. `swap` with unequal allocators is undefined behaviour.

**Explanation:**
- Verified: after `b = std::move(a)` with different monotonic resources, `b.data()` was not `a`'s old buffer and `b` still used its own resource.
- With the same resource, `b.data()` was exactly `a`'s old buffer.
- `is_equal` is the hook: two resource objects can declare themselves interchangeable (e.g. two handles to the same arena).
- Consequence: "moving data into the arena" by assignment is a copy in disguise; construct the data in the right resource from the start.
- ❌ Common wrong answer: "Move assignment is always O(1) and noexcept for vectors." That holds for `std::allocator` (always equal), not for stateful allocators.
- ✅ What a strong answer adds: the same rule explains why `noexcept` on move assignment of pmr containers is conditional.

**Key takeaway:** Move between different resources = element-wise move with allocation; swap between them = UB.

---

#### Q15: Who owns a memory resource, and how can a pmr container end up using a dead one?
**Difficulty:** #intermediate
**Category:** #memory #object_lifetime
**Concepts:** #non_owning #declaration_order #dangling

**Answer:**
Nobody but its creator: a pmr container stores a raw `memory_resource*` and does not keep the resource alive. It breaks when the resource is destroyed first: returning a container built on a local arena, declaring a container member before its resource member, or storing arena-backed data in a longer-lived structure.

**Explanation:**
- Correct shape: resource first, containers after, so containers are destroyed first:
```cpp
#include <iostream>
#include <memory_resource>
#include <vector>

struct Batch {
    std::pmr::monotonic_buffer_resource arena;     // declared first: destroyed last
    std::pmr::vector<int> ids{&arena};
};

int main() {
    Batch b;
    for (int i = 0; i < 5; ++i) b.ids.push_back(i);
    std::cout << b.ids.size() << '\n';             // 5
}
```
- Swapping the two member declarations makes `ids` capture a pointer to an unconstructed resource and free into a destroyed one (practice Q9).
- Returning `pmr::vector` by value from a function with a local arena moves the vector out, still pointing at the arena that is about to die (ASan: heap-use-after-free).
- A plain scope where the container is declared after the resource is fine: `{ monotonic_buffer_resource r; pmr::vector<int> v(&r); }` destroys `v` first.
- ❌ Common wrong answer: "Passing `&resource` gives the container shared ownership."
- ✅ What a strong answer adds: same relationship as `string_view` to a string or `span` to an array: non-owning, lifetime is the caller's job.

**Key takeaway:** The resource must outlive every object that allocated from it; declare it first.

---

#### Q16: How do you write a custom `memory_resource`, and what is `do_is_equal` for?
**Difficulty:** #intermediate
**Category:** #memory #pmr
**Concepts:** #nvi #do_allocate #is_equal

**Answer:**
Derive from `std::pmr::memory_resource` and override the private virtuals `do_allocate(bytes, align)`, `do_deallocate(p, bytes, align)` and `do_is_equal(other)`, usually forwarding to an upstream resource. `do_is_equal` tells containers whether memory from one resource can be deallocated by the other; usually `this == &other`.

**Explanation:**
- Non-virtual interface: users call `allocate`/`deallocate`/`is_equal`; the base forwards to the `do_*` hooks.
- `deallocate` receives the original size and alignment, so a resource needs no per-block header.
- Honour the alignment argument; returning less-aligned memory is UB for the caller.
- Typical custom resources: counting/tracking, "throw if called in the hot path", fixed-size slab, shared-memory segment, huge pages.
- Allocation failure: throw `std::bad_alloc` (or something derived); do not return `nullptr`.
- ❌ Common wrong answer: "Override `allocate` directly." It is not virtual.
- ✅ What a strong answer adds: a tracking resource with `set_default_resource` is a cheap way to enforce "no allocation after warm-up" in tests.

**Key takeaway:** Override three private virtuals, forward to upstream, honour alignment, compare by identity.

---

#### Q17: What is the default memory resource, and how can `set_default_resource` help in testing?
**Difficulty:** #intermediate
**Category:** #memory #pmr
**Concepts:** #get_default_resource #set_default_resource #testing

**Answer:**
`std::pmr::get_default_resource()` is the process-wide resource used by default-constructed `polymorphic_allocator`s and as the default upstream; initially it is `new_delete_resource()`. `set_default_resource(r)` replaces it atomically and returns the previous one; pointing it at a counting or "fail on use" resource in tests exposes pmr objects created without an explicit resource.

**Explanation:**
- It affects only pmr machinery: `std::vector`, `std::string`, `new` and `malloc` do not consult it. Catching those needs a replaced global `operator new` (topic 10) or allocator hooks.
- It is read when the allocator is constructed; changing it later does not move existing containers.
- Process-wide: changing it in one thread affects every thread; restore the previous value.
- ❌ Common wrong answer: "Setting the default resource to an arena makes the whole program use the arena."
- ✅ What a strong answer adds: combine with copy-construction behaviour: a hidden copy of a pmr container lands in the default resource, so a guarded default catches it.

**Key takeaway:** The default resource is a global fallback for pmr only; great as a tripwire in tests.

---

#### Q18: What does PMR cost compared with `std::allocator`?
**Difficulty:** #advanced
**Category:** #memory #performance
**Concepts:** #virtual_call #object_size #propagation

**Answer:**
A virtual call per allocation and deallocation, one extra pointer per container (libstdc++ x86-64: `pmr::vector<int>` is 32 bytes vs 24, `pmr::string` 40 vs 32), and non-propagating allocator semantics that can make copies and moves allocate. In return, allocations can be far cheaper (bump or pool) and more predictable than the general heap.

**Explanation:**
- The virtual call is a few nanoseconds and often devirtualized when the compiler sees the concrete resource; it is small next to a heap allocation it replaces.
- The extra pointer matters in large arrays of small containers (cache footprint).
- Move assignment between unequal resources is O(n) and may throw; `std::allocator` moves are always O(1).
- Resource lifetime becomes a correctness concern that `std::allocator` never has.
- ❌ Common wrong answer: "PMR is zero-cost." It is cheap, not free.
- ✅ What a strong answer adds: measure both the allocator cost and the change in tail latency; the virtual call is rarely the bottleneck.

**Key takeaway:** PMR costs a virtual call and a pointer; it pays off when the resource beats the general heap.

---

#### Q19: When would you write your own object pool instead of using a pmr pool resource?
**Difficulty:** #intermediate
**Category:** #memory #design
**Concepts:** #custom_pool #pmr #trade_offs

**Answer:**
When the workload has fixed properties a general resource cannot exploit: one object type with a known maximum count, a specific exhaustion policy, a strict "no heap after startup" rule, known thread ownership (SPSC hand-off), cache-line layout of slots, or handing out objects and handles rather than raw bytes. Otherwise a standard resource is less code and less risk.

**Explanation:**
- pmr strengths: standard, composable (resources chain), works with every allocator-aware container and nested data, no free-list code to debug.
- Custom pool strengths: exact capacity and metrics, no virtual calls, pre-faulted memory, policy-specific behaviour (drop/reject), objects constructed in place with typed handles.
- Common split: pmr arenas for per-message scratch data; a custom pool or ring buffer for the core message/order objects.
- ❌ Common wrong answer: "PMR replaces object pools entirely" or "always write your own for performance."
- ✅ What a strong answer adds: you can implement the custom pool as a `memory_resource` and get both.

**Key takeaway:** pmr for general allocation policy; a custom pool when capacity, policy and ownership are fixed and known.

---

#### Q20: How would you prove that a pool actually improved your system?
**Difficulty:** #intermediate
**Category:** #memory #performance
**Concepts:** #measurement #tail_latency #allocation_counting

**Answer:**
Measure latency distributions (p50, p99, p99.9, max) under realistic load before and after, and confirm the mechanism: count allocations on the hot path (should be zero after warm-up), count page faults, and check memory usage. An improved average with an unchanged tail means the pool did not fix the real problem.

**Explanation:**
- Allocation counting: a guard/counting `memory_resource`, a replaced `operator new` in tests, or heap profilers (heaptrack, jemalloc stats).
- Page faults: `perf stat -e page-faults,minor-faults` on the process; pre-faulting should move them to startup.
- Compare with a realistic workload: microbenchmarks in a tight loop make `malloc` look perfect because its caches stay hot.
- Watch for regressions: a too-small pool falling back to the heap, or a monotonic arena growing because of container churn.
- ❌ Common wrong answer: "Run a loop of a million allocations and compare the time."
- ✅ What a strong answer adds: monitor the pool's high-water mark and exhaustion events in production.

**Key takeaway:** Prove it with tail percentiles plus zero hot-path allocations, not with an average.
