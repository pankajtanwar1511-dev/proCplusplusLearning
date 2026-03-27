## TOPIC: Custom HashMap Implementation - Hash Table Internals

### PRACTICE_TASKS: Output Prediction and Code Analysis

#### Q1
```cpp
template<typename K, typename V>
class HashMap {
    std::vector<std::list<std::pair<K, V>>> buckets_;
    size_t size_;

public:
    HashMap() : buckets_(0), size_(0) {}  // Bug: zero buckets!

    void insert(const K& key, const V& value) {
        size_t index = std::hash<K>{}(key) % buckets_.size();  // Bug: division by zero!
        buckets_[index].push_back({key, value});
        size_++;
    }
};

int main() {
    HashMap<int, std::string> map;
    map.insert(1, "one");  // Bug: what happens?
}
```

**Answer:**
```
Division by zero error (undefined behavior, likely crash)
```

**Explanation:**
- Constructor initializes `buckets_` with size 0
- `insert()` computes `hash % buckets_.size()` → `hash % 0` → division by zero
- Undefined behavior, likely crash or floating point exception
- Even if modulo succeeded, accessing `buckets_[index]` on empty vector → out of bounds
- Must initialize with non-zero bucket count (common default: 16 or 32)
- **Key Concept:** Hash tables require initial bucket allocation; zero-sized bucket array causes division by zero in hash function modulo operation

**Fixed Version:**
```cpp
HashMap() : buckets_(16), size_(0) {}  // Start with 16 buckets

// Or allow custom initial capacity
HashMap(size_t initial_capacity = 16)
    : buckets_(initial_capacity), size_(0) {}
```

---

#### Q2
```cpp
template<typename K, typename V>
class HashMap {
    std::vector<std::list<std::pair<K, V>>> buckets_;

public:
    void insert(const K& key, const V& value) {
        size_t index = std::hash<K>{}(key) % buckets_.size();
        buckets_[index].push_back({key, value});

        if (load_factor() > 0.75) {
            rehash(buckets_.size() * 2);  // Bug: rehashing while iterators exist!
        }
    }

    auto begin() {
        for (auto& bucket : buckets_) {
            if (!bucket.empty()) {
                return bucket.begin();
            }
        }
        return buckets_.back().end();
    }
};

int main() {
    HashMap<int, std::string> map;
    for (int i = 0; i < 100; i++) {
        map.insert(i, "value");
    }

    auto it = map.begin();
    map.insert(200, "new");  // Bug: triggers rehash while iterator exists!
    std::cout << it->first;  // Bug: iterator invalidated!
}
```

**Answer:**
```
Undefined behavior (iterator invalidation, likely crash or garbage)
```

**Explanation:**
- `it` points to element in original bucket vector
- `insert(200, "new")` triggers rehash → creates new bucket vector
- Rehash moves all elements to new buckets, old buckets destroyed
- `it` now dangles (points to freed memory)
- Dereferencing `it` → undefined behavior
- Hash map insertion can invalidate iterators when rehashing occurs
- **Key Concept:** HashMap rehashing invalidates all iterators, pointers, and references; similar to std::vector reallocation; users must not hold iterators across operations that might rehash

**Fixed Version:**
```cpp
// Option 1: Reserve capacity upfront
HashMap<int, std::string> map(128);  // Prevent rehash
for (int i = 0; i < 100; i++) {
    map.insert(i, "value");
}

// Option 2: Don't hold iterators across insertions
for (int i = 0; i < 100; i++) {
    map.insert(i, "value");
}
auto it = map.begin();  // Get iterator AFTER insertions
```

---

#### Q3
```cpp
template<typename K, typename V>
class HashMap {
    std::vector<std::list<std::pair<K, V>>> buckets_;

public:
    V& operator[](const K& key) {
        size_t index = std::hash<K>{}(key) % buckets_.size();

        for (auto& [k, v] : buckets_[index]) {
            if (k == key) {
                return v;  // Bug: returns reference to list element!
            }
        }

        // Key not found, insert default
        buckets_[index].push_back({key, V{}});
        return buckets_[index].back().second;  // Bug: reference invalidated by rehash!
    }
};

int main() {
    HashMap<int, std::string> map;

    std::string& ref = map[1];  // Creates entry, returns reference
    ref = "hello";

    // More insertions trigger rehash
    for (int i = 0; i < 1000; i++) {
        map[i] = "data";  // Bug: rehash invalidates ref!
    }

    std::cout << ref;  // Bug: dangling reference!
}
```

**Answer:**
```
Undefined behavior (dangling reference after rehash, likely crash or garbage)
```

