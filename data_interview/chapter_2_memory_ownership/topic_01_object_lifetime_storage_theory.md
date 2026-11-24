## TOPIC: Object Lifetime and Storage Duration

### THEORY_SECTION: Core Concepts

#### 1. Mental model
- Keep four ideas apart; interviewers probe exactly where people blur them:
  - **Storage**: a region of memory that can hold an object (stack slot, heap block, static data, a `std::byte` buffer).
  - **Storage duration**: the rule that says how long the *storage* stays reserved (automatic, static, thread, dynamic).
  - **Lifetime**: the period during which the *object* exists: it starts when initialization completes and ends when its destructor starts (or the storage is released or reused).
  - **Scope**: a compile-time property of a *name* (where it can be used). A `static` local has block scope but program-long lifetime.
- Storage can outlive the object: after `std::optional::reset()`, `std::vector::pop_back()` or an explicit destructor call, the bytes are still there but the object is gone. Using it is undefined behaviour even if the memory "still has the right value".
- A moved-from object is still **alive** (valid but unspecified state, topic 03). A destroyed object is **dead**. Moving does not end lifetime; destruction does.
- Precise vocabulary to use in an interview:
  - "The object's lifetime ended" (destructor ran).
  - "The storage was deallocated" (memory returned to the allocator).
  - "The resource was released" (file closed, heap buffer freed by the owner).
- Every dangling reference, pointer, view or iterator bug is the same bug: a non-owning handle used after the lifetime of the object it refers to ended.

#### 2. The four storage durations
| Storage duration | Declared by | Storage obtained | Storage released | Typical implementation |
|---|---|---|---|---|
| Automatic | Block-scope variable without `static`/`thread_local`/`extern`, parameters | On entry to the block (frame setup) | On exit from the block | Stack slot or register |
| Static | Namespace scope variables, `static` locals, `static` data members | Program start | Program end | `.data` / `.bss` / `.rodata` |
| Thread | `thread_local` | Thread start | Thread end | Per-thread TLS block |
| Dynamic | `new` expression, allocation functions | `operator new` / allocator call | `operator delete` | Heap (free store) |

- Sub-objects (members, base classes, array elements) have the storage duration of the complete object that contains them.
- Temporaries are not a storage duration: a temporary lives until the end of the **full-expression** that created it, unless its lifetime is extended (section 5).
- `int* p = new int(5);` involves two storage durations: `p` itself is automatic, `*p` is dynamic. When `p` goes out of scope the `int` is leaked, not destroyed.
- `std::unique_ptr<int> up = std::make_unique<int>(9);`: the `unique_ptr` object is automatic, the owned `int` is dynamic; the owner's destructor ends the pointee's lifetime (topic 06).

#### 3. Where things typically live (process layout)
- The C++ standard defines storage durations, not segments. The layout below is the usual Linux/ELF picture and is implementation behaviour.
```
High addresses
+------------------------------+
| stack (main thread)          |  locals, parameters, return addresses; grows down
| ... thread stacks, mmap,     |  each std::thread gets its own stack (mmap'd)
|     shared libraries, TLS    |  static TLS blocks, large malloc blocks
| heap (brk)                   |  small new/malloc; grows up
| .bss                         |  zero-initialized statics: no bytes in the file
| .data                        |  statics with a non-zero initial value
| .rodata                      |  string literals, many const globals
| .text                        |  machine code
+------------------------------+
Low addresses
```

| Declaration | Storage duration | Typical area |
|---|---|---|
| `int g = 10;` (namespace scope) | Static | `.data` |
| `int g;` (namespace scope) | Static | `.bss` (zero-initialized) |
| `static int s = 10;` (in a function) | Static | `.data` |
| `const int c = 20;` (namespace scope) | Static | `.rodata` or folded away |
| `"hello"` | Static | `.rodata` |
| `int x = 40;` (local) | Automatic | Stack, or only a register |
| `volatile int v = 70;` (local) | Automatic | Stack (`volatile` does not change storage) |
| `new int(80)` | Dynamic | Heap |
| `thread_local int t = 30;` | Thread | Per-thread TLS block |
| function bodies | n/a | `.text` |

- "Local = stack" and "new = heap" are implementation mental models, not guarantees:
  - A local may live only in a register, or be optimized away entirely.
  - Since C++14 the compiler may elide or merge `new`/`delete` pairs (allocation elision), so a `make_unique` may never reach `malloc`.
- Implementation numbers worth knowing (Linux, glibc): main thread stack 8 MB by default (`ulimit -s`), `std::thread` stacks 8 MB of reserved virtual memory each, large `malloc` requests (128 KiB and up by default) go to `mmap` rather than the brk heap.

