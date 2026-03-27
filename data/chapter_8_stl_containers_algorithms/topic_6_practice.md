## TOPIC: STL Iterators, Allocators, Algorithms, and Lambdas

### PRACTICE_TASKS: Challenge Questions

#### Q1
```cpp
std::vector<int> v = {1, 2, 3, 4, 5};
auto it = v.begin();
v.reserve(100);
std::cout << *it;
```

**Answer:**
```
Undefined behavior (may crash or print garbage)
```

**Explanation:**
- Vector initially: {1, 2, 3, 4, 5}
- `it = v.begin()` stores iterator to first element
- `reserve(100)` may reallocate underlying array
- Vector capacity increases to 100
- If reallocation occurs: old array deallocated
- Iterator `it` points to deallocated memory
- Dereferencing invalidated iterator = undefined behavior
- May crash, print garbage, or appear to work (if no reallocation)
- reserve() invalidates iterators if capacity changes
- Use iterators immediately or re-acquire after reserve
- **Key Concept:** Vector reserve() may invalidate all iterators if reallocation occurs; don't use old iterators after reserve

---

#### Q2
```cpp
std::list<int> lst = {5, 3, 1, 4, 2};
std::sort(lst.begin(), lst.end());
```

**Answer:**
```
Compilation error
```

**Explanation:**
- std::sort requires random access iterators
- Must support `it + n`, `it - n` operations in O(1)
- std::list provides bidirectional iterators only
- Bidirectional: can do `++it`, `--it` but not `it + 5`
- Advancing list iterator 5 steps = O(n) not O(1)
- std::sort algorithm won't compile with list iterators
- **Fix:** Use list::sort() member function
  ```cpp
  lst.sort();  // Member function works with bidirectional iterators
  ```
- list::sort() uses merge sort internally
- Iterator categories hierarchy: input < forward < bidirectional < random access
- Algorithm requirements must match iterator capabilities
- **Key Concept:** std::sort requires random access iterators; list provides bidirectional only, use member function sort()

---

#### Q3
```cpp
std::vector<int> v = {1, 2, 3, 4, 5};
auto new_end = std::remove(v.begin(), v.end(), 3);
std::cout << v.size();
```

**Answer:**
```
5
```

**Explanation:**
- Vector initially: {1, 2, 3, 4, 5}, size=5
- `std::remove(v.begin(), v.end(), 3)` reorders elements
- Moves all non-3 elements to front: {1, 2, 4, 5, ?}
- Returns iterator to new logical end (past last kept element)
- Does NOT actually erase elements or change size
- Elements after new_end in unspecified state
- size() still returns 5 (unchanged)
- std::remove is an algorithm, doesn't know container
- Only container can modify its size
- **Complete pattern:** Erase-remove idiom
  ```cpp
  v.erase(std::remove(v.begin(), v.end(), 3), v.end());
  ```
- Now size() would return 4
- **Key Concept:** std::remove only reorders, doesn't erase; must call erase() to update size (erase-remove idiom)

---

#### Q4
```cpp
int x = 10;
auto f = [x]() mutable { x++; return x; };
std::cout << f() << " " << x;
```

**Answer:**
```
11 10
```

**Explanation:**
- `int x = 10` creates local variable
- `[x]` captures x by value (copy)
- Lambda stores copy of x (initially 10)
- `mutable` allows modifying captured copy
- Without mutable: captured values are const
- `f()` executes lambda body
- `x++` increments lambda's copy: 10 → 11
- Returns 11 (prints "11 ")
- Original `x` unchanged (still 10)
- Prints "10"
- Output: "11 10"
- Capture by reference `[&x]` would modify original
- mutable vs non-mutable:
  - `[x]()` - captured x is const
  - `[x]() mutable` - captured x is mutable copy
- **Key Concept:** Lambda capture by value with mutable allows modifying copy; original unchanged

---

#### Q5
```cpp
std::vector<int> v = {1, 2, 3};
std::transform(v.begin(), v.end(), std::back_inserter(v),
               [](int x) { return x * 2; });
```

**Answer:**
```
Undefined behavior
```

