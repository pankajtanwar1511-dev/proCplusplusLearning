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
