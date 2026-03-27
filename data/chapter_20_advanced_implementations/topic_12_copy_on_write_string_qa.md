### INTERVIEW_QA: Comprehensive Questions and Answers
---

#### Q1: Why did std::string stop using COW in C++11?
Implement this exercise.

**Reasons:**
1. **Incompatible with move semantics** - COW requires shared state
2. **Thread-safety overhead** - Atomic refcount on every access
3. **Performance unpredictable** - Detach can be expensive
4. **Iterator invalidation** - Modifying one string invalidates others' iterators

**C++11:** std::string uses SSO (Small String Optimization) instead.

---
#### Q2: COW vs SSO (Small String Optimization)?
Implement this exercise.

**COW:**
- Cheap copy (share buffer)
- Expensive modify (detach)
- Thread-safe overhead

**SSO:**
- Small strings stored inline (no allocation)
- Large strings allocated separately
- No sharing (move semantics work well)

**Modern preference:** SSO.

---
