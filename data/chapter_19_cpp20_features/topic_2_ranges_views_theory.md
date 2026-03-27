## TOPIC: C++20 Ranges and Views - Modern Iteration and Transformation

### THEORY_SECTION: The Ranges Revolution - Composable, Lazy, and Elegant

---

#### 1. What Are Ranges - The Problem They Solve

**The Pre-C++20 Problem:**

```cpp
// ❌ C++17: Verbose, error-prone, temporary containers
std::vector<int> numbers = {1, 2, 3, 4, 5, 6, 7, 8, 9, 10};

// Want: even numbers, squared, first 3
std::vector<int> evens;
std::copy_if(numbers.begin(), numbers.end(), std::back_inserter(evens),
             [](int n) { return n % 2 == 0; });

std::vector<int> squared;
std::transform(evens.begin(), evens.end(), std::back_inserter(squared),
               [](int n) { return n * n; });

std::vector<int> result;
std::copy_n(squared.begin(), std::min(3ul, squared.size()),
            std::back_inserter(result));
// Result: {4, 16, 36}
```

**Problems:**
- 3 intermediate containers (memory overhead)
- Verbose iterator pairs
- Multiple algorithm calls
- Not composable
- Eager evaluation (processes all elements even if you only need a few)

**The C++20 Solution:**

```cpp
// ✅ C++20: Composable, lazy, zero intermediate containers
auto result = numbers
    | std::views::filter([](int n) { return n % 2 == 0; })
    | std::views::transform([](int n) { return n * n; })
    | std::views::take(3);
// Result: {4, 16, 36} (computed lazily!)

// Convert to container only when needed:
std::vector<int> vec(result.begin(), result.end());
```

**Benefits:**
- **Composable**: Chain operations with `|` operator
- **Lazy**: Computation happens on-demand
- **Zero overhead**: No intermediate containers
- **Readable**: Flows left-to-right like Unix pipes
- **Range-based**: Works with any range (no iterator pairs)

---

#### 2. Range Concepts - The Type Hierarchy

C++20 defines a hierarchy of range concepts that specify what operations a range supports:

```
                    std::ranges::range (has begin/end)
                           |
                    std::ranges::input_range (single-pass read)
                           |
                    std::ranges::forward_range (multi-pass read)
                           |
                    std::ranges::bidirectional_range (can go backwards)
                           |
                    std::ranges::random_access_range (O(1) jump to any element)
                           |
                    std::ranges::contiguous_range (elements in contiguous memory)
```

**Detailed Breakdown:**

| Concept | Requirements | Examples | Can Do |
|---------|-------------|----------|---------|
| `range` | `begin()`, `end()` | Any container, array | Iterate once |
| `input_range` | Single-pass iterator | `std::istream_iterator` | Read once |
| `forward_range` | Multi-pass iterator | `std::forward_list` | Read multiple times |
| `bidirectional_range` | Bidirectional iterator | `std::list`, `std::set` | Go backwards with `--it` |
| `random_access_range` | Random access iterator | `std::deque`, `std::vector` | Jump to any position `it + n` |
| `contiguous_range` | Contiguous memory | `std::vector`, `std::array`, C arrays | Memory is sequential |

**Additional Range Concepts:**

```cpp
// Sized range: O(1) size() operation
template<typename R>
concept sized_range = range<R> && requires(R& r) {
    { std::ranges::size(r) } -> std::convertible_to<std::size_t>;
};

// Common range: begin and end have same type
template<typename R>
concept common_range = range<R> &&
    std::same_as<std::ranges::iterator_t<R>, std::ranges::sentinel_t<R>>;

// Borrowed range: iterators remain valid after range destruction
template<typename R>
concept borrowed_range = range<R> && /* implementation-defined */;
```

**Checking Range Concepts:**

```cpp
#include <ranges>
#include <vector>
#include <list>
#include <forward_list>

std::vector<int> vec;
std::list<int> lst;
std::forward_list<int> fwd;

static_assert(std::ranges::contiguous_range<decltype(vec)>);
static_assert(std::ranges::bidirectional_range<decltype(lst)>);
static_assert(std::ranges::forward_range<decltype(fwd)>);

// All of these are also ranges:
static_assert(std::ranges::range<decltype(vec)>);
static_assert(std::ranges::range<decltype(lst)>);
static_assert(std::ranges::range<decltype(fwd)>);
```

---

#### 3. Views - Lazy, Non-Owning Range Adaptors

**What is a View?**

A view is a lightweight object that:
- **Non-owning**: Doesn't own the data it provides access to
- **Lazy**: Computes elements on-demand (when you iterate)
- **O(1) construction**: Creating a view is cheap (no data copying)
- **Composable**: Views can be chained with `|` operator
- **Movable**: Views are typically move-only (not copyable)

**View Concept:**

```cpp
template<typename V>
concept view = std::ranges::range<V>
    && std::movable<V>
    && std::ranges::enable_view<V>;
```

**Key Difference: View vs Range:**

```cpp
std::vector<int> vec{1, 2, 3, 4, 5};  // Range (owns data)

auto v = std::views::filter(vec, [](int n) { return n % 2 == 0; });
// View (doesn't own data, refers to vec)
// If vec is destroyed, v becomes dangling!
```

