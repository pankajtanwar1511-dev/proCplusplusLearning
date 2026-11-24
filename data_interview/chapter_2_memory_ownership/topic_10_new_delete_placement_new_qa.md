## TOPIC: new/delete, Placement New and Object Storage

### INTERVIEW_QA: Interview Questions with Detailed Answers

#### Q1: What is the difference between the `new` expression and `operator new`?
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

**Key takeaway:** New-expression = allocate + construct; `operator new` = allocate only.

---

#### Q2: Walk through `new Order(5)` when the constructor throws. Is anything leaked?
**Difficulty:** #intermediate
**Category:** #memory #exception_safety
**Concepts:** #new_expression #constructor_exception #operator_delete

**Answer:**
`operator new(sizeof(Order))` allocates, the constructor runs and throws, and the new-expression itself calls the matching `operator delete` on that storage before the exception propagates. Nothing leaks, and no destructor runs because the object's lifetime never began.

**Explanation:**
- Output of a traced version: `operator new(4)`, `ctor`, `operator delete`, then the `catch` block; no `dtor` line (theory Example 1).
- Members and bases that were already constructed are destroyed in reverse order (topic 05); only the object's own destructor is skipped.
- With a custom placement form `new (arena) Order(5)`, the compiler calls `operator delete(void*, Arena&)` only if you declared it; otherwise the arena memory leaks silently.
- ❌ Common wrong answer: "The memory leaks because `delete` was never called." The language handles this case.
- ✅ What a strong answer adds: where it does leak is two separate allocations in one expression before C++17 (`f(std::shared_ptr<A>(new A), g())`), which is why `make_shared`/`make_unique` exist (topics 06/07).

**Key takeaway:** A throwing constructor in `new` gives the memory back automatically.

---

#### Q3: Why must `new[]` be paired with `delete[]`? What actually goes wrong with plain `delete`?
**Difficulty:** #beginner
**Category:** #memory #undefined_behaviour
**Concepts:** #array_new #array_cookie #alloc_dealloc_mismatch

**Answer:**
For element types with non-trivial destructors, `new T[n]` allocates extra space (an array cookie) to store `n` and returns a pointer just past it. `delete[]` reads the count, runs `n` destructors and frees the real start of the block. Plain `delete` runs one destructor and frees the wrong address: undefined behaviour, typically a crash or heap corruption.

**Explanation:**
- Measured with GCC: `new D[3]` for a 1-byte class with a destructor requested 11 bytes (3 + 8-byte cookie). Plain `delete` then aborted in glibc with "munmap_chunk(): invalid pointer"; GCC 11 warned "called on pointer with nonzero offset 8".
- For trivially destructible types (`new int[3]`) there is no cookie and plain `delete` often seems to work. It is still UB; ASan reports `alloc-dealloc-mismatch (operator new [] vs operator delete)`.
- The reverse (`delete[]` on a single object) reads a cookie that is not there.
- ❌ Common wrong answer: "Plain `delete` just frees the first element and leaks the rest." The behaviour is undefined; real implementations crash.
- ✅ What a strong answer adds: you avoid the question entirely with `std::vector` or `std::unique_ptr<T[]>`, which always use the right form.

**Key takeaway:** The array form carries hidden bookkeeping; only `delete[]` knows how to read it.

---

#### Q4: Can memory from `malloc` be released with `delete`, or memory from `new` with `free`? Can you use `malloc`ed memory for C++ objects at all?
**Difficulty:** #beginner
**Category:** #memory #undefined_behaviour
**Concepts:** #malloc #free #placement_new

**Answer:**
No mixing: `malloc`/`free` and `new`/`delete` are separate allocation families and crossing them is UB, even if the default `operator new` happens to call `malloc`. You can construct objects in `malloc`ed memory with placement new; then you must destroy them explicitly and release with `free`.

