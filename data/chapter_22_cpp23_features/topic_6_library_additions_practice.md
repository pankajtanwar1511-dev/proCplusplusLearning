## TOPIC: C++23 Library Additions - Printing, Diagnostics, and New Containers

### PRACTICE_TASKS: Bug Analysis Across the New Library Facilities

#### Q1
```cpp
#include <print>

void greet(const char* name) {
    std::print("Hello, {}! You are {} years old.\n", name);  // Bug: only one argument for two placeholders
}

int main() {
    greet("Ada");
}
```

**Answer:**
```
Compile error: format string expects 2 arguments, only 1 provided
```

**Explanation:**
- `std::print`'s format string is validated at compile time via `std::format_string`
- The literal `"{}"` `"{}"` requires two arguments; only `name` was passed
- Unlike `printf`, which would read garbage from the stack (UB) for the missing `%s`/`%d`, this is caught before the program ever runs
- **Key Concept:** `std::print`/`std::format` reject argument-count and type mismatches for literal format strings at compile time, not at runtime like `printf`

**Fixed Version:**
```cpp
#include <print>

void greet(const char* name, int age) {
    std::print("Hello, {}! You are {} years old.\n", name, age);
}

int main() {
    greet("Ada", 36);
}
```

---

#### Q2
```cpp
#include <print>

int main() {
    int percent = 87;
    std::print("Progress: {:d}%\n", "almost done");  // Bug: 'd' presentation type used with a string argument
}
```

**Answer:**
```
Compile error: invalid format specifier 'd' for argument of type const char*
```

**Explanation:**
- The presentation type `d` (integer) is not valid for a string argument
- `std::format_string`'s compile-time check inspects both the placeholder's format spec and the argument's type
- **Key Concept:** Format-spec/argument-type mismatches are caught at compile time for literal format strings, closing an entire class of `printf`-style formatting bugs

**Fixed Version:**
```cpp
#include <print>

int main() {
    int percent = 87;
    std::print("Progress: {}%\n", percent);
}
```

---

#### Q3
```cpp
#include <stacktrace>
#include <print>

// Compiled with: g++ -O2 -std=c++23 main.cpp -o app && strip app
void report() {
    auto trace = std::stacktrace::current();
    std::println("{}", std::to_string(trace));
}

int main() { report(); }
```

**Answer:**
```
Prints frame addresses with empty/unresolved function names and source locations
```

**Explanation:**
- `std::stacktrace::current()` still successfully captures the stack in a stripped, optimized binary
- But `description()`/`source_file()`/`source_line()` rely on debug symbol information, which `strip` removed
- The capture "worked"; only *symbol resolution* degraded — a common surprise for teams who only test stacktraces in debug builds
- **Key Concept:** Stacktrace capture and stacktrace symbol resolution are separate concerns; release-mode diagnostics need debug info retained (even if stripped from the shipped binary and kept out-of-band)

**Fixed Version:**
```cpp
// Build with debug info retained (e.g. `-g`), optionally split into a separate
// symbol file rather than fully stripping it away:
// g++ -O2 -g -std=c++23 main.cpp -o app
// objcopy --only-keep-debug app app.debug
// strip app
// objcopy --add-gnu-debuglink=app.debug app
```

---

#### Q4
```cpp
#include <functional>
#include <memory>

void enqueue(std::function<void()> task);

void submit() {
    auto data = std::make_unique<int>(42);
    // Bug: std::function requires a copyable target, but the lambda captures a unique_ptr by move
    std::function<void()> job = [data = std::move(data)] { (void)data; };
    enqueue(job);
}
```

**Answer:**
```
Compile error: the lambda's closure type is not copy-constructible
```

**Explanation:**
- A lambda that captures `data` by move holds a `std::unique_ptr` member, making the closure type move-only
- `std::function` requires its target to be copy-constructible (because `std::function` itself is copyable and must be able to copy whatever it wraps)
- This combination simply does not compile — `std::function` cannot express "move-only callable" at all
- **Key Concept:** `std::function` categorically rejects move-only callables; this was the exact gap `std::move_only_function` (P0288) was introduced to close

