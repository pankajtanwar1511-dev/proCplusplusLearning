## TOPIC: Memory Ordering and the C++ Memory Model

### THEORY_SECTION: Core Concepts

#### 1. Mental model: two separate questions
- Every `std::atomic` operation answers two different questions:
  - **Atomicity:** "Can several threads touch *this variable* without a data race, torn values or lost updates?"
  - **Memory ordering:** "What does this operation guarantee about *other* memory (usually non-atomic data) around it?"
- Atomicity is always present on a `std::atomic` operation, even with `memory_order_relaxed`. The `memory_order` argument only changes the ordering answer.
- One sentence to remember: **atomic says "this operation on this variable is safe"; memory order says "how this operation relates to operations on other memory".**
- Think in three layers and never mix them in an answer:

| Layer | Vocabulary | Who defines it |
|---|---|---|
| C++ abstract machine | sequenced-before, synchronizes-with, happens-before, modification order, data race | The C++ standard (portable guarantee) |
| Compiler | instruction selection, compiler reordering, compiler barriers | Your toolchain |
| CPU / memory system | store buffers, invalidation queues, MESI, fences (`mfence`, `dmb`), `lock` prefix | The architecture (x86, ARM, POWER) |

- Interview rule: answer at the C++ level first ("release synchronizes-with an acquire that reads its value, which creates happens-before"). Mention store buffers and MESI only as *one possible implementation*, and only if asked.

#### 2. Data race and the relations that prevent it
- **Data race (standard definition):** two accesses to the same memory location, from different threads, at least one is a write, at least one is non-atomic, and neither happens-before the other. Result: **undefined behaviour** for the whole program, not just "a stale value".
- Atomic operations never race with each other, whatever memory order they use.
- The relations you must use precisely:

| Relation | Scope | Created by |
|---|---|---|
| **Sequenced-before** | Within one thread | Program order of evaluations (statement order, `;`, etc.) |
| **Synchronizes-with** | Between two threads | Release op → acquire op that *reads the value written* (or a value from its release sequence); mutex unlock → next lock; thread constructor → thread start; thread end → `join()` return |
| **Happens-before** | Within and across threads | Sequenced-before and synchronizes-with chained together (transitively) |
| **Modification order** | One atomic object | Every atomic object has one total order of all its modifications, agreed on by all threads |

- The canonical chain to say out loud:
  - `data = 42` is **sequenced-before** `ready.store(true, release)`
  - that store **synchronizes-with** `ready.load(acquire)` *if the load reads `true`*
  - the load is **sequenced-before** `read(data)`
  - therefore `data = 42` **happens-before** `read(data)`: no data race, and the read must see 42.
- Execution order is not synchronization: "thread 1 ran first" proves nothing. Only a happens-before edge makes the later read safe.

#### 3. Modification order and coherence
- Each atomic object (one `std::atomic<T>` instance) has **its own** single total modification order containing every store and every RMW (`fetch_add`, `exchange`, successful `compare_exchange`) from **all threads**.
- Loads are **not** part of the modification order; a load *observes* one value from that history.
- There is no combined modification order for `x` and `y`. Two different atomics can be observed "out of order" relative to each other unless you add synchronization.
- Four coherence rules hold for every memory order, including relaxed:

| Rule | Meaning |
|---|---|
| write-write | Two modifications ordered by happens-before appear in that order in the modification order |
| read-read | If a thread's load reads value from modification B, a later load in that thread cannot read a modification earlier than B |
| read-write | A load cannot read a value written by a store that happens-after it |
| write-read | After a thread writes or reads a value, it cannot later read an older value |

- Practical result: per variable, a thread's observations never go backward. If a thread reads `20`, its next relaxed load cannot return the older `10`.
- RMW operations always read the **latest** value in the modification order, which is why `fetch_add` never loses an increment even when relaxed.
- Atomic does **not** mean "every thread instantly sees the newest store". The standard only says implementations *should* make stores visible to loads "within a reasonable amount of time".

#### 4. The six memory orders

