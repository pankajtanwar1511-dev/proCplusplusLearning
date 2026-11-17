## TOPIC: Mutexes and Lock Types

### THEORY_SECTION: Core Concepts

#### 1. Mental model
- A mutex is a single key to a room (the **critical section**). Whoever holds the key is the **owner**; everyone else waits.
- It protects data only through a **protocol**: every access to the shared state, reads included, must hold the **same** mutex. One unprotected access anywhere breaks the guarantee.
- Three properties to keep apart:
  - **Mutual exclusion**: at most one owner at a time.
  - **Ownership**: the thread that locked it is the one that must unlock it.
  - **Synchronization**: an `unlock()` synchronizes with the next successful `lock()` of the same mutex, so everything written before the unlock is visible after the lock (happens-before).
- What a mutex does **not** give: an execution order between threads, fairness, or protection for data accessed outside the lock.
- Lock objects (`lock_guard`, `unique_lock`, `scoped_lock`, `shared_lock`) are RAII wrappers: their lifetime represents ownership. Never make the programmer remember to unlock.

#### 2. std::mutex: the exact contract
- `lock()`: blocks until the calling thread owns the mutex.
- `try_lock()`: returns immediately, `true` if acquired. It is allowed to **fail spuriously** even if the mutex is free.
- `unlock()`: precondition: the calling thread owns the mutex.
- Undefined behaviour cases (each is a classic interview trap):

| Action | Result |
|---|---|
| Locking a `std::mutex` you already own (`lock` or `try_lock`) | UB (glibc: blocks forever) |
| Unlocking from a thread that is not the owner | UB |
| Unlocking a mutex that is not locked | UB |
| Destroying a mutex while it is locked | UB |
| Owner thread exits while holding the lock | Undefined behaviour; in practice (glibc) it stays locked forever |

- Other properties:
  - Not copyable, not movable: a class containing a mutex is non-copyable by default.
  - `constexpr` default constructor: a global `std::mutex` is constant-initialized, so it is safe to use from other static initializers.
  - No fairness: a thread arriving later can "barge" ahead of threads already waiting.
  - `lock()` may throw `std::system_error`. An implementation is permitted (not required) to report `resource_deadlock_would_occur` when it detects relocking; glibc's default mutex does not check, it just blocks.
- Locking for reading in a `const` member function needs `mutable std::mutex m_;`.

#### 3. RAII lock wrappers
| Wrapper | Since | Locks on construction | Manual unlock/relock | Movable | Multiple mutexes | Typical use |
|---|---|---|---|---|---|---|
| `std::lock_guard<M>` | C++11 | Yes (or `adopt_lock`) | No | No | No | Simple scope |
| `std::unique_lock<M>` | C++11 | Optional (`defer_lock`, `try_to_lock`, `adopt_lock`, timeout) | Yes | Yes | No | Condition variables, early unlock, handing a lock out of a function |
| `std::scoped_lock<Ms...>` | C++17 | Yes, deadlock-avoiding for 2+ | No | No | Yes | Default choice; any number of mutexes |
| `std::shared_lock<M>` | C++14 | Shared (read) ownership | Yes | Yes | No | Readers on a `shared_mutex` |

- All four acquire **exclusive** ownership except `shared_lock`. The difference between `lock_guard` and `unique_lock` is flexibility, not exclusivity.
- `unique_lock` has two independent states: the **object exists**, and it **may or may not own** the mutex (`owns_lock()`). After `unlock()` the object still exists but owns nothing; its destructor then does nothing.
- `unique_lock::lock()` on a lock that already owns its mutex throws `std::system_error` (`resource_deadlock_would_occur`); `unlock()` when not owning throws `operation_not_permitted`.
- `condition_variable::wait` requires `std::unique_lock<std::mutex>` because it must release the mutex while sleeping and reacquire it before returning.
- Tags:
  - `std::defer_lock`: associate, do not lock yet (lock later, often via `std::lock`).
  - `std::try_to_lock`: call `try_lock`, check `owns_lock()`.
  - `std::adopt_lock`: the thread already owns it; only take over the unlock.
