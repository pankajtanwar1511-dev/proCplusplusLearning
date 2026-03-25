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

#### 1. std::optional<T> - Type-Safe Optional Values

**Definition:** `std::optional<T>` is a stack-allocated wrapper that may or may not contain a value of type T, providing a safer alternative to pointers or sentinel values for representing "no value" semantics.

**Core Operations Table:**

| Operation | Syntax | Behavior | Throws |
|-----------|--------|----------|--------|
| **Create empty** | `std::optional<int> o;` | No value, `has_value() == false` | No |
| **Create with value** | `std::optional<int> o = 42;` | Has value 42 | No |
| **Assign value** | `o = 42;` | Sets value | No |
| **Clear value** | `o = std::nullopt;` | Makes empty | No |
| **Check if has value** | `if (o)` or `o.has_value()` | Returns bool | No |
| **Unchecked access** | `*o` or `o.operator->()` | Direct access | No, **UB if empty** |
| **Checked access** | `o.value()` | Throws if empty | `std::bad_optional_access` |
| **Safe access** | `o.value_or(default)` | Returns value or default | No |
| **Emplace value** | `o.emplace(args...)` | Construct in-place | Depends on T |

**Access Method Comparison:**

| Method | Empty Optional | Has Value | Performance | Safety |
|--------|----------------|-----------|-------------|--------|
| `*opt` | **Undefined Behavior** | Returns value | Fastest (no check) | **Unsafe** - use only after checking |
| `opt.value()` | Throws exception | Returns value | Check + potential exception | Safe, but exceptions |
| `opt.value_or(def)` | Returns default | Returns value | Check + copy default | Safe, no exceptions |

**Replacing Legacy Patterns:**

| Legacy Pattern | optional Alternative | Benefits |
|----------------|---------------------|----------|
| **Sentinel values** (`-1`, `""`) | `std::optional<int>` | No magic values, type-safe |
| **Nullable pointers** (`T*` or `nullptr`) | `std::optional<T>` | No heap, no ownership issues |
| **bool + T** (`pair<bool, T>`) | `std::optional<T>` | Single concept, better API |
| **Throwing exceptions** | Return `optional` | Explicit failure in signature |

**Practical Use Cases:**

```cpp
// ✅ Search with optional result
std::optional<size_t> findIndex(const vector<int>& v, int target) {
    for (size_t i = 0; i < v.size(); ++i)
        if (v[i] == target) return i;
    return std::nullopt;  // Clear "not found" signal
}

// ✅ Optional configuration with fallback
void configure(std::optional<int> customValue) {
    int final = customValue.value_or(100);  // Default 100 if not provided
}

// ✅ Replacing nullable pointer
std::optional<SensorData> readSensor(int id) {
    // No heap allocation, clear semantics
    if (isValidId(id)) return SensorData{id, readValue()};
    return std::nullopt;
}
```

**Critical Gotchas:**

- **UB with operator\*:** `*empty_optional` is undefined behavior (like dereferencing nullptr)
- **Exception from value():** `.value()` throws `std::bad_optional_access` if empty
- **Large type overhead:** Copying optional<LargeType> copies entire type; use `optional<reference_wrapper<T>>` for references
- **Bool confusion:** `optional<bool>` checking: `if(opt)` checks presence, not bool value

---

#### 2. std::variant<Ts...> - Type-Safe Discriminated Union

**Definition:** `std::variant<Ts...>` is a type-safe union that holds exactly one value from a fixed set of types known at compile time, combining the space efficiency of C unions with runtime type safety.

**Core Characteristics:**

| Aspect | Description | Comparison to Alternatives |
|--------|-------------|----------------------------|
| **Storage** | Inline (stack-based) | No heap allocation (unlike `any`) |
| **Type set** | Fixed at compile time | Closed type set (unlike `any`) |
| **Size** | `max(sizeof(Ts...)) + discriminator` | Typically 1-8 bytes overhead |
| **Type tracking** | Automatic discriminator | Type-safe (unlike raw `union`) |
| **Performance** | Zero-overhead abstraction | No vtable (unlike virtual inheritance) |
| **Lifetime management** | Automatic destruction | Calls correct destructor automatically |

