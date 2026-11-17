## TOPIC: Lock-Free Programming and the ABA Problem

### THEORY_SECTION: Core Concepts

#### 1. Mental model
- "Lock-free" is a **progress guarantee**, not "code without `std::mutex`" and not "fast".
- The test that defines each class: **suspend one thread at the worst possible instruction, forever. Can the others still finish their operations?**
  - Blocking (mutex, spinlock): no, if the suspended thread holds the lock.
  - Lock-free: yes, at least one other thread keeps completing operations.
  - Wait-free: yes, and every running thread finishes within a bounded number of its own steps.
- A lock-free data structure is three problems stacked on top of each other:

| Layer | Question | Tool |
|---|---|---|
| CAS | Is the shared word still what I based my update on? | `compare_exchange` (topic 05) |
| ABA | Did it change away and come back while I was not looking? | tags/version counters, or never reuse memory while it is referenced |
| Memory reclamation | Can another thread still be dereferencing the node I just removed? | hazard pointers, epoch-based reclamation, RCU, reference counting |

- Writing the CAS loop is the easy 10 percent. ABA and reclamation are where real lock-free code breaks.

#### 2. Progress guarantees
| Class | Guarantee | Can one thread starve? | Example |
|---|---|---|---|
| **Blocking** | none if a lock holder is delayed | yes | `std::mutex`, spinlock |
| **Obstruction-free** | a thread completes if it eventually runs **in isolation** (others paused) | yes, and livelock among contenders is possible | some STM designs |
| **Lock-free** | **system-wide**: some thread completes an operation in a finite number of steps | yes | CAS retry loop, Treiber stack |
| **Wait-free** | **per-thread**: every operation completes in a bounded number of its own steps | no | SPSC ring buffer `try_push`/`try_pop`, `fetch_add` on x86 (`lock xadd`) |

- Strength: wait-free > lock-free > obstruction-free > blocking. Each implies the ones below it.
- Blocking algorithms are further split into deadlock-free (some thread acquires) and starvation-free (every thread eventually acquires, e.g. a fair ticket lock).
- Lock-freedom is a property of the **whole algorithm**, including the atomics it uses (`is_always_lock_free`) and anything it calls (an allocator that takes a lock breaks it).
- Wait-free does **not** mean low latency; wait-free algorithms are often slower on average (helping, extra metadata). The guarantee is a bound, not a speed.
- Theory footnote: CAS has infinite consensus number (Herlihy), so it can implement any wait-free object; plain loads/stores cannot even solve 2-thread consensus; `fetch_add`, `exchange`, `test_and_set` have consensus number 2.

#### 3. The Treiber stack (the canonical lock-free structure)
- Shared state: `std::atomic<Node*> head`.
- **Push**:
```text
n->next = head.load()
loop: CAS(head, expected = n->next, desired = n)   // on failure n->next is refreshed
```
- **Pop**:
```text
old = head.load()
loop: if old == null: empty
      next = old->next           <-- dereferences old: lifetime problem
      CAS(head, expected = old, desired = next)
return old
```
- Linearization point: the successful CAS on `head`.
- Push is easy and safe: it only dereferences its own node.
- Pop is hard: it reads `old->next` from a node that another thread may pop, free, or recycle at any moment. Both ABA and the reclamation problem live in those two lines.
- Lock-free because every failed CAS means another thread's CAS succeeded.
- Not wait-free: one thread can lose every race.

#### 4. The ABA problem
- CAS compares **values**, not **history**. If the value goes A to B and back to A, CAS cannot tell.
- Classic pop interleaving:
```text
stack: head -> A -> B -> C

T1 (pop):  old = A, next = B          ...preempted...
T2:        pop A, pop B (B freed), push A back      stack: head -> A -> C
T1 resumes: CAS(head, A, B) succeeds  (head == A, as expected)
result:    head -> B  (B is freed memory), and C is reachable only through a dangling node
```
- The CAS check was correct about the head pointer, but `next = B` was computed from a state that no longer exists.
- Where the "same A" comes from in practice:
  - The same node is pushed back (object pools, free lists).
  - The allocator hands the freed address back to a new node (`malloc` very often reuses the most recently freed block of the same size).
