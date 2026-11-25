## TOPIC: Iterators and Invalidation Rules

### INTERVIEW_QA: Interview Questions with Detailed Answers

#### Q1: What does it mean for an iterator to be "invalidated", and what are you still allowed to do with it?
**Difficulty:** #beginner
**Category:** #stl #iterators
**Concepts:** #invalidation #singular_iterator #undefined_behaviour

**Answer:**
An invalidated iterator no longer refers to the element (or position) it used to, because the container changed in a way the rules say breaks it. You may only assign a new value to it or destroy it; dereferencing, incrementing and even comparing it is undefined behaviour.

**Explanation:**
- The same rules apply separately to iterators, pointers and references; each container states which of the three survive each operation.
- Three causes: storage moved (vector reallocation), position shifted (vector insert or erase), bookkeeping rebuilt (deque map, unordered buckets).
- Invalid does not mean "points to freed memory". After an insert without reallocation the address is fine, but it now names a different element.
- ❌ Common wrong answer: "It's invalid only if the memory was freed." The standard defines validity per operation; reading a shifted slot is still UB.
- ✅ What a strong answer adds: even `it == c.end()` on an invalid iterator is UB, and libstdc++ debug mode aborts on that comparison.

**Key takeaway:** Invalid means "no defined meaning", not "no memory"; only assignment and destruction are allowed.

---

#### Q2: `v.push_back(x)` does not reallocate. Which iterators, pointers and references are invalidated?
**Difficulty:** #intermediate
**Category:** #stl #vector
**Concepts:** #push_back #end_iterator #capacity

**Answer:**
Only the past-the-end iterator. Every iterator, pointer and reference to an existing element stays valid. If `push_back` does reallocate, everything is invalidated.

**Explanation:**
- `end()` used to mean "one past the last element"; after the push it would point at the new element, so it is invalid.
- A loop that cached `auto e = v.end();` before the push is UB, even though the buffer did not move.
- You cannot tell from the call site whether reallocation happens unless `size() < capacity()` was true before the call (or you called `reserve`).
- ❌ Common wrong answer: "No reallocation means nothing is invalidated." The old `end()` is the exception people forget.
- ✅ What a strong answer adds: libstdc++ debug mode (GCC 11) does not flag this case, so it slips through tests; re-read `end()` after every size change.

**Key takeaway:** push_back without reallocation kills only `end()`; with reallocation it kills everything.

---

#### Q3: With spare capacity, you insert at the front of a vector. Is a pointer to `v[2]` taken before the insert still valid?
**Difficulty:** #intermediate
**Category:** #stl #vector
**Concepts:** #insert #invalidation #element_shift

**Answer:**
No. Without reallocation, `insert` invalidates every iterator, pointer and reference at or after the insertion point. The pointer still points into the vector's buffer, but slot 2 now holds what used to be `v[1]`.

**Explanation:**
- Elements before the insertion point stay valid; elements at or after it shift right by one.
- In practice the stale pointer reads the neighbouring value, so the bug produces wrong data, not a crash. ASan cannot detect it because the memory is still owned.
- Same for `erase`: everything at or after the erased position is invalid, including `end()`.
- ❌ Common wrong answer: "Valid, the address didn't change." Address stability is not validity.
- ❌ Common wrong answer: "It's invalid because the value changed." Right conclusion, wrong reason: it is invalid because the standard says so for that operation, whatever value it reads.
- ✅ What a strong answer adds: `insert` returns an iterator to the new element; continue from that, not from the old one.

**Key takeaway:** Insert and erase invalidate from the position onwards even when no memory moves.

---

#### Q4: What is the correct way to erase elements from a container while iterating over it?
**Difficulty:** #beginner
**Category:** #stl #iterators
**Concepts:** #erase #erase_if #erase_remove

**Answer:**
Use the iterator returned by `erase`: `if (pred(*it)) it = c.erase(it); else ++it;`. For a vector, prefer `std::erase_if(v, pred)` (C++20) or the erase-remove idiom, which are O(n) instead of O(n²).

