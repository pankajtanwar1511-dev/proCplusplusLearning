# STL Iterators, Allocators, Algorithms, and Lambdas

## TOPIC: STL Iterators, Allocators, Algorithms, and Lambdas

---

### THEORY_SECTION: Core Concepts and Interconnections

#### 1. Iterator Categories and Tag Dispatching - Hierarchy, Operations, and Compile-Time Optimization

**Iterator Hierarchy Overview:**

Iterators are the fundamental abstraction connecting STL containers with STL algorithms, providing a uniform interface for traversing and accessing elements regardless of the underlying data structure. The STL defines **five iterator categories** forming a refinement hierarchy where each level adds capabilities:

**Iterator Category Hierarchy (Refinement Model):**

| Category | Refines | Key Operations | Containers | Algorithm Requirements |
|----------|---------|----------------|------------|------------------------|
| **Input Iterator** | - | `*it` (read), `++it`, `==`, `!=` | istream_iterator | Single-pass read algorithms (find, count) |
| **Output Iterator** | - | `*it =` (write), `++it` | ostream_iterator, back_inserter | Single-pass write algorithms (copy, fill) |
| **Forward Iterator** | Input | Multi-pass traversal | forward_list, unordered_set/map | Multi-pass algorithms (replace, search) |
| **Bidirectional Iterator** | Forward | `--it` (backward) | list, set, map | Reversible algorithms (reverse, inplace_merge) |
| **Random Access Iterator** | Bidirectional | `it + n`, `it - n`, `it[n]`, `<` | vector, deque, arrays | Direct access algorithms (sort, binary_search) |

**Detailed Operation Support:**

| Operation | Input | Output | Forward | Bidirectional | Random Access | Complexity |
|-----------|-------|--------|---------|---------------|---------------|------------|
| **`*it` (read)** | ✅ | ❌ | ✅ | ✅ | ✅ | O(1) |
| **`*it =` (write)** | ❌ | ✅ | ✅ | ✅ | ✅ | O(1) |
| **`++it` (pre-increment)** | ✅ | ✅ | ✅ | ✅ | ✅ | O(1) |
| **`it++` (post-increment)** | ✅ | ✅ | ✅ | ✅ | ✅ | O(1) |
| **`--it` (decrement)** | ❌ | ❌ | ❌ | ✅ | ✅ | O(1) |
| **`it + n`, `it - n`** | ❌ | ❌ | ❌ | ❌ | ✅ | O(1) |
| **`it[n]` (indexing)** | ❌ | ❌ | ❌ | ❌ | ✅ | O(1) |
| **`it1 < it2` (comparison)** | ❌ | ❌ | ❌ | ❌ | ✅ | O(1) |
| **`==`, `!=` (equality)** | ✅ | ❌ | ✅ | ✅ | ✅ | O(1) |
| **Multi-pass guarantee** | ❌ | ❌ | ✅ | ✅ | ✅ | N/A |

**Why Iterator Categories Matter - Algorithmic Implications:**

```cpp
// Example 1: std::distance complexity varies by category
std::vector<int> v = {1, 2, 3, 4, 5};
std::list<int> lst = {1, 2, 3, 4, 5};

auto d1 = std::distance(v.begin(), v.end());    // ✅ O(1) - random access
auto d2 = std::distance(lst.begin(), lst.end()); // ⚠️ O(N) - bidirectional

// Example 2: Algorithm requirements
std::vector<int> vec = {5, 2, 8, 1, 9};
std::list<int> list_v = {5, 2, 8, 1, 9};

std::sort(vec.begin(), vec.end());    // ✅ Works - vector has random access
// std::sort(list_v.begin(), list_v.end());  // ❌ Compile error - list only bidirectional
list_v.sort();  // ✅ Use member function optimized for bidirectional iterators
```

**Tag Dispatching - Compile-Time Optimization:**

STL algorithms use **iterator category tags** to select optimal implementations at compile time with zero runtime overhead.

**Tag Type Hierarchy:**

```cpp
// Standard iterator tag types (empty structs for compile-time dispatch)
struct input_iterator_tag { };
struct output_iterator_tag { };
struct forward_iterator_tag : public input_iterator_tag { };
struct bidirectional_iterator_tag : public forward_iterator_tag { };
struct random_access_iterator_tag : public bidirectional_iterator_tag { };
```

**Tag Dispatching in Action:**

```cpp
// Implementation: std::advance with tag dispatching

// O(N) implementation for weaker iterators
template<typename InputIt, typename Distance>
void advanceImpl(InputIt& it, Distance n, std::input_iterator_tag) {
    // ⚠️ O(N): Must increment n times
    while (n > 0) {
        ++it;
        --n;
    }
}

// O(1) implementation for random access iterators
template<typename RandomIt, typename Distance>
void advanceImpl(RandomIt& it, Distance n, std::random_access_iterator_tag) {
    // ✅ O(1): Direct pointer arithmetic
    it += n;
}

// O(N) implementation for bidirectional (supports negative n)
template<typename BiIt, typename Distance>
void advanceImpl(BiIt& it, Distance n, std::bidirectional_iterator_tag) {
    if (n >= 0) {
        while (n > 0) { ++it; --n; }
    } else {
        while (n < 0) { --it; ++n; }
    }
}

// Generic interface - compiler selects optimal implementation
template<typename Iterator, typename Distance>
void advance(Iterator& it, Distance n) {
    advanceImpl(it, n,
        typename std::iterator_traits<Iterator>::iterator_category());
}
```

**`std::iterator_traits` - Uniform Iterator Interface:**

`std::iterator_traits<T>` provides a uniform way to access iterator properties, working with both custom iterators and raw pointers.

| Type Member | Description | Example for `vector<int>::iterator` |
|-------------|-------------|-------------------------------------|
| **`value_type`** | Type of elements | `int` |
| **`difference_type`** | Type for distances | `ptrdiff_t` |
| **`pointer`** | Pointer to element | `int*` |
| **`reference`** | Reference to element | `int&` |
| **`iterator_category`** | Category tag | `random_access_iterator_tag` |

**Example Usage:**

```cpp
template<typename Iterator>
void processRange(Iterator first, Iterator last) {
    // Access iterator properties
    using value_type = typename std::iterator_traits<Iterator>::value_type;
    using diff_type = typename std::iterator_traits<Iterator>::difference_type;
    using category = typename std::iterator_traits<Iterator>::iterator_category;

    value_type sum = 0;
    diff_type count = 0;

    // Dispatch based on category
    if constexpr (std::is_same_v<category, std::random_access_iterator_tag>) {
        // ✅ O(1) distance calculation
        count = last - first;
        std::cout << "Random access: " << count << " elements\n";
    } else {
        // ⚠️ O(N) distance calculation
        count = std::distance(first, last);
        std::cout << "Weaker iterator: " << count << " elements\n";
    }
}
```

**Iterator Invalidation Rules Summary:**

| Container | `insert()` | `erase()` | `push_back()` | `push_front()` | `pop_back()` | `pop_front()` |
|-----------|-----------|-----------|---------------|----------------|--------------|---------------|
| **vector** | At/after | At/after | All if realloc, else end | N/A | End only | N/A |
| **deque** | All | All | End only | All | End only | All |
| **list** | None | Erased only | None | None | None | None |
| **forward_list** | None | Erased only | N/A | None | N/A | None |
| **set/map** | None | Erased only | N/A | N/A | N/A | N/A |
| **unordered_set/map** | All if rehash | Erased only | N/A if no rehash | N/A | N/A | N/A |

**Common Invalidation Bugs:**

```cpp
// ❌ WRONG: Iterator invalidated during modification
std::vector<int> v = {1, 2, 3, 4, 5};
for (auto it = v.begin(); it != v.end(); ++it) {
    if (*it == 3) {
        v.push_back(100);  // Reallocation invalidates it and v.end()
    }
}

// ❌ WRONG: Erasing invalidates iterator
for (auto it = v.begin(); it != v.end(); ++it) {
    if (*it % 2 == 0) {
        v.erase(it);  // it now invalid, ++it is UB
    }
}

// ✅ CORRECT: erase() returns next valid iterator
for (auto it = v.begin(); it != v.end(); ) {
    if (*it % 2 == 0) {
        it = v.erase(it);  // Update it to next element
    } else {
        ++it;
    }
}

// ✅ CORRECT: Reserve capacity to prevent reallocation
v.reserve(1000);  // No reallocation until 1000 elements
for (auto it = v.begin(); it != v.end(); ++it) {
    if (*it == 3) {
        v.push_back(100);  // Safe: no reallocation
    }
}
```

**Reverse Iterators - Base Iterator Asymmetry:**

```cpp
std::vector<int> v = {10, 20, 30, 40};
//                     ↑   ↑   ↑   ↑
// Forward iterators:  0   1   2   3
// Reverse iterators:      3   2   1   0  (rbegin points to 40)

auto rit = std::find(v.rbegin(), v.rend(), 30);  // Points to 30
std::cout << *rit;  // ✅ Prints 30

auto it = rit.base();  // Convert to forward iterator
std::cout << *it;  // ❌ Prints 40, not 30!

// Explanation: base() returns iterator ONE POSITION AFTER
// To get equivalent forward iterator:
auto equiv_it = std::prev(rit.base());  // ✅ Points to 30
std::cout << *equiv_it;  // Prints 30
```

**When to Use Each Iterator Category:**

| Use Case | Recommended Iterator | Reason |
|----------|---------------------|--------|
| **Sequential processing** | Input/Forward | Minimal operations, forward-only |
| **Buffered output** | Output | Write-only, no read needed |
| **Reversible algorithms** | Bidirectional | Need `--` for backward traversal |
| **Sorting** | Random Access | Requires `it + n` for partitioning |
| **Binary search** | Random Access (or Forward) | Best with O(1) jumps, works with O(N) |
| **Stream processing** | Input/Output | Single-pass, no storage |
| **Multi-pass algorithms** | Forward or better | Need to traverse multiple times |

---

#### 2. Allocators and Memory Management - Custom Allocation Strategies and Rebind Mechanism

**Allocator Abstraction Overview:**

Allocators provide a **policy-based abstraction** for memory allocation in STL containers, separating raw memory management from object construction. Every STL container accepts an allocator as a template parameter:

```cpp
template<typename T, typename Alloc = std::allocator<T>>
class vector { ... };

template<typename Key, typename T,
         typename Compare = std::less<Key>,
         typename Alloc = std::allocator<std::pair<const Key, T>>>
class map { ... };
```

**Default Allocator:**

`std::allocator<T>` is the default allocator that simply wraps global `new` and `delete`:

```cpp
template<typename T>
class allocator {
public:
    using value_type = T;

    T* allocate(std::size_t n) {
        return static_cast<T*>(::operator new(n * sizeof(T)));
    }

    void deallocate(T* p, std::size_t n) {
        ::operator delete(p);
    }
};
```

**Allocator Required Interface:**

| Member | Purpose | Required? | Description |
|--------|---------|-----------|-------------|
| **`value_type`** | Element type | ✅ Yes | Type being allocated |
| **`allocate(n)`** | Allocate memory | ✅ Yes | Returns pointer to memory for n objects |
| **`deallocate(p, n)`** | Free memory | ✅ Yes | Deallocates memory at p |
| **`construct(p, args)`** | Construct object | ⚠️ Deprecated C++17 | Use `std::construct_at` instead |
| **`destroy(p)`** | Destroy object | ⚠️ Deprecated C++17 | Use `std::destroy_at` instead |
| **`rebind<U>`** | Type adaptation | ✅ Yes (node containers) | Create allocator for different type |
| **`operator==`** | Equality comparison | ✅ Yes | True if allocators interchangeable |
| **`operator!=`** | Inequality comparison | ✅ Yes | Opposite of `operator==` |

**Allocator Rebind Mechanism:**

Node-based containers (list, set, map) store elements in dynamically allocated nodes, not as raw `T` objects. The `rebind` template allows containers to create allocators for node types:

```cpp
template<typename T>
class MyAllocator {
public:
    using value_type = T;

    // ✅ Rebind: Create allocator for different type
    template<typename U>
    struct rebind {
        using other = MyAllocator<U>;
    };

    T* allocate(std::size_t n);
    void deallocate(T* p, std::size_t n);
};

// Usage in std::list (simplified)
template<typename T, typename Alloc = std::allocator<T>>
class list {
    struct Node {
        T data;
        Node* prev;
        Node* next;
    };

    // ✅ Use rebind to get allocator for Node, not T
    using NodeAlloc = typename Alloc::template rebind<Node>::other;
    NodeAlloc node_allocator;

    void push_back(const T& value) {
        Node* new_node = node_allocator.allocate(1);  // Allocate Node
        std::construct_at(new_node, value, nullptr, nullptr);
        // ... link node
    }
};
```

