## TOPIC: std::atomic and Compare-and-Swap

### THEORY_SECTION: Core Concepts

#### 1. Mental model
- `std::atomic<T>` is a **contract from the C++ memory model**, not a hardware recipe.
- The contract has three separate parts. Keep them apart in interviews:

| Property | Question it answers | Controlled by |
|---|---|---|
| **Atomicity** | Can anyone observe a half-done (torn) operation? Can two RMWs lose an update? | `std::atomic` itself, for every memory order |
| **Modification order** | In what single order did the writes to *this one object* happen? | Every atomic object has its own total order of modifications |
| **Ordering / synchronization** | What does this operation say about *other* memory (non-atomic data, other atomics)? | The `memory_order` argument (covered in topic 06) |

- Default memory order for every operation is `std::memory_order_seq_cst`. This topic uses the default everywhere; the ordering details live in topic 06.
- The hardware (lock-prefixed instructions, cache-coherence protocols such as MESI, store buffers, fences) is **how an implementation keeps the contract**, not what the contract is.
- One-line summary: an atomic makes **each individual operation** on **one object** indivisible. It does not make a sequence of operations, or several objects, indivisible.

#### 2. What `std::atomic<T>` guarantees (and what it does not)
- ✅ **No data race:** concurrent reads and writes of the same atomic object from different threads are well-defined. The same accesses on a plain `int` or `bool` are a data race, which is undefined behaviour.
- ✅ **No torn values:** a load returns some value that was actually stored (or the initial value), never a mix of bytes from two stores. This holds for `relaxed` too.
- ✅ **RMW operations never lose updates:** `fetch_add`, `exchange`, `compare_exchange_*`, `++`, `+=` each read the latest value in the object's modification order and write the new one as one indivisible step.
- ✅ **Single modification order per object:** all threads agree on the order of writes to that one atomic.
- ❌ **Not "everyone sees the newest value instantly":** a value you loaded is a snapshot that can be stale one instruction later. A plain load (unlike an RMW) is not required to return the very latest value.
- ❌ **Not a transaction:** `x.load()` followed by `x.store()` is two atomic operations with a gap in between.
- ❌ **Not lock-free by definition:** `std::atomic<T>` may be implemented with an internal lock (see section 6).
- Requirements on `T` for the primary template: trivially copyable, and copy/move constructible and assignable. `std::atomic<std::string>` does not compile (`static_assert` fires).
- `std::atomic` is **not copyable or movable**: `std::atomic<int> b = a;` is ill-formed. `std::atomic<int> a = 0;` is fine since C++17 (guaranteed copy elision, uses the `T` constructor).
- Since C++20 the default constructor value-initializes (`std::atomic<int> x;` holds 0). Before C++20 it was left uninitialized; always write `std::atomic<int> x{0};` to be portable.

#### 3. The operation catalogue
| Operation | Kind | Returns | Notes |
|---|---|---|---|
| `load()` | read | current value | snapshot only |
| `store(v)` | write | `void` | blind overwrite |
| `exchange(v)` | RMW | **old** value | atomic swap |
| `fetch_add / fetch_sub` | RMW | **old** value | integers, pointers (scaled by `sizeof(T)`), floating point since C++20 |
| `fetch_and / fetch_or / fetch_xor` | RMW | **old** value | integers only |
| `++x`, `x++`, `--x`, `x--` | RMW | **value**, not a reference | `++x` returns new value, `x++` returns old; not available for `atomic<bool>` or floating point |
| `x += v`, `x -= v`, `x |= v` ... | RMW | new value (by value) | same as the matching `fetch_*` plus the operand |
| `x = v` | write | `v` (by value) | same as `store(v)` |
| `compare_exchange_weak / strong` | conditional RMW | `bool` | updates `expected` on failure |
| `wait(old) / notify_one / notify_all` | C++20 | `void` | block until value differs from `old` |

