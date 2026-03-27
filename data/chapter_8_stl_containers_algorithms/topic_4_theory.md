## TOPIC: Ordered Associative Containers (std::set and std::map)

### THEORY_SECTION: Core Concepts and Tree-Based Implementation

#### 1. Red-Black Tree Implementation - Self-Balancing Binary Search Tree Structure

**Ordered associative containers** (`std::set` and `std::map`) are typically implemented as **Red-Black trees**, a self-balancing binary search tree that guarantees **O(log N)** worst-case performance for all operations while maintaining elements in sorted order.

**Red-Black Tree Properties:**

A Red-Black tree is a binary search tree with one extra bit per node (color: red or black) that maintains the following five invariants:

| Property | Requirement | Purpose |
|----------|-------------|---------|
| **1. Node Coloring** | Every node is either red or black | Enables balancing algorithm |
| **2. Root Color** | The root is always black | Simplifies algorithms |
| **3. Leaf (NIL) Color** | All NIL leaves are black | Boundary condition |
| **4. Red Node Children** | Red nodes cannot have red children | Ensures no two reds in a row |
| **5. Black Height** | All paths from root to leaves have same # of black nodes | Guarantees balanced height |

**Visual Representation:**

```
Red-Black Tree Example:
            30(B)
           /      \
        20(R)      40(B)
       /    \      /    \
    10(B) 25(B) 35(R)  50(R)
   /  \   /  \  /  \   /  \
 NIL NIL NIL NIL NIL NIL NIL NIL

B = Black node
R = Red node
NIL = Black leaf (null)

Black height from root to any NIL: 2 (consistent)
No red node has a red child (property 4 satisfied)
```

**Set vs Map Storage Model:**

| Container | Stores | Node Structure | Key Access | Value Access |
|-----------|--------|----------------|------------|--------------|
| **std::set** | Keys only | `Node<Key>` | Direct | N/A |
| **std::map** | Key-value pairs | `Node<pair<const Key, Value>>` | `.first` (const) | `.second` (mutable) |

**Internal Node Structure (Conceptual):**

```cpp
// Simplified Red-Black tree node (actual implementations vary)
template<typename T>
struct RBTreeNode {
    T data;                  // Element (Key for set, pair<const K,V> for map)
    RBTreeNode* parent;      // Pointer to parent node
    RBTreeNode* left;        // Pointer to left child
    RBTreeNode* right;       // Pointer to right child
    bool color;              // Red (false) or Black (true)
    // Total overhead: ~32 bytes on 64-bit (3 pointers + data + color)
};

// Set node: sizeof(Key) + 32 bytes
// Map node: sizeof(Key) + sizeof(Value) + 32 bytes
```

**Memory Layout Comparison:**

| Container | Per-Element Memory | Example: 1000 ints | Overhead Percentage |
|-----------|-------------------|-------------------|---------------------|
| **std::vector<int>** | 4 bytes | ~4KB | 0% |
| **std::set<int>** | 4 + 32 = 36 bytes | ~36KB | 800% |
| **std::map<int, int>** | 8 + 32 = 40 bytes | ~40KB | 900% |
| **std::unordered_set<int>** | 4 + 16 = 20 bytes | ~20KB | 400% |

**Tree Balancing Through Rotations:**

```cpp
// Left Rotation Example (simplified):
//     x              y
//    / \            / \
//   a   y    -->   x   c
//      / \        / \
//     b   c      a   b

// Right Rotation: mirror of left rotation
// These operations maintain BST property while rebalancing
```

**Balancing Guarantees:**

| Tree Type | Max Height | Insertion Rotations | Deletion Rotations | Complexity |
|-----------|------------|---------------------|-------------------|------------|
| **Red-Black** | 2 × log₂(N+1) | ≤ 2 | ≤ 3 | O(log N) |
| **AVL** | 1.44 × log₂(N+2) | ≤ 1 | ≤ log N | O(log N) |
| **Unbalanced BST** | N (worst case) | 0 | 0 | O(N) worst |

**Why Red-Black Trees?**

| Advantage | Explanation | Benefit |
|-----------|-------------|---------|
| **Faster Insertion/Deletion** | Fewer rotations than AVL | Better for mutation-heavy workloads |
| **Guaranteed O(log N)** | Height ≤ 2 log₂(N+1) | Predictable performance |
| **Simpler Implementation** | Fewer rebalancing cases than AVL | Easier to implement correctly |
| **Good Practical Performance** | Balance between lookup and modification | STL's default choice |

**Comparison: Ordered vs Unordered Implementation:**

| Aspect | std::set/map (Red-Black) | std::unordered_set/map (Hash Table) |
|--------|-------------------------|-------------------------------------|
| **Data Structure** | Balanced BST | Hash table with buckets |
| **Search Complexity** | O(log N) guaranteed | O(1) average, O(N) worst |
| **Insertion Complexity** | O(log N) guaranteed | O(1) average, O(N) worst (rehash) |
| **Deletion Complexity** | O(log N) guaranteed | O(1) average, O(N) worst |
| **Iteration Order** | Sorted by comparator | Unspecified (bucket order) |
| **Memory Overhead** | ~32 bytes/element (pointers) | ~16-32 bytes/element (buckets + pointers) |
| **Cache Locality** | Poor (pointer chasing) | Poor (bucket indirection) |
| **Predictability** | ✅ Consistent performance | ❌ Can degrade with collisions |

