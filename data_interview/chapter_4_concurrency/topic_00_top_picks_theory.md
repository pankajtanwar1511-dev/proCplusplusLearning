## TOPIC: Top 50: Must-Know Concurrency Interview Questions

### THEORY_SECTION: Start Here

#### 1. How to use this list
- The 50 highest-value items from this chapter: 25 interview questions and 25 code puzzles.
- Every topic in the chapter is represented, so this list doubles as a fast revision pass before an interview.
- Each item is built around a misconception that many engineers hold. Answer it yourself before revealing the answer.
- Every answer ends with a "Deep dive" pointer to the full topic for more questions on the same idea.
- Interview Q&A tab: conceptual and design questions. Practice Tasks tab: output prediction and bug hunting.

#### 2. Coverage map
| Topic | Interview questions | Code puzzles |
|---|---|---|
| 1. std::thread: Creation, Lifetime and Argument Passing | 2 | 3 |
| 2. Data Races, Race Conditions and Deadlocks | 2 | 3 |
| 3. Mutexes and Lock Types | 3 | 2 |
| 4. Condition Variables and Producer-Consumer Signalling | 3 | 2 |
| 5. std::atomic and Compare-and-Swap | 2 | 3 |
| 6. Memory Ordering and the C++ Memory Model | 2 | 3 |
| 7. Spinlocks, Busy-Waiting and Backoff | 2 | 1 |
| 8. Lock-Free Programming and the ABA Problem | 3 | 1 |
| 9. Concurrent Queues and Ring Buffers | 3 | 2 |
| 10. async, future/promise, thread_local and call_once | 2 | 3 |
| 11. C++20 Synchronization: latch, barrier, semaphore, jthread | 1 | 2 |
| **Total** | **25** | **25** |

#### 3. Suggested order
- First pass: the Practice Tasks tab, top to bottom. Predict each output before revealing it.
- Second pass: the Interview Q&A tab. Say each answer out loud in under a minute, then compare.
- Any item you miss: open its Deep dive topic and work through that topic's full question set.

### EDGE_CASES: The Traps That Catch the Most Engineers

#### Edge Case 1: A finished thread is still joinable
- Assumption: "the worker printed and returned long ago, so leaving `main` is safe".
- Reality: `joinable()` stays `true` until `join()`/`detach()`/move. The destructor calls `std::terminate()` (libstdc++ prints `terminate called without an active exception` and aborts).
- Bonus trap: `abort()` does not flush stdio buffers. If stdout is piped to a file, the worker's earlier output may be lost entirely.
```cpp
#include <chrono>
#include <iostream>
#include <thread>

int main() {
    std::thread t([] { std::cout << "worker done\n"; });
    std::this_thread::sleep_for(std::chrono::milliseconds(100)); // worker surely finished
}   // ~thread(): joinable() == true -> std::terminate()
```
- Deep dive: Topic 1, std::thread: Creation, Lifetime and Argument Passing

#### Edge Case 2: A data race can delete your loop
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
- Deep dive: Topic 2, Data Races, Race Conditions and Deadlocks

#### Edge Case 3: The lock that locks nothing
- `std::lock_guard<std::mutex>{m};` creates a temporary that locks and unlocks immediately, at the end of the full expression.
- `std::unique_lock<std::mutex>(m);` is parsed as a **declaration** of a new default-constructed `unique_lock` named `m`, shadowing the mutex. It locks nothing. GCC warns: "unnecessary parentheses in declaration of 'm'".
- `std::lock_guard<std::mutex>(m);` is also a declaration, but `lock_guard` has no default constructor, so it fails to compile (the lucky case).
- `std::scoped_lock lk;` with no arguments compiles and locks nothing.
- Rule: always name the guard: `std::lock_guard<std::mutex> lock(m);`.
- Deep dive: Topic 3, Mutexes and Lock Types

#### Edge Case 4: The notification happened before anyone waited
- What people assume: the consumer will "receive" the earlier `notify_one`.
- What happens: the notify found no waiter and was dropped. A raw `cv.wait(lock)` blocks forever (or until a spurious wakeup), even though `ready == true`.
- Why the predicate form is safe: it checks `ready` first and never blocks.

