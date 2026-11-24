## TOPIC: Alignment, Padding and Data Layout

### PRACTICE_TASKS: Output Prediction and Bug Hunting

#### Q1
```cpp
// Q: What does this print on x86-64 Linux?
#include <iostream>

struct Trade  { char side; double px; char flag; };
struct Trade2 { double px; char side; char flag; };

int main() {
    Trade t[3];
    std::cout << sizeof(Trade) << ' ' << sizeof(Trade2) << ' '
              << sizeof(t) << ' ' << alignof(Trade) << '\n';
}
```

**Answer:**
```
24 16 72 8
```

**Explanation:**
- `Trade`: `side`@0, 7 bytes padding, `px`@8, `flag`@16, 7 bytes tail padding → 24 (a multiple of the alignment 8).
- `Trade2`: `px`@0, `side`@8, `flag`@9, 6 bytes tail padding → 16.
- An array has no extra padding: `3 * 24 = 72`.
- Alignment is the strictest member's: `double` → 8.
- **Key Concept:** Ordering members by decreasing alignment removed 8 of 24 bytes (one third).

---

#### Q2
```cpp
// Q: The author wanted a 1-aligned int to "pack" Msg. What does GCC print?
#include <iostream>

struct alignas(1) Msg {
    char tag;
    int value;
};

int main() {
    std::cout << alignof(Msg) << ' ' << sizeof(Msg) << '\n';
}
```

**Answer:**
```
4 8
```
(GCC 11 compiles it and ignores the request; Clang rejects it: "requested alignment is less than minimum alignment of 4 for type 'Msg'". The program is ill-formed.)

**Explanation:**
- `alignas` can only make alignment stricter. A request below the natural alignment of the entity is ill-formed; GCC silently ignores it, Clang reports an error.
- `Msg` keeps alignment 4, `value` stays at offset 4, size 8.
- To remove the padding you need packing (`#pragma pack(push, 1)` → size 5, alignment 1), with all its misalignment consequences, or simply a different member order.
- **Key Concept:** `alignas` raises alignment; it never packs.

---

#### Q3
```cpp
// Q: The same order is inserted twice. Why does the set contain two entries?
#include <cstring>
#include <functional>
#include <iostream>
#include <string_view>
#include <unordered_set>

struct Key {
    char side;
    int id;
    bool operator==(const Key& o) const { return side == o.side && id == o.id; }
};

struct BytesHash {                    // "fast" hash over the raw bytes
    std::size_t operator()(const Key& k) const {
        std::string_view bytes(reinterpret_cast<const char*>(&k), sizeof k);
        return std::hash<std::string_view>{}(bytes);
    }
};

int main() {
    Key a;
    std::memset(&a, 0xAB, sizeof a);  // stands in for stale stack bytes
    a.side = 'B';
    a.id = 42;
    Key b{};                          // padding zeroed
    b.side = 'B';
    b.id = 42;

    std::unordered_set<Key, BytesHash> s{a, b};
    std::cout << "equal: " << (a == b) << ", set size: " << s.size() << '\n';
}
```

**Answer:**
```
equal: 1, set size: 2
```

**Explanation:**
- `Key` has 3 padding bytes after `side`. Their values are unspecified; here `a` has `0xAB` and `b` has zeros there.
- The byte hash includes the padding, so equal keys get different hashes and land in different buckets; `==` is never even consulted. The container's invariant (equal keys have equal hashes) is broken.
- `std::has_unique_object_representations_v<Key>` is false, which is exactly the warning sign.
- **Key Concept:** Hash and compare members, never the raw bytes of a padded struct.

