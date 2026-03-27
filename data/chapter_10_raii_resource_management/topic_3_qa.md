## TOPIC: Smart Pointers as RAII

### INTERVIEW_QA: Comprehensive Questions

#### Q1: What is the primary advantage of smart pointers over raw pointers?
**Difficulty:** #beginner  
**Category:** #memory_management #raii #interview_favorite  
**Concepts:** #automatic_cleanup #exception_safety #ownership_semantics

**Answer:**  
Smart pointers automatically manage memory lifetime through RAII, eliminating manual delete calls and preventing memory leaks even during exceptions.

**Explanation:**  
Smart pointers tie resource lifetime to object scope. When a smart pointer goes out of scope, its destructor automatically releases the managed resource. This makes code exception-safe because destructors are called during stack unwinding, ensuring cleanup happens even when exceptions are thrown. Smart pointers also express ownership semantics explicitly—unique_ptr for exclusive ownership, shared_ptr for shared ownership.

**Key takeaway:** Smart pointers provide automatic, exception-safe memory management through RAII, making manual new/delete obsolete in modern C++.

---

#### Q2: What is the difference between std::unique_ptr and std::shared_ptr?
**Difficulty:** #beginner  
**Category:** #memory_management #ownership #interview_favorite  
**Concepts:** #unique_ptr #shared_ptr #exclusive_ownership #reference_counting

**Answer:**  
unique_ptr enforces exclusive single ownership and is move-only, while shared_ptr allows multiple owners through reference counting and can be copied.

**Explanation:**  
unique_ptr represents exclusive ownership—only one unique_ptr can own a resource at a time. It cannot be copied, only moved, which transfers ownership. shared_ptr implements shared ownership where multiple shared_ptr instances can point to the same resource. It uses reference counting in a control block to track the number of owners, deleting the resource only when the count reaches zero.

**Key takeaway:** Use unique_ptr as the default choice for single ownership; use shared_ptr only when multiple owners genuinely need to share lifetime responsibility.

---

#### Q3: Why should you use make_unique and make_shared instead of direct construction?
**Difficulty:** #intermediate  
**Category:** #best_practices #exception_safety #performance  
**Concepts:** #make_shared #make_unique #control_block #allocation_efficiency

**Answer:**  
make_unique and make_shared are exception-safe and, for shared_ptr, perform a single allocation combining object and control block for better performance.

**Explanation:**  
Direct construction like `shared_ptr<T>(new T)` requires two separate allocations—one for the object (new T) and one for the control block. If an exception occurs between these allocations, memory leaks. make_shared performs a single allocation for both, improving cache locality and reducing overhead. make_unique is primarily for exception safety and consistency. Both functions also enable auto type deduction.

**Key takeaway:** Always prefer make_unique and make_shared for exception safety and performance; use direct construction only when custom deleters are required.

---

#### Q4: How does std::weak_ptr prevent circular reference memory leaks?
**Difficulty:** #intermediate  
**Category:** #memory_management #design_pattern  
**Concepts:** #weak_ptr #circular_reference #reference_counting #observer_pattern

**Answer:**  
weak_ptr observes a shared_ptr managed object without increasing the reference count, breaking circular dependencies that would prevent destruction.

**Code example:**
```cpp
struct Node {
    std::shared_ptr<Node> next;   // Owning forward link
    std::weak_ptr<Node> prev;     // Non-owning back link
};

auto n1 = std::make_shared<Node>();
auto n2 = std::make_shared<Node>();
n1->next = n2;
n2->prev = n1;  // ✅ No cycle: prev doesn't contribute to ref count
```

**Explanation:**  
When two shared_ptr objects reference each other, they form a cycle where each keeps the other's reference count above zero, preventing destruction. weak_ptr breaks this by not contributing to the reference count. It can safely check if the object still exists via expired() and obtain a temporary shared_ptr via lock() if the object is still alive.

**Key takeaway:** Use weak_ptr for back-references, observer patterns, and caches to prevent circular dependencies while maintaining safe access.

---

#### Q5: What is the difference between std::unique_ptr<T> and std::unique_ptr<T[]>?
**Difficulty:** #intermediate  
**Category:** #memory_management #syntax  
**Concepts:** #unique_ptr #arrays #delete_operator #operator_overloading

**Answer:**  
unique_ptr<T[]> is specialized for arrays, uses delete[] instead of delete, and provides operator[] for element access instead of operator*.

**Code example:**
```cpp
std::unique_ptr<int> single(new int(42));
std::cout << *single;  // ✅ operator* available

std::unique_ptr<int[]> array(new int[10]);
array[5] = 100;  // ✅ operator[] available
// *array;       // ❌ No operator* for array version
```

**Explanation:**  
The array specialization changes both the deleter and the interface. Using unique_ptr<T> with an array causes undefined behavior because delete is called instead of delete[], leaking all array elements except the first. The array version also changes the API—it provides operator[] and removes operator* and operator->.

**Key takeaway:** Always use unique_ptr<T[]> for dynamically allocated arrays, or better yet, use std::vector which handles resizing and provides additional functionality.

---

#### Q6: Can you copy a std::unique_ptr? Why or why not?
**Difficulty:** #beginner  
**Category:** #ownership #syntax  
**Concepts:** #unique_ptr #move_semantics #exclusive_ownership #copy_constructor

