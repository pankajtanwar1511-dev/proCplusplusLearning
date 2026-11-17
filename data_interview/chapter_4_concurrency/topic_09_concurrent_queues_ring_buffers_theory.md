## TOPIC: Concurrent Queues and Ring Buffers

### THEORY_SECTION: Core Concepts

#### 1. Mental model: a queue is a protocol for handing over slot ownership
- A concurrent queue moves **ownership of a slot** from a producer to a consumer, then back again.
  - Producer owns a free slot → writes the element → **publishes** it.
  - Consumer observes the publication → reads the element → **frees** the slot.
  - Producer observes the free slot → may reuse it.
- Every design question reduces to: who may write each index, and how is each hand-over made visible to the other thread?
- Four shapes, in increasing difficulty:

| Shape | Writers of enqueue index | Writers of dequeue index | Typical mechanism |
|---|---|---|---|
| SPSC | 1 | 1 | Plain atomic loads/stores with acquire/release, no CAS |
| MPSC | many | 1 | Atomic reservation (CAS or `fetch_add`) + per-slot publication |
| SPMC | 1 | many | Per-slot publication + CAS on dequeue index |
| MPMC | many | many | Per-slot sequence numbers (Vyukov style) or a mutex |

- **Bounded** = fixed capacity, allocated once. In a hot path this means:
  - No allocation, no `std::deque`/`std::queue` growth, predictable memory footprint.
  - You must define what happens when the queue is **full** (block, fail, drop, overwrite).
- Market data framing used throughout: feed handler thread (producer) → ring buffer → strategy thread (consumer).

#### 2. Blocking bounded queue: mutex + two condition variables
- State: `std::deque<T>` (or `std::queue<T>`), `capacity`, one `std::mutex`, two `std::condition_variable`s:
  - `not_full`: producers wait here while `size() == capacity`.
  - `not_empty`: consumers wait here while the queue is empty.
- Push: lock → `not_full.wait(lock, [&]{ return q.size() < cap; })` → push → unlock → `not_empty.notify_one()`.
- Pop: lock → `not_empty.wait(lock, [&]{ return !q.empty(); })` → move front out, pop → unlock → `not_full.notify_one()` → process **outside** the lock.
- What `cv.wait(lock, pred)` really does:
  - Equivalent to `while (!pred()) cv.wait(lock);`
  - Inside `wait`: **atomically** releases the mutex and enters the waiting state (no window for a lost notification).
  - After a notify (or a spurious wake): becomes runnable, **reacquires the mutex**, re-evaluates the predicate, and either returns (holding the lock) or waits again.
  - This is why it needs `std::unique_lock` (unlock and relock), not `std::lock_guard`.
- Correctness rule: the **state change** that makes the predicate true must happen while holding the mutex. Notifying inside or after the lock are both correct; notifying after unlock avoids waking a thread that immediately blocks on the mutex.
- Add a `close()` (set a flag under the lock, then `notify_all` on both CVs) so blocked threads can exit at shutdown.

#### 3. SPSC ring buffer: layout and indices
- Convention used here (names vary across codebases, reason by ownership not by name):
  - `tail` = next slot to write, **written only by the producer**.
  - `head` = next slot to read, **written only by the consumer**.
- Use **monotonic (unbounded) indices**, wrap only when indexing the array:
  - Empty: `head == tail`
  - Full: `tail - head == N`
  - Size: `tail - head` (unsigned arithmetic stays correct across `size_t` wraparound when `N` is a power of two)
  - Slot: `buf[index & (N - 1)]`
- Alternative scheme: store indices already wrapped to `[0, N)`; then full is `((tail + 1) & mask) == head` and **one slot is sacrificed** so that full and empty are distinguishable.
- Power-of-two capacity:
  - `i & (N - 1) == i % N` only for unsigned `i` and `N` a power of two.
  - For a **compile-time** constant power of two, compilers already turn `% N` into a mask for unsigned types. The mask matters when `N` is a runtime value (a real division costs tens of cycles) or for signed types.
  - With a non-power-of-two `N`, `& (N - 1)` is simply wrong (slots collide). `static_assert` it.
- No CAS needed: each index has exactly one writer. Atomics are needed only because the **other** side reads it.

#### 4. SPSC memory ordering: two synchronizes-with edges

