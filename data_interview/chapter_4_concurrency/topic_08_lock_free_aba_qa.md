## TOPIC: Lock-Free Programming and the ABA Problem

### INTERVIEW_QA: Interview Questions with Detailed Answers

#### Q1: What is the difference between blocking, obstruction-free, lock-free and wait-free algorithms?
**Difficulty:** #beginner
**Category:** #concurrency #lock_free
**Concepts:** #progress_guarantee #wait_free #obstruction_free

**Answer:**
Blocking: a delayed thread holding a lock can stop everyone. Obstruction-free: a thread finishes if it runs alone long enough. Lock-free: some thread always finishes in finite steps (system-wide progress). Wait-free: every thread finishes in a bounded number of its own steps.

**Explanation:**
- Scenario test (how interviewers phrase it):
  - "Threads may starve, but at least one competing thread always completes": **lock-free**.
  - "Every thread completes within a bounded number of its own steps": **wait-free**.
  - "A thread completes if it eventually executes without interference": **obstruction-free**.
- Hierarchy: wait-free > lock-free > obstruction-free > blocking.
- Useful test: freeze any one thread forever at the worst instruction. Blocking algorithms can stall; lock-free ones keep completing operations.
- ❌ Common wrong answer: "Lock-free means no thread is locked / there is no mutex." The definition is about guaranteed progress, not the absence of a mutex type.
- ✅ What a strong answer adds: these are guarantees, not speeds; wait-free often costs more on average (helping schemes, extra metadata). Obstruction-free algorithms can livelock under contention and need back-off or contention managers.

**Key takeaway:** Lock-free: somebody progresses. Wait-free: everybody progresses within a bound.

---

#### Q2: My code uses only std::atomic and no mutex. Is it lock-free?
**Difficulty:** #intermediate
**Category:** #concurrency #lock_free
**Concepts:** #spinlock #is_lock_free #progress_guarantee

**Answer:**
Not necessarily. If a thread can wait on a condition another thread must clear (a spinlock built from atomic_flag, a "busy" flag), it is blocking. It also needs every atomic it uses to be lock-free and every call on the path (such as the allocator) to be non-blocking.

**Explanation:**
- `while (flag.test_and_set()) {}` is a lock: if the holder is preempted, all other threads spin without progress. That is blocking.
- `std::atomic<T>` with a large `T` uses an internal lock (check `is_always_lock_free`); a 16-byte tagged pointer is reported not lock-free by GCC.
- `new` / `malloc` in a push can take allocator locks.
- ❌ Common wrong answer: "No `std::mutex`, therefore lock-free." Locks can be hand-rolled from atomics, and hidden in library calls.
- ✅ What a strong answer adds: lock-freedom is a property of the whole operation path; the typical proof is "every failed CAS implies another thread's CAS succeeded, and no step waits on another thread's state".

**Key takeaway:** Lock-free is about who can stall whom, not which headers you include.

---

#### Q3: One thread keeps losing every CAS race. Is the algorithm still lock-free? What would wait-free guarantee?
**Difficulty:** #intermediate
**Category:** #concurrency #lock_free
**Concepts:** #cas_loop #starvation #wait_free

- Eight threads run a CAS retry loop on one atomic.

**Answer:**
Yes, it is lock-free: each failed CAS means another thread's CAS succeeded, so the system keeps completing operations even if one thread starves. Wait-free would guarantee that this unlucky thread itself completes within a bounded number of its own steps.

**Explanation:**
```cpp
#include <atomic>
std::atomic<int> value{0};
int calculate(int v) { return v * 2 + 1; }
void update() {
    int old = value.load(), desired;
    do { desired = calculate(old); }
    while (!value.compare_exchange_weak(old, desired));   // unbounded retries
}
int main() { update(); return value.load() == 1 ? 0 : 1; }
```
- Unbounded retry loop: compatible with lock-free, incompatible with wait-free.
- Making it wait-free requires a different algorithm (e.g. a single wait-free RMW like `fetch_add` where hardware provides it, or helping/announcement schemes).
- ❌ Common wrong answer: "CAS makes it wait-free because nothing blocks." Not blocking is not the same as bounded steps.
- ✅ What a strong answer adds: in practice starvation under a CAS loop is rare but tail latency grows with contention; exponential back-off reduces wasted CAS traffic.