**Answer:**  
No, unique_ptr cannot be copied because it enforces exclusive ownership; it can only be moved to transfer ownership.

**Code example:**
```cpp
std::unique_ptr<int> p1 = std::make_unique<int>(42);
// std::unique_ptr<int> p2 = p1;  // ❌ Compiler error: deleted copy ctor

std::unique_ptr<int> p2 = std::move(p1);  // ✅ Move transfers ownership
// p1 is now nullptr
```

**Explanation:**  
Exclusive ownership means only one unique_ptr can own a resource at any time. Allowing copies would violate this invariant, leading to double-free errors when multiple unique_ptrs try to delete the same resource. The copy constructor and copy assignment operator are explicitly deleted. Move semantics transfer ownership from one unique_ptr to another, leaving the source as nullptr.

**Key takeaway:** unique_ptr is move-only to enforce exclusive ownership at compile time; use std::move to transfer ownership explicitly.

---

#### Q7: How does std::shared_ptr implement reference counting?
**Difficulty:** #advanced  
**Category:** #implementation #memory_management  
**Concepts:** #shared_ptr #control_block #reference_counting #atomic_operations

**Answer:**  
shared_ptr uses a separate control block containing atomic reference counters for strong and weak references, plus the deleter and allocator.

**Explanation:**  
When you create a shared_ptr, it allocates a control block on the heap containing the strong reference count (number of shared_ptrs), weak reference count (number of weak_ptrs plus one if any shared_ptr exists), custom deleter, and allocator. The shared_ptr object itself stores two pointers: one to the managed object and one to the control block. Reference count modifications are performed atomically to ensure thread-safety for shared_ptr copying and destruction.

**Key takeaway:** The control block is a separate allocation that manages lifetime and supports thread-safe reference counting, but it adds memory and performance overhead.

---

#### Q8: What happens when you create a shared_ptr from the same raw pointer twice?
**Difficulty:** #advanced  
**Category:** #pitfalls #memory_management  
**Concepts:** #shared_ptr #control_block #double_free #undefined_behavior

**Answer:**  
Creating two shared_ptrs from the same raw pointer creates independent control blocks, leading to double-free undefined behavior when both try to delete the object.

**Code example:**
```cpp
int* raw = new int(42);
std::shared_ptr<int> p1(raw);  // Control block 1
std::shared_ptr<int> p2(raw);  // Control block 2 (different!)
// ❌ Undefined behavior: double delete when p1 and p2 are destroyed
```

**Explanation:**  
Each shared_ptr construction from a raw pointer creates a new control block. When p1's control block reaches zero, it deletes the object. When p2's control block reaches zero, it tries to delete the same object again, causing undefined behavior. This is why you should never create multiple shared_ptrs from the same raw pointer, and instead copy existing shared_ptrs or use enable_shared_from_this.

**Key takeaway:** Never create multiple shared_ptrs from the same raw pointer; always copy existing shared_ptrs or use enable_shared_from_this for safe this pointer access.

---

#### Q9: What is std::enable_shared_from_this used for?
**Difficulty:** #advanced  
**Category:** #design_pattern #memory_management  
**Concepts:** #enable_shared_from_this #shared_from_this #control_block #observer_pattern

**Answer:**  
enable_shared_from_this allows a class to safely create shared_ptr instances pointing to itself by using the existing control block rather than creating a new one.

**Code example:**
```cpp
class Widget : public std::enable_shared_from_this<Widget> {
public:
    std::shared_ptr<Widget> getPtr() {
        return shared_from_this();  // ✅ Uses existing control block
        // return std::shared_ptr<Widget>(this);  // ❌ Creates new control block!
    }
};

auto w = std::make_shared<Widget>();
auto w2 = w->getPtr();  // ✅ Same control block, ref count = 2
```

**Explanation:**  
When you need to return shared_ptr<this>, you cannot create it directly from the this pointer because that would create a second control block, leading to double-free errors. enable_shared_from_this stores a weak_ptr to the existing control block during the first shared_ptr construction. The shared_from_this() method then creates a new shared_ptr using that weak_ptr, ensuring all shared_ptrs share the same control block.

**Key takeaway:** Inherit from enable_shared_from_this when a class needs to return shared_ptr to itself, enabling safe shared ownership of the same object.

---

#### Q10: What is the purpose of std::weak_ptr::lock()?
**Difficulty:** #intermediate  
**Category:** #memory_management #thread_safety  
**Concepts:** #weak_ptr #lock #expired #race_condition

**Answer:**  
lock() atomically checks if the observed object still exists and returns a shared_ptr if valid, or an empty shared_ptr if the object was destroyed.

**Code example:**
```cpp
std::weak_ptr<int> weak;
{
    auto shared = std::make_shared<int>(42);
    weak = shared;
    
    if (auto locked = weak.lock()) {
        std::cout << *locked;  // ✅ Safe: 42
    }
}

// Object destroyed
auto locked = weak.lock();  // Returns empty shared_ptr
if (!locked) {
    std::cout << "Object no longer exists\n";
}
```

