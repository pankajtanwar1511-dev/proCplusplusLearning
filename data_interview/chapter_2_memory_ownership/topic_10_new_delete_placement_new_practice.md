## TOPIC: new/delete, Placement New and Object Storage

### PRACTICE_TASKS: Output Prediction and Bug Hunting

#### Q1
```cpp
// Q: Find the bug. What happens at run time?
#include <iostream>

struct Order {
    int id = 0;
    ~Order() { std::cout << "~Order " << id << '\n'; }
};

int main() {
    Order* batch = new Order[3];
    for (int i = 0; i < 3; ++i) batch[i].id = i;
    delete batch;
}
```

**Answer:**
```
Undefined behaviour. With GCC + glibc: "~Order 0" (one destructor), then abort with
"munmap_chunk(): invalid pointer". ASan: "attempting free on address which was not malloc()-ed".
GCC 11 also warns: 'operator delete' called on pointer with nonzero offset 8 [-Wfree-nonheap-object].
```

**Explanation:**
- `new Order[3]` stores the element count in an 8-byte cookie before the array (Itanium ABI) and returns a pointer just past it.
- Plain `delete` thinks it has one object: it runs one destructor and hands the cookie-shifted address to `operator delete`, which is not the start of any allocation.
- For a trivially destructible type (`new int[3]`) there is no cookie and it may appear to work; ASan still reports `alloc-dealloc-mismatch`.
- **Key Concept:** `new[]` pairs only with `delete[]`; better, use `std::vector` or `std::unique_ptr<T[]>`.

**Fixed Version:**
```cpp
#include <iostream>
#include <vector>

struct Order {
    int id = 0;
    ~Order() { std::cout << "~Order " << id << '\n'; }
};

int main() {
    std::vector<Order> batch(3);
    for (int i = 0; i < 3; ++i) batch[i].id = i;
}   // ~Order 0, ~Order 1, ~Order 2 (elements destroyed in order of index in libstdc++)
```

---

#### Q2
```cpp
// Q: What does this print?
#include <cstddef>
#include <iostream>
#include <new>
#include <stdexcept>

struct Member {
    Member() { std::cout << "Member()\n"; }
    ~Member() { std::cout << "~Member\n"; }
};

struct Widget {
    Member m;
    Widget() {
        std::cout << "Widget() body\n";
        throw std::runtime_error("init failed");
    }
    ~Widget() { std::cout << "~Widget\n"; }
    static void* operator new(std::size_t n) {
        std::cout << "operator new\n";
        return ::operator new(n);
    }
    static void operator delete(void* p) noexcept {
        std::cout << "operator delete\n";
        ::operator delete(p);
    }
};

int main() {
    try {
        Widget* w = new Widget;
        delete w;
    } catch (const std::exception& e) {
        std::cout << "caught " << e.what() << '\n';
    }
}
```

**Answer:**
```
operator new
Member()
Widget() body
~Member
operator delete
caught init failed
```

**Explanation:**
- The new-expression allocates first, then constructs: members, then the constructor body.
- The body throws: already-constructed members are destroyed (`~Member`), but `~Widget` does not run because the `Widget` lifetime never began.
- The new-expression then calls the matching `operator delete`, so the memory does not leak, and only then does the exception reach the `catch`.
- **Key Concept:** A throwing constructor in `new` gives back the memory automatically; only fully constructed subobjects are destroyed.

---

#### Q3
```cpp
// Q: Find the bug.
#include <cstddef>
#include <iostream>
#include <new>

struct Quote {
    double bid, ask;
    Quote(double b, double a) : bid(b), ask(a) {}
    ~Quote() { std::cout << "~Quote\n"; }
};

int main() {
    alignas(Quote) std::byte buf[sizeof(Quote)];
    Quote* q = new (buf) Quote(99.5, 100.0);
    std::cout << q->ask - q->bid << '\n';
    delete q;
}
```

