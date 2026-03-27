## TOPIC: Smart Pointers as RAII

### THEORY_SECTION: Core Concepts and Fundamentals

#### 1. Smart Pointer Fundamentals - unique_ptr for Exclusive Ownership

**Smart pointers** are RAII wrappers that automatically manage memory lifetime through scope-based destruction, eliminating manual `new`/`delete` and preventing memory leaks.

**The Three Smart Pointers:**

| Smart Pointer | Header | Ownership Model | Copyable? | Use Case |
|---------------|--------|----------------|-----------|----------|
| **std::unique_ptr** | `<memory>` | **Exclusive** (single owner) | ❌ NO (move-only) | Default choice, factory functions |
| **std::shared_ptr** | `<memory>` | **Shared** (multiple owners) | ✅ YES (ref counting) | Shared ownership, caches |
| **std::weak_ptr** | `<memory>` | **Non-owning** (observation) | ✅ YES | Break cycles, observers |

**Why Smart Pointers Matter:**

| Problem with Raw Pointers | Smart Pointer Solution |
|---------------------------|----------------------|
| ❌ Forgotten `delete` → memory leak | ✅ Automatic deletion in destructor |
| ❌ Double-delete → undefined behavior | ✅ Single ownership or ref counting |
| ❌ Exception thrown before `delete` | ✅ Stack unwinding calls destructor |
| ❌ Dangling pointers after `delete` | ✅ Nulled pointers (unique_ptr) or safe checking (weak_ptr) |
| ❌ Unclear ownership semantics | ✅ Type explicitly shows ownership |
| ❌ Manual tracking of lifetime | ✅ Compiler-enforced scope-based lifetime |

**unique_ptr - Exclusive Ownership (Zero Overhead):**

`std::unique_ptr` represents **exclusive single ownership**. Only one `unique_ptr` can own a resource at a time. It cannot be copied, only moved.

```cpp
// ✅ Creation
std::unique_ptr<int> ptr1 = std::make_unique<int>(42);
std::unique_ptr<int> ptr2(new int(100));  // Direct construction

// ❌ Cannot copy
// std::unique_ptr<int> ptr3 = ptr1;  // Compile error: deleted copy constructor

// ✅ Can move (transfer ownership)
std::unique_ptr<int> ptr3 = std::move(ptr1);
// ptr1 is now nullptr, ptr3 owns the resource

// ✅ Automatic cleanup
{
    std::unique_ptr<int> local(new int(77));
    // Use local...
}  // ← Destructor deletes the int automatically
```

**unique_ptr Key Properties:**

| Property | Value | Implication |
|----------|-------|-------------|
| **Size** | Same as raw pointer (typically 8 bytes on 64-bit) | Zero overhead (with stateless deleter) |
| **Copyable** | ❌ NO | Enforces exclusive ownership at compile time |
| **Movable** | ✅ YES | Enables ownership transfer |
| **Deleter** | Template parameter | Stateless deleters have zero size overhead |
| **Conversion** | Converts to base class `unique_ptr` | Supports polymorphism |
| **Thread safety** | ❌ NO | Like raw pointers, needs external sync |

**unique_ptr Creation - make_unique vs Direct Construction:**

```cpp
// ✅ Preferred: make_unique (C++14+)
auto ptr1 = std::make_unique<Widget>(arg1, arg2);
// Benefits: Exception-safe, auto type deduction

// ⚠️ Direct construction (needed for custom deleters)
std::unique_ptr<Widget> ptr2(new Widget(arg1, arg2));
// Less safe if exception during construction
```

**unique_ptr Array Specialization:**

```cpp
// ❌ WRONG: Uses delete, not delete[]
std::unique_ptr<int> bad(new int[10]);  // UB: memory leak

// ✅ CORRECT: Array specialization uses delete[]
std::unique_ptr<int[]> good(new int[10]);
good[5] = 42;  // ✅ operator[] available

// ✅ BETTER: Use vector instead
std::vector<int> best(10);
best[5] = 42;
```

**unique_ptr Interface:**

| Method | Purpose | Example |
|--------|---------|---------|
| `get()` | Get raw pointer (keeps ownership) | `int* raw = ptr.get();` |
| `release()` | Give up ownership, return raw pointer | `int* raw = ptr.release();` (must delete manually) |
| `reset()` | Delete current, optionally take new | `ptr.reset(new int(10));` |
| `swap()` | Exchange ownership | `ptr1.swap(ptr2);` |
| `operator bool` | Check if non-null | `if (ptr) { ... }` |
| `operator*` | Dereference | `*ptr = 5;` |
| `operator->` | Member access | `ptr->method();` |
| `operator[]` (array version) | Index access | `ptr[3] = 10;` |

**unique_ptr Custom Deleters:**

```cpp
// Example: FILE* management
struct FileDeleter {
    void operator()(FILE* fp) const {
        if (fp) std::fclose(fp);
    }
};

std::unique_ptr<FILE, FileDeleter> file(std::fopen("data.txt", "r"));
// Automatically calls fclose() in destructor

// Lambda deleter
auto socketDeleter = [](int* sock) {
    close(*sock);
    delete sock;
};
std::unique_ptr<int, decltype(socketDeleter)> socket(new int(fd), socketDeleter);
```