**Fixed Version:**
```cpp
#include <cstring>
#include <functional>
#include <iostream>
#include <unordered_set>

struct Key {
    char side;
    int id;
    bool operator==(const Key& o) const { return side == o.side && id == o.id; }
};

struct MemberHash {
    std::size_t operator()(const Key& k) const {
        return std::hash<int>{}(k.id) * 31 + std::hash<char>{}(k.side);
    }
};

int main() {
    Key a;
    std::memset(&a, 0xAB, sizeof a);
    a.side = 'B';
    a.id = 42;
    Key b{};
    b.side = 'B';
    b.id = 42;

    std::unordered_set<Key, MemberHash> s{a, b};
    std::cout << "equal: " << (a == b) << ", set size: " << s.size() << '\n';   // 1, 1
}
```

---

#### Q4
```cpp
// Q: Each thread owns a different field. Is this correct? (Try -fsanitize=thread.)
#include <iostream>
#include <thread>

struct Status {
    unsigned feed_up : 1;      // written only by the feed thread
    unsigned seq_lo  : 7;      // written only by the sequencer thread
};

Status st{};

int main() {
    std::thread feed([] {
        for (int i = 0; i < 100000; ++i) st.feed_up = i & 1;
    });
    std::thread seq([] {
        for (int i = 0; i < 100000; ++i) st.seq_lo = i & 0x7F;
    });
    feed.join();
    seq.join();
    std::cout << "done\n";
}
```

**Answer:**
```
Data race (undefined behaviour). It prints "done", but TSan reports
"WARNING: ThreadSanitizer: data race" between the two bit-field writes.
```

**Explanation:**
- `feed_up` and `seq_lo` are adjacent bit-fields, so together they form one **memory location**. Each assignment is a read-modify-write of the shared byte: one thread can write back a stale copy of the other thread's bits (lost update).
- Separate members (two `unsigned char`s) would be distinct memory locations: no data race.
- Alternatives: a zero-width bit-field `unsigned : 0;` between them (forces a new unit), one mutex for both, or one atomic word updated with `fetch_or`/`fetch_and`.
- **Key Concept:** Different bit-fields are not independent variables for the memory model.

**Fixed Version:**
```cpp
#include <iostream>
#include <thread>

struct Status {
    unsigned char feed_up;     // separate memory locations
    unsigned char seq_lo;
};

Status st{};

int main() {
    std::thread feed([] {
        for (int i = 0; i < 100000; ++i) st.feed_up = i & 1;
    });
    std::thread seq([] {
        for (int i = 0; i < 100000; ++i) st.seq_lo = i & 0x7F;
    });
    feed.join();
    seq.join();
    std::cout << "done\n";     // TSan clean
}
```

---

#### Q5
```cpp
// Q: The only difference is a user-provided constructor in the base. What is printed?
#include <cstddef>
#include <iostream>

struct BaseAgg  { int x; char c; };
struct BaseCtor { int x; char c; BaseCtor() : x(0), c(0) {} };

struct D1 : BaseAgg  { char d; };
struct D2 : BaseCtor { char d; };

int main() {
    std::cout << sizeof(BaseAgg) << ' ' << sizeof(BaseCtor) << ' '
              << sizeof(D1) << ' ' << sizeof(D2) << '\n';
}
```

**Answer:**
```
8 8 12 8
```

**Explanation:**
- Both bases are 8 bytes: `x`@0, `c`@4, 3 bytes of tail padding.
- `D1`: `BaseAgg` is "POD for layout" in the Itanium ABI, so its tail padding is not reused: `d` goes at offset 8 → 12 bytes.
- `D2`: `BaseCtor` is not POD (user-provided constructor), so the ABI is allowed to reuse its tail padding: `d` sits at offset 5 → still 8 bytes.
- Platform-specific: this is the Itanium C++ ABI (GCC/Clang on Linux and macOS); MSVC does not reuse base tail padding this way.
- **Key Concept:** A base's tail padding may hold derived members, and whether it does can depend on seemingly unrelated details.

---

