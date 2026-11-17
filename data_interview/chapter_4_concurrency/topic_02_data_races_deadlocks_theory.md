## TOPIC: Data Races, Race Conditions and Deadlocks

### THEORY_SECTION: Core Concepts

#### 1. Mental model
- Three different failures, three different layers:
  - **Data race**: a language rule violation. Unsynchronized conflicting access to one memory location. Result: **undefined behaviour** for the whole program.
  - **Race condition**: a logic bug. The program is correct only for some interleavings. Can exist in perfectly data-race-free code.
  - **Deadlock**: a progress failure. A set of threads each wait for a resource held by another thread in the set, so none can ever continue.
- Keep two levels of explanation separate:
  - **C++ level (what is guaranteed)**: conflicting accesses, happens-before, data race, UB.
  - **Hardware level (one possible mechanism)**: registers, store buffers, cache lines, MESI.
- Hardware stories help intuition ("both cores loaded 0"), but they are never the reason a C++ program is undefined. The standard is.
- Interview rule of thumb: answer at the C++ level first, then offer the hardware picture as "one possible execution".

#### 2. Data race: the exact C++ definition
- Two evaluations **conflict** if they access the same **memory location** and at least one of them modifies it.
- A program has a **data race** if it contains two **potentially concurrent** conflicting actions, **at least one is not atomic**, and **neither happens before the other**.
- Consequence: the behaviour of the entire program is undefined. Not "the result might be a bit off".
- What counts as one memory location:
  - Every scalar object (`int`, pointer, `double`, each `char` member) is its own location.
  - A maximal run of **adjacent non-zero-width bit-fields** is one shared location.
  - Two different `int` members of a struct are different locations: two threads writing them is not a data race (it may still cause false sharing, a performance issue).
- What is never a data race:
  - Read/read on the same location.
  - Two `std::atomic` operations on the same object (any memory order, including `relaxed`).
  - Accesses ordered by happens-before: same mutex unlock/lock, release/acquire pair, thread creation, `join()`.

| Access pair (same location, unsynchronized) | Data race? |
|---|---|
| read / read | ❌ No |
| read / write | ✅ Yes, UB |
| write / write | ✅ Yes, UB |
| atomic / atomic | ❌ No |
| atomic / plain (e.g. via `atomic_ref` mixed with plain access) | ✅ Yes, UB |
| both inside critical sections of the **same** mutex | ❌ No |
| each inside a **different** mutex | ✅ Yes, UB |

#### 3. Why `++counter` is not atomic
- For a plain `int`, `++counter` is a **read-modify-write**: read the value, add 1, write it back.
- The classic lost update (one possible interleaving):

| Step | Thread A | Thread B | counter in memory |
|---|---|---|---|
| 1 | load 100 | | 100 |
| 2 | | load 100 | 100 |
| 3 | store 101 | | 101 |
| 4 | | store 101 | 101 (one increment lost) |

- "But on x86 it is one instruction (`add [mem], 1`)": a single instruction without the `lock` prefix is still a load, an add and a store inside the core. Another core can write in between.
- The compiler is also free to transform a racy loop: keep `counter` in a register for the whole loop and store once, or replace 1,000,000 increments with `counter += 1000000`. Both are legal because the compiler may assume no other thread touches the variable.
- So the final value is not "somewhere between 1,000,000 and 2,000,000". Formally nothing is promised. In practice it is usually less than expected, sometimes exactly right, and in other programs a racy loop can be deleted or never terminate.
- Fixes: `std::atomic<int>` with `fetch_add` (relaxed is enough for a pure counter), a mutex around every access, or per-thread local counts combined once at the end.

#### 4. Race condition vs data race
- **Race condition**: correctness depends on relative timing or ordering of operations. It is a property of the algorithm, not of individual memory accesses.
- Neither is a subset of the other:

| | Race condition | No race condition |
|---|---|---|
| **Data race** | Unprotected `++counter` from two threads | Two threads both write `done = true` on a plain `bool`: logically harmless, still UB |
| **No data race** | Atomic `if (stock > 0) --stock;` (check-then-act) | Correct mutex-protected code |

