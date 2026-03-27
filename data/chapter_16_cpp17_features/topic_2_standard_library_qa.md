## TOPIC: C++17 Standard Library - optional, variant, any, string_view, filesystem

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
