## TOPIC: std::map and std::set

### PRACTICE_TASKS: Output Prediction and Bug Hunting

#### Q1
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

---

#### Q2
```cpp
// Q: What does this print?
#include <iostream>
#include <map>
#include <string>

int main() {
    std::map<std::string, int> m;
    m.insert({"a", 1});
    m.insert({"a", 2});
    m["b"];
    m.emplace("b", 5);
    m.insert_or_assign("a", 3);
    for (const auto& [k, v] : m) std::cout << k << v << ' ';
    std::cout << '\n';
}
```

**Answer:**
```
a3 b0 
```

**Explanation:**
- The second `insert` finds "a" and does nothing (returns `{it, false}`); `insert` never overwrites.
- `m["b"]` inserts `{"b", 0}`; the following `emplace("b", 5)` finds the key and does nothing.
- `insert_or_assign` overwrites: "a" becomes 3.
- **Key Concept:** `insert`/`emplace`/`try_emplace` only add; `insert_or_assign` and `operator[]` assignment overwrite.

---

#### Q3
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

#### Q4
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

#### Q5
```cpp
// Q: Is this well defined? What does it print?
#include <iostream>
#include <map>
#include <string>

int main() {
    std::map<std::string, int> m{{"limit", 42}};
    const int* p = nullptr;
    for (const std::pair<std::string, int>& e : m)
        p = &e.second;
    std::cout << *p << '\n';
}
```

**Answer:**
```
Undefined behaviour: p dangles. With -fsanitize=address it reports "stack-use-after-scope".
GCC also warns: loop variable 'e' ... binds to a temporary constructed from type 'std::pair<const std::__cxx11::basic_string<char>, int>' [-Wrange-loop-construct]
```

**Explanation:**
- The element type is `std::pair<const std::string, int>`. A `const std::pair<std::string, int>&` cannot bind to it directly, so each iteration builds a converted temporary pair (copying the string) and binds `e` to that.
- `p` points into the temporary, which is destroyed at the end of each iteration.
- Without ASan it may print 42 by luck: the dead temporary's stack slot still holds the bytes.
- **Key Concept:** Iterate maps with `const auto&` (or `const auto& [k, v]`); the real element type has a `const` key.

**Fixed Version:**
```cpp
#include <iostream>
#include <map>
#include <string>

int main() {
    std::map<std::string, int> m{{"limit", 42}};
    const int* p = nullptr;
    for (const auto& [key, value] : m)
        p = &value;                    // points into the map node itself
    std::cout << *p << '\n';           // 42
}
```

---

#### Q6
```cpp
// Q: Does this compile?
#include <iostream>
#include <set>

struct ById {
    bool operator()(int a, int b) { return a < b; }
};

int main() {
    std::set<int, ById> ids{3, 1, 2};
    std::cout << *ids.begin() << '\n';
}
```

**Answer:**
```
Does not compile (GCC 11 and GCC 14 report this single error):
error: static assertion failed: comparison object must be invocable as const
```

**Explanation:**
- The tree calls the stored comparator through `const` member functions, so `operator()` must be `const`.
- libstdc++ checks this with a `static_assert` as soon as the comparator is used.
- Fix: `bool operator()(int a, int b) const { return a < b; }`. Prefer stateless comparators; a comparator whose result changes over time corrupts the tree.
- **Key Concept:** Comparators are called as `const` function objects.

---

#### Q7
```cpp
// Q: What does this print?
#include <algorithm>
#include <cctype>
#include <iostream>
#include <set>
#include <string>

struct CaseInsensitiveLess {
    bool operator()(const std::string& a, const std::string& b) const {
        return std::lexicographical_compare(
            a.begin(), a.end(), b.begin(), b.end(), [](unsigned char x, unsigned char y) {
                return std::tolower(x) < std::tolower(y);
            });
    }
};

int main() {
    std::set<std::string, CaseInsensitiveLess> s;
    s.insert("Order");
    s.insert("order");
    s.insert("ORDER");
    std::cout << s.size() << ' ' << *s.begin() << ' ' << s.count("oRdEr") << '\n';
}
```

**Answer:**
```
1 Order 1
```

**Explanation:**
- The set uses equivalence: `!comp(a, b) && !comp(b, a)`. Under this comparator all three spellings are equivalent.
- The first inserted spelling, "Order", stays; later inserts find an equivalent key and do nothing.
- `count("oRdEr")` finds it, although `"oRdEr" == "Order"` is false.
- **Key Concept:** Ordered containers decide identity with the comparator, never with `operator==`.

---

#### Q8
```cpp
// Q: Does this compile?
#include <iostream>
#include <set>

int main() {
    std::set<int> s{1, 2, 3};
    *s.begin() = 10;
    std::cout << *s.begin() << '\n';
}
```

**Answer:**
```
Does not compile:
error: assignment of read-only location 's.std::set<int>::begin().std::_Rb_tree_const_iterator<int>::operator*()'
```

**Explanation:**
- `set::iterator` and `set::const_iterator` both give `const` access: changing an element could break the tree order (10 would be at the front of a sorted set).
- Map keys are `const` for the same reason; map **values** can be modified.
- To change an element: `auto nh = s.extract(s.begin()); nh.value() = 10; s.insert(std::move(nh));` (C++17), or erase and insert.
- **Key Concept:** Elements of a set and keys of a map are immutable while in the container.

---