| Order | Valid on | Guarantees beyond atomicity | Typical use |
|---|---|---|---|
| `relaxed` | load, store, RMW | Nothing for other memory; only atomicity and per-object coherence | Statistics counters, IDs, a stop flag that publishes no data |
| `consume` | load | Dependency ordering only (data reached through the loaded pointer). Every major compiler promotes it to acquire; discouraged since C++17, deprecated in C++26 | Do not use; write `acquire` |
| `acquire` | load, RMW | No later read/write in this thread may be reordered before it; synchronizes-with a release whose value it reads | Consumer side of publication, lock acquire |
| `release` | store, RMW | No earlier read/write in this thread may be reordered after it; publishes everything sequenced before it | Producer side of publication, lock release |
| `acq_rel` | RMW only | Acquire and release in one RMW | CAS that both claims and publishes, ref-count decrement |
| `seq_cst` (default) | all | Acquire (load) / release (store) / acq_rel (RMW) **plus** one single total order `S` of all `seq_cst` operations on all objects, consistent with each thread's order | Default; required for store-load patterns (Dekker, Peterson, flag pairs) |

- Passing an order that is invalid for the operation is a precondition violation (undefined behaviour): `store(x, acquire)`, `store(x, acq_rel)`, `load(release)`, `load(acq_rel)`. libstdc++ aborts with `-D_GLIBCXX_ASSERTIONS`; a plain build compiles silently.
- `compare_exchange_*(expected, desired, success, failure)`: the failure order is a load, so it cannot be `release` or `acq_rel`.
- Acquire and release are **one-way** barriers ("roach motel"):
  - Operations *before* a release cannot move below it, but operations *after* it may move above it.
  - Operations *after* an acquire cannot move above it, but operations *before* it may move below it.
  - So release + acquire alone never prevents a **store followed by a load** (to different variables) from being reordered. That is exactly the gap `seq_cst` closes.

#### 5. Release sequences and transitivity
- Happens-before is transitive: if T1 publishes to T2 (release/acquire on `a`), and T2 then publishes to T3 (release/acquire on `b`), everything T1 did before its release happens-before T3's reads. T3 never touched `a`.
- **Release sequence:** after a release store `A` on atomic `M`, any chain of RMW operations on `M` (from any thread, even relaxed ones) continues the release sequence. An acquire that reads a value written by one of those RMWs still synchronizes-with `A`.
  - This is why a relaxed `fetch_add` in the middle does not break publication through a counter.
  - C++20 narrowed the rule: a later plain (non-RMW) store by the same thread no longer extends the release sequence.
- An acquire synchronizes-with a release only through the value it actually reads. Reading the initial value, or a value from a different unrelated plain store, gives no synchronization.

#### 6. Fences: `std::atomic_thread_fence`
- A fence is not tied to one variable; it upgrades the ordering of nearby **relaxed atomic** operations.
- Synchronization through fences always needs an atomic object to carry the value:

| Pattern | Producer | Consumer |
|---|---|---|
| fence-fence | `fence(release); flag.store(1, relaxed);` | `if (flag.load(relaxed)) { fence(acquire); use(); }` |
| fence-atomic | `fence(release); flag.store(1, relaxed);` | `flag.load(acquire)` |
| atomic-fence | `flag.store(1, release);` | `flag.load(relaxed); fence(acquire);` |

- Placement matters: the release fence goes **before** the publishing store, the acquire fence goes **after** the load that observed it.
- `atomic_thread_fence(seq_cst)` is the strongest fence and restores store-load ordering between relaxed operations.
- `std::atomic_signal_fence` orders only against a signal handler on the same thread: compiler-only, emits no CPU instruction.
- A fence with no atomic operation around it creates no synchronization at all. "Sprinkle a barrier and it works" is a myth.
- Use fences when one acquire should cover many relaxed loads (for example, only after a loop finds the slot it wants), or when implementing seqlocks and reference counting.

#### 7. Compiler reordering vs CPU reordering, x86 vs ARM
- Two independent sources of reordering, and C++ orders control **both**:
  - **Compiler:** under the as-if rule it may reorder, merge, hoist out of loops or delete non-atomic accesses, assuming no other thread is watching (because a data race would be UB).
  - **CPU:** out-of-order execution, store buffers and invalidation queues make memory operations visible to other cores in an order different from program order.