**Explanation:**  
weak_ptr::lock() performs an atomic operation that checks if the strong reference count is greater than zero. If so, it increments the count and returns a valid shared_ptr. If the count is zero (object destroyed), it returns an empty shared_ptr. This atomic operation prevents race conditions where the object could be destroyed between checking and accessing it.

**Key takeaway:** Always use lock() to safely access weak_ptr observed objects; it provides atomic validity checking and temporary ownership for safe access.

---

#### Q11: What is the memory overhead of std::shared_ptr compared to a raw pointer?
**Difficulty:** #advanced  
**Category:** #performance #memory_management  
**Concepts:** #shared_ptr #control_block #memory_overhead #pointer_size

**Answer:**  
shared_ptr has two pointer-sized members (16 bytes on 64-bit), plus a separate heap-allocated control block containing reference counts, deleter, and allocator.

**Explanation:**  
Each shared_ptr object stores two pointers: one to the managed object and one to the control block. On a 64-bit system, this means 16 bytes per shared_ptr (compared to 8 bytes for raw pointer). Additionally, the control block is a separate heap allocation containing at least three integers (strong count, weak count, and internal state), the custom deleter (if any), and the allocator. make_shared reduces overhead by combining object and control block in a single allocation.

**Key takeaway:** shared_ptr has significant memory overhead (2x pointer size plus control block) and additional allocation costs; use unique_ptr when shared ownership is not required.

---

#### Q12: Can std::unique_ptr have a custom deleter? How does it differ from shared_ptr's custom deleter?
**Difficulty:** #advanced  
**Category:** #implementation #memory_management  
**Concepts:** #unique_ptr #shared_ptr #custom_deleter #template_parameters #type_erasure

**Answer:**  
Yes, unique_ptr supports custom deleters as a template parameter (affecting the type), while shared_ptr uses type-erased deleters stored in the control block (not affecting the type).

**Code example:**
```cpp
// unique_ptr: Deleter is part of the type
auto del1 = [](int* p) { delete p; };
std::unique_ptr<int, decltype(del1)> u1(new int(1), del1);
std::unique_ptr<int, decltype(del1)> u2(new int(2), del1);
u1 = std::move(u2);  // ✅ Same type

// shared_ptr: Deleter is type-erased
std::shared_ptr<int> s1(new int(1), [](int* p) { delete p; });
std::shared_ptr<int> s2(new int(2), [](int* p) { delete p; });
s1 = s2;  // ✅ Same type regardless of deleter
```

**Explanation:**  
unique_ptr stores the deleter directly in the object, making it part of the type. This has zero overhead if the deleter is stateless (like a function pointer or empty lambda), but different deleter types create incompatible unique_ptr types. shared_ptr stores the deleter in the control block with type erasure, allowing shared_ptrs with different deleters to have the same type and be assigned to each other, but this has a runtime cost.

**Key takeaway:** unique_ptr deleters affect the type and have zero overhead when stateless; shared_ptr deleters are type-erased, allowing type compatibility at the cost of runtime overhead.

---

#### Q13: What is the difference between weak_ptr::expired() and weak_ptr::lock()?
**Difficulty:** #intermediate  
**Category:** #memory_management #thread_safety  
**Concepts:** #weak_ptr #expired #lock #race_condition

**Answer:**  
expired() checks if the object is destroyed but is not thread-safe for subsequent access, while lock() atomically checks and provides safe access via shared_ptr.

**Code example:**
```cpp
std::weak_ptr<int> weak = /* ... */;

// ❌ Not thread-safe: Object could be destroyed between check and access
if (!weak.expired()) {
    auto shared = weak.lock();  // Object might be destroyed here!
    if (shared) { /* use */ }
}

// ✅ Thread-safe: Atomic check and access
if (auto shared = weak.lock()) {
    // Guaranteed valid here
    std::cout << *shared;
}
```

**Explanation:**  
expired() returns true if the strong reference count is zero, but there's a race condition if you then try to access the object. Between checking expired() and calling lock(), another thread could destroy the object. lock() performs an atomic operation that checks validity and increments the reference count if the object exists, providing safe access without race conditions.

**Key takeaway:** Always use lock() for accessing weak_ptr observed objects; never rely on expired() followed by lock() as this creates a race condition.

---

#### Q14: Why does std::make_shared perform better than direct shared_ptr construction?
**Difficulty:** #advanced  
**Category:** #performance #memory_management  
**Concepts:** #make_shared #control_block #allocation #cache_locality

**Answer:**  
make_shared performs one allocation for both object and control block, improving performance and cache locality, while direct construction requires two separate allocations.

**Explanation:**  
When you write `shared_ptr<T>(new T)`, two allocations occur: one for the T object and one for the control block. make_shared allocates a single block of memory containing both the object and the control block in contiguous memory. This reduces allocation overhead, improves cache locality (object and control block are nearby in memory), and reduces memory fragmentation. However, this means the object memory cannot be freed until all weak_ptrs are destroyed, since the control block must persist.

**Key takeaway:** make_shared is faster and more cache-friendly due to single allocation; use it by default unless custom deleters or separate allocation timing is required.

---

#### Q15: What happens to the managed object when the last shared_ptr is destroyed but weak_ptrs still exist?
**Difficulty:** #advanced  
**Category:** #memory_management #implementation  
**Concepts:** #shared_ptr #weak_ptr #control_block #reference_counting

