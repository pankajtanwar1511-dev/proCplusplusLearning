### THEORY_SECTION: Core Concepts and Foundations
#### 1. Hash Table Basics

A **hash map** (hash table) stores key-value pairs using a hash function to compute array indices.

**Real-World Analogy: Library Card Catalog**

**Old Library System (Array/Vector - Linear Search):**
```
Books stored in order added:
[Book1] [Book2] [Book3] ... [Book10000]

To find "Harry Potter":
  Check Book1? No
  Check Book2? No
  ...
  Check Book7,384? YES! Found it!
  Time: O(n) - could check thousands of books
```

**Modern Library (Hash Map - Instant Lookup):**
```
Hash Function: First letter of title → Section number
  A-C → Section 0
  D-F → Section 1
  ...
  H-J → Section 7  ← "Harry Potter" goes here
  ...
  Y-Z → Section 25

To find "Harry Potter":
  1. Hash("Harry Potter") = 'H' → Section 7
  2. Go directly to Section 7
  3. Find "Harry Potter" (few books in that section)
  Time: O(1) - instant!
```

**Visual: Hash Map Structure**

```
HASH MAP:
┌─────────────────────────────────────────────┐
│  Key: "Alice"  →  hash()  →  Index: 3      │  ← Hash function converts key to index
└─────────────────────────────────────────────┘
                      ↓
     ┌──────┬──────┬──────┬──────┬──────┐
     │ [0]  │ [1]  │ [2]  │ [3]  │ [4]  │     ← Array of buckets
     └──────┴──────┴──────┴──┬───┴──────┘
                             │
                             ↓
                    {"Alice", age: 30}         ← Stored value

KEY INSIGHT:
  - Array lookup: O(1) by index
  - Hash function: Converts any key → integer index
  - Result: O(1) lookup by key!
```

**Components:**

| Component | Purpose | Example |
|-----------|---------|---------|
| **Array of buckets** | Storage for key-value pairs | `std::vector<Bucket> buckets_` |
| **Hash function** | Converts key → array index | `hash("Alice") → 3` |
| **Collision resolution** | Handles when 2 keys hash to same index | Separate chaining (linked lists) |

**Operations with Performance:**

```cpp
map.insert("Alice", 30);   // O(1) average - hash + array insert
value = map.find("Alice"); // O(1) average - hash + array lookup
map.erase("Alice");        // O(1) average - hash + array delete

// Compare to vector:
vector.find("Alice");      // O(n) - must scan all elements
```

**How Hash Function Works:**

```
STEP BY STEP:
User wants: map["Alice"] = 30

Step 1: Hash the key
  hash("Alice") = 2,087,456,123  (some large number)

Step 2: Modulo to get array index
  index = 2,087,456,123 % 10 = 3  (array has 10 buckets)

Step 3: Store at buckets[3]
  buckets[3] = {"Alice", 30}

LOOKUP:
User wants: map["Alice"]

Step 1: Hash the key
  hash("Alice") = 2,087,456,123  (same hash!)

Step 2: Modulo to get array index
  index = 2,087,456,123 % 10 = 3

Step 3: Retrieve from buckets[3]
  return buckets[3].value  // 30
```

---

#### 2. Collision Resolution: Separate Chaining

**Separate chaining:** Each bucket is a linked list.

```
Buckets:
[0] → (k1, v1) → (k5, v5)
[1] → (k2, v2)
[2] → empty
[3] → (k3, v3) → (k7, v7) → (k11, v11)
```

**Insertion:**
```cpp
index = hash(key) % bucket_count
buckets[index].push_front({key, value})
```

**Lookup:**
```cpp
index = hash(key) % bucket_count
for (entry in buckets[index]):
    if entry.key == key:
        return entry.value
```

---

#### 3. Load Factor and Rehashing

**Load factor:** α = n / m (elements / buckets)

**Optimal:** α ≈ 0.75
- Too low: wasted space
- Too high: long chains, slow lookups

**Rehashing:** When α > threshold:
1. Allocate 2× larger array
2. Reinsert all elements (rehash)
3. Deallocate old array

**Amortized O(1)** insertion.

---

#### 4. Hash Function Design

**Good hash function:**
- Uniform distribution
- Fast to compute
- Deterministic

**std::hash example:**
```cpp
std::hash<int>{}(42) → 42
std::hash<std::string>{}("hello") → large_number
```

**Custom hash:**
```cpp
struct Person {
    std::string name;
    int age;
};

template<>
struct std::hash<Person> {
    size_t operator()(const Person& p) const {
        return std::hash<std::string>{}(p.name) ^
               (std::hash<int>{}(p.age) << 1);
    }
};
```

---