**Explanation:**
- `map[1]` inserts new entry, returns reference to value in list node
- `ref` holds reference to value inside `std::list<pair<K,V>>`
- Insertions trigger rehash → creates new bucket vector
- Rehash moves/copies elements to new buckets → old list nodes destroyed
- `ref` dangles (points to destroyed node in old list)
- Reading `ref` → undefined behavior
- **Key Concept:** Returning references from operator[] dangerous in hash maps with rehashing; references invalidated when rehash occurs; consider copy-on-access or no-rehash guarantees

**Fixed Version:**
```cpp
// Option 1: Use find() to avoid holding references
auto it = map.find(1);
if (it != map.end()) {
    it->second = "hello";
}

// Option 2: Reserve capacity to prevent rehash
map.reserve(2000);
std::string& ref = map[1];  // Safe if no rehash
ref = "hello";
```

---

#### Q4
```cpp
template<typename K, typename V>
class HashMap {
    std::vector<std::list<std::pair<K, V>>> buckets_;
    size_t size_;

public:
    bool erase(const K& key) {
        size_t index = std::hash<K>{}(key) % buckets_.size();

        auto& bucket = buckets_[index];
        for (auto it = bucket.begin(); it != bucket.end(); ++it) {
            if (it->first == key) {
                bucket.erase(it);
                size_--;
                return true;  // Bug: doesn't shrink bucket vector!
            }
        }
        return false;
    }
};

int main() {
    HashMap<int, std::string> map;

    // Insert many elements
    for (int i = 0; i < 10000; i++) {
        map.insert(i, "value");
    }
    // Triggers rehash, buckets_ grows to large size

    // Erase most elements
    for (int i = 0; i < 9999; i++) {
        map.erase(i);
    }

    // Only 1 element remains, but buckets_ still huge!
    std::cout << map.memory_usage();  // Bug: wastes memory!
}
```

**Answer:**
```
Memory waste (bucket vector remains oversized after many erasures)
```

**Explanation:**
- Insertions grow bucket vector (e.g., 10000 elements → 16384 buckets)
- Erasures decrement `size_` but don't shrink `buckets_` vector
- After 9999 erasures, only 1 element but 16384 buckets still allocated
- Wastes memory proportional to peak size, not current size
- Similar to `std::vector` capacity not shrinking on erase
- Need explicit shrink operation or automatic shrinking policy
- **Key Concept:** Hash maps don't automatically shrink bucket array on erasures; memory usage proportional to peak size unless explicitly shrunk; implement shrink_to_fit() or auto-shrink at low load factors

**Fixed Version:**
```cpp
void shrink_to_fit() {
    size_t new_capacity = std::max(size_t(16), size_ * 2);
    if (new_capacity < buckets_.size() / 2) {
        rehash(new_capacity);
    }
}

bool erase(const K& key) {
    size_t index = std::hash<K>{}(key) % buckets_.size();

    auto& bucket = buckets_[index];
    for (auto it = bucket.begin(); it != bucket.end(); ++it) {
        if (it->first == key) {
            bucket.erase(it);
            size_--;

            // Auto-shrink if load factor too low
            if (size_ > 0 && load_factor() < 0.25) {
                shrink_to_fit();
            }

            return true;
        }
    }
    return false;
}
```

---

#### Q5
```cpp
template<typename K, typename V>
class HashMap {
    std::vector<std::list<std::pair<K, V>>> buckets_;

public:
    void insert(const K& key, const V& value) {
        size_t index = std::hash<K>{}(key) % buckets_.size();

        // Bug: doesn't check for duplicate keys!
        buckets_[index].push_back({key, value});
        size_++;
    }
};

int main() {
    HashMap<int, std::string> map;

    map.insert(1, "one");
    map.insert(1, "uno");  // Bug: duplicate key!
    map.insert(1, "eins");

    std::cout << map.size();  // What size?

    // Later lookup
    auto val = map.find(1);  // Which value returned?
}
```

**Answer:**
```
Size: 3 (wrong - should be 1)
Lookup: Returns first inserted value "one" (or implementation-defined)
```

**Explanation:**
- `insert()` doesn't check if key already exists
- Three insertions with key=1 → three separate entries in bucket
- `size_` becomes 3 (incorrect, should be 1 for unique keys)
- Bucket list contains: `[(1,"one"), (1,"uno"), (1,"eins")]`
- `find()` returns first match → "one"
- Violates hash map invariant: unique keys
- Wasted memory and incorrect semantics
- **Key Concept:** Hash map insert must check for duplicate keys before adding; either update existing value or return false; allowing duplicates violates map semantics and wastes memory

