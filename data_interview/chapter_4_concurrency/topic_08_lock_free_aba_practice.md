## TOPIC: Lock-Free Programming and the ABA Problem

### PRACTICE_TASKS: Output Prediction and Bug Hunting

#### Q1
```cpp
// Q: Classify each increment as blocking, lock-free or wait-free (assume x86-64, GCC). What is printed?
#include <atomic>
#include <iostream>
#include <mutex>
#include <thread>
#include <vector>

std::mutex m;
long a = 0;
std::atomic<long> b{0}, c{0};

void inc_a() { std::lock_guard<std::mutex> g(m); ++a; }
void inc_b() { long e = b.load(); while (!b.compare_exchange_weak(e, e + 1)) {} }
void inc_c() { c.fetch_add(1); }

int main() {
    std::vector<std::thread> ts;
    for (int t = 0; t < 4; ++t)
        ts.emplace_back([] { for (int i = 0; i < 10000; ++i) { inc_a(); inc_b(); inc_c(); } });
    for (auto& t : ts) t.join();
    std::cout << a << ' ' << b << ' ' << c << '\n';
}
```

**Answer:**
```
40000 40000 40000
inc_a: blocking. inc_b: lock-free (not wait-free). inc_c: wait-free on x86-64 (single lock xadd), but the C++ standard does not guarantee it.
```

**Explanation:**
- All three are correct, so the output is the same; they differ in **progress guarantee**, not in result.
- `inc_a`: if the thread holding `m` is preempted, every other caller waits. Blocking.
- `inc_b`: a failed CAS means another thread's CAS succeeded (system-wide progress), but one thread can lose indefinitely. Lock-free.
- `inc_c`: compiles to `lock xadd`, no retry loop: each call completes in bounded steps. On LL/SC CPUs without LSE it becomes a retry loop (lock-free only).
- **Key Concept:** Progress guarantees classify how threads can stall each other, not correctness or speed.

---

#### Q2
```cpp
// Q: Find the bug. How many nodes end up in the stack?
#include <atomic>
#include <iostream>
#include <thread>
#include <vector>

struct Node { int value; Node* next; };
std::atomic<Node*> head{nullptr};

void push(Node* n) {
    n->next = head.load();
    head.compare_exchange_weak(n->next, n);
}

int main() {
    std::vector<Node> nodes(400000);
    std::vector<std::thread> ts;
    for (int t = 0; t < 4; ++t)
        ts.emplace_back([&, t] { for (int i = 0; i < 100000; ++i) push(&nodes[t * 100000 + i]); });
    for (auto& t : ts) t.join();
    int count = 0;
    for (Node* p = head.load(); p; p = p->next) ++count;
    std::cout << count << '\n';
}
```

**Answer:**
```
Bug: the CAS result is ignored. Prints a run-dependent count below 400000 (pushes that lost the race, or failed spuriously, are silently dropped).
```

**Explanation:**
- `compare_exchange_weak` fails whenever another thread changed `head` in between (and may also fail spuriously). Without a loop, the push simply does not happen.
- No data race: the node is still private when the CAS fails; it just never gets linked.
- Even a single-threaded program could lose pushes on LL/SC hardware because of spurious failure.
- **Key Concept:** A CAS that can fail must be in a retry loop (or its failure must be handled).

**Fixed Version:**
```cpp
#include <atomic>
#include <iostream>
#include <thread>
#include <vector>

struct Node { int value; Node* next; };
std::atomic<Node*> head{nullptr};

void push(Node* n) {
    n->next = head.load();
    while (!head.compare_exchange_weak(n->next, n)) {
        // n->next refreshed with the current head
    }
}

int main() {
    std::vector<Node> nodes(400000);
    std::vector<std::thread> ts;
    for (int t = 0; t < 4; ++t)
        ts.emplace_back([&, t] { for (int i = 0; i < 100000; ++i) push(&nodes[t * 100000 + i]); });
    for (auto& t : ts) t.join();
    int count = 0;
    for (Node* p = head.load(); p; p = p->next) ++count;
    std::cout << count << '\n';   // 400000
}
```

---