**Custom Allocator Use Cases:**

| Use Case | Benefit | Example |
|----------|---------|---------|
| **Memory pooling** | Reduce allocation overhead | Object pools for small, frequent allocations |
| **Arena allocation** | Fast bulk deallocation | Allocate from arena, free all at once |
| **Stack allocation** | Avoid heap entirely | Small vectors on stack with fallback to heap |
| **Shared memory** | Inter-process containers | Containers in shared memory regions |
| **Tracking allocations** | Debugging/profiling | Log all allocations for leak detection |
| **Custom alignment** | SIMD/hardware requirements | Over-aligned allocations for vectorization |

**Example: Memory Pool Allocator:**

```cpp
template<typename T>
class PoolAllocator {
private:
    static constexpr size_t POOL_SIZE = 1024;

    struct Pool {
        alignas(T) char storage[POOL_SIZE * sizeof(T)];
        bool used[POOL_SIZE] = {};
        Pool* next = nullptr;
    };

    Pool* pool_;

public:
    using value_type = T;

    // ✅ Rebind for node-based containers
    template<typename U>
    struct rebind {
        using other = PoolAllocator<U>;
    };

    PoolAllocator() : pool_(new Pool()) {}

    T* allocate(std::size_t n) {
        if (n == 1) {
            // ✅ Fast path: Single object from pool
            Pool* current = pool_;
            while (current) {
                for (size_t i = 0; i < POOL_SIZE; ++i) {
                    if (!current->used[i]) {
                        current->used[i] = true;
                        return reinterpret_cast<T*>(
                            &current->storage[i * sizeof(T)]
                        );
                    }
                }
                if (!current->next) {
                    current->next = new Pool();
                }
                current = current->next;
            }
        }
        // ⚠️ Fallback for bulk allocations
        return static_cast<T*>(::operator new(n * sizeof(T)));
    }

    void deallocate(T* p, std::size_t n) {
        if (n == 1) {
            // ✅ Return to pool
            Pool* current = pool_;
            while (current) {
                char* pool_start = reinterpret_cast<char*>(current->storage);
                char* pool_end = pool_start + sizeof(current->storage);
                char* ptr = reinterpret_cast<char*>(p);

                if (ptr >= pool_start && ptr < pool_end) {
                    size_t index = (ptr - pool_start) / sizeof(T);
                    current->used[index] = false;
                    return;
                }
                current = current->next;
            }
        }
        ::operator delete(p);
    }

    // ✅ Allocators from same pool are equal
    template<typename U>
    bool operator==(const PoolAllocator<U>&) const { return true; }

    template<typename U>
    bool operator!=(const PoolAllocator<U>& other) const {
        return !(*this == other);
    }
};

// Usage
std::vector<int, PoolAllocator<int>> v;
std::list<std::string, PoolAllocator<std::string>> lst;
```

**Allocator Propagation Traits (C++11+):**

Control how allocators behave during container copy, move, and swap:

| Trait | Default | Effect |
|-------|---------|--------|
| **`propagate_on_container_copy_assignment`** | `false` | Copy source allocator during copy assignment? |
| **`propagate_on_container_move_assignment`** | `false` | Move source allocator during move assignment? |
| **`propagate_on_container_swap`** | `false` | Swap allocators during container swap? |
| **`is_always_equal`** | `true` | All instances compare equal? |

```cpp
template<typename T>
struct StatefulAllocator {
    using value_type = T;

    int id;  // Stateful: different allocators have different IDs

    // ✅ Propagate allocator on copy
    using propagate_on_container_copy_assignment = std::true_type;
    using propagate_on_container_move_assignment = std::true_type;
    using propagate_on_container_swap = std::true_type;
    using is_always_equal = std::false_type;  // Different IDs ≠ equal

    bool operator==(const StatefulAllocator& other) const {
        return id == other.id;  // Only equal if same ID
    }

    // ... allocate/deallocate
};
```

**Allocator Equality and Container Operations:**

```cpp
// Scenario: Swapping containers with different allocators
PoolAllocator<int> alloc1, alloc2;

std::vector<int, PoolAllocator<int>> v1(alloc1);
std::vector<int, PoolAllocator<int>> v2(alloc2);

v1.swap(v2);  // What happens?

// If propagate_on_container_swap = true:
//   ✅ Swap internal pointers AND swap allocators (O(1))

// If propagate_on_container_swap = false AND alloc1 == alloc2:
//   ✅ Swap internal pointers, keep allocators (O(1))

// If propagate_on_container_swap = false AND alloc1 != alloc2:
//   ❌ Must element-wise swap (O(N)) - allocators can't deallocate each other's memory
```

**Best Practices:**

1. **Default allocator is usually sufficient** - Only use custom allocators for specific performance/memory needs
2. **Ensure allocator equality semantics** - Two allocators can deallocate each other's memory only if they compare equal
3. **Provide rebind** - Essential for node-based containers (list, set, map)
4. **Set propagation traits appropriately** - Match your allocator's semantics (stateless vs stateful)
5. **Test with containers** - Ensure allocator works with vector, list, and map
6. **Document allocation strategy** - Clearly explain when/why to use your allocator

---

#### 3. Algorithms and Lambdas - Generic Operations with Modern Functional Programming

**STL Algorithms - Over 100 Generic Operations:**

STL algorithms are function templates operating on **iterator ranges** `[first, last)`, embodying generic programming by working with any container providing appropriate iterators.

**Algorithm Categories:**

| Category | Examples | Description | Typical Complexity |
|----------|----------|-------------|-------------------|
| **Non-modifying sequence** | `find`, `count`, `search`, `all_of` | Read elements, don't modify | O(N) |
| **Modifying sequence** | `copy`, `transform`, `fill`, `remove` | Modify or reorder elements | O(N) |
| **Sorting and related** | `sort`, `stable_sort`, `partition`, `nth_element` | Reorder based on comparison | O(N log N) |
| **Binary search** | `lower_bound`, `upper_bound`, `binary_search` | Search sorted ranges | O(log N) |
| **Set operations** | `set_union`, `set_intersection`, `merge` | Operate on sorted ranges | O(N) |
| **Heap operations** | `make_heap`, `push_heap`, `pop_heap` | Maintain heap property | O(log N) |
| **Numeric** | `accumulate`, `reduce`, `inner_product` | Numeric reductions | O(N) |
| **Permutation** | `next_permutation`, `shuffle` | Generate permutations | O(N) |

**Common Algorithms Quick Reference:**

| Algorithm | Purpose | Complexity | Modifies? | Requires Sorted? |
|-----------|---------|-----------|-----------|------------------|
| **`std::find`** | Find first match | O(N) | No | No |
| **`std::find_if`** | Find first matching predicate | O(N) | No | No |
| **`std::count`** | Count occurrences | O(N) | No | No |
| **`std::count_if`** | Count matching predicate | O(N) | No | No |
| **`std::copy`** | Copy elements | O(N) | Destination | No |
| **`std::transform`** | Apply function to elements | O(N) | Destination | No |
| **`std::sort`** | Sort elements | O(N log N) | Yes | No |
| **`std::stable_sort`** | Sort preserving order | O(N log N) | Yes | No |
| **`std::partition`** | Partition by predicate | O(N) | Yes | No |
| **`std::remove`** | Remove values (logical) | O(N) | Yes (reorder) | No |
| **`std::unique`** | Remove consecutive duplicates | O(N) | Yes (reorder) | No (sorted for dedup) |
| **`std::binary_search`** | Check if value exists | O(log N) | No | ✅ Yes |
| **`std::lower_bound`** | First not less than value | O(log N) | No | ✅ Yes |
| **`std::accumulate`** | Sum/reduce elements | O(N) | No | No |

**Erase-Remove Idiom - Algorithm Limitations:**

Algorithms operate through iterators and **cannot modify container size**. Only container member functions can add/remove elements.

```cpp
std::vector<int> v = {1, 2, 3, 2, 4, 2, 5};

// ❌ WRONG: remove doesn't actually remove
std::remove(v.begin(), v.end(), 2);
std::cout << v.size();  // Still 7! Elements reordered but not removed

// ✅ CORRECT: Erase-remove idiom
v.erase(
    std::remove(v.begin(), v.end(), 2),
    v.end()
);
// Now v = {1, 3, 4, 5} with size 4

// ✅ ALTERNATIVE: remove_if with predicate
v.erase(
    std::remove_if(v.begin(), v.end(), [](int x) { return x % 2 == 0; }),
    v.end()
);
```

**Lambda Expressions - Inline Function Objects:**

Lambdas (C++11) eliminate boilerplate functor classes, enabling inline, stateful function objects with intuitive syntax.

**Lambda Syntax:**

```cpp
// Full syntax
[ captures ] ( parameters ) specifiers -> return_type { body }

// Examples
auto add = [](int a, int b) { return a + b; };
auto greater_than = [threshold = 10](int x) { return x > threshold; };
auto counter = [count = 0]() mutable { return ++count; };
auto forwarder = [](auto&&... args) { return func(std::forward<decltype(args)>(args)...); };
```

**Lambda Capture Modes:**

| Capture Syntax | Meaning | Copies Variables? | Modifiable? | Lifetime Issue? |
|----------------|---------|-------------------|-------------|-----------------|
| **`[]`** | Capture nothing | - | N/A | No |
| **`[=]`** | Capture all by value | ✅ Yes | Only with `mutable` | No |
| **`[&]`** | Capture all by reference | ❌ No (references) | ✅ Yes | ⚠️ Yes if lambda outlives scope |
| **`[x]`** | Capture `x` by value | ✅ Yes | Only with `mutable` | No |
| **`[&x]`** | Capture `x` by reference | ❌ No (reference) | ✅ Yes | ⚠️ Yes if `x` destroyed |
| **`[x, &y]`** | Mixed capture | Mixed | Partial | Partial |
| **`[this]`** | Capture `this` pointer | ✅ Pointer copied | ✅ Yes | ⚠️ Yes if object destroyed |
| **`[=, &x]`** | All by value except `x` | Mixed | Partial | Partial |
| **`[&, x]`** | All by reference except `x` | Mixed | Partial | Partial |
| **`[x = expr]`** (C++14) | Init-capture | Depends on expr | With `mutable` | Depends on expr |

**Capture Examples:**

```cpp
int a = 10, b = 20;

// Capture by value - copies a and b
auto f1 = [=]() { return a + b; };  // ✅ f1 independent of a, b

// Capture by reference - references a and b
auto f2 = [&]() { a++; return a + b; };  // ✅ Can modify a, b

// Mixed capture
auto f3 = [a, &b]() { b++; return a + b; };  // ✅ Copy a, reference b

// Mutable lambda - modify captured value
auto f4 = [a]() mutable { a++; return a; };  // ✅ Modifies internal copy
std::cout << f4();  // 11
std::cout << a;     // Still 10 (original unchanged)

// ❌ WRONG: Dangling reference
std::function<int()> makeCounter() {
    int count = 0;
    return [&count]() { return ++count; };  // count destroyed when function returns
}
auto c = makeCounter();
c();  // ❌ Undefined behavior - count destroyed

// ✅ CORRECT: Capture by value
std::function<int()> makeCounter() {
    return [count = 0]() mutable { return ++count; };  // count copied into lambda
}
```

**Init-Capture (C++14) - Move Capture:**

```cpp
// Move unique_ptr into lambda
auto ptr = std::make_unique<int>(42);
auto lambda = [ptr = std::move(ptr)]() {
    std::cout << *ptr;
};
// ptr is now nullptr; ownership transferred to lambda

// Capture with transformation
int x = 10;
auto f = [y = x * 2]() { return y; };  // y = 20 captured

// Move expensive objects
std::vector<int> large_vec(1000000, 1);
auto process = [v = std::move(large_vec)]() {
    return std::accumulate(v.begin(), v.end(), 0);
};
// large_vec now empty; lambda owns the data
```

**Lambdas with STL Algorithms:**

