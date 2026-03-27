## TOPIC: Alternative Sequence Containers - Double-Ended Queue and Singly-Linked List

### THEORY_SECTION: Core Concepts and Architecture

#### 1. Internal Structure - Deque's Chunked Architecture vs Forward_List's Singly-Linked Nodes

These two containers represent different design philosophies: **std::deque** provides random access with double-ended efficiency through a chunked array structure, while **std::forward_list** minimizes memory overhead through singly-linked nodes at the cost of bidirectional capabilities.

**Deque Internal Architecture - The Chunked Array Model:**

```cpp
// Conceptual deque structure (simplified)
template<typename T>
class deque {
    T** map_;           // Central array of chunk pointers
    size_t map_size_;   // Number of chunk slots in map
    T** start_chunk_;   // Pointer to first chunk
    T** end_chunk_;     // Pointer to last chunk
    size_t start_offset_;  // Offset of first element in first chunk
    size_t end_offset_;    // Offset past last element in last chunk

    static constexpr size_t CHUNK_SIZE = 512; // Typical implementation
};
```

**Deque Memory Layout Visualization:**

```
Central Map (Array of Chunk Pointers):
┌───────┬───────┬───────┬───────┬───────┐
│ ptr0  │ ptr1  │ ptr2  │ ptr3  │ ptr4  │
└───┬───┴───┬───┴───┬───┴───┬───┴───┬───┘
    │       │       │       │       │
    ↓       ↓       ↓       ↓       ↓
Chunk 0  Chunk 1  Chunk 2  Chunk 3  Chunk 4
┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐
│  10  │ │  11  │ │  12  │ │  13  │ │  14  │
│  20  │ │  21  │ │  22  │ │  23  │ │  24  │
│  ... │ │  ... │ │  ... │ │  ... │ │  ... │
└──────┘ └──────┘ └──────┘ └──────┘ └──────┘
  512B     512B     512B     512B     512B

start_offset_ = index of first element within Chunk 0
end_offset_ = index past last element within Chunk 4
```

**Deque vs Vector vs List - Architecture Comparison:**

| Aspect | std::deque | std::vector | std::list |
|--------|-----------|-------------|-----------|
| **Storage Model** | Dynamic array of fixed chunks | Single contiguous block | Doubly-linked nodes |
| **Chunk Size** | Typically 512B-4KB per chunk | N/A (single block) | N/A (individual nodes) |
| **Central Structure** | Map (array of chunk pointers) | Three pointers (begin, end, cap) | Head/tail pointers |
| **Memory Contiguity** | ❌ Chunks are separate | ✅ Fully contiguous | ❌ Scattered nodes |
| **Reallocation** | ❌ Only map (rare) | ✅ Entire array when full | ❌ Never |
| **Random Access** | ✅ O(1) via chunk calculation | ✅ O(1) via pointer arithmetic | ❌ O(n) traversal |
| **Front Insertion** | ✅ O(1) allocate chunk | ❌ O(n) shift all | ✅ O(1) |
| **Back Insertion** | ✅ O(1) allocate chunk | ✅ O(1) amortized | ✅ O(1) |

**Code Example - Deque Random Access Calculation:**

```cpp
// How deque achieves O(1) random access despite chunked storage:
template<typename T>
T& deque::operator[](size_t index) {
    // Calculate global index from start
    size_t global_index = start_offset_ + index;

    // Determine which chunk
    size_t chunk_number = global_index / CHUNK_SIZE;

    // Determine offset within chunk
    size_t chunk_offset = global_index % CHUNK_SIZE;

    // Access element
    return map_[chunk_number][chunk_offset];
    // ✅ Still O(1): just arithmetic, no traversal!
}
```

**Forward_List Internal Structure - Minimal Singly-Linked Nodes:**

```cpp
// Conceptual forward_list node (simplified)
template<typename T>
struct ForwardListNode {
    T value;                    // Element data
    ForwardListNode* next;      // Only ONE pointer (8 bytes on 64-bit)
    // NO prev pointer - saves 8 bytes per element!
};

// Forward_list container
template<typename T>
class forward_list {
    ForwardListNode<T>* head_;  // Pointer to first node
    // NO tail pointer
    // NO size member (to save overhead in splice_after)
};
```

**Memory Layout - Forward_List vs List:**

```
std::forward_list<int> (Singly-Linked):
Node 1            Node 2            Node 3
┌──────────┐      ┌──────────┐      ┌──────────┐
│ value: 1 │      │ value: 2 │      │ value: 3 │
│ next:  ──┼─────→│ next:  ──┼─────→│ next:null│
└──────────┘      └──────────┘      └──────────┘
 12 bytes          12 bytes          12 bytes
(4B int + 8B ptr) (4B int + 8B ptr) (4B int + 8B ptr)

std::list<int> (Doubly-Linked):
Node 1                Node 2                Node 3
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│ prev: null   │ ┌───→│ prev: Node1  │ ┌───→│ prev: Node2  │
│ value: 1     │ │    │ value: 2     │ │    │ value: 3     │
│ next:  ──────┼─┘    │ next:  ──────┼─┘    │ next: null   │
└──────────────┘      └──────────────┘      └──────────────┘
 20 bytes              20 bytes              20 bytes
(4B + 16B pointers)   (4B + 16B pointers)   (4B + 16B pointers)

Memory savings: 40% less overhead (12B vs 20B per node)
```

