## TOPIC: RAII and Exception Safety

### INTERVIEW_QA: Interview Questions with Detailed Answers

#### Q1: What is RAII, and is it only about heap memory?
**Difficulty:** #beginner
**Category:** #raii #resource_management
**Concepts:** #raii #ownership #deterministic_destruction

**Answer:**
RAII (Resource Acquisition Is Initialization) ties a resource to an object's lifetime: the constructor acquires it, the destructor releases it, so release happens automatically on every exit path. It applies to any resource with an acquire/release pair: memory, mutex ownership, files, sockets, threads, OS handles.

**Explanation:**
- Standard examples: `std::unique_ptr`/`std::vector` (memory), `std::lock_guard` (mutex ownership, no heap at all), `std::fstream` (file), `std::jthread` (joins on destruction).
- The owner object is usually automatic (on the stack), but it can be a member or a container element; then its owner decides when it releases.
- RAII does not avoid the heap: `auto p = std::make_unique<R>();` still allocates; RAII makes the **release** automatic.
- Release is **deterministic**: at a known point (end of scope), not "sometime later" like a garbage collector.
- ❌ Common wrong answer: "RAII means we work on the stack instead of the heap." The owner is on the stack; the resource is often still on the heap.
- ✅ What a strong answer adds: "RAII gives deterministic cleanup on normal scope exit, early return and exception-driven unwinding," plus the caveat that unwinding is only guaranteed for caught exceptions.

**Key takeaway:** RAII = lifetime is ownership, for any resource, not just memory.

---

#### Q2: Why does this function leak, and how does RAII fix it?
**Difficulty:** #beginner
**Category:** #raii #exception_safety
**Concepts:** #memory_leak #stack_unwinding #unique_ptr

```cpp
void process() {
    int* data = new int[100];
    if (bad_input()) return;
    doSomething();        // may throw
    delete[] data;
}
```

**Answer:**
On the early `return` or when `doSomething()` throws, `delete[] data` is never reached. The pointer variable `data` is destroyed, but the array it points to has no owner any more and leaks. With `std::vector<int> data(100);` (or `std::unique_ptr<int[]>`), the owner's destructor runs on every exit path and frees the array.

**Explanation:**
- Stack unwinding destroys **automatic objects**; it does not execute arbitrary statements like `delete[]`.
- A raw pointer has a trivial destructor: destroying it releases nothing.
- Choice of owner:
  - collection of ints: `std::vector<int>` (size known at run time) or `std::array<int, 100>` (fixed size)
  - a single dynamic object: `std::make_unique<T>()`
  - `std::unique_ptr<int[]>` only when you need exactly "owned array, no size, no growth"
- Why not `shared_ptr`: there is one owner; shared ownership adds a control block and atomic counts for no benefit.
- ❌ Common wrong answer: "Wrap the body in try/catch and delete in the catch." It handles exceptions but not the early return, and every future exit path needs the same fix.
- ✅ What a strong answer adds: the RAII version also documents ownership in the type, so a reader sees who frees the memory without reading every path.

**Key takeaway:** If a resource is not owned by an object, every exit path is a potential leak.

---

#### Q3: What is wrong with this locking code, and when exactly is the mutex unlocked in the fixed version?
**Difficulty:** #beginner
**Category:** #raii #concurrency
**Concepts:** #lock_guard #stack_unwinding #mutex

```cpp
std::mutex m;
void process() {
    m.lock();
    doSomething();   // may throw
    m.unlock();
}
```

**Answer:**
If `doSomething()` throws, `unlock()` is skipped and `m` stays locked forever; every other thread that needs it blocks indefinitely. With `std::lock_guard<std::mutex> lock(m);` the guard's destructor runs during stack unwinding, unlocks `m`, and the exception continues propagating.

