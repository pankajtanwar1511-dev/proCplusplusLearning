## TOPIC: C++20 Standard Library Additions - New Tools for Modern Development

### INTERVIEW_QA: Key Concepts

---

#### Q1: What is `std::span` and when should you use it?

**Answer:**

`std::span` is a **non-owning view** over a contiguous sequence of elements. It's a lightweight object (pointer + size) that provides a unified interface for arrays, vectors, std::array, and other contiguous containers.

**Benefits:**

1. **Unified interface**: One function signature for all array-like types
2. **Zero overhead**: No copying, just references
3. **Safer than pointers**: Size information included
4. **STL integration**: Iterators, range-based for loops

**When to use:**

- Function parameters that accept array-like data
- Temporary views into containers
- Replacing raw pointer + size pairs

**When NOT to use:**

- When you need ownership (use `std::vector`, `std::array`)
- For non-contiguous containers (`std::list`, `std::deque`)
- When lifetime extends beyond source container

```cpp
// ✅ Good use
void process(std::span<const int> data) {
    for (int val : data) {
        // Read-only access
    }
}

// ❌ Bad: Returning span to local
std::span<int> bad() {
    int arr[] = {1, 2, 3};
    return arr;  // Dangling reference!
}
```

---

#### Q2: How does `std::format` differ from printf and iostreams?

**Answer:**

| Feature | `printf` | `iostreams` | `std::format` |
|---------|----------|-------------|---------------|
| Type-safe | ❌ No | ✅ Yes | ✅ Yes |
| Compile-time check | ❌ No | N/A | ✅ Yes (format string) |
| Performance | ✅ Fast | ❌ Slower (virtual calls) | ✅ Fast |
| Readability | ⚠️ Format codes | ❌ Verbose | ✅ Clear syntax |
| Return value | int (chars written) | ostream& | std::string |

**Examples:**

```cpp
int age = 30;
std::string name = "Alice";

// printf: Not type-safe
printf("Name: %s, Age: %d\n", name, age);  // ❌ UB if types wrong

// iostream: Verbose
std::cout << "Name: " << name << ", Age: " << age << '\n';

// std::format: Best of both
std::string msg = std::format("Name: {}, Age: {}", name, age);
```

**Compile-time checking:**

```cpp
int n = 42;

std::format("{:d}", n);    // ✅ OK: decimal format for int
std::format("{:f}", n);    // ❌ Compile error: float format for int
```

---

#### Q3: What's the difference between `std::thread` and `std::jthread`?

**Answer:**

| Feature | `std::thread` | `std::jthread` |
|---------|--------------|----------------|
| Auto-join | ❌ No (must call `join()` or `detach()`) | ✅ Yes (joins in destructor) |
| Cancellation | ❌ No built-in support | ✅ `stop_token` support |
| Safety | ⚠️ Terminates if joinable | ✅ Safe RAII |

**std::thread issue:**

```cpp
{
    std::thread t([]() { /* work */ });
    // ❌ Forgot to join/detach - std::terminate() called!
}
```

**std::jthread solution:**

```cpp
{
    std::jthread t([]() { /* work */ });
    // ✅ Automatically joins when t goes out of scope
}
```

**Cancellation:**

```cpp
std::jthread t([](std::stop_token stoken) {
    while (!stoken.stop_requested()) {
        // Work...
    }
});

t.request_stop();  // Cooperative cancellation
// t.join() called automatically in destructor
```

---

#### Q4: When would you use `std::latch` vs `std::barrier`?

**Answer:**

**`std::latch` - Single-use countdown:**
- Use when you need to wait for N operations to complete **once**
- Cannot be reused after counting down to zero

```cpp
std::latch work_done(3);  // Wait for 3 tasks

// Workers count down
work_done.count_down();

// Main thread waits
work_done.wait();
```

**`std::barrier` - Reusable synchronization point:**
- Use when threads need to synchronize **repeatedly** at multiple points
- Resets after all threads arrive

```cpp
std::barrier sync(3);  // 3 threads

for (int i = 0; i < 10; ++i) {
    // Phase 1 work
    sync.arrive_and_wait();  // Sync point

    // Phase 2 work
    sync.arrive_and_wait();  // Reused!
}
```

**Comparison:**

| Feature | `latch` | `barrier` |
|---------|---------|-----------|
| Reusable | ❌ No | ✅ Yes |
| Completion callback | ❌ No | ✅ Yes |
| Use case | One-time wait | Iterative synchronization |

---

#### Q5: What does `std::source_location::current()` do?

