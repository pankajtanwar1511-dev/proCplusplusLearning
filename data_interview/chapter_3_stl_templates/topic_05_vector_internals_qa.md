## TOPIC: std::vector Internals

### INTERVIEW_QA: Interview Questions with Detailed Answers

#### Q1: How is a `std::vector` laid out in memory?
**Difficulty:** #beginner
**Category:** #stl #vector
**Concepts:** #layout #contiguous #three_pointers

**Answer:**
A small handle (in practice three pointers: begin, end of elements, end of storage, 24 bytes on 64-bit) that owns one contiguous heap block. Elements `[0, size)` are constructed objects; slots `[size, capacity)` are raw, unconstructed memory.

**Explanation:**
- `size() = end - begin`, `capacity() = end_of_storage - begin`.
- Contiguity is guaranteed: `&v[0] + i == &v[i]`, so `v.data()` works with C APIs and `std::span`.
- The handle itself lives wherever the vector object lives; the elements are always in the allocator's memory (the heap for `std::allocator`).
- ❌ Common wrong answer: "The vector stores its elements inline like an array." Only `std::array` (and C++26 `std::inplace_vector`) do.
- ✅ What a strong answer adds: moving a vector is O(1) because only the three pointers move; moving each element is O(n).

**Key takeaway:** Three pointers, one contiguous block, constructed prefix plus raw tail.

---

#### Q2: Does a vector double its capacity when it grows?
**Difficulty:** #beginner
**Category:** #stl #vector
**Concepts:** #growth_factor #amortized #implementation_defined

**Answer:**
It grows geometrically, but the factor is implementation-defined. libstdc++ and libc++ double; MSVC grows by 1.5x. The standard only requires amortized constant time for `push_back`.

**Explanation:**
- libstdc++ / GCC, x86-64 capacities: 1, 2, 4, 8, 16, 32, 64, 128.
- MSVC: 1, 2, 3, 4, 6, 9, 13, 19, ...
- Amortized O(1): with factor k, each element is moved about 1 / (k - 1) times on average over the whole sequence of pushes.
- Factor < golden ratio (1.5x) lets freed earlier blocks eventually fit a new request, which helps memory reuse with some allocators.
- ❌ Common wrong answer: "The standard says double."
- ✅ What a strong answer adds: an empty vector has capacity 0 in all three libraries; there is no minimum initial allocation.

**Key takeaway:** Say "geometric, factor implementation-defined", then quote numbers per library.

---

#### Q3: What is the difference between `reserve` and `resize`?
**Difficulty:** #beginner
**Category:** #stl #vector
**Concepts:** #reserve #resize #capacity

**Answer:**
`reserve(n)` only allocates: capacity becomes at least `n`, size and content are unchanged, no elements are created. `resize(n)` changes the number of elements: it value-initializes new ones (or destroys extra ones) and allocates if needed.

**Explanation:**
- `reserve` never shrinks; `reserve(30)` on a vector of size 50 does nothing.
- `resize` never shrinks capacity either: `reserve(100); resize(80);` gives size 80, capacity 100.
- `resize(200)` on that vector reallocates to at least 200 (exactly 200 on libstdc++).
- ❌ Common wrong answer: "`reserve(n)` gives me n usable elements."
- ✅ What a strong answer adds: `resize` writes every new element (zeros for `int`); if you are about to overwrite them anyway, `reserve` + `push_back` avoids the double write.

**Key takeaway:** `reserve` changes capacity, `resize` changes size.

---

#### Q4: `std::vector<int> v; v.reserve(100); v[50] = 10;` Compile error, crash or fine?
**Difficulty:** #beginner
**Category:** #stl #vector
**Concepts:** #undefined_behavior #reserve #debug_mode

**Answer:**
It compiles and is undefined behaviour: `operator[]` is unchecked and there is no element 50 (size is 0). It usually runs silently, and the value is invisible to `size()`, iteration and copies.

**Explanation:**
- The memory exists, so even AddressSanitizer does not report the write.
- `-D_GLIBCXX_ASSERTIONS` (cheap) aborts with `Assertion '__n < this->size()' failed`; `-D_GLIBCXX_DEBUG` (full debug containers) aborts with `attempt to subscript container with out-of-bounds index`.
- `v.at(50)` throws `std::out_of_range` because it checks against `size()`, not capacity.
- ❌ Common wrong answer: "Compile error, the index is out of range."
- ✅ What a strong answer adds: enable `_GLIBCXX_ASSERTIONS` in test and CI builds; it catches exactly this class of bug with small overhead.

**Key takeaway:** Capacity is not size; reserved slots are not elements.