---

#### 2. Key Operations and Complexity - Insert, Find, Erase, and Range Queries

Understanding the operational characteristics and algorithmic complexity of ordered containers is essential for choosing the right container and writing efficient code.

**Core Operations Complexity:**

| Operation | Set/Map Complexity | Unordered Set/Map | Notes |
|-----------|-------------------|-------------------|-------|
| **insert()** | O(log N) | O(1) avg, O(N) worst | Tree traversal + rebalance |
| **find()** | O(log N) | O(1) avg, O(N) worst | Binary search in tree |
| **erase()** | O(log N) | O(1) avg, O(N) worst | Find + remove + rebalance |
| **count()** | O(log N) | O(1) avg, O(N) worst | Same as find (returns 0 or 1) |
| **operator[]** (map) | O(log N) | O(1) avg, O(N) worst | Find or insert + default construct |
| **at()** (map) | O(log N) | O(1) avg, O(N) worst | Find + throw if missing |
| **lower_bound()** | O(log N) | ❌ N/A | First ≥ key |
| **upper_bound()** | O(log N) | ❌ N/A | First > key |
| **equal_range()** | O(log N) | ❌ N/A | [lower_bound, upper_bound) |
| **begin()** | O(1) | O(1) | Cached leftmost node |
| **end()** | O(1) | O(1) | Sentinel node |
| **Iteration** | O(N) | O(N) | In-order traversal (sorted) |

**Set Operations - Unique Keys Only:**

```cpp
std::set<int> s = {3, 1, 4, 1, 5, 9, 2, 6};

// Insertion (O(log N))
auto [it, inserted] = s.insert(7);  // Returns pair<iterator, bool>
// inserted = true if insertion occurred
// it = iterator to inserted (or existing) element

s.insert(7);  // ❌ Duplicate - silently ignored (inserted = false)

// Search (O(log N))
auto found = s.find(4);  // Returns iterator
if (found != s.end()) {
    std::cout << "Found: " << *found << "\n";  // Found: 4
}

// Count (O(log N)) - always 0 or 1 for set
if (s.count(5)) {
    std::cout << "5 is present\n";
}

// Erase (O(log N))
s.erase(3);     // By value
s.erase(found); // By iterator
```

**Map Operations - Key-Value Pairs:**

```cpp
std::map<std::string, int> ages;

// Insert (O(log N))
ages.insert({"Alice", 30});
auto [it, inserted] = ages.insert({"Bob", 25});

// operator[] - Creates if missing! (O(log N))
ages["Charlie"] = 35;  // ✅ Inserts if "Charlie" doesn't exist
ages["Alice"] = 31;    // ✅ Updates value if "Alice" exists
int age = ages["David"];  // ❌ Creates {"David", 0} - side effect!

// at() - Throws if missing (O(log N))
try {
    std::cout << ages.at("Eve") << "\n";  // ❌ Throws std::out_of_range
} catch (const std::out_of_range&) {
    std::cout << "Eve not found\n";
}

// Safe existence check (O(log N))
if (ages.find("Alice") != ages.end()) {
    std::cout << "Alice's age: " << ages["Alice"] << "\n";
}
```

**operator[] vs insert() - Critical Distinction:**

| Method | Behavior if Key Exists | Behavior if Key Missing | Return Type | Modifies Map? |
|--------|----------------------|------------------------|-------------|---------------|
| **`operator[]`** | Returns reference to existing value | Creates default-constructed value | `Value&` | ✅ Always (if missing) |
| **`insert()`** | Does nothing, returns existing iterator | Inserts key-value pair | `pair<iterator, bool>` | ✅ Only if missing |
| **`at()`** | Returns reference to existing value | Throws `std::out_of_range` | `Value&` | ❌ Never |
| **`find()`** | Returns iterator to element | Returns `end()` | `iterator` | ❌ Never |

**Range Query Operations - Unique to Ordered Containers:**

```cpp
std::set<int> s = {10, 20, 30, 40, 50, 60, 70};

// lower_bound: First element >= key (O(log N))
auto lb = s.lower_bound(35);  // Points to 40
if (lb != s.end()) {
    std::cout << "First >= 35: " << *lb << "\n";  // 40
}

// upper_bound: First element > key (O(log N))
auto ub = s.upper_bound(40);  // Points to 50
if (ub != s.end()) {
    std::cout << "First > 40: " << *ub << "\n";  // 50
}

// Range query: Elements in [25, 55)
auto start = s.lower_bound(25);  // Points to 30 (first >= 25)
auto end = s.lower_bound(55);    // Points to 60 (first >= 55)
std::cout << "Elements in [25, 55): ";
for (auto it = start; it != end; ++it) {
    std::cout << *it << " ";  // 30 40 50
}

// equal_range: Returns pair (lower_bound, upper_bound) (O(log N))
auto [first, last] = s.equal_range(40);
// For set: range contains at most 1 element
for (auto it = first; it != last; ++it) {
    std::cout << *it << "\n";  // 40
}
```

**Iterator Invalidation Rules:**

