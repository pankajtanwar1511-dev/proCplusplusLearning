## TOPIC: shared_ptr and Thread Safety

### THEORY_SECTION: Core Concepts

#### 1. Mental model: three layers, three questions
- Every `shared_ptr` situation has three separate things that threads can touch:
  - **The handle**: one particular `shared_ptr` object (a global, a member, a vector element).
  - **The control block**: the shared counts.
  - **The managed object**: the `T`.
- Ask three separate questions:
  - **A. Is the same handle accessed by several threads, with at least one writer?** If yes, it needs a mutex or `std::atomic<std::shared_ptr<T>>`.
  - **B. Is the object's lifetime protected?** Yes for every thread that holds its **own** `shared_ptr` copy (or a successful `weak_ptr::lock()`). No for raw pointers and references.
  - **C. Is the object's data accessed safely?** `shared_ptr` does nothing here. Immutable after publication, a mutex inside the object, or atomic members.
- One sentence for the interview: "`shared_ptr` makes ownership thread-safe, not the handle variable and not the object."

#### 2. What the standard actually guarantees
- Control-block operations are synchronized: two threads may copy, assign, reset or destroy **different** `shared_ptr` objects that share one control block, at the same time, without a data race. That is why the counts are atomic.
- The handle itself is an ordinary object:
  - Several threads may call `const` members on the **same** handle concurrently (copying from it, `get()`, `*`, `->`, `use_count()`), as long as nobody modifies it.
  - Any modification (`=`, `reset()`, `swap()`, move-from, destruction) concurrent with any other access to the **same** handle is a data race: UB.
- This is the same rule as for `int` or `std::string`: "const operations from many threads are fine; a writer needs exclusion". The atomic counts only extend it to "copies of each other may live in different threads".
- The managed object gets nothing: the standard says member functions of `shared_ptr` access only the `shared_ptr` objects themselves, not the objects they refer to.
- Destruction is the one point where the counts must also order the object's memory: the thread whose decrement reaches 0 has to see the other owners' writes before it runs the deleter. The standard only requires that this is correctly synchronized; typical implementations do it by making the decrement acquire-release (an implementation choice, not a wording in the standard).
- `weak_ptr::lock()` is atomic with respect to the other owners (it either gets a live owner or an empty pointer). The expired-then-lock race is topic 09.

| Situation | Safe? |
|---|---|
| Thread 1 `p1.reset()`, thread 2 `p2.reset()`, `p2` is a copy of `p1` | ✅ |
| Both threads copy **from** the same `g` while nobody writes `g` | ✅ |
| Thread 1 `auto local = g;`, thread 2 `g = make_shared<T>();` | ❌ data race on `g` |
| Thread 1 `g.reset()`, thread 2 `g->f()` | ❌ data race on `g` (and possible use-after-free) |
| Thread 1 `p1->x++`, thread 2 `p2->x++`, same object | ❌ data race on `x` |
| Both threads read an object never modified after publication | ✅ |

#### 3. Why the same handle is not safe: what a copy does
- Copying `g` is not one operation. Conceptually:
  - Read `g`'s stored pointer and control-block pointer (two words).
  - Atomically increment the strong count in that control block.
- If another thread reassigns `g` between those steps, it may drop the last reference: the control block is freed and the copying thread then increments a count in freed memory, or it pairs the new stored pointer with the old block.
- So the failure is not "you might get the old value or the new one". It is a data race: undefined behaviour, in practice torn handles, use-after-free, double destruction.
- Neither step being atomic on its own helps; the pair "read handle, then increment" must be atomic as a whole. That is exactly what a mutex or `atomic<shared_ptr>` provides.

#### 4. Pattern 1: mutex around the handle, use outside
- Hold the lock only to copy (or replace) the handle; the local copy then protects lifetime without the lock.
```cpp
std::shared_ptr<const Config> current() {
    std::lock_guard<std::mutex> lk(m_);
    return cfg_;                         // copy under the lock: +1 owner
}                                        // caller uses its copy with no lock held
```
- Replacing: build the new object **outside** the lock, then swap under the lock. Let the old one die **after** unlocking:
  - `std::shared_ptr<const Config> old;` `{ lock; old = std::exchange(cfg_, std::move(fresh)); }` then `old` is destroyed after the lock is released.
  - Otherwise, if the mutex holder drops the last reference, the old object's destructor (possibly freeing a big structure) runs inside the critical section.
