## TOPIC: std::thread: Creation, Lifetime and Argument Passing

### INTERVIEW_QA: Interview Questions with Detailed Answers

#### Q1: When you construct a std::thread, when does the new thread actually start running your function?
**Difficulty:** #beginner
**Category:** #concurrency #threads
**Concepts:** #thread_creation #synchronizes_with #scheduling

**Answer:**
The constructor creates the OS thread and returns; the function runs whenever the scheduler gets to it, possibly before or after the constructor returns. The only guarantee is that everything before the constructor call is visible to the new thread.

**Explanation:**
- Standard wording: completion of the constructor **synchronizes-with** the beginning of the invocation of the callable in the new thread.
- So writes made by the creating thread before `std::thread t(f)` are visible inside `f`, with no extra locking.
- There is **no** guarantee about how far the new thread has got when the constructor returns. It may not have executed a single instruction, or it may have finished already.
- Copies of the callable and arguments are made **in the creating thread** before the constructor returns.
- If the OS cannot create the thread, the constructor throws `std::system_error` (e.g. `resource_unavailable_try_again`); no thread exists.
- ❌ Common wrong answer: "The thread starts when you call `join()`." `join()` only waits; the thread is already scheduled at construction.
- ✅ What a strong answer adds: the synchronizes-with edge at construction and at `join()` are the two free happens-before edges `std::thread` gives you; everything in between needs your own synchronization.

**Key takeaway:** Construction starts the thread and publishes prior writes to it, but promises nothing about when it runs.

---

#### Q2: What happens if a std::thread object is destroyed without calling join() or detach()?
**Difficulty:** #beginner
**Category:** #concurrency #threads
**Concepts:** #joinable #std_terminate #thread_lifetime

**Answer:**
If the object is still joinable when its destructor runs, the destructor calls std::terminate(). This happens even if the thread function has already finished, because finishing does not make the object non-joinable.

**Explanation:**
- `~thread()` checks `joinable()`, not "is the thread still running".
- `std::terminate()` is not an exception: there is nothing to catch. By default it calls `std::abort()`; libstdc++ prints `terminate called without an active exception`.
- Why the design: silently joining could hang a destructor forever; silently detaching could leave a thread using destroyed locals. C++ forces an explicit decision.
- ❌ Common wrong answer: "If main ends before the worker finishes it throws an error; if the worker finished first it is fine." Both cases terminate; and it is a terminate, not a throw.
- ✅ What a strong answer adds: same rule for move-assigning onto a joinable thread; `std::jthread` (C++20) joins in its destructor; `abort()` skips stdio flushing, so buffered output can be lost.
```cpp
#include <chrono>
#include <thread>

int main() {
    std::thread t([] { /* very quick */ });
    std::this_thread::sleep_for(std::chrono::milliseconds(100));
}   // terminate: t is still joinable
```

**Key takeaway:** Every successfully constructed `std::thread` needs a join or detach before its destructor, no matter whether the work is done.

---

#### Q3: What exactly does joinable() mean, and how does a thread object become non-joinable?
**Difficulty:** #beginner
**Category:** #concurrency #threads
**Concepts:** #joinable #move_semantics #thread_ownership

**Answer:**
joinable() is true when the std::thread object owns a thread of execution that has not been joined or detached. It becomes false after join(), after detach(), or when its thread is moved to another object; a default-constructed thread is never joinable.

**Explanation:**
- `joinable()` is an **ownership** query, not a liveness query.
- A finished-but-unjoined thread: `joinable() == true`.
- A detached thread that is still running: its former handle has `joinable() == false`.
- Moving: `std::thread t2 = std::move(t1);` leaves `t1` non-joinable and `t2` joinable.
- The thread function returning on its own never changes `joinable()`.
- ❌ Common wrong answer: "`join()` and `detach()` make it joinable." It is the opposite: both make it non-joinable.
- ❌ Common wrong answer: "`joinable()` tells you if the thread is running." There is no portable "is running" query on `std::thread`.
- ✅ What a strong answer adds: the idiom `if (t.joinable()) t.join();` in destructors and guards; calling `join()` on a non-joinable thread throws `std::system_error` with `invalid_argument`.

**Key takeaway:** joinable means "still owns an unreaped thread", not "still running".

---

#### Q4: What is the difference between join() and detach(), and what does join() guarantee beyond waiting?
**Difficulty:** #beginner
**Category:** #concurrency #threads
**Concepts:** #join #detach #happens_before

