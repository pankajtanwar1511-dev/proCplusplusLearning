## TOPIC: std::vector - Dynamic Contiguous Array

### THEORY_SECTION: Core Concepts and Architecture

#### 1. std::vector Structure - Internal Memory Layout and the Three-Pointer Architecture

**std::vector** is a dynamically resizable array that stores elements in **contiguous memory** on the heap, combining the efficiency of C arrays with automatic memory management through RAII principles. It's the most frequently used STL container and should be the default choice for sequential data unless you have specific requirements that necessitate another container.

**Internal Structure - The Three-Pointer Model:**

```cpp
// Conceptual internal representation (simplified)
template<typename T>
class vector {
    T* begin_;      // Pointer to first element
    T* end_;        // Pointer to one past last valid element
    T* capacity_;   // Pointer to end of allocated storage

    // size() = end_ - begin_
    // capacity() = capacity_ - begin_
    // Unused space = capacity_ - end_
};
```

**Vector Memory Layout:**

| Component | Pointer | Purpose | Accessor |
|-----------|---------|---------|----------|
| **Data Start** | `begin_` | Points to first element | `data()`, `begin()` |
| **Logical End** | `end_` | Points one past last valid element | `end()` |
| **Capacity End** | `capacity_` | Points one past last allocated slot | `capacity()` |
| **Size** | `end_ - begin_` | Number of valid elements | `size()` |
| **Capacity** | `capacity_ - begin_` | Total allocated elements | `capacity()` |
| **Unused Space** | `capacity_ - end_` | Available slots before reallocation | N/A |

**Memory Layout Visualization:**

```
Heap Memory:
┌─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┐
│  1  │  2  │  3  │  4  │  5  │  ?  │  ?  │  ?  │
└─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┘
  ↑                             ↑                 ↑
begin_                        end_           capacity_
(data start)              (size = 5)      (capacity = 8)

Valid elements: [begin_, end_)
Allocated memory: [begin_, capacity_)
Unused slots: [end_, capacity_)
```

**Contiguous Memory Benefits:**

| Benefit | Reason | Performance Impact |
|---------|--------|-------------------|
| **Cache Locality** | Sequential elements in memory | ✅ Fast iteration (prefetching) |
| **Random Access** | Pointer arithmetic: `ptr + index` | ✅ O(1) element access |
| **Memory Efficiency** | No per-element overhead | ✅ Minimal memory waste (vs linked structures) |
| **Compiler Optimizations** | SIMD vectorization possible | ✅ Auto-vectorization of loops |
| **Pointer Stability (within capacity)** | No reallocation if `size < capacity` | ✅ Safe to cache pointers temporarily |

**Code Example - Observing Internal Pointers:**

```cpp
#include <vector>
#include <iostream>

int main() {
    std::vector<int> v;

    std::cout << "Initial state:\n";
    std::cout << "  Size: " << v.size() << ", Capacity: " << v.capacity() << "\n";
    std::cout << "  Data ptr: " << v.data() << "\n\n";

    v.push_back(10);
    std::cout << "After push_back(10):\n";
    std::cout << "  Size: " << v.size() << ", Capacity: " << v.capacity() << "\n";
    std::cout << "  Data ptr: " << v.data() << " (address may change)\n";
    std::cout << "  &v[0]: " << &v[0] << " (points to first element)\n\n";

    void* old_ptr = v.data();
    v.reserve(100);
    std::cout << "After reserve(100):\n";
    std::cout << "  Size: " << v.size() << ", Capacity: " << v.capacity() << "\n";
    std::cout << "  Data ptr: " << v.data()
              << (v.data() == old_ptr ? " (same)" : " (MOVED - reallocation)") << "\n";
}
```

**Size vs Capacity - Critical Distinction:**

| Property | Meaning | Access Method | Can Decrease? |
|----------|---------|---------------|---------------|
| **Size** | Number of valid, constructed elements | `v.size()`, `v.end() - v.begin()` | ✅ Yes (via `erase`, `resize`, `clear`) |
| **Capacity** | Total allocated memory (in elements) | `v.capacity()` | ❌ No (automatic shrinking never happens) |
| **Invariant** | `size() <= capacity()` always true | N/A | Maintained by vector |

