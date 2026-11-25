## TOPIC: deque, list, forward_list, array and Adaptors

### INTERVIEW_QA: Interview Questions with Detailed Answers

#### Q1: How is `std::deque` implemented, and how can `d[i]` be O(1) if the storage is not contiguous?
**Difficulty:** #intermediate
**Category:** #stl #deque
**Concepts:** #deque_layout #block_map #random_access

**Answer:**
A deque is a map (an array of pointers) to fixed-size blocks that hold the elements. Because every block has the same capacity, `d[i]` computes the block as `(start + i) / per_block` and the slot as `(start + i) % per_block`: two loads and some arithmetic, independent of `n`.

**Explanation:**
- Block size is implementation-defined; libstdc++ uses 512-byte blocks (128 `int`s), or one element per block when `sizeof(T) >= 512`.
- O(1) random access needs a constant-time address computation, not contiguity.
- Each access costs one more indirection than a vector (map slot, then block), and iteration has a branch at every block boundary.
- ❌ Common wrong answer: "Blocks grow like vector capacity (30, 50, 50, ...), so index math walks the blocks." Real implementations use one fixed block size; variable blocks would make indexing O(number of blocks).
- ✅ What a strong answer adds: the deque iterator is a "fat" iterator (libstdc++: four pointers) that knows its block's bounds, which is also why end insertion invalidates it (topic 06).

**Key takeaway:** deque = map of fixed-size blocks; index math replaces contiguity.

---

#### Q2: When would you choose `std::deque` over `std::vector`, and what does it cost?
**Difficulty:** #intermediate
**Category:** #stl #container_choice
**Concepts:** #deque #vector #trade_offs

**Answer:**
Choose deque when you need O(1) insertion or removal at **both** ends, or when elements must not move as the sequence grows at its ends (stable references with indexing). It costs an extra indirection per access, no contiguity (`data()` does not exist), a larger fixed size, and allocation even when empty.

**Explanation:**
- Growing a vector copies or moves all elements on reallocation; growing a deque allocates a new block and at most copies block pointers.
- libstdc++ numbers: `sizeof(std::deque<int>) == 80`, and an empty deque allocates the map plus one 512-byte block. Many tiny deques are expensive.
- Vector is faster for iteration and lookup; deque wins for FIFO patterns (`push_back` + `pop_front`), which on a vector would be O(n) per pop.
- ❌ Common wrong answer: "deque is always better because it can do everything vector can." It loses contiguity, is slower to traverse, and has a bigger footprint.
- ✅ What a strong answer adds: for a bounded FIFO in a latency-sensitive path, a fixed-capacity ring buffer beats both (one contiguous array, no allocation after start-up).

**Key takeaway:** deque buys two cheap ends and stable element addresses; it pays with indirection and fixed overhead.

---

#### Q3: Why does `std::deque` have no `reserve()`, `capacity()` or `data()`?
**Difficulty:** #intermediate
**Category:** #stl #deque
**Concepts:** #deque_layout #contiguity #api_design

**Answer:**
`data()` would promise a single contiguous array, which a deque does not have. `reserve()`/`capacity()` exist on vector to avoid reallocating and moving elements; a deque never moves elements when growing at the ends, so there is nothing to avoid except cheap block allocations.

**Explanation:**
- Growing a deque allocates blocks one at a time; the only "reallocation" is the small map of block pointers.
- `shrink_to_fit()` does exist: it can free unused blocks and shrink the map (non-binding request).
- If you need a contiguous view for a C API or SIMD loop, copy into a vector or use a vector from the start.
- ❌ Common wrong answer: "They were just forgotten." The interface reflects the layout.
- ✅ What a strong answer adds: the same reasoning explains why `deque` iterators are random access but not contiguous (`std::contiguous_iterator` is false).

**Key takeaway:** No contiguity, so no `data()`; no element moves, so no `reserve()`.

---

#### Q4: When is `std::list` actually the right choice?
**Difficulty:** #intermediate
**Category:** #stl #list
**Concepts:** #stable_iterators #splice #container_choice

**Answer:**
When you need iterators and references that survive every other insertion and erasure, O(1) insert or erase at positions you already hold iterators to, or O(1) splicing of elements between lists. The LRU cache (list plus hash map of iterators) is the textbook case.

**Explanation:**
- "O(1) insert" is only O(1) with an iterator in hand; finding the position is O(n) pointer chasing.
- Each element is a separate allocation (libstdc++: 24-byte node for `int`, plus allocator overhead), and traversal is a chain of cache misses.
- For "insert in the middle" workloads with small or medium N, a vector's `memmove` usually beats walking a list to the position.
- Memory allocation per node can be tamed with a pool allocator (Memory & Ownership chapter, pmr topic).
- ❌ Common wrong answer: "Use list whenever there are many insertions." Insertions that need a search first are dominated by the search.
- ✅ What a strong answer adds: choose list for its semantics (stable iterators, splice), not for raw speed.

