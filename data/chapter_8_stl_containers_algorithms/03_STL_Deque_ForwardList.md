# STL Containers: std::deque and std::forward_list

## TOPIC: Alternative Sequence Containers - Double-Ended Queue and Singly-Linked List

### THEORY_SECTION: Core Concepts and Architecture

#### What is std::deque?

**std::deque** (double-ended queue, pronounced "deck") is a sequence container that allows fast insertion and deletion at both ends while maintaining random access capability. Internally, deque is typically implemented as a dynamic array of fixed-size arrays (chunks or blocks), creating a segmented structure. Unlike vector's single contiguous block, deque consists of multiple memory chunks managed through a map (a central array of pointers to these chunks). This design enables O(1) insertions at both front and back without the reallocation penalty that vector incurs for front insertions.

The deque's chunk-based architecture provides a middle ground between vector and list. Each chunk is contiguous, offering good cache locality within a chunk, but chunks themselves may be scattered in memory. The map of chunk pointers grows as needed, and deque can allocate new chunks at either end. Random access is achieved by calculating which chunk contains the desired index and the offset within that chunk, making it slightly slower than vector but still O(1). This structure makes deque ideal for queue implementations, sliding window algorithms, and scenarios requiring efficient operations at both ends.

#### What is std::forward_list?

**std::forward_list** is a singly-linked list introduced in C++11, designed as a minimal-overhead alternative to std::list. Each node contains only the element value and a single next pointer, eliminating the prev pointer that doubly-linked list requires. This reduces memory overhead by 50% (8 bytes per element on 64-bit systems instead of 16) and simplifies node structure. However, the trade-off is that forward_list can only traverse in one direction and lacks several conveniences present in list, such as size() member function, bidirectional iteration, and efficient back() operations.

Forward_list is optimized for scenarios where memory efficiency and forward-only traversal suffice. It's particularly useful in embedded systems or memory-constrained environments where every byte counts. The container provides insert_after and erase_after operations because, without backward pointers, you need a reference to the node before the insertion/deletion point. The before_begin() iterator provides access to a pseudo-position before the first element, enabling front operations to follow the same after-based pattern. Despite these limitations, forward_list offers the same O(1) insertion/deletion benefits as list while using significantly less memory.

#### Why These Containers Matter

Understanding deque and forward_list expands your container toolkit beyond the common vector-list dichotomy. Deque bridges the gap when you need both efficient end operations and random access—perfect for implementing queues, buffers, or maintaining sliding windows. Forward_list addresses the specific niche where list's memory overhead is prohibitive but you don't need bidirectional traversal. Modern C++ emphasizes choosing the right container for the job: vector for general use, list for mid-container modifications with stable iterators, deque for double-ended operations with random access, and forward_list for memory-critical forward-only scenarios. Each container's design reflects specific trade-offs, and understanding these trade-offs is crucial for writing efficient, maintainable code.

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

### INTERVIEW_QA: Core Concepts and Deep Dive

#### Q1: What is std::deque and how does its internal structure differ from std::vector?
**Difficulty:** #beginner
**Category:** #internals #data_structures
**Concepts:** #deque #chunked_array #segmented_storage

**Answer:**
std::deque (double-ended queue) is implemented as a dynamic array of fixed-size chunks, unlike vector's single contiguous block. A central map stores pointers to these chunks, enabling O(1) insertion at both ends.

**Explanation:**
Vector allocates one contiguous block that must be reallocated when capacity is exceeded. Deque maintains multiple fixed-size chunks (typically 512 bytes to 4KB each) organized via a map of pointers. When elements are added at either end, deque allocates new chunks only when needed, avoiding the expensive reallocation and copying that vector requires. Random access is O(1) but involves chunk calculation (index / chunk_size for chunk number, index % chunk_size for offset), making it slightly slower than vector's direct pointer arithmetic.

**Key takeaway:** Deque uses chunked storage for O(1) operations at both ends while maintaining random access capability.

---

#### Q2: When should you choose std::deque over std::vector?
**Difficulty:** #intermediate
**Category:** #design_decisions #performance
**Concepts:** #container_selection #use_cases #trade_offs

**Answer:**
Choose deque when you need efficient insertions/deletions at both ends and can tolerate slightly slower random access. Use vector for single-ended insertion and optimal cache locality.