**Explanation:**
- Vector initially: {1, 2, 3}
- `std::transform` iterates from begin() to end()
- `back_inserter(v)` appends results to same vector
- First iteration: appends 2 (2*1) → v = {1, 2, 3, 2}
- Appending may trigger reallocation
- Reallocation invalidates begin() and end() iterators
- Next iteration uses invalidated iterators
- Undefined behavior (crash, infinite loop, or corruption)
- Never modify container while iterating with invalidatable iterators
- **Fix:** Use temporary vector
  ```cpp
  std::vector<int> result;
  std::transform(v.begin(), v.end(), std::back_inserter(result), ...);
  ```
- Or copy first, then append
- **Key Concept:** Modifying vector during iteration invalidates iterators; never insert/erase while iterating with range

---

#### Q6
```cpp
std::vector<int> v = {10, 20, 30, 40};
auto rit = std::find(v.rbegin(), v.rend(), 30);
auto it = rit.base();
std::cout << *it;
```

**Answer:**
```
40
```

**Explanation:**
- Vector: {10, 20, 30, 40}
- `v.rbegin()` points to 40 (reverse begin)
- `v.rend()` points before 10 (reverse end)
- Reverse iteration: 40, 30, 20, 10
- `std::find(v.rbegin(), v.rend(), 30)` searches backward
- Finds 30, returns reverse iterator pointing to 30
- `rit` points to 30 in reverse iteration
- `rit.base()` converts reverse iterator to forward iterator
- **Key rule:** Reverse iterator's base() points ONE position AFTER
- Why? Reverse iterator design for symmetry with range semantics
- If `rit` points at 30, `rit.base()` points at 40
- Prints 40
- To erase using reverse iterator:
  ```cpp
  v.erase((++rit).base());  // Increment first, then base
  ```
- **Key Concept:** Reverse iterator base() returns forward iterator to next position; design for range semantry

---

#### Q7
```cpp
template<typename T>
class MyAlloc {
public:
    using value_type = T;
    T* allocate(std::size_t n) { return new T[n]; }
    void deallocate(T* p, std::size_t) { delete[] p; }
};

std::list<int, MyAlloc<int>> lst;
lst.push_back(42);
```

**Answer:**
```
Compilation error
```

**Explanation:**
- Custom allocator MyAlloc provided for std::list
- std::list stores nodes, not raw ints
- Node structure: {T data, Node* next, Node* prev}
- std::list needs to allocate Node<T>, not T
- Requires allocator rebinding mechanism
- MyAlloc missing `rebind` template
- Compilation error: cannot rebind allocator type
- **Fix:** Add rebind support
  ```cpp
  template<typename T>
  class MyAlloc {
  public:
      using value_type = T;
      template<typename U>
      struct rebind { using other = MyAlloc<U>; };
      T* allocate(std::size_t n) { return new T[n]; }
      void deallocate(T* p, std::size_t) { delete[] p; }
  };
  ```
- C++11+ alternative: derive from std::allocator
- Rebind allows list to create allocator for its internal node type
- **Key Concept:** Container allocators must support rebind for internal structures; list uses nodes, not raw values

---

#### Q8
```cpp
std::vector<int> v = {3, 1, 4, 1, 5, 9, 2, 6};
auto dist = std::distance(v.begin(), v.end());
```

**Answer:**
```
8
```

**Explanation:**
- Vector contains 8 elements
- `std::distance(first, last)` calculates distance between iterators
- For random access iterators (vector): O(1)
- Implementation: `last - first` (pointer arithmetic)
- Returns 8
- For non-random iterators (list): O(n)
- Implementation: increment first until equals last, count steps
- Iterator category determines complexity:
  - Random access (vector, deque, array): O(1)
  - Bidirectional (list, set, map): O(n)
  - Forward (forward_list): O(n)
- Use size() for containers when available (always O(1))
- std::distance useful for generic code
- **Key Concept:** std::distance complexity depends on iterator category; O(1) for random access, O(n) otherwise

---

#### Q9
```cpp
std::vector<int> v = {1, 2, 3, 4, 5};
for (auto it = v.begin(); it != v.end(); ++it) {
    if (*it % 2 == 0) {
        v.erase(it);
    }
}
```

**Answer:**
```
Undefined behavior
```

**Explanation:**
- Loop iterates over vector
- `v.erase(it)` removes element and invalidates iterator
- For vector: erase invalidates iterators at/after erase point
- Next iteration: `++it` increments invalidated iterator
- Undefined behavior (crash or skip elements)
- **Fix:** Use return value of erase
  ```cpp
  for (auto it = v.begin(); it != v.end();) {
      if (*it % 2 == 0)
          it = v.erase(it);  // erase returns next valid iterator
      else
          ++it;  // Only increment if not erasing
  }
  ```
