## TOPIC: Condition Variables and Producer-Consumer Signalling

### PRACTICE_TASKS: Output Prediction and Bug Hunting

#### Q1
```cpp
// Q: Find the bug. Two consumers wait for items; the producer pushes one item, then another.
#include <chrono>
#include <condition_variable>
#include <iostream>
#include <mutex>
#include <queue>
#include <thread>

std::mutex m;
std::condition_variable cv;
std::queue<int> q;

void consumer(int id) {
    std::unique_lock<std::mutex> lk(m);
    if (q.empty())
        cv.wait(lk);
    int v = q.front();
    q.pop();
    std::cout << "consumer " << id << " got " << v << '\n';
}

int main() {
    std::thread c1(consumer, 1), c2(consumer, 2);
    std::this_thread::sleep_for(std::chrono::milliseconds(100));

    { std::lock_guard<std::mutex> lk(m); q.push(10); }
    cv.notify_all();

    std::this_thread::sleep_for(std::chrono::milliseconds(100));
    { std::lock_guard<std::mutex> lk(m); q.push(20); }
    cv.notify_one();

    c1.join();
    c2.join();
}
```

**Answer:**
```
Undefined behaviour: the second woken consumer calls front()/pop() on an empty queue.
```

**Explanation:**
- Both consumers block on the CV. `notify_all` unblocks **both**.
- They reacquire the mutex one at a time. The first takes `10`.
- The second returns from `wait` too, never rechecks `q.empty()` (it used `if`), and calls `front()` on an empty `std::queue`: undefined behaviour (often garbage or a crash).
- The same `if` also breaks on a spurious wakeup with a single consumer.
- Using `notify_one` for the first push would only hide the bug; stolen and spurious wakeups still exist.
- **Key Concept:** Returning from `wait` never proves the condition; always re-check it in a loop (or use the predicate overload).

**Fixed Version:**
```cpp
#include <chrono>
#include <condition_variable>
#include <iostream>
#include <mutex>
#include <queue>
#include <thread>

std::mutex m;
std::condition_variable cv;
std::queue<int> q;

void consumer(int id) {
    std::unique_lock<std::mutex> lk(m);
    cv.wait(lk, [] { return !q.empty(); });   // loop + recheck under the mutex
    int v = q.front();
    q.pop();
    std::cout << "consumer " << id << " got " << v << '\n';
}

int main() {
    std::thread c1(consumer, 1), c2(consumer, 2);
    std::this_thread::sleep_for(std::chrono::milliseconds(100));

    { std::lock_guard<std::mutex> lk(m); q.push(10); }
    cv.notify_all();

    std::this_thread::sleep_for(std::chrono::milliseconds(100));
    { std::lock_guard<std::mutex> lk(m); q.push(20); }
    cv.notify_one();

    c1.join();
    c2.join();
}
```

---

#### Q2
```cpp
// Q: What does this program print? (The producer thread finishes before the consumer starts.)
#include <chrono>
#include <condition_variable>
#include <iostream>
#include <mutex>
#include <thread>

std::mutex m;
std::condition_variable cv;
bool ready = false;

int main() {
    std::thread producer([] {
        { std::lock_guard<std::mutex> lk(m); ready = true; }
        cv.notify_one();
    });
    producer.join();

    std::unique_lock<std::mutex> lk(m);
    auto st = cv.wait_for(lk, std::chrono::milliseconds(200));
    std::cout << (st == std::cv_status::timeout ? "timeout" : "no_timeout")
              << " ready=" << ready << '\n';
}
```

**Answer:**
```
timeout ready=1
```

**Explanation:**
- `notify_one` ran when nobody was waiting, so it was dropped. CVs do not remember notifications.
- The raw `wait_for` therefore blocks for the full 200 ms and reports `timeout`, although `ready` has been `true` the whole time.
- With a plain `cv.wait(lk)` this program would hang forever.
- (A spurious wakeup could in theory print `no_timeout`; that would not mean anything was signalled either.)
- `cv.wait_for(lk, 200ms, [] { return ready; })` returns `true` immediately without blocking.
- **Key Concept:** Wait for the state, not for the notification.

---

