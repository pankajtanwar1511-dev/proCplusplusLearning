## TOPIC: C++20 Synchronization: latch, barrier, semaphore, jthread

### PRACTICE_TASKS: Output Prediction and Bug Hunting

#### Q1
```cpp
// Q: Find the bug. Main wants to wait for both workers in EVERY round.
#include <iostream>
#include <latch>
#include <thread>

int main() {
    std::latch done{2};
    int results[2] = {};

    for (int round = 1; round <= 3; ++round) {
        std::thread a([&] { results[0] = round * 10; done.count_down(); });
        std::thread b([&] { results[1] = round * 10 + 1; done.count_down(); });
        done.wait();
        std::cout << "round " << round << ": " << results[0] + results[1] << '\n';
        a.join();
        b.join();
    }
}
```

**Answer:**
```
Round 1 is correct ("round 1: 21"). From round 2 on: undefined behaviour (count_down() on a latch
already at 0, data race on results). Observed with GCC 11: "round 1: 21", "round 2: 21" (stale), then a hang.
```

**Explanation:**
- A latch is one-shot. After round 1 the counter is 0 and stays 0.
- Round 2: `done.wait()` returns immediately, so main reads `results` while the workers may still be writing them: data race (TSan reports it); the printed sums may be stale.
- Each worker's `count_down()` now violates the precondition `update <= counter`: undefined behaviour. libstdc++ simply drives the counter negative; a later `wait()` then waits for a 0 that never comes, which is why the observed run hangs in round 3.
- **Key Concept:** Latches cannot be reset: create one per round, or use `std::barrier` for repeated phases.

**Fixed Version:**
```cpp
#include <iostream>
#include <latch>
#include <thread>

int main() {
    int results[2] = {};

    for (int round = 1; round <= 3; ++round) {
        std::latch done{2};                     // fresh latch per round
        std::jthread a([&] { results[0] = round * 10; done.count_down(); });
        std::jthread b([&] { results[1] = round * 10 + 1; done.count_down(); });
        done.wait();
        std::cout << "round " << round << ": " << results[0] + results[1] << '\n';
    }   // jthreads join before the latch is destroyed (declared after it)
}
// round 1: 21
// round 2: 41
// round 3: 61
```

---

#### Q2
```cpp
// Q: Can this program hang?
#include <barrier>
#include <iostream>
#include <thread>
#include <vector>

int main() {
    std::barrier sync{3};
    std::vector<std::jthread> workers;
    for (int id = 0; id < 3; ++id)
        workers.emplace_back([&sync, id] {
            const int steps = (id == 2) ? 1 : 3;     // worker 2 has less work
            for (int s = 0; s < steps; ++s) {
                // ... compute step s ...
                sync.arrive_and_wait();
            }
        });
    workers.clear();                                  // join all
    std::cout << "all done\n";
}
```

**Answer:**
```
Yes, it always hangs: "all done" is never printed.
```

**Explanation:**
- Phase 1 gets 3 arrivals and completes.
- Worker 2 then returns. In phase 2 only workers 0 and 1 arrive; the barrier still expects 3, so both block forever and `workers.clear()` (joining) blocks forever too.
- A barrier counts arrivals; it does not notice that a participant's thread ended.
- **Key Concept:** A participant that leaves must call `arrive_and_drop()` so later phases expect one fewer arrival.

**Fixed Version:**
```cpp
#include <barrier>
#include <iostream>
#include <thread>
#include <vector>

int main() {
    std::barrier sync{3};
    std::vector<std::jthread> workers;
    for (int id = 0; id < 3; ++id)
        workers.emplace_back([&sync, id] {
            const int steps = (id == 2) ? 1 : 3;
            for (int s = 0; s < steps; ++s) {
                sync.arrive_and_wait();
            }
            if (id == 2) sync.arrive_and_drop();      // arrive for phase 2, leave the group
        });
    workers.clear();
    std::cout << "all done\n";                         // all done
}
```

---

#### Q3
```cpp
// Q: What does this program print?
#include <barrier>
#include <iostream>
#include <thread>
#include <vector>

int main() {
    int value[2] = {1, 1};
    int round = 0;

    std::barrier sync{2, [&]() noexcept {
        ++round;
        std::cout << "round " << round << ": " << value[0] << ' ' << value[1] << '\n';
        value[0] = value[1] = value[0] + value[1];
    }};

    std::vector<std::jthread> threads;
    for (int id = 0; id < 2; ++id)
        threads.emplace_back([&, id] {
            for (int r = 0; r < 3; ++r) {
                value[id] *= 2;
                sync.arrive_and_wait();
            }
        });
}
```