| Thread | Own index | Other side's index | Publish own index |
|---|---|---|---|
| Producer | `tail.load(relaxed)` | `head.load(acquire)` | `tail.store(t + 1, release)` |
| Consumer | `head.load(relaxed)` | `tail.load(acquire)` | `head.store(h + 1, release)` |

- Edge 1 (publish data): producer writes `buf[t]` → `tail.store(release)` synchronizes-with the consumer's `tail.load(acquire)` that reads it → the element write **happens-before** the consumer's read of `buf[t]`.
- Edge 2 (free the slot): consumer reads `buf[h]` → `head.store(release)` synchronizes-with the producer's `head.load(acquire)` → the consumer's read **happens-before** the producer's next write into that slot.
- Relaxed load of your own index is fine: you are its only writer, so you always read your own latest value.
- Both edges are required by the C++ memory model. Explain it in C++ terms (synchronizes-with, happens-before), not as "release flushes the store buffer". On x86 both acquire load and release store compile to plain `mov`, but the compiler is still forbidden from reordering across them, and on ARM/POWER they emit real barriers or `ldar`/`stlr`.

#### 5. Cache effects: false sharing, cached indices, batching
- False sharing: `head` (written by consumer core) and `tail` (written by producer core) on the **same cache line** make that line bounce between cores on every operation, even though the threads touch different variables.
  - Fix: put each on its own line with `alignas(64)` or `alignas(std::hardware_destructive_interference_size)` (C++17, `<new>`, only available in GCC 12+ / recent compilers; guard with `__cpp_lib_hardware_interference_size`).
  - `alignas` changes **layout only**. It provides zero synchronization.
- Data slots near the meeting point **will** share lines when producer and consumer are close. That is the actual data transfer and is unavoidable; the goal is to stop **metadata** from bouncing on every operation.
- Cached indices (a standard optimization, e.g. in well-known open-source SPSC queues):
  - Producer keeps a private `cachedHead` and only reloads the shared `head` when the queue *looks* full.
  - Consumer keeps a private `cachedTail` and only reloads `tail` when the queue *looks* empty.
  - Cuts cross-core cache-line transfers from one per operation to roughly one per "lap" or burst.
- Batching: consume K elements, then do a single `head.store(release)`. Fewer stores, fewer coherence messages, higher throughput, slightly delayed slot release.
- Measure before padding everything: `perf`, cache-miss and HITM counters, p99/p99.9 latency histograms.

#### 6. MPSC and MPMC: reservation is not publication
- With several producers, two threads must not pick the same slot, so a producer first **reserves** a unique position (CAS loop or `fetch_add` on the enqueue counter).
- Reserving is a separate event from finishing the write. A producer can reserve slot 100, get preempted, while another producer reserves and fills slot 101.
  - The consumer must **not** treat "position < enqueue counter" as "data ready". In SPSC this was safe only because the single producer advances `tail` **after** writing.
- The consumer also cannot simply skip an unready slot: `head` would have to jump past a slot that is still owned by a producer, letting a later producer reuse that physical slot while the first one is still writing. Ordered queues therefore wait at the hole: **head-of-line blocking**.
- Per-slot sequence numbers (bounded MPMC, Vyukov style):
  - Slot `i` starts with `seq = i`.
  - Producer at position `pos` may write when `seq == pos`; after writing it stores `seq = pos + 1` (release): "ready for consumer at `pos`".
  - Consumer at position `pos` may read when `seq == pos + 1`; after reading it stores `seq = pos + N` (release): "free for the producer one lap later".
  - The sequence encodes **state and generation** (which lap the slot belongs to), which a plain `bool ready` cannot.
- Progress: if a producer is suspended forever between reservation and publication, the consumer waits at that slot forever and eventually the ring fills. Formally such a queue is **not lock-free** (no operation is guaranteed to complete), even though it uses no mutex.
- Unbounded linked-list MPMC queues additionally need safe memory reclamation (hazard pointers, epochs) to avoid ABA and use-after-free. In practice: use a vetted library or a mutex unless measurements justify the complexity.

#### 7. Full and empty policies (backpressure)