- **Data-race-free does not mean deterministic.** Two threads writing `x = 10` and `x = 20` under the same mutex: no data race, final value 10 or 20.
- A mutex gives mutual exclusion plus synchronization between one unlock and the next lock. It does **not** decide which thread goes first. "Thread 1 was started first" guarantees nothing.
- If order matters, add an ordering mechanism: `join()`, a condition variable with a predicate, a semaphore, a latch, or a release/acquire flag.
- Things that do **not** fix a data race:
  - Calling `join()` afterwards: the conflicting accesses already happened.
  - `volatile`: not a synchronization primitive in C++.
  - "x86 is cache coherent": coherence is hardware; the compiler and the C++ rules still apply.
  - Protecting the same data with **different** mutexes.
  - `sleep_for` to "give the other thread time".

#### 5. Check-then-act: atomic operations are not atomic algorithms
- Making every variable `std::atomic` removes data races, not race conditions.
- Pattern that breaks: `if (lastApplied == seq - 1) { apply(msg); lastApplied = seq; }`
  - Two threads both read 103, both see 104 as "next", both apply 104: duplicate processing.
- Other check-then-act shapes: `if (!map.contains(k)) map.insert(k)`, `if (ptr) ptr->use()`, lazy init, "if queue not empty then pop".
- Fixes, from simplest to most specialised:
  - Hold **one** lock across the whole check plus act (the invariant needs one critical section).
  - Collapse check and act into one atomic RMW (`compare_exchange`, `fetch_sub` and test the old value).
  - **Single-owner design**: route all work for a piece of state to one thread, so no locking is needed at all.
- CAS subtlety: claiming a sequence number with CAS before the work finishes can **publish** state that is not ready yet. Claim and publish are separate steps.

#### 6. Deadlock and the four Coffman conditions
- Deadlock: a cycle of threads, each blocked waiting for something another thread in the cycle holds. No thread in the cycle can make progress, ever.
- All four conditions must hold at the same time:

| Condition | Meaning | Two-mutex example | Break it by |
|---|---|---|---|
| Mutual exclusion | Resource has one owner at a time | Only one thread can own `m1` | Lock-free or immutable data, single-owner design |
| Hold and wait | Hold one resource while waiting for another | T1 holds `m1`, waits for `m2` | Acquire all at once (`std::scoped_lock`), never nest locks |
| No preemption | A held resource cannot be forcibly taken away | Nobody can take `m1` from T1 | `try_lock` and back off (release voluntarily) |
| Circular wait | Cycle in the wait-for graph | T1 waits on T2, T2 waits on T1 | Global lock ordering / lock hierarchy |

- Memory aid: **M H N C**.
- "No preemption" is about **resources**, not CPU scheduling. When the OS preempts a thread that owns a mutex, the mutex stays owned. Scheduler preemption never releases a lock.

#### 7. Preventing deadlock
- **Global lock ordering**: every thread that needs several locks acquires them in one agreed order (`m1` before `m2` before `m3`). The order is a rule you impose, not mutex creation order.
- **Lock hierarchy**: give each mutex a level and only allow acquiring a lower level while holding a higher one. Can be checked at runtime in debug builds.
- **Runtime-chosen pairs** (`transfer(a, b)` and `transfer(b, a)`): order by a stable key (account id, or address with `std::less<>`), or use `std::scoped_lock(a.m, b.m)`.
- **`std::lock` / `std::scoped_lock`**: acquire several lockables "all or nothing" with an unspecified deadlock-avoidance algorithm (implementations use try-and-back-off). Guarantee: no deadlock among threads that use it, not a specific order.
- **Do not call unknown code while holding a lock**: callbacks, virtual functions, observers, logging sinks may take other locks or re-enter your object.
- **Do not block on other threads while holding a lock**: `join()`, `future.get()`, waiting for a queue slot. That thread may need your lock.
- **Timeouts (`try_lock_for`) are diagnostics and escape hatches**, not the primary prevention strategy.
- Best design-level fix: less shared mutable state, fewer nested locks, single-owner state, message passing.

#### 8. Deadlock's relatives: livelock, starvation, priority inversion
- **Livelock**: threads are running and changing state, but no useful progress. Example: two threads that `try_lock` the second mutex, fail, release the first, and retry in lockstep forever.
  - Fix: randomized or exponential back-off, or a deterministic order so one thread always wins.
