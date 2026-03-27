### INTERVIEW_QA: Comprehensive Questions and Answers
#### Q1: Why does std::vector grow by a factor (e.g., 2×) instead of fixed increments?
Implement this exercise.

**Answer:**

**Fixed increment (e.g., +10):**
```
Insertions: 1, 11, 21, 31, ..., 991
Reallocations: 100 times
Copies: 10 + 20 + 30 + ... + 1000 = O(n²)
```

**Multiplicative growth (2×):**
```
Insertions: 1, 2, 4, 8, 16, ..., 1024
Reallocations: log₂(1000) ≈ 10 times
Copies: 1 + 2 + 4 + ... + 512 = O(n)
```

**Amortized analysis:**
- Each push_back costs O(1) on average
- Occasional O(n) reallocation amortized over many O(1) insertions

**Why 2× specifically?**
- Simple, fast
- Alternatives: 1.5× (less waste, may reuse freed memory), φ ≈ 1.618 (optimal)

---
#### Q2: What is the difference between `resize()` and `reserve()`?
Implement this exercise.

**Answer:**

**`reserve(n)`:**
- Allocates capacity for n elements
- Does **not** construct elements
- `size()` unchanged

```cpp
Vector<int> v;
v.reserve(10);
std::cout << v.size();      // 0
std::cout << v.capacity();  // 10
v[5] = 42;  // ← UNDEFINED BEHAVIOR (element doesn't exist)
```

**`resize(n)`:**
- Changes size to n
- Constructs new elements (or destroys if shrinking)

```cpp
Vector<int> v;
v.resize(10);
std::cout << v.size();      // 10
std::cout << v.capacity();  // ≥ 10
v[5] = 42;  // ✓ Valid
```

**When to use:**
- `reserve()`: Pre-allocate before many `push_back`s
- `resize()`: Initialize vector with default values

---
#### Q3: Explain iterator invalidation rules for vector.
Implement this exercise.

**Answer:**

**Invalidation occurs when:**

**1) Reallocation (capacity changes):**
- All iterators, pointers, references invalidated
- Triggered by: `push_back()`, `insert()`, `emplace()`, `reserve()`, `resize()` (if grows beyond capacity)

```cpp
Vector<int> v = {1, 2, 3};
auto it = v.begin();
v.push_back(4);  // May reallocate
*it;  // ← INVALID (may crash)
```

**2) Insertion/Erasure:**
- Iterators after modification point invalidated
- Iterators before remain valid (if no reallocation)

```cpp
Vector<int> v = {1, 2, 3, 4};
auto it1 = v.begin();     // Points to v[0]
auto it2 = v.begin() + 2; // Points to v[2]

v.erase(v.begin() + 1);   // Erase v[1]
// it1 still valid (points to v[0])
// it2 INVALID (elements shifted)
```

**Safe patterns:**
- Don't modify vector during iteration
- Re-acquire iterators after modification
- Use indices instead of iterators

---
#### Q4: How does vector ensure exception safety during reallocation?
Implement this exercise.

**Answer:**

**Two cases:**

**1) Type has `noexcept` move constructor:**
- Move elements (no copy)
- If move fails, program terminates (noexcept violation)
- Justification: move is assumed to be safe

**2) Type has throwing move constructor:**
- Copy elements instead
- If copy throws, rollback and rethrow
- Old buffer remains intact

**Implementation:**
```cpp
if constexpr (std::is_nothrow_move_constructible_v<T>) {
    std::uninitialized_move_n(old, size, new_buf);
} else {
    try {
        std::uninitialized_copy_n(old, size, new_buf);
    } catch (...) {
        // Rollback: new_buf destroyed, old buffer intact
        throw;
    }
}
```

**Key insight:** Move is used only if `noexcept`, ensuring strong guarantee.

---
#### Q5: Why use placement new instead of regular new?
Implement this exercise.

**Answer:**

**Regular `new`:**
```cpp
T* ptr = new T(value);  // Allocates AND constructs
```

**Problem:** We already allocated memory (via `::operator new`), don't want double allocation.

**Placement new:**
```cpp
void* memory = ::operator new(sizeof(T));  // Allocate raw memory
T* ptr = new (memory) T(value);            // Construct at specific address
```

**In vector:**
```cpp
T* data_ = static_cast<T*>(::operator new(capacity * sizeof(T)));

// Later, when pushing:
new (data_ + size_) T(value);  // Construct at data_[size_]
++size_;
```

**Benefits:**
- Separate allocation from construction
- Control over object lifetime
- Avoid double allocation

