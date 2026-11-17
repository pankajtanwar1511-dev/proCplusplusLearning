## TOPIC: std::atomic and Compare-and-Swap

### INTERVIEW_QA: Interview Questions with Detailed Answers

#### Q1: What does std::atomic<int> guarantee that a plain int does not?
**Difficulty:** #beginner
**Category:** #concurrency #atomics
**Concepts:** #data_race #atomicity #modification_order

**Answer:**
Concurrent access to a std::atomic is not a data race, every operation is indivisible (no torn values, no lost read-modify-write updates), and all threads agree on one modification order for that object. Ordering of other memory is a separate knob: the memory_order argument.

**Explanation:**
- Plain `int` accessed by two threads with at least one write and no synchronization is a **data race**, which is undefined behaviour, even if the CPU happens to load and store `int` atomically.
- `std::atomic<int>` makes every access well-defined:
  - a load returns a value that some store actually wrote (never half of one),
  - RMWs (`fetch_add`, `++`, `exchange`, CAS) never lose an update,
  - each atomic object has a single total order of modifications that every thread observes consistently.
- Three separate ideas: **atomicity** (this answer), **modification order** (per object), **ordering/synchronization** of other data (topic 06).
- ❌ Common wrong answer: "It makes the variable thread-safe." Only each individual operation is atomic; a sequence of operations or several variables are not protected as a unit.
- ✅ What a strong answer adds: the default order is `seq_cst`; `std::atomic<T>` is not guaranteed lock-free; the guarantee is a C++ contract that the implementation satisfies with locked instructions and cache coherence, not "the cache gets flushed".

**Key takeaway:** Atomic = no data race + indivisible operations + one modification order per object; it is not a transaction.

---

#### Q2: Given std::atomic<int> counter, is ++counter atomic? What about counter = counter + 1?
**Difficulty:** #beginner
**Category:** #concurrency #atomics
**Concepts:** #read_modify_write #lost_update #operator_overloads

**Answer:**
++counter is one atomic read-modify-write (same as fetch_add(1)) and never loses an update. counter = counter + 1 is an atomic load, an addition, then a separate atomic store: no data race, but two threads can both read 5 and both write 6.

**Explanation:**
- `std::atomic<int>` overloads `++`, `--`, `+=`, `-=`, `&=`, `|=`, `^=` as RMW operations.
- `counter = counter + 1` uses `operator int()` (a load) and `operator=(int)` (a store). The expression has a gap.
- Two threads incrementing 1000 times each with `++counter` always end at 2000.
- ❌ Common wrong answer: "`++counter` is not atomic, only load and store are." For `std::atomic`, all the listed operators are atomic RMWs.
- ❌ Second common wrong answer: "`counter = counter + 1` is a data race / UB." It is not: both halves are atomic. It is a race **condition** (lost updates), not a **data race**.
- ✅ What a strong answer adds:
  - Operators return a **value**, not a reference (`++x` returns the new value, `x++` the old one).
  - Signed atomic overflow wraps with no UB.
  - On x86-64 GCC, `++counter` with an unused result compiles to `lock add`; with a used result, `lock xadd`.

**Key takeaway:** `x += 1` is one atomic step; `x = x + 1` is two atomic steps with a gap.

---

#### Q3: Is incrementing with a separate load and store equivalent to `fetch_add(1)`?
**Difficulty:** #beginner
**Category:** #concurrency #atomics
**Concepts:** #lost_update #read_modify_write #race_condition

```cpp
int v = counter.load();
counter.store(v + 1);

// versus
counter.fetch_add(1);
```

**Answer:**
No. Another thread can modify counter between the load and the store, and the store then overwrites that update with a stale value. fetch_add performs the read, the add and the write as one indivisible operation, so no increment is lost.

**Explanation:**
- Interleaving with two threads:
```text
T1: load -> 0        T2: load -> 0
T1: store 1          T2: store 1      final 1, expected 2
```
- With N threads doing many iterations the final value can be far below the expected total (in a test with 4 threads x 200000, about half was lost). The theoretical minimum for 2 threads doing k iterations each is 2.
- ❌ Common wrong answer: "Because the local variable `v` is not atomic." The local is private to the thread and needs no protection. The problem is that the **read-modify-write sequence** is not one atomic operation.
- ✅ What a strong answer adds: this is exactly why `fetch_add`, `fetch_sub`, `exchange` and `compare_exchange` exist; when no dedicated RMW exists, a CAS loop turns load/compute/store into an atomic update.

