## TOPIC: Memory Ordering and the C++ Memory Model

### INTERVIEW_QA: Interview Questions with Detailed Answers

#### Q1: What is the difference between atomicity and memory ordering for a std::atomic operation?
**Difficulty:** #beginner
**Category:** #concurrency #memory_model
**Concepts:** #atomicity #memory_order

**Answer:**
Atomicity means operations on that one atomic object never race, tear or lose updates, whatever order is used. Memory ordering is a separate property: it says what the operation guarantees about other memory, for example whether earlier writes are published to another thread.

**Explanation:**
- `x.store(42, std::memory_order_relaxed)` is fully atomic. Relaxed only removes ordering guarantees for *other* variables.
- Atomicity answers "can two threads touch this variable safely?". Ordering answers "if I see this value, what else am I guaranteed to see?".
- The memory order is not applied to the plain data. It is applied to the atomic operation that acts as the synchronization point, and that point then orders the surrounding plain accesses.
- ❌ Common wrong answer: "atomic means the operation is one indivisible CPU instruction, and the memory order controls how fast it reaches other cores". C++ only promises atomic semantics (an implementation may even use a lock), and memory order is about happens-before, not speed.
- ✅ What a strong answer adds: the layering. C++ defines atomicity, modification order and happens-before; the compiler maps them to instructions (`lock xadd`, `ldar`/`stlr`, fences); the CPU implements them with store buffers and cache coherence. The definition lives in the first layer.

**Key takeaway:** Atomic protects the variable; memory order decides what that variable can publish about other memory.

---

#### Q2: Is this flag handoff with a plain `int` and `bool` correct, and what exactly is wrong?
**Difficulty:** #beginner
**Category:** #concurrency #data_race
**Concepts:** #data_race #happens_before

```cpp
int data = 0;
bool ready = false;

// Thread 1
data = 42;
ready = true;

// Thread 2
while (!ready) {}
print(data);
```

**Answer:**
No. Both `ready` and `data` are written by one thread and read by another with no happens-before relation, so there are data races on both and the behaviour is undefined. Fix: make `ready` a `std::atomic<bool>` with a release store and an acquire load.

**Explanation:**
- Data race definition: conflicting accesses (at least one write) from different threads, at least one non-atomic, neither happens-before the other. Result: undefined behaviour, not just a stale value.
- `ready` itself races. You do not need two variables for a race. In practice the compiler may hoist the load of `ready` out of the loop and spin forever.
- Writing `data` before `ready` in source code creates sequenced-before inside thread 1 only. Nothing links it to thread 2.
- ❌ Common wrong answer: "it might print 0 because the CPU can reorder the stores". The reordering intuition is real, but the standard-level answer is stronger: it is a data race, so any behaviour, including a hang, is allowed.
- ❌ Second common wrong answer: "`ready` is a single bool, so it is fine; only `data` is a problem".
- ✅ What a strong answer adds: the fix only needs `ready` to be atomic. `data` can stay a plain `int` because the release/acquire pair creates the happens-before edge.
```cpp
int data = 0;
std::atomic<bool> ready{false};
// T1
data = 42;
ready.store(true, std::memory_order_release);
// T2
while (!ready.load(std::memory_order_acquire)) {}
std::cout << data;   // guaranteed 42
```

**Key takeaway:** Source order inside one thread proves nothing to another thread; only happens-before does.

---

#### Q3: What does memory_order_relaxed guarantee, and when is it the right choice?
**Difficulty:** #beginner
**Category:** #concurrency #memory_order
**Concepts:** #relaxed #modification_order

**Answer:**
Relaxed guarantees atomicity and per-object coherence (one modification order, no going backward) but no ordering of other memory. It is right when the atomic carries no information about other data: statistics counters, ID generators, a stop flag that publishes nothing.

**Explanation:**
- Guaranteed even with relaxed:
  - no data race on the atomic itself
  - RMW operations (`fetch_add`, `exchange`, CAS) read the latest value in the modification order, so no update is lost
  - a thread never observes an older value after a newer one of the same object
- Not guaranteed: anything about other variables. A relaxed store of `ready = true` does not publish `data`.
- ❌ Common wrong answer: "relaxed is unsafe" or "relaxed causes data races". Relaxed is perfectly safe for what it promises; the race appears only when someone uses a relaxed atomic as a publication signal for non-atomic data.
- ❌ Another wrong answer: "relaxed flushes the store buffer but allows reordering". It adds no barrier of any kind.
- ✅ What a strong answer adds: on x86 relaxed and acquire/release loads/stores compile to the same `mov`, so the saving is mostly freedom for the compiler and, on ARM/POWER, avoiding `ldar`/`stlr`/`dmb`. Contention on a hot shared counter (cache-line ping-pong) costs far more than the memory order; per-thread counters summed later beat any memory-order tweak.