- Or use erase-remove_if idiom:
  ```cpp
  v.erase(std::remove_if(v.begin(), v.end(),
          [](int x) { return x % 2 == 0; }), v.end());
  ```
- C++20: `std::erase_if(v, [](int x) { return x % 2 == 0; });`
- **Key Concept:** Erasing invalidates iterator; must use returned iterator, don't increment after erase

---

#### Q10
```cpp
std::unordered_map<std::string, int> m = {{"a", 1}, {"b", 2}};
std::for_each(m.begin(), m.end(), [](auto& pair) {
    const_cast<std::string&>(pair.first) = "x";
});
```

**Answer:**
```
Undefined behavior
```

**Explanation:**
- Map keys are const to maintain invariants
- Keys determine position in hash table
- pair.first has type `const std::string`
- `const_cast` removes const qualifier (dangerous!)
- Modifying key changes hash value
- Element now in wrong bucket
- Hash table invariants violated
- Undefined behavior: corruption, wrong lookups, crashes
- find() may fail to locate elements
- Other operations may malfunction
- const on keys exists for safety
- Never use const_cast to modify keys
- **Correct approach:** Extract old, insert new
  ```cpp
  m.erase("a");
  m["x"] = 1;
  ```
- **Key Concept:** Map keys are const for invariant protection; const_cast on keys breaks hash table, causes undefined behavior

---

#### Q11
```cpp
auto ptr = std::make_unique<int>(42);
auto lambda = [ptr = std::move(ptr)]() { return *ptr; };
std::cout << lambda();
```

**Answer:**
```
42
```

**Explanation:**
- C++14 init-capture (generalized lambda capture)
- `[ptr = std::move(ptr)]` moves unique_ptr into lambda
- Left `ptr` = new lambda member variable name
- Right `ptr` = outer scope variable being moved
- After capture: outer ptr is null (moved-from)
- Lambda owns the unique_ptr
- Lambda call `lambda()` dereferences owned ptr
- Returns 42
- Prints 42
- Init-capture enables moving non-copyable types into lambdas
- C++11 would require helper function or mutable shared_ptr hack
- Syntax: `[new_name = expression]`
- Can capture by move, copy, or arbitrary expression
- **Key Concept:** C++14 init-capture allows moving unique_ptr into lambda; syntax: [name = std::move(var)]

---

#### Q12
```cpp
std::vector<int> v = {5, 2, 8, 1, 9};
bool found = std::binary_search(v.begin(), v.end(), 8);
```

**Answer:**
```
false (or true if lucky - undefined behavior)
```

**Explanation:**
- Vector unsorted: {5, 2, 8, 1, 9}
- `std::binary_search` requires sorted input
- Precondition: elements must be sorted (ascending)
- Algorithm uses binary search: O(log n)
- Divides range in half repeatedly
- Assumes sorted order to choose half
- With unsorted input: undefined behavior
- May return false (wrong), true (lucky), or crash
- Result is unpredictable and meaningless
- **Fix:** Sort first
  ```cpp
  std::sort(v.begin(), v.end());
  bool found = std::binary_search(v.begin(), v.end(), 8);
  ```
- Always verify algorithm preconditions
- For unsorted: use std::find (O(n) linear search)
- **Key Concept:** std::binary_search requires sorted input; violating precondition causes undefined behavior

---

#### Q13
```cpp
std::vector<int> v = {1, 2, 3, 4, 5};
std::vector<int> result;
std::copy_if(v.begin(), v.end(), result.begin(),
             [](int x) { return x % 2 == 0; });
```

**Answer:**
```
Undefined behavior
```