**Key takeaway:** Two atomic operations do not make one atomic operation; the gap between them is the bug.

---

#### Q4: While one thread is doing fetch_add on an atomic, can another thread load it into a register?
**Difficulty:** #intermediate
**Category:** #concurrency #atomics
**Concepts:** #atomicity #snapshot #cache_coherence

**Answer:**
Yes. Any thread can load the atomic at any time and gets a value from the object's modification order, either before or after the fetch_add, never a torn one. The loaded copy is a private snapshot that may be stale immediately; atomicity does not block readers.

**Explanation:**
- Atomicity means the RMW is indivisible relative to **other operations on that atomic**: a load sees the value before or after it, and a concurrent RMW cannot base its result on a value already consumed by another RMW.
- Registers are not coherent. If thread B loaded 10 into a register and thread A then incremented to 11, B's register still says 10. That is fine; B's copy is just a local value.
- What prevents lost updates is that two **RMWs** each operate on the latest value in modification order (hardware: the core must own the cache line exclusively during a locked RMW).
- ❌ Common wrong answer: "The other core cannot load the atomic variable into its register while it is being modified." Readers are never excluded.
- ✅ What a strong answer adds: the contract is atomicity plus modification order; the mechanism on x86 is a `lock`-prefixed instruction holding the cache line in M/E state for the duration, not a global lock, and unrelated cores keep running.

**Key takeaway:** Atomics prevent torn and lost operations on the object, not other threads from reading it.

---

#### Q5: With memory_order_relaxed, can a load ever see a torn value? Is the reader guaranteed to see the writer's latest store?
**Difficulty:** #intermediate
**Category:** #concurrency #atomics
**Concepts:** #memory_order_relaxed #torn_read #atomicity

**Answer:**
It can never be torn: atomicity holds for every memory order, including relaxed. But relaxed creates no synchronization: the reader is not guaranteed to see the latest store at that moment, and it says nothing about other memory written before the store.

**Explanation:**
- Torn read = seeing some bytes from the old value and some from the new. `std::atomic<T>` rules this out for every order.
- Memory order controls **ordering and synchronization**, not atomicity. Treat them as independent questions.
- A relaxed load returns some value from the modification order that is not older than what this thread already saw (coherence). Implementations make stores visible in finite time, but a particular load may still return an older value.
- If the writer also wrote non-atomic `data` before the relaxed store of `ready`, the reader seeing `ready == true` does **not** make reading `data` safe (data race). That needs release/acquire (topic 06).
- ❌ Common wrong answer: "Atomic works the same in any memory order, so relaxed also guarantees I see the latest value and everything before it." Atomicity yes; visibility of other data no.
- ❌ Another wrong answer: "Relaxed is unsafe because it can tear." It cannot.
- ✅ What a strong answer adds: plain non-atomic `int64_t` on 32-bit platforms, or misaligned data, can genuinely tear; that is one reason plain shared variables are not an option.

**Key takeaway:** Memory order never affects whether a single atomic operation is atomic.

---

#### Q6: Why does a simple bool stop flag need to be `std::atomic<bool>`?
**Difficulty:** #intermediate
**Category:** #concurrency #atomics
**Concepts:** #data_race #undefined_behaviour #compiler_optimization

- A colleague argues: "It's just a bool stop flag, and the CPU writes a bool atomically."

**Answer:**
Because concurrent unsynchronized read and write of a plain bool is a data race, which is undefined behaviour regardless of what the CPU does. The compiler may assume no other thread changes it and hoist the load out of the loop, so the worker can spin forever.