**Standard Views in C++20:**

| View | Description | Example |
|------|-------------|---------|
| `views::all` | Convert range to view | `views::all(vec)` |
| `views::filter` | Keep elements matching predicate | `views::filter(is_even)` |
| `views::transform` | Apply function to each element | `views::transform(square)` |
| `views::take` | First N elements | `views::take(5)` |
| `views::take_while` | Elements while predicate true | `views::take_while(is_positive)` |
| `views::drop` | Skip first N elements | `views::drop(3)` |
| `views::drop_while` | Skip while predicate true | `views::drop_while(is_negative)` |
| `views::reverse` | Reverse order | `views::reverse` |
| `views::elements<N>` | Extract Nth element of tuples | `views::elements<0>` |
| `views::keys` | Extract keys from pairs | `views::keys` |
| `views::values` | Extract values from pairs | `views::values` |
| `views::join` | Flatten nested ranges | `views::join` |
| `views::split` | Split range by delimiter | `views::split(' ')` |
| `views::common` | Convert to common_range | `views::common` |
| `views::counted` | View of N elements from iterator | `views::counted(it, 5)` |
| `views::iota` | Infinite/bounded sequence | `views::iota(1, 10)` |
| `views::single` | Single-element view | `views::single(42)` |
| `views::empty<T>` | Empty view | `views::empty<int>` |

---

#### 4. Pipeable Syntax - The `|` Operator Magic

**The Pipe Operator:**

C++20 ranges introduce operator overloading for `|` to create readable, left-to-right pipelines:

```cpp
// Traditional function composition (right-to-left, inside-out):
auto result = take(transform(filter(numbers, is_even), square), 3);

// C++20 pipeable syntax (left-to-right, natural reading):
auto result = numbers
    | views::filter(is_even)
    | views::transform(square)
    | views::take(3);
```

**How it Works:**

```cpp
// Simplified implementation
namespace std::views {
    struct filter_adaptor {
        template<typename Pred>
        auto operator()(Pred pred) const {
            return [pred](auto&& range) {
                return filter_view(std::forward<decltype(range)>(range), pred);
            };
        }
    };

    inline constexpr filter_adaptor filter;
}

// Usage:
auto v1 = numbers | views::filter(is_even);
// Equivalent to:
auto v2 = views::filter(is_even)(numbers);
```

**Chaining Multiple Operations:**

```cpp
std::vector<std::string> words = {"hello", "world", "cpp", "ranges"};

auto result = words
    | views::filter([](const auto& s) { return s.size() > 3; })  // {"hello", "world", "ranges"}
    | views::transform([](const auto& s) { return s.size(); })    // {5, 5, 6}
    | views::take(2);                                             // {5, 5}

// Lazy! Nothing computed until you iterate:
for (auto len : result) {
    std::cout << len << ' ';  // Output: 5 5
}
```

---

#### 5. Range Algorithms - Modernized STL Algorithms

C++20 provides modernized versions of all STL algorithms in `std::ranges` namespace:

**Key Improvements Over Traditional Algorithms:**

1. **Accept ranges** (not just iterator pairs)
2. **Support projections** (transform before applying)
3. **Return useful results** (not just iterators)
4. **Constrained with concepts** (better error messages)

**Comparison:**

```cpp
std::vector<int> numbers = {3, 1, 4, 1, 5, 9, 2, 6};

// ❌ C++17: Iterator pairs
std::sort(numbers.begin(), numbers.end());
auto it = std::find(numbers.begin(), numbers.end(), 5);

// ✅ C++20: Ranges
std::ranges::sort(numbers);
auto it = std::ranges::find(numbers, 5);
```

**Categories of Range Algorithms:**

| Category | Examples |
|----------|----------|
| **Non-modifying** | `find`, `count`, `all_of`, `any_of`, `none_of`, `for_each` |
| **Modifying** | `copy`, `fill`, `replace`, `remove`, `unique`, `reverse` |
| **Sorting** | `sort`, `stable_sort`, `partial_sort`, `nth_element` |
| **Binary search** | `lower_bound`, `upper_bound`, `binary_search`, `equal_range` |
| **Set operations** | `set_union`, `set_intersection`, `set_difference` |
| **Heap operations** | `make_heap`, `push_heap`, `pop_heap`, `sort_heap` |
| **Min/max** | `min`, `max`, `minmax`, `min_element`, `max_element` |
| **Permutations** | `next_permutation`, `prev_permutation` |

**Return Values:**

```cpp
// Traditional: Returns iterator
auto it = std::find(vec.begin(), vec.end(), 5);

// Ranges: Returns iterator + sentinel (subrange)
auto [it, end] = std::ranges::find(vec, 5);

// Some algorithms return more:
auto [min_it, max_it] = std::ranges::minmax_element(vec);

// Some return results:
auto [in_it, out_it] = std::ranges::copy(source, dest.begin());
```

---

#### 6. Projections - Transform Before Applying

**What is a Projection?**

A projection is a callable that transforms an element **before** the algorithm's operation is applied.

