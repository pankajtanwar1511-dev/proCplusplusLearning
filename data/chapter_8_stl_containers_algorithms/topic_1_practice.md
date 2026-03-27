## TOPIC: std::vector - Dynamic Contiguous Array

### PRACTICE_TASKS: Output Prediction and Code Analysis

#### Q1
```cpp
std::vector<int> v;
std::cout << v.capacity() << " " << v.size();
v.reserve(10);
std::cout << " " << v.capacity() << " " << v.size();
```

**Answer:**
```
0 0 10 0
```

**Explanation:**
- Default-constructed vector is empty
- `capacity()` returns allocated storage capacity (0 initially)
- `size()` returns number of elements (0 initially)
- `reserve(10)` allocates storage for 10 elements
- reserve only affects capacity, NOT size
- No elements constructed, size remains 0
- After reserve: capacity ≥ 10 (implementation may allocate more)
- Common use: pre-allocate before many push_back operations
- Avoids repeated reallocations during growth
- **Key Concept:** reserve() pre-allocates capacity without changing size; prevents reallocation overhead

---

#### Q2
```cpp
std::vector<int> v = {1, 2, 3, 4, 5};
v.erase(v.begin() + 2);
for (int x : v) std::cout << x << " ";
```

**Answer:**
```
1 2 4 5
```

**Explanation:**
- Vector initially: {1, 2, 3, 4, 5}
- `v.begin() + 2` points to third element (index 2, value 3)
- `erase()` removes element at that position
- Elements after erased position shifted left to fill gap
- Result: {1, 2, 4, 5} (element 3 removed)
- Time complexity: O(n) due to shifting
- Invalidates iterators at and after erase point
- Size decreases by 1
- Capacity unchanged (no reallocation)
- **Key Concept:** vector::erase() removes element and shifts subsequent elements left; O(n) operation

---

#### Q3
```cpp
std::vector<int> v1 = {1, 2, 3};
std::vector<int> v2 = v1;
v1[0] = 10;
std::cout << v2[0];
```

**Answer:**
```
1
```

**Explanation:**
- `std::vector<int> v2 = v1` invokes copy constructor
- Vector performs deep copy of all elements
- v2 gets its own independent storage
- v1 and v2 have separate memory allocations
- Modifying v1[0] = 10 only affects v1
- v2[0] remains 1 (unchanged)
- Each vector owns its data
- Time complexity: O(n) for copy
- Contrast with shallow copy (pointers): would share data
- **Key Concept:** Vector copy constructor performs deep copy; copied vectors are independent with separate storage

---

#### Q4
```cpp
std::vector<int> v(5, 10);
std::cout << v.size() << " ";
for (int x : v) std::cout << x << " ";
```

**Answer:**
```
5 10 10 10 10 10
```

**Explanation:**
- `std::vector<int> v(5, 10)` uses fill constructor (parentheses)
- First parameter: count (5 elements)
- Second parameter: value (each element = 10)
- Creates vector with 5 copies of value 10
- All elements initialized to same value
- Size is 5, each element is 10
- Useful for pre-sized vectors with default value
- NOT initializer list (that uses braces)
- **Key Concept:** vector(size_t count, T value) fill constructor with parentheses creates count copies of value

---

#### Q5
```cpp
std::vector<int> v{5, 10};
std::cout << v.size() << " ";
for (int x : v) std::cout << x << " ";
```

**Answer:**
```
2 5 10
```

**Explanation:**
- `std::vector<int> v{5, 10}` uses initializer_list constructor (braces)
- Braces trigger initializer_list overload
- Creates vector with elements {5, 10}
- Size is 2, elements are 5 and 10
- NOT fill constructor (that uses parentheses)
- Compare: v(5, 10) creates 5 elements of value 10
- Compare: v{5, 10} creates 2 elements: 5 and 10
- Brace initialization always prefers initializer_list constructor
- Common confusion: braces vs parentheses behavior
- **Key Concept:** Braces invoke initializer_list constructor; creates vector from list values, not fill pattern

---

#### Q6
```cpp
std::vector<int> v = {1, 2, 3};
v.insert(v.begin() + 1, 99);
for (int x : v) std::cout << x << " ";
```

