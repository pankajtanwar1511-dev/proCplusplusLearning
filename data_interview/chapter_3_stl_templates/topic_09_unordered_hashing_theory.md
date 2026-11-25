## TOPIC: Unordered Containers and Hashing

### THEORY_SECTION: Core Concepts

#### 1. Mental model
- `std::unordered_map<K, V>` (and `unordered_set`, `unordered_multimap`, `unordered_multiset`, all C++11) is a **hash table with separate chaining**:
  - A **bucket array**: a contiguous array of pointers, one per bucket.
  - **Nodes**: every element lives in its own heap-allocated node (key, value, link pointer, sometimes a cached hash code).
  - `bucket = hash(key) mod bucket_count()` (how the index is reduced is implementation-defined).
- Lookup = hash the key, jump to the bucket, walk the chain comparing keys with `key_equal` until a match.
- The standard effectively mandates this node-based design: references to elements must survive a rehash, so elements cannot be stored inline in the bucket array (that rules out open addressing for `std::` containers).
- libstdc++ / GCC, x86-64 layout (implementation detail, not standard):
  - All nodes form **one singly linked list**; each bucket points to the node *before* its first node. Iteration walks that one list, so it costs O(size), not O(bucket_count).
  - `sizeof(std::unordered_map<int,int>)` is 56 bytes, plus a single inline bucket used while empty (`bucket_count()` is 1 for a default-constructed map).
  - The hash code is **cached in the node** when the hash is not "fast" (for example `std::string` keys) and not cached for `int` keys.
- Three things to keep apart: **hash function** (spreads keys), **equality** (decides identity), **load factor** (decides when the table grows).

#### 2. Complexity: average, worst and amortized
| Operation | Average | Worst | Note |
|---|---|---|---|
| `find`, `count`, `contains` (C++20) | O(1) | O(n) | Worst case = every key in one bucket |
| `insert`, `emplace`, `operator[]` | O(1) amortized | O(n) | Plus an occasional O(n) rehash |
| `erase(key)` | O(1) | O(n) | `erase(it)` average O(1) |
| `rehash`, `reserve` | O(n) | O(n²) | Relinks every node; allocates a new bucket array |
| Full iteration | O(n) in libstdc++ | | Order is unspecified |
- "Average" is about the key distribution (a good hash spreads keys); "amortized" is about rare expensive steps (rehash) spread over many cheap inserts. Lookup is average O(1); insertion is average **and** amortized O(1).
- Worst case comes from collisions: a bad hash, adversarial input (hash flooding), or keys that happen to be multiples of the bucket count with an identity hash.
- O(1) is about operation **count**, not time. Each lookup computes a hash and usually follows two pointers (bucket, then node): typically one or two cache misses on a large table.

#### 3. Load factor and when rehash happens
- `load_factor() = size() / bucket_count()`: average chain length.
- `max_load_factor()` defaults to **1.0**. You can set it: `m.max_load_factor(0.5f)` (shorter chains, more memory).
- Rule: the container keeps `size() <= bucket_count() * max_load_factor()`. The check happens **before** inserting: if adding the element would exceed the limit, the table rehashes first, then inserts.
- An insert whose key already exists does not grow the table (no element is added).
- Growth policy is implementation-defined. libstdc++ / GCC, x86-64 (measured, mlf 1.0):

| Elements after insert | `bucket_count()` |
|---|---|
| 0 (default-constructed) | 1 |
| 1 | 13 |
| 14 | 29 |
| 30 | 59 |
| 60 | 127 |
| 128 | 257 |
| 1110 | 2357 |
- libstdc++ picks a **prime** about twice the old count; libc++ uses primes or powers of two depending on the request. Never rely on "doubling" or on a specific number.
- Erasing never shrinks the bucket array; neither does `clear()` (2357 buckets after clearing 2000 elements in the run above). `rehash(0)` asks for the minimum that fits the current size.

