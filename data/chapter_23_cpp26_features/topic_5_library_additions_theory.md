## TOPIC: C++26 Library Additions - Linear Algebra, Data-Parallel Types, and Concurrency Utilities

### THEORY_SECTION: Numerics, SIMD, and Lock-Free Memory Reclamation for C++26

C++26 is not finalized at the time of writing — the ISO C++ committee (WG21) is still landing papers into the working draft, with final ratification expected around 2026. Every feature below has been **voted into the C++26 working draft** by its accepted WG21 proposal number, but wording can still be refined by further papers before final publication. Where a detail is more likely to shift, this section says so explicitly rather than asserting false precision.

This topic rounds out the C++26 chapter's library additions: a BLAS-style linear algebra library, a fixed-capacity vector, portable explicit SIMD types, and two complementary lock-free memory-reclamation techniques for concurrent data structures. `std::execution` (senders/receivers, P2300) is covered in its own dedicated topic in this chapter and is not repeated here.

---

#### 1. `std::linalg` — BLAS-Style Linear Algebra on Top of `std::mdspan` (P1673)

**The problem:** Linear algebra is everywhere in scientific computing, robotics, graphics, and machine learning, yet C++ has never had a standard way to express "multiply this matrix by this vector." Projects either hand-roll nested loops (slow, easy to get index math wrong) or link against an external BLAS (Basic Linear Algebra Subprograms) implementation (OpenBLAS, MKL, Eigen) with its own API, its own build dependency, and its own data ownership model.

**The C++26 answer:** `std::linalg` (`<linalg>`) is a set of **free functions** implementing the standard BLAS operation levels — vector-vector (Level 1: dot products, norms, scaling), matrix-vector (Level 2), and matrix-matrix (Level 3: `matrix_product`) — but instead of inventing a new matrix *type*, it operates directly on `std::mdspan`, the non-owning multidimensional array view introduced in C++23.

```cpp
#include <linalg>
#include <mdspan>
#include <vector>

std::vector<double> a_data(6), b_data(6), c_data(9);
// 3x2 * 2x3 = 3x3
std::mdspan A(a_data.data(), 3, 2);
std::mdspan B(b_data.data(), 2, 3);
std::mdspan C(c_data.data(), 3, 3);

// Fill A, B with data...

// C = A * B  (matrix-matrix product)
std::linalg::matrix_product(A, B, C);

// dot(x, y) — Level 1 vector operation
std::vector<double> x = {1.0, 2.0, 3.0};
std::vector<double> y = {4.0, 5.0, 6.0};
double d = std::linalg::dot(std::mdspan(x.data(), 3),
                             std::mdspan(y.data(), 3));
```

**Why building it on `mdspan` matters:**

| Concern | Owning matrix type (hypothetical) | `std::linalg` over `mdspan` |
|---|---|---|
| Data copying | Often required at API boundaries | Never — operates on the caller's existing buffer |
| Layout flexibility | Fixed internal layout | Works with `layout_left` (column-major/Fortran), `layout_right` (row-major/C), or custom `layout_stride` |
| Interop with existing code | Needs adapters | Any contiguous or strided buffer can be wrapped in an `mdspan` with zero-cost |
| Standard library footprint | A new owning container type | Reuses a view type C++23 already standardized |

Because `mdspan` carries a **layout policy** as a template parameter, `std::linalg` algorithms are layout-aware: multiplying a `layout_left` matrix behaves correctly whether the underlying memory is column-major (as Fortran/BLAS traditionally expects) or row-major, without the caller manually transposing indices.

**Relationship to hand-rolled loops and external BLAS:**

- Compared to hand-rolled nested loops: `std::linalg` centralizes correctness (index math, edge cases) and gives implementations room to dispatch to vendor-optimized code (including a real BLAS) underneath a standard interface.
- Compared to linking an external BLAS: no separate build dependency, no C-style row/column-major convention footguns exposed at the API level, and the interface composes naturally with the rest of the standard library (`mdspan`, execution policies).

`std::linalg` is scoped to **dense** linear algebra; sparse matrix support is not part of this proposal.

---

#### 2. `std::inplace_vector<T, N>` — Fixed-Capacity, Vector-Like Container (P0843)

**The problem:** `std::vector` is dynamically resizable but always heap-allocates its buffer. `std::array<T, N>` avoids heap allocation but has a *fixed size* — all `N` elements are always constructed, and there's no notion of "logically empty slots" without a wrapper like `std::optional<T>` per element.

Many programs — embedded systems, real-time audio/control loops, small hot-path buffers — want the `std::vector` *interface* (dynamic `size()` up to some bound, `push_back`, `emplace_back`, iterators) but with the *storage* of `std::array`: contiguous, inline, no heap allocation, no allocator.

**The C++26 answer:** `std::inplace_vector<T, N>` is exactly that: a vector-like container whose capacity `N` is a **compile-time template parameter** (storage lives inline inside the object, e.g. on the stack or embedded in another struct), but whose `size()` can vary at runtime from `0` up to `N`. Exceeding capacity throws (or is a precondition violation, depending on the member function used) rather than silently reallocating.

