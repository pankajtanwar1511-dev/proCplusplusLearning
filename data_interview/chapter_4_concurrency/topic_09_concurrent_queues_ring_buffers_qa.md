## TOPIC: Concurrent Queues and Ring Buffers

### INTERVIEW_QA: Interview Questions with Detailed Answers

#### Q1: What is a bounded queue, and why do low-latency systems prefer bounded queues over growable ones?
**Difficulty:** #beginner
**Category:** #concurrency #queues
**Concepts:** #bounded_queue #backpressure #allocation

**Answer:**
A bounded queue has a fixed capacity allocated up front. It avoids allocation and unpredictable growth on the hot path, caps memory and queueing delay, and forces an explicit decision about what happens when the queue is full.

**Explanation:**
- An unbounded `std::queue` grows by allocating; allocation can take locks, page-fault, and adds latency jitter.
- A fixed ring buffer is allocated once, often at startup, and can be pre-faulted and pinned.
- The bound also bounds the **queueing delay**: depth / service rate.
- Capacity forces a full-queue policy: block, fail, drop newest, overwrite oldest, or conflate.
- ❌ Common wrong answer: "Bounded queues are only about saving memory." The real value is predictable latency and explicit backpressure.
- ✅ What a strong answer adds: an unbounded queue merely hides overload; memory grows until something else fails, while the consumer works on ever older data.

**Key takeaway:** Bounded means no hot-path allocation, bounded latency, and a mandatory overload policy.

---

#### Q2: In a mutex-based bounded blocking queue, why do you typically use two condition variables, and who notifies which one?
**Difficulty:** #beginner
**Category:** #concurrency #condition_variable
**Concepts:** #condition_variable #producer_consumer #notify_one

**Answer:**
Producers wait on `not_full` when the queue is full; consumers wait on `not_empty` when it is empty. After a push the producer notifies `not_empty` (wake a consumer); after a pop the consumer notifies `not_full` (wake a producer).

**Explanation:**
- Each CV corresponds to one predicate, so `notify_one` always wakes a thread that can make progress from the change just made.
- ❌ Common wrong answer: "The producer notifies `not_full` after pushing." A push makes the queue non-empty, so it is a consumer that can now proceed.
- With a single CV shared by both sides, `notify_one` can wake a thread of the **wrong kind** (a consumer waking another consumer), which then waits again; with capacity 1, two producers and two consumers this can end with everyone waiting: deadlock.
- One CV with `notify_all` is correct but wakes every waiter (thundering herd).
- ✅ What a strong answer adds: notify after unlocking to avoid waking a thread straight into a blocked mutex, and add a `close()` that sets a flag under the lock and `notify_all`s both CVs.
```cpp
void push(T v) {
    std::unique_lock lk(m);
    not_full.wait(lk, [&] { return q.size() < cap; });
    q.push_back(std::move(v));
    lk.unlock();
    not_empty.notify_one();
}
```

**Key takeaway:** One predicate per CV, and notify the CV whose predicate you just made true.

---

#### Q3: Why is waiting with a plain `if` on `q.empty()` wrong, even if you always notify after pushing?
**Difficulty:** #beginner
**Category:** #concurrency #condition_variable
**Concepts:** #spurious_wakeup #stolen_wakeup #predicate

```cpp
if (q.empty())
    cv.wait(lock);
```

**Answer:**
`wait` can return while the queue is still empty: spurious wake-ups are allowed, and with several consumers another one may take the item before the woken thread reacquires the mutex. You must recheck the condition in a loop or use the predicate overload.

**Explanation:**
- `cv.wait(lock, pred)` is exactly `while (!pred()) cv.wait(lock);`.
- Stolen wake-up: C1 is notified, but C2 (already running) locks the mutex first and pops the only item; C1 then wakes to an empty queue.
- With `if`, C1 calls `q.front()` on an empty `std::deque`: undefined behaviour.
- ❌ Common wrong answer: "Spurious wake-ups are so rare they don't matter." The stolen wake-up is not rare under load and is guaranteed to happen eventually.
- ✅ What a strong answer adds: the predicate overload also makes the code robust to `notify_all`, to shutdown flags, and to waking before the notify call (the predicate is already true, so no sleep at all).

