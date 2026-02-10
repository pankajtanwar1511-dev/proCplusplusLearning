# Chapter 16: C++17 Features - Standard Library Additions

## TOPIC: C++17 Standard Library - optional, variant, any, string_view, filesystem

C++17 introduced powerful new standard library types that provide safer, more expressive alternatives to traditional C++ patterns. This chapter covers **std::optional** for optional values, **std::variant** for type-safe unions, **std::any** for runtime type flexibility, **std::string_view** for non-owning string references, and **std::filesystem** for portable file operations. These types are essential for modern C++ and are frequently tested in technical interviews.

**Why these features matter:**
- **std::optional** eliminates sentinel values and nullptr checks
- **std::variant** provides type-safe unions and compile-time polymorphism
- **std::any** enables runtime type flexibility without void*
- **std::string_view** avoids string copies with non-owning views
- **std::filesystem** provides portable, safe file/directory operations

**Key innovations:**
- Value semantics for optional data
- Zero-overhead type-safe unions
- Type-erased containers with runtime type information
- Efficient string handling without allocations
- Cross-platform filesystem abstraction

---

### THEORY_SECTION: Core Concepts

#### std::optional<T> - Optional Value Container

`std::optional<T>` is a wrapper that may or may not contain a value of type T. It's a safer, more expressive alternative to returning pointers or sentinel values (-1, empty strings) to indicate "no result."

**Key operations:**
- Construction: `std::optional<int> o;` creates empty optional
- Assignment: `o = 42;` or `o = std::nullopt;`
- Checking: `if (o)` or `o.has_value()`
- Access: `*o` or `o.value()` (throws if empty)
- Safe access: `o.value_or(default)` returns value or fallback

**Why use optional:**
1. **Replacing raw pointers**: No heap allocation, clear intent
2. **Avoiding sentinel values**: No magic -1 or empty string constants
3. **Function return values**: Explicit "may fail" semantics
4. **Optional parameters**: Type-safe optional arguments

**Common patterns:**
```cpp
// Safe return from search
std::optional<size_t> findIndex(const vector<int>& v, int target) {
    for (size_t i = 0; i < v.size(); ++i)
        if (v[i] == target) return i;
    return std::nullopt;
}

// Optional configuration
void configure(std::optional<int> customValue) {
    int final = customValue.value_or(100);  // Use default if empty
}
```

**Gotchas:**
- `.value()` throws `std::bad_optional_access` if empty
- `*opt` has undefined behavior if empty (like dereferencing nullptr)
- Copying can be expensive for large types; consider `std::optional<std::reference_wrapper<T>>`

#### std::variant<Ts...> - Type-Safe Union

`std::variant<Ts...>` is a type-safe union that holds exactly one value from a fixed set of types. It combines the space efficiency of unions with type safety and awareness.

**Key features:**
- **Inline storage**: No heap allocation (unlike std::any)
- **Type-safe access**: `std::get<T>(v)` checks type at runtime
- **Visitor pattern**: `std::visit` for type-based dispatch
- **Zero overhead**: Same size as largest type + discriminator

**Access methods:**
```cpp
std::variant<int, string> v = 42;

// Direct access (throws if wrong type)
int x = std::get<int>(v);           // OK
// int x = std::get<string>(v);     // Throws std::bad_variant_access

// Safe check before access
if (std::holds_alternative<int>(v)) {
    int x = std::get<int>(v);
}

// Pointer-based check (returns nullptr if wrong type)
if (auto* p = std::get_if<int>(&v)) {
    int x = *p;
}

// Index-based access
int x = std::get<0>(v);  // First type in variant
```

**Visitor pattern:**
```cpp
std::visit([](auto&& value) {
    using T = std::decay_t<decltype(value)>;
    if constexpr (std::is_same_v<T, int>) {
        std::cout << "int: " << value;
    } else {
        std::cout << "string: " << value;
    }
}, v);
```

**Use cases:**
- Alternative to inheritance when types are known at compile time
- State machines with different state types
- Return multiple possible types from a function
- Avoid vtable overhead of virtual functions

**Pitfalls:**
- **Ambiguous construction**: `std::variant<int, long> v = 42;` ambiguous (use `std::in_place_type<int>`)
- **Valueless by exception**: Can enter invalid state if assignment throws
- **Size overhead**: Size is max of all types plus discriminator (usually 1-8 bytes)

#### std::any - Runtime Type Flexibility

`std::any` is a type-erased container for single values of any type. Unlike `void*`, it preserves type information and provides safe casting.

**Key characteristics:**
- **Type erasure**: Stores any type, preserves type info internally
- **Heap allocation**: May allocate for large types (small buffer optimization for small types)
- **Runtime type checking**: Safe casting with `std::any_cast`

**Usage:**
```cpp
std::any a = 42;
std::any b = std::string("hello");
std::any c = std::vector<int>{1, 2, 3};

// Access (throws if wrong type)
int x = std::any_cast<int>(a);

// Safe pointer-based access
if (auto* p = std::any_cast<int>(&a)) {
    int x = *p;
}

// Check if empty
if (a.has_value()) { /* ... */ }

// Type info
const std::type_info& t = a.type();
```

**When to use:**
- Plugin systems with unknown types
- Scripting language integration
- Dynamic configuration systems
- Replacing `void*` in legacy APIs

**When NOT to use:**
- When types are known at compile time (use `variant` instead)
- Performance-critical code (has overhead)
- When you need compile-time type safety