#### 4. reserve(n) vs rehash(n)
| Call | Unit | Effect |
|---|---|---|
| `m.reserve(n)` | elements | Same as `rehash(ceil(n / max_load_factor()))`: room for `n` elements without a further rehash |
| `m.rehash(n)` | buckets | `bucket_count() >= n` **and** `bucket_count() >= size() / max_load_factor()` |
- Neither gives an exact number: libstdc++ rounds up to the next prime in its table. `reserve(1000)` gave 1031 buckets; with `max_load_factor(2.0)`, `reserve(10000)` gave 5087 (not 5000).
- Both can be no-ops if the table is already big enough, and `rehash(n)` with a smaller `n` may shrink it.
- Practical rule: when the final size is known, call `reserve(n)` **once, before** inserting. That removes all rehash spikes from the insert loop and keeps iterators stable during it.
- `reserve` is not a memory pool: each element still allocates its own node (see Memory & Ownership, topic 11, for `std::pmr` to control node allocation).

#### 5. Invalidation rules (unordered containers only)
- The full cross-container table lives in topic 06 (Iterators and Invalidation Rules). Here is the unordered part in depth.

| Operation | Iterators | References and pointers to elements |
|---|---|---|
| Insert, **no** rehash | Valid | Valid |
| Insert that **causes** a rehash | **All invalidated** | Valid |
| `reserve` / `rehash` (that changes buckets) | All invalidated | Valid |
| `erase` | Only to erased elements | Only to erased elements |
| `clear` | All | All |
| `extract` (C++17) | Only the extracted one | Stay valid, but using them while the node handle owns the element is UB; fine again after reinsertion |
| `swap` | Valid, now refer into the other container | Valid |
- Why references survive a rehash: nodes never move. Rehash allocates a new bucket array and **relinks** existing nodes; the key and value stay at the same address.
- Why iterators do not survive: an iterator may hold bucket information (implementation-specific), and the traversal order changes. Even where an old iterator still "works" on libstdc++, using it is UB by the standard.
- `end()` is also invalidated by a rehash.
- Practical consequences:
  - Store **pointers or references** to values long-term if you must, never iterators.
  - Inserting while iterating is unsafe unless you reserved enough beforehand (and even then the new element may or may not be visited).
  - Erase while iterating: `it = m.erase(it);` (erase returns the next iterator), or C++20 `std::erase_if(m, pred)`.

#### 6. The hash and equality contract
- An unordered container needs two function objects: `Hash` (default `std::hash<K>`) and `KeyEqual` (default `std::equal_to<K>`, i.e. `operator==`).
- **Contract**: `a == b` implies `hash(a) == hash(b)`. The reverse is not required: different keys may collide.
- If violated, two equal keys land in different buckets: `find` misses, duplicates appear in a "unique" container.
- The bug can hide in small tests: since GCC 12, libstdc++ looks up small tables (up to 20 elements for non-"fast" hashes such as `std::string`) by a linear scan with the equality only, so a broken hash shows up only once the table grows.
- The hash of a key must not change while it is stored. Keys are `const` in the node for this reason; changing a key through `mutable` members or `const_cast` silently corrupts the table (lookups miss, the element is "lost").
- To change a key legally: C++17 `extract()` the node, modify `nh.key()`, `insert(std::move(nh))`. No reallocation of the node.
- Equality must be an equivalence relation. Floating-point keys break it:
  - `NaN != NaN`: every inserted NaN is a new element and `find(NaN)` never succeeds.
  - `0.0 == -0.0`: so `std::hash<double>` must return the same hash for both (libstdc++ returns 0 for both).
- `std::map` needs something different: a strict weak ordering (`operator<`), and no hash or `==` (see topic 08).

#### 7. std::hash: what exists and how to add your own
- Provided for: arithmetic types, enums, pointers, `std::string`, `std::string_view`, `std::unique_ptr`, `std::shared_ptr`, `std::optional`, `std::variant`, `std::bitset`, `std::thread::id`, `std::type_index`, `std::error_code` and a few more.
- **Not** provided for `std::pair`, `std::tuple`, `std::array` or containers (the one exception is `std::vector<bool>`). `std::unordered_map<std::pair<int,int>, V>` does not compile without a custom hash.
- If `std::hash<K>` is not specialized, it is **disabled**: the default constructor of the map is deleted and you get "use of deleted function" errors.
- Two ways to supply a hash:
  - A functor passed as a template argument: `std::unordered_map<Point, V, PointHash>`.
  - A specialization `template<> struct std::hash<Point> { ... };` (allowed for program-defined types). Then `std::unordered_map<Point, V>` just works.