- **Starvation**: the system progresses, but one thread never gets the resource. Example: a writer on a reader-preferring rwlock, or an unlucky thread that always loses the mutex race (`std::mutex` has no fairness guarantee).
- **Priority inversion**: a high-priority thread waits for a lock held by a low-priority thread, which is preempted by medium-priority work. Fixes: priority inheritance mutexes (`PTHREAD_PRIO_INHERIT`), avoiding shared locks across priority classes.

| Problem | Threads blocked? | CPU used? | Progress |
|---|---|---|---|
| Deadlock | Yes, forever | ~0% | None in the cycle |
| Livelock | No | High | None |
| Starvation | One thread waits | Normal | Others progress |

#### 9. Detecting and debugging
- **ThreadSanitizer** (`-fsanitize=thread -g -O1`):
  - Reports data races that actually occur during the run (it tracks happens-before, not timing).
  - Also reports **lock-order-inversion (potential deadlock)**: it builds a lock-order graph, so it flags `m1→m2` in one thread and `m2→m1` in another even if the run never deadlocked.
  - Cost: roughly 5 to 15x slowdown and higher memory use. Cannot combine with ASan.
- **Valgrind Helgrind / DRD**: data races and lock-order violations without recompiling. Much slower.
- **Live hang**: attach `gdb -p <pid>` and run `thread apply all bt`. Look for threads stuck in `__lll_lock_wait` / `futex_wait`, then match who holds what.
- **Static checks**: Clang `-Wthread-safety` with `GUARDED_BY` / `ACQUIRED_BEFORE` annotations catches unprotected access and order violations at compile time.
- **Production**: lock-order logging, watchdog threads that detect a stalled heartbeat, `try_lock_for` with a loud error on timeout.
- No tool proves absence of races: TSan only sees interleavings and code paths that actually ran.

#### 10. Misconceptions to unlearn
- ❌ "Two racing `++` give a result between 1 and 2." ✅ A data race is UB; no range is guaranteed.
- ❌ "I joined both threads, so it is safe." ✅ `join()` orders the thread's actions before the code after `join()`; it does not protect the threads from each other.
- ❌ "x86 is cache coherent, so a plain shared `int` is fine." ✅ The C++ rules and the compiler apply first; coherence does not make RMW atomic or stop hoisting.
- ❌ "A read racing with a write just reads a stale value." ✅ It is UB: torn values, hoisted loads, deleted loops are all real outcomes.
- ❌ "`std::atomic` means only one thread can access it at a time." ✅ Atomic operations can execute concurrently; each one is indivisible.
- ❌ "If every variable is atomic, my class is thread-safe." ✅ Multi-step invariants still need one critical section or one RMW.
- ❌ "No data race means deterministic." ✅ Lock acquisition order is still up to the scheduler.
- ❌ "Lock in the order the mutexes were created." ✅ Impose an explicit global order (or use `std::scoped_lock`).
- ❌ "`lock_guard` notices a deadlock and backs off." ✅ RAII wrappers just call `lock()`; they detect nothing.
- ❌ "`try_lock` waits a little." ✅ `try_lock` returns immediately; waiting needs `try_lock_for` on a timed mutex.
- ❌ "OS preemption releases the mutex." ✅ The lock stays owned while its owner is descheduled.
- ❌ "TSan finds data races but not deadlocks." ✅ TSan also reports lock-order inversions; for a live hang use a debugger.

### EDGE_CASES: Traps and Misconceptions

#### Edge Case 1: A data race can delete your loop
- People assume: a plain `bool` stop flag "just becomes visible a bit later".
- What actually happens: the compiler may assume no other thread writes the flag. It can load it once and spin forever, or (because a side-effect-free infinite loop is UB) delete the loop entirely.
- Observed with GCC 11 at `-O2`: the wait loop below is removed and the thread prints immediately, before `main` ever sets the flag.
```cpp
#include <chrono>
#include <iostream>
#include <thread>

bool ready = false;   // plain bool: data race

int main() {
    std::thread t([] {
        while (!ready) { }               // compiler may hoist or delete this loop
        std::cout << "saw ready\n";
    });
    std::this_thread::sleep_for(std::chrono::milliseconds(100));
    ready = true;
    t.join();
}
```
- Fix: `std::atomic<bool> ready{false};` (or C++20 `std::atomic::wait/notify`, or a condition variable).