**Custom Deleter Properties:**

| Deleter Type | Size Overhead | When to Use |
|--------------|---------------|-------------|
| **Function pointer** | sizeof(void*) | Simple cleanup functions |
| **Empty lambda** | 0 bytes (EBO) | Inline cleanup logic |
| **Capturing lambda** | Size of captures | Need to capture state |
| **Functor (empty)** | 0 bytes (EBO) | Reusable deleter classes |
| **Functor (with data)** | Size of data members | Stateful deletion |

---

#### 2. shared_ptr and Reference Counting - Shared Ownership and Control Blocks

`std::shared_ptr` implements **shared ownership** through reference counting. Multiple `shared_ptr` instances can own the same resource, which is deleted only when the last owner is destroyed.

**shared_ptr Architecture:**

```cpp
std::shared_ptr<Widget> ptr = std::make_shared<Widget>();
```

**Memory layout:**

```
shared_ptr object (16 bytes on 64-bit):
  ┌──────────────────────┐
  │  Pointer to Widget   │  8 bytes
  ├──────────────────────┤
  │  Pointer to Control  │  8 bytes
  │      Block           │
  └──────────────────────┘
           │
           ↓
Control Block (heap):
  ┌──────────────────────┐
  │  Strong ref count    │  Atomic counter (shared_ptr count)
  ├──────────────────────┤
  │  Weak ref count      │  Atomic counter (weak_ptr count + 1 if strong > 0)
  ├──────────────────────┤
  │  Deleter             │  Type-erased deleter
  ├──────────────────────┤
  │  Allocator           │  Type-erased allocator
  └──────────────────────┘
```

**shared_ptr vs unique_ptr Comparison:**

| Aspect | unique_ptr | shared_ptr |
|--------|-----------|------------|
| **Size** | 8 bytes (1 pointer) | 16 bytes (2 pointers) |
| **Ownership** | Exclusive | Shared |
| **Copy semantics** | Deleted (move-only) | Increments ref count |
| **Overhead** | Zero (stateless deleter) | Control block + atomic operations |
| **Deleter type** | Template parameter (affects type) | Type-erased (stored in control block) |
| **Thread safety** | No | Control block operations atomic |
| **Use case** | Default choice | Genuinely shared ownership |

**Reference Counting Mechanism:**

```cpp
auto ptr1 = std::make_shared<int>(42);  // Ref count: 1

{
    auto ptr2 = ptr1;  // Copy: ref count → 2
    auto ptr3 = ptr1;  // Copy: ref count → 3

    std::cout << ptr1.use_count();  // 3

    ptr3.reset();  // Ref count → 2
}  // ptr2 destroyed: ref count → 1

ptr1.reset();  // Ref count → 0, object deleted
```

**make_shared vs Direct Construction:**

| Method | Allocations | Control Block | Exception Safety | Performance |
|--------|-------------|---------------|------------------|-------------|
| `make_shared<T>(...)` | **1** (object + control block together) | Contiguous with object | ✅ Strong | ✅ Faster, better cache locality |
| `shared_ptr<T>(new T(...))` | **2** (object, then control block) | Separate allocation | ⚠️ Weaker | ❌ Slower, fragmented |

**make_shared Caveats:**

```cpp
// ✅ BENEFIT: Single allocation
auto ptr = std::make_shared<LargeObject>();

// ❌ DRAWBACK: Object memory not freed until weak_ptrs destroyed
std::weak_ptr<LargeObject> weak = ptr;
ptr.reset();  // Object destroyed, but memory not reclaimed (control block persists)
weak.reset(); // NOW memory is reclaimed
```

**shared_ptr Thread Safety:**

| Operation | Thread-Safe? | Reason |
|-----------|-------------|--------|
| **Copying shared_ptr** | ✅ YES | Atomic ref count increment |
| **Destroying shared_ptr** | ✅ YES | Atomic ref count decrement |
| **Assigning shared_ptr** | ✅ YES | Atomic ref count operations |
| **Reading managed object** | ❌ NO | No built-in synchronization |
| **Writing managed object** | ❌ NO | Requires external mutex |

```cpp
std::shared_ptr<int> global = std::make_shared<int>(0);

// ✅ Thread-safe: Copying shared_ptr
void thread1() {
    auto copy = global;  // Atomic ref count increment
}

// ❌ NOT thread-safe: Modifying the int
void thread2() {
    (*global)++;  // Race condition!
}

// ✅ Thread-safe: Synchronize access to the int
std::mutex mtx;
void thread3() {
    std::lock_guard<std::mutex> lock(mtx);
    (*global)++;  // Protected
}
```

**shared_ptr Custom Deleters (Type-Erased):**

```cpp
// Unlike unique_ptr, deleter NOT part of type
std::shared_ptr<FILE> file1(
    std::fopen("a.txt", "r"),
    [](FILE* f) { if (f) std::fclose(f); }
);

std::shared_ptr<FILE> file2(
    std::fopen("b.txt", "r"),
    [](FILE* f) { if (f) std::fclose(f); }
);

file1 = file2;  // ✅ Same type, assignable (deleters are type-erased)
```

