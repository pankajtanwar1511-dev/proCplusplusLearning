## TOPIC: shared_ptr and Thread Safety

### INTERVIEW_QA: Interview Questions with Detailed Answers

#### Q1: Is `std::shared_ptr` thread-safe?
**Difficulty:** #beginner
**Category:** #concurrency #smart_pointers
**Concepts:** #control_block #data_race #ownership

**Answer:**
It depends on which layer you mean. The control block's reference counting is thread-safe, so different `shared_ptr` objects that share ownership can be copied, reset and destroyed concurrently. The same `shared_ptr` object is not safe if one thread modifies it while another accesses it. And the managed object gets no protection at all.

**Explanation:**
- Three questions to ask:
  - Is the same handle shared between threads with a writer? Needs a mutex or `atomic<shared_ptr>`.
  - Does each thread own a copy? Then lifetime is protected.
  - Is the object's data modified concurrently? Needs its own synchronization or immutability.
- Same rule as any ordinary object for the handle: concurrent `const` access is fine; a writer requires exclusion.
- ❌ Common wrong answer: "Yes, the counter is atomic." That covers only one of three layers.
- ❌ Common wrong answer: "No, so every copy needs a lock." Copies living in different threads are exactly what the atomic count is for.
- ✅ What a strong answer adds: "`shared_ptr` answers *when may this be destroyed*, not *who may modify it*."

**Key takeaway:** Thread-safe ownership, not a thread-safe handle variable, not a thread-safe object.

---

#### Q2: `p2` is a copy of `p1`. Thread 1 calls `p1.reset()`, thread 2 calls `p2.reset()` at the same time. Safe? Who destroys the object?
**Difficulty:** #beginner
**Category:** #concurrency #smart_pointers
**Concepts:** #reference_counting #atomic_rmw #destructor_thread

**Answer:**
Safe. They are different `shared_ptr` objects; each modifies only itself plus the shared atomic count. Exactly one of the two decrements brings the count from 1 to 0, and that thread runs the destructor. Which one is not determined.

**Explanation:**
- The decrement is an atomic RMW, so the two decrements are ordered in the counter's modification order: one sees 2 and leaves 1, the other sees 1 and leaves 0.
- Typical implementations (libstdc++, libc++, MSVC) make the decrement acquire-release, so the destroying thread sees every write that other owners made before they released (Chapter 4, topic 06, Q22). The standard does not prescribe a memory order; it only requires that destruction through the deleter is correctly synchronized with the other owners' earlier uses.
- ❌ Common wrong answer: "Both might see count 1 and both delete." That would be true for a non-atomic counter, which is why the count is atomic.
- ✅ What a strong answer adds: "whoever drops last runs the destructor" also means a latency-critical thread can be the one paying for a large destruction (Q14).

**Key takeaway:** Separate handles, shared count: safe, and the last releaser destroys.

---

#### Q3: Thread 1 does `auto local = resource;` while thread 2 does `resource.reset();` on the same global. What can go wrong?
**Difficulty:** #intermediate
**Category:** #concurrency #smart_pointers
**Concepts:** #data_race #use_after_free #handle

**Answer:**
Both threads access the same `shared_ptr` object and one modifies it: a data race, undefined behaviour. A copy is "read the two pointers, then increment the count". If thread 2's reset drops the last reference between those steps, the object and control block are freed and thread 1 increments a count in freed memory and holds a dangling handle.

**Explanation:**
- Bad interleaving:
  - T1 reads `resource`'s stored pointer and control-block pointer.
  - T2 `reset()`: count 1 to 0, object destroyed, control block freed.
  - T1 increments the count inside freed memory; `local` now points to a destroyed object.
- Good interleaving (still a race in the abstract, but harmless in this run): T1 finishes the copy first (count 2), T2's reset leaves 1, `local` keeps the object alive.
- Because the bad interleaving exists, the program has UB; "it usually works" is the worst kind of bug.
- Fix: copy and reset under the same mutex, or make `resource` an `std::atomic<std::shared_ptr<Resource>>`.
- ❌ Common wrong answer: "Thread 1 gets either the old object or nullptr." That assumes the copy is atomic; it is not.
- ✅ What a strong answer adds: once `local` exists, the reset is harmless: the problem is only the concurrent access to the one handle.