**Explanation:**
```cpp
#include <iostream>
#include <vector>

int main() {
    std::vector<int> v{1, 2, 2, 3, 4};
    for (auto it = v.begin(); it != v.end(); ) {
        if (*it % 2 == 0) it = v.erase(it);
        else ++it;
    }
    for (int x : v) std::cout << x << ' ';   // 1 3
    std::cout << '\n';
    std::vector<int> w{1, 2, 2, 3, 4};
    std::erase_if(w, [](int x) { return x % 2 == 0; });
    std::cout << w.size() << '\n';           // 2
}
```
- Bug 1: `c.erase(it); ++it;` increments an invalid iterator (UB).
- Bug 2: `it = c.erase(it);` plus the `for` loop's own `++it`: skips the element after each erased one, and steps past `end()` if the last element was erased.
- Each `vector::erase` shifts the tail, so erasing k elements in a loop costs O(k·n); `erase_if` shifts each kept element once.
- ❌ Common wrong answer: "Erase, then `--it`." Decrementing below `begin()` is UB when the first element is erased.
- ✅ What a strong answer adds: `std::erase_if` (C++20) exists for every standard container except `array`; for `map` and `list` it does the iterator loop for you.

**Key takeaway:** Continue from `erase`'s return value; for vectors, remove in one pass with `erase_if`.

---

#### Q5: Why does `std::remove` not change the container's size? What is in the tail after it?
**Difficulty:** #intermediate
**Category:** #stl #algorithms
**Concepts:** #remove_if #erase_remove_idiom #iterator_abstraction

**Answer:**
Algorithms receive only iterators, not the container, so they cannot call `erase`. `std::remove_if` moves the kept elements to the front and returns the new logical end; the elements after it are in a valid but unspecified state until you `erase` them.

**Explanation:**
- Idiom: `v.erase(std::remove_if(v.begin(), v.end(), pred), v.end());`.
- The tail is not "the removed elements"; it may contain moved-from objects or leftover copies.
- `std::list::remove_if` is a member function that really unlinks nodes (and returns the count since C++20).
- ❌ Common wrong answer: "remove deletes the elements, the size update is lazy." Nothing is deleted; `size()` is unchanged.
- ✅ What a strong answer adds: C++20 `std::erase_if` wraps the idiom and returns the number removed.

**Key takeaway:** Algorithms rearrange; only member functions change size.

---

#### Q6: Is it legal to compare two default-constructed iterators, or iterators from two different containers?
**Difficulty:** #intermediate
**Category:** #stl #iterators
**Concepts:** #singular_iterator #value_initialized_iterator #same_range

**Answer:**
Two value-initialized forward iterators of the same type compare equal (guaranteed since C++14). Comparing a value-initialized iterator with a real one, or iterators from two different containers, is undefined behaviour: `==` is only defined for iterators into the same range.

**Explanation:**
```cpp
#include <iostream>
#include <list>
#include <vector>

int main() {
    std::list<int>::iterator a{}, b{};                  // value-initialized
    std::cout << std::boolalpha << (a == b) << '\n';    // true (C++14)
    std::vector<int> x{1, 2}, y{1, 2};
    // x.begin() == y.begin()   UB: different containers
    // a == std::list<int>{1}.end()   UB: a is not in that range
}
```
- A **singular** iterator is one not associated with any sequence: default-initialized, or invalidated. Only assignment and destruction are allowed on it (Q1); C++14 added the one exception that value-initialized forward iterators compare equal to each other, so they can act as an "empty range" marker.
- Verified with GCC 11: in a normal build the commented lines print `false`, which looks like a sensible answer and hides the bug. With `-D_GLIBCXX_DEBUG` they abort with "attempt to compare iterators from different sequences" and "attempt to compare a singular iterator to a past-the-end iterator".
- The common real-world form is a getter that returns a container by value, called twice: `for (auto it = obj.items().begin(); it != obj.items().end(); ++it)` (practice Q6).
- ❌ Common wrong answer: "Iterators are pointers, so comparing them just compares addresses." For a vector it often does, but the standard gives no meaning to the result, and debug iterators reject it.
- ✅ What a strong answer adds: C++20 ranges make the pairing explicit (`std::ranges::find(r, x)` takes one range, not two iterators), which removes the whole class of bug. For the separate rule that deque end insertion kills iterators but not references, see topic 07.

