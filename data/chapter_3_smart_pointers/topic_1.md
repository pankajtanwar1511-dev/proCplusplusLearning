## TOPIC: Smart Pointers in Modern C++

### THEORY_SECTION: Automatic Memory Management Through RAII

#### 1. Smart Pointer Types and Ownership Models

**Smart pointers** are C++11 template classes that provide automatic memory management through RAII (Resource Acquisition Is Initialization). They encapsulate raw pointers and automatically delete managed objects when no longer needed, eliminating manual memory management and preventing memory leaks, dangling pointers, and double deletion bugs.

**The Three Smart Pointer Types**

| Type | Ownership Model | Copyable | Movable | Size (Typical) | Overhead | Primary Use Case |
|------|-----------------|----------|---------|----------------|----------|------------------|
| `std::unique_ptr` | Exclusive (single owner) | ❌ No (deleted) | ✅ Yes | 8 bytes | Zero | Default choice for single ownership |
| `std::shared_ptr` | Shared (reference counted) | ✅ Yes | ✅ Yes | 16 bytes | Atomic ops, control block | Multiple owners of same resource |
| `std::weak_ptr` | Non-owning observer | ✅ Yes | ✅ Yes | 16 bytes | Minimal | Break cycles, observe shared objects |

**Ownership Semantics Comparison**

| Aspect | unique_ptr | shared_ptr | weak_ptr |
|--------|-----------|-----------|----------|
| **Ownership** | Exactly one owner | Multiple owners allowed | Does not own (observes only) |
| **Deletion Timing** | When unique_ptr destroyed | When last shared_ptr destroyed | Never deletes (non-owning) |
| **Copy Behavior** | Deleted at compile time | Creates another owner (refcount++) | Observes without owning |
| **Move Behavior** | Transfers ownership, source becomes null | Creates new owner via control block | No ownership to transfer |
| **Access** | Direct via `*` or `->` | Direct via `*` or `->` | Must `lock()` to get temporary shared_ptr |
| **Thread Safety** | Not thread-safe (single owner) | Control block ops are atomic | Control block ops are atomic |
| **Performance** | Same as raw pointer | Atomic operations overhead | Minimal overhead |
| **Memory Layout** | Just pointer (+ deleter if custom) | Pointer + control block pointer | Pointer + control block pointer |

**Code Example: Ownership Models**

```cpp
#include <memory>
#include <iostream>

void demonstrateOwnership() {
    // ✅ unique_ptr: Exclusive ownership
    std::unique_ptr<int> up1 = std::make_unique<int>(42);
    // auto up2 = up1;  // ❌ Compile error: copy deleted
    auto up2 = std::move(up1);  // ✅ Ownership transferred, up1 = nullptr

    // ✅ shared_ptr: Shared ownership
    std::shared_ptr<int> sp1 = std::make_shared<int>(100);
    auto sp2 = sp1;  // ✅ Both own the object
    auto sp3 = sp1;  // ✅ Now 3 owners (refcount = 3)
    std::cout << "Refcount: " << sp1.use_count() << "\n";  // 3

    // ✅ weak_ptr: Non-owning observation
    std::weak_ptr<int> wp = sp1;  // Observes, doesn't increment refcount
    std::cout << "Refcount after weak: " << sp1.use_count() << "\n";  // Still 3

    if (auto temp = wp.lock()) {  // ✅ Temporary shared_ptr for safe access
        std::cout << "Value: " << *temp << "\n";
    }
}
```

**Decision Tree: Which Smart Pointer to Use?**

| Question | Answer | Recommended Type |
|----------|--------|------------------|
| Do multiple parts of code need to share ownership? | No | `std::unique_ptr` |
| Do multiple parts of code need to share ownership? | Yes → Do you need to observe without owning? | No → `std::shared_ptr` |
| Do multiple parts of code need to share ownership? | Yes → Do you need to observe without owning? | Yes → `std::weak_ptr` |
| Managing arrays? | Yes → Fixed size known at compile time? | Yes → `std::array` |
| Managing arrays? | Yes → Fixed size known at compile time? | No → `std::vector` |
| Managing arrays? | Yes → Must use C-style array? | Yes → `std::unique_ptr<T[]>` |
| Managing non-memory resources (files, sockets)? | Yes | `unique_ptr` or `shared_ptr` with custom deleter |
| Interfacing with legacy API that returns raw pointer? | Yes | Wrap immediately in appropriate smart pointer |

---

#### 2. RAII and Automatic Resource Management

Smart pointers implement the RAII idiom by tying resource lifetime to object lifetime. Resources are acquired in constructors and automatically released in destructors, even when exceptions occur.

**How Smart Pointers Implement RAII**

| RAII Principle | unique_ptr | shared_ptr | Implementation Mechanism |
|----------------|-----------|-----------|-------------------------|
| **Acquire in Constructor** | Takes raw pointer or make_unique | Takes raw pointer or make_shared | Constructor stores pointer, initializes control block |
| **Release in Destructor** | Calls delete (or custom deleter) | Decrements refcount, deletes if 0 | Destructor invokes deleter when appropriate |
| **Exception Safety** | Destructor runs during stack unwinding | Destructor runs during stack unwinding | C++ guarantees destructor calls on scope exit |
| **Copy Semantics** | Deleted (exclusive ownership) | Increments reference count | Compiler-enforced or atomic operation |
| **Move Semantics** | Transfers ownership, nullifies source | Creates new owner, moves pointer | Efficient ownership transfer |
| **Custom Deleters** | Template parameter (zero overhead) | Type-erased in control block | Callable object invoked on deletion |

**RAII Benefits in Action**

| Problem with Manual Management | Smart Pointer Solution | Mechanism |
|-------------------------------|------------------------|-----------|
| **Memory Leaks** (forgot delete) | Automatic deletion in destructor | Compiler guarantees destructor call |
| **Double Delete** | unique_ptr prevents copies, shared_ptr uses refcount | Compile-time or runtime prevention |
| **Dangling Pointers** | Object deleted when last owner destroyed | Ownership tracking |
| **Exception Leaks** | Destructors run during stack unwinding | RAII guarantee |
| **Ownership Confusion** | Type encodes ownership semantics | unique vs shared vs weak |
| **Resource Ordering** | Destructors called in reverse construction order | LIFO stack unwinding |

**Code Example: RAII Exception Safety**

```cpp
#include <memory>
#include <iostream>
#include <stdexcept>

class Resource {
public:
    Resource(int id) : id_(id) {
        std::cout << "Resource " << id_ << " acquired\n";
    }
    ~Resource() {
        std::cout << "Resource " << id_ << " released\n";
    }
private:
    int id_;
};

// ❌ Manual management - exception unsafe
void manualApproach() {
    Resource* r1 = new Resource(1);
    Resource* r2 = new Resource(2);

    if (rand() % 2) {
        throw std::runtime_error("Error");  // ❌ Leak: r1 and r2 never deleted
    }

    delete r2;  // Never reached if exception thrown
    delete r1;
}

// ✅ Smart pointers - automatically exception-safe
void smartPointerApproach() {
    auto r1 = std::make_unique<Resource>(1);  // RAII object 1
    auto r2 = std::make_unique<Resource>(2);  // RAII object 2

    if (rand() % 2) {
        throw std::runtime_error("Error");  // ✅ OK: destructors run during unwinding
    }

    // Even if exception thrown, r2 then r1 automatically released (LIFO)
}
```

**Stack Unwinding and Smart Pointers**

When exceptions are thrown, C++ performs stack unwinding in reverse construction order (LIFO). Smart pointers leverage this guarantee:

```cpp
void demonstrateStackUnwinding() {
    auto ptr1 = std::make_unique<Resource>(1);  // Constructed first
    auto ptr2 = std::make_unique<Resource>(2);  // Constructed second
    auto ptr3 = std::make_unique<Resource>(3);  // Constructed third

    throw std::runtime_error("Error");

    // Stack unwinding order:
    // 1. ptr3 destroyed (releases Resource 3)
    // 2. ptr2 destroyed (releases Resource 2)
    // 3. ptr1 destroyed (releases Resource 1)
    // All cleanup automatic - no manual try-catch needed
}
```

---

#### 3. Modern C++ Best Practices with Smart Pointers

Modern C++ strongly favors smart pointers over manual memory management. Raw owning pointers (where the pointer is responsible for deletion) are considered a code smell.

**The Smart Pointer Hierarchy of Preference**

| Priority | Choice | When to Use | Reasoning |
|----------|--------|-------------|-----------|
| **1st** | `std::unique_ptr` | Default for all dynamic allocation | Zero overhead, clear ownership, move-only |
| **2nd** | `std::shared_ptr` | Only when genuinely need shared ownership | Reference counting has cost |
| **3rd** | `std::weak_ptr` | Break cycles, caching, observation | Prevents leaks in circular structures |
| **4th** | Raw pointer/reference | Non-owning temporary access | For borrowing, not owning |
| **Never** | Raw owning pointer | Legacy code only | Leak-prone, exception-unsafe |

**Factory Function Patterns**

| Pattern | Return Type | When to Use | Example |
|---------|------------|-------------|---------|
| **Exclusive ownership** | `unique_ptr<T>` | Single owner, caller takes ownership | `auto conn = createConnection();` |
| **Shared ownership** | `shared_ptr<T>` | Multiple owners expected | `auto cache = getSharedCache();` |
| **Polymorphic factory** | `unique_ptr<Base>` | Return derived via base pointer | `auto sensor = createSensor(type);` |
| **Optional ownership** | `unique_ptr<T>` or `nullptr` | May fail to create | `auto obj = tryCreate();` |

**Code Example: Factory Functions with Smart Pointers**

```cpp
// ✅ Best practice: Return unique_ptr for exclusive ownership
std::unique_ptr<Connection> createConnection(const std::string& url) {
    auto conn = std::make_unique<Connection>(url);
    conn->configure();
    return conn;  // Move, no copy
}

// ✅ Return shared_ptr when multiple owners genuinely needed
std::shared_ptr<Logger> getLogger() {
    static auto logger = std::make_shared<Logger>();  // Singleton pattern
    return logger;  // Multiple callers share same logger
}

// ✅ Polymorphic factory with unique_ptr
std::unique_ptr<Sensor> createSensor(SensorType type) {
    switch (type) {
        case SensorType::LIDAR:
            return std::make_unique<LidarSensor>();
        case SensorType::CAMERA:
            return std::make_unique<CameraSensor>();
    }
}

void usage() {
    auto conn = createConnection("http://api.example.com");
    // Clear ownership transfer, automatic cleanup

    auto logger = getLogger();
    auto logger2 = getLogger();  // Shares same instance

    auto sensor = createSensor(SensorType::LIDAR);
    // Caller owns sensor, can move or store
}
```

**Function Parameter Guidelines**

| Scenario | Parameter Type | Rationale |
|----------|---------------|-----------|
| **Non-owning use** | `T*` or `T&` | Most efficient, clear non-ownership |
| **Take ownership (sink)** | `unique_ptr<T>` by value | Explicit ownership transfer via move |
| **Share ownership** | `shared_ptr<T>` by value | Function becomes co-owner |
| **Observe, don't own** | `const shared_ptr<T>&` | No refcount changes, read-only |
| **Optional parameter** | `T* = nullptr` | Can be null, non-owning |
| **Transfer or share** | `unique_ptr<T>` or `shared_ptr<T>` | Caller decides via move or copy |

