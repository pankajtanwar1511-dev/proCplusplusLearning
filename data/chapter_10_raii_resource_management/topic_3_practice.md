### PRACTICE_TASKS: Smart Pointers as RAII

#### Q1
```cpp
#include <memory>
#include <iostream>

int main() {
    std::unique_ptr<int> p1 = std::make_unique<int>(10);
    std::unique_ptr<int> p2 = std::move(p1);
    
    std::cout << (p1 == nullptr) << " " << *p2;
}
```

**Answer:**
```
1 10
```

**Explanation:**
- p1 created: owns int(10)
- p2 = std::move(p1): Ownership transferred
- Move semantics: p2 takes ownership
- p1 becomes nullptr (moved-from state)
- p1 == nullptr evaluates to 1 (true)
- *p2 accesses 10
- **Unique ownership:** Only one unique_ptr can own resource
- **Move-only:** unique_ptr cannot be copied
- **Key Concept:** Moving unique_ptr transfers ownership; source becomes nullptr

---

#### Q2
```cpp
#include <memory>
#include <iostream>

struct Node {
    std::shared_ptr<Node> next;
    ~Node() { std::cout << "D"; }
};

int main() {
    auto n1 = std::make_shared<Node>();
    auto n2 = std::make_shared<Node>();
    n1->next = n2;
    n2->next = n1;
}
```

**Answer:**
```
No output (memory leak)
```

**Explanation:**
- n1 and n2 created with use_count = 1 each
- n1->next = n2: n2 use_count becomes 2
- n2->next = n1: n1 use_count becomes 2
- main() ends: n1 local goes out of scope, n1's count: 2→1
- main() ends: n2 local goes out of scope, n2's count: 2→1
- **Circular reference:** n1 still referenced by n2->next
- **Circular reference:** n2 still referenced by n1->next
- Neither count reaches 0
- **No destructors called:** Memory leaked
- **Fix:** Use weak_ptr for one direction
- **Key Concept:** Circular references with shared_ptr cause leaks; use weak_ptr to break cycles

---

#### Q3
```cpp
#include <memory>
#include <iostream>

int main() {
    std::shared_ptr<int> p1 = std::make_shared<int>(5);
    std::shared_ptr<int> p2 = p1;
    std::weak_ptr<int> w = p1;
    
    std::cout << p1.use_count() << " " << w.expired();
    
    p1.reset();
    p2.reset();
    
    std::cout << " " << w.expired();
}
```

**Answer:**
```
2 0 1
```