**Key takeaway:** Compare iterators only within one live range; value-initialized iterators are only comparable with each other.

---

#### Q7: Does `deque::pop_front()` or `pop_back()` invalidate an iterator to an element in the middle?
**Difficulty:** #intermediate
**Category:** #stl #deque
**Concepts:** #pop_front #invalidation #standard_rules

**Answer:**
No. Erasing the first or last element invalidates only iterators and references to the erased element, plus the past-the-end iterator when the last element is erased. An iterator to a surviving middle element stays valid.

**Explanation:**
- Erasing at an end never reallocates the block map, so the asymmetry with `push_back` makes sense: growth may rebuild the map, shrinking does not.
- Verified with `-D_GLIBCXX_DEBUG`: an iterator to the middle dereferences fine after both pops, while an iterator kept across a `push_back` is reported singular.
- Erasing in the middle (`d.erase(d.begin() + 2)`) invalidates all iterators and references.
- ❌ Common wrong answer: "The internal structure may change, so all iterators are potentially invalid." This is a frequent chatbot answer and contradicts `[deque.modifiers]`.
- ✅ What a strong answer adds: the table entry "insert at ends: all iterators; erase at ends: only erased" is a classic asymmetry to recite.

**Key takeaway:** deque pop at either end invalidates only what was popped (and `end()` for `pop_back`).

---

#### Q8: Which operations invalidate iterators in `std::list` and `std::map`?
**Difficulty:** #beginner
**Category:** #stl #node_containers
**Concepts:** #list #map #stable_iterators

**Answer:**
Insertion never invalidates anything. Erase invalidates only the iterators and references to the erased elements. Everything else, including `list::splice`, `sort`, `merge` and `reverse`, keeps all iterators valid.

**Explanation:**
- Each element lives in its own heap node; inserting or erasing relinks pointers but never moves another node.
- After `splice`, iterators to the moved elements remain valid but now belong to the destination list (since C++11).
- `map::extract` invalidates only the extracted element's iterators; pointers and references to it remain valid and work again once the node is inserted into a container (topic 08).
- ❌ Common wrong answer: "Erasing from a map invalidates iterators after the erased key, like a vector." Only the erased node is affected.
- ✅ What a strong answer adds: this stability is often the real reason to pick a node container; it is paid for with one allocation per element and poor cache locality.

**Key takeaway:** Node containers: insert invalidates nothing, erase invalidates only the erased element.

---

#### Q9: What does a rehash of an `unordered_map` invalidate?
**Difficulty:** #intermediate
**Category:** #stl #unordered
**Concepts:** #rehash #iterators #references

**Answer:**
All iterators, but not references or pointers to elements. Nodes are relinked into a new bucket array, they do not move. An insert that does not trigger a rehash invalidates nothing; erase invalidates only the erased element.

**Explanation:**
- A rehash happens when an insert would exceed `max_load_factor() * bucket_count()`, or when you call `rehash`/`reserve`.
- Iteration order can change completely after a rehash.
- Calling `reserve(n)` up front guarantees no rehash while `size()` stays at or below n (n is a total, not "n more"), so iterators survive those inserts.
- ❌ Common wrong answer: "Rehash moves all elements, so references dangle." It moves bucket pointers, not nodes.
- ✅ What a strong answer adds: bucket mechanics and load factor tuning are topic 09; the rule to remember here is "iterators yes, references no".