**Answer:**  
The managed object is destroyed and its memory freed, but the control block persists until all weak_ptrs are destroyed to track weak reference validity.

**Explanation:**  
The control block maintains two reference counts: strong (shared_ptr count) and weak (weak_ptr count, plus one if any shared_ptr exists). When the strong count reaches zero, the managed object is destroyed and its destructor called. However, the control block itself remains allocated so weak_ptrs can query expired() or lock(). The control block is only freed when both the strong and weak counts reach zero. With make_shared, this means the object's memory (though destroyed) cannot be reclaimed until all weak_ptrs are destroyed.

**Key takeaway:** Control blocks persist after object destruction while weak_ptrs exist; with make_shared, this prevents memory reclamation until all weak references are gone.

---

#### Q16: Is std::shared_ptr thread-safe?
**Difficulty:** #intermediate  
**Category:** #concurrency #memory_management  
**Concepts:** #shared_ptr #thread_safety #control_block #atomic_operations

**Answer:**  
Copying, assigning, and destroying shared_ptr is thread-safe due to atomic reference count operations, but accessing the managed object is not thread-safe.

**Code example:**
```cpp
std::shared_ptr<int> global = std::make_shared<int>(0);

// ✅ Thread-safe: ref count operations are atomic
void thread1() { auto copy = global; }

// ❌ Not thread-safe: data race on the int
void thread2() { (*global)++; }

// ✅ Thread-safe with mutex
std::mutex mtx;
void thread3() {
    std::lock_guard<std::mutex> lock(mtx);
    (*global)++;
}
```

**Explanation:**  
The shared_ptr control block uses atomic operations for reference counting, making shared_ptr copying, assignment, and destruction thread-safe across threads. Multiple threads can safely copy a shared_ptr without synchronization. However, the managed object itself is just regular data with no built-in synchronization. Concurrent reads and writes to the pointed-to object require external synchronization like mutexes.

**Key takeaway:** shared_ptr control operations are thread-safe, but the managed object requires separate synchronization for thread-safe access.

---

#### Q17: What is the aliasing constructor of std::shared_ptr used for?
**Difficulty:** #advanced  
**Category:** #memory_management #design_pattern  
**Concepts:** #shared_ptr #aliasing_constructor #control_block #subobject_pointer

**Answer:**  
The aliasing constructor allows a shared_ptr to manage one object's lifetime while pointing to a different object, typically for returning pointers to sub-objects.

**Code example:**
```cpp
struct Data {
    int x;
    int y;
};

auto data = std::make_shared<Data>();
data->x = 10;

// Share ownership of Data, but point to member x
std::shared_ptr<int> x_ptr(data, &data->x);

data.reset();  // Data not destroyed
std::cout << *x_ptr;  // ✅ Safe: 10, Data kept alive by x_ptr
```

**Explanation:**  
The aliasing constructor `shared_ptr(shared_ptr<U> r, T* ptr)` creates a shared_ptr that shares ownership with r (incrementing its reference count) but stores ptr as the pointer returned by get(). This is useful when returning pointers to members or sub-objects where the parent object must remain alive. The pointed-to object doesn't need to be related to the owned object.

**Key takeaway:** Use the aliasing constructor to return shared_ptrs to sub-objects while keeping the parent object alive through shared ownership.

---

#### Q18: Why should you avoid creating std::shared_ptr from this?
**Difficulty:** #advanced  
**Category:** #pitfalls #memory_management  
**Concepts:** #shared_ptr #this_pointer #control_block #enable_shared_from_this

**Answer:**  
Creating shared_ptr<this> creates a new control block independent of existing shared_ptrs, leading to double-free when both control blocks reach zero.

**Code example:**
```cpp
class Bad {
public:
    std::shared_ptr<Bad> getPtr() {
        return std::shared_ptr<Bad>(this);  // ❌ New control block!
    }
};

auto b1 = std::make_shared<Bad>();  // Control block 1
auto b2 = b1->getPtr();             // Control block 2
// Both will try to delete the same Bad object
```

**Explanation:**  
Every shared_ptr construction from a raw pointer creates a new control block. When you create shared_ptr<this>, it's unaware of any existing shared_ptrs managing the same object. This results in multiple control blocks for the same object, and when each reaches zero, they all try to delete the object, causing undefined behavior. The solution is to inherit from enable_shared_from_this and use shared_from_this().

**Key takeaway:** Never create shared_ptr from this directly; use enable_shared_from_this and shared_from_this() to safely obtain shared_ptr to this.

---

#### Q19: What happens if you call shared_from_this() before any shared_ptr exists?
**Difficulty:** #advanced  
**Category:** #pitfalls #memory_management  
**Concepts:** #enable_shared_from_this #shared_from_this #undefined_behavior

**Answer:**  
Calling shared_from_this() before the object is managed by a shared_ptr throws std::bad_weak_ptr exception because the internal weak_ptr is uninitialized.