**Explanation:**
- p1 and p2 share ownership: use_count = 2
- w is weak reference (doesn't increase count)
- p1.use_count() returns 2
- w.expired() returns 0 (false) - object still alive
- p1.reset(): count 2→1 (p2 still owns)
- p2.reset(): count 1→0, object destroyed
- w.expired() returns 1 (true) - object now destroyed
- **weak_ptr doesn't prevent destruction**
- **expired() checks if object destroyed**
- **Key Concept:** weak_ptr observes without owning; expired() checks if object destroyed

---

#### Q4
```cpp
#include <memory>
#include <iostream>

void process(std::unique_ptr<int> ptr) {
    std::cout << *ptr << " ";
}

int main() {
    auto ptr = std::make_unique<int>(42);
    process(std::move(ptr));
    std::cout << (ptr == nullptr);
}
```

**Answer:**
```
42 1
```

**Explanation:**
- ptr owns int(42)
- process(std::move(ptr)): Ownership transferred to function parameter
- Inside process: prints "42 "
- process returns: parameter destroyed, int(42) deleted
- After call: ptr is nullptr (moved-from)
- Prints 1 (true)
- **Ownership semantics:** Function takes ownership
- **Caller loses ownership:** ptr now empty
- **Use case:** Sink functions that consume resources
- **Key Concept:** Passing unique_ptr by value transfers ownership; caller's pointer becomes null

---

#### Q5
```cpp
#include <memory>
#include <iostream>

int main() {
    std::unique_ptr<int[]> arr(new int[3]{1, 2, 3});
    arr[1] = 10;
    std::cout << arr[0] << arr[1] << arr[2];
}
```

**Answer:**
```
1103
```

**Explanation:**
- unique_ptr<int[]>: Array specialization
- new int[3]{1, 2, 3}: Initialize array
- arr[1] = 10: Modify second element
- Array now: {1, 10, 3}
- Prints "1103" (no spaces)
- **Array specialization provides operator[]**
- **Uses delete[] in destructor** (not delete)
- **Alternative:** std::make_unique<int[]>(3)
- **Modern C++:** Consider std::array or std::vector
- **Key Concept:** unique_ptr<T[]> specialization for arrays; provides operator[] and uses delete[]

---

#### Q6
```cpp
#include <memory>
#include <iostream>

int main() {
    std::shared_ptr<int> p1(new int(10));
    std::shared_ptr<int> p2(new int(20));
    
    p1.swap(p2);
    
    std::cout << *p1 << " " << *p2;
}
```

**Answer:**
```
20 10
```

**Explanation:**
- p1 owns int(10)
- p2 owns int(20)
- p1.swap(p2): Exchanges internal pointers
- After swap: p1 points to int(20), p2 points to int(10)
- Prints "20 10"
- **Efficient:** Only swaps pointers, no copying
- **Use case:** Performance optimization
- **Also works with:** std::swap(p1, p2)
- **Key Concept:** swap() efficiently exchanges smart pointer ownership without copying

---

#### Q7
```cpp
#include <memory>
#include <iostream>

int main() {
    auto p1 = std::make_shared<int>(100);
    std::weak_ptr<int> w = p1;
    
    p1.reset();
    
    if (auto p2 = w.lock()) {
        std::cout << *p2;
    } else {
        std::cout << "Empty";
    }
}
```

**Answer:**
```
Empty
```

**Explanation:**
- p1 owns int(100), w observes it
- p1.reset(): Destroys int(100), count 1→0
- w still exists but object destroyed
- w.lock() attempts to create shared_ptr
- **Object destroyed:** lock() returns empty shared_ptr
- Condition false, else branch executes
- Prints "Empty"
- **lock() is thread-safe way to access weak_ptr**
- **Returns empty if expired**
- **Key Concept:** weak_ptr::lock() safely creates shared_ptr if object alive; returns empty if expired

---

#### Q8
```cpp
#include <memory>
#include <iostream>

struct Resource {
    Resource() { std::cout << "C"; }
    ~Resource() { std::cout << "D"; }
};

int main() {
    {
        std::unique_ptr<Resource> ptr = std::make_unique<Resource>();
        std::cout << "M";
    }
    std::cout << "E";
}
```

**Answer:**
```
CMDE
```

**Explanation:**
- Inner scope begins
- make_unique constructs Resource: prints "C"
- std::cout << "M": prints "M"
- Inner scope ends: ptr destroyed
- ptr's destructor calls ~Resource(): prints "D"
- std::cout << "E": prints "E"
- **Order:** Construction, Middle, Destruction, End
- **RAII:** Automatic cleanup at scope exit
- **Key Concept:** unique_ptr provides automatic cleanup at scope exit; deterministic destruction

---

#### Q9
```cpp
#include <memory>
#include <iostream>

int main() {
    std::shared_ptr<int> p1 = std::make_shared<int>(42);
    std::shared_ptr<int> p2 = p1;
    std::shared_ptr<int> p3 = p2;
    
    std::cout << p1.use_count() << " ";
    
    p2.reset();
    
    std::cout << p1.use_count();
}
```

**Answer:**
```
3 2
```

**Explanation:**
- p1 created: use_count = 1
- p2 = p1: use_count = 2
- p3 = p2: use_count = 3
- First output: prints "3 "
- p2.reset(): Releases p2's ownership
- use_count: 3→2
- Second output: prints "2"
- **Reference counting:** Tracks number of owners
- **reset() decrements count**
- **Object destroyed when count reaches 0**
- **Key Concept:** shared_ptr uses reference counting; reset() decrements count

---

#### Q10
```cpp
#include <memory>
#include <iostream>

int main() {
    std::unique_ptr<int> ptr;
    
    std::cout << (ptr == nullptr) << " ";
    
    ptr = std::make_unique<int>(5);
    
    std::cout << (ptr != nullptr);
}
```

**Answer:**
```
1 1
```

**Explanation:**
- ptr default constructed: nullptr
- ptr == nullptr: true, prints "1 "
- ptr = make_unique<int>(5): Assigns ownership
- ptr != nullptr: true, prints "1"
- **Default construction:** Creates empty unique_ptr
- **Assignment:** Takes ownership of new resource
- **Boolean conversion:** nullptr == false, non-null == true
- **Idiomatic checks:** if (ptr) instead of if (ptr != nullptr)
- **Key Concept:** Default-constructed unique_ptr is null; can check with boolean conversion

---

#### Q11
```cpp
#include <memory>
#include <iostream>

int main() {
    auto sp = std::make_shared<int>(100);
    int* raw = sp.get();
    
    std::cout << *raw << " ";
    
    sp.reset();
    
    // What happens if we access raw here?
    // std::cout << *raw;  // Undefined behavior!
    
    std::cout << (sp == nullptr);
}
```

**Answer:**
```
100 1
```

**Explanation:**
- sp owns int(100)
- raw = sp.get(): Extracts raw pointer (no ownership change)
- Prints "100 " through raw
- sp.reset(): Destroys int(100), sp becomes null
- **raw now dangling:** Points to freed memory
- **Accessing *raw would be UB** (commented out)
- Prints "1" (sp == nullptr)
- **get() doesn't transfer ownership**
- **Dangerous:** Raw pointer can outlive smart pointer
- **Key Concept:** get() returns raw pointer without ownership transfer; dangerous if smart pointer destroyed

---

#### Q12
```cpp
#include <memory>
#include <iostream>

struct Data {
    int x = 5;
    int y = 10;
};

int main() {
    auto data = std::make_shared<Data>();
    std::shared_ptr<int> x_ptr(data, &data->x);
    
    data.reset();
    
    std::cout << *x_ptr;
}
```

**Answer:**
```
5
```

**Explanation:**
- data owns Data object
- x_ptr(data, &data->x): **Aliasing constructor**
- x_ptr shares ownership of Data
- x_ptr points to x member
- data.reset(): Releases data's reference
- **But:** x_ptr still owns Data (use_count ≥ 1)
- Data not destroyed yet
- Prints x member value: "5"
- **Aliasing:** Share ownership of one object, point to another
- **Use case:** Pointing to members while managing whole object
- **Key Concept:** Aliasing constructor shares ownership of one object while pointing to another; enables member pointers

---

#### Q13
```cpp
#include <memory>
#include <iostream>

void modify(std::unique_ptr<int>& ptr) {
    ptr.reset(new int(99));
}

int main() {
    auto ptr = std::make_unique<int>(42);
    modify(ptr);
    std::cout << *ptr;
}
```

**Answer:**
```
99
```

**Explanation:**
- ptr owns int(42)
- modify() takes reference (not move)
- ptr.reset(new int(99)):
  - Deletes int(42)
  - Assigns new int(99)
- After modify: ptr owns int(99)
- Prints "99"
- **Pass by reference:** Allows modification without transfer
- **reset() replaces owned object**
- **Alternative:** Pass by value would transfer ownership
- **Key Concept:** Pass unique_ptr by reference to modify; reset() replaces owned object

---

#### Q14
```cpp
#include <memory>
#include <iostream>

int main() {
    std::shared_ptr<int> p1 = std::make_shared<int>(10);
    std::weak_ptr<int> w1 = p1;
    std::weak_ptr<int> w2 = w1;
    
    std::cout << p1.use_count() << " " << w1.use_count();
}
```

**Answer:**
```
1 1
```

**Explanation:**
- p1 owns int(10): use_count = 1
- w1 observes p1: doesn't increase count
- w2 observes through w1: still doesn't increase count
- p1.use_count() returns 1 (one shared_ptr)
- **w1.use_count():** Returns count of shared_ptrs, not weak_ptrs
- Returns 1 (same as p1.use_count())
- **weak_ptr doesn't track weak count through use_count()**
- **Confusing API:** use_count() on weak_ptr returns strong count
- **Key Concept:** weak_ptr::use_count() returns shared_ptr count not weak_ptr count; weak_ptrs don't contribute

---

#### Q15
```cpp
#include <memory>
#include <iostream>

std::unique_ptr<int> factory() {
    return std::make_unique<int>(77);
}

int main() {
    auto ptr = factory();
    std::cout << *ptr;
}
```

**Answer:**
```
77
```

**Explanation:**
- factory() creates unique_ptr with int(77)
- Returns by value: Uses move semantics
- Ownership transferred to caller
- main receives ownership
- Prints "77"
- **Factory pattern:** Common for unique_ptr
- **Move is automatic:** Compiler handles move
- **No manual std::move needed on return**
- **C++17:** Copy elision may eliminate move entirely
- **Key Concept:** Returning unique_ptr by value transfers ownership via move; factory pattern

---

#### Q16
```cpp
#include <memory>
#include <iostream>

int main() {
    std::shared_ptr<int> p1(new int(5));
    std::shared_ptr<int> p2(p1.get());
    
    std::cout << p1.use_count() << " " << p2.use_count();
}
```

**Answer:**
```
1 1 (then double-delete crash)
```

**Explanation:**
- p1 constructed from new int(5): use_count = 1
- p2 constructed from raw pointer p1.get()
- **CRITICAL BUG:** p2 creates new control block
- p1 and p2 have independent control blocks
- Both think they uniquely own int(5)
- Both use_count() return 1
- **Program ends:**
  - p2 destroyed: deletes int(5)
  - p1 destroyed: tries to delete already-freed memory
  - **Double-delete:** Undefined behavior, crash
- **Never do:** shared_ptr from raw pointer of another shared_ptr
- **Correct:** p2 = p1 or p2(p1)
- **Key Concept:** Never create shared_ptr from get(); causes double control blocks and double-delete

---

#### Q17
```cpp
#include <memory>
#include <iostream>

int main() {
    auto deleter = [](int* p) {
        std::cout << "Del";
        delete p;
    };
    
    {
        std::unique_ptr<int, decltype(deleter)> ptr(new int(5), deleter);
        std::cout << *ptr;
    }
    std::cout << "End";
}
```

**Answer:**
```
5DelEnd
```

**Explanation:**
- deleter lambda defined
- ptr created with custom deleter
- Prints "5" (*ptr)
- Inner scope ends
- ptr destroyed: calls custom deleter
- Deleter prints "Del", then deletes
- Outer scope: prints "End"
- **Custom deleter:** Replaces default delete
- **Use case:** Special cleanup (close file, unlock mutex)
- **Type includes deleter type** (decltype(deleter))
- **Key Concept:** unique_ptr supports custom deleters; useful for non-memory resources

---

#### Q18
```cpp
#include <memory>
#include <iostream>

int main() {
    std::unique_ptr<int> p1 = std::make_unique<int>(10);
    std::unique_ptr<int> p2;
    
    p2 = std::move(p1);
    
    if (!p1 && p2) {
        std::cout << "Transferred";
    }
}
```

**Answer:**
```
Transferred
```

**Explanation:**
- p1 owns int(10), p2 is null
- p2 = std::move(p1): Ownership moved
- After move: p1 is null, p2 owns int(10)
- !p1: true (p1 is null)
- p2: true (p2 is non-null)
- Both conditions true: prints "Transferred"
- **Boolean conversion:** null = false, non-null = true
- **Idiomatic:** if (!ptr) checks for null
- **Move assignment:** Transfers ownership
- **Key Concept:** Boolean conversion checks null state; move assignment transfers ownership

---

#### Q19
```cpp
#include <memory>
#include <iostream>

int main() {
    std::shared_ptr<int> sp1 = std::make_shared<int>(20);
    std::shared_ptr<int> sp2(sp1);
    
    sp1.reset(new int(30));
    
    std::cout << *sp1 << " " << *sp2 << " " << sp1.use_count();
}
```

**Answer:**
```
30 20 1
```

**Explanation:**
- sp1 owns int(20): use_count = 1
- sp2(sp1): Shares ownership, use_count = 2
- sp1.reset(new int(30)):
  - Releases sp1's share of int(20)
  - int(20) use_count: 2→1 (sp2 still owns)
  - sp1 now owns new int(30): use_count = 1
- sp1 points to 30, sp2 points to 20
- sp1.use_count() = 1 (only owns int(30))
- **reset(ptr):** Replaces with new object
- **Separate objects:** sp1 and sp2 now independent
- **Key Concept:** reset(new_ptr) replaces owned object; original object shared ownership unaffected

---

#### Q20
```cpp
#include <memory>
#include <iostream>

int main() {
    std::unique_ptr<int> ptr = std::make_unique<int>(100);
    int* raw = ptr.release();
    
    std::cout << (ptr == nullptr) << " " << *raw;
    
    delete raw;
}
```

**Answer:**
```
1 100
```

**Explanation:**
- ptr owns int(100)
- raw = ptr.release():
  - **release() gives up ownership**
  - Returns raw pointer
  - ptr becomes null
  - **No destruction occurs**
- ptr == nullptr: true, prints "1 "
- *raw: prints "100"
- delete raw: **Manual cleanup required**
- **Dangerous:** Caller must remember to delete
- **Use case:** Transferring ownership to legacy code
- **Prefer:** std::move for unique_ptr-aware code
- **Key Concept:** release() surrenders ownership without deletion; caller must manually delete

---