- Pros: works on every compiler and standard version, trivially correct, multi-field updates are easy.
- Cons: readers serialize briefly on the mutex; under heavy read load the mutex cache line bounces between cores.

#### 5. Pattern 2: std::atomic<std::shared_ptr<T>> (C++20)
- A partial specialization in `<memory>` with `load`, `store`, `exchange`, `compare_exchange_weak/strong`, and C++20 `wait/notify`. Also `std::atomic<std::weak_ptr<T>>`.
- `load()` returns a new owning `shared_ptr` (count +1), so the reader's copy keeps the snapshot alive while the writer publishes newer ones.
- Not lock-free in practice: libstdc++ (GCC 12+) uses a lock bit inside the control-block pointer word plus futex waits; MSVC uses a spin lock bit. `is_lock_free()` returns `false`. Every `load()` also performs a refcount RMW on the shared control block.
- Toolchain fact: GCC 11's libstdc++ does not have it (`std::atomic<std::shared_ptr<int>>` fails with "std::atomic requires a trivially copyable type"); it arrived in GCC 12.
- Pre-C++20 equivalents: the free functions `std::atomic_load(&sp)`, `std::atomic_store(&sp, v)`, `std::atomic_exchange`, `std::atomic_compare_exchange_*` (C++11). They work on a plain `shared_ptr` object, but **every** access to that object must go through them; one plain `sp = x` breaks it. Deprecated in C++20, removed in C++26.
- Chapter 4 (topic 05, Q20) introduces `atomic<shared_ptr>`; this topic covers its use patterns and traps.

#### 6. Publication: atomicity vs ordering
- Two separate jobs:
  - **Atomicity of the handle**: concurrent readers and writers of one `shared_ptr` variable must not race. Needs a mutex or `atomic<shared_ptr>`.
  - **Visibility of the object's contents**: a reader that obtains the new pointer must also see the fields written before publication. Needs release/acquire (or stronger) on the publishing operation.
- `atomic<shared_ptr>` with `store(p, release)` / `load(acquire)` (or the default `seq_cst`) does both.
- Special case that is **safe** without `atomic<shared_ptr>`: a plain `shared_ptr` written exactly **once** before a release store to a flag, and read only after an acquire load of that flag:
  - The write of the handle happens-before every read of it, so there is no data race (two accesses that are ordered by happens-before are not a race).
  - Verified: TSan clean over 50 runs, prints 42 each time.
  - It breaks as soon as the handle is written again while readers may be reading it (republication); TSan then reports a data race.
- The flag pattern is a one-shot publication. For repeated updates use `atomic<shared_ptr>` or a mutex.
- Memory-order theory itself (release/acquire, happens-before, seq_cst) is Chapter 4, topic 06.

#### 7. Copy-on-write snapshots and the lost update
- Read-mostly shared data (configuration, routing table, risk limits, symbol directory):
  - Store it as `std::shared_ptr<const T>` and never mutate a published `T`.
  - Writer: copy the current snapshot, modify the copy, publish the new pointer.
  - Readers: take a snapshot once per operation, use it, drop it. Old snapshots die when their last reader finishes.
- `const` in `shared_ptr<const T>` makes accidental mutation of a published snapshot a compile error.
- Multiple writers and the **lost update**:
  - Writer A loads v1, writer B loads v1, both build v2 from v1 and store: one update is lost.
  - Fix 1: a mutex that serializes writers only (readers stay on `load()`).
  - Fix 2: a CAS loop: `compare_exchange_weak(expected, desired)` publishes only if the current value is still the snapshot the copy was built from; otherwise retry from the new value.