**Explanation:**
- `delete` also runs a destructor that `malloc` never paired with a constructor.
- A replaced global `operator new` (jemalloc, counting allocator) can use a completely different heap.
- Correct mixed use:
```cpp
void* raw = std::malloc(sizeof(Order));
Order* p = ::new (raw) Order(1);
std::destroy_at(p);
std::free(raw);
```
- For implicit-lifetime types (plain structs, scalars), C++20 says `malloc` implicitly creates the object, so `static_cast<Header*>(std::malloc(sizeof(Header)))` is usable directly. A `std::string` is not implicit-lifetime: it needs a real constructor call.
- ❌ Common wrong answer: "It works on Linux because `new` calls `malloc`." It works until the allocator or the type changes.
- ✅ What a strong answer adds: C APIs that return `malloc`ed memory should be wrapped in `std::unique_ptr<T, decltype(&std::free)>` (or a stateless deleter) so the right function is always used.

**Key takeaway:** Pair each allocation with its own family's release; construct with placement new in foreign storage.

---

#### Q5: What happens when `new` cannot allocate memory?
**Difficulty:** #intermediate
**Category:** #memory #error_handling
**Concepts:** #bad_alloc #nothrow #new_handler #overcommit

**Answer:**
The ordinary `operator new` calls the installed new_handler (if any) in a loop, retrying after each call; with no handler it throws `std::bad_alloc`. It never returns `nullptr`. Only `new (std::nothrow) T` returns `nullptr`. On Linux with overcommit, large allocations often succeed anyway and real exhaustion surfaces later as an OOM kill.

**Explanation:**
- new_handler contract: free some memory (e.g. release a reserved emergency block), install a different handler, throw `bad_alloc`, or terminate. Returning without doing any of these loops forever.
- `new T[n]` with an impossible `n` throws `std::bad_array_new_length`.
- `nothrow` only covers allocation: a throwing constructor still throws.
- Overcommit: `malloc(8 GiB)` reserves address space; pages are assigned on first touch. `new char[1ULL << 46]` (64 TiB) does fail immediately with `bad_alloc` on a typical box.
- ❌ Common wrong answer: "Check for `nullptr` after `new`." Dead code with plain `new`.
- ✅ What a strong answer adds: in latency-sensitive services, allocation failure is rarely recoverable in place; preallocation and bounded queues are the real defence.

**Key takeaway:** Plain `new` throws (after the new_handler); `nothrow` returns null; Linux may defer failure to the OOM killer.

---

#### Q6: Why would you write a class-specific `operator new`, and what does it not intercept?
**Difficulty:** #intermediate
**Category:** #memory #customization
**Concepts:** #class_operator_new #make_shared #pools

**Answer:**
To route all `new T` / `delete p` of one type to a special allocator: a free list or pool for a hot fixed-size type, shared memory, or instrumentation. It does not intercept `new T[n]` (needs `operator new[]`), `::new T`, or `std::make_shared` / `allocate_shared`, which allocate the object together with the control block through `std::allocator`.

**Explanation:**
- Class `operator new`/`delete` are implicitly `static`; derived classes inherit them and pass their own larger size (`sizeof(Derived)`).
- Always provide the matching `operator delete`; it is also what the new-expression uses when a constructor throws.
- Verified: with `T::operator new` printing, `std::make_shared<T>()` printed nothing.
- For pool-backed shared objects use `std::allocate_shared` with an allocator over the pool, or a `shared_ptr` with a custom deleter.
- ❌ Common wrong answer: "Overloading `operator new` for the class guarantees every instance lives in my pool." Not for stack objects, members, arrays, `make_shared` or `::new`.
- ✅ What a strong answer adds: `std::pmr` gives per-container allocation control without touching the class (topic 11).

**Key takeaway:** Class `operator new` covers `new T` only; know the bypasses.

---

#### Q7: When and how would you replace the global `operator new`?
**Difficulty:** #advanced
**Category:** #memory #testing
**Concepts:** #global_replacement #allocation_counting #allocators

**Answer:**
Define `void* operator new(std::size_t)` and `void operator delete(void*) noexcept` (plus sized, array, aligned and nothrow forms as needed) in one translation unit; the linker uses them program-wide, including inside the standard library. Common uses: counting allocations in tests to prove a hot path is allocation-free, switching to jemalloc/tcmalloc/mimalloc, or adding debug guards and statistics.