**Container Overhead Comparison:**

| Container | Per-Element Overhead | Container Object Size | Total for 1000 ints (64-bit) |
|-----------|---------------------|----------------------|------------------------------|
| **std::vector** | 0 bytes | 24 bytes (3 pointers) | ~4-8KB (depends on capacity) |
| **std::deque** | ~0.1-1 byte (chunk boundaries) | 24-48 bytes (map + offsets) | ~5-7KB |
| **std::list** | 16 bytes (2 pointers) | 24 bytes (head, tail, size) | ~20KB |
| **std::forward_list** | 8 bytes (1 pointer) | 8-16 bytes (head only) | ~12KB |

**Key Architectural Differences:**

| Feature | Deque | Forward_List |
|---------|-------|-------------|
| **Design Goal** | Double-ended + random access | Minimal memory overhead |
| **Traversal** | ✅ Bidirectional + random | ✅ Forward only |
| **Memory Pattern** | Chunked (intra-chunk locality) | Scattered (one node at a time) |
| **Pointer Overhead** | None (elements in chunks) | 8 bytes per element |
| **Allocation Granularity** | 512B-4KB chunks | Per-element (8-12 bytes per alloc) |
| **Contiguous Storage** | ❌ No (chunks separate) | ❌ No (scattered nodes) |
| **C API Compatibility** | ❌ No `.data()` method | ❌ No contiguous storage |

---

#### 2. Operations and Complexity - Double-Ended Efficiency vs Forward-Only Minimalism

Understanding the operational characteristics and complexity of deque and forward_list reveals their optimal use cases and limitations.

**Deque Operations - Double-Ended with Random Access:**

| Operation | Complexity | Implementation | Notes |
|-----------|------------|----------------|-------|
| **push_front()** | ✅ O(1) amortized | Decrement start_offset or allocate new front chunk | Vector is O(n) |
| **push_back()** | ✅ O(1) amortized | Increment end_offset or allocate new back chunk | Same as vector |
| **pop_front()** | ✅ O(1) | Increment start_offset, maybe deallocate chunk | Vector is O(n) |
| **pop_back()** | ✅ O(1) | Decrement end_offset, maybe deallocate chunk | Same as vector |
| **operator[i]** | ✅ O(1) | Chunk calculation: `map[i/SIZE][i%SIZE]` | Slightly slower than vector |
| **at(i)** | ✅ O(1) | Same as `[]` but with bounds checking | Throws `out_of_range` |
| **insert(pos)** | ❌ O(n) | Shift elements (in chunks) | Better if closer to end |
| **erase(pos)** | ❌ O(n) | Shift elements (in chunks) | Better if closer to end |
| **size()** | ✅ O(1) | Cached value | Always O(1) |

**Forward_List Operations - Singly-Linked Constraints:**

| Operation | Complexity | Implementation | Notes |
|-----------|------------|----------------|-------|
| **push_front()** | ✅ O(1) | Create node, set next to head, update head | ✅ Available |
| **push_back()** | ❌ N/A | ❌ Not provided (would be O(n) without tail) | Use list instead |
| **pop_front()** | ✅ O(1) | Update head to head->next, delete old head | ✅ Available |
| **pop_back()** | ❌ N/A | ❌ Not provided (would be O(n)) | Use list instead |
| **insert_after(pos)** | ✅ O(1) | Create node, update pointers | Note: AFTER not BEFORE |
| **erase_after(pos)** | ✅ O(1) | Update pos->next, delete node | Note: AFTER not BEFORE |
| **remove(val)** | O(n) | Traverse and remove matches | Member function |
| **remove_if(pred)** | O(n) | Traverse and remove by predicate | Member function |
| **sort()** | O(n log n) | Merge sort | Member function required |
| **reverse()** | O(n) | Rewire next pointers | Swaps pointers, not data |
| **unique()** | O(n) | Remove consecutive duplicates | Requires sorted list |
| **splice_after(pos, src)** | ✅ O(1) or O(n) | Rewire pointers | O(1) single/whole, O(n) range |
| **size()** | ❌ N/A | ❌ Not provided (use `std::distance`) | Deliberate omission |

**Code Example - Deque Double-Ended Operations:**

```cpp
#include <deque>
#include <iostream>

int main() {
    std::deque<int> dq;

    // ✅ Efficient at BOTH ends
    dq.push_back(1);    // Add to back:  [1]
    dq.push_front(0);   // Add to front: [0, 1]
    dq.push_back(2);    // Add to back:  [0, 1, 2]
    dq.push_front(-1);  // Add to front: [-1, 0, 1, 2]

    std::cout << "Front: " << dq.front() << "\n";  // -1
    std::cout << "Back: " << dq.back() << "\n";    // 2

    dq.pop_front();  // Remove from front: [0, 1, 2]
    dq.pop_back();   // Remove from back:  [0, 1]

    // ✅ Random access
    std::cout << "dq[0] = " << dq[0] << "\n";  // 0 (O(1) access)
    std::cout << "dq[1] = " << dq[1] << "\n";  // 1 (O(1) access)

    // ✅ Compatible with std::sort (has random access iterators)
    dq = {5, 2, 8, 1, 9};
    std::sort(dq.begin(), dq.end());  // ✅ Works!
}
```

