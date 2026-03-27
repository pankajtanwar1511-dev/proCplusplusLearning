## TOPIC: STL Iterators, Allocators, Algorithms, and Lambdas

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