**Explanation:**
- Contract: never return `nullptr` (throw `bad_alloc`), return a unique pointer for size 0, align to `__STDCPP_DEFAULT_NEW_ALIGNMENT__`.
- Do not call anything that allocates inside it (`std::cout`, `std::string`): infinite recursion or use before initialization.
- Measured with a counting replacement (theory Example 2): 1000 `push_back`s without `reserve` = 11 allocations, with `reserve` = 1; `std::string` of 15 chars = 0 (SSO), 16 chars = 1.
- Allocator libraries usually replace `malloc` itself via `LD_PRELOAD` or linking, which covers C code too.
- ❌ Common wrong answer: "Replace only `operator new`." Unpaired replacement (custom `new`, default `delete`) breaks as soon as the two use different heaps.
- ✅ What a strong answer adds: a test that runs the hot path once to warm up, then asserts the allocation counter does not change over the next N iterations.

**Key takeaway:** Global replacement is a link-time switch for the whole program; replace the whole family.

---

#### Q8: What problem did aligned new (C++17) solve?
**Difficulty:** #intermediate
**Category:** #memory #alignment
**Concepts:** #align_val_t #over_aligned #cache_line

**Answer:**
Before C++17, `new` only guaranteed the default alignment (16 bytes on x86-64), so `new CacheLine` for `struct alignas(64) CacheLine` could return a pointer that was not 64-byte aligned, silently breaking false-sharing padding and SIMD code. Since C++17 the compiler calls `operator new(std::size_t, std::align_val_t)` for over-aligned types, and `std::allocator` honours the alignment too.

**Explanation:**
- Threshold: `__STDCPP_DEFAULT_NEW_ALIGNMENT__` (16 on GCC/Clang x86-64). Types above it use the aligned overloads automatically.
- Verified: a class with `operator new(std::size_t, std::align_val_t)` printing got `aligned new(64, 64)` and a 64-byte aligned address.
- Custom allocators and replaced `operator new` must provide the `align_val_t` overloads or over-aligned types bypass them.
- Raw buffers: `alignas(T) std::byte buf[sizeof(T)]`, or `std::aligned_alloc` (released with `free`).
- ❌ Common wrong answer: "`alignas` on the type is enough, `new` always respects it." Only from C++17.
- ✅ What a strong answer adds: alignment and layout details belong to topic 12; the allocation side is just "use C++17 or later and provide aligned overloads in custom allocators".

**Key takeaway:** C++17 made `new` honour `alignas`; custom allocators must follow.

---

#### Q9: Does placement new allocate memory? How do you clean up an object created with it?
**Difficulty:** #beginner
**Category:** #memory #object_lifetime
**Concepts:** #placement_new #explicit_destructor #destroy_at

```cpp
alignas(Order) unsigned char storage[sizeof(Order)];
Order* p = new (storage) Order(10, 99.5);
```

**Answer:**
No. Placement new constructs an `Order` in storage you already own (here a stack buffer; it could be a pool slot or shared memory). To clean up, end the object's lifetime with `p->~Order()` or `std::destroy_at(p)` (C++17); the storage is released separately by whoever owns it. `delete p` is undefined behaviour.

**Explanation:**
- `delete p` would run the destructor and then pass a stack address to `operator delete`: ASan "attempting free on address which was not malloc()-ed".
- After destruction the storage can be reused for another object.
- Requirements: storage large enough and aligned for `Order`, and not holding a live object that still needs destroying.
- ❌ Common wrong answer: "`delete p` frees the buffer so it can't be reused." The issue is not reuse: the storage was never allocated by `operator new`, so `delete` is invalid.
- ✅ What a strong answer adds: in generic code use `::new (static_cast<void*>(addr)) T(...)` or `std::construct_at` (C++20) to avoid picking up class-specific placement overloads.

**Key takeaway:** Placement new constructs only; destroy explicitly, release storage separately.

---

#### Q10: After `p->~Order(); Order* q = new (storage) Order(20, 199.5);` are `*p` and `*q` the same object?
**Difficulty:** #intermediate
**Category:** #object_lifetime #object_model
**Concepts:** #storage_reuse #lifetime #transparent_replacement

**Answer:**
No. They are two different objects with two different lifetimes that happen to occupy the same storage at different times. The storage lives longer than either object.