**Key takeaway:** list is a semantics choice (stability, splice), rarely a performance choice.

---

#### Q5: Both traversals are O(n). Why is iterating a `std::list` much slower than a `std::vector`?
**Difficulty:** #intermediate
**Category:** #stl #performance
**Concepts:** #cache_locality #pointer_chasing #prefetching

**Answer:**
A vector traversal reads consecutive memory, so every cache line brings several elements and the hardware prefetcher runs ahead. A list traversal must load each node's `next` pointer before it knows the next address, so every step can be a cache miss that cannot be overlapped.

**Explanation:**
- Nodes allocated at different times end up scattered across the heap; even freshly built lists lose locality after some inserts and erases.
- Each node also carries two pointers of overhead, so less useful data fits in cache.
- The dependent-load chain also blocks out-of-order execution: the CPU cannot start load k+1 before load k finishes.
- ❌ Common wrong answer: "Same Big-O, so same speed." Big-O hides the constant, and memory access dominates that constant.
- ✅ What a strong answer adds: deeper cache discussion (lines, prefetching, TLB) belongs to the Systems chapter; the interview point is "locality beats asymptotics for realistic N".

**Key takeaway:** Pointer chasing makes list traversal latency-bound; vector traversal is bandwidth-bound.

---

#### Q6: What is the complexity of `std::list::size()`, and why did it change in C++11?
**Difficulty:** #beginner
**Category:** #stl #list
**Concepts:** #size #splice #complexity

**Answer:**
O(1) since C++11. Before, implementations were allowed to make it O(n) so that splicing a range from another list could be O(1) without counting the moved elements.

**Explanation:**
- The trade-off moved: with a stored size, range `splice` from another list must count the range, so it became O(n) in the range length.
- Whole-list splice and single-element splice remain O(1); a range splice within the same list is O(1) too (the size does not change).
- `forward_list` resolves the same trade-off the other way: it has no `size()` at all.
- ❌ Common wrong answer: "size() walks the list." Not since C++11.
- ✅ What a strong answer adds: `std::distance(l.begin(), l.end())` is still O(n); call `size()`.

**Key takeaway:** `list::size()` is O(1); range splice from another list paid the price.

---

#### Q7: How does `std::list::sort` work, and why not just use `std::sort`?
**Difficulty:** #intermediate
**Category:** #stl #list
**Concepts:** #merge_sort #stability #iterator_categories

**Answer:**
`std::sort` needs random access iterators, which list does not provide. `list::sort` is a stable merge sort that only relinks nodes: O(n log n) comparisons, no element copies, and every iterator and reference stays valid.

**Explanation:**
- Stability: equal elements keep their relative order (`std::sort` does not guarantee that; `std::stable_sort` does).
- No element is copied or moved, so sorting a list of large or non-movable objects is cheap in element operations, but each step chases pointers.
- For a large list of small values, copying into a vector, sorting, and writing back is often faster.
- ❌ Common wrong answer: "`std::sort` works on any iterator range." It does not compile for bidirectional iterators.
- ✅ What a strong answer adds: other member algorithms exist for the same reason: `merge`, `unique`, `remove_if`, `reverse`, `splice`.

**Key takeaway:** List has member algorithms that relink nodes instead of moving values.

---

#### Q8: What does `splice` do to complexity and to iterators?
**Difficulty:** #intermediate
**Category:** #stl #list
**Concepts:** #splice #iterator_validity #node_transfer

**Answer:**
`splice` moves nodes from one list into another by relinking pointers: no allocation, no copy. Single-element and whole-list splices are O(1); a range from a different list is O(range length). Iterators and references to the moved elements stay valid and now belong to the destination list.

**Explanation:**
- Because the nodes keep their identity, splice is the tool for "move to front" (LRU) and for moving work items between queues without copying.
- After the splice, erasing through the old list (`a.erase(it)` when `it` now lives in `b`) is UB.
- Both lists must have equal allocators.
- ❌ Common wrong answer: "Splice copies the elements and invalidates the iterators." It does neither.
- ✅ What a strong answer adds: the associative containers got the equivalent in C++17 with node handles (`extract`/`insert`, `merge`; topic 08).

**Key takeaway:** splice transfers nodes, not values; iterators follow the nodes.

---

#### Q9: Why does `std::forward_list` have no `size()` and no `push_back()`?
**Difficulty:** #intermediate
**Category:** #stl #forward_list
**Concepts:** #zero_overhead #singly_linked #insert_after