- Size and cost (libstdc++ x86-64): `lock_guard` holds one reference (8 bytes); `unique_lock` holds a pointer plus an owns flag (16 bytes) and checks the flag in its destructor. Negligible next to the lock itself.

#### 4. The other mutex types
| Type | Recursive | Timed (`try_lock_for/until`) | Shared (reader) mode |
|---|---|---|---|
| `std::mutex` | ❌ | ❌ | ❌ |
| `std::timed_mutex` | ❌ | ✅ | ❌ |
| `std::recursive_mutex` | ✅ | ❌ | ❌ |
| `std::recursive_timed_mutex` | ✅ | ✅ | ❌ |
| `std::shared_mutex` (C++17) | ❌ | ❌ | ✅ |
| `std::shared_timed_mutex` (C++14) | ❌ | ✅ | ✅ |

- **Recursive mutex**: the owner may lock again; it must unlock the same number of times. Usually a design smell: it hides re-entrancy and lets a nested call see half-updated invariants. Prefer a private `do_x_locked()` helper that assumes the lock is held.
- **Timed mutex**: `try_lock_for(50ms)` waits up to the duration. Useful for "give up and degrade" paths and for diagnostics (log when a lock is held suspiciously long). Plain `std::mutex` has no timed API: calling `try_lock_for` on it does not compile.

#### 5. Reader-writer locks (shared_mutex)
- Readers take `std::shared_lock` (many at once); writers take `std::unique_lock` or `std::lock_guard` (exclusive).
- Fairness is **implementation-defined**:
  - The standard does not say whether a waiting writer blocks newly arriving readers.
  - libstdc++ on Linux wraps glibc `pthread_rwlock_t`, whose default policy prefers readers. With overlapping readers, a writer can starve: in a test with 4 overlapping readers a writer waited about 1 s, until the readers stopped.
- Not automatically faster than `std::mutex`:
  - Every reader still performs an atomic RMW on the shared lock word, so the lock's cache line bounces between reader cores.
  - For tiny critical sections (a map lookup), a plain mutex is often as fast or faster.
  - Wins appear when read sections are long relative to lock overhead and writes are rare.
- No upgrade: holding a `shared_lock` and then requesting `unique_lock` on the same mutex in the same thread is UB (in practice a self-deadlock). Release, take the exclusive lock, and re-check the condition.
- Low-latency view: unpredictable writer waits become tail-latency spikes. Alternatives: plain mutex, sharding, copy-on-write snapshots behind an atomic pointer, RCU, seqlocks, single-writer designs.

#### 6. What a blocked thread actually does
- C++ only says `lock()` "blocks". Everything below is implementation behaviour (shown for glibc/Linux, the most common interview target).
- **Fast path (uncontended)**: one atomic compare-and-swap in user space (0 to 1). No system call, no kernel.
- **Slow path (contended)**: the waiter marks the lock word "locked with waiters" (2) and calls `futex(FUTEX_WAIT)`. The kernel puts the thread to sleep on a wait queue keyed by the lock's address, with no CPU used while sleeping.
- **Unlock**: atomic store/exchange back to 0. Only if the old value said "waiters exist" does it call `futex(FUTEX_WAKE, 1)`. Uncontended unlock is pure user space.
- **Wake-up**: the woken thread must compete for the lock again; a running thread may grab it first (barging). No FIFO guarantee.
- **Spin-then-sleep** is an implementation choice:
  - glibc's default mutex type does not spin: after a failed fast path it goes straight to the futex wait.
  - glibc's `PTHREAD_MUTEX_ADAPTIVE_NP`, and many other runtimes, spin briefly first, betting the owner releases within a few hundred nanoseconds.
  - A pure spinlock never sleeps: it burns a core for the entire wait.