**Code Example - Forward_List After-Based Operations:**

```cpp
#include <forward_list>
#include <iostream>

int main() {
    std::forward_list<int> fl = {1, 2, 3, 4, 5};

    // ✅ Insert at front
    fl.push_front(0);  // fl: {0, 1, 2, 3, 4, 5}

    // ✅ Insert AFTER first element using insert_after
    auto it = fl.begin();  // Points to 0
    fl.insert_after(it, 99);  // Insert AFTER 0: {0, 99, 1, 2, 3, 4, 5}

    // ✅ Insert at front using before_begin()
    fl.insert_after(fl.before_begin(), -1);  // {-1, 0, 99, 1, 2, 3, 4, 5}

    // ✅ Erase AFTER first element
    fl.erase_after(fl.begin());  // Erases element AFTER -1 (which is 0)
    // fl: {-1, 99, 1, 2, 3, 4, 5}

    // ❌ NO random access
    // fl[2];  // ❌ Compile error - no operator[]

    // ❌ NO size() function
    // fl.size();  // ❌ Compile error
    size_t size = std::distance(fl.begin(), fl.end());  // ✅ O(n)

    // ❌ NO push_back or pop_back
    // fl.push_back(10);  // ❌ Compile error
}
```

**Iterator Invalidation Rules Comparison:**

| Operation | Deque Invalidation | Forward_List Invalidation | List Invalidation |
|-----------|-------------------|---------------------------|-------------------|
| **push_front/back** | ✅ Usually none (unless map realloc) | ❌ None | ❌ None |
| **insert middle** | ✅ All iterators | ❌ None | ❌ None |
| **erase** | ✅ All iterators | ✅ Only erased element | ✅ Only erased element |
| **clear()** | ✅ All | ✅ All | ✅ All |

**The before_begin() Pattern:**

```cpp
// Why forward_list needs before_begin():
std::forward_list<int> fl = {1, 2, 3};

// ❌ Cannot insert BEFORE begin() directly
// fl.insert(fl.begin(), 0);  // No such overload

// ✅ Use insert_after with before_begin()
fl.insert_after(fl.before_begin(), 0);  // fl: {0, 1, 2, 3}
//                ↑
//         Sentinel iterator representing position BEFORE first element

// ✅ Erase first element using before_begin()
fl.erase_after(fl.before_begin());  // Erases element AFTER before_begin (the first element)
```

**Splice_After - Forward_List's O(1) Transfer:**

```cpp
std::forward_list<int> source = {1, 2, 3, 4, 5};
std::forward_list<int> dest = {10, 20, 30};

auto pos = dest.begin();  // Points to 10

// ✅ Splice entire list AFTER position
dest.splice_after(pos, source);
// dest: {10, 1, 2, 3, 4, 5, 20, 30}
// source: {} (empty)

// ✅ No allocations, no copying - just pointer rewiring!
```

---

#### 3. When to Use Each Container - Performance and Design Trade-offs

Choosing between deque and forward_list (or other containers) depends on specific requirements for access patterns, memory constraints, and operational needs.

**Deque Use Cases and Performance:**

| Scenario | Deque Performance | Comparison to Alternatives |
|----------|-------------------|---------------------------|
| **Queue Implementation (FIFO)** | ✅ Ideal | Vector: O(n) pop_front; List: works but slower random access |
| **Double-Ended Buffer** | ✅ Ideal | Vector: O(n) front ops; List: no random access |
| **Sliding Window Algorithms** | ✅ Ideal | Can remove from front/back efficiently |
| **Stack (LIFO)** | ✅ Works well | Vector also good; deque is std::stack default |
| **Sequential Iteration** | ⚠️ Good (chunk boundaries) | Vector: better (contiguous); List: worse (scattered) |
| **Random Access** | ✅ Good (O(1) but slower than vector) | Vector: best; List: impossible |
| **C API Interoperability** | ❌ No | Need contiguous - use vector |
| **Memory-Constrained** | ⚠️ Moderate overhead | Vector: lower; Forward_list: lowest |

**Code Example - Deque for Queue:**

```cpp
#include <deque>

template<typename T>
class Queue {
    std::deque<T> data_;
public:
    void enqueue(T value) {
        data_.push_back(value);  // ✅ O(1)
    }

    T dequeue() {
        T value = data_.front();
        data_.pop_front();  // ✅ O(1) (vector would be O(n))
        return value;
    }

    bool empty() const { return data_.empty(); }
    size_t size() const { return data_.size(); }
};
```

**Forward_List Use Cases and Performance:**

| Scenario | Forward_List Performance | Comparison to Alternatives |
|----------|--------------------------|---------------------------|
| **Memory-Critical Applications** | ✅ Ideal (50% less than list) | List: 2x memory; Deque: no splice |
| **Forward-Only Traversal** | ✅ Ideal | List: overkill; Vector: reallocation issues |
| **Frequent Front Insert/Erase** | ✅ Ideal (O(1)) | Vector: O(n); Deque: O(1) but more overhead |
| **Splice Operations** | ✅ Ideal (O(1) transfer) | Deque: no splice; Vector: must copy |
| **Stack Implementation** | ✅ Works | Deque/Vector: better cache, have size() |
| **Bidirectional Iteration** | ❌ Impossible | Use list or deque |
| **Random Access** | ❌ Impossible (O(n)) | Use deque or vector |
| **Frequent Size Queries** | ❌ O(n) | Use list, deque, or vector (O(1) size) |

