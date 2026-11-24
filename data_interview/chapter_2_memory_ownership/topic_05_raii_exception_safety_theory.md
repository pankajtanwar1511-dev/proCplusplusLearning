## TOPIC: RAII and Exception Safety

### THEORY_SECTION: Core Concepts

#### 1. Mental model
- **RAII** (Resource Acquisition Is Initialization): tie a resource to the lifetime of an object.
  - Constructor **acquires** the resource (or throws, so a half-acquired object never exists).
  - Destructor **releases** it.
  - The object's lifetime **is** the ownership: when the object dies, the resource is released, on every exit path.
- "Resource" means anything that must be given back, not only heap memory:

| Resource | Acquire | Release | Standard RAII type |
|---|---|---|---|
| Heap object | `new` | `delete` | `std::unique_ptr`, `std::shared_ptr` |
| Heap array / buffer | `new[]` / allocator | `delete[]` / deallocate | `std::vector`, `std::string`, `std::unique_ptr<T[]>` |
| Mutex ownership | `lock()` | `unlock()` | `std::lock_guard`, `std::unique_lock`, `std::scoped_lock` |
| File | `open` / `fopen` | `close` / `fclose` | `std::fstream`, custom wrapper, `unique_ptr<FILE, D>` |
| Thread | start | `join()` | `std::jthread` (C++20) |
| Socket, DB connection, GPU buffer, OS handle | API call | API call | Custom wrapper |

- The RAII object itself is usually an automatic (stack) variable, but it can also be a class member or a container element: then its owner's lifetime decides when it releases.
- RAII does not remove heap allocation; it makes the **release** automatic, deterministic and exception safe.
- Deterministic: release happens at a known point (end of scope), unlike garbage collection or finalizers.

#### 2. Why manual cleanup fails
- With `Resource* r = new Resource; ... delete r;` every path that leaves the function must reach `delete`:
  - early `return`, `break`, `continue`, `goto` out of the block
  - any exception thrown by any called function (including `operator new`, `std::string` copies, `vector::push_back`)
  - code added later by someone else
- When the function exits early, the **pointer variable** `r` is destroyed (it is automatic), but the **pointee** is not: nobody owns it any more, so it leaks.
- The manual fix (`try { ... } catch (...) { delete r; throw; }` plus a `delete` before every `return`) does not scale:
  - two resources need nested try blocks
  - a new exit path silently reintroduces the leak
- Leaks are the mild outcome. A forgotten `unlock()` blocks every other thread forever; a forgotten `close()` exhausts descriptors.
- Rule: **no naked `new`/`delete`, no manual `lock()`/`unlock()` in application code**. Every resource is owned by an object from the moment it is acquired.

#### 3. Stack unwinding: what exactly runs
- When an exception is thrown and a matching `catch` exists, control transfers to the handler and every **fully constructed automatic object** between the throw point and the handler is destroyed, in reverse order of construction.
- This includes temporaries and partially built arrays/aggregates (elements already constructed are destroyed).
- It does **not** include:
  - heap objects pointed to by raw pointers (the pointer dies, the pointee leaks)
  - objects whose constructor did not complete (their destructor never runs: see section 5)
- When `std::terminate` is called instead, there are **no guarantees**:

| Situation | What happens to automatic objects |
|---|---|
| Exception caught somewhere up the stack | Unwound: destructors run |
| Exception **never caught** | `std::terminate`; implementation-defined whether the stack is unwound. GCC/libstdc++: not unwound, destructors do not run |
| Exception escapes a `noexcept` function | `std::terminate`; stack may be unwound, partially unwound or not at all |
| Destructor throws while another exception is propagating | `std::terminate` |
| `std::exit()` | Automatic objects **not** destroyed; static and `thread_local` objects are |
| `std::abort()`, `std::quick_exit()`, crash, `kill -9` | Nothing destroyed |

