## TOPIC: deque, list, forward_list, array and Adaptors

### THEORY_SECTION: Core Concepts

#### 1. Mental model
- Every sequence container keeps elements in insertion order; they differ in **memory layout**, and the layout decides everything else: cost of each operation, what invalidates, and cache behaviour.
- Four layouts:
  - **One contiguous heap buffer**: `vector` (topic 05), `string` (topic 01).
  - **Contiguous storage inside the object**: `std::array`, C++26 `std::inplace_vector`.
  - **Fixed-size blocks plus a map of block pointers**: `std::deque`.
  - **One heap node per element**: `std::list` (doubly linked), `std::forward_list` (singly linked).
- Adaptors (`stack`, `queue`, `priority_queue`) are not containers: they wrap one and expose a restricted interface.
- Default choice is `std::vector`. Reach for the others only for a concrete reason: growth at the front, stable element addresses, O(1) splicing, or a size fixed at compile time.

#### 2. std::deque: layout
- A deque is an array of pointers (the **map**) to fixed-size **blocks**; elements live in the blocks.
- Block size is implementation-defined. libstdc++ (GCC, x86-64): 512 bytes per block when `sizeof(T) < 512`, otherwise one element per block. So 128 `int`s or 16 `std::string`s per block.
- Because all blocks (except the partly filled first and last) have the same size, `d[i]` is plain arithmetic: block = `(offset + i) / per_block`, slot = `(offset + i) % per_block`. That is O(1) random access **without** contiguity.
- `push_back`/`push_front`:
  - Constant time, exactly one element constructed, no existing element is moved or copied.
  - When the end block is full, a new block is allocated; when the map is full, the map (only the block pointers) is reallocated or recentered.
- `insert`/`erase` in the middle: linear in the distance to the **nearer** end, O(min(i, n - i)), because the deque shifts whichever side is shorter.
- No `capacity()` and no `reserve()`. `shrink_to_fit()` exists (non-binding).
- Costs to know (libstdc++, x86-64): `sizeof(std::deque<T>)` is 80 bytes, and even an empty deque allocates (the map plus one block). A `vector<deque<int>>` of many small deques wastes a lot of memory.
- No `data()`: you cannot pass a deque's elements to a C API expecting a contiguous array.

#### 3. std::deque: invalidation (why it is asymmetric)
- Insert at either end: **all iterators invalid, all references and pointers valid**.
  - Elements never move, so references stay valid.
  - A deque iterator stores a pointer into the map (libstdc++: current element, block begin, block end, map slot). If the map is reallocated, that last pointer dangles; the standard therefore invalidates iterators on every end insertion.
- Erase at either end (`pop_front`, `pop_back`): only the erased element (and `end()` for the back).
- Insert or erase in the middle: everything.
- Full container comparison table: topic 06.
- Practical consequence: a deque grown only at the ends is a valid choice when other code holds `T*` or `T&` to its elements and also needs indexing.

#### 4. std::list
- Doubly linked list: each element is a separate heap node with `prev` and `next` pointers.
  - libstdc++, x86-64: node for `list<int>` is 24 bytes (16 bytes of links + `int` + padding), plus the allocator's own per-allocation overhead.
  - `sizeof(std::list<int>)` is 24 bytes (sentinel node links + size). An empty list does not allocate.
- Operations:
  - `insert(pos, x)` inserts **before** `pos`, O(1), returns an iterator to the new element.
  - `erase(pos)` O(1), returns the next iterator.
  - `size()` is O(1) since C++11 (it was allowed to be O(n) before, to keep range `splice` O(1)).
  - Finding the position is O(n): "O(1) insertion" only helps if you already hold an iterator.
- `splice` moves nodes between lists without copying or allocating:
  - Whole list or a single element: O(1).
  - A range from **another** list: O(n) in the range length (the sizes must be updated). Within the same list: O(1).
  - Iterators and references to moved elements stay valid and now refer into the destination list.
- Member algorithms, because the generic ones need random access or would copy:
  - `sort()`: stable merge sort, O(n log n), relinks nodes; no iterator is invalidated.
  - `merge(other)`: both sorted; stable; `other` becomes empty.
  - `unique()`: removes **consecutive** duplicates.
  - `remove(v)`, `remove_if(p)`: unlink matching nodes; return the count since C++20.
  - `reverse()`: relinks.
- Iteration is pointer chasing: each step is a dependent load to an address the prefetcher cannot predict. A list traversal is typically several times slower than a vector traversal of the same size.