**Access Methods Comparison:**

| Method | Syntax | Safety | Returns | Use When |
|--------|--------|--------|---------|----------|
| **std::get<T>(v)** | `std::get<int>(v)` | Throws if wrong type | Value (or ref) | Know type, want exception |
| **std::get<Index>(v)** | `std::get<0>(v)` | Throws if wrong index | Value (or ref) | Index-based access |
| **std::holds_alternative<T>** | `if (holds_alternative<int>(v))` | Check only | bool | Check before get |
| **std::get_if<T>(&v)** | `auto* p = get_if<int>(&v)` | Returns nullptr | Pointer or nullptr | Prefer nullptr over throw |
| **std::visit** | `visit([](auto&& val){...}, v)` | Exhaustive | Return from lambda | Handle all types |

**Access Pattern Examples:**

```cpp
std::variant<int, string> v = 42;

// ❌ Direct get without check - throws if wrong type
int x = std::get<int>(v);  // OK
// int y = std::get<string>(v);  // Throws std::bad_variant_access

// ✅ Safe check before access
if (std::holds_alternative<int>(v)) {
    int x = std::get<int>(v);  // Guaranteed safe
}

// ✅ Pointer-based check (no exceptions)
if (auto* p = std::get_if<int>(&v)) {
    int x = *p;  // Pointer is valid
}

// ✅ Index-based access (for generic code)
int x = std::get<0>(v);  // First type in variant

// ✅ Visit pattern (exhaustive handling)
std::visit([](auto&& value) {
    using T = std::decay_t<decltype(value)>;
    if constexpr (std::is_same_v<T, int>) {
        std::cout << "int: " << value;
    } else {
        std::cout << "string: " << value;
    }
}, v);
```

**variant vs Inheritance Comparison:**

| Feature | `variant<A, B, C>` | Virtual Inheritance |
|---------|-------------------|---------------------|
| **Storage** | Stack (inline) | Heap (usually) |
| **Overhead** | Discriminator only | vtable pointer + heap |
| **Type set** | Closed (fixed at compile time) | Open (can add derived classes) |
| **Dispatch** | `visit` or switch on index | Virtual function call |
| **Performance** | Cache-friendly, no indirection | Vtable lookup, pointer chase |
| **Exhaustiveness** | Compiler-checked with `visit` | Manual checking required |
| **Copy semantics** | Value semantics | Slicing risk |

**Common Use Cases:**

- **State machines:** Each state is a different type with type-specific data
- **Error handling:** `variant<Result, Error>` instead of exceptions
- **Polymorphism alternative:** When type set is fixed and known at compile time
- **Return types:** Function returning one of several possible types
- **Avoiding vtable overhead:** Value semantics with zero-overhead type dispatch

**Critical Pitfalls:**

| Pitfall | Example | Solution |
|---------|---------|----------|
| **Ambiguous construction** | `variant<int, long> v = 42;` | Use `in_place_type`: `variant<int, long>(in_place_type<int>, 42)` |
| **Valueless by exception** | Assignment throws during type change | Check `valueless_by_exception()` after throws |
| **Size overhead** | Storing small types wastes space | Size is always `max(Ts...) + discriminator` |
| **Type duplication** | `variant<int, int>` is invalid | Each type must be unique in variant |

---

#### 3. std::any - Runtime Type Erasure

**Definition:** `std::any` is a type-erased container that can store a single value of **any type**, preserving runtime type information for safe casting. It's a type-safe replacement for `void*`.

**Core Characteristics:**

| Aspect | Behavior | Implication |
|--------|----------|-------------|
| **Type set** | Any type (determined at runtime) | Maximum flexibility |
| **Storage** | Small buffer optimization + heap | May allocate for large types |
| **Type tracking** | `std::type_info` stored internally | Enables runtime type checking |
| **Size** | Fixed (typically 16-32 bytes) | Same size regardless of stored type |
| **Performance** | Allocation + RTTI overhead | Slower than `variant` |
| **CV qualifiers** | Strips const/volatile | Stored type is always non-const |