#### Q3
```cpp
// Q: This push has a retry loop. Is it correct? How many nodes are reachable at the end?
#include <atomic>
#include <iostream>
#include <thread>
#include <vector>

struct Node { int value; Node* next; };
std::atomic<Node*> head{nullptr};

void push(Node* n) {
    Node* old = head.load();
    n->next = old;
    while (!head.compare_exchange_weak(old, n)) {
        // retry
    }
}

int main() {
    std::vector<Node> nodes(400000);
    std::vector<std::thread> ts;
    for (int t = 0; t < 4; ++t)
        ts.emplace_back([&, t] { for (int i = 0; i < 100000; ++i) push(&nodes[t * 100000 + i]); });
    for (auto& t : ts) t.join();
    int count = 0;
    for (Node* p = head.load(); p; p = p->next) ++count;
    std::cout << count << '\n';
}
```

**Answer:**
```
Not correct. Prints a run-dependent count below 400000: nodes pushed by other threads during a retry become unreachable.
```

**Explanation:**
- After a failed CAS, `old` is refreshed with the current head, but `n->next` still points to the **original** head.
- The retry then succeeds with `head = n` while `n->next` skips every node pushed in between. Those nodes are cut out of the list.
- No data race and no crash: the list is silently missing nodes. Only a count check reveals it.
- The idiomatic form passes `n->next` itself as the `expected` argument, so the CAS refreshes the link directly.
- **Key Concept:** Everything derived from `expected` must be recomputed on each retry.

**Fixed Version:**
```cpp
#include <atomic>
#include <iostream>
#include <thread>
#include <vector>

struct Node { int value; Node* next; };
std::atomic<Node*> head{nullptr};

void push(Node* n) {
    n->next = head.load();
    while (!head.compare_exchange_weak(n->next, n)) {}   // failure refreshes n->next itself
}

int main() {
    std::vector<Node> nodes(400000);
    std::vector<std::thread> ts;
    for (int t = 0; t < 4; ++t)
        ts.emplace_back([&, t] { for (int i = 0; i < 100000; ++i) push(&nodes[t * 100000 + i]); });
    for (auto& t : ts) t.join();
    int count = 0;
    for (Node* p = head.load(); p; p = p->next) ++count;
    std::cout << count << '\n';   // 400000
}
```

---

#### Q4
```cpp
// Q: This replays a two-thread interleaving step by step. What does it print?
#include <atomic>
#include <iostream>

struct Node { char name; Node* next; bool in_stack; };
std::atomic<Node*> head{nullptr};

void push(Node* n) {
    n->next = head.load();
    while (!head.compare_exchange_weak(n->next, n)) {}
    n->in_stack = true;
}
Node* pop() {
    Node* old = head.load();
    while (old && !head.compare_exchange_weak(old, old->next)) {}
    if (old) old->in_stack = false;
    return old;
}

int main() {
    Node a{'A', nullptr, false}, b{'B', nullptr, false}, c{'C', nullptr, false}, d{'D', nullptr, false};
    push(&d); push(&c); push(&b); push(&a);          // head -> A -> B -> C -> D

    Node* t1_old = head.load();                      // T1: begins pop, reads A
    Node* t1_next = t1_old->next;                    // T1: reads B, then is preempted

    Node* x = pop(); pop(); pop();                   // T2: pops A, B, C
    push(x);                                         // T2: pushes A back: head -> A -> D

    bool ok = head.compare_exchange_strong(t1_old, t1_next);   // T1 resumes
    std::cout << "T1 CAS: " << (ok ? "success" : "failure") << '\n';
    std::cout << "stack:";
    for (Node* p = head.load(); p; p = p->next)
        std::cout << ' ' << p->name << (p->in_stack ? "" : "(removed)");
    std::cout << '\n';
}
```

**Answer:**
```
T1 CAS: success
stack: B(removed) C(removed) D
```

**Explanation:**
- T1 read `head == A` and `next == B`.
- T2 popped A, B, C and pushed A back, so `head == A` again, now with `A->next == D`.
- T1's CAS compares only the pointer: `A == A`, so it succeeds and installs the stale `B`.
- The stack now starts with B and C, which T2 owns (and may already have freed), and A is lost. That is the **ABA problem**: the value went A, B (other states), A.
- In real code with `delete`, walking this list is a use-after-free.
- **Key Concept:** CAS proves the value is equal now, not that nothing changed; the cached `next` is the casualty.

---

