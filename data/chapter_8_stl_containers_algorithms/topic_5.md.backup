## TOPIC: STL Unordered Containers - Hash-Based Associative Containers

### THEORY_SECTION: Hash-Based Container Fundamentals

#### 1. Hash Table Implementation - Bucket Architecture, Collision Resolution, and Load Factor Management

**Hash Table Architecture Overview:**

Unordered containers (unordered_set, unordered_map, unordered_multiset, unordered_multimap) use **hash tables** as their underlying data structure, providing average O(1) operations by organizing elements into **buckets** based on hash values. Unlike ordered containers which use balanced trees, unordered containers sacrifice ordering guarantees for faster average-case performance.

**Core Components:**

| Component | Purpose | Details |
|-----------|---------|---------|
| **Bucket Array** | Stores elements organized by hash | Array of buckets (typically vectors or linked lists) |
| **Hash Function** | Maps keys to bucket indices | Computes hash value, then index = hash % bucket_count |
| **Equality Predicate** | Compares keys within bucket | Required for collision resolution |
| **Load Factor** | Ratio of elements to buckets | Triggers rehashing when exceeded (default 1.0) |
| **Allocator** | Memory management | Allocates bucket array and nodes |

**Hash Table Internal Structure:**

```cpp
// Conceptual internal representation (simplified)
template<typename Key>
class unordered_set {
    std::vector<Bucket> buckets_;  // Array of buckets
    size_t element_count_;          // Total number of elements
    size_t bucket_count_;           // Number of buckets
    float max_load_factor_;         // Threshold for rehashing (default 1.0)
    Hash hasher_;                   // Hash function object
    KeyEqual equal_;                // Equality predicate

    // Bucket is typically:
    struct Bucket {
        std::forward_list<Key> elements;  // Linked list for collision handling
    };

    // Insert operation:
    void insert(const Key& key) {
        size_t hash_value = hasher_(key);
        size_t bucket_index = hash_value % bucket_count_;  // Determine bucket

        // Check if key exists (linear search in bucket)
        for (const auto& elem : buckets_[bucket_index].elements) {
            if (equal_(elem, key)) return;  // Duplicate, don't insert
        }

        // Insert into bucket
        buckets_[bucket_index].elements.push_front(key);
        element_count_++;

        // Check if rehash needed
        if (load_factor() > max_load_factor_) {
            rehash(bucket_count_ * 2);
        }
    }

    float load_factor() const {
        return static_cast<float>(element_count_) / bucket_count_;
    }
};
```

**Bucket Array Structure:**

| Bucket Index | Hash Range | Elements (Collision Chain) | Lookup Process |
|--------------|------------|----------------------------|----------------|
| 0 | hash % N == 0 | elem1 → elem5 → elem9 | Hash to 0, linear search in bucket |
| 1 | hash % N == 1 | elem2 | Hash to 1, single element |
| 2 | hash % N == 2 | (empty) | Hash to 2, not found |
| 3 | hash % N == 3 | elem3 → elem7 | Hash to 3, linear search in bucket |
| ... | ... | ... | ... |

**Collision Resolution - Separate Chaining:**

STL unordered containers use **separate chaining** with linked lists (forward_list) in each bucket to handle hash collisions.

| Collision Strategy | Description | STL Choice | Performance Impact |
|-------------------|-------------|------------|-------------------|
| **Separate Chaining** | Each bucket is a linked list | ✅ Used by STL | Average O(1), worst O(N) if all collide |
| Open Addressing | Probe for next empty slot | ❌ Not used | Better cache locality but complex deletion |
| Robin Hood Hashing | Minimize variance in probe length | ❌ Not used | Lower variance but more complex |
| Cuckoo Hashing | Multiple hash functions, bounded proofs | ❌ Not used | Guaranteed O(1) lookup but complex insert |

**Why Separate Chaining:**
- Simple implementation
- Easy deletion (remove from linked list)
- Handles high load factors gracefully
- Works with non-movable types
- No clustering issues

**Collision Example:**

```cpp
std::unordered_set<int> s;
s.insert(1);    // hash(1) = 1001, bucket = 1001 % 8 = 1
s.insert(9);    // hash(9) = 1009, bucket = 1009 % 8 = 1  ← COLLISION
s.insert(17);   // hash(17) = 1017, bucket = 1017 % 8 = 1  ← COLLISION

// Bucket 1 now contains: 1 → 9 → 17 (linked list)
// Lookup: hash(9) → bucket 1 → linear search: 1 ≠ 9, 9 == 9 ✅ Found
```

**Load Factor Management:**

| Load Factor | Elements/Buckets | Memory Usage | Collision Probability | Performance |
|-------------|------------------|--------------|----------------------|-------------|
| 0.25 | 1000 / 4000 | High (75% empty) | Very low | Excellent O(1) |
| 0.5 | 1000 / 2000 | Moderate (50% empty) | Low | Very good O(1) |
| **1.0** (default) | 1000 / 1000 | Balanced | Moderate | Good O(1) |
| 1.5 | 1000 / 667 | Lower | Higher | Fair O(1) |
| 2.0 | 1000 / 500 | Low (50% overloaded) | High | Degraded O(K) |

**Rehashing Process:**

When `load_factor() > max_load_factor()` after insertion, the container **rehashes**:

1. Allocate new, larger bucket array (typically 2x size)
2. For each element in old buckets:
   - Recompute bucket index with new bucket_count
   - Insert into new bucket array
3. Deallocate old bucket array
4. **All iterators invalidated** (except element values remain valid)

```cpp
// Rehashing example
std::unordered_set<int> s;
s.max_load_factor(1.0);  // Default threshold
s.reserve(10);           // Pre-allocate 10 buckets

for (int i = 0; i < 10; ++i) {
    s.insert(i);  // No rehashing (load factor stays ≤ 1.0)
}

s.insert(11);  // ✅ Triggers rehash: 11 elements / 10 buckets = 1.1 > 1.0
// New bucket array allocated (typically 20-22 buckets)
// All 11 elements rehashed into new buckets
```

**Memory Overhead Comparison:**

| Container Type | Storage Model | Memory per Element (64-bit) | Example (1000 ints) |
|----------------|---------------|----------------------------|---------------------|
| **std::vector** | Contiguous array | 4 bytes (int) | 4 KB |
| **std::set** | Red-black tree | 4 + 32 bytes (node overhead) | 36 KB |
| **std::unordered_set** | Hash table + buckets | 4 + 8 (list node) + buckets | ~20 KB (with LF=1.0) |

**Hash Function Requirements:**

A valid hash function must satisfy:

| Requirement | Description | Violation Consequence |
|-------------|-------------|----------------------|
| **Consistency** | equal keys → equal hashes | Container corruption if violated |
| **Determinism** | Same input → same output | Lookups fail randomly |
| **Uniform Distribution** | Outputs spread evenly | Performance degrades to O(N) |
| **Fast Computation** | O(1) hash calculation | Negates O(1) advantage |
| **Avalanche Effect** | Small input change → large output change | Clustering and collisions |

**Good vs Bad Hash Functions:**

```cpp
// ❌ BAD: Constant hash - all elements collide
struct ConstantHash {
    size_t operator()(int x) const {
        return 42;  // O(N) lookup!
    }
};

// ❌ BAD: Poor distribution
struct PoorHash {
    size_t operator()(int x) const {
        return x % 10;  // Only 10 possible values
    }
};

// ✅ GOOD: Standard hash with full distribution
struct GoodHash {
    size_t operator()(int x) const {
        return std::hash<int>{}(x);  // Full size_t range
    }
};

// ✅ GOOD: Custom hash for pair with mixing
struct PairHash {
    size_t operator()(const std::pair<int, int>& p) const {
        size_t h1 = std::hash<int>{}(p.first);
        size_t h2 = std::hash<int>{}(p.second);
        return h1 ^ (h2 << 1);  // XOR with shift for mixing
    }
};
```

---

#### 2. Key Operations and Performance - Average O(1) vs Worst O(N) Complexity Analysis

**Core Operations Complexity:**

| Operation | Average Case | Worst Case | When Worst Case Occurs | Amortized |
|-----------|-------------|------------|------------------------|-----------|
| **insert()** | O(1) | O(N) | All elements hash to same bucket | O(1) |
| **find()** | O(1) | O(N) | All elements in searched bucket | O(1) |
| **erase(key)** | O(1) | O(N) | All elements in key's bucket | O(1) |
| **erase(iterator)** | O(1) | O(1) | None (direct access) | O(1) |
| **count()** | O(1) | O(N) | All elements in key's bucket | O(1) |
| **operator[]** (map) | O(1) | O(N) | All elements hash to same bucket + may insert | O(1) |
| **at()** (map) | O(1) | O(N) | All elements hash to same bucket | O(1) |
| **Iteration** | O(N) | O(N) | None | O(N) |
| **rehash(n)** | O(N) | O(N) | None | O(1) amortized per insert |
| **clear()** | O(N) | O(N) | None | O(N) |

**Why Average O(1) vs Worst O(N):**

```cpp
// Best/Average case: Good hash distribution
std::unordered_set<int> s;
// Assume bucket_count = 8
s.insert(1);   // hash → bucket 1 (1 element)
s.insert(5);   // hash → bucket 5 (1 element)
s.insert(13);  // hash → bucket 5 (2 elements) ← minor collision

s.find(5);  // ✅ O(1): hash(5) → bucket 5 → check 1-2 elements

// Worst case: All elements hash to same bucket
struct BadHash {
    size_t operator()(int x) const { return 0; }  // Always bucket 0!
};

std::unordered_set<int, BadHash> s_bad;
s_bad.insert(1);    // bucket 0: [1]
s_bad.insert(2);    // bucket 0: [1, 2]
s_bad.insert(3);    // bucket 0: [1, 2, 3]
// ... insert 10,000 elements ...

s_bad.find(9999);  // ❌ O(N): hash → bucket 0 → linear search 10,000 elements!
```

**Insertion Performance Analysis:**

| Scenario | Cost | Explanation |
|----------|------|-------------|
| **No collision, no rehash** | O(1) | Hash, find bucket, insert at front |
| **Collision, no rehash** | O(K) where K = bucket size | Hash, find bucket, check K elements, insert |
| **Rehash triggered** | O(N) | Allocate new array, rehash all N elements |
| **Amortized** | O(1) | Rehashes rare (doubling strategy), cost spread |

**Unordered_set Operations:**

```cpp
std::unordered_set<int> s;

// ✅ Insertion
auto [it, inserted] = s.insert(10);
// inserted = true if new, false if duplicate
// it points to element

// ✅ Lookup (average O(1))
if (s.find(10) != s.end()) {
    std::cout << "Found\n";
}

// ✅ Existence check
if (s.count(10) > 0) {  // Returns 0 or 1
    std::cout << "Exists\n";
}

// ✅ C++20 contains()
if (s.contains(10)) {
    std::cout << "Exists\n";
}

// ✅ Deletion
s.erase(10);  // By value
auto it = s.find(20);
if (it != s.end()) {
    s.erase(it);  // By iterator
}

// ✅ Iteration (order undefined)
for (const auto& elem : s) {
    // Process elem
}
```

**Unordered_map Operations:**

