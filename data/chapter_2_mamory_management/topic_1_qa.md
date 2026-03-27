## TOPIC: Memory Management in C++

### INTERVIEW_QA: Comprehensive Questions

#### Q1: What is the fundamental difference between stack and heap memory?
**Difficulty:** #beginner  
**Category:** #memory_management #fundamentals  
**Concepts:** #stack #heap #automatic_storage #dynamic_memory

**Answer:**  
Stack memory is automatically managed with LIFO allocation, while heap memory requires manual management with dynamic allocation and deallocation.

**Explanation:**  
Stack memory is allocated and deallocated automatically as functions are called and return, with extremely fast allocation via simple pointer arithmetic. Heap memory persists until explicitly freed, allocated through the system allocator which manages a complex free store. Stack has limited size (typically 1-8 MB), while heap can grow much larger subject to available system memory.

**Key takeaway:** Use stack for small, short-lived objects; use heap (preferably via RAII containers) for large objects or those with complex lifetimes.

---

#### Q2: Why is returning a pointer to a local variable dangerous?
**Difficulty:** #beginner  
**Category:** #memory_management #undefined_behavior  
**Concepts:** #stack #dangling_pointer #lifetime #undefined_behavior

**Answer:**  
Local variables are destroyed when their function returns, making the returned pointer point to invalid memory that may be overwritten or unmapped.

**Explanation:**  
Stack memory occupied by local variables is reclaimed when the function exits. A pointer to this memory becomes a dangling pointer referring to memory that's either reused by subsequent function calls or marked as invalid by the OS. Dereferencing such pointers causes undefined behavior that may crash, return garbage values, or appear to work temporarily.

**Key takeaway:** Never return pointers or references to local stack variables; return by value, use heap allocation with smart pointers, or use static storage.

---

#### Q3: What happens if you use `delete` instead of `delete[]` for an array?
**Difficulty:** #intermediate  
**Category:** #memory_management #undefined_behavior  
**Concepts:** #new #delete #array_allocation #destructors #heap_corruption

**Answer:**  
Using `delete` instead of `delete[]` causes undefined behavior, typically calling only the first destructor and potentially corrupting the heap allocator's bookkeeping.

**Explanation:**  
The `delete[]` operator knows the array size and invokes destructors for all elements before deallocating the entire block. Scalar `delete` only invokes the first destructor and attempts to free memory with incorrect size information, leading to heap corruption. For classes with destructors, this leaks resources from non-destructed elements.

**Key takeaway:** Always match allocation and deallocation operators: `new`→`delete`, `new[]`→`delete[]`, or better yet, use `std::vector` or `std::array`.

---

#### Q4: What is a dangling pointer and how does it occur?
**Difficulty:** #beginner  
**Category:** #memory_management #undefined_behavior  
**Concepts:** #dangling_pointer #delete #use_after_free #undefined_behavior

**Answer:**  
A dangling pointer points to memory that has been freed or deallocated, and accessing it causes undefined behavior.

**Code example:**
```cpp
int* p = new int(42);
delete p;
std::cout << *p;  // ❌ Dangling pointer dereference
```

**Explanation:**  
After `delete p`, the memory is returned to the heap allocator and may be immediately reused for other allocations. The pointer `p` still holds the old address but that memory is no longer valid. Dereferencing it can crash, return garbage, or appear to work temporarily, making bugs hard to diagnose.

**Key takeaway:** Set pointers to `nullptr` after deletion to catch dangling pointer bugs early with deterministic null pointer crashes.

---

#### Q5: Why is mixing `malloc`/`free` with `new`/`delete` undefined behavior?
**Difficulty:** #intermediate  
**Category:** #memory_management #undefined_behavior  
**Concepts:** #malloc #free #new #delete #allocators #constructors

**Answer:**  
They use different allocators with incompatible bookkeeping, and `new`/`delete` handle object construction/destruction while `malloc`/`free` only manage raw memory.

