## TOPIC: Top 50: Must-Know STL and Templates Interview Questions

### PRACTICE_TASKS: The Must-Know Code Puzzles

#### Q1
```cpp
// Q: What does this print on libstdc++? Is it well defined?
#include <iostream>
#include <string>

int main() {
    std::string s = "Hello";
    const char* p = s.c_str();
    s.reserve(100);
    std::cout << '[' << p << "]\n";
}
```

**Answer:**
```
UB. On libstdc++ / GCC, x86-64 it prints:
[d]
ASan reports nothing.
```

**Explanation:**
- `reserve` is a non-const member that is not exempt, so `p` is invalidated; printing it is UB.
- Why `d`: "Hello" was inline (SSO). `p` points into the string object's 16-byte local buffer. After `reserve(100)` the characters move to the heap and libstdc++ reuses those 16 bytes (a union) for the capacity field. 100 is `0x64`, ASCII `'d'`, followed by zero bytes.
- ASan is silent because `p` points into a live object: nothing was freed. With a 40-character string the old heap block is freed and ASan reports `heap-use-after-free`.
- **Key Concept:** Stale pointers into an SSO buffer are invisible to sanitizers; follow the rule, not the tool.
- Deep dive: Topic 1, std::string: SSO, Buffers and Pointer Validity

**Fixed Version:**
```cpp
#include <iostream>
#include <string>

int main() {
    std::string s = "Hello";
    s.reserve(100);
    const char* p = s.c_str();          // acquire after the last mutation
    std::cout << '[' << p << "]\n";     // [Hello]
}
```

---

#### Q2
```cpp
// Q: What does this print?
#include <iostream>
#include <string>

int main() {
    std::string text = "key=value";
    if (text.find("key")) std::cout << "A ";
    else                  std::cout << "B ";
    if (text.find("zzz")) std::cout << "C ";
    else                  std::cout << "D ";
    std::cout << (text.find("zzz") == std::string::npos) << '\n';
}
```

**Answer:**
```
B C 1
```

**Explanation:**
- `"key"` is found at position 0, which converts to `false`: prints `B`.
- `"zzz"` is not found: `find` returns `npos` (`size_t(-1)`), which is non-zero: prints `C`.
- The truth test is inverted for position 0 and wrong for "not found".
- **Key Concept:** Compare against `std::string::npos` (or use C++23 `contains`), never use `find` as a boolean.
- Deep dive: Topic 1, std::string: SSO, Buffers and Pointer Validity

---

#### Q3
```cpp
// Q: Find the bug.
#include <iostream>
#include <string>
#include <string_view>

int main() {
    std::string record = "instrument-identifier-0000000042:active";
    std::string_view name = record.substr(0, record.find(':'));
    std::cout << '[' << name << "]\n";
}
```

**Answer:**
```
Dangling view: UB. std::string::substr returns a temporary std::string, destroyed at the
end of the statement. ASan: heap-use-after-free (the 32-character substring is on the heap).
```

**Explanation:**
- `record.substr(...)` is `std::string::substr`: a new owning string, not a view of `record`.
- The view binds to that temporary; the conversion compiles silently.
- Short substrings sit in the temporary's SSO buffer on the stack and may print correctly; long ones fail visibly.
- **Key Concept:** Convert to a view first, then slice: `std::string_view(record).substr(...)`.
- Deep dive: Topic 2, std::string_view and std::span

**Fixed Version:**
```cpp
#include <iostream>
#include <string>
#include <string_view>

int main() {
    std::string record = "instrument-identifier-0000000042:active";
    std::string_view whole = record;
    std::string_view name = whole.substr(0, whole.find(':'));   // view of record
    std::cout << '[' << name << "]\n";
}
```

---

#### Q4
```cpp
// Q: Find the bug. The view is only used on the next line.
#include <iostream>
#include <string>
#include <string_view>

int main(int argc, char**) {
    std::string configured = "primary-feed-handler-with-a-long-name";
    bool use_default = argc > 5;
    std::string_view label = use_default ? "default" : configured;
    std::cout << label << '\n';
}
```

**Answer:**
```
Dangling view: UB, even though use_default is false.
ASan: heap-use-after-free when label is printed.
```

**Explanation:**
- The conditional operator needs one type for both branches: `const char[8]` and `std::string` give a `std::string` prvalue.
- So the expression produces a **temporary copy** of `configured`, the view binds to the copy, and the copy dies at the semicolon.
- The view never pointed at `configured`.
- **Key Concept:** Make both branches views (`"default"sv` and `std::string_view(configured)`) so the result type is `string_view`.
- Deep dive: Topic 2, std::string_view and std::span