**Common Misconceptions:**

```cpp
std::vector<int> v;
v.reserve(100);  // ✅ Allocates space for 100 elements

// ❌ WRONG: Cannot access reserved elements
v[50] = 42;  // ❌ Undefined behavior! size() is still 0

// ✅ CORRECT: Must create elements first
v.resize(100);  // Now size() == 100
v[50] = 42;     // ✅ Safe
```

---

#### 2. Memory Management and Growth Strategy - Geometric Growth and Reallocation

Vector's automatic memory management follows a **geometric growth strategy** to achieve amortized O(1) insertion complexity, but understanding reallocation is critical for writing correct and efficient code.

**Geometric Growth Strategy:**

When `size() == capacity()` and a new element is added, vector:
1. Allocates a new memory block (typically 1.5x or 2x current capacity)
2. Moves or copies all existing elements to the new block
3. Destroys elements in the old block
4. Deallocates the old memory

**Growth Factor Comparison:**

| Growth Strategy | Typical Factor | Implementations | Memory Waste | Reallocations for n=1000 |
|-----------------|----------------|-----------------|--------------|--------------------------|
| **Doubling (2x)** | 2.0 | GCC, Clang | 50-100% | ~10 (log₂(1000)) |
| **Factor 1.5** | 1.5 | MSVC | 33-50% | ~17 (log₁.₅(1000)) |
| **Linear (+k)** | N/A | ❌ Not used | 0% | ~1000 (terrible!) |

**Why Geometric Growth?**

```cpp
// ❌ LINEAR GROWTH (hypothetical - not how vector works):
// Capacity grows: 1 → 2 → 3 → 4 → 5 → ... → n
// Total copies for n elements:
//   0 + 1 + 2 + 3 + ... + (n-1) = n(n-1)/2 = O(n²) - TERRIBLE!

// ✅ GEOMETRIC GROWTH (actual vector behavior):
// Capacity grows: 1 → 2 → 4 → 8 → 16 → ... → 2^k (where 2^k ≥ n)
// Total copies for n elements:
//   0 + 1 + 2 + 4 + 8 + ... + n/2 ≈ 2n = O(n) - EXCELLENT!
// Amortized cost per insertion: O(n) / n = O(1)
```

**Reallocation Triggers and Consequences:**

| Operation | Triggers Reallocation If... | Invalidates Iterators? | Invalidates Pointers/References? |
|-----------|----------------------------|------------------------|----------------------------------|
| `push_back(x)` | `size() == capacity()` | ✅ Yes (if realloc) | ✅ Yes (if realloc) |
| `emplace_back(args)` | `size() == capacity()` | ✅ Yes (if realloc) | ✅ Yes (if realloc) |
| `insert(pos, x)` | `size() == capacity()` | ✅ Yes (all if realloc, >= pos otherwise) | ✅ Yes (all if realloc, >= pos otherwise) |
| `reserve(n)` | `n > capacity()` | ✅ Yes (all) | ✅ Yes (all) |
| `resize(n)` | `n > capacity()` | ✅ Yes (all) | ✅ Yes (all) |
| `erase(pos)` | Never | ✅ Yes (>= pos) | ✅ Yes (>= pos) |
| `clear()` | Never | ✅ Yes (all) | ✅ Yes (all) |
| `shrink_to_fit()` | Implementation-defined | ✅ Yes (may realloc) | ✅ Yes (may realloc) |

**Code Example - Iterator Invalidation:**

```cpp
#include <vector>
#include <iostream>

int main() {
    std::vector<int> v = {1, 2, 3};
    v.reserve(3);  // Capacity is exactly 3

    auto it = v.begin();
    int* ptr = &v[0];

    std::cout << "Before push_back: *it = " << *it << ", *ptr = " << *ptr << "\n";

    v.push_back(4);  // ❌ REALLOCATION OCCURS (size was 3, capacity was 3)

    // ❌ UNDEFINED BEHAVIOR: it and ptr are now dangling
    // std::cout << *it << "\n";   // May crash, print garbage, or "work"
    // std::cout << *ptr << "\n";  // May crash, print garbage, or "work"

    // ✅ CORRECT: Get fresh iterators after reallocation
    it = v.begin();
    ptr = &v[0];
    std::cout << "After reallocation: *it = " << *it << ", *ptr = " << *ptr << "\n";
}
```

