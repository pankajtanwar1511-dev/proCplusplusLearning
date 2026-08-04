## TOPIC: C++26 Library Additions - Linear Algebra, Data-Parallel Types, and Concurrency Utilities

### INTERVIEW_QA: Numerics, SIMD, and Lock-Free Reclamation

#### Q1: Why does `std::linalg` operate on `std::mdspan` instead of defining its own owning matrix type?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Building on `mdspan` (C++23) avoids data copying, works with any layout policy, and reuses a view type the standard already has instead of inventing a new owning container.

**Details:**
- `std::linalg` (P1673) operates directly on caller-owned buffers wrapped in `mdspan` -- no copying data into a library-owned matrix type at API boundaries
- It's layout-aware: the same algorithm works whether the underlying buffer is `layout_left` (column-major/Fortran convention), `layout_right` (row-major/C convention), or a custom `layout_stride`
- Any contiguous or strided buffer -- including one handed to you by a C API or another library -- can be wrapped in an `mdspan` at zero cost and passed straight to `std::linalg`
- Compared to linking an external BLAS implementation, there's no separate build dependency and no library-specific row/column-major convention exposed at the API surface

**Key Concept:** #linalg #mdspan #cpp26 #numerics

</details>

---

#### Q2: A `std::linalg::matrix_product` call using `mdspan`s with dynamic extents compiles even though the shapes are actually incompatible at runtime. Is this a bug in the library?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** No -- this is inherent to dynamic extents, not a library bug. Shape checking with `std::linalg` is only a compile-time, type-level guarantee when the `mdspan` extents are static.

**Details:**
```cpp
std::mdspan<double, std::dextents<std::size_t, 2>> A(a_data.data(), 3, 2);
std::mdspan<double, std::dextents<std::size_t, 2>> B(b_data.data(), 3, 3);  // wrong inner dim
```
- With `dextents`, the shape is a runtime value stored in the object, not part of the type -- `A` and `B` above have the identical `mdspan` type despite having incompatible shapes for multiplication
- The compiler has nothing to check against; the mismatch can only be detected (if at all) when the operation actually runs, as a runtime precondition violation
- With fully static `extents<std::size_t, 3, 2>` vs. `extents<std::size_t, 3, 3>`, the shapes ARE part of the type, and a genuinely incompatible product is typically ill-formed at compile time
- **Practical takeaway:** teams that default to `dextents` everywhere lose the type-level safety that made `mdspan`-based code look safer than raw pointer arithmetic in the first place

**Key Concept:** #linalg #mdspan #static_vs_dynamic_extents #cpp26

</details>

---

#### Q3: What is the fundamental difference in storage between `std::inplace_vector<T, N>`, `std::array<T, N>`, and `std::vector<T>`?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** All three avoid... no -- only `array` and `inplace_vector` avoid heap allocation (storage is inline); `vector` always heap-allocates. The key difference between `array` and `inplace_vector` is that `array`'s size always equals `N` (every element constructed), while `inplace_vector`'s runtime `size()` varies from `0` to `N`.

**Comparison:**
| Aspect | `std::array<T,N>` | `std::inplace_vector<T,N>` | `std::vector<T>` |
|---|---|---|---|
| Storage | Inline | Inline | Heap |
| Runtime size | Always `N` | `0..N`, variable | `0..capacity`, variable, capacity grows |
| `push_back` | N/A | Available up to `N` | Available, may reallocate |
| Exceeding capacity | N/A | Throws / precondition violation | Reallocates transparently |

- `inplace_vector<T, N>` (P0843) gives you `vector`'s dynamic-`size()`, `push_back`-style interface, but with `array`'s inline, no-allocation storage, at the cost of a hard, fixed capacity ceiling of `N`
- Motivating use case: embedded/real-time/hot-path code that needs a variable-length collection with a known worst-case bound, without heap allocation's latency/fragmentation risk

**Key Concept:** #inplace_vector #cpp26 #embedded #no_allocation

</details>

---

#### Q4: What happens when you call `push_back` on a full `std::inplace_vector<T, N>`, and why is this a common migration bug when porting code from `std::vector`?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** It throws (or is a precondition violation, depending on the member used) instead of reallocating -- code that assumed `push_back` "always succeeds" (a safe assumption for `vector`, barring `bad_alloc`) breaks the first time input exceeds `N`.

**Details:**
- `std::vector::push_back` reallocates transparently when it runs out of capacity; the caller essentially never has to think about it
- `std::inplace_vector<T, N>::push_back` has no reallocation fallback by design -- `N` is a hard, compile-time ceiling, not a starting hint
- Code migrated from a `vector`-backed API to `inplace_vector` for its no-allocation guarantee, without auditing every `push_back`/`emplace_back` call site, can pass code review and tests (which happen to stay under `N`) and then fail in production the first time real input exceeds it
- Some designs expose `try_push_back`-style APIs (returning a bool or `expected` rather than throwing) precisely so callers that expect to sometimes hit capacity can handle it without exceptions