| Operation | std::set/map Invalidation | std::unordered_set/map | std::vector |
|-----------|--------------------------|------------------------|-------------|
| **insert()** | ❌ No invalidation | ✅ All (if rehash) | ✅ All (if realloc) |
| **erase(it)** | ✅ Only erased iterator | ✅ Only erased iterator | ✅ >= position |
| **clear()** | ✅ All | ✅ All | ✅ All |
| **Insertion during iteration** | ✅ Safe | ⚠️ Unsafe (rehash) | ❌ Unsafe (realloc) |

**Code Example - Safe Iteration with Erase:**

```cpp
std::set<int> s = {1, 2, 3, 4, 5};

// ❌ WRONG: Undefined behavior
for (auto it = s.begin(); it != s.end(); ++it) {
    if (*it % 2 == 0) {
        s.erase(it);  // ❌ Invalidates it, then ++it is UB
    }
}

// ✅ CORRECT: erase returns next iterator
for (auto it = s.begin(); it != s.end(); ) {
    if (*it % 2 == 0) {
        it = s.erase(it);  // ✅ erase returns iterator to next element
    } else {
        ++it;
    }
}
```

**Minimum and Maximum - O(1) Access:**

```cpp
std::set<int> s = {3, 1, 4, 1, 5, 9, 2, 6};

if (!s.empty()) {
    int min = *s.begin();    // O(1): leftmost node = 1
    int max = *s.rbegin();   // O(1): rightmost node = 9
    // Alternative: *std::prev(s.end())
}
```

---

#### 3. When to Use Ordered Containers - Comparison with Unordered and Performance Trade-offs

Choosing between ordered and unordered containers requires understanding the trade-offs between guaranteed performance, sorted iteration, and range query capabilities.

**Decision Matrix - Ordered vs Unordered:**

| Requirement | Use std::set/map | Use std::unordered_set/map | Use std::vector |
|-------------|------------------|----------------------------|-----------------|
| **Sorted iteration required** | ✅ Yes | ❌ No | Sort first |
| **Range queries needed** | ✅ Yes (lower_bound/upper_bound) | ❌ No | Binary search if sorted |
| **Predictable performance critical** | ✅ Yes (guaranteed O(log N)) | ❌ No (can degrade) | O(1) access, O(N) search |
| **Fastest average lookup** | ❌ No | ✅ Yes (O(1) average) | O(N) search |
| **Unique elements required** | ✅ Yes | ✅ Yes | Manual checking |
| **Frequent insertions/deletions** | ✅ Yes (O(log N)) | ✅ Yes (O(1) avg) | ❌ No (O(N) mid-insert) |
| **Min/Max frequently needed** | ✅ Yes (O(1)) | ❌ No (O(N)) | ❌ No (O(N)) |
| **Memory efficiency critical** | ❌ No | ❌ No | ✅ Yes |
| **Real-time systems** | ✅ Yes (predictable) | ❌ No (hash collisions) | ⚠️ Maybe |

**Performance Comparison - Real-World Benchmarks:**

```cpp
// Scenario: 1 million integer insertions + 1 million searches

// ✅ std::unordered_set: Fastest average case
std::unordered_set<int> us;
// Insert: ~100ms (O(1) average, occasional rehash)
// Search: ~50ms (O(1) average with good hash)
// Total: ~150ms

// ✅ std::set: Predictable performance
std::set<int> s;
// Insert: ~300ms (O(log N) = ~20 comparisons per insert)
// Search: ~200ms (O(log N) = ~20 comparisons per search)
// Total: ~500ms (3.3x slower BUT guaranteed)

// ❌ std::vector: Poor for this use case
std::vector<int> v;
// Insert (unsorted): ~50ms (O(1) amortized push_back)
// Search: ~500,000ms (O(N) linear search)
// Total: ~500 seconds (1000x slower for search!)

// ⚠️ std::vector (sorted with binary search):
// Insert: ~5000ms (O(N) to maintain sorted order)
// Search: ~100ms (O(log N) binary search)
// Total: ~5100ms (10x slower than set due to insertions)
```

**When to Use std::set:**

| Use Case | Why std::set is Ideal | Alternative Drawback |
|----------|------------------------|----------------------|
| **Unique sorted collection** | Automatic deduplication + sorting | Vector: manual sort, Unordered: no order |
| **Range queries** | O(log N) lower_bound/upper_bound | Unordered: impossible, Vector: must be sorted |
| **Membership testing with order** | O(log N) find + sorted iteration | Unordered: no order, Vector: O(N) search |
| **Frequent min/max access** | O(1) via begin()/rbegin() | Unordered/Vector: O(N) |
| **Priority queue alternative** | Access any element, not just top | priority_queue: top-only access |
| **Real-time systems** | Guaranteed O(log N) | Unordered: can degrade to O(N) |

**When to Use std::map:**

| Use Case | Why std::map is Ideal | Alternative Drawback |
|----------|------------------------|----------------------|
| **Sorted key-value storage** | Automatic sorting by key | Unordered_map: no order |
| **Frequency counting with order** | `map[key]++` + sorted output | Unordered_map: unsorted output |
| **Caching with predictable performance** | O(log N) guaranteed | Unordered_map: hash collisions |
| **Dictionary/symbol table** | Sorted iteration for debugging | Unordered_map: unclear iteration order |
| **Time-series data** | Range queries by timestamp | Vector: expensive inserts |
| **Configuration/settings storage** | Sorted keys for readability | Unordered_map: random order |