---

#### Q5: What exactly happens when `push_back` is called on a full vector?
**Difficulty:** #intermediate
**Category:** #stl #vector
**Concepts:** #reallocation #move_if_noexcept #invalidation

**Answer:**
The vector allocates a larger block, constructs the new element there, relocates the existing elements (move if the move constructor is `noexcept`, otherwise copy if copyable), destroys the old elements, frees the old block and updates its pointers. All pointers, references and iterators into it become invalid.

**Explanation:**
- libstdc++ order, observed with a noisy type: `ctor3 move1 dtor1 move2 dtor2`. The new element comes first.
- That order is what makes `v.push_back(v[0])` safe: the source is copied before the old block is released.
- Trivially copyable elements are relocated with one `memmove`.
- If constructing the new element throws, nothing has changed. If relocation by copy throws, the new block is discarded and the vector is unchanged (strong guarantee); see Memory & Ownership, topic 02 for the `noexcept` rule.
- ❌ Common wrong answer: "If the allocator is clever, `push_back` at full capacity may not reallocate." `capacity()` is the storage held; inserting beyond it always needs new storage.
- ✅ What a strong answer adds: the latency spike is O(n) on one unlucky call, which is why hot paths `reserve` up front. Which iterators survive the non-reallocating case (hint: not `end()`) is covered in topic 06.

**Key takeaway:** Full vector + insert = new block, new element first, relocate, free old, every borrow dead.

---

#### Q6: Does copying a vector copy its capacity? Does moving it?
**Difficulty:** #intermediate
**Category:** #stl #vector
**Concepts:** #copy #move #capacity

**Answer:**
Copying copies the elements, not the capacity: the new vector typically gets `capacity() == size()`. Moving steals the whole block, so the destination gets the source's capacity and the source is left empty (in practice capacity 0).

**Explanation:**
- libstdc++ / GCC, x86-64: `a.reserve(1000); a.push_back(1); auto b = a;` gives `b.capacity() == 1`; `auto c = std::move(a);` gives `c.capacity() == 1000`, `a.capacity() == 0`.
- Copy assignment into a vector that already has enough capacity reuses that storage: `e.reserve(50); e = b;` keeps capacity 50.
- The standard specifies neither number for the copy; only the moved-to vector's ownership of the old block is guaranteed (for `std::allocator`).
- ❌ Common wrong answer: "A copy is an exact clone, including the reserved space."
- ✅ What a strong answer adds: a vector that was `reserve`d for a hot path and then passed or returned **by copy** loses the reservation; the copy will reallocate on its next growth.

**Key takeaway:** Capacity travels with moves, not with copies.

---

#### Q7: Is `emplace_back` always faster than `push_back`?
**Difficulty:** #intermediate
**Category:** #stl #vector
**Concepts:** #emplace_back #push_back #in_place_construction

**Answer:**
No. `emplace_back(args...)` saves exactly one move (the temporary) when you pass constructor arguments. With an existing object, `emplace_back(obj)` copies and `emplace_back(std::move(obj))` moves, exactly like `push_back`.

**Explanation:**
- `push_back(T(args))`: construct temporary, move into storage, destroy temporary (1 ctor + 1 move).
- `emplace_back(args)`: construct in storage (1 ctor, 0 moves).
- For cheap-to-move types (strings, vectors) the difference is a few pointer copies.
- `emplace_back` can call explicit constructors, which can hide mistakes: `v.emplace_back(1000)` on a `std::vector<std::vector<int>>` silently creates a 1000-element vector.
- ❌ Common wrong answer: "Always use `emplace_back`, it never copies."
- ✅ What a strong answer adds: prefer `push_back` for existing values (clear intent, no explicit-constructor surprises) and `emplace_back` for building from arguments.

**Key takeaway:** `emplace_back` helps only when it receives constructor arguments.

---

#### Q8: Why does `std::vector<std::unique_ptr<int>> v; v.emplace_back(new int(1));` compile while `push_back(new int(1))` does not, and why is the first one risky?
**Difficulty:** #advanced
**Category:** #stl #vector
**Concepts:** #explicit_constructor #direct_initialization #exception_safety

**Answer:**
`unique_ptr`'s constructor from a raw pointer is `explicit`. `push_back` takes a `unique_ptr` parameter, so it needs an implicit conversion and fails. `emplace_back` direct-initializes the element from the raw pointer, which may call explicit constructors. If the reallocation inside `emplace_back` throws `bad_alloc` before the `unique_ptr` exists, the raw `new int` leaks.