- A compiler-only barrier (`asm volatile("" ::: "memory")` in GCC/Clang, or `atomic_signal_fence`) stops the compiler but not the CPU. It is not a portable inter-thread tool.
- x86-64 is **TSO** (total store order): the only visible hardware reordering is a store followed by a later load to a different address (store buffer). Loads are not reordered with loads, stores not with stores.
- ARMv8 and POWER are **weakly ordered**: load-load, load-store, store-store and store-load reorderings are all allowed without barriers.
- Typical code generation (verified for x86-64 with GCC 11; ARM is the standard published mapping):

| C++ operation | x86-64 (GCC) | ARMv8 (AArch64) |
|---|---|---|
| load relaxed / acquire / seq_cst | plain `mov` (all three) | `ldr` / `ldar` (or `ldapr`) / `ldar` |
| store relaxed / release | plain `mov` | `str` / `stlr` |
| store seq_cst | `xchg` (or `mov` + `mfence` on older compilers) | `stlr` |
| `fetch_add` (any order) | `lock xadd` | LL/SC loop (`ldxr`/`stxr`) or LSE `ldadd` with `a`/`l` variants |
| `atomic_thread_fence(acq_rel)` | nothing (compiler barrier only) | `dmb ish` |
| `atomic_thread_fence(seq_cst)` | `mfence` or `lock or [rsp], 0` | `dmb ish` |

- Consequence 1: on x86 acquire/release cost nothing at runtime but still restrict the **compiler**. Code with a relaxed flag can "work" on x86 and break on ARM, or break on x86 after the compiler reorders it.
- Consequence 2: on x86 the expensive part of `seq_cst` is the store (a locked instruction that drains the store buffer), which is why `seq_cst` stores are a known hot-path cost in low-latency code.

#### 8. Synchronization you get for free: mutexes, threads, `call_once`, statics
- `mutex.lock()` is an acquire operation; `mutex.unlock()` is a release operation.
- Every mutex has a total order of lock/unlock; each unlock **synchronizes-with** the next successful lock of the same mutex. Everything written inside one critical section happens-before everything in the next one.
- Which thread locks first is **not** decided. If the reader gets the lock first it sees the old value, but there is still **no data race**: a logical race, not UB.
- A condition variable provides waiting and notification; the data visibility comes from the **mutex** it is used with.
- `std::thread` constructor completion synchronizes-with the start of the thread function; thread completion synchronizes-with the return of `join()`. That is why main can read results after `join()` without atomics.
- `std::call_once` and function-local `static` initialization (C++11 "magic statics") are thread-safe and publish the initialized object to every caller.
- C++20 `atomic::wait` / `notify_one`: blocking waits on an atomic; ordering still comes from the memory orders of the store and of the load that returns.

#### 9. `volatile` is not a threading tool
- `volatile` tells the compiler: "accesses to this object are observable side effects; actually perform every read and write, do not cache or remove them".
- Valid uses: memory-mapped hardware registers (MMIO), `volatile std::sig_atomic_t` flags written by signal handlers, locals that must survive `longjmp`.
- What `volatile` does **not** provide:
  - ❌ atomicity (a `volatile int` increment is still read, add, write)
  - ❌ freedom from data races (a race on a `volatile` object is still UB)
  - ❌ any happens-before or release/acquire semantics
  - ❌ CPU ordering: the compiler keeps volatile accesses in order relative to each other, but non-volatile accesses can move across them and the CPU can still reorder.
- MSVC's `/volatile:ms` (default on x86/x64, not on ARM) gives volatile acquire/release semantics. This is a non-portable extension; never rely on it in interview answers or portable code.
- Rule: hardware or signal handler → `volatile`; another C++ thread → `std::atomic`, a mutex, or another synchronization primitive.