**Answer:**

`std::source_location::current()` captures information about the **call site** (file, line, column, function) at compile-time.

**Key Feature:** It's a **default argument** that captures the caller's location, not the callee's.

```cpp
void log(const char* msg,
         std::source_location loc = std::source_location::current()) {
    // loc contains information about where log() was CALLED
    std::cout << loc.file_name() << ":" << loc.line() << ": " << msg << '\n';
}

void foo() {
    log("Error");  // loc captures file, line IN foo()
}
```

**Replaces macros:**

```cpp
// ❌ C++17: Need macros
#define LOG(msg) log_impl(msg, __FILE__, __LINE__)

// ✅ C++20: No macro needed
log("message");  // Automatically captures location
```

**Available information:**

```cpp
auto loc = std::source_location::current();

loc.file_name();      // "example.cpp"
loc.line();           // 42
loc.column();         // 15
loc.function_name();  // "void my_function()"
```

---

#### Q6: How does `std::bit_cast` ensure safety compared to `reinterpret_cast`?

**Answer:**

`std::bit_cast` provides type-safe bit-level conversions with compile-time checks:

**Safety Guarantees:**

1. **Size check**: Both types must have the same size (compile error if not)
2. **Trivially copyable requirement**: Both types must be trivially copyable
3. **No undefined behavior**: Returns a new object, doesn't violate strict aliasing

```cpp
// ❌ reinterpret_cast: Undefined behavior
float f = 3.14f;
uint32_t* ptr = reinterpret_cast<uint32_t*>(&f);  // UB: violates aliasing
uint32_t bits = *ptr;

// ✅ std::bit_cast: Safe
float f = 3.14f;
uint32_t bits = std::bit_cast<uint32_t>(f);  // OK: no aliasing, constexpr-friendly
```

**Compile-Time Errors:**

```cpp
struct Small { char c; };     // 1 byte
struct Large { int a, b; };   // 8 bytes

auto x = std::bit_cast<Large>(Small{});  // ❌ Compile error: size mismatch

struct NonTrivial {
    std::string s;  // Not trivially copyable
};
auto y = std::bit_cast<int>(NonTrivial{});  // ❌ Compile error
```

---

#### Q7: What's the difference between `std::counting_semaphore` and `std::mutex`?

**Answer:**

| Feature | `std::mutex` | `std::counting_semaphore` |
|---------|-------------|--------------------------|
| **Max concurrent access** | 1 (binary lock) | N (configurable) |
| **Ownership** | ✅ Thread-owned | ❌ No ownership concept |
| **Same thread lock/unlock** | ✅ Required | ❌ Not required |
| **Use case** | Mutual exclusion | Resource limiting |

**Examples:**

```cpp
// mutex: Only 1 thread at a time
std::mutex mtx;
{
    std::lock_guard lock(mtx);  // Only one thread holds lock
    // Critical section
}  // Same thread must unlock

// semaphore: Up to N threads
std::counting_semaphore<3> sem(3);  // Max 3 concurrent
sem.acquire();  // Decrement (any thread can call)
// Use resource
sem.release();  // Increment (different thread can call!)
```

**When to use semaphore:**
- Resource pools (connection pools, thread pools)
- Producer-consumer with bounded buffer
- Limiting concurrent operations

---

#### Q8: How do subspans work in `std::span`?

**Answer:**

`std::span` provides three methods to create subspans:

**1. `first(n)` - First n elements:**

```cpp
std::vector<int> vec = {1, 2, 3, 4, 5};
std::span s(vec);

auto first_3 = s.first(3);  // {1, 2, 3}
```

**2. `last(n)` - Last n elements:**

```cpp
auto last_2 = s.last(2);  // {4, 5}
```

**3. `subspan(offset, count)` - General slice:**

```cpp
auto middle = s.subspan(1, 3);  // {2, 3, 4} (offset 1, count 3)
auto from_2 = s.subspan(2);     // {3, 4, 5} (offset 2, rest of span)
```

**Dynamic vs Fixed Extent:**

```cpp
std::span<int> dynamic = s.first(3);         // Size known at runtime
std::span<int, 3> fixed = s.first<3>();      // Size known at compile-time

static_assert(sizeof(dynamic) == 16);  // pointer + size
static_assert(sizeof(fixed) == 8);     // just pointer
```

**Edge Cases:**

```cpp
std::span<int> s(vec);

// ❌ Runtime error if out of bounds (debug mode)
auto bad = s.first(10);  // vec has only 5 elements

// ✅ OK: Empty subspan
auto empty = s.subspan(5, 0);  // Empty span at end
```

