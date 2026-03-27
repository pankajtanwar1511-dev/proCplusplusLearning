## TOPIC: Fixed-Size Memory Pool Allocator - High-Performance Memory Management

### INTERVIEW_QA: Deep Understanding

---

#### Q1: Why is a memory pool faster than malloc/new?
Implement this exercise.

**Answer:**

**Standard Allocation (malloc/new):**
1. System call overhead (~100-500ns)
2. Searches for free block (complex algorithms)
3. May need to split/merge blocks
4. Bookkeeping overhead (headers, metadata)
5. Can cause page faults

**Memory Pool:**
1. No system calls after initialization
2. O(1) free list operations (~5-20ns)
3. No searching/splitting
4. Minimal overhead (just free list pointers)
5. All memory pre-paged

**Benchmark Comparison:**
```
malloc:  ~200ns per allocation
Pool:    ~10ns per allocation (20x faster)

With cache: Pool can be <5ns!
```

---
#### Q2: How do you handle alignment requirements?
Implement this exercise.

**Answer:**

**Three Approaches:**

1. **Use union (preferred for single type):**
   ```cpp
   union Block {
       T element;      // Natural alignment of T
       Block* next;    // Pointer alignment
   };
   ```

2. **Manual alignment calculation:**
   ```cpp
   size_t aligned_size = (sizeof(T) + alignof(T) - 1) & ~(alignof(T) - 1);
   ```

3. **Use std::aligned_alloc:**
   ```cpp
   void* memory = std::aligned_alloc(alignof(T), sizeof(T) * count);
   ```

**Why Alignment Matters:**
- Misaligned access = UB (undefined behavior)
- Performance: Aligned access is faster
- Some platforms crash on misaligned access (ARM, older x86)

---
#### Q3: What is the ABA problem and does it affect memory pools?
Implement this exercise.

**Answer:**

**ABA Problem:**

Occurs in lock-free data structures:
```cpp
// Thread 1 sees: A → B → C
T* old_head = free_list_;  // Points to A

// Thread 2: pops A, pops B, pushes A back
// Now: A → C

// Thread 1: CAS succeeds! (head is still A)
if (CAS(&free_list_, old_head, old_head->next)) {
    // ❌ But old_head->next is now stale!
}
```

**Memory Pool Impact:**

Our implementation uses mutex (not lock-free), so **no ABA problem**. But if making lock-free:

**Solution: Version Tagging**
```cpp
struct TaggedPointer {
    Block* ptr;
    uint64_t version;  // Increment on each change
};

// CAS on both pointer and version
```

---
#### Q4: How do you detect memory leaks in a pool?
Implement this exercise.

**Answer:**

**Detection Methods:**

1. **Count allocated blocks:**
   ```cpp
   ~MemoryPool() {
       if (allocated_count_ != 0) {
           std::cerr << "Leak: " << allocated_count_
                     << " blocks not freed\n";
       }
   }
   ```

2. **Track allocations (debug mode):**
   ```cpp
   std::unordered_set<T*> allocated_ptrs_;  // Track all allocations

   T* allocate() {
       T* ptr = /* ... */;
       allocated_ptrs_.insert(ptr);
       return ptr;
   }
   ```

3. **Valgrind/AddressSanitizer:**
   ```bash
   g++ -fsanitize=address program.cpp
   ./a.out  # Reports leaks
   ```

---
#### Q5: How does cache locality improve performance?
Implement this exercise.

**Answer:**

**Cache Benefits:**

1. **Spatial Locality:**
   ```cpp
   // Pool allocates sequentially
   Node* n1 = pool.allocate();  // Address: 0x1000
   Node* n2 = pool.allocate();  // Address: 0x1040 (adjacent!)

   // Accessing n1 loads n2 into cache too
   // Next access to n2 is cache hit!
   ```

2. **Benchmark Impact:**
   ```
   Random heap allocation:  ~100ns per access (cache miss)
   Sequential pool access:  ~5ns per access (cache hit)
   20x faster!
   ```

3. **Prefetching:**
   Modern CPUs prefetch sequential memory:
   ```cpp
   // Pool enables hardware prefetcher
   for (Node* n = head; n; n = n->next) {
       process(n->data);  // Likely in cache already
   }
   ```

---
#### Q6: When should you NOT use a memory pool?

**Answer:**

- Variable-sized allocations
- Low allocation frequency
- Unpredictable lifetimes

---

#### Q7: Thread-safety considerations?

**Answer:**

- Add mutex around allocate/deallocate
- Or use thread-local pools
- Lock-free pools are complex (ABA problem)

---

#### Q8: How to grow a pool dynamically?

**Answer:**

- Allocate new chunk, link to free list
- Keep linked list of chunks
- Deallocate all chunks in destructor

---

#### Q9: Memory overhead of pool vs malloc?

**Answer:**

- Pool: ~8 bytes per block (free list pointer)
- malloc: ~16-32 bytes per allocation (metadata)
- Pool wins for small objects!

---

#### Q10: RAII and exception safety?

**Answer:**

- Use `construct`/`destroy` consistently
- Pool destructor checks `allocated_count_`
- Consider RAII wrapper for automatic cleanup

---

---