#### 10. Misconceptions to unlearn
- ❌ "Release flushes the store buffer; acquire invalidates stale cache lines." ✅ Those are possible implementation effects. The C++ guarantee is a synchronizes-with edge when the acquire reads the released value.
- ❌ "Relaxed flushes or commits the store buffer." ✅ Relaxed adds no ordering at all; it is still fully atomic.
- ❌ "`seq_cst` stalls the pipeline / flushes every cache." ✅ It adds a single total order of `seq_cst` operations; its cost depends on the architecture (on x86, mostly the store).
- ❌ "Atomic means one indivisible CPU instruction." ✅ C++ only promises atomic semantics; the implementation may use a lock (`is_lock_free()` tells you, see topic 05).
- ❌ "Atomic means every thread immediately sees the newest value." ✅ Loads observe some value allowed by coherence and ordering rules.
- ❌ "A relaxed publication might just print 0." ✅ With non-atomic `data` it is a data race: undefined behaviour.
- ❌ "Only `data` is the problem; a plain `bool ready` flag is fine." ✅ The flag itself races if it is not atomic.
- ❌ "Making the consumer load `acquire` fixes a relaxed store." ✅ Both sides are required: release on the store, acquire on the load.
- ❌ "Acquire waits for the release." ✅ Acquire never waits; a load that runs first just reads the old value and synchronizes with nothing.
- ❌ "Modification order is per thread" or "one order for all atomics." ✅ One order **per atomic object**, across all threads.
- ❌ "Relaxed is unsafe." ✅ Relaxed is exactly right for counters and flags that publish nothing.
- ❌ "Every two `seq_cst` operations synchronize." ✅ They share one total order; synchronizes-with still needs a store whose value a load reads.
- ❌ "`seq_cst` decides which thread runs first." ✅ It constrains allowed outcomes, not scheduling.
- ❌ "Any memory barrier makes the code correct." ✅ You need a matched pair (release side and acquire side) on the same atomic object.
- ❌ "`volatile` means don't reorder, so it works for flags between threads." ✅ It gives no atomicity and no inter-thread ordering.
- ❌ "MESI is the definition of release/acquire" and ❌ "MESI is unrelated." ✅ Cache coherence is part of how hardware implements the guarantees, but it is not the guarantee.

### EDGE_CASES: Traps and Misconceptions

#### Edge Case 1: Acquire on one side only gives you nothing
- What people assume: "the consumer uses `acquire`, so it will see the producer's data".
- What actually happens: an acquire synchronizes-with a **release** operation (or a release fence). A relaxed store has no release semantics, so no happens-before edge exists and the non-atomic `data` is raced on: undefined behaviour.
- The same applies in reverse: a release store read by a relaxed load (with no acquire fence after it) publishes nothing.
```cpp
int data = 0;
std::atomic<bool> ready{false};

// Producer
data = 42;
ready.store(true, std::memory_order_relaxed);     // ❌ no release

// Consumer
while (!ready.load(std::memory_order_acquire)) {} // acquire has nothing to pair with
int v = data;                                     // data race: UB
```
- Fix: `release` on the store **and** `acquire` on the load. Changing only one side is the most common half-fix.

#### Edge Case 2: An acquire load that runs before the release store
- What people assume: "acquire waits until the producer releases".
- What actually happens: a load returns whatever value it observes at that point. If it reads the initial value, it synchronizes with nothing; the consumer simply sees "not ready".
- This is correct behaviour, not a bug, provided the consumer only touches the data when the flag says ready.
```cpp
// Consumer runs first
if (ready.load(std::memory_order_acquire)) {   // reads false
    use(data);                                 // not executed: no access, no race
}
// The producer's release store that happens later does not update this old load.
```
- If the consumer must wait, use a loop, C++20 `ready.wait(false)`, or a condition variable.

#### Edge Case 3: Release/acquire does not forbid store-then-load reordering
- What people assume: "acquire/release is strong enough for any flag protocol".
- What actually happens: release keeps earlier operations above it; acquire keeps later operations below it. A release **store** followed by an acquire **load** of a different variable can still be reordered (the store can sit in the store buffer while the load executes).
- Classic store-buffering (Dekker) test, `x = y = 0` initially:
```cpp
// T1                                 // T2
x.store(1, std::memory_order_release); y.store(1, std::memory_order_release);
r1 = y.load(std::memory_order_acquire); r2 = x.load(std::memory_order_acquire);
```
- `r1 == 0 && r2 == 0` is allowed and is observed on real x86 hardware (thousands of times per 200,000 runs in Example 3).
- With `seq_cst` on all four operations it is impossible: all four must fit one total order, and whichever store comes first in that order must be seen by the other thread's later load.
- This is why Peterson's and Dekker's algorithms need `seq_cst` (or `seq_cst` fences).