---

#### Q9: Explain `std::jthread` cancellation patterns.

**Answer:**

**Basic Cancellation:**

```cpp
std::jthread t([](std::stop_token stoken) {
    while (!stoken.stop_requested()) {
        // Do work
    }
});

t.request_stop();  // Signal thread to stop
// Joins automatically in destructor
```

**Callback on Stop Request:**

```cpp
std::jthread t([](std::stop_token stoken) {
    std::stop_callback cb(stoken, [] {
        std::cout << "Stop requested!\n";
    });

    while (!stoken.stop_requested()) {
        // Work
    }
});

t.request_stop();  // Callback fires immediately
```

**Condition Variable Integration:**

```cpp
std::mutex mtx;
std::condition_variable_any cv;
std::queue<int> tasks;

std::jthread worker([&](std::stop_token stoken) {
    while (!stoken.stop_requested()) {
        std::unique_lock lock(mtx);

        // Wait until data or stop requested
        cv.wait(lock, stoken, [&] { return !tasks.empty(); });

        if (stoken.stop_requested()) break;

        // Process task
        int task = tasks.front();
        tasks.pop();
    }
});

worker.request_stop();
cv.notify_all();  // Wake up waiting thread
```

---

#### Q10: What are the performance characteristics of `std::format`?

**Answer:**

**Benchmark Comparison:**

```cpp
// printf: Fast but not type-safe
printf("%s: %d\n", name.c_str(), age);  // ~100ns

// iostream: Slowest (virtual calls, manipulators)
std::cout << name << ": " << age << '\n';  // ~300ns

// std::format: Fast and type-safe
std::format("{}: {}", name, age);  // ~150ns
```

**Why `std::format` is Fast:**

1. **No virtual calls** (unlike iostreams)
2. **Compile-time format string parsing**
3. **Type erasure for arguments** (efficient storage)
4. **Minimal allocations** (single string allocation)

**Compile-Time Optimization:**

```cpp
// Compile-time checked
std::format("{:d}", 42);  // Format string validated at compile-time

// If format string is constexpr, entire parse can be optimized away
constexpr auto fmt = "{}: {}";
auto msg = std::format(fmt, name, age);  // Optimized
```

**Memory Efficiency:**

```cpp
// iostream: Multiple allocations
std::stringstream ss;
ss << "Value: " << val << ", Count: " << count;
auto str = ss.str();  // 2-3 allocations

// std::format: Single allocation
auto str = std::format("Value: {}, Count: {}", val, count);  // 1 allocation
```

---

#### Q11: How does endianness detection work with `std::endian`?

**Answer:**

`std::endian` provides compile-time endianness detection:

```cpp
#include <bit>

if constexpr (std::endian::native == std::endian::little) {
    // x86, ARM (most common)
    std::cout << "Little endian system\n";
} else if constexpr (std::endian::native == std::endian::big) {
    // Some mainframes, network byte order
    std::cout << "Big endian system\n";
} else {
    // Mixed endianness (rare)
    std::cout << "Mixed endianness\n";
}
```

**Use Case: Binary Serialization:**

```cpp
uint32_t to_network_order(uint32_t value) {
    if constexpr (std::endian::native == std::endian::little) {
        // Need to swap bytes for network (big endian)
        return ((value & 0xFF000000) >> 24) |
               ((value & 0x00FF0000) >> 8)  |
               ((value & 0x0000FF00) << 8)  |
               ((value & 0x000000FF) << 24);
    } else {
        return value;  // Already big endian
    }
}
```

**Compile-Time vs Runtime:**

```cpp
// std::endian: Compile-time constant
constexpr bool is_little = (std::endian::native == std::endian::little);

// Can be used in if constexpr (no runtime overhead)
if constexpr (is_little) {
    // Code only compiled on little-endian systems
}
```

---

#### Q12: What's the advantage of `std::to_array` over brace initialization?

**Answer:**

`std::to_array` provides **type deduction** and **perfect forwarding** for creating `std::array` from C arrays:

**Benefits:**

```cpp
// ❌ C++17: Manual type specification
std::array<int, 5> arr1 = {1, 2, 3, 4, 5};

// ✅ C++20: Type deduced
auto arr2 = std::to_array({1, 2, 3, 4, 5});  // std::array<int, 5>
```

**From C Array:**

```cpp
int c_array[] = {1, 2, 3};

// ❌ C++17: Can't convert without explicit copy
// std::array arr = c_array;  // Error

// ✅ C++20: Converts C array to std::array
auto arr = std::to_array(c_array);  // std::array<int, 3>
```