---

#### 3. weak_ptr and Advanced Patterns - Breaking Cycles and Observer Patterns

`std::weak_ptr` provides **non-owning observation** of `shared_ptr` managed objects, solving circular reference problems and enabling safe caching.

**The Circular Reference Problem:**

```cpp
// ❌ MEMORY LEAK: Circular reference
struct Node {
    std::shared_ptr<Node> next;
    std::shared_ptr<Node> prev;  // Creates cycle
    ~Node() { std::cout << "Destroyed\n"; }  // NEVER CALLED
};

auto n1 = std::make_shared<Node>();  // Ref count: 1
auto n2 = std::make_shared<Node>();  // Ref count: 1

n1->next = n2;  // n2 ref count: 2
n2->prev = n1;  // n1 ref count: 2

// n1 and n2 go out of scope
// n1 ref count: 2 → 1 (still held by n2->prev)
// n2 ref count: 2 → 1 (still held by n1->next)
// Both leak because ref counts never reach 0!
```

**weak_ptr Solution:**

```cpp
// ✅ NO LEAK: weak_ptr breaks the cycle
struct Node {
    std::shared_ptr<Node> next;     // Owning forward link
    std::weak_ptr<Node> prev;       // Non-owning back link
    ~Node() { std::cout << "Destroyed\n"; }  // NOW CALLED
};

auto n1 = std::make_shared<Node>();  // Ref count: 1
auto n2 = std::make_shared<Node>();  // Ref count: 1

n1->next = n2;  // n2 ref count: 2 (shared_ptr increments)
n2->prev = n1;  // n1 ref count: 1 (weak_ptr does NOT increment)

// n1 and n2 go out of scope
// n1 ref count: 1 → 0 → DESTROYED
// n2 ref count: 2 → 1 → 0 → DESTROYED
```

**weak_ptr Key Properties:**

| Property | Behavior |
|----------|----------|
| **Ownership** | Does NOT own, does not affect ref count |
| **Size** | 16 bytes (2 pointers, same as shared_ptr) |
| **Created from** | shared_ptr only |
| **Access method** | `lock()` returns shared_ptr (empty if expired) |
| **Validity check** | `expired()` returns true if object destroyed |
| **Use case** | Break cycles, caches, observers |

**weak_ptr Safe Access Pattern:**

```cpp
std::weak_ptr<int> weak;

{
    auto shared = std::make_shared<int>(42);
    weak = shared;  // Observe without ownership

    // ✅ Safe access: lock() returns valid shared_ptr
    if (auto locked = weak.lock()) {
        std::cout << *locked << "\n";  // 42
    }
}

// Object destroyed (shared went out of scope)

// ✅ Safe check: expired() detects destroyed object
if (weak.expired()) {
    std::cout << "Object no longer exists\n";
}

// ✅ Safe access attempt: lock() returns empty shared_ptr
if (auto locked = weak.lock()) {
    std::cout << *locked;  // Not executed
} else {
    std::cout << "Cannot access destroyed object\n";
}
```

**weak_ptr Use Cases:**

| Use Case | Pattern | Benefit |
|----------|---------|---------|
| **Doubly-linked list** | `shared_ptr` for next, `weak_ptr` for prev | Breaks cycle |
| **Tree with parent pointers** | `shared_ptr` for children, `weak_ptr` for parent | Breaks cycle |
| **Observer pattern** | Observable stores `weak_ptr` to observers | Observers can be destroyed independently |
| **Cache** | Cache stores `weak_ptr`, users hold `shared_ptr` | Auto-cleanup of unused items |
| **Callbacks** | Store `weak_ptr` to callback target | Callback can safely check if target exists |

**enable_shared_from_this Pattern:**

Problem: Cannot safely create `shared_ptr` from `this` pointer inside a member function.

```cpp
// ❌ WRONG: Creates second control block → double-free
class Bad {
public:
    std::shared_ptr<Bad> getPtr() {
        return std::shared_ptr<Bad>(this);  // NEW control block!
    }
};

auto b1 = std::make_shared<Bad>();  // Control block 1
auto b2 = b1->getPtr();             // Control block 2
// Both will try to delete the same Bad object → UB

// ✅ CORRECT: Inherit from enable_shared_from_this
class Good : public std::enable_shared_from_this<Good> {
public:
    std::shared_ptr<Good> getPtr() {
        return shared_from_this();  // Uses SAME control block
    }
};

auto g1 = std::make_shared<Good>();  // Control block created
auto g2 = g1->getPtr();              // ✅ Same control block, ref count = 2
```

**enable_shared_from_this Mechanics:**

```cpp
template<typename T>
class enable_shared_from_this {
    mutable std::weak_ptr<T> weak_this_;  // Stores weak reference to control block

public:
    std::shared_ptr<T> shared_from_this() {
        return std::shared_ptr<T>(weak_this_);  // Creates shared_ptr from weak_ptr
    }
};
```

**enable_shared_from_this Requirements:**