**Code example:**
```cpp
// ✅ Deque for double-ended queue
std::deque<Task> task_queue;
task_queue.push_back(new_task);   // Add to back
task_queue.pop_front();            // Process from front

// ❌ Vector inefficient for front operations
std::vector<Task> v;
v.push_back(task);  // OK
v.erase(v.begin()); // ❌ O(n) - shifts all elements
```

**Explanation:**
Deque's push_front and pop_front are O(1), while vector's are O(n) due to element shifting. However, vector has better cache locality for sequential access and slightly faster random access. For queue implementations, buffers, or algorithms requiring double-ended access (sliding window), deque is superior. For single-ended growth and iteration-heavy workloads, vector wins.

**Key takeaway:** Use deque for double-ended operations; use vector when you primarily work with the back.

---

#### Q3: Does std::deque guarantee contiguous memory storage?
**Difficulty:** #intermediate
**Category:** #memory_management #guarantees
**Concepts:** #contiguous_memory #c_api #storage_model

**Answer:**
No, deque does not guarantee contiguous storage. Elements are stored in separate chunks, making it incompatible with C APIs expecting contiguous arrays.

**Code example:**
```cpp
std::deque<int> dq = {1, 2, 3, 4, 5};

// ❌ Cannot get contiguous pointer for C API
// int* ptr = dq.data();  // No data() member

// ✅ Must copy to vector for C API
std::vector<int> v(dq.begin(), dq.end());
c_function(v.data(), v.size());
```

**Explanation:**
Deque's chunked architecture means elements may span multiple non-adjacent memory blocks. Only vector, array, and string provide contiguous storage guarantees and offer data() member function. If you need to interface with C APIs requiring T* pointer to contiguous data, you must copy deque to vector first. This is a key limitation when choosing between deque and vector.

**Key takeaway:** Deque storage is non-contiguous; use vector when C API interoperability is needed.

---

#### Q4: Explain iterator invalidation rules for std::deque.
**Difficulty:** #advanced
**Category:** #iterators #invalidation
**Concepts:** #iterator_stability #memory_management

**Answer:**
Deque's invalidation rules are complex. push_front/push_back preserve iterators unless the map reallocates. Insert/erase in middle invalidate all iterators. Erase at ends invalidates only erased elements' iterators.

**Code example:**
```cpp
std::deque<int> dq = {1, 2, 3, 4, 5};
auto it = dq.begin() + 2;

dq.push_back(6);   // ✅ Usually preserves iterators
dq.push_front(0);  // ✅ Usually preserves iterators

dq.insert(dq.begin() + 1, 99);  // ❌ Invalidates all iterators
dq.erase(it);  // ❌ Invalidates all iterators
```

**Explanation:**
Unlike list (only erased elements invalidated) or vector (all invalidated on reallocation), deque has nuanced rules. End operations preserve iterators unless the central map needs reallocation (rare). Middle operations invalidate all iterators because elements may shift between chunks or the entire chunk structure may reorganize. This makes deque less predictable than list for iterator stability but more stable than vector for end operations.

**Key takeaway:** Deque iterator invalidation is operation-dependent; avoid storing iterators across middle insertions/deletions.

---

#### Q5: What is std::forward_list and why was it introduced in C++11?
**Difficulty:** #beginner
**Category:** #introduction #design_rationale
**Concepts:** #forward_list #singly_linked #memory_efficiency

**Answer:**
std::forward_list is a singly-linked list with only next pointers (no prev), using 50% less memory than doubly-linked list. It's designed for memory-constrained scenarios where forward-only traversal suffices.

**Explanation:**
Each list node requires two pointers (prev and next) totaling 16 bytes overhead on 64-bit systems. Forward_list eliminates prev pointer, reducing overhead to 8 bytes per element. This matters significantly for small types or large datasets. The trade-off is loss of bidirectional iteration, efficient reverse traversal, size() function, and convenient operations at the back. C++11 introduced it to fill the niche between list (full features, high overhead) and hand-rolled singly-linked lists.

**Key takeaway:** forward_list trades features for memory efficiency, ideal for memory-critical forward-only scenarios.

---

