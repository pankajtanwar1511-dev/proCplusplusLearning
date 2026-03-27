## TOPIC: LRU Cache Implementation - Eviction Policy

### PRACTICE_TASKS: Output Prediction and Code Analysis

#### Q1
```cpp
class LRUCache {
    std::list<std::pair<int, int>> items_;  // (key, value)
    std::unordered_map<int, std::list<std::pair<int, int>>::iterator> map_;
    size_t capacity_;

public:
    LRUCache(size_t cap) : capacity_(cap) {}

    int get(int key) {
        auto it = map_.find(key);
        if (it == map_.end()) {
            return -1;
        }

        // Move to front (most recently used)
        items_.splice(items_.begin(), items_, it->second);
        return it->second->second;  // Return value
    }

    void put(int key, int value) {
        auto it = map_.find(key);
        if (it != map_.end()) {
            // Update existing
            items_.erase(it->second);  // Bug: iterator invalidated but still in map!
        }

        items_.push_front({key, value});
        map_[key] = items_.begin();

        if (map_.size() > capacity_) {
            auto last = items_.back();
            map_.erase(last.first);
            items_.pop_back();
        }
    }
};
```

**Answer:**
```
Dangling iterator (map_ contains invalidated iterator after erase(), next access crashes)
```

**Explanation:**
- `items_.erase(it->second)` invalidates the iterator
- But `map_[key]` still points to invalidated iterator from previous insertion
- Next `get(key)` dereferences dangling iterator → undefined behavior
- Must update `map_[key]` with new iterator after insertion
- Or don't erase when updating, just move and update value
- **Key Concept:** Erasing list elements invalidates iterators; must update all references to erased elements; prefer splice() over erase()+insert() to preserve iterators

**Fixed Version:**
```cpp
void put(int key, int value) {
    auto it = map_.find(key);
    if (it != map_.end()) {
        // Update existing without erase
        it->second->second = value;  // Update value in place
        items_.splice(items_.begin(), items_, it->second);  // Move to front
        return;
    }

    items_.push_front({key, value});
    map_[key] = items_.begin();

    if (map_.size() > capacity_) {
        auto last = items_.back();
        map_.erase(last.first);
        items_.pop_back();
    }
}
```

---

#### Q2
```cpp
class LRUCache {
    std::list<std::pair<int, int>> items_;
    std::unordered_map<int, std::list<std::pair<int, int>>::iterator> map_;
    size_t capacity_;

public:
    void put(int key, int value) {
        // ... add to front ...

        if (map_.size() > capacity_) {  // Bug: > instead of >=!
            auto last = items_.back();
            map_.erase(last.first);
            items_.pop_back();
        }
    }
};
```

**Answer:**
```
Cache exceeds capacity by one element (capacity=10 allows 11 elements)
```

**Explanation:**
- Check `map_.size() > capacity_` happens AFTER insertion
- If capacity=10, map can grow to 11 before eviction
- Cache holds 11 elements instead of 10
- Should check `map_.size() > capacity_` or evict before exceeding
- Off-by-one error in capacity enforcement
- **Key Concept:** Eviction check must account for insertion order; checking after insertion allows one extra element; use >= or check before insertion

**Fixed Version:**
```cpp
void put(int key, int value) {
    auto it = map_.find(key);
    if (it != map_.end()) {
        // Update existing
        it->second->second = value;
        items_.splice(items_.begin(), items_, it->second);
        return;
    }

    // Check capacity BEFORE insertion if needed
    if (map_.size() >= capacity_) {  // >= not >
        auto last = items_.back();
        map_.erase(last.first);
        items_.pop_back();
    }

    items_.push_front({key, value});
    map_[key] = items_.begin();
}
```

---

#### Q3
```cpp
class LRUCache {
    std::list<int> keys_;  // Only stores keys
    std::unordered_map<int, int> values_;  // Stores key->value
    std::unordered_map<int, std::list<int>::iterator> positions_;  // Stores key->position
    size_t capacity_;

public:
    int get(int key) {
        if (values_.find(key) == values_.end()) {
            return -1;
        }

        // Move to front
        keys_.erase(positions_[key]);  // Bug: invalidates iterator!
        keys_.push_front(key);
        positions_[key] = keys_.begin();

        return values_[key];
    }
};
```

**Answer:**
```
Iterator invalidation (erasing from list invalidates iterator in positions_)
```