**Memory Efficiency - Forward_List's Main Advantage:**

```cpp
// Scenario: 1 million small integers
std::vector<int> vec(1000000);          // ~4MB data + overhead
std::deque<int> dq(1000000);            // ~5-7MB (chunked + map)
std::list<int> lst(1000000);            // ~20MB (16B overhead per element)
std::forward_list<int> fl(1000000);     // ~12MB (8B overhead per element)

// ✅ Forward_list: 40% memory savings vs list
// ✅ Forward_list: Still 3x more than vector (pointer overhead)
// ✅ Use forward_list when list features needed but memory is critical
```

**Decision Matrix - Which Container to Choose:**

| Requirement | Deque | Forward_List | Vector | List |
|-------------|-------|--------------|--------|------|
| **Front insertion O(1)** | ✅ Yes | ✅ Yes | ❌ No | ✅ Yes |
| **Back insertion O(1)** | ✅ Yes | ❌ No | ✅ Yes | ✅ Yes |
| **Random access O(1)** | ✅ Yes | ❌ No | ✅ Yes | ❌ No |
| **Bidirectional iteration** | ✅ Yes | ❌ No | ✅ Yes | ✅ Yes |
| **Iterator stability** | ⚠️ Complex | ✅ Excellent | ❌ Poor | ✅ Excellent |
| **Splice operations** | ❌ No | ✅ Yes | ❌ No | ✅ Yes |
| **Memory efficiency** | ⚠️ Moderate | ✅ Good | ✅ Excellent | ❌ Poor |
| **Cache performance** | ⚠️ Good | ❌ Poor | ✅ Excellent | ❌ Poor |
| **C API compatible** | ❌ No | ❌ No | ✅ Yes | ❌ No |
| **size() O(1)** | ✅ Yes | ❌ No | ✅ Yes | ✅ Yes |

**Real-World Performance Benchmark:**

```cpp
// Task: Process queue of 100,000 tasks (enqueue at back, dequeue from front)

// ✅ Deque: Ideal for this pattern
std::deque<int> dq;
for (int i = 0; i < 100000; ++i) {
    dq.push_back(i);   // O(1)
}
while (!dq.empty()) {
    process(dq.front());
    dq.pop_front();    // O(1)
}
// Time: ~5ms (efficient chunk management)

// ❌ Vector: Poor for this pattern
std::vector<int> vec;
for (int i = 0; i < 100000; ++i) {
    vec.push_back(i);  // O(1)
}
while (!vec.empty()) {
    process(vec.front());
    vec.erase(vec.begin());  // ❌ O(n) - shifts all elements!
}
// Time: ~2500ms (quadratic behavior)

// ✅ List: Works but slower
std::list<int> lst;
for (int i = 0; i < 100000; ++i) {
    lst.push_back(i);  // O(1)
}
while (!lst.empty()) {
    process(lst.front());
    lst.pop_front();   // O(1)
}
// Time: ~15ms (scattered memory, cache misses)

// Result: Deque is 3x faster than list, 500x faster than vector for this use case!
```

**Summary - Container Selection Decision Tree:**

```
Need dynamic sequential container?
├─ YES → Continue
└─ NO → Consider std::array (fixed size)

Need double-ended O(1) operations?
├─ YES → Continue
│   ├─ Also need random access? → Use std::deque
│   └─ No random access needed? → Continue
│       ├─ Need bidirectional iteration? → Use std::list
│       └─ Forward-only sufficient? → Use std::forward_list
└─ NO → Continue

Need only front operations (stack/LIFO)?
├─ YES → Continue
│   ├─ Need size()? → Use std::deque or std::vector
│   └─ Memory-critical? → Use std::forward_list
└─ NO → Continue

Need random access O(1)?
├─ YES → Continue
│   ├─ Need front insert/erase O(1)? → Use std::deque
│   └─ Only back operations? → Use std::vector (best cache)
└─ NO → Continue

Need iterator stability + splice?
├─ YES → Continue
│   ├─ Need bidirectional + size()? → Use std::list
│   └─ Forward-only, memory-critical? → Use std::forward_list
└─ NO → ✅ Use std::vector (default choice)
```

**Best Practices Summary:**

| Practice | Deque | Forward_List |
|----------|-------|-------------|
| **Default Choice?** | ❌ No (use vector) | ❌ No (use list) |
| **When to Use** | Queue, double-ended buffer, sliding window | Memory-critical forward-only, stack in embedded systems |
| **Avoid When** | Need C API interop, pure sequential iteration | Need bidirectional, random access, or size() |
| **Iterator Storage** | ⚠️ Risky (complex invalidation) | ✅ Safe (only erased invalidate) |
| **Prefer Member Functions** | Use std::sort (has random access) | Use member sort/remove/unique (no random access) |
| **Memory Awareness** | Check chunk boundaries for performance | Minimal overhead - use for millions of small elements |