**Explanation:**
- The C++ rule: same memory location, two threads, at least one write, no synchronization, not atomic: **data race, UB**.
- Concrete failure (verified with GCC 11 at `-O2`): `while (running) { ++work; }` is compiled as "read `running` once, then loop forever". The program hangs; at `-O0` it terminates. ThreadSanitizer reports the data race.
- `std::atomic<bool> running{true};` tells the compiler the location is shared: every iteration performs a real atomic load.
- For a pure stop flag that publishes no other data, `relaxed` is enough. Join the worker before destroying what it uses (`join()` provides the synchronization).
- ❌ Common wrong answer: "After one or two iterations it will see `false`, so a plain bool is fine." There is no such guarantee; the loop may never re-read it.
- ❌ Another wrong answer: "Use `volatile bool`." `volatile` forces re-reads in practice but is still a data race in C++ and gives no ordering.
- ✅ What a strong answer adds: hardware atomicity of a load/store is not the same as C++ synchronization; the language model is what the optimizer reasons about.

**Key takeaway:** Any variable written by one thread and read by another needs an atomic or a lock, even a bool.

---

#### Q7: What does compare_exchange_strong(expected, desired) do, and what happens to expected when it fails?
**Difficulty:** #beginner
**Category:** #concurrency #atomics
**Concepts:** #compare_and_swap #expected_update #cas

**Answer:**
Atomically: if the current value equals expected, it stores desired and returns true. Otherwise it returns false, leaves the atomic unchanged, and writes the current value into expected (passed by reference). Example: value 15, expected 10, desired 20 gives false, value 15, expected 15.

**Explanation:**
- Pseudocode of the single atomic step:
```text
if (current == expected) { current = desired; return true; }
else                     { expected = current; return false; }
```
- The update of `expected` is what makes retry loops cheap: no extra `load()` is needed before the next attempt.
- Comparison is bitwise (value representation): for `double`, `+0.0` vs `-0.0` fail to match even though `==` says equal.
```cpp
#include <atomic>
#include <cassert>
int main() {
    std::atomic<int> v{15};
    int expected = 10;
    bool ok = v.compare_exchange_strong(expected, 20);
    assert(!ok && v == 15 && expected == 15);
}
```
- ❌ Common wrong answer: "On failure nothing changes." The atomic does not change, but `expected` does.
- ✅ What a strong answer adds: do not reuse `expected` after a failed CAS as "the original value" (logging, rollback); it now holds the observed current value.

**Key takeaway:** CAS failure returns false and refreshes `expected` with what is actually there.

---

#### Q8: In a CAS increment loop, why is the while loop necessary?
**Difficulty:** #beginner
**Category:** #concurrency #atomics
**Concepts:** #cas_loop #spurious_failure #contention

**Answer:**
Two reasons: another thread may have changed the value since we read it, so the CAS fails and we must retry from the refreshed expected; and compare_exchange_weak may fail spuriously even when the values match. The loop repeats until our CAS wins against the value we based desired on.

**Explanation:**
```cpp
#include <atomic>
std::atomic<int> counter{0};
void increment() {
    int expected = counter.load();
    while (!counter.compare_exchange_weak(expected, expected + 1)) {
        // expected now holds the current value; desired is recomputed
    }
}
int main() { increment(); return counter.load() == 1 ? 0 : 1; }
```
- Walkthrough: counter 5; A and B both read 5. A's CAS 5 to 6 succeeds. B's CAS fails, `expected` becomes 6, retry CAS 6 to 7 succeeds.
- `expected + 1` is evaluated on each call, so `desired` follows the refreshed `expected`. Computing `desired` once before the loop is a bug: after a failure it would write a stale value (the counter can even go backwards).
- ❌ Common wrong answer: "The loop is only for spurious failures." Contention is the main reason; spurious failure is the second.
- ✅ What a strong answer adds: this pattern is the general recipe for any atomic `x = f(x)`; for a plain increment prefer `fetch_add`, which needs no retry.

**Key takeaway:** The loop handles both competing writers and spurious failure; always recompute `desired` from the fresh `expected`.

---

#### Q9: What is the difference between compare_exchange_weak and compare_exchange_strong, and when do you pick each?
**Difficulty:** #intermediate
**Category:** #concurrency #atomics
**Concepts:** #compare_exchange_weak #spurious_failure #ll_sc

**Answer:**
weak may fail spuriously (return false although current == expected); strong fails only when the values really differ. Use weak inside a retry loop that recomputes desired anyway; use strong for a one-shot decision where a false failure would be wrong or a retry is expensive.

