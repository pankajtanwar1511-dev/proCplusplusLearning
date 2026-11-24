## TOPIC: Alignment, Padding and Data Layout

### INTERVIEW_QA: Interview Questions with Detailed Answers

#### Q1: What are `sizeof(A)` and `sizeof(B)` on a typical x86-64 system, and why do they differ?
**Difficulty:** #beginner
**Category:** #memory #layout
**Concepts:** #padding #alignment #member_order

```cpp
struct A { char c; int i; char d; };
struct B { int i; char c; char d; };
```

**Answer:**
`sizeof(A)` is 12 and `sizeof(B)` is 8. In `A`, the `int` needs a 4-aligned offset, so 3 padding bytes follow `c`, and 3 bytes of tail padding follow `d` so the size is a multiple of the struct's alignment (4). In `B` the two `char`s share the space after the `int`, leaving only 2 bytes of tail padding.

**Explanation:**
```cpp
#include <cstddef>
#include <iostream>

struct A { char c; int i; char d; };
struct B { int i; char c; char d; };

int main() {
    std::cout << "A " << sizeof(A) << " (" << offsetof(A, c) << ','
              << offsetof(A, i) << ',' << offsetof(A, d) << ")\n";
    std::cout << "B " << sizeof(B) << " (" << offsetof(B, i) << ','
              << offsetof(B, c) << ',' << offsetof(B, d) << ")\n";
}
```
- Output: `A 12 (0,4,8)` and `B 8 (0,4,5)`.
- Layout of `A`: c@0, padding 1-3, i@4-7, d@8, tail padding 9-11. Layout of `B`: i@0-3, c@4, d@5, tail padding 6-7.
- Both have `alignof` 4 (the strictest member).
- ❌ Common wrong answer: "6 bytes, the sum of the members." Padding is part of `sizeof`.
- ✅ What a strong answer adds: the exact numbers are implementation-defined (ABI), and for 10 million objects the difference is 120 MB vs 80 MB plus fewer cache lines touched.

**Key takeaway:** Padding depends on member order; `sizeof` includes interior and tail padding.

---

#### Q2: Why does a struct need tail padding, and does a 12-byte struct have to start at an address divisible by 12?
**Difficulty:** #beginner
**Category:** #memory #layout
**Concepts:** #tail_padding #arrays #struct_alignment

**Answer:**
Tail padding makes `sizeof` a multiple of the struct's alignment, because `sizeof` is also the array stride: without it, the members of `arr[1]` would be misaligned. The struct itself only needs an address that is a multiple of its **alignment** (4 for `{char, int, char}`), not of its size.

**Explanation:**
- With `sizeof(A) == 9`, `arr[1]` would start at offset 9 and `arr[1].i` at 13: not 4-aligned.
- With 12: elements at 0, 12, 24, and their `int`s at 4, 16, 28: all aligned.
- `A` can live at 100, 104, 108, ...; 100 is not a multiple of 12 and is perfectly valid.
- ❌ Common wrong answer: "The struct must start at a multiple of its size" or "of its largest member's size."
- ✅ What a strong answer adds: `sizeof(T)` is always a multiple of `alignof(T)`; the converse relationship does not exist.

**Key takeaway:** Tail padding exists for arrays; placement depends on alignment, not size.

---

#### Q3: Is "an object's address must be divisible by its size" the correct rule?
**Difficulty:** #beginner
**Category:** #memory #layout
**Concepts:** #alignof #sizeof #alignment_requirement

**Answer:**
No. The rule is "divisible by its alignment requirement" (`alignof(T)`). For `int` on x86-64 both are 4, which makes the wrong rule look right, but they differ for many types: `struct { char c[7]; }` is size 7 alignment 1, `struct { double d; char c; }` is size 16 alignment 8.

**Explanation:**
- Alignment is always a power of two; size is any multiple of the alignment.
- Scalars: alignment is usually the size on x86-64, but not universally (`long double` is 12 bytes with alignment 4 on 32-bit x86 Linux).
- Precise rules: each member's offset is a multiple of the member's `alignof`; the struct's alignment is the maximum member alignment; `sizeof` is rounded up to that alignment.
- ❌ Common wrong answer: "The struct's size must be a multiple of its biggest member's size." It is a multiple of its alignment.
- ✅ What a strong answer adds: query the numbers with `alignof`/`offsetof` and lock them with `static_assert` instead of reasoning from sizes.

