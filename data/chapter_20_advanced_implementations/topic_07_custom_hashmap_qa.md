### INTERVIEW_QA: Comprehensive Questions and Answers
---

#### Q1: Separate chaining vs open addressing?
Implement this exercise.

**Separate chaining:**
- Each bucket is linked list
- No clustering
- Extra memory for pointers

**Open addressing:**
- All entries in array
- Better cache locality
- Requires tombstones for deletion
#### Q2: Why rehash at 0.75 load factor?
Implement this exercise.

- Below 0.75: Low collision probability (~37% per Poisson distribution)
- Above 0.75: Chains grow longer, performance degrades
- Trade-off between speed and space
#### Q3: Time complexity of operations?
Implement this exercise.

- Insert/Find/Erase: **O(1) average**, O(n) worst (all collide)
- Rehash: O(n) but amortized over insertions

---
