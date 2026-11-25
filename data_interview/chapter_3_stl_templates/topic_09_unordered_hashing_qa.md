## TOPIC: Unordered Containers and Hashing

### INTERVIEW_QA: Interview Questions with Detailed Answers

#### Q1: How is std::unordered_map implemented internally?
**Difficulty:** #beginner
**Category:** #stl #hashing
**Concepts:** #buckets #separate_chaining #nodes

**Answer:**
As a hash table with separate chaining: an array of buckets, where each bucket leads to a chain of individually heap-allocated nodes holding the key/value pair. The bucket index is computed from `hash(key)` reduced modulo the bucket count.

**Explanation:**
- Lookup: hash the key, go to its bucket, compare keys in that chain with `key_equal` until one matches.
- One node allocation per element; the bucket array is a separate allocation that is replaced on rehash.
- The node design is forced by the standard: references to elements must stay valid across a rehash, so elements cannot live inside a probing array.
- libstdc++ detail: all nodes are on one singly linked list, each bucket points to the node before its first element, and the hash code is cached in the node for non-trivial hashes such as `std::string`.
- ❌ Common wrong answer: "It's a balanced tree like `std::map`, just unsorted." Trees give O(log n) and ordered iteration; this is a hash table.
- ✅ What a strong answer adds: why this layout is slow in practice (allocation per insert, pointer chasing per lookup) and that open-addressing "flat" maps exist because of it.

**Key takeaway:** Buckets plus heap nodes: stable element addresses, at the price of allocations and cache misses.

---

#### Q2: Is lookup in unordered_map O(1)? What is the worst case and why?
**Difficulty:** #beginner
**Category:** #stl #complexity
**Concepts:** #average_case #worst_case #collisions

**Answer:**
Average O(1), worst case O(n). The worst case happens when many keys land in the same bucket (bad hash, adversarial keys, or keys that collide by construction), so lookup degenerates into a linear scan of one chain.

**Explanation:**
- Insertion is average O(1) **and** amortized: an occasional insert triggers an O(n) rehash.
- "Average" assumes a hash that spreads the actual keys; it is not a property of the container alone.
- Hash flooding: if an attacker controls keys and knows the hash, they can push every key into one bucket and make each operation O(n).
- ❌ Common wrong answer: "O(1) always, that's why it's faster than map." Big-O hides the hash computation, cache misses and rehash spikes.
- ✅ What a strong answer adds: distinguishing "average" (distribution of keys) from "amortized" (rare expensive operations), and mentioning tail latency on a hot path.

**Key takeaway:** O(1) on average with a good hash; O(n) worst case; inserts are amortized because of rehash.

---

#### Q3: What is the load factor, and exactly when does the table rehash?
**Difficulty:** #intermediate
**Category:** #stl #hashing
**Concepts:** #load_factor #max_load_factor #rehash

**Answer:**
`load_factor() = size() / bucket_count()`, the average chain length. The container keeps it at or below `max_load_factor()` (default 1.0): an insert that **would** push the size above `bucket_count() * max_load_factor()` first grows the bucket array, then inserts the element.

**Explanation:**
- On libstdc++ the 14th element in a 13-bucket table triggers the rehash to 29 buckets.
- The new bucket count is implementation-defined: libstdc++ uses a prime about twice as large (13, 29, 59, 127, ...). The standard does not say "double".
- Inserting a key that already exists adds nothing and never rehashes.
- A lower `max_load_factor` means shorter chains and more memory.
- ❌ Common wrong answer: "When the load factor exceeds the maximum, it rehashes." The check is done before the insert, so the limit is never exceeded.
- ✅ What a strong answer adds: the bucket array never shrinks on erase or clear.

**Key takeaway:** Rehash happens before the insert that would break `size <= buckets * mlf`; growth sizes are implementation-defined.

---

#### Q4: What is the difference between reserve(n) and rehash(n)?
**Difficulty:** #intermediate
**Category:** #stl #hashing
**Concepts:** #reserve #rehash #bucket_count

**Answer:**
`reserve(n)` is in **elements**: it makes room for `n` elements without further rehashing, equivalent to `rehash(ceil(n / max_load_factor()))`. `rehash(n)` is in **buckets**: it requests at least `n` buckets (and enough for the current size).