```cpp
#include <inplace_vector>

void process_batch() {
    std::inplace_vector<int, 16> buffer;  // 16 ints of inline storage, no heap

    buffer.push_back(1);
    buffer.push_back(2);
    buffer.push_back(3);

    for (int v : buffer) {
        // ...
    }

    // buffer.size() == 3, buffer.capacity() == 16 (fixed at compile time)
}
```

**Comparison table:**

| Aspect | `std::array<T, N>` | `std::inplace_vector<T, N>` | `std::vector<T>` |
|---|---|---|---|
| Storage | Inline (stack/member) | Inline (stack/member) | Heap-allocated |
| Capacity | Fixed = size | Fixed (compile-time `N`) | Dynamic, grows |
| Runtime size | Always `N` (all constructed) | `0..N` (variable) | `0..capacity` (variable, capacity grows) |
| Heap allocation | Never | Never | Yes |
| `push_back`/`emplace_back` | Not available | Available (up to capacity) | Available (unbounded, may reallocate) |
| Exceeding capacity | N/A (size is fixed) | Throws / precondition violation | Reallocates transparently |
| Element construction | All `N` elements always live | Only constructed elements live | Only constructed elements live |

**Motivating use case:** Real-time or embedded code that cannot tolerate heap allocation (or the latency/fragmentation risk of `malloc`) but still needs a variable-length collection bounded by a known worst case — for example, a fixed-size scratch buffer for accumulating up to `N` sensor readings per control cycle, or a small local buffer inside a function that avoids allocation entirely for the common case.

---

#### 3. `std::simd` — Portable Data-Parallel Types (P1928)

**The problem:** Modern CPUs have SIMD (Single Instruction, Multiple Data) vector registers (SSE/AVX on x86, NEON on ARM) that can perform the same arithmetic operation on multiple values ("lanes") in a single instruction. Historically, using this from C++ meant either:

- **Compiler-specific intrinsics** (`__m256`, `_mm256_add_ps`, ...) — fast, but non-portable and unreadable.
- **Relying on auto-vectorization** — the compiler *might* vectorize a scalar loop, but this is heuristic-driven and easily defeated by small changes to the code.

**The C++26 answer:** `std::simd<T>` (and fixed-size variants like `std::simd<T, N>`, plus a native-width alias) is a **portable, explicit** data-parallel type. Arithmetic on `simd` objects is lowered by the implementation to the appropriate vector instructions for the target architecture, while the *source code* stays standard, portable C++ with no intrinsics.

```cpp
#include <experimental/simd>  // std::simd, expected to move under <simd> for C++26
namespace stdx = std::experimental;

void add_arrays(const float* a, const float* b, float* result, std::size_t n) {
    using simd_t = stdx::native_simd<float>;
    std::size_t width = simd_t::size();  // e.g. 8 lanes for AVX256 floats

    std::size_t i = 0;
    for (; i + width <= n; i += width) {
        simd_t va(a + i, stdx::element_aligned);
        simd_t vb(b + i, stdx::element_aligned);
        simd_t vr = va + vb;              // one expression, `width` additions
        vr.copy_to(result + i, stdx::element_aligned);
    }
    // handle remaining tail elements (n % width) with scalar code
}
```

Here, `va + vb` performs `width` (e.g. 8) scalar additions in the time of roughly one vector instruction — the "one expression, many lanes" model is the entire point of the type.

**Contrast with C++17 execution policies:** it's easy to conflate this with the parallel algorithm execution policies (`std::execution::par`, `par_unseq`) covered in an earlier chapter, but they parallelize at a different *level*:

| Mechanism | Level of parallelism | What you write |
|---|---|---|
| `std::execution::par` (C++17) | Across elements, potentially across **threads** | A normal algorithm call (`std::transform(std::execution::par, ...)`); the standard library decides how to split work across cores |
| `std::execution::par_unseq` (C++17) | Across elements, threads **and/or** vectorization | Same call site; permits (but does not guarantee) SIMD use under the hood |
| `std::simd<T>` (C++26) | Within a single core, across **vector-register lanes** | Explicit `simd` arithmetic expressions the programmer writes directly |