**Destructor must be called manually:**
```cpp
data_[i].~T();  // Explicit destructor call
::operator delete(data_);  // Deallocate raw memory
```

---
#### Q6: What happens if you call `pop_back()` on an empty vector?
Implement this exercise.

**Answer:**

**std::vector behavior:** Undefined behavior (no bounds check).

**Our implementation:**
```cpp
void pop_back() {
    if (size_ > 0) {  // Guard
        --size_;
        data_[size_].~T();
    }
    // If empty, no-op (safe but silent)
}
```

**Alternative:** Assert or throw:
```cpp
void pop_back() {
    if (size_ == 0) {
        throw std::out_of_range("pop_back on empty vector");
    }
    // ...
}
```

**Best practice:** Caller should check `!empty()` before `pop_back()`.

---
#### Q7: How would you implement `insert()` in the middle of the vector?
Implement this exercise.

**Answer:**

```cpp
iterator insert(iterator pos, const T& value) {
    size_t index = pos - begin();  // Calculate index

    if (size_ == capacity_) {
        reserve(capacity_ == 0 ? 1 : capacity_ * 2);
        // pos invalidated! Recalculate:
        pos = begin() + index;
    }

    // Shift elements right
    for (size_t i = size_; i > index; --i) {
        new (data_ + i) T(std::move(data_[i - 1]));
        data_[i - 1].~T();
    }

    // Insert new element
    new (data_ + index) T(value);
    ++size_;

    return begin() + index;
}
```

**Complexity:** O(n) due to shifting.

**Reallocation invalidates `pos`**, so we must recalculate after `reserve()`.

---
#### Q8: Why does `shrink_to_fit()` exist? When would you use it?
Implement this exercise.

**Answer:**

**Scenario:**
```cpp
Vector<int> v;
v.reserve(1000000);  // Allocate 1M capacity

for (int i = 0; i < 10; ++i) {
    v.push_back(i);
}

// size = 10, capacity = 1M
// Wasting 999,990 * sizeof(int) = ~4 MB
```

**`shrink_to_fit()` reduces capacity to size:**
```cpp
v.shrink_to_fit();
// size = 10, capacity = 10
// Memory reclaimed
```

**When to use:**
- After bulk `erase()` or `pop_back()`
- When vector size stabilizes
- Memory-constrained environments

**Note:** It's a **non-binding request** (implementation may ignore).

---
#### Q9: How would you optimize vector for small objects (e.g., int)?
Implement this exercise.

**Answer:**

**Small Buffer Optimization (SBO):**
- Store small vectors inline (avoid heap allocation)

```cpp
template<typename T, size_t N = 16>
class SmallVector {
private:
    alignas(T) char buffer_[sizeof(T) * N];  // Inline storage
    T* data_;
    size_t size_;
    size_t capacity_;

public:
    SmallVector() : data_(reinterpret_cast<T*>(buffer_)),
                    size_(0), capacity_(N) {}

    void push_back(const T& value) {
        if (size_ == capacity_) {
            if (data_ == reinterpret_cast<T*>(buffer_)) {
                // Transition to heap
                T* new_data = new T[capacity_ * 2];
                std::uninitialized_move_n(data_, size_, new_data);
                data_ = new_data;
                capacity_ *= 2;
            } else {
                // Already on heap, grow normally
                reallocate(capacity_ * 2);
            }
        }

        new (data_ + size_) T(value);
        ++size_;
    }
};
```

**Benefits:**
- No heap allocation for ≤ N elements
- Better cache locality
- Used by: LLVM's `SmallVector`, Boost.Container

---
#### Q10: Compare vector to deque. When would you use each?
**Answer:**

| Feature | `vector` | `deque` |
|---------|----------|---------|
| **Memory** | Contiguous | Chunked (multiple blocks) |
| **Random access** | O(1) | O(1) (slightly slower) |
| **`push_back`** | Amortized O(1) | O(1) (no reallocation) |
| **`push_front`** | O(n) | O(1) |
| **Iterator invalidation** | Reallocation invalidates all | Only invalidates at ends |
| **Cache locality** | Excellent | Good (within chunks) |

**When to use vector:**
- Random access performance critical
- Iteration performance critical
- Insertions only at back

**When to use deque:**
- Insertions at both ends
- Don't want iterator invalidation on push_back
- Size frequently changes

**Example:**
```cpp
// Use vector:
std::vector<int> v;
for (int i = 0; i < 1000000; ++i) {
    v.push_back(i);  // Efficient
}

// Use deque:
std::deque<int> d;
d.push_front(1);  // O(1)
d.push_back(2);   // O(1)
```

---