- ABA is mostly a problem for **pointer** CAS in structures with removal. A counter that goes 5, 6, 5 has no hidden state, so ABA there is harmless.

#### 5. Fixing ABA
| Technique | Idea | Cost / caveat |
|---|---|---|
| **Tagged pointer / version counter** | CAS on `{pointer, counter}`; every successful update bumps the counter, so A with version 5 differs from A with version 7 | needs a double-width CAS (`cmpxchg16b`, often not reported lock-free by GCC, needs `-latomic`), or spare pointer bits (x86-64 user pointers use 48 bits), or a 32-bit index + 32-bit tag in one 64-bit word; tags can wrap |
| **Never reuse memory while referenced** | if A cannot be freed/reused while T1 holds it, A cannot reappear | this is exactly what hazard pointers, epochs and RCU provide, so they fix ABA as a side effect |
| **Reference counting** (`atomic<shared_ptr>`) | a node held by a reader is not destroyed | usually not lock-free; refcount traffic on every access |
| **LL/SC hardware** | store-conditional fails if the location was written at all since the load-linked | not exposed in C++; reservations are fragile; `compare_exchange` stays value-based |
| **Avoid the problem** | bounded preallocated arrays with indices and sequence numbers (ring buffers) | fixed capacity |

- A timer or timestamp is not the standard fix; a monotonically incremented **version/tag counter** is.
- Tag width matters: an 8-bit tag wraps after 256 updates, which a preempted thread can easily sleep through. 32 bits (wrap after ~4 billion updates) is the usual practical choice; 64-bit counters effectively never wrap.

#### 6. The memory reclamation problem
- After a successful pop, when is `delete old` safe? Only when **no other thread can still dereference it**. Another thread may have loaded `old` from `head` a moment earlier and be about to read `old->next`.
- `if (p != nullptr)` does not help: `delete` does not null out other threads' copies; a dangling pointer is non-null.
- ABA vs reclamation are **related but different**:
  - ABA: the value came back, CAS cannot see the history (can happen with no `delete` at all, e.g. pooled nodes).
  - Reclamation: a node is freed while someone still holds a pointer to it (use-after-free, even without any ABA).
  - A tagged pointer fixes ABA but **not** use-after-free: the stale `old->next` read can still touch memory returned to the OS. Tags are safe only with type-stable memory (pools that never return memory).
- Reclamation schemes (all: "retire now, free later"):

| Scheme | Reader side | Reclaimer side | Trade-off |
|---|---|---|---|
| **Hazard pointers** | publish the pointer you are about to use in a per-thread slot, then **re-validate** it is still reachable | retire to a list; periodically scan all hazard slots, free only unprotected nodes | bounded garbage; a store + full fence per protected access |
| **Epoch-based reclamation (EBR)** | announce "I am in epoch e" when entering an operation, clear when leaving | retired nodes are tagged with the epoch; free when all active threads have moved past it | very cheap reads; one stalled thread blocks **all** reclamation (unbounded garbage) |
| **RCU** (read-copy-update) | read-side critical sections are almost free | writers publish a new version, then wait for a grace period before freeing the old one | ideal for read-mostly data (Linux kernel, config snapshots); writers pay |
| **Reference counting** | increment count before use | free when count reaches 0 | contended refcount on every read; correct lock-free refcounting is subtle |
| **Never free** (type-stable pool) | nothing | nodes go back to a pool, never to the OS | needs tags for ABA; memory never shrinks |

- C++26 standardizes both `std::hazard_pointer` (`<hazard_pointer>`, P2530) and RCU (`<rcu>`, P2545); folly and libcds ship production versions today.
- The reclamation protocol itself must not reintroduce a lock on the read path, otherwise the structure is no longer lock-free.