**Key takeaway:** Relaxed means "atomic, but synchronizes nothing", which is exactly what a counter needs.

---

#### Q4: Two threads each do 1000 relaxed `fetch_add(1)` on a shared counter. Is 2000 guaranteed?
**Difficulty:** #beginner
**Category:** #concurrency #atomics
**Concepts:** #fetch_add #thread_join

- After both threads are joined, main prints the counter with a relaxed load.

**Answer:**
Yes. Each `fetch_add` is an atomic read-modify-write that reads the latest value in the counter's modification order, so no increment is lost, and `join()` makes both threads' operations happen-before main's load, which therefore sees 2000.

**Explanation:**
- Two different guarantees are at work:
  - **No lost updates:** atomic RMW, independent of memory order.
  - **Main sees the final value:** thread completion synchronizes-with the return of `join()`.
- Without `join()` (for example reading the counter while workers still run) you would see some intermediate value, still without a data race.
- ❌ Common wrong answer: "yes, because whoever runs `fetch_add` second always sees the value of the first". Correct conclusion, imprecise reason. The precise statement is: all modifications of the object have one total order and every RMW reads the value immediately before it in that order.
- ✅ What a strong answer adds: relaxed is enough here because nothing else is published through the counter. If a thread wrote other data and then incremented the counter as a "done" signal, relaxed would no longer be enough.

**Key takeaway:** RMW atomicity prevents lost updates; `join()`, not the memory order, makes the final read complete.

---

#### Q5: Why may the consumer read a non-atomic `data` once an acquire load of `ready` sees true? Must `data` be atomic?
**Difficulty:** #intermediate
**Category:** #concurrency #memory_model
**Concepts:** #release_acquire #synchronizes_with #happens_before

**Answer:**
`data = 42` is sequenced-before the release store; the release store synchronizes-with the acquire load that reads its value; the load is sequenced-before the read. So the write happens-before the read: no data race, and the read sees 42. `data` need not be atomic.

**Explanation:**
```text
T1: data = 42 --sequenced-before--> ready.store(true, release)
                                         |
                                  synchronizes-with (load reads true)
                                         v
T2:                       ready.load(acquire) --sequenced-before--> read data
=> data = 42  happens-before  read data
```
- The flag is atomic because it is the synchronization mechanism. Any amount of plain data (structs, strings, vectors) written before the release is covered.
- The condition "if the acquire reads the value written by that release" is essential. If the load reads `false`, nothing is guaranteed and the consumer must not touch `data`.
- ❌ Common wrong answer: "release guarantees that all instructions before it have finished and flushed to the cache, and acquire reloads fresh values". That is a hardware story; C++ never mentions caches.
- ❌ Another wrong answer: "make `data` atomic too, just in case". Unnecessary atomics cost compiler freedom and readability. The usual reason given, "atomics cause cache contention", is also imprecise: contention comes from many cores writing the same cache line, not from the type.
- ✅ What a strong answer adds: after the consumer has read the data, the producer must not modify it again without another synchronization round, otherwise that later write races with the consumer's reads.

**Key takeaway:** Say the chain: sequenced-before, synchronizes-with, sequenced-before, therefore happens-before.

---

#### Q6: Is a non-atomic payload safely published with a relaxed store of `ready` and an acquire load?
**Difficulty:** #intermediate
**Category:** #concurrency #memory_order
**Concepts:** #release_acquire #data_race

- The producer uses `ready.store(true, relaxed)`.
- The consumer uses `ready.load(acquire)`.

**Answer:**
No. An acquire load synchronizes only with a release operation (or a release fence). A relaxed store is neither, so no happens-before edge exists and the read of the non-atomic payload is a data race. Both sides must change: release on the store, acquire on the load.

**Explanation:**
- Synchronization is a pair. The release side says "publish everything before me"; the acquire side says "if I read a released value, import it". Either half alone does nothing.
- ❌ Common wrong answer: "change the consumer's relaxed load to acquire and it is fixed". This is the most common half-fix in code reviews.
- ❌ Another wrong answer: "it is safe if the producer actually runs first". Execution order is not synchronization; there is still no happens-before.
- ✅ What a strong answer adds: an alternative to changing the store is a fence on the producer side: `atomic_thread_fence(release)` placed **before** the relaxed store also pairs with the acquire load.

**Key takeaway:** Release and acquire are a matched pair on the same atomic; one side alone publishes nothing.

---