**Code example:**
```cpp
class Widget : public std::enable_shared_from_this<Widget> {
public:
    void init() {
        auto self = shared_from_this();  // ❌ Throws if called from constructor
    }
};

// Widget w;  // Stack object
// w.init();  // ❌ bad_weak_ptr: no shared_ptr owns this

auto w = std::make_shared<Widget>();  // ✅ Initializes weak_ptr
w->init();  // ✅ Safe
```

**Explanation:**  
enable_shared_from_this stores a weak_ptr that is initialized only when the first shared_ptr owning the object is created. If you call shared_from_this() before that (like in the constructor or on a stack object), the weak_ptr is uninitialized and throws bad_weak_ptr. The object must be fully constructed and owned by at least one shared_ptr before shared_from_this() can be safely called.

**Key takeaway:** Only call shared_from_this() after the object is fully constructed and managed by a shared_ptr; never call it from constructors or on stack objects.

---

#### Q20: How do you implement a custom deleter for std::unique_ptr?
**Difficulty:** #intermediate  
**Category:** #implementation #memory_management  
**Concepts:** #unique_ptr #custom_deleter #template_parameters #lambda #functor

**Answer:**  
Provide a callable object (function, lambda, or functor) as the second template parameter and pass it to the constructor for runtime initialization.

**Code example:**
```cpp
// Function deleter
void fileClose(FILE* fp) {
    if (fp) std::fclose(fp);
}
std::unique_ptr<FILE, decltype(&fileClose)> file1(std::fopen("a.txt", "r"), &fileClose);

// Lambda deleter
auto deleter = [](FILE* fp) { if (fp) std::fclose(fp); };
std::unique_ptr<FILE, decltype(deleter)> file2(std::fopen("b.txt", "r"), deleter);

// Functor deleter
struct FileCloser {
    void operator()(FILE* fp) const { if (fp) std::fclose(fp); }
};
std::unique_ptr<FILE, FileCloser> file3(std::fopen("c.txt", "r"));
```

**Explanation:**  
unique_ptr's deleter is a template parameter, making it part of the type. For function pointers and lambdas, use decltype to deduce the type. Stateless deleters (empty functors or captureless lambdas) have zero size overhead due to empty base optimization. The deleter is called in unique_ptr's destructor when the pointer is non-null.

**Key takeaway:** unique_ptr deleters are statically typed and have zero overhead when stateless; use them for managing any resource requiring custom cleanup.

---

#### Q21: What is the difference between reset() and operator= for smart pointers?
**Difficulty:** #intermediate  
**Category:** #syntax #memory_management  
**Concepts:** #reset #operator_assignment #unique_ptr #shared_ptr

**Answer:**  
reset() releases the current resource and optionally takes ownership of a new one, while operator= transfers or shares ownership from another smart pointer.

**Code example:**
```cpp
auto p1 = std::make_unique<int>(10);
auto p2 = std::make_unique<int>(20);

p1 = std::move(p2);  // Destroys 10, p1 takes ownership of 20
// p1 owns 20, p2 is null

auto p3 = std::make_unique<int>(30);
p3.reset(new int(40));  // Destroys 30, p3 now owns 40

p3.reset();  // Destroys 40, p3 is null
```

**Explanation:**  
operator= is used for transferring ownership between smart pointers. For unique_ptr, it moves ownership; for shared_ptr, it copies shared ownership. reset() releases the current resource (calling the deleter) and can optionally take ownership of a new raw pointer. reset() without arguments releases the resource and sets the smart pointer to null.

**Key takeaway:** Use operator= to transfer ownership between smart pointers; use reset() to release the current resource and optionally acquire a new raw pointer.

---

#### Q22: Can you have a std::unique_ptr to an incomplete type?
**Difficulty:** #advanced  
**Category:** #compilation #memory_management  
**Concepts:** #unique_ptr #incomplete_type #forward_declaration #deleter

**Answer:**  
Yes, but the destructor must be defined in a translation unit where the type is complete, because unique_ptr needs to call delete on the complete type.

**Code example:**
```cpp
// Header file
class Impl;  // Forward declaration

class Widget {
    std::unique_ptr<Impl> pimpl_;  // ✅ OK: Incomplete type
public:
    Widget();
    ~Widget();  // Must be defined where Impl is complete
};

// Implementation file
#include "impl.h"  // Complete definition of Impl

Widget::Widget() : pimpl_(std::make_unique<Impl>()) {}
Widget::~Widget() = default;  // Default destructor, but Impl must be complete here
```

**Explanation:**  
unique_ptr can be instantiated with incomplete types because it only needs the complete type when calling the deleter. The compiler needs to see the complete type definition when generating the destructor code. If you use = default in the header with an incomplete type, compilation fails. Moving the destructor definition to the implementation file where the type is complete solves this.

**Key takeaway:** unique_ptr supports incomplete types for the Pimpl idiom, but the destructor must be defined where the type is complete.

---

#### Q23: How does std::weak_ptr prevent dangling pointers?
**Difficulty:** #intermediate  
**Category:** #memory_management #thread_safety  
**Concepts:** #weak_ptr #dangling_pointer #lock #expired

**Answer:**  
weak_ptr doesn't prevent the object's destruction but provides safe checking via expired() and lock() to detect if the object still exists before accessing it.