**Custom Comparator Patterns:**

```cpp
// Descending order
std::set<int, std::greater<int>> desc_set = {3, 1, 4, 1, 5};
// Iteration: 5, 4, 3, 1

// Custom struct comparison
struct Person {
    std::string name;
    int age;
};

struct PersonCompare {
    bool operator()(const Person& a, const Person& b) const {
        if (a.age != b.age) return a.age < b.age;  // Sort by age
        return a.name < b.name;  // Then by name
    }
};

std::set<Person, PersonCompare> people;
people.insert({"Alice", 30});
people.insert({"Bob", 25});
// Iteration: Bob (25), Alice (30)

// Case-insensitive string comparison
struct CaseInsensitiveCompare {
    bool operator()(const std::string& a, const std::string& b) const {
        return std::lexicographical_compare(
            a.begin(), a.end(), b.begin(), b.end(),
            [](char c1, char c2) { return std::tolower(c1) < std::tolower(c2); }
        );
    }
};

std::set<std::string, CaseInsensitiveCompare> ci_set;
ci_set.insert("Hello");
ci_set.insert("HELLO");  // ❌ Treated as duplicate
// Size: 1
```

**Common Pitfalls and Solutions:**

| Pitfall | Problem | Solution |
|---------|---------|----------|
| **Using `operator[]` for existence check** | Creates unwanted entries | Use `find()` or `count()` or `contains()` (C++20) |
| **Modifying key through iterator** | Compile error (key is const) | Erase and re-insert with new key |
| **Using `<=` in comparator** | Violates strict weak ordering | Use `<` only |
| **Forgetting to check `find()` result** | Dereferencing `end()` = UB | Always check `it != end()` before dereferencing |
| **Erasing during iteration without updating iterator** | Iterator invalidation UB | Use `it = erase(it)` pattern |
| **Expecting O(1) performance** | Ordered containers are O(log N) | Use unordered containers if order not needed |
| **Storing pointers without custom comparator** | Compares addresses, not values | Provide dereferencing comparator |

**Summary - Container Selection Decision Tree:**

```
Need key-value associations or unique elements?
├─ YES → Continue
└─ NO → Consider std::vector or std::array

Need sorted iteration or range queries?
├─ YES → Use std::set or std::map
│   ├─ Just unique values? → std::set
│   └─ Key-value pairs? → std::map
└─ NO → Continue

Need predictable performance (real-time)?
├─ YES → Use std::set or std::map (guaranteed O(log N))
└─ NO → Continue

Need fastest average performance?
├─ YES → Use std::unordered_set or std::unordered_map (O(1) average)
│   ├─ Just unique values? → std::unordered_set
│   └─ Key-value pairs? → std::unordered_map
└─ NO → ✅ Use std::set or std::map (good all-around choice)
```

**Best Practices Summary:**

| Practice | Reason | When to Apply |
|----------|--------|---------------|
| **Use member find(), not std::find()** | O(log N) vs O(N) | Always |
| **Prefer `insert()` over `operator[]` for first insert** | Avoid default construction overhead | When value is expensive to construct |
| **Use `at()` for read-only access** | Prevents unwanted insertion | When key should exist |
| **Check strict weak ordering in comparators** | Undefined behavior if violated | All custom comparators |
| **Use `lower_bound`/`upper_bound` for range queries** | O(log N) range search | Prefix searches, range filtering |
| **Store iterators carefully** | Only erased iterators invalidate | During complex algorithms |
| **Consider unordered containers first** | Faster average case | Unless order/ranges needed |

---

### EDGE_CASES: Tricky Scenarios and Deep Internals

#### Edge Case 1: Map operator[] vs insert() Semantics

The behavior of `std::map::operator[]` differs fundamentally from `insert()` when keys already exist. The `operator[]` always returns a reference to the value associated with the key, creating a default-constructed value if the key doesn't exist. In contrast, `insert()` only inserts if the key is absent and returns a pair indicating success.

```cpp
std::map<int, std::string> m;
m[1] = "A";  // Inserts key 1 with value "A"
auto [it, inserted] = m.insert({1, "B"});  // Does nothing, inserted = false
// m[1] is still "A", not "B"
```

This distinction is critical for understanding map behavior. Using `operator[]` when you only want to check existence or conditionally insert can lead to unwanted default construction overhead. The `insert()` method is preferable when you want to avoid modifying existing entries or need to check whether insertion actually occurred.

**Key takeaway:** `operator[]` always provides access (creating if needed), while `insert()` respects existing keys and reports insertion status.

---

#### Edge Case 2: Custom Comparator Requirements

Custom comparators for `std::set` and `std::map` must implement **strict weak ordering**, meaning they satisfy specific mathematical properties: irreflexivity (comp(x,x) is false), asymmetry (if comp(x,y) then not comp(y,x)), and transitivity (if comp(x,y) and comp(y,z) then comp(x,z)). Violating these requirements leads to undefined behavior.

