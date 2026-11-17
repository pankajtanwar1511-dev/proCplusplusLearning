## TOPIC: Concurrent Queues and Ring Buffers

### PRACTICE_TASKS: Output Prediction and Bug Hunting

#### Q1
```cpp
// Q: What does this program print? (single-threaded on purpose: check the full test)
#include <array>
#include <cstddef>
#include <iostream>

constexpr std::size_t N = 4, MASK = N - 1;
std::array<int, N> buf{};
std::size_t head = 0, tail = 0;   // wrapped on use

bool full()  { return (tail & MASK) + 1 == (head & MASK); }
bool empty() { return (tail & MASK) == (head & MASK); }

bool push(int v) {
    if (full()) return false;
    buf[tail & MASK] = v;
    ++tail;
    return true;
}

int main() {
    int accepted = 0;
    for (int i = 1; i <= 4; ++i) accepted += push(i);
    std::cout << "accepted=" << accepted << " empty=" << std::boolalpha << empty() << '\n';
}
```

**Answer:**
```
accepted=4 empty=true
```

**Explanation:**
- `full()` is checked with `tail` at 0, 1, 2, 3. At `tail == 3`, `(3) + 1 == 0` compares `4 == 0`: false, so the 4th push is accepted.
- `tail` becomes 4, `4 & MASK == 0 == head & MASK`, so the queue that holds 4 items now reports **empty**. The consumer would never read them.
- The masked left side can reach `N`, which no masked value ever equals; the test can never fire at the wrap point.
- **Key Concept:** Use monotonic indices (`full = tail - head == N`) or wrapped indices with one sacrificed slot (`full = ((tail + 1) & MASK) == head`).

**Fixed Version:**
```cpp
#include <array>
#include <cstddef>
#include <iostream>

constexpr std::size_t N = 4, MASK = N - 1;
std::array<int, N> buf{};
std::size_t head = 0, tail = 0;   // monotonic, masked only when indexing

bool full()  { return tail - head == N; }
bool empty() { return tail == head; }

bool push(int v) {
    if (full()) return false;
    buf[tail & MASK] = v;
    ++tail;
    return true;
}

int main() {
    int accepted = 0;
    for (int i = 1; i <= 5; ++i) accepted += push(i);
    std::cout << "accepted=" << accepted << " empty=" << std::boolalpha << empty() << '\n';
    // prints: accepted=4 empty=false
}
```

---

#### Q2
```cpp
// Q: Is this SPSC queue correct? What can the consumer observe?
#include <array>
#include <atomic>
#include <cstddef>
#include <iostream>
#include <thread>

struct Quote { long price; long qty; };

constexpr std::size_t N = 1024;
constexpr long kCount = 200'000;
std::array<Quote, N> buf;
std::atomic<std::size_t> head{0}, tail{0};

int main() {
    std::thread producer([] {
        for (long i = 1; i <= kCount; ++i) {
            const std::size_t t = tail.load(std::memory_order_relaxed);
            while (t - head.load(std::memory_order_relaxed) == N) {}
            buf[t & (N - 1)] = Quote{i, i * 10};
            tail.store(t + 1, std::memory_order_relaxed);
        }
    });

    long bad = 0;
    for (long i = 1; i <= kCount; ++i) {
        const std::size_t h = head.load(std::memory_order_relaxed);
        while (h == tail.load(std::memory_order_relaxed)) {}
        const Quote q = buf[h & (N - 1)];
        bad += (q.price != i || q.qty != i * 10);
        head.store(h + 1, std::memory_order_relaxed);
    }
    producer.join();
    std::cout << "bad = " << bad << '\n';
}
```

**Answer:**
```
Data race on buf: undefined behaviour. Often prints "bad = 0" on x86, but nothing is guaranteed.
```

**Explanation:**
- The indices are atomic, so the index accesses themselves are race-free.
- The `Quote` elements are **not** atomic. With relaxed stores and loads there is no synchronizes-with edge, so the producer's write of `buf[t]` does not happen-before the consumer's read: a data race (TSan reports it).
- In practice: on x86 the hardware keeps stores in order, so it frequently "works"; on ARM the consumer can see the new `tail` before the element. The compiler may also reorder the element store after the relaxed index store.
- The same applies in the other direction: the relaxed `head` store lets the producer overwrite a slot that is still being read.
- **Key Concept:** Atomic indices are not enough; release on the store and acquire on the load are what publish the non-atomic data.

