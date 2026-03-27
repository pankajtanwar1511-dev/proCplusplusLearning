### INTERVIEW_QA: Comprehensive Questions and Answers
---

#### Q1: Why is SPSC easier than MPMC?
Implement this exercise.

**SPSC:** Only one writer → no contention on tail, only one reader → no contention on head.

**MPMC:** Multiple writers compete for tail (need CAS loop), multiple readers compete for head.

---
#### Q2: How to handle full buffer?
Implement this exercise.

**Option 1: Spin** (busy-wait)
**Option 2: Block** (condition variable)
**Option 3: Overwrite** (circular overwrite oldest)
**Option 4: Return false** (caller handles)

Our implementation uses Option 4.

---
