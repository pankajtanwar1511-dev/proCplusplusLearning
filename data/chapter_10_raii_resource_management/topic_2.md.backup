## TOPIC: Custom RAII Wrappers & Advanced Patterns

### THEORY_SECTION: Building Custom Resource Managers

#### 1. Custom RAII Wrappers and the Rule of Five - Ownership Semantics and Special Members

Custom RAII wrappers encapsulate resource management for resources not covered by standard library types: database connections, network sockets, GPU handles, third-party library objects, and system resources.

**When to Create Custom RAII Wrappers:**

| Resource Type | Standard Option | Need Custom Wrapper? | Reason |
|---------------|----------------|---------------------|--------|
| **Dynamic memory** | `unique_ptr`, `shared_ptr` | ❌ NO | Standard smart pointers sufficient |
| **Files (C++)** | `std::fstream` | ❌ NO | Standard stream classes available |
| **Files (C API)** | None | ✅ YES | Need to wrap `FILE*` with RAII |
| **Mutex locks** | `std::lock_guard`, `std::unique_lock` | ❌ NO | Standard guards available |
| **Database connections** | None | ✅ YES | Library-specific resource |
| **Network sockets** | None | ✅ YES | OS-specific resource |
| **GPU buffers** | None | ✅ YES | CUDA/OpenCL-specific |
| **Third-party resources** | None | ✅ YES | External library handles |
| **Custom allocators** | None | ✅ YES | Domain-specific memory |

**Ownership Semantics Decision Tree:**

The first question when designing a RAII wrapper: **What ownership semantics does this resource require?**

| Ownership Model | Copy Allowed? | Move Allowed? | Example Resources | Implementation |
|-----------------|---------------|---------------|-------------------|----------------|
| **Unique Ownership** | ❌ NO | ✅ YES | File handles, sockets, mutexes | Delete copy, implement move |
| **Shared Ownership** | ✅ YES (deep) | ✅ YES | Reference-counted connections | Implement copy + move or use `shared_ptr` |
| **Non-Transferable** | ❌ NO | ❌ NO | Scoped locks, RAII timers | Delete copy and move |
| **View/Reference** | ✅ YES (shallow) | ✅ YES | Non-owning wrappers | Trivially copyable |

**The Rule of Five for RAII Classes:**

If you define **any one** of these five special members, you should explicitly consider **all five**:

| Special Member | Purpose | RAII Consideration |
|----------------|---------|-------------------|
| **Destructor** | `~T()` | ✅ **Always needed** to release resource |
| **Copy Constructor** | `T(const T&)` | Delete for unique, implement for shared |
| **Copy Assignment** | `T& operator=(const T&)` | Delete for unique, implement for shared |
| **Move Constructor** | `T(T&&)` | Implement for transferable resources |
| **Move Assignment** | `T& operator=(T&&)` | Implement for transferable resources |

**Unique Ownership Pattern (Most Common):**

```cpp
class FileHandle {
    FILE* file;

public:
    // Constructor: Acquire resource
    explicit FileHandle(const char* filename, const char* mode) {
        file = fopen(filename, mode);
        if (!file) throw std::runtime_error("Failed to open file");
    }

    // Destructor: Release resource
    ~FileHandle() noexcept {
        if (file) {
            fclose(file);
        }
    }

    // Delete copy operations (unique ownership)
    FileHandle(const FileHandle&) = delete;
    FileHandle& operator=(const FileHandle&) = delete;

    // Implement move operations (transfer ownership)
    FileHandle(FileHandle&& other) noexcept : file(other.file) {
        other.file = nullptr;  // ✅ Leave other in safe state
    }

    FileHandle& operator=(FileHandle&& other) noexcept {
        if (this != &other) {  // ✅ Check for self-assignment
            if (file) fclose(file);  // Release current resource
            file = other.file;        // Transfer ownership
            other.file = nullptr;     // Nullify source
        }
        return *this;
    }

    // Accessor
    FILE* get() const { return file; }
};
```

**Rule of Five Implementation Checklist:**

| Step | Action | Code Pattern |
|------|--------|--------------|
| **1. Destructor** | Always mark `noexcept`, release resource | `~T() noexcept { cleanup(); }` |
| **2. Decide ownership** | Unique, shared, or non-transferable? | See decision tree above |
| **3. Copy constructor** | Delete for unique, implement for shared | `T(const T&) = delete;` or deep copy |
| **4. Copy assignment** | Delete for unique, implement for shared | `T& operator=(const T&) = delete;` |
| **5. Move constructor** | Implement for transferable resources | Transfer + nullify source |
| **6. Move assignment** | Check self-assignment, then transfer | `if (this != &other) { ... }` |

**Common Implementation Patterns:**

**Pattern 1: Unique Ownership (Move-Only)**

```cpp
class UniqueResource {
    Resource* handle;
public:
    explicit UniqueResource(/* params */) : handle(acquire()) {}
    ~UniqueResource() noexcept { if (handle) release(handle); }

    // Delete copy
    UniqueResource(const UniqueResource&) = delete;
    UniqueResource& operator=(const UniqueResource&) = delete;

    // Implement move
    UniqueResource(UniqueResource&& other) noexcept : handle(other.handle) {
        other.handle = nullptr;
    }

    UniqueResource& operator=(UniqueResource&& other) noexcept {
        if (this != &other) {
            if (handle) release(handle);
            handle = other.handle;
            other.handle = nullptr;
        }
        return *this;
    }
};
```

**Pattern 2: Shared Ownership (Reference Counting)**

```cpp
class SharedResource {
    struct ControlBlock {
        Resource* handle;
        size_t refcount;
    };
    ControlBlock* ctrl;

public:
    explicit SharedResource(/* params */)
        : ctrl(new ControlBlock{acquire(), 1}) {}

    ~SharedResource() noexcept {
        if (ctrl && --ctrl->refcount == 0) {
            release(ctrl->handle);
            delete ctrl;
        }
    }

    // Implement copy (increment refcount)
    SharedResource(const SharedResource& other) : ctrl(other.ctrl) {
        if (ctrl) ++ctrl->refcount;
    }

    SharedResource& operator=(const SharedResource& other) {
        if (this != &other) {
            if (ctrl && --ctrl->refcount == 0) {
                release(ctrl->handle);
                delete ctrl;
            }
            ctrl = other.ctrl;
            if (ctrl) ++ctrl->refcount;
        }
        return *this;
    }

    // Implement move
    SharedResource(SharedResource&& other) noexcept : ctrl(other.ctrl) {
        other.ctrl = nullptr;
    }

    SharedResource& operator=(SharedResource&& other) noexcept {
        if (this != &other) {
            if (ctrl && --ctrl->refcount == 0) {
                release(ctrl->handle);
                delete ctrl;
            }
            ctrl = other.ctrl;
            other.ctrl = nullptr;
        }
        return *this;
    }
};
```

**Pattern 3: Non-Transferable (Delete All)**

```cpp
class ScopedLock {
    std::mutex& mtx;
public:
    explicit ScopedLock(std::mutex& m) : mtx(m) { mtx.lock(); }
    ~ScopedLock() noexcept { mtx.unlock(); }

    // Delete copy and move (lock must stay in scope)
    ScopedLock(const ScopedLock&) = delete;
    ScopedLock& operator=(const ScopedLock&) = delete;
    ScopedLock(ScopedLock&&) = delete;
    ScopedLock& operator=(ScopedLock&&) = delete;
};
```

**Self-Assignment Protection:**

| Operation | Need Self-Check? | Consequence if Missing |
|-----------|-----------------|------------------------|
| **Copy assignment** | ✅ YES | May delete resource before copying |
| **Move assignment** | ✅ YES | May nullify resource before using |
| **Copy constructor** | ❌ NO | Cannot copy from self |
| **Move constructor** | ❌ NO | Cannot move from self |

```cpp
// ✅ Correct move assignment with self-check
UniqueResource& operator=(UniqueResource&& other) noexcept {
    if (this != &other) {  // ✅ Essential check
        if (handle) release(handle);
        handle = other.handle;
        other.handle = nullptr;
    }
    return *this;
}

// ❌ Without self-check
UniqueResource& operator=(UniqueResource&& other) noexcept {
    if (handle) release(handle);  // ❌ Deletes resource
    handle = other.handle;         // ❌ If other is *this, handle is dangling
    other.handle = nullptr;        // ❌ Sets our handle to nullptr
    return *this;
}
```

---

#### 2. Advanced RAII Patterns - Scope Guards, Conditional Ownership, and Custom Deleters

Beyond basic wrappers, advanced patterns handle complex resource management scenarios.

**Pattern 1: Scope Guard - Arbitrary Cleanup Logic**

Scope guards execute arbitrary cleanup code on scope exit, generalizing RAII for one-off resource management.

```cpp
template<typename Func>
class ScopeGuard {
    Func cleanup;
    bool dismissed = false;

public:
    explicit ScopeGuard(Func f) : cleanup(std::move(f)) {}

    ~ScopeGuard() noexcept {
        if (!dismissed) {
            try {
                cleanup();  // Execute cleanup
            } catch (...) {
                // Swallow exceptions (destructor must not throw)
            }
        }
    }

    void dismiss() { dismissed = true; }  // Cancel cleanup

    // Non-transferable
    ScopeGuard(const ScopeGuard&) = delete;
    ScopeGuard& operator=(const ScopeGuard&) = delete;
};

// Usage
void processWithCleanup() {
    void* resource = acquireResource();
    ScopeGuard guard([resource]() {
        releaseResource(resource);  // ✅ Always called
    });

    riskyOperation();  // May throw

    // Resource automatically released
}
```

**Scope Guard Use Cases:**

| Scenario | Traditional Approach | Scope Guard Approach |
|----------|---------------------|---------------------|
| **Temporary file cleanup** | try-catch with manual delete | `ScopeGuard([&]() { remove(tmpfile); });` |
| **Restore state** | Save, process, restore in finally | `ScopeGuard([old]() { state = old; });` |
| **Decrement counter** | Manual decrement on all paths | `ScopeGuard([&]() { --counter; });` |
| **Log exit** | Log at every return | `ScopeGuard([]() { log("exit"); });` |
| **Multiple cleanups** | Nested try-catch | Multiple guards in order |

**Pattern 2: Conditional Ownership - Sometimes Owns, Sometimes References**

```cpp
class FileWrapper {
    FILE* file;
    bool owns;  // ✅ Track ownership

public:
    // Constructor: Take ownership
    explicit FileWrapper(const char* filename, const char* mode)
        : file(fopen(filename, mode)), owns(true) {
        if (!file) throw std::runtime_error("Open failed");
    }

    // Constructor: Non-owning reference
    explicit FileWrapper(FILE* existingFile)
        : file(existingFile), owns(false) {
        if (!file) throw std::invalid_argument("Null file");
    }

    ~FileWrapper() noexcept {
        if (owns && file) {  // ✅ Only close if we own it
            fclose(file);
        }
    }

    // Move transfers ownership status
    FileWrapper(FileWrapper&& other) noexcept
        : file(other.file), owns(other.owns) {
        other.file = nullptr;
        other.owns = false;
    }

    FileWrapper& operator=(FileWrapper&& other) noexcept {
        if (this != &other) {
            if (owns && file) fclose(file);
            file = other.file;
            owns = other.owns;
            other.file = nullptr;
            other.owns = false;
        }
        return *this;
    }

    // Delete copy
    FileWrapper(const FileWrapper&) = delete;
    FileWrapper& operator=(const FileWrapper&) = delete;
};
```

**Pattern 3: Custom Deleters with unique_ptr**

For resources with non-standard cleanup, use `unique_ptr` with custom deleters:

```cpp
// Custom deleter for FILE*
struct FileDeleter {
    void operator()(FILE* f) const {
        if (f) fclose(f);
    }
};

using FilePtr = std::unique_ptr<FILE, FileDeleter>;

// Usage
FilePtr openFile(const char* filename) {
    FILE* f = fopen(filename, "r");
    if (!f) throw std::runtime_error("Open failed");
    return FilePtr(f);  // ✅ Custom deleter handles cleanup
}

void process() {
    auto file = openFile("data.txt");
    // Use file.get()
}  // ✅ fclose called automatically via FileDeleter
```

**Custom Deleter Patterns:**

| Resource | Acquisition | Release | Deleter Implementation |
|----------|-------------|---------|----------------------|
| **FILE*** | `fopen()` | `fclose()` | `void operator()(FILE* f) { fclose(f); }` |
| **Socket** | `socket()` | `close()` | `void operator()(int s) { if (s >= 0) close(s); }` |
| **SDL Surface** | `SDL_CreateSurface()` | `SDL_FreeSurface()` | `void operator()(SDL_Surface* s) { SDL_FreeSurface(s); }` |
| **OpenGL texture** | `glGenTextures()` | `glDeleteTextures()` | `void operator()(GLuint t) { glDeleteTextures(1, &t); }` |
| **Database handle** | `db_connect()` | `db_disconnect()` | `void operator()(DB* db) { db_disconnect(db); }` |

**Pattern 4: Two-Phase Initialization - Construction Separate from Acquisition**

For resources where acquisition may fail without throwing:

```cpp
class DatabaseConnection {
    DB_Handle* handle = nullptr;
    bool connected = false;

public:
    // Phase 1: Construction (doesn't acquire)
    DatabaseConnection() = default;

    // Phase 2: Explicit initialization (can fail)
    bool connect(const char* host, int port) {
        handle = db_connect(host, port);
        connected = (handle != nullptr);
        return connected;
    }

    ~DatabaseConnection() noexcept {
        if (connected && handle) {
            db_disconnect(handle);
        }
    }

    // Check before use
    bool isConnected() const { return connected; }

    DB_Handle* get() const {
        if (!connected) throw std::logic_error("Not connected");
        return handle;
    }

    // Delete copy, allow move
    DatabaseConnection(const DatabaseConnection&) = delete;
    DatabaseConnection& operator=(const DatabaseConnection&) = delete;

    DatabaseConnection(DatabaseConnection&& other) noexcept
        : handle(other.handle), connected(other.connected) {
        other.handle = nullptr;
        other.connected = false;
    }
};
```

**Two-Phase vs Single-Phase Comparison:**

| Aspect | Single-Phase (Constructor Acquires) | Two-Phase (Explicit Initialize) |
|--------|-----------------------------------|--------------------------------|
| **Failure signaling** | Exception only | Return bool or error code |
| **Invalid state possible** | ❌ NO | ✅ YES (before initialize) |
| **RAII guarantee** | ✅ Strong | ⚠️ Weak (need to check) |
| **Use case** | Acquisition always succeeds | Acquisition may fail |
| **Error handling** | try-catch | Check return value |

---

#### 3. RAII Design Patterns - Transactional Management and Composite Resources

**Pattern 1: Transaction Pattern - Commit or Rollback**

Manage operations that should either fully succeed or fully rollback:

```cpp
class Transaction {
    Database& db;
    bool committed = false;

public:
    explicit Transaction(Database& database) : db(database) {
        db.begin();  // Start transaction
    }

    ~Transaction() noexcept {
        if (!committed) {
            try {
                db.rollback();  // ✅ Auto-rollback if not committed
            } catch (...) {
                // Log error, but don't throw from destructor
            }
        }
    }

    void commit() {
        db.commit();
        committed = true;  // ✅ Mark as committed
    }

    // Non-transferable
    Transaction(const Transaction&) = delete;
    Transaction& operator=(const Transaction&) = delete;
    Transaction(Transaction&&) = delete;
    Transaction& operator=(Transaction&&) = delete;
};

// Usage
void updateDatabase(Database& db) {
    Transaction txn(db);  // ✅ BEGIN TRANSACTION

    db.execute("INSERT INTO ...");
    db.execute("UPDATE ...");

    if (validationFails()) {
        return;  // ✅ Auto-rollback
    }

    txn.commit();  // ✅ COMMIT
}  // If commit not called, rollback happens
```

**Pattern 2: Multi-Resource Transactional RAII**

Manage multiple resources atomically - all acquired or all rolled back:

```cpp
class MultiResourceManager {
    std::unique_ptr<ResourceA> resA;
    std::unique_ptr<ResourceB> resB;
    std::unique_ptr<ResourceC> resC;

public:
    MultiResourceManager(/* params */) {
        try {
            resA = std::make_unique<ResourceA>(/* ... */);
            // ✅ If next throws, resA cleaned up

            resB = std::make_unique<ResourceB>(/* ... */);
            // ✅ If next throws, resA and resB cleaned up

            resC = std::make_unique<ResourceC>(/* ... */);
            // ✅ All resources acquired

        } catch (...) {
            // ✅ unique_ptr destructors handle cleanup
            throw;  // Re-throw after cleanup
        }
    }

    // Destructor automatically correct - members destroyed in reverse order
    ~MultiResourceManager() = default;
};
```

**Pattern 3: Nested RAII Scopes - Resource Hierarchies**

```cpp
class ConnectionPool {
    std::vector<DatabaseConnection> connections;

public:
    class ScopedConnection {
        DatabaseConnection& conn;
        ConnectionPool& pool;

    public:
        ScopedConnection(ConnectionPool& p)
            : conn(p.acquire()), pool(p) {}

        ~ScopedConnection() {
            pool.release(conn);  // ✅ Return to pool
        }

        DatabaseConnection& get() { return conn; }

        // Non-transferable
        ScopedConnection(const ScopedConnection&) = delete;
        ScopedConnection& operator=(const ScopedConnection&) = delete;
    };

    ScopedConnection getConnection() {
        return ScopedConnection(*this);
    }

private:
    DatabaseConnection& acquire();
    void release(DatabaseConnection& conn);
};

// Usage
void processRequest(ConnectionPool& pool) {
    auto conn = pool.getConnection();  // ✅ Acquire from pool
    conn.get().execute("SELECT ...");
}  // ✅ Auto-return to pool
```

**Pattern 4: Lazy Initialization RAII**

Defer resource acquisition until first use:

```cpp
class LazyResource {
    mutable std::unique_ptr<ExpensiveResource> resource;
    mutable std::mutex mtx;

public:
    LazyResource() = default;  // ✅ No acquisition yet

    ExpensiveResource& get() const {
        std::lock_guard<std::mutex> lock(mtx);
        if (!resource) {  // ✅ Initialize on first access
            resource = std::make_unique<ExpensiveResource>();
        }
        return *resource;
    }

    // Destructor automatically releases if initialized
    ~LazyResource() = default;
};
```

**RAII Pattern Selection Matrix:**

| Need | Use This Pattern | Key Benefit |
|------|-----------------|-------------|
| **Single resource, unique ownership** | Basic RAII wrapper | Automatic cleanup |
| **Shared ownership** | `shared_ptr` or custom refcount | Multiple owners |
| **Arbitrary cleanup** | Scope guard | No custom class needed |
| **Sometimes owns, sometimes references** | Conditional ownership flag | Flexible usage |
| **Non-standard cleanup** | `unique_ptr` with custom deleter | Reuse `unique_ptr` logic |
| **Commit or rollback** | Transaction pattern | All-or-nothing semantics |
| **Multiple related resources** | Transactional multi-resource | Atomic acquisition |
| **Resource pooling** | Nested scopes | Automatic return to pool |
| **Expensive initialization** | Lazy initialization | Defer cost until needed |

**Best Practices Summary:**

| Practice | Rationale |
|----------|-----------|
| **Always follow Rule of Five** | Prevent double-free and leaks |
| **Check self-assignment in move** | Avoid invalidating own resources |
| **Mark destructors `noexcept`** | Prevent `std::terminate()` |
| **Use `= delete` for clarity** | Explicit intent vs implicit deletion |
| **Track ownership state** | Know when to release resources |
| **Prefer composition over complexity** | Use `unique_ptr` members when possible |
| **Document ownership semantics** | Make transfer rules clear |
| **Test move and copy operations** | Verify special members work correctly |

---

### EDGE_CASES: Advanced Scenarios and Pitfalls

#### Edge Case 1: Move-Only RAII and Self-Move-Assignment

Move-only RAII classes that delete copy operations must carefully handle self-move-assignment. While self-assignment checks are obvious for copy assignment (`if (this == &other)`), self-move-assignment seems unlikely but can occur through reference chains, template instantiation, or container operations. Failing to check for self-move can leave objects in invalid states where resources are released but pointers aren't nullified.

```cpp
class MoveOnlyResource {
    int* data;
public:
    MoveOnlyResource() : data(new int[100]) {}
    ~MoveOnlyResource() { delete[] data; }
    
    // ❌ No self-move check
    MoveOnlyResource(MoveOnlyResource&& other) noexcept : data(other.data) {
        other.data = nullptr;
    }
    
    // ❌ Self-move causes issues
    MoveOnlyResource& operator=(MoveOnlyResource&& other) noexcept {
        delete[] data;           // Releases current resource
        data = other.data;       // If other is *this, data is dangling
        other.data = nullptr;    // Sets our data to nullptr
        return *this;
    }
};

void problematic() {
    MoveOnlyResource r;
    r = std::move(r);  // Self-move: data deleted, then set to nullptr
    // r.data is now nullptr, unexpected state
}
```

Proper implementation checks for self-assignment before releasing resources:

```cpp
class MoveOnlyResourceSafe {
    int* data;
public:
    MoveOnlyResource& operator=(MoveOnlyResource&& other) noexcept {
        if (this != &other) {  // ✅ Self-move check
            delete[] data;
            data = other.data;
            other.data = nullptr;
        }
        return *this;
    }
};
```

Alternative approaches use swap-based move assignment, which naturally handles self-move correctly:

```cpp
MoveOnlyResource& operator=(MoveOnlyResource&& other) noexcept {
    MoveOnlyResource temp(std::move(other));  // Move into temp
    swap(temp);                                // Swap with temp
    return *this;  // temp destroyed with old resources
}
```

#### Edge Case 2: RAII with Conditional Ownership

RAII wrappers sometimes need to conditionally own resources—owning resources they acquire but only referencing resources provided externally. This requires tracking ownership state and only releasing owned resources in destructors. The challenge is maintaining clear semantics: users must understand when wrappers take ownership and when they don't.

```cpp
class FileWrapper {
    FILE* file;
    bool owns;  // Track ownership
    
public:
    // Constructor that acquires - takes ownership
    explicit FileWrapper(const char* filename, const char* mode)
        : file(fopen(filename, mode)), owns(true) {
        if (!file) throw std::runtime_error("Open failed");
    }
    
    // Constructor that references - does not take ownership
    explicit FileWrapper(FILE* existingFile)
        : file(existingFile), owns(false) {
        if (!file) throw std::invalid_argument("Null file handle");
    }
    
    ~FileWrapper() {
        if (owns && file) {  // ✅ Only close if we own it
            fclose(file);
        }
    }
    
    // Move transfers ownership status
    FileWrapper(FileWrapper&& other) noexcept
        : file(other.file), owns(other.owns) {
        other.file = nullptr;
        other.owns = false;
    }
    
    FileWrapper& operator=(FileWrapper&& other) noexcept {
        if (this != &other) {
            if (owns && file) fclose(file);  // Release if owned
            file = other.file;
            owns = other.owns;
            other.file = nullptr;
            other.owns = false;
        }
        return *this;
    }
    
    // Disable copy - unclear ownership semantics
    FileWrapper(const FileWrapper&) = delete;
    FileWrapper& operator=(const FileWrapper&) = delete;
};

void usage() {
    FileWrapper owned("file.txt", "r");   // ✅ Wrapper owns, will close
    FileWrapper ref(stdin);                // ✅ Wrapper doesn't own, won't close
}
```

Alternative design uses factory methods with explicit ownership semantics:

```cpp
class FileWrapper {
    FILE* file;
    bool owns;
    
    FileWrapper(FILE* f, bool ownership) : file(f), owns(ownership) {}
    
public:
    static FileWrapper takeOwnership(FILE* f) {
        return FileWrapper(f, true);
    }
    
    static FileWrapper borrowReference(FILE* f) {
        return FileWrapper(f, false);
    }
};
```

#### Edge Case 3: RAII in Initialization Lists with Dependencies

When RAII members depend on other members for initialization, initialization order becomes critical. Members are initialized in declaration order, not initializer list order. If a later member's initialization depends on an earlier member being fully constructed, declaration order must be carefully arranged.

```cpp
class DatabaseConnection {
    std::string connectionString;
    std::unique_ptr<Socket> socket;
    std::unique_ptr<Session> session;
    
public:
    // ❌ Dangerous - depends on initialization order
    DatabaseConnection(const std::string& host, int port)
        : connectionString(host + ":" + std::to_string(port))
        , socket(new Socket(host, port))  // Uses host/port directly
        , session(new Session(*socket))   // Depends on socket being initialized
    {
        // If session initialization throws, socket is cleaned up automatically
    }
};
```

The risk: if `session` initialization fails after `socket` succeeds, automatic cleanup during unwinding is correct. However, if the order in the initializer list doesn't match declaration order, confusion arises:

```cpp
class Dangerous {
    std::unique_ptr<B> b;
    std::unique_ptr<A> a;  // Declared after b
    
public:
    Dangerous()
        : a(new A())      // Listed first, but initialized SECOND
        , b(new B(*a))    // Listed second, but initialized FIRST - uses uninitialized a!
    {}
};
```

Best practice: arrange member declarations to match logical dependency order, and order initializer lists to match declarations:

```cpp
class Safe {
    std::unique_ptr<A> a;  // ✅ Declare first
    std::unique_ptr<B> b;  // ✅ Declare second (depends on a)
    
public:
    Safe()
        : a(new A())       // ✅ Initialized first
        , b(new B(*a))     // ✅ Initialized second, a is valid
    {}
};
```

#### Edge Case 4: RAII and Thread-Local Storage

Thread-local RAII objects have per-thread lifetimes, complicating resource management in multithreaded programs. Each thread gets its own instance of thread_local objects, constructed on first access within that thread and destroyed when the thread exits. This creates challenges for shared resources and cleanup ordering.

```cpp
class ThreadLocalLogger {
    std::ofstream logFile;
    
public:
    ThreadLocalLogger() {
        // Each thread opens its own log file
        std::ostringstream filename;
        filename << "thread_" << std::this_thread::get_id() << ".log";
        logFile.open(filename.str());
    }
    
    ~ThreadLocalLogger() {
        logFile.close();  // Closed when thread exits
    }
    
    void log(const std::string& msg) {
        logFile << msg << std::endl;
    }
};

thread_local ThreadLocalLogger logger;  // One per thread

void threadFunction() {
    logger.log("Thread started");  // Logger constructed on first use
    // Do work
    logger.log("Thread ending");
}  // Logger destroyed when thread exits

int main() {
    std::thread t1(threadFunction);
    std::thread t2(threadFunction);  // Each thread has separate logger
    t1.join();  // t1's logger destroyed
    t2.join();  // t2's logger destroyed
    return 0;
}
```