#### Q9
```cpp
// Q: Removes expired sessions. Find the bug.
#include <iostream>
#include <map>
#include <string>

int main() {
    std::map<int, std::string> sessions{{1, "expired"}, {2, "active"}, {3, "expired"}};
    for (auto it = sessions.begin(); it != sessions.end(); ++it) {
        if (it->second == "expired")
            sessions.erase(it);
    }
    std::cout << sessions.size() << '\n';
}
```

**Answer:**
```
Undefined behaviour: ++it on an erased node.
GCC 11, -O0: segmentation fault.
-fsanitize=address,undefined: prints 1, no report at all.
-D_GLIBCXX_DEBUG: "attempt to increment a singular iterator".
```

**Explanation:**
- Why ASan is silent although the node really was freed: `++it` on a map iterator calls `std::_Rb_tree_increment`, which lives in the prebuilt `libstdc++.so` (libstdc++ / GCC). That library is not compiled with `-fsanitize=address`, so the read of the freed node's links is never checked. ASan only instruments code that you compile.
- Debug mode does not depend on memory at all: it records that `erase` invalidated `it` and aborts on the next `++`. For node containers it is the reliable detector; ASan is the reliable one for vector reallocation (topic 06, which also has the general erase-while-iterating rule for every container).
- The mechanics: `erase(it)` destroys the node `it` points to, and the loop's `++it` then follows that freed node's parent/child pointers. Whether that crashes, skips elements or "works" depends on what the allocator did with the block.
- Fix: `it = sessions.erase(it);` with `++it` only in the else branch, or `std::erase_if(sessions, pred)` (C++20).
- **Key Concept:** A clean ASan run proves nothing for `std::map`/`std::set` iterator bugs, because the tree walk happens inside uninstrumented `libstdc++.so`; run such code under `-D_GLIBCXX_DEBUG`. The rule itself is general: map erase invalidates only the erased element, but that includes the iterator you are holding.

**Fixed Version:**
```cpp
#include <iostream>
#include <map>
#include <string>

int main() {
    std::map<int, std::string> sessions{{1, "expired"}, {2, "active"}, {3, "expired"}};
    auto removed = std::erase_if(sessions, [](const auto& kv) {
        return kv.second == "expired";
    });
    std::cout << removed << ' ' << sessions.size() << '\n';   // 2 1
}
```

---

#### Q10
```cpp
// Q: Two-field key with a hand-written comparator. What does this print?
#include <iostream>
#include <set>

struct Key { int venue; int id; };

struct KeyLess {
    bool operator()(const Key& a, const Key& b) const {
        return a.venue < b.venue || a.id < b.id;
    }
};

int main() {
    KeyLess less;
    Key a{1, 5}, b{2, 1};
    std::cout << less(a, b) << less(b, a) << '\n';
    std::set<Key, KeyLess> s{{2, 1}, {1, 5}, {3, 0}};
    std::cout << s.size() << ' ' << s.count({1, 5}) << '\n';
}
```

**Answer:**
```
First line: 11 (both a<b and b<a are true).
The set is undefined behaviour (the comparator is not a strict weak ordering). In practice (libstdc++) the second line printed "3 0": the key {1, 5} is in the set but cannot be found.
```

**Explanation:**
- `a.venue < b.venue || a.id < b.id` is not asymmetric: `{1, 5}` is "less" than `{2, 1}` (venue) and `{2, 1}` is "less" than `{1, 5}` (id).
- A tree built with such a comparator places elements inconsistently; lookups descend the wrong branch. In an ASan build (GCC 11) LeakSanitizer even reported one leaked 40-byte node at exit: the broken ordering left the tree structurally inconsistent.
- Correct lexicographic comparison: compare `id` only when the venues are equal.
- **Key Concept:** Use `std::tie(a.venue, a.id) < std::tie(b.venue, b.id)` or a defaulted `operator<=>` (C++20) instead of hand-rolled `||` chains.

**Fixed Version:**
```cpp
#include <compare>
#include <iostream>
#include <set>

struct Key {
    int venue;
    int id;
    auto operator<=>(const Key&) const = default;   // venue first, then id
};

int main() {
    std::set<Key> s{{2, 1}, {1, 5}, {3, 0}};
    std::cout << s.size() << ' ' << s.count({1, 5}) << '\n';   // 3 1
}
```

---

#### Q11
```cpp
// Q: Does this compile?
#include <iostream>
#include <map>
#include <string>
#include <string_view>

int main() {
    std::map<std::string, int> config{{"timeout_ms", 250}};
    std::string_view key = "timeout_ms";
    auto it = config.find(key);
    std::cout << it->second << '\n';
}
```

**Answer:**
```
Does not compile:
error: no matching function for call to 'std::map<std::__cxx11::basic_string<char>, int>::find(std::string_view&)'
```

**Explanation:**
- The default comparator is `std::less<std::string>`, so `find` takes `const std::string&`. The conversion from `std::string_view` to `std::string` is `explicit`, so it is not applied.
- `config.find(std::string(key))` compiles but builds a temporary string on every lookup.
- With a transparent comparator, `std::map<std::string, int, std::less<>>`, the template overload `find(const K&)` is enabled and compares `string_view` with the stored strings directly.
- **Key Concept:** Heterogeneous lookup (C++14) needs a transparent comparator such as `std::less<>`.

**Fixed Version:**
```cpp
#include <functional>
#include <iostream>
#include <map>
#include <string>
#include <string_view>

int main() {
    std::map<std::string, int, std::less<>> config{{"timeout_ms", 250}};
    std::string_view key = "timeout_ms";
    if (auto it = config.find(key); it != config.end())
        std::cout << it->second << '\n';     // 250
}
```