**Fixed Version:**
```cpp
#include <array>
#include <atomic>
#include <cstddef>
#include <iostream>
#include <thread>

struct Quote { long price; long qty; };

constexpr std::size_t N = 1024;
constexpr long kCount = 200'000;
std::array<Quote, N> buf;
alignas(64) std::atomic<std::size_t> head{0};
alignas(64) std::atomic<std::size_t> tail{0};

int main() {
    std::thread producer([] {
        for (long i = 1; i <= kCount; ++i) {
            const std::size_t t = tail.load(std::memory_order_relaxed);
            while (t - head.load(std::memory_order_acquire) == N) {}
            buf[t & (N - 1)] = Quote{i, i * 10};
            tail.store(t + 1, std::memory_order_release);      // publish element
        }
    });

    long bad = 0;
    for (long i = 1; i <= kCount; ++i) {
        const std::size_t h = head.load(std::memory_order_relaxed);
        while (h == tail.load(std::memory_order_acquire)) {}
        const Quote q = buf[h & (N - 1)];
        bad += (q.price != i || q.qty != i * 10);
        head.store(h + 1, std::memory_order_release);          // free the slot
    }
    producer.join();
    std::cout << "bad = " << bad << '\n';                      // bad = 0
}
```

---

#### Q3
```cpp
// Q: The producer side now uses acquire/release correctly. Is the program race-free?
#include <array>
#include <atomic>
#include <cstddef>
#include <iostream>
#include <thread>

constexpr std::size_t N = 8;
constexpr int kCount = 100'000;
std::array<int, N> buf{};
alignas(64) std::atomic<std::size_t> head{0};
alignas(64) std::atomic<std::size_t> tail{0};

int main() {
    std::thread producer([] {
        for (int i = 1; i <= kCount; ++i) {
            const std::size_t t = tail.load(std::memory_order_relaxed);
            while (t - head.load(std::memory_order_acquire) == N) {}
            buf[t & (N - 1)] = i;
            tail.store(t + 1, std::memory_order_release);
        }
    });

    long long sum = 0;
    for (int i = 1; i <= kCount; ++i) {
        const std::size_t h = head.load(std::memory_order_relaxed);
        while (h == tail.load(std::memory_order_acquire)) {}
        sum += buf[h & (N - 1)];
        head.store(h + 1, std::memory_order_relaxed);   // "consumer only reads, relaxed is fine"
    }
    producer.join();
    std::cout << "sum = " << sum << '\n';
}
```

**Answer:**
```
No. Data race (write-after-read on a slot): undefined behaviour. Typically prints sum = 5000050000 on x86.
```

**Explanation:**
- The consumer's relaxed `head` store does not synchronize with the producer's acquire load of `head`.
- So the consumer's read of `buf[h]` does not happen-before the producer's next write into the same slot one lap later. Two unordered accesses, one a write: data race. TSan reports it as "Write ... Previous read".
- The slot hand-over goes both ways: data producer → consumer, ownership consumer → producer.
- On x86 the hardware never moves an older load after a younger store, which is why it "works" there; ARM and the optimizer give no such promise.
- **Key Concept:** Freeing a slot is a publication too: the consumer's index store must be release.

**Fixed Version:**
```cpp
#include <array>
#include <atomic>
#include <cstddef>
#include <iostream>
#include <thread>

constexpr std::size_t N = 8;
constexpr int kCount = 100'000;
std::array<int, N> buf{};
alignas(64) std::atomic<std::size_t> head{0};
alignas(64) std::atomic<std::size_t> tail{0};

int main() {
    std::thread producer([] {
        for (int i = 1; i <= kCount; ++i) {
            const std::size_t t = tail.load(std::memory_order_relaxed);
            while (t - head.load(std::memory_order_acquire) == N) {}
            buf[t & (N - 1)] = i;
            tail.store(t + 1, std::memory_order_release);
        }
    });

    long long sum = 0;
    for (int i = 1; i <= kCount; ++i) {
        const std::size_t h = head.load(std::memory_order_relaxed);
        while (h == tail.load(std::memory_order_acquire)) {}
        sum += buf[h & (N - 1)];
        head.store(h + 1, std::memory_order_release);   // read happens-before slot reuse
    }
    producer.join();
    std::cout << "sum = " << sum << '\n';               // sum = 5000050000
}
```