- `std::hash` for pointers hashes the **address**, not the pointee. `unordered_map<const char*, int>` compares and hashes addresses: lookups with an equal string at a different address miss.
- libstdc++ / GCC, x86-64: `std::hash<int>` (and other integers) is the **identity** function; `std::hash<std::string>` is a Murmur-style hash of the bytes. Results are not portable and may differ between runs on other implementations.

#### 8. Hash quality and combining
- A good hash for a hash table: cheap, deterministic, and spreads **similar** keys to different buckets (small key changes flip many bits: avalanche).
- The weak combiner seen in tutorials: `hash(x) ^ (hash(y) << 1)`.
  - With identity `std::hash<int>`: `hash(0,1) == hash(2,0) == 2`, and `(x,y)` and `(y,x)` stay close.
  - Measured (libstdc++ / GCC, x86-64): 10000 grid points `(x,y)` in `[0,100)²`, 10273 buckets, longest chain **50** (a good hash gives a few).
- Better: a boost-style `hash_combine`, mixing each field into a running seed:
  - `seed ^= h + 0x9e3779b97f4a7c15 + (seed << 6) + (seed >> 2);`
  - Or pack two 32-bit fields into one 64-bit value and run a mixer (for example a splitmix64 finalizer).
- Identity hash for integers: perfect when keys are random, terrible when they share a stride. Keys that are all multiples of the bucket count go into one bucket.
- **Hash flooding (DoS)**: if attackers control keys and the hash is predictable, they can force O(n) chains. Use a seeded/keyed hash for untrusted input.
- Equal keys must hash equally, so the hash must use exactly the fields `operator==` uses (no more, no fewer meaningful fields).

#### 9. API choices: lookup and insertion
| You want | Use | Inserts? | Needs default-constructible `V`? |
|---|---|---|---|
| Read if present | `find(k)`, `contains(k)` (C++20), `count(k)` | No | No |
| Read, throw if absent | `at(k)` | No | No |
| Read or create default | `m[k]` | Yes | Yes |
| Insert if absent, never touch args otherwise | `try_emplace(k, args...)` (C++17) | If absent | No |
| Insert or overwrite | `insert_or_assign(k, v)` (C++17) | Yes | No |
| Insert if absent | `insert({k, v})`, `emplace(k, v)` | If absent | No |
- `operator[]` is non-const: it does not exist on a `const` map and inserts a value-initialized `V` for a missing key. `if (m[k] == 0)` silently grows the map.
- `emplace` must build the node (and the key) **before** it can look the key up. If the key exists, the node is destroyed: arguments may already have been moved from. Measured (libstdc++): `emplace(1, std::move(ptr))` on an existing key leaves `ptr` null; `try_emplace(1, std::move(ptr))` leaves it untouched.
- **Heterogeneous lookup** (C++20 for unordered): `find("literal")` on `unordered_map<std::string, V>` normally constructs a temporary `std::string`. If both `Hash` and `KeyEqual` declare `is_transparent`, `find`/`count`/`contains`/`equal_range` accept a `std::string_view` or `const char*` directly. (GCC 11 already supports it.)
- **Node handles** (C++17): `extract(k)` unlinks a node without freeing it; `insert(std::move(nh))` relinks it (possibly in another map with the same types); `merge(other)` moves all nodes whose keys are absent. No element copies, no allocations.
- Bucket interface (debugging tool): `bucket(k)`, `bucket_size(b)`, `begin(b)/end(b)` (local iterators). Useful for measuring chain lengths of a hash function.

#### 10. Performance: why std::unordered_map is often slow, and what replaces it
- Costs the big-O hides:
  - One heap allocation per element (insert) and one free (erase).
  - Pointer chasing: bucket array, then node, then maybe the next node. Cache-hostile on large tables.
  - Hash computation on every lookup (strings: proportional to length).
  - Rehash spikes: a single insert that triggers a rehash touches every node: a tail-latency event on a hot path.
