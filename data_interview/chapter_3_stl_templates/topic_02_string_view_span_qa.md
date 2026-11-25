## TOPIC: std::string_view and std::span

### INTERVIEW_QA: Interview Questions with Detailed Answers

#### Q1: What is `std::string_view`, and what problem does it solve?
**Difficulty:** #beginner
**Category:** #stl #string_view
**Concepts:** #non_owning #pointer_length #cxx17

**Answer:**
A C++17 non-owning, read-only view of a character sequence: a pointer plus a length. It lets one function accept literals, `std::string`, character buffers and slices of them without copying or allocating.

**Explanation:**
- `sizeof(std::string_view)` is 16 on 64-bit platforms; copying it copies two words, so pass it by value.
- Operations that only move the window (`substr`, `remove_prefix`, `remove_suffix`) are O(1).
- It replaces two older parameter styles: `const char*` (no length, O(n) `strlen`) and `const std::string&` (forces a temporary string for literals).
- ❌ Common wrong answer: "A lightweight `std::string`." It owns nothing and cannot outlive its source.
- ✅ What a strong answer adds: the price is that lifetime becomes the programmer's job; the compiler accepts views of temporaries silently.

**Key takeaway:** `string_view` = borrowed `(pointer, length)`: ideal for parameters, dangerous for anything that outlives the call.

---

#### Q2: Which of these return a valid view? `return "name";`, `std::string s = "name"; return s;`, `return std::string("name");`
**Difficulty:** #beginner
**Category:** #stl #string_view
**Concepts:** #dangling #lifetime #string_literal

**Answer:**
Only `return "name";`. A string literal has static storage duration. The local `s` dies when the function returns, and the temporary `std::string("name")` dies at the end of the `return` statement inside the function, so both of those views dangle before the caller uses them.

**Explanation:**
- A `string_view` is not a reference, so no lifetime extension applies to the temporary.
- With short strings the buffer is inline (SSO) in a stack object, so the program may print the right text by accident; with long strings ASan reports `heap-use-after-free`.
- GCC 13 with `-Wall -Wextra` gives no warning for either dangling version; Clang 14 warns for both by default (`-Wreturn-stack-address`).
- ❌ Common wrong answer: "The temporary lives until the end of the caller's full expression." That rule is for temporaries created in the caller's expression, not for one created inside the callee's `return`.
- ✅ What a strong answer adds: a function-local `static std::string` is safe to return as a view, until someone modifies that static string.

**Key takeaway:** Return `std::string` when the function creates the text; return a view only into storage that outlives the caller.

---

#### Q3: Is `std::string_view sv = std::string("hello");` legal? Is it safe?
**Difficulty:** #beginner
**Category:** #stl #string_view
**Concepts:** #temporary #full_expression #dangling

**Answer:**
It compiles (through `std::string::operator string_view()`), but the temporary string is destroyed at the end of the full expression, so `sv` dangles from the next statement on.

**Explanation:**
- Same trap with `s.substr(...)`, `s + "x"`, `std::to_string(n)`, `get_name()` returning `std::string`.
- C++ deliberately allows the conversion from rvalue strings because it is needed for `f(std::string("x"))` where `f` takes a `string_view`: there the temporary lives until the call completes.
- ❌ Common wrong answer: "It will not compile because you cannot bind a view to a temporary."
- ✅ What a strong answer adds: Clang's `-Wdangling-gsl` warns for this exact line; GCC does not.

**Key takeaway:** Initializing a view from a temporary string compiles and dangles.

---

#### Q4: Is `string_view::data()` null-terminated? What goes wrong if you pass it to `strlen` or `printf("%s")`?
**Difficulty:** #beginner
**Category:** #stl #string_view
**Concepts:** #null_terminator #c_interop #buffer_overread

**Answer:**
Not guaranteed. A view of a whole literal or whole `std::string` happens to be followed by `'\0'`, but a view from `substr` or `(ptr, len)` usually is not, so C functions read past the view until they find some null byte.