| Full-queue policy | Effect | Typical fit |
|---|---|---|
| Block / spin producer | Backpressure, upstream latency grows | Pipelines where upstream can slow down (logging, batch jobs) |
| Fail (`try_push` returns false) | Caller decides | Low-latency code, caller counts and alarms |
| Drop newest | Lose the incoming item | Telemetry, sampling |
| Overwrite oldest | Lose an unprocessed item | Only "latest value wins" data (e.g. conflated quotes), never with lock-free SPSC as is |
| Grow | Unbounded memory, allocation in hot path | Rarely acceptable in low latency |
| Coalesce / conflate | Merge updates per key | Snapshot-style state where intermediate values are replaceable |

- For an **incremental** market-data stream (each message updates book state), dropping or overwriting creates a sequence gap and corrupts derived state; the only safe outcomes are "keep up" or "detect and recover" (resync from snapshot).
- Do not confuse **internal queue overflow** (your consumer is too slow) with **network packet loss** (a UDP datagram never arrived). Sequence numbers detect the second; they do not fix the first.
- Empty-queue strategies for the consumer: busy spin (lowest latency, burns a core), spin with `_mm_pause`, spin then yield, spin then block (`std::atomic::wait`, futex, CV). Choose from the latency budget and core budget.

#### 8. Latency, throughput and capacity sizing
- A queue absorbs **bursts**; it cannot fix a **sustained** rate mismatch. Health condition: sustained consumer capacity ≥ producer arrival rate.
- Backlog math during a burst: growth = arrival rate - service rate.
  - Example: 50k/s in, 20k/s out, capacity 100k → grows 30k/s → full after 100k / 30k ≈ **3.33 s**.
  - After the burst (10k/s in, 20k/s out): drains at 10k/s, so a 100k backlog needs 10 s.