#### Q6
```cpp
// Q: What does this print? Find the bug.
#include <cstring>
#include <iostream>

struct Base {
    int x;
    char c;
    Base() : x(0), c(0) {}
};
struct Der : Base { char d; };

int main() {
    Der der;
    der.d = 'X';
    static Base src;                  // static storage: padding bytes start as zero
    src.x = 1;
    src.c = 'c';

    std::cout << "sizeof(Der)=" << sizeof(Der) << " d before: " << der.d << '\n';
    std::memcpy(static_cast<Base*>(&der), &src, sizeof(Base));   // "fast" base copy
    std::cout << "x=" << der.x << " d after: " << int(der.d) << '\n';
}
```

**Answer:**
```
sizeof(Der)=8 d before: X
x=1 d after: 0
```

**Explanation:**
- `Der::d` lives at offset 5, inside `Base`'s tail padding (Q5). `memcpy` of `sizeof(Base)` = 8 bytes copies `src`'s padding byte (zero, because `src` has static storage) over `d`.
- The standard forbids exactly this: the trivially-copyable `memcpy` guarantee does not cover potentially-overlapping subobjects (base classes, `[[no_unique_address]]` members). The program has undefined behaviour; this output is what GCC produced.
- Fix: `static_cast<Base&>(der) = src;` copies only `x` and `c`.
- **Key Concept:** Never `memcpy` into a base-class subobject; use its assignment operator.

---

#### Q7
```cpp
// Q: What does this print on x86-64 Linux?
#include <atomic>
#include <cstddef>
#include <iostream>
#include <vector>

struct Queue {
    alignas(64) std::atomic<int> head{0};   // written by the consumer
    alignas(64) std::atomic<int> tail{0};   // written by the producer
    char buf[16];
};

int main() {
    std::vector<Queue> v(2);
    auto stride = reinterpret_cast<char*>(&v[1]) - reinterpret_cast<char*>(&v[0]);
    std::cout << sizeof(Queue) << ' ' << alignof(Queue) << ' '
              << offsetof(Queue, tail) << ' ' << offsetof(Queue, buf) << ' '
              << stride << '\n';
}
```

**Answer:**
```
128 64 64 68 128
```

**Explanation:**
- `head`@0, `tail` must be 64-aligned → offset 64; `buf` follows at 68.
- The struct's alignment is 64, so 84 bytes of data round up to 128.
- `std::vector` places elements `sizeof(Queue)` apart and, since C++17, uses aligned allocation so every element is 64-aligned.
- `head` and `tail` are on different cache lines: producer and consumer no longer invalidate each other's line (false sharing avoided). `buf` shares `tail`'s line; in a real ring buffer the data would also be separated.
- **Key Concept:** `alignas(64)` on members separates hot variables, at the cost of a larger struct.

---

#### Q8
```cpp
// Q: Does this compile with GCC?
#include <cstdint>
#include <iostream>

struct __attribute__((packed)) Header {
    std::uint8_t  type;
    std::uint32_t length;
};

void bump(std::uint32_t& n) { ++n; }

int main() {
    Header h{1, 100};
    bump(h.length);
    std::cout << h.length << '\n';
}
```

**Answer:**
```
Compile error: cannot bind packed field 'h.Header::length' to 'uint32_t&' {aka 'unsigned int&'}
```

**Explanation:**
- `length` sits at offset 1. A `std::uint32_t&` promises a 4-aligned object, which a packed member cannot guarantee, so GCC refuses (taking `&h.length` only warns with `-Waddress-of-packed-member`).
- With `#pragma pack(push, 1)` instead of the attribute, GCC 11 compiled the same code silently: the danger is still there, only the diagnostic is missing.
- Compiler-specific: Clang 14 compiles this exact program (attribute version) without any diagnostic, even with `-Wall -Wextra`, and prints 101. Only GCC rejects it.
- Fix: copy out, modify, copy back: `auto n = h.length; bump(n); h.length = n;`.
- **Key Concept:** References and pointers to packed members are misaligned pointers in disguise.