**Without Projections (C++17):**

```cpp
struct Person {
    std::string name;
    int age;
};

std::vector<Person> people = {{"Alice", 30}, {"Bob", 25}, {"Charlie", 35}};

// Sort by age - need to write custom comparator
std::sort(people.begin(), people.end(),
    [](const Person& a, const Person& b) {
        return a.age < b.age;  // Compare ages
    });
```

**With Projections (C++20):**

```cpp
// Sort by age - just project to age
std::ranges::sort(people, std::less{}, &Person::age);
//                          ^^^^^^^^^^^  ^^^^^^^^^^^^
//                          comparator   projection

// Or with lambda:
std::ranges::sort(people, {}, [](const Person& p) { return p.age; });
```

**Projection Parameter:**

All range algorithms have this signature pattern:

```cpp
template<std::ranges::range R, typename Proj = std::identity>
void algorithm(R&& r, /* other params */, Proj proj = {});
```

**Common Use Cases:**

```cpp
std::vector<std::pair<std::string, int>> pairs = {
    {"apple", 5}, {"banana", 2}, {"cherry", 8}
};

// 1. Sort by second element (value)
std::ranges::sort(pairs, {}, [](const auto& p) { return p.second; });

// 2. Find by first element (key)
auto it = std::ranges::find(pairs, "banana", &std::pair<std::string, int>::first);

// 3. Count elements where second > 5
auto count = std::ranges::count_if(pairs,
    [](int val) { return val > 5; },
    [](const auto& p) { return p.second; }  // projection
);

// 4. Transform using projection
std::vector<std::string> names;
std::ranges::copy(pairs | std::views::transform(&std::pair<std::string, int>::first),
                  std::back_inserter(names));
```

**Projection with Views:**

```cpp
// Projection in views::filter
auto adults = people
    | views::filter([](int age) { return age >= 18; }, &Person::age);
//                  ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^  ^^^^^^^^^^^^
//                  predicate operates on int       projection to age
```

---

#### 7. Lazy Evaluation - Compute On-Demand

**What is Lazy Evaluation?**

Views don't compute results when created - they compute elements **only when iterated**.

**Demonstration:**

```cpp
#include <iostream>
#include <vector>
#include <ranges>

std::vector<int> numbers = {1, 2, 3, 4, 5, 6, 7, 8, 9, 10};

auto expensive_transform = [](int n) {
    std::cout << "Transforming " << n << '\n';  // Side effect to observe calls
    return n * n;
};

// Creating the view - NO transformations happen yet!
auto view = numbers | std::views::transform(expensive_transform);
std::cout << "View created\n";

// Iterating - transformations happen NOW (on-demand)
for (auto val : view | std::views::take(3)) {
    std::cout << "Got: " << val << '\n';
}

/* Output:
View created
Transforming 1
Got: 1
Transforming 2
Got: 4
Transforming 3
Got: 9
*/
// Only 3 transformations, not 10!
```

**Contrast with Eager Evaluation:**

```cpp
// Eager (traditional): Computes all results immediately
std::vector<int> results;
std::transform(numbers.begin(), numbers.end(), std::back_inserter(results),
    expensive_transform);
// All 10 transformations happen here

// Then take first 3
std::vector<int> first_three(results.begin(), results.begin() + 3);

/* Output:
Transforming 1
Transforming 2
Transforming 3
Transforming 4
Transforming 5
Transforming 6
Transforming 7
Transforming 8
Transforming 9
Transforming 10
*/
// Wasted 7 computations!
```

**Performance Implications:**

```cpp
std::vector<int> huge_vector(1'000'000);
std::iota(huge_vector.begin(), huge_vector.end(), 1);

// Lazy: Only processes first 10 elements
auto first_10_evens = huge_vector
    | views::filter([](int n) { return n % 2 == 0; })
    | views::take(10);
// Cost: ~20 iterations to find 10 even numbers

// Eager: Processes all 1,000,000 elements
std::vector<int> all_evens;
std::copy_if(huge_vector.begin(), huge_vector.end(),
    std::back_inserter(all_evens), [](int n) { return n % 2 == 0; });
std::vector<int> first_10(all_evens.begin(), all_evens.begin() + 10);
// Cost: 1,000,000 iterations + memory for 500,000 elements!
```

---

#### 8. Common Range Patterns and Idioms

**Pattern 1: Filter + Transform + Collect**

```cpp
std::vector<int> numbers = {1, 2, 3, 4, 5, 6, 7, 8, 9, 10};

// Get squares of even numbers
auto result = numbers
    | views::filter([](int n) { return n % 2 == 0; })
    | views::transform([](int n) { return n * n; });

// Materialize to vector
std::vector<int> vec(result.begin(), result.end());
// Or in C++23:
// std::vector<int> vec = result | std::ranges::to<std::vector>();
```

**Pattern 2: Infinite Sequences**

```cpp
// Generate first 10 Fibonacci numbers
auto fibs = views::iota(0)
    | views::transform([](int n) {
        int a = 0, b = 1;
        for (int i = 0; i < n; ++i) {
            int temp = a + b;
            a = b;
            b = temp;
        }
        return a;
    })
    | views::take(10);
// Lazy! Only computes 10 values even though iota is infinite
```