---

#### Q4
```cpp
// Q: Find the bug. (One producer, two consumers.)
#include <condition_variable>
#include <deque>
#include <iostream>
#include <mutex>
#include <thread>

std::mutex m;
std::condition_variable cv;
std::deque<int> q;
bool done = false;

void consumer(long long& sum) {
    for (;;) {
        std::unique_lock lk(m);
        if (q.empty() && !done) cv.wait(lk);
        if (q.empty() && done) return;
        sum += q.front();
        q.pop_front();
    }
}

int main() {
    long long s1 = 0, s2 = 0;
    std::thread c1(consumer, std::ref(s1)), c2(consumer, std::ref(s2));
    for (int i = 1; i <= 100'000; ++i) {
        { std::lock_guard lk(m); q.push_back(i); }
        cv.notify_one();
    }
    { std::lock_guard lk(m); done = true; }
    cv.notify_all();
    c1.join(); c2.join();
    std::cout << s1 + s2 << '\n';
}
```

**Answer:**
```
Undefined behaviour: a consumer can call q.front() / pop_front() on an empty deque.
In practice most runs crash ("double free or corruption", segfault); some print 5000050000.
```

**Explanation:**
- `if (...) cv.wait(lk);` waits at most once and never re-checks.
- Stolen wake-up: the producer pushes one item and notifies C1; before C1 reacquires the mutex, C2 (which was not waiting) locks it and pops that item. C1 then returns from `wait` with `q` empty and `done == false`, skips the `return`, and calls `q.front()` on an empty deque.
- Spurious wake-ups produce the same path.
- **Key Concept:** Always wait with a predicate (`while` loop); a return from `wait` means "re-check", never "condition holds".

**Fixed Version:**
```cpp
#include <condition_variable>
#include <deque>
#include <iostream>
#include <mutex>
#include <thread>

std::mutex m;
std::condition_variable cv;
std::deque<int> q;
bool done = false;

void consumer(long long& sum) {
    for (;;) {
        std::unique_lock lk(m);
        cv.wait(lk, [] { return !q.empty() || done; });
        if (q.empty()) return;            // done and drained
        const int v = q.front();
        q.pop_front();
        lk.unlock();                      // process outside the lock
        sum += v;
    }
}

int main() {
    long long s1 = 0, s2 = 0;
    std::thread c1(consumer, std::ref(s1)), c2(consumer, std::ref(s2));
    for (int i = 1; i <= 100'000; ++i) {
        { std::lock_guard lk(m); q.push_back(i); }
        cv.notify_one();
    }
    { std::lock_guard lk(m); done = true; }
    cv.notify_all();
    c1.join(); c2.join();
    std::cout << s1 + s2 << '\n';         // 5000050000
}
```

---

#### Q5
```cpp
// Q: Can this bounded queue (capacity 1, two producers, two consumers) deadlock?
#include <condition_variable>
#include <deque>
#include <iostream>
#include <mutex>
#include <thread>

std::mutex m;
std::condition_variable cv;          // one CV for both "not full" and "not empty"
std::deque<int> q;
constexpr std::size_t kCap = 1;

void push(int v) {
    std::unique_lock lk(m);
    cv.wait(lk, [] { return q.size() < kCap; });
    q.push_back(v);
    lk.unlock();
    cv.notify_one();
}

int pop() {
    std::unique_lock lk(m);
    cv.wait(lk, [] { return !q.empty(); });
    const int v = q.front();
    q.pop_front();
    lk.unlock();
    cv.notify_one();
    return v;
}

int main() {
    constexpr int kPer = 100'000;
    long long s1 = 0, s2 = 0;
    std::thread p1([] { for (int i = 0; i < kPer; ++i) push(1); });
    std::thread p2([] { for (int i = 0; i < kPer; ++i) push(1); });
    std::thread c1([&] { for (int i = 0; i < kPer; ++i) s1 += pop(); });
    std::thread c2([&] { for (int i = 0; i < kPer; ++i) s2 += pop(); });
    p1.join(); p2.join(); c1.join(); c2.join();
    std::cout << s1 + s2 << '\n';
}
```

**Answer:**
```
Yes, it can deadlock with all four threads waiting (in testing it hung on practically every run).
If it does finish, it prints 200000.
```