#### Q3
```cpp
// Q: Is this program correct? The consumer checks `ready` under the mutex.
#include <condition_variable>
#include <iostream>
#include <mutex>
#include <thread>

std::mutex m;
std::condition_variable cv;
bool ready = false;
int data = 0;

int main() {
    std::thread consumer([] {
        std::unique_lock<std::mutex> lk(m);
        cv.wait(lk, [] { return ready; });
        std::cout << "data=" << data << '\n';
    });

    data = 42;
    ready = true;          // producer does not lock m
    cv.notify_one();

    consumer.join();
}
```

**Answer:**
```
Data race on `ready` (and `data`): undefined behaviour. It usually prints data=42, but nothing is guaranteed (it can also hang).
```

**Explanation:**
- The consumer reads `ready` (in the predicate) and `data` under `m`; the producer writes both **without** `m`. Conflicting non-atomic accesses with no happens-before = data race.
- `notify_one` does not synchronize memory; only the mutex unlock/lock pair does.
- Independently of the UB, the write and the notify can fall between the consumer's predicate check and its registration as a waiter: a lost wakeup and a hang.
- ThreadSanitizer (`-fsanitize=thread`) reports "data race" on `ready` and `data` for this program.
- **Key Concept:** Both sides must use the mutex for the shared state; the CV only wakes threads.

**Fixed Version:**
```cpp
#include <condition_variable>
#include <iostream>
#include <mutex>
#include <thread>

std::mutex m;
std::condition_variable cv;
bool ready = false;
int data = 0;

int main() {
    std::thread consumer([] {
        std::unique_lock<std::mutex> lk(m);
        cv.wait(lk, [] { return ready; });
        std::cout << "data=" << data << '\n';
    });

    {
        std::lock_guard<std::mutex> lk(m);
        data = 42;
        ready = true;
    }
    cv.notify_one();

    consumer.join();
}
```

---

#### Q4
```cpp
// Q: Can this program hang? `ready` is atomic, so there is no data race.
//    (The sleep inside the predicate simulates the consumer being preempted.)
#include <atomic>
#include <chrono>
#include <condition_variable>
#include <iostream>
#include <mutex>
#include <thread>

using namespace std::chrono_literals;

std::mutex m;
std::condition_variable cv;
std::atomic<bool> ready{false};

int main() {
    std::thread consumer([] {
        std::unique_lock<std::mutex> lk(m);
        cv.wait(lk, [] {
            bool r = ready.load();
            std::this_thread::sleep_for(100ms);   // "preempted" after reading
            return r;
        });
        std::cout << "consumer woke\n";
    });

    std::this_thread::sleep_for(50ms);
    ready.store(true);          // no mutex
    cv.notify_one();            // no mutex

    consumer.join();
    std::cout << "done\n";
}
```

**Answer:**
```
Yes. It hangs and prints nothing (here deterministically; in real code, rarely and randomly).
```

**Explanation:**
- t = 0 ms: consumer holds `m`, reads `ready == false`, then stalls inside the predicate.
- t = 50 ms: producer stores `true` and calls `notify_one`. The consumer is not yet a waiter, so the notify is dropped.
- t = 100 ms: predicate returns `false`; `wait` releases `m` and blocks. No one will ever notify again.
- `std::atomic` fixed the data race, not the protocol: the CV's "no lost wakeup" guarantee relies on the producer needing the mutex to change the state.
- With the fix, the producer's `lock_guard` blocks until the consumer has released `m` inside `wait`, i.e. until it is a registered waiter, so the notify cannot be missed.
- **Key Concept:** Change CV-guarded state under the same mutex, even if the variable is atomic.

**Fixed Version:**
```cpp
#include <atomic>
#include <chrono>
#include <condition_variable>
#include <iostream>
#include <mutex>
#include <thread>

using namespace std::chrono_literals;

std::mutex m;
std::condition_variable cv;
std::atomic<bool> ready{false};

int main() {
    std::thread consumer([] {
        std::unique_lock<std::mutex> lk(m);
        cv.wait(lk, [] {
            bool r = ready.load();
            std::this_thread::sleep_for(100ms);
            return r;
        });
        std::cout << "consumer woke\n";
    });

    std::this_thread::sleep_for(50ms);
    {
        std::lock_guard<std::mutex> lk(m);   // waits until the consumer is a waiter
        ready.store(true);
    }
    cv.notify_one();

    consumer.join();
    std::cout << "done\n";
}
```

---

