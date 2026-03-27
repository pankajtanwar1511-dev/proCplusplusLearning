### PRACTICE_TASKS: Custom RAII Wrappers & Advanced Patterns

#### Q1
```cpp
class Resource {
    int* data;
public:
    Resource() : data(new int(42)) {}
    ~Resource() { delete data; }
};

Resource createResource() {
    return Resource();
}

void test() {
    Resource r = createResource();
}
```

**Answer:**
```
Constructor once, destructor once (C++17 RVO)
```

**Explanation:**
- C++17 guaranteed copy elision (Return Value Optimization)
- Resource() constructed directly in test's r location
- No temporary object in createResource
- No move or copy constructor called
- Single construction, single destruction
- **Pre-C++17:** Might call move constructor
- **RVO benefit:** Eliminates overhead of move/copy
- **Performance:** One object lifetime instead of multiple
- **Key Concept:** C++17 RVO guarantees elision; single object constructed at final destination

---

#### Q2
```cpp
class Widget {
    int* ptr;
public:
    Widget() : ptr(new int(10)) {}
    ~Widget() { delete ptr; }
};

void test() {
    Widget w1;
    Widget w2 = w1;
}
```

**Answer:**
```
Double-delete, crash/undefined behavior
```

**Explanation:**
- w1 constructed: ptr points to new int(10)
- w2 = w1: Default copy constructor (shallow copy)
- w2.ptr = w1.ptr (same address!)
- test() ends, w2 destroyed first
- w2 destructor: delete ptr (memory freed)
- w1 destroyed next
- w1 destructor: delete ptr (same memory, already freed!)
- **Double delete:** Undefined behavior, likely crash
- **Fix:** Delete copy constructor or implement deep copy
- **Rule of Three:** Need custom copy constructor with destructor
- **Key Concept:** Default copy constructor does shallow copy; leads to double delete with raw pointers

---

#### Q3
```cpp
class FileHandle {
    FILE* file;
public:
    FileHandle(const char* name) : file(fopen(name, "r")) {}
    ~FileHandle() { fclose(file); }
    
    FileHandle(FileHandle&& other) : file(other.file) {
        other.file = nullptr;
    }
};

void test() {
    FileHandle f1("test.txt");
    FileHandle f2 = std::move(f1);
    FileHandle f3 = std::move(f2);
}
```

**Answer:**
```
Potential crash: fclose(nullptr)
```

**Explanation:**
- f1 opens "test.txt": file valid pointer
- f2 = move(f1): f2.file = f1.file, f1.file = nullptr
- f3 = move(f2): f3.file = f2.file, f2.file = nullptr
- test() ends, destructors called in reverse order
- f3 destroyed: fclose(valid file) ✓
- f2 destroyed: fclose(nullptr) → **crash or UB**
- f1 destroyed: fclose(nullptr) → **crash or UB**
- **Bug:** Destructor doesn't check for nullptr
- **Fix:** `if (file) fclose(file);`
- **Moved-from state:** Must be valid for destruction
- **Key Concept:** Moved-from objects must be safely destructible; check nullptr before operations

---

#### Q4
```cpp
class Resource {
    int* data;
public:
    Resource() : data(new int[100]) {}
    ~Resource() { delete[] data; }
    
    Resource(Resource&& other) : data(other.data) {
        other.data = nullptr;
    }
    
    Resource& operator=(Resource&& other) {
        delete[] data;
        data = other.data;
        other.data = nullptr;
        return *this;
    }
};

void test() {
    Resource r;
    r = std::move(r);  // Self-move
}
```

**Answer:**
```
Self-move bug: deletes data before transfer
```

**Explanation:**
- r constructed: data allocated
- r = std::move(r): Self-assignment
- Move assignment: `delete[] data` (frees r.data)
- Then: `data = other.data` (but other IS r, already freed!)
- data now dangling pointer
- Destructor: delete[] dangling pointer → **crash**
- **Self-assignment not checked**
- **Fix:** Check `if (this != &other)` first
- **Standard library:** std::move handles self-assignment
- **Best practice:** Always check self-assignment in move assignment
- **Key Concept:** Move assignment must handle self-assignment; check this != &other

---