- Practical consequence: RAII cleanup is guaranteed only for exceptions that are caught. Long-running programs usually put a top-level `try`/`catch` in `main` and in every thread entry function, so unwinding is guaranteed.
- An exception escaping a `std::thread` entry function calls `std::terminate`; it does not travel to the thread that calls `join()`.

#### 4. Writing an RAII wrapper
- Checklist for a wrapper around a raw handle (fd, `FILE*`, socket, C library handle):
  1. Constructor acquires, or **throws** on failure (never leave a "zombie" object that holds an invalid handle and pretends to work), or offer a factory that returns `std::optional`/`expected`.
  2. Destructor releases, is `noexcept` (implicit since C++11), and checks for the "empty" state.
  3. **Decide copy semantics explicitly.** The compiler-generated copy just copies the handle value, so two objects release it twice. Options:
     - Move-only (most handles): delete copy, implement move that leaves the source empty.
     - Deep copy: duplicate the resource (`dup()` for an fd, new allocation for memory).
     - Shared ownership: reference count (`std::shared_ptr` with a custom deleter).
  4. Provide `get()` (observe), `release()` (give up ownership without releasing), `reset()` (release current, adopt new).
  5. Mark the constructor that takes a raw handle `explicit`, so an `int` never silently becomes an owner.
- Rule of 0 first: often the wrapper is just `std::unique_ptr<FILE, Closer>` and needs no hand-written special members. Write the five special members only in the one small class that owns the raw handle (see topic 02 for the Rule of 0/3/5 mechanics and copy-and-swap).
- **Ownership is a contract**, not a property of the handle:
  - `File f(fd);` with `int fd` copies the number 5; the integer has no idea who owns it.
  - The class documentation says "takes ownership": from that line on, the caller must not close `fd`.
  - `std::unique_ptr<int> a(p);` is the same contract for a raw pointer: after it, `delete p` is a double delete.
- Multiple *references* to a resource are fine; multiple *independent owners* are a bug unless ownership is explicitly shared.

#### 5. Constructors that throw
- An object's lifetime starts when its constructor **completes**. If the constructor throws:
  - the object never existed, so **its own destructor does not run**
  - every fully constructed **base and member** is destroyed, in reverse order of construction
  - for `new T(...)`, the new-expression calls the matching `operator delete`, so the memory itself does not leak
- Consequence: a class that acquires two raw resources in its constructor leaks the first if acquiring the second throws, because the destructor that would release the first never runs.
- Fix: one resource per RAII member. Then each member that finished construction cleans itself up:

```cpp
// Leaks a_ if the second new throws:
struct Bad  { int* a_; int* b_; Bad() : a_(new int[100]), b_(new int[100]) {} ~Bad(); };
// Correct with zero hand-written cleanup:
struct Good { std::vector<int> a_, b_; Good() : a_(100), b_(100) {} };
```

- Throwing from a constructor is the **correct** way to report failure: there is no return value, and a half-initialized object is worse than no object.
- **Function-try-block** on a constructor catches exceptions from the member initializer list:
  - the handler cannot "rescue" the object: falling off the end of the handler **rethrows** automatically
  - members and bases are already destroyed when the handler runs; touching them is UB
  - legitimate uses: logging, translating the exception type

#### 6. Destructors must not throw
- Since C++11 every destructor is implicitly `noexcept(true)` (unless a member or base destructor is `noexcept(false)`).
- So `throw` from a destructor calls `std::terminate` even if the caller has a matching `catch`. GCC warns: "'throw' will always call 'terminate'".
- Even with `noexcept(false)`, a destructor that throws while another exception is propagating calls `std::terminate` (two exceptions in flight).
- Standard containers and algorithms assume non-throwing destructors; a throwing element destructor makes them UB.
- But release operations can fail (`close()` reporting `EIO`, a final flush, a network commit). Pattern:
  - provide an explicit `close()`/`commit()` that **throws or returns an error**, for callers who care
  - the destructor calls the release only if still open, and **swallows or logs** any error
- `std::uncaught_exceptions()` (C++17) lets a destructor know whether it runs because of unwinding (used by scope guards, section 8). The old `std::uncaught_exception()` (singular) was deprecated in C++17 and removed in C++20.