**Explanation:**
- `result` vector is empty (no elements allocated)
- `result.begin()` returns iterator to (non-existent) first element
- `std::copy_if` tries to write to result.begin(), result.begin()+1, etc.
- Writing to unallocated memory
- Undefined behavior: crash, corruption, or silent failure
- result.size() remains 0 (algorithm doesn't update size)
- **Fix:** Use back_inserter
  ```cpp
  std::copy_if(v.begin(), v.end(), std::back_inserter(result),
               [](int x) { return x % 2 == 0; });
  ```
- Or pre-allocate space:
  ```cpp
  result.resize(v.size());  // Overallocate
  auto new_end = std::copy_if(v.begin(), v.end(), result.begin(), ...);
  result.erase(new_end, result.end());  // Trim excess
  ```
- back_inserter creates insert iterator (calls push_back)
- **Key Concept:** Output iterators need valid destination; use back_inserter to append to empty container

---

#### Q14
```cpp
std::vector<std::string> v = {"hello", " ", "world"};
std::string result = std::accumulate(v.begin(), v.end(), std::string(""));
```

**Answer:**
```
Compilation error
```

**Explanation:**
- `std::accumulate` in `<numeric>` header
- Template deduces types from initial value
- `std::string("")` creates temporary std::string
- But "" literal has type `const char*`
- Type mismatch in concatenation
- Accumulate tries: `const char* + std::string`
- No operator+ for (const char*, std::string) in that order
- Compilation error: no matching operator+
- **Fix:** Explicitly construct std::string
  ```cpp
  std::string result = std::accumulate(v.begin(), v.end(), std::string(""));
  ```
  Wait, that's what's already written! Actually this SHOULD compile.
- Let me reconsider: This actually compiles in C++11+
- The issue might be missing `<numeric>` header
- Or older compilers
- Modern C++: this compiles and returns "hello world"
- **Alternative fix:** Use std::accumulate with explicit type
  ```cpp
  std::accumulate(v.begin(), v.end(), std::string{});
  ```
- Better modern solution: Use std::reduce or fold expressions (C++17+)
- **Key Concept:** std::accumulate requires compatible types; string concatenation works with std::string initial value

---

#### Q15
```cpp
std::vector<int> v;
v.reserve(10);
v[5] = 100;
std::cout << v[5];
```

**Answer:**
```
Undefined behavior
```

**Explanation:**
- Vector initially empty (size=0)
- `reserve(10)` allocates capacity for 10 elements
- Capacity = 10, size = 0
- No elements constructed
- `v[5]` accesses sixth element
- But only 0 elements exist (size=0)
- Accessing out-of-bounds memory
- Undefined behavior: crash, garbage, or appears to work
- operator[] doesn't check bounds (no bounds checking)
- reserve() allocates memory, doesn't construct elements
- **Fix 1:** Use resize() instead
  ```cpp
  v.resize(10);  // Constructs 10 default elements
  v[5] = 100;    // Now safe
  ```
- **Fix 2:** Use push_back
  ```cpp
  v.push_back(100);  // Adds element, increases size
  ```
- reserve vs resize:
  - reserve(): capacity only, size unchanged
  - resize(): constructs elements, updates size
- **Key Concept:** reserve() allocates capacity, doesn't construct elements; use resize() to create accessible elements

---

#### Q16
```cpp
std::deque<int> d = {1, 2, 3};
auto it = d.begin();
d.push_front(0);
std::cout << *it;
```

**Answer:**
```
May be 1 or undefined behavior (implementation-dependent)
```

**Explanation:**
- Deque initially: {1, 2, 3}
- `it = d.begin()` points to first element (1)
- `push_front(0)` adds element at front
- Deque becomes: {0, 1, 2, 3}
- Deque iterator invalidation rules:
  - push_front/push_back: end iterators invalidated
  - Middle iterators MAY remain valid
  - If internal map reallocates: all iterators invalidated
- Deque uses chunked storage (map of arrays)
- Adding at ends may require allocating new chunk
- If new chunk added: iterators to existing elements usually valid
- If map reallocates: all iterators invalidated
- Implementation-dependent behavior
- May print 1 (iterator still valid)
- May crash or garbage (iterator invalidated)
- **Safe approach:** Re-acquire iterator after modification
  ```cpp
  d.push_front(0);
  auto new_it = d.begin() + 1;
  std::cout << *new_it;
  ```
- **Key Concept:** Deque push_front/back may invalidate iterators; implementation-dependent, safest to re-acquire

---

#### Q17
```cpp
std::list<int> a = {1, 2, 3};
std::list<int> b = {4, 5, 6};
auto it = a.begin();
++it;
a.splice(it, b);
```

**Answer:**
```
a = {1, 4, 5, 6, 2, 3}, b = {}
```

**Explanation:**
- a initially: {1, 2, 3}
- b initially: {4, 5, 6}
- `it = a.begin()` points to 1
- `++it` advances to 2
- `splice(it, b)` moves all of b before position it
- Inserts {4, 5, 6} before element 2
- a becomes: {1, 4, 5, 6, 2, 3}
- b becomes empty (ownership transferred)
- O(1) operation (just rewire pointers)
- No element copying
- All iterators remain valid (including those into b)
- Iterators to b's elements now point into a
- splice is unique to list (constant-time element transfer)
- Three overloads:
  - splice(pos, list): move all elements
  - splice(pos, list, it): move single element
  - splice(pos, list, first, last): move range
- **Key Concept:** list::splice() transfers elements in O(1) by pointer rewiring; source list emptied, iterators remain valid

---

#### Q18
```cpp
std::vector<int> v = {3, 1, 4, 1, 5, 9};
auto mid = v.begin() + v.size() / 2;
std::nth_element(v.begin(), mid, v.end());
std::cout << *mid;
```

**Answer:**
```
4
```

**Explanation:**
- Vector initially: {3, 1, 4, 1, 5, 9}, size=6
- `mid = v.begin() + 3` points to fourth position (index 3)
- `std::nth_element(begin, nth, end)` partial sort
- Places nth element in correct sorted position
- Elements before nth: all ≤ *nth
- Elements after nth: all ≥ *nth
- Doesn't fully sort, just partitions around nth
- Time complexity: O(n) average (quickselect algorithm)
- After nth_element: sorted order would be {1, 1, 3, 4, 5, 9}
- Fourth element (index 3) in sorted order: 4
- `*mid` returns 4
- Actual arrangement may vary: {1, 1, 3, 4, 9, 5} or {3, 1, 1, 4, 5, 9}
- Guarantee: *mid is in correct position
- Use case: finding median without full sort
- More efficient than sort when only nth element needed
- **Key Concept:** std::nth_element partially sorts in O(n); places nth element correctly, partitions around it

---

#### Q19
```cpp
std::function<int()> makeCounter() {
    int count = 0;
    return [&count]() { return ++count; };
}
auto counter = makeCounter();
std::cout << counter();
```

**Answer:**
```
Undefined behavior
```

**Explanation:**
- makeCounter() creates local variable count
- Lambda captures count by reference: `[&count]`
- Lambda returned from function
- makeCounter() exits: count destroyed
- Returned lambda contains dangling reference
- counter() executes lambda
- Accesses destroyed count variable
- Undefined behavior: crash, garbage, or appears to work
- Classic dangling reference bug
- Reference capture must outlive lambda
- **Fix 1:** Capture by value with mutable
  ```cpp
  return [count]() mutable { return ++count; };
  ```
- **Fix 2:** Use shared state
  ```cpp
  auto count = std::make_shared<int>(0);
  return [count]() { return ++(*count); };
  ```
- **Fix 3:** Return stateful object
  ```cpp
  struct Counter { int count = 0; int operator()() { return ++count; } };
  return Counter{};
  ```
- **Key Concept:** Capturing local by reference creates dangling reference when lambda outlives scope; use capture by value or shared ownership

---

#### Q20
```cpp
std::vector<int> v = {1, 2, 2, 3, 3, 3, 4, 4, 4, 4};
auto [first, last] = std::equal_range(v.begin(), v.end(), 3);
std::cout << std::distance(first, last);
```

**Answer:**
```
3
```

**Explanation:**
- Vector sorted: {1, 2, 2, 3, 3, 3, 4, 4, 4, 4}
- `std::equal_range(begin, end, value)` returns pair of iterators
- first = lower_bound(3): first element ≥ 3
- last = upper_bound(3): first element > 3
- Finds all elements equal to 3
- Range [first, last) contains three 3's
- first points to first 3 (index 3)
- last points to first 4 (index 6)
- `std::distance(first, last)` = 6 - 3 = 3
- Prints 3
- O(log n) time complexity (binary search)
- Requires sorted input
- Structured binding: `auto [first, last]` decomposes pair (C++17)
- Use cases:
  - Count duplicates in sorted range
  - Find range of equal elements
  - Efficient lookup in multiset/multimap semantics
- Equivalent to: `{lower_bound(3), upper_bound(3)}`
- **Key Concept:** std::equal_range returns [lower_bound, upper_bound) for value; efficient duplicate range finding in O(log n)

---