In short: execution policies are a *request* to the algorithm implementation ("feel free to parallelize/vectorize this"), while `std::simd` is an *explicit data type* the programmer computes with directly — you control exactly which operations are vectorized and how, at the cost of writing lane-width-aware code yourself (including handling the "tail" of a loop that doesn't divide evenly by the vector width, as shown above).

---

#### 4. Hazard Pointers — `std::hazard_pointer` (P2530)

**The problem lock-free data structures face:** in a lock-free stack or queue, one thread might read a pointer to a node while another thread concurrently removes and deallocates that same node. Without synchronization, the reader can dereference freed memory (a use-after-free) — but adding a lock defeats the point of being lock-free, and a full tracing garbage collector is not something C++ programs generally have available.

**The technique:** hazard pointers are a **lock-free memory-reclamation scheme**. Before a reading thread dereferences a shared pointer to a node, it first publishes that pointer's address into a globally visible "hazard pointer" slot associated with itself, announcing "I am currently using this object; do not reclaim it." A thread that wants to free a node it has unlinked from the structure first scans the hazard pointer slots of all other threads; if none of them list that node's address as a hazard, it's safe to reclaim. If some thread *does* have it hazarded, reclamation is deferred (typically onto a small per-thread retirement list) until a later scan finds it's no longer hazarded by anyone.

```cpp
#include <hazard_pointer>  // std::hazard_pointer, exact header TBD as the paper is finalized

// Conceptual sketch — API details are still being refined in committee:
std::hazard_pointer hp = std::make_hazard_pointer();

Node* n = hp.protect(shared_atomic_node_ptr);  // publish + load
// n is now guaranteed not to be reclaimed while `hp` protects it
use(n);
// hp released (e.g. at scope exit) -> node no longer protected by this thread
```

**What problem this solves conceptually:** it gives concurrent, lock-free data structures a way to safely defer and eventually perform memory reclamation, without a stop-the-world garbage collector and without introducing a mutex that would serialize what was meant to be a lock-free path. The cost is per-access bookkeeping: every protected read publishes/clears a hazard pointer slot.

---

#### 5. RCU — Read-Copy-Update, `std::rcu` (P2545)

**The technique:** RCU targets **read-mostly** data — data read far more often than it's modified. Readers access the shared data with **no synchronization overhead at all** (no atomics, no locks, no published hazard pointers on the read path). A writer that wants to modify the data does not mutate it in place; instead it allocates a **new copy** with the update applied, and atomically swaps a pointer so new readers see the new copy. The *old* copy is not immediately freed — reclamation is deferred until the implementation can prove no reader that started before the swap could still be using it (conceptually, until all pre-existing readers have passed a "grace period" / quiescent point).

```cpp
// Conceptual sketch — exact std::rcu API is still being finalized in committee:
std::rcu_synchronize();       // wait for a grace period (writer side)
std::rcu_read_lock rg;        // reader-side: near-zero-cost critical section
const Config* cfg = current_config.load();
use(*cfg);                    // safe: won't be freed while any reader is "in" a read-side section
```

**RCU vs. hazard pointers — conceptual comparison:**

| Aspect | Hazard Pointers | RCU |
|---|---|---|
| Reader cost | Publish/clear a hazard pointer per protected access | Near-zero — no per-access bookkeeping |
| Writer cost | Unlink node, scan hazards before reclaiming | Allocate a full new copy, swap pointer, wait for a grace period |
| Best fit | Structures with frequent, fine-grained mutation (lock-free stacks/queues) where copying the whole structure per update would be wasteful | Data that changes rarely relative to how often it's read (e.g. configuration objects, routing tables) where copy-on-write is cheap relative to read volume |
| Reclamation trigger | No thread currently hazards the node | No reader could still be in a read-side section spanning the swap |

Both are lock-free reclamation strategies for concurrent data structures; the right choice depends on the read/write ratio and whether "copy the whole object on every write" is affordable.

---

#### 6. `std::text_encoding` — Querying the System Text Encoding (P1885)

**The problem:** programs frequently need to know what text encoding they're operating in — is the environment's "narrow" text encoding UTF-8, Shift-JIS, Latin-1, or something else? Historically this has meant querying platform-specific APIs (`nl_langinfo(CODESET)` on POSIX, `GetACP()`/console code pages on Windows) with no portable, standard vocabulary type to represent the answer.

**The proposed answer:** `std::text_encoding` gives a standard type representing a text encoding (with an enumerated identifier for well-known encodings such as UTF-8, plus a name string), and a way to query the encoding the environment/locale is currently using, so code can make an informed decision (e.g. "assume UTF-8 fast path" vs. "fall back to a conversion routine") instead of hard-coding an assumption or reaching for non-portable platform calls.

```cpp
#include <text_encoding>  // header name/contents still subject to refinement

// Conceptual usage — exact member names may still change before ratification:
std::text_encoding enc = std::text_encoding::environment();
if (enc.mib() == std::text_encoding::id::UTF8) {
    // safe to take the UTF-8 fast path
}
```

This is one of the less-settled additions discussed here — because it depends on locale/encoding conventions that vary a great deal across platforms, the precise API shape (and even which encodings get first-class enumerated identifiers) is more likely to see refinement between now and final ratification than the numerics/concurrency features above. Treat the concept ("a standard vocabulary type for querying text encoding") as the durable takeaway rather than memorizing exact member names.

---

#### 7. Summary Table

| Feature | Paper | One-line purpose | Problem domain |
|---|---|---|---|
| `std::linalg` | P1673 | BLAS-style dense linear algebra free functions over `mdspan` views | Numerics |
| `std::inplace_vector<T, N>` | P0843 | Fixed-capacity, heap-free vector with variable runtime size | Memory footprint / embedded |
| `std::simd<T>` | P1928 | Portable, explicit data-parallel (SIMD) arithmetic type | SIMD / lane-level parallelism |
| `std::hazard_pointer` | P2530 | Lock-free memory reclamation via per-thread "in-use" announcements | Concurrency (fine-grained mutation) |
| `std::rcu` | P2545 | Read-Copy-Update: near-zero-cost reads, copy-and-swap writes | Concurrency (read-mostly data) |
| `std::text_encoding` | P1885 | Standard vocabulary type for querying system/locale text encoding | Text / internationalization |

Together with `mdspan` (C++23) and `std::execution` (senders/receivers, covered separately in this chapter), these additions extend the standard library into numerics, explicit SIMD, and advanced lock-free concurrency — domains that previously required third-party libraries or platform-specific code.

---

#### 8. Compile-Time vs Runtime Breakdown

None of these features are compile-time-only — they all do real work while the program runs. What compile time buys you here is *which code path gets selected*, so the runtime cost is as small and as predictable as possible.

| Construct | Resolved at compile time | What actually happens at runtime |
|---|---|---|
| `std::linalg::matrix_product(A, B, C)` | The specific kernel overload is picked via template dispatch on `A`/`B`/`C`'s element type, extents (static vs. dynamic), and layout policy — no runtime branching to decide "which multiply routine." | The chosen kernel performs the real floating-point multiply-adds — potentially forwarded to a vendor BLAS (MKL, Accelerate, OpenBLAS) linked in underneath. |
| `std::inplace_vector<T, N>::push_back(v)` | `N` is baked into the type itself — there is no runtime "capacity" field to load the way `std::vector` loads one. | Just an index bump (`size_++`) plus a placement-new construct of `v` into storage that already exists inside the object. No allocator call, ever. |
| `std::simd<T>` arithmetic (`a + b`) | The lane width and the specific hardware instruction (AVX2, NEON, etc.) are chosen at compile time for the target ISA. | One vector instruction executes N scalar additions in parallel on real hardware — this *is* the runtime work, just batched. |
| Hazard pointer publish (`hazard_pointer::reset_protection(ptr)`) | No compile-time story — this is pure runtime synchronization. | A real atomic store publishing "I am using this pointer," paid on every protected access. |
| RCU read (`rcu_read_lock` / dereference) | No compile-time story. | Effectively a plain pointer read with no atomic RMW — the cost of safety is deferred entirely to the writer's reclamation step. |

#### 9. Memory Model

**`std::inplace_vector<T, N>` vs. `std::vector<T>` — where the bytes live:**

```
std::inplace_vector<int, 4>              std::vector<int>
┌─────────────────────────┐              ┌───────────────────┐
│ size_  = 2               │              │ size_     = 2      │
│ data_[0] = 10             │              │ capacity_ = 4       │
│ data_[1] = 20             │              │ data_ ───────────┐  │
│ data_[2] = <unused>       │              └───────────────────┘  │
│ data_[3] = <unused>       │                                    │
└─────────────────────────┘                                    ▼
   entirely inline —                                  ┌──────────────┐
   wherever the object lives                          │ heap: [10,20,│
   (stack, or embedded in                              │  _,  _]      │
   another struct)                                     └──────────────┘
                                                        one allocator call
                                                        on first growth
```

`inplace_vector` trades a hard ceiling (`N`) for the guarantee that `push_back` never allocates — the storage is part of the object's own footprint from construction onward.

**Hazard pointers vs. RCU — where the safety cost is paid:**

```
Hazard pointer read:                       RCU read:
  reader: atomic STORE "I'm using P"         reader: plain LOAD of P
  reader: read *P                            reader: read *P
  reader: atomic STORE "done"                 (no announcement — ever)
  ──────────────────────────────             ──────────────────────────
  cost paid PER ACCESS, by the reader        cost paid ONCE, by the writer,
                                              who must wait out a grace
                                              period before reclaiming
                                              the old copy
```

**Why this matters for low-latency code:** `inplace_vector` is a direct tool for removing allocation from a hot path entirely — fixed-capacity order books, bounded ring buffers, or scratch space for a per-tick computation can all use it to guarantee zero calls into the allocator. `std::simd` gives you explicit, portable data-parallelism instead of hoping `-O3` auto-vectorizes a loop the way you need. And the hazard-pointer-vs-RCU choice is exactly the kind of tradeoff a latency-sensitive concurrent system (market-data fan-out to many readers, a hot-reloadable config pointer) has to make deliberately: RCU wins when reads vastly outnumber writes and a bounded reclamation delay is acceptable; hazard pointers win when you need reclamation to happen promptly and can afford the small per-access cost.

---

### EDGE_CASES: Pitfalls in Numerics, Fixed-Capacity Storage, SIMD, and Lock-Free Reclamation

#### Edge Case 1: `std::linalg` Dimension Mismatches — Compile-Time vs. Runtime Detection

`std::linalg` operations are only as safe as the `mdspan` extents describing their operands. Whether a shape mismatch is caught at compile time or only blows up at runtime depends entirely on whether those extents are **static** (fixed in the type) or **dynamic** (a runtime value stored in the `mdspan` object).

```cpp
#include <linalg>
#include <mdspan>
#include <vector>

void static_extents_example() {
    std::vector<double> a_data(6), b_data(9), c_data(9);

    // Static extents: shapes are part of the TYPE.
    std::mdspan<double, std::extents<std::size_t, 3, 2>> A(a_data.data());
    std::mdspan<double, std::extents<std::size_t, 3, 3>> B(b_data.data());  // wrong shape for A*B
    std::mdspan<double, std::extents<std::size_t, 3, 3>> C(c_data.data());

    // std::linalg::matrix_product(A, B, C);
    // ^ With FULLY static, mismatched extents this is typically ill-formed at
    //   compile time (or immediately diagnosable), because the compiler can see
    //   A is 3x2 and B is 3x3 -- a 3x2 * 3x3 product doesn't type-check.
}

void dynamic_extents_example() {
    std::vector<double> a_data(6), b_data(9), c_data(9);

    // Dynamic extents: shapes are runtime VALUES, not part of the type.
    std::mdspan<double, std::dextents<std::size_t, 2>> A(a_data.data(), 3, 2);
    std::mdspan<double, std::dextents<std::size_t, 2>> B(b_data.data(), 3, 3);  // wrong shape, same TYPE as A
    std::mdspan<double, std::dextents<std::size_t, 2>> C(c_data.data(), 3, 3);

    // std::linalg::matrix_product(A, B, C);
    // ^ This compiles fine -- A and B have the identical mdspan TYPE. The
    //   inner-dimension mismatch (A's 2 columns vs. B's 3 rows) is a RUNTIME
    //   precondition violation, not a compile error. Depending on the
    //   implementation this is UB, an assertion, or a thrown exception --
    //   but it is NOT rejected by the type system.
}
```

**The trap:** teams that lean on `dextents` everywhere (often the path of least resistance, since dimensions are usually only known at runtime) lose the compile-time shape-checking that made `mdspan`-based code look "safer" than raw pointer arithmetic in the first place. The safety `std::linalg` offers over hand-rolled loops is a *type-level* guarantee only when extents are static; with dynamic extents, a dimension-mismatch bug looks identical to a well-formed call at the call site, and only manifests when the code actually runs with mismatched buffers.

---

#### Edge Case 2: `std::inplace_vector` Silently-Different Failure Mode on Overflow

Code migrated from `std::vector` to `std::inplace_vector<T, N>` for its no-heap-allocation guarantee can carry over an assumption that `push_back` always succeeds -- true for `vector` (modulo `bad_alloc`), false for `inplace_vector` once `size() == N`.

```cpp
#include <inplace_vector>

void vector_style_assumption(std::inplace_vector<int, 8>& buf, int value) {
    // Ported directly from code that used std::vector<int>&:
    buf.push_back(value);
    // With std::vector, this ALWAYS succeeds (barring OOM).
    // With std::inplace_vector<int, 8>, calling this a 9th time is a
    // precondition violation / throws -- there is no reallocation fallback,
    // by design. The capacity ceiling is exactly the point of the type.
}
```

**The trap:** the bug doesn't show up in code review or in tests that happen to stay under the capacity; it shows up in production the first time input exceeds `N`. `try_push_back`-style APIs (returning a bool/`expected` instead of throwing/asserting) exist precisely so callers who *expect* to sometimes hit capacity can handle it without exceptions -- auditing every `push_back`/`emplace_back` call site during a `vector` → `inplace_vector` migration for "what happens past N" is essential, not optional.

---

#### Edge Case 3: `std::inplace_vector<T, N>` With a Large `N` Bloats the Enclosing Object

Because storage is inline, `sizeof(std::inplace_vector<T, N>)` is proportional to `N * sizeof(T)` -- there is no indirection to hide behind, unlike `std::vector`, whose `sizeof` is constant (a pointer + two sizes) regardless of how many elements it holds.

```cpp
#include <inplace_vector>
#include <cstddef>

struct Packet {
    std::inplace_vector<std::byte, 65536> payload;  // ~64 KB inline, every instance
    int sequence_number;
};

// sizeof(Packet) is now on the order of 64 KB, whether payload actually
// holds 0 bytes or 65536. Putting a Packet on the stack, in a small
// fixed-size array of Packets, or by value in a container that itself
// doesn't expect large elements can overflow the stack or balloon memory
// use in ways that would never happen with std::vector<std::byte> (which
// would keep Packet's size small and put the 64 KB on the heap instead).
```

**The trap:** `inplace_vector` trades "no heap allocation" for "the capacity bound is now a fixed cost paid by every instance, everywhere it lives" -- a large `N` is a reasonable choice for a single long-lived buffer, but a poor default for a type that gets stack-allocated per call or embedded inside another aggregate that's itself copied or stack-allocated frequently.

---

#### Edge Case 4: `std::simd` Code That Silently Depends on a Specific Lane Width

`native_simd<T>::size()` is a **platform-dependent** constant -- it might be 4, 8, or 16 depending on the target's widest available vector instruction set (SSE vs. AVX2 vs. AVX-512, or NEON on ARM). Code that hard-codes an assumed width, rather than querying `size()`, is portable in the sense that it still compiles and produces correct results everywhere, but it silently gives up performance (or, in more contrived hand-written-indexing code, correctness) on hardware with a different native width.

```cpp
#include <experimental/simd>
namespace stdx = std::experimental;

void fragile_width_assumption(const float* a, const float* b, float* out) {
    using simd_t = stdx::native_simd<float>;

    // BAD: assumes exactly 8 lanes (true for AVX256 float, false for
    // SSE-only or AVX-512 hardware). If size() != 8 here, this either
    // wastes available width (SSE: only processes 4 when 4 were available
    // and leaves the rest to scalar/tail code) or under-uses a wider
    // register (AVX-512: only 8 of 16 available lanes used per iteration).
    simd_t va(a, stdx::element_aligned);
    simd_t vb(b, stdx::element_aligned);
    (va + vb).copy_to(out, stdx::element_aligned);
    // Silently correct, silently suboptimal -- and if this were adapted
    // into manual indexing code that assumed "8" as a loop stride instead
    // of querying simd_t::size(), it could read/write out of bounds on a
    // platform with a genuinely different width.
}

void portable_version(const float* a, const float* b, float* out, std::size_t n) {
    using simd_t = stdx::native_simd<float>;
    const std::size_t width = simd_t::size();  // query, don't assume

    std::size_t i = 0;
    for (; i + width <= n; i += width) {
        simd_t va(a + i, stdx::element_aligned);
        simd_t vb(b + i, stdx::element_aligned);
        (va + vb).copy_to(out + i, stdx::element_aligned);
    }
    for (; i < n; ++i) out[i] = a[i] + b[i];  // scalar tail
}
```

**The trap:** always drive loop strides and bounds from `simd_t::size()` (or a fixed-size `simd<T, N>` chosen deliberately, with an explicit fallback path), never from a width observed on one development machine.

---

#### Edge Case 5: Hazard Pointers — Forgetting to Release Permanently Blocks Reclamation

A hazard pointer that is published but never cleared (e.g. the releasing scope-exit logic is skipped due to an early return, an exception, or a bug in manual lifetime management) leaves the protected node permanently marked "in use" from the reclaimer's point of view -- even after the thread has genuinely stopped using it.

```cpp
#include <hazard_pointer>  // conceptual sketch; exact API still settling

void buggy_read(std::atomic<Node*>& shared_ptr) {
    std::hazard_pointer hp = std::make_hazard_pointer();
    Node* n = hp.protect(shared_ptr);

    if (!n) {
        return;  // BUG: hp's protection is only released at its own scope
                 // exit via destructor -- if the API instead required an
                 // explicit hp.reset_protection() call before reuse/reassignment
                 // and that call is missed on this early-return path, or if `hp`
                 // is stored somewhere with a bug in its lifetime management
                 // (e.g. leaked into a container and never destroyed), the
                 // hazard slot stays "occupied" indefinitely.
    }

    use(*n);
}  // if hp's destructor IS reached, the hazard clears here -- the bug class
   // is specifically about hp objects whose lifetime is mismanaged so the
   // clearing step never runs.
```

**The trap:** every retired node that some thread's stale hazard pointer still (spuriously) protects can never be reclaimed -- this presents as a slow, hard-to-diagnose memory leak in the retirement list, not a crash, which makes it easy to ship unnoticed until the process runs out of memory under sustained load.

---

#### Edge Case 6: RCU — Reclaiming the Old Copy Before the Grace Period Ends

RCU's entire safety argument rests on the writer waiting for a genuine grace period (proof that every reader active *before* the pointer swap has exited its read-side critical section) before freeing the old copy. Skipping or shortening that wait reintroduces exactly the use-after-free RCU exists to prevent.

```cpp
// Conceptual sketch -- exact std::rcu API still being finalized in committee.

void buggy_writer(std::atomic<Config*>& current_config, Config* new_config) {
    Config* old = current_config.exchange(new_config);

    delete old;  // BUG: freed immediately, with no grace-period wait.
                 // A reader that loaded `old` from current_config a moment
                 // before the exchange -- and is still inside its read-side
                 // critical section, mid-use of *old -- now holds a
                 // dangling pointer. This is a classic RCU-misuse
                 // use-after-free, and it can be rare and timing-dependent
                 // enough to pass most testing.
}

void correct_writer(std::atomic<Config*>& current_config, Config* new_config) {
    Config* old = current_config.exchange(new_config);
    std::rcu_synchronize();  // block until every reader active at the time
                             // of the exchange has left its read-side section
    delete old;              // now provably safe to reclaim
}
```

**The trap:** because the race window is exactly "a reader that grabbed the old pointer right before the swap," this bug is inherently timing-sensitive -- it can be invisible under light load or on a quiet test machine and appear only in production under contention, which is precisely why RCU implementations are expected to provide (and callers are expected to actually use) an explicit, correct grace-period primitive rather than an ad hoc delay or `sleep`.

---

#### Edge Case 7: `std::text_encoding` Describes the Environment, Not Arbitrary Input Bytes

`std::text_encoding::environment()` reports what the *system/locale* claims its text encoding is -- it says nothing about the actual bytes in a specific string that arrived from an external, possibly mislabeled source (a file with a wrong or missing encoding declaration, a network payload from a misconfigured peer, legacy data authored under a different locale).

```cpp
#include <text_encoding>  // conceptual usage; exact member names may still change

void mislabeled_data_trap(std::span<const char> file_bytes) {
    std::text_encoding enc = std::text_encoding::environment();

    if (enc.mib() == std::text_encoding::id::UTF8) {
        // BUG (in general): this branch assumes file_bytes is ALSO UTF-8
        // just because the environment's encoding is UTF-8. If file_bytes
        // came from a file authored under Latin-1 or Shift-JIS, or a
        // network payload from a peer with a different locale, decoding
        // it as UTF-8 can misinterpret or corrupt the content -- silently,
        // since many byte sequences are "validly" decodable as something
        // even when it's the wrong something.
        decode_as_utf8(file_bytes);
    }
}
```

**The trap:** `std::text_encoding` is a vocabulary type for reasoning about the *environment's* claimed encoding (a reasonable default assumption for text your own program produces), not a guarantee -- let alone a detector -- for the provenance of arbitrary external bytes; genuinely untrusted or externally-sourced text still needs an explicit encoding declaration (e.g. a BOM, a protocol header, a file-format field) or real encoding-detection heuristics, neither of which this type provides.

---

### CODE_EXAMPLES: Numerics, Fixed-Capacity Storage, SIMD, and Lock-Free Reclamation in Practice

#### Example 1: `std::linalg` Matrix-Vector Product Over `mdspan` Views

```cpp
#include <linalg>
#include <mdspan>
#include <vector>
#include <iostream>

int main() {
    // A: 3x3 matrix, x: 3-vector, y: 3-vector (result of A * x)
    std::vector<double> a_data = {
        1, 0, 0,
        0, 2, 0,
        0, 0, 3,
    };
    std::vector<double> x_data = {1.0, 2.0, 3.0};
    std::vector<double> y_data(3, 0.0);

    std::mdspan A(a_data.data(), 3, 3);
    std::mdspan x(x_data.data(), 3);
    std::mdspan y(y_data.data(), 3);

    // y = A * x  (matrix-vector product, BLAS Level 2 style operation)
    std::linalg::matrix_vector_product(A, x, y);

    for (double v : y_data) {
        std::cout << v << ' ';
    }
    std::cout << '\n';
}
```

**Output:**
```
1 4 9
```

No manual index arithmetic (`a_data[row * 3 + col]`) appears anywhere in the caller's code -- `mdspan`'s layout policy handles that internally, and the same call would work unchanged if `A` were `layout_left` instead of the default `layout_right`.

---

#### Example 2: `std::inplace_vector` as a Zero-Allocation Scratch Buffer

```cpp
#include <inplace_vector>
#include <iostream>

// Accumulates up to 8 sensor readings per control cycle with zero heap
// allocation -- a realistic embedded/real-time use case.
std::inplace_vector<double, 8> collect_readings(std::span<const double> raw) {
    std::inplace_vector<double, 8> readings;

    for (double v : raw) {
        if (readings.size() == readings.capacity()) {
            break;  // deliberately bounded: never overflow, drop excess
        }
        readings.push_back(v);
    }
    return readings;
}

int main() {
    double sensor_data[] = {1.1, 2.2, 3.3, 4.4, 5.5};
    auto readings = collect_readings(sensor_data);

    std::cout << "Collected " << readings.size()
              << " of capacity " << readings.capacity() << '\n';
}
```

**Output:**
```
Collected 5 of capacity 8
```

The explicit `size() == capacity()` check before `push_back` is the idiom that avoids Edge Case 2 above -- the caller decides what happens at the boundary instead of letting an exception/precondition-violation decide for it.

---

#### Example 3: `std::simd` Lane-Wise Vector Addition and Reduction

```cpp
#include <experimental/simd>
#include <vector>
#include <numeric>
#include <iostream>

namespace stdx = std::experimental;

float sum_of_products(const std::vector<float>& a, const std::vector<float>& b) {
    using simd_t = stdx::native_simd<float>;
    const std::size_t width = simd_t::size();
    const std::size_t n = a.size();

    simd_t acc = 0.0f;
    std::size_t i = 0;
    for (; i + width <= n; i += width) {
        simd_t va(&a[i], stdx::element_aligned);
        simd_t vb(&b[i], stdx::element_aligned);
        acc += va * vb;              // width multiplications, one expression
    }

    float total = std::experimental::reduce(acc, std::plus<>());
    for (; i < n; ++i) {             // scalar tail
        total += a[i] * b[i];
    }
    return total;
}

int main() {
    std::vector<float> a(17, 2.0f), b(17, 3.0f);
    std::cout << sum_of_products(a, b) << '\n';  // 17 * (2*3) = 102
}
```

**Output:**
```
102
```

---

#### Example 4: Hazard-Pointer-Protected Read of a Lock-Free Node (Conceptual)

```cpp
#include <hazard_pointer>  // conceptual sketch; exact API still settling
#include <atomic>

struct Node {
    int value;
    std::atomic<Node*> next;
};

int read_head_value(std::atomic<Node*>& head) {
    std::hazard_pointer hp = std::make_hazard_pointer();

    Node* n = hp.protect(head);  // publish "I'm using this pointer" + load it
    if (!n) {
        return 0;  // empty list
    }

    int v = n->value;  // safe: a concurrent pop() cannot free `n` while
                        // this thread's hazard pointer still names it
    return v;
}  // hp's destructor clears the hazard slot here
```

This mirrors the lock-free stack from an earlier chapter's advanced-implementations content, but replaces "just don't free nodes" (a leak) or "add a mutex" (defeats the lock-free design) with a principled, standard reclamation scheme.

---

#### Example 5: RCU-Style Read-Mostly Config Lookup vs. a Mutex-Protected Equivalent

```cpp
// Conceptual sketch -- exact std::rcu API still being finalized in committee.
#include <atomic>

struct Config { int timeout_ms; /* ... */ };

// --- RCU version: readers pay ~zero synchronization cost ---
std::atomic<Config*> g_config{new Config{500}};

int read_timeout_rcu() {
    std::rcu_read_lock guard;              // near-zero-cost critical section
    const Config* cfg = g_config.load();
    return cfg->timeout_ms;                // safe: writer defers reclamation
}                                           // until this section provably ends

void update_timeout_rcu(int new_timeout) {
    Config* new_cfg = new Config{new_timeout};
    Config* old = g_config.exchange(new_cfg);
    std::rcu_synchronize();                // wait for a grace period
    delete old;                            // now safe to reclaim
}

// --- Mutex version: EVERY read pays lock/unlock cost, even though
//     updates might happen once an hour and reads happen millions of
//     times per second ---
#include <mutex>
std::mutex g_mutex;
Config g_config_locked{500};

int read_timeout_mutex() {
    std::lock_guard lock(g_mutex);         // cost paid on every single read
    return g_config_locked.timeout_ms;
}
```

For a config object read millions of times per second and written to rarely, the RCU version's readers pay no per-access synchronization cost at all, at the price of a full copy (and a grace-period wait) on the rare write path -- exactly the trade-off described in the theory section's RCU-vs-hazard-pointers comparison table.

---

#### Example 6: Querying `std::text_encoding` Before Choosing a Decode Path

```cpp
#include <text_encoding>  // conceptual usage; exact member names may still change
#include <string>
#include <iostream>

void handle_local_text(const std::string& s) {
    std::text_encoding enc = std::text_encoding::environment();

    if (enc.mib() == std::text_encoding::id::UTF8) {
        std::cout << "Fast path: treating as UTF-8, " << s.size() << " bytes\n";
        // ... UTF-8-specific fast processing of s ...
    } else {
        std::cout << "Environment encoding is '" << enc.name()
                  << "', falling back to a generic/converting code path\n";
        // ... locale-aware conversion before further processing ...
    }
}
```

This is only appropriate for text your *own program produced* under the current locale (see Edge Case 7) -- text arriving from an external, independently-encoded source still needs its own explicit encoding information, not an assumption borrowed from the environment.

---

---

### QUICK_REFERENCE: C++26 Library Additions Cheat Sheet

#### Feature-at-a-Glance

| Feature | Paper | One-line purpose | Problem domain | Status caveat |
|---|---|---|---|---|
| `std::linalg` | P1673 | BLAS-style dense linear algebra free functions over `std::mdspan` views | Numerics | Function names/overload set may still see minor refinement |
| `std::inplace_vector<T, N>` | P0843 | Fixed-capacity, heap-free vector with variable runtime size (`0..N`) | Memory footprint / embedded | Relatively settled; overflow-handling member names worth double-checking against final wording |
| `std::simd<T>` | P1928 | Portable, explicit data-parallel (SIMD) arithmetic type | SIMD / lane-level parallelism | Header path (`<simd>` vs `<experimental/simd>`) still in flux at time of writing |
| `std::hazard_pointer` | P2530 | Lock-free memory reclamation via per-thread "in-use" announcements | Concurrency (fine-grained mutation) | API sketch only — exact member names/header not yet final |
| `std::rcu` | P2545 | Read-Copy-Update: near-zero-cost reads, copy-and-swap writes with grace-period reclamation | Concurrency (read-mostly data) | API sketch only — exact member names/header not yet final |
| `std::text_encoding` | P1885 | Standard vocabulary type for querying the system/locale text encoding | Text / internationalization | Least settled of the six — treat concept over exact API as the takeaway |

#### Syntax Cheat Sheet

```cpp
// std::linalg — free functions over mdspan, not a new matrix type
std::linalg::dot(x, y);                    // Level 1: vector-vector
std::linalg::matrix_vector_product(A, x, y); // Level 2: matrix-vector
std::linalg::matrix_product(A, B, C);        // Level 3: matrix-matrix

// std::inplace_vector<T, N> — vector API, array-like inline storage
std::inplace_vector<int, 16> v;
v.push_back(1);          // OK up to size() == N
v.size();  v.capacity();  // capacity() is always N, fixed at compile time

// std::simd<T> — explicit, portable SIMD lanes
using simd_t = std::experimental::native_simd<float>;
simd_t width = simd_t::size();             // query, never hard-code
simd_t va(ptr, std::experimental::element_aligned);
simd_t vr = va + vb;                       // width additions, one expression

// std::hazard_pointer — protect-then-use-then-release (conceptual)
auto hp = std::make_hazard_pointer();
Node* n = hp.protect(shared_atomic_ptr);   // publish + load
use(n);                                    // safe until hp is released

// std::rcu — near-zero-cost reads, grace-period-gated writer reclamation (conceptual)
{ std::rcu_read_lock guard; use(*shared.load()); }   // reader
auto* old = shared.exchange(new_value);
std::rcu_synchronize();  delete old;                 // writer: wait, then free

// std::text_encoding — query, don't assume
auto enc = std::text_encoding::environment();
if (enc.mib() == std::text_encoding::id::UTF8) { /* fast path */ }
```

#### Choosing Between Hazard Pointers and RCU

| If your workload is... | Prefer |
|---|---|
| Frequent, fine-grained mutation (lock-free stack/queue nodes) | Hazard pointers |
| Read-mostly, infrequent whole-object updates (config, routing tables) | RCU |
| Reader count/frequency far exceeds writer frequency | RCU (near-zero reader cost) |
| Copying the whole structure per update would be wasteful | Hazard pointers |

**End of Topic 5: C++26 Library Additions**