```cpp
std::vector<int> numbers = {1, 2, 3, 4, 5, 6, 7, 8, 9, 10};

// ✅ Filter: Find all evens
std::vector<int> evens;
std::copy_if(numbers.begin(), numbers.end(), std::back_inserter(evens),
             [](int x) { return x % 2 == 0; });
// evens = {2, 4, 6, 8, 10}

// ✅ Transform: Square all elements
std::vector<int> squares;
std::transform(numbers.begin(), numbers.end(), std::back_inserter(squares),
               [](int x) { return x * x; });
// squares = {1, 4, 9, 16, 25, ...}

// ✅ Custom sort: Sort by distance from 5
std::sort(numbers.begin(), numbers.end(),
          [](int a, int b) {
              return std::abs(a - 5) < std::abs(b - 5);
          });

// ✅ Accumulate: Sum with captured multiplier
int multiplier = 2;
int sum = std::accumulate(numbers.begin(), numbers.end(), 0,
                          [multiplier](int acc, int x) {
                              return acc + x * multiplier;
                          });

// ✅ Count with stateful lambda
int count = std::count_if(numbers.begin(), numbers.end(),
                          [threshold = 5](int x) { return x > threshold; });
```

**Algorithm Composition - Functional Pipelines:**

```cpp
std::vector<int> data = {1, 2, 3, 4, 5, 6, 7, 8, 9, 10};

// Task: Sum of squares of even numbers
std::vector<int> evens;
std::copy_if(data.begin(), data.end(), std::back_inserter(evens),
             [](int x) { return x % 2 == 0; });

std::vector<int> squares;
std::transform(evens.begin(), evens.end(), std::back_inserter(squares),
               [](int x) { return x * x; });

int sum = std::accumulate(squares.begin(), squares.end(), 0);
// sum = 4 + 16 + 36 + 64 + 100 = 220

// ✅ C++20 ranges: Composable, lazy evaluation
auto result = data
    | std::views::filter([](int x) { return x % 2 == 0; })
    | std::views::transform([](int x) { return x * x; });
int sum_ranges = std::accumulate(result.begin(), result.end(), 0);
```

**Generic Lambdas (C++14) and Perfect Forwarding:**

```cpp
// Generic lambda - works with any type
auto printer = [](const auto& x) {
    std::cout << x << "\n";
};

printer(42);          // Works with int
printer("hello");     // Works with const char*
printer(3.14);        // Works with double

// Perfect forwarding lambda
auto forwarder = [](auto&&... args) {
    return process(std::forward<decltype(args)>(args)...);
};

forwarder(42);           // Forwards rvalue
int x = 10;
forwarder(x);            // Forwards lvalue
forwarder(std::move(x)); // Forwards rvalue
```

**When to Use Lambdas vs Function Objects:**

| Scenario | Use Lambda | Use Function Object (Functor) |
|----------|-----------|-------------------------------|
| **Simple, one-off predicates** | ✅ Yes | ❌ Overkill |
| **Stateful operations** | ✅ Yes (with captures) | ⚠️ If complex state |
| **Reusable across functions** | ⚠️ Define as variable | ✅ Yes (named type) |
| **Template parameter** | ⚠️ Use `auto` or `std::function` | ✅ Yes (named type) |
| **Debugging** | ⚠️ Anonymous, harder to inspect | ✅ Yes (named type) |
| **Type erasure needed** | ⚠️ Wrap in `std::function` (overhead) | ✅ Yes |

**Best Practices:**

1. **Prefer algorithms over raw loops** - More expressive, testable, and often optimized
2. **Use lambdas for inline predicates** - Cleaner than separate functor classes
3. **Capture by value for safety** - Avoid dangling references, use `mutable` if needed
4. **Use init-capture for move-only types** - `[ptr = std::move(ptr)]`
5. **Leverage generic lambdas** - `auto` parameters for reusable code
6. **Compose algorithms** - Build pipelines with filter, transform, accumulate
7. **Understand iterator invalidation** - Don't modify containers during algorithm execution
8. **Use execution policies (C++17)** - `std::execution::par` for parallel execution
9. **Embrace C++20 ranges** - Composable, lazy views for cleaner pipelines
10. **Profile before optimizing** - Algorithms are already heavily optimized

---

### EDGE_CASES: Tricky Scenarios and Deep Internals

#### Edge Case 1: Iterator Invalidation During Algorithm Execution

```cpp
std::vector<int> v = {1, 2, 3, 4, 5};
for (auto it = v.begin(); it != v.end(); ++it) {
    if (*it == 3) {
        v.push_back(100);  // ❌ Invalidates iterators if reallocation occurs
    }
}
```

This code exhibits undefined behavior. When `push_back` causes reallocation, all existing iterators including `it` and the cached `v.end()` become invalid. Any subsequent use of these iterators invokes undefined behavior. The correct approach is to avoid modifying the container during iteration, or use algorithms like `std::transform` with `std::back_inserter` for separate output.

#### Edge Case 2: Reverse Iterator Base Confusion

```cpp
std::vector<int> v = {10, 20, 30, 40};
auto rit = std::find(v.rbegin(), v.rend(), 30);  // Points to 30
auto it = rit.base();  // What does this point to?
std::cout << *it;  // ✅ Prints 40, not 30!
```

The `base()` member function of reverse iterators returns a forward iterator, but it points to the element **one position after** the element the reverse iterator refers to. This asymmetry exists because ranges are half-open `[begin, end)`. When you convert a reverse iterator to a forward iterator, you must account for this offset. To get an equivalent forward iterator, you typically need `std::prev(rit.base())`.

#### Edge Case 3: Lambda Capture Lifetime Issues

```cpp
std::function<int()> createCounter() {
    int count = 0;
    return [&count]() { return ++count; };  // ❌ Dangling reference
}
auto counter = createCounter();
std::cout << counter();  // Undefined behavior
```

Capturing by reference `[&count]` creates a dangling reference when the local variable `count` goes out of scope. The lambda object stored in `std::function` outlives the captured reference, leading to undefined behavior. The fix is to capture by value `[count]() mutable` or use a `std::shared_ptr` for shared state.

#### Edge Case 4: Transform with Same Input/Output Range

```cpp
std::vector<int> v = {1, 2, 3};
std::transform(v.begin(), v.end(), v.begin(), [](int x) { return x * 2; });  // ✅ Safe
std::transform(v.begin(), v.end(), std::back_inserter(v), [](int x) { return x * 2; });  // ❌ UB
```

The first example is safe because the output iterator writes to the same positions being read, and the operation is element-wise without dependencies. The second example is undefined behavior because appending to `v` while iterating invalidates the end iterator and potentially all iterators if reallocation occurs.

#### Edge Case 5: Allocator Equality and Container Swap

```cpp
template<typename T>
class PoolAllocator {
    MemoryPool* pool;
public:
    bool operator==(const PoolAllocator& other) const {
        return pool == other.pool;  // Must return true only if pools are interchangeable
    }
};

std::vector<int, PoolAllocator<int>> v1(alloc1);
std::vector<int, PoolAllocator<int>> v2(alloc2);
v1.swap(v2);  // Behavior depends on allocator equality
```

When swapping containers with different allocators, the behavior depends on whether the allocators compare equal. If allocators are not equal and the allocator does not propagate on swap, the swap must copy elements instead of just swapping internal pointers, which is expensive. Allocator designers must ensure that `operator==` correctly identifies when two allocators can deallocate each other's memory.

#### Edge Case 6: Iterator Category Downgrade

```cpp
template<typename ForwardIt>
void processRange(ForwardIt first, ForwardIt last) {
    auto distance = std::distance(first, last);  // O(N) for forward iterators
    // ...
}

std::list<int> lst = {1, 2, 3, 4, 5};
processRange(lst.begin(), lst.end());  // Works but distance is O(N)

std::vector<int> v = {1, 2, 3, 4, 5};
processRange(v.begin(), v.end());  // distance is O(1) for random access
```

When writing generic code, be aware that iterator operations have different complexities depending on the iterator category. `std::distance`, `std::advance`, and `std::next`/`std::prev` are O(1) for random access iterators but O(N) for weaker iterator categories. Generic code should either document its iterator requirements or provide specialized implementations for different iterator categories using tag dispatching.

#### Edge Case 7: Stateful Lambda and Algorithm Copies

```cpp
int sum = 0;
auto lambda = [&sum](int x) { sum += x; };
std::for_each(v.begin(), v.end(), lambda);  // ❌ sum may not be updated
```

STL algorithms may copy the predicate/function object internally, and the return value is the final copy. For stateful lambdas, you must use the returned function object to access the final state:

```cpp
int sum = 0;
auto final_lambda = std::for_each(v.begin(), v.end(), [&sum](int x) { sum += x; });
// Or better: use std::accumulate
sum = std::accumulate(v.begin(), v.end(), 0);
```

#### Edge Case 8: Custom Allocator Rebind Requirements

```cpp
template<typename T>
class MyAllocator {
public:
    using value_type = T;
    
    template<typename U>
    struct rebind {
        using other = MyAllocator<U>;  // ✅ Must support rebind
    };
    
    T* allocate(std::size_t n);
    void deallocate(T* p, std::size_t n);
};
```

STL containers often need to allocate memory for types other than `T`. For example, `std::list<T, Alloc>` needs to allocate list nodes, not raw `T` objects. The `rebind` mechanism allows the container to obtain an allocator for a different type using the same allocation strategy. Forgetting to provide `rebind` will cause compilation errors with node-based containers.

---

### CODE_EXAMPLES: Practical Demonstrations

#### Example 1: Iterator Tag Dispatching for Optimal Algorithms

```cpp
#include <iterator>
#include <iostream>

// Implementation for random access iterators (O(1))
template<typename RandomIt>
typename std::iterator_traits<RandomIt>::difference_type
distanceImpl(RandomIt first, RandomIt last, std::random_access_iterator_tag) {
    std::cout << "Using O(1) random access version\n";
    return last - first;
}

// Implementation for input iterators (O(N))
template<typename InputIt>
typename std::iterator_traits<InputIt>::difference_type
distanceImpl(InputIt first, InputIt last, std::input_iterator_tag) {
    std::cout << "Using O(N) input iterator version\n";
    typename std::iterator_traits<InputIt>::difference_type n = 0;
    while (first != last) {
        ++first;
        ++n;
    }
    return n;
}

// Generic interface that dispatches based on iterator category
template<typename Iterator>
typename std::iterator_traits<Iterator>::difference_type
myDistance(Iterator first, Iterator last) {
    return distanceImpl(first, last, 
        typename std::iterator_traits<Iterator>::iterator_category());
}
```

This example demonstrates tag dispatching, a technique where the compiler selects the optimal implementation based on the iterator category at compile time. The `std::iterator_traits` extracts the iterator category tag, which is then used for overload resolution. This pattern is used extensively throughout the STL to provide efficient implementations based on iterator capabilities.

#### Example 2: Custom Memory Pool Allocator

```cpp
#include <memory>
#include <vector>

template<typename T>
class PoolAllocator {
private:
    static constexpr size_t POOL_SIZE = 1024;
    struct Pool {
        T storage[POOL_SIZE];
        bool used[POOL_SIZE] = {};
        Pool* next = nullptr;
    };
    Pool* pool = nullptr;

public:
    using value_type = T;
    
    template<typename U>
    struct rebind {
        using other = PoolAllocator<U>;
    };
    
    PoolAllocator() : pool(new Pool()) {}
    
    T* allocate(std::size_t n) {
        if (n != 1) {
            return static_cast<T*>(::operator new(n * sizeof(T)));
        }
        
        Pool* current = pool;
        while (current) {
            for (size_t i = 0; i < POOL_SIZE; ++i) {
                if (!current->used[i]) {
                    current->used[i] = true;
                    return &current->storage[i];
                }
            }
            if (!current->next) {
                current->next = new Pool();
            }
            current = current->next;
        }
        return nullptr;
    }
    
    void deallocate(T* p, std::size_t n) {
        if (n != 1) {
            ::operator delete(p);
            return;
        }
        
        Pool* current = pool;
        while (current) {
            if (p >= current->storage && p < current->storage + POOL_SIZE) {
                size_t index = p - current->storage;
                current->used[index] = false;
                return;
            }
            current = current->next;
        }
    }
    
    template<typename U>
    bool operator==(const PoolAllocator<U>&) const { return true; }
    
    template<typename U>
    bool operator!=(const PoolAllocator<U>& other) const { return !(*this == other); }
};

// Usage
std::vector<int, PoolAllocator<int>> v;
v.push_back(1);
v.push_back(2);
```

