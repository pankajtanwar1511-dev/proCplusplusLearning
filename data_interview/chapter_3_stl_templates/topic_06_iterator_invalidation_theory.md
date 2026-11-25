## TOPIC: Iterators and Invalidation Rules

### THEORY_SECTION: Core Concepts

#### 1. Mental model
- An iterator is a **position** inside a container, generalized from a pointer: `*it` reads the element, `++it` moves to the next position.
- Every range is **half-open**: `[begin, end)`. `end()` is one past the last element; it is a valid iterator but it is **not dereferenceable**.
- An iterator can be in one of three states:
  - **Dereferenceable**: points at a live element.
  - **Past-the-end**: `end()`; may be compared and decremented (if bidirectional), never dereferenced.
  - **Invalid (singular)**: the container changed in a way that broke it. Using it is undefined behaviour.
- "Invalidated" applies to three different handles, and the rules differ per handle:
  - **Iterators** (including `end()`).
  - **Pointers** to elements (`&v[2]`).
  - **References** to elements (`int& r = v[2]`).
- An iterator becomes invalid for one of three reasons:
  - **Storage moved**: the elements were copied or moved to a new buffer (vector or string reallocation).
  - **Position shifted**: the element at that position is now a different element (vector insert or erase without reallocation).
  - **Bookkeeping changed**: the element did not move, but the iterator's internal data did (deque block map, unordered bucket array).
- The rule that keeps you safe: **a mutating call can invalidate; check the rule for that container and that operation**. "It still prints the right value" proves nothing.

#### 2. What you may and may not do with an invalid iterator
- Allowed: assign a new value to it, or destroy it.
- Undefined behaviour: dereference, increment, decrement, **and even compare** it (`it == v.end()` on an invalid `it` is UB).
- Invalid does not mean "points to freed memory":
  - After a vector insert without reallocation, a stale pointer still points into live storage, but at a different element.
  - The standard still calls it invalid, so the program has no defined meaning. Treat "address unchanged" as an observation, not a guarantee.
- Pointers and references follow the same logic: after the invalidating operation they must not be read.

#### 3. Iterator categories
| Category | Adds | Containers / sources | Example algorithms |
|---|---|---|---|
| Input | single pass read | `istream_iterator` | `std::find`, `std::accumulate` |
| Output | single pass write | `back_inserter`, `ostream_iterator` | `std::copy` destination |
| Forward | multi-pass | `forward_list`, unordered containers | `std::search`, `std::adjacent_find` |
| Bidirectional | `--it` | `list`, `map`, `set` | `std::reverse`, `std::prev` |
| Random access | `it + n`, `it[n]`, `<`, `it2 - it1` in O(1) | `deque` | `std::sort`, `std::nth_element` |
| Contiguous (C++20) | elements adjacent in memory | `vector` (not `vector<bool>`), `array`, `string`, `span`, raw pointers | `std::to_address(it)`, `memcpy` |
- Each category is a superset of the previous one; an algorithm states the weakest category it needs.
- `std::sort` needs random access, so `std::sort(l.begin(), l.end())` on a `std::list` does not compile. Use `l.sort()`.
- C++20 expresses the categories as concepts (`std::random_access_iterator<It>`, `std::contiguous_iterator<It>`), so generic code can constrain on them instead of relying on tag dispatch.
- `deque` is random access but **not** contiguous: O(1) indexing does not imply adjacent storage (see topic 07).
- `it + 2` moves by **elements**, not bytes; `it[1]` is `*(it + 1)`.

#### 4. advance, next, prev, distance
| Operation | Random access | Bidirectional / forward |
|---|---|---|
| `std::advance(it, n)` | O(1) | O(n) |
| `std::next(it, n)` / `std::prev(it, n)` | O(1) | O(n) (prev needs bidirectional) |
| `std::distance(first, last)` | O(1) | O(n) |
| `it += n`, `it + n` | O(1) | does not compile |
- `std::advance` modifies its argument and returns `void`; `std::next` returns a copy. Prefer `std::next` in expressions.
- Advancing past `end()` is UB; none of these functions checks bounds.
- `std::ranges::next(it, n, bound)` (C++20) stops at `bound` instead of running off the end.
- Interview point: generic code that uses `std::advance` compiles for a `list`, but silently turns O(1) into O(n). Constrain the template with the category it really needs.

