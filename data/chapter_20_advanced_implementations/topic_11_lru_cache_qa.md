### INTERVIEW_QA: Comprehensive Questions and Answers
---

#### Q1: Time complexity of LRU operations?
Implement this exercise.

- `get()`: O(1) - hash map lookup + list splice
- `put()`: O(1) - hash map insert/update + list insert/evict

**Key:** `std::list::splice()` is O(1) (just pointer updates).

---
#### Q2: Why use doubly-linked list?
Implement this exercise.

Need O(1) removal of arbitrary elements:

```cpp
// Remove node (requires prev/next pointers):
node->prev->next = node->next;
node->next->prev = node->prev;
```

Singly-linked list would be O(n) to find predecessor.

---
#### Q3: LRU vs LFU (Least Frequently Used)?
Implement this exercise.

**LRU:** Evicts least recently accessed
**LFU:** Evicts least frequently accessed

**Example:**
```
Access pattern: 1, 2, 3, 1, 1, 1, 4

LRU evicts: 2 (oldest)
LFU evicts: 4 (frequency = 1, others have freq ≥ 2)
```

**LRU simpler, LFU better for frequency-based patterns.**

---