**Explanation:**
- Producers and consumers wait on the **same** CV, and `notify_one` wakes an arbitrary waiter.
- One possible schedule: C1 and C2 wait (empty). P1 pushes and notifies C1. P1 and P2 both try to push: full, both wait. C1 pops and calls `notify_one`, which wakes **C2** instead of a producer. C2 sees an empty queue and waits again. C1 loops, finds the queue empty, and waits.
- Now P1, P2, C1, C2 are all waiting and nobody will ever notify: deadlock.
- The predicates are correct; the bug is that a notification can be "spent" on a thread that cannot use it.
- **Key Concept:** Use one CV per predicate (`not_full`, `not_empty`), or `notify_all` if you insist on a single CV.

**Fixed Version:**
```cpp
#include <condition_variable>
#include <deque>
#include <iostream>
#include <mutex>
#include <thread>

std::mutex m;
std::condition_variable not_full, not_empty;
std::deque<int> q;
constexpr std::size_t kCap = 1;

void push(int v) {
    std::unique_lock lk(m);
    not_full.wait(lk, [] { return q.size() < kCap; });
    q.push_back(v);
    lk.unlock();
    not_empty.notify_one();       // a consumer can now proceed
}

int pop() {
    std::unique_lock lk(m);
    not_empty.wait(lk, [] { return !q.empty(); });
    const int v = q.front();
    q.pop_front();
    lk.unlock();
    not_full.notify_one();        // a producer can now proceed
    return v;
}

int main() {
    constexpr int kPer = 100'000;
    long long s1 = 0, s2 = 0;
    std::thread p1([] { for (int i = 0; i < kPer; ++i) push(1); });
    std::thread p2([] { for (int i = 0; i < kPer; ++i) push(1); });
    std::thread c1([&] { for (int i = 0; i < kPer; ++i) s1 += pop(); });
    std::thread c2([&] { for (int i = 0; i < kPer; ++i) s2 += pop(); });
    p1.join(); p2.join(); c1.join(); c2.join();
    std::cout << s1 + s2 << '\n';   // 200000
}
```

---

#### Q6
```cpp
// Q: The flag is atomic, so there is no data race. Can the consumer hang forever?
#include <atomic>
#include <condition_variable>
#include <iostream>
#include <mutex>
#include <thread>

std::mutex m;
std::condition_variable cv;
std::atomic<bool> ready{false};

int main() {
    std::thread consumer([] {
        std::unique_lock lk(m);
        cv.wait(lk, [] { return ready.load(); });
        std::cout << "got it\n";
    });

    ready.store(true);      // state changed WITHOUT holding the mutex
    cv.notify_one();

    consumer.join();
}
```

**Answer:**
```
Yes. It usually prints "got it", but a lost wake-up can make it hang forever.
```

**Explanation:**
- Inside `wait(lk, pred)` the consumer evaluates `pred()` while holding `m`, sees `false`, and then atomically unlocks and sleeps.
- Between "pred returned false" and "now in the wait set" the producer does not need `m`: it can set `ready` and call `notify_one` with nobody waiting yet. The notification is lost; CVs do not remember notifications.
- The consumer then sleeps with a predicate that is already true and nobody will notify again.
- Making `ready` atomic removes the data race but not the lost wake-up.
- **Key Concept:** Modify the predicate's state while holding the CV's mutex (even if the state is atomic); then notify.

**Fixed Version:**
```cpp
#include <atomic>
#include <condition_variable>
#include <iostream>
#include <mutex>
#include <thread>

std::mutex m;
std::condition_variable cv;
bool ready = false;          // protected by m; no atomic needed

int main() {
    std::thread consumer([] {
        std::unique_lock lk(m);
        cv.wait(lk, [] { return ready; });
        std::cout << "got it\n";
    });

    {
        std::lock_guard lk(m);
        ready = true;        // the consumer is either before its check or already waiting
    }
    cv.notify_one();

    consumer.join();
}
```

---