**Fixed Version:**
```cpp
#include <cstdint>
#include <iostream>

struct __attribute__((packed)) Header {
    std::uint8_t  type;
    std::uint32_t length;
};

void bump(std::uint32_t& n) { ++n; }

int main() {
    Header h{1, 100};
    std::uint32_t n = h.length;   // aligned local copy
    bump(n);
    h.length = n;
    std::cout << h.length << '\n';   // 101
}
```

---

#### Q9
```cpp
// Q: What does this print?
#include <iostream>

struct Flags {
    int active : 1;
    unsigned level : 2;
};

int main() {
    Flags f{};
    f.active = 1;
    int lvl = 5;
    f.level = lvl;
    std::cout << (f.active == 1 ? "active" : "not active") << ' '
              << f.active << ' ' << f.level << '\n';
}
```

**Answer:**
```
not active -1 1
```

**Explanation:**
- A signed 1-bit field can only hold 0 and -1 (two's complement, guaranteed since C++20). Storing 1 sets the single bit, which reads back as -1, so `f.active == 1` is false.
- GCC even says so with `-Wextra`: "comparison is always false due to limited range of data type [-Wtype-limits]".
- `level` has 2 bits; 5 is `101` in binary, the low two bits `01` are kept → 1. (Assigning the constant `5` directly would trigger GCC's `-Woverflow` warning; through a variable there is no warning.)
- Fix: use `unsigned active : 1;` or `bool active : 1;` for flags.
- **Key Concept:** Bit-fields silently truncate, and 1-bit signed fields are a classic boolean bug.

---

#### Q10
```cpp
// Q: Does this compile?
#include <iostream>
#include <utility>

struct Pair {
    unsigned a : 4;
    unsigned b : 4;
};

int main() {
    Pair p{1, 2};
    std::swap(p.a, p.b);
    std::cout << p.a << ' ' << p.b << '\n';
}
```

**Answer:**
```
Compile error: cannot bind bit-field 'p.Pair::a' to 'unsigned int&'
```

**Explanation:**
- `std::swap` takes its arguments by non-const reference. A bit-field is not addressable (it may start in the middle of a byte), so no `unsigned&` can refer to it.
- The same applies to `&p.a`, `std::cin >> p.a`, and any API taking `T&`.
- Fix: swap through temporaries.
- **Key Concept:** Bit-fields are not objects with addresses; generic code expecting references does not accept them.

**Fixed Version:**
```cpp
#include <iostream>

struct Pair {
    unsigned a : 4;
    unsigned b : 4;
};

int main() {
    Pair p{1, 2};
    unsigned tmp = p.a;
    p.a = p.b;
    p.b = tmp;
    std::cout << p.a << ' ' << p.b << '\n';   // 2 1
}
```

---

#### Q11
```cpp
// Q: What does this print? (Hint: alignment is not size.)
#include <iostream>

struct Sym7 { char name[7]; };
struct WithChar   { Sym7 s; char venue; };
struct WithDouble { Sym7 s; double px; };
struct WithShort  { char c; Sym7 s; short qty; };

int main() {
    std::cout << sizeof(Sym7) << '/' << alignof(Sym7) << ' '
              << sizeof(WithChar) << ' ' << sizeof(WithDouble) << ' '
              << sizeof(WithShort) << '\n';
}
```

**Answer:**
```
7/1 8 16 10
```

**Explanation:**
- `Sym7` is 7 bytes with alignment 1: its alignment comes from its member `char`, not from its size.
- `WithChar`: 7 + 1 = 8, alignment 1, no padding.
- `WithDouble`: `s`@0-6, padding to 8, `px`@8 → 16.
- `WithShort`: `c`@0, `s`@1-7 (alignment 1, so no padding before it), `qty` needs 2-alignment → offset 8, size 10 (a multiple of 2).
- Reasoning with "divisible by size" would wrongly place `s` at offset 7 or pad `Sym7` to 8.
- **Key Concept:** Offsets follow each member's `alignof`; an array of chars has alignment 1 whatever its size.
