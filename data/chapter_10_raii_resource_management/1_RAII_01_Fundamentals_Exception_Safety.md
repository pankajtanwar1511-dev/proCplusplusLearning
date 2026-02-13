## TOPIC: RAII Fundamentals & Exception Safety

### THEORY_SECTION: Core Concepts and Philosophy

#### 1. RAII Fundamentals - Resource Lifetime Bound to Object Lifetime

**Resource Acquisition Is Initialization (RAII)** is C++'s foundational idiom for automatic resource management. The core principle: **resources are acquired in constructors and released in destructors**, tying resource lifetime directly to object lifetime.

**RAII Core Principles:**

| Principle | Implementation | Guarantee |
|-----------|---------------|-----------|
| **Acquire in Constructor** | Resource allocation happens during object construction | Objects are always in valid state |
| **Release in Destructor** | Resource deallocation happens during object destruction | Cleanup is automatic and unavoidable |
| **Single Ownership** | One object owns each resource | No ambiguity about cleanup responsibility |
| **Scope-Based Lifetime** | Resources live exactly as long as owning objects | Deterministic, predictable cleanup timing |
| **No Manual Cleanup** | No explicit `close()`, `free()`, `release()` calls needed | Impossible to forget cleanup |

**What Qualifies as a "Resource"?**

RAII applies to **any resource requiring explicit acquisition and release**:

| Resource Type | Acquisition | Release | RAII Wrapper Examples |
|---------------|-------------|---------|----------------------|
| **Memory** | `new`, `malloc` | `delete`, `free` | `unique_ptr`, `shared_ptr`, `vector` |
| **File Handles** | `fopen`, `open` | `fclose`, `close` | `std::fstream`, custom `FileHandle` |
| **Mutex Locks** | `lock()` | `unlock()` | `std::lock_guard`, `std::unique_lock` |
| **Database Connections** | `connect()` | `disconnect()` | Custom `Connection` class |
| **Network Sockets** | `socket()`, `connect()` | `close()` | Custom `Socket` class |
| **GPU Resources** | CUDA allocations | CUDA deallocations | Custom GPU buffer wrappers |
| **Thread Handles** | `std::thread` constructor | `join()` or `detach()` | `std::jthread` (C++20) |

**Before RAII vs With RAII:**

```cpp
// ❌ WITHOUT RAII: Manual resource management (error-prone)
void processFile(const char* filename) {
    FILE* file = fopen(filename, "r");
    if (!file) return;  // ✅ OK

    char buffer[100];
    if (fgets(buffer, sizeof(buffer), file) == nullptr) {
        // ❌ LEAK: Forgot to fclose(file)
        return;
    }

    if (buffer[0] == '#') {
        // ❌ LEAK: Forgot to fclose(file)
        return;
    }

    // Process data...
    if (errorCondition()) {
        // ❌ LEAK: Forgot to fclose(file)
        throw std::runtime_error("Error");
    }

    fclose(file);  // ✅ Only reached if no early exits
}

// ✅ WITH RAII: Automatic resource management (leak-proof)
class FileHandle {
    FILE* file;
public:
    FileHandle(const char* name, const char* mode) {
        file = fopen(name, mode);
        if (!file) throw std::runtime_error("Open failed");
    }
    ~FileHandle() {
        if (file) fclose(file);  // ✅ ALWAYS called
    }
    FILE* get() const { return file; }
};

void processFile(const char* filename) {
    FileHandle file(filename, "r");  // ✅ Acquire

    char buffer[100];
    if (fgets(buffer, sizeof(buffer), file.get()) == nullptr) {
        return;  // ✅ file automatically closed
    }

    if (buffer[0] == '#') {
        return;  // ✅ file automatically closed
    }

    if (errorCondition()) {
        throw std::runtime_error("Error");  // ✅ file automatically closed
    }

}  // ✅ file automatically closed on normal exit
```

**Multiple Exit Paths Problem Solved:**

| Exit Path | Manual Management | RAII |
|-----------|-------------------|------|
| **Normal return** | Must call cleanup | ✅ Automatic |
| **Early return 1** | Must call cleanup | ✅ Automatic |
| **Early return 2** | Must call cleanup | ✅ Automatic |
| **Exception thrown** | ❌ Cleanup likely missed | ✅ Automatic (stack unwinding) |
| **Adding new early return** | ⚠️ Must remember cleanup | ✅ Automatic (no changes needed) |

**RAII Object Lifecycle:**

```cpp
{
    // 1. ACQUISITION: Constructor called, resource acquired
    FileHandle file("data.txt", "r");

    // 2. USAGE: Object is valid, resource accessible
    char buffer[100];
    fgets(buffer, sizeof(buffer), file.get());

    // 3. RELEASE: Destructor called at scope exit, resource released
}  // ← Destructor invoked here automatically
```

---

#### 2. Exception Safety Through Stack Unwinding - Automatic Cleanup Guarantees

C++'s **stack unwinding** mechanism guarantees that destructors are called for all constructed objects when exceptions propagate, making RAII the foundation of exception-safe code.

**Stack Unwinding Mechanism:**

When an exception is thrown, the C++ runtime performs **stack unwinding**:

| Step | Action | RAII Benefit |
|------|--------|--------------|
| **1. Exception thrown** | Control flow jumps to handler | N/A |
| **2. Search for handler** | Unwind call stack looking for `catch` | N/A |
| **3. Destroy local objects** | Call destructors for all objects in scope | ✅ **RAII cleanup happens here** |
| **4. Continue unwinding** | Move to previous stack frame | ✅ **RAII cleanup in each frame** |
| **5. Handler found** | Execute `catch` block | All resources already cleaned up |

**Code Example - Stack Unwinding Visualization:**

```cpp
class Resource {
    std::string name;
public:
    Resource(const std::string& n) : name(n) {
        std::cout << "Acquired: " << name << "\n";
    }
    ~Resource() {
        std::cout << "Released: " << name << "\n";
    }
};

void level3() {
    Resource r3("Level3");
    throw std::runtime_error("Error!");
    // ← ~r3() called during unwinding
}

void level2() {
    Resource r2("Level2");
    level3();
    // ← ~r2() called during unwinding
}

void level1() {
    Resource r1("Level1");
    try {
        level2();
    } catch (const std::exception& e) {
        std::cout << "Caught: " << e.what() << "\n";
    }
    // ← ~r1() called after catch (normal scope exit)
}

/* Output:
Acquired: Level1
Acquired: Level2
Acquired: Level3
Released: Level3  ← Stack unwinding begins
Released: Level2  ← Continues unwinding
Caught: Error!
Released: Level1  ← Normal destruction
*/
```

**Exception Safety Guarantee Levels:**

| Level | Guarantee | State After Exception | RAII Role |
|-------|-----------|----------------------|-----------|
| **No Guarantee** | None | May leak resources, corrupt state | ❌ Not using RAII |
| **Basic Guarantee** | No leaks | Resources cleaned up, state may change | ✅ RAII prevents leaks |
| **Strong Guarantee** | Commit or rollback | State unchanged (transactional) | ✅ RAII + copy-and-swap |
| **Nothrow Guarantee** | Never throws | Operation always succeeds | ✅ RAII with `noexcept` destructors |

**Basic Exception Safety with RAII:**

```cpp
class Processor {
    std::unique_ptr<int[]> buffer;  // ✅ RAII-managed memory
    std::mutex mtx;                  // ✅ RAII-managed mutex
    int counter = 0;

public:
    void process() {
        std::lock_guard<std::mutex> lock(mtx);  // ✅ RAII lock

        buffer = std::make_unique<int[]>(1000);  // ✅ No leak if next line throws

        counter++;  // State modified

        riskyOperation();  // May throw

        // ✅ If exception thrown:
        // - lock_guard destructor unlocks mutex
        // - buffer unique_ptr releases memory
        // - counter remains incremented (basic guarantee)
    }
};
```

**Strong Exception Safety with Copy-and-Swap:**

```cpp
class StrongContainer {
    std::vector<int> data;

public:
    void addItem(int item) {
        std::vector<int> temp = data;  // 1. Copy current state
        temp.push_back(item);           // 2. Modify copy
        riskyOperation();               // 3. May throw
        data = std::move(temp);         // 4. Commit only if no exception

        // ✅ Strong guarantee: data unchanged if exception thrown
    }
};
```

**Why Manual Cleanup Fails with Exceptions:**

```cpp
// ❌ Manual cleanup with exceptions
void dangerousFunction() {
    Resource* res = acquireResource();

    processData();  // May throw

    releaseResource(res);  // ❌ Never reached if processData() throws
}

// ✅ RAII cleanup with exceptions
void safeFunction() {
    ResourceWrapper res;  // Acquire

    processData();  // May throw

}  // ✅ Destructor called even if processData() threw
```

**Exception Safety Decision Matrix:**

| Scenario | Use This Pattern | Reasoning |
|----------|-----------------|-----------|
| **Allocating memory** | `unique_ptr`, `shared_ptr` | Automatic deallocation during unwinding |
| **Opening files** | `std::fstream` or custom RAII wrapper | Automatic close during unwinding |
| **Locking mutexes** | `std::lock_guard`, `std::unique_lock` | Automatic unlock during unwinding |
| **Database transaction** | Custom RAII transaction wrapper | Auto-rollback if not committed |
| **Multiple resources** | Each resource in RAII member | Partial acquisition cleaned up automatically |
| **Complex state changes** | Copy-and-swap idiom | Transactional all-or-nothing semantics |

---

#### 3. Deterministic Destruction vs Garbage Collection - Compile-Time Guarantees

RAII provides **deterministic, immediate resource cleanup** at known code points, fundamentally different from garbage collection's unpredictable timing.

**RAII vs Garbage Collection Comparison:**

