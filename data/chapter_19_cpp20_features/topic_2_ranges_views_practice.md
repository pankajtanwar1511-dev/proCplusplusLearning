## TOPIC: C++20 Ranges and Views - Modern Iteration and Transformation

### PRACTICE_TASKS: Output Prediction and Code Analysis

#### Q1
```cpp
#include <iostream>
#include <vector>
#include <ranges>

namespace views = std::views;

int main() {
    std::vector<int> vec{1, 2, 3, 4, 5};

    auto result = vec
        | views::filter([](int n) { return n % 2 == 0; })
        | views::transform([](int n) { return n * 10; });

    vec.push_back(6);  // Bug: modifying underlying container while view exists!

    for (auto val : result) {
        std::cout << val << " ";
    }
}
```

**Answer:**
```
Undefined behavior (likely: 20 40 60 or crash if reallocation occurs)
```

**Explanation:**
- Views are lazy and reference underlying container
- `result` view holds reference to `vec`
- `push_back(6)` may trigger reallocation → invalidates iterators
- Iterating over `result` uses potentially invalidated iterators
- If no reallocation: works (20 40 60)
- If reallocation: undefined behavior (crash or garbage values)
- **Key Concept:** Views don't own data; modifying underlying container during view iteration invalidates iterators and causes undefined behavior

**Fixed Version:**
```cpp
auto result = vec
    | views::filter([](int n) { return n % 2 == 0; })
    | views::transform([](int n) { return n * 10; });

// Don't modify vec while result view exists!
// Either iterate first, or create result after modifications
```

---

#### Q2
```cpp
#include <iostream>
#include <vector>
#include <ranges>

namespace views = std::views;

int main() {
    std::vector<int> vec{1, 2, 3, 4, 5};

    auto get_view() {
        std::vector<int> temp{10, 20, 30};
        return temp | views::transform([](int n) { return n * 2; });  // Bug: dangling reference!
    }

    auto view = get_view();

    for (auto val : view) {
        std::cout << val << " ";
    }
}
```

**Answer:**
```
Undefined behavior (dangling reference to destroyed vector)
```