#### Q7: What happens if the consumer's acquire load executes before the producer's release store? Does acquire wait for the release?
**Difficulty:** #intermediate
**Category:** #concurrency #memory_order
**Concepts:** #acquire #synchronizes_with

**Answer:**
Acquire never waits. The load returns whatever value it reads at that moment, usually the old one, and synchronizes with nothing. That is correct behaviour as long as the consumer only touches the published data when the loaded value says it is ready.

**Explanation:**
- A load is a snapshot. A later release store does not retroactively change a value already loaded; the consumer must load again.
```cpp
std::atomic<Data*> slot{nullptr};
Data* p = slot.load(std::memory_order_acquire);  // runs first: p == nullptr
// producer later: d->value = 42; slot.store(d, std::memory_order_release);
if (p) use(p->value);   // skipped: no access, no race
```
- If waiting is required, use a loop, C++20 `atomic::wait`, or a condition variable.
- ❌ Common wrong answer: "acquire blocks until a release happens" or "acquire always sees the latest release".
- ✅ What a strong answer adds: the rule is "release synchronizes-with an acquire **that reads the value it wrote** (or a later value in its release sequence)". No reading of that value, no synchronization.

**Key takeaway:** Acquire is a filter on what you already read, not a wait.

---

#### Q8: What is the modification order of an atomic object? Is it per thread? Are loads part of it? Do two atomics share one?
**Difficulty:** #intermediate
**Category:** #concurrency #memory_model
**Concepts:** #modification_order #coherence

**Answer:**
Each atomic object has one total order of all its modifications (stores and RMWs) from all threads, and every thread agrees on it. It is per object, not per thread. Loads are not in it; they observe a value from it. Two atomics have independent orders.

**Explanation:**
- `x.store(10)` in T1 and `x.store(20)` in T2: the order is either `0 → 10 → 20` or `0 → 20 → 10`, not decided in advance, but the same for every observer.
- Within one thread, operations are additionally sequenced-before each other, and the modification order must respect that for the same object.
- `x` and `y` written as `x=10, y=20, x=30, y=40` by one thread give two orders: `x: 0→10→30`, `y: 0→20→40`. There is no combined order, so a relaxed reader can see `y == 40` and then `x == 10`.
- ❌ Common wrong answer: "modification order is per thread" or "all atomics share one global order". Per thread is sequenced-before; one global order across objects exists only for `seq_cst` operations.
- ❌ Another wrong answer: "modification order means the first thread to execute writes first". Physical timing is not the definition.
- ✅ What a strong answer adds: the four coherence rules (write-write, read-read, read-write, write-read) hold even for relaxed, and RMWs always read the last value in the order, which is why lock-free counters work.

**Key takeaway:** One modification order per atomic object, across all threads; loads only observe it.

---

#### Q9: Can thread 2 observe `a == 20` and `b == 10` in this relaxed code?
**Difficulty:** #intermediate
**Category:** #concurrency #memory_model
**Concepts:** #coherence #modification_order

```cpp
std::atomic<int> x{0};

// Thread 1
x.store(10, std::memory_order_relaxed);
x.store(20, std::memory_order_relaxed);

// Thread 2
int a = x.load(std::memory_order_relaxed);
int b = x.load(std::memory_order_relaxed);
```

**Answer:**
No. The modification order of `x` is `0, 10, 20`. Read-read coherence forbids a later load in the same thread from returning a value earlier in that order than one already read. After seeing 20, T2 can only see 20 (or a later value).

**Explanation:**
- Allowed `(a, b)`: `(0,0) (0,10) (0,20) (10,10) (10,20) (20,20)`. Forbidden: `(10,0) (20,0) (20,10)`.
- This holds with `relaxed`: coherence of a single object is not optional.
- ❌ Common wrong answer: "yes, relaxed allows any reordering". Relaxed allows reordering with respect to other objects, never going backward on one object.
- ❌ Imprecise wording to avoid: "after 20, everyone sees 20 until it changes". Other threads may still be reading older values; the rule is about each thread's own sequence of observations.
- ✅ What a strong answer adds: the compiler is therefore not allowed to swap two relaxed loads of the same atomic in a way that could expose `(20, 10)`.

**Key takeaway:** Per object, a thread's observations never go backward, even with relaxed.

---

#### Q10: If `data` and `ready` are both relaxed atomics, is there a data race? Can the reader print 0?
**Difficulty:** #intermediate
**Category:** #concurrency #memory_order
**Concepts:** #relaxed #data_race

- The reader prints `data` after it has seen `ready == true`.

**Answer:**
There is no data race, because every access is atomic, so behaviour is defined. But nothing orders `data` relative to `ready`, so the reader may see `ready == true` and still load `data == 0`. Fix: release on the `ready` store and acquire on its load.

