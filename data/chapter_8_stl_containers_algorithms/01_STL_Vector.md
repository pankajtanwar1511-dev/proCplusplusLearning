# STL Containers: std::vector

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

### INTERVIEW_QA: Core Concepts and Deep Dive

#### Q1: Explain the internal memory structure of std::vector and how it manages growth.
**Difficulty:** #beginner
**Category:** #memory_management #internals
**Concepts:** #dynamic_array #capacity #reallocation #geometric_growth

**Answer:**
std::vector maintains three pointers: one to the start of allocated memory, one to the end of valid elements (size), and one to the end of allocated space (capacity). When elements are added beyond capacity, vector allocates a new larger block (typically 1.5x or 2x current capacity), moves/copies existing elements, and deallocates the old block.

**Explanation:**
The geometric growth strategy ensures amortized O(1) insertion time. If capacity grew linearly (e.g., +1 each time), inserting n elements would require O(n²) copy operations. With geometric growth, only O(log n) reallocations occur, each copying progressively larger chunks, resulting in O(n) total work for n insertions, thus amortized O(1) per insertion.

**Key takeaway:** Vector's geometric growth strategy trades some memory overhead for efficient amortized constant-time insertions.

---

#### Q2: What is the difference between size() and capacity() in std::vector?
**Difficulty:** #beginner
**Category:** #memory_management #api
**Concepts:** #size #capacity #memory_allocation

**Answer:**
size() returns the number of elements currently stored in the vector, while capacity() returns the total number of elements that can be stored in the currently allocated memory before reallocation is needed.

**Explanation:**
Capacity is always greater than or equal to size. When size equals capacity and a new element is added, the vector must reallocate. You can access elements from index 0 to size()-1, but accessing indices from size() to capacity()-1 is undefined behavior, even though memory is allocated.

**Key takeaway:** Capacity represents allocated memory, size represents valid elements; only access elements within [0, size()).

---

#### Q3: When and why would you use reserve()?
**Difficulty:** #beginner
**Category:** #performance #optimization
**Concepts:** #reserve #preallocation #iterator_stability

**Answer:**
Use reserve() when you know approximately how many elements the vector will hold. It preallocates memory to that capacity, avoiding multiple reallocations during subsequent insertions.

**Code example:**
```cpp
std::vector<int> v;
v.reserve(1000);  // ✅ Preallocate
for (int i = 0; i < 1000; ++i) {
    v.push_back(i);  // No reallocations
}
```

**Explanation:**
Without reserve, inserting 1000 elements may trigger ~10 reallocations (log₂(1000)). Each reallocation involves allocating new memory, copying all existing elements, and deallocating old memory. Reserve eliminates this overhead, improving performance and maintaining iterator/pointer validity throughout insertions.

**Key takeaway:** Use reserve() for known sizes to optimize performance and prevent iterator invalidation.

---

#### Q4: Explain iterator invalidation rules for std::vector.
**Difficulty:** #intermediate
**Category:** #iterators #memory_management
**Concepts:** #iterator_invalidation #reallocation #insert #erase

**Answer:**
push_back invalidates all iterators if reallocation occurs. insert() and erase() invalidate iterators at and after the modification point. clear() invalidates all iterators. reserve() invalidates all if reallocation occurs.

**Code example:**
```cpp
std::vector<int> v = {1, 2, 3};
auto it = v.begin();
v.push_back(4);  // ❌ May invalidate it
// Using it here is UB if reallocation occurred
```

**Explanation:**
Reallocation moves all elements to new memory, making all existing iterators, pointers, and references dangle. Even without reallocation, insert/erase operations shift elements, invalidating iterators to shifted positions. Always update iterators after modifying operations or use return values from erase().

**Key takeaway:** Assume iterators are invalidated by any size-changing operation unless you've guaranteed sufficient capacity.

---

#### Q5: What happens when you access an element beyond vector's size using operator[]?
**Difficulty:** #beginner
**Category:** #safety #undefined_behavior
**Concepts:** #bounds_checking #operator_bracket #at_method

**Answer:**
Using operator[] with an out-of-bounds index is undefined behavior. It doesn't perform bounds checking and may access invalid memory, crash, or return garbage values.

**Code example:**
```cpp
std::vector<int> v = {1, 2, 3};
int x = v[10];  // ❌ Undefined behavior
int y = v.at(10);  // ✅ Throws std::out_of_range
```