**Key takeaway:** unordered rehash: iterators invalid, references and pointers valid.

---

#### Q10: Why is `for (auto& x : v) v.push_back(x);` undefined behaviour even if you call `v.reserve(2 * v.size())` first?
**Difficulty:** #intermediate
**Category:** #stl #range_for
**Concepts:** #range_for_desugaring #end_iterator #invalidation

**Answer:**
Range-for evaluates `begin()` and `end()` once, before the first iteration. Without reallocation, `push_back` still invalidates the cached `end()`; with reallocation, it also invalidates the loop iterator and the reference `x`.

**Explanation:**
- Desugared: `auto first = v.begin(); auto last = v.end(); for (; first != last; ++first) { auto& x = *first; ... }`.
- Without `reserve`, ASan reports heap-use-after-free on the first reallocation.
- With `reserve`, it typically "works" (copies the original elements once), which is why the bug survives code review.
- Same problem with `erase` or `clear` inside a range-for.
- ❌ Common wrong answer: "reserve makes it safe." It removes the crash, not the UB.
- ✅ What a strong answer adds: use an index loop bounded by the original size, or build a separate container and append it afterwards.

**Key takeaway:** Never change the size of the container you range-for over.

---

#### Q11: What does "single pass" mean for an input iterator, and what does `std::distance(first, last)` do to an `istream_iterator` range?
**Difficulty:** #intermediate
**Category:** #stl #iterators
**Concepts:** #iterator_categories #input_iterator #istream_iterator

**Answer:**
An input iterator can be read and incremented once: incrementing it (or any copy of it) consumes the underlying source, after which other copies of the old position are no longer usable. `std::distance` on an `istream_iterator` range therefore reads the whole stream; a second algorithm over the same `[first, last)` sees almost nothing.

**Explanation:**
```cpp
#include <iostream>
#include <iterator>
#include <numeric>
#include <sstream>

int main() {
    std::istringstream in("1 2 3 4");
    std::istream_iterator<int> first(in), last;
    auto n = std::distance(first, last);          // consumes the stream
    int sum = std::accumulate(first, last, 0);    // second pass: not allowed
    std::cout << n << ' ' << sum << '\n';         // 4 1
}
```
- Categories, weakest to strongest: input, forward, bidirectional, random access, contiguous (C++20); output iterators are write-only. Forward and above are **multi-pass**: a copy can re-traverse the same elements.
- Why `4 1`: `std::distance` took a copy and read all four ints. `first` still caches the value it read at construction (1), so `accumulate` adds 1, then its `++` hits end of stream and equals `last`. For `istream_iterator` this follows from its own specification ([istream.iterator.ops]: `*` returns the cached value, `++` reads the next one). For a generic input iterator the standard promises nothing: after a copy is incremented, the other copies need not be dereferenceable ([input.iterators]).
- Same output with GCC 11, ASan and `-D_GLIBCXX_DEBUG`: no tool reports it, because nothing is freed and no container is involved.
- Algorithms that revisit elements or return a position inside the range (`std::max_element`, `std::adjacent_find`, `std::search`) require forward iterators for exactly this reason.
- ❌ Common wrong answer: "`distance` only counts, it does not change anything." On an input range, counting is reading.
- ✅ What a strong answer adds: read the data once into a container (`std::vector<int> v(first, last);`) when you need its size or a second pass; C++20 `std::ranges::istream_view` makes the single-pass nature part of the type (`input_range` only).

**Key takeaway:** Input iterators are one-shot: one algorithm, one pass; copy the data out if you need more.

---

#### Q12: What is the complexity of `std::advance(it, 1000)` and `std::distance(first, last)`?
**Difficulty:** #intermediate
**Category:** #stl #iterators
**Concepts:** #advance #distance #tag_dispatch

**Answer:**
O(1) for random access iterators, O(n) otherwise: they dispatch on the iterator category and fall back to repeated `++`. Writing `it += 1000` on a list iterator does not compile, which is often the better outcome.

