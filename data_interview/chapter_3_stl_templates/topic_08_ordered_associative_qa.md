## TOPIC: std::map and std::set

### INTERVIEW_QA: Interview Questions with Detailed Answers

#### Q1: How is `std::map` typically implemented, and what complexity does the standard guarantee?
**Difficulty:** #beginner
**Category:** #stl #map
**Concepts:** #red_black_tree #complexity #node_based

**Answer:**
As a red-black tree: a self-balancing binary search tree with one heap node per element. The standard does not name the structure; it requires O(log n) find, insert and erase, sorted iteration, and that insert/erase do not invalidate iterators to other elements, which in practice forces a balanced node-based tree.

**Explanation:**
- Red-black trees keep the height at most about 2·log2(n+1); insert needs at most 2 rotations and erase at most 3.
- libstdc++, x86-64: each node has a colour and parent/left/right pointers (32 bytes) before the value; `sizeof(std::map)` is 48 bytes.
- A lookup is a tree walk: each level is a comparison plus a pointer dereference to a node that may be anywhere in memory.
- ❌ Common wrong answer: "It's a sorted array with binary search." That would make insert O(n) and invalidate iterators; that structure is `std::flat_map` (C++23).
- ✅ What a strong answer adds: red-black versus AVL: AVL is more strictly balanced (faster lookups, more rotations on update); red-black has cheaper updates, which suits a general-purpose container.

**Key takeaway:** map = balanced tree of separately allocated nodes; O(log n) with a pointer dereference per level.

---

#### Q2: What happens when you read `m[key]` and the key is not in the map?
**Difficulty:** #beginner
**Category:** #stl #map
**Concepts:** #operator_subscript #default_construction #accidental_insert

**Answer:**
`operator[]` inserts a new element `{key, V{}}` and returns a reference to the value. So a "read" changes the map: `size()` grows and iteration now shows the new entry.

**Explanation:**
- `operator[]` requires a non-const map and a default-constructible `V`; it does not exist on `const std::map`.
- `if (m[k] == x)` and `std::cout << m[k]` are the classic accidental inserts; with keys coming from external input this is also unbounded memory growth.
- Read alternatives: `find` (check and use in one walk), `contains` (C++20), `at` (throws `std::out_of_range`).
- ❌ Common wrong answer: "It returns a default value without inserting." That is what many other languages' `get(key, default)` does, not C++.
- ✅ What a strong answer adds: `m[k]` is the right tool for "insert or update" counters: `++counts[word];` relies on the default `0`.

**Key takeaway:** `m[k]` means "find or insert"; use `find`/`contains`/`at` for reading.

---

#### Q3: When do you use `find`, `contains`, `count` and `at`?
**Difficulty:** #beginner
**Category:** #stl #map
**Concepts:** #lookup #contains #out_of_range

**Answer:**
`find` when you need the element if it exists (one walk, returns an iterator). `contains` (C++20) for a pure yes/no check. `count` is the pre-C++20 yes/no idiom (and the number of matches in a multimap). `at` when a missing key is an error that should throw.

**Explanation:**
- `if (m.contains(k)) use(m.at(k));` walks the tree twice; `if (auto it = m.find(k); it != m.end()) use(it->second);` walks once.
- `at` throws `std::out_of_range`; use it where absence means a bug or corrupt input, not for normal control flow.
- None of them inserts, and all work on a `const` map.
- ❌ Common wrong answer: "count is O(n)." For unique-key containers it is O(log n); for multimaps it is O(log n + matches).
- ✅ What a strong answer adds: with a transparent comparator, all four accept a `std::string_view` for `std::string` keys (`at` only from C++26).

**Key takeaway:** find to use, contains to ask, at to insist.

---

#### Q4: How do `insert`, `emplace`, `try_emplace` and `insert_or_assign` differ?
**Difficulty:** #intermediate
**Category:** #stl #map
**Concepts:** #try_emplace #insert_or_assign #move_semantics

