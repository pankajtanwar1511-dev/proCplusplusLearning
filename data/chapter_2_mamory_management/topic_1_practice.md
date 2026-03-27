## TOPIC: Memory Management in C++

### PRACTICE_TASKS: Output Prediction and Analysis Questions

#### Q1
```cpp
int* createArray() {
    int arr[5] = {1, 2, 3, 4, 5};
    return arr;
}

int main() {
    int* ptr = createArray();
    std::cout << ptr[0];
}
```

**Answer:**
```
Undefined behavior (likely crash or garbage value)
```

**Explanation:**
- `int arr[5]` creates local array on stack inside createArray()
- Function returns pointer to this local array
- When createArray() returns, stack frame destroyed, arr goes out of scope
- `ptr` now points to invalid/deallocated stack memory (dangling pointer)
- Dereferencing `ptr[0]` is undefined behavior - may crash, print garbage, or appear to work
- **Key Concept:** Never return pointers to local variables - they don't survive function return

---

#### Q2
```cpp
void test() {
    int* p = new int[100];
    delete p;
}
```

**Answer:**
```
Undefined behavior (memory leak/corruption)
```

**Explanation:**
- `new int[100]` allocates array of 100 ints on heap
- `delete p` uses scalar delete (wrong!)
- Should use `delete[]` for array allocated with `new[]`
- Scalar delete only deletes first element, rest of array leaks
- Heap corruption possible - internal allocator bookkeeping corrupted
- **Key Concept:** Always match new[] with delete[], and new with delete

---

#### Q3
```cpp
int* allocate() {
    return new int(42);
}

void process() {
    int* p = allocate();
    int* q = allocate();
    p = q;
    delete p;
    delete q;
}
```

**Answer:**
```
Memory leak + Double delete crash
```

**Explanation:**
- `p = allocate()` allocates first int(42) on heap
- `q = allocate()` allocates second int(42) on heap
- `p = q` overwrites p's value - first allocation lost forever (memory leak!)
- Now both p and q point to same memory (second allocation)
- `delete p` frees the second allocation
- `delete q` tries to free same memory again (double delete) - undefined behavior/crash
- **Key Concept:** Pointer reassignment loses track of allocated memory; deleting same memory twice is UB

---

#### Q4
```cpp
class Widget {
    int* data;
public:
    Widget() : data(new int[10]) {}
    ~Widget() { delete[] data; }
};

void test() {
    Widget w1;
    Widget w2 = w1;
}
```

**Answer:**
```
Double delete crash
```

**Explanation:**
- Widget has pointer member data, allocates int[10] in constructor
- Destructor deletes the array
- `Widget w2 = w1` uses compiler-generated copy constructor (shallow copy)
- Shallow copy: w1.data and w2.data point to SAME array
- End of scope: w2 destroyed first, delete[] w2.data succeeds
- Then w1 destroyed, delete[] w1.data tries to delete already-freed memory (double delete!)
- **Key Concept:** Rule of Three - if you define destructor, must define copy constructor/assignment to avoid double-delete

---

#### Q5
```cpp
void mystery() {
    int* p = (int*)malloc(sizeof(int) * 5);
    p[0] = 10;
    delete[] p;
}
```

**Answer:**
```
Undefined behavior
```

**Explanation:**
- `malloc()` is C-style allocation, allocates raw memory
- `delete[]` is C++ deallocation, expects memory from new[]
- Mixing C and C++ allocation/deallocation is undefined behavior
- Different allocators have incompatible internal bookkeeping
- Must pair malloc with free(), new with delete, new[] with delete[]
- **Key Concept:** Never mix C (malloc/free) and C++ (new/delete) memory management

---

#### Q6
```cpp
int* global = new int(100);

void func() {
    int* local = global;
    delete local;
}

int main() {
    func();
    std::cout << *global;
}
```

**Answer:**
```
Undefined behavior (use-after-free)
```

**Explanation:**
- `global` points to heap-allocated int(100)
- `local = global` makes local point to same memory
- `delete local` frees the memory
- `global` still holds the address but memory is freed (dangling pointer)
- `*global` in main dereferences freed memory (use-after-free)
- Undefined behavior - may crash, print garbage, or appear to work
- **Key Concept:** Deleting memory through one pointer makes all other pointers to same memory dangle

---

#### Q7
```cpp
void allocate() {
    std::unique_ptr<int> p = std::make_unique<int>(42);
    std::unique_ptr<int> q = p;
}
```

**Answer:**
```
Compilation error
```

**Explanation:**
- unique_ptr enforces exclusive ownership (only one owner at a time)
- Copy constructor is explicitly deleted: unique_ptr(const unique_ptr&) = delete
- `std::unique_ptr<int> q = p` attempts to copy p to q (compilation error!)
- Must use move semantics: `q = std::move(p)` to transfer ownership
- After move, p becomes nullptr, q owns the int
- **Key Concept:** unique_ptr is non-copyable, only movable - enforces single ownership