```cpp
std::unordered_map<int, std::string> m;

// ✅ Insertion variants
m[1] = "one";                          // operator[] - creates if missing
m.insert({2, "two"});                  // insert() - respects existing
m.emplace(3, "three");                 // emplace() - construct in-place
m.try_emplace(4, "four");              // C++17 - doesn't move if exists

// ⚠️ operator[] side effect
int x = m[99];  // Creates {99, ""} with default value!
std::cout << m.size();  // Now 5, not 4

// ✅ Safe lookup methods
auto it = m.find(1);
if (it != m.end()) {
    std::cout << it->second;  // "one"
}

// ✅ at() throws if missing
try {
    std::string val = m.at(100);  // Throws std::out_of_range
} catch (const std::out_of_range&) {
    std::cout << "Not found\n";
}
```

**operator[] vs insert() vs at() vs find():**

| Method | Creates if Missing? | Overwrites Existing? | Returns | Throws? | Use Case |
|--------|---------------------|---------------------|---------|---------|----------|
| **operator[]** | ✅ Yes (default value) | ✅ Yes | Reference to value | No | Insertion/modification |
| **insert()** | ✅ Yes | ❌ No | pair<iterator, bool> | No | Conditional insertion |
| **try_emplace()** | ✅ Yes | ❌ No | pair<iterator, bool> | No | Safe insertion (C++17) |
| **at()** | ❌ No | N/A | Reference to value | ✅ Yes if missing | Safe read-only access |
| **find()** | ❌ No | N/A | Iterator (end if missing) | No | Existence check + access |

**Example Comparison:**

```cpp
std::unordered_map<int, std::string> m;
m[1] = "A";

// operator[] - overwrites and creates
m[1] = "B";         // ✅ Overwrites to "B"
m[2] = "C";         // ✅ Creates {2, "C"}

// insert() - respects existing
auto [it1, ins1] = m.insert({1, "X"});  // ins1 = false, m[1] still "B"
auto [it2, ins2] = m.insert({3, "Y"});  // ins2 = true, m[3] = "Y"

// try_emplace() - safe insertion (C++17)
m.try_emplace(1, "Z");  // No effect, m[1] still "B"
m.try_emplace(4, "W");  // Creates {4, "W"}

// at() - throws if missing
try {
    std::cout << m.at(1);  // ✅ Prints "B"
    std::cout << m.at(99); // ❌ Throws std::out_of_range
} catch (...) {
    std::cout << "Not found\n";
}

// find() - no side effects
auto it = m.find(5);
if (it == m.end()) {
    std::cout << "Not found\n";  // Doesn't create entry
}
```

**Iterator Invalidation Rules:**

| Operation | Iterators | Pointers/References | Notes |
|-----------|-----------|---------------------|-------|
| **insert()** (no rehash) | ✅ Valid | ✅ Valid | Only new element added |
| **insert()** (with rehash) | ❌ All invalid | ✅ Valid | Bucket array reallocated |
| **erase(iterator)** | ❌ Only erased | ❌ Only erased | Other iterators valid |
| **erase(key)** | ❌ Matching elements | ❌ Matching elements | Other iterators valid |
| **clear()** | ❌ All invalid | ❌ All invalid | Container emptied |
| **rehash()/reserve()** | ❌ All invalid | ✅ Valid | Bucket structure changed |
| **swap()** | ❌ All invalid | ✅ Valid | Containers swapped |

**Safe Iteration with Erase:**

```cpp
std::unordered_set<int> s = {1, 2, 3, 4, 5};

// ❌ WRONG: Iterator invalidated after erase
for (auto it = s.begin(); it != s.end(); ++it) {
    if (*it == 3) {
        s.erase(it);  // ❌ it now invalid, ++it is UB!
    }
}

// ✅ CORRECT: erase() returns next valid iterator
for (auto it = s.begin(); it != s.end(); ) {
    if (*it == 3) {
        it = s.erase(it);  // erase returns next iterator
    } else {
        ++it;
    }
}

// ✅ ALTERNATIVE: Two-phase (collect then erase)
std::vector<int> to_erase;
for (const auto& elem : s) {
    if (elem == 3) {
        to_erase.push_back(elem);
    }
}
for (int elem : to_erase) {
    s.erase(elem);
}
```

**Real-World Performance Benchmark (1 Million Operations):**

| Container | Insert (ms) | Find (hit, ms) | Find (miss, ms) | Erase (ms) | Memory (MB) |
|-----------|-------------|----------------|-----------------|------------|-------------|
| **std::unordered_set** (good hash) | 42 | 28 | 15 | 35 | 18.5 |
| **std::unordered_set** (poor hash) | 890 | 1200 | 950 | 780 | 18.5 |
| **std::set** | 180 | 95 | 85 | 120 | 24.0 |
| **std::vector** (sorted) | 4200 | 3 | 3 | 4100 | 4.0 |

**Key Observations:**
- **Good hash**: Unordered_set 3-4x faster than set for insert/find
- **Poor hash**: Unordered_set 5-13x slower than set (degrades to O(N))
- **Memory**: Unordered_set ~23% less memory than set
- **Predictability**: Set has consistent performance, unordered varies with hash quality

---

#### 3. When to Use Unordered Containers - Hash vs Ordered Comparison and Decision Guide

**Ordered vs Unordered Decision Matrix:**

| Requirement | std::set/map (Ordered) | std::unordered_set/map (Unordered) | Winner |
|-------------|------------------------|-----------------------------------|--------|
| **Fastest average lookup** | O(log N) guaranteed | O(1) average | 🏆 Unordered |
| **Predictable worst-case** | O(log N) guaranteed | O(N) worst case | 🏆 Ordered |
| **Sorted iteration** | ✅ Always sorted | ❌ Undefined order | 🏆 Ordered |
| **Range queries** (lower_bound/upper_bound) | ✅ Efficient O(log N) | ❌ Not supported | 🏆 Ordered |
| **Memory efficiency** | ~36 bytes/element | ~12-20 bytes/element (depends on LF) | 🏆 Unordered |
| **Cache locality** | ⚠️ Moderate (tree traversal) | ⚠️ Poor (scattered buckets) | ⚠️ Tie |
| **Insert performance** (random data) | O(log N) | O(1) average | 🏆 Unordered |
| **Insert performance** (sorted data) | O(log N) | O(1) average | 🏆 Unordered |
| **Small datasets (N < 100)** | O(log N) ≈ O(7) | O(1) but with hash overhead | ⚠️ Tie |
| **Large datasets (N > 10,000)** | O(log N) ≈ O(14) | O(1) | 🏆 Unordered |
| **Custom key types** | Need operator< | Need hash + operator== | ⚠️ Depends |
| **Keys hard to compare** | ❌ Complex | ✅ Only need equality | 🏆 Unordered |
| **Keys expensive to hash** | ✅ Only compare | ❌ Hash overhead | 🏆 Ordered |
| **Real-time systems** | ✅ Predictable O(log N) | ❌ Can degrade to O(N) | 🏆 Ordered |

**When to Use std::unordered_set:**

| Use Case | Why Unordered | Example |
|----------|---------------|---------|
| **Fast membership testing** | O(1) average lookup | Blacklist checking, duplicate detection |
| **Frequency counting** | O(1) insert/lookup | Word frequency, event counting |
| **Caching** | O(1) insert/find/erase | LRU cache, memoization |
| **Unique element collection** | O(1) insert (auto-dedup) | Collecting unique IDs from stream |
| **Symbol tables** | O(1) lookup | Compiler symbol table, variable lookup |
| **No ordering needed** | Don't pay for sorting | Set operations without order requirement |

**When to Use std::unordered_map:**

| Use Case | Why Unordered | Example |
|----------|---------------|---------|
| **Fast key-value lookup** | O(1) average access | Configuration store, dictionary |
| **Frequency maps** | O(1) increment via operator[] | Histogram, character count |
| **Indexing** | O(1) lookup by ID | User ID → User data mapping |
| **Memoization** | O(1) cache lookup | Dynamic programming, function results |
| **Graph adjacency** | O(1) neighbor lookup | Graph node → neighbors list |
| **Counters/accumulators** | O(1) increment | Event counters, aggregation |

**When to Prefer Ordered Containers (set/map):**

| Use Case | Why Ordered | Example |
|----------|---------------|---------|
| **Sorted iteration needed** | Always in-order | Displaying sorted results, ranked output |
| **Range queries** | O(log N) range access | Find all values between X and Y |
| **Nearest neighbor** | lower_bound/upper_bound | Find closest match, binary search |
| **Predictable performance** | Guaranteed O(log N) | Real-time systems, hard deadlines |
| **Small datasets** | O(log N) negligible | N < 100, tree overhead acceptable |
| **Poor hash functions** | Only need comparison | Complex keys hard to hash |
| **Order-dependent algorithms** | In-order traversal | Median finding, percentile calculation |

**Decision Tree:**

```
Do you need sorted iteration or range queries?
│
├─ YES → Use std::set/map (ordered)
│
└─ NO → Do you need guaranteed worst-case O(log N)?
    │
    ├─ YES (real-time/critical) → Use std::set/map (ordered)
    │
    └─ NO → Can you provide a good hash function?
        │
        ├─ NO (complex keys, hard to hash) → Use std::set/map (ordered)
        │
        └─ YES → Is dataset large (N > 1000)?
            │
            ├─ YES → Use std::unordered_set/map (hash) 🏆
            │
            └─ NO (N < 100) → Either works
                            → Prefer std::set/map (simpler, no hash overhead)
```

**Custom Hash Function Patterns:**

```cpp
// Pattern 1: Single-member struct
struct Point1D {
    int x;
    bool operator==(const Point1D& o) const { return x == o.x; }
};

struct Point1DHash {
    size_t operator()(const Point1D& p) const {
        return std::hash<int>{}(p.x);
    }
};

std::unordered_set<Point1D, Point1DHash> s1;

// Pattern 2: Two-member struct - XOR with shift
struct Point2D {
    int x, y;
    bool operator==(const Point2D& o) const {
        return x == o.x && y == o.y;
    }
};

struct Point2DHash {
    size_t operator()(const Point2D& p) const {
        size_t h1 = std::hash<int>{}(p.x);
        size_t h2 = std::hash<int>{}(p.y);
        return h1 ^ (h2 << 1);  // XOR with shift to avoid symmetry
    }
};

std::unordered_set<Point2D, Point2DHash> s2;

// Pattern 3: boost::hash_combine style (robust mixing)
struct Point3D {
    int x, y, z;
    bool operator==(const Point3D& o) const {
        return x == o.x && y == o.y && z == o.z;
    }
};

struct Point3DHash {
    size_t operator()(const Point3D& p) const {
        size_t seed = std::hash<int>{}(p.x);
        // Combine each member with magic constant (golden ratio)
        seed ^= std::hash<int>{}(p.y) + 0x9e3779b9 + (seed << 6) + (seed >> 2);
        seed ^= std::hash<int>{}(p.z) + 0x9e3779b9 + (seed << 6) + (seed >> 2);
        return seed;
    }
};

std::unordered_set<Point3D, Point3DHash> s3;
```

**Common Pitfalls and Solutions:**

