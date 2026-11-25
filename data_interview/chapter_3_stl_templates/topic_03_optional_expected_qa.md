## TOPIC: std::optional and std::expected

### INTERVIEW_QA: Interview Questions with Detailed Answers

#### Q1: Where does `std::optional<T>` store its value? Does it allocate?
**Difficulty:** #beginner
**Category:** #stl #vocabulary_types
**Concepts:** #optional #inline_storage #sizeof

**Answer:**
Inside the optional object itself: an aligned buffer big enough for one `T`, plus a flag that says whether a `T` is currently constructed there. The optional never allocates; only the `T` may allocate for its own data (a long `std::string`, a `std::vector`).

**Explanation:**
- Construction places the `T` in the buffer with placement new; `reset()` calls `T`'s destructor; the buffer itself is part of the optional for its whole lifetime.
- So `sizeof(optional<T>) >= sizeof(T) + 1`, rounded up for alignment. libstdc++ / GCC, x86-64: `optional<int>` 8, `optional<double>` 16, `optional<std::string>` 40.
- A local optional is on the stack like any other local; an optional member is inside its enclosing object.
- ❌ Common wrong answer: "It is like a pointer that can be null." There is no pointee and no indirection; copying an optional copies the `T`.
- ✅ What a strong answer adds: the size cost is paid even when empty, so a large mostly-empty `optional<Big>` array can be worse than `unique_ptr<Big>`; and triviality propagates (`optional<int>` is trivially copyable).

**Key takeaway:** optional = in-place `T` storage + an engaged flag; no heap of its own.

---

#### Q2: What is the difference between `*opt`, `opt.value()` and `opt.value_or(x)`?
**Difficulty:** #beginner
**Category:** #stl #error_handling
**Concepts:** #optional #undefined_behaviour #bad_optional_access

**Answer:**
`*opt` returns a reference with no check: on an empty optional it is undefined behaviour. `value()` checks and throws `std::bad_optional_access` when empty. `value_or(x)` returns a copy of the value, or `x` converted to `T` when empty.

**Explanation:**
- `*opt` is for code that has just checked `if (opt)`. It costs nothing extra.
- `value()` adds one branch; use it where an empty optional means a bug you want reported.
- `value_or(x)` returns by value (copy for a large `T`) and always evaluates `x`.
- libstdc++ checks `*opt` only with `-D_GLIBCXX_ASSERTIONS` or `_GLIBCXX_DEBUG`; without it, reading an empty `optional<int>` printed an arbitrary number (different on each run) on GCC 11 at `-O0`.
- ❌ Common wrong answer: "`*opt` throws if it is empty." Only `value()` throws.
- ✅ What a strong answer adds: compile tests with `_GLIBCXX_ASSERTIONS` so that unchecked dereferences fail loudly in CI.

**Key takeaway:** `*` = trust me (UB if wrong), `value()` = check and throw, `value_or` = copy or default.

---

#### Q3: `cache.value_or(load_from_db())`: what is the hidden cost, and how do you avoid it?
**Difficulty:** #intermediate
**Category:** #stl #performance
**Concepts:** #value_or #eager_evaluation #or_else

**Answer:**
`load_from_db()` runs every time, even when `cache` holds a value, because function arguments are evaluated before the call. Use `cache ? *cache : load_from_db()` or, in C++23, `cache.or_else(...)` to compute the fallback only when needed.

**Explanation:**
- `value_or` is an ordinary member function; there is no lazy evaluation in C++ arguments.
- `or_else(f)` takes a callable and returns an optional: `*cache.or_else([] { return std::optional<T>(load_from_db()); })`.
- Also note `value_or` returns `T` by value: even on a hit you get a copy.
- ❌ Common wrong answer: "The default is only evaluated when the optional is empty."
- ✅ What a strong answer adds: `value_or` is fine for literals and cheap constants; anything with side effects or cost belongs in a lazy path.

**Key takeaway:** `value_or`'s argument is always computed.

---

#### Q4: What happens to the contained object on `reset()`, on assigning a new `T`, and on `emplace()`?
**Difficulty:** #intermediate
**Category:** #stl #object_lifetime
**Concepts:** #reset #emplace #assignment

**Answer:**
`reset()` (or `= std::nullopt`, `= {}`) destroys the contained `T` and leaves the optional empty. Assigning a `T` to an engaged optional calls `T`'s assignment operator on the existing object; to an empty one it constructs a new `T`. `emplace()` destroys any existing `T`, then constructs a new one in place.