**Comparison:**
- `std::optional<T>`: May or may not have value of fixed type T
- `std::variant<Ts...>`: Has value of one of fixed types Ts
- `std::any`: Has value of any type (determined at runtime)

#### std::string_view - Non-Owning String Reference

`std::string_view` is a lightweight, non-owning reference to a character sequence. It's like a pointer+length pair but with string-like interface.

**Key benefits:**
- **Zero copy**: No allocation, just references existing memory
- **Works with multiple sources**: `std::string`, C strings, string literals, substrings
- **Efficient substring**: O(1) `substr` operation (just adjusts view)

**Common use cases:**
```cpp
// Function parameter (avoids copy)
void process(std::string_view sv) {
    std::cout << sv;  // No allocation needed
}

process("literal");          // OK
process(std::string("str")); // OK, no copy
process(cstring);            // OK

// Efficient substring
std::string_view sv = "hello world";
auto sub = sv.substr(0, 5);  // O(1), no allocation
```

**Critical safety warning:**
`string_view` does NOT own the data it references. The underlying string must outlive the view:

```cpp
std::string_view danger() {
    std::string s = "temporary";
    return s;  // ❌ DANGLING! s destroyed, view is invalid
}

std::string_view safe(const std::string& s) {
    return s;  // ✅ OK if s outlives the returned view
}
```

**Best practices:**
- Use for function parameters instead of `const std::string&`
- Never return `string_view` from a function unless input outlives output
- Don't store `string_view` in long-lived objects
- Be careful with temporaries

#### std::filesystem - Portable File Operations

`std::filesystem` provides a portable, object-oriented interface for file and directory operations. It replaces platform-specific APIs with a single, standard interface.

**Core types:**
- `std::filesystem::path`: Represents file system paths
- `std::filesystem::directory_entry`: Represents a directory entry
- `std::filesystem::directory_iterator`: Iterates over directory contents

**Common operations:**
```cpp
namespace fs = std::filesystem;

// Path manipulation
fs::path p = "/usr/local/bin/app";
p.filename();      // "app"
p.extension();     // ""
p.parent_path();   // "/usr/local/bin"
p / "subdir";      // "/usr/local/bin/app/subdir" (append)

// File queries
fs::exists(p);
fs::is_regular_file(p);
fs::is_directory(p);
fs::file_size(p);
fs::last_write_time(p);

// Directory operations
fs::create_directory(p);
fs::create_directories(p);  // Create all parents
fs::remove(p);
fs::remove_all(p);  // Recursive delete
fs::copy(src, dst);

// Directory iteration
for (const auto& entry : fs::directory_iterator("/path")) {
    std::cout << entry.path() << "\n";
}

// Recursive iteration
for (const auto& entry : fs::recursive_directory_iterator("/path")) {
    if (entry.is_regular_file()) {
        std::cout << entry.path() << "\n";
    }
}
```

**Error handling:**
Most operations have two overloads:
1. Throwing version: Throws `std::filesystem::filesystem_error`
2. Non-throwing version: Takes `std::error_code&` parameter

```cpp
std::error_code ec;
if (fs::remove("file.txt", ec)) {
    std::cout << "Removed\n";
} else {
    std::cout << "Error: " << ec.message() << "\n";
}
```

**Use cases in automotive:**
- Log file management (rotation, cleanup)
- Configuration file loading
- Recording data storage
- Map data file operations

---

### EDGE_CASES: Tricky Scenarios

#### Edge Case 1: optional and Bool Conversion

```cpp
std::optional<bool> opt_bool = false;

if (opt_bool) {  // ✅ Checks if optional has value (true)
    std::cout << "Has value: " << *opt_bool;  // Prints "Has value: 0"
}

// To check the bool value itself:
if (opt_bool && *opt_bool) {  // ✅ Correct
    std::cout << "True value";
}
```

When an optional contains a bool, checking `if (opt)` tests if the optional has a value, not the bool's value. This is a common source of logic bugs.

**Key takeaway:** With `optional<bool>`, separate "has value" check from "value is true" check.

#### Edge Case 2: variant Ambiguous Assignment

```cpp
std::variant<int, long> v1 = 42;  // ❌ Ambiguous - is it int or long?

// Solution 1: Use in_place_type
std::variant<int, long> v2(std::in_place_type<int>, 42);

// Solution 2: Explicit cast
std::variant<int, long> v3 = static_cast<int>(42);

// Solution 3: Use type suffix
std::variant<int, long> v4 = 42L;  // Explicitly long
```

When multiple types in a variant can be constructed from the same value, assignment is ambiguous. Use explicit type specification.

**Key takeaway:** Disambiguate variant construction with in_place_type or explicit casts when multiple types match.

#### Edge Case 3: string_view Substring Invalidation

```cpp
std::string str = "hello world";
std::string_view sv = str;
std::string_view sub = sv.substr(0, 5);  // "hello"

str = "different";  // ❌ sv and sub now dangle!
std::cout << sub;   // UB
```

Modifying the underlying string invalidates ALL views to it, including substrings. The same issue occurs if the string reallocates.

**Key takeaway:** string_view lifetime is tied to the source string; any modification invalidates the view.

#### Edge Case 4: any and CV Qualifiers

```cpp
const int x = 42;
std::any a = x;

// ❌ This fails!
const int* p = std::any_cast<const int>(&a);  // Returns nullptr

// ✅ Correct - any stores non-const
int* p2 = std::any_cast<int>(&a);  // Works
```