#### 4. When lifetime starts and ends
- **Starts**: when storage is obtained **and** initialization is complete. For a class with a constructor, the object is not "alive" until the constructor finishes. If the constructor throws, the object never existed: its destructor does not run, but fully constructed members and bases are destroyed (topic 05).
- **Ends**:
  - For a class type with a non-trivial destructor: when the destructor call **starts**.
  - Otherwise: when the storage is released or reused.
- During construction and destruction the object is partly alive: members are constructed in declaration order and destroyed in reverse order; virtual calls inside constructors and destructors do not dispatch to more derived classes.
- After lifetime ends, using the object through any old pointer, reference, view or iterator is UB, even if:
  - the memory was not freed (`optional::reset`, `pop_back`, explicit destructor call), or
  - the bytes still contain the old value (very common: the bug "works" in tests).
- Reusing storage with placement new and the rules for pointers to the old object (`std::launder`) are topic 10.

#### 5. Temporaries and lifetime extension
- A temporary is destroyed at the end of the full-expression (roughly: at the `;`), in reverse order of creation.
- **Lifetime extension**: binding a temporary (a prvalue, possibly through member access) **directly** to a `const T&` or `T&&` local reference extends the temporary's lifetime to the lifetime of the reference.
- It works through:
  - Plain binding: `const std::string& r = make_string();`
  - Member access on a prvalue: `const auto& levels = make_book().levels;` (the whole `Book` temporary is extended).
  - A conditional of two prvalues: `const T& r = c ? T(1) : T(2);`
  - Brace aggregate initialization of a reference member: `RefAgg a{T(7)};`
  - Array subscript on an array prvalue, casts that preserve the object (`static_cast<const T&>(T{})`).
- It does **not** work (verified with a tracing type, GCC 11):

| Code | Temporary destroyed | Result |
|---|---|---|
| `const T& r = id(T(4));` (function returning its `const T&` argument) | End of full-expression | Dangling |
| `T&& r = std::move(T(5));` | End of full-expression | Dangling: `std::move` returns a reference, not a prvalue |
| `const T& r = T(6).self();` (member returning `*this`) | End of full-expression | Dangling |
| `const std::string& r = get();` where `get` does `return create();` | Inside `get`, at the end of its `return` statement | Dangling (C++26 P2748: ill-formed) |
| `RefAgg a(T(8));` (C++20 parenthesized aggregate init) | End of full-expression | Dangling (brace form extends) |
| `new RefAgg{T(9)}` | End of full-expression | Dangling member |
| `H() : r(T{1}) {}` (reference member in mem-initializer) | When the constructor exits | Ill-formed since C++14; GCC 11 only warns (`-Wextra`), Clang errors |
| `std::string_view sv = std::string("abc");` | End of full-expression | Dangling: a view is not a reference |
| `for (int x : make_book().get())` (before C++23) | Before the loop body runs | Dangling (section 6) |

- Rule: extension only happens when the reference is bound to the temporary itself (or a sub-object of it) in the same declaration. It never passes through a function call that returns a reference, because the compiler cannot know what that reference refers to.
- Extension applies to the reference's lifetime: extending a temporary into a `static const T&` gives it static lifetime; into a function parameter it lasts only until the end of the call's full-expression.

#### 6. The range-for temporary trap and the C++23 fix
- `for (auto x : range-init) body` expands to roughly:
```cpp
{
    auto&& __range = range-init;          // only THIS binding gets lifetime extension
    auto __begin = __range.begin();
    auto __end = __range.end();
    for (; __begin != __end; ++__begin) { auto x = *__begin; body }
}
```
- `for (int x : load_book().levels)` is fine: `__range` binds to a member of the prvalue, so the whole temporary is extended.
- `for (int x : load_book().get())` where `get()` returns `const std::vector<int>&` dangles: `__range` binds to the reference returned by `get()`, the `Book` temporary dies at the end of the `auto&& __range = ...;` declaration, and the loop iterates freed memory. ASan: `stack-use-after-scope` (or `heap-use-after-free` for heap data).
- Other common forms: `for (char c : get_string().substr(0, 3))` is fine (prvalue), `for (auto& e : std::get<0>(make_tuple_of_vectors()))` dangles, `for (auto& kv : *make_shared_map())` dangles if nothing else owns the map.
- **C++23 (P2718)**: every temporary created in the range-init expression lives until the end of the loop. GCC 15 implements it; GCC 11 (used for the examples here) does not. Code that must build with older compilers still needs the fix: bind the owner to a named variable first, or use the C++20 init-statement `for (auto book = load_book(); int x : book.get())`.

