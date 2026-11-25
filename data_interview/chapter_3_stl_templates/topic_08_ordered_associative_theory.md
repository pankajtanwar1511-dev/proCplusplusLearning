## TOPIC: std::map and std::set

### THEORY_SECTION: Core Concepts

#### 1. Mental model
- `std::set<K>` and `std::map<K, V>` keep their elements **sorted by a comparator** (`std::less<K>` by default) and allow at most one element per key. `multiset`/`multimap` allow equivalent keys.
- The standard fixes the interface and the complexities, not the data structure:
  - find, insert, erase by key: O(log n).
  - In-order iteration: O(n) total.
  - Insert and erase never invalidate iterators or references to other elements.
- Every major implementation uses a **red-black tree**: a self-balancing binary search tree where each node stores a colour and three pointers (parent, left, right).
  - libstdc++, x86-64: node header 32 bytes, so a `map<int, int>` node is 40 bytes plus allocator overhead; `sizeof(std::map<...>)` is 48 bytes.
  - Balancing: insert needs at most 2 rotations, erase at most 3, plus O(log n) recolouring in the worst case.
- `map<K, V>::value_type` is `std::pair<const K, V>`: the key cannot change while the element is in the tree, because changing it would break the ordering.
- A lookup walks from the root, one comparison and one pointer dereference per level. It is "binary search over a tree", not over an array: every step is a potential cache miss.

#### 2. Lookup API: find, contains, count, at, operator[]
| Call | Missing key | Requirements | Returns |
|---|---|---|---|
| `m.find(k)` | `m.end()` | none | iterator |
| `m.contains(k)` (C++20) | `false` | none | bool |
| `m.count(k)` | 0 | none | 0 or 1 (multimap: n) |
| `m.at(k)` | throws `std::out_of_range` | none | `V&` / `const V&` |
| `m[k]` | **inserts** `{k, V{}}` | non-const map, `V` default-constructible | `V&` |
- `operator[]` is "find or insert": reading a missing key with `m[k]` adds an element. Accidental inserts change `size()`, iteration output, and memory use.
- `operator[]` does not exist on a `const map` (it may modify), so `const` code is forced to use `find`/`at`.
- For a read-and-use, `find` gives both the existence check and the value in one O(log n) walk; `contains` followed by `at` does two walks.

#### 3. Insertion API
| Call | Key exists | Key missing | Notes |
|---|---|---|---|
| `insert({k, v})` | no change, returns `{it, false}` | inserts | The pair is built **before** the call, even if unused |
| `emplace(args...)` | no change | constructs in place | May construct the node (consuming the arguments) before finding the duplicate |
| `try_emplace(k, args...)` (C++17) | no change, **arguments untouched** | constructs `V(args...)` | Best "insert if absent" |
| `insert_or_assign(k, v)` (C++17) | assigns `v` | inserts | Returns `{it, inserted}`; unlike `m[k] = v`, no default construction of `V` |
| `m[k] = v` | assigns | default-constructs, then assigns | Needs default-constructible `V` |
| `insert(hint, x)`, `emplace_hint` | no change | inserts | Amortized O(1) if the element goes right before `hint` |
- `insert` and `emplace` return `std::pair<iterator, bool>`; the `bool` is the only way to know whether the insert happened.
- `emplace` when the key exists:
  - The standard allows constructing the node first, so arguments passed as rvalues may already be moved from.
  - Observed: libstdc++ GCC 11 moves the string out even when the key exists; GCC 13 and GCC 14 look the key up first and leave it intact. Do not rely on either; use `try_emplace`.
- Hint insertion: inserting sorted data with `m.emplace_hint(m.end(), k, v)` is O(n) overall instead of O(n log n).

#### 4. Ordered queries: lower_bound, upper_bound, equal_range
- Defined through the comparator `comp`, not through `>=`:
  - `lower_bound(k)`: first element `e` with `!comp(e, k)`, "not ordered before k".
  - `upper_bound(k)`: first element `e` with `comp(k, e)`, "ordered after k".
  - `equal_range(k)`: the pair `{lower_bound(k), upper_bound(k)}`; for a unique-key container it has 0 or 1 elements.
