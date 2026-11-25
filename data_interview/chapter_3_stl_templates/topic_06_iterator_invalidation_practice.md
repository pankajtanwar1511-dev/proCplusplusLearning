## TOPIC: Iterators and Invalidation Rules

### PRACTICE_TASKS: Output Prediction and Bug Hunting

#### Q1
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

#### Q2
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

#### Q3
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

---

#### Q4
```cpp
// Q: Capacity is reserved. Which output statement is well defined?
#include <iostream>
#include <vector>

int main() {
    std::vector<int> v{1, 2, 3};
    v.reserve(8);
    auto first = v.begin();
    auto last = v.end();
    v.push_back(4);
    std::cout << *first << '\n';                         // (A)
    for (auto it = first; it != last; ++it)              // (B)
        std::cout << *it;
    std::cout << '\n';
}
```

**Answer:**
```
(A) is well defined and prints 1.
(B) is undefined behaviour: last is the old end(), invalidated by push_back. In practice it prints 123.
```

**Explanation:**
- `push_back` without reallocation keeps every element iterator valid, so `first` is fine.
- It invalidates the past-the-end iterator: `last` no longer has a defined meaning, so comparing with it is UB.
- In practice the old `end()` equals the address of the new element, so the loop stops before 4. That "works" result is why the bug is hard to see.
- libstdc++ debug mode (GCC 11) does not flag this case either.
- **Key Concept:** `push_back` without reallocation invalidates exactly one thing: `end()`. Never cache it across a size change.

---

#### Q5
```cpp
// Q: Intended to duplicate the contents. What happens?
#include <iostream>
#include <vector>

int main() {
    std::vector<int> v{1, 2, 3};
    for (int x : v)
        v.push_back(x);
    std::cout << v.size() << '\n';
}
```

**Answer:**
```
Undefined behaviour. Built with -fsanitize=address it stops with "heap-use-after-free" on the second iteration; without ASan it may print a wrong size, loop for a while, or crash.
```

**Explanation:**
- Range-for caches `begin()` and `end()` before the loop. The first `push_back` (size 3, capacity 3) reallocates and frees the old buffer.
- The hidden loop iterator then reads freed memory on its next increment and dereference.
- Even with `v.reserve(6)` first, the cached `end()` is invalidated by `push_back`, so it is still UB (it just stops crashing).
- **Key Concept:** Never change the size of a container inside a range-for over it.

**Fixed Version:**
```cpp
#include <iostream>
#include <vector>

int main() {
    std::vector<int> v{1, 2, 3};
    const std::size_t n = v.size();
    v.reserve(2 * n);
    for (std::size_t i = 0; i < n; ++i)
        v.push_back(v[i]);           // index is re-evaluated, never stale
    for (int x : v) std::cout << x << ' ';
    std::cout << '\n';               // 1 2 3 1 2 3
}
```

---

#### Q6
```cpp
// Q: Prints every configured port. What happens?
#include <iostream>
#include <vector>

struct Config {
    std::vector<int> ports_{8080, 8081, 8082};
    std::vector<int> ports() const { return ports_; }   // returns a copy
};

int main() {
    Config cfg;
    for (auto it = cfg.ports().begin(); it != cfg.ports().end(); ++it)
        std::cout << *it << ' ';
    std::cout << '\n';
}
```

**Answer:**
```
Undefined behaviour: it and the end() it is compared with come from two different
temporary vectors, and both temporaries are already destroyed.
In our run (GCC 11, -O0) it printed three garbage numbers, e.g. "-1847767897 5 -69165601".
-fsanitize=address: "heap-use-after-free" on the first *it.
-D_GLIBCXX_DEBUG: "attempt to compare a singular iterator to a past-the-end iterator".
```

**Explanation:**
- `ports()` returns by value, so every call makes a new vector. `cfg.ports().begin()` is an iterator into a temporary that dies at the end of the init statement: `it` is dangling before the first test.
- Each `cfg.ports().end()` is the end of yet another temporary. Comparing iterators from different containers is UB even when both are alive: they are not in the same range.
- The loop stopping after three items is luck: the allocator reused the same block for each temporary, so the addresses happened to line up.
- The same bug hides in `std::find(load().begin(), load().end(), x)`; the C++20 `std::ranges::find(load(), x)` takes one range, and for a temporary vector it returns `std::ranges::dangling`, so any use of the result fails to compile (topic 02).
- **Key Concept:** Both iterators of a range must come from the same, still-alive container. Name the container once (`const auto ports = cfg.ports();`) or return `const std::vector<int>&`.