| Pitfall | Problem | Solution |
|---------|---------|----------|
| **Using operator[] to check existence** | Creates entry if missing | Use find(), count(), or contains() |
| **Poor hash function** | O(N) performance degradation | Test distribution with bucket interface |
| **Forgetting to reserve()** | Multiple rehashes during bulk insert | Call reserve(n) before inserting n elements |
| **Modifying keys** | Undefined behavior, corrupts hash table | Keys are const; erase old, insert new |
| **Relying on iteration order** | Order undefined and unstable | Use ordered container or separate vector |
| **Iterator invalidation after rehash** | Dereferencing invalid iterator | Avoid iterators across insertions, or reserve() |
| **Not providing hash for custom types** | Compile error | Define hash function and equality operator |
| **Inconsistent hash and equality** | Keys lost, corruption | Ensure equal keys have equal hashes |

**Performance Tuning Checklist:**

```cpp
std::unordered_map<int, std::string> m;

// ✅ 1. Reserve capacity if size known
m.reserve(10000);  // Prevents rehashing during insertion

// ✅ 2. Adjust load factor based on needs
m.max_load_factor(0.5);  // Lower = faster lookup, more memory
// OR
m.max_load_factor(2.0);  // Higher = saves memory, slower lookup

// ✅ 3. Validate hash distribution (debug mode)
for (size_t i = 0; i < m.bucket_count(); ++i) {
    if (m.bucket_size(i) > 5) {  // Flag heavily loaded buckets
        std::cout << "Warning: Bucket " << i << " has "
                  << m.bucket_size(i) << " elements\n";
    }
}

// ✅ 4. Use emplace() for complex types
m.emplace(1, "one");  // Construct in-place, avoids copy

// ✅ 5. Use try_emplace() to avoid overwriting (C++17)
m.try_emplace(1, "ONE");  // No effect if key exists
m.try_emplace(2, "two");  // Inserts if new

// ✅ 6. Prefer find() over operator[] for read-only access
auto it = m.find(1);
if (it != m.end()) {
    std::cout << it->second;  // No unwanted insertion
}
```

**Best Practices Summary:**

1. **Choose hash containers when:** You need fastest average lookup, no ordering required, can provide good hash
2. **Choose ordered containers when:** Need sorted iteration, range queries, predictable worst-case, or poor hash
3. **Always reserve()** before bulk insertions to prevent rehashing
4. **Test hash distribution** using bucket interface during development
5. **Use find()/count()/contains()** for existence checks, not operator[]
6. **Ensure hash consistency** with equality: equal keys must have equal hashes
7. **Profile with realistic data** - theoretical O(1) doesn't always beat O(log N) in practice
8. **Consider memory constraints** - hash tables use more memory than you expect (buckets + nodes)
9. **Document hash functions** for custom types to maintain consistency
10. **Use try_emplace()** (C++17) to avoid overwriting existing keys accidentally

---

### EDGE_CASES: Hash Table Internals and Gotchas

#### Edge Case 1: Hash Collisions and Performance Degradation

Hash collisions occur when multiple keys produce the same hash value, forcing them into the same bucket. While STL uses separate chaining (linked lists in buckets) to handle collisions, excessive collisions degrade performance from O(1) to O(n) in the worst case where all elements hash to the same bucket.

```cpp
struct BadHash {
    size_t operator()(int x) const {
        return 42;  // ❌ All values hash to same bucket
    }
};

std::unordered_set<int, BadHash> s;
for (int i = 0; i < 10000; ++i) {
    s.insert(i);  // All elements in one bucket - O(n) lookup
}
// Lookup becomes O(n) instead of O(1)
```

The quality of your hash function directly impacts performance. A good hash function distributes values uniformly across buckets, minimizing collisions. Poor hash functions can make unordered containers perform worse than ordered containers. Always test hash functions with realistic data to ensure good distribution.

#### Edge Case 2: Rehashing and Iterator Invalidation

Rehashing occurs when the load factor exceeds max_load_factor (default 1.0) during insertion. The container allocates a larger bucket array, rehashes all elements into new buckets, and deallocates the old array. This operation invalidates **all iterators, pointers, and references** to elements, though the elements themselves remain valid.

```cpp
std::unordered_map<int, std::string> m;
m.reserve(10);  // Pre-allocate buckets
auto it = m.begin();
int* ptr = &m.begin()->first;

m.insert({1, "one"});  // May cause rehash
// ❌ it is now invalid if rehash occurred
// ❌ ptr is now dangling if rehash occurred

// ✅ Check bucket_count and reserve to avoid rehashing
m.reserve(100);  // Ensures capacity for 100 elements
```

Unlike ordered containers where iterator invalidation is limited, unordered container rehashing invalidates everything. You can prevent rehashing by calling `reserve(n)` before insertions if you know the final size. The `rehash(n)` function lets you manually trigger rehashing to a specific bucket count.

#### Edge Case 3: Custom Hash Functions and Key Types

Using custom types as keys requires providing both a hash function and an equality operator. The hash function must be consistent with equality: if two objects are equal, they must have the same hash value (though the converse need not be true).

```cpp
struct Point {
    int x, y;
    bool operator==(const Point& other) const {
        return x == other.x && y == other.y;
    }
};

// ❌ Missing hash function - won't compile
// std::unordered_set<Point> s;

struct PointHash {
    size_t operator()(const Point& p) const {
        // ✅ Combine x and y hashes
        return std::hash<int>{}(p.x) ^ (std::hash<int>{}(p.y) << 1);
    }
};

// ✅ Provide hash function as template argument
std::unordered_set<Point, PointHash> s;
s.insert({1, 2});
```

Common hash combination techniques include XOR with bit shifting, multiplication by prime numbers, or using `std::hash` with `boost::hash_combine` patterns. The goal is to mix bits effectively while maintaining efficiency. Avoid simple operations like addition which have poor distribution properties.

#### Edge Case 4: Load Factor and Performance Tuning

The load factor (element_count / bucket_count) controls the trade-off between memory usage and performance. Higher load factors save memory but increase collision probability and lookup time. Lower load factors waste memory but provide faster lookups.

```cpp
std::unordered_map<int, int> m;
std::cout << "Max load factor: " << m.max_load_factor() << "\n";  // Default: 1.0

m.max_load_factor(0.5);  // ✅ Lower threshold - faster lookups, more memory
// Rehash triggers at 50% bucket occupancy

m.max_load_factor(2.0);  // ✅ Higher threshold - saves memory, slower lookups
// Rehash triggers at 200% bucket occupancy

// Check current state
std::cout << "Size: " << m.size() << "\n";
std::cout << "Buckets: " << m.bucket_count() << "\n";
std::cout << "Load factor: " << m.load_factor() << "\n";
```

For performance-critical applications, profile with different load factors. Applications with predictable sizes benefit from `reserve()` to pre-allocate buckets. Applications with unpredictable sizes may benefit from adjusting max_load_factor based on memory constraints versus performance requirements.

#### Edge Case 5: Bucket Interface and Debugging

Unordered containers expose a bucket interface for debugging hash distribution and understanding internal structure. You can inspect which bucket contains which elements and identify poorly-distributed hash functions.

```cpp
std::unordered_set<int> s = {1, 2, 3, 4, 5};

for (size_t i = 0; i < s.bucket_count(); ++i) {
    std::cout << "Bucket " << i << ": ";
    for (auto it = s.begin(i); it != s.end(i); ++it) {
        std::cout << *it << " ";  // Elements in bucket i
    }
    std::cout << " (size: " << s.bucket_size(i) << ")\n";
}

// Check which bucket contains a specific element
int value = 3;
size_t bucket = s.bucket(value);
std::cout << value << " is in bucket " << bucket << "\n";
```

Ideally, elements should be evenly distributed across buckets with most buckets containing 0-2 elements. If many buckets are empty while others have many elements, your hash function needs improvement. Use this interface during development to validate hash function quality before production deployment.

---

### CODE_EXAMPLES: Practical Hash Container Demonstrations

#### Example 1: Basic std::unordered_set Operations

```cpp
#include <unordered_set>
#include <iostream>
#include <string>

int main() {
    // ✅ Declaration and initialization
    std::unordered_set<int> s1;
    std::unordered_set<int> s2 = {1, 2, 3, 4, 5};
    std::unordered_set<std::string> words = {"hello", "world"};
    
    // ✅ Insertion
    s1.insert(10);
    s1.insert(20);
    s1.emplace(30);  // Construct in-place
    auto [it, inserted] = s1.insert(10);  // Returns pair<iterator, bool>
    // inserted is false because 10 already exists
    
    // ✅ Lookup
    if (s1.find(10) != s1.end()) {
        std::cout << "Found 10\n";
    }
    if (s1.count(20) > 0) {  // count returns 0 or 1 for set
        std::cout << "Contains 20\n";
    }
    
    // ✅ Deletion
    s1.erase(10);  // Erase by value
    auto it2 = s1.find(20);
    if (it2 != s1.end()) {
        s1.erase(it2);  // Erase by iterator
    }
    
    // ✅ Iteration - order is undefined
    for (const auto& elem : s2) {
        std::cout << elem << " ";
    }
    
    return 0;
}
```

This example demonstrates fundamental operations on `std::unordered_set`. Key points: insertion returns a pair indicating success, lookup uses `find()` or `count()`, erasure can be by value or iterator, and iteration order is unspecified and may change after rehashing. The `emplace()` function constructs elements in-place, potentially avoiding copies.

#### Example 2: std::unordered_map with Custom Types

```cpp
#include <unordered_map>
#include <string>
#include <iostream>

struct Person {
    std::string name;
    int age;
    
    bool operator==(const Person& other) const {
        return name == other.name && age == other.age;
    }
};

// ✅ Custom hash function
struct PersonHash {
    size_t operator()(const Person& p) const {
        // Combine hash of name and age
        size_t h1 = std::hash<std::string>{}(p.name);
        size_t h2 = std::hash<int>{}(p.age);
        return h1 ^ (h2 << 1);  // Mix bits
    }
};

int main() {
    std::unordered_map<Person, std::string, PersonHash> directory;
    
    // ✅ Insert key-value pairs
    directory[{"Alice", 30}] = "Engineer";
    directory.insert({{"Bob", 25}, "Designer"});
    directory.emplace(Person{"Carol", 35}, "Manager");
    
    // ✅ Lookup and modify
    Person alice{"Alice", 30};
    if (directory.find(alice) != directory.end()) {
        std::cout << alice.name << " is a " << directory[alice] << "\n";
    }
    
    // ✅ operator[] creates default value if key doesn't exist
    std::string& job = directory[{"David", 40}];
    job = "Analyst";  // Modifies the inserted default value
    
    // ✅ Check existence before access to avoid unwanted insertions
    auto it = directory.find({"Eve", 28});
    if (it != directory.end()) {
        std::cout << it->second << "\n";
    } else {
        std::cout << "Eve not found\n";
    }
    
    return 0;
}
```

This example shows how to use custom types as keys in `std::unordered_map`. You must provide both `operator==` and a hash function. The hash function should combine member hashes effectively. Note that `operator[]` creates a default-constructed value if the key doesn't exist, while `find()` or `at()` don't modify the map.

#### Example 3: Hash Function Quality Testing