#### Edge Case 4: Mixing `seq_cst` with weaker orders silently loses the guarantee
- What people assume: "one side uses `seq_cst`, so the protocol is sequentially consistent".
- What actually happens: the single total order covers only `seq_cst` operations. If T1's load in the store-buffering test above is `acquire` instead of `seq_cst`, `r1 == r2 == 0` becomes possible again.
- Also: the default memory order is `seq_cst`, so `flag = true;` and `if (flag)` on a `std::atomic` are `seq_cst`. Optimizing one of them to `relaxed` "for speed" can break a protocol that relied on the total order.

#### Edge Case 5: `volatile` compiles, runs, and is still wrong
- What people assume: "`volatile bool stop` forces a real memory read each iteration, so the worker eventually sees the update; that is all a stop flag needs".
- What actually happens: the program has a data race (UB). In practice on x86 it often "works", which is why the bug survives code review. It publishes nothing: data written before `stop = true` is not guaranteed visible.
- `volatile int counter; ++counter;` from two threads loses increments exactly like a plain `int`.
- `volatile` + `std::atomic` are orthogonal: `volatile std::atomic<int>` exists for atomics that live in MMIO or are shared with signal handlers, not for "extra safety".

#### Edge Case 6: Invalid memory order arguments are undefined behaviour, not a no-op
- `store(v, memory_order_acquire)`, `store(v, memory_order_acq_rel)`, `load(memory_order_release)` and `load(memory_order_acq_rel)` violate preconditions.
- With GCC 11 and Clang a normal build compiles without a warning when the order is passed this way, and the program appears to work.
- `-D_GLIBCXX_ASSERTIONS` (libstdc++) turns it into an assertion failure and `abort()`.
- A compare-exchange failure order of `release` or `acq_rel` is also invalid (the failure path is just a load).

#### Edge Case 7: A fence on the wrong side of the store does nothing useful
- What people assume: "there is a release fence in the producer, so it publishes".
- What actually happens: fence-based publication requires `fence(release)` **sequenced before** the store that the consumer reads, and `fence(acquire)` **sequenced after** the load that read it.
```cpp
// ❌ fence after the store: data = 42 may still be reordered after flag
data = 42;
flag.store(1, std::memory_order_relaxed);
std::atomic_thread_fence(std::memory_order_release);

// ✅ fence before the store
data = 42;
std::atomic_thread_fence(std::memory_order_release);
flag.store(1, std::memory_order_relaxed);
```
- A fence without any atomic operation to carry the value synchronizes nothing.

#### Edge Case 8: Two atomics written in order can be observed out of order
- What people assume: "both `data` and `ready` are `std::atomic`, so the reader sees them in the order they were written".
- What actually happens: with relaxed operations each atomic has its own modification order and nothing links them. The reader may see `ready == true` and then `data == 0`.
- It is **not** a data race (everything is atomic), so the behaviour is defined: the output is simply either the old or the new value.
- Interview precision: "no happens-before, so no guarantee of 42" is correct; "data race, UB" is wrong for this all-atomic version.
- Fix: release store on `ready`, acquire load of `ready`; `data` may then stay relaxed, or even become a plain `int`.

### CODE_EXAMPLES: Practical Demonstrations

#### Example 1: Release/acquire publication of non-atomic data
- The flag is atomic because it is the synchronization mechanism; the payload stays ordinary memory.
```cpp
#include <atomic>
#include <iostream>
#include <string>
#include <thread>

struct Order {
    int id = 0;
    double price = 0.0;
    std::string symbol;
};

Order order;                        // plain, non-atomic payload
std::atomic<bool> ready{false};     // the only atomic

void producer() {
    order.id = 7;                   // (1) sequenced-before (2)
    order.price = 101.25;
    order.symbol = "ABC";
    ready.store(true, std::memory_order_release);   // (2) release
}

void consumer() {
    while (!ready.load(std::memory_order_acquire)) {} // (3) reads true from (2): synchronizes-with
    // (1) happens-before (4): no data race, all fields are fully visible
    std::cout << order.id << ' ' << order.price << ' ' << order.symbol << '\n'; // (4)
}

int main() {
    std::thread c(consumer);
    std::thread p(producer);
    p.join();
    c.join();
}
```
- Output is always `7 101.25 ABC`.
- The guarantee covers every write sequenced before the release, including the heap allocation inside `std::string`.