**Explanation:**
- `temp` is local to `get_view()` → destroyed when function returns
- View captures reference to `temp` (views don't own data)
- Returning view returns reference to dead object
- Iterating over `view` accesses freed memory → undefined behavior
- May crash, print garbage, or appear to work (depending on stack reuse)
- **Key Concept:** Views are non-owning; returning views from functions that reference local containers creates dangling references

**Fixed Version:**
```cpp
auto get_view() {
    static std::vector<int> temp{10, 20, 30};  // Static lifetime
    return temp | views::transform([](int n) { return n * 2; });
}

// OR return owning range:
std::vector<int> get_data() {
    std::vector<int> temp{10, 20, 30};
    return temp | views::transform([](int n) { return n * 2; })
                | std::ranges::to<std::vector>();  // Materialize to owning container
}
```

---

#### Q3
```cpp
#include <iostream>
#include <vector>
#include <ranges>

namespace views = std::views;

int main() {
    std::vector<int> vec{1, 2, 3, 4, 5};

    auto view = vec | views::transform([](int n) {
        std::cout << "T(" << n << ") ";
        return n * 2;
    });

    std::cout << "Created\n";

    for (auto val : view) {
        std::cout << val << " ";
    }

    std::cout << "\nSecond iteration:\n";

    for (auto val : view) {
        std::cout << val << " ";  // Bug: transforms again (not cached)!
    }
}
```

**Answer:**
```
Created
T(1) 2 T(2) 4 T(3) 6 T(4) 8 T(5) 10
Second iteration:
T(1) 2 T(2) 4 T(3) 6 T(4) 8 T(5) 10
```

**Explanation:**
- Creating view prints "Created" (lazy, no transformation yet)
- First iteration: transforms each element as iterated → T(1)...T(5)
- Second iteration: RE-APPLIES transformations (views don't cache)
- Each iteration re-computes → T(1)...T(5) again
- Expensive transformations repeated unnecessarily
- **Key Concept:** Views are lazy and don't cache results; multiple iterations re-compute transformations; use ranges::to<> to materialize if caching needed

**Fixed Version:**
```cpp
// If you need to iterate multiple times and cache results:
auto materialized = vec
    | views::transform([](int n) {
        std::cout << "T(" << n << ") ";
        return n * 2;
    })
    | std::ranges::to<std::vector>();  // Compute once, cache results

// Now iterate cached results multiple times without re-computation
```

---

#### Q4
```cpp
#include <iostream>
#include <ranges>

namespace views = std::views;

int main() {
    auto infinite = views::iota(1);  // Infinite range starting from 1

    for (auto val : infinite | views::take(1000000)) {
        if (val == 100) {
            std::cout << val << "\n";
            break;  // Bug: but took 1000000 elements already!
        }
    }
}
```

**Answer:**
```
100
```

**Explanation:**
- `views::iota(1)` creates infinite range: 1, 2, 3, ...
- `views::take(1000000)` limits to first 1,000,000 elements
- Iteration starts: 1, 2, 3, ..., 99, 100
- Finds 100 at element 100, prints it, breaks
- Lazy evaluation: only 100 elements generated (not full 1,000,000)
- `take()` is a limit, not pre-computation
- **Key Concept:** Views are lazily evaluated; take() limits iteration but doesn't generate elements until iterated; breaking early avoids computing remaining elements

**Note:** No bug here - this is correct usage! `take()` with `break` is fine due to lazy evaluation.

---

#### Q5
```cpp
#include <iostream>
#include <vector>
#include <ranges>

namespace views = std::views;

int main() {
    std::vector<int> vec{1, 2, 3, 4, 5};

    auto view = vec | views::reverse();

    vec.clear();  // Bug: cleared underlying container!

    for (auto val : view) {
        std::cout << val << " ";
    }
}
```

**Answer:**
```
Undefined behavior (likely: empty output or crash)
```

**Explanation:**
- `views::reverse()` creates view over `vec` iterators
- `vec.clear()` destroys all elements and invalidates iterators
- `view` holds iterators to cleared container
- Iterating over `view` uses invalidated iterators → undefined behavior
- `views::reverse()` needs bidirectional iterators → depends on container state
- **Key Concept:** Clearing or modifying underlying container invalidates views; views are non-owning references to container data

**Fixed Version:**
```cpp
auto view = vec | views::reverse();

// Don't modify vec while view exists!
for (auto val : view) {
    std::cout << val << " ";  // 5 4 3 2 1
}

vec.clear();  // Safe: clear after view is done
```

---

#### Q6
```cpp
#include <iostream>
#include <vector>
#include <ranges>

namespace views = std::views;

int main() {
    std::vector<int> vec{1, 2, 3, 4, 5};

    auto filtered = vec | views::filter([](int n) { return n > 2; });

    auto count = std::ranges::size(filtered);  // Bug: filter doesn't have size()!

    std::cout << "Count: " << count << "\n";
}
```

**Answer:**
```
Compilation error: filtered view does not provide size()
```

**Explanation:**
- `views::filter` creates filter_view which is not a sized_range
- Cannot know size without iterating (filtering is dynamic)
- `std::ranges::size()` requires sized_range concept
- Compilation error: no matching function for size()
- Must iterate to count: `std::ranges::distance(filtered)`
- **Key Concept:** Not all views are sized ranges; filter, take_while, drop_while don't know size without iteration; use std::ranges::distance() to count

**Fixed Version:**
```cpp
auto filtered = vec | views::filter([](int n) { return n > 2; });

auto count = std::ranges::distance(filtered);  // Correct: iterate to count

std::cout << "Count: " << count << "\n";  // 3 (elements 3, 4, 5)
```

---

#### Q7
```cpp
#include <iostream>
#include <vector>
#include <ranges>

namespace views = std::views;

int main() {
    std::vector<int> vec{1, 2, 3, 4, 5};

    auto view = vec
        | views::transform([](int& n) { n *= 2; return n; });  // Bug: mutating through view!

    for (auto val : view) {
        std::cout << val << " ";
    }

    std::cout << "\nOriginal vec: ";
    for (auto v : vec) {
        std::cout << v << " ";
    }
}
```

**Answer:**
```
2 4 6 8 10
Original vec: 2 4 6 8 10
```

**Explanation:**
- `views::transform` receives reference to element (`int&`)
- Lambda mutates original element: `n *= 2`
- Iteration applies transformation → modifies `vec` in-place
- First loop: transforms and prints: 2 4 6 8 10
- Second loop: vec already modified: 2 4 6 8 10
- **Danger:** Views supposed to be non-modifying, but reference + mutation violates this
- **Key Concept:** Views allow mutations through reference captures, but this violates principle of views being non-owning/non-modifying; use ranges::transform (algorithm, not view) for mutations

**Better Approach:**
```cpp
// For read-only transformation:
auto view = vec | views::transform([](int n) { return n * 2; });  // Copy, not reference

// For in-place mutation, use algorithm:
std::ranges::transform(vec, vec.begin(), [](int n) { return n * 2; });
```

---

#### Q8
```cpp
#include <iostream>
#include <ranges>
#include <string>

namespace views = std::views;

int main() {
    std::string str = "hello world";

    auto words = str | views::split(' ');  // Split by space

    for (auto word : words) {
        std::cout << word << " ";  // Bug: word is subrange, not string!
    }
}
```

**Answer:**
```
Compilation error: no operator<< for subrange
```

**Explanation:**
- `views::split(' ')` returns range of subranges (not strings)
- Each `word` is `std::ranges::subrange<std::string::iterator>`
- Cannot directly output subrange with `<<`
- Must convert to string or iterate characters
- Split views are ranges of ranges
- **Key Concept:** views::split returns range of subranges, not strings; must materialize subranges with ranges::to<string>() or iterate elements

**Fixed Version:**
```cpp
auto words = str | views::split(' ');

for (auto word : words) {
    for (char c : word) {
        std::cout << c;
    }
    std::cout << " ";
}

// OR convert to string:
for (auto word : words) {
    std::string s(word.begin(), word.end());
    std::cout << s << " ";
}

// Output: h e l l o   w o r l d  (character by character)
// OR: hello world  (converted to string)
```

---

#### Q9
```cpp
#include <iostream>
#include <vector>
#include <ranges>

namespace views = std::views;

int main() {
    std::vector<int> vec{1, 2, 3, 4, 5};

    auto view = vec
        | views::take(10)   // Take 10 elements
        | views::drop(2);   // Drop first 2

    for (auto val : view) {
        std::cout << val << " ";  // Bug: take(10) from 5-element vector!
    }
}
```

**Answer:**
```
3 4 5
```

**Explanation:**
- `vec` has 5 elements: {1, 2, 3, 4, 5}
- `views::take(10)` tries to take 10, but only 5 available → takes all 5
- `views::drop(2)` drops first 2: {3, 4, 5}
- Result: {3, 4, 5}
- `take()` doesn't error if requesting more than available (unlike subscript)
- **Key Concept:** take() and drop() safely handle requests beyond available elements; take() stops at end, doesn't error

**No bug here - this is correct behavior!** Views gracefully handle out-of-bounds requests.

---

#### Q10
```cpp
#include <iostream>
#include <vector>
#include <ranges>
#include <algorithm>

namespace views = std::views;

int main() {
    std::vector<int> vec{5, 2, 8, 1, 9};

    auto view = vec | views::reverse();

    std::ranges::sort(view);  // Bug: view doesn't own data, can't sort view directly!

    for (auto val : vec) {
        std::cout << val << " ";
    }
}
```

**Answer:**
```
Compilation error: cannot sort reverse_view (or behavior depends on implementation)
```

**Explanation:**
- `views::reverse()` creates non-owning view
- `std::ranges::sort()` requires random_access_range and modifiable
- Reverse view may not satisfy all requirements for sorting
- Some implementations: compile error (no random access)
- Some implementations: compiles but sorts in reverse order
- Proper approach: sort underlying container, then create view
- **Key Concept:** Views are non-owning; algorithms that modify should operate on owning containers, not views; sort the container, not the view

**Fixed Version:**
```cpp
std::ranges::sort(vec);  // Sort container first

auto view = vec | views::reverse();  // Then create view

for (auto val : view) {
    std::cout << val << " ";  // Prints in reverse: 9 8 5 2 1
}
```

---

#### Q11
```cpp
#include <iostream>
#include <ranges>

namespace views = std::views;

int main() {
    auto nums = views::iota(0, 10);  // Range [0, 10)

    auto squares = nums | views::transform([](int n) { return n * n; });

    auto result = squares | views::filter([](int n) { return n > 20; });

    std::cout << std::ranges::distance(result) << "\n";  // Bug: inefficient!
}
```

**Answer:**
```
5
```

**Explanation:**
- `views::iota(0, 10)` → {0, 1, 2, 3, 4, 5, 6, 7, 8, 9}
- `views::transform` → squares: {0, 1, 4, 9, 16, 25, 36, 49, 64, 81}
- `views::filter(> 20)` → {25, 36, 49, 64, 81} (5 elements)
- `std::ranges::distance()` iterates entire pipeline to count
- Computes all squares, filters all, just to count
- **Inefficiency:** Lazy views + distance() forces full iteration for simple count
- **Key Concept:** std::ranges::distance() on filtered view requires full iteration; if you only need count, consider caching or different approach

**More Efficient (if needed multiple times):**
```cpp
auto materialized = result | std::ranges::to<std::vector>();
std::cout << materialized.size() << "\n";  // Cached size, O(1) lookups
```

---

#### Q12
```cpp
#include <iostream>
#include <vector>
#include <ranges>

namespace views = std::views;

int main() {
    std::vector<int> vec{1, 2, 3, 4, 5};

    auto view = vec
        | views::filter([](int n) { return n % 2 == 0; })
        | views::take(10);

    vec = {6, 7, 8, 9, 10};  // Bug: reassignment invalidates view!

    for (auto val : view) {
        std::cout << val << " ";
    }
}
```

**Answer:**
```
Undefined behavior (view references old vector data that's destroyed)
```

**Explanation:**
- `view` captures iterators/references to original `vec` contents
- `vec = {6, 7, 8, 9, 10}` destroys old vector and creates new one
- Old data freed, iterators invalidated
- `view` still references old (freed) memory
- Iterating over `view` → undefined behavior (crash or garbage)
- **Key Concept:** View invalidation occurs on container reassignment, not just modification; reassigning container destroys old data and invalidates all views

**Fixed Version:**
```cpp
std::vector<int> vec{1, 2, 3, 4, 5};

auto view = vec
    | views::filter([](int n) { return n % 2 == 0; })
    | views::take(10);

// Use view before modifying vec
for (auto val : view) {
    std::cout << val << " ";  // 2 4
}

// Now safe to reassign
vec = {6, 7, 8, 9, 10};
```

---

#### Q13
```cpp
#include <iostream>
#include <ranges>
#include <vector>

namespace views = std::views;

int main() {
    std::vector<std::vector<int>> nested{{1, 2}, {3, 4}, {5}};

    auto flattened = nested | views::join;

    for (auto val : flattened) {
        std::cout << val << " ";
    }

    std::cout << "\nSize: " << std::ranges::size(flattened) << "\n";  // Bug: join not sized!
}
```

**Answer:**
```
1 2 3 4 5
Compilation error: join_view does not provide size()
```

**Explanation:**
- `views::join` flattens nested ranges into single range
- Iterates inner ranges on-the-fly (lazy)
- Cannot know total size without iterating all inner ranges
- `std::ranges::size()` requires sized_range concept → join_view is not sized
- Must use `std::ranges::distance()` to count (requires iteration)
- **Key Concept:** views::join is not a sized range; total element count unknown without iteration; use distance() to count or materialize to owning container

**Fixed Version:**
```cpp
auto flattened = nested | views::join;

for (auto val : flattened) {
    std::cout << val << " ";
}

std::cout << "\nSize: " << std::ranges::distance(flattened) << "\n";  // Correct: 5
```

---

#### Q14
```cpp
#include <iostream>
#include <vector>
#include <ranges>

namespace views = std::views;

int main() {
    std::vector<int> vec{1, 2, 3, 4, 5};

    auto view = vec | views::take_while([](int n) { return n < 4; });

    vec[1] = 10;  // Bug: modifying element in middle!

    for (auto val : view) {
        std::cout << val << " ";
    }
}
```

**Answer:**
```
1 (then stops)
```

**Explanation:**
- `views::take_while(n < 4)` takes elements while predicate true
- Initially: {1, 2, 3} would satisfy (1<4, 2<4, 3<4, 4>=4 stops)
- But `vec[1] = 10` changes second element to 10
- Iteration: 1 (1<4 ✓), 10 (10<4 ✗) → stops
- Only outputs 1
- Modification during view lifetime → unexpected behavior
- **Key Concept:** Modifying underlying container while view exists changes view behavior; take_while depends on current values, not original values

**Fixed Version:**
```cpp
auto view = vec | views::take_while([](int n) { return n < 4; });

// Don't modify vec while view exists!
for (auto val : view) {
    std::cout << val << " ";  // 1 2 3
}

// Safe to modify after iteration
vec[1] = 10;
```

---

#### Q15
```cpp
#include <iostream>
#include <ranges>

namespace views = std::views;

int main() {
    auto evens = views::iota(0)
        | views::filter([](int n) { return n % 2 == 0; })
        | views::take(5);

    std::cout << "First 5 evens: ";
    for (auto val : evens) {
        std::cout << val << " ";
    }

    std::cout << "\nAgain: ";
    for (auto val : evens) {
        std::cout << val << " ";  // Bug: infinite range re-iterated!
    }
}
```

**Answer:**
```
First 5 evens: 0 2 4 6 8
Again: 0 2 4 6 8
```

**Explanation:**
- `views::iota(0)` creates infinite range starting at 0
- `views::filter(even)` filters to even numbers only
- `views::take(5)` limits to first 5 matching elements
- First iteration: generates 0, 2, 4, 6, 8 (5 evens)
- Second iteration: RE-GENERATES 0, 2, 4, 6, 8 (lazy, not cached)
- Each iteration re-applies filter and take
- **No bug here!** This is correct lazy view behavior
- **Key Concept:** Views don't cache; re-iterating infinite ranges with take() safely regenerates elements each time

**Note:** If lambda had side effects (like incrementing counter), those would execute twice!

---