**Explanation:**
- Timeline: storage lifetime spans everything; Order #1 lives from its placement new to its destructor; Order #2 from the second placement new to its destructor.
- Whether the old pointer `p` may be used to reach Order #2 is governed by the **transparent replacement** rules: same type and storage, old object not a `const` complete object, not a base subobject. In C++17, `const` or reference members also disqualified it (needed `std::launder`); C++20 removed that restriction.
- Same address does not imply same object over time: the same reasoning underlies the ABA problem in lock-free code.
- ❌ Common wrong answer: "Same address and type, so it's the same object with new values." The first object's lifetime ended at its destructor.
- ✅ What a strong answer adds: object pools rely on exactly this separation: slots (storage) persist, orders (objects) come and go.

**Key takeaway:** Storage lifetime and object lifetime are different things; reuse creates a new object.

---

#### Q11: What is `std::launder` for?
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

**Key takeaway:** `launder` gets you a valid pointer to a new object in reused storage; prefer keeping the pointer from construction.

---

#### Q12: Why do `std::destroy_at` and `std::construct_at` exist if `p->~T()` and placement new already work?
**Difficulty:** #intermediate
**Category:** #memory #generic_programming
**Concepts:** #destroy_at #construct_at #constexpr

**Answer:**
`std::destroy_at` (C++17) is a uniform way to destroy any type, including arrays (C++20) and types whose destructor name is awkward in generic code. `std::construct_at` (C++20) is placement new usable in `constexpr` evaluation (placement new itself is not allowed in constant expressions before C++26), and it always uses the global non-allocating form.

**Explanation:**
- They make allocator-aware containers implementable in `constexpr` (C++20 `constexpr std::vector`/`std::string`).
- Related: `std::destroy`, `std::destroy_n`, `std::uninitialized_copy/move/fill`, `std::uninitialized_default_construct`, `std::uninitialized_value_construct` (the latter two C++17) construct or destroy whole ranges with rollback on exceptions.
- Versions: `destroy_at` compiles with `-std=c++17`; `construct_at` needs `-std=c++20` (verified: "'construct_at' is not a member of 'std'" under C++17).
- ❌ Common wrong answer: "Both were added in C++20." `destroy_at` is C++17.
- ✅ What a strong answer adds: when building several objects by hand, use the `uninitialized_*` algorithms so a throwing constructor destroys the ones already built.

**Key takeaway:** `destroy_at` (C++17) and `construct_at` (C++20) are the generic, constexpr-friendly forms.

---

#### Q13: Can you `reinterpret_cast` a received network buffer to a header struct pointer? What do you do instead?
**Difficulty:** #advanced
**Category:** #undefined_behaviour #low_latency
**Concepts:** #strict_aliasing #alignment #bit_cast #start_lifetime_as

**Answer:**
Formally no: no `Header` object exists in those bytes, reading them as `uint32_t` violates strict aliasing, the offset may be misaligned, and padding/endianness must match. Copy the bytes into a local struct with `std::memcpy` (compiled to a plain load), use `std::bit_cast` (C++20) for same-size values, or C++23 `std::start_lifetime_as<Header>(p)` for an in-place view of suitably aligned bytes.

**Explanation:**
- UBSan on a cast at offset 3: "member access within misaligned address ... for type 'struct Header', which requires 4 byte alignment".
- `memcpy` handles alignment and aliasing; at `-O2` there is no function call.
- C++20 implicit object creation (P0593) covers `malloc`/`memcpy`/byte arrays for implicit-lifetime types, but data written by the OS into a buffer plus an arbitrary cast is still not a well-defined pattern; `start_lifetime_as` is the explicit tool (library support is still limited; GCC 11 does not have it).
- Endianness: convert with `ntohl`/`std::byteswap` (C++23); check `std::endian::native` (C++20).
- ❌ Common wrong answer: "It's fine on x86 because misaligned loads work." The optimizer reasons with the C++ rules, not with x86's tolerance; and the code is not portable.
- ✅ What a strong answer adds: validate the length field before reading the payload; a malformed packet must not cause out-of-bounds reads.

**Key takeaway:** `memcpy`/`bit_cast`/`start_lifetime_as`, never a raw cast of wire bytes.

---