**Answer:**
join() blocks the calling thread until the owned thread finishes, and the thread's completion synchronizes-with join() returning, so all its writes are visible afterwards. detach() releases ownership and returns at once; the thread runs on unowned.

**Explanation:**
- `join()` blocks the **calling** thread (often `main`), not the worker.
- After `join()` returns, reading results the worker wrote to plain (non-atomic) variables is race-free.
- `detach()` is a lifetime contract: the detached thread must not touch anything that can be destroyed before it finishes, including locals of the creating function and static objects destroyed at exit.
- After either call, `joinable() == false`.
- ❌ Common wrong answer: "`detach()` makes the thread independent and safe." It removes the owner; all lifetime hazards remain.
- ❌ Common wrong answer: "`join()` is just scheduling." It is also a synchronization point in the memory model.
- ✅ What a strong answer adds: detached threads cannot be waited for, cannot report errors, and are killed abruptly at process exit with no unwinding. Prefer joined threads or `std::jthread` with explicit shutdown.

**Key takeaway:** join = wait + happens-before; detach = give up ownership and all ability to wait.

---

#### Q5: Why is std::thread movable but not copyable, and what happens if you move-assign into a thread that is still joinable?
**Difficulty:** #intermediate
**Category:** #concurrency #threads
**Concepts:** #move_semantics #unique_ownership #std_terminate

**Answer:**
A std::thread uniquely owns an OS thread, like unique_ptr owns memory; a copy would create two owners and no clear rule for who joins. Move transfers ownership. Move-assigning into a joinable thread calls std::terminate().

**Explanation:**
- Copy constructor and copy assignment are deleted.
- After `t2 = std::move(t1);`, `t1` is non-joinable, `t2` owns the thread.
- Move assignment requires the target to be non-joinable; otherwise its current thread would be silently dropped, so the library terminates.
- Threads can be stored in `std::vector<std::thread>` (moved in via `emplace_back`), returned from functions, and passed by value.
- ❌ Common wrong answer: "Move assignment joins the old thread first." That is `std::jthread`'s behaviour (it requests stop and joins). `std::thread` terminates.
- ✅ What a strong answer adds: contrast with `std::mutex`, which is neither copyable nor movable because other threads refer to its address while it is locked.
```cpp
std::thread t([] {});
t = std::thread([] {}); // std::terminate(): t was still joinable
```

**Key takeaway:** std::thread has unique-ownership semantics; never overwrite a joinable one.

---

#### Q6: How does std::thread pass arguments to the thread function, and what happens in this code?
**Difficulty:** #intermediate
**Category:** #concurrency #threads
**Concepts:** #decay_copy #argument_passing #rvalues

```cpp
void worker(int& x);

int value = 42;
std::thread t(worker, value);
```

**Answer:**
Each argument is decay-copied (or moved) into storage owned by the new thread, then passed to the callable as an rvalue. An rvalue cannot bind to int&, so std::thread t(worker, value) does not compile; use std::ref(value).

**Explanation:**
- Copies are made in the creating thread before the constructor returns, so the stored copy lives as long as the new thread needs it. Nothing dangles because of the copy.
- Stored arguments are passed as rvalues: parameters by value, `const T&`, and `T&&` work; non-const `T&` does not.
- libstdc++ error: `static assertion failed: std::thread arguments must be invocable after conversion to rvalues`.
- With `void worker(const int&)` it compiles, but the reference binds to the thread's private copy, not to `value`.
- ❌ Common wrong answer: "It creates a temporary copy that is destroyed after the statement, so the worker has a dangling reference." The copy is owned by the thread; and the code does not compile anyway.
- ❌ Common wrong answer: "It silently passes a reference to a hidden copy." No such conversion happens.
- ✅ What a strong answer adds: same rules apply to `std::jthread`, `std::async` and `std::bind`; the rvalue passing is what lets move-only arguments like `std::unique_ptr` work.

**Key takeaway:** std::thread copies by default and hands copies over as rvalues; reference parameters need std::ref.

---

#### Q7: When do you need std::ref with std::thread, and what new risk does it introduce?
**Difficulty:** #intermediate
**Category:** #concurrency #threads
**Concepts:** #std_ref #reference_wrapper #object_lifetime