**Key takeaway:** Copying from a handle that another thread writes is a race; the atomic count does not cover reading the handle.

---

#### Q4: Many threads copy the same global `shared_ptr` concurrently, and nobody writes it. Is that a data race?
**Difficulty:** #intermediate
**Category:** #concurrency #smart_pointers
**Concepts:** #const_access #data_race #reference_counting

**Answer:**
No. Copying only reads the source handle (a `const` operation) and increments the atomic count. Concurrent reads of one object are not a data race, so any number of threads may copy from it as long as no thread modifies it during that time.

**Explanation:**
- Typical safe case: the global is initialized before the threads start and reset only after they are joined (thread start and `join()` both synchronize).
- The trap: someone later adds a "rare" `g.reset()` or `g = newer;` while readers may run. That single writer makes every copy a race.
- TSan agrees: concurrent copies are clean; add one concurrent assignment and it reports a data race.
- ❌ Common wrong answer: "Copying increments the count, so it modifies shared state, so it races." The count is atomic; the handle is only read.
- ✅ What a strong answer adds: the same rule is spelled out for all standard library types: concurrent `const` member calls on one object are race-free.

**Key takeaway:** Readers-only access to one handle is fine; one writer changes everything.

---

#### Q5: How do you safely share a `shared_ptr` member that one thread replaces and others read, using a mutex? What should the lock cover?
**Difficulty:** #intermediate
**Category:** #concurrency #design
**Concepts:** #snapshot #mutex #critical_section

**Answer:**
Lock only to copy the handle (readers) or to swap in a new one (writer). Readers then use their local copy without the lock; the copy keeps the object alive. The writer builds the new object before locking and lets the old one be destroyed after unlocking.

**Explanation:**
```cpp
std::shared_ptr<const Limits> snapshot() const {
    std::lock_guard<std::mutex> lk(m_);
    return cur_;
}
void update(Limits l) {
    auto fresh = std::make_shared<const Limits>(l);       // allocate outside the lock
    std::shared_ptr<const Limits> old;
    {
        std::lock_guard<std::mutex> lk(m_);
        old = std::exchange(cur_, std::move(fresh));
    }
}                                                        // old dies here, unlocked
```
- The critical section is two pointer copies and an atomic increment: tens of nanoseconds.
- If the writer simply did `cur_ = fresh;` under the lock and held the last reference, the old object's destructor would run inside the critical section and block every reader.
- ❌ Common wrong answer: "Hold the lock while using the object." That serializes all readers for the whole operation and is unnecessary: the copy already protects lifetime.
- ✅ What a strong answer adds: works on any standard and compiler; for heavy read load see `atomic<shared_ptr>` (Q7) or sharding.

**Key takeaway:** Mutex protects the handle for a moment; the copied `shared_ptr` protects the object for as long as needed.

---

#### Q6: `getData()` returns `data_.get()` from a `unique_ptr<Data>` member while `update()` replaces it in another thread. What is wrong and how do you redesign for many readers and rare updates?
**Difficulty:** #advanced
**Category:** #concurrency #design
**Concepts:** #data_race #dangling_pointer #copy_on_write

```cpp
class Manager {
    std::unique_ptr<Data> data_ = std::make_unique<Data>();
public:
    const Data* getData() const { return data_.get(); }
    void update() { data_ = std::make_unique<Data>(); data_->value++; }
};
```

**Answer:**
Two independent bugs. First, `getData()` reads `data_` while `update()` writes it: a data race on the `unique_ptr`. Second, even if access were serialized, the raw pointer returned to a reader dangles as soon as `update()` destroys the old `Data`. Redesign: immutable snapshots: store `std::shared_ptr<const Data>`, readers get their own `shared_ptr` copy, the writer publishes a new object (mutex, or `std::atomic<std::shared_ptr<const Data>>` in C++20).

**Explanation:**
- Data race vs lifetime race: a mutex in `getData()` alone fixes the first but not the second, because the pointer escapes the lock.
- Redesign properties:
  - Readers never block each other (with `atomic<shared_ptr>`) and never see a half-built object (it is complete before publication and never modified).
  - Old versions live until their last reader finishes.
  - `const Data` makes mutation of a published snapshot a compile error.