**Explanation:**
- Neither checks bounds: advancing past `end()` is UB.
- `std::ranges::next(it, n, bound)` (C++20) stops at the bound.
- Generic code that needs O(1) jumps should constrain on `std::random_access_iterator` instead of silently accepting a list.
- ❌ Common wrong answer: "advance is just `it + n`." Only for random access.
- ✅ What a strong answer adds: `std::distance(m.begin(), m.find(k))` on a `std::map` is O(n), a common hidden cost in "get rank of key" code.

**Key takeaway:** advance and distance are only as fast as the iterator category allows.

---

#### Q13: What is the difference between `const std::vector<int>::iterator` and `std::vector<int>::const_iterator`?
**Difficulty:** #beginner
**Category:** #stl #iterators
**Concepts:** #const_iterator #const_correctness #cbegin

**Answer:**
`const iterator` is an iterator object that cannot be moved (`++it` fails) but can still modify the element. `const_iterator` can be moved but gives read-only access to the element (`*it = x` fails).

**Explanation:**
- It mirrors `int* const p` (const pointer) versus `const int* p` (pointer to const).
- `cbegin()`/`cend()` return `const_iterator` even for a non-const container; `auto it = v.cbegin();` is the easy way to get read-only access.
- Since C++11, `insert` and `erase` accept `const_iterator`, so you do not need a mutable iterator just to name a position.
- ❌ Common wrong answer: "They are the same thing." The const applies to different objects.
- ✅ What a strong answer adds: `iterator` converts to `const_iterator` implicitly; the reverse conversion does not exist (a cheap one is `v.erase(cit, cit)`, which returns a mutable iterator).

**Key takeaway:** `const iterator` fixes the position; `const_iterator` protects the element.

---

#### Q14: What does `reverse_iterator::base()` return, and how do you erase through a reverse iterator?
**Difficulty:** #intermediate
**Category:** #stl #iterators
**Concepts:** #reverse_iterator #base #off_by_one

**Answer:**
`rit.base()` is the underlying forward iterator, which points one element **after** the one `*rit` refers to. To erase the element `*rit`, call `c.erase(std::next(rit).base())`.

**Explanation:**
- The offset lets `rbegin()` wrap `end()` and `rend()` wrap `begin()`, so no "before begin" position is needed.
- `c.erase(rit.base())` erases the wrong element, and is UB when `rit == rbegin()` (it passes `end()`).
- To keep looping in reverse: `rit = std::reverse_iterator(c.erase(std::next(rit).base()));`.
- ❌ Common wrong answer: "`base()` returns the same position as a forward iterator." It is off by one by design.
- ✅ What a strong answer adds: when converting a reverse search result to a forward position for `insert`, `rit.base()` is exactly right ("insert after the found element in forward order").

**Key takeaway:** `*rit == *std::prev(rit.base())`.

---

#### Q15: Why do loops use `it != v.end()` instead of `it < v.end()`?
**Difficulty:** #beginner
**Category:** #stl #iterators
**Concepts:** #half_open_range #generic_code #iterator_categories

**Answer:**
`!=` works for every iterator category, while `<` is only defined for random access iterators. Using `!=` makes the same loop work for vectors, lists, maps and streams.

**Explanation:**
- Ranges are half-open `[begin, end)`: the loop stops exactly when `it` reaches `end()`, which is never dereferenced.
- `<=` with `end()` would dereference `end()` on the last iteration (UB).
- C++20 ranges generalize `end()` to a sentinel of a possibly different type, which supports only `==`/`!=` against the iterator.
- ❌ Common wrong answer: "It's just a style choice." For a list iterator `<` does not compile.
- ✅ What a strong answer adds: half-open ranges make the empty range `begin == end` and the length `end - begin` with no special cases.

**Key takeaway:** `!=` plus half-open ranges is what makes STL loops generic.

---