```cpp
#include <unordered_set>
#include <iostream>
#include <vector>

// ❌ Poor hash function - many collisions
struct PoorHash {
    size_t operator()(int x) const {
        return x % 10;  // Only 10 possible hash values
    }
};

// ✅ Good hash function - uniform distribution
struct GoodHash {
    size_t operator()(int x) const {
        return std::hash<int>{}(x);  // Standard hash
    }
};

template<typename Hash>
void analyze_distribution(const std::string& name) {
    std::unordered_set<int, Hash> s;
    s.reserve(1000);  // Pre-allocate to avoid rehashing during test
    
    // Insert 1000 sequential values
    for (int i = 0; i < 1000; ++i) {
        s.insert(i);
    }
    
    std::cout << "\n" << name << ":\n";
    std::cout << "Elements: " << s.size() << "\n";
    std::cout << "Buckets: " << s.bucket_count() << "\n";
    std::cout << "Load factor: " << s.load_factor() << "\n";
    
    // Count buckets with different occupancies
    std::vector<int> histogram(10, 0);
    for (size_t i = 0; i < s.bucket_count(); ++i) {
        size_t sz = s.bucket_size(i);
        if (sz < histogram.size()) {
            histogram[sz]++;
        }
    }
    
    std::cout << "Bucket size distribution:\n";
    for (size_t i = 0; i < histogram.size(); ++i) {
        if (histogram[i] > 0) {
            std::cout << "  Size " << i << ": " << histogram[i] << " buckets\n";
        }
    }
}

int main() {
    analyze_distribution<PoorHash>("Poor Hash");
    analyze_distribution<GoodHash>("Good Hash");
    return 0;
}
```

This example demonstrates how to evaluate hash function quality by analyzing bucket distribution. A good hash function creates many buckets with 0-2 elements and few buckets with many elements. A poor hash function creates uneven distribution with some buckets heavily loaded, degrading performance from O(1) to O(n).

#### Example 4: Performance Tuning with reserve() and max_load_factor()

```cpp
#include <unordered_map>
#include <chrono>
#include <iostream>

void test_without_reserve() {
    auto start = std::chrono::high_resolution_clock::now();
    
    std::unordered_map<int, int> m;
    // ❌ Multiple rehashing operations during insertion
    for (int i = 0; i < 100000; ++i) {
        m[i] = i * 2;
    }
    
    auto end = std::chrono::high_resolution_clock::now();
    auto duration = std::chrono::duration_cast<std::chrono::milliseconds>(end - start);
    std::cout << "Without reserve: " << duration.count() << " ms\n";
}

void test_with_reserve() {
    auto start = std::chrono::high_resolution_clock::now();
    
    std::unordered_map<int, int> m;
    m.reserve(100000);  // ✅ Pre-allocate buckets
    for (int i = 0; i < 100000; ++i) {
        m[i] = i * 2;
    }
    
    auto end = std::chrono::high_resolution_clock::now();
    auto duration = std::chrono::duration_cast<std::chrono::milliseconds>(end - start);
    std::cout << "With reserve: " << duration.count() << " ms\n";
}

void demonstrate_load_factor_tuning() {
    std::unordered_map<int, int> m;
    
    // Default load factor
    std::cout << "Default max_load_factor: " << m.max_load_factor() << "\n";
    
    // ✅ Lower load factor - faster lookups, more memory
    m.max_load_factor(0.5);
    m.reserve(100);
    std::cout << "After max_load_factor(0.5), bucket_count: " 
              << m.bucket_count() << "\n";
    
    // ✅ Higher load factor - saves memory, potentially slower
    m.max_load_factor(2.0);
    m.rehash(0);  // Trigger rehash with new constraint
    std::cout << "After max_load_factor(2.0), bucket_count: " 
              << m.bucket_count() << "\n";
}

int main() {
    test_without_reserve();
    test_with_reserve();
    demonstrate_load_factor_tuning();
    return 0;
}
```

This example shows performance optimization techniques for unordered containers. Using `reserve()` to pre-allocate buckets before bulk insertions avoids multiple costly rehashing operations. Adjusting `max_load_factor()` allows you to trade memory for speed or vice versa depending on your application's constraints.

#### Example 5: Bucket Interface for Debugging

```cpp
#include <unordered_set>
#include <iostream>
#include <iomanip>

void print_bucket_info(const std::unordered_set<int>& s) {
    std::cout << "\n=== Container Statistics ===\n";
    std::cout << "Size: " << s.size() << "\n";
    std::cout << "Bucket count: " << s.bucket_count() << "\n";
    std::cout << "Load factor: " << s.load_factor() << "\n";
    std::cout << "Max load factor: " << s.max_load_factor() << "\n";
    
    std::cout << "\n=== Bucket Contents ===\n";
    for (size_t i = 0; i < s.bucket_count(); ++i) {
        std::cout << "Bucket " << std::setw(3) << i << " [size " 
                  << s.bucket_size(i) << "]: ";
        
        for (auto it = s.begin(i); it != s.end(i); ++it) {
            std::cout << *it << " ";
        }
        std::cout << "\n";
    }
}

void demonstrate_element_lookup(const std::unordered_set<int>& s, int value) {
    size_t bucket_idx = s.bucket(value);
    std::cout << "\nElement " << value << " is in bucket " << bucket_idx << "\n";
    std::cout << "Bucket " << bucket_idx << " contains: ";
    for (auto it = s.begin(bucket_idx); it != s.end(bucket_idx); ++it) {
        std::cout << *it << " ";
    }
    std::cout << "\n";
}

int main() {
    std::unordered_set<int> s = {5, 15, 25, 35, 45, 12, 22, 32};
    
    print_bucket_info(s);
    demonstrate_element_lookup(s, 15);
    demonstrate_element_lookup(s, 32);
    
    // Force rehash and observe changes
    std::cout << "\n=== After rehash(20) ===\n";
    s.rehash(20);
    print_bucket_info(s);
    
    return 0;
}
```

This example demonstrates the bucket interface available for debugging and understanding internal structure. You can iterate through individual buckets, check bucket sizes, and determine which bucket contains specific elements. This is invaluable for validating hash function quality and diagnosing performance issues.

#### Example 6: Frequency Counter Pattern

```cpp
#include <unordered_map>
#include <string>
#include <vector>
#include <iostream>
#include <algorithm>

std::unordered_map<std::string, int> count_word_frequency(
    const std::vector<std::string>& words) {
    std::unordered_map<std::string, int> freq;
    
    // ✅ Efficient frequency counting
    for (const auto& word : words) {
        freq[word]++;  // Creates entry with value 0 if doesn't exist
    }
    
    return freq;
}

void print_top_n_words(const std::unordered_map<std::string, int>& freq, int n) {
    // Convert to vector for sorting (unordered_map doesn't support sorting)
    std::vector<std::pair<std::string, int>> items(freq.begin(), freq.end());
    
    // ✅ Sort by frequency (descending)
    std::partial_sort(items.begin(), 
                     items.begin() + std::min(n, (int)items.size()),
                     items.end(),
                     [](const auto& a, const auto& b) {
                         return a.second > b.second;
                     });
    
    std::cout << "Top " << n << " words:\n";
    for (int i = 0; i < std::min(n, (int)items.size()); ++i) {
        std::cout << items[i].first << ": " << items[i].second << "\n";
    }
}

int main() {
    std::vector<std::string> text = {
        "the", "quick", "brown", "fox", "jumps", "over", 
        "the", "lazy", "dog", "the", "fox", "was", "quick"
    };
    
    auto freq = count_word_frequency(text);
    print_top_n_words(freq, 3);
    
    return 0;
}
```

This example demonstrates a common pattern: using `unordered_map` as a frequency counter. The `operator[]` automatically creates entries with default value (0 for int), making the counting loop clean. Since unordered containers don't maintain order, you must convert to a vector for sorted output.

#### Example 7: Cache Implementation with LRU Eviction

```cpp
#include <unordered_map>
#include <list>
#include <iostream>

template<typename Key, typename Value>
class LRUCache {
private:
    size_t capacity;
    std::list<std::pair<Key, Value>> items;  // Most recent at front
    std::unordered_map<Key, typename std::list<std::pair<Key, Value>>::iterator> cache;
    
public:
    LRUCache(size_t cap) : capacity(cap) {}
    
    // ✅ Get value and mark as recently used
    Value* get(const Key& key) {
        auto it = cache.find(key);
        if (it == cache.end()) {
            return nullptr;  // Cache miss
        }
        
        // Move to front (most recently used)
        items.splice(items.begin(), items, it->second);
        return &it->second->second;
    }
    
    // ✅ Put value in cache
    void put(const Key& key, const Value& value) {
        auto it = cache.find(key);
        
        if (it != cache.end()) {
            // Update existing entry
            it->second->second = value;
            items.splice(items.begin(), items, it->second);
            return;
        }
        
        // New entry
        if (items.size() >= capacity) {
            // Evict least recently used (back of list)
            auto last = items.back();
            cache.erase(last.first);
            items.pop_back();
        }
        
        items.emplace_front(key, value);
        cache[key] = items.begin();
    }
    
    void display() const {
        std::cout << "Cache (most recent first): ";
        for (const auto& [k, v] : items) {
            std::cout << "[" << k << ":" << v << "] ";
        }
        std::cout << "\n";
    }
};

int main() {
    LRUCache<int, std::string> cache(3);
    
    cache.put(1, "one");
    cache.put(2, "two");
    cache.put(3, "three");
    cache.display();  // [3:three] [2:two] [1:one]
    
    cache.get(1);  // Access 1, moves to front
    cache.display();  // [1:one] [3:three] [2:two]
    
    cache.put(4, "four");  // Evicts 2 (LRU)
    cache.display();  // [4:four] [1:one] [3:three]
    
    return 0;
}
```

This example shows a practical application combining `unordered_map` with `std::list` to implement an LRU cache. The unordered_map provides O(1) lookup to list iterators, while the list maintains access order. This demonstrates how unordered containers excel in real-world data structure implementations.

#### Example 8: Avoiding Unwanted Insertions with operator[]

```cpp
#include <unordered_map>
#include <iostream>

void demonstrate_operator_bracket_pitfall() {
    std::unordered_map<std::string, int> scores;
    scores["Alice"] = 95;
    scores["Bob"] = 87;
    
    // ❌ Checking if key exists with operator[] creates the key!
    if (scores["Charlie"] == 0) {
        std::cout << "Charlie not found\n";
    }
    // Now "Charlie" exists with value 0
    std::cout << "Size after check: " << scores.size() << "\n";  // 3, not 2!
    
    // ✅ Correct way to check existence
    if (scores.find("David") == scores.end()) {
        std::cout << "David not found\n";
    }
    std::cout << "Size after find: " << scores.size() << "\n";  // Still 3
    
    // ✅ Use count() for existence check
    if (scores.count("Eve") == 0) {
        std::cout << "Eve not found\n";
    }
    
    // ✅ Use at() for access without insertion (throws if not found)
    try {
        int score = scores.at("Frank");
    } catch (const std::out_of_range& e) {
        std::cout << "Frank not found (at() threw exception)\n";
    }
}

int main() {
    demonstrate_operator_bracket_pitfall();
    return 0;
}
```

This example highlights a critical pitfall: `operator[]` creates a default-constructed value if the key doesn't exist. For checking existence, use `find()`, `count()`, or `contains()` (C++20). For access without modification, use `at()` which throws an exception if the key is missing, making the error explicit.

---

### INTERVIEW_QA: Comprehensive Hash Container Questions

