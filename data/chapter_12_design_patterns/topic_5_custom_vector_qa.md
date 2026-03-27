## TOPIC: STL-like Custom Vector Implementation

### INTERVIEW_QA: Comprehensive Questions

#### Q1: What is the difference between size and capacity in a Vector?
**Difficulty:** #beginner
**Category:** #memory #fundamentals
**Concepts:** #dynamic_array #vector #capacity_management #memory_allocation

**Answer:**
**Size** is the number of elements currently stored in the vector, while **capacity** is the total number of elements the vector can hold before needing to reallocate memory.

**Code example:**
```cpp
Vector<int> v;
v.reserve(10);
std::cout << v.size();      // 0 (no elements)
std::cout << v.capacity();  // 10 (space for 10 elements)

v.push_back(5);
std::cout << v.size();      // 1 (one element)
std::cout << v.capacity();  // 10 (still space for 10)
```

**Explanation:**
Size tracks constructed elements (accessible via `operator[]`), while capacity tracks allocated memory. When `size == capacity`, the next `push_back()` triggers reallocation (typically doubling capacity). The gap between size and capacity allows for efficient amortized O(1) insertion without reallocating on every `push_back()`.

**Key takeaway:** Use `reserve()` to set capacity without changing size; use `resize()` to change size (construct/destruct elements).

---

#### Q2: Why does Vector typically double its capacity when growing?
**Difficulty:** #beginner
**Category:** #performance #algorithms
**Concepts:** #amortized_analysis #dynamic_array #reallocation #complexity

**Answer:**
Doubling capacity ensures **amortized O(1) insertion** for `push_back()`. If capacity grew by a fixed amount (e.g., +10), insertion would be O(N) amortized.

**Code example:**
```cpp
// Doubling strategy
void push_back(const T& val) {
    if (size == capacity) {
        reserve(capacity == 0 ? 1 : capacity * 2);  // ✅ Double
    }
    data[size++] = val;
}

// ❌ Bad: Fixed increment (O(N) amortized)
void push_back_bad(const T& val) {
    if (size == capacity) {
        reserve(capacity + 10);  // Only grow by 10
    }
    data[size++] = val;
}
```

**Explanation:**
With doubling: inserting N elements requires ~N copies total (1 + 2 + 4 + ... + N ≈ 2N), averaging 2 copies per element (constant). With fixed increment: inserting N elements requires N²/20 copies (1×10 + 2×10 + ... + (N/10)×10), averaging N/10 copies per element (linear). Doubling trades memory overhead (50% unused capacity on average) for time efficiency.

**Key takeaway:** Doubling capacity is a space-time tradeoff that achieves amortized constant-time insertion.

---

#### Q3: What is the copy-and-swap idiom and why is it used in assignment operators?
**Difficulty:** #intermediate
**Category:** #exception_safety #design_pattern
**Concepts:** #copy_and_swap #strong_guarantee #exception_safety #raii

**Answer:**
Copy-and-swap ensures **strong exception safety** in assignment: either the assignment succeeds completely, or the object remains unchanged. It copies the source into a temporary, then swaps internals.

**Code example:**
```cpp
// ✅ Strong exception guarantee
Vector<T>& operator=(const Vector<T>& other) {
    if (this != &other) {
        Vector<T> temp(other);  // May throw, but *this unchanged
        swap(temp);             // noexcept (just pointer swaps)
    }
    return *this;
}

void swap(Vector<T>& other) noexcept {
    std::swap(data, other.data);
    std::swap(size, other.size);
    std::swap(capacity, other.capacity);
}
```