**Explanation:**
operator[] is designed for performance and trusts the programmer to provide valid indices. The at() method performs bounds checking and throws an exception for invalid indices, making it safer but slightly slower. In production code, always validate indices or use at() when bounds aren't guaranteed.

**Key takeaway:** operator[] is fast but unsafe; use at() when you need bounds checking.

---

#### Q6: How does std::vector handle object destruction when it's destroyed or cleared?
**Difficulty:** #intermediate
**Category:** #memory_management #raii
**Concepts:** #destructors #clear #resource_management

**Answer:**
When a vector is destroyed or clear() is called, it calls the destructor for each element in reverse order, then deallocates the memory. This follows RAII principles, ensuring proper resource cleanup.

**Explanation:**
Vector guarantees that element destructors are called even if exceptions occur during destruction. This is crucial for managing resources like file handles or dynamic memory. However, clear() destroys all elements but maintains capacity; the memory remains allocated. To deallocate memory, use shrink_to_fit() or swap with an empty vector.

**Key takeaway:** Vector ensures proper RAII cleanup by destroying elements before deallocating memory.

---

#### Q7: What is the erase-remove idiom and why is it necessary?
**Difficulty:** #intermediate
**Category:** #algorithms #idioms
**Concepts:** #erase #remove #algorithm_efficiency

**Answer:**
The erase-remove idiom combines std::remove (which partitions elements) with vector::erase (which removes the tail) to efficiently remove elements matching a criterion.

**Code example:**
```cpp
v.erase(std::remove(v.begin(), v.end(), value), v.end());
```

**Explanation:**
std::remove doesn't actually remove elements; it moves elements-to-keep to the front and returns an iterator to the new logical end. The remaining elements are in an unspecified state. erase() then truncates the vector from that point. This is O(n) versus O(n²) for repeatedly calling erase, which shifts elements multiple times.

**Key takeaway:** Use erase-remove idiom for O(n) removal of multiple elements instead of iterative erase.

---

#### Q8: Explain the difference between push_back and emplace_back.
**Difficulty:** #intermediate
**Category:** #performance #api
**Concepts:** #emplace #perfect_forwarding #move_semantics #construction

**Answer:**
push_back takes an object (lvalue or rvalue) and copies or moves it into the vector. emplace_back takes constructor arguments and constructs the object directly in the vector's memory using perfect forwarding.

**Code example:**
```cpp
std::vector<std::pair<int, std::string>> v;
v.push_back({1, "hello"});  // Creates temp pair, then moves
v.emplace_back(2, "world"); // Constructs pair in-place
```

**Explanation:**
emplace_back avoids creating temporary objects, reducing copy/move operations. It forwards arguments directly to the element's constructor. For simple types, the difference is negligible, but for complex types with expensive construction, emplace_back offers significant performance benefits.

**Key takeaway:** Use emplace_back with constructor arguments to avoid temporary object creation.

---

#### Q9: Can you safely store pointers to vector elements? Why or why not?
**Difficulty:** #intermediate
**Category:** #memory_management #safety
**Concepts:** #pointer_stability #reallocation #iterator_invalidation

**Answer:**
No, storing pointers to vector elements is unsafe because reallocation invalidates all pointers. Only store pointers if you've reserved sufficient capacity to prevent reallocation.

**Code example:**
```cpp
std::vector<int> v = {1, 2, 3};
int* ptr = &v[0];
v.push_back(4);  // ❌ May reallocate, ptr now dangling
```

**Explanation:**
Any operation causing reallocation (push_back, insert, resize) moves all elements to new memory, leaving pointers dangling. If you must store pointers, use reserve() to guarantee capacity, or consider std::list for stable references, or store indices instead of pointers.

**Key takeaway:** Vector elements don't have stable addresses; avoid storing pointers unless capacity is guaranteed.

---

#### Q10: What is the time complexity of inserting an element at the beginning of a vector?
**Difficulty:** #beginner
**Category:** #performance #complexity
**Concepts:** #insert #time_complexity #data_movement

**Answer:**
Inserting at the beginning of a vector is O(n) where n is the number of elements, because all existing elements must be shifted one position to the right.

**Explanation:**
Vector's contiguous memory layout means inserting anywhere except the end requires moving all subsequent elements. For the first position, all n elements must shift. If frequent insertions at the front are needed, consider std::deque (O(1) front insertion) or std::list instead.