**Explanation:**
- The optional object itself lives on through all of these; only the inner `T`'s lifetime changes.
- `emplace` gives the basic guarantee: if the new constructor throws, the old value is already gone and the optional is empty.
- A reference taken with `T& r = *o;` dies at `reset()` and at `emplace()`, but survives an assignment (same object, new value). Memory & Ownership, topic 01 has the dangling-reference version.
- ❌ Common wrong answer: "`reset()` frees memory." There is nothing to free; it runs a destructor.
- ✅ What a strong answer adds: types that cannot be assigned (a `const` member) still work with `emplace`, but `o = T(...)` on an engaged optional fails to compile.

**Key takeaway:** reset = destroy `T`; assign = `T::operator=` or construct; emplace = destroy then construct.

---

#### Q5: Why is `std::optional<bool>` considered a trap?
**Difficulty:** #intermediate
**Category:** #stl #api_design
**Concepts:** #optional #explicit_bool #tri_state

**Answer:**
Because `if (ob)` tests whether a value is present, not whether the value is `true`. An `optional<bool>` holding `false` is truthy, so "explicitly disabled" behaves like "enabled".

**Explanation:**
```cpp
#include <iostream>
#include <optional>

int main() {
    std::optional<bool> ob = false;
    std::cout << static_cast<bool>(ob) << ' ' << *ob << ' ' << (ob == true) << '\n';
}
```
- Output: `1 0 0`.
- The same applies to `optional<int>` holding 0 and `optional<T*>` holding `nullptr`.
- Clear spellings: `ob.value_or(false)`, `ob == true`, or an `enum class Setting { Unset, Off, On }`.
- ❌ Common wrong answer: "`if (ob)` is fine because bool converts naturally."
- ✅ What a strong answer adds: prefer a named three-state enum for flags; it reads better in logs and reviews.

**Key takeaway:** For `optional<bool>`, the condition asks "is it set?", never "is it true?".

---

#### Q6: Why can't you write `std::optional<T&>`? What do you use instead?
**Difficulty:** #intermediate
**Category:** #stl #api_design
**Concepts:** #optional #references #reference_wrapper

**Answer:**
The C++17 design forbids reference types (libstdc++ fails with a static assertion), partly because assignment semantics were contentious: should assigning rebind the reference or assign through it? Use `T*` (null means none), `std::optional<std::reference_wrapper<T>>`, or an iterator. C++26 adds `std::optional<T&>` (P2988) with rebinding assignment.

**Explanation:**
- A raw pointer is the idiomatic "maybe a reference" in C++17/20/23 code: non-owning, nullable, zero overhead.
- `optional<reference_wrapper<T>>` works but is verbose (`o->get()`).
- `std::optional<const T&>` as a parameter to avoid copies has the same problem; use `const T*` or overloads.
- ❌ Common wrong answer: "Use `std::optional<T>` and return a copy." That changes semantics: modifications no longer affect the original element.
- ✅ What a strong answer adds: a returned pointer into a container has the usual invalidation rules (see topic 06).

**Key takeaway:** Before C++26, an optional reference is spelled `T*`.

---

#### Q7: For a lookup function, when do you return `std::optional<T>`, a pointer, a sentinel value, or throw?
**Difficulty:** #intermediate
**Category:** #api_design #error_handling
**Concepts:** #optional #sentinel #exceptions

**Answer:**
Return `optional<T>` when the result is a small value the caller should own. Return `const T*` (or an iterator) when the result is an existing object the caller only observes. Throw when absence is a real error that cannot be handled locally. Avoid sentinels unless the domain has a value that can never be valid.

**Explanation:**
- `optional<T>` copies the found value; fine for `int`, `double`, small structs, bad for a 4 KB config block.
- Pointer into a container: no copy, but the caller must not keep it across container modifications.
- Sentinels (`-1`, empty string, `npos`) work only if the sentinel can never be a real value, and the type does not force the caller to check.
- Exceptions on a frequent "not found" path are slow (microseconds per throw) and turn normal control flow into error handling.
- ❌ Common wrong answer: "Always optional, it is the modern way."
- ✅ What a strong answer adds: if the caller needs to know *why* it failed, neither optional nor pointer is enough: use `std::expected<T, E>`.

**Key takeaway:** Owned small value: optional. Observe existing object: pointer. Reason needed: expected. Unrecoverable: exception.

---

#### Q8: Is `std::optional<T>` a good function parameter type?
**Difficulty:** #intermediate
**Category:** #api_design #performance
**Concepts:** #optional #parameters #overloading

**Answer:**
For small `T`, yes. For expensive `T` (strings, vectors), usually not: the caller must construct an optional, which copies an existing `T`. Prefer overloads, a default argument, or `const T*` for "maybe given".