#### Q5
```cpp
class Base {
    int* baseData;
public:
    Base() : baseData(new int[10]) {}
    ~Base() { delete[] baseData; }
};

class Derived : public Base {
    int* derivedData;
public:
    Derived() : derivedData(new int[20]) {}
    ~Derived() { delete[] derivedData; }
};

void test() {
    Base* ptr = new Derived();
    delete ptr;
}
```

**Answer:**
```
Non-virtual destructor leaks derivedData
```

**Explanation:**
- new Derived(): Both constructors run, both allocations succeed
- baseData: 10 ints allocated
- derivedData: 20 ints allocated
- delete ptr: ptr is Base* pointing to Derived
- **Only ~Base() called** (destructor not virtual)
- baseData freed ✓
- **~Derived() never called**
- derivedData leaked! (20 ints)
- **Memory leak:** 20 ints never freed
- **Fix:** Make Base destructor virtual: `virtual ~Base()`
- **Rule:** Base class with virtual functions needs virtual destructor
- **Key Concept:** Non-virtual destructor causes derived class leaks; always make base destructors virtual

---

#### Q6
```cpp
class Transaction {
    bool committed = false;
public:
    Transaction() { std::cout << "BEGIN\n"; }
    ~Transaction() {
        if (!committed) std::cout << "ROLLBACK\n";
    }
    void commit() {
        std::cout << "COMMIT\n";
        committed = true;
    }
};

void test1() {
    Transaction t;
    t.commit();
    t.commit();
}

void test2() {
    Transaction t;
}
```

**Answer:**
```
test1: BEGIN COMMIT COMMIT ROLLBACK
test2: BEGIN ROLLBACK
```

**Explanation:**
- **test1:**
  - Constructor: "BEGIN"
  - First commit(): "COMMIT", committed = true
  - Second commit(): "COMMIT" (prints again!)
  - Destructor: committed = true, but prints "ROLLBACK" anyway
  - **Bug:** Destructor should print "COMMITTED" when committed = true
- **test2:**
  - Constructor: "BEGIN"
  - Never commits
  - Destructor: committed = false, "ROLLBACK" ✓
- **Expected test1 destructor:** Should print nothing or "COMMITTED"
- **Issue:** commit() should set committed=true, destructor logic wrong
- **Key Concept:** Transaction pattern requires correct commit/rollback logic in destructor

---

#### Q7
```cpp
class Resource {
public:
    Resource() { std::cout << "Acquired\n"; }
    ~Resource() { std::cout << "Released\n"; }
    Resource(const Resource&) { std::cout << "Copied\n"; }
    Resource(Resource&&) { std::cout << "Moved\n"; }
};

Resource createResource() {
    Resource r;
    return r;
}

void test() {
    Resource r = createResource();
}
```

**Answer:**
```
C++17: Acquired Released
Pre-C++17: Acquired Moved Released Released
```

**Explanation:**
- **C++17 (guaranteed copy elision):**
  - r constructed directly in test's location
  - "Acquired"
  - test() ends: "Released"
  - No move, no copy
- **Pre-C++17 (NRVO may apply):**
  - Local r in createResource: "Acquired"
  - Move to test's r: "Moved"
  - Temporary destroyed: "Released"
  - test's r destroyed: "Released"
- **Compiler-dependent:** Some older compilers still optimize
- **C++17 benefit:** Guaranteed single construction
- **Key Concept:** C++17 RVO eliminates moves; pre-C++17 may move or use NRVO

---

#### Q8
```cpp
class LazyResource {
    mutable int* data = nullptr;
    
    void init() const {
        if (!data) {
            data = new int[100];
        }
    }
    
public:
    ~LazyResource() { delete[] data; }
    
    void use() const {
        init();
        // Use data
    }
};

void test() {
    const LazyResource r;
    r.use();
}
```

**Answer:**
```
Not thread-safe; race condition possible
```

**Explanation:**
- Single-threaded: Works fine
  - data starts nullptr
  - First use(): init() allocates
  - Destructor: frees memory
- **Multi-threaded problem:**
  - Thread 1: checks `if (!data)` → true
  - Thread 2: checks `if (!data)` → true (still null!)
  - Both threads: allocate new int[100]
  - One allocation leaked
  - Possible double-delete