**Explanation:**
- `std::string t = "abcdef"; strlen(std::string_view(t).substr(0, 3).data())` returns 6.
- Over a raw network buffer there may be no terminator anywhere: buffer over-read.
- Safe: `printf("%.*s", int(sv.size()), sv.data())`, `std::cout << sv`, `std::from_chars(first, last, x)`, or `std::string(sv).c_str()` when a terminator is required.
- ❌ Common wrong answer: "`data()` is null-terminated like `std::string::data()`."
- ✅ What a strong answer adds: functions that end in a C API should take `const std::string&` (or a "zstring" type), not `string_view`, to avoid a hidden copy or a hidden bug.

**Key takeaway:** A view has a length, not a terminator.

---

#### Q5: If the source string does not reallocate, does a `string_view` into it stay valid?
**Difficulty:** #intermediate
**Category:** #stl #string_view
**Concepts:** #invalidation #string_require #stale_size

**Answer:**
Not by the standard. A view is a pointer into the string, and the string rules invalidate pointers on every non-const member call except element and iterator access (`[]`, `at`, `data`, `front`, `back`, `begin`, `end`), reallocation or not. Even when the memory survives in practice, the view's size does not update.

**Explanation:**
- `s[0] = 'X'` through `operator[]` is fine and visible through the view.
- `s += "FG"` within capacity: libstdc++ keeps the buffer, the view still shows only the old 5 characters, and it is formally invalid.
- `s.clear()`: libstdc++ writes `'\0'` at `s[0]`; the view (size 5) prints a null byte followed by stale characters.
- Reallocation: `heap-use-after-free`.
- ❌ Common wrong answer: "Only reallocation invalidates views." That is the `std::vector` rule, and even for vectors the view size goes stale.
- ✅ What a strong answer adds: a view is not a snapshot; writes through `operator[]` show up, size changes do not.

**Key takeaway:** After any mutating call on the owner, rebuild the view.

---

#### Q6: What is the difference between `std::string::substr` and `std::string_view::substr`?
**Difficulty:** #beginner
**Category:** #stl #string_view
**Concepts:** #substr #allocation #view

**Answer:**
`std::string::substr` returns a new owning `std::string` (a copy, possibly a heap allocation). `std::string_view::substr` returns a new view into the same characters in O(1). Both throw `out_of_range` if `pos > size()` and clamp the count.

**Explanation:**
- `std::string_view sv = s.substr(0, 5);` is a dangling view of a temporary.
- `std::string_view sv = std::string_view(s).substr(0, 5);` is a view of `s`.
- Parsers that slice many fields should convert to a view first, then slice.
- ❌ Common wrong answer: "Assigning `s.substr()` to a `string_view` avoids the copy." The copy still happens and the view then outlives it.
- ✅ What a strong answer adds: C++23 `std::string::substr() &&` can reuse the buffer of an rvalue string, which helps owning code, not views.

**Key takeaway:** Convert to a view first, then `substr`.

---

#### Q7: When should a function take `std::string_view`, `const std::string&`, or `std::string` by value?
**Difficulty:** #intermediate
**Category:** #stl #api_design
**Concepts:** #parameter_passing #sink_parameter #string_view

**Answer:**
`string_view` by value for read-only, synchronous use. `const std::string&` when the function needs a null-terminated string or forwards to an API that takes `const std::string&`. `std::string` by value when the function stores the text (a sink): the caller can move into it.

**Explanation:**
- With a `const std::string&` parameter, a literal longer than the SSO capacity costs one allocation per call; a view costs none (verified by counting `operator new`).
- A view parameter that is later converted with `std::string(sv)` to call a C API or to store it pays the copy anyway; in that case take `std::string`.
- Storing a view parameter in a member is a lifetime bug waiting for the first caller that passes a temporary.
- ❌ Common wrong answer: "Always use `string_view` for strings now." It is a parameter type for borrowing, not a replacement for `std::string`.
- ✅ What a strong answer adds: for `std::map<std::string, V>` lookups, a view only helps with a transparent comparator (`std::less<>`); otherwise `find` needs a `std::string`.

**Key takeaway:** Borrow with a view, terminate with `const std::string&`, store with `std::string` by value.

---

#### Q8: Why is `std::map<std::string_view, int>` dangerous, and what should you use instead?
**Difficulty:** #intermediate
**Category:** #stl #string_view #containers
**Concepts:** #dangling_key #heterogeneous_lookup #less_void