**Key takeaway:** Think `alignof`, not `sizeof`, whenever addresses are involved.

---

#### Q4: Does the compiler reorder members to reduce padding? How do you reduce it, and when should you not?
**Difficulty:** #intermediate
**Category:** #memory #layout
**Concepts:** #member_order #hot_cold #abi

**Answer:**
No. C++ compilers lay out data members in declaration order (guaranteed for members of the same access, and for all members since C++23). You reduce padding yourself, usually by declaring members in decreasing order of alignment. Do not reorder when the layout is an ABI or wire/shared-memory contract, or when grouping hot fields together matters more than a few bytes.

**Explanation:**
- Example: `{char; double; char; int}` is 24 bytes; `{double; int; char; char}` is 16.
- Hot/cold: put the fields the hot path reads on every message in the first cache line, even if that costs padding.
- Tools: `-Wpadded` warns on each inserted padding; `pahole` shows holes in a built binary.
- Lock the result with `static_assert(sizeof(T) == N)` so later edits cannot silently grow it.
- ❌ Common wrong answer: "The optimizer will rearrange it at -O2." Layout is fixed by the ABI, not by optimisation.
- ✅ What a strong answer adds: "largest-first" is a heuristic; access pattern and ABI stability come first.

**Key takeaway:** You own member order; sort by alignment unless ABI or access pattern says otherwise.

---

#### Q5: What does `alignas` do, and can it be used to pack a struct?
**Difficulty:** #intermediate
**Category:** #memory #alignment
**Concepts:** #alignas #over_alignment #power_of_two

**Answer:**
`alignas(N)` (C++11) raises the alignment of a variable, data member or class to N (a power of two). On a class it also rounds `sizeof` up to a multiple of N. It can never lower alignment below the natural one, so it cannot pack anything: that needs `#pragma pack` or `__attribute__((packed))`.

**Explanation:**
- `struct alignas(64) Line { int x; };` → `alignof` 64, `sizeof` 64.
- `struct S { char c; alignas(16) int x; };` → `x` at offset 16, `sizeof` 32.
- `alignas(1) int x;` is ill-formed: Clang errors, GCC 11 silently ignores it (alignment stays 4).
- `alignas(3)`: error, not a power of two. With several `alignas`, the strictest wins.
- ❌ Common wrong answer: "`alignas(1)` removes padding."
- ✅ What a strong answer adds: typical uses are cache-line separation (`alignas(64)`), SIMD types (`alignas(32)` for AVX), and raw storage (`alignas(T) std::byte buf[sizeof(T)]`).

**Key takeaway:** `alignas` only strengthens alignment; packing is a different, non-standard tool.

---

#### Q6: What is an over-aligned type, what is `std::max_align_t`, and what does over-alignment do to sizes, arrays, enclosing structs and the stack?
**Difficulty:** #intermediate
**Category:** #memory #alignment
**Concepts:** #max_align_t #over_aligned #alignof

**Answer:**
`alignof(std::max_align_t)` (16 on x86-64) is the strictest alignment of any scalar type, the "fundamental" alignment. A type declared with a stricter one (e.g. `struct alignas(64) Counter`) is over-aligned. Its `sizeof` is rounded up to a multiple of the alignment, every array or `std::vector` element and every enclosing struct inherit that alignment, and the compiler realigns stack frames to honour it. Heap allocation of such types needs C++17 aligned `new` (the mechanics are in topic 10 Q8).