**Explanation:**  
C++'s `operator new` may use a different heap allocator than C's `malloc`, with incompatible metadata structures. More critically, `new` invokes constructors and `delete` invokes destructors, while `malloc`/`free` work with uninitialized bytes. Using `delete` on `malloc`'d memory attempts to call a destructor on uninitialized data and frees memory the allocator doesn't recognize.

**Key takeaway:** Never mix C and C++ memory management; stick to `new`/`delete` or preferably modern RAII containers and smart pointers.

---

#### Q6: What causes memory leaks and how do smart pointers prevent them?
**Difficulty:** #intermediate  
**Category:** #memory_management #raii  
**Concepts:** #memory_leak #smart_pointers #unique_ptr #raii #destructors

**Answer:**  
Memory leaks occur when allocated memory is not deallocated, losing all references to it. Smart pointers prevent leaks through automatic deallocation in their destructors.

**Code example:**
```cpp
void leak() {
    int* p = new int(100);
    p = new int(200);  // ❌ First allocation leaked
}

void safe() {
    auto p = std::make_unique<int>(100);
    p = std::make_unique<int>(200);  // ✅ First auto-deleted
}
```

**Explanation:**  
When a raw pointer is reassigned without deleting its target, the original memory becomes unreachable but still allocated. Smart pointers implement RAII: their destructors automatically delete managed objects, even during reassignment or exceptions. This eliminates the most common leak source.

**Key takeaway:** Prefer `std::unique_ptr` and `std::make_unique` over raw `new`/`delete` to prevent leaks through automatic lifetime management.

---

#### Q7: What is RAII and why is it fundamental to modern C++?
**Difficulty:** #intermediate  
**Category:** #design_pattern #raii  
**Concepts:** #raii #destructors #exception_safety #resource_management #smart_pointers

**Answer:**  
RAII (Resource Acquisition Is Initialization) ties resource lifetime to object lifetime, acquiring resources in constructors and releasing them in destructors for automatic cleanup.

**Explanation:**  
RAII ensures resources are released even when functions exit via exceptions, early returns, or normal flow. C++ guarantees destructors run during stack unwinding, making RAII objects self-cleaning. This pattern underlies smart pointers, containers, locks, and file handles, eliminating most manual resource management and memory leaks.

**Key takeaway:** Embrace RAII by using smart pointers, containers, and scope-based resource management instead of manual allocation/deallocation.

---

#### Q8: How does `std::unique_ptr` enforce single ownership?
**Difficulty:** #intermediate  
**Category:** #smart_pointers #design_pattern  
**Concepts:** #unique_ptr #move_semantics #ownership #deleted_functions #raii

**Answer:**  
`std::unique_ptr` deletes its copy constructor and copy assignment operator, allowing only move operations that transfer ownership.

**Code example:**
```cpp
std::unique_ptr<int> p1 = std::make_unique<int>(42);
// auto p2 = p1;  // ❌ Compile error: copy deleted
auto p2 = std::move(p1);  // ✅ Ownership transferred, p1 becomes nullptr
```

**Explanation:**  
By deleting copy operations at compile time, `unique_ptr` prevents multiple pointers from managing the same resource, eliminating double-delete bugs. Move semantics explicitly transfer ownership, making the source pointer null. This provides zero-overhead exclusive ownership with compiler-enforced safety.

**Key takeaway:** Use `std::unique_ptr` as the default smart pointer for exclusive ownership, only upgrading to `shared_ptr` when shared ownership is genuinely needed.

---

#### Q9: What is exception safety and how does RAII provide it?
**Difficulty:** #advanced  
**Category:** #exception_safety #raii  
**Concepts:** #exception_safety #stack_unwinding #destructors #raii #resource_management

**Answer:**  
Exception safety means resources are properly cleaned up when exceptions occur. RAII provides this through automatic destructor invocation during stack unwinding.

**Code example:**
```cpp
void unsafe() {
    Resource* r = new Resource();
    mightThrow();  // ❌ If throws, r is leaked
    delete r;
}

void safe() {
    std::unique_ptr<Resource> r = std::make_unique<Resource>();
    mightThrow();  // ✅ Destructor runs even if exception thrown
}
```