**Key Concept:** #inplace_vector #cpp26 #migration_pitfall #capacity

</details>

---

#### Q5: Why can a large `N` in `std::inplace_vector<T, N>` be a worse choice than `std::vector<T>`, even though it avoids heap allocation?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Because storage is inline, `sizeof(inplace_vector<T,N>)` scales with `N * sizeof(T)` -- a large `N` makes every instance of the containing type large, wherever it lives (stack frame, array, or by-value parameter), unlike `std::vector`'s constant, small `sizeof`.

**Example of the trap:**
```cpp
struct Packet {
    std::inplace_vector<std::byte, 65536> payload;  // ~64 KB inline, every instance
    int sequence_number;
};
// sizeof(Packet) is ~64 KB regardless of how many bytes payload actually holds
```
- A stack array of 100 such `Packet`s reserves roughly 6.4 MB of stack space -- a realistic stack-overflow risk
- Passing such a type by value copies the full inline buffer every call, even when mostly unused
- With `std::vector<std::byte>` instead, `sizeof(Packet)` would stay small (pointer + sizes), and the large buffer would live on the heap where it belongs for bulk, rarely-copied data
- **Rule of thumb:** `inplace_vector` is a good fit for small-to-moderate, frequently-allocated buffers; a large `N` is a poor fit for a type that's stack-allocated in bulk or copied by value often

**Key Concept:** #inplace_vector #cpp26 #object_size #stack_overflow

</details>

---

#### Q6: What problem does `std::simd<T>` solve that compiler auto-vectorization does not?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Auto-vectorization is heuristic-driven and can silently fail to vectorize a loop after a seemingly small code change; `std::simd<T>` gives explicit, portable data-parallel arithmetic that the programmer controls directly, without dropping to non-portable compiler intrinsics.