#### Edge Case 2: join() does not repair a race that already happened
- People assume: "I join both threads before printing, so the counter is synchronized."
- What actually happens: `join()` makes everything the joined thread did happen before the code after `join()` in the joining thread. It creates no ordering between the two worker threads, so their increments still race.
- `join()` is still required and useful: it is what makes reading `counter` in `main` after the joins safe once the workers themselves are fixed.

#### Edge Case 3: Neighbouring bit-fields are one memory location
- Two threads writing two different `int` members of a struct: no data race (different memory locations).
- Two threads writing two adjacent bit-fields: data race, because adjacent non-zero-width bit-fields form **one** memory location and are updated with a read-modify-write of the containing word.
- `std::vector<bool>` has the same problem: distinct elements share bytes, and the standard explicitly excludes it from the "different elements are safe" rule.
- Tooling note: GCC 11's TSan instruments bit-field stores as wide accesses, so it flags even the `Split` layout below (false positive). Separate ordinary members are the cleanest fix.
```cpp
struct Flags {
    unsigned a : 4;   // a and b share one memory location
    unsigned b : 4;
};
struct Split {
    unsigned a : 4;
    unsigned   : 0;   // zero-width bit-field starts a new memory location
    unsigned b : 4;
};
```

#### Edge Case 4: Atomic variables, broken algorithm
- People assume: "I made `lastApplied` atomic with acquire/release, so the sequencer is thread-safe."
- What actually happens: both threads load 103, both pass the `== seq - 1` check, both apply message 104. No data race, still a race condition.
- Even a CAS that claims 104 first has a second problem: other threads now see 104 as applied while the update is still in progress.
- Fix: one critical section for check + apply + publish, or (better for latency) one owner thread for the whole sequencing state.

#### Edge Case 5: "No preemption" is not about the CPU scheduler
- Coffman's "no preemption" means a held **resource** cannot be taken away from its owner.
- The OS preempting a thread does not release its mutex. It makes things worse: every waiter now also waits for the owner to be scheduled again (this is the root of lock convoys and priority inversion).

#### Edge Case 6: Locking the same mutex twice through a multi-lock
- `transfer(a, a)` implemented as `std::scoped_lock lk(from.m, to.m);` passes the **same** `std::mutex` twice.
- The standard requires distinct, non-recursive mutexes here; calling `try_lock` on a `std::mutex` you already own is UB.
- Observed with libstdc++ 11: `std::lock` locks the first, `try_lock` on the second fails, it unlocks and retries forever. The thread spins at 100% CPU: a self-inflicted livelock.
- Fix: check `if (&from == &to) return;` before locking.

#### Edge Case 7: A deadlock needs only one mutex
- Self-deadlock: a thread calls `lock()` on a `std::mutex` it already owns (often via a callback that re-enters the object). UB; in practice it blocks forever.
- Lock plus join: `main` holds `m` and calls `worker.join()`, while `worker` is blocked trying to lock `m`. One mutex, two threads, circular wait (the second "resource" is thread completion).
- Similar shapes: waiting on a `future` while holding a lock the producer needs, a thread pool whose tasks wait on tasks queued behind them.

#### Edge Case 8: try_lock back-off can livelock
- Replacing `lock()` with "try the second lock, on failure release the first and retry" breaks hold-and-wait, so no deadlock.
- But two threads with symmetric timing can lock their first mutex, fail the second, release, and repeat in lockstep: livelock, 100% CPU, no progress.
- Fix: add randomized back-off, or keep a consistent order so one thread always wins. `std::scoped_lock` already does this for you.

### CODE_EXAMPLES: Practical Demonstrations