`std::any` strips cv-qualifiers when storing values. The stored type is always non-const, even if the source was const.

**Key takeaway:** any strips const/volatile; cast to non-const type even if original was const.

#### Edge Case 5: filesystem and Symlinks

```cpp
namespace fs = std::filesystem;

// Create symlink
fs::create_symlink("target.txt", "link.txt");

// Different behaviors
fs::file_size("link.txt");        // Size of target (follows symlink)
fs::symlink_status("link.txt");   // Status of link itself
fs::is_symlink("link.txt");       // true
fs::status("link.txt");           // Status of target
```

Many filesystem operations follow symlinks by default. Use `symlink_*` variants to operate on the link itself.

**Key takeaway:** Be explicit about whether you want to follow symlinks; default behavior follows them.

---

### CODE_EXAMPLES: Practical Demonstrations

#### Example 1: optional for Safe Sensor Reading

```cpp
#include <optional>
#include <iostream>
#include <vector>

struct SensorData {
    int id;
    double value;
};

// Returns optional instead of using sentinel values or pointers
std::optional<SensorData> readSensor(int sensor_id) {
    // Simulate sensor failure
    if (sensor_id < 0 || sensor_id > 10) {
        return std::nullopt;  // Clear "no data" signal
    }
    return SensorData{sensor_id, 23.5 + sensor_id};
}

void processSensors() {
    for (int id = 0; id < 12; ++id) {
        auto data = readSensor(id);

        // Clean check with value_or for fallback
        double value = data.transform([](const SensorData& d) {
            return d.value;
        }).value_or(0.0);

        std::cout << "Sensor " << id << ": ";
        if (data) {
            std::cout << data->value << "°C\n";
        } else {
            std::cout << "No reading\n";
        }
    }
}
```

This eliminates the need for special "invalid" sensor readings like -999.0 or nullptr returns. The API clearly signals that reading may fail.

#### Example 2: variant for State Machine

```cpp
#include <variant>
#include <iostream>
#include <string>

// Different states for an autonomous vehicle
struct Idle { };
struct Driving { double speed; };
struct Parked { std::string location; };
struct Emergency { int code; std::string reason; };

using VehicleState = std::variant<Idle, Driving, Parked, Emergency>;

class Vehicle {
    VehicleState state = Idle{};

public:
    void setState(VehicleState new_state) {
        state = new_state;
    }

    void printStatus() {
        std::visit([](auto&& s) {
            using T = std::decay_t<decltype(s)>;
            if constexpr (std::is_same_v<T, Idle>) {
                std::cout << "Vehicle is idle\n";
            } else if constexpr (std::is_same_v<T, Driving>) {
                std::cout << "Driving at " << s.speed << " km/h\n";
            } else if constexpr (std::is_same_v<T, Parked>) {
                std::cout << "Parked at " << s.location << "\n";
            } else if constexpr (std::is_same_v<T, Emergency>) {
                std::cout << "EMERGENCY " << s.code << ": " << s.reason << "\n";
            }
        }, state);
    }
};

int main() {
    Vehicle v;
    v.printStatus();  // Idle

    v.setState(Driving{60.0});
    v.printStatus();  // Driving at 60 km/h

    v.setState(Emergency{911, "Obstacle detected"});
    v.printStatus();  // EMERGENCY
}
```

Using variant for state machines provides type safety, zero overhead, and compile-time exhaustiveness checking compared to enum+union or inheritance hierarchies.

#### Example 3: string_view for Efficient Parsing

```cpp
#include <string_view>
#include <vector>
#include <iostream>

// Zero-copy string splitting
std::vector<std::string_view> split(std::string_view sv, char delimiter) {
    std::vector<std::string_view> result;
    size_t start = 0;

    while (true) {
        size_t end = sv.find(delimiter, start);
        if (end == std::string_view::npos) {
            result.push_back(sv.substr(start));
            break;
        }
        result.push_back(sv.substr(start, end - start));
        start = end + 1;
    }

    return result;
}

void parseLogLine(std::string_view log_line) {
    // No allocations until we actually need to store something
    auto fields = split(log_line, ',');

    for (const auto& field : fields) {
        std::cout << "[" << field << "] ";
    }
    std::cout << "\n";
}

int main() {
    std::string log = "2024-01-15,ERROR,sensor_failure,id:42";
    parseLogLine(log);  // Zero copies, just views into original string
}
```

Using `string_view` for parsing avoids allocating temporary strings for each field. The views reference the original string data.

#### Example 4: any for Plugin System

```cpp
#include <any>
#include <map>
#include <string>
#include <iostream>

class PluginRegistry {
    std::map<std::string, std::any> plugins;

public:
    template<typename T>
    void registerPlugin(const std::string& name, T plugin) {
        plugins[name] = plugin;
    }

    template<typename T>
    T* getPlugin(const std::string& name) {
        auto it = plugins.find(name);
        if (it == plugins.end()) return nullptr;

        return std::any_cast<T>(&it->second);
    }
};

// Different plugin types
struct SensorPlugin {
    void read() { std::cout << "Reading sensor\n"; }
};

struct LoggerPlugin {
    void log(const std::string& msg) { std::cout << "Log: " << msg << "\n"; }
};

int main() {
    PluginRegistry registry;

    registry.registerPlugin("sensor", SensorPlugin{});
    registry.registerPlugin("logger", LoggerPlugin{});

    if (auto* sensor = registry.getPlugin<SensorPlugin>("sensor")) {
        sensor->read();
    }

    if (auto* logger = registry.getPlugin<LoggerPlugin>("logger")) {
        logger->log("System started");
    }
}
```