```cpp
// ❌ WRONG: Not a strict weak ordering
struct BadCompare {
    bool operator()(int a, int b) const {
        return a <= b;  // Violates irreflexivity
    }
};

// ✅ CORRECT: Strict weak ordering
struct GoodCompare {
    bool operator()(int a, int b) const {
        return a < b;  // Proper strict ordering
    }
};

std::set<int, BadCompare> bad;   // Undefined behavior
std::set<int, GoodCompare> good; // Works correctly
```

The default comparator for ordered containers is `std::less<Key>`, which uses the `operator<` of the key type. When providing custom comparators, they must be consistent throughout the container's lifetime, as the tree structure depends on comparison results being stable.

**Key takeaway:** Custom comparators must implement strict weak ordering; using <= or >= operators violates this requirement and causes undefined behavior.

---

#### Edge Case 3: Iterator Invalidation Rules

Unlike sequence containers like `std::vector`, insertion and deletion in `std::set` and `std::map` follow conservative iterator invalidation rules. Inserting elements never invalidates any iterators. Erasing elements only invalidates iterators pointing to the erased elements; all other iterators remain valid.

```cpp
std::set<int> s = {1, 2, 3, 4, 5};
auto it1 = s.find(2);
auto it2 = s.find(4);

s.insert(10);  // ✅ it1 and it2 remain valid
s.erase(2);    // ✅ it2 remains valid, it1 invalidated
// Using it1 after erase is undefined behavior
// Using it2 is perfectly safe
```

This stability property makes ordered containers particularly useful in scenarios requiring stable references during modifications. You can safely maintain iterators to elements while inserting or erasing other elements, a property not available in `std::vector` or `std::deque`.

**Key takeaway:** Insertion never invalidates iterators; erasure only invalidates iterators to erased elements.

---

#### Edge Case 4: Map Default Construction with operator[]

When accessing a non-existent key via `operator[]`, `std::map` default-constructs the value type, which can have unexpected consequences for types with expensive default constructors or types that aren't default-constructible at all.

```cpp
std::map<std::string, std::string> m;
std::cout << m["nonexistent"].size();  // Creates empty string, prints 0

std::map<int, std::unique_ptr<int>> m2;
// m2[5];  // ❌ Compile error: unique_ptr not default-constructible
```

For types that aren't default-constructible, you must use `insert()` or `emplace()` instead of `operator[]`. For types with expensive default construction, consider using `find()` or `at()` when you only need read access without modification.

**Key takeaway:** `operator[]` requires value types to be default-constructible and may trigger unwanted construction overhead.

---

#### Edge Case 5: Comparator Consistency and Key Equivalence

In ordered containers, two keys are considered **equivalent** (not necessarily equal) when neither compares less than the other: `!comp(a,b) && !comp(b,a)`. This distinction matters when using custom comparators that don't match the natural equality of types.

```cpp
struct CaseInsensitiveCompare {
    bool operator()(const std::string& a, const std::string& b) const {
        return std::lexicographical_compare(
            a.begin(), a.end(), b.begin(), b.end(),
            [](char c1, char c2) { return std::tolower(c1) < std::tolower(c2); }
        );
    }
};

std::set<std::string, CaseInsensitiveCompare> s;
s.insert("Hello");
s.insert("HELLO");  // Treated as duplicate, not inserted
// Set size is 1, not 2
```

This behavior is correct and intentional: the container treats "Hello" and "HELLO" as equivalent based on the comparator, even though they're not equal strings. Understanding this equivalence vs equality distinction is crucial when designing custom comparators.

**Key takeaway:** Ordered containers use comparator-based equivalence, not equality; two keys are equivalent when neither compares less than the other.

---

### CODE_EXAMPLES: Practical Demonstrations

#### Example 1: Basic std::set Operations

```cpp
#include <iostream>
#include <set>

int main() {
    std::set<int> s = {3, 1, 4, 1, 5, 9};  // Duplicates ignored
    
    s.insert(2);         // Insert single element
    s.insert({6, 5, 3}); // Insert multiple (duplicates ignored)
    
    // Ordered iteration
    for (int x : s) {
        std::cout << x << " ";  // Prints: 1 2 3 4 5 6 9
    }
    std::cout << "\n";
    
    // Membership test
    if (s.find(4) != s.end()) {
        std::cout << "4 is present\n";
    }
    
    // Erase by value
    s.erase(3);  // Removes element 3
    
    // Count occurrences (always 0 or 1 for set)
    std::cout << "Count of 5: " << s.count(5) << "\n";  // Prints: 1
}
```

This example demonstrates fundamental `std::set` operations including insertion, ordered iteration, membership testing, and element removal. Sets automatically maintain sorted order and reject duplicates, making them ideal for maintaining unique, ordered collections.

---

#### Example 2: Basic std::map Operations

