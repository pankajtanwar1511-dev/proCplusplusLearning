## TOPIC: Alignment, Padding and Data Layout

### THEORY_SECTION: Core Concepts

#### 1. Mental model
- Every complete object type has two numbers:
  - `sizeof(T)`: bytes the object occupies, including padding. Also the distance between consecutive array elements.
  - `alignof(T)`: the address of every `T` object must be a multiple of this (always a power of two).
- **Alignment is a requirement on addresses; size is a property of the object.** They are related (`sizeof(T)` is always a multiple of `alignof(T)`) but not equal in general: a `struct { char c[7]; }` has size 7 and alignment 1, `long double` on x86-64 has size 16 and alignment 16, `struct { double d; char c; }` has size 16 and alignment 8.
- The compiler inserts **padding** so that every member sits at an offset that is a multiple of its own alignment:
  - **Interior padding**: between members.
  - **Tail padding**: after the last member, so that `sizeof` is a multiple of the struct's alignment and every element of an array stays aligned.
- A struct's alignment is the largest alignment of its members (and bases), unless raised by `alignas`.
- Layout is **implementation-defined**: the platform ABI (System V x86-64 + Itanium C++ ABI on Linux, the MSVC ABI on Windows) fixes it. Numbers in this topic are for x86-64 Linux with GCC/Clang unless stated.
- Why hardware cares: CPUs load whole aligned words and cache lines. A misaligned value can straddle two words or two cache lines (slower, or a fault on some CPUs), and atomic operations need natural alignment to be atomic at all.

#### 2. Fundamental types on x86-64
| Type | sizeof (Linux) | alignof (Linux) | Note |
|---|---|---|---|
| `char`, `bool`, `std::byte` | 1 | 1 | `sizeof(bool)` is implementation-defined, 1 in practice |
| `short` | 2 | 2 | |
| `int`, `float` | 4 | 4 | |
| `long` | 8 | 8 | **4 on Windows (LLP64)** |
| `long long`, `double`, pointers | 8 | 8 | |
| `long double` | 16 | 16 | 8/8 with MSVC |
| `std::max_align_t` | 32 | 16 | Strictest alignment of any scalar type |