```cpp
// producer already ran: ready = true; notify_one();
std::unique_lock<std::mutex> lk(m);
cv.wait(lk);                          // ❌ may block forever
cv.wait(lk, [] { return ready; });    // ✅ returns immediately
```
- Deep dive: Topic 4, Condition Variables and Producer-Consumer Signalling

#### Edge Case 5: `x = x + 1` is not `x += 1`
- People assume: "`x` is atomic, so any expression on it is atomic."
- What happens: `x = x + 1` calls `load()`, adds in a register, then `store()`. Two threads can both load 5 and both store 6.
- Not undefined behaviour (each access is atomic), but a **logic bug: lost updates**.
- `x += 1`, `++x`, `x.fetch_add(1)` are each one RMW and never lose increments.
```cpp
#include <atomic>
std::atomic<int> x{0};
void bad()  { x = x + 1; }        // load, add, store: can lose updates
void good() { x += 1; }           // one atomic RMW (lock add on x86)
int main() { bad(); good(); return x.load() == 2 ? 0 : 1; }
```
- Deep dive: Topic 5, std::atomic and Compare-and-Swap

#### Edge Case 6: Acquire on one side only gives you nothing
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
- Deep dive: Topic 6, Memory Ordering and the C++ Memory Model

#### Edge Case 7: Holder preempted while waiters spin (oversubscription)
- With more runnable threads than cores, the holder can be descheduled mid-section.
- Waiters then spin for whole time slices, and they are the very threads stopping the holder from being rescheduled.
- Measured on a 20-CPU machine with 80 threads: a TAS spinlock took 16 to 19 s for work a `std::mutex` did in under 1 s.
- Deep dive: Topic 7, Spinlocks, Busy-Waiting and Backoff

#### Edge Case 8: A null check does not detect a freed node
- People assume: "Before dereferencing `old`, check it is not null."
- What happens: T1 loads `old = A`. T2 pops A and `delete`s it. T1's `old` still holds A's address: `old != nullptr` is true, `old->next` is a use-after-free (UB).
- `delete p` only affects the object, not every copy of the pointer in other threads.
- Fix: a reclamation scheme (hazard pointers, epochs, RCU) or never freeing nodes while the structure is live.
- Deep dive: Topic 8, Lock-Free Programming and the ABA Problem

#### Edge Case 9: Full check on masked indices never fires
- Assumption: with wrapped indices, "full" is `(tail & mask) + 1 == (head & mask)`.
- Reality: when `tail & mask == N - 1`, the left side is `N`, which can never equal a masked value. The push proceeds, `tail` wraps to equal `head`, and a full queue now looks **empty**: N elements silently disappear.
- Correct options:
  - Monotonic indices: `full = (tail - head == N)`, `empty = (tail == head)`.
  - Wrapped indices: `full = (((tail + 1) & mask) == head)`, capacity is effectively `N - 1`.
```cpp
// Buggy:   (tail & MASK) + 1 == (head & MASK)  -> with N = 4, tail = 3, head = 0: 4 == 0 is false
// Correct: tail - head == N                     (monotonic size_t indices)
```
- Deep dive: Topic 9, Concurrent Queues and Ring Buffers

#### Edge Case 10: Discarded std::async future runs synchronously
- People assume `std::async(std::launch::async, f);` fires and forgets.
- The returned temporary `std::future` is destroyed at the end of the statement, and that destructor waits for the task. Code that "launches" tasks in a loop this way executes them one after another.
```cpp
for (auto& item : items)
    std::async(std::launch::async, process, item); // sequential! each waits
```
- Keep the futures (e.g. in a `std::vector<std::future<void>>`) or use a pool. C++20 compilers warn (`[[nodiscard]]`).
- Deep dive: Topic 10, async, future/promise, thread_local and call_once

#### Edge Case 11: `request_stop()` does not wake a thread blocked in std::condition_variable
- `std::condition_variable::wait` knows nothing about stop tokens. A `jthread` whose worker sleeps in `cv.wait(lock, pred)` will not wake on `request_stop()`, so the `jthread` destructor's `join()` blocks forever.
- Fixes:
  - `std::condition_variable_any` with the `wait(lock, token, pred)` overload.
  - Or a `std::stop_callback` that sets a flag under the mutex and calls `cv.notify_all()`.