#### 7. When lock-free is NOT faster
- **One hot word:** every push and pop CASes the same `head`. Under contention the cache line ping-pongs and CAS failures waste work. A mutex has the same hot line, and lock-free just spins instead of sleeping.
- **Retry storms:** N threads contending means up to N-1 failed CASes per success; throughput can fall as threads increase. Back-off or elimination arrays help.
- **Uncontended mutex is cheap:** one atomic RMW to lock, one to unlock (futex fast path). A lock-free operation that needs several CASes plus hazard-pointer fences can be slower.
- **Allocation:** `new Node` per push goes through the allocator, which may take a lock and dominates the cost.
- **Reclamation overhead:** hazard pointer publication needs a full fence per access; epoch bookkeeping; retired lists.
- **Complexity cost:** subtle bugs (ABA, use-after-free, memory ordering) that tests rarely reproduce.
- What lock-free **does** buy:
  - No thread can block others by being preempted, page-faulting, or descheduled while holding a lock.
  - No priority inversion, no deadlock, no convoying.
  - Usable from signal handlers and some real-time contexts (if the atomics are lock-free).
  - Often better **tail latency** under oversubscription, even when median throughput is equal or worse.
- Low-latency practice: avoid sharing instead of making sharing lock-free. SPSC ring buffers per producer/consumer pair are wait-free, preallocated, have no ABA and no reclamation problem.

#### 8. Misconceptions to unlearn
- ❌ "Lock-free means no mutex in the code." ✅ It is a progress guarantee; a hand-rolled spinlock built from atomics is still **blocking**.
- ❌ "Lock-free means every thread makes progress." ✅ Only the system does; that is wait-free.
- ❌ "A CAS loop is wait-free because nobody waits on a lock." ✅ Unbounded retries make it lock-free only.
- ❌ "Lock-free is automatically faster than a mutex." ✅ Often equal or slower in throughput; the win is progress and tail latency.
- ❌ "Wait-free means lowest latency." ✅ It is a bound on steps, not a speed.
- ❌ "`fetch_add` is always wait-free." ✅ The standard promises no wait-freedom; it is a single `lock xadd` on x86 but an LL/SC retry loop on older ARM; `fetch_or` with a used result is a CAS loop even on x86.
- ❌ "ABA can be fixed with a timer/timestamp." ✅ Use a monotonic version/tag counter (or safe reclamation).
- ❌ "ABA and use-after-free are the same problem." ✅ Related; tags fix ABA, reclamation schemes fix lifetime (and as a side effect ABA).
- ❌ "Check `p != nullptr` before using a popped node." ✅ A dangling pointer is not null.
- ❌ "Just use `shared_ptr` and the problem disappears." ✅ It works for lifetime, but costs atomic refcount traffic and `atomic<shared_ptr>` is usually not lock-free.
- ❌ "Reclamation means threads synchronize with a lock about who deletes." ✅ They coordinate through atomic announcements (hazard slots, epochs) precisely to avoid waiting on each other.

### EDGE_CASES: Traps and Misconceptions

#### Edge Case 1: A null check does not detect a freed node
- People assume: "Before dereferencing `old`, check it is not null."
- What happens: T1 loads `old = A`. T2 pops A and `delete`s it. T1's `old` still holds A's address: `old != nullptr` is true, `old->next` is a use-after-free (UB).
- `delete p` only affects the object, not every copy of the pointer in other threads.
- Fix: a reclamation scheme (hazard pointers, epochs, RCU) or never freeing nodes while the structure is live.

#### Edge Case 2: A tag counter fixes ABA but not use-after-free
- People assume: "With a version counter my pop is safe."
- What happens: pop still reads `old->next` **before** the CAS. If `old` was freed and its page returned to the OS, that read can segfault. The tag only makes the subsequent CAS fail.
- Tags are safe when nodes live in **type-stable memory** (a pool or array that is never released while the structure exists), so the stale read returns garbage that the failing CAS discards.
- Even then, `next` should be an atomic (read `relaxed`) because the stale read can race with the node's new owner writing `next`; a plain field is a formal data race.

#### Edge Case 3: Your "lock-free" stack calls `new`
- People assume: "No mutex in push, so push is lock-free."
- What happens: `new Node` goes to the allocator; glibc `malloc` uses per-thread caches and arenas but can take arena locks and make system calls. The end-to-end operation is only as lock-free as the allocator.
- Low-latency designs preallocate nodes (pools, free lists, ring buffers) so the hot path never allocates.