#### Q1: What is the primary difference between ordered and unordered associative containers?
**Difficulty:** #beginner
**Category:** #fundamentals #containers
**Concepts:** #hash_table #binary_search_tree #time_complexity

**Answer:**
Ordered containers (set/map) use balanced binary search trees providing O(log n) operations and sorted iteration, while unordered containers (unordered_set/unordered_map) use hash tables providing average O(1) operations without guaranteed order.

**Code example:**
```cpp
std::set<int> ordered = {3, 1, 4, 1, 5};
// Iterates: 1, 3, 4, 5 (sorted)

std::unordered_set<int> unordered = {3, 1, 4, 1, 5};
// Iterates: undefined order, may be 4, 3, 5, 1
```

**Explanation:**
The fundamental trade-off is between ordering guarantees and average-case performance. Ordered containers maintain elements in sorted order using tree-based structures, enabling range queries and sorted iteration but requiring logarithmic time for all operations. Unordered containers sacrifice ordering for constant average-time operations using hash tables, making them faster for simple lookups but unable to efficiently answer range queries or provide sorted iteration.

**Key takeaway:** Choose unordered containers when you need fastest average lookup and don't require sorted order; choose ordered containers when you need sorted iteration or range queries.

---

#### Q2: How does a hash table handle collisions in std::unordered_map?
**Difficulty:** #intermediate
**Category:** #internals #hash_table
**Concepts:** #collision_resolution #separate_chaining #hash_function

**Answer:**
STL unordered containers use separate chaining with linked lists in each bucket. Elements with the same hash value are stored in the same bucket as a linked list, requiring linear search within that bucket.

**Code example:**
```cpp
// Multiple keys may hash to same bucket
std::unordered_map<int, int> m;
m[1] = 10;   // Hashes to bucket A
m[101] = 20; // May also hash to bucket A (collision)
// Bucket A now contains: [1:10] -> [101:20] as linked list
```

**Explanation:**
When two keys hash to the same bucket index, they're stored in the same bucket as a linked list. During lookup, the container first computes the hash to find the bucket, then performs linear search within that bucket using the equality operator to find the exact key. This is why lookup degrades to O(n) in the worst case when all elements collide into one bucket, though good hash functions make this extremely unlikely in practice.

**Key takeaway:** Hash table performance depends critically on hash function quality to minimize collisions and maintain O(1) average performance.

---

#### Q3: What happens to iterators when an unordered_map rehashes?
**Difficulty:** #intermediate
**Category:** #memory_management #iterators
**Concepts:** #rehashing #iterator_invalidation #load_factor

**Answer:**
Rehashing invalidates all iterators, pointers, and references to elements. The elements themselves remain valid but move to new buckets in a newly allocated bucket array.

**Code example:**
```cpp
std::unordered_map<int, int> m;
m.reserve(5);
auto it = m.begin();
int* ptr = &m.begin()->first;

m.insert({1, 10});  // May trigger rehash
// ❌ it is now invalid
// ❌ ptr is dangling
// ✅ Elements still exist but iterators don't point to them
```

**Explanation:**
Rehashing occurs when the load factor exceeds max_load_factor after insertion. The container allocates a new, larger bucket array, recomputes hash indices for all elements, and moves them to new buckets. This process invalidates all iterators because they point to the old bucket structure which gets deallocated. Unlike tree-based containers where insertions rarely invalidate iterators, unordered containers can invalidate all iterators on any insertion that triggers rehashing.

**Key takeaway:** Use reserve() before bulk insertions to pre-allocate buckets and prevent iterator invalidation from rehashing.

---

#### Q4: Why must custom key types provide both a hash function and equality operator?
**Difficulty:** #intermediate
**Category:** #custom_types #hash_function
**Concepts:** #operator_overload #hash_consistency #key_comparison

**Answer:**
The hash function determines the bucket for a key, while the equality operator identifies the exact element within that bucket. They must be consistent: equal objects must have equal hashes.

**Code example:**
```cpp
struct Point {
    int x, y;
    bool operator==(const Point& o) const {
        return x == o.x && y == o.y;  // ✅ Define equality
    }
};

struct PointHash {
    size_t operator()(const Point& p) const {
        return std::hash<int>{}(p.x) ^ (std::hash<int>{}(p.y) << 1);
        // ✅ Must be consistent: equal points have equal hashes
    }
};

std::unordered_set<Point, PointHash> s;
```

**Explanation:**
The unordered container first uses the hash function to compute a bucket index via modulo operation. Multiple keys can hash to the same bucket (collisions). Within a bucket, the container uses the equality operator to distinguish between different keys that happened to collide. The consistency requirement is critical: if two objects are equal according to operator==, they must produce the same hash value, otherwise the same logical key could be inserted into different buckets, breaking container invariants.

**Key takeaway:** Always ensure hash function consistency with equality: equal objects must hash to the same value, though different objects may also hash to the same value (collisions).

---

#### Q5: What is load factor and how does it affect performance?
**Difficulty:** #intermediate
**Category:** #performance #tuning
**Concepts:** #load_factor #memory_vs_speed #rehashing

**Answer:**
Load factor is the ratio of elements to buckets (size / bucket_count). Higher load factors save memory but increase collision probability, while lower load factors use more memory but provide faster lookups.

**Code example:**
```cpp
std::unordered_map<int, int> m;
std::cout << "Load factor: " << m.load_factor() << "\n";
std::cout << "Max load factor: " << m.max_load_factor() << "\n";  // Default: 1.0

m.max_load_factor(0.5);  // ✅ Rehash at 50% occupancy - faster lookups
m.max_load_factor(2.0);  // ✅ Rehash at 200% occupancy - saves memory
```

**Explanation:**
The load factor controls the density of the hash table. When load factor is low (many empty buckets), each bucket contains fewer elements on average, leading to faster lookups within buckets. When load factor is high (few empty buckets), buckets contain more elements, increasing the time for linear search within buckets. The max_load_factor parameter determines when automatic rehashing occurs. The default of 1.0 balances memory and speed, but you can adjust it based on your application's constraints.

**Key takeaway:** Tune max_load_factor based on your application: lower values for speed-critical lookups, higher values for memory-constrained environments.

---

#### Q6: How would you implement a frequency counter for words in a text?
**Difficulty:** #beginner
**Category:** #common_patterns #interview_favorite
**Concepts:** #frequency_counting #operator_brackets #iteration

**Answer:**
Use std::unordered_map<string, int> where operator[] automatically creates entries with value 0 for new words, then increment the count for each word occurrence.

**Code example:**
```cpp
std::unordered_map<std::string, int> count_words(
    const std::vector<std::string>& words) {
    std::unordered_map<std::string, int> freq;
    for (const auto& word : words) {
        freq[word]++;  // ✅ Creates entry with 0 if new, then increments
    }
    return freq;
}
```

**Explanation:**
The frequency counter pattern leverages operator[]'s behavior of creating a default-constructed value (0 for int) when accessing a non-existent key. This eliminates the need for explicit existence checks. The pattern is efficient because unordered_map provides O(1) average lookup and insertion, making the overall algorithm O(n) for n words. For printing results in sorted order, copy entries to a vector and sort since unordered_map doesn't maintain any particular order.

**Key takeaway:** Unordered_map with operator[] provides the most concise and efficient pattern for frequency counting problems.

---

#### Q7: What is the time complexity of operations on unordered containers?
**Difficulty:** #beginner
**Category:** #complexity_analysis #fundamentals
**Concepts:** #big_o #average_case #worst_case

**Answer:**
Average case: O(1) for search, insert, delete. Worst case: O(n) when all elements collide into one bucket. Iteration is always O(n).

**Code example:**
```cpp
std::unordered_set<int> s;
s.insert(42);     // Average O(1), worst O(n)
s.find(42);       // Average O(1), worst O(n)
s.erase(42);      // Average O(1), worst O(n)

// Iteration is always O(n)
for (const auto& elem : s) {
    // Process each element
}
```

**Explanation:**
The average O(1) complexity assumes a good hash function that distributes elements uniformly across buckets. In this case, each bucket contains a constant number of elements on average, making operations constant time. The worst case O(n) occurs when a poor hash function causes all elements to collide into a single bucket, reducing the hash table to a linked list. Rehashing operations are amortized O(n) but happen infrequently. This contrasts with ordered containers which guarantee O(log n) for all operations but never achieve O(1).

**Key takeaway:** Unordered containers trade worst-case guarantees for better average-case performance compared to ordered containers.

---

#### Q8: Can you modify keys in an unordered_map? Why or why not?
**Difficulty:** #intermediate
**Category:** #correctness #undefined_behavior
**Concepts:** #key_immutability #hash_consistency #undefined_behavior

**Answer:**
No, modifying keys causes undefined behavior because it breaks the hash table's internal structure. The key's hash determines its bucket, so changing the key invalidates that association.

**Code example:**
```cpp
std::unordered_map<std::string, int> m;
m["abc"] = 1;

for (auto& [k, v] : m) {
    k[0] = 'x';  // ❌ UNDEFINED BEHAVIOR - modifies key
    // Hash table now corrupted: key content changed but bucket unchanged
}

// ✅ Correct: erase old entry and insert new one
auto it = m.find("abc");
if (it != m.end()) {
    int value = it->second;
    m.erase(it);
    m["xbc"] = value;  // Insert with new key
}
```

**Explanation:**
Keys in associative containers must remain immutable after insertion because the container's internal structure depends on them. For unordered containers, the hash value computed at insertion time determines which bucket stores the element. If you modify the key afterward, its hash value changes but it remains in the old bucket, making future lookups fail. The container can't find the element because it searches the wrong bucket. This is undefined behavior and may cause crashes or silent data corruption.

**Key takeaway:** Never modify keys in associative containers; keys must be treated as const after insertion to maintain container invariants.

---

#### Q9: What is the purpose of std::unordered_map::reserve()?
**Difficulty:** #intermediate
**Category:** #performance #memory_management
**Concepts:** #preallocation #rehashing_prevention #optimization

**Answer:**
reserve(n) pre-allocates buckets for at least n elements, preventing rehashing during subsequent insertions. This improves performance by avoiding multiple reallocation and rehashing operations.

**Code example:**
```cpp
std::unordered_map<int, int> m;
m.reserve(10000);  // ✅ Pre-allocate for 10000 elements

for (int i = 0; i < 10000; ++i) {
    m[i] = i * 2;  // No rehashing during loop
}
// Much faster than letting container rehash multiple times
```

**Explanation:**
Without reserve(), the container starts with a small number of buckets and rehashes multiple times as elements are added and the load factor is exceeded. Each rehash allocates a new bucket array, recomputes all hash indices, and moves all elements to new buckets—an O(n) operation. When you know the approximate final size, calling reserve() once avoids all these rehashing operations, significantly improving performance for bulk insertions. The container allocates enough buckets upfront to hold the requested number of elements without exceeding max_load_factor.

**Key takeaway:** Always use reserve() before bulk insertions when you know the approximate final size to avoid costly rehashing operations.

---

#### Q10: How do you iterate through elements in a specific bucket?
**Difficulty:** #intermediate
**Category:** #debugging #internals
**Concepts:** #bucket_interface #local_iterator #hash_distribution