#### Q5
```cpp
// Q: Find the bug. Does the null check make the pop safe?
#include <atomic>
#include <iostream>

struct Node { int value; Node* next; };
std::atomic<Node*> head{nullptr};

int main() {
    head.store(new Node{1, new Node{2, nullptr}});

    // T1: starts a pop
    Node* old = head.load();

    // T2: pops the same node and frees it
    Node* victim = head.load();
    head.store(victim->next);
    delete victim;

    // T1 resumes
    if (old != nullptr) {                        // "safety" check
        Node* next = old->next;                  // reads freed memory
        std::cout << (head.compare_exchange_strong(old, next) ? "popped" : "retry") << '\n';
    }
    delete head.load();
}
```

**Answer:**
```
Undefined behaviour: heap-use-after-free on old->next (AddressSanitizer reports it). The null check passes because delete does not null other copies of the pointer.
```

**Explanation:**
- `old` and `victim` hold the same address. `delete victim` ends the object's lifetime, but `old` still contains that (now dangling) address: `old != nullptr` is true.
- `old->next` reads freed memory. Built with `-fsanitize=address`, the program aborts with `heap-use-after-free`. Without ASan it may print "retry", crash, or anything else.
- A tag counter would make the later CAS fail, but the read has already happened.
- Fix: never free a node while another thread may hold it. Retire it and free it later via hazard pointers, epochs or RCU, or keep nodes in a pool that is never released.
- **Key Concept:** Non-null is not alive; lifetime needs a reclamation protocol.

---

#### Q6
```cpp
// Q: The head carries a version tag to stop ABA. What does this program print?
#include <atomic>
#include <cstdint>
#include <iostream>

// head = [ 8-bit tag | 8-bit node index ], 0xFF = empty
struct Node { char name; std::uint8_t next; };
Node nodes[4] = {{'A', 0xFF}, {'B', 0xFF}, {'C', 0xFF}, {'D', 0xFF}};
std::atomic<std::uint16_t> head{0x00FF};

std::uint8_t idx(std::uint16_t h) { return h & 0xFF; }
std::uint8_t tag(std::uint16_t h) { return h >> 8; }
std::uint16_t make(std::uint8_t i, std::uint8_t t) { return std::uint16_t(t << 8 | i); }

void push(std::uint8_t i) {
    std::uint16_t old = head.load();
    do { nodes[i].next = idx(old); } while (!head.compare_exchange_weak(old, make(i, tag(old) + 1)));
}
std::uint8_t pop() {
    std::uint16_t old = head.load();
    while (idx(old) != 0xFF && !head.compare_exchange_weak(old, make(nodes[idx(old)].next, tag(old) + 1))) {}
    return idx(old);
}

int main() {
    push(3); push(2); push(1); push(0);                    // A B C D, tag = 4
    std::uint16_t t1_old = head.load();                    // T1 reads {A, tag 4}
    std::uint8_t t1_next = nodes[idx(t1_old)].next;        // T1 reads next = B, preempted

    std::uint8_t a = pop(); pop(); pop(); push(a);          // T2: 4 updates
    for (int k = 0; k < 126; ++k) { pop(); push(a); }       // T2: 252 more updates

    std::cout << "tag seen by T1: " << int(tag(t1_old)) << ", tag now: " << int(tag(head.load())) << '\n';
    bool ok = head.compare_exchange_strong(t1_old, make(t1_next, tag(t1_old) + 1));
    std::cout << "T1 CAS " << (ok ? "succeeded" : "failed") << '\n';
    std::cout << "stack:";
    for (std::uint8_t i = idx(head.load()); i != 0xFF; i = nodes[i].next) std::cout << ' ' << nodes[i].name;
    std::cout << '\n';
}
```

**Answer:**
```
tag seen by T1: 4, tag now: 4
T1 CAS succeeded
stack: B C D
```

**Explanation:**
- T1 snapshots `{A, tag 4}`. T2 performs exactly 256 successful head updates, so the 8-bit tag wraps from 4 back to 4 (`4 + 256 mod 256`), and the head index is A again.
- T1's stale CAS sees `{A, 4} == {A, 4}` and succeeds, installing `B`, which T2 had removed (B and C are no longer owned by the stack): ABA is back.
- A preempted thread can easily sleep through 256 updates. Use 32-bit tags (index + tag in 64 bits) or 64-bit counters with a double-width CAS.
- **Key Concept:** A version tag only works if it cannot wrap during one thread's preemption window.