#### Edge Case 4: A lock-free algorithm on a non-lock-free atomic
- People assume: "I used only `std::atomic`, so the algorithm is lock-free."
- What happens: a double-width tagged pointer `struct { Node* p; uint64_t tag; }` is 16 bytes. With GCC on x86-64, `std::atomic` of it reports `is_always_lock_free == false`, its operations go through `libatomic` (link `-latomic`), and `is_lock_free()` reports `false`.
- The algorithm silently contains locks. Guard with `static_assert(std::atomic<Head>::is_always_lock_free);` and use a 64-bit packed representation (index + tag, or spare pointer bits) when it fails.

#### Edge Case 5: Tag wraparound
- People assume: "Any tag fixes ABA."
- What happens: a preempted thread can sleep through `2^bits` updates. An 8-bit or 16-bit tag (squeezed into spare pointer bits) can wrap back to the same value; CAS then succeeds on a stale `{A, tag}` and ABA returns.
- Make the tag as wide as possible (32 bits in an index+tag word, or a 64-bit counter with DWCAS). Practice task Q6 demonstrates an 8-bit wrap.

#### Edge Case 6: Epoch-based reclamation and a stalled thread
- People assume: "EBR is lock-free, so memory use is bounded."
- What happens: reclamation waits until every active thread has left the old epoch. One thread preempted (or blocked in I/O) inside a read-side section freezes the epoch; retired nodes accumulate without bound.
- Operations stay lock-free, but **memory** is not bounded. Hazard pointers bound unreclaimed nodes to roughly (threads x hazards) plus the scan threshold, at the cost of a fence per protected access.

#### Edge Case 7: Hazard pointer published without re-validation
- People assume: "I stored `old` in my hazard slot, so it is protected."
- What happens: between `old = head.load()` and `hazard.store(old)`, another thread can pop and free `old`; the reclaimer scanned the hazard slots before your store became visible. Protection only counts if, **after** publishing, you re-read `head` and it still equals `old` (so `old` was reachable at a moment when your hazard was already visible).
- The publish and the re-read must not be reordered: use `seq_cst` (or an explicit full fence); see topic 06.

#### Edge Case 8: A size() on a lock-free container is only a snapshot
- People assume: `if (stack.size() > 0) stack.pop()` is safe, or that an atomic `size_` counter is exact.
- What happens: the size and the head are separate words; between reading one and acting on the other, other threads change both. A separately maintained atomic count can even be temporarily inconsistent with the list.
- Lock-free APIs therefore return status from the operation itself: `std::optional<T> try_pop()`, `bool try_push()`.

### CODE_EXAMPLES: Practical Demonstrations

#### Example 1: Treiber stack with deferred reclamation
- A correct lock-free stack for the simple case where popped nodes are only freed when the stack is destroyed (so no ABA and no use-after-free during its life).
```cpp
#include <atomic>
#include <iostream>
#include <optional>
#include <thread>
#include <vector>

class TreiberStack {
    struct Node { int value; Node* next; Node* dead_next = nullptr; };
    std::atomic<Node*> head_{nullptr};
    std::atomic<Node*> graveyard_{nullptr};      // popped nodes, freed in the destructor

    void bury(Node* n) {                         // separate link: never rewrite n->next, a slow
        n->dead_next = graveyard_.load();        // reader may still be reading it
        while (!graveyard_.compare_exchange_weak(n->dead_next, n)) {}
    }
public:
    static_assert(std::atomic<Node*>::is_always_lock_free);

    void push(int v) {
        Node* n = new Node{v, head_.load()};
        while (!head_.compare_exchange_weak(n->next, n)) {
            // n->next was refreshed with the current head; retry
        }
    }
    std::optional<int> pop() {
        Node* old = head_.load();
        while (old && !head_.compare_exchange_weak(old, old->next)) {
            // old refreshed; old->next is safe to read because nodes are never freed early
        }
        if (!old) return std::nullopt;
        int v = old->value;
        bury(old);                               // NOT delete: another thread may still read old->next
        return v;
    }
    ~TreiberStack() {
        for (Node* l = head_.load(); l;) { Node* n = l->next; delete l; l = n; }
        for (Node* l = graveyard_.load(); l;) { Node* n = l->dead_next; delete l; l = n; }
    }
};

int main() {
    TreiberStack s;
    constexpr int kThreads = 4, kPer = 100000;
    std::atomic<long long> popped_sum{0};
    std::vector<std::thread> ts;
    for (int t = 0; t < kThreads; ++t) {
        ts.emplace_back([&, t] {
            for (int i = 0; i < kPer; ++i) {
                s.push(t * kPer + i);
                if (auto v = s.pop()) popped_sum.fetch_add(*v);
            }
        });
    }
    for (auto& t : ts) t.join();
    while (auto v = s.pop()) popped_sum.fetch_add(*v);
    long long n = 1LL * kThreads * kPer;
    std::cout << (popped_sum.load() == n * (n - 1) / 2 ? "all values popped exactly once" : "BROKEN") << '\n';
}
```
- Output: `all values popped exactly once`.
- Push dereferences only its own node. Pop dereferences `old`, which is safe here only because no node is freed or reused until destruction (no address reuse means no ABA).
- `bury` uses a separate `dead_next` link on purpose: a slow thread may still be reading `old->next` of a node that was just popped, and overwriting that field would be a data race.
- Real structures cannot keep every node forever: that is what reclamation schemes solve.

