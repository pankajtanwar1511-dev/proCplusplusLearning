### INTERVIEW_QA: Comprehensive Questions and Answers
---

#### Q1: Why use Meyer's Singleton over DCLP?
Implement this exercise.

**Meyer's:**
- Simpler code
- Guaranteed thread-safe (C++11)
- No manual memory management

**DCLP:**
- Slightly faster (avoids lock after first call)
- More complex
- Requires atomics + careful memory ordering

**Recommendation:** Use Meyer's unless profiling shows lock is bottleneck.

---
#### Q2: How does C++11 guarantee thread-safe static initialization?
Implement this exercise.

Compiler generates code equivalent to:
```cpp
static Singleton& getInstance() {
    static std::once_flag flag;
    static aligned_storage<sizeof(Singleton)> storage;

    std::call_once(flag, []() {
        new (&storage) Singleton();
    });

    return *reinterpret_cast<Singleton*>(&storage);
}
```

Only one thread constructs; others wait.

---
#### Q3: What is the static initialization order fiasco?
Implement this exercise.

**Problem:** Initialization order of static variables across translation units is undefined.

```cpp
// file1.cpp
Singleton& s1 = Singleton::getInstance();  // May initialize before...

// file2.cpp
Singleton& s2 = Singleton::getInstance();  // ...this one
```

**Solution:** Use function-local statics (Meyer's Singleton) - initialized on first use.

---