```cpp
#include <vector>
#include <list>
#include <functional>
#include <stdexcept>
#include <utility>

template<typename Key, typename Value, typename Hash = std::hash<Key>>
class HashMap {
private:
    using Pair = std::pair<const Key, Value>;
    using Bucket = std::list<Pair>;

    std::vector<Bucket> buckets_;
    size_t size_;
    float max_load_factor_;
    Hash hasher_;

    size_t bucket_index(const Key& key) const {
        return hasher_(key) % buckets_.size();
    }

    void rehash(size_t new_bucket_count) {
        std::vector<Bucket> new_buckets(new_bucket_count);

        for (auto& bucket : buckets_) {
            for (auto& [key, value] : bucket) {
                size_t new_index = hasher_(key) % new_bucket_count;
                new_buckets[new_index].emplace_back(key, std::move(value));
            }
        }

        buckets_ = std::move(new_buckets);
    }

    void check_load_factor() {
        float load_factor = static_cast<float>(size_) / buckets_.size();
        if (load_factor > max_load_factor_) {
            rehash(buckets_.size() * 2);
        }
    }

public:
    HashMap(size_t initial_bucket_count = 16, float max_load = 0.75f)
        : buckets_(initial_bucket_count), size_(0), max_load_factor_(max_load) {}

    void insert(const Key& key, const Value& value) {
        size_t index = bucket_index(key);

        for (auto& [k, v] : buckets_[index]) {
            if (k == key) {
                v = value;  // Update existing
                return;
            }
        }

        buckets_[index].emplace_back(key, value);
        ++size_;
        check_load_factor();
    }

    bool find(const Key& key, Value& out_value) const {
        size_t index = bucket_index(key);

        for (const auto& [k, v] : buckets_[index]) {
            if (k == key) {
                out_value = v;
                return true;
            }
        }

        return false;
    }

    Value& operator[](const Key& key) {
        size_t index = bucket_index(key);

        for (auto& [k, v] : buckets_[index]) {
            if (k == key) {
                return v;
            }
        }

        buckets_[index].emplace_back(key, Value{});
        ++size_;
        check_load_factor();

        return buckets_[index].back().second;
    }

    bool erase(const Key& key) {
        size_t index = bucket_index(key);

        auto& bucket = buckets_[index];
        for (auto it = bucket.begin(); it != bucket.end(); ++it) {
            if (it->first == key) {
                bucket.erase(it);
                --size_;
                return true;
            }
        }

        return false;
    }

    size_t size() const { return size_; }
    bool empty() const { return size_ == 0; }

    float load_factor() const {
        return static_cast<float>(size_) / buckets_.size();
    }
};
```

---

### EDGE_CASES: Tricky Scenarios and Deep Internals
---

#### Edge Case 1: Rehashing Invalidates References
```cpp
HashMap<int, int> map;
map[1] = 10;
int& ref = map[1];  // Reference to value

map.insert(many_keys...);  // Triggers rehash
ref = 20;  // ← INVALID (dangling reference)
```

#### Edge Case 2: Custom Hash Collisions
```cpp
struct BadHash {
    size_t operator()(int x) const { return 0; }  // All collide!
};

HashMap<int, int, BadHash> map;  // O(n) operations
```

#### Edge Case 3: Key Not Found
```cpp
int value;
if (map.find(key, value)) {
    // Use value
} else {
    // Handle missing key
}
```

---

### CODE_EXAMPLES: Practical Demonstrations
---

#### Example 1: Word Frequency Counter

**This example demonstrates using a custom hash map to count word frequencies, showcasing the convenience of operator[] for automatic initialization and increment operations.**

**What this code does:**
- Creates a hash map that associates each string (word) with an integer (frequency count)
- Processes a vector of words containing duplicates
- Uses operator[] which automatically creates entries with Value{} (0 for int) for new keys
- Increments the count for each word occurrence using the convenient map[word]++ syntax
- Queries the final count for a specific word using the find() method

**Key concepts demonstrated:**
- operator[] provides map semantics similar to std::unordered_map (auto-insertion on missing keys)
- Default-constructed Value{} initializes integers to 0, making counting logic simple
- The hash map handles collision resolution transparently via separate chaining
- find() returns bool to safely distinguish between "key exists" and "key missing"
- No manual resize needed - the map automatically rehashes when load factor exceeds 0.75

**Real-world applications:**
- Text analysis and natural language processing (word frequency analysis)
- Log file analysis to count error types or user actions
- Network packet analysis to track source IP addresses or protocol types
- Game statistics tracking (counting enemy kills, item pickups, etc.)

**Why this matters:**
- Average O(1) lookup and insertion makes this efficient even for large datasets
- Automatic rehashing ensures consistent performance as the dataset grows
- operator[] simplifies counting patterns (no need to check if key exists first)
- Separate chaining gracefully handles hash collisions without complex probing logic

**Performance implications:**
- Each word lookup is O(1) average case, making the entire loop O(n) where n is number of words
- Hash function quality matters - std::hash<std::string> provides good distribution
- Short chains (load factor 0.75) keep lookup fast even with collisions
- String hashing has overhead - for extreme performance, consider integer IDs instead

```cpp
HashMap<std::string, int> word_count;

std::vector<std::string> words = {"hello", "world", "hello", "test"};

for (const auto& word : words) {
    word_count[word]++;
}

int count;
if (word_count.find("hello", count)) {
    std::cout << "hello appears " << count << " times\n";  // 2
}
```

---

### QUICK_REFERENCE: Key Takeaways and Comparison Tables
```cpp
HashMap<Key, Value> map;

map.insert(key, value);
map[key] = value;

Value val;
if (map.find(key, val)) { /* found */ }

map.erase(key);

map.size();
map.load_factor();
```