- With the default `less`: lower_bound = first key `>= k`, upper_bound = first key `> k`.
- With `std::greater` (descending order): lower_bound = first key `<= k`. People who think "lower_bound means >=" get this wrong.
- Range query `[a, b)`: iterate from `lower_bound(a)` to `lower_bound(b)`. Inclusive `[a, b]`: up to `upper_bound(b)`.
- "Greatest key `<= k`" with default order: `auto it = m.upper_bound(k); if (it != m.begin()) --it;`.
- Use the **member** functions: `std::lower_bound(m.begin(), m.end(), ...)` does O(log n) comparisons but O(n) iterator steps, because map iterators are bidirectional.

#### 5. Comparators and strict weak ordering
- The comparator must be a **strict weak ordering**:
  - Irreflexive: `comp(a, a)` is false.
  - Asymmetric: `comp(a, b)` implies `!comp(b, a)`.
  - Transitive: `comp(a, b) && comp(b, c)` implies `comp(a, c)`.
  - Transitivity of equivalence: if `a ~ b` and `b ~ c`, then `a ~ c`, where `a ~ b` means `!comp(a, b) && !comp(b, a)`.
- Associative containers never call `operator==`. Two keys are "the same" when they are **equivalent** under `comp`.
- "Weak" means distinct objects may be equivalent (orders sorted by price only: two orders at the same price are equivalent). It does not mean "allowed to use `<=`".
- Violations are UB (a precondition of the container and of `std::sort`), with concrete symptoms:
  - `a <= b` breaks irreflexivity: a set inserts duplicates and then cannot find them; `std::sort` can read past the end of the array.
  - Floating-point keys with NaN: NaN is equivalent to every number, which breaks transitivity of equivalence; lookups and inserts misbehave.
  - Comparators that change behaviour over time (comparing mutable state) corrupt the tree's invariants.
- Compound keys: compare lexicographically with `std::tie(a.x, a.y) < std::tie(b.x, b.y)` or, in C++20, `auto operator<=>(const Key&) const = default;`.
- The comparator object must be callable as `const` (libstdc++ static-asserts: "comparison object must be invocable as const").
- Descending order: `std::map<K, V, std::greater<K>>`, or `std::greater<>` for heterogeneous lookup.

#### 6. Heterogeneous lookup with transparent comparators
- Problem: `std::map<std::string, int> m; m.find(sv)` with a `std::string_view` does not compile, and `m.find("literal")` builds a temporary `std::string` (possibly allocating) for every lookup.
- Fix (C++14): use a transparent comparator, `std::map<std::string, int, std::less<>>`. `std::less<>` has a nested `is_transparent` type, which enables template overloads of `find`, `count`, `lower_bound`, `upper_bound`, `equal_range`, and (C++20) `contains`.
- The key type and the lookup type must be comparable both ways (`std::string` vs `std::string_view` is).
- Version map:
  - C++14: heterogeneous `find`/`count`/bounds for ordered containers.
  - C++20: heterogeneous `contains`; unordered containers get heterogeneous lookup, needing both a transparent hash and a transparent equality (topic 09).
  - C++23 (P2077): heterogeneous `erase` and `extract`. Not yet in GCC 14's library.
  - C++26 (P2363): heterogeneous `operator[]`, `at`, `try_emplace`, `insert_or_assign`.
- Custom transparent comparator: add `using is_transparent = void;` and overloads for each mixed pair.

#### 7. Iterator and reference stability
- Insert never invalidates anything. Erase invalidates only the erased elements. This holds for all four ordered containers (table in topic 06).
- Erase-in-loop: `it = m.erase(it);` or `std::erase_if(m, pred)` (C++20).
- Element references are stable for the element's lifetime in the container, which makes `map` a reasonable owner of objects that other code points to.
- `set` elements and map keys are `const`: you cannot modify them through an iterator. To change a key: `extract`, modify, re-insert (section 8).
- Range-for: write `const auto& [key, value]` or `const std::pair<const K, V>&`. Writing `const std::pair<K, V>&` (without `const K`) binds to a **temporary copy** of each element; GCC warns with `-Wrange-loop-construct`.

#### 8. Node handles: extract, insert, merge (C++17)
- `m.extract(it)` or `m.extract(key)` unlinks a node and returns a **node handle** owning it. No allocation, no copy.
- With a node handle you can:
  - Change the key: `nh.key() = new_key;` (the only legal way to modify a key in place), then `m.insert(std::move(nh))`.
  - Move the node into another container with the same node type: `map` and `multimap` with the same `K`, `V`, allocator (comparator may differ).
