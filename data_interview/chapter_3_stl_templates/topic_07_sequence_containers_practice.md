## TOPIC: deque, list, forward_list, array and Adaptors

### PRACTICE_TASKS: Output Prediction and Bug Hunting

#### Q1
```cpp
// Q: What does this print? Is every line well defined?
#include <deque>
#include <iostream>

int main() {
    std::deque<int> d{1, 2, 3};
    int* p = &d[1];                       // points at 2
    for (int i = 0; i < 1000; ++i) d.push_front(-i);
    std::cout << *p << ' ' << std::boolalpha
              << (d[1001] == *p) << ' ' << (&d[1001] == p) << '\n';
}
```

**Answer:**
```
2 true true
```

**Explanation:**
- Insertion at either end of a deque never invalidates pointers or references: the element 2 stays at the same address through all 1000 `push_front` calls (several new blocks and map reallocations happen).
- Its **index** changes: 1000 elements were added in front, so it is now `d[1001]`.
- The same code with a `std::vector` and `insert(v.begin(), ...)` would invalidate `p` on the first insert.
- **Key Concept:** deque end insertion keeps element addresses stable; only iterators (and indices, by meaning) change.

---

#### Q2
```cpp
// Q: What does this print?
#include <iostream>
#include <iterator>
#include <list>

int main() {
    std::list<int> l{10, 20, 30};
    auto it = std::next(l.begin());       // refers to 20
    auto ins = l.insert(it, 15);
    std::cout << *it << ' ' << *ins << ' ' << l.size() << " |";
    for (int x : l) std::cout << ' ' << x;
    std::cout << '\n';
}
```

**Answer:**
```
20 15 4 | 10 15 20 30
```

**Explanation:**
- `list::insert(pos, value)` inserts **before** `pos` and returns an iterator to the new element.
- `it` is not invalidated (list insertion invalidates nothing) and still refers to 20.
- To insert after an element, pass `std::next(it)`.
- **Key Concept:** Standard `insert` is always "insert before"; only `forward_list` has `insert_after`.

---

#### Q3
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

#### Q4
```cpp
// Q: What does this print?
#include <iostream>
#include <list>

int main() {
    std::list<int> l{1, 2, 1, 2, 2, 3, 3};
    l.unique();
    for (int x : l) std::cout << x << ' ';
    std::cout << '\n';
}
```

**Answer:**
```
1 2 1 2 3 
```

**Explanation:**
- `unique()` removes **consecutive** duplicates only, like `std::unique`. The two separate runs of 1 and 2 stay.
- To remove all duplicates, `sort()` first, then `unique()`.
- Since C++20, `unique()` returns the number of removed elements (2 here).
- **Key Concept:** unique means "collapse adjacent equal elements", not "make the set of values unique".

---

#### Q5
```cpp
// Q: What does this print?
#include <forward_list>
#include <iostream>

int main() {
    std::forward_list<int> fl{1, 2, 3, 4};
    fl.erase_after(fl.begin());
    fl.insert_after(fl.before_begin(), 0);
    for (int x : fl) std::cout << x << ' ';
    std::cout << '\n';
}
```

**Answer:**
```
0 1 3 4 
```

**Explanation:**
- `erase_after(fl.begin())` erases the element **after** the first one: the 2.
- `insert_after(fl.before_begin(), 0)` inserts at the front; `before_begin()` exists only to make front operations fit the "after" API.
- Adding `std::cout << fl.size();` would not compile: forward_list has no `size()`.
- **Key Concept:** A singly linked node can only change its successor, so every forward_list modifier works on the position after the one you pass.

---

#### Q6
```cpp
// Q: Which values are guaranteed? Is the program well defined?
#include <array>
#include <iostream>

int main() {
    std::array<int, 3> a;
    std::array<int, 3> b{};
    std::array<int, 3> c{7};
    std::cout << b[0] << b[1] << b[2] << ' ' << c[0] << c[1] << c[2] << '\n';
    std::cout << a[0] << '\n';
}
```

**Answer:**
```
First line is guaranteed: "000 700".
The second line reads an indeterminate value: undefined behaviour. In practice it printed a different garbage number on each run (for example 28710).
```

**Explanation:**
- `std::array` is an aggregate. `a` is default-initialized, and for `int` elements that means no initialization at all.
- `b{}` value-initializes every element to 0. `c{7}` sets the first element and value-initializes the rest.
- GCC 11 warns ("'a' is used uninitialized", `-Wuninitialized`) only with optimization (`-O2`), not at `-O0`; MemorySanitizer (Clang) reports it at run time.
- **Key Concept:** `std::array` follows C array initialization rules; write `{}` to get zeros.