**Answer:**
`insert` and `emplace` add the element only if the key is absent and never overwrite. `try_emplace` (C++17) does the same but guarantees its arguments are untouched if the key exists. `insert_or_assign` (C++17) inserts or overwrites. All return `{iterator, bool}` where `bool` means "inserted".

**Explanation:**
```cpp
#include <iostream>
#include <map>
#include <string>

int main() {
    std::map<int, std::string> m{{1, "existing"}};
    std::string a = "A", b = "B";
    m.insert({1, std::move(a)});      // pair built before the call: a is moved anyway
    m.try_emplace(1, std::move(b));   // key exists: b untouched
    std::cout << "[" << a << "] [" << b << "] " << m[1] << '\n';   // [] [B] existing
}
```
- `emplace` may build the node (consuming rvalue arguments) before discovering the duplicate: libstdc++ GCC 11 does, GCC 13 and GCC 14 do not. The standard allows both.
- `insert_or_assign(k, v)` differs from `m[k] = v`: no default construction of `V` first, and it reports whether it inserted.
- ❌ Common wrong answer: "emplace is always the most efficient." With an existing key it may waste an allocation and destroy your argument.
- ✅ What a strong answer adds: `try_emplace(k, args...)` also forwards constructor arguments for `V` piecewise, avoiding `std::piecewise_construct` boilerplate.

**Key takeaway:** Insert-if-absent: `try_emplace`. Insert-or-overwrite: `insert_or_assign`.

---

#### Q5: How does `std::set` decide that two keys are duplicates?
**Difficulty:** #intermediate
**Category:** #stl #set
**Concepts:** #equivalence #comparator #strict_weak_ordering

**Answer:**
By equivalence under the comparator: `a` and `b` are the same key when `!comp(a, b) && !comp(b, a)`. `operator==` is never called.

**Explanation:**
- A set of orders compared by price only treats two different orders with the same price as duplicates; the second insert fails.
- Consequently the comparator must define exactly the identity you want: compare all fields that make keys distinct.
- Unordered containers are different: they use a hash plus `operator==` (or a custom equality); topic 09.
- ❌ Common wrong answer: "It calls `==` to check duplicates." A type with only `operator<` works fine in a set.
- ✅ What a strong answer adds: equivalence and equality can disagree (case-insensitive comparator: "ABC" and "abc" are equivalent but not equal); the container only cares about equivalence.

**Key takeaway:** Ordered containers see only the comparator: equivalent means duplicate.

---

#### Q6: What is a strict weak ordering, and what goes wrong with `a <= b` as a comparator?
**Difficulty:** #intermediate
**Category:** #stl #comparators
**Concepts:** #strict_weak_ordering #irreflexivity #undefined_behaviour

**Answer:**
A strict weak ordering is irreflexive (`comp(a, a)` is false), asymmetric, transitive, and has transitive equivalence. `<=` violates irreflexivity: no key is equivalent to itself, so a set inserts duplicates and `find` never matches. It is undefined behaviour, and in `std::sort` it can read out of bounds.

**Explanation:**
```cpp
#include <iostream>
#include <set>

int main() {
    auto le = [](int a, int b) { return a <= b; };
    std::set<int, decltype(le)> s(le);
    s.insert(10);
    s.insert(10);
    std::cout << s.size() << ' ' << s.count(10) << '\n';   // libstdc++: 2 0
}
```
- `std::sort(v.begin(), v.end(), [](int a, int b) { return a <= b; })` on many equal values: introsort's unguarded partition uses the pivot as a sentinel, relying on `comp(x, x)` being false, and scans past the end of the buffer; ASan reports heap-buffer-overflow (libstdc++: with 17 or more equal ints; 16 or fewer skip partitioning and go straight to insertion sort).
- Other common violations: floating-point keys containing NaN; "approximately equal" comparisons with an epsilon (equivalence is not transitive).
- ❌ Common wrong answer: "`<=` is fine, it just allows equal elements." Equal elements are already allowed by `<`; `<=` destroys equivalence.
- ✅ What a strong answer adds: in debug mode (`-D_GLIBCXX_DEBUG`) libstdc++ checks this in `std::sort` and aborts with "comparison doesn't meet irreflexive requirements, assert(!(a < a))".