**Answer:**
Use std::ref when the thread must operate on the caller's original object, for example a function taking T&. It stores a reference_wrapper, so the original object must outlive every use by the thread, and concurrent access needs synchronization.

**Explanation:**
- `std::ref(x)` produces `std::reference_wrapper<T>`, which is copied into thread storage (copying a wrapper copies the reference, not the object) and converts to `T&` at call time.
- Safe pattern: create thread with `std::ref(x)`, `join()` before `x` goes out of scope.
- Unsafe pattern: `std::ref(local)` plus `detach()`, then the function returns: dangling reference, undefined behaviour.
- Any concurrent read/write of `x` by the creating thread while the worker uses it is a data race unless synchronized.
- `std::cref` for read-only access to the original.
- ❌ Common wrong answer: "`std::ref` makes the access thread-safe." It only changes copy semantics into reference semantics.
- ✅ What a strong answer adds: lambda captures are the same decision in another syntax: `[x]` copies, `[&x]` refers. Prefer passing copies or `shared_ptr` ownership to detached or long-lived threads.

**Key takeaway:** std::ref opts out of the copy, and with it opts into lifetime and race responsibility.

---

#### Q8: What is wrong with passing a local char buffer to a thread whose function takes const std::string&?
**Difficulty:** #advanced
**Category:** #concurrency #threads
**Concepts:** #decay_copy #implicit_conversion #dangling_pointer

**Answer:**
The array decays to char* and only the pointer is copied into the thread. The std::string is constructed later, inside the new thread. If the creating function returns or reuses the buffer first, the conversion reads a dangling pointer: undefined behaviour.

**Explanation:**
- Decay-copy stores the argument's **decayed type** (`char*`), not the parameter type (`std::string`).
- The conversion `char*` to `std::string` happens when the new thread invokes the callable, at a time you do not control.
- Typical bug: `void f(int id) { char buf[64]; snprintf(buf, ...); std::thread(process, buf).detach(); }`.
- Fix: convert explicitly before constructing: `std::thread(process, std::string(buf))`.
- Same trap with any implicit conversion from a non-owning type: `std::string_view` parameter fed a temporary string, pointer to a struct converted to a value type, etc.
- ❌ Common wrong answer: "std::thread copies the argument, so it is always safe." It copies the pointer, not the characters.
- ✅ What a strong answer adds: this is the reason to make thread function parameters **owning** types and to pass already-converted owning values.

**Key takeaway:** std::thread copies what you pass, not what the function wants; convert to an owning type before handing it over.

---

#### Q9: How do you start a thread on a member function, and how do you pass a move-only object like std::unique_ptr?
**Difficulty:** #intermediate
**Category:** #concurrency #threads
**Concepts:** #member_function_pointer #move_only #std_invoke

**Answer:**
For a member function pass the member pointer, then an object pointer, then the arguments: std::thread t(&C::run, &obj, 42). For move-only arguments pass an rvalue: std::thread t(f, std::move(ptr)); it is moved into thread storage and then into the parameter.

**Explanation:**
- The thread uses `std::invoke`, so `(&C::run, &obj, args...)` calls `obj.run(args...)`. You can also pass `std::ref(obj)`, or `obj` itself (which copies the object into the thread).
- `&obj` stores a pointer: `obj` must outlive the thread's use.
- A lambda `[&obj] { obj.run(42); }` is equivalent and usually more readable.
- Move-only arguments work because stored arguments are passed as rvalues; parameter can be `std::unique_ptr<T>` or `std::unique_ptr<T>&&`.
- After `std::move(ptr)`, the caller's `ptr` is null.
- ❌ Common wrong answer: "`[this]` in a lambda copies the object." It copies the pointer; the object must stay alive until the thread stops.
- ✅ What a strong answer adds: a class that starts a thread on `this` in its constructor must stop and join it in its destructor **before** members are destroyed; declare the thread member last or join explicitly in the destructor body.

**Key takeaway:** std::thread uses std::invoke semantics; pointers to objects are non-owning, moved arguments are owned by the thread.

---

#### Q10: What happens if the thread function throws an exception, and how do you get errors back to the caller?
**Difficulty:** #intermediate
**Category:** #concurrency #threads
**Concepts:** #exception_ptr #std_terminate #error_propagation

**Answer:**
An exception that escapes the thread's top-level function calls std::terminate(); it is never rethrown in the joining thread. To propagate, catch inside the thread, store std::current_exception() in an exception_ptr, and rethrow after join(), or use std::promise/std::async.