---

### EDGE_CASES: Tricky Scenarios and Deep Internals

#### Edge Case 1: Deque Iterator Invalidation is Complex

Deque's iterator invalidation rules are more nuanced than vector or list because of its chunked structure. The rules vary based on where modifications occur.

```cpp
std::deque<int> dq = {1, 2, 3, 4, 5};
auto it_begin = dq.begin();
auto it_mid = dq.begin() + 2;
auto it_end = dq.end() - 1;

dq.push_back(6);  // ✅ All iterators remain valid
dq.push_front(0); // ✅ All iterators remain valid (values shift but pointers valid)

dq.insert(dq.begin() + 2, 99);  // ❌ May invalidate all iterators
```

Push_front and push_back generally preserve iterator validity unless they cause the central map to reallocate. Middle insertions and erasures invalidate all iterators because elements may shift between chunks. This makes deque less predictable than list for iterator stability but better than vector which invalidates on any reallocation.

#### Edge Case 2: Deque Provides Random Access But Not Contiguous Memory

Deque supports operator[] and random access iterators, but elements aren't in contiguous memory like vector. This affects pointer arithmetic and C API interoperability.

```cpp
std::deque<int> dq = {1, 2, 3, 4, 5};

// ✅ Random access works
int x = dq[2];  // O(1) access

// ❌ Cannot take address of contiguous block
// int* ptr = &dq[0];  // Pointer to first element
// int* ptr2 = &dq[1]; // May not be contiguous with ptr
// ptr[2];  // Undefined if elements span chunks

// ✅ Vector alternative for C API
std::vector<int> v(dq.begin(), dq.end());
c_function(v.data(), v.size());  // Safe with contiguous memory
```

If you need to pass data to C APIs expecting contiguous arrays (e.g., int*), deque doesn't guarantee this. Only vector, array, and string provide contiguous storage guarantees. Deque's random access is achieved through indexing calculations, not memory contiguity.

#### Edge Case 3: Forward_list Has No size() Member

Unlike all other standard containers, forward_list doesn't provide a size() member function. Computing size requires O(n) traversal.

```cpp
std::forward_list<int> fl = {1, 2, 3, 4, 5};

// ❌ No size() function
// size_t sz = fl.size();  // Compile error

// ✅ Must use std::distance for size
size_t sz = std::distance(fl.begin(), fl.end());  // O(n)

// ✅ Check emptiness efficiently
if (fl.empty()) {  // O(1)
    std::cout << "Empty list\n";
}
```

The absence of size() is deliberate—maintaining a size counter would add overhead to operations like splice_after. If you need frequent size queries, forward_list is the wrong choice. Use list, vector, or deque instead. The design philosophy prioritizes minimal overhead over convenience.

#### Edge Case 4: Forward_list Requires before_begin()

Because forward_list can only traverse forward and needs the previous node for insertions, it provides a special before_begin() iterator for front operations.

```cpp
std::forward_list<int> fl = {1, 2, 3};

// ✅ Insert at front using insert_after with before_begin
fl.insert_after(fl.before_begin(), 0);  // fl: {0, 1, 2, 3}

// ❌ No insert_before or push_front without before_begin awareness
// fl.insert(fl.begin(), 0);  // No such overload

// ✅ Erase front element
fl.erase_after(fl.before_begin());  // Removes first element

// ❌ Cannot erase at begin() directly
// fl.erase(fl.begin());  // No such overload
```

All insertion and deletion operations follow the after pattern. To operate on the first element, you reference the position before it using before_begin(). This asymmetry makes forward_list's API less intuitive than other containers but reflects its singly-linked structure.

#### Edge Case 5: Deque Memory Layout Affects Performance

Deque's chunked architecture creates performance characteristics between vector and list. Cache behavior depends on element positions.

```cpp
std::deque<int> dq;

// Elements within same chunk: good cache locality
for (int i = 0; i < 1024; ++i) {
    dq.push_back(i);
}

// Sequential access within chunks: fast
for (size_t i = 0; i < dq.size(); ++i) {
    process(dq[i]);  // Cache-friendly if consecutive elements in same chunk
}

// Random access across chunks: potential cache misses
for (size_t i = 0; i < dq.size(); i += 1000) {
    process(dq[i]);  // May jump between chunks, causing cache misses
}
```

Deque's performance is workload-dependent. Sequential access benefits from intra-chunk locality, but jumping between chunks incurs cache misses. For purely sequential workloads, vector is faster. For double-ended operations, deque's overhead is justified. Always profile with realistic access patterns.

---

### CODE_EXAMPLES: Practical Demonstrations

#### Example 1: Deque Basic Operations

```cpp
#include <deque>
#include <iostream>

int main() {
    std::deque<int> dq;
    
    // ✅ Fast insertion at both ends
    dq.push_back(10);    // dq: {10}
    dq.push_front(5);    // dq: {5, 10}
    dq.push_back(15);    // dq: {5, 10, 15}
    dq.push_front(1);    // dq: {1, 5, 10, 15}
    
    // ✅ Random access
    std::cout << dq[0] << " " << dq[2] << "\n";  // 1 10
    
    // ✅ Remove from both ends
    dq.pop_front();  // dq: {5, 10, 15}
    dq.pop_back();   // dq: {5, 10}
    
    // ✅ Insert in middle (slower than ends)
    dq.insert(dq.begin() + 1, 7);  // dq: {5, 7, 10}
}
```