#### Q6: Why doesn't std::forward_list provide a size() member function?
**Difficulty:** #intermediate
**Category:** #design_philosophy #api_decisions
**Concepts:** #size #complexity #trade_offs

**Answer:**
Maintaining a size counter would add overhead to splice_after operations and violate forward_list's minimal-overhead design philosophy. Getting size requires O(n) traversal via std::distance.

**Code example:**
```cpp
std::forward_list<int> fl = {1, 2, 3, 4, 5};

// ❌ No size() member
// size_t sz = fl.size();  // Compile error

// ✅ Use std::distance (O(n))
size_t sz = std::distance(fl.begin(), fl.end());

// ✅ Use empty() for existence check (O(1))
if (!fl.empty()) { /* ... */ }
```

**Explanation:**
If forward_list cached size, splice_after would need to update size in both source and destination lists, requiring O(n) traversal to count spliced elements or maintaining bidirectional links to track size incrementally. Both violate the minimal-overhead principle. The absence of size() signals to programmers that this container prioritizes space efficiency over convenience. If you need frequent size queries, use list or vector.

**Key takeaway:** forward_list omits size() to maintain minimal overhead and avoid complexity in splice operations.

---

#### Q7: Explain the before_begin() iterator in std::forward_list.
**Difficulty:** #intermediate
**Category:** #api #iterators
**Concepts:** #before_begin #sentinel #insertion_pattern

**Answer:**
before_begin() returns an iterator to a position before the first element, enabling insert_after and erase_after operations on the front element, since forward_list lacks direct front insertion/deletion.

**Code example:**
```cpp
std::forward_list<int> fl = {1, 2, 3};

// ✅ Insert at front using before_begin
fl.insert_after(fl.before_begin(), 0);  // fl: {0, 1, 2, 3}

// ✅ Erase front element
fl.erase_after(fl.before_begin());  // fl: {1, 2, 3}

// Equivalent to push_front / pop_front but follows "after" pattern
```

**Explanation:**
Since forward_list only has next pointers, insertion and deletion require access to the preceding node to update its next pointer. For the first element, there's no real preceding node in the list, so forward_list provides a sentinel before_begin() iterator representing a pseudo-position before the front. This maintains API consistency—all operations use insert_after and erase_after patterns rather than mixing insert/insert_after and erase/erase_after.

**Key takeaway:** before_begin() is a sentinel iterator enabling front operations to follow forward_list's consistent after-based API.

---

#### Q8: Compare the memory overhead of std::list vs std::forward_list.
**Difficulty:** #intermediate
**Category:** #memory_management #comparison
**Concepts:** #memory_overhead #pointer_storage #node_size

**Answer:**
list nodes have 16-byte overhead (prev + next pointers on 64-bit systems), while forward_list nodes have 8-byte overhead (only next pointer), making forward_list 50% more memory efficient per node.

**Code example:**
```cpp
struct ListNode {
    T value;
    ListNode* prev;  // 8 bytes
    ListNode* next;  // 8 bytes
    // Total overhead: 16 bytes
};

struct ForwardListNode {
    T value;
    ForwardListNode* next;  // 8 bytes
    // Total overhead: 8 bytes
};

// For 1000 ints:
std::list<int> lst(1000);          // ~20KB (20 bytes per element)
std::forward_list<int> fl(1000);  // ~12KB (12 bytes per element)
```

**Explanation:**
For small types like int (4 bytes), list uses 20 bytes total (4 + 16) while forward_list uses 12 bytes (4 + 8)—40% memory savings. The difference becomes more pronounced with many elements. However, for large types (e.g., 100-byte structs), the pointer overhead becomes less significant relative to element size. Memory savings matter most for small types in large collections or embedded systems.

**Key takeaway:** forward_list uses half the pointer overhead of list, significant for small types and large datasets.

---

#### Q9: Can you use std::sort with std::deque?
**Difficulty:** #beginner
**Category:** #algorithms #iterators
**Concepts:** #sorting #random_access_iterator #std_sort

**Answer:**
Yes, std::sort works with deque because deque provides random access iterators, which std::sort requires for efficient partitioning and accessing arbitrary elements.