**Fixed Version:**
```cpp
#include <iostream>
#include <string>
#include <string_view>

int main(int argc, char**) {
    using namespace std::literals;
    std::string configured = "primary-feed-handler-with-a-long-name";
    bool use_default = argc > 5;
    std::string_view label = use_default ? "default"sv : std::string_view(configured);
    std::cout << label << '\n';
}
```

---

#### Q5
```cpp
// Q: How many times is "fetch" printed?
#include <iostream>
#include <optional>
#include <string>

int fetches = 0;

std::string fetch() {
    ++fetches;
    std::cout << "fetch\n";
    return "fresh";
}

int main() {
    std::optional<std::string> cache = "cached";
    for (int i = 0; i < 3; ++i) {
        std::string v = cache.value_or(fetch());
        (void)v;
    }
    std::cout << "fetches=" << fetches << '\n';
}
```

**Answer:**
```
fetch
fetch
fetch
fetches=3
```

**Explanation:**
- `value_or` is an ordinary function: its argument `fetch()` is evaluated before the call, every time, even though `cache` is engaged and the result is discarded.
- Lazy fix: `cache ? *cache : fetch()`, or C++23 `*cache.or_else([] { return std::optional<std::string>(fetch()); })`.
- **Key Concept:** `value_or` is eager; use it only with cheap defaults.
- Deep dive: Topic 3, std::optional and std::expected

---

#### Q6
```cpp
// Q: The file does not exist. What does this print? (C++23, GCC 12+)
#include <expected>
#include <iostream>
#include <string>

std::expected<std::string, std::string> load_config(bool exists) {
    if (!exists) return "config file not found";
    return "port=9000";
}

int main() {
    auto cfg = load_config(false);
    if (cfg) std::cout << "loaded: " << *cfg << '\n';
    else     std::cout << "error: " << cfg.error() << '\n';
}
```

**Answer:**
```
loaded: config file not found
```

**Explanation:**
- A plain `return x;` in an expected-returning function always constructs the **value**. The error message became the config contents.
- Only `return std::unexpected("config file not found");` creates the error state.
- The trap exists whenever `E` is convertible to `T` (`expected<int, int>`, `expected<std::string, std::string>`). A dedicated error type (`enum class ConfigError`) makes the mistake a compile error instead.
- **Key Concept:** In `std::expected`, success is implicit and errors must be wrapped in `std::unexpected`.
- Deep dive: Topic 3, std::optional and std::expected

**Fixed Version:**
```cpp
#include <expected>
#include <iostream>
#include <string>

enum class ConfigError { NotFound, Malformed };

std::expected<std::string, ConfigError> load_config(bool exists) {
    if (!exists) return std::unexpected(ConfigError::NotFound);
    return "port=9000";
}

int main() {
    auto cfg = load_config(false);
    if (cfg) std::cout << "loaded: " << *cfg << '\n';
    else     std::cout << "error code: " << static_cast<int>(cfg.error()) << '\n';  // 0
}
```

---

#### Q7
```cpp
// Q: What does this print? Is anything wrong?
#include <iostream>
#include <string>
#include <variant>

template <class... Ts> struct overloaded : Ts... { using Ts::operator()...; };
template <class... Ts> overloaded(Ts...) -> overloaded<Ts...>;

using Field = std::variant<int, double, std::string>;

int main() {
    Field price = 101.75;
    std::visit(overloaded{
        [](int v) { std::cout << "int " << v << '\n'; },
        [](const std::string& s) { std::cout << "text " << s << '\n'; },
    }, price);
}
```

**Answer:**
```
int 101
```

**Explanation:**
- There is no `double` handler, but the visitor still compiles: overload resolution converts `double` to `int` and calls the `int` lambda, truncating 101.75 to 101.
- `std::visit` checks that the visitor is *callable* with every alternative, not that each alternative has its own handler.
- GCC 11 gives no warning at `-Wall -Wextra` (the conversion happens inside the library).
- Guard: add a template catch-all that fails at compile time, so only exact handlers are accepted.
- **Key Concept:** Exhaustiveness in `visit` is "callable with", and implicit conversions count.
- Deep dive: Topic 4, std::variant, std::visit and std::any

**Fixed Version:**
```cpp
#include <iostream>
#include <string>
#include <variant>

template <class... Ts> struct overloaded : Ts... { using Ts::operator()...; };
template <class... Ts> overloaded(Ts...) -> overloaded<Ts...>;

using Field = std::variant<int, double, std::string>;

int main() {
    Field price = 101.75;
    std::visit(overloaded{
        [](int v) { std::cout << "int " << v << '\n'; },
        [](double v) { std::cout << "double " << v << '\n'; },
        [](const std::string& s) { std::cout << "text " << s << '\n'; },
        [](const auto& x) { static_assert(sizeof(x) == 0, "unhandled alternative"); },
    }, price);                                         // double 101.75
}
```