**Fixed Version:**
```cpp
#include <iostream>
#include <vector>

struct Config {
    std::vector<int> ports_{8080, 8081, 8082};
    const std::vector<int>& ports() const { return ports_; }
};

int main() {
    Config cfg;
    for (int p : cfg.ports()) std::cout << p << ' ';   // one container, one range
    std::cout << '\n';                                 // 8080 8081 8082
}
```

---

#### Q7
```cpp
// Q: What does this print?
#include <iostream>
#include <vector>

int main() {
    std::vector<int> v{10, 20, 30, 40};
    auto it = v.begin() + 2;
    std::cout << *it << ' ' << *(it - 1) << ' ' << it[1] << ' ' << (v.end() - it) << '\n';
}
```

**Answer:**
```
30 20 40 2
```

**Explanation:**
- `it + 2` moves by elements, not bytes: `*it` is `v[2]`.
- `it[1]` means `*(it + 1)`, relative to `it`, not to `begin()`: 40, not 30.
- `v.end() - it` is the number of elements from `it` to the end: 2.
- All of this needs random access iterators; on a `std::list` only `*it` would compile.
- **Key Concept:** Random access iterators support pointer arithmetic in element units; `it[n]` is relative to `it`.

---

#### Q8
```cpp
// Q: Does this compile? If not, which line fails?
#include <iostream>
#include <vector>

int main() {
    std::vector<int> v{1, 2, 3};
    const std::vector<int>::iterator it = v.begin();
    *it = 5;
    ++it;
    std::cout << v[0] << '\n';
}
```

**Answer:**
```
Does not compile. Only "++it;" fails:
error: passing 'const iterator' as 'this' argument discards qualifiers
```

**Explanation:**
- `const iterator` makes the iterator object constant: it cannot be moved, but it still yields `int&`, so `*it = 5` compiles.
- `std::vector<int>::const_iterator` is the opposite: `++it` compiles, `*it = 5` fails.
- Same as `int* const p` versus `const int* p`.
- **Key Concept:** `const iterator` fixes the position; `const_iterator` makes the element read-only. Use `cbegin()` for read-only iteration.

---

#### Q9
```cpp
// Q: Prints every second element. Find the bug.
#include <iostream>
#include <vector>

int main() {
    std::vector<int> v{10, 20, 30, 40, 50};
    for (auto it = v.begin(); it != v.end(); it += 2)
        std::cout << *it << ' ';
    std::cout << '\n';
}
```

**Answer:**
```
Undefined behaviour: after 50, it += 2 jumps to begin() + 6, one past end(), so
it != v.end() is never false. In our run it printed "10 30 50" followed by
thousands of garbage numbers, then crashed with a segmentation fault.
-fsanitize=address: "heap-buffer-overflow ... 4 bytes to the right of 20-byte region".
-D_GLIBCXX_DEBUG: "attempt to advance a dereferenceable iterator 2 steps, which falls
outside its valid range".
```

**Explanation:**
- An iterator may only move inside `[begin(), end()]`. Forming `begin() + 6` on a 5-element vector is already UB, before any dereference (same rule as pointer arithmetic past one-past-the-end).
- With an even size the loop lands exactly on `end()` and "works", so the bug appears only for odd sizes.
- `std::next(it, 2)` and `std::advance(it, 2)` have the same problem: they do not check bounds.
- Writing `it < v.end()` usually stops the loop in practice, but `begin() + 6` is still formed, so it is still UB (and `<` does not compile for list iterators).
- **Key Concept:** Strided loops must check the remaining distance before stepping; `!=` only works when every step can land on `end()`.

**Fixed Version:**
```cpp
#include <iostream>
#include <vector>

int main() {
    std::vector<int> v{10, 20, 30, 40, 50};
    for (std::size_t i = 0; i < v.size(); i += 2)      // index check, no overshoot
        std::cout << v[i] << ' ';
    // iterator form: if (v.end() - it <= 2) break; else it += 2;
    std::cout << '\n';                                 // 10 30 50
}
```