**Answer:**
```
round 1: 2 2
round 2: 8 8
round 3: 32 32
```

**Explanation:**
- Round 1: each thread doubles its own `1` → `2 2`; completion prints, then sets both to 4.
- Round 2: doubled to `8 8`; completion sets both to 16.
- Round 3: doubled to `32 32`; completion sets both to 64 (not printed).
- No locks are needed: each thread writes only its own element before arriving; the completion step runs alone, after all arrivals of the phase and before anyone is released, so its read-modify-write of both elements is race-free.
- **Key Concept:** The barrier completion step is a single-threaded synchronization point between phases.

---

#### Q4
```cpp
// Q: Find the bug. The consumer must print the value written by the producer.
#include <iostream>
#include <semaphore>
#include <string>
#include <thread>

std::binary_semaphore ready{1};
std::string message;

int main() {
    std::jthread consumer([] {
        ready.acquire();                      // "wait until the message is ready"
        std::cout << "got: '" << message << "'\n";
    });
    std::jthread producer([] {
        message = "order filled";
        ready.release();
    });
}
```

**Answer:**
```
Data race on message (undefined behaviour). It may print "got: ''", "got: 'order filled'",
or garbage; and the producer's release() past max() == 1 is undefined behaviour too.
```

**Explanation:**
- The semaphore starts with one permit, so the consumer's `acquire()` succeeds immediately, possibly before the producer has written `message`.
- Reading a `std::string` while another thread assigns it is a data race.
- If the consumer acquires before the producer releases, nothing breaks the count; but if the producer releases first, the count would go to 2 on a `binary_semaphore` (`max() == 1`): precondition violation.
- **Key Concept:** The initial count encodes the initial state: for "not ready yet" it must be 0.

**Fixed Version:**
```cpp
#include <iostream>
#include <semaphore>
#include <string>
#include <thread>

std::binary_semaphore ready{0};               // signal not given yet
std::string message;

int main() {
    std::jthread consumer([] {
        ready.acquire();                      // blocks until release()
        std::cout << "got: '" << message << "'\n";
    });
    std::jthread producer([] {
        message = "order filled";             // happens-before the release
        ready.release();
    });
}
// got: 'order filled'
```

---

#### Q5
```cpp
// Q: Can the consumer sleep forever?
#include <atomic>
#include <chrono>
#include <iostream>
#include <thread>

std::atomic<bool> flag{false};

int main() {
    std::jthread consumer([] {
        flag.wait(false);                         // sleep while flag == false
        std::cout << "consumer woke up\n";
    });

    std::this_thread::sleep_for(std::chrono::milliseconds(50));   // consumer is asleep
    flag.notify_one();                            // wake it...
    std::this_thread::sleep_for(std::chrono::milliseconds(50));   // (some other work)
    flag.store(true);                             // ...then change the value
}
```

**Answer:**
```
Yes. In practice it hangs forever: "consumer woke up" is never printed.
```

**Explanation:**
- After 50 ms the consumer is asleep inside `wait(false)`.
- `notify_one()` wakes it; `wait` re-loads the value, sees `false` (the store has not happened yet), and goes back to sleep.
- Without the second sleep the program often survives: libstdc++ spins and re-polls briefly after a wake-up, and may catch the store in that window. The bug is still there; only the timing hides it.
- `store(true)` changes the value but nobody notifies, so the waiter never re-checks. The `jthread` destructor then joins forever.
- `atomic::wait` returns only when it observes a value different from `old`; a notify is just "please re-check now".
- **Key Concept:** Change the value first, then notify.

**Fixed Version:**
```cpp
#include <atomic>
#include <chrono>
#include <iostream>
#include <thread>

std::atomic<bool> flag{false};

int main() {
    std::jthread consumer([] {
        flag.wait(false);
        std::cout << "consumer woke up\n";
    });

    std::this_thread::sleep_for(std::chrono::milliseconds(50));
    flag.store(true);                             // change the value
    flag.notify_one();                            // then wake the waiter
}
// consumer woke up
```

---

#### Q6
```cpp
// Q: What does this program print? What would happen with std::thread instead of std::jthread?
#include <chrono>
#include <iostream>
#include <stop_token>
#include <thread>

int main() {
    {
        std::jthread worker([](std::stop_token st) {
            int ticks = 0;
            while (!st.stop_requested()) {
                std::this_thread::sleep_for(std::chrono::milliseconds(1));
                ++ticks;
            }
            std::cout << "worker: stop seen\n";
        });
        std::this_thread::sleep_for(std::chrono::milliseconds(20));
        std::cout << "leaving scope\n";
    }
    std::cout << "after scope\n";
}
```

