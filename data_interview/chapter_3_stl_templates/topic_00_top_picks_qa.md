## TOPIC: Top 50: Must-Know STL and Templates Interview Questions

### INTERVIEW_QA: The Must-Know Interview Questions

#### Q1: What is the small string optimization, and is it guaranteed by the standard?
**Difficulty:** #beginner
**Category:** #stl #string
**Concepts:** #sso #layout #implementation_defined

**Answer:**
SSO stores short strings inside the `std::string` object itself instead of allocating a heap block. The standard permits it but does not require it, and the inline capacity is implementation-defined.

**Explanation:**
- libstdc++ / GCC, x86-64: `sizeof(std::string) == 32`, up to 15 characters inline.
- libc++: typically 24 bytes, up to 22 characters inline. MSVC: typically 32 bytes, 15 characters (64-bit release builds).
- Benefits: no allocation, no free, characters on the same cache line as the size.
- Costs: the object is larger than three pointers' worth of "just a handle" in some layouts, and moving a short string copies its characters.
- ❌ Common wrong answer: "Strings up to 15 characters never allocate in C++." That is libstdc++ and MSVC, not C++.
- ✅ What a strong answer adds: a stale pointer into an SSO buffer points into the live string object, so ASan cannot detect its misuse.
- Deep dive: Topic 1, std::string: SSO, Buffers and Pointer Validity

**Key takeaway:** SSO is universal in practice and unspecified in the standard; quote numbers with the library name.

---

#### Q2: Which `std::string` operations invalidate pointers, references and iterators into it?
**Difficulty:** #intermediate
**Category:** #stl #string
**Concepts:** #invalidation #string_require #c_str

**Answer:**
Any non-const member function except `operator[]`, `at`, `data`, `front`, `back`, `begin`, `rbegin`, `end`, `rend`, plus passing the string by non-const reference to `swap`, `operator>>` or `getline`. Reallocation is not the criterion.

**Explanation:**
- So `+=`, `append`, `push_back`, `insert`, `erase`, `clear`, `resize`, `reserve`, `shrink_to_fit`, `assign` and `swap` all formally invalidate.
- The exempt list is exactly the element-access and iterator-access functions: they can be called through a non-const string without disturbing existing borrows.
- In practice libstdc++ keeps the same buffer when capacity suffices, so code that relies on it "works". It is still UB to use the pointer by the standard's rules.
- ❌ Common wrong answer: "Same as vector: if it doesn't reallocate, pointers stay valid." The vector rule does not apply to `basic_string`.
- ✅ What a strong answer adds: the practical fix is to store indices across mutations and call `c_str()` again right before each use.
- Deep dive: Topic 1, std::string: SSO, Buffers and Pointer Validity

**Key takeaway:** For strings, every mutating member except element access invalidates; reacquire after each one.

---

#### Q3: When should a function take `std::string_view`, `const std::string&`, or `std::string` by value?
**Difficulty:** #intermediate
**Category:** #stl #api_design
**Concepts:** #parameter_passing #sink_parameter #string_view

**Answer:**
`string_view` by value for read-only, synchronous use. `const std::string&` when the function needs a null-terminated string or forwards to an API that takes `const std::string&`. `std::string` by value when the function stores the text (a sink): the caller can move into it.

**Explanation:**
- With a `const std::string&` parameter, a literal longer than the SSO capacity costs one allocation per call; a view costs none (verified by counting `operator new`).
- A view parameter that is later converted with `std::string(sv)` to call a C API or to store it pays the copy anyway; in that case take `std::string`.
- Storing a view parameter in a member is a lifetime bug waiting for the first caller that passes a temporary.
- ❌ Common wrong answer: "Always use `string_view` for strings now." It is a parameter type for borrowing, not a replacement for `std::string`.
- ✅ What a strong answer adds: for `std::map<std::string, V>` lookups, a view only helps with a transparent comparator (`std::less<>`); otherwise `find` needs a `std::string`.
- Deep dive: Topic 2, std::string_view and std::span

**Key takeaway:** Borrow with a view, terminate with `const std::string&`, store with `std::string` by value.

---

#### Q4: Why is `std::map<std::string_view, int>` dangerous, and what should you use instead?
**Difficulty:** #intermediate
**Category:** #stl #string_view #containers
**Concepts:** #dangling_key #heterogeneous_lookup #less_void