Problems arise when thread-local RAII objects depend on global resources that might be destroyed before threads exit:

```cpp
class GlobalResourceManager {
public:
    ~GlobalResourceManager() {
        std::cout << "Global cleanup\n";
    }
};

GlobalResourceManager globalMgr;

class ThreadLocalResource {
public:
    ~ThreadLocalResource() {
        // ❌ Might use globalMgr after it's destroyed
        // if thread exits after main() returns
    }
};

thread_local ThreadLocalResource tlsResource;
```

#### Edge Case 5: RAII with Lazy Initialization

Lazy initialization defers resource allocation until first use, but requires careful state tracking and thread safety considerations. The wrapper must check initialization state on every access, handle initialization failure, and prevent multiple initialization attempts.

```cpp
class LazyFile {
    std::string filename;
    std::string mode;
    FILE* file = nullptr;  // Not yet initialized
    mutable std::mutex initMutex;
    
    void ensureInitialized() const {
        std::lock_guard<std::mutex> lock(initMutex);
        if (!file) {
            file = fopen(filename.c_str(), mode.c_str());
            if (!file) {
                throw std::runtime_error("Lazy initialization failed");
            }
        }
    }
    
public:
    LazyFile(const char* name, const char* m)
        : filename(name), mode(m) {
        // ✅ Constructor doesn't open file
    }
    
    ~LazyFile() {
        if (file) {  // ✅ Only close if initialized
            fclose(file);
        }
    }
    
    void write(const char* data) {
        ensureInitialized();  // ✅ Initialize on first use
        fputs(data, file);
    }
    
    // Non-const read requires mutable file for lazy init
    void read(char* buffer, size_t size) {
        ensureInitialized();
        fgets(buffer, size, file);
    }
};
```

The tradeoff: lazy initialization adds overhead to every access (checking initialization state) and complexity (thread synchronization, error handling). Use when initialization is expensive and the resource might never be used.

#### Edge Case 6: RAII and Alignment Requirements

Custom RAII wrappers allocating memory for types with strict alignment requirements must use aligned allocation. Standard `new` and `malloc` provide default alignment, insufficient for SIMD types, hardware interfaces, or over-aligned types.

```cpp
// Type requiring 32-byte alignment for SIMD operations
struct alignas(32) SIMDVector {
    float data[8];
};

class SIMDBuffer {
    SIMDVector* buffer;
    size_t count;
    
public:
    SIMDBuffer(size_t n) : count(n) {
        // ❌ Wrong: new[] only guarantees alignof(SIMDVector) alignment
        // but alignas(32) may be stricter
        buffer = new SIMDVector[n];
        
        // ✅ Correct: Use aligned allocation
        buffer = static_cast<SIMDVector*>(
            ::operator new[](n * sizeof(SIMDVector), std::align_val_t{32})
        );
    }
    
    ~SIMDBuffer() {
        // ✅ Must use matching deallocation
        ::operator delete[](buffer, std::align_val_t{32});
    }
    
    // Rule of Five members needed...
};
```

C++17 `aligned_alloc` and C++11 `std::aligned_storage` provide alternatives, but proper RAII requires matching deallocation with allocation method.

### CODE_EXAMPLES: Practical Implementations

#### Example 1: Complete Move-Only File Handle

```cpp
#include <cstdio>
#include <string>
#include <stdexcept>
#include <utility>

class FileHandle {
    FILE* file_;
    std::string filename_;
    
public:
    // Constructor acquires resource
    FileHandle(const char* filename, const char* mode)
        : file_(fopen(filename, mode))
        , filename_(filename) {
        if (!file_) {
            throw std::runtime_error("Failed to open: " + filename_);
        }
    }
    
    // Destructor releases resource
    ~FileHandle() noexcept {
        if (file_) {
            fclose(file_);
        }
    }
    
    // Delete copy operations - files can't be copied
    FileHandle(const FileHandle&) = delete;
    FileHandle& operator=(const FileHandle&) = delete;
    
    // Move constructor transfers ownership
    FileHandle(FileHandle&& other) noexcept
        : file_(other.file_)
        , filename_(std::move(other.filename_)) {
        other.file_ = nullptr;  // ✅ Other no longer owns file
    }
    
    // Move assignment transfers ownership
    FileHandle& operator=(FileHandle&& other) noexcept {
        if (this != &other) {  // ✅ Self-move check
            if (file_) fclose(file_);  // Release current resource
            file_ = other.file_;
            filename_ = std::move(other.filename_);
            other.file_ = nullptr;  // ✅ Other no longer owns
        }
        return *this;
    }
    
    // Accessors
    FILE* get() const noexcept { return file_; }
    const std::string& filename() const noexcept { return filename_; }
    explicit operator bool() const noexcept { return file_ != nullptr; }
    
    // Operations
    bool write(const char* data, size_t size) {
        if (!file_) return false;
        return fwrite(data, 1, size, file_) == size;
    }
    
    bool read(char* buffer, size_t size) {
        if (!file_) return false;
        return fread(buffer, 1, size, file_) == size;
    }
};

// Factory function demonstrating move semantics
FileHandle openLogFile(const char* name) {
    FileHandle file(name, "a");  // Constructed locally
    return file;  // ✅ Moved to caller (or RVO elides move)
}

void example() {
    FileHandle log = openLogFile("app.log");  // ✅ Ownership transferred
    log.write("Application started\n", 21);
    
    FileHandle moved = std::move(log);  // ✅ Explicit ownership transfer
    // log is now empty, moved owns the file
}
```

This complete implementation demonstrates all aspects of move-only RAII: resource acquisition in constructor, release in destructor, deleted copy operations for exclusive ownership, proper move semantics with self-move check, and factory function returning by value.

#### Example 2: Scoped Lock with Try-Lock Support

```cpp
#include <mutex>
#include <chrono>

class ScopedLock {
    std::mutex& mutex_;
    bool locked_;
    
public:
    // Regular lock - blocks until acquired
    explicit ScopedLock(std::mutex& m)
        : mutex_(m), locked_(true) {
        mutex_.lock();
    }
    
    // Try-lock - non-blocking attempt
    enum class TryLock { attempt };
    ScopedLock(std::mutex& m, TryLock)
        : mutex_(m), locked_(m.try_lock()) {
    }
    
    // Timed lock - waits up to timeout
    template<typename Duration>
    ScopedLock(std::mutex& m, Duration timeout)
        : mutex_(m), locked_(false) {
        auto deadline = std::chrono::steady_clock::now() + timeout;
        // Spin-try until deadline
        while (std::chrono::steady_clock::now() < deadline) {
            if (m.try_lock()) {
                locked_ = true;
                break;
            }
            std::this_thread::yield();
        }
    }
    
    ~ScopedLock() {
        if (locked_) {
            mutex_.unlock();
        }
    }
    
    // Non-movable, non-copyable - lock tied to scope
    ScopedLock(const ScopedLock&) = delete;
    ScopedLock& operator=(const ScopedLock&) = delete;
    ScopedLock(ScopedLock&&) = delete;
    ScopedLock& operator=(ScopedLock&&) = delete;
    
    // Query if lock was acquired
    bool owns_lock() const noexcept { return locked_; }
    explicit operator bool() const noexcept { return locked_; }
    
    // Manual unlock (if needed before destructor)
    void unlock() {
        if (locked_) {
            mutex_.unlock();
            locked_ = false;
        }
    }
};

std::mutex dataMutex;

void criticalSection() {
    ScopedLock lock(dataMutex);  // ✅ Blocks until acquired
    // Critical section
}  // ✅ Automatically unlocked

bool tryProcessData() {
    ScopedLock lock(dataMutex, ScopedLock::TryLock::attempt);
    if (!lock) {
        return false;  // ❌ Couldn't acquire lock
    }
    // ✅ Lock acquired, process data
    return true;
}  // ✅ Unlocked if acquired

void timedOperation() {
    using namespace std::chrono_literals;
    ScopedLock lock(dataMutex, 100ms);  // Wait up to 100ms
    if (lock) {
        // ✅ Lock acquired within timeout
    }
}  // ✅ Unlocked if acquired
```

This scoped lock implementation shows RAII with multiple acquisition strategies (blocking, try-lock, timed), state tracking (whether lock was acquired), and non-transferable semantics appropriate for synchronization primitives.

#### Example 3: Generic Scope Guard

```cpp
#include <functional>
#include <utility>

template<typename Func>
class ScopeGuard {
    Func cleanup_;
    bool active_;
    
public:
    explicit ScopeGuard(Func&& f)
        : cleanup_(std::forward<Func>(f))
        , active_(true) {
    }
    
    ~ScopeGuard() noexcept {
        if (active_) {
            try {
                cleanup_();
            } catch (...) {
                // ✅ Swallow exceptions in destructor
                // Could log here in real implementation
            }
        }
    }
    
    // Move constructor - transfer ownership
    ScopeGuard(ScopeGuard&& other) noexcept
        : cleanup_(std::move(other.cleanup_))
        , active_(other.active_) {
        other.active_ = false;  // Deactivate moved-from guard
    }
    
    // No copy - cleanup must run exactly once
    ScopeGuard(const ScopeGuard&) = delete;
    ScopeGuard& operator=(const ScopeGuard&) = delete;
    ScopeGuard& operator=(ScopeGuard&&) = delete;
    
    // Dismiss - cancel the cleanup
    void dismiss() noexcept {
        active_ = false;
    }
};

// Deduction guide for C++17
template<typename Func>
ScopeGuard(Func) -> ScopeGuard<Func>;

// Helper function for creating scope guards
template<typename Func>
ScopeGuard<Func> makeScopeGuard(Func&& f) {
    return ScopeGuard<Func>(std::forward<Func>(f));
}

void exampleUsage() {
    void* resource1 = allocateResource1();
    auto guard1 = makeScopeGuard([resource1]() {
        releaseResource1(resource1);  // ✅ Always called
    });
    
    void* resource2 = allocateResource2();
    auto guard2 = makeScopeGuard([resource2]() {
        releaseResource2(resource2);  // ✅ Always called
    });
    
    performOperations();  // If throws, both guards clean up
    
    guard1.dismiss();  // Cancel guard1 if operation succeeded
    // guard2 still active - will clean up
}  // Cleanup in reverse order: guard2, then guard1 (if not dismissed)
```

Scope guards provide generalized RAII for arbitrary cleanup code. The template design accepts any callable, lambda functions integrate cleanup logic inline, and the dismiss mechanism allows conditional cleanup based on operation success.

#### Example 4: Reference-Counted Resource Pool Connection

```cpp
#include <memory>
#include <mutex>
#include <vector>
#include <stdexcept>

template<typename T>
class ResourcePool {
    std::vector<std::shared_ptr<T>> resources_;
    std::mutex mutex_;
    
public:
    void addResource(std::unique_ptr<T> resource) {
        std::lock_guard<std::mutex> lock(mutex_);
        resources_.push_back(std::move(resource));
    }
    
    std::shared_ptr<T> acquire() {
        std::lock_guard<std::mutex> lock(mutex_);
        if (resources_.empty()) {
            throw std::runtime_error("No resources available");
        }
        auto resource = resources_.back();
        resources_.pop_back();
        return resource;
    }
    
    void release(std::shared_ptr<T> resource) {
        std::lock_guard<std::mutex> lock(mutex_);
        resources_.push_back(std::move(resource));
    }
};

template<typename T>
class PooledResource {
    std::shared_ptr<T> resource_;
    ResourcePool<T>* pool_;
    
public:
    PooledResource(std::shared_ptr<T> res, ResourcePool<T>* p)
        : resource_(std::move(res))
        , pool_(p) {
    }
    
    ~PooledResource() {
        if (resource_ && pool_) {
            pool_->release(std::move(resource_));  // ✅ Return to pool
        }
    }
    
    // Move-only to ensure single ownership
    PooledResource(const PooledResource&) = delete;
    PooledResource& operator=(const PooledResource&) = delete;
    
    PooledResource(PooledResource&& other) noexcept
        : resource_(std::move(other.resource_))
        , pool_(other.pool_) {
        other.pool_ = nullptr;
    }
    
    PooledResource& operator=(PooledResource&& other) noexcept {
        if (this != &other) {
            if (resource_ && pool_) {
                pool_->release(std::move(resource_));
            }
            resource_ = std::move(other.resource_);
            pool_ = other.pool_;
            other.pool_ = nullptr;
        }
        return *this;
    }
    
    T* get() const { return resource_.get(); }
    T& operator*() const { return *resource_; }
    T* operator->() const { return resource_.get(); }
};

// Usage example
class DatabaseConnection {
public:
    void executeQuery(const std::string& query) {
        // Execute query
    }
};

ResourcePool<DatabaseConnection> connectionPool;

void performDatabaseOperation() {
    auto conn = connectionPool.acquire();
    PooledResource<DatabaseConnection> scoped(conn, &connectionPool);
    
    scoped->executeQuery("SELECT * FROM users");
    // ✅ Connection automatically returned to pool on scope exit
}
```

This pooled resource implementation demonstrates RAII with shared ownership, automatic resource return to pool, and move semantics for ownership transfer. The pool manages lifetime while the scoped wrapper provides RAII cleanup guarantees.

#### Example 5: Two-Phase Initialization with Optional