#### 5. std::forward_list
- Singly linked, designed to have zero overhead over a hand-written C list: `sizeof(std::forward_list<int>)` is 8 bytes (one pointer, libstdc++), node is 16 bytes for `int`.
- No `size()` (keeping it would cost space), no `push_back`, no `--it`.
- Everything happens **after** a position, because a node can only change its successor:
  - `insert_after`, `emplace_after`, `erase_after`, `splice_after`.
  - `before_begin()` returns a position before the first element, so you can insert or erase at the front with the same API.
- To remove nodes while iterating, keep a `prev` iterator and call `erase_after(prev)`, or use `remove_if`.
- Use cases: intrusive-style free lists, hash bucket chains, very memory-tight node lists. Rare in application code.

#### 6. std::array
- `template<class T, std::size_t N> struct array`: an **aggregate** wrapping `T[N]`. No heap, no pointer: the elements are inside the object, so `sizeof(std::array<int, 4>)` is 16.
- What it adds over a C array:
  - Does not decay to a pointer; can be copied, assigned, compared (`==`, `<`, `<=>` since C++20), and returned by value.
  - `size()`, iterators, `at()` with bounds checking, `fill()`, `swap()`.
  - Usable in `constexpr` code (most members `constexpr` since C++17, all since C++20).
- Initialization follows aggregate rules:
  - `std::array<int, 3> a;` default-initializes: in a function, the ints hold **indeterminate** values.
  - `std::array<int, 3> a{};` zero-initializes. `std::array<int, 3> a{1};` gives `1, 0, 0`.
- `std::to_array` (C++20) deduces N from a C array or a braced list: `auto a = std::to_array({1, 2, 3});`. CTAD also works: `std::array a{1, 2, 3};` (C++17).
- `swap` is O(N): elements are exchanged one by one; iterators keep pointing into the same array (topic 06).
- `std::array<T, 0>` is allowed: `begin() == end()`, and `front()`/`back()` are UB.
- Large `std::array` locals live on the stack; a 1 MB array in a function risks stack overflow.

#### 7. Container adaptors
| Adaptor | Default container | Required operations | Interface |
|---|---|---|---|
| `std::stack<T, C>` | `deque<T>` | `back`, `push_back`, `pop_back` | `push`, `pop`, `top` |
| `std::queue<T, C>` | `deque<T>` | `front`, `back`, `push_back`, `pop_front` | `push`, `pop`, `front`, `back` |
| `std::priority_queue<T, C, Cmp>` | `vector<T>`, `std::less<T>` | random access iterators, `front`, `push_back`, `pop_back` | `push`, `pop`, `top` |
- No iterators: you cannot loop over an adaptor. If you need to, use the underlying container directly.
- `pop()` returns `void`. Reason: returning the removed element by value could throw while copying it, after the element was already removed, losing it. Read `top()`/`front()`, then `pop()`.
- `stack<int, std::vector<int>>` works (vector has `push_back`/`pop_back`). `queue<int, std::vector<int>>` compiles until you call `pop()`, which needs `pop_front`.
- `priority_queue`:
  - A binary heap stored in the vector (`std::push_heap`/`std::pop_heap`): `push` and `pop` are O(log n), `top` O(1).
  - With `std::less` (default), `top()` is the **largest** element: a max-heap. The comparator means "lower priority than", so `std::greater<T>` gives a min-heap.
  - Not stable: equal-priority elements come out in unspecified order. Add a sequence number to the key for FIFO among equals.
  - `top()` returns `const T&`: you cannot move out of it without a `const_cast` trick; no decrease-key operation.
  - The underlying container is the protected member `c`, reachable from a derived class.
- C++23 adds iterator-pair and range constructors to `stack` and `queue`.

#### 8. Choosing a sequence container
| Need | Choose | Why |
|---|---|---|
| General purpose, iteration, random access | `vector` | Contiguous, cache friendly, smallest overhead |
| Size fixed at compile time | `array` | No heap, constexpr friendly |
| Bounded size, no heap, size varies | `inplace_vector` (C++26) or a fixed-capacity vector type | Storage inside the object |
| Push/pop at both ends, indexing | `deque` | O(1) at ends, no element moves |
| FIFO queue of unknown length | `queue` over `deque`, or a ring buffer | Ring buffer if bounded and latency matters |
| Stable addresses with indexing | `deque` (ends only) or `vector<unique_ptr<T>>` | Elements never move |
| O(1) insert/erase/splice at known positions, iterators must survive | `list` | Node based |
| Minimal memory node list | `forward_list` | One pointer per node |
| Top-k, scheduling by priority | `priority_queue` | Binary heap |
- For small and medium N, a vector with an O(n) shift usually beats a list with an O(1) relink, because the shift is a sequential `memmove` and the list walk is a chain of cache misses.
- Measure before choosing a node container for speed; choose it for semantics (stable iterators, splice).