**Code Example: Parameter Conventions**

```cpp
// ✅ Non-owning use: raw pointer or reference
void processData(const Data* data) {
    if (data) {
        // Temporary use only, doesn't extend lifetime
    }
}

// ✅ Take ownership: unique_ptr by value
void storeConnection(std::unique_ptr<Connection> conn) {
    connections_.push_back(std::move(conn));  // Takes ownership
}

// ✅ Share ownership: shared_ptr by value
void registerCallback(std::shared_ptr<Callback> callback) {
    callbacks_.push_back(callback);  // Shares ownership
}

// ✅ Observe without owning: const reference
void logStats(const std::shared_ptr<Stats>& stats) {
    std::cout << stats->count();  // No refcount change
}

// ❌ Wrong: shared_ptr by value when not needed
void wrongApproach(std::shared_ptr<Data> data) {  // Unnecessary atomic ops
    data->process();  // Just using, not storing
}
```

**Smart Pointers and the Rule of Zero**

When all resources are managed by smart pointers and standard containers, classes follow the **Rule of Zero**: no custom destructor, copy constructor, move constructor, copy assignment, or move assignment needed.

**Rule of Zero with Smart Pointers**

| Without Smart Pointers (Rule of Five) | With Smart Pointers (Rule of Zero) |
|---------------------------------------|-----------------------------------|
| Manual destructor `delete ptr_;` | Compiler-generated destructor works |
| Custom copy constructor (deep copy) | Compiler-generated copy works |
| Custom copy assignment | Compiler-generated assignment works |
| Custom move constructor | Compiler-generated move works |
| Custom move assignment | Compiler-generated move assignment works |
| Prone to bugs (forgot one? resource leak) | Cannot have bugs (nothing to forget) |

**Code Example: Rule of Zero**

```cpp
// ❌ Manual management: Rule of Five required
class ManualWidget {
    Connection* conn_;
    Data* data_;
public:
    ManualWidget() : conn_(new Connection()), data_(new Data()) {}
    ~ManualWidget() { delete data_; delete conn_; }
    // Need custom copy constructor, copy assignment, move constructor, move assignment
    // Forgetting any one = bugs
};

// ✅ Smart pointers: Rule of Zero
class ModernWidget {
    std::unique_ptr<Connection> conn_ = std::make_unique<Connection>();
    std::unique_ptr<Data> data_ = std::make_unique<Data>();
    // Compiler generates all special members correctly
    // Move-only due to unique_ptr (safe by default)
    // Zero manual memory management
};
```

**Key Takeaway**: Modern C++ eliminates manual memory management through smart pointers. Default to `unique_ptr`, upgrade to `shared_ptr` only when genuinely needed, use `weak_ptr` to break cycles. Raw pointers are for non-owning temporary access only, never for ownership. Smart pointers enable the Rule of Zero, making code safer, more maintainable, and exception-safe by default.

---

### EDGE_CASES: Complex Scenarios and Pitfalls

#### Edge Case 1: Circular References with shared_ptr

When two or more objects hold shared_ptrs to each other, they create a reference cycle where reference counts never reach zero, causing a memory leak. This commonly occurs in bidirectional relationships like parent-child hierarchies, doubly-linked lists, observer patterns, and graph structures.

```cpp
struct Node {
    std::shared_ptr<Node> next;
    ~Node() { std::cout << "Node destroyed\n"; }
};

void createLeak() {
    auto a = std::make_shared<Node>();
    auto b = std::make_shared<Node>();
    
    a->next = b;  // b's use_count becomes 2
    b->next = a;  // a's use_count becomes 2
    
    // When a and b go out of scope:
    // - a's destructor releases its shared_ptr to b
    // - b's destructor would release its shared_ptr to a
    // - But destructors never run because use_count stays at 1
    // ❌ Memory leak: neither object is ever deleted
}
```

The cycle prevention requires replacing one direction with weak_ptr, breaking the strong ownership loop. The choice of which direction should be weak depends on the natural ownership relationship—typically back-pointers or parent-references become weak_ptrs.

#### Edge Case 2: Creating shared_ptr from unique_ptr

Unique_ptr can be implicitly converted to shared_ptr through move semantics, providing a convenient upgrade path when ownership needs change. The conversion transfers ownership from the unique_ptr to a new shared_ptr with initial reference count of 1.

```cpp
std::unique_ptr<Widget> unique = std::make_unique<Widget>();
std::shared_ptr<Widget> shared = std::move(unique);  // ✅ Ownership transferred
// unique is now nullptr

// ❌ Cannot go backwards:
// std::unique_ptr<Widget> unique2 = shared;  // Compile error
```

This one-way conversion reflects the ownership semantics: exclusive ownership can become shared, but shared ownership cannot become exclusive without explicit coordination (checking use_count() == 1).

#### Edge Case 3: Polymorphic Deletion Without Virtual Destructor

Smart pointers correctly support polymorphic deletion only when the base class has a virtual destructor. Without it, deleting through a base pointer causes undefined behavior by only calling the base destructor.

```cpp
struct Base {
    ~Base() { std::cout << "Base destroyed\n"; }  // ❌ Not virtual
};

struct Derived : Base {
    int* data = new int[100];
    ~Derived() { 
        delete[] data;
        std::cout << "Derived destroyed\n"; 
    }
};

void leak() {
    std::unique_ptr<Base> ptr = std::make_unique<Derived>();
    // ❌ When ptr destroyed, only ~Base() called
    // Derived's destructor never runs → data leaks
}

void correct() {
    struct Base { virtual ~Base() = default; };  // ✅ Virtual destructor
    std::unique_ptr<Base> ptr = std::make_unique<Derived>();
    // ✅ Correct polymorphic deletion
}
```

This is one of the few cases where smart pointers don't automatically solve memory problems—the class hierarchy must be correctly designed with virtual destructors.

#### Edge Case 4: Aliasing Constructor of shared_ptr

The shared_ptr aliasing constructor allows creating a shared_ptr that participates in reference counting for one object but provides access to a different object. This enables managing an object's lifetime while exposing a sub-object.

```cpp
struct Widget {
    int x, y;
};

auto widget = std::make_shared<Widget>();
std::shared_ptr<int> xptr(widget, &widget->x);  // Aliasing constructor

// xptr points to x but keeps entire Widget alive
// Useful for: exposing members, arrays, pimpl patterns
```

The aliasing constructor takes two parameters: a shared_ptr to keep alive and a pointer to expose. When the last aliasing or original shared_ptr is destroyed, the original object is deleted.

#### Edge Case 5: Double Ownership Through get()

The get() method returns the raw pointer without transferring ownership or affecting reference count. Creating a second smart pointer from this raw pointer creates double ownership and causes double deletion.

```cpp
auto ptr1 = std::make_unique<int>(42);
int* raw = ptr1.get();  // ✅ Safe: borrow only

std::unique_ptr<int> ptr2(raw);  // ❌ Double ownership!
// When ptr1 and ptr2 destroyed → double delete → crash
```

The get() method should only be used for borrowing when interfacing with APIs that require raw pointers. Never create a second owning smart pointer from the result of get().

#### Edge Case 6: weak_ptr Promotion Race Condition

Between checking expired() and calling lock(), the object can be destroyed by another thread. Always use lock() directly rather than checking expired() first.

```cpp
std::weak_ptr<Widget> weak;

// ❌ Race condition:
if (!weak.expired()) {
    auto shared = weak.lock();  // Might be null if destroyed between checks
    shared->use();              // ❌ Potential null dereference
}

// ✅ Correct:
if (auto shared = weak.lock()) {
    shared->use();  // Safe: object kept alive during this scope
}
```

The lock() method atomically checks validity and increments the reference count, eliminating the race condition window.

#### Edge Case 7: make_shared Exception Safety vs Custom Allocator

While make_shared provides exception safety and performance benefits, it prevents custom allocators and can delay memory reclamation when weak_ptrs outlive all shared_ptrs.

```cpp
// make_shared allocates object + control block together
auto p1 = std::make_shared<Large>();  // One allocation

// Separate allocations allow independent lifetimes
std::shared_ptr<Large> p2(new Large());  // Two allocations

// With make_shared, if weak_ptrs exist, memory not freed
// until weak_ptrs destroyed, even though object was deleted
```

For very large objects or when precise memory control is needed, the separate allocation pattern may be preferable despite slightly lower performance.

---

### CODE_EXAMPLES: Practical Demonstrations

#### Example 1: Basic unique_ptr Ownership Transfer

```cpp
#include <memory>
#include <iostream>

struct Resource {
    int id;
    Resource(int i) : id(i) { std::cout << "Resource " << id << " created\n"; }
    ~Resource() { std::cout << "Resource " << id << " destroyed\n"; }
};

int main() {
    std::unique_ptr<Resource> ptr1 = std::make_unique<Resource>(1);
    
    // std::unique_ptr<Resource> ptr2 = ptr1;  // ❌ Copy deleted
    std::unique_ptr<Resource> ptr2 = std::move(ptr1);  // ✅ Ownership transfer
    
    if (!ptr1) {
        std::cout << "ptr1 is now null\n";
    }
    
    std::cout << "ptr2 owns resource: " << ptr2->id << "\n";
}  // Resource destroyed when ptr2 goes out of scope
```

Unique_ptr enforces exclusive ownership through deleted copy constructor and copy assignment operator. Ownership can only be transferred using std::move, which leaves the source pointer in a null state. This compile-time enforcement prevents accidental double ownership.

#### Example 2: shared_ptr Reference Counting

```cpp
#include <memory>
#include <iostream>

class Widget {
public:
    Widget(const std::string& n) : name(n) {
        std::cout << "Widget " << name << " constructed\n";
    }
    ~Widget() {
        std::cout << "Widget " << name << " destroyed\n";
    }
private:
    std::string name;
};

void demonstrate() {
    std::shared_ptr<Widget> sp1 = std::make_shared<Widget>("A");
    std::cout << "Count: " << sp1.use_count() << "\n";  // 1
    
    {
        std::shared_ptr<Widget> sp2 = sp1;  // ✅ Copy increments count
        std::shared_ptr<Widget> sp3 = sp1;
        std::cout << "Count: " << sp1.use_count() << "\n";  // 3
    }  // sp2 and sp3 destroyed, count decremented
    
    std::cout << "Count: " << sp1.use_count() << "\n";  // 1
}  // sp1 destroyed, count reaches 0, Widget deleted
```

The shared_ptr maintains a reference count in its control block, atomically incremented on copy and decremented on destruction. When the count reaches zero, the managed object is deleted. Multiple shared_ptrs can safely own the same object across different scopes and threads.

#### Example 3: Breaking Circular References with weak_ptr