**Explanation:**
- Why spurious failure exists: LL/SC architectures (ARM without LSE `ldxr/stxr`, POWER, RISC-V `lr/sc`) lose the reservation on an interrupt, context switch, cache-line eviction, or a write to a neighbouring variable. `weak` maps to one LL/SC attempt; `strong` must loop internally until it gets a real answer.
- On x86-64 both compile to the same `lock cmpxchg`; there is no spurious failure and no speed difference. (ARMv8.1 LSE also has a native `cas` instruction.)
- One-shot example: "exactly one thread claims initialization": `if (state.compare_exchange_strong(e, 1)) init();`. With `weak`, every thread could fail and nobody initializes.
- ❌ Common wrong answer: "weak is faster, strong is slower." Not guaranteed; identical on x86, potentially slightly cheaper on LL/SC in a loop because it avoids a nested loop.
- ❌ Another imprecise answer: "Use strong when you need a single snapshot." The real distinction is: with strong, a failure means the value actually changed.
- ✅ What a strong answer adds: on a spurious failure, `expected` is rewritten with the current value, which equals what it already held, so the loop just retries.

**Key takeaway:** Weak in loops, strong for one-shot decisions; performance difference is architecture-specific.

---

#### Q10: Is a CAS retry loop wait-free?
**Difficulty:** #intermediate
**Category:** #concurrency #lock_free
**Concepts:** #lock_free #wait_free #progress_guarantee

**Answer:**
No. It is lock-free: whenever a CAS fails, some other thread's CAS succeeded, so the system makes progress. But a particular thread can lose every race and retry without bound, so there is no per-thread step bound, which wait-free requires.

**Explanation:**
- Lock-free: system-wide progress; individual starvation possible.
- Wait-free: every thread finishes its operation within a bounded number of its own steps.
- The CAS loop is lock-free only if the atomic itself is lock-free (`is_always_lock_free`).
- `fetch_add` on x86 is a single `lock xadd` with no retry, so it is commonly treated as wait-free; on LL/SC CPUs without LSE it is itself a retry loop. The standard does not promise wait-freedom for any operation.
- ❌ Common wrong answer: "CAS is wait-free because no thread waits on a lock." Not holding a lock is not the definition; the progress guarantee is.
- ✅ What a strong answer adds: under heavy contention a CAS loop burns CPU and generates cache-line traffic; exponential back-off or a different design (sharding, `fetch_add`) helps. Topic 08 covers progress guarantees in depth.

**Key takeaway:** CAS loop = lock-free, not wait-free.

---

#### Q11: When would you choose std::atomic over std::mutex, and when is a mutex the better choice?
**Difficulty:** #intermediate
**Category:** #concurrency #design
**Concepts:** #atomic_vs_mutex #invariant #critical_section

**Answer:**
Use an atomic when the shared state is one independent value and the update is a single RMW or a short CAS loop (counter, flag, pointer swap). Use a mutex when an invariant spans several variables or several steps, because separate atomics cannot make the compound operation atomic.

**Explanation:**
- Mutex example: `if (active && balance >= amt) balance -= amt;`. Making `active` and `balance` separate atomics still allows two threads to pass the check and overdraw.
- A single CAS loop on `balance` that re-checks `expected >= amt` works only because the invariant then lives in one word.
- Think in terms of **what is protected**: an atomic protects one operation on one object; a mutex protects a critical section over any amount of state.
- ❌ Common wrong answer: "Atomic is a lightweight mutex, always use it when possible." It cannot protect multi-variable invariants, and lock-free multi-step logic is notoriously error-prone.
- ✅ What a strong answer adds: choose by correctness requirement first, then contention and latency profile, then measure. Mutexes block waiters (no wasted CPU); atomics never block but can spin and bounce cache lines.

**Key takeaway:** Atomic for one value, mutex for an invariant.

---

#### Q12: Is an atomic increment always faster than a mutex-protected increment? Does locking a mutex always enter the kernel?
**Difficulty:** #intermediate
**Category:** #concurrency #performance
**Concepts:** #futex #contention #cache_line_bouncing

**Answer:**
Usually faster for a single counter, but not always. An uncontended Linux mutex stays in user space (one atomic CAS to lock, one atomic RMW to unlock, futex syscall only when contended). Under contention both pay for cache-line transfers; atomics avoid sleeping but are not contention-free.