**Fixed Version:**
```cpp
#include <functional>
#include <memory>

void enqueue(std::move_only_function<void()> task);

void submit() {
    auto data = std::make_unique<int>(42);
    std::move_only_function<void()> job = [data = std::move(data)] { (void)data; };
    enqueue(std::move(job));
}
```

---

#### Q5
```cpp
#include <functional>
#include <memory>

std::move_only_function<void()> make_logger(std::unique_ptr<int> handle);

void run(std::move_only_function<void()> job) {
    job();
}

void schedule(std::move_only_function<void()> job) {
    run(job);   // Bug: passing a move_only_function by value without moving it
}
```

**Answer:**
```
Compile error: use of deleted copy constructor of move_only_function
```

**Explanation:**
- `std::move_only_function` is intentionally move-only, mirroring `std::unique_ptr`'s ownership model
- `run(job)` would require an implicit copy of `job` to bind to `run`'s by-value parameter — but no copy constructor exists
- Unlike `std::function`, which would have silently copied here, this forces the caller to be explicit about transferring ownership
- **Key Concept:** Every hand-off of a `move_only_function` must be an explicit `std::move`; the compiler will not let an accidental implicit copy compile

**Fixed Version:**
```cpp
void schedule(std::move_only_function<void()> job) {
    run(std::move(job));
}
```

---

#### Q6
```cpp
#include <flat_map>
#include <print>

int main() {
    std::flat_map<int, std::string> fm = {{1, "one"}, {2, "two"}, {3, "three"}};

    const std::string& ref = fm.at(2);   // reference into the backing storage
    fm.insert({0, "zero"});              // Bug: insertion may reallocate/shift the backing vectors

    std::println("{}", ref);             // use of a possibly-dangling reference
}
```

**Answer:**
```
Undefined behavior: `ref` may be dangling after the insert
```

**Explanation:**
- `std::flat_map` stores its keys/values in contiguous sorted vectors, not stable per-node allocations like `std::map`
- Inserting `{0, "zero"}` requires shifting every element with a key greater than 0 (or reallocating the vectors entirely)
- Unlike `std::map`, which guarantees references to un-erased elements remain valid across insertion, `flat_map` gives no such guarantee
- **Key Concept:** `flat_map`/`flat_set` invalidate essentially all iterators and references on insert/erase; code migrated from `std::map` must stop holding references across mutation

**Fixed Version:**
```cpp
#include <flat_map>
#include <print>

int main() {
    std::flat_map<int, std::string> fm = {{1, "one"}, {2, "two"}, {3, "three"}};

    fm.insert({0, "zero"});     // mutate first
    std::println("{}", fm.at(2));   // re-look-up after mutation, don't hold a stale reference
}
```

---

#### Q7
```cpp
#include <flat_map>
#include <print>

int main() {
    std::flat_map<std::string, int> counts;
    for (int i = 0; i < 5; ++i) {
        counts.insert({"key" + std::to_string(i), i});   // Bug (performance): repeated one-at-a-time inserts
    }
    std::println("size: {}", counts.size());
}
```

**Answer:**
```
Correct output, but O(n^2) behavior: each insert may shift/reallocate the whole container
```

**Explanation:**
- Unlike `std::map` (O(log n) per insert with no shifting), each `flat_map::insert` can be O(n) because it may need to shift every larger key
- Inserting n elements one at a time is therefore up to O(n^2) in the worst case
- The *correctness* is unaffected — the bug here is a silent performance trap, not a logic error
- **Key Concept:** `flat_map`/`flat_set` are optimized for "build once (ideally via a range/sorted-input constructor or a batch `insert` of a sorted range), then query many times" — not for incremental one-at-a-time insertion in a hot loop

