## TOPIC: Custom RAII Wrappers & Advanced Patterns

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