#### Q5
```cpp
// Q: What does this program print? Three consumers, one item, notify_all, then shutdown.
#include <chrono>
#include <condition_variable>
#include <iostream>
#include <mutex>
#include <queue>
#include <thread>
#include <vector>

std::mutex m;
std::condition_variable cv;
std::queue<int> q;
bool stopping = false;
int exited = 0;

void consumer() {
    std::unique_lock<std::mutex> lk(m);
    while (true) {
        cv.wait(lk, [] { return !q.empty() || stopping; });
        if (q.empty() && stopping) { ++exited; return; }
        int v = q.front();
        q.pop();
        std::cout << "took " << v << '\n';
    }
}

int main() {
    std::vector<std::thread> cs;
    for (int i = 0; i < 3; ++i) cs.emplace_back(consumer);
    std::this_thread::sleep_for(std::chrono::milliseconds(50));

    { std::lock_guard<std::mutex> lk(m); q.push(42); }
    cv.notify_all();

    std::this_thread::sleep_for(std::chrono::milliseconds(50));
    { std::lock_guard<std::mutex> lk(m); stopping = true; }
    cv.notify_all();

    for (auto& t : cs) t.join();
    std::cout << "exited=" << exited << '\n';
}
```

**Answer:**
```
took 42
exited=3
```

**Explanation:**
- `notify_all` unblocks all three consumers, but they reacquire `m` one at a time.
- The first one takes `42`; the other two find `q.empty() && !stopping`, so the predicate loop puts them back to sleep. No duplicate "took" line is possible.
- The second `notify_all` wakes everyone with `stopping == true` and an empty queue, so all three exit.
- The output is the same no matter which consumer wins; only the thread that printed "took" differs.
- Had shutdown used `notify_one`, only one consumer would exit and `join()` would hang.
- **Key Concept:** `notify_all` wakes everybody, the mutex serializes them, and the predicate filters them.

---

#### Q6
```cpp
// Q: What does this program print? The pool is asked to stop after 5 tasks were queued.
#include <condition_variable>
#include <iostream>
#include <mutex>
#include <queue>
#include <thread>

std::mutex m;
std::condition_variable cv;
std::queue<int> q;
bool stopping = false;
int processed = 0;

void worker() {
    while (true) {
        std::unique_lock<std::mutex> lk(m);
        cv.wait(lk, [] { return !q.empty() || stopping; });
        if (stopping) return;
        q.pop();
        ++processed;
    }
}

int main() {
    std::unique_lock<std::mutex> lk(m);   // main holds the lock while setting up
    std::thread t(worker);
    for (int i = 0; i < 5; ++i) q.push(i);
    stopping = true;
    lk.unlock();
    cv.notify_all();
    t.join();
    std::cout << "processed " << processed << " of 5\n";
}
```

**Answer:**
```
processed 0 of 5
```

**Explanation:**
- The worker cannot take `m` until `main` unlocks it, and by then the queue has 5 items **and** `stopping == true`.
- The predicate is true, `wait` returns, and `if (stopping) return;` exits immediately: all five accepted tasks are silently dropped.
- In a real pool the same happens whenever shutdown races with recently queued work.
- If abandoning work is not intended, exit only when there is nothing left: `if (q.empty() && stopping) return;` This prints `processed 5 of 5`.
- **Key Concept:** Decide explicitly between "drain then stop" and "stop now"; `if (stopping)` silently chooses the latter.

**Fixed Version:**
```cpp
#include <condition_variable>
#include <iostream>
#include <mutex>
#include <queue>
#include <thread>

std::mutex m;
std::condition_variable cv;
std::queue<int> q;
bool stopping = false;
int processed = 0;

void worker() {
    while (true) {
        std::unique_lock<std::mutex> lk(m);
        cv.wait(lk, [] { return !q.empty() || stopping; });
        if (q.empty() && stopping) return;   // drain first
        q.pop();
        ++processed;
    }
}

int main() {
    std::unique_lock<std::mutex> lk(m);
    std::thread t(worker);
    for (int i = 0; i < 5; ++i) q.push(i);
    stopping = true;
    lk.unlock();
    cv.notify_all();
    t.join();
    std::cout << "processed " << processed << " of 5\n";
}
```

---