**Code example:**
```cpp
std::deque<int> dq = {5, 2, 8, 1, 9};
std::sort(dq.begin(), dq.end());  // ✅ Works fine
// dq: {1, 2, 5, 8, 9}

std::forward_list<int> fl = {5, 2, 8, 1, 9};
// std::sort(fl.begin(), fl.end());  // ❌ Compile error
fl.sort();  // ✅ Use member function
```

**Explanation:**
std::sort requires random access iterators for its introsort algorithm (quicksort/heapsort hybrid). Deque provides random access through chunk indexing, making it compatible. Forward_list and list only provide forward and bidirectional iterators respectively, so they must use member sort() functions implementing merge sort. Deque's sort performance is slightly slower than vector's due to chunk-boundary overhead but still O(n log n).

**Key takeaway:** Deque supports std::sort via random access iterators; forward_list and list require member sort().

---

#### Q10: What are the time complexity characteristics of std::deque operations?
**Difficulty:** #intermediate
**Category:** #complexity #performance
**Concepts:** #time_complexity #big_o #operations

**Answer:**
Deque provides O(1) push/pop at both ends, O(1) random access, O(n) insert/erase in middle, and O(1) size(). Complexities match vector except for O(1) front operations.

**Code example:**
```cpp
std::deque<int> dq;

dq.push_back(1);   // O(1)
dq.push_front(2);  // O(1) - advantage over vector
dq.pop_back();     // O(1)
dq.pop_front();    // O(1) - advantage over vector

int x = dq[10];    // O(1) random access
dq.insert(dq.begin() + 5, 99);  // O(n) - shifts elements
```

**Explanation:**
Deque achieves O(1) front operations by maintaining chunks at both ends of the map, allowing growth in either direction. Random access involves chunk and offset calculation but is still constant time. Middle insertions are O(n) because elements must shift within and between chunks, though the shift distance might be shorter than vector if the operation is closer to one end. Size is cached like vector and list.

**Key takeaway:** Deque provides O(1) operations at both ends and random access, making it versatile for various use cases.

---

#### Q11: How does std::forward_list's insert_after differ from std::list's insert?
**Difficulty:** #intermediate
**Category:** #api #insertion
**Concepts:** #insert_after #insert #api_design

**Answer:**
forward_list uses insert_after requiring an iterator to the position before insertion because it needs to modify that node's next pointer. list's insert works before the iterator position using prev pointers.

**Code example:**
```cpp
std::list<int> lst = {1, 2, 3};
auto it = std::next(lst.begin());  // Points to 2
lst.insert(it, 99);  // Insert BEFORE 2: {1, 99, 2, 3}

std::forward_list<int> fl = {1, 2, 3};
auto it2 = fl.begin();  // Points to 1
fl.insert_after(it2, 99);  // Insert AFTER 1: {1, 99, 2, 3}
```

**Explanation:**
List can insert before an iterator because it has prev pointers to access the preceding node. Forward_list lacks prev pointers, so it must start from the node before the insertion point to update its next pointer. This fundamental difference makes forward_list's API less intuitive but reflects its minimalist single-pointer structure. For front insertion, use before_begin() with insert_after.

**Key takeaway:** forward_list's insert_after pattern reflects singly-linked structure requiring access to preceding node.

---

#### Q12: What happens to iterators when you splice in std::forward_list?
**Difficulty:** #intermediate
**Category:** #iterators #splice
**Concepts:** #splice_after #iterator_validity #ownership_transfer

**Answer:**
Iterators to spliced elements remain valid but now refer to the destination list. splice_after transfers nodes by relinking next pointers without copying elements.

**Code example:**
```cpp
std::forward_list<int> a = {1, 2, 3};
std::forward_list<int> b = {10, 20, 30};
auto it_b = b.begin();  // Points to 10

a.splice_after(a.begin(), b, it_b);
// a: {1, 20, 2, 3}
// b: {10, 30}
// it_b still valid, but 20 is now in list a
```

**Explanation:**
Splice operations only modify next pointers to transfer nodes between lists—no element copying or node reallocation occurs. Therefore, iterators to spliced elements remain valid pointers to the same nodes, those nodes just belong to a different list now. This enables powerful patterns where you track specific elements across list boundaries during reorganization. Like list's splice, this is an O(1) operation for single elements.

**Key takeaway:** forward_list splice_after preserves iterator validity while transferring node ownership between lists.