**Details:**
- Historically, using CPU SIMD registers meant either compiler-specific intrinsics (`__m256`, `_mm256_add_ps`) -- fast but unreadable and non-portable -- or hoping the compiler auto-vectorizes a scalar loop, which is easily defeated by unrelated-looking code changes
- `std::simd<T>` (P1928) is a portable, explicit data-parallel type: arithmetic on `simd` objects (`va + vb`) is lowered by the implementation to the appropriate vector instructions for the target architecture, while the source stays standard C++
- The programmer explicitly controls which operations are vectorized and how, at the cost of writing lane-width-aware code (including a scalar "tail" for elements that don't divide evenly into the vector width)

**Key Concept:** #simd #cpp26 #vectorization #portability

</details>

---

#### Q7: How does `std::simd` (C++26) differ in scope from the parallel algorithm execution policies introduced in C++17?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** They parallelize at different levels -- execution policies (`std::execution::par`/`par_unseq`) are a *request* to an algorithm to parallelize/vectorize across elements, potentially across threads; `std::simd` is an *explicit type* the programmer computes with directly, operating within a single core across vector-register lanes.

**Comparison:**
| Mechanism | Level of parallelism | What you write |
|---|---|---|
| `std::execution::par` | Across elements, potentially across threads | A normal algorithm call; the library decides how to split work |
| `std::execution::par_unseq` | Across elements, threads and/or vectorization | Same call site; permits but doesn't guarantee SIMD |
| `std::simd<T>` | Within a core, across vector-register lanes | Explicit `simd` arithmetic expressions |

- Execution policies are a hint you hand to an algorithm and the implementation decides how (or whether) to use multiple cores/vector units
- `std::simd` is a concrete data type: you explicitly write `va + vb` and get lane-parallel arithmetic, but you own the responsibility for lane-width-aware looping (tail handling, bounds)
- The two are complementary, not competing -- an implementation could in principle use `simd`-like lane parallelism *underneath* a `par_unseq` algorithm call

**Key Concept:** #simd #execution_policies #cpp17 #cpp26 #parallelism_levels

</details>

---

#### Q8: What problem do hazard pointers solve for lock-free data structures, and what is the core mechanism?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** They prevent use-after-free in lock-free structures without a lock or a full garbage collector: a reader publishes the address it's about to dereference into a visible "hazard" slot, and a thread wanting to reclaim memory first checks that no one has hazarded it.

**Mechanism (P2530):**
```cpp
auto hp = std::make_hazard_pointer();
Node* n = hp.protect(shared_atomic_node_ptr);  // publish + load
use(n);                                        // safe while hp protects it
```
- Before dereferencing a shared pointer to a node, a reading thread publishes that pointer's address in a hazard slot associated with itself
- A thread that has unlinked a node and wants to free it scans all threads' hazard slots first; if none list that node, reclamation proceeds; otherwise it's deferred (typically via a per-thread retirement list) until a later scan shows it's clear
- The cost is per-access bookkeeping: every protected read publishes/clears a hazard pointer slot

**Key Concept:** #hazard_pointers #cpp26 #lock_free #memory_reclamation

</details>

---

#### Q9: What happens if a hazard pointer is published but the code path that would clear it is never reached (e.g. due to an early return or a lifetime-management bug)?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** The protected node is permanently (spuriously) marked "in use" from the reclaimer's point of view, even after the thread has genuinely stopped using it -- this manifests as a slow, hard-to-diagnose memory leak in the retirement list, not a crash.

**Details:**
- Hazard pointer protection is typically tied to the hazard-pointer object's own lifetime (e.g. cleared on destruction)
- If that object's destructor is never reached on some code path -- an early return before the natural end of scope combined with a bug that keeps it alive elsewhere, or a container that leaks the hazard-pointer object -- the hazard slot stays occupied indefinitely
- Every retired node that this stale hazard "protects" can never be reclaimed by any thread's scan
- This kind of bug is dangerous specifically because it degrades gradually (a slow leak under sustained load) rather than failing loudly and immediately

**Key Concept:** #hazard_pointers #cpp26 #memory_leak #lifetime_bugs

</details>

---

#### Q10: What is the core trade-off between hazard pointers and RCU, and how would you decide which to use for a given concurrent data structure?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Hazard pointers cost readers a small per-access bookkeeping fee but reclaim individual nodes cheaply; RCU costs readers almost nothing but requires the writer to copy the whole object and wait for a grace period. Choose based on the read/write ratio and whether whole-object copying on write is affordable.

**Comparison:**
| Aspect | Hazard Pointers | RCU |
|---|---|---|
| Reader cost | Publish/clear a hazard pointer per access | Near-zero, no per-access bookkeeping |
| Writer cost | Unlink node, scan hazards before reclaiming | Allocate a full new copy, swap, wait for grace period |
| Best fit | Frequent, fine-grained mutation (lock-free stacks/queues) | Read-mostly data with rare whole-object updates (config, routing tables) |

- Hazard pointers reclaim exactly the node that was removed -- appropriate when structures mutate frequently in small increments and copying the whole structure per update would be wasteful
- RCU trades a full copy (and a grace-period wait) on the rare write path for literally zero synchronization overhead on the (much more frequent) read path -- ideal for data read millions of times per second and written to rarely
- Both are lock-free reclamation strategies; neither is universally "better" -- the choice follows directly from the read/write ratio and mutation granularity

**Key Concept:** #hazard_pointers #rcu #cpp26 #concurrency #tradeoffs

</details>

---

#### Q11: Why must an RCU writer wait for a "grace period" before reclaiming the old copy of the data it just replaced?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Because a reader may have loaded the pointer to the old copy just before the writer's swap and could still be dereferencing it -- freeing immediately reintroduces exactly the use-after-free RCU exists to prevent.

**Details:**
```cpp
Config* old = current_config.exchange(new_config);
delete old;  // BUG: no grace-period wait -- a reader that grabbed `old`
             // right before the exchange may still be using it
```
- RCU readers access shared data with no synchronization at all -- there's no hazard-pointer-style publication step warning writers "I'm using this"
- Because readers announce nothing, the writer's only safety argument is *time-based*: wait until it can prove every reader that started before the swap has since exited its read-side critical section (a "grace period"), THEN reclaim
- Skipping or shortening that wait -- e.g. deleting immediately after the atomic exchange -- reintroduces a race that is inherently timing-dependent: invisible under light load, but present under contention
- The correct pattern always separates the swap from the reclamation with an explicit grace-period synchronization call

**Key Concept:** #rcu #cpp26 #grace_period #use_after_free

</details>

---

#### Q12: What does `std::text_encoding::environment()` actually tell you, and what is a common mistake in how it gets used?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** It reports what the system/locale *claims* its text encoding is -- it says nothing about the actual bytes in a specific piece of data, especially data from an external source. A common mistake is using it to justify decoding arbitrary incoming bytes (a file, a network payload) as if the environment's encoding were a guarantee about that data's provenance.

**Details:**
```cpp
auto enc = std::text_encoding::environment();
if (enc.mib() == std::text_encoding::id::UTF8) {
    decode_as_utf8(file_bytes);  // BUG if file_bytes wasn't actually authored as UTF-8
}
```
- `std::text_encoding` (P1885) gives a standard vocabulary type -- an enumerated identifier plus a name -- for querying the environment's/locale's claimed encoding, replacing non-portable calls like POSIX's `nl_langinfo(CODESET)` or Windows' `GetACP()`
- It's a reasonable default assumption for text your own program *produces* under the current locale
- It provides no guarantee -- and is not a detector -- for arbitrary externally-sourced bytes (a file with a wrong/missing encoding declaration, a payload from a differently-configured peer); many byte sequences "validly" decode as more than one encoding, so misapplying this assumption can silently corrupt content
- This is also the least settled of the C++26 additions discussed in this topic -- the durable takeaway is the concept (a standard vocabulary type for the environment's encoding), not necessarily every exact member name

**Key Concept:** #text_encoding #cpp26 #internationalization #hedge

</details>

---