```cpp
#include <iostream>
#include <map>
#include <string>

int main() {
    std::map<std::string, int> ages;
    
    // Insert using operator[]
    ages["Alice"] = 30;
    ages["Bob"] = 25;
    
    // Insert using insert()
    auto [it, inserted] = ages.insert({"Charlie", 35});
    if (inserted) {
        std::cout << "Charlie inserted\n";
    }
    
    // Attempt to insert existing key
    auto [it2, inserted2] = ages.insert({"Alice", 40});
    // inserted2 is false, ages["Alice"] is still 30
    
    // Access with operator[] (creates if missing)
    int age = ages["David"];  // Creates entry with value 0
    
    // Safe access with at() (throws if missing)
    try {
        std::cout << "Eve's age: " << ages.at("Eve") << "\n";
    } catch (const std::out_of_range& e) {
        std::cout << "Eve not found\n";
    }
    
    // Iteration (sorted by key)
    for (const auto& [name, age] : ages) {
        std::cout << name << ": " << age << "\n";
    }
}
```

This example illustrates the key differences between `operator[]`, `insert()`, and `at()` for map access. Understanding when each method is appropriate prevents bugs related to unintended default construction and exceptions.

---

#### Example 3: Custom Comparator for Descending Order

```cpp
#include <iostream>
#include <set>
#include <map>
#include <functional>

int main() {
    // Set with descending order
    std::set<int, std::greater<int>> s = {3, 1, 4, 1, 5};
    for (int x : s) {
        std::cout << x << " ";  // Prints: 5 4 3 1
    }
    std::cout << "\n";
    
    // Map with descending key order
    std::map<int, std::string, std::greater<int>> m;
    m[1] = "one";
    m[5] = "five";
    m[3] = "three";
    
    for (const auto& [k, v] : m) {
        std::cout << k << ": " << v << "\n";
        // Prints: 5: five, 3: three, 1: one
    }
}
```

Custom comparators enable sorting containers in non-default orders. The `std::greater<T>` functor provides descending order, while custom lambda comparators or function objects enable complex sorting criteria.

---

#### Example 4: Range Queries with lower_bound and upper_bound

```cpp
#include <iostream>
#include <set>

int main() {
    std::set<int> s = {10, 20, 30, 40, 50, 60};
    
    // lower_bound: first element >= value
    auto lb = s.lower_bound(35);
    if (lb != s.end()) {
        std::cout << "First >= 35: " << *lb << "\n";  // Prints: 40
    }
    
    // upper_bound: first element > value
    auto ub = s.upper_bound(40);
    if (ub != s.end()) {
        std::cout << "First > 40: " << *ub << "\n";  // Prints: 50
    }
    
    // Range query: elements in [25, 45)
    auto start = s.lower_bound(25);  // First >= 25 (30)
    auto end = s.lower_bound(45);    // First >= 45 (50)
    
    std::cout << "Elements in [25, 45): ";
    for (auto it = start; it != end; ++it) {
        std::cout << *it << " ";  // Prints: 30 40
    }
    std::cout << "\n";
    
    // equal_range: returns pair of (lower_bound, upper_bound)
    auto [first, last] = s.equal_range(30);
    std::cout << "Range for 30: ";
    for (auto it = first; it != last; ++it) {
        std::cout << *it << " ";  // Prints: 30
    }
}
```

Range query operations are unique to ordered containers and leverage the underlying tree structure for efficient searches. These operations are impossible with hash-based containers and are key advantages of ordered containers.

---

#### Example 5: Custom Comparator with Structs

```cpp
#include <iostream>
#include <set>
#include <string>

struct Person {
    std::string name;
    int age;
};

// Comparator: sort by age, then by name
struct PersonCompare {
    bool operator()(const Person& a, const Person& b) const {
        if (a.age != b.age) return a.age < b.age;
        return a.name < b.name;
    }
};

int main() {
    std::set<Person, PersonCompare> people;
    
    people.insert({"Alice", 30});
    people.insert({"Bob", 25});
    people.insert({"Charlie", 30});
    people.insert({"David", 25});
    
    // Sorted by age first, then name
    for (const auto& p : people) {
        std::cout << p.name << " (" << p.age << ")\n";
    }
    // Prints:
    // Bob (25)
    // David (25)
    // Alice (30)
    // Charlie (30)
}
```

Custom comparators enable complex multi-field sorting criteria for user-defined types. The comparator must implement strict weak ordering to maintain tree consistency.

---

#### Example 6: Map Frequency Counter Pattern

```cpp
#include <iostream>
#include <map>
#include <vector>
#include <string>

int main() {
    std::vector<std::string> words = {
        "apple", "banana", "apple", "cherry", "banana", "apple"
    };
    
    std::map<std::string, int> frequency;
    
    // Count occurrences (operator[] auto-creates with 0)
    for (const auto& word : words) {
        frequency[word]++;  // Safe: creates entry if missing
    }
    
    // Sorted output by key
    for (const auto& [word, count] : frequency) {
        std::cout << word << ": " << count << "\n";
    }
    // Prints:
    // apple: 3
    // banana: 2
    // cherry: 1
}
```

This idiom leverages `operator[]`'s default construction behavior for elegant frequency counting. The automatic sorting by key provides ordered output without explicit sorting.

---

#### Example 7: Checking Key Existence Without Insertion