```cpp
#include <memory>
#include <iostream>
#include <string>

struct Node {
    std::string name;
    std::shared_ptr<Node> next;      // Strong reference forward
    std::weak_ptr<Node> prev;        // Weak reference backward
    
    Node(const std::string& n) : name(n) {
        std::cout << "Node " << name << " created\n";
    }
    ~Node() {
        std::cout << "Node " << name << " destroyed\n";
    }
};

int main() {
    auto a = std::make_shared<Node>("A");
    auto b = std::make_shared<Node>("B");
    
    a->next = b;        // a owns b: b.use_count = 2
    b->prev = a;        // b observes a: a.use_count = 1
    
    std::cout << "a count: " << a.use_count() << "\n";  // 1
    std::cout << "b count: " << b.use_count() << "\n";  // 2
    
    // Access prev through weak_ptr
    if (auto prevNode = b->prev.lock()) {
        std::cout << "b's prev is: " << prevNode->name << "\n";
    }
}  // Both nodes properly destroyed: no cycle!
```

Using weak_ptr for the backward reference breaks the circular dependency. When a and b go out of scope, a can be destroyed (count reaches 0), which releases its shared_ptr to b, allowing b to be destroyed. The weak_ptr prevents the ownership cycle that would leak memory.

#### Example 4: Custom Deleters for Non-Memory Resources

```cpp
#include <memory>
#include <cstdio>
#include <iostream>

// Custom deleter for FILE*
struct FileCloser {
    void operator()(FILE* f) const {
        if (f) {
            std::cout << "Closing file\n";
            fclose(f);
        }
    }
};

// Using lambda with unique_ptr
void useUniquePtr() {
    auto closer = [](FILE* f) {
        if (f) {
            std::cout << "Lambda closing file\n";
            fclose(f);
        }
    };
    
    std::unique_ptr<FILE, decltype(closer)> file(
        fopen("test.txt", "w"), 
        closer
    );
    
    if (file) {
        fprintf(file.get(), "Hello World\n");
    }
}  // File automatically closed via custom deleter

// Using lambda with shared_ptr  
void useSharedPtr() {
    std::shared_ptr<FILE> file(
        fopen("test.txt", "r"),
        [](FILE* f) {
            if (f) {
                std::cout << "Shared_ptr closing file\n";
                fclose(f);
            }
        }
    );
}  // File automatically closed
```

Custom deleters enable smart pointers to manage any resource type, not just heap memory. For unique_ptr, the deleter type is part of the template parameters, maintaining zero overhead. For shared_ptr, the deleter is type-erased in the control block, adding slight overhead but providing type flexibility.

#### Example 5: Managing Arrays with Smart Pointers

```cpp
#include <memory>
#include <iostream>

void uniquePtrArray() {
    // ✅ Correct: unique_ptr<T[]> for arrays
    std::unique_ptr<int[]> arr(new int[10]);
    
    // Array access syntax works
    for (int i = 0; i < 10; ++i) {
        arr[i] = i * 10;
    }
    
    std::cout << "arr[5] = " << arr[5] << "\n";  // 50
}  // Correctly calls delete[]

void sharedPtrArray() {
    // Pre-C++17: Need custom deleter
    std::shared_ptr<int> arr(
        new int[10],
        [](int* p) { delete[] p; }  // ✅ Custom deleter
    );
    
    // ❌ No array syntax: arr[i] doesn't work
    // Must use pointer arithmetic
    
    // ✅ Better: Use vector
    auto vec = std::make_shared<std::vector<int>>(10);
    (*vec)[5] = 50;
}

void avoidArrayIssues() {
    // ✅ Best practice: Use vector
    std::unique_ptr<std::vector<int>> vec = 
        std::make_unique<std::vector<int>>(10);
    
    (*vec)[5] = 50;
    vec->push_back(60);  // Resizable
}
```

The unique_ptr has a partial specialization for arrays (unique_ptr<T[]>) that correctly uses delete[] instead of delete. Shared_ptr gained similar support in C++17. However, using std::vector wrapped in a smart pointer is generally preferable, providing bounds checking, size tracking, and resizability.

#### Example 6: Factory Functions Returning Ownership

```cpp
#include <memory>
#include <string>

class Connection {
    std::string url;
public:
    Connection(const std::string& u) : url(u) {}
    void send(const std::string& data) {}
};

// ✅ Return unique_ptr for exclusive ownership transfer
std::unique_ptr<Connection> createConnection(const std::string& url) {
    auto conn = std::make_unique<Connection>(url);
    // Setup, configuration...
    return conn;  // Move, no copy
}

// ✅ Return shared_ptr when multiple owners expected
std::shared_ptr<Connection> createSharedConnection(const std::string& url) {
    return std::make_shared<Connection>(url);
}

void use() {
    auto conn1 = createConnection("http://api.example.com");
    conn1->send("data");
    // Clear ownership transfer, automatic cleanup
    
    auto conn2 = createSharedConnection("http://api.example.com");
    auto conn3 = conn2;  // Multiple owners
}
```

Factory functions returning smart pointers clearly communicate ownership transfer. Returning unique_ptr is preferred as it's more restrictive—callers can always convert to shared_ptr if needed, but not vice versa. The return value optimization (RVO) and move semantics make this pattern efficient with no unnecessary copies.

#### Example 7: Using weak_ptr for Caching

```cpp
#include <memory>
#include <map>
#include <string>
#include <iostream>

class ExpensiveObject {
public:
    ExpensiveObject(const std::string& id) : id_(id) {
        std::cout << "Creating expensive object: " << id_ << "\n";
    }
    ~ExpensiveObject() {
        std::cout << "Destroying expensive object: " << id_ << "\n";
    }
private:
    std::string id_;
};

class ObjectCache {
    std::map<std::string, std::weak_ptr<ExpensiveObject>> cache_;
    
public:
    std::shared_ptr<ExpensiveObject> get(const std::string& id) {
        // Try to get from cache
        auto it = cache_.find(id);
        if (it != cache_.end()) {
            if (auto cached = it->second.lock()) {
                std::cout << "Cache hit for: " << id << "\n";
                return cached;  // Return existing object
            }
        }
        
        // Create new object
        std::cout << "Cache miss for: " << id << "\n";
        auto obj = std::make_shared<ExpensiveObject>(id);
        cache_[id] = obj;  // Store weak_ptr
        return obj;
    }
};

void demonstrateCache() {
    ObjectCache cache;
    
    {
        auto obj1 = cache.get("item1");  // Cache miss, creates
        auto obj2 = cache.get("item1");  // Cache hit, reuses
    }  // Objects destroyed when last shared_ptr released
    
    auto obj3 = cache.get("item1");  // Cache miss, creates new
}
```

Using weak_ptr for caching allows objects to be cached without preventing their destruction. When no external shared_ptrs exist, the object is automatically cleaned up. Subsequent cache accesses detect the expired weak_ptr and create a fresh object, providing automatic cache invalidation.

#### Example 8: Exception Safety with Smart Pointers

```cpp
#include <memory>
#include <stdexcept>
#include <iostream>

class Resource {
public:
    Resource() { std::cout << "Resource acquired\n"; }
    ~Resource() { std::cout << "Resource released\n"; }
};

void riskyOperation() {
    if (rand() % 2) {
        throw std::runtime_error("Random failure");
    }
}

// ❌ Not exception-safe
void rawPointerVersion() {
    Resource* r = new Resource();
    try {
        riskyOperation();  // May throw
        delete r;
    } catch(...) {
        delete r;  // Must duplicate cleanup
        throw;
    }
}

// ✅ Exception-safe with smart pointer
void smartPointerVersion() {
    std::unique_ptr<Resource> r = std::make_unique<Resource>();
    riskyOperation();  // If throws, destructor still runs
    // No explicit cleanup needed
}

// ✅ Exception-safe in function parameters
void processResources(
    std::unique_ptr<Resource> r1,
    std::unique_ptr<Resource> r2
) {
    riskyOperation();
}

void callProcess() {
    // ✅ Exception-safe: make_unique guarantees no leaks
    processResources(
        std::make_unique<Resource>(),
        std::make_unique<Resource>()
    );
}
```

Smart pointers provide automatic exception safety through RAII. When exceptions occur, stack unwinding invokes destructors of all stack-allocated objects, including smart pointers, which then properly clean up their managed resources. This eliminates the need for try-catch blocks purely for resource cleanup.

#### Example 9: Autonomous Vehicle - Sensor Fusion System with Smart Pointers