**Answer:**
The map stores views, not characters. Keys built from temporaries or from strings that later change point into dead memory, and every later comparison reads it. Use `std::map<std::string, int, std::less<>>`: the map owns its keys and can still be searched with a `string_view`.

**Explanation:**
- A `string_view` key is fine only when the characters outlive the map (literals, an arena or buffer owned next to the map that never reallocates).
- `std::less<>` is transparent: `find`, `count`, `contains`, `lower_bound` accept anything comparable with `std::string` (C++14 for ordered containers).
- For `std::unordered_map`, heterogeneous lookup needs both a transparent hash and a transparent equality (C++20), see topic 09.
- ❌ Common wrong answer: "Views as keys save memory, so they are a free optimization."
- ✅ What a strong answer adds: `std::hash<std::string_view>` equals `std::hash<std::string>` for the same characters, which is what makes transparent hashing consistent.
- Deep dive: Topic 2, std::string_view and std::span

**Key takeaway:** Containers should own their keys; look them up with views.

---

#### Q5: Why is `std::optional<bool>` considered a trap?
**Difficulty:** #intermediate
**Category:** #stl #api_design
**Concepts:** #optional #explicit_bool #tri_state

**Answer:**
Because `if (ob)` tests whether a value is present, not whether the value is `true`. An `optional<bool>` holding `false` is truthy, so "explicitly disabled" behaves like "enabled".

**Explanation:**
```cpp
#include <iostream>
#include <optional>

int main() {
    std::optional<bool> ob = false;
    std::cout << static_cast<bool>(ob) << ' ' << *ob << ' ' << (ob == true) << '\n';
}
```
- Output: `1 0 0`.
- The same applies to `optional<int>` holding 0 and `optional<T*>` holding `nullptr`.
- Clear spellings: `ob.value_or(false)`, `ob == true`, or an `enum class Setting { Unset, Off, On }`.
- ❌ Common wrong answer: "`if (ob)` is fine because bool converts naturally."
- ✅ What a strong answer adds: prefer a named three-state enum for flags; it reads better in logs and reviews.
- Deep dive: Topic 3, std::optional and std::expected

**Key takeaway:** For `optional<bool>`, the condition asks "is it set?", never "is it true?".

---

#### Q6: What is `std::expected<T, E>` and how does it differ from `std::optional<T>`?
**Difficulty:** #beginner
**Category:** #stl #cpp23 #error_handling
**Concepts:** #expected #unexpected #error_type

**Answer:**
A C++23 vocabulary type holding either a value `T` or an error `E`, in-place like optional. Optional only says "nothing"; expected says "nothing, and here is why", with a typed error the caller can inspect via `error()`.

**Explanation:**
- Success: `return value;`. Error: `return std::unexpected(err);`.
- `value()` on an error throws `std::bad_expected_access<E>`, which carries the error; `error()` on a success is UB.
- A default-constructed `expected<T, E>` holds a value-initialized `T` (success); a default optional is empty.
- `expected<void, E>` exists for actions without a result; there is no `optional<void>`.
- ❌ Common wrong answer: "It is optional plus an error string." `E` is any type; an enum is usually better than a string.
- ✅ What a strong answer adds: before C++23, `tl::expected` provides the same interface.
- Deep dive: Topic 3, std::optional and std::expected

**Key takeaway:** optional answers "is there a value?"; expected also answers "why not?".

---

#### Q7: When would you choose `std::variant` over an inheritance hierarchy, and vice versa?
**Difficulty:** #intermediate
**Category:** #design #polymorphism
**Concepts:** #closed_set #open_set #expression_problem

**Answer:**
Variant for a closed set of types known in one place (protocol messages, states, AST nodes in one module), especially when you keep adding operations. Inheritance for an open set that other modules extend (plugins, strategies), especially when you keep adding types.

**Explanation:**
- New operation: variant needs one new visitor; inheritance needs a new virtual in every class.
- New type: variant needs every visitor updated (the compiler lists them); inheritance needs one new class.
- Variant values are copyable, in place, no heap; polymorphic objects usually need `unique_ptr` and cannot be copied without a `clone()`.
- Variant is not extensible across library boundaries: users of a library cannot add an alternative.
- ❌ Common wrong answer: "variant is always better because it is faster."
- ✅ What a strong answer adds: this is the "expression problem"; the choice depends on which axis changes more.
- Deep dive: Topic 4, std::variant, std::visit and std::any