This pool allocator demonstrates custom memory management. It maintains a pool of pre-allocated memory and serves single-element allocations from this pool, falling back to global `new` for larger requests. This reduces allocation overhead for containers with many small objects. The allocator supports the `rebind` mechanism required by node-based containers.

#### Example 3: Range-Based Transform with Lambda

```cpp
#include <algorithm>
#include <vector>
#include <iostream>

int main() {
    std::vector<int> input = {1, 2, 3, 4, 5};
    std::vector<int> output;
    output.reserve(input.size());
    
    // Transform with lambda: square each element
    std::transform(input.begin(), input.end(), 
                   std::back_inserter(output),
                   [](int x) { return x * x; });
    
    // Using captured state
    int multiplier = 10;
    std::transform(output.begin(), output.end(), output.begin(),
                   [multiplier](int x) { return x * multiplier; });
    
    // Output: 10, 40, 90, 160, 250
    for (int val : output) {
        std::cout << val << " ";
    }
}
```

This example shows `std::transform` with lambdas. The first transform uses a stateless lambda to square elements, writing to a separate output container via `std::back_inserter`. The second transform captures a local variable and modifies elements in-place. This demonstrates the power of combining algorithms with lambda closures.

#### Example 4: Custom Comparator with Lambda in Sorting

```cpp
#include <algorithm>
#include <vector>
#include <string>
#include <iostream>

struct Person {
    std::string name;
    int age;
};

int main() {
    std::vector<Person> people = {
        {"Alice", 30}, {"Bob", 25}, {"Charlie", 35}, {"David", 25}
    };
    
    // Sort by age, then by name
    std::sort(people.begin(), people.end(), 
              [](const Person& a, const Person& b) {
                  if (a.age != b.age)
                      return a.age < b.age;
                  return a.name < b.name;
              });
    
    for (const auto& p : people) {
        std::cout << p.name << " (" << p.age << ")\n";
    }
}
```

This example demonstrates using a lambda as a custom comparator for sorting complex objects. The lambda implements a two-level sort: first by age, then by name as a tiebreaker. This is much cleaner than writing a separate functor class.

#### Example 5: Stateful Lambda for Counting Operations

```cpp
#include <algorithm>
#include <vector>
#include <iostream>

int main() {
    std::vector<int> v = {1, 5, 10, 15, 20, 25, 30};
    
    int threshold = 15;
    int count = 0;
    
    // Use returned lambda to access final state
    auto final_lambda = std::for_each(v.begin(), v.end(), 
                                      [&count, threshold](int x) {
                                          if (x > threshold) ++count;
                                      });
    
    std::cout << "Elements > " << threshold << ": " << count << "\n";
    
    // Better approach: use std::count_if
    count = std::count_if(v.begin(), v.end(), 
                         [threshold](int x) { return x > threshold; });
    
    std::cout << "Count (using count_if): " << count << "\n";
}
```

This example shows how to use stateful lambdas with algorithms. While `std::for_each` can work with stateful lambdas, `std::count_if` is the idiomatic choice for counting elements matching a predicate.

#### Example 6: Perfect Forwarding with Lambdas

```cpp
#include <iostream>
#include <vector>
#include <memory>

template<typename T, typename... Args>
void emplaceWrapper(std::vector<T>& vec, Args&&... args) {
    vec.emplace_back(std::forward<Args>(args)...);
}

int main() {
    std::vector<std::pair<int, std::string>> v;
    
    // Perfect forwarding avoids extra copies
    emplaceWrapper(v, 1, "first");
    emplaceWrapper(v, 2, "second");
    
    // Lambda with perfect forwarding
    auto forwarder = [](auto&&... args) {
        return std::make_unique<std::pair<int, std::string>>(
            std::forward<decltype(args)>(args)...
        );
    };
    
    auto ptr = forwarder(3, "third");
    std::cout << ptr->first << ": " << ptr->second << "\n";
}
```

This example demonstrates perfect forwarding in both a regular template function and a generic lambda (C++14). Perfect forwarding preserves value categories (lvalue/rvalue), enabling efficient in-place construction without unnecessary copies or moves.

#### Example 7: Algorithm Composition with Lambda Pipelines

```cpp
#include <algorithm>
#include <vector>
#include <iostream>
#include <numeric>

int main() {
    std::vector<int> numbers = {1, 2, 3, 4, 5, 6, 7, 8, 9, 10};
    
    // Filter even numbers, square them, then sum
    std::vector<int> evens;
    std::copy_if(numbers.begin(), numbers.end(), 
                 std::back_inserter(evens),
                 [](int x) { return x % 2 == 0; });
    
    std::transform(evens.begin(), evens.end(), evens.begin(),
                   [](int x) { return x * x; });
    
    int sum = std::accumulate(evens.begin(), evens.end(), 0);
    
    std::cout << "Sum of squares of even numbers: " << sum << "\n";
    // Output: 4 + 16 + 36 + 64 + 100 = 220
}
```

This example shows composing multiple STL algorithms to build a processing pipeline. Each step uses a lambda to define the operation. This functional programming style is clean and expressive.

#### Example 8: Move Capture in Lambda (C++14)

```cpp
#include <iostream>
#include <memory>
#include <vector>
#include <algorithm>

int main() {
    auto ptr = std::make_unique<int>(42);
    
    // Move capture: ptr is moved into the lambda
    auto lambda = [ptr = std::move(ptr)]() mutable {
        (*ptr)++;
        std::cout << "Value: " << *ptr << "\n";
    };
    
    // ptr is now null
    std::cout << "Original ptr is null: " << (ptr == nullptr) << "\n";
    
    lambda();  // Prints 43
    lambda();  // Prints 44
    
    // Using move capture with std::for_each
    std::vector<int> v = {1, 2, 3};
    auto state = std::make_unique<int>(0);
    std::for_each(v.begin(), v.end(), 
                  [state = std::move(state)](int x) mutable {
                      *state += x;
                  });
}
```

This example demonstrates C++14 init-capture (move capture), which allows capturing move-only types like `std::unique_ptr` in lambdas. The captured object is initialized by moving from the original, enabling efficient transfer of ownership into the lambda.

---

### INTERVIEW_QA: Comprehensive Questions

#### Q1: What are the five iterator categories in C++? How do they differ?
**Difficulty:** #beginner
**Category:** #iterators #theory
**Concepts:** #iterator_categories #stl_fundamentals #generic_programming

**Answer:**
The five iterator categories are Input, Output, Forward, Bidirectional, and Random Access iterators, forming a hierarchy where each category refines the previous one.

**Explanation:**
Input iterators support single-pass read operations (`*it`, `++it`). Output iterators support single-pass write operations. Forward iterators support multi-pass read/write with forward traversal. Bidirectional iterators add backward traversal (`--it`). Random Access iterators support pointer arithmetic (`it + n`, `it - n`) and O(1) element access. Each category defines which operations are valid and their complexity guarantees, enabling algorithms to select optimal implementations through tag dispatching.

**Key takeaway:** Iterator categories enable compile-time algorithm optimization by providing increasingly powerful operations with corresponding complexity guarantees.

---

#### Q2: Explain iterator invalidation rules for std::vector after push_back, insert, and erase.
**Difficulty:** #intermediate
**Category:** #iterators #memory_management
**Concepts:** #iterator_invalidation #vector_internals #undefined_behavior

**Answer:**
`push_back` invalidates all iterators if reallocation occurs; otherwise only `end()` is invalidated. `insert` and `erase` invalidate iterators at and after the modification point.

**Explanation:**
Vector stores elements in contiguous memory. When capacity is exceeded, `push_back` reallocates the entire buffer, invalidating all iterators, pointers, and references. If no reallocation occurs, only `end()` changes. For `insert` and `erase`, elements may shift in memory, so iterators pointing at or after the modification point become invalid. This invalidation is deterministic and documented, unlike undefined behavior from dereferencing invalid iterators.

**Key takeaway:** Always assume vector iterators are invalidated by mutations unless you've explicitly managed capacity with reserve.

---

#### Q3: Why can't std::sort be used directly with std::list?
**Difficulty:** #intermediate
**Category:** #algorithms #iterators
**Concepts:** #iterator_categories #random_access_iterator #sort_complexity

**Answer:**
`std::sort` requires random access iterators for O(N log N) performance, but `std::list` provides only bidirectional iterators.

**Code example:**
```cpp
std::list<int> lst = {3, 1, 4, 1, 5};
// std::sort(lst.begin(), lst.end());  // ❌ Compilation error
lst.sort();  // ✅ Member function optimized for lists
```

**Explanation:**
`std::sort` uses algorithms like introsort or quicksort that require random access for efficient partitioning and indexing. List nodes are not contiguous in memory, so operations like `it + n` are impossible. The `list::sort()` member function uses merge sort, which only requires forward traversal and is efficient for linked structures.

**Key takeaway:** Algorithm requirements constrain which containers they work with; node-based containers often provide specialized member functions.

---

#### Q4: What is tag dispatching and how does the STL use it?
**Difficulty:** #advanced
**Category:** #design_pattern #iterators
**Concepts:** #tag_dispatching #template_metaprogramming #compile_time_optimization

**Answer:**
Tag dispatching uses empty struct types as compile-time tags to select function overloads based on type properties, enabling algorithm optimization.

**Code example:**
```cpp
template<typename Iter>
void advanceImpl(Iter& it, int n, std::random_access_iterator_tag) {
    it += n;  // ✅ O(1) for random access
}

template<typename Iter>
void advanceImpl(Iter& it, int n, std::input_iterator_tag) {
    while (n--) ++it;  // O(N) for weaker iterators
}

template<typename Iter>
void advance(Iter& it, int n) {
    advanceImpl(it, n, typename std::iterator_traits<Iter>::iterator_category());
}
```

**Explanation:**
The STL defines tag types like `std::random_access_iterator_tag` that encode iterator capabilities. Generic functions like `std::advance` extract the iterator's category tag via `std::iterator_traits` and pass it as an argument to overloaded implementation functions. The compiler selects the most efficient overload at compile time with zero runtime overhead.

**Key takeaway:** Tag dispatching provides compile-time polymorphism, enabling zero-cost abstractions in generic code.

---

#### Q5: What is the purpose of std::iterator_traits?
**Difficulty:** #intermediate
**Category:** #iterators #templates
**Concepts:** #iterator_traits #type_introspection #generic_programming

**Answer:**
`std::iterator_traits` provides a uniform interface to access iterator properties like value type, category, and difference type, working with both iterator classes and raw pointers.

**Explanation:**
Generic algorithms need to query iterator properties. Iterator classes can define nested typedefs, but raw pointers cannot. `std::iterator_traits<T>` is a template class that extracts these properties from iterator types and provides a specialization for pointers. This enables algorithms to work uniformly with both user-defined iterators and built-in pointers. The primary typedefs are `value_type`, `difference_type`, `pointer`, `reference`, and `iterator_category`.

**Key takeaway:** Iterator traits enable generic algorithms to work uniformly with both custom iterators and raw pointers through a unified interface.

---

#### Q6: Explain the difference between iterator_category and value_type in std::iterator_traits.
**Difficulty:** #beginner
**Category:** #iterators #theory
**Concepts:** #iterator_traits #type_properties

**Answer:**
`value_type` is the type of elements the iterator points to, while `iterator_category` is a tag type indicating the iterator's capability level.

**Explanation:**
`value_type` enables generic code to declare variables of the element type: `typename std::iterator_traits<Iter>::value_type elem = *it;`. The `iterator_category` is a tag type (like `std::random_access_iterator_tag`) used for tag dispatching to select optimal algorithm implementations. One describes "what" the iterator points to, the other describes "how" the iterator can traverse.

**Key takeaway:** Iterator traits provide both data type information (value_type) and capability information (iterator_category) for generic programming.

---

#### Q7: What happens to iterators when std::vector::reserve is called?
**Difficulty:** #intermediate
**Category:** #iterators #memory_management
**Concepts:** #iterator_invalidation #reserve #capacity_management

**Answer:**
`reserve` may cause reallocation, invalidating all iterators, pointers, and references if the new capacity exceeds current capacity.

**Code example:**
```cpp
std::vector<int> v = {1, 2, 3};
auto it = v.begin();
v.reserve(100);  // May reallocate
// it is now potentially invalid
```