| Requirement | Reason |
|-------------|--------|
| ✅ Must create object with `make_shared` or `shared_ptr` constructor | Initializes internal `weak_ptr` |
| ❌ Cannot call `shared_from_this()` from constructor | Internal `weak_ptr` not yet initialized |
| ❌ Cannot call `shared_from_this()` on stack objects | No `shared_ptr` owns the object |
| ✅ Call only after first `shared_ptr` is fully constructed | Ensures `weak_ptr` is initialized |

**Observer Pattern with weak_ptr:**

```cpp
class Observable;

class Observer : public std::enable_shared_from_this<Observer> {
public:
    void subscribe(std::shared_ptr<Observable> subject);
    void notify(const std::string& event);
};

class Observable {
    std::vector<std::weak_ptr<Observer>> observers_;  // Non-owning

public:
    void attach(std::shared_ptr<Observer> obs) {
        observers_.push_back(obs);  // Store weak_ptr
    }

    void notifyAll(const std::string& event) {
        // Clean up expired observers while notifying
        auto it = std::remove_if(observers_.begin(), observers_.end(),
            [&](std::weak_ptr<Observer>& wp) {
                if (auto obs = wp.lock()) {  // ✅ Still alive
                    obs->notify(event);
                    return false;  // Keep
                }
                return true;  // Remove expired
            });
        observers_.erase(it, observers_.end());
    }
};

void Observer::subscribe(std::shared_ptr<Observable> subject) {
    subject->attach(shared_from_this());  // ✅ Safe shared_ptr to this
}
```

**Smart Pointer Decision Tree:**

```
Need to manage ownership?
│
├─ Single owner?
│  └─ ✅ Use unique_ptr (default choice)
│
├─ Multiple owners?
│  ├─ All owners equal?
│  │  └─ ✅ Use shared_ptr
│  │
│  └─ Some observe, some own?
│     └─ ✅ Use shared_ptr for owners, weak_ptr for observers
│
└─ Just observing, no ownership?
   └─ ✅ Use raw pointer/reference (function parameters)
```

**Performance Guidelines:**

| Guideline | Reason |
|-----------|--------|
| **Default to unique_ptr** | Zero overhead, clearest ownership |
| **Use shared_ptr only when needed** | Significant overhead (control block, atomics) |
| **Pass shared_ptr by const reference** | Avoid atomic ref count operations |
| **Use weak_ptr for non-owning observation** | Break cycles, safe caching |
| **Prefer make_unique and make_shared** | Exception-safe, better performance |
| **Avoid shared_ptr in hot loops** | Atomic operations expensive |
| **Use raw pointers for parameters** | When ownership not transferred |

---

---

### EDGE_CASES: Tricky Scenarios and Deep Internals

#### Edge Case 1: Array Management with unique_ptr

The template specialization `std::unique_ptr<T[]>` exists specifically for arrays and uses `delete[]` instead of `delete`. Failing to use the array specialization causes undefined behavior because `delete` on an array only destroys the first element, leaking all others.

```cpp
// ❌ Wrong: Memory leak for array elements
std::unique_ptr<int> bad(new int[10]);  // Calls delete, not delete[]

// ✅ Correct: Uses delete[] automatically
std::unique_ptr<int[]> good(new int[10]);

// ✅ Modern best practice: Use vector instead
std::vector<int> best(10);  // No manual memory management
```

The array specialization changes the interface—`operator[]` is available for `unique_ptr<T[]>` but not for `unique_ptr<T>`. However, in modern C++, `std::vector` or `std::array` should almost always be preferred over raw array management.

#### Edge Case 2: Custom Deleters for Non-Memory Resources

Smart pointers can manage any resource type by providing custom deleters. This is essential for file handles, sockets, OpenGL contexts, or any resource requiring specialized cleanup beyond simple `delete`.

```cpp
// ✅ File handle management with custom deleter
struct FileDeleter {
    void operator()(FILE* fp) const {
        if (fp) {
            fclose(fp);
            std::cout << "File closed\n";
        }
    }
};

std::unique_ptr<FILE, FileDeleter> file(fopen("data.txt", "r"));

// ✅ Lambda deleter for unique_ptr
auto socket_deleter = [](int* sock) { close(*sock); delete sock; };
std::unique_ptr<int, decltype(socket_deleter)> socket(new int(5), socket_deleter);

// ✅ Function deleter for shared_ptr (no template parameter needed)
std::shared_ptr<FILE> shared_file(fopen("log.txt", "w"), [](FILE* f) { 
    if (f) fclose(f); 
});
```

Custom deleters for `unique_ptr` become part of the type (affecting size), while `shared_ptr` deleters are type-erased and stored in the control block (no size overhead on the pointer itself).

#### Edge Case 3: Reference Cycles and Memory Leaks

`shared_ptr` uses reference counting, which creates memory leaks when circular references exist. Each object keeps the other alive, preventing the reference count from ever reaching zero.