- Costs to mention: each read is an atomic RMW on the shared control block (cache-line traffic), `atomic<shared_ptr>` is not lock-free, and each update allocates and copies.
- For extreme latency budgets: RCU, epoch-based reclamation or hazard pointers (Chapter 4, topic 08).
- ❌ Common wrong answer: "Return a `const Data&` instead of a pointer." Same dangling problem.
- ✅ What a strong answer adds: with more than one writer, the read-copy-publish sequence loses updates (Q10).

**Key takeaway:** Fix both the race on the handle and the lifetime of what readers hold: publish immutable snapshots via `shared_ptr<const T>`.

---

#### Q7: Design a configuration hot-reload with `std::atomic<std::shared_ptr<const Config>>`. What do readers and the writer do, and what does it not protect?
**Difficulty:** #intermediate
**Category:** #concurrency #design
**Concepts:** #atomic_shared_ptr #immutability #snapshot

**Answer:**
Readers call `auto c = cfg.load();` once per operation and read every field through `c`. The writer builds a complete new `Config`, then `cfg.store(std::move(next));`. Old configs are freed when their last reader drops its snapshot. It protects the handle only: the `Config` objects must be immutable after publication.

**Explanation:**
- `load()` returns an owning `shared_ptr`, so a writer's `store()` can never free a config that a reader still uses.
- Ordering: the default `seq_cst`, or `store(release)` with `load(acquire)`, makes the fields written before publication visible to any reader that obtains the new pointer.
- Rules:
  - One `load()` per operation; two loads may return two versions (`a` from v1, `b` from v2).
  - `shared_ptr<const Config>` so readers cannot mutate.
  - One writer, or serialize writers (Q10).
- Practical notes:
  - Not lock-free (libstdc++ GCC 12+ and MSVC use a lock bit): `is_lock_free()` is `false`.
  - GCC 11 does not provide it; use the mutex version (Q5) there.
  - Basic `atomic<shared_ptr>` facts are in Chapter 4, topic 05, Q20.
- ❌ Common wrong answer: "Because the pointer is atomic, readers can also update fields of the config." That is a race on the object.
- ✅ What a strong answer adds: whichever thread drops the last reference to an old config destroys it; keep heavy destruction off hot reader threads.

**Key takeaway:** Atomic handle + immutable object + one snapshot per operation.

---

#### Q8: Is there a data race here?
**Difficulty:** #advanced
**Category:** #concurrency #memory_model
**Concepts:** #release_acquire #happens_before #publication

```cpp
std::shared_ptr<Data> data;                  // plain shared_ptr
std::atomic<bool> ready{false};

void producer() {
    auto d = std::make_shared<Data>();
    d->value = 42;
    data = d;
    ready.store(true, std::memory_order_release);
}
void consumer() {
    while (!ready.load(std::memory_order_acquire)) {}
    std::cout << data->value;
}
```

**Answer:**
No, as long as `data` is written exactly once. The write `data = d` is sequenced before the release store; the consumer's acquire load that reads `true` synchronizes with it; the read of `data` is sequenced after. So the write happens-before the read: they are not concurrent, hence not a race. The consumer prints 42.

**Explanation:**
- A data race needs two conflicting accesses that are **not** ordered by happens-before. Release/acquire provides exactly that order here.
- Verified with ThreadSanitizer: clean over 50 repeated runs.
- It becomes a race as soon as anyone writes `data` again while consumers may read it (TSan then reports it). This is a one-shot publication pattern, like `std::call_once`.
- ❌ Common wrong answer: "Release/acquire cannot make a non-atomic `shared_ptr` safe; you must use `atomic<shared_ptr>`." For a single write followed by reads it is safe; `atomic<shared_ptr>` is needed for repeated publication.
- ❌ Common wrong answer (opposite direction): "Release/acquire makes `shared_ptr` assignment atomic." It orders; it does not make concurrent writes safe.
- ✅ What a strong answer adds: the consumer still only reads `data->value`; mutating the `Data` afterwards from either side would be a separate race on the object.