```cpp
#include <iostream>
#include <memory>
#include <vector>
#include <string>
#include <map>
using namespace std;

// ========= Base Sensor Interface =========

class ISensor {
public:
    virtual string getType() const = 0;
    virtual void calibrate() = 0;
    virtual void readData() = 0;
    virtual ~ISensor() = default;  // ✅ Virtual destructor
};

// ========= Concrete Sensor Types =========

class LidarSensor : public ISensor {
private:
    string sensor_id;
    int num_points;
    bool calibrated;

public:
    explicit LidarSensor(const string& id, int points)
        : sensor_id(id), num_points(points), calibrated(false) {
        cout << "LidarSensor(" << sensor_id << "): Created with "
             << num_points << " points capacity\n";
    }

    ~LidarSensor() override {
        cout << "LidarSensor(" << sensor_id << "): Destroyed\n";
    }

    string getType() const override { return "LiDAR"; }

    void calibrate() override {
        calibrated = true;
        cout << "LidarSensor(" << sensor_id << "): Calibrated\n";
    }

    void readData() override {
        if (calibrated) {
            cout << "LidarSensor(" << sensor_id << "): Reading "
                 << num_points << " point cloud\n";
        }
    }
};

class CameraSensor : public ISensor {
private:
    string sensor_id;
    int resolution_width;
    int resolution_height;
    bool calibrated;

public:
    CameraSensor(const string& id, int width, int height)
        : sensor_id(id), resolution_width(width),
          resolution_height(height), calibrated(false) {
        cout << "CameraSensor(" << sensor_id << "): Created "
             << width << "x" << height << "\n";
    }

    ~CameraSensor() override {
        cout << "CameraSensor(" << sensor_id << "): Destroyed\n";
    }

    string getType() const override { return "Camera"; }

    void calibrate() override {
        calibrated = true;
        cout << "CameraSensor(" << sensor_id << "): Calibrated\n";
    }

    void readData() override {
        if (calibrated) {
            cout << "CameraSensor(" << sensor_id << "): Capturing image\n";
        }
    }
};

// ========= Sensor Manager with unique_ptr (Single Ownership) =========

class SensorManager {
private:
    vector<unique_ptr<ISensor>> sensors;  // ✅ Exclusive ownership
    string manager_id;

public:
    explicit SensorManager(const string& id) : manager_id(id) {
        cout << "\nSensorManager(" << manager_id << "): Created\n";
    }

    ~SensorManager() {
        cout << "SensorManager(" << manager_id << "): Shutting down with "
             << sensors.size() << " sensors\n";
        // ✅ Sensors automatically deleted in reverse order
    }

    // ✅ Takes ownership via move
    void addSensor(unique_ptr<ISensor> sensor) {
        cout << "SensorManager: Adding " << sensor->getType() << " sensor\n";
        sensors.push_back(move(sensor));
    }

    void calibrateAll() {
        cout << "\n--- Calibrating All Sensors ---\n";
        for (auto& sensor : sensors) {
            sensor->calibrate();
        }
    }

    void readAllData() {
        cout << "\n--- Reading All Sensor Data ---\n";
        for (auto& sensor : sensors) {
            sensor->readData();
        }
    }

    size_t sensorCount() const { return sensors.size(); }
};

// ========= Sensor Data Cache with shared_ptr (Shared Ownership) =========

class SensorDataCache {
public:
    struct CachedData {
        string sensor_id;
        double timestamp;
        int data_size;

        CachedData(const string& id, double ts, int size)
            : sensor_id(id), timestamp(ts), data_size(size) {
            cout << "CachedData(" << sensor_id << "): Allocated "
                 << data_size << " bytes\n";
        }

        ~CachedData() {
            cout << "CachedData(" << sensor_id << "): Freed "
                 << data_size << " bytes\n";
        }
    };

private:
    // ✅ weak_ptr for cache: doesn't prevent deletion
    map<string, weak_ptr<CachedData>> cache;

public:
    // ✅ Returns shared_ptr for shared access
    shared_ptr<CachedData> getData(const string& sensor_id,
                                    double timestamp,
                                    int data_size) {
        // Try to get from cache
        auto it = cache.find(sensor_id);
        if (it != cache.end()) {
            if (auto cached = it->second.lock()) {  // ✅ Atomic lock
                cout << "Cache HIT for " << sensor_id << "\n";
                return cached;
            }
        }

        // Cache miss - create new data
        cout << "Cache MISS for " << sensor_id << "\n";
        auto data = make_shared<CachedData>(sensor_id, timestamp, data_size);
        cache[sensor_id] = data;  // ✅ Store weak_ptr
        return data;
    }

    void printCacheStatus() {
        cout << "\n--- Cache Status ---\n";
        int active = 0, expired = 0;
        for (const auto& [id, weak] : cache) {
            if (weak.expired()) {
                cout << "  " << id << ": EXPIRED\n";
                expired++;
            } else {
                cout << "  " << id << ": ACTIVE (refs: "
                     << weak.use_count() << ")\n";
                active++;
            }
        }
        cout << "Total: " << active << " active, "
             << expired << " expired\n";
    }
};

// ========= Sensor Fusion Engine with Observer Pattern =========

class FusionEngine : public enable_shared_from_this<FusionEngine> {
private:
    string engine_id;
    vector<weak_ptr<ISensor>> registered_sensors;  // ✅ Non-owning observers

public:
    explicit FusionEngine(const string& id) : engine_id(id) {
        cout << "\nFusionEngine(" << engine_id << "): Created\n";
    }

    ~FusionEngine() {
        cout << "FusionEngine(" << engine_id << "): Destroyed\n";
    }

    // ✅ Register sensor as weak observer
    void registerSensor(shared_ptr<ISensor> sensor) {
        cout << "FusionEngine: Registering " << sensor->getType()
             << " sensor\n";
        registered_sensors.push_back(sensor);  // ✅ weak_ptr doesn't own
    }

    void fuseData() {
        cout << "\n--- Fusion Engine Processing ---\n";
        int active = 0, removed = 0;

        for (auto& weak : registered_sensors) {
            if (auto sensor = weak.lock()) {  // ✅ Check if still alive
                sensor->readData();
                active++;
            } else {
                removed++;
            }
        }

        cout << "Fusion complete: " << active << " active sensors, "
             << removed << " removed sensors\n";
    }

    // ✅ Safe way to get shared_ptr from this
    shared_ptr<FusionEngine> getSharedPtr() {
        return shared_from_this();
    }
};

// ========= Custom Deleter Example for Hardware Resources =========

struct HardwareResource {
    int device_id;

    explicit HardwareResource(int id) : device_id(id) {
        cout << "HardwareResource: Opened device " << device_id << "\n";
    }

    ~HardwareResource() {
        cout << "HardwareResource: Closed device " << device_id << "\n";
    }
};

auto createHardwareResource(int device_id) {
    // ✅ Custom deleter for special cleanup
    auto deleter = [device_id](HardwareResource* hw) {
        cout << "Custom Deleter: Performing special cleanup for device "
             << device_id << "\n";
        delete hw;
    };

    return unique_ptr<HardwareResource, decltype(deleter)>(
        new HardwareResource(device_id),
        deleter
    );
}

// ========= Main: Comprehensive Smart Pointer Demo =========

int main() {
    cout << "========== Autonomous Vehicle Smart Pointer Demo ==========\n";

    {
        cout << "\n### PART 1: unique_ptr for Exclusive Ownership ###\n";

        SensorManager manager("primary_manager");

        // ✅ Factory pattern with unique_ptr
        manager.addSensor(make_unique<LidarSensor>("lidar_front", 64000));
        manager.addSensor(make_unique<CameraSensor>("cam_left", 1920, 1080));
        manager.addSensor(make_unique<LidarSensor>("lidar_rear", 32000));

        manager.calibrateAll();
        manager.readAllData();

        cout << "\nManager has " << manager.sensorCount() << " sensors\n";
        // ✅ All sensors automatically deleted when manager destroyed
    }

    {
        cout << "\n### PART 2: shared_ptr for Shared Ownership ###\n";

        SensorDataCache cache;

        // Multiple owners of sensor data
        {
            auto data1 = cache.getData("lidar_front", 1.0, 64000);
            auto data2 = cache.getData("lidar_front", 1.0, 64000);  // Cache hit
            cout << "data1 refs: " << data1.use_count() << "\n";  // 2 (+ cache weak)

            cache.printCacheStatus();
        }  // data1 and data2 destroyed

        cache.printCacheStatus();  // Cache entry expired
    }

    {
        cout << "\n### PART 3: weak_ptr to Break Circular References ###\n";

        // ✅ Create sensors with shared ownership
        auto lidar = make_shared<LidarSensor>("lidar_shared", 10000);
        auto camera = make_shared<CameraSensor>("cam_shared", 1280, 720);

        // ✅ FusionEngine uses weak_ptr (non-owning)
        auto fusion = make_shared<FusionEngine>("main_fusion");
        fusion->registerSensor(lidar);
        fusion->registerSensor(camera);

        lidar->calibrate();
        camera->calibrate();

        fusion->fuseData();

        cout << "\n--- Releasing lidar ownership ---\n";
        lidar.reset();  // Destroy lidar sensor

        fusion->fuseData();  // Fusion detects removed sensor

        // ✅ No circular reference leak!
    }

    {
        cout << "\n### PART 4: Custom Deleters for Hardware ###\n";

        auto hw1 = createHardwareResource(101);
        auto hw2 = createHardwareResource(102);

        cout << "\nHardware resources in use...\n";
        // ✅ Custom deleters called automatically
    }

    {
        cout << "\n### PART 5: Converting unique_ptr to shared_ptr ###\n";

        unique_ptr<ISensor> unique_sensor =
            make_unique<LidarSensor>("lidar_convertible", 5000);

        cout << "Converting to shared_ptr...\n";
        shared_ptr<ISensor> shared_sensor = move(unique_sensor);  // ✅ Allowed

        cout << "unique_sensor is now: "
             << (unique_sensor ? "valid" : "null") << "\n";
        cout << "shared_sensor refs: " << shared_sensor.use_count() << "\n";

        // ❌ Cannot convert back: shared_ptr → unique_ptr not allowed
    }

    cout << "\n========== Demo Complete (All Smart Pointers Cleaned Up) ==========\n";
    return 0;
}
```

**Expected Output:**
```
========== Autonomous Vehicle Smart Pointer Demo ==========

### PART 1: unique_ptr for Exclusive Ownership ###

SensorManager(primary_manager): Created
LidarSensor(lidar_front): Created with 64000 points capacity
SensorManager: Adding LiDAR sensor
CameraSensor(cam_left): Created 1920x1080
SensorManager: Adding Camera sensor
LidarSensor(lidar_rear): Created with 32000 points capacity
SensorManager: Adding LiDAR sensor

--- Calibrating All Sensors ---
LidarSensor(lidar_front): Calibrated
CameraSensor(cam_left): Calibrated
LidarSensor(lidar_rear): Calibrated

--- Reading All Sensor Data ---
LidarSensor(lidar_front): Reading 64000 point cloud
CameraSensor(cam_left): Capturing image
LidarSensor(lidar_rear): Reading 32000 point cloud

Manager has 3 sensors
SensorManager(primary_manager): Shutting down with 3 sensors
LidarSensor(lidar_rear): Destroyed
CameraSensor(cam_left): Destroyed
LidarSensor(lidar_front): Destroyed

### PART 2: shared_ptr for Shared Ownership ###
Cache MISS for lidar_front
CachedData(lidar_front): Allocated 64000 bytes
Cache HIT for lidar_front
data1 refs: 2

--- Cache Status ---
  lidar_front: ACTIVE (refs: 2)
Total: 1 active, 0 expired
CachedData(lidar_front): Freed 64000 bytes

--- Cache Status ---
  lidar_front: EXPIRED
Total: 0 active, 1 expired

### PART 3: weak_ptr to Break Circular References ###
LidarSensor(lidar_shared): Created with 10000 points capacity
CameraSensor(cam_shared): Created 1280x720

FusionEngine(main_fusion): Created
FusionEngine: Registering LiDAR sensor
FusionEngine: Registering Camera sensor
LidarSensor(lidar_shared): Calibrated
CameraSensor(cam_shared): Calibrated

--- Fusion Engine Processing ---
LidarSensor(lidar_shared): Reading 10000 point cloud
CameraSensor(cam_shared): Capturing image
Fusion complete: 2 active sensors, 0 removed sensors

--- Releasing lidar ownership ---
LidarSensor(lidar_shared): Destroyed

--- Fusion Engine Processing ---
CameraSensor(cam_shared): Capturing image
Fusion complete: 1 active sensors, 1 removed sensors
CameraSensor(cam_shared): Destroyed
FusionEngine(main_fusion): Destroyed

### PART 4: Custom Deleters for Hardware ###
HardwareResource: Opened device 101
HardwareResource: Opened device 102

Hardware resources in use...
Custom Deleter: Performing special cleanup for device 102
HardwareResource: Closed device 102
Custom Deleter: Performing special cleanup for device 101
HardwareResource: Closed device 101

### PART 5: Converting unique_ptr to shared_ptr ###
LidarSensor(lidar_convertible): Created with 5000 points capacity
Converting to shared_ptr...
unique_sensor is now: null
shared_sensor refs: 1
LidarSensor(lidar_convertible): Destroyed

========== Demo Complete (All Smart Pointers Cleaned Up) ==========
```

**What This Example Demonstrates:**

1. **unique_ptr for Exclusive Ownership**:
   - Sensor manager exclusively owns sensors
   - Move semantics for ownership transfer
   - Automatic cleanup in reverse order
   - Zero overhead polymorphism with virtual destructors

2. **shared_ptr for Shared Ownership**:
   - Multiple owners of cached sensor data
   - Reference counting with use_count()
   - make_shared for efficient allocation
   - Automatic deletion when last owner destroyed

3. **weak_ptr to Break Cycles**:
   - Cache uses weak_ptr to avoid preventing deletion
   - Fusion engine observes sensors without owning them
   - Automatic detection of removed sensors via expired()
   - lock() for safe temporary access

4. **Observer Pattern with weak_ptr**:
   - Sensors don't own the fusion engine
   - Fusion engine doesn't own sensors
   - No circular reference memory leaks
   - Graceful handling of destroyed objects

5. **Custom Deleters**:
   - Special cleanup for hardware resources
   - Lambda deleters with captured state
   - Type-safe resource management
   - RAII for non-memory resources

6. **Smart Pointer Conversions**:
   - unique_ptr → shared_ptr via move (ownership upgrade)
   - Cannot convert back (safety preserved)
   - nullptr checking after move