#### 7. Exception safety guarantees
- Every function should document which guarantee it offers (Abrahams guarantees):

| Guarantee | Promise if an exception escapes | Typical examples |
|---|---|---|
| **No-throw** (`noexcept`) | Never throws | Destructors, `swap`, move ops of most types, `unique_ptr::reset`, `vector::pop_back` |
| **Strong** (commit or rollback) | Program state is exactly as before the call | `vector::push_back` (if move is `noexcept` or copy is used), `map::insert` of one element, copy-and-swap assignment |
| **Basic** | No leaks, invariants hold, objects usable, but the values may have changed | Most functions; `vector::insert` of a range in the middle, `std::sort` on a throwing comparator |
| **None** | Anything: leaks, broken invariants | Bugs; legacy code with raw ownership |

- RAII gives the **basic** guarantee for resources almost for free (no leaks). It does not by itself keep *invariants* between members intact.
- The **strong** guarantee needs a design: do all work that can throw **on the side**, then **commit** with operations that cannot throw:
  - copy-and-swap (topic 02): build a new copy, then `swap` (noexcept)
  - reserve capacity first, then `push_back` with a `noexcept` move
  - write to a temporary file, then `rename` (atomic on POSIX)
- Strong is not always worth its cost: copy-and-swap on a large container copies everything. The standard library itself only gives basic for many range operations. Choose per function.
- The no-throw guarantee is what makes the others possible: you cannot build commit/rollback without at least one operation that cannot fail.
- `vector` growth relies on this: it uses `std::move_if_noexcept`, so an element type with a throwing move constructor gets copied during reallocation (details in topic 02 and topic 03).

#### 8. Scope guards: RAII for one-off actions
- Writing a class for every cleanup is heavy. A **scope guard** runs an arbitrary callable when the scope exits:
  - `ScopeGuard g([&] { rollback(); });` and `g.dismiss();` after the commit point.
- Three flavours (names from Library Fundamentals TS v3, `<experimental/scope>`; not in the C++23 standard):

| Guard | Runs callable on |
|---|---|
| `scope_exit` | every exit |
| `scope_fail` | exit by exception only |
| `scope_success` | normal exit only |

- `scope_fail` is implemented by comparing `std::uncaught_exceptions()` at construction and in the destructor. A plain `bool` check (`std::uncaught_exception()`) gave the wrong answer when the guard itself lived inside a destructor that ran during unwinding.
- The callable of a scope guard runs in a destructor: it must not throw.
- Guards are declared **immediately after** the action they undo, so the rollback only exists if the action happened.
- Use a guard for ad hoc rollback in one function; use a named RAII class when the same cleanup appears in several places.

#### 9. Release order and dependencies
- Members are destroyed in reverse declaration order, locals in reverse definition order (details in topic 01). For RAII this means **declaration order is release order**.
- Declare a resource **after** the resources it depends on:
  - a `std::jthread` member that uses a queue member must be declared after the queue, so it is joined before the queue dies
  - a `lock_guard` must be declared after the mutex it locks (always true for locals, matters for members)
  - a database statement handle after its connection
- `std::unique_ptr` members follow the same rule; `reset()` them explicitly in the destructor body only if you need an order different from declaration order.