```cpp
#include <iostream>
#include <map>
#include <string>

int main() {
    std::map<std::string, int> scores;
    scores["Alice"] = 90;
    scores["Bob"] = 85;
    
    // ❌ WRONG: operator[] creates entry
    if (scores["Charlie"] > 0) {  // Creates Charlie with value 0!
        std::cout << "Charlie has score\n";
    }
    // scores.size() is now 3, not 2
    
    // ✅ CORRECT: Use find() to check existence
    if (scores.find("David") != scores.end()) {
        std::cout << "David has score\n";
    }
    // scores.size() is still 3
    
    // ✅ CORRECT: Use count() for membership test
    if (scores.count("Alice") > 0) {
        std::cout << "Alice has score: " << scores["Alice"] << "\n";
    }
    
    // ✅ CORRECT: Use contains() in C++20
    // if (scores.contains("Bob")) {
    //     std::cout << "Bob has score\n";
    // }
}
```

Understanding the difference between `find()`, `count()`, and `operator[]` is crucial for avoiding unintended insertions and performance overhead. Always use non-mutating methods when checking existence.

---

#### Example 8: Iterator Stability During Modification

```cpp
#include <iostream>
#include <set>

int main() {
    std::set<int> s = {1, 2, 3, 4, 5};
    
    auto it2 = s.find(2);
    auto it4 = s.find(4);
    
    // Insertion doesn't invalidate iterators
    s.insert(10);
    std::cout << *it2 << " " << *it4 << "\n";  // ✅ Safe: prints "2 4"
    
    // Erase only invalidates erased element's iterator
    s.erase(2);
    // std::cout << *it2;  // ❌ Undefined behavior
    std::cout << *it4 << "\n";  // ✅ Safe: prints "4"
    
    // Safe erase pattern: erase returns next iterator
    auto it = s.find(3);
    if (it != s.end()) {
        it = s.erase(it);  // it now points to next element (4)
        if (it != s.end()) {
            std::cout << "Next element: " << *it << "\n";  // Prints: 4
        }
    }
}
```

The stable iterator property of ordered containers enables safe iteration with concurrent modification patterns that would be dangerous in sequence containers like vector.

---

### QUICK_REFERENCE: Answer Key and Summary Tables

#### Answer Key for Practice Questions

| Q# | Answer | Explanation | Key Concept |
|----|--------|-------------|-------------|
| 1 | Undefined behavior | Dereferencing invalidated iterator after erase | #iterator_invalidation |
| 2 | `5 3 1` | std::greater sorts in descending order | #custom_comparator |
| 3 | `0` then `1` | operator[] creates default entry (0), size becomes 1 | #default_construction |
| 4 | `2 0` | Insert fails for duplicate, returns iterator to existing, inserted=false | #insert_behavior |
| 5 | `A 0` | insert() doesn't overwrite existing keys, inserted=false | #insert_semantics |
| 6 | `30 50` | lower_bound(25) finds first ≥25 (30), upper_bound(40) finds first >40 (50) | #range_queries |
| 7 | No, compile error | Point has no operator< and no custom comparator provided | #custom_comparator |
| 8 | Compile error | Cannot modify key (k is const), can modify value | #const_correctness |
| 9 | `2` | Compares pointer addresses, not values; different pointers mean different elements | #pointer_comparison |
| 10 | `caught0` | at() throws out_of_range, size remains 0 (no insertion) | #exception_safety |
| 11 | `1 3`, both valid | Insert doesn't invalidate any iterators in ordered containers | #iterator_stability |
| 12 | `2` | Erasing begin() removes first element, new begin() is second element | #erasure |
| 13 | `5 1 9` | Size is 5 (duplicates removed), min is 1, max is 9 | #sorted_unique |
| 14 | `20` | operator[] overwrites, insert() does nothing for existing keys | #assignment_vs_insert |
| 15 | `not found` | find(25) returns end() as 25 doesn't exist | #find_behavior |
| 16 | `4` | Modifying value through operator[] works correctly | #value_mutability |
| 17 | Undefined behavior | Erasing invalidates iterator being incremented | #erase_during_iteration |
| 18 | Undefined behavior | Comparator violates strict weak ordering (uses <=) | #strict_weak_ordering |
| 19 | `20` | equal_range returns [lower_bound, upper_bound); for map, range contains at most 1 element | #equal_range |
| 20 | `equal` | Sets support equality comparison; equal elements mean equal sets | #set_equality |

---

#### Complexity Reference Table

| Operation | std::set | std::map | Notes |
|-----------|----------|----------|-------|
| **Insert** | O(log N) | O(log N) | May trigger rebalancing |
| **Erase** | O(log N) | O(log N) | May trigger rebalancing |
| **Find** | O(log N) | O(log N) | Binary search in tree |
| **Count** | O(log N) | O(log N) | Tree search, returns 0 or 1 |
| **lower_bound** | O(log N) | O(log N) | First element ≥ key |
| **upper_bound** | O(log N) | O(log N) | First element > key |
| **equal_range** | O(log N) | O(log N) | Returns [lower_bound, upper_bound) |
| **Min/Max** | O(1) | O(1) | *begin() / *rbegin() |
| **Iteration** | O(N) | O(N) | In-order traversal, sorted |
| **operator[]** | N/A | O(log N) | Creates if missing (map only) |
| **at()** | N/A | O(log N) | Throws if missing (map only) |

---

#### Ordered vs Unordered Containers Comparison