**Answer:**
It was designed to have zero overhead compared to a hand-written singly linked list: one pointer in the object and one in each node. A stored size or a tail pointer would add space and work to every operation, so it offers neither.

**Explanation:**
- `sizeof(std::forward_list<int>)` is 8 bytes on libstdc++ x86-64.
- A node can only change its successor, so the API is "after": `insert_after`, `erase_after`, `emplace_after`, `splice_after`, plus `before_begin()` to address the front.
- Erasing while iterating needs a trailing `prev` iterator (or `remove_if`).
- ❌ Common wrong answer: "It's a list with fewer features for no reason." The missing features are exactly the ones that cost memory.
- ✅ What a strong answer adds: typical uses are bucket chains and free lists, where per-node memory matters most.

**Key takeaway:** forward_list trades convenience for the minimum possible footprint.

---

#### Q10: How do `std::array`, a C array and `std::vector` compare?
**Difficulty:** #beginner
**Category:** #stl #array
**Concepts:** #aggregate #value_semantics #stack_storage

**Answer:**
`std::array<T, N>` stores its elements inline like a C array (no heap, size fixed at compile time) but behaves like a value: it does not decay to a pointer, can be copied, assigned, compared and returned, and offers `size()`, iterators and `at()`. `std::vector` stores its elements on the heap and can change size.

**Explanation:**
- `sizeof(std::array<int, 4>)` is 16: no pointer, no size field.
- Passing a C array to a function loses its length (decays to `T*`); passing `std::array<T, N>` keeps it in the type.
- `std::array` works in `constexpr` code, which makes it the standard way to build compile-time tables.
- Large arrays as locals can overflow the stack; use a vector or static storage.
- ❌ Common wrong answer: "std::array allocates on the heap like vector." It is an aggregate; storage is wherever the object lives.
- ✅ What a strong answer adds: `std::span` (topic 02) is the way to write one function that accepts a C array, `std::array` or a vector.

**Key takeaway:** `std::array` is a C array with value semantics and a size in its type.

---

#### Q11: What values does `std::array<int, 4> a;` hold inside a function?
**Difficulty:** #beginner
**Category:** #stl #array
**Concepts:** #aggregate_initialization #default_initialization #indeterminate_values

**Answer:**
Indeterminate values: `std::array` is an aggregate, and default-initializing an aggregate of `int` leaves the ints uninitialized. Reading them is UB. Write `std::array<int, 4> a{};` to zero them.

**Explanation:**
- `std::array<int, 4> a{1, 2};` gives `1, 2, 0, 0`: missing elements are value-initialized.
- Arrays with static storage duration (globals, `static` locals) are zero-initialized anyway.
- Class element types (`std::string`) are default-constructed, so `std::array<std::string, 4> s;` is fine.
- ❌ Common wrong answer: "Standard containers always initialize their elements." `std::vector<int>(4)` does; `std::array` follows C array rules.
- ✅ What a strong answer adds: GCC 11 warns (`-Wuninitialized`) only when optimizing; `-ftrivial-auto-var-init=zero` (GCC 12+) hardens builds and MemorySanitizer (Clang) finds the reads.

**Key takeaway:** `std::array` needs `{}` to be zero-filled.

---

#### Q12: What are container adaptors, and why does `pop()` return `void`?
**Difficulty:** #beginner
**Category:** #stl #adaptors
**Concepts:** #stack #queue #exception_safety

**Answer:**
`stack`, `queue` and `priority_queue` wrap an underlying container and expose only a restricted interface (LIFO, FIFO, highest priority first). `pop()` returns `void` because returning the removed element by value could throw during the copy after the element was already removed, losing it; so reading (`top()`/`front()`) and removing (`pop()`) are separate.

**Explanation:**
- Defaults: `stack` and `queue` use `deque`; `priority_queue` uses `vector`.
- You can choose the container: `std::stack<int, std::vector<int>>` is valid and avoids the deque's fixed cost.
- Adaptors have no iterators; if you need to iterate, use the container directly.
- ❌ Common wrong answer: "pop returns void for performance." The original reason is the strong exception guarantee.
- ✅ What a strong answer adds: with move-only or noexcept-movable types a `T pop()` would be safe, but the interface predates move semantics and stays consistent. Thread-safe queues (Concurrency chapter) use `bool try_pop(T& out)` for the same reason.

**Key takeaway:** Adaptors restrict an interface; `top()`/`front()` then `pop()` is the exception-safe split.

---

#### Q13: How do you make a min-heap with `std::priority_queue`, and why does `std::greater` give the smallest element?
**Difficulty:** #intermediate
**Category:** #stl #priority_queue
**Concepts:** #binary_heap #comparator #min_heap