**Reserve vs Resize - Critical Difference:**

| Method | What It Does | Size Change | Capacity Change | Element Construction |
|--------|--------------|-------------|-----------------|---------------------|
| `reserve(n)` | Allocates space for ≥n elements | ❌ No | ✅ Yes (if n > capacity) | ❌ No (only allocation) |
| `resize(n)` | Changes size to exactly n | ✅ Yes | ✅ Yes (if n > capacity) | ✅ Yes (constructs/destroys as needed) |

**Code Example - Reserve vs Resize:**

```cpp
std::vector<int> v1, v2;

// ❌ WRONG: reserve doesn't create elements
v1.reserve(10);
// v1[5] = 100;  // ❌ UB: size() is still 0, can't access [5]

// ✅ CORRECT: resize creates elements
v2.resize(10);
v2[5] = 100;  // ✅ Safe: size() is 10

// reserve is for PERFORMANCE (avoid reallocations)
std::vector<int> v3;
v3.reserve(10000);  // Allocate once
for (int i = 0; i < 10000; ++i) {
    v3.push_back(i);  // ✅ No reallocations
}

// resize is for INITIALIZATION (create elements)
std::vector<int> v4;
v4.resize(10000);  // Create 10000 zero-initialized ints
// v4 already has 10000 elements, can access any index [0, 9999]
```

**Memory Reclamation Strategies:**

| Operation | Effect | Use Case |
|-----------|--------|----------|
| `clear()` | Sets size to 0, keeps capacity | ❌ Doesn't free memory |
| `v = std::vector<T>()` | Swap with empty vector | ✅ Frees memory (guaranteed) |
| `v.swap(std::vector<T>())` | Swap with temporary | ✅ Frees memory (guaranteed) |
| `shrink_to_fit()` | Request capacity = size | ⚠️ Non-binding (may or may not free) |

**Code Example - Shrinking Vector:**

```cpp
std::vector<int> v(1000000);  // 1 million elements
std::cout << "Capacity: " << v.capacity() << "\n";  // 1000000

v.resize(10);  // Keep only 10 elements
std::cout << "After resize(10):\n";
std::cout << "  Size: " << v.size() << "\n";        // 10
std::cout << "  Capacity: " << v.capacity() << "\n";  // ❌ Still ~1000000!

// ✅ Force memory reclamation with swap idiom
std::vector<int>(v).swap(v);
std::cout << "After swap:\n";
std::cout << "  Size: " << v.size() << "\n";        // 10
std::cout << "  Capacity: " << v.capacity() << "\n";  // ✅ Now ~10

// Or use shrink_to_fit (C++11, non-binding)
v.resize(10);
v.shrink_to_fit();  // ⚠️ May or may not reduce capacity
```

---

#### 3. Performance Characteristics and When to Use std::vector

Vector's performance characteristics make it the **default choice** for sequential containers in C++, but understanding its strengths and weaknesses is essential for optimal container selection.

**Time Complexity Summary:**

| Operation | Average Case | Worst Case | Notes |
|-----------|--------------|------------|-------|
| **Random Access** `v[i]`, `v.at(i)` | O(1) | O(1) | Pointer arithmetic |
| **Front Access** `v.front()` | O(1) | O(1) | Direct access to first element |
| **Back Access** `v.back()` | O(1) | O(1) | Direct access to last element |
| **Push Back** `v.push_back(x)` | **O(1)** amortized | O(n) | O(n) only on reallocation |
| **Pop Back** `v.pop_back()` | O(1) | O(1) | Just destroys last element |
| **Insert Beginning** `v.insert(begin, x)` | O(n) | O(n) | Shifts all n elements |
| **Insert Middle** `v.insert(pos, x)` | O(n) | O(n) | Shifts elements after pos |
| **Erase Beginning** `v.erase(begin)` | O(n) | O(n) | Shifts all remaining elements |
| **Erase Middle** `v.erase(pos)` | O(n) | O(n) | Shifts elements after pos |
| **Clear** `v.clear()` | O(n) | O(n) | Destroys all n elements |
| **Find** `std::find(begin, end, x)` | O(n) | O(n) | Linear search (unsorted) |
| **Binary Search** (sorted) | O(log n) | O(log n) | Requires sorted vector |
| **Sort** `std::sort(begin, end)` | O(n log n) | O(n log n) | Introsort algorithm |