#### Q7
```cpp
// Q: Does this compile? If not, why?
#include <condition_variable>
#include <mutex>

std::mutex m;
std::condition_variable cv;
bool ready = true;

int main() {
    std::lock_guard<std::mutex> lk(m);
    cv.wait(lk, [] { return ready; });
}
```

**Answer:**
```
Compile error: no matching function for call to 'std::condition_variable::wait(std::lock_guard<std::mutex>&, ...)'
```

**Explanation:**
- `std::condition_variable::wait` takes `std::unique_lock<std::mutex>&` only.
- `wait` must unlock the mutex while blocked and relock it before returning; `lock_guard` has no `unlock()`/`lock()`, so there is no conversion.
- Even though `ready` is already `true` (so no blocking would happen), the type requirement is checked at compile time.
- `std::condition_variable_any` would accept `std::unique_lock`, `std::shared_lock`, or any type with `lock()`/`unlock()`, but still not a `lock_guard` (no `unlock()`).
- **Key Concept:** `wait` = temporary unlock + relock, which needs `std::unique_lock`.

**Fixed Version:**
```cpp
#include <condition_variable>
#include <iostream>
#include <mutex>

std::mutex m;
std::condition_variable cv;
bool ready = true;

int main() {
    std::unique_lock<std::mutex> lk(m);
    cv.wait(lk, [] { return ready; });
    std::cout << "ok\n";
}
```

---

#### Q8
```cpp
// Q: Can this deadlock (hang)? Three players must print in strict round-robin order.
#include <condition_variable>
#include <iostream>
#include <mutex>
#include <thread>

std::mutex m;
std::condition_variable cv;
int turn = 0;
long moves = 0;

void player(int me) {
    for (int i = 0; i < 10000; ++i) {
        std::unique_lock<std::mutex> lk(m);
        cv.wait(lk, [&] { return turn == me; });
        ++moves;
        turn = (turn + 1) % 3;
        lk.unlock();
        cv.notify_one();
    }
}

int main() {
    std::thread a(player, 0), b(player, 1), c(player, 2);
    a.join();
    b.join();
    c.join();
    std::cout << "moves=" << moves << '\n';
}
```

**Answer:**
```
Yes, it can hang (nondeterministic; in practice it usually hangs within a few runs). When it completes it prints moves=30000.
```

**Explanation:**
- Three threads wait on one CV for **different** predicates (`turn == 0`, `1`, `2`).
- Player 0 sets `turn = 1` and calls `notify_one`, which may wake player 2. Player 2's predicate is false, so it sleeps again.
- Player 1 was never notified and sleeps forever; nobody else can advance `turn`. All three are blocked.
- It is a lost wakeup caused by `notify_one` choosing the wrong waiter, not by a missing mutex.
- Fix: `notify_all` (everyone rechecks, exactly one proceeds), or one CV per player and notify the next player's CV.
- **Key Concept:** `notify_one` is only safe if every waiter on that CV can use the state change.

**Fixed Version:**
```cpp
#include <condition_variable>
#include <iostream>
#include <mutex>
#include <thread>

std::mutex m;
std::condition_variable cv[3];   // one CV per player
int turn = 0;
long moves = 0;

void player(int me) {
    for (int i = 0; i < 10000; ++i) {
        std::unique_lock<std::mutex> lk(m);
        cv[me].wait(lk, [&] { return turn == me; });
        ++moves;
        turn = (turn + 1) % 3;
        int next = turn;
        lk.unlock();
        cv[next].notify_one();   // wake exactly the player whose turn it is
    }
}

int main() {
    std::thread a(player, 0), b(player, 1), c(player, 2);
    a.join();
    b.join();
    c.join();
    std::cout << "moves=" << moves << '\n';
}
```

---

#### Q9
```cpp
// Q: wait_ready() should give up after about 1 second. Roughly when does it return, and what does it print?
#include <chrono>
#include <condition_variable>
#include <iostream>
#include <mutex>
#include <thread>

using namespace std::chrono;
using namespace std::chrono_literals;

std::mutex m;
std::condition_variable cv;
bool ready = false;   // never set in this program

bool wait_ready() {
    std::unique_lock<std::mutex> lk(m);
    while (!ready) {
        if (cv.wait_for(lk, 1s) == std::cv_status::timeout)
            return false;
    }
    return true;
}

int main() {
    std::thread ticker([] {   // another component notifies the same CV every 200 ms
        for (int i = 0; i < 15; ++i) {
            std::this_thread::sleep_for(200ms);
            cv.notify_all();
        }
    });

    auto t0 = steady_clock::now();
    bool ok = wait_ready();
    auto secs = duration_cast<seconds>(steady_clock::now() - t0).count();
    std::cout << "ready=" << ok << " after " << secs << " s\n";
    ticker.join();
}
```