```cpp
#include <optional>
#include <string>
#include <stdexcept>

class DatabaseConnection {
    std::string connectionString_;
    void* handle_ = nullptr;  // Opaque database handle
    
    // Private constructor - use create() instead
    explicit DatabaseConnection(const std::string& connStr)
        : connectionString_(connStr) {
    }
    
public:
    // Factory method with two-phase initialization
    static std::optional<DatabaseConnection> create(
        const std::string& host,
        int port,
        const std::string& database
    ) {
        DatabaseConnection conn(
            host + ":" + std::to_string(port) + "/" + database
        );
        
        // Attempt initialization
        conn.handle_ = attemptConnect(conn.connectionString_.c_str());
        
        if (!conn.handle_) {
            return std::nullopt;  // ❌ Initialization failed, return empty
        }
        
        return conn;  // ✅ Return fully initialized connection
    }
    
    ~DatabaseConnection() {
        if (handle_) {
            disconnect(handle_);
        }
    }
    
    // Move-only
    DatabaseConnection(const DatabaseConnection&) = delete;
    DatabaseConnection& operator=(const DatabaseConnection&) = delete;
    
    DatabaseConnection(DatabaseConnection&& other) noexcept
        : connectionString_(std::move(other.connectionString_))
        , handle_(other.handle_) {
        other.handle_ = nullptr;
    }
    
    DatabaseConnection& operator=(DatabaseConnection&& other) noexcept {
        if (this != &other) {
            if (handle_) disconnect(handle_);
            connectionString_ = std::move(other.connectionString_);
            handle_ = other.handle_;
            other.handle_ = nullptr;
        }
        return *this;
    }
    
    void executeQuery(const std::string& query) {
        if (!handle_) {
            throw std::runtime_error("Connection not initialized");
        }
        // Execute query using handle_
    }
    
private:
    static void* attemptConnect(const char* connStr) {
        // Real connection logic
        return nullptr;  // Placeholder
    }
    
    static void disconnect(void* handle) {
        // Real disconnection logic
    }
};

void usage() {
    auto maybeConn = DatabaseConnection::create("localhost", 5432, "mydb");
    
    if (!maybeConn) {
        // ❌ Connection failed
        return;
    }
    
    // ✅ Connection succeeded, use it
    maybeConn->executeQuery("SELECT * FROM users");
}  // ✅ Automatically disconnected
```

Two-phase initialization with `std::optional` provides exception-free resource acquisition while maintaining RAII guarantees. The factory method attempts initialization and returns empty optional on failure, avoiding exceptions while ensuring constructed objects are always valid.

#### Example 6: RAII Transaction with Savepoints

```cpp
#include <string>
#include <vector>
#include <memory>

class Database {
public:
    void executeSQL(const std::string& sql) {
        // Execute SQL command
    }
};

class Transaction {
    Database& db_;
    bool committed_ = false;
    std::vector<std::string> savepoints_;
    
public:
    explicit Transaction(Database& db) : db_(db) {
        db_.executeSQL("BEGIN TRANSACTION");
    }
    
    ~Transaction() noexcept {
        if (!committed_) {
            try {
                db_.executeSQL("ROLLBACK");  // ✅ Auto-rollback
            } catch (...) {
                // Log error but don't throw from destructor
            }
        }
    }
    
    void commit() {
        db_.executeSQL("COMMIT");
        committed_ = true;
    }
    
    // Savepoint support for nested transactions
    void savepoint(const std::string& name) {
        db_.executeSQL("SAVEPOINT " + name);
        savepoints_.push_back(name);
    }
    
    void rollbackTo(const std::string& name) {
        db_.executeSQL("ROLLBACK TO SAVEPOINT " + name);
        // Remove this savepoint and all after it
        auto it = std::find(savepoints_.begin(), savepoints_.end(), name);
        if (it != savepoints_.end()) {
            savepoints_.erase(it, savepoints_.end());
        }
    }
    
    // Non-movable, non-copyable - tied to scope
    Transaction(const Transaction&) = delete;
    Transaction& operator=(const Transaction&) = delete;
    Transaction(Transaction&&) = delete;
    Transaction& operator=(Transaction&&) = delete;
};

void complexDatabaseOperation(Database& db) {
    Transaction txn(db);  // ✅ BEGIN TRANSACTION
    
    db.executeSQL("INSERT INTO users VALUES (...)");
    
    txn.savepoint("before_update");  // Nested savepoint
    db.executeSQL("UPDATE accounts SET balance = balance - 100");
    
    if (/* validation fails */) {
        txn.rollbackTo("before_update");  // ✅ Partial rollback
    }
    
    db.executeSQL("INSERT INTO audit_log VALUES (...)");
    
    txn.commit();  // ✅ COMMIT - makes all changes permanent
}  // If commit not called, ROLLBACK happens automatically
```

This transaction implementation demonstrates RAII with commit-or-rollback semantics, savepoint support for nested operations, and automatic cleanup that prevents partial database changes from persisting.

#### Example 7: Multi-Resource RAII with Dependency Management

```cpp
#include <memory>
#include <string>
#include <stdexcept>

// Forward declarations
class NetworkConnection;
class AuthenticationSession;
class SecureChannel;

class NetworkConnection {
    int socket_ = -1;
public:
    NetworkConnection(const std::string& host, int port) {
        socket_ = connectSocket(host, port);
        if (socket_ < 0) {
            throw std::runtime_error("Connection failed");
        }
    }
    
    ~NetworkConnection() {
        if (socket_ >= 0) {
            closeSocket(socket_);
        }
    }
    
    int socket() const { return socket_; }
    
private:
    static int connectSocket(const std::string& host, int port) {
        // Real socket connection
        return -1;  // Placeholder
    }
    
    static void closeSocket(int sock) {
        // Real socket closure
    }
};

class AuthenticationSession {
    void* sessionHandle_ = nullptr;
public:
    AuthenticationSession(const NetworkConnection& conn,
                         const std::string& username,
                         const std::string& password) {
        sessionHandle_ = authenticate(conn.socket(), username, password);
        if (!sessionHandle_) {
            throw std::runtime_error("Authentication failed");
        }
    }
    
    ~AuthenticationSession() {
        if (sessionHandle_) {
            closeSession(sessionHandle_);
        }
    }
    
    void* handle() const { return sessionHandle_; }
    
private:
    static void* authenticate(int sock, const std::string& user,
                             const std::string& pass) {
        return nullptr;  // Placeholder
    }
    
    static void closeSession(void* handle) {
        // Real session closure
    }
};

class SecureChannel {
    void* tlsContext_ = nullptr;
public:
    SecureChannel(const NetworkConnection& conn,
                  const AuthenticationSession& session) {
        tlsContext_ = establishTLS(conn.socket(), session.handle());
        if (!tlsContext_) {
            throw std::runtime_error("TLS handshake failed");
        }
    }
    
    ~SecureChannel() {
        if (tlsContext_) {
            shutdownTLS(tlsContext_);
        }
    }
    
    void send(const std::string& data) {
        if (!tlsContext_) {
            throw std::runtime_error("Channel not established");
        }
        // Send encrypted data
    }
    
private:
    static void* establishTLS(int sock, void* session) {
        return nullptr;  // Placeholder
    }
    
    static void shutdownTLS(void* ctx) {
        // Real TLS shutdown
    }
};

// Composite RAII wrapper managing all three resources
class SecureConnection {
    std::unique_ptr<NetworkConnection> connection_;
    std::unique_ptr<AuthenticationSession> session_;
    std::unique_ptr<SecureChannel> channel_;
    
public:
    SecureConnection(const std::string& host,
                    int port,
                    const std::string& username,
                    const std::string& password) {
        // Resources acquired in dependency order
        connection_ = std::make_unique<NetworkConnection>(host, port);
        // ✅ If session throws, connection_ automatically cleaned up
        
        session_ = std::make_unique<AuthenticationSession>(
            *connection_, username, password
        );
        // ✅ If channel throws, both connection_ and session_ cleaned up
        
        channel_ = std::make_unique<SecureChannel>(*connection_, *session_);
        // ✅ All resources successfully acquired
    }
    
    // Destructor automatically correct - members destroyed in reverse order
    ~SecureConnection() = default;
    
    void sendData(const std::string& data) {
        channel_->send(data);
    }
    
    // Move-only
    SecureConnection(const SecureConnection&) = delete;
    SecureConnection& operator=(const SecureConnection&) = delete;
    SecureConnection(SecureConnection&&) = default;
    SecureConnection& operator=(SecureConnection&&) = default;
};

void usage() {
    try {
        SecureConnection conn("server.com", 443, "user", "pass");
        // ✅ All resources (connection, auth, TLS) successfully established
        
        conn.sendData("Hello, secure world!");
        
    } catch (const std::exception& e) {
        // ❌ If any resource fails, all previous resources automatically cleaned
    }
}  // ✅ All resources released in correct order: channel, session, connection
```

This multi-resource example shows how RAII naturally handles dependency chains. Each resource depends on previous resources being successfully acquired. Using unique_ptr members ensures automatic cleanup in reverse construction order, providing strong exception safety without explicit try-catch blocks.

#### Example 8: Thread-Safe Lazy-Initialized Resource

```cpp
#include <mutex>
#include <memory>
#include <atomic>

template<typename T>
class LazyResource {
    mutable std::unique_ptr<T> resource_;
    mutable std::mutex initMutex_;
    mutable std::atomic<bool> initialized_{false};
    
    // Initialization parameters stored for lazy creation
    std::function<std::unique_ptr<T>()> factory_;
    
    void ensureInitialized() const {
        // Double-checked locking for performance
        if (!initialized_.load(std::memory_order_acquire)) {
            std::lock_guard<std::mutex> lock(initMutex_);
            if (!initialized_.load(std::memory_order_relaxed)) {
                resource_ = factory_();
                if (!resource_) {
                    throw std::runtime_error("Lazy initialization failed");
                }
                initialized_.store(true, std::memory_order_release);
            }
        }
    }
    
public:
    template<typename Factory>
    explicit LazyResource(Factory&& f)
        : factory_(std::forward<Factory>(f)) {
    }
    
    ~LazyResource() {
        // resource_ automatically destroyed by unique_ptr
    }
    
    T& get() const {
        ensureInitialized();
        return *resource_;
    }
    
    T* operator->() const {
        ensureInitialized();
        return resource_.get();
    }
    
    bool isInitialized() const noexcept {
        return initialized_.load(std::memory_order_acquire);
    }
    
    // Move-only
    LazyResource(const LazyResource&) = delete;
    LazyResource& operator=(const LazyResource&) = delete;
    LazyResource(LazyResource&&) = default;
    LazyResource& operator=(LazyResource&&) = default;
};

// Usage
class ExpensiveResource {
public:
    ExpensiveResource() {
        // Expensive initialization
    }
    
    void doWork() {
        // Work
    }
};

LazyResource<ExpensiveResource> resource([]() {
    return std::make_unique<ExpensiveResource>();  // Factory
});

void someFunction() {
    // Resource not initialized yet
    if (/* need resource */) {
        resource->doWork();  // ✅ Initialized on first access
    }
}  // ✅ Resource destroyed if initialized
```

Lazy initialization with thread safety demonstrates RAII with deferred resource acquisition. Double-checked locking optimizes performance by avoiding mutex acquisition after initialization. The resource is still automatically destroyed via RAII when the wrapper goes out of scope.

#### Example 9: Autonomous Vehicle - Custom Sensor Calibration RAII Wrappers