**Explanation:**
- `keys_.erase(positions_[key])` invalidates the iterator
- `positions_[key]` now holds dangling iterator
- Next access to same key uses dangling iterator
- Fortunately, we immediately update with `positions_[key] = keys_.begin()`
- But if exception thrown between erase and update, iterator dangling
- Better to use splice() which preserves validity
- **Key Concept:** List::erase() invalidates iterators; must update references atomically; splice() safer as it preserves iterator validity throughout operation

**Fixed Version:**
```cpp
int get(int key) {
    if (values_.find(key) == values_.end()) {
        return -1;
    }

    // Use splice instead of erase+push_front
    keys_.splice(keys_.begin(), keys_, positions_[key]);
    // No need to update positions_[key] - iterator still valid!

    return values_[key];
}
```

---

#### Q4
```cpp
class LRUCache {
    std::list<std::pair<int, int>> items_;
    std::unordered_map<int, std::list<std::pair<int, int>>::iterator> map_;
    size_t capacity_;

public:
    LRUCache(size_t cap) : capacity_(cap) {}

    // Bug: missing copy constructor and copy assignment!
};

int main() {
    LRUCache cache1(10);
    cache1.put(1, 100);

    LRUCache cache2 = cache1;  // Bug: shallow copy of map_!

    cache1.put(2, 200);  // May evict key 1

    int val = cache2.get(1);  // Bug: dangling iterator in cache2!
}
```

**Answer:**
```
Dangling iterator (cache2's map_ contains iterators into cache1's list, which gets modified)
```

**Explanation:**
- Default copy constructor shallow-copies `map_`
- `cache2.map_` contains iterators pointing into `cache1.items_`
- `cache1.put(2, 200)` modifies `cache1.items_` → may invalidate iterators
- `cache2.get(1)` dereferences iterator that may be invalidated
- Must implement deep copy or delete copy operations
- LRU cache typically move-only or requires custom copy
- **Key Concept:** Classes with iterators/pointers need custom copy operations; shallow copy causes aliasing where copies share internal state; must deep-copy or delete copy constructor

**Fixed Version:**
```cpp
class LRUCache {
    std::list<std::pair<int, int>> items_;
    std::unordered_map<int, std::list<std::pair<int, int>>::iterator> map_;
    size_t capacity_;

public:
    LRUCache(size_t cap) : capacity_(cap) {}

    // Delete copy operations (prefer move-only)
    LRUCache(const LRUCache&) = delete;
    LRUCache& operator=(const LRUCache&) = delete;

    // Allow move operations
    LRUCache(LRUCache&&) noexcept = default;
    LRUCache& operator=(LRUCache&&) noexcept = default;
};

// Or implement deep copy if needed
LRUCache(const LRUCache& other)
    : capacity_(other.capacity_) {
    for (auto it = other.items_.rbegin(); it != other.items_.rend(); ++it) {
        put(it->first, it->second);  // Rebuild from back to front
    }
}
```

---

#### Q5
```cpp
#include <mutex>

class ThreadSafeLRUCache {
    std::list<std::pair<int, int>> items_;
    std::unordered_map<int, std::list<std::pair<int, int>>::iterator> map_;
    size_t capacity_;
    std::mutex mutex_;

public:
    int get(int key) {
        std::lock_guard<std::mutex> lock(mutex_);

        auto it = map_.find(key);
        if (it == map_.end()) {
            return -1;
        }

        items_.splice(items_.begin(), items_, it->second);
        return it->second->second;
    }

    void put(int key, int value) {
        std::lock_guard<std::mutex> lock(mutex_);

        // ... put logic ...
    }
};

int main() {
    ThreadSafeLRUCache cache(1000);

    // Many threads doing lookups
    for (int i = 0; i < 100; i++) {
        cache.get(i % 100);  // Bug: every get() locks AND modifies list!
    }
}
```

**Answer:**
```
Performance issue (every get() locks AND modifies list even for repeated accesses)
```

**Explanation:**
- `get()` always moves accessed item to front via splice()
- Requires exclusive lock even for read-only lookups
- High contention on mutex
- Repeated access to same key keeps splicing same element
- Alternative: use reader-writer lock with read-only get() that doesn't update recency
- Or: update recency lazily/periodically
- **Key Concept:** LRU cache get() traditionally updates recency requiring write access; causes contention in multithreaded scenarios; consider read-only get() with approximate LRU or reader-writer locks