`std::any` enables storing heterogeneous plugin types in a single container without inheritance or type erasure wrappers.

#### Example 5: filesystem for Log Management

```cpp
#include <filesystem>
#include <iostream>
#include <fstream>
#include <chrono>

namespace fs = std::filesystem;

class LogManager {
    fs::path log_directory;
    size_t max_log_size = 10 * 1024 * 1024;  // 10 MB
    int max_log_files = 5;

public:
    LogManager(const fs::path& dir) : log_directory(dir) {
        if (!fs::exists(log_directory)) {
            fs::create_directories(log_directory);
        }
    }

    void rotateLogsIfNeeded() {
        auto log_file = log_directory / "current.log";

        if (!fs::exists(log_file) || fs::file_size(log_file) < max_log_size) {
            return;  // No rotation needed
        }

        // Rotate: current.log -> log_1.log, log_1.log -> log_2.log, etc.
        for (int i = max_log_files - 1; i >= 1; --i) {
            auto old_log = log_directory / ("log_" + std::to_string(i) + ".log");
            auto new_log = log_directory / ("log_" + std::to_string(i + 1) + ".log");

            if (fs::exists(old_log)) {
                fs::rename(old_log, new_log);
            }
        }

        fs::rename(log_file, log_directory / "log_1.log");
    }

    void cleanOldLogs() {
        std::vector<fs::path> log_files;

        for (const auto& entry : fs::directory_iterator(log_directory)) {
            if (entry.path().extension() == ".log") {
                log_files.push_back(entry.path());
            }
        }

        // Sort by modification time
        std::sort(log_files.begin(), log_files.end(), [](const fs::path& a, const fs::path& b) {
            return fs::last_write_time(a) < fs::last_write_time(b);
        });

        // Remove oldest files beyond max count
        while (log_files.size() > max_log_files) {
            fs::remove(log_files.front());
            log_files.erase(log_files.begin());
        }
    }

    void printLogInfo() {
        std::cout << "Log directory: " << log_directory << "\n";
        for (const auto& entry : fs::directory_iterator(log_directory)) {
            if (entry.is_regular_file()) {
                std::cout << "  " << entry.path().filename()
                          << " (" << fs::file_size(entry) << " bytes)\n";
            }
        }
    }
};
```

This demonstrates practical filesystem usage for a common automotive task: managing rolling log files with size and count limits.

---

### INTERVIEW_QA: Comprehensive Questions

#### Q1: What is std::optional and when should you use it?
**Difficulty:** #beginner
**Category:** #stl #interview_favorite
**Concepts:** #optional #null_safety #return_values

**Answer:**
`std::optional<T>` is a wrapper that may or may not contain a value of type T. Use it instead of pointers or sentinel values to indicate optional data or function failure.

**Code example:**
```cpp
std::optional<int> findValue(const vector<int>& v, int target) {
    auto it = std::find(v.begin(), v.end(), target);
    if (it != v.end()) return *it;
    return std::nullopt;
}
```

**Explanation:**
Optional provides value semantics without heap allocation. It clearly expresses "may not have value" in the type system, preventing null pointer errors. Unlike returning `-1` or `nullptr`, optional is type-safe and explicit.

**Key takeaway:** Use std::optional for function returns that may not produce a value; it's safer and more expressive than pointers or sentinel values.

---

#### Q2: What's the difference between std::variant and std::any?
**Difficulty:** #intermediate
**Category:** #stl #type_system
**Concepts:** #variant #any #type_erasure #unions

**Answer:**
`variant` holds one of a fixed set of types known at compile time with zero overhead. `any` holds any type determined at runtime with heap allocation overhead.

**Code example:**
```cpp
std::variant<int, string> v = 42;  // Types fixed, no heap
std::any a = 42;  // Any type, may allocate
a = vector<int>{1,2,3};  // Can change to any type
```

**Explanation:**
variant is a type-safe union with compile-time type checking. any uses type erasure for runtime flexibility but has performance cost. Use variant when types are known, any when types are truly dynamic (plugins, scripting).

**Key takeaway:** Prefer variant for known types (faster, type-safe); use any only when types are determined at runtime.

---

#### Q3: What is a std::string_view and what's its main danger?
**Difficulty:** #intermediate
**Category:** #stl #memory
**Concepts:** #string_view #lifetime #dangling_reference

**Answer:**
`string_view` is a non-owning reference to a string (pointer + length). The main danger is the referenced string must outlive the view, otherwise you get a dangling reference.

**Code example:**
```cpp
std::string_view danger() {
    std::string s = "temp";
    return s;  // ❌ Dangling! s destroyed
}

void safe(std::string_view sv) {
    std::cout << sv;  // ✅ OK if caller's string outlives function
}
```

**Explanation:**
string_view is like a pointer - fast and efficient but doesn't own data. Returning string_view from functions is dangerous if it references a temporary. Use it primarily for function parameters to avoid string copies.

**Key takeaway:** string_view is a non-owning view; ensure the source string outlives the view to avoid dangling references.

---

#### Q4: How do you safely access a std::variant value?
**Difficulty:** #intermediate
**Category:** #stl #safety
**Concepts:** #variant #type_checking #std_get

**Answer:**
Use `std::holds_alternative<T>` to check first, `std::get_if<T>` for pointer-based access, or `std::visit` for exhaustive handling of all types.