**Explanation:**
- Safe: `v.push_back(std::make_unique<int>(1));` or `v.emplace_back(std::make_unique<int>(1));`: ownership is taken before the vector can throw.
- The general rule: never pass a naked `new` as an argument to something that may throw before taking ownership.
- ❌ Common wrong answer: "`emplace_back` is just a faster `push_back`, both behave the same."
- ✅ What a strong answer adds: the same explicit-constructor effect is why `v.emplace_back(10)` on a vector of vectors creates 10 elements instead of failing.

**Key takeaway:** `emplace_back` bypasses `explicit`; pair it with `make_unique`, not raw `new`.

---

#### Q9: `struct P { int a, b; }; std::vector<P> v; v.emplace_back(1, 2);` Does it compile?
**Difficulty:** #intermediate
**Category:** #stl #vector #modern_cpp
**Concepts:** #aggregate #parenthesized_init #cxx20

**Answer:**
Not in C++17: `P` has no constructor taking `(int, int)` and `emplace_back` uses parentheses (`::new (p) P(1, 2)`). In C++20 it compiles thanks to parenthesized aggregate initialization (P0960, GCC 10+).

**Explanation:**
- GCC 11 with `-std=c++17` reports `no matching function for call to 'P::P(int)'` (after "new initializer expression list treated as compound expression").
- C++17 workaround: `v.push_back({1, 2});` (brace-initialized temporary) or add a constructor.
- Parenthesized aggregate init differs from braces: narrowing is allowed (`P p(1.5, 2);` compiles), there is no brace elision, and a temporary bound to a reference member is not lifetime-extended.
- ❌ Common wrong answer: "Aggregates can never be emplaced."
- ✅ What a strong answer adds: the same C++20 change makes `std::make_unique<P>(1, 2)` work for aggregates.

**Key takeaway:** C++20 lets `emplace_back` construct aggregates from parenthesized arguments.

---

#### Q10: What are `std::vector<int> v{10};`, `v(10)`, `v{10, 5}` and `v(10, 5)`?
**Difficulty:** #beginner
**Category:** #stl #vector
**Concepts:** #initializer_list #brace_init #constructors

**Answer:**
`{10}` is one element with value 10; `(10)` is ten zeros; `{10, 5}` is two elements, 10 and 5; `(10, 5)` is ten fives. Braces prefer the `initializer_list` constructor whenever it is viable.

**Explanation:**
- When the element type cannot be built from the braced values, braces fall back to other constructors: `std::vector<std::string> f{3};` is three empty strings.
- `std::vector<std::string> g{{"a", "b"}};` compiles and is UB: it calls `std::string(first, last)` with two unrelated pointers.
- `initializer_list` elements are `const`, so a braced list of move-only objects does not compile.
- ❌ Common wrong answer: "Braces and parentheses mean the same thing in modern C++."
- ✅ What a strong answer adds: use parentheses for sizes and counts, braces for literal element lists.

**Key takeaway:** `vector<int>{10}` has size 1.

---

#### Q11: Does `clear()` release the memory? How do you actually shrink a vector?
**Difficulty:** #beginner
**Category:** #stl #vector
**Concepts:** #clear #shrink_to_fit #swap_trick

**Answer:**
No. `clear()` destroys the elements and sets size to 0 but keeps the capacity. To release memory call `shrink_to_fit()` (a non-binding request; libstdc++ honours it) or swap with an empty vector: `std::vector<T>().swap(v);`.

**Explanation:**
- Keeping the capacity is the point: a buffer reused every iteration (`clear()` then refill) allocates only once.
- `erase`, `pop_back` and `resize` to a smaller size also keep the capacity.
- `shrink_to_fit` reallocates, so it invalidates everything and costs O(n).
- ❌ Common wrong answer: "`clear()` frees memory, that is what it is for."
- ✅ What a strong answer adds: in long-running services, a vector that once held a burst of a million elements keeps that memory until shrunk or destroyed.

**Key takeaway:** `clear` empties, it does not free.

---

#### Q12: Why does `std::remove` not change the size of a vector?
**Difficulty:** #beginner
**Category:** #stl #vector #algorithms
**Concepts:** #erase_remove #std_erase #cxx20

**Answer:**
Algorithms work on iterators and cannot change a container's size. `std::remove` moves the kept elements to the front and returns the new logical end; you must then call `v.erase(new_end, v.end())`. C++20 `std::erase(v, x)` / `std::erase_if(v, pred)` do both and return the count removed.

