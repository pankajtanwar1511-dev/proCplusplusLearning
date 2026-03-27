## TOPIC: Ordered Associative Containers (std::set and std::map)

### PRACTICE_TASKS: Challenge Questions on Ordered Containers

#### Q1
```cpp
std::set<int> s = {1, 2, 3, 4, 5};
auto it = s.find(3);
s.erase(3);
std::cout << *it;
```

**Answer:**
```
Undefined behavior
```

**Explanation:**
- `find(3)` returns iterator to element 3
- `erase(3)` removes element with value 3
- Erasing invalidates iterators pointing to erased element
- `*it` dereferences invalidated iterator
- Undefined behavior - may crash, garbage, or appear to work
- **Fix:** Don't use iterator after its element erased
- Correct: `it = s.erase(it);` (returns next valid iterator)
- **Key Concept:** Erasing invalidates iterators to erased elements; must not dereference after erase

---

#### Q2
```cpp
std::map<int, int, std::greater<int>> m;
m[5] = 50;
m[1] = 10;
m[3] = 30;
for (auto [k, v] : m)
    std::cout << k << " ";
```

**Answer:**
```
5 3 1
```

**Explanation:**
- Default map uses std::less (ascending order)
- `std::greater<int>` comparator sorts descending
- Inserted keys: 5, 1, 3
- Stored in descending order: {5→50, 3→30, 1→10}
- Iteration follows sorted order
- Prints keys: 5 3 1
- Custom comparators control ordering
- **Key Concept:** Map with std::greater stores elements in descending order; custom comparators control sort

---

#### Q3
```cpp
std::map<std::string, int> m;
std::cout << m["test"];
std::cout << m.size();
```

**Answer:**
```
0
1
```

**Explanation:**
- Map initially empty
- `m["test"]` uses operator[]
- Key "test" doesn't exist
- operator[] creates entry with default value
- For int: default is 0
- Prints 0
- Side effect: entry added to map
- size() now returns 1
- Contrast at(): throws exception if missing
- **Key Concept:** map::operator[] inserts default-constructed value if key missing; modifies map

---

#### Q4
```cpp
std::set<int> s = {1, 2, 3};
auto [it, inserted] = s.insert(2);
std::cout << *it << " " << inserted;
```

**Answer:**
```
2 0
```

**Explanation:**
- Set: {1, 2, 3}
- `insert(2)` attempts to insert duplicate
- Sets maintain uniqueness
- Insert fails (2 already exists)
- Returns pair: {iterator, bool}
- iterator points to existing element (2)
- bool is false (not inserted)
- Structured binding: auto [it, inserted]
- Prints: 2 (value) and 0 (false)
- **Key Concept:** set::insert() returns {iterator to element, insertion success}; fails for duplicates

---

#### Q5
```cpp
std::map<int, std::string> m = {{1, "A"}};
auto [it, inserted] = m.insert({1, "B"});
std::cout << m[1] << " " << inserted;
```

**Answer:**
```
A 0
```

**Explanation:**
- Map: {1→"A"}
- `insert({1, "B"})` attempts to insert key 1
- Key 1 already exists with value "A"
- insert() does NOT overwrite existing keys
- Insert fails, returns {iterator to existing, false}
- m[1] still "A" (unchanged)
- inserted is false (0)
- Contrast operator[]: would overwrite
- To update: use m[1]="B" or insert_or_assign
- **Key Concept:** map::insert() preserves existing values; doesn't overwrite unlike operator[]

---

#### Q6
```cpp
std::set<int> s = {10, 20, 30, 40, 50};
auto lb = s.lower_bound(25);
auto ub = s.upper_bound(40);
std::cout << *lb << " " << *ub;
```

**Answer:**
```
30 50
```

**Explanation:**
- Set: {10, 20, 30, 40, 50}
- `lower_bound(25)` finds first element ≥ 25
- Finds 30 (first element not less than 25)
- `upper_bound(40)` finds first element > 40
- Finds 50 (first element greater than 40)
- Logarithmic time O(log n)
- Range query: [lower_bound, upper_bound)
- Useful for range-based operations
- **Key Concept:** lower_bound finds first ≥; upper_bound finds first >; O(log n) binary search

---

#### Q7
```cpp
struct Point { int x, y; };
std::set<Point> s;  // No comparator provided
s.insert({1, 2});
```

**Answer:**
```
Compilation error
```