**Operations Table:**

| Operation | Syntax | Throws | Returns |
|-----------|--------|--------|---------|
| **Create empty** | `std::any a;` | No | Empty any |
| **Create with value** | `std::any a = 42;` | No | any holding int |
| **Assign value** | `a = std::string("hi");` | No | Changes type |
| **Check if has value** | `a.has_value()` | No | bool |
| **Get type info** | `a.type()` | No | `const std::type_info&` |
| **Cast to type** | `any_cast<int>(a)` | `bad_any_cast` if wrong | Value (copy) |
| **Cast to type (pointer)** | `any_cast<int>(&a)` | No | Pointer or nullptr |
| **Clear value** | `a.reset();` | No | Empties any |
| **Emplace value** | `a.emplace<T>(args...)` | Depends on T | Reference to value |

**Type Erasure Comparison:**

| Feature | `std::any` | `void*` | `variant<Ts...>` |
|---------|-----------|---------|------------------|
| **Type safety** | Safe (runtime check) | **Unsafe** | Safe (compile-time) |
| **Type set** | Open (any type) | Open (any type) | Closed (fixed types) |
| **Type info preservation** | Yes (RTTI) | No | Yes (discriminator) |
| **Casting** | `any_cast` with check | Manual cast (unsafe) | `get`/`visit` |
| **Allocation** | May allocate | No allocation | No allocation |
| **Performance** | RTTI + potential heap | Fast (raw pointer) | Fastest (inline) |

**any vs optional vs variant Decision Matrix:**

| Scenario | Best Choice | Reason |
|----------|-------------|--------|
| **May not have value of type T** | `optional<T>` | Explicit "no value" semantics |
| **One of 2-10 known types** | `variant<Ts...>` | Type-safe, zero-overhead |
| **One of many (>10) known types** | Consider inheritance | variant gets unwieldy |
| **Truly unknown types (plugins)** | `any` | Only option for runtime types |
| **Performance critical** | `variant` or `optional` | Avoid `any` overhead |
| **Header-only value storage** | `variant` or `optional` | `any` requires RTTI |

**Safe Access Patterns:**

```cpp
std::any a = 42;

// ❌ Direct cast without check - throws if wrong type
int x = std::any_cast<int>(a);  // Throws bad_any_cast if not int

// ✅ Pointer-based check (no exceptions)
if (auto* p = std::any_cast<int>(&a)) {
    int x = *p;  // Safe, p is valid
}

// ✅ Type info check before cast
if (a.type() == typeid(int)) {
    int x = std::any_cast<int>(a);  // Guaranteed safe
}

// ✅ Check if has value
if (a.has_value()) {
    // Try to cast, handle exception if wrong type
    try {
        int x = std::any_cast<int>(a);
    } catch (const std::bad_any_cast&) {
        // Handle wrong type
    }
}
```

**When to Use vs NOT Use:**

| Use When | Avoid When |
|----------|------------|
| Plugin systems with unknown types | Types known at compile time |
| Scripting language bindings | Performance-critical paths |
| Dynamic configuration (runtime-loaded) | Compile-time type safety needed |
| Replacing `void*` in legacy APIs | Working with value types (use variant) |
| Heterogeneous containers (rare) | Simple optional values (use optional) |

**Critical Gotchas:**

- **CV qualifiers stripped:** `any` storing `const int` holds `int`; cast to `int`, not `const int`
- **Heap allocation:** Large types always allocated; small types may use SBO (small buffer optimization)
- **RTTI required:** `any` requires RTTI enabled (usually default, but some embedded systems disable it)
- **No implicit conversion:** Must cast to exact type; `any_cast<long>(any{42})` fails even though 42 is int

---

#### 4. std::string_view - Non-Owning String References

**Definition:** `std::string_view` is a lightweight, non-owning reference to a contiguous character sequence (pointer + length), providing a string-like interface without allocation or ownership.

