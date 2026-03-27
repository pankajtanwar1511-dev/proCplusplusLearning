## TOPIC: STL Unordered Containers - Hash-Based Associative Containers

### PRACTICE_TASKS: Hash Container Challenge Questions

#### Q1
```cpp
std::unordered_map<int, int> m = {{1, 10}, {2, 20}, {3, 30}};
auto it = m.begin();
m.reserve(100);
std::cout << it->first;
```

**Answer:**
```
Undefined behavior (may crash or print garbage)
```

**Explanation:**
- Map initially: {1→10, 2→20, 3→30}
- `it = m.begin()` stores iterator to first element
- `reserve(100)` increases bucket count capacity
- May trigger rehashing (internal reorganization)
- Rehashing invalidates ALL iterators
- `it` now points to invalid memory location
- Dereferencing invalidated iterator = undefined behavior
- May appear to work, crash, or print garbage
- Contrast with ordered map: reserve doesn't exist (no rehashing needed)
- **Key Concept:** Unordered container rehashing invalidates all iterators; reserve may trigger rehash

---

#### Q2
```cpp
struct Point {
    int x, y;
    bool operator==(const Point& o) const {
        return x == o.x && y == o.y;
    }
};

std::unordered_set<Point> s;  // No hash function provided
s.insert({1, 2});
```

**Answer:**
```
Compilation error
```

**Explanation:**
- unordered_set requires hash function for element type
- Point has operator== defined (equality check)
- But no std::hash<Point> specialization
- Default std::hash doesn't work for custom types
- Compilation error: no matching hash function
- **Fix 1:** Specialize std::hash<Point>
  ```cpp
  namespace std {
      template<> struct hash<Point> {
          size_t operator()(const Point& p) const {
              return hash<int>()(p.x) ^ (hash<int>()(p.y) << 1);
          }
      };
  }
  ```
- **Fix 2:** Provide custom hash as template parameter
  ```cpp
  struct PointHash {
      size_t operator()(const Point& p) const { ... }
  };
  unordered_set<Point, PointHash> s;
  ```
- **Key Concept:** Unordered containers require both operator== and hash function; custom types need explicit hash

---

#### Q3
```cpp
std::unordered_map<std::string, int> m;
m["test"] = 5;

if (m["test2"] == 0) {
    std::cout << "Not found";
}
std::cout << m.size();
```

**Answer:**
```
Not found2
```

**Explanation:**
- Map initially empty
- `m["test"] = 5` creates entry {test→5}
- size = 1
- `m["test2"]` uses operator[] with non-existent key
- operator[] creates entry with default value (0 for int)
- Creates {test2→0}
- Condition `m["test2"] == 0` is true (prints "Not found")
- Side effect: entry was added to map!
- size() now returns 2
- Same behavior as ordered map
- Use `find()` or `contains()` to avoid insertion
- **Key Concept:** unordered_map::operator[] inserts default value if key missing; use find() for lookup without insertion

---

#### Q4
```cpp
std::unordered_set<int> s = {1, 2, 3, 4, 5};
for (auto it = s.begin(); it != s.end(); ++it) {
    if (*it == 3) {
        s.erase(it);
    }
}
```

**Answer:**
```
Undefined behavior
```

**Explanation:**
- Loop iterates over set
- `erase(it)` removes element and invalidates iterator
- Next iteration: `++it` increments invalidated iterator
- Undefined behavior (may crash, infinite loop, or appear to work)
- **Fix:** Use return value of erase()
  ```cpp
  for (auto it = s.begin(); it != s.end();) {
      if (*it == 3)
          it = s.erase(it);  // Returns next valid iterator
      else
          ++it;
  }
  ```
- Or use remove-if pattern (C++20):
  ```cpp
  std::erase_if(s, [](int x) { return x == 3; });
  ```
- Same issue as ordered containers
- **Key Concept:** Erasing invalidates iterator; must use returned iterator or skip increment

---

#### Q5
```cpp
std::unordered_map<int, int> m;
m.max_load_factor(2.0);
m.reserve(10);

for (int i = 0; i < 30; ++i) {
    m[i] = i;
}

std::cout << m.bucket_count() << " " << m.load_factor();
```

**Answer:**
```
(Implementation-dependent, likely: 32 0.9375 or similar)
```