#### 9. Newer containers (C++23/26 notes)
- `std::inplace_vector<T, N>` (C++26): vector interface, capacity N fixed, storage inside the object.
  - `push_back` on a full container throws `std::bad_alloc`; `try_push_back` returns a null pointer instead; `unchecked_push_back` makes it a precondition.
  - Not in GCC 14's library yet; similar types exist in many code bases as `static_vector` or `fixed_vector`.
- `std::hive` (C++26, P0447): a bucket-based container with stable element addresses, O(1) insert and erase, and skipping of erased slots during iteration. Useful for object pools; standard library support is still arriving (not in GCC 14), and the reference implementation is the `plf::colony`/`plf::hive` library.
- `std::flat_map`/`flat_set` (C++23) are adaptors over sorted sequences; they belong to the associative family (topic 08).

#### 10. Misconceptions to unlearn
- ❌ "deque is a vector that can also grow at the front." ✅ It is a block map: not contiguous, no `data()`, no `reserve()`, bigger fixed cost.
- ❌ "deque blocks have varying sizes." ✅ In real implementations they are fixed per element type (libstdc++: 512 bytes), which is what makes indexing O(1).
- ❌ "deque push_back may invalidate references like vector." ✅ References never move on end insertion; only iterators are invalidated.
- ❌ "list insertion is O(1), so list beats vector for inserts." ✅ Only with an iterator in hand, and the traversal to find it dominates.
- ❌ "`list::size()` is O(n)." ✅ O(1) since C++11.
- ❌ "`std::sort` works on any container." ✅ It needs random access iterators; use `list::sort`.
- ❌ "`std::array<int, 3> a;` is zero-filled." ✅ Only `a{}` is; plain `a` in a function is indeterminate.
- ❌ "`priority_queue` with `std::greater` is a max-heap." ✅ It is a min-heap; the default `less` gives a max-heap.
- ❌ "`queue::pop()` returns the element." ✅ It returns `void`; read `front()` first.

### EDGE_CASES: Traps and Misconceptions

#### Edge Case 1: deque is random access but not contiguous
- `&d[0] + k` is only valid inside the first block. Code that treats a deque like an array (passing `&d[0]` and `d.size()` to a C function or `memcpy`) reads across block boundaries into unrelated memory.
```cpp
#include <deque>
#include <iostream>

int main() {
    std::deque<int> d(300);
    int breaks = 0;
    for (std::size_t i = 1; i < d.size(); ++i)
        if (&d[i] != &d[i - 1] + 1) ++breaks;     // next element not adjacent
    std::cout << "block boundaries: " << breaks << '\n';
}
```
- Output (libstdc++, x86-64): `block boundaries: 2` (300 ints over 3 blocks of 128).
- If you need a contiguous view, copy into a vector, or use a vector from the start.

#### Edge Case 2: The fixed cost of an empty deque
- libstdc++: `sizeof(std::deque<int>)` is 80 bytes and a default-constructed deque performs 2 allocations (the map and one block, 512 bytes).
- So `std::vector<std::deque<int>> per_key(100000);` costs over 50 MB before anything is stored. A `vector` (24 bytes, no allocation while empty) is far cheaper for many small sequences.
- Also: an implementation is allowed to throw from the default constructor of a deque (it allocates); `std::vector`'s default constructor is `noexcept`.

#### Edge Case 3: list::insert inserts before the iterator
- `l.insert(it, x)` places `x` **before** `*it` and returns an iterator to `x`. `it` itself is unchanged and still refers to the same element.
- People who expect "insert after" get an off-by-one; to insert after, use `l.insert(std::next(it), x)`.
- `forward_list` is the opposite: it only offers `insert_after`.

#### Edge Case 4: Generic algorithms on a list
- `std::sort(l.begin(), l.end())` does not compile (needs random access): use `l.sort()`.
- `std::remove_if` on a list compiles but moves values around instead of unlinking nodes, and the list size is unchanged until you `erase`. `l.remove_if(pred)` unlinks and is what you want.
- `std::binary_search` and `std::lower_bound` on a list compile and are correct, but each step walks the list: O(n) traversal for O(log n) comparisons.