**Key takeaway:** Vector is optimized for back insertion; front insertion is O(n) due to element shifting.

---

#### Q11: How does shrink_to_fit() work and is it guaranteed to reduce capacity?
**Difficulty:** #intermediate
**Category:** #memory_management #optimization
**Concepts:** #shrink_to_fit #capacity_reduction #non_binding_request

**Answer:**
shrink_to_fit() is a non-binding request to reduce capacity to match size. The implementation may ignore it, and there's no guarantee capacity will decrease.

**Code example:**
```cpp
std::vector<int> v(1000);
v.resize(10);
v.shrink_to_fit();  // Request capacity reduction, not guaranteed
```

**Explanation:**
The standard allows implementations to ignore shrink_to_fit() for performance or implementation reasons. To guarantee capacity reduction, use the swap idiom: `std::vector<int>(v).swap(v);` which creates a temporary vector sized exactly to v's size and swaps it with v.

**Key takeaway:** shrink_to_fit() is a hint, not a command; use swap idiom for guaranteed capacity reduction.

---

#### Q12: What is the difference between vector initialization with parentheses vs braces?
**Difficulty:** #intermediate
**Category:** #syntax #initialization
**Concepts:** #uniform_initialization #constructor_overloading #initializer_list

**Answer:**
Parentheses call specific constructors based on argument types. Braces prefer initializer_list constructors, falling back to other constructors only if no initializer_list match exists.

**Code example:**
```cpp
std::vector<int> v1(10, 1);   // ✅ 10 elements, each value 1
std::vector<int> v2{10, 1};   // ✅ 2 elements: 10 and 1
std::vector<int> v3(10);      // ✅ 10 default-initialized elements
std::vector<int> v4{10};      // ✅ 1 element with value 10
```

**Explanation:**
The initializer_list constructor is preferred with brace initialization when applicable. This can lead to surprising behavior. For count-value construction, use parentheses. For element listing, use braces. This is a common source of bugs in C++11 and later.

**Key takeaway:** Use parentheses for count/value construction, braces for element lists.

---

#### Q13: Explain the performance implications of vector reallocations.
**Difficulty:** #intermediate
**Category:** #performance #memory_management
**Concepts:** #reallocation #geometric_growth #cache_locality #copy_cost

**Answer:**
Reallocations are expensive because they involve allocating new memory, copying/moving all existing elements, and deallocating old memory. This is O(n) for n elements but occurs infrequently due to geometric growth.

**Explanation:**
Each reallocation doubles (or multiplies by 1.5) the capacity, ensuring only O(log n) reallocations for n insertions. Total work across all reallocations is O(n), making individual insertions amortized O(1). However, elements must be copyable or movable; move-only types are more efficient. Large objects or types with expensive copy/move operations suffer more from reallocations.

**Key takeaway:** Reallocations are O(n) but occur logarithmically, resulting in amortized O(1) insertion cost.

---

#### Q14: Can std::vector be used with non-copyable, non-movable types?
**Difficulty:** #advanced
**Category:** #type_requirements #move_semantics
**Concepts:** #copyable #movable #type_traits #emplacement

**Answer:**
No, vector elements must be at least movable because reallocations require transferring elements to new memory. Types must satisfy MoveInsertable or CopyInsertable requirements.

**Code example:**
```cpp
struct NonMovable {
    NonMovable() = default;
    NonMovable(const NonMovable&) = delete;
    NonMovable(NonMovable&&) = delete;
};

std::vector<NonMovable> v;
v.emplace_back();  // ✅ Constructs in place
v.push_back(NonMovable());  // ❌ Requires move/copy
v.reserve(10);
v.emplace_back();  // ✅ Safe if no reallocation
```

**Explanation:**
emplace_back can construct non-movable types in-place if capacity is sufficient. However, any operation causing reallocation fails because vector can't relocate non-movable elements. Use reserve() to prevent reallocations, or consider storing pointers/smart pointers instead.

**Key takeaway:** Vector requires elements to be at least movable; use reserve() and emplace for non-movable types.

---

#### Q15: What is the std::vector<bool> specialization and why is it controversial?
**Difficulty:** #advanced
**Category:** #specialization #design_controversy
**Concepts:** #vector_bool #space_optimization #proxy_references