---

#### Q10
```cpp
// Q: Intended to erase the 3. What does this print?
#include <algorithm>
#include <iostream>
#include <vector>

int main() {
    std::vector<int> v{1, 2, 3, 4, 5};
    auto rit = std::find(v.rbegin(), v.rend(), 3);
    v.erase(rit.base());
    for (int x : v) std::cout << x << ' ';
    std::cout << '\n';
}
```

**Answer:**
```
1 2 3 5
```

**Explanation:**
- `rit.base()` points one element after `*rit` in forward order: `*rit` is 3, `rit.base()` is the 4.
- So the 4 is erased, not the 3. If the searched value had been the last element, `rit.base()` would be `end()`, and `erase(end())` is UB.
- **Key Concept:** Erase through a reverse iterator with `v.erase(std::next(rit).base())`.

**Fixed Version:**
```cpp
#include <algorithm>
#include <iostream>
#include <iterator>
#include <vector>

int main() {
    std::vector<int> v{1, 2, 3, 4, 5};
    auto rit = std::find(v.rbegin(), v.rend(), 3);
    v.erase(std::next(rit).base());
    for (int x : v) std::cout << x << ' ';
    std::cout << '\n';                   // 1 2 4 5
}
```

---

#### Q11
```cpp
// Q: What does this print?
#include <array>
#include <iostream>
#include <vector>

int main() {
    std::vector<int> va{1, 2, 3}, vb{7, 8, 9};
    std::array<int, 3> aa{1, 2, 3}, ab{7, 8, 9};

    auto vit = va.begin();
    auto ait = aa.begin();
    va.swap(vb);
    aa.swap(ab);

    std::cout << *vit << ' ' << *ait << '\n';
    std::cout << std::boolalpha << (vit == vb.begin()) << ' ' << (ait == aa.begin()) << '\n';
}
```

**Answer:**
```
1 7
true true
```

**Explanation:**
- `vector::swap` exchanges the internal pointers; no element moves. `vit` still refers to the element 1, which now belongs to `vb`.
- `array::swap` cannot exchange buffers (the elements live inside the object), so it swaps the values one by one. `ait` still points into `aa`, which now holds 7, 8, 9.
- The same split applies to `std::string`: short strings live inside the object, so string swap may invalidate.
- **Key Concept:** For heap-backed containers, swap moves ownership and iterators follow the elements; for `array` the iterator stays and the values change.

---

#### Q12
```cpp
// Q: Both loops erase even keys/values with the old c.erase(it++) idiom.
//    Which loop is correct? What does the program print?
#include <iostream>
#include <map>
#include <vector>

int main() {
    std::map<int, char> m{{1, 'a'}, {2, 'b'}, {3, 'c'}, {4, 'd'}};
    for (auto it = m.begin(); it != m.end(); ) {
        if (it->first % 2 == 0) m.erase(it++);
        else ++it;
    }
    std::cout << "map: " << m.size() << '\n';

    std::vector<int> v{1, 2, 2, 3};
    for (auto it = v.begin(); it != v.end(); ) {
        if (*it % 2 == 0) v.erase(it++);
        else ++it;
    }
    std::cout << "vector: " << v.size() << '\n';
}
```

**Answer:**
```
The map loop is correct and prints "map: 2".
The vector loop is undefined behaviour. In practice (libstdc++) it prints "vector: 3": one of the 2s survives.
```

**Explanation:**
- `m.erase(it++)`: the post-increment moves `it` to the next node first, then the old position is erased. Map erase invalidates only the erased node, so `it` stays valid. This was the standard idiom before C++11 gave `map::erase` a return value.
- For a vector, erase invalidates everything at or after the erased position, which includes the already incremented `it`. Every later use is UB.
- In practice the incremented iterator now points one slot too far (elements shifted left), so the element after each erased one is skipped: the second 2 is never tested.
- `-D_GLIBCXX_DEBUG` aborts on the first use of the stale iterator.
- **Key Concept:** `erase(it++)` is safe only for node containers. `it = c.erase(it)` is correct for every container.