- CAS on `atomic<shared_ptr>` compares both the stored pointer and the control block (same pointer and same ownership), so ABA via address reuse cannot fool it while `expected` holds an owning reference.
- Cost: one allocation plus a full copy per update. Fine for rare updates of moderate objects; wrong for a 10 MB table updated 1000 times per second (use sharding, versioned deltas, or a different structure).

#### 8. Reference-count cost and contention
- Every copy is an atomic increment and every destruction an atomic decrement on the control block's cache line.
- Measured, GCC 11 `-O2`, 20-core x86-64, 2,000,000 iterations per thread, each iteration passing a `shared_ptr<Order>` by value (copy + destroy):

| Threads | Same control block | One block per thread | Pass `const Order&` |
|---|---|---|---|
| 1 | about 11 ns | about 10 ns | well under 1 ns |
| 8 | about 220 to 235 ns | about 65 to 80 ns | well under 1 ns |

- Same block, 8 threads: about 20 times slower per copy; the cache line ping-pongs between cores. (Numbers are wall time per iteration with all threads running.)
- "One block per thread" still slows down: eight 24-byte `make_shared<Order>` blocks sit next to each other in memory, so they share cache lines (false sharing between unrelated control blocks).
- Who runs the destructor: the thread whose decrement reaches 0. With asynchronous readers that can be any reader, including a latency-critical one, which then pays for freeing a big snapshot.
- Mitigations, in order:
  - Pass `const T&` or `T*` to code that only uses the object during the call.
  - Take one snapshot per batch or per message, not per field access.
  - Move instead of copy when handing ownership on.
  - Keep the last-owner destruction off the hot path (writer keeps retired snapshots in a list and frees those whose `use_count()` dropped to 1; this is reliable only because nobody else can create a new owner of a retired snapshot).
  - If profiling still shows refcount traffic: single owner plus non-owning access with explicit reclamation (completion counters, epochs, hazard pointers, RCU). C++26 standardizes `<hazard_pointer>` and `<rcu>`. See Chapter 4, topic 08.

#### 9. use_count() in concurrent code
- `use_count()` is a relaxed read of a value other threads change at any moment: it is a hint for logging and tests, not a synchronization tool.
- `if (p.use_count() == 1) { /* I am the only owner, mutate without locking */ }` is a race in general: another thread holding a `weak_ptr` can `lock()` right after the check.
- `shared_ptr::unique()` was deprecated in C++17 and removed in C++20 for exactly this reason.
- The one reliable case: no other `shared_ptr` or `weak_ptr` to the object exists anywhere except ones you control (for example, retired snapshots in section 8).

#### 10. Misconceptions to unlearn
- ❌ "`shared_ptr` is thread-safe." ✅ Its control block is. The handle variable and the object are not.
- ❌ "`shared_ptr` is not thread-safe, so every copy needs a mutex." ✅ Copies of each other used in different threads are fine; only a shared handle with a writer needs protection.
- ❌ "Release/acquire on a flag never makes a plain `shared_ptr` safe." ✅ For a single write before the release store it does (no conflicting concurrent access). It fails as soon as the handle is written again.
- ❌ "Release/acquire makes ordinary `shared_ptr` assignment atomic." ✅ Ordering is not atomicity; repeated concurrent writes still race.
- ❌ "`atomic<shared_ptr>` is lock-free, so it is a lock-free data structure." ✅ It is usually implemented with a lock bit; `is_lock_free()` is false.
- ❌ "`atomic<shared_ptr>` makes the object thread-safe." ✅ It protects the handle only; publish immutable objects.
- ❌ "Copy-on-write with `atomic<shared_ptr>` is correct with multiple writers." ✅ Load-copy-store loses updates; serialize writers or use a CAS loop.
- ❌ "If the race happens, the reader just sees the old or the new pointer." ✅ It is UB; real failures include use-after-free in the refcount.
- ❌ "No mutex means no synchronization cost." ✅ Every load and copy is an atomic RMW on a shared cache line.
- ❌ "`use_count() == 1` means I own it exclusively." ✅ Only if no `weak_ptr` or other thread can create an owner concurrently.

### EDGE_CASES: Traps and Misconceptions