**Explanation:**
- glibc `pthread_mutex_lock` fast path: one `lock cmpxchg`. Unlock: one atomic RMW, plus a `futex(FUTEX_WAKE)` syscall only if there are waiters.
- So an uncontended mutex increment is roughly two atomic RMWs plus the increment; an atomic increment is one RMW.
- Contended case:
  - Atomic: every `fetch_add` needs exclusive ownership of the line; with many cores the line ping-pongs and throughput can fall as threads are added (measured: 4 threads on one counter about 7x slower than per-thread padded counters).
  - Mutex: waiters may spin briefly, then sleep (context switches, scheduler latency).
- ❌ Common wrong answer: "Mutex always does a kernel transition, atomic is handled at application level, so atomic is always faster." Both claims are wrong.
- ✅ What a strong answer adds: the real fix for a hot counter is to remove sharing (per-thread or per-core counters, batching), not to pick a different primitive.

**Key takeaway:** Contention, not the primitive, dominates the cost; uncontended mutexes are cheap.

---

#### Q13: Is std::atomic<T> always lock-free? How do you check?
**Difficulty:** #intermediate
**Category:** #concurrency #atomics
**Concepts:** #is_lock_free #is_always_lock_free #atomic_flag

**Answer:**
No. Only std::atomic_flag is guaranteed lock-free; other specializations may use an internal lock. Check at runtime with a.is_lock_free(), at compile time with std::atomic<T>::is_always_lock_free (C++17), or with the ATOMIC_xxx_LOCK_FREE macros (0, 1, 2).

**Explanation:**
- Typical x86-64 GCC results: `int`, pointers, 8-byte structs are always lock-free; a 24-byte struct is not; 16-byte types report `false` (operations go through `libatomic`, link with `-latomic`).
- When not lock-free, the implementation still provides full atomic semantics, typically with a lock taken from a hashed lock table.
- Why it matters:
  - A "lock-free algorithm" built on a non-lock-free atomic is not lock-free.
  - Only lock-free atomics are address-free, so only they are safe in memory shared between processes.
  - Not lock-free means not async-signal-safe.
- Guard design assumptions: `static_assert(std::atomic<Node*>::is_always_lock_free);`
- ❌ Common wrong answer: "Atomics are generally lock-free; use `is_atomic_lock_free()`." There is no such function, and "generally" does not hold for arbitrary `T`.
- ✅ What a strong answer adds: "atomic" describes indivisibility; "lock-free" is a progress guarantee. They are different properties.

**Key takeaway:** Atomic does not imply lock-free; `static_assert(is_always_lock_free)` when it matters.

---

#### Q14: What is std::atomic_flag and why does it exist when std::atomic<bool> is available?
**Difficulty:** #intermediate
**Category:** #concurrency #atomics
**Concepts:** #atomic_flag #spinlock #lock_free

**Answer:**
atomic_flag is a minimal boolean atomic that is the only type the standard guarantees to be lock-free, so it can be the primitive that implements everything else (including locks inside non-lock-free atomics). It supports test_and_set and clear, plus test, wait and notify since C++20.

**Explanation:**
- Pre-C++20: initialize with `ATOMIC_FLAG_INIT`; no way to read without setting.
- C++20: default constructor initializes to clear; `test()` reads without modifying (enables test-and-test-and-set), `wait`/`notify_*` allow blocking.
- Classic use: a spinlock.
```cpp
#include <atomic>
struct SpinLock {
    std::atomic_flag f;
    void lock()   { while (f.test_and_set()) while (f.test()) {} }
    void unlock() { f.clear(); }
};
int main() { SpinLock s; s.lock(); s.unlock(); }
```
- ❌ Common wrong answer: "`atomic<bool>` and `atomic_flag` are the same thing." `atomic<bool>` is not guaranteed lock-free (though it is on all mainstream platforms) and has load/store/exchange/CAS; `atomic_flag` is guaranteed lock-free with a minimal interface.
- ✅ What a strong answer adds: spinning on `test()` (reads) instead of `test_and_set()` (RMW) keeps the cache line shared while waiting and greatly reduces coherence traffic.

**Key takeaway:** `atomic_flag` is the guaranteed lock-free building block.

---

