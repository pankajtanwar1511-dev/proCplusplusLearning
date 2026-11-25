## TOPIC: Top 50: Must-Know STL and Templates Interview Questions

### THEORY_SECTION: Start Here

#### 1. How to use this list
- The 52 highest-value items from this chapter: 24 interview questions and 28 code puzzles.
- Every topic in the chapter is represented, so this list doubles as a fast revision pass before an interview.
- Each item is built around a misconception that many engineers hold. Answer it yourself before revealing the answer.
- Every answer ends with a "Deep dive" pointer to the full topic for more questions on the same idea.
- Interview Q&A tab: conceptual and design questions. Practice Tasks tab: output prediction and bug hunting.

#### 2. Coverage map
| Topic | Interview questions | Code puzzles |
|---|---|---|
| 1. std::string: SSO, Buffers and Pointer Validity | 2 | 2 |
| 2. std::string_view and std::span | 2 | 2 |
| 3. std::optional and std::expected | 2 | 2 |
| 4. std::variant, std::visit and std::any | 2 | 2 |
| 5. std::vector Internals | 2 | 3 |
| 6. Iterators and Invalidation Rules | 2 | 3 |
| 7. deque, list, forward_list, array and Adaptors | 2 | 2 |
| 8. std::map and std::set | 2 | 3 |
| 9. Unordered Containers and Hashing | 2 | 2 |
| 10. Templates: Deduction, Specialization and Variadics | 2 | 3 |
| 11. SFINAE, Type Traits and Concepts | 2 | 2 |
| 12. constexpr, consteval and Compile-Time Programming | 2 | 2 |
| **Total** | **24** | **28** |

#### 3. Suggested order
- First pass: the Practice Tasks tab, top to bottom. Predict each output before revealing it.
- Second pass: the Interview Q&A tab. Say each answer out loud in under a minute, then compare.
- Any item you miss: open its Deep dive topic and work through that topic's full question set.

### EDGE_CASES: The Traps That Catch the Most Engineers

#### Edge Case 1: The append that "works" but is still invalid
- `const char* p = s.c_str(); s += " world"; puts(p);` may print the full text on libstdc++ when capacity was sufficient.
- The standard says `+=` may invalidate `p` regardless of capacity. Another library, a debug mode, or a future version may behave differently.
- When capacity is exceeded, libstdc++ allocates a new block and frees the old one: ASan reports `heap-use-after-free` on the next use of `p`.
- Rule: never reason from capacity for strings; reacquire the pointer.
- Deep dive: Topic 1, std::string: SSO, Buffers and Pointer Validity

#### Edge Case 2: Returning a temporary as a view
- `std::string_view name() { return std::string(60, 'N'); }` compiles without warnings in GCC 13 (`-Wall -Wextra`).
- The temporary is destroyed at the end of the `return` statement, before control reaches the caller. The view returned already dangles.
- With a short string the buffer was on the callee's stack and the program may even print the right text; with a long one ASan reports `heap-use-after-free` in the caller.
- Fix: return `std::string` (by value, NRVO or move makes it cheap).
- Deep dive: Topic 2, std::string_view and std::span

#### Edge Case 3: Dangling reference from a temporary optional
- `const std::string& name = *find_name(id);` where `find_name` returns `std::optional<std::string>` by value:
  - The returned optional is a temporary; `*` returns a reference into it, not the temporary itself, so **no** lifetime extension applies.
  - The temporary (and its string) is destroyed at the end of the full expression; `name` dangles.
- Same bug with `.value()`, `->` and `for (char c : *find_name(id))` (range-for over a member of a temporary: fixed only in C++23 by P2718, which GCC 11/13 do not implement).
- Fix: keep the optional: `auto name = find_name(id); if (name) use(*name);` or copy: `std::string n = *find_name(id);`.
- The reset/reassign variant of this bug (reference into an optional that is later reset) is covered in Memory & Ownership, topic 01.
- Deep dive: Topic 3, std::optional and std::expected