#### 5. const_iterator versus const iterator
| Declaration | `*it = x` | `++it` |
|---|---|---|
| `std::vector<int>::iterator it` | ✅ | ✅ |
| `const std::vector<int>::iterator it` | ✅ (the iterator is const, not the element) | ❌ |
| `std::vector<int>::const_iterator it` | ❌ | ✅ |
| `const std::vector<int>::const_iterator it` | ❌ | ❌ |
- Same rule as `int* const p` versus `const int* p`.
- `cbegin()`/`cend()` (C++11) give `const_iterator` even on a non-const container.
- `iterator` converts implicitly to `const_iterator`, not the other way.
- Since C++11, `insert` and `erase` accept `const_iterator` positions, so read-only code can still hold the position it later erases.

#### 6. The invalidation table (the core of the topic)
| Container | Insert | Erase | Other |
|---|---|---|---|
| `vector` | Reallocation: **all**. Otherwise: everything **at or after** the insertion point, including `end()` | Everything **at or after** the erased element, including `end()` | `reserve(n)`: all if `n > capacity()`, none otherwise. `clear()`, assignment: all. `pop_back`: erased element and `end()` |
| `string` | Same as vector, plus: any non-const member call except `operator[]`, `at`, `data`, `front`, `back`, `begin`, `end` (and `r` variants) **may** invalidate | Same | `swap` of strings **may** invalidate (SSO buffer lives inside the object); see topic 01 |
| `deque` | At either end: **all iterators**, **no** references or pointers. In the middle: **all** iterators, references, pointers | First or last element: only the erased elements (plus `end()` when erasing the last). In the middle: **all** | `shrink_to_fit`: all |
| `list`, `forward_list` | **None** | Only the erased elements | `splice`, `sort`, `merge`, `reverse`: none (spliced iterators now belong to the destination list) |
| `map`, `set`, `multimap`, `multiset` | **None** | Only the erased elements | `extract`: only the extracted element's iterators |
| `unordered_*` | If it causes a rehash: **all iterators**, **no** references or pointers. Otherwise none | Only the erased elements | `rehash`/`reserve`: all iterators. Details in topic 09 |
| `array` | n/a | n/a | Never invalidated while the array lives |
- Three groups to remember:
  - **Contiguous** (`vector`, `string`): elements move, so the rules depend on capacity and position.
  - **Node-based** (`list`, `forward_list`, ordered and unordered associative): elements never move; only the erased element dies.
  - **Mixed** (`deque`, unordered rehash): elements never move at the ends, but iterators carry bookkeeping that can be rebuilt.
- `swap` on any container except `string` and `array`: no element handle is invalidated; iterators keep pointing to the same elements, which now live in the **other** container. The `end()` iterator may be invalidated.
- Moving a container (`std::vector<int> b = std::move(a);`): in practice the buffer or nodes are stolen, so iterators into `a` now refer to elements of `b`.
  - An explicit guarantee (move construction, and move assignment when the allocator propagates; never for `array`) is proposed in LWG 2321, which is still an **open** issue. Today it rests on the general [container.reqmts] wording and on what every implementation does.
  - `std::string` is not covered: a short (SSO) string is copied on move, so its iterators do not follow.

#### 7. vector rules in detail
- Reallocation (new size > capacity): every iterator, pointer and reference is invalid; the old buffer is freed.
- `push_back` / `emplace_back` without reallocation:
  - All iterators, pointers and references **to elements** stay valid.
  - **Only `end()`** is invalidated: it used to be past-the-end, now it would point at the new element.
- `insert(pos, x)` without reallocation:
  - Elements before `pos`: valid.
  - Elements at and after `pos`: invalid. The memory is still there, but every element shifted one slot right, so a stale pointer now reads the element that used to be before it.
- `erase(pos)`: elements after `pos` shift left; everything at or after `pos` (including `end()`) is invalid. `capacity()` does not change.
- `erase` returns an iterator to the element that followed the erased one (or `end()`); `insert` returns an iterator to the inserted element. Always continue from the returned iterator.
- Growth policy, `reserve` and `emplace` are topic 05; this topic only states what they invalidate.

