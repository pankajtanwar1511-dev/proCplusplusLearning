### PRACTICE_TASKS: RAII Fundamentals & Exception Safety

#### Q1
```cpp
class Resource {
    int* data;
public:
    Resource() : data(new int[10]) {
        std::cout << "Acquired\n";
    }
    ~Resource() {
        delete[] data;
        std::cout << "Released\n";
    }
};

void test() {
    Resource r1;
    Resource r2;
}
```

**Answer:**
```
Acquired
Acquired
Released
Released
```

**Explanation:**
- r1 constructed first: prints "Acquired"
- r2 constructed second: prints "Acquired"
- Destructors called in reverse order (LIFO - Last In, First Out)
- r2 destroyed first: prints "Released"
- r1 destroyed last: prints "Released"
- **RAII principle:** Resources acquired in constructor
- **Destruction order:** Reverse of construction order
- **Stack unwinding:** Objects destroyed in reverse order
- **Key Concept:** Destructor order is reverse of constructor order; ensures proper cleanup

---

#### Q2
```cpp
class Logger {
public:
    Logger() { std::cout << "Logger created\n"; }
    ~Logger() { std::cout << "Logger destroyed\n"; }
};

Logger globalLogger;

int main() {
    std::cout << "Main started\n";
    Logger localLogger;
    std::cout << "Main ending\n";
    return 0;
}
```

**Answer:**
```
Logger created
Main started
Logger created
Main ending
Logger destroyed
Logger destroyed
```

**Explanation:**
- globalLogger constructed before main() starts
- First "Logger created" before main
- "Main started" prints
- localLogger constructed: "Logger created"
- "Main ending" prints
- localLogger destroyed (local scope ends): "Logger destroyed"
- globalLogger destroyed after main() exits: "Logger destroyed"
- **Static/global lifetime:** Constructed before main, destroyed after main
- **Local lifetime:** Constructed when declared, destroyed at scope exit
- **Key Concept:** Global objects have static lifetime; constructed before main, destroyed after main

---

#### Q3
```cpp
class FileHandle {
    FILE* file;
public:
    FileHandle(const char* name) {
        file = fopen(name, "r");
        if (!file) throw std::runtime_error("Failed");
    }
    ~FileHandle() {
        if (file) {
            fclose(file);
            std::cout << "File closed\n";
        }
    }
};

void test() {
    try {
        FileHandle f("nonexistent.txt");
        std::cout << "File opened\n";
    } catch (const std::exception& e) {
        std::cout << "Exception: " << e.what() << "\n";
    }
}
```

**Answer:**
```
Exception: Failed
```