---

#### Q8
```cpp
// Q: Is this well-defined? What may it print?
#include <iostream>
#include <string>
#include <variant>

int main() {
    std::variant<int, std::string> field = 42;
    int& qty = std::get<int>(field);

    field = std::string("pending-confirmation-from-venue");
    std::cout << qty << '\n';
}
```

**Answer:**
```
Undefined behaviour: qty refers to an int whose lifetime ended.
GCC 11, -O0: printed an arbitrary number (on libstdc++ those bytes now hold part of the string's data pointer),
different on each run. ASan reports nothing: no memory was freed.
```

**Explanation:**
- Assigning a `std::string` destroys the `int` alternative and constructs a string in the same storage. `qty` still points at those bytes, which now belong to the string object (its first member is the heap pointer).
- Reading prints garbage; writing through `qty` would corrupt the string's pointer and crash later in its destructor.
- ASan is silent because the bytes are valid stack memory: only the object changed.
- Assigning another `int` (`field = 7;`) would have kept `qty` valid: same alternative, assignment instead of destroy + construct.
- **Key Concept:** A reference into a variant is valid only while that alternative stays active; re-fetch after every possible alternative change.
- Deep dive: Topic 4, std::variant, std::visit and std::any

**Fixed Version:**
```cpp
#include <iostream>
#include <string>
#include <variant>

int main() {
    std::variant<int, std::string> field = 42;
    int qty = std::get<int>(field);                  // copy the value out

    field = std::string("pending-confirmation-from-venue");
    std::cout << qty << '\n';                        // 42
    if (auto* p = std::get_if<int>(&field)) std::cout << *p << '\n';   // not printed
}
```

---

#### Q9
```cpp
// Q: The debug print inside rotate() shows the right values. Why does main print nothing?
#include <iostream>
#include <vector>

std::vector<int> rotate(const std::vector<int>& in, int k) {
    std::vector<int> result;
    int n = static_cast<int>(in.size());
    result.reserve(n);
    for (int i = 0; i < n; ++i) {
        result[(i + k) % n] = in[i];
        std::cout << result[(i + k) % n] << ' ';
    }
    std::cout << "| ";
    return result;
}

int main() {
    std::vector<int> r = rotate({1, 2, 3, 4, 5}, 2);
    std::cout << "size " << r.size() << ':';
    for (int x : r) std::cout << ' ' << x;
    std::cout << '\n';
}
```

**Answer:**
```
1 2 3 4 5 | size 0:
UB: writes to elements that do not exist. ASan is silent;
-D_GLIBCXX_ASSERTIONS aborts on the first result[...] access.
```

**Explanation:**
- `reserve(n)` allocates room for `n` ints but creates no elements: `size()` stays 0.
- `result[i]` writes raw memory inside the block, and the debug print reads it back, so the loop "works".
- The returned vector has `begin == end`, so `main` sees an empty vector.
- **Key Concept:** Reserved slots are not elements; size the vector (`std::vector<int> result(n);`) before indexing.
- Deep dive: Topic 5, std::vector Internals

**Fixed Version:**
```cpp
#include <iostream>
#include <vector>

std::vector<int> rotate(const std::vector<int>& in, int k) {
    int n = static_cast<int>(in.size());
    std::vector<int> result(n);                 // n value-initialized elements
    for (int i = 0; i < n; ++i) result[(i + k) % n] = in[i];
    return result;
}

int main() {
    for (int x : rotate({1, 2, 3, 4, 5}, 2)) std::cout << x << ' ';   // 4 5 1 2 3
    std::cout << '\n';
}
```

---

#### Q10
```cpp
// Q: What does this print?
#include <iostream>
#include <vector>

int main() {
    std::vector<int> a(10);
    std::vector<int> b{10};
    std::vector<int> c(10, 5);
    std::vector<int> d{10, 5};
    std::vector<std::vector<int>> nested;
    nested.emplace_back(10);
    nested.push_back({10});
    std::cout << a.size() << ' ' << b.size() << ' ' << c.size() << ' ' << d.size()
              << ' ' << nested[0].size() << ' ' << nested[1].size() << '\n';
}
```

**Answer:**
```
10 1 10 2 10 1
```

**Explanation:**
- Parentheses select the size constructors: `(10)` ten zeros, `(10, 5)` ten fives.
- Braces select the `initializer_list` constructor when viable: `{10}` one element, `{10, 5}` two.
- `emplace_back(10)` direct-initializes a `std::vector<int>(10)`: ten zeros, through the explicit size constructor.
- `push_back({10})` copy-list-initializes the parameter: a one-element vector.
- **Key Concept:** Parentheses for counts, braces for values; `emplace_back` forwards to parentheses.
- Deep dive: Topic 5, std::vector Internals