#### 8. Safe patterns for erasing while iterating
| Pattern | Use when | Complexity (vector) |
|---|---|---|
| `std::erase_if(v, pred)` (C++20) | Remove all elements matching a predicate | O(n) |
| `v.erase(std::remove_if(...), v.end())` | Same, before C++20 | O(n) |
| `it = c.erase(it); else ++it;` | Node containers, or you need side effects per erased element | vector: O(n) per erase, O(n²) total |
| Iterate by index backwards | Removing from a vector with simple index logic | O(n) per erase |
| Collect keys, erase after the loop | The loop body calls code that might also modify the container | depends |
- The canonical loop:
```cpp
#include <iostream>
#include <list>

int main() {
    std::list<int> l{1, 2, 3, 4, 5, 6};
    for (auto it = l.begin(); it != l.end(); ) {
        if (*it % 2 == 0)
            it = l.erase(it);   // erase returns the next element
        else
            ++it;               // advance only when nothing was erased
    }
    for (int x : l) std::cout << x << ' ';
    std::cout << '\n';          // 1 3 5
}
```
- Two classic bugs: `l.erase(it); ++it;` (increments an invalid iterator) and `it = l.erase(it);` followed by the loop's own `++it` (skips the next element, and runs past `end()` if the erased element was the last).
- `std::remove_if` does not shrink the container: it moves the kept elements to the front and returns the new logical end; the tail holds valid but unspecified values until `erase` removes them.

#### 9. Range-for hides two iterators
- `for (auto& x : v) body;` is defined as:
```cpp
#include <vector>

int main() {
    std::vector<int> v{1, 2, 3};
    {
        auto&& range = v;
        auto first = range.begin();
        auto last = range.end();         // computed ONCE, before the first iteration
        for (; first != last; ++first) {
            auto& x = *first;
            x *= 2;                      // body
        }
    }
}
```
- Any body statement that invalidates `first` or `last` is UB: `push_back`, `insert`, `erase`, `clear` on the same container.
- Even when a `reserve` prevents reallocation, `last` is the stale old `end()`, so the code is still UB.
- Rule: never change the size of the container you are range-for looping over. Use an index loop or build a separate container.

#### 10. reverse_iterator and base()
- `std::reverse_iterator` stores a forward iterator `base()` that points **one past** the element it refers to: `*rit` is `*std::prev(rit.base())`.
- This is why `rbegin().base() == end()` and `rend().base() == begin()`, and why reverse ranges need no "before begin" position.
- Erasing through a reverse iterator: `v.erase(std::next(rit).base())`. Passing `rit.base()` directly erases the **next** element in forward order (off by one).
- To keep iterating in reverse after the erase: `rit = std::reverse_iterator(v.erase(std::next(rit).base()));`.

#### 11. Tools that catch invalid iterators
| Tool | Catches | Misses |
|---|---|---|
| `-D_GLIBCXX_DEBUG` (libstdc++ debug mode) | Dereferencing, incrementing or comparing singular iterators; iterators from the wrong container; invalid ranges | Stale old `end()` after `push_back` without reallocation (not flagged in GCC 11). Changes the ABI: build every translation unit with it |
| `-D_GLIBCXX_ASSERTIONS` | Cheap precondition checks: `operator[]` out of range, `front()` on empty | Does not track iterator validity at all |
| `-fsanitize=address` | Use after reallocation (heap-use-after-free), out-of-bounds | Insert or erase without reallocation (memory still valid) |
| ASan + `-D_GLIBCXX_SANITIZE_VECTOR` | Reads between `size()` and `capacity()` (container-overflow) | Shifted elements |
- Debug mode is slow (iterators keep a link to their container); run it in tests and CI, not in production builds.