**Fixed Version:**
```cpp
#include <atomic>
#include <cstdint>
#include <iostream>

// head = [ 32-bit tag | 32-bit node index ]
constexpr std::uint32_t kNil = 0xFFFFFFFFu;
struct Node { char name; std::uint32_t next; };
Node nodes[4] = {{'A', kNil}, {'B', kNil}, {'C', kNil}, {'D', kNil}};
std::atomic<std::uint64_t> head{kNil};

std::uint32_t idx(std::uint64_t h) { return std::uint32_t(h); }
std::uint32_t tag(std::uint64_t h) { return std::uint32_t(h >> 32); }
std::uint64_t make(std::uint32_t i, std::uint32_t t) { return std::uint64_t(t) << 32 | i; }

void push(std::uint32_t i) {
    std::uint64_t old = head.load();
    do { nodes[i].next = idx(old); } while (!head.compare_exchange_weak(old, make(i, tag(old) + 1)));
}
std::uint32_t pop() {
    std::uint64_t old = head.load();
    while (idx(old) != kNil && !head.compare_exchange_weak(old, make(nodes[idx(old)].next, tag(old) + 1))) {}
    return idx(old);
}

int main() {
    push(3); push(2); push(1); push(0);
    std::uint64_t t1_old = head.load();
    std::uint32_t t1_next = nodes[idx(t1_old)].next;

    std::uint32_t a = pop(); pop(); pop(); push(a);
    for (int k = 0; k < 126; ++k) { pop(); push(a); }

    bool ok = head.compare_exchange_strong(t1_old, make(t1_next, tag(t1_old) + 1));
    std::cout << "T1 CAS " << (ok ? "succeeded" : "failed") << '\n';      // failed: tag 4 vs 260
    std::cout << "stack:";
    for (std::uint32_t i = idx(head.load()); i != kNil; i = nodes[i].next) std::cout << ' ' << nodes[i].name;
    std::cout << '\n';                                                     // stack: A D
}
```

---

#### Q7
```cpp
// Q: This stack uses only std::atomic_flag, no std::mutex. Is it lock-free?
#include <atomic>
#include <iostream>
#include <thread>
#include <vector>

class Stack {
    std::atomic_flag busy_;                 // C++20: starts clear
    std::vector<int> data_;
public:
    void push(int v) {
        while (busy_.test_and_set()) {}     // spin until we own it
        data_.push_back(v);
        busy_.clear();
    }
    std::size_t size() {
        while (busy_.test_and_set()) {}
        std::size_t n = data_.size();
        busy_.clear();
        return n;
    }
};

int main() {
    Stack s;
    std::vector<std::thread> ts;
    for (int t = 0; t < 4; ++t)
        ts.emplace_back([&] { for (int i = 0; i < 10000; ++i) s.push(i); });
    for (auto& t : ts) t.join();
    std::cout << s.size() << '\n';
}
```

**Answer:**
```
40000. Correct, but NOT lock-free: busy_ is a hand-written spinlock, so the algorithm is blocking.
```

**Explanation:**
- If a thread is preempted between `test_and_set()` and `clear()`, every other thread spins forever without completing an operation. That violates lock-freedom by definition.
- "No `std::mutex`" is not the criterion; **progress when any thread is suspended** is.
- `vector::push_back` may also allocate (another hidden potential lock).
- It is a perfectly fine spinlock-protected stack; just do not call it lock-free.
- **Key Concept:** A lock built from atomics is still a lock.

---

#### Q8
```cpp
// Q: Find the bug in this hazard-pointer pop.
#include <atomic>
#include <iostream>
#include <optional>
#include <vector>

struct Node { int value; Node* next; };
constexpr int kMaxThreads = 8;
std::atomic<Node*> head{nullptr};
std::atomic<Node*> hazard[kMaxThreads];
std::vector<Node*> retired[kMaxThreads];

std::optional<int> pop(int tid) {
    Node* old;
    do {
        old = head.load();
        if (!old) return std::nullopt;
        hazard[tid].store(old);                 // announce
        // ... use old ...
    } while (!head.compare_exchange_strong(old, old->next));
    hazard[tid].store(nullptr);
    int v = old->value;
    retired[tid].push_back(old);                // freed later by a scan that skips announced nodes
    return v;
}

int main() {
    head.store(new Node{7, nullptr});
    std::cout << pop(0).value_or(-1) << '\n';
    for (Node* n : retired[0]) delete n;
}
```

**Answer:**
```
Prints 7 single-threaded, but there is a latent use-after-free: the hazard pointer is never re-validated after being published, so old->next can read a node that was already retired and freed.
```