---

#### Q8
```cpp
struct Large {
    int data[10000000];
};

void stackTest() {
    Large obj;
}
```

**Answer:**
```
Stack overflow crash (segmentation fault)
```

**Explanation:**
- `Large obj` attempts to allocate 10,000,000 ints on stack
- Size: 10,000,000 × 4 bytes = 40 MB
- Typical stack size limit: 1-8 MB (platform dependent)
- Exceeds stack limit → stack overflow → crash
- Solution: allocate on heap (`new Large` or `std::make_unique<Large>()`)
- **Key Concept:** Stack has limited size; large objects must be heap-allocated

---

#### Q9
```cpp
int* x = new int(5);
int* y = x;
delete x;
x = nullptr;
delete y;
```

**Answer:**
```
Undefined behavior (double delete)
```

**Explanation:**
- `x` and `y` both point to same heap memory (int containing 5)
- `delete x` frees the memory
- `x = nullptr` only affects x, y still holds the old address
- `delete y` attempts to free already-freed memory (double delete!)
- Setting x to nullptr doesn't magically update y
- **Key Concept:** Multiple pointers can point to same memory; deleting through one doesn't affect others

---

#### Q10
```cpp
void test() {
    int* arr = new int[10];
    arr[10] = 0;
    delete[] arr;
}
```

**Answer:**
```
Undefined behavior (buffer overflow before delete)
```

**Explanation:**
- `new int[10]` allocates array with valid indices 0-9
- `arr[10]` accesses element beyond array bounds (buffer overflow)
- Writing to arr[10] corrupts memory (could be heap metadata, other variables, etc.)
- May crash immediately, corrupt heap, or silently damage program state
- `delete[]` may crash later due to corrupted heap
- **Key Concept:** Array indices are 0-based; array[N] has valid indices 0 to N-1

---

#### Q11
```cpp
class Resource {
    int* data;
public:
    Resource() : data(new int(42)) {}
    ~Resource() { delete data; }
};

void test() {
    std::vector<Resource> vec;
    vec.push_back(Resource());
}
```

**Answer:**
```
Double delete crash (during vector operations)
```

**Explanation:**
- Resource violates Rule of Three (has destructor but no copy constructor)
- Compiler generates shallow-copy copy constructor
- `push_back` may cause vector reallocation, copying existing elements
- Shallow copy: multiple Resource objects point to same data
- When any Resource destroyed, it deletes data
- Other Resources' destructors try to delete already-freed memory (double delete!)
- **Key Concept:** Rule of Three - destructor + raw pointers requires custom copy constructor/assignment

---

#### Q12
```cpp
void leak() {
    int* p = new int(10);
    if (true) {
        return;
    }
    delete p;
}
```

**Answer:**
```
Memory leak (int(10) never freed)
```

**Explanation:**
- `new int(10)` allocates memory on heap
- `if (true)` always executes, function returns early
- `delete p` line never reached (dead code)
- Allocated memory never freed, leaked for program lifetime
- Solution: use RAII (unique_ptr) or ensure delete in all code paths
- **Key Concept:** Early returns/exceptions can skip manual cleanup - use RAII/smart pointers

---

#### Q13
```cpp
int* create() {
    static int x = 100;
    return &x;
}

int main() {
    int* p = create();
    *p = 200;
    std::cout << *create();
}
```

**Answer:**
```
Prints 200
```

