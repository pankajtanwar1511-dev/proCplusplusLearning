### INTERVIEW_QA: Comprehensive Questions and Answers
---

#### Q1: Why make copy constructor deleted?
Implement this exercise.

File descriptors are **unique resources** - copying would create two owners:

```cpp
FileDescriptor fd1("file.txt", O_RDONLY);
FileDescriptor fd2 = fd1;  // ← Both would close() same FD!

// fd1 destructor: close(fd)
// fd2 destructor: close(fd)  ← DOUBLE CLOSE! Crashes
```

**Solution:** Delete copy, allow move (transfer ownership).

---
#### Q2: What is the Rule of Five?
Implement this exercise.

If you define one of:
- Destructor
- Copy constructor
- Copy assignment
- Move constructor
- Move assignment

**You likely need to define all five.**

For `FileDescriptor`:
- Destructor: ✓ (closes FD)
- Copy ctor/assignment: ✓ deleted
- Move ctor/assignment: ✓ implemented

---