Deque excels at double-ended operations while maintaining random access capability. This makes it perfect for implementing queues where you need both FIFO operations and occasional indexed access. The cost of middle insertions is between vector (always shifts) and list (never shifts), depending on which end is closer.

#### Example 2: Implementing a Queue with Deque

```cpp
#include <deque>

template<typename T>
class Queue {
    std::deque<T> data;
    
public:
    void enqueue(const T& value) {
        data.push_back(value);  // O(1)
    }
    
    T dequeue() {
        T value = data.front();
        data.pop_front();  // O(1)
        return value;
    }
    
    const T& front() const {
        return data.front();
    }
    
    bool empty() const {
        return data.empty();
    }
    
    size_t size() const {
        return data.size();
    }
};

int main() {
    Queue<int> q;
    q.enqueue(10);
    q.enqueue(20);
    q.enqueue(30);
    
    std::cout << q.dequeue() << "\n";  // 10
    std::cout << q.front() << "\n";    // 20
}
```

Deque is ideal for queue implementations because both enqueue (push_back) and dequeue (pop_front) are O(1). Vector would be O(n) for pop_front, and list lacks random access for potential indexed operations. Standard library's std::queue actually uses deque as its default underlying container.

#### Example 3: Sliding Window with Deque

```cpp
#include <deque>
#include <vector>
#include <iostream>

std::vector<int> maxSlidingWindow(const std::vector<int>& nums, int k) {
    std::deque<int> dq;  // Stores indices
    std::vector<int> result;
    
    for (int i = 0; i < nums.size(); ++i) {
        // Remove indices outside current window
        if (!dq.empty() && dq.front() < i - k + 1) {
            dq.pop_front();
        }
        
        // Remove smaller elements from back (they're useless)
        while (!dq.empty() && nums[dq.back()] < nums[i]) {
            dq.pop_back();
        }
        
        dq.push_back(i);
        
        // Add maximum to result
        if (i >= k - 1) {
            result.push_back(nums[dq.front()]);
        }
    }
    
    return result;
}
```

This sliding window maximum algorithm leverages deque's double-ended operations. Elements can be efficiently removed from both ends as the window slides, maintaining the maximum in O(1) per element. This pattern is common in algorithms requiring a "monotonic queue" structure.

#### Example 4: Forward_list Basic Operations

```cpp
#include <forward_list>
#include <iostream>

int main() {
    std::forward_list<int> fl = {1, 2, 3, 4, 5};
    
    // ✅ Insert at front
    fl.push_front(0);  // fl: {0, 1, 2, 3, 4, 5}
    
    // ✅ Insert after first element
    auto it = fl.begin();
    fl.insert_after(it, 99);  // fl: {0, 99, 1, 2, 3, 4, 5}
    
    // ✅ Erase after first element
    fl.erase_after(fl.begin());  // fl: {0, 1, 2, 3, 4, 5}
    
    // ✅ Access front
    std::cout << fl.front() << "\n";  // 0
    
    // ❌ No back(), no random access, no size()
    // fl.back();   // Compile error
    // fl[2];       // Compile error
    // fl.size();   // Compile error
}
```

Forward_list provides minimal operations reflecting its singly-linked structure. All insertions and deletions use the after pattern, requiring an iterator to the preceding position. For front operations, use before_begin(). The limited API reduces functionality but also reduces memory and computational overhead.

#### Example 5: Forward_list Remove Operations

```cpp
#include <forward_list>

int main() {
    std::forward_list<int> fl = {1, 2, 3, 2, 4, 2, 5};
    
    // ✅ Remove all occurrences of value
    fl.remove(2);  // fl: {1, 3, 4, 5}
    
    std::forward_list<int> fl2 = {1, 2, 3, 4, 5, 6};
    
    // ✅ Remove with predicate
    fl2.remove_if([](int x) { return x % 2 == 0; });
    // fl2: {1, 3, 5}
}
```

Forward_list's remove and remove_if work like list's versions, traversing and removing matching elements in O(n) time. These member functions are more efficient than using algorithms because they can directly manipulate the next pointers during traversal.

#### Example 6: Forward_list Sorting and Merging

```cpp
#include <forward_list>

int main() {
    std::forward_list<int> fl1 = {5, 3, 1, 4, 2};
    std::forward_list<int> fl2 = {8, 6, 7};
    
    // ✅ Sort (member function required)
    fl1.sort();  // fl1: {1, 2, 3, 4, 5}
    fl2.sort();  // fl2: {6, 7, 8}
    
    // ✅ Merge sorted lists
    fl1.merge(fl2);
    // fl1: {1, 2, 3, 4, 5, 6, 7, 8}
    // fl2: {}
    
    // ✅ Custom comparator
    std::forward_list<int> a = {5, 3, 1};
    a.sort(std::greater<int>());  // a: {5, 3, 1}
}
```

Forward_list provides sort and merge operations like list. Sort uses merge sort optimized for forward-only traversal. Merge assumes both lists are sorted and combines them in O(n) time by relinking nodes without copying elements.