#### Edge Case 5: Splice moves iterators to another container
- After `b.splice(b.end(), a, it)`, `it` is valid but belongs to `b`. Calling `a.erase(it)` is UB (wrong container); debug mode reports it.
- Splicing a range from a different list is O(n) because both sizes must be updated; whole-list and single-element splices are O(1).
- Splicing between lists with unequal allocators is UB.

#### Edge Case 6: forward_list has no size() and works "after"
- `fl.size()` does not compile; `std::distance(fl.begin(), fl.end())` is O(n).
- `erase_after(pos)` erases the element **after** `pos`. To erase the first element, use `erase_after(fl.before_begin())` or `pop_front()`.
- `before_begin()` must not be dereferenced; it exists only as an argument for the `_after` functions.

#### Edge Case 7: std::array and initialization
- `std::array<int, 4> a;` inside a function holds indeterminate values; reading them is UB. Write `std::array<int, 4> a{};`.
- `std::array<std::string, 4> s;` is fine: class types are default-constructed.
- `std::array<int, 3> a = {1, 2, 3, 4};` does not compile (too many initializers); `{1, 2}` compiles and zero-fills the rest.
- `a[5]` is UB without a check; `a.at(5)` throws `std::out_of_range`.

#### Edge Case 8: priority_queue order and comparator direction
- `std::priority_queue<int>` returns the largest first. Many people write `std::greater<int>` expecting "greater first" and get the smallest first.
- The comparator answers "is a lower priority than b?". The element for which no other element compares greater ends up on `top()`.
- For a custom comparator on events, "earliest time first" therefore needs `a.time > b.time`.
- `top()` and `pop()` on an empty `priority_queue` are UB, not exceptions.

#### Edge Case 9: queue over vector fails only when you pop
- `std::queue<int, std::vector<int>> q; q.push(1);` compiles: member functions of a class template are instantiated only when used.
- `q.pop();` then fails: "'class std::vector<int>' has no member named 'pop_front'".
- `std::stack<int, std::vector<int>>` is fully valid and avoids the deque's fixed cost.

### CODE_EXAMPLES: Practical Demonstrations

#### Example 1: Looking at deque blocks
- Count distinct blocks by checking address adjacency; compare with `int` and a large element type.
```cpp
#include <deque>
#include <iostream>

template <class T>
int count_blocks(const std::deque<T>& d) {
    int blocks = d.empty() ? 0 : 1;
    for (std::size_t i = 1; i < d.size(); ++i)
        if (&d[i] != &d[i - 1] + 1) ++blocks;
    return blocks;
}

struct Big { char bytes[600]; };

int main() {
    std::deque<int> di(1000);
    std::deque<Big> db(10);
    std::cout << "1000 ints:  " << count_blocks(di) << " blocks\n";
    std::cout << "10 Big:     " << count_blocks(db) << " blocks\n";
    std::cout << "sizeof(deque<int>) = " << sizeof(di) << '\n';
}
```
- Output (libstdc++, x86-64):
```
1000 ints:  8 blocks
10 Big:     10 blocks
sizeof(deque<int>) = 80
```
- 1000 / 128 rounds up to 8 blocks. `Big` is larger than 512 bytes, so libstdc++ puts one element per block: a deque of large objects is effectively an array of pointers to individually allocated objects.

#### Example 2: deque references survive growth at both ends
- Hold references while pushing thousands of elements at both ends; compare with a vector.
```cpp
#include <deque>
#include <iostream>
#include <vector>

int main() {
    std::deque<int> d{1, 2, 3};
    int& first = d[0];
    int* last = &d[2];
    for (int i = 0; i < 5000; ++i) {
        d.push_back(i);
        d.push_front(-i);
    }
    std::cout << first << ' ' << *last << ' ' << d.size() << '\n';

    std::vector<int> v{1, 2, 3};
    const int* old_data = v.data();
    for (int i = 0; i < 5000; ++i) v.push_back(i);
    std::cout << std::boolalpha << "vector buffer moved: " << (v.data() != old_data) << '\n';
}
```
- Output:
```
1 3 10003
vector buffer moved: true
```
- `first` and `last` stay valid by guarantee. Any deque iterator taken before the loop would be invalid.

