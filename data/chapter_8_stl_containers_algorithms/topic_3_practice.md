## TOPIC: Alternative Sequence Containers - Double-Ended Queue and Singly-Linked List

### PRACTICE_TASKS: Output Prediction and Code Analysis

#### Q1
```cpp
std::deque<int> dq;
dq.push_back(10);
dq.push_front(5);
std::cout << dq.front() << " " << dq.back();
```

**Answer:**
```
5 10
```

**Explanation:**
- Deque (double-ended queue) initially empty
- `push_back(10)` adds 10 at back: {10}
- `push_front(5)` adds 5 at front: {5, 10}
- Both operations O(1) constant time
- front() returns 5 (first element)
- back() returns 10 (last element)
- Deque supports efficient insertion at both ends
- Like vector + list combined benefits
- **Key Concept:** Deque supports O(1) push_front and push_back; double-ended efficient insertion

---

#### Q2
```cpp
std::deque<int> dq = {1, 2, 3, 4, 5};
dq.pop_front();
dq.pop_back();
std::cout << dq.size();
```

**Answer:**
```
3
```

**Explanation:**
- Deque initially: {1, 2, 3, 4, 5}, size=5
- `pop_front()` removes first element (1): {2, 3, 4, 5}
- `pop_back()` removes last element (5): {2, 3, 4}
- Result: size=3
- Both O(1) operations
- No shifting required (chunked storage)
- Like list but with random access
- **Key Concept:** Deque supports O(1) removal from both ends like list

---

#### Q3
```cpp
std::deque<int> dq = {1, 2, 3};
dq.insert(dq.begin() + 1, 99);
for (int x : dq) std::cout << x << " ";
```

**Answer:**
```
1 99 2 3
```

**Explanation:**
- Deque initially: {1, 2, 3}
- `dq.begin() + 1` points to second element (value 2)
- `insert()` inserts 99 before that position
- Result: {1, 99, 2, 3}
- Middle insertion O(n) like vector
- May need to shift elements
- Random access iterators enable pointer arithmetic
- More efficient if inserting near ends
- **Key Concept:** Deque insert in middle is O(n); efficient at ends, supports random access

---

#### Q4
```cpp
std::deque<int> dq = {5, 3, 1, 4, 2};
std::sort(dq.begin(), dq.end());
for (int x : dq) std::cout << x << " ";
```

**Answer:**
```
1 2 3 4 5
```

**Explanation:**
- Deque initially: {5, 3, 1, 4, 2}
- `std::sort(dq.begin(), dq.end())` sorts elements
- Deque provides random access iterators
- std::sort requires random access (unlike list)
- Time complexity: O(n log n)
- Result: {1, 2, 3, 4, 5}
- Deque advantage over list: can use std::sort
- List must use member function sort()
- **Key Concept:** Deque has random access iterators; compatible with std::sort unlike list

---

#### Q5
```cpp
std::deque<int> dq = {1, 2, 3, 4, 5};
std::cout << dq[0] << " " << dq[4];
```

**Answer:**
```
1 5
```

**Explanation:**
- Deque: {1, 2, 3, 4, 5}
- `dq[0]` accesses first element: 1
- `dq[4]` accesses fifth element: 5
- operator[] provides O(1) random access
- Implemented via chunked storage (not contiguous like vector)
- Deque uses map of fixed-size arrays
- Slightly slower than vector but still O(1)
- No bounds checking (like vector)
- **Key Concept:** Deque supports O(1) random access via operator[]; chunked storage, not contiguous

---

#### Q6
```cpp
std::forward_list<int> fl = {1, 2, 3, 4, 5};
fl.push_front(0);
std::cout << fl.front();
```

**Answer:**
```
0
```

**Explanation:**
- forward_list (singly-linked list) initially: {1, 2, 3, 4, 5}
- `push_front(0)` adds 0 at front: {0, 1, 2, 3, 4, 5}
- O(1) operation
- front() returns first element: 0
- NO push_back (singly-linked, no tail pointer)
- NO back() accessor (would require O(n) traversal)
- Memory efficient (one pointer per node vs two for list)
- **Key Concept:** forward_list only supports push_front; singly-linked for memory efficiency

---

#### Q7
```cpp
std::forward_list<int> fl = {1, 2, 3};
fl.insert_after(fl.before_begin(), 0);
std::cout << fl.front();
```