```cpp
// ❌ Memory leak: Circular reference
struct Node {
    std::shared_ptr<Node> next;
    std::shared_ptr<Node> prev;  // Creates cycle
    ~Node() { std::cout << "Destroyed\n"; }  // Never called
};

auto n1 = std::make_shared<Node>();
auto n2 = std::make_shared<Node>();
n1->next = n2;
n2->prev = n1;  // Cycle: n1->n2->n1
// Both objects leak when pointers go out of scope

// ✅ Solution: Use weak_ptr for back-references
struct Node {
    std::shared_ptr<Node> next;     // Owning forward link
    std::weak_ptr<Node> prev;       // Non-owning back link
    ~Node() { std::cout << "Destroyed\n"; }  // Now called properly
};
```

This pattern is critical in doubly-linked lists, trees with parent pointers, observer patterns, and cache implementations where ownership should flow in one direction only.

#### Edge Case 4: shared_ptr Control Block and Memory Layout

`shared_ptr` stores both the managed pointer and a pointer to a **control block** containing the reference count, weak count, and deleter. Creating `shared_ptr` directly from raw pointers requires two separate allocations—one for the object, one for the control block.

```cpp
// ❌ Two allocations: object + control block
std::shared_ptr<int> ptr(new int(42));  // Allocation 1: int
                                        // Allocation 2: control block

// ✅ One allocation: object + control block together
std::shared_ptr<int> efficient = std::make_shared<int>(42);
```

`make_shared` allocates object and control block in contiguous memory, improving cache locality and reducing allocation overhead. However, this means the object memory cannot be freed until all `weak_ptr` references are destroyed, since the control block must persist for weak reference tracking.

#### Edge Case 5: Aliasing Constructor and Pointer Offsets

`shared_ptr` supports an aliasing constructor that allows ownership of one object while pointing to another. This is crucial for managing pointers to sub-objects or members where the parent must stay alive.

```cpp
struct Data {
    int x;
    int y;
};

auto data = std::make_shared<Data>();
data->x = 10;
data->y = 20;

// ✅ Share ownership of Data, but point to member x
std::shared_ptr<int> x_ptr(data, &data->x);

// data can be destroyed now, but x_ptr keeps Data alive
data.reset();
std::cout << *x_ptr;  // Safe: still 10, Data is alive via x_ptr
```

This technique is used in shared object hierarchies, returning smart pointers to members, and implementing shared slices of larger buffers.

#### Edge Case 6: Thread Safety of shared_ptr

The `shared_ptr` control block operations (incrementing/decrementing ref counts) are **atomic and thread-safe**. However, reading or writing the managed object itself is **not thread-safe** and requires external synchronization.

```cpp
std::shared_ptr<int> global_ptr = std::make_shared<int>(0);

// ✅ Thread-safe: Copying shared_ptr
void thread1() { auto copy = global_ptr; }  // Atomic ref count increment

// ❌ Not thread-safe: Modifying pointed-to value
void thread2() { (*global_ptr)++; }  // Race condition without mutex

// ✅ Thread-safe modification
std::mutex mtx;
void thread3() {
    std::lock_guard<std::mutex> lock(mtx);
    (*global_ptr)++;
}
```

Copying, assigning, and destroying `shared_ptr` objects is thread-safe for the control block. The managed object requires separate synchronization like any other shared data.

#### Edge Case 7: weak_ptr and Dangling Reference Prevention

`weak_ptr` provides non-owning observation of `shared_ptr` managed objects. It prevents dangling pointers by allowing safe checking of object validity before access through the `lock()` method.

```cpp
std::weak_ptr<int> weak;

{
    auto shared = std::make_shared<int>(100);
    weak = shared;  // Observe without ownership
    
    std::cout << weak.expired();  // false: object still alive
    auto locked = weak.lock();    // Returns valid shared_ptr
    if (locked) {
        std::cout << *locked;     // Safe: 100
    }
}

// shared went out of scope, object destroyed
std::cout << weak.expired();      // true: object destroyed
auto locked = weak.lock();        // Returns empty shared_ptr
if (!locked) {
    std::cout << "Object no longer exists\n";
}
```

This pattern is essential for observer patterns, cache implementations, and any scenario where you need to access an object only if it still exists, without preventing its destruction.

#### Edge Case 8: enable_shared_from_this Pattern

When a class method needs to return `shared_ptr<this>`, you cannot simply create a new `shared_ptr` from the raw `this` pointer—this creates independent control blocks leading to double-free errors.

```cpp
// ❌ Wrong: Creates second control block, double-free
class Bad {
public:
    std::shared_ptr<Bad> getPtr() {
        return std::shared_ptr<Bad>(this);  // Undefined behavior!
    }
};

// ✅ Correct: Inherit from enable_shared_from_this
class Good : public std::enable_shared_from_this<Good> {
public:
    std::shared_ptr<Good> getPtr() {
        return shared_from_this();  // Uses existing control block
    }
};

auto obj = std::make_shared<Good>();
auto ptr = obj->getPtr();  // Safe: same control block
```

`enable_shared_from_this` stores a weak reference to the control block, allowing `shared_from_this()` to create new `shared_ptr` instances that share the original control block.

---

### CODE_EXAMPLES: Practical Demonstrations

#### Example 1: Basic unique_ptr Usage and Transfer

