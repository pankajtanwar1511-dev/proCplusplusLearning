## TOPIC: Memory Pools and Polymorphic Allocators (PMR)

### PRACTICE_TASKS: Output Prediction and Bug Hunting

#### Q1
```cpp
// Q: 1000 ints need 4000 bytes and the buffer has 4096. What does this print?
#include <array>
#include <cstddef>
#include <iostream>
#include <memory_resource>
#include <new>
#include <vector>

int main() {
    std::array<std::byte, 4096> buf{};
    std::pmr::monotonic_buffer_resource arena(buf.data(), buf.size(),
                                              std::pmr::null_memory_resource());
    std::pmr::vector<int> v(&arena);
    try {
        for (int i = 0; i < 1000; ++i) v.push_back(i);
        std::cout << "all 1000 stored\n";
    } catch (const std::bad_alloc&) {
        std::cout << "bad_alloc at size " << v.size() << '\n';
    }
}
```

**Answer:**
```
bad_alloc at size 512
```

**Explanation:**
- `push_back` grows capacity 1, 2, 4, ..., 512 (libstdc++ doubles). Each growth allocates a new array; the monotonic resource's `deallocate` is a no-op, so every old array stays as dead space.
- Arrays of 1 + 2 + ... + 512 ints = 1023 × 4 = 4092 bytes are consumed. The next growth needs 1024 × 4 = 4096 bytes, which does not fit, and the upstream is `null_memory_resource()`, so it throws.
- With `v.reserve(1000)` first, one 4000-byte allocation fits and all 1000 elements are stored.
- With the default upstream it would not throw; it would quietly allocate from the heap.
- **Key Concept:** In a monotonic arena, container growth wastes memory; reserve up front or size the arena for the sum of all growth steps.

---

#### Q2
```cpp
// Q: Does this compile?
#include <memory_resource>
#include <vector>

int main() {
    std::pmr::pool_resource pool;
    std::pmr::vector<int> v(&pool);
    v.push_back(1);
}
```

**Answer:**
```
Compile error: 'pool_resource' is not a member of 'std::pmr'
```

**Explanation:**
- There is no `std::pmr::pool_resource`. The standard pool resources are `std::pmr::unsynchronized_pool_resource` (single thread, no locking) and `std::pmr::synchronized_pool_resource` (thread-safe).
- The name appears in many tutorials and chat answers as shorthand; in an interview, name the real classes.
- **Key Concept:** Know the five standard resources: `new_delete_resource()`, `null_memory_resource()`, `monotonic_buffer_resource`, `unsynchronized_pool_resource`, `synchronized_pool_resource`.

**Fixed Version:**
```cpp
#include <iostream>
#include <memory_resource>
#include <vector>

int main() {
    std::pmr::unsynchronized_pool_resource pool;
    std::pmr::vector<int> v(&pool);
    v.push_back(1);
    std::cout << v.size() << '\n';   // 1
}
```

---

#### Q3
```cpp
// Q: The loader builds the vector in a fast arena. Find the bug.
#include <iostream>
#include <memory_resource>
#include <vector>

std::pmr::vector<int> load() {
    std::pmr::monotonic_buffer_resource arena;
    std::pmr::vector<int> v(&arena);
    for (int i = 0; i < 100; ++i) v.push_back(i);
    return v;
}

int main() {
    auto v = load();
    std::cout << v[99] << '\n';
}
```

**Answer:**
```
Undefined behaviour: v's elements live in memory owned by arena, which was destroyed when load() returned.
Here (g++ -O0) it crashed with a segmentation fault; ASan reports heap-use-after-free on v[99].
```

**Explanation:**
- `return v;` moves the vector out. A moved pmr vector keeps the source's resource, so the returned vector still points into the arena's chunks and still holds `&arena`.
- `arena` is a local: its destructor calls `release()`, returning every chunk to the heap. `v[99]` then reads freed memory, and `v`'s destructor later calls `deallocate` on a destroyed resource.
- The container never owns its resource; it stores a raw pointer.
- **Key Concept:** A pmr object must not outlive its memory resource; never return a container built on a local resource.