**Answer:**
```
0
```

**Explanation:**
- forward_list initially: {1, 2, 3}
- `before_begin()` returns iterator before first element
- Special iterator for forward_list (enables front insertion)
- `insert_after(before_begin(), 0)` inserts after "before first"
- Effectively inserts at front: {0, 1, 2, 3}
- front() returns 0
- Singly-linked: can only insert AFTER position
- before_begin() enables front insertion idiom
- **Key Concept:** forward_list uses insert_after with before_begin() for front insertion; singly-linked constraint

---

#### Q8
```cpp
std::forward_list<int> fl = {1, 2, 3, 2, 4};
fl.remove(2);
// How many elements remain?
```

**Answer:**
```
3
```

**Explanation:**
- forward_list initially: {1, 2, 3, 2, 4}
- `remove(2)` removes ALL occurrences of value 2
- Removes two instances of 2
- Result: {1, 3, 4}, 3 elements
- O(n) traversal
- Member function (more efficient than algorithm)
- No size() method (would require O(n))
- Count remaining: std::distance(begin(), end())
- **Key Concept:** forward_list::remove() removes all matching values; no size() member (use distance)

---

#### Q9
```cpp
std::forward_list<int> fl = {5, 3, 1, 4, 2};
fl.sort();
// What is the first element after sorting?
```

**Answer:**
```
1
```

**Explanation:**
- forward_list initially: {5, 3, 1, 4, 2}
- `sort()` sorts in ascending order
- Member function (std::sort not applicable)
- Requires forward iterators only
- Uses merge sort internally
- O(n log n) time complexity
- Result: {1, 2, 3, 4, 5}
- First element (front()) is 1
- **Key Concept:** forward_list::sort() member function uses merge sort; std::sort requires random access

---

#### Q10
```cpp
std::forward_list<int> fl = {1, 2, 3, 4, 5};
fl.reverse();
std::cout << fl.front();
```

**Answer:**
```
5
```

**Explanation:**
- forward_list initially: {1, 2, 3, 4, 5}
- `reverse()` reverses element order
- Rewires next pointers
- O(n) time, no element copying
- Result: {5, 4, 3, 2, 1}
- front() returns 5 (was last, now first)
- No back() accessor available
- Efficient pointer manipulation only
- **Key Concept:** forward_list::reverse() rewires pointers in O(n); no element moves

---

#### Q11
```cpp
std::deque<int> dq = {1, 2, 3};
dq.resize(5);
std::cout << dq.size();
```

**Answer:**
```
5
```

**Explanation:**
- Deque initially: {1, 2, 3}, size=3
- `resize(5)` increases size to 5
- Adds 2 default-initialized elements (0 for int)
- Result: {1, 2, 3, 0, 0}
- size() returns 5
- Can resize larger or smaller
- Default elements added at back
- **Key Concept:** deque::resize() adds default-initialized elements; grows or shrinks container

---

#### Q12
```cpp
std::deque<int> dq = {1, 2, 3, 4, 5};
dq.clear();
std::cout << dq.size() << " " << dq.empty();
```

**Answer:**
```
0 1
```

**Explanation:**
- Deque initially: {1, 2, 3, 4, 5}
- `clear()` removes all elements
- Destroys each element
- size becomes 0
- `empty()` returns true (prints as 1)
- All iterators invalidated
- Memory deallocated
- **Key Concept:** clear() removes all elements; size=0, empty()=true

---

#### Q13
```cpp
std::forward_list<int> a = {1, 2, 3};
std::forward_list<int> b = {4, 5, 6};
a.splice_after(a.before_begin(), b);
// What does 'a' contain? What is b's state?
```

**Answer:**
```
a = {4, 5, 6, 1, 2, 3}, b is empty
```

**Explanation:**
- a initially: {1, 2, 3}
- b initially: {4, 5, 6}
- `splice_after(a.before_begin(), b)` moves all of b to a
- Inserts after before_begin() = at front
- Result: a = {4, 5, 6, 1, 2, 3}
- b becomes empty (ownership transferred)
- O(n) to find end of b for linking
- No element copying, just pointer rewiring
- **Key Concept:** forward_list::splice_after() transfers elements; before_begin() enables front insertion

---

#### Q14
```cpp
std::deque<int> dq = {1, 2, 3};
auto it = dq.begin();
dq.push_back(4);
std::cout << *it;
```