#### Q7
```cpp
// Q: What does this program print? (32-bit indices, capacity 3, using % instead of a mask)
#include <array>
#include <cstdint>
#include <iostream>

int main() {
    constexpr std::uint32_t N = 3;
    std::array<int, N> buf{};
    std::uint32_t head = UINT32_MAX - 1;   // the counters have been running for a while
    std::uint32_t tail = UINT32_MAX - 1;

    for (int v = 1; v <= 3; ++v) {
        if (tail - head == N) continue;    // full
        buf[tail % N] = v;
        ++tail;
    }
    std::cout << "size = " << tail - head << '\n';
    while (head != tail) std::cout << buf[head++ % N] << ' ';
    std::cout << '\n';
}
```

**Answer:**
```
size = 3
1 3 3 
```

**Explanation:**
- Slots used: `4294967294 % 3 == 2`, `4294967295 % 3 == 0`, then `tail` wraps to `0` and `0 % 3 == 0` again. Element 3 overwrites element 2.
- `tail - head` is still 3 (unsigned subtraction is modulo 2^32), so the size looks right while the content is wrong.
- Monotonic indices with `% N` are only wrap-safe when N divides 2^32 (or 2^64), i.e. when N is a power of two.
- With 32-bit counters the wrap is a real event at market-data rates (about 4.3 billion operations).
- **Key Concept:** Use a power-of-two capacity (mask) or 64-bit counters; non-power-of-two modulo breaks at counter wraparound.

---

#### Q8
```cpp
// Q: What does this program print?
#include <array>
#include <cstddef>
#include <iostream>

int main() {
    constexpr std::size_t N = 6;                 // "the mask trick works for any size"
    std::array<int, N> buf{};
    for (std::size_t i = 0; i < N; ++i)
        buf[i & (N - 1)] = static_cast<int>(i) + 1;
    for (int v : buf) std::cout << v << ' ';
    std::cout << '\n';
}
```

**Answer:**
```
3 4 0 0 5 6 
```

**Explanation:**
- `N - 1 == 5 == 0b101`. Indices 0..5 map to 0, 1, 0, 1, 4, 5.
- Elements 1 and 2 are overwritten by 3 and 4; slots 2 and 3 are never used.
- `i & (N - 1) == i % N` only when N is a power of two.
- **Key Concept:** Guard the mask with `static_assert((N & (N - 1)) == 0)`.

**Fixed Version:**
```cpp
#include <array>
#include <cstddef>
#include <iostream>

template <std::size_t N>
struct Ring {
    static_assert(N >= 2 && (N & (N - 1)) == 0, "capacity must be a power of two");
    std::array<int, N> buf{};
    int& slot(std::size_t i) { return buf[i & (N - 1)]; }
};

int main() {
    Ring<8> r;                                   // Ring<6> would not compile
    for (std::size_t i = 0; i < 6; ++i) r.slot(i) = static_cast<int>(i) + 1;
    for (int v : r.buf) std::cout << v << ' ';
    std::cout << '\n';                           // 1 2 3 4 5 6 0 0
}
```

---

#### Q9
```cpp
// Q: Two producers reserve slots with CAS, one consumer reads everything below tail. Is it correct?
#include <atomic>
#include <cstddef>
#include <iostream>
#include <thread>
#include <vector>

constexpr std::size_t kCap = 1 << 18;     // large enough that it never wraps here
constexpr int kPer = 50'000;
std::vector<int> buf(kCap, 0);
std::atomic<std::size_t> tail{0};

void producer() {
    for (int i = 0; i < kPer; ++i) {
        std::size_t pos = tail.load(std::memory_order_relaxed);
        while (!tail.compare_exchange_weak(pos, pos + 1, std::memory_order_release,
                                           std::memory_order_relaxed)) {}
        buf[pos] = 1;                      // write AFTER reserving
    }
}

int main() {
    std::thread p1(producer), p2(producer);
    long zeros = 0;
    for (std::size_t head = 0; head < 2 * kPer; ++head) {
        while (head >= tail.load(std::memory_order_acquire)) {}
        zeros += (buf[head] == 0);         // "everything below tail is ready"
    }
    p1.join(); p2.join();
    std::cout << "unwritten slots read: " << zeros << '\n';
}
```

**Answer:**
```
Not correct: data race, undefined behaviour. It may print 0 or a positive count.
```