#### Example 7: Deque as Double-Ended Buffer

```cpp
#include <deque>
#include <iostream>

class CircularBuffer {
    std::deque<int> buffer;
    size_t max_size;
    
public:
    CircularBuffer(size_t size) : max_size(size) {}
    
    void add(int value) {
        if (buffer.size() == max_size) {
            buffer.pop_front();  // Remove oldest
        }
        buffer.push_back(value);  // Add newest
    }
    
    void add_priority(int value) {
        if (buffer.size() == max_size) {
            buffer.pop_back();  // Remove newest normal
        }
        buffer.push_front(value);  // Add priority at front
    }
    
    void display() const {
        for (int x : buffer) {
            std::cout << x << " ";
        }
        std::cout << "\n";
    }
};

int main() {
    CircularBuffer buf(5);
    for (int i = 1; i <= 6; ++i) {
        buf.add(i * 10);
    }
    buf.display();  // 20 30 40 50 60 (10 was dropped)
    
    buf.add_priority(999);
    buf.display();  // 999 20 30 40 50 (60 was dropped)
}
```

This circular buffer uses deque's double-ended capabilities to manage a fixed-size buffer efficiently. Adding to either end or removing from either end is O(1), making deque perfect for buffers that need flexible management policies.

#### Example 8: Forward_list Splice After

```cpp
#include <forward_list>
#include <iostream>

int main() {
    std::forward_list<int> source = {1, 2, 3, 4, 5};
    std::forward_list<int> dest = {10, 20, 30};
    
    // ✅ Splice entire list after first element of dest
    auto it = dest.begin();
    dest.splice_after(it, source);
    // dest: {10, 1, 2, 3, 4, 5, 20, 30}
    // source: {}
    
    std::forward_list<int> a = {100, 200, 300};
    std::forward_list<int> b = {1, 2, 3};
    
    // ✅ Splice single element
    auto pos_a = a.begin();
    auto pos_b = b.begin();
    a.splice_after(pos_a, b, pos_b);
    // a: {100, 2, 200, 300}
    // b: {1, 3}
    
    std::cout << "Splice is O(1) for single element\n";
}
```

Forward_list's splice_after works like list's splice but follows the after pattern. It transfers nodes without copying, maintaining O(1) complexity for single elements and entire lists. This enables efficient list manipulation and merging strategies.

---

### QUICK_REFERENCE: Answer Key and Summary Tables

#### Answer Key for Practice Questions

| Q# | Answer | Explanation | Key Concept |
|----|--------|-------------|-------------|
| 1 | `5 10` | push_front adds 5 at front, push_back adds 10 at back. front() returns 5, back() returns 10. | #push_operations #double_ended |
| 2 | `3` | pop_front removes first, pop_back removes last. 5 - 2 = 3 elements remain. | #pop_operations #size |
| 3 | `1 99 2 3` | insert at position 1 (before second element) adds 99, shifting others right. | #insert #middle_insertion |
| 4 | `1 2 3 4 5` | std::sort works with deque's random access iterators, sorting in ascending order. | #sort #random_access |
| 5 | `1 5` | operator[] provides O(1) random access. dq[0] is first element, dq[4] is fifth. | #random_access #operator_bracket |
| 6 | `0` | push_front adds 0 to front. front() returns the first element. | #push_front #forward_list |
| 7 | `0` | insert_after with before_begin() inserts at front. front() returns 0. | #insert_after #before_begin |
| 8 | `3` | remove(2) removes all occurrences of 2. Three 2s removed, 3 elements remain: {1, 3, 4}. | #remove #element_removal |
| 9 | `1` | sort() arranges in ascending order. First element after sorting is 1. | #sort #ordering |
| 10 | `5` | reverse() reverses order. Original last element (5) becomes first. | #reverse #pointer_manipulation |
| 11 | `5` | resize(5) grows from 3 to 5 elements by adding 2 default-initialized elements. | #resize #growth |
| 12 | `0 1` | clear() removes all elements. size becomes 0, empty returns true (1). | #clear #empty |
| 13 | `{4, 5, 6, 1, 2, 3}, b is empty` | splice_after at before_begin moves all of b to front of a. | #splice_after #ownership_transfer |
| 14 | `1` | Deque's push_back usually preserves iterators unless map reallocation occurs. | #iterator_stability #push_back |
| 15 | `0` | emplace_front constructs 0 in-place at front. front() returns 0. | #emplace_front #in_place |
| 16 | `4` | erase at position 2 (element 3) removes one element. 5 - 1 = 4. | #erase #removal |
| 17 | `3` | unique() removes consecutive duplicates: {1, 2, 3}. Three elements remain. | #unique #duplicates |
| 18 | `0 3` | Move constructor transfers ownership. dq1 becomes empty, dq2 has 3 elements. | #move_semantics #ownership |
| 19 | `{1, 3, 5}` | remove_if removes even numbers (2, 4). Odd numbers remain. | #remove_if #predicate |
| 20 | `5 40` | push_front(5) adds to front, push_back(40) adds to back. front is 5, back is 40. | #double_ended #push_operations |

#### Container Comparison: Deque vs Vector vs List vs Forward_list

