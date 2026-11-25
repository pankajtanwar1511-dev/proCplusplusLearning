## TOPIC: std::vector Internals

### PRACTICE_TASKS: Output Prediction and Bug Hunting

#### Q1
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

#### Q2
```cpp
// Q: Copy the elements 30 and 40 to the front of the vector.
//    What does it print? Is it well defined?
#include <iostream>
#include <vector>

int main() {
    std::vector<int> v{10, 20, 30, 40, 50};
    v.reserve(10);                                     // no reallocation below
    v.insert(v.begin(), v.begin() + 2, v.begin() + 4);
    for (int x : v) std::cout << x << ' ';
    std::cout << '\n';
}
```

**Answer:**
```
Undefined behaviour: the range passed to insert must not point into the vector itself.
libstdc++ / GCC 11 and 13 print "10 20 10 20 30 40 50" (wrong values, no crash).
Without the reserve line the same code prints the intended "30 40 10 20 30 40 50".
-fsanitize=address: no report.  -D_GLIBCXX_DEBUG: "attempt to insert with an iterator
range [first, last) from this container".
```

**Explanation:**
- The standard's precondition for `insert(pos, first, last)` is that `first` and `last` are not iterators into the same container. C++23 `insert_range` has the same rule ("the range must not overlap the container").
- What happens with spare capacity (libstdc++): to open a gap of 2 at the front, it first shifts `10 20 30 40 50` right by two, then copies from `[begin() + 2, begin() + 4)`. Those slots now hold the shifted `10 20`, so that is what gets copied.
- When the insert has to reallocate, the new block is filled while the old one is still intact, so the source range is read before anything moves: it "works". The bug therefore depends on the capacity at the time, which is why it hides in tests.
- ASan stays silent: every access is inside the vector's own live buffer. Only debug mode knows the iterators belong to `v`.
- Contrast with Q3: `push_back(v[0])` (one element) must work even when it reallocates; the range overloads get no such guarantee.
- **Key Concept:** Never pass a container's own iterators as the source range of `insert`; copy the range out first.

**Fixed Version:**
```cpp
#include <iostream>
#include <vector>

int main() {
    std::vector<int> v{10, 20, 30, 40, 50};
    std::vector<int> tmp(v.begin() + 2, v.begin() + 4);   // copy out first
    v.insert(v.begin(), tmp.begin(), tmp.end());
    for (int x : v) std::cout << x << ' ';
    std::cout << '\n';                                     // 30 40 10 20 30 40 50
}
```

---

#### Q3
```cpp
// Q: What does this print? Is any line UB?
#include <iostream>
#include <vector>

int main() {
    std::vector<int> v{1, 2, 3};
    std::cout << v.capacity() << ' ';
    v.push_back(v[0]);
    v.push_back(v[3]);
    for (int x : v) std::cout << x << ' ';
    std::cout << v.capacity() << '\n';
}
```

**Answer:**
```
3 1 2 3 1 1 6
```
No UB. Capacities are libstdc++ / GCC, x86-64.

**Explanation:**
- The first `push_back(v[0])` happens at full capacity (3), so the vector reallocates while the argument refers into the old block.
- The standard requires self-insertion to work. libstdc++ constructs the new element from the argument before relocating and freeing the old elements.
- The second `push_back(v[3])` fits in the new capacity 6.
- **Key Concept:** `v.push_back(v[i])` is legal even when it reallocates.

---

#### Q4
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

---

#### Q5
```cpp
// Q: What does this print?
#include <iostream>
#include <vector>

int main() {
    std::vector<bool> flags(3, false);
    auto first = flags[0];
    bool copy = flags[0];
    flags[0] = true;
    std::cout << first << ' ' << copy << '\n';
}
```

**Answer:**
```
1 0
```

**Explanation:**
- `std::vector<bool>::operator[]` returns a proxy (`std::vector<bool>::reference`), so `auto` deduces the proxy type, not `bool`.
- The proxy keeps referring to bit 0, so it reads the later write: `1`.
- `bool copy` converts the proxy to a value at that moment: `0`.
- With `std::vector<int>`, `auto` would have copied the value and printed `0 0`.
- **Key Concept:** `vector<bool>` hands out proxies; spell out `bool` when you want a value.

---

#### Q6
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

---

#### Q7
```cpp
// Q: Does this compile with -std=c++17? With -std=c++20?
#include <iostream>
#include <vector>

struct Point { int x, y; };

int main() {
    std::vector<Point> pts;
    pts.emplace_back(3, 4);
    std::cout << pts[0].x + pts[0].y << '\n';
}
```

**Answer:**
```
C++17 (GCC 11): compile error inside the allocator:
  error: new initializer expression list treated as compound expression
  error: no matching function for call to 'Point::Point(int)'
C++20: compiles, prints 7
```

**Explanation:**
- `emplace_back` constructs with parentheses: `::new (p) Point(3, 4)`. An aggregate has no such constructor, so C++17 rejects it.
- C++20 added parenthesized aggregate initialization (P0960): `Point(3, 4)` now initializes the members in order.
- C++17 alternatives: `pts.push_back({3, 4});` or give `Point` a constructor.
- **Key Concept:** In C++20, `emplace_back` works for aggregates.

---

#### Q8
```cpp
// Q: Does this compile?
#include <vector>

struct Data {
    Data(const Data&) = default;
    Data(Data&&) noexcept = default;
    int value = 0;
};

int main() {
    std::vector<Data> v;
    v.emplace_back();
    return v[0].value;
}
```