#### Edge Case 1: Copy and reassignment of one global handle
- `std::shared_ptr<Config> g;` Thread 1: `auto c = g;` Thread 2: `g = std::make_shared<Config>();`
- Both threads access the same handle and one writes: data race, UB. TSan: "WARNING: ThreadSanitizer: data race" in `shared_ptr` copy vs assignment.
- Even when the program "works", the failure mode is not "stale value"; it is a refcount operation on a control block that may already be freed.
- Fix: mutex around copy and assignment, or `std::atomic<std::shared_ptr<Config>>`.

#### Edge Case 2: Many readers, no writer: safe
- If `g` is initialized before the threads start and never modified until they are joined, any number of threads can do `auto c = g;` concurrently.
- Copying only reads `g`; the increments go to the atomic count. TSan stays silent.
- The trap is the opposite assumption: adding one "rare" `g.reset()` at shutdown while readers still run reintroduces the race.

#### Edge Case 3: Write-once flag publication is safe; republication is not
- Producer: `data = d; ready.store(true, release);` Consumer: `while (!ready.load(acquire)) {}` then `data->value`.
- Safe: the only write to `data` happens-before every read of it.
- Add a second producer (or the same producer later) doing `data = std::make_shared<Data>();` while consumers read: TSan reports a data race on `data`.
- A source of confusion: some explanations call even the write-once version a race. It is not; the conflict needs two **unordered** accesses.

#### Edge Case 4: Two loads, two snapshots
- `int a = cfg.load()->limit; int b = cfg.load()->max_qty;` with `cfg` an `atomic<shared_ptr<const Config>>`.
- Each `load()` may return a different version: `a` from v1 and `b` from v2, a combination that never existed.
- Fix: `auto snap = cfg.load();` once, then read every field through `snap`. Same rule for the mutex pattern.

#### Edge Case 5: The last reader pays for destruction
- After a writer publishes v2, v1 is destroyed by whichever thread drops the last reference, often a reader on the hot path.
- If v1 is large (a big map), that reader suddenly spends microseconds to milliseconds in destructors and `free`. The same happens if the writer drops the last reference while holding a mutex.
- Fix: release old snapshots on a background or writer thread (retire list), or move the old pointer out of the critical section before it dies.

#### Edge Case 6: atomic<shared_ptr> is not lock-free
- `std::atomic<std::shared_ptr<T>>::is_lock_free()` is `false` on libstdc++ and MSVC; `is_always_lock_free` is `false`.
- Consequences: not usable from signal handlers, not a building block for a truly lock-free algorithm, and a preempted thread holding the internal lock bit delays others.
- GCC 11 does not provide it at all (compile error "std::atomic requires a trivially copyable type"); use the mutex pattern or the deprecated `std::atomic_load` free functions there.

#### Edge Case 7: Mixing atomic free functions with plain access
- Pre-C++20 code uses `std::atomic_load(&g)` and `std::atomic_store(&g, v)` on a plain `std::shared_ptr` object.
- They are safe only if **all** concurrent accesses to `g` use them. One ordinary `g.reset()` or `auto c = g;` elsewhere is a data race.
- That fragility is why C++20 moved to a distinct type (`atomic<shared_ptr>`): the type system now enforces the protocol.

#### Edge Case 8: A published object is mutated
- `auto c = cfg.load(); c->limit = 5;` compiles if the type is `shared_ptr<Config>`, and races with every reader of the same snapshot.
- `atomic<shared_ptr>` protected only the handle; the object is ordinary memory.
- Fix: publish `shared_ptr<const Config>`; writers always build a new object.

### CODE_EXAMPLES: Practical Demonstrations