**Explanation:**
- `void log(std::optional<std::string> tag)` called as `log(my_tag)` copies `my_tag` into a new optional, possibly allocating.
- `const std::optional<std::string>&` does not help: a caller holding a plain `std::string` still creates a temporary optional (a copy).
- Options: `void log(); void log(const std::string& tag);` or `void log(const std::string* tag = nullptr)` or `std::string_view` with an empty-means-none convention.
- ❌ Common wrong answer: "Pass `const std::optional<T>&` to avoid copies."
- ✅ What a strong answer adds: `optional<int>`, `optional<double>` and other trivially copyable small types are cheap by value and read well.

**Key takeaway:** optional is excellent as a return or member type; as a parameter of expensive `T` it forces copies.

---

#### Q9: How do optionals compare, and what is `std::optional<int>{} < -5`?
**Difficulty:** #intermediate
**Category:** #stl #semantics
**Concepts:** #optional #comparison #nullopt

**Answer:**
Empty optionals are equal to each other and less than any engaged optional or value; engaged ones compare their values. So `std::optional<int>{} < -5` is `true`.

**Explanation:**
- Mixed comparisons work: `o == 5`, `o < 5`, `o == std::nullopt`. An empty `o == 5` is `false`; `o < 5` is `true`.
- Sorting puts empties first; `std::max` of an empty and an engaged optional returns the engaged one.
- `!(o > 0)` being true does not mean "o is zero or negative": it is also true for empty.
- `std::hash<std::optional<T>>` exists, so optionals can be unordered keys.
- ❌ Common wrong answer: "Comparing an empty optional is undefined" or "it compares as 0".
- ✅ What a strong answer adds: when absence must not win or lose a comparison, handle it explicitly before comparing.

**Key takeaway:** nullopt is the smallest value of every `optional<T>`.

---

#### Q10: Explain `and_then`, `transform` and `or_else` (C++23).
**Difficulty:** #intermediate
**Category:** #stl #cpp23
**Concepts:** #monadic_operations #optional #expected

**Answer:**
`and_then(f)` runs `f(value)` when engaged, and `f` must itself return an optional (the step may fail). `transform(f)` runs `f(value)` and wraps the plain result in an optional (the step cannot fail). `or_else(f)` runs only when empty and returns a replacement optional. Each returns an empty result immediately when there is nothing to work on.

**Explanation:**
- They replace nested `if (a) { auto b = g(*a); if (b) ... }` chains.
- Passing an optional-returning function to `transform` gives `optional<optional<U>>`; passing a plain-returning function to `and_then` does not compile.
- On `std::expected`, the same three exist plus `transform_error` to map the error type; `and_then` steps must keep the same error type `E`.
- GCC 12+ / Clang 14+ for optional's monadic API.
- ❌ Common wrong answer: "`transform` modifies the value inside the optional." It returns a new optional; the original is unchanged.
- ✅ What a strong answer adds: `or_else` is the lazy alternative to `value_or`.

**Key takeaway:** may fail: `and_then`; cannot fail: `transform`; recover: `or_else`.

---

#### Q11: What is `std::expected<T, E>` and how does it differ from `std::optional<T>`?
**Difficulty:** #beginner
**Category:** #stl #cpp23 #error_handling
**Concepts:** #expected #unexpected #error_type

**Answer:**
A C++23 vocabulary type holding either a value `T` or an error `E`, in-place like optional. Optional only says "nothing"; expected says "nothing, and here is why", with a typed error the caller can inspect via `error()`.

**Explanation:**
- Success: `return value;`. Error: `return std::unexpected(err);`.
- `value()` on an error throws `std::bad_expected_access<E>`, which carries the error; `error()` on a success is UB.
- A default-constructed `expected<T, E>` holds a value-initialized `T` (success); a default optional is empty.
- `expected<void, E>` exists for actions without a result; there is no `optional<void>`.
- ❌ Common wrong answer: "It is optional plus an error string." `E` is any type; an enum is usually better than a string.
- ✅ What a strong answer adds: before C++23, `tl::expected` provides the same interface.

**Key takeaway:** optional answers "is there a value?"; expected also answers "why not?".

---

#### Q12: What does this return: `std::expected<int, int> f() { return -1; }`?
**Difficulty:** #intermediate
**Category:** #stl #cpp23
**Concepts:** #expected #unexpected #implicit_conversion

**Answer:**
A **success** holding -1. Only `std::unexpected(-1)` creates the error state.