- "Waiting" is not the same as "blocking": a waiter may spin (active) or sleep (passive). Under contention a thread *may* enter the kernel; it does not *have to*.
- The kernel's futex queue is not "a counter the kernel maintains"; the lock word lives in user memory and the kernel is only involved for sleeping and waking.

#### 7. Cost: uncontended vs contended
| Situation | What happens | Rough cost (modern x86, order of magnitude) |
|---|---|---|
| Uncontended, same thread keeps the line hot | Two atomic RMWs (lock + unlock), cache-local | A few ns to ~25 ns per lock/unlock pair |
| Uncontended, lock last used on another core | Same, plus cache-line transfer | ~50 to 150 ns |
| Contended, owner releases quickly | Cache-line ping-pong between cores, possible brief spin | ~50 to a few hundred ns per acquisition |
| Contended, waiter must sleep | `FUTEX_WAIT` + `FUTEX_WAKE` syscalls + context switch + scheduler wake-up | Several µs to tens of µs per hand-off, worse under load |

- Measured on one 20-core Linux box (GCC 11, glibc): uncontended `lock_guard` increment about 3 ns; 2 threads fighting over one mutex about 50 ns per increment; 8 threads about 100 ns per increment; the same counter as a relaxed `std::atomic` about 13 ns.
- The real cost of contention is not the syscall; it is **serialization** (only one core does useful work) and **tail latency** (an unlucky request waits for a sleeping/waking cycle or for a long critical section).
- Rule: an uncontended mutex is cheap; contention is what you design against.

#### 8. Lock granularity and holding locks across slow work
- **Critical section length** dominates contention. Never hold a lock across: I/O, logging to a file or socket, memory allocation in hot paths, waiting on another thread, callbacks, or expensive computation.
- **Snapshot pattern**: copy the needed shared state under the lock, release, do the slow work on the private copy. Moving code outside the lock is only safe if that code no longer touches shared mutable state.
- **Granularity trade-off**:
  - Too coarse (one global mutex): unrelated operations serialize; CPU stays low while latency climbs.
  - Too fine (many small locks): more lock/unlock overhead, lock-ordering rules, and invariants that span two locks become race conditions.
- **Sharding / lock striping**: split the data by key (`hash(key) % N`), one mutex per shard. Contention drops roughly by N if keys are spread; watch for hot shards.
- **Single-owner sharding**: route each key to one owning thread; inside a shard no lock is needed at all, and per-key ordering is preserved.
- **False sharing between locks**: an array of `{std::mutex, data}` structs packs several mutexes into one 64-byte line, so unrelated shards still bounce the same cache line. Pad each shard with `alignas(64)` (or `std::hardware_destructive_interference_size`).
- **Mutex vs atomic**: a mutex protects a multi-variable invariant; an atomic protects one variable. A single contended atomic also bounces its cache line, so "atomic is always faster" is false under heavy contention.

#### 9. Misconceptions to unlearn
- ❌ "Every mutex lock is a system call." ✅ Uncontended lock and unlock are user-space atomics; the kernel is only used to sleep and wake waiters.
- ❌ "Under contention the kernel must get involved." ✅ It may; spinning implementations can hand over without a syscall.
- ❌ "Thread 2 sees the update because the store buffer was flushed." ✅ Unlock synchronizes-with the next lock, which establishes happens-before. Fences are how hardware implements it.
- ❌ "The thread that started first gets the mutex first." ✅ No ordering, no FIFO, no fairness.
- ❌ "A waiting thread spins and burns CPU." ✅ A `std::mutex` waiter normally sleeps (possibly after a short spin).
- ❌ "When a thread finishes, its mutexes are released." ✅ Nothing is released automatically; destroying a locked mutex is UB.
- ❌ "Any thread can unlock a mutex." ✅ Only the owner; use a semaphore for cross-thread signaling.
- ❌ "`unique_lock` is the exclusive one, `lock_guard` is not." ✅ Both are exclusive; `unique_lock` is the flexible one.
- ❌ "`shared_mutex` is faster for reads." ✅ Only when read sections are long enough to amortize its overhead; fairness is implementation-defined.
- ❌ "Once a writer waits, new readers queue behind it." ✅ Not guaranteed; glibc prefers readers by default.
- ❌ "Producer/consumer on one mutex means constant contention." ✅ Contention happens only when critical sections overlap; it grows with throughput and section length.
- ❌ "Sharding removes the need for mutexes." ✅ Only if each shard has exactly one owner thread.