**Key takeaway:** Never wait without re-checking the predicate under the lock.

---

#### Q4: Why is the capacity of a ring buffer usually a power of two? Is `%` really that slow?
**Difficulty:** #beginner
**Category:** #concurrency #performance
**Concepts:** #power_of_two #bit_mask #modulo

**Answer:**
With a power of two, `i % N` equals `i & (N - 1)` for unsigned `i`, a single AND instead of a division. For a compile-time constant N the compiler already does this for unsigned types; the mask matters when N is a runtime value or the index is signed.

**Explanation:**
- A 64-bit integer division costs tens of cycles on many CPUs; an AND costs one.
- `static_assert((N & (N - 1)) == 0)`: with N = 6, `i & 5` maps 0..7 to 0,1,0,1,4,5,4,5, so slots collide and others are never used.
- Power-of-two N also keeps monotonic `size_t` indices consistent across 2^64 wraparound.
- ❌ Common wrong answer: "Masking is required for correctness." Correctness needs either mask-with-power-of-two or a true modulo; the power of two buys speed and wrap safety.
- ✅ What a strong answer adds: a power-of-two size may waste memory (need 1100 slots, get 2048); some designs accept a non-power-of-two size with a conditional reset (`if (++i == N) i = 0;`), which is also cheap and branch-predictable.

**Key takeaway:** Power of two makes wrapping a mask; only mask if N really is a power of two.

---

#### Q5: What happens to the mutex while a producer waits on a full queue, and between `notify_one()` and `wait()` returning?
**Difficulty:** #intermediate
**Category:** #concurrency #condition_variable
**Concepts:** #condition_variable #unique_lock #spurious_wakeup

- The producer calls `not_full.wait(lock, pred)` while the queue is full.

**Answer:**
`wait` atomically releases the mutex and blocks. After a notification (or spurious wake) the thread must reacquire the mutex, then re-evaluate the predicate; it returns, holding the lock, only when the predicate is true, otherwise it waits again.

**Explanation:**
- Sequence: lock → predicate false → atomically {unlock + enter wait set} → notified → compete for the mutex → mutex acquired → predicate re-checked → return or wait again.
- The release must be atomic with entering the wait set, otherwise a notification sent in between would be lost.
- That is why `wait` takes `std::unique_lock`: it needs to unlock and relock; `std::lock_guard` cannot.
- ❌ Common wrong answer: "The waiting thread keeps the mutex while sleeping." Then the consumer could never lock the mutex to pop, and nobody could make space.
- ❌ Common wrong answer: "`notify_one` makes `wait` return." It only makes a waiter eligible to run; it still has to win the mutex, and the predicate may already be false again because another thread got there first.
- A notified thread that loses the race for the mutex does **not** need another notify: it is no longer waiting on the CV, only on the mutex.
- A CV does not remember notifications; the **predicate state** is the memory.

**Key takeaway:** Wait = unlock and sleep atomically; wake = relock, recheck, maybe sleep again.

---

#### Q6: Should a producer call notify_one() while still holding the mutex or after unlocking it?
**Difficulty:** #intermediate
**Category:** #concurrency #condition_variable
**Concepts:** #notify_one #lost_wakeup #mutex

**Answer:**
Both are correct as long as the shared state was modified under the mutex. Notifying after unlocking is usually slightly better because the woken thread does not immediately block on a mutex the notifier still holds.

**Explanation:**
- The non-negotiable rule: the predicate's state must be changed while holding the mutex, even if that state is an `std::atomic`.
- If the state is changed without the mutex, the waiter can evaluate the predicate (false), then the producer changes state and notifies before the waiter is in the wait set: **lost wake-up**, the waiter can sleep forever.
- Notify under the lock: woken thread may "hurry up and wait" on the mutex (some implementations use wait morphing to mitigate).
- Notify after unlock: avoids that, but the CV object must still be alive; if the waiter can destroy the CV as soon as it sees the state (for example a one-shot handshake whose owner returns), notify under the lock.
- ❌ Common wrong answer: "Notifying after unlock is a race." Not if the state change happened under the lock.