#### Example 2: Relaxed counter, and why `join()` makes the final read safe
- Relaxed is enough because the counter publishes no other data.
```cpp
#include <atomic>
#include <iostream>
#include <thread>
#include <vector>

int main() {
    std::atomic<long> hits{0};
    std::vector<std::thread> workers;
    for (int t = 0; t < 4; ++t) {
        workers.emplace_back([&hits] {
            for (int i = 0; i < 1'000'000; ++i)
                hits.fetch_add(1, std::memory_order_relaxed);   // atomic RMW, no ordering
        });
    }
    for (auto& w : workers) w.join();   // thread end synchronizes-with join() return
    std::cout << hits.load(std::memory_order_relaxed) << '\n';
}
```
- Always prints `4000000`: each RMW reads the latest value in the counter's modification order, so no increment is lost.
- The final relaxed load is safe and complete because of `join()`, not because of the memory order.

#### Example 3: Store-buffering litmus test: release/acquire vs seq_cst on real hardware
- Runs the Dekker pattern many times and counts the outcome `r1 == 0 && r2 == 0`.
```cpp
#include <atomic>
#include <cstdio>
#include <thread>

std::atomic<int> x{0}, y{0};
std::atomic<int> go{0};          // round number both threads wait for
std::atomic<int> done{0};
int r1, r2;

template <std::memory_order StoreMo, std::memory_order LoadMo>
int run(int rounds) {
    int both_zero = 0;
    std::thread t1([&] {
        for (int i = 1; i <= rounds; ++i) {
            while (go.load(std::memory_order_acquire) != i) {}
            x.store(1, StoreMo);
            r1 = y.load(LoadMo);
            done.fetch_add(1, std::memory_order_acq_rel);
        }
    });
    std::thread t2([&] {
        for (int i = 1; i <= rounds; ++i) {
            while (go.load(std::memory_order_acquire) != i) {}
            y.store(1, StoreMo);
            r2 = x.load(LoadMo);
            done.fetch_add(1, std::memory_order_acq_rel);
        }
    });
    for (int i = 1; i <= rounds; ++i) {
        x.store(0, std::memory_order_relaxed);
        y.store(0, std::memory_order_relaxed);
        done.store(0, std::memory_order_relaxed);
        go.store(i, std::memory_order_release);           // start round i
        while (done.load(std::memory_order_acquire) != 2) {}
        if (r1 == 0 && r2 == 0) ++both_zero;
    }
    t1.join();
    t2.join();
    go.store(0);
    return both_zero;
}

int main() {
    constexpr int rounds = 200000;
    int a = run<std::memory_order_release, std::memory_order_acquire>(rounds);
    int b = run<std::memory_order_seq_cst, std::memory_order_seq_cst>(rounds);
    std::printf("release/acquire: r1==0 && r2==0 in %d of %d rounds\n", a, rounds);
    std::printf("seq_cst        : r1==0 && r2==0 in %d of %d rounds\n", b, rounds);
}
```
- Sample run on an x86-64 machine (the first count varies per run, two runs gave 3488 and 11714):
```
release/acquire: r1==0 && r2==0 in 3488 of 200000 rounds
seq_cst        : r1==0 && r2==0 in 0 of 200000 rounds
```
- On x86 the release/acquire version compiles to plain `mov`s, so the store buffer lets each load run before the other core sees the store. The `seq_cst` store compiles to `xchg`, which drains the store buffer.
- The `seq_cst` line is 0 by guarantee; the first line is merely *allowed* to be non-zero.