**Answer:**
std::vector<bool> is specialized to store bits compactly (typically 8 bools per byte) rather than one bool per byte. It returns proxy objects instead of references, breaking normal vector semantics.

**Code example:**
```cpp
std::vector<bool> v = {true, false, true};
auto& ref = v[0];  // ❌ Not actually a reference, it's a proxy
bool* ptr = &v[0]; // ❌ Compile error - can't take address
```

**Explanation:**
The specialization trades space for semantic consistency. Proxy objects emulate references but don't support all operations (like taking addresses). This breaks generic code expecting normal vector behavior. Many consider this a design mistake; modern alternatives include std::bitset or std::vector<char> for boolean storage.

**Key takeaway:** vector<bool> is a special case that sacrifices reference semantics for space efficiency; avoid in generic code.

---

#### Q16: How can you efficiently concatenate two vectors?
**Difficulty:** #intermediate
**Category:** #algorithms #performance
**Concepts:** #insert #move_semantics #reserve #concatenation

**Answer:**
Use insert with iterators or move semantics for efficient concatenation. Reserve space first to avoid reallocations.

**Code example:**
```cpp
std::vector<int> v1 = {1, 2, 3};
std::vector<int> v2 = {4, 5, 6};

// ✅ Efficient with reserve
v1.reserve(v1.size() + v2.size());
v1.insert(v1.end(), v2.begin(), v2.end());

// ✅ Move elements from v2 (v2 becomes empty)
v1.reserve(v1.size() + v2.size());
v1.insert(v1.end(), 
          std::make_move_iterator(v2.begin()),
          std::make_move_iterator(v2.end()));
```

**Explanation:**
Reserving space before insertion prevents reallocations. Using move_iterators transfers ownership from v2 to v1, avoiding copies for move-enabled types. Without reserve, insert might reallocate multiple times if v1's capacity is insufficient.

**Key takeaway:** Reserve before concatenation and use move iterators for move-enabled types.

---

#### Q17: What happens when a vector goes out of scope?
**Difficulty:** #beginner
**Category:** #raii #memory_management
**Concepts:** #destructor #automatic_cleanup #resource_management

**Answer:**
The vector's destructor is automatically called, which destroys all elements in reverse order and then deallocates the memory. This follows RAII principles.

**Explanation:**
Vector's destructor ensures proper cleanup without manual intervention. Each element's destructor is called, allowing proper release of resources managed by elements (files, memory, locks). After element destruction, the vector deallocates its internal buffer. This automatic cleanup is exception-safe and works correctly even if constructors or destructors throw.

**Key takeaway:** Vector automatically manages element destruction and memory deallocation through RAII.

---

#### Q18: Explain the difference between assign() and operator=.
**Difficulty:** #intermediate
**Category:** #api #assignment
**Concepts:** #assign #copy_assignment #container_modification

**Answer:**
operator= performs copy or move assignment from another vector. assign() replaces contents with a specified range or repeated values, offering more flexibility.

**Code example:**
```cpp
std::vector<int> v1 = {1, 2, 3};
std::vector<int> v2;

v2 = v1;  // ✅ Copy assignment
v2.assign(v1.begin(), v1.end());  // ✅ Assign from range
v2.assign(10, 42);  // ✅ Assign 10 elements, each value 42
v2.assign({1, 2, 3, 4});  // ✅ Assign from initializer list
```

**Explanation:**
assign() is more versatile, allowing initialization from ranges, repeated values, or initializer lists. It destroys existing elements and constructs new ones. operator= with another vector copies or moves all elements and potentially the allocator, while assign() never propagates allocators.

**Key takeaway:** Use assign() for flexible content replacement from various sources; use operator= for vector-to-vector assignment.

---

#### Q19: How does vector handle move-only types like unique_ptr?
**Difficulty:** #advanced
**Category:** #move_semantics #smart_pointers
**Concepts:** #unique_ptr #move_only #rvalue_references

**Answer:**
Vector can store move-only types like unique_ptr because reallocation uses move semantics. Elements must be moved, not copied, during reallocation.

**Code example:**
```cpp
std::vector<std::unique_ptr<int>> v;
v.push_back(std::make_unique<int>(42));  // ✅ Move into vector
v.emplace_back(new int(10));  // ✅ Construct in place

// ❌ Can't copy vector of move-only types
// auto v2 = v;  // Compile error

// ✅ Can move
auto v2 = std::move(v);  // Transfers ownership
```