```cpp
#include <iostream>
#include <string>
#include <memory>
#include <mutex>
#include <vector>
#include <optional>
#include <functional>
#include <map>
#include <chrono>
using namespace std;

// Part 1: Move-Only Calibration Session Resource
class CalibrationSession {
private:
    int session_id;
    string sensor_type;
    void* calibration_handle;  // Opaque hardware resource
    bool is_active;

public:
    CalibrationSession(int id, const string& type)
        : session_id(id)
        , sensor_type(type)
        , calibration_handle(nullptr)
        , is_active(false) {

        cout << "[Session " << session_id << "] Starting calibration for "
             << sensor_type << endl;

        // Simulate hardware resource acquisition
        calibration_handle = reinterpret_cast<void*>(static_cast<intptr_t>(session_id * 100));

        if (!calibration_handle) {
            throw runtime_error("Failed to acquire calibration hardware");
        }

        is_active = true;
        cout << "[Session " << session_id << "] Calibration hardware acquired" << endl;
    }

    ~CalibrationSession() noexcept {
        if (is_active && calibration_handle) {
            cout << "[Session " << session_id << "] Releasing calibration hardware for "
                 << sensor_type << endl;
            // In reality: would release hardware resources
            calibration_handle = nullptr;
            is_active = false;
        }
    }

    // ✅ Delete copy operations - calibration sessions are unique
    CalibrationSession(const CalibrationSession&) = delete;
    CalibrationSession& operator=(const CalibrationSession&) = delete;

    // ✅ Implement move semantics for ownership transfer
    CalibrationSession(CalibrationSession&& other) noexcept
        : session_id(other.session_id)
        , sensor_type(move(other.sensor_type))
        , calibration_handle(other.calibration_handle)
        , is_active(other.is_active) {

        other.calibration_handle = nullptr;
        other.is_active = false;
        cout << "[Session " << session_id << "] Ownership transferred via move constructor" << endl;
    }

    CalibrationSession& operator=(CalibrationSession&& other) noexcept {
        if (this != &other) {  // ✅ Self-move check
            // Release current resources
            if (is_active && calibration_handle) {
                cout << "[Session " << session_id << "] Releasing old session during move assignment" << endl;
            }

            // Transfer ownership
            session_id = other.session_id;
            sensor_type = move(other.sensor_type);
            calibration_handle = other.calibration_handle;
            is_active = other.is_active;

            other.calibration_handle = nullptr;
            other.is_active = false;
        }
        return *this;
    }

    void calibrateParameter(const string& param, double value) {
        if (!is_active) {
            throw runtime_error("Session not active");
        }
        cout << "[Session " << session_id << "] Calibrating " << param
             << " = " << value << endl;
    }

    int getSessionID() const { return session_id; }
    bool isActive() const { return is_active; }
};

// Part 2: Scoped Calibration Lock with Try-Lock Support
class CalibrationLock {
private:
    mutex& calibration_mutex;
    bool locked;
    int sensor_id;

public:
    // Regular blocking lock
    explicit CalibrationLock(mutex& m, int id)
        : calibration_mutex(m), locked(true), sensor_id(id) {

        cout << "[Sensor " << sensor_id << "] Acquiring calibration lock (blocking)..." << endl;
        calibration_mutex.lock();
        cout << "[Sensor " << sensor_id << "] Calibration lock acquired" << endl;
    }

    // Try-lock variant
    enum class TryLock { attempt };
    CalibrationLock(mutex& m, int id, TryLock)
        : calibration_mutex(m), sensor_id(id) {

        cout << "[Sensor " << sensor_id << "] Attempting calibration lock (non-blocking)..." << endl;
        locked = m.try_lock();

        if (locked) {
            cout << "[Sensor " << sensor_id << "] Calibration lock acquired immediately" << endl;
        } else {
            cout << "[Sensor " << sensor_id << "] Calibration lock NOT available" << endl;
        }
    }

    ~CalibrationLock() {
        if (locked) {
            cout << "[Sensor " << sensor_id << "] Releasing calibration lock" << endl;
            calibration_mutex.unlock();
        }
    }

    // ✅ Non-movable, non-copyable - lock tied to scope
    CalibrationLock(const CalibrationLock&) = delete;
    CalibrationLock& operator=(const CalibrationLock&) = delete;
    CalibrationLock(CalibrationLock&&) = delete;
    CalibrationLock& operator=(CalibrationLock&&) = delete;

    bool ownsLock() const { return locked; }
    explicit operator bool() const { return locked; }
};

// Part 3: Calibration Scope Guard for Cleanup Actions
template<typename CleanupFunc>
class CalibrationScopeGuard {
private:
    CleanupFunc cleanup;
    bool active;
    string description;

public:
    explicit CalibrationScopeGuard(CleanupFunc&& f, string desc = "")
        : cleanup(forward<CleanupFunc>(f))
        , active(true)
        , description(move(desc)) {

        if (!description.empty()) {
            cout << "[ScopeGuard] Created: " << description << endl;
        }
    }

    ~CalibrationScopeGuard() noexcept {
        if (active) {
            if (!description.empty()) {
                cout << "[ScopeGuard] Executing cleanup: " << description << endl;
            }
            try {
                cleanup();
            } catch (const exception& e) {
                // ✅ Never throw from destructor - log instead
                cout << "[ScopeGuard] Cleanup threw exception: " << e.what() << endl;
            }
        }
    }

    void dismiss() noexcept {
        if (!description.empty() && active) {
            cout << "[ScopeGuard] Dismissed: " << description << endl;
        }
        active = false;
    }

    // ✅ Move-only - transfer cleanup responsibility
    CalibrationScopeGuard(CalibrationScopeGuard&& other) noexcept
        : cleanup(move(other.cleanup))
        , active(other.active)
        , description(move(other.description)) {
        other.active = false;
    }

    CalibrationScopeGuard(const CalibrationScopeGuard&) = delete;
    CalibrationScopeGuard& operator=(const CalibrationScopeGuard&) = delete;
    CalibrationScopeGuard& operator=(CalibrationScopeGuard&&) = delete;
};

// Helper function for creating scope guards
template<typename Func>
auto makeCalibrationGuard(Func&& f, string desc = "") {
    return CalibrationScopeGuard<Func>(forward<Func>(f), move(desc));
}

// Part 4: Two-Phase Initialization with Optional for Sensor Configuration
class SensorConfig {
private:
    int sensor_id;
    string sensor_type;
    map<string, double> calibration_params;
    bool is_validated;

    // Private constructor - use create() factory
    SensorConfig(int id, const string& type)
        : sensor_id(id)
        , sensor_type(type)
        , is_validated(false) {}

public:
    // ✅ Factory method with two-phase initialization
    static optional<SensorConfig> create(
        int id,
        const string& type,
        const map<string, double>& params
    ) {
        cout << "\n[Factory] Creating SensorConfig for sensor " << id << endl;

        // Phase 1: Construct object
        SensorConfig config(id, type);

        // Phase 2: Validate parameters
        config.calibration_params = params;

        // Validation rules
        if (type == "LiDAR") {
            if (params.count("beam_count") == 0 || params.at("beam_count") < 16) {
                cout << "[Factory] Validation failed: Invalid LiDAR beam_count" << endl;
                return nullopt;  // ❌ Validation failed
            }
        } else if (type == "Camera") {
            if (params.count("exposure_ms") == 0 || params.at("exposure_ms") <= 0) {
                cout << "[Factory] Validation failed: Invalid Camera exposure" << endl;
                return nullopt;  // ❌ Validation failed
            }
        }

        config.is_validated = true;
        cout << "[Factory] SensorConfig validated successfully" << endl;
        return config;  // ✅ Return valid config
    }

    bool isValid() const { return is_validated; }

    void print() const {
        cout << "  Sensor " << sensor_id << " [" << sensor_type << "]:" << endl;
        for (const auto& [param, value] : calibration_params) {
            cout << "    " << param << " = " << value << endl;
        }
    }
};

// Part 5: Transactional Calibration with Commit/Rollback
class CalibrationTransaction {
private:
    vector<pair<int, string>>& log;  // Reference to calibration log
    vector<pair<int, string>> pending_changes;
    bool committed;
    int transaction_id;

public:
    CalibrationTransaction(vector<pair<int, string>>& calib_log, int id)
        : log(calib_log)
        , committed(false)
        , transaction_id(id) {

        cout << "\n[Transaction " << transaction_id << "] BEGIN calibration transaction" << endl;
    }

    ~CalibrationTransaction() noexcept {
        if (!committed) {
            cout << "[Transaction " << transaction_id << "] ROLLBACK - discarding "
                 << pending_changes.size() << " pending changes" << endl;
            // ✅ Changes never committed - automatic rollback
        }
    }

    void recordChange(int sensor_id, const string& change) {
        if (committed) {
            throw runtime_error("Transaction already committed");
        }
        pending_changes.push_back({sensor_id, change});
        cout << "[Transaction " << transaction_id << "] Recorded change for sensor "
             << sensor_id << ": " << change << endl;
    }

    void commit() {
        if (committed) {
            throw runtime_error("Transaction already committed");
        }

        cout << "[Transaction " << transaction_id << "] COMMIT - applying "
             << pending_changes.size() << " changes" << endl;

        // Apply all pending changes atomically
        for (const auto& change : pending_changes) {
            log.push_back(change);
        }

        pending_changes.clear();
        committed = true;
        cout << "[Transaction " << transaction_id << "] Transaction committed successfully" << endl;
    }

    // ✅ Non-movable, non-copyable - tied to scope
    CalibrationTransaction(const CalibrationTransaction&) = delete;
    CalibrationTransaction& operator=(const CalibrationTransaction&) = delete;
    CalibrationTransaction(CalibrationTransaction&&) = delete;
    CalibrationTransaction& operator=(CalibrationTransaction&&) = delete;
};

// Part 6: Thread-Safe Lazy-Initialized Calibration Database
class CalibrationDatabase {
private:
    mutable unique_ptr<map<int, vector<double>>> database;
    mutable mutex init_mutex;
    mutable atomic<bool> initialized{false};
    function<unique_ptr<map<int, vector<double>>>()> loader;

    void ensureInitialized() const {
        // ✅ Double-checked locking for performance
        if (!initialized.load(memory_order_acquire)) {
            lock_guard<mutex> lock(init_mutex);
            if (!initialized.load(memory_order_relaxed)) {
                cout << "\n[Database] Lazy-initializing calibration database..." << endl;

                database = loader();

                if (!database) {
                    throw runtime_error("Failed to initialize calibration database");
                }

                initialized.store(true, memory_order_release);
                cout << "[Database] Calibration database initialized with "
                     << database->size() << " sensor(s)" << endl;
            }
        }
    }

public:
    template<typename LoaderFunc>
    explicit CalibrationDatabase(LoaderFunc&& load_func)
        : loader(forward<LoaderFunc>(load_func)) {
        cout << "[Database] CalibrationDatabase created (not yet initialized)" << endl;
    }

    ~CalibrationDatabase() {
        if (initialized) {
            cout << "[Database] Destroying initialized calibration database" << endl;
        }
    }

    const vector<double>& getCalibration(int sensor_id) const {
        ensureInitialized();  // ✅ Initialize on first access

        if (database->count(sensor_id) == 0) {
            throw runtime_error("Sensor " + to_string(sensor_id) + " not in database");
        }

        return (*database)[sensor_id];
    }

    bool isInitialized() const {
        return initialized.load(memory_order_acquire);
    }
};

// Part 7: Demonstration
void demonstrateCustomWrappers() {
    cout << "=== Custom RAII Wrappers for Autonomous Vehicle Calibration ===" << endl;

    // Demonstration 1: Move-Only Calibration Session
    cout << "\n--- Demonstration 1: Move-Only Calibration Session ---" << endl;
    {
        CalibrationSession session1(1, "LiDAR");
        session1.calibrateParameter("vertical_angle", 15.0);

        cout << "\nMoving session1 to session2..." << endl;
        CalibrationSession session2 = move(session1);
        // session1 is now in moved-from state

        session2.calibrateParameter("horizontal_angle", 360.0);
        // ✅ session2 automatically released on scope exit
    }

    // Demonstration 2: Scoped Calibration Lock
    cout << "\n--- Demonstration 2: Scoped Calibration Lock ---" << endl;
    {
        mutex calib_mutex;

        {
            CalibrationLock lock(calib_mutex, 101);
            cout << "Performing calibration under lock..." << endl;
            // ✅ Lock automatically released on scope exit
        }

        // Try-lock variant
        {
            CalibrationLock try_lock(calib_mutex, 102, CalibrationLock::TryLock::attempt);
            if (try_lock) {
                cout << "Calibration under try-lock..." << endl;
            }
        }
    }

    // Demonstration 3: Calibration Scope Guard
    cout << "\n--- Demonstration 3: Calibration Scope Guard ---" << endl;
    {
        bool sensor_enabled = false;

        auto enable_guard = makeCalibrationGuard(
            [&sensor_enabled]() {
                sensor_enabled = false;
                cout << "Sensor disabled via scope guard" << endl;
            },
            "Disable sensor on exit"
        );

        sensor_enabled = true;
        cout << "Sensor enabled for calibration" << endl;

        // If exception thrown here, scope guard ensures cleanup
        // ✅ Scope guard automatically executes on scope exit
    }

    // Demonstration 4: Two-Phase Initialization
    cout << "\n--- Demonstration 4: Two-Phase Initialization ---" << endl;
    {
        // Valid configuration
        auto valid_config = SensorConfig::create(201, "LiDAR", {
            {"beam_count", 64},
            {"range_m", 100.0}
        });

        if (valid_config) {
            cout << "\nValid configuration created:" << endl;
            valid_config->print();
        }

        // Invalid configuration
        auto invalid_config = SensorConfig::create(202, "LiDAR", {
            {"beam_count", 8},  // Too few beams
            {"range_m", 50.0}
        });

        if (!invalid_config) {
            cout << "\nInvalid configuration rejected (as expected)" << endl;
        }
    }

    // Demonstration 5: Transactional Calibration
    cout << "\n--- Demonstration 5: Transactional Calibration ---" << endl;
    {
        vector<pair<int, string>> calibration_log;

        // Successful transaction
        {
            CalibrationTransaction txn(calibration_log, 1);
            txn.recordChange(301, "Set exposure to 10ms");
            txn.recordChange(302, "Set gain to 2.5");
            txn.commit();  // ✅ Changes applied
        }

        cout << "\nCalibration log after successful transaction:" << endl;
        for (const auto& [id, change] : calibration_log) {
            cout << "  Sensor " << id << ": " << change << endl;
        }

        // Failed transaction - automatic rollback
        {
            CalibrationTransaction txn(calibration_log, 2);
            txn.recordChange(303, "Set FOV to 120 degrees");
            // Exception occurs, commit() never called
            // ✅ Automatic rollback via destructor
        }

        cout << "\nCalibration log after failed transaction (unchanged):" << endl;
        for (const auto& [id, change] : calibration_log) {
            cout << "  Sensor " << id << ": " << change << endl;
        }
    }

    // Demonstration 6: Lazy Calibration Database
    cout << "\n--- Demonstration 6: Lazy Calibration Database ---" << endl;
    {
        CalibrationDatabase db([]() {
            // Simulate expensive database loading
            auto data = make_unique<map<int, vector<double>>>();
            (*data)[401] = {1.0, 2.0, 3.0};
            (*data)[402] = {4.0, 5.0, 6.0};
            return data;
        });

        cout << "\nDatabase created but not initialized yet" << endl;
        cout << "Is initialized: " << (db.isInitialized() ? "yes" : "no") << endl;

        cout << "\nAccessing calibration data (triggers lazy initialization)..." << endl;
        const auto& calib = db.getCalibration(401);

        cout << "Calibration for sensor 401: ";
        for (double val : calib) {
            cout << val << " ";
        }
        cout << endl;

        cout << "Is initialized: " << (db.isInitialized() ? "yes" : "no") << endl;
        // ✅ Database automatically destroyed on scope exit
    }

    cout << "\n=== All calibration resources cleaned up ===" << endl;
}

int main() {
    demonstrateCustomWrappers();
    return 0;
}
```