#### 10. Misconceptions to unlearn
- ❌ "RAII is about heap memory." ✅ It is about any resource with an acquire/release pair: locks, files, sockets, threads.
- ❌ "RAII means we work on the stack instead of the heap." ✅ The *owner* is usually automatic; the resource is often still on the heap.
- ❌ "During unwinding, the `delete` statements of the function run." ✅ Only destructors of automatic objects run; arbitrary statements are skipped.
- ❌ "Destructors are guaranteed to run when an exception is thrown." ✅ Only if it is caught. Uncaught: `std::terminate`, and GCC does not unwind.
- ❌ "If a constructor throws, the destructor cleans up." ✅ The destructor of that object never runs; only its completed members and bases are destroyed.
- ❌ "A destructor may throw if nothing else is in flight." ✅ Destructors are implicitly `noexcept`; a throw calls `std::terminate`.
- ❌ "`File(int fd)` takes ownership because it stores the fd." ✅ Ownership is a documented contract; the compiler-generated copy happily creates a second owner.
- ❌ "Using RAII makes a function strongly exception safe." ✅ RAII prevents leaks (basic guarantee); strong needs do-then-commit design.
- ❌ "`lock_guard` destroys the mutex." ✅ It unlocks the mutex; the mutex lives on.
- ❌ "`std::exit` runs all destructors." ✅ It skips automatic objects; only statics and thread-locals are destroyed.

### EDGE_CASES: Traps and Misconceptions

#### Edge Case 1: An uncaught exception does not guarantee cleanup
- `void work() { Guard g; throw std::runtime_error("boom"); }` called from `main` with no `try`.
- No handler exists, so `std::terminate` is called. Whether the stack is unwound first is **implementation-defined**.
- GCC/libstdc++ does not unwind: `~Guard` never runs; the program prints the terminate message and aborts.
- With a `try`/`catch` around the call, `~Guard` runs before the handler.
- Consequence: cleanup that must happen (flush a log, release an OS-wide lock file) needs a top-level `catch (...)` in `main` and in every thread function.

#### Edge Case 2: A throwing destructor terminates even inside try/catch
- `struct Bad { ~Bad() { throw std::runtime_error("x"); } };` and `try { Bad b; } catch (...) {}`.
- The destructor is implicitly `noexcept`, so the exception reaches a non-throwing boundary: `std::terminate`.
- The `catch` never runs. GCC warns at compile time: "'throw' will always call 'terminate'".
- Declaring `~Bad() noexcept(false)` makes this one case catchable, but if the destructor runs during unwinding of another exception, it is still `std::terminate`. Do not do it.

#### Edge Case 3: The constructor throws, the destructor never runs
- `Holder() : a_(new int[100]) { init(); }` where `init()` throws.
- `~Holder()` contains `delete[] a_`, but the object never finished construction, so `~Holder` is never called: `a_` leaks.
- Members that are RAII types (already constructed) are destroyed correctly; raw pointers have trivial destructors and release nothing.
- Fix: `std::unique_ptr<int[]> a_` or `std::vector<int> a_`.

#### Edge Case 4: A copied wrapper closes the handle twice
- `struct File { int fd; ~File() { close(fd); } };` with no copy control.
- `File b = a;` copies the integer. At scope exit `b` closes fd 3 (succeeds), then `a` closes fd 3 again: `close` returns -1, `EBADF`.
- Worse in a real program: between the two closes another thread may `open` a file and receive the reused number 3, and the second close silently closes **that** unrelated file.
- Fix: delete the copy operations and implement moves that empty the source (or `dup()` for a real copy).

#### Edge Case 5: Two owners from one raw handle
- `int fd = open(...); File a(fd); File b(fd);` compiles even with a move-only `File`: both constructors receive the same integer.
- Same bug as `std::unique_ptr<T> a(p), b(p);`: double release.
- The type system cannot stop it; the contract "constructor takes ownership" must be respected by the caller. Prefer factories that acquire inside the wrapper (`File::open(path)`, `std::make_unique`) so the raw handle is never visible.

#### Edge Case 6: std::exit skips local destructors
- `std::exit(0)` from inside a function: static objects and `thread_local`s are destroyed, but locals on the stack (including RAII guards and `unique_ptr`s) are not.
- A `std::lock_guard` held while calling `exit` stays locked; a buffered writer owned by a local is not flushed.
- `return` from `main` runs local destructors of `main`, then calls `exit`. Prefer returning or throwing to `main` over calling `exit` deep in the stack.