**Explanation:**
- Size: `sizeof(T)` is always a multiple of `alignof(T)`, so a `long` inside `alignas(64)` costs 64 bytes. That is the point for false-sharing avoidance and the price everywhere else.
- Propagation: a struct's alignment is the maximum of its members', so `struct Holder { char tag; Counter c; }` becomes 64-aligned and 128 bytes (63 bytes of interior padding after `tag`). One over-aligned member quietly doubles every object that contains it.
- Arrays and containers: element stride is `sizeof(T)`, so every element stays aligned once the first one is. `std::vector<Counter>` gets its buffer from `std::allocator`, which (since C++17) uses the aligned allocation path.
- Stack and static storage: the compiler handles any alignment itself (on x86-64 GCC aligns `rsp` down in the function prologue), so locals were always correct, even before C++17.
- Where it still goes wrong: custom allocators, pools and arenas that hand out `max_align_t`-aligned chunks, `std::malloc`, and type-erased small buffers that only promise fundamental alignment (topic 10 for allocation, topic 11 for pools).
- `alignof` is a compile-time query on a type; `alignas` can only increase alignment (packing is Q5/Q7).
```cpp
#include <cstddef>
#include <cstdint>
#include <iostream>
#include <vector>

struct alignas(64) Counter { long value; };     // over-aligned: 64 > 16
struct Holder { char tag; Counter c; };          // inherits the 64

bool aligned64(const void* p) {
    return reinterpret_cast<std::uintptr_t>(p) % 64 == 0;
}

int main() {
    std::cout << "max_align_t: " << alignof(std::max_align_t) << '\n';
    std::cout << "Counter: sizeof " << sizeof(Counter)
              << ", alignof " << alignof(Counter) << '\n';
    std::cout << "Holder: sizeof " << sizeof(Holder)
              << ", alignof " << alignof(Holder) << '\n';
    Counter local[3];                            // stack: compiler realigns frame
    std::vector<Counter> v(3);                   // heap: C++17 aligned new
    std::cout << "stack aligned: " << aligned64(&local[1])
              << ", vector aligned: " << aligned64(&v[1]) << '\n';
}
```
- Output (GCC 11, x86-64, with and without optimization):
```
max_align_t: 16
Counter: sizeof 64, alignof 64
Holder: sizeof 128, alignof 64
stack aligned: 1, vector aligned: 1
```
- ❌ Common wrong answer: "`alignas(64)` only affects where the object starts; its size stays 8." Size is rounded up to the alignment, and the cost spreads to every containing type.
- ✅ What a strong answer adds: apply `alignas(64)` to the few hot, independently written fields (or the queue indices), not to whole widely used structs; check the effect with `static_assert(sizeof(T) == ...)`.

**Key takeaway:** Over-alignment is contagious: it rounds up `sizeof`, propagates to enclosing types and must be honoured by every allocator; stack and static objects are handled by the compiler.

---

#### Q7: What is a packed struct, and what are the risks of using one?
**Difficulty:** #intermediate
**Category:** #memory #layout
**Concepts:** #pragma_pack #misalignment #wire_formats

**Answer:**
A packed struct (`#pragma pack(1)` or `__attribute__((packed))`) has no padding: members follow each other byte by byte and the struct's alignment drops to 1. Its members are therefore misaligned, which makes access slower, breaks atomicity and SIMD, can fault on strict-alignment CPUs, and makes pointers or references to members dangerous.

**Explanation:**
- `struct { char c; int i; }` packed: size 5, `i` at offset 1.
- Direct access `p.i` is safe: the compiler knows the member is packed and emits unaligned-safe code.
- `int* q = &p.i;` loses that knowledge. GCC refuses to bind `int&` to an `__attribute__((packed))` member and warns for the pointer (Clang 14 warns for the pointer but accepts the reference); with `#pragma pack` GCC 11 and Clang 14 accepted both silently.
- Arrays of packed structs place most elements at odd addresses.
- Typical legitimate use: describing a wire or file header. Even there, `memcpy`-based parsing into a naturally aligned struct is usually cleaner.
- ❌ Common wrong answer: "Packing is a free memory optimisation." It trades memory for slower, riskier access.
- ✅ What a strong answer adds: reorder members first; pack only when an external byte format forces it.

**Key takeaway:** Packing removes padding by creating misaligned members; keep it at the I/O boundary.

---

#### Q8: Is misaligned access undefined behaviour if x86 handles it in hardware? How do you read an `int` at an odd offset of a network buffer?
**Difficulty:** #intermediate
**Category:** #memory #undefined_behavior
**Concepts:** #misaligned_access #memcpy #ubsan

**Answer:**
Yes, it is UB in C++ regardless of the CPU: the compiler may assume every `int*` is 4-aligned (vectorisation, atomics, alias analysis). x86 tolerates plain misaligned loads, but other CPUs fault, SIMD and atomic instructions may fail or lose atomicity, and sanitizers report it. Read with `std::memcpy(&value, buf + off, sizeof value)`, which is well-defined and compiles to a single load.