**Answer:**
Use begin(bucket_index) and end(bucket_index) to get local iterators for a specific bucket, allowing you to inspect bucket contents and verify hash distribution.

**Code example:**
```cpp
std::unordered_set<int> s = {1, 2, 3, 4, 5};

for (size_t i = 0; i < s.bucket_count(); ++i) {
    std::cout << "Bucket " << i << ": ";
    for (auto it = s.begin(i); it != s.end(i); ++it) {
        std::cout << *it << " ";  // Elements in bucket i
    }
    std::cout << " (size: " << s.bucket_size(i) << ")\n";
}

// Find which bucket contains a specific element
size_t bucket = s.bucket(3);
std::cout << "Element 3 is in bucket " << bucket << "\n";
```

**Explanation:**
The bucket interface provides debugging and introspection capabilities for understanding hash distribution. Local iterators (begin/end with bucket index) let you iterate through elements within a single bucket. The bucket(key) function returns which bucket contains a given key. The bucket_size(idx) function returns the number of elements in a bucket. This interface is invaluable for validating hash function quality—ideally, most buckets should have 0-2 elements with a uniform distribution. If you see many empty buckets and a few heavily loaded ones, your hash function needs improvement.

**Key takeaway:** Use the bucket interface during development to validate hash function quality and diagnose performance issues.

---

#### Q11: What happens if you insert a duplicate key in an unordered_set?
**Difficulty:** #beginner
**Category:** #behavior #fundamentals
**Concepts:** #uniqueness_constraint #insert_semantics #return_value

**Answer:**
Insert fails and returns a pair with an iterator to the existing element and false for the insertion indicator. The set maintains uniqueness and doesn't modify the existing element.

**Code example:**
```cpp
std::unordered_set<int> s = {1, 2, 3};

auto [it1, inserted1] = s.insert(4);
// inserted1 is true, it1 points to 4

auto [it2, inserted2] = s.insert(2);
// inserted2 is false, it2 points to existing 2
// Set still contains: {1, 2, 3, 4}

std::cout << "Inserted: " << inserted2 << "\n";  // 0 (false)
```

**Explanation:**
Both unordered_set and set maintain element uniqueness. When you attempt to insert a duplicate, the insert() method checks if an equivalent element exists using the equality predicate. If found, insertion fails and the method returns a pair containing an iterator to the existing element and false. This behavior allows you to detect duplicates and access the existing element without requiring a separate find() call. For unordered_map, attempting to insert a duplicate key similarly fails, but you can use operator[] or insert_or_assign() to overwrite existing values.

**Key takeaway:** Insert operations in unordered containers return useful information about whether insertion succeeded, enabling duplicate detection without additional lookups.

---

#### Q12: How does std::unordered_map::operator[] differ from at()?
**Difficulty:** #beginner
**Category:** #api_differences #safety
**Concepts:** #exception_safety #default_construction #operator_overload

**Answer:**
operator[] creates a default-constructed value if the key doesn't exist, while at() throws std::out_of_range exception for missing keys without modifying the map.

**Code example:**
```cpp
std::unordered_map<std::string, int> m;
m["Alice"] = 95;

int score1 = m["Bob"];  // ✅ Creates Bob->0, returns 0
std::cout << m.size();  // 2 (Alice and Bob)

try {
    int score2 = m.at("Carol");  // ❌ Throws exception
} catch (const std::out_of_range& e) {
    std::cout << "Carol not found\n";
}
std::cout << m.size();  // Still 2 (Carol not added)
```

**Explanation:**
The operator[] is designed for convenient insertion and modification, automatically creating missing keys with default-constructed values. This is perfect for patterns like frequency counting where you want `map[key]++` to work even if key doesn't exist. However, this convenience can be a pitfall when checking for existence, as simply accessing a key creates it. The at() method provides safer read-only access by throwing an exception for missing keys, making the error explicit and preventing unwanted insertions. Use operator[] when you want insertion semantics, at() when you want exceptions for missing keys, and find() when you want to check existence without throwing.

**Key takeaway:** Choose operator[] for insertion/modification patterns and at() for safe access that prevents unwanted key creation.

---

#### Q13: What is a good strategy for combining hash values?
**Difficulty:** #advanced
**Category:** #hash_function #custom_types
**Concepts:** #hash_combination #bit_manipulation #distribution

**Answer:**
Common strategies include XOR with bit shifting, multiplication by prime numbers, or boost::hash_combine pattern. The goal is mixing bits effectively while maintaining uniform distribution.

**Code example:**
```cpp
struct Pair {
    int x, y;
    
    bool operator==(const Pair& o) const {
        return x == o.x && y == o.y;
    }
};

struct PairHash {
    size_t operator()(const Pair& p) const {
        // ✅ XOR with bit shift
        size_t h1 = std::hash<int>{}(p.x);
        size_t h2 = std::hash<int>{}(p.y);
        return h1 ^ (h2 << 1);
        
        // ✅ Alternative: boost::hash_combine pattern
        // size_t seed = h1;
        // seed ^= h2 + 0x9e3779b9 + (seed << 6) + (seed >> 2);
        // return seed;
    }
};

std::unordered_set<Pair, PairHash> s;
```

**Explanation:**
Combining hash values poorly can cause clustering and degrade performance. Simple operations like addition fail because `hash(a, b) == hash(b, a)`, losing information about member order. XOR alone is symmetric and provides weak mixing. The bit-shift pattern `h1 ^ (h2 << 1)` breaks symmetry and mixes bits between hash values. The boost::hash_combine pattern uses a magic constant (golden ratio) and multiple bit operations for even better mixing. The key principles are: avoid symmetry, mix bits from different members, and maintain avalanche effect where small input changes cause large output changes.

**Key takeaway:** Use XOR with bit shifting for simple cases, boost::hash_combine pattern for production code requiring robust hash distribution.

---

#### Q14: Can unordered containers guarantee iteration order?
**Difficulty:** #beginner
**Category:** #behavior #iteration
**Concepts:** #iteration_order #undefined_behavior #hash_table

**Answer:**
No, iteration order is unspecified and may change after rehashing. Elements are traversed in bucket order, which depends on hash values and bucket array size.

**Code example:**
```cpp
std::unordered_set<int> s = {5, 2, 8, 1, 9};

// First iteration - some order
for (int x : s) std::cout << x << " ";
std::cout << "\n";

// Force rehash
s.rehash(100);

// Second iteration - potentially different order
for (int x : s) std::cout << x << " ";
std::cout << "\n";
// Order may have changed after rehashing
```

**Explanation:**
Unordered containers iterate through buckets in array index order, outputting all elements in each bucket before moving to the next. Since hash values and bucket indices depend on the bucket count, rehashing changes where elements are stored, altering iteration order. Even without rehashing, you cannot rely on insertion order or any particular ordering. If you need predictable order, use ordered containers (set/map) for sorted order, or maintain a separate vector alongside the unordered container for insertion order. C++20 doesn't add any ordering guarantees to unordered containers.

**Key takeaway:** Never depend on iteration order in unordered containers; use ordered containers or maintain separate ordering structure if order matters.

---

#### Q15: What is the difference between std::unordered_set and std::unordered_multiset?
**Difficulty:** #beginner
**Category:** #container_variants #fundamentals
**Concepts:** #uniqueness #duplicates #multiset

**Answer:**
unordered_set enforces uniqueness (each element appears once), while unordered_multiset allows duplicates. Both use hash tables but multiset can store multiple equivalent elements.

**Code example:**
```cpp
std::unordered_set<int> s;
s.insert(5);
s.insert(5);  // ✅ Second insert fails
std::cout << s.size() << "\n";  // 1

std::unordered_multiset<int> ms;
ms.insert(5);
ms.insert(5);  // ✅ Both inserts succeed
std::cout << ms.size() << "\n";  // 2
std::cout << ms.count(5) << "\n";  // 2 (counts occurrences)
```

**Explanation:**
The set variants maintain uniqueness by checking for existing elements before insertion, while multiset variants allow multiple copies of equivalent elements. For unordered_multiset, elements with the same value still hash to the same bucket and are stored together. The count() method returns the number of occurrences, and equal_range() returns iterators to all elements with a given value. Use multiset when you need to count duplicates or maintain multiple entries with the same key, such as tracking repeated items in input data.

**Key takeaway:** Choose unordered_set for uniqueness constraint, unordered_multiset when duplicates are meaningful and should be preserved.

---

#### Q16: How do you check if a key exists without creating it in unordered_map?
**Difficulty:** #beginner
**Category:** #common_pitfalls #best_practices
**Concepts:** #existence_check #operator_brackets #find_method

**Answer:**
Use find(), count(), or contains() (C++20). Never use operator[] for existence checks as it creates a default-constructed value for missing keys.

**Code example:**
```cpp
std::unordered_map<std::string, int> m;
m["Alice"] = 95;

// ❌ WRONG - creates entry
if (m["Bob"] == 0) {
    std::cout << "Bob not found\n";
}
std::cout << m.size();  // 2 - Bob was created!

// ✅ Correct ways
if (m.find("Carol") != m.end()) {
    std::cout << "Carol found\n";
}

if (m.count("David") > 0) {
    std::cout << "David found\n";
}

// ✅ C++20
if (m.contains("Eve")) {
    std::cout << "Eve found\n";
}
```

**Explanation:**
The operator[] trap catches many beginners because it's designed for insertion convenience, not existence checks. When you access m["key"], if key doesn't exist, the map creates it with a default-constructed value and returns a reference to it. This is perfect for patterns like `m[key]++` but dangerous for simple existence checks. The find() method returns an iterator (end() if not found) without modification. The count() method returns 0 or 1 for map/set (can be higher for multimap/multiset) without modification. The C++20 contains() method provides the most explicit and readable existence check.

**Key takeaway:** For existence checks in unordered_map, use find(), count(), or contains() - never operator[] which creates unwanted entries.

---

#### Q17: What is the cost of std::unordered_map::rehash()?
**Difficulty:** #advanced
**Category:** #performance #complexity_analysis
**Concepts:** #rehashing #amortized_cost #memory_allocation

**Answer:**
Rehashing is O(n) where n is the number of elements. It allocates a new bucket array, recomputes all hash indices, and moves all elements to new buckets.

**Code example:**
```cpp
std::unordered_map<int, int> m;
for (int i = 0; i < 1000; ++i) {
    m[i] = i;  // Multiple automatic rehashes during loop
}

// Manual rehash
m.rehash(10000);  // ✅ O(n) operation
// Allocates new bucket array, rehashes all 1000 elements

// Check new state
std::cout << "Buckets: " << m.bucket_count() << "\n";
std::cout << "Load factor: " << m.load_factor() << "\n";
```

**Explanation:**
During rehashing, the container cannot reuse old bucket assignments because bucket indices are computed as `hash % bucket_count`, and bucket_count changed. Every element must have its hash value recomputed modulo the new bucket count, and then be moved to the new bucket array. This involves iterating through all n elements (O(n)), computing bucket indices (O(1) each), and moving elements (O(1) each with move semantics). The old bucket array is then deallocated. While rehashing is expensive, it happens infrequently and is amortized to O(1) per insertion. Using reserve() to pre-allocate appropriate capacity avoids rehashing entirely during predictable growth.

**Key takeaway:** Rehashing is expensive (O(n)) but amortized across many operations; use reserve() to avoid rehashing when final size is known.