#### Edge Case 4: A string literal picks a surprising alternative
- `std::variant<bool, std::string> v = "hello";`
  - C++17 as published: `const char*` to `bool` is a standard conversion and beats the user-defined conversion to `std::string`, so it held `true`.
  - After P0608 (adopted for C++20; GCC 10+ and libc++ also apply it in C++17 mode; MSVC first enabled it only for `/std:c++20` and extended it to C++17 later): pointer-to-bool is excluded, so it holds the string (`index() == 1` on GCC 11 in both `-std=c++17` and `-std=c++20`).
- `std::variant<std::string, const char*> v = "x";` holds the `const char*` (exact match after decay), not the string.
- `std::variant<std::string, std::string_view> v = "x";` does not compile: two user-defined conversions, ambiguous.
- Rule: when the alternative matters, say it: `v = std::string("hello");` or `v.emplace<std::string>("hello");`.
- Deep dive: Topic 4, std::variant, std::visit and std::any

#### Edge Case 5: Pushing an element of the same vector
- `v.push_back(v[0]);` at full capacity looks dangerous: the reference argument points into the block being replaced.
- The standard requires it to work, and libstdc++ constructs the new element (copying from the old block) before releasing the old block.
- The same holds for `insert(pos, v[i])`: implementations copy the value first. It is a hand-written container that usually gets this wrong.
- Deep dive: Topic 5, std::vector Internals

#### Edge Case 6: Range-for plus push_back
- `for (int x : v) v.push_back(x);` looks like "duplicate the vector".
- The hidden `last` iterator is the old `end()`. On reallocation, `first` points into freed memory: ASan reports heap-use-after-free.
- With enough capacity reserved, it often appears to work, but the cached `end()` is invalid, so it is still UB.
- Fix: `v.insert(v.end(), v.begin(), v.end())` is also wrong (source range aliases the destination and is invalidated). Copy first, or index: `auto n = v.size(); for (std::size_t i = 0; i < n; ++i) v.push_back(v[i]);` (topic 05 explains why `push_back(v[i])` itself is safe).
- Deep dive: Topic 6, Iterators and Invalidation Rules

#### Edge Case 7: deque is random access but not contiguous
- `&d[0] + k` is only valid inside the first block. Code that treats a deque like an array (passing `&d[0]` and `d.size()` to a C function or `memcpy`) reads across block boundaries into unrelated memory.
```cpp
#include <deque>
#include <iostream>

int main() {
    std::deque<int> d(300);
    int breaks = 0;
    for (std::size_t i = 1; i < d.size(); ++i)
        if (&d[i] != &d[i - 1] + 1) ++breaks;     // next element not adjacent
    std::cout << "block boundaries: " << breaks << '\n';
}
```
- Output (libstdc++, x86-64): `block boundaries: 2` (300 ints over 3 blocks of 128).
- If you need a contiguous view, copy into a vector, or use a vector from the start.
- Deep dive: Topic 7, deque, list, forward_list, array and Adaptors

#### Edge Case 8: The wrong pair type in range-for copies every element
- `for (const std::pair<std::string, int>& p : m)` does not match `std::pair<const std::string, int>`; the compiler builds a temporary converted pair (copying the string) per iteration and binds the reference to it.
- Costs an allocation per long key, and `&p.first` is not the address of the key in the map.
- GCC warns: "loop variable 'p' ... binds to a temporary constructed from type 'std::pair<const ...>'" (`-Wrange-loop-construct`, part of `-Wall`).
- Write `const auto& [k, v]` or `const auto& p`.
- Deep dive: Topic 8, std::map and std::set

#### Edge Case 9: Floating-point keys: NaN and negative zero
- `std::unordered_set<double> s; s.insert(NAN); s.insert(NAN);` gives size 2, and `s.count(NAN)` is 0: equality says NaN equals nothing, not even itself.
- `0.0` and `-0.0` compare equal, so they are one key; `std::hash<double>` must (and does) hash both to the same value.
- Prices as `double` keys also suffer from rounding (`0.1 + 0.2 != 0.3`). Use integer ticks or fixed-point keys.
- Deep dive: Topic 9, Unordered Containers and Hashing