#### Example 1: Copies of each other in different threads: no race
- Each thread receives its own `shared_ptr` copy, makes more copies, and resets them. Only the control block is shared.
```cpp
#include <iostream>
#include <memory>
#include <thread>
#include <vector>

struct Book {
    ~Book() { std::cout << "~Book (once)\n"; }
};

int main() {
    auto book = std::make_shared<Book>();
    std::vector<std::thread> ts;
    for (int t = 0; t < 8; ++t) {
        ts.emplace_back([p = book] {              // copy made in the main thread
            for (int i = 0; i < 100000; ++i) {
                std::shared_ptr<Book> local = p;   // copy of this thread's handle
                local.reset();
            }
        });
    }
    std::cout << "owners while running: >= 1\n";
    for (auto& t : ts) t.join();
    std::cout << "after join: " << book.use_count() << '\n';
    book.reset();
}
```
- Output:
```
owners while running: >= 1
after join: 1
~Book (once)
```
- TSan (`-fsanitize=thread`, run with `setarch -R`): no warnings. 1.6 million concurrent increments and decrements on one control block, all synchronized.

#### Example 2: Mutex pattern: copy under the lock, use and destroy outside it
- Readers take a snapshot under a short lock; the writer builds outside the lock and lets the old snapshot die after unlocking.
```cpp
#include <iostream>
#include <memory>
#include <mutex>
#include <thread>
#include <utility>
#include <vector>

struct Limits {
    int max_qty;
    int max_orders;    // invariant: max_orders == max_qty / 10
};

class LimitStore {
    mutable std::mutex m_;
    std::shared_ptr<const Limits> cur_ = std::make_shared<const Limits>(Limits{100, 10});
public:
    std::shared_ptr<const Limits> snapshot() const {
        std::lock_guard<std::mutex> lk(m_);
        return cur_;                                   // +1 owner, nothing else
    }
    void update(int qty) {
        auto fresh = std::make_shared<const Limits>(Limits{qty, qty / 10});  // no lock
        std::shared_ptr<const Limits> old;
        {
            std::lock_guard<std::mutex> lk(m_);
            old = std::exchange(cur_, std::move(fresh));
        }
    }                                       // old may be destroyed here, unlocked
};

int main() {
    LimitStore store;
    std::vector<std::thread> readers;
    int bad = 0;
    std::mutex bad_m;
    for (int r = 0; r < 4; ++r)
        readers.emplace_back([&] {
            for (int i = 0; i < 50000; ++i) {
                auto s = store.snapshot();             // one snapshot per operation
                if (s->max_orders != s->max_qty / 10) {
                    std::lock_guard<std::mutex> lk(bad_m);
                    ++bad;
                }
            }
        });
    std::thread writer([&] { for (int q = 100; q < 20100; q += 10) store.update(q); });
    for (auto& t : readers) t.join();
    writer.join();
    std::cout << "inconsistent snapshots: " << bad << '\n';
    std::cout << "final max_qty: " << store.snapshot()->max_qty << '\n';
}
```
- Output:
```
inconsistent snapshots: 0
final max_qty: 20090
```
- TSan: clean. Readers never see a half-updated `Limits` because published objects are never modified.

#### Example 3: Config reload with std::atomic<std::shared_ptr<const T>> (C++20, GCC 12+)
- Readers `load()` a snapshot without a mutex; one writer `store()`s new versions; old versions die with their last reader.
```cpp
#include <atomic>
#include <iostream>
#include <memory>
#include <thread>
#include <vector>

struct Config {
    int version;
    int max_speed;
    int max_distance;     // invariant: max_distance == 5 * max_speed
};

std::atomic<std::shared_ptr<const Config>> g_cfg{
    std::make_shared<const Config>(Config{0, 100, 500})};

int main() {
    std::cout << "lock-free: " << g_cfg.is_lock_free() << '\n';
    std::atomic<bool> stop{false};
    std::atomic<long> reads{0}, bad{0};
    std::vector<std::thread> readers;
    for (int r = 0; r < 4; ++r)
        readers.emplace_back([&] {
            while (!stop.load(std::memory_order_relaxed)) {
                auto c = g_cfg.load(std::memory_order_acquire);   // own snapshot
                if (c->max_distance != 5 * c->max_speed) ++bad;
                ++reads;
            }
        });
    for (int v = 1; v <= 1000; ++v) {
        auto next = std::make_shared<const Config>(Config{v, 100 + v, 5 * (100 + v)});
        g_cfg.store(std::move(next), std::memory_order_release);  // publish
    }
    stop = true;
    for (auto& t : readers) t.join();
    std::cout << "final version: " << g_cfg.load()->version
              << ", inconsistent: " << bad << ", reads > 0: " << (reads > 0) << '\n';
}
```
- Output (GCC 13, libstdc++):
```
lock-free: 0
final version: 1000, inconsistent: 0, reads > 0: 1
```
- TSan: clean. On GCC 11 this does not compile (no `atomic<shared_ptr>` specialization yet).
- The writer is single-threaded here. With several writers, see Example 5.