#### Q15: What does fetch_add compile to on x86-64, and why does it cost more than a plain increment?
**Difficulty:** #advanced
**Category:** #concurrency #hardware
**Concepts:** #lock_prefix #cache_line_ownership #read_for_ownership

**Answer:**
lock xadd (or lock add if the result is unused). The lock prefix makes the core hold the cache line exclusively for the whole read-modify-write and acts as a full memory barrier. If another core owns the line, it must be transferred first, which is the expensive part under contention.

**Explanation:**
- Verified GCC 11 `-O2` codegen for `std::atomic<int>`:

| C++ (seq_cst) | x86-64 |
|---|---|
| `fetch_add(1)` | `lock xadd` |
| `fetch_add(1)`, result unused | `lock add` |
| `fetch_or(m)`, result used | `lock cmpxchg` loop |
| `exchange(v)`, `store(v)` | `xchg` |
| `load()` | `mov` |

- Cost components:
  - Read-for-ownership: other cores' copies are invalidated (MESI-family protocol).
  - Cache locking: the line is held for the duration; other cores are not stopped, the bus is not locked for aligned data.
  - Full barrier: the store buffer must drain before the locked op completes, so it also serializes this core's memory operations.
- Order of magnitude: about 10 to 20+ cycles uncontended; with contention, each operation may wait for a cross-core line transfer (tens of ns, more across sockets).
- ❌ Common wrong answer: "The lock prefix locks the whole bus/RAM and other cores stop." Modern CPUs lock only the cache line; unrelated work continues.
- ✅ What a strong answer adds: `fetch_or` returning the old value has no single x86 instruction, so it becomes a CAS loop (not wait-free on x86); if only one bit is needed, compilers may use `lock bts`.

**Key takeaway:** Atomic RMW cost is cache-line ownership plus a full barrier; contention multiplies it.

---

#### Q16: Is it accurate to say std::atomic works by flushing the store buffer, or because MESI makes the cache line exclusive?
**Difficulty:** #advanced
**Category:** #concurrency #memory_model
**Concepts:** #store_buffer #mesi #contract_vs_mechanism

**Answer:**
No. Those are possible hardware mechanisms, not the definition. C++ specifies a contract (atomicity, a modification order per object, and ordering per memory_order); the compiler and CPU choose instructions, fences and coherence actions to satisfy it, and they differ by architecture and order.

**Explanation:**
- Counter-examples to "atomic = store buffer flush":
  - A `relaxed` or `release` store on x86 is a plain `mov`; nothing is flushed.
  - A `seq_cst` store on x86 is `xchg`, which does drain the store buffer; on ARMv8 it is `stlr`.
- Counter-example to "atomic = MESI": coherence alone keeps single-location reads/writes consistent, but it does not make load-add-store indivisible; that requires a locked instruction or LL/SC.
- Modification order does not mean the newest value is instantly in every core's register.
- ❌ Common wrong answer: "Atomic flushes the cache and store buffer so other cores see the value." It mixes implementation with specification and is wrong for relaxed/release operations.
- ✅ What a strong answer adds: answer at the C++ level first (atomicity, modification order, happens-before), then say "on x86 this compiles to `lock xadd`, which holds the line in M state", clearly labelled as implementation.

**Key takeaway:** Explain the contract first, the hardware second, and never confuse the two.

---

#### Q17: Many threads increment one std::atomic<long> metrics counter and it does not scale. Why, and how would you fix it?
**Difficulty:** #advanced
**Category:** #concurrency #performance
**Concepts:** #contention #false_sharing #sharding

**Answer:**
Every fetch_add needs exclusive ownership of the same cache line, so the line ping-pongs between cores and operations serialize on line transfers. Fix by removing sharing: per-thread or per-core counters on separate cache lines (alignas(64)), summed on read, or batching local increments.

