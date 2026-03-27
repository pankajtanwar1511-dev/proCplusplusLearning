### INTERVIEW_QA: Comprehensive Questions and Answers
---

#### Q1: Why does spinlock waste CPU?
Implement this exercise.

Spinning thread consumes 100% of one CPU core:

```cpp
while (lock.test_and_set()) {
    // Infinite loop consuming CPU
}
```

**Mutex:** Sleeping thread uses 0% CPU.

---
#### Q2: What is the pause instruction?
Implement this exercise.

**x86 `pause` instruction:**
- Hints CPU: "I'm in a spin loop"
- Reduces power consumption
- Improves performance on hyperthreaded CPUs

```cpp
while (lock.test_and_set()) {
    _mm_pause();  // or __builtin_ia32_pause()
}
```

---
#### Q3: When is spinlock better than mutex?
Implement this exercise.

**Spin lock wins when:**
- Critical section < 100 ns
- Low contention
- Real-time system (avoid context switch jitter)

**Example:** Incrementing a counter:
```cpp
lock.lock();
++counter;  // ~1 ns
lock.unlock();
```

Context switch (~1 μs) is 1000× longer than critical section!

---