**Answer:**
```
0.5
~Quote
then a crash: delete passes a stack address to operator delete (glibc: "double free or corruption (out)", abort).
ASan: "attempting free on address which was not malloc()-ed".
GCC 11 warns: 'operator delete' called on unallocated object 'buf' [-Wfree-nonheap-object].
```

**Explanation:**
- Placement new did not allocate anything; `buf` is a stack array. `delete q` runs the destructor (fine) and then frees memory that never came from `operator new`.
- In a pool the same mistake frees a slot inside the pool's block: heap corruption that crashes much later.
- **Key Concept:** End a placement-new object with `std::destroy_at` (or `q->~Quote()`); the storage owner handles the storage.

**Fixed Version:**
```cpp
#include <cstddef>
#include <iostream>
#include <memory>
#include <new>

struct Quote {
    double bid, ask;
    Quote(double b, double a) : bid(b), ask(a) {}
    ~Quote() { std::cout << "~Quote\n"; }
};

int main() {
    alignas(Quote) std::byte buf[sizeof(Quote)];
    Quote* q = new (buf) Quote(99.5, 100.0);
    std::cout << q->ask - q->bid << '\n';   // 0.5
    std::destroy_at(q);                     // ~Quote; buf itself dies with the scope
}
```

---

#### Q4
```cpp
// Q: A reusable message slot. Find the bug.
#include <cstddef>
#include <iostream>
#include <new>
#include <string>

struct Slot {
    alignas(std::string) std::byte buf[sizeof(std::string)];
    std::string* msg = nullptr;
    void set(const char* text) {
        msg = new (buf) std::string(text);
    }
};

int main() {
    Slot s;
    s.set("first message that is longer than the small string buffer");
    s.set("second message that is also longer than fifteen chars");
    std::cout << *s.msg << '\n';
}
```

**Answer:**
```
second message that is also longer than fifteen chars
then LeakSanitizer reports two direct leaks (the heap buffers of both strings).
```

**Explanation:**
- The second `set` constructs a new `std::string` over a live one without destroying it: the first string's heap buffer leaks.
- Nothing ever destroys the second string either: `Slot` has no destructor.
- With short strings (SSO, 15 chars or less in libstdc++) nothing visible leaks, which is why such bugs survive tests with small data.
- **Key Concept:** Every placement new needs a matching destruction: before reusing the storage and when the owner dies.

**Fixed Version:**
```cpp
#include <cstddef>
#include <iostream>
#include <memory>
#include <new>
#include <string>

struct Slot {
    alignas(std::string) std::byte buf[sizeof(std::string)];
    std::string* msg = nullptr;
    void set(const char* text) {
        reset();                                   // end the old lifetime first
        msg = new (buf) std::string(text);
    }
    void reset() {
        if (msg) { std::destroy_at(msg); msg = nullptr; }
    }
    Slot() = default;
    Slot(const Slot&) = delete;                    // copying would duplicate 'msg'
    Slot& operator=(const Slot&) = delete;
    ~Slot() { reset(); }
};

int main() {
    Slot s;
    s.set("first message that is longer than the small string buffer");
    s.set("second message that is also longer than fifteen chars");
    std::cout << *s.msg << '\n';                   // no leaks under ASan
}
```

---

#### Q5
```cpp
// Q: What does this print?
#include <cstddef>
#include <iostream>
#include <memory>
#include <new>

struct Tick {
    double px = 0;
    static void* operator new(std::size_t n) {
        std::cout << "Tick::operator new(" << n << ")\n";
        return ::operator new(n);
    }
    static void operator delete(void* p) noexcept {
        std::cout << "Tick::operator delete\n";
        ::operator delete(p);
    }
};

int main() {
    auto a = std::make_unique<Tick>();
    auto b = std::make_shared<Tick>();
    Tick* c = ::new Tick;
    ::delete c;
    std::cout << "end\n";
}
```

**Answer:**
```
Tick::operator new(8)
end
Tick::operator delete
```