**Explanation:**
- Two separate atomics have independent modification orders; relaxed adds no edge between them.
- ❌ Common wrong answer: "data race, undefined behaviour". That is the answer for a plain `int data`; with `std::atomic<int> data` it is a legal but unwanted outcome.
- ❌ Another wrong answer: "atomics guarantee the reader sees writes in program order".
- ✅ What a strong answer adds: after the fix, `data` may keep `relaxed` operations (or become a plain `int`). Only the flag needs release/acquire because it carries the happens-before edge.

**Key takeaway:** All-atomic relaxed code is race-free but not ordered; "no UB" is not "correct".

---

#### Q11: A colleague says a flag shared by two threads needs `volatile`. Do you agree?
**Difficulty:** #intermediate
**Category:** #concurrency #volatile
**Concepts:** #volatile #atomic

- The claim: "otherwise the compiler caches it in a register".

**Answer:**
No. `volatile` makes the compiler perform every access, which is meant for memory-mapped I/O and signal handlers, but it gives no atomicity, no data-race freedom and no inter-thread ordering. Concurrent access is still a data race. Use `std::atomic<bool>` (relaxed is fine for a pure stop flag).

**Explanation:**

| | `volatile` | `std::atomic` |
|---|---|---|
| Every access performed | ✅ | ✅ (in effect) |
| Atomic read-modify-write | ❌ | ✅ |
| Data-race free | ❌ | ✅ |
| Release/acquire, happens-before | ❌ | ✅ |
| Typical use | MMIO registers, `sig_atomic_t`, `longjmp` locals | Communication between threads |

- `volatile int n; ++n;` from two threads still loses increments.
- The compiler keeps volatile accesses in order among themselves only; plain accesses can move across them, and the CPU can reorder anyway.
- ❌ Common wrong answer: "`volatile` means don't reorder, so it is a lightweight memory barrier". It is neither a barrier nor portable synchronization.
- ✅ What a strong answer adds: MSVC's `/volatile:ms` (default on x86/x64, not on ARM) gives volatile acquire/release semantics, which is why old Windows code "works". It is a non-standard extension; the same code is broken on GCC/Clang and on MSVC ARM.

**Key takeaway:** Hardware or signal handler → `volatile`; another C++ thread → `std::atomic` or a mutex.

---

#### Q12: What does seq_cst add over acquire/release? Does it order which thread runs first, and do seq_cst loads synchronize?
**Difficulty:** #intermediate
**Category:** #concurrency #memory_order
**Concepts:** #seq_cst #total_order

**Answer:**
A seq_cst load is an acquire, a store is a release, and in addition all seq_cst operations on all objects fit one single total order consistent with each thread's program order. It does not control scheduling, and two loads never synchronize with each other.

**Explanation:**
- With relaxed or acquire/release, each object has its own order and different threads may disagree on the relative order of writes to *different* objects. `seq_cst` forbids that disagreement.
- "Participates in a total order" and "synchronizes-with" are different statements. Synchronizes-with still requires a load to read a value stored by a release (any seq_cst store is a release).
- ❌ Common wrong answer: "seq_cst keeps a global order of the operations inside a thread". The interesting part is the order *across* threads and across *different* atomic objects.
- ❌ Another wrong answer: "every two seq_cst operations on the same atomic synchronize".
- ❌ Another wrong answer: "seq_cst makes T1 execute before T2". It only restricts which outcomes are allowed.
- ✅ What a strong answer adds: the guarantee covers only seq_cst operations. Mix in one acquire or release operation and the total-order reasoning no longer applies to it.

**Key takeaway:** seq_cst = acquire/release + one total order of all seq_cst operations; not scheduling, not extra synchronization edges.

---

#### Q13: Which `(r1, r2)` results are possible here with seq_cst, and with release/acquire?
**Difficulty:** #advanced
**Category:** #concurrency #litmus_test
**Concepts:** #seq_cst #store_buffering

```cpp
std::atomic<int> x{0}, y{0};

// Thread 1
x.store(1);
r1 = y.load();

// Thread 2
y.store(1);
r2 = x.load();
```

**Answer:**
With seq_cst: (0,1), (1,0) and (1,1) are possible; (0,0) is impossible, because whichever store is first in the single total order must be seen by the other thread's later load. With release/acquire, (0,0) is also allowed, and x86 produces it in practice.