**Space Complexity:**

| Aspect | Cost | Explanation |
|--------|------|-------------|
| **Per-element overhead** | 0 bytes | Contiguous storage, no pointers per element |
| **Vector object size** | 24 bytes (64-bit) | Three pointers (begin, end, capacity) |
| **Unused capacity** | 0-100% | Geometric growth wastes 0-50% on average |
| **Total memory** | `sizeof(T) * capacity + 24` | Capacity, not size, determines memory |

**Vector vs Other Containers - Decision Matrix:**

| Use Case | Best Container | Why? |
|----------|----------------|------|
| **Default choice** | `std::vector` | Best all-around performance |
| **Random access + frequent back insertion** | `std::vector` | O(1) access + O(1) amortized insertion |
| **Frequent front/back insertion** | `std::deque` | O(1) front insertion (vector is O(n)) |
| **Frequent mid-container insert/erase** | `std::list` | O(1) splice operations |
| **Sorted data + frequent lookups** | `std::set` / `std::map` | O(log n) insert/find/erase |
| **Sorted data + infrequent changes** | Sorted `std::vector` + binary search | Better cache performance than set |
| **Fixed size known at compile time** | `std::array` | Stack allocation, zero overhead |
| **Frequent sorting** | `std::vector` + `std::sort` | Best cache locality for sorting |
| **Iterator stability required** | `std::list` / `std::deque` | Vector invalidates on reallocation |

**When to Use std::vector:**

| Scenario | Reason | Performance Benefit |
|----------|--------|---------------------|
| ✅ **Sequential access patterns** | Contiguous memory = optimal cache usage | 10-100x faster than linked lists |
| ✅ **Mostly read, infrequent writes** | Fast iteration, rare invalidation | Best read performance |
| ✅ **Appending to end** | Amortized O(1) push_back | Matches most growth patterns |
| ✅ **Random access required** | O(1) indexing | Cannot do with list/forward_list |
| ✅ **Memory efficiency critical** | Zero per-element overhead | Minimal memory waste |
| ✅ **SIMD/vectorization needed** | Contiguous layout enables SIMD | Compiler auto-vectorization |
| ✅ **Sorting required** | std::sort requires random-access | O(n log n) with best cache performance |

**When NOT to Use std::vector:**

| Scenario | Problem | Better Alternative |
|----------|---------|-------------------|
| ❌ **Frequent insertions at front** | O(n) per insertion | `std::deque` (O(1) front insertion) |
| ❌ **Frequent mid-container insertions** | O(n) element shifts | `std::list` (O(1) splice) |
| ❌ **Iterator/pointer stability critical** | Reallocation invalidates all | `std::list`, `std::deque` |
| ❌ **Large objects + frequent reallocation** | Expensive moves during reallocation | Store pointers (`vector<unique_ptr<T>>`) |
| ❌ **Fixed size at compile time** | Runtime overhead unnecessary | `std::array` |
| ❌ **Associative lookup required** | O(n) linear search | `std::map`, `std::unordered_map` |

**Code Example - Vector vs List Performance:**