**Answer:**
```
1
```

**Explanation:**
- Deque initially: {1, 2, 3}
- `it = dq.begin()` points to first element
- `push_back(4)` adds to back
- Iterator `it` usually remains valid
- Prints 1 (still points to first element)
- Partial iterator stability (unlike vector)
- May invalidate if internal map reallocates
- push_front/push_back: only end iterators invalidated
- Middle insertion: all iterators invalidated
- **Key Concept:** Deque provides partial iterator stability; push_back preserves existing iterators usually

---

#### Q15
```cpp
std::forward_list<int> fl = {1, 2, 3};
fl.emplace_front(0);
std::cout << fl.front();
```

**Answer:**
```
0
```

**Explanation:**
- forward_list initially: {1, 2, 3}
- `emplace_front(0)` constructs 0 in-place at front
- Result: {0, 1, 2, 3}
- front() returns 0
- O(1) operation
- Constructs directly (no copy/move)
- For primitives: same as push_front
- For complex objects: more efficient
- **Key Concept:** emplace_front constructs element in-place; avoids copies for complex types

---

#### Q16
```cpp
std::deque<int> dq = {1, 2, 3, 4, 5};
dq.erase(dq.begin() + 2);
std::cout << dq.size();
```

**Answer:**
```
4
```

**Explanation:**
- Deque initially: {1, 2, 3, 4, 5}
- `dq.begin() + 2` points to third element (value 3)
- `erase()` removes element at that position
- Result: {1, 2, 4, 5}, size=4
- O(n) operation (may shift elements)
- More efficient if erasing near ends
- Random access iterator allows pointer arithmetic
- Invalidates iterators at/after erase point
- **Key Concept:** deque::erase() is O(n) but more efficient near ends; invalidates some iterators

---

#### Q17
```cpp
std::forward_list<int> fl = {1, 1, 2, 2, 3};
fl.unique();
// How many elements remain?
```

**Answer:**
```
3
```

**Explanation:**
- forward_list initially: {1, 1, 2, 2, 3}
- `unique()` removes consecutive duplicates
- Keeps first of each duplicate group
- Result: {1, 2, 3}, 3 elements
- Member function (efficient)
- O(n) time complexity
- Only removes consecutive duplicates
- For complete deduplication: sort first
- **Key Concept:** forward_list::unique() removes consecutive duplicates; sort first for complete dedup

---

#### Q18
```cpp
std::deque<int> dq1 = {1, 2, 3};
std::deque<int> dq2 = std::move(dq1);
std::cout << dq1.size() << " " << dq2.size();
```

**Answer:**
```
0 3
```

**Explanation:**
- dq1 initially: {1, 2, 3}
- `std::move(dq1)` casts to rvalue
- Move constructor transfers internal structure
- dq2 takes ownership of dq1's storage
- dq1 left in moved-from state (empty)
- O(1) operation (just pointer transfer)
- No element copying
- dq1 can be safely destroyed or reassigned
- **Key Concept:** Deque move constructor transfers ownership in O(1); source left empty

---

#### Q19
```cpp
std::forward_list<int> fl = {1, 2, 3, 4, 5};
fl.remove_if([](int x) { return x % 2 == 0; });
// What elements remain?
```

**Answer:**
```
{1, 3, 5}
```

**Explanation:**
- forward_list initially: {1, 2, 3, 4, 5}
- Lambda: `[](int x) { return x % 2 == 0; }`
- Returns true for even numbers
- `remove_if()` removes elements where predicate is true
- Removes 2 and 4
- Result: {1, 3, 5}
- Member function (efficient)
- O(n) traversal
- **Key Concept:** forward_list::remove_if() removes matching predicate; member function more efficient

---

#### Q20
```cpp
std::deque<int> dq = {10, 20, 30};
dq.push_front(5);
dq.push_back(40);
std::cout << dq.front() << " " << dq.back();
```

**Answer:**
```
5 40
```

**Explanation:**
- Deque initially: {10, 20, 30}
- `push_front(5)` adds 5 at front: {5, 10, 20, 30}
- `push_back(40)` adds 40 at back: {5, 10, 20, 30, 40}
- Both O(1) operations
- front() returns 5
- back() returns 40
- Double-ended queue advantage
- Efficient insertion at both ends
- **Key Concept:** Deque provides O(1) push_front and push_back; ideal for double-ended operations

---
