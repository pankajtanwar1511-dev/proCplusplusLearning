## TOPIC: std::thread: Creation, Lifetime and Argument Passing

### THEORY_SECTION: Core Concepts

#### 1. Mental model
- A `std::thread` object is an **owning handle** to a thread of execution, much like `std::unique_ptr` is an owning handle to a heap object.
- Two separate things with two separate lifetimes:
  - the **thread of execution** (OS thread running your callable)
  - the **`std::thread` object** (a C++ object on your stack or in a member)
- The handle must be told what to do with the thread before the handle dies: `join()` (wait for it) or `detach()` (give up ownership).
- If you forget, the destructor calls `std::terminate()`. This is deliberate: C++ refuses to guess between "silently wait" and "silently abandon".
- Arguments are **copied into the new thread's own storage** by default. Reference semantics must be requested explicitly with `std::ref`.
- `std::jthread` (C++20) is the RAII version: its destructor requests stop and joins.

#### 2. Creating a thread and when it starts running
- `std::thread t(f, args...);` creates a new thread of execution that calls `std::invoke(copy_of_f, copies_of_args...)`.
- The copies of `f` and `args` are made **in the constructing thread**, before the constructor returns.
- The standard guarantees: completion of the constructor **synchronizes-with** the start of the callable in the new thread.
  - Everything the creating thread wrote before constructing `t` is visible to the new thread. No extra synchronization needed for that.
- The standard does **not** guarantee that the new thread has executed any instruction by the time the constructor returns. Scheduling is up to the OS.
- If the OS cannot create the thread, the constructor throws `std::system_error` (typically `resource_unavailable_try_again`). Then there is no thread to join.
- A default-constructed `std::thread` has no thread: `joinable() == false`.
- Most vexing parse trap: `std::thread t(Task());` declares a **function** named `t`. Use `std::thread t{Task{}};` or `std::thread t((Task()));`.

#### 3. Lifetime: joinable, join, detach, destructor
- `joinable()` is true when the object **owns a thread that has not been joined or detached**. It says nothing about whether the thread is still running.

| Operation | Effect on calling thread | `joinable()` after | Thread of execution |
|---|---|---|---|
| construct with callable | returns immediately | `true` | starts (eventually) |
| `join()` | blocks until the thread finishes | `false` | finished and reaped |
| `detach()` | returns immediately | `false` | keeps running, unowned |
| move from `t1` into `t2` | none | `t1` false, `t2` true | unchanged |
| thread function returns | none | **still `true`** | finished, not reaped |
| destructor while joinable | `std::terminate()` | n/a | n/a |
| move-assign onto a joinable thread | `std::terminate()` | n/a | n/a |

- `join()` also gives a **happens-before** edge: completion of the thread synchronizes-with the return of `join()`. Everything the worker wrote is visible after `join()`.
- `join()` on a non-joinable thread throws `std::system_error` (`invalid_argument`). A thread joining itself throws `resource_deadlock_would_occur`.
- `detach()` is a lifetime contract: you promise that everything the detached thread touches outlives it. Use it rarely and deliberately.
- `std::thread` is **move-only**: copying would mean two owners of one OS thread (who joins?).

#### 4. Argument passing
- Rule: each argument is **decay-copied** (or moved, for rvalues) into storage owned by the new thread. The callable then receives those stored objects **as rvalues**.
- Consequences:

| Callable parameter | Argument passed | Result |
|---|---|---|
| `int x` | `value` | ✅ copy, original untouched |
| `int& x` | `value` | ❌ compile error (rvalue cannot bind to non-const lvalue reference) |
| `const int& x` | `value` | ✅ compiles, but binds to the thread's **internal copy**, not to `value` |
| `int& x` | `std::ref(value)` | ✅ refers to the original; original must outlive the use |
| `int x` | `std::ref(value)` | ✅ `reference_wrapper` converts, `x` is a copy of the value at call time |
| `std::unique_ptr<T> p` | `std::move(ptr)` | ✅ moved into thread storage, then into the parameter |
| `std::string s` | `char buf[]` | ⚠️ only the **pointer** is copied; the `std::string` is built later in the new thread (dangling risk) |