**Explanation:**
- `static int x = 100` creates variable with static storage duration (program lifetime)
- Unlike local variables, static variables persist after function returns
- Returning pointer to static variable is safe (doesn't dangle)
- First call: `create()` returns pointer to static x (value 100)
- `*p = 200` modifies the static x through pointer
- Second call: `*create()` accesses same static x, now modified to 200
- **Key Concept:** Static variables live for entire program, safe to return pointers to them

---

#### Q14
```cpp
std::shared_ptr<int> p1 = std::make_shared<int>(10);
std::shared_ptr<int> p2 = p1;
std::shared_ptr<int> p3 = p1;
p1.reset();
std::cout << *p2;
```

**Answer:**
```
Prints 10
```

**Explanation:**
- `make_shared<int>(10)` allocates int on heap with shared ownership
- `p2 = p1` and `p3 = p1` create copies, incrementing reference count to 3
- All three pointers share ownership of same int(10)
- `p1.reset()` decrements reference count from 3 to 2
- Object NOT deleted because count is still 2 (p2 and p3 still own it)
- `*p2` safely dereferences the still-alive object, prints 10
- Object will be deleted only when p2 and p3 also destroyed/reset
- **Key Concept:** shared_ptr uses reference counting; object deleted when count reaches zero

---

#### Q15
```cpp
void test() {
    int* p = nullptr;
    delete p;
    std::cout << "Safe";
}
```

**Answer:**
```
Prints "Safe"
```

**Explanation:**
- `int* p = nullptr` initializes pointer to null
- `delete p` where p is nullptr is explicitly safe in C++ (well-defined no-op)
- C++ standard guarantees: deleting nullptr does nothing (no crash, no UB)
- This allows safe cleanup without checking: `delete ptr; ptr = nullptr;`
- Many RAII patterns rely on this guarantee
- Common idiom: always initialize pointers to nullptr for safety
- **Key Concept:** Deleting nullptr is always safe; this is a C++ language guarantee

---

#### Q16
```cpp
class Widget {
public:
    int* ptr;
    Widget() : ptr(new int(42)) {}
};

void test() {
    Widget* w = new Widget();
    delete w;
}
```

**Answer:**
```
Memory leak (int(42) never freed)
```

**Explanation:**
- Constructor allocates int(42) on heap, stores pointer in `ptr`
- Widget has no user-defined destructor
- Compiler-generated destructor only destroys members' values (pointer value), not what it points to
- `delete w` calls destructor, which doesn't free the int(42)
- Allocated int leaks - memory never reclaimed
- **Fix Option 1:** Add destructor: `~Widget() { delete ptr; }`
- **Fix Option 2:** Use smart pointer: `std::unique_ptr<int> ptr;`
- **Key Concept:** Raw pointer members require manual cleanup in destructor; prefer smart pointers

---

#### Q17
```cpp
void allocate() {
    std::vector<int> vec(1000000);
    throw std::runtime_error("error");
}

void caller() {
    allocate();
}
```

**Answer:**
```
Exception thrown, but no memory leak
```

**Explanation:**
- `std::vector<int> vec(1000000)` allocates 1 million ints on heap
- `throw std::runtime_error("error")` throws exception
- Stack unwinding begins: C++ automatically calls destructors for local objects
- Vector's destructor automatically called, frees all heap memory
- This is RAII (Resource Acquisition Is Initialization) in action
- No manual cleanup needed - vector manages its own memory
- Contrast with raw pointer: `int* p = new int[1000000]; throw` would leak
- **Key Concept:** RAII ensures automatic cleanup even during exceptions; prefer RAII types

---

#### Q18
```cpp
int* p = new int(5);
int* q = new int(10);
p = q;
delete p;
```

**Answer:**
```
Memory leak (int(5) never freed)
```

**Explanation:**
- `p = new int(5)` allocates first int on heap, p points to it
- `q = new int(10)` allocates second int on heap, q points to it
- `p = q` overwrites p's value - now both p and q point to int(10)
- Original int(5) lost forever - no pointer references it (memory leak!)
- `delete p` frees int(10) through p (same as `delete q` would do)
- int(5) remains allocated but unreachable for program lifetime
- **Fix:** Should have done `delete p` before `p = q`
- **Key Concept:** Pointer reassignment loses track of original allocation; always free before reassigning

---

#### Q19
```cpp
struct Node {
    int data;
    std::shared_ptr<Node> next;
};

void createCycle() {
    auto n1 = std::make_shared<Node>();
    auto n2 = std::make_shared<Node>();
    n1->next = n2;
    n2->next = n1;
}
```

**Answer:**
```
Memory leak (circular reference prevents deletion)
```

**Explanation:**
- `n1` and `n2` are shared_ptrs to two Node objects
- `n1->next = n2` increments n2's reference count to 2
- `n2->next = n1` increments n1's reference count to 2
- When function ends, local n1 and n2 destroyed, counts drop to 1 each
- But each Node still held by the other Node's `next` member
- Neither count reaches zero, so neither Node deleted (memory leak!)
- This is circular reference problem with shared_ptr
- **Fix:** Use `weak_ptr<Node> next` for back-reference (doesn't increment count)
- **Key Concept:** Circular shared_ptr references cause leaks; use weak_ptr to break cycles

---

#### Q20
```cpp
void test() {
    std::unique_ptr<int> p = std::make_unique<int>(42);
    int* raw = p.get();
    p.reset();
    std::cout << *raw;
}
```

**Answer:**
```
Undefined behavior (use-after-free)
```

**Explanation:**
- `make_unique<int>(42)` allocates int on heap, p owns it
- `raw = p.get()` returns raw pointer to managed object WITHOUT transferring ownership
- p still owns the int, raw is just an observer
- `p.reset()` explicitly deletes the managed int, p becomes nullptr
- `raw` now points to freed memory (dangling pointer)
- `*raw` dereferences freed memory - use-after-free UB
- May crash, print garbage, or appear to work (all UB)
- **Key Concept:** get() doesn't transfer ownership; using raw pointer after owner deletes is UB

---