**Code example:**
```cpp
std::variant<int, string> v = 42;

// Method 1: Check then get
if (std::holds_alternative<int>(v)) {
    int x = std::get<int>(v);
}

// Method 2: get_if (returns nullptr if wrong type)
if (auto* p = std::get_if<int>(&v)) {
    int x = *p;
}

// Method 3: visit
std::visit([](auto&& val) { std::cout << val; }, v);
```

**Explanation:**
`std::get<T>` throws if variant doesn't hold T. `holds_alternative` checks without throwing. `get_if` returns pointer (nullptr if wrong type). `visit` handles all types safely. Choose based on whether you want exceptions or nullptr checks.

**Key takeaway:** Always check variant type before access; use holds_alternative, get_if, or visit to avoid exceptions.

---

#### Q5: What happens when you access an empty std::optional?
**Difficulty:** #beginner
**Category:** #stl #undefined_behavior
**Concepts:** #optional #exceptions #undefined_behavior

**Answer:**
Accessing with `*opt` is undefined behavior. Using `.value()` throws `std::bad_optional_access`. Use `.value_or(default)` for safe access with fallback.

**Code example:**
```cpp
std::optional<int> empty;
// int x = *empty;          // ❌ UB
// int y = empty.value();   // ❌ Throws
int z = empty.value_or(42); // ✅ Returns 42
```

**Explanation:**
Like dereferencing nullptr, accessing empty optional with `operator*` is undefined behavior. `.value()` provides checked access with exception. `.value_or()` provides default value if empty. Always check `has_value()` or use `value_or()`.

**Key takeaway:** Check optional with if(opt) or has_value() before dereferencing; use value_or() for safe default values.

---

#### Q6: When should you use std::visit with std::variant?
**Difficulty:** #advanced
**Category:** #stl #patterns
**Concepts:** #variant #std_visit #visitor_pattern

**Answer:**
Use `std::visit` when you need to handle all variant types exhaustively, ensuring compile-time completeness checking. It's safer than manual type checking.

**Code example:**
```cpp
std::variant<int, double, string> v = 42;

std::visit([](auto&& val) {
    using T = std::decay_t<decltype(val)>;
    if constexpr (std::is_arithmetic_v<T>) {
        std::cout << "Number: " << val;
    } else {
        std::cout << "String: " << val;
    }
}, v);
```

**Explanation:**
`visit` applies a callable to the variant's current value, with the callable instantiated for each possible type. This ensures all types are handled. Combined with `if constexpr`, you can write type-dependent logic cleanly without multiple `get` calls.

**Key takeaway:** Use std::visit for exhaustive variant handling; it ensures all types are covered and enables clean type-dependent logic.

---

#### Q7: What is std::filesystem::path and how does it handle portability?
**Difficulty:** #intermediate
**Category:** #stl #filesystem
**Concepts:** #filesystem #path #portability

**Answer:**
`std::filesystem::path` represents file paths and automatically handles platform differences (/ vs \\, character encoding). It provides portable path manipulation.

**Code example:**
```cpp
namespace fs = std::filesystem;
fs::path p = fs::current_path() / "logs" / "app.log";
std::cout << p;  // Uses correct separator for platform
```

**Explanation:**
path handles Windows vs Unix path separators, encoding (UTF-8 on Unix, UTF-16 on Windows), and provides operations like `filename()`, `extension()`, `parent_path()`. The `/` operator appends paths with correct separators. This abstracts platform differences for portable code.

**Key takeaway:** Use std::filesystem::path for portable path handling; it automatically manages platform-specific separators and encoding.

---

#### Q8: Can std::optional contain a reference?
**Difficulty:** #advanced
**Category:** #stl #references
**Concepts:** #optional #references #reference_wrapper

**Answer:**
Yes, but use `std::optional<std::reference_wrapper<T>>` or `std::optional<T*>`. Direct `optional<T&>` is not standard (though some implementations support it).

**Code example:**
```cpp
int x = 42;
// std::optional<int&> opt_ref = x;  // Not standard
std::optional<std::reference_wrapper<int>> opt_ref = std::ref(x);
opt_ref->get() = 100;  // Modifies x
```

**Explanation:**
optional owns its value, which conflicts with reference semantics. `reference_wrapper` provides reference-like behavior in value containers. Alternatively, use `optional<T*>` for nullable pointers. This maintains optional's value semantics while allowing reference-like behavior.

**Key takeaway:** Use optional<reference_wrapper<T>> or optional<T*> for optional references; direct optional<T&> is non-standard.

---

#### Q9: What is the valueless_by_exception state in std::variant?
**Difficulty:** #advanced
**Category:** #stl #exception_safety
**Concepts:** #variant #exceptions #valueless

**Answer:**
If a variant assignment or emplacement throws during type change, the variant may become valueless (holds no value). This is a rare state checked with `.valueless_by_exception()`.

**Code example:**
```cpp
std::variant<int, string> v = "hello";
try {
    v.emplace<string>(1000000000, 'x');  // May throw bad_alloc
} catch(...) {}
std::cout << v.valueless_by_exception();  // May be true
```

**Explanation:**
When changing variant type, the old value is destroyed before constructing the new one. If construction throws, variant is left in invalid state. This is rare but must be handled. Check `valueless_by_exception()` after operations that might throw. Most code doesn't need to worry about this.

**Key takeaway:** variant can become valueless if assignment throws; check valueless_by_exception() in exception-heavy code.

---