**Answer:**
```
1 99 2 3
```

**Explanation:**
- Vector initially: {1, 2, 3}
- `v.begin() + 1` points to second element (index 1, value 2)
- `insert(pos, value)` inserts 99 BEFORE position
- Elements at and after position shifted right
- Result: {1, 99, 2, 3}
- 99 inserted between 1 and 2
- Time complexity: O(n) due to shifting
- May trigger reallocation if capacity exceeded
- Reallocation invalidates all iterators
- No reallocation: invalidates iterators at and after insert point
- **Key Concept:** vector::insert() inserts before position and shifts elements right; O(n) operation

---

#### Q7
```cpp
std::vector<int> v = {1, 2, 3, 4, 5};
v.erase(std::remove(v.begin(), v.end(), 3), v.end());
std::cout << v.size();
```

**Answer:**
```
4
```

**Explanation:**
- Erase-remove idiom for removing values from vector
- `std::remove(begin, end, 3)` moves all non-3 elements to front
- Returns iterator to new logical end (past last kept element)
- Does NOT actually remove elements (size unchanged after remove)
- Elements after new end are in unspecified state
- `v.erase(new_end, v.end())` erases from new end to old end
- Actually removes elements and updates size
- Result: {1, 2, 4, 5}, size = 4
- Why two steps? std::remove is algorithm (doesn't know container type)
- Only container's erase() can modify size
- **Key Concept:** Erase-remove idiom: std::remove moves, then erase actually removes; necessary pattern for value removal

---

#### Q8
```cpp
std::vector<int> v = {1, 2, 3};
v.resize(5);
std::cout << v[4];
```

**Answer:**
```
0
```

**Explanation:**
- Vector initially has size 3: {1, 2, 3}
- `resize(5)` increases size to 5
- Adds 2 new elements at end
- New elements default-initialized (value-initialized for scalar types)
- For int: default initialization = 0
- Result: {1, 2, 3, 0, 0}
- v[4] is the 5th element = 0
- resize can increase or decrease size
- If new size smaller: destroys excess elements
- If new size larger: constructs new elements
- **Key Concept:** resize() changes size; new elements default-initialized (0 for int, default ctor for objects)

---

#### Q9
```cpp
std::vector<int> v = {1, 2, 3, 4, 5};
v.resize(3);
std::cout << v.size() << " " << v.capacity();
```

**Answer:**
```
3 [capacity ≥ 5, typically unchanged]
```

**Explanation:**
- Vector initially: {1, 2, 3, 4, 5}, size=5, capacity≥5
- `resize(3)` decreases size to 3
- Destroys elements at positions 3 and 4 (values 4 and 5)
- Result: {1, 2, 3}, size=3
- Capacity remains unchanged (typically ≥ 5)
- resize(smaller) does NOT deallocate memory
- Capacity only decreases with shrink_to_fit() or swap trick
- Destroyed elements still occupy allocated capacity
- To actually free memory: v.shrink_to_fit()
- **Key Concept:** resize() to smaller size destroys elements but keeps capacity; memory not freed automatically

---

#### Q10
```cpp
std::vector<int> v;
v.resize(10);
v[5] = 100;
std::cout << v[0] << " " << v[5];
```

**Answer:**
```
0 100
```

**Explanation:**
- Empty vector initially (size 0)
- `resize(10)` creates 10 elements
- All elements default-initialized to 0 (for int)
- Result after resize: {0, 0, 0, 0, 0, 0, 0, 0, 0, 0}
- `v[5] = 100` modifies 6th element
- Result: {0, 0, 0, 0, 0, 100, 0, 0, 0, 0}
- v[0] still 0, v[5] now 100
- resize makes elements accessible via operator[]
- Without resize, v[5] would be undefined behavior (out of bounds)
- **Key Concept:** resize() creates accessible elements; default-initialized to 0 for scalar types

---

#### Q11
```cpp
std::vector<int> v = {1, 2, 3};
v.clear();
std::cout << v.size() << " " << v.capacity();
```

**Answer:**
```
0 3
```

**Explanation:**
- Vector initially: {1, 2, 3}, size=3, capacity≥3
- `clear()` destroys all elements
- Calls destructor for each element
- Size becomes 0 (no elements)
- Capacity remains unchanged (memory still allocated)
- Result: empty vector with allocated storage
- clear() does NOT deallocate memory
- To free memory: use shrink_to_fit() or swap trick
- After clear, vector is empty but ready for reuse
- Fast re-population (no reallocation needed if within capacity)
- **Key Concept:** clear() removes all elements but preserves capacity; memory not deallocated

---

#### Q12
```cpp
std::vector<int> v = {1, 2, 3};
auto it = v.begin();
v.push_back(4);
v.push_back(5);
// Assume reallocation occurred
std::cout << "Iterator still valid? ";
```

**Answer:**
```
No, undefined behavior if reallocation occurred
```

**Explanation:**
- `it = v.begin()` stores iterator to first element
- Vector initially: {1, 2, 3}, capacity likely 3
- `push_back(4)` and `push_back(5)` add elements
- If capacity exceeded, vector reallocates to larger storage
- Reallocation copies/moves elements to new memory
- Old memory deallocated
- Iterator `it` still points to old (freed) memory
- Using `it` after reallocation is undefined behavior
- May crash, return garbage, or appear to work
- Prevent: re-acquire iterator after modifications
- Check: if (capacity changed), iterator invalidated
- **Key Concept:** Vector reallocation invalidates all iterators/pointers/references; must re-acquire after push_back

---

#### Q13
```cpp
std::vector<int> v1 = {1, 2, 3};
std::vector<int> v2 = std::move(v1);
std::cout << v1.size() << " " << v2.size();
```

**Answer:**
```
0 3
```

**Explanation:**
- `std::move(v1)` casts v1 to rvalue reference
- Move constructor transfers v1's internal storage to v2
- v2 takes ownership of v1's allocated memory
- v1 left in moved-from state (valid but unspecified)
- Standard guarantees: v1.size() is 0 (empty state)
- v1's internal pointer typically set to nullptr
- No elements copied (efficient ownership transfer)
- Time complexity: O(1) - just pointer swap
- v1 can be safely destroyed or reassigned
- v2 now contains {1, 2, 3}
- **Key Concept:** Vector move constructor transfers ownership in O(1); source left empty/moved-from

---

#### Q14
```cpp
std::vector<int> v = {3, 1, 4, 1, 5};
std::sort(v.begin(), v.end());
for (int x : v) std::cout << x << " ";
```

**Answer:**
```
1 1 3 4 5
```

**Explanation:**
- Vector initially: {3, 1, 4, 1, 5}
- `std::sort(v.begin(), v.end())` sorts in ascending order
- Uses introsort (hybrid quicksort/heapsort/insertion sort)
- Time complexity: O(n log n) average and worst case
- Sorts in-place (modifies vector)
- Default comparison: operator< (less than)
- Result: {1, 1, 3, 4, 5}
- Duplicate 1s both present (sort is not unique)
- Can provide custom comparator as third argument
- Example: sort(begin, end, greater<int>()) for descending
- **Key Concept:** std::sort performs in-place O(n log n) sorting; default ascending order via operator<

---

#### Q15
```cpp
std::vector<int> v = {1, 2, 3};
v.emplace_back(4);
v.push_back(5);
std::cout << v.size();
```

**Answer:**
```
5
```

**Explanation:**
- Vector initially: {1, 2, 3}, size=3
- `emplace_back(4)` constructs element 4 in-place at end
- Size becomes 4
- `push_back(5)` copies/moves element 5 to end
- Size becomes 5
- Final result: {1, 2, 3, 4, 5}
- Both add one element, total size = 5
- Difference: emplace_back constructs in-place (avoids copy)
- push_back copies or moves existing object
- For primitives (int): no practical difference
- For complex objects: emplace_back more efficient (perfect forwarding)
- **Key Concept:** emplace_back and push_back both add elements; emplace_back constructs in-place for efficiency

---

#### Q16
```cpp
std::vector<int> v = {1, 2, 3, 4, 5};
std::reverse(v.begin(), v.end());
for (int x : v) std::cout << x << " ";
```

**Answer:**
```
5 4 3 2 1
```

**Explanation:**
- Vector initially: {1, 2, 3, 4, 5}
- `std::reverse(v.begin(), v.end())` reverses elements in-place
- Algorithm swaps elements from both ends working inward
- Time complexity: O(n/2) = O(n)
- Result: {5, 4, 3, 2, 1}
- Modifies vector in-place (no new vector created)
- Works with bidirectional iterators (vector, list, deque)
- Does not work with forward-only iterators
- Alternative: std::reverse_iterator for non-modifying reverse access
- **Key Concept:** std::reverse reverses container elements in-place in O(n) time

---

#### Q17
```cpp
std::vector<int> v = {1, 1, 2, 2, 3};
auto it = std::unique(v.begin(), v.end());
std::cout << (it - v.begin());
```

**Answer:**
```
3
```

**Explanation:**
- Vector initially: {1, 1, 2, 2, 3}
- `std::unique(v.begin(), v.end())` removes consecutive duplicates
- Moves unique elements to front: {1, 2, 3, ?, ?}
- Elements after new end are in unspecified state
- Returns iterator to new logical end (past last unique element)
- `it - v.begin()` calculates distance: 3 elements kept
- Does NOT erase elements (size unchanged)
- Use erase-unique idiom to actually remove: `v.erase(unique(...), v.end())`
- Requires sorted input for complete duplicate removal
- For unsorted: sort first, then unique
- **Key Concept:** std::unique removes consecutive duplicates and returns new end; combine with erase to shrink vector

---

#### Q18
```cpp
const std::vector<int> v = {1, 2, 3};
auto it = v.begin();
*it = 10;  // Will this compile?
```

**Answer:**
```
Compilation error
```

**Explanation:**
- `const std::vector<int> v` declares const vector
- `v.begin()` on const vector returns const_iterator
- const_iterator is read-only (like const T*)
- `auto it` deduces to const_iterator
- `*it = 10` attempts to modify through const_iterator
- Compilation error: cannot assign to const reference
- const_iterator provides read access only
- To modify: vector must be non-const
- const_correctness prevents accidental modification
- Compare: non-const v.begin() returns iterator (can modify)
- **Key Concept:** Const containers return const_iterator; cannot modify elements through const_iterator

---

#### Q19
```cpp
std::vector<int> v = {1, 2, 3, 4, 5};
v.assign(3, 100);
std::cout << v.size() << " ";
for (int x : v) std::cout << x << " ";
```

**Answer:**
```
3 100 100 100
```

**Explanation:**
- Vector initially: {1, 2, 3, 4, 5}, size=5
- `assign(3, 100)` replaces all existing elements
- Destroys all current elements
- Creates 3 new elements, each with value 100
- Result: {100, 100, 100}, size=3
- assign is like clear() + resize() + fill
- Capacity may change if needed
- Can also use assign with iterators: assign(begin, end)
- Or with initializer list: assign({1, 2, 3})
- Efficient way to completely replace vector contents
- **Key Concept:** assign() replaces all elements; destroys existing and creates new with specified values

---

#### Q20
```cpp
std::vector<int> v = {5, 2, 8, 1, 9};
std::partial_sort(v.begin(), v.begin() + 3, v.end());
for (int i = 0; i < 3; ++i) std::cout << v[i] << " ";
```

**Answer:**
```
1 2 5
```

**Explanation:**
- Vector initially: {5, 2, 8, 1, 9}
- `std::partial_sort(begin, begin+3, end)` partially sorts
- Sorts first 3 elements (begin to begin+3)
- These 3 are the smallest elements in sorted order
- Rest of elements (after begin+3) in unspecified order
- Result: first 3 positions contain {1, 2, 5} sorted
- Last 2 positions contain {8, 9} in undefined order
- Time complexity: O(n log k) where k=3 (number to sort)
- More efficient than full sort when k << n
- Use case: "find top 10 elements" without sorting all
- Implements heap-based algorithm
- **Key Concept:** partial_sort efficiently sorts first k elements; O(n log k) vs O(n log n) for full sort

---