**Explanation:**
- Sequence in the fixed version: exception thrown → unwinding leaves `process()` → `~lock_guard()` → `m.unlock()` → exception propagates to the caller's handler.
- `lock_guard` **unlocks** the mutex; it does not destroy it. The mutex object lives on.
- `std::unique_lock` also works but adds features not needed here (defer, manual unlock/relock, move, condition variables); `lock_guard` or `std::scoped_lock` is the simplest correct choice.
- "Deadlock" is loose wording: strictly, the other threads block indefinitely on a lock that nobody will ever release; there is no cycle.
- ❌ Common wrong answer: "`lock_guard` guarantees the mutex is destroyed on exceptions."
- ✅ What a strong answer adds: if nothing catches the exception, `std::terminate` ends the program and unwinding is not guaranteed (so the unlock may not run either, but then the process is gone). Lock types in depth: Chapter 4, mutexes topic.

**Key takeaway:** Lock ownership must be an object's lifetime, not a pair of calls.

---

#### Q4: During stack unwinding, what exactly is destroyed, and what is not?
**Difficulty:** #intermediate
**Category:** #exceptions #object_lifetime
**Concepts:** #stack_unwinding #automatic_storage #partially_constructed

**Answer:**
Every fully constructed automatic object (locals, temporaries, already-built elements and members) between the throw point and the handler is destroyed, in reverse order of construction. Heap objects reached only through raw pointers, and objects whose constructor did not complete, are not destroyed.