---

#### Q7
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

---

#### Q8
```cpp
// Q: Does this compile?
#include <iostream>
#include <queue>
#include <vector>

int main() {
    std::queue<int, std::vector<int>> q;
    q.push(1);
    q.push(2);
    std::cout << q.front() << '\n';
    q.pop();
}
```

**Answer:**
```
Does not compile, because of q.pop():
error: 'class std::vector<int>' has no member named 'pop_front'
```

**Explanation:**
- `queue::pop()` is implemented as `c.pop_front()`. `std::vector` has no `pop_front` (it would be O(n)).
- Without the `pop()` line the program compiles: a class template member function is only instantiated when it is called.
- Valid choices: `std::queue<int>` (deque) or `std::queue<int, std::list<int>>`. A `std::stack` over a vector is fine.
- **Key Concept:** Adaptors require specific operations from their container, and the error appears only when the member that uses them is instantiated.

---

#### Q9
```cpp
// Q: The code logs the event it is about to remove. What does it print?
#include <iostream>
#include <queue>
#include <string>

int main() {
    std::priority_queue<std::string> pq;
    for (const char* s : {"alpha", "delta", "charlie", "bravo"}) pq.push(s);
    const std::string& next = pq.top();
    pq.pop();
    std::cout << "processed " << next << '\n';
}
```

**Answer:**
```
processed charlie
```

**Explanation:**
- `top()` returns a reference to the first element of the underlying vector. `pop()` runs `std::pop_heap` (which moves the top to the back and moves the next largest to the front) and then `pop_back()`.
- `next` still refers to slot 0 of the vector, which now holds the new top, "charlie". The intended value, "delta", was destroyed by `pop_back`.
- With the default vector container this reads a live object (not a crash, nothing for ASan to find), so it is a silent logic bug. Holding a reference across `pop()` is never correct.
- **Key Concept:** Copy or move the value out of `top()` before `pop()`; references into an adaptor do not survive modification.

**Fixed Version:**
```cpp
#include <iostream>
#include <queue>
#include <string>

int main() {
    std::priority_queue<std::string> pq;
    for (const char* s : {"alpha", "delta", "charlie", "bravo"}) pq.push(s);
    std::string next = pq.top();          // copy before pop
    pq.pop();
    std::cout << "processed " << next << '\n';   // processed delta
}
```

---

#### Q10
```cpp
// Q: What does this print?
#include <iostream>
#include <iterator>
#include <list>

int main() {
    std::list<int> a{1, 2, 3}, b{10, 20};
    auto it = std::next(a.begin());       // refers to 2
    b.splice(b.begin(), a);               // move ALL of a to the front of b
    std::cout << a.size() << ' ' << b.size() << ' ' << *it << ' '
              << std::distance(b.begin(), it) << '\n';
}
```

**Answer:**
```
0 5 2 1
```

**Explanation:**
- Whole-list `splice` relinks all three nodes of `a` into `b` in O(1); `a` becomes empty.
- `it` is still valid and still refers to 2, but it now iterates `b`: `b` is `1 2 3 10 20`, and 2 is at distance 1.
- Using `it` with `a` (for example `a.erase(it)`) would now be UB.
- **Key Concept:** splice moves nodes, not values; iterators follow their nodes into the destination list.

---

#### Q11
```cpp
// Q: Is reading r after the insert well defined? What do you see in practice?
#include <deque>
#include <iostream>

int main() {
    std::deque<int> d{10, 20, 30, 40, 50, 60};
    int& r = d[4];                        // 50
    d.insert(d.begin() + 1, 99);
    std::cout << r << ' ' << d[5] << '\n';
}
```

**Answer:**
```
Undefined behaviour: insertion in the middle of a deque invalidates all references.
In practice (libstdc++) it prints "50 50".
```

**Explanation:**
- The standard: an insert anywhere except at the two ends invalidates **all** iterators and references to deque elements.
- libstdc++ shifts whichever side is shorter. Inserting at index 1 moves only the element 10 one slot towards the front, so 50 happens to stay at its address and `r` still reads 50.
- Insert near the back instead (`d.begin() + 5`) and the back elements move: then `r` reads 99 in practice, a different element. Code that "works" depends on an implementation detail and on the position.
- **Key Concept:** Middle insertion in a deque invalidates every reference by the standard, even when the implementation happens not to move a given element.