```cpp
#include <vector>
#include <list>
#include <chrono>
#include <iostream>

template<typename Container>
void benchmark_iteration(const Container& c, const std::string& name) {
    auto start = std::chrono::high_resolution_clock::now();

    long long sum = 0;
    for (const auto& val : c) {
        sum += val;
    }

    auto end = std::chrono::high_resolution_clock::now();
    auto duration = std::chrono::duration_cast<std::chrono::microseconds>(end - start);

    std::cout << name << ": " << duration.count() << " μs (sum=" << sum << ")\n";
}

int main() {
    const int N = 1000000;

    std::vector<int> vec(N);
    std::list<int> lst(N);

    // Fill with same data
    for (int i = 0; i < N; ++i) {
        vec[i] = i;
        lst.push_back(i);
    }

    std::cout << "Sequential iteration over " << N << " elements:\n";
    benchmark_iteration(vec, "std::vector");  // ✅ Typically 10-100x faster
    benchmark_iteration(lst, "std::list");    // ❌ Poor cache locality

    // Output (typical):
    // std::vector: 500 μs
    // std::list: 15000 μs (30x slower due to cache misses)
}
```

**Best Practices for High-Performance Vector Usage:**

| Practice | Benefit | When to Apply |
|----------|---------|---------------|
| **Use `reserve()` before batch insertions** | Eliminates reallocations | When final size is known or estimable |
| **Use `emplace_back()` over `push_back()`** | Avoids temporary objects | With complex types |
| **Mark move constructors `noexcept`** | Enables move-during-reallocation | Always (for movable types) |
| **Use `shrink_to_fit()` after significant shrinkage** | Reclaims wasted memory | After removing many elements |
| **Prefer algorithms over raw loops** | Compiler optimizations + clarity | For standard operations |
| **Use `const` iterators when read-only** | Prevents accidental modification | Read-only traversal |
| **Avoid `erase()` in loops, use erase-remove idiom** | O(n) vs O(n²) complexity | Removing multiple elements |
| **Store pointers for large objects** | Cheaper moves during reallocation | Objects >64 bytes |

**Summary - Vector Decision Tree:**

```
Need dynamic sequential container?
├─ YES → Continue
└─ NO → Consider std::array (fixed size)

Need frequent insertion/deletion at front?
├─ YES → Use std::deque
└─ NO → Continue

Need frequent insertion/deletion in middle?
├─ YES → Use std::list (or reconsider design)
└─ NO → Continue

Need iterator/pointer stability across modifications?
├─ YES → Use std::list or std::deque
└─ NO → Continue

Need associative lookup (key-value)?
├─ YES → Use std::map or std::unordered_map
└─ NO → ✅ Use std::vector (default choice)
```

---

### EDGE_CASES: Tricky Scenarios and Deep Internals

#### Edge Case 1: Iterator Invalidation on Reallocation

Iterator invalidation is one of the most dangerous pitfalls when working with vectors. When push_back causes a reallocation, all existing iterators, pointers, and references to vector elements become invalid because the entire data is moved to a new memory location.

```cpp
std::vector<int> v = {1, 2, 3};
int* ptr = &v[0];  // Pointer to first element
auto it = v.begin();

v.push_back(4);  // ❌ May reallocate, invalidating ptr and it

// Accessing ptr or it here is undefined behavior
std::cout << *ptr;  // ❌ Dangling pointer
std::cout << *it;   // ❌ Invalid iterator
```

This code demonstrates undefined behavior. If the push_back triggers reallocation, both the pointer and iterator become dangling. The program may crash, print garbage values, or appear to work correctly (the most dangerous outcome). Always check capacity before relying on iterator/pointer stability, or use reserve() to preallocate sufficient space.

#### Edge Case 2: Reserve vs Resize Confusion

A common mistake is confusing reserve() with resize(). Reserve only allocates memory without creating actual elements, while resize changes the logical size by constructing or destroying elements.

```cpp
std::vector<int> v;
v.reserve(10);  // ✅ Allocates space for 10 elements
// v.size() is still 0

v[5] = 100;  // ❌ Undefined behavior - accessing uninitialized memory

v.resize(10);  // ✅ Creates 10 default-initialized elements
v[5] = 100;    // ✅ Now safe
```

Reserve is useful for performance optimization when you know the eventual size, preventing multiple reallocations. Resize actually creates elements, making them accessible. Attempting to access indices beyond size() even after reserve() is undefined behavior.