**Explanation:**
- Each thread has its own call stack; there is no enclosing `try` in another thread.
- A `try` around `t.join()` in `main` does not catch the worker's exception.
- Pattern: worker writes `std::exception_ptr err` in a `catch (...)`; main calls `join()` then `if (err) std::rethrow_exception(err);`. `join()` makes the write visible.
- `std::async` and `std::packaged_task` do this automatically: `future.get()` rethrows.
- The thread function's return value is discarded, so the same channels are needed for results.
- ❌ Common wrong answer: "The exception propagates to whoever calls `join()`." Only futures do that.
- ✅ What a strong answer adds: mark thread entry points with a top-level `catch (...)` that logs and reports; an uncaught exception in any thread kills the whole process.

**Key takeaway:** Threads do not propagate exceptions; you transport them with exception_ptr or futures.

---

#### Q11: Your function creates a std::thread, does some work, then joins it. What happens if that work throws, and how do you fix it?
**Difficulty:** #intermediate
**Category:** #concurrency #threads
**Concepts:** #exception_safety #raii #jthread

**Answer:**
Stack unwinding destroys the still-joinable std::thread, so the program calls std::terminate() instead of propagating the exception. Fix it with RAII: a guard whose destructor joins, or std::jthread, which requests stop and joins in its destructor.

**Explanation:**
- Code shape: `std::thread t(work); do_other_stuff(); t.join();` If `do_other_stuff()` throws, `t.join()` is skipped.
- Joining a thread in a try/catch on every path is error-prone; RAII makes it automatic.
- Guard: holds `std::thread&` (or owns the thread), destructor does `if (t.joinable()) t.join();`.
- `std::jthread`: same, plus `request_stop()` first, so a cooperative worker can exit early instead of making the unwinding block for a long time.
- ❌ Common wrong answer: "The exception unwinds normally and the thread keeps running." Unwinding hits the joinable destructor, which terminates.
- ✅ What a strong answer adds: an RAII join can block unwinding indefinitely if the worker never finishes; pair it with a stop signal the worker actually checks.

**Key takeaway:** A plain std::thread is not exception-safe on its own; wrap it in RAII or use std::jthread.

---

#### Q12: Is this code safe?
**Difficulty:** #intermediate
**Category:** #concurrency #threads
**Concepts:** #detach #dangling_reference #undefined_behaviour

```cpp
void foo() {
    int value = 42;
    std::thread t([&] { std::cout << value; });
    t.detach();
}
```

**Answer:**
No. The lambda captures value by reference and the thread is detached, so foo() can return and destroy value before the thread reads it. Reading it then is a dangling reference access: undefined behaviour: depending on timing it may print 42, 0 or garbage.

**Explanation:**
- Two interleavings are possible: the worker reads first (appears to work) or `foo()` returns first (UB). In practice `foo()` often returns before the thread even starts, but timing varies, so a passing test proves nothing.
- Fixes: capture by value `[value]`, or `join()` before returning, or pass owning data (`std::make_shared`) to the detached thread.
- Capturing by value fixes this variable only; any pointer, reference or `this` captured is still a lifetime hazard.
- Also: `std::cout` used by a detached thread while `main` returns and static destruction runs is another hazard.
- ❌ Common wrong answer: "It is fine because the thread starts immediately." There is no such guarantee.
- ✅ What a strong answer adds: tools catch this: AddressSanitizer reports `stack-use-after-return` (with detection enabled), ThreadSanitizer may report races. Code review rule: `detach()` plus `[&]` is almost always a bug.

**Key takeaway:** detach plus reference capture of locals is a dangling reference waiting for the unlucky schedule.

---

#### Q13: A worker publishes a pointer to its local variable. Is it safe to dereference after join?
**Difficulty:** #intermediate
**Category:** #concurrency #threads
**Concepts:** #object_lifetime #join #dangling_pointer

- A worker stores the address of its local variable into a global pointer and returns.
- Main joins the thread and then dereferences the pointer.

**Answer:**
No. The local is destroyed when the worker function returns, which is before join() returns. join() makes the pointer value visible to main without a race, but it points to a dead object, so dereferencing it is undefined behaviour.