#### Example 2: ABA replayed step by step
- A deterministic single-threaded replay of the classic interleaving, using the same push/pop as a naive Treiber stack.
```cpp
#include <atomic>
#include <iostream>

struct Node { char name; Node* next; bool alive; };
std::atomic<Node*> head{nullptr};

void push(Node* n) {
    n->next = head.load();
    while (!head.compare_exchange_weak(n->next, n)) {}
}
Node* pop() {
    Node* old = head.load();
    while (old && !head.compare_exchange_weak(old, old->next)) {}
    return old;
}
void print(const char* label) {
    std::cout << label;
    for (Node* p = head.load(); p; p = p->next) std::cout << ' ' << p->name << (p->alive ? "" : "(freed)");
    std::cout << '\n';
}

int main() {
    Node a{'A', nullptr, true}, b{'B', nullptr, true}, c{'C', nullptr, true};
    push(&c); push(&b); push(&a);
    print("start:   ");

    // T1 starts pop: reads head and head->next, then is preempted
    Node* t1_old = head.load();          // A
    Node* t1_next = t1_old->next;        // B

    // T2 runs to completion
    Node* x = pop();                     // A
    Node* y = pop();                     // B
    y->alive = false;                    // T2 frees B
    push(x);                             // A is reused: head -> A -> C
    print("after T2:");

    // T1 resumes
    bool ok = head.compare_exchange_strong(t1_old, t1_next);
    std::cout << "T1 CAS " << (ok ? "succeeded" : "failed") << '\n';
    print("final:   ");
}
```
- Output:
```text
start:    A B C
after T2: A C
T1 CAS succeeded
final:    B(freed) C
```
- The CAS saw `head == A` and succeeded, but installed `B`, a node that T2 already removed and freed. In a real program the `final` walk is a use-after-free.