- Mitigations inside the standard container: `reserve` upfront, a cheap but good hash, `std::pmr` or a custom allocator for nodes, transparent lookup to avoid temporaries.
- **Flat (open-addressing) hash maps** (for example `boost::unordered_flat_map`, "Swiss table" designs): elements stored in one array, probing instead of chains, metadata bytes for SIMD matching. Typically 2x to several x faster for lookups, but they give up reference stability (elements move on rehash).
- Other options:
  - Sorted `std::vector` + binary search (or C++23 `std::flat_map`, topic 08) for read-mostly data.
  - A direct array indexed by a small dense ID: fastest of all.
  - A perfect hash generated at build time for a static key set.
- `std::map` vs `std::unordered_map`: choose `map` when you need ordering, range queries, `lower_bound`, deterministic iteration, or a guaranteed O(log n) worst case. Choose `unordered_map` for pure point lookups on large sets with a good hash.

#### 11. Misconceptions to unlearn
- ❌ "Lookup is O(1)." ✅ Average O(1); worst O(n). Insertion is also amortized because of rehash.
- ❌ "Rehash invalidates everything." ✅ Iterators yes; references and pointers to elements stay valid (nodes do not move).
- ❌ "Insert invalidates iterators." ✅ Only if it triggers a rehash.
- ❌ "`reserve(n)` reserves n buckets." ✅ It reserves room for n **elements**; `rehash(n)` is the bucket request.
- ❌ "The table rehashes after load_factor exceeds max_load_factor." ✅ It rehashes before the insert that would exceed it; the limit is never exceeded.
- ❌ "Bucket counts are powers of two / are doubled." ✅ Implementation-defined; libstdc++ uses primes.
- ❌ "`erase` or `clear` frees the bucket array." ✅ The bucket count never shrinks on its own; use `rehash(0)` or swap with a fresh map.
- ❌ "Small int keys come out sorted." ✅ Order is unspecified and changes after rehash.
- ❌ "`hash(x) ^ hash(y)` is a fine way to hash a pair." ✅ Symmetric and collision-prone; use a real combiner.
- ❌ "`std::hash<std::pair>` exists." ✅ It does not; write one.
- ❌ "`unordered_map` is always faster than `map`." ✅ For small sizes, string keys with expensive hashes, or ordered access, `map` or a sorted vector can win.

### EDGE_CASES: Traps and Misconceptions

#### Edge Case 1: operator[] inserts, and needs a default constructor
- `if (m["missing"] == 0)` inserts `"missing"` with a value-initialized mapped value: the size grows on a read.
- `operator[]` is not available on a `const` map: `const auto& cm = m; cm["k"];` does not compile. Use `find` or `at`.
- If the mapped type has no default constructor, `m[k]` does not compile at all, even for keys that exist: the compiler must instantiate the "insert default" path. Use `try_emplace`, `insert_or_assign`, or `find`.

#### Edge Case 2: A rehash keeps references but kills iterators
- `auto& r = m[1]; auto it = m.find(1); m.reserve(1000);`
  - `r` and `&r`: still valid; the node did not move.
  - `it` and `end()`: invalid; using `it` is UB even if libstdc++ happens to print the right value.
- Typical bug: caching `find()` results in a member variable and inserting later.
- Fix: cache a pointer to the value (`&it->second`), or `reserve` the final size before taking iterators.

#### Edge Case 3: Inserting while iterating
- A range-for over a map that inserts into the same map can trigger a rehash in the middle of the loop: the loop's hidden iterator is invalidated (UB).
- Even without a rehash, whether newly inserted elements are visited is unspecified (they may go into a bucket already passed).
- Fix: collect new entries in a separate vector and insert after the loop.

#### Edge Case 4: Floating-point keys: NaN and negative zero
- `std::unordered_set<double> s; s.insert(NAN); s.insert(NAN);` gives size 2, and `s.count(NAN)` is 0: equality says NaN equals nothing, not even itself.
- `0.0` and `-0.0` compare equal, so they are one key; `std::hash<double>` must (and does) hash both to the same value.
- Prices as `double` keys also suffer from rounding (`0.1 + 0.2 != 0.3`). Use integer ticks or fixed-point keys.