**Key takeaway:** Ordered accesses are not a race: write once, publish with release, read after acquire.

---

#### Q9: With `atomic<shared_ptr<Data>>`, what do `memory_order_release` on `store` and `memory_order_acquire` on `load` buy, and what do they not protect?
**Difficulty:** #intermediate
**Category:** #concurrency #memory_model
**Concepts:** #atomicity #visibility #release_acquire

**Answer:**
The atomic type gives atomicity of the handle: concurrent load/store of the same `shared_ptr` variable is race-free. Release/acquire gives visibility: a reader whose acquire load sees the new pointer also sees everything the producer wrote before the release store, such as the object's fields. Neither protects later concurrent modification of the `Data` object itself.

**Explanation:**
- Two jobs, two mechanisms:
  - Handle atomicity: `atomic<shared_ptr>` (or a mutex).
  - Initialization visibility: release on publish, acquire on read (the `seq_cst` default also works).
- `Data::value` does not need to be atomic when it is written only before publication and only read afterwards.
- If the producer later writes `d->value = 100;` while a consumer reads it, that is a data race on `value`; neither the atomic pointer nor the memory orders help.
- ❌ Common wrong answer: "Acquire/release flush the caches so everyone sees the latest data." They establish happens-before for the observing thread only; there is no global flush.
- ✅ What a strong answer adds: with `relaxed` on both sides the handle is still race-free, but the reader might see the new pointer and stale fields (formally, reading them would be a data race).

**Key takeaway:** Atomic type = safe handle; release/acquire = safe initialization; immutability = safe object.

---

#### Q10: Two threads update a copy-on-write snapshot with load, copy, modify, store. What goes wrong, and how do you fix it?
**Difficulty:** #intermediate
**Category:** #concurrency #design
**Concepts:** #lost_update #compare_exchange #copy_on_write

**Answer:**
A lost update: both writers load v1, both build their own v2 from v1, and the second store overwrites the first. No data race, just wrong results. Fix by serializing writers with a mutex (readers keep using `load()`), or with a CAS loop: `compare_exchange_weak(expected, next)` publishes only if the current snapshot is still the one the copy was built from, otherwise retry.

**Explanation:**
```cpp
void add_fill() {
    auto cur = snap.load();
    for (;;) {
        auto next = std::make_shared<Counters>(*cur);
        ++next->fills;
        if (snap.compare_exchange_weak(cur, std::move(next))) return;
        // cur was refreshed with the newer snapshot; rebuild
    }
}
```
- Measured (GCC 13, 4 threads x 10,000 updates): naive version ended with 36,492 to 39,892 instead of 40,000; CAS version always 40,000. TSan reports nothing for the naive version: it is a logic race, not a data race.
- CAS on `atomic<shared_ptr>` compares both stored pointer and control block, and `expected` owns its object, so address reuse (ABA) cannot fool it.
- With costly copies and frequent contention, a writer mutex wastes less work than repeated CAS retries.
- ❌ Common wrong answer: "Make the `store` `seq_cst` and the problem disappears." Ordering does not make read-modify-write atomic.
- ✅ What a strong answer adds: TSan finds data races, not lost updates; this needs reasoning or invariant checks in tests.

**Key takeaway:** Copy-on-write has one writer or a CAS loop; otherwise updates vanish silently.

---

#### Q11: Before C++20, how did you load and store a shared `shared_ptr` atomically? What is the trap?
**Difficulty:** #intermediate
**Category:** #concurrency #legacy
**Concepts:** #atomic_load #atomic_store #deprecation

**Answer:**
With the C++11 free functions `std::atomic_load(&sp)`, `std::atomic_store(&sp, v)`, `std::atomic_exchange` and `std::atomic_compare_exchange_*` on an ordinary `shared_ptr` object. The trap: they are safe only if every concurrent access to that object goes through them; one plain `sp = x` or `auto c = sp` anywhere is a data race. C++20 deprecated them in favour of `std::atomic<std::shared_ptr<T>>`, and C++26 removes them.