**Explanation:**  
When exceptions propagate, C++ performs stack unwinding, calling destructors for all stack-allocated objects in reverse construction order. RAII objects like smart pointers and containers have destructors that release resources, making cleanup automatic regardless of execution path. Raw pointers bypass this mechanism, requiring manual try-catch blocks.

**Key takeaway:** RAII makes exception-safe code the default; avoid manual resource management that requires explicit exception handling.

---

#### Q10: What is the difference between `std::make_unique` and `new`?
**Difficulty:** #beginner  
**Category:** #smart_pointers #memory_management  
**Concepts:** #make_unique #unique_ptr #new #exception_safety #raii

**Answer:**  
`std::make_unique` allocates memory and constructs an object, returning a `unique_ptr`, while `new` returns a raw pointer requiring manual deletion.

**Code example:**
```cpp
auto p1 = std::make_unique<Widget>(42);  // ✅ RAII, exception-safe
Widget* p2 = new Widget(42);             // ❌ Manual management needed
delete p2;
```

**Explanation:**  
`make_unique` combines allocation and unique_ptr construction in a single operation that's exception-safe. It also avoids typing the type twice and prevents certain exception-safety issues in function calls. Raw `new` requires matching `delete`, is not exception-safe, and risks leaks if exceptions occur before deletion.

**Key takeaway:** Always prefer `std::make_unique` over `new` for automatic lifetime management and exception safety.

---

#### Q11: Why is `delete nullptr` safe but `delete` on a dangling pointer is not?
**Difficulty:** #intermediate  
**Category:** #memory_management #undefined_behavior  
**Concepts:** #delete #nullptr #dangling_pointer #undefined_behavior #null_pointer

**Answer:**  
The C++ standard defines `delete nullptr` as a safe no-op, but deleting dangling pointers causes undefined behavior as they point to invalid memory.

**Explanation:**  
`nullptr` is a special value that explicitly represents "no object," and the standard guarantees deleting it does nothing. Dangling pointers hold addresses of freed memory that may be reused, unmapped, or poisoned by allocators. Deleting them attempts to free already-freed memory, corrupting the heap allocator's internal structures and typically crashing.

**Key takeaway:** Always set pointers to `nullptr` after deletion to enable safe redundant deletes and catch use-after-free bugs early.

---

#### Q12: What is double delete and why does it cause crashes?
**Difficulty:** #intermediate  
**Category:** #memory_management #undefined_behavior  
**Concepts:** #double_delete #delete #undefined_behavior #heap_corruption

**Answer:**  
Double delete occurs when the same memory is freed twice, corrupting the heap allocator's internal data structures and typically causing immediate crashes.

**Code example:**
```cpp
int* p = new int(42);
int* q = p;
delete p;
delete q;  // ❌ Double delete: UB, likely crash
```

**Explanation:**  
When memory is freed, the allocator updates its bookkeeping to mark that memory as available. Freeing the same memory again corrupts this bookkeeping, potentially linking the memory block into free lists multiple times. Subsequent allocations can return the same memory to multiple clients, causing random memory corruption.

**Key takeaway:** Use `std::unique_ptr` to prevent double deletes through single-ownership enforcement, or set raw pointers to `nullptr` after deletion.

---

#### Q13: How does `std::shared_ptr` manage reference counting?
**Difficulty:** #advanced  
**Category:** #smart_pointers #memory_management  
**Concepts:** #shared_ptr #reference_counting #control_block #weak_ptr #memory_management

**Answer:**  
`std::shared_ptr` uses a control block containing reference counts to track how many shared_ptrs reference an object, deleting it when the count reaches zero.

**Explanation:**  
Each managed object has an associated control block (typically heap-allocated) storing a strong reference count and weak reference count. Copying a shared_ptr increments the count atomically (thread-safe), and destroying one decrements it. When the strong count reaches zero, the object is deleted. The control block is deleted when both strong and weak counts reach zero.