**Key takeaway:** A CAS loop is the textbook lock-free, not wait-free, pattern.

---

#### Q4: Give the simplest example of a wait-free operation. Is std::atomic<int>::fetch_add always wait-free?
**Difficulty:** #intermediate
**Category:** #concurrency #lock_free
**Concepts:** #wait_free #fetch_add #ll_sc

**Answer:**
fetch_add on x86-64 is one lock xadd instruction with no retry loop, so each thread finishes in bounded steps; an SPSC ring buffer's try_push/try_pop are also wait-free. But C++ never promises wait-freedom: on LL/SC CPUs without LSE, fetch_add is itself a retry loop.

**Explanation:**
- x86-64 GCC: `fetch_add` becomes `lock xadd`; hardware arbitration lets each core's locked op complete.
- ARMv8.0 without LSE: `ldxr` / `add` / `stxr` / retry, i.e. lock-free but not wait-free in principle. ARMv8.1 LSE has `ldadd`.
- Even on x86, `fetch_or` whose result is used compiles to a `lock cmpxchg` loop.
- Thread-private work (`thread_local int c; ++c;`) is trivially wait-free.
- SPSC queue `try_push`: one load, one check, one write, one store; no loop, bounded steps (it may return "full").
- ❌ Common wrong answer: "`std::atomic::fetch_add` is always wait-free." The standard does not even promise it is lock-free (`is_lock_free`).
- ✅ What a strong answer adds: "wait-free" in a design discussion must name the platform and the instruction sequence, not just the C++ function.

**Key takeaway:** Wait-free means no unbounded retry anywhere on the path, which depends on the target CPU.

---

#### Q5: Walk me through push and pop of a lock-free (Treiber) stack.
**Difficulty:** #intermediate
**Category:** #concurrency #lock_free
**Concepts:** #treiber_stack #compare_and_swap #linearization_point

**Answer:**
Push: set new->next = head, then CAS head from new->next to new; on failure the CAS refreshes new->next, retry. Pop: load old = head; if null, empty; CAS head from old to old->next; retry on failure. The successful CAS is the linearization point.

**Explanation:**
```cpp
#include <atomic>
struct Node { int value; Node* next; };
std::atomic<Node*> head{nullptr};

void push(Node* n) {
    n->next = head.load();
    while (!head.compare_exchange_weak(n->next, n)) {}   // n->next refreshed on failure
}
Node* pop() {                                            // naive: ABA and reclamation issues
    Node* old = head.load();
    while (old && !head.compare_exchange_weak(old, old->next)) {}
    return old;
}
int main() { Node a{1, nullptr}; push(&a); return pop() == &a ? 0 : 1; }
```
- Push is safe: it only dereferences its own node.
- Pop dereferences `old`, which another thread may concurrently pop, free, or push back: that is where ABA and use-after-free live.
- Common push bug: storing `old = head.load(); n->next = old;` outside the loop and CASing on `old`; after a failure `old` is refreshed but `n->next` is not, so nodes pushed in between are lost.
- ❌ Common wrong answer: "Pop is just push in reverse, equally safe." Pop is the hard half.
- ✅ What a strong answer adds: the structure is lock-free (any failed CAS means another thread succeeded); `head` is a single hot cache line, so it does not scale under write contention.

**Key takeaway:** Treiber push is easy; pop needs ABA protection and safe reclamation.

---

#### Q6: What is the ABA problem? Walk through a concrete interleaving.
**Difficulty:** #intermediate
**Category:** #concurrency #lock_free
**Concepts:** #aba_problem #compare_and_swap #treiber_stack

**Answer:**
CAS checks only that a value equals what you read, not that it never changed. If it goes A to B and back to A, CAS succeeds although the state your update depended on is gone. In a stack pop, T1 reads head A and next B, sleeps; others pop A, pop B, push A; T1's CAS installs stale B.