**Key takeaway:** Modify state under the lock; where you notify is a performance detail, except for object-lifetime corner cases.

---

#### Q7: Why does std::queue::pop() return void, and how should a thread-safe queue's pop be designed?
**Difficulty:** #intermediate
**Category:** #concurrency #api_design
**Concepts:** #exception_safety #try_pop #optional

**Answer:**
A `T pop()` that removes the element and then copies it out can lose the element if the copy or move throws. Thread-safe queues therefore combine "check and remove" in one call: `bool try_pop(T&)`, `std::optional<T> try_pop()`, or a blocking `pop` that moves out under the lock.

**Explanation:**
- Single-threaded `std::queue` splits `front()` and `pop()` so the copy happens before removal.
- In a concurrent queue `if (!q.empty()) v = q.front(); q.pop();` as separate calls is a check-then-act race even if each call locks internally: another consumer can pop in between.
- So the interface itself must be atomic: one call that tests, moves out, and removes.
- Make the move out `noexcept` where possible; `T(T&&) noexcept` lets you move then pop safely.
- ❌ Common wrong answer: "Just lock inside `empty()`, `front()` and `pop()`." Each call is safe, the sequence is not.
- ✅ What a strong answer adds: in lock-free rings, `try_pop(T&)` with a `noexcept` move or trivially copyable `T` avoids the issue entirely; many low-latency queues require trivially copyable payloads.

**Key takeaway:** Thread-safety is a property of the interface, not of each member function.

---

#### Q8: How do you shut down a blocking bounded queue cleanly so no thread stays blocked forever?
**Difficulty:** #intermediate
**Category:** #concurrency #queues
**Concepts:** #shutdown #notify_all #close

**Answer:**
Add a `closed` flag set under the mutex, then `notify_all` on both CVs. Both wait predicates include `closed`; after close, `push` fails and `pop` drains remaining items, then returns an empty result so consumers exit.

**Explanation:**
- Predicates become `closed || size < cap` and `closed || !empty`.
- `notify_all`, not `notify_one`: every waiter must wake to observe the flag.
- Setting the flag without notifying leaves already-sleeping threads asleep forever (their predicate is not re-evaluated until someone wakes them).
- Alternative: push one sentinel ("poison pill") per consumer; works but needs to know the consumer count and still needs a story for blocked producers.
- ❌ Common wrong answer: "Set an atomic `stop` flag and join." Sleeping threads never look at it.
- ✅ What a strong answer adds: decide whether `pop` after close drains or discards, document it, and make `push` after close a clear error.

**Key takeaway:** Shutdown is a state change like any other: under the lock, then wake everyone.

---

#### Q9: Why can a single-producer single-consumer ring buffer work without a mutex or CAS?
**Difficulty:** #intermediate
**Category:** #concurrency #lock_free
**Concepts:** #spsc #ownership #acquire_release

**Answer:**
Each index has exactly one writer: the producer writes `tail`, the consumer writes `head`. No two threads ever compete to modify the same variable, so plain atomic loads and stores suffice; acquire/release on them publishes the slot contents between the two threads.

**Explanation:**
- CAS exists to arbitrate between **competing writers**. SPSC has none.
- Each side still **reads** the other side's index, so both indices must be `std::atomic` (a plain variable read while written is a data race).
- The producer advances `tail` only **after** writing the element, so "position < tail" really means "ready". This property is exactly what breaks in MPSC.
- ❌ Common wrong answer: "Because atomics make it thread-safe." Atomics make the index accesses race-free; correctness of the **data** comes from the release/acquire pairing and single ownership.
- ✅ What a strong answer adds: no CAS means no retry loop; both operations are wait-free (bounded steps), the queue is fixed-size, and with cached indices each side touches the other's cache line only occasionally.

**Key takeaway:** SPSC is simple because ownership is simple: one writer per index.

---