**Explanation:**
Move-only types prevent copying but allow moving. Vector's reallocation uses move construction when possible, making it compatible with unique_ptr. However, the vector itself becomes non-copyable (can only be moved). This ensures unique ownership semantics are maintained throughout container operations.

**Key takeaway:** Vector supports move-only types through move semantics during reallocation.

---

#### Q20: What is the return type of vector::begin() and how does it differ in const contexts?
**Difficulty:** #intermediate
**Category:** #iterators #const_correctness
**Concepts:** #iterator_types #const_iterator #mutability

**Answer:**
Non-const vectors return iterator (allowing modification). Const vectors return const_iterator (read-only access). You can also explicitly request const_iterator using cbegin().

**Code example:**
```cpp
std::vector<int> v = {1, 2, 3};
const std::vector<int> cv = {4, 5, 6};

auto it = v.begin();    // iterator - can modify
*it = 10;  // ✅ OK

auto cit = cv.begin();  // const_iterator - read only
*cit = 20;  // ❌ Compile error

auto cit2 = v.cbegin(); // ✅ Explicitly get const_iterator
```

**Explanation:**
This follows const-correctness principles. Const vectors can't return modifiable iterators as that would violate const guarantees. Using cbegin() explicitly requests const_iterator even on non-const vectors, useful in algorithms where modification isn't needed and prevents accidental changes.

**Key takeaway:** Iterator type depends on vector's const-ness; use cbegin() for explicit const iteration.

---

#### Q21: Explain memory overhead per element in std::vector.
**Difficulty:** #intermediate
**Category:** #memory_management #performance
**Concepts:** #memory_overhead #capacity #alignment

**Answer:**
Vector has minimal per-element overhead (just the element size), but total overhead includes three pointers (24 bytes on 64-bit) for the vector object itself, plus potential unused capacity.

**Explanation:**
Unlike node-based containers (list, map) that store pointers with each element, vector stores elements contiguously with no per-element overhead. However, the vector object itself stores begin, end, and capacity pointers. Geometric growth means capacity typically exceeds size by 50-100%, resulting in wasted space. For example, after inserting 101 elements into an empty vector with 2x growth, capacity is 128, wasting 27 elements worth of space.

**Key takeaway:** Vector has zero per-element overhead but may waste space due to over-allocated capacity.

---

#### Q22: What is the complexity of sorting a vector using std::sort?
**Difficulty:** #beginner
**Category:** #algorithms #complexity
**Concepts:** #sorting #time_complexity #introsort

**Answer:**
std::sort has O(n log n) average and worst-case time complexity and O(log n) space complexity due to recursion.

**Code example:**
```cpp
std::vector<int> v = {3, 1, 4, 1, 5, 9};
std::sort(v.begin(), v.end());  // O(n log n)

// Custom comparator for descending order
std::sort(v.begin(), v.end(), std::greater<int>());
```

**Explanation:**
std::sort typically uses introsort (hybrid of quicksort, heapsort, and insertion sort) which guarantees O(n log n) worst-case performance. It requires random access iterators (vector provides these) and is not stable (equal elements may be reordered). For stable sorting, use std::stable_sort.

**Key takeaway:** Vector sorting is O(n log n) with std::sort; use stable_sort if element order matters.

---

#### Q23: How can you remove duplicate elements from a sorted vector efficiently?
**Difficulty:** #intermediate
**Category:** #algorithms #optimization
**Concepts:** #unique #erase #sorted_range

**Answer:**
Use std::unique followed by erase. This is O(n) for a sorted vector because unique moves duplicates to the end.

**Code example:**
```cpp
std::vector<int> v = {1, 1, 2, 2, 3, 4, 4, 5};
auto last = std::unique(v.begin(), v.end());
v.erase(last, v.end());
// v now contains: {1, 2, 3, 4, 5}
```

**Explanation:**
std::unique removes consecutive duplicates by shifting unique elements to the front and returning an iterator to the new end. It requires a sorted range to catch all duplicates. Combined with erase, this efficiently removes duplicates in O(n) time. For unsorted vectors, sort first or use set/unordered_set.

**Key takeaway:** Use unique-erase idiom on sorted vectors for O(n) duplicate removal.

---