#### Q10: How do you iterate over a directory with std::filesystem?
**Difficulty:** #beginner
**Category:** #stl #filesystem
**Concepts:** #filesystem #directory_iterator #iteration

**Answer:**
Use `std::filesystem::directory_iterator` for non-recursive or `recursive_directory_iterator` for recursive traversal.

**Code example:**
```cpp
namespace fs = std::filesystem;
for (const auto& entry : fs::directory_iterator("/path")) {
    if (entry.is_regular_file()) {
        std::cout << entry.path().filename() << "\n";
    }
}
```

**Explanation:**
`directory_iterator` provides a range-based interface for directory contents. Each entry is a `directory_entry` with methods like `is_regular_file()`, `is_directory()`, `path()`. Use `recursive_directory_iterator` to traverse subdirectories automatically. Both throw on errors unless using error_code overloads.

**Key takeaway:** Use directory_iterator for directory traversal; it provides a clean range-based interface with filtering capabilities.

---

#### Q11: What's the difference between optional::value() and operator*?
**Difficulty:** #beginner
**Category:** #stl #safety
**Concepts:** #optional #exceptions #undefined_behavior

**Answer:**
`.value()` throws `std::bad_optional_access` if empty. `operator*` has undefined behavior if empty (like dereferencing nullptr).

**Code example:**
```cpp
std::optional<int> empty;
// int x = *empty;       // ❌ UB (crash or garbage)
// int y = empty.value(); // ❌ Throws exception
int z = empty.value_or(0); // ✅ Safe, returns 0
```

**Explanation:**
Use `.value()` when you want exceptions for missing values (fail-fast). Use `operator*` only after checking `has_value()` for performance. Use `.value_or()` when a default makes sense. Never use `operator*` without checking first.

**Key takeaway:** Use value() for checked access with exceptions; use operator* only after verifying has_value(); prefer value_or() for defaults.

---

#### Q12: How does std::any store type information?
**Difficulty:** #advanced
**Category:** #stl #type_erasure
**Concepts:** #any #type_erasure #rtti

**Answer:**
`std::any` uses type erasure internally, storing a `std::type_info` pointer alongside the value. This enables runtime type checking via `any_cast`.

**Code example:**
```cpp
std::any a = 42;
const std::type_info& t = a.type();
if (t == typeid(int)) {
    int x = std::any_cast<int>(a);
}
```

**Explanation:**
any wraps the value and its type info using type erasure (similar to virtual functions). This allows `any_cast` to check types at runtime. Small values (typically ≤ pointer size) may use small buffer optimization. Large values are heap-allocated. The type info overhead is minimal (one pointer).

**Key takeaway:** any uses type erasure with runtime type information; enables safe casting but has allocation and RTTI overhead.

---

#### Q13: What's a common pitfall with string_view in function returns?
**Difficulty:** #intermediate
**Category:** #stl #lifetime
**Concepts:** #string_view #dangling_reference #lifetime

**Answer:**
Returning `string_view` that references a local string or temporary creates a dangling reference, causing undefined behavior.

**Code example:**
```cpp
// ❌ WRONG
std::string_view getBadView() {
    std::string s = "local";
    return s;  // s destroyed, view dangles
}

// ✅ CORRECT
std::string getGoodString() {
    return "local";  // Returns owned string
}
```

**Explanation:**
string_view is a non-owning view. When the source string is destroyed, the view becomes invalid. Never return string_view from functions unless you're returning a view to a parameter or static data. Return `std::string` by value (move-optimized) for owned data.

**Key takeaway:** Never return string_view to local/temporary strings; return std::string by value for owned data.

---

#### Q14: How do you check which type a variant currently holds?
**Difficulty:** #beginner
**Category:** #stl #type_checking
**Concepts:** #variant #holds_alternative #index

**Answer:**
Use `std::holds_alternative<T>(v)` to check by type or `v.index()` to get the index of the current type.

**Code example:**
```cpp
std::variant<int, string, double> v = 3.14;

if (std::holds_alternative<double>(v)) {  // true
    double d = std::get<double>(v);
}

size_t idx = v.index();  // 2 (third type)
```

**Explanation:**
`holds_alternative<T>` returns bool without throwing. `index()` returns 0-based index of current type in variant's template parameter list. Both are compile-time safe. Use `holds_alternative` for readable type checks, `index()` when you need switch statements.

**Key takeaway:** Use holds_alternative<T> for type checks; use index() for switch-based dispatch on variant types.

---

#### Q15: What operations does std::filesystem provide for path manipulation?
**Difficulty:** #intermediate
**Category:** #stl #filesystem
**Concepts:** #filesystem #path #manipulation

**Answer:**
path provides operations like `filename()`, `extension()`, `parent_path()`, `stem()`, and operators like `/` for appending paths portably.

**Code example:**
```cpp
namespace fs = std::filesystem;
fs::path p = "/home/user/document.txt";
p.filename();     // "document.txt"
p.extension();    // ".txt"
p.stem();         // "document"
p.parent_path();  // "/home/user"
p / "subdir";     // "/home/user/document.txt/subdir"
```

**Explanation:**
path decomposes into filename (last component), stem (filename without extension), extension, and parent_path. The `/` operator appends with correct separators. `replace_extension()` and `replace_filename()` modify paths. All operations are portable across platforms.

**Key takeaway:** path provides rich manipulation: filename, extension, parent_path, stem; use / operator for portable path appending.

---