#### Q10: Give the memory order for every index access in an SPSC ring buffer and justify each.
**Difficulty:** #intermediate
**Category:** #concurrency #memory_model
**Concepts:** #memory_order_acquire #memory_order_release #happens_before

**Answer:**
Producer: load own `tail` relaxed, load `head` acquire, write the slot, store `tail` release. Consumer: load own `head` relaxed, load `tail` acquire, read the slot, store `head` release.

**Explanation:**
- Own index relaxed: you are its only writer, so you always see your own latest value.
- `tail.store(release)` → consumer's `tail.load(acquire)` reading that value: synchronizes-with, so the element write happens-before the consumer's read.
- `head.store(release)` → producer's `head.load(acquire)`: the consumer's read of the slot happens-before the producer overwrites it.
- ❌ Common wrong answer: "Release flushes the store buffer and acquire invalidates the cache." Explain at the C++ level first (synchronizes-with, happens-before); hardware mechanisms differ per architecture and on x86 these are plain `mov` instructions that only constrain compiler reordering.
- ❌ Common wrong answer: mixing up which side loads which index with acquire. Rule: acquire on the **other** side's index, release on **your** index.
- `seq_cst` everywhere would also be correct but adds a full fence (`xchg`/`mfence`) on x86 stores for no benefit here.
```cpp
using std::memory_order_relaxed, std::memory_order_acquire, std::memory_order_release;

bool try_push(int v) {                                    // producer thread only
    const std::size_t t = tail.load(memory_order_relaxed);
    if (t - head.load(memory_order_acquire) == N) return false;
    buf[t & (N - 1)] = v;
    tail.store(t + 1, memory_order_release);
    return true;
}

bool try_pop(int& v) {                                    // consumer thread only
    const std::size_t h = head.load(memory_order_relaxed);
    if (h == tail.load(memory_order_acquire)) return false;
    v = buf[h & (N - 1)];
    head.store(h + 1, memory_order_release);
    return true;
}
```

**Key takeaway:** Acquire the other side's index, release your own; there are two hand-over edges.

---

#### Q11: How do you tell "full" from "empty" in a ring buffer?
**Difficulty:** #intermediate
**Category:** #concurrency #data_structures
**Concepts:** #ring_buffer #monotonic_index #power_of_two

**Answer:**
Use monotonic unsigned indices and wrap only when indexing: empty is `tail == head`, full is `tail - head == N`. If you store wrapped indices instead, `head == tail` is ambiguous, so the usual fix is to sacrifice one slot: full is `((tail + 1) & mask) == head`.

**Explanation:**
- Monotonic `size_t` indices: `tail - head` is the exact size, all N slots are usable, and the arithmetic stays correct after the counters wrap at 2^64 (N must divide 2^64, which any power of two does).
- ❌ Common wrong answer: "Full is `(tail & mask) + 1 == (head & mask)`." When `tail & mask == N - 1` the left side is `N`, which never matches, so the producer writes one more element, `tail` wraps onto `head`, and a full queue suddenly reads as empty.
- With 32-bit counters the wrap happens after about 4 billion operations; at millions of messages per second that is minutes, so either use 64-bit counters or make sure the arithmetic is wrap-safe.
- A separate `count` variable written by both sides would need an atomic RMW from both threads: more contention, defeats SPSC.

**Key takeaway:** Monotonic indices plus `tail - head` give full, empty and size without wasting a slot.

---

#### Q12: Why do SPSC queues align head and tail to separate cache lines, and does that make the queue thread-safe?
**Difficulty:** #intermediate
**Category:** #concurrency #performance
**Concepts:** #false_sharing #alignas #cache_coherence

**Answer:**
To avoid false sharing: the producer writes `tail` and the consumer writes `head`; on one cache line every write invalidates the other core's copy and the line bounces between cores. `alignas` changes layout only; it provides no synchronization at all.