#### Edge Case 5: Pointer keys hash the address
- `std::unordered_map<const char*, int>` uses `std::hash<const char*>`, which hashes the pointer value, and `==` compares addresses.
- `m["abc"]` and then a lookup with a `char buf[] = "abc"` misses: same characters, different address.
- String literals with the same content may or may not share an address (unspecified), so even literal-to-literal lookups are not reliable.
- Fix: use `std::string` keys, or `std::string_view` keys **only** if the viewed strings outlive the map (see topic 02 on dangling views).

#### Edge Case 6: Keys that collide by construction
- libstdc++ `std::hash<int>` is the identity. With bucket count `B`, keys `0, B, 2B, ...` all land in bucket 0.
- Real-world cases: IDs that are multiples of 1000, aligned addresses (pointer hashes: low bits are always zero), timestamps rounded to a tick.
- The prime bucket counts of libstdc++ make simple strides less likely to hit one bucket, but it remains possible; power-of-two tables (common in custom and flat maps) are far more sensitive.
- Fix: a mixing hash (multiply by a large odd constant and shift, or splitmix64).

#### Edge Case 7: emplace can consume arguments even when it does not insert
- `m.emplace(k, std::move(p))` with an existing key: libstdc++ allocates a node, constructs the pair (moving from `p`), finds the duplicate, destroys the node. `p` is now null and the object it owned is gone.
- The standard allows this: `emplace` gives no guarantee that arguments are untouched on failure.
- `try_emplace(k, std::move(p))` (C++17) looks up first and moves only if it inserts. It also avoids the wasted allocation.
- Same issue with `insert({k, std::move(p)})`: the pair argument is built before the call.

#### Edge Case 8: The bucket array never shrinks by itself
- Load a map with a million entries, `clear()` it: `bucket_count()` stays at about a million, and iteration in some implementations, plus `clear()` itself, stays proportional to the bucket count.
- Memory of the bucket array (8 bytes per bucket on x86-64) is held until destruction.
- Fix: `m.rehash(0)` after clear, or `std::unordered_map<K,V>().swap(m);`.

#### Edge Case 9: Same content, different iteration order
- Two maps with the same elements can iterate in different orders (different insertion history, different bucket counts).
- `operator==` still says they are equal: it compares the containers as unordered collections.
- Never write tests or produce output (logs, serialized files, checksums) that depend on unordered iteration order. Sort the keys first if order matters.

### CODE_EXAMPLES: Practical Demonstrations

#### Example 1: Looking inside the table: buckets, load factor, growth
- Prints the growth points and where a few keys land.
- All numbers are libstdc++ / GCC, x86-64 and are not guaranteed by the standard.
```cpp
#include <iostream>
#include <unordered_map>

int main() {
    std::unordered_map<int, int> m;
    std::cout << "empty: buckets=" << m.bucket_count()
              << " mlf=" << m.max_load_factor() << '\n';
    std::size_t last = m.bucket_count();
    for (int i = 0; i < 300; ++i) {
        m[i] = i;
        if (m.bucket_count() != last) {
            last = m.bucket_count();
            std::cout << "size=" << m.size() << " -> buckets=" << last << '\n';
        }
    }
    std::cout << "load_factor=" << m.load_factor() << '\n';
    for (int k : {0, 1, 541, 542})
        std::cout << "key " << k << " in bucket " << m.bucket(k) << '\n';
}
```
- Output (libstdc++ / GCC, x86-64):
```
empty: buckets=1 mlf=1
size=1 -> buckets=13
size=14 -> buckets=29
size=30 -> buckets=59
size=60 -> buckets=127
size=128 -> buckets=257
size=258 -> buckets=541
load_factor=0.554529
key 0 in bucket 0
key 1 in bucket 1
key 541 in bucket 0
key 542 in bucket 1
```
- The rehash happens on the insert that would make `size() > bucket_count()`: the 14th element, not after it.
- `std::hash<int>` is the identity here, so `bucket(k) == k % 541`: keys 0 and 541 share a bucket.