**Answer:**
```
Compile error:
  error: no matching function for call to 'Data::Data()'
```

**Explanation:**
- Declaring any constructor, including a copy or move constructor (even `= default`), suppresses the implicitly declared default constructor.
- `emplace_back()` with no arguments needs `Data()`.
- The error appears deep inside the allocator's `construct`, which makes it look like a library problem.
- **Key Concept:** Add `Data() = default;` when you declare other constructors and still need default construction.

**Fixed Version:**
```cpp
#include <vector>

struct Data {
    Data() = default;
    Data(const Data&) = default;
    Data(Data&&) noexcept = default;
    int value = 0;
};

int main() {
    std::vector<Data> v;
    v.emplace_back();
    return v[0].value;      // 0
}
```

---

#### Q9
```cpp
// Q: What does this print? (libstdc++)
#include <iostream>
#include <vector>

int main() {
    std::vector<int> v;
    v.reserve(100);
    v.resize(80);
    std::cout << v.size() << '/' << v.capacity() << ' ';
    v.reserve(30);
    std::cout << v.size() << '/' << v.capacity() << ' ';
    v.resize(200);
    std::cout << v.size() << '/' << v.capacity() << ' ';
    v.resize(10);
    std::cout << v.size() << '/' << v.capacity() << ' ';
    v.clear();
    v.shrink_to_fit();
    std::cout << v.size() << '/' << v.capacity() << '\n';
}
```

**Answer:**
```
80/100 80/100 200/200 10/200 0/0
```
The guaranteed parts: `reserve` and `resize` never shrink capacity, and the exact 200 and the honoured `shrink_to_fit` are libstdc++ / GCC, x86-64.

**Explanation:**
- `resize(80)` within capacity 100: no reallocation.
- `reserve(30)` below capacity: no-op. It never shrinks and never changes size.
- `resize(200)` beyond capacity: libstdc++ grows to `max(2 * size, size + added) = max(160, 200) = 200`.
- `resize(10)` destroys 190 elements; capacity stays 200.
- `clear()` + `shrink_to_fit()`: libstdc++ releases the block.
- **Key Concept:** Only `shrink_to_fit` (non-binding) or swapping with an empty vector reduces capacity.

---

#### Q10
```cpp
// Q: Find the bug.
#include <iostream>
#include <string>
#include <vector>

int main() {
    std::vector<std::string> names{{"alpha", "beta"}};
    std::cout << names.size() << '\n';
    for (const auto& n : names) std::cout << n << '\n';
}
```

**Answer:**
```
UB. The outer braces make an initializer_list<std::string> with ONE element, built from
{"alpha", "beta"}: std::string(first, last) with two unrelated pointers.
libstdc++ / GCC 11: terminate called after throwing 'std::length_error'
  what():  basic_string::_M_create
```

**Explanation:**
- The inner `{"alpha", "beta"}` is not "two strings": it matches the iterator-pair constructor `std::string(InputIt first, InputIt last)` with `InputIt = const char*`.
- The two literals are separate arrays, so the "range" between them is meaningless: anything from a garbage string to a crash or `length_error`.
- Intended code: `std::vector<std::string> names{"alpha", "beta"};` (single braces).
- **Key Concept:** Double braces on a container of strings is a classic trap; each extra brace level changes which constructor runs.

**Fixed Version:**
```cpp
#include <iostream>
#include <string>
#include <vector>

int main() {
    std::vector<std::string> names{"alpha", "beta"};
    std::cout << names.size() << '\n';                  // 2
    for (const auto& n : names) std::cout << n << '\n';
}
```

---

#### Q11
```cpp
// Q: What does this print? (libstdc++)
#include <iostream>
#include <vector>

int main() {
    std::vector<int> src;
    src.reserve(1000);
    src.push_back(42);
    std::vector<int> copy = src;
    std::vector<int> moved = std::move(src);
    std::cout << copy.capacity() << ' ' << moved.capacity() << ' '
              << src.capacity() << '\n';
}
```

**Answer:**
```
1 1000 0
```
libstdc++ / GCC, x86-64. The copy's capacity is not specified; the move handing over the block is.

**Explanation:**
- The copy constructor allocates for the elements (1), not for the source's spare capacity.
- The move constructor steals the three pointers: `moved` owns the 1000-slot block, `src` is left empty.
- So a vector that was `reserve`d and then passed by value (copied) loses its reservation.
- **Key Concept:** Capacity travels with moves, not with copies.

---

#### Q12
```cpp
// Q: Does this compile? If so, is it safe?
#include <iostream>
#include <memory>
#include <vector>

int main() {
    std::vector<std::unique_ptr<int>> v;
    v.emplace_back(new int(1));
    // v.push_back(new int(2));
    v.push_back(std::make_unique<int>(3));
    std::cout << v.size() << ' ' << *v[0] + *v[1] << '\n';
}
```

**Answer:**
```
Compiles and prints: 2 4
The commented push_back(new int(2)) would not compile. The emplace_back(new int(1))
line leaks if the vector's allocation throws before the unique_ptr is constructed.
```

**Explanation:**
- `unique_ptr(pointer)` is `explicit`. `push_back` takes a `unique_ptr` parameter, so it would need an implicit conversion from `int*`: compile error ("no matching function for call to 'push_back(int*)'").
- `emplace_back` direct-initializes the element, so it can call the explicit constructor.
- But the allocation of the new block happens before the element is constructed; if it throws `bad_alloc`, nothing owns the raw `new int(1)`.
- **Key Concept:** Do not pass naked `new` to `emplace_back`; use `make_unique`.

---
