## TOPIC: Unordered Containers and Hashing

### PRACTICE_TASKS: Output Prediction and Bug Hunting

#### Q1
```cpp
// Q: What does this print on GCC / libstdc++? Is the order guaranteed?
#include <iostream>
#include <unordered_map>

int main() {
    std::unordered_map<int, int> m;
    for (int i = 0; i < 5; ++i) m[i * 10] = i;

    for (const auto& [k, v] : m) std::cout << k << ' ';
    std::cout << '\n';

    m.rehash(1000);
    for (const auto& [k, v] : m) std::cout << k << ' ';
    std::cout << '\n';
}
```

**Answer:**
```
40 30 20 10 0
0 10 20 30 40
(libstdc++ / GCC, x86-64; the order is unspecified by the standard)
```

**Explanation:**
- libstdc++ keeps all nodes on one list and inserts a key whose bucket is empty at the front of that list, so with 13 buckets the five keys come out newest first.
- After `rehash(1000)` the nodes are relinked bucket by bucket; with identity hashing and more buckets than keys, the new order happens to be ascending.
- Another standard library, or another version, may print something else. Neither order is guaranteed and both change on any rehash.
- **Key Concept:** Unordered iteration order is unspecified and changes after a rehash; never depend on it in output or tests.

---

#### Q2
```cpp
// Q: Does this compile? If not, what is the error and the minimal fix?
#include <iostream>
#include <string>
#include <unordered_map>

struct Point {
    int x, y;
    bool operator==(const Point&) const = default;
};

int main() {
    std::unordered_map<Point, std::string> labels;
    labels[{1, 2}] = "a";
    std::cout << labels.size() << '\n';
}
```

**Answer:**
```
Compile error: use of deleted function
'std::unordered_map<Point, std::__cxx11::basic_string<char> >::unordered_map()'
(note: std::hash<Point> is not specialized, its default constructor is deleted)
```

**Explanation:**
- `std::hash<Point>` has no specialization, so it is a "disabled" hash: not default-constructible, not callable.
- The map's default constructor needs to construct a `std::hash<Point>`, so it is deleted; that is the first error you see, not "no hash function".
- `operator==` is already present, so only the hash is missing.
- **Key Concept:** Unordered keys need a hash and an equality; `std::map` would need `operator<` instead.

**Fixed Version:**
```cpp
#include <cstddef>
#include <functional>
#include <iostream>
#include <string>
#include <unordered_map>

struct Point {
    int x, y;
    bool operator==(const Point&) const = default;
};

template <>
struct std::hash<Point> {
    std::size_t operator()(const Point& p) const noexcept {
        std::size_t seed = std::hash<int>{}(p.x);
        seed ^= std::hash<int>{}(p.y) + 0x9e3779b97f4a7c15ULL + (seed << 6) + (seed >> 2);
        return seed;
    }
};

int main() {
    std::unordered_map<Point, std::string> labels;
    labels[{1, 2}] = "a";
    std::cout << labels.size() << '\n';   // 1
}
```

---

#### Q3
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

---

#### Q4
```cpp
// Q: What does this print?
#include <iostream>
#include <string>
#include <unordered_map>

int main() {
    std::unordered_map<std::string, int> stock{{"apple", 3}};
    const char* wanted[] = {"apple", "pear", "plum", "apple"};

    int missing = 0;
    for (const char* w : wanted)
        if (stock[w] == 0) ++missing;

    std::cout << missing << ' ' << stock.size() << '\n';
}
```

**Answer:**
```
2 3
```

**Explanation:**
- `stock[w]` inserts `w` with value 0 when it is absent. "pear" and "plum" are inserted, so the size grows from 1 to 3.
- A read-only check turned into two inserts. In a long-running service this is an unbounded memory leak keyed by user input.
- Use `contains`, `find` or `count`; for a const map `operator[]` would not even compile.
- **Key Concept:** `operator[]` means "find or insert default", never "just look".

**Fixed Version:**
```cpp
#include <iostream>
#include <string>
#include <unordered_map>

int main() {
    std::unordered_map<std::string, int> stock{{"apple", 3}};
    const char* wanted[] = {"apple", "pear", "plum", "apple"};

    int missing = 0;
    for (const char* w : wanted) {
        auto it = stock.find(w);
        if (it == stock.end() || it->second == 0) ++missing;
    }
    std::cout << missing << ' ' << stock.size() << '\n';   // 2 1
}
```