- Queue depth **is** latency: a new message waits ≈ depth / service rate (Little's law: L = λW). 90k queued at 20k/s ≈ 4.5 s of delay: the data is still valid but stale.
- So a huge queue hides overload and serves old prices; size it for legitimate bursts, then alarm on depth or high-water mark.
- Mutex vs SPSC, stated precisely:
  - An uncontended mutex lock/unlock is one atomic RMW each, stays in user space (futex fast path), roughly tens of nanoseconds.
  - Under contention the thread may spin briefly, then sleep in the kernel; wake-up involves the scheduler and costs microseconds plus cache pollution.
  - A busy-polling SPSC trades a whole core for predictable, sub-microsecond hand-off. It is not "always faster", it is more predictable when you can afford the core.

#### 9. Misconceptions to unlearn
- ❌ "Full is `(tail & mask) + 1 == (head & mask)`." ✅ With monotonic indices full is `tail - head == N`; with wrapped indices it is `((tail + 1) & mask) == head` and one slot is unused.
- ❌ "Any capacity works with a mask." ✅ Masking requires a power of two; `static_assert` it.
- ❌ "Only the producer's store needs release." ✅ The consumer's `head` store must be release too, otherwise the producer may overwrite a slot that is still being read.
- ❌ "`alignas(64)` makes the indices thread-safe." ✅ It only prevents false sharing; atomics and ordering provide synchronization.
- ❌ "Producer and consumer should never touch the same cache line." ✅ Data slots naturally do; avoid continuous bouncing of metadata.
- ❌ "`cv.wait` keeps the mutex while sleeping" / "`notify_one` makes `wait` return." ✅ Wait releases the mutex atomically; after notification it must reacquire it and recheck the predicate.
- ❌ "A mutex always goes to the kernel." ✅ Only under contention, after the user-space fast path fails.
- ❌ "SPSC is always faster than a mutex queue." ✅ It is more predictable; busy polling costs a core.
- ❌ "In MPSC, a successful CAS on the tail means the slot is ready." ✅ Reservation is not publication; use per-slot state.
- ❌ "A queue without a mutex is lock-free." ✅ A stalled producer can block everyone in a bounded MPMC ring.
- ❌ "Overwrite the oldest so the consumer sees the newest first." ✅ The consumer still reads in order; overwrite silently loses an unprocessed event.
- ❌ "If the queue fills, make it bigger." ✅ Bigger only postpones failure and increases staleness; fix the consumer or define an overload policy.

### EDGE_CASES: Traps and Misconceptions

#### Edge Case 1: Full check on masked indices never fires
- Assumption: with wrapped indices, "full" is `(tail & mask) + 1 == (head & mask)`.
- Reality: when `tail & mask == N - 1`, the left side is `N`, which can never equal a masked value. The push proceeds, `tail` wraps to equal `head`, and a full queue now looks **empty**: N elements silently disappear.
- Correct options:
  - Monotonic indices: `full = (tail - head == N)`, `empty = (tail == head)`.
  - Wrapped indices: `full = (((tail + 1) & mask) == head)`, capacity is effectively `N - 1`.
```cpp
// Buggy:   (tail & MASK) + 1 == (head & MASK)  -> with N = 4, tail = 3, head = 0: 4 == 0 is false
// Correct: tail - head == N                     (monotonic size_t indices)
```

#### Edge Case 2: Relaxed publication of the producer index
- Assumption: "`tail` is atomic, so `tail.store(t + 1, relaxed)` is enough".
- Reality: atomicity of `tail` says nothing about the **non-atomic** element written just before it. Without release on the store and acquire on the consumer's load there is no happens-before between `buf[t] = x` and the consumer's read: a **data race**, undefined behaviour.
- Typical symptom: works on x86 in testing (strong hardware ordering), fails on ARM, or after the compiler hoists or sinks the buffer write.
```cpp
buf[t & mask] = msg;                          // non-atomic write
tail.store(t + 1, std::memory_order_release); // must be release
// consumer:
auto t = tail.load(std::memory_order_acquire); // must be acquire
```

#### Edge Case 3: The consumer's `head` store must also be release
- Assumption: "The consumer only reads data, so its index update can be relaxed".
- Reality: the slot hand-over goes both ways. If `head.store(h + 1, relaxed)`, the producer can observe the new `head`, consider the slot free, and start writing it while the consumer's read of that slot is not ordered before the write: data race (write-after-read hazard), the consumer may read a half-overwritten element.
- Release on the consumer store plus acquire on the producer's `head` load makes the consumer's read happen-before the producer's reuse.

#### Edge Case 4: Overwrite-oldest in a lock-free SPSC
- Assumption: "When full, the producer just advances `head` and overwrites the oldest slot".
- Reality:
  - `head` now has **two writers** (producer and consumer): racing plain stores lose updates.
  - The consumer may be reading exactly that oldest slot while the producer overwrites it: data race on the element.
  - The consumer still reads in order; it does not "get the newest first". It silently loses an unprocessed event, which for incremental market data is a sequence gap.
- If overwrite semantics are truly required, use a design built for it (seqlock-style slots with version checks, or a mutex), not a plain SPSC.

#### Edge Case 5: `if` instead of a predicate loop around `cv.wait`
- Assumption: "I only wait when empty, and I only get notified after a push, so `if (q.empty()) cv.wait(lock);` is fine".
- Reality:
  - Spurious wake-ups are permitted.
  - With several consumers, a notified consumer must reacquire the mutex; another consumer may grab the item first ("stolen wake-up").
  - Either way `wait` returns with the queue still empty and `q.front()` on an empty deque is undefined behaviour.
- Always use `cv.wait(lock, predicate)` (a `while` loop internally).

#### Edge Case 6: One condition variable plus `notify_one` can deadlock
- Assumption: "One CV is enough for both full and empty conditions".
- Reality with capacity 1, two producers, two consumers, all waiting on the same CV with `notify_one`:
  - A consumer pops and calls `notify_one`, which wakes the **other consumer** instead of a producer.
  - That consumer sees an empty queue and waits again. Now every thread is waiting and nobody will notify: deadlock.
- Fixes: two CVs (`not_full` for producers, `not_empty` for consumers), or one CV with `notify_all` (correct but wakes everyone).

#### Edge Case 7: Naive MPSC: tail is a reservation counter, not a "ready" marker
- Assumption: producers CAS `tail` to reserve a slot, then write it; consumer reads everything below `tail`.
- Reality: producer P1 reserves 10, is preempted; P2 reserves 11 and writes it; the consumer sees `tail == 12` and reads slot 10 while it is unwritten (data race, garbage, or a stale element from the previous lap).
- Fix: per-slot publication (sequence numbers or ready flags with release/acquire), and the consumer waits at the first unpublished slot.

#### Edge Case 8: `alignas` on only one member does not separate the indices
- Assumption: `struct Q { alignas(64) std::atomic<size_t> head; std::atomic<size_t> tail; };` puts them on different lines.
- Reality: `alignas` aligns the **start** of `head`. `tail` follows at offset 8, on the same 64-byte line. Each independently written variable needs its own `alignas` (or explicit padding).
```cpp
struct Wrong { alignas(64) std::atomic<std::size_t> head; std::atomic<std::size_t> tail; };  // sizeof 64, same line
struct Right { alignas(64) std::atomic<std::size_t> head; alignas(64) std::atomic<std::size_t> tail; }; // sizeof 128
```

### CODE_EXAMPLES: Practical Demonstrations

#### Example 1: Bounded blocking queue with close() (mutex + two CVs)
- Multiple producers and consumers, blocking when full or empty, clean shutdown via `close()`.
```cpp
#include <condition_variable>
#include <cstddef>
#include <deque>
#include <iostream>
#include <mutex>
#include <optional>
#include <thread>
#include <vector>

template <typename T>
class BoundedQueue {
public:
    explicit BoundedQueue(std::size_t capacity) : cap_(capacity) {}

    // Returns false if the queue was closed.
    bool push(T value) {
        std::unique_lock lock(m_);
        not_full_.wait(lock, [&] { return closed_ || q_.size() < cap_; });
        if (closed_) return false;
        q_.push_back(std::move(value));
        lock.unlock();               // state changed under the lock
        not_empty_.notify_one();     // wake a consumer, not a producer
        return true;
    }

    // Returns nullopt once the queue is closed AND drained.
    std::optional<T> pop() {
        std::unique_lock lock(m_);
        not_empty_.wait(lock, [&] { return closed_ || !q_.empty(); });
        if (q_.empty()) return std::nullopt;
        T value = std::move(q_.front());
        q_.pop_front();
        lock.unlock();
        not_full_.notify_one();      // wake a producer
        return value;
    }

    void close() {
        {
            std::lock_guard lock(m_);
            closed_ = true;
        }
        not_full_.notify_all();      // everyone must re-check the predicate
        not_empty_.notify_all();
    }

private:
    std::mutex m_;
    std::condition_variable not_full_;
    std::condition_variable not_empty_;
    std::deque<T> q_;
    std::size_t cap_;
    bool closed_ = false;
};

int main() {
    BoundedQueue<int> q(8);
    std::vector<long long> sums(2, 0);

    std::vector<std::thread> consumers;
    for (int c = 0; c < 2; ++c)
        consumers.emplace_back([&, c] {
            while (auto v = q.pop()) sums[c] += *v;   // process outside the lock
        });

    std::vector<std::thread> producers;
    for (int p = 0; p < 2; ++p)
        producers.emplace_back([&] {
            for (int i = 1; i <= 1000; ++i) q.push(i);
        });

    for (auto& t : producers) t.join();
    q.close();
    for (auto& t : consumers) t.join();

    std::cout << "total = " << sums[0] + sums[1] << '\n';
}
```
- Output: `total = 1001000` (2 × 500500). The split between the two consumers varies per run.
- The consumer moves the item out under the lock and processes it after unlocking, so slow processing never blocks producers.

#### Example 2: SPSC ring buffer with padding and cached indices
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

#### Example 3: Bounded MPMC queue with per-slot sequence numbers
- Each cell carries a sequence that says whose turn it is and for which lap; reservation is a CAS on the position counter, publication is a release store to the cell.
```cpp
#include <array>
#include <atomic>
#include <cstddef>
#include <iostream>
#include <memory>
#include <thread>
#include <vector>

template <typename T, std::size_t N>
class MpmcQueue {
    static_assert(N >= 2 && (N & (N - 1)) == 0, "N must be a power of two");

    struct Cell {
        std::atomic<std::size_t> seq;
        T data;
    };

    alignas(64) std::array<Cell, N> cells_;
    alignas(64) std::atomic<std::size_t> enqueue_pos_{0};
    alignas(64) std::atomic<std::size_t> dequeue_pos_{0};

public:
    MpmcQueue() {
        for (std::size_t i = 0; i < N; ++i) cells_[i].seq.store(i, std::memory_order_relaxed);
    }

    bool try_push(const T& value) {
        std::size_t pos = enqueue_pos_.load(std::memory_order_relaxed);
        for (;;) {
            Cell& cell = cells_[pos & (N - 1)];
            const std::size_t seq = cell.seq.load(std::memory_order_acquire);
            const auto diff = static_cast<std::ptrdiff_t>(seq) - static_cast<std::ptrdiff_t>(pos);
            if (diff == 0) {                       // cell is free for this lap
                if (enqueue_pos_.compare_exchange_weak(pos, pos + 1, std::memory_order_relaxed)) {
                    cell.data = value;                                   // we own it now
                    cell.seq.store(pos + 1, std::memory_order_release);  // publish: ready
                    return true;
                }                                  // CAS failed: pos was reloaded, retry
            } else if (diff < 0) {
                return false;                      // previous lap not consumed yet: full
            } else {
                pos = enqueue_pos_.load(std::memory_order_relaxed);     // someone else took it
            }
        }
    }

    bool try_pop(T& out) {
        std::size_t pos = dequeue_pos_.load(std::memory_order_relaxed);
        for (;;) {
            Cell& cell = cells_[pos & (N - 1)];
            const std::size_t seq = cell.seq.load(std::memory_order_acquire);
            const auto diff = static_cast<std::ptrdiff_t>(seq) - static_cast<std::ptrdiff_t>(pos + 1);
            if (diff == 0) {                       // cell published for this position
                if (dequeue_pos_.compare_exchange_weak(pos, pos + 1, std::memory_order_relaxed)) {
                    out = cell.data;
                    cell.seq.store(pos + N, std::memory_order_release);  // free for next lap
                    return true;
                }
            } else if (diff < 0) {
                return false;                      // not published yet: empty (or a hole)
            } else {
                pos = dequeue_pos_.load(std::memory_order_relaxed);
            }
        }
    }
};

int main() {
    constexpr int kProducers = 4, kConsumers = 4, kPerProducer = 250'000;
    auto q = std::make_unique<MpmcQueue<int, 1024>>();
    std::atomic<long long> sum{0};
    std::atomic<int> consumed{0};

    std::vector<std::thread> threads;
    for (int p = 0; p < kProducers; ++p)
        threads.emplace_back([&] {
            for (int i = 1; i <= kPerProducer; ++i)
                while (!q->try_push(i)) {}
        });
    for (int c = 0; c < kConsumers; ++c)
        threads.emplace_back([&] {
            int v;
            while (consumed.load(std::memory_order_relaxed) < kProducers * kPerProducer) {
                if (q->try_pop(v)) {
                    sum.fetch_add(v, std::memory_order_relaxed);
                    consumed.fetch_add(1, std::memory_order_relaxed);
                }
            }
        });
    for (auto& t : threads) t.join();

    std::cout << "consumed = " << consumed << ", sum = " << sum << '\n';
}
```
- Output: `consumed = 1000000, sum = 125000500000` (4 × 250000 × 250001 / 2).
- The cell sequence encodes three states for physical slot `i` on lap `k` (`pos = i + kN`): `pos` = free for producer, `pos + 1` = ready for consumer, `pos + N` = free for the next lap.
- A producer preempted between its CAS and its `seq.store` leaves a hole: consumers report "empty" at that position until it publishes. No mutex, but not lock-free in the strict sense.

#### Example 4: What full-queue policies actually lose
- Single-threaded illustration of the semantics only (no concurrency), capacity 4, six incoming sequence numbers.
```cpp
#include <cstddef>
#include <deque>
#include <iostream>

enum class Policy { DropNewest, OverwriteOldest };

void run(Policy policy, const char* name) {
    constexpr std::size_t kCap = 4;
    std::deque<int> ring;
    std::deque<int> lost;
    for (int seq = 1; seq <= 6; ++seq) {
        if (ring.size() < kCap) { ring.push_back(seq); continue; }
        if (policy == Policy::DropNewest) {
            lost.push_back(seq);
        } else {
            lost.push_back(ring.front());
            ring.pop_front();
            ring.push_back(seq);
        }
    }
    std::cout << name << ": consumer sees";
    for (int v : ring) std::cout << ' ' << v;
    std::cout << " | lost";
    for (int v : lost) std::cout << ' ' << v;
    std::cout << '\n';
}

int main() {
    run(Policy::DropNewest, "drop newest     ");
    run(Policy::OverwriteOldest, "overwrite oldest");
}
```
- Output:
```
drop newest     : consumer sees 1 2 3 4 | lost 5 6
overwrite oldest: consumer sees 3 4 5 6 | lost 1 2
```
- Both lose data; the consumer still reads in sequence order. For an incremental feed either case is a gap that requires resynchronisation.

#### Example 5: Sizing a queue for a burst (backlog, fill time, staleness)
- The numbers an interviewer expects you to compute before you say "make it bigger".
```cpp
#include <cstdio>

int main() {
    const double in_burst = 50'000, in_normal = 10'000;   // msgs/s
    const double service = 20'000;                         // msgs/s consumer capacity
    const double capacity = 100'000, burst_secs = 5;

    const double growth = in_burst - service;              // backlog growth during burst
    const double fill_time = capacity / growth;
    const double demand = growth * burst_secs;             // backlog if the queue were unbounded
    const double drain_rate = service - in_normal;
    std::printf("backlog growth : %.0f msgs/s\n", growth);
    std::printf("full after     : %.2f s\n", fill_time);
    std::printf("unbounded peak : %.0f msgs\n", demand);
    std::printf("dropped/blocked: %.0f msgs\n", demand - capacity);
    std::printf("delay when full: %.1f s (depth / service rate)\n", capacity / service);
    std::printf("drain full ring: %.1f s after the burst\n", capacity / drain_rate);
}
```
- Output:
```
backlog growth : 30000 msgs/s
full after     : 3.33 s
unbounded peak : 150000 msgs
dropped/blocked: 50000 msgs
delay when full: 5.0 s (depth / service rate)
drain full ring: 10.0 s after the burst
```
- Long before the ring is full, every message already waits seconds: the queue has turned a throughput problem into a latency problem.

#### Example 6: Monotonic unsigned indices survive wraparound
- Start the indices just below `SIZE_MAX`: size and full/empty checks stay correct because unsigned subtraction is modulo 2^64 and N divides 2^64.
```cpp
#include <array>
#include <cstddef>
#include <cstdint>
#include <iostream>

int main() {
    constexpr std::size_t N = 4, MASK = N - 1;
    std::array<int, N> buf{};
    std::size_t head = SIZE_MAX - 1;   // pretend we have run for a very long time
    std::size_t tail = SIZE_MAX - 1;

    for (int v = 1; v <= 5; ++v) {
        if (tail - head == N) { std::cout << "full, rejected " << v << '\n'; continue; }
        buf[tail & MASK] = v;
        ++tail;                           // wraps from SIZE_MAX to 0 along the way
    }
    std::cout << "size = " << tail - head << ", tail = " << tail << '\n';
    while (head != tail) std::cout << buf[head++ & MASK] << ' ';
    std::cout << '\n';
}
```
- Output:
```
full, rejected 5
size = 4, tail = 2
1 2 3 4 
```
- With 32-bit indices this wrap happens after about 4 billion operations (minutes at market-data rates), so the "it will never wrap" assumption is only safe with 64-bit counters.

### QUICK_REFERENCE: Cheat Sheet

#### SPSC ring buffer recipe
| Item | Rule |
|---|---|
| Ownership | producer writes `tail`, consumer writes `head` (one writer each) |
| Empty / full | `tail == head` / `tail - head == N` (monotonic `size_t`) |
| Slot | `buf[i & (N - 1)]`, `N` power of two, `static_assert` it |
| Producer orders | load `tail` relaxed, load `head` acquire, store `tail` release |
| Consumer orders | load `head` relaxed, load `tail` acquire, store `head` release |
| Padding | `head`, `tail` each `alignas(64)` (or `hardware_destructive_interference_size`) |
| Speed-ups | cached remote index, batch pop then one `head` store |

#### Queue shapes
| Shape | Hard part | Typical solution |
|---|---|---|
| Mutex + 2 CVs | contention, wake-up latency | predicate waits, unlock then notify, `close()` |
| SPSC | ordering, false sharing | acquire/release, padding |
| MPSC / MPMC bounded | reservation vs publication, holes | CAS or `fetch_add` + per-slot sequence |
| Unbounded lock-free | memory reclamation, ABA | hazard pointers / epochs, or just use a mutex |

#### Formulas
| Quantity | Formula |
|---|---|
| Backlog growth | arrival rate - service rate |
| Time to fill | capacity / growth |
| Queueing delay | depth / service rate (Little's law) |
| Drain time | backlog / (service - new arrival rate) |

#### Interview one-liners
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