**Key Custom RAII Patterns Demonstrated:**

1. **Move-Only Calibration Session** (`CalibrationSession`)
   - Exclusive ownership of hardware calibration resources
   - Deleted copy operations prevent double-free
   - Move semantics enable ownership transfer
   - Self-move check in move assignment
   - Automatic hardware release in destructor

2. **Scoped Calibration Lock** (`CalibrationLock`)
   - Multiple acquisition strategies (blocking, try-lock)
   - Non-movable, non-copyable - tied to specific scope
   - State tracking (whether lock was acquired)
   - Automatic unlock via destructor
   - Prevents deadlocks in calibration sequences

3. **Calibration Scope Guard** (`CalibrationScopeGuard`)
   - Generic cleanup for arbitrary calibration actions
   - Accepts lambda cleanup functions
   - Move-only to transfer cleanup responsibility
   - Never throws from destructor
   - Dismiss mechanism for conditional cleanup

4. **Two-Phase Initialization** (`SensorConfig`)
   - Private constructor prevents direct instantiation
   - Factory method with validation
   - Returns `std::optional` for failure signaling
   - Ensures only valid configurations are created
   - No exceptions needed for validation failures

5. **Transactional Calibration** (`CalibrationTransaction`)
   - Commit-or-rollback pattern for calibration changes
   - Default rollback in destructor
   - Explicit commit makes changes permanent
   - Non-transferable - tied to transaction scope
   - Atomic application of multiple changes

6. **Lazy Calibration Database** (`CalibrationDatabase`)
   - Defers expensive initialization until first use
   - Thread-safe with double-checked locking
   - Atomic flag for fast-path initialization check
   - Mutex protection for initialization
   - Automatic cleanup of initialized resources

**Real-World Autonomous Vehicle Applications:**

- **Sensor Calibration Sessions**: Hardware calibration resources must be acquired/released properly. Move-only semantics prevent accidental duplication while enabling ownership transfer between calibration stages.

- **Concurrency Control**: Multiple subsystems may need exclusive access to calibration hardware. Scoped locks with try-lock support enable non-blocking calibration attempts while guaranteeing cleanup.

- **Configuration Validation**: Sensor configurations must be validated before deployment. Two-phase initialization with `optional` ensures invalid configurations never enter the system.

- **Transactional Updates**: Calibration parameter updates must be atomic - either all succeed or none apply. Transaction wrappers provide this guarantee through RAII.

- **Resource Optimization**: Calibration databases are expensive to load but rarely accessed. Lazy initialization defers this cost until actually needed, with thread-safe first-access initialization.

**Advanced RAII Techniques:**

- **Rule of Five**: All wrappers properly implement special members (destructor, copy/move constructors, copy/move assignment)
- **Self-Move Safety**: Move assignment checks `this != &other` to prevent bugs
- **Conditional Cleanup**: Scope guards can be dismissed if operations succeed
- **Thread Safety**: Lazy initialization uses double-checked locking with proper memory ordering
- **Exception Safety**: Strong guarantee through RAII members and transactional patterns
- **Move Semantics**: Enable efficient ownership transfer without copying
- **Non-Throwing Destructors**: All destructors marked `noexcept` and handle errors safely

This comprehensive example demonstrates how custom RAII wrappers solve complex resource management challenges in autonomous vehicle calibration systems while maintaining exception safety, thread safety, and efficient resource usage.

### INTERVIEW_QA: Comprehensive Questions

#### Q1: What is the Rule of Five and why does it matter for RAII classes?
**Difficulty:** #intermediate  
**Category:** #rule_of_five #resource_management  
**Concepts:** #destructor #copy_constructor #move_constructor #copy_assignment #move_assignment

**Answer:**
The Rule of Five states that if a class defines any of destructor, copy constructor, copy assignment, move constructor, or move assignment, it should explicitly consider defining all five.

**Explanation:**
RAII classes managing resources typically need custom destructors to release resources, which triggers the Rule of Five. When a class has a custom destructor, the compiler-generated copy and move operations may be incorrect or deleted. Copy operations might need deep copy semantics or should be deleted for unique ownership. Move operations enable efficient ownership transfer. Explicitly defining or deleting these five special members ensures correct resource management during object lifetime events.

**Key takeaway:** RAII resource-owning classes should implement Rule of Five by explicitly defining, defaulting, or deleting all five special member functions.

---

#### Q2: How do you implement move semantics for a resource-owning class?
**Difficulty:** #intermediate  
**Category:** #move_semantics #resource_management  
**Concepts:** #move_constructor #move_assignment #ownership_transfer #rvalue_reference

**Answer:**
Move constructor transfers resource ownership by copying the resource handle and nullifying the source object's handle. Move assignment releases current resources, transfers from source, and nullifies source.

**Code example:**
```cpp
class Resource {
    int* data;
public:
    // Move constructor
    Resource(Resource&& other) noexcept : data(other.data) {
        other.data = nullptr;  // ✅ Transfer ownership
    }
    
    // Move assignment
    Resource& operator=(Resource&& other) noexcept {
        if (this != &other) {  // ✅ Self-move check
            delete[] data;     // Release current
            data = other.data; // Transfer ownership
            other.data = nullptr;
        }
        return *this;
    }
};
```

**Explanation:**
Move semantics enable ownership transfer without copying. The move constructor takes an rvalue reference and "steals" resources from the source object, leaving it in a valid but empty state. Move assignment must first release any resources currently owned, then steal from source. Both should be marked `noexcept` for optimal performance with containers. Self-move check prevents releasing resources before transferring.

**Key takeaway:** Move operations transfer resource ownership by stealing pointers/handles and nullifying the source, enabling efficient resource transfer without copying.

---

#### Q3: Why should copy constructors often be deleted for RAII classes?
**Difficulty:** #intermediate  
**Category:** #copy_semantics #resource_management  
**Concepts:** #copy_constructor #unique_ownership #deep_copy #shallow_copy

**Answer:**
Copy constructors are deleted when resources have unique ownership (file handles, mutexes) or when deep copying would be expensive or impossible, preventing double-free bugs and resource conflicts.

**Code example:**
```cpp
class FileHandle {
    FILE* file;
public:
    FileHandle(const FileHandle&) = delete;  // ✅ Prevent copying
    FileHandle& operator=(const FileHandle&) = delete;
    
    FileHandle(FileHandle&&) noexcept;  // ✅ Allow moving
    FileHandle& operator=(FileHandle&&) noexcept;
};
```

**Explanation:**
Shallow copying would create two objects sharing the same resource handle—both would try to release it in their destructors, causing double-free. Deep copying isn't feasible for unique resources like file descriptors or mutex locks. Deleting copy operations enforces single ownership, preventing bugs. Move operations provide safe ownership transfer when needed.

**Key takeaway:** Delete copy operations for unique-ownership resources to prevent double-free bugs; provide move operations for ownership transfer.

---

#### Q4: What is the purpose of std::move in RAII contexts?
**Difficulty:** #intermediate  
**Category:** #move_semantics #resource_management  
**Concepts:** #std_move #rvalue_reference #ownership_transfer #lvalue_to_rvalue

**Answer:**
`std::move` casts lvalues to rvalues, enabling move semantics by telling the compiler that ownership can be transferred from the named object.

**Code example:**
```cpp
FileHandle f1("file.txt", "r");
FileHandle f2 = std::move(f1);  // ✅ Invokes move constructor
// f1 is now in moved-from state (empty)
// f2 owns the file handle
```

**Explanation:**
Named variables are lvalues and normally invoke copy operations. `std::move` converts lvalues to xvalues (expiring values), which are rvalues, causing the compiler to select move operations instead of copy. This explicitly transfers ownership from source to destination. The moved-from object remains valid but in an unspecified state, typically empty. `std::move` itself doesn't move anything—it's a cast that enables move semantics.

**Key takeaway:** `std::move` casts lvalues to rvalues to enable move semantics, explicitly signaling that ownership should be transferred.

---

#### Q5: How do you handle multiple resources with different lifetimes in one class?
**Difficulty:** #advanced  
**Category:** #resource_management #lifetime_management  
**Concepts:** #raii #multiple_resources #unique_ptr #dependency_order

**Answer:**
Use RAII wrapper members (like unique_ptr) for each resource, ordered by dependency in member declarations, and initialize them in member initializer lists to ensure proper construction/destruction order.

**Code example:**
```cpp
class Application {
    std::unique_ptr<Logger> logger_;      // Longest lifetime
    std::unique_ptr<Database> database_;  // Depends on logger
    std::unique_ptr<Server> server_;      // Depends on database
    
public:
    Application()
        : logger_(std::make_unique<Logger>())
        , database_(std::make_unique<Database>(*logger_))
        , server_(std::make_unique<Server>(*database_))
    {
        // ✅ Resources acquired in declaration order
        // If any throws, previous resources auto-cleaned
    }
    // ✅ Destructor automatic: server_, database_, logger_ destroyed in reverse
};
```

**Explanation:**
Each resource is wrapped in a RAII manager. Members are initialized in declaration order in the initializer list. If later initialization throws, already-constructed members are automatically destroyed during unwinding. Destruction happens in reverse order, ensuring dependent resources are destroyed before their dependencies. No manual cleanup code needed—RAII handles everything.

**Key takeaway:** Wrap each resource in RAII members, order declarations by dependency, and use initializer lists for automatic exception-safe construction/destruction.

---

#### Q6: What is conditional ownership and how do you implement it?
**Difficulty:** #advanced  
**Category:** #ownership_semantics #resource_management  
**Concepts:** #conditional_ownership #raii #ownership_tracking #optional_cleanup

**Answer:**
Conditional ownership means a wrapper sometimes owns and releases a resource, other times just references it without ownership. Track ownership with a bool flag and conditionally release in the destructor.

**Code example:**
```cpp
class FileWrapper {
    FILE* file;
    bool owns;
    
public:
    FileWrapper(const char* filename, const char* mode)
        : file(fopen(filename, mode)), owns(true) {}  // ✅ Owns
    
    FileWrapper(FILE* external)
        : file(external), owns(false) {}  // ✅ Doesn't own
    
    ~FileWrapper() {
        if (owns && file) fclose(file);  // ✅ Only close if owned
    }
};
```

**Explanation:**
The ownership flag tracks whether the wrapper acquired the resource (owns it) or received an external handle (doesn't own it). Constructors set the flag appropriately. The destructor checks the flag before releasing. Move operations must transfer both the handle and ownership status. This pattern allows flexible resource wrapping while maintaining RAII guarantees.

**Key takeaway:** Use a bool flag to track whether resources are owned, and conditionally release in destructors based on ownership status.

---

#### Q7: Why are move operations marked noexcept and why does it matter?
**Difficulty:** #intermediate  
**Category:** #move_semantics #exception_safety  
**Concepts:** #noexcept #move_semantics #strong_guarantee #containers

**Answer:**
Move operations marked `noexcept` enable strong exception safety guarantees in standard containers and algorithms, which prefer copying over moving if moves can throw.

**Code example:**
```cpp
class Resource {
public:
    Resource(Resource&&) noexcept;  // ✅ Enables optimizations
    Resource& operator=(Resource&&) noexcept;
};

std::vector<Resource> vec;
vec.push_back(Resource());  // ✅ Uses move if noexcept, copy otherwise
```

**Explanation:**
Standard containers like vector provide strong exception safety when resizing—if reallocation throws, the original data is unchanged. Copying provides this naturally (copy to new buffer, delete old). Moving is cheaper but can't rollback if it throws. Containers check `noexcept` on moves—if true, they move; if false, they copy. Marking moves `noexcept` enables efficient container operations with RAII types.

**Key takeaway:** Mark move operations `noexcept` to enable container optimizations and strong exception safety guarantees in standard library.

---

#### Q8: How do you implement a scope guard using RAII?
**Difficulty:** #intermediate  
**Category:** #design_pattern #resource_management  
**Concepts:** #scope_guard #raii #lambda #cleanup_code

**Answer:**
A scope guard stores a callable (lambda/function) in its constructor and executes it in its destructor, providing automatic cleanup for arbitrary code.

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
    ScopeGuard guard([res]() { release(res); });
    doWork();  // ✅ release() called even if throws
}
```

**Explanation:**
Scope guards generalize RAII by accepting arbitrary cleanup logic at construction time, typically via lambdas. The destructor executes the cleanup function, providing automatic execution on scope exit. The dismiss method allows canceling cleanup if the operation succeeded. This avoids writing dedicated RAII wrapper classes for every resource type.

**Key takeaway:** Scope guards provide generalized RAII by storing cleanup lambdas and executing them in destructors for automatic scope-exit cleanup.

---

#### Q9: What is the copy-and-swap idiom and how does it relate to RAII?
**Difficulty:** #advanced  
**Category:** #exception_safety #idioms  
**Concepts:** #copy_and_swap #strong_guarantee #raii #assignment_operator

**Answer:**
Copy-and-swap implements assignment by copying into a temporary, swapping with current object, and letting the temporary's destructor clean up old resources—providing strong exception safety.

**Code example:**
```cpp
class Resource {
    int* data;
public:
    Resource& operator=(const Resource& other) {
        Resource temp(other);  // ✅ Copy (may throw)
        swap(temp);            // ✅ Swap (noexcept)
        return *this;          // ✅ temp destroys old resources
    }
    