**Explanation:**
- Measured on a 4-thread run: one hot counter took about 7x longer than 4 padded per-thread counters doing the same total increments.
- Sharded design:
```cpp
#include <atomic>
#include <cstddef>
struct alignas(64) Slot { std::atomic<long> v{0}; };
struct ShardedCounter {
    Slot slots[16];
    void add(std::size_t tid) { slots[tid % 16].v.fetch_add(1, std::memory_order_relaxed); }
    long read() const { long s = 0; for (auto& x : slots) s += x.v.load(std::memory_order_relaxed); return s; }
};
int main() { ShardedCounter c; c.add(0); c.add(1); return c.read() == 2 ? 0 : 1; }
```
- Padding matters: unpadded slots in one array share lines and suffer **false sharing**, which is just as bad.
- `relaxed` is fine for a statistics counter that publishes no other data (topic 06).
- ❌ Common wrong answer: "Atomics are lock-free, so there is no contention." Contention lives at the cache-line level.
- ❌ Another wrong answer: "Atomics cause false sharing." False sharing is independent hot data in one line; atomics only make the cost visible.
- ✅ What a strong answer adds: the read becomes a non-instantaneous sum (fine for metrics); `std::hardware_destructive_interference_size` (C++17) names the line size portably where supported.

**Key takeaway:** Scale writes by not sharing them; pad per-thread state to separate cache lines.

---

#### Q18: Which types can you put in std::atomic<T>? Can you write std::atomic<std::string> or copy an atomic?
**Difficulty:** #intermediate
**Category:** #concurrency #atomics
**Concepts:** #trivially_copyable #atomic_requirements #copy_semantics

**Answer:**
T must be trivially copyable (and copy/move constructible and assignable), so std::atomic<std::string> does not compile. std::atomic itself is neither copyable nor movable; std::atomic<int> b = a; is ill-formed. Use b(a.load()) to copy the value.

**Explanation:**
- Built-in specializations: integral types, pointers, `bool`, floating point (with `fetch_add/fetch_sub` since C++20), plus `std::shared_ptr` / `std::weak_ptr` (C++20).
- User structs work if trivially copyable; whether they are lock-free depends on size and alignment.
- Why not copyable: a copy would be a load from one object and a store to another, two operations that cannot be one atomic step; deleting the copy constructor prevents pretending otherwise.
- `std::atomic<int> a = 0;` compiles since C++17 (guaranteed elision).
- C++20: `std::atomic<int> x;` value-initializes to 0; earlier standards left it uninitialized.
- ❌ Common wrong answer: "Any type can be made atomic." Non-trivially-copyable types fail a `static_assert`.
- ✅ What a strong answer adds: CAS on floating point compares bits (`-0.0` vs `+0.0` mismatch, NaN can match), and padding in user structs matters for CAS on pre-C++20 implementations.

**Key takeaway:** `std::atomic<T>` needs trivially copyable `T`, and the atomic object itself is non-copyable.

---

#### Q19: How would you implement an atomic "update maximum" operation, and what mistakes are common?
**Difficulty:** #advanced
**Category:** #concurrency #atomics
**Concepts:** #cas_loop #fetch_max #early_exit

**Answer:**
Use a CAS loop: load expected; while expected < v, try compare_exchange_weak(expected, v); on failure expected refreshes and the condition is re-checked. Stop as soon as the stored value is already >= v, so no write happens. C++26 adds fetch_max for integers.

**Explanation:**
```cpp
#include <atomic>
int fetch_max(std::atomic<int>& a, int v) {
    int expected = a.load();
    while (expected < v && !a.compare_exchange_weak(expected, v)) {}
    return expected;                       // previous value
}
int main() { std::atomic<int> m{3}; fetch_max(m, 7); fetch_max(m, 5); return m == 7 ? 0 : 1; }
```
- Common mistakes:
  - Checking the condition once before the loop: after a failed CAS the new value might already be larger, yet the loop overwrites it with a smaller `v`.
  - Computing `desired` outside the loop when it depends on `expected`.
  - Using `load` then `store` ("if (v > a.load()) a.store(v)"): two threads with 7 and 9 can end with 7.
  - Side effects inside the loop body (they run once per attempt).
- ❌ Common wrong answer: `if (v > m.load()) m.store(v);` "because both operations are atomic." Check-then-act across two operations has a window.
- ✅ What a strong answer adds: the early exit means readers of an already-large max never take the line exclusively, which matters when the max rarely changes.

**Key takeaway:** CAS loop with the condition re-evaluated on every refreshed `expected`.

---

#### Q20: What is std::atomic<std::shared_ptr<T>> for, and is it lock-free?
**Difficulty:** #advanced
**Category:** #concurrency #atomics
**Concepts:** #atomic_shared_ptr #reference_counting #snapshot

