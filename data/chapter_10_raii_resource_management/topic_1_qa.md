## TOPIC: RAII Fundamentals & Exception Safety

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
