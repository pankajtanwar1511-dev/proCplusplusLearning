## TOPIC: async, future/promise, thread_local and call_once

### PRACTICE_TASKS: Output Prediction and Bug Hunting

#### Q1
```cpp
// Q: What does this program print?
#include <array>
#include <iostream>
#include <thread>

thread_local int counter = 0;

void foo() { ++counter; }

int main() {
    std::array<int, 3> result{};
    std::array<std::thread, 3> ts;
    for (int i = 0; i < 3; ++i)
        ts[i] = std::thread([i, &result] {
            for (int k = 0; k < 100; ++k) foo();
            result[i] = counter;
        });
    for (auto& t : ts) t.join();

    std::cout << result[0] << ' ' << result[1] << ' ' << result[2] << '\n';
    std::cout << counter << '\n';
}
```

**Answer:**
```
100 100 100
0
```

**Explanation:**
- Each thread has its own `counter`, starting at 0, incremented 100 times by that thread only.
- No data race: no instance of `counter` is touched by two threads. `result[i]` slots are distinct objects, read after `join()`.
- `main`'s own instance was never incremented.
- **Key Concept:** thread_local means one instance per thread, not one shared variable.

---

#### Q2
```cpp
// Q: What does this program print, and in what order?
#include <chrono>
#include <future>
#include <iostream>
#include <thread>

int main() {
    std::cout << "start\n";
    std::async(std::launch::async, [] {
        std::this_thread::sleep_for(std::chrono::milliseconds(200));
        std::cout << "task finished\n";
    });
    std::cout << "after async\n";
}
```

**Answer:**
```
start
task finished
after async
```
(GCC also warns: ignoring return value of 'std::async', declared with attribute 'nodiscard'.)

**Explanation:**
- `std::async` returns a temporary `std::future`. It is destroyed at the end of the full expression.
- The last future of an async-launched task **blocks in its destructor** until the task completes.
- So the "background" task runs to completion before `after async` is printed. Deterministic.
- **Key Concept:** A discarded std::async future makes the call synchronous.

**Fixed Version:**
```cpp
#include <chrono>
#include <future>
#include <iostream>
#include <thread>

int main() {
    std::cout << "start\n";
    auto fut = std::async(std::launch::async, [] {
        std::this_thread::sleep_for(std::chrono::milliseconds(200));
        std::cout << "task finished\n";
    });
    std::cout << "after async\n"; // now printed first (task sleeps 200 ms)
    fut.get();
}
```

---

#### Q3
```cpp
// Q: What does this program print?
#include <chrono>
#include <future>
#include <iostream>
#include <thread>

int main() {
    auto main_id = std::this_thread::get_id();
    auto f = std::async(std::launch::deferred, [main_id] {
        std::cout << "running on "
                  << (std::this_thread::get_id() == main_id ? "main" : "other") << '\n';
        return 7;
    });

    auto status = f.wait_for(std::chrono::milliseconds(100));
    std::cout << (status == std::future_status::ready    ? "ready"
                : status == std::future_status::timeout  ? "timeout"
                                                         : "deferred") << '\n';
    int value = f.get();
    std::cout << "value " << value << '\n';
}
```

**Answer:**
```
deferred
running on main
value 7
```

**Explanation:**
- A deferred task does not run until `get()` or `wait()`. `wait_for` does not start it; it returns `future_status::deferred` immediately (no 100 ms wait).
- `get()` runs the task synchronously on the calling thread (main).
- A loop `while (f.wait_for(...) != std::future_status::ready)` on this future would spin forever. Same risk with the default policy if the implementation defers.
- **Key Concept:** deferred means lazy and same-thread; wait_for never makes it ready.

---