#### Example 4: One-shot publication through a release/acquire flag
- The plain `shared_ptr` is written exactly once, before the release store. No data race.
```cpp
#include <atomic>
#include <iostream>
#include <memory>
#include <thread>

struct Data { int value = 0; };

std::shared_ptr<Data> data;              // plain, not atomic
std::atomic<bool> ready{false};

void producer() {
    auto d = std::make_shared<Data>();
    d->value = 42;
    data = d;                                             // the only write to data
    ready.store(true, std::memory_order_release);         // publish
}

void consumer() {
    while (!ready.load(std::memory_order_acquire)) {}     // wait for publication
    std::cout << data->value << '\n';                     // reads data after the write
}

int main() {
    std::thread c(consumer), p(producer);
    p.join();
    c.join();
}
```
- Output: `42`. TSan: clean (also over 50 repeated runs).
- Why it is safe: write of `data` is sequenced before the release store; the acquire load that sees `true` synchronizes with it; the read of `data` is sequenced after. All accesses to `data` are ordered by happens-before.
- Add a thread that later does `data = std::make_shared<Data>();` while the consumer reads, and TSan reports a data race. For repeated updates use Example 3.

#### Example 5: Several writers: the lost update and the CAS loop
- Load, copy, modify, store loses updates under concurrency; `compare_exchange_weak` retries until it publishes on top of the version it copied.
```cpp
#include <atomic>
#include <iostream>
#include <memory>
#include <thread>
#include <vector>

struct Counters { long fills = 0; };
using Snap = std::shared_ptr<const Counters>;

std::atomic<Snap> naive{std::make_shared<const Counters>()};
std::atomic<Snap> safe{std::make_shared<const Counters>()};

void add_naive() {
    Snap cur = naive.load();
    auto next = std::make_shared<Counters>(*cur);
    ++next->fills;
    naive.store(std::move(next));                 // may overwrite another writer
}

void add_cas() {
    Snap cur = safe.load();
    for (;;) {
        auto next = std::make_shared<Counters>(*cur);
        ++next->fills;
        if (safe.compare_exchange_weak(cur, std::move(next)))
            return;                               // published on top of cur
        // failure: cur now holds the newer snapshot; rebuild from it
    }
}

int main() {
    std::vector<std::thread> ts;
    for (int t = 0; t < 4; ++t)
        ts.emplace_back([] {
            for (int i = 0; i < 10000; ++i) { add_naive(); add_cas(); }
        });
    for (auto& t : ts) t.join();
    std::cout << "naive: " << naive.load()->fills << " (expected 40000)\n";
    std::cout << "cas:   " << safe.load()->fills << '\n';
}
```
- Output (GCC 13; the naive number varies run to run):
```
naive: 38062 (expected 40000)
cas:   40000
```
- No data race in either version (TSan clean): the naive one is a **logic** race (lost update), which TSan cannot see.
- On failure `compare_exchange_weak` writes the current value into `cur`, so the loop rebuilds from the latest snapshot. `_weak` may also fail spuriously; the loop absorbs that.
- With expensive copies and many writers, a writer mutex (readers still lock-free-ish via `load()`) wastes less work than repeated CAS retries.