**Fixed Version:**
```cpp
// Option 1: Use shared_mutex for better concurrency
class ThreadSafeLRUCache {
    std::list<std::pair<int, int>> items_;
    std::unordered_map<int, std::list<std::pair<int, int>>::iterator> map_;
    size_t capacity_;
    mutable std::shared_mutex mutex_;

public:
    int get(int key) const {
        std::shared_lock<std::shared_mutex> lock(mutex_);

        auto it = map_.find(key);
        if (it == map_.end()) {
            return -1;
        }

        // Don't update recency on read (approximate LRU)
        return it->second->second;
    }

    void put(int key, int value) {
        std::unique_lock<std::shared_mutex> lock(mutex_);
        // ... put logic ...
    }
};

// Option 2: Separate recency updates (more complex)
```

---

#### Q6
```cpp
class LRUCache {
    std::list<std::pair<int, int>> items_;
    std::unordered_map<int, std::list<std::pair<int, int>>::iterator> map_;
    size_t capacity_;

public:
    void put(int key, int value) {
        // ... update or insert ...

        if (map_.size() > capacity_) {
            auto last = items_.back();
            items_.pop_back();  // Bug: pop before erase from map!
            map_.erase(last.first);
        }
    }
};
```

**Answer:**
```
Undefined behavior (accessing items_.back() after pop_back())
```

**Explanation:**
- `auto last = items_.back()` creates copy of pair
- `items_.pop_back()` destroys the last element
- `map_.erase(last.first)` uses `last` which was copied before destruction
- Actually works correctly! Copy made before pop_back()
- But order suggests logic error
- More clear to erase from map first, then pop_back
- **Key Concept:** Be careful with order of operations when evicting; copying value before pop_back() works but order is confusing; prefer erase from map before pop for clarity

**Fixed Version (more clear):**
```cpp
if (map_.size() > capacity_) {
    int key_to_evict = items_.back().first;  // Extract key
    map_.erase(key_to_evict);  // Erase from map first
    items_.pop_back();  // Then from list
}

// Or keep last as copy (equally valid)
if (map_.size() > capacity_) {
    auto last = items_.back();  // Copy
    map_.erase(last.first);  // Erase from map
    items_.pop_back();  // Erase from list
}
```

---

#### Q7
```cpp
class LRUCache {
    std::list<std::pair<std::string, int>> items_;  // String keys!
    std::unordered_map<std::string, std::list<std::pair<std::string, int>>::iterator> map_;
    size_t capacity_;

public:
    void put(const std::string& key, int value) {
        auto it = map_.find(key);
        if (it != map_.end()) {
            it->second->second = value;
            items_.splice(items_.begin(), items_, it->second);
            return;
        }

        items_.push_front({key, value});  // Bug: copies string into list
        map_[key] = items_.begin();  // Bug: copies string as map key!

        // Two copies of potentially large string!
    }
};
```

**Answer:**
```
Performance issue (string copied twice - once in list, once in map)
```

**Explanation:**
- `items_.push_front({key, value})` copies `key` into list
- `map_[key] = ...` copies `key` again as map key
- For large strings, two copies expensive
- Map key is redundant (already stored in list)
- Better design: store key only in list, map uses string_view or reference
- Or: emplace_back to avoid temporary
- **Key Concept:** LRU cache stores keys in both list and map causing duplication; for large keys (strings) this wastes memory and CPU; consider storing key only once and using views/references

**Fixed Version:**
```cpp
// Option 1: Use emplace to avoid temporaries
items_.emplace_front(key, value);  // Still copies, but avoids temporary
map_.emplace(key, items_.begin());

// Option 2: Store pointer/reference (more complex)
class LRUCache {
    std::list<std::pair<std::string, int>> items_;
    std::unordered_map<std::string_view, std::list<std::pair<std::string, int>>::iterator> map_;
    // map_ now uses string_view pointing into items_

    void put(const std::string& key, int value) {
        items_.push_front({key, value});
        auto& stored_key = items_.front().first;  // Key in list
        map_[std::string_view(stored_key)] = items_.begin();  // View of key
    }
};
```

---

#### Q8
```cpp
class LRUCache {
    std::list<std::pair<int, int>> items_;
    std::unordered_map<int, std::list<std::pair<int, int>>::iterator> map_;
    size_t capacity_;

public:
    int get(int key) {
        auto it = map_.find(key);
        if (it == map_.end()) {
            return -1;
        }

        items_.splice(items_.begin(), items_, it->second);
        return it->second->second;
    }
};

int main() {
    LRUCache cache(1000);

    // Repeatedly access same key
    for (int i = 0; i < 1000000; i++) {
        cache.get(42);  // Bug: keeps splicing same element to front!
    }
}
```