#### Edge Case 3: The Erase-Remove Idiom

Removing elements by value from a vector requires the erase-remove idiom because erase() works with iterators, not values.

```cpp
std::vector<int> v = {1, 2, 3, 2, 4, 2, 5};

// ❌ Wrong approach - only removes first occurrence
v.erase(std::find(v.begin(), v.end(), 2));

// ✅ Correct - removes all occurrences
v.erase(std::remove(v.begin(), v.end(), 2), v.end());
```

The remove algorithm moves elements to be kept to the front and returns an iterator to the new logical end. Erase then removes the "garbage" elements from that point to the actual end. This pattern is O(n) and doesn't cause multiple reallocations like repeated erase calls would.

#### Edge Case 4: Modifying Vector During Iteration

Modifying a vector's size during iteration leads to iterator invalidation and undefined behavior.

```cpp
std::vector<int> v = {1, 2, 3, 4, 5};

// ❌ Dangerous - modifying during iteration
for (auto it = v.begin(); it != v.end(); ++it) {
    if (*it % 2 == 0) {
        v.erase(it);  // Invalidates it
    }
}

// ✅ Correct approach
for (auto it = v.begin(); it != v.end(); ) {
    if (*it % 2 == 0) {
        it = v.erase(it);  // erase returns next valid iterator
    } else {
        ++it;
    }
}
```

The erase operation returns an iterator to the element following the erased one, allowing safe iteration. The incorrect version tries to increment an invalidated iterator, causing undefined behavior.

#### Edge Case 5: Capacity Never Decreases Automatically

Vector capacity never shrinks automatically, even after clear() or erase operations. This can lead to memory waste.

```cpp
std::vector<int> v(1000000);  // Large vector
std::cout << v.capacity();    // 1000000

v.clear();                    // Destroys all elements
std::cout << v.size();        // 0
std::cout << v.capacity();    // ❌ Still 1000000

// ✅ Shrink to fit (hint to implementation)
v.shrink_to_fit();  // Request capacity reduction
// Note: shrink_to_fit is non-binding
```

To truly reclaim memory, you can use the swap idiom or shrink_to_fit(). However, shrink_to_fit() is only a request; the implementation may choose not to reduce capacity.

---

### CODE_EXAMPLES: Practical Demonstrations

#### Example 1: Basic Vector Operations and Growth

```cpp
#include <vector>
#include <iostream>

int main() {
    std::vector<int> v;
    
    std::cout << "Size: " << v.size() << ", Capacity: " << v.capacity() << "\n";
    
    v.push_back(10);  // ✅ First element
    std::cout << "Size: " << v.size() << ", Capacity: " << v.capacity() << "\n";
    
    v.push_back(20);  // May trigger reallocation
    v.push_back(30);
    std::cout << "Size: " << v.size() << ", Capacity: " << v.capacity() << "\n";
    
    // Capacity grows geometrically (typically 2x or 1.5x)
}
```

This example demonstrates vector's automatic memory management. Initially, size and capacity are 0. After the first push_back, capacity becomes at least 1. Subsequent insertions may trigger geometric growth, with capacity typically doubling. This ensures amortized O(1) push_back performance.

#### Example 2: Preallocating Memory with Reserve

```cpp
#include <vector>
#include <iostream>

int main() {
    std::vector<int> v1, v2;
    
    // ❌ Without reserve - multiple reallocations
    for (int i = 0; i < 10000; ++i) {
        v1.push_back(i);  // May reallocate many times
    }
    
    // ✅ With reserve - single allocation
    v2.reserve(10000);
    for (int i = 0; i < 10000; ++i) {
        v2.push_back(i);  // No reallocations
    }
}
```

Using reserve() when you know the approximate final size eliminates multiple reallocations, improving performance significantly. This is especially important for large vectors or in performance-critical code. The first loop may trigger log₂(10000) ≈ 14 reallocations, while the second triggers only one.

#### Example 3: Iterator Invalidation Prevention