**Explanation:**
- Sequence: worker sets `ptr = &local`, returns (local destroyed, `ptr` dangling), thread ends, `join()` returns in main, main reads `*ptr`: UB.
- The write to `ptr` itself is not a data race: thread completion synchronizes-with `join()` returning.
- Thread lifetime and object lifetime are independent; `join()` waits, it does not preserve the stack.
- Fix: return results through an owning channel (write into an object owned by main, a `std::promise`, or a heap object with clear ownership).
- ❌ Common wrong answer: "The worker's locals are destroyed at `t.join()`." They are destroyed at the worker function's return.
- ✅ What a strong answer adds: separate "is the access synchronized?" (yes, via join) from "is the object alive?" (no). Both must hold.

**Key takeaway:** join() synchronizes, it does not extend lifetimes.

---

#### Q14: What does std::jthread add over std::thread, and does request_stop() stop the thread?
**Difficulty:** #intermediate
**Category:** #concurrency #threads
**Concepts:** #jthread #stop_token #cooperative_cancellation

**Answer:**
jthread's destructor calls request_stop() and then join() instead of terminating, and it can pass a std::stop_token to the callable. request_stop() only signals the shared stop state and runs registered stop_callbacks; the worker must check the token and return.

**Explanation:**
- If the callable's first parameter is `std::stop_token`, `jthread` passes `get_stop_token()` automatically.
- Worker loop: `while (!st.stop_requested()) { ... }` then cleanup.
- `std::stop_callback` registers a function run when stop is requested (in the requesting thread, or immediately on registration if stop was already requested). Useful to wake a blocking wait. It does not end the worker.
- If the worker is blocked in a call that ignores the token, `~jthread` blocks in `join()` until that call returns.
- ❌ Common wrong answer: "`jthread` just auto-joins." It requests stop first.
- ❌ Common wrong answer: "`request_stop()` kills the thread." C++ has no safe way to kill a thread; cancellation is cooperative.
- ✅ What a strong answer adds: do not describe the stop state as "an atomic bool"; that is an implementation detail. `std::condition_variable_any::wait(lock, token, pred)` integrates stop tokens into blocking waits.

**Key takeaway:** jthread = RAII join + cooperative stop request; nothing is forcibly terminated.

---

#### Q15: What is std::thread::id, and how is it different from the OS thread id?
**Difficulty:** #beginner
**Category:** #concurrency #threads
**Concepts:** #thread_id #native_handle #this_thread

**Answer:**
std::thread::id is an opaque, comparable, hashable identifier from t.get_id() or std::this_thread::get_id(). A non-joinable thread returns a default id meaning no thread. It is not the OS id; use native_handle() for OS-level calls.

**Explanation:**
- Supports `==`, ordering, `std::hash`, and `operator<<`. Usable as a map key (e.g. per-thread stats).
- `t.get_id()` after `join()`, `detach()` or move returns `std::thread::id{}`. libstdc++ prints it as `thread::id of a non-executing thread`.
- Ids can be reused after a thread ends.
- On Linux, `native_handle()` returns `pthread_t` (for `pthread_setaffinity_np`, `pthread_setname_np`, scheduling policy). The kernel TID (`gettid()`, shown by `top -H`) is a third, different number.
- ❌ Common wrong answer: "`get_id()` returns the Linux TID / is unique forever." Neither is guaranteed.
- ✅ What a strong answer adds: low-latency systems pin threads to cores via the native handle; `std::thread` itself has no affinity or priority API.

**Key takeaway:** Use thread::id for identity inside C++, native_handle() for anything the OS must see.

---

#### Q16: How many threads would you create for purely CPU-bound tasks on 8 cores, and what does hardware_concurrency() tell you?
**Difficulty:** #intermediate
**Category:** #concurrency #threads
**Concepts:** #hardware_concurrency #oversubscription #thread_pool_sizing

**Answer:**
Start with about one worker per logical CPU available to the process, then benchmark. hardware_concurrency() is only a hint, usually the online logical CPU count, and may be 0. More threads than CPUs adds context switches and cache pressure, not throughput.