- Deep dive: Topic 11, C++20 Synchronization: latch, barrier, semaphore, jthread

### CODE_EXAMPLES: Patterns Worth Memorizing

#### Example 1: Classic two-lock deadlock and the scoped_lock fix
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
- Deep dive: Topic 2, Data Races, Race Conditions and Deadlocks

#### Example 2: Snapshot under the lock, slow work outside
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
- Deep dive: Topic 3, Mutexes and Lock Types

#### Example 3: Worker pool with graceful (draining) shutdown
- Multiple consumers, `notify_one` per item, `notify_all` for shutdown, work processed outside the lock.
```cpp
#include <condition_variable>
#include <iostream>
#include <mutex>
#include <queue>
#include <thread>
#include <vector>

class WorkQueue {
public:
    void push(int v) {
        {
            std::lock_guard<std::mutex> lk(m_);
            if (stopping_) return;           // reject new work after shutdown
            q_.push(v);
        }
        cv_.notify_one();                    // one item -> one waiter
    }

    // Returns false when the queue is drained and shutdown was requested.
    bool pop(int& out) {
        std::unique_lock<std::mutex> lk(m_);
        cv_.wait(lk, [&] { return !q_.empty() || stopping_; });
        if (q_.empty()) return false;        // implies stopping_
        out = q_.front();
        q_.pop();
        return true;
    }

    void shutdown() {
        {
            std::lock_guard<std::mutex> lk(m_);
            stopping_ = true;
        }
        cv_.notify_all();                    // every worker must observe it
    }

private:
    std::mutex m_;
    std::condition_variable cv_;
    std::queue<int> q_;
    bool stopping_ = false;
};

int main() {
    WorkQueue wq;
    std::mutex sum_m;
    long sum = 0;
    int processed = 0;

    std::vector<std::thread> workers;
    for (int i = 0; i < 4; ++i) {
        workers.emplace_back([&] {
            int v;
            while (wq.pop(v)) {               // lock released inside pop
                long r = static_cast<long>(v) * v;   // "expensive" work, no lock
                std::lock_guard<std::mutex> lk(sum_m);
                sum += r;
                ++processed;
            }
        });
    }

    for (int i = 1; i <= 1000; ++i) wq.push(i);
    wq.shutdown();
    for (auto& t : workers) t.join();

    std::cout << "processed=" << processed << " sum=" << sum << '\n';
}
```
- Output: `processed=1000 sum=333833500` on every run: shutdown drains the queue before workers exit.
- Swap the exit test for `if (stopping_) return false;` and the count becomes nondeterministic.
- Deep dive: Topic 4, Condition Variables and Producer-Consumer Signalling

#### Example 4: Release/acquire publication of non-atomic data
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
- Deep dive: Topic 6, Memory Ordering and the C++ Memory Model