- Arrays and functions decay: `char buf[64]` is stored as `char*`. Conversions to the parameter type happen **in the new thread**, possibly after the buffer is gone.
- Fix for conversions: convert before construction, e.g. `std::thread t(f, std::string(buf));`.
- Member functions: `std::thread t(&Widget::run, &w, 42);` (pointer or `std::ref` to the object, which must outlive the thread). A lambda `[&w]{ w.run(42); }` is usually clearer.
- Lambda captures follow the same idea: `[value]` copies, `[&value]` and `[this]` store references/pointers. `[this]` does **not** copy the object.

#### 5. Exceptions and threads
- An exception that escapes the thread's callable calls `std::terminate()`. It is **not** delivered to the thread that created or joins it.
- To propagate: catch in the worker, store `std::current_exception()` into a `std::exception_ptr`, rethrow after `join()` with `std::rethrow_exception`. Or use `std::promise` / `std::packaged_task` / `std::async`, which do this for you.
- Exception safety of the **creating** thread: if code between creating `t` and `t.join()` throws, stack unwinding destroys a joinable `t` and the program terminates. Use a RAII guard or `std::jthread`.
- The return value of the thread function is discarded. Use a future, a reference/pointer output parameter, or shared state to return results.

#### 6. Thread identity
- `t.get_id()` returns a `std::thread::id`. For a non-joinable `t` it returns a default-constructed id meaning "not any thread".
- `std::this_thread::get_id()` returns the calling thread's id.
- `std::thread::id` is totally ordered and hashable: valid as a key in `std::map` / `std::unordered_map`.
- It is **not** the OS thread id (Linux TID from `gettid()`). For OS-level work (affinity, priority, naming) use `native_handle()` (a `pthread_t` on Linux).
- Ids can be **reused** after a thread is joined; do not treat them as unique forever.

#### 7. std::jthread (C++20)
- Same as `std::thread` plus two things:
  - destructor: if joinable, calls `request_stop()` then `join()` (RAII, no terminate)
  - built-in cooperative cancellation: if the callable's first parameter is `std::stop_token`, `jthread` passes one automatically
- `request_stop()` only **requests**: it sets the shared stop state and runs registered `std::stop_callback`s. It never kills the thread.
- The worker must poll `stop_requested()` (or use a `std::condition_variable_any` wait that takes the token) and return voluntarily.
- If the worker is stuck in a long blocking call that does not observe the token, the `jthread` destructor still blocks in `join()`.

#### 8. How many threads: hardware_concurrency, cost, oversubscription
- `std::thread::hardware_concurrency()` returns a **hint**: typically the number of online logical CPUs (hardware threads, including SMT/Hyper-Threading). It may return `0` if unknown.
- On Linux it does not reflect CPU affinity masks or container CPU quotas, so in containers it can overstate available CPUs.
- CPU-bound work: start near the number of logical CPUs available to the process, then **benchmark**. SMT siblings share execution units and caches, so 2 logical CPUs are not 2 full cores.
- I/O-bound work: more threads than CPUs can help because threads spend time blocked.
- **Oversubscription**: more runnable threads than CPUs. Costs: context switches, scheduler overhead, cache and TLB pollution, lock holders getting preempted (lock convoys), unpredictable tail latency. More threads never add CPU capacity.
- Creating a thread is not free (Linux/glibc, typical): `clone()` syscall, stack mapping (default size from `RLIMIT_STACK`, often 8 MB of virtual memory, committed lazily), guard page, TLS setup, scheduler work. Roughly **tens of microseconds** per create+join on a modern x86 Linux box. Measure on your system.
- Therefore: for many short tasks use a **fixed pool of long-lived worker threads** fed by a queue, not one thread per task.

#### 9. Misconceptions to unlearn
- ❌ "If the worker already finished, destroying the `std::thread` is fine." ✅ The destructor checks `joinable()`, not "still running". A finished but unjoined thread is still joinable, so terminate.
- ❌ "Forgetting join throws an exception." ✅ It calls `std::terminate()`; there is nothing to catch.
- ❌ "`join()`/`detach()` make the thread joinable." ✅ They make it **non-joinable**.
- ❌ "`joinable()` means the thread is running." ✅ It means the handle still owns an unjoined, undetached thread.
- ❌ "Passing `value` to a thread taking `int&` creates a temporary that dangles." ✅ It does not compile.
- ❌ "A `const T&` parameter sees the caller's variable." ✅ It sees the thread's private copy unless you pass `std::ref`.
- ❌ "`detach()` makes the thread safe and independent." ✅ It only removes the owner; all lifetime problems remain yours.
- ❌ "`join()` keeps the worker's locals alive until the join." ✅ Worker locals die when the worker function returns; `join()` only waits.
- ❌ "Reading/writing a `bool` stop flag is atomic on x86, so it is fine." ✅ An unsynchronized read and write from two threads is a data race: undefined behaviour in C++, regardless of hardware.
- ❌ "`request_stop()` stops the thread." ✅ It requests; the worker must cooperate.
- ❌ "8 cores means 8 threads is always optimal." ✅ It is a starting point for CPU-bound work; measure.