- **No synchronization:** Race condition on check and allocation
- **Fix:** Use std::mutex or std::call_once
  ```cpp
  std::once_flag initFlag;
  std::call_once(initFlag, [this]{ data = new int[100]; });
  ```
- **Key Concept:** Lazy initialization without synchronization causes race conditions; use std::call_once

---

#### Q9
```cpp
class ScopedLock {
    std::mutex& mtx;
public:
    ScopedLock(std::mutex& m) : mtx(m) { mtx.lock(); }
    ~ScopedLock() { mtx.unlock(); }
};

std::mutex globalMutex;

ScopedLock getLock() {
    return ScopedLock(globalMutex);
}

void test() {
    auto lock = getLock();
}
```

**Answer:**
```
Compilation error: ScopedLock needs move constructor
```

**Explanation:**
- getLock() returns ScopedLock by value
- Requires move or copy constructor
- **No move constructor defined**
- Compiler-generated move constructor deleted (has reference member)
- Reference members cannot be moved
- **Cannot return by value**
- **Fix 1:** Return std::unique_ptr<ScopedLock>
- **Fix 2:** Use std::lock_guard (standard solution)
- **Design issue:** Lock objects shouldn't be movable
- **Real solution:** Don't return lock objects
- **Key Concept:** RAII lock wrappers should be non-movable; reference members prevent implicit move

---

#### Q10
```cpp
class Resource {
    int* data;
public:
    Resource(int size) : data(new int[size]) {}
    ~Resource() { delete[] data; }
    
    Resource(const Resource& other) = delete;
    Resource& operator=(const Resource& other) = delete;
};

std::vector<Resource> createResources() {
    std::vector<Resource> vec;
    vec.push_back(Resource(10));
    return vec;
}
```

**Answer:**
```
Compilation error: Resource not movable
```

**Explanation:**
- Copy constructor deleted
- **Move constructor also implicitly deleted** (user-declared copy operations)
- vector requires movable or copyable elements
- push_back(Resource(10)) tries to move
- Return vec tries to move vector (moves elements)
- **Both operations fail**
- **Fix:** Add move constructor
  ```cpp
  Resource(Resource&& other) : data(other.data) {
      other.data = nullptr;
  }
  ```
- **Rule of Five:** If you delete copy, implement move
- **Key Concept:** Vectors require movable elements; deleting copy without implementing move breaks containers

---

#### Q11
```cpp
class Widget {
    std::unique_ptr<int[]> buffer;
    int* rawPtr;
    
public:
    Widget(size_t size) 
        : buffer(new int[size])
        , rawPtr(new int[size])
    {}
    
    ~Widget() {
        delete[] rawPtr;
    }
};

void test() {
    Widget w(100);
}
```

**Answer:**
```
rawPtr may leak if second allocation throws
```

**Explanation:**
- Member initialization order: buffer first, rawPtr second
- buffer allocation: new int[size] succeeds
- buffer(ptr): unique_ptr constructor succeeds
- **If rawPtr allocation throws:**
  - Exception before rawPtr initialized
  - Widget constructor incomplete
  - Widget destructor NOT called
  - rawPtr member never constructed (indeterminate value)
  - **But:** buffer IS constructed, its destructor WILL run
  - buffer memory freed ✓
  - **No leak from buffer** (RAII working)
- **Actually safe:** unique_ptr is RAII-wrapped
- **Problem if:** Second allocation throws, Widget incomplete
- **Better:** Both as unique_ptr (exception-safe)
- **Key Concept:** Use RAII for all resources in constructors; partial construction destroys completed members

---

#### Q12
```cpp
class Manager {
    std::unique_ptr<Resource1> r1;
    std::unique_ptr<Resource2> r2;
    
public:
    Manager()
        : r2(new Resource2())  // Listed first in init list
        , r1(new Resource1())  // Listed second
    {
        // r2 depends on r1
        r2->setDependency(r1.get());
    }
};
```

**Answer:**
```
Initialization order mismatch: r1 before r2, not r2 then r1
```

**Explanation:**
- **Members initialized in declaration order, not initializer list order**
- Declaration order: r1, then r2
- Initializer list order: r2, then r1 (ignored!)
- **Actual execution:**
  - r1 initialized: Resource1 created
  - r2 initialized: Resource2 created
  - Constructor body: r2->setDependency(r1.get()) ✓