**Explanation:**
- Locals of every function being exited, innermost function first.
- Temporaries of the full-expression that threw.
- For an object under construction: its finished bases and members (but not the object's own destructor).
- For an array or aggregate under construction: the elements already constructed.
- Not destroyed: what raw pointers point to, objects with static storage (they die at program exit), objects owned by other threads.
- ❌ Common wrong answer: "The stack goes out of memory and everything is freed." Unwinding is a precise sequence of destructor calls, not a bulk release.
- ✅ What a strong answer adds: unwinding happens only when a handler is found. Without one, `std::terminate` is called and unwinding is implementation-defined.

**Key takeaway:** Unwinding runs destructors of finished automatic objects; anything not owned by such an object is on its own.

---

#### Q5: Is a local object's destructor guaranteed to run if an exception is thrown and never caught?
**Difficulty:** #intermediate
**Category:** #exceptions #raii
**Concepts:** #std_terminate #stack_unwinding #implementation_defined

**Answer:**
No. If no matching handler exists, `std::terminate` is called, and whether the stack is unwound before that is implementation-defined. With GCC/libstdc++ the stack is not unwound, so the destructor never runs.

**Explanation:**
```cpp
#include <iostream>
#include <stdexcept>

struct Guard { ~Guard() { std::cout << "~Guard ran" << std::endl; } };

void work() { Guard g; throw std::runtime_error("boom"); }

int main() {
    try { work(); } catch (const std::exception& e) {
        std::cout << "caught " << e.what() << std::endl;   // flush: abort won't
    }
    work();   // no handler anywhere
}
```
- Output (GCC 11, Linux):
```
~Guard ran
caught boom
terminate called after throwing an instance of 'std::runtime_error'
  what():  boom
```
- The process then aborts (exit status 134, SIGABRT). The second `~Guard ran` never appears.
- `std::endl` matters here: `abort` does not flush `std::cout`, so with output redirected to a file or pipe, unflushed lines are lost too.
- Not unwinding is useful for debugging: the core dump shows the stack at the throw point.
- ❌ Common wrong answer: "RAII guarantees cleanup whenever an exception is thrown."
- ✅ What a strong answer adds: put `try { ... } catch (...) { log; return 1; }` in `main` and in every thread entry function when cleanup matters (flushing logs, removing lock files, sending a disconnect).

**Key takeaway:** RAII cleanup during exceptions is guaranteed only for exceptions that are caught.

---

#### Q6: Two `File` objects are built from the same file descriptor. What goes wrong?
**Difficulty:** #intermediate
**Category:** #raii #ownership
**Concepts:** #double_close #fd_reuse #ownership_contract

```cpp
int fd = open("data.txt", O_RDONLY);   // say fd == 5
File a(fd);
File b(fd);                            // ~File() calls close(fd_)
```

**Answer:**
Both objects believe they own fd 5, so it is closed twice. The second `close(5)` normally fails with `EBADF`, but if another thread opened a file in between and the OS reused number 5, the second close silently closes that unrelated file.

**Explanation:**
- An fd is just an integer; the constructor `File(int fd) : fd_(fd) {}` copies the number. It cannot know whether someone else owns it.
- "Takes ownership" is a **contract** of the class: after `File f(fd);` the caller must not close `fd` or give it to another owner.
- The same happens with `File b = a;` when the class has no copy control (the compiler-generated copy duplicates the number).
- Real multiple ownership needs an explicit design:
  - `dup(fd)` gives each owner its own descriptor to the same open file description
  - or reference-counted ownership: `std::shared_ptr` with a custom deleter, close on the last release (topic 07)
- ❌ Common wrong answer: "The second close just fails harmlessly." Descriptor reuse turns it into closing someone else's file, a bug that appears far from its cause.
- ✅ What a strong answer adds: prefer factories that acquire inside the wrapper (`File::open(path)`) so the raw fd never escapes, and mark adopting constructors `explicit`.

**Key takeaway:** Multiple references are fine; multiple independent owners of one handle are a bug.

---

#### Q7: You are writing an RAII wrapper for a C library handle. What must you decide about copying?
**Difficulty:** #intermediate
**Category:** #raii #special_members
**Concepts:** #rule_of_five #move_only #deep_copy

**Answer:**
The compiler-generated copy copies the handle value, creating two owners and a double release, so you must choose: move-only (delete copy, move empties the source), deep copy (duplicate the resource), or shared ownership (reference count). For most handles, move-only is right.

**Explanation:**

| Option | How | When |
|---|---|---|
| Move-only | `= delete` copy; move with `std::exchange(o.h_, invalid)` | Files, sockets, locks, threads: the default |
| Deep copy | Copy ctor duplicates (`dup`, new allocation) | Value types that own memory (`std::vector`) |
| Shared | `std::shared_ptr<Handle>` with deleter | Several components keep it alive, no clear single owner |
| Rule of 0 | `std::unique_ptr<T, Deleter>` member | Handle is a pointer: no special members at all |

- The destructor must handle the moved-from (empty) state: `if (h_ != invalid) release(h_);`.
- Move operations should be `noexcept` so containers move rather than copy during growth.
- Mechanics of writing the five special members and copy-and-swap: topic 02.
- ❌ Common wrong answer: "Just write the destructor; the rest is generated correctly."
- ✅ What a strong answer adds: isolate the raw handle in one tiny class and let every other class follow the Rule of 0 by holding that class as a member.

**Key takeaway:** A handle wrapper must state its copy semantics; the default copy is always wrong for an owner.

---

#### Q8: A constructor throws halfway through. Which destructors run?
**Difficulty:** #intermediate
**Category:** #exceptions #object_lifetime
**Concepts:** #constructor_failure #member_destruction #leak

**Answer:**
The object's own destructor does not run, because its lifetime never started. Every base and member that was fully constructed is destroyed in reverse order. If the object was created with `new`, the new-expression also frees the memory.

**Explanation:**
```cpp
#include <iostream>
#include <stdexcept>
#include <vector>

struct Holder {
    int* raw_;
    std::vector<int> safe_;
    Holder() : raw_(new int[100]), safe_(100) {
        std::cout << "acquired both\n";
        throw std::runtime_error("init failed");
    }
    ~Holder() { delete[] raw_; std::cout << "~Holder\n"; }
};

int main() {
    try { Holder h; } catch (const std::exception& e) { std::cout << e.what() << '\n'; }
}
```
- Output:
```
acquired both
init failed
```
- `~Holder` never prints, so `raw_` leaks (ASan/LeakSanitizer: "Direct leak of 400 byte(s)"). `safe_` was a finished member and freed its buffer.
- Fix: every resource in its own RAII member; then the class needs no destructor at all.
- ❌ Common wrong answer: "The destructor runs and cleans up whatever was initialized."
- ✅ What a strong answer adds: throwing is the right way to report constructor failure; a half-built "zombie" object that every method must check is worse.

**Key takeaway:** Constructor failure destroys finished members, never the object itself: own resources through members, not raw pointers.

---

#### Q9: Why must destructors not throw? What do you do when `close()` can fail?
**Difficulty:** #intermediate
**Category:** #exceptions #raii
**Concepts:** #noexcept #std_terminate #destructor

**Answer:**
Destructors are implicitly `noexcept` since C++11, so a throw from one calls `std::terminate` even if the caller has a `catch`. And during unwinding a second exception would mean two in flight, which also calls `std::terminate`. For a failing release, offer an explicit `close()` that reports the error, and let the destructor do a best-effort release that swallows or logs.

**Explanation:**
```cpp
#include <iostream>
#include <stdexcept>

struct Bad { ~Bad() { throw std::runtime_error("from dtor"); } };

int main() {
    try { Bad b; } catch (const std::exception& e) { std::cout << "caught\n"; }
}
```
- GCC warns at compile time: "'throw' will always call 'terminate'". At run time:
```
terminate called after throwing an instance of 'std::runtime_error'
  what():  from dtor
```
- `caught` never prints.
- Standard containers assume non-throwing element destructors; a throwing one makes them UB.
- `std::fstream` is the model: `close()` sets `failbit` for callers who check; the destructor closes silently.
- ❌ Common wrong answer: "Throwing from a destructor is fine as long as no other exception is active."
- ✅ What a strong answer adds: `~T() noexcept(false)` is possible but still terminates during unwinding and breaks containers; nobody should rely on it.

**Key takeaway:** Destructors release silently; errors are reported through an explicit close/commit call.

---

#### Q10: What are the exception safety guarantees, with an example of each?
**Difficulty:** #intermediate
**Category:** #exception_safety
**Concepts:** #basic_guarantee #strong_guarantee #nothrow_guarantee

**Answer:**
No-throw: the operation never fails (destructors, `swap`, `unique_ptr::reset`). Strong: if it throws, the state is exactly as before (`vector::push_back`, copy-and-swap assignment). Basic: if it throws, nothing leaks and invariants hold, but values may have changed (most functions, range `vector::insert`). No guarantee: anything can happen (raw owners).

**Explanation:**
- The guarantees form a ladder; each one includes the ones below it.
- RAII alone gives the basic guarantee *for resources*; keeping multi-member invariants needs ordering (see Q12).
- Strong is built **from** no-throw operations: you need at least one step that cannot fail to commit.
- `vector::push_back` gives the strong guarantee only because it copies (rather than moves) elements whose move constructor might throw: `std::move_if_noexcept` (topic 02 and 03).
- ❌ Common wrong answer: "Exception safe means the function doesn't throw." That is only the strongest level.
- ✅ What a strong answer adds: document the guarantee per function; strong is not free (copying), so libraries choose it only where it is cheap or essential.

**Key takeaway:** Each guarantee includes the weaker ones (no-throw includes strong, strong includes basic); RAII gets you basic, design gets you strong.

---

#### Q11: How do you implement the strong guarantee?
**Difficulty:** #advanced
**Category:** #exception_safety #design
**Concepts:** #commit_or_rollback #copy_and_swap #noexcept

**Answer:**
Do all the work that can throw on the side without touching visible state, then commit using only operations that cannot throw. Common forms: copy-and-swap (build a new copy, then `swap`), pre-reserving capacity before `noexcept` moves, writing a temporary file and then `rename`, or a scope guard that rolls back each step.

**Explanation:**
- Copy-and-swap assignment: `T& operator=(T other) noexcept { swap(*this, other); return *this; }`: the copy (which may throw) happens in the parameter, before `*this` changes (topic 02).
- Two containers that must change together: validate, reserve both, then `push_back` with non-throwing moves (theory Example 4).
- Multi-step operations on external systems: scope guards that undo each completed step, dismissed at the commit point (theory Example 5).
- Cost: copy-and-swap on a large object copies all of it even for a small change; sometimes the basic guarantee plus a documented "object is reset on failure" is the better trade.
- ❌ Common wrong answer: "Wrap the body in try/catch and undo in the catch." Possible, but brittle: the undo code must know exactly how far the body got.
- ✅ What a strong answer adds: the commit step must be no-throw; if your "commit" can fail, you do not have the strong guarantee.

**Key takeaway:** Strong guarantee = throwing work first, then a no-throw commit.

---

#### Q12: Does using RAII members make a class automatically exception safe?
**Difficulty:** #intermediate
**Category:** #exception_safety #raii
**Concepts:** #invariants #basic_guarantee #ordering

**Answer:**
It guarantees no leaks, but not intact invariants. If a member function changes one member and then throws before changing the related one, every object is still destroyed correctly, yet the class is left in a state that violates its own invariant.

**Explanation:**
```cpp
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>

struct Book {
    std::vector<std::string> ids;
    std::vector<double> prices;      // invariant: same size as ids
    void add(const std::string& id, double px) {
        ids.push_back(id);
        if (px <= 0) throw std::invalid_argument("bad price");
        prices.push_back(px);
    }
};

int main() {
    Book b;
    try { b.add("ORD1", -5); } catch (const std::exception&) {}
    std::cout << b.ids.size() << ' ' << b.prices.size() << '\n';
}
```
- Output: `1 0`. No leak (ASan clean), but the invariant is broken.
- Fix: validate first, or build both changes on the side and commit with non-throwing steps.
- ❌ Common wrong answer: "Smart pointers and containers make the code exception safe."
- ✅ What a strong answer adds: "exception safe" has levels; ask which guarantee, then check invariants, not just leaks.

**Key takeaway:** RAII protects resources; ordering protects invariants.

---

#### Q13: What is a scope guard, and when would you use it instead of a dedicated RAII class?
**Difficulty:** #intermediate
**Category:** #raii #design
**Concepts:** #scope_guard #rollback #uncaught_exceptions

**Answer:**
A scope guard is a small RAII object that runs an arbitrary callable in its destructor, usually with `dismiss()` to cancel it at the commit point. Use it for one-off cleanup or rollback inside a single function; write a named RAII class when the same cleanup is needed in several places.

**Explanation:**
- Typical use: multi-step updates across systems: `step1(); ScopeGuard g1(undo1); step2(); ScopeGuard g2(undo2); step3(); g2.dismiss(); g1.dismiss();`
- Variants (Library Fundamentals TS v3 `<experimental/scope>`): `scope_exit` (always), `scope_fail` (on exception), `scope_success` (on normal exit). Not in C++23; many codebases have their own.
- `scope_fail` compares `std::uncaught_exceptions()` (C++17) at construction and destruction; a plain bool check is wrong when the guard lives inside a destructor running during unwinding.
- The callable runs in a destructor, so it must not throw.
- ❌ Common wrong answer: "Call `dismiss()` right after the guarded step." Dismiss at the end, after the last operation that can fail.
- ✅ What a strong answer adds: declare each guard right after the step it undoes, so rollback runs only for steps that actually happened, in reverse order.

**Key takeaway:** A scope guard is RAII for an action rather than a resource.

---

#### Q14: An exception is thrown inside a `noexcept` function and the caller has a `catch (...)`. What happens?
**Difficulty:** #intermediate
**Category:** #exceptions #noexcept
**Concepts:** #noexcept #std_terminate #unwinding

**Answer:**
`std::terminate` is called; the caller's `catch` never runs. When an exception tries to leave a `noexcept` function, the program terminates, and whether the stack inside that function is unwound is implementation-defined.

**Explanation:**
```cpp
#include <iostream>

void f() noexcept { throw 42; }

int main() {
    try { f(); } catch (...) { std::cout << "caught\n"; }
}
```
- Output: `terminate called after throwing an instance of 'int'`, then abort. GCC warns "'throw' will always call 'terminate'" at compile time when the throw is directly visible.
- The dangerous cases are indirect: a `noexcept` move constructor or `swap` that calls something that allocates and throws `std::bad_alloc`.
- `noexcept` is a promise, not a check: the compiler does not verify that callees cannot throw.
- ❌ Common wrong answer: "`noexcept` means the compiler forbids throwing."
- ✅ What a strong answer adds: mark functions `noexcept` only when they truly cannot fail (or when failure should abort), because containers and algorithms make decisions based on it.

**Key takeaway:** Throwing out of `noexcept` is not an exception path; it is program termination.

---

#### Q15: Can a constructor's function-try-block catch an exception from a member initializer and keep the object alive?
**Difficulty:** #advanced
**Category:** #exceptions #constructors
**Concepts:** #function_try_block #member_initializer #rethrow

**Answer:**
No. The handler of a constructor's function-try-block runs after all finished members and bases have been destroyed, and when control reaches the end of the handler the exception is automatically rethrown. It can log or translate the exception, nothing more.

**Explanation:**
```cpp
#include <iostream>
#include <stdexcept>

struct Member { Member() { throw std::runtime_error("member failed"); } };

struct Owner {
    Member m;
    Owner() try : m() {
    } catch (const std::exception& e) {
        std::cout << "handler: " << e.what() << '\n';
    }                                   // implicit rethrow here
};

int main() {
    try { Owner o; }
    catch (const std::exception& e) { std::cout << "caller: " << e.what() << '\n'; }
}
```
- Output:
```
handler: member failed
caller: member failed
```
- Referring to non-static members or bases inside the handler is UB (they are already destroyed); a `return` statement in the handler is ill-formed.
- Legitimate use: `catch (const LowLevelError& e) { throw ConfigError(e.what()); }` to translate the type.
- ❌ Common wrong answer: "It lets the constructor recover and finish with default values." Use a member default or a factory for that.
- ✅ What a strong answer adds: function-try-blocks on ordinary functions do not rethrow automatically (falling off the end of the handler is like flowing off the end of the function: fine for `void`, UB for a value-returning function); constructor and destructor handlers do rethrow. That is why they are rarely used outside constructors.

**Key takeaway:** A constructor cannot swallow a member's exception; an object whose part failed does not exist.

---

#### Q16: `std::exit(1)` is called deep inside a function holding a `lock_guard` and a `unique_ptr`. Are they cleaned up?
**Difficulty:** #intermediate
**Category:** #raii #program_termination
**Concepts:** #std_exit #static_destruction #automatic_storage

**Answer:**
No. `std::exit` does not unwind the stack, so automatic objects (including RAII guards) are not destroyed. It does run `atexit` handlers and destroy objects with static and thread storage duration. `std::abort` and `std::quick_exit` destroy nothing.

**Explanation:**
```cpp
#include <cstdlib>
#include <iostream>

struct Noisy {
    const char* n;
    ~Noisy() { std::cout << "~" << n << '\n'; }
};

Noisy global{"global"};

void deep() {
    Noisy local{"local"};
    std::exit(0);
}

int main() {
    Noisy in_main{"main-local"};
    deep();
}
```
- Output: `~global` only.
- `return` from `main` is different: it destroys `main`'s locals first, then performs the same cleanup as `exit`.
- ❌ Common wrong answer: "Exiting the program runs all destructors."
- ✅ What a strong answer adds: to stop from deep inside, throw an exception caught in `main` (or return an error code up the chain), so RAII cleanup runs.

**Key takeaway:** `std::exit` skips the stack; only return or a caught exception unwinds it.

---

#### Q17: In what order are an object's resources released, and why does it matter for RAII?
**Difficulty:** #intermediate
**Category:** #raii #object_lifetime
**Concepts:** #destruction_order #member_order #dependencies

**Answer:**
Members are destroyed in reverse declaration order (locals in reverse definition order), so declaration order is release order. A resource that depends on another must be declared after it, so it is released first.

**Explanation:**
```cpp
#include <iostream>

struct Res {
    const char* n;
    explicit Res(const char* s) : n(s) { std::cout << "open " << n << '\n'; }
    ~Res() { std::cout << "close " << n << '\n'; }
};

struct Session {
    Res connection{"connection"};
    Res statement{"statement"};     // uses connection: declared after it
};

int main() { Session s; }
```
- Output:
```
open connection
open statement
close statement
close connection
```
- Classic bug: a `std::jthread` member declared **before** the queue it reads from; the queue is destroyed first while the thread is still running.
- The order of the member initializer list does not change this; only declaration order counts (GCC warns with `-Wreorder`).
- ❌ Common wrong answer: "Members are destroyed in the order they were initialized in the constructor's list."
- ✅ What a strong answer adds: if a different order is required, `reset()` the members explicitly in the destructor body (the body runs before members are destroyed). General construction/destruction order rules: topic 01.

**Key takeaway:** Declare dependencies first; RAII releases them last.

---

#### Q18: Your codebase is built with `-fno-exceptions`. How do you keep RAII when a constructor cannot report failure by throwing?
**Difficulty:** #intermediate
**Category:** #raii #error_handling
**Concepts:** #factory_function #optional #expected #two_phase_init

**Answer:**
Move the fallible acquisition into a static factory that returns `std::optional<T>` (C++17) or `std::expected<T, E>` (C++23), and make the constructor private and non-failing: it only adopts an already-acquired resource. Every `T` that exists then holds a valid resource, and the destructor still releases it. Avoid the "empty constructor + `bool init()`" pattern, which reintroduces half-built objects.

**Explanation:**
- Why `init()` is the wrong answer:
  - The object exists before it is usable: every member function and the destructor must handle the "not initialized" state.
  - Callers forget to check the `bool`; nothing forces them to.
  - The class invariant ("holds a valid handle") no longer holds, which is exactly what RAII was supposed to guarantee.
- Factory pattern:
  - The factory does the work that can fail (`open`, `socket`, `mmap`) and returns an empty optional/expected on failure; no object of type `T` is created.
  - The constructor is `noexcept` and private; the move constructor is `noexcept` so the object can be returned inside the optional.
  - `std::expected<T, E>` carries the reason (`errno`, an error enum); `std::optional` only says "failed".
- With `-fno-exceptions`, allocation failure inside `new` or containers still raises `std::bad_alloc` from the library, which this code cannot catch: the program terminates. Latency-critical code that disables exceptions usually also preallocates, so this rarely matters in practice.
```cpp
#include <fcntl.h>
#include <unistd.h>
#include <iostream>
#include <optional>
#include <utility>

class File {
    int fd_;
    explicit File(int fd) noexcept : fd_(fd) {}   // only open() can build one
public:
    static std::optional<File> open(const char* path) noexcept {
        int fd = ::open(path, O_RDONLY);
        if (fd < 0) return std::nullopt;            // no zombie object exists
        return File(fd);
    }
    File(File&& o) noexcept : fd_(std::exchange(o.fd_, -1)) {}
    File& operator=(File&&) = delete;
    ~File() { if (fd_ >= 0) { ::close(fd_); std::cout << "closed\n"; } }
    int fd() const noexcept { return fd_; }        // always valid if you have one
};

int main() {
    if (auto f = File::open("/etc/hostname")) {
        std::cout << "opened, fd valid: " << (f->fd() >= 0) << '\n';
    }
    if (auto g = File::open("/no/such/file"); !g) {
        std::cout << "open failed\n";
    }
}
```
- Output (compiled with `-fno-exceptions`, clean under ASan/UBSan; `/etc/hostname` exists on typical Linux):
```
opened, fd valid: 1
closed
open failed
```
- ❌ Common wrong answer: "Without exceptions you cannot use RAII." Only constructor failure needs another channel; destructors and scope-based release work exactly the same.
- ✅ What a strong answer adds: the factory keeps the invariant "if you have a `File`, it is open", so no member function needs a validity check, and `[[nodiscard]]` on the factory (or on `std::expected` usage) makes ignoring the failure visible.

**Key takeaway:** Without exceptions, fail in a factory that returns optional/expected; never create a half-initialized object.

---