**Key takeaway:** Use `std::make_shared` to allocate object and control block together for better cache locality and performance.

---

#### Q14: What are the performance implications of stack vs heap allocation?
**Difficulty:** #intermediate  
**Category:** #performance #memory_management  
**Concepts:** #stack #heap #performance #cache_locality #allocation_cost

**Answer:**  
Stack allocation is orders of magnitude faster than heap allocation because it's simple pointer arithmetic versus complex allocator operations with synchronization.

**Explanation:**  
Stack allocation involves incrementing a stack pointer by the object's size—typically a single instruction. Heap allocation requires finding free memory blocks, updating complex data structures, and often involves locking for thread safety. Additionally, stack memory typically has better cache locality as it's contiguous and recently accessed, while heap allocations can be scattered across memory.

**Key takeaway:** Prefer stack allocation for small, short-lived objects; use heap only when object size is large, lifetime extends beyond scope, or size is unknown at compile time.

---

#### Q15: What is a memory leak and how do tools like Valgrind detect them?
**Difficulty:** #intermediate  
**Category:** #memory_management #debugging  
**Concepts:** #memory_leak #valgrind #debugging #heap_profiling #memory_tools

**Answer:**  
Memory leaks occur when allocated memory is never freed and all references to it are lost. Tools like Valgrind track all allocations and deallocations to identify unreachable memory.

**Explanation:**  
Valgrind's Memcheck tool intercepts all memory management calls (`malloc`, `new`, `free`, `delete`) and maintains a shadow state tracking which memory is allocated, freed, or leaked. At program termination, it performs reachability analysis from all roots (stack, globals, registers) and reports any heap memory that was allocated but never freed and is unreachable.

**Key takeaway:** Use Valgrind with `--leak-check=full` during development to catch leaks early; better yet, use RAII to prevent leaks entirely.

---

#### Q16: Why can large local objects cause stack overflow?
**Difficulty:** #intermediate  
**Category:** #memory_management #undefined_behavior  
**Concepts:** #stack #stack_overflow #stack_size #heap #large_objects

**Answer:**  
The stack has limited size (typically 1-8 MB), so allocating large objects on it can exceed this limit, causing stack overflow errors and crashes.

**Code example:**
```cpp
void danger() {
    int hugeArray[1000000];  // ~4 MB, may overflow stack
}

void safe() {
    std::vector<int> hugeArray(1000000);  // ✅ Uses heap
}
```

**Explanation:**  
Stack space is allocated at thread creation with fixed size. When cumulative stack frames exceed this limit, the program attempts to access memory beyond the stack region, triggering a segmentation fault. Stack overflow can be environment-dependent—code that works on systems with larger stacks may crash on constrained systems or deeply recursive calls.

**Key takeaway:** Allocate large objects on the heap using containers or smart pointers; reserve stack for small, fixed-size objects and control flow.

---

#### Q17: What is the Rule of Zero and how does it relate to memory management?
**Difficulty:** #advanced  
**Category:** #design_pattern #memory_management  
**Concepts:** #rule_of_zero #raii #smart_pointers #copy_semantics #destructors

**Answer:**  
The Rule of Zero states that classes should not manually manage resources; instead, use RAII types like smart pointers and containers that handle memory automatically.

**Explanation:**  
If a class uses only standard library components (std::vector, std::unique_ptr, std::string) for resource management, the compiler-generated special member functions (destructor, copy/move constructors, copy/move assignment) work correctly automatically. This eliminates the need for custom destructors or copy control, reducing bugs and maintenance burden.

**Key takeaway:** Prefer composition with standard RAII types over manual resource management; only implement custom destructors when managing non-RAII resources.

---

#### Q18: How does `std::vector` manage its internal memory?
**Difficulty:** #advanced  
**Category:** #containers #memory_management  
**Concepts:** #vector #dynamic_array #capacity #reallocation #growth_strategy