    void swap(Resource& other) noexcept {
        std::swap(data, other.data);
    }
};
```

**Explanation:**
All potentially throwing operations (allocation, copying) happen on the temporary before modifying the current object. If copying throws, current object is unchanged (strong guarantee). Once the copy succeeds, non-throwing swap transfers ownership. The temporary's destructor (RAII) automatically releases the old resources. This pattern simplifies assignment implementation while guaranteeing exception safety.

**Key takeaway:** Copy-and-swap leverages RAII for exception-safe assignment by performing risky operations on temporaries and using non-throwing swaps.

---

#### Q10: How do you implement two-phase initialization while maintaining RAII?
**Difficulty:** #advanced  
**Category:** #initialization #exception_safety  
**Concepts:** #two_phase_initialization #raii #factory_method #optional

**Answer:**
Use factory methods that construct objects and attempt initialization, returning `std::optional` or throwing exceptions. The factory ensures only successfully initialized objects are created.

**Code example:**
```cpp
class Connection {
    void* handle = nullptr;
    Connection() = default;  // Private constructor
    
public:
    static std::optional<Connection> create(const char* host) {
        Connection conn;
        conn.handle = attemptConnection(host);
        if (!conn.handle) return std::nullopt;  // ❌ Failed
        return conn;  // ✅ Success
    }
    
    ~Connection() { if (handle) disconnect(handle); }
};

auto conn = Connection::create("server");
if (conn) conn->use();  // ✅ Only use if successful
```

**Explanation:**
Two-phase initialization separates construction from resource acquisition, allowing failure reporting without exceptions. Using `std::optional` or throwing from the factory maintains RAII—constructed objects are always valid. The private constructor prevents direct instantiation of uninitialized objects. This pattern provides exception-free resource acquisition while preserving RAII guarantees.

**Key takeaway:** Factory methods with optional return types enable two-phase initialization while ensuring constructed objects are always fully initialized and RAII-managed.

---

#### Q11: What problems arise with self-move-assignment and how do you prevent them?
**Difficulty:** #advanced  
**Category:** #move_semantics #special_cases  
**Concepts:** #self_assignment #move_assignment #resource_management #undefined_behavior

**Answer:**
Self-move-assignment can release resources before transferring them, leaving the object in an invalid state. Check `if (this != &other)` before releasing current resources.

**Code example:**
```cpp
class Resource {
    int* data;
public:
    Resource& operator=(Resource&& other) noexcept {
        // ❌ Without check:
        delete[] data;          // Releases resource
        data = other.data;      // If self-move, data is dangling
        other.data = nullptr;
        
        // ✅ With check:
        if (this != &other) {
            delete[] data;
            data = other.data;
            other.data = nullptr;
        }
        return *this;
    }
};
```

**Explanation:**
Self-move-assignment (`x = std::move(x)`) occurs through reference chains or template code. Without a self-assignment check, the implementation deletes the resource that the source (same object) still references, creating a dangling pointer. Checking `this != &other` before releasing prevents this. Alternatively, swap-based implementations naturally handle self-assignment correctly.

**Key takeaway:** Check for self-assignment in move assignment operators to prevent releasing resources that the source (same object) still references.

---

#### Q12: How do you manage resources with strict alignment requirements using RAII?
**Difficulty:** #advanced  
**Category:** #memory_management #alignment  
**Concepts:** #aligned_allocation #raii #operator_new #simd #over_alignment

**Answer:**
Use aligned allocation functions (`::operator new` with `std::align_val_t`) in constructors and matching aligned deallocation in destructors for over-aligned types.

**Code example:**
```cpp
struct alignas(32) SIMDData {
    float values[8];
};

class AlignedBuffer {
    SIMDData* data;
    size_t count;
public:
    AlignedBuffer(size_t n) : count(n) {
        data = static_cast<SIMDData*>(
            ::operator new[](n * sizeof(SIMDData), std::align_val_t{32})
        );
    }
    
    ~AlignedBuffer() {
        ::operator delete[](data, std::align_val_t{32});  // ✅ Matching dealloc
    }
};
```

**Explanation:**
Types with `alignas` greater than default alignment require special allocation. Standard `new`/`delete` may not provide sufficient alignment. C++17's `::operator new` with `std::align_val_t` guarantees required alignment. The destructor must use matching aligned deallocation. RAII ensures correct deallocation even with exceptions, preventing leaks of over-aligned allocations.

**Key takeaway:** Use aligned allocation operators with matching deallocation in RAII wrappers to correctly manage over-aligned types.

---

#### Q13: What is the relationship between RAII and the Pimpl idiom?
**Difficulty:** #advanced  
**Category:** #design_pattern #encapsulation  
**Concepts:** #pimpl #raii #unique_ptr #compilation_firewall

**Answer:**
The Pimpl idiom uses a unique_ptr to an implementation class, leveraging RAII for automatic cleanup while hiding implementation details and reducing compilation dependencies.

**Code example:**
```cpp
// Widget.h
class Widget {
    class Impl;  // Forward declaration
    std::unique_ptr<Impl> pimpl;  // ✅ RAII manages implementation
public:
    Widget();
    ~Widget();  // Declared in header, defined in .cpp
    void operation();
};

// Widget.cpp
class Widget::Impl {
    // Implementation details hidden
};

Widget::Widget() : pimpl(std::make_unique<Impl>()) {}
Widget::~Widget() = default;  // ✅ unique_ptr destructor called
```

**Explanation:**
Pimpl (Pointer to Implementation) hides class internals behind a pointer to a forward-declared implementation class. Using `unique_ptr` provides RAII management—the implementation is automatically deleted when the wrapper is destroyed. The destructor must be declared in the header but defined in the implementation file where `Impl` is complete. This combines RAII's automatic cleanup with compilation firewall benefits.

**Key takeaway:** Pimpl idiom uses unique_ptr for RAII management of hidden implementations, providing automatic cleanup with reduced compilation dependencies.

---

#### Q14: How do you implement RAII for thread-local resources?
**Difficulty:** #advanced  
**Category:** #multithreading #lifetime_management  
**Concepts:** #thread_local #raii #per_thread_resources #thread_lifetime

**Answer:**
Thread-local RAII objects are constructed on first access within each thread and destroyed when that thread exits. Each thread has its own independent instance with automatic thread-exit cleanup.

**Code example:**
```cpp
class ThreadLocalResource {
    FILE* logFile;
public:
    ThreadLocalResource() {
        std::ostringstream name;
        name << "thread_" << std::this_thread::get_id() << ".log";
        logFile = fopen(name.str().c_str(), "w");
    }
    
    ~ThreadLocalResource() {
        if (logFile) fclose(logFile);  // ✅ Closed when thread exits
    }
};

thread_local ThreadLocalResource resource;  // One per thread

void threadFunction() {
    resource.log("Message");  // ✅ Constructed on first use
}  // ✅ Destroyed when thread exits
```

**Explanation:**
Thread-local RAII objects have per-thread lifetimes, constructed lazily on first use within each thread and destroyed when the thread terminates. This provides thread-specific resources with automatic cleanup. Care must be taken with dependencies on global objects, as destruction order between thread-local and global objects is complex.

**Key takeaway:** Thread-local RAII objects provide per-thread resources with automatic construction on first use and destruction on thread exit.

---

#### Q15: How do you implement lazy initialization with RAII while maintaining thread safety?
**Difficulty:** #advanced  
**Category:** #lazy_initialization #thread_safety  
**Concepts:** #lazy_initialization #raii #mutex #double_checked_locking #atomic

**Answer:**
Use double-checked locking with atomic flags for initialization state, a mutex for initialization protection, and RAII wrappers to store the lazily-initialized resource.

**Code example:**
```cpp
class LazyResource {
    mutable std::unique_ptr<Resource> resource_;
    mutable std::mutex initMutex_;
    mutable std::atomic<bool> initialized_{false};
    
    void ensureInit() const {
        if (!initialized_.load(std::memory_order_acquire)) {
            std::lock_guard<std::mutex> lock(initMutex_);
            if (!initialized_.load(std::memory_order_relaxed)) {
                resource_ = std::make_unique<Resource>();
                initialized_.store(true, std::memory_order_release);
            }
        }
    }
    
public:
    Resource& get() const {
        ensureInit();
        return *resource_;
    }
};
```

**Explanation:**
Double-checked locking avoids mutex overhead after initialization. First atomic check (fast path) returns if already initialized. If not, acquire mutex and check again under lock. Initialize once, then release lock. Subsequent accesses skip the lock. RAII (unique_ptr) ensures automatic cleanup when the wrapper is destroyed. Memory ordering ensures visibility across threads.

**Key takeaway:** Lazy initialization with thread safety uses double-checked locking, atomic flags, mutexes for protection, and RAII for automatic resource cleanup.

---

#### Q16: What is the purpose of marking destructors virtual in RAII base classes?
**Difficulty:** #intermediate  
**Category:** #inheritance #polymorphism  
**Concepts:** #virtual_destructor #inheritance #raii #polymorphic_deletion

**Answer:**
Virtual destructors in base classes ensure that derived class destructors are called when deleting through base pointers, preventing resource leaks in inheritance hierarchies.

**Code example:**
```cpp
class Base {
    int* baseData;
public:
    Base() : baseData(new int[100]) {}
    virtual ~Base() { delete[] baseData; }  // ✅ Virtual
};

class Derived : public Base {
    int* derivedData;
public:
    Derived() : derivedData(new int[200]) {}
    ~Derived() override { delete[] derivedData; }
};

void polymorphic() {
    Base* ptr = new Derived();
    delete ptr;  // ✅ Calls ~Derived(), then ~Base()
}
```

**Explanation:**
Without a virtual destructor, deleting derived objects through base pointers only calls the base destructor, leaking derived class resources. Virtual destructors ensure the full destruction chain executes—derived destructor first, then base destructor. Any class intended for inheritance or with virtual methods should have a virtual destructor to support polymorphic deletion safely.

**Key takeaway:** Mark destructors virtual in base classes to ensure proper resource cleanup when derived objects are deleted through base pointers.

---

#### Q17: How do you implement a commit-or-rollback transaction using RAII?
**Difficulty:** #intermediate  
**Category:** #transaction_pattern #design_pattern  
**Concepts:** #raii #transactions #commit #rollback #database

**Answer:**
Track a committed flag in the constructor (set false), check it in the destructor (rollback if false), and provide explicit commit method that sets the flag.

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
        committed = true;  // ✅ Mark committed
    }
};

void operation(Database& db) {
    Transaction txn(db);
    db.execute("INSERT...");
    txn.commit();  // ✅ Must call explicitly
}  // If commit not reached, rollback happens
```

**Explanation:**
The transaction begins in the constructor and defaults to rollback in the destructor. Only explicit commit sets the flag and makes changes permanent. This ensures partial operations are never left in an inconsistent state—exceptions or early returns automatically trigger rollback through RAII. The pattern implements transactional semantics through automatic cleanup.

**Key takeaway:** Transaction RAII wrappers default to rollback in destructors and only commit when explicitly told, ensuring atomic operations.

---

#### Q18: Why is it important to check for self-assignment in copy assignment operators?
**Difficulty:** #intermediate  
**Category:** #copy_semantics #safety  
**Concepts:** #self_assignment #copy_assignment #resource_management #correctness

**Answer:**
Self-assignment checks prevent releasing resources before copying from source when source and destination are the same object, avoiding undefined behavior.

**Code example:**
```cpp
class Resource {
    int* data;
public:
    Resource& operator=(const Resource& other) {
        // ❌ Without check:
        delete[] data;                  // Releases resource
        data = new int[other.size];     // If self-assign, other.data invalid
        std::copy(other.data, ...);     // UB: copying from deleted memory
        
        // ✅ With check:
        if (this != &other) {
            delete[] data;
            data = new int[other.size];
            std::copy(other.data, ...);
        }
        return *this;
    }
};
```

**Explanation:**
Self-assignment (`x = x`) occurs more than expected, especially in generic code. Without checking, the implementation releases the current resource, then attempts to copy from the source—which is the same just-deleted resource. Copy-and-swap idiom naturally handles self-assignment without explicit checks by performing operations on a temporary.

**Key takeaway:** Check for self-assignment in copy assignment to prevent releasing resources before copying from the same object.

---

#### Q19: How do you implement RAII for resources requiring explicit initialization separate from construction?
**Difficulty:** #advanced  
**Category:** #initialization_patterns #resource_management  
**Concepts:** #two_phase_initialization #raii #factory_pattern #optional #validation

**Answer:**
Use private constructors with public factory methods that perform initialization and return `std::optional` or throw, ensuring only valid objects are constructed.