#### Q24: Can you partially sort a vector for better performance?
**Difficulty:** #advanced
**Category:** #algorithms #optimization
**Concepts:** #partial_sort #nth_element #optimization

**Answer:**
Yes, use std::partial_sort or std::nth_element when you only need the smallest k elements sorted, not the entire range.

**Code example:**
```cpp
std::vector<int> v = {9, 1, 8, 2, 7, 3, 6, 4, 5};

// Sort only first 3 elements
std::partial_sort(v.begin(), v.begin() + 3, v.end());
// First 3 are smallest in sorted order: {1, 2, 3}
// Rest are unordered: {9, 8, 7, 6, 5, 4}

// Find 5th smallest element
std::nth_element(v.begin(), v.begin() + 4, v.end());
// v[4] is 5th smallest, elements before are <=, after are >=
```

**Explanation:**
partial_sort is O(n log k) for k elements, faster than full O(n log n) sort when k << n. nth_element is O(n) average case and places the nth element in its sorted position with smaller elements before and larger after, useful for median finding or top-k problems without full sorting overhead.

**Key takeaway:** Use partial_sort or nth_element when full sorting is unnecessary for significant performance gains.

---

#### Q25: What are the exception safety guarantees of vector operations?
**Difficulty:** #advanced
**Category:** #exception_safety #guarantees
**Concepts:** #strong_guarantee #basic_guarantee #noexcept #exception_handling

**Answer:**
Vector provides strong exception guarantee for single-element insertion if element type has noexcept move constructor, otherwise basic guarantee. Reallocation uses move semantics when noexcept.

**Code example:**
```cpp
struct StrongMovable {
    StrongMovable(StrongMovable&&) noexcept = default;
};

struct BasicMovable {
    BasicMovable(BasicMovable&&) { /* may throw */ }
};

std::vector<StrongMovable> v1;  // Strong guarantee on push_back
std::vector<BasicMovable> v2;   // Basic guarantee on push_back
```

**Explanation:**
If move constructor is noexcept, vector can safely use moves during reallocation. If move might throw, vector uses copy (if available) for strong guarantee or move for basic guarantee. Strong guarantee means operation succeeds completely or vector is unchanged. Basic guarantee means vector is in valid but unspecified state if exception occurs. Assignment and swap are always noexcept or conditionally noexcept based on element type.

**Key takeaway:** Mark move constructors noexcept for optimal vector exception safety and performance.

---

### PRACTICE_TASKS: Output Prediction and Code Analysis

#### Q1
```cpp
std::vector<int> v;
std::cout << v.capacity() << " " << v.size();
v.reserve(10);
std::cout << " " << v.capacity() << " " << v.size();
```

#### Q2
```cpp
std::vector<int> v = {1, 2, 3, 4, 5};
v.erase(v.begin() + 2);
for (int x : v) std::cout << x << " ";
```

#### Q3
```cpp
std::vector<int> v1 = {1, 2, 3};
std::vector<int> v2 = v1;
v1[0] = 10;
std::cout << v2[0];
```

#### Q4
```cpp
std::vector<int> v(5, 10);
std::cout << v.size() << " ";
for (int x : v) std::cout << x << " ";
```

#### Q5
```cpp
std::vector<int> v{5, 10};
std::cout << v.size() << " ";
for (int x : v) std::cout << x << " ";
```

#### Q6
```cpp
std::vector<int> v = {1, 2, 3};
v.insert(v.begin() + 1, 99);
for (int x : v) std::cout << x << " ";
```

#### Q7
```cpp
std::vector<int> v = {1, 2, 3, 4, 5};
v.erase(std::remove(v.begin(), v.end(), 3), v.end());
std::cout << v.size();
```

#### Q8
```cpp
std::vector<int> v = {1, 2, 3};
v.resize(5);
std::cout << v[4];
```

#### Q9
```cpp
std::vector<int> v = {1, 2, 3, 4, 5};
v.resize(3);
std::cout << v.size() << " " << v.capacity();
```

#### Q10
```cpp
std::vector<int> v;
v.resize(10);
v[5] = 100;
std::cout << v[0] << " " << v[5];
```

#### Q11
```cpp
std::vector<int> v = {1, 2, 3};
v.clear();
std::cout << v.size() << " " << v.capacity();
```