#### Example 6: Pre-C++20 code: the atomic free functions
- Works on GCC 11. Correct only because every access to `g_rates` goes through `std::atomic_load` / `std::atomic_store`.
```cpp
#include <atomic>
#include <iostream>
#include <map>
#include <memory>
#include <string>
#include <thread>

using Rates = std::map<std::string, double>;
std::shared_ptr<const Rates> g_rates =
    std::make_shared<const Rates>(Rates{{"USDJPY", 150.0}});

double rate(const std::string& ccy) {
    auto snap = std::atomic_load(&g_rates);                // C++11, deprecated in C++20
    return snap->at(ccy);
}

void publish(double px) {
    auto next = std::make_shared<const Rates>(Rates{{"USDJPY", px}});
    std::atomic_store(&g_rates, std::move(next));
}

int main() {
    std::thread w([] { for (int i = 1; i <= 1000; ++i) publish(150.0 + i / 100.0); });
    double last = 0;
    std::thread r([&] { for (int i = 0; i < 100000; ++i) last = rate("USDJPY"); });
    w.join();
    r.join();
    std::cout << "final: " << rate("USDJPY") << ", lock-free: "
              << std::atomic_is_lock_free(&g_rates) << '\n';
    (void)last;
}
```
- Output (GCC 11): `final: 160, lock-free: 0`. TSan: clean.
- libstdc++ implements these with a small global table of mutexes hashed by address; replacing one call with plain `g_rates = next;` makes TSan report a race.

#### Example 7: Measuring refcount contention
- Passing `shared_ptr` by value in a hot loop on 8 threads, same control block vs one block per thread vs a plain reference.
```cpp
#include <atomic>
#include <chrono>
#include <iostream>
#include <memory>
#include <thread>
#include <vector>

struct Order { long qty = 1; };
long use_copy(std::shared_ptr<Order> o) { return o->qty; }   // inc + dec per call
long use_ref(const Order& o) { return o.qty; }                // no refcount

template <class F>
double ns_per_iter(int threads, F f) {
    constexpr int kIters = 2'000'000;
    auto t0 = std::chrono::steady_clock::now();
    std::vector<std::thread> ts;
    for (int t = 0; t < threads; ++t) ts.emplace_back([&, t] { f(t, kIters); });
    for (auto& t : ts) t.join();
    std::chrono::duration<double, std::nano> d = std::chrono::steady_clock::now() - t0;
    return d.count() / kIters;
}

int main() {
    auto shared = std::make_shared<Order>();
    std::vector<std::shared_ptr<Order>> own;
    for (int i = 0; i < 8; ++i) own.push_back(std::make_shared<Order>());
    std::atomic<long> sink{0};                        // keeps results alive, race-free
    for (int n : {1, 8}) {
        double same = ns_per_iter(n, [&](int, int k) {
            auto mine = shared; long s = 0;
            for (int i = 0; i < k; ++i) s += use_copy(mine);
            sink.store(s, std::memory_order_relaxed);
        });
        double sep = ns_per_iter(n, [&](int t, int k) {
            auto mine = own[t]; long s = 0;
            for (int i = 0; i < k; ++i) s += use_copy(mine);
            sink.store(s, std::memory_order_relaxed);
        });
        double ref = ns_per_iter(n, [&](int, int k) {
            auto mine = shared; long s = 0;
            for (int i = 0; i < k; ++i) s += use_ref(*mine);
            sink.store(s, std::memory_order_relaxed);
        });
        std::cout << n << " thread(s): same block " << same << " ns, own block "
                  << sep << " ns, reference " << ref << " ns\n";
    }
}
```
- Compile with `-O2`. Output (20-core x86-64, GCC 11; timing varies):
```
1 thread(s): same block 11.4 ns, own block 11.1 ns, reference 0.15 ns
8 thread(s): same block 221.4 ns, own block 79.0 ns, reference 0.21 ns
```
- Same block: every copy fights for one cache line.
- Own block: the eight small `make_shared` blocks were allocated next to each other, so they still share cache lines (false sharing).
- Reference: the compiler hoists the load; there is nothing to synchronize.