**Pattern 3: Flatten Nested Structures**

```cpp
std::vector<std::vector<int>> nested = {{1, 2}, {3, 4, 5}, {6}};

auto flat = nested | views::join;
// Result: {1, 2, 3, 4, 5, 6}
```

**Pattern 4: Working with Pairs/Tuples**

```cpp
std::map<std::string, int> ages = {{"Alice", 30}, {"Bob", 25}};

// Get all names
auto names = ages | views::keys;

// Get all ages > 26
auto adult_ages = ages
    | views::values
    | views::filter([](int age) { return age > 26; });
```

**Pattern 5: Split Strings**

```cpp
std::string text = "hello world cpp ranges";

auto words = text | views::split(' ');
// Each element is a subrange of the original string

for (auto word : words) {
    std::cout << std::string_view(word.begin(), word.end()) << '\n';
}
```

**Pattern 6: Zip (C++23)**

```cpp
// C++23 feature
std::vector<int> ids = {1, 2, 3};
std::vector<std::string> names = {"Alice", "Bob", "Charlie"};

for (auto [id, name] : views::zip(ids, names)) {
    std::cout << id << ": " << name << '\n';
}
```

---

#### 9. Custom Views - Creating Your Own Range Adaptors

**Simple Custom View:**

```cpp
// View that repeats each element N times
template<std::ranges::input_range R>
class repeat_view : public std::ranges::view_interface<repeat_view<R>> {
    R base_;
    std::size_t count_;

public:
    repeat_view(R base, std::size_t count)
        : base_(std::move(base)), count_(count) {}

    auto begin() const { return iterator(*this, std::ranges::begin(base_)); }
    auto end() const { return std::ranges::end(base_); }

    class iterator {
        const repeat_view* parent_;
        std::ranges::iterator_t<R> it_;
        std::size_t current_count_ = 0;

    public:
        using value_type = std::ranges::range_value_t<R>;
        using difference_type = std::ptrdiff_t;

        iterator(const repeat_view& parent, std::ranges::iterator_t<R> it)
            : parent_(&parent), it_(it) {}

        decltype(auto) operator*() const { return *it_; }

        iterator& operator++() {
            if (++current_count_ >= parent_->count_) {
                ++it_;
                current_count_ = 0;
            }
            return *this;
        }

        iterator operator++(int) { auto tmp = *this; ++*this; return tmp; }

        bool operator==(const iterator& other) const {
            return it_ == other.it_ && current_count_ == other.current_count_;
        }
    };
};

// Deduction guide
template<typename R>
repeat_view(R&&, std::size_t) -> repeat_view<std::views::all_t<R>>;

// Usage:
std::vector<int> v = {1, 2, 3};
repeat_view view(v, 2);
// Result: {1, 1, 2, 2, 3, 3}
```

**Range Adaptor Closure Object:**

```cpp
// Make it pipeable
namespace views {
    struct repeat_adaptor {
        template<std::ranges::viewable_range R>
        auto operator()(R&& r, std::size_t n) const {
            return repeat_view(std::forward<R>(r), n);
        }

        auto operator()(std::size_t n) const {
            return [n](auto&& r) {
                return repeat_view(std::forward<decltype(r)>(r), n);
            };
        }
    };

    inline constexpr repeat_adaptor repeat;
}

// Now pipeable:
auto result = std::vector{1, 2, 3} | views::repeat(2);
```

---

#### 10. Performance Considerations and Best Practices

**Best Practices:**

1. **Use views for pipelines, materialize when needed:**
   ```cpp
   // Good: Keep as view for further processing
   auto view = data | views::filter(pred) | views::transform(func);

   // Materialize only when storing or passing to non-range APIs
   std::vector<int> result(view.begin(), view.end());
   ```

2. **Beware of dangling references:**
   ```cpp
   // ❌ BAD: Temporary vector is destroyed, view dangles
   auto view = std::vector{1, 2, 3} | views::filter(is_even);

   // ✅ GOOD: Store the range
   auto vec = std::vector{1, 2, 3};
   auto view = vec | views::filter(is_even);
   ```

3. **Use `views::all` for owned ranges:**
   ```cpp
   auto get_view() {
       std::vector<int> vec{1, 2, 3};
       return views::all(std::move(vec));  // View takes ownership
   }
   ```

4. **Prefer range algorithms over traditional ones:**
   ```cpp
   // Better error messages, cleaner syntax
   std::ranges::sort(vec);
   std::ranges::find(vec, 42);
   ```

5. **Use projections instead of custom comparators:**
   ```cpp
   // Clear and concise
   std::ranges::sort(people, {}, &Person::age);
   ```

**Performance Gotchas:**

```cpp
// ❌ Multiple iterations recompute
auto view = vec | views::transform(expensive_func);
for (auto x : view) { /* ... */ }
for (auto x : view) { /* ... */ }  // Recomputes all!

// ✅ Materialize if iterating multiple times
std::vector<int> computed(view.begin(), view.end());
for (auto x : computed) { /* ... */ }
for (auto x : computed) { /* ... */ }  // No recomputation
```