**Code example:**
```cpp
class Connection {
    void* handle = nullptr;
    Connection() = default;  // Private
    
public:
    static std::optional<Connection> create(const std::string& host) {
        Connection conn;
        conn.handle = connectTo(host);  // Attempt initialization
        if (!conn.handle) return std::nullopt;  // Failed
        return conn;  // ✅ Return only if valid
    }
    
    ~Connection() {
        if (handle) disconnect(handle);  // ✅ RAII cleanup
    }
};

auto conn = Connection::create("server");
if (conn) conn->use();  // Only use if valid
```

**Explanation:**
The factory pattern ensures validation happens before object construction completes. Private constructors prevent creating uninitialized objects. Returning `optional` communicates failure without exceptions. This maintains RAII guarantees—all constructed objects are valid and automatically cleaned up—while supporting failure during acquisition.

**Key takeaway:** Factory methods with private constructors and optional returns enable validated initialization while preserving RAII guarantees.

---

#### Q20: What is the difference between shallow and deep copy in RAII contexts?
**Difficulty:** #beginner  
**Category:** #copy_semantics #fundamentals  
**Concepts:** #shallow_copy #deep_copy #raii #memory_management #ownership

**Answer:**
Shallow copy copies pointers (both objects share resource), causing double-free. Deep copy allocates new resources and copies data, providing independent ownership.

**Code example:**
```cpp
class Resource {
    int* data;
public:
    // ❌ Shallow copy - compiler-generated
    // Copies pointer, both objects point to same data
    
    // ✅ Deep copy - user-defined
    Resource(const Resource& other)
        : data(new int[other.size]) {
        std::copy(other.data, other.data + other.size, data);
    }
    
    ~Resource() { delete[] data; }
};

Resource r1;
Resource r2 = r1;  // With shallow: both r1 and r2 point to same data
                   // Both destructors try to delete → double-free
                   
                   // With deep: r2 has its own copy
                   // Both destructors delete different arrays ✅
```

**Explanation:**
Compiler-generated copy constructors perform shallow copies, copying pointer values. For RAII classes, this creates two objects sharing one resource, leading to double-free when both destructors run. Deep copy allocates new resources and copies content, giving each object independent resources. For many RAII types, copying is deleted entirely in favor of move-only semantics.

**Key takeaway:** Shallow copy shares resources causing double-free; deep copy creates independent copies; many RAII types delete copy and use move-only.

---

### PRACTICE_TASKS: Implementation Challenges

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

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Constructor once, destructor once (C++17 RVO)

**Explanation:** RVO elides move/copy; single object constructed in place

**Key Concept:** #rvo #move_semantics

</details>

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

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Double-delete, crash/UB

**Explanation:** Default copy constructor copies pointer; both delete same memory

**Key Concept:** #shallow_copy #double_free

</details>

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

<details>
<summary><b>Show Answer</b></summary>

**Answer:** One file opened, one closed, potential crash on f3

**Explanation:** f2's move leaves f1.file dangling pointer; f3 destructor calls fclose(nullptr)

**Key Concept:** #move_nullptr_bug

</details>

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

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Self-move bug: deletes data before transferring

**Explanation:** Without self-check, deletes data then assigns already-deleted pointer

**Key Concept:** #self_move_assignment

</details>

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

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Non-virtual destructor leaks derivedData

**Explanation:** Only ~Base() called; ~Derived() never runs; derivedData leaked

**Key Concept:** #virtual_destructor

</details>

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

<details>
<summary><b>Show Answer</b></summary>

**Answer:** test1: `BEGIN` `COMMIT` `COMMIT` `ROLLBACK`<br>test2: `BEGIN` `ROLLBACK`

**Explanation:** Commit called twice prints twice; test2 never commits so rolls back

**Key Concept:** #transaction_pattern

</details>

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

<details>
<summary><b>Show Answer</b></summary>

**Answer:** C++17: `Acquired` `Released`<br>Pre-C++17: `Acquired` `Moved` `Released`

**Explanation:** C++17 guaranteed RVO eliminates move; older standards may move

**Key Concept:** #rvo #copy_elision

</details>

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

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Not thread-safe; multiple threads can init simultaneously

**Explanation:** No mutex protection on init() check; race condition on allocation

**Key Concept:** #lazy_init #thread_safety

</details>

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

<details>
<summary><b>Show Answer</b></summary>

**Answer:** ScopedLock requires move constructor but is non-movable

**Explanation:** Returning by value tries to move; deleted move constructor causes error

**Key Concept:** #non_movable_return

</details>

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

<details>
<summary><b>Show Answer</b></summary>

**Answer:** vector requires movable or copyable elements

**Explanation:** Both copy and move deleted; vector can't store or resize elements

**Key Concept:** #vector_requirements

</details>

---

#### Q11
```cpp
class Widget {
    std::unique_ptr<int[]> buffer;
    int* rawPtr;
    
public:
    Widget(size_t size) 
        : buffer(new int[size])
        , rawPtr(new int[size])  // Intentional leak if throws
    {}
    
    ~Widget() {
        delete[] rawPtr;
    }
};

void test() {
    Widget w(100);
}
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** rawPtr leaks if second allocation throws

**Explanation:** buffer is RAII-wrapped (safe); rawPtr allocated after might leak

**Key Concept:** #constructor_exception_safety

</details>

---

#### Q12
```cpp
class Manager {
    std::unique_ptr<Resource1> r1;
    std::unique_ptr<Resource2> r2;
    
public:
    Manager()
        : r2(new Resource2())  // Listed first
        , r1(new Resource1())  // Listed second
    {
        // r2 depends on r1
        r2->setDependency(r1.get());
    }
};
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Initialization order mismatch: r1 initialized first despite list order

**Explanation:** Members init in declaration order (r1, r2) not initializer list order

**Key Concept:** #initialization_order

</details>

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
        if (file) fclose(file);  // Always closes
    }
};

void test() {
    FileWrapper w1("file.txt");
    FileWrapper w2(stdin);
}
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Always closes file even when it doesn't own (stdin)

**Explanation:** Destructor doesn't check owns flag before fclose; closes stdin

**Key Concept:** #conditional_ownership_bug

</details>

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

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Race condition: both threads might allocate

**Explanation:** No synchronization on ptr check/initialization; double allocation possible

**Key Concept:** #lazy_thread_safety

</details>

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

<details>
<summary><b>Show Answer</b></summary>

**Answer:** moreData leaked (20 ints)

**Explanation:** Non-virtual ~Base means ~Derived never called through base pointer

**Key Concept:** #virtual_destructor_leak

</details>

---


### QUICK_REFERENCE: Answer Key and Summary Tables

#### Answer Key for Practice Questions

| Q# | Answer | Explanation | Key Concept |
|----|--------|-------------|-------------|
| 1 | Constructor once, destructor once (C++17 RVO) | RVO elides move/copy; single object constructed in place | #rvo #move_semantics |
| 2 | Double-delete, crash/UB | Default copy constructor copies pointer; both delete same memory | #shallow_copy #double_free |
| 3 | One file opened, one closed, potential crash on f3 | f2's move leaves f1.file dangling pointer; f3 destructor calls fclose(nullptr) | #move_nullptr_bug |
| 4 | Self-move bug: deletes data before transferring | Without self-check, deletes data then assigns already-deleted pointer | #self_move_assignment |
| 5 | Non-virtual destructor leaks derivedData | Only ~Base() called; ~Derived() never runs; derivedData leaked | #virtual_destructor |
| 6 | test1: `BEGIN` `COMMIT` `COMMIT` `ROLLBACK`<br>test2: `BEGIN` `ROLLBACK` | Commit called twice prints twice; test2 never commits so rolls back | #transaction_pattern |
| 7 | C++17: `Acquired` `Released`<br>Pre-C++17: `Acquired` `Moved` `Released` | C++17 guaranteed RVO eliminates move; older standards may move | #rvo #copy_elision |
| 8 | Not thread-safe; multiple threads can init simultaneously | No mutex protection on init() check; race condition on allocation | #lazy_init #thread_safety |
| 9 | ScopedLock requires move constructor but is non-movable | Returning by value tries to move; deleted move constructor causes error | #non_movable_return |
| 10 | vector requires movable or copyable elements | Both copy and move deleted; vector can't store or resize elements | #vector_requirements |
| 11 | rawPtr leaks if second allocation throws | buffer is RAII-wrapped (safe); rawPtr allocated after might leak | #constructor_exception_safety |
| 12 | Initialization order mismatch: r1 initialized first despite list order | Members init in declaration order (r1, r2) not initializer list order | #initialization_order |
| 13 | Always closes file even when it doesn't own (stdin) | Destructor doesn't check owns flag before fclose; closes stdin | #conditional_ownership_bug |
| 14 | Race condition: both threads might allocate | No synchronization on ptr check/initialization; double allocation possible | #lazy_thread_safety |
| 15 | moreData leaked (20 ints) | Non-virtual ~Base means ~Derived never called through base pointer | #virtual_destructor_leak |

#### Rule of Five Special Members

| Special Member | Purpose | When Needed | Example |
|----------------|---------|-------------|---------|
| **Destructor** | Release resources | Always for RAII classes | `~Resource() { delete[] data; }` |
| **Copy Constructor** | Create copy with new resources | When deep copy needed, often deleted | `Resource(const Resource&) = delete;` |
| **Copy Assignment** | Replace resources with copy | When deep copy needed, often deleted | `operator=(const Resource&) = delete;` |
| **Move Constructor** | Transfer ownership | Enable efficient ownership transfer | `Resource(Resource&& o) noexcept : data(o.data) { o.data = nullptr; }` |
| **Move Assignment** | Replace with transferred ownership | Enable assignment with ownership transfer | Check self-move, release current, steal from source |

#### Move Semantics Checklist

| Requirement | Purpose | Implementation |
|-------------|---------|----------------|
| **Steal resources** | Transfer ownership from source | Copy pointers/handles from source to destination |
| **Nullify source** | Leave source in valid empty state | Set source pointers to nullptr after stealing |
| **Self-move check** | Prevent releasing before transferring | `if (this != &other)` before operations |
| **Release current** | Prevent leaks in move assignment | Release current resources before stealing new ones |
| **noexcept marking** | Enable container optimizations | Mark move operations `noexcept` when possible |
| **Swap alternative** | Simplify implementation | Use swap-based move for automatic self-move safety |

#### Common RAII Patterns

| Pattern | Use Case | Key Features | Example |
|---------|----------|--------------|---------|
| **Move-Only** | Unique ownership resources | Deleted copy, implemented move | File handles, unique_ptr |
| **Copyable** | Shared or independent resources | Deep copy implementation | Strings with own buffers |
| **Non-Transferable** | Scoped resources | Deleted copy and move | Lock guards, scoped locks |
| **Conditional Ownership** | Sometimes owns, sometimes references | Ownership flag, conditional cleanup | Optional file handle |
| **Scope Guard** | Arbitrary cleanup code | Lambda/function executed in destructor | Generic cleanup |
| **Transaction** | Commit or rollback | Rollback by default, explicit commit | Database transactions |
| **Lazy Init** | Deferred resource acquisition | Null check on access, init on first use | Thread-local resources |
| **Pooled** | Resource reuse | Return to pool in destructor | Connection pools |

#### Copy vs Move Decision Matrix

| Scenario | Copy | Move | Neither | Rationale |
|----------|------|------|---------|-----------|
| File handles | ❌ | ✅ | | Unique ownership, can't duplicate OS handle |
| Sockets | ❌ | ✅ | | Unique ownership, single connection |
| Mutexes | ❌ | ❌ | | Non-transferable, tied to memory location |
| Lock guards | ❌ | ❌ | | Non-transferable, scope-bound synchronization |
| Strings with buffers | ✅ | ✅ | | Can deep copy or move ownership efficiently |
| Smart pointers (unique) | ❌ | ✅ | | Unique ownership by design |
| Smart pointers (shared) | ✅ | ✅ | | Reference counting supports copy and move |
| Transactions | ❌ | ❌ | | Non-transferable, scope-bound atomicity |
| Scope guards | ❌ | ✅ | | Move to transfer cleanup responsibility |

#### Ownership Models

| Model | Copy Behavior | Move Behavior | Use Case | Example |
|-------|---------------|---------------|----------|---------|
| **Unique Ownership** | Deleted | Transfers ownership | Single owner at a time | unique_ptr, file handles |
| **Shared Ownership** | Increases ref count | Transfers ref-counted ptr | Multiple owners | shared_ptr |
| **Non-Owning Reference** | Copies reference | Copies reference | Observer pattern | weak_ptr, raw pointers |
| **Conditional Ownership** | Complex/deleted | Complex/transfers | Sometimes owns, sometimes refs | Optional ownership wrappers |
| **Value Semantics** | Deep copy | Move | Independent copies | String, vector |
| **Scope-Bound** | Deleted | Deleted | Tied to specific scope | Lock guards |

#### Exception Safety Patterns

| Pattern | Safety Level | Technique | Example |
|---------|--------------|-----------|---------|
| **RAII Members** | Basic | Use smart pointers for all resources | unique_ptr, shared_ptr members |
| **Member Init List** | Strong | Initialize in declaration order | All resources in initializer list |
| **Copy-and-Swap** | Strong | Copy to temp, swap, temp destroys old | Assignment operators |
| **Transaction** | Strong | Default rollback, explicit commit | Database operations |
| **Scope Guard** | Basic | Execute cleanup in destructor | Generic cleanup code |
| **Two-Phase Init** | Basic | Separate construction from init | Factory with optional return |
| **noexcept Moves** | Strong | Non-throwing move operations | Enable container strong guarantee |