- ⚠️ `x = x + 1` is **not** an RMW: it is `load`, add, `store`. No data race (both halves are atomic), but updates can be lost.
- `x += 1` **is** a single RMW.
- Signed atomic arithmetic **wraps** (two's complement) with no undefined behaviour, unlike plain signed `int` overflow.
- `atomic<bool>` has no arithmetic. Integer `fetch_max/fetch_min` arrive in C++26; before that, write a CAS loop.

#### 4. Compare-and-swap (`compare_exchange_*`) precisely
- Signature: `bool compare_exchange_strong(T& expected, T desired);` (same for `_weak`).
- Semantics, performed atomically:
```text
if (current == expected) { current = desired; return true;  }   // success
else                     { expected = current; return false; }  // failure: expected is OVERWRITTEN
```
- `expected` is passed **by reference** and is written on failure. This is the most asked detail:
  - value 15, expected 10, CAS to 20: fails, value stays 15, expected becomes 15.
- Comparison is **bitwise** (value representation, like `memcmp`), not `operator==`:
  - `double` `+0.0` and `-0.0` compare equal with `==` but CAS treats them as different.
  - A NaN can match itself in CAS even though `NaN == NaN` is false.
  - For structs, C++20 says padding bits do not participate; older implementations could fail forever on garbage padding.
- **weak vs strong:**
  - `compare_exchange_weak` may **fail spuriously**: return `false` even though `current == expected`. On a spurious failure `expected` is written with the current value, which equals what it already held.
  - `compare_exchange_strong` fails only if the values really differed.
- Why spurious failure exists: on LL/SC architectures (ARM `ldxr/stxr` without LSE, POWER `lwarx/stwcx.`, RISC-V `lr/sc`) the store-conditional fails if the reservation was lost (interrupt, context switch, cache-line eviction, a write to a neighbouring variable in the same reservation granule). `weak` maps to one LL/SC attempt; `strong` must wrap it in an internal retry loop.
- On x86-64 both compile to the same `lock cmpxchg`; there is no spurious failure there and no speed difference.
- Rule of thumb:
  - ✅ Already in a retry loop that recomputes `desired`: use `weak`.
  - ✅ One-shot decision ("did I win the claim?"), or a loop where retrying is expensive: use `strong`.
- Two-order overload `compare_exchange_weak(expected, desired, success_order, failure_order)` exists; the failure order cannot be `release` or `acq_rel` (details in topic 06).

#### 5. The CAS loop: building any RMW
- Template for an arbitrary atomic update `x = f(x)`:
```cpp
T expected = x.load();
T desired;
do {
    desired = f(expected);                      // recompute from the fresh expected
} while (!x.compare_exchange_weak(expected, desired));
```
- Two reasons the loop is needed:
  1. Another thread changed the value between our read and our CAS (real failure; `expected` now holds the new value).
  2. `weak` can fail spuriously.
- Rules for a correct loop:
  - Recompute `desired` from `expected` **inside** the loop. A `desired` computed once outside can write a stale value (counter can go backwards).
  - Keep the loop body short and side-effect free: it may run many times.
  - Add an early exit when no write is needed (e.g. atomic max: stop if `expected >= v`).
- Progress: a CAS loop is **lock-free** (some thread always succeeds) but **not wait-free** (one unlucky thread can retry indefinitely). See topic 08.
- Prefer a dedicated RMW (`fetch_add`, `fetch_or`, `exchange`) when one exists: no retry, and on x86 `fetch_add` is a single `lock xadd`.

#### 6. Lock-freedom of atomics
- `std::atomic<T>` is allowed to use a lock internally. The only type **guaranteed** lock-free is `std::atomic_flag`.
- Queries:

| API | When evaluated | Meaning |
|---|---|---|
| `a.is_lock_free()` | runtime | this object's operations are lock-free |
| `std::atomic<T>::is_always_lock_free` | compile time (C++17) | lock-free on every execution of this program |
| `ATOMIC_INT_LOCK_FREE` etc. | preprocessor | 0 never, 1 sometimes, 2 always |

- There is no standard `is_atomic_lock_free()` function.
- Typical x86-64 / GCC behaviour (not guaranteed by the standard):
  - 1, 2, 4, 8-byte trivially copyable types: lock-free.
  - 16-byte types: `is_lock_free()` reports `false` with GCC (the operations go through `libatomic`, and you must link `-latomic`), even though the CPU has `cmpxchg16b`.
  - Larger types: a lock from a hashed lock table inside `libatomic`.
- Consequence: an "algorithm made only of atomics" is not lock-free if one of those atomics is not lock-free.
- Lock-free atomics are also **address-free**, which is why only they are safe to use across processes in shared memory.

#### 7. Special atomic types
- **`std::atomic_flag`:** a boolean flag, guaranteed lock-free.
  - Pre-C++20: only `test_and_set()` and `clear()`, initialize with `ATOMIC_FLAG_INIT`.
  - C++20: default constructs to clear, adds `test()`, `wait()`, `notify_one()`, `notify_all()`.
  - Classic use: the building block of a spinlock.
- **`std::atomic<std::shared_ptr<T>>` (C++20, in `<memory>`):**
  - Solves: one `shared_ptr` *object* being read by one thread and reassigned by another. With a plain `shared_ptr` that is a data race even though the reference count is thread-safe.
  - Replaces the C++11 free functions `std::atomic_load(&sp)` / `std::atomic_store(&sp, ...)`, deprecated in C++20.
  - Not required to be lock-free; mainstream implementations (libstdc++ from GCC 12, MSVC) use an internal spin lock, so `is_lock_free()` is `false`.
  - Typical use: read-mostly configuration snapshot (readers `load()` a `shared_ptr<const Config>`, a writer `store()`s a new one).
- **`std::atomic_ref<T>` (C++20):** atomic operations on an existing non-atomic object (must satisfy `atomic_ref<T>::required_alignment`). While any `atomic_ref` to it exists, all accesses must go through `atomic_ref`.
- **`wait` / `notify` (C++20):** `x.wait(old)` blocks until the value is observed to differ from `old` (on Linux typically a futex for 4-byte types). Avoids hand-written spin loops and condition variables for simple flags.

#### 8. What it costs: the hardware view (typical x86-64)
- Real GCC 11 `-O2` codegen for `std::atomic<int> x` with default `seq_cst`:

| C++ | x86-64 instruction | Notes |
|---|---|---|
| `x.load()` | `mov` | plain load; x86 loads already have acquire semantics |
| `x.store(v)` | `xchg` | seq_cst store needs a full barrier; `xchg` with memory is implicitly locked |
| `x.store(v, release)` | `mov` | cheap |
| `x.fetch_add(1)` | `lock xadd` | |
| `x.fetch_add(1)` (result unused) | `lock add` | |
| `x.fetch_or(m)` (result used) | `lock cmpxchg` loop | no single x86 instruction returns the old value of an OR |
| `x.exchange(v)` | `xchg` | |
| `x.compare_exchange_*` | `lock cmpxchg` | weak and strong identical |

- The `lock` prefix makes the RMW atomic by holding the **cache line** in the Modified/Exclusive state for the duration (cache locking). It does not lock the bus or RAM for normal aligned operations, and does not stop other cores.
- Every RMW (and every store) needs **exclusive ownership of the cache line** (a read-for-ownership). If another core owns it, the line must be transferred and other copies invalidated.
- Typical costs (order of magnitude, vary by CPU):
  - Uncontended locked RMW on a line already owned: roughly 10 to 20+ cycles, plus it acts as a full barrier that drains the store buffer.
  - Contended: the line ping-pongs between cores; each transfer costs tens of ns on one socket and more across sockets. Throughput of a single hot counter can **drop** as you add threads.
- Loads of a line that nobody writes are cheap: every core keeps a Shared copy. **Writes** are what scale badly.
- False sharing: two *independent* hot variables (atomic or not) in the same 64-byte line cause the same ping-pong. Fix with `alignas(64)` (or `std::hardware_destructive_interference_size`) or per-thread counters.
- ❌ Do not define atomics as "flush the store buffer" or "works because of MESI". Those are mechanisms one implementation may use; the C++ guarantee is the contract in section 1.

#### 9. Atomic or mutex?
| Use an atomic when | Use a mutex when |
|---|---|
| The shared state is **one** independent value | An **invariant spans several variables** (balance and active flag, head and size) |
| The update is a single RMW (`fetch_add`, `exchange`) or a short CAS loop | The critical section is several steps or complex logic |
| You need a flag, counter, sequence number, pointer swap | Correctness with atomics would need a clever lock-free algorithm |
| Readers vastly outnumber writers on a small value | You need to block waiting threads instead of burning CPU |

- An uncontended `std::mutex` on Linux is also cheap: lock is one atomic CAS in user space, unlock is one atomic RMW; the kernel (futex) is entered **only under contention**.
- Under heavy contention both suffer from cache-line transfer; atomics just avoid sleeping. A hot CAS loop can burn more CPU than a mutex that puts waiters to sleep.
- Strong answer pattern: pick by **what must be protected** (one value vs an invariant), then measure.

#### 10. Misconceptions to unlearn
- ❌ "Another core cannot load the atomic into a register while I modify it." ✅ It can; a loaded copy is a private snapshot. Atomicity is about operations on the atomic object, not about blocking readers.
- ❌ "Atomic means the store buffer is flushed." ✅ Not a C++ guarantee; some orders on some CPUs emit a fence, a `relaxed` store on x86 is a plain `mov`.
- ❌ "`std::atomic` works because MESI makes the line exclusive." ✅ The implementation may use coherence plus locked instructions to satisfy the C++ contract; the contract is atomicity plus modification order plus ordering.
- ❌ "Only `load` and `store` of an atomic are atomic; `++counter` is not." ✅ `++`, `--`, `+=`, `fetch_*`, `exchange`, CAS are all atomic RMWs.
- ❌ "`counter = counter + 4` is atomic because `counter` is atomic." ✅ It is a load plus a store: no data race, but lost updates.
- ❌ "`load(); +1; store();` loses updates because the local variable is not atomic." ✅ The local is thread-private and fine; the gap between the two atomic operations is the problem.
- ❌ "`relaxed` atomics can tear." ✅ Atomicity does not depend on memory order. `relaxed` only drops ordering/synchronization of other memory.
- ❌ "Relaxed load guarantees I see the store from the other thread." ✅ No synchronization is created; it will eventually observe it, but nothing about other data is published (topic 06).
- ❌ "On failure CAS leaves `expected` alone." ✅ It overwrites `expected` with the current value.
- ❌ "`weak` is faster than `strong`." ✅ Identical on x86; can be cheaper on LL/SC CPUs. Choose by whether you already loop.
- ❌ "A CAS loop is wait-free." ✅ It is lock-free; one thread can starve.
- ❌ "Atomics are generally lock-free, `is_atomic_lock_free()` tells you." ✅ Only `atomic_flag` is guaranteed; use `is_lock_free()` / `is_always_lock_free`.
- ❌ "Atomic is always faster than a mutex, and a mutex always enters the kernel." ✅ Uncontended mutexes stay in user space; contended atomics bounce cache lines.
- ❌ "It is only a `bool`, the CPU writes it atomically, so no `atomic` needed." ✅ Concurrent plain read and write is a data race (UB); the compiler may hoist the load out of the loop and spin forever.
- ❌ "Atomics cause false sharing." ✅ False sharing comes from independent hot variables sharing a cache line; atomics just make it more visible.
- ❌ "`std::atomic` is an application-level construct." ✅ It is a language/library abstraction implemented with compiler and hardware support.

### EDGE_CASES: Traps and Misconceptions

#### Edge Case 1: `x = x + 1` is not `x += 1`
- People assume: "`x` is atomic, so any expression on it is atomic."
- What happens: `x = x + 1` calls `load()`, adds in a register, then `store()`. Two threads can both load 5 and both store 6.
- Not undefined behaviour (each access is atomic), but a **logic bug: lost updates**.
- `x += 1`, `++x`, `x.fetch_add(1)` are each one RMW and never lose increments.
```cpp
#include <atomic>
std::atomic<int> x{0};
void bad()  { x = x + 1; }        // load, add, store: can lose updates
void good() { x += 1; }           // one atomic RMW (lock add on x86)
int main() { bad(); good(); return x.load() == 2 ? 0 : 1; }
```

#### Edge Case 2: A plain `bool` stop flag can spin forever
- People assume: "A `bool` write is atomic on every CPU, so the worker will see `false` after an iteration or two."
- What happens: concurrent unsynchronized read and write of a plain `bool` is a **data race, undefined behaviour**. The optimizer may assume no other thread changes it and read it **once**.
- Verified: the program below with GCC 11 `-O2` hangs forever (killed by `timeout`); at `-O0` it stops, and ThreadSanitizer reports `data race`. Behaviour that changes with the optimization level is the classic signature of UB.
```cpp
#include <chrono>
#include <iostream>
#include <thread>
bool running = true;          // BUG: should be std::atomic<bool>
long work = 0;
int main() {
    std::thread t([] { while (running) { ++work; } });
    std::this_thread::sleep_for(std::chrono::milliseconds(100));
    running = false;
    t.join();                 // at -O2: never returns
    std::cout << "stopped\n";
}
```
- Fix: `std::atomic<bool> running{true};`. For a pure stop flag that publishes no other data, `relaxed` load/store is enough (topic 06).
- `volatile bool` "works" on some compilers by accident but is still a data race in C++.

#### Edge Case 3: CAS overwrites `expected` on failure
- People assume: `expected` still holds "my original value" after the call.
- What happens: on failure it holds the **current** value of the atomic. Reusing it as "the old value" in later logic (logging, a second CAS, a rollback) silently uses the wrong number.
- In a loop this is a feature (the next attempt starts from fresh data). Outside a loop it is a trap.
```cpp
#include <atomic>
#include <iostream>
int main() {
    std::atomic<int> v{15};
    int expected = 10;
    bool ok = v.compare_exchange_strong(expected, 20);
    std::cout << ok << ' ' << v << ' ' << expected << '\n';   // 0 15 15
}
```

#### Edge Case 4: CAS compares bits, not `operator==`
- People assume: CAS uses `==`.
- What happens: comparison is on the value representation (like `memcmp`).
  - `std::atomic<double>` holding `-0.0`, expected `0.0`: `0.0 == -0.0` is true, but the CAS **fails** and `expected` becomes `-0.0`.
  - A NaN loaded from the atomic **matches** in CAS although `NaN == NaN` is false.
  - Structs with padding: C++20 excludes padding bits; pre-C++20 implementations could fail repeatedly because of uninitialized padding.
- See Code Example 2, line 4 of its output: `ok=0 d=-0 expected=-0`.

#### Edge Case 5: `std::atomic<BigStruct>` compiles but may hide a lock
- People assume: wrapping anything in `std::atomic` gives fast lock-free access.
- What happens:
  - Non-trivially-copyable `T` (e.g. `std::string`, `std::vector`): compile error from a `static_assert`. (`std::shared_ptr` works only through its dedicated C++20 specialization.)
  - Trivially copyable but large `T`: compiles, but uses a lock inside `libatomic`; with GCC you may also get a **link error** (`undefined reference to __atomic_load`/`__atomic_is_lock_free`) until you add `-latomic`.
  - 16-byte types on x86-64 with GCC: `is_lock_free()` returns `false`.
- Check with `static_assert(std::atomic<T>::is_always_lock_free);` when your design depends on it.

#### Edge Case 6: Two atomics do not make one invariant atomic
- People assume: "Every variable is atomic, so the function is thread-safe."
- What happens: check-then-act across separate atomics (or even across two operations on one atomic) has a window:
```cpp
#include <atomic>
std::atomic<int> balance{100};
std::atomic<bool> active{true};
bool withdraw(int amt) {
    if (active.load() && balance.load() >= amt) {  // check
        balance -= amt;                              // act: another thread may have withdrawn in between
        return true;
    }
    return false;
}
int main() { return withdraw(50) ? 0 : 1; }
```
- Two threads can both pass the check with `balance == 100` and withdraw 80 each: balance becomes -60.
- Fixes: a mutex around the whole invariant, or a single CAS loop on `balance` that re-checks `expected >= amt` on each attempt (only works when the invariant lives in **one** atomic word).

#### Edge Case 7: A loaded value is stale immediately
- People assume: `if (x.load() == 0) x.store(1);` means "set to 1 only if it was 0".
- What happens: the load is a snapshot; another thread can store between the load and the store. Both threads can "win".
- Fix: `int e = 0; x.compare_exchange_strong(e, 1);` makes the test and the set one atomic step.
- Same reason `if (!q.empty()) q.pop();` is broken on concurrent containers.

#### Edge Case 8: `volatile` is not `atomic`
- People assume: `volatile` makes a variable thread-safe (it does in Java/C#).
- What happens in C++: `volatile` only forbids the compiler from removing or merging accesses (meant for memory-mapped I/O and signal handlers with `volatile sig_atomic_t`).
  - No atomicity of `++` (still load, add, store).
  - No inter-thread ordering.
  - Concurrent access is still a data race (UB).
- Use `std::atomic` for inter-thread communication. `volatile std::atomic<T>` exists but is almost never what you want.

### CODE_EXAMPLES: Practical Demonstrations

#### Example 1: Lost updates vs atomic RMW
- `load` + `store` loses increments (without UB), `fetch_add` never does.
```cpp
#include <atomic>
#include <iostream>
#include <thread>
#include <vector>

int main() {
    constexpr int kThreads = 4, kIters = 200000;
    std::atomic<int> rmw{0};
    std::atomic<int> split{0};

    std::vector<std::thread> ts;
    for (int t = 0; t < kThreads; ++t) {
        ts.emplace_back([&] {
            for (int i = 0; i < kIters; ++i) {
                rmw.fetch_add(1);              // one atomic read-modify-write
                int v = split.load();          // atomic load
                split.store(v + 1);            // atomic store: gap in between
            }
        });
    }
    for (auto& t : ts) t.join();

    std::cout << "fetch_add:    " << rmw.load() << '\n';
    std::cout << "load + store: " << split.load()
              << (split.load() < kThreads * kIters ? " (updates lost)" : "") << '\n';
}
```
- `fetch_add:` always prints `800000`.
- `load + store:` prints a smaller, run-dependent number (a typical run printed around half). No sanitizer reports a data race: it is a **race condition** (logic bug), not a **data race** (UB).

#### Example 2: CAS semantics step by step
- Shows the return value, the effect on the atomic, and what happens to `expected`.
```cpp
#include <atomic>
#include <iostream>

int main() {
    std::atomic<int> v{10};

    int expected = 10;
    bool ok = v.compare_exchange_strong(expected, 20);
    std::cout << "1: ok=" << ok << " v=" << v << " expected=" << expected << '\n';

    expected = 10;                               // stale expectation
    ok = v.compare_exchange_strong(expected, 30);
    std::cout << "2: ok=" << ok << " v=" << v << " expected=" << expected << '\n';

    ok = v.compare_exchange_strong(expected, 30); // retry with refreshed expected
    std::cout << "3: ok=" << ok << " v=" << v << " expected=" << expected << '\n';

    std::atomic<double> d{-0.0};
    double de = 0.0;                             // 0.0 == -0.0, but bits differ
    ok = d.compare_exchange_strong(de, 1.0);
    std::cout << "4: ok=" << ok << " d=" << d << " expected=" << de << '\n';
}
```
- Output:
```text
1: ok=1 v=20 expected=10
2: ok=0 v=20 expected=20
3: ok=1 v=30 expected=20
4: ok=0 d=-0 expected=-0
```
- Line 2 is the key interview fact: failure writes the current value (20) into `expected`.
- Line 4: bitwise comparison, `+0.0` does not match `-0.0`.

#### Example 3: CAS loops for operations without a dedicated RMW
- Atomic maximum (C++26 adds `fetch_max`) and a saturating increment.
```cpp
#include <atomic>
#include <iostream>
#include <thread>
#include <vector>

// Returns the previous value. Early exit: no write if v is not larger.
int fetch_max(std::atomic<int>& a, int v) {
    int expected = a.load();
    while (expected < v && !a.compare_exchange_weak(expected, v)) {
        // expected refreshed by the failed CAS; condition re-checked
    }
    return expected;
}

// Increment but never exceed limit. Returns true if incremented.
bool inc_saturating(std::atomic<int>& a, int limit) {
    int expected = a.load();
    do {
        if (expected >= limit) return false;    // decide using the fresh value
    } while (!a.compare_exchange_weak(expected, expected + 1));
    return true;
}

int main() {
    std::atomic<int> best{0}, tickets{0};
    std::atomic<int> granted{0};
    std::vector<std::thread> ts;
    for (int t = 0; t < 8; ++t) {
        ts.emplace_back([&, t] {
            for (int i = 0; i < 1000; ++i) {
                fetch_max(best, t * 1000 + i);
                if (inc_saturating(tickets, 5000)) granted.fetch_add(1);
            }
        });
    }
    for (auto& th : ts) th.join();
    std::cout << "max=" << best << " tickets=" << tickets
              << " granted=" << granted << '\n';
}
```
- Output (deterministic): `max=7999 tickets=5000 granted=5000`.
- The saturating version decides **inside** the loop, on each refreshed `expected`. Checking the limit once before the loop would allow overshoot.

#### Example 4: Asking whether atomics are lock-free
- Compile-time and runtime queries; results shown are GCC 11 on x86-64.
```cpp
#include <atomic>
#include <iostream>

struct Pair  { int a, b; };          // 8 bytes
struct Big   { long a, b, c; };      // 24 bytes

int main() {
    std::cout << std::boolalpha
              << "atomic<int>     always lock-free: " << std::atomic<int>::is_always_lock_free << '\n'
              << "atomic<Pair>    always lock-free: " << std::atomic<Pair>::is_always_lock_free << '\n'
              << "atomic<Big>     always lock-free: " << std::atomic<Big>::is_always_lock_free << '\n'
              << "ATOMIC_INT_LOCK_FREE:             " << ATOMIC_INT_LOCK_FREE << '\n';
    std::atomic_flag f;              // C++20: starts clear; the only guaranteed lock-free type
    std::cout << "flag initially set: " << f.test() << '\n';
    static_assert(std::atomic<int>::is_always_lock_free, "design assumes lock-free int");
}
```
- Output on x86-64 GCC 11:
```text
atomic<int>     always lock-free: true
atomic<Pair>    always lock-free: true
atomic<Big>     always lock-free: false
ATOMIC_INT_LOCK_FREE:             2
flag initially set: false
```
- `is_always_lock_free` is a `constexpr` member, so it needs no `libatomic`. Calling `is_lock_free()` or doing operations on `atomic<Big>` requires linking `-latomic` with GCC.

#### Example 5: `atomic_flag` spinlock and C++20 `wait`/`notify`
- Minimal spinlock built on the guaranteed lock-free type, plus a one-shot "go" signal using `wait` instead of busy spinning.
```cpp
#include <atomic>
#include <iostream>
#include <thread>
#include <vector>

class SpinLock {
    std::atomic_flag f_;                         // C++20: default-constructed clear
public:
    void lock()   { while (f_.test_and_set()) { while (f_.test()) { /* spin on reads */ } } }
    void unlock() { f_.clear(); }
};

int main() {
    SpinLock sl;
    long shared = 0;                             // protected by sl
    std::atomic<bool> go{false};

    std::vector<std::thread> ts;
    for (int t = 0; t < 4; ++t) {
        ts.emplace_back([&] {
            go.wait(false);                      // blocks (no spinning) until go != false
            for (int i = 0; i < 100000; ++i) {
                sl.lock();
                ++shared;
                sl.unlock();
            }
        });
    }
    go.store(true);
    go.notify_all();
    for (auto& t : ts) t.join();
    std::cout << shared << '\n';
}
```
- Output: `400000`.
- `lock()` is test-and-test-and-set: it retries the RMW only when a plain read says the flag is clear, so waiting cores share the cache line instead of fighting over ownership.
- Production spinlocks also add a CPU pause hint and back-off, and should use acquire/release orders (topic 06).

#### Example 6: The cost of one hot atomic vs sharded counters
- Same total work: all threads hammer one `fetch_add`, versus each thread on its own cache-line-aligned counter.
```cpp
#include <atomic>
#include <chrono>
#include <iostream>
#include <thread>
#include <vector>

struct alignas(64) Padded { std::atomic<long> v{0}; };

template <class F>
double time_ms(F f) {
    auto t0 = std::chrono::steady_clock::now();
    f();
    return std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - t0).count();
}

int main() {
    constexpr int kThreads = 4;
    constexpr long kIters = 2'000'000;

    std::atomic<long> hot{0};
    double shared_ms = time_ms([&] {
        std::vector<std::thread> ts;
        for (int t = 0; t < kThreads; ++t)
            ts.emplace_back([&] { for (long i = 0; i < kIters; ++i) hot.fetch_add(1); });
        for (auto& t : ts) t.join();
    });

    std::vector<Padded> shards(kThreads);
    double sharded_ms = time_ms([&] {
        std::vector<std::thread> ts;
        for (int t = 0; t < kThreads; ++t)
            ts.emplace_back([&, t] { for (long i = 0; i < kIters; ++i) shards[t].v.fetch_add(1); });
        for (auto& t : ts) t.join();
    });

    long total = 0;
    for (auto& s : shards) total += s.v.load();
    std::cout << "one hot counter: " << hot.load() << " in " << shared_ms << " ms\n"
              << "sharded:         " << total << " in " << sharded_ms << " ms\n";
}
```
- Both counts are `8000000`. Timings vary by machine; on a typical multicore x86 the hot counter is several times slower because the cache line migrates between cores on every increment.
- Lesson: atomics are not contention-free. Remove sharing first (per-thread counters, batching), then reach for atomics.

#### Example 7: `strong` for a one-shot claim
- Exactly one thread must perform initialization; there is no retry loop, so a spurious failure would be a bug.
```cpp
#include <atomic>
#include <iostream>
#include <thread>
#include <vector>

std::atomic<int> state{0};          // 0 = idle, 1 = claimed
std::atomic<int> winners{0};

void try_init() {
    int expected = 0;
    if (state.compare_exchange_strong(expected, 1)) {   // weak could fail spuriously: nobody would init
        winners.fetch_add(1);
    }
}

int main() {
    std::vector<std::thread> ts;
    for (int i = 0; i < 8; ++i) ts.emplace_back(try_init);
    for (auto& t : ts) t.join();
    std::cout << "winners=" << winners << '\n';
}
```
- Output: `winners=1`.
- With `compare_exchange_weak` and no loop, on an LL/SC machine it is possible that **every** thread fails (spuriously or genuinely) and nobody initializes. (`std::call_once` is the library answer when the initializer itself must complete before others proceed.)

### QUICK_REFERENCE: Cheat Sheet

#### Atomic vs non-atomic expressions on `std::atomic<int> x`
| Expression | One atomic RMW? | Lost updates possible? | Data race? |
|---|---|---|---|
| `++x`, `x++`, `x += 4` | ✅ | No | No |
| `x.fetch_add(4)` | ✅ | No | No |
| `x = x + 4` | ❌ load + store | Yes | No |
| `int v = x.load(); x.store(v + 4);` | ❌ | Yes | No |
| same on plain `int` | ❌ | Yes | **Yes (UB)** |

#### CAS in one table
| Situation | Return | Atomic after | `expected` after |
|---|---|---|---|
| current == expected | `true` | `desired` | unchanged |
| current != expected | `false` | unchanged | **current value** |
| weak, spurious failure | `false` | unchanged | current value (equal to old expected) |

#### weak vs strong
| | `compare_exchange_weak` | `compare_exchange_strong` |
|---|---|---|
| Spurious failure | allowed | never |
| Use | inside a retry loop | one-shot decision, or expensive retry |
| x86-64 | `lock cmpxchg` | same `lock cmpxchg` |
| LL/SC (ARM w/o LSE, POWER, RISC-V) | one LL/SC attempt | internal loop |

#### Lock-free queries
| API | Notes |
|---|---|
| `a.is_lock_free()` | runtime, per object |
| `std::atomic<T>::is_always_lock_free` | `constexpr`, C++17 |
| `ATOMIC_xxx_LOCK_FREE` | 0 / 1 / 2 |
| `std::atomic_flag` | the only type guaranteed lock-free |

#### Cost model (typical x86-64)
| Operation | Rough cost |
|---|---|
| load of a line shared by all readers | cheap, scales |
| uncontended `lock` RMW | ~10 to 20+ cycles, full barrier |
| contended RMW on one line | cache-line transfer per op; tens to hundreds of ns; throughput can fall as threads increase |
| seq_cst store | `xchg` (locked) |
| release store / relaxed store | plain `mov` |

#### Interview one-liners
| Question | One-liner |
|---|---|
| What does `std::atomic` guarantee? | Indivisible operations on one object, no data race, one modification order; ordering is a separate knob. |
| Is `++atomic` atomic? | Yes, it is an atomic RMW; `x = x + 1` is not. |
| Why does `load`/`store` increment fail? | The gap between two atomic operations, not the local variable. |
| What does CAS do on failure? | Returns false and writes the current value into `expected`. |
| weak vs strong? | Weak may fail spuriously; use it in loops. Strong for one-shot decisions. |
| Why the CAS loop? | Competing writers plus spurious failure; recompute `desired` each time. |
| Is a CAS loop wait-free? | No, lock-free: someone succeeds, a given thread may starve. |
| Is `std::atomic<T>` lock-free? | Not guaranteed; check `is_always_lock_free`; only `atomic_flag` is guaranteed. |
| Does atomic flush the store buffer? | Not a C++ concept; hardware mechanism varies by order and CPU. |
| Atomic or mutex? | Atomic for one independent value, mutex for multi-variable invariants; measure. |
| Can relaxed tear? | No; memory order never affects atomicity. |
| Why atomic for a bool flag? | Plain concurrent access is a data race (UB); compiler may hoist the load. |
| Why do atomics scale badly? | Every write needs exclusive cache-line ownership; the line ping-pongs. |
| `atomic<shared_ptr>`? | C++20, atomic replace/read of one `shared_ptr` object; usually not lock-free. |