**Explanation:**
If `reserve(n)` requests a capacity greater than the current capacity, vector allocates a new buffer, moves elements, and deallocates the old buffer. This invalidates all existing iterators. However, if requested capacity is less than or equal to current capacity, `reserve` is a no-op and iterators remain valid. Always obtain fresh iterators after calling `reserve` to be safe.

**Key takeaway:** Reserve can trigger reallocation; never rely on iterators surviving a reserve call that increases capacity.

---

#### Q8: Can you modify keys in an std::map by using a mutable lambda?
**Difficulty:** #advanced
**Category:** #algorithms #containers
**Concepts:** #const_correctness #undefined_behavior #map_internals

**Answer:**
No, attempting to modify keys through mutable lambda or const_cast causes undefined behavior because map keys are stored as const internally.

**Code example:**
```cpp
std::map<int, std::string> m = {{1, "one"}, {2, "two"}};
std::for_each(m.begin(), m.end(), [](auto& pair) {
    // pair.first is const int&
    // const_cast<int&>(pair.first) = 99;  // ❌ Undefined behavior
});
```

**Explanation:**
Map stores key-value pairs as `std::pair<const Key, Value>`. The const qualification ensures the map's internal balanced tree structure remains consistent, as keys determine element ordering. Modifying keys through const_cast violates this invariant, corrupting the tree structure and causing undefined behavior in subsequent operations.

**Key takeaway:** Map keys are immutable by design to maintain internal data structure invariants; circumventing this is undefined behavior.

---

#### Q9: What is the difference between std::vector::reserve and std::vector::resize?
**Difficulty:** #beginner
**Category:** #memory_management #containers
**Concepts:** #capacity #size #memory_allocation

**Answer:**
`reserve(n)` allocates memory for at least n elements but doesn't change size; `resize(n)` changes size to n, constructing or destroying elements as needed.

**Code example:**
```cpp
std::vector<int> v1;
v1.reserve(10);
// v1.size() == 0, v1.capacity() >= 10
// v1[5] = 42;  // ❌ Undefined behavior

std::vector<int> v2;
v2.resize(10);
// v2.size() == 10, v2.capacity() >= 10
v2[5] = 42;  // ✅ Valid, accesses default-constructed element
```

**Explanation:**
`reserve` is a performance optimization that preallocates memory to avoid reallocations during subsequent insertions, but it doesn't create any elements. `resize` changes the logical size of the vector, default-constructing new elements if growing or destroying elements if shrinking. After `resize(n)`, all indices `[0, n)` are valid for access.

**Key takeaway:** Use reserve to optimize insertions, use resize to change the vector's size and create accessible elements.

---

#### Q10: Explain the purpose of allocators in STL containers.
**Difficulty:** #intermediate
**Category:** #allocators #memory_management
**Concepts:** #allocator_interface #custom_allocation #memory_pools

**Answer:**
Allocators abstract memory acquisition and release, allowing containers to use custom allocation strategies like memory pools instead of global new/delete.

**Explanation:**
Every STL container accepts an allocator template parameter (defaulting to `std::allocator<T>`). Allocators separate raw memory allocation from object construction, providing methods like `allocate`, `deallocate`, `construct`, and `destroy`. This separation enables optimizations like bulk allocation, stack allocation, arena allocation, or placement in shared memory. Custom allocators must satisfy specific requirements including providing the `rebind` template for node-based containers.

**Key takeaway:** Allocators enable memory management customization without changing container logic, crucial for performance optimization.

---

#### Q11: What is allocator rebind and when is it used?
**Difficulty:** #advanced
**Category:** #allocators #templates
**Concepts:** #rebind #node_based_containers #allocator_requirements

**Answer:**
Rebind is a nested template in allocators that allows containers to create allocators for different types using the same allocation policy.

**Code example:**
```cpp
template<typename T>
class MyAllocator {
public:
    template<typename U>
    struct rebind {
        using other = MyAllocator<U>;
    };
    // ...
};

// std::list<int, MyAllocator<int>> needs to allocate list nodes
// It uses MyAllocator<int>::rebind<Node>::other to get MyAllocator<Node>
```

**Explanation:**
Node-based containers like `std::list` store elements in dynamically allocated nodes, not as raw `T` objects. A `list<int, MyAllocator<int>>` needs to allocate memory for node structures containing `int`, not just `int` directly. The `rebind` mechanism allows the container to obtain `MyAllocator<Node>` from `MyAllocator<int>`, ensuring the same allocation strategy is used for internal structures.

**Key takeaway:** Rebind enables allocators to work with node-based containers by allowing type adaptation while preserving allocation policy.

---

#### Q12: How do stateful allocators affect container operations?
**Difficulty:** #advanced
**Category:** #allocators #containers
**Concepts:** #allocator_state #propagation_traits #copy_semantics

**Answer:**
Stateful allocators store per-instance data like pool pointers, affecting copy/move/swap behavior based on allocator propagation traits.

**Explanation:**
Stateless allocators like `std::allocator` are interchangeable, so container operations are straightforward. Stateful allocators may have different states, making them non-interchangeable. C++11 introduced allocator propagation traits: `propagate_on_container_copy_assignment`, `propagate_on_container_move_assignment`, and `propagate_on_container_swap`. If allocators don't propagate and aren't equal, operations like copy must deep-copy elements rather than just copying internal pointers, significantly impacting performance.

**Key takeaway:** Stateful allocators require careful handling of propagation semantics to maintain correctness and performance.

---

#### Q13: What complexity does std::distance have for different iterator categories?
**Difficulty:** #intermediate
**Category:** #algorithms #iterators
**Concepts:** #complexity_analysis #iterator_categories #std_distance

**Answer:**
`std::distance` is O(1) for random access iterators and O(N) for weaker iterator categories.

**Code example:**
```cpp
std::vector<int> v = {1, 2, 3, 4, 5};
auto dist1 = std::distance(v.begin(), v.end());  // O(1) - random access

std::list<int> lst = {1, 2, 3, 4, 5};
auto dist2 = std::distance(lst.begin(), lst.end());  // O(N) - bidirectional
```

**Explanation:**
Random access iterators support subtraction in constant time, so `std::distance` simply returns `last - first`. For input, forward, and bidirectional iterators that don't support subtraction, `std::distance` must increment from `first` to `last`, counting steps in linear time. The implementation uses tag dispatching to select the appropriate version.

**Key takeaway:** Algorithm complexity varies with iterator category; always consider iterator capabilities when analyzing performance.

---

#### Q14: Explain lambda capture modes: [=], [&], and [x, &y].
**Difficulty:** #beginner
**Category:** #lambdas #syntax
**Concepts:** #lambda_capture #capture_modes #closure

**Answer:**
`[=]` captures all used variables by value, `[&]` captures all by reference, `[x, &y]` selectively captures x by value and y by reference.

**Code example:**
```cpp
int a = 10, b = 20;
auto f1 = [=]()  { return a + b; };        // Captures copies
auto f2 = [&]()  { a++; return a + b; };   // Captures references
auto f3 = [a, &b]() { b++; return a + b; }; // Mixed capture
```

**Explanation:**
Capture by value creates copies of variables in the lambda's closure, making the lambda independent of the original variables' lifetimes but unable to modify them (unless marked `mutable`). Capture by reference stores references, allowing modification and requiring the captured variables to outlive the lambda. Mixed captures provide granular control over which variables are copied versus referenced.

**Key takeaway:** Choose capture mode based on lifetime requirements and whether modification is needed; prefer explicit captures for clarity.

---

#### Q15: What does the mutable keyword do in lambda expressions?
**Difficulty:** #intermediate
**Category:** #lambdas #syntax
**Concepts:** #mutable_lambda #capture_semantics #const_correctness

**Answer:**
`mutable` allows lambdas to modify value-captured variables within the lambda's closure without affecting the original variables.

**Code example:**
```cpp
int x = 0;
auto f = [x]() mutable { 
    x++;  // Modifies lambda's copy, not the original x
    return x; 
};
std::cout << f() << "\n";  // Prints 1
std::cout << x << "\n";    // Prints 0 - original unchanged
```

**Explanation:**
By default, the lambda's `operator()` is const, preventing modification of captured variables. The `mutable` keyword makes `operator()` non-const, allowing modifications to the closure's state. This is useful for stateful lambdas like counters or accumulators. The modifications affect only the lambda's internal copy, not the original variables unless captured by reference.

**Key takeaway:** Use mutable for stateful lambdas that need to modify their captured state across invocations.

---

#### Q16: Can lambdas capture move-only types like std::unique_ptr?
**Difficulty:** #advanced
**Category:** #lambdas #move_semantics
**Concepts:** #move_capture #init_capture #unique_ptr

**Answer:**
Yes, using C++14 init-capture (generalized lambda capture) with move syntax: `[ptr = std::move(ptr)]`.

**Code example:**
```cpp
auto ptr = std::make_unique<int>(42);
auto lambda = [ptr = std::move(ptr)]() { 
    std::cout << *ptr << "\n"; 
};
// ptr is now null; ownership transferred to lambda
lambda();
```

**Explanation:**
C++11 lambdas couldn't capture move-only types by value. C++14 introduced init-capture, which allows initializing captures with arbitrary expressions, including move operations. The syntax `[name = expression]` creates a capture named `name` initialized from `expression`. This enables capturing `std::unique_ptr`, `std::future`, and other move-only types, transferring ownership into the lambda's closure.

**Key takeaway:** Init-capture (C++14) enables capturing move-only types, providing full ownership transfer into lambda closures.

---

#### Q17: What is std::back_inserter and when should you use it?
**Difficulty:** #intermediate
**Category:** #algorithms #iterators
**Concepts:** #iterator_adapters #back_inserter #output_iterator

**Answer:**
`std::back_inserter` creates an output iterator that calls `push_back` on a container, used for algorithm outputs that grow the container.

**Code example:**
```cpp
std::vector<int> src = {1, 2, 3};
std::vector<int> dst;
std::copy(src.begin(), src.end(), std::back_inserter(dst));
// dst now contains {1, 2, 3}
```

**Explanation:**
Many algorithms write to output iterators, requiring preallocated space. `std::back_inserter` wraps a container, converting assignments to `push_back` calls, automatically growing the container. This is safer and more convenient than pre-sizing the destination container. Similar adapters include `std::front_inserter` (for containers with `push_front`) and `std::inserter` (for arbitrary positions).

**Key takeaway:** Use back_inserter to write algorithm outputs to containers that should grow dynamically.

---

#### Q18: Explain the difference between std::transform and std::for_each.
**Difficulty:** #intermediate
**Category:** #algorithms #stl_fundamentals
**Concepts:** #transform #for_each #functional_programming

**Answer:**
`std::transform` applies a function to elements and writes results to an output range, while `std::for_each` applies a function for side effects without producing output.

**Code example:**
```cpp
std::vector<int> v = {1, 2, 3};

// Transform: creates new values
std::vector<int> squares;
std::transform(v.begin(), v.end(), std::back_inserter(squares),
               [](int x) { return x * x; });

// For_each: side effects only
std::for_each(v.begin(), v.end(), [](int x) { 
    std::cout << x << " "; 
});
```

**Explanation:**
`std::transform` is a functional transformation that maps input values to output values, writing to a potentially different container. It's ideal for creating derived data. `std::for_each` executes a function on each element without producing output values, suitable for operations like printing, logging, or modifying elements in-place. The returned functor from `for_each` can be used to access accumulated state.

**Key takeaway:** Use transform for functional transformations with output, for_each for side-effect operations.

---

#### Q19: Why might std::remove not actually remove elements from a container?
**Difficulty:** #advanced
**Category:** #algorithms #iterators
**Concepts:** #remove_erase_idiom #algorithm_semantics #container_modification

**Answer:**
`std::remove` reorders elements and returns an iterator to the new end but doesn't change container size; you must call `erase` to actually remove elements.

**Code example:**
```cpp
std::vector<int> v = {1, 2, 3, 2, 4};
auto new_end = std::remove(v.begin(), v.end(), 2);
// v might be {1, 3, 4, ?, ?} - size unchanged
// Must erase the tail:
v.erase(new_end, v.end());  // ✅ Actually removes elements
```