- **Appears to work:** r1 exists when setDependency called
- **Bug:** Misleading init list order
- **If order mattered:** Would be wrong
- **Fix:** Match init list order to declaration order
- **Compiler warning:** Many compilers warn about this
- **Key Concept:** Members initialize in declaration order not init list order; match for clarity

---

#### Q13
```cpp
class FileWrapper {
    FILE* file;
    bool owns;
    
public:
    FileWrapper(const char* name)
        : file(fopen(name, "r")), owns(true) {}
    
    FileWrapper(FILE* external)
        : file(external), owns(false) {}
    
    ~FileWrapper() {
        if (file) fclose(file);  // Bug: ignores owns flag
    }
};

void test() {
    FileWrapper w1("file.txt");
    FileWrapper w2(stdin);
}
```

**Answer:**
```
Bug: closes stdin (doesn't own it)
```

**Explanation:**
- w1 opens "file.txt": file valid, owns = true
- w2 wraps stdin: file = stdin, owns = false
- test() ends, destructors called
- **w2 destructor:**
  - Checks if (file) → true (stdin is valid)
  - Calls fclose(stdin)
  - **Bug:** Closes stdin even though owns = false
- **w1 destructor:**
  - fclose(file) ✓ (should close)
- **Problem:** Destructor ignores owns flag
- **Fix:** `if (file && owns) fclose(file);`
- **Pattern:** Conditional ownership requires flag check
- **Real-world:** This is what std::shared_ptr deleter does
- **Key Concept:** Conditional ownership requires checking ownership flag before cleanup

---

#### Q14
```cpp
template<typename T>
class Lazy {
    mutable T* ptr = nullptr;
    
public:
    ~Lazy() { delete ptr; }
    
    T& get() const {
        if (!ptr) ptr = new T();
        return *ptr;
    }
};

void threadFunc(const Lazy<Resource>& lazy) {
    lazy.get();
}

void test() {
    Lazy<Resource> resource;
    std::thread t1(threadFunc, std::ref(resource));
    std::thread t2(threadFunc, std::ref(resource));
    t1.join();
    t2.join();
}
```

**Answer:**
```
Race condition: both threads may allocate
```

**Explanation:**
- Both threads call get() on same Lazy<Resource>
- **Race scenario:**
  - t1: checks `if (!ptr)` → true
  - t2: checks `if (!ptr)` → true (ptr still null!)
  - t1: ptr = new T() (allocates)
  - t2: ptr = new T() (allocates again!)
  - **First allocation lost:** Memory leak
  - **Both threads:** Return different objects
- **Possible crash:** Both try to delete in destructor
- **No synchronization:** Race on read-modify-write
- **Fix:** std::call_once
  ```cpp
  std::once_flag initFlag;
  T& get() const {
      std::call_once(initFlag, [this]{ ptr = new T(); });
      return *ptr;
  }
  ```
- **Key Concept:** Lazy initialization in multi-threaded code requires synchronization; use std::call_once

---

#### Q15
```cpp
class Base {
protected:
    int* data;
public:
    Base() : data(new int[10]) {}
    ~Base() { delete[] data; }
};

class Derived : public Base {
    int* moreData;
public:
    Derived() : moreData(new int[20]) {}
    ~Derived() { delete[] moreData; }
};

void test() {
    Base* ptr = new Derived();
    delete ptr;
}
```

**Answer:**
```
moreData leaked (non-virtual destructor)
```

**Explanation:**
- new Derived() creates full object:
  - Base::data allocated (10 ints)
  - Derived::moreData allocated (20 ints)
- ptr is Base* pointing to Derived
- delete ptr with Base having non-virtual destructor
- **Only ~Base() called:**
  - delete[] data (10 ints freed) ✓
  - ~Derived() NEVER called
  - moreData never freed → **leak (20 ints)**
- **Static dispatch:** Destructor determined by pointer type (Base*), not object type (Derived)
- **Fix:** `virtual ~Base() { delete[] data; }`
- **Virtual destructor:** Ensures ~Derived() called first, then ~Base()
- **Rule:** Always virtual destructor in polymorphic base classes
- **Key Concept:** Non-virtual destructor with polymorphic delete causes derived member leaks; use virtual

---