#### Example 1: The lost update, and three correct fixes
- Shows the racy counter next to mutex, atomic and local-accumulate versions.
```cpp
#include <atomic>
#include <iostream>
#include <mutex>
#include <thread>

constexpr int kIters = 1'000'000;

int main() {
    // 1. Racy: data race, undefined behaviour (shown for contrast only)
    int racy = 0;
    {
        std::thread t1([&] { for (int i = 0; i < kIters; ++i) ++racy; });
        std::thread t2([&] { for (int i = 0; i < kIters; ++i) ++racy; });
        t1.join(); t2.join();
    }

    // 2. Mutex: every access to `locked` goes through the same mutex
    int locked = 0;
    std::mutex m;
    {
        auto work = [&] {
            for (int i = 0; i < kIters; ++i) {
                std::lock_guard<std::mutex> g(m);
                ++locked;
            }
        };
        std::thread t1(work), t2(work);
        t1.join(); t2.join();
    }

    // 3. Atomic: relaxed is enough, only the count itself matters
    std::atomic<int> atomic_count{0};
    {
        auto work = [&] {
            for (int i = 0; i < kIters; ++i)
                atomic_count.fetch_add(1, std::memory_order_relaxed);
        };
        std::thread t1(work), t2(work);
        t1.join(); t2.join();
    }

    // 4. Accumulate locally, synchronize once
    int combined = 0;
    {
        auto work = [&] {
            int local = 0;
            for (int i = 0; i < kIters; ++i) ++local;
            std::lock_guard<std::mutex> g(m);
            combined += local;
        };
        std::thread t1(work), t2(work);
        t1.join(); t2.join();
    }

    std::cout << "racy:     " << racy << " (anything, UB)\n";
    std::cout << "mutex:    " << locked << '\n';
    std::cout << "atomic:   " << atomic_count.load() << '\n';
    std::cout << "combined: " << combined << '\n';
}
```
- The last three always print 2000000. The racy line is UB and can print anything. With GCC `-O2` it often prints exactly 2000000, because each thread's loop is folded into a single `+= 1000000`: the bug is hidden, not absent. At `-O0` it typically prints far less.
- Version 4 is the low-latency lesson: do not synchronize more often than the problem requires.

#### Example 2: Race condition without a data race (check-then-act on an atomic)
- Every access is atomic, so TSan is silent, yet tickets can be oversold.
```cpp
#include <atomic>
#include <iostream>
#include <thread>
#include <vector>

std::atomic<int> remaining{100};
std::atomic<int> sold{0};

void buy_broken() {
    if (remaining.load() > 0) {          // check
        std::this_thread::yield();       // widen the window (any delay: page fault, preemption)
        remaining.fetch_sub(1);          // act: another thread may have taken the last one
        sold.fetch_add(1);
    }
}

void buy_correct() {
    int cur = remaining.load();
    while (cur > 0) {
        // Check and act in one atomic step: only succeeds if nobody changed it
        if (remaining.compare_exchange_weak(cur, cur - 1)) {
            sold.fetch_add(1);
            return;
        }
        // on failure cur was reloaded; loop re-checks cur > 0
    }
}

template <class F>
void run(F f, const char* name) {
    remaining = 100; sold = 0;
    std::vector<std::thread> ts;
    for (int t = 0; t < 8; ++t)
        ts.emplace_back([f] { for (int i = 0; i < 50; ++i) f(); });
    for (auto& t : ts) t.join();
    std::cout << name << ": sold=" << sold << " remaining=" << remaining << '\n';
}

int main() {
    run(buy_broken, "broken ");
    run(buy_correct, "correct");
}
```
- `correct` always prints `sold=100 remaining=0`.
- `broken` is nondeterministic: in test runs roughly a third printed `sold=101 remaining=-1` or `sold=102 remaining=-2`. Without the `yield()` the window is tiny and the failure is rare, which is exactly how race conditions survive testing.
- TSan reports nothing for `buy_broken`: there is no data race, only a logic race.

#### Example 3: Classic two-lock deadlock and the scoped_lock fix
- Shows the bug shape and the fix side by side for a bank transfer.
```cpp
#include <iostream>
#include <mutex>
#include <thread>

struct Account {
    std::mutex m;
    long balance;
    explicit Account(long b) : balance(b) {}
};

// BROKEN: locks in argument order. transfer(a,b) and transfer(b,a) can deadlock.
void transfer_broken(Account& from, Account& to, long amount) {
    std::lock_guard<std::mutex> l1(from.m);
    std::lock_guard<std::mutex> l2(to.m);
    from.balance -= amount;
    to.balance += amount;
}

// FIXED: acquire both with deadlock avoidance; guard against self-transfer.
void transfer(Account& from, Account& to, long amount) {
    if (&from == &to) return;
    std::scoped_lock lk(from.m, to.m);
    from.balance -= amount;
    to.balance += amount;
}

int main() {
    Account a(1000), b(1000);
    std::thread t1([&] { for (int i = 0; i < 100000; ++i) transfer(a, b, 1); });
    std::thread t2([&] { for (int i = 0; i < 100000; ++i) transfer(b, a, 1); });
    t1.join(); t2.join();
    std::cout << a.balance << ' ' << b.balance << '\n';
    (void)transfer_broken;   // not called: it would hang sooner or later
}
```
- Output: `1000 1000` (each direction moves 100000 units, so they cancel).
- Swapping `transfer` for `transfer_broken` makes the program hang intermittently with both threads in `futex_wait`.