#### Edge Case 7: An exception escaping a noexcept function
- `void f() noexcept { throw 1; }` called inside `try { f(); } catch (...) {}`.
- The `catch` is irrelevant: the exception would have to leave a `noexcept` function, so `std::terminate` is called. Unwinding inside `f` may or may not happen.
- Common in practice through **implicitly** noexcept functions: destructors, and move operations or `swap` that were declared `noexcept` but call something that throws.

#### Edge Case 8: Basic guarantee is not "nothing changed"
- `void add(name, weight) { names_.push_back(name); weights_.push_back(check(weight)); }`.
- If `check` throws, nothing leaks (both vectors are RAII), but `names_` has one more element than `weights_`: the class invariant "same size" is broken.
- RAII protected the memory, not the invariant. Reorder (do the throwing work first) or reserve and validate before any visible change.

#### Edge Case 9: Scope guard dismissed too early
- `ScopeGuard undo([&] { book.erase(id); }); undo.dismiss(); notify(id);`
- If `notify` can throw and the order should be rolled back on failure, dismissing before the last throwing step disables the rollback.
- Rule: `dismiss()` is the **last** statement of the transaction, after every operation that can fail.

### CODE_EXAMPLES: Practical Demonstrations

#### Example 1: Early return and exception leak with raw new, not with RAII
- A live-object counter shows what is still allocated after each call.
```cpp
#include <iostream>
#include <memory>
#include <stdexcept>

struct Resource {
    static inline int live = 0;
    Resource() { ++live; }
    ~Resource() { --live; }
};

void raw(bool early, bool fail) {
    Resource* r = new Resource;
    if (early) return;                               // leak
    if (fail) throw std::runtime_error("failure");  // leak
    delete r;
}

void raii(bool early, bool fail) {
    auto r = std::make_unique<Resource>();
    if (early) return;                               // ~unique_ptr deletes
    if (fail) throw std::runtime_error("failure");  // unwinding deletes
}

int main() {
    raw(true, false);
    try { raw(false, true); } catch (const std::exception&) {}
    std::cout << "raw:  live after 2 bad exits = " << Resource::live << '\n';

    Resource::live = 0;
    raii(true, false);
    try { raii(false, true); } catch (const std::exception&) {}
    std::cout << "raii: live after 2 bad exits = " << Resource::live << '\n';
}
```
- Output:
```
raw:  live after 2 bad exits = 2
raii: live after 2 bad exits = 0
```
- Built with `-fsanitize=address`, LeakSanitizer reports the two leaked `Resource` objects from `raw` at exit.
- If the "resource" is a collection, `std::vector` (or `std::array` for a fixed size) is even better than `unique_ptr<T[]>`.

#### Example 2: A move-only file descriptor wrapper
- Owns a POSIX fd; copy deleted; move empties the source; destructor `noexcept`.
- Uses `pipe()` so it needs no files on disk; `fcntl(fd, F_GETFD)` checks whether an fd number is still open.
```cpp
#include <fcntl.h>
#include <unistd.h>
#include <iostream>
#include <system_error>
#include <utility>

class UniqueFd {
    int fd_ = -1;
public:
    UniqueFd() = default;
    explicit UniqueFd(int fd) noexcept : fd_(fd) {}       // takes ownership
    UniqueFd(const UniqueFd&) = delete;
    UniqueFd& operator=(const UniqueFd&) = delete;
    UniqueFd(UniqueFd&& o) noexcept : fd_(std::exchange(o.fd_, -1)) {}
    UniqueFd& operator=(UniqueFd&& o) noexcept {
        if (this != &o) reset(std::exchange(o.fd_, -1));
        return *this;
    }
    ~UniqueFd() { reset(); }

    int get() const noexcept { return fd_; }
    int release() noexcept { return std::exchange(fd_, -1); }  // caller owns it now
    void reset(int fd = -1) noexcept {
        int old = std::exchange(fd_, fd);
        if (old >= 0) ::close(old);
    }
    explicit operator bool() const noexcept { return fd_ >= 0; }
};

bool is_open(int fd) { return ::fcntl(fd, F_GETFD) != -1; }

std::pair<UniqueFd, UniqueFd> make_pipe() {
    int fds[2];
    if (::pipe(fds) != 0) throw std::system_error(errno, std::generic_category(), "pipe");
    return {UniqueFd(fds[0]), UniqueFd(fds[1])};   // owned from the first line
}

int main() {
    int rd_num, wr_num;
    {
        auto [rd, wr] = make_pipe();
        rd_num = rd.get();
        wr_num = wr.get();
        UniqueFd moved = std::move(wr);              // ownership transfer
        std::cout << "after move: wr empty=" << !wr << ", moved fd=" << moved.get() << '\n';
        ::write(moved.get(), "hi", 2);
        char buf[3] = {};
        ::read(rd.get(), buf, 2);
        std::cout << "read: " << buf << '\n';
    }                                                // both fds closed here
    std::cout << "open after scope: " << is_open(rd_num) << is_open(wr_num) << '\n';
}
```
- Output (fd numbers are typically 3 and 4):
```
after move: wr empty=1, moved fd=4
read: hi
open after scope: 00
```
- `reset` stores the new fd before closing the old one, the same order `std::unique_ptr::reset` uses (topic 06).
- The same class could be `std::unique_ptr` with a custom deleter only if the handle were a pointer; for an `int` handle a small class like this is the usual answer.