```cpp
#include <memory>
#include <iostream>

void takeOwnership(std::unique_ptr<int> ptr) {
    std::cout << "Received: " << *ptr << "\n";
    // ptr destroyed here, deletes the int
}

int main() {
    std::unique_ptr<int> p1 = std::make_unique<int>(42);
    std::cout << *p1 << "\n";
    
    // ✅ Transfer ownership via move
    std::unique_ptr<int> p2 = std::move(p1);
    // p1 is now nullptr
    
    if (!p1) std::cout << "p1 is empty\n";
    std::cout << *p2 << "\n";
    
    takeOwnership(std::move(p2));  // Transfer to function
    // p2 is now nullptr
}
```

`unique_ptr` is move-only, enforcing exclusive ownership at compile time. After moving, the source pointer becomes null, preventing accidental use. The managed memory is automatically deleted when the final owning `unique_ptr` is destroyed.

#### Example 2: unique_ptr with Arrays and Custom Deleters

```cpp
#include <memory>
#include <cstdio>

// Custom deleter for FILE*
struct FileDeleter {
    void operator()(FILE* fp) const {
        if (fp) {
            std::fclose(fp);
            std::cout << "File closed via custom deleter\n";
        }
    }
};

int main() {
    // ✅ Array specialization: uses delete[]
    std::unique_ptr<int[]> arr(new int[5]);
    arr[0] = 10;
    arr[4] = 50;
    
    // ✅ Custom deleter for non-memory resource
    std::unique_ptr<FILE, FileDeleter> file(std::fopen("test.txt", "w"));
    if (file) {
        std::fprintf(file.get(), "Hello RAII\n");
    }
    // File automatically closed when file goes out of scope
}
```

The array specialization changes the type and uses `delete[]` automatically. Custom deleters allow managing any resource type—files, sockets, database connections, OpenGL contexts. The deleter becomes part of the `unique_ptr` type.

#### Example 3: shared_ptr Reference Counting

```cpp
#include <memory>
#include <iostream>

void checkCount(const std::shared_ptr<int>& ptr) {
    std::cout << "Value: " << *ptr 
              << ", Ref count: " << ptr.use_count() << "\n";
}

int main() {
    std::shared_ptr<int> p1 = std::make_shared<int>(100);
    checkCount(p1);  // Ref count: 1
    
    {
        std::shared_ptr<int> p2 = p1;  // Copy increases count
        std::shared_ptr<int> p3 = p1;
        checkCount(p1);  // Ref count: 3
        
        p3.reset();  // Decreases count
        checkCount(p1);  // Ref count: 2
    }
    // p2 destroyed, count decrements
    
    checkCount(p1);  // Ref count: 1
    p1.reset();      // Object destroyed when count reaches 0
}
```

Each `shared_ptr` copy increments the reference count atomically. When the count reaches zero (last `shared_ptr` is destroyed or reset), the managed object is deleted. The control block tracks both strong (`shared_ptr`) and weak (`weak_ptr`) references.

#### Example 4: Breaking Circular References with weak_ptr

```cpp
#include <memory>
#include <iostream>

struct Node {
    int data;
    std::shared_ptr<Node> next;   // Owning forward link
    std::weak_ptr<Node> prev;     // Non-owning back link
    
    Node(int val) : data(val) {
        std::cout << "Node " << data << " created\n";
    }
    ~Node() {
        std::cout << "Node " << data << " destroyed\n";
    }
};

int main() {
    auto n1 = std::make_shared<Node>(1);
    auto n2 = std::make_shared<Node>(2);
    auto n3 = std::make_shared<Node>(3);
    
    n1->next = n2;
    n2->prev = n1;  // Weak reference, no cycle
    
    n2->next = n3;
    n3->prev = n2;
    
    // Access previous node via weak_ptr
    if (auto prev = n3->prev.lock()) {
        std::cout << "n3's previous node: " << prev->data << "\n";
    }
    
    // All nodes properly destroyed when main() ends
}
```

Using `weak_ptr` for back-references breaks the circular dependency. The forward links (`next`) own the nodes through `shared_ptr`, while backward links observe without affecting lifetime. This pattern applies to doubly-linked structures, trees with parent pointers, and observer patterns.

#### Example 5: make_shared Performance and Exception Safety

```cpp
#include <memory>

class Resource {
    int* data;
public:
    Resource(int size) : data(new int[size]) {
        // If this constructor throws, memory leaks in direct version
    }
    ~Resource() { delete[] data; }
};

void riskyFunction() {
    // ❌ Two allocations, exception-unsafe
    std::shared_ptr<Resource> bad(new Resource(100));
    // If Resource constructor throws after 'new' allocates but before
    // shared_ptr construction completes, memory leaks
    
    // ✅ One allocation, exception-safe
    auto good = std::make_shared<Resource>(100);
    // Single allocation for object + control block
    // If constructor throws, make_shared handles cleanup automatically
}

void demonstratePerformance() {
    // make_shared: 1 allocation (object + control block together)
    auto p1 = std::make_shared<int>(42);
    
    // Direct construction: 2 allocations (object, then control block)
    std::shared_ptr<int> p2(new int(42));
}
```