**Fixed Version:**
```cpp
bool insert(const K& key, const V& value) {
    size_t index = std::hash<K>{}(key) % buckets_.size();

    auto& bucket = buckets_[index];

    // Check for existing key
    for (auto& [k, v] : bucket) {
        if (k == key) {
            return false;  // Key exists, don't insert
        }
    }

    bucket.push_back({key, value});
    size_++;
    return true;
}

// Or insert_or_assign for update semantics
void insert_or_assign(const K& key, const V& value) {
    size_t index = std::hash<K>{}(key) % buckets_.size();

    auto& bucket = buckets_[index];

    for (auto& [k, v] : bucket) {
        if (k == key) {
            v = value;  // Update existing
            return;
        }
    }

    bucket.push_back({key, value});  // Insert new
    size_++;
}
```

---

#### Q6
```cpp
template<typename K, typename V>
class HashMap {
    std::vector<std::list<std::pair<K, V>>> buckets_;

public:
    void rehash(size_t new_bucket_count) {
        std::vector<std::list<std::pair<K, V>>> new_buckets(new_bucket_count);

        for (auto& bucket : buckets_) {
            for (auto& [key, value] : bucket) {
                size_t index = std::hash<K>{}(key) % new_bucket_count;
                new_buckets[index].push_back({key, value});  // Bug: copies instead of moves!
            }
        }

        buckets_ = std::move(new_buckets);
    }
};

int main() {
    HashMap<int, std::string> map;

    for (int i = 0; i < 1000; i++) {
        map.insert(i, std::string(10000, 'x'));  // Large strings
    }

    map.rehash(2048);  // Bug: copies 1000 large strings!
}
```

**Answer:**
```
Performance issue (copies large strings instead of moving, ~10MB copied)
```

**Explanation:**
- Structured binding `[key, value]` creates lvalue references
- `push_back({key, value})` copies both key and value
- Each string (10000 chars) copied → ~10MB total copied
- Should use `std::move` to transfer ownership
- Large performance penalty for move-constructible types (strings, vectors, etc.)
- **Key Concept:** Rehashing should move elements, not copy; structured bindings create lvalue references preventing automatic move; explicitly move values during rehash

**Fixed Version:**
```cpp
void rehash(size_t new_bucket_count) {
    std::vector<std::list<std::pair<K, V>>> new_buckets(new_bucket_count);

    for (auto& bucket : buckets_) {
        for (auto& [key, value] : bucket) {
            size_t index = std::hash<K>{}(key) % new_bucket_count;
            new_buckets[index].push_back({key, std::move(value)});  // Move value
        }
    }

    buckets_ = std::move(new_buckets);
}

// Or use emplace_back
new_buckets[index].emplace_back(key, std::move(value));
```

---

#### Q7
```cpp
template<typename K, typename V>
class HashMap {
    std::vector<std::list<std::pair<K, V>>> buckets_;
    size_t size_;

public:
    float load_factor() const {
        return size_ / buckets_.size();  // Bug: integer division!
    }
};

int main() {
    HashMap<int, std::string> map(10);

    for (int i = 0; i < 7; i++) {
        map.insert(i, "value");
    }

    std::cout << map.load_factor();  // Expected: 0.7, Actual: ?

    if (map.load_factor() > 0.75) {
        std::cout << "Should rehash";
    } else {
        std::cout << "No rehash needed";  // Bug: wrong branch taken!
    }
}
```

**Answer:**
```
Output: 0 (integer division: 7/10 = 0)
Branch: "No rehash needed" (wrong - should rehash at load factor 0.7)
```

**Explanation:**
- `size_` is `size_t` (integer), `buckets_.size()` is `size_t`
- `7 / 10` → integer division → 0
- Return type `float` doesn't change the division type
- Load factor always 0 or 1 (never fractional values like 0.7)
- Rehashing logic broken (never triggers or always triggers)
- Must cast to `float` before division
- **Key Concept:** Integer division truncates fractional part; load_factor() must cast to float before division to get accurate fractional result

**Fixed Version:**
```cpp
float load_factor() const {
    return static_cast<float>(size_) / buckets_.size();  // Cast to float
}

// Or use double
double load_factor() const {
    return static_cast<double>(size_) / buckets_.size();
}
```

---

#### Q8
```cpp
template<typename K, typename V>
class HashMap {
    std::vector<std::list<std::pair<K, V>>> buckets_;

public:
    V& at(const K& key) {
        size_t index = std::hash<K>{}(key) % buckets_.size();

        for (auto& [k, v] : buckets_[index]) {
            if (k == key) {
                return v;
            }
        }

        // Bug: no exception thrown!
        return ???;  // What to return when key not found?
    }
};

int main() {
    HashMap<int, std::string> map;
    map.insert(1, "one");

    try {
        std::string& val = map.at(99);  // Key doesn't exist
        std::cout << val;
    } catch (const std::out_of_range& e) {
        std::cout << "Key not found";  // Expected behavior
    }
}
```