### EDGE_CASES: Traps and Misconceptions

#### Edge Case 1: The lock that locks nothing
- `std::lock_guard<std::mutex>{m};` creates a temporary that locks and unlocks immediately, at the end of the full expression.
- `std::unique_lock<std::mutex>(m);` is parsed as a **declaration** of a new default-constructed `unique_lock` named `m`, shadowing the mutex. It locks nothing. GCC warns: "unnecessary parentheses in declaration of 'm'".
- `std::lock_guard<std::mutex>(m);` is also a declaration, but `lock_guard` has no default constructor, so it fails to compile (the lucky case).
- `std::scoped_lock lk;` with no arguments compiles and locks nothing.
- Rule: always name the guard: `std::lock_guard<std::mutex> lock(m);`.

#### Edge Case 2: A finished thread keeps its lock
- If the owner returns without unlocking (exception caught but unlock forgotten), the thread terminates normally and `join()` succeeds.
- Undefined behaviour by the standard. In practice (glibc) the mutex stays locked forever: other threads block indefinitely, and the owner can no longer unlock it because it no longer exists.
- At program exit the locked mutex is destroyed, which is UB.
- RAII fixes all of it: the guard's destructor runs on normal return, early return and exception unwinding.

#### Edge Case 3: Locking twice in one thread
- `std::mutex`: second `lock()` by the owner is UB; glibc's default mutex blocks forever (self-deadlock).
- `std::unique_lock::lock()` when it already owns: throws `std::system_error` with `resource_deadlock_would_occur` ("Resource deadlock avoided"). The wrapper checks its own flag; the raw mutex would not.
- `std::recursive_mutex`: allowed; needs the same number of unlocks. `try_lock` by the owner also succeeds.
```cpp
#include <iostream>
#include <mutex>
#include <system_error>

std::mutex m;

int main() {
    std::unique_lock<std::mutex> lk(m);
    try {
        lk.lock();                       // already owns m
    } catch (const std::system_error& e) {
        std::cout << e.what() << '\n';   // Resource deadlock avoided
    }
}
```

#### Edge Case 4: No upgrade from shared to exclusive
- People assume: "I hold a read lock and found the key missing, so I'll take the write lock to insert it."
- `std::shared_mutex` has no upgrade operation. Calling `lock()` while the same thread holds `lock_shared()` waits for all readers to leave, including itself: self-deadlock (UB).
- Two readers trying to upgrade at the same time would deadlock each other even on a lock type that allowed it, which is why upgrades are not offered.
- Correct pattern: release the shared lock, acquire the exclusive lock, then **re-check** (another writer may have inserted in between).

#### Edge Case 5: Returning a reference escapes the lock
- A getter that locks and returns `const T&` (or a pointer, iterator, or `string_view`) into protected data releases the lock on return; the caller then reads unprotected memory that another thread may be modifying or freeing.
- Same leak via callbacks that receive a reference to internal state and store it.
- Fix: return by value (copy under the lock), or provide a `with_locked(f)` method that runs `f` while the lock is held.

#### Edge Case 6: try_lock is immediate, may fail spuriously, and is not timed
- `std::mutex::try_lock()` never waits. It may return `false` even if nobody holds the mutex, so never use its result as a "is anyone holding it?" query.
- `m.try_lock_for(10ms)` on a plain `std::mutex` does not compile; use `std::timed_mutex` (or `recursive_timed_mutex`, `shared_timed_mutex`).
- Timed waits use `steady_clock` for `try_lock_for` durations; `try_lock_until` with `system_clock` can be affected by wall-clock adjustments.