---

#### Q5
```cpp
// Q: What does this print?
#include <cmath>
#include <iostream>
#include <unordered_set>

int main() {
    std::unordered_set<double> prices;
    prices.insert(NAN);
    prices.insert(NAN);
    prices.insert(0.0);
    prices.insert(-0.0);
    prices.insert(1.5);

    std::cout << prices.size() << ' ' << prices.count(NAN) << ' '
              << prices.count(-0.0) << '\n';
}
```

**Answer:**
```
4 0 1
```

**Explanation:**
- `NaN == NaN` is false, so each NaN is a brand-new key: two NaN elements are stored, and `count(NAN)` can never find either of them.
- `0.0 == -0.0` is true, so `-0.0` is a duplicate of `0.0`. `std::hash<double>` is required to keep the contract, and libstdc++ hashes both zeros to 0.
- Elements: NaN, NaN, 0.0, 1.5.
- **Key Concept:** Equality must be an equivalence relation; NaN breaks reflexivity, which breaks the container. Avoid floating-point keys (use integer ticks).

---

#### Q6
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

#### Q7
```cpp
// Q: For every id, also register a "shadow" id (id + 1000). The loop only
//    inserts, it never erases. Is it correct? What does it print?
#include <iostream>
#include <unordered_map>

int main() {
    std::unordered_map<int, int> ids;
    for (int i = 1; i <= 13; ++i) ids[i] = i;     // libstdc++: 13 buckets, now full
    int& first = ids.at(1);

    for (auto it = ids.begin(); it != ids.end(); ++it)
        if (it->first < 1000)
            ids.emplace(it->first + 1000, it->second);

    std::cout << ids.size() << ' ' << first << '\n';
}
```

**Answer:**
```
Undefined behaviour: the first emplace rehashes (13 -> 29 buckets on libstdc++),
which invalidates it. The reference first stays valid.
GCC 11, -O0 and with -fsanitize=address,undefined: prints "14 1" (only one shadow
id was added instead of 13) and ASan reports nothing.
-D_GLIBCXX_DEBUG: aborts with "attempt to increment a singular iterator".
```

**Explanation:**
- With `max_load_factor()` 1.0 and 13 elements in 13 buckets (libstdc++ bucket counts), adding a 14th element exceeds the limit, so `emplace` rehashes. A rehash invalidates **all** iterators, including the loop's `it`.
- References and pointers survive: nodes are relinked, not moved. That is why `first` still prints 1 (Q3 shows the same split with `reserve`).
- Why ASan is silent: no memory was freed except the old bucket array, and the iterator holds a pointer to a live node. Why only one shadow: libstdc++ keeps all nodes in one singly linked list; the rehash rebuilt that list, the node `it` pointed to (key 13, visited first) ended up last, and `++it` reached `end()` immediately. The result is quietly wrong data, not a crash.
- Debug mode compares the bucket count before and after each insert and marks every iterator singular when it changes, so it catches what ASan cannot.
- `ids.reserve(2 * ids.size())` before the loop makes it well defined (no rehash, an insert without rehash invalidates nothing) and prints `26 1`; whether the loop also visits the new keys is unspecified, so the `< 1000` guard is still needed.
- **Key Concept:** In an unordered container, inserting can rehash and kill every iterator while every reference stays valid; ASan sees nothing, debug mode does. Reserve first, or collect and insert after the loop.

**Fixed Version:**
```cpp
#include <iostream>
#include <unordered_map>
#include <utility>
#include <vector>

int main() {
    std::unordered_map<int, int> ids;
    for (int i = 1; i <= 13; ++i) ids[i] = i;

    std::vector<std::pair<int, int>> shadows;      // phase 1: read only
    shadows.reserve(ids.size());
    for (const auto& [id, v] : ids) shadows.emplace_back(id + 1000, v);
    ids.insert(shadows.begin(), shadows.end());    // phase 2: modify

    std::cout << ids.size() << '\n';               // 26
}
```

---

#### Q8
```cpp
// Q: Does this compile? The key 7 is inserted before it is read.
#include <iostream>
#include <string>
#include <unordered_map>

struct Order {
    explicit Order(int q) : qty(q) {}
    int qty;
};

int main() {
    std::unordered_map<int, Order> book;
    book.emplace(7, Order{100});
    std::cout << book[7].qty << '\n';
}
```