#### Example 5: SPSC ring buffer with padding and cached indices
- Producer and consumer never share a written variable on the same line; each side reloads the other's index only when it has to.
```cpp
#include <array>
#include <atomic>
#include <cstddef>
#include <iostream>
#include <memory>
#include <new>
#include <thread>

#ifdef __cpp_lib_hardware_interference_size
inline constexpr std::size_t kCacheLine = std::hardware_destructive_interference_size;
#else
inline constexpr std::size_t kCacheLine = 64;   // typical x86-64 / most ARM cores
#endif

template <typename T, std::size_t N>
class SpscRing {
    static_assert(N >= 2 && (N & (N - 1)) == 0, "N must be a power of two");
    static constexpr std::size_t kMask = N - 1;

    // Producer-owned cache line
    alignas(kCacheLine) std::atomic<std::size_t> tail_{0};  // written only by producer
    std::size_t cached_head_ = 0;                            // producer's private copy

    // Consumer-owned cache line
    alignas(kCacheLine) std::atomic<std::size_t> head_{0};  // written only by consumer
    std::size_t cached_tail_ = 0;                            // consumer's private copy

    alignas(kCacheLine) std::array<T, N> buf_{};

public:
    bool try_push(const T& value) {
        const std::size_t t = tail_.load(std::memory_order_relaxed);   // own index
        if (t - cached_head_ == N) {                                    // looks full
            cached_head_ = head_.load(std::memory_order_acquire);       // slot reads done
            if (t - cached_head_ == N) return false;                    // really full
        }
        buf_[t & kMask] = value;
        tail_.store(t + 1, std::memory_order_release);                  // publish element
        return true;
    }

    bool try_pop(T& out) {
        const std::size_t h = head_.load(std::memory_order_relaxed);   // own index
        if (h == cached_tail_) {                                        // looks empty
            cached_tail_ = tail_.load(std::memory_order_acquire);       // element writes done
            if (h == cached_tail_) return false;                        // really empty
        }
        out = buf_[h & kMask];
        head_.store(h + 1, std::memory_order_release);                  // free the slot
        return true;
    }
};

int main() {
    constexpr int kCount = 1'000'000;
    auto ring = std::make_unique<SpscRing<int, 1024>>();   // over-aligned new is fine in C++17

    std::thread producer([&] {
        for (int i = 1; i <= kCount; ++i)
            while (!ring->try_push(i)) { /* full: spin (policy = backpressure) */ }
    });

    long long sum = 0;
    bool in_order = true;
    int expected = 1;
    for (int received = 0; received < kCount;) {
        int v;
        if (ring->try_pop(v)) {
            in_order &= (v == expected++);
            sum += v;
            ++received;
        }
    }
    producer.join();

    std::cout << "in order: " << std::boolalpha << in_order << ", sum = " << sum << '\n';
}
```
- Output: `in order: true, sum = 500000500000`.
- Runs clean under `-fsanitize=thread`. Removing either `release` (or either `acquire`) makes TSan report a data race on `buf_`.
- `cached_head_` is touched only by the producer and `cached_tail_` only by the consumer, so they are plain variables sitting on their owner's line.
- Deep dive: Topic 9, Concurrent Queues and Ring Buffers

#### Example 6: Magic static vs call_once for lazy initialization
- Both are thread-safe; the static is simpler when the job is "construct one object".
```cpp
#include <iostream>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

struct Config {
    Config() { std::cout << "Config constructed once\n"; }
    std::string name = "prod";
};

const Config& config() {
    static const Config instance; // C++11 thread-safe initialization
    return instance;
}

class Registry {
public:
    void ensure_loaded() {
        std::call_once(loaded_, [this] {
            entries_ = {"a", "b", "c"};
            std::cout << "Registry loaded once\n";
        });
    }
    std::size_t size() const { return entries_.size(); }
private:
    std::once_flag loaded_;               // per-object once, not possible with a local static
    std::vector<std::string> entries_;
};

int main() {
    Registry reg;
    std::vector<std::thread> ts;
    for (int i = 0; i < 8; ++i)
        ts.emplace_back([&reg] {
            (void)config().name;
            reg.ensure_loaded();
        });
    for (auto& t : ts) t.join();
    std::cout << "entries: " << reg.size() << '\n';
}
```
- Output: `Config constructed once` and `Registry loaded once` (either order), then `entries: 3`.
- `once_flag` as a member gives "once per object", which a function-local static (once per program) cannot express.
- Deep dive: Topic 10, async, future/promise, thread_local and call_once

### QUICK_REFERENCE: Interview One-Liners for the Whole Chapter

#### std::thread: Creation, Lifetime and Argument Passing
| Question | One-liner |
|---|---|
| Destroy without join/detach? | `std::terminate()`, because the object is still joinable, even if the thread already finished. |
| What does `joinable()` mean? | Handle owns a thread not yet joined or detached; not "is running". |
| Ways to become non-joinable? | `join()`, `detach()`, moved-from (or default-constructed). |
| Why move-only? | Unique ownership of an OS thread: one owner joins it. |
| How are args passed? | Decay-copied into thread storage in the creating thread, passed as rvalues. |
| `int&` param with plain arg? | Compile error; use `std::ref`. |
| Exception escapes thread? | `std::terminate()`; propagate with `exception_ptr` or futures. |
| What does `join()` guarantee? | Thread finished and its writes happen-before code after `join()`. |
| Does `join()` extend worker locals? | No; they die when the worker function returns. |
| `jthread` destructor? | `request_stop()` then `join()`. |
| `request_stop()` kills the thread? | No, cooperative; worker must check its token. |
| How many threads for CPU-bound work? | Start near available logical CPUs, then benchmark. |
| Thread per task at 10k tasks/s? | No: tens of microseconds per creation; use a pool. |