**Explanation:**
- `std::make_unique<Tick>()` is `new Tick()` inside, so it uses the class operator; `a`'s destructor (at the end of `main`, after "end") calls `Tick::operator delete`.
- `std::make_shared` allocates one block for control block + object through `std::allocator`; the class operator is bypassed.
- `::new Tick` / `::delete c` explicitly name the global functions.
- `b` is destroyed before `a` (reverse order), silently through the global functions.
- **Key Concept:** Class `operator new` covers `new T` only: not `make_shared`, not `::new`, not arrays without `operator new[]`.

---

#### Q6
```cpp
// Q: Find the bug. (Hint: build with -fsanitize=undefined.)
#include <cstdint>
#include <iostream>
#include <new>

struct Header {
    std::uint32_t seq;
    std::uint32_t len;
};

int main() {
    unsigned char pool[64];
    std::size_t used = 1;                          // one flag byte already used
    Header* h = new (pool + used) Header{7, 32};
    std::cout << h->seq << ' ' << h->len << '\n';
}
```

**Answer:**
```
7 32 on x86-64, but undefined behaviour: the Header is misaligned.
UBSan (GCC 11): "member access within misaligned address ... for type 'struct Header',
which requires 4 byte alignment", reported at the initialization and at each member access.
```

**Explanation:**
- `pool` has alignment 1, and `pool + 1` is not a multiple of `alignof(Header)` (4).
- x86 tolerates most misaligned scalar loads, so the program appears to work; atomics, SIMD and other architectures do not, and the optimizer may assume alignment.
- **Key Concept:** Storage for placement new must be aligned for the type: `alignas` on the buffer and offsets rounded up to `alignof(T)`.

**Fixed Version:**
```cpp
#include <cstddef>
#include <cstdint>
#include <iostream>
#include <new>

struct Header {
    std::uint32_t seq;
    std::uint32_t len;
};

constexpr std::size_t align_up(std::size_t n, std::size_t a) {
    return (n + a - 1) / a * a;
}

int main() {
    alignas(std::max_align_t) unsigned char pool[64];
    std::size_t used = 1;
    std::size_t off = align_up(used, alignof(Header));   // 4
    Header* h = new (pool + off) Header{7, 32};
    std::cout << h->seq << ' ' << h->len << " at offset " << off << '\n';
    // 7 32 at offset 4
}
```

---

#### Q7
```cpp
// Q: What does this print? (Run without sanitizers.)
#include <iostream>
#include <new>

int main() {
    const unsigned long long huge = 1ULL << 46;   // 64 TiB
    try {
        char* p = new char[huge];
        if (p == nullptr) {
            std::cout << "null\n";
            return 1;
        }
        std::cout << "allocated\n";
        delete[] p;
    } catch (const std::bad_alloc& e) {
        std::cout << "caught " << e.what() << '\n';
    }
    char* q = new (std::nothrow) char[huge];
    std::cout << "nothrow returned " << (q == nullptr ? "nullptr" : "memory") << '\n';
}
```

**Answer:**
```
caught std::bad_alloc
nothrow returned nullptr
```

**Explanation:**
- Plain `new` never returns `nullptr`; on failure it throws `std::bad_alloc`. The `if (p == nullptr)` branch is dead code.
- `new (std::nothrow)` reports failure by returning `nullptr`.
- 64 TiB exceeds what Linux will reserve even with overcommit, so the failure is immediate. A merely "too large for RAM" request (say 8 GiB on a 16 GB box) would typically succeed and fail later as an OOM kill when touched.
- Under ASan the program aborts instead ("requested allocation size exceeds maximum supported size"), unless `ASAN_OPTIONS=allocator_may_return_null=1`.
- **Key Concept:** Know which form you call: throwing `new` needs `try`, `nothrow` needs a null check.

---