**Key takeaway:** Comparators must answer "strictly before"; `<=` is UB in every sorted container and algorithm.

---

#### Q7: What does "weak" mean in strict weak ordering?
**Difficulty:** #advanced
**Category:** #stl #comparators
**Concepts:** #equivalence_classes #total_order #weak_ordering

**Answer:**
It means distinct objects may be equivalent (incomparable) as long as equivalence behaves like equality: it must be transitive, so the objects fall into equivalence classes that are totally ordered. A strict total order is the special case where equivalence is identity.

**Explanation:**
- People sorted by age: two different people of the same age are equivalent; that is a valid weak ordering.
- NaN breaks it: NaN is incomparable with 1.0 and with 2.0, but 1.0 and 2.0 are not equivalent, so equivalence is not transitive.
- C++20 names the categories: `std::weak_ordering` (equivalent objects may be distinguishable), `std::strong_ordering` (equivalent means substitutable), `std::partial_ordering` (incomparable values allowed: `double`, which is why `double` alone is not a safe key in the presence of NaN).
- ❌ Common wrong answer: "Weak means the comparator may return true for equal elements." That describes `<=`, which is invalid.
- ✅ What a strong answer adds: `std::sort` is not stable precisely because equivalent elements may be distinct; `std::stable_sort` keeps their original order.

**Key takeaway:** Weak = equivalence classes allowed, but equivalence must be transitive.

---

#### Q8: What do `lower_bound` and `upper_bound` return, and how does a `std::greater` comparator change them?
**Difficulty:** #intermediate
**Category:** #stl #map
**Concepts:** #lower_bound #upper_bound #comparator_semantics

**Answer:**
`lower_bound(k)` returns the first element not ordered before `k` (`!comp(e, k)`); `upper_bound(k)` returns the first element ordered after `k` (`comp(k, e)`). With the default `less` that is "first `>= k`" and "first `> k`". With `std::greater` the container is descending, so `lower_bound(k)` is the first key `<= k`.

**Explanation:**
```cpp
#include <functional>
#include <iostream>
#include <map>

int main() {
    std::map<int, char, std::greater<int>> m{{10, 'a'}, {20, 'b'}, {30, 'c'}, {40, 'd'}};
    std::cout << m.lower_bound(25)->first << ' ' << m.upper_bound(25)->first << ' '
              << m.lower_bound(30)->first << ' ' << m.upper_bound(30)->first << '\n';
}
```
- Output: `20 20 30 20`. For a key that is present, `lower_bound` finds it and `upper_bound` finds the next one; for an absent key both return the same position.
- `[lower_bound(k), upper_bound(k))` is `equal_range(k)`.
- ❌ Common wrong answer: "lower_bound returns the greatest key smaller than k." That is `std::prev(lower_bound(k))` (if not `begin()`).
- ✅ What a strong answer adds: "greatest key `<= k`" = `upper_bound(k)` then step back once, checking for `begin()`.

**Key takeaway:** Bounds are defined by the comparator, not by numeric `>=`.

---

#### Q9: Why should you call `m.lower_bound(k)` instead of `std::lower_bound(m.begin(), m.end(), k)`?
**Difficulty:** #intermediate
**Category:** #stl #algorithms
**Concepts:** #member_vs_free #bidirectional_iterators #complexity

**Answer:**
The member function walks the tree: O(log n). The free algorithm only sees bidirectional iterators; it does O(log n) comparisons but must advance iterators step by step, so it is O(n) in total.