- `alignof(std::max_align_t)` (16 here) is the largest "fundamental" alignment. Anything stricter is an **over-aligned** type (e.g. `alignas(64)`).
- `malloc` and plain `operator new` return memory aligned for `max_align_t`; `__STDCPP_DEFAULT_NEW_ALIGNMENT__` is 16 on x86-64 Linux.
- Use fixed-width types (`std::uint32_t`, `std::int64_t`) for anything that crosses a process, file or network boundary; `long` changes size between platforms.
- `alignof(T[N]) == alignof(T)`; `sizeof(T[N]) == N * sizeof(T)` (no padding between array elements beyond each element's own tail padding).

#### 3. Computing a layout by hand
- Algorithm (what the ABI does):
  1. Start at offset 0.
  2. For each member in declaration order: round the offset up to the member's alignment, place it, advance by its size.
  3. Struct alignment = max member alignment. Round the final offset up to that alignment: that is `sizeof`.
- Worked examples (verified with `offsetof`):

| Struct | Layout | sizeof / alignof |
|---|---|---|
| `struct A { char c; int i; char d; };` | c@0, pad 1-3, i@4, d@8, tail pad 9-11 | 12 / 4 |
| `struct B { int i; char c; char d; };` | i@0, c@4, d@5, tail pad 6-7 | 8 / 4 |
| `struct C1 { char a; double b; char c; int d; };` | a@0, pad, b@8, c@16, pad, d@20 | 24 / 8 |
| `struct C2 { double b; int d; char a; char c; };` | b@0, d@8, a@12, c@13, tail pad | 16 / 8 |
| `struct AM { char c; alignas(16) int x; };` | c@0, pad 1-15, x@16, tail pad 20-31 | 32 / 16 |

- **Why tail padding**: in `A arr[2]`, if `sizeof(A)` were 9, `arr[1].i` would sit at offset 13, not a multiple of 4. Rounding `sizeof` up to 12 keeps every element's members aligned.
- **A struct need not start at a multiple of its size**: `A` (size 12, alignment 4) can live at any address divisible by 4 (100, 104, 108, ...). Its size is a multiple of its alignment, not the other way around.
- A class with virtual functions starts with a vtable pointer (8 bytes, alignment 8): `struct V { virtual ~V(); int x; }` is 16 bytes.
- Bases are laid out like leading members (with the empty-base and tail-padding exceptions in section 8).

#### 4. Member ordering
- Compilers **never reorder** non-static data members: addresses increase in declaration order (guaranteed for members with the same access in all standards; for all members since C++23, P1847).
- So padding is in your hands. Rule of thumb: declare members in decreasing order of alignment (8-byte, then 4, 2, 1). `C1` → `C2` saves 8 of 24 bytes (33%).
- Why it matters: 10 million objects at 12 bytes vs 8 bytes is 120 MB vs 80 MB, and more objects per 64-byte cache line means fewer cache misses and less memory bandwidth in scans.
- It is a heuristic, not a law. Other forces:
  - **Hot/cold grouping**: put fields the hot path touches together (ideally in the first cache line), even at the cost of a few padding bytes.
  - **ABI stability**: reordering members of a public or wire/shared-memory struct breaks binary compatibility.
  - Readability and logical grouping.
- Tools: `-Wpadded` (GCC/Clang warn on every padding insertion), `pahole` (shows holes in a compiled binary), `static_assert(sizeof(T) == N)` to lock the result.

#### 5. alignas and over-aligned types
- `alignas(N)` (C++11) can be applied to a variable, a non-static data member, or a class:
  - `alignas(64) std::atomic<long> counter;`: this variable is 64-aligned.
  - `struct S { char c; alignas(16) int x; };`: member at offset 16, struct alignment 16.
  - `struct alignas(64) Line { int x; };`: `alignof` 64 and `sizeof` rounded up to 64.
  - `alignas(T)` (a type) means `alignas(alignof(T))`.
- Rules:
  - `N` must be a power of two (GCC: "requested alignment '3' is not a positive power of 2").
  - It can only **strengthen** alignment. Requesting less than the natural alignment is ill-formed: Clang errors ("requested alignment is less than minimum alignment of 4 for type 'int'"), GCC silently ignores it (`alignof` stays 4). Use packing to weaken alignment, not `alignas`.
  - With several `alignas` on one entity the strictest wins; `alignas(0)` is ignored.
- Where over-aligned objects come from:
  - Static and automatic storage: the compiler aligns them (it realigns the stack if needed).
  - Dynamic storage: since C++17 `new T` for an over-aligned `T` calls `operator new(size_t, std::align_val_t)`, so `new`, `std::make_unique`, `std::vector<T>` all return properly aligned memory. Before C++17 over-alignment on the heap was not guaranteed (a classic bug with SIMD types in containers). Details: topic 10.
  - `std::aligned_alloc` (C++17, from C11) for raw memory.
- Helpers:
  - `std::align(alignment, size, ptr, space)`: bumps `ptr` forward to the next aligned address inside a buffer and shrinks `space`; returns `nullptr` if it does not fit. Used by arenas.
  - `std::assume_aligned<N>(p)` (C++20): promises the optimizer that `p` is N-aligned (wrong promise = UB).
  - `std::aligned_storage` / `aligned_union`: deprecated in C++23; write `alignas(T) std::byte buf[sizeof(T)];` instead.

#### 6. Packed structs and misaligned access
- Packing removes padding by lowering member alignment:
  - `#pragma pack(push, 1)` ... `#pragma pack(pop)` (MSVC, GCC, Clang).
  - `struct __attribute__((packed)) P { ... };` (GCC/Clang).
  - `struct { char c; int i; }` packed: size 5, alignment 1, `i` at offset 1.
- Consequences:
  - Members are misaligned. The compiler knows this when you access `p.i` directly, so it emits safe (possibly slower) code.
  - A pointer or reference to a packed member loses that knowledge: `int& r = p.i;` claims an aligned `int`. GCC rejects it for `__attribute__((packed))` ("cannot bind packed field 'p.P::i' to 'int&'") and warns for pointers (`-Waddress-of-packed-member`); Clang 14 also warns for the pointer but accepts the reference silently; with `#pragma pack` GCC 11 and Clang 14 accepted both silently.
  - Atomics, SIMD loads and some CPUs (older ARM, SPARC) require alignment: misaligned access may be non-atomic or fault. On x86 a misaligned locked instruction that crosses a cache line is a "split lock" (very slow, can be trapped by the OS).
  - Arrays of packed structs put most elements at odd addresses.
- Misaligned access through a normal pointer (`*reinterpret_cast<int*>(buf + 1)`) is **undefined behaviour**, even on x86 where it usually "works". UBSan: "store to misaligned address ... for type 'int', which requires 4 byte alignment".
- Portable way to read a field from a byte buffer: `std::memcpy(&value, buf + offset, sizeof value);` (compilers turn it into a single load) or `std::bit_cast` for a whole object. Reinterpreting bytes as objects is topic 10 (`start_lifetime_as`, strict aliasing).
- Wire formats: prefer explicit (de)serialization with fixed-width types and explicit byte order (`std::endian` C++20, `std::byteswap` C++23) over overlaying a packed struct onto the buffer.

#### 7. Locking a layout and padding bytes
- Lock assumptions at compile time so a later edit cannot silently change a binary layout:
  - `static_assert(sizeof(Header) == 16);`
  - `static_assert(alignof(Header) == 8);`
  - `static_assert(offsetof(Header, seq) == 8);`
  - `static_assert(std::is_trivially_copyable_v<Header>);` (safe to `memcpy`)
  - `static_assert(std::is_standard_layout_v<Header>);` (C-compatible layout, first member at offset 0, `offsetof` well-defined)
- `offsetof` on a non-standard-layout type (virtual functions, mixed access with members, etc.) is conditionally-supported: GCC warns `-Winvalid-offsetof`.
- **Padding bytes have unspecified values.** Consequences:
  - `memcmp(&a, &b, sizeof a)` can report "different" for objects with equal members.
  - Hashing raw bytes of a padded struct hashes garbage.
  - Writing a padded struct to a file or socket leaks whatever was in the padding (an information-leak bug class in kernels).
- `std::has_unique_object_representations_v<T>` (C++17) is true only if equal values imply equal bytes: no padding, no floats (two zeros, NaNs). Verified: `A` and `B` above are false, `struct { int a; int b; }` is true, `float` is false.
- Compare members, not bytes: C++20 `bool operator==(const T&) const = default;`.

#### 8. Empty classes, EBO, [[no_unique_address]] and tail-padding reuse
- An empty class (`struct E {};`) has `sizeof(E) == 1`: two distinct objects must have distinct addresses.
- As a **member**, an empty class costs its byte plus padding: `struct M { E e; int x; }` is 8.
- As a **base**, it can take zero bytes: **empty base optimization** (EBO). `struct D : E { int x; }` is 4. Mandatory for standard-layout classes, universal in practice.
- EBO is blocked when two subobjects of the same empty type would share an address: `struct D2 : E { E e; int x; }` is 8.
- `[[no_unique_address]]` (C++20) gives members the same treatment: `struct N { [[no_unique_address]] E e; int x; }` is 4.
  - Two `[[no_unique_address]]` members of the same empty type still need distinct addresses (GCC placed them at offsets 0 and 1, overlapping `x`; size stayed 4).
  - MSVC ignores the standard attribute for ABI reasons; it needs `[[msvc::no_unique_address]]`.
- Where it matters: stateless allocators, deleters, comparators and policies stored inside containers and smart pointers. This is why `std::unique_ptr<T>` with a stateless deleter is 8 bytes (topic 06).
- **Tail-padding reuse** (Itanium ABI): a derived class may place its members inside the tail padding of a base that is not "POD for layout" (e.g. has a user-provided constructor):
  - `struct Base { int x; char c; Base() {} }; struct Der : Base { char d; };` → `sizeof(Der) == 8` (`d` at offset 5).
  - Same members but `Base` is an aggregate → `sizeof(Der) == 12`.
  - Consequence: `memcpy(base_ptr, src, sizeof(Base))` into a base subobject can overwrite the derived class's members. Copying a base subobject with `memcpy` is not allowed even for trivially copyable types (it is a potentially-overlapping subobject).

#### 9. Bit-fields
- `unsigned flags : 3;` declares a member occupying 3 bits of an "allocation unit" of the declared type.
- What is implementation-defined: allocation order within the unit (low-to-high on x86-64 Linux, may differ elsewhere), whether a field can straddle units, signedness of plain `int` bit-fields (only before C++14; CWG 739 made them signed), padding between units. Never use bit-fields to describe a wire or hardware register format portably.
- Properties:
  - Cannot take the address (`&s.flags`: "attempt to take address of bit-field") or bind a non-const reference.
  - Assigning an out-of-range value to an unsigned bit-field keeps the low bits (GCC: `-Woverflow` "changes value from '9' to '1'").
  - A signed 1-bit field holds 0 and -1, not 0 and 1.
  - `unsigned : 0;` (unnamed, width 0) forces the next bit-field into a new allocation unit.
  - `struct { unsigned a:3; unsigned b:5; unsigned c:24; }` is 4 bytes; `struct { bool f1:1; bool f2:1; }` is 1 byte.
- **Concurrency**: a sequence of adjacent non-zero-width bit-fields is a single **memory location**. Two threads writing *different* bit-fields of the same struct without synchronization is a **data race** (verified: TSan reports it). Separate them with a non-bit-field member or a `:0` field, or protect them together.
- Reads and writes compile to load/mask/shift/store sequences: compact but not free.

#### 10. Layout and performance (short; depth in the Systems chapter)
- Cache line: 64 bytes on mainstream x86-64 and most ARM. Smaller structs = more objects per line = fewer misses in scans.
- **Hot/cold splitting**: keep fields used on every message in one line; move rarely used fields to a separate struct or behind a pointer.
- **AoS vs SoA**:
  - Array of Structures (`std::vector<Quote>`): good when the hot loop uses most fields of each object.
  - Structure of Arrays (`std::vector<double> bid, ask, ...`): good when the loop uses one or two fields across many objects (every byte loaded is useful, SIMD-friendly contiguous data).
  - Choose by access pattern; the Systems chapter covers measurements.
- **False sharing**: two threads writing different variables that share one cache line make the line bounce between cores. Fix: give each hot variable its own line with `alignas(64)` (struct with two such counters: 128 bytes).
- `std::hardware_destructive_interference_size` / `hardware_constructive_interference_size` (C++17, `<new>`): portable constants for this. Library support arrived late (libstdc++ in GCC 12, which warns `-Winterference-size` because the value may differ between `-mtune` targets); GCC 11 does not define them, so code often falls back to 64.
- Padding to a cache line wastes memory; use it for a few hot, contended objects (queue indices, per-thread counters, shard locks), not for millions of small objects.

#### 11. Misconceptions to unlearn
- ❌ "An address must be divisible by `sizeof(T)`." ✅ By `alignof(T)`; they coincide only for some scalars.
- ❌ "`sizeof(struct)` is a multiple of its largest member's size." ✅ A multiple of the struct's alignment.
- ❌ "A 12-byte struct must start at a multiple of 12." ✅ At a multiple of its alignment (4).
- ❌ "Padding exists to keep the struct in one cache line." ✅ Padding satisfies alignment; cache-line placement is a separate, explicit choice (`alignas(64)`).
- ❌ "The compiler reorders members to minimise padding." ✅ C++ compilers never reorder data members; you must order them.
- ❌ "`alignas(1)` packs a struct." ✅ `alignas` can only increase alignment; packing needs `#pragma pack` or `__attribute__((packed))`.
- ❌ "Misaligned access is fine on x86." ✅ It is UB in C++, slower across cache lines, non-atomic for atomics, and faults on other CPUs.
- ❌ "`memcmp` is a fast, correct equality for structs." ✅ Padding bytes are unspecified; compare members or use `= default` `operator==`.
- ❌ "An empty member costs nothing." ✅ It costs at least one byte plus padding unless it is a base or `[[no_unique_address]]`.
- ❌ "Different bit-fields can be written by different threads." ✅ Adjacent bit-fields form one memory location: that is a data race.
- ❌ "SoA is always faster than AoS." ✅ It depends on which fields the hot loop touches.

### EDGE_CASES: Traps and Misconceptions

#### Edge Case 1: Alignment is not size
- `sizeof(int) == alignof(int) == 4` on x86-64, which makes "divisible by size" look correct. It breaks for aggregates and some scalars:
  - `struct { char c[7]; }`: size 7, alignment 1.
  - `struct { double d; char c; }`: size 16, alignment 8.
  - `long double`: 16/16 on x86-64 Linux, but 8/8 with MSVC; and 12/4 on 32-bit x86 Linux.
- The correct rules are always stated with `alignof`: member offsets are multiples of the member's alignment, and `sizeof` is a multiple of the struct's alignment.

#### Edge Case 2: Tail padding counts, even with no member after it
- `struct B { int i; char c; char d; };` uses 6 bytes of data but `sizeof(B) == 8`.
- `sizeof` must be the array stride, and the stride must keep `arr[1].i` aligned.
- Consequence: `malloc(6)` for a `B`, or writing `B` to a socket with a hand-computed length of 6, is wrong; always use `sizeof`.

#### Edge Case 3: memcmp and hashing over padding
- Two objects with equal members can differ in their padding bytes, so `memcmp` says "not equal" and a byte-wise hash puts them in different buckets.
- Zeroed padding is only promised by zero-initialization (statics; value-initialization of a non-aggregate without a user-provided constructor). `T x{}` on a plain aggregate usually zeroes it in practice but does not promise it, and later member assignments and copies do not have to preserve padding values.
- `std::has_unique_object_representations_v<T>` tells you whether byte-wise comparison/hashing is valid for `T`.
- Sending a padded struct over the network or into a file also leaks stale stack or heap bytes.

#### Edge Case 4: References and pointers into packed structs
- `#pragma pack(1) struct P { char c; int i; };` places `i` at offset 1.
- `int& r = p.i;` or `int* q = &p.i;` produce a "normal" `int` reference/pointer to a misaligned address; any later use is UB and can fault on strict-alignment CPUs or with SIMD/atomics.
- Diagnostics are inconsistent: with `__attribute__((packed))` GCC refuses the reference and warns for the pointer (Clang 14 warns for the pointer only); with `#pragma pack` GCC 11 and Clang 14 said nothing.
- Copy the value out (`int v = p.i;`) instead of taking its address.

#### Edge Case 5: Casting a byte buffer to a struct pointer
- `auto* h = reinterpret_cast<const Header*>(buf + 3);` is wrong twice:
  - Misalignment: `buf + 3` is not aligned for `Header` (UB; UBSan reports "misaligned address").
  - Lifetime/aliasing: no `Header` object exists there (topic 10: `std::start_lifetime_as`, strict aliasing).
- It "works" on x86 in tests and breaks on ARM, under optimisation, or under sanitizers.
- Fix: `Header h; std::memcpy(&h, buf + 3, sizeof h);` (one or two loads after optimisation).

#### Edge Case 6: alignas that is silently ignored, or rejected
- `alignas(1) int x;` asks for less than the natural alignment: ill-formed. Clang: error; GCC 11: accepted and ignored (`alignof` remains 4).
- `alignas(3)`: error on all compilers (not a power of two).
- `alignas(64)` on a struct makes `sizeof` at least 64: an array of 1000 such structs uses 64 KB even if each holds one `int`.
- `alignas` on a typedef or a function parameter is not allowed; put it on the variable, member or class.

#### Edge Case 7: EBO fails, or does not exist on one compiler
- `struct D2 : E { E e; int x; };` is 8 bytes on GCC: the base `E` and member `e` are distinct objects of the same type and must have distinct addresses.
- Two `[[no_unique_address]]` members of the same empty type also need distinct addresses.
- MSVC ignores `[[no_unique_address]]` (needs `[[msvc::no_unique_address]]`) and applies EBO only to the first empty base in some multiple-inheritance cases, so sizes differ across platforms.

#### Edge Case 8: Tail-padding reuse makes memcpy of a base subobject dangerous
- With the Itanium ABI, a derived class can put members into the tail padding of a non-POD base.
- `struct Base { int x; char c; Base() {} }; struct Der : Base { char d; };`: `sizeof(Der) == 8`, `d` lives at offset 5, inside `Base`'s padding.
- `std::memcpy(static_cast<Base*>(&der), &other_base, sizeof(Base))` overwrites `d`. Copying through `Base`'s assignment operator is safe; raw `memcpy` of a base subobject is not, even for trivially copyable types.
- Remove the user-provided constructor (making `Base` an aggregate/POD) and `sizeof(Der)` becomes 12: the layout depends on whether a base "is POD", a surprising ABI detail.

#### Edge Case 9: Bit-fields shared between threads
- `struct Flags { unsigned a:4; unsigned b:4; };` with thread 1 writing `a` and thread 2 writing `b` is a data race: both fields are one memory location, and each write is a read-modify-write of the shared byte(s). Updates can be lost.
- TSan reports: "WARNING: ThreadSanitizer: data race".
- Fix: separate fields (`unsigned char a; unsigned char b;` are distinct memory locations), a zero-width bit-field between them, or one lock/atomic for the whole word.

### CODE_EXAMPLES: Practical Demonstrations

#### Example 1: Inspecting and locking a layout
- `sizeof`, `alignof`, `offsetof` and `static_assert` make the layout visible and keep it from drifting.
```cpp
#include <cstddef>
#include <iostream>

struct A  { char c; int i; char d; };
struct B  { int i; char c; char d; };
struct C1 { char a; double b; char c; int d; };
struct C2 { double b; int d; char a; char c; };   // same members, sorted by alignment

static_assert(sizeof(C2) == 16 && alignof(C2) == 8, "C2 layout changed");
static_assert(offsetof(C2, d) == 8, "C2::d moved");

int main() {
    std::cout << "A:  size " << sizeof(A) << " align " << alignof(A)
              << " offsets " << offsetof(A, c) << ',' << offsetof(A, i) << ','
              << offsetof(A, d) << '\n';
    std::cout << "B:  size " << sizeof(B) << " align " << alignof(B)
              << " offsets " << offsetof(B, i) << ',' << offsetof(B, c) << ','
              << offsetof(B, d) << '\n';
    std::cout << "C1: size " << sizeof(C1) << " offsets " << offsetof(C1, a) << ','
              << offsetof(C1, b) << ',' << offsetof(C1, c) << ','
              << offsetof(C1, d) << '\n';
    std::cout << "C2: size " << sizeof(C2) << " offsets " << offsetof(C2, b) << ','
              << offsetof(C2, d) << ',' << offsetof(C2, a) << ','
              << offsetof(C2, c) << '\n';
    std::cout << "10M x A = " << 10'000'000 * sizeof(A) / 1'000'000 << " MB, 10M x B = "
              << 10'000'000 * sizeof(B) / 1'000'000 << " MB\n";
}
```
- Output (x86-64 Linux):
```
A:  size 12 align 4 offsets 0,4,8
B:  size 8 align 4 offsets 0,4,5
C1: size 24 offsets 0,8,16,20
C2: size 16 offsets 0,8,12,13
10M x A = 120 MB, 10M x B = 80 MB
```
- The `static_assert`s turn "someone added a field in the middle" into a compile error instead of a corrupted file or wire message.

#### Example 2: Why tail padding exists: arrays
- Element addresses step by `sizeof`; every element's `int` stays 4-aligned. The array starts at a multiple of 4, not of 12.
```cpp
#include <cstdint>
#include <iostream>

struct A { char c; int i; char d; };

int main() {
    A arr[3];
    auto base = reinterpret_cast<std::uintptr_t>(&arr[0]);
    for (int k = 0; k < 3; ++k) {
        auto a = reinterpret_cast<std::uintptr_t>(&arr[k]);
        auto i = reinterpret_cast<std::uintptr_t>(&arr[k].i);
        std::cout << "arr[" << k << "] at +" << (a - base)
                  << ", i at +" << (i - base)
                  << ", i aligned: " << (i % alignof(int) == 0) << '\n';
    }
    std::cout << "array start % 4 = " << base % 4 << ", % 12 = " << base % 12
              << " (varies)\n";
}
```
- Output (the last value depends on the stack address):
```
arr[0] at +0, i at +4, i aligned: 1
arr[1] at +12, i at +16, i aligned: 1
arr[2] at +24, i at +28, i aligned: 1
array start % 4 = 0, % 12 = 8 (varies)
```
- Without the 3 bytes of tail padding, `arr[1]` would start at +9 and `arr[1].i` at +13: misaligned.

#### Example 3: alignas, over-aligned heap objects and cache-line padding
- C++17 aligned `new` makes over-aligned types work with `new`, `make_unique` and `std::vector`; `std::align` carves aligned blocks out of a raw buffer.
```cpp
#include <atomic>
#include <cstddef>
#include <cstdint>
#include <iostream>
#include <memory>
#include <vector>

struct alignas(64) PaddedCounter { std::atomic<long> v{0}; };   // one per cache line

struct TwoCounters {
    PaddedCounter produced;        // written by thread 1
    PaddedCounter consumed;        // written by thread 2: different cache line
};

struct S { char c; alignas(16) int x; };

bool aligned(const void* p, std::size_t a) {
    return reinterpret_cast<std::uintptr_t>(p) % a == 0;
}

int main() {
    std::cout << "PaddedCounter: size " << sizeof(PaddedCounter)
              << " align " << alignof(PaddedCounter) << '\n';
    std::cout << "TwoCounters: size " << sizeof(TwoCounters) << '\n';
    std::cout << "S: size " << sizeof(S) << ", offset of x " << offsetof(S, x) << '\n';

    auto up = std::make_unique<PaddedCounter>();        // operator new(size, align_val_t)
    std::vector<PaddedCounter> vec(4);
    std::cout << "heap object 64-aligned: " << aligned(up.get(), 64)
              << ", vector element 64-aligned: " << aligned(&vec[3], 64) << '\n';

    alignas(16) std::byte buf[256];
    void* p = buf + 1;                                  // deliberately misaligned start
    std::size_t space = sizeof(buf) - 1;
    void* blk = std::align(64, 32, p, space);           // find a 64-aligned 32-byte block
    std::cout << "std::align found block: " << (blk != nullptr)
              << ", 64-aligned: " << aligned(blk, 64) << '\n';
}
```
- Output:
```
PaddedCounter: size 64 align 64
TwoCounters: size 128
S: size 32, offset of x 16
heap object 64-aligned: 1, vector element 64-aligned: 1
std::align found block: 1, 64-aligned: 1
```
- `TwoCounters` costs 128 bytes for 16 bytes of data: worth it only for a few hot, contended variables.

#### Example 4: Packed structs vs memcpy for wire data
- A packed header matches the wire byte-for-byte but has misaligned members; reading fields with `memcpy` from the buffer works for any offset.
```cpp
#include <cstdint>
#include <cstring>
#include <iostream>
#include <type_traits>

#pragma pack(push, 1)
struct WireHeader {            // 1 + 4 + 8 = 13 bytes on the wire
    std::uint8_t  type;
    std::uint32_t length;
    std::uint64_t seq;
};
#pragma pack(pop)

struct Header {                // natural layout for in-memory use
    std::uint64_t seq;
    std::uint32_t length;
    std::uint8_t  type;
};

static_assert(sizeof(WireHeader) == 13, "wire layout changed");
static_assert(std::is_trivially_copyable_v<Header>);

Header parse(const unsigned char* p) {            // p may have any alignment
    Header h{};
    std::memcpy(&h.type, p, 1);
    std::memcpy(&h.length, p + 1, 4);
    std::memcpy(&h.seq, p + 5, 8);
    return h;                                      // byte order: little-endian assumed
}

int main() {
    unsigned char packet[3 + 13] = {};
    unsigned char* msg = packet + 3;               // header starts at an odd offset
    WireHeader w{7, 120, 900001};
    std::memcpy(msg, &w, sizeof w);

    Header h = parse(msg);
    std::cout << "WireHeader: size " << sizeof(WireHeader) << " align "
              << alignof(WireHeader) << '\n';
    std::cout << "Header:     size " << sizeof(Header) << " align "
              << alignof(Header) << '\n';
    std::cout << "type=" << int(h.type) << " length=" << h.length
              << " seq=" << h.seq << '\n';
}
```
- Output:
```
WireHeader: size 13 align 1
Header:     size 16 align 8
type=7 length=120 seq=900001
```
- `reinterpret_cast<const Header*>(msg)` would be misaligned and would not refer to a `Header` object: UB (Edge Case 5).
- Real protocols also fix the byte order; convert with `std::byteswap` (C++23) or shifts when it differs from the host's (`std::endian::native`, C++20).

#### Example 5: Padding bytes break memcmp; compare members instead
- Equal members, different padding bytes.
```cpp
#include <cstring>
#include <iostream>
#include <type_traits>

struct A {
    char c; int i; char d;
    bool operator==(const A&) const = default;    // C++20: member-wise
};
struct Pair { int a; int b; };

int main() {
    A x;
    std::memset(&x, 0xAA, sizeof x);   // simulate stale bytes in padding
    x.c = 1; x.i = 2; x.d = 3;
    A y{};                              // padding: typically zero, not promised
    y.c = 1; y.i = 2; y.d = 3;

    std::cout << "members equal (==): " << (x == y) << '\n';
    std::cout << "memcmp equal:       " << (std::memcmp(&x, &y, sizeof x) == 0) << '\n';
    std::cout << "unique repr A:    " << std::has_unique_object_representations_v<A>
              << '\n';
    std::cout << "unique repr Pair: " << std::has_unique_object_representations_v<Pair>
              << '\n';
}
```
- Output (observed with GCC 11 on x86-64, `-O0`):
```
members equal (==): 1
memcmp equal:       0
unique repr A:    0
unique repr Pair: 1
```
- The `memcmp` line is an observation, not a guarantee: padding bytes have unspecified values, `A y{}` is not required to zero them, and stores to members may overwrite them. It could print `1`; the point is that you cannot rely on either result. Lines 1, 3 and 4 are guaranteed.
- `Pair` has no padding, so byte-wise comparison and hashing are valid for it; for `A` they are not.

#### Example 6: Empty members, EBO and [[no_unique_address]]
- A stateless policy costs a byte plus padding as a member, nothing as a base or `[[no_unique_address]]` member.
```cpp
#include <iostream>

struct Less { bool operator()(int a, int b) const { return a < b; } };  // empty

struct AsMember     { Less cmp; int* data; };
struct AsBase : Less { int* data; };
struct WithAttr     { [[no_unique_address]] Less cmp; int* data; };
struct SameTypeTwice : Less { Less cmp; int* data; };

int main() {
    std::cout << "sizeof(Less)          " << sizeof(Less) << '\n';
    std::cout << "AsMember              " << sizeof(AsMember) << '\n';
    std::cout << "AsBase (EBO)          " << sizeof(AsBase) << '\n';
    std::cout << "WithAttr              " << sizeof(WithAttr) << '\n';
    std::cout << "SameTypeTwice         " << sizeof(SameTypeTwice) << '\n';
    WithAttr w{};
    std::cout << "cmp works: " << w.cmp(1, 2) << '\n';
}
```
- Output (GCC/Clang on Linux; MSVC ignores the standard attribute):
```
sizeof(Less)          1
AsMember              16
AsBase (EBO)          8
WithAttr              8
SameTypeTwice         16
cmp works: 1
```
- `SameTypeTwice`: the base `Less` and the member `Less` must have different addresses, so the member needs its own byte (plus 7 bytes of padding).

#### Example 7: Bit-fields: compact flags and their rules
- Sizes, truncation on overflow, signed 1-bit fields and zero-width separators.
```cpp
#include <cstdint>
#include <iostream>

struct OrderFlags {
    unsigned side     : 1;    // 0 buy, 1 sell
    unsigned tif      : 3;    // time-in-force code 0..7
    unsigned venue    : 4;    // 0..15
    unsigned reserved : 24;
};

struct Split {
    unsigned a : 3;
    unsigned   : 0;           // start a new unit for b
    unsigned b : 3;
};

struct Signed1 { int s : 1; };

int main() {
    OrderFlags f{};
    f.side = 1;
    f.tif = 5;
    f.venue = 12;
    std::cout << "sizeof(OrderFlags) " << sizeof(OrderFlags) << '\n';
    std::cout << "side " << f.side << " tif " << f.tif << " venue " << f.venue << '\n';

    unsigned big = 9;
    f.tif = big;              // 9 does not fit in 3 bits: low bits kept
    std::cout << "tif after storing 9: " << f.tif << '\n';

    std::cout << "sizeof(Split) " << sizeof(Split) << '\n';
    Signed1 s{};
    s.s = -1;
    std::cout << "signed 1-bit field holds " << s.s << '\n';
}
```
- Output:
```
sizeof(OrderFlags) 4
side 1 tif 5 venue 12
tif after storing 9: 1
sizeof(Split) 8
signed 1-bit field holds -1
```
- Storing a constant `9` directly triggers GCC's `-Woverflow` warning; storing a variable does not.
- Bit order inside the 4 bytes is implementation-defined: do not `memcpy` `OrderFlags` onto a wire format; pack with shifts and masks instead.

### QUICK_REFERENCE: Cheat Sheet

#### Layout rules
| Rule | Detail |
|---|---|
| Member offset | Multiple of the member's `alignof` |
| Struct alignment | Max of member/base alignments (or `alignas`) |
| `sizeof(struct)` | Rounded up to a multiple of its alignment (tail padding) |
| Array stride | `sizeof(T)`; `alignof(T[N]) == alignof(T)` |
| Member order | Declaration order, never reordered by the compiler |
| Empty class | `sizeof` 1; 0 as base (EBO) or `[[no_unique_address]]` member |
| Over-aligned | `alignof > alignof(max_align_t)` (16 on x86-64); heap support since C++17 |

#### Sizes on x86-64 Linux (GCC/Clang)
| Struct | sizeof | alignof |
|---|---|---|
| `{char; int; char}` | 12 | 4 |
| `{int; char; char}` | 8 | 4 |
| `{char; double; char; int}` | 24 | 8 |
| `{double; int; char; char}` | 16 | 8 |
| `{char; alignas(16) int}` | 32 | 16 |
| `alignas(64) {int}` | 64 | 64 |
| `{virtual dtor; int}` | 16 | 8 |
| packed `{char; int}` | 5 | 1 |
| `{unsigned a:3, b:5, c:24}` | 4 | 4 |

#### Tools
| Need | Tool |
|---|---|
| Lock a layout | `static_assert(sizeof/alignof/offsetof ...)` |
| Find holes | `-Wpadded`, `pahole` |
| Safe unaligned read | `std::memcpy`, `std::bit_cast` |
| Align inside a buffer | `std::align` |
| Byte-wise compare/hash valid? | `std::has_unique_object_representations_v<T>` |
| Detect misaligned access | `-fsanitize=alignment` (part of `undefined`) |
| Cache-line padding | `alignas(64)` / `std::hardware_destructive_interference_size` (GCC 12+) |

#### Interview one-liners
- "Members go at multiples of their alignment; the struct's size is rounded to a multiple of its alignment so arrays stay aligned."
- "Alignment is not size: `alignof`, not `sizeof`, decides valid addresses."
- "Sort members by decreasing alignment to cut padding, unless hot/cold grouping or ABI says otherwise."
- "`alignas` only raises alignment; packing lowers it and makes members misaligned."
- "Misaligned access is UB even if x86 tolerates it; copy bytes out with `memcpy`."
- "Padding bytes are unspecified: never `memcmp` or hash a padded struct."
- "Empty members cost a byte plus padding; use a base or `[[no_unique_address]]`."
- "Adjacent bit-fields are one memory location: two threads writing different fields is a data race."
- "`alignas(64)` separates hot variables written by different threads: false sharing is a layout bug."