**Code example:**
```cpp
std::weak_ptr<int> weak;

{
    auto shared = std::make_shared<int>(42);
    weak = shared;
    
    if (!weak.expired()) {
        if (auto locked = weak.lock()) {
            std::cout << *locked;  // ✅ Safe: 42
        }
    }
}

// Object destroyed
if (weak.expired()) {
    std::cout << "Object no longer exists\n";
}

auto locked = weak.lock();
if (!locked) {
    std::cout << "Cannot access destroyed object\n";
}
```

**Explanation:**  
Unlike raw pointers that become dangling when the object is destroyed, weak_ptr remains valid as a handle but indicates the object is gone. The expired() method checks if the object was destroyed, and lock() atomically checks and returns either a valid shared_ptr (if alive) or an empty shared_ptr (if destroyed). This prevents undefined behavior from accessing destroyed objects.

**Key takeaway:** weak_ptr provides safe observation by allowing validity checking before access, eliminating dangling pointer undefined behavior.

---

#### Q24: What is the performance cost of using std::shared_ptr?
**Difficulty:** #advanced  
**Category:** #performance #memory_management  
**Concepts:** #shared_ptr #reference_counting #atomic_operations #overhead

**Answer:**  
shared_ptr has multiple performance costs: larger size (two pointers), control block allocation, atomic reference count operations, and cache misses from pointer indirection.

**Explanation:**  
Each shared_ptr is 16 bytes (on 64-bit) vs 8 bytes for raw pointer. Creating shared_ptr requires control block allocation (unless using make_shared). Every copy/move operation performs atomic increment/decrement of reference counts, which is slower than non-atomic operations and can cause cache-line contention in multithreaded code. Accessing the managed object requires two pointer dereferences (pointer to pointer). For small, frequently copied objects, this overhead can be significant.

**Key takeaway:** shared_ptr trades performance for safety and convenience; use unique_ptr when shared ownership isn't needed, or pass shared_ptr by const reference to avoid copies.

---

#### Q25: Can std::unique_ptr be returned by value from a function?
**Difficulty:** #intermediate  
**Category:** #ownership #move_semantics  
**Concepts:** #unique_ptr #return_value_optimization #move_semantics

**Answer:**  
Yes, returning unique_ptr by value is efficient due to move semantics and RVO (Return Value Optimization), and it clearly expresses transfer of ownership.

**Code example:**
```cpp
std::unique_ptr<int> createInt() {
    auto ptr = std::make_unique<int>(42);
    // Expensive computation...
    return ptr;  // ✅ Move or RVO, no explicit std::move needed
}

std::unique_ptr<int> result = createInt();  // Ownership transferred
```