---

#### Q11
```cpp
// Q: What does this print?
#include <algorithm>
#include <iostream>
#include <vector>

int main() {
    std::vector<int> v{1, 2, 3, 2, 5};
    auto it = std::remove(v.begin(), v.end(), 2);
    std::cout << v.size() << ' ' << (it - v.begin()) << " :";
    for (int x : v) std::cout << ' ' << x;
    std::cout << '\n';
}
```

**Answer:**
```
5 3 : 1 3 5 2 5
```
The last two values are unspecified by the standard; `2 5` is libstdc++ / GCC, x86-64.

**Explanation:**
- `std::remove` shifts the kept elements (`1, 3, 5`) to the front and returns the new logical end (index 3).
- It cannot change the size: algorithms see iterators, not the container.
- The tail elements are valid but unspecified (moved-from or untouched).
- Fix: `v.erase(it, v.end());` or C++20 `std::erase(v, 2);` (returns 2).
- **Key Concept:** `remove` reorders, `erase` shrinks.
- Deep dive: Topic 5, std::vector Internals

---

#### Q12
```cpp
// Q: The vector has spare capacity, so nothing reallocates. What does this print?
#include <iostream>
#include <vector>

int main() {
    std::vector<int> v{100, 200, 300, 400};
    v.reserve(10);
    auto it = v.begin() + 2;          // refers to 300
    v.insert(v.begin(), 50);
    std::cout << *it << '\n';
}
```

**Answer:**
```
Undefined behaviour: it is invalidated by the insert. In practice (libstdc++) it prints 200.
```

**Explanation:**
- Without reallocation, `insert` invalidates every iterator at or after the insertion point. `it` (index 2) is after `begin()`, so it is invalid.
- The buffer did not move, so the iterator still addresses slot 2, which now holds the old `v[1]` (200): the bug produces wrong data instead of a crash.
- ASan reports nothing (the memory is owned by the vector). `-D_GLIBCXX_DEBUG` aborts with "attempt to dereference a singular iterator".
- **Key Concept:** Validity is defined by the operation, not by whether the address is still mapped. Use the iterator returned by `insert` and recompute positions after it.
- Deep dive: Topic 6, Iterators and Invalidation Rules

**Fixed Version:**
```cpp
#include <iostream>
#include <vector>

int main() {
    std::vector<int> v{100, 200, 300, 400};
    std::size_t idx = 2;              // an index survives if you adjust it
    auto pos = v.insert(v.begin(), 50);
    if (pos - v.begin() <= static_cast<std::ptrdiff_t>(idx)) ++idx;
    std::cout << v[idx] << '\n';      // 300
}
```

---

#### Q13
```cpp
// Q: The intent is to remove all even numbers. Find the bug and predict the output.
#include <iostream>
#include <vector>

int main() {
    std::vector<int> v{2, 4, 5};
    for (auto it = v.begin(); it != v.end(); ++it) {
        if (*it % 2 == 0)
            v.erase(it);
    }
    for (int x : v) std::cout << x << ' ';
    std::cout << '\n';
}
```

**Answer:**
```
Undefined behaviour: after v.erase(it), the loop increments an invalidated iterator. In practice (libstdc++) it prints "4 5": the 4 survives.
```

**Explanation:**
- `erase` invalidates `it` and everything after it. The loop's `++it` then uses an invalid iterator.
- What actually happens in a release build: erasing 2 shifts 4 into slot 0, `++it` moves to slot 1 (now 5), so 4 is never examined.
- If the last element is even, the loop steps past `end()` and runs into memory beyond the elements.
- Debug mode aborts at the `++it`: "attempt to increment a singular iterator".
- **Key Concept:** Continue from the iterator `erase` returns, and advance only when you did not erase.
- Deep dive: Topic 6, Iterators and Invalidation Rules

**Fixed Version:**
```cpp
#include <iostream>
#include <vector>

int main() {
    std::vector<int> v{2, 4, 5};
    for (auto it = v.begin(); it != v.end(); ) {
        if (*it % 2 == 0) it = v.erase(it);
        else ++it;
    }
    // or simply: std::erase_if(v, [](int x) { return x % 2 == 0; });   // C++20
    for (int x : v) std::cout << x << ' ';
    std::cout << '\n';                // 5
}
```

---