**Answer:**
```
Compilation error (no return statement in non-void function)
```

**Explanation:**
- `at()` promises to return `V&` but has no return for key-not-found case
- Compiler error: control reaches end of non-void function
- Unlike `operator[]`, `at()` should throw exception when key missing
- Can't return default value (no default-constructed reference)
- Can't return `nullptr` (reference can't be null)
- Must throw `std::out_of_range` exception
- **Key Concept:** Hash map at() must throw std::out_of_range when key not found; can't return default since returning reference; throwing exception is only valid option

**Fixed Version:**
```cpp
V& at(const K& key) {
    size_t index = std::hash<K>{}(key) % buckets_.size();

    for (auto& [k, v] : buckets_[index]) {
        if (k == key) {
            return v;
        }
    }

    throw std::out_of_range("Key not found");
}

const V& at(const K& key) const {
    size_t index = std::hash<K>{}(key) % buckets_.size();

    for (const auto& [k, v] : buckets_[index]) {
        if (k == key) {
            return v;
        }
    }

    throw std::out_of_range("Key not found");
}
```

---

#### Q9
```cpp
#include <functional>

struct Point {
    int x, y;

    bool operator==(const Point& other) const {
        return x == other.x && y == other.y;
    }

    // Bug: no hash function defined!
};

int main() {
    HashMap<Point, std::string> map;  // Bug: Point not hashable!

    map.insert({1, 2}, "point");
}
```

**Answer:**
```
Compilation error (no specialization of std::hash<Point>)
```

**Explanation:**
- HashMap uses `std::hash<K>{}(key)` to hash keys
- `std::hash` not specialized for custom type `Point`
- Compiler error: no matching function for `std::hash<Point>`
- Need to specialize `std::hash` for custom types
- Or provide custom hash function to HashMap
- Only standard types (int, string, etc.) have default hash specializations
- **Key Concept:** Custom types must specialize std::hash or provide custom hash functor to be usable as hash map keys; equality operator alone insufficient

**Fixed Version:**
```cpp
// Option 1: Specialize std::hash
namespace std {
    template<>
    struct hash<Point> {
        size_t operator()(const Point& p) const {
            size_t h1 = std::hash<int>{}(p.x);
            size_t h2 = std::hash<int>{}(p.y);
            return h1 ^ (h2 << 1);  // Combine hashes
        }
    };
}

// Option 2: Provide hash functor
struct PointHash {
    size_t operator()(const Point& p) const {
        return std::hash<int>{}(p.x) ^ (std::hash<int>{}(p.y) << 1);
    }
};

template<typename K, typename V, typename Hash = std::hash<K>>
class HashMap {
    // Use custom hash function
};

HashMap<Point, std::string, PointHash> map;
```

---

#### Q10
```cpp
template<typename K, typename V>
class HashMap {
    std::vector<std::list<std::pair<K, V>>> buckets_;
    size_t size_;

public:
    HashMap(const HashMap& other)
        : buckets_(other.buckets_), size_(other.size_) {
        // Bug: shallow copy of buckets!
    }
};

int main() {
    HashMap<int, std::unique_ptr<int>> map;
    map.insert(1, std::make_unique<int>(42));

    HashMap<int, std::unique_ptr<int>> map2 = map;  // Bug: copies unique_ptr!
}
```

**Answer:**
```
Compilation error (unique_ptr is not copyable)
```

**Explanation:**
- `std::unique_ptr` has deleted copy constructor
- `buckets_(other.buckets_)` tries to copy vector of lists containing unique_ptr
- Copy fails → compilation error
- HashMap with non-copyable value types needs deleted/custom copy constructor
- If copyable, default memberwise copy works (buckets_ properly copied)
- **Key Concept:** HashMap copy constructor inherited copyability from value type; non-copyable types (unique_ptr, mutex) make HashMap non-copyable; explicitly delete copy constructor or use moveable-only semantics

**Fixed Version:**
```cpp
// Option 1: Delete copy, allow move only
HashMap(const HashMap&) = delete;
HashMap& operator=(const HashMap&) = delete;

HashMap(HashMap&&) noexcept = default;
HashMap& operator=(HashMap&&) noexcept = default;

// Option 2: Use shared_ptr instead
HashMap<int, std::shared_ptr<int>> map;

// Option 3: Store values directly (if applicable)
HashMap<int, int> map;
```

---