**Answer:**  
`std::vector` manages a dynamically-allocated array that grows by reallocating to larger capacity when insertions exceed current capacity, typically using a growth factor of 1.5-2x.

**Explanation:**  
Vector maintains three pointers: begin (start of allocation), end (one past last element), and capacity_end (end of allocation). When `push_back` would exceed capacity, vector allocates new larger memory (often 2x current capacity), move-constructs all elements to the new location, destroys old elements, and deallocates old memory. This amortizes reallocation cost over insertions.

**Key takeaway:** Use `reserve()` when final size is known to avoid reallocations; vector provides both performance and safety through automatic memory management.

---

#### Q19: What is the difference between `nullptr`, `NULL`, and `0` in pointer contexts?
**Difficulty:** #beginner  
**Category:** #syntax #fundamentals  
**Concepts:** #nullptr #null #pointer #type_safety #constants

**Answer:**  
`nullptr` is a type-safe null pointer literal (since C++11), while `NULL` is a macro (typically 0) and `0` is an integer that can implicitly convert to pointers.

**Code example:**
```cpp
void func(int x);
void func(char* p);

func(NULL);    // ❌ Ambiguous: which overload?
func(nullptr); // ✅ Calls pointer overload unambiguously
```

**Explanation:**  
`nullptr` has type `std::nullptr_t` that converts to any pointer type but not to integral types, eliminating overload resolution ambiguities. `NULL` and `0` are integers, causing ambiguity in overloaded contexts. This makes `nullptr` essential for modern C++ code clarity and correctness.

**Key takeaway:** Always use `nullptr` instead of `NULL` or `0` for null pointers to ensure type safety and clear intent.

---

#### Q20: How do you detect use-after-free bugs?
**Difficulty:** #advanced  
**Category:** #debugging #undefined_behavior  
**Concepts:** #use_after_free #dangling_pointer #sanitizers #debugging #valgrind

**Answer:**  
Use-after-free bugs can be detected with AddressSanitizer (ASan), Valgrind, or by setting pointers to `nullptr` after deletion to cause deterministic crashes.

**Explanation:**  
AddressSanitizer poisons freed memory and catches accesses to it with precise error messages including allocation and free stack traces. Valgrind tracks validity of every byte, reporting invalid accesses. Both tools significantly slow execution but catch bugs that manifest inconsistently in production. Setting pointers to nullptr after delete converts silent corruption into immediate, debuggable crashes.

**Key takeaway:** Enable AddressSanitizer during development (`-fsanitize=address`) to catch memory errors early; prefer smart pointers to prevent use-after-free entirely.

---

#### Q21: What is the relationship between `new[]` and `delete[]` implementation?
**Difficulty:** #advanced  
**Category:** #memory_management #internals  
**Concepts:** #new #delete #array_allocation #operator_new #array_cookie

**Answer:**  
`new[]` stores array size information (array cookie) before the allocated memory block, which `delete[]` reads to invoke the correct number of destructors.

**Explanation:**  
When allocating arrays of non-trivial types, `operator new[]` allocates extra space for metadata storing the array size. The returned pointer points past this metadata to the first element. `delete[]` reads this metadata to know how many destructors to call before deallocating the entire block. Using scalar `delete` doesn't read this metadata, causing incorrect deallocation and skipped destructors.

**Key takeaway:** This implementation detail explains why mixing `new[]`/`delete` is catastrophic; always use matching operators or prefer std::vector.

---

#### Q22: How does `std::make_shared` differ from `std::shared_ptr<T>(new T)`?
**Difficulty:** #advanced  
**Category:** #smart_pointers #performance  
**Concepts:** #make_shared #shared_ptr #control_block #performance #exception_safety

**Answer:**  
`std::make_shared` allocates object and control block together in one allocation, providing better performance and exception safety than separate allocation.

**Code example:**
```cpp
auto p1 = std::make_shared<Widget>(args);           // ✅ One allocation
std::shared_ptr<Widget> p2(new Widget(args));       // Two allocations
```

