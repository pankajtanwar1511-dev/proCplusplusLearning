## TOPIC: Smart Pointers in Modern C++

### PRACTICE_TASKS: Output Prediction and Analysis Questions

#### Q1
```cpp
std::unique_ptr<int> p1 = std::make_unique<int>(42);
std::unique_ptr<int> p2 = p1;
std::cout << *p2;
```

**Answer:**
```
Compilation error
```

**Explanation:**
- unique_ptr enforces exclusive ownership (only one owner at a time)
- Copy constructor explicitly deleted: `unique_ptr(const unique_ptr&) = delete`
- `std::unique_ptr<int> p2 = p1` attempts to copy p1 to p2 (won't compile!)
- Compiler error: "use of deleted function 'unique_ptr::unique_ptr(const unique_ptr&)'"
- **Fix:** Use move semantics: `std::unique_ptr<int> p2 = std::move(p1);`
- After move, p1 becomes nullptr, p2 owns the int(42)
- **Key Concept:** unique_ptr is non-copyable but movable; enforces single ownership

---

#### Q2
```cpp
std::unique_ptr<int> p1 = std::make_unique<int>(100);
std::unique_ptr<int> p2 = std::move(p1);
if (p1 == nullptr) {
    std::cout << "p1 is null\n";
}
std::cout << *p2;
```

**Answer:**
```
p1 is null
100
```

**Explanation:**
- `make_unique<int>(100)` creates unique_ptr owning int(100)
- `std::move(p1)` converts p1 to rvalue reference, enabling move
- Move constructor transfers ownership from p1 to p2
- After move: p1 becomes nullptr (moved-from state), p2 owns int(100)
- `p1 == nullptr` is true, prints "p1 is null"
- `*p2` dereferences p2, prints 100
- Only one owner at any time - ownership successfully transferred
- **Key Concept:** Moving unique_ptr transfers ownership; source becomes nullptr

---

#### Q3
```cpp
std::shared_ptr<int> sp1 = std::make_shared<int>(42);
std::shared_ptr<int> sp2 = sp1;
std::cout << sp1.use_count() << " " << sp2.use_count();
```

**Answer:**
```
2 2
```

**Explanation:**
- `make_shared<int>(42)` creates shared_ptr with reference count 1
- `sp2 = sp1` copies shared_ptr, incrementing reference count to 2
- Both sp1 and sp2 own the SAME int(42) object
- `use_count()` returns current reference count for the shared object
- Both sp1.use_count() and sp2.use_count() return 2 (total owners)
- Object will be deleted when both sp1 and sp2 destroyed (count reaches 0)
- **Key Concept:** shared_ptr uses reference counting; all copies share same count

---

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

**Answer:**
```
Memory leak, ~Node never printed
```

**Explanation:**
- Two Node objects created: a and b
- `a->next = b` increments b's reference count to 2
- `b->next = a` increments a's reference count to 2
- Function ends: local variables a and b destroyed, counts drop to 1 each
- But a is still owned by b->next, and b is still owned by a->next
- Circular reference: neither count reaches zero, neither deleted
- Destructors never called, memory leaked
- **Fix:** Use `weak_ptr<Node> next` to break cycle
- **Key Concept:** Circular shared_ptr references prevent deletion; use weak_ptr for back-pointers

---

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

**Answer:**
```
1
1
```

**Explanation:**
- `make_shared<int>(42)` creates shared_ptr with count 1
- `weak = shared` creates weak_ptr observing the int (doesn't increment count)
- `weak.use_count()` returns strong count (still 1 - weak doesn't count)
- Inner scope ends: shared destroyed, int deleted, strong count becomes 0
- `weak.expired()` returns true (1) - object no longer exists
- weak_ptr safe to use after object deleted - just reports expired
- **Key Concept:** weak_ptr doesn't affect reference count; detects when object deleted

---

#### Q6
```cpp
int* raw = new int(100);
std::shared_ptr<int> sp1(raw);
std::shared_ptr<int> sp2(raw);
```

**Answer:**
```
Double delete, crash
```

**Explanation:**
- `new int(100)` allocates int on heap
- `sp1(raw)` creates first shared_ptr with its own control block
- `sp2(raw)` creates SECOND shared_ptr with SEPARATE control block
- sp1 and sp2 don't know about each other - each thinks it's the sole owner
- When sp1 destroyed: deletes int(100)
- When sp2 destroyed: tries to delete already-freed memory (double delete!)
- Undefined behavior, likely crash
- **Fix:** `sp2 = sp1` to share control block, OR only create one shared_ptr
- **Key Concept:** Never create multiple shared_ptrs from same raw pointer; always copy from shared_ptr

---

#### Q7
```cpp
std::unique_ptr<int[]> arr(new int[5]);
delete arr.get();
```

**Answer:**
```
Double delete, undefined behavior
```

**Explanation:**
- `unique_ptr<int[]>` specialization for arrays, uses delete[] on destruction
- `arr.get()` returns raw pointer to the array WITHOUT releasing ownership
- `delete arr.get()` manually deletes array using scalar delete (wrong!)
- arr still owns the array, doesn't know it was deleted
- When arr destroyed: calls delete[] on already-freed memory (double delete!)
- Undefined behavior, likely crash or heap corruption
- **Key Concept:** Never manually delete through get(); unique_ptr owns and will delete

---

#### Q8
```cpp
auto p = std::make_shared<int>(42);
int* raw = p.get();
p.reset();
std::cout << *raw;
```

**Answer:**
```
Undefined behavior (use-after-free)
```

**Explanation:**
- `make_shared<int>(42)` creates shared_ptr owning int(42)
- `raw = p.get()` returns raw pointer WITHOUT transferring ownership
- raw is just an observer, p still owns the int
- `p.reset()` explicitly deletes the managed int, p becomes nullptr
- raw now points to freed memory (dangling pointer)
- `*raw` dereferences freed memory - use-after-free UB
- May crash, print garbage, or appear to work (all undefined behavior)
- **Key Concept:** get() returns observer pointer; unsafe after owner deletes object

---

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

**Answer:**
```
Only prints "~Base" - Derived destructor not called (resource leak)
```

**Explanation:**
- `make_unique<Derived>()` creates Derived object
- Implicitly converts to `unique_ptr<Base>` (polymorphism)
- When ptr destroyed: calls delete on Base pointer
- Base destructor is NOT virtual - polymorphic behavior undefined
- Only ~Base() called, ~Derived() never called
- If Derived has resources (file handles, memory), they leak
- **Fix:** Declare `virtual ~Base() { std::cout << "~Base\n"; }`
- **Key Concept:** Base class destructors must be virtual for polymorphic deletion

---

#### Q10
```cpp
std::unique_ptr<int> p1 = std::make_unique<int>(42);
std::unique_ptr<int> p2;
p2 = std::move(p1);
std::cout << (p1 == nullptr);
```

**Answer:**
```
1
```

**Explanation:**
- `make_unique<int>(42)` creates unique_ptr owning int(42)
- `p2` is default-constructed (nullptr)
- `p2 = std::move(p1)` move assignment operator transfers ownership
- p2 now owns int(42), p1 becomes nullptr (moved-from state)
- `p1 == nullptr` evaluates to true (1)
- unique_ptr provides comparison operators with nullptr
- **Key Concept:** Move assignment transfers ownership; source becomes nullptr

---

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

**Answer:**
```
Null
```

**Explanation:**
- `sp` is default-constructed shared_ptr (nullptr, no managed object)
- `wp = sp` creates weak_ptr observing nullptr (nothing to observe)
- `wp.lock()` attempts to create shared_ptr from weak_ptr
- Since observed object doesn't exist, lock() returns empty shared_ptr
- Empty shared_ptr evaluates to false in boolean context
- else branch executes, prints "Null"
- **Key Concept:** weak_ptr::lock() returns empty shared_ptr if object expired or never existed

---

#### Q12
```cpp
auto sp1 = std::make_shared<int>(100);
std::weak_ptr<int> wp = sp1;
sp1.reset();
std::cout << wp.expired();
```

**Answer:**
```
1
```

**Explanation:**
- `make_shared<int>(100)` creates shared_ptr with count 1
- `wp = sp1` creates weak_ptr observing the int (doesn't increment count)
- `sp1.reset()` destroys managed int, decrements count to 0, deletes object
- sp1 becomes nullptr
- `wp.expired()` checks if observed object still exists
- Returns true (1) because object was deleted
- Safe way to check validity before accessing through weak_ptr
- **Key Concept:** weak_ptr::expired() detects when observed object deleted

---

#### Q13
```cpp
std::unique_ptr<int> p(new int(42));
int* raw = p.release();
std::cout << (p == nullptr);
delete raw;
```

**Answer:**
```
1
```

**Explanation:**
- `unique_ptr<int> p(new int(42))` takes ownership of heap int
- `p.release()` returns raw pointer AND releases ownership
- After release(): p becomes nullptr, ownership transferred to caller
- `p == nullptr` is true (1)
- Caller now responsible for deletion: `delete raw` required
- Different from get(): release() gives up ownership, get() keeps ownership
- **Key Concept:** release() transfers ownership to caller; must manually delete

---

#### Q14
```cpp
std::shared_ptr<int> sp1 = std::make_shared<int>(42);
std::shared_ptr<int> sp2 = sp1;
sp1.reset();
std::cout << sp2.use_count();
```

**Answer:**
```
1
```

**Explanation:**
- `make_shared<int>(42)` creates shared_ptr with count 1
- `sp2 = sp1` copies shared_ptr, incrementing count to 2
- Both sp1 and sp2 own same int(42)
- `sp1.reset()` destroys sp1's reference, decrements count from 2 to 1
- sp1 becomes nullptr, but int(42) still alive (sp2 owns it)
- `sp2.use_count()` returns 1 (one remaining owner)
- Object will be deleted when sp2 destroyed
- **Key Concept:** reset() decrements count; object survives if other owners exist

---

#### Q15
```cpp
std::unique_ptr<int[]> arr = std::make_unique<int[]>(5);
arr[0] = 10;
std::cout << arr[0];
```

**Answer:**
```
10
```

**Explanation:**
- C++14+ added make_unique array support: `make_unique<int[]>(5)`
- Creates array of 5 uninitialized ints on heap
- unique_ptr<int[]> array specialization provides operator[] for access
- `arr[0] = 10` sets first element to 10
- `arr[0]` reads and prints 10
- When arr destroyed: automatically calls delete[] (not delete)
- Safer than manual `unique_ptr<int[]>(new int[5])`
- **Key Concept:** make_unique supports arrays since C++14; unique_ptr<T[]> automatically uses delete[]

---

#### Q16
```cpp
auto deleter = [](int* p) {
    std::cout << "Custom delete\n";
    delete p;
};

std::unique_ptr<int, decltype(deleter)> p(new int(42), deleter);
```

**Answer:**
```
Prints "Custom delete" when p destroyed
```

**Explanation:**
- Lambda function creates custom deleter for unique_ptr
- Deleter type becomes part of unique_ptr's type signature
- `decltype(deleter)` deduces lambda type for template parameter
- When p destroyed (end of scope): custom deleter invoked instead of default delete
- Custom deleter prints message, then manually deletes pointer
- Useful for: closing file handles, releasing non-memory resources, logging
- **Key Concept:** unique_ptr supports custom deleters; deleter type is part of unique_ptr's type

---

#### Q17
```cpp
std::unique_ptr<int> p1 = std::make_unique<int>(42);
auto p2 = std::make_shared<int>(100);
p2 = std::move(p1);
```

**Answer:**
```
Compilation error
```

**Explanation:**
- `p1` has type `unique_ptr<int>`
- `p2` deduced as `shared_ptr<int>` from make_shared
- `p2 = std::move(p1)` attempts to assign unique_ptr to shared_ptr variable
- shared_ptr move assignment expects shared_ptr, not unique_ptr
- Type mismatch: no matching operator= for shared_ptr = unique_ptr
- **Fix:** Create new shared_ptr: `std::shared_ptr<int> sp = std::move(p1);`
- **Key Concept:** Cannot assign unique_ptr to existing shared_ptr variable; can convert via construction

---

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

**Answer:**
```
42
```

**Explanation:**
- Aliasing constructor: `shared_ptr(shared_ptr<Y>, T*)`
- `dataPtr` shares widget's control block BUT points to member data
- dataPtr increments widget's reference count (count becomes 2)
- dataPtr points to int member, not Widget itself
- `widget.reset()` decrements count to 1, Widget NOT deleted
- dataPtr still owns Widget (keeps it alive), points to data member
- `*dataPtr` safely accesses data (42)
- Widget deleted when dataPtr destroyed
- **Key Concept:** Aliasing constructor allows pointing to sub-objects while keeping parent alive

---

#### Q19
```cpp
std::unique_ptr<int> p = std::make_unique<int>(42);
std::shared_ptr<int> sp = std::move(p);
std::cout << sp.use_count() << " " << (p == nullptr);
```

**Answer:**
```
1 1
```

**Explanation:**
- unique_ptr can convert to shared_ptr via move constructor
- `std::move(p)` converts p to rvalue, enables move
- shared_ptr move constructor from unique_ptr takes ownership
- sp now owns int(42) with reference count 1
- p becomes nullptr (moved-from state)
- `sp.use_count()` returns 1 (sole owner)
- `p == nullptr` is true (1)
- One-way conversion: can convert unique → shared, not shared → unique
- **Key Concept:** unique_ptr converts to shared_ptr; useful for flexibility without overhead

---

#### Q20
```cpp
std::shared_ptr<int> sp = std::make_shared<int>(42);
std::weak_ptr<int> wp1 = sp;
std::weak_ptr<int> wp2 = sp;
sp.reset();
std::cout << wp1.use_count() << " " << wp2.use_count();
```

**Answer:**
```
0 0
```

**Explanation:**
- `make_shared<int>(42)` creates shared_ptr with strong count 1
- `wp1 = sp` and `wp2 = sp` create weak_ptrs (don't increment strong count)
- weak_ptrs observe the object without owning it
- `sp.reset()` destroys sole owner, strong count drops to 0, int deleted
- Both weak_ptrs still exist but observed object gone
- `use_count()` returns strong count (number of shared_ptr owners), which is 0
- Both wp1 and wp2 report 0 owners
- `wp1.expired()` and `wp2.expired()` would return true
- **Key Concept:** weak_ptr::use_count() returns strong count; 0 means object deleted

---