#### Q14
```cpp
// Q: This version uses the return value of erase. What does it print? Is it correct?
#include <iostream>
#include <vector>

int main() {
    std::vector<int> v{1, 2, 2, 3};
    for (auto it = v.begin(); it != v.end(); ++it) {
        if (*it == 2)
            it = v.erase(it);
    }
    for (int x : v) std::cout << x << ' ';
    std::cout << '\n';
}
```

**Answer:**
```
1 2 3
```

**Explanation:**
- `it = v.erase(it)` already points at the next element (the second 2). The `for` loop's `++it` then skips it.
- No UB here, only a logic bug: every element right after an erased one is never checked.
- With input `{1, 3, 2}` the same loop is UB: erasing the last element returns `end()`, and `++it` steps past it.
- **Key Concept:** Double advance: when the loop header increments, the body must not also move the iterator. Remove `++it` from the header and put it in an `else`.
- Deep dive: Topic 6, Iterators and Invalidation Rules

---

#### Q15
```cpp
// Q: Does this compile?
#include <algorithm>
#include <iostream>
#include <list>

int main() {
    std::list<int> l{3, 1, 2};
    std::sort(l.begin(), l.end());
    for (int x : l) std::cout << x << ' ';
    std::cout << '\n';
}
```

**Answer:**
```
Does not compile. The essence of the GCC 11 error (inside std::sort):
error: no match for 'operator-' (operand types are 'std::_List_iterator<int>' and 'std::_List_iterator<int>')
```

**Explanation:**
- `std::sort` needs random access iterators (it computes `last - first` and jumps to midpoints). `list` iterators are bidirectional.
- `l.sort()` is the member merge sort: stable, O(n log n), relinks nodes, keeps all iterators valid.
- With `std::ranges::sort(l)` (C++20) the error message names the unsatisfied constraint (`random_access_range`) instead of failing deep inside the algorithm.
- **Key Concept:** The iterator category decides which algorithms are available; list compensates with member algorithms.
- Deep dive: Topic 7, deque, list, forward_list, array and Adaptors

**Fixed Version:**
```cpp
#include <iostream>
#include <list>

int main() {
    std::list<int> l{3, 1, 2};
    l.sort();
    for (int x : l) std::cout << x << ' ';
    std::cout << '\n';                    // 1 2 3
}
```

---

#### Q16
```cpp
// Q: What does this print?
#include <functional>
#include <iostream>
#include <queue>
#include <vector>

int main() {
    std::priority_queue<int> maxq;
    std::priority_queue<int, std::vector<int>, std::greater<int>> minq;
    for (int x : {5, 1, 4, 2}) {
        maxq.push(x);
        minq.push(x);
    }
    while (!maxq.empty()) { std::cout << maxq.top() << ' '; maxq.pop(); }
    std::cout << "| ";
    while (!minq.empty()) { std::cout << minq.top() << ' '; minq.pop(); }
    std::cout << '\n';
}
```

**Answer:**
```
5 4 2 1 | 1 2 4 5 
```

**Explanation:**
- The comparator means "lower priority than". With the default `std::less`, the largest value has the highest priority: max-heap.
- With `std::greater`, a larger value counts as lower priority, so the smallest comes out first: min-heap.
- `pop()` returns `void`; reading requires `top()` first.
- **Key Concept:** `std::greater` in a priority_queue gives a min-heap, the opposite of what the name suggests.
- Deep dive: Topic 7, deque, list, forward_list, array and Adaptors

---

#### Q17
```cpp
// Q: What does this print?
#include <iostream>
#include <map>
#include <string>

int main() {
    std::map<std::string, int> stock{{"apple", 3}};
    for (const char* name : {"apple", "pear", "plum"}) {
        if (stock[name] > 0)
            std::cout << name << ' ';
    }
    std::cout << stock.size() << '\n';
}
```

**Answer:**
```
apple 3
```

**Explanation:**
- `stock[name]` on a missing key inserts `{name, 0}`. The "read-only" check inserted "pear" and "plum".
- A later loop over `stock` would now report two products with zero stock that nobody added.
- Use `auto it = stock.find(name); if (it != stock.end() && it->second > 0)`, or `contains` plus `at`.
- **Key Concept:** `operator[]` is find-or-insert; never use it for a pure read.
- Deep dive: Topic 8, std::map and std::set

---

#### Q18
```cpp
// Q: Sorts orders by price, highest first. Find the bug.
#include <algorithm>
#include <iostream>
#include <vector>

struct Order { int id; int price; };

int main() {
    std::vector<Order> orders;
    for (int i = 0; i < 40; ++i) orders.push_back({i, 100});   // all at the same price
    std::sort(orders.begin(), orders.end(),
              [](const Order& a, const Order& b) { return a.price >= b.price; });
    std::cout << "sorted " << orders.size() << '\n';
}
```