**Explanation:**
- std::set requires comparison for ordering
- Default uses operator< on element type
- Point struct has no operator< defined
- No custom comparator provided
- Compilation error: no operator< for Point
- **Fix 1:** Define operator< for Point
- **Fix 2:** Provide custom comparator: set<Point, CustomCompare>
- **Fix 3:** Use lambda comparator (C++11+)
- **Key Concept:** set requires operator< or custom comparator; compilation fails without comparison

---

#### Q8
```cpp
std::map<int, int> m = {{1, 10}, {2, 20}};
for (auto& [k, v] : m) {
    k = k * 2;
    v = v * 2;
}
```

**Answer:**
```
Compilation error
```

**Explanation:**
- Range-based for with structured binding
- auto& [k, v] decomposes pair
- In map, key is const (maintains ordering invariant)
- k has type const int&
- `k = k * 2` attempts to modify const
- Compilation error: cannot assign to const
- v can be modified (values are mutable)
- Keys must remain constant (or reinsert with new key)
- **Key Concept:** Map keys are const; cannot modify to preserve ordering; values are mutable

---

#### Q9
```cpp
std::set<int*> s;
int a = 5, b = 5;
s.insert(&a);
s.insert(&b);
std::cout << s.size();
```

**Answer:**
```
2
```

**Explanation:**
- Set of int* (pointer type)
- Default comparison: operator< on pointers
- Compares addresses, not pointed-to values
- &a and &b are different addresses
- Both pointers inserted successfully
- Even though *a == *b (both 5)
- Size is 2 (two distinct pointers)
- Common mistake: expecting value comparison
- **Fix:** Custom comparator or use values instead
- **Key Concept:** set<T*> compares pointer addresses, not values; need custom comparator for value comparison

---

#### Q10
```cpp
std::map<std::string, int> m;
try {
    std::cout << m.at("missing");
} catch (const std::exception& e) {
    std::cout << "caught";
}
std::cout << m.size();
```

**Answer:**
```
caught0
```