**Fixed Version:**
```cpp
#include <iostream>
#include <memory_resource>
#include <vector>

// The caller owns the resource and decides how long it lives
std::pmr::vector<int> load(std::pmr::memory_resource* res) {
    std::pmr::vector<int> v(res);
    for (int i = 0; i < 100; ++i) v.push_back(i);
    return v;
}

int main() {
    std::pmr::monotonic_buffer_resource arena;   // declared before v: outlives it
    auto v = load(&arena);
    std::cout << v[99] << '\n';                  // 99
}
```

---

#### Q4
```cpp
// Q: What does this print, and is the program correct?
#include <cstddef>
#include <iostream>
#include <memory_resource>
#include <vector>

struct Logging : std::pmr::memory_resource {
    Logging() { std::cout << "resource constructed\n"; }
    ~Logging() override { std::cout << "resource destroyed\n"; }
    void* do_allocate(std::size_t n, std::size_t a) override {
        std::cout << "allocate " << n << '\n';
        return std::pmr::new_delete_resource()->allocate(n, a);
    }
    void do_deallocate(void* p, std::size_t n, std::size_t a) override {
        std::cout << "deallocate " << n << '\n';
        std::pmr::new_delete_resource()->deallocate(p, n, a);
    }
    bool do_is_equal(const memory_resource& o) const noexcept override {
        return this == &o;
    }
};

struct Batch {
    std::pmr::vector<int> ids{&res};
    Logging res;
};

int main() {
    Batch b;
    b.ids.push_back(42);
    std::cout << "size " << b.ids.size() << '\n';
}
```

**Answer:**
```
resource constructed
allocate 4
size 1
resource destroyed
deallocate 4
```
It is not correct: the last line is a virtual call on a destroyed object (undefined behaviour). It happened to print normally with GCC 11, even under ASan/UBSan.

**Explanation:**
- Members are constructed in declaration order: `ids` first, receiving the address of `res` before `res` is constructed (taking the address is allowed; using it is not).
- Members are destroyed in reverse order: `res` first, then `ids`, whose destructor deallocates into the dead resource.
- With a real arena (`monotonic_buffer_resource`, pool resources) the chunks are already gone at that point; no tool flagged it here because the resource code lives in the uninstrumented libstdc++ library.
- **Key Concept:** Declare the memory resource member before every member that uses it.

**Fixed Version:**
```cpp
#include <iostream>
#include <memory_resource>
#include <vector>

struct Batch {
    std::pmr::monotonic_buffer_resource res;   // constructed first, destroyed last
    std::pmr::vector<int> ids{&res};
};

int main() {
    Batch b;
    b.ids.push_back(42);
    std::cout << "size " << b.ids.size() << '\n';   // size 1
}
```

---

#### Q5
```cpp
// Q: How many allocations reach the counting resource?
#include <cstddef>
#include <iostream>
#include <memory_resource>
#include <string>
#include <vector>

struct Counting : std::pmr::memory_resource {
    int count = 0;
    void* do_allocate(std::size_t n, std::size_t a) override {
        ++count;
        return std::pmr::new_delete_resource()->allocate(n, a);
    }
    void do_deallocate(void* p, std::size_t n, std::size_t a) override {
        std::pmr::new_delete_resource()->deallocate(p, n, a);
    }
    bool do_is_equal(const memory_resource& o) const noexcept override {
        return this == &o;
    }
};

int main() {
    Counting res;
    std::pmr::vector<std::string> v(&res);
    v.reserve(3);
    for (int i = 0; i < 3; ++i)
        v.emplace_back(40, 'a' + i);                 // 40-char strings
    std::cout << "via resource: " << res.count << '\n';
}
```

**Answer:**
```
via resource: 1
```

**Explanation:**
- The only allocation through `res` is the vector's array from `reserve(3)`.
- Each element is a `std::string` with `std::allocator`; a 40-character string exceeds the SSO buffer (15 chars in libstdc++), so each one allocates from the global heap: 3 heap allocations the arena never sees.
- With `std::pmr::vector<std::pmr::string>`, uses-allocator construction passes `res` to each element and the count becomes 4.
- **Key Concept:** pmr only reaches nested data if the nested types are pmr (allocator-aware) types too.

---