#### Example 4: Publication with fences instead of ordered operations
- One acquire fence covers the payload after a relaxed polling loop.
```cpp
#include <atomic>
#include <iostream>
#include <thread>

int payload[3];
std::atomic<int> flag{0};

void producer() {
    payload[0] = 1; payload[1] = 2; payload[2] = 3;
    std::atomic_thread_fence(std::memory_order_release);   // before the publishing store
    flag.store(1, std::memory_order_relaxed);
}

void consumer() {
    while (flag.load(std::memory_order_relaxed) == 0) {}   // cheap relaxed spinning
    std::atomic_thread_fence(std::memory_order_acquire);   // after the load that saw 1
    std::cout << payload[0] + payload[1] + payload[2] << '\n';
}

int main() {
    std::thread c(consumer), p(producer);
    p.join();
    c.join();
}
```
- Always prints `6`.
- Fence-fence synchronization: the release fence is sequenced before a store, the acquire fence is sequenced after a load that read that store.
- Tooling note: ThreadSanitizer (GCC 11 at least) does not model standalone `atomic_thread_fence`, so fence-based code like this can be reported as a false data race on `payload` depending on how the program is built and scheduled. Prefer ordered operations where possible so that TSan stays useful.

#### Example 5: A spinlock is just acquire on lock and release on unlock
- Shows that "lock = acquire, unlock = release" is literally how mutual exclusion publishes data.
```cpp
#include <atomic>
#include <iostream>
#include <thread>
#include <vector>

class SpinLock {
    std::atomic<bool> locked_{false};
public:
    void lock() {
        for (;;) {
            if (!locked_.exchange(true, std::memory_order_acquire)) return;  // acquire on success
            while (locked_.load(std::memory_order_relaxed)) {}  // spin on loads (test-and-test-and-set)
        }
    }
    void unlock() { locked_.store(false, std::memory_order_release); }       // release
};

SpinLock lk;
long shared_total = 0;      // plain variable protected by the lock

int main() {
    std::vector<std::thread> ts;
    for (int t = 0; t < 4; ++t)
        ts.emplace_back([] {
            for (int i = 0; i < 100000; ++i) {
                lk.lock();
                ++shared_total;
                lk.unlock();
            }
        });
    for (auto& t : ts) t.join();
    std::cout << shared_total << '\n';
}
```
- Always prints `400000`.
- Each `unlock()` (release) synchronizes-with the next successful `exchange` (acquire) that reads `false`, so every critical section happens-before the next.
- With `relaxed` on both, mutual exclusion on the flag would still hold, but `shared_total` would be a data race (see Practice Q14).

#### Example 6: Happens-before is transitive across three threads
- T3 never touches `stage1`, yet safely reads data written by T1.
```cpp
#include <atomic>
#include <cassert>
#include <iostream>
#include <thread>

int config = 0;                  // written only by T1
int derived = 0;                 // written only by T2
std::atomic<bool> stage1{false}, stage2{false};

int main() {
    std::thread t1([] {
        config = 10;
        stage1.store(true, std::memory_order_release);
    });
    std::thread t2([] {
        while (!stage1.load(std::memory_order_acquire)) {}
        derived = config * 2;                          // safe: T1 → T2
        stage2.store(true, std::memory_order_release);
    });
    std::thread t3([] {
        while (!stage2.load(std::memory_order_acquire)) {}
        assert(config == 10 && derived == 20);         // safe: T1 → T2 → T3
        std::cout << config + derived << '\n';
    });
    t1.join(); t2.join(); t3.join();
}
```
- Always prints `30`.
- Chain: `config = 10` →sb→ release(stage1) →sw→ acquire(stage1) →sb→ release(stage2) →sw→ acquire(stage2) →sb→ read.

#### Example 7: Reference counting: relaxed increment, acq_rel decrement
- The pattern used by `std::shared_ptr`-style control blocks.
```cpp
#include <atomic>
#include <iostream>
#include <thread>

struct Block {
    std::atomic<int> refs{1};
    int value = 0;
};

void retain(Block* b) {
    b->refs.fetch_add(1, std::memory_order_relaxed);    // only atomicity needed
}

void release(Block* b) {
    // release: publish this thread's writes to whoever deletes
    // acquire: the deleting thread must see every other thread's writes
    if (b->refs.fetch_sub(1, std::memory_order_acq_rel) == 1) {
        std::cout << "deleting, value = " << b->value << '\n';
        delete b;
    }
}

int main() {
    Block* b = new Block;
    retain(b);                                   // refs = 2, one per thread
    std::thread t([b] { b->value = 99; release(b); });
    release(b);
    t.join();
}
```
- Always prints `deleting, value = 99`, whichever thread drops the last reference:
  - Worker decrements last: it prints its own write.
  - Main decrements last: its `fetch_sub` reads the value written by the worker's release `fetch_sub`, so it synchronizes-with it and must see `value = 99`.