#### Q16: How do you catch iterator invalidation bugs, and what can each tool not see?
**Difficulty:** #advanced
**Category:** #stl #debugging
**Concepts:** #glibcxx_debug #asan #glibcxx_assertions

**Answer:**
libstdc++ debug mode (`-D_GLIBCXX_DEBUG`) tracks every iterator and aborts on use of a singular one; AddressSanitizer catches access to memory freed by a reallocation; `-D_GLIBCXX_ASSERTIONS` only adds cheap bounds checks. None of them catches every case.

**Explanation:**
- Debug mode catches dereference, increment and comparison of invalidated iterators, mismatched containers, and invalid ranges. It changes the ABI, so all translation units and libraries passing containers must use it.
- ASan cannot see shifted elements: after an insert or erase without reallocation the memory is still owned, so a stale pointer reads silently.
- ASan with `-D_GLIBCXX_SANITIZE_VECTOR` adds checks for reads between `size()` and `capacity()`.
- GCC 11 debug mode does not flag a stale `end()` after `push_back` without reallocation.
- ❌ Common wrong answer: "ASan catches all iterator bugs." It catches memory errors, not logical invalidation.
- ✅ What a strong answer adds: run unit tests in both debug mode and ASan builds in CI; they are complementary.

**Key takeaway:** Debug mode checks the rules; ASan checks the memory; you need both.

---

#### Q17: Does `swap` invalidate iterators?
**Difficulty:** #advanced
**Category:** #stl #iterators
**Concepts:** #swap #container_requirements #sso

**Answer:**
For all standard containers except `std::array` and `std::string`, no: iterators, pointers and references stay valid and keep referring to the same elements, which now live in the other container. Only `end()` may be invalidated.

**Explanation:**
```cpp
#include <iostream>
#include <vector>

int main() {
    std::vector<int> a{1, 2, 3}, b{9};
    auto it = a.begin();
    a.swap(b);
    std::cout << *it << ' ' << std::boolalpha << (it == b.begin()) << '\n';   // 1 true
}
```
- Vector swap exchanges three pointers; no element moves.
- `std::string` swap may invalidate: short strings are stored inside the string object (SSO), so their characters really are exchanged.
- `std::array` swap exchanges values element by element; an iterator keeps pointing into the same array and now sees a different value.
- ❌ Common wrong answer: "After swap, `it` points into `a` again." It points into `b`, where its element now lives.
- ✅ What a strong answer adds: move construction behaves the same way in every implementation (except `array`, and short `string`s), but the explicit guarantee is still only proposed (LWG 2321 is an open issue).

**Key takeaway:** Swap moves ownership, not elements; iterators follow the elements.

---

#### Q18: A component keeps pointers to objects in a `std::vector` that keeps growing, and crashes appear after growth. How do you fix it?
**Difficulty:** #advanced
**Category:** #stl #design
**Concepts:** #stable_addresses #handles #reallocation

**Answer:**
Stop handing out pointers into storage that relocates. Use indices or stable ids, or store objects where they never move: `std::vector<std::unique_ptr<T>>`, a `std::deque` grown only at the ends, or a node container. `reserve` only mitigates the problem if the maximum size is truly known.

**Explanation:**
- Indices survive reallocation but break if middle elements are erased; stable ids plus a lookup map survive both.
- `vector<unique_ptr<T>>` keeps each object at a fixed address; reallocation moves only the pointers. Cost: one allocation and an extra indirection per element.
- `deque` keeps element addresses stable for end insertions, while still allowing indexed access.
- If other threads read while one thread grows the vector, it is also a data race; that needs synchronization (Concurrency chapter), not just a different container.
- ❌ Common wrong answer: "Call `reserve` with a large number." It works until the size estimate is wrong, then the same bug returns in production.
- ✅ What a strong answer adds: name the trade-off: stable addresses cost locality; indices keep locality but need care on erase.

**Key takeaway:** Choose a handle that matches what the container guarantees: indices or ids for vectors, pointers only for stable storage.