| Feature | std::set/map | std::unordered_set/map |
|---------|-------------|------------------------|
| **Implementation** | Red-Black Tree | Hash Table |
| **Ordering** | Sorted by comparator | Unordered |
| **Search** | O(log N) guaranteed | O(1) average, O(N) worst |
| **Insert** | O(log N) guaranteed | O(1) average, O(N) worst |
| **Delete** | O(log N) guaranteed | O(1) average, O(N) worst |
| **Iteration Order** | Sorted (ascending/descending) | Unspecified |
| **Range Queries** | Efficient (lower_bound/upper_bound) | Not supported |
| **Memory Overhead** | ~24 bytes per element (pointers) | ~32+ bytes (buckets + pointers) |
| **Cache Locality** | Poor (pointer chasing) | Poor (bucket indirection) |
| **Iterator Invalidation** | Stable (except erased) | Rehash invalidates all |
| **Requires** | Comparator (strict weak ordering) | Hash function + equality |
| **Use When** | Sorted access, range queries, predictable performance | Fastest average lookup, order doesn't matter |

---

#### Set vs Map Comparison

| Feature | std::set | std::map |
|---------|----------|----------|
| **Stores** | Keys only | Key-value pairs |
| **Element Type** | `T` | `std::pair<const K, V>` |
| **operator[]** | Not available | Available (creates if missing) |
| **at()** | Not available | Available (throws if missing) |
| **Use Case** | Unique sorted collection | Key-value associations |
| **Access Pattern** | Membership testing | Value lookup by key |
| **Memory per Element** | `sizeof(T) + ~24 bytes` | `sizeof(K) + sizeof(V) + ~24 bytes` |

---

#### Iterator Invalidation Quick Reference

| Container | Insert | Erase | Note |
|-----------|--------|-------|------|
| **std::set** | None | Erased element only | Insertion stable |
| **std::map** | None | Erased element only | Insertion stable |
| **std::vector** | All (if realloc) / After insert pos | At and after erase pos | Reallocation destroys all |
| **std::list** | None | Erased element only | Most stable |
| **std::unordered_set** | All (if rehash) / None | Erased element only | Rehash invalidates |
| **std::unordered_map** | All (if rehash) / None | Erased element only | Rehash invalidates |

---

#### Common Patterns and Idioms

| Pattern | std::set Example | std::map Example | Use Case |
|---------|------------------|------------------|----------|
| **Existence Check** | `s.find(x) != s.end()` | `m.find(k) != m.end()` or `m.count(k)` | Avoid unwanted insertion |
| **Safe Access** | `s.count(x)` | `m.at(k)` with try-catch | Prevent default construction |
| **Frequency Counter** | N/A | `m[key]++` | Leverage default construction |
| **Min/Max** | `*s.begin()` / `*s.rbegin()` | `m.begin()->first` / `m.rbegin()->first` | O(1) sorted access |
| **Range Query** | `s.lower_bound(a)` to `s.upper_bound(b)` | `m.lower_bound(a)` to `m.upper_bound(b)` | Efficient range iteration |
| **Conditional Insert** | `s.insert(x).second` | `m.insert({k, v}).second` | Check if actually inserted |
| **Safe Erase in Loop** | `it = s.erase(it)` | `it = m.erase(it)` | Avoid iterator invalidation |

---

#### Comparator Requirements

| Requirement | Meaning | Example Violation | Result |
|-------------|---------|-------------------|--------|
| **Irreflexivity** | `comp(x, x)` is false | Using `<=` instead of `<` | Infinite loops |
| **Asymmetry** | If `comp(x, y)` then not `comp(y, x)` | Non-transitive comparison | Inconsistent ordering |
| **Transitivity** | If `comp(x,y)` and `comp(y,z)` then `comp(x,z)` | Random comparisons | Broken tree invariants |
| **Equivalence Transitivity** | If `x~y` and `y~z` then `x~z` (where `~` means equivalent) | Partial orderings | Undefined find() behavior |

**Note:** `x` and `y` are equivalent when `!comp(x,y) && !comp(y,x)`

---

#### Memory Overhead Estimates (64-bit systems)

| Container | Per-Element Overhead | Control Overhead | Example: 1000 ints |
|-----------|---------------------|------------------|-------------------|
| **std::vector** | 0 bytes | 24 bytes (size, capacity, pointer) | ~4KB |
| **std::set** | 24-32 bytes (pointers + color) | 16 bytes | ~28KB |
| **std::map** | 24-32 bytes + sizeof(Value) | 16 bytes | ~32KB+ |
| **std::unordered_set** | 8-16 bytes (bucket link) | 32+ bytes (bucket array) | ~20KB+ |
| **Raw array** | 0 bytes | 0 bytes | ~4KB |

---

#### When to Use std::set vs std::map

| Requirement | Use std::set | Use std::map |
|-------------|--------------|--------------|
| Need sorted unique values | ✅ | ❌ |
| Need key-value associations | ❌ | ✅ |
| Only care about membership | ✅ | ❌ |
| Need to associate data with keys | ❌ | ✅ |
| Frequency counting | ❌ | ✅ |
| Removing duplicates | ✅ | ❌ |
| Caching/memoization | ❌ | ✅ |
| Graph node storage | ✅ | ❌ (unless storing properties) |