#### Q8
```cpp
// Q: How many times is the handler called, and what is printed?
#include <iostream>
#include <new>

int calls = 0;

void on_oom() {
    ++calls;
    std::cout << "handler call " << calls << '\n';
    if (calls == 3) std::set_new_handler(nullptr);   // give up: next failure throws
}

int main() {
    std::set_new_handler(on_oom);
    try {
        char* p = new char[1ULL << 46];
        delete[] p;
    } catch (const std::bad_alloc&) {
        std::cout << "bad_alloc after " << calls << " handler calls\n";
    }
}
```

**Answer:**
```
handler call 1
handler call 2
handler call 3
bad_alloc after 3 handler calls
```

**Explanation:**
- On failure `operator new` calls the current new_handler and retries, in a loop, as long as a handler is installed.
- A handler must make progress: free memory (e.g. release a reserve block), install another handler, uninstall itself, throw `bad_alloc`, or terminate. A handler that does none of these loops forever.
- Here the third call uninstalls the handler, so the next failed attempt throws.
- Run without sanitizers (ASan's allocator aborts on this size instead).
- **Key Concept:** The new_handler is a retry loop, not a notification.

---

#### Q9
```cpp
// Q: Built with g++ -std=c++17. Does it compile?
#include <iostream>
#include <memory>
#include <new>

struct Px {
    int v;
    explicit Px(int x) : v(x) {}
};

int main() {
    alignas(Px) unsigned char buf[sizeof(Px)];
    Px* p = new (buf) Px(1);
    std::destroy_at(p);
    Px* q = std::construct_at(reinterpret_cast<Px*>(buf), 2);
    std::cout << q->v << '\n';
    std::destroy_at(q);
}
```

**Answer:**
```
Does not compile in C++17: error: 'construct_at' is not a member of 'std'
(std::destroy_at is fine: it is C++17. With -std=c++20 it compiles and prints 2.)
```

**Explanation:**
- `std::destroy_at`, `std::destroy` and `std::destroy_n` arrived in C++17; `std::construct_at` in C++20 (it exists mainly so construction in existing storage works in `constexpr`).
- C++17 alternative: `Px* q = ::new (static_cast<void*>(buf)) Px(2);`.
- **Key Concept:** `destroy_at` is C++17, `construct_at` is C++20.

---

#### Q10
```cpp
// Q: Is this undefined behaviour? Does the answer depend on the standard version?
#include <iostream>
#include <new>

struct Fill {
    const int id;
    double qty;
};

int main() {
    alignas(Fill) unsigned char buf[sizeof(Fill)];
    Fill* p = new (buf) Fill{1, 100.0};
    p->~Fill();
    new (buf) Fill{2, 250.0};          // new object, same storage
    std::cout << p->id << ' ' << p->qty << '\n';
}
```

**Answer:**
```
Prints "2 250" with GCC at -O0, but:
C++17: undefined behaviour. Fill has a const member, so the new object does not transparently
replace the old one; p must be laundered: std::launder(p)->id.
C++20: well-defined (the const/reference-member restriction was removed).
```

**Explanation:**
- `p` pointed to the first `Fill`, whose lifetime ended at `p->~Fill()`. Whether `p` can reach the second `Fill` depends on the transparent replacement rules.
- In C++17, a `const` member let the compiler assume `p->id` never changes, so it could legally print a cached `1`.
- Simplest code that is correct in every version: keep the pointer returned by the second placement new.
- Accessing through `reinterpret_cast<Fill*>(buf)` would need `std::launder` in every version.
- **Key Concept:** Reused storage holds a new object; use the pointer from its construction (or `std::launder`).

**Fixed Version:**
```cpp
#include <iostream>
#include <new>

struct Fill {
    const int id;
    double qty;
};

int main() {
    alignas(Fill) unsigned char buf[sizeof(Fill)];
    Fill* p = new (buf) Fill{1, 100.0};
    p->~Fill();
    Fill* q = new (buf) Fill{2, 250.0};
    std::cout << q->id << ' ' << q->qty << '\n';            // 2 250
    std::cout << std::launder(p)->id << '\n';               // 2, also valid in C++17
}
```

---

#### Q11
```cpp
// Q: Building three objects in raw storage. Find the bug.
#include <cstddef>
#include <iostream>
#include <memory>
#include <new>
#include <stdexcept>
#include <string>

struct Leg {
    std::string name;
    explicit Leg(int i) : name("leg number " + std::to_string(i) + " with a long name") {
        if (i == 2) throw std::runtime_error("bad leg");
    }
};

int main() {
    alignas(Leg) std::byte raw[3 * sizeof(Leg)];
    Leg* legs = reinterpret_cast<Leg*>(raw);
    try {
        for (int i = 0; i < 3; ++i)
            ::new (static_cast<void*>(legs + i)) Leg(i);
        std::destroy_n(legs, 3);
    } catch (const std::exception& e) {
        std::cout << "caught " << e.what() << '\n';
    }
}
```

**Answer:**
```
caught bad leg
then LeakSanitizer: "Direct leak of 62 byte(s) in 2 object(s)": legs 0 and 1 were constructed
but never destroyed (their strings' heap buffers).
```

**Explanation:**
- The third constructor throws; the loop exits and the `destroy_n` line is skipped. Nothing destroys the two finished `Leg`s, so their strings' heap buffers leak.
- The failing `Leg(2)` itself is fine: its `name` member was already constructed and is destroyed during unwinding.
- **Key Concept:** When constructing several objects by hand, roll back the ones already built; the `std::uninitialized_*` algorithms do this for you.

**Fixed Version:**
```cpp
#include <cstddef>
#include <iostream>
#include <memory>
#include <new>
#include <stdexcept>
#include <string>

struct Leg {
    std::string name;
    explicit Leg(int i) : name("leg number " + std::to_string(i) + " with a long name") {
        if (i == 2) throw std::runtime_error("bad leg");
    }
};

int main() {
    alignas(Leg) std::byte raw[3 * sizeof(Leg)];
    Leg* legs = reinterpret_cast<Leg*>(raw);
    const int ids[3] = {0, 1, 2};
    try {
        // Constructs Leg(ids[k]) in place; on a throw it destroys the ones already built.
        Leg* end = std::uninitialized_copy(ids, ids + 3, legs);
        std::destroy(legs, end);
    } catch (const std::exception& e) {
        std::cout << "caught " << e.what() << '\n';     // no leaks under ASan
    }
}
```

---

#### Q12
```cpp
// Q: What does this print?
#include <cstddef>
#include <iostream>

struct Plain { int x; };
struct UserCtor { int x; UserCtor() {} };

int main() {
    Plain* a = new Plain();
    Plain* b = new Plain{};
    int* arr = new int[4]();
    UserCtor* u = new UserCtor();
    int sum = 0;
    for (int i = 0; i < 4; ++i) sum += arr[i];
    std::cout << a->x << ' ' << b->x << ' ' << sum << '\n';
    u->x = 5;                        // reading u->x before this line would be UB
    std::cout << u->x << '\n';
    delete a;
    delete b;
    delete[] arr;
    delete u;
}
```

**Answer:**
```
0 0 0
5
```

**Explanation:**
- `new Plain()` value-initializes: `Plain` has no user-provided constructor, so `x` is zeroed. `new Plain{}` is aggregate initialization (`Plain` is an aggregate); a member with no initializer is initialized from `{}`, so `x` is also 0.
- `new int[4]()` value-initializes every element to 0.
- `new UserCtor()` calls the user-provided constructor, which initializes nothing: `x` is indeterminate, and reading it before assignment would be undefined behaviour (it may well print 0 on a fresh heap page, which hides the bug).
- `new Plain` (no parentheses) would also leave `x` indeterminate.
- **Key Concept:** Parentheses/braces zero-initialize only when the class has no user-provided default constructor.