#### Edge Case 10: Missing typename, template or this->
- `T::value_type x;` is parsed as a value expression: error "need 'typename' before 'T::value_type' because 'T' is a dependent scope".
- `t.get<0>()` where `t` depends on `T`: may parse `<` as less-than; write `t.template get<0>()`.
- In `template <class T> struct D : Base<T> { void g() { helper(); } };`, `helper` is not found in the dependent base: "there are no arguments to 'helper' that depend on a template parameter, so a declaration of 'helper' must be available". Fix: `this->helper()`.
- Some compilers in permissive modes historically accepted these; GCC and Clang reject them.
- Deep dive: Topic 10, Templates: Deduction, Specialization and Variadics

#### Edge Case 11: static_assert(false) in a discarded branch
- `if constexpr (std::is_integral_v<T>) { ... } else { static_assert(false, "unsupported type"); }`
- GCC 11: "static assertion failed: unsupported type" even when only `int` is used (pre-P2593 rule: a non-dependent false assertion makes the template ill-formed).
- GCC 13+ (any `-std`, P2593R1 as a defect report): compiles; fires only if the else branch is instantiated.
- Portable form: `static_assert(always_false<T>, "...")` (`template <class> constexpr bool always_false = false;`).
- Deep dive: Topic 11, SFINAE, Type Traits and Concepts

#### Edge Case 12: UB, throw and limits are compile errors, not silent fallbacks
- In a constant evaluation: `INT_MAX + 1` → "overflow in constant expression"; `arr[3]` on `int arr[3]` → "array subscript value '3' is outside the bounds"; `*nullptr` → "dereferencing a null pointer"; reading an uninitialized local → "the value of 'x' is not usable in a constant expression".
- A `throw` on the evaluated path → "expression '<throw-expression>' is not a constant expression" (until C++26). Useful as a compile-time assertion inside a constexpr function.
- 1,000,000 iterations of one loop → "'constexpr' loop iteration count exceeds limit of 262144"; deep recursion → "evaluation depth exceeds maximum of 512"; huge total work → "operation count exceeds limit of 33554432" (GCC defaults, adjustable with `-fconstexpr-loop-limit`, `-fconstexpr-depth`, `-fconstexpr-ops-limit`).
- None of these silently turn into run-time computation for a `constexpr` variable: the program does not compile.
- Deep dive: Topic 12, constexpr, consteval and Compile-Time Programming

### CODE_EXAMPLES: Patterns Worth Memorizing

#### Example 1: An event type with visit and the overloaded idiom
- A closed set of messages; adding a new message type makes every visitor that lacks a handler fail to compile.
```cpp
#include <iostream>
#include <string>
#include <variant>
#include <vector>

struct NewOrder { int id; int qty; double price; };
struct Cancel   { int id; };
struct Heartbeat {};

using Event = std::variant<NewOrder, Cancel, Heartbeat>;

template <class... Ts> struct overloaded : Ts... { using Ts::operator()...; };
template <class... Ts> overloaded(Ts...) -> overloaded<Ts...>;   // C++17 (and Clang < 17)

int main() {
    std::vector<Event> events{NewOrder{1, 100, 9.5}, Heartbeat{}, Cancel{1}};
    int live = 0;
    for (const Event& e : events) {
        std::visit(overloaded{
            [&](const NewOrder& o) {
                ++live;
                std::cout << "new " << o.id << " x" << o.qty << '\n';
            },
            [&](const Cancel& c)   { --live; std::cout << "cancel " << c.id << '\n'; },
            [](const Heartbeat&)   { std::cout << "heartbeat\n"; },
        }, e);
    }
    std::cout << "live orders: " << live << '\n';
    std::cout << "sizeof(Event) = " << sizeof(Event) << '\n';
}
```
- Output:
```
new 1 x100
heartbeat
cancel 1
live orders: 0
sizeof(Event) = 24
```
- `sizeof(Event)` is 24 on libstdc++ / GCC, x86-64: `NewOrder` is 16 bytes, plus the index, rounded to alignment 8.
- The events are stored contiguously in the vector: no heap allocation per event, unlike `vector<unique_ptr<EventBase>>`.
- Deep dive: Topic 4, std::variant, std::visit and std::any