#### 12. Misconceptions to unlearn
- ❌ "If there is no reallocation, all iterators stay valid." ✅ Insert and erase still invalidate everything at or after the position, and `push_back` invalidates `end()`.
- ❌ "The pointer still points into allocated memory, so it is valid." ✅ Validity is defined by the operation, not by the address. After a shifting insert it reads a different element.
- ❌ "Comparing an invalid iterator with `end()` is harmless." ✅ Any use other than assignment or destruction is UB.
- ❌ "`deque::pop_front()` invalidates all iterators because the structure changed." ✅ Erasing at either end invalidates only the erased element (and `end()` for `pop_back`).
- ❌ "deque `push_back` keeps iterators valid, like references." ✅ References and pointers survive; iterators do not.
- ❌ "Erasing from a `std::map` invalidates the iterators after it." ✅ Only the erased node's iterators die.
- ❌ "unordered_map rehash invalidates references." ✅ Only iterators; nodes do not move.
- ❌ "`std::advance(it, n)` is O(1)." ✅ Only for random access iterators.
- ❌ "`const iterator` means read-only access." ✅ That is `const_iterator`; a `const iterator` cannot move but can still write.
- ❌ "ASan will catch any stale iterator." ✅ It only sees freed or out-of-bounds memory; shifted elements look valid to it.

### EDGE_CASES: Traps and Misconceptions

#### Edge Case 1: Insert without reallocation still breaks positions at and after the insert
- With spare capacity, `v.insert(v.begin(), 0)` does not reallocate, so the buffer address is unchanged.
- Every element shifts right by one slot. A pointer that pointed at `v[2]` still points at slot 2, which now holds the old `v[1]`.
- Formally, that pointer (and iterators at or after the insertion point) is invalid; reading it is UB even though ASan stays silent.
```cpp
#include <iostream>
#include <vector>

int main() {
    std::vector<int> v{10, 20, 30, 40};
    v.reserve(10);                   // no reallocation below
    int* before = &v[0];             // before the insertion point: still valid
    int* after = &v[2];              // at/after the insertion point: invalidated
    v.insert(v.begin() + 1, 15);
    std::cout << *before << '\n';    // 10, guaranteed
    std::cout << *after << '\n';     // UB by the standard; prints 20 in practice
}
```
- Output (libstdc++, GCC 11): `10` then `20`. The second line is not a guarantee: the program has UB.

#### Edge Case 2: push_back without reallocation invalidates end()
- People say "no reallocation, nothing is invalidated". The precise rule: element iterators survive, the old `end()` does not.
- A loop written with an `end()` captured before the `push_back` is UB.
- libstdc++ debug mode (GCC 11) does not flag this case, so tests may pass. Re-read `end()` after every size change.

#### Edge Case 3: Comparing an invalid iterator is already UB
- `v.erase(it); if (it != v.end()) ...` is UB at the comparison, before any dereference.
- In debug mode the comparison itself aborts with "attempt to compare a singular iterator". In release builds it usually "works", which hides the bug.

#### Edge Case 4: deque: references survive push_back, iterators do not
- deque keeps elements in fixed blocks and a separate map of block pointers. `push_back` or `push_front` may reallocate the **map**, never the blocks.
- So references and pointers stay valid, while iterators (which hold a pointer into the map) are invalidated.
- `pop_front` and `pop_back` invalidate only the erased element (plus `end()` for `pop_back`): erasing at an end never reallocates the map.
- Middle insert or erase shifts elements: everything is invalidated.
```cpp
#include <deque>
#include <iostream>

int main() {
    std::deque<int> d{10, 20, 30, 40};
    auto it = d.begin() + 1;         // refers to 20
    d.pop_front();                   // erases 10 only
    d.pop_back();                    // erases 40 only (and end())
    std::cout << *it << ' ' << d.front() << '\n';   // 20 20: it is still valid
}
```
- Output: `20 20`. This is guaranteed by `[deque.modifiers]`; a common chatbot answer claims the opposite.

#### Edge Case 5: unordered rehash: iterators die, references live
- An insert that pushes the load factor over `max_load_factor()` triggers a rehash.
- Rehash rebuilds the bucket array and relinks nodes; nodes do not move. So pointers and references stay valid, iterators do not, and iteration order changes.
- Rule of thumb: never insert into an unordered container while iterating it. Bucket mechanics are topic 09.

#### Edge Case 6: swap keeps iterators, but they move to the other container
- After `a.swap(b)`, an iterator taken from `a` still refers to the same element, which now belongs to `b`. Comparing it with `a.end()` is meaningless.
- Exceptions:
  - `std::string`: swap may invalidate (short strings live inside the object, so they really are copied).
  - `std::array`: swap exchanges the values element by element; an iterator still points into the same array and now sees the other array's old value.
  - `end()` iterators may be invalidated by swap for any container.