#### Edge Case 7: A mutex member changes the class
- `std::mutex` is neither copyable nor movable, so a class with a mutex member loses its implicit copy and move operations. Containers that need to relocate elements (e.g. `std::vector<Account>` growth) stop compiling.
- If copying is needed, write the copy constructor yourself: lock the source, copy the data, give the new object its own fresh mutex.
- `const` getters need `mutable std::mutex`; locking is not a logical modification of the object.

#### Edge Case 8: Sharded locks that still contend
- Splitting one mutex into 64 shard mutexes should cut contention, but `struct Shard { std::mutex m; long v; };` is 48 bytes on glibc x86-64, so neighbouring shards share cache lines.
- Threads on different shards still invalidate each other's cache line on every lock and update (false sharing): correct, but much slower than expected.
- Fix: `struct alignas(64) Shard { ... };`. Also check that keys spread evenly; one hot key makes sharding useless.

### CODE_EXAMPLES: Practical Demonstrations

#### Example 1: A thread-safe class with an invariant across members
- One mutex guards two members that must change together; `const` readers use a `mutable` mutex.
```cpp
#include <iostream>
#include <mutex>
#include <thread>
#include <vector>

class Position {
    mutable std::mutex m_;   // mutable: locked in const member functions
    long qty_ = 0;
    double notional_ = 0.0;  // invariant: notional_ == qty_ * 100.0
public:
    void fill(long q) {
        std::lock_guard<std::mutex> g(m_);
        qty_ += q;
        notional_ += q * 100.0;      // both updated in one critical section
    }
    bool consistent() const {
        std::lock_guard<std::mutex> g(m_);
        return notional_ == qty_ * 100.0;
    }
    long qty() const {
        std::lock_guard<std::mutex> g(m_);
        return qty_;
    }
};

int main() {
    Position p;
    std::vector<std::thread> ts;
    for (int t = 0; t < 4; ++t)
        ts.emplace_back([&] { for (int i = 0; i < 10000; ++i) p.fill(1); });
    for (auto& t : ts) t.join();
    std::cout << p.qty() << ' ' << std::boolalpha << p.consistent() << '\n';
}
```
- Output: `40000 true`.
- Two atomics instead of one mutex would make each member race-free but would let a reader see `qty_` updated and `notional_` not yet: the invariant needs one critical section.

#### Example 2: unique_lock flexibility: early unlock, deferred locking, ownership transfer
- Shows the three things `lock_guard` cannot do.
```cpp
#include <iostream>
#include <mutex>
#include <string>
#include <utility>

std::mutex m;
std::string shared_config = "v1";

// Return a lock: the caller continues the critical section
std::unique_lock<std::mutex> acquire() {
    std::unique_lock<std::mutex> lk(m);
    return lk;                                  // moved out, still owns m
}

int main() {
    {
        std::unique_lock<std::mutex> lk(m);
        std::string copy = shared_config;       // protected read
        lk.unlock();                            // object alive, no longer owns m
        std::cout << "owns after unlock: " << lk.owns_lock() << '\n';
        std::string report = "config=" + copy;  // slow work without the lock
        lk.lock();                              // owns again
        shared_config = "v2";
        std::cout << report << '\n';
    }
    {
        std::unique_lock<std::mutex> lk(m, std::defer_lock);
        std::cout << "owns after defer: " << lk.owns_lock() << '\n';
        lk.lock();
        std::cout << "owns after lock: " << lk.owns_lock() << '\n';
    }
    {
        auto lk = acquire();
        std::cout << "transferred, owns: " << lk.owns_lock() << ", config=" << shared_config << '\n';
    }
}
```
- Output:
```
owns after unlock: 0
config=v1
owns after defer: 0
owns after lock: 1
transferred, owns: 1, config=v2
```