**Explanation:**
- Coherence works per cache line (typically 64 bytes on x86-64, 128 on some ARM/Apple cores; adjacent-line prefetch on Intel makes 128 a safer pad).
- Use `alignas(std::hardware_destructive_interference_size)` where available (GCC 12+), else a constant such as 64 or 128.
- Every separately written hot variable needs its own `alignas`; aligning only the first member leaves the next one on the same line.
- The **data slots** near the meeting point will share lines when the queue is nearly empty. That is real communication and unavoidable; the goal is that metadata does not bounce on every single operation.
- ❌ Common wrong answer: "`alignas` makes head and tail safe to access from two threads." Safety comes from `std::atomic` and memory ordering.
- ❌ Common wrong answer: "Producer and consumer should never touch the same cache line." Impossible in a circular buffer, and not the goal.

**Key takeaway:** Padding fixes performance (false sharing), never correctness.

---

#### Q13: Is a mutex always a kernel call, and is an SPSC ring always faster than a mutex-protected queue?
**Difficulty:** #intermediate
**Category:** #concurrency #performance
**Concepts:** #futex #contention #busy_polling

**Answer:**
No to both. An uncontended mutex is a user-space atomic operation (Linux futex fast path); the kernel is entered only under contention. A busy-polling SPSC is more predictable, not universally faster, and it burns a whole core while idle.

**Explanation:**
- `std::mutex` on Linux: `lock` is a CAS on a futex word; only if it is already locked may the thread spin briefly and then call `futex(FUTEX_WAIT)` to sleep.
- The expensive path under contention: syscall, sleep, wake-up by the scheduler, context switch, cold caches: microseconds and long tails.
- SPSC avoids that: hand-off costs roughly one cache-line transfer.
- Busy polling: lowest wake-up latency, but 100% CPU on that core even when idle; usually paired with core isolation and pinning.
- ❌ Common wrong answer: "Mutex = context switch, so mutexes are slow." Contention is the problem, not the mutex.
- ❌ Common wrong answer: "SPSC is always faster." For one or two messages per second with idle cores to spare, a sleeping consumer is cheaper overall.
- ✅ What a strong answer adds: hybrid waiting (spin a little, then `_mm_pause`, then block on `std::atomic::wait` or a futex) when the core budget matters.

**Key takeaway:** Contention, not the mutex, costs latency; busy polling buys predictability with a core.

---

#### Q14: Your market-data SPSC ring is full and the feed handler has another message. What do you do?
**Difficulty:** #intermediate
**Category:** #concurrency #system_design
**Concepts:** #backpressure #overflow_policy #market_data

**Answer:**
It depends on the data semantics. Blocking stalls the feed handler (and the socket), dropping or overwriting creates a sequence gap that corrupts an incremental book. For incremental data: never drop silently; flag overflow, alarm, and resynchronise from a snapshot; fix the slow consumer.

**Explanation:**
- Options and costs:
  - Block or spin: backpressure moves upstream; the kernel socket buffer fills and the NIC/kernel starts dropping UDP packets instead.
  - Drop newest / fail push: lose the incoming message, count it, raise a gap.
  - Overwrite oldest: lose an **unprocessed** message; also needs two writers of `head` in a lock-free SPSC, which is a race.
  - Conflate per instrument: only valid if messages are full snapshots (latest value wins).
- ❌ Common wrong answer: "Overwrite the oldest so the consumer gets the latest first." The consumer still reads in order; you silently destroyed a message it had not processed.
- ❌ Common wrong answer: answering with UDP gap recovery. That handles **network** loss. Internal queue overflow is a capacity problem in your own pipeline; recovery only cleans up after it.
- ✅ What a strong answer adds: the ring absorbs bursts; persistent fullness means the consumer's sustained rate is too low, so profile and optimise the consumer (allocations, cache misses, syscalls, page faults, contention, core isolation) or split the work.

**Key takeaway:** Pick the full policy from message semantics; for incremental feeds, overflow means resync, not silent loss.

---

#### Q15: When does this SPSC ring fill up, and what does that tell you?
**Difficulty:** #intermediate
**Category:** #concurrency #capacity_planning
**Concepts:** #backlog #littles_law #queueing_latency

- Messages arrive at 50k/s for 5 s, then at 10k/s. The consumer handles 20k/s.
- The ring holds 100k messages.