#### 7. Order of construction and destruction
| Context | Construction order | Destruction order |
|---|---|---|
| Local variables in a block | Order of declaration | Reverse, at block exit (also during stack unwinding) |
| Class: bases and members | Virtual bases, then direct bases left to right, then members in **declaration order** | Exact reverse: members bottom-up, then bases |
| Member initializer list | Ignored for ordering (GCC `-Wreorder` warns) | n/a |
| Array elements | Index 0 upward | Highest index first |
| Temporaries in a full-expression | Order of evaluation | Reverse order of creation, at the end of the full-expression |
| Statics in one translation unit | Order of definition | Reverse order of completed construction, after `main` returns or `exit` |
| Function-local `static` | First time control passes the declaration | Reverse order of completed construction, mixed with globals |
| `thread_local` | Before first use in that thread (implementation: lazily on first odr-use for dynamic initialization) | At thread exit (before `join()` returns); the main thread's at `exit`, before statics |

- Consequence of declaration-order member construction: an initializer that reads another member must refer only to members declared **earlier**. Reading a later member reads an indeterminate value (UB for scalars).
- Destruction order is what makes RAII composable: a member that depends on another member must be declared after it, so it is destroyed first (e.g. a worker thread member declared after the queue it uses).
- `std::exit` runs static destructors; `std::quick_exit` and `std::_Exit` do not; `std::abort` and `std::terminate` do not.

#### 8. Static initialization and the static initialization order fiasco
- Statics are initialized in phases:
  1. **Zero-initialization**: all static and thread storage starts as zero (that is why `.bss` costs nothing in the file).
  2. **Constant initialization**: if the initializer is a constant expression, the value is baked into the binary. No code runs, no ordering problem.
  3. **Dynamic initialization**: anything else (calls a non-constexpr function, a constructor that is not constexpr). Runs before `main` in practice.
- Within one translation unit, dynamic initialization follows definition order. Across translation units the order is **unspecified**: in practice it follows link order, which nobody controls deliberately.
- **Static initialization order fiasco (SIOF)**: a static in `a.cpp` whose dynamic initializer reads a static from `b.cpp` that has not been initialized yet; it sees the zero-initialized value (or, for class types, an object whose lifetime has not started: UB).
- Fixes:
  - **Function-local static (Meyers singleton)**: `Config& config() { static Config c = load(); return c; }`. Initialized on first call, so any user triggers it in time.
  - **`constexpr` / `constinit` (C++20)**: guarantees constant initialization, so there is no dynamic phase to order. `constinit` does not imply `const`: the variable can still be modified at run time. If the initializer is not a constant expression, compilation fails ("`constinit` variable does not have a constant initializer").
  - Avoid cross-TU dependencies between globals entirely: pass dependencies explicitly.
- **Destruction order fiasco** (the mirror image): a static's destructor uses another static that was constructed later (so destroyed earlier). Typical: a global object logs in its destructor through a logger singleton that is already gone. Fixes: make the dependency a function-local static accessed during construction (guaranteeing it is constructed first, destroyed last), or intentionally leak it: `static Logger& l = *new Logger;` (never destroyed).
- `std::mutex` has a `constexpr` constructor, so a global mutex is constant-initialized and safe to use from other static initializers.

#### 9. Magic statics (thread-safe function-local statics)
- Since C++11, if several threads reach a function-local static's declaration concurrently, exactly one initializes it; the others block until initialization finishes.
- Implementation (Itanium ABI, GCC/Clang): a guard variable checked with an acquire load on every call (fast path: one load and a branch); the slow path calls `__cxa_guard_acquire`/`__cxa_guard_release`.
- If the initializer throws, the static is not considered initialized; the next caller tries again.
- Recursive initialization (the initializer calls the same function again) is UB; GCC throws `__gnu_cxx::recursive_init_error` or deadlocks.
- Only the **initialization** is thread-safe. Later reads and writes to the object need their own synchronization.
- GCC flag `-fno-threadsafe-statics` removes the guard (only for code that is known to be single-threaded).

#### 10. thread_local: one object per thread
- Each thread has its own instance; `&tls` differs per thread.
- Initialization:
  - Constant initializer: present from thread start (copied from a TLS template image).
  - Dynamic initializer: guaranteed to happen before the first odr-use in that thread. GCC/Clang initialize namespace-scope `thread_local` lazily through a wrapper function, so a thread that never touches it never constructs it.