**Key takeaway:** Fixed types, growing operations: variant. Growing types, fixed operations: virtual.

---

#### Q8: What does `valueless_by_exception` mean? How do you avoid it?
**Difficulty:** #advanced
**Category:** #stl #exception_safety
**Concepts:** #valueless_by_exception #variant_npos #nothrow_move

**Answer:**
A variant becomes valueless when switching to a different alternative throws after the old object has been destroyed: it then holds no object, `index()` returns `variant_npos`, and `get`/`visit` throw `bad_variant_access`. Avoid it by making alternatives nothrow-move-constructible, so the implementation can build the new value in a temporary first.

**Explanation:**
- Typical trigger: `v = x` or `v.emplace<T>(...)` where `T`'s constructor (or copy) throws.
- For converting assignment the standard requires: if direct construction cannot throw, or `T` has no nothrow move, construct in place; otherwise build a temporary `T` and move it in, which protects the old value if the temporary's construction throws.
- `emplace` always destroys first, so a throwing `emplace` can make the variant valueless.
- Recover by assigning a new value.
- ❌ Common wrong answer: "A variant always holds one of its types."
- ✅ What a strong answer adds: `std::monostate` is the intended empty state; valueless is an error state, and code like `names[v.index()]` must not run on it.
- Deep dive: Topic 4, std::variant, std::visit and std::any

**Key takeaway:** Valueless = old destroyed, new failed; nothrow moves make it rare.

---

#### Q9: What exactly happens when `push_back` is called on a full vector?
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
- Deep dive: Topic 5, std::vector Internals

**Key takeaway:** Full vector + insert = new block, new element first, relocate, free old, every borrow dead.

---

#### Q10: What is special about `std::vector<bool>`?
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
- Deep dive: Topic 5, std::vector Internals

**Key takeaway:** `vector<bool>` is a bitset with a vector-like interface, not a vector of `bool`.

---

#### Q11: What is the correct way to erase elements from a container while iterating over it?
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
- Deep dive: Topic 6, Iterators and Invalidation Rules

**Key takeaway:** Continue from `erase`'s return value; for vectors, remove in one pass with `erase_if`.

---

#### Q12: A component keeps pointers to objects in a `std::vector` that keeps growing, and crashes appear after growth. How do you fix it?
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
- Deep dive: Topic 6, Iterators and Invalidation Rules

**Key takeaway:** Choose a handle that matches what the container guarantees: indices or ids for vectors, pointers only for stable storage.

---

#### Q13: How is `std::deque` implemented, and how can `d[i]` be O(1) if the storage is not contiguous?
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
- Deep dive: Topic 7, deque, list, forward_list, array and Adaptors

**Key takeaway:** deque = map of fixed-size blocks; index math replaces contiguity.

---

#### Q14: Both traversals are O(n). Why is iterating a `std::list` much slower than a `std::vector`?
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
- Deep dive: Topic 7, deque, list, forward_list, array and Adaptors

**Key takeaway:** Pointer chasing makes list traversal latency-bound; vector traversal is bandwidth-bound.

---

#### Q15: How do `insert`, `emplace`, `try_emplace` and `insert_or_assign` differ?
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
- Deep dive: Topic 8, std::map and std::set

**Key takeaway:** Insert-if-absent: `try_emplace`. Insert-or-overwrite: `insert_or_assign`.

---

#### Q16: How do you choose between `std::map` and `std::unordered_map`?
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
- Deep dive: Topic 8, std::map and std::set

**Key takeaway:** Order or worst-case guarantees: map. Average-case point lookups: unordered_map. Small or static: sorted vector.

---

#### Q17: How is std::unordered_map implemented internally?
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
- Deep dive: Topic 9, Unordered Containers and Hashing

**Key takeaway:** Buckets plus heap nodes: stable element addresses, at the price of allocations and cache misses.

---

#### Q18: Is lookup in unordered_map O(1)? What is the worst case and why?
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
- Deep dive: Topic 9, Unordered Containers and Hashing

**Key takeaway:** O(1) on average with a good hash; O(n) worst case; inserts are amortized because of rehash.

---