**Explanation:**
- fopen fails (file doesn't exist), returns nullptr
- Constructor throws std::runtime_error
- **Critical:** Object construction never completes
- Destructor NOT called (object doesn't exist)
- No "File closed" message
- Exception caught: prints "Exception: Failed"
- **Constructor exception rule:** If constructor throws, destructor never runs
- **Resource safety:** File handle was never valid (nullptr)
- **Key Concept:** Constructor exceptions prevent destructor calls; object never fully constructed

---

#### Q4
```cpp
class Resource {
public:
    Resource() { std::cout << "Constructed\n"; }
    ~Resource() noexcept(false) {
        std::cout << "Destroying\n";
        throw std::runtime_error("Destructor throw");
    }
};

void test() {
    Resource r;
}
```

**Answer:**
```
Program calls std::terminate() and crashes
```

**Explanation:**
- Resource constructed: prints "Constructed"
- Scope ends, destructor called
- Prints "Destroying"
- Destructor throws exception
- **Fatal error:** Throwing from destructor during stack unwinding
- C++ calls std::terminate()
- Program crashes immediately
- **noexcept(false):** Allows throwing (destructors noexcept by default in C++11+)
- **Never throw from destructors:** Can cause std::terminate
- **Key Concept:** Throwing from destructor calls std::terminate; never throw in destructors

---

#### Q5
```cpp
class Counter {
    int* count;
public:
    Counter() : count(new int(0)) {}
    ~Counter() { delete count; }
};

void test() {
    Counter c1;
    Counter c2 = c1;  // Copy
}
```

**Answer:**
```
Double delete / undefined behavior
```

**Explanation:**
- c1 constructed: allocates int, count points to it
- c2 = c1: Default copy constructor (shallow copy)
- Both c1.count and c2.count point to SAME memory
- Scope ends, c2 destroyed first
- c2 destructor deletes memory
- c1 destroyed next
- c1 destructor tries to delete already-freed memory
- **Double delete:** Undefined behavior, crash
- **Fix:** Implement copy constructor or delete it
- **Rule of Three/Five:** If you need destructor, likely need copy constructor
- **Key Concept:** Default copy constructor does shallow copy; causes double delete with raw pointers

---

#### Q6
```cpp
class Resource {
    int* data;
public:
    Resource() : data(new int[100]) {}
    ~Resource() { delete[] data; }
    
    Resource(const Resource&) = delete;
    Resource(Resource&& other) noexcept : data(other.data) {
        other.data = nullptr;
    }
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
Constructor called once, destructor called once
```

**Explanation:**
- C++17 guaranteed copy elision (RVO)
- Object constructed directly in test's stack frame
- No temporary created in createResource
- No move constructor called
- Single construction, single destruction
- **Without RVO:** Would construct, move, destruct temporary
- **C++17 optimization:** Direct construction at final location
- **Move semantics:** Available if RVO doesn't apply (C++14 and earlier)
- **Key Concept:** C++17 RVO eliminates moves; single object construction even with return

---

#### Q7
```cpp
class Lock {
    std::mutex& mtx;
public:
    Lock(std::mutex& m) : mtx(m) { 
        mtx.lock();
        std::cout << "Locked\n";
    }
    ~Lock() { 
        mtx.unlock();
        std::cout << "Unlocked\n";
    }
};

std::mutex globalMutex;

void function() {
    Lock lock(globalMutex);
    std::cout << "In critical section\n";
    throw std::runtime_error("Error");
}

int main() {
    try {
        function();
    } catch (...) {
        std::cout << "Caught\n";
    }
    return 0;
}
```

**Answer:**
```
Locked
In critical section
Unlocked
Caught
```

**Explanation:**
- Lock constructor: acquires mutex, prints "Locked"
- "In critical section" prints
- Exception thrown
- **Stack unwinding begins**
- Lock destructor called automatically
- Mutex unlocked: prints "Unlocked"
- Exception propagates to main
- Caught: prints "Caught"
- **RAII guarantees:** Mutex unlocked even with exception
- **Exception safety:** No deadlock, no leaked locks
- **Pattern:** This is std::lock_guard behavior
- **Key Concept:** RAII ensures cleanup during exceptions; automatic resource release via stack unwinding

---

#### Q8
```cpp
class Resource1 {
public:
    Resource1() { std::cout << "R1 acquired\n"; }
    ~Resource1() { std::cout << "R1 released\n"; }
};

class Resource2 {
public:
    Resource2() { std::cout << "R2 acquired\n"; }
    ~Resource2() { std::cout << "R2 released\n"; }
};

class Container {
    Resource1 r1;
    Resource2 r2;
public:
    Container() {
        std::cout << "Container constructed\n";
        throw std::runtime_error("Error");
    }
    ~Container() {
        std::cout << "Container destroyed\n";
    }
};

void test() {
    try {
        Container c;
    } catch (...) {
        std::cout << "Exception caught\n";
    }
}
```

**Answer:**
```
R1 acquired
R2 acquired
R2 released
R1 released
Exception caught
```

**Explanation:**
- Members constructed in declaration order before constructor body
- r1 constructed: "R1 acquired"
- r2 constructed: "R2 acquired"
- Constructor body executes: "Container constructed"
- Constructor throws exception
- **Container destructor NOT called** (construction incomplete)
- **But:** Fully constructed members ARE destroyed
- r2 destroyed first (reverse order): "R2 released"
- r1 destroyed: "R1 released"
- Exception caught
- **Key principle:** Members destroyed even if constructor throws
- **Key Concept:** Constructor exceptions destroy fully-constructed members but not container; partial construction cleanup

---

#### Q9
```cpp
class File {
    FILE* file;
public:
    File(const char* name) {
        file = fopen(name, "r");
        if (!file) throw std::runtime_error("Open failed");
    }
    ~File() {
        fclose(file);
        std::cout << "File closed\n";
    }
};

File* createFile() {
    return new File("test.txt");
}

void test() {
    File* f = createFile();
    // Use file
}
```

**Answer:**
```
Memory leak - file never closed
```

**Explanation:**
- File object allocated with new
- Constructor opens file
- Pointer returned to test()
- test() stores pointer but never deletes
- **No delete called:** Destructor never runs
- File never closed, memory never freed
- **RAII defeated:** Using new bypasses automatic cleanup
- **Should use:** Automatic storage (File f("test.txt"))
- **Or:** std::unique_ptr<File>
- **Anti-pattern:** new with RAII classes defeats their purpose
- **Key Concept:** Using new with RAII bypasses automatic cleanup; prefer stack allocation or smart pointers

---

#### Q10
```cpp
class Transaction {
    bool committed = false;
public:
    Transaction() { std::cout << "BEGIN\n"; }
    ~Transaction() {
        if (!committed) std::cout << "ROLLBACK\n";
        else std::cout << "COMMITTED\n";
    }
    void commit() { 
        committed = true;
        std::cout << "COMMIT\n";
    }
};

void test1() {
    Transaction t;
    t.commit();
}

void test2() {
    Transaction t;
    throw std::runtime_error("Error");
    t.commit();
}
```

**Answer:**
```
test1: BEGIN COMMIT COMMITTED
test2: BEGIN ROLLBACK
```

**Explanation:**
- **test1:**
  - Constructor: "BEGIN"
  - commit() called: committed = true, "COMMIT"
  - Destructor: committed is true, "COMMITTED"
- **test2:**
  - Constructor: "BEGIN"
  - Exception thrown before commit() reached
  - Stack unwinding, destructor called
  - committed still false
  - Destructor: "ROLLBACK"
- **RAII pattern:** Automatic rollback on exception
- **Scope-based transaction:** Commit explicit, rollback automatic
- **Real-world use:** Database transactions, file operations
- **Key Concept:** RAII enables automatic rollback; commit-or-rollback pattern via destructor

---

#### Q11
```cpp
void processFile(const char* filename) {
    FILE* file = fopen(filename, "r");
    if (!file) return;
    
    char buffer[100];
    if (fgets(buffer, sizeof(buffer), file) == nullptr) {
        return;
    }
    
    if (buffer[0] == '#') {
        return;
    }
    
    fclose(file);
}
```

**Answer:**
```
File leaks on all three early returns
```

**Explanation:**
- fopen succeeds, file opened
- Three possible early returns:
  1. fgets fails → return without fclose
  2. buffer[0] == '#' → return without fclose
  3. Only last path reaches fclose
- **Multiple exit points:** Easy to forget cleanup
- **Manual resource management:** Error-prone
- **RAII solution:**
  ```cpp
  class FileHandle {
      FILE* f;
  public:
      FileHandle(const char* name) : f(fopen(name, "r")) {}
      ~FileHandle() { if (f) fclose(f); }
  };
  ```
- **All exits covered:** Destructor runs on all code paths
- **Key Concept:** Manual resource management fails with multiple exits; RAII ensures cleanup on all paths

---

#### Q12
```cpp
class Base {
public:
    Base() { std::cout << "Base()\n"; }
    ~Base() { std::cout << "~Base()\n"; }
};

class Derived : public Base {
public:
    Derived() { std::cout << "Derived()\n"; }
    ~Derived() { std::cout << "~Derived()\n"; }
};

void test() {
    Derived d;
}
```

**Answer:**
```
Base()
Derived()
~Derived()
~Base()
```

**Explanation:**
- Construction order: Base to Derived (top-down)
- Base() called first: "Base()"
- Derived() called: "Derived()"
- Destruction order: Derived to Base (bottom-up, reverse)
- ~Derived() called first: "~Derived()"
- ~Base() called last: "~Base()"
- **Inheritance rule:** Base constructed first, destroyed last
- **Ensures:** Base fully constructed before Derived uses it
- **Ensures:** Derived fully destroyed before Base destroyed
- **Key Concept:** Inheritance construction is base-first; destruction is derived-first (reverse order)

---

#### Q13
```cpp
class Resource {
    int* data;
public:
    Resource() : data(new int[100]) {
        std::cout << "Acquired\n";
        throw std::runtime_error("Error during init");
    }
    ~Resource() {
        delete[] data;
        std::cout << "Released\n";
    }
};

void test() {
    try {
        Resource r;
    } catch (...) {
        std::cout << "Caught\n";
    }
}
```

**Answer:**
```
Acquired
Caught
(Memory leak occurs)
```

**Explanation:**
- new int[100] succeeds, memory allocated
- data initialized with pointer
- "Acquired" prints
- Exception thrown in constructor body
- **Constructor incomplete:** Object not fully constructed
- **Destructor NOT called**
- **Memory never freed:** Leak!
- "Caught" prints
- **Problem:** Resource acquired but constructor throws
- **Solution:** Use smart pointers or two-phase construction
  ```cpp
  std::unique_ptr<int[]> data{new int[100]};
  ```
- **Key Concept:** Constructor exceptions cause leaks if raw resources acquired; use RAII members instead

---

#### Q14
```cpp
std::unique_ptr<int> create() {
    return std::unique_ptr<int>(new int(42));
}

void test() {
    auto ptr = create();
    std::cout << *ptr << "\n";
}
```

**Answer:**
```
One allocation, one deallocation at end of test()
```

**Explanation:**
- create() allocates int(42) with new
- Wraps in unique_ptr (RAII)
- Returns unique_ptr (move semantics)
- test() receives unique_ptr
- Prints 42
- test() ends, ptr goes out of scope
- unique_ptr destructor runs
- Memory automatically freed (delete called)
- **No manual delete needed**
- **Exception safe:** Even if exception thrown, memory freed
- **RAII working:** Automatic resource management
- **Modern C++:** Use std::make_unique<int>(42) instead
- **Key Concept:** unique_ptr provides automatic deallocation; RAII for dynamic memory

---

#### Q15
```cpp
class Logger {
public:
    ~Logger() {
        std::cout << "Cleanup\n";
    }
};

int main() {
    if (true) {
        Logger log;
        std::cout << "Block 1\n";
    }
    std::cout << "Outside block\n";
    return 0;
}
```

**Answer:**
```
Block 1
Cleanup
Outside block
```

**Explanation:**
- Enter if block
- log constructed
- "Block 1" prints
- **if block ends:** log goes out of scope
- Destructor called: "Cleanup"
- Continue to next statement
- "Outside block" prints
- **Scope-based lifetime:** Object destroyed at closing brace
- **RAII principle:** Lifetime tied to scope
- **Deterministic destruction:** Exact point known
- **Use case:** Scope guards, temporary locks
- **Key Concept:** Objects destroyed at scope exit; deterministic RAII cleanup tied to braces

---