**Explanation:**
```cpp
#include <cstdint>
#include <cstring>
#include <iostream>

int main() {
    unsigned char buf[8] = {0, 0x2A, 0, 0, 0, 0, 0, 0};
    std::uint32_t v;
    std::memcpy(&v, buf + 1, sizeof v);       // any offset is fine
    std::cout << v << '\n';                   // 42 (little-endian host)
}
```
- `*reinterpret_cast<std::uint32_t*>(buf + 1)` is both misaligned and an aliasing/lifetime violation (topic 10). UBSan: "load of misaligned address ... which requires 4 byte alignment".
- Misaligned accesses that straddle a cache line cost more; misaligned locked instructions become x86 "split locks".
- ❌ Common wrong answer: "On x86 it's fine, just slightly slower."
- ✅ What a strong answer adds: also handle byte order (`std::endian`, `std::byteswap`) at the same boundary.

**Key takeaway:** Never dereference a misaligned pointer; `memcpy` the bytes out.

---

#### Q9: Why is comparing or hashing structs with `memcmp` / raw bytes a bug?
**Difficulty:** #intermediate
**Category:** #memory #correctness
**Concepts:** #padding_bytes #has_unique_object_representations #defaulted_comparison

**Answer:**
Padding bytes have unspecified values, so two objects with identical members can differ byte-wise: `memcmp` says "different" and a byte hash gives different hashes. Floating-point members add `+0.0`/`-0.0` and NaN issues. Compare member-wise (C++20 `operator== = default`) and hash members.

**Explanation:**
- `std::has_unique_object_representations_v<T>` (C++17) is true only if equal values always have equal bytes: false for `{char, int, char}` and for `float`, true for `{int, int}`.
- Zeroed padding is only promised by zero-initialization (statics, or value-initializing a non-aggregate class without a user-provided constructor); aggregate initialization such as `T x{};` for a plain struct does not promise it, and later assignments and copies may not preserve zeros anyway.
- Security angle: writing a padded struct to a socket or file leaks stale stack/heap bytes.
- ❌ Common wrong answer: "memcmp is just a fast `==`."
- ✅ What a strong answer adds: `static_assert(std::has_unique_object_representations_v<Key>)` guards a raw-byte hash.

**Key takeaway:** Bytes ≠ value when padding exists; compare and hash members.

---

#### Q10: You share a struct through shared memory or a file. How do you make sure its layout never changes silently?
**Difficulty:** #intermediate
**Category:** #memory #abi
**Concepts:** #static_assert #offsetof #standard_layout #fixed_width_types

**Answer:**
Use fixed-width types, order members explicitly, add explicit padding fields if needed, and lock the layout with `static_assert` on `sizeof`, `alignof`, each `offsetof`, `std::is_standard_layout_v` and `std::is_trivially_copyable_v`. A later edit that changes the layout then fails to compile instead of corrupting data.

**Explanation:**
- `long` is 8 bytes on Linux and 4 on Windows; `long double` 16 vs 8: use `std::int64_t`, `double`.
- `offsetof` is only well-defined for standard-layout types; GCC warns `-Winvalid-offsetof` otherwise.
- No virtual functions, no pointers (meaningless in another process), no `std::string`/`std::vector` (they point to private heap memory).
- Byte order: define it (usually little-endian) and convert at the boundary.
- Add a version field so readers can detect format changes.
- ❌ Common wrong answer: "Same compiler, same struct, same layout." Different compiler flags (`-fpack-struct`, `#pragma pack` in an included header), platforms or ABI versions can change it.
- ✅ What a strong answer adds: explicit `std::uint8_t reserved[3];` fields document padding and keep it zero-initialised.

**Key takeaway:** A binary contract needs fixed-width types and `static_assert`-locked offsets.

---

#### Q11: What is `sizeof` of an empty class, and how do EBO and `[[no_unique_address]]` avoid paying for it?
**Difficulty:** #intermediate
**Category:** #memory #layout
**Concepts:** #empty_class #ebo #no_unique_address

**Answer:**
An empty class has `sizeof` 1 so that distinct objects have distinct addresses. As a member it costs that byte plus padding (`{E e; int x;}` is 8). As a base class it can occupy zero bytes: the empty base optimisation (`struct D : E { int x; }` is 4). C++20 `[[no_unique_address]]` gives a member the same treatment.

**Explanation:**
- Used for stateless allocators, deleters, comparators, hash functors inside containers and smart pointers (`std::unique_ptr<T>` with a stateless deleter is 8 bytes).
- EBO cannot apply when two subobjects of the same empty type would share an address: `struct D2 : E { E e; int x; }` is 8.
- MSVC ignores `[[no_unique_address]]`; it requires `[[msvc::no_unique_address]]`.
- ❌ Common wrong answer: "An empty class has size 0."
- ✅ What a strong answer adds: before C++20, libraries used EBO via "compressed pair" classes; `[[no_unique_address]]` replaces that trick.