#### Example 3: Tagged index stack (ABA-safe, 64-bit lock-free CAS)
- Nodes live in a preallocated pool (type-stable memory); `head` packs a 32-bit node index and a 32-bit version tag into one `uint64_t`, so a plain 8-byte CAS is enough.
```cpp
#include <atomic>
#include <cstdint>
#include <iostream>
#include <thread>
#include <vector>

constexpr std::uint32_t kNil = 0xFFFFFFFFu;

struct Node {
    int value = 0;
    std::atomic<std::uint32_t> next{kNil};       // atomic: a stale reader may race with the new owner
};

class TaggedStack {
    std::vector<Node>& pool_;
    std::atomic<std::uint64_t> head_;
    static std::uint64_t pack(std::uint32_t idx, std::uint32_t tag) { return (std::uint64_t(tag) << 32) | idx; }
    static std::uint32_t idx(std::uint64_t h) { return std::uint32_t(h); }
    static std::uint32_t tag(std::uint64_t h) { return std::uint32_t(h >> 32); }
public:
    static_assert(std::atomic<std::uint64_t>::is_always_lock_free);
    explicit TaggedStack(std::vector<Node>& pool) : pool_(pool), head_(pack(kNil, 0)) {}

    void push(std::uint32_t i) {
        std::uint64_t old = head_.load();
        do {
            pool_[i].next.store(idx(old), std::memory_order_relaxed);
        } while (!head_.compare_exchange_weak(old, pack(i, tag(old) + 1)));
    }
    std::uint32_t pop() {
        std::uint64_t old = head_.load();
        for (;;) {
            std::uint32_t i = idx(old);
            if (i == kNil) return kNil;
            std::uint32_t nxt = pool_[i].next.load(std::memory_order_relaxed);   // may be stale
            if (head_.compare_exchange_weak(old, pack(nxt, tag(old) + 1))) return i;
            // any intervening push/pop changed the tag, so a stale nxt never gets installed
        }
    }
    std::uint64_t raw_head() const { return head_.load(); }
    bool cas_raw(std::uint64_t expected, std::uint64_t desired) { return head_.compare_exchange_strong(expected, desired); }
};

int main() {
    // Part 1: replay the ABA interleaving from Example 2
    std::vector<Node> pool(3);
    TaggedStack s(pool);
    s.push(2); s.push(1); s.push(0);                       // head -> 0 -> 1 -> 2  (A=0, B=1, C=2)
    std::uint64_t t1_old = s.raw_head();
    std::uint32_t t1_next = pool[0].next.load();           // 1
    std::uint32_t a = s.pop(); s.pop(); s.push(a);         // T2: pop A, pop B, push A
    bool ok = s.cas_raw(t1_old, (std::uint64_t(std::uint32_t(t1_old >> 32) + 1) << 32) | t1_next);
    std::cout << "stale CAS " << (ok ? "succeeded (ABA!)" : "failed (tag changed)") << '\n';

    // Part 2: stress test, 4 threads pop and push 1000 shared nodes
    std::vector<Node> big(1000);
    TaggedStack st(big);
    for (std::uint32_t i = 0; i < 1000; ++i) st.push(i);
    std::vector<std::thread> ts;
    for (int t = 0; t < 4; ++t)
        ts.emplace_back([&] {
            for (int k = 0; k < 500000; ++k) {
                std::uint32_t i = st.pop();
                if (i != kNil) st.push(i);
            }
        });
    for (auto& t : ts) t.join();
    std::vector<bool> seen(1000, false);
    int count = 0;
    for (std::uint32_t i = st.pop(); i != kNil; i = st.pop()) { if (!seen[i]) ++count; seen[i] = true; }
    std::cout << "nodes recovered: " << count << " of 1000\n";
}
```
- Output:
```text
stale CAS failed (tag changed)
nodes recovered: 1000 of 1000
```
- Pointer identity is now `{index, version}`; A at version 3 no longer matches A at version 6.
- Works without hazard pointers only because pool memory is never freed while the stack exists.

#### Example 4: Hazard pointers (minimal, one slot per thread)
- Pop publishes the node it is about to dereference; retired nodes are freed only when no hazard slot holds them.
```cpp
#include <algorithm>
#include <atomic>
#include <iostream>
#include <optional>
#include <thread>
#include <vector>

constexpr int kMaxThreads = 8;
constexpr std::size_t kScanThreshold = 64;

struct Node { int value; Node* next; };

std::atomic<Node*> head{nullptr};
std::atomic<Node*> hazard[kMaxThreads];            // one hazard slot per thread
std::vector<Node*> retired[kMaxThreads];           // each list touched only by its owner (until join)
std::atomic<long> freed{0};

void push(int v) {
    Node* n = new Node{v, head.load()};
    while (!head.compare_exchange_weak(n->next, n)) {}
}

void scan(int tid) {
    std::vector<Node*> protected_now;
    for (auto& h : hazard) if (Node* p = h.load()) protected_now.push_back(p);
    std::vector<Node*> keep;
    for (Node* n : retired[tid]) {
        if (std::find(protected_now.begin(), protected_now.end(), n) != protected_now.end()) keep.push_back(n);
        else { delete n; freed.fetch_add(1); }
    }
    retired[tid].swap(keep);
}

std::optional<int> pop(int tid) {
    Node* old = head.load();
    for (;;) {
        if (!old) { hazard[tid].store(nullptr); return std::nullopt; }
        hazard[tid].store(old);                    // 1. announce
        Node* again = head.load();                 // 2. re-validate (seq_cst: not reordered before 1)
        if (again != old) { old = again; continue; }
        Node* next = old->next;                    // 3. safe: old cannot be freed while announced
        if (head.compare_exchange_strong(old, next)) break;
    }
    hazard[tid].store(nullptr);
    int v = old->value;
    retired[tid].push_back(old);                   // retire, do not delete
    if (retired[tid].size() >= kScanThreshold) scan(tid);
    return v;
}

int main() {
    constexpr int kThreads = 4, kOps = 200000;
    std::atomic<long> pops{0};
    std::vector<std::thread> ts;
    for (int t = 0; t < kThreads; ++t)
        ts.emplace_back([&, t] {
            for (int i = 0; i < kOps; ++i) {
                push(i);
                if (pop(t)) pops.fetch_add(1);
            }
        });
    for (auto& t : ts) t.join();
    while (pop(0)) pops.fetch_add(1);
    long leftover = 0;
    for (auto& r : retired) { leftover += long(r.size()); for (Node* n : r) delete n; r.clear(); }
    std::cout << "pops=" << pops << " freed during run + at exit = " << freed + leftover << '\n';
}
```
- Output: `pops=800000 freed during run + at exit = 800000`.
- Steps 1 and 2 are the whole trick: once `old` is announced **and** still the head, any thread that later retires it will see the announcement during `scan` and keep it.
- Hazard pointers also remove ABA here: a protected node cannot be freed and reallocated, so `head == old` really means the same node.
- Cost: a `seq_cst` store (a full barrier on x86) per protected access, plus scanning all slots.