---

#### Q13: Why might std::deque be slower than std::vector for sequential iteration?
**Difficulty:** #intermediate
**Category:** #performance #cache_locality
**Concepts:** #iteration #cache_performance #memory_layout

**Answer:**
Deque's chunked architecture causes cache misses at chunk boundaries during sequential iteration, while vector's contiguous memory enables efficient cache prefetching across all elements.

**Explanation:**
Modern CPUs load entire cache lines (64 bytes) when accessing memory. Vector's contiguous layout means accessing one element brings nearby elements into cache automatically. When iterating sequentially, vector achieves near-optimal cache usage. Deque's chunks are separate memory allocations, potentially non-adjacent. When iteration crosses chunk boundaries, the CPU must load new cache lines from different memory regions, causing cache misses. For large deques with many chunks, this overhead accumulates, making iteration measurably slower than vector despite identical O(n) complexity.

**Key takeaway:** Vector's contiguous memory provides superior cache performance for sequential iteration compared to deque's chunked storage.

---

#### Q14: Can std::forward_list hold move-only types like std::unique_ptr?
**Difficulty:** #intermediate
**Category:** #move_semantics #type_requirements
**Concepts:** #move_only_types #unique_ptr #construction

**Answer:**
Yes, forward_list supports move-only types because node allocation happens individually and elements can be constructed in place or moved, never requiring copying.

**Code example:**
```cpp
std::forward_list<std::unique_ptr<int>> fl;

fl.push_front(std::make_unique<int>(42));  // ✅ Move
fl.emplace_front(new int(10));  // ✅ Construct in place

// ❌ Cannot copy the list itself
// auto fl2 = fl;  // Compile error

// ✅ Can move the list
auto fl2 = std::move(fl);  // Transfers ownership
```

**Explanation:**
Like list, forward_list allocates each node separately and never relocates existing nodes, making it naturally compatible with move-only types. Push_front moves the argument into the newly allocated node. Emplace_front constructs directly in the node using perfect forwarding. The forward_list itself becomes non-copyable when containing move-only types but remains movable, transferring ownership of all nodes.

**Key takeaway:** forward_list supports move-only types through move semantics and in-place construction.

---

#### Q15: How do you efficiently clear all elements from std::deque?
**Difficulty:** #beginner
**Category:** #api #memory_management
**Concepts:** #clear #destruction #memory_release

**Answer:**
Use clear() to destroy all elements and deallocate most memory. Unlike vector, deque typically releases chunk memory immediately, though the central map may remain allocated.

**Code example:**
```cpp
std::deque<int> dq(10000);
std::cout << "Before clear\n";
dq.clear();  // Destroys elements, deallocates chunks
std::cout << "After clear, size: " << dq.size() << "\n";  // 0
```

**Explanation:**
Deque's clear() destroys all elements and typically deallocates all chunks, though it may retain the central map structure for efficiency. Unlike vector which maintains capacity after clear(), deque more aggressively reclaims memory. To guarantee complete memory release, you can use the swap-with-empty idiom: `std::deque<int>().swap(dq);` which creates an empty temporary and swaps it with dq, ensuring all memory is released.

**Key takeaway:** deque::clear() destroys elements and typically releases chunk memory, more aggressively than vector.

---

#### Q16: What is the space complexity of std::deque compared to std::vector?
**Difficulty:** #intermediate
**Category:** #memory_management #complexity
**Concepts:** #space_complexity #overhead #memory_efficiency

**Answer:**
Both are O(n) space, but deque has additional overhead for the chunk map and may waste space in partially-filled chunks at the ends, making it less memory-efficient than vector.

**Explanation:**
Vector stores n elements plus potentially wasted capacity (typically 50-100% overhead in worst case). Deque stores n elements across multiple chunks, plus a central map (array of chunk pointers), plus potential waste in the first and last chunks if they're not full. For example, if chunks hold 128 elements and deque has 130 elements, two chunks are needed with most of the second chunk empty (126 wasted slots). The map overhead is usually minimal (grows logarithmically with number of chunks). Overall, deque typically uses slightly more memory than vector for the same elements.

**Key takeaway:** Deque has O(n) space like vector but with additional overhead from chunk map and partial chunk waste.

---