```cpp
#include <vector>

int main() {
    std::vector<int> v = {1, 2, 3};
    
    v.reserve(100);  // ✅ Preallocate to prevent reallocation
    
    auto it = v.begin();
    int* ptr = &v[0];
    
    for (int i = 0; i < 50; ++i) {
        v.push_back(i);  // ✅ Safe - no reallocation
    }
    
    // it and ptr remain valid because capacity was sufficient
    std::cout << *it << " " << *ptr << "\n";
}
```

By reserving sufficient capacity upfront, we guarantee that subsequent push_back operations won't trigger reallocation. This keeps all iterators and pointers valid throughout the insertion loop, enabling patterns that would otherwise be unsafe.

#### Example 4: Efficient Element Removal

```cpp
#include <vector>
#include <algorithm>

int main() {
    std::vector<int> v = {1, 2, 3, 2, 4, 2, 5};
    
    // Remove all elements equal to 2
    auto new_end = std::remove(v.begin(), v.end(), 2);
    v.erase(new_end, v.end());
    
    // Now v contains: {1, 3, 4, 5}
    
    // Alternative: remove_if with lambda
    v.erase(
        std::remove_if(v.begin(), v.end(), 
            [](int x) { return x % 2 == 0; }),
        v.end()
    );
}
```

The erase-remove idiom efficiently removes elements matching a criterion. The remove algorithm partitions the vector, moving kept elements to the front, then erase removes the unwanted tail. This approach is O(n) and avoids the O(n²) complexity of repeatedly calling erase.

#### Example 5: Vector of Vectors (2D Container)

```cpp
#include <vector>

int main() {
    // Create a 3x4 matrix
    std::vector<std::vector<int>> matrix(3, std::vector<int>(4, 0));
    
    // Access elements
    matrix[0][0] = 1;
    matrix[1][2] = 5;
    
    // Rows can have different sizes (jagged array)
    matrix[0].push_back(10);  // ✅ First row now has 5 elements
    
    // Iterate through 2D vector
    for (const auto& row : matrix) {
        for (int val : row) {
            std::cout << val << " ";
        }
        std::cout << "\n";
    }
}
```

Vectors can be nested to create multidimensional containers. Unlike arrays, each inner vector can have different sizes, enabling flexible data structures. However, memory is not contiguous across rows, which can impact cache performance for large datasets.

#### Example 6: Move Semantics with Vector

```cpp
#include <vector>
#include <string>

int main() {
    std::vector<std::string> v1 = {"hello", "world"};
    
    // ❌ Copy construction - expensive
    std::vector<std::string> v2 = v1;
    
    // ✅ Move construction - O(1) pointer swap
    std::vector<std::string> v3 = std::move(v1);
    // v1 is now in valid but unspecified state
    
    // ✅ Move semantics in push_back
    std::string str = "temporary";
    v3.push_back(std::move(str));  // Move instead of copy
}
```

Move semantics allow efficient transfer of ownership. Moving a vector is O(1) as it only swaps internal pointers, unlike copying which requires allocating new memory and copying all elements. Using std::move explicitly enables move semantics for lvalues.

#### Example 7: Emplace vs Push Back

```cpp
#include <vector>
#include <string>

struct Person {
    std::string name;
    int age;
    
    Person(std::string n, int a) : name(std::move(n)), age(a) {
        std::cout << "Constructed: " << name << "\n";
    }
};

int main() {
    std::vector<Person> v;
    
    // ❌ push_back - creates temporary then moves
    v.push_back(Person("Alice", 30));  // 1 construction + 1 move
    
    // ✅ emplace_back - constructs in place
    v.emplace_back("Bob", 25);  // 1 construction only
}
```

Emplace_back constructs the element directly in the vector's memory using perfect forwarding, avoiding the creation of temporaries. This is more efficient than push_back when the element type has expensive move or copy operations.

#### Example 8: Custom Allocator Usage

```cpp
#include <vector>
#include <memory>

template<typename T>
struct LoggingAllocator {
    using value_type = T;
    
    T* allocate(std::size_t n) {
        std::cout << "Allocating " << n << " elements\n";
        return static_cast<T*>(::operator new(n * sizeof(T)));
    }
    
    void deallocate(T* p, std::size_t n) {
        std::cout << "Deallocating " << n << " elements\n";
        ::operator delete(p);
    }
};

int main() {
    std::vector<int, LoggingAllocator<int>> v;
    v.push_back(1);
    v.push_back(2);
    v.push_back(3);
    // Observe allocation patterns
}
```