#### Example 2: reserve vs rehash, and what survives a rehash
- References and pointers survive; iterators must be re-obtained.
```cpp
#include <iostream>
#include <string>
#include <unordered_map>

int main() {
    std::unordered_map<int, std::string> m{{1, "one"}, {2, "two"}};
    std::string& ref = m[1];
    const std::string* ptr = &m[2];
    std::cout << "buckets before: " << m.bucket_count() << '\n';

    m.reserve(1000);                   // room for 1000 elements: rehash
    std::cout << "after reserve(1000): " << m.bucket_count() << '\n';
    std::cout << ref << ' ' << *ptr << '\n';   // still valid: nodes did not move

    auto it = m.find(1);               // re-obtain iterators after a rehash
    std::cout << it->second << '\n';

    std::unordered_map<int, int> a;
    a.rehash(1000);                    // at least 1000 buckets
    std::unordered_map<int, int> b;
    b.max_load_factor(2.0f);
    b.reserve(1000);                   // 1000 elements at mlf 2: about 500 buckets
    std::cout << "rehash(1000): " << a.bucket_count()
              << ", reserve(1000) at mlf 2: " << b.bucket_count() << '\n';
}
```
- Output (bucket counts are libstdc++ / GCC, x86-64):
```
buckets before: 13
after reserve(1000): 1031
one two
one
rehash(1000): 1031, reserve(1000) at mlf 2: 503
```
- `reserve` counts elements and divides by `max_load_factor`; `rehash` counts buckets. Both round up to the implementation's next size.