#### Example 8: The last owner's thread runs the destructor
- After publishing v2, the reader that drops the last reference to v1 executes `~Snapshot` on its own thread.
```cpp
#include <chrono>
#include <iostream>
#include <memory>
#include <mutex>
#include <string>
#include <thread>

std::mutex out_m;
thread_local std::string t_name = "main";

struct Snapshot {
    int version;
    ~Snapshot() {
        std::lock_guard<std::mutex> lk(out_m);
        std::cout << "~Snapshot v" << version << " on thread " << t_name << '\n';
    }
};

std::mutex m;
std::shared_ptr<const Snapshot> g = std::make_shared<const Snapshot>(Snapshot{1});

int main() {
    std::shared_ptr<const Snapshot> held;
    {
        std::lock_guard<std::mutex> lk(m);
        held = g;                                   // reader's copy of v1
    }
    std::thread reader([h = std::move(held)]() mutable {
        t_name = "reader";
        std::this_thread::sleep_for(std::chrono::milliseconds(50));
        h.reset();                    // last owner of v1: destructor runs here
    });
    {
        std::lock_guard<std::mutex> lk(m);
        g = std::make_shared<const Snapshot>(Snapshot{2});   // v1 still owned by reader
    }
    reader.join();
}
```
- Output:
```
~Snapshot v1 on thread main
~Snapshot v2 on thread main
~Snapshot v1 on thread reader
~Snapshot v2 on thread main
```
- Lines 1 and 2 are the temporaries `Snapshot{1}` and `Snapshot{2}` passed to `make_shared` (copied into the block, then destroyed). Line 3 is the real v1, destroyed on the reader thread. Line 4 is v2 at program exit.
- In a low-latency system, line 3 is the problem: a reader paid for a destruction it did not ask for.

### QUICK_REFERENCE: Cheat Sheet

#### What is protected by what
| Layer | Shared between threads by | Protected by |
|---|---|---|
| Control block (counts) | All copies | Built-in atomics |
| One handle variable | Threads that read/write the same `shared_ptr` object | Mutex, `atomic<shared_ptr>` (C++20), `std::atomic_load/store` (C++11, deprecated C++20) |
| Managed object | Every owner and borrower | Immutability, internal mutex, atomic members |

#### Patterns
| Need | Pattern |
|---|---|
| Read-mostly data, any compiler | Mutex; copy handle under lock; use and destroy outside |
| Read-mostly data, C++20 (GCC 12+) | `std::atomic<std::shared_ptr<const T>>`, `load()` once per operation |
| One-shot initialization | Write handle once, then release-store a flag (or `std::call_once`) |
| Several writers | Writer mutex, or `compare_exchange_weak` loop |
| Hot path refcount traffic | Pass `const T&`, snapshot per batch, retire list, explicit reclamation |

#### Traps
| Code | Problem |
|---|---|
| `auto c = g;` vs `g = x;` in two threads | Data race on `g` |
| `cfg.load()->a` then `cfg.load()->b` | Two different snapshots |
| `naive.store(modified_copy_of(naive.load()))` with 2 writers | Lost update |
| `shared_ptr<Config>` published, then `c->x = 5` | Race on the object |
| Last owner drops a big snapshot on a hot thread or under a lock | Latency spike |
| `if (p.use_count() == 1)` as exclusivity check | Racy with `weak_ptr::lock()` |
| `atomic_load(&g)` here, `g.reset()` there | Race; all accesses must use the free functions |
| Expecting `atomic<shared_ptr>` to be lock-free | `is_lock_free()` is false (libstdc++, MSVC) |

#### Interview one-liners
| Question | Answer |
|---|---|
| Is `shared_ptr` thread-safe? | Control block yes; same handle with a writer no; object never |
| Two threads reset two copies? | Safe |
| One thread copies `g`, another reassigns `g`? | Data race; mutex or `atomic<shared_ptr>` |
| What does `atomic<shared_ptr>` protect? | The handle (load/store/CAS), not the object |
| Is it lock-free? | Not guaranteed; libstdc++ and MSVC use a lock bit |
| Release/acquire flag + plain `shared_ptr`? | Safe for one write before publication; racy if rewritten |
| Copy-on-write with two writers? | Lost update; serialize writers or CAS loop |
| Why is `shared_ptr` slow under threads? | Atomic RMW on a shared cache line per copy |
| Which thread runs the destructor? | The one that drops the last reference |
| Is `use_count()` reliable? | Only as a hint; `unique()` was removed in C++20 |