**Explanation:**
- Proof that (0,0) is impossible under seq_cst: `r1 == 0` puts T1's `y.load` before T2's `y.store` in the total order, and `r2 == 0` puts T2's `x.load` before T1's `x.store`. Adding program order gives a cycle: `x.store < y.load < y.store < x.load < x.store`.
- (1,1) is possible: `x.store, y.store, y.load, x.load` respects both threads' program orders.
- ❌ Common wrong answer: "with seq_cst at most one thread can see the other's store". The opposite is true: both can, and at least one must.
- ❌ Another wrong answer: "release/acquire is the same here". Release/acquire never orders a store before a *later load to another variable*; on x86 the store buffer does exactly that reordering.
- ✅ What a strong answer adds: this store-buffering pattern underlies Dekker's and Peterson's mutual exclusion, hazard-pointer publish-then-check, and "set my flag, then check yours" protocols. They all need seq_cst operations or `atomic_thread_fence(seq_cst)` between the store and the load. On x86 the cost is the `xchg` (or `mfence`) of the seq_cst store.

**Key takeaway:** The store-buffering test is the canonical case where acquire/release is not enough and seq_cst is required.

---

#### Q14: An interviewer says release works by flushing the store buffer. Do you agree?
**Difficulty:** #intermediate
**Category:** #concurrency #hardware
**Concepts:** #release_acquire #cache_coherence

- The full claim: "release works because it flushes the store buffer and MESI pushes the new cache line to the other core".

**Answer:**
Not as a definition. C++ release means: if an acquire reads this store's value, everything before the release happens-before everything after that acquire. How it is achieved is the compiler's and CPU's choice. MESI is the hardware mechanism that keeps cache lines coherent; it is related but is not the guarantee.

**Explanation:**
- On x86 a release store is a plain `mov` with no flush at all; TSO already keeps stores in order. On ARMv8 it is `stlr`. Neither is "flush the store buffer".
- Coherence (MESI) alone does not give ordering: a core can still delay its own stores in a store buffer or process invalidations late, which is why fences and ordered instructions exist.
- ❌ Common wrong answer: "release flushes the store buffer; acquire invalidates stale cache and registers".
- ❌ Overcorrection to avoid: "MESI is completely unrelated". Coherence is part of how hardware implements atomicity and visibility.
- ✅ What a strong answer adds: answer in three layers. C++: synchronizes-with and happens-before. Compiler: forbids moving earlier accesses below the store and emits the right instruction. Hardware: store buffers, coherence protocol, barriers. Go to the hardware layer only if asked.

**Key takeaway:** Define release/acquire with happens-before; treat store buffers and MESI as implementation details.

---

#### Q15: How do `std::mutex` lock and unlock provide memory ordering? Is there a data race if T2 happens to lock first?
**Difficulty:** #intermediate
**Category:** #concurrency #mutex
**Concepts:** #mutex #happens_before

**Answer:**
Lock is an acquire and unlock is a release: each unlock synchronizes-with the next successful lock of the same mutex, so everything in one critical section happens-before the next. If T2 locks first it just sees the old value. That is a logical ordering issue, not a data race.

**Explanation:**
```text
T1: data = 42 --sb--> m.unlock() --synchronizes-with--> m.lock() --sb--> T2 reads data
```
- The mutex's lock/unlock operations form a single total order; which thread gets it first is not specified.
- With a condition variable, the data visibility still comes from the mutex. The CV only provides waiting/notification and the atomic "unlock and start waiting" step that prevents lost wake-ups.
- ❌ Common wrong answer: "if the reader locks first there is a race, so the result is undefined". Both accesses are protected; the outcome is just one of two well-defined values.
- ❌ Another wrong answer: "a mutex only gives mutual exclusion; you still need atomics for visibility".
- ✅ What a strong answer adds: other free synchronizes-with edges: `std::thread` construction → thread start, thread end → `join()` return, `std::call_once`, function-local static initialization, `std::promise::set_value` → `future::get`.

**Key takeaway:** unlock (release) synchronizes-with the next lock (acquire); scheduling order is a logic question, not a race.

---

#### Q16: What is the difference between compiler reordering and CPU reordering, and what stops each?
**Difficulty:** #intermediate
**Category:** #concurrency #compiler
**Concepts:** #reordering #compiler_barrier

**Answer:**
The compiler reorders, merges, hoists or deletes memory accesses under the as-if rule, assuming no data races. The CPU reorders visibility through out-of-order execution and store buffers. C++ atomics with the right memory order constrain both; a compiler-only barrier stops just the compiler.

**Explanation:**
- Compiler example: `while (!flag) {}` on a plain `bool` may become `if (!flag) for (;;) {}`. Legal, because a concurrent write would be a data race.
- CPU example: on x86, `x = 1; r = y;` can complete the load before the store is visible to other cores.
- Tools:

| Tool | Stops compiler | Stops CPU | Portable |
|---|---|---|---|
| `std::atomic` op with order | ✅ | ✅ | ✅ |
| `std::atomic_thread_fence` | ✅ | ✅ | ✅ |
| `std::atomic_signal_fence` | ✅ | ❌ | ✅ (signal handlers only) |
| `asm volatile("" ::: "memory")` | ✅ | ❌ | ❌ GCC/Clang |
| `volatile` | only among volatile accesses | ❌ | ✅ but not for threads |

- ❌ Common wrong answer: "on x86 hardware does not reorder, so I do not need atomics". The compiler still reorders, and x86 still has store-load reordering.
- ✅ What a strong answer adds: C++ memory orders are specified against the abstract machine, so one source file is correct on every CPU; the compiler chooses `mov` on x86 and `ldar`/`stlr` on ARM.

**Key takeaway:** Two reorderers exist; std::atomic orders handle both, compiler barriers handle one.

---

#### Q17: How do x86 and ARM differ in memory ordering, and what do acquire, release and seq_cst compile to on each?
**Difficulty:** #advanced
**Category:** #concurrency #hardware
**Concepts:** #x86_tso #arm

**Answer:**
x86 is TSO: only a store followed by a later load can be reordered, so acquire loads and release stores are plain `mov`, and only seq_cst stores need `xchg` or `mfence`. ARMv8 is weakly ordered (all four reorderings), so it uses `ldar`/`stlr` and `dmb` barriers.

**Explanation:**

| C++ | x86-64 (GCC 11, verified) | AArch64 (standard mapping) |
|---|---|---|
| relaxed / acquire / seq_cst load | `mov` | `ldr` / `ldar` (or `ldapr`) / `ldar` |
| relaxed / release store | `mov` | `str` / `stlr` |
| seq_cst store | `xchg` | `stlr` |
| `fetch_add` | `lock xadd` | LL/SC loop or LSE `ldadd*` |
| `atomic_thread_fence(seq_cst)` | `lock or [rsp], 0` (or `mfence`) | `dmb ish` |

- Consequence: buggy code with relaxed flags often passes all tests on x86 and fails on ARM servers, Apple silicon or phones.
- ❌ Common wrong answer: "x86 is sequentially consistent, so memory order does not matter on x86". x86 allows store-load reordering, and the compiler reorders regardless of CPU.
- ❌ Another wrong answer: "the store buffer on every CPU releases stores in program order". True on x86 (FIFO store buffer), false on ARM/POWER.
- ✅ What a strong answer adds: neither x86 nor ARMv8 hardware lets two readers disagree on the order of two independent writes (the IRIW anomaly), but the C++ model allows it for acquire/release because it also targets POWER. Only seq_cst forbids it. Design to the C++ model, not to the CPU you test on.

**Key takeaway:** On x86 only seq_cst stores cost extra; on ARM every non-relaxed order costs something; C++ code must not care.

---

#### Q18: When do you use memory_order_acq_rel, and what happens if you pass acquire to a store or release to a load?
**Difficulty:** #advanced
**Category:** #concurrency #memory_order
**Concepts:** #acq_rel #rmw

**Answer:**
acq_rel is for read-modify-write operations that must both import (acquire, via the read) and publish (release, via the write), such as a ref-count decrement or a CAS that hands work over. Passing acquire to a store or release to a load violates a precondition: undefined behaviour.

**Explanation:**
- Valid orders:
  - load: `relaxed`, `consume`, `acquire`, `seq_cst`
  - store: `relaxed`, `release`, `seq_cst`
  - RMW: all six
  - CAS failure order: a load order, so not `release` or `acq_rel`
- GCC 11 and Clang compile `x.store(1, std::memory_order_acquire)` silently when the order is passed through `std::atomic`; libstdc++ with `-D_GLIBCXX_ASSERTIONS` aborts at runtime.
- ❌ Common wrong answer: "acq_rel on a load gives you both". A load has no write to attach release semantics to.
- ✅ What a strong answer adds: an RMW that reads from a release store continues that store's release sequence. So a chain of relaxed `fetch_add`s between a release store and an acquire load does not break the synchronization.

**Key takeaway:** acq_rel is for RMWs; mismatched orders on loads/stores are UB, not "the strongest possible".

---

#### Q19: What is std::atomic_thread_fence, and how does fence-based synchronization differ from release/acquire operations?
**Difficulty:** #advanced
**Category:** #concurrency #fences
**Concepts:** #fences #release_acquire

**Answer:**
A fence is not bound to one atomic; it upgrades nearby relaxed atomic operations. A release fence sequenced before a relaxed store synchronizes with an acquire fence sequenced after a relaxed load that read that store. An atomic object must still carry the value.