**Answer:**
`std::priority_queue<T, std::vector<T>, std::greater<T>>`. The comparator means "a has lower priority than b"; the element that is not lower than any other ends up on `top()`. With `less`, the largest wins (max-heap); with `greater`, "lower priority" means "greater value", so the smallest wins.

**Explanation:**
- Internally it is `std::push_heap`/`std::pop_heap` on the vector: `push`/`pop` O(log n), `top` O(1).
- Same convention as `std::make_heap`: the comparator is the heap's "less", the top is the maximum under it.
- For a custom type: earliest deadline first means `return a.deadline > b.deadline;`.
- Not stable: add a sequence number as a tie-breaker for FIFO among equal priorities.
- ❌ Common wrong answer: "`greater` means the greatest comes out first." The opposite.
- ✅ What a strong answer adds: there is no decrease-key; for Dijkstra-like algorithms push a new entry and skip stale ones when popped (lazy deletion).

**Key takeaway:** priority_queue's comparator is "lower priority than"; `greater` makes a min-heap.

---

#### Q14: Can `std::queue` use `std::vector` as its container?
**Difficulty:** #intermediate
**Category:** #stl #adaptors
**Concepts:** #template_instantiation #container_requirements #queue

**Answer:**
Not usefully. `queue::pop()` calls `c.pop_front()`, which vector does not have. `std::queue<int, std::vector<int>>` compiles as long as you never call `pop()`, because member functions of a class template are instantiated only when used.

**Explanation:**
- Valid containers for `queue`: `deque` (default) and `list`.
- Valid for `stack`: `vector`, `deque`, `list`.
- Valid for `priority_queue`: `vector` (default) and `deque` (needs random access iterators).
- The error appears deep inside `stl_queue.h`: "'class std::vector<int>' has no member named 'pop_front'".
- ❌ Common wrong answer: "Any container works with any adaptor." Each adaptor lists the operations it needs.
- ✅ What a strong answer adds: C++20 concepts would let a library reject the wrong container at the declaration; the standard adaptors predate that.

**Key takeaway:** An adaptor needs specific member functions; the error appears only when the member that uses them is called.

---

#### Q15: You need a FIFO for messages between two parts of a system. deque, list, or something else?
**Difficulty:** #advanced
**Category:** #stl #design
**Concepts:** #fifo #ring_buffer #allocation

**Answer:**
For an unbounded FIFO in ordinary code, `std::queue` over `std::deque`: O(1) at both ends, no element moves, block-wise allocation. For a bounded, latency-sensitive path, a fixed-capacity ring buffer over a contiguous array: no allocation after start-up, best locality. `std::list` is the weakest choice (one allocation per message).

**Explanation:**
- `vector` as a FIFO is wrong: `erase(begin())` is O(n).
- deque still allocates and frees blocks as the queue moves forward through memory; a ring buffer reuses the same slots.
- A ring buffer needs a policy for "full": block, drop, or overwrite; that decision is part of the design.
- If producer and consumer are different threads, synchronization (mutex plus condition variable, or an SPSC lock-free ring) is a separate requirement: Concurrency chapter.
- ❌ Common wrong answer: "list, because insert and erase are O(1)." Every message pays a heap allocation and a cache miss.
- ✅ What a strong answer adds: size the ring to a power of two so the index wrap is a mask, and pre-allocate message storage.

**Key takeaway:** deque for a general FIFO, ring buffer for a bounded hot path, list almost never.

---

#### Q16: What is `std::inplace_vector` (C++26), and when would you use it?
**Difficulty:** #advanced
**Category:** #stl #cpp26
**Concepts:** #inplace_vector #fixed_capacity #no_heap

**Answer:**
`std::inplace_vector<T, N>` is a vector with a compile-time capacity N whose elements are stored inside the object, so it never allocates. Its size varies from 0 to N. Use it for small bounded collections in hot paths or where heap allocation is forbidden.

**Explanation:**
- Unlike `std::array<T, N>`, only `size()` elements are constructed; unlike `vector`, `reserve` cannot grow it past N.
- Full-container behaviour: `push_back` throws `std::bad_alloc`, `try_push_back` returns a null pointer, `unchecked_push_back` has a precondition (UB if full).
- Moving it moves each element (no pointer steal), so move is O(size), not O(1).
- Not yet in GCC 14's library; many code bases have an equivalent (`static_vector`, `fixed_vector`, `small_vector` with fallback to heap).
- ❌ Common wrong answer: "It's the same as `std::array`." Array always holds N constructed elements.
- ✅ What a strong answer adds: a small-buffer vector (inline up to N, heap after) is a different trade-off: no hard limit, but a branch and possible allocation.

**Key takeaway:** inplace_vector = vector interface, array storage, hard capacity.