**Explanation:**
```text
stack: head -> A -> B -> C
T1: old = A, next = B         (preempted)
T2: pop A, pop B (free B), push A     -> head -> A -> C
T1: CAS(head, A, B) succeeds          -> head -> B (freed), A is lost
```
- The name: the value went A, then B, then A again.
- The bug is not the CAS itself; it is the **cached `next`**, computed from a state that no longer exists.
- Where the recycled A comes from: the same node pushed back (pools/free lists) or `malloc` returning the freed address for a new node.
- ❌ Common wrong answer: "CAS guarantees nothing changed since I read it." It guarantees only equality at the moment of the CAS.
- ✅ What a strong answer adds: ABA matters when the CAS value **stands for** more state (a pointer with a `next` behind it). For a plain counter, A to B to A is harmless.

**Key takeaway:** CAS compares values, not histories; pointers recycle.

---

#### Q7: How do you fix ABA? Would adding a timestamp work?
**Difficulty:** #intermediate
**Category:** #concurrency #lock_free
**Concepts:** #tagged_pointer #version_counter #dwcas

**Answer:**
Make the CAS word include a version counter that every successful update increments (a tagged pointer), so {A, v5} no longer equals {A, v7}. Alternatively ensure a node cannot be freed or reused while any thread holds it (hazard pointers, epochs, RCU). A monotonic counter, not a timer, is the standard tool.

**Explanation:**
- Representations:
  - Double-width CAS on `{pointer, 64-bit counter}` (x86-64 `cmpxchg16b`). With GCC this goes through `libatomic`, reports `is_lock_free() == false` and needs `-latomic`.
  - Pack a tag into unused pointer bits (x86-64 user space uses 48 bits; 16 bits free), but a 16-bit tag can wrap.
  - Use a preallocated node array: 32-bit index + 32-bit tag in one `uint64_t` (portable, lock-free 8-byte CAS).
- Timestamps: two updates can share a timestamp, clocks are not monotonic across cores without extra cost, and they still need to be inside the CAS word; a counter is strictly simpler and exact.
- LL/SC hardware detects any intervening write, but C++ exposes only value-based `compare_exchange`.
- ❌ Common wrong answer: "Add a timer or time frame to detect changes." It is the right instinct (extra identity in the CAS) with the wrong mechanism.
- ✅ What a strong answer adds: tags fix ABA but not use-after-free; pair them with type-stable memory (a pool never returned to the OS) or a reclamation scheme.

**Key takeaway:** CAS on {pointer, version}; widen the tag enough that it cannot wrap during one preemption.

---

#### Q8: Are the ABA problem and the memory reclamation problem the same thing?
**Difficulty:** #advanced
**Category:** #concurrency #lock_free
**Concepts:** #aba_problem #memory_reclamation #use_after_free

**Answer:**
No. ABA is a stale CAS succeeding because a value returned to an old bit pattern; it can happen with no delete at all (pooled nodes). Reclamation is about freeing a node while another thread may still dereference it (use-after-free). Tags fix ABA only; safe reclamation fixes lifetime and, as a side effect, ABA.

**Explanation:**
- ABA without freeing: a node pool recycles node A; no memory is ever released, yet the stale CAS corrupts the list.
- Use-after-free without ABA: T1 loads `old`, T2 pops and deletes it, T1 reads `old->next`; even if T1's CAS would fail, the read already touched freed memory.
- Tags + freed memory: the stale `old->next` read can still segfault if the page went back to the OS. Tags are only safe with type-stable memory.
- Hazard pointers/EBR prevent a node from being reused while referenced, so the address cannot come back: no ABA either.
- ❌ Common wrong answer: "ABA is just use-after-free with a fancy name." They overlap in practice but have different fixes.
- ✅ What a strong answer adds: in C++ (no garbage collector) reclamation is the harder and more fundamental problem; in Java the GC already prevents reuse while referenced, so ABA on object references is largely a non-issue there.