**Explanation:**  
`make_shared` performs a single allocation for both the managed object and the control block (containing reference counts), improving cache locality and reducing allocation overhead. It's also exception-safe: `shared_ptr<T>(new T())` has a window between `new` and smart pointer construction where exceptions can leak memory, while `make_shared` is atomic.

**Key takeaway:** Always prefer `std::make_shared` over constructing shared_ptr from `new` for performance and exception safety.

---

#### Q23: What is the weak_ptr for and how does it prevent cycles?
**Difficulty:** #advanced  
**Category:** #smart_pointers #memory_management  
**Concepts:** #weak_ptr #shared_ptr #circular_reference #reference_counting #memory_leak

**Answer:**  
`std::weak_ptr` observes objects managed by `shared_ptr` without incrementing reference count, breaking reference cycles that would prevent deletion.

**Explanation:**  
Circular references (A owns B, B owns A) using shared_ptr create reference count cycles where neither object is ever deleted. Weak_ptr provides non-owning observation: it can check if the object still exists and temporarily promote to shared_ptr for access, but doesn't prevent deletion. This enables parent-child relationships where children hold weak_ptrs to parents.

**Key takeaway:** Use weak_ptr for back-references, caching, or observer patterns to avoid shared_ptr cycles and resulting memory leaks.

---

#### Q24: Why does C++ have both copy and move semantics for memory management?
**Difficulty:** #advanced  
**Category:** #move_semantics #performance  
**Concepts:** #move_semantics #copy_semantics #rvalue_references #performance #ownership

**Answer:**  
Move semantics enable efficient transfer of resources without expensive copying, crucial for types managing dynamic memory like vectors and smart pointers.

**Explanation:**  
Copy semantics create independent copies, requiring deep copying of all owned resources. For a vector with 1 million elements, returning by value would copy all elements without move semantics. Move semantics transfer ownership by "stealing" resources (swapping pointers), leaving the source in a valid but unspecified state. This makes returning containers from functions efficient.

**Key takeaway:** Move semantics enable efficient, expressive C++ with value semantics; use std::move explicitly for lvalues and rely on automatic move for temporaries.

---

#### Q25: What are the memory safety advantages of std::array over C arrays?
**Difficulty:** #intermediate  
**Category:** #containers #memory_management  
**Concepts:** #array #c_array #bounds_checking #stack_allocation #type_safety

**Answer:**  
`std::array` provides bounds checking with `at()`, prevents decay to pointers, knows its size, and integrates with standard algorithms while maintaining stack allocation.

**Code example:**
```cpp
int carr[10];                    // ❌ Decays to pointer, no size info
std::array<int, 10> arr;         // ✅ Maintains size, no decay

carr[-1] = 0;                    // ❌ UB, no checking
arr.at(-1) = 0;                  // ✅ Throws exception
```

**Explanation:**  
C arrays decay to pointers when passed to functions, losing size information. They have no bounds checking and support pointer arithmetic past bounds. `std::array` is a zero-overhead wrapper that preserves size in the type system, provides checked access, and works with iterators and algorithms. It's stack-allocated like C arrays but with modern C++ safety.

**Key takeaway:** Prefer `std::array` for fixed-size stack arrays to gain bounds checking and standard library integration without performance cost.

---

#### Q26: How do memory allocators impact performance in multi-threaded programs?
**Difficulty:** #advanced  
**Category:** #performance #memory_management  
**Concepts:** #allocators #threading #performance #heap_contention #memory_pools

**Answer:**  
Default allocators use locks to ensure thread safety, causing contention. High-frequency allocation across threads can serialize execution, degrading parallel performance.

**Explanation:**  
The system heap allocator (used by `new`/`delete`) maintains shared data structures that must be protected with locks. When multiple threads frequently allocate/deallocate, they contend for these locks, causing threads to block despite doing independent work. Solutions include thread-local caches, per-thread heaps, or memory pools for specific allocation patterns.