**Key takeaway:** Empty types cost a byte as members, nothing as bases or `[[no_unique_address]]` members.

---

#### Q12: How can a derived class be smaller than "base size + member size", and why does that make `memcpy` of a base subobject dangerous?
**Difficulty:** #advanced
**Category:** #memory #abi
**Concepts:** #tail_padding_reuse #itanium_abi #potentially_overlapping

**Answer:**
Under the Itanium C++ ABI (Linux, macOS), a derived class may place its own members in the tail padding of a base that is not "POD for layout purposes" (for example, one with a user-provided constructor). Then `memcpy(base_ptr, src, sizeof(Base))` writes over the derived class's members, which is why copying a base subobject with `memcpy` is not allowed even for trivially copyable types.

**Explanation:**
- `struct Base { int x; char c; Base() {} }; struct Der : Base { char d; };` → `sizeof(Der) == 8`, `d` at offset 5 (inside `Base`'s 3 padding bytes).
- Remove the constructor (`Base` becomes an aggregate/POD): `sizeof(Der) == 12`.
- The standard calls base subobjects and `[[no_unique_address]]` members "potentially-overlapping"; the trivially-copyable `memcpy` guarantee excludes them.
- Use the assignment operator (`static_cast<Base&>(der) = other;`), which copies only `x` and `c`.
- ❌ Common wrong answer: "`sizeof(Derived) >= sizeof(Base) + sizeof(new members)` always."
- ✅ What a strong answer adds: this ABI detail means adding a constructor to a base can change the derived class's size.

**Key takeaway:** Base-class tail padding may hold derived members; never `memcpy` over a base subobject.

---

#### Q13: What is implementation-defined about bit-fields, and why should they not describe a wire format?
**Difficulty:** #intermediate
**Category:** #memory #layout
**Concepts:** #bit_fields #implementation_defined #portability

**Answer:**
The order of bit-fields within their allocation unit, whether a field may straddle units, the unit's size and alignment, and padding between them are all implementation-defined. Two compilers or platforms (or big- vs little-endian targets) can produce different bit patterns for the same struct, so a bit-field struct cannot portably match a protocol's bit layout.

**Explanation:**
- `struct { unsigned a:3; unsigned b:5; unsigned c:24; }` is 4 bytes on x86-64 GCC with `a` in the lowest bits; another ABI may allocate from the high end.
- Other rules: no address-of, no non-const reference, unsigned overflow keeps the low bits, a signed 1-bit field holds 0 and -1, `unsigned : 0;` starts a new unit.
- Access costs load/mask/shift/store instructions.
- For wire formats: pack and unpack with shifts and masks into fixed-width integers; the result is portable and testable.
- ❌ Common wrong answer: "Bit-fields give exact control of the bit layout."
- ✅ What a strong answer adds: bit-fields are fine for in-memory flags that never leave the process.

**Key takeaway:** Bit-fields save space in memory; shifts and masks define formats.

---

#### Q14: Two threads each update a different bit-field of the same struct. Is that safe?
**Difficulty:** #advanced
**Category:** #memory #concurrency
**Concepts:** #memory_location #data_race #bit_fields

**Answer:**
No. Adjacent non-zero-width bit-fields form a single memory location, and writing one is a read-modify-write of the shared bytes. Two unsynchronised writes to different bit-fields of the same sequence are a data race (undefined behaviour) and can lose updates. ThreadSanitizer reports it.

**Explanation:**
- `struct Flags { unsigned a:4; unsigned b:4; };` with thread 1 writing `a` and thread 2 writing `b`: TSan "WARNING: ThreadSanitizer: data race".
- Distinct ordinary members (even adjacent `char`s) are distinct memory locations: writing them from different threads is not a data race (though it may cause false sharing).
- Fixes: separate members, a zero-width bit-field between the fields (`unsigned : 0;`), one mutex for the whole group, or a single `std::atomic<std::uint32_t>` updated with `fetch_or`/`fetch_and` or a CAS loop.
- ❌ Common wrong answer: "Different fields, so no race."
- ✅ What a strong answer adds: this is the C++11 memory-model definition of "memory location" in action.

**Key takeaway:** Bit-fields in one run share a memory location; concurrent writes need a single synchronisation point.

---

#### Q15: Does padding exist to keep a struct within a cache line? How do cache lines actually enter layout decisions?
**Difficulty:** #intermediate
**Category:** #memory #performance
**Concepts:** #cache_line #false_sharing #hardware_destructive_interference_size

**Answer:**
No. Ordinary padding exists only to satisfy member alignment. Cache lines enter layout through explicit choices: keeping structs small and hot fields together so fewer lines are touched, and `alignas(64)` to give variables written by different threads their own line (avoiding false sharing).

**Explanation:**
- `struct { char c; int i; }` is padded because `int` needs 4-alignment, not because of a 64-byte line.
- False sharing: two threads writing different variables on one 64-byte line bounce the line between cores. `struct alignas(64) Counter { std::atomic<long> v; };` makes each counter occupy a full line (two of them: 128 bytes).
- `std::hardware_destructive_interference_size` (C++17, `<new>`) names that distance portably, but libstdc++ only provides it from GCC 12 (with a `-Winterference-size` warning because it depends on `-mtune`); many codebases hard-code 64.
- Padding everything to 64 bytes wastes cache; reserve it for a few hot, contended objects.
- ❌ Common wrong answer: "The compiler pads structs to cache-line size automatically."
- ✅ What a strong answer adds: the Systems chapter covers false sharing measurements, prefetching and NUMA.

**Key takeaway:** Alignment padding is mandatory and small; cache-line padding is a deliberate, costly choice.

---

#### Q16: A hot loop sums only the `bid` field of millions of quotes. Should the data be an array of structs or a struct of arrays?
**Difficulty:** #intermediate
**Category:** #memory #performance
**Concepts:** #aos #soa #cache_utilization

**Answer:**
For that loop, a structure of arrays (a contiguous `std::vector<double> bid`) is better: every byte of every cache line loaded is a useful `bid`, and the contiguous doubles vectorise easily. An array of structs wins when the hot code uses most fields of each quote together. The layout should follow the access pattern.

**Explanation:**
- AoS with a 40-byte `Quote`: each 64-byte line holds about 1.6 quotes, of which 8 bytes per quote are used: about 20% useful bytes.
- SoA: 8 bids per line, 100% useful, and SIMD can add 4 doubles at a time (AVX).
- Caveat: a floating-point sum is order-sensitive, so compilers do not reassociate it on their own. GCC 11 `-O3 -mavx2` still adds one double at a time (`vaddsd`); packed `vaddpd` appears with `-ffast-math` (or `-fassociative-math`) or explicit SIMD code; hand-written independent accumulators at least break the serial dependency chain.
- AoS is better for "process one quote completely" because its fields share a line; SoA would touch five separate arrays.
- Hybrids (hot/cold split, AoSoA blocks) exist; the Systems chapter covers them.
- ❌ Common wrong answer: "SoA is always faster" or "each AoS element needs its own RAM access" (hardware prefetchers handle regular strides well; the issue is wasted bandwidth and cache capacity).
- ✅ What a strong answer adds: measure with realistic data; the useful-bytes ratio is the first-order effect.

**Key takeaway:** Choose AoS or SoA by which fields the hot loop touches.

---

#### Q17: How do virtual functions and inheritance change an object's layout?
**Difficulty:** #intermediate
**Category:** #memory #layout
**Concepts:** #vptr #inheritance #standard_layout

**Answer:**
A class with virtual functions gets a hidden vtable pointer (8 bytes, alignment 8 on x86-64), typically at offset 0, so `struct { virtual ~V(); int x; }` is 16 bytes. Base subobjects are laid out first, like leading members. Such a class is no longer standard-layout, so `offsetof` is only conditionally-supported and C-compatible layout assumptions no longer hold.

**Explanation:**
- An `int` alone would be 4 bytes; with a vptr it becomes 8 + 4 + 4 bytes of tail padding.
- Multiple inheritance adds one vptr per polymorphic base subobject; virtual inheritance adds virtual-base offsets.
- `memcpy`/`memset` on polymorphic objects is wrong (they are not trivially copyable; you would overwrite the vptr).
- The object model in depth (vtables, dispatch) is covered in the OOP chapter.
- ❌ Common wrong answer: "Virtual functions add one pointer per function to every object." One vptr per polymorphic subobject; the table is shared per class.
- ✅ What a strong answer adds: for millions of small objects, a vptr can double the size; consider type-tagged data or SoA instead.

**Key takeaway:** Polymorphism costs a pointer per object and gives up standard layout.