**Explanation:**
- Same for `std::binary_search`, `std::equal_range`, and `std::find` (linear) versus `m.find` (logarithmic).
- The free version also compares whole `value_type` pairs, so you need a custom comparator for `pair<const K, V>`.
- For vectors the free algorithm is the right one: random access makes it O(log n).
- ❌ Common wrong answer: "Both are binary searches, so both are O(log n)." The iterator category decides the cost of each jump.
- ✅ What a strong answer adds: the rule "prefer member functions over algorithms with the same name" applies to `find`, `count`, `lower_bound`, `upper_bound`, `equal_range` on associative containers and to `sort`, `remove`, `unique` on lists.

**Key takeaway:** Member lookups know the tree; free algorithms only know iterators.

---

#### Q10: How do you look up `std::string` keys with a `std::string_view` without creating temporaries?
**Difficulty:** #intermediate
**Category:** #stl #map
**Concepts:** #heterogeneous_lookup #transparent_comparator #string_view

**Answer:**
Declare the map with a transparent comparator: `std::map<std::string, V, std::less<>>`. `std::less<>` defines `is_transparent`, which enables template overloads of `find`, `count`, `lower_bound`, `upper_bound`, `equal_range` (C++14) and `contains` (C++20) that compare the argument directly with the keys.

**Explanation:**
- With the default `std::less<std::string>`, `m.find(sv)` does not compile, and `m.find("literal")` builds a temporary `std::string` per call (an allocation if longer than the SSO buffer).
- C++23 adds heterogeneous `erase` and `extract` (not yet in GCC 14's library); C++26 adds `operator[]`, `at`, `try_emplace`, `insert_or_assign`.
- Unordered containers need both a transparent hash and a transparent equality, and only since C++20 (topic 09).
- ❌ Common wrong answer: "string_view converts to string implicitly." The conversion is `explicit`, which is why the default comparator rejects it.
- ✅ What a strong answer adds: a custom transparent comparator for struct keys (compare an order by its id against a bare id) needs `using is_transparent = void;` and all mixed overloads.

**Key takeaway:** `std::less<>` turns on heterogeneous lookup for ordered containers.

---

#### Q11: How do you change the key of an element in a `std::map`?
**Difficulty:** #intermediate
**Category:** #stl #map
**Concepts:** #node_handle #extract #const_key

**Answer:**
You cannot modify it in place: keys are `const` because changing one would break the ordering. Since C++17, `extract` the node, assign `nh.key()`, and `insert(std::move(nh))`; no allocation and no copy of the value. Before C++17: copy the value, erase, insert with the new key.

**Explanation:**
- `extract` unlinks the node; the node handle owns it. References to the element stay valid and are usable again once re-inserted.
- `insert(std::move(nh))` returns `insert_return_type{position, inserted, node}`; if the new key already exists, the node comes back in `node`.
- Node handles also move elements between `map` and `multimap` (same key, value and allocator types), and `merge` transfers whole containers without copying.
- ❌ Common wrong answer: "`const_cast` the key and assign it." UB, and the tree is now unsorted.
- ✅ What a strong answer adds: for `std::set`, the same technique edits the element (`nh.value()`).

**Key takeaway:** Changing a key = extract, edit, re-insert.

---

#### Q12: `map<K, V>::value_type` is `pair<const K, V>`. Where does that bite in everyday code?
**Difficulty:** #intermediate
**Category:** #stl #map
**Concepts:** #value_type #range_for #hidden_copies

**Answer:**
In range-for loops and function parameters written as `const std::pair<K, V>&`: the type does not match, so each element is converted into a temporary copy (copying the key and value) and the reference binds to that temporary.

**Explanation:**
- GCC warns with `-Wrange-loop-construct` (in `-Wall`): "binds to a temporary constructed from type 'std::pair<const ...>'".
- Write `for (const auto& [key, value] : m)` or `const auto& p`; for explicit types, `const std::pair<const K, V>&` or `const decltype(m)::value_type&`.
- The `const K` is also why `std::sort` cannot be used on a map's elements and why `it->first = ...` does not compile.
- ❌ Common wrong answer: "A `const&` loop variable never copies." It copies when the types differ and a conversion exists.
- ✅ What a strong answer adds: the copy also defeats code that keeps `&p.second` expecting to point into the map; it points into a temporary that dies at the end of the iteration.

**Key takeaway:** Use `auto` in loops over maps; the real element type has a `const` key.

---

#### Q13: In a `std::multiset<int>` holding `{1, 2, 2, 2, 3}`, what is the difference between `ms.erase(2)` and `ms.erase(ms.find(2))`?
**Difficulty:** #beginner
**Category:** #stl #multiset
**Concepts:** #erase_by_key #equal_range #multi_containers

**Answer:**
`ms.erase(2)` removes **all** elements equivalent to 2 and returns 3. `ms.erase(ms.find(2))` removes exactly one element (check that `find` did not return `end()` first).

**Explanation:**
- `equal_range(2)` returns the range of all three 2s; `count(2)` is 3.
- New equivalent elements are inserted at the end of their equal range, so insertion order among equal keys is preserved (C++11).
- `multimap` has no `operator[]` and no `at`: there is no single value to return.
- ❌ Common wrong answer: "erase(key) removes the first match." That is what one might expect from other containers; for multi-containers it removes every match.
- ✅ What a strong answer adds: `ms.erase(ms.end())` is UB, so `erase(find(k))` needs the `end()` check.

**Key takeaway:** erase by key removes all equivalents; erase by iterator removes one.

---

#### Q14: How do you choose between `std::map` and `std::unordered_map`?
**Difficulty:** #intermediate
**Category:** #stl #container_choice
**Concepts:** #ordered_vs_unordered #worst_case #range_queries

**Answer:**
Use `map` when you need sorted iteration, range or nearest-key queries (`lower_bound`), a guaranteed O(log n) worst case, or iterators that survive every insert. Use `unordered_map` for pure point lookups by key when average O(1) matters and order does not.

**Explanation:**
- `unordered_map` is O(1) on average but O(n) in the worst case (bad hash, adversarial keys), and a rehash invalidates all iterators.
- `map` needs only `operator<`; `unordered_map` needs a good hash plus equality.
- Both allocate one node per element; neither is cache friendly. For small or read-mostly data, a sorted vector or `flat_map` often beats both.
- ❌ Common wrong answer: "unordered_map is always faster." For small n, string keys with expensive hashing, or workloads with range queries, it often is not.
- ✅ What a strong answer adds: latency-sensitive code may prefer `map`'s predictable worst case or, better, an open-addressing flat hash map (topic 09).

**Key takeaway:** Order or worst-case guarantees: map. Average-case point lookups: unordered_map. Small or static: sorted vector.

---

#### Q15: Why can a linear scan over a small vector beat `std::map::find`, despite O(n) versus O(log n)?
**Difficulty:** #advanced
**Category:** #stl #performance
**Concepts:** #cache_locality #pointer_chasing #flat_map

**Answer:**
For small n, the constants dominate. The vector is one contiguous block: the scan streams through cache lines with predictable branches and prefetching. The map walk is a chain of dependent loads to separately allocated nodes, each a possible cache miss, with comparison branches the predictor cannot learn.

**Explanation:**
- A cache miss costs on the order of 100 ns; a comparison on data already in cache costs about a nanosecond. Four misses in a map walk can cost more than scanning dozens of contiguous elements.
- Per-node allocation also costs at insert time and fragments memory; each `map<int,int>` element uses 40 bytes plus allocator overhead in libstdc++ versus 8 bytes in a vector of pairs.
- Middle ground: sorted vector plus `std::lower_bound` (O(log n) on contiguous memory), or `std::flat_map` (C++23), which stores keys and values in separate sorted arrays.
- ❌ Common wrong answer: "Big-O decides; O(log n) always wins." Big-O describes growth, not the cost at n = 32.
- ✅ What a strong answer adds: measure with realistic sizes and access patterns; the crossover depends on key type, n and how often the data changes.

**Key takeaway:** Big-O is not CPU cost: locality often beats asymptotics for small n.

---

#### Q16: What is `std::flat_map` (C++23), and what does it trade away?
**Difficulty:** #advanced
**Category:** #stl #cpp23
**Concepts:** #flat_map #sorted_vector #invalidation

**Answer:**
`std::flat_map` is a container adaptor that stores keys and values in two sorted sequences (vectors by default) and offers the map interface: O(log n) binary search lookup on contiguous memory and fast iteration. It trades away cheap updates (insert and erase are O(n)) and iterator and reference stability.

**Explanation:**
- Insert or erase shifts elements, so like a vector it invalidates iterators and references.
- Best for read-mostly data: build in bulk (or insert with the `sorted_unique` tag for pre-sorted input), then look up many times.
- Keys and values are separate arrays, so a key search touches only keys: better cache use than an array of pairs.
- Library support: libstdc++ ships `<flat_map>` from GCC 15; it is not available in GCC 14.
- ❌ Common wrong answer: "flat_map is a drop-in replacement for map." Code that relies on stable references or frequent inserts changes behaviour or cost.
- ✅ What a strong answer adds: `flat_set`, `flat_multimap` and `flat_multiset` follow the same model.

**Key takeaway:** flat_map = sorted arrays with a map interface: fast reads, slow writes, no stability.

---

#### Q17: How do you write a correct comparator for a struct key with several fields?
**Difficulty:** #intermediate
**Category:** #stl #comparators
**Concepts:** #lexicographic_order #std_tie #spaceship_operator

**Answer:**
Compare lexicographically: first field, then the next field only if the earlier ones are equivalent. Before C++20, `return std::tie(a.x, a.y) < std::tie(b.x, b.y);`. In C++20, `auto operator<=>(const Key&) const = default;` generates it, and `std::less<Key>` uses it.

**Explanation:**
- Hand-written `return a.x < b.x || a.y < b.y;` is a classic bug: `{1, 5}` < `{2, 1}` and `{2, 1}` < `{1, 5}` are both true, so it is not asymmetric.
- Include every field that distinguishes keys; otherwise distinct keys are treated as duplicates.
- Defaulted `<=>` compares members in declaration order, so declaration order is the sort order.
- ❌ Common wrong answer: "`a.x < b.x && a.y < b.y`." Then `{1, 1}` ~ `{1, 3}` and `{1, 3}` ~ `{2, 2}` (neither is less than the other), yet `{1, 1}` < `{2, 2}`: equivalence is not transitive.
- ✅ What a strong answer adds: floating-point members bring back the NaN problem; normalize or reject NaN.

**Key takeaway:** Use `std::tie` or defaulted `<=>`; hand-rolled multi-field comparisons are a frequent source of UB.

---

#### Q18: How do you build a large `std::map` from already sorted data efficiently?
**Difficulty:** #advanced
**Category:** #stl #performance
**Concepts:** #hint_insert #emplace_hint #bulk_load

**Answer:**
Insert with a hint at the end: `m.emplace_hint(m.end(), k, v)`. When the new element belongs right before the hint, insertion is amortized O(1), so the whole build is O(n) comparisons instead of O(n log n). The range constructor is guaranteed linear for input already sorted by the comparator.

**Explanation:**
- Since C++11 the hint means "insert as close as possible to the position just before `hint`".
- A wrong hint is not an error, it just falls back to O(log n).
- Every element still costs one node allocation; for static data, a sorted vector avoids those entirely.
- ❌ Common wrong answer: "Hints are ignored by modern implementations." libstdc++ uses them; the gain is measurable for large sorted inputs.
- ✅ What a strong answer adds: `try_emplace` and `insert_or_assign` also have hint overloads.

**Key takeaway:** Sorted input plus `emplace_hint(end())` turns an O(n log n) build into O(n).