---

### EDGE_CASES: Subtle Behaviors and Tricky Scenarios

---

#### Edge Case 1: Dangling Iterators from Temporary Ranges

**The Problem:**

```cpp
auto get_filtered() {
    return std::vector{1, 2, 3, 4, 5}
        | views::filter([](int n) { return n % 2 == 0; });
}

int main() {
    auto view = get_filtered();

    // ❌ UNDEFINED BEHAVIOR: vector was destroyed after get_filtered() returned
    for (auto x : view) {  // Accessing dangling memory!
        std::cout << x;
    }
}
```

**Why It Happens:**
- Views are **non-owning** - they reference the underlying range
- The temporary `std::vector` is destroyed after `get_filtered()` returns
- The view holds a dangling reference

**Solution 1: Return owned range:**

```cpp
auto get_filtered() {
    auto vec = std::vector{1, 2, 3, 4, 5};
    return vec | views::filter([](int n) { return n % 2 == 0; })
               | std::ranges::to<std::vector>();  // C++23
}
```

**Solution 2: Use `views::owning_view` (C++23):**

```cpp
auto get_filtered() {
    return std::vector{1, 2, 3, 4, 5}
        | views::owning  // Takes ownership of the vector
        | views::filter([](int n) { return n % 2 == 0; });
}
```

**Detection:**
C++20 has compile-time checks for some dangling cases:

```cpp
// ❌ Compile error in C++20:
auto it = std::ranges::begin(std::vector{1, 2, 3});
// Returns std::ranges::dangling instead of iterator
```

---

#### Edge Case 2: View Lifetime and Capturing Lambdas

**The Problem:**

```cpp
auto create_filter(int threshold) {
    // ❌ Lambda captures threshold by reference!
    return [&threshold](int n) { return n > threshold; };
}

int main() {
    auto pred = create_filter(5);  // threshold is on stack
    // create_filter() returns, threshold destroyed

    std::vector<int> vec{1, 3, 7, 9};
    auto view = vec | views::filter(pred);  // Captures dangling reference!

    for (auto x : view) {  // ❌ UNDEFINED BEHAVIOR
        std::cout << x;
    }
}
```

**Solution:**

```cpp
auto create_filter(int threshold) {
    // ✅ Capture by value
    return [threshold](int n) { return n > threshold; };
}
```

---

#### Edge Case 3: `views::filter` with Modifying Predicate

**The Problem:**

```cpp
int count = 0;
auto view = vec | views::filter([&count](int n) {
    ++count;  // Side effect!
    return n % 2 == 0;
});

// ❌ Count is unpredictable!
for (auto x : view) { std::cout << x; }
std::cout << "Count: " << count << '\n';  // How many times was predicate called?

// Iterating again gives different count!
for (auto x : view) { std::cout << x; }
std::cout << "Count: " << count << '\n';  // Count increased!
```

**Why It Happens:**
- Lazy evaluation means predicate is called during iteration
- Multiple iterations call predicate multiple times
- Stateful predicates lead to non-deterministic behavior

**Solution:**
Predicates should be pure functions (no side effects).

---

#### Edge Case 4: Range Concept Requirements and View Composition

**The Problem:**

```cpp
std::forward_list<int> fwd{1, 2, 3, 4, 5};

// ✅ Works: forward_list supports forward_range
auto v1 = fwd | views::filter([](int n) { return n > 2; });

// ❌ Compile error: reverse requires bidirectional_range
auto v2 = fwd | views::reverse;
// forward_list only provides forward iterators!
```

**Type Degradation:**

```cpp
std::vector<int> vec{1, 2, 3};  // contiguous_range

auto v1 = vec | views::filter([](int) { return true; });
// v1 is only bidirectional_range (filter can't maintain contiguity)

auto v2 = v1 | views::take(2);
// v2 is also bidirectional_range (inherits weaker category)
```

**Rule:**
View composition can only maintain or weaken range categories, never strengthen them.

---

#### Edge Case 5: `views::transform` Return Type Deduction

**The Problem:**

```cpp
std::vector<int> vec{1, 2, 3};

// ❌ Ambiguous: Lambda returns different types based on input
auto view = vec | views::transform([](int n) {
    if (n % 2 == 0)
        return n;      // returns int
    else
        return n * 1.5;  // returns double
});
// Compilation error: inconsistent return types
```

**Solution:**

```cpp
// ✅ Explicit return type
auto view = vec | views::transform([](int n) -> double {
    if (n % 2 == 0)
        return n;
    else
        return n * 1.5;
});
```

---

#### Edge Case 6: `views::split` Produces Views of Views

**The Problem:**

```cpp
std::string text = "a b c";
auto words = text | views::split(' ');

// ❌ Can't use directly as strings
for (auto word : words) {
    std::cout << word << '\n';  // Compile error: word is a subrange<string::iterator>
}
```

**Solution:**

```cpp
// ✅ Convert subrange to string_view
for (auto word : text | views::split(' ')) {
    std::string_view sv(word.begin(), word.end());
    std::cout << sv << '\n';
}

// Or transform:
auto string_words = text
    | views::split(' ')
    | views::transform([](auto rng) {
        return std::string_view(rng.begin(), rng.end());
    });
```