7. **enable_shared_from_this**:
   - Safe way to get shared_ptr from this
   - Required for callbacks and registration
   - Prevents double control block creation

**Why This Matters for Autonomous Vehicles**: Sensor fusion systems need complex ownership relationships. LiDAR and camera data must be shared across perception, localization, and planning modules (shared_ptr). The fusion engine observes sensors without preventing their removal (weak_ptr). Sensor managers exclusively own hardware interfaces (unique_ptr). Smart pointers provide automatic, exception-safe resource management critical for safety-certified systems that must handle sensor failures gracefully.

**Key Takeaways**:
- **unique_ptr** = default choice for single ownership
- **shared_ptr** = use only when genuinely need shared ownership
- **weak_ptr** = break cycles and provide non-owning observation
- **Virtual destructors** required for polymorphic deletion
- **make_unique/make_shared** = always prefer over direct new
- **Custom deleters** = manage any resource type with smart pointers

---

### INTERVIEW_QA: Comprehensive Smart Pointer Questions

#### Q1: What is std::unique_ptr and what problem does it solve?
**Difficulty:** #beginner  
**Category:** #memory_management #smart_pointers  
**Concepts:** #unique_ptr #exclusive_ownership #raii #move_semantics

**Answer:**  
std::unique_ptr is a smart pointer that provides exclusive ownership of a dynamically allocated object, automatically deleting it when the unique_ptr is destroyed.

**Explanation:**  
Unique_ptr solves memory leak problems by tying resource lifetime to object lifetime through RAII. It prevents double deletion through deleted copy operations and enforces single ownership semantics. When a unique_ptr goes out of scope or is explicitly reset, it automatically calls delete on the managed object, making manual memory management unnecessary.

**Key takeaway:** Use unique_ptr as the default smart pointer for exclusive ownership with zero runtime overhead.

---

#### Q2: Why is the copy constructor deleted for std::unique_ptr?
**Difficulty:** #intermediate  
**Category:** #smart_pointers #design_pattern  
**Concepts:** #unique_ptr #exclusive_ownership #move_semantics #deleted_functions

**Answer:**  
The copy constructor is deleted to enforce exclusive ownership semantics, preventing multiple unique_ptrs from owning the same object which would cause double deletion.

**Explanation:**  
If copying were allowed, two unique_ptrs would point to the same object, and both would try to delete it when destroyed, causing undefined behavior. Deleting the copy constructor makes this impossible at compile time. Ownership transfer is achieved through move semantics (std::move), which explicitly transfers ownership and nullifies the source pointer.

**Key takeaway:** Unique_ptr's deleted copy operations enforce single ownership at compile time, preventing double-deletion bugs.

---

#### Q3: What is the difference between std::make_unique and using new with unique_ptr?
**Difficulty:** #intermediate  
**Category:** #smart_pointers #best_practices  
**Concepts:** #make_unique #unique_ptr #exception_safety #new

**Answer:**  
std::make_unique combines allocation and unique_ptr construction in one call, providing better exception safety and more concise syntax than separately using new.

**Code example:**
```cpp
// ✅ Preferred: make_unique
auto p1 = std::make_unique<Widget>(args);

// ❌ Verbose and less safe
std::unique_ptr<Widget> p2(new Widget(args));
```

**Explanation:**  
Make_unique is exception-safe in all contexts, including function arguments where evaluation order can cause leaks. It also eliminates typing the type name twice and prevents accidentally using the wrong delete operation. Make_unique was added in C++14; C++11 code must use the direct construction form.

**Key takeaway:** Always prefer std::make_unique over direct use of new for creating unique_ptrs.

---

#### Q4: How does std::shared_ptr implement reference counting?
**Difficulty:** #advanced  
**Category:** #smart_pointers #internals  
**Concepts:** #shared_ptr #reference_counting #control_block #atomic_operations

**Answer:**  
std::shared_ptr uses a control block containing atomic reference counts, allocated separately from the managed object, with thread-safe increment/decrement operations.

**Explanation:**  
The control block stores strong reference count (number of shared_ptrs), weak reference count (number of weak_ptrs), the deleter, and optionally an allocator. When shared_ptrs are copied, the strong count is atomically incremented. When destroyed, it's atomically decremented. When strong count reaches zero, the object is deleted. When both counts reach zero, the control block is deleted.

**Key takeaway:** Shared_ptr's control block enables shared ownership through thread-safe reference counting with atomic operations.

---

#### Q5: What is std::make_shared and why is it preferred?
**Difficulty:** #intermediate  
**Category:** #smart_pointers #performance  
**Concepts:** #make_shared #shared_ptr #control_block #exception_safety

**Answer:**  
std::make_shared allocates the managed object and control block together in a single allocation, improving performance and cache locality compared to separate allocations.

**Code example:**
```cpp
// ✅ Preferred: single allocation
auto p1 = std::make_shared<Widget>(args);

// ❌ Two allocations: object + control block
std::shared_ptr<Widget> p2(new Widget(args));
```

**Explanation:**  
Make_shared performs one allocation for both object and control block, reducing memory overhead and improving cache performance. It's also exception-safe in complex expressions. The only downside is that memory isn't freed until all weak_ptrs are destroyed, even after the object is deleted, which matters only for very large objects.

**Key takeaway:** Always prefer std::make_shared unless you need a custom deleter or separate object/control block lifetimes.

---

#### Q6: What is a cyclic reference and how does it cause memory leaks with shared_ptr?
**Difficulty:** #intermediate  
**Category:** #memory_management #smart_pointers  
**Concepts:** #shared_ptr #circular_reference #memory_leak #weak_ptr

**Answer:**  
A cyclic reference occurs when objects hold shared_ptrs to each other, creating a loop where reference counts never reach zero, preventing deletion.

**Code example:**
```cpp
struct Node {
    std::shared_ptr<Node> next;
};

auto a = std::make_shared<Node>();
auto b = std::make_shared<Node>();
a->next = b;  // b count = 2
b->next = a;  // a count = 2
// ❌ When leaving scope, both have count = 1, never deleted
```

**Explanation:**  
When a and b go out of scope, each releases one reference to the other. However, each still holds a shared_ptr to the other, keeping reference counts at 1. Since counts never reach zero, neither object is deleted, causing a memory leak. This commonly occurs in graphs, trees with parent pointers, and doubly-linked lists.

**Key takeaway:** Circular shared_ptr references prevent deletion; use weak_ptr for one direction to break cycles.

---

#### Q7: What is std::weak_ptr and why is it needed?
**Difficulty:** #intermediate  
**Category:** #smart_pointers #design_pattern  
**Concepts:** #weak_ptr #shared_ptr #circular_reference #non_owning

**Answer:**  
std::weak_ptr is a non-owning observer of a shared_ptr-managed object that doesn't contribute to the reference count, primarily used to break circular references.

**Explanation:**  
Weak_ptr allows observing an object without extending its lifetime. It can check if the object still exists (expired()) and temporarily promote to a shared_ptr (lock()) for safe access. When all shared_ptrs are destroyed, the object is deleted even if weak_ptrs remain. This breaks ownership cycles while maintaining the ability to access the object when it's alive.

**Key takeaway:** Use weak_ptr for non-owning references, especially back-pointers, observers, and breaking shared_ptr cycles.

---

#### Q8: How do you safely access an object through std::weak_ptr?
**Difficulty:** #beginner  
**Category:** #smart_pointers #api_usage  
**Concepts:** #weak_ptr #lock #expired #thread_safety

**Answer:**  
Use the lock() method to atomically check validity and obtain a temporary shared_ptr, ensuring the object stays alive during access.

**Code example:**
```cpp
std::weak_ptr<Widget> weak = /* ... */;

// ✅ Correct: atomic check and lock
if (auto shared = weak.lock()) {
    shared->use();  // Safe: object kept alive
} else {
    // Object was already destroyed
}

// ❌ Race condition:
if (!weak.expired()) {
    auto shared = weak.lock();  // Might be null!
    shared->use();  // ❌ Potential crash
}
```

**Explanation:**  
The lock() method atomically checks if the object exists and increments the reference count, returning a shared_ptr. This eliminates race conditions where the object could be destroyed between checking expired() and calling lock(). The returned shared_ptr keeps the object alive for the duration of use.

**Key takeaway:** Always use weak_ptr.lock() directly in a condition, never check expired() separately.

---

#### Q9: What are custom deleters and when are they useful?
**Difficulty:** #advanced  
**Category:** #smart_pointers #resource_management  
**Concepts:** #custom_deleter #unique_ptr #shared_ptr #raii

**Answer:**  
Custom deleters are callable objects passed to smart pointers that define how to release the managed resource, enabling management of non-memory resources.

**Code example:**
```cpp
// File handle management
auto fileDeleter = [](FILE* f) { if (f) fclose(f); };
std::unique_ptr<FILE, decltype(fileDeleter)> file(
    fopen("data.txt", "r"),
    fileDeleter
);

// malloc'd memory
std::shared_ptr<int> ptr(
    (int*)malloc(100 * sizeof(int)),
    [](int* p) { free(p); }
);
```

**Explanation:**  
Custom deleters allow smart pointers to manage any resource type: file handles, sockets, database connections, GPU memory, or memory from custom allocators. For unique_ptr, the deleter type is a template parameter (zero overhead). For shared_ptr, it's type-erased in the control block (slight overhead but type flexibility).

**Key takeaway:** Use custom deleters to manage any resource with smart pointers, not just heap memory.

---

#### Q10: How do std::unique_ptr<T[]> and regular arrays differ?
**Difficulty:** #intermediate  
**Category:** #smart_pointers #memory_management  
**Concepts:** #unique_ptr #arrays #delete_array #bounds_checking

**Answer:**  
std::unique_ptr<T[]> is a specialized template that calls delete[] instead of delete and provides operator[] for element access.

**Code example:**
```cpp
// ✅ Correct array management
std::unique_ptr<int[]> arr(new int[10]);
arr[5] = 42;  // operator[] works

// ❌ Wrong: uses delete instead of delete[]
std::unique_ptr<int> bad(new int[10]);

// ✅ Better: use vector
std::unique_ptr<std::vector<int>> vec = 
    std::make_unique<std::vector<int>>(10);
```

**Explanation:**  
The array specialization unique_ptr<T[]> uses delete[] for proper array deallocation and enables array indexing syntax. However, it lacks size information and bounds checking. Using std::vector wrapped in a smart pointer is generally preferable for dynamic arrays, providing size tracking, bounds checking, and resizability.

**Key takeaway:** Use unique_ptr<T[]> for C-style arrays, but prefer vector for better safety and functionality.

---

#### Q11: Why doesn't std::make_unique support array syntax?
**Difficulty:** #intermediate  
**Category:** #smart_pointers #language_design  
**Concepts:** #make_unique #arrays #initialization

**Answer:**  
make_unique for arrays would require specifying both element count and initialization values, creating ambiguous syntax, so it was excluded from C++14/17.

**Explanation:**  
Function template syntax make_unique<int[]>(10) is unclear whether 10 is the array size or an initialization value. Additionally, proper array initialization syntax (brace-init-lists) doesn't map cleanly to make_unique's variadic template design. For arrays, using unique_ptr<T[]> with new T[n] directly, or preferably using std::vector, avoids these ambiguities.