**Explanation:**
- Neither is exact: libstdc++ rounds up to a prime (`reserve(1000)` gave 1031 buckets).
- With `max_load_factor(2.0)`, `reserve(1000)` needs only about 500 buckets (503 on libstdc++), while `rehash(1000)` still gives about 1000.
- Both may be no-ops if the table is already large enough; `rehash(0)` shrinks to the minimum for the current size.
- Neither preallocates nodes: every insert still allocates.
- ❌ Common wrong answer: "Both reserve n buckets" or "`reserve` allocates memory for n elements like `vector::reserve`." Only the bucket array is sized.
- ✅ What a strong answer adds: "call `reserve(final_size)` once before a bulk insert: no rehash spikes, iterators stay valid during the loop."

**Key takeaway:** `reserve` counts elements, `rehash` counts buckets, and both only size the bucket array.

---

#### Q5: After a rehash, which of these are still valid: iterators, references, pointers to elements?
**Difficulty:** #intermediate
**Category:** #stl #invalidation
**Concepts:** #rehash #iterator_invalidation #reference_stability

**Answer:**
References and pointers to elements remain valid; all iterators (including `end()`) are invalidated. Nodes are relinked into the new bucket array, not moved.

**Explanation:**
- `auto& r = m[1]; auto it = m.find(1); m.reserve(1000);` leaves `r` valid and `it` invalid.
- Using `it` after the rehash is UB even if it appears to work on one implementation.
- Erase invalidates only iterators and references to the erased element; an insert that does not rehash invalidates nothing.
- ❌ Common wrong answer: "A rehash moves everything, so all references die like in `vector`." That is `vector` reallocation; unordered nodes never move.
- ❌ Common wrong answer: "Iterators survive because the nodes did not move." The standard explicitly invalidates them; traversal order and bucket data change.
- ✅ What a strong answer adds: cache pointers to values, not iterators; and inserting during iteration can rehash mid-loop. Full cross-container table: topic 06.

**Key takeaway:** Rehash: iterators die, references live. Erase: only the erased element dies.

---

#### Q6: Why does `std::unordered_map<Point, std::string> m;` fail to compile, and how do you fix it?
**Difficulty:** #beginner
**Category:** #stl #hashing
**Concepts:** #std_hash #custom_key #deleted_constructor

**Answer:**
There is no `std::hash<Point>`, so the primary template is "disabled": it cannot be default-constructed, which makes the map's default constructor deleted ("use of deleted function"). Provide a hash (a `std::hash<Point>` specialization or a functor template argument) and an equality (`operator==` or a `KeyEqual`).

**Explanation:**
```cpp
#include <cstddef>
#include <functional>
#include <iostream>
#include <string>
#include <unordered_map>

struct Point {
    int x, y;
    bool operator==(const Point&) const = default;   // C++20
};

struct PointHash {
    std::size_t operator()(const Point& p) const noexcept {
        std::size_t h = std::hash<int>{}(p.x);
        return h ^ (std::hash<int>{}(p.y) + 0x9e3779b97f4a7c15ULL + (h << 6) + (h >> 2));
    }
};

int main() {
    std::unordered_map<Point, std::string, PointHash> m;
    m[{1, 2}] = "a";
    std::cout << m.size() << ' ' << m.at({1, 2}) << '\n';   // 1 a
}
```
- The equality must agree with the hash: hash exactly the fields `operator==` compares.
- `std::map<Point, V>` would instead need `operator<` (strict weak ordering) and no hash.
- `std::pair` and `std::tuple` have no `std::hash` either; the same fix applies.
- ❌ Common wrong answer: "It needs `operator<`." That is `std::map`.
- ✅ What a strong answer adds: quoting the real error (deleted default constructor of the map, caused by the disabled `std::hash<Point>`), and that specializing `std::hash` for your own type is allowed.

**Key takeaway:** Unordered keys need hash + equality; no `std::hash<K>` means the map cannot even be constructed.

---

#### Q7: What contract must the hash function and the equality predicate satisfy, and what happens if it is broken?
**Difficulty:** #intermediate
**Category:** #hashing
**Concepts:** #hash_contract #equivalence #consistency