---

#### Edge Case 7: Infinite Ranges and Early Termination

**The Problem:**

```cpp
// Infinite sequence
auto infinite = views::iota(1);

// ❌ This will never finish!
std::vector<int> vec(infinite.begin(), infinite.end());
```

**Solution:**

```cpp
// ✅ Limit with take
auto finite = views::iota(1) | views::take(100);
std::vector<int> vec(finite.begin(), finite.end());

// ✅ Or use take_while
auto while_small = views::iota(1)
    | views::take_while([](int n) { return n < 100; });
```

---

### CODE_EXAMPLES: Practical Range Pipelines

---

#### Example 1: Text Processing Pipeline

**Problem:** Parse log file, extract error messages, count by error code.

```cpp
#include <iostream>
#include <fstream>
#include <ranges>
#include <map>
#include <string>
#include <sstream>

namespace views = std::views;

int main() {
    std::ifstream file("server.log");
    std::string line;
    std::map<int, int> error_counts;

    while (std::getline(file, line)) {
        // Pipeline: filter errors → extract code → count
        if (line.find("ERROR") != std::string::npos) {
            // Extract error code (assume format "ERROR [123]: message")
            auto start = line.find('[');
            auto end = line.find(']');
            if (start != std::string::npos && end != std::string::npos) {
                int code = std::stoi(line.substr(start + 1, end - start - 1));
                ++error_counts[code];
            }
        }
    }

    // Find top 5 most common errors
    std::vector<std::pair<int, int>> sorted(error_counts.begin(), error_counts.end());
    std::ranges::sort(sorted, std::greater{}, &std::pair<int, int>::second);

    auto top5 = sorted | views::take(5);

    for (auto [code, count] : top5) {
        std::cout << "Error " << code << ": " << count << " occurrences\n";
    }
}
```

**Key Techniques:**
- Range-based text parsing
- Projection with `&std::pair<int, int>::second`
- `views::take` for limiting results

---

#### Example 2: CSV Data Transformation

**Problem:** Read CSV, parse rows, filter by criteria, transform to output format.

```cpp
#include <iostream>
#include <ranges>
#include <string>
#include <vector>
#include <sstream>

namespace views = std::views;

struct Person {
    std::string name;
    int age;
    double salary;
};

Person parse_csv_line(std::string_view line) {
    std::vector<std::string> fields;
    std::string field;
    std::stringstream ss(std::string(line));

    while (std::getline(ss, field, ',')) {
        fields.push_back(field);
    }

    return {fields[0], std::stoi(fields[1]), std::stod(fields[2])};
}

int main() {
    std::vector<std::string> csv_lines = {
        "Alice,30,75000.0",
        "Bob,25,55000.0",
        "Charlie,35,95000.0",
        "Diana,28,65000.0",
        "Eve,32,85000.0"
    };

    // Pipeline: parse → filter age > 28 → sort by salary → format output
    auto high_earners = csv_lines
        | views::transform(parse_csv_line)
        | views::filter([](const Person& p) { return p.age > 28; })
        | views::transform([](const Person& p) {
            return std::format("{} (age {}): ${:.2f}", p.name, p.age, p.salary);
        });

    // Sort requires materializing
    std::vector<Person> people;
    for (const auto& line : csv_lines | views::transform(parse_csv_line)) {
        if (line.age > 28) people.push_back(line);
    }
    std::ranges::sort(people, {}, &Person::salary);

    for (const auto& p : people) {
        std::cout << std::format("{} (age {}): ${:.2f}\n", p.name, p.age, p.salary);
    }
}

/* Output:
Charlie (age 35): $95000.00
Eve (age 32): $85000.00
Alice (age 30): $75000.00
*/
```

---

#### Example 3: Graph Traversal with Ranges

**Problem:** BFS traversal using range adapters.

```cpp
#include <iostream>
#include <ranges>
#include <vector>
#include <queue>
#include <unordered_set>

namespace views = std::views;

class Graph {
    std::vector<std::vector<int>> adj_;

public:
    Graph(int n) : adj_(n) {}

    void add_edge(int u, int v) {
        adj_[u].push_back(v);
    }

    auto neighbors(int node) const {
        return adj_[node] | views::all;
    }

    auto bfs(int start) const {
        std::vector<int> result;
        std::queue<int> q;
        std::unordered_set<int> visited;

        q.push(start);
        visited.insert(start);

        while (!q.empty()) {
            int node = q.front();
            q.pop();
            result.push_back(node);

            for (int neighbor : neighbors(node)) {
                if (!visited.contains(neighbor)) {
                    visited.insert(neighbor);
                    q.push(neighbor);
                }
            }
        }

        return result;
    }
};

int main() {
    Graph g(7);
    g.add_edge(0, 1);
    g.add_edge(0, 2);
    g.add_edge(1, 3);
    g.add_edge(1, 4);
    g.add_edge(2, 5);
    g.add_edge(2, 6);

    auto traversal = g.bfs(0);

    std::cout << "BFS traversal: ";
    for (int node : traversal) {
        std::cout << node << " ";
    }
    std::cout << '\n';
}

/* Output:
BFS traversal: 0 1 2 3 4 5 6
*/
```