#### Q16: Can you store a std::optional in a std::variant?
**Difficulty:** #intermediate
**Category:** #stl #composition
**Concepts:** #optional #variant #composition

**Answer:**
Yes, `std::variant<std::optional<T>, U>` is valid and useful for representing "optionally present value of type T or value of type U" semantics.

**Code example:**
```cpp
std::variant<std::optional<int>, string> v1 = std::optional<int>(42);
std::variant<std::optional<int>, string> v2 = std::optional<int>();
std::variant<std::optional<int>, string> v3 = string("error");
```

**Explanation:**
This creates three states: "has int", "no int", or "has error string". It's more expressive than `optional<variant<int, string>>` when one type is optional but others aren't. Common in error handling where success value is optional but error is always present.

**Key takeaway:** variant<optional<T>, U> is valid; useful for "optional T or definite U" semantics in error handling.

---

#### Q17: What's the performance difference between variant and inheritance with virtual functions?
**Difficulty:** #advanced
**Category:** #performance #design_patterns
**Concepts:** #variant #virtual_functions #performance

**Answer:**
variant has zero overhead (stack allocation, no vtable, no pointer indirection). Virtual functions require heap allocation, vtable lookup, and pointer indirection.

**Code example:**
```cpp
// Virtual: heap, vtable, indirection
struct Base { virtual void process() = 0; };
unique_ptr<Base> p = make_unique<Derived>();

// Variant: stack, no vtable, inline storage
variant<TypeA, TypeB> v = TypeA{};
std::visit([](auto&& val) { val.process(); }, v);
```

**Explanation:**
variant stores value inline (size = max type + discriminator). Access is direct, no pointer chase. Virtual functions require heap object, pointer storage, and vtable lookup (cache miss prone). variant with visit is comparable to switch statement performance. Use variant for closed type sets with value semantics.

**Key takeaway:** variant is faster than virtual functions: no heap, no vtable, inline storage; use for closed type sets with value semantics.

---

#### Q18: How do you handle filesystem errors without exceptions?
**Difficulty:** #intermediate
**Category:** #stl #error_handling
**Concepts:** #filesystem #error_code #exceptions

**Answer:**
Most filesystem functions have overloads taking `std::error_code&` that don't throw. Check the error_code after the operation.

**Code example:**
```cpp
namespace fs = std::filesystem;
std::error_code ec;

bool success = fs::remove("file.txt", ec);
if (ec) {
    std::cout << "Error: " << ec.message() << "\n";
} else if (success) {
    std::cout << "File removed\n";
}
```

**Explanation:**
The throwing overload is more convenient but forces exception handling. The error_code overload sets `ec` on error and doesn't throw. Check `ec` with `if (ec)` or `ec.value()`. Get human-readable message with `ec.message()`. Use error_code version in performance-critical or exception-free code.

**Key takeaway:** Use filesystem functions with error_code& parameter for exception-free error handling; check error_code after operation.

---

#### Q19: What's the difference between std::variant and a union?
**Difficulty:** #beginner
**Category:** #stl #type_safety
**Concepts:** #variant #union #type_safety

**Answer:**
variant is type-safe (tracks which type is active), supports non-trivial types, and has destructors. union is unsafe (no tracking), only supports trivial types in C++03, and has no automatic destruction.

**Code example:**
```cpp
// union: unsafe, limited
union U {
    int i;
    float f;
    // string s;  // ❌ Error: non-trivial type
};
U u;
u.i = 42;
float f = u.f;  // ❌ UB: reading inactive member

// variant: safe, flexible
std::variant<int, float, string> v = 42;
// float f = std::get<float>(v);  // ❌ Throws, safe
```

**Explanation:**
union is low-level: you must track which member is active. Accessing inactive member is UB. C++11 allows non-trivial types in unions but requires manual construction/destruction. variant automates all this: tracks type, calls destructors, provides safe access. Always prefer variant unless interfacing with C.

**Key takeaway:** variant is type-safe, supports any type, and manages lifetime; prefer it over union for safe, modern C++.

---

#### Q20: How does std::optional compare to nullable pointers?
**Difficulty:** #beginner
**Category:** #stl #design_patterns
**Concepts:** #optional #pointers #null_safety

**Answer:**
optional provides value semantics without heap allocation or pointer management. Pointers require heap allocation, manual memory management, and risk null dereference.

**Code example:**
```cpp
// Pointer: heap, manual management
int* ptr = new int(42);
if (ptr) { /* use */ }
delete ptr;  // Must remember!

// Optional: stack, automatic
std::optional<int> opt = 42;
if (opt) { /* use */ }
// Automatic cleanup
```

**Explanation:**
optional stores value inline (stack or member), no heap. No ownership issues (no delete needed). Can't forget to check (has_value() is obvious). No nullptr bugs. Type system enforces optional checking. Use optional for "may not have value", reserve pointers for polymorphism or large objects.

**Key takeaway:** optional provides stack-based value semantics without pointers; safer, simpler, and more efficient than nullable pointers for optional values.

---

### PRACTICE_TASKS: Output Prediction and Analysis Questions