**Explanation:**
- `max_load_factor(2.0)` sets threshold for rehashing
- Load factor = size / bucket_count
- When load factor > max_load_factor, rehash occurs
- `reserve(10)` sets initial capacity for ~10 elements
- With max_load_factor 2.0: 10 buckets can hold ~20 elements before rehash
- Inserting 30 elements triggers rehash
- After rehash, bucket_count increases (likely to next power of 2 ≥ 15)
- Typical: 32 buckets (next power of 2)
- load_factor = 30 / 32 = 0.9375
- Exact values implementation-dependent
- reserve() sets buckets = size / max_load_factor
- **Key Concept:** Unordered containers rehash when load factor exceeds max; reserve() pre-allocates to avoid rehashing

---

#### Q6
```cpp
std::unordered_map<std::string, int> m;
m["a"] = 1;
m["b"] = 2;

for (auto& [k, v] : m) {
    k = k + "_modified";
}

std::cout << m["a_modified"];
```

**Answer:**
```
Compilation error
```

**Explanation:**
- Range-based for with structured binding
- `auto& [k, v]` decomposes key-value pair
- In unordered_map, keys are const (like ordered map)
- `k` has type `const std::string&`
- `k = k + "_modified"` attempts to modify const
- Compilation error: cannot assign to const
- Keys must be immutable (hash consistency)
- Modifying keys would break hash table invariants
- Values can be modified freely
- To change keys: erase old, insert new
- **Key Concept:** Unordered map keys are const; cannot modify to preserve hash consistency

---

#### Q7
```cpp
std::unordered_set<int> s1 = {1, 2, 3};
std::unordered_set<int> s2 = s1;

s1.insert(4);
std::cout << s2.size();
```

**Answer:**
```
3
```

**Explanation:**
- s1 initially: {1, 2, 3}
- `s2 = s1` creates deep copy of s1
- All elements copied to s2
- s2 becomes independent copy: {1, 2, 3}
- `s1.insert(4)` modifies s1 only
- s1 becomes: {1, 2, 3, 4}
- s2 remains unchanged: {1, 2, 3}
- size() returns 3
- Copy constructor/assignment perform deep copy
- Use std::move for ownership transfer
- **Key Concept:** Unordered container copy creates independent copy; modifications don't affect original

---

#### Q8
```cpp
std::unordered_map<int, int> m;
for (int i = 0; i < 1000; ++i) {
    m[i] = i;
}

size_t bucket = m.bucket(500);
std::cout << m.bucket_size(bucket);
```

**Answer:**
```
(Implementation-dependent, ideally 1 or small number)
```

**Explanation:**
- Map contains 1000 key-value pairs
- `bucket(500)` returns bucket index for key 500
- Bucket index = hash(500) % bucket_count
- `bucket_size(bucket)` returns number of elements in that bucket
- Ideal hash function: uniform distribution
- Ideal result: 1 element per bucket
- Poor hash function: many elements in same bucket (collisions)
- Typical good implementation: 1-2 elements per bucket
- If bucket_size is large (e.g., 10+): hash function poor
- Hash table performance degrades with high collision rate
- O(1) average becomes O(n) worst case with many collisions
- **Key Concept:** bucket_size indicates collision rate; good hash function distributes elements evenly across buckets

---

#### Q9
```cpp
std::unordered_multiset<int> ms = {1, 2, 2, 3, 3, 3};
std::cout << ms.count(2) << " " << ms.count(3);
```

**Answer:**
```
2 3
```

**Explanation:**
- unordered_multiset allows duplicates
- Initializer list: {1, 2, 2, 3, 3, 3}
- Multiset stores all duplicates: 6 elements total
- `count(2)` returns number of elements with value 2
- Two instances of 2
- `count(3)` returns number of elements with value 3
- Three instances of 3
- Prints "2 3"
- Contrast unordered_set: count() returns 0 or 1 only
- multiset/multimap allow duplicate keys
- Use equal_range() to get all matching elements
- **Key Concept:** unordered_multiset stores duplicates; count() returns actual number of occurrences

---

#### Q10
```cpp
struct BadHash {
    size_t operator()(int x) const { return x % 2; }
};

std::unordered_set<int, BadHash> s;
for (int i = 0; i < 100; ++i) {
    s.insert(i);
}

// What is the approximate worst-case time complexity of find()?
```

**Answer:**
```
O(n) - Linear time
```

**Explanation:**
- BadHash returns only 0 or 1 (x % 2)
- Hash function maps all elements to 2 buckets
- 50 even numbers → bucket 0
- 50 odd numbers → bucket 1
- Extremely poor distribution (only 2 buckets used!)
- find() must search through ~50 elements in bucket
- Time complexity: O(n/2) ≈ O(n) linear
- Good hash function: O(1) average
- This demonstrates importance of quality hash functions
- More buckets != better performance if hash is poor
- Hash function should distribute elements uniformly
- **Key Concept:** Poor hash function degrades performance to O(n); uniform distribution essential for O(1) average