- `insert(node_handle&&)` returns an `insert_return_type` with `position`, `inserted`, and `node` (the handle is given back if the key already existed).
- `dst.merge(src)` splices every node whose key is not already in `dst`; duplicates stay in `src`. No element is copied or moved, iterators to transferred elements stay valid and now refer into `dst`.
- Pointers and references to an extracted element stay valid; using them while the element is held by the node handle is UB, and they become usable again after re-insertion.

#### 9. multimap and multiset
- Equivalent keys are allowed. A new element is inserted at the upper end of its equal range, so insertion order among equivalent keys is preserved (guaranteed since C++11).
- `equal_range(k)` gives all elements with key `k`; `count(k)` is O(log n + count).
- `erase(k)` removes **all** elements equivalent to `k` and returns how many. To remove one: `if (auto it = ms.find(k); it != ms.end()) ms.erase(it);`.
- `multimap` has no `operator[]` and no `at` (which value would they return?).

#### 10. Performance and alternatives
| Structure | Lookup | Insert / erase | Ordered iteration | Memory and cache |
|---|---|---|---|---|
| `std::map` | O(log n), pointer chasing | O(log n), one allocation per element | yes | 32-byte node header per element (libstdc++), scattered |
| `std::unordered_map` | O(1) average, O(n) worst | O(1) average, may rehash | no | buckets + nodes (topic 09) |
| Sorted `std::vector<pair>` | O(log n) binary search, contiguous | O(n) shift | yes | Compact, prefetch friendly |
| `std::flat_map` (C++23) | O(log n), contiguous keys | O(n) | yes | Separate key and value arrays; GCC 15+ library |
- Why a map can lose to a linear scan of a small vector: each tree level is a dependent load (cache miss), a branch the predictor cannot learn, and every node is a separate allocation. For tens of elements, scanning a contiguous array is often faster than O(log n) tree descent.
- Choose `map` for: ordered iteration, range queries (`lower_bound`), stable references, frequent inserts and erases interleaved with lookups.
- Choose a sorted vector or `flat_map` for: read-mostly data built once (configuration, symbol tables, static lookup tables).
- `flat_map` invalidates iterators on insert and erase (it is vector-backed) and needs movable keys and values.

#### 11. Misconceptions to unlearn
- ❌ "`m[k]` is a lookup." ✅ It inserts a default value if `k` is missing.
- ❌ "Set uses `operator==` to detect duplicates." ✅ It uses equivalence: `!comp(a, b) && !comp(b, a)`.
- ❌ "`<=` is a fine comparator; it just allows equal keys." ✅ It violates irreflexivity: UB, duplicates and failed lookups.
- ❌ "`lower_bound(k)` returns the first key `>= k`." ✅ Only with the default `less`; in general it is the first key not ordered before `k`.
- ❌ "`std::lower_bound` on a map is O(log n)." ✅ O(n) iterator steps; use the member function.
- ❌ "`emplace` does nothing when the key exists." ✅ It may already have consumed (moved) its arguments; `try_emplace` does not.
- ❌ "A map is a binary search over an array." ✅ It is a tree walk; each step is a pointer dereference.
- ❌ "O(log n) map always beats O(n) vector scan." ✅ Not for small n: locality and branch prediction dominate.
- ❌ "Keys can be modified through a map iterator if the order stays the same." ✅ Keys are `const`; use `extract`.
- ❌ "Heterogeneous lookup works with the default comparator." ✅ It needs `std::less<>` (or another transparent comparator).

### EDGE_CASES: Traps and Misconceptions

#### Edge Case 1: Reading with operator[] inserts
- `if (m[id] == "x")` or `std::cout << m[id]` on a missing key creates the element with a default value.
- Symptoms: `size()` grows during "read-only" code, iteration prints unexpected empty entries, and memory grows when keys come from external input.
```cpp
#include <iostream>
#include <map>
#include <string>

int main() {
    std::map<int, std::string> names{{1, "alpha"}};
    std::cout << "[" << names[100] << "] size=" << names.size() << '\n';
    std::cout << "contains 200: " << names.contains(200) << " size=" << names.size() << '\n';
}
```
- Output: `[] size=2` then `contains 200: 0 size=2`.