#### Q4
```cpp
// Q: What does this program print?
#include <future>
#include <iostream>
#include <thread>

int main() {
    std::promise<int> p;
    std::future<int> f = p.get_future();

    std::thread producer([pr = std::move(p)](bool fail) mutable {
        if (fail) return;            // early exit: forgot to set the promise
        pr.set_value(1);
    }, true);

    try {
        std::cout << f.get() << '\n';
    } catch (const std::future_error& e) {
        std::cout << "future_error: " << e.what() << '\n';
        std::cout << std::boolalpha
                  << (e.code() == std::future_errc::broken_promise) << '\n';
    }
    producer.join();
}
```

**Answer:**
```
future_error: std::future_error: Broken promise
true
```

**Explanation:**
- The promise was moved into the lambda, so it is destroyed with the thread's callable after the early `return`.
- A promise destroyed without a result stores `future_error(broken_promise)` and makes the state ready.
- `get()` wakes up and throws. No hang.
- The `what()` text is libstdc++'s; the error code is portable.
- **Key Concept:** An abandoned promise breaks loudly instead of leaving waiters stuck.

---

#### Q5
```cpp
// Q: What does this program print?
#include <future>
#include <iostream>

int main() {
    std::promise<int> p;
    std::future<int> f = p.get_future();
    p.set_value(10);

    std::cout << f.get() << '\n';
    std::cout << std::boolalpha << f.valid() << '\n';
    try {
        std::cout << f.get() << '\n';
    } catch (const std::future_error& e) {
        std::cout << "second get: " << e.what() << '\n';
    }
    try {
        p.set_value(20);
    } catch (const std::future_error& e) {
        std::cout << "second set: " << e.what() << '\n';
    }
}
```

**Answer:**
```
10
false
second get: std::future_error: No associated state
second set: std::future_error: Promise already satisfied
```
(Exact output with libstdc++. The second `get()` is undefined behaviour by the standard; libstdc++ chooses to throw `no_state`.)

**Explanation:**
- `get()` moves the result out and releases the future's shared state: `valid()` becomes `false`.
- Calling `get()` on an invalid future is UB in the standard; implementations are encouraged to throw `future_error` with `no_state`, which libstdc++ does.
- `set_value` a second time is well defined: throws `promise_already_satisfied`.
- **Key Concept:** std::future is one-shot; use shared_future for repeated reads.

---

#### Q6
```cpp
// Q: Can this program hang? Explain.
#include <future>
#include <iostream>

int main() {
    std::packaged_task<int()> task([] { return 7; });
    std::future<int> f = task.get_future();

    std::cout << "waiting\n";
    std::cout << f.get() << '\n';
    task();
}
```

**Answer:**
```
Prints "waiting" and then hangs forever (self-deadlock).
```

**Explanation:**
- A `packaged_task` does not start on construction. Nothing runs until `task()` is called.
- `f.get()` blocks the main thread waiting for a result that only the main thread can produce, later.
- The task object is still alive, so there is no `broken_promise` to wake the waiter.
- **Key Concept:** packaged_task needs someone to invoke it before (or concurrently with) get().

**Fixed Version:**
```cpp
#include <future>
#include <iostream>
#include <thread>

int main() {
    std::packaged_task<int()> task([] { return 7; });
    std::future<int> f = task.get_future();

    std::thread runner(std::move(task)); // run it on another thread
    std::cout << "waiting\n";
    std::cout << f.get() << '\n';        // 7
    runner.join();
}
```

---

#### Q7
```cpp
// Q: Find the bug.
#include <chrono>
#include <future>
#include <iostream>
#include <thread>

std::future<int> start_computation() {
    std::promise<int> promise;
    std::future<int> fut = promise.get_future();
    std::thread([&promise] {
        std::this_thread::sleep_for(std::chrono::milliseconds(50));
        promise.set_value(42);
    }).detach();
    return fut;
}

int main() {
    auto f = start_computation();
    std::cout << f.get() << '\n';
}
```

**Answer:**
```
Undefined behaviour: the detached thread calls set_value on a destroyed promise.
Typically: get() throws future_error (Broken promise), the program terminates, or it crashes.
```