**Answer:**
If `a == b` then `hash(a) == hash(b)`; the converse is not required (collisions are allowed). The hash of a stored key must also not change. If either is violated, equal keys land in different buckets: lookups miss and duplicates appear.

**Explanation:**
- Typical violation: equality is case-insensitive but the hash uses raw bytes. `"ABC"` and `"abc"` are "equal" but hashed apart.
- Another: hashing a field that `operator==` ignores (e.g. a timestamp or cache field).
- Floating point: `0.0 == -0.0` so they must hash equally (`std::hash<double>` handles it); `NaN != NaN` means each NaN is a distinct key that `find` can never locate.
- Mutating a key after insertion (via `mutable` members or `const_cast`) changes its hash: the element is stranded in the wrong bucket. Use `extract`/modify/`insert` instead.
- ❌ Common wrong answer: "Different keys must have different hashes." That is impossible in general and not required.
- ✅ What a strong answer adds: equality must be an equivalence relation (reflexive, symmetric, transitive), and NaN breaks reflexivity.

**Key takeaway:** Equal implies same hash; same hash does not imply equal; and a stored key must not change.

---

#### Q8: What is wrong with `hash(p.x) ^ (hash(p.y) << 1)` as a hash for a 2-D point? How would you combine hashes?
**Difficulty:** #intermediate
**Category:** #hashing #performance
**Concepts:** #hash_combine #collisions #avalanche

**Answer:**
With libstdc++'s identity `std::hash<int>`, it maps structured inputs into a tiny range with many collisions: `(0,1)` and `(2,0)` both hash to 2. On a 100x100 grid (10000 points, 10273 buckets) the longest chain was 50 instead of single digits. Use a proper combiner (boost-style `hash_combine`) or pack the fields and apply a mixing function.

**Explanation:**
- XOR is commutative and loses information: plain `h(x) ^ h(y)` makes `(x,y)` and `(y,x)` collide and maps every `(x,x)` to 0. The `<< 1` only partly helps.
- With small coordinates, all values stay below 256, so 10000 keys fit in at most 256 buckets whatever the bucket count.
- Good options:
  - `seed ^= h + 0x9e3779b97f4a7c15 + (seed << 6) + (seed >> 2);` per field.
  - Pack `x` and `y` into one 64-bit integer and apply a splitmix64 / Murmur finalizer.
- ❌ Common wrong answer: "XOR is fine because it's uniform for random bits." Inputs are rarely random; grids, IDs and prices are highly structured.
- ✅ What a strong answer adds: measure with the bucket interface (`bucket_count`, `bucket_size`) instead of guessing.

**Key takeaway:** A hash must spread structured keys; XOR of identity hashes does not. Combine with mixing.

---

#### Q9: libstdc++'s std::hash<int> is the identity function. When does that hurt?
**Difficulty:** #advanced
**Category:** #hashing #performance
**Concepts:** #identity_hash #bucket_index #hash_flooding

**Answer:**
When keys share a stride related to the bucket count: the bucket is `key % bucket_count`, so keys that are all multiples of the bucket count (or of a common factor of it) pile into a few buckets. It also offers no protection against adversarial keys.

**Explanation:**
- Identity is fast and perfect for random or sequential keys (sequential keys spread perfectly).
- Prime bucket counts (libstdc++) make the problem rarer; power-of-two tables (common in custom and flat maps) are badly hit by keys with zero low bits, e.g. aligned pointers or IDs that are multiples of 1024.
- Fix: a mixing hash (multiply-shift, splitmix64) as the `Hash` template argument.
- Untrusted input (network IDs): prefer a seeded hash so collisions cannot be precomputed.
- ❌ Common wrong answer: "std::hash is cryptographic / randomized." It is neither, and its values are implementation-specific.
- ✅ What a strong answer adds: hash quality is relative to the table's index reduction (modulo prime vs masking low bits).

**Key takeaway:** Identity hashing is fast but fragile; structured or hostile keys need a mixer.

---

#### Q10: Can `m[k]` or `insert` invalidate the iterator you are looping with? How does `reserve` help?
**Difficulty:** #intermediate
**Category:** #stl #invalidation
**Concepts:** #rehash #operator_subscript #reserve