---

#### Example 4: Matrix Operations with Ranges

**Problem:** Flatten 2D matrix, filter, transform, reshape.

```cpp
#include <iostream>
#include <ranges>
#include <vector>

namespace views = std::views;

int main() {
    std::vector<std::vector<int>> matrix = {
        {1, 2, 3, 4},
        {5, 6, 7, 8},
        {9, 10, 11, 12}
    };

    // Flatten → filter even → square → collect
    auto result = matrix
        | views::join                                      // Flatten
        | views::filter([](int n) { return n % 2 == 0; })  // Keep even
        | views::transform([](int n) { return n * n; });   // Square

    std::vector<int> vec(result.begin(), result.end());

    std::cout << "Result: ";
    for (int val : vec) {
        std::cout << val << " ";
    }
    std::cout << '\n';
}

/* Output:
Result: 4 16 36 64 100 144
*/
```

---

#### Example 5: Sliding Window with Ranges

**Problem:** Compute moving average over sliding window.

```cpp
#include <iostream>
#include <ranges>
#include <vector>
#include <numeric>

namespace views = std::views;

template<std::ranges::forward_range R>
auto sliding_window(R&& range, std::size_t window_size) {
    return views::iota(0u, std::ranges::size(range) - window_size + 1)
        | views::transform([&range, window_size](std::size_t i) {
            auto start = std::ranges::begin(range) + i;
            return std::ranges::subrange(start, start + window_size);
        });
}

int main() {
    std::vector<int> data = {1, 2, 3, 4, 5, 6, 7, 8, 9, 10};
    constexpr std::size_t window_size = 3;

    std::cout << "Moving average (window=" << window_size << "):\n";

    for (auto window : sliding_window(data, window_size)) {
        double avg = std::accumulate(window.begin(), window.end(), 0.0) / window_size;
        std::cout << avg << " ";
    }
    std::cout << '\n';
}

/* Output:
Moving average (window=3):
2 3 4 5 6 7 8 9
*/
```

---

#### Example 6: Cartesian Product with Ranges (C++23)

**Problem:** Generate all combinations of two sequences.

```cpp
#include <iostream>
#include <ranges>
#include <vector>

namespace views = std::views;

int main() {
    std::vector<int> a = {1, 2, 3};
    std::vector<char> b = {'A', 'B'};

    // Cartesian product
    for (int x : a) {
        for (char y : b) {
            std::cout << "(" << x << ", " << y << ") ";
        }
    }
    std::cout << '\n';

    // Using ranges (C++23 views::cartesian_product)
    // for (auto [x, y] : views::cartesian_product(a, b)) {
    //     std::cout << "(" << x << ", " << y << ") ";
    // }
}

/* Output:
(1, A) (1, B) (2, A) (2, B) (3, A) (3, B)
*/
```

---

#### Example 7: Fibonacci Sequence with Ranges

**Problem:** Generate Fibonacci numbers lazily.

```cpp
#include <iostream>
#include <ranges>

namespace views = std::views;

auto fibonacci() {
    return views::iota(0)
        | views::transform([](int n) {
            int a = 0, b = 1;
            for (int i = 0; i < n; ++i) {
                int next = a + b;
                a = b;
                b = next;
            }
            return a;
        });
}

int main() {
    auto first_20_fibs = fibonacci() | views::take(20);

    std::cout << "First 20 Fibonacci numbers:\n";
    for (int fib : first_20_fibs) {
        std::cout << fib << " ";
    }
    std::cout << '\n';
}

/* Output:
First 20 Fibonacci numbers:
0 1 1 2 3 5 8 13 21 34 55 89 144 233 377 610 987 1597 2584 4181
*/
```

---

#### Example 8: Group By with Ranges

**Problem:** Group elements by a key function.

```cpp
#include <iostream>
#include <ranges>
#include <vector>
#include <map>

namespace views = std::views;

template<std::ranges::forward_range R, typename KeyFunc>
auto group_by(R&& range, KeyFunc key_func) {
    using Key = std::invoke_result_t<KeyFunc, std::ranges::range_value_t<R>>;
    std::map<Key, std::vector<std::ranges::range_value_t<R>>> groups;

    for (auto&& elem : range) {
        groups[key_func(elem)].push_back(elem);
    }

    return groups;
}

int main() {
    std::vector<int> numbers = {1, 2, 3, 4, 5, 6, 7, 8, 9, 10};

    // Group by remainder when divided by 3
    auto groups = group_by(numbers, [](int n) { return n % 3; });

    for (const auto& [key, values] : groups) {
        std::cout << "Group " << key << ": ";
        for (int val : values) {
            std::cout << val << " ";
        }
        std::cout << '\n';
    }
}

/* Output:
Group 0: 3 6 9
Group 1: 1 4 7 10
Group 2: 2 5 8
*/
```

---

#### Example 9: Prime Number Sieve with Ranges

**Problem:** Generate prime numbers using sieve of Eratosthenes.