**Explanation:**
- `promise` is a local of `start_computation`. When the function returns, the promise is destroyed: that stores `broken_promise` in the shared state, so `f.get()` most likely throws, and with no catch the program terminates.
- Meanwhile the detached thread still holds a **dangling reference** and later calls `set_value` on a dead object: UB.
- Lifetime rule: the producer must own its promise.
- **Key Concept:** Move the promise into the producing thread; never share it by reference with a detached thread.

**Fixed Version:**
```cpp
#include <chrono>
#include <future>
#include <iostream>
#include <thread>

std::future<int> start_computation() {
    std::promise<int> promise;
    std::future<int> fut = promise.get_future();
    std::thread([p = std::move(promise)]() mutable {
        std::this_thread::sleep_for(std::chrono::milliseconds(50));
        p.set_value(42);
    }).detach();
    return fut;
}

int main() {
    auto f = start_computation();
    std::cout << f.get() << '\n'; // 42
}
```

---

#### Q8
```cpp
// Q: What does this program print?
#include <iostream>
#include <mutex>
#include <stdexcept>

std::once_flag flag;
int calls = 0;

void init() {
    ++calls;
    std::cout << "init attempt " << calls << '\n';
    if (calls < 3) throw std::runtime_error("not yet");
}

int main() {
    for (int i = 0; i < 5; ++i) {
        try {
            std::call_once(flag, init);
        } catch (const std::exception& e) {
            std::cout << "caught: " << e.what() << '\n';
        }
    }
    std::cout << "calls = " << calls << '\n';
}
```

**Answer:**
```
init attempt 1
caught: not yet
init attempt 2
caught: not yet
init attempt 3
calls = 3
```

**Explanation:**
- A call that exits via exception is an **exceptional** execution: the exception propagates to the caller and the flag is not set.
- The next `call_once` retries. The third attempt returns normally and the flag becomes set.
- Iterations 4 and 5 are passive: they return without calling `init`.
- **Key Concept:** call_once guarantees one successful execution and retries failed ones.

---

#### Q9
```cpp
// Q: Is this a correct once-only initialization? How many times can "resource created" print?
#include <atomic>
#include <iostream>
#include <thread>
#include <vector>

std::atomic<bool> initialized{false};
std::atomic<int> creations{0};

void create_resource() {
    creations.fetch_add(1);
}

void init() {
    if (!initialized.load()) {
        create_resource();
        initialized.store(true);
    }
}

int main() {
    std::vector<std::thread> ts;
    for (int i = 0; i < 8; ++i) ts.emplace_back(init);
    for (auto& t : ts) t.join();
    std::cout << "resource created " << creations.load() << " time(s)\n";
}
```

**Answer:**
```
Not correct. Prints "resource created N time(s)" with N anywhere from 1 to 8 (usually 1, occasionally more).
```

**Explanation:**
- No data race (everything is atomic), so there is no UB, but the logic is still broken.
- Several threads can load `false` before any of them stores `true`; each then calls `create_resource()`.
- Also, threads that see `true` while the first thread is still creating would not wait for the resource to be ready.
- **Key Concept:** Atomic individual steps do not make check-then-act atomic; use std::call_once or a magic static.

**Fixed Version:**
```cpp
#include <atomic>
#include <iostream>
#include <mutex>
#include <thread>
#include <vector>

std::once_flag flag;
std::atomic<int> creations{0};

void create_resource() {
    creations.fetch_add(1);
}

void init() {
    std::call_once(flag, create_resource); // one execution, others wait
}

int main() {
    std::vector<std::thread> ts;
    for (int i = 0; i < 8; ++i) ts.emplace_back(init);
    for (auto& t : ts) t.join();
    std::cout << "resource created " << creations.load() << " time(s)\n"; // always 1
}
```

---