### EDGE_CASES: Traps and Misconceptions

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

#### Edge Case 2: Non-const reference parameter with a plain argument
- Assumption: "the thread copies `value` and the reference binds to that copy" or "the copy dangles after the statement".
- Reality: the stored copy is passed as an rvalue, which cannot bind to `int&`. libstdc++ fails with `static assertion failed: std::thread arguments must be invocable after conversion to rvalues`.
- Why it is designed this way: silently binding to a hidden copy would make `++x` modify an invisible object, a guaranteed logic bug.
```cpp
void worker(int& x) { ++x; }
int value = 42;
// std::thread t(worker, value);          // ❌ compile error
// std::thread t(worker, std::ref(value)); // ✅ modifies value
```

#### Edge Case 3: const reference parameter binds to the internal copy
- `void show(const int& x)` with `std::thread t(show, value);` compiles.
- `x` refers to the thread's stored copy. Later writes to `value` in the creating thread are invisible to the worker (and are not a data race on `value`).
- Interviewers use this to check whether you know a copy is made even when the parameter "looks like" a reference.

#### Edge Case 4: Decayed pointer converted in the new thread
- `char buf[32]` is decayed to `char*` and the **pointer** is copied.
- If the callable takes `const std::string&`, the `std::string` is constructed **in the new thread** from that pointer.
- If the creating function returns (or overwrites `buf`) before the worker runs the conversion: dangling pointer, undefined behaviour.
- Fix: `std::thread t(f, std::string(buf));` so the conversion happens before the constructor returns.

#### Edge Case 5: join does not extend the worker's locals
- A worker stores `&local` into a global pointer, then returns. `local` is destroyed when the **worker function returns**, not at `join()`.
- After `join()` the pointer write itself is safely visible (join synchronizes), but it points to a dead object: dereferencing is undefined behaviour.
- Rule: thread lifetime and object lifetime are independent.

#### Edge Case 6: Move-assigning onto a joinable thread terminates
- `t = std::thread(g);` while `t` still owns a thread calls `std::terminate()`, exactly like destroying it.
- Join or detach the old thread first. Same rule for `std::swap`-free reassignments inside containers of threads.
- `std::jthread` move assignment instead requests stop and joins the old thread.

#### Edge Case 7: Detached threads at process exit
- When `main` returns, `std::exit` runs: static objects are destroyed while detached threads may still be running and using them (undefined behaviour), then the process ends and all remaining threads vanish mid-instruction.
- Detached threads get no stack unwinding at process exit: their RAII destructors (flush files, release locks) do not run.
- Practical rule: detach only threads that touch nothing but their own copies and are allowed to die abruptly. Prefer a joined or `jthread`-owned design with an explicit shutdown.

#### Edge Case 8: hardware_concurrency is only a hint
- May return `0` (not computable). Always guard: `unsigned n = std::max(1u, std::thread::hardware_concurrency());`.
- Counts logical CPUs (SMT included), not physical cores.
- On Linux it ignores `taskset`/affinity masks and cgroup CPU quotas: a container limited to 2 CPUs on a 64-CPU host may still report 64. Production code reads the affinity mask (`sched_getaffinity`) or config.

### CODE_EXAMPLES: Practical Demonstrations

#### Example 1: Lifecycle states of a std::thread
- Shows `joinable()` before and after join, after move, and the id of a non-joinable thread.
```cpp
#include <iostream>
#include <thread>

int main() {
    std::cout << std::boolalpha;

    std::thread empty;
    std::cout << "default joinable: " << empty.joinable() << '\n';

    std::thread t1([] { /* finishes immediately */ });
    std::cout << "t1 joinable: " << t1.joinable() << '\n';

    std::thread t2 = std::move(t1); // ownership transfer
    std::cout << "after move, t1: " << t1.joinable()
              << ", t2: " << t2.joinable() << '\n';

    t2.join();
    std::cout << "after join, t2: " << t2.joinable() << '\n';
    std::cout << "id of t2 now: " << t2.get_id() << '\n';
}
```
- Output (libstdc++):
  - `default joinable: false`
  - `t1 joinable: true`
  - `after move, t1: false, t2: true`
  - `after join, t2: false`
  - `id of t2 now: thread::id of a non-executing thread`