**Answer:**
It makes reading and replacing one shared_ptr object from several threads safe (C++20), e.g. readers load a config snapshot while a writer stores a new one. A plain shared_ptr only makes the reference count thread-safe, not the object itself. It is not required to be lock-free and usually is not.

**Explanation:**
- With plain `std::shared_ptr<Config> g;`, one thread doing `g = make_shared<Config>()` while another does `auto c = g;` is a data race: the copy reads the pointer pair while it is being replaced.
- C++20 usage (not compiled here: needs GCC 12+, MSVC 19.27+):
```cpp
std::atomic<std::shared_ptr<const Config>> cfg;
// reader
std::shared_ptr<const Config> snap = cfg.load();   // keeps old config alive while used
// writer
cfg.store(std::make_shared<const Config>(new_values));
```
- Replaces the C++11 free functions `std::atomic_load(&sp)` / `std::atomic_store(&sp, p)`, deprecated in C++20.
- Implementations: libstdc++ uses a lock bit inside the control-block pointer, MSVC a spin lock; `is_lock_free()` is `false`.
- ❌ Common wrong answer: "`shared_ptr` is already thread-safe, so no atomic needed." Only the control block's count is; concurrent access to the same `shared_ptr` instance is not.
- ✅ What a strong answer adds: readers still do an atomic refcount increment per load (a contended cache line for hot configs); RCU or epoch schemes avoid that on the read path (topic 08).

**Key takeaway:** Thread-safe refcount is not thread-safe pointer object; `atomic<shared_ptr>` fixes the latter, usually with a lock.

---

#### Q21: Why is volatile not a substitute for std::atomic in C++?
**Difficulty:** #beginner
**Category:** #concurrency #atomics
**Concepts:** #volatile #data_race #atomicity

**Answer:**
volatile only prevents the compiler from removing or merging accesses; it gives no atomicity (volatile ++ is still load, add, store), no inter-thread ordering, and concurrent access is still a data race. It is for memory-mapped I/O and signal handlers, not threads.

**Explanation:**
- `volatile int c; ++c;` from two threads loses updates and is UB.
- `volatile bool` as a stop flag "works" on many compilers because loads are not hoisted, but the program still has a data race and other data published before the flag is not ordered.
- In Java and C#, `volatile` does imply visibility/ordering; that is a frequent source of confusion for engineers switching languages.
- ❌ Common wrong answer: "`volatile` makes it read from memory every time, so threads see the latest value." Re-reading is not synchronization.
- ✅ What a strong answer adds: C++20 deprecated many compound `volatile` operations (`++`, `+=` on volatile) precisely because people assumed atomicity.

**Key takeaway:** For threads use `std::atomic`; `volatile` is for hardware and signals.

---

#### Q22: What do C++20 atomic wait and notify give you over a spin loop?
**Difficulty:** #advanced
**Category:** #concurrency #atomics
**Concepts:** #atomic_wait #futex #busy_waiting

**Answer:**
x.wait(old) blocks the thread until it observes a value different from old after a notify (it re-checks, so spurious wakeups are hidden), without burning CPU. notify_one/notify_all wake waiters. It is a lightweight futex-style alternative to a mutex plus condition variable for simple state changes.

**Explanation:**
```cpp
#include <atomic>
#include <thread>
int main() {
    std::atomic<int> state{0};
    std::thread t([&] { state.wait(0); });   // sleeps while state == 0
    state.store(1);
    state.notify_one();
    t.join();
}
```
- On Linux, libstdc++ uses a futex for suitable types (directly for 4-byte integers, via a proxy/hashed waiter table otherwise), often after a short spin.
- Comparison is by value representation, like CAS.
- It does not deliver "events": if the value goes 0 to 1 to 0 before the waiter checks, the waiter keeps sleeping (an ABA-style miss). Use it for monotonic or level-style state.
- ❌ Common wrong answer: "`wait` returns on every notify." It returns only once the value differs from `old`.
- ✅ What a strong answer adds: `std::latch`, `std::barrier` and `std::counting_semaphore` in libstdc++ are built on this mechanism.

**Key takeaway:** `wait`/`notify` turn a spin on an atomic into an efficient block, but only observe value changes.
