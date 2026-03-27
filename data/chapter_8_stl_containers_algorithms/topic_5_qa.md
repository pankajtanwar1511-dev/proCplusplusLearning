## TOPIC: STL Unordered Containers - Hash-Based Associative Containers

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