- Increment can be relaxed: a thread can only call `retain` while it already owns a reference, so the object cannot die concurrently.
- Decrement needs release (so this thread's writes are published) and the final decrement needs acquire (so the deleter sees all writes). Common optimization: `fetch_sub(1, release)` then `atomic_thread_fence(acquire)` only in the `== 1` branch.

### QUICK_REFERENCE: Cheat Sheet

#### Choosing a memory order

| You need | Use |
|---|---|
| A counter / statistic / unique ID nobody uses to publish data | `relaxed` |
| A stop flag that publishes no data | `relaxed` is enough (`seq_cst` is fine and simpler) |
| Publish data written before a flag/pointer/index | `release` store + `acquire` load on the **same** atomic |
| RMW that both claims and publishes (CAS on a lock, ref-count decrement) | `acq_rel` |
| Store-then-load protocols (Dekker, Peterson), several flags read by several readers | `seq_cst` |
| One acquire for many relaxed loads | relaxed loads + `atomic_thread_fence(acquire)` |
| Not sure | `seq_cst` (default), then optimize with a proof |

#### Relations

| Term | One line |
|---|---|
| Data race | Conflicting accesses, at least one non-atomic, no happens-before → UB |
| Sequenced-before | Program order inside one thread |
| Synchronizes-with | Release → acquire that reads its value; unlock → next lock; thread start/join |
| Happens-before | Transitive chain of sequenced-before + synchronizes-with |
| Modification order | One total order of all writes/RMWs per atomic object; loads only observe |
| Release sequence | Release store + following RMWs on that object; acquire reading any of them syncs with the release |
| SC total order | One order of all `seq_cst` ops on all objects; not scheduling, not synchronization |

#### Hardware cheat sheet

| | x86-64 (TSO) | ARMv8 (weak) |
|---|---|---|
| Visible reorderings | store → later load only | all four (LL, LS, SL, SS) |
| acquire load / release store | plain `mov` | `ldar` / `stlr` |
| seq_cst store | `xchg` (or `mov; mfence`) | `stlr` |
| seq_cst fence | `mfence` / `lock or` | `dmb ish` |
| "Works on x86" with relaxed flag? | Often, until the compiler reorders | Breaks |

#### Interview one-liners

| Question | One-liner |
|---|---|
| Atomic vs ordering? | Atomicity protects the variable; memory order defines what it publishes about other memory. |
| What does release do? | Makes every earlier write in the thread visible to any thread whose acquire reads this store's value. |
| What does acquire do? | If it reads a value from a release, everything before that release happens-before everything after this acquire. |
| Does acquire wait? | No. It reads whatever is there; only reading the released value synchronizes. |
| Relaxed publication with plain data? | Data race on the payload: undefined behaviour, not "maybe prints 0". |
| Why is relaxed fine for counters? | RMWs read the latest value in the modification order; nothing else is published. |
| What does seq_cst add? | A single total order of all seq_cst ops, which forbids store-load reordering. |
| Does seq_cst pick which thread runs first? | No, it restricts allowed outcomes, not scheduling. |
| Does release flush the store buffer? | C++ does not say; it defines happens-before. Hardware chooses the mechanism. |
| volatile vs atomic? | volatile = perform every access (MMIO, signals); atomic = atomicity + inter-thread ordering. |
| How does a mutex order memory? | Lock is acquire, unlock is release; unlock synchronizes-with the next lock. |
| x86 vs ARM? | x86 only reorders store→load; ARM reorders everything; C++ orders hide the difference. |
| consume? | Promoted to acquire by every compiler, deprecated in C++26; just use acquire. |
| Fences? | Upgrade nearby relaxed atomics; need an atomic carrying the value; release fence before the store, acquire fence after the load. |