#### Example 3: LRU cache with list::splice
- The classic use of `list`: O(1) "move to front" via `splice`, with iterators stored in a map staying valid.
```cpp
#include <iostream>
#include <list>
#include <string>
#include <unordered_map>

class LruCache {
    std::size_t cap_;
    std::list<std::pair<int, std::string>> items_;   // front = most recent
    std::unordered_map<int, decltype(items_)::iterator> index_;
public:
    explicit LruCache(std::size_t cap) : cap_(cap) {}
    const std::string* get(int key) {
        auto it = index_.find(key);
        if (it == index_.end()) return nullptr;
        items_.splice(items_.begin(), items_, it->second);   // O(1), iterator stays valid
        return &it->second->second;
    }
    void put(int key, std::string value) {
        if (auto it = index_.find(key); it != index_.end()) {
            it->second->second = std::move(value);
            items_.splice(items_.begin(), items_, it->second);
            return;
        }
        if (items_.size() == cap_) {
            index_.erase(items_.back().first);
            items_.pop_back();
        }
        items_.emplace_front(key, std::move(value));
        index_[key] = items_.begin();
    }
};

int main() {
    LruCache cache(2);
    cache.put(1, "one");
    cache.put(2, "two");
    cache.get(1);                 // 1 becomes most recent
    cache.put(3, "three");        // evicts 2
    std::cout << (cache.get(2) ? "hit" : "miss") << ' '
              << *cache.get(1) << ' ' << *cache.get(3) << '\n';
}
```
- Output: `miss one three`.
- This works only because `list` iterators survive every splice and every other insert or erase. A vector of entries would invalidate the stored iterators.

#### Example 4: list member algorithms
- `sort`, `unique`, `merge` and `remove_if` relink nodes; references stay valid.
```cpp
#include <iostream>
#include <list>

void print(const char* label, const std::list<int>& l) {
    std::cout << label;
    for (int x : l) std::cout << ' ' << x;
    std::cout << '\n';
}

int main() {
    std::list<int> a{5, 1, 4, 1, 5, 9, 2, 6};
    int& nine = *std::next(a.begin(), 5);
    a.sort();
    print("sorted:", a);
    a.unique();                                   // removes consecutive duplicates
    print("unique:", a);
    std::list<int> b{3, 7, 8};
    a.merge(b);                                   // both sorted; b becomes empty
    print("merged:", a);
    auto n = a.remove_if([](int x) { return x % 2 == 0; });   // C++20: returns count
    print("odd:", a);
    std::cout << "removed " << n << ", b.size() " << b.size()
              << ", nine still " << nine << '\n';
}
```
- Output:
```
sorted: 1 1 2 4 5 5 6 9
unique: 1 2 4 5 6 9
merged: 1 2 3 4 5 6 7 8 9
odd: 1 3 5 7 9
removed 4, b.size() 0, nine still 9
```

#### Example 5: forward_list: working "after" a position
- Remove matching nodes with a trailing `prev`, and insert at the front through `before_begin()`.
```cpp
#include <forward_list>
#include <iostream>
#include <iterator>

int main() {
    std::forward_list<int> fl{1, 2, 3, 4, 5, 6};
    auto prev = fl.before_begin();
    for (auto it = fl.begin(); it != fl.end(); ) {
        if (*it % 3 == 0) {
            it = fl.erase_after(prev);      // erase the node after prev
        } else {
            prev = it;
            ++it;
        }
    }
    fl.insert_after(fl.before_begin(), 0);  // same API for the front
    for (int x : fl) std::cout << x << ' ';
    std::cout << "| count " << std::distance(fl.begin(), fl.end())
              << " | sizeof " << sizeof(fl) << '\n';
}
```
- Output (`sizeof` is libstdc++, x86-64): `0 1 2 4 5 | count 5 | sizeof 8`.

#### Example 6: std::array as a value type and at compile time
- Copy, compare, deduce, check bounds, and build a lookup table in `constexpr`.
```cpp
#include <array>
#include <iostream>
#include <stdexcept>

constexpr std::array<int, 8> make_squares() {
    std::array<int, 8> t{};
    for (std::size_t i = 0; i < t.size(); ++i) t[i] = static_cast<int>(i * i);
    return t;
}

int main() {
    constexpr auto squares = make_squares();
    static_assert(squares[7] == 49);

    auto a = std::to_array({3, 1, 2});        // std::array<int, 3>
    auto b = a;                               // real copy, unlike C arrays
    b[0] = 9;
    auto [x, y, z] = a;                       // structured bindings
    std::cout << x << y << z << ' ' << std::boolalpha << (a < b) << ' '
              << sizeof(a) << '\n';
    try {
        a.at(3) = 1;
    } catch (const std::out_of_range&) {
        std::cout << "at(3) throws\n";
    }
}
```
- Output:
```
312 true 12
at(3) throws
```