**Explanation:**
- The CAS **reserves** position `pos`; the element is written afterwards. The release on the CAS orders nothing useful because the write comes after it.
- So `tail` counts reservations, not publications. When the consumer sees `tail == 12`, slot 10 may belong to a producer that was preempted right after its CAS.
- The consumer's read of `buf[pos]` and the producer's later write are unordered: data race (TSan reports it); in practice it can read 0 (unwritten) or, in a wrapping ring, the previous lap's element.
- **Key Concept:** Reservation is not publication. Each slot needs its own published state, and the consumer must wait at the first unpublished slot.

**Fixed Version:**
```cpp
#include <array>
#include <atomic>
#include <cstddef>
#include <iostream>
#include <memory>
#include <thread>

template <typename T, std::size_t N>
class MpscQueue {
    static_assert((N & (N - 1)) == 0);
    struct Cell { std::atomic<std::size_t> seq; T data; };
    std::array<Cell, N> cells_;
    alignas(64) std::atomic<std::size_t> tail_{0};   // reservation counter (many writers)
    alignas(64) std::size_t head_ = 0;               // consumer only
public:
    MpscQueue() { for (std::size_t i = 0; i < N; ++i) cells_[i].seq.store(i, std::memory_order_relaxed); }

    bool try_push(const T& v) {
        std::size_t pos = tail_.load(std::memory_order_relaxed);
        for (;;) {
            Cell& c = cells_[pos & (N - 1)];
            const auto diff = static_cast<std::ptrdiff_t>(c.seq.load(std::memory_order_acquire))
                            - static_cast<std::ptrdiff_t>(pos);
            if (diff == 0) {
                if (tail_.compare_exchange_weak(pos, pos + 1, std::memory_order_relaxed)) {
                    c.data = v;
                    c.seq.store(pos + 1, std::memory_order_release);   // publish THIS slot
                    return true;
                }
            } else if (diff < 0) {
                return false;                                          // full
            } else {
                pos = tail_.load(std::memory_order_relaxed);
            }
        }
    }

    bool try_pop(T& out) {
        Cell& c = cells_[head_ & (N - 1)];
        if (c.seq.load(std::memory_order_acquire) != head_ + 1) return false; // not published yet
        out = c.data;
        c.seq.store(head_ + N, std::memory_order_release);                    // free for next lap
        ++head_;
        return true;
    }
};

int main() {
    constexpr int kPer = 50'000;
    auto q = std::make_unique<MpscQueue<int, 1024>>();
    auto producer = [&] { for (int i = 0; i < kPer; ++i) while (!q->try_push(1)) {} };
    std::thread p1(producer), p2(producer);
    long sum = 0;
    for (int got = 0; got < 2 * kPer;) {
        int v;
        if (q->try_pop(v)) { sum += v; ++got; }
    }
    p1.join(); p2.join();
    std::cout << "sum = " << sum << '\n';    // sum = 100000
}
```

---

#### Q10
```cpp
// Q: When full, the producer "overwrites the oldest" by advancing head itself. Is this safe?
#include <array>
#include <atomic>
#include <cstddef>
#include <iostream>
#include <thread>

constexpr std::size_t N = 4;
constexpr int kCount = 200'000;
std::array<int, N> buf{};
alignas(64) std::atomic<std::size_t> head{0};
alignas(64) std::atomic<std::size_t> tail{0};
std::atomic<bool> done{false};

int main() {
    std::thread producer([] {
        for (int i = 1; i <= kCount; ++i) {
            const std::size_t t = tail.load(std::memory_order_relaxed);
            const std::size_t h = head.load(std::memory_order_acquire);
            if (t - h == N) head.store(h + 1, std::memory_order_release);   // drop oldest
            buf[t & (N - 1)] = i;
            tail.store(t + 1, std::memory_order_release);
        }
        done.store(true, std::memory_order_release);
    });

    long received = 0;
    for (;;) {
        const std::size_t h = head.load(std::memory_order_relaxed);
        if (h == tail.load(std::memory_order_acquire)) {
            if (done.load(std::memory_order_acquire) && h == tail.load(std::memory_order_acquire)) break;
            continue;
        }
        [[maybe_unused]] const int v = buf[h & (N - 1)];
        head.store(h + 1, std::memory_order_release);
        ++received;
    }
    producer.join();
    std::cout << "received " << received << '\n';
}
```

**Answer:**
```
Not safe. head has two writers (lost updates, head can even move backwards) and the producer can overwrite
a slot the consumer is reading (data race on buf: undefined behaviour). Output varies; counts above 200000
(the same element received twice) are possible.
```

