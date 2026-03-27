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

### QUICK_REFERENCE: Answer Keys and Summary Tables

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