#### Example 2: The argument passing rules in one program
- Copy, `std::ref`, `const&` binding to the internal copy, move-only argument, member function.
```cpp
#include <iostream>
#include <memory>
#include <thread>

struct Counter {
    int hits = 0;
    void add(int n) { hits += n; }
};

int main() {
    int value = 42;

    std::thread a([](int x) { ++x; }, value);              // copy
    a.join();

    std::thread b([](int& x) { ++x; }, std::ref(value));   // original
    b.join();

    int seen = 0;
    std::thread c([&seen](const int& x) { seen = x; }, value); // binds to c's copy
    value = 1000;                                          // not visible to c
    c.join();

    auto up = std::make_unique<int>(7);
    int moved_val = 0;
    std::thread d([&moved_val](std::unique_ptr<int> p) { moved_val = *p; },
                  std::move(up));                          // move-only argument
    d.join();

    Counter counter;
    std::thread e(&Counter::add, &counter, 5);             // member function
    e.join();

    std::cout << "value=" << value << " seen=" << seen
              << " moved=" << moved_val << " up_is_null=" << (up == nullptr)
              << " hits=" << counter.hits << '\n';
}
```
- Output: `value=1000 seen=43 moved=7 up_is_null=1 hits=5`
- `seen` is 43: `b` incremented `value` to 43, `c` copied 43 at construction; the later `value = 1000` does not reach `c`.

#### Example 3: Propagating an exception out of a thread
- An escaping exception would call `std::terminate()`. Catch in the worker, transport with `std::exception_ptr`, rethrow after `join()`.
```cpp
#include <exception>
#include <iostream>
#include <stdexcept>
#include <thread>

int main() {
    std::exception_ptr error;

    std::thread t([&error] {
        try {
            throw std::runtime_error("disk full");
        } catch (...) {
            error = std::current_exception(); // safe: read only after join()
        }
    });
    t.join(); // join() synchronizes-with thread completion

    try {
        if (error) std::rethrow_exception(error);
    } catch (const std::exception& e) {
        std::cout << "caught in main: " << e.what() << '\n';
    }
}
```
- Output: `caught in main: disk full`
- Writing `error` in the worker and reading it after `join()` is not a data race because `join()` establishes happens-before.

#### Example 4: Exception-safe ownership with a guard and with std::jthread
- If `may_throw()` throws between creation and join, a plain `std::thread` would terminate the program.
```cpp
#include <iostream>
#include <stdexcept>
#include <thread>

class JoinGuard {
public:
    explicit JoinGuard(std::thread& t) : t_(t) {}
    ~JoinGuard() { if (t_.joinable()) t_.join(); }
    JoinGuard(const JoinGuard&) = delete;
    JoinGuard& operator=(const JoinGuard&) = delete;
private:
    std::thread& t_;
};

void may_throw() { throw std::runtime_error("validation failed"); }

int main() {
    try {
        std::thread t([] { std::cout << "worker A ran\n"; });
        JoinGuard guard(t);
        may_throw();             // unwinding joins t instead of terminating
    } catch (const std::exception& e) {
        std::cout << "handled: " << e.what() << '\n';
    }

    try {
        std::jthread jt([] { std::cout << "worker B ran\n"; }); // C++20: joins itself
        may_throw();
    } catch (const std::exception& e) {
        std::cout << "handled: " << e.what() << '\n';
    }
}
```
- Output: `worker A ran`, `handled: validation failed`, `worker B ran`, `handled: validation failed` (each worker line always precedes its `handled` line because the join happens during unwinding, before the catch block runs).