**Answer:**
```
Undefined behaviour: >= is not a strict weak ordering.
With -fsanitize=address it stops with "heap-buffer-overflow" inside std::__unguarded_partition. Without ASan our run aborted with "free(): invalid size" (heap corruption); other runs may appear to work.
```

**Explanation:**
- `comp(a, a)` must be false. With `>=` it is true, so the partition loop, which uses the pivot as a sentinel, never stops at an equal element and scans past the end of the vector.
- The bug appears only when the data has equal keys (here 17 or more in libstdc++), so tests with distinct prices pass.
- `-D_GLIBCXX_DEBUG` catches it immediately: "comparison doesn't meet irreflexive requirements".
- **Key Concept:** Comparators must mean "strictly before": use `>` for descending order, never `>=`.
- Deep dive: Topic 8, std::map and std::set

**Fixed Version:**
```cpp
#include <algorithm>
#include <iostream>
#include <vector>

struct Order { int id; int price; };

int main() {
    std::vector<Order> orders;
    for (int i = 0; i < 40; ++i) orders.push_back({i, 100});
    std::stable_sort(orders.begin(), orders.end(),
                     [](const Order& a, const Order& b) { return a.price > b.price; });
    std::cout << "sorted " << orders.size() << ", first id " << orders[0].id << '\n';
}
```
- Output: `sorted 40, first id 0`. `stable_sort` also keeps equal-price orders in arrival order.

---

#### Q19
```cpp
// Q: price_at_or_below(k) should return the greatest key <= k. Find the bug.
#include <iostream>
#include <map>

std::map<int, char> levels{{10, 'a'}, {20, 'b'}, {30, 'c'}};

int price_at_or_below(int k) {
    auto it = levels.lower_bound(k);
    --it;
    return it->first;
}

int main() {
    std::cout << price_at_or_below(25) << ' ' << price_at_or_below(20) << '\n';
}
```

**Answer:**
```
20 10
```

**Explanation:**
- For 25, `lower_bound` returns 30 and stepping back gives 20: correct.
- For 20 (a key that exists), `lower_bound` returns 20 itself; stepping back gives 10: wrong.
- For any `k < 10`, `lower_bound` returns `begin()` and `--it` is UB.
- Correct recipe: `upper_bound(k)` (first key `> k`), then step back once if it is not `begin()`.
- **Key Concept:** lower_bound = first key not before k; upper_bound = first key after k. "Greatest key <= k" is `std::prev(upper_bound(k))`.
- Deep dive: Topic 8, std::map and std::set

**Fixed Version:**
```cpp
#include <iostream>
#include <iterator>
#include <map>
#include <optional>

std::map<int, char> levels{{10, 'a'}, {20, 'b'}, {30, 'c'}};

std::optional<int> price_at_or_below(int k) {
    auto it = levels.upper_bound(k);
    if (it == levels.begin()) return std::nullopt;   // nothing <= k
    return std::prev(it)->first;
}

int main() {
    std::cout << *price_at_or_below(25) << ' ' << *price_at_or_below(20) << ' '
              << price_at_or_below(5).has_value() << '\n';   // 20 20 0
}
```

---

#### Q20
```cpp
// Q: Which of the three output lines are well-defined?
#include <iostream>
#include <string>
#include <unordered_map>

int main() {
    std::unordered_map<int, std::string> m{{1, "one"}};
    std::string& ref = m[1];
    std::string* ptr = &m[1];
    auto it = m.find(1);

    m.reserve(1000);                     // forces a rehash

    std::cout << ref << '\n';            // line A
    std::cout << *ptr << '\n';           // line B
    std::cout << it->second << '\n';     // line C
}
```

**Answer:**
```
Lines A and B are well-defined and print "one".
Line C is undefined behaviour (the rehash invalidated `it`), even though
libstdc++ happens to print "one" as well and ASan reports nothing.
```

**Explanation:**
- `reserve(1000)` changes the bucket count (13 to 1031 on libstdc++), which is a rehash.
- A rehash relinks nodes into a new bucket array; the nodes themselves do not move, so references and pointers stay valid.
- All iterators, including `end()`, are invalidated by the standard. The "it still works" result is an implementation accident (the node is still alive), so no tool flags it.
- **Key Concept:** Rehash invalidates iterators, not references. Re-run `find` after anything that can rehash.
- Deep dive: Topic 9, Unordered Containers and Hashing

---

#### Q21
```cpp
// Q: What does this print, and why?
#include <cstring>
#include <iostream>
#include <unordered_map>

int main() {
    std::unordered_map<const char*, int> qty;
    qty["order"] = 5;

    char buf[16];
    std::strcpy(buf, "order");                 // same characters, e.g. read from a socket
    std::cout << qty.count(buf) << ' ' << qty.count("order") << '\n';
}
```