**Explanation:**
```cpp
// C++23: g++ -std=c++23 (GCC 12+)
#include <expected>
#include <iostream>

std::expected<int, int> f() { return -1; }
std::expected<int, int> g() { return std::unexpected(-1); }

int main() {
    std::cout << f().has_value() << ' ' << *f() << '\n';
    std::cout << g().has_value() << ' ' << g().error() << '\n';
}
```
- Output: `1 -1` then `0 -1`.
- The design makes success the implicit path and errors explicit, so a value can never be mistaken for an error, but it relies on the author writing `std::unexpected`.
- A distinct error type (`enum class Err`) turns the mistake `return Err::Bad;` into a compile error for `expected<int, Err>` (no conversion from `Err` to `int`).
- ❌ Common wrong answer: "The compiler picks the error because the value is negative" or "it is ambiguous".
- ✅ What a strong answer adds: avoid `expected<T, E>` where `E` converts to `T`.

**Key takeaway:** In expected, only `std::unexpected` makes an error.

---

#### Q13: expected or exceptions: how do you choose?
**Difficulty:** #advanced
**Category:** #error_handling #performance #api_design
**Concepts:** #expected #exceptions #low_latency

**Answer:**
Use `expected` for failures that are normal and handled by the immediate caller (parse errors, validation, "not connected"), especially on hot paths. Use exceptions for rare failures handled far up the stack, for constructors and operators, and where every intermediate layer would otherwise just forward the error.

**Explanation:**
- Exceptions: near-zero cost on the success path with table-based unwinding, but a throw costs microseconds (allocation of the exception object, unwinding, RTTI matching). Unpredictable on latency-sensitive paths.
- `expected`: one flag check on every result, cheap and predictable on both paths, but every layer must handle or forward the error explicitly.
- Constructors cannot return expected; a factory function `static expected<T, E> create(...)` is the workaround.
- Mark expected-returning functions `[[nodiscard]]` so ignoring the result is a warning.
- ❌ Common wrong answer: "Exceptions are slow, never use them." Their success path is cheap; the failure path is what is slow.
- ✅ What a strong answer adds: many low-latency codebases compile hot components with exceptions allowed but never thrown on the fast path, and report per-message failures through codes or expected.

**Key takeaway:** Frequent, local failure: expected. Rare, distant failure: exception.

---

#### Q14: What happens on `e.value()` and `e.error()` when they are called in the wrong state?
**Difficulty:** #intermediate
**Category:** #stl #cpp23
**Concepts:** #expected #bad_expected_access #undefined_behaviour

**Answer:**
`value()` on an error throws `std::bad_expected_access<E>`, and the exception holds a copy of the error (`e.error()` on the exception). `error()` on a success is undefined behaviour, like `*e` on an error.

**Explanation:**
- `bad_expected_access<E>` derives from `bad_expected_access<void>`, which derives from `std::exception`; libstdc++'s `what()` is "bad access to std::expected without expected value".
- Since `E` is copied into the exception, `E` must be copy constructible for `value()` to compile.
- Safe spellings: check `has_value()` first, or use `value_or` / `error_or` (C++23).
- ❌ Common wrong answer: "`error()` returns a default error when there is no error."
- ✅ What a strong answer adds: catching `std::bad_expected_access<void>` catches all expected access errors regardless of `E`.

**Key takeaway:** `value()` throws on error; `error()` and `*` have no check.

---

#### Q15: When would you use `std::expected<void, E>`?
**Difficulty:** #intermediate
**Category:** #stl #cpp23 #api_design
**Concepts:** #expected_void #nodiscard #error_codes

**Answer:**
For actions that either succeed with no result or fail with a reason: send a message, save a file, apply a config. Success is `return {};`, failure is `return std::unexpected(err);`.

**Explanation:**
- Replaces `bool` (no reason) and `int` error codes (no type safety, easy to ignore).
- Has `has_value()`, `error()`, `and_then`, `or_else`, `transform_error`; `value()` returns `void` but still throws on error.
- Combine with `[[nodiscard]]` on the function so callers cannot drop the result silently.
- ❌ Common wrong answer: "Use `std::optional<E>` where empty means success." Works, but reads backwards and loses the monadic API.
- ✅ What a strong answer adds: the error type should be cheap (enum, small struct); a `std::string` makes every failure allocate.

**Key takeaway:** `expected<void, E>` is a typed, chainable "ok or error".

---

#### Q16: Is `std::optional<T>` trivially copyable? Why does it matter?
**Difficulty:** #advanced
**Category:** #stl #performance
**Concepts:** #triviality #abi #optional

**Answer:**
When `T` is trivially copyable, `optional<T>` is too: trivial destructor since C++17, trivial copy/move by P0602 (a defect report against C++17). `optional<int>` is trivially copyable; `optional<std::string>` is not.