**Explanation:**
- `head` now has two writers. The stores are atomic, so this part is not a data race, but it is a logic race: the consumer's `head.store(h + 1)` can overwrite the producer's newer `h + 2`, moving `head` backwards so already consumed (or overwritten) slots are read again. Runs printing `received 200170` were observed. Two writers need an RMW (CAS) to arbitrate.
- The producer overwrites the oldest slot while the consumer may be reading exactly that slot: data race on the element (TSan reports it).
- Even if it were implemented correctly, the consumer would still read in order; it does not see "the newest first". It just silently loses unprocessed events.
- **Key Concept:** In a lock-free SPSC only the consumer may move `head`. Choose drop-newest (fail the push and count) or a design built for overwrite semantics.

**Fixed Version:**
```cpp
#include <array>
#include <atomic>
#include <cstddef>
#include <iostream>
#include <thread>

constexpr std::size_t N = 4;
constexpr int kCount = 200'000;
std::array<int, N> buf{};
alignas(64) std::atomic<std::size_t> head{0};
alignas(64) std::atomic<std::size_t> tail{0};
std::atomic<bool> done{false};

int main() {
    long dropped = 0;
    std::thread producer([&] {
        for (int i = 1; i <= kCount; ++i) {
            const std::size_t t = tail.load(std::memory_order_relaxed);
            if (t - head.load(std::memory_order_acquire) == N) { ++dropped; continue; }  // drop newest
            buf[t & (N - 1)] = i;
            tail.store(t + 1, std::memory_order_release);
        }
        done.store(true, std::memory_order_release);
    });

    long received = 0;
    for (;;) {
        const std::size_t h = head.load(std::memory_order_relaxed);
        if (h == tail.load(std::memory_order_acquire)) {
            if (done.load(std::memory_order_acquire) && h == tail.load(std::memory_order_acquire)) break;
            continue;
        }
        [[maybe_unused]] const int v = buf[h & (N - 1)];
        head.store(h + 1, std::memory_order_release);
        ++received;
    }
    producer.join();
    std::cout << "received + dropped = " << received + dropped << '\n';   // always 200000
}
```

---

#### Q11
```cpp
// Q: What does this program print? (1 ms ticks, drop-newest when full)
#include <algorithm>
#include <iostream>

int main() {
    const long capacity = 100'000;
    long depth = 0, dropped = 0, first_full_ms = -1, drained_ms = -1;

    for (long ms = 1; ms <= 30'000; ++ms) {
        const long arrivals = (ms <= 5'000) ? 50 : 10;   // 50k/s burst for 5 s, then 10k/s
        const long accepted = std::min(arrivals, capacity - depth);
        dropped += arrivals - accepted;
        depth += accepted;
        if (depth == capacity && first_full_ms < 0) first_full_ms = ms;
        depth -= std::min(depth, 20L);                    // consumer: 20k/s
        if (ms > 5'000 && depth == 0 && drained_ms < 0) drained_ms = ms;
    }
    std::cout << "first full at " << first_full_ms << " ms\n"
              << "dropped " << dropped << '\n'
              << "drained at " << drained_ms << " ms\n";
}
```

**Answer:**
```
first full at 3333 ms
dropped 50020
drained at 14998 ms
```

**Explanation:**
- Net growth during the burst is 30 per ms. Before the service step of tick k the depth is `30(k - 1) + 50`, which first exceeds 100000 at k = 3333: 10 messages dropped, so the ring is full at about 3.33 s (not "in the 4th second").
- From tick 3334 to 5000 (1667 ticks) the ring refills to capacity every tick and 30 arrivals are dropped each time: 1667 × 30 + 10 = 50020. The continuous estimate (150k demand - 100k capacity = 50k) matches.
- After the burst the depth is 99980 and falls by 10 per ms (10 in, 20 out): 9998 ticks, so drained at 5000 + 9998 = 14998 ms.
- Just before the burst ends, a new message waits about 5 s (100k / 20k per s) behind the backlog.
- **Key Concept:** Backlog growth = arrival - service; fill time = capacity / growth; drain time = backlog / (service - arrival).

---