**Explanation:**
- libstdc++ implements them with a small global pool of mutexes selected by the object's address, so they are not lock-free either (`std::atomic_is_lock_free(&sp)` returns false).
- They work with GCC 11, which lacks `atomic<shared_ptr>`; GCC 13 compiles them in C++20 mode without a deprecation warning.
- The distinct C++20 type removes the trap: you cannot accidentally access an `atomic<shared_ptr>` non-atomically.
- ❌ Common wrong answer: "`std::atomic_load` on a `shared_ptr` is the same as `std::atomic<std::shared_ptr>`." Same goal, but the protocol is enforced only by discipline.
- ✅ What a strong answer adds: when maintaining legacy code, grep for every use of the variable; one non-atomic access invalidates the whole scheme.

**Key takeaway:** Free functions need 100% discipline; the C++20 type enforces it.

---

#### Q12: Why can't `atomic<shared_ptr>` simply be a lock-free 16-byte compare-and-swap of the two pointers?
**Difficulty:** #advanced
**Category:** #concurrency #lock_free
**Concepts:** #atomic_shared_ptr #memory_reclamation #split_reference_count

**Answer:**
Because `load()` must do two things atomically: read the control-block pointer and increment the count inside that block. Between the read and the increment, a concurrent `store()` can drop the last reference and free the block, so the reader would increment freed memory. A double-width CAS can swap the pair but cannot protect the pointee during that window.

**Explanation:**
- This is the classic safe memory reclamation problem (Chapter 4, topic 08): reading a pointer and then using it needs a guarantee that it is not freed in between.
- Implementation choices:
  - Lock bit in the pointer word (libstdc++ GCC 12+, MSVC): simple, not lock-free.
  - Split reference counts (a local count stored next to the pointer, merged into the global count later): lock-free on hardware with double-width CAS, more complex (used by some third-party libraries).
  - Deferred reclamation (hazard pointers, epochs).
- The plain `shared_ptr` copy has the same structure, which is exactly why copying from a handle that is being reassigned is a race (Q3).
- ❌ Common wrong answer: "It is not lock-free because the reference count needs a mutex." The count is a plain atomic; the problem is the window between reading the pointer and incrementing.
- ✅ What a strong answer adds: so `atomic<shared_ptr>` is a correctness tool, not a performance tool; measure before using it on a hot path.

**Key takeaway:** Read pointer + increment pointee must be atomic as a pair; that needs a lock or a reclamation scheme.

---

#### Q13: Profiling shows heavy `shared_ptr` refcount overhead in a high-rate message pipeline. A colleague proposes replacing every `shared_ptr<Message>` with `Message*`. Your answer?
**Difficulty:** #advanced
**Category:** #performance #design
**Concepts:** #refcount_contention #ownership #reclamation

**Answer:**
Not blindly. Raw pointers remove the counting but also the lifetime guarantee, so asynchronous consumers that finish late get use-after-free. First ask whether ownership is really shared. Usually one producer owns each message and consumers only read it; then use single ownership plus non-owning access with an explicit reclamation rule (completion counter per message, acknowledgements to the owner, or epoch/watermark-based recycling of a preallocated pool).

**Explanation:**
- Why it is slow: each copy and destruction is an atomic RMW on the message's control block; fan-out across cores makes that cache line ping-pong. Measured: about 11 ns per copy on one thread, about 220 ns with 8 threads on one block.
- Cheap fixes before redesign:
  - Pass `const Message&` inside a thread instead of copying.
  - Move instead of copy at hand-off points.
  - One reference per batch rather than per message per layer.
- Redesign options:
  - Intrusive "remaining readers" counter set at publish time: still atomic, but one decrement per consumer, no per-layer copies.
  - Owner-side reclamation: consumers report "done with slot N" over their existing queues; the owner recycles the slot.
  - Epochs/watermarks: consumers publish progress; everything older than the minimum is reclaimable.
- ❌ Common wrong answer: "Raw pointers cause double deletes." Not if they are explicitly non-owning; the risk is use-after-free, not double free.
- ✅ What a strong answer adds: "measure first"; a custom counter is not automatically faster than `shared_ptr`, the win comes from fewer ownership operations.

**Key takeaway:** Fix the ownership model, not the pointer type: one owner, non-owning readers, explicit reclamation.

---