**Key takeaway:** Use unique_ptr<T[]> with explicit new T[n] for arrays, or better yet, use std::vector.

---

#### Q12: When should you use raw pointers instead of smart pointers?
**Difficulty:** #intermediate  
**Category:** #best_practices #design_pattern  
**Concepts:** #raw_pointer #non_owning #smart_pointers #ownership

**Answer:**  
Use raw pointers (or references) for non-owning observation when you don't manage the object's lifetime and need to pass or store a reference without ownership.

**Explanation:**  
Smart pointers encode ownership. When a function doesn't own an object but merely uses it, passing a raw pointer or reference is more appropriate and efficient. Examples include callback parameters, temporary usage in member functions, and algorithm implementations. The guideline is: smart pointers for ownership, raw pointers/references for borrowing.

**Key takeaway:** Use raw pointers or references for non-owning access; smart pointers are for ownership management only.

---

#### Q13: What happens when you delete a polymorphic object through unique_ptr without a virtual destructor?
**Difficulty:** #advanced  
**Category:** #undefined_behavior #polymorphism  
**Concepts:** #virtual_destructor #unique_ptr #polymorphism #undefined_behavior

**Answer:**  
Deleting through a base pointer without virtual destructor causes undefined behavior, calling only the base destructor and leaking derived class resources.

**Code example:**
```cpp
struct Base { ~Base() {} };  // ❌ Not virtual
struct Derived : Base {
    int* data = new int[100];
    ~Derived() { delete[] data; }
};

std::unique_ptr<Base> ptr = std::make_unique<Derived>();
// ❌ UB: Only ~Base() called, data leaks
```

**Explanation:**  
Without a virtual destructor, the delete expression calls the destructor statically based on the pointer type, not the actual object type. The derived class destructor never runs, leaking its resources. Always make base class destructors virtual when enabling polymorphic deletion, even when using smart pointers.

**Key takeaway:** Always provide virtual destructors in base classes intended for polymorphic use, even with smart pointers.

---

#### Q14: How does the aliasing constructor of shared_ptr work?
**Difficulty:** #advanced  
**Category:** #smart_pointers #advanced_features  
**Concepts:** #shared_ptr #aliasing_constructor #control_block

**Answer:**  
The aliasing constructor creates a shared_ptr that participates in reference counting for one object but provides access to a different pointer.

**Code example:**
```cpp
struct Widget {
    int x, y;
};

auto widget = std::make_shared<Widget>();
// Aliasing: manage widget lifetime, expose widget.x
std::shared_ptr<int> xptr(widget, &widget->x);

// xptr.use_count() shares widget's count
// widget deleted only when both widget and xptr destroyed
```

**Explanation:**  
The aliasing constructor takes a shared_ptr to keep alive and a raw pointer to expose. This enables exposing members or sub-objects while ensuring the owning object stays alive. Common uses include exposing struct members, array elements, and implementing pimpl idioms where you want to expose an impl pointer while managing the outer wrapper.

**Key takeaway:** Use the aliasing constructor to safely expose sub-objects while maintaining correct lifetime management.

---

#### Q15: What is the overhead of std::shared_ptr compared to raw pointers?
**Difficulty:** #advanced  
**Category:** #performance #smart_pointers  
**Concepts:** #shared_ptr #control_block #atomic_operations #performance

**Answer:**  
shared_ptr has overhead from control block allocation, atomic reference count operations, and additional pointer indirection compared to raw pointers.

**Explanation:**  
Each shared_ptr requires two pointers (object and control block), so it's twice the size of a raw pointer. Copying/destroying shared_ptrs involves atomic increment/decrement operations for thread safety, which are slower than regular integers. Control block allocation adds memory overhead. These costs are acceptable for ownership management but matter in performance-critical code with frequent copying.

**Key takeaway:** Use unique_ptr or raw pointers for performance-critical code; shared_ptr when shared ownership is genuinely needed.

---

#### Q16: Can you create a shared_ptr from a unique_ptr? What about the reverse?
**Difficulty:** #intermediate  
**Category:** #smart_pointers #type_conversion  
**Concepts:** #unique_ptr #shared_ptr #move_semantics #ownership

**Answer:**  
You can convert unique_ptr to shared_ptr through move semantics, but cannot convert shared_ptr to unique_ptr without coordination.

**Code example:**
```cpp
// ✅ unique_ptr to shared_ptr: allowed
std::unique_ptr<int> unique = std::make_unique<int>(42);
std::shared_ptr<int> shared = std::move(unique);
// unique is now nullptr

// ❌ shared_ptr to unique_ptr: not supported
// std::unique_ptr<int> unique2 = shared;  // Compile error
```

**Explanation:**  
Exclusive ownership can become shared (relaxing constraints), so unique_ptr implicitly converts to shared_ptr via move. Shared ownership cannot become exclusive without ensuring no other owners exist, so automatic conversion is disallowed. You could manually check use_count() == 1 and use get() + release, but this breaks the safety guarantees.

**Key takeaway:** unique_ptr converts to shared_ptr via move; the reverse requires manual coordination and breaks safety.

---

#### Q17: What is the difference between use_count() and unique() for shared_ptr?
**Difficulty:** #beginner  
**Category:** #smart_pointers #api_usage  
**Concepts:** #shared_ptr #use_count #reference_counting

**Answer:**  
use_count() returns the number of shared_ptr instances sharing ownership, while unique() returns true if use_count() == 1.

**Code example:**
```cpp
auto p1 = std::make_shared<int>(42);
std::cout << p1.use_count();  // 1
std::cout << p1.unique();     // true

auto p2 = p1;
std::cout << p1.use_count();  // 2  
std::cout << p1.unique();     // false
```

**Explanation:**  
These methods query the strong reference count in the control block. Use_count() returns the exact number of shared_ptrs, while unique() is a convenience function equivalent to use_count() == 1. Note that these methods are primarily for debugging or optimization—you should rarely need them in production code.

**Key takeaway:** use_count() returns reference count; unique() checks if sole owner; both are mainly for debugging.

---

#### Q18: Why should you avoid creating multiple shared_ptrs from the same raw pointer?
**Difficulty:** #intermediate  
**Category:** #memory_management #undefined_behavior  
**Concepts:** #shared_ptr #double_delete #control_block

**Answer:**  
Creating multiple shared_ptrs from the same raw pointer creates separate control blocks, causing each to independently delete the object and resulting in double deletion.

**Code example:**
```cpp
Widget* raw = new Widget();

std::shared_ptr<Widget> p1(raw);  // Control block A
std::shared_ptr<Widget> p2(raw);  // ❌ Control block B

// When p1 and p2 destroyed → double delete!
```

**Explanation:**  
Each shared_ptr construction from a raw pointer allocates a new control block with its own reference count. The two shared_ptrs don't know about each other and will both delete the object. Always create shared_ptrs from make_shared or copy existing shared_ptrs. Use enable_shared_from_this for safely getting shared_ptr from this.

**Key takeaway:** Never create multiple shared_ptrs from the same raw pointer; always copy existing shared_ptrs or use make_shared.

---

#### Q19: What is enable_shared_from_this and when is it used?
**Difficulty:** #advanced  
**Category:** #smart_pointers #design_pattern  
**Concepts:** #enable_shared_from_this #shared_ptr #shared_from_this

**Answer:**  
enable_shared_from_this is a base class that allows an object to safely obtain a shared_ptr to itself from within member functions.

**Code example:**
```cpp
class Widget : public std::enable_shared_from_this<Widget> {
public:
    std::shared_ptr<Widget> getShared() {
        return shared_from_this();  // ✅ Safe
    }
    
    void registerCallback() {
        callbacks.push_back(shared_from_this());
    }
};

// ✅ Correct usage
auto w = std::make_shared<Widget>();
auto ptr = w->getShared();  // Same control block
```

**Explanation:**  
Without enable_shared_from_this, creating shared_ptr(this) would create a new control block, causing double deletion. Enable_shared_from_this maintains a weak_ptr to the control block, allowing shared_from_this() to return a shared_ptr that shares the same control block. The object must be managed by shared_ptr before calling shared_from_this().

**Key takeaway:** Inherit from enable_shared_from_this<T> to safely obtain shared_ptr from this pointer.

---

#### Q20: How does std::weak_ptr prevent memory leaks in observer patterns?
**Difficulty:** #intermediate  
**Category:** #design_pattern #smart_pointers  
**Concepts:** #weak_ptr #observer_pattern #memory_leak #shared_ptr

**Answer:**  
weak_ptr allows observers to reference subjects without extending their lifetime, enabling automatic cleanup when subjects are destroyed.

**Code example:**
```cpp
class Subject;

class Observer {
    std::weak_ptr<Subject> subject_;  // Non-owning
public:
    void notify() {
        if (auto subj = subject_.lock()) {
            // Subject still alive, can use it
        }
    }
};

class Subject {
    std::vector<std::weak_ptr<Observer>> observers_;
    
    void notifyAll() {
        for (auto& weak : observers_) {
            if (auto obs = weak.lock()) {
                obs->update();
            }
        }
    }
};
```

**Explanation:**  
In observer patterns, subjects need to notify observers but shouldn't own them. Using shared_ptr both ways creates cycles. Using weak_ptr for one direction allows subjects to be destroyed when external owners release them, with observers safely detecting this through expired(). Dead observers are automatically skipped during notification.

**Key takeaway:** Use weak_ptr in observer patterns to avoid ownership cycles while maintaining safe access to potentially destroyed objects.

---

#### Q21: What happens to the object when the last shared_ptr is destroyed but weak_ptrs still exist?
**Difficulty:** #advanced  
**Category:** #smart_pointers #memory_management  
**Concepts:** #shared_ptr #weak_ptr #control_block #memory_lifecycle

**Answer:**  
The managed object is deleted when the strong count reaches zero, but the control block remains alive until all weak_ptrs are destroyed.

**Explanation:**  
The control block maintains two counts: strong (shared_ptrs) and weak (weak_ptrs + shared_ptrs). When strong count reaches zero, the managed object is deleted via the deleter. However, the control block memory remains allocated until both counts reach zero, as weak_ptrs need the control block to check validity. This means weak_ptrs keep control block memory alive even after the object is gone.

**Key takeaway:** Weak_ptrs keep control blocks alive after objects are deleted; this is expected behavior, not a leak.

---

#### Q22: Can you use unique_ptr in standard containers? What about shared_ptr?
**Difficulty:** #beginner  
**Category:** #containers #smart_pointers  
**Concepts:** #unique_ptr #shared_ptr #move_semantics #containers

**Answer:**  
Both unique_ptr and shared_ptr can be used in containers, but unique_ptr requires move semantics since it's non-copyable.

**Code example:**
```cpp
// ✅ unique_ptr in containers (C++11+)
std::vector<std::unique_ptr<Widget>> vec;
vec.push_back(std::make_unique<Widget>());
vec.emplace_back(std::make_unique<Widget>());

// ✅ shared_ptr in containers
std::vector<std::shared_ptr<Widget>> vec2;
vec2.push_back(std::make_shared<Widget>());
auto ptr = vec2[0];  // Can copy
```