#### Q14: Why is heap allocation considered a source of latency jitter? Does every `new` take a lock and make a system call?
**Difficulty:** #intermediate
**Category:** #performance #low_latency
**Concepts:** #malloc #tcache #arenas #page_faults

**Answer:**
No. In glibc most small allocations are a per-thread tcache pop with no lock and no syscall. The jitter comes from the slow paths you cannot predict at the call site: arena bin searches and locks, coalescing on free, growing the heap with `brk`/`mmap`, and page faults when fresh pages are first touched. Low-latency code removes these from the hot path by preallocating.

**Explanation:**
- Fast: tcache (up to 7 chunks per size class, sizes up to 1032 bytes by default).
- Slower: arena bins under a lock; glibc spreads threads over up to 8 × cores arenas.
- Slowest: `mmap` for blocks ≥ 128 KiB (threshold adapts), `brk` growth, page faults on first touch (kernel zeroes each page).
- Cross-thread free (producer allocates, consumer frees) adds contention and poor locality.
- Remedies: `reserve`, object pools, arenas / `std::pmr` (topic 11), pre-faulting memory at startup, faster allocators (jemalloc, tcmalloc, mimalloc), and an allocation-counting test.
- ❌ Common wrong answer: "`new` always takes a lock and goes to the kernel." That overstates the common case and loses credibility.
- ✅ What a strong answer adds: "The issue is the tail (p99/p99.9), not the average; you don't know which path a given allocation takes."

**Key takeaway:** Allocation is usually cheap but unpredictable; predictability is what pools buy.

---

#### Q15: What is the difference between internal and external fragmentation?
**Difficulty:** #beginner
**Category:** #memory #allocators
**Concepts:** #fragmentation #size_classes

**Answer:**
External fragmentation: free memory exists in total but is split into holes that cannot satisfy a request (or cannot be returned to the OS). Internal fragmentation: the allocator gives a block bigger than requested (size classes, alignment, headers), wasting space inside each allocation.

**Explanation:**
- External example: `USED | free 32 | USED | free 16 | USED | free 64 | USED`: 112 bytes free, no 100-byte block.
- Internal example: glibc rounds a 24-byte request into a 32-byte chunk with header overhead; a pool of 256-byte slots storing 70-byte objects wastes 186 bytes per slot.
- Long-running processes with mixed lifetimes and sizes suffer external fragmentation most; fixed-size pools and arenas by lifetime avoid it.
- ❌ Common wrong answer: "Fragmentation means memory is leaked." Nothing is leaked; it is unusable or unreturnable.
- ✅ What a strong answer adds: fragmentation is one reason RSS stays high after frees (Q16).

**Key takeaway:** External = unusable holes between blocks; internal = waste inside blocks.

---

#### Q16: Memory usage keeps growing but every allocation is eventually freed. What could cause it, and how do you investigate?
**Difficulty:** #intermediate
**Category:** #debugging #memory
**Concepts:** #rss #retention #capacity #fragmentation

**Answer:**
Retention rather than a leak: containers keeping their capacity, unbounded queues or backlogs during bursts, caches without eviction, pools that grow to a high-water mark, objects reachable longer than intended, and allocator behaviour (heap top pinned by one live block, fragmentation, per-thread arenas). Investigate with RSS over time against load, heap profiling, container sizes and capacities, pool high-water marks and allocator statistics.

**Explanation:**
- Measured (glibc): 200 000 × 256-byte blocks, all freed except the last: RSS stayed at about 58 MB; `malloc_trim(0)` brought it back to about 5 MB (theory Example 7).
- `vector::clear()` keeps the buffer; `shrink_to_fit()` (non-binding) or swapping with an empty vector releases it.
- Deep copies instead of moves cost CPU and temporary memory, but if the copies are destroyed they do not explain persistent growth.
- Tools: heaptrack, massif, jemalloc/tcmalloc heap profiles, `malloc_info`, `/proc/<pid>/smaps`.
- ❌ Common wrong answer: "If valgrind reports no leaks, memory can't grow." Leak checkers find unreachable memory, not retained memory.
- ✅ What a strong answer adds: bound every queue and cache explicitly, and decide the overflow policy (drop, block, shed load).

**Key takeaway:** Growing RSS without leaks means retention; find where memory is held, not where `delete` is missing.