#### Example 3: Read-mostly cache with shared_mutex and the re-check after "upgrade"
- Readers share the lock; a miss releases it, takes the exclusive lock and re-checks.
```cpp
#include <iostream>
#include <mutex>
#include <shared_mutex>
#include <string>
#include <thread>
#include <unordered_map>
#include <vector>

class PriceCache {
    mutable std::shared_mutex m_;
    std::unordered_map<std::string, double> prices_;
    int loads_ = 0;   // guarded by m_ (exclusive)
public:
    double get(const std::string& sym) {
        {
            std::shared_lock<std::shared_mutex> r(m_);       // many readers at once
            auto it = prices_.find(sym);
            if (it != prices_.end()) return it->second;
        }                                                     // release before writing
        std::unique_lock<std::shared_mutex> w(m_);           // exclusive
        auto it = prices_.find(sym);                          // re-check: another thread may have loaded it
        if (it != prices_.end()) return it->second;
        ++loads_;
        return prices_[sym] = 100.0 + sym.size();            // "expensive load"
    }
    int loads() const {
        std::shared_lock<std::shared_mutex> r(m_);
        return loads_;
    }
};

int main() {
    PriceCache cache;
    std::vector<std::thread> ts;
    for (int t = 0; t < 8; ++t)
        ts.emplace_back([&] { for (int i = 0; i < 1000; ++i) cache.get("AAPL"); });
    for (auto& t : ts) t.join();
    std::cout << "price=" << cache.get("AAPL") << " loads=" << cache.loads() << '\n';
}
```
- Output: `price=104 loads=1`. Without the re-check, `loads` could be greater than 1.
- Holding the `shared_lock` while constructing the `unique_lock` would self-deadlock: there is no upgrade.

#### Example 4: recursive_mutex vs the locked-helper pattern
- Both are correct; the second makes the locking rule explicit and keeps `std::mutex`.
```cpp
#include <iostream>
#include <mutex>
#include <vector>

class LogRecursive {
    std::recursive_mutex m_;
    std::vector<int> items_;
public:
    void add(int v) {
        std::lock_guard<std::recursive_mutex> g(m_);
        items_.push_back(v);
    }
    void add_pair(int a, int b) {
        std::lock_guard<std::recursive_mutex> g(m_);   // depth 1
        add(a);                                         // depth 2: allowed
        add(b);
    }
    std::size_t size() { std::lock_guard<std::recursive_mutex> g(m_); return items_.size(); }
};

class LogHelper {
    std::mutex m_;
    std::vector<int> items_;
    void add_locked(int v) { items_.push_back(v); }     // precondition: m_ held
public:
    void add(int v) { std::lock_guard<std::mutex> g(m_); add_locked(v); }
    void add_pair(int a, int b) {
        std::lock_guard<std::mutex> g(m_);
        add_locked(a);                                  // no second lock
        add_locked(b);
    }
    std::size_t size() { std::lock_guard<std::mutex> g(m_); return items_.size(); }
};

int main() {
    LogRecursive r;
    r.add_pair(1, 2);
    LogHelper h;
    h.add_pair(1, 2);
    std::cout << r.size() << ' ' << h.size() << '\n';
}
```
- Output: `2 2`.
- With plain `std::mutex` in `LogRecursive`, `add_pair` would self-deadlock (UB).

#### Example 5: timed_mutex: give up instead of blocking forever
- A housekeeping thread holds the lock for 200 ms; a latency-sensitive thread waits at most 20 ms, then takes a fallback path.
```cpp
#include <chrono>
#include <iostream>
#include <mutex>
#include <thread>

using namespace std::chrono_literals;

std::timed_mutex m;

int main() {
    std::thread holder([] {
        std::lock_guard<std::timed_mutex> g(m);
        std::this_thread::sleep_for(200ms);           // slow work under the lock (the real bug)
    });
    std::this_thread::sleep_for(10ms);                // let holder grab it first

    std::unique_lock<std::timed_mutex> lk(m, std::defer_lock);
    if (lk.try_lock_for(20ms))
        std::cout << "got lock\n";
    else
        std::cout << "timed out, using cached value\n";

    holder.join();
    if (lk.try_lock_for(20ms))
        std::cout << "got lock after holder finished\n";
}
```
- Output:
```
timed out, using cached value
got lock after holder finished
```
- Timing-based demo (the 10 ms sleep makes the holder win the first race).
- Plain `std::mutex` offers only `try_lock()` (no waiting at all).