#### Example 5: SPSC ring buffer, wait-free and reclamation-free
- One producer, one consumer, fixed capacity: each index has a single writer, so no CAS, no ABA, no reclamation. Both operations finish in a bounded number of steps.
```cpp
#include <array>
#include <atomic>
#include <cstddef>
#include <iostream>
#include <thread>

template <class T, std::size_t N>
class SpscRing {
    static_assert((N & (N - 1)) == 0, "N must be a power of two");
    std::array<T, N> buf_{};
    alignas(64) std::atomic<std::size_t> head_{0};   // written only by consumer
    alignas(64) std::atomic<std::size_t> tail_{0};   // written only by producer
public:
    bool try_push(const T& v) {                      // wait-free: no loop
        std::size_t t = tail_.load(std::memory_order_relaxed);
        if (t - head_.load(std::memory_order_acquire) == N) return false;   // full
        buf_[t & (N - 1)] = v;
        tail_.store(t + 1, std::memory_order_release);                      // publish
        return true;
    }
    bool try_pop(T& out) {                           // wait-free: no loop
        std::size_t h = head_.load(std::memory_order_relaxed);
        if (tail_.load(std::memory_order_acquire) == h) return false;       // empty
        out = buf_[h & (N - 1)];
        head_.store(h + 1, std::memory_order_release);                      // free the slot
        return true;
    }
};

int main() {
    SpscRing<long, 1024> q;
    constexpr long kCount = 1'000'000;
    std::thread producer([&] { for (long i = 1; i <= kCount; ++i) while (!q.try_push(i)) {} });
    long sum = 0, v = 0, got = 0;
    while (got < kCount) if (q.try_pop(v)) { sum += v; ++got; }
    producer.join();
    std::cout << (sum == kCount * (kCount + 1) / 2 ? "sum ok" : "BROKEN") << '\n';
}
```
- Output: `sum ok`.
- `try_push`/`try_pop` are wait-free; the caller's `while (!try_push)` retry when full is a policy outside the data structure.
- The acquire/release pairs publish the slot contents (topic 06).