#### Data Races, Race Conditions and Deadlocks
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

#### Mutexes and Lock Types
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

#### Condition Variables and Producer-Consumer Signalling
| Question | One-liner |
|---|---|
| What is a CV? | A way to block until shared state may have changed; the predicate is the state, the CV is only the doorbell. |
| Why a mutex? | It protects the predicate and lets `wait` release-and-register atomically, closing the lost-wakeup gap. |
| Why `unique_lock`? | `wait` must unlock while blocked and relock before returning; `lock_guard` cannot. |
| Why a loop / predicate? | Spurious wakeups, stolen wakeups, and notifications meant for other predicates. |
| Lost wakeup? | A notify that happens between "checked the state" and "started waiting"; it is dropped because CVs keep no memory. |
| Notify under lock? | Correct either way; after unlock is usually cheaper. |
| `notify_all` cost? | Thundering herd: all wake, serialize on the mutex, most go back to sleep. |
| `wait_for`? | Blocking wait with a deadline; use the predicate overload; timeout is not "condition false". |
| Shutdown? | Predicate `!q.empty() || stopping`, set `stopping` under the lock, `notify_all`, drain or abandon on purpose. |
| Atomic flag without lock? | No data race, but lost wakeup returns; lock the mutex between the store and the notify. |
| CV vs semaphore? | A semaphore remembers releases as a count; a CV forgets notifications. |

#### std::atomic and Compare-and-Swap
| Question | One-liner |
|---|---|
| What does `std::atomic` guarantee? | Indivisible operations on one object, no data race, one modification order; ordering is a separate knob. |
| Is `++atomic` atomic? | Yes, it is an atomic RMW; `x = x + 1` is not. |
| Why does `load`/`store` increment fail? | The gap between two atomic operations, not the local variable. |
| What does CAS do on failure? | Returns false and writes the current value into `expected`. |
| weak vs strong? | Weak may fail spuriously; use it in loops. Strong for one-shot decisions. |
| Why the CAS loop? | Competing writers plus spurious failure; recompute `desired` each time. |
| Is a CAS loop wait-free? | No, lock-free: someone succeeds, a given thread may starve. |
| Is `std::atomic<T>` lock-free? | Not guaranteed; check `is_always_lock_free`; only `atomic_flag` is guaranteed. |
| Does atomic flush the store buffer? | Not a C++ concept; hardware mechanism varies by order and CPU. |
| Atomic or mutex? | Atomic for one independent value, mutex for multi-variable invariants; measure. |
| Can relaxed tear? | No; memory order never affects atomicity. |
| Why atomic for a bool flag? | Plain concurrent access is a data race (UB); compiler may hoist the load. |
| Why do atomics scale badly? | Every write needs exclusive cache-line ownership; the line ping-pongs. |
| `atomic<shared_ptr>`? | C++20, atomic replace/read of one `shared_ptr` object; usually not lock-free. |

#### Memory Ordering and the C++ Memory Model
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

#### Spinlocks, Busy-Waiting and Backoff
| Question | One-liner |
|---|---|
| Spinlock vs mutex? | Spinlock burns CPU to avoid sleep/wake cost; a mutex sleeps. Spin only for tiny sections on dedicated cores. |
| Can two threads both acquire? | No: atomic RMWs on one object are totally ordered; only one reads `false`. |
| Why TTAS? | Spinning on an RMW keeps stealing the cache line; spinning on a load keeps a shared copy. |
| What does `pause` do? | Spin-wait hint: saves power, helps the SMT sibling, avoids a pipeline flush on loop exit. |
| Memory orders? | Acquire on lock, release on unlock; relaxed is only OK for the test load. |
| Holder preempted? | Waiters spin away whole time slices; oversubscription makes spinlocks catastrophically slow. |
| Priority inversion? | High-priority spinner on the holder's core never lets the holder run: livelock. |
| Hybrid mutex? | Spin briefly, then sleep on a futex; unlock wakes only if someone sleeps. |
| Does `std::mutex` spin? | Implementation-defined; glibc's default mutex goes straight to futex wait. |
| Better than a spinlock on a hot path? | Often no lock at all: SPSC queue, seqlock, double buffering, per-thread data. |