**Core Characteristics:**

| Aspect | Behavior | Implication |
|--------|----------|-------------|
| **Ownership** | Non-owning reference | **Source must outlive view** |
| **Size** | Typically 16 bytes (pointer + length) | Lightweight, pass by value |
| **Allocation** | Zero allocation | Fast, no heap access |
| **Mutability** | Read-only view | Cannot modify source |
| **Null-termination** | **Not guaranteed** | Not always null-terminated |
| **Source types** | String literals, `std::string`, C strings, char arrays | Universal string parameter type |

**Operations Performance:**

| Operation | `std::string` | `std::string_view` | Benefit |
|-----------|---------------|-------------------|---------|
| **Construction** | O(n) - allocates + copies | O(1) - pointer + length | No allocation |
| **Copy** | O(n) - deep copy | O(1) - copy pointer | Trivial copy |
| **Substring** | O(n) - allocates new string | O(1) - adjust pointer | No allocation |
| **Pass as parameter** | O(n) - copy or reference | O(1) - copy view | Always cheap |

**Replacing Function Parameters:**

```cpp
// ❌ C++14: Forces string construction from literals
void process(const std::string& s) {  // "hello" creates temporary string
    std::cout << s;
}

// ✅ C++17: Zero-copy for all string sources
void process(std::string_view sv) {  // No temporary for "hello"
    std::cout << sv;
}

// Works with all string sources:
process("literal");               // ✅ No allocation
process(std::string("owned"));    // ✅ No copy
process(c_string);                // ✅ No conversion
```

**Critical Lifetime Safety:**

| Pattern | Safety | Explanation |
|---------|--------|-------------|
| **Function parameter** | ✅ Safe | Caller's string outlives parameter |
| **Return from function** | ⚠️ **Dangerous** | Returned view may outlive source |
| **Store in member variable** | ⚠️ **Risky** | Object may outlive source |
| **View of temporary** | ❌ **Unsafe** | Temporary destroyed, view dangles |
| **View of string literal** | ✅ Safe | Literals have static lifetime |

**Dangling Reference Scenarios:**

```cpp
// ❌ DANGER: Returning view to local string
std::string_view getBadView() {
    std::string s = "local";
    return s;  // s destroyed, view dangles!
}

// ❌ DANGER: View of temporary
std::string_view sv = std::string("temp");  // Temporary destroyed
std::cout << sv;  // UB - dangling reference

// ❌ DANGER: Storing view of short-lived string
class Config {
    std::string_view name;  // Risky!
public:
    Config(const std::string& s) : name(s) {}  // s may not outlive Config
};

// ✅ SAFE: View of string literal (static lifetime)
std::string_view safe1 = "literal";

// ✅ SAFE: View of parameter (caller guarantees lifetime)
void safe2(std::string_view sv) { std::cout << sv; }

// ✅ SAFE: Return view if source outlives caller
std::string_view safe3(const std::string& s) {
    return s;  // OK if caller's s outlives the returned view
}
```

**Best Practices:**

- **Use for function parameters:** Replace `const std::string&` with `string_view` for read-only string parameters
- **Never return from functions:** Unless returning a view to a parameter or static data
- **Don't store in objects:** Avoid `string_view` members unless lifetime is carefully managed
- **Check for null-termination:** Don't assume `sv.data()` is null-terminated; use `std::string(sv).c_str()` if needed
- **Substring efficiency:** Use `sv.substr()` for O(1) substrings without allocation

**Common Pitfalls:**

| Pitfall | Code | Fix |
|---------|------|-----|
| **View of temporary** | `string_view sv = string("tmp");` | Store as `string`, not `string_view` |
| **Assuming null-termination** | `some_c_api(sv.data());` | Use `string(sv).c_str()` |
| **Returning view to local** | `return string_view(local_str);` | Return `string` by value |
| **String modification invalidates view** | `string s="hi"; string_view sv=s; s+="!";` | Refresh view after mutation |

---

#### 5. std::filesystem - Portable File System Operations

