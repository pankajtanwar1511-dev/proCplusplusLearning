## TOPIC: std::string: SSO, Buffers and Pointer Validity

### INTERVIEW_QA: Interview Questions with Detailed Answers

#### Q1: What is the small string optimization, and is it guaranteed by the standard?
**Difficulty:** #beginner
**Category:** #stl #string
**Concepts:** #sso #layout #implementation_defined

**Answer:**
SSO stores short strings inside the `std::string` object itself instead of allocating a heap block. The standard permits it but does not require it, and the inline capacity is implementation-defined.

**Explanation:**
- libstdc++ / GCC, x86-64: `sizeof(std::string) == 32`, up to 15 characters inline.
- libc++: typically 24 bytes, up to 22 characters inline. MSVC: typically 32 bytes, 15 characters (64-bit release builds).
- Benefits: no allocation, no free, characters on the same cache line as the size.
- Costs: the object is larger than three pointers' worth of "just a handle" in some layouts, and moving a short string copies its characters.
- ❌ Common wrong answer: "Strings up to 15 characters never allocate in C++." That is libstdc++ and MSVC, not C++.
- ✅ What a strong answer adds: a stale pointer into an SSO buffer points into the live string object, so ASan cannot detect its misuse.

**Key takeaway:** SSO is universal in practice and unspecified in the standard; quote numbers with the library name.

---

#### Q2: Where does a `std::string` declared as a local variable keep its characters?
**Difficulty:** #beginner
**Category:** #stl #string
**Concepts:** #object_vs_buffer #sso #heap

**Answer:**
The object is on the stack; the characters are on the stack only if they fit in the SSO buffer. Longer strings keep their characters in a heap block the object owns.

**Explanation:**
- Object location (stack, heap, static, member of another object) and buffer location (inline or heap) are independent questions.
- A `std::string` member of a heap-allocated object has its SSO characters on the heap too, inside the containing object.
- In libstdc++ you can test it: `s.data()` lies inside `[&s, &s + 1)` for an inline string.
- ❌ Common wrong answer: "Local strings live on the stack, `new std::string` lives on the heap." That describes the object only.
- ✅ What a strong answer adds: once a libstdc++ string has gone to the heap, `shrink_to_fit` can bring it back inline once the content is short, so there is no "once heap, always heap" rule. Assigning (copy or move) a short string into it does not: libstdc++ keeps and reuses the heap block (verified with GCC 11/13/14).

**Key takeaway:** Ask two questions: where is the object, and where are its characters.

---

#### Q3: Does `std::string b = a;` share the buffer with `a` until one of them is modified?
**Difficulty:** #beginner
**Category:** #stl #string
**Concepts:** #copy_on_write #cxx11 #abi

**Answer:**
No. Copy-on-write has been non-conforming since C++11; every copy owns its own characters, so `a.data() != b.data()` immediately after the copy.

**Explanation:**
- C++11 forbids non-const `operator[]`, `at`, `begin()` and `end()` from invalidating references, but a COW string must unshare (allocate a new buffer) on first non-const access, which moves the characters.
- C++11 also requires that operations on distinct objects do not race; a shared refcount makes that expensive (atomic RMW on every copy).
- GCC switched to SSO with GCC 5 (`_GLIBCXX_USE_CXX11_ABI`); the `std::__cxx11::` namespace in diagnostics marks the new ABI.
- ❌ Common wrong answer: "Copies are cheap because of COW." That was true for old libstdc++ only.
- ✅ What a strong answer adds: because copies are real copies, take parameters as `std::string_view` or `const std::string&` when you only read, and as `std::string` by value only when you keep a copy (then move it into place).

**Key takeaway:** No COW since C++11: a copy of a long string is an allocation plus `memcpy`.

---

#### Q4: Which `std::string` operations invalidate pointers, references and iterators into it?
**Difficulty:** #intermediate
**Category:** #stl #string
**Concepts:** #invalidation #string_require #c_str

**Answer:**
Any non-const member function except `operator[]`, `at`, `data`, `front`, `back`, `begin`, `rbegin`, `end`, `rend`, plus passing the string by non-const reference to `swap`, `operator>>` or `getline`. Reallocation is not the criterion.

**Explanation:**
- So `+=`, `append`, `push_back`, `insert`, `erase`, `clear`, `resize`, `reserve`, `shrink_to_fit`, `assign` and `swap` all formally invalidate.
- The exempt list is exactly the element-access and iterator-access functions: they can be called through a non-const string without disturbing existing borrows.
- In practice libstdc++ keeps the same buffer when capacity suffices, so code that relies on it "works". It is still UB to use the pointer by the standard's rules.
- ❌ Common wrong answer: "Same as vector: if it doesn't reallocate, pointers stay valid." The vector rule does not apply to `basic_string`.
- ✅ What a strong answer adds: the practical fix is to store indices across mutations and call `c_str()` again right before each use.