#### Example 2: The order of a reallocation
- A noisy type shows that the new element is constructed before the old ones are relocated.
```cpp
#include <iostream>
#include <vector>

struct Noisy {
    int id;
    Noisy(int i) : id(i) { std::cout << "ctor" << id << ' '; }
    Noisy(const Noisy& o) : id(o.id) { std::cout << "copy" << id << ' '; }
    Noisy(Noisy&& o) noexcept : id(o.id) { std::cout << "move" << id << ' '; }
    ~Noisy() { std::cout << "dtor" << id << ' '; }
};

int main() {
    std::vector<Noisy> v;
    v.reserve(2);
    v.emplace_back(1);
    v.emplace_back(2);
    std::cout << "\nat capacity, emplace_back(3): ";
    v.emplace_back(3);
    std::cout << "\nself push_back at capacity:   ";
    std::vector<Noisy> w;
    w.reserve(1);
    w.emplace_back(7);
    w.push_back(w[0]);                     // argument lives in the old block
    std::cout << "\nend of main: ";
}
```
- Output (libstdc++ / GCC, x86-64):
```
ctor1 ctor2 
at capacity, emplace_back(3): ctor3 move1 dtor1 move2 dtor2 
self push_back at capacity:   ctor7 copy7 move7 dtor7 
end of main: dtor7 dtor7 dtor1 dtor2 dtor3 
```
- `copy7` happens before `move7 dtor7`: the copy reads the old block while it is still alive.
- Remove `noexcept` from the move constructor and every `move` in the relocation becomes `copy` (details in Memory & Ownership, topic 02).
- Deep dive: Topic 5, std::vector Internals

#### Example 3: Three ways to remove elements correctly
- `std::erase_if` (C++20) for a vector, the erase-remove idiom for older code, and the iterator loop for a node container with per-element work.
```cpp
#include <algorithm>
#include <iostream>
#include <map>
#include <string>
#include <vector>

int main() {
    std::vector<int> a{5, 12, 7, 20, 3, 18};
    auto removed = std::erase_if(a, [](int x) { return x > 10; });   // C++20
    std::cout << "erase_if removed " << removed << ": ";
    for (int x : a) std::cout << x << ' ';
    std::cout << '\n';

    std::vector<int> b{5, 12, 7, 20, 3, 18};
    auto new_end = std::remove_if(b.begin(), b.end(), [](int x) { return x > 10; });
    std::cout << "after remove_if size is still " << b.size() << '\n';
    b.erase(new_end, b.end());                                        // now shrink
    std::cout << "after erase size " << b.size() << '\n';

    std::map<int, std::string> orders{{1, "open"}, {2, "filled"}, {3, "open"}};
    for (auto it = orders.begin(); it != orders.end(); ) {
        if (it->second == "filled") {
            std::cout << "archiving order " << it->first << '\n';     // per-element work
            it = orders.erase(it);
        } else {
            ++it;
        }
    }
    std::cout << "open orders: " << orders.size() << '\n';
}
```
- Output:
```
erase_if removed 3: 5 7 3 
after remove_if size is still 6
after erase size 3
archiving order 2
open orders: 2
```
- `std::erase_if` returns the number of removed elements (C++20). For `map` and other node containers `std::erase_if` also exists and does the iterator loop internally.
- Deep dive: Topic 6, Iterators and Invalidation Rules