#### Example 6: Snapshot under the lock, slow work outside
- The report thread used to hold the mutex for the whole report; now it copies under the lock and formats outside.
```cpp
#include <chrono>
#include <iostream>
#include <map>
#include <mutex>
#include <string>
#include <thread>

std::mutex book_m;
std::map<std::string, long> positions = {{"AAPL", 100}, {"MSFT", -50}};

std::string slow_format(const std::map<std::string, long>& snap) {
    std::this_thread::sleep_for(std::chrono::milliseconds(50));   // stands in for 5 to 8 ms of work
    std::string out;
    for (const auto& [sym, q] : snap) out += (out.empty() ? "" : " ") + sym + "=" + std::to_string(q);
    return out;
}

void report() {
    std::map<std::string, long> snapshot;
    {
        std::lock_guard<std::mutex> g(book_m);
        snapshot = positions;                   // short critical section: just a copy
    }
    std::string text = slow_format(snapshot);   // no lock held
    std::cout << "report: " << text << '\n';
}

void on_fill(const std::string& sym, long q) {
    auto t0 = std::chrono::steady_clock::now();
    std::lock_guard<std::mutex> g(book_m);
    auto waited = std::chrono::steady_clock::now() - t0;
    positions[sym] += q;
    std::cout << "fill waited "
              << (waited < std::chrono::milliseconds(5) ? "< 5 ms" : ">= 5 ms") << '\n';
}

int main() {
    std::thread r(report);
    std::this_thread::sleep_for(std::chrono::milliseconds(10));
    on_fill("AAPL", 10);   // hot path is not blocked by the report
    r.join();
}
```
- Output:
```
fill waited < 5 ms
report: AAPL=100 MSFT=-50
```
- Timing-based demo: the 10 ms sleep lets the report thread take its snapshot first, so the report shows the pre-fill position.
- Had `slow_format` run under `book_m`, the fill would wait about 40 ms. In production this shows up as normal p50 with ruined p99/p99.9.

#### Example 7: Lock striping with cache-line-aligned shards
- Each key maps to one of N shards; each shard has its own mutex and sits on its own cache line.
```cpp
#include <array>
#include <cstddef>
#include <functional>
#include <iostream>
#include <mutex>
#include <string>
#include <thread>
#include <unordered_map>
#include <vector>

class ShardedCounter {
    static constexpr std::size_t kShards = 16;
    struct alignas(64) Shard {                       // one cache line (or more) per shard
        std::mutex m;
        std::unordered_map<std::string, long> counts;
    };
    std::array<Shard, kShards> shards_;
    Shard& shard_for(const std::string& key) {
        return shards_[std::hash<std::string>{}(key) % kShards];
    }
public:
    void add(const std::string& key, long v) {
        Shard& s = shard_for(key);
        std::lock_guard<std::mutex> g(s.m);          // contention only within one shard
        s.counts[key] += v;
    }
    long get(const std::string& key) {
        Shard& s = shard_for(key);
        std::lock_guard<std::mutex> g(s.m);
        auto it = s.counts.find(key);
        return it == s.counts.end() ? 0 : it->second;
    }
};

int main() {
    ShardedCounter c;
    std::vector<std::thread> ts;
    for (int t = 0; t < 8; ++t)
        ts.emplace_back([&c, t] {
            for (int i = 0; i < 10000; ++i) c.add("sym" + std::to_string((t + i) % 32), 1);
        });
    for (auto& t : ts) t.join();
    long total = 0;
    for (int k = 0; k < 32; ++k) total += c.get("sym" + std::to_string(k));
    std::cout << "total=" << total << " sizeof(shard)=" << sizeof(ShardedCounter) / 16 << '\n';
}
```
- Output: `total=80000 sizeof(shard)=128` (libstdc++ x86-64: 40-byte mutex + 56-byte map rounded up to two 64-byte lines).
- An operation that needs two keys in different shards now needs two locks: use `std::scoped_lock` or a fixed shard order.
- The next step up is single-owner sharding: each shard is touched by one thread only, and the mutexes disappear.