#### Example 3: A constructor that throws: members unwound, own destructor skipped
- Base and members construct in order; the third member throws.
```cpp
#include <iostream>
#include <stdexcept>
#include <string>

struct Trace {
    std::string name;
    explicit Trace(std::string n) : name(std::move(n)) { std::cout << "+" << name << ' '; }
    ~Trace() { std::cout << "-" << name << ' '; }
};

struct Base : Trace { Base() : Trace("Base") {} };

Trace make_c() { throw std::runtime_error("c failed"); }

struct Widget : Base {
    Trace a{"a"};
    Trace b{"b"};
    Trace c = make_c();
    Widget() { std::cout << "Widget body "; }
    ~Widget() { std::cout << "~Widget "; }
};

int main() {
    try {
        Widget w;
    } catch (const std::exception& e) {
        std::cout << "\ncaught: " << e.what() << '\n';
    }
}
```
- Output:
```
+Base +a +b -b -a -Base 
caught: c failed
```
- `Widget body` and `~Widget` never print: the object never started its lifetime.
- `Base`, `a` and `b` were fully constructed, so they are destroyed in reverse order before the handler runs.

#### Example 4: Basic vs strong guarantee for a two-vector invariant
- The invariant: `names_.size() == weights_.size()`. Validation can throw.
```cpp
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>

double check(double w) {
    if (w < 0) throw std::invalid_argument("negative weight");
    return w;
}

template <class T>
void grow_for_one(std::vector<T>& v) {               // keep geometric growth
    if (v.size() == v.capacity()) v.reserve(v.empty() ? 4 : 2 * v.capacity());
}

class Portfolio {
    std::vector<std::string> names_;
    std::vector<double> weights_;
public:
    void add_basic(const std::string& n, double w) {
        names_.push_back(n);                          // visible change first
        weights_.push_back(check(w));                 // may throw: sizes differ
    }
    void add_strong(std::string n, double w) {
        double v = check(w);                          // may throw: nothing changed
        grow_for_one(names_);                         // may throw: no visible change
        grow_for_one(weights_);
        names_.push_back(std::move(n));               // cannot throw now
        weights_.push_back(v);                        // cannot throw now
    }
    bool consistent() const { return names_.size() == weights_.size(); }
};

int main() {
    Portfolio p;
    try { p.add_basic("AAPL", -1); } catch (const std::exception&) {}
    std::cout << "basic:  consistent=" << p.consistent() << '\n';

    Portfolio q;
    try { q.add_strong("AAPL", -1); } catch (const std::exception&) {}
    std::cout << "strong: consistent=" << q.consistent() << '\n';
}
```
- Output:
```
basic:  consistent=0
strong: consistent=1
```
- Pattern: everything that can throw first, then the commit made only of non-throwing steps.
- `reserve(size() + 1)` would also be strong but reallocates on every call (quadratic); `grow_for_one` keeps amortized O(1).
- `capacity` changing is not an observable state change for the strong guarantee; size and contents are.