**Explanation:**
Without copy-and-swap, assignment might delete old data first, then throw during copying, leaving the object in a broken state (no data, invalid size). Copy-and-swap does all risky operations (allocation, copying) on a temporary object. If it throws, `*this` is untouched. If it succeeds, `swap()` just exchanges pointers (which doesn't throw). The temporary's destructor cleans up the old data.

**Key takeaway:** Copy-and-swap provides automatic exception safety by leveraging RAII (temp's destructor) and noexcept swap.

---

#### Q4: When do iterators become invalidated in a Vector?
**Difficulty:** #intermediate
**Category:** #memory #iterators
**Concepts:** #iterator_invalidation #reallocation #undefined_behavior #memory_safety

**Answer:**
Iterators are invalidated when the Vector **reallocates** (during `push_back`, `reserve`, `resize` that exceeds capacity) or when elements are **erased**. Accessing invalidated iterators is undefined behavior.

**Code example:**
```cpp
Vector<int> v = {1, 2, 3};
v.reserve(10);  // capacity = 10

auto it = v.begin();
v.push_back(4);  // ✅ No reallocation (capacity sufficient)
std::cout << *it;  // ✅ OK: iterator still valid

// Exceed capacity
for (int i = 5; i < 15; ++i) {
    v.push_back(i);  // ❌ Reallocation at i=11
}
std::cout << *it;  // ❌ UNDEFINED BEHAVIOR: iterator invalidated
```

**Explanation:**
Reallocation involves allocating a new buffer, copying elements, and deleting the old buffer. Iterators (and pointers/references) to the old buffer now point to freed memory. The solution is to either (1) call `reserve()` before a loop to prevent reallocation, or (2) use index-based access instead of iterators when insertions occur.

**Key takeaway:** Always `reserve()` before loops that insert elements, or re-acquire iterators after potential reallocation.

---

#### Q5: What is the difference between reserve() and resize()?
**Difficulty:** #intermediate
**Category:** #memory #fundamentals
**Concepts:** #vector #capacity #size #memory_allocation #element_construction

**Answer:**
`reserve(n)` allocates space for `n` elements without constructing them (changes capacity, not size). `resize(n)` changes the size to `n`, constructing or destructing elements as needed.

**Code example:**
```cpp
Vector<int> v;

v.reserve(100);
std::cout << v.size();      // 0 (no elements constructed)
std::cout << v.capacity();  // 100 (space allocated)
v[50] = 42;  // ❌ UNDEFINED BEHAVIOR: out of bounds

v.resize(100);
std::cout << v.size();      // 100 (elements default-constructed)
std::cout << v.capacity();  // ≥100
v[50] = 42;  // ✅ OK: element exists
```

**Explanation:**
`reserve()` is an optimization: it preallocates memory to avoid multiple reallocations during a series of `push_back()` calls, but doesn't change the number of valid elements. `resize()` actually creates or destroys elements, making them accessible via `operator[]`. Use `reserve()` before inserting many elements for performance, and `resize()` when you need a specific number of elements initialized.

**Key takeaway:** `reserve()` is for optimization (avoid reallocations), `resize()` is for initialization (create elements).

---

#### Q6: Why should move constructors and move assignments be marked noexcept?
**Difficulty:** #intermediate
**Category:** #move_semantics #exception_safety
**Concepts:** #noexcept #move_constructor #move_assignment #stl_compatibility #strong_guarantee

**Answer:**
Marking move operations `noexcept` enables STL containers to use them for strong exception safety. If moves can throw, containers must fall back to copying (slower).

**Code example:**
```cpp
// ✅ Correct: noexcept move operations
Vector(Vector<T>&& other) noexcept {
    data = other.data;
    size = other.size;
    capacity = other.capacity;
    other.data = nullptr;
    other.size = 0;
    other.capacity = 0;
}

Vector<T>& operator=(Vector<T>&& other) noexcept {
    swap(other);
    return *this;
}

// Example: std::vector<Vector<int>> resizing
std::vector<Vector<int>> vec_of_vecs;
vec_of_vecs.reserve(10);
vec_of_vecs.push_back(Vector<int>());  // Uses move if noexcept
```

**Explanation:**
`std::vector` (and other STL containers) check `std::is_nothrow_move_constructible` when reallocating. If your type's move constructor is `noexcept`, it moves elements; otherwise, it copies them for strong exception safety (if move throws during reallocation, the container can't rollback). Moving is typically O(1) (pointer swap), while copying is O(N), so `noexcept` is critical for performance.

**Key takeaway:** Always mark move constructors/assignments `noexcept` unless they can genuinely throw.

---

#### Q7: What is the Rule of Five and how does it apply to Vector?
**Difficulty:** #intermediate
**Category:** #resource_management #design_pattern
**Concepts:** #rule_of_five #raii #copy_constructor #move_constructor #destructor #assignment

**Answer:**
The Rule of Five states: if you define a destructor, copy constructor, copy assignment, move constructor, or move assignment, you should define all five (or explicitly delete them).

**Code example:**
```cpp
template <typename T>
class Vector {
public:
    // 1. Destructor (manages heap memory)
    ~Vector() { delete[] data; }

    // 2. Copy constructor
    Vector(const Vector& other);

    // 3. Copy assignment
    Vector& operator=(const Vector& other);

    // 4. Move constructor
    Vector(Vector&& other) noexcept;

    // 5. Move assignment
    Vector& operator=(Vector&& other) noexcept;
};
```

**Explanation:**
Vector manages a raw pointer (`T* data`), so it needs a custom destructor to free memory. Once you define a destructor, the compiler-generated copy/move operations are wrong: they'd do shallow copies (copying the pointer, not the data), leading to double-delete bugs. You must define all five to correctly handle deep copying (copy ops), resource stealing (move ops), and cleanup (destructor).

**Key takeaway:** Managing raw resources (pointers, file handles) requires implementing all five special member functions.

---

#### Q8: How do you achieve strong exception safety in Vector::reserve()?
**Difficulty:** #advanced
**Category:** #exception_safety #memory
**Concepts:** #strong_guarantee #exception_handling #try_catch #cleanup #memory_leak

**Answer:**
Allocate new memory, copy elements in a try-catch block, clean up on exception, only commit changes on success.

**Code example:**
```cpp
void reserve(std::size_t new_cap) {
    if (new_cap <= capacity) return;

    T* new_data = new T[new_cap];  // May throw (allocation)

    try {
        // Copy existing elements (may throw)
        for (std::size_t i = 0; i < size; ++i) {
            new_data[i] = std::move(data[i]);
        }
    } catch (...) {
        delete[] new_data;  // Clean up on failure
        throw;              // Rethrow exception
    }

    // Success: commit changes
    delete[] data;
    data = new_data;
    capacity = new_cap;
}
```

**Explanation:**
The risky operations are allocation (`new T[new_cap]`) and element copying/moving. If either throws, we must not leave the Vector in a broken state. The try-catch ensures that if copying throws, we delete the new buffer and rethrow the exception, leaving the original `data` pointer untouched. Only after all copying succeeds do we delete the old buffer and update the pointer.

**Key takeaway:** Strong exception safety requires transactional semantics: all-or-nothing, with cleanup on failure.

---

#### Q9: What is iterator invalidation and how do you prevent it?
**Difficulty:** #intermediate
**Category:** #iterators #memory_safety
**Concepts:** #iterator_invalidation #reallocation #reserve #dangling_pointer #memory_management

**Answer:**
Iterator invalidation occurs when a Vector reallocates, making existing iterators point to freed memory. Prevent it by calling `reserve()` before insertion loops or using index-based access.

**Code example:**
```cpp
// ❌ Bug: Iterator invalidation
Vector<int> v = {1, 2, 3};
v.reserve(5);
auto it = v.begin();
for (int i = 0; i < 10; ++i) {
    v.push_back(i);  // Reallocation invalidates 'it'
}
std::cout << *it;  // ❌ UNDEFINED BEHAVIOR

// ✅ Fix 1: Reserve sufficient capacity
Vector<int> v2 = {1, 2, 3};
v2.reserve(13);  // No reallocation up to 13 elements
auto it2 = v2.begin();
for (int i = 0; i < 10; ++i) {
    v2.push_back(i);  // No reallocation
}
std::cout << *it2;  // ✅ OK

// ✅ Fix 2: Use index-based access
Vector<int> v3 = {1, 2, 3};
for (size_t i = 0; i < 10; ++i) {
    v3.push_back(i);
    std::cout << v3[0];  // Always valid (recalculates address)
}
```

**Explanation:**
Iterators are lightweight wrappers around pointers. When reallocation occurs, the old buffer is deleted, but the iterator still holds the old pointer (now dangling). `reserve()` prevents this by preallocating enough space. Index-based access (`v[i]`) recalculates the address each time, so it's always valid even after reallocation.

**Key takeaway:** Call `reserve()` with the final expected size before insertion loops to avoid iterator invalidation.

---

#### Q10: Why is push_back amortized O(1) instead of O(1)?
**Difficulty:** #intermediate
**Category:** #algorithms #performance
**Concepts:** #amortized_analysis #complexity #reallocation #dynamic_array #geometric_growth

**Answer:**
Each `push_back` is O(1) except when reallocation occurs (O(N) to copy all elements). With doubling capacity, reallocations become exponentially rare, averaging to O(1) per insertion.

**Code example:**
```cpp
// Inserting N elements with doubling strategy
Vector<int> v;
for (int i = 0; i < 16; ++i) {
    v.push_back(i);
    // Capacity doubles at i=0,1,2,4,8,16
    // Copies: 0,1,2,4,8 = 15 total copies for 16 insertions
}
// Amortized cost: 15/16 ≈ 0.94 copies per insertion (constant)
```

**Explanation:**
Without doubling (e.g., +1 capacity each time), inserting N elements requires 0+1+2+...+N-1 = N²/2 copies (quadratic). With doubling, inserting N elements requires 1+2+4+8+...+N ≈ 2N copies (linear total), averaging 2 copies per element (constant). This is called **amortized analysis**: distributing rare expensive operations over many cheap ones.

**Key takeaway:** Geometric growth (doubling) transforms O(N) worst-case reallocation into O(1) amortized insertion cost.

---

#### Q11: What happens to a moved-from Vector, and can it still be used?
**Difficulty:** #intermediate
**Category:** #move_semantics #memory_safety
**Concepts:** #moved_from_state #resource_management #valid_but_unspecified #destructor_safety

**Answer:**
A moved-from Vector is in a **valid but unspecified state**. It can be destroyed or reassigned, but accessing elements is undefined behavior.

**Code example:**
```cpp
Vector<int> v1 = {1, 2, 3};
Vector<int> v2 = std::move(v1);

// v1 is moved-from:
// ✅ Can be destroyed (destructor handles nullptr)
// ✅ Can be reassigned: v1 = {4, 5, 6};
// ❌ Accessing elements: v1[0] is undefined behavior (size=0)
// ❌ Using iterators: v1.begin() may be invalid

// Typical moved-from state:
// v1.data = nullptr
// v1.size = 0
// v1.capacity = 0

// Destructor is safe:
// ~Vector() { delete[] data; }  // delete[] nullptr is safe
```

**Explanation:**
Move constructors should leave the moved-from object in a state where the destructor can safely run. For Vector, this means `data = nullptr` (since `delete[] nullptr` is a no-op). The C++ standard requires moved-from objects to be "valid but unspecified", meaning they can be destroyed or reassigned but shouldn't be used otherwise.

**Key takeaway:** After moving, the moved-from object should have safe destructor semantics (nullptr pointers, zero sizes).

---

#### Q12: How do you implement exception-safe push_back?
**Difficulty:** #advanced
**Category:** #exception_safety #implementation
**Concepts:** #strong_guarantee #try_catch #reallocation #rollback #cleanup

**Answer:**
Perform reallocation in a try-catch block, clean up new buffer on failure, only commit on success. Use move semantics to minimize throwing operations.

**Code example:**
```cpp
void push_back(const T& value) {
    if (size == capacity) {
        std::size_t new_cap = capacity == 0 ? 1 : capacity * 2;
        T* new_data = nullptr;

        try {
            new_data = new T[new_cap];  // May throw

            // Move existing elements (prefer move over copy)
            for (std::size_t i = 0; i < size; ++i) {
                new_data[i] = std::move(data[i]);  // May throw
            }
        } catch (...) {
            delete[] new_data;  // Clean up on failure
            throw;              // Rethrow
        }

        // Success: commit changes
        delete[] data;
        data = new_data;
        capacity = new_cap;
    }

    data[size++] = value;  // May throw, but Vector still valid
}
```

**Explanation:**
If allocation fails, `new_data` is nullptr, and `delete[] nullptr` is safe. If moving throws mid-copy, we delete the partially-filled new buffer and rethrow, leaving `data` pointer unchanged. Only after all moves succeed do we delete the old buffer. The final assignment (`data[size++] = value`) can throw, but at this point the Vector is already in a valid state with increased capacity.

**Key takeaway:** Exception safety requires transactional semantics: changes are atomic (all succeed or none).

---

#### Q13: Why does Vector use T* instead of T[] as a member?
**Difficulty:** #intermediate
**Category:** #memory #design_choice
**Concepts:** #dynamic_array #heap_allocation #pointer_arithmetic #reallocation #array_decay

**Answer:**
`T*` allows dynamic reallocation (changing the pointer to a new buffer), while `T[]` is fixed at construction. Vectors need to reallocate as they grow.

**Code example:**
```cpp
// ✅ Correct: T* allows reallocation
class Vector {
    T* data;  // Can be reassigned to new buffer

    void reserve(size_t new_cap) {
        T* new_data = new T[new_cap];
        // ... copy elements ...
        delete[] data;
        data = new_data;  // ✅ OK: reassign pointer
    }
};

// ❌ Wrong: T[] is fixed
class Vector {
    T data[];  // ❌ Can't be resized or reallocated
    // How do you grow this? You can't.
};

// ❌ Also wrong: std::array
class Vector {
    std::array<T, 100> data;  // Fixed size at compile time
    // Can't grow beyond 100 elements
};
```

**Explanation:**
Reallocation requires allocating a new buffer, copying elements, and deleting the old buffer. This only works if the buffer is accessed via a reassignable pointer (`T*`). Arrays (`T[]` or `std::array`) have fixed size and can't be reallocated. The `T*` member is the fundamental building block of dynamic containers.

**Key takeaway:** Use `T*` for dynamic resizable containers; arrays are for fixed-size storage.

---

#### Q14: What is the purpose of shrink_to_fit()?
**Difficulty:** #beginner
**Category:** #memory #optimization
**Concepts:** #capacity_management #memory_overhead #reallocation #memory_optimization

**Answer:**
`shrink_to_fit()` reduces capacity to match size, freeing unused memory. It's useful after removing many elements to reclaim memory.

**Code example:**
```cpp
Vector<int> v;
v.reserve(1000);
for (int i = 0; i < 1000; ++i) {
    v.push_back(i);
}
std::cout << v.size();      // 1000
std::cout << v.capacity();  // 1000

// Remove most elements
for (int i = 0; i < 900; ++i) {
    v.pop_back();
}
std::cout << v.size();      // 100
std::cout << v.capacity();  // 1000 (unchanged!)

v.shrink_to_fit();
std::cout << v.capacity();  // 100 (reduced to match size)
// Freed 900 * sizeof(int) = 3600 bytes
```

**Explanation:**
Removing elements (via `pop_back`, `resize`) doesn't reduce capacity, so memory remains allocated. `shrink_to_fit()` reallocates a smaller buffer matching the current size. This is useful in scenarios like: (1) processing a large dataset, then keeping only summary results, or (2) long-running processes where memory footprint matters.

**Key takeaway:** Use `shrink_to_fit()` to reclaim memory after removing many elements.

---

#### Q15: How would you implement a Vector that supports custom allocators?
**Difficulty:** #advanced
**Category:** #stl_compatibility #memory
**Concepts:** #allocator #template_template_parameter #stl_allocator #memory_management #customization

**Answer:**
Add an `Allocator` template parameter (defaulting to `std::allocator<T>`), and use allocator methods (`allocate`, `deallocate`, `construct`, `destroy`) instead of `new`/`delete`.

**Code example:**
```cpp
template <typename T, typename Allocator = std::allocator<T>>
class Vector {
private:
    T* data;
    std::size_t size;
    std::size_t capacity;
    Allocator alloc;  // Allocator instance

public:
    void reserve(std::size_t new_cap) {
        if (new_cap <= capacity) return;

        // Use allocator instead of new[]
        T* new_data = alloc.allocate(new_cap);

        // Construct elements using allocator
        for (std::size_t i = 0; i < size; ++i) {
            alloc.construct(&new_data[i], std::move(data[i]));
            alloc.destroy(&data[i]);
        }

        alloc.deallocate(data, capacity);
        data = new_data;
        capacity = new_cap;
    }

    ~Vector() {
        for (std::size_t i = 0; i < size; ++i) {
            alloc.destroy(&data[i]);
        }
        alloc.deallocate(data, capacity);
    }
};

// Usage with custom allocator
template <typename T>
class PoolAllocator {
    // ... custom allocation from memory pool ...
};

Vector<int, PoolAllocator<int>> v;  // Uses pool allocator
```

**Explanation:**
Allocators decouple memory allocation from object construction. `allocate(n)` returns raw memory (like `operator new`), `construct(ptr, args...)` calls placement new, `destroy(ptr)` calls destructor, `deallocate(ptr, n)` frees memory. This allows custom memory management (e.g., pool allocators for real-time systems, aligned allocators for SIMD).

**Key takeaway:** Allocator support enables STL-compatible custom memory management.

---

#### Q16: What is the difference between emplace_back and push_back?
**Difficulty:** #intermediate
**Category:** #performance #move_semantics
**Concepts:** #emplace #perfect_forwarding #in_place_construction #variadic_templates #move_semantics

**Answer:**
`push_back` takes a constructed object (copy or move), while `emplace_back` constructs the object in-place using perfect forwarding, avoiding temporary objects.

**Code example:**
```cpp
struct Expensive {
    int x;
    std::string s;

    Expensive(int x, std::string s) : x(x), s(std::move(s)) {
        std::cout << "Expensive constructed\n";
    }

    Expensive(const Expensive&) {
        std::cout << "Expensive copied\n";
    }
};

Vector<Expensive> v;

// push_back: constructs temporary, then moves
v.push_back(Expensive(42, "hello"));
// Output: Expensive constructed (temp)
//         Expensive copied/moved (into vector)

// emplace_back: constructs directly in vector
v.emplace_back(42, "hello");
// Output: Expensive constructed (in-place)
```

**Explanation:**
`push_back(Expensive(42, "hello"))` creates a temporary `Expensive` object, then copies/moves it into the vector (2 operations). `emplace_back(42, "hello")` forwards the arguments to the constructor and constructs the object directly in the vector's memory using placement new (1 operation). This eliminates the temporary and is more efficient for complex types.

**Implementation:**
```cpp
template <typename... Args>
void emplace_back(Args&&... args) {
    if (size == capacity) reserve(capacity == 0 ? 1 : capacity * 2);
    new (&data[size++]) T(std::forward<Args>(args)...);  // Placement new
}
```

**Key takeaway:** Use `emplace_back` for complex types to avoid temporary construction/destruction.

---

#### Q17: How do you prevent memory leaks in Vector when T's destructor throws?
**Difficulty:** #advanced
**Category:** #exception_safety #memory
**Concepts:** #destructor_exceptions #std_terminate #memory_leak #exception_handling #cleanup

**Answer:**
You can't fully prevent termination if T's destructor throws (C++ calls `std::terminate`), but you can use try-catch in cleanup loops to destroy as many elements as possible.

**Code example:**
```cpp
~Vector() {
    // Destroy elements (may throw)
    for (std::size_t i = 0; i < size; ++i) {
        try {
            data[i].~T();  // Explicit destructor call
        } catch (...) {
            // Log error, but continue destroying other elements
            std::cerr << "Element destructor threw at index " << i << "\n";
        }
    }

    // Always deallocate memory (even if some destructors threw)
    delete[] data;
}

// Note: If using placement new (allocator), need explicit destruction:
~Vector() {
    for (std::size_t i = 0; i < size; ++i) {
        try {
            alloc.destroy(&data[i]);
        } catch (...) {
            // Continue
        }
    }
    alloc.deallocate(data, capacity);
}
```

**Explanation:**
C++ standard: destructors should not throw (marked `noexcept` by default in C++11+). If a destructor throws during stack unwinding (exception handling), `std::terminate` is called. In Vector's destructor, we can try-catch around element destruction to log errors and continue, ensuring memory is freed even if some destructors throw. However, if T's destructor throws during exception handling in user code, the program terminates.

**Key takeaway:** Always make destructors `noexcept`; throwing destructors break exception safety guarantees.

---

#### Q18: Why is contiguous memory (Vector) faster than linked memory (list)?
**Difficulty:** #intermediate
**Category:** #performance #hardware
**Concepts:** #cache_locality #memory_hierarchy #cpu_cache #prefetching #sequential_access

**Answer:**
Contiguous memory (Vector) has excellent CPU cache locality: accessing element i+1 after i is fast because the data is already in cache. Linked lists suffer cache misses on each node access.

**Code example:**
```cpp
// Vector: contiguous memory
Vector<int> v = {1, 2, 3, 4, 5};
// Memory: [1][2][3][4][5] (sequential)
// Accessing v[1], v[2], v[3] -> all in same cache line

// std::list: non-contiguous nodes
std::list<int> l = {1, 2, 3, 4, 5};
// Memory: [1|next] -> [2|next] -> [3|next] (scattered)
// Accessing each element -> cache miss

// Benchmark: sum elements
// Vector: ~10ns (all in L1 cache)
// List: ~50ns (pointer chasing, cache misses)
```

**Explanation:**
Modern CPUs have a memory hierarchy: L1 cache (~1ns), L2 (~5ns), L3 (~20ns), RAM (~100ns). When you access `v[0]`, the CPU loads a cache line (64 bytes) containing `v[0]` through `v[15]` (assuming 4-byte ints). Subsequent accesses to `v[1]`-`v[15]` are instant. Lists store each node separately in random memory locations, so each access is a cache miss (100ns). The CPU's prefetcher can predict sequential access patterns (Vector) but not pointer chasing (list).

**Key takeaway:** Use Vector for random access and sequential processing; use list only when frequent insertion/deletion in the middle is required.

---

#### Q19: What is the Small Vector Optimization (SVO) and how would you implement it?
**Difficulty:** #advanced
**Category:** #optimization #memory
**Concepts:** #small_buffer_optimization #union #placement_new #cache_optimization #memory_allocation

**Answer:**
Small Vector Optimization stores a small number of elements inline (without heap allocation) for small sizes. When size exceeds the inline capacity, it switches to heap allocation.

**Code example:**
```cpp
template <typename T, std::size_t InlineCapacity = 16>
class SmallVector {
private:
    std::size_t size;
    std::size_t capacity;

    // Union: either inline storage or heap pointer
    union {
        T inline_storage[InlineCapacity];
        T* heap_storage;
    };

    bool is_heap_allocated() const {
        return capacity > InlineCapacity;
    }

    T* data_ptr() {
        return is_heap_allocated() ? heap_storage : inline_storage;
    }

public:
    SmallVector() : size(0), capacity(InlineCapacity) {
        // Use inline_storage by default (no allocation)
    }

    ~SmallVector() {
        if (is_heap_allocated()) {
            delete[] heap_storage;
        }
    }

    void push_back(const T& value) {
        if (size == capacity) {
            // Transition from inline to heap
            if (!is_heap_allocated()) {
                T* new_data = new T[capacity * 2];
                for (size_t i = 0; i < size; ++i) {
                    new_data[i] = std::move(inline_storage[i]);
                }
                heap_storage = new_data;
                capacity *= 2;
            } else {
                // Already on heap, grow normally
                T* new_data = new T[capacity * 2];
                for (size_t i = 0; i < size; ++i) {
                    new_data[i] = std::move(heap_storage[i]);
                }
                delete[] heap_storage;
                heap_storage = new_data;
                capacity *= 2;
            }
        }
        data_ptr()[size++] = value;
    }

    T& operator[](size_t idx) { return data_ptr()[idx]; }
};

// Usage: No heap allocation for small vectors
SmallVector<int, 8> v;  // First 8 elements stored inline
for (int i = 0; i < 5; ++i) {
    v.push_back(i);  // No malloc (uses inline_storage)
}
v.push_back(10);  // Still inline
v.push_back(11);  // Still inline
v.push_back(12);  // Exceeds capacity=8 -> heap allocation
```

**Explanation:**
Small objects (≤8 elements) benefit from inline storage: no malloc overhead (~100ns), better cache locality (part of the vector object itself). The union lets us reuse the same memory for either inline storage or heap pointer. When transitioning from inline to heap, we allocate heap storage, move elements, and switch the flag.

**Key takeaway:** SVO optimizes the common case of small vectors, avoiding heap allocation for sizes ≤ InlineCapacity.

---

#### Q20: How would you implement a thread-safe Vector?
**Difficulty:** #advanced
**Category:** #concurrency #multithreading
**Concepts:** #thread_safety #mutex #shared_mutex #concurrent_access #lock_free #atomic

**Answer:**
Use a mutex to protect all member functions that modify or read shared state. For reader-writer scenarios, use `std::shared_mutex` (multiple readers, exclusive writer).

**Code example:**
```cpp
#include <mutex>
#include <shared_mutex>

template <typename T>
class ThreadSafeVector {
private:
    T* data;
    std::size_t size;
    std::size_t capacity;
    mutable std::shared_mutex mtx;  // Reader-writer lock

public:
    void push_back(const T& value) {
        std::unique_lock lock(mtx);  // Exclusive lock (writer)

        if (size == capacity) {
            reserve_impl(capacity == 0 ? 1 : capacity * 2);
        }
        data[size++] = value;
    }

    T operator[](std::size_t idx) const {
        std::shared_lock lock(mtx);  // Shared lock (reader)
        return data[idx];  // Return by value (avoid dangling ref)
    }

    std::size_t get_size() const {
        std::shared_lock lock(mtx);
        return size;
    }

private:
    void reserve_impl(std::size_t new_cap) {
        // Called with lock held
        T* new_data = new T[new_cap];
        for (std::size_t i = 0; i < size; ++i) {
            new_data[i] = std::move(data[i]);
        }
        delete[] data;
        data = new_data;
        capacity = new_cap;
    }
};

// Usage: Multiple threads can safely access
ThreadSafeVector<int> v;

// Thread 1: Write
std::thread t1([&]() { v.push_back(42); });

// Thread 2: Read
std::thread t2([&]() { std::cout << v[0]; });

t1.join();
t2.join();
```

**Explanation:**
`std::shared_mutex` allows multiple readers (`std::shared_lock`) or one writer (`std::unique_lock`). Writes (push_back, reserve) require exclusive access. Reads (operator[], size) allow concurrent access. **Important**: Return elements by value (not reference) to avoid dangling references if the vector reallocates after the lock is released.

**Alternative (lock-free)**: For high-performance scenarios, use atomic operations and copy-on-write (COW) semantics, but this is complex and requires deep understanding of memory ordering.

**Key takeaway:** Mutex-based thread safety is simple but may be a bottleneck; lock-free data structures are faster but much harder to implement correctly.

---