**Explanation:**  
Unique_ptr can be stored in containers using move semantics. Operations like push_back require std::move for unique_ptrs. Emplacement functions construct in-place. Shared_ptr works naturally with containers since it's copyable. However, storing unique_ptrs is preferred when shared ownership isn't needed, as it better documents single-owner semantics.

**Key takeaway:** Both smart pointers work in containers; prefer unique_ptr unless shared ownership is genuinely required.

---

#### Q23: What are the performance implications of passing shared_ptr by value vs by reference?
**Difficulty:** #advanced  
**Category:** #performance #smart_pointers  
**Concepts:** #shared_ptr #reference_counting #atomic_operations #performance

**Answer:**  
Passing shared_ptr by value performs atomic increment/decrement operations on reference counts, while by-reference avoids this overhead.

**Code example:**
```cpp
// ❌ Expensive: atomic operations
void process(std::shared_ptr<Widget> ptr);

// ✅ Efficient: no ref count changes
void process(const std::shared_ptr<Widget>& ptr);

// ✅ Best: raw pointer for non-owning use
void process(Widget* ptr);
```

**Explanation:**  
Passing by value copies the shared_ptr, atomically incrementing the reference count on entry and decrementing on exit. These atomic operations are significantly slower than regular integer operations, especially on multi-core systems. If the function doesn't need ownership, pass by const reference or raw pointer. Pass by value only when the function needs to extend the object's lifetime beyond the call.

**Key takeaway:** Pass shared_ptr by const reference unless the function needs to store or extend the object's lifetime.

---

#### Q24: How do you safely reset a unique_ptr to manage a different object?
**Difficulty:** #beginner  
**Category:** #smart_pointers #api_usage  
**Concepts:** #unique_ptr #reset #memory_management

**Answer:**  
Use the reset() method which deletes the currently managed object and optionally takes ownership of a new pointer.

**Code example:**
```cpp
std::unique_ptr<int> ptr = std::make_unique<int>(42);

ptr.reset();  // ✅ Deletes managed object, ptr becomes null

ptr.reset(new int(100));  // ✅ Deletes old, manages new

ptr = std::make_unique<int>(200);  // ✅ Assignment operator
```

**Explanation:**  
The reset() method provides explicit control over the unique_ptr's managed object. Called with no arguments, it deletes the current object and becomes null. Called with a pointer, it deletes the current object and takes ownership of the new one. Assignment from another unique_ptr or make_unique also works through the move assignment operator.

**Key takeaway:** Use reset() to explicitly replace the managed object; prefer make_unique with assignment for new objects.

---

#### Q25: What is the get() method and when should you use it?
**Difficulty:** #beginner  
**Category:** #smart_pointers #api_usage  
**Concepts:** #get #raw_pointer #non_owning #unique_ptr #shared_ptr

**Answer:**  
get() returns the underlying raw pointer without transferring ownership, used for interfacing with APIs that require raw pointers.

**Code example:**
```cpp
std::unique_ptr<Widget> ptr = std::make_unique<Widget>();

// ✅ Correct: temporary use
legacy_function(ptr.get());  // API requires Widget*

// ❌ Wrong: don't create owning pointer from get()
std::unique_ptr<Widget> ptr2(ptr.get());  // Double ownership!
delete ptr.get();  // ❌ Manual deletion
```

**Explanation:**  
The get() method provides access to the raw pointer for compatibility with legacy APIs that haven't adopted smart pointers. It's safe for temporary use where you're "borrowing" the pointer. Never create another owning pointer (smart or manual delete) from get(), as this creates double ownership and causes double deletion.

**Key takeaway:** Use get() only for temporary borrowing in legacy API calls; never create owning pointers from it.

---

#### Q26: How do you transfer ownership from unique_ptr to a function?
**Difficulty:** #intermediate  
**Category:** #smart_pointers #ownership  
**Concepts:** #unique_ptr #move_semantics #ownership_transfer

**Answer:**  
Pass unique_ptr by value and use std::move to explicitly transfer ownership to the function.

**Code example:**
```cpp
void takeOwnership(std::unique_ptr<Widget> ptr) {
    // Function now owns the object
    ptr->use();
}  // Object deleted when ptr destroyed

void caller() {
    auto ptr = std::make_unique<Widget>();
    takeOwnership(std::move(ptr));  // ✅ Ownership transferred
    // ptr is now null, cannot use it
}
```

**Explanation:**  
Accepting unique_ptr by value in the function signature communicates that ownership is transferred to the function. The caller must explicitly std::move the unique_ptr, which transfers ownership and nullifies the source. This makes ownership transfer explicit and self-documenting. After the move, the caller should not use the original unique_ptr.

**Key takeaway:** Accept unique_ptr by value to take ownership; callers use std::move for explicit transfer.

---

#### Q27: What is the Rule of Zero and how does it relate to smart pointers?
**Difficulty:** #advanced  
**Category:** #design_pattern #best_practices  
**Concepts:** #rule_of_zero #smart_pointers #raii #special_members

**Answer:**  
The Rule of Zero states that classes should not manually manage resources; instead, use RAII types like smart pointers that handle resource management automatically.

**Code example:**
```cpp
// ❌ Rule of Five: manual management needed
class ManualWidget {
    int* data;
public:
    ManualWidget() : data(new int[100]) {}
    ~ManualWidget() { delete[] data; }
    // Need custom copy/move constructors and assignments
};

// ✅ Rule of Zero: compiler-generated everything works
class ModernWidget {
    std::unique_ptr<int[]> data = std::make_unique<int[]>(100);
    // Compiler generates all special members correctly
};
```

**Explanation:**  
When all resources are managed by RAII types (smart pointers, containers, strings), the compiler-generated special member functions (destructor, copy/move constructors, assignments) work correctly automatically. This eliminates the need for custom implementations and reduces bugs. The Rule of Zero is enabled by smart pointers and standard containers.

**Key takeaway:** Use smart pointers and containers to achieve Rule of Zero, eliminating manual resource management code.

---

#### Q28: How does make_shared achieve single allocation for object and control block?
**Difficulty:** #advanced  
**Category:** #smart_pointers #internals  
**Concepts:** #make_shared #control_block #memory_layout #performance

**Answer:**  
make_shared allocates a single memory block containing both the control block and the managed object in contiguous memory.

**Explanation:**  
Traditional shared_ptr construction (new followed by shared_ptr) requires two allocations: one for the object and one for the control block. Make_shared allocates a larger single block with the control block at the beginning and the object immediately following. This improves cache locality, reduces allocator overhead, and is more efficient. The tradeoff is that memory isn't freed until both strong and weak counts reach zero.

**Key takeaway:** make_shared performs single allocation for object and control block, improving performance and cache locality.

---

#### Q29: Can you use smart pointers with arrays of objects that have constructors?
**Difficulty:** #intermediate  
**Category:** #smart_pointers #arrays  
**Concepts:** #unique_ptr #arrays #constructors #default_initialization

**Answer:**  
unique_ptr<T[]> supports arrays of objects, calling constructors during allocation and destructors during deallocation automatically.

**Code example:**
```cpp
class Widget {
public:
    Widget() { std::cout << "Constructed\n"; }
    ~Widget() { std::cout << "Destroyed\n"; }
};

std::unique_ptr<Widget[]> arr(new Widget[5]);
// All 5 constructors called

// When arr destroyed, all 5 destructors called
```

**Explanation:**  
The array specialization unique_ptr<T[]> properly manages arrays of non-trivial types, ensuring constructors are called during new[] and destructors during delete[]. However, you cannot easily provide custom constructor arguments for each element—all elements are default-constructed. For complex initialization, prefer std::vector which provides more control.

**Key takeaway:** unique_ptr<T[]> handles arrays with constructors/destructors correctly but only supports default initialization.

---

#### Q30: What are the thread safety guarantees of smart pointers?
**Difficulty:** #advanced  
**Category:** #threading #smart_pointers  
**Concepts:** #thread_safety #shared_ptr #unique_ptr #atomic_operations #data_race

**Answer:**  
shared_ptr's control block operations (copying, reference counting) are thread-safe, but accessing the managed object requires external synchronization.

**Explanation:**  
For shared_ptr, multiple threads can safely copy shared_ptrs or increment/decrement reference counts without data races due to atomic operations on the control block. However, accessing or modifying the managed object through shared_ptrs in different threads is not thread-safe and requires mutexes or other synchronization. Unique_ptr has no thread safety guarantees since it's non-copyable and assumes single-threaded access.

**Key takeaway:** shared_ptr reference counting is thread-safe; accessing the managed object requires your own synchronization.

---

### PRACTICE_TASKS: Output Prediction and Analysis Questions

#### Q1
```cpp
std::unique_ptr<int> p1 = std::make_unique<int>(42);
std::unique_ptr<int> p2 = p1;
std::cout << *p2;
```

#### Q2
```cpp
std::unique_ptr<int> p1 = std::make_unique<int>(100);
std::unique_ptr<int> p2 = std::move(p1);
if (p1 == nullptr) {
    std::cout << "p1 is null\n";
}
std::cout << *p2;
```

#### Q3
```cpp
std::shared_ptr<int> sp1 = std::make_shared<int>(42);
std::shared_ptr<int> sp2 = sp1;
std::cout << sp1.use_count() << " " << sp2.use_count();
```

#### Q4
```cpp
struct Node {
    std::shared_ptr<Node> next;
    ~Node() { std::cout << "~Node\n"; }
};

void test() {
    auto a = std::make_shared<Node>();
    auto b = std::make_shared<Node>();
    a->next = b;
    b->next = a;
}
```

#### Q5
```cpp
std::weak_ptr<int> weak;
{
    std::shared_ptr<int> shared = std::make_shared<int>(42);
    weak = shared;
    std::cout << weak.use_count() << "\n";
}
std::cout << weak.expired();
```

#### Q6
```cpp
int* raw = new int(100);
std::shared_ptr<int> sp1(raw);
std::shared_ptr<int> sp2(raw);
```

#### Q7
```cpp
std::unique_ptr<int[]> arr(new int[5]);
delete arr.get();
```

#### Q8
```cpp
auto p = std::make_shared<int>(42);
int* raw = p.get();
p.reset();
std::cout << *raw;
```

#### Q9
```cpp
struct Base {
    ~Base() { std::cout << "~Base\n"; }
};

struct Derived : Base {
    ~Derived() { std::cout << "~Derived\n"; }
};

std::unique_ptr<Base> ptr = std::make_unique<Derived>();
```

#### Q10
```cpp
std::unique_ptr<int> p1 = std::make_unique<int>(42);
std::unique_ptr<int> p2;
p2 = std::move(p1);
std::cout << (p1 == nullptr);
```

#### Q11
```cpp
std::shared_ptr<int> sp;
std::weak_ptr<int> wp = sp;
auto locked = wp.lock();
if (locked) {
    std::cout << "Locked\n";
} else {
    std::cout << "Null\n";
}
```

#### Q12
```cpp
auto sp1 = std::make_shared<int>(100);
std::weak_ptr<int> wp = sp1;
sp1.reset();
std::cout << wp.expired();
```

#### Q13
```cpp
std::unique_ptr<int> p(new int(42));
int* raw = p.release();
std::cout << (p == nullptr);
delete raw;
```

#### Q14
```cpp
std::shared_ptr<int> sp1 = std::make_shared<int>(42);
std::shared_ptr<int> sp2 = sp1;
sp1.reset();
std::cout << sp2.use_count();
```