#### Q17: How does std::forward_list::remove work differently from list::remove?
**Difficulty:** #intermediate
**Category:** #api #algorithms
**Concepts:** #remove #element_removal #member_function

**Answer:**
Both remove all elements equal to a value in O(n) time, but forward_list must track the previous node during traversal to update next pointers when removing, while list can access prev pointers directly.

**Code example:**
```cpp
std::forward_list<int> fl = {1, 2, 3, 2, 4};
fl.remove(2);  // fl: {1, 3, 4}

std::list<int> lst = {1, 2, 3, 2, 4};
lst.remove(2);  // lst: {1, 3, 4}
```

**Explanation:**
From the user's perspective, both functions work identically—remove all matching elements in one traversal. Internally, list can directly access and update both prev and next pointers of neighboring nodes. Forward_list must maintain a trailing iterator pointing to the node before the one being examined, using it to update next pointers when removing the current node. This makes forward_list's remove slightly more complex to implement but the same O(n) complexity and identical behavior externally.

**Key takeaway:** forward_list::remove has identical behavior to list::remove despite different internal implementation due to single-pointer structure.

---

#### Q18: Can you explain the push_front and pop_front implementation strategies in std::deque?
**Difficulty:** #advanced
**Category:** #internals #implementation
**Concepts:** #deque_structure #front_operations #chunk_management

**Answer:**
Deque maintains a start pointer indicating the first element's position in the first chunk. push_front decrements this pointer (or allocates a new chunk at front if at chunk boundary), and pop_front increments it (or deallocates chunk if emptied).

**Explanation:**
Unlike vector which shifts all elements for front operations, deque manages chunks and tracks the start position within the first chunk. When pushing to front, if the start position is at chunk beginning, allocate a new chunk at the front of the map and update start to point to the last position in the new chunk. When popping from front, increment start pointer and deallocate the first chunk if it becomes empty. This requires managing the central map to add/remove chunk pointers at both ends, but all operations are O(1) amortized.

**Key takeaway:** Deque's front operations manipulate start pointer and manage chunks, avoiding element shifting for O(1) complexity.

---

#### Q19: What are the exception safety guarantees for std::deque and std::forward_list?
**Difficulty:** #advanced
**Category:** #exception_safety #guarantees
**Concepts:** #strong_guarantee #basic_guarantee #noexcept

**Answer:**
Both provide strong exception guarantee for single-element insertion (succeed completely or no change). Deque's operations may throw during chunk allocation; forward_list during node allocation. Both containers remain valid after exceptions.

**Explanation:**
Single-element push operations provide strong guarantee—if allocation or construction fails, the container is unchanged. Multi-element operations provide basic guarantee—container is valid but may be partially modified. Destructors and clear are noexcept, properly destroying elements even if element destructors throw. Move operations are generally noexcept as they transfer ownership via pointer manipulation. For maximum exception safety, prefer move-constructible types with noexcept move constructors.

**Key takeaway:** Both deque and forward_list provide strong guarantee for single insertions and basic guarantee for batch operations.

---

#### Q20: How would you implement a stack using std::deque?
**Difficulty:** #beginner
**Category:** #design #data_structures
**Concepts:** #stack #adapter #deque_usage

**Answer:**
Use deque's back operations (push_back, pop_back, back) for stack's push, pop, top operations, providing O(1) complexity for all stack operations.

**Code example:**
```cpp
template<typename T>
class Stack {
    std::deque<T> data;
public:
    void push(const T& value) {
        data.push_back(value);  // O(1)
    }
    
    T pop() {
        T value = data.back();
        data.pop_back();  // O(1)
        return value;
    }
    
    const T& top() const {
        return data.back();  // O(1)
    }
    
    bool empty() const {
        return data.empty();
    }
};
```