#### Q14: Which thread runs the destructor of a `shared_ptr`-managed object, and why does it matter in low-latency code?
**Difficulty:** #intermediate
**Category:** #concurrency #performance
**Concepts:** #destructor_thread #tail_latency #retire_list

**Answer:**
Whichever thread performs the decrement that brings the strong count to zero, at that moment, inline. With snapshots shared across threads, that is often a reader on a hot path, which then pays for destroying and freeing an old (possibly large) object.

**Explanation:**
- Verified: a reader thread holding the last copy of v1 printed `~Snapshot v1 on thread reader` when it reset its copy.
- Consequences:
  - Unpredictable latency spikes on whichever thread happens to be last.
  - Destructors running under a lock if the last reference is dropped inside a critical section.
  - Destructors running on threads that must not block or allocate (real-time, signal-safe contexts).
- Mitigations:
  - Move the old pointer out of the critical section and destroy it after unlocking.
  - A retire list on a background or writer thread: keep retired snapshots and free those whose `use_count()` is 1. Reliable here because no new owners of a retired snapshot can appear.
  - A custom deleter that pushes the pointer onto a deferred-free queue.
- ❌ Common wrong answer: "The thread that created the object destroys it." Creation and destruction threads are unrelated.
- ✅ What a strong answer adds: the same applies to `weak_ptr`: the last `weak_ptr` (or owner) frees the control block on its own thread.

**Key takeaway:** Last releaser destroys, inline; plan where that happens.

---

#### Q15: Can you use `use_count()` or `unique()` to decide whether you may mutate the object without locking?
**Difficulty:** #intermediate
**Category:** #concurrency #smart_pointers
**Concepts:** #use_count #weak_ptr_lock #check_then_act

**Answer:**
No, in general. `use_count()` is a momentary (relaxed) read of a value other threads may change immediately afterwards; another thread can create a new owner via a copy or `weak_ptr::lock()` right after you saw 1. `unique()` was deprecated in C++17 and removed in C++20 for this reason.

**Explanation:**
- Check-then-act on a shared counter is a classic TOCTOU race.
- Safe only when you can prove no one else can create an owner: no other `shared_ptr` copies anywhere and no `weak_ptr`s to the object (for example a retired snapshot only the retire list holds).
- Use `use_count()` for logging, debugging and tests.
- ❌ Common wrong answer: "`use_count()` is atomic, so its result is reliable." Reading atomically does not stop the value from changing a nanosecond later.
- ✅ What a strong answer adds: copy-on-write strings were abandoned in C++11 partly because of this "am I the only owner?" race.

**Key takeaway:** `use_count()` is a snapshot of a moving number; never base exclusivity on it.

---

#### Q16: What is wrong with passing a `shared_ptr` to a new thread by reference?
**Difficulty:** #beginner
**Category:** #concurrency #lifetime
**Concepts:** #lambda_capture #thread_start #ownership_transfer

**Answer:**
The thread then shares the caller's handle instead of owning a copy. If the caller resets or reassigns that handle (or the variable goes out of scope) while the thread uses it, that is a data race on the handle and possibly use-after-free. Capture or pass the `shared_ptr` by value (or move it in) so the thread has its own owner.

**Explanation:**
```cpp
auto job = std::make_shared<Job>();
std::thread t([&job] { job->run(); });   // reference to main's handle
job.reset();                              // race with job->run(): UB
```
- Fix: `std::thread t([job] { job->run(); });` or `[job = std::move(job)]` if main no longer needs it.
- `std::thread`'s constructor copies its arguments into the new thread's storage, so `std::thread t(run_job, job);` is already by value; `std::ref(job)` reintroduces the problem.
- Same for async callbacks, timers and queued tasks: anything that runs later must own what it uses (or hold a `weak_ptr`, topic 09).
- ❌ Common wrong answer: "The thread holds a reference to a `shared_ptr`, and a `shared_ptr` keeps the object alive." Only an owned copy keeps it alive.
- ✅ What a strong answer adds: the copy is made in the parent thread, before the child starts, so it is not itself a concurrent access.

**Key takeaway:** Give each thread its own `shared_ptr`; never share the handle by reference across threads.