**Explanation:**
```cpp
// producer
data = 42;
std::atomic_thread_fence(std::memory_order_release);  // must be BEFORE the store
flag.store(1, std::memory_order_relaxed);

// consumer
while (flag.load(std::memory_order_relaxed) == 0) {}
std::atomic_thread_fence(std::memory_order_acquire);  // must be AFTER the load
use(data);
```
- Why use fences: one acquire fence after a polling loop instead of an acquire on every iteration; one fence covering several relaxed loads; seqlocks; ref-count decrement (`release` RMW, then acquire fence only in the "last owner" branch).
- `atomic_thread_fence(seq_cst)` additionally orders store-load and is the fence version of the seq_cst total order.
- ❌ Common wrong answer: "a fence makes all memory visible to all threads" or "put a fence anywhere and it works". Without an atomic read observing a store, fences synchronize nothing, and a release fence after the store is useless.
- ✅ What a strong answer adds: fences are often stronger and more expensive than the equivalent operation (on ARM a release store is `stlr`, a release fence is a full `dmb ish`). Prefer ordered operations unless the fence buys something.

**Key takeaway:** Fences upgrade relaxed atomics; release fence before the store, acquire fence after the load.

---

#### Q20: What is memory_order_consume, and should you use it?
**Difficulty:** #advanced
**Category:** #concurrency #memory_order
**Concepts:** #consume #dependency_ordering

**Answer:**
consume was meant to be a cheaper acquire: it orders only operations that carry a data dependency on the loaded value, such as dereferencing a loaded pointer. It proved unimplementable as specified, every major compiler treats it as acquire, and C++26 deprecates it. Use acquire.

