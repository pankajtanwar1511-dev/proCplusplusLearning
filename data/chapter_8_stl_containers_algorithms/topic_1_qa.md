## TOPIC: std::vector - Dynamic Contiguous Array

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