**Answer:**
Backlog grows at 30k/s, so the ring fills after about 3.33 s, not 4 s. An unbounded queue would peak at 150k. When full, a new message waits about 5 s (100k / 20k). Draining 100k at a net 10k/s after the burst takes about 10 s.

**Explanation:**
- Growth = arrival - service = 50k - 20k = 30k/s; fill time = 100k / 30k ≈ 3.33 s.
- Overflow during the burst: 150k demand - 100k capacity = 50k messages blocked or dropped.
- Queueing delay ≈ depth / service rate (Little's law). Even at 30k depth (after 1 s) a new message waits 1.5 s.
- ❌ Common wrong answer: "It fills during the 4th second" (rounding to whole seconds) or "just double the queue". A 200k ring stops the loss but leaves seconds of stale data and 15 s of recovery.
- ✅ What a strong answer adds: quantify first (growth, fill time, delay, drain time), then decide: is this burst expected, is that delay acceptable, can the consumer be made faster or parallelised by instrument?

**Key takeaway:** Compute growth, fill time, delay and drain time before touching the capacity.

---

#### Q16: Why not simply make the ring buffer huge so it never fills?
**Difficulty:** #intermediate
**Category:** #concurrency #system_design
**Concepts:** #queueing_latency #stale_data #capacity_planning

**Answer:**
A larger queue only postpones overflow under sustained overload and converts it into latency: messages are still valid but stale by the time they are processed. It also increases memory and cache footprint. Size for legitimate bursts and monitor depth.

**Explanation:**
- If sustained arrival > service, any finite queue fills; size only changes when.
- Depth is delay: 90k queued at 20k/s means trading on prices 4.5 s old.
- "Valid but stale": the messages are correct records of the past, just not useful for a decision now.
- A huge ring also hurts locality (the working set no longer fits in L2/L3) and can hide overload from monitoring.
- ❌ Common wrong answer: "The data is all valid, so a bigger buffer is pure upside."
- ❌ Common wrong answer: "The fix is to slow down the producer." You cannot throttle an exchange feed; the consumer must keep up (consumer capacity ≥ arrival rate).
- ✅ What a strong answer adds: export queue depth, high-water mark and estimated queueing delay as metrics, alarm on them, and benchmark p99/p99.9 end-to-end latency.

**Key takeaway:** Capacity absorbs bursts; it never fixes a rate mismatch, and depth is latency.

---

#### Q17: The producer's tail store is release. Why must the consumer's head store also be release?
**Difficulty:** #advanced
**Category:** #concurrency #memory_model
**Concepts:** #slot_reuse #write_after_read #memory_order_release

**Answer:**
Because the producer reuses the slot once it sees the new `head`. Without release on that store (and acquire on the producer's load), the consumer's read is not ordered before the producer's next write to the slot: a data race, and a half-overwritten element can be read.

**Explanation:**
- The ring is a two-way hand-over: data flows producer → consumer, **slot ownership** flows back consumer → producer.
- The race is write-after-read, which people forget because "the consumer only reads".
- ThreadSanitizer reports it as a data race on the buffer element if the consumer's store is relaxed.
- ❌ Common wrong answer: "The consumer does not publish any data, so relaxed is fine."
- ✅ What a strong answer adds: on x86 the hardware never reorders an earlier load after a later store, so the bug is invisible there, but the C++ program still has undefined behaviour and the compiler or a weaker CPU (ARM) can expose it.

**Key takeaway:** Freeing a slot is also a publication; it needs release/acquire.

---

#### Q18: What is the cached-index optimization in an SPSC queue and why does it help?
**Difficulty:** #advanced
**Category:** #concurrency #performance
**Concepts:** #cached_index #cache_coherence #spsc

**Answer:**
Each side keeps a private copy of the other side's index and reloads the shared atomic only when the copy says the queue is full (producer) or empty (consumer). This removes a cross-core cache-line read from almost every operation.

**Explanation:**
- Without it, every `push` loads `head` (owned by the consumer core) and every `pop` loads `tail`: each load can miss and pull the line across cores.
- With it, the producer reloads `head` roughly once per "lap" when it seems full; the consumer reloads `tail` once per burst when it seems empty.
- The stale copy is always conservative: a stale `head` can only make the queue look **fuller** than it is, a stale `tail` can only make it look **emptier**. So correctness is preserved; you just refresh before giving up.
- The cached copy is a plain variable on the owner's cache line, written by one thread only.
- ✅ What a strong answer adds: combine with batching (consume K items, publish `head` once) and measure with `perf c2c` / HITM events to confirm the coherence traffic actually dropped.
```cpp
if (t - cached_head == N) {                 // looks full
    cached_head = head.load(std::memory_order_acquire);
    if (t - cached_head == N) return false; // really full
}
```

**Key takeaway:** Stale is safe in the conservative direction, so only refresh the remote index when you must.

---

#### Q19: Why is a multi-producer single-consumer queue fundamentally harder than SPSC?
**Difficulty:** #advanced
**Category:** #concurrency #lock_free
**Concepts:** #mpsc #reservation #publication #cas

**Answer:**
Producers must first atomically claim unique positions, so reservation and publication become separate events. A producer can reserve slot 100 and be delayed while slot 101 is already written, so the shared enqueue counter no longer means "everything below me is ready".

**Explanation:**
- Reservation: CAS loop or `fetch_add` on the enqueue counter gives each producer a unique position.
- Publication: the producer writes the element and then marks **that slot** ready (release).
- In SPSC these coincide because the single producer advances `tail` only after writing.
- If the consumer reads up to the enqueue counter, it reads unwritten (or previous-lap) data: a data race.
- Fix: per-slot state, usually a sequence number per cell; the consumer acquires the slot's state, not the global counter.
- ❌ Common wrong answer: "Use CAS on `tail` and the rest is like SPSC." The CAS only solves reservation.
- ✅ What a strong answer adds: "In SPSC one producer owns the index and publishes it after writing. In MPSC producers claim positions first, so a reserved but unwritten slot can sit in front of written ones; the queue needs per-slot publication."

**Key takeaway:** Reservation is not publication; the consumer must check each slot, not the global tail.

---

#### Q20: In an ordered MPSC queue, slot 100 is unpublished but 101 and 102 are ready. Why can't the consumer skip 100?
**Difficulty:** #advanced
**Category:** #concurrency #lock_free
**Concepts:** #head_of_line_blocking #slot_reuse #ordering

**Answer:**
Skipping breaks the slot accounting: `head` cannot advance past 100 because producers use it to decide which physical slots are free, so a later producer could reuse slot 100's storage while its owner is still writing. It also breaks FIFO order. The consumer waits at 100: head-of-line blocking.

**Explanation:**
- With capacity 4, positions 100 and 104 map to the same physical slot; advancing `head` to 103 would tell producers position 104's slot is free.
- To skip safely you would need per-slot "consumed" tracking and a separate "lowest unconsumed" index: complexity and lost FIFO.
- The cost of not skipping: one preempted producer delays every later message (head-of-line blocking), and if it never returns the ring eventually fills and producers stall too.
- ❌ Common wrong answer: "Consume the ready ones and come back for 100 later." Ordering and slot reuse both break.
- ✅ What a strong answer adds: per-producer SPSC queues (one ring per producer, consumer polls them all) avoid holes entirely when cross-producer ordering is not required. This is a very common low-latency design.

**Key takeaway:** In a FIFO ring the consumer must wait at the hole; avoid holes by design (per-producer SPSC) if you can.

---

#### Q21: How do per-slot sequence numbers work in a bounded MPMC ring buffer?
**Difficulty:** #advanced
**Category:** #concurrency #lock_free
**Concepts:** #sequence_number #mpmc #vyukov_queue

**Answer:**
Cell i starts with seq = i. A producer at position pos may write when seq == pos, then stores seq = pos + 1 (ready). A consumer at pos may read when seq == pos + 1, then stores seq = pos + N (free for the next lap). The sequence encodes both state and lap.

**Explanation:**
- Positions are claimed with a CAS on `enqueue_pos` / `dequeue_pos`; the cell's sequence is loaded with acquire and stored with release.
- Producer sees `seq < pos`: the cell still holds an item from the previous lap → queue full.
- Consumer sees `seq < pos + 1`: not published yet → queue empty (or a hole).
- `seq > expected`: another thread already took this position → reload the counter and retry.
- A `bool ready` is not enough: after wrapping, the slot must also say **which lap** it is ready for, otherwise a slow thread from an old lap can act on a new lap's slot (an ABA-style confusion).
```cpp
// producer, after winning the CAS for pos
cell.data = value;
cell.seq.store(pos + 1, std::memory_order_release);   // publish
// consumer, after winning the CAS for pos
out = cell.data;
cell.seq.store(pos + N, std::memory_order_release);   // free for lap + 1
```
- ✅ What a strong answer adds: sequence numbers solve state and generation tracking; they do not remove head-of-line blocking from a stalled producer.

**Key takeaway:** The global counter says who owns a position; the per-cell sequence says whether it is ready and for which lap.

---

#### Q22: Is a bounded MPMC queue built on CAS and per-slot sequence numbers lock-free?
**Difficulty:** #advanced
**Category:** #concurrency #lock_free
**Concepts:** #lock_free #wait_free #progress_guarantee

**Answer:**
Not strictly. Lock-free means some thread always completes an operation even if others are suspended. If a producer is suspended between claiming a position and publishing it, consumers can never pass that slot and, once the ring fills, producers cannot either.

**Explanation:**
- Progress guarantees:
  - Wait-free: every thread completes in a bounded number of its own steps (SPSC push/pop).
  - Lock-free: at least one thread makes progress; individual threads may starve (classic CAS loop on a single word).
  - Obstruction-free: a thread completes if it runs alone.
  - Blocking: one suspended thread can stop others (mutexes, and this queue).
- ❌ Common wrong answer: "It has no mutex, so it is lock-free." Lock-freedom is a progress property, not "absence of `std::mutex`".
- ❌ Common wrong answer: "It is not lock-free because producers keep publishing while the consumer is stuck." The formal test is whether **some operation** can always complete despite a suspended thread.
- ✅ What a strong answer adds: in practice these queues are excellent (threads are rarely suspended mid-operation on isolated cores), so "practically non-blocking, formally blocking" is the honest description.

**Key takeaway:** No mutex does not mean lock-free; check what happens if one thread is suspended forever.

---

#### Q23: When the queue is empty, should the consumer busy-spin, yield, or block? Discuss the latency and throughput trade-offs.
**Difficulty:** #advanced
**Category:** #concurrency #performance
**Concepts:** #busy_polling #batching #latency_vs_throughput

**Answer:**
Busy spinning gives the lowest and most predictable hand-off latency but consumes a full core. Blocking frees the core but adds wake-up latency of microseconds or more. Hybrid spin-then-block balances both; batching raises throughput at a small latency cost.

**Explanation:**
- Busy spin: pin the consumer to an isolated core, spin on a load (with `_mm_pause` on x86 to be friendly to the sibling hyper-thread and reduce memory-order mis-speculation on exit).
- Yield: `std::this_thread::yield()` gives the core away but the thread may not run again for a whole scheduler slice.
- Block: CV, futex, or C++20 `std::atomic::wait`; the producer must also pay for a notify (a syscall if there is a waiter), which slows the producer's hot path.
- Hybrid: spin N iterations, then block; the producer only notifies if a "sleeping" flag is set.
- Batching: drain everything available, process, then one `head` store; fewer cache-line transfers and stores, higher throughput, slightly later slot release.
- ❌ Common wrong answer: "Spinning is always wasteful" or "spinning is always fastest". Both depend on core budget and the latency SLO.
- ✅ What a strong answer adds: quote latency as percentiles (p50 vs p99.9); blocking mainly hurts the tail, spinning mainly costs hardware.

**Key takeaway:** Choose the waiting strategy from the latency target and the core budget, and measure the tail.