**Explanation:**
- Motivation: on ARM/POWER, address dependencies are ordered by hardware for free (Linux RCU's `rcu_dereference` relies on this), so `p->field` after loading `p` would need no barrier.
- Problem: compilers optimize away dependencies (e.g. `x - x`, value speculation), and tracking them through the type system never worked. The standard discouraged it since C++17.
- ❌ Common wrong answer: "consume is the right order for pointer publication in low-latency code". In practice you pay acquire cost anyway, with more fragile code.
- ✅ What a strong answer adds: on x86 acquire is already free (a plain `mov`), so the only beneficiaries would be weak architectures, where `ldapr` (RCpc acquire, ARMv8.3) already narrows the gap.

**Key takeaway:** consume is effectively acquire everywhere and deprecated in C++26; write acquire.

---

#### Q21: Is a release/acquire chain through a middle thread enough for T3 to read `config` safely?
**Difficulty:** #advanced
**Category:** #concurrency #memory_model
**Concepts:** #transitivity #release_sequence

- T1 writes `config`, then release-stores `a`. T2 acquires `a`, then release-stores `b`.
- T3 acquires `b` and reads `config`, but never touches `a`.

**Answer:**
Yes. Happens-before is transitive: T1's write is sequenced-before its release on `a`, which synchronizes-with T2's acquire, which is sequenced-before T2's release on `b`, which synchronizes-with T3's acquire. So the write to `config` happens-before T3's read.

**Explanation:**
- This is what makes pipelines work: each stage only synchronizes with the previous one, yet every stage sees everything written by all earlier stages.
- Related rule, the release sequence: after a release store to `M`, RMWs on `M` by any thread (even relaxed) extend the sequence. An acquire reading the value of one of those RMWs still synchronizes-with the original release.
- C++20 change: a later plain store by the same thread no longer extends a release sequence; only RMWs do.
- ❌ Common wrong answer: "T3 must also acquire `a` to see T1's data".
- ✅ What a strong answer adds: transitivity requires each link to be real. If T2's store to `b` were relaxed, or T2 stored before it acquired, the chain breaks and T3 races on `config`.

**Key takeaway:** Happens-before chains across any number of threads, as long as every link is a real release/acquire pair.

---

#### Q22: Which memory orders does a shared_ptr-style reference count need for increment and decrement, and why?
**Difficulty:** #advanced
**Category:** #concurrency #design
**Concepts:** #reference_counting #acq_rel

**Answer:**
Increment can be relaxed: a thread only adds a reference while it already holds one, so the object cannot die concurrently. Decrement needs release so each owner's writes are published, and the thread that reaches zero needs acquire before deleting. Use `fetch_sub(acq_rel)`, or release plus an acquire fence.

**Explanation:**
```cpp
void release_ref(Block* b) {
    if (b->refs.fetch_sub(1, std::memory_order_release) == 1) {
        std::atomic_thread_fence(std::memory_order_acquire);  // only the last owner pays
        delete b;
    }
}
```
- Without release on every decrement, a thread's last writes to the object could be reordered after its decrement; the deleting thread then destroys an object that is still being written.
- Without acquire before `delete`, the destructor may not see other owners' writes: a data race with the destructor.
- The decrements form a release sequence (all RMWs), so the final acquire synchronizes with every earlier owner's release.
- ❌ Common wrong answer: "a counter only needs relaxed". That is true for statistics, but this counter controls object lifetime, so it publishes.
- ✅ What a strong answer adds: `std::shared_ptr` copies are not free: each copy is an atomic RMW on a shared cache line. Pass by `const&` in hot paths. `std::atomic<std::shared_ptr<T>>` (C++20) is usually not lock-free.

**Key takeaway:** Relaxed to add a reference you already own; release on drop; acquire before destroy.

---

#### Q23: Why is double-checked locking with a plain `Singleton*` broken, and how do you fix it?
**Difficulty:** #advanced
**Category:** #concurrency #design
**Concepts:** #double_checked_locking #publication

**Answer:**
The unlocked first check reads the pointer while another thread writes it under the lock: a data race. Even ignoring that, a reader may see a non-null pointer before the object's construction is visible. Fix: an atomic pointer with acquire load and release store, or simply a function-local static.

**Explanation:**
```cpp
std::atomic<Singleton*> inst{nullptr};
std::mutex m;

Singleton* get() {
    Singleton* p = inst.load(std::memory_order_acquire);     // fast path
    if (!p) {
        std::lock_guard<std::mutex> lk(m);
        p = inst.load(std::memory_order_relaxed);            // the mutex already orders this
        if (!p) {
            p = new Singleton;
            inst.store(p, std::memory_order_release);        // publish the constructed object
        }
    }
    return p;
}
```
- The mutex protects writers against each other, but the fast-path reader never takes the mutex, so the atomic pointer must carry the publication itself.
- ❌ Common wrong answer: "make the pointer `volatile`". Still a race, still no ordering of the constructor's writes.
- ✅ What a strong answer adds: `static Singleton& get() { static Singleton s; return s; }` is guaranteed thread-safe since C++11 and compilers implement it with exactly this acquire fast path. `std::call_once` is the other standard tool.

**Key takeaway:** Any lock-free fast path must carry its own release/acquire; prefer magic statics.

---

#### Q24: How would you build a seqlock for a one-writer, many-reader market-data snapshot, and which memory orders does it need?
**Difficulty:** #advanced
**Category:** #concurrency #low_latency
**Concepts:** #seqlock #fences

**Answer:**
A sequence counter is odd while a write is in progress. Readers load it (acquire), copy the data with relaxed atomic loads, issue an acquire fence, reload the counter, and retry if it was odd or changed. The writer bumps it to odd, release fence, writes, then release-stores the even value.

**Explanation:**
```cpp
struct Quote { std::atomic<long> bid{0}, ask{0}; };
std::atomic<unsigned> seq{0};
Quote q;

void write(long b, long a) {                       // single writer
    unsigned s = seq.load(std::memory_order_relaxed);
    seq.store(s + 1, std::memory_order_relaxed);   // odd: write in progress
    std::atomic_thread_fence(std::memory_order_release);
    q.bid.store(b, std::memory_order_relaxed);
    q.ask.store(a, std::memory_order_relaxed);
    seq.store(s + 2, std::memory_order_release);   // even: done
}

std::pair<long, long> read() {
    for (;;) {
        unsigned s0 = seq.load(std::memory_order_acquire);
        long b = q.bid.load(std::memory_order_relaxed);
        long a = q.ask.load(std::memory_order_relaxed);
        std::atomic_thread_fence(std::memory_order_acquire);
        unsigned s1 = seq.load(std::memory_order_relaxed);
        if (s0 == s1 && !(s0 & 1)) return {b, a};
    }
}
```
- The release fence after the odd store keeps the data stores from moving above it; the acquire fence before the second counter load keeps the data loads from moving below it.
- The payload fields must be atomics (relaxed): readers really do read concurrently with writes and then discard the result. With plain fields that is a data race, even though the torn value is thrown away.
- ❌ Common wrong answer: "plain `memcpy` of the struct between two acquire loads of the counter". An acquire on the second load does not stop the earlier data reads from moving after it.
- ✅ What a strong answer adds: readers never write shared memory, so they cause no cache-line ping-pong and never block the writer. The trade-off is reader retries under heavy writes and the restriction to trivially copyable data. See topic 09 for queue-based alternatives.

**Key takeaway:** Seqlock = odd/even counter + relaxed atomic payload + fences on both sides of the data accesses.

---