#### Example 5: A scope guard for rollback across two containers
- Moving an order from the pending map to the live map must be all-or-nothing.
```cpp
#include <iostream>
#include <map>
#include <stdexcept>
#include <string>
#include <utility>

template <class F>
class ScopeGuard {
    F f_;
    bool active_ = true;
public:
    explicit ScopeGuard(F f) : f_(std::move(f)) {}
    ScopeGuard(const ScopeGuard&) = delete;
    ScopeGuard& operator=(const ScopeGuard&) = delete;
    ~ScopeGuard() { if (active_) f_(); }             // f_ must not throw
    void dismiss() noexcept { active_ = false; }
};

std::map<int, std::string> pending{{1, "BUY 100"}, {2, "SELL 50"}};
std::map<int, std::string> live;

void publish(int id) { if (id == 2) throw std::runtime_error("venue rejected"); }

void activate(int id) {
    auto node = pending.extract(id);                      // step 1
    ScopeGuard undo1([&] { pending.insert(std::move(node)); });
    live[id] = node.mapped();                             // step 2
    ScopeGuard undo2([&] { live.erase(id); });
    publish(id);                                          // step 3: may throw
    undo2.dismiss();                                      // commit point: last
    undo1.dismiss();
}

int main() {
    activate(1);
    try { activate(2); } catch (const std::exception& e) { std::cout << e.what() << '\n'; }
    std::cout << "pending=" << pending.size() << " live=" << live.size() << '\n';
}
```
- Output:
```
venue rejected
pending=1 live=1
```
- Order 2 failed in step 3; `undo2` removed it from `live`, then `undo1` put the node back into `pending` (reverse order, like any destructors).
- Each guard is declared right after the step it undoes, so a failure in step 2 runs only `undo1`.
- `map::extract` (C++17) moves the node without copying; reinserting it cannot fail for lack of memory.

#### Example 6: Reporting release errors without throwing from the destructor
- `close()` reports failure to callers who check; the destructor is a best-effort fallback that never throws.
```cpp
#include <iostream>
#include <stdexcept>
#include <string>
#include <type_traits>

class Connection {
    std::string name_;
    bool open_ = true;
    bool fail_on_close_;
    void do_close() {                       // stands in for a final flush/commit
        open_ = false;
        if (fail_on_close_) throw std::runtime_error(name_ + ": flush failed");
    }
public:
    Connection(std::string n, bool fail) : name_(std::move(n)), fail_on_close_(fail) {}
    void close() { if (open_) do_close(); }         // explicit: may throw
    ~Connection() {                                 // implicit noexcept
        if (!open_) return;
        try { do_close(); }
        catch (const std::exception& e) {
            std::cout << "dtor swallowed: " << e.what() << '\n';   // log, never rethrow
        }
    }
};

static_assert(std::is_nothrow_destructible_v<Connection>);

int main() {
    try {
        Connection a("A", true);
        a.close();                                  // caller learns about the failure
    } catch (const std::exception& e) {
        std::cout << "caller saw: " << e.what() << '\n';
    }
    {
        Connection b("B", true);                    // never closed explicitly
    }
    std::cout << "still running\n";
}
```
- Output:
```
caller saw: A: flush failed
dtor swallowed: B: flush failed
still running
```
- `std::fstream` follows the same design: `close()` sets `failbit`, the destructor closes silently.
- In production, "swallowed" usually means logging plus a metric; it must never mean `throw`.