**Key takeaway:** For strings, every mutating member except element access invalidates; reacquire after each one.

---

#### Q5: `const char* p = s.c_str(); s += " World"; std::cout << p;` Is this safe if `s` had enough capacity?
**Difficulty:** #intermediate
**Category:** #stl #string
**Concepts:** #invalidation #undefined_behavior #capacity

**Answer:**
No. `operator+=` is not in the exempt list, so `p` is formally invalidated and printing it is UB, capacity or not. On libstdc++ with enough capacity it happens to print the appended text; without capacity it reads freed memory.

**Explanation:**
- The `+=` itself is fine; only the later use of `p` is UB.
- Evidence on libstdc++: with `reserve(64)` first, `p == s.c_str()` still holds after the append; with a long string and no reserve, ASan reports `heap-use-after-free`.
- ❌ Common wrong answer: "Safe if no reallocation." It is a library-specific observation, not a guarantee, even in C++23.
- ✅ What a strong answer adds: the same rule applies to a `std::string_view` built from `s` (topic 02).

**Key takeaway:** Never reason about `c_str()` lifetime from capacity.

---

#### Q6: Is `data()` null-terminated? What changed in C++11 and C++17?
**Difficulty:** #beginner
**Category:** #stl #string
**Concepts:** #data #c_str #null_terminator

**Answer:**
Yes, since C++11 `data()` and `c_str()` return the same pointer to a null-terminated buffer. C++17 adds a non-const overload `char* data()` so you can write into the string through it.

**Explanation:**
- C++98/03: `data()` did not have to be null-terminated, and strings did not have to be contiguous.
- C++11: contiguity required; `s[s.size()]` is a valid read of `'\0'`.
- C++17: `char* data()` for non-const strings; writing at index `size()` anything other than `'\0'` is UB.
- ❌ Common wrong answer: "Use `c_str()` for C APIs because `data()` is not terminated." Outdated by more than a decade.
- ✅ What a strong answer adds: an empty string's `data()` is non-null and points at `'\0'`, so `strlen(s.data())` is safe even for `""`.

**Key takeaway:** `data() == c_str()`, both null-terminated, since C++11.

---

#### Q7: What happens with `std::string s(nullptr);` or a `const char*` that is null?
**Difficulty:** #intermediate
**Category:** #stl #string
**Concepts:** #undefined_behavior #cxx23 #nullptr

**Answer:**
Undefined behaviour: the constructor calls `traits::length` (strlen) on the pointer. C++23 deletes the `nullptr_t` constructor, so a literal `nullptr` (or `0`) no longer compiles, but a runtime null `const char*` is still UB.

**Explanation:**
- libstdc++ checks and throws `std::logic_error` (GCC 11: `"basic_string::_M_construct null not valid"`; GCC 13/14: `"basic_string: construction from null is not valid"`); other libraries may simply segfault.
- `std::string s = 0;` is the same bug: `0` is a null pointer constant. GCC 13 in C++23 mode rejects both with "use of deleted function basic_string(std::nullptr_t)".
- Typical source: `std::string name = getenv("X");` when the variable is unset.
- ❌ Common wrong answer: "It creates an empty string."
- ✅ What a strong answer adds: wrap C sources with `const char* v = ...; std::string s = v ? v : "";`.

**Key takeaway:** A null `const char*` is never an empty string.

---

#### Q8: What is the difference between `size()`, `capacity()` and `max_size()`, and what do `reserve`, `clear` and `shrink_to_fit` do to them?
**Difficulty:** #beginner
**Category:** #stl #string
**Concepts:** #capacity #reserve #shrink_to_fit

**Answer:**
`size()` is the number of characters, `capacity()` how many fit without reallocating, `max_size()` the theoretical limit. `reserve(n)` only raises capacity, `clear()` sets size to 0 and keeps capacity, `shrink_to_fit()` asks (non-binding) to drop capacity to size.

**Explanation:**
- C++20: `reserve(n)` with `n < capacity()` does nothing (before C++20 it was a shrink request; no-arg `reserve()` is deprecated).
- libstdc++: empty string capacity 15; after `clear()` a 120-capacity string keeps 120; `shrink_to_fit` on an empty string returns to the local buffer (15).
- None of these change content except `clear`.
- ❌ Common wrong answer: "`reserve(5)` on a 100-character string truncates it." `reserve` never touches size or content.
- ✅ What a strong answer adds: reuse a string in a loop with `clear()` to avoid reallocations; that is the point of keeping capacity.