**Answer:**
The map stores views, not characters. Keys built from temporaries or from strings that later change point into dead memory, and every later comparison reads it. Use `std::map<std::string, int, std::less<>>`: the map owns its keys and can still be searched with a `string_view`.

**Explanation:**
- A `string_view` key is fine only when the characters outlive the map (literals, an arena or buffer owned next to the map that never reallocates).
- `std::less<>` is transparent: `find`, `count`, `contains`, `lower_bound` accept anything comparable with `std::string` (C++14 for ordered containers).
- For `std::unordered_map`, heterogeneous lookup needs both a transparent hash and a transparent equality (C++20), see topic 09.
- ❌ Common wrong answer: "Views as keys save memory, so they are a free optimization."
- ✅ What a strong answer adds: `std::hash<std::string_view>` equals `std::hash<std::string>` for the same characters, which is what makes transparent hashing consistent.

**Key takeaway:** Containers should own their keys; look them up with views.

---

#### Q9: Why does `flag ? s : "default"` assigned to a `string_view` dangle?
**Difficulty:** #advanced
**Category:** #stl #string_view
**Concepts:** #conditional_operator #common_type #temporary

**Answer:**
The conditional operator needs one result type. With operands `std::string` and `const char[8]`, the literal converts to `std::string`, so the result is a `std::string` prvalue: a temporary copy of `s` or a temporary built from the literal. The view binds to that temporary, which dies at the semicolon.

**Explanation:**
- The copy happens even when `flag` is true: the result is a new string, not `s` itself.
- Fix: make both operands views, `flag ? std::string_view(s) : "default"sv`; then the result type is `string_view` and no temporary is created.
- Same issue with `auto x = flag ? s : "default";` (that `x` is a `std::string` copy, at least not dangling).
- ❌ Common wrong answer: "When `flag` is true the view points at `s`."
- ✅ What a strong answer adds: ASan reports `heap-use-after-free` for a long `s`; for short strings the bug can hide in a dead stack temporary.

**Key takeaway:** Check the conditional's type before binding a view to it.

---

#### Q10: What is `std::span`, and how does it relate to `string_view`?
**Difficulty:** #beginner
**Category:** #stl #span
**Concepts:** #span #contiguous #cxx20

**Answer:**
`std::span<T>` (C++20) is a non-owning view over any contiguous sequence of `T`: a pointer and a size. It is the generic counterpart of `string_view`, and unlike `string_view` it allows writing elements unless you use `span<const T>`.

**Explanation:**
- Constructible from built-in arrays, `std::array`, `std::vector`, `std::string` (as `span<const char>` or `span<char>`), `(ptr, n)` and `(first, last)`.
- `span<const T>` is the read-only parameter type that accepts all of those without templates.
- Same lifetime rules as `string_view`: it owns nothing.
- `string_view` adds string operations (`find`, `starts_with`, comparison with literals); `span` adds `first`, `last`, `subspan`, `as_bytes`.
- ❌ Common wrong answer: "`span` copies the elements into a lightweight array."
- ✅ What a strong answer adds: `span` replaces the C idiom `(T* p, size_t n)` and keeps the two values together, which removes a whole class of length mismatch bugs.

**Key takeaway:** `span<const T>` is the universal read-only contiguous parameter.

---

#### Q11: What is the difference between `std::span<int>` and `std::span<int, 4>`?
**Difficulty:** #intermediate
**Category:** #stl #span
**Concepts:** #static_extent #dynamic_extent #sizeof

**Answer:**
`std::span<int>` has a dynamic extent: it stores a pointer and a size (16 bytes on 64-bit). `std::span<int, 4>` has a static extent: the size is part of the type, only a pointer is stored (8 bytes), and conversions from a dynamic range are explicit with a size precondition.

**Explanation:**
- `std::array<int, 4>` and `int[4]` convert implicitly to `span<int, 4>`; a `std::vector` needs `std::span<int, 4>(v.data(), 4)` (explicit), and a wrong size is UB.
- A static-extent span converts implicitly to a dynamic one.
- `first<N>()`, `last<N>()`, `subspan<Off, N>()` produce static-extent spans; the runtime versions produce dynamic ones.
- ❌ Common wrong answer: "The extent is checked at run time and throws."
- ✅ What a strong answer adds: a fixed-size protocol header is a good fit for `span<const std::byte, N>`: the size is checked at compile time.