**Explanation:**
Standard library's std::stack uses deque as default underlying container because deque provides O(1) back operations without vector's reallocation overhead. Deque is overkill for stack (which doesn't need front operations or random access), but its chunked structure prevents expensive reallocations that vector would incur. Vector is also acceptable for stack, but deque is the standard default.

**Key takeaway:** Deque serves as efficient stack implementation with O(1) operations and no reallocation overhead.

---

#### Q21: What is the difference between deque::at and deque::operator[]?
**Difficulty:** #beginner
**Category:** #api #safety
**Concepts:** #bounds_checking #exception_handling #operator_bracket

**Answer:**
operator[] provides unchecked access (undefined behavior if out of bounds) for performance. at() performs bounds checking and throws std::out_of_range exception for invalid indices.

**Code example:**
```cpp
std::deque<int> dq = {1, 2, 3};

int x = dq[10];     // ❌ Undefined behavior
int y = dq.at(10);  // ✅ Throws std::out_of_range

try {
    dq.at(10) = 99;
} catch (const std::out_of_range& e) {
    std::cout << "Index out of range\n";
}
```

**Explanation:**
This is identical to vector's behavior. operator[] trusts the programmer to provide valid indices for maximum performance. at() provides safety at the cost of bounds checking overhead. In debug builds or when indices are uncertain, prefer at(). In performance-critical code with guaranteed valid indices, operator[] is appropriate. The choice reflects C++'s philosophy of not paying for what you don't use.

**Key takeaway:** Use at() for safety with bounds checking; use operator[] for performance with guaranteed valid indices.

---

#### Q22: How does std::forward_list::reverse work internally?
**Difficulty:** #advanced
**Category:** #algorithms #internals
**Concepts:** #reverse #pointer_manipulation #in_place

**Answer:**
Reverse traverses the list once, swapping next pointers to point backwards, effectively reversing the chain without moving any element data.

**Code example:**
```cpp
std::forward_list<int> fl = {1, 2, 3, 4, 5};
fl.reverse();  // fl: {5, 4, 3, 2, 1}
```

**Explanation:**
Forward_list's reverse iterates through nodes, maintaining three pointers: previous, current, and next. For each node, it sets current's next to previous, then advances all three pointers. This rewires the chain in O(n) time without any element copying or memory allocation. After traversal, the head pointer is updated to point to what was the last node. This demonstrates the efficiency of pointer-based structures for structural operations.

**Key takeaway:** forward_list::reverse efficiently rewires next pointers in O(n) time without moving element data.

---

#### Q23: Why might you choose std::deque for implementing a work-stealing queue?
**Difficulty:** #advanced
**Category:** #concurrency #design
**Concepts:** #work_stealing #double_ended #parallelism

**Answer:**
Deque's O(1) operations at both ends enable efficient work-stealing: owner thread pushes/pops from one end, thief threads steal from the other end, minimizing contention.

**Explanation:**
Work-stealing queues are used in parallel algorithms where each thread has a deque of tasks. The owner thread operates on its own end (push/pop), while idle threads can steal from the opposite end. Deque's double-ended O(1) operations make this efficient. Using vector would require O(n) operations at one end. List would work but has worse cache performance. Deque provides the ideal balance of efficiency at both ends with reasonable cache locality within chunks. Thread safety requires additional synchronization, but deque's underlying operations are optimal.

**Key takeaway:** Deque's double-ended O(1) operations make it ideal for work-stealing queue implementations in parallel algorithms.

---

#### Q24: Can you resize std::forward_list and how does it differ from std::list?
**Difficulty:** #intermediate
**Category:** #api #memory_management
**Concepts:** #resize #growth #node_allocation

**Answer:**
Yes, forward_list::resize works like list::resize—growing allocates new nodes with default-constructed or specified values, shrinking destroys and deallocates nodes. Behavior is identical except forward_list is forward-only.

**Code example:**
```cpp
std::forward_list<int> fl = {1, 2, 3};
fl.resize(5);  // Adds 2 default-initialized elements
// fl: {1, 2, 3, 0, 0}

fl.resize(2);  // Removes last 3 elements
// fl: {1, 2}
```

**Explanation:**
Resize growing allocates new nodes at the back and default-constructs elements (or uses provided value). Resize shrinking destroys elements from the back until the desired size is reached. Unlike deque and vector which may have capacity, forward_list allocates exactly the needed nodes. Resize operations are O(n) where n is the number of elements added or removed, requiring traversal to reach the resize point.

**Key takeaway:** forward_list::resize behaves like list::resize with O(n) complexity for traversal to modification point.

---

#### Q25: What are the primary use cases where forward_list outperforms other containers?
**Difficulty:** #advanced
**Category:** #design_decisions #performance
**Concepts:** #use_cases #optimization #trade_offs

**Answer:**
forward_list excels in memory-constrained environments, forward-only traversal scenarios, and algorithms requiring frequent front insertions with minimal overhead where bidirectional access is unnecessary.

**Explanation:**
forward_list's 50% memory reduction over list matters in embedded systems, mobile devices, or when managing millions of small elements. It's ideal for stacks (front operations only), forward pipelines (streaming data processing), or simple linked structures where you never need backward traversal or tail access. Examples include undo stacks (only access most recent), event queues (process front to back), or building directed graphs where edges only need forward pointers. If your algorithm never uses backward iteration or back operations, forward_list provides list's benefits with half the memory cost.

**Key takeaway:** forward_list optimizes memory in scenarios requiring only forward traversal and front operations.

---

### PRACTICE_TASKS: Output Prediction and Code Analysis

#### Q1
```cpp
std::deque<int> dq;
dq.push_back(10);
dq.push_front(5);
std::cout << dq.front() << " " << dq.back();
```

#### Q2
```cpp
std::deque<int> dq = {1, 2, 3, 4, 5};
dq.pop_front();
dq.pop_back();
std::cout << dq.size();
```

#### Q3
```cpp
std::deque<int> dq = {1, 2, 3};
dq.insert(dq.begin() + 1, 99);
for (int x : dq) std::cout << x << " ";
```

#### Q4
```cpp
std::deque<int> dq = {5, 3, 1, 4, 2};
std::sort(dq.begin(), dq.end());
for (int x : dq) std::cout << x << " ";
```

#### Q5
```cpp
std::deque<int> dq = {1, 2, 3, 4, 5};
std::cout << dq[0] << " " << dq[4];
```

#### Q6
```cpp
std::forward_list<int> fl = {1, 2, 3, 4, 5};
fl.push_front(0);
std::cout << fl.front();
```

#### Q7
```cpp
std::forward_list<int> fl = {1, 2, 3};
fl.insert_after(fl.before_begin(), 0);
std::cout << fl.front();
```

#### Q8
```cpp
std::forward_list<int> fl = {1, 2, 3, 2, 4};
fl.remove(2);
// How many elements remain?
```

#### Q9
```cpp
std::forward_list<int> fl = {5, 3, 1, 4, 2};
fl.sort();
// What is the first element after sorting?
```

#### Q10
```cpp
std::forward_list<int> fl = {1, 2, 3, 4, 5};
fl.reverse();
std::cout << fl.front();
```

#### Q11
```cpp
std::deque<int> dq = {1, 2, 3};
dq.resize(5);
std::cout << dq.size();
```

#### Q12
```cpp
std::deque<int> dq = {1, 2, 3, 4, 5};
dq.clear();
std::cout << dq.size() << " " << dq.empty();
```

#### Q13
```cpp
std::forward_list<int> a = {1, 2, 3};
std::forward_list<int> b = {4, 5, 6};
a.splice_after(a.before_begin(), b);
// What does 'a' contain? What is b's state?
```

#### Q14
```cpp
std::deque<int> dq = {1, 2, 3};
auto it = dq.begin();
dq.push_back(4);
std::cout << *it;
```

#### Q15
```cpp
std::forward_list<int> fl = {1, 2, 3};
fl.emplace_front(0);
std::cout << fl.front();
```

#### Q16
```cpp
std::deque<int> dq = {1, 2, 3, 4, 5};
dq.erase(dq.begin() + 2);
std::cout << dq.size();
```

#### Q17
```cpp
std::forward_list<int> fl = {1, 1, 2, 2, 3};
fl.unique();
// How many elements remain?
```

#### Q18
```cpp
std::deque<int> dq1 = {1, 2, 3};
std::deque<int> dq2 = std::move(dq1);
std::cout << dq1.size() << " " << dq2.size();
```

#### Q19
```cpp
std::forward_list<int> fl = {1, 2, 3, 4, 5};
fl.remove_if([](int x) { return x % 2 == 0; });
// What elements remain?
```

#### Q20
```cpp
std::deque<int> dq = {10, 20, 30};
dq.push_front(5);
dq.push_back(40);
std::cout << dq.front() << " " << dq.back();
```

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