#### Example 6: Lock-free is not automatically faster
- Same push/pop workload on a mutex-protected stack and a Treiber stack. Nodes are preallocated (the allocator is not measured) and each node is pushed exactly once, so no address can come back: no ABA, no reclamation needed.
```cpp
#include <atomic>
#include <chrono>
#include <iostream>
#include <mutex>
#include <thread>
#include <vector>

struct Node { Node* next; };

struct MutexStack {
    std::mutex m; Node* head = nullptr;
    void push(Node* n) { std::lock_guard g(m); n->next = head; head = n; }
    Node* pop() { std::lock_guard g(m); Node* n = head; if (n) head = n->next; return n; }
};

struct LockFreeStack {
    std::atomic<Node*> head{nullptr};
    void push(Node* n) { n->next = head.load(); while (!head.compare_exchange_weak(n->next, n)) {} }
    Node* pop() { Node* o = head.load(); while (o && !head.compare_exchange_weak(o, o->next)) {} return o; }
};

template <class S>
double run(int threads) {
    constexpr int kOps = 500000;
    S s;
    std::vector<std::vector<Node>> nodes(threads, std::vector<Node>(kOps));
    auto t0 = std::chrono::steady_clock::now();
    std::vector<std::thread> ts;
    for (int t = 0; t < threads; ++t)
        ts.emplace_back([&, t] {
            for (int i = 0; i < kOps; ++i) { s.push(&nodes[t][i]); s.pop(); }   // nodes never reused
        });
    for (auto& t : ts) t.join();
    return std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - t0).count();
}

int main() {
    for (int threads : {1, 4}) {
        std::cout << threads << " thread(s): mutex " << run<MutexStack>(threads)
                  << " ms, lock-free " << run<LockFreeStack>(threads) << " ms\n";
    }
}
```
- Output is machine-dependent. Four runs on a 20-core x86 machine gave about 15 ms (mutex) vs 11 ms (lock-free) with 1 thread, and 310 to 380 ms (mutex) vs 230 to 315 ms (lock-free) with 4 threads: for the same work per thread, both versions got **about 20x slower** with 4 threads, because every operation fights for the one cache line holding `head`. The lock-free version is somewhat faster here, not dramatically, and the ratio changes with core count, CPU and oversubscription.
- With more threads than cores, the mutex version also suffers when a lock holder is preempted; that is where lock-free gains most (progress, tail latency), not in the uncontended case.
- Conclusion: pick lock-free for progress guarantees (no blocking on a preempted holder, no priority inversion), not on the assumption of raw throughput, and measure. Removing the shared hot spot (per-thread structures, SPSC queues) beats both.

### QUICK_REFERENCE: Cheat Sheet

#### Progress guarantees
| Class | One line | Starvation? |
|---|---|---|
| Blocking | a delayed lock holder can stop everyone | yes |
| Obstruction-free | finishes if it runs alone long enough | yes, livelock possible |
| Lock-free | someone always finishes | yes, per thread |
| Wait-free | everyone finishes in bounded own steps | no |

#### Three layers of a lock-free structure
| Problem | Symptom | Fix |
|---|---|---|
| Lost update | overwritten change | CAS loop |
| ABA | CAS succeeds on recycled value, installs stale `next` | version tag, safe reclamation, LL/SC |
| Reclamation | use-after-free reading `old->next` | hazard pointers, EBR, RCU, refcount, never-free pool |

#### Reclamation schemes
| Scheme | Read cost | Garbage bound | Stalled thread effect |
|---|---|---|---|
| Hazard pointers | store + full fence per pointer | bounded | blocks only nodes it protects |
| Epoch-based | very low | unbounded | blocks all reclamation |
| RCU | near zero | unbounded until grace period | delays grace period |
| `atomic<shared_ptr>` | atomic refcount, usually internal lock | exact | not lock-free in practice |

#### Interview one-liners
| Question | One-liner |
|---|---|
| Lock-free vs wait-free? | Lock-free: somebody always progresses. Wait-free: everybody progresses in bounded steps. |
| Is a CAS loop wait-free? | No, lock-free; one thread can retry forever. |
| Is a spinlock lock-free? | No, it is blocking: a preempted holder stops everyone. |
| What is ABA? | A value changes A to B to A, so CAS succeeds although the state it depended on changed. |
| How to fix ABA? | Version/tag counter in the CAS word, or never free/reuse a node while any thread may hold it. |
| Do tags fix use-after-free? | No; only type-stable memory or a reclamation scheme does. |
| Does a null check help? | No; dangling pointers are non-null. |
| Hazard pointers in one line? | Announce the pointer, re-validate, and reclaimers skip announced nodes. |
| EBR in one line? | Free a retired node once every thread has left the epoch it was retired in. |
| Is lock-free faster? | Not necessarily; same hot cache line, retries, reclamation cost; benefit is progress and tail latency. |
| Lowest-risk low-latency alternative? | SPSC ring buffers per producer/consumer pair: wait-free, preallocated, no ABA, no reclamation. |
