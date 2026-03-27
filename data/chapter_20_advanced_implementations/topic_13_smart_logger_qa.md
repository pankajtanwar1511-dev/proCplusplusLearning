### INTERVIEW_QA: Comprehensive Questions and Answers
---

#### Q1: Why asynchronous logging?
Implement this exercise.

**Synchronous:**
```cpp
logger.info("message");  // Blocks until written to disk (~1ms)
```

**Asynchronous:**
```cpp
logger.info("message");  // Returns immediately (~1μs)
```

**Benefits:** Don't slow down application with I/O.

---
#### Q2: What if queue grows unbounded?
Implement this exercise.

**Problem:** Fast logging, slow disk → queue grows → OOM.

**Solutions:**
1. **Bounded queue** - Block when full
2. **Drop oldest** - Circular overwrite
3. **Drop newest** - Skip when full

---