| Feature | deque | vector | list | forward_list |
|---------|-------|--------|------|--------------|
| Memory Layout | Chunked arrays | Contiguous | Doubly-linked nodes | Singly-linked nodes |
| Random Access | ✅ O(1) | ✅ O(1) | ❌ O(n) | ❌ O(n) |
| Push/Pop Front | ✅ O(1) | ❌ O(n) | ✅ O(1) | ✅ O(1) |
| Push/Pop Back | ✅ O(1) | ✅ O(1) | ✅ O(1) | ❌ No back ops |
| Insert/Erase Middle | ❌ O(n) | ❌ O(n) | ✅ O(1) | ✅ O(1) |
| Iterator Stability | ⚠️ Complex | ❌ Poor | ✅ Excellent | ✅ Excellent |
| Iterator Type | RandomAccess | RandomAccess | Bidirectional | Forward |
| Contiguous Memory | ❌ No | ✅ Yes | ❌ No | ❌ No |
| Cache Performance | ⚠️ Moderate | ✅ Excellent | ❌ Poor | ❌ Poor |
| Memory Overhead | Low-Moderate | Low | High (16B/node) | Moderate (8B/node) |
| Size Function | ✅ O(1) | ✅ O(1) | ✅ O(1) | ❌ None |
| Splice Support | ❌ No | ❌ No | ✅ Yes | ✅ Yes (after) |

#### Deque Operations Complexity

| Operation | Time Complexity | Notes |
|-----------|-----------------|-------|
| `push_front()` / `push_back()` | O(1) amortized | May allocate new chunk |
| `pop_front()` / `pop_back()` | O(1) | May deallocate chunk |
| `operator[]` / `at()` | O(1) | Chunk calculation overhead |
| `front()` / `back()` | O(1) | Direct access to ends |
| `insert()` in middle | O(n) | Shifts elements in chunks |
| `erase()` in middle | O(n) | Shifts elements in chunks |
| `clear()` | O(n) | Destroys elements, deallocates chunks |
| `size()` | O(1) | Cached value |
| Random iteration | O(n) | Slight overhead at chunk boundaries |

#### Forward_list Operations Complexity

| Operation | Time Complexity | Notes |
|-----------|-----------------|-------|
| `push_front()` | O(1) | Allocates node |
| `pop_front()` | O(1) | Deallocates node |
| `insert_after()` | O(1) | At given position |
| `erase_after()` | O(1) | At given position |
| `remove()` / `remove_if()` | O(n) | Traverse and remove |
| `sort()` | O(n log n) | Merge sort |
| `reverse()` | O(n) | Rewire next pointers |
| `unique()` | O(n) | Remove consecutive duplicates |
| `splice_after()` | O(1) / O(n) | O(1) single/whole, O(n) range |
| `clear()` | O(n) | Destroys and deallocates all nodes |

#### When to Use Each Container

| Scenario | Best Choice | Reason |
|----------|-------------|--------|
| General purpose sequential storage | vector | Best cache locality and performance |
| Double-ended queue/buffer | deque | O(1) at both ends + random access |
| Frequent mid-container insert/erase | list | O(1) operations with stable iterators |
| Memory-critical forward-only | forward_list | 50% less memory than list |
| Queue (FIFO) implementation | deque | O(1) push_back and pop_front |
| Stack (LIFO) implementation | deque/vector | O(1) back operations |
| Random access + double-ended | deque | Only container with both |
| C API interoperability | vector | Contiguous memory guarantee |
| Iterator stability required | list/forward_list | Modifications don't invalidate |
| Splice/merge operations | list/forward_list | O(1) node transfer |

#### Deque Internal Structure

| Component | Description | Purpose |
|-----------|-------------|---------|
| Map | Central array of chunk pointers | Manages chunk organization |
| Chunks | Fixed-size arrays (512B-4KB typical) | Store actual elements |
| Start pointer | Points to first element in first chunk | Enables front operations |
| End pointer | Points past last element in last chunk | Enables back operations |
| Map growth | Reallocates when no space for chunks | Rare, similar to vector reallocation |

#### Forward_list Design Trade-offs

| Feature Lost | Memory/Complexity Saved | Alternative |
|--------------|------------------------|-------------|
| Bidirectional iteration | 8 bytes per node | Use list if needed |
| size() function | Per-operation overhead | Use std::distance (O(n)) |
| back operations | Implementation complexity | Traverse to end |
| insert() before | Need prev pointer | Use insert_after() |
| Convenience | Reduced memory footprint | Explicit before_begin() |

#### Iterator Invalidation Summary

| Container | push_front/back | insert middle | erase | Notes |
|-----------|----------------|---------------|-------|-------|
| deque | Usually valid | All invalid | All invalid | Unless map reallocates |
| forward_list | All valid | All valid | Only erased | Like list, excellent stability |

#### Memory Overhead Comparison (64-bit systems)

| Container | Overhead per Element | Fixed Overhead | Total for 1000 ints |
|-----------|---------------------|----------------|---------------------|
| vector | 0 bytes | ~24B + capacity waste | ~4-8KB |
| deque | ~0.1-1B | ~24B + map + chunk boundaries | ~5-7KB |
| list | 16 bytes | ~24B | ~20KB |
| forward_list | 8 bytes | ~8-16B | ~12KB |