**Explanation:**
```cpp
#include <iostream>
#include <optional>
#include <string>
#include <type_traits>

int main() {
    std::cout << std::is_trivially_copyable_v<std::optional<int>>
              << std::is_trivially_copyable_v<std::optional<std::string>>
              << std::is_trivially_destructible_v<std::optional<int>> << '\n';
}
```
- Output: `101`.
- Trivially copyable types can be copied with `memcpy`, stored in lock-free queues or shared memory as raw bytes, and are passed in registers by the Itanium ABI when small.
- Same propagation exists for `std::variant` and `std::expected`.
- ❌ Common wrong answer: "optional always has a user-defined copy constructor, so it is never trivial."
- ✅ What a strong answer adds: implementations get this by layering base classes with conditionally trivial special members (C++20 can use `requires` clauses on special members instead).

**Key takeaway:** optional is as trivial as its `T`; that keeps `optional<int>` free to pass around.

---

#### Q17: What is wrong with `const std::string& name = *find_name(42);`?
**Difficulty:** #intermediate
**Category:** #stl #lifetime
**Concepts:** #dangling_reference #temporary_lifetime #optional

**Answer:**
`find_name` returns an `optional<std::string>` by value: a temporary. `*` returns a reference into it, which does not extend the temporary's lifetime, so the optional and its string are destroyed at the end of the statement and `name` dangles.

**Explanation:**
- Lifetime extension applies only when a reference binds directly to the temporary (or a subobject via member access), not to the result of a function call like `operator*` or `value()`.
- ASan reports `stack-use-after-scope`: the temporary optional lived in a stack slot of the caller, and reading through `name` touches that dead slot. Without ASan the output is often plausible or partly garbage.
- Same bug: `for (char c : *find_name(42))` before C++23 P2718 (not implemented in GCC 11/13).
- Fix: `auto name = find_name(42);` then use `*name`, or `std::string name = *find_name(42);` (copy, or move out of the temporary).
- ❌ Common wrong answer: "Binding to `const&` always extends the lifetime."
- ✅ What a strong answer adds: the same rule applies to `.value()`, `->` and getters on any temporary that return references.

**Key takeaway:** A reference to the inside of a temporary optional dies with the statement.

---

#### Q18: Sketch how you would implement a minimal `optional<T>`.
**Difficulty:** #advanced
**Category:** #stl #implementation
**Concepts:** #union #placement_new #object_lifetime

**Answer:**
Store a `bool` and an anonymous union with a single `T` member (or an aligned byte buffer). Construct with placement new (`std::construct_at` in C++20), destroy by calling the destructor explicitly, and make every special member check the flag.

**Explanation:**
```cpp
#include <iostream>
#include <memory>
#include <string>
#include <utility>

template <class T>
class Opt {
    union { T val_; };          // no T constructed by default
    bool engaged_ = false;
public:
    Opt() noexcept {}
    Opt(const T& v) { std::construct_at(&val_, v); engaged_ = true; }
    Opt(const Opt& o) {
        if (o.engaged_) { std::construct_at(&val_, o.val_); engaged_ = true; }
    }
    Opt& operator=(const Opt&) = delete;   // omitted for brevity
    ~Opt() { reset(); }
    template <class... A> T& emplace(A&&... a) {
        reset();
        std::construct_at(&val_, std::forward<A>(a)...);
        engaged_ = true;
        return val_;
    }
    void reset() noexcept {
        if (engaged_) { std::destroy_at(&val_); engaged_ = false; }
    }
    explicit operator bool() const noexcept { return engaged_; }
    T& operator*() noexcept { return val_; }        // no check, like std
};

int main() {
    Opt<std::string> a;
    a.emplace(20, 'z');
    Opt<std::string> b = a;
    a.reset();
    std::cout << bool(a) << ' ' << bool(b) << ' ' << *b << '\n';
}
```
- Output: `0 1 zzzzzzzzzzzzzzzzzzzz`.
- A union is preferred over `alignas(T) std::byte buf[sizeof(T)]` because it allows `constexpr` use and avoids `std::launder`.
- A real implementation also handles move, assignment in all four state combinations, conditional triviality, and `noexcept` propagation.
- ❌ Common wrong answer: "Hold a `T*` and `new` it when needed." That allocates and changes copy semantics.
- ✅ What a strong answer adds: the copy assignment must consider both states: engaged/engaged assigns, empty/engaged constructs, engaged/empty destroys.

**Key takeaway:** optional is a tagged union: storage, a flag, and manual lifetime management.

---