**Answer:**
```
ready=0 after 4 s
```

**Explanation:**
- Each unrelated `notify_all` wakes `wait_ready` with `no_timeout`; `ready` is still false, so it calls `wait_for(lk, 1s)` again with a **fresh** 1 s budget.
- The ticker notifies every 200 ms for 3 s; the timeout can only fire 1 s after the last tick, at about 4 s total.
- With a continuous stream of notifications (or frequent spurious wakeups) it would never time out.
- The fixed version uses one absolute deadline and prints `ready=0 after 1 s`.
- **Key Concept:** A timeout belongs to the whole wait: use `wait_for(lk, d, pred)` or `wait_until(lk, deadline, pred)`.

**Fixed Version:**
```cpp
#include <chrono>
#include <condition_variable>
#include <iostream>
#include <mutex>
#include <thread>

using namespace std::chrono;
using namespace std::chrono_literals;

std::mutex m;
std::condition_variable cv;
bool ready = false;

bool wait_ready() {
    std::unique_lock<std::mutex> lk(m);
    return cv.wait_for(lk, 1s, [] { return ready; });   // one deadline: now() + 1s
}

int main() {
    std::thread ticker([] {
        for (int i = 0; i < 15; ++i) {
            std::this_thread::sleep_for(200ms);
            cv.notify_all();
        }
    });

    auto t0 = steady_clock::now();
    bool ok = wait_ready();
    auto secs = duration_cast<seconds>(steady_clock::now() - t0).count();
    std::cout << "ready=" << ok << " after " << secs << " s\n";
    ticker.join();
}
```

---

#### Q10
```cpp
// Q: Nobody ever calls notify. What does this program print?
#include <condition_variable>
#include <iostream>
#include <mutex>

std::mutex m;
std::condition_variable cv;
bool ready = true;
int calls = 0;

int main() {
    std::unique_lock<std::mutex> lk(m);
    cv.wait(lk, [] { ++calls; return ready; });
    std::cout << "returned, predicate calls=" << calls
              << ", owns lock=" << lk.owns_lock() << '\n';
}
```

**Answer:**
```
returned, predicate calls=1, owns lock=1
```

**Explanation:**
- `wait(lk, pred)` is `while (!pred()) wait(lk);`. The predicate is evaluated once, before any blocking.
- It is already `true`, so the thread never blocks and no notification is needed.
- The lock is still owned on return (it was never released).
- This is exactly why "notify before wait" is harmless with the predicate form.
- **Key Concept:** The predicate is checked first; a CV wait on an already-true condition costs one function call.

---

#### Q11
```cpp
// Q: Find the bug. The waiter deletes the completion object as soon as it sees `done`.
#include <condition_variable>
#include <iostream>
#include <mutex>
#include <thread>

struct Completion {
    std::mutex m;
    std::condition_variable cv;
    bool done = false;
};

void signal_done(Completion* c) {
    {
        std::lock_guard<std::mutex> lk(c->m);
        c->done = true;
    }
    c->cv.notify_one();
}

int main() {
    for (int i = 0; i < 1000; ++i) {
        auto* c = new Completion;
        std::thread t(signal_done, c);
        {
            std::unique_lock<std::mutex> lk(c->m);
            c->cv.wait(lk, [&] { return c->done; });
        }
        delete c;
        t.join();
    }
    std::cout << "ok\n";
}
```

**Answer:**
```
Use-after-free (undefined behaviour). It usually prints "ok", which hides the bug.
```

**Explanation:**
- After the signaller unlocks, the waiter can observe `done == true` without blocking at all (or after a spurious wakeup), return, and `delete c`.
- The signaller then calls `c->cv.notify_one()` on a destroyed object.
- The CV rule: you may destroy it once all waiters were notified, but the **notifier** must not touch it afterwards.
- ThreadSanitizer flags this program: a data race between the CV destructor (`pthread_cond_destroy`) in `main` and `notify_one` in the signalling thread.
- Options:
  - notify while holding `c->m` (the waiter cannot get past `wait` until the signaller unlocks);
  - or give both sides ownership, as in the fixed version (most robust: the signaller never touches freed memory);
  - or use `std::promise<void>`/`std::future<void>` for one-shot completion.