`make_shared` combines object and control block allocation, improving cache locality and reducing allocation overhead. It's also exception-safe—if the constructor throws, the single allocation is properly cleaned up. Always prefer `make_shared` over direct construction unless custom deleters are required.

#### Example 6: Implementing Cache with weak_ptr

```cpp
#include <memory>
#include <map>
#include <string>

class ExpensiveResource {
public:
    ExpensiveResource(const std::string& id) : id_(id) {
        std::cout << "Loading expensive resource: " << id_ << "\n";
    }
    ~ExpensiveResource() {
        std::cout << "Releasing resource: " << id_ << "\n";
    }
private:
    std::string id_;
};

class ResourceCache {
    std::map<std::string, std::weak_ptr<ExpensiveResource>> cache_;
    
public:
    std::shared_ptr<ExpensiveResource> getResource(const std::string& id) {
        // Check if resource exists in cache
        auto it = cache_.find(id);
        if (it != cache_.end()) {
            if (auto resource = it->second.lock()) {
                std::cout << "Cache hit: " << id << "\n";
                return resource;  // Return existing resource
            }
        }
        
        // Resource not in cache or expired, create new
        std::cout << "Cache miss: " << id << "\n";
        auto resource = std::make_shared<ExpensiveResource>(id);
        cache_[id] = resource;  // Store weak reference
        return resource;
    }
};

int main() {
    ResourceCache cache;
    
    {
        auto r1 = cache.getResource("config.xml");  // Cache miss
        auto r2 = cache.getResource("config.xml");  // Cache hit
    }
    // Resources destroyed here
    
    auto r3 = cache.getResource("config.xml");  // Cache miss again
}
```

This cache stores `weak_ptr` to allow resources to be destroyed when no longer in use. When all users release their `shared_ptr`, the resource is automatically freed even if the cache still has the weak reference. This prevents memory accumulation while providing performance benefits for active resources.

#### Example 7: shared_ptr with Custom Deleter for System Resources

```cpp
#include <memory>
#include <cstdio>
#include <sys/socket.h>

// ✅ File handle with lambda deleter
std::shared_ptr<FILE> openFile(const char* filename) {
    FILE* fp = std::fopen(filename, "r");
    if (!fp) return nullptr;
    
    return std::shared_ptr<FILE>(fp, [filename](FILE* f) {
        std::cout << "Closing file: " << filename << "\n";
        std::fclose(f);
    });
}

// ✅ Socket handle with function deleter
void closeSocket(int* sockfd) {
    if (*sockfd >= 0) {
        std::cout << "Closing socket: " << *sockfd << "\n";
        close(*sockfd);
    }
    delete sockfd;
}

std::shared_ptr<int> createSocket() {
    int* sockfd = new int(socket(AF_INET, SOCK_STREAM, 0));
    if (*sockfd < 0) {
        delete sockfd;
        return nullptr;
    }
    
    return std::shared_ptr<int>(sockfd, closeSocket);
}

int main() {
    auto file = openFile("data.txt");
    if (file) {
        // Use file
    }
    // Automatically closed when shared_ptr destroyed
    
    auto sock = createSocket();
    if (sock) {
        // Use socket
    }
    // Automatically closed when shared_ptr destroyed
}
```

Custom deleters in `shared_ptr` are type-erased and stored in the control block, so they don't affect the `shared_ptr` type or size. This makes `shared_ptr` excellent for managing system resources like files, sockets, database connections, and OpenGL contexts.

#### Example 8: enable_shared_from_this for Observer Pattern

```cpp
#include <memory>
#include <vector>
#include <iostream>

class Observable;

class Observer : public std::enable_shared_from_this<Observer> {
    std::string name_;
public:
    Observer(const std::string& name) : name_(name) {}
    
    void subscribe(std::shared_ptr<Observable> subject);
    
    void notify(const std::string& event) {
        std::cout << name_ << " received: " << event << "\n";
    }
    
    ~Observer() {
        std::cout << name_ << " destroyed\n";
    }
};

class Observable {
    std::vector<std::weak_ptr<Observer>> observers_;
public:
    void attach(std::shared_ptr<Observer> observer) {
        observers_.push_back(observer);  // Store weak_ptr
    }
    
    void notifyAll(const std::string& event) {
        // Remove expired observers while notifying
        observers_.erase(
            std::remove_if(observers_.begin(), observers_.end(),
                [&](std::weak_ptr<Observer>& wp) {
                    if (auto observer = wp.lock()) {
                        observer->notify(event);
                        return false;  // Keep alive observers
                    }
                    return true;  // Remove expired
                }),
            observers_.end()
        );
    }
};

void Observer::subscribe(std::shared_ptr<Observable> subject) {
    subject->attach(shared_from_this());  // Safe: uses existing control block
}

int main() {
    auto subject = std::make_shared<Observable>();
    
    {
        auto obs1 = std::make_shared<Observer>("Observer1");
        auto obs2 = std::make_shared<Observer>("Observer2");
        
        obs1->subscribe(subject);
        obs2->subscribe(subject);
        
        subject->notifyAll("Event A");
    }
    // Observers destroyed here
    
    subject->notifyAll("Event B");  // No active observers
}
```