#### Edge Case 7: Range-for plus push_back
- `for (int x : v) v.push_back(x);` looks like "duplicate the vector".
- The hidden `last` iterator is the old `end()`. On reallocation, `first` points into freed memory: ASan reports heap-use-after-free.
- With enough capacity reserved, it often appears to work, but the cached `end()` is invalid, so it is still UB.
- Fix: `v.insert(v.end(), v.begin(), v.end())` is also wrong (source range aliases the destination and is invalidated). Copy first, or index: `auto n = v.size(); for (std::size_t i = 0; i < n; ++i) v.push_back(v[i]);` (topic 05 explains why `push_back(v[i])` itself is safe).

#### Edge Case 8: reverse_iterator base() is off by one
- `rit.base()` points to the element **after** `*rit` in forward order.
- `v.erase(rit.base())` therefore erases the wrong element, and if `rit == v.rbegin()` it passes `end()` to `erase`, which is UB.
- Correct: `v.erase(std::next(rit).base())`.

#### Edge Case 9: Views dangle exactly like iterators
- `std::span<int>`, `std::string_view` and C++20 range views hold pointers or iterators internally.
- They follow the same invalidation rules as the container's iterators: a `span` over a vector dangles after a reallocation, a `string_view` over a string dangles after a growing append (topic 02).

### CODE_EXAMPLES: Practical Demonstrations

#### Example 1: Three ways to remove elements correctly
- `std::erase_if` (C++20) for a vector, the erase-remove idiom for older code, and the iterator loop for a node container with per-element work.
```cpp
#include <algorithm>
#include <iostream>
#include <map>
#include <string>
#include <vector>

int main() {
    std::vector<int> a{5, 12, 7, 20, 3, 18};
    auto removed = std::erase_if(a, [](int x) { return x > 10; });   // C++20
    std::cout << "erase_if removed " << removed << ": ";
    for (int x : a) std::cout << x << ' ';
    std::cout << '\n';

    std::vector<int> b{5, 12, 7, 20, 3, 18};
    auto new_end = std::remove_if(b.begin(), b.end(), [](int x) { return x > 10; });
    std::cout << "after remove_if size is still " << b.size() << '\n';
    b.erase(new_end, b.end());                                        // now shrink
    std::cout << "after erase size " << b.size() << '\n';

    std::map<int, std::string> orders{{1, "open"}, {2, "filled"}, {3, "open"}};
    for (auto it = orders.begin(); it != orders.end(); ) {
        if (it->second == "filled") {
            std::cout << "archiving order " << it->first << '\n';     // per-element work
            it = orders.erase(it);
        } else {
            ++it;
        }
    }
    std::cout << "open orders: " << orders.size() << '\n';
}
```
- Output:
```
erase_if removed 3: 5 7 3 
after remove_if size is still 6
after erase size 3
archiving order 2
open orders: 2
```
- `std::erase_if` returns the number of removed elements (C++20). For `map` and other node containers `std::erase_if` also exists and does the iterator loop internally.

#### Example 2: What exactly survives a vector push_back and insert
- Pointers before the insertion point survive; the position at the insertion point now holds a new element.
```cpp
#include <iostream>
#include <vector>

int main() {
    std::vector<int> v{1, 2, 3, 4};
    v.reserve(16);                               // guarantee no reallocation below
    const int* data_before = v.data();

    int* p0 = &v[0];
    v.push_back(5);                              // only end() is invalidated
    std::cout << "p0 still valid: " << *p0 << '\n';

    auto pos = v.insert(v.begin() + 2, 99);      // use the returned iterator
    std::cout << "inserted " << *pos << " at index " << (pos - v.begin()) << '\n';
    std::cout << "same buffer: " << std::boolalpha << (v.data() == data_before) << '\n';
    for (int x : v) std::cout << x << ' ';
    std::cout << '\n';
}
```
- Output:
```
p0 still valid: 1
inserted 99 at index 2
same buffer: true
1 2 99 3 4 5 
```
- `p0` is before the insertion point, so it is valid even after the `insert`. Any pointer taken at index 2 or later before the insert would now be invalid.