**Explanation:**
Algorithms operate through iterators and cannot modify container size, as they don't have access to the container object itself. `std::remove` shifts non-removed elements to the front and returns an iterator to the new logical end, but the container's `size()` remains unchanged. The "erase-remove idiom" combines `remove` with the container's `erase` method to actually remove elements.

**Key takeaway:** Use the erase-remove idiom: `v.erase(std::remove(v.begin(), v.end(), val), v.end())` to actually remove elements.

---

#### Q20: What is the complexity of std::sort?
**Difficulty:** #beginner
**Category:** #algorithms #complexity
**Concepts:** #sort #complexity_analysis #random_access_iterator

**Answer:**
`std::sort` has O(N log N) average and worst-case complexity for comparison-based sorting.

**Explanation:**
The C++ standard requires `std::sort` to be O(N log N) in the worst case since C++11. Most implementations use introsort (introspective sort), which starts with quicksort, switches to heapsort if recursion depth exceeds a threshold (avoiding quicksort's O(N²) worst case), and uses insertion sort for small partitions. This hybrid approach ensures both good average performance and guaranteed worst-case complexity.

**Key takeaway:** std::sort guarantees O(N log N) worst-case performance using hybrid sorting algorithms.

---

#### Q21: How does std::stable_sort differ from std::sort?
**Difficulty:** #intermediate
**Category:** #algorithms #sorting
**Concepts:** #stable_sort #sort_stability #complexity_analysis

**Answer:**
`std::stable_sort` preserves relative order of equivalent elements, while `std::sort` does not guarantee this, in exchange for potentially using O(N) extra space.

**Code example:**
```cpp
struct Person { std::string name; int age; };
std::vector<Person> people = {{"Alice", 30}, {"Bob", 25}, {"Charlie", 30}};

// Stable sort by age preserves name order for equal ages
std::stable_sort(people.begin(), people.end(), 
                 [](const Person& a, const Person& b) { 
                     return a.age < b.age; 
                 });
```

**Explanation:**
When sorting by one key, stability preserves the existing order for elements with equal keys. This is crucial for multi-level sorting (sort by secondary key, then stably sort by primary key). `std::stable_sort` typically uses merge sort, which requires O(N) extra space but guarantees stability. Regular `std::sort` may reorder equivalent elements, making it unsuitable when order matters.

**Key takeaway:** Use stable_sort when relative order of equivalent elements must be preserved, accepting the O(N) space overhead.

---

#### Q22: Can you use std::accumulate with non-numeric types?
**Difficulty:** #intermediate
**Category:** #algorithms #numeric
**Concepts:** #accumulate #reduction #binary_operation

**Answer:**
Yes, `std::accumulate` works with any type that supports the binary operation, not just numeric types.

**Code example:**
```cpp
std::vector<std::string> words = {"Hello", " ", "World", "!"};
std::string sentence = std::accumulate(
    words.begin(), words.end(), std::string(""),
    [](const std::string& a, const std::string& b) { 
        return a + b; 
    }
);
// sentence == "Hello World!"
```

**Explanation:**
Despite being in the `<numeric>` header, `std::accumulate` is a general-purpose reduction operation. It requires an initial value and a binary operation (defaulting to `operator+`). The binary operation is applied cumulatively: `result = op(result, *it)` for each element. This works with any type supporting the operation, including strings, containers, or custom types.

**Key takeaway:** Accumulate is a general reduction algorithm applicable to any type with an associative binary operation.

---

#### Q23: What is the difference between std::find and std::binary_search?
**Difficulty:** #intermediate
**Category:** #algorithms #search
**Concepts:** #find #binary_search #sorted_ranges #complexity

**Answer:**
`std::find` performs linear search on any range (O(N)), while `std::binary_search` requires a sorted range and runs in O(log N), returning only a boolean.

**Code example:**
```cpp
std::vector<int> v = {5, 2, 8, 1, 9};
auto it = std::find(v.begin(), v.end(), 8);  // O(N) linear search
// it points to the element 8

std::vector<int> sorted = {1, 2, 5, 8, 9};
bool found = std::binary_search(sorted.begin(), sorted.end(), 8);  // O(log N)
// found == true, but no iterator returned
```

**Explanation:**
`std::find` iterates through elements sequentially until finding a match or reaching the end, suitable for unsorted data. `std::binary_search` exploits sorted order for logarithmic search but only returns whether the element exists. For iterator access in sorted ranges, use `std::lower_bound` or `std::equal_range` instead, which also run in O(log N).

**Key takeaway:** Use find for unsorted data, binary_search (or lower_bound) for sorted data to leverage logarithmic complexity.

---

#### Q24: Explain the purpose of std::count_if vs std::any_of.
**Difficulty:** #intermediate
**Category:** #algorithms #predicates
**Concepts:** #count_if #any_of #algorithm_semantics

**Answer:**
`std::count_if` counts all elements satisfying a predicate, while `std::any_of` short-circuits returning true once a match is found.

**Code example:**
```cpp
std::vector<int> v = {1, 2, 3, 4, 5};

// Count all even numbers - always scans entire range
int count = std::count_if(v.begin(), v.end(), 
                          [](int x) { return x % 2 == 0; });

// Check if any even exists - stops at first match
bool has_even = std::any_of(v.begin(), v.end(),
                            [](int x) { return x % 2 == 0; });
```

**Explanation:**
`std::count_if` must examine every element to produce a count, always O(N). `std::any_of` is an existence check that returns immediately upon finding the first match, potentially faster in practice. Similar algorithms include `std::all_of` (check all match) and `std::none_of` (check none match). Choose based on whether you need a count or just a boolean answer.

**Key takeaway:** Use any_of/all_of/none_of for existence checks that can short-circuit; use count_if when you need the actual count.

---

#### Q25: What is perfect forwarding and how do lambdas support it?
**Difficulty:** #advanced
**Category:** #lambdas #templates
**Concepts:** #perfect_forwarding #universal_references #move_semantics

**Answer:**
Perfect forwarding preserves value categories (lvalue/rvalue) when passing arguments, enabled in generic lambdas through forwarding references and std::forward.

**Code example:**
```cpp
// C++14 generic lambda with perfect forwarding
auto forwarder = [](auto&&... args) {
    return function(std::forward<decltype(args)>(args)...);
};

forwarder(42);          // Forwards rvalue
int x = 10;
forwarder(x);           // Forwards lvalue
forwarder(std::move(x)); // Forwards rvalue
```

**Explanation:**
Perfect forwarding allows wrapper functions to pass arguments to callees preserving lvalue/rvalue categories, enabling move semantics when applicable. Generic lambdas (C++14) with `auto&&` parameters create forwarding references that bind to both lvalues and rvalues. Using `std::forward<decltype(args)>(args)` casts to the appropriate value category. This pattern is essential for writing generic wrappers that don't impose copying overhead.

**Key takeaway:** Generic lambdas with auto&& and std::forward enable perfect forwarding, preserving value categories without unnecessary copies.

---

#### Q26: Why shouldn't you capture local variables by reference in a lambda that outlives their scope?
**Difficulty:** #intermediate
**Category:** #lambdas #memory_management
**Concepts:** #dangling_references #lifetime_issues #undefined_behavior

**Answer:**
Reference captures store references to variables, leading to dangling references and undefined behavior if the lambda outlives the captured variables' scope.

**Code example:**
```cpp
std::function<int()> makeCounter() {
    int count = 0;
    return [&count]() { return ++count; };  // ❌ Dangling reference
}

auto counter = makeCounter();
counter();  // ❌ Undefined behavior - count is destroyed
```

**Explanation:**
Lambda captures create references to existing variables, not copies of their values (unless captured by value). When the captured variable's lifetime ends (e.g., local variable goes out of scope), the reference becomes dangling. Subsequent lambda invocations access destroyed objects, causing undefined behavior. Solutions include capturing by value, using shared_ptr for shared state, or ensuring the lambda doesn't outlive captured references.

**Key takeaway:** Reference captures must not outlive the captured variables' lifetimes; capture by value or use smart pointers for extended lifetimes.

---

#### Q27: How do STL algorithms handle exceptions during execution?
**Difficulty:** #advanced
**Category:** #algorithms #exception_safety
**Concepts:** #exception_safety #strong_guarantee #algorithm_correctness

**Answer:**
Most STL algorithms provide basic exception safety (no leaks, valid state) but not strong exception safety (rollback on failure), with exceptions for specific algorithms.

**Explanation:**
If an algorithm's operation (like the predicate function, comparator, or value construction) throws an exception, the algorithm generally stops and propagates the exception. The container is left in a valid but unspecified state - no memory leaks occur, but the partial work isn't rolled back. For example, if `std::transform` throws halfway through, already-transformed elements remain changed. Some algorithms like `std::stable_sort` document stronger guarantees. Algorithms never modify container size directly, which limits potential inconsistencies.

**Key takeaway:** STL algorithms provide basic exception safety; ensure operations passed to algorithms either don't throw or handle partial execution gracefully.

---

#### Q28: What is the difference between std::move and std::forward?
**Difficulty:** #advanced
**Category:** #move_semantics #templates
**Concepts:** #move #forward #value_categories #perfect_forwarding

**Answer:**
`std::move` unconditionally casts to rvalue, while `std::forward` conditionally casts to rvalue only if the argument was originally an rvalue.

**Code example:**
```cpp
void process(int&& x) { }  // Takes rvalue

template<typename T>
void wrapper1(T&& arg) {
    process(std::move(arg));     // Always treats as rvalue
}

template<typename T>
void wrapper2(T&& arg) {
    process(std::forward<T>(arg)); // Preserves original category
}

int x = 10;
wrapper1(x);  // Moves even though x is lvalue
wrapper2(x);  // Error: tries to pass lvalue to rvalue reference
wrapper2(std::move(x));  // OK: original was rvalue
```

**Explanation:**
`std::move` is a simple cast to rvalue reference, indicating "this object can be pilfered." `std::forward` is used in templates with universal references (`T&&`) to preserve the original value category - if called with an lvalue, it forwards as lvalue; if called with rvalue, it forwards as rvalue. This enables perfect forwarding in generic code. Using `std::move` everywhere would prevent passing lvalues through forwarding chains.

**Key takeaway:** Use move to explicitly enable move semantics, use forward in template forwarding contexts to preserve value categories.

---

#### Q29: Can algorithms modify container size?
**Difficulty:** #beginner
**Category:** #algorithms #containers
**Concepts:** #algorithm_constraints #iterator_semantics #erase_remove_idiom

**Answer:**
No, STL algorithms operate through iterators and cannot modify container size; only container member functions can change size.

**Explanation:**
Algorithms are designed to be generic, working with any iterator range regardless of whether it comes from a container or other source (like raw arrays or I/O streams). They don't have access to the container object, only iterators. Operations like `std::remove` logically remove elements by reordering but cannot actually shrink the container. To physically remove elements, you must call the container's `erase` member function with the iterator returned by the algorithm.

**Key takeaway:** Algorithms cannot change container size; use container member functions like erase in combination with algorithms.

---

#### Q30: What is std::execution::par and how does it relate to algorithms?
**Difficulty:** #advanced
**Category:** #algorithms #parallelism
**Concepts:** #parallel_algorithms #execution_policy #c++17

**Answer:**
`std::execution::par` is an execution policy (C++17) that instructs algorithms to execute in parallel across multiple threads when possible.

**Code example:**
```cpp
#include <execution>
#include <algorithm>

std::vector<int> v(1000000);
// Sequential execution
std::sort(v.begin(), v.end());

// Parallel execution
std::sort(std::execution::par, v.begin(), v.end());
```

**Explanation:**
C++17 introduced execution policies that can be passed as the first argument to many STL algorithms. Policies include `seq` (sequential), `par` (parallel), and `par_unseq` (parallel and vectorized). When using parallel policies, the algorithm may spawn threads and distribute work across cores. This requires that operations (comparators, predicates, etc.) are thread-safe. Not all algorithms support execution policies, and compiler/library support varies.

**Key takeaway:** Execution policies (C++17) enable parallel algorithm execution, potentially providing significant speedups on multi-core systems.

---

#### Q31: How does std::reduce differ from std::accumulate?
**Difficulty:** #intermediate
**Category:** #algorithms #numeric
**Concepts:** #reduce #accumulate #parallelism #commutativity

**Answer:**
`std::reduce` (C++17) can execute in parallel and requires commutative and associative operations, while `std::accumulate` is sequential and processes left-to-right.

**Code example:**
```cpp
std::vector<int> v = {1, 2, 3, 4, 5};

// Accumulate: left-to-right, sequential
int sum1 = std::accumulate(v.begin(), v.end(), 0);

// Reduce: potentially parallel, any order
int sum2 = std::reduce(std::execution::par, v.begin(), v.end(), 0);
```

**Explanation:**
`std::accumulate` processes elements in strict left-to-right order, making it suitable for non-commutative operations but preventing parallelization. `std::reduce` may process elements in any order and combine partial results in any order, enabling parallel execution but requiring that the operation be both commutative (a op b == b op a) and associative ((a op b) op c == a op (b op c)). Addition and multiplication satisfy these properties, but string concatenation and some other operations may not.

**Key takeaway:** Use reduce for parallel summation/reduction when operations are commutative and associative; use accumulate for sequential order-dependent operations.

---

#### Q32: What is a projection in C++20 ranges and algorithms?
**Difficulty:** #advanced
**Category:** #algorithms #ranges
**Concepts:** #projection #c++20_ranges #algorithm_customization

**Answer:**
A projection is a function applied to elements before comparison/operation, simplifying algorithms that would otherwise require writing custom comparators.

**Code example:**
```cpp
#include <ranges>
#include <algorithm>

struct Person { std::string name; int age; };
std::vector<Person> people = {{"Alice", 30}, {"Bob", 25}};

// C++20: sort by age using projection
std::ranges::sort(people, {}, &Person::age);

// C++17: required custom comparator
std::sort(people.begin(), people.end(),
          [](const Person& a, const Person& b) { 
              return a.age < b.age; 
          });
```

**Explanation:**
C++20 ranges algorithms accept an optional projection parameter (third argument after predicate) that transforms elements before the comparison or operation. This eliminates boilerplate comparators for common cases like sorting by a member variable. The projection can be a member pointer, lambda, or any callable. This design pattern is inspired by functional programming's map-filter-reduce paradigm.

**Key takeaway:** C++20 projections simplify algorithms by allowing inline transformations, reducing the need for custom comparators.

---

#### Q33: Why can't you use std::find_if with raw C arrays directly?
**Difficulty:** #intermediate
**Category:** #algorithms #iterators
**Concepts:** #iterator_decay #array_to_pointer_decay #algorithm_requirements

**Answer:**
You can use algorithms with C arrays because arrays decay to pointers, which satisfy random access iterator requirements.

**Code example:**
```cpp
int arr[] = {1, 2, 3, 4, 5};

// Arrays decay to pointers, which are valid iterators
auto it = std::find_if(arr, arr + 5, [](int x) { return x > 3; });

// Using std::begin/std::end
auto it2 = std::find_if(std::begin(arr), std::end(arr), 
                        [](int x) { return x > 3; });
```

**Explanation:**
C arrays decay to pointers, and pointers satisfy the random access iterator concept. STL algorithms work with iterator ranges, not specifically container types, so raw pointers work perfectly. The challenge is obtaining the end pointer correctly - you must add the array size. C++11's `std::begin` and `std::end` work with arrays, automatically deducing size and providing the correct pointers.

**Key takeaway:** Algorithms work with C arrays because pointers satisfy iterator requirements; use std::begin/end for safe array bounds.

---

#### Q34: What happens if you pass incompatible iterator types to std::copy?
**Difficulty:** #intermediate
**Category:** #algorithms #type_safety
**Concepts:** #template_instantiation #type_requirements #compile_time_errors

**Answer:**
If the output iterator cannot accept assignments of the input iterator's value type, compilation fails with template instantiation errors.

**Code example:**
```cpp
std::vector<int> src = {1, 2, 3};
std::vector<std::string> dst;

// ❌ Compile error: cannot assign int to string
// std::copy(src.begin(), src.end(), std::back_inserter(dst));

// ✅ Must transform during copy
std::transform(src.begin(), src.end(), std::back_inserter(dst),
               [](int x) { return std::to_string(x); });
```

**Explanation:**
STL algorithms use templates that instantiate based on the iterator types provided. If the assignment `*output = *input` is invalid, compilation fails. The error messages can be cryptic, buried in template instantiation stacks. In C++20, concepts would catch this with clearer errors. The solution is either ensuring compatible types or using algorithms that transform values, like `std::transform`.

**Key takeaway:** STL algorithms require compatible value types between input and output; use transform when type conversion is needed.

---

#### Q35: How do algorithms interact with proxy iterators like those in std::vector<bool>?
**Difficulty:** #advanced
**Category:** #algorithms #proxy_references
**Concepts:** #vector_bool #proxy_iterators #reference_binding

**Answer:**
Proxy iterators return temporary proxy objects instead of references, breaking algorithms that take references or use address-of operations.

**Code example:**
```cpp
std::vector<bool> vb = {true, false, true};

// ❌ Problems with proxy references
auto it = vb.begin();
// decltype(*it) is not bool&, but vector<bool>::reference (proxy type)

// Some algorithms work, others may fail
std::count(vb.begin(), vb.end(), true);  // ✅ Works

// Taking address doesn't work
// bool* ptr = &(*vb.begin());  // ❌ Can't take address of temporary
```

**Explanation:**
`std::vector<bool>` uses a space-optimized representation storing bits packed in integers, making true references impossible. Instead, it returns proxy objects that behave like references but aren't actual references. This breaks code expecting `*it` to be an lvalue of `value_type&`. Some algorithms work fine (like those that only read values), while others that take addresses or require real references fail. This is why many consider `vector<bool>` broken.

**Key takeaway:** Vector<bool>'s proxy iterators break some algorithm assumptions; prefer std::deque<bool> or bitset for better compatibility.

---

#### Q36: What is the purpose of std::make_heap and related heap algorithms?
**Difficulty:** #intermediate
**Category:** #algorithms #data_structures
**Concepts:** #heap_operations #priority_queue #algorithm_composition

**Answer:**
Heap algorithms (`make_heap`, `push_heap`, `pop_heap`) maintain heap property on ranges, enabling priority queue operations without dedicated containers.

**Code example:**
```cpp
std::vector<int> v = {3, 1, 4, 1, 5, 9};

std::make_heap(v.begin(), v.end());  // Heapify: O(N)
// v is now a max-heap

v.push_back(2);
std::push_heap(v.begin(), v.end());  // Maintain heap after insertion

std::pop_heap(v.begin(), v.end());  // Move max to end
int max = v.back();
v.pop_back();  // Remove max element
```

**Explanation:**
Heap algorithms provide heap operations on arbitrary ranges, typically vectors. `make_heap` rearranges elements into a heap in O(N). `push_heap` assumes the last element is new and sifts it up in O(log N). `pop_heap` moves the max to the end and restores heap property in O(log N). These algorithms enable implementing priority queues directly on vectors, giving more control than `std::priority_queue`.

**Key takeaway:** Heap algorithms provide efficient priority queue operations on sequences, offering flexibility beyond std::priority_queue.

---

#### Q37: Explain the difference between std::copy and std::move (the algorithm).
**Difficulty:** #intermediate
**Category:** #algorithms #move_semantics
**Concepts:** #copy_algorithm #move_algorithm #value_semantics

**Answer:**
`std::copy` copies elements using copy assignment, while `std::move` (the algorithm) moves elements using move assignment when available.

**Code example:**
```cpp
std::vector<std::string> src = {"a", "b", "c"};
std::vector<std::string> dst1(3), dst2(3);

std::copy(src.begin(), src.end(), dst1.begin());
// src elements unchanged, dst1 has copies

std::move(src.begin(), src.end(), dst2.begin());
// src elements moved-from (valid but unspecified state), dst2 has values
```

**Explanation:**
`std::copy` uses the expression `*dst = *src`, which invokes copy assignment. `std::move` (the algorithm, distinct from `std::move` the cast function) uses `*dst = std::move(*src)`, which invokes move assignment. For types with move semantics, this transfers resources instead of copying them. After `std::move` algorithm, source elements are valid but in a moved-from state. Use when you no longer need the source elements.

**Key takeaway:** Use std::copy to preserve source, std::move algorithm to transfer resources when source is expendable.

---

#### Q38: What is the complexity guarantee of std::partition?
**Difficulty:** #intermediate
**Category:** #algorithms #complexity
**Concepts:** #partition #complexity_analysis #algorithm_guarantees

**Answer:**
`std::partition` has O(N) complexity with exactly N predicate evaluations, rearranging elements so those satisfying the predicate come first.

**Code example:**
```cpp
std::vector<int> v = {1, 2, 3, 4, 5, 6};

// Partition: evens first, odds last
auto pivot = std::partition(v.begin(), v.end(), 
                           [](int x) { return x % 2 == 0; });

// v might be: {2, 4, 6, 1, 3, 5}
// pivot points to first odd element
```

**Explanation:**
`std::partition` reorders elements in-place, placing all elements satisfying the predicate before those not satisfying it, in linear time. It returns an iterator to the first element of the second group. Unlike sorting, partition doesn't order within groups, making it faster (O(N) vs O(N log N)). Variants include `std::stable_partition` (preserves relative order, may use O(N) space) and `std::partition_point` (finds partition point in sorted data).

**Key takeaway:** Partition is an O(N) algorithm for segregating elements by a predicate, faster than sorting when internal order doesn't matter.

---

#### Q39: How does std::lexicographical_compare work?
**Difficulty:** #intermediate
**Category:** #algorithms #comparison
**Concepts:** #lexicographical_comparison #string_comparison #algorithm_semantics

**Answer:**
`std::lexicographical_compare` compares ranges element-wise like dictionary ordering, returning true if the first range is lexicographically less than the second.

**Code example:**
```cpp
std::vector<int> v1 = {1, 2, 3};
std::vector<int> v2 = {1, 2, 4};
std::vector<int> v3 = {1, 2};

bool less1 = std::lexicographical_compare(v1.begin(), v1.end(),
                                         v2.begin(), v2.end());
// true: v1 < v2 (3 < 4 at position 2)

bool less2 = std::lexicographical_compare(v3.begin(), v3.end(),
                                         v1.begin(), v1.end());
// true: v3 < v1 (shorter sequence compares less when prefix matches)
```

**Explanation:**
The algorithm compares corresponding elements until finding a mismatch or reaching the end of a range. If a mismatch is found, it returns whether the first range's element is less than the second's. If one range is a prefix of the other, the shorter one is considered less. This is the ordering used by `std::string`, `std::vector` with `operator<`, and dictionary sorting.

**Key takeaway:** Lexicographical comparison provides dictionary-style ordering for sequences, used by standard container comparison operators.

---

#### Q40: What is the relationship between iterators and ranges in C++20?
**Difficulty:** #advanced
**Category:** #ranges #iterators
**Concepts:** #c++20_ranges #range_concept #sentinel

**Answer:**
C++20 ranges generalize iterator pairs into a single concept, allowing algorithms to work with begin/end pairs, sentinels, and infinite sequences more naturally.

**Code example:**
```cpp
#include <ranges>
#include <vector>

std::vector<int> v = {1, 2, 3, 4, 5, 6, 7, 8, 9, 10};

// C++17: iterator pairs
auto result1 = std::count_if(v.begin(), v.end(), 
                             [](int x) { return x % 2 == 0; });

// C++20: ranges - pass container directly
auto result2 = std::ranges::count_if(v, [](int x) { return x % 2 == 0; });

// Composable range pipelines
auto evens = v | std::views::filter([](int x) { return x % 2 == 0; })
               | std::views::transform([](int x) { return x * x; });
```

**Explanation:**
Ranges abstract iterator pairs into a single entity that knows its bounds. C++20 ranges algorithms accept range objects directly, eliminating repetitive `begin()/end()` calls. Ranges also introduce views - lazy, composable adaptors that don't copy data. The sentinel concept allows ranges with different begin and end types, enabling infinite sequences and more flexible iteration patterns.

**Key takeaway:** C++20 ranges provide composable, lazy sequence abstractions that simplify and modernize algorithm usage beyond iterator pairs.

---

### PRACTICE_TASKS: Challenge Questions

#### Q1
```cpp
std::vector<int> v = {1, 2, 3, 4, 5};
auto it = v.begin();
v.reserve(100);
std::cout << *it;
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** May print garbage or crash (UB)

**Explanation:** `reserve` may reallocate, invalidating `it`

**Key Concept:** #iterator_invalidation

</details>

---

#### Q2
```cpp
std::list<int> lst = {5, 3, 1, 4, 2};
std::sort(lst.begin(), lst.end());
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Compilation error

**Explanation:** `std::sort` requires random access iterators, list has bidirectional

**Key Concept:** #iterator_categories

</details>

---

#### Q3
```cpp
std::vector<int> v = {1, 2, 3, 4, 5};
auto new_end = std::remove(v.begin(), v.end(), 3);
std::cout << v.size();
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Prints 5

**Explanation:** `remove` doesn't change container size, only reorders elements

**Key Concept:** #remove_erase_idiom

</details>

---

#### Q4
```cpp
int x = 10;
auto f = [x]() mutable { x++; return x; };
std::cout << f() << " " << x;
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Prints "11 10"

**Explanation:** `mutable` allows modifying captured copy, original `x` unchanged

**Key Concept:** #mutable_lambda

</details>

---

#### Q5
```cpp
std::vector<int> v = {1, 2, 3};
std::transform(v.begin(), v.end(), std::back_inserter(v), 
               [](int x) { return x * 2; });
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Undefined behavior

**Explanation:** Appending while iterating invalidates iterators

**Key Concept:** #iterator_invalidation

</details>

---

#### Q6
```cpp
std::vector<int> v = {10, 20, 30, 40};
auto rit = std::find(v.rbegin(), v.rend(), 30);
auto it = rit.base();
std::cout << *it;
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Prints 40

**Explanation:** Reverse iterator's `base()` points one position after

**Key Concept:** #reverse_iterator

</details>

---

#### Q7
```cpp
template<typename T>
class MyAlloc {
public:
    using value_type = T;
    T* allocate(std::size_t n) { return new T[n]; }
    void deallocate(T* p, std::size_t) { delete[] p; }
};

std::list<int, MyAlloc<int>> lst;
lst.push_back(42);
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Compilation error

**Explanation:** Allocator missing `rebind` template required by `std::list`

**Key Concept:** #allocator_rebind

</details>

---

#### Q8
```cpp
std::vector<int> v = {3, 1, 4, 1, 5, 9, 2, 6};
auto dist = std::distance(v.begin(), v.end());
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Prints 8

**Explanation:** `distance` is O(1) for random access iterators (vector)

**Key Concept:** #iterator_complexity

</details>

---

#### Q9
```cpp
std::vector<int> v = {1, 2, 3, 4, 5};
for (auto it = v.begin(); it != v.end(); ++it) {
    if (*it % 2 == 0) {
        v.erase(it);
    }
}
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Undefined behavior

**Explanation:** Erasing invalidates iterator, then incrementing causes UB

**Key Concept:** #iterator_invalidation

</details>

---

#### Q10
```cpp
std::unordered_map<std::string, int> m = {{"a", 1}, {"b", 2}};
std::for_each(m.begin(), m.end(), [](auto& pair) {
    const_cast<std::string&>(pair.first) = "x";
});
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Undefined behavior

**Explanation:** Modifying keys in hash map breaks internal structure

**Key Concept:** #undefined_behavior

</details>

---

#### Q11
```cpp
auto ptr = std::make_unique<int>(42);
auto lambda = [ptr = std::move(ptr)]() { return *ptr; };
std::cout << lambda();
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Prints 42

**Explanation:** C++14 init-capture moves `unique_ptr` into lambda

**Key Concept:** #move_capture

</details>

---

#### Q12
```cpp
std::vector<int> v = {5, 2, 8, 1, 9};
bool found = std::binary_search(v.begin(), v.end(), 8);
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Prints false (or true if lucky)

**Explanation:** `binary_search` requires sorted input; `v` is unsorted

**Key Concept:** #algorithm_preconditions

</details>

---

#### Q13
```cpp
std::vector<int> v = {1, 2, 3, 4, 5};
std::vector<int> result;
std::copy_if(v.begin(), v.end(), result.begin(),
             [](int x) { return x % 2 == 0; });
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Undefined behavior or empty

**Explanation:** Writing to unallocated space; should use `back_inserter`

**Key Concept:** #output_iterator

</details>

---

#### Q14
```cpp
std::vector<std::string> v = {"hello", " ", "world"};
std::string result = std::accumulate(v.begin(), v.end(), std::string(""));
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Compilation error

**Explanation:** `accumulate` with string requires specifying initial value type

**Key Concept:** #accumulate_type

</details>

---

#### Q15
```cpp
std::vector<int> v;
v.reserve(10);
v[5] = 100;
std::cout << v[5];
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Undefined behavior

**Explanation:** `reserve` doesn't construct elements; accessing uninitialized memory

**Key Concept:** #reserve_vs_resize

</details>

---

#### Q16
```cpp
std::deque<int> d = {1, 2, 3};
auto it = d.begin();
d.push_front(0);
std::cout << *it;
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** May be invalid

**Explanation:** `push_front` on deque may invalidate iterators

**Key Concept:** #iterator_invalidation

</details>

---

#### Q17
```cpp
std::list<int> a = {1, 2, 3};
std::list<int> b = {4, 5, 6};
auto it = a.begin();
++it;
a.splice(it, b);
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Moves `b` contents before second element of `a`

**Explanation:** `splice` moves elements in O(1), `b` becomes empty

**Key Concept:** #splice_semantics

</details>

---

#### Q18
```cpp
std::vector<int> v = {3, 1, 4, 1, 5, 9};
auto mid = v.begin() + v.size() / 2;
std::nth_element(v.begin(), mid, v.end());
std::cout << *mid;
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Prints 4 (or nearby value)

**Explanation:** `nth_element` partially sorts, placing nth element correctly

**Key Concept:** #nth_element

</details>

---

#### Q19
```cpp
std::function<int()> makeCounter() {
    int count = 0;
    return [&count]() { return ++count; };
}
auto counter = makeCounter();
std::cout << counter();
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Undefined behavior

**Explanation:** Capturing local by reference; `count` destroyed before lambda use

**Key Concept:** #dangling_reference

</details>

---

#### Q20
```cpp
std::vector<int> v = {1, 2, 2, 3, 3, 3, 4, 4, 4, 4};
auto [first, last] = std::equal_range(v.begin(), v.end(), 3);
std::cout << std::distance(first, last);
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Prints 3

**Explanation:** `equal_range` returns range of elements equal to 3

**Key Concept:** #binary_search_variants

</details>

---


### QUICK_REFERENCE: Answer Key and Summary Tables

#### Answer Key for Practice Questions

| Q# | Answer | Explanation | Key Concept |
|----|--------|-------------|-------------|
| 1 | May print garbage or crash (UB) | `reserve` may reallocate, invalidating `it` | #iterator_invalidation |
| 2 | Compilation error | `std::sort` requires random access iterators, list has bidirectional | #iterator_categories |
| 3 | Prints 5 | `remove` doesn't change container size, only reorders elements | #remove_erase_idiom |
| 4 | Prints "11 10" | `mutable` allows modifying captured copy, original `x` unchanged | #mutable_lambda |
| 5 | Undefined behavior | Appending while iterating invalidates iterators | #iterator_invalidation |
| 6 | Prints 40 | Reverse iterator's `base()` points one position after | #reverse_iterator |
| 7 | Compilation error | Allocator missing `rebind` template required by `std::list` | #allocator_rebind |
| 8 | Prints 8 | `distance` is O(1) for random access iterators (vector) | #iterator_complexity |
| 9 | Undefined behavior | Erasing invalidates iterator, then incrementing causes UB | #iterator_invalidation |
| 10 | Undefined behavior | Modifying keys in hash map breaks internal structure | #undefined_behavior |
| 11 | Prints 42 | C++14 init-capture moves `unique_ptr` into lambda | #move_capture |
| 12 | Prints false (or true if lucky) | `binary_search` requires sorted input; `v` is unsorted | #algorithm_preconditions |
| 13 | Undefined behavior or empty | Writing to unallocated space; should use `back_inserter` | #output_iterator |
| 14 | Compilation error | `accumulate` with string requires specifying initial value type | #accumulate_type |
| 15 | Undefined behavior | `reserve` doesn't construct elements; accessing uninitialized memory | #reserve_vs_resize |
| 16 | May be invalid | `push_front` on deque may invalidate iterators | #iterator_invalidation |
| 17 | Moves `b` contents before second element of `a` | `splice` moves elements in O(1), `b` becomes empty | #splice_semantics |
| 18 | Prints 4 (or nearby value) | `nth_element` partially sorts, placing nth element correctly | #nth_element |
| 19 | Undefined behavior | Capturing local by reference; `count` destroyed before lambda use | #dangling_reference |
| 20 | Prints 3 | `equal_range` returns range of elements equal to 3 | #binary_search_variants |

#### Iterator Categories Comparison

| Category | Operations | Typical Containers | Use Cases |
|----------|-----------|-------------------|-----------|
| Input | `++`, `*` (read), `==`, `!=` | Input streams | Single-pass read |
| Output | `++`, `*` (write) | Output streams, inserters | Single-pass write |
| Forward | Input + multi-pass | `forward_list`, `unordered_set` | Multi-pass read/write |
| Bidirectional | Forward + `--` | `list`, `set`, `map` | Reversible traversal |
| Random Access | Bidirectional + `+`, `-`, `[]` | `vector`, `deque`, arrays | Direct element access |

#### Common Algorithm Complexity

| Algorithm | Complexity | Requirements | Notes |
|-----------|-----------|--------------|-------|
| `std::sort` | O(N log N) | Random access | Worst-case guaranteed since C++11 |
| `std::stable_sort` | O(N log N) | Random access | Preserves order, may use O(N) space |
| `std::find` | O(N) | Input | Linear search |
| `std::binary_search` | O(log N) | Forward, sorted | Returns bool only |
| `std::lower_bound` | O(log N) | Forward, sorted | Returns iterator |
| `std::accumulate` | O(N) | Input | Sequential reduction |
| `std::transform` | O(N) | Input/Output | Element-wise transformation |
| `std::partition` | O(N) | Forward | Doesn't preserve order |
| `std::nth_element` | O(N) average | Random access | Partial sort |

#### Lambda Capture Modes

| Capture | Syntax | Copies? | Can Modify? | Lifetime Concern? |
|---------|--------|---------|-------------|------------------|
| None | `[]` | - | No | No |
| By value (all) | `[=]` | Yes | With `mutable` | No |
| By reference (all) | `[&]` | No | Yes | Yes - dangling refs |
| Specific value | `[x]` | Yes | With `mutable` | No |
| Specific reference | `[&x]` | No | Yes | Yes - if `x` destroyed |
| Mixed | `[x, &y]` | Mixed | Partial | Partial |
| Init capture (C++14) | `[x = expr]` | Depends on expr | With `mutable` | Depends on expr |

#### Allocator Required Members

| Member | Purpose | Required? |
|--------|---------|-----------|
| `value_type` | Type being allocated | Yes |
| `allocate(n)` | Allocate memory for n objects | Yes |
| `deallocate(p, n)` | Deallocate memory | Yes |
| `construct(p, args...)` | Construct object at p | No (has default) |
| `destroy(p)` | Destroy object at p | No (has default) |
| `rebind<U>` | Create allocator for type U | Yes (for node containers) |
| `operator==` | Compare allocators | Yes |
| `operator!=` | Compare allocators | Yes |

#### Common Iterator Invalidation Rules

| Container | `insert` | `erase` | `push_back` | `push_front` |
|-----------|----------|---------|-------------|--------------|
| `vector` | At/after position | At/after position | All if realloc | N/A |
| `deque` | All | All | End iterator only | All iterators |
| `list` | None | Only erased | None | None |
| `forward_list` | None | Only erased | N/A | None |
| `set`/`map` | None | Only erased | N/A | N/A |
| `unordered_set`/`map` | All if rehash | Only erased | All if rehash | N/A |

#### Modern C++ Algorithm Features

| Feature | Standard | Description | Example |
|---------|----------|-------------|---------|
| Execution policies | C++17 | Parallel algorithm execution | `std::sort(std::execution::par, ...)` |
| Ranges | C++20 | Algorithm on ranges, not iterator pairs | `std::ranges::sort(container)` |
| Views | C++20 | Lazy, composable adaptors | `container \| std::views::filter(pred)` |
| Projections | C++20 | Transform before comparison | `std::ranges::sort(v, {}, &Type::member)` |
| Constexpr algorithms | C++20 | Many algorithms usable at compile-time | `constexpr auto result = std::sort(...)` |