- **Key Concept:** "Notify after unlock" is a performance habit; object lifetime can overrule it.

**Fixed Version:**
```cpp
#include <condition_variable>
#include <iostream>
#include <memory>
#include <mutex>
#include <thread>

struct Completion {
    std::mutex m;
    std::condition_variable cv;
    bool done = false;
};

void signal_done(std::shared_ptr<Completion> c) {   // shared ownership
    {
        std::lock_guard<std::mutex> lk(c->m);
        c->done = true;
    }
    c->cv.notify_one();                             // c is still alive here
}

int main() {
    for (int i = 0; i < 1000; ++i) {
        auto c = std::make_shared<Completion>();
        std::thread t(signal_done, c);
        {
            std::unique_lock<std::mutex> lk(c->m);
            c->cv.wait(lk, [&] { return c->done; });
        }
        c.reset();                                  // last owner frees it
        t.join();
    }
    std::cout << "ok\n";
}
```

---

#### Q12
```cpp
// Q: 4 workers, 8 tasks, each task takes 50 ms. Roughly how long does this run?
#include <chrono>
#include <condition_variable>
#include <iostream>
#include <mutex>
#include <queue>
#include <thread>
#include <vector>

using namespace std::chrono;

std::mutex m;
std::condition_variable cv;
std::queue<int> q;
bool stopping = false;

void worker() {
    while (true) {
        std::unique_lock<std::mutex> lk(m);
        cv.wait(lk, [] { return !q.empty() || stopping; });
        if (q.empty() && stopping) return;
        q.pop();
        std::this_thread::sleep_for(milliseconds(50));   // "process" the task
    }
}

int main() {
    for (int i = 0; i < 8; ++i) q.push(i);
    auto t0 = steady_clock::now();
    std::vector<std::thread> ws;
    for (int i = 0; i < 4; ++i) ws.emplace_back(worker);
    { std::lock_guard<std::mutex> lk(m); stopping = true; }
    cv.notify_all();
    for (auto& t : ws) t.join();
    auto ms = duration_cast<milliseconds>(steady_clock::now() - t0).count();
    std::cout << "elapsed ~" << (ms + 50) / 100 * 100 << " ms\n";
}
```

**Answer:**
```
elapsed ~400 ms
```

**Explanation:**
- `wait` returns with the mutex held, and the 50 ms "processing" happens **before** the lock is released (the `unique_lock` destructor runs at the end of the loop body).
- So only one worker runs at a time: 8 tasks × 50 ms ≈ 400 ms. The other three workers are blocked on the mutex the whole time.
- Moving the work out of the critical section lets the 4 workers run in parallel: 2 rounds × 50 ms ≈ 100 ms (the fixed version prints `elapsed ~100 ms`).
- Producers would also be blocked during processing in a real system.
- **Key Concept:** `wait` gives you the lock back; release it before doing the actual work.

**Fixed Version:**
```cpp
#include <chrono>
#include <condition_variable>
#include <iostream>
#include <mutex>
#include <queue>
#include <thread>
#include <vector>

using namespace std::chrono;

std::mutex m;
std::condition_variable cv;
std::queue<int> q;
bool stopping = false;

void worker() {
    while (true) {
        std::unique_lock<std::mutex> lk(m);
        cv.wait(lk, [] { return !q.empty() || stopping; });
        if (q.empty() && stopping) return;
        q.pop();
        lk.unlock();                                       // release before working
        std::this_thread::sleep_for(milliseconds(50));
    }
}

int main() {
    for (int i = 0; i < 8; ++i) q.push(i);
    auto t0 = steady_clock::now();
    std::vector<std::thread> ws;
    for (int i = 0; i < 4; ++i) ws.emplace_back(worker);
    { std::lock_guard<std::mutex> lk(m); stopping = true; }
    cv.notify_all();
    for (auto& t : ws) t.join();
    auto ms = duration_cast<milliseconds>(steady_clock::now() - t0).count();
    std::cout << "elapsed ~" << (ms + 50) / 100 * 100 << " ms\n";
}
```