### QUICK_REFERENCE: Cheat Sheet

#### Which lock wrapper?
| Situation | Use |
|---|---|
| Lock for a whole scope | `std::scoped_lock lk(m);` or `std::lock_guard<std::mutex> lk(m);` |
| Two or more mutexes | `std::scoped_lock lk(m1, m2);` |
| Condition variable wait | `std::unique_lock<std::mutex> lk(m);` |
| Unlock early / relock | `std::unique_lock` |
| Return or move a held lock | `std::unique_lock` |
| Try without waiting | `std::unique_lock lk(m, std::try_to_lock); if (lk.owns_lock())` |
| Wait with a timeout | `std::timed_mutex` + `try_lock_for` |
| Many readers, rare writers | `std::shared_mutex` + `std::shared_lock` (read) / `std::unique_lock` (write) |

#### UB and surprises
| Action | Result |
|---|---|
| Relock `std::mutex` in the owner thread | UB, hangs in practice |
| `unique_lock::lock()` while owning | Throws `system_error` (resource deadlock) |
| Unlock from non-owner | UB |
| Destroy locked mutex | UB |
| Owner thread exits holding the lock | UB (glibc: stays locked forever) |
| `shared_lock` then `unique_lock` in one thread | UB, self-deadlock |
| `std::lock_guard<std::mutex>{m};` | Locks and unlocks immediately |
| `std::unique_lock<std::mutex>(m);` | Declares a new variable `m`; locks nothing |
| `try_lock()` returns false | Maybe held, maybe spurious |

#### Implementation facts (glibc/Linux, not guaranteed by C++)
| Fact | Detail |
|---|---|
| `sizeof(std::mutex)` | 40 bytes (`pthread_mutex_t`) |
| `sizeof(std::shared_mutex)` | 56 bytes (`pthread_rwlock_t`) |
| Uncontended lock/unlock | User-space atomic, no syscall |
| Contended wait | `futex(FUTEX_WAIT)`, thread sleeps |
| Default mutex spin | None (adaptive type spins) |
| `std::shared_mutex` policy | Reader-preferring: writers can starve |
| Fairness | None; woken threads re-compete |

#### Interview one-liners
| Question | Answer |
|---|---|
| How does a mutex prevent a data race? | Mutual exclusion plus unlock-synchronizes-with-lock, if every access uses the same mutex |
| Does a mutex decide who goes first? | No |
| `lock_guard` vs `unique_lock`? | Same exclusivity; `unique_lock` adds defer, unlock/relock, move, timed, CV support |
| Why does CV need `unique_lock`? | `wait` must unlock while sleeping and relock before returning |
| Can another thread unlock my mutex? | No, UB; use a semaphore for signaling |
| Thread exits holding the lock? | Lock is never released |
| Does every lock enter the kernel? | No; only contended waits that sleep (and the matching wake) |
| Uncontended cost? | Tens of cycles: a couple of atomic RMWs |
| Is `shared_mutex` faster? | Only for long reads and rare writes; fairness is implementation-defined |
| Shared to exclusive upgrade? | Not supported; release, lock exclusively, re-check |
| Fix a lock held across slow work? | Snapshot under the lock, work outside |
| Global map mutex too hot? | Shard by key; better, single owner per shard |