#### Edge Case 2: operator[] needs a non-const map and a default-constructible value
- In a `const std::map&` parameter, `m[k]` does not compile: "passing 'const std::map<...>' as 'this' argument discards qualifiers".
- If `V` has no default constructor, every use of `m[k]` fails to compile, even for assignment. Use `try_emplace`, `insert_or_assign`, or `at`.

#### Edge Case 3: A `<=` comparator
- `comp(x, x)` returns true, so `x` is never equivalent to itself. Inserting a duplicate finds no equivalent key and inserts again; `find(x)` never reports a match.
```cpp
#include <iostream>
#include <set>

struct LessEq {
    bool operator()(int a, int b) const { return a <= b; }   // not a strict weak ordering
};

int main() {
    std::set<int, LessEq> s;
    s.insert(10);
    s.insert(20);
    s.insert(10);
    std::cout << s.size() << ' ' << s.count(10) << ' '
              << (s.find(10) == s.end()) << '\n';
}
```
- Output (libstdc++): `3 0 1`. Formally the behaviour is undefined; this is what the red-black tree happens to do.
- The same comparator in `std::sort` on a range of equal values can run off the end of the array (ASan: heap-buffer-overflow).

#### Edge Case 4: NaN keys silently break the set
- Every comparison with NaN is false, so NaN is "equivalent" to every number while 1.0 and 2.0 are not equivalent to each other: transitivity of equivalence fails.
```cpp
#include <cmath>
#include <iostream>
#include <set>

int main() {
    std::set<double> s{1.0, NAN, 2.0, 0.5};
    std::cout << "size " << s.size() << ':';
    for (double d : s) std::cout << ' ' << d;
    std::cout << " | count(NaN) " << s.count(NAN) << '\n';
}
```
- Output (libstdc++): `size 3: 0.5 1 2 | count(NaN) 1`. NaN was "already present" (equivalent to 1.0), so it was dropped, and `count(NaN)` reports a match that is really 1.0. Formally UB.
- Fix: reject NaN before inserting, or use a comparator that orders NaN consistently: `std::strong_order(a, b) < 0` (C++20, IEEE totalOrder) puts a positive NaN after every number (a negative NaN before). With that comparator the same set has 4 elements (`0.5 1 2 nan`, verified with GCC 13; GCC 11's library does not support `strong_order` for `double` yet).

#### Edge Case 5: emplace may consume its arguments even when nothing is inserted
- `m.emplace(key, std::move(s))` with an existing key: libstdc++ GCC 11 constructs the node first, moving `s`, then discards it. GCC 13 and GCC 14 check the key first. The standard permits both.
- `m.insert({key, std::move(s)})` always moves `s`: the pair argument is constructed before `insert` runs.
- `m.try_emplace(key, std::move(s))` guarantees `s` is untouched if the key exists.
- This matters for retry logic: code that "inserts, and on failure uses the value elsewhere" loses the value.

#### Edge Case 6: The wrong pair type in range-for copies every element
- `for (const std::pair<std::string, int>& p : m)` does not match `std::pair<const std::string, int>`; the compiler builds a temporary converted pair (copying the string) per iteration and binds the reference to it.
- Costs an allocation per long key, and `&p.first` is not the address of the key in the map.
- GCC warns: "loop variable 'p' ... binds to a temporary constructed from type 'std::pair<const ...>'" (`-Wrange-loop-construct`, part of `-Wall`).
- Write `const auto& [k, v]` or `const auto& p`.

#### Edge Case 7: lower_bound with a descending comparator
- `std::map<int, char, std::greater<int>> m{{10,'a'},{20,'b'},{30,'c'},{40,'d'}};` iterates 40, 30, 20, 10.
- `m.lower_bound(25)` is 20 (first key not ordered before 25, i.e. first key `<= 25` in this order), and `upper_bound(25)` is also 20.
- `lower_bound` follows the comparator, not numeric `>=`.

#### Edge Case 8: Algorithms that look logarithmic but are linear
- `std::lower_bound(m.begin(), m.end(), ...)` and `std::binary_search` on map iterators: O(log n) comparisons, but `std::advance` on bidirectional iterators makes it O(n) steps.
- `std::distance(m.begin(), m.find(k))` (the "rank" of a key) is O(n). Ordered containers have no O(log n) rank operation; an order-statistics tree or a sorted vector is needed.
- `std::find(m.begin(), m.end(), ...)` is a linear scan; use `m.find(k)`.

#### Edge Case 9: A non-const call operator does not compile
- `struct Cmp { bool operator()(int a, int b) { return a < b; } };` (missing `const`) fails as soon as the set is used: libstdc++ static-asserts "comparison object must be invocable as const".
- Lookups are `const` member functions, so the comparator they store is `const` too. Mark `operator()` `const`, and keep comparators free of mutable state.

### CODE_EXAMPLES: Practical Demonstrations

#### Example 1: Looking up without inserting
- `find` for "check and use", `contains` for a yes/no question, `at` when a missing key is an error.
```cpp
#include <iostream>
#include <map>
#include <stdexcept>
#include <string>

int main() {
    const std::map<std::string, double> limits{{"order", 1000.0}, {"cancel", 50.0}};

    if (auto it = limits.find("order"); it != limits.end())
        std::cout << "order limit " << it->second << '\n';   // one tree walk

    std::cout << std::boolalpha << "has modify: " << limits.contains("modify") << '\n';

    try {
        std::cout << limits.at("modify") << '\n';
    } catch (const std::out_of_range& e) {
        std::cout << "at() threw out_of_range\n";
    }
    std::cout << "size still " << limits.size() << '\n';
    // limits["modify"];   // does not compile: operator[] needs a non-const map
}
```
- Output:
```
order limit 1000
has modify: false
at() threw out_of_range
size still 2
```

#### Example 2: The insertion family side by side
- Same key, five different calls: who overwrites, who reports, who consumes its argument.
```cpp
#include <iostream>
#include <map>
#include <string>

int main() {
    std::map<int, std::string> m{{1, "old"}};

    auto [it1, ok1] = m.insert({1, "insert"});
    std::cout << "insert:           " << ok1 << ' ' << it1->second << '\n';

    std::string v = "try";
    auto [it2, ok2] = m.try_emplace(1, std::move(v));
    std::cout << "try_emplace:      " << ok2 << ' ' << it2->second
              << " (v still '" << v << "')\n";

    auto [it3, ok3] = m.insert_or_assign(1, "assigned");
    std::cout << "insert_or_assign: " << ok3 << ' ' << it3->second << '\n';

    m[1] = "subscript";
    std::cout << "operator[]:       " << m[1] << '\n';

    auto [it4, ok4] = m.try_emplace(2, 3, 'x');     // constructs std::string(3, 'x')
    std::cout << "try_emplace new:  " << ok4 << ' ' << it4->second << '\n';
}
```
- Output:
```
insert:           0 old
try_emplace:      0 old (v still 'try')
insert_or_assign: 0 assigned
operator[]:       subscript
try_emplace new:  1 xxx
```
- `insert_or_assign` returns `false` because nothing was **inserted**; it still assigned.

#### Example 3: Range queries on price levels
- Ordered keys make "everything between a and b" and "nearest level" queries cheap.
```cpp
#include <iostream>
#include <map>

int main() {
    std::map<int, int> asks{{101, 5}, {102, 7}, {104, 2}, {107, 9}, {110, 1}};

    std::cout << "levels in [102, 107]:";
    for (auto it = asks.lower_bound(102); it != asks.upper_bound(107); ++it)
        std::cout << ' ' << it->first << 'x' << it->second;
    std::cout << '\n';

    auto ge = asks.lower_bound(103);                       // first key >= 103
    std::cout << "first level >= 103: " << ge->first << '\n';

    auto le = asks.upper_bound(103);                       // greatest key <= 103
    if (le != asks.begin()) {
        --le;
        std::cout << "last level <= 103: " << le->first << '\n';
    }
    auto [lo, hi] = asks.equal_range(104);
    std::cout << "equal_range(104) size: " << std::distance(lo, hi) << '\n';
}
```
- Output:
```
levels in [102, 107]: 102x7 104x2 107x9
first level >= 103: 104
last level <= 103: 102
equal_range(104) size: 1
```

#### Example 4: Struct keys and descending order
- C++20 defaulted `<=>` gives a correct lexicographic strict weak ordering; `std::greater<>` reverses iteration.
```cpp
#include <compare>
#include <functional>
#include <iostream>
#include <map>
#include <set>
#include <string>

struct Key {
    std::string venue;
    int id;
    auto operator<=>(const Key&) const = default;   // compares venue, then id
};

int main() {
    std::set<Key> keys{{"B", 2}, {"A", 9}, {"B", 1}, {"A", 9}};
    for (const auto& k : keys) std::cout << k.venue << k.id << ' ';
    std::cout << "| size " << keys.size() << '\n';

    std::map<int, int, std::greater<>> bids{{99, 1}, {101, 4}, {100, 2}};
    std::cout << "best bid " << bids.begin()->first << ", order:";
    for (const auto& [px, qty] : bids) std::cout << ' ' << px;
    std::cout << '\n';
}
```
- Output:
```
A9 B1 B2 | size 3
best bid 101, order: 101 100 99
```
- The duplicate `{"A", 9}` is equivalent to the existing key, so the set keeps 3 elements. Members are compared in declaration order, so declare the most significant member first.

#### Example 5: Heterogeneous lookup with std::less<>
- Look up `std::string` keys with `std::string_view` without building temporary strings.
```cpp
#include <functional>
#include <iostream>
#include <map>
#include <string>
#include <string_view>

int main() {
    std::map<std::string, int, std::less<>> config{{"max_orders", 100}, {"timeout_ms", 250}};
    std::string_view field = "timeout_ms=300";
    std::string_view key = field.substr(0, field.find('='));

    if (auto it = config.find(key); it != config.end())      // no std::string built
        std::cout << it->first << " -> " << it->second << '\n';
    std::cout << std::boolalpha << config.contains(std::string_view{"retries"}) << '\n';
    // With std::map<std::string, int> (default std::less<std::string>),
    // config.find(key) would not compile: no conversion from string_view to string.
}
```
- Output:
```
timeout_ms -> 250
false
```

#### Example 6: extract and merge
- Change a key without reallocating the node, then merge two maps without copying values.
```cpp
#include <iostream>
#include <map>
#include <string>

void print(const char* label, const std::map<int, std::string>& m) {
    std::cout << label;
    for (const auto& [k, v] : m) std::cout << ' ' << k << '=' << v;
    std::cout << '\n';
}

int main() {
    std::map<int, std::string> a{{1, "one"}, {2, "two"}, {3, "three"}};
    const std::string* addr = &a.at(3);

    auto nh = a.extract(3);            // unlink the node, no copy
    nh.key() = 0;                      // keys are mutable only inside a node handle
    a.insert(std::move(nh));
    print("rekeyed:", a);
    std::cout << "same node: " << std::boolalpha << (addr == &a.at(0)) << '\n';

    std::map<int, std::string> b{{2, "TWO"}, {5, "five"}};
    a.merge(b);                        // moves 5; key 2 already in a, so it stays in b
    print("a:", a);
    print("b:", b);
}
```
- Output:
```
rekeyed: 0=three 1=one 2=two
same node: true
a: 0=three 1=one 2=two 5=five
b: 2=TWO
```

#### Example 7: multimap and multiset
- Equal ranges, insertion order among equal keys, and erasing one versus all.
```cpp
#include <iostream>
#include <map>
#include <set>
#include <string>

int main() {
    std::multimap<std::string, int> by_symbol;
    by_symbol.insert({"XYZ", 1});
    by_symbol.insert({"ABC", 2});
    by_symbol.insert({"XYZ", 3});        // goes after the first XYZ
    auto [lo, hi] = by_symbol.equal_range("XYZ");
    for (auto it = lo; it != hi; ++it) std::cout << it->second << ' ';
    std::cout << '\n';

    std::multiset<int> ms{1, 2, 2, 2, 3};
    ms.erase(ms.find(2));                // remove ONE 2
    std::cout << "after erase(find): " << ms.count(2) << '\n';
    auto n = ms.erase(2);                // remove ALL remaining 2s
    std::cout << "erase(key) removed " << n << ", size " << ms.size() << '\n';
}
```
- Output:
```
1 3 
after erase(find): 2
erase(key) removed 2, size 2
```

#### Example 8: A sorted vector as a read-mostly map
- Build once, sort once, then binary search contiguous memory. This is what `std::flat_map` (C++23) packages.
```cpp
#include <algorithm>
#include <iostream>
#include <string>
#include <utility>
#include <vector>

int main() {
    std::vector<std::pair<int, std::string>> table{
        {42, "event"}, {7, "config"}, {19, "order"}, {3, "request"}};
    std::sort(table.begin(), table.end());          // one O(n log n) build

    auto lookup = [&](int key) -> const std::string* {
        auto it = std::lower_bound(table.begin(), table.end(), key,
                                   [](const auto& e, int k) { return e.first < k; });
        return (it != table.end() && it->first == key) ? &it->second : nullptr;
    };
    for (int k : {19, 20})
        std::cout << k << ": " << (lookup(k) ? *lookup(k) : "missing") << '\n';
}
```
- Output:
```
19: order
20: missing
```
- Here `std::lower_bound` is O(log n) because vector iterators are random access. Inserting into the table later costs O(n); that is the trade-off.

### QUICK_REFERENCE: Cheat Sheet

#### Operations and complexity
| Operation | Complexity | Note |
|---|---|---|
| `find`, `contains`, `count`, `at` | O(log n) | Never insert |
| `operator[]` | O(log n) | Inserts default `V` if missing |
| `insert`, `emplace`, `try_emplace` | O(log n) | Returns `{iterator, bool}` |
| `insert(hint, x)` / `emplace_hint` | amortized O(1) if right before hint, else O(log n) | Sorted bulk load |
| `erase(it)` | amortized O(1) | Returns next iterator |
| `erase(key)` | O(log n + count) | Returns number removed |
| `lower_bound`, `upper_bound`, `equal_range` | O(log n) | Use members, not `std::` versions |
| Full iteration | O(n) | Sorted by comparator |
| `extract`, `insert(node)` | O(log n) (amortized O(1) by iterator) | No allocation |
| `merge` | O(n log(n + m)) | No copies; duplicates stay in source |

#### Insert or update?
| Want | Use |
|---|---|
| Insert if absent, never touch the argument otherwise | `try_emplace(k, args...)` |
| Insert or overwrite | `insert_or_assign(k, v)` |
| Insert if absent, check result | `auto [it, ok] = m.insert({k, v});` |
| Read, missing is an error | `at(k)` |
| Read, missing is normal | `find(k)` |
| Existence only | `contains(k)` (C++20) |
| Change a key | `extract`, `nh.key() = ...`, `insert(std::move(nh))` |

#### Comparator rules
| Rule | Breaks if |
|---|---|
| `comp(a, a)` is false | `<=`, `>=` |
| Equivalence transitive | NaN keys, tolerance-based comparisons (`abs(a - b) < eps`) |
| Stable over time | Comparator reads mutable or global state |
| Callable as const | `operator()` not marked `const` |
| Transparent for heterogeneous lookup | Missing `is_transparent` (`std::less<>` has it) |

#### Implementation facts (libstdc++ / GCC, x86-64; not guaranteed)
| Fact | Value |
|---|---|
| Data structure | Red-black tree |
| `sizeof(std::map<K, V>)`, `sizeof(std::set<K>)` | 48 bytes |
| Node overhead | 32 bytes (colour + parent/left/right) + value |
| `map<int, int>` node | 40 bytes |
| `emplace` with existing key | GCC 11 consumes rvalue args; GCC 13/14 do not |
| `std::flat_map` | Library support from GCC 15 (not in GCC 14) |

#### Interview one-liners
| Question | Answer |
|---|---|
| How is std::map implemented? | Red-black tree in practice; standard mandates O(log n) and stable iterators |
| `m[k]` on a missing key? | Inserts `V{}` and returns a reference to it |
| How does set detect duplicates? | Equivalence: `!comp(a,b) && !comp(b,a)`, never `==` |
| `<=` as comparator? | UB: duplicates inserted, lookups fail, `std::sort` can overflow |
| `lower_bound` vs `upper_bound`? | First not before `k` vs first after `k` (per comparator) |
| Greatest key `<= k`? | `upper_bound(k)`, then step back if not `begin()` |
| `emplace` vs `try_emplace`? | try_emplace never consumes args when the key exists |
| Lookup `std::string` keys by `string_view`? | Use `std::less<>` (transparent comparator) |
| Change a key? | `extract` node handle, edit `key()`, re-insert |
| map erase invalidates? | Only the erased element |
| Why can a small vector beat a map? | Contiguous memory, no pointer chasing, no per-node allocation |
| map vs unordered_map? | Need order, ranges, or stable worst case: map; pure point lookups: unordered |