**Answer:**
```
leaving scope
worker: stop seen
after scope
```

**Explanation:**
- At the closing brace `~jthread` runs: `request_stop()`, then `join()`.
- The worker notices `stop_requested()` within about 1 ms, prints, and returns; only then does `join()` return and `main` prints "after scope".
- `jthread` passes its own stop token because the lambda's first parameter is a `std::stop_token`.
- With `std::thread` (and a lambda without the token parameter) the destructor of a joinable thread calls `std::terminate`: the program aborts right after "leaving scope".
- **Key Concept:** `jthread` = request stop + join in the destructor; cancellation is cooperative (the loop must check the token).

---

#### Q7
```cpp
// Q: Find the bug in this class.
#include <chrono>
#include <iostream>
#include <mutex>
#include <stop_token>
#include <thread>
#include <vector>

class Sampler {
    std::jthread worker_;
    std::mutex m_;
    std::vector<int> samples_;

public:
    Sampler()
        : worker_([this](std::stop_token st) {
              while (!st.stop_requested()) {
                  {
                      std::lock_guard lk(m_);
                      samples_.push_back(42);
                  }
                  std::this_thread::sleep_for(std::chrono::milliseconds(1));
              }
          }) {}

    std::size_t count() {
        std::lock_guard lk(m_);
        return samples_.size();
    }
};

int main() {
    Sampler s;
    std::this_thread::sleep_for(std::chrono::milliseconds(10));
    std::cout << (s.count() > 0 ? "sampling" : "idle") << '\n';
}
```

**Answer:**
```
Undefined behaviour (it usually prints "sampling" and exits, which hides the bug):
worker_ is declared first, so the thread runs before m_ and samples_ are constructed
and keeps running after they are destroyed.
```

**Explanation:**
- Members are initialised in declaration order: `worker_` starts the thread, which may lock `m_` and push into `samples_` before their constructors ran.
- Members are destroyed in reverse order: `samples_` and `m_` are destroyed first, while the thread may still use them; only then does `~jthread` request stop and join.
- `jthread`'s automatic join does not help if it happens too late.
- **Key Concept:** Declare a `std::jthread` member last: started last, stopped and joined first.

**Fixed Version:**
```cpp
#include <chrono>
#include <iostream>
#include <mutex>
#include <stop_token>
#include <thread>
#include <vector>

class Sampler {
    std::mutex m_;
    std::vector<int> samples_;
    std::jthread worker_;            // last: constructed after, destroyed before the data

public:
    Sampler()
        : worker_([this](std::stop_token st) {
              while (!st.stop_requested()) {
                  {
                      std::lock_guard lk(m_);
                      samples_.push_back(42);
                  }
                  std::this_thread::sleep_for(std::chrono::milliseconds(1));
              }
          }) {}

    std::size_t count() {
        std::lock_guard lk(m_);
        return samples_.size();
    }
};

int main() {
    Sampler s;
    std::this_thread::sleep_for(std::chrono::milliseconds(10));
    std::cout << (s.count() > 0 ? "sampling" : "idle") << '\n';   // sampling
}
```

---

#### Q8
```cpp
// Q: What does this program print?
#include <iostream>
#include <stop_token>
#include <thread>

int main() {
    const auto main_id = std::this_thread::get_id();
    auto where = [main_id] { return std::this_thread::get_id() == main_id ? "main" : "other"; };

    std::stop_source src;
    std::stop_callback cb1(src.get_token(), [&] { std::cout << "cb1 runs in " << where() << '\n'; });

    std::thread t([&] {
        const bool first = src.request_stop();
        std::cout << "request_stop returned " << std::boolalpha << first << '\n';
    });
    t.join();

    std::cout << "second request: " << std::boolalpha << src.request_stop() << '\n';
    std::stop_callback cb2(src.get_token(), [&] { std::cout << "cb2 runs in " << where() << '\n'; });
    std::cout << "end\n";
}
```

**Answer:**
```
cb1 runs in other
request_stop returned true
second request: false
cb2 runs in main
end
```

**Explanation:**
- `cb1` is registered before any stop request. Thread `t` makes the first `request_stop()`, which invokes `cb1` synchronously **in thread t**, before returning `true`.
- The second `request_stop()` returns `false`: stop was already requested, no callbacks run again.
- `cb2` is constructed after stop was requested, so its callable runs immediately **inside the constructor**, in the constructing (main) thread, before "end".
- **Key Concept:** A stop_callback runs in the thread that requests the stop, or immediately at construction if the stop already happened.