**Answer:**
```
0 1
(the second number is 1 on GCC because identical literals are merged; that is not guaranteed)
```

**Explanation:**
- The key type is a pointer. `std::hash<const char*>` hashes the address and `std::equal_to<const char*>` compares addresses; the characters are never looked at.
- `buf` has a different address, so the lookup misses even though the text matches.
- Whether two `"order"` literals share one address is unspecified; GCC merges them within a translation unit, which is why the second lookup succeeds here.
- **Key Concept:** Pointer keys mean identity, not content. Use `std::string` keys (with transparent lookup for views).
- Deep dive: Topic 9, Unordered Containers and Hashing

**Fixed Version:**
```cpp
#include <cstring>
#include <iostream>
#include <string>
#include <unordered_map>

int main() {
    std::unordered_map<std::string, int> qty;
    qty["order"] = 5;

    char buf[16];
    std::strcpy(buf, "order");
    std::cout << qty.count(buf) << ' ' << qty.count("order") << '\n';   // 1 1
}
```

---

#### Q22
```cpp
// Q: Does this compile? If not, what is the smallest change to the call that fixes it?
#include <iostream>

template <class T>
T add(T a, T b) { return a + b; }

int main() {
    std::cout << add(10, 20.5) << '\n';
}
```

**Answer:**
```
Compile error: no matching function for call to 'add(int, double)'
note: deduced conflicting types for parameter 'T' ('int' and 'double')
Fix: add<double>(10, 20.5), which prints 30.5
```

**Explanation:**
- `T` is deduced from each argument separately: `int` from `10`, `double` from `20.5`. The results must agree, and deduction never applies conversions.
- With an explicit template argument there is nothing to deduce, so `10` is converted to `10.0` as for any normal function call.
- Alternatives: `add(10.0, 20.5)`, or two template parameters with `auto` return type.
- **Key Concept:** All deductions of the same `T` must match exactly; conversions only happen after `T` is fixed.
- Deep dive: Topic 10, Templates: Deduction, Specialization and Variadics

---

#### Q23
```cpp
// Q: What does this print?
#include <iostream>
#include <vector>

int main() {
    std::vector<int> src{5, 6, 7, 8};
    std::vector a{src};
    std::vector b{src.begin(), src.end()};
    std::vector c(src.begin(), src.end());
    std::cout << a.size() << ' ' << b.size() << ' ' << c.size() << '\n';
}
```

**Answer:**
```
4 2 4
```

**Explanation:**
- `a{src}`: CTAD prefers the copy deduction candidate for a single argument of the same template, so `a` is a `vector<int>` copy.
- `b{src.begin(), src.end()}`: braces make the `initializer_list` constructor win, so `b` is a `vector<vector<int>::iterator>` holding two iterators.
- `c(src.begin(), src.end())`: parentheses select the iterator-pair constructor and its deduction guide: `vector<int>` with 4 elements.
- **Key Concept:** CTAD plus braces can deduce a container of iterators; use parentheses or spell out the element type.
- Deep dive: Topic 10, Templates: Deduction, Specialization and Variadics

---

#### Q24
```cpp
// Q: What does this print?
#include <iostream>

void handle(long)               { std::cout << "handle(long)\n"; }
template <class T> void handle(T) { std::cout << "handle(T)\n"; }
void handle(int)                { std::cout << "handle(int)\n"; }

int main() {
    short s = 1;
    handle(1);
    handle(1L);
    handle(s);
}
```

**Answer:**
```
handle(int)
handle(long)
handle(T)
```

**Explanation:**
- `handle(1)`: `handle(int)` and `handle<int>` are both exact matches; on a tie the non-template wins.
- `handle(1L)`: same tie with `handle(long)` and `handle<long>`: the non-template wins.
- `handle(s)`: `handle<short>` is an exact match, while `handle(int)` needs a promotion and `handle(long)` a conversion. The better match wins before "prefer non-template" is considered.
- **Key Concept:** The non-template preference is only a tie-breaker; a template's exact match beats a non-template that needs a promotion.
- Deep dive: Topic 10, Templates: Deduction, Specialization and Variadics

---

#### Q25
```cpp
// Q: Does this compile? If yes, what does it print?
#include <iostream>
#include <type_traits>

template <class T, std::enable_if_t<std::is_floating_point_v<T>, int> = 0>
void print(T v) { std::cout << "floating " << v << '\n'; }

template <class T>
void print(T v) { std::cout << "generic " << v << '\n'; }

int main() {
    print(7);
    print(2.5);
}
```