---

#### Q17: Is `delete this` legal?
**Difficulty:** #intermediate
**Category:** #object_lifetime #undefined_behaviour
**Concepts:** #delete_this #intrusive_refcount

**Answer:**
Yes, if the object was allocated with plain `new` (not `new[]`, not placement, not on the stack or as a member), and after `delete this` the function touches no members, `this`, or virtual functions, and no caller uses the object again.

**Explanation:**
- Classic use: intrusive reference counting (`void release() { if (--refs_ == 0) delete this; }`) and COM-style objects.
- Any member access after the `delete` is a use-after-free.
- Forcing heap allocation: make the destructor private/protected so stack instances fail to compile.
- ❌ Common wrong answer: "Never legal, an object can't delete itself." It is legal; it is just easy to misuse.
- ✅ What a strong answer adds: with an atomic refcount, use `fetch_sub(1, std::memory_order_acq_rel) == 1` before `delete this` so all prior writes are visible to the deleting thread.

**Key takeaway:** `delete this` is fine for `new`-allocated objects if nothing touches the object afterwards.

---

#### Q18: What is the difference between `new T`, `new T()` and `new T{}`?
**Difficulty:** #beginner
**Category:** #initialization #memory
**Concepts:** #default_initialization #value_initialization

**Answer:**
`new T` default-initializes: scalars and members of classes with a trivial (or defaulted, non-initializing) default constructor are left indeterminate. `new T()` and `new T{}` value-initialize: they zero those members first if the default constructor is not user-provided, then run it. With a user-provided constructor all three just call it.

**Explanation:**
- `new int` → indeterminate; `new int()` / `new int{}` → 0.
- `struct P { int x; };`: `new P` leaves `x` indeterminate, `new P()` zeroes it.
- `struct Q { int x; Q() {} };`: `new Q()` does not zero `x`: the constructor is user-provided.
- Arrays: `new int[5]` indeterminate, `new int[5]()` and `new int[5]{}` zero.
- Reading an indeterminate value is UB; MemorySanitizer (Clang) or Valgrind memcheck catch it, ordinary tests often do not. (`-ftrivial-auto-var-init` only initializes stack variables; it does nothing for heap objects.)
- Pedantic detail: for an aggregate such as `P`, `new P{}` is formally aggregate initialization rather than value-initialization; the effect on `x` (zero) is the same.
- ❌ Common wrong answer: "Heap memory is always zeroed." Fresh pages from the OS are zero, recycled chunks are not.
- ✅ What a strong answer adds: `std::make_unique<T>()` value-initializes; `std::make_unique_for_overwrite<T>()` (C++20) default-initializes deliberately to skip zeroing large buffers.

**Key takeaway:** Parentheses or braces value-initialize; bare `new T` may leave garbage.

---

#### Q19: How would you guarantee that a latency-critical path performs no heap allocation?
**Difficulty:** #advanced
**Category:** #low_latency #testing
**Concepts:** #allocation_free #preallocation #allocation_counting

**Answer:**
Design it in (preallocate everything at startup: `reserve`d containers, fixed-capacity buffers, object pools or arenas, no `std::function` or `std::string` growth on the path), then enforce it with a test that replaces global `operator new` with a counter and asserts zero allocations across many iterations after warm-up.

**Explanation:**
- Hidden allocators: `std::string` beyond SSO, `std::function` with large captures, `std::shared_ptr` creation, `std::map`/`unordered_map` inserts, exceptions (`__cxa_allocate_exception`), logging/formatting, `std::vector` growth.
- Pre-fault memory (touch every page, optionally `mlock`) so the first real message does not pay page faults.
- `std::pmr::monotonic_buffer_resource` with `null_memory_resource()` upstream turns an unexpected allocation into a `bad_alloc` you see in testing (topic 11).
- Production monitoring: allocator statistics or eBPF uprobes on `malloc` for the hot thread.
- ❌ Common wrong answer: "Use `new` carefully." Without a test, allocations creep back in through library calls.
- ✅ What a strong answer adds: allocation-free is a property you regression-test, like correctness.

**Key takeaway:** Preallocate by design, prove it with an allocation-counting test.