#### Example 4: Enforcing a lock hierarchy at runtime
- A debug-build mutex wrapper that turns a lock-order violation into an immediate exception instead of a rare production hang.
```cpp
#include <climits>
#include <iostream>
#include <mutex>
#include <stdexcept>

class hierarchical_mutex {
    std::mutex m_;
    const unsigned level_;
    unsigned previous_level_ = 0;
    static thread_local unsigned this_thread_level_;

    void check() const {
        if (this_thread_level_ <= level_)
            throw std::logic_error("lock hierarchy violated");
    }
public:
    explicit hierarchical_mutex(unsigned level) : level_(level) {}
    void lock() {
        check();
        m_.lock();
        previous_level_ = this_thread_level_;
        this_thread_level_ = level_;
    }
    void unlock() {
        this_thread_level_ = previous_level_;
        m_.unlock();
    }
    bool try_lock() {
        check();
        if (!m_.try_lock()) return false;
        previous_level_ = this_thread_level_;
        this_thread_level_ = level_;
        return true;
    }
};
thread_local unsigned hierarchical_mutex::this_thread_level_ = UINT_MAX;

hierarchical_mutex high(1000);
hierarchical_mutex low(100);

int main() {
    {
        std::lock_guard<hierarchical_mutex> a(high);   // 1000 then 100: allowed
        std::lock_guard<hierarchical_mutex> b(low);
        std::cout << "high -> low ok\n";
    }
    try {
        std::lock_guard<hierarchical_mutex> a(low);
        std::lock_guard<hierarchical_mutex> b(high);   // 100 then 1000: rejected
    } catch (const std::logic_error& e) {
        std::cout << "low -> high: " << e.what() << '\n';
    }
}
```
- Output:
```
high -> low ok
low -> high: lock hierarchy violated
```
- The rule "only lock a lower level than the one you hold" makes a cycle impossible, which removes the circular-wait condition.

#### Example 5: Safe shutdown flag (data race plus lifetime bug fixed)
- A worker owned by an object: the flag must be atomic and the destructor must join before members die.
```cpp
#include <atomic>
#include <chrono>
#include <iostream>
#include <thread>

class Worker {
    std::atomic<bool> stop_{false};   // plain bool here would be a data race
    long ticks_ = 0;                  // only touched by the worker thread
    std::thread thread_;              // declared last: starts after the members above exist
public:
    Worker() : thread_([this] {
        while (!stop_.load(std::memory_order_relaxed)) {
            ++ticks_;
            std::this_thread::sleep_for(std::chrono::milliseconds(1));
        }
    }) {}
    ~Worker() {
        stop_.store(true, std::memory_order_relaxed);
        if (thread_.joinable()) thread_.join();   // without this: use of a destroyed object
    }
    long ticks() const { return ticks_; }  // only valid after join
};

int main() {
    {
        Worker w;
        std::this_thread::sleep_for(std::chrono::milliseconds(20));
    }   // destructor: stop, then join
    std::cout << "worker stopped cleanly\n";
}
```
- Output: `worker stopped cleanly`.
- `relaxed` is enough for a pure stop signal because no other data is published through the flag. C++20 `std::jthread` plus `std::stop_token` packages the same pattern.