Custom allocators give fine-grained control over memory management. This example logs all allocations and deallocations, useful for debugging memory usage patterns or implementing memory pools for performance optimization.

---

### QUICK_REFERENCE: Answer Key and Summary Tables

#### Vector Operations Complexity Summary

| Operation | Time Complexity | Notes |
|-----------|-----------------|-------|
| Access by index `[]` | O(1) | Direct memory access |
| `at()` | O(1) | With bounds checking |
| `push_back()` | O(1) amortized | O(n) worst case on reallocation |
| `pop_back()` | O(1) | Removes last element |
| `insert()` at beginning | O(n) | All elements shift |
| `insert()` in middle | O(n) | Elements after shift |
| `erase()` at beginning | O(n) | All elements shift |
| `erase()` in middle | O(n) | Elements after shift |
| `clear()` | O(n) | Destroys n elements |
| `resize()` | O(n) | Constructs/destroys elements |
| `reserve()` | O(n) | If reallocation needed |

#### Vector vs Other Containers Quick Comparison

| Feature | vector | list | deque | array |
|---------|--------|------|-------|-------|
| Contiguous Memory | ✅ Yes | ❌ No | ❌ No | ✅ Yes |
| Random Access | ✅ O(1) | ❌ O(n) | ✅ O(1) | ✅ O(1) |
| Insert Front | ❌ O(n) | ✅ O(1) | ✅ O(1) | ❌ N/A |
| Insert Back | ✅ O(1)* | ✅ O(1) | ✅ O(1) | ❌ N/A |
| Insert Middle | ❌ O(n) | ✅ O(1) | ❌ O(n) | ❌ N/A |
| Iterator Stability | ❌ Poor | ✅ Good | ❌ Moderate | ✅ Perfect |
| Memory Overhead | Low | High | Moderate | None |
| Cache Performance | ✅ Best | ❌ Worst | ❌ Moderate | ✅ Best |
| Dynamic Size | ✅ Yes | ✅ Yes | ✅ Yes | ❌ No |

#### Common Vector Pitfalls and Solutions

| Pitfall | Problem | Solution |
|---------|---------|----------|
| Using invalidated iterators | Iterators become dangling after reallocation | Use `reserve()` or update iterators from return values |
| `reserve()` vs `resize()` confusion | Accessing reserved but uninitialized elements | Use `resize()` to create accessible elements |
| Excessive reallocations | Multiple memory allocations hurt performance | Call `reserve()` with expected size upfront |
| Forgetting to check `at()` exceptions | Uncaught `out_of_range` exception | Use try-catch or validate indices before access |
| Modifying during iteration | Invalidates iterators mid-loop | Update iterator from `erase()` return value |
| Storing pointers to elements | Pointers invalidated on reallocation | Store indices or use stable containers like `list` |
| Not using move semantics | Unnecessary copies of expensive objects | Use `std::move()` or `emplace_back()` |
| `vector<bool>` assumptions | Proxy references break expectations | Use `vector<char>` or `bitset` instead |

#### Best Practices Summary

| Practice | Benefit | When to Use |
|----------|---------|-------------|
| Use `reserve()` when size known | Prevents reallocations | Before batch insertions |
| Prefer `emplace_back()` | Avoids temporary objects | With complex types |
| Use `shrink_to_fit()` after size reduction | Reclaims unused memory | After significant size decrease |
| Mark move constructors `noexcept` | Better exception safety | Always for movable types |
| Use `const_iterator` when not modifying | Prevents accidental changes | Read-only traversal |
| Prefer range-based for loops | Cleaner, safer code | When not modifying structure |
| Use algorithms instead of raw loops | Clearer intent, optimized | For standard operations |
| Check `empty()` before `front()`/`back()` | Avoids undefined behavior | When size uncertain |