---

#### Q18: Why might std::unordered_map be slower than std::map in practice?
**Difficulty:** #advanced
**Category:** #performance #interview_favorite
**Concepts:** #cache_locality #worst_case #practical_performance

**Answer:**
Poor cache locality from non-contiguous bucket storage, hash computation overhead, and bad hash functions causing collisions can make unordered_map slower than map's tree traversal despite theoretical advantages.

**Code example:**
```cpp
// Scenario where map might be faster:
// 1. Poor cache locality
std::unordered_map<int, LargeStruct> um;  // Random memory access per bucket
std::map<int, LargeStruct> m;  // Better locality in tree nodes

// 2. Small dataset
for (int i = 0; i < 100; ++i) {
    // map's O(log n) ≈ O(7) operations
    // unordered_map's hash computation + bucket access may be slower
}

// 3. Sequential access patterns
for (int i = 0; i < 1000; ++i) {
    m[i];  // Tree prefetcher can help
    um[i];  // Random bucket access defeats prefetching
}
```

**Explanation:**
Theoretical complexity doesn't always translate to practical performance. Unordered_map's O(1) average case assumes constant-time hash computation, but complex hash functions or large keys make this expensive. Tree-based map stores elements in connected nodes that may be cache-friendly, while hash table buckets scatter across memory causing cache misses. For small datasets (n < 100), O(log n) is negligible and map's simpler operations may be faster. Sequential access patterns benefit from CPU prefetching in trees but not in hash tables. Additionally, map guarantees O(log n) worst case while unordered_map degrades to O(n) with hash collisions, making map more predictable for real-time systems.

**Key takeaway:** Profile both containers with realistic data; unordered_map isn't always faster despite O(1) average case, especially for small datasets or poor hash functions.

---

#### Q19: How do you implement a custom allocator for unordered containers?
**Difficulty:** #advanced
**Category:** #memory_management #allocators
**Concepts:** #custom_allocator #memory_pool #template_parameter

**Answer:**
Define an allocator type with allocate(), deallocate(), and other required members, then pass it as the last template parameter to the unordered container.

**Code example:**
```cpp
template<typename T>
struct PoolAllocator {
    using value_type = T;
    
    PoolAllocator() = default;
    template<typename U>
    PoolAllocator(const PoolAllocator<U>&) {}
    
    T* allocate(std::size_t n) {
        std::cout << "Allocating " << n << " objects\n";
        return static_cast<T*>(::operator new(n * sizeof(T)));
    }
    
    void deallocate(T* p, std::size_t n) {
        std::cout << "Deallocating " << n << " objects\n";
        ::operator delete(p);
    }
};

// Use with unordered_map
std::unordered_map<int, std::string, 
                   std::hash<int>, 
                   std::equal_to<int>,
                   PoolAllocator<std::pair<const int, std::string>>> m;
```

**Explanation:**
Unordered containers accept an allocator as the fifth template parameter (after key, value/mapped_type, hash, and equality). The allocator controls how the container allocates memory for its internal structures including bucket arrays and node storage. Custom allocators enable optimizations like memory pools for reduced fragmentation, tracking for debugging, or special memory regions for shared memory scenarios. The allocator must provide value_type, allocate(n), deallocate(p, n), and be copy-constructible with proper rebind semantics for allocating different types like internal nodes.

**Key takeaway:** Custom allocators enable fine-grained memory control in unordered containers, useful for performance optimization or special memory requirements.

---

#### Q20: What is the time complexity of std::unordered_map::clear()?
**Difficulty:** #intermediate
**Category:** #complexity_analysis #memory_management
**Concepts:** #destruction #time_complexity #bucket_cleanup

**Answer:**
O(n) where n is the number of elements. Clear must destroy all elements and reset all buckets to empty state, but typically doesn't deallocate the bucket array.

**Code example:**
```cpp
std::unordered_map<int, std::string> m;
for (int i = 0; i < 10000; ++i) {
    m[i] = "value";
}

size_t old_buckets = m.bucket_count();
m.clear();  // ✅ O(n) - destroys all 10000 elements

std::cout << "Size: " << m.size() << "\n";  // 0
std::cout << "Buckets: " << m.bucket_count() << "\n";  // Usually same as old_buckets
// Bucket array not deallocated, ready for reuse
```

**Explanation:**
The clear() operation must visit each element to call its destructor, especially important for types with non-trivial destructors like std::string. After destruction, clear() resets all bucket pointers to null and sets size to zero. However, it typically preserves the bucket array allocation for future insertions, avoiding deallocation and reallocation costs. This means memory usage doesn't decrease after clear(). If you want to release memory, use the shrink_to_fit() method after clear(), or destroy and reconstruct the container. The O(n) complexity is unavoidable for proper destructor calls and cleanup.

**Key takeaway:** clear() is O(n) for element destruction but preserves bucket array capacity; use with shrink_to_fit() or reconstruction to reclaim memory.

---

#### Q21: How does std::unordered_map handle const key types?
**Difficulty:** #intermediate
**Category:** #type_system #const_correctness
**Concepts:** #const_key #pair_internals #key_immutability

**Answer:**
Keys in unordered_map are always const to prevent modification that would break internal structure. The value_type is std::pair<const Key, T>, not std::pair<Key, T>.

**Code example:**
```cpp
std::unordered_map<int, std::string> m;
m[1] = "one";

// Value type is pair<const int, string>
for (auto& [k, v] : m) {
    // k is const int& - cannot modify
    // k = 5;  // ❌ Compile error: k is const
    v = "modified";  // ✅ Can modify value
}

// Accessing through iterator
auto it = m.begin();
// it->first is const int
// it->second is string
// it->first = 10;  // ❌ Compile error
```

**Explanation:**
The const qualifier on keys is a critical safety feature preventing undefined behavior. Since the hash value and bucket assignment depend on the key's content, modifying a key after insertion would break the container's internal invariants. The element's bucket would become incorrect for its actual key value, making lookups fail. By making the key const in the pair type, the compiler prevents accidental modification. This is different from map where you can't modify keys through iterators, but here it's enforced at the type system level. If you need to change a key, you must erase the old entry and insert a new one with the new key.

**Key takeaway:** Keys in unordered_map are always const in the pair<const Key, T> value type, enforced at compile time to prevent container corruption.

---

#### Q22: What happens if your hash function returns the same value for all inputs?
**Difficulty:** #intermediate
**Category:** #performance #hash_function
**Concepts:** #degenerate_case #worst_case #collision_handling

**Answer:**
All elements hash to the same bucket, degrading performance from O(1) to O(n) for all operations as the hash table becomes a single linked list.

**Code example:**
```cpp
struct ConstantHash {
    size_t operator()(int x) const {
        return 42;  // ❌ Worst possible hash function
    }
};

std::unordered_set<int, ConstantHash> s;
for (int i = 0; i < 10000; ++i) {
    s.insert(i);  // All elements in one bucket
}

// Lookup becomes O(n) instead of O(1)
auto start = std::chrono::high_resolution_clock::now();
s.find(9999);  // Must traverse all 10000 elements in single bucket
auto end = std::chrono::high_resolution_clock::now();

std::cout << "All in one bucket: " << s.bucket_size(s.bucket(42)) << "\n";
```

**Explanation:**
This extreme case demonstrates why hash function quality is critical. When all elements collide into one bucket, the hash table reduces to a linked list with linear search time. Insert, find, and erase all become O(n) operations instead of O(1) average case. The load factor calculation becomes meaningless since one bucket holds everything while others remain empty. Real-world poor hash functions that only use a subset of key bits or have limited output range cause similar but less extreme performance degradation. Always validate hash distribution using the bucket interface during development to ensure uniform distribution across buckets.

**Key takeaway:** Hash function quality directly determines unordered container performance; poor hash functions eliminate the performance benefits of hash tables.

---

#### Q23: Can you have an unordered_map with a pointer key type?
**Difficulty:** #intermediate
**Category:** #custom_types #hash_function
**Concepts:** #pointer_hash #value_semantics #identity_hash

**Answer:**
Yes, but the default hash function hashes the pointer address (identity), not the pointed-to value. For value semantics, provide a custom hash that dereferences and hashes the contents.

**Code example:**
```cpp
// ❌ Default: hashes pointer address
std::unordered_map<int*, std::string> m1;
int x = 5, y = 5;
m1[&x] = "first";
m1[&y] = "second";  // Different keys despite same value
std::cout << m1.size() << "\n";  // 2

// ✅ Custom hash for value semantics
struct PointerHash {
    size_t operator()(const int* p) const {
        return std::hash<int>{}(*p);  // Hash pointed-to value
    }
};

struct PointerEqual {
    bool operator()(const int* a, const int* b) const {
        return *a == *b;  // Compare pointed-to values
    }
};

std::unordered_map<int*, std::string, PointerHash, PointerEqual> m2;
m2[&x] = "first";
m2[&y] = "second";  // Same key (both point to 5)
std::cout << m2.size() << "\n";  // 1
```

**Explanation:**
The default std::hash<T*> hashes the pointer value itself, implementing identity semantics where two pointers are equal only if they point to the same memory location. This is useful for pointer identity maps but not when you want value semantics. For value semantics, you must provide both a custom hash function that dereferences and hashes the pointed-to object, and a custom equality predicate that compares pointed-to values. Be extremely careful with pointer lifetimes—if pointers become dangling while stored as keys, the map's behavior becomes undefined. Consider using smart pointers or storing values directly instead.

**Key takeaway:** Pointer keys use identity semantics by default; provide custom hash and equality for value semantics, and carefully manage pointer lifetimes.

---

#### Q24: How do unordered containers interact with move semantics?
**Difficulty:** #advanced
**Category:** #move_semantics #performance
**Concepts:** #move_construction #move_insertion #rvalue_references

**Answer:**
Unordered containers efficiently move elements during rehashing and support move insertion through emplace and insert with rvalue references, avoiding copies for move-only types.

**Code example:**
```cpp
std::unordered_map<int, std::unique_ptr<int>> m;

// ✅ Move insertion with emplace
m.emplace(1, std::make_unique<int>(42));

// ✅ Move insertion with insert
m.insert({2, std::make_unique<int>(43)});

// Move entire map
std::unordered_map<int, std::unique_ptr<int>> m2 = std::move(m);
// m is now empty, m2 contains all elements

// Rehashing moves elements, doesn't copy
m2.rehash(100);  // All unique_ptrs moved to new buckets
```

**Explanation:**
Unordered containers are move-aware throughout their implementation. When you insert with emplace() or insert with rvalue references, elements are move-constructed into the container, avoiding copies. During rehashing, elements are moved from old buckets to new buckets using move construction, which is critical for move-only types like unique_ptr that cannot be copied. Moving the entire container is O(1) as it just transfers bucket array ownership. This makes unordered containers efficient for large objects and move-only types. Always use emplace() or std::move() when inserting to leverage move semantics and avoid unnecessary copies.

**Key takeaway:** Unordered containers fully support move semantics for efficient handling of move-only and expensive-to-copy types throughout their operations.

---

#### Q25: What is the purpose of std::unordered_map::extract()?
**Difficulty:** #advanced
**Category:** #node_handles #modern_cpp
**Concepts:** #node_extraction #move_between_containers #c++17