**Answer:**
```
Compile error: call of overloaded 'print(double)' is ambiguous
(print(7) alone would compile and print "generic 7")
```

**Explanation:**
- `print(7)`: the `enable_if` overload is removed by SFINAE (`int` is not floating point), only the generic one is viable.
- `print(2.5)`: both overloads are viable, both take a `double`. Partial ordering compares parameter types only, and the `enable_if` condition is not part of that comparison, so neither is more specialized.
- Fix: add `std::enable_if_t<!std::is_floating_point_v<T>, int> = 0` to the generic overload, or use `template <std::floating_point T>` (a constrained template beats an unconstrained one).
- **Key Concept:** SFINAE only removes candidates; it never makes one candidate better than another.
- Deep dive: Topic 11, SFINAE, Type Traits and Concepts

**Fixed Version:**
```cpp
#include <concepts>
#include <iostream>

template <std::floating_point T>
void print(T v) { std::cout << "floating " << v << '\n'; }

template <class T>
void print(T v) { std::cout << "generic " << v << '\n'; }

int main() {
    print(7);     // generic 7
    print(2.5);   // floating 2.5
}
```

---

#### Q26
```cpp
// Q: Only process<int> is ever used. Does this compile?
#include <iostream>
#include <type_traits>

template <class T>
void process(T v) {
    int counter = 0;
    if constexpr (std::is_integral_v<T>) {
        std::cout << "integral " << v << '\n';
    } else {
        std::cout << v.name() << counter.size() << '\n';
    }
}

int main() { process(5); }
```

**Answer:**
```
Compile error: request for member 'size' in 'counter', which is of non-class type 'int'
```

**Explanation:**
- `v.name()` depends on `T`, so in the discarded branch it is never instantiated: no error for it.
- `counter.size()` does not depend on `T`: `counter` is always an `int`. Non-dependent code is checked when the template is defined (phase 1), whether or not the branch is discarded.
- The discarded-branch rule means "not instantiated", not "not compiled".
- **Key Concept:** `if constexpr` only hides code that depends on the template parameters.
- Deep dive: Topic 11, SFINAE, Type Traits and Concepts

---

#### Q27
```cpp
// Q: What does this print (GCC 11, -O0 and -O2 give the same answer)?
#include <iostream>
#include <type_traits>

constexpr int sq(int x) {
    if (std::is_constant_evaluated()) return -1;   // marks a compile-time evaluation
    return x * x;
}

int main() {
    constexpr int a = sq(10);
    int b = sq(10);
    const int n = 10;
    int c = sq(n);
    static int d = sq(10);
    const int e = sq(10);
    std::cout << a << ' ' << b << ' ' << c << ' ' << d << ' ' << e << '\n';
}
```

**Answer:**
```
-1 100 100 -1 -1
```

**Explanation:**
- `a`: a `constexpr` variable requires a constant: compile time.
- `b`: a plain local `int`: ordinary run-time call, even though the argument is a literal. At `-O2` the optimizer may fold `10 * 10`, but folding does not change what `is_constant_evaluated()` returns.
- `c`: `n` is a constant, but `c` is a non-const local: run time again. A constant argument does not make the call constant-evaluated.
- `d`: a static local is constant-initialized if possible, and that attempt is a constant evaluation.
- `e`: a `const int` with a constant initializer is usable in constant expressions, so its initializer is constant-evaluated. (`const double` would print 100.)
- **Key Concept:** The context of the call decides compile vs run time, never the arguments alone.
- Deep dive: Topic 12, constexpr, consteval and Compile-Time Programming

---

#### Q28
```cpp
// Q: Does this build with -std=c++14 -O0? With -std=c++17?
#include <algorithm>
#include <iostream>

struct Limits {
    static constexpr int MaxQty = 100;
};

int main() {
    int requested = 5;
    std::cout << std::max(requested, Limits::MaxQty) << '\n';
}
```

**Answer:**
```
-std=c++14 -O0: link error: undefined reference to `Limits::MaxQty'
-std=c++17:     builds and prints 100
```

**Explanation:**
- `std::max` takes `const int&`. Binding a reference to `Limits::MaxQty` odr-uses it, which needs a definition with storage.
- In C++14 the in-class line is only a declaration; the definition `constexpr int Limits::MaxQty;` must appear in one .cpp file.
- In C++17 `static constexpr` data members are implicitly `inline`, so the in-class declaration is a definition.
- With `-O2` the C++14 build linked in this test: the optimizer inlined the value and removed the reference. The program is still wrong in C++14, the error just hides.
- **Key Concept:** static constexpr members are inline since C++17; before that, odr-use needs an out-of-class definition.
- Deep dive: Topic 12, constexpr, consteval and Compile-Time Programming

---