**Answer:**
```
Unnecessary work (splicing element already at front to front - no-op but still costs CPU)
```

**Explanation:**
- First `get(42)` moves key 42 to front
- Subsequent `get(42)` calls splice element already at front
- Splice from front to front is no-op but still traverses list
- Should check if already at front before splicing
- Micro-optimization but relevant for hot caches
- **Key Concept:** Splicing element already at target position is wasted work; check position before splicing for frequently-accessed keys; optimize hot path by avoiding redundant operations

**Fixed Version:**
```cpp
int get(int key) {
    auto it = map_.find(key);
    if (it == map_.end()) {
        return -1;
    }

    // Only splice if not already at front
    if (it->second != items_.begin()) {
        items_.splice(items_.begin(), items_, it->second);
    }

    return it->second->second;
}
```

---

#### Q9
```cpp
class LRUCache {
    std::list<std::pair<int, int>> items_;
    std::unordered_map<int, std::list<std::pair<int, int>>::iterator> map_;
    size_t capacity_;

public:
    void clear() {
        items_.clear();
        map_.clear();  // Bug: iterators in map_ now dangle!
    }

    int get(int key) {
        // After clear(), map_ is empty so this is safe
        auto it = map_.find(key);
        if (it == map_.end()) {
            return -1;
        }
        return it->second->second;
    }
};
```

**Answer:**
```
Actually safe (map_.clear() removes all entries, so no dangling iterators accessed)
```

**Explanation:**
- `items_.clear()` destroys all list nodes → iterators invalid
- `map_.clear()` removes all map entries → no dangling iterators accessible
- Order matters: if only cleared items_, map would have dangling iterators
- If cleared map_ first, items_ would have unreferenced nodes (leak potential)
- Current order is correct
- **No bug!** This is correct implementation
- **Key Concept:** When clearing containers with cross-references, order matters; clearing referenced container first invalidates pointers/iterators; clearing referencing container first may leak; clear referencing container last

**Note:** This question tests understanding that not all code has bugs!

---

#### Q10
```cpp
class LRUCache {
    std::list<std::pair<int, int*>> items_;  // Bug: stores pointers!
    std::unordered_map<int, std::list<std::pair<int, int*>>::iterator> map_;
    size_t capacity_;

public:
    void put(int key, int* value) {  // Takes pointer!
        // ... add to cache ...
    }

    int* get(int key) {  // Returns pointer!
        auto it = map_.find(key);
        if (it == map_.end()) {
            return nullptr;
        }
        return it->second->second;  // Bug: returns raw pointer!
    }
};

int main() {
    LRUCache cache(10);

    int* ptr = new int(42);
    cache.put(1, ptr);

    delete ptr;  // Bug: manual delete while cache still holds pointer!

    int* val = cache.get(1);  // Bug: dangling pointer returned!
    std::cout << *val;  // Crash!
}
```

**Answer:**
```
Dangling pointer (cache holds raw pointer to deleted memory)
```

**Explanation:**
- Cache stores raw pointer, doesn't manage lifetime
- User deletes object while cache still holds pointer
- Cache returns dangling pointer
- Dereferencing causes undefined behavior
- Cache should own objects (store by value or use shared_ptr)
- Or document that cache doesn't own values
- **Key Concept:** Caches storing pointers create ownership ambiguity; who deletes objects? Prefer storing values or shared_ptr for clear ownership; raw pointers risk dangling

**Fixed Version:**
```cpp
// Option 1: Store values (cache owns)
class LRUCache {
    std::list<std::pair<int, int>> items_;  // Store by value
    std::unordered_map<int, std::list<std::pair<int, int>>::iterator> map_;

    int get(int key) {
        // Returns value by copy
        return it->second->second;
    }
};

// Option 2: Use shared_ptr (shared ownership)
class LRUCache {
    std::list<std::pair<int, std::shared_ptr<int>>> items_;
    std::unordered_map<int, std::list<std::pair<int, std::shared_ptr<int>>>::iterator> map_;

    std::shared_ptr<int> get(int key) {
        // Returns shared_ptr - safe even if original deleted
        return it->second->second;
    }
};
```

---