#### Example 7: priority_queue as an event scheduler
- Earliest timestamp first, FIFO among equal timestamps through a sequence number.
```cpp
#include <iostream>
#include <queue>
#include <string>
#include <vector>

struct Event {
    long time;
    long seq;              // tie-breaker: insertion order
    std::string name;
};

struct Later {             // "a has lower priority than b"
    bool operator()(const Event& a, const Event& b) const {
        if (a.time != b.time) return a.time > b.time;
        return a.seq > b.seq;
    }
};

int main() {
    std::priority_queue<Event, std::vector<Event>, Later> pq;
    long seq = 0;
    pq.push({30, seq++, "timeout"});
    pq.push({10, seq++, "request A"});
    pq.push({10, seq++, "request B"});
    pq.push({20, seq++, "heartbeat"});
    while (!pq.empty()) {
        const Event& e = pq.top();
        std::cout << e.time << ' ' << e.name << '\n';
        pq.pop();          // pop() returns void: read top() first
    }
}
```
- Output:
```
10 request A
10 request B
20 heartbeat
30 timeout
```
- Without `seq`, "request A" and "request B" could come out in either order: `priority_queue` is not stable.

### QUICK_REFERENCE: Cheat Sheet

#### Complexity
| Operation | vector | deque | list | forward_list | array |
|---|---|---|---|---|---|
| `c[i]` | O(1) | O(1) | n/a | n/a | O(1) |
| push/pop back | O(1) amortized | O(1) | O(1) | n/a | n/a |
| push/pop front | O(n) | O(1) | O(1) | O(1) | n/a |
| insert/erase middle (at iterator) | O(n) | O(min(i, n - i)) | O(1) | O(1) (`_after`) | n/a |
| `size()` | O(1) | O(1) | O(1) (C++11) | not provided | O(1), constexpr |
| Contiguous | yes | no | no | no | yes |
| Iterator category | contiguous | random access | bidirectional | forward | contiguous |

#### Implementation facts (libstdc++ / GCC, x86-64; not guaranteed)
| Fact | Value |
|---|---|
| deque block size | 512 bytes (128 `int`, 16 `std::string`); 1 element if `sizeof(T) >= 512` |
| `sizeof(std::deque<int>)` | 80 bytes; empty deque allocates map + 1 block |
| `sizeof(std::list<int>)` | 24 bytes; node 24 bytes |
| `sizeof(std::forward_list<int>)` | 8 bytes; node 16 bytes |
| `sizeof(std::priority_queue<int>)` | 32 bytes (vector + empty comparator, padded) |

#### Adaptor rules
| Rule | Detail |
|---|---|
| `pop()` return type | `void` (exception safety); read `top()`/`front()` first |
| Default containers | `stack`, `queue`: deque; `priority_queue`: vector |
| Default `priority_queue` | max-heap (`std::less`); `std::greater` = min-heap |
| Stability | `priority_queue` is not stable; add a sequence number |
| Iteration | Not supported; adaptors hide the container |

#### Interview one-liners
| Question | Answer |
|---|---|
| Is deque contiguous? | No: blocks plus a map; each block is contiguous |
| Why is `d[i]` O(1)? | Fixed block size: index math is division and modulo |
| deque push_back: refs? iterators? | Refs valid; iterators invalid |
| Empty deque cost? | libstdc++: 80 bytes plus two allocations |
| `list::insert(it, x)`? | Inserts before `it`; `it` still points to the same element |
| `list::size()`? | O(1) since C++11 |
| Sort a list? | `l.sort()`; `std::sort` needs random access |
| splice cost? | O(1), except a range from another list: O(range) |
| forward_list size? | No `size()`; use `std::distance` (O(n)) |
| `std::array<int, 3> a;` values? | Indeterminate; use `a{}` |
| Min-heap? | `std::priority_queue<T, std::vector<T>, std::greater<T>>` |
| Why does `pop()` return void? | Returning by value could throw after removal and lose the element |
| list vs vector for inserts? | vector usually wins for small/medium N: memmove beats pointer chasing |