#### Example 3: Debug mode catches a stale iterator
- Compile with `g++ -std=c++20 -D_GLIBCXX_DEBUG`. The same program without the macro prints garbage or "works".
```cpp
#include <iostream>
#include <vector>

int main() {
    std::vector<int> v{1, 2, 3, 4, 5};
    auto it = v.begin() + 3;            // refers to 4
    v.erase(v.begin());                 // it is now invalid (at/after the erase point)
    std::cerr << "about to use stale iterator\n";
    std::cout << *it << '\n';           // debug mode aborts here
}
```
- Output with `-D_GLIBCXX_DEBUG` (GCC 11, abridged):
```
about to use stale iterator
Error: attempt to dereference a singular iterator.
```
- Then the program aborts. Without the macro it prints `5` (the element that shifted into that slot), and ASan reports nothing because the memory is still owned by the vector.

#### Example 4: Node containers: iterators survive other inserts and erases, splice moves them
- `list` and `map` iterators stay valid through unrelated modifications; `splice` relinks nodes without copying.
```cpp
#include <iostream>
#include <list>
#include <map>

int main() {
    std::map<int, char> m{{1, 'a'}, {2, 'b'}, {3, 'c'}};
    auto it2 = m.find(2);
    for (int k = 10; k < 1000; ++k) m.emplace(k, 'x');   // many inserts
    m.erase(1);                                          // erase another key
    std::cout << it2->first << it2->second << '\n';      // 2b

    std::list<int> a{1, 2, 3}, b{10, 20};
    auto it = std::next(a.begin());                      // refers to 2
    b.splice(b.end(), a, it);                            // move node 2 into b
    std::cout << *it << " a.size=" << a.size() << " b.size=" << b.size() << '\n';
    std::cout << "it is now b's last: " << std::boolalpha
              << (it == std::prev(b.end())) << '\n';
}
```
- Output:
```
2b
2 a.size=2 b.size=3
it is now b's last: true
```

#### Example 5: Erasing through a reverse iterator
- Find the last occurrence of a value and erase it, using `std::next(rit).base()`.
```cpp
#include <algorithm>
#include <iostream>
#include <iterator>
#include <vector>

int main() {
    std::vector<int> v{7, 1, 7, 2, 7, 3};
    auto rit = std::find(v.rbegin(), v.rend(), 7);   // last 7, index 4
    std::cout << "rit.base() points at " << *rit.base() << '\n';   // 3: one past
    v.erase(std::next(rit).base());                   // erases index 4
    for (int x : v) std::cout << x << ' ';
    std::cout << '\n';
}
```
- Output:
```
rit.base() points at 3
7 1 7 2 3 
```

#### Example 6: Iterator categories as C++20 concepts
- Check categories at compile time and constrain a function to what it needs.
```cpp
#include <array>
#include <deque>
#include <forward_list>
#include <iostream>
#include <iterator>
#include <list>
#include <string>
#include <vector>

template <std::random_access_iterator It>
auto middle(It first, It last) { return first + (last - first) / 2; }   // O(1)

int main() {
    using std::contiguous_iterator, std::random_access_iterator;
    using std::bidirectional_iterator, std::forward_iterator;
    std::cout << std::boolalpha
        << "vector contiguous: " << contiguous_iterator<std::vector<int>::iterator> << '\n'
        << "string contiguous: " << contiguous_iterator<std::string::iterator> << '\n'
        << "array contiguous:  " << contiguous_iterator<std::array<int, 3>::iterator> << '\n'
        << "deque contiguous:  " << contiguous_iterator<std::deque<int>::iterator> << '\n'
        << "deque random:      " << random_access_iterator<std::deque<int>::iterator> << '\n'
        << "list random:       " << random_access_iterator<std::list<int>::iterator> << '\n'
        << "list bidir:        " << bidirectional_iterator<std::list<int>::iterator> << '\n'
        << "fwd_list bidir:    "
        << bidirectional_iterator<std::forward_list<int>::iterator> << '\n'
        << "fwd_list forward:  " << forward_iterator<std::forward_list<int>::iterator> << '\n';

    std::deque<int> d{1, 2, 3, 4, 5};
    std::cout << "middle of deque: " << *middle(d.begin(), d.end()) << '\n';
    // std::list<int> l{1, 2, 3}; middle(l.begin(), l.end());  // error: constraint not satisfied
}
```
- Output:
```
vector contiguous: true
string contiguous: true
array contiguous:  true
deque contiguous:  false
deque random:      true
list random:       false
list bidir:        true
fwd_list bidir:    false
fwd_list forward:  true
middle of deque: 3
```