**Definition:** `std::filesystem` provides a platform-independent, object-oriented interface for file and directory operations, replacing platform-specific APIs (POSIX, Windows) with a standard C++ abstraction.

**Core Types:**

| Type | Purpose | Key Methods |
|------|---------|-------------|
| **`path`** | Represents filesystem path | `filename()`, `extension()`, `parent_path()`, `stem()`, `/` operator |
| **`directory_entry`** | Single directory entry | `path()`, `is_regular_file()`, `is_directory()`, `file_size()` |
| **`directory_iterator`** | Non-recursive iteration | Range-based for loop |
| **`recursive_directory_iterator`** | Recursive traversal | Range-based for loop with subdirectories |
| **`file_status`** | File type and permissions | `type()`, `permissions()` |

**Path Manipulation Operations:**

| Operation | Example | Result | Purpose |
|-----------|---------|--------|---------|
| **Concatenation** | `p / "subdir"` | Appends with correct separator | Portable path building |
| **Filename** | `p.filename()` | Last component | Extract filename |
| **Extension** | `p.extension()` | File extension (with `.`) | Get file type |
| **Stem** | `p.stem()` | Filename without extension | Base name |
| **Parent path** | `p.parent_path()` | Directory containing path | Navigate up |
| **Replace extension** | `p.replace_extension(".txt")` | Changes extension | Rename file type |
| **Make absolute** | `fs::absolute(p)` | Absolute path | Resolve relative paths |
| **Canonical path** | `fs::canonical(p)` | Resolved path (no `.`, `..`, symlinks) | Normalize path |

**File Query Operations:**

| Query | Function | Returns | Use Case |
|-------|----------|---------|----------|
| **Exists** | `fs::exists(p)` | bool | Check before accessing |
| **File type** | `fs::is_regular_file(p)` | bool | Distinguish files |
| **Directory** | `fs::is_directory(p)` | bool | Check if directory |
| **Symlink** | `fs::is_symlink(p)` | bool | Detect symbolic links |
| **File size** | `fs::file_size(p)` | `uintmax_t` | Get size in bytes |
| **Last write time** | `fs::last_write_time(p)` | `file_time_type` | Modification timestamp |
| **Space info** | `fs::space(p)` | `space_info` (capacity, free, available) | Disk space checks |

**File Modification Operations:**

| Operation | Function | Effect | Error Handling |
|-----------|----------|--------|----------------|
| **Create directory** | `fs::create_directory(p)` | Single directory | Throws if exists |
| **Create directories** | `fs::create_directories(p)` | All parent directories | Safe if exists |
| **Remove file** | `fs::remove(p)` | Delete single file/empty dir | Returns bool |
| **Remove recursively** | `fs::remove_all(p)` | Delete directory tree | Returns count |
| **Copy file** | `fs::copy(src, dst)` | Copy file or directory | Throws on error |
| **Rename/Move** | `fs::rename(old, new)` | Move/rename file | Atomic on same filesystem |
| **Create symlink** | `fs::create_symlink(target, link)` | Creates symbolic link | Platform-dependent |

**Practical Usage Patterns:**

```cpp
namespace fs = std::filesystem;

// ✅ Path manipulation (portable)
fs::path log_file = fs::current_path() / "logs" / "app.log";
log_file.replace_extension(".bak");  // app.bak

// ✅ File queries
if (fs::exists(log_file) && fs::file_size(log_file) > 10'000'000) {
    // Rotate large log files
}

// ✅ Directory iteration (non-recursive)
for (const auto& entry : fs::directory_iterator("/var/log")) {
    if (entry.is_regular_file()) {
        std::cout << entry.path().filename() << "\n";
    }
}

// ✅ Recursive directory traversal
for (const auto& entry : fs::recursive_directory_iterator("/data")) {
    if (entry.path().extension() == ".conf") {
        processConfigFile(entry.path());
    }
}
```

**Error Handling Strategies:**

| Approach | Syntax | When to Use |
|----------|--------|-------------|
| **Throwing** | `fs::remove(p)` | Errors are exceptional |
| **Non-throwing** | `fs::remove(p, ec)` | Errors are expected |