**Answer:**
```
Compile error: no matching function for call to 'Order::Order()'
(from std::pair's piecewise constructor, instantiated by unordered_map::operator[])
```

**Explanation:**
- `operator[]` must be able to insert a value-initialized `Order` for a missing key. That code path is instantiated whatever the runtime key is, and `Order` has no default constructor.
- Runtime knowledge ("7 is already there") does not matter to the compiler.
- Use `at(7)` (throws if missing) or `find`; insert with `try_emplace(7, 100)`.
- **Key Concept:** `operator[]` requires a default-constructible mapped type; `at`, `find`, `try_emplace` and `insert_or_assign` do not.

**Fixed Version:**
```cpp
#include <iostream>
#include <unordered_map>

struct Order {
    explicit Order(int q) : qty(q) {}
    int qty;
};

int main() {
    std::unordered_map<int, Order> book;
    book.try_emplace(7, 100);              // constructs Order(100) in place
    std::cout << book.at(7).qty << '\n';   // 100
}
```

---

#### Q9
```cpp
// Q: Find the bug. Is the result reliable?
#include <iostream>
#include <unordered_map>

int main() {
    std::unordered_map<int, int> next_id{{1, 2}, {2, 3}};

    for (const auto& [k, v] : next_id)
        if (!next_id.contains(v)) next_id[v] = v + 1;   // add the missing successor

    std::cout << next_id.size() << '\n';
}
```

**Answer:**
```
Undefined behaviour in general: inserting during a range-for can rehash and
invalidate the loop's hidden iterator. Whether new elements are visited is also
unspecified, so the size is not reliable (libstdc++ printed 3 here: no rehash, and
the new key 3 was inserted at a position the loop had already passed).
```

**Explanation:**
- The range-for holds `begin()`/`end()` iterators. Any insert that triggers a rehash invalidates them; on large maps this crashes or skips elements.
- Even without a rehash, a newly inserted element may land before or after the current position, so it may or may not be processed.
- Fix: collect the new keys in a separate vector, insert after the loop (and `reserve` first if the size is known).
- **Key Concept:** Do not insert into an unordered container while iterating over it.

**Fixed Version:**
```cpp
#include <iostream>
#include <unordered_map>
#include <vector>

int main() {
    std::unordered_map<int, int> next_id{{1, 2}, {2, 3}};

    std::vector<int> to_add;
    for (const auto& [k, v] : next_id)
        if (!next_id.contains(v)) to_add.push_back(v);
    for (int k : to_add) next_id.try_emplace(k, k + 1);

    std::cout << next_id.size() << '\n';   // 3
}
```

---

#### Q10
```cpp
// Q: What does this print?
#include <iostream>
#include <string>
#include <unordered_map>

int main() {
    std::unordered_map<std::string, int> a, b;
    for (int i = 0; i < 100; ++i) a[std::to_string(i)] = i;
    for (int i = 99; i >= 0; --i) b[std::to_string(i)] = i;
    b.rehash(4096);

    bool same_first = a.begin()->first == b.begin()->first;
    std::cout << std::boolalpha << (a == b) << ' ' << same_first << ' '
              << (a.bucket_count() == b.bucket_count()) << '\n';
}
```

**Answer:**
```
true false false
(the second and third values are libstdc++ / GCC, x86-64 results; only "true" is guaranteed)
```

**Explanation:**
- `operator==` compares unordered containers as sets of key/value pairs: insertion order and bucket count are irrelevant.
- The iteration order of the two maps differs (different history, different bucket counts), so their first elements are different keys.
- `b` was rehashed to at least 4096 buckets; `a` grew naturally to a much smaller prime.
- **Key Concept:** Unordered equality is content-based; iteration order is not part of a container's value.

---

#### Q11
```cpp
// Q: The lookup is case-insensitive by design. Why does find usually fail?
#include <algorithm>
#include <cctype>
#include <iostream>
#include <string>
#include <unordered_set>

struct CaseInsensitiveEq {
    bool operator()(const std::string& a, const std::string& b) const {
        return std::equal(a.begin(), a.end(), b.begin(), b.end(), [](char x, char y) {
            return std::tolower(static_cast<unsigned char>(x)) ==
                   std::tolower(static_cast<unsigned char>(y));
        });
    }
};

int main() {
    std::unordered_set<std::string, std::hash<std::string>, CaseInsensitiveEq> symbols;
    for (int i = 0; i < 30; ++i) symbols.insert("sym" + std::to_string(i));
    symbols.insert("abcd");
    std::cout << symbols.count("ABCD") << ' ' << symbols.count("abcd") << '\n';
}
```