**Key takeaway:** For performance-critical multi-threaded code, consider custom allocators, memory pools, or allocator-aware containers to reduce heap contention.

---

#### Q27: What is placement new and when would you use it?
**Difficulty:** #advanced  
**Category:** #memory_management #advanced_features  
**Concepts:** #placement_new #memory_pools #custom_allocators #constructor #initialization

**Answer:**  
Placement new constructs an object at a specific memory location without allocating memory, used in memory pools, custom allocators, or reusing existing memory.

**Code example:**
```cpp
alignas(Widget) char buffer[sizeof(Widget)];
Widget* w = new (buffer) Widget(args);  // Construct in buffer
w->~Widget();                           // Must explicitly destroy
```

**Explanation:**  
Placement new separates memory allocation from object construction. It calls the constructor on pre-allocated memory without invoking `operator new`. This is essential for implementing custom allocators, memory pools, or containers that manage raw memory separately from object lifetime. Objects constructed via placement new must be explicitly destroyed by calling their destructor.

**Key takeaway:** Placement new is an advanced feature for custom memory management; most code should use standard containers and smart pointers.

---

#### Q28: How does copy elision relate to memory management?
**Difficulty:** #advanced  
**Category:** #optimization #move_semantics  
**Concepts:** #copy_elision #rvo #nrvo #optimization #move_semantics

**Answer:**  
Copy elision (including RVO/NRVO) allows compilers to eliminate copying by constructing objects directly in their final location, improving performance and preventing memory churn.

**Explanation:**  
Return Value Optimization (RVO) enables constructing return values directly in the caller's stack frame instead of constructing in the callee, copying to caller, and destroying the temporary. Since C++17, copy elision is mandatory for temporaries (prvalues). This means returning large containers by value is efficient, eliminating the need for output parameters or heap allocation for return values.

**Key takeaway:** Return values by value confidently; compilers optimize away copies, and move semantics handle cases where copy elision doesn't apply.

---

#### Q29: What is memory alignment and why does it matter?
**Difficulty:** #advanced  
**Category:** #memory_management #performance  
**Concepts:** #alignment #padding #performance #cache_line #undefined_behavior

**Answer:**  
Memory alignment ensures objects are located at addresses divisible by their alignment requirement, enabling efficient CPU access and preventing undefined behavior on some architectures.

**Explanation:**  
CPUs access memory most efficiently when addresses are multiples of data size (4-byte int at addresses 0, 4, 8...). Misaligned access can be slower (multiple memory transactions) or cause crashes on ARM. Compilers insert padding to maintain alignment, affecting struct size. Alignment also matters for cache line optimization (typically 64 bytes) to prevent false sharing in multi-threaded code.

**Key takeaway:** Trust compiler alignment defaults; use `alignas` only for specific performance needs like cache line alignment or SIMD requirements.

---

#### Q30: How do you safely transfer ownership from raw pointers to smart pointers?
**Difficulty:** #intermediate  
**Category:** #smart_pointers #memory_management  
**Concepts:** #unique_ptr #ownership #raw_pointer #legacy_code #adoption

**Answer:**  
Use `std::unique_ptr<T>(raw_ptr)` to transfer ownership from raw pointer to smart pointer, ensuring only one smart pointer manages the resource.

**Code example:**
```cpp
Widget* raw = new Widget();
std::unique_ptr<Widget> smart(raw);  // Takes ownership
// ❌ Don't create second smart ptr: std::unique_ptr<Widget>(raw)
raw = nullptr;  // ✅ Clear raw pointer to prevent accidental use
```

**Explanation:**  
When wrapping a raw pointer in unique_ptr, ownership transfers to the smart pointer, which will delete the object. Creating multiple smart pointers from the same raw pointer causes double deletion. When migrating legacy code, wrap raw pointers in smart pointers as early as possible in their lifetime, then clear the raw pointer to prevent accidental misuse.

**Key takeaway:** Transfer ownership to smart pointers once at allocation time; prefer `make_unique` over `new` to avoid ever holding raw owning pointers.

---