#### Lock-Free Programming and the ABA Problem
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

#### Concurrent Queues and Ring Buffers
| Question | One-liner |
|---|---|
| Why no mutex in SPSC? | Each index has a single writer; atomics only publish it to the other side. |
| Why release on `tail`? | It publishes the element written before it to the consumer's acquire load. |
| Why release on `head`? | It guarantees the consumer finished reading before the producer reuses the slot. |
| Why power of two? | Wrap with a mask; mandatory if you mask, minor speed-up for constant N. |
| What does `alignas` buy? | No false sharing; no synchronization. |
| Why is MPSC harder? | Reservation and publication are separate events, so `tail` no longer means "ready". |
| Is Vyukov's bounded MPMC lock-free? | No: a producer stalled between reserve and publish blocks consumers at that slot. |
| What does `cv.wait` do with the mutex? | Releases it atomically while waiting, reacquires it before rechecking the predicate. |
| Queue is full, now what? | Policy from data semantics: block, fail, drop, conflate; never silently overwrite incremental data. |
| Make the queue bigger? | Absorbs bursts only; depth is latency; fix sustained mismatch in the consumer. |
| Mutex always a syscall? | No, only when contended after the user-space fast path fails. |

#### async, future/promise, thread_local and call_once
| Question | One-liner |
|---|---|
| promise vs future? | Producer and consumer ends of one shared state carrying a value or exception. |
| Does `get()` wait for the thread to exit? | No, only for the result to be ready. |
| `get()` twice? | UB on `std::future` (libstdc++ throws `no_state`); use `shared_future`. |
| Promise destroyed unset? | Future gets `broken_promise`. |
| Default `std::async` policy? | `async \| deferred`, implementation picks; may never run. |
| Discarded `std::async` future? | Destructor blocks: runs synchronously. |
| `std::async` in a hot path? | No: thread creation, allocation, scheduling jitter. Use a pinned pool/queue. |
| Why a thread pool? | Amortize thread creation, cap concurrency; must handle backpressure. |
| What is `thread_local`? | Thread storage duration: one instance per thread. |
| `thread_local` lifetime? | Per thread: lazily or at first use, destroyed at that thread's exit. |
| `call_once` vs if-flag? | call_once synchronizes, waits, publishes, retries on throw; the if-flag races. |
| `call_once` callable throws? | Flag not set; the next call retries. |
| Magic static or `call_once`? | Static for one lazily built object; call_once for arbitrary or per-object once. |

#### C++20 Synchronization: latch, barrier, semaphore, jthread
| Question | One-liner |
|---|---|
| Latch vs barrier? | Latch: one-shot countdown, anyone counts or waits. Barrier: reusable phases for a fixed set of participants, with a completion step. |
| Can a latch be reset? | No; make a new one or use a barrier. |
| Do I need a mutex to read worker results after `latch.wait()`? | No; `count_down` happens-before the return from `wait`. |
| Where does a barrier completion run? | On one participating thread, once per phase, before anyone is released. |
| Semaphore vs mutex? | Semaphore counts permits and has no owner; mutex enforces ownership. |
| Semaphore vs CV? | Semaphore remembers releases; a CV forgets notifications. |
| What does `atomic::wait(old)` do? | Sleeps while the value equals `old`; returns only after seeing a different value. |
| `jthread` vs `thread`? | `jthread` requests stop and joins in its destructor; `thread` calls `terminate` if still joinable. |
| Does `request_stop` interrupt? | No; it sets the stop state and runs callbacks; code must poll or use stop-aware waits. |
| Where does a `stop_callback` run? | In the thread calling `request_stop`, or immediately in the constructor if stop was already requested. |