#### Q6
```cpp
// Q: process() is called with an arena-backed vector. Which resource does it use?
#include <iostream>
#include <memory_resource>
#include <vector>

std::pmr::monotonic_buffer_resource arena;

void process(std::pmr::vector<int> v) {
    std::cout << "uses arena: " << (v.get_allocator().resource() == &arena) << '\n';
    std::cout << "uses default: "
              << (v.get_allocator().resource() == std::pmr::get_default_resource())
              << '\n';
}

int main() {
    std::pmr::vector<int> data({1, 2, 3}, &arena);
    process(data);
    process(std::move(data));
}
```

**Answer:**
```
uses arena: 0
uses default: 1
uses arena: 1
uses default: 0
```

**Explanation:**
- First call: the by-value parameter is copy-constructed. Copy construction of a pmr container uses `select_on_container_copy_construction()`, which returns a default-constructed `polymorphic_allocator`: the default resource (normally the heap).
- Second call: move construction takes the source's allocator, so the parameter keeps using `arena`.
- Hidden copies (by-value parameters, `auto x = member;`) are the common way data leaks out of an arena.
- **Key Concept:** Copying a pmr container does not copy its resource; pass by `const&`, or copy with `T copy(src, &res)`.

---

#### Q7
```cpp
// Q: Find the bug. What do the last two lines print?
#include <cstddef>
#include <iostream>
#include <new>

struct Order { long id; };

class Pool {
    union Slot { Slot* next; alignas(Order) std::byte obj[sizeof(Order)]; };
    Slot slots_[4];
    Slot* free_ = nullptr;
public:
    Pool() {
        for (int i = 3; i >= 0; --i) { slots_[i].next = free_; free_ = &slots_[i]; }
    }
    Order* create(long id) {
        if (!free_) return nullptr;
        Slot* s = free_;
        free_ = s->next;
        return ::new (static_cast<void*>(s->obj)) Order{id};
    }
    void destroy(Order* p) {
        p->~Order();
        Slot* s = reinterpret_cast<Slot*>(p);
        s->next = free_;
        free_ = s;
    }
};

int main() {
    Pool pool;
    Order* a = pool.create(1);
    pool.destroy(a);
    pool.destroy(a);                       // released twice by mistake
    Order* x = pool.create(2);
    Order* y = pool.create(3);
    std::cout << "same slot: " << (x == y) << '\n';
    std::cout << "x->id = " << x->id << '\n';
}
```