**Explanation:**
- At most N threads can execute simultaneously on N **logical** CPUs. With SMT, 8 logical CPUs may be only 4 physical cores sharing execution units.
- 100 workers on 8 CPUs: the OS time-slices them. Costs: context switches, scheduler overhead, cache and TLB pollution, lock holders preempted, worse tail latency.
- `hardware_concurrency()` on Linux does not account for affinity masks or container CPU quotas. Guard against `0`.
- Leave headroom for other threads (I/O, logging, the OS) if latency matters.
- I/O-bound work: more threads than CPUs can help, since they block.
- ❌ Common wrong answer: "100 threads gives more parallelism than 8." Not for CPU-bound work.
- ❌ Common wrong answer: "8 threads is always optimal." Memory bandwidth, SMT, contention and other load change the optimum; measure.
- ❌ Imprecise answer: "Context switches cause virtual-to-physical detection." Say: more threads increase cache and TLB pressure and scheduling overhead.
- ✅ What a strong answer adds: for latency-critical work, pin a small number of threads to isolated cores and avoid oversubscription entirely.

**Key takeaway:** CPU-bound: about one thread per available logical CPU, verified by measurement.

---

#### Q17: Why not create a new std::thread for each of 10,000 incoming tasks per second?
**Difficulty:** #advanced
**Category:** #concurrency #threads
**Concepts:** #thread_creation_cost #thread_pool #oversubscription

**Answer:**
Thread creation costs a syscall, a stack mapping, TLS setup and scheduler work, typically tens of microseconds on Linux, plus unpredictable latency. Thousands of short-lived threads also oversubscribe the CPUs. A fixed pool of long-lived workers pulling from a queue amortizes the cost.

**Explanation:**
- Linux/glibc (typical): `clone()`, `mmap` of the stack (default from `RLIMIT_STACK`, often 8 MB virtual, committed lazily), guard page, TLS block initialization, then a context switch to schedule it.
- Measured create+join on a modern x86-64 Linux box: roughly 20 to 30 microseconds, with outliers. Pushing to an uncontended queue: nanoseconds.
- Under burst load, unbounded thread creation can hit `RLIMIT_NPROC` / memory limits, making the constructor throw `std::system_error`.
- Pool design questions: worker count (Q16), queue bound and backpressure policy, shutdown, exception handling per task.
- ❌ Common wrong answer: "Threads are lightweight, so one per task is fine." Lighter than processes, but far heavier than a function call.
- ✅ What a strong answer adds: in low-latency systems all threads are created at startup, pinned, and never created on the hot path.

**Key takeaway:** Create threads once, reuse them; never on the hot path.

---

#### Q18: Review this worker class. What is wrong with its shutdown?
**Difficulty:** #advanced
**Category:** #concurrency #threads
**Concepts:** #data_race #shutdown #member_thread

```cpp
class Worker {
public:
    Worker() : worker_([this] {
        while (running_) process();
    }) {}

    ~Worker() {
        running_ = false;   // no join
    }

private:
    void process();

    bool running_ = true;   // plain bool
    std::thread worker_;
};
```

**Answer:**
Two bugs. The destructor never joins, so the joinable thread member is destroyed and std::terminate() is called. And running_ is a plain bool written by one thread while another reads it: a data race, undefined behaviour. Use std::atomic<bool> and join in the destructor.

**Explanation:**
- Members are destroyed after the destructor body; `worker_.~thread()` sees a joinable thread: terminate.
- Plain `bool` read in a loop and written by another thread without synchronization is a data race. The compiler may also hoist the load out of the loop, making it spin forever.
- "A bool store is atomic on x86" is irrelevant: the C++ memory model defines the race as UB, and the optimizer relies on that.
- `[this]` capture stores a pointer, not a copy: the worker uses the live object, so it must stop before any member it touches is destroyed.
- `memory_order_relaxed` is enough for a pure "please stop" flag that does not publish other data.
```cpp
class Service {
public:
    void start() {
        worker_ = std::thread([this] {
            while (running_.load(std::memory_order_relaxed)) process();
        });
    }
    ~Service() {
        running_.store(false, std::memory_order_relaxed);
        if (worker_.joinable()) worker_.join();
    }
private:
    void process() {}
    std::atomic<bool> running_{true};
    std::thread worker_;
};
```
- ❌ Common wrong answer: "The only problem is terminate." The data race is the subtler, equally fatal bug.
- ✅ What a strong answer adds: further production issues: `start()` called twice (move-assign onto joinable terminates), `process()` blocking forever so join hangs (needs a wakeable wait, e.g. condition variable or `std::jthread` + `stop_token`), exceptions escaping `process()`.

**Key takeaway:** A thread-owning class must signal stop through a synchronized flag and join before its members die.