**Answer:**
Yes, when they add a new element and that pushes `size()` above `max_load_factor() * bucket_count()`: the container rehashes and every iterator is invalidated (references and pointers survive). Calling `reserve(n)` before the loop guarantees no rehash while `size() <= n`, so inserts inside the loop invalidate nothing.

**Explanation:**
```cpp
#include <iostream>
#include <unordered_map>

int main() {
    std::unordered_map<int, int> m;
    for (int i = 0; i < 13; ++i) m[i] = i;
    std::cout << m.bucket_count() << ' ';      // 13: full at load factor 1.0
    m[5] += 1;                                 // existing key: no insert, no rehash
    std::cout << m.bucket_count() << ' ';      // 13
    m[13];                                     // new key: rehash
    std::cout << m.bucket_count() << ' ';      // 29

    std::unordered_map<int, int> r;
    r.reserve(100);
    auto b = r.bucket_count();
    for (int i = 0; i < 100; ++i) r[i] = i;    // stays within the reservation
    std::cout << b << ' ' << r.bucket_count() << '\n';
}
```
- Output on libstdc++ / GCC 11 and 13, x86-64: `13 13 29 103 103` (bucket counts are implementation-specific; the rule is standard).
- Only an actual insertion can rehash. `m[k]` on an existing key, `find`, `at` and `erase` never do. A failed `insert`/`emplace` (key already present) does not rehash either.
- `reserve(n)` counts **elements in total**, not "n more": call it with the final size you expect (`m.reserve(m.size() + extra)`).
- The rehash happens inside the loop at an unpredictable iteration, so a test with a small map that never crosses the threshold passes, and production data breaks it (practice Q7 shows the silent wrong result).
- Even with `reserve`, whether newly inserted elements are visited later in the same loop is unspecified; guard against processing them or collect them separately.
- ❌ Common wrong answer: "Inserting into an unordered_map never invalidates iterators because nodes never move." Nodes do not move, but iterators are invalidated by any rehash.
- ✅ What a strong answer adds: `reserve` also removes the latency spike of a rehash in the middle of a hot loop; size the table at start-up.

**Key takeaway:** An insert that crosses the load-factor limit rehashes and kills iterators; `reserve` to the final size first.

---

#### Q11: Can you store `std::hash` values in a file or send them to another process, for example to pick a shard?
**Difficulty:** #intermediate
**Category:** #hashing #design
**Concepts:** #std_hash #determinism #portability

**Answer:**
No. The standard only requires `std::hash` to return the same value for the same key **within one execution of the program**. Different standard libraries, versions, bitnesses (`size_t` width) and even runs may give different values, so persisted or shared hashes need a hash function you specify yourself.

**Explanation:**
```cpp
#include <functional>
#include <iostream>
#include <string>

int main() {
    std::cout << std::hash<std::string>{}("order-42") << '\n';
    std::cout << std::hash<int>{}(42) << ' ' << std::hash<double>{}(0.0) << '\n';
}
```
- Observed: `317146493569036199` then `42 0`, identical across runs and between GCC 11 and GCC 13 (libstdc++, x86-64). That stability is a libstdc++ property (a fixed-seed byte hash), not a guarantee.
- Other standard libraries use different string hash algorithms, and a 32-bit build returns a 32-bit `size_t`, so a value computed by a service built with one toolchain does not match one built with another.
- Because the requirement is only per execution, an implementation may salt the hash per run to resist hash flooding; some languages do this by default.
- `std::hash<int>` being the identity on libstdc++ is also not portable, and it is a poor shard function (consecutive ids land on consecutive shards).
- Fix: use a named, specified algorithm (FNV-1a, xxHash, MurmurHash3, CRC32C) with a fixed seed and fixed width, and version it if you ever change it.
- ❌ Common wrong answer: "`std::hash` is deterministic, so it is fine for on-disk keys." It is deterministic only within a run as far as the standard is concerned.
- ✅ What a strong answer adds: for hash containers this freedom is harmless because the table is rebuilt in every process; it only bites when hash values leave the process (files, network, consistent hashing).

**Key takeaway:** `std::hash` is for in-memory tables; anything persisted or shared needs an explicitly specified hash.

---

#### Q12: How do you look up a std::string-keyed unordered_map with a std::string_view without creating a temporary string?
**Difficulty:** #advanced
**Category:** #stl #performance
**Concepts:** #heterogeneous_lookup #is_transparent #string_view