```cpp
// ✅ Throwing version (cleaner for unexpected errors)
try {
    fs::copy("src.txt", "dst.txt");
} catch (const fs::filesystem_error& e) {
    std::cerr << "Error: " << e.what() << "\n";
}

// ✅ Non-throwing version (for expected failures)
std::error_code ec;
if (fs::remove("optional_file.txt", ec)) {
    std::cout << "Removed\n";
} else if (ec) {
    std::cout << "Not found (ok): " << ec.message() << "\n";
}
```

**Automotive/Embedded Use Cases:**

| Use Case | Operations | Pattern |
|----------|------------|---------|
| **Log rotation** | `file_size()`, `rename()`, `remove_all()` | Check size, rotate, cleanup old |
| **Config loading** | `exists()`, `is_regular_file()`, `ifstream(path)` | Validate before reading |
| **Data recording** | `create_directories()`, `ofstream(path)`, `space()` | Ensure directory, check space |
| **Map data access** | `directory_iterator()`, extension filtering | Find all `.map` files |
| **Firmware updates** | `copy()`, `rename()`, `permissions()` | Atomic replace patterns |

**Critical Pitfalls:**

| Pitfall | Issue | Solution |
|---------|-------|----------|
| **Symlink following** | Most ops follow symlinks by default | Use `symlink_status()` to check link itself |
| **Race conditions** | File state can change between check and use | Use error_code version, handle errors |
| **Cross-platform paths** | Hard-coded `/` or `\\` | Always use `/` operator or `path::preferred_separator` |
| **Permission errors** | Operations may fail silently | Always check error_code or catch exceptions |
| **Recursive delete** | `remove_all()` is destructive | Double-check path before calling |

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

<details>
<summary><b>Show Answer</b></summary>

**Answer:** 42

**Explanation:** optional is empty, value_or returns default value 42

**Key Concept:** #optional #value_or

</details>

---

#### Q2
```cpp
#include <variant>
#include <iostream>
int main() {
    std::variant<int, double> v = 3.14;
    std::cout << std::get<1>(v);
}
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** 3.14

**Explanation:** get<1> accesses second type (double) by index

**Key Concept:** #variant #index_access

</details>

---

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

<details>
<summary><b>Show Answer</b></summary>

**Answer:** 42

**Explanation:** any_cast with pointer returns valid pointer, dereferences to 42

**Key Concept:** #any #any_cast

</details>

---

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

<details>
<summary><b>Show Answer</b></summary>

**Answer:** empty

**Explanation:** Default-constructed optional has no value

**Key Concept:** #optional #has_value

</details>

---

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

<details>
<summary><b>Show Answer</b></summary>

**Answer:** hello

**Explanation:** holds_alternative checks type, get retrieves string

**Key Concept:** #variant #holds_alternative

</details>

---

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

<details>
<summary><b>Show Answer</b></summary>

**Answer:** has value: 0

**Explanation:** Optional has value (bool=false), prints 0. Note: if(opt) checks presence, not bool value

**Key Concept:** #optional #bool

</details>

---

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

<details>
<summary><b>Show Answer</b></summary>

**Answer:** error

**Explanation:** any holds double, casting to int throws bad_any_cast

**Key Concept:** #any #exception

</details>

---

#### Q8
```cpp
#include <variant>
#include <iostream>
int main() {
    std::variant<int, float> v = 42;
    std::cout << v.index();
}
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** 0

**Explanation:** Variant holds int (first type), index is 0

**Key Concept:** #variant #index

</details>

---

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

<details>
<summary><b>Show Answer</b></summary>

**Answer:** 15

**Explanation:** opt1 has 10, opt2 empty uses default 5, sum is 15

**Key Concept:** #optional #value_or

</details>

---

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

<details>
<summary><b>Show Answer</b></summary>

**Answer:** 42

**Explanation:** visit applies lambda to double value 42.0, prints without decimal

**Key Concept:** #variant #visit

</details>

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