#### Q19: What does "instantiating a template" mean, and why do template definitions usually live in headers?
**Difficulty:** #beginner
**Category:** #templates #compilation
**Concepts:** #instantiation #headers #explicit_instantiation

**Answer:**
Instantiation is the compiler generating a concrete function or class from the template for specific arguments, at the point where it is used. To do that it needs the full definition in the same translation unit, so definitions go in headers; otherwise other translation units fail at link time with "undefined reference".

**Explanation:**
- Each distinct argument set is a separate entity: `Stack<int>` and `Stack<double>` share no code unless the optimizer folds identical functions.
- Explicit instantiation lets you keep the definition in a `.cpp`: `template class Stack<int>;` there, plus `extern template class Stack<int>;` in the header to stop other TUs from instantiating it (C++11). This works when the set of types is closed.
- Duplicate implicit instantiations across TUs are merged by the linker (they are inline-like entities), so the ODR is not violated.
- ❌ Common wrong answer: "Templates are compiled once into generic machine code." C++ templates are expanded per argument set; it is not type erasure like Java generics.
- ✅ What a strong answer adds: compile-time cost and binary bloat grow with instantiations; `extern template`, explicit instantiation and moving type-independent code into a non-template base reduce both.
- Deep dive: Topic 10, Templates: Deduction, Specialization and Variadics

**Key takeaway:** A template is a recipe compiled per use; the recipe must be visible where it is used.

---

#### Q20: Should you specialize a function template or overload it? Why?
**Difficulty:** #intermediate
**Category:** #templates #overloading
**Concepts:** #explicit_specialization #overload_resolution #partial_ordering

**Answer:**
Overload. Explicit specializations do not take part in overload resolution: the compiler first picks the best primary template (or non-template function), and only then checks whether that primary has a specialization for the deduced arguments. A specialization of a primary that loses is silently ignored.

**Explanation:**
- With `template<class T> void f(T)`, a specialization `f<int*>`, and an overload `template<class T> void f(T*)`, the call `f(&x)` picks the overload `f(T*)` (more specialized) and the specialization never runs.
- Moving the specialization after `f(T*)` changes which primary it belongs to (now `f(T*)` with `T = int`) and it is called: the behaviour depends on declaration order.
- Overloads are visible, rank by normal rules, and cannot be "attached" to the wrong primary.
- Exception: specializing `std::` customization points such as `std::hash<MyType>` (a class template) is correct and expected (see topic 09).
- ❌ Common wrong answer: "A specialization is just a more specific overload, so it wins." It is not a candidate at all.
- ✅ What a strong answer adds: for type-dependent behaviour inside one function, `if constexpr` is often cleaner than either.
- Deep dive: Topic 10, Templates: Deduction, Specialization and Variadics

**Key takeaway:** Customize function templates with overloads; full specializations are invisible to overload resolution.

---

#### Q21: What is SFINAE, and what exactly counts as a "substitution failure"?
**Difficulty:** #intermediate
**Category:** #templates #sfinae
**Concepts:** #substitution #immediate_context #overload_resolution

**Answer:**
Substitution Failure Is Not An Error: when the compiler substitutes deduced template arguments into a function template's signature and gets an invalid type or expression, that template is quietly dropped from the overload set instead of causing an error. Only failures in the immediate context of the signature count; errors in the body are hard errors.

**Explanation:**
- Immediate context: parameter types, return type (including trailing `decltype`), template parameter defaults, the C++20 `explicit(bool)` condition. Not the `noexcept` specifier: it is substituted only when needed, so an invalid `noexcept(T::value)` is a hard error.
- Hard errors (not SFINAE):
  - The function body (instantiated only after the function is selected).
  - `auto` return type deduction, because finding the type needs the body.
  - Errors inside another template that gets instantiated while forming the signature.
- After substitution, the surviving viable candidates are ranked by normal overload resolution.
- ❌ Common wrong answer: "If any overload fails to compile, the compiler tries the next one." Only signature substitution failures are forgiven.
- ✅ What a strong answer adds: the `auto len(T t) { return t.size(); }` example where `len(5)` is a hard error even with a `len(...)` fallback.
- Deep dive: Topic 11, SFINAE, Type Traits and Concepts

**Key takeaway:** SFINAE removes candidates whose signature cannot be formed; it never rescues errors inside bodies.