#### Q12
```cpp
std::vector<int> v = {1, 2, 3};
auto it = v.begin();
v.push_back(4);
v.push_back(5);
// Assume reallocation occurred
std::cout << "Iterator still valid? ";
```

#### Q13
```cpp
std::vector<int> v1 = {1, 2, 3};
std::vector<int> v2 = std::move(v1);
std::cout << v1.size() << " " << v2.size();
```

#### Q14
```cpp
std::vector<int> v = {3, 1, 4, 1, 5};
std::sort(v.begin(), v.end());
for (int x : v) std::cout << x << " ";
```

#### Q15
```cpp
std::vector<int> v = {1, 2, 3};
v.emplace_back(4);
v.push_back(5);
std::cout << v.size();
```

#### Q16
```cpp
std::vector<int> v = {1, 2, 3, 4, 5};
std::reverse(v.begin(), v.end());
for (int x : v) std::cout << x << " ";
```

#### Q17
```cpp
std::vector<int> v = {1, 1, 2, 2, 3};
auto it = std::unique(v.begin(), v.end());
std::cout << (it - v.begin());
```

#### Q18
```cpp
const std::vector<int> v = {1, 2, 3};
auto it = v.begin();
*it = 10;  // Will this compile?
```

#### Q19
```cpp
std::vector<int> v = {1, 2, 3, 4, 5};
v.assign(3, 100);
std::cout << v.size() << " ";
for (int x : v) std::cout << x << " ";
```

#### Q20
```cpp
std::vector<int> v = {5, 2, 8, 1, 9};
std::partial_sort(v.begin(), v.begin() + 3, v.end());
for (int i = 0; i < 3; ++i) std::cout << v[i] << " ";
```

---

### QUICK_REFERENCE: Answer Key and Summary Tables

#### Answer Key for Practice Questions

| Q# | Answer | Explanation | Key Concept |
|----|--------|-------------|-------------|
| 1 | `0 0 10 0` | Initially size and capacity are 0. reserve(10) sets capacity to 10 but size remains 0. | #reserve #capacity |
| 2 | `1 2 4 5` | erase at index 2 removes element 3. Elements after are shifted left. | #erase #element_removal |
| 3 | `1` | v2 is a copy of v1. Modifying v1 doesn't affect v2 (deep copy). | #copy_semantics #independence |
| 4 | `5 10 10 10 10 10` | Parentheses create 5 elements, each with value 10. | #constructor #fill_initialization |
| 5 | `2 5 10` | Braces create initializer list with 2 elements: 5 and 10. | #initializer_list #brace_initialization |
| 6 | `1 99 2 3` | insert before position 1 (second element), shifting others right. | #insert #element_insertion |
| 7 | `4` | remove-erase idiom removes all 3s. Size becomes 4. | #erase_remove_idiom #size |
| 8 | `0` | resize(5) adds 2 default-initialized elements (0 for int). | #resize #default_initialization |
| 9 | `3 [original capacity ≥ 5]` | resize(3) reduces size to 3 but capacity unchanged. | #resize #capacity_preservation |
| 10 | `0 100` | resize(10) creates 10 default-initialized (0) elements. v[5]=100 then modifies. | #resize #element_access |
| 11 | `0 3` | clear() destroys all elements (size=0) but capacity remains unchanged. | #clear #capacity_preservation |
| 12 | `No, undefined behavior` | Reallocation invalidates all iterators. Using it is UB. | #iterator_invalidation #reallocation |
| 13 | `0 3` | Move leaves v1 empty (or in valid-but-unspecified state), v2 has 3 elements. | #move_semantics #ownership_transfer |
| 14 | `1 1 3 4 5` | std::sort sorts in ascending order. | #sorting #std_sort |
| 15 | `5` | Both emplace_back and push_back add one element each. Total: 5. | #emplace_back #push_back |
| 16 | `5 4 3 2 1` | std::reverse reverses elements in-place. | #reverse #algorithms |
| 17 | `3` | unique moves first occurrence of consecutive duplicates to front. Returns iterator 3 positions from begin. | #unique #duplicate_removal |
| 18 | `No, compile error` | const vector returns const_iterator. Cannot modify through it. | #const_correctness #const_iterator |
| 19 | `3 100 100 100` | assign replaces all elements with 3 copies of 100. | #assign #replacement |
| 20 | `1 2 5` | partial_sort sorts first 3 elements only. Rest unordered. | #partial_sort #optimization |

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