**Answer:**
C++20 heterogeneous lookup: give the map a hash that declares `using is_transparent = void;` and accepts `std::string_view`, and use `std::equal_to<>` as the key equality. Then `find`, `count`, `contains` and `equal_range` accept the view directly.

**Explanation:**
- Both the hash and the equality must be transparent; one alone is not enough.
- `std::hash<std::string>` and `std::hash<std::string_view>` agree for the same characters, so the hash/equality contract holds.
- Without it, `find(sv)` does not compile (`string_view` to `string` is explicit), and `find("long literal")` allocates a temporary `std::string` beyond the SSO size.
- `std::map` has had the same feature since C++14 with `std::less<>`.
- Insertion still needs a real `std::string` key (C++26 adds heterogeneous `try_emplace`/`operator[]`).
- ❌ Common wrong answer: "Just make the key type `std::string_view`." Then the map stores views that dangle when the original strings die.
- ✅ What a strong answer adds: in a message parser, the key is a slice of the receive buffer; transparent lookup avoids one allocation per message.

**Key takeaway:** `is_transparent` hash + `std::equal_to<>` = lookup by `string_view`, no temporaries.

---

#### Q13: Can you modify a key stored in an unordered_map?
**Difficulty:** #intermediate
**Category:** #stl #api
**Concepts:** #const_key #extract #node_handle

**Answer:**
Not in place: the key is `const` in `value_type` because changing it would change its hash and bucket. C++17 lets you `extract` the node, modify `node.key()`, and `insert` it back without reallocating the node or copying the value.

**Explanation:**
- Before C++17: erase and re-insert, which frees and reallocates the node and copies/moves the value.
- `merge(other)` moves all nodes whose keys are absent from `*this`; colliding keys stay in `other`.
- Node handles can move elements between maps of the same key/value/allocator types (hash and equality may differ).
- Pointers and references taken before `extract` stay valid and refer to the element again after reinsertion; using them while the node handle owns the element is UB. References obtained from the handle (`nh.key()`) are invalidated by a successful insert.
- ❌ Common wrong answer: "`const_cast` the key and change it." UB, and in practice the element is now in the wrong bucket.
- ✅ What a strong answer adds: the same applies to `std::set` elements and `std::map` keys.

**Key takeaway:** Change a key with extract, modify, insert: no allocation, no copy.

---

#### Q14: Is the iteration order of unordered_map defined? Are two maps with the same elements equal?
**Difficulty:** #beginner
**Category:** #stl #semantics
**Concepts:** #iteration_order #operator_equal #determinism

**Answer:**
Iteration order is unspecified and can change after any rehash. Two maps with the same key/value pairs compare equal with `==` regardless of insertion order or bucket count.

**Explanation:**
- On libstdc++, inserting `0, 10, 20, 30, 40` iterates as `40 30 20 10 0`; after `rehash(1000)` it iterates `0 10 20 30 40`. Neither is guaranteed.
- Different standard libraries (and versions) give different orders: never let output, logs, tests or checksums depend on it.
- `operator==` is O(n) on average (O(n²) worst case) because it checks each element of one map in the other.
- ❌ Common wrong answer: "Small integer keys come out sorted." Sometimes, by accident.
- ✅ What a strong answer adds: if you need deterministic output, copy keys into a vector and sort, or use `std::map`.

**Key takeaway:** No order guarantee; equality is content-based.

---

#### Q15: map vs unordered_map: how do you choose, especially for latency-sensitive code?
**Difficulty:** #intermediate
**Category:** #stl #design
**Concepts:** #map #unordered_map #tail_latency

**Answer:**
Use `std::map` when you need ordering, range queries (`lower_bound`), deterministic iteration or a guaranteed O(log n) worst case. Use `std::unordered_map` for point lookups on larger sets with a good hash. On hot paths, measure: both are node-based, and often a sorted vector or a flat hash map beats both.

**Explanation:**
- `unordered_map` risks: rehash spikes (one insert relinks every node), hash cost for long strings, collision worst cases.
- `map` risks: O(log n) pointer chasing, one allocation per element too.
- For a fixed universe of small integer IDs, a plain array indexed by ID is fastest.
- For read-mostly data, a sorted `std::vector` (or C++23 `std::flat_map`, topic 08) wins on cache locality.
- ❌ Common wrong answer: "unordered_map is O(1) so it's always faster." Small maps (tens of entries) are often faster as a sorted vector or even a linear scan.
- ✅ What a strong answer adds: `reserve` upfront and a pool allocator remove most of the unordered_map tail-latency spikes.