**Explanation:**  
When returning unique_ptr by value, the compiler either applies RVO (constructing the object directly in the caller's space) or automatic move semantics (no explicit std::move required for return values). This efficiently transfers ownership from the function to the caller with zero or minimal overhead. This pattern is the standard idiom for factory functions and clearly expresses that the caller receives ownership.

**Key takeaway:** Return unique_ptr by value to transfer ownership; RVO and automatic move semantics make this efficient and express ownership transfer clearly.

---

#### Q26: What happens when you use operator[] with std::unique_ptr<T> instead of std::unique_ptr<T[]>?
**Difficulty:** #intermediate  
**Category:** #pitfalls #syntax  
**Concepts:** #unique_ptr #arrays #undefined_behavior #operator_overloading

**Answer:**  
operator[] is not available for unique_ptr<T>, resulting in a compilation error; if you bypass this with casting, it invokes undefined behavior in the destructor.

**Code example:**
```cpp
std::unique_ptr<int> bad(new int[10]);
// bad[5] = 10;  // ❌ Compilation error: no operator[]
// Destructor calls delete, not delete[] → undefined behavior

std::unique_ptr<int[]> good(new int[10]);
good[5] = 10;  // ✅ OK: operator[] available
// Destructor calls delete[]
```

**Explanation:**  
The non-array unique_ptr<T> does not provide operator[] because it's designed for single objects and uses delete. If you allocate an array but use unique_ptr<T>, the destructor calls delete instead of delete[], causing undefined behavior (typically leaking all elements except the first). The array specialization unique_ptr<T[]> provides operator[] and correctly calls delete[].

**Key takeaway:** Always use unique_ptr<T[]> for arrays to get correct operator[] and delete[] semantics; better yet, use std::vector or std::array.

---

#### Q27: How do you check if a std::unique_ptr is empty?
**Difficulty:** #beginner  
**Category:** #syntax #memory_management  
**Concepts:** #unique_ptr #nullptr #bool_conversion

**Answer:**  
Use the bool conversion operator or compare with nullptr: `if (ptr)` or `if (ptr == nullptr)`.

**Code example:**
```cpp
std::unique_ptr<int> ptr1;  // Empty (nullptr)
std::unique_ptr<int> ptr2 = std::make_unique<int>(42);

if (!ptr1) {
    std::cout << "ptr1 is empty\n";  // ✅ True
}

if (ptr2) {
    std::cout << "ptr2 is valid\n";  // ✅ True
}

if (ptr1 == nullptr) {
    std::cout << "Explicit nullptr check\n";  // ✅ True
}
```

**Explanation:**  
Smart pointers provide a bool conversion operator that returns true if the pointer is non-null and false if null. This allows natural usage in conditional statements. You can also explicitly compare with nullptr. After moving from a unique_ptr or calling reset(), the pointer becomes null.

**Key takeaway:** Use bool conversion (`if (ptr)`) to check smart pointer validity naturally; the pointer is null after move or reset.

---

#### Q28: What is the advantage of using std::unique_ptr over manual new/delete?
**Difficulty:** #beginner  
**Category:** #raii #exception_safety #interview_favorite  
**Concepts:** #unique_ptr #automatic_cleanup #exception_safety #leak_prevention

**Answer:**  
unique_ptr provides automatic cleanup through RAII, ensuring the resource is deleted even during exceptions, early returns, or multiple exit paths.

**Code example:**
```cpp
// ❌ Manual: Memory leak if doWork() throws
void badFunction() {
    int* ptr = new int(42);
    doWork(ptr);  // If this throws, delete never called
    delete ptr;
}

// ✅ RAII: Automatic cleanup even with exceptions
void goodFunction() {
    auto ptr = std::make_unique<int>(42);
    doWork(ptr.get());  // If this throws, ptr's destructor called
}  // Automatic cleanup
```

**Explanation:**  
With manual new/delete, exceptions, early returns, or complex control flow can skip the delete statement, causing memory leaks. unique_ptr's destructor is always called during stack unwinding, guaranteeing cleanup. This eliminates an entire class of memory leaks and makes exception-safe code natural. It also prevents accidental double-deletes and use-after-free bugs.

**Key takeaway:** unique_ptr provides automatic, exception-safe memory management through RAII, making manual new/delete obsolete in modern C++.

---

#### Q29: When should you use std::shared_ptr instead of std::unique_ptr?
**Difficulty:** #intermediate  
**Category:** #design #ownership #interview_favorite  
**Concepts:** #shared_ptr #unique_ptr #shared_ownership #design_pattern

**Answer:**  
Use shared_ptr only when multiple independent owners genuinely need shared lifetime responsibility; default to unique_ptr for single ownership scenarios.

**Explanation:**  
shared_ptr should be used when ownership is truly shared—multiple components need the object to stay alive and there's no clear single owner. Common scenarios include: shared caches, nodes in graphs with multiple parents, resources shared across threads where lifetime isn't predictable, and observer patterns where observers need to keep objects alive. For most cases, unique_ptr is sufficient and more efficient. Passing shared_ptr by reference allows access without shared ownership.

**Key takeaway:** Use unique_ptr by default for single ownership; use shared_ptr only when genuine shared lifetime responsibility is required, not just for convenience.

---

#### Q30: What is the difference between get() and release() for std::unique_ptr?
**Difficulty:** #intermediate  
**Category:** #syntax #ownership  
**Concepts:** #unique_ptr #get #release #ownership_transfer

**Answer:**  
get() returns the raw pointer while retaining ownership, while release() returns the raw pointer and gives up ownership without deleting the object.

**Code example:**
```cpp
auto ptr = std::make_unique<int>(42);

// get(): Returns pointer, keeps ownership
int* raw1 = ptr.get();  // ✅ ptr still owns the object
std::cout << *raw1;     // Safe while ptr exists
// Don't delete raw1! ptr will delete it

// release(): Returns pointer, gives up ownership
int* raw2 = ptr.release();  // ptr is now nullptr
// YOU must delete raw2 manually
delete raw2;
```

**Explanation:**  
get() is for observing the pointer when you need to pass it to legacy APIs or access the raw pointer temporarily. The unique_ptr retains ownership and will delete the object. release() transfers ownership to the caller, setting the unique_ptr to nullptr. The caller becomes responsible for deletion. This is useful when transferring ownership to legacy code or other ownership systems.

**Key takeaway:** Use get() for temporary access while keeping ownership; use release() only when transferring ownership out of unique_ptr to manual management.

---

#### Q31: How does make_shared handle exceptions during construction?
**Difficulty:** #advanced  
**Category:** #exception_safety #memory_management  
**Concepts:** #make_shared #exception_safety #control_block #raii

**Answer:**  
make_shared is exception-safe because it performs a single allocation; if the constructor throws, the entire allocation (object + control block) is automatically freed.

**Code example:**
```cpp
class ThrowsInConstructor {
public:
    ThrowsInConstructor() {
        throw std::runtime_error("Construction failed");
    }
};

try {
    // ✅ Exception-safe: Single allocation cleaned up atomically
    auto ptr = std::make_shared<ThrowsInConstructor>();
} catch (...) {
    // No leak: make_shared freed the allocation
}

try {
    // ❌ Potential leak if exception between allocations
    std::shared_ptr<ThrowsInConstructor> ptr(new ThrowsInConstructor());
    // If 'new' succeeds but shared_ptr construction throws,
    // object leaks (theoretical, but make_shared is safer)
} catch (...) {
}
```

**Explanation:**  
make_shared allocates object and control block together. If the constructor throws during this single allocation, the memory is freed as a unit—no chance for partial allocation leaks. With direct construction `shared_ptr<T>(new T)`, there are two separate allocations. While modern compilers prevent leaks here, make_shared is fundamentally more exception-safe by design.

**Key takeaway:** make_shared provides strong exception safety through single allocation; always prefer it over direct shared_ptr construction for exception-safe code.

---

#### Q32: Can std::shared_ptr manage arrays?
**Difficulty:** #intermediate  
**Category:** #memory_management #arrays  
**Concepts:** #shared_ptr #arrays #custom_deleter #delete_operator

**Answer:**  
Yes, but you must provide a custom deleter using delete[] since shared_ptr defaults to delete for single objects.

**Code example:**
```cpp
// ❌ Wrong: Uses delete, not delete[]
std::shared_ptr<int> bad(new int[10]);  // Undefined behavior

// ✅ Custom deleter for arrays
std::shared_ptr<int> good(new int[10], [](int* p) { delete[] p; });
good.get()[5] = 42;  // Must use get() since no operator[]

// ✅ C++17: shared_ptr<T[]> specialization
std::shared_ptr<int[]> better(new int[10]);
better[5] = 42;  // ✅ operator[] available

// ✅ Best: Use vector
auto best = std::make_shared<std::vector<int>>(10);
(*best)[5] = 42;
```

**Explanation:**  
Unlike unique_ptr which has an array specialization, shared_ptr (before C++17) doesn't distinguish between single objects and arrays in its type. You must provide a custom deleter that calls delete[]. C++17 added shared_ptr<T[]> specialization similar to unique_ptr. However, wrapping a std::vector in shared_ptr is usually clearer and provides additional functionality.

**Key takeaway:** For arrays with shared_ptr, use custom delete[] deleter or C++17's shared_ptr<T[]>; prefer wrapping std::vector for clearer semantics.

---

#### Q33: What is the overhead of atomic operations in std::shared_ptr?
**Difficulty:** #advanced  
**Category:** #performance #concurrency  
**Concepts:** #shared_ptr #atomic_operations #reference_counting #cache_contention

**Answer:**  
Atomic reference count operations are slower than regular increments and can cause cache-line contention when multiple threads frequently copy the same shared_ptr.

**Explanation:**  
Atomic operations (used for reference counting) require special CPU instructions and memory barriers, making them significantly slower than regular integer operations. When multiple threads copy a shared_ptr, they contend for the same cache line containing the control block, causing cache invalidation and performance degradation. This is particularly noticeable in highly parallel code. Passing shared_ptr by const reference avoids copies and eliminates this overhead when shared ownership isn't needed.

**Key takeaway:** Pass shared_ptr by const reference when the callee doesn't need shared ownership to avoid atomic operation overhead and cache contention.

---

#### Q34: How do you implement a factory function returning unique_ptr with polymorphism?
**Difficulty:** #intermediate  
**Category:** #design_pattern #polymorphism  
**Concepts:** #unique_ptr #factory_pattern #polymorphism #return_type

**Answer:**  
Return unique_ptr<Base> from the factory, constructing with make_unique<Derived>, which allows automatic conversion and maintains polymorphic behavior.

**Code example:**
```cpp
class Animal {
public:
    virtual void speak() const = 0;
    virtual ~Animal() = default;
};

class Dog : public Animal {
public:
    void speak() const override { std::cout << "Woof\n"; }
};

class Cat : public Animal {
public:
    void speak() const override { std::cout << "Meow\n"; }
};

// ✅ Factory returning base class unique_ptr
std::unique_ptr<Animal> createAnimal(const std::string& type) {
    if (type == "dog")
        return std::make_unique<Dog>();
    else if (type == "cat")
        return std::make_unique<Cat>();
    return nullptr;
}

auto animal = createAnimal("dog");
animal->speak();  // Polymorphic call: "Woof"
```

**Explanation:**  
unique_ptr<Derived> can be implicitly converted to unique_ptr<Base>, enabling polymorphic factories. The factory creates the derived object with make_unique<Derived> and returns it as unique_ptr<Base>. Virtual destructors ensure proper cleanup through the base pointer. This pattern transfers ownership while maintaining polymorphic behavior.

**Key takeaway:** Factory functions should return unique_ptr<Base> for polymorphic types; make_unique<Derived> automatically converts to the base type.

---

#### Q35: What is the purpose of unique_ptr::swap()?
**Difficulty:** #beginner  
**Category:** #syntax #ownership  
**Concepts:** #unique_ptr #swap #ownership_transfer #noexcept

**Answer:**  
swap() exchanges ownership between two unique_ptrs efficiently without allocation or deallocation, and it is noexcept.

**Code example:**
```cpp
auto ptr1 = std::make_unique<int>(10);
auto ptr2 = std::make_unique<int>(20);

std::cout << *ptr1 << ", " << *ptr2;  // 10, 20

ptr1.swap(ptr2);
// or: std::swap(ptr1, ptr2);

std::cout << *ptr1 << ", " << *ptr2;  // 20, 10
```

**Explanation:**  
swap() exchanges the internal pointers of two unique_ptrs without any allocation, deallocation, or object copying. This is an O(1) operation that simply swaps pointer values. It's noexcept because it only manipulates pointers. This is useful for implementing swap-based algorithms, optimizing move operations, and implementing swap-based assignment operators in custom types.

**Key takeaway:** Use swap() for efficient, noexcept ownership exchange between unique_ptrs; it's O(1) with no allocations.

---