#### Q12
```cpp
// Q: Can main() hang at join()?
#include <chrono>
#include <condition_variable>
#include <deque>
#include <iostream>
#include <mutex>
#include <thread>

class Queue {
    std::mutex m_;
    std::condition_variable not_empty_;
    std::deque<int> q_;
    bool closed_ = false;
public:
    void push(int v) {
        { std::lock_guard lk(m_); q_.push_back(v); }
        not_empty_.notify_one();
    }
    bool pop(int& out) {
        std::unique_lock lk(m_);
        not_empty_.wait(lk, [&] { return closed_ || !q_.empty(); });
        if (q_.empty()) return false;
        out = q_.front();
        q_.pop_front();
        return true;
    }
    void close() {
        std::lock_guard lk(m_);
        closed_ = true;              // no notify
    }
};

int main() {
    Queue q;
    std::thread consumer([&] {
        int v;
        while (q.pop(v)) std::cout << v << '\n';
        std::cout << "consumer exits\n";
    });
    q.push(42);
    std::this_thread::sleep_for(std::chrono::milliseconds(100));   // consumer is now waiting
    q.close();
    consumer.join();
}
```

**Answer:**
```
Yes. It prints 42 and then hangs forever (in practice; only a spurious wake-up after close() would let it print "consumer exits").
```

**Explanation:**
- The consumer pops 42, loops, finds the queue empty and not closed, and sleeps in `wait` (the 100 ms pause makes sure it got there).
- Without the pause the program often exits normally, because `close()` may run before the consumer first checks the predicate. That timing dependence is exactly what makes this bug escape testing.
- `close()` sets the flag under the lock (correct) but never notifies. A sleeping waiter only re-evaluates its predicate after a notification or a spurious wake-up.
- Nothing will notify again, so `join()` waits forever.
- **Key Concept:** Shutdown is a state change: set the flag under the lock, then `notify_all` every CV that threads may be waiting on.

**Fixed Version:**
```cpp
#include <chrono>
#include <condition_variable>
#include <deque>
#include <iostream>
#include <mutex>
#include <thread>

class Queue {
    std::mutex m_;
    std::condition_variable not_empty_;
    std::deque<int> q_;
    bool closed_ = false;
public:
    void push(int v) {
        { std::lock_guard lk(m_); q_.push_back(v); }
        not_empty_.notify_one();
    }
    bool pop(int& out) {
        std::unique_lock lk(m_);
        not_empty_.wait(lk, [&] { return closed_ || !q_.empty(); });
        if (q_.empty()) return false;
        out = q_.front();
        q_.pop_front();
        return true;
    }
    void close() {
        { std::lock_guard lk(m_); closed_ = true; }
        not_empty_.notify_all();     // wake every waiter so it sees closed_
    }
};

int main() {
    Queue q;
    std::thread consumer([&] {
        int v;
        while (q.pop(v)) std::cout << v << '\n';
        std::cout << "consumer exits\n";
    });
    q.push(42);
    std::this_thread::sleep_for(std::chrono::milliseconds(100));
    q.close();
    consumer.join();                 // prints 42, then consumer exits
}
```

---

#### Q13
```cpp
// Q: What does this program print on x86-64 with GCC or Clang? Which layout avoids false sharing?
#include <atomic>
#include <cstddef>
#include <iostream>

struct Packed {
    std::atomic<std::size_t> head{0};
    std::atomic<std::size_t> tail{0};
};

struct HeadOnly {
    alignas(64) std::atomic<std::size_t> head{0};
    std::atomic<std::size_t> tail{0};
};

struct Both {
    alignas(64) std::atomic<std::size_t> head{0};
    alignas(64) std::atomic<std::size_t> tail{0};
};

int main() {
    std::cout << "Packed   " << sizeof(Packed) << '\n'
              << "HeadOnly " << sizeof(HeadOnly) << '\n'
              << "Both     " << sizeof(Both) << '\n';
}
```

**Answer:**
```
Packed   16
HeadOnly 64
Both     128
```

**Explanation:**
- `Packed`: both 8-byte atomics share one cache line.
- `HeadOnly`: the struct is 64-byte aligned and padded to 64, but `tail` sits at offset 8, on the **same** line as `head`. Still false sharing.
- `Both`: `tail` starts at offset 64, a different line. Only this layout separates the producer-written and consumer-written indices.
- None of these layouts changes synchronization; the atomics and memory orders do that.
- **Key Concept:** `alignas` aligns the start of one member; give every independently written hot variable its own line.