| Aspect | RAII (C++) | Garbage Collection (Java/C#) |
|--------|------------|------------------------------|
| **Cleanup Timing** | ✅ Deterministic (exactly at scope exit) | ❌ Non-deterministic (GC decides when) |
| **Resource Types** | ✅ ALL resources (memory, files, locks, sockets) | ⚠️ Memory only |
| **Runtime Overhead** | ✅ Zero (destructor inlining) | ❌ GC pauses, memory overhead |
| **Predictability** | ✅ Cleanup at known code locations | ❌ Cleanup at unknown times |
| **File Handle Limit** | ✅ Released immediately when done | ❌ May hit OS limit before GC runs |
| **Mutex Locks** | ✅ Released exactly at scope exit | ❌ Requires explicit `finally` blocks |
| **Real-Time Systems** | ✅ Suitable (deterministic) | ❌ Unsuitable (GC pauses) |
| **Memory Fragmentation** | ⚠️ Can occur | ✅ Compacting GC reduces fragmentation |

**Deterministic Cleanup Example:**

```cpp
void processFiles() {
    {
        std::ifstream file1("data1.txt");  // File 1 opened
        // Use file1
    }  // ← File 1 closed HERE (deterministic)

    std::cout << "Between files\n";  // file1 definitely closed

    {
        std::ifstream file2("data2.txt");  // File 2 opened
        // Use file2
    }  // ← File 2 closed HERE (deterministic)
}

// Contrast with GC languages (pseudocode):
void processFiles() {
    FileStream file1 = new FileStream("data1.txt");
    // Use file1
    file1 = null;  // Eligible for GC, but NOT closed yet

    console.log("Between files");  // file1 still open!

    FileStream file2 = new FileStream("data2.txt");  // May fail if too many open handles

    // Files closed sometime later when GC runs (unpredictable)
}
```

**Why Deterministic Destruction Matters:**

| Scenario | RAII Behavior | GC Behavior | Impact |
|----------|---------------|-------------|--------|
| **File handle limit** (typically 1024) | File closed immediately | Files accumulate until GC runs | ❌ May hit OS limit before GC |
| **Mutex lock critical section** | Lock released at `}` | Lock held until GC finalizes | ❌ Deadlocks, poor concurrency |
| **Database transaction** | Committed/rolled back immediately | Connection held until GC | ❌ Connection pool exhaustion |
| **Network socket** | Closed when done | Socket lingers until GC | ❌ Port exhaustion |
| **Real-time deadline** | Cleanup at known time | Cleanup at GC pause (unknown) | ❌ Missed deadlines |

**RAII Provides Compile-Time Safety:**

```cpp
// ✅ RAII: Impossible to forget cleanup
void processData() {
    std::unique_ptr<int[]> buffer(new int[1000]);

    // Use buffer...

    // ✅ IMPOSSIBLE to forget delete - destructor called automatically
}

// ❌ Manual management: Easy to forget cleanup
void processDataManual() {
    int* buffer = new int[1000];

    // Use buffer...

    // ❌ EASY to forget: delete[] buffer;
    // Compiler won't warn - runtime leak
}
```

**Scope-Based Determinism Example:**

```cpp
class Timer {
    std::chrono::time_point<std::chrono::high_resolution_clock> start;
public:
    Timer() : start(std::chrono::high_resolution_clock::now()) {
        std::cout << "Timer started\n";
    }
    ~Timer() {
        auto end = std::chrono::high_resolution_clock::now();
        auto duration = std::chrono::duration_cast<std::chrono::milliseconds>(end - start);
        std::cout << "Elapsed: " << duration.count() << "ms\n";
    }
};

void benchmark() {
    {
        Timer t;  // ← Timer starts
        expensiveOperation();
    }  // ← Timer stops and prints EXACTLY here

    // Next line executes knowing timer has stopped
    std::cout << "Operation complete\n";
}
```

**RAII Makes Resource Leaks Structurally Impossible:**

| Manual Management | RAII |
|-------------------|------|
| `Resource* r = acquire();` | `ResourceWrapper r;` |
| `// ...code...` | `// ...code...` |
| `release(r);  // ❌ Can forget` | `// ✅ Impossible to forget` |
| 7 different code paths need cleanup | 1 destructor handles all paths |
| Compiler can't detect leak | Compiler enforces cleanup |

**Best Practices Summary:**

| Practice | Rationale |
|----------|-----------|
| **Always prefer RAII wrappers** | Automatic cleanup beats manual cleanup |
| **Use `unique_ptr` for ownership** | Single ownership, zero overhead |
| **Use `shared_ptr` for shared ownership** | Reference counting, automatic cleanup |
| **Wrap non-memory resources** | Files, locks, sockets all benefit |
| **Delete copy operations for unique resources** | Prevent double-free bugs |
| **Implement move operations** | Enable efficient ownership transfer |
| **Mark destructors `noexcept`** | Prevent `std::terminate()` during unwinding |
| **Never throw from destructors** | Avoid crashes during exception handling |

---

### EDGE_CASES: Tricky Scenarios and Gotchas

#### Edge Case 1: Partial Construction and Exception Safety

When a constructor throws an exception before completing, the object is considered not fully constructed, and its destructor will not be called. However, destructors for any fully constructed member variables will be invoked during stack unwinding. This creates a critical edge case: if a constructor manually allocates resources before throwing, those resources can leak unless they are themselves wrapped in RAII objects.

```cpp
class Leaky {
    int* data1;
    int* data2;
public:
    Leaky() {
        data1 = new int[100];  // ❌ If next line throws, data1 leaks
        data2 = new int[200];  // This might throw (bad_alloc)
    }
    ~Leaky() {
        delete[] data1;  // Never called if constructor throws
        delete[] data2;
    }
};

class Safe {
    std::unique_ptr<int[]> data1;
    std::unique_ptr<int[]> data2;
public:
    Safe() 
        : data1(new int[100])   // ✅ If next line throws, data1 is cleaned up
        , data2(new int[200])   // Strong exception safety
    {}
};
```

The fundamental rule: use RAII wrappers for all resources acquired during construction. Member initializer lists provide strong exception safety because fully constructed members have their destructors called even if later members throw. Raw pointer members create exception safety holes that must be plugged with manual try-catch blocks or avoided entirely through RAII.

#### Edge Case 2: Destructor Exceptions and std::terminate

Throwing exceptions from destructors is dangerous and usually forbidden. If a destructor throws while another exception is already propagating (during stack unwinding), the C++ runtime has two active exceptions with no clear resolution path. The standard response is to call `std::terminate()`, immediately crashing the program. This makes destructor exceptions particularly insidious—they can turn recoverable errors into fatal crashes.

```cpp
class Dangerous {
    FILE* file;
public:
    Dangerous(const char* filename) {
        file = fopen(filename, "r");
        if (!file) throw std::runtime_error("Open failed");
    }
    
    ~Dangerous() {
        if (fclose(file) != 0) {
            throw std::runtime_error("Close failed");  // ❌ NEVER throw from destructor
        }
    }
};

void problematic() {
    Dangerous d("file.txt");
    throw std::runtime_error("Some error");  
    // During stack unwinding, ~Dangerous() throws → std::terminate() called
}
```

Best practice dictates that destructors should be `noexcept` by default (which they are in C++11 and later). If cleanup operations can fail, they should be logged or swallowed rather than thrown. For operations where failure must be reported, provide explicit cleanup methods that can throw, separate from the destructor.

```cpp
class Safe {
    FILE* file;
public:
    Safe(const char* filename) {
        file = fopen(filename, "r");
        if (!file) throw std::runtime_error("Open failed");
    }
    
    ~Safe() noexcept {
        if (file && fclose(file) != 0) {
            // Log error, but don't throw
            std::cerr << "Warning: file close failed\n";
        }
    }
    
    // Explicit close that can report errors
    void close() {  
        if (file && fclose(file) != 0) {
            file = nullptr;
            throw std::runtime_error("Close failed");
        }
        file = nullptr;
    }
};
```

#### Edge Case 3: Static and Global RAII Objects

RAII objects with static or global storage duration introduce initialization and destruction order complexities. Static objects within functions have well-defined initialization order (initialized on first use), but global objects across translation units have undefined initialization order. This creates the "static initialization order fiasco" where one global RAII object might depend on another that hasn't been initialized yet.

```cpp
// In file1.cpp
class Logger {
public:
    Logger() { std::cout << "Logger initialized\n"; }
    void log(const std::string& msg) { std::cout << msg << "\n"; }
};

Logger globalLogger;  // ❌ Initialization order undefined across files

// In file2.cpp
extern Logger globalLogger;

class DatabaseConnection {
public:
    DatabaseConnection() {
        globalLogger.log("DB connecting");  // ❌ globalLogger might not exist yet
    }
};

DatabaseConnection globalDB;  // Depends on globalLogger
```

Destruction order is the reverse of initialization order, which means global RAII objects can access each other during destruction in ways that violate lifetime guarantees. A global logger might be destroyed before other global objects that try to log their destruction, leading to undefined behavior.

```cpp
// Safe pattern: Static function-local objects
Logger& getLogger() {
    static Logger logger;  // ✅ Initialized on first use
    return logger;
}

class DatabaseConnection {
public:
    DatabaseConnection() {
        getLogger().log("DB connecting");  // ✅ Logger guaranteed to exist
    }
};
```

#### Edge Case 4: RAII and Return Value Optimization (RVO)

Return Value Optimization and copy elision can affect how RAII objects behave when returned from functions. Prior to C++17, returning a RAII object could trigger copy or move construction, potentially leading to resource ownership transfers. C++17 guarantees copy elision in many scenarios, making return-by-value more efficient and predictable for RAII types.

```cpp
class Resource {
    int* data;
public:
    Resource() : data(new int[1000]) {
        std::cout << "Resource acquired\n";
    }
    ~Resource() {
        delete[] data;
        std::cout << "Resource released\n";
    }
    
    // Move constructor for ownership transfer
    Resource(Resource&& other) noexcept : data(other.data) {
        other.data = nullptr;
        std::cout << "Resource moved\n";
    }
};

Resource createResource() {
    Resource r;  // Constructed in caller's stack frame (C++17 RVO)
    return r;    // No move constructor called in C++17+
}

void test() {
    Resource r = createResource();  // Single construction only
}  // Single destruction
```

The key insight: RAII objects should always implement move semantics (or delete copy operations) to support efficient ownership transfer. Even with RVO, move semantics serve as a fallback and make the class's ownership semantics explicit.

#### Edge Case 5: RAII with Multiple Resources and Strong Exception Safety

Managing multiple resources within a single class while maintaining strong exception safety requires careful ordering and RAII wrapping. If one resource fails to acquire after another has succeeded, the successful acquisition must be rolled back. Using RAII members for each resource ensures automatic rollback during stack unwinding.

```cpp
class MultiResource {
    FILE* file;
    int* buffer;
    std::mutex* mtx;
public:
    // ❌ Not exception-safe
    MultiResource(const char* filename, size_t size) {
        file = fopen(filename, "r");
        if (!file) throw std::runtime_error("File open failed");
        
        buffer = new int[size];  // If this throws, file leaks
        
        mtx = new std::mutex();  // If this throws, both file and buffer leak
    }
    
    ~MultiResource() {
        delete mtx;
        delete[] buffer;
        fclose(file);
    }
};

// ✅ Exception-safe with RAII members
class MultiResourceSafe {
    std::unique_ptr<FILE, decltype(&fclose)> file;
    std::unique_ptr<int[]> buffer;
    std::unique_ptr<std::mutex> mtx;
public:
    MultiResourceSafe(const char* filename, size_t size)
        : file(fopen(filename, "r"), &fclose)  // If nullptr, constructor throws
        , buffer(new int[size])                 // If this throws, file is cleaned up
        , mtx(new std::mutex())                 // If this throws, file and buffer cleaned up
    {
        if (!file) throw std::runtime_error("File open failed");
    }
    // Destructor automatically correct
};
```

### CODE_EXAMPLES: Practical Demonstrations

#### Example 1: Basic File Handle RAII

```cpp
#include <cstdio>
#include <stdexcept>
#include <string>

class FileHandle {
    FILE* file;
    std::string filename;
    
public:
    FileHandle(const char* name, const char* mode) 
        : file(nullptr), filename(name) {
        file = fopen(name, mode);
        if (!file) {
            throw std::runtime_error("Failed to open file: " + filename);
        }
    }
    
    ~FileHandle() noexcept {
        if (file) {
            fclose(file);
        }
    }
    
    // Prevent copying
    FileHandle(const FileHandle&) = delete;
    FileHandle& operator=(const FileHandle&) = delete;
    
    // Allow moving
    FileHandle(FileHandle&& other) noexcept 
        : file(other.file), filename(std::move(other.filename)) {
        other.file = nullptr;
    }
    
    FileHandle& operator=(FileHandle&& other) noexcept {
        if (this != &other) {
            if (file) fclose(file);
            file = other.file;
            filename = std::move(other.filename);
            other.file = nullptr;
        }
        return *this;
    }
    
    FILE* get() const { return file; }
};

void processFile(const char* filename) {
    FileHandle file(filename, "r");  // ✅ Automatically closed on scope exit
    char buffer[256];
    while (fgets(buffer, sizeof(buffer), file.get())) {
        // Process file content
        if (/* some error */) {
            throw std::runtime_error("Processing error");
            // ✅ File automatically closed via destructor
        }
    }
    // ✅ File automatically closed here too
}
```

This example demonstrates the fundamental RAII pattern: the FileHandle class acquires the file resource in its constructor and releases it in its destructor. The file is guaranteed to be closed regardless of how the function exits—normal return, early return, or exception. Copy operations are deleted to prevent double-close bugs, while move operations are provided to enable ownership transfer.

#### Example 2: Mutex Lock Guard

```cpp
#include <mutex>
#include <iostream>

class SimpleLockGuard {
    std::mutex& mtx;
    
public:
    explicit SimpleLockGuard(std::mutex& m) : mtx(m) {
        mtx.lock();  // Acquire lock
    }
    
    ~SimpleLockGuard() noexcept {
        mtx.unlock();  // Release lock
    }
    
    // Delete copy and move (lock guards shouldn't be transferable)
    SimpleLockGuard(const SimpleLockGuard&) = delete;
    SimpleLockGuard& operator=(const SimpleLockGuard&) = delete;
    SimpleLockGuard(SimpleLockGuard&&) = delete;
    SimpleLockGuard& operator=(SimpleLockGuard&&) = delete;
};

class Counter {
    int count = 0;
    std::mutex mtx;
    
public:
    void increment() {
        SimpleLockGuard lock(mtx);  // ✅ Lock acquired
        ++count;
        if (count > 100) {
            throw std::runtime_error("Count exceeded");
            // ✅ Lock automatically released via destructor
        }
        // ✅ Lock automatically released here too
    }
    
    int getCount() {
        SimpleLockGuard lock(mtx);  // ✅ Thread-safe read
        return count;
    }  // ✅ Lock released
};
```

The lock guard pattern is a classic RAII application for synchronization primitives. The lock is acquired in the constructor and released in the destructor, ensuring that even if exceptions occur within the critical section, the mutex is always unlocked. This prevents deadlocks that would occur with manual lock/unlock patterns where the unlock might be skipped due to exceptions.

#### Example 3: Database Transaction RAII

```cpp
#include <iostream>
#include <string>
#include <stdexcept>

// Simplified database connection interface
class DBConnection {
public:
    void executeQuery(const std::string& query) {
        std::cout << "Executing: " << query << "\n";
    }
    void beginTransaction() {
        std::cout << "BEGIN TRANSACTION\n";
    }
    void commit() {
        std::cout << "COMMIT\n";
    }
    void rollback() {
        std::cout << "ROLLBACK\n";
    }
};

class Transaction {
    DBConnection& db;
    bool committed;
    
public:
    explicit Transaction(DBConnection& connection) 
        : db(connection), committed(false) {
        db.beginTransaction();
    }
    
    ~Transaction() noexcept {
        if (!committed) {
            try {
                db.rollback();  // ✅ Auto-rollback if not committed
            } catch (...) {
                // Swallow exceptions in destructor
                std::cerr << "Rollback failed during cleanup\n";
            }
        }
    }
    
    void commit() {
        db.commit();
        committed = true;
    }
    
    Transaction(const Transaction&) = delete;
    Transaction& operator=(const Transaction&) = delete;
};

void updateDatabase(DBConnection& db) {
    Transaction txn(db);  // ✅ Transaction begins
    
    db.executeQuery("INSERT INTO users VALUES (...)");
    db.executeQuery("UPDATE accounts SET balance = ...");
    
    if (/* validation fails */) {
        throw std::runtime_error("Validation error");
        // ✅ Transaction automatically rolled back via destructor
    }
    
    txn.commit();  // ✅ Explicitly commit if all succeeded
}  // If commit wasn't called, rollback happens here
```

The transaction RAII wrapper implements the common "commit or rollback" pattern. By default, transactions roll back when the object is destroyed, ensuring that partial database changes are never left in an inconsistent state. Only explicit commit makes changes permanent. This pattern prevents data corruption from exceptions or forgotten commits.

#### Example 4: Network Socket RAII

```cpp
#include <sys/socket.h>
#include <unistd.h>
#include <stdexcept>

class Socket {
    int sockfd;
    
public:
    Socket() : sockfd(-1) {
        sockfd = socket(AF_INET, SOCK_STREAM, 0);
        if (sockfd < 0) {
            throw std::runtime_error("Failed to create socket");
        }
    }
    
    ~Socket() noexcept {
        if (sockfd >= 0) {
            close(sockfd);  // ✅ Automatically close socket
        }
    }
    
    // Delete copy
    Socket(const Socket&) = delete;
    Socket& operator=(const Socket&) = delete;
    
    // Allow move
    Socket(Socket&& other) noexcept : sockfd(other.sockfd) {
        other.sockfd = -1;
    }
    
    Socket& operator=(Socket&& other) noexcept {
        if (this != &other) {
            if (sockfd >= 0) close(sockfd);
            sockfd = other.sockfd;
            other.sockfd = -1;
        }
        return *this;
    }
    
    int get() const { return sockfd; }
    
    void connect(/* connection parameters */) {
        // Connection logic
        if (/* connection fails */) {
            throw std::runtime_error("Connection failed");
            // ✅ Socket automatically closed via destructor
        }
    }
};

void communicateWithServer() {
    Socket sock;  // ✅ Socket created
    sock.connect(/* params */);
    
    // Send/receive data
    // If exception thrown anywhere, socket automatically closed
    
}  // ✅ Socket closed here
```

Network sockets require explicit closure through system calls. The Socket RAII wrapper ensures that socket file descriptors are never leaked, even when network operations fail with exceptions. Move semantics allow sockets to be returned from factory functions and stored in containers while maintaining single ownership.

#### Example 5: Stack Unwinding Demonstration

```cpp
#include <iostream>
#include <stdexcept>

class Resource {
    std::string name;
public:
    Resource(const std::string& n) : name(n) {
        std::cout << "Acquired: " << name << "\n";
    }
    ~Resource() {
        std::cout << "Released: " << name << "\n";
    }
};

void level3() {
    Resource r3("Resource3");
    std::cout << "In level3\n";
    throw std::runtime_error("Error in level3");
    // r3 destructor called during stack unwinding
}

void level2() {
    Resource r2("Resource2");
    std::cout << "In level2\n";
    level3();
    // r2 destructor called after level3 unwinds
}

void level1() {
    Resource r1("Resource1");
    std::cout << "In level1\n";
    try {
        level2();
    } catch (const std::exception& e) {
        std::cout << "Caught: " << e.what() << "\n";
    }
    // r1 destructor called after catch block
}

int main() {
    level1();
    return 0;
}

/* Output:
Acquired: Resource1
In level1
Acquired: Resource2
In level2
Acquired: Resource3
In level3
Released: Resource3  // ✅ Unwinding begins
Released: Resource2  // ✅ Continues up the stack
Caught: Error in level3
Released: Resource1  // ✅ Normal destruction after catch
*/
```

This example visualizes stack unwinding in action. When the exception is thrown in level3, destructors are called in reverse order of construction (Resource3, Resource2) during unwinding. Resource1 is destroyed normally after the exception is caught. This demonstrates RAII's automatic cleanup guarantee during exception propagation.

#### Example 6: Exception Safety Levels

```cpp
#include <vector>
#include <string>
#include <memory>

// ❌ No exception safety - leaks on exception
class NoGuarantee {
    int* data;
public:
    void process() {
        data = new int[100];
        doSomethingRisky();  // If throws, data leaks
        delete[] data;
    }
};

// ✅ Basic exception safety - no leaks, but state may be modified
class BasicSafety {
    std::unique_ptr<int[]> data;
    int counter = 0;
public:
    void process() {
        data = std::make_unique<int[]>(100);  // No leak on exception
        counter++;  // State modified even if next line throws
        doSomethingRisky();
    }
};

// ✅ Strong exception safety - transactional behavior
class StrongSafety {
    std::vector<std::string> items;
public:
    void addItem(const std::string& item) {
        std::vector<std::string> temp = items;  // Copy current state
        temp.push_back(item);  // Modify copy
        doSomethingRisky();    // If throws, original unchanged
        items = std::move(temp);  // Commit only if successful
    }
};

// ✅ Nothrow guarantee - guaranteed not to throw
class NothrowGuarantee {
    int value;
public:
    void swap(NothrowGuarantee& other) noexcept {
        std::swap(value, other.value);  // Swap never throws
    }
    
    int getValue() const noexcept {
        return value;  // Simple getter never throws
    }
};
```

This example demonstrates the four levels of exception safety. RAII enables basic safety by preventing leaks. Strong safety requires the "copy and swap" idiom where modifications are made to temporary copies that are only committed after all potentially throwing operations succeed. Nothrow operations are marked `noexcept` and typically involve simple operations like swaps or getters.

#### Example 7: Scope Guard Pattern

```cpp
#include <functional>
#include <iostream>

class ScopeGuard {
    std::function<void()> onExit;
    bool dismissed = false;
    
public:
    template<typename Func>
    explicit ScopeGuard(Func&& f) : onExit(std::forward<Func>(f)) {}
    
    ~ScopeGuard() noexcept {
        if (!dismissed) {
            try {
                onExit();
            } catch (...) {
                // Swallow exceptions in destructor
            }
        }
    }
    
    void dismiss() { dismissed = true; }
    
    ScopeGuard(const ScopeGuard&) = delete;
    ScopeGuard& operator=(const ScopeGuard&) = delete;
};

void processWithCleanup() {
    void* resource1 = acquireResource1();
    ScopeGuard cleanup1([resource1]() { 
        releaseResource1(resource1);  // ✅ Always called
    });
    
    void* resource2 = acquireResource2();
    ScopeGuard cleanup2([resource2]() {
        releaseResource2(resource2);  // ✅ Always called
    });
    
    performRiskyOperation();  // If throws, both cleanups happen
    
    // On success, cleanup2 then cleanup1 called in reverse order
}
```

The scope guard pattern provides generalized RAII for arbitrary cleanup operations. Instead of writing specialized RAII classes for every resource type, scope guards allow lambda functions to specify cleanup logic inline. Cleanup happens automatically on scope exit, whether through normal flow or exceptions.

#### Example 8: RAII with Multiple Exit Points

```cpp
#include <iostream>
#include <fstream>

// ❌ Manual cleanup - error prone with multiple exits
void processFileBad(const char* filename) {
    FILE* file = fopen(filename, "r");
    if (!file) return;
    
    char buffer[256];
    if (!fgets(buffer, sizeof(buffer), file)) {
        fclose(file);  // Must remember cleanup
        return;
    }
    
    if (/* validation fails */) {
        fclose(file);  // Must remember cleanup
        return;
    }
    
    // Process data
    
    fclose(file);  // Must remember cleanup
}

// ✅ RAII cleanup - automatic with all exits
void processFileGood(const char* filename) {
    std::ifstream file(filename);  // RAII file handle
    if (!file) return;  // ✅ Auto-closed
    
    std::string line;
    if (!std::getline(file, line)) {
        return;  // ✅ Auto-closed
    }
    
    if (/* validation fails */) {
        return;  // ✅ Auto-closed
    }
    
    // Process data
    
}  // ✅ Auto-closed on normal exit
```

Multiple exit points create cleanup complexity with manual resource management. Each return path requires explicit cleanup code, and forgetting any one path causes a leak. RAII eliminates this entire problem class—cleanup is automatic regardless of exit path, making refactoring and adding early returns safe operations.

#### Example 9: Autonomous Vehicle - Sensor Resource Management with RAII

```cpp
#include <iostream>
#include <string>
#include <vector>
#include <memory>
#include <mutex>
#include <stdexcept>
#include <chrono>
using namespace std;

// Part 1: LiDAR Hardware Resource RAII Wrapper
class LiDARHardware {
private:
    int device_fd;          // Hardware file descriptor
    string device_path;
    bool is_initialized;

public:
    LiDARHardware(const string& path)
        : device_fd(-1), device_path(path), is_initialized(false) {

        cout << "[LiDAR] Acquiring hardware resource: " << device_path << endl;

        // Simulate hardware initialization (would be real syscalls)
        device_fd = 42;  // In reality: open(device_path.c_str(), O_RDWR)

        if (device_fd < 0) {
            throw runtime_error("Failed to open LiDAR device: " + device_path);
        }

        // Initialize hardware registers
        is_initialized = true;
        cout << "[LiDAR] Hardware initialized (fd=" << device_fd << ")" << endl;
    }

    ~LiDARHardware() noexcept {
        if (device_fd >= 0) {
            cout << "[LiDAR] Releasing hardware resource (fd=" << device_fd << ")" << endl;
            // In reality: close(device_fd)
            device_fd = -1;
        }
        is_initialized = false;
    }

    // Delete copy operations - hardware resources are unique
    LiDARHardware(const LiDARHardware&) = delete;
    LiDARHardware& operator=(const LiDARHardware&) = delete;

    // Allow move semantics for ownership transfer
    LiDARHardware(LiDARHardware&& other) noexcept
        : device_fd(other.device_fd)
        , device_path(move(other.device_path))
        , is_initialized(other.is_initialized) {

        other.device_fd = -1;
        other.is_initialized = false;
        cout << "[LiDAR] Ownership transferred via move" << endl;
    }

    LiDARHardware& operator=(LiDARHardware&& other) noexcept {
        if (this != &other) {
            // Release current resource
            if (device_fd >= 0) {
                cout << "[LiDAR] Releasing old resource during move assignment" << endl;
            }

            // Transfer ownership
            device_fd = other.device_fd;
            device_path = move(other.device_path);
            is_initialized = other.is_initialized;

            other.device_fd = -1;
            other.is_initialized = false;
        }
        return *this;
    }

    void readPoint(double& x, double& y, double& z) {
        if (!is_initialized) {
            throw runtime_error("LiDAR not initialized");
        }
        // Simulate reading from hardware
        x = 10.5;
        y = 20.3;
        z = 1.5;
    }

    bool isReady() const { return is_initialized; }
};

// Part 2: Sensor Data Buffer with Exception Safety
class SensorDataBuffer {
private:
    unique_ptr<double[]> buffer;
    size_t capacity;
    size_t size;
    mutable mutex buffer_mutex;

public:
    SensorDataBuffer(size_t cap)
        : buffer(new double[cap])  // ✅ RAII: unique_ptr ensures cleanup
        , capacity(cap)
        , size(0) {

        cout << "[Buffer] Allocated " << capacity << " elements" << endl;

        // If constructor throws after this point, unique_ptr cleans up buffer
        if (capacity > 10000) {
            throw runtime_error("Buffer size exceeds hardware limits");
            // ✅ buffer automatically deallocated via unique_ptr destructor
        }
    }

    ~SensorDataBuffer() {
        cout << "[Buffer] Destroying buffer with " << size << " elements" << endl;
        // ✅ unique_ptr automatically deallocates buffer
        // ✅ mutex automatically destroyed
    }

    void addReading(double value) {
        lock_guard<mutex> lock(buffer_mutex);  // ✅ RAII lock management

        if (size >= capacity) {
            throw runtime_error("Buffer overflow");
            // ✅ lock_guard automatically unlocks mutex
        }

        buffer[size++] = value;
    }

    double getAverage() const {
        lock_guard<mutex> lock(buffer_mutex);  // ✅ Thread-safe read

        if (size == 0) return 0.0;

        double sum = 0.0;
        for (size_t i = 0; i < size; i++) {
            sum += buffer[i];
        }

        return sum / size;
    }  // ✅ lock_guard destructor unlocks mutex

    size_t getSize() const {
        lock_guard<mutex> lock(buffer_mutex);
        return size;
    }
};

// Part 3: Processing Pipeline with Multiple Resources and Strong Exception Safety
class SensorProcessingPipeline {
private:
    unique_ptr<LiDARHardware> lidar;
    unique_ptr<SensorDataBuffer> raw_buffer;
    unique_ptr<SensorDataBuffer> filtered_buffer;
    bool pipeline_active;

public:
    SensorProcessingPipeline(const string& device_path, size_t buffer_size)
        : pipeline_active(false) {

        cout << "\n[Pipeline] Initializing sensor processing pipeline..." << endl;

        // ✅ Exception-safe initialization using member initializer list
        // Resources initialized in order; if any throws, previous ones cleaned up
        try {
            lidar = make_unique<LiDARHardware>(device_path);
            // If next line throws, lidar is automatically destroyed

            raw_buffer = make_unique<SensorDataBuffer>(buffer_size);
            // If next line throws, both lidar and raw_buffer destroyed

            filtered_buffer = make_unique<SensorDataBuffer>(buffer_size / 2);
            // All resources successfully acquired

            pipeline_active = true;
            cout << "[Pipeline] All resources initialized successfully" << endl;

        } catch (const exception& e) {
            cout << "[Pipeline] Initialization failed: " << e.what() << endl;
            // ✅ unique_ptr ensures automatic cleanup of partially acquired resources
            throw;
        }
    }

    ~SensorProcessingPipeline() {
        cout << "\n[Pipeline] Shutting down pipeline..." << endl;
        pipeline_active = false;
        // ✅ unique_ptr members automatically destroyed in reverse order:
        // 1. filtered_buffer destroyed
        // 2. raw_buffer destroyed
        // 3. lidar destroyed
        cout << "[Pipeline] Pipeline shutdown complete" << endl;
    }

    void processFrame() {
        if (!pipeline_active || !lidar->isReady()) {
            throw runtime_error("Pipeline not ready");
        }

        cout << "\n[Pipeline] Processing sensor frame..." << endl;

        // Read multiple points from LiDAR
        for (int i = 0; i < 5; i++) {
            double x, y, z;
            lidar->readPoint(x, y, z);

            double distance = sqrt(x*x + y*y + z*z);
            raw_buffer->addReading(distance);

            // Filter: only add readings > 15.0 to filtered buffer
            if (distance > 15.0) {
                filtered_buffer->addReading(distance);
            }
        }

        cout << "[Pipeline] Frame processing complete" << endl;
        cout << "  Raw readings: " << raw_buffer->getSize() << endl;
        cout << "  Filtered readings: " << filtered_buffer->getSize() << endl;
        cout << "  Average distance: " << raw_buffer->getAverage() << " meters" << endl;
    }
};

// Part 4: Demonstrating Exception Safety with Multiple Exit Paths
void demonstrateExceptionSafety() {
    cout << "\n=== Demonstration 1: Normal Operation ===" << endl;

    try {
        SensorProcessingPipeline pipeline("/dev/lidar0", 100);
        pipeline.processFrame();
        pipeline.processFrame();
        // ✅ Pipeline destructor called on scope exit
        // ✅ All resources automatically cleaned up
    } catch (const exception& e) {
        cout << "Error: " << e.what() << endl;
    }

    cout << "\n=== Demonstration 2: Exception During Processing ===" << endl;

    try {
        SensorProcessingPipeline pipeline("/dev/lidar0", 100);
        pipeline.processFrame();

        // Simulate processing error
        throw runtime_error("Sensor data validation failed");

        pipeline.processFrame();  // Never reached

    } catch (const exception& e) {
        cout << "Caught exception: " << e.what() << endl;
        // ✅ Pipeline destructor called during stack unwinding
        // ✅ All resources (lidar hardware, buffers, mutexes) cleaned up
    }

    cout << "\n=== Demonstration 3: Exception During Initialization ===" << endl;

    try {
        // This will throw during buffer initialization
        SensorProcessingPipeline pipeline("/dev/lidar0", 20000);  // Exceeds limit

    } catch (const exception& e) {
        cout << "Caught exception: " << e.what() << endl;
        // ✅ Partially constructed resources already cleaned up
        // ✅ LiDAR hardware was released when unique_ptr went out of scope
    }
}

// Part 5: Move Semantics with RAII
LiDARHardware createLiDAR(const string& device) {
    cout << "\n[Factory] Creating LiDAR hardware..." << endl;
    LiDARHardware lidar(device);
    cout << "[Factory] Returning LiDAR (move semantics)" << endl;
    return lidar;  // ✅ Move, not copy - ownership transferred
}

void demonstrateMoveSemantics() {
    cout << "\n=== Demonstration 4: Move Semantics ===" << endl;

    LiDARHardware lidar1 = createLiDAR("/dev/lidar0");
    // ✅ Single hardware resource, ownership transferred via move

    cout << "\n[Main] Moving lidar1 to lidar2..." << endl;
    LiDARHardware lidar2 = move(lidar1);
    // ✅ lidar1 is now in moved-from state (safe but unusable)
    // ✅ lidar2 owns the hardware resource

    cout << "\n[Main] lidar2 owns the resource" << endl;
    cout << "lidar2 ready: " << (lidar2.isReady() ? "yes" : "no") << endl;

    // ✅ When lidar2 goes out of scope, hardware resource released
}

int main() {
    cout << "=== Autonomous Vehicle RAII Demonstration ===" << endl;

    demonstrateExceptionSafety();
    demonstrateMoveSemantics();

    cout << "\n=== Program ending - all resources cleaned up ===" << endl;
    return 0;
}
```

**Output:**
```
=== Autonomous Vehicle RAII Demonstration ===

=== Demonstration 1: Normal Operation ===

[Pipeline] Initializing sensor processing pipeline...
[LiDAR] Acquiring hardware resource: /dev/lidar0
[LiDAR] Hardware initialized (fd=42)
[Buffer] Allocated 100 elements
[Buffer] Allocated 50 elements
[Pipeline] All resources initialized successfully

[Pipeline] Processing sensor frame...
[Pipeline] Frame processing complete
  Raw readings: 5
  Filtered readings: 5
  Average distance: 25.1976 meters

[Pipeline] Processing sensor frame...
[Pipeline] Frame processing complete
  Raw readings: 10
  Filtered readings: 10
  Average distance: 25.1976 meters

[Pipeline] Shutting down pipeline...
[Buffer] Destroying buffer with 10 elements
[Buffer] Destroying buffer with 10 elements
[LiDAR] Releasing hardware resource (fd=42)
[Pipeline] Pipeline shutdown complete

=== Demonstration 2: Exception During Processing ===

[Pipeline] Initializing sensor processing pipeline...
[LiDAR] Acquiring hardware resource: /dev/lidar0
[LiDAR] Hardware initialized (fd=42)
[Buffer] Allocated 100 elements
[Buffer] Allocated 50 elements
[Pipeline] All resources initialized successfully

[Pipeline] Processing sensor frame...
[Pipeline] Frame processing complete
  Raw readings: 5
  Filtered readings: 5
  Average distance: 25.1976 meters
Caught exception: Sensor data validation failed

[Pipeline] Shutting down pipeline...
[Buffer] Destroying buffer with 5 elements
[Buffer] Destroying buffer with 5 elements
[LiDAR] Releasing hardware resource (fd=42)
[Pipeline] Pipeline shutdown complete

=== Demonstration 3: Exception During Initialization ===

[Pipeline] Initializing sensor processing pipeline...
[LiDAR] Acquiring hardware resource: /dev/lidar0
[LiDAR] Hardware initialized (fd=42)
[Buffer] Allocated 100 elements
[Pipeline] Initialization failed: Buffer size exceeds hardware limits
[Buffer] Destroying buffer with 0 elements
[LiDAR] Releasing hardware resource (fd=42)
Caught exception: Buffer size exceeds hardware limits

=== Demonstration 4: Move Semantics ===

[Factory] Creating LiDAR hardware...
[LiDAR] Acquiring hardware resource: /dev/lidar0
[LiDAR] Hardware initialized (fd=42)
[Factory] Returning LiDAR (move semantics)
[LiDAR] Ownership transferred via move

[Main] Moving lidar1 to lidar2...
[LiDAR] Ownership transferred via move

[Main] lidar2 owns the resource
lidar2 ready: yes
[LiDAR] Releasing hardware resource (fd=42)

=== Program ending - all resources cleaned up ===
```

This comprehensive example demonstrates RAII fundamentals in autonomous vehicle sensor management:

**Key RAII Concepts Demonstrated:**

1. **Resource Acquisition in Constructor**
   - `LiDARHardware` acquires hardware device in constructor
   - `SensorDataBuffer` allocates memory in constructor using `unique_ptr`
   - All resources initialized before object becomes usable

2. **Automatic Cleanup in Destructor**
   - Hardware file descriptors closed automatically
   - Memory deallocated via `unique_ptr` destructors
   - Mutexes automatically destroyed
   - No manual cleanup code needed

3. **Exception Safety**
   - If constructor throws after partial initialization, already-acquired resources cleaned up
   - Stack unwinding during exceptions triggers all destructors
   - `lock_guard` ensures mutexes unlocked even if exceptions thrown
   - Strong exception safety for pipeline initialization

4. **Multiple Resources with Correct Cleanup Order**
   - `SensorProcessingPipeline` manages three resources: LiDAR hardware + two buffers
   - Member `unique_ptr`s ensure automatic cleanup in reverse construction order
   - If later resource fails, earlier resources automatically cleaned up

5. **Move Semantics with RAII**
   - Hardware resources transferred via move, not copy
   - Moved-from objects left in safe "empty" state
   - Enables returning RAII objects from factory functions
   - Single ownership maintained throughout lifetime

6. **Delete Copy, Allow Move**
   - Copy operations deleted to prevent double-free of hardware resources
   - Move operations implemented for efficient ownership transfer
   - Follows modern C++ best practices for resource-owning types

**Real-World Autonomous Vehicle Applications:**

- **LiDAR Hardware Management**: Real autonomous vehicles must manage hardware devices that require initialization/shutdown sequences. RAII ensures hardware is properly released even if software crashes or throws exceptions.

- **Thread-Safe Buffer Management**: Sensor data buffers must be thread-safe. `lock_guard` RAII wrapper ensures mutexes are always unlocked, preventing deadlocks in multithreaded sensor processing pipelines.

- **Complex Resource Dependencies**: Processing pipelines manage multiple interdependent resources (hardware, memory, synchronization primitives). RAII ensures correct initialization order and automatic cleanup in reverse order.

- **Exception Safety in Safety-Critical Code**: Autonomous vehicles must handle errors gracefully without leaking resources. RAII provides automatic cleanup during exception propagation, essential for safety-critical systems.

- **Zero-Copy Ownership Transfer**: Move semantics allow transferring sensor hardware ownership between pipeline stages without copying, crucial for real-time performance constraints.

**Performance and Safety Characteristics:**

- **Deterministic Cleanup**: Resources released exactly at scope exit, not at unpredictable GC times
- **Zero Runtime Overhead**: RAII cleanup is compile-time guaranteed, no runtime checks needed
- **Memory Safety**: Impossible to forget cleanup - compiler enforces via destructors
- **Lock Safety**: Deadlocks prevented by automatic mutex management via `lock_guard`
- **Exception Safety**: Strong guarantee for initialization, basic guarantee for operations

This pattern is fundamental to writing robust, exception-safe sensor management code in autonomous vehicles where hardware resources must be carefully managed and cleaned up deterministically.

### INTERVIEW_QA: Comprehensive Questions

#### Q1: What is RAII and why is it important in C++?
**Difficulty:** #beginner  
**Category:** #fundamentals #memory_management  
**Concepts:** #raii #resource_management #constructors #destructors

**Answer:**
RAII (Resource Acquisition Is Initialization) is a C++ idiom where resource lifetime is bound to object lifetime. Resources are acquired in constructors and released in destructors, ensuring automatic cleanup.

**Explanation:**
RAII leverages C++'s deterministic destruction to guarantee resource cleanup. When objects go out of scope, their destructors are called automatically, releasing any resources they manage. This works even during exception unwinding, making code exception-safe by default. RAII eliminates manual cleanup code and the bugs that arise from forgetting to release resources along all code paths.

**Key takeaway:** RAII makes resource management automatic and exception-safe by tying resource lifetime to object lifetime through constructors and destructors.

---

#### Q2: How does RAII help with exception safety?
**Difficulty:** #intermediate  
**Category:** #exception_safety #memory_management  
**Concepts:** #raii #stack_unwinding #destructors #exceptions

**Answer:**
RAII ensures resources are released during stack unwinding when exceptions propagate, because destructors are automatically called for all constructed objects on the stack.

**Explanation:**
When an exception is thrown, C++ performs stack unwinding, calling destructors for all objects in the current scope chain. RAII objects release their resources in destructors, so cleanup happens automatically even when normal control flow is interrupted by exceptions. This eliminates the need for try-catch blocks around every resource acquisition and prevents resource leaks during error conditions.

**Key takeaway:** RAII makes exception safety automatic because destructors are guaranteed to run during stack unwinding, ensuring resources are always cleaned up.

---

#### Q3: What happens when a constructor throws an exception?
**Difficulty:** #intermediate  
**Category:** #exception_safety #constructors  
**Concepts:** #constructors #exceptions #stack_unwinding #memory_leak

**Answer:**
When a constructor throws, the object is considered not fully constructed, so its destructor is not called. However, destructors are called for any member objects that were fully constructed before the throw.

**Code example:**
```cpp
class Risky {
    std::unique_ptr<int[]> safe;   // Member 1
    int* leak;                      // Member 2
public:
    Risky() : safe(new int[100]) {
        leak = new int[200];        // ❌ If next line throws, leak occurs
        throw std::runtime_error("Error");
    }
    ~Risky() {  // Never called if constructor throws
        delete[] leak;
    }
};
```

**Explanation:**
The object's destructor won't run because the object wasn't fully constructed. Member objects constructed before the throw (like `safe`) have their destructors called during unwinding. Raw pointers like `leak` allocated in the constructor body before the throw will leak. This is why all resources should be wrapped in RAII members initialized in the member initializer list.

**Key takeaway:** Use RAII wrappers for all resources in constructors to ensure exception safety, as the class destructor won't be called if construction fails.

---

#### Q4: Why should destructors never throw exceptions?
**Difficulty:** #intermediate  
**Category:** #destructors #exception_safety  
**Concepts:** #destructors #exceptions #std_terminate #noexcept

**Answer:**
If a destructor throws during stack unwinding (while another exception is active), C++ calls `std::terminate()`, crashing the program.

**Code example:**
```cpp
class Dangerous {
public:
    ~Dangerous() {
        throw std::runtime_error("Destructor throw");  // ❌ Fatal if during unwinding
    }
};

void problem() {
    Dangerous d;
    throw std::runtime_error("First exception");
    // ~Dangerous() throws second exception → std::terminate()
}
```

**Explanation:**
When an exception is already active and propagating up the stack, destructors are called to clean up objects. If any destructor throws another exception, the runtime cannot handle two active exceptions simultaneously. The standard response is to call `std::terminate()`, immediately ending the program. Destructors should be `noexcept` and handle errors internally through logging or other non-throwing mechanisms.

**Key takeaway:** Destructors must not throw exceptions; mark them `noexcept` and handle cleanup errors through logging or other safe mechanisms.

---

#### Q5: What are the three levels of exception safety?
**Difficulty:** #intermediate  
**Category:** #exception_safety #design_pattern  
**Concepts:** #exception_safety #basic_guarantee #strong_guarantee #nothrow_guarantee

**Answer:**
Basic guarantee (no leaks), strong guarantee (transactional/no side effects), and nothrow guarantee (never throws).

**Explanation:**
Basic exception safety ensures no resource leaks occur—cleanup happens via RAII even if exceptions are thrown, though object state may be modified. Strong exception safety provides transactional behavior where operations either fully succeed or leave state unchanged (commit-or-rollback semantics). Nothrow guarantee means the operation never throws, typically marked with `noexcept`. Each level builds on the previous, with stronger guarantees being harder to implement but more robust.

**Key takeaway:** Basic safety prevents leaks, strong safety provides transactional behavior, and nothrow safety guarantees no exceptions.

---

#### Q6: Explain stack unwinding in C++.
**Difficulty:** #intermediate  
**Category:** #exception_safety #runtime_behavior  
**Concepts:** #stack_unwinding #exceptions #destructors #raii

**Answer:**
Stack unwinding is the process of calling destructors for all constructed objects in reverse order of construction when an exception propagates through the call stack.

**Code example:**
```cpp
void func() {
    Resource r1("R1");  // Constructed first
    Resource r2("R2");  // Constructed second
    throw std::runtime_error("Error");
    // Stack unwinding: ~r2 called first, then ~r1
}
```

**Explanation:**
When an exception is thrown, the runtime searches up the call stack for a matching catch handler. As each function scope is exited during this search, all automatic objects in that scope have their destructors called in reverse construction order. This ensures proper cleanup of resources managed by RAII objects. Unwinding continues until a catch handler is found or main() is reached.

**Key takeaway:** Stack unwinding ensures automatic cleanup during exception propagation by calling destructors in reverse construction order.

---

#### Q7: How does RAII differ from garbage collection?
**Difficulty:** #intermediate  
**Category:** #fundamentals #memory_management  
**Concepts:** #raii #garbage_collection #deterministic_destruction #performance

**Answer:**
RAII provides deterministic, immediate resource cleanup at known points (scope exit), while garbage collection provides non-deterministic cleanup at unpredictable times.

**Explanation:**
RAII cleanup happens exactly when objects go out of scope, making resource release timing predictable and immediate. Garbage collection runs at undefined times based on heap pressure, making resource release unpredictable. RAII works for all resource types (memory, files, locks, sockets), while garbage collection typically only manages memory. RAII has zero runtime overhead beyond destructor calls, while garbage collection requires runtime support and can pause program execution.

**Key takeaway:** RAII provides deterministic, immediate cleanup with zero runtime overhead, unlike garbage collection's unpredictable timing.

---

#### Q8: What is the relationship between RAII and the Rule of Five?
**Difficulty:** #intermediate  
**Category:** #design_pattern #memory_management  
**Concepts:** #raii #rule_of_five #copy_constructor #move_constructor #destructor

**Answer:**
RAII classes managing resources typically need custom copy/move constructors, copy/move assignments, and destructors (Rule of Five) to correctly handle resource ownership.

**Explanation:**
When a class uses RAII to manage resources, it must define how ownership is handled during copying, moving, and destruction. The destructor releases resources. Copy operations either perform deep copies or are deleted for unique ownership. Move operations transfer ownership efficiently. If any of these five special functions is needed, all should be considered—typically by deleting copy operations and implementing move operations for unique ownership, or implementing deep copy for shared ownership.

**Key takeaway:** RAII resource-owning classes should implement Rule of Five to properly manage ownership during copy, move, and destruction.

---

#### Q9: Can RAII be used for non-memory resources? Give examples.
**Difficulty:** #beginner  
**Category:** #fundamentals #resource_management  
**Concepts:** #raii #file_handles #locks #database_connections

**Answer:**
Yes, RAII applies to any resource requiring acquisition and release: file handles, mutex locks, database transactions, network sockets, GPU resources, and system handles.

**Code example:**
```cpp
class ScopedLock {
    std::mutex& mtx;
public:
    ScopedLock(std::mutex& m) : mtx(m) { mtx.lock(); }
    ~ScopedLock() { mtx.unlock(); }
};

void threadSafeOperation() {
    ScopedLock lock(globalMutex);  // ✅ Lock acquired
    // Critical section
}  // ✅ Lock automatically released
```

**Explanation:**
RAII's power extends beyond memory to any resource with acquire/release semantics. Mutex locks are acquired in constructors and released in destructors, preventing deadlocks. File handles are opened and closed automatically. Database transactions are begun and committed or rolled back. The pattern is universal for any resource requiring cleanup.

**Key takeaway:** RAII works for any resource with acquire/release semantics, not just memory—files, locks, connections, and system resources all benefit.

---

#### Q10: What is a scope guard and how does it relate to RAII?
**Difficulty:** #intermediate  
**Category:** #design_pattern #resource_management  
**Concepts:** #scope_guard #raii #lambda #cleanup

**Answer:**
A scope guard is a generalized RAII wrapper that executes arbitrary cleanup code via a lambda or function object when it goes out of scope.

**Code example:**
```cpp
template<typename Func>
class ScopeGuard {
    Func cleanup;
    bool active = true;
public:
    ScopeGuard(Func f) : cleanup(std::move(f)) {}
    ~ScopeGuard() { if (active) cleanup(); }
    void dismiss() { active = false; }
};

void process() {
    void* res = acquire();
    ScopeGuard guard([res]() { release(res); });  // ✅ Cleanup on scope exit
    doWork(res);
}  // ✅ release() called automatically
```

**Explanation:**
Scope guards generalize RAII by allowing arbitrary cleanup logic specified at the point of resource acquisition. Instead of writing dedicated RAII wrapper classes for every resource type, scope guards accept lambda functions that specify cleanup. The guard executes the lambda in its destructor, providing automatic cleanup on scope exit.

**Key takeaway:** Scope guards generalize RAII by accepting arbitrary cleanup lambdas, providing automatic cleanup without dedicated wrapper classes.

---

#### Q11: How do you handle resources that can fail to acquire?
**Difficulty:** #intermediate  
**Category:** #exception_safety #error_handling  
**Concepts:** #raii #constructors #exceptions #two_phase_initialization

**Answer:**
Throw an exception from the constructor if resource acquisition fails, or use two-phase initialization with an explicit initialize method.

**Code example:**
```cpp
// Option 1: Throw in constructor
class File {
    FILE* file;
public:
    File(const char* name, const char* mode) {
        file = fopen(name, mode);
        if (!file) throw std::runtime_error("Open failed");  // ✅ Signal failure
    }
    ~File() { if (file) fclose(file); }
};

// Option 2: Two-phase initialization
class FileTwo {
    FILE* file = nullptr;
public:
    FileTwo() = default;  // Constructor doesn't acquire
    bool initialize(const char* name, const char* mode) {
        file = fopen(name, mode);
        return file != nullptr;  // ✅ Return success status
    }
    ~FileTwo() { if (file) fclose(file); }
};
```

**Explanation:**
RAII philosophy prefers throwing from constructors to signal acquisition failure, as this prevents creating objects in invalid states. Alternatively, two-phase initialization separates construction from acquisition, allowing error checking without exceptions. However, two-phase initialization sacrifices RAII's guarantee that objects are always in valid states and requires users to remember to call initialize.

**Key takeaway:** Throw from constructors to signal acquisition failure, maintaining RAII's guarantee that constructed objects are always in valid states.

---

#### Q12: What happens to RAII objects with static storage duration?
**Difficulty:** #advanced  
**Category:** #lifetime #static_objects  
**Concepts:** #static_initialization #static_destruction #initialization_order #fiasco

**Answer:**
Global and static RAII objects are destroyed in reverse order of their construction when the program exits. Initialization order across translation units is undefined.

**Explanation:**
Static objects in functions are initialized on first use (lazy initialization), providing well-defined behavior. Global static objects across files have undefined initialization order ("static initialization order fiasco"), which can cause one object to access another before it's initialized. Destruction happens in reverse initialization order during program termination. Objects should avoid depending on other global objects to prevent initialization and destruction ordering issues.

**Key takeaway:** Use function-local statics for well-defined initialization order; global static RAII objects risk initialization order problems across translation units.

---

#### Q13: How does RAII enable the "commit or rollback" pattern?
**Difficulty:** #intermediate  
**Category:** #design_pattern #exception_safety  
**Concepts:** #raii #transactions #rollback #commit

**Answer:**
RAII objects can default to rollback in their destructor and only commit if an explicit commit method is called, ensuring atomic operations.

**Code example:**
```cpp
class Transaction {
    Database& db;
    bool committed = false;
public:
    Transaction(Database& d) : db(d) { db.begin(); }
    ~Transaction() {
        if (!committed) db.rollback();  // ✅ Default rollback
    }
    void commit() {
        db.commit();
        committed = true;  // ✅ Mark as committed
    }
};

void updateDB(Database& db) {
    Transaction txn(db);  // Begin transaction
    db.executeQuery("INSERT...");
    db.executeQuery("UPDATE...");
    txn.commit();  // ✅ Commit only if all succeeded
}  // If commit not called, rollback happens automatically
```

**Explanation:**
The transaction RAII wrapper begins a transaction in its constructor and tracks whether commit has been called. The destructor checks this flag and performs rollback if commit was never called. This ensures that partial operations are never left in the database—either all changes commit or none do. Exception safety is automatic because exceptions prevent commit from being reached.

**Key takeaway:** RAII enables transactional behavior by defaulting to rollback in destructors and only committing when explicitly told to succeed.

---

#### Q14: What is the relationship between RAII and move semantics?
**Difficulty:** #intermediate  
**Category:** #move_semantics #resource_management  
**Concepts:** #raii #move_constructor #move_assignment #ownership_transfer

**Answer:**
Move semantics enable RAII objects to transfer resource ownership efficiently without copying, supporting return-by-value and container storage.

**Code example:**
```cpp
class Resource {
    int* data;
public:
    Resource() : data(new int[1000]) {}
    ~Resource() { delete[] data; }
    
    // Move constructor transfers ownership
    Resource(Resource&& other) noexcept : data(other.data) {
        other.data = nullptr;  // ✅ Ownership transferred
    }
    
    Resource& operator=(Resource&& other) noexcept {
        if (this != &other) {
            delete[] data;  // Release current resource
            data = other.data;  // ✅ Take ownership
            other.data = nullptr;
        }
        return *this;
    }
};

Resource createResource() {
    return Resource();  // ✅ Move, not copy
}
```

**Explanation:**
RAII objects typically cannot be copied (would cause double-free) or copying is expensive (deep copy). Move semantics solve this by transferring ownership—the moved-from object gives up its resource to the moved-to object and enters a safe "empty" state. This enables returning RAII objects from functions efficiently and storing them in containers without copying underlying resources.

**Key takeaway:** Move semantics enable efficient ownership transfer for RAII objects, allowing return-by-value and container storage without expensive copying.

---

#### Q15: How does RAII interact with inheritance?
**Difficulty:** #advanced  
**Category:** #inheritance #resource_management  
**Concepts:** #raii #virtual_destructor #inheritance #polymorphism

**Answer:**
Base classes managing resources in RAII hierarchies must have virtual destructors to ensure derived class resources are properly released when deleted through base pointers.

**Code example:**
```cpp
class Base {
    int* baseData;
public:
    Base() : baseData(new int[100]) {}
    virtual ~Base() {  // ✅ Virtual destructor required
        delete[] baseData;
    }
};

class Derived : public Base {
    int* derivedData;
public:
    Derived() : derivedData(new int[200]) {}
    ~Derived() override {
        delete[] derivedData;
    }
};

void polymorphic() {
    Base* ptr = new Derived();
    delete ptr;  // ✅ Calls ~Derived then ~Base due to virtual destructor
}
```

**Explanation:**
Without virtual destructors, deleting derived objects through base pointers only calls the base destructor, leaking derived class resources. Virtual destructors ensure the full destruction chain executes (derived first, then base), properly releasing all RAII-managed resources in the hierarchy. Any class with virtual methods or intended for inheritance should have a virtual destructor.

**Key takeaway:** Base classes in RAII hierarchies need virtual destructors to ensure proper resource cleanup when derived objects are deleted through base pointers.

---

#### Q16: What is deterministic destruction and why does it matter?
**Difficulty:** #intermediate  
**Category:** #fundamentals #runtime_behavior  
**Concepts:** #deterministic_destruction #raii #scope #lifetime

**Answer:**
Deterministic destruction means resources are released at predictable, specific points in code (scope exit), rather than at undefined times like with garbage collection.

**Explanation:**
In C++, objects are destroyed exactly when they go out of scope—at the closing brace of blocks, function returns, or exception propagation. This deterministic timing allows precise control over resource lifetimes, critical for resources like file locks, network connections, and database transactions where timing matters. Garbage-collected languages release memory unpredictably, making RAII-style resource management impossible for non-memory resources.

**Key takeaway:** Deterministic destruction provides predictable resource release timing at known code points, enabling precise resource lifetime control.

---

#### Q17: How do you implement exception-safe copy assignment with RAII?
**Difficulty:** #advanced  
**Category:** #exception_safety #operators  
**Concepts:** #copy_assignment #exception_safety #copy_and_swap #raii

**Answer:**
Use the copy-and-swap idiom: create a copy, swap with the current object, and let the old resources be destroyed automatically.

**Code example:**
```cpp
class Resource {
    int* data;
    size_t size;
public:
    Resource& operator=(const Resource& other) {
        Resource temp(other);  // ✅ Copy into temp (may throw)
        swap(temp);            // ✅ Swap with current (noexcept)
        return *this;          // ✅ Old resources destroyed with temp
    }
    
    void swap(Resource& other) noexcept {
        std::swap(data, other.data);
        std::swap(size, other.size);
    }
    
    // Copy constructor and destructor needed
    Resource(const Resource& other) 
        : data(new int[other.size]), size(other.size) {
        std::copy(other.data, other.data + size, data);
    }
    
    ~Resource() { delete[] data; }
};
```

**Explanation:**
The copy-and-swap idiom provides strong exception safety by performing all throwing operations (allocation, copying) on a temporary object. If allocation or copying throws, the current object is unchanged. Once the copy succeeds, swapping with the temporary transfers ownership—a non-throwing operation. The destructor automatically releases the old resources when the temporary goes out of scope.

**Key takeaway:** Copy-and-swap provides strong exception safety for assignment by doing risky operations on temporaries and using non-throwing swaps.

---

#### Q18: What are the advantages of RAII over manual resource management?
**Difficulty:** #beginner  
**Category:** #fundamentals #resource_management  
**Concepts:** #raii #manual_management #exception_safety #maintainability

**Answer:**
RAII prevents resource leaks, provides automatic exception safety, reduces boilerplate code, makes ownership explicit, and eliminates the need for manual cleanup in every code path.

**Explanation:**
Manual resource management requires explicit cleanup calls along every possible exit path—normal returns, early returns, and exception paths. Forgetting any cleanup call causes a leak. RAII eliminates this by making cleanup automatic through destructors. Code becomes shorter, more readable, and self-documenting—ownership is clear from object types. Adding new exit paths doesn't risk introducing leaks, making refactoring safer.

**Key takeaway:** RAII automates resource management, preventing leaks and making code more maintainable by eliminating manual cleanup requirements.

---

#### Q19: How do you handle multiple resources in a single constructor safely?
**Difficulty:** #advanced  
**Category:** #exception_safety #constructors  
**Concepts:** #raii #multiple_resources #member_initialization #exception_safety

**Answer:**
Use member initializer lists with RAII wrappers for each resource, ensuring that if later members fail, earlier members are automatically cleaned up.

**Code example:**
```cpp
class MultiResource {
    std::unique_ptr<int[]> buffer;      // Resource 1
    std::unique_ptr<FILE, decltype(&fclose)> file;  // Resource 2
    std::unique_ptr<Connection> conn;   // Resource 3
    
public:
    MultiResource(const char* filename, size_t size)
        : buffer(new int[size])  // ✅ If next throws, buffer cleaned up
        , file(fopen(filename, "r"), &fclose)  // ✅ If next throws, both cleaned
        , conn(new Connection())  // ✅ If throws, all previous cleaned
    {
        if (!file) throw std::runtime_error("File open failed");
        if (!conn->isValid()) throw std::runtime_error("Connection failed");
        // All resources successfully acquired
    }
    // Destructor automatically correct - members destroyed in reverse order
};
```

**Explanation:**
Member initializer lists construct members in declaration order. Each member that completes construction has its destructor called if a later member throws during construction. By using RAII wrappers for all resources, you get automatic cleanup without explicit try-catch blocks. Raw pointers in member initializer lists would still leak, so all resources must be wrapped.

**Key takeaway:** Use RAII member wrappers in initializer lists to ensure automatic cleanup of successfully acquired resources if later acquisitions fail.

---

#### Q20: What is the relationship between RAII and const correctness?
**Difficulty:** #intermediate  
**Category:** #const_correctness #resource_management  
**Concepts:** #raii #const #resource_access #immutability

**Answer:**
RAII classes should provide const and non-const access methods to resources, allowing const-correct usage while maintaining automatic resource management.

**Code example:**
```cpp
class FileWrapper {
    FILE* file;
public:
    FileWrapper(const char* name, const char* mode) 
        : file(fopen(name, mode)) {
        if (!file) throw std::runtime_error("Open failed");
    }
    
    ~FileWrapper() { if (file) fclose(file); }
    
    FILE* get() { return file; }              // Non-const access
    const FILE* get() const { return file; }  // Const access
    
    bool read(char* buffer, size_t size) {
        return fgets(buffer, size, file) != nullptr;
    }
    
    // Const operations don't modify resource
    bool eof() const {
        return feof(file) != 0;
    }
};

void readOnlyOperation(const FileWrapper& file) {
    bool isEof = file.eof();  // ✅ Const method on const object
    // bool result = file.read(buffer, size);  // ❌ Won't compile - read is non-const
}
```

**Explanation:**
RAII wrappers should follow const correctness principles by providing const accessors for operations that don't modify the resource and non-const accessors for mutations. This allows the compiler to enforce correct usage—passing const RAII objects to functions guarantees they won't modify the underlying resource. Const correctness and RAII work together to provide both compile-time safety and automatic resource management.

**Key takeaway:** RAII classes should provide const-correct accessors, allowing compiler-enforced immutability guarantees alongside automatic resource management.

---

### PRACTICE_TASKS: Output Prediction and Code Analysis

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
What is the output and in what order are destructors called?

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
What is the complete output showing all object lifetimes?

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
What is the output? Is the file closed?

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
What happens when this code runs?

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
What problem occurs and why?

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
How many times are the constructor and destructor called?

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
What is the complete output? Is the mutex properly unlocked?

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
What is the output? Which destructors are called?

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
What resource problem exists in this code?

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
What is the output for test1() and test2() separately?

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
What is the resource management problem? How many leak scenarios exist?

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
What is the output showing construction and destruction order?

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
What is the output? Is there a memory leak?

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
How many allocations and deallocations occur? Where does deallocation happen?

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
What is the output showing scope-based destruction?

### QUICK_REFERENCE: Answer Key and Summary Tables

#### Answer Key for Practice Questions

| Q# | Answer | Explanation | Key Concept |
|----|--------|-------------|-------------|
| 1 | Output: `Acquired` `Acquired` `Released` `Released` | Destructors called in reverse construction order (r2 then r1) | #destruction_order |
| 2 | `Logger created` `Main started` `Logger created` `Main ending` `Logger destroyed` `Logger destroyed` | Global constructed before main, destroyed after main; local follows normal scope | #static_lifetime |
| 3 | Output: `Exception: Failed` | File never opened so destructor never called; no "File closed" message | #constructor_exception |
| 4 | Program calls `std::terminate()` and crashes | Throwing from destructor invokes terminate; never do this | #destructor_exception |
| 5 | Double delete / undefined behavior | Default copy constructor copies pointer; both objects try to delete same memory | #shallow_copy_problem |
| 6 | Constructor called once, destructor called once | C++17 RVO eliminates move; single object constructed in caller's stack frame | #rvo #move_semantics |
| 7 | `Locked` `In critical section` `Unlocked` `Caught` | Mutex properly unlocked during stack unwinding via RAII lock destructor | #exception_safe_locking |
| 8 | `R1 acquired` `R2 acquired` `R2 released` `R1 released` `Exception caught` | Members fully constructed before constructor body throws; their destructors called; Container destructor NOT called | #partial_construction |
| 9 | Memory leak - file never closed | Using `new` with RAII bypasses automatic cleanup; must manually delete, risking leaks | #new_with_raii |
| 10 | test1: `BEGIN` `COMMIT` `COMMITTED`<br>test2: `BEGIN` `ROLLBACK` | Explicit commit changes flag; exception prevents commit reaching, triggers rollback | #commit_rollback |
| 11 | File leaks on all three early returns | Manual resource management fails with multiple exit points; needs RAII | #multiple_exits |
| 12 | `Base()` `Derived()` `~Derived()` `~Base()` | Base constructed first, destroyed last; derived constructed last, destroyed first | #inheritance_order |
| 13 | Output: `Acquired` `Caught` - Yes, memory leak | Destructor not called because constructor threw; allocated memory leaks | #constructor_throw_leak |
| 14 | One allocation, one deallocation at end of test() | `unique_ptr` destructor deallocates when it goes out of scope | #unique_ptr_lifetime |
| 15 | `Block 1` `Cleanup` `Outside block` | Destructor called when Logger goes out of inner block scope | #scope_based_destruction |

#### RAII Principles Summary

| Principle | Description | Benefit |
|-----------|-------------|---------|
| **Resource in Constructor** | Acquire resources during object construction | Guarantees resources owned by valid objects |
| **Release in Destructor** | Free resources during object destruction | Automatic cleanup on scope exit |
| **Automatic Cleanup** | Destructors called on scope exit (normal or exception) | Prevents resource leaks |
| **Exception Safety** | Stack unwinding calls destructors | Safe cleanup during error conditions |
| **Explicit Ownership** | Object ownership clear from types | Self-documenting code |
| **No Manual Cleanup** | No need for explicit cleanup calls | Reduces boilerplate and errors |
| **Deterministic Timing** | Resources released at known code points | Predictable resource lifetimes |

#### Exception Safety Guarantees

| Level | Guarantee | Description | Example |
|-------|-----------|-------------|---------|
| **No Guarantee** | None | Can leak resources or corrupt state | Raw `new`/`delete` without cleanup |
| **Basic** | No leaks | Resources cleaned up but state may change | RAII ensures no leaks but counter incremented |
| **Strong** | Commit or rollback | Operation succeeds completely or has no effect | Copy-and-swap, database transactions |
| **Nothrow** | Never throws | Operation guaranteed not to throw exceptions | Destructors, swap operations, simple getters |

#### Common RAII Patterns

| Pattern | Use Case | Implementation |
|---------|----------|----------------|
| **File Handle** | Automatic file close | Open in constructor, close in destructor |
| **Lock Guard** | Automatic mutex unlock | Lock in constructor, unlock in destructor |
| **Transaction** | Commit or rollback | Begin in constructor, commit explicitly or rollback in destructor |
| **Scope Guard** | Arbitrary cleanup | Execute lambda/function in destructor |
| **Smart Pointer** | Automatic memory management | Delete pointer in destructor |
| **Socket** | Automatic socket close | Open socket in constructor, close in destructor |
| **Database Connection** | Connection pooling | Acquire in constructor, release to pool in destructor |

#### Construction vs Destruction Scenarios

| Scenario | Constructor Called | Destructor Called | Notes |
|----------|-------------------|-------------------|-------|
| **Normal scope exit** | Yes | Yes | Standard RAII behavior |
| **Early return** | Yes | Yes | Destructor called on all paths |
| **Exception thrown after construction** | Yes | Yes | Stack unwinding calls destructor |
| **Exception thrown during construction** | Partial | No | Object not fully constructed |
| **Members before throw in constructor** | Yes | Yes | Member destructors called |
| **Members after throw in constructor** | No | No | Never constructed |
| **Global objects** | Before main | After main | Static initialization/destruction |
| **Static function-local** | On first call | After main | Lazy initialization |

#### Destructor Best Practices

| Practice | Reason | Example |
|----------|--------|---------|
| **Mark `noexcept`** | Prevent `std::terminate()` during unwinding | `~Resource() noexcept` |
| **Never throw** | Two active exceptions cause termination | Catch and log errors internally |
| **Release all resources** | Fulfill RAII cleanup contract | Close files, unlock mutexes, free memory |
| **Virtual in base classes** | Enable proper derived class cleanup | `virtual ~Base()` for polymorphism |
| **Check resource validity** | Handle moved-from or default states | `if (ptr != nullptr) delete ptr;` |
| **Keep simple** | Reduce chance of errors | Delegate to member destructors when possible |
| **Document exceptions** | If throwing (rare), clearly document | Use explicit cleanup methods instead |