**Key takeaway:** Version tags answer "did it change?"; reclamation answers "may I free it?".

---

#### Q9: A thread holds a pointer to a node that another thread popped and deleted. Can it protect itself with a null check?
**Difficulty:** #beginner
**Category:** #concurrency #lock_free
**Concepts:** #dangling_pointer #use_after_free #memory_reclamation

**Answer:**
No. delete destroys the object but does not change other copies of the pointer, so the stale pointer is still non-null and dereferencing it is use-after-free (UB). The fix is a reclamation protocol that delays the delete until no thread can hold the pointer.

**Explanation:**
```cpp
#include <cstdio>
struct Node { int value; Node* next; };
int main() {
    Node* shared = new Node{1, nullptr};
    Node* mine = shared;          // T1's copy
    delete shared;                // T2 frees it
    shared = nullptr;             // only T2's variable changes
    std::printf("%d\n", mine != nullptr);   // prints 1: the check passes, mine dangles
}
```
- Null answers "does this pointer hold an address?"; lifetime answers "is there a live object there that I may access?". A dangling pointer fails the second while passing the first.
- Retire-then-reclaim protocol: remove from structure, retire (put on a list), free only when no thread may hold it (hazard scan, epoch advance, grace period).
- ❌ Common wrong answer: "Check `p != nullptr` before `p->next`."
- ✅ What a strong answer adds: the coordination is done with atomic announcements, not a mutex, otherwise reclamation reintroduces blocking.

**Key takeaway:** A non-null pointer can be dangling; only a reclamation scheme makes the dereference safe.

---

#### Q10: How do hazard pointers work?
**Difficulty:** #advanced
**Category:** #concurrency #lock_free
**Concepts:** #hazard_pointers #memory_reclamation #retire_list

**Answer:**
Before dereferencing a shared node, a thread stores its address in a per-thread hazard slot, then re-reads the source to confirm the node is still reachable. Removed nodes are retired to a list; a reclaimer periodically scans all hazard slots and frees only retired nodes no slot mentions.

**Explanation:**
- Reader protocol:
  1. `p = head.load()`
  2. `hazard[me].store(p)` (announce)
  3. if `head.load() != p`, retry (re-validate: p may already have been retired before the announcement was visible)
  4. use `p` safely, then clear the slot.
- Reclaimer: `retire(n)` appends to a local list; when it exceeds a threshold, snapshot all hazard slots and `delete` every retired node not in the snapshot.
- Ordering: the announce store and the re-validating load must not be reordered (store-load), so they need `seq_cst` or a full fence; on x86 that store is an `xchg`/`mfence`.
- Properties: unreclaimed memory bounded by about (threads x slots + threshold); a stalled thread only pins the few nodes it announced.
- C++26 standardizes `std::hazard_pointer` (`<hazard_pointer>`); folly has the reference implementation.
- ❌ Common wrong answer: "Publish the pointer in the hazard slot and you are protected." Without re-validation the node may already be retired and freed.
- ✅ What a strong answer adds: hazard pointers also eliminate ABA for the protected node (it cannot be recycled while announced), and the per-access fence is their main cost compared with epoch schemes.

**Key takeaway:** Announce, re-validate, use; reclaimers skip announced nodes.

---

#### Q11: How does epoch-based reclamation (or RCU) differ from hazard pointers?
**Difficulty:** #advanced
**Category:** #concurrency #lock_free
**Concepts:** #epoch_based_reclamation #rcu #grace_period

**Answer:**
Instead of protecting each pointer, a thread announces it is inside an operation in the current epoch. Retired nodes are freed only after every thread has moved past the epoch they were retired in. Reads are cheaper (no per-pointer fence), but one stalled reader blocks all reclamation, so garbage is unbounded.

**Explanation:**
- EBR sketch: global epoch `E`; on entry a thread records `local = E` and marks itself active; nodes retired in epoch `e` are freed once all active threads have observed an epoch later than `e` (commonly `e + 2`).
- RCU: readers enter cheap read-side critical sections; a writer copies, modifies, publishes the new version with one pointer store, then waits for a grace period (all pre-existing readers finished) before freeing the old version. Used heavily in the Linux kernel; C++26 adds `<rcu>`.
- Comparison:

| | Hazard pointers | EBR / RCU |
|---|---|---|
| Read-side cost | store + full fence per pointer | near zero per pointer |
| Memory bound | bounded | unbounded if a reader stalls |
| Best for | general structures, bounded memory | read-mostly data, short reads |

- ❌ Common wrong answer: "Epoch reclamation is lock-free, so it cannot be held up by a slow thread." Operations stay non-blocking, but **reclamation** waits for the slowest reader.
- ✅ What a strong answer adds: trading-system config/reference data (read on every message, updated rarely) is a classic RCU fit; per-message queues usually avoid dynamic nodes entirely.

**Key takeaway:** Hazard pointers bound memory per pointer; epochs/RCU make reads almost free but let a stalled reader pin garbage.

---

#### Q12: Why not just use std::shared_ptr (or std::atomic<std::shared_ptr>) for nodes in a lock-free stack?
**Difficulty:** #advanced
**Category:** #concurrency #lock_free
**Concepts:** #atomic_shared_ptr #reference_counting #memory_reclamation

**Answer:**
It does solve lifetime (a node is not destroyed while someone holds a reference, so no use-after-free or ABA), but every access does atomic refcount updates on shared cache lines, atomic<shared_ptr> is usually implemented with an internal lock (not lock-free), and destroying a long chain can recurse deeply.

**Explanation:**
- `std::atomic<std::shared_ptr<Node>> head;` makes `head.load()` return an owning reference; `old->next` is safe to read.
- Costs:
  - Refcount increment and decrement per load: contended RMW on the control block.
  - libstdc++ and MSVC implement `atomic<shared_ptr>` with a lock bit or spin lock: `is_lock_free()` is false, so the "lock-free" stack is not lock-free.
  - Releasing the last reference to a long list destroys nodes recursively (`next` destructor chain), which can overflow the stack.
- Fine for low-rate, correctness-first code; rarely used on hot paths.
- ❌ Common wrong answer: "`shared_ptr` is thread-safe, so the problem disappears for free." Only the count is thread-safe, and it is not free.
- ✅ What a strong answer adds: designing lock-free reference counting correctly (split counts, differential counting) is itself an advanced problem; production code uses hazard pointers or epochs instead.

**Key takeaway:** Reference counting fixes lifetime at the cost of refcount contention and, in practice, lock-freedom.

---

#### Q13: Is a lock-free data structure faster than a mutex-protected one?
**Difficulty:** #intermediate
**Category:** #concurrency #performance
**Concepts:** #contention #cache_line_bouncing #tail_latency

**Answer:**
Not necessarily. Both serialize on the same hot cache line, lock-free adds failed-CAS retries and reclamation overhead, and an uncontended mutex is just two atomic RMWs. Lock-free wins on progress (no stalling behind a preempted holder) and often tail latency, not raw throughput.

**Explanation:**
- Measured (4 threads, push/pop on one stack): both versions about 20x slower than single-threaded; lock-free modestly faster, not dramatically.
- Where lock-free loses or ties:
  - high contention on one word (retry storms),
  - per-node allocation (`new` may lock) and reclamation fences,
  - more CASes per operation than a mutex's lock + unlock.
- Where it wins:
  - oversubscription: a mutex holder preempted mid-critical-section stalls everyone,
  - real-time/priority constraints, signal handlers,
  - predictable worst-case progress.
- ❌ Common wrong answer: "Lock-free is always faster because there is no kernel call." Uncontended mutexes do not enter the kernel either.
- ✅ What a strong answer adds: the bigger win is usually removing sharing (sharded data, SPSC queues per pair). Decide by requirements, then measure p50 and p99.

**Key takeaway:** Choose lock-free for its progress guarantee, not on an assumption of speed.

---

