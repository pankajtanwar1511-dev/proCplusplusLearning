## TOPIC: std::list - Doubly Linked List Container

### PRACTICE_TASKS: Output Prediction and Code Analysis

#### Q1
```cpp
std::list<int> lst = {1, 2, 3, 4, 5};
lst.push_front(0);
lst.push_back(6);
std::cout << lst.front() << " " << lst.back();
```

**Answer:**
```
0 6
```

**Explanation:**
- List initially: {1, 2, 3, 4, 5}
- `push_front(0)` adds 0 at beginning (constant time O(1))
- List becomes: {0, 1, 2, 3, 4, 5}
- `push_back(6)` adds 6 at end (constant time O(1))
- List becomes: {0, 1, 2, 3, 4, 5, 6}
- `front()` returns reference to first element (0)
- `back()` returns reference to last element (6)
- Doubly linked list allows O(1) insertion at both ends
- Contrast with vector: push_front not available (would be O(n))
- **Key Concept:** List supports O(1) insertion at both ends with push_front/push_back

---

#### Q2
```cpp
std::list<int> lst = {1, 2, 3, 4, 5};
lst.pop_front();
lst.pop_back();
std::cout << lst.size();
```

**Answer:**
```
3
```

**Explanation:**
- List initially: {1, 2, 3, 4, 5}, size=5
- `pop_front()` removes first element (1)
- List becomes: {2, 3, 4, 5}, size=4
- `pop_back()` removes last element (5)
- List becomes: {2, 3, 4}, size=3
- Both operations O(1) (constant time)
- No shifting required (just update pointers)
- Contrast with vector: pop_front would be O(n)
- pop_front/pop_back do not return the removed element
- **Key Concept:** List supports O(1) removal from both ends; no shifting overhead

---

#### Q3
```cpp
std::list<int> lst = {1, 2, 3, 2, 4, 2};
lst.remove(2);
std::cout << lst.size();
```

**Answer:**
```
3
```

**Explanation:**
- List initially: {1, 2, 3, 2, 4, 2}, size=6
- `remove(2)` removes ALL elements equal to 2
- Finds three occurrences of 2 and removes them
- Result: {1, 3, 4}, size=3
- Time complexity: O(n) - traverses entire list
- Member function, not algorithm (knows container structure)
- Directly removes nodes, updates size
- No need for erase-remove idiom (unlike vector)
- Contrast vector: needs std::remove + erase
- **Key Concept:** list::remove() directly removes all matching values; member function more efficient than algorithm

---

#### Q4
```cpp
std::list<int> lst = {5, 3, 1, 4, 2};
lst.sort();
for (int x : lst) std::cout << x << " ";
```

**Answer:**
```
1 2 3 4 5
```

**Explanation:**
- List initially: {5, 3, 1, 4, 2}
- `lst.sort()` sorts elements in ascending order
- Member function (not std::sort algorithm)
- std::sort requires random access iterators
- List has bidirectional iterators only
- Member sort() uses merge sort internally
- Time complexity: O(n log n)
- Stable sort (preserves relative order of equal elements)
- Result: {1, 2, 3, 4, 5}
- **Key Concept:** list::sort() is member function using merge sort; std::sort not applicable to lists

---

#### Q5
```cpp
std::list<int> lst = {1, 2, 3, 4, 5};
lst.reverse();
std::cout << lst.front() << " " << lst.back();
```

**Answer:**
```
5 1
```

**Explanation:**
- List initially: {1, 2, 3, 4, 5}
- `reverse()` reverses element order
- Result: {5, 4, 3, 2, 1}
- front() returns 5 (was last, now first)
- back() returns 1 (was first, now last)
- Member function (more efficient than std::reverse)
- Just rewires pointers, O(n) time
- No element copying or moving
- std::reverse would also work but less efficient
- **Key Concept:** list::reverse() efficiently reverses by rewiring pointers; O(n) with no copies

---

#### Q6
```cpp
std::list<int> a = {1, 2, 3};
std::list<int> b = {4, 5, 6};
a.splice(a.end(), b);
std::cout << a.size() << " " << b.size();
```

**Answer:**
```
6 0
```