#### Example 7: scope_fail semantics with std::uncaught_exceptions
- A transaction commits on normal exit and rolls back on exceptional exit, decided in its destructor.
- The second case shows why the count matters: the transaction lives inside a destructor that runs during unwinding, yet its own scope exits normally.
```cpp
#include <exception>
#include <iostream>
#include <stdexcept>

class Transaction {
    const char* name_;
    int on_entry_ = std::uncaught_exceptions();          // C++17
public:
    explicit Transaction(const char* n) : name_(n) {}
    ~Transaction() {
        if (std::uncaught_exceptions() > on_entry_)
            std::cout << name_ << ": rollback\n";
        else
            std::cout << name_ << ": commit\n";
    }
};

struct AuditOnExit {
    ~AuditOnExit() { Transaction t("audit"); }          // runs during unwinding
};

void transfer(bool fail) {
    Transaction t("transfer");
    if (fail) throw std::runtime_error("insufficient funds");
}

int main() {
    transfer(false);
    try { transfer(true); } catch (const std::exception&) {}
    try {
        AuditOnExit a;
        throw std::runtime_error("unrelated failure");
    } catch (const std::exception&) {}
}
```
- Output:
```
transfer: commit
transfer: rollback
audit: commit
```
- With the old `bool std::uncaught_exception()`, `audit` would have printed "rollback": an exception was in flight, but not one leaving the audit transaction's scope.

### QUICK_REFERENCE: Cheat Sheet

#### RAII wrapper checklist
| Item | Rule |
|---|---|
| Constructor | Acquire or throw; `explicit` if it adopts a raw handle |
| Destructor | Release if owning; never throws (implicit `noexcept`) |
| Copy | `= delete`, deep copy (`dup`), or shared ownership; never the default for a handle |
| Move | Steal the handle, leave the source empty (`std::exchange(o.h_, invalid)`) |
| Interface | `get()`, `release()`, `reset(new)`, `explicit operator bool` |
| Failing release | Explicit `close()` that reports; destructor logs/swallows |
| Prefer | `unique_ptr<T, Deleter>` when the handle is a pointer (Rule of 0) |

#### What runs on each exit path
| Exit | Automatic objects destroyed? |
|---|---|
| Normal / early `return` / `break` | Yes |
| Exception caught up the stack | Yes (unwinding) |
| Exception never caught | Implementation-defined (GCC: no) |
| Exception escapes `noexcept` | Implementation-defined, then `terminate` |
| Throw from destructor | `terminate` |
| `std::exit` | No (statics yes) |
| `std::abort`, `quick_exit`, crash | No |

#### Exception safety guarantees
| Guarantee | One-line definition | Tool |
|---|---|---|
| No-throw | Cannot fail | `noexcept`, destructors, swap, moves |
| Strong | Success or no change | Do work on the side, commit with no-throw ops; copy-and-swap |
| Basic | No leaks, invariants hold | RAII + ordering |
| None | Anything | Raw owners |

#### Constructor failure
| Fact | Detail |
|---|---|
| Own destructor | Not run |
| Completed members and bases | Destroyed in reverse order |
| Memory from `new T` | Freed by the new-expression |
| Two raw resources in one class | First leaks if second throws: use one RAII member per resource |
| Function-try-block handler | Cannot swallow: rethrows at end; members already gone |

#### Interview one-liners
| Question | Answer |
|---|---|
| What is RAII? | Acquire in constructor, release in destructor; lifetime equals ownership |
| Only memory? | No: locks, files, sockets, threads, any handle |
| Why does raw `new` leak on throw? | The pointer dies during unwinding, the pointee has no owner |
| Destructors guaranteed on throw? | Only if the exception is caught |
| Constructor throws? | Its destructor never runs; finished members are destroyed |
| Can a destructor throw? | Implicitly `noexcept`: `terminate` |
| `close()` can fail? | Explicit `close()` that reports, destructor swallows |
| Basic vs strong? | Basic: valid but maybe changed; strong: unchanged |
| How to get strong? | Throwing work first, commit with no-throw operations |
| Two objects own one fd? | Double close, and the second close can hit a reused fd |
| Scope guard? | RAII for an ad hoc action; dismiss at the commit point |
| `lock_guard` on throw? | Its destructor unlocks the mutex during unwinding |