**Explanation:**
- Race: T1 loads `old = A`. Before T1's `hazard.store(A)` is visible, T2 pops A, retires it, runs a scan, sees no hazard for A, and deletes it. T1 then publishes a hazard for a dead node and reads `old->next`: use-after-free.
- The announcement only protects nodes that were **still reachable after** it became visible. Hence: publish, then re-read `head` and retry if it changed.
- The publish (store) and the re-read (load) must not be reordered: keep them `seq_cst` (default) or put a full fence between them (topic 06).
- **Key Concept:** Hazard pointer protocol is announce, re-validate, then dereference.

**Fixed Version:**
```cpp
#include <atomic>
#include <iostream>
#include <optional>
#include <vector>

struct Node { int value; Node* next; };
constexpr int kMaxThreads = 8;
std::atomic<Node*> head{nullptr};
std::atomic<Node*> hazard[kMaxThreads];
std::vector<Node*> retired[kMaxThreads];

std::optional<int> pop(int tid) {
    Node* old = head.load();
    for (;;) {
        if (!old) { hazard[tid].store(nullptr); return std::nullopt; }
        hazard[tid].store(old);                 // 1. announce
        Node* again = head.load();              // 2. re-validate (seq_cst store then load)
        if (again != old) { old = again; continue; }
        if (head.compare_exchange_strong(old, old->next)) break;   // 3. old is protected
    }
    hazard[tid].store(nullptr);
    int v = old->value;
    retired[tid].push_back(old);
    return v;
}

int main() {
    head.store(new Node{7, nullptr});
    std::cout << pop(0).value_or(-1) << '\n';   // 7
    for (Node* n : retired[0]) delete n;
}
```

---

#### Q9
```cpp
// Q: What does this print on x86-64 with GCC, and what does it mean for a "lock-free" tagged-pointer stack?
#include <atomic>
#include <cstdint>
#include <iostream>

struct Node;
struct TaggedPtr { Node* ptr; std::uint64_t tag; };

int main() {
    std::cout << sizeof(TaggedPtr) << ' ' << std::boolalpha
              << std::atomic<TaggedPtr>::is_always_lock_free << ' '
              << std::atomic<std::uint64_t>::is_always_lock_free << '\n';
}
```

**Answer:**
```
16 false true
```

**Explanation:**
- `{pointer, 64-bit tag}` is 16 bytes. The CPU has `cmpxchg16b`, but GCC routes 16-byte atomics through `libatomic`, reports them as not always lock-free, and requires `-latomic` to link any operation on them.
- A Treiber stack built on `std::atomic<TaggedPtr>` therefore may contain a hidden lock: not lock-free, even though the source has no mutex.
- Alternatives that fit in one lock-free 8-byte word: a 32-bit node index plus a 32-bit tag (preallocated pool), or a tag in the unused upper bits of a 48-bit x86-64 pointer (narrower, can wrap).
- Clang may inline `cmpxchg16b` with `-mcx16`; results are compiler and flag dependent, so assert it: `static_assert(std::atomic<Head>::is_always_lock_free);`.
- **Key Concept:** Verify the lock-freedom of the atomics your algorithm depends on.

---

#### Q10
```cpp
// Q: A counter goes 5 -> 6 -> 5 between T1's load and T1's CAS. Is this ABA a bug here? What is printed?
#include <atomic>
#include <iostream>

int main() {
    std::atomic<int> credits{5};

    int t1_expected = credits.load();            // T1 reads 5, wants to double it

    credits.fetch_add(1);                        // T2: 5 -> 6
    credits.fetch_sub(1);                        // T3: 6 -> 5

    bool ok = credits.compare_exchange_strong(t1_expected, t1_expected * 2);
    std::cout << std::boolalpha << ok << ' ' << credits << '\n';
}
```

**Answer:**
```
true 10
```

**Explanation:**
- The CAS succeeds despite the 5, 6, 5 history: technically an ABA pattern.
- It is **harmless** here: the integer is the whole state. T1's computation depends only on the value 5, and the value really is 5, so doubling it is linearizable (as if T1 ran after T2 and T3).
- ABA becomes a bug when the CAS value is a **proxy for other state**, like a pointer whose `next` field or pointee was read earlier and has since changed or been freed.
- Interview angle: knowing when ABA does **not** matter shows you understand why it matters elsewhere.
- **Key Concept:** ABA is dangerous only when the compared value stands for state that can change behind it.