**Key takeaway:** `reserve` grows, `clear` empties, `shrink_to_fit` asks; only `resize` changes the size.

---

#### Q9: Why is `if (s.find("x"))` a bug, and what is `npos`?
**Difficulty:** #beginner
**Category:** #stl #string
**Concepts:** #find #npos #unsigned

**Answer:**
`find` returns the position or `npos` (`size_type(-1)`, the largest value). The condition is true for "not found" and for "found at position > 0", and false for "found at position 0", the opposite of the intent.

**Explanation:**
- Correct: `if (s.find("x") != std::string::npos)` or C++23 `s.contains("x")`.
- Storing the result in `int` turns npos into `-1`. Comparisons with `npos` happen to work because `-1` converts back, but arithmetic like `pos + 1` and `substr(pos)` go wrong.
- Use `std::size_t` or `auto` for positions.
- ❌ Common wrong answer: "`find` returns -1 when not found." It returns an unsigned `npos`.
- ✅ What a strong answer adds: `starts_with` / `ends_with` (C++20) replace `find(...) == 0` and `rfind` tricks with clearer, O(prefix) checks.

**Key takeaway:** Always compare `find` results against `npos`.

---

#### Q10: What does `substr` cost, and when does it throw?
**Difficulty:** #beginner
**Category:** #stl #string
**Concepts:** #substr #allocation #out_of_range

**Answer:**
`substr(pos, n)` constructs a new `std::string`: a copy of up to `n` characters, with a heap allocation if the result exceeds the SSO capacity. It throws `std::out_of_range` if `pos > size()`; `pos == size()` returns an empty string.

**Explanation:**
- `n` is clamped: `s.substr(2, 1000)` is fine.
- In a parser that calls `substr` per token, the copies dominate; `std::string_view::substr` is O(1) with no allocation (topic 02).
- ❌ Common wrong answer: "`substr` returns a view into the original." That is `string_view::substr`.
- ✅ What a strong answer adds: C++23 adds `substr() &&`, which can reuse the buffer of an rvalue string.

**Key takeaway:** `std::string::substr` always makes a new string.

---

#### Q11: What happens to `a` and to a pointer into `a` after `std::string b = std::move(a);`?
**Difficulty:** #intermediate
**Category:** #stl #string
**Concepts:** #move #sso #pointer_validity

**Answer:**
`a` is left valid but unspecified (empty in practice). A pointer taken from `a.data()` before the move is formally invalidated. For a long string libstdc++ steals the heap block, so the old pointer equals `b.data()`; for a short string the characters are copied and the pointer still points into `a`.

**Explanation:**
- The move constructor is `noexcept` in all major libraries, which is why `std::vector<std::string>` moves strings on growth.
- Moving a short string is not cheaper than copying it: there is nothing to steal.
- Verified on libstdc++: a 5-character string gives `p != b.data()`; a 40-character string gives `p == b.data()`.
- ❌ Common wrong answer: "Pointers follow the data after a move." Only heap buffers move, and even that is not guaranteed.
- ✅ What a strong answer adds: moved-from rules in general (valid but unspecified, reassign before reading) belong to Memory & Ownership, topic 03.

**Key takeaway:** A move is a pointer steal only for heap strings; pointers never survive it by contract.

---

#### Q12: Why do `std::string s{5, 'a'};` and `std::string s(5, 'a');` differ?
**Difficulty:** #beginner
**Category:** #stl #string
**Concepts:** #initializer_list #brace_init #constructors

**Answer:**
Braces prefer the `initializer_list<char>` constructor, so `{5, 'a'}` builds a 2-character string (`'\x05'`, `'a'`). Parentheses select the count + char constructor: `"aaaaa"`.

**Explanation:**
- Same rule as `std::vector<int>{10}` vs `(10)` (topic 05).
- Related silent conversions: `s = 65;` assigns `"A"` through `operator=(char)`; `std::string s = 'a';` does not compile.
- ❌ Common wrong answer: "Uniform initialization means braces and parentheses are interchangeable."
- ✅ What a strong answer adds: compile with `-Wconversion` to catch `s += some_int;`.

**Key takeaway:** For count + value constructors, use parentheses.

---