#### Q14: Your lock-free push does `new Node(v)` every time. Is the push still lock-free?
**Difficulty:** #intermediate
**Category:** #concurrency #lock_free
**Concepts:** #allocator #progress_guarantee #preallocation

**Answer:**
The CAS algorithm is, but the operation as a whole is only as non-blocking as the allocator. General-purpose malloc can take arena locks and make system calls, so end to end it is not guaranteed lock-free and its latency is unpredictable. Low-latency code preallocates nodes or uses fixed-size pools.

**Explanation:**
- glibc malloc: fast per-thread cache (tcache) path without locks, but arena locks and `mmap`/`brk` on slow paths.
- Page faults on first touch of new memory are another hidden stall.
- Typical fixes:
  - Preallocated node pool with a lock-free free list (which itself needs ABA protection, e.g. tagged indices).
  - Bounded ring buffers (no per-element allocation at all).
- ❌ Common wrong answer: "There is no mutex in push, so it is lock-free."
- ✅ What a strong answer adds: an interviewer is checking whether you look at the entire call path, including allocation, logging and exceptions, when you make a progress or latency claim.

**Key takeaway:** Hidden locks in the allocator break end-to-end lock-freedom.

---

#### Q15: Why are SPSC ring buffers so popular in low-latency systems compared with general lock-free queues?
**Difficulty:** #intermediate
**Category:** #concurrency #design
**Concepts:** #spsc_queue #wait_free #ring_buffer

**Answer:**
With one producer and one consumer each index has exactly one writer, so no CAS is needed: push and pop are a few loads and stores with acquire/release, wait-free and bounded. Slots are preallocated, so there is no allocation, no ABA and no reclamation problem.

**Explanation:**
- Producer owns `tail`, consumer owns `head`; each reads the other's index with acquire and publishes its own with release (topic 06).
- Power-of-two capacity and masking for cheap wraparound; `alignas(64)` on the two indices to avoid false sharing.
- Multi-producer/multi-consumer queues need CAS to reserve slots, and **reservation is not publication**: a producer can reserve slot 10, stall, while slot 11 is already published; per-slot sequence numbers solve that.
- ❌ Common wrong answer: "Any lock-free queue is equally good." MPMC designs carry CAS contention, per-slot state and much more complexity.
- ✅ What a strong answer adds: structure the system as a pipeline of SPSC links (one queue per producer/consumer pair) to keep every hop wait-free.

**Key takeaway:** Avoid the hard problems (CAS, ABA, reclamation) by giving each index a single writer.

---

#### Q16: Why does LL/SC hardware avoid ABA, and why doesn't C++ simply use it?
**Difficulty:** #advanced
**Category:** #concurrency #hardware
**Concepts:** #ll_sc #aba_problem #compare_exchange_weak

**Answer:**
Store-conditional fails if the location was written at all since the load-linked, even if the value returned to A: it detects writes, not values. But reservations are fragile and x86 lacks LL/SC, so C++ exposes only value-based compare_exchange.

**Explanation:**
- ARM (`ldxr`/`stxr`), POWER (`lwarx`/`stwcx.`), RISC-V (`lr`/`sc`) provide LL/SC; x86 has only value-based `cmpxchg`.
- In theory an LL/SC pop (`LL head; read next; SC head = next`) is ABA-immune. In practice the `next` load between LL and SC may break the reservation, and architectures restrict what can happen inside the window.
- `compare_exchange_weak`'s permission to fail spuriously exists to allow this mapping efficiently.
- C++ code must be portable to x86, so it cannot rely on LL/SC semantics: use tags or reclamation.
- ❌ Common wrong answer: "Spurious failure of `weak` protects against ABA." No: `compare_exchange` is value-based on every platform; a value that returned to A still matches.
- ✅ What a strong answer adds: newer ARM (LSE, ARMv8.1) adds value-based `cas` and `ldadd` instructions that compilers use when targeting it (GCC also picks them at runtime via outline atomics), so modern ARM C++ code gets pure value semantics too.

**Key takeaway:** LL/SC detects writes, CAS detects values; C++ gives you values, so you handle ABA yourself.