```cpp
#include <iostream>
#include <ranges>
#include <vector>

namespace views = std::views;

auto primes_up_to(int n) {
    std::vector<bool> is_prime(n + 1, true);
    is_prime[0] = is_prime[1] = false;

    for (int i = 2; i * i <= n; ++i) {
        if (is_prime[i]) {
            for (int j = i * i; j <= n; j += i) {
                is_prime[j] = false;
            }
        }
    }

    return views::iota(0, n + 1)
        | views::filter([is_prime](int i) { return is_prime[i]; });
}

int main() {
    auto first_10_primes = primes_up_to(100) | views::take(10);

    std::cout << "First 10 primes: ";
    for (int prime : first_10_primes) {
        std::cout << prime << " ";
    }
    std::cout << '\n';
}

/* Output:
First 10 primes: 2 3 5 7 11 13 17 19 23 29
*/
```

---

#### Example 10: JSON-Like Data Processing

**Problem:** Process nested JSON-like structure.

```cpp
#include <iostream>
#include <ranges>
#include <vector>
#include <string>
#include <variant>

namespace views = std::views;

struct User {
    std::string name;
    int age;
    std::vector<std::string> hobbies;
};

int main() {
    std::vector<User> users = {
        {"Alice", 30, {"reading", "gaming", "cooking"}},
        {"Bob", 25, {"gaming", "sports"}},
        {"Charlie", 35, {"reading", "music", "travel"}},
        {"Diana", 28, {"cooking", "travel"}}
    };

    // Find all unique hobbies of users aged > 27
    std::vector<std::string> all_hobbies;

    for (const auto& user : users | views::filter([](const User& u) { return u.age > 27; })) {
        for (const auto& hobby : user.hobbies) {
            all_hobbies.push_back(hobby);
        }
    }

    std::ranges::sort(all_hobbies);
    auto unique_range = std::ranges::unique(all_hobbies);
    all_hobbies.erase(unique_range.begin(), unique_range.end());

    std::cout << "Unique hobbies of users > 27:\n";
    for (const auto& hobby : all_hobbies) {
        std::cout << "- " << hobby << '\n';
    }
}

/* Output:
Unique hobbies of users > 27:
- cooking
- gaming
- music
- reading
- travel
*/
```

---

### QUICK_REFERENCE: Ranges and Views Cheat Sheet

---

#### Standard Views Summary

| View | Description | Example | Output |
|------|-------------|---------|--------|
| `all` | Convert range to view | `views::all(vec)` | All elements as view |
| `filter` | Keep elements matching predicate | `views::filter(is_even)` | Even elements |
| `transform` | Apply function | `views::transform(square)` | Squared elements |
| `take` | First N elements | `views::take(5)` | First 5 elements |
| `take_while` | While predicate true | `views::take_while(is_positive)` | Until non-positive |
| `drop` | Skip first N | `views::drop(3)` | All except first 3 |
| `drop_while` | Skip while predicate true | `views::drop_while(is_negative)` | After first non-negative |
| `reverse` | Reverse order | `views::reverse` | Reversed elements |
| `join` | Flatten nested ranges | `views::join` | Flattened sequence |
| `split` | Split by delimiter | `views::split(' ')` | Subranges split by space |
| `keys` | Extract keys from pairs | `views::keys` | All keys |
| `values` | Extract values from pairs | `views::values` | All values |
| `elements<N>` | Extract Nth element of tuple | `views::elements<0>` | First elements |
| `iota` | Generate sequence | `views::iota(1, 10)` | 1, 2, ..., 9 |

#### Range Concepts Hierarchy

```
range
  ├─ input_range (single-pass read)
  ├─ forward_range (multi-pass read)
  │   ├─ bidirectional_range (can go backwards)
  │   │   ├─ random_access_range (O(1) jump)
  │   │   │   └─ contiguous_range (sequential memory)
```

#### Algorithm Projection Pattern

```cpp
std::ranges::algorithm(
    range,
    comparator_or_predicate,  // Operates on projected values
    projection                 // Extracts/transforms element
);

// Example:
std::ranges::sort(people, {}, &Person::age);
//                        ^^  ^^^^^^^^^^^
//                     comparator projection
```

#### Performance Characteristics

| Operation | Views | Containers |
|-----------|-------|------------|
| Construction | O(1) | O(n) |
| Copy | O(1) | O(n) |
| Move | O(1) | O(1) |
| Element access | Computed | Stored |
| Multiple iterations | Recomputes | Cached |
| Memory | Minimal | Full storage |

#### Common Patterns

**Filter + Transform + Collect:**
```cpp
auto result = data
    | views::filter(predicate)
    | views::transform(function)
    | views::take(n);

std::vector<T> vec(result.begin(), result.end());
```

**Infinite Sequence:**
```cpp
auto first_n = views::iota(start)
    | views::transform(function)
    | views::take(n);
```

**Flatten Nested:**
```cpp
auto flat = nested_range | views::join;
```

**Split String:**
```cpp
for (auto word : text | views::split(' ')) {
    std::string_view sv(word.begin(), word.end());
}
```

---

**End of Topic 2: Ranges and Views** (2,500+ lines)