**Key takeaway:** Choose by required operations first (order? ranges?), then by measured latency, not by big-O alone.

---

#### Q16: Why is std::unordered_map slower than open-addressing ("flat") hash maps, and what do flat maps give up?
**Difficulty:** #advanced
**Category:** #performance #hashing
**Concepts:** #open_addressing #cache_locality #reference_stability

**Answer:**
`std::unordered_map` allocates a node per element and follows at least two pointers per lookup (bucket, then node), costing cache misses. Flat maps store elements directly in one array and probe neighbouring slots, often with SIMD-matched metadata, so a lookup touches one or two cache lines. They give up reference and pointer stability: elements move on rehash (and sometimes on erase).

**Explanation:**
- The standard requires references to survive rehash, which forces the node design for `std::unordered_*`.
- Flat maps also usually require a good hash: with power-of-two capacities, poor low bits cause clustering.
- Examples: `boost::unordered_flat_map`, Swiss-table style maps in common open-source libraries.
- Typical measured gain: 2x to several x faster lookups and fewer allocations; benchmark on your data.
- ❌ Common wrong answer: "Flat maps are faster because they have a better hash function." The big win is memory layout.
- ✅ What a strong answer adds: if you need stable addresses with a flat map, store indices into a separate vector or `unique_ptr` values.

**Key takeaway:** std's design buys reference stability with allocations and pointer chasing; flat maps make the opposite trade.

---

#### Q17: How do you erase elements while iterating over an unordered_map?
**Difficulty:** #beginner
**Category:** #stl #invalidation
**Concepts:** #erase #iterator #erase_if

**Answer:**
Use the iterator returned by `erase`: `for (auto it = m.begin(); it != m.end(); ) { if (cond) it = m.erase(it); else ++it; }`, or C++20 `std::erase_if(m, pred)`. Erase invalidates only the erased element, so the returned iterator is safe to continue from.

**Explanation:**
- The bug: `for (auto it = m.begin(); it != m.end(); ++it) if (cond) m.erase(it);` increments an iterator to a freed node: UB (ASan: heap-use-after-free).
- Erasing does not reorder or rehash, so other elements are still visited exactly once.
- `std::erase_if` returns the number of erased elements.
- ❌ Common wrong answer: "Erase invalidates all iterators, so collect keys and erase later." That works but is unnecessary for unordered containers.
- ✅ What a strong answer adds: insertion inside the loop is different: it can rehash and invalidate all iterators.

**Key takeaway:** `it = m.erase(it)` or `std::erase_if`; never `++` an erased iterator.

---

#### Q18: What is the difference between unordered_map and unordered_multimap, and how do you find all values for a key?
**Difficulty:** #beginner
**Category:** #stl #api
**Concepts:** #multimap #equal_range #duplicates

**Answer:**
`unordered_multimap` allows several elements with equivalent keys and has no `operator[]` or `at`. Use `equal_range(k)` to get the range of all elements with that key; equal keys are guaranteed to be adjacent in iteration order.

**Explanation:**
```cpp
#include <iostream>
#include <string>
#include <unordered_map>

int main() {
    std::unordered_multimap<std::string, int> fills{
        {"order1", 100}, {"order1", 50}, {"order2", 10}};
    auto [first, last] = fills.equal_range("order1");
    int total = 0;
    for (auto it = first; it != last; ++it) total += it->second;
    std::cout << fills.count("order1") << ' ' << total << '\n';   // 2 150
}
```
- `insert` always succeeds (returns just an iterator, not a pair).
- Many duplicates of one key form a long chain in one bucket: lookups for that key cost O(count).
- ❌ Common wrong answer: "Use `find` and iterate until the end." The elements after the group belong to other keys.
- ✅ What a strong answer adds: often `unordered_map<K, std::vector<V>>` is simpler and faster (one node per key, contiguous values).

**Key takeaway:** Multimap allows duplicates; iterate a key's group with `equal_range`.