**Answer:**
```
0 1
(GCC 11, 13 and 14 / libstdc++; it can print 1 1 if "ABCD" happens to land in the same bucket)
```

**Explanation:**
- The equality says `"ABCD" == "abcd"`, but `std::hash<std::string>` hashes the raw bytes, so the two get different hashes and usually different buckets.
- That violates the contract (`a == b` implies `hash(a) == hash(b)`); the equality is never even called for the right element.
- The 30 extra symbols matter: since GCC 12, libstdc++ searches a table with at most 20 elements (for non-"fast" hashes such as `std::string`) by a linear scan using only the equality. With just `"abcd"` inserted, GCC 13/14 print `1 1` and GCC 11 prints `0 1`: the bug hides in small tests and appears in production-sized tables.
- Violating the hash/equality requirement is a precondition violation of the container, so no result is guaranteed.
- Fix: hash the same normalized form the equality compares (lowercase each character while hashing).
- **Key Concept:** Hash and equality must agree: hash exactly what equality compares, in the same way.

**Fixed Version:**
```cpp
#include <algorithm>
#include <cctype>
#include <iostream>
#include <string>
#include <unordered_set>

struct CaseInsensitiveEq {
    bool operator()(const std::string& a, const std::string& b) const {
        return std::equal(a.begin(), a.end(), b.begin(), b.end(), [](char x, char y) {
            return std::tolower(static_cast<unsigned char>(x)) ==
                   std::tolower(static_cast<unsigned char>(y));
        });
    }
};

struct CaseInsensitiveHash {
    std::size_t operator()(const std::string& s) const {
        std::string low(s.size(), '\0');
        std::transform(s.begin(), s.end(), low.begin(), [](unsigned char c) {
            return static_cast<char>(std::tolower(c));
        });
        return std::hash<std::string>{}(low);
    }
};

int main() {
    std::unordered_set<std::string, CaseInsensitiveHash, CaseInsensitiveEq> symbols;
    for (int i = 0; i < 30; ++i) symbols.insert("sym" + std::to_string(i));
    symbols.insert("abcd");
    std::cout << symbols.count("ABCD") << ' ' << symbols.count("abcd") << '\n';   // 1 1
}
```

---

#### Q12
```cpp
// Q: Does this compile with -std=c++20?
#include <iostream>
#include <string>
#include <string_view>
#include <unordered_map>

int main() {
    std::unordered_map<std::string, int> limits{{"max_qty", 500}};
    std::string_view field = "max_qty";
    auto it = limits.find(field);
    std::cout << (it != limits.end()) << '\n';
}
```

**Answer:**
```
Compile error: no matching function for call to
'std::unordered_map<std::__cxx11::basic_string<char>, int>::find(std::string_view&)'
```

**Explanation:**
- Without heterogeneous lookup, `find` takes `const key_type&`. `std::string_view` to `std::string` is an **explicit** conversion, so no overload matches.
- The C++20 template `find(const K&)` overload is enabled only when both the hash and the key equality are transparent (`is_transparent`). The default `std::hash<std::string>` and `std::equal_to<std::string>` are not.
- `limits.find(std::string(field))` compiles but allocates a temporary for long keys.
- **Key Concept:** Heterogeneous lookup needs a transparent hash **and** `std::equal_to<>`.

**Fixed Version:**
```cpp
#include <functional>
#include <iostream>
#include <string>
#include <string_view>
#include <unordered_map>

struct StringHash {
    using is_transparent = void;
    std::size_t operator()(std::string_view s) const noexcept {
        return std::hash<std::string_view>{}(s);
    }
};

int main() {
    std::unordered_map<std::string, int, StringHash, std::equal_to<>> limits{
        {"max_qty", 500}};
    std::string_view field = "max_qty";
    auto it = limits.find(field);              // no temporary std::string
    std::cout << (it != limits.end()) << '\n';   // 1
}
```

---
