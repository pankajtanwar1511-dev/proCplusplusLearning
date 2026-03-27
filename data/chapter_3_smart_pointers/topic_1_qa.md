## TOPIC: Smart Pointers in Modern C++

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