`enable_shared_from_this` allows objects to safely obtain `shared_ptr` to themselves. The observable stores `weak_ptr` to observers, allowing them to be destroyed independently. This implements automatic cleanup of destroyed observers without manual unsubscription.

---

### QUICK_REFERENCE: Answer Key and Summary Tables

#### Smart Pointer Comparison Table

| Feature | unique_ptr | shared_ptr | weak_ptr |
|---------|-----------|------------|----------|
| **Ownership** | Exclusive | Shared | Non-owning |
| **Copyable** | No (move-only) | Yes | Yes |
| **Size** | 1 pointer + deleter | 2 pointers | 2 pointers |
| **Overhead** | Zero (if stateless deleter) | Control block + atomic ops | Control block pointer |
| **Thread-safe copying** | N/A | Yes (ref count) | Yes |
| **Thread-safe access** | No | No | No |
| **Use case** | Default choice | Shared ownership | Break cycles, cache |
| **Custom deleter** | Template param (affects type) | Type-erased (in control block) | N/A |
| **Array support** | unique_ptr<T[]> | shared_ptr<T[]> (C++17) | N/A |

#### Smart Pointer Creation Functions

| Function | Purpose | Benefits | Drawbacks |
|----------|---------|----------|-----------|
| `make_unique<T>` | Create unique_ptr | Exception-safe, auto type deduction | Cannot specify custom deleter |
| `make_shared<T>` | Create shared_ptr | 1 allocation (object+control block), exception-safe | Object memory not freed until weak_ptrs gone |
| `make_unique<T[]>` | Create unique_ptr for arrays | Type-safe array handling | Use vector instead |
| `make_shared<T[]>` (C++17) | Create shared_ptr for arrays | Shared array ownership | Use shared_ptr<vector> instead |

#### Common Smart Pointer Pitfalls

| Pitfall | Problem | Solution |
|---------|---------|----------|
| Creating shared_ptr from same raw pointer twice | Independent control blocks → double-free | Copy existing shared_ptrs or use enable_shared_from_this |
| shared_ptr circular references | Memory leak, destructors never called | Use weak_ptr for back-references |
| Using unique_ptr<T> with arrays | Calls delete, not delete[] → UB | Use unique_ptr<T[]> or std::vector |
| Accessing weak_ptr without lock() | Dangling pointer if object destroyed | Always use lock(), check result |
| Creating shared_ptr<this> | New control block → double-free | Inherit from enable_shared_from_this |
| Calling shared_from_this() too early | bad_weak_ptr exception | Only call after first shared_ptr created |
| Passing shared_ptr by value unnecessarily | Atomic ref count overhead | Pass by const reference if ownership not needed |

#### When to Use Each Smart Pointer

| Scenario | Best Choice | Reason |
|----------|-------------|--------|
| Factory function returning object | unique_ptr | Transfer ownership efficiently |
| Exclusive ownership, single owner | unique_ptr | Zero overhead, clear semantics |
| Multiple owners needed | shared_ptr | Reference counting handles shared lifetime |
| Observer pattern, avoid keeping object alive | weak_ptr | Non-owning observation |
| Cache implementation | weak_ptr | Allow automatic cleanup |
| Doubly-linked list | shared_ptr (next) + weak_ptr (prev) | Break cycles |
| Tree with parent pointers | shared_ptr (children) + weak_ptr (parent) | Break cycles |
| Temporary access to object | raw pointer or reference | No ownership needed |
| Managing non-memory resources | unique_ptr or shared_ptr with custom deleter | RAII for files, sockets, etc. |
| Pimpl idiom | unique_ptr | Hide implementation, incomplete types |

#### Smart Pointer Performance Guidelines

| Guideline | Rationale |
|-----------|-----------|
| Prefer unique_ptr by default | Zero overhead, fastest, clearest ownership |
| Pass shared_ptr by const reference when possible | Avoid atomic ref count operations |
| Use make_unique and make_shared | Exception-safe, more efficient |
| Avoid shared_ptr in hot paths | Atomic operations are costly |
| Consider weak_ptr for observer patterns | Prevent cycles without ownership overhead |
| Use raw pointers/references for non-owning parameters | No overhead, clear intent |
| Avoid unnecessary shared_ptr copies | Each copy has atomic overhead |
| Use std::move for transferring ownership | Avoids ref count operations |

#### Thread Safety Summary

| Operation | unique_ptr | shared_ptr | weak_ptr |
|-----------|-----------|------------|----------|
| Copy construction | N/A | Thread-safe (atomic) | Thread-safe (atomic) |
| Assignment | Not thread-safe | Thread-safe (atomic) | Thread-safe (atomic) |
| Destruction | Not thread-safe | Thread-safe (atomic) | Thread-safe (atomic) |
| Accessing managed object | Not thread-safe | Not thread-safe | N/A (use lock() first) |
| Modifying pointer itself | Not thread-safe | Not thread-safe | Not thread-safe |
| lock() (weak_ptr only) | N/A | N/A | Thread-safe (atomic) |