**Answer:**
extract() (C++17) removes an element and returns a node handle allowing you to modify the key or move the element between containers without reallocation.

**Code example:**
```cpp
std::unordered_map<int, std::string> m1 = {{1, "one"}, {2, "two"}};
std::unordered_map<int, std::string> m2;

// ✅ Extract node from m1
auto handle = m1.extract(1);

// Modify the key (safe because extracted)
handle.key() = 10;

// Insert into m2 without reallocation
m2.insert(std::move(handle));

std::cout << m1.size() << "\n";  // 1 (element removed)
std::cout << m2.size() << "\n";  // 1 (element inserted)
std::cout << m2[10] << "\n";     // "one"
```

**Explanation:**
Node handles provide zero-overhead element transfer between containers without reallocation or destruction. When you extract a node, it's removed from the source container but the element remains alive in a node handle object. You can modify the key safely since it's no longer part of any container's structure. Inserting the node handle into another container transfers ownership without allocating new memory or moving the element. This is particularly efficient for large keys or values. Failed insertions (duplicate keys) return the node handle, allowing you to retry or discard without losing the element. This feature enables efficient splicing operations impossible before C++17.

**Key takeaway:** Use extract() for efficient element transfer between unordered containers or safe key modification without reallocation (C++17).

---

### PRACTICE_TASKS: Hash Container Challenge Questions

#### Q1
```cpp
std::unordered_map<int, int> m = {{1, 10}, {2, 20}, {3, 30}};
auto it = m.begin();
m.reserve(100);
std::cout << it->first;
```

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

#### Q3
```cpp
std::unordered_map<std::string, int> m;
m["test"] = 5;

if (m["test2"] == 0) {
    std::cout << "Not found";
}
std::cout << m.size();
```

#### Q4
```cpp
std::unordered_set<int> s = {1, 2, 3, 4, 5};
for (auto it = s.begin(); it != s.end(); ++it) {
    if (*it == 3) {
        s.erase(it);
    }
}
```

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

#### Q7
```cpp
std::unordered_set<int> s1 = {1, 2, 3};
std::unordered_set<int> s2 = s1;

s1.insert(4);
std::cout << s2.size();
```

#### Q8
```cpp
std::unordered_map<int, int> m;
for (int i = 0; i < 1000; ++i) {
    m[i] = i;
}

size_t bucket = m.bucket(500);
std::cout << m.bucket_size(bucket);
```

#### Q9
```cpp
std::unordered_multiset<int> ms = {1, 2, 2, 3, 3, 3};
std::cout << ms.count(2) << " " << ms.count(3);
```

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

#### Q11
```cpp
std::unordered_map<int, std::string> m = {{1, "a"}};
auto it = m.find(1);
m.clear();
std::cout << it->second;
```

#### Q12
```cpp
std::unordered_set<int> s;
s.reserve(100);

for (int i = 0; i < 50; ++i) {
    s.insert(i);
}

// Will any rehashing occur during insertion?
```

#### Q13
```cpp
std::unordered_map<int, int> m;
int& ref = m[5];
ref = 100;

m.clear();
std::cout << ref;
```

#### Q14
```cpp
std::unordered_map<int, int> m1 = {{1, 10}};
std::unordered_map<int, int> m2 = {{2, 20}};

m1.swap(m2);
std::cout << m1[2] << " " << m2[1];
```

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

#### Q16
```cpp
std::unordered_map<std::string, int> m;
m.try_emplace("key", 42);
m.try_emplace("key", 100);

std::cout << m["key"];
```

#### Q17
```cpp
std::unordered_set<int> s = {1, 2, 3, 4, 5};

// Print bucket distribution
for (size_t i = 0; i < s.bucket_count(); ++i) {
    std::cout << "Bucket " << i << ": " << s.bucket_size(i) << "\n";
}

// What pattern would indicate a good hash function?
```

#### Q18
```cpp
std::unordered_map<int, std::unique_ptr<int>> m;
m[1] = std::make_unique<int>(42);

auto m2 = std::move(m);
std::cout << m.size() << " " << *m2[1];
```

#### Q19
```cpp
std::unordered_set<int> s = {1, 2, 3};
size_t old_buckets = s.bucket_count();

s.rehash(100);
size_t new_buckets = s.bucket_count();

// Will new_buckets be exactly 100?
```

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

---

### QUICK_REFERENCE: Answer Key for Practice Questions

| Q# | Answer | Explanation | Key Concept |
|----|--------|-------------|-------------|
| 1 | Undefined behavior | reserve() may trigger rehash, invalidating iterator `it` | #iterator_invalidation |
| 2 | Compile error | No hash function provided for custom type Point | #custom_hash |
| 3 | 2 | operator[] creates "test2" with value 0, checking it adds entry | #operator_brackets_pitfall |
| 4 | Undefined behavior | Erasing during iteration invalidates iterator, then incrementing is UB | #iterator_invalidation |
| 5 | Likely 32 and ~0.94 | With max_load_factor 2.0 and 30 elements, needs 15+ buckets; implementation may use next power of 2 | #load_factor |
| 6 | Undefined behavior | Modifying key in unordered_map corrupts hash table structure | #key_immutability |
| 7 | 3 | Copy creates independent container; s1.insert doesn't affect s2 | #container_copy |
| 8 | Typically 0-2 | With good hash, elements distributed evenly; exact number varies | #bucket_interface |
| 9 | 2 3 | multiset allows duplicates; count returns number of occurrences | #multiset |
| 10 | O(n) | Hash function only produces 2 values (0 and 1); most elements collide into same bucket | #hash_collision |
| 11 | Undefined behavior | clear() invalidates all iterators; dereferencing `it` is UB | #iterator_invalidation |
| 12 | No | reserve(100) pre-allocates buckets for 100 elements with default load factor; 50 insertions won't trigger rehash | #reserve_optimization |
| 13 | Undefined behavior | clear() destroys element; reference `ref` is dangling | #dangling_reference |
| 14 | 20 10 | swap exchanges all contents in O(1) time | #swap_semantics |
| 15 | 0 1 | extract removes element; modifying value before re-insertion works; value changed from 1 to 10 | #node_handle |
| 16 | 42 | try_emplace doesn't overwrite existing keys; first insertion succeeds, second is no-op | #try_emplace |
| 17 | Most buckets size 0-2, evenly distributed | Good hash distributes elements uniformly; few empty buckets, few overloaded buckets | #hash_quality |
| 18 | 0 42 | Move transfers ownership; m becomes empty, m2 contains the unique_ptr | #move_semantics |
| 19 | No, at least 100 | rehash(n) is minimum bucket count; implementation may choose larger value (typically next power of 2) | #rehash_behavior |
| 20 | 10 Exception | at(1) succeeds and prints 10; at(2) throws out_of_range exception for missing key | #at_vs_brackets |

### QUICK_REFERENCE: Unordered Container Comparison Table

| Feature | std::unordered_set | std::unordered_map | std::unordered_multiset | std::unordered_multimap |
|---------|-------------------|-------------------|------------------------|------------------------|
| Stores | Unique keys only | Key-value pairs, unique keys | Allows duplicate keys | Key-value pairs, allows duplicates |
| Value Type | Key | pair<const Key, T> | Key | pair<const Key, T> |
| Lookup Complexity | O(1) average | O(1) average | O(1) average | O(1) average |
| Insert Complexity | O(1) average | O(1) average | O(1) average | O(1) average |
| Ordered Iteration | No | No | No | No |
| Duplicate Keys | No | No | Yes | Yes |
| operator[] | N/A | Yes (creates if missing) | N/A | N/A |
| count() Returns | 0 or 1 | 0 or 1 | 0 to n | 0 to n |

### QUICK_REFERENCE: Hash Container Operations Summary

| Operation | Time Complexity (Average) | Time Complexity (Worst) | Invalidates Iterators |
|-----------|--------------------------|-------------------------|----------------------|
| insert() | O(1) | O(n) | Only if rehash |
| emplace() | O(1) | O(n) | Only if rehash |
| erase(key) | O(1) | O(n) | Only erased element |
| erase(iterator) | O(1) | O(1) | Only erased element |
| find() | O(1) | O(n) | No |
| count() | O(1) | O(n) | No |
| operator[] | O(1) | O(n) | Only if rehash |
| at() | O(1) | O(n) | No |
| clear() | O(n) | O(n) | All iterators |
| rehash() | O(n) | O(n) | All iterators |
| reserve() | O(n) | O(n) | All iterators |

### QUICK_REFERENCE: Ordered vs Unordered Containers Decision Guide

| Requirement | Choose Ordered (set/map) | Choose Unordered (unordered_set/map) |
|-------------|-------------------------|-------------------------------------|
| Need sorted iteration | ✅ Yes | ❌ No |
| Need fastest average lookup | ❌ No (O(log n)) | ✅ Yes (O(1)) |
| Need range queries (lower_bound, etc.) | ✅ Yes | ❌ No |
| Need predictable worst-case | ✅ Yes (O(log n) guaranteed) | ❌ No (can degrade to O(n)) |
| Memory is tight | ✅ Yes (lower overhead) | ❌ No (bucket overhead) |
| Keys are expensive to hash | ✅ Yes (only compare) | ❌ No (must hash) |
| Need to debug/inspect structure | ✅ Yes (tree structure) | ⚠️ Complex (bucket distribution) |
| Keys have no ordering | ❌ Complex | ✅ Yes (only need hash + equality) |

### QUICK_REFERENCE: Common Hash Function Patterns

```cpp
// Pattern 1: Single member
struct SingleHash {
    size_t operator()(int x) const {
        return std::hash<int>{}(x);
    }
};

// Pattern 2: Two members - XOR with shift
struct PairHash {
    size_t operator()(const std::pair<int, int>& p) const {
        size_t h1 = std::hash<int>{}(p.first);
        size_t h2 = std::hash<int>{}(p.second);
        return h1 ^ (h2 << 1);
    }
};

// Pattern 3: Multiple members - boost::hash_combine style
struct MultiHash {
    size_t operator()(const MyType& obj) const {
        size_t seed = std::hash<int>{}(obj.x);
        seed ^= std::hash<int>{}(obj.y) + 0x9e3779b9 + (seed << 6) + (seed >> 2);
        seed ^= std::hash<int>{}(obj.z) + 0x9e3779b9 + (seed << 6) + (seed >> 2);
        return seed;
    }
};

// Pattern 4: String-based composite
struct StringCompositeHash {
    size_t operator()(const MyType& obj) const {
        return std::hash<std::string>{}(
            std::to_string(obj.x) + ":" + std::to_string(obj.y)
        );
    }
};
```

### QUICK_REFERENCE: Performance Tuning Checklist

- [ ] Called reserve(n) before bulk insertions when final size known
- [ ] Verified hash function distributes uniformly using bucket interface
- [ ] Checked that custom hash is consistent with equality operator
- [ ] Tuned max_load_factor based on memory vs speed requirements
- [ ] Avoided operator[] for existence checks (use find/count/contains)
- [ ] Used emplace() instead of insert() for complex types
- [ ] Profiled with realistic data to compare against std::map
- [ ] Considered memory overhead of bucket array in memory-constrained systems
- [ ] Used node handles (extract/insert) for element transfer between containers
- [ ] Validated iterator usage around rehashing operations