---

#### Q22: What are concepts, and what do they improve over SFINAE?
**Difficulty:** #beginner
**Category:** #templates #concepts
**Concepts:** #concepts #constraints #diagnostics

**Answer:**
A concept (C++20) is a named compile-time predicate on template arguments, used to constrain templates: `template <std::integral T> T gcd(T, T)`. Compared with SFINAE they are readable, they produce errors at the call site that name the unsatisfied requirement, and constrained overloads are ordered by subsumption, so a more constrained overload beats a less constrained one.

**Explanation:**
- Constraints are checked after deduction, before the function is considered viable.
- No runtime cost: like SFINAE, they only decide which template is used.
- They also work on non-template members of class templates (`void push(T) requires std::copyable<T>;`), which SFINAE cannot do without making the member a template.
- Concepts check syntax (expressions compile, types exist); semantic requirements (e.g. "`<` is a strict weak order") are documented, not checked.
- ❌ Common wrong answer: "Concepts are like interfaces with virtual functions." There is no runtime dispatch or vtable; types satisfy them structurally, without inheriting.
- ✅ What a strong answer adds: the subsumption rule and its source-identity limitation.
- Deep dive: Topic 11, SFINAE, Type Traits and Concepts

**Key takeaway:** Concepts = named, ordered, readable constraints; same zero runtime cost as SFINAE.

---

#### Q23: `constexpr int sq(int x) { return x * x; }` then `int b = sq(10);`. Is `sq(10)` computed at compile time?
**Difficulty:** #intermediate
**Category:** #compile_time
**Concepts:** #manifestly_constant_evaluated #constant_folding

**Answer:**
Not by the language rules. `int b` is a non-const local, so its initializer is an ordinary run-time call. The optimizer may fold it to `100` at `-O2`, but that is an optimization, not a guarantee, and `std::is_constant_evaluated()` would still report `false` there.

**Explanation:**
- Compile time is guaranteed only in contexts that require a constant: `constexpr int a = sq(10);`, `static_assert`, array bounds, template arguments, `case` labels. For `const` integral initializers and statics the constant evaluation is attempted first and used when it succeeds.
- At `-O0` GCC emits a real call to `sq` for `int b = sq(10);`.
- To force it: `constexpr int b = sq(10);`, or make `sq` `consteval`.
- ❌ Common wrong answer: "Yes, the arguments are constants, so the compiler evaluates it at compile time."
- ✅ What a strong answer adds: in the `const int c = sq(10);` case the answer flips to yes, because a const integral variable with a constant initializer is usable in constant expressions; for `const double` it does not.
- Deep dive: Topic 12, constexpr, consteval and Compile-Time Programming

**Key takeaway:** The calling context, not the arguments, decides whether a constexpr call is compile-time.

---

#### Q24: What does `std::is_constant_evaluated()` do, and what is the classic mistake with it?
**Difficulty:** #intermediate
**Category:** #compile_time #cpp20
**Concepts:** #is_constant_evaluated #if_constexpr

**Answer:**
It returns `true` when the current evaluation is a manifestly constant-evaluated context, so one function can choose a constexpr-friendly algorithm at compile time and a faster run-time implementation (intrinsics, `memcpy`, SIMD) otherwise. The classic mistake is `if constexpr (std::is_constant_evaluated())`, which is always `true`.

**Explanation:**
```cpp
#include <cstdio>
#include <type_traits>

constexpr int mode() {
    if (std::is_constant_evaluated()) return 1;   // compile-time path
    return 2;                                      // run-time path
}

int main() {
    constexpr int a = mode();
    int b = mode();
    std::printf("%d %d\n", a, b);
}
```
- Output: `1 2`.
- The `if constexpr` condition is itself evaluated as a constant, so `is_constant_evaluated()` is `true` there and the run-time branch is discarded. GCC warns "always evaluates to true in 'if constexpr'".
- ❌ Common wrong answer: "Use `if constexpr` because the check is about compile time."
- ✅ What a strong answer adds: C++23 `if consteval` replaces it and also allows calling consteval functions in the compile-time branch.
- Deep dive: Topic 12, constexpr, consteval and Compile-Time Programming

**Key takeaway:** Use plain `if (std::is_constant_evaluated())`, never `if constexpr`; in C++23 prefer `if consteval`.

---