**Explanation:**
- `splice(a.end(), b)` moves all elements from b to a
- Elements inserted at position (end of a)
- No copying - just rewires pointers (O(1) per element)
- b becomes empty after splice
- a becomes: {1, 2, 3, 4, 5, 6}
- Unique to list (vector doesn't have splice)
- Efficient constant-time transfer
- Iterators to spliced elements remain valid
- **Key Concept:** splice() transfers elements between lists in O(1) by rewiring pointers; no copies

---

#### Q7
```cpp
std::list<int> lst = {1, 1, 2, 2, 3, 3};
lst.unique();
std::cout << lst.size();
```

**Answer:**
```
3
```

**Explanation:**
- List initially: {1, 1, 2, 2, 3, 3}
- `unique()` removes consecutive duplicate elements
- Keeps first of each duplicate group
- Result: {1, 2, 3}, size=3
- Member function (more efficient than std::unique)
- Works on unsorted lists (only consecutive duplicates)
- For all duplicates: sort first, then unique
- Time complexity: O(n)
- **Key Concept:** list::unique() removes consecutive duplicates; sort first for complete deduplication

---

#### Q8
```cpp
std::list<int> lst = {1, 2, 3, 4, 5};
auto it = std::next(lst.begin(), 2);
lst.erase(it);
std::cout << lst.size();
```

**Answer:**
```
4
```

**Explanation:**
- List initially: {1, 2, 3, 4, 5}
- `std::next(lst.begin(), 2)` advances iterator 2 positions
- Points to third element (value 3)
- `erase(it)` removes element at iterator
- Result: {1, 2, 4, 5}, size=4
- O(1) erase for list (just rewire pointers)
- Contrast vector: O(n) due to shifting
- Only invalidates iterator to erased element
- Other iterators remain valid (iterator stability)
- **Key Concept:** list::erase() is O(1); only invalidates erased iterator, others stable

---

#### Q9
```cpp
std::list<int> lst = {1, 2, 3};
lst.resize(5);
std::cout << lst.size();
```

**Answer:**
```
5
```

**Explanation:**
- List initially: {1, 2, 3}, size=3
- `resize(5)` increases size to 5
- Adds 2 default-initialized elements at end
- For int: default = 0
- Result: {1, 2, 3, 0, 0}, size=5
- Creates new nodes for added elements
- Can also resize down (destroys excess nodes)
- **Key Concept:** resize() adds/removes elements to reach target size; new elements default-initialized

---

#### Q10
```cpp
std::list<int> lst = {1, 2, 3, 4, 5};
lst.clear();
std::cout << lst.size() << " " << lst.empty();
```

**Answer:**
```
0 1
```

**Explanation:**
- List initially: {1, 2, 3, 4, 5}
- `clear()` removes all elements
- Destroys each node
- size becomes 0
- `empty()` returns true (boolean true prints as 1)
- All iterators invalidated
- Time complexity: O(n) (destroys each element)
- List ready for reuse after clear
- **Key Concept:** clear() removes all elements; size=0, empty()=true

---

#### Q11
```cpp
std::list<int> a = {1, 3, 5};
std::list<int> b = {2, 4, 6};
a.merge(b);
std::cout << a.size() << " " << b.size();
```

**Answer:**
```
6 0
```

**Explanation:**
- Both lists assumed sorted: a={1,3,5}, b={2,4,6}
- `merge(b)` merges b into a in sorted order
- Result: a={1,2,3,4,5,6}, b=empty
- Moves nodes from b to a (no copying)
- Maintains sorted order
- Time complexity: O(n+m) linear
- Requires both lists pre-sorted
- If not sorted: behavior undefined
- b becomes empty after merge
- **Key Concept:** list::merge() combines sorted lists in linear time; moves elements, doesn't copy

---

#### Q12
```cpp
std::list<int> lst = {1, 2, 3};
lst.insert(std::next(lst.begin()), 99);
for (int x : lst) std::cout << x << " ";
```

**Answer:**
```
1 99 2 3
```

**Explanation:**
- List initially: {1, 2, 3}
- `std::next(lst.begin())` advances to second position
- Points to element 2
- `insert()` inserts BEFORE iterator position
- 99 inserted between 1 and 2
- Result: {1, 99, 2, 3}
- O(1) insertion for list
- No element shifting required
- All iterators remain valid (iterator stability)
- **Key Concept:** list::insert() is O(1); inserts before position without shifting

---

#### Q13
```cpp
std::list<int> lst = {1, 2, 3, 4, 5};
auto it = lst.begin();
lst.push_back(6);
std::cout << *it;
```

**Answer:**
```
1
```

**Explanation:**
- List initially: {1, 2, 3, 4, 5}
- `it = lst.begin()` points to first element (1)
- `push_back(6)` adds element at end
- Iterator `it` still valid, still points to first element
- List provides iterator stability (key advantage)
- Insertions don't invalidate existing iterators
- Only erased iterators become invalid
- Contrast vector: push_back may invalidate all iterators
- Prints 1 (iterator still points to first element)
- **Key Concept:** List provides iterator stability; insertions don't invalidate existing iterators

---

#### Q14
```cpp
std::list<int> lst = {1, 2, 3};
lst.emplace_front(0);
lst.emplace_back(4);
std::cout << lst.front() << " " << lst.back();
```

**Answer:**
```
0 4
```

**Explanation:**
- List initially: {1, 2, 3}
- `emplace_front(0)` constructs 0 in-place at front
- List becomes: {0, 1, 2, 3}
- `emplace_back(4)` constructs 4 in-place at back
- List becomes: {0, 1, 2, 3, 4}
- front() returns 0, back() returns 4
- emplace constructs directly (no copy/move)
- For primitives: similar to push
- For complex objects: more efficient
- **Key Concept:** emplace_front/back construct elements in-place; avoids copies for complex objects

---

#### Q15
```cpp
std::list<int> lst = {1, 2, 3, 4, 5};
lst.remove_if([](int x) { return x % 2 == 0; });
std::cout << lst.size();
```

**Answer:**
```
3
```

**Explanation:**
- List initially: {1, 2, 3, 4, 5}
- Lambda predicate: `[](int x) { return x % 2 == 0; }`
- Returns true for even numbers
- `remove_if()` removes elements where predicate returns true
- Removes 2 and 4 (even numbers)
- Result: {1, 3, 5}, size=3
- Member function (direct removal, no erase needed)
- Time complexity: O(n)
- Contrast vector: needs erase-remove_if idiom
- **Key Concept:** list::remove_if() removes elements matching predicate; more efficient than algorithm version

---

#### Q16
```cpp
std::list<int> lst = {1, 2, 3, 4, 5};
lst.resize(3);
std::cout << lst.size() << " " << lst.back();
```

**Answer:**
```
3 3
```

**Explanation:**
- List initially: {1, 2, 3, 4, 5}, size=5
- `resize(3)` shrinks to 3 elements
- Destroys elements at positions 3 and 4 (values 4 and 5)
- Result: {1, 2, 3}, size=3
- back() now returns 3 (new last element)
- Deallocates removed nodes
- Contrast vector: keeps capacity
- List always adjusts memory to actual size
- **Key Concept:** resize() to smaller size destroys excess elements and deallocates nodes

---

#### Q17
```cpp
std::list<int> a = {1, 2, 3};
std::list<int> b = {4, 5};
auto it = b.begin();
a.splice(a.end(), b, it);
std::cout << a.size() << " " << b.size();
```

**Answer:**
```
4 1
```

**Explanation:**
- a initially: {1, 2, 3}
- b initially: {4, 5}
- `it = b.begin()` points to first element of b (value 4)
- `splice(a.end(), b, it)` moves single element from b to a
- Element 4 moved to end of a
- Result: a={1,2,3,4}, b={5}
- O(1) operation (just rewire pointers)
- splice has 3 overloads: all elements, single element, range
- Moved element's iterator remains valid
- **Key Concept:** splice() can move single element; O(1) pointer rewiring

---

#### Q18
```cpp
const std::list<int> lst = {1, 2, 3};
auto it = lst.begin();
++it;
std::cout << *it;
```

**Answer:**
```
2
```

**Explanation:**
- Const list: {1, 2, 3}
- `begin()` returns const_iterator (read-only)
- `auto it` deduces to const_iterator
- `++it` advances iterator to second element
- `*it` reads value 2
- Cannot modify through const_iterator
- Attempting `*it = 10` would be compilation error
- const_iterator provides read-only access
- Can iterate and read, cannot modify
- **Key Concept:** Const containers return const_iterator; allows iteration and reading, no modification

---

#### Q19
```cpp
std::list<int> lst = {3, 1, 4, 1, 5, 9};
lst.sort();
lst.unique();
std::cout << lst.size();
```

**Answer:**
```
5
```

**Explanation:**
- List initially: {3, 1, 4, 1, 5, 9}
- `sort()` sorts in ascending order
- After sort: {1, 1, 3, 4, 5, 9}
- `unique()` removes consecutive duplicates
- Removes second 1 (now consecutive after sort)
- Result: {1, 3, 4, 5, 9}, size=5
- Common pattern: sort + unique for complete deduplication
- unique alone only removes consecutive duplicates
- sort brings duplicates together
- **Key Concept:** sort() + unique() pattern removes all duplicates; sort makes duplicates consecutive

---

#### Q20
```cpp
std::list<int> lst1 = {1, 2, 3};
std::list<int> lst2 = std::move(lst1);
std::cout << lst1.size() << " " << lst2.size();
```

**Answer:**
```
0 3
```

**Explanation:**
- List initially: lst1={1,2,3}
- `std::move(lst1)` casts to rvalue
- Move constructor transfers ownership of nodes
- lst2 takes lst1's internal pointers
- lst1 left in moved-from state (empty)
- O(1) operation (just pointer transfer)
- No node copying or allocation
- lst1 can be safely destroyed or reassigned
- lst2 now contains {1, 2, 3}
- **Key Concept:** List move constructor transfers node ownership in O(1); source left empty

---