- Destruction: at thread exit, in reverse order of construction, before the thread's `join()` returns. For the main thread, at `exit`, before static objects are destroyed.
- Cost: access is a segment-register-relative load (`%fs` on x86-64 Linux) for the executable; in shared libraries it may go through `__tls_get_addr`. Dynamic initialization adds a "initialized yet?" check on each access through the wrapper.
- Lifetime trap: a pointer to a `thread_local` handed to another thread dangles after the owning thread exits.
- A `thread_local` inside a function is also implicitly `static` storage-wise (one per thread, not per call).

#### 11. `volatile` is not a storage class and not synchronization
- `volatile` qualifies **accesses**: each read and write of a volatile object is an observable side effect that the compiler must perform and keep in order relative to other volatile accesses.
- It says nothing about **where** the object lives: a `volatile` local is still automatic (typically stack), a `static volatile` is still static storage.
- It does not "force the variable into RAM instead of a register" as a language rule, and it gives **no** atomicity or inter-thread ordering: a data race on a `volatile int` is still UB. Use `std::atomic` for threads.
- Legitimate uses: memory-mapped I/O registers (`*reinterpret_cast<volatile std::uint32_t*>(0x40000000)`: the platform's memory map puts the device there, not `volatile`), signal handlers with `volatile std::sig_atomic_t`, and benchmarks preventing dead-code elimination.
- C++20 deprecated `++`, `--` and compound assignment on volatile objects (`v++`, `v += 1`) because they look atomic but are not; C++23 un-deprecated the bitwise compound forms (`|=`, `&=`, `^=`) used in MMIO code.

#### 12. Misconceptions to unlearn
- ❌ "The temporary returned through a reference is destroyed back in the caller." ✅ A temporary created in a `return` statement of a function returning a reference dies at the end of that `return` statement, inside the callee; the caller receives a dangling reference.
- ❌ "Binding to `const&` always extends lifetime." ✅ Only when binding directly to the prvalue (or its member); not through function calls, `std::move`, views or mem-initializers.
- ❌ "`join()` makes it safe to use a pointer to the thread's local." ✅ The local died when `worker` returned; `join()` only waits for that.
- ❌ "Moving from an object ends its lifetime." ✅ It changes its state; only destruction (`reset`, scope exit, `delete`) ends lifetime.
- ❌ "Static objects are destroyed in declaration order." ✅ Reverse order of completed construction.
- ❌ "Members are initialized in the order of the initializer list." ✅ Declaration order.
- ❌ "`constinit` means `const`." ✅ It only means "statically initialized"; the variable is mutable.
- ❌ "Function-local statics are thread-safe." ✅ Their initialization is; their use is not.
- ❌ "`volatile` puts a variable in RAM / static memory / makes it thread-safe." ✅ None of those.
- ❌ "Local = stack, new = heap, always." ✅ Implementation model: registers, optimized-away locals and elided allocations are allowed.
- ❌ "If the memory still holds the old value, using the object is fine." ✅ Lifetime ended means UB, regardless of the bytes.

### EDGE_CASES: Traps and Misconceptions

#### Edge Case 1: Where exactly does a temporary bound to a returned reference die?
- Code:
```cpp
std::string create() { return "hello"; }
const std::string& get() { return create(); }   // GCC: returning reference to temporary
const std::string& s = get();
std::cout << s;                                  // UB
```
- A common (and AI-generated) explanation says the temporary "is destroyed at the end of the full expression in the caller". That is wrong. The temporary is created by the `return` statement **inside** `get()`; a temporary bound to the returned value of a function is not extended and is destroyed at the end of the `return` statement's full-expression. By the time `get()` returns, the string is already gone.
- Verified with a tracing type: `~T` prints before the caller's next line runs.
- RVO has nothing to do with it: elision decides where `create()`'s result is built, not how long a reference to it is valid.
- GCC warns (`-Wreturn-local-addr`, on by default). C++26 (P2748) makes binding a returned reference to a temporary ill-formed.

#### Edge Case 2: `std::move` on a temporary kills lifetime extension
- `T&& r = T(5);` extends (prints `T5 use ~T5`).
- `T&& r = std::move(T(5));` dangles (prints `T5 ~T5 use`): `std::move` returns `T&&`, the reference is bound to the function's return value, not to the prvalue.
- Same for `const auto& r = std::max(a, b + 1);` when an argument is a temporary: `std::max` returns a reference to one of its arguments.

#### Edge Case 3: `join()` does not resurrect a dead local
- Source puzzle:
```cpp
#include <iostream>
#include <thread>

int* ptr = nullptr;

void worker() {
    int value = 42;
    ptr = &value;              // escapes the address of a local
}

int main() {
    std::thread t(worker);
    t.join();
    std::cout << *ptr << '\n'; // UB: value died when worker returned
}
```
- `value` has automatic storage in the worker thread's frame. `ptr` dangles the moment `worker` returns; the whole thread stack may even be unmapped or reused after the thread exits.
- `join()` only guarantees that the worker finished (and that its writes happen before the code after `join`). It cannot extend any lifetime.
- Observed (GCC 11): plain `-O0` build printed `92`, `-O2` printed `31688`, ASan's default mode printed `0`, and with `ASAN_OPTIONS=detect_stack_use_after_return=1` the read crashed (SEGV). None of the runs printed `42`: the dead frame had been reused or unmapped.
- Fix: make the result outlive the thread: write into a variable owned by `main` (captured by reference, read after `join`), return through `std::promise`/`std::future`, or use a `std::shared_ptr`.

#### Edge Case 4: `string_view` to a temporary string
- `std::string_view getName() { std::string s = build(); return s; }` returns a view into a destroyed local's buffer. The caller "sometimes sees corrupted text later": short strings live inside the dead `std::string` object (SSO), long strings in freed heap memory.
- `std::string_view sv = std::string("abc") + "def";` dangles at the `;`: a view is a class object, not a reference, so no lifetime extension.
- Redesign depends on intent:
  - Ownership needed: return `std::string` (cheap: elision or move, topic 04).
  - Non-owning access: return a view into storage that outlives the call (a member, a static table), and document the lifetime.

#### Edge Case 5: Lifetime vs state: moving out of an optional vs `reset()`
- `std::optional<std::string> o = "AAPL..."; std::string& ref = *o;`
  - `std::string s = std::move(*o);`: `o.has_value()` is still `true`; `ref` is **not** dangling (the contained string is alive), but its content is unspecified (topic 03).
  - `o.reset();`: the contained string's destructor runs; `ref` now dangles even though the optional's internal storage still exists.
- Same distinction for `std::variant` (switching alternative destroys the old one) and `std::vector` (`pop_back`, `clear`, reallocation).

#### Edge Case 6: Range-for over a member of a temporary
- `for (int x : load_book().get())` with `get()` returning `const std::vector<int>&`: the `Book` temporary is destroyed before the first iteration (before C++23). ASan reported `stack-use-after-scope`.
- `for (int x : load_book().levels)` (direct member access) is fine because the member access keeps the whole temporary alive.
- The difference is invisible at the call site, which is why C++23 changed the rule (P2718).

#### Edge Case 7: Member initialization order follows declarations
```cpp
struct Quote {
    int spread;                 // declared first: initialized first
    int bid, ask;
    Quote(int b, int a) : bid(b), ask(a), spread(ask - bid) {}  // reads uninitialized ask, bid
};
```
- The initializer list is written in "logical" order but executed in declaration order: `spread` reads indeterminate `ask` and `bid`. UB; in practice a garbage spread.
- GCC 11 `-Wall` warns twice: `-Wreorder` ("'Quote::ask' will be initialized after 'int Quote::spread'") and `-Wuninitialized` ("'*this.Quote::ask' is used uninitialized"). With more indirection (the read inside a helper function) the second warning disappears. One run printed `-1015157611`.
- Fix: reorder the declarations, or compute from the parameters: `spread(a - b)`.

#### Edge Case 8: Static initialization order across translation units
- `config.cpp`: `int base_port = compute_base_port();` (dynamic initialization).
- `main.cpp`: `extern int base_port; int order_port = base_port + 1;`
- Result depends on link order: `g++ main.cpp config.cpp` gave `order_port = 1` (it read the zero-initialized `base_port`), `g++ config.cpp main.cpp` gave `9001`.
- For `int` this "only" produces wrong values; for class types (a global `std::string`, `std::map`) it uses an object whose lifetime has not started: UB, often a crash before `main`.
- Fix with a function-local static or `constinit`/`constexpr` (Example 4).

#### Edge Case 9: Reference members bound in a constructor
- `struct H { const T& r; H() : r(T{1}) {} };` and `struct D { const T& r = T{2}; };`: the temporary dies when the constructor exits; every later use of `r` is UB.
- Ill-formed since C++14 (CWG 1696). Clang 14: error "reference member 'r' binds to a temporary object whose lifetime would be shorter than the lifetime of the constructed object". GCC 11 accepts it and only warns with `-Wextra` ("a temporary bound to 'H::r' only persists until the constructor exits").
- More common in real code: a class storing `const std::string&` constructed with a string literal or a temporary: `Order o("AAPL");` with `Order(const std::string& s) : sym_(s) {}`. Prefer storing by value.

### CODE_EXAMPLES: Practical Demonstrations

#### Example 1: One object of each storage duration, traced
- Shows when each kind of object is constructed and destroyed.
```cpp
#include <iostream>
#include <memory>
#include <string>
#include <thread>

struct Tracer {
    std::string name;
    explicit Tracer(std::string n) : name(std::move(n)) { std::cout << "  ctor " << name << '\n'; }
    ~Tracer() { std::cout << "  dtor " << name << '\n'; }
};

Tracer global("global (static)");
thread_local Tracer per_thread("thread_local");

Tracer& registry() {
    static Tracer r("function-local static");
    return r;
}

Tracer make(const char* n) { return Tracer(n); }

int main() {
    std::cout << "main begins\n";
    Tracer local("automatic");
    auto heap = std::make_unique<Tracer>("dynamic");
    std::cout << "full-expression with a temporary:\n";
    std::size_t n = make("temporary").name.size();   // temporary dies at this ';'
    std::cout << "  size=" << n << '\n';
    registry();
    std::thread t([] {
        const std::string& n = per_thread.name;       // first use in this thread
        std::cout << "  worker uses " << n << '\n';
    });
    t.join();
    heap.reset();
    std::cout << "main ends\n";
}
```
- Output (GCC 11, Linux):
```
  ctor global (static)
main begins
  ctor automatic
  ctor dynamic
full-expression with a temporary:
  ctor temporary
  dtor temporary
  size=9
  ctor function-local static
  ctor thread_local
  worker uses thread_local
  dtor thread_local
  dtor dynamic
main ends
  dtor automatic
  dtor function-local static
  dtor global (static)
```
- The temporary dies at the `;` of its full-expression: its destructor runs before the next statement prints the size.
- The `thread_local` was constructed only in the worker (first use), and destroyed when the worker exited; the main thread never touched it, so it never constructed one (lazy dynamic TLS initialization in GCC/Clang).
- Statics are destroyed after `main` returns, in reverse order of construction completion: the function-local static (constructed later) goes first.

#### Example 2: Lifetime extension: when it works and when it doesn't
- Each line prints the order of construction (`Tn`), use, and destruction (`~Tn`).
```cpp
#include <iostream>
#include <utility>

struct T {
    int id;
    explicit T(int i) : id(i) { std::cout << "T" << id << ' '; }
    ~T() { std::cout << "~T" << id << ' '; }
    const T& self() const { return *this; }
};
struct Wrap { T t; };
struct RefAgg { const T& r; };
const T& id(const T& x) { return x; }

int main() {
    { std::cout << "plain:     "; const T& r = T(1); std::cout << "use "; (void)r; }
    std::cout << '\n';
    { std::cout << "member:    "; const T& r = Wrap{T(2)}.t; std::cout << "use "; (void)r; }
    std::cout << '\n';
    { std::cout << "ternary:   "; bool c = true;
      const T& r = c ? T(3) : T(30); std::cout << "use "; (void)r; }
    std::cout << '\n';
    { std::cout << "via fn:    "; const T& r = id(T(4)); std::cout << "use "; (void)r; }
    std::cout << '\n';
    { std::cout << "std::move: "; T&& r = std::move(T(5)); std::cout << "use "; (void)r; }
    std::cout << '\n';
    { std::cout << "self():    "; const T& r = T(6).self(); std::cout << "use "; (void)r; }
    std::cout << '\n';
    { std::cout << "agg {}:    "; RefAgg a{T(7)}; std::cout << "use "; (void)a; }
    std::cout << '\n';
    { std::cout << "agg ():    "; RefAgg a(T(8)); std::cout << "use "; (void)a; }
    std::cout << '\n';
}
```
- Output (GCC 11, `-std=c++20`):
```
plain:     T1 use ~T1 
member:    T2 use ~T2 
ternary:   T3 use ~T3 
via fn:    T4 ~T4 use 
std::move: T5 ~T5 use 
self():    T6 ~T6 use 
agg {}:    T7 use ~T7 
agg ():    T8 ~T8 use 
```
- Lines where `~Tn` comes before `use` are dangling references (the `use` here does not read `r`, so the program itself has no UB; reading `r.id` would).
- GCC 11 gave no warning for any of these with `-Wall -Wextra`. GCC 13 added `-Wdangling-reference` for the function-call cases.

#### Example 3: Construction and destruction order inside a class
- Bases first, then members in declaration order regardless of the initializer list; destruction exactly reversed.
```cpp
#include <iostream>

struct Part {
    const char* n;
    explicit Part(const char* s) : n(s) { std::cout << "ctor " << n << '\n'; }
    ~Part() { std::cout << "dtor " << n << '\n'; }
};

struct Base {
    Part b{"Base::part"};
    Base() { std::cout << "Base body\n"; }
    ~Base() { std::cout << "~Base body\n"; }
};

struct Engine : Base {
    Part queue;      // declared first
    Part worker;     // declared second: uses queue, so it must die first
    Engine() : worker("worker"), queue("queue") {   // list order is ignored
        std::cout << "Engine body\n";
    }
    ~Engine() { std::cout << "~Engine body\n"; }
};

int main() {
    Engine e;
    std::cout << "--- leaving main\n";
}
```
- Output (GCC also warns with `-Wall`: "'Engine::worker' will be initialized after 'Part Engine::queue'"):
```
ctor Base::part
Base body
ctor queue
ctor worker
Engine body
--- leaving main
~Engine body
dtor worker
dtor queue
~Base body
dtor Base::part
```
- Practical rule: declare a member after everything it uses. A `std::thread` member that runs a loop over a queue member must be declared after the queue (and joined in the destructor body, which runs before any member is destroyed).

#### Example 4: Static initialization order fiasco across two files, and two fixes
- File `config.cpp`:
```cpp
int compute_base_port() { return 9000; }   // not constexpr: dynamic initialization
int base_port = compute_base_port();
```
- File `main.cpp`:
```cpp
#include <iostream>

extern int base_port;                      // defined in config.cpp
int order_port = base_port + 1;            // dynamic init that reads another TU's static

int compute_base_port();
int& base_port_safe() {                    // fix 1: function-local static
    static int p = compute_base_port();    // initialized on first call
    return p;
}

constexpr int make_port() { return 9000; }
constinit int base_port_ci = make_port();  // fix 2: constant initialization (C++20)
int order_port_safe = base_port_safe() + 1;
int order_port_ci = base_port_ci + 1;

int main() {
    std::cout << "order_port      = " << order_port << '\n';
    std::cout << "order_port_safe = " << order_port_safe << '\n';
    std::cout << "order_port_ci   = " << order_port_ci << '\n';
}
```
- `g++ -std=c++20 main.cpp config.cpp && ./a.out`:
```
order_port      = 1
order_port_safe = 9001
order_port_ci   = 9001
```
- `g++ -std=c++20 config.cpp main.cpp && ./a.out`:
```
order_port      = 9001
order_port_safe = 9001
order_port_ci   = 9001
```
- `order_port` read the zero-initialized `base_port` when `main.cpp` was initialized first. The two fixes do not depend on link order.
- `constinit int x = compute_base_port();` does not compile: "'constinit' variable 'x' does not have a constant initializer".

#### Example 5: Magic statics: one initialization under contention
- Eight threads race to the first call; the constructor runs exactly once and the others wait for it.
```cpp
#include <atomic>
#include <chrono>
#include <iostream>
#include <thread>
#include <vector>

std::atomic<int> constructions{0};

struct RefData {
    int symbols;
    RefData() : symbols(5000) {
        ++constructions;
        std::this_thread::sleep_for(std::chrono::milliseconds(50));   // slow load
    }
};

const RefData& ref_data() {
    static const RefData instance;     // thread-safe initialization since C++11
    return instance;
}

int main() {
    std::vector<std::thread> ts;
    std::atomic<long> sum{0};
    for (int i = 0; i < 8; ++i)
        ts.emplace_back([&] { sum += ref_data().symbols; });
    for (auto& t : ts) t.join();
    std::cout << "constructions=" << constructions << " sum=" << sum << '\n';
}
```
- Output: `constructions=1 sum=40000`. Clean under `-fsanitize=thread`.
- All eight threads saw a fully constructed object: the guard release/acquire publishes the constructor's writes.
- Mutating `instance` later (if it were not `const`) would need its own lock.

#### Example 6: thread_local lifetime per thread
- Each thread gets its own `Session`, constructed at first use in that thread and destroyed at that thread's exit.
```cpp
#include <iostream>
#include <mutex>
#include <string>
#include <thread>

std::mutex out_m;
void say(const std::string& s) { std::lock_guard<std::mutex> g(out_m); std::cout << s << '\n'; }

struct Session {
    std::string owner;
    int requests = 0;
    Session() : owner("t" + std::to_string(next_id++)) { say("open " + owner); }
    ~Session() { say("close " + owner + " after " + std::to_string(requests) + " requests"); }
    static inline int next_id = 1;    // only touched by one thread at a time below
};

thread_local Session session;

void handle(int n) { for (int i = 0; i < n; ++i) ++session.requests; }

int main() {
    std::thread a([] { handle(3); });
    a.join();
    std::thread b([] { handle(5); });
    b.join();
    std::thread c([] { say("thread c never touches session"); });
    c.join();
    say("main exits");
}
```
- Output:
```
open t1
close t1 after 3 requests
open t2
close t2 after 5 requests
thread c never touches session
main exits
```
- Thread `c` and the main thread never use `session`, so no `Session` is created for them (GCC/Clang lazy initialization; the standard only promises "before first odr-use").
- `next_id` is a plain static; it is safe here only because the threads run one after another.

#### Example 7: Range-for over a temporary's member: bug and fixes
```cpp
#include <iostream>
#include <vector>

struct Book {
    std::vector<int> levels{100, 101, 102};
    const std::vector<int>& get() const { return levels; }
};
Book load_book() { return Book{}; }

int main() {
    long a = 0, b = 0, c = 0;
    for (int px : load_book().levels) a += px;        // OK: member of the prvalue
    // for (int px : load_book().get()) ...            // dangling before C++23
    auto book = load_book();                           // fix 1: name the owner
    for (int px : book.get()) b += px;
    for (auto bk = load_book(); int px : bk.get())     // fix 2: C++20 init-statement
        c += px;
    std::cout << a << ' ' << b << ' ' << c << '\n';
}
```
- Output: `303 303 303`.
- With the commented line enabled, ASan (GCC 11, `-std=c++20`) reports `stack-use-after-scope` on the first iteration. Under C++23 P2718 (GCC 15) it is fixed.

### QUICK_REFERENCE: Cheat Sheet

#### Storage durations
| Duration | Begins | Ends | Example |
|---|---|---|---|
| Automatic | Block entry / declaration | Block exit (reverse order) | `int x;` in a function |
| Static | Before `main` (or first pass for locals) | After `main` (reverse order) | global, `static` local |
| Thread | Thread start / first use | Thread exit | `thread_local` |
| Dynamic | `new` | `delete` | `new T` |
| Temporary | Expression evaluation | End of full-expression (unless extended) | `f(T{})` |

#### Lifetime extension
| Binding | Extended? |
|---|---|
| `const T& r = T{};` / `T&& r = T{};` | Yes |
| `const auto& r = make().member;` | Yes (whole object) |
| `const T& r = c ? T{1} : T{2};` | Yes |
| `RefAgg a{T{}};` | Yes |
| `const T& r = f(T{});` (f returns a reference) | No |
| `T&& r = std::move(T{});` | No |
| `std::string_view sv = std::string{};` | No (not a reference) |
| Reference member in mem-initializer | No (ill-formed) |
| Temporary in `return` of a reference-returning function | No (dies inside the callee) |
| `for (x : temp().get())` | No before C++23, yes in C++23 |

#### Order rules
| What | Rule |
|---|---|
| Members | Declaration order; destroyed in reverse |
| Bases vs members | Bases first; destroyed last |
| Locals | Reverse of declaration |
| Statics (one TU) | Definition order; destroyed in reverse of completion |
| Statics (across TUs) | Unspecified (SIOF) |
| Function-local static | First pass through the declaration; thread-safe init |
| `thread_local` | Before first use in each thread; destroyed at thread exit |

#### Tools
| Problem | Tool |
|---|---|
| Dangling reference/view | ASan (`stack-use-after-scope`, `heap-use-after-free`), `-Wdangling-reference` (GCC 13+), Clang `-Wdangling` |
| Returned reference to a local | `-Wreturn-local-addr` (GCC), `-Wreturn-stack-address` (Clang) |
| Thread local escape | `ASAN_OPTIONS=detect_stack_use_after_return=1` |
| Member order | `-Wreorder` (in `-Wall`) |
| SIOF | `constinit`, ASan `check_initialization_order=1` |

#### Interview one-liners
| Question | Answer |
|---|---|
| Lifetime vs storage? | Storage is memory; lifetime is when the object exists in it |
| Four storage durations? | Automatic, static, thread, dynamic |
| When does a temporary die? | End of the full-expression, unless bound directly to a local reference |
| Temp in `return` of `const T& f()`? | Dies inside `f`; caller gets a dangling reference |
| Does `join()` fix `&local` of the thread? | No; the local died when the function returned |
| Move vs reset on optional? | Move: alive, unspecified; reset: destroyed |
| Member init order? | Declaration order |
| Static init order across files? | Unspecified: use function-local statics or `constinit` |
| Are function-local statics thread-safe? | Initialization yes (C++11), use no |
| Where does `volatile` store a variable? | Wherever its storage duration says; `volatile` only affects accesses |
| Range-for over `temp().member_ref()`? | Dangles before C++23 (P2718 fixes) |