---

#### Q11
```cpp
std::unordered_map<int, std::string> m = {{1, "a"}};
auto it = m.find(1);
m.clear();
std::cout << it->second;
```

**Answer:**
```
Undefined behavior
```

**Explanation:**
- `find(1)` returns iterator to element {1→"a"}
- `clear()` removes all elements from map
- Destroys all key-value pairs
- All iterators invalidated
- `it` now points to destroyed element
- Dereferencing invalidated iterator = undefined behavior
- May crash, print garbage, or appear to work
- clear() invalidates ALL iterators
- Must not use iterators after clear()
- Same behavior as ordered map
- **Key Concept:** clear() invalidates all iterators; dereferencing after clear is undefined behavior

---

#### Q12
```cpp
std::unordered_set<int> s;
s.reserve(100);

for (int i = 0; i < 50; ++i) {
    s.insert(i);
}

// Will any rehashing occur during insertion?
```

**Answer:**
```
No rehashing
```

**Explanation:**
- `reserve(100)` pre-allocates buckets for ~100 elements
- Calculates bucket_count = 100 / max_load_factor
- Default max_load_factor = 1.0
- So bucket_count ≥ 100
- Inserting 50 elements: load_factor = 50 / 100 = 0.5
- Well below max_load_factor threshold
- No rehashing needed during insertions
- All insertions remain O(1) average
- reserve() purpose: avoid rehashing overhead
- Useful when size known in advance
- Improves performance for bulk insertions
- **Key Concept:** reserve() pre-allocates buckets; prevents rehashing during insertions if reserved size sufficient

---

#### Q13
```cpp
std::unordered_map<int, int> m;
int& ref = m[5];
ref = 100;

m.clear();
std::cout << ref;
```

**Answer:**
```
Undefined behavior
```

**Explanation:**
- `m[5]` creates entry {5→0} and returns reference to value
- `ref` stores reference to value in map
- `ref = 100` modifies value in map: {5→100}
- `clear()` destroys all elements
- Element {5→100} destroyed
- `ref` now dangling reference (points to destroyed object)
- Accessing dangling reference = undefined behavior
- Memory may be deallocated or reused
- May crash, print garbage, or appear to work
- References don't extend lifetime like shared_ptr
- **Key Concept:** References to container elements dangle after element destruction; clear() invalidates all references

---

#### Q14
```cpp
std::unordered_map<int, int> m1 = {{1, 10}};
std::unordered_map<int, int> m2 = {{2, 20}};

m1.swap(m2);
std::cout << m1[2] << " " << m2[1];
```

**Answer:**
```
20 10
```

**Explanation:**
- m1 initially: {1→10}
- m2 initially: {2→20}
- `swap()` exchanges contents of m1 and m2
- After swap: m1 = {2→20}, m2 = {1→10}
- O(1) operation (just pointer swaps)
- No element copying or moving
- All iterators remain valid but now refer to other container
- `m1[2]` accesses key 2 in m1 (now has {2→20}): prints 20
- `m2[1]` accesses key 1 in m2 (now has {1→10}): prints 10
- Efficient way to exchange large containers
- **Key Concept:** swap() exchanges container contents in O(1); iterators remain valid but refer to swapped container

---

#### Q15
```cpp
std::unordered_set<int> s;
s.insert(1);
s.insert(2);

auto handle = s.extract(1);
handle.value() = 10;
s.insert(std::move(handle));

std::cout << s.count(1) << " " << s.count(10);
```

**Answer:**
```
0 1
```

**Explanation:**
- Set initially: {1, 2}
- `extract(1)` removes element 1 and returns node handle
- Ownership transferred to handle
- Set becomes: {2}
- Node handle allows modifying extracted element
- `handle.value() = 10` changes value from 1 to 10
- `insert(std::move(handle))` reinserts modified node
- Set becomes: {2, 10}
- count(1) returns 0 (no longer in set)
- count(10) returns 1 (reinserted with new value)
- C++17 feature: extract-modify-insert pattern
- Avoids copy/destruction when modifying keys
- Efficient for expensive-to-copy types
- **Key Concept:** extract() removes element without destruction; allows modification and reinsertion via node handle (C++17)

---

#### Q16
```cpp
std::unordered_map<std::string, int> m;
m.try_emplace("key", 42);
m.try_emplace("key", 100);

std::cout << m["key"];
```

**Answer:**
```
42
```