**Key takeaway:** Static extent moves the size into the type; dynamic extent stores it.

---

#### Q12: Does `std::span` check bounds?
**Difficulty:** #beginner
**Category:** #stl #span
**Concepts:** #bounds_checking #precondition #cxx26

**Answer:**
No. `operator[]`, `front`, `back`, `first`, `last` and `subspan` have preconditions, not checks; violating them is UB. C++26 adds a checked `at()`.

**Explanation:**
- Debug modes can catch it: `-D_GLIBCXX_ASSERTIONS` adds assertions to libstdc++'s `span` accessors.
- `string_view::at` and `string_view::substr` do throw `out_of_range`; `span` was designed without exceptions.
- ❌ Common wrong answer: "`span` is a safe array, so indexing is checked."
- ✅ What a strong answer adds: the safety `span` gives is that the size travels with the pointer, so loops can use `s.size()` instead of a separately passed length.

**Key takeaway:** `span` carries the size; it does not enforce it.

---

#### Q13: What happens to a `std::span` over a `std::vector` when you `push_back` to the vector?
**Difficulty:** #intermediate
**Category:** #stl #span
**Concepts:** #invalidation #reallocation #stale_size

**Answer:**
The span is not notified. If the `push_back` reallocates, the span points into freed memory. If it does not, the span is still valid for its old elements, but its size stays at the old value, so the new element is invisible through it.

**Explanation:**
- The span stores `(v.data(), v.size())` at construction.
- `std::vector` keeps pointers valid when there is no reallocation (unlike `std::string`), so the no-reallocation case is well defined for the old elements.
- Rebuild the span after any operation that changes the vector's size.
- ❌ Common wrong answer: "`span` references the vector, so it sees the new element."
- ✅ What a strong answer adds: for long-lived handles into a growing container, store indices, not spans or pointers.

**Key takeaway:** A span is a snapshot of pointer and size.

---

#### Q14: What is a borrowed range, and what is `std::ranges::dangling`?
**Difficulty:** #advanced
**Category:** #stl #ranges
**Concepts:** #borrowed_range #dangling #ranges_algorithms

**Answer:**
A borrowed range is one whose iterators stay valid after the range object is destroyed (`string_view`, `span`, lvalue references). If you pass an rvalue non-borrowed range (a temporary `std::vector`) to a ranges algorithm that returns an iterator, it returns `std::ranges::dangling`, which cannot be dereferenced, so the bug becomes a compile error.

**Explanation:**
- `std::ranges::find(make_vector(), 3)` returns `ranges::dangling`; `*it` fails to compile.
- `std::ranges::find(std::string_view("abc"), 'b')` returns a real iterator.
- A type opts in with `std::ranges::enable_borrowed_range<T> = true`.
- ❌ Common wrong answer: "Borrowed means the range owns its elements." It means the opposite: the iterators do not depend on the range object.
- ✅ What a strong answer adds: borrowed protects against the temporary range object dying, not against the underlying owner dying.

**Key takeaway:** `ranges::dangling` is the compiler refusing to hand out an iterator into a temporary container.

---

#### Q15: Why can you not write `std::string r = s + sv;` and how do you concatenate?
**Difficulty:** #beginner
**Category:** #stl #string_view
**Concepts:** #operator_plus #explicit_conversion #cxx26

**Answer:**
Until C++26 there is no `operator+` between `std::string` and `std::string_view`, and `string_view` does not convert implicitly to `std::string`, so it does not compile. Use `s + std::string(sv)`, or better `std::string r = s; r.append(sv);` (or `r += sv`).

**Explanation:**
- `std::string::append`, `operator+=`, `insert`, `compare`, `find` all accept a `string_view` (C++17).
- The conversion `std::string(sv)` is explicit on purpose: it allocates, and implicit allocation was considered a trap.
- C++26 (P2591) adds the `operator+` overloads.
- ❌ Common wrong answer: "string_view converts to string implicitly like `const char*`."
- ✅ What a strong answer adds: for several pieces, `reserve` once then `append` each view.

**Key takeaway:** View to string is explicit; append views instead of adding them.

---