#### Q13: How do you write into a `std::string` from a C API without an extra copy?
**Difficulty:** #intermediate
**Category:** #stl #string
**Concepts:** #data #resize_and_overwrite #c_interop

**Answer:**
C++17: `resize(max)`, write through non-const `data()`, then `resize(actual)`. C++23: `resize_and_overwrite(max, op)`, where `op(char* buf, size_t n)` writes and returns the final length, skipping the zero-fill.

**Explanation:**
- Writing `size() + 1` bytes is fine because the terminator slot exists, but the byte at `size()` must end up `'\0'`.
- Before C++17, `&s[0]` gave a writable pointer (valid since C++11 contiguity).
- `resize_and_overwrite` restrictions: `op` must return a length `<= n`, must not touch the string other than through `buf`, and if it throws the behaviour is undefined.
- ❌ Common wrong answer: "Write into `c_str()` after a `const_cast`." Writing through `c_str()` is UB.
- ✅ What a strong answer adds: for formatting, C++20 `std::format_to` with `std::back_inserter(s)` appends without temporaries.

**Key takeaway:** `data()` is writable since C++17; `resize_and_overwrite` (C++23) avoids the zero-fill.

---

#### Q14: What is the cheapest way to convert numbers to and from strings?
**Difficulty:** #intermediate
**Category:** #stl #string
**Concepts:** #to_chars #from_chars #to_string #stoi

**Answer:**
`std::to_chars` / `std::from_chars` (C++17): no allocation, no locale, no exceptions, results reported through an error code. `std::to_string` allocates a string; `std::stoi` wraps `strtol` (locale-dependent, skips leading whitespace) and throws on errors.

**Explanation:**
- `from_chars` does not skip leading whitespace and does not accept a leading `+`; check `ec` and the returned pointer.
- Floating-point `to_chars` gives the shortest round-trip representation (library support: GCC 11).
- `std::stoi("12abc")` returns 12 and silently ignores the rest unless you pass and check the `pos` argument.
- ❌ Common wrong answer: "`stringstream` is the standard way." It is the slowest: locale, virtual calls, allocations.
- ✅ What a strong answer adds: in a hot path, format into a stack `char[32]` with `to_chars`, then `append` once.

**Key takeaway:** Hot path: `to_chars` / `from_chars`; convenience: `std::format` / `to_string`.

---

#### Q15: What do C++20 and C++23 add to `std::string`?
**Difficulty:** #beginner
**Category:** #stl #string #modern_cpp
**Concepts:** #starts_with #contains #constexpr #cxx23

**Answer:**
C++20: `starts_with`, `ends_with`, `constexpr` strings (usable inside constant evaluation, but not surviving into runtime), `<=>`, `reserve` no longer shrinks, and `std::format`. C++23: `contains`, `resize_and_overwrite`, `substr() &&`, deleted `nullptr_t` constructor.

**Explanation:**
- `constexpr std::string` (C++20): a string can be built and destroyed inside a `constexpr` function; a `constexpr std::string` variable holding a heap allocation is not allowed (transient allocation only).
- `std::format` library support arrived in GCC 13; GCC 11 and 12 have no `<format>`.
- ❌ Common wrong answer: "`contains` is C++20." It is C++23 (GCC 11 rejects it with `-std=c++20` and accepts it with `-std=c++2b`).
- ✅ What a strong answer adds: C++26 adds `std::string + std::string_view` concatenation.

**Key takeaway:** Version-tag the members: `starts_with` C++20, `contains` C++23.

---

#### Q16: Why is the move constructor of `std::string` `noexcept`, and why does that matter?
**Difficulty:** #intermediate
**Category:** #stl #string
**Concepts:** #noexcept #vector_growth #move_if_noexcept

**Answer:**
Moving a string never allocates (steal the heap block or copy at most the inline characters), so it cannot fail and is declared `noexcept`. That lets `std::vector<std::string>` move elements on reallocation instead of copying them.

**Explanation:**
- A vector uses `std::move_if_noexcept` during growth to keep the strong exception guarantee (details: Memory & Ownership, topic 02).
- Move assignment is `noexcept` when the allocator propagates or always compares equal (true for `std::allocator`).
- ❌ Common wrong answer: "Move is always noexcept for standard types." Not true for every type (for example `std::deque<int>` in libstdc++: `is_nothrow_move_constructible_v` is `false`, its move constructor allocates).
- ✅ What a strong answer adds: a class that contains a `std::string` and declares its own move constructor without `noexcept` loses this benefit.

**Key takeaway:** `noexcept` string moves make vector growth cheap; keep it when wrapping strings in your own types.

---