#### Q15
```cpp
std::unique_ptr<int[]> arr = std::make_unique<int[]>(5);
arr[0] = 10;
std::cout << arr[0];
```

#### Q16
```cpp
auto deleter = [](int* p) {
    std::cout << "Custom delete\n";
    delete p;
};

std::unique_ptr<int, decltype(deleter)> p(new int(42), deleter);
```

#### Q17
```cpp
std::unique_ptr<int> p1 = std::make_unique<int>(42);
auto p2 = std::make_shared<int>(100);
p2 = std::move(p1);
```

#### Q18
```cpp
struct Widget {
    int data = 42;
};

auto widget = std::make_shared<Widget>();
std::shared_ptr<int> dataPtr(widget, &widget->data);
widget.reset();
std::cout << *dataPtr;
```

#### Q19
```cpp
std::unique_ptr<int> p = std::make_unique<int>(42);
std::shared_ptr<int> sp = std::move(p);
std::cout << sp.use_count() << " " << (p == nullptr);
```

#### Q20
```cpp
std::shared_ptr<int> sp = std::make_shared<int>(42);
std::weak_ptr<int> wp1 = sp;
std::weak_ptr<int> wp2 = sp;
sp.reset();
std::cout << wp1.use_count() << " " << wp2.use_count();
```

---

### QUICK_REFERENCE: Answer Keys and Summary Tables

#### Answer Key for Practice Questions

| Q# | Answer | Explanation | Key Concept |
|----|--------|-------------|-------------|
| 1 | Compilation error | unique_ptr copy constructor is deleted. Cannot copy p1 to p2. Must use std::move for ownership transfer. | #unique_ptr #deleted_copy |
| 2 | Prints "p1 is null" then 100 | std::move transfers ownership from p1 to p2. p1 becomes nullptr. p2 now owns the int containing 100. | #unique_ptr #move_semantics |
| 3 | Prints "2 2" | Both sp1 and sp2 share ownership of the same object. use_count() returns the total reference count, which is 2 for both. | #shared_ptr #reference_counting |
| 4 | Memory leak, ~Node never printed | Circular reference: a->next points to b, b->next points to a. Reference counts never reach zero. Neither destructor runs. | #circular_reference #memory_leak |
| 5 | Prints "1" then "1" (true) | Weak_ptr doesn't increment strong count. When shared destroyed, weak.expired() returns true (1). First line shows shared's use_count is 1. | #weak_ptr #expired |
| 6 | Double delete, crash | Two independent shared_ptrs created from same raw pointer. Each has separate control block. Both will delete the object → double delete. | #shared_ptr #double_delete |
| 7 | Double delete, undefined behavior | Manually deleting through get() doesn't release ownership. When arr destroyed, it calls delete[] again on already-freed memory. | #unique_ptr #get #double_delete |
| 8 | Undefined behavior, dangling pointer | p.reset() deletes the managed int. raw now points to freed memory. Dereferencing causes use-after-free UB. | #dangling_pointer #use_after_free |
| 9 | Only prints "~Base" - resource leak | Base destructor not virtual. Polymorphic deletion only calls ~Base(), not ~Derived(). Derived resources leak. Need virtual ~Base(). | #virtual_destructor #polymorphism |
| 10 | Prints "1" (true) | Move assignment transfers ownership from p1 to p2. p1 becomes nullptr. Comparison with nullptr returns true. | #unique_ptr #move_assignment |
| 11 | Prints "Null" | sp is default-constructed (nullptr). weak_ptr observing nullptr. lock() returns empty shared_ptr, condition is false. | #weak_ptr #lock |
| 12 | Prints "1" (true) | sp1.reset() destroys the managed object. weak_ptr detects this and expired() returns true. | #weak_ptr #expired |
| 13 | Prints "1" (true) then completes | release() returns raw pointer and makes p null. Ownership transferred to caller. Must manually delete raw. p == nullptr is true. | #unique_ptr #release |
| 14 | Prints "1" | sp1.reset() decrements count to 1. sp2 still holds reference. sp2.use_count() returns 1. | #shared_ptr #reset |
| 15 | Compilation error | make_unique doesn't support array syntax. Should use: unique_ptr<int[]>(new int[5]) or unique_ptr<int[]> arr(new int[5]). | #make_unique #arrays |
| 16 | Prints "Custom delete" when p destroyed | Custom deleter invoked when unique_ptr destroyed. Lambda prints message then deletes pointer. Deleter type is part of unique_ptr's type. | #custom_deleter #unique_ptr |
| 17 | Compilation error | Cannot assign unique_ptr to shared_ptr variable. Need conversion: shared_ptr<int> sp = std::move(p1), or create new variable. | #type_mismatch #smart_pointers |
| 18 | Prints "42" | Aliasing constructor: dataPtr shares widget's control block but points to data member. Even after widget.reset(), dataPtr keeps Widget alive. | #aliasing_constructor #shared_ptr |
| 19 | Prints "1 1" (true) | unique_ptr converts to shared_ptr via move. sp has use_count 1. p becomes nullptr. Successful ownership transfer. | #unique_to_shared #move_conversion |
| 20 | Prints "0 0" | When sp.reset(), strong count becomes 0, object deleted. Weak_ptrs remain but use_count() (strong count) is 0 for both. | #weak_ptr #use_count |

#### Smart Pointer Type Comparison

| Feature | unique_ptr | shared_ptr | weak_ptr |
|---------|-----------|-----------|----------|
| **Ownership** | Exclusive | Shared | Non-owning observer |
| **Copyable** | No (deleted) | Yes | Yes |
| **Movable** | Yes | Yes | Yes |
| **Size** | 1 pointer (default deleter) | 2 pointers | 2 pointers |
| **Runtime Overhead** | Zero (default deleter) | Atomic ops, control block | Minimal |
| **Thread Safety** | No | Control block only | Control block only |
| **Primary Use** | Single ownership, RAII | Multiple owners | Break cycles, observation |
| **Reference Counting** | No | Yes (strong count) | Yes (weak count) |
| **Custom Deleter** | Template parameter | Type-erased in control block | Inherits from shared_ptr |
| **Array Support** | unique_ptr<T[]> | Limited (custom deleter pre-C++17) | N/A |
| **Best For** | Default choice, performance | Shared ownership, caching | Avoiding cycles, callbacks |

#### Smart Pointer Operations Reference

| Operation | unique_ptr | shared_ptr | weak_ptr |
|-----------|-----------|-----------|----------|
| **Creation** | make_unique<T>(args) | make_shared<T>(args) | From shared_ptr |
| **Access Object** | *, -> | *, -> | lock() returns shared_ptr |
| **Get Raw Pointer** | get() | get() | N/A (use lock()) |
| **Release Ownership** | release() | reset() | reset() |
| **Replace Object** | reset(ptr) | reset(ptr) | N/A |
| **Check Validity** | ptr != nullptr | ptr != nullptr | !expired() or lock() |
| **Transfer Ownership** | std::move | Copy or move | N/A (non-owning) |
| **Reference Count** | N/A | use_count() | use_count() |
| **Sole Owner Check** | N/A | unique() | N/A |
| **Array Element Access** | operator[] (T[]) | No (unless custom) | N/A |

#### Custom Deleter Patterns

| Resource Type | Deleter Example | Smart Pointer Type |
|--------------|-----------------|-------------------|
| **FILE*** | `[](FILE* f) { if (f) fclose(f); }` | unique_ptr<FILE, decltype(lambda)> |
| **malloc Memory** | `[](T* p) { free(p); }` | shared_ptr<T> with deleter |
| **Array** | `[](T* p) { delete[] p; }` | shared_ptr<T> with deleter |
| **Windows Handle** | `[](HANDLE h) { CloseHandle(h); }` | unique_ptr<void, decltype(lambda)> |
| **Custom Cleanup** | `[](T* p) { p->cleanup(); delete p; }` | Either smart pointer type |
| **No-op** | `[](T*) {}` | For non-owned resources |
| **Function Pointer** | `&fclose`, `&free` | unique_ptr with function type |

#### Common Smart Pointer Pitfalls

| Pitfall | Problem | Solution |
|---------|---------|----------|
| **Copying unique_ptr** | Compile error due to deleted copy | Use std::move for transfer |
| **Circular shared_ptr** | Memory leak from ref cycle | Use weak_ptr for back-references |
| **Multiple shared_ptrs from raw** | Double delete from separate control blocks | Only create from make_shared or copy existing |
| **Non-virtual destructor** | Incomplete polymorphic deletion | Always use virtual destructor in base |
| **Using get() for ownership** | Double ownership and deletion | Use get() only for borrowing |
| **Array with wrong delete** | UB from delete vs delete[] mismatch | Use unique_ptr<T[]> specialization |
| **Passing shared_ptr by value** | Unnecessary atomic operations | Pass by const reference unless extending lifetime |
| **Checking expired() then lock()** | Race condition in multithreaded code | Use lock() directly in condition |
| **Creating from this** | Separate control block, double delete | Use enable_shared_from_this |
| **Delaying weak_ptr memory** | Control block lingers after object deleted | Expected behavior, not a leak |

#### When to Use Each Smart Pointer

| Scenario | Recommended Smart Pointer | Rationale |
|----------|--------------------------|-----------|
| **Single owner** | unique_ptr | Zero overhead, clear semantics |
| **Factory functions** | unique_ptr (or shared if needed) | Explicit ownership transfer |
| **Resource management** | unique_ptr with custom deleter | RAII for any resource type |
| **Multiple owners** | shared_ptr | Reference-counted shared ownership |
| **Caching** | weak_ptr to cached items | Allows cache invalidation |
| **Observer pattern** | weak_ptr to subject | Non-owning observation |
| **Callbacks** | weak_ptr to context | Prevents dangling callbacks |
| **Parent-child relationships** | shared_ptr parent, weak_ptr child | Breaks ownership cycle |
| **Graph structures** | shared_ptr nodes, weak_ptr back-edges | Prevents cyclic leaks |
| **Temporary borrowing** | Raw pointer or reference | No ownership needed |
| **Function parameters (non-owning)** | Raw pointer/reference | Most efficient for borrowing |
| **Function parameters (sink)** | unique_ptr by value | Takes ownership |
| **Containers of owned objects** | vector<unique_ptr<T>> | Clear ownership in collections |

#### Performance Characteristics

| Operation | unique_ptr | shared_ptr | weak_ptr | Raw Pointer |
|-----------|-----------|-----------|----------|-------------|
| **Construction** | O(1) | O(1) + atomic init | O(1) + atomic inc | O(1) |
| **Copy** | N/A (deleted) | O(1) + atomic inc | O(1) + atomic inc | O(1) |
| **Move** | O(1) | O(1) | O(1) | O(1) |
| **Destruction** | O(1) + delete | O(1) + atomic dec + maybe delete | O(1) + atomic dec | O(1) |
| **Dereference** | O(1) | O(1) | Must lock first | O(1) |
| **Size** | sizeof(T*) + deleter | 2 * sizeof(T*) | 2 * sizeof(T*) | sizeof(T*) |
| **Cache Efficiency** | Excellent | Control block separate | Control block separate | Excellent |
| **Thread Contention** | None | Possible on control block | Minimal | None |