**Explanation:**
- Map initially empty
- `try_emplace("key", 42)` attempts to insert {"key"→42}
- Key doesn't exist, insertion succeeds
- Map: {"key"→42}
- `try_emplace("key", 100)` attempts to insert {"key"→100}
- Key "key" already exists
- try_emplace does NOTHING if key exists
- Map remains: {"key"→42}
- Prints 42 (original value)
- Contrast insert(): also doesn't overwrite
- Contrast operator[]: would overwrite
- try_emplace advantage: doesn't construct value if key exists
- More efficient for expensive-to-construct types
- **Key Concept:** try_emplace() inserts only if key absent; preserves existing values unlike operator[]

---

#### Q17
```cpp
std::unordered_set<int> s = {1, 2, 3, 4, 5};

// Print bucket distribution
for (size_t i = 0; i < s.bucket_count(); ++i) {
    std::cout << "Bucket " << i << ": " << s.bucket_size(i) << "\n";
}

// What pattern would indicate a good hash function?
```

**Answer:**
```
Uniform distribution: most buckets have 0-1 elements
```

**Explanation:**
- Good hash function distributes elements evenly
- Ideal pattern:
  - Most buckets have 0 or 1 element
  - Few buckets have 2 elements
  - Very few (ideally none) have 3+ elements
- Example good distribution (5 elements, 8 buckets):
  ```
  Bucket 0: 1
  Bucket 1: 0
  Bucket 2: 1
  Bucket 3: 1
  Bucket 4: 0
  Bucket 5: 1
  Bucket 6: 1
  Bucket 7: 0
  ```
- Bad hash function: clustering
  - Some buckets empty
  - Some buckets have many elements (10+)
- High collision rate degrades performance
- load_factor = size / bucket_count
- Standard max_load_factor = 1.0
- Uniform distribution maintains O(1) average
- **Key Concept:** Good hash function produces uniform distribution; most buckets have 0-1 elements, minimal clustering

---

#### Q18
```cpp
std::unordered_map<int, std::unique_ptr<int>> m;
m[1] = std::make_unique<int>(42);

auto m2 = std::move(m);
std::cout << m.size() << " " << *m2[1];
```

**Answer:**
```
0 42
```

**Explanation:**
- Map contains unique_ptr: {1→unique_ptr to 42}
- `std::move(m)` casts m to rvalue
- Move constructor transfers ownership
- m2 takes ownership of m's internal structure
- m left in moved-from state (empty)
- m.size() returns 0
- m2 now owns {1→unique_ptr to 42}
- `*m2[1]` dereferences unique_ptr: prints 42
- O(1) operation (pointer transfer only)
- No unique_ptr copying (unique_ptr not copyable)
- m can be safely destroyed or reassigned
- Move semantics essential for non-copyable types
- **Key Concept:** Move constructor transfers ownership in O(1); source left empty; essential for unique ownership types

---

#### Q19
```cpp
std::unordered_set<int> s = {1, 2, 3};
size_t old_buckets = s.bucket_count();

s.rehash(100);
size_t new_buckets = s.bucket_count();

// Will new_buckets be exactly 100?
```

**Answer:**
```
Not necessarily (likely >= 100, rounded to prime or power of 2)
```

**Explanation:**
- `rehash(100)` requests at least 100 buckets
- Implementation may choose different value
- Common strategies:
  - Round up to next prime number
  - Round up to next power of 2
- Examples: 101 (prime), 128 (power of 2)
- Ensures hash table properties
- Actual bucket_count >= requested count
- Must accommodate current size / max_load_factor
- If size = 3, max_load_factor = 1.0:
  - Minimum buckets = 3 / 1.0 = 3
  - Can safely set to 100+
- rehash() forces reorganization
- Use reserve() for element count instead
- **Key Concept:** rehash() sets minimum buckets; implementation may round up to prime/power-of-2 for optimal performance

---

#### Q20
```cpp
std::unordered_map<int, int> m;
m[1] = 10;

try {
    std::cout << m.at(1) << " ";
    std::cout << m.at(2);
} catch (...) {
    std::cout << "Exception";
}
```

**Answer:**
```
10 Exception
```

**Explanation:**
- Map: {1→10}
- `m.at(1)` accesses existing key 1
- Returns 10, prints "10 "
- `m.at(2)` attempts to access non-existent key
- at() throws std::out_of_range exception
- Exception caught by catch block
- Prints "Exception"
- Output: "10 Exception"
- Contrast operator[]: would create entry {2→0}
- at() doesn't modify map (const-correct)
- Use at() when key must exist
- Use operator[] when default insertion acceptable
- Same behavior as ordered map
- **Key Concept:** unordered_map::at() throws exception for missing keys; doesn't insert unlike operator[]

---