**Answer:**
```
same slot: 1
x->id = 3
```
(The double release is a bug. The second `p->~Order()` is itself formally undefined behaviour, since the object's lifetime already ended ([class.dtor]); with a non-trivial destructor it would also do real damage, e.g. a double free.)

**Explanation:**
- The second `destroy(a)` pushes the same slot again: the free list becomes `a → a → ...` (the slot's `next` now points to itself).
- `create(2)` pops `a`, and because `a->next == a` the head is still `a`; `create(3)` returns the same address and overwrites order 2.
- Two "live" objects now share one slot: silent data corruption far from the bug.
- Defences: hand out `std::unique_ptr<Order, PoolDeleter>` only, track in-use slots in debug builds, assert on double release.
- **Key Concept:** An intrusive free list trusts its callers; a double release creates aliasing objects.

---

#### Q8
```cpp
// Q: The handler logs the order after giving it back. What does this print?
#include <cstddef>
#include <iostream>
#include <memory>

struct Order { long id; int qty; };

class OrderPool {
    union Slot { Slot* next; Order obj; };
    Slot slots_[2];
    Slot* free_ = nullptr;
public:
    OrderPool() {
        for (Slot& s : slots_) { s.next = free_; free_ = &s; }
    }
    Order* create(long id, int qty) {
        Slot* s = free_;
        free_ = s->next;
        return std::construct_at(&s->obj, Order{id, qty});
    }
    void destroy(Order* p) {
        std::destroy_at(p);
        Slot* s = reinterpret_cast<Slot*>(p);    // union member <-> union: OK
        s->next = free_;
        free_ = s;
    }
};

int main() {
    OrderPool pool;
    Order* a = pool.create(7, 100);
    Order* b = pool.create(8, 200);              // pool is now full
    pool.destroy(a);                             // handler is "done" with a
    std::cout << "log: " << a->id << ' ' << a->qty << '\n';
    Order* c = pool.create(9, 300);
    std::cout << "log: " << a->id << ' ' << a->qty << '\n';
    pool.destroy(c);
    pool.destroy(b);
}
```

**Answer:**
```
log: 0 100
log: 9 300
```
(GCC 11 at `-O0`, and the same under ASan/UBSan, which report nothing. At `-O2` the first line printed `log: 0` followed by a garbage `qty`. Reading `*a` after `destroy(a)` is undefined behaviour.)

**Explanation:**
- `destroy(a)` ends the order's lifetime and pushes its slot on the free list. The link pointer is stored in the slot's first 8 bytes, exactly where `id` was: the free list was empty, so `next` is `nullptr` and `id` reads as `0`. `qty` is untouched, so the log looks half right.
- The next `create` takes the most recently freed slot (LIFO), so `a` now aliases `c`: the handler "sees" order 9. In production this shows up as wrong orders in logs or, worse, a stale handler modifying someone else's order.
- ASan is silent because the slots are part of a live object (`pool` on the stack); it only knows about `malloc`/`new` boundaries, not about the pool's internal free list.
- Debug-build defence: poison a slot when it goes on the free list (`ASAN_POISON_MEMORY_REGION` from `<sanitizer/asan_interface.h>`) and unpoison it when it is handed out. With that pool the buggy `main` stops at the first stale read with `AddressSanitizer: use-after-poison`.
- Ownership fix: hand out `std::unique_ptr<Order, PoolDeleter>` (theory Example 2) so release and the end of use are tied together, and keep no raw copies past the release.
- **Key Concept:** A pool recycles slots immediately; a pointer kept after release reads the free-list link or the next tenant, and only explicit poisoning lets ASan see it.

**Fixed Version:**
```cpp
#include <sanitizer/asan_interface.h>   // macros are no-ops without ASan
#include <cstddef>
#include <iostream>
#include <memory>

struct Order { long id; int qty; };

class OrderPool {
    union Slot { Slot* next; Order obj; };
    Slot slots_[2];
    Slot* free_ = nullptr;
    void push(Slot* s) {
        s->next = free_;
        free_ = s;
        ASAN_POISON_MEMORY_REGION(s, sizeof(Slot));     // free slot: no access
    }
public:
    OrderPool() { for (Slot& s : slots_) push(&s); }
    ~OrderPool() { ASAN_UNPOISON_MEMORY_REGION(slots_, sizeof(slots_)); }
    Order* create(long id, int qty) {
        Slot* s = free_;
        ASAN_UNPOISON_MEMORY_REGION(s, sizeof(Slot));   // pool may touch it again
        free_ = s->next;
        return std::construct_at(&s->obj, Order{id, qty});
    }
    void destroy(Order* p) {
        std::destroy_at(p);
        push(reinterpret_cast<Slot*>(p));
    }
};

int main() {
    OrderPool pool;
    Order* a = pool.create(7, 100);
    Order* b = pool.create(8, 200);
    std::cout << "log: " << a->id << ' ' << a->qty << '\n';   // use, then release
    pool.destroy(a);
    a = nullptr;
    Order* c = pool.create(9, 300);
    std::cout << "log: " << c->id << ' ' << c->qty << '\n';
    pool.destroy(c);
    pool.destroy(b);
}
```
- Output: `log: 7 100` then `log: 9 300`, clean under ASan/UBSan (the poisoning is active) and in a plain build (the macros compile to nothing).

---

#### Q9
```cpp
// Q: The constructor rejects bad prices. What does this print?
#include <cstddef>
#include <iostream>
#include <new>
#include <stdexcept>

struct Order {
    double px;
    explicit Order(double p) : px(p) {
        if (p <= 0) throw std::invalid_argument("bad price");
    }
};

class Pool {
    union Slot { Slot* next; alignas(Order) std::byte obj[sizeof(Order)]; };
    Slot slots_[2];
    Slot* free_ = nullptr;
public:
    Pool() {
        for (int i = 1; i >= 0; --i) { slots_[i].next = free_; free_ = &slots_[i]; }
    }
    Order* create(double px) {
        if (!free_) return nullptr;
        Slot* s = free_;
        free_ = s->next;
        return ::new (static_cast<void*>(s->obj)) Order(px);
    }
};

int main() {
    Pool pool;
    for (double px : {-1.0, 0.0}) {
        try {
            pool.create(px);
        } catch (const std::exception& e) {
            std::cout << e.what() << '\n';
        }
    }
    Order* o = pool.create(101.5);
    std::cout << (o ? "created" : "pool exhausted") << '\n';
}
```

**Answer:**
```
bad price
bad price
pool exhausted
```

**Explanation:**
- `create` pops the slot before constructing. When the constructor throws, the exception leaves `create` and the popped slot is never pushed back.
- Two failed constructions leak both slots; the pool reports exhaustion while it has zero live objects.
- In production this looks like a slow "leak" of capacity that only appears after bad input.
- **Key Concept:** Pool acquisition must be exception safe: return the slot if construction throws.

**Fixed Version:**
```cpp
#include <cstddef>
#include <iostream>
#include <new>
#include <stdexcept>

struct Order {
    double px;
    explicit Order(double p) : px(p) {
        if (p <= 0) throw std::invalid_argument("bad price");
    }
};

class Pool {
    union Slot { Slot* next; alignas(Order) std::byte obj[sizeof(Order)]; };
    Slot slots_[2];
    Slot* free_ = nullptr;
public:
    Pool() {
        for (int i = 1; i >= 0; --i) { slots_[i].next = free_; free_ = &slots_[i]; }
    }
    Order* create(double px) {
        if (!free_) return nullptr;
        Slot* s = free_;
        free_ = s->next;
        try {
            return ::new (static_cast<void*>(s->obj)) Order(px);
        } catch (...) {
            s->next = free_;          // give the slot back
            free_ = s;
            throw;
        }
    }
};

int main() {
    Pool pool;
    for (double px : {-1.0, 0.0}) {
        try {
            pool.create(px);
        } catch (const std::exception& e) {
            std::cout << e.what() << '\n';
        }
    }
    Order* o = pool.create(101.5);
    std::cout << (o ? "created" : "pool exhausted") << '\n';   // created
}
```

---

#### Q10
```cpp
// Q: How many allocations does each resource see?
#include <cstddef>
#include <iostream>
#include <memory_resource>
#include <vector>

struct Counting : std::pmr::memory_resource {
    int count = 0;
    void* do_allocate(std::size_t n, std::size_t a) override {
        ++count;
        return std::pmr::new_delete_resource()->allocate(n, a);
    }
    void do_deallocate(void* p, std::size_t n, std::size_t a) override {
        std::pmr::new_delete_resource()->deallocate(p, n, a);
    }
    bool do_is_equal(const memory_resource& o) const noexcept override {
        return this == &o;
    }
};

int main() {
    Counting r1, r2;
    std::pmr::vector<int> a(1000, 7, &r1);
    std::pmr::vector<int> b(&r2);
    std::pmr::vector<int> c(&r1);

    b = std::move(a);          // different resources
    c = std::move(b);          // r1 vs r2 again
    std::pmr::vector<int> d(std::move(c));
    std::cout << "r1=" << r1.count << " r2=" << r2.count
              << " d[999]=" << d[999] << '\n';
}
```

**Answer:**
```
r1=2 r2=1 d[999]=7
```

**Explanation:**
- `a(1000, 7, &r1)`: one allocation from `r1`.
- `b = std::move(a)`: resources differ (`r2` vs `r1`), `polymorphic_allocator` does not propagate, so `b` allocates in `r2` and moves the elements one by one: `r2` +1.
- `c = std::move(b)`: `c` uses `r1`, `b` uses `r2`: again element-wise into a new `r1` allocation: `r1` +1.
- `d(std::move(c))`: move **construction** takes `c`'s allocator and steals its buffer: no allocation.
- **Key Concept:** Move assignment between unequal resources is a copy with allocation; only same-resource moves and move construction are O(1).

---

#### Q11
```cpp
// Q: What does this print?
#include <cstddef>
#include <iostream>
#include <memory_resource>
#include <string>

int main() {
    std::pmr::string before;                              // allocator captured now
    std::pmr::monotonic_buffer_resource arena;
    auto* old = std::pmr::set_default_resource(&arena);
    std::pmr::string after;

    std::cout << "before uses arena: "
              << (before.get_allocator().resource() == &arena) << '\n';
    std::cout << "after uses arena:  "
              << (after.get_allocator().resource() == &arena) << '\n';
    std::cout << "old was new_delete: "
              << (old == std::pmr::new_delete_resource()) << '\n';

    after = std::pmr::string(100, 'x', old);              // assignment: keeps arena
    std::cout << "after still arena: "
              << (after.get_allocator().resource() == &arena) << '\n';
    std::pmr::set_default_resource(old);
}
```

**Answer:**
```
before uses arena: 0
after uses arena:  1
old was new_delete: 1
after still arena: 1
```

**Explanation:**
- A default-constructed `polymorphic_allocator` reads `get_default_resource()` once, at construction. Changing the default later does not affect existing objects.
- `set_default_resource` returns the previous default, initially `new_delete_resource()`.
- Assigning a string from another resource copies the characters into `after`'s own resource: the resource is fixed at construction.
- Order matters at the end too: `after` and `arena` are destroyed in reverse order (`after` first), so it frees into a live arena.
- **Key Concept:** The resource is chosen once, at construction; the default resource is only a construction-time fallback.

---

#### Q12
```cpp
// Q: Each thread uses its own vector. Is this correct? (Try -fsanitize=thread.)
#include <iostream>
#include <memory_resource>
#include <thread>
#include <vector>

std::pmr::unsynchronized_pool_resource shared_pool;

void worker(int n) {
    for (int i = 0; i < 1000; ++i) {
        std::pmr::vector<int> scratch(&shared_pool);   // per-thread container
        scratch.resize(n);
    }
}

int main() {
    std::thread t1(worker, 16), t2(worker, 16);
    t1.join();
    t2.join();
    std::cout << "done\n";
}
```

**Answer:**
```
Not correct: data race inside the shared resource (undefined behaviour).
TSan (GCC 11): "WARNING: ThreadSanitizer: data race" in std::construct_at<int>: one thread writes an int into pool
memory that the other thread wrote without synchronization (inside the shared pool's chunk), then "done".
```

**Explanation:**
- The containers are separate, but both allocate from one `unsynchronized_pool_resource`, which has no internal locking. Concurrent `allocate`/`deallocate` race on its internal free lists and chunk bookkeeping, which can hand the same block to both threads or corrupt the lists; TSan flags the unsynchronized accesses to the shared chunk.
- Same rule for `monotonic_buffer_resource`: not thread-safe.
- Fixes: `std::pmr::synchronized_pool_resource` (TSan clean), or better for latency, one `unsynchronized_pool_resource` per thread (`thread_local`).
- **Key Concept:** Thread safety of a pmr setup is a property of the resource, not of the containers.

**Fixed Version:**
```cpp
#include <iostream>
#include <memory_resource>
#include <thread>
#include <vector>

void worker(int n) {
    thread_local std::pmr::unsynchronized_pool_resource pool;   // one per thread
    for (int i = 0; i < 1000; ++i) {
        std::pmr::vector<int> scratch(&pool);
        scratch.resize(n);
    }
}

int main() {
    std::thread t1(worker, 16), t2(worker, 16);
    t1.join();
    t2.join();
    std::cout << "done\n";   // TSan clean
}
```

---

#### Q13
```cpp
// Q: Does this compile?
#include <memory_resource>

int main() {
    std::pmr::monotonic_buffer_resource r1, r2;
    std::pmr::polymorphic_allocator<int> a1(&r1);
    std::pmr::polymorphic_allocator<int> a2(&r2);
    a1 = a2;
}
```

**Answer:**
```
Compile error: use of deleted function 'std::pmr::polymorphic_allocator<_Tp>& std::pmr::polymorphic_allocator<_Tp>::operator=(const std::pmr::polymorphic_allocator<_Tp>&) [with _Tp = int]'
```

**Explanation:**
- `polymorphic_allocator` is copy-constructible but its copy assignment is deleted: once an allocator (and therefore a container) is bound to a resource, it never switches to another.
- This is why pmr containers never propagate the allocator on assignment, and why assignment between containers on different resources copies or moves elements instead of stealing buffers.
- **Key Concept:** A pmr object's resource is fixed for its lifetime; choose it at construction.