#### Example 4: A custom key with std::hash specialization and hash_combine
- `Point` gets `operator==` and a `std::hash` specialization, so the map needs no extra template arguments.
- `PairHash` shows the functor form for `std::pair`, which has no standard hash.
```cpp
#include <cstddef>
#include <functional>
#include <iostream>
#include <string>
#include <unordered_map>
#include <utility>

inline void hash_combine(std::size_t& seed, std::size_t h) {
    seed ^= h + 0x9e3779b97f4a7c15ULL + (seed << 6) + (seed >> 2);
}

struct Point {
    int x, y;
    bool operator==(const Point&) const = default;   // C++20
};

template <>
struct std::hash<Point> {
    std::size_t operator()(const Point& p) const noexcept {
        std::size_t seed = 0;
        hash_combine(seed, std::hash<int>{}(p.x));   // same fields as operator==
        hash_combine(seed, std::hash<int>{}(p.y));
        return seed;
    }
};

struct PairHash {
    template <class A, class B>
    std::size_t operator()(const std::pair<A, B>& p) const noexcept {
        std::size_t seed = 0;
        hash_combine(seed, std::hash<A>{}(p.first));
        hash_combine(seed, std::hash<B>{}(p.second));
        return seed;
    }
};

int main() {
    std::unordered_map<Point, std::string> names;
    names[{0, 0}] = "origin";
    names[{2, 3}] = "target";
    std::cout << names.at({2, 3}) << '\n';

    std::unordered_map<std::pair<int, int>, double, PairHash> cost;
    cost[{1, 2}] = 0.5;
    std::cout << cost.count({1, 2}) << ' ' << cost.count({2, 1}) << '\n';
}
```
- Output:
```
target
1 0
```
- Without the specialization, `std::unordered_map<Point, std::string> names;` fails with "use of deleted function" (the disabled `std::hash<Point>` makes the map's default constructor deleted).
- Deep dive: Topic 9, Unordered Containers and Hashing

#### Example 5: A compile-time lookup table
- A CRC-32 table computed by a `constexpr` function, verified with `static_assert`, used at run time with zero start-up cost.
```cpp
#include <array>
#include <cstdint>
#include <cstdio>
#include <string_view>

constexpr std::array<std::uint32_t, 256> make_crc_table() {
    std::array<std::uint32_t, 256> t{};
    for (std::uint32_t i = 0; i < 256; ++i) {
        std::uint32_t c = i;
        for (int k = 0; k < 8; ++k)
            c = (c & 1) ? (0xEDB88320u ^ (c >> 1)) : (c >> 1);
        t[i] = c;
    }
    return t;
}

constexpr auto crc_table = make_crc_table();       // computed by the compiler
static_assert(crc_table[1] == 0x77073096u);        // known reference value

constexpr std::uint32_t crc32(std::string_view s) {
    std::uint32_t c = 0xFFFFFFFFu;
    for (unsigned char ch : s) c = crc_table[(c ^ ch) & 0xFFu] ^ (c >> 8);
    return c ^ 0xFFFFFFFFu;
}

static_assert(crc32("123456789") == 0xCBF43926u);  // standard CRC-32 check value

int main(int argc, char** argv) {
    std::string_view input = argc > 1 ? argv[1] : "hello world";
    std::printf("crc32(\"%.*s\") = %08x\n",
                int(input.size()), input.data(), crc32(input));
}
```
- Output (no argument):
```
crc32("hello world") = 0d4a1185
```
- `crc_table` is in read-only data: no initialization code runs at start-up, and the `static_assert`s fail the build if the table logic breaks.
- `crc32` is used both at compile time (the check value) and at run time (user input): one implementation, tested by the compiler.
- Deep dive: Topic 12, constexpr, consteval and Compile-Time Programming

### QUICK_REFERENCE: Interview One-Liners for the Whole Chapter

#### std::string: SSO, Buffers and Pointer Validity
| Question | Answer |
|---|---|
| Is SSO guaranteed? | No; libstdc++ 15 chars, libc++ 22 chars |
| `sizeof(std::string)`? | Implementation-defined: 32 on GCC/MSVC, 24 on libc++ (64-bit) |
| Copy-on-write? | Forbidden since C++11 |
| Is `data()` null-terminated? | Yes, since C++11; same pointer as `c_str()` |
| Does `+=` within capacity keep `c_str()` valid? | Not guaranteed; reacquire |
| Which calls never invalidate? | `[]`, `at`, `front`, `back`, `data`, `begin`/`end` family |
| Does moving a short string steal a pointer? | No; characters are copied |
| `std::string(nullptr)`? | UB; compile error in C++23 |
| `s.find(x)` in an `if`? | Bug; compare with `npos` or use C++23 `contains` |
| `substr` cost? | New string; throws if `pos > size()` |
| Shrink a string? | `shrink_to_fit` (non-binding); `reserve` never shrinks since C++20 |
| Fastest int to string? | `std::to_chars` into a buffer |

#### std::string_view and std::span
| Question | Answer |
|---|---|
| What is a string_view? | Non-owning `(pointer, length)` into characters owned elsewhere |
| Return a view of a local string? | Dangling; return `std::string` |
| When does `return std::string("x")` as a view die? | End of the `return` statement in the callee |
| Is `sv.data()` null-terminated? | Not guaranteed |
| View after the owner appends without reallocating? | Formally invalid; size never updates |
| `string_view` or `const string&` parameter? | View for read-only; `const string&` if you need `c_str()`; by-value `string` if you store it |
| Can `string_view` modify text? | No; `span<char>` can |
| `span` vs `string_view`? | `span<T>` is the generic contiguous view; `string_view` adds string operations |
| Static vs dynamic extent? | `span<T, N>` stores only a pointer; `span<T>` stores pointer + size |
| `ranges::dangling`? | Returned for rvalue non-borrowed ranges; cannot be dereferenced |

#### std::optional and std::expected
| Question | Answer |
|---|---|
| Does optional allocate? | No; `T` is stored inside the optional |
| `*o` vs `o.value()` on empty? | UB vs throws `bad_optional_access` |
| Is `value_or(f())` lazy? | No; `f()` always runs |
| What does `reset()` destroy? | The contained `T`, not the optional |
| `optional<bool>` holding false in `if`? | True: tests engagement |
| `optional<T&>`? | Not allowed before C++26; use `T*` |
| Empty vs -5? | Empty is less than any value |
| optional vs expected? | optional: missing; expected: missing with a typed reason |
| How to return an error from expected? | `return std::unexpected(e);` |
| `expected<int,int>`, `return 42;`? | Success with value 42 |
| `and_then` vs `transform`? | Step returns optional/expected vs a plain value |
| When exceptions instead? | Rare, non-local failures; constructors; errors handled far away |

#### std::variant, std::visit and std::any
| Question | Answer |
|---|---|
| Where is a variant's value stored? | In-place, inside the variant; no heap |
| How does variant know the active type? | A stored index |
| `get` vs `get_if`? | Reference + throw vs pointer + nullptr |
| Why `std::visit` over `switch(index())`? | Compile-time check that every type is handled |
| Is visit compile-time dispatch? | No; run-time branch on the index, no vptr |
| variant vs virtual? | Closed set, in-place, easy new operations vs open set, heap, easy new types |
| What is `monostate`? | An intentional empty alternative |
| What is valueless_by_exception? | Old value destroyed, new construction threw: no value |
| `variant<bool, string> v = "hi"`? | string (since P0608) |
| any vs variant? | Run-time open type erasure vs compile-time closed set |
| `any a = "hi"; any_cast<string>(a)`? | Throws: stored type is `const char*` |
| Does any allocate? | Implementation-specific; libstdc++ inline only for pointer-sized nothrow-movable types |

#### std::vector Internals
| Question | Answer |
|---|---|
| size vs capacity? | Constructed elements vs allocated slots |
| Growth factor? | Geometric, implementation-defined (2x GCC/Clang, 1.5x MSVC) |
| Why geometric? | Amortized O(1) `push_back` |
| `reserve(100); v[50] = 1;`? | UB; size is 0 (ASan silent, `_GLIBCXX_ASSERTIONS` aborts) |
| `push_back` at full capacity? | Always reallocates; all borrows die |
| Reallocation order in libstdc++? | Construct new element, relocate old, destroy old, free |
| Is `v.push_back(v[0])` safe? | Yes, required to work |
| Copy or move on growth? | Move if `noexcept` (or not copyable), else copy |
| `emplace_back` vs `push_back`? | Saves one move only when passing constructor arguments |
| `vector<int>{10}` size? | 1 |
| Does `clear()` free memory? | No; capacity stays |
| `std::remove` changes size? | No; erase the tail or use `std::erase` (C++20) |
| `vector<bool>`? | Bit-packed, proxy references, no `data()`, not a real container |
| Need stable addresses? | Indices, `deque`, or `vector<unique_ptr<T>>` |

#### Iterators and Invalidation Rules
| Question | Answer |
|---|---|
| What can you do with an invalid iterator? | Assign to it or destroy it; nothing else (even `==` is UB) |
| vector push_back, no reallocation: what dies? | Only `end()` |
| vector insert, no reallocation: what dies? | Everything at or after the insertion point |
| deque push_back: refs? iterators? | Refs and pointers valid; all iterators invalid |
| deque pop_front: what dies? | Only the erased element |
| list / map erase: what dies? | Only the erased element |
| unordered rehash: what dies? | Iterators; refs and pointers survive |
| Why `it != end()` and not `it < end()`? | `<` exists only for random access; `!=` works for every category |
| `std::advance` on a list? | O(n); `it + n` does not compile |
| `const iterator` vs `const_iterator`? | Fixed position vs read-only element |
| `rit.base()`? | Points one past `*rit` in forward order |
| Does swap invalidate? | No (except string, array values, and `end()`); iterators follow the elements |
| Range-for and push_back? | UB: hidden `begin`/`end` are cached |

#### deque, list, forward_list, array and Adaptors
| Question | Answer |
|---|---|
| Is deque contiguous? | No: blocks plus a map; each block is contiguous |
| Why is `d[i]` O(1)? | Fixed block size: index math is division and modulo |
| deque push_back: refs? iterators? | Refs valid; iterators invalid |
| Empty deque cost? | libstdc++: 80 bytes plus two allocations |
| `list::insert(it, x)`? | Inserts before `it`; `it` still points to the same element |
| `list::size()`? | O(1) since C++11 |
| Sort a list? | `l.sort()`; `std::sort` needs random access |
| splice cost? | O(1), except a range from another list: O(range) |
| forward_list size? | No `size()`; use `std::distance` (O(n)) |
| `std::array<int, 3> a;` values? | Indeterminate; use `a{}` |
| Min-heap? | `std::priority_queue<T, std::vector<T>, std::greater<T>>` |
| Why does `pop()` return void? | Returning by value could throw after removal and lose the element |
| list vs vector for inserts? | vector usually wins for small/medium N: memmove beats pointer chasing |

#### std::map and std::set
| Question | Answer |
|---|---|
| How is std::map implemented? | Red-black tree in practice; standard mandates O(log n) and stable iterators |
| `m[k]` on a missing key? | Inserts `V{}` and returns a reference to it |
| How does set detect duplicates? | Equivalence: `!comp(a,b) && !comp(b,a)`, never `==` |
| `<=` as comparator? | UB: duplicates inserted, lookups fail, `std::sort` can overflow |
| `lower_bound` vs `upper_bound`? | First not before `k` vs first after `k` (per comparator) |
| Greatest key `<= k`? | `upper_bound(k)`, then step back if not `begin()` |
| `emplace` vs `try_emplace`? | try_emplace never consumes args when the key exists |
| Lookup `std::string` keys by `string_view`? | Use `std::less<>` (transparent comparator) |
| Change a key? | `extract` node handle, edit `key()`, re-insert |
| map erase invalidates? | Only the erased element |
| Why can a small vector beat a map? | Contiguous memory, no pointer chasing, no per-node allocation |
| map vs unordered_map? | Need order, ranges, or stable worst case: map; pure point lookups: unordered |

#### Unordered Containers and Hashing
| Question | Answer |
|---|---|
| How is `unordered_map` built? | Buckets of chained nodes; one allocation per element |
| Lookup complexity? | Average O(1), worst O(n) |
| When does it rehash? | Before the insert that would exceed `max_load_factor` |
| `reserve` vs `rehash`? | Elements vs buckets |
| What does rehash invalidate? | Iterators only; references and pointers survive |
| What does erase invalidate? | Only the erased element |
| Custom key needs? | Hash + equality, consistent with each other |
| Why is `h1 ^ (h2 << 1)` bad? | Nearly symmetric, small range, many collisions |
| Avoid a temporary string in `find`? | Transparent hash + `equal_to<>` (C++20) |
| Change a key? | `extract`, modify `key()`, `insert` |
| Faster alternative? | Flat open-addressing map, sorted vector, or direct array |
| `map` instead? | Need ordering, ranges, or a hard O(log n) bound |

#### Templates: Deduction, Specialization and Variadics
| Question | Answer |
|---|---|
| `add(10, 20.5)` with `T add(T, T)`? | Deduction conflict, no match; `add<double>` works |
| `f(T)` with `const int`? | `T = int` |
| `f(T&)` with `const int`? | `T = const int` |
| Specialize or overload a function template? | Overload |
| Partial specialization of a function? | Not allowed |
| Which wins, `f(T)` or `f(T*)` for `int*`? | `f(T*)`, more specialized |
| Why `typename`? | Dependent name is assumed to be a value |
| Why `this->` in a template derived class? | Dependent base members are not found otherwise |
| Why are templates in headers? | Definition needed at instantiation |
| `(a - ...)` on 10,3,2? | 9; `(... - a)` gives 5 |
| CRTP vs virtual? | Compile-time type, no vptr; no heterogeneous containers |
| Deducing this? | C++23 `this auto& self`: CRTP without the template base |

#### SFINAE, Type Traits and Concepts
| Question | Answer |
|---|---|
| What is SFINAE? | Invalid substitution in the signature removes the overload instead of erroring |
| Does a body error count? | No, hard error |
| enable_if overload vs generic `T` for `int`? | Ambiguous |
| Concept-constrained vs unconstrained? | Constrained wins |
| Why `enable_if_t<C, int> = 0`? | Conditions become part of the signature: no redefinition |
| `if constexpr` in a non-template? | Both branches are checked |
| `static_assert(false)` in a discarded branch? | OK since P2593 (GCC 13+); use a dependent false before |
| `requires { sizeof(T) > 4; }`? | Always true if it compiles; use `requires (sizeof(T) > 4)` |
| What decides subsumption? | Atomic constraints identical by source: use named concepts |
| `declval`? | Fake object in unevaluated context |
| Tag dispatch? | Overload on a tag type; inheritance ranks the tags |

#### constexpr, consteval and Compile-Time Programming
| Question | Answer |
|---|---|
| Is a constexpr function evaluated at compile time? | Only when called in a context that requires a constant |
| constexpr vs consteval? | May vs must run at compile time |
| constexpr vs constinit? | constinit only requires constant initialization; variable stays mutable |
| Why can't I use a parameter as an array size? | Parameters are never constant expressions |
| `if constexpr (std::is_constant_evaluated())`? | Always true |
| How to call consteval from constexpr? | C++23 `if consteval` |
| What happens to UB at compile time? | Compile error: constant evaluation must diagnose it |
| constexpr std::vector global? | Not allowed: allocation must be freed inside the evaluation |
| static constexpr member needs a definition? | C++14 if odr-used; not since C++17 (implicitly inline) |
| Cost of heavy constexpr? | Longer builds, bigger binaries, evaluator limits |
| Use in low-latency code? | Precompute tables and constants; assert layouts at build time |