#### Example 3: A custom key with std::hash specialization and hash_combine
- `Point` gets `operator==` and a `std::hash` specialization, so the map needs no extra template arguments.
- `PairHash` shows the functor form for `std::pair`, which has no standard hash.
```cpp
#include <cstddef>
#include <functional>
#include <iostream>
#include <string>
#include <unordered_map>
#include <utility>

inline void hash_combine(std::size_t& seed, std::size_t h) {
    seed ^= h + 0x9e3779b97f4a7c15ULL + (seed << 6) + (seed >> 2);
}

struct Point {
    int x, y;
    bool operator==(const Point&) const = default;   // C++20
};

template <>
struct std::hash<Point> {
    std::size_t operator()(const Point& p) const noexcept {
        std::size_t seed = 0;
        hash_combine(seed, std::hash<int>{}(p.x));   // same fields as operator==
        hash_combine(seed, std::hash<int>{}(p.y));
        return seed;
    }
};

struct PairHash {
    template <class A, class B>
    std::size_t operator()(const std::pair<A, B>& p) const noexcept {
        std::size_t seed = 0;
        hash_combine(seed, std::hash<A>{}(p.first));
        hash_combine(seed, std::hash<B>{}(p.second));
        return seed;
    }
};

int main() {
    std::unordered_map<Point, std::string> names;
    names[{0, 0}] = "origin";
    names[{2, 3}] = "target";
    std::cout << names.at({2, 3}) << '\n';

    std::unordered_map<std::pair<int, int>, double, PairHash> cost;
    cost[{1, 2}] = 0.5;
    std::cout << cost.count({1, 2}) << ' ' << cost.count({2, 1}) << '\n';
}
```
- Output:
```
target
1 0
```
- Without the specialization, `std::unordered_map<Point, std::string> names;` fails with "use of deleted function" (the disabled `std::hash<Point>` makes the map's default constructor deleted).

#### Example 4: Measuring a weak hash vs a mixed hash
- Same 10000 grid points, two hash functions, longest chain compared with the bucket interface.
```cpp
#include <algorithm>
#include <cstddef>
#include <cstdint>
#include <functional>
#include <iostream>
#include <unordered_set>

struct P {
    int x, y;
    bool operator==(const P&) const = default;
};
struct WeakHash {
    std::size_t operator()(const P& p) const {
        return std::hash<int>{}(p.x) ^ (std::hash<int>{}(p.y) << 1);
    }
};
struct MixHash {
    std::size_t operator()(const P& p) const {
        std::uint64_t z = (std::uint64_t(std::uint32_t(p.x)) << 32) | std::uint32_t(p.y);
        z = (z ^ (z >> 30)) * 0xbf58476d1ce4e5b9ULL;   // splitmix64 finalizer
        z = (z ^ (z >> 27)) * 0x94d049bb133111ebULL;
        return z ^ (z >> 31);
    }
};

template <class H>
void report(const char* name) {
    std::unordered_set<P, H> s;
    for (int x = 0; x < 100; ++x)
        for (int y = 0; y < 100; ++y) s.insert({x, y});
    std::size_t longest = 0;
    for (std::size_t b = 0; b < s.bucket_count(); ++b)
        longest = std::max(longest, s.bucket_size(b));
    std::cout << name << ": buckets=" << s.bucket_count()
              << " longest chain=" << longest << '\n';
}

int main() {
    report<WeakHash>("weak");
    report<MixHash>("mixed");
    std::cout << "weak(0,1)=" << WeakHash{}({0, 1})
              << " weak(2,0)=" << WeakHash{}({2, 0}) << '\n';
}
```
- Output (libstdc++ / GCC, x86-64):
```
weak: buckets=10273 longest chain=50
mixed: buckets=10273 longest chain=7
weak(0,1)=2 weak(2,0)=2
```
- The weak hash only produces values below 256 for this grid, so 10000 keys crowd into at most 256 buckets.
- The number of buckets is identical; only the spread differs. That is the whole job of a hash.

#### Example 5: Heterogeneous lookup (C++20): no temporary std::string
- A transparent hash plus `std::equal_to<>` lets `find` take a `std::string_view` or a literal.
```cpp
#include <functional>
#include <iostream>
#include <string>
#include <string_view>
#include <unordered_map>

struct StringHash {
    using is_transparent = void;                 // opt in to heterogeneous lookup
    std::size_t operator()(std::string_view s) const noexcept {
        return std::hash<std::string_view>{}(s);
    }
};

int main() {
    std::unordered_map<std::string, int, StringHash, std::equal_to<>> limits{
        {"order.max_qty", 500}, {"order.max_px", 1000}};

    std::string_view key = "order.max_qty";      // e.g. a slice of a received message
    if (auto it = limits.find(key); it != limits.end())
        std::cout << it->first << " = " << it->second << '\n';

    std::cout << std::boolalpha << limits.contains("order.max_px") << '\n';
}
```
- Output:
```
order.max_qty = 500
true
```
- Both `Hash` and `KeyEqual` must be transparent. `std::hash<std::string>` and `std::hash<std::string_view>` give the same value for the same characters, which keeps the contract.
- Without it, `limits.find(key)` does not compile (no conversion from `string_view` to `string` is implicit), and `find("literal")` allocates a temporary string for long keys.

#### Example 6: Erase while iterating, erase_if, and changing a key with extract
```cpp
#include <iostream>
#include <map>
#include <string>
#include <unordered_map>

int main() {
    std::unordered_map<int, std::string> m{
        {1, "a"}, {2, "b"}, {3, "c"}, {4, "d"}, {5, "e"}, {6, "f"}};

    for (auto it = m.begin(); it != m.end(); ) {
        if (it->first % 2 == 0) it = m.erase(it);   // erase returns the next iterator
        else ++it;
    }
    std::size_t n = std::erase_if(m, [](const auto& kv) { return kv.first == 5; });

    auto nh = m.extract(3);           // unlink the node, no deallocation
    nh.key() = 30;                    // keys are const in the map, not in a node handle
    m.insert(std::move(nh));

    std::map<int, std::string> sorted(m.begin(), m.end());   // sort only for printing
    for (const auto& [k, v] : sorted) std::cout << k << '=' << v << ' ';
    std::cout << "(erase_if removed " << n << ")\n";
}
```
- Output:
```
1=a 30=c (erase_if removed 1)
```
- Copying into a `std::map` for printing makes the output deterministic; printing `m` directly would show an unspecified order.
- The common bug `for (...; ++it) if (cond) m.erase(it);` increments an iterator to a freed node: UB (ASan reports heap-use-after-free).

#### Example 7: try_emplace, insert_or_assign and emplace with move-only values
```cpp
#include <iostream>
#include <memory>
#include <unordered_map>

int main() {
    std::unordered_map<int, std::unique_ptr<int>> cache;
    cache.try_emplace(1, std::make_unique<int>(10));

    auto a = std::make_unique<int>(20);
    cache.emplace(1, std::move(a));             // key exists: node built, then destroyed
    std::cout << "after emplace, a is " << (a ? "intact" : "null") << '\n';

    auto b = std::make_unique<int>(30);
    cache.try_emplace(1, std::move(b));         // key exists: b not touched
    std::cout << "after try_emplace, b is " << (b ? "intact" : "null") << '\n';

    cache.insert_or_assign(1, std::move(b));    // overwrites
    std::cout << "value now " << *cache.at(1) << '\n';
}
```
- Output (the `emplace` line is libstdc++ / GCC behaviour; the standard does not promise either result):
```
after emplace, a is null
after try_emplace, b is intact
value now 30
```
- Rule: for "insert if absent", prefer `try_emplace`; for "set", prefer `insert_or_assign`; use `operator[]` only when a default value is meaningful.

### QUICK_REFERENCE: Cheat Sheet

#### Core facts
| Item | Value |
|---|---|
| Structure | Bucket array + one heap node per element (chaining) |
| Default `max_load_factor` | 1.0 |
| Rehash trigger | Before an insert that would make `size() > bucket_count() * mlf` |
| Bucket growth | Implementation-defined (libstdc++: next prime, about 2x) |
| Shrinks on erase/clear? | No; `rehash(0)` or swap with an empty map |
| Iteration order | Unspecified; changes on rehash |
| Key requirements | `Hash` + `KeyEqual`; `a == b` implies `hash(a) == hash(b)` |
| `std::hash<pair/tuple>` | Not provided |

#### Invalidation (unordered only; full table in topic 06)
| Operation | Iterators | References / pointers |
|---|---|---|
| Insert without rehash | Valid | Valid |
| Insert with rehash, `reserve`, `rehash` | Invalid | Valid |
| `erase(x)` | Only `x` | Only `x` |
| `clear()` | All | All |

#### Lookup and insert cheat sheet
| Code | Inserts on miss | Notes |
|---|---|---|
| `m[k]` | Yes (default `V`) | Non-const; needs default ctor |
| `m.at(k)` | No | Throws `std::out_of_range` |
| `m.find(k)`, `m.contains(k)` | No | `contains` is C++20 |
| `m.try_emplace(k, a...)` | Yes | Args untouched if key exists (C++17) |
| `m.insert_or_assign(k, v)` | Yes | Overwrites (C++17) |
| `m.emplace(k, v)` | Yes | May build and discard a node |
| `m.extract(k)` / `m.merge(o)` | | Move nodes, no allocation (C++17) |

#### Implementation facts (libstdc++ / GCC, x86-64; not standard)
| Fact | Detail |
|---|---|
| `sizeof(std::unordered_map<int,int>)` | 56 bytes |
| Empty map `bucket_count()` | 1 |
| Growth sequence | 13, 29, 59, 127, 257, 541, 1109, 2357, ... |
| `std::hash<int>` | Identity |
| `std::hash<double>(0.0)` and `(-0.0)` | Both 0 |
| Hash code cached in node | For non-fast hashes (e.g. `std::string`), not for integers |

#### Interview one-liners
| Question | Answer |
|---|---|
| How is `unordered_map` built? | Buckets of chained nodes; one allocation per element |
| Lookup complexity? | Average O(1), worst O(n) |
| When does it rehash? | Before the insert that would exceed `max_load_factor` |
| `reserve` vs `rehash`? | Elements vs buckets |
| What does rehash invalidate? | Iterators only; references and pointers survive |
| What does erase invalidate? | Only the erased element |
| Custom key needs? | Hash + equality, consistent with each other |
| Why is `h1 ^ (h2 << 1)` bad? | Nearly symmetric, small range, many collisions |
| Avoid a temporary string in `find`? | Transparent hash + `equal_to<>` (C++20) |
| Change a key? | `extract`, modify `key()`, `insert` |
| Faster alternative? | Flat open-addressing map, sorted vector, or direct array |
| `map` instead? | Need ordering, ranges, or a hard O(log n) bound |