#### Example 5: jthread cooperative cancellation
- The worker polls its `stop_token`; the destructor requests stop and joins.
```cpp
#include <atomic>
#include <chrono>
#include <iostream>
#include <thread>

int main() {
    std::atomic<int> iterations{0};
    {
        std::jthread worker([&iterations](std::stop_token st) {
            std::stop_callback cb(st, [] { std::cout << "stop requested\n"; });
            while (!st.stop_requested()) {
                iterations.fetch_add(1, std::memory_order_relaxed);
                std::this_thread::sleep_for(std::chrono::milliseconds(1));
            }
            std::cout << "worker exiting cleanly\n";
        });
        std::this_thread::sleep_for(std::chrono::milliseconds(20));
    }   // ~jthread: request_stop() (runs callback), then join()
    std::cout << "did some iterations: " << std::boolalpha
              << (iterations.load() > 0) << '\n';
}
```
- Typical output: `stop requested`, `worker exiting cleanly`, `did some iterations: true`.
- The first two lines can swap: `request_stop()` sets the stop state **before** invoking callbacks, so the worker may observe it and print first. The last line always comes last (after the join).
- The callback runs inside `request_stop()` on the requesting thread (here the destructor's thread). It does not stop the worker by itself.

#### Example 6: Splitting CPU-bound work by hardware_concurrency
- Guards against `0`, partitions the range, each worker writes only its own slot (no sharing), results read after `join()`.
```cpp
#include <algorithm>
#include <cstdint>
#include <iostream>
#include <numeric>
#include <thread>
#include <vector>

int main() {
    std::vector<std::uint64_t> data(10'000'000);
    std::iota(data.begin(), data.end(), 1);

    const unsigned n = std::max(1u, std::thread::hardware_concurrency());
    std::vector<std::uint64_t> partial(n, 0);
    std::vector<std::thread> workers;
    workers.reserve(n);

    const std::size_t chunk = data.size() / n;
    for (unsigned i = 0; i < n; ++i) {
        auto first = data.begin() + i * chunk;
        auto last = (i + 1 == n) ? data.end() : first + chunk;
        workers.emplace_back([first, last, &partial, i] {
            partial[i] = std::accumulate(first, last, std::uint64_t{0});
        });
    }
    for (auto& w : workers) w.join();

    std::cout << std::accumulate(partial.begin(), partial.end(), std::uint64_t{0}) << '\n';
}
```
- Output: `50000005000000`
- `partial[i]` slots sit on the same cache lines (false sharing), harmless here because each worker writes once. A loop that updates its slot repeatedly should accumulate in a local variable first.

#### Example 7: Measuring thread creation cost
- Shows why "one thread per task" does not scale for small tasks.
```cpp
#include <chrono>
#include <iostream>
#include <thread>

int main() {
    using clock = std::chrono::steady_clock;
    constexpr int N = 2000;

    auto start = clock::now();
    for (int i = 0; i < N; ++i) {
        std::thread t([] {});
        t.join();
    }
    auto elapsed = std::chrono::duration<double, std::micro>(clock::now() - start);
    std::cout << "create+join: " << elapsed.count() / N << " us per thread\n";
}
```
- Output is machine dependent. On a typical x86-64 Linux desktop: around 20 to 30 microseconds per create+join, with large outliers.
- Compare with a few nanoseconds to push a task onto an uncontended queue for an existing worker.

### QUICK_REFERENCE: Cheat Sheet

#### std::thread operations
| Call | Precondition | Result | Failure mode |
|---|---|---|---|
| `std::thread t(f, args...)` | none | new thread, `joinable()` true | `std::system_error` if OS refuses |
| `t.join()` | joinable, not self | blocks, then non-joinable | `system_error` (`invalid_argument` / `resource_deadlock_would_occur`) |
| `t.detach()` | joinable | non-joinable, thread runs on | `system_error` if not joinable |
| `~thread()` | must be non-joinable | nothing | `std::terminate()` if joinable |
| `t = std::move(u)` | `t` non-joinable | `t` owns `u`'s thread | `std::terminate()` if `t` joinable |
| `t.get_id()` | none | id, or "no thread" id | none |
| `hardware_concurrency()` | none | hint, may be 0 | none |

#### Argument passing summary
| You want | Write |
|---|---|
| Worker gets its own copy | `std::thread t(f, x)` or `[x]{...}` |
| Worker modifies caller's object | `std::thread t(f, std::ref(x))` + ensure `x` outlives use |
| Transfer ownership | `std::thread t(f, std::move(ptr))` |
| Call a member function | `std::thread t(&C::m, &obj, args)` or `[&obj]{ obj.m(args); }` |
| Pass a C string safely | `std::thread t(f, std::string(buf))` |

#### Interview one-liners
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