**Move Semantics:**

```cpp
std::string c_arr[] = {"hello", "world"};

// Moves strings (not copies)
auto arr = std::to_array(std::move(c_arr));  // std::array<std::string, 2>
```

**Template Deduction:**

```cpp
template<typename T>
void process(std::array<T, 3> arr) {
    // ...
}

// ✅ Works with to_array
process(std::to_array({1, 2, 3}));  // T deduced as int

// ❌ Doesn't work with brace-init
// process({1, 2, 3});  // Error: can't deduce array size
```

---

#### Q13: How do you customize `std::format` for custom types?

**Answer:**

Specialize `std::formatter` for your type:

```cpp
#include <format>

struct Point {
    int x, y;
};

// Specialize formatter
template<>
struct std::formatter<Point> {
    // Parse format specification
    constexpr auto parse(std::format_parse_context& ctx) {
        return ctx.begin();  // No custom format specs for now
    }

    // Format the Point
    auto format(const Point& p, std::format_context& ctx) const {
        return std::format_to(ctx.out(), "({}, {})", p.x, p.y);
    }
};

int main() {
    Point p{10, 20};
    std::cout << std::format("Point: {}", p);  // Point: (10, 20)
}
```

**With Custom Format Specs:**

```cpp
template<>
struct std::formatter<Point> {
    char presentation = 'p';  // 'p' for parens, 'b' for brackets

    constexpr auto parse(std::format_parse_context& ctx) {
        auto it = ctx.begin();
        if (it != ctx.end() && (*it == 'p' || *it == 'b')) {
            presentation = *it++;
        }
        return it;
    }

    auto format(const Point& p, std::format_context& ctx) const {
        if (presentation == 'p') {
            return std::format_to(ctx.out(), "({}, {})", p.x, p.y);
        } else {
            return std::format_to(ctx.out(), "[{}, {}]", p.x, p.y);
        }
    }
};

std::format("{:p}", p);  // (10, 20)
std::format("{:b}", p);  // [10, 20]
```

---

#### Q14: What are the timezone capabilities in C++20 chrono?

**Answer:**

C++20 adds comprehensive timezone support:

**1. Timezone Lookup:**

```cpp
#include <chrono>

auto ny_tz = std::chrono::locate_zone("America/New_York");
auto tokyo_tz = std::chrono::locate_zone("Asia/Tokyo");
auto utc_tz = std::chrono::locate_zone("UTC");
```

**2. Zoned Time:**

```cpp
using namespace std::chrono;

// Current time in different zones
auto now = system_clock::now();
auto ny_time = zoned_time{ny_tz, now};
auto tokyo_time = zoned_time{tokyo_tz, now};

std::cout << std::format("{}\n", ny_time);     // 2024-03-24 10:00:00 EDT
std::cout << std::format("{}\n", tokyo_time);  // 2024-03-24 23:00:00 JST
```

**3. Timezone Conversions:**

```cpp
// Create time in one zone, convert to another
auto ny_local = local_days{2024y/March/24} + 10h;  // 10 AM in NY
auto ny_zoned = zoned_time{ny_tz, ny_local};

// Convert to Tokyo time
auto tokyo_zoned = zoned_time{tokyo_tz, ny_zoned.get_sys_time()};
// Result: 2024-03-24 23:00:00 JST (13 hour difference)
```

**4. DST Handling:**

```cpp
// C++20 automatically handles DST transitions
auto spring_forward = zoned_time{ny_tz, local_days{2024y/March/10} + 2h};
// Correctly handles 2 AM → 3 AM DST transition
```

**5. Timezone Database:**

```cpp
// List all timezones
auto& db = std::chrono::get_tzdb();
for (const auto& zone : db.zones) {
    std::cout << zone.name() << '\n';
}
// America/New_York, Asia/Tokyo, Europe/London, ...
```

---

#### Q15: How does `std::erase` / `std::erase_if` improve on `erase-remove` idiom?

**Answer:**

**Old C++17 "erase-remove" idiom:**

```cpp
std::vector<int> vec = {1, 2, 3, 4, 5};

// ❌ Verbose, error-prone
vec.erase(std::remove(vec.begin(), vec.end(), 3), vec.end());

// Even worse for conditionals
vec.erase(std::remove_if(vec.begin(), vec.end(),
                         [](int n) { return n % 2 == 0; }),
          vec.end());
```

**C++20 `std::erase` / `std::erase_if`:**