#### Example 7: Stable handles for elements of a growing container
- When other code keeps a handle to an element while the vector grows, store an index (or a stable key), not a pointer or iterator.
```cpp
#include <cstddef>
#include <iostream>
#include <string>
#include <vector>

struct Order { int id; std::string state; };

int main() {
    std::vector<Order> book;
    book.push_back({1, "new"});
    std::size_t handle = 0;               // index: survives reallocation
    Order* raw = &book[0];                // pointer: may dangle after growth
    (void)raw;
    for (int i = 2; i <= 1000; ++i) book.push_back({i, "new"});   // many reallocations
    book[handle].state = "filled";        // fine
    std::cout << book[handle].id << ' ' << book[handle].state << '\n';
    // raw->state = "filled";             // heap-use-after-free under ASan
}
```
- Output: `1 filled`.
- Index handles break when elements are erased from the middle (indices shift); then use a stable id with a lookup map, a node container, or `std::vector<std::unique_ptr<T>>` (objects stay put even when the vector of pointers reallocates).

### QUICK_REFERENCE: Cheat Sheet

#### Invalidation summary
| Operation | vector / string | deque | list / forward_list | map / set | unordered |
|---|---|---|---|---|---|
| Insert at end, no realloc | `end()` only | all iterators, no refs | none | none | none (no rehash) |
| Insert causing realloc / rehash | all | n/a | n/a | n/a | all iterators, no refs |
| Insert in middle | at/after pos (or all if realloc) | all iterators and refs | none | none | n/a |
| Erase at end | erased + `end()` | erased + `end()` | erased only | erased only | erased only |
| Erase at front | everything (all shift) | erased only | erased only | erased only | erased only |
| Erase in middle | at/after pos | all | erased only | erased only | erased only |
| `clear()` | all | all | all | all | all |
| `swap` | none (string: may) | none (except `end()`) | none | none | none |

#### Safe idioms
| Goal | Code |
|---|---|
| Erase by predicate | `std::erase_if(c, pred);` (C++20, every container except `array`) |
| Erase in a loop | `it = c.erase(it);` else `++it;` |
| Erase via reverse iterator | `c.erase(std::next(rit).base());` |
| Advance generic iterator | `std::next(it, n)`, constrain on `std::random_access_iterator` if O(1) matters |
| Read-only iteration | `cbegin()`, `cend()`, `const auto&` |
| Handle that survives growth | index, stable id, node container, `vector<unique_ptr<T>>` |
| Catch stale iterators in tests | `-D_GLIBCXX_DEBUG` (rules), ASan (freed memory only) |

#### Interview one-liners
| Question | Answer |
|---|---|
| What can you do with an invalid iterator? | Assign to it or destroy it; nothing else (even `==` is UB) |
| vector push_back, no reallocation: what dies? | Only `end()` |
| vector insert, no reallocation: what dies? | Everything at or after the insertion point |
| deque push_back: refs? iterators? | Refs and pointers valid; all iterators invalid |
| deque pop_front: what dies? | Only the erased element |
| list / map erase: what dies? | Only the erased element |
| unordered rehash: what dies? | Iterators; refs and pointers survive |
| Why `it != end()` and not `it < end()`? | `<` exists only for random access; `!=` works for every category |
| `std::advance` on a list? | O(n); `it + n` does not compile |
| `const iterator` vs `const_iterator`? | Fixed position vs read-only element |
| `rit.base()`? | Points one past `*rit` in forward order |
| Does swap invalidate? | No (except string, array values, and `end()`); iterators follow the elements |
| Range-for and push_back? | UB: hidden `begin`/`end` are cached |