*(Due to length constraints, I'll provide 10 practice questions for this topic rather than 20)*

#### Q1
```cpp
#include <optional>
#include <iostream>
std::optional<int> get() { return std::nullopt; }
int main() {
    auto opt = get();
    std::cout << opt.value_or(42);
}
```

#### Q2
```cpp
#include <variant>
#include <iostream>
int main() {
    std::variant<int, double> v = 3.14;
    std::cout << std::get<1>(v);
}
```

#### Q3
```cpp
#include <any>
#include <iostream>
int main() {
    std::any a = 42;
    if (auto* p = std::any_cast<int>(&a)) {
        std::cout << *p;
    }
}
```

#### Q4
```cpp
#include <optional>
#include <iostream>
int main() {
    std::optional<int> opt;
    if (opt) {
        std::cout << "has value";
    } else {
        std::cout << "empty";
    }
}
```

#### Q5
```cpp
#include <variant>
#include <iostream>
int main() {
    std::variant<int, std::string> v = "hello";
    if (std::holds_alternative<std::string>(v)) {
        std::cout << std::get<std::string>(v);
    }
}
```

#### Q6
```cpp
#include <optional>
#include <iostream>
int main() {
    std::optional<bool> opt = false;
    if (opt) {
        std::cout << "has value: " << *opt;
    }
}
```

#### Q7
```cpp
#include <any>
#include <iostream>
int main() {
    std::any a = 3.14;
    try {
        std::cout << std::any_cast<int>(a);
    } catch(...) {
        std::cout << "error";
    }
}
```

#### Q8
```cpp
#include <variant>
#include <iostream>
int main() {
    std::variant<int, float> v = 42;
    std::cout << v.index();
}
```

#### Q9
```cpp
#include <optional>
#include <iostream>
int main() {
    std::optional<int> opt1 = 10;
    std::optional<int> opt2;
    std::cout << (opt1.value() + opt2.value_or(5));
}
```

#### Q10
```cpp
#include <variant>
#include <iostream>
int main() {
    std::variant<int, double, std::string> v = 42.0;
    std::visit([](auto&& val) {
        std::cout << val;
    }, v);
}
```

---

### QUICK_REFERENCE: Answer Key and Summary Tables

#### Answer Key for Practice Questions

| Q# | Answer | Explanation | Key Concept |
|----|--------|-------------|-------------|
| 1 | 42 | optional is empty, value_or returns default value 42 | #optional #value_or |
| 2 | 3.14 | get<1> accesses second type (double) by index | #variant #index_access |
| 3 | 42 | any_cast with pointer returns valid pointer, dereferences to 42 | #any #any_cast |
| 4 | empty | Default-constructed optional has no value | #optional #has_value |
| 5 | hello | holds_alternative checks type, get retrieves string | #variant #holds_alternative |
| 6 | has value: 0 | Optional has value (bool=false), prints 0. Note: if(opt) checks presence, not bool value | #optional #bool |
| 7 | error | any holds double, casting to int throws bad_any_cast | #any #exception |
| 8 | 0 | Variant holds int (first type), index is 0 | #variant #index |
| 9 | 15 | opt1 has 10, opt2 empty uses default 5, sum is 15 | #optional #value_or |
| 10 | 42 | visit applies lambda to double value 42.0, prints without decimal | #variant #visit |

#### std::optional vs Alternatives

| Feature | optional<T> | T* (pointer) | Sentinel (-1, "") | bool + T& |
|---------|-------------|--------------|-------------------|-----------|
| Heap allocation | No | Usually | No | No |
| Type safe | Yes | Moderate | No | Moderate |
| Explicit empty state | Yes | nullptr | Magic value | bool |
| Works with any T | Yes | Yes | No | Ref only |
| Value semantics | Yes | No | Yes | No |

#### std::variant vs Alternatives

| Feature | variant<Ts...> | union | Inheritance | any |
|---------|----------------|-------|-------------|-----|
| Type safety | Compile-time | None | Runtime | Runtime |
| Overhead | Discriminator | None | vtable ptr | Type info + alloc |
| Closed type set | Yes | Yes | No | No |
| Value semantics | Yes | Yes | No | Yes |
| Exhaustiveness check | Yes (visit) | No | No | No |

#### Standard Library Type Comparison

| Type | Purpose | Overhead | Safety |
|------|---------|----------|--------|
| `optional<T>` | May/may not have T | 1 byte + padding | Checked access |
| `variant<Ts...>` | One of fixed types | 1-8 bytes | Type-checked |
| `any` | Any type at runtime | Type info + heap | Cast checked |
| `string_view` | Non-owning string ref | 16 bytes | Lifetime dependent |
| `unique_ptr<T>` | Unique ownership | Pointer size | RAII |

#### filesystem Common Operations

| Operation | Function | Purpose |
|-----------|----------|---------|
| Check existence | `fs::exists(p)` | Test if path exists |
| Get file size | `fs::file_size(p)` | Size in bytes |
| Copy file | `fs::copy(src, dst)` | Copy file or directory |
| Remove file | `fs::remove(p)` | Delete file |
| Create directory | `fs::create_directory(p)` | Make new directory |
| List directory | `fs::directory_iterator(p)` | Iterate contents |
| Recursive list | `fs::recursive_directory_iterator(p)` | Iterate recursively |

---

**End of Chapter 16 Topic 2: C++17 Standard Library Features**

These standard library additions represent a major leap in C++ expressiveness and safety. optional, variant, and any provide type-safe alternatives to error-prone patterns. string_view enables efficient string handling without copies. filesystem brings portable file operations to standard C++. Together, these features make C++17 code safer, clearer, and more maintainable. Master these types as they're heavily used in modern codebases and frequently tested in technical interviews.

**Note:** This is Part 2 of 3 for Chapter 16. Topic 3 will cover Template Improvements (CTAD, Fold Expressions, and remaining features).