#### Q10
```cpp
// Q: What does this program print?
#include <future>
#include <iostream>

thread_local int hits = 0;

int bump() { return ++hits; }

int main() {
    auto d = std::async(std::launch::deferred, bump);
    auto a = std::async(std::launch::async, bump);

    std::cout << "deferred returned " << d.get() << '\n';
    std::cout << "async returned " << a.get() << '\n';
    std::cout << "main hits " << hits << '\n';
}
```

**Answer:**
```
deferred returned 1
async returned 1
main hits 1
```

**Explanation:**
- The deferred task runs inside `d.get()` **on the main thread**, so it increments main's `hits` (0 to 1).
- The async task runs as if on a new thread with a fresh `hits` (0 to 1); main's instance is unaffected by it.
- So main's `hits` is 1 because of the deferred task, not the async one.
- With the default launch policy you could not know which instance gets incremented.
- **Key Concept:** Launch policy decides which thread, and therefore which thread_local instance, the task uses.

---

#### Q11
```cpp
// Q: What does this program print?
#include <iostream>
#include <string>
#include <thread>

struct Tracer {
    std::string name;
    explicit Tracer(std::string n) : name(std::move(n)) { std::cout << "ctor " << name << '\n'; }
    ~Tracer() { std::cout << "dtor " << name << '\n'; }
};

void use(const char* who) {
    thread_local Tracer t(who);
    std::cout << "use by " << t.name << '\n';
}

int main() {
    std::thread worker([] {
        use("worker");
        use("worker-again");
    });
    worker.join();
    std::cout << "joined\n";
}
```

**Answer:**
```
ctor worker
use by worker
use by worker
dtor worker
joined
```

**Explanation:**
- The block-scope `thread_local` is constructed the first time the worker reaches the declaration, with argument `"worker"`. The second call reuses the same instance (the initializer does not run again).
- It is destroyed when the worker thread exits, which completes before `join()` returns, so `dtor worker` precedes `joined`.
- The main thread never calls `use()`, so it never constructs its own instance: no `ctor`/`dtor` for main.
- **Key Concept:** Block-scope thread_local objects are built lazily per thread and destroyed at that thread's exit.

---

#### Q12
```cpp
// Q: The intent is to process 4 jobs in parallel. Do they run in parallel? Roughly how long does this take?
#include <chrono>
#include <future>
#include <iostream>
#include <thread>

void job() { std::this_thread::sleep_for(std::chrono::milliseconds(100)); }

int main() {
    auto start = std::chrono::steady_clock::now();
    for (int i = 0; i < 4; ++i) {
        auto f = std::async(std::launch::async, job);
    }
    auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(
                  std::chrono::steady_clock::now() - start).count();
    std::cout << (ms >= 400 ? "sequential" : "parallel") << '\n';
}
```

**Answer:**
```
sequential
```
(About 400 ms in total.)

**Explanation:**
- `f` is a local inside the loop body. At the end of each iteration it is destroyed, and the destructor of an async-created future waits for its task.
- So each job starts only after the previous one finished: 4 x 100 ms.
- Naming the future does not help if its scope ends immediately; it only silences the `[[nodiscard]]` warning.
- **Key Concept:** Keep std::async futures alive across the region where you want concurrency.

**Fixed Version:**
```cpp
#include <chrono>
#include <future>
#include <iostream>
#include <thread>
#include <vector>

void job() { std::this_thread::sleep_for(std::chrono::milliseconds(100)); }

int main() {
    auto start = std::chrono::steady_clock::now();
    std::vector<std::future<void>> futures;
    for (int i = 0; i < 4; ++i)
        futures.push_back(std::async(std::launch::async, job));
    for (auto& f : futures) f.get();
    auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(
                  std::chrono::steady_clock::now() - start).count();
    std::cout << (ms < 400 ? "parallel" : "sequential") << '\n'; // ~100 ms: parallel
}
```
