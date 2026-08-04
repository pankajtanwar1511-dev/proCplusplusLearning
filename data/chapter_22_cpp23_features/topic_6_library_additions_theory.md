## TOPIC: C++23 Library Additions - Printing, Diagnostics, and New Containers

### THEORY_SECTION: Printing, Diagnostics, Type-Erased Callables, and New Containers

C++23 rounds out the standard library with a batch of long-requested utilities: a `printf`-simple but `std::format`-safe printing facility, a portable stack-trace type, a move-only type-erased callable, cache-friendly flat associative containers, a standard coroutine generator, a `std::span`-backed stream, and several small-but-sharp convenience functions. None of these are flashy language features — they are the library filling in gaps that programmers had been working around with third-party code (fmt, Boost.Stacktrace, `folly::Function`, Abseil's `flat_hash_map`) for years.

---

#### 1. `std::print` and `std::println` (P2093) - Format-Safe Printing Without the Ceremony

**The problem before C++23:**

```cpp
// printf: fast, terse, but type-UNSAFE
printf("Name: %s, Age: %d\n", name.c_str(), age);
// If you pass a std::string directly instead of .c_str(), or swap %s/%d — undefined behavior.

// std::cout: type-safe, but verbose for anything beyond trivial output
std::cout << "Name: " << name << ", Age: " << age << "\n";

// std::format + std::cout: safe AND expressive, but allocates a std::string just to throw it away
std::cout << std::format("Name: {}, Age: {}\n", name, age);
```

`std::print` (header `<print>`) closes this gap: it reuses `std::format`'s compile-time-checked format string machinery (`std::format_string`, validated at compile time for literal format strings) but writes **directly to a `FILE*`/stream**, avoiding the intermediate `std::string` allocation that `std::cout << std::format(...)` incurs.

```cpp
#include <print>

int main() {
    std::string name = "Ada";
    int age = 36;

    std::print("Name: {}, Age: {}\n", name, age);   // writes to stdout
    std::println("Name: {}, Age: {}", name, age);    // same, but appends '\n' automatically

    std::print(stderr, "Warning: {} is deprecated\n", "old_api");  // explicit stream/FILE*
}
```

**Why it matters:**

| Aspect | `printf` | `std::cout <<` | `std::cout << std::format(...)` | `std::print` |
|---|---|---|---|---|
| **Type safety** | ❌ None (format string / argument mismatch = UB) | ✅ Fully typed | ✅ Fully typed | ✅ Fully typed |
| **Compile-time format checking** | ❌ (GCC/Clang warn, not standard) | N/A | ✅ (`std::format_string`) | ✅ (`std::format_string`) |
| **Intermediate allocation** | None | None | ✅ Builds a `std::string` first | ❌ None (writes directly) |
| **Positional/width/fill specifiers** | Limited (`%*d`) | Manual manipulators | ✅ Rich `{}` syntax | ✅ Rich `{}` syntax |
| **Unicode-aware output** | Locale-dependent | Locale-dependent | Locale-dependent | ✅ Uses platform-appropriate transcoding on Windows consoles |

On implementations where the destination is a Unicode-capable console (notably Windows), `std::print` performs the necessary UTF-8 → native transcoding automatically — something raw `fwrite`/`std::cout` do not guarantee, making it genuinely more correct, not merely more convenient.

**Compile-time validated format strings:**

```cpp
std::print("{}\n", 42);        // OK
std::print("{}\n");            // ❌ Compile error: format string expects an argument
std::print("{:d}\n", "text");  // ❌ Compile error: 'd' is not valid for a string argument
```

This checking happens because `std::print`'s first parameter is typed as `std::format_string<Args...>`, whose constructor is `consteval` when given a string literal — the same mechanism `std::format` uses.

---

#### 2. `std::stacktrace` (P0881) - Portable Call-Stack Capture

Prior to C++23, inspecting the current call stack for logging, crash reporting, or "who called this deprecated function" diagnostics required a platform-specific library (`backtrace()` on Linux, `CaptureStackBackTrace` on Windows) or a third party wrapper such as Boost.Stacktrace (which directly inspired this proposal). `<stacktrace>` standardizes it.

```cpp
#include <stacktrace>
#include <print>

void log_call_site() {
    std::stacktrace trace = std::stacktrace::current();
    std::println("Captured {} frames:", trace.size());

    for (const auto& entry : trace) {
        std::println("  {} at {}:{}",
                      entry.description(),   // e.g. function name (implementation-defined format)
                      entry.source_file(),
                      entry.source_line());
    }
}

void inner()  { log_call_site(); }
void outer()  { inner(); }

int main() { outer(); }
```

**Key properties:**

| Member | Purpose |
|---|---|
| `std::stacktrace::current()` | Static factory capturing the stack at the call point (like `SourceLocation` but for the whole call chain) |
| `entry.description()` | Best-effort symbol/function name (requires debug info / symbols to be meaningful) |
| `entry.source_file()`, `entry.source_line()` | Best-effort source location (also requires debug info) |
| `to_string(trace)` | Formats the entire trace as a human-readable string in one call |

**Caveats worth knowing:**
- Symbol resolution quality is implementation-defined and typically requires debug symbols (`-g`) to be present; a stripped release binary may only yield addresses.
- Capturing a stacktrace is not free — it walks the stack and (usually) resolves symbols, so it should be reserved for exceptional/error paths (e.g. attaching to an exception object), not hot-path logging.
- A common pattern is embedding a `std::stacktrace` inside a custom exception type at throw time, so a catch handler far up the call chain can still print exactly where the throw happened.

---

#### 3. `std::move_only_function` (P0288) - Type Erasure for Move-Only Callables

`std::function` has always required its target callable to be **copy-constructible**, because `std::function` itself is copyable and must be able to copy whatever it wraps. This silently rejects a large, common class of callables: lambdas that capture a `std::unique_ptr`, a `std::promise`, or any other move-only resource by value.

```cpp
#include <memory>
#include <functional>

auto make_task(std::unique_ptr<int> data) {
    // ❌ Does not compile: the lambda's closure type is move-only
    //    (it holds a unique_ptr by value), but std::function requires copyable targets.
    std::function<void()> f = [data = std::move(data)]() {
        std::cout << *data << "\n";
    };
    return f;
}
```

`std::move_only_function` (header `<functional>`) relaxes this: it is itself **move-only**, so it never needs to copy its target.

```cpp
#include <functional>
#include <memory>

std::move_only_function<void()> make_task(std::unique_ptr<int> data) {
    return [data = std::move(data)]() {
        std::cout << *data << "\n";
    };
}

int main() {
    auto task = make_task(std::make_unique<int>(42));
    task();                       // ✅ invoke
    // auto copy = task;          // ❌ Error: move_only_function is not copyable
    auto moved = std::move(task); // ✅ OK
    moved();
}
```

**Comparison table:**

| | `std::function<Sig>` | `std::move_only_function<Sig>` |
|---|---|---|
| **Copyable** | ✅ Required | ❌ Move-only |
| **Wraps move-only lambdas** (capturing `unique_ptr`, etc.) | ❌ No | ✅ Yes |
| **Const/ref/noexcept qualified signatures** (`void() const`, `void() &&`, `void() noexcept`) | ❌ Not supported | ✅ Supported directly in the template signature |
| **Typical use** | Copyable callback stored in multiple places | Task/continuation queues, one-shot callbacks, coroutine continuations |

The qualifier support is itself a small but notable addition: `std::move_only_function<void() const>` constrains the call operator to be `const`-invocable, and `std::move_only_function<void() &&>` requires the callable be invoked as an rvalue (enforcing "call me exactly once" at the type level) — neither is expressible with `std::function`.

---

#### 4. `std::flat_map` and `std::flat_set` (P0429 / P1222) - Cache-Friendly Sorted Associative Containers

`std::map`/`std::set` are red-black trees: every node is a separate heap allocation, and traversal jumps around memory in ways that are hostile to CPU caches. `std::flat_map`/`std::flat_set` (header `<flat_map>` / `<flat_set>`) instead store their keys (and, for `flat_map`, values) in **contiguous sorted sequences** — by default `std::vector`s — and perform lookups via binary search.

```cpp
#include <flat_map>
#include <vector>

std::flat_map<int, std::string> fm = {
    {3, "three"}, {1, "one"}, {2, "two"}
};
// Internally stored as two parallel sorted vectors: keys = [1,2,3], values = ["one","two","three"]

fm[4] = "four";               // insertion may shift/reallocate the underlying vectors
auto it = fm.find(2);         // O(log n) binary search, but cache-friendly linear scan pattern
```

**Underlying structure and complexity trade-offs:**

| | `std::map` / `std::set` | `std::flat_map` / `std::flat_set` |
|---|---|---|
| **Storage** | Red-black tree (per-node heap allocation) | Contiguous sorted container (default `std::vector`), configurable via a template parameter for the underlying container |
| **Lookup** | O(log n), pointer-chasing | O(log n), binary search over contiguous memory — far better cache locality |
| **Iteration** | O(n), scattered memory (cache-unfriendly) | O(n), sequential memory (cache-friendly, often auto-vectorizable) |
| **Insertion/erase** | O(log n), no element shifting | **O(n)** — may shift or reallocate the entire backing store |
| **Memory overhead per element** | High (node header + pointers + allocator bookkeeping) | Low (no per-element allocation) |
| **Iterator/reference stability** | Stable across insert/erase (except erased element) | **Not stable** — insertion/erase can invalidate all iterators/references |
| **Best for** | Frequent insert/erase, needs pointer stability | Read-heavy workloads built once (or rarely mutated), then queried many times |

Because `std::flat_map` is a container **adaptor** (like `std::stack`/`std::priority_queue`), it is parameterized by the underlying container type(s), letting you plug in e.g. a `boost::container::small_vector` for embedded/allocation-averse code.

---

#### 5. `std::generator` (P2502) - A Standard Coroutine-Based Generator

C++20 gave the language coroutines (`co_await`, `co_yield`, `co_return`), but shipped **no concrete coroutine types** in the library — every project had to hand-write its own `Generator<T>` promise-type boilerplate (as covered in the C++20 Coroutines topic). C++23's `std::generator<T>` (header `<generator>`) is exactly that missing piece: a ready-made, range-compatible, lazy generator type.

```cpp
#include <generator>
#include <ranges>

std::generator<int> fibonacci() {
    int a = 0, b = 1;
    while (true) {
        co_yield a;
        auto next = a + b;
        a = b;
        b = next;
    }
}

int main() {
    for (int value : fibonacci() | std::views::take(10)) {
        std::print("{} ", value);   // 0 1 1 2 3 5 8 13 21 34
    }
}
```

**What it gives you that hand-rolled C++20 generators required boilerplate for:**

| Capability | Hand-rolled C++20 `Generator<T>` | `std::generator<T>` (C++23) |
|---|---|---|
| Promise type, iterator, `begin()`/`end()` | You write it | Provided by the library |
| Composability with Ranges (`std::views::take`, `filter`, ...) | Only if you implement the range interface correctly | ✅ Built to satisfy `std::ranges::input_range` |
| Recursive/nested generation (`co_yield ranges::elements_of(subgen)`) | Manual plumbing | ✅ Supported directly |
| Allocator customization | Manual | ✅ Template parameter for allocator |
| Exception safety, move semantics | Easy to get subtly wrong | Standardized, tested behavior |

`std::generator` is a **synchronous, single-pass, lazy** range: each `co_yield` suspends the coroutine until the consumer asks for the next element, so infinite generators (like the Fibonacci sequence above) are safe as long as they are consumed through something bounded, such as `views::take`.

---

#### 6. `std::spanstream` (P0448) - Stream I/O Over an Existing Buffer

`std::stringstream` is convenient but always owns (and allocates) its own internal buffer. `std::spanstream` (header `<spanstream>`) instead performs stream-style I/O directly over an existing contiguous buffer described by a `std::span<char>`, with **no allocation**.

```cpp
#include <spanstream>
#include <array>

std::array<char, 64> buffer{};

std::ospanstream out(std::span<char>(buffer));
out << "x=" << 42;                       // writes directly into `buffer`, no heap allocation
auto written = std::move(out).span();    // view of exactly the bytes written

std::ispanstream in(std::span<const char>(buffer.data(), written.size()));
int x;
std::string eq;
in >> eq >> x;   // parses "x=42" from the buffer as if reading from any istream
```

This matters in latency-sensitive or embedded code where allocation is undesirable but the ergonomics of `operator<<`/`operator>>` (formatting numbers, parsing tokens) are still wanted — previously the only allocation-free option was to hand-write buffer formatting with `std::to_chars`/`std::from_chars`.

---

#### 7. `std::to_underlying` (P1682) - Scoped Enum to Its Underlying Type

```cpp
enum class Color : std::uint8_t { Red, Green, Blue };

Color c = Color::Green;

// Before C++23:
auto raw1 = static_cast<std::underlying_type_t<Color>>(c);

// C++23:
#include <utility>
auto raw2 = std::to_underlying(c);   // same result, no need to name the underlying type
```

`std::to_underlying` is a tiny function template (`template<class E> constexpr underlying_type_t<E> to_underlying(E e) noexcept`) — but it removes a piece of boilerplate that appeared constantly wherever scoped enums were serialized, hashed, or passed to C APIs expecting an integer.

---

#### 8. `std::unreachable()` (P0627) - Telling the Optimizer "This Cannot Happen"

Compilers have long offered nonstandard ways to mark a code path unreachable so the optimizer can eliminate dead branches and avoid emitting a fallback (e.g. `__builtin_unreachable()` on GCC/Clang, `__assume(0)` on MSVC). C++23 standardizes this as `std::unreachable()` (header `<utility>`).

```cpp
#include <utility>

int weekday_number(Day d) {
    switch (d) {
        case Day::Mon: return 1;
        case Day::Tue: return 2;
        // ... all enumerators handled ...
        case Day::Sun: return 7;
    }
    std::unreachable();   // Tells the compiler: execution never reaches here.
                           // Lets it skip generating a return/fallthrough path,
                           // and often improves switch-to-jump-table codegen.
}
```

**The sharp edge:** if control flow *does* reach `std::unreachable()` at runtime, the behavior is undefined — this is explicitly an optimizer hint, not a checked assertion. It should only be used where invariants elsewhere in the program (exhaustive `switch`, prior validation) genuinely guarantee the path is dead; for anything you actually want checked, use an assertion or (in C++26) a contract, not `std::unreachable()`.

---

#### 9. `import std;` (P2465) - The Entire Standard Library as One Module

C++20 introduced modules, but the standard library itself was still consumed the traditional way, via headers (`#include <vector>`, etc.), because modularizing the library is a separate, larger effort. C++23 takes the first concrete step: `import std;` lets a translation unit import **the entire standard library** as a single, precompiled module.

```cpp
import std;   // Instead of: #include <iostream> #include <vector> #include <string> #include <algorithm> ...

int main() {
    std::vector<int> v = {3, 1, 2};
    std::ranges::sort(v);
    for (auto x : v) std::print("{} ", x);
}
```

**Why this is attractive:**

| Aspect | `#include <header>` | `import std;` |
|---|---|---|
| **Preprocessing** | Textual inclusion; header re-parsed per translation unit unless precompiled headers are used | Module interface parsed once, consumed as a binary module interface (BMI) |
| **Macro leakage** | Headers can leak macros into your code (`#define min ...` horror stories) | Modules do not export macros — much stronger isolation |
| **Compile time at scale** | Costly at scale without precompiled headers | Generally faster once the module's BMI is built, since it isn't re-parsed per TU |
| **Name visibility** | Everything in the included headers becomes visible | Only exported names become visible |

**Honest caveat:** as of this writing, `import std;` support is still maturing across major compilers/build systems (module BMI caching, build-system integration for module dependency scanning) — treat it as "available and standardized" rather than "universally drop-in" until your specific toolchain's module support is fully verified. Falling back to header includes remains completely valid C++23.

---

#### 10. Summary Table - C++23 Library Additions Covered Here

| Feature | Header | Paper | One-line purpose |
|---|---|---|---|
| `std::print` / `std::println` | `<print>` | P2093 | Format-string-safe printing directly to a stream, no intermediate `std::string` |
| `std::stacktrace` | `<stacktrace>` | P0881 | Portable capture and inspection of the current call stack |
| `std::move_only_function` | `<functional>` | P0288 | Type-erased callable wrapper supporting move-only targets |
| `std::flat_map` / `std::flat_set` | `<flat_map>` / `<flat_set>` | P0429 / P1222 | Cache-friendly, contiguous, sorted associative containers |
| `std::generator` | `<generator>` | P2502 | Ready-made coroutine-based lazy generator, Ranges-compatible |
| `std::spanstream` | `<spanstream>` | P0448 | Allocation-free stream I/O over an existing `std::span<char>` buffer |
| `std::to_underlying` | `<utility>` | P1682 | Convert a scoped enum to its underlying integer type |
| `std::unreachable()` | `<utility>` | P0627 | Optimizer hint marking a code path as provably unreachable |
| `import std;` | (module) | P2465 | Import the entire standard library as one precompiled module |

---

#### 11. Compile-Time vs Runtime Breakdown

Not everything in this topic costs the same at each phase. Here's what the compiler resolves ahead of time versus what actually runs when your program executes:

| Facility | Compile-time work | Runtime work |
|---|---|---|
| `std::print` / `std::println` | Format string is parsed and type-checked via `consteval` — a mismatched `{}` placeholder (wrong count, wrong type) is a **compile error**, not a runtime surprise | A direct write syscall to the target stream; no `std::string` is built first, and `iostream`'s buffering/locale synchronization machinery is bypassed entirely |
| `std::stacktrace::current()` | Nothing — there is no compile-time shortcut here | 100% runtime cost: it walks real frame pointers on the live call stack right then. This can be non-trivial (dozens of microseconds depending on depth/symbol resolution), so it does not belong in a hot path |
| `std::move_only_function` | The compiler generates a type-erasure wrapper (vtable-like dispatch) specialized to whatever callable you assign — this shape is fixed at compile time per call site | Every invocation is one real indirect call through that generated wrapper — the same cost class as `std::function`, just without the copy-related overhead `std::function` sometimes pays |
| `std::flat_map` / `std::flat_set` | No special compile-time behavior — it's an ordinary class template | The runtime access pattern (binary search over a contiguous `std::vector`) is what differs from `std::map`; this is a **memory-layout** win, not a compile-time one — see the Memory Model below |
| `std::generator` | The coroutine's frame *layout* (which locals need to survive a suspension, in what order) is computed at compile time from the coroutine body | Frame *allocation* is a real runtime cost: by default the frame lives on the **heap**, unless the compiler can prove HALO (Heap Allocation eLision Optimization) applies — which is an optimization, never a guarantee |
| `std::to_underlying` / `std::unreachable()` | Fully resolved at compile time — `to_underlying` is a trivial `static_cast` the compiler already knows the type for; `unreachable()` is pure information fed to the optimizer | Zero runtime code is emitted for either in a correct program — `to_underlying` compiles down to nothing beyond the cast, and `unreachable()` emits no instructions at all (if it's ever actually reached, that's undefined behavior, not a runtime check) |

#### 12. Memory Model

Two of these facilities have real, opposite-direction implications for latency-sensitive code, and one is worth calling out just for what it *avoids* allocating.

**`std::flat_map` vs `std::map` — contiguous block vs. scattered nodes:**

```
std::flat_map<K, V>                     std::map<K, V>
┌─────────────────────────┐             (red-black tree, one heap
│ [k0,v0][k1,v1][k2,v2]...│              node allocated per element)
│   single contiguous      │
│   std::vector<...> block │                 ┌────┐
└─────────────────────────┘                  │node│
   binary search here:                       └─┬──┘
   sequential memory reads,                ┌────┴────┐
   cache-line friendly                   ┌─┴──┐    ┌─┴──┐
                                          │node│    │node│
                                          └────┘    └────┘
                                          each node = separate
                                          heap allocation, pointer-
                                          chase to walk the tree
```

For a read-heavy hot path (many lookups, few inserts), `flat_map`'s single contiguous allocation means every comparison during the binary search is likely already in cache, whereas `std::map` forces a pointer chase through scattered heap nodes — each hop is a potential cache miss.

**`std::generator` — the coroutine frame is a hidden heap allocation:**

```
auto gen = my_generator();   // by default:
                              //   [ coroutine frame ] ← allocated on the HEAP
                              //   (locals, resume point, promise object)
```

Unlike a hand-rolled iterator-based generator (which lives entirely on the caller's stack), a `std::generator` typically pays one heap allocation per generator object created, unless the compiler's HALO optimization manages to elide it — which you cannot rely on across all compilers/build modes.

**`std::print` — one fewer buffer than you might expect:**

Writing `std::print("{}", x)` does not first materialize a `std::string` the way `std::cout << std::format("{}", x)` would — it formats directly into the write call, skipping an intermediate heap-backed string allocation.

**Low-latency takeaway:** prefer `std::flat_map`/`std::flat_set` over `std::map`/`std::set` for read-dominated hot-path lookups; be deliberate about `std::generator` in a tight loop since its default heap-allocated frame is a per-call cost a plain iterator wouldn't pay; and reach for `std::print` directly instead of pre-formatting into a `std::string` when writing to a stream.

---

### EDGE_CASES: Gotchas in the New Library Facilities

#### Edge Case 1: `std::print` and Non-UTF-8 Consoles

`std::print`/`std::println` write UTF-8 text by default. Most implementations transcode automatically when the destination is a Unicode-capable console, but the guarantee is weakest on Windows, where the *legacy* console code page (not `chcp 65001`) can still mangle non-ASCII output depending on the standard library/runtime combination in use.

```cpp
#include <print>

int main() {
    std::println("café — résumé");  // "café — résumé"
    // On a correctly configured UTF-8 terminal: prints exactly that.
    // On an unconfigured legacy Windows console (code page 437/1252):
    // accented characters and the em-dash may render as '?' or mojibake,
    // because the console's active code page — not std::print — decides
    // how the UTF-8 bytes are displayed.
}
```

**Lesson:** `std::print`'s type/format safety is a language-level guarantee; console *rendering* of non-ASCII bytes is still an environment concern. Don't assume "I switched to `std::print`" alone fixes Unicode console output on every platform.

---

#### Edge Case 2: `std::stacktrace` Without Debug Symbols

```cpp
#include <stacktrace>
#include <print>

void report() {
    auto trace = std::stacktrace::current();
    std::println("{}", std::to_string(trace));
}
```

Compiled with full optimization and stripped symbols (e.g. `-O2` and no `-g`, then `strip`'d), `entry.description()` and `entry.source_file()` commonly degrade to empty strings or raw addresses rather than function names and file:line pairs. `std::stacktrace` capture itself still *succeeds* — it just has nothing meaningful to resolve symbols against. Teams that want stacktraces in release builds must ship (or keep available out-of-band) debug info, not just enable the header.

---

#### Edge Case 3: `std::move_only_function` Rejects an Implicit Copy

```cpp
#include <functional>
#include <memory>

void enqueue(std::move_only_function<void()> task);

void submit() {
    std::move_only_function<void()> job = [p = std::make_unique<int>(1)] { (void)p; };

    enqueue(job);              // ❌ Compile error: move_only_function has no copy constructor
    enqueue(std::move(job));   // ✅ OK — explicit move required
}
```

Code migrated naively from `std::function<void()>` (where `enqueue(job)` would have silently copied) now fails to compile at the call site — which is the point: it forces the caller to make the ownership transfer explicit instead of accidentally relying on a copy that used to be legal (and, for a `unique_ptr`-capturing lambda, would never even have compiled under `std::function` to begin with — see the very next line of the theory section above).

---

#### Edge Case 4: `std::flat_map` Invalidates (Almost) Everything on Insert

```cpp
#include <flat_map>

std::flat_map<int, int> fm = {{1, 10}, {2, 20}, {3, 30}};
auto& ref = fm.at(2);

fm.insert({0, 0});   // may reallocate/shift the backing vector(s)
// ref is now potentially DANGLING — unlike std::map, where references
// to un-erased elements remain valid across insertion.
std::cout << ref;    // ❌ undefined behavior if the backing store reallocated/shifted
```

This is the single most dangerous trap for code ported from `std::map`: `flat_map`'s contiguous storage means insertion/erasure can invalidate essentially *all* iterators and references, not just ones "near" the change. Hold indices/keys across mutation, not references, if the container may still be mutated.

---

#### Edge Case 5: A Dangling Reference Captured by a `std::generator` Coroutine

```cpp
#include <generator>

std::generator<int> bad_gen(const std::vector<int>& v) {  // reference parameter
    for (int x : v) co_yield x;
}

std::generator<int> make() {
    std::vector<int> local = {1, 2, 3};
    return bad_gen(local);   // `local` goes out of scope when make() returns...
}                            // ...but the coroutine frame captured a reference to it!

int main() {
    for (int x : make()) {  // ❌ undefined behavior: reading through a dangling reference
        std::cout << x;
    }
}
```

Because a coroutine's frame outlives the enclosing function call in general, reference parameters (and references to locals) captured by a `std::generator`-returning coroutine must not outlive what they point to. The safe fix is to take `v` (and any other referenced locals) **by value** into the coroutine, or ensure the referenced object's lifetime is guaranteed to exceed the generator's.

---

#### Edge Case 6: `std::to_underlying` Only Accepts Enums

```cpp
#include <utility>

int x = 42;
// auto raw = std::to_underlying(x);   // ❌ Compile error: constraint not satisfied
//                                      //    (std::to_underlying requires an enumeration type)

enum class Status : int { Ok, Failed };
auto raw = std::to_underlying(Status::Failed);  // ✅ OK, raw == 1
```

Unlike a raw `static_cast<int>(x)` in generic code — which will happily "succeed" on a plain `int` and silently do nothing useful — `std::to_underlying` is constrained to enumeration types only, so misuse in a template is caught at compile time rather than compiling into a no-op cast.

---

#### Edge Case 7: `std::unreachable()` Reached at Runtime

```cpp
#include <utility>

int classify(int code) {
    switch (code) {
        case 0: return -1;
        case 1: return 1;
    }
    std::unreachable();   // Programmer believes code is always 0 or 1.
}

int main() {
    return classify(2);   // Undefined behavior: this path WAS reachable after all.
                           // A release build may return garbage, corrupt the stack,
                           // or "work by accident" — there is no guaranteed diagnostic.
}
```

Because `std::unreachable()` is purely an optimizer hint (not a checked assertion), a logic bug that makes the "impossible" path reachable does not fail loudly — it is full undefined behavior, and optimizers are free to assume it never happens, which can delete surrounding "impossible" checks entirely. Never use it for a path that is merely *believed* unlikely; reserve it for paths that are provably, structurally dead (e.g. after an exhaustive `switch` over a `enum class` with no default).

---

#### Edge Case 8: `import std;` Alongside Traditional Headers

```cpp
import std;
#include <vector>   // also brings in std::vector via the traditional header route

int main() {
    std::vector<int> v{1, 2, 3};   // which std::vector? Both routes should describe
    return 0;                       // the same entity, but toolchain module support is
}                                    // still maturing enough that mixing the two styles
                                     // in one translation unit is more likely to expose
                                     // build-system/module-cache bugs than a purely
                                     // header-based or purely import-based TU.
```

As of this writing, mixing `import std;` with `#include` of the same standard headers in one translation unit is technically intended to work (both ultimately declare the same standard library entities) but is one of the least-tested paths across current module implementations — prefer choosing one style per translation unit until your toolchain's module support is verified mature.

---

#### Edge Case 9: `std::spanstream` Cannot Grow Past Its Backing Span

```cpp
#include <spanstream>
#include <array>

std::array<char, 4> tiny{};
std::ospanstream out(std::span<char>(tiny));

out << 123456;   // The formatted text "123456" (6 chars) does not fit in a 4-byte span.
                  // Unlike std::ostringstream (which would simply grow its internal
                  // buffer), std::ospanstream has nowhere to grow: writing past the
                  // span's capacity sets the stream's failure state (failbit) instead.

if (!out) {
    // Expected: detect and handle the overflow — e.g. use a larger buffer or
    // std::to_chars directly for size-critical formatting.
}
```

The whole point of `std::spanstream` is *not* allocating — so, unlike `std::stringstream`, it has no fallback when the destination is too small. Code migrating from `stringstream` to `spanstream` for the allocation-avoidance benefit must add capacity checks (or size the span generously) that were previously unnecessary.

---

### CODE_EXAMPLES: Practical Demonstrations

#### Example 1: Replacing a `std::cout` Chain with `std::println`

```cpp
#include <print>
#include <string>

struct Order {
    int id;
    std::string customer;
    double total;
};

void report(const Order& o) {
    // Before: std::cout << "Order #" << o.id << " for " << o.customer
    //                    << ": $" << std::fixed << std::setprecision(2) << o.total << "\n";
    std::println("Order #{} for {}: ${:.2f}", o.id, o.customer, o.total);
}

int main() {
    report({1042, "Grace Hopper", 199.5});
}
```

**Output:**
```
Order #1042 for Grace Hopper: $199.50
```

---

#### Example 2: Attaching a Stacktrace to a Custom Exception

```cpp
#include <stacktrace>
#include <stdexcept>
#include <print>

class TracedError : public std::runtime_error {
public:
    explicit TracedError(std::string msg)
        : std::runtime_error(std::move(msg)), trace_(std::stacktrace::current()) {}

    const std::stacktrace& trace() const { return trace_; }

private:
    std::stacktrace trace_;
};

void validate(int x) {
    if (x < 0) throw TracedError("negative input");
}

void process(int x) { validate(x); }

int main() {
    try {
        process(-1);
    } catch (const TracedError& e) {
        std::println("Error: {}", e.what());
        std::println("Captured {} stack frames at throw site", e.trace().size());
    }
}
```

**Output (frame count/details are implementation-defined):**
```
Error: negative input
Captured 4 stack frames at throw site
```

---

#### Example 3: A Task Queue of Move-Only Callbacks

```cpp
#include <functional>
#include <memory>
#include <deque>
#include <print>

class TaskQueue {
public:
    void push(std::move_only_function<void()> task) {
        tasks_.push_back(std::move(task));
    }

    void run_all() {
        while (!tasks_.empty()) {
            auto task = std::move(tasks_.front());
            tasks_.pop_front();
            task();
        }
    }

private:
    std::deque<std::move_only_function<void()>> tasks_;
};

int main() {
    TaskQueue q;
    for (int i = 1; i <= 3; ++i) {
        auto owned = std::make_unique<int>(i * 100);
        q.push([owned = std::move(owned)] {
            std::println("Task owns value: {}", *owned);
        });
    }
    q.run_all();
}
```

**Output:**
```
Task owns value: 100
Task owns value: 200
Task owns value: 300
```

---

#### Example 4: `std::flat_map` Word-Frequency Counter

```cpp
#include <flat_map>
#include <sstream>
#include <string>
#include <print>

int main() {
    std::istringstream words("the quick brown fox the lazy fox the dog");
    std::flat_map<std::string, int> freq;

    std::string w;
    while (words >> w) {
        ++freq[w];   // built once, then queried repeatedly — the ideal flat_map workload
    }

    for (const auto& [word, count] : freq) {   // sequential, cache-friendly iteration
        std::println("{}: {}", word, count);
    }
}
```

**Output (keys iterate in sorted order):**
```
brown: 1
dog: 1
fox: 2
lazy: 1
quick: 1
the: 3
```

`std::map` would produce the same logical result but via node-by-node pointer chasing; `flat_map`'s two contiguous backing vectors let this iteration and the earlier insertions stay in cache far more effectively for a "build once, read many times" access pattern like this one.

---

#### Example 5: Lazy Fibonacci with `std::generator`

```cpp
#include <generator>
#include <ranges>
#include <print>

std::generator<unsigned long long> fibonacci() {
    unsigned long long a = 0, b = 1;
    while (true) {
        co_yield a;
        auto next = a + b;
        a = b;
        b = next;
    }
}

int main() {
    for (auto value : fibonacci() | std::views::take(10)) {
        std::print("{} ", value);
    }
    std::println("");
}
```

**Output:**
```
0 1 1 2 3 5 8 13 21 34
```

Only 10 values are ever produced — the coroutine suspends after each `co_yield` and is never resumed past what `views::take(10)` consumes, so the infinite loop inside `fibonacci()` never actually runs to completion or blocks the program.

---

#### Example 6: Allocation-Free Formatting with `std::spanstream`

```cpp
#include <spanstream>
#include <array>
#include <print>

std::string format_point(int x, int y) {
    std::array<char, 32> buffer{};
    std::ospanstream out(std::span<char>(buffer));

    out << "(" << x << ", " << y << ")";
    auto written = std::move(out).span();

    return std::string(written.data(), written.size());  // one allocation, for the return value only
}

int main() {
    std::println("{}", format_point(3, -7));
}
```

**Output:**
```
(3, -7)
```

The `ospanstream` itself performs zero heap allocation while formatting into `buffer` — useful in latency-sensitive code paths where even the transient allocations a `std::ostringstream` would perform are undesirable.

---

#### Example 7: Serializing a Scoped Enum with `std::to_underlying`

```cpp
#include <utility>
#include <print>

enum class LogLevel : std::uint8_t { Debug, Info, Warning, Error };

void write_log_record(LogLevel level, std::string_view message) {
    // Before C++23: static_cast<std::underlying_type_t<LogLevel>>(level)
    std::println("[{}] {}", std::to_underlying(level), message);
}

int main() {
    write_log_record(LogLevel::Warning, "disk usage above 90%");
}
```

**Output:**
```
[2] disk usage above 90%
```

---

#### Example 8: Marking an Exhaustive `switch` with `std::unreachable`

```cpp
#include <utility>
#include <print>

enum class Direction { North, South, East, West };

std::string_view opposite_name(Direction d) {
    switch (d) {
        case Direction::North: return "South";
        case Direction::South: return "North";
        case Direction::East:  return "West";
        case Direction::West:  return "East";
    }
    std::unreachable();  // Every enumerator is handled above; the optimizer can now
                          // drop any implicit fallthrough/return path entirely.
}

int main() {
    std::println("{}", opposite_name(Direction::East));
}
```

**Output:**
```
West
```

---

### QUICK_REFERENCE: C++23 Library Additions Cheat Sheet

#### Feature-to-Header-to-Paper Table

| Feature | Header | Paper | One-line purpose |
|---|---|---|---|
| `std::print` / `std::println` | `<print>` | P2093 | Format-string-safe printing directly to a stream, no intermediate `std::string` |
| `std::stacktrace` | `<stacktrace>` | P0881 | Portable capture and inspection of the current call stack |
| `std::move_only_function` | `<functional>` | P0288 | Type-erased callable wrapper supporting move-only targets |
| `std::flat_map` / `std::flat_set` | `<flat_map>` / `<flat_set>` | P0429 / P1222 | Cache-friendly, contiguous, sorted associative containers |
| `std::generator<T>` | `<generator>` | P2502 | Ready-made coroutine-based lazy generator, Ranges-compatible |
| `std::spanstream` | `<spanstream>` | P0448 | Allocation-free stream I/O over an existing `std::span<char>` buffer |
| `std::to_underlying` | `<utility>` | P1682 | Convert a scoped enum to its underlying integer type |
| `std::unreachable()` | `<utility>` | P0627 | Optimizer hint marking a code path as provably unreachable |
| `import std;` | (module) | P2465 | Import the entire standard library as one precompiled module |

#### Syntax Quick Reference

```cpp
// Printing
std::print("{} is {}\n", name, age);
std::println("{} is {}", name, age);            // auto-appends '\n'
std::print(stderr, "warning: {}\n", msg);

// Stacktrace
std::stacktrace trace = std::stacktrace::current();
for (auto& f : trace) { f.description(); f.source_file(); f.source_line(); }
std::to_string(trace);

// Move-only callable
std::move_only_function<void()> job = [p = std::move(ptr)] { /* ... */ };
job();                        // invoke
// auto c = job;              // ❌ not copyable
auto m = std::move(job);      // ✅ movable

// Flat associative containers
std::flat_map<K, V> fm = { {k1, v1}, {k2, v2} };   // contiguous, sorted, binary-search lookup
std::flat_set<K> fs = { k1, k2, k3 };

// Coroutine generator
std::generator<T> gen() { while (...) co_yield value; }
for (auto v : gen() | std::views::take(n)) { /* ... */ }

// Span-backed stream (no allocation)
std::ospanstream out(std::span<char>(buffer));
out << value;
auto written = std::move(out).span();

// Enum-to-underlying
auto raw = std::to_underlying(scoped_enum_value);

// Optimizer hint for dead code
std::unreachable();   // UB if actually reached

// Whole standard library as one module
import std;
```

#### When to Reach for Each

| Situation | Reach for |
|---|---|
| Fast, type-safe, allocation-free console/file output | `std::print` / `std::println` |
| Diagnosing "who called this" without a debugger | `std::stacktrace` (attach to exceptions) |
| A callback that owns a `unique_ptr`/move-only resource | `std::move_only_function` |
| Build-once, read-many lookup table, cache-locality matters | `std::flat_map` / `std::flat_set` |
| Lazy sequence production without hand-writing a coroutine promise type | `std::generator<T>` |
| Formatting/parsing into a fixed buffer, no heap allocation allowed | `std::spanstream` |
| Converting a scoped enum for logging/serialization/C APIs | `std::to_underlying` |
| Marking a structurally-dead branch after an exhaustive `switch` | `std::unreachable()` |
| Reducing translation-unit-level `#include` overhead/macro leakage | `import std;` (verify toolchain maturity first) |

**End of Topic 6: C++23 Library Additions**