**Explanation:**
- Map initially empty
- `at("missing")` looks up non-existent key
- at() throws std::out_of_range exception
- Exception caught, prints "caught"
- Map NOT modified (at() doesn't insert)
- size() returns 0
- Contrast operator[]: would insert default value
- at() is const-correct access method
- Use when key must exist
- **Key Concept:** map::at() throws exception for missing keys; doesn't insert unlike operator[]

---

#### Q11
```cpp
std::set<int> s = {1, 2, 3, 4, 5};
auto it1 = s.begin();
auto it2 = s.find(3);
s.insert(10);
std::cout << *it1 << " " << *it2;
```

**Answer:**
```
1 3
```

**Explanation:**
- it1 points to begin (value 1)
- it2 points to element 3
- `insert(10)` adds new element
- Ordered containers: insert doesn't invalidate iterators
- it1 and it2 remain valid
- Prints 1 and 3
- Only erased iterators become invalid
- Tree-based implementation (red-black tree)
- Contrast vector: insert may invalidate all
- **Key Concept:** set/map insert preserves all existing iterators; only erase invalidates specific iterator

---

#### Q12
```cpp
std::map<int, std::string> m = {{1, "A"}, {2, "B"}};
m.erase(m.begin());
std::cout << m.begin()->first;
```

**Answer:**
```
2
```

**Explanation:**
- Map: {1→"A", 2→"B"} (sorted by key)
- `erase(m.begin())` erases first element
- Removes {1→"A"}
- Map becomes: {2→"B"}
- `m.begin()` now points to first remaining element
- First element is now {2→"B"}
- begin()->first accesses key: 2
- Erase is O(log n) + O(1) for tree rebalancing
- **Key Concept:** Erasing updates iterators; new begin() points to next element after erasure

---

#### Q13
```cpp
std::set<int> s = {3, 1, 4, 1, 5, 9};
std::cout << s.size() << " " << *s.begin() << " " << *s.rbegin();
```

**Answer:**
```
5 1 9
```

**Explanation:**
- Initializer list: {3, 1, 4, 1, 5, 9}
- Set removes duplicates automatically
- Only one instance of 1 kept
- Result: {1, 3, 4, 5, 9} (sorted)
- size() returns 5
- begin() points to smallest: 1
- rbegin() (reverse begin) points to largest: 9
- Automatic sorting and deduplication
- **Key Concept:** set removes duplicates and maintains sorted order; size reflects unique elements

---

#### Q14
```cpp
std::map<int, int> m;
m[1] = 10;
m[1] = 20;
m.insert({1, 30});
std::cout << m[1];
```

**Answer:**
```
20
```

**Explanation:**
- `m[1] = 10` creates entry {1→10}
- `m[1] = 20` overwrites value to 20
- operator[] provides reference to value, can reassign
- `insert({1, 30})` attempts insert
- Key 1 exists, insert does nothing
- Value remains 20 (not changed to 30)
- m[1] prints 20
- Key difference: [] modifies, insert doesn't overwrite
- **Key Concept:** operator[] overwrites existing values; insert() leaves existing values unchanged

---

#### Q15
```cpp
std::set<int> s = {10, 20, 30};
auto it = s.find(25);
if (it != s.end())
    std::cout << *it;
else
    std::cout << "not found";
```

**Answer:**
```
not found
```

**Explanation:**
- Set: {10, 20, 30}
- `find(25)` searches for element 25
- Element 25 doesn't exist
- find() returns end() iterator
- `it != s.end()` is false
- Else branch executes
- Prints "not found"
- O(log n) search time
- Never dereference end() iterator
- **Key Concept:** find() returns end() if element not found; always check before dereferencing

---

#### Q16
```cpp
std::map<std::string, std::vector<int>> m;
m["nums"] = {1, 2, 3};
m["nums"].push_back(4);
std::cout << m["nums"].size();
```

**Answer:**
```
4
```

**Explanation:**
- Map of string → vector
- `m["nums"] = {1, 2, 3}` creates entry
- `m["nums"]` returns reference to vector
- `push_back(4)` modifies vector in-place
- Vector becomes {1, 2, 3, 4}
- Third access `m["nums"].size()` returns 4
- Values are fully mutable (unlike keys)
- operator[] returns reference, enables modification
- **Key Concept:** Map values are mutable; operator[] returns reference for in-place modification

---

#### Q17
```cpp
std::set<int> s = {1, 2, 3, 4, 5};
for (auto it = s.begin(); it != s.end(); ++it) {
    if (*it % 2 == 0)
        s.erase(it);
}
```

**Answer:**
```
Undefined behavior
```

**Explanation:**
- Loop increments iterator: ++it
- erase(it) invalidates iterator
- Next iteration uses invalidated iterator
- Undefined behavior
- **Fix:** it = s.erase(it); (don't increment)
- erase() returns iterator to next element
- Correct pattern:
  ```cpp
  for (auto it = s.begin(); it != s.end();) {
      if (*it % 2 == 0)
          it = s.erase(it);  // Don't increment
      else
          ++it;  // Only increment if not erasing
  }
  ```
- **Key Concept:** Erasing invalidates iterator; must use returned iterator or skip increment

---

#### Q18
```cpp
struct BadCompare {
    bool operator()(int a, int b) const {
        return a <= b;
    }
};
std::set<int, BadCompare> s = {1, 2, 3};
s.insert(2);
```

**Answer:**
```
Undefined behavior
```

**Explanation:**
- Comparator uses <= (less than or equal)
- Violates strict weak ordering requirements
- Strict weak ordering requires: comp(a,a) == false
- With <=: comp(2,2) returns true (violation!)
- Tree invariants broken
- Undefined behavior: corruption, crashes, incorrect results
- **Correct:** Use < (less than only)
- Requirements: irreflexive, antisymmetric, transitive
- Set/map require valid comparator
- **Key Concept:** Comparators must use strict weak ordering (<); <= violates requirements, causes UB

---

#### Q19
```cpp
std::map<int, int> m = {{1, 10}, {2, 20}, {3, 30}};
auto [first, last] = m.equal_range(2);
for (auto it = first; it != last; ++it)
    std::cout << it->second << " ";
```

**Answer:**
```
20
```

**Explanation:**
- `equal_range(2)` returns pair of iterators
- first = lower_bound(2): first element ≥ 2
- last = upper_bound(2): first element > 2
- Range [first, last) contains all elements == 2
- For map: unique keys, so at most 1 element
- Finds {2→20}
- Loop iterates once, prints 20
- For multimap: could have multiple
- Efficient range query O(log n)
- **Key Concept:** equal_range returns [lower_bound, upper_bound); for map contains 0 or 1 element

---

#### Q20
```cpp
std::set<int> s1 = {1, 2, 3};
std::set<int> s2 = {1, 2, 3};
if (s1 == s2)
    std::cout << "equal";
else
    std::cout << "not equal";
```

**Answer:**
```
equal
```

**Explanation:**
- Both sets: {1, 2, 3}
- operator== compares sets element-wise
- Same elements in same order
- Returns true
- Prints "equal"
- Also supports !=, <, <=, >, >= (lexicographic)
- Complexity: O(n) linear comparison
- Works for all containers
- **Key Concept:** Sets support equality operators; == compares all elements in order

---