**Explanation:**
- The elements after the new logical end are valid but unspecified (libstdc++ leaves the old values).
- `std::remove` is O(n) with one pass and preserves the order of the kept elements.
- If order does not matter, remove one element in O(1): `std::swap(v[i], v.back()); v.pop_back();`.
- ❌ Common wrong answer: "`std::remove` deletes the matching elements."
- ✅ What a strong answer adds: calling `v.erase(it)` inside a loop for each match is O(n²); erase-remove is O(n).

**Key takeaway:** Use erase-remove, or `std::erase_if` in C++20.

---

#### Q13: What is special about `std::vector<bool>`?
**Difficulty:** #intermediate
**Category:** #stl #vector
**Concepts:** #vector_bool #proxy_reference #data_race

**Answer:**
It is a bit-packed specialization: elements are bits, `operator[]` returns a proxy object instead of `bool&`, there is no `data()`, and you cannot take `bool*` to an element. It does not satisfy the container requirements that generic code assumes.

**Explanation:**
- `auto x = vb[0];` is a proxy that keeps referring to the bit.
- Two threads writing different elements of a `vector<bool>` is a data race (adjacent bits share a word); for every other `vector<T>`, distinct elements are safe.
- Template code like `T& r = v[i];` fails to compile for `T = bool`.
- ❌ Common wrong answer: "It is just a vector that stores bools efficiently, otherwise identical."
- ✅ What a strong answer adds: use `std::vector<char>` / `std::vector<std::uint8_t>` for addressable flags, `std::bitset` for fixed sizes.

**Key takeaway:** `vector<bool>` is a bitset with a vector-like interface, not a vector of `bool`.

---

#### Q14: Why can `v.push_back(v[0])` be correct even when the vector must reallocate?
**Difficulty:** #advanced
**Category:** #stl #vector
**Concepts:** #aliasing #reallocation_order #self_reference

**Answer:**
The standard requires it to work, and implementations construct the new element (copying from the argument, which still lives in the old block) before relocating and freeing the old elements. libstdc++ shows `copy7 move7 dtor7` for this case: copy first, then relocate, then destroy.

**Explanation:**
- A naive implementation that freed the old block first would read freed memory.
- `insert(pos, v[i])` has the same aliasing problem; libstdc++ copies the value into a temporary before shifting elements.
- This is a classic bug in hand-written containers, and a good reason to reuse `std::vector`.
- ❌ Common wrong answer: "It is UB because the reference is invalidated by the reallocation."
- ✅ What a strong answer adds: the invalidation happens after the new element is built, so the reference is still valid when it is read.

**Key takeaway:** Self-insertion is legal; the library orders the steps to make it work.

---

#### Q15: In a latency-critical path, why `reserve` even if the final element count is the same?
**Difficulty:** #intermediate
**Category:** #stl #vector #performance
**Concepts:** #reserve #latency #amortized_cost

**Answer:**
Amortized O(1) still means occasional O(n) spikes: each reallocation calls the allocator, relocates every element and frees the old block. `reserve` moves that cost to a predictable point (startup or before the loop), so each later `push_back` is just a construction.

**Explanation:**
- 100 `push_back`s from empty: 8 reallocations on libstdc++; with `reserve(100)`: 1.
- Fresh memory also brings page faults on first touch; reserving early and reusing (`clear()` keeps capacity) keeps the hot path free of them.
- Reused buffers also keep the memory warm in cache.
- ❌ Common wrong answer: "Amortized O(1) means every call is cheap."
- ✅ What a strong answer adds: for bounded sizes, a fixed-capacity container (`std::array` plus a count, or C++26 `std::inplace_vector`) removes the allocator from the path entirely.

**Key takeaway:** `reserve` turns amortized cost into predictable cost.

---

#### Q16: How do you keep stable references to elements in a growing collection?
**Difficulty:** #intermediate
**Category:** #stl #vector #design
**Concepts:** #stable_address #indices #deque #unique_ptr

**Answer:**
Store indices instead of pointers, store `std::unique_ptr<T>` elements so the objects never move, use `std::deque` (stable addresses under `push_back` / `push_front`), or `reserve` the maximum up front and never exceed it.

**Explanation:**
- Index: survives reallocation, breaks when elements before it are erased.
- `vector<unique_ptr<T>>`: stable object addresses, but one allocation per element and an extra indirection on every access.
- `std::deque`: element references survive insertions at either end (iterators do not), topic 07.
- `std::list`: fully stable, but poor locality.
- ❌ Common wrong answer: "Just `reserve` a big number." Works only while the bound holds; one extra element breaks every pointer.
- ✅ What a strong answer adds: slot maps / generational indices give stable handles plus contiguous storage and detection of stale handles.

**Key takeaway:** Pointers into a vector are temporary; use indices or a container with stable addresses.

---