```cpp
std::vector<int> vec = {1, 2, 3, 4, 5};

// ✅ Simple, clear
std::erase(vec, 3);  // Remove all 3s

std::erase_if(vec, [](int n) { return n % 2 == 0; });  // Remove evens
```

**Benefits:**

1. **Clearer intent**: Single function call
2. **Works with all containers**:
   ```cpp
   std::list<int> lst = {1, 2, 3};
   std::erase(lst, 2);  // Works!

   std::set<int> s = {1, 2, 3};
   std::erase_if(s, [](int n) { return n > 2; });  // Works!
   ```

3. **Returns count of erased elements**:
   ```cpp
   size_t removed = std::erase(vec, 3);
   std::cout << removed << " elements removed\n";
   ```

---

#### Q16: What is `std::midpoint` and how does it provide overflow safety?

**Answer:**

`std::midpoint` safely computes the midpoint of two values without overflow:

- **Overflow-safe**: Computes `(a + b) / 2` without intermediate overflow
- **Works for integers and pointers**
- Example: `std::midpoint(INT_MAX, INT_MAX-2)` → correct result

```cpp
int a = INT_MAX, b = INT_MAX - 4;
auto mid = std::midpoint(a, b);  // Correctly computes midpoint without overflow
// Result: INT_MAX - 2 (2147483645)
```

**Traditional approach (has overflow):**
```cpp
int mid = (a + b) / 2;  // ❌ Overflow! a + b exceeds INT_MAX
```

---

#### Q17: What is `std::lerp` and how does it perform linear interpolation?

**Answer:**

`std::lerp` performs linear interpolation between two values:

- **Formula**: `lerp(a, b, t) = a + t*(b-a)`
- **Handles floating-point edge cases correctly**
- Example: `lerp(0.0, 10.0, 0.5)` → `5.0`

```cpp
double start = 0.0, end = 10.0;
double quarter = std::lerp(start, end, 0.25);   // 2.5
double half = std::lerp(start, end, 0.5);       // 5.0
double three_quarters = std::lerp(start, end, 0.75);  // 7.5
```

**Use cases**: Animation, graphics, smooth transitions

---

#### Q18: What is `std::ssize` and why is it safer than `size()`?

**Answer:**

`std::ssize` returns **signed** size (`ptrdiff_t`) instead of unsigned `size_t`:

- **Safer for loops**: Avoids unsigned comparison issues
- **Prevents underflow bugs**
- Example: `for (auto i = 0; i < std::ssize(vec); ++i)`

```cpp
std::vector<int> vec = {1, 2, 3};

// ❌ Problematic with unsigned size()
for (size_t i = vec.size() - 1; i >= 0; --i) {  // Infinite loop! size_t wraps
    // ...
}

// ✅ Safe with ssize()
for (auto i = std::ssize(vec) - 1; i >= 0; --i) {  // OK: signed comparison
    // ...
}
```

---

#### Q19: What are the bit manipulation operations in `<bit>` header?

**Answer:**

C++20 `<bit>` header provides hardware-accelerated bit operations:

**Bit counting:**
- `std::popcount(n)`: Count 1 bits (e.g., `popcount(0b10110100)` → 4)
- `std::countl_zero(n)`: Leading zeros
- `std::countr_zero(n)`: Trailing zeros

**Bit rotations:**
- `std::rotl(n, k)`: Rotate left by k bits
- `std::rotr(n, k)`: Rotate right by k bits

**Power of 2 operations:**
- `std::has_single_bit(n)`: Check if power of 2
- `std::bit_ceil(n)`: Next power of 2
- `std::bit_floor(n)`: Previous power of 2

All operations are **hardware-accelerated** on modern CPUs (single instruction).

---

#### Q20: What mathematical constants are available in C++20's `<numbers>` header?

**Answer:**

C++20 provides compile-time mathematical constants in `<numbers>`:

**Available constants:**
- `std::numbers::pi`: π (3.14159...)
- `std::numbers::e`: Euler's number (2.71828...)
- `std::numbers::sqrt2`: √2 (1.41421...)
- `std::numbers::ln2`: ln(2) (0.693147...)
- `std::numbers::phi`: Golden ratio (1.61803...)

**Type-specific versions:**
```cpp
std::numbers::pi_v<float>;        // float precision
std::numbers::pi_v<double>;       // double precision (default)
std::numbers::pi_v<long double>;  // long double precision
```

**Benefits over `M_PI` macros:**
- Type-safe (no implicit conversions)
- More precise
- Compile-time constants (constexpr)

---