#### Example 6: Let ThreadSanitizer find the bugs
- A program with one data race and one lock-order inversion that never actually deadlocks during the run.
```cpp
#include <iostream>
#include <mutex>
#include <thread>

std::mutex m1, m2;
int shared = 0;

int main() {
    std::thread a([] { ++shared; });   // races with b
    std::thread b([] { ++shared; });
    a.join(); b.join();

    // Opposite lock orders, but run one after another: no hang this time
    std::thread t1([] { std::lock_guard<std::mutex> x(m1); std::lock_guard<std::mutex> y(m2); });
    t1.join();
    std::thread t2([] { std::lock_guard<std::mutex> y(m2); std::lock_guard<std::mutex> x(m1); });
    t2.join();
    std::cout << "done\n";
}
```
- Build and run: `g++ -std=c++20 -g -O1 -fsanitize=thread -pthread tsan.cpp && ./a.out`
- TSan reports `WARNING: ThreadSanitizer: data race` on `shared` (when the two increments overlap) and `WARNING: ThreadSanitizer: lock-order-inversion (potential deadlock)` with the cycle `M1 => M2 => M1`, even though no deadlock happened.
- On some kernels with high ASLR entropy TSan aborts with "unexpected memory mapping"; run it under `setarch $(uname -m) -R ./a.out`.

### QUICK_REFERENCE: Cheat Sheet

#### Definitions
| Term | One line |
|---|---|
| Data race | Concurrent conflicting access, at least one non-atomic, no happens-before: UB |
| Race condition | Correctness depends on timing or interleaving: logic bug |
| Deadlock | Cycle of threads each waiting for a resource another holds |
| Livelock | Threads keep reacting to each other, burning CPU, no progress |
| Starvation | One thread never gets the resource while others progress |
| Priority inversion | High-priority thread waits on a lock held by a preempted low-priority thread |

#### Coffman conditions (all four needed)
| Condition | Prevention |
|---|---|
| Mutual exclusion | Avoid sharing: immutable data, single owner, lock-free |
| Hold and wait | Acquire all at once (`scoped_lock`), no nested locks |
| No preemption | `try_lock` and release on failure (with random back-off) |
| Circular wait | Global lock order or lock hierarchy |

#### What fixes what
| Tool | Fixes data race? | Fixes race condition? | Deadlock risk |
|---|---|---|---|
| Same mutex on every access | ✅ | Only if the whole invariant is inside one critical section | Yes, with nested locks |
| `std::atomic` per variable | ✅ | ❌ for multi-step logic | No |
| CAS loop | ✅ | ✅ for a single-variable invariant | No (can starve) |
| Single-owner thread + queue | ✅ | ✅ | Only via blocking queues |
| `join()` after the fact | ❌ | ❌ | Yes, if done while holding a lock |
| `volatile` | ❌ | ❌ | No |

#### Multi-lock tools
| Need | Use |
|---|---|
| Lock 2+ mutexes for one scope | `std::scoped_lock lk(m1, m2);` |
| Lock several, then manage individually | `std::unique_lock a(m1, std::defer_lock), b(m2, std::defer_lock); std::lock(a, b);` |
| Already locked via `std::lock(m1, m2)` | `std::lock_guard a(m1, std::adopt_lock);` |
| Pair chosen at runtime | Check `&a == &b`, then `scoped_lock` or order by id |
| Bounded wait | `std::timed_mutex::try_lock_for(d)` |

#### Detection toolbox
| Tool | Finds |
|---|---|
| `-fsanitize=thread` | Data races that occurred, lock-order inversions |
| Helgrind / DRD | Races and lock-order problems, no recompile |
| `gdb`: `thread apply all bt` | Who is blocked where in a live hang |
| Clang `-Wthread-safety` | Unguarded access, order violations at compile time |
| Watchdog / heartbeat | Hangs in production |

#### Interview one-liners
| Question | Answer |
|---|---|
| Two threads `++x` on plain int? | Data race, undefined behaviour; no value is guaranteed |
| Is `++x` atomic on x86? | No; without `lock` it is a load, add, store |
| Does `join()` fix it? | No; it orders the thread before the joiner, not the threads against each other |
| Race condition without data race? | Yes: atomic check-then-act, or lock-protected but order-dependent logic |
| Data-race-free means deterministic? | No |
| Deadlock conditions? | Mutual exclusion, hold and wait, no preemption, circular wait |
| Cheapest prevention? | Consistent global lock order |
| Locking 2 mutexes in modern C++? | `std::scoped_lock(m1, m2)` |
| Does `lock_guard` detect deadlock? | No |
| Does `try_lock` wait? | No; use `try_lock_for` on a timed mutex |
| Can TSan find deadlocks? | It reports lock-order inversions; use gdb for a live hang |