**Fixed Version:**
```cpp
#include <flat_map>
#include <vector>
#include <print>

int main() {
    std::vector<std::pair<std::string, int>> data;
    for (int i = 0; i < 5; ++i) {
        data.emplace_back("key" + std::to_string(i), i);
    }
    // Construct once from a container of key/value pairs instead of incremental inserts.
    std::flat_map<std::string, int> counts(std::sorted_unique, data.begin(), data.end());
    std::println("size: {}", counts.size());
}
```

---

#### Q8
```cpp
#include <generator>
#include <vector>

std::generator<int> stream_values(const std::vector<int>& v) {  // Bug: binds to a temporary's lifetime
    for (int x : v) co_yield x;
}

std::generator<int> make() {
    std::vector<int> local = {1, 2, 3};
    return stream_values(local);   // `local` is destroyed when make() returns
}

int main() {
    for (int x : make()) {   // Bug: reads through a dangling reference
        // ...
    }
}
```

**Answer:**
```
Undefined behavior: the coroutine's captured reference to `local` dangles once make() returns
```

**Explanation:**
- `stream_values` takes `v` by reference; the coroutine frame stores that reference, not a copy of the vector
- The coroutine frame outlives the call to `stream_values` (it's still suspended, waiting to be iterated) — but `local` is destroyed as soon as `make()` returns
- Iterating `make()` in `main()` then reads through a dangling reference to a destroyed `std::vector`
- **Key Concept:** A `std::generator` coroutine's frame can outlive the function call that created it; any reference parameter it holds must remain valid for as long as the generator itself is alive — take by value when in doubt

**Fixed Version:**
```cpp
#include <generator>
#include <vector>

std::generator<int> stream_values(std::vector<int> v) {   // by value: coroutine owns its own copy
    for (int x : v) co_yield x;
}

std::generator<int> make() {
    std::vector<int> local = {1, 2, 3};
    return stream_values(local);   // copied into the coroutine frame
}
```

---

#### Q9
```cpp
#include <generator>
#include <ranges>
#include <print>

std::generator<int> counter() {
    int n = 0;
    while (true) co_yield n++;   // infinite generator
}

int main() {
    for (int x : counter()) {    // Bug: no bound applied — loops forever
        std::print("{} ", x);
    }
}
```

**Answer:**
```
The program never terminates (infinite loop, unbounded output)
```

**Explanation:**
- `counter()` yields forever by design; that is fine as long as the consumer bounds it
- Iterating it directly with a range-for, with no `views::take`/break condition, means the loop body runs forever
- The coroutine itself is not the bug — the missing bound at the consumption site is
- **Key Concept:** Infinite `std::generator`s are a normal, useful pattern (lazy, on-demand production), but they are only safe when consumed through something bounded — `views::take(n)`, an explicit `break`, or a bounded algorithm

**Fixed Version:**
```cpp
#include <generator>
#include <ranges>
#include <print>

std::generator<int> counter() {
    int n = 0;
    while (true) co_yield n++;
}

int main() {
    for (int x : counter() | std::views::take(10)) {
        std::print("{} ", x);
    }
}
```

---

#### Q10
```cpp
#include <utility>

int status_code(int x) {
    return x;   // Bug: not using to_underlying on an enum; treating a raw int as if serialization was needed
}

template<class E>
auto serialize(E value) {
    return static_cast<int>(value);   // Bug: silently "succeeds" even if E is not an enum, hiding misuse
}

enum class Status { Ok, Failed };

int main() {
    serialize(Status::Ok);   // intended usage
    serialize(42);           // Bug: compiles and does nothing meaningful, no diagnostic
}
```

**Answer:**
```
`serialize(42)` compiles silently, defeating the intended "enum only" contract
```

**Explanation:**
- `static_cast<int>(value)` in generic code accepts *any* type convertible to `int`, including plain integers, silently "succeeding" on misuse
- The intent was to serialize scoped enums specifically; a raw `static_cast` cannot enforce that at the type level
- `std::to_underlying` is constrained to enumeration types only, so passing a non-enum is a compile error instead of a silent no-op
- **Key Concept:** Prefer `std::to_underlying` over a generic `static_cast<int>` when the intent is specifically "convert an enum to its underlying type" — the constraint turns a misuse bug into a compile error

**Fixed Version:**
```cpp
#include <utility>

template<class E>
auto serialize(E value) {
    return std::to_underlying(value);   // constrained to enumeration types only
}

enum class Status { Ok, Failed };

int main() {
    serialize(Status::Ok);   // ✅ OK
    // serialize(42);        // ❌ now a compile error: constraint not satisfied
}
```

---

#### Q11
```cpp
#include <utility>

enum class Direction { North, South, East };   // Bug: West is missing from the enum but handled below anyway

std::string_view opposite(Direction d) {
    switch (d) {
        case Direction::North: return "South";
        case Direction::South: return "North";
        case Direction::East:  return "West";
    }
    std::unreachable();   // Programmer assumes this switch is exhaustive
}

int main() {
    // Later, someone adds a new enumerator...
    // enum class Direction { North, South, East, West };
    // ...but forgets to add a `case Direction::West:` above.
    opposite(static_cast<Direction>(3));   // whatever the new West value would be
}
```

**Answer:**
```
Undefined behavior: the "unreachable" path is actually reached once a new enumerator is added
without updating the switch
```

**Explanation:**
- `std::unreachable()` tells the optimizer the path can never execute — it is not a checked assertion
- If the `enum class` is later extended (a `West` enumerator added) but the `switch` isn't updated to handle it, the "impossible" path becomes reachable
- Because it's UB, not a caught error, the program can silently misbehave rather than fail loudly, and the compiler may have already optimized away what would have been a safety net
- **Key Concept:** `std::unreachable()` is only safe when the invariant truly cannot be violated by future code changes; for enums that may grow, prefer a `default` case that fails loudly (e.g. `throw` or `assert(false)`) during development, reserving `std::unreachable()` for genuinely closed, exhaustively-verified cases

**Fixed Version:**
```cpp
#include <utility>
#include <stdexcept>

enum class Direction { North, South, East, West };

std::string_view opposite(Direction d) {
    switch (d) {
        case Direction::North: return "South";
        case Direction::South: return "North";
        case Direction::East:  return "West";
        case Direction::West:  return "East";
    }
    std::unreachable();   // Safe now: the switch is exhaustive over the *current* enum definition,
                           // and adding a new enumerator will trigger a "not handled in switch"
                           // compiler warning (-Wswitch) that should be treated as an error.
}
```

---

#### Q12
```cpp
#include <spanstream>
#include <array>

std::string format_id(int id) {
    std::array<char, 4> tiny{};              // Bug: buffer too small for large ids
    std::ospanstream out(std::span<char>(tiny));

    out << "ID-" << id;                      // e.g. "ID-123456" doesn't fit in 4 bytes
    auto written = std::move(out).span();
    return std::string(written.data(), written.size());
}

int main() {
    format_id(123456);
}
```

**Answer:**
```
The stream's failbit is set; the written span reflects only what fit (implementation-defined truncation), not the full "ID-123456" text
```

**Explanation:**
- `std::ospanstream` cannot grow past its backing `std::span` — unlike `std::ostringstream`, which would simply allocate more memory
- Writing "ID-123456" (9 characters) into a 4-byte buffer overflows the span's capacity, setting the stream into a failure state
- The bug is sizing the buffer without accounting for the actual maximum content length
- **Key Concept:** `spanstream`'s allocation-free guarantee comes at the cost of a fixed capacity; always size the backing span generously enough for the worst case, and check the stream's state (`if (!out)`) after writing

**Fixed Version:**
```cpp
#include <spanstream>
#include <array>

std::string format_id(int id) {
    std::array<char, 32> buffer{};           // sized generously for any plausible int
    std::ospanstream out(std::span<char>(buffer));

    out << "ID-" << id;
    if (!out) {
        return "<error: id too large to format>";
    }
    auto written = std::move(out).span();
    return std::string(written.data(), written.size());
}
```

---

#### Q13
```cpp
import std;
#include <vector>   // Bug: also including a header already brought in by `import std;`

int main() {
    std::vector<int> v{1, 2, 3};
    return static_cast<int>(v.size());
}
```

**Answer:**
```
Implementation-defined: may compile fine, or may trigger redefinition/module-cache
build errors depending on toolchain module maturity
```

**Explanation:**
- `import std;` already makes all of `std::vector` and the rest of the standard library available
- Adding `#include <vector>` on top of that is redundant, and mixing the two consumption styles for the same standard entities in one translation unit is one of the least-tested paths across current compiler/module implementations
- The code is *conceptually* fine (both routes describe the same `std::vector`), but practically it invites build-system/module-cache bugs that a single, consistent style avoids
- **Key Concept:** Prefer exactly one style — either `import std;` or traditional `#include`s — per translation unit until your specific toolchain's modules support is verified mature; don't mix them "just in case"

**Fixed Version:**
```cpp
import std;   // no additional #include needed; std::vector is already available

int main() {
    std::vector<int> v{1, 2, 3};
    return static_cast<int>(v.size());
}
```

---

#### Q14
```cpp
#include <print>

int main() {
    std::string name = "world";
    std::print("Hello, {name}!\n");   // Bug: not valid std::format syntax, this isn't Python f-strings
}
```

**Answer:**
```
Compile error: "name" is not a valid replacement-field index/argument, and no argument named `name` was passed positionally
```

**Explanation:**
- `std::format`/`std::print`'s `{}` placeholders are positional (or explicitly numbered, `{0}`, `{1}`), not named-variable interpolation like Python f-strings or JavaScript template literals
- `{name}` is parsed as an attempt to reference an argument by that token, which doesn't correspond to how the library's replacement fields work, and fails to compile
- **Key Concept:** `std::format`/`std::print` placeholders bind to arguments by position (or explicit index), never by capturing a variable name from the enclosing scope

**Fixed Version:**
```cpp
#include <print>

int main() {
    std::string name = "world";
    std::print("Hello, {}!\n", name);
}
```

---

#### Q15
```cpp
#include <stacktrace>
#include <print>

void log_hot_path_call() {
    // Bug: capturing a full stacktrace on every call in a tight, hot loop
    auto trace = std::stacktrace::current();
    std::println("visited, {} frames", trace.size());
}

int main() {
    for (int i = 0; i < 1'000'000; ++i) {
        log_hot_path_call();   // called a million times
    }
}
```

**Answer:**
```
Severe performance regression: capturing a stacktrace a million times is far slower than the
work it's "logging"
```

**Explanation:**
- `std::stacktrace::current()` walks the call stack (and typically resolves symbol information) — it is not a cheap operation
- Calling it unconditionally inside a hot loop turns a trivial logging statement into the dominant cost of the program
- Stacktrace capture is intended for exceptional/error paths (e.g. attached to a thrown exception), not routine/hot-path tracing
- **Key Concept:** Reserve `std::stacktrace::current()` for rare, diagnostic-relevant events (errors, exceptions, first-time-seen conditions) — never call it unconditionally on a hot path

**Fixed Version:**
```cpp
#include <stacktrace>
#include <print>

void log_hot_path_call(bool trouble_detected) {
    if (trouble_detected) {   // only pay the cost when something is actually wrong
        auto trace = std::stacktrace::current();
        std::println("trouble! {} frames", trace.size());
    }
}

int main() {
    for (int i = 0; i < 1'000'000; ++i) {
        log_hot_path_call(false);   // cheap in the common case
    }
}
```

---
