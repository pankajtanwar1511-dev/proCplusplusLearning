### PRACTICE_TASKS: Output Prediction and Code Analysis

#### Q1
Analyze the following functor and identify the issue:
```cpp
class Counter {
    int count;
public:
    Counter() : count(0) {}
    void operator()(int x) const { count++; }
    int getCount() const { return count; }
};
```

**Answer:**
```
Const correctness violation: operator() is const but modifies count
Compilation error: cannot modify non-mutable member in const function
```

**Explanation:**
- **The problem:**
  - `operator()` declared `const`
  - Attempts to modify `count` with `count++`
  - **const member functions cannot modify non-mutable members**
  - Compilation error: "discards qualifiers" or "cannot assign to non-static data member within const member function"
- **Why this happens:**
  ```cpp
  void operator()(int x) const {  // const promise: "I won't modify *this"
      count++;  // VIOLATES const promise!
  }
  ```
- **Solution 1: Make count mutable**
  ```cpp
  class Counter {
      mutable int count;  // Can be modified even in const context
  public:
      Counter() : count(0) {}
      void operator()(int x) const { count++; }  // OK now
      int getCount() const { return count; }
  };
  ```
- **Solution 2: Remove const from operator()**
  ```cpp
  class Counter {
      int count;
  public:
      Counter() : count(0) {}
      void operator()(int x) { count++; }  // Non-const, can modify
      int getCount() const { return count; }
  };
  ```
- **When to use each solution:**
  - **mutable:** When functor logically const (side effects are implementation detail)
    - Example: Caching, logging, counting
    - Allows use with const functors in STL algorithms
  - **Non-const operator():** When modification is core semantics
    - Example: Accumulators, state machines
    - Problem: Cannot use with algorithms that copy functors
- **STL algorithm implications:**
  ```cpp
  Counter c;
  std::for_each(vec.begin(), vec.end(), c);  // Copies c!
  std::cout << c.getCount();  // 0, not vec.size()!
  ```
  - STL algorithms pass functors **by value** (copy)
  - Modifications happen to copy, not original
- **Fix with std::ref:**
  ```cpp
  std::for_each(vec.begin(), vec.end(), std::ref(c));  // Pass by reference
  std::cout << c.getCount();  // Correct count
  ```
- **Key Concept:** Const operator() cannot modify non-mutable members; use mutable for implementation details (caching, counting); non-const operator() prevents use with const functors

---

#### Q2
What will be the output of this code? Explain why.
```cpp
class Multiplier {
    int factor;
public:
    Multiplier(int f) : factor(f) {}
    int operator()(int x) { return x * factor; }
};

std::vector<int> vec = {1, 2, 3};
Multiplier m(2);
std::for_each(vec.begin(), vec.end(), m);
std::cout << m(5);
```

**Answer:**
```
Output: 10
Multiplier returns value, not stores it; for_each discards return values
Original m unchanged after for_each
```

**Explanation:**
- **Code execution flow:**
  1. `Multiplier m(2)` → factor = 2
  2. `std::for_each(vec.begin(), vec.end(), m)` →  Passes m **by value** (copy)
  3. for_each calls `m(1)` → returns 2, discarded
  4. for_each calls `m(2)` → returns 4, discarded
  5. for_each calls `m(3)` → returns 6, discarded
  6. for_each ends, copy destroyed
  7. `m(5)` → returns 5 * 2 = **10**
- **Why output is 10:**
  - operator() returns result, doesn't store it
  - for_each discards return values (designed for side effects, not transformations)
  - Original m unchanged (for_each uses copy)
- **Common misconception:**
  ```cpp
  // Thinking m "accumulates" somehow?
  std::for_each(vec.begin(), vec.end(), m);
  // m is unchanged here!
  ```
- **for_each signature:**
  ```cpp
  template<class InputIt, class UnaryFunction>
  UnaryFunction for_each(InputIt first, InputIt last, UnaryFunction f);
  // Takes functor by VALUE, returns the COPY
  ```
- **If you want the modified functor:**
  ```cpp
  m = std::for_each(vec.begin(), vec.end(), m);  // Get returned copy
  ```
- **Better alternative: std::transform (for transformations)**
  ```cpp
  std::vector<int> vec = {1, 2, 3};
  std::vector<int> result;
  Multiplier m(2);
  std::transform(vec.begin(), vec.end(), std::back_inserter(result), m);
  // result = {2, 4, 6}
  ```
- **for_each vs transform:**
  | Algorithm | Purpose | Return value usage |
  |-----------|---------|-------------------|
  | for_each | Side effects | Discarded |
  | transform | Transformation | Stored in output |
- **Use case for for_each:**
  ```cpp
  class Printer {
  public:
      void operator()(int x) {  // void return
          std::cout << x << " ";
      }
  };
  std::for_each(vec.begin(), vec.end(), Printer());  // Side effect: print
  ```
- **Key Concept:** for_each passes functor by value and discards return values; designed for side effects, not transformations; use transform for value transformations

---

#### Q3
Fix the following thread-unsafe functor:
```cpp
class Cache {
    std::unordered_map<int, int> data;
public:
    int operator()(int key) {
        if (data.count(key)) return data[key];
        int value = expensiveCompute(key);
        data[key] = value;
        return value;
    }
};
```

**Answer:**
```cpp
class Cache {
    std::unordered_map<int, int> data;
    mutable std::shared_mutex mtx;  // Reader-writer lock
public:
    int operator()(int key) const {
        // Try read-only path first (shared lock)
        {
            std::shared_lock lock(mtx);
            auto it = data.find(key);
            if (it != data.end()) return it->second;
        }

        // Not found, compute and cache (exclusive lock)
        std::unique_lock lock(mtx);
        // Double-check (another thread might have computed while waiting)
        auto it = data.find(key);
        if (it != data.end()) return it->second;

        int value = expensiveCompute(key);
        data[key] = value;
        return value;
    }
};
```

**Explanation:**
- **Original problems:**
  1. **Data race on unordered_map:**
     - Multiple threads call operator() simultaneously
     - Concurrent reads + writes to data map
     - `data.count()`, `data[key]` read/write → undefined behavior
  2. **Possible outcomes:**
     - Iterator invalidation during concurrent modification
     - Corrupted hash table
     - Crash
     - Wrong values returned
- **Thread-safe solution requirements:**
  1. Protect all map access
  2. Allow concurrent reads (many threads checking cache)
  3. Exclusive write (only one thread computing/inserting)
- **Solution 1: shared_mutex (best for read-heavy workload)**
  ```cpp
  // Multiple threads can hold shared_lock (read)
  // Only one thread can hold unique_lock (write)
  // Exclusive with each other
  ```
- **Why double-checked locking:**
  ```cpp
  // Thread A: checks cache → miss, releases shared lock, waits for unique lock
  // Thread B: checks cache → miss, releases shared lock, computes, inserts, releases unique lock
  // Thread A: acquires unique lock, must check AGAIN (B already computed!)
  ```
- **Solution 2: Simple mutex (simpler, slower for concurrent reads)**
  ```cpp
  class Cache {
      std::unordered_map<int, int> data;
      mutable std::mutex mtx;
  public:
      int operator()(int key) const {
          std::lock_guard lock(mtx);  // Exclusive lock always
          auto it = data.find(key);
          if (it != data.end()) return it->second;

          int value = expensiveCompute(key);
          data[key] = value;
          return value;
      }
  };
  ```
- **Performance comparison:**
  ```
  shared_mutex: 100 concurrent reads OK
  mutex: 100 reads serialized (1 at a time)

  Cache hit rate 90%:
  - shared_mutex: 10x faster (concurrent reads)
  - mutex: All requests serialized
  ```
- **Why mutable mtx:**
  - operator() should be const (doesn't change cache logically)
  - Synchronization is implementation detail
  - mutable allows locking in const functions
- **Alternative: Thread-local caching**
  ```cpp
  thread_local std::unordered_map<int, int> localCache;
  // No synchronization needed, but duplicates cached data per thread
  ```
- **Key Concept:** Concurrent map access causes data races; use shared_mutex for reader-writer pattern (concurrent reads, exclusive writes); double-check after acquiring write lock

---

#### Q4
Optimize this memoization functor to avoid double hash lookup:
```cpp
int operator()(int x) const {
    if (cache.count(x)) {
        return cache[x];
    }
    int result = compute(x);
    cache[x] = result;
    return result;
}
```

**Answer:**
```cpp
int operator()(int x) const {
    auto [it, inserted] = cache.try_emplace(x, compute(x));  // C++17
    return it->second;
}

// OR for C++11/14:
int operator()(int x) const {
    auto it = cache.find(x);
    if (it != cache.end()) {
        return it->second;  // Found, return cached value
    }
    // Not found, compute and insert
    int result = compute(x);
    cache[x] = result;
    return result;
}
```

**Explanation:**
- **Original problem: Double hash lookup**
  ```cpp
  if (cache.count(x)) {        // Lookup 1: Search hash table
      return cache[x];          // Lookup 2: Search hash table AGAIN
  }
  ```
  - `count(x)` searches hash table
  - `operator[x]` searches hash table again
  - **Two full hash computations and bucket searches**
- **Performance cost:**
  - Each lookup: hash(x) + bucket search + comparisons
  - 2x work for cache hit path (most common case)
  - Typical cost: ~100-200 CPU cycles wasted
- **Optimization 1: Use find() (C++11)**
  ```cpp
  auto it = cache.find(x);  // Single lookup, return iterator
  if (it != cache.end()) {
      return it->second;     // Use iterator, no second lookup
  }
  ```
  - find() returns iterator
  - Iterator points directly to element
  - No second search needed
- **Optimization 2: try_emplace() (C++17, most elegant)**
  ```cpp
  auto [it, inserted] = cache.try_emplace(x, compute(x));
  return it->second;
  ```
  - **Single operation:** Search + insert if needed
  - Returns `pair<iterator, bool>`
  - `inserted == true`: Element added (wasn't there)
  - `inserted == false`: Element exists (found)
  - **Always returns iterator to element**
  - **Lazy evaluation:** Only computes if inserting
- **Caveat with try_emplace:**
  ```cpp
  // This ALWAYS calls compute(x), even if cached!
  auto [it, inserted] = cache.try_emplace(x, compute(x));  // BAD!

  // Fix: Use lazy_emplace or manual check
  auto it = cache.find(x);
  if (it == cache.end()) {
      it = cache.emplace(x, compute(x)).first;
  }
  return it->second;
  ```
- **Complete optimized version:**
  ```cpp
  class MemoizedFunction {
      mutable std::unordered_map<int, int> cache;

  public:
      int operator()(int x) const {
          auto it = cache.find(x);
          if (it != cache.end()) {
              return it->second;  // Cache hit, single lookup
          }

          // Cache miss, compute and insert
          int result = compute(x);
          cache.emplace(x, result);  // Or cache[x] = result
          return result;
      }
  };
  ```
- **Performance comparison:**
  ```
  Double lookup (count + operator[]):  ~200 cycles
  Single lookup (find):                ~100 cycles
  Speedup: 2x for cache hits
  ```
- **Additional optimization: emplace vs operator[]**
  ```cpp
  cache[x] = result;       // May default-construct if missing
  cache.emplace(x, result); // Direct construction, no default
  ```
- **Key Concept:** count() + operator[] causes double hash lookup; use find() for single lookup with iterator; try_emplace() elegant but beware eager evaluation

---

#### Q5
Complete this generic accumulator functor that works with any type supporting `operator+`:
```cpp
template <typename T>
class Accumulator {
    // Your code here
public:
    void operator()(const T& value) {
        // Your code here
    }
    T getSum() const {
        // Your code here
    }
};
```

**Answer:**
```cpp
template <typename T>
class Accumulator {
    T sum;

public:
    Accumulator() : sum(T{}) {}  // Value-initialize to zero

    void operator()(const T& value) {
        sum += value;
    }

    T getSum() const {
        return sum;
    }

    void reset() {  // Bonus: reset accumulator
        sum = T{};
    }
};
```

**Explanation:**
- **Key design decisions:**
  1. **Value-initialization: `T{}`**
     - Zero-initializes for built-in types: `int{}` → 0, `double{}` → 0.0
     - Default-constructs for class types
     - Works for any T with default constructor and operator+
  2. **Pass by const reference**
     - Avoids copying large objects
     - Works with both small (int) and large (std::vector) types
  3. **operator() accumulates**
     - Uses `+=` operator (more efficient than `sum = sum + value`)
     - In-place addition avoids temporary
- **Usage examples:**
  ```cpp
  // Accumulate integers
  Accumulator<int> intAcc;
  std::vector<int> nums = {1, 2, 3, 4, 5};
  std::for_each(nums.begin(), nums.end(), std::ref(intAcc));
  std::cout << intAcc.getSum();  // 15

  // Accumulate strings
  Accumulator<std::string> strAcc;
  std::vector<std::string> words = {"Hello", " ", "World"};
  std::for_each(words.begin(), words.end(), std::ref(strAcc));
  std::cout << strAcc.getSum();  // "Hello World"

  // Accumulate custom types
  struct Point {
      int x, y;
      Point operator+(const Point& other) const {
          return {x + other.x, y + other.y};
      }
  };
  Accumulator<Point> pointAcc;
  ```
- **Why std::ref needed:**
  ```cpp
  std::for_each(nums.begin(), nums.end(), intAcc);  // WRONG: copies
  std::for_each(nums.begin(), nums.end(), std::ref(intAcc));  // Correct
  ```
  - STL algorithms pass functors by value
  - Modifications happen to copy, not original
  - `std::ref` creates reference wrapper
- **Alternative: Return from for_each**
  ```cpp
  intAcc = std::for_each(nums.begin(), nums.end(), intAcc);
  // for_each returns the functor (after accumulation)
  ```
- **Improvement: Support move semantics**
  ```cpp
  template <typename T>
  class Accumulator {
      T sum;
  public:
      Accumulator() : sum(T{}) {}

      void operator()(const T& value) { sum += value; }

      void operator()(T&& value) {  // Rvalue overload
          sum += std::move(value);   // Move instead of copy
      }

      T getSum() const { return sum; }
      T releaseSum() { return std::move(sum); }  // Move out result
  };
  ```
- **Comparison with std::accumulate:**
  ```cpp
  // Using std::accumulate (functional approach)
  int sum = std::accumulate(nums.begin(), nums.end(), 0);

  // Using Accumulator functor (object-oriented approach)
  Accumulator<int> acc;
  acc = std::for_each(nums.begin(), nums.end(), acc);
  int sum = acc.getSum();
  ```
- **When to use functor over accumulate:**
  - Need to track additional state (count, min, max)
  - Complex accumulation logic
  - Reusable accumulator for multiple ranges
- **Enhanced version with statistics:**
  ```cpp
  template <typename T>
  class Statistics {
      T sum;
      size_t count;
  public:
      Statistics() : sum(T{}), count(0) {}

      void operator()(const T& value) {
          sum += value;
          count++;
      }

      T getSum() const { return sum; }
      T getAverage() const { return sum / count; }
      size_t getCount() const { return count; }
  };
  ```
- **Key Concept:** Generic accumulator uses value-initialization T{} for zero; requires operator+ and default constructor; use std::ref with STL algorithms to avoid copying

---

#### Q6
What's wrong with this comparison functor? How would you fix it?
```cpp
class GreaterThan {
    int threshold;
public:
    GreaterThan(int t) : threshold(t) {}
    bool operator()(int a, int b) { return a > b && a > threshold; }
};
```

**Answer:**
```
Wrong signature: STL comparison functors are binary predicates on same type
Should compare two elements, not filter by threshold
Mixing comparison with filtering logic
```

**Explanation:**
- **What's wrong:**
  ```cpp
  bool operator()(int a, int b) { return a > b && a > threshold; }
  //                                     ^^^^^^   ^^^^^^^^^^^^^^
  //                                     Compare  Filter (wrong!)
  ```
  - **Binary comparison:** Should only compare `a` vs `b`
  - **Unary filter:** Checking `a > threshold` is filtering, not comparing
  - **Asymmetric:** Only checks `a`, ignores whether `b > threshold`
- **Problems this causes:**
  1. **Violates strict weak ordering:**
     ```cpp
     GreaterThan gt(10);
     gt(15, 5);   // true (15 > 5 && 15 > 10)
     gt(8, 5);    // false (8 > 5 but 8 NOT > 10)
     // Inconsistent: 15 > 5 (true), 8 > 5 (should be true), but returns false
     ```
  2. **Breaks std::sort:**
     ```cpp
     std::vector<int> v = {12, 8, 15, 5};
     std::sort(v.begin(), v.end(), GreaterThan(10));
     // Undefined behavior! Comparison violates requirements
     ```
  3. **Strict weak ordering requirements:**
     - **Irreflexivity:** `comp(a, a)` must be false
     - **Antisymmetry:** If `comp(a, b)` true, then `comp(b, a)` false
     - **Transitivity:** If `comp(a, b)` and `comp(b, c)`, then `comp(a, c)`
     - This functor violates transitivity!
- **Fix 1: Pure comparison (remove threshold)**
  ```cpp
  class GreaterThan {
  public:
      bool operator()(int a, int b) const {
          return a > b;  // Simple comparison
      }
  };

  // Or just use std::greater<int>
  std::sort(v.begin(), v.end(), std::greater<int>());
  ```
- **Fix 2: If you need filtering, use separate predicate**
  ```cpp
  class GreaterThanThreshold {
      int threshold;
  public:
      GreaterThanThreshold(int t) : threshold(t) {}
      bool operator()(int x) const {  // Unary predicate
          return x > threshold;
      }
  };

  // Use with std::copy_if or std::remove_if
  std::vector<int> v = {12, 8, 15, 5};
  std::vector<int> filtered;
  std::copy_if(v.begin(), v.end(), std::back_inserter(filtered),
               GreaterThanThreshold(10));
  // filtered = {12, 15}
  ```
- **Fix 3: Combine comparison + filtering (two functors)**
  ```cpp
  std::vector<int> v = {12, 8, 15, 5};

  // Step 1: Filter
  std::vector<int> filtered;
  std::copy_if(v.begin(), v.end(), std::back_inserter(filtered),
               [](int x) { return x > 10; });

  // Step 2: Sort
  std::sort(filtered.begin(), filtered.end(), std::greater<int>());
  // filtered = {15, 12}
  ```
- **Real-world example of strict weak ordering violation:**
  ```cpp
  GreaterThan gt(10);

  // Test transitivity:
  gt(15, 12);  // true (15 > 12 && 15 > 10)
  gt(12, 8);   // true (12 > 8 && 12 > 10)
  gt(15, 8);   // true (15 > 8 && 15 > 10)
  // OK so far

  gt(12, 8);   // true (12 > 8 && 12 > 10)
  gt(8, 5);    // false! (8 > 5 but 8 NOT > 10)
  // Should imply gt(12, 5) is true
  gt(12, 5);   // true (12 > 5 && 12 > 10)

  // But: gt(8, 5) false violates transitivity expectation
  // Sort algorithms assume: if a > b and b > c, then a > c
  ```
- **Comparison functor best practices:**
  ```cpp
  struct CompareByAge {
      bool operator()(const Person& a, const Person& b) const {
          return a.age < b.age;  // Only compare, no filtering
      }
  };
  ```
- **Key Concept:** Comparison functors must satisfy strict weak ordering; don't mix comparison with filtering; use separate unary predicate for filtering

---

#### Q7
Implement move semantics for this resource-owning functor:
```cpp
class FileProcessor {
    std::unique_ptr<std::ofstream> file;
public:
    FileProcessor(const std::string& filename);
    // Add move constructor and move assignment
    void operator()(const std::string& data);
};
```

**Answer:**
```cpp
class FileProcessor {
    std::unique_ptr<std::ofstream> file;

public:
    FileProcessor(const std::string& filename)
        : file(std::make_unique<std::ofstream>(filename)) {
        if (!file->is_open()) {
            throw std::runtime_error("Failed to open file");
        }
    }

    // Move constructor
    FileProcessor(FileProcessor&& other) noexcept
        : file(std::move(other.file)) {}

    // Move assignment
    FileProcessor& operator=(FileProcessor&& other) noexcept {
        if (this != &other) {
            file = std::move(other.file);
        }
        return *this;
    }

    // Delete copy operations (unique ownership)
    FileProcessor(const FileProcessor&) = delete;
    FileProcessor& operator=(const FileProcessor&) = delete;

    void operator()(const std::string& data) {
        if (file && file->is_open()) {
            (*file) << data << '\n';
        }
    }

    ~FileProcessor() = default;  // unique_ptr handles cleanup
};
```

**Explanation:**
- **Why move semantics needed:**
  - `unique_ptr` represents unique ownership
  - Cannot be copied (copy constructor deleted)
  - Must use move to transfer ownership
  - Functor needs to be movable for STL algorithms
- **Move constructor:**
  ```cpp
  FileProcessor(FileProcessor&& other) noexcept
      : file(std::move(other.file)) {}
  ```
  - Takes rvalue reference (&&)
  - `std::move` transfers ownership from `other.file`
  - After move, `other.file` is nullptr
  - **noexcept:** Enables optimizations, required for strong exception guarantee
- **Move assignment:**
  ```cpp
  FileProcessor& operator=(FileProcessor&& other) noexcept {
      if (this != &other) {  // Self-assignment check
          file = std::move(other.file);
      }
      return *this;
  }
  ```
  - Self-assignment check prevents issues
  - Assigns unique_ptr (automatically releases old resource)
  - Returns *this for chaining
- **Why delete copy operations:**
  ```cpp
  FileProcessor(const FileProcessor&) = delete;
  FileProcessor& operator=(const FileProcessor&) = delete;
  ```
  - File handle is unique (can't have two owners)
  - Copying would duplicate file writes
  - Enforce move-only semantics
- **Usage example:**
  ```cpp
  FileProcessor processor("output.txt");

  // Move into STL algorithm
  std::vector<std::string> logs = {"log1", "log2", "log3"};
  std::for_each(logs.begin(), logs.end(), std::ref(processor));

  // Move to another variable
  FileProcessor p2 = std::move(processor);  // OK, uses move constructor
  // processor.file is now nullptr

  // Copy would fail
  // FileProcessor p3 = processor;  // Compilation error: deleted
  ```
- **STL algorithm compatibility:**
  ```cpp
  // Some algorithms require movable functors
  std::vector<std::string> data = {"a", "b", "c"};

  // This moves processor into for_each
  auto result = std::for_each(
      std::make_move_iterator(data.begin()),
      std::make_move_iterator(data.end()),
      std::move(processor)  // Move, not copy
  );
  ```
- **Why noexcept important:**
  - Enables move optimizations in std::vector
  - Strong exception guarantee for containers
  - Without noexcept, vector may copy instead of move
  - **Best practice:** Mark move operations noexcept if they can't throw
- **Alternative: Shared ownership (if needed)**
  ```cpp
  class FileProcessor {
      std::shared_ptr<std::ofstream> file;  // Shared ownership
      // Now copyable, but shares same file handle
  };
  ```
- **Rule of Five (complete):**
  ```cpp
  // Destructor (default OK, unique_ptr cleans up)
  ~FileProcessor() = default;

  // Copy constructor (deleted)
  FileProcessor(const FileProcessor&) = delete;

  // Copy assignment (deleted)
  FileProcessor& operator=(const FileProcessor&) = delete;

  // Move constructor (implemented)
  FileProcessor(FileProcessor&&) noexcept = default;

  // Move assignment (implemented)
  FileProcessor& operator=(FileProcessor&&) noexcept = default;
  ```
- **Key Concept:** Resource-owning functors with unique_ptr require move semantics; delete copy operations for unique ownership; mark move operations noexcept for optimizations

---

#### Q8
Why doesn't this code compile? Fix it.
```cpp
class Transformer {
    std::vector<int> history;
public:
    int operator()(int x) const {
        history.push_back(x);  // Error!
        return x * 2;
    }
};
```

**Answer:**
```cpp
class Transformer {
    mutable std::vector<int> history;  // Add mutable
public:
    int operator()(int x) const {
        history.push_back(x);  // OK now
        return x * 2;
    }
};
```

**Explanation:**
- **Compilation error:**
  ```
  error: passing 'const std::vector<int>' as 'this' argument discards qualifiers
  ```
  - `operator()` is `const`
  - Cannot modify non-mutable members in const functions
  - `push_back()` is non-const member function
- **Why this pattern exists:**
  - Functor is logically const (doesn't change transformation behavior)
  - History tracking is **implementation detail** (side effect)
  - Want to use with const functors and STL algorithms
- **Solution: mutable keyword**
  ```cpp
  mutable std::vector<int> history;
  ```
  - Allows modification even in const member functions
  - Indicates "this is cache/logging, not core state"
  - Common pattern for caching, statistics, logging
- **When to use mutable:**
  1. **Caching:**
     ```cpp
     class Fibonacci {
         mutable std::unordered_map<int, int> cache;
     public:
         int operator()(int n) const {
             if (cache.count(n)) return cache[n];  // Read cache
             int result = fib(n);
             cache[n] = result;  // Update cache (mutable!)
             return result;
         }
     };
     ```
  2. **Statistics/counters:**
     ```cpp
     class Function {
         mutable size_t callCount = 0;
     public:
         int operator()(int x) const {
             ++callCount;  // Track calls (mutable!)
             return x * 2;
         }
         size_t getCallCount() const { return callCount; }
     };
     ```
  3. **Lazy initialization:**
     ```cpp
     class Resource {
         mutable std::unique_ptr<ExpensiveObject> obj;
     public:
         const ExpensiveObject& get() const {
             if (!obj) obj = std::make_unique<ExpensiveObject>();  // Lazy init
             return *obj;
         }
     };
     ```
  4. **Synchronization:**
     ```cpp
     class ThreadSafe {
         mutable std::mutex mtx;
         int data;
     public:
         int getData() const {
             std::lock_guard lock(mtx);  // Lock in const function
             return data;
         }
     };
     ```
- **Alternative solution: Remove const (changes semantics)**
  ```cpp
  class Transformer {
      std::vector<int> history;
  public:
      int operator()(int x) {  // Non-const
          history.push_back(x);
          return x * 2;
      }
  };

  // Problem: Can't use with const functors
  const Transformer t;
  // t(5);  // Error: operator() is non-const
  ```
- **STL algorithm implications:**
  ```cpp
  std::vector<int> vec = {1, 2, 3};
  Transformer t;

  // With const operator():
  std::transform(vec.begin(), vec.end(), vec.begin(), t);
  // Works with const-qualified functor copy

  // Without const: Some algorithms may not work
  ```
- **Logical const vs bitwise const:**
  - **Bitwise const:** No member modified
  - **Logical const:** Object's observable state unchanged
  - `mutable` expresses logical constness
  - History doesn't affect transformation result → logically const
- **Thread safety warning:**
  ```cpp
  mutable std::vector<int> history;
  // NOT thread-safe! Multiple threads modifying history concurrently

  // Need synchronization:
  mutable std::mutex mtx;
  mutable std::vector<int> history;

  int operator()(int x) const {
      std::lock_guard lock(mtx);
      history.push_back(x);
      return x * 2;
  }
  ```
- **Key Concept:** Const operator() cannot modify non-mutable members; use mutable for caching, statistics, logging; mutable expresses logical constness (observable behavior unchanged)

---

#### Q9
Convert this function pointer usage to a functor:
```cpp
bool isEven(int x) { return x % 2 == 0; }
std::vector<int> vec = {1, 2, 3, 4, 5};
vec.erase(std::remove_if(vec.begin(), vec.end(), isEven), vec.end());
```

**Answer:**
```cpp
class IsEven {
public:
    bool operator()(int x) const {
        return x % 2 == 0;
    }
};

std::vector<int> vec = {1, 2, 3, 4, 5};
vec.erase(std::remove_if(vec.begin(), vec.end(), IsEven()), vec.end());
// Result: vec = {1, 3, 5}
```

**Explanation:**
- **Functor advantages over function pointer:**
  1. **State:** Can hold member variables
  2. **Inline:** More likely to be inlined by compiler
  3. **Type-specific:** Each functor is unique type
  4. **Flexible:** Can overload operator() for different types
- **Simple conversion:**
  ```cpp
  // Function pointer
  bool isEven(int x) { return x % 2 == 0; }

  // Equivalent functor
  class IsEven {
  public:
      bool operator()(int x) const { return x % 2 == 0; }
  };
  ```
- **With state (more powerful):**
  ```cpp
  class IsDivisibleBy {
      int divisor;
  public:
      IsDivisibleBy(int d) : divisor(d) {}

      bool operator()(int x) const {
          return x % divisor == 0;
      }
  };

  // Remove multiples of 3
  vec.erase(std::remove_if(vec.begin(), vec.end(), IsDivisibleBy(3)), vec.end());

  // Remove multiples of 5
  vec.erase(std::remove_if(vec.begin(), vec.end(), IsDivisibleBy(5)), vec.end());
  ```
- **Performance comparison:**
  ```cpp
  // Function pointer: Indirect call (cannot inline)
  bool (*fp)(int) = isEven;
  std::remove_if(vec.begin(), vec.end(), fp);

  // Functor: Direct call (can inline)
  std::remove_if(vec.begin(), vec.end(), IsEven());
  // Compiler can inline operator(), making it as fast as hand-written loop
  ```
- **Lambda equivalent (C++11+):**
  ```cpp
  vec.erase(std::remove_if(vec.begin(), vec.end(),
                           [](int x) { return x % 2 == 0; }),
            vec.end());

  // Lambda with state
  int divisor = 3;
  vec.erase(std::remove_if(vec.begin(), vec.end(),
                           [divisor](int x) { return x % divisor == 0; }),
            vec.end());
  ```
- **When to use functor over lambda:**
  - Need explicit type name (for template parameters)
  - Complex logic (multiple member functions)
  - Reuse across multiple functions
  - Want named type for debugging
- **Generic functor (works with any type):**
  ```cpp
  class IsEven {
  public:
      template <typename T>
      bool operator()(const T& x) const {
          return x % 2 == 0;
      }
  };

  std::vector<int> ints = {1, 2, 3};
  std::vector<long> longs = {1L, 2L, 3L};

  std::remove_if(ints.begin(), ints.end(), IsEven());
  std::remove_if(longs.begin(), longs.end(), IsEven());
  ```
- **Erase-remove idiom explanation:**
  ```cpp
  // Step 1: remove_if moves elements to end, returns new end
  auto new_end = std::remove_if(vec.begin(), vec.end(), IsEven());
  // vec = {1, 3, 5, 2, 4} (evens moved to end, order undefined)
  //                ^new_end

  // Step 2: erase actually removes elements
  vec.erase(new_end, vec.end());
  // vec = {1, 3, 5}
  ```
- **Key Concept:** Functors offer advantages over function pointers: state, inlining, type safety; convert by creating class with operator(); lambdas are syntactic sugar for functors

---

#### Q10
Identify and fix the issue with cache invalidation in this functor:
```cpp
class ScalingFunction {
    mutable std::unordered_map<int, int> cache;
    int scaleFactor;
public:
    ScalingFunction(int factor) : scaleFactor(factor) {}

    void setScaleFactor(int factor) {
        scaleFactor = factor;
    }

    int operator()(int x) const {
        auto it = cache.find(x);
        if (it != cache.end()) return it->second;
        int result = x * scaleFactor;
        cache[x] = result;
        return result;
    }
};
```

**Answer:**
```cpp
class ScalingFunction {
    mutable std::unordered_map<int, int> cache;
    int scaleFactor;
public:
    ScalingFunction(int factor) : scaleFactor(factor) {}

    void setScaleFactor(int factor) {
        scaleFactor = factor;
        cache.clear();  // Invalidate cache!
    }

    int operator()(int x) const {
        auto it = cache.find(x);
        if (it != cache.end()) return it->second;
        int result = x * scaleFactor;
        cache[x] = result;
        return result;
    }
};
```

**Explanation:**
- **The bug: Stale cache**
  ```cpp
  ScalingFunction f(2);
  f(10);  // Computes 10 * 2 = 20, caches {10: 20}

  f.setScaleFactor(3);  // Changes factor but cache still has {10: 20}!

  f(10);  // Returns cached 20, should be 30!
  ```
  - Cache contains results computed with old scaleFactor
  - After setScaleFactor(), cached values are **wrong**
  - **Silently returns incorrect results**
- **Why this happens:**
  - Cache is **dependent** on scaleFactor
  - Changing scaleFactor invalidates all cached values
  - No cache invalidation mechanism
- **Solution: Clear cache on factor change**
  ```cpp
  void setScaleFactor(int factor) {
      scaleFactor = factor;
      cache.clear();  // Invalidate all cached results
  }
  ```
- **Alternative: Store factor with cached value**
  ```cpp
  class ScalingFunction {
      struct CacheEntry {
          int result;
          int factor;  // Factor used to compute result
      };
      mutable std::unordered_map<int, CacheEntry> cache;
      int scaleFactor;

  public:
      int operator()(int x) const {
          auto it = cache.find(x);
          if (it != cache.end() && it->second.factor == scaleFactor) {
              return it->second.result;  // Cache hit with correct factor
          }

          int result = x * scaleFactor;
          cache[x] = {result, scaleFactor};  // Store factor too
          return result;
      }
  };
  ```
  - Validates cache entry against current factor
  - More memory, but avoids clearing entire cache
- **Real-world example:**
  ```cpp
  class DatabaseQuery {
      mutable std::unordered_map<std::string, Result> cache;
      std::string filter;  // WHERE clause

  public:
      void setFilter(const std::string& f) {
          if (filter != f) {  // Only clear if changed
              filter = f;
              cache.clear();  // Invalidate cache
          }
      }

      Result operator()(const std::string& query) const {
          // Cache depends on filter
          auto it = cache.find(query);
          if (it != cache.end()) return it->second;

          Result r = executeQuery(query + " WHERE " + filter);
          cache[query] = r;
          return r;
      }
  };
  ```
- **Common cache invalidation patterns:**
  1. **Clear all:** Simple, safe, may discard valid entries
  2. **Timestamp:** Tag entries with creation time, expire old ones
     ```cpp
     struct CacheEntry {
         int value;
         std::chrono::steady_clock::time_point timestamp;
     };
     ```
  3. **Version number:** Increment on config change
     ```cpp
     int version = 0;
     void setFactor(int f) {
         scaleFactor = f;
         ++version;  // Invalidate by incrementing
     }
     ```
  4. **LRU eviction:** Keep cache bounded, evict least recently used
- **Thread safety consideration:**
  ```cpp
  mutable std::shared_mutex mtx;

  void setScaleFactor(int factor) {
      std::unique_lock lock(mtx);  // Exclusive lock
      scaleFactor = factor;
      cache.clear();
  }

  int operator()(int x) const {
      // Shared lock for read-only cache check
      {
          std::shared_lock lock(mtx);
          auto it = cache.find(x);
          if (it != cache.end()) return it->second;
      }

      // Compute and cache (upgrade to exclusive)
      std::unique_lock lock(mtx);
      // Double-check (another thread might have computed)
      auto it = cache.find(x);
      if (it != cache.end()) return it->second;

      int result = x * scaleFactor;
      cache[x] = result;
      return result;
  }
  ```
- **Key Concept:** Cache depends on mutable state requires invalidation on state change; clear cache when dependencies change; alternative: store dependency version with cached value

---

#### Q11
Complete this variadic functor that counts how many times it's been called with different argument counts:
```cpp
class CallTracker {
    std::map<int, int> callsByArgCount;
public:
    template <typename... Args>
    void operator()(Args&&... args) {
        // Your code here
    }

    void printStats() const {
        // Your code here
    }
};
```

**Answer:**
```cpp
class CallTracker {
    std::map<int, int> callsByArgCount;
public:
    template <typename... Args>
    void operator()(Args&&... args) {
        int argCount = sizeof...(Args);
        callsByArgCount[argCount]++;
    }

    void printStats() const {
        std::cout << "Call statistics:\n";
        for (const auto& [count, times] : callsByArgCount) {
            std::cout << "  Called with " << count << " arg(s): " << times << " time(s)\n";
        }
    }
};

// Usage:
CallTracker tracker;
tracker();  //0 args
tracker(1);               // 1 arg
tracker(1, 2);            // 2 args
tracker(1, 2, 3);         // 3 args
tracker(1);               // 1 arg again
tracker.printStats();
// Output:
// Called with 0 arg(s): 1 time(s)
// Called with 1 arg(s): 2 time(s)
// Called with 2 arg(s): 1 time(s)
// Called with 3 arg(s): 1 time(s)
```

**Explanation:**
- **sizeof... operator:** Counts template parameter pack size at compile time
- **Variadic templates:** Accept any number of arguments of any types
- **Perfect forwarding:** `Args&&...` preserves value category (lvalue/rvalue)
- **How it works:**
  ```cpp
  template <typename... Args>
  void operator()(Args&&... args) {
      int argCount = sizeof...(Args);  // Compile-time constant
      callsByArgCount[argCount]++;
  }
  ```
- **sizeof... vs sizeof:**
  - `sizeof...(Args)` → Number of template arguments
  - `sizeof(Args)` → Size in bytes of single type
- **Key Concept:** sizeof... counts variadic template parameters; variadic functors accept any number of arguments; perfect forwarding preserves value categories

---

#### Q12
Why might this functor be slower than expected? Optimize it.
```cpp
class StringConcatenator {
    std::string result;
public:
    void operator()(const std::string& s) {
        result = result + s;
    }
    std::string getResult() const { return result; }
};
```

**Answer:**
```
Performance issue: result = result + s creates temporary string on each call
O(n²) complexity for n concatenations
Optimization: Use result += s for in-place modification (O(n))
```

**Explanation:**
- **The performance problem:**
  ```cpp
  result = result + s;
  //       ^^^^^^^^^^
  //       Creates temporary string
  ```
  - `result + s` creates **new temporary string**
  - Copies all characters from `result` into temp
  - Copies all characters from `s` into temp
  - Assigns temp back to `result`
  - **Each call: O(current_length) copy operation**
- **Why this is O(n²):**
  ```cpp
  StringConcatenator concat;
  concat("a");     // Copy 0 chars, result = "a" (1 char)
  concat("b");     // Copy 1 char, result = "ab" (2 chars)
  concat("c");     // Copy 2 chars, result = "abc" (3 chars)
  // ...
  concat("z");     // Copy 25 chars, result = "abc...z" (26 chars)

  // Total: 0 + 1 + 2 + ... + 25 = 25*26/2 = 325 character copies
  // For n strings: O(n²) complexity
  ```
- **Optimization 1: Use += operator (best)**
  ```cpp
  class StringConcatenator {
      std::string result;
  public:
      void operator()(const std::string& s) {
          result += s;  // In-place append, no temporary
      }
      std::string getResult() const { return result; }
  };
  ```
  - `+=` appends in-place
  - Only copies new string `s`
  - No temporary string created
  - **O(n) complexity total**
- **Optimization 2: Use append() (equivalent to +=)**
  ```cpp
  void operator()(const std::string& s) {
      result.append(s);  // Same as +=
  }
  ```
- **Optimization 3: Pre-allocate if size known**
  ```cpp
  class StringConcatenator {
      std::string result;
  public:
      StringConcatenator(size_t expectedSize = 0) {
          result.reserve(expectedSize);  // Pre-allocate capacity
      }

      void operator()(const std::string& s) {
          result += s;
      }

      std::string getResult() const { return result; }
  };
  ```
  - `reserve()` allocates memory once
  - Avoids multiple reallocations
  - **Benchmark:** 10,000 concatenations
    ```
    result = result + s:  ~500ms (O(n²))
    result += s:          ~5ms   (O(n))
    result += s with reserve(): ~2ms (O(n), no reallocations)
    ```
- **Why + creates temporary:**
  ```cpp
  // std::string operator+ signature:
  string operator+(const string& lhs, const string& rhs) {
      string temp = lhs;  // Copy lhs
      temp += rhs;        // Append rhs
      return temp;        // Return copy
  }
  ```
  - Binary operator+ is **non-member function**
  - Cannot modify operands (they're const)
  - Must create and return new string
- **Why += doesn't:**
  ```cpp
  // std::string operator+= signature:
  string& operator+=(const string& rhs) {
      // Append to *this in-place
      return *this;  // Return reference, no copy
  }
  ```
  - Member function, modifies `*this`
  - Returns reference to self
  - No temporary, no extra allocation
- **Move semantics consideration (C++11+):**
  ```cpp
  result = std::move(result) + s;  // Still creates temporary
  // Better: just use result += s
  ```
- **String builder pattern comparison:**
  ```cpp
  // C++: ostringstream
  std::ostringstream oss;
  oss << "a" << "b" << "c";
  std::string result = oss.str();

  // Functor with +=
  StringConcatenator concat;
  concat("a");
  concat("b");
  concat("c");
  std::string result = concat.getResult();

  // Performance similar, functor more flexible with STL
  ```
- **Real-world usage:**
  ```cpp
  std::vector<std::string> lines = {"Line 1\n", "Line 2\n", "Line 3\n"};

  StringConcatenator concat(100);  // Reserve 100 bytes
  std::for_each(lines.begin(), lines.end(), std::ref(concat));
  std::string document = concat.getResult();
  ```
- **Key Concept:** String concatenation with operator+ creates temporary strings (O(n²)); use operator+= for in-place append (O(n)); reserve() avoids reallocations

---

#### Q13
Implement a functor composition helper that chains two functors:
```cpp
template <typename F, typename G>
class ComposedFunctor {
    // Your implementation
};

template <typename F, typename G>
ComposedFunctor<F, G> compose(F f, G g) {
    // Your implementation
}
```

**Answer:**
```cpp
template <typename F, typename G>
class ComposedFunctor {
    F f;
    G g;
public:
    ComposedFunctor(F f_, G g_) : f(f_), g(g_) {}

    template <typename T>
    auto operator()(T&& x) const -> decltype(f(g(std::forward<T>(x)))) {
        return f(g(std::forward<T>(x)));  // f(g(x))
    }
};

template <typename F, typename G>
ComposedFunctor<F, G> compose(F f, G g) {
    return ComposedFunctor<F, G>(f, g);
}

// Usage:
auto addOne = [](int x) { return x + 1; };
auto timesTwo = [](int x) { return x * 2; };
auto composed = compose(addOne, timesTwo);  // (x * 2) + 1
int result = composed(5);  // (5 * 2) + 1 = 11
```

**Explanation:**
- **Function composition:** Combines two functions into one
  - Mathematical notation: `(f ∘ g)(x) = f(g(x))`
  - Apply `g` first, then apply `f` to result
  - Read right-to-left: `compose(f, g)` means `f(g(x))`
- **Implementation details:**
  ```cpp
  template <typename F, typename G>
  class ComposedFunctor {
      F f;  // Outer function
      G g;  // Inner function (applied first)
  ```
  - Stores both functors by value
  - Generic template works with any callable
- **operator() with perfect forwarding:**
  ```cpp
  template <typename T>
  auto operator()(T&& x) const -> decltype(f(g(std::forward<T>(x)))) {
      return f(g(std::forward<T>(x)));
  }
  ```
  - Template allows any argument type
  - `T&&` is forwarding reference (universal reference)
  - `std::forward<T>(x)` preserves value category
  - `decltype(...)` deduces return type (C++11 trailing return)
- **C++14 simplified version:**
  ```cpp
  template <typename T>
  auto operator()(T&& x) const {
      return f(g(std::forward<T>(x)));  // Return type auto-deduced
  }
  ```
- **Usage examples:**
  ```cpp
  // Example 1: Math operations
  auto square = [](int x) { return x * x; };
  auto addTen = [](int x) { return x + 10; };
  auto composed1 = compose(square, addTen);
  composed1(5);  // square(addTen(5)) = square(15) = 225

  // Example 2: String operations
  auto toUpper = [](std::string s) {
      std::transform(s.begin(), s.end(), s.begin(), ::toupper);
      return s;
  };
  auto addPrefix = [](std::string s) { return "PREFIX_" + s; };
  auto composed2 = compose(toUpper, addPrefix);
  composed2("hello");  // toUpper(addPrefix("hello")) = "PREFIX_HELLO"

  // Example 3: With STL algorithms
  std::vector<int> nums = {1, 2, 3, 4, 5};
  std::vector<int> result;
  std::transform(nums.begin(), nums.end(), std::back_inserter(result),
                 compose(square, addTen));
  // result = {121, 144, 169, 196, 225}
  ```
- **Multiple composition:**
  ```cpp
  auto f1 = [](int x) { return x + 1; };
  auto f2 = [](int x) { return x * 2; };
  auto f3 = [](int x) { return x - 3; };

  // Compose multiple: ((x - 3) * 2) + 1
  auto composed = compose(f1, compose(f2, f3));
  composed(10);  // f1(f2(f3(10))) = f1(f2(7)) = f1(14) = 15
  ```
- **Variadic composition (C++17):**
  ```cpp
  template <typename F>
  auto compose(F f) { return f; }  // Base case

  template <typename F, typename... Fs>
  auto compose(F f, Fs... fs) {
      return [=](auto x) { return f(compose(fs...)(x)); };
  }

  // Usage:
  auto result = compose(f1, f2, f3, f4);
  // Equivalent to: f1(f2(f3(f4(x))))
  ```
- **Comparison with std::function:**
  ```cpp
  // Using ComposedFunctor (template, can inline)
  auto c1 = compose(addOne, timesTwo);  // Type: ComposedFunctor<lambda, lambda>
  c1(5);  // Can be fully inlined

  // Using std::function (type erasure, indirect call)
  std::function<int(int)> f1 = addOne;
  std::function<int(int)> f2 = timesTwo;
  std::function<int(int)> c2 = [=](int x) { return f1(f2(x)); };
  c2(5);  // Indirect call, overhead
  ```
- **Real-world use case: Data pipeline**
  ```cpp
  auto validate = [](Data d) { /* check validity */ return d; };
  auto normalize = [](Data d) { /* normalize */ return d; };
  auto transform = [](Data d) { /* transform */ return d; };

  auto pipeline = compose(transform, compose(normalize, validate));

  std::vector<Data> input = /* ... */;
  std::vector<Data> output;
  std::transform(input.begin(), input.end(), std::back_inserter(output), pipeline);
  ```
- **Key Concept:** Function composition chains functors: compose(f, g) creates f(g(x)); perfect forwarding preserves value categories; composable functors enable functional programming style

---

#### Q14
Fix the copy semantics issue in this code:
```cpp
class Aggregator {
    double sum;
    int count;
public:
    Aggregator() : sum(0), count(0) {}
    void operator()(double x) { sum += x; count++; }
    double average() const { return sum / count; }
};

std::vector<double> data = {1.0, 2.0, 3.0, 4.0};
Aggregator agg;
std::for_each(data.begin(), data.end(), agg);
std::cout << "Average: " << agg.average();  // Prints wrong result!
```

**Answer:**
```cpp
// Fix 1: Use std::ref to pass by reference
std::vector<double> data = {1.0, 2.0, 3.0, 4.0};
Aggregator agg;
std::for_each(data.begin(), data.end(), std::ref(agg));  // Pass by reference
std::cout << "Average: " << agg.average();  // Correct: 2.5

// Fix 2: Capture returned functor
std::vector<double> data = {1.0, 2.0, 3.0, 4.0};
Aggregator agg;
agg = std::for_each(data.begin(), data.end(), agg);  // Get modified copy
std::cout << "Average: " << agg.average();  // Correct: 2.5
```

**Explanation:**
- **The problem: STL algorithms pass by value**
  ```cpp
  std::for_each(data.begin(), data.end(), agg);
  //                                       ^^^
  //                                       Copies agg!
  ```
  - `for_each` takes functor **by value** (copy)
  - Modifications happen to the **copy**, not original
  - Original `agg` remains unchanged (sum=0, count=0)
  - `agg.average()` divides 0/0 → undefined (or NaN)
- **Step-by-step execution:**
  ```cpp
  Aggregator agg;  // Original: sum=0, count=0

  std::for_each(data.begin(), data.end(), agg);
  // Step 1: Copy agg → temp (sum=0, count=0)
  // Step 2: Call temp(1.0) → temp: sum=1.0, count=1
  // Step 3: Call temp(2.0) → temp: sum=3.0, count=2
  // Step 4: Call temp(3.0) → temp: sum=6.0, count=3
  // Step 5: Call temp(4.0) → temp: sum=10.0, count=4
  // Step 6: Destroy temp
  // Original agg: sum=0, count=0 (unchanged!)

  agg.average();  // 0/0 = NaN or undefined
  ```
- **Why for_each passes by value:**
  ```cpp
  // std::for_each signature:
  template<class InputIt, class UnaryFunction>
  UnaryFunction for_each(InputIt first, InputIt last, UnaryFunction f);
  //             ^^^^^^^^^^^^
  //             Returns copy (by value)
  ```
  - Takes `f` by value
  - Returns modified copy
  - Allows algorithms to work with temporary functors
- **Fix 1: std::ref (most explicit)**
  ```cpp
  std::for_each(data.begin(), data.end(), std::ref(agg));
  ```
  - `std::ref(agg)` creates `reference_wrapper<Aggregator>`
  - Passes reference, not copy
  - Original `agg` modified
  - **Best when:** You want to modify original in-place
- **Fix 2: Capture return value (functional style)**
  ```cpp
  agg = std::for_each(data.begin(), data.end(), agg);
  ```
  - `for_each` returns the functor (by value)
  - Assign it back to original
  - **Best when:** Treating functor as immutable value
- **Comparison of fixes:**
  ```cpp
  // Fix 1: Reference semantics
  Aggregator agg1;
  std::for_each(data.begin(), data.end(), std::ref(agg1));
  // agg1 modified: sum=10.0, count=4

  // Fix 2: Value semantics
  Aggregator agg2;
  agg2 = std::for_each(data.begin(), data.end(), agg2);
  // agg2 contains result: sum=10.0, count=4
  ```
- **Performance consideration:**
  ```cpp
  // std::ref: No extra copy
  std::for_each(data.begin(), data.end(), std::ref(agg));  // 0 copies

  // Capture return: One copy (move if move constructor exists)
  agg = std::for_each(data.begin(), data.end(), agg);  // 1 copy/move
  ```
- **Real-world example: Statistics collector**
  ```cpp
  class Statistics {
      double sum = 0;
      double sumSq = 0;
      int count = 0;
  public:
      void operator()(double x) {
          sum += x;
          sumSq += x * x;
          count++;
      }

      double mean() const { return sum / count; }
      double variance() const {
          double m = mean();
          return (sumSq / count) - (m * m);
      }
  };

  std::vector<double> temperatures = {20.5, 21.0, 19.5, 22.0};
  Statistics stats;
  std::for_each(temperatures.begin(), temperatures.end(), std::ref(stats));
  std::cout << "Mean: " << stats.mean()
            << ", Variance: " << stats.variance();
  ```
- **Alternative: Use std::accumulate**
  ```cpp
  // Instead of for_each + Aggregator
  double sum = std::accumulate(data.begin(), data.end(), 0.0);
  double average = sum / data.size();

  // Or with custom operation
  auto accumulator = [](double sum, double x) { return sum + x; };
  double sum2 = std::accumulate(data.begin(), data.end(), 0.0, accumulator);
  ```
- **Functor with state across multiple ranges:**
  ```cpp
  Aggregator agg;
  std::for_each(data1.begin(), data1.end(), std::ref(agg));
  std::for_each(data2.begin(), data2.end(), std::ref(agg));
  std::for_each(data3.begin(), data3.end(), std::ref(agg));
  // agg contains cumulative statistics across all three ranges
  ```
- **Key Concept:** STL algorithms pass functors by value; modifications affect copy, not original; use std::ref for reference semantics or capture return value

---

#### Q15
Implement a thread-safe logging functor with lock-free counters:
```cpp
class ThreadSafeLogger {
    std::atomic<int> messageCount;
    std::mutex logMutex;
    std::ofstream logFile;
public:
    // Your implementation
};
```

**Answer:**
```cpp
class ThreadSafeLogger {
    mutable std::atomic<int> messageCount{0};  // Lock-free counter
    mutable std::mutex logMutex;                // Protects file I/O
    mutable std::ofstream logFile;

public:
    ThreadSafeLogger(const std::string& filename)
        : logFile(filename, std::ios::app) {  // Append mode
        if (!logFile.is_open()) {
            throw std::runtime_error("Failed to open log file");
        }
    }

    void operator()(const std::string& message) const {
        // Increment counter atomically (lock-free!)
        messageCount.fetch_add(1, std::memory_order_relaxed);

        // File I/O requires mutex (not thread-safe)
        std::lock_guard<std::mutex> lock(logMutex);
        logFile << "[" << messageCount.load() << "] " << message << std::endl;
    }

    int getMessageCount() const {
        return messageCount.load(std::memory_order_relaxed);
    }
};
```

**Explanation:**
- **Why atomic for counter:**
  ```cpp
  mutable std::atomic<int> messageCount{0};
  ```
  - Counter incremented by many threads
  - `fetch_add()` is lock-free atomic operation
  - No mutex needed for simple integer increment
  - `mutable` allows modification in const operator()
- **Why mutex for file I/O:**
  ```cpp
  mutable std::mutex logMutex;
  mutable std::ofstream logFile;
  ```
  - File I/O is **not thread-safe**
  - Multiple writes can corrupt output
  - Mutex ensures one thread writes at a time
- **fetch_add with memory_order_relaxed:**
  ```cpp
  messageCount.fetch_add(1, std::memory_order_relaxed);
  ```
  - `fetch_add(1)` atomically increments and returns old value
  - `memory_order_relaxed` no synchronization overhead
  - Safe here because counter independent of file writes
- **Thread safety guarantee:**
  - Counter increments are atomic (lock-free)
  - File writes are serialized (one at a time)
  - No data races, no torn writes
- **Usage example:**
  ```cpp
  ThreadSafeLogger logger("app.log");

  // Multiple threads log concurrently
  std::thread t1([&]() {
      for (int i = 0; i < 100; ++i)
          logger("Thread 1: Message " + std::to_string(i));
  });

  std::thread t2([&]() {
      for (int i = 0; i < 100; ++i)
          logger("Thread 2: Message " + std::to_string(i));
  });

  t1.join();
  t2.join();

  std::cout << "Total messages: " << logger.getMessageCount();  // 200
  ```
- **Performance benefit of atomic counter:**
  ```cpp
  // Without atomic (WRONG - data race):
  int messageCount = 0;  // NOT thread-safe!
  messageCount++;        // Data race!

  // With atomic (correct, lock-free):
  std::atomic<int> messageCount{0};
  messageCount.fetch_add(1);  // Lock-free, very fast

  // With mutex (correct but slower):
  std::mutex countMutex;
  int messageCount = 0;
  {
      std::lock_guard lock(countMutex);  // Lock overhead
      messageCount++;
  }
  ```
- **Memory ordering options:**
  ```cpp
  // Relaxed: No synchronization, just atomicity (fastest)
  messageCount.fetch_add(1, std::memory_order_relaxed);

  // Acquire-Release: Synchronizes with other operations
  messageCount.fetch_add(1, std::memory_order_release);

  // Sequential: Strongest guarantee (slowest)
  messageCount.fetch_add(1, std::memory_order_seq_cst);
  ```
- **Why relaxed is safe here:**
  - Counter doesn't synchronize other data
  - Only tracks count, doesn't control access
  - Mutex provides synchronization for file I/O
- **Alternative: Buffered logging (better performance)**
  ```cpp
  class BufferedLogger {
      std::atomic<int> messageCount{0};
      mutable std::mutex bufferMutex;
      mutable std::vector<std::string> buffer;
      mutable std::ofstream logFile;
      size_t bufferSize;

  public:
      void operator()(const std::string& message) const {
          messageCount.fetch_add(1, std::memory_order_relaxed);

          std::lock_guard lock(bufferMutex);
          buffer.push_back(message);

          if (buffer.size() >= bufferSize) {
              flush();  // Write batch to file
          }
      }

      void flush() const {
          for (const auto& msg : buffer) {
              logFile << msg << '\n';
          }
          buffer.clear();
      }
  };
  ```
- **Key Concept:** Use atomic for lock-free counters; mutex required for non-thread-safe I/O; mutable allows modification in const operator(); memory_order_relaxed sufficient for independent counter

---

#### Q16
What's the difference in behavior between these two functors?
```cpp
class A {
public:
    int operator()(int x) const { return x * 2; }
};

class B {
public:
    int operator()(int x) { return x * 2; }
};

const A a;
const B b;
int r1 = a(5);  // Works
// int r2 = b(5);  // Error - explain why
```

**Answer:**
```
A works: operator() is const, can be called on const object
B fails: operator() is non-const, cannot be called on const object
Compilation error: "discards qualifiers" or "cannot call non-const member function on const object"
```

**Explanation:**
- **The difference: const qualifier**
  ```cpp
  class A {
      int operator()(int x) const { ... }  // CONST
  };

  class B {
      int operator()(int x) { ... }  // NON-CONST
  };
  ```
- **Const object behavior:**
  ```cpp
  const A a;        // Const object
  int r1 = a(5);    // ✅ OK: calls const operator()

  const B b;        // Const object
  // int r2 = b(5); // ❌ Error: operator() is non-const
  ```
- **Why B fails:**
  - `const B b` creates const object
  - Only const member functions can be called on const objects
  - `operator()(int x)` is non-const (might modify `*this`)
  - Compiler error: **"discards qualifiers"**
- **Fix for B:**
  ```cpp
  // Option 1: Make operator() const
  class B {
  public:
      int operator()(int x) const { return x * 2; }  // Now works
  };

  // Option 2: Remove const from object
  B b;  // Non-const object
  int r2 = b(5);  // Works now
  ```
- **Real-world implications:**
  ```cpp
  // STL algorithms create const copies
  std::vector<int> vec = {1, 2, 3};

  // for_each creates const copy if functor passed by value
  std::for_each(vec.begin(), vec.end(), A());  // ✅ Works (const operator())
  // std::for_each(vec.begin(), vec.end(), B());  // ❌ May not work

  // Functor stored in const context
  const std::function<int(int)> f = A();
  f(5);  // Works
  ```
- **When to use const operator():**
  - Functor doesn't modify member variables
  - Want to use with const functors
  - Want STL algorithm compatibility
  - **Best practice:** Always make operator() const unless you need to modify state
- **When non-const operator() acceptable:**
  ```cpp
  class Accumulator {
      int sum = 0;  // Modifies state
  public:
      void operator()(int x) {  // Non-const (must modify sum)
          sum += x;
      }
      int getSum() const { return sum; }
  };

  // Use with std::ref
  Accumulator acc;
  std::for_each(vec.begin(), vec.end(), std::ref(acc));  // Pass by reference
  ```
- **Const correctness best practices:**
  ```cpp
  class Functor {
      mutable int callCount = 0;  // Tracking (not part of logical state)
      int multiplier;              // Configuration (part of logical state)

  public:
      int operator()(int x) const {  // Const: doesn't change multiplier
          ++callCount;  // OK: callCount is mutable
          return x * multiplier;
      }
  };
  ```
- **Key Concept:** Const operator() can be called on const objects; non-const operator() cannot; always prefer const operator() unless modifying state; use mutable for implementation details

---

#### Q17
Implement a sensor filter functor for autonomous vehicles that maintains a moving window:
```cpp
class SensorFilter {
    // Your state variables
public:
    double operator()(double measurement) {
        // Implement moving average with window size 5
    }
};
```

**Answer:**
```cpp
class SensorFilter {
    std::deque<double> window;  // Efficient for front/back operations
    size_t windowSize;
    double sum;

public:
    SensorFilter(size_t size = 5)
        : windowSize(size), sum(0.0) {}

    double operator()(double measurement) {
        // Add new measurement
        window.push_back(measurement);
        sum += measurement;

        // Remove oldest if window full
        if (window.size() > windowSize) {
            sum -= window.front();
            window.pop_front();
        }

        // Return moving average
        return sum / window.size();
    }

    void reset() {
        window.clear();
        sum = 0.0;
    }

    size_t getWindowSize() const { return window.size(); }
};

// Usage:
SensorFilter filter(5);  // Window size 5
std::vector<double> sensor_readings = {10.0, 12.0, 11.0, 13.0, 10.5, 11.5};
for (double reading : sensor_readings) {
    double filtered = filter(reading);
    std::cout << "Raw: " << reading << ", Filtered: " << filtered << '\n';
}
```

**Explanation:**
- **Moving average: Smooths noisy sensor data**
  - Averages last N measurements
  - Reduces noise, shows trend
  - Critical for autonomous vehicle sensors (LIDAR, cameras, IMU)
- **Data structure choice: std::deque**
  ```cpp
  std::deque<double> window;
  ```
  - Efficient push_back() and pop_front()
  - Both O(1) operations
  - Perfect for sliding window pattern
- **Algorithm:**
  ```cpp
  // Step 1: Add new measurement
  window.push_back(measurement);  // O(1)
  sum += measurement;

  // Step 2: Remove oldest if window exceeds size
  if (window.size() > windowSize) {
      sum -= window.front();    // Subtract oldest value from sum
      window.pop_front();        // O(1) remove oldest
  }

  // Step 3: Return average
  return sum / window.size();
  ```
- **Why track sum separately:**
  ```cpp
  double sum;  // Cached sum of window
  ```
  - Avoids recalculating sum each time: O(1) instead of O(n)
  - Update sum incrementally: add new, subtract old
  - **Performance:** O(1) per measurement instead of O(n)
- **Example execution:**
  ```cpp
  SensorFilter filter(3);  // Window size 3

  filter(10.0);  // window=[10.0], sum=10.0, avg=10.0
  filter(12.0);  // window=[10.0,12.0], sum=22.0, avg=11.0
  filter(11.0);  // window=[10.0,12.0,11.0], sum=33.0, avg=11.0
  filter(13.0);  // window=[12.0,11.0,13.0], sum=36.0, avg=12.0 (removed 10.0)
  filter(10.5);  // window=[11.0,13.0,10.5], sum=34.5, avg=11.5 (removed 12.0)
  ```
- **Alternative: Circular buffer (more efficient)**
  ```cpp
  class SensorFilter {
      std::array<double, 5> buffer;  // Fixed-size circular buffer
      size_t index = 0;
      size_t count = 0;
      double sum = 0.0;

  public:
      double operator()(double measurement) {
          // Remove old value if buffer full
          if (count == buffer.size()) {
              sum -= buffer[index];
          } else {
              ++count;
          }

          // Add new value
          buffer[index] = measurement;
          sum += measurement;

          // Advance index (circular)
          index = (index + 1) % buffer.size();

          return sum / count;
      }
  };
  ```
  - No allocation (fixed size)
  - Cache-friendly (contiguous memory)
  - Slightly faster than deque
- **Real-world autonomous vehicle usage:**
  ```cpp
  // LIDAR distance sensor filter
  SensorFilter lidar_filter(10);  // 10-sample window

  while (vehicle.isRunning()) {
      double raw_distance = lidar.readDistance();
      double filtered_distance = lidar_filter(raw_distance);

      if (filtered_distance < SAFE_DISTANCE) {
          vehicle.applyBrakes();
      }
  }
  ```
- **Advanced: Weighted moving average**
  ```cpp
  class WeightedSensorFilter {
      std::deque<double> window;
      std::vector<double> weights;  // Most recent has higher weight

  public:
      WeightedSensorFilter(size_t size)
          : weights(size) {
          // Example: Linear weights [0.1, 0.15, 0.2, 0.25, 0.3]
          for (size_t i = 0; i < size; ++i) {
              weights[i] = (i + 1.0) / (size * (size + 1) / 2.0);
          }
      }

      double operator()(double measurement) {
          window.push_back(measurement);
          if (window.size() > weights.size()) {
              window.pop_front();
          }

          double weighted_sum = 0.0;
          for (size_t i = 0; i < window.size(); ++i) {
              weighted_sum += window[i] * weights[i];
          }
          return weighted_sum;
      }
  };
  ```
- **Key Concept:** Moving average smooths sensor noise; deque efficient for sliding window (O(1) front/back); cache sum for O(1) average; critical for real-time autonomous systems

---

#### Q18
Fix this lambda-to-functor conversion to preserve state correctly:
```cpp
// Lambda version
int multiplier = 3;
auto lambda = [multiplier](int x) { return x * multiplier; };

// Functor version - complete this
class Multiplier {
    // Your code
};
```

**Answer:**
```cpp
class Multiplier {
    int multiplier;  // Captured variable becomes member

public:
    // Constructor captures the value (like lambda capture)
    Multiplier(int m) : multiplier(m) {}

    // operator() uses the captured value
    int operator()(int x) const {
        return x * multiplier;
    }
};

// Usage (equivalent to lambda):
int multiplier = 3;
Multiplier func(multiplier);  // Capture by value
int result = func(5);  // Returns 15
```

**Explanation:**
- **Lambda capture → Member variable**
  ```cpp
  // Lambda captures multiplier by value
  auto lambda = [multiplier](int x) { return x * multiplier; };
  //             ^^^^^^^^^^
  //             Capture list

  // Functor stores multiplier as member
  class Multiplier {
      int multiplier;  // Captured variable
  ```
  - Lambda capture list becomes member variables
  - Constructor initializes members (simulates capture)
  - operator() uses members (simulates lambda body)
- **Complete equivalence:**
  ```cpp
  // Lambda (compiler-generated)
  int multiplier = 3;
  auto lambda = [multiplier](int x) { return x * multiplier; };

  // Behind the scenes, compiler generates something like:
  class __Lambda {
      int multiplier;  // Captured by value
  public:
      __Lambda(int m) : multiplier(m) {}
      int operator()(int x) const { return x * multiplier; }
  };
  __Lambda lambda(multiplier);
  ```
- **Capture by reference (lambda):**
  ```cpp
  // Lambda captures by reference
  int multiplier = 3;
  auto lambda = [&multiplier](int x) { return x * multiplier; };
  //             ^
  //             Capture by reference

  // Functor equivalent
  class MultiplierRef {
      int& multiplier;  // Reference member
  public:
      MultiplierRef(int& m) : multiplier(m) {}
      int operator()(int x) const {
          return x * multiplier;
      }
  };

  // Usage
  MultiplierRef func(multiplier);  // Pass reference
  multiplier = 5;  // Changing multiplier affects func
  func(10);  // Returns 50 (uses current multiplier value)
  ```
- **Multiple captures:**
  ```cpp
  // Lambda with multiple captures
  int a = 2, b = 3;
  auto lambda = [a, b](int x) { return x * a + b; };

  // Functor equivalent
  class MultiCapture {
      int a, b;
  public:
      MultiCapture(int a_, int b_) : a(a_), b(b_) {}
      int operator()(int x) const {
          return x * a + b;
      }
  };

  MultiCapture func(a, b);
  ```
- **Mutable lambda:**
  ```cpp
  // Lambda that modifies captured variable
  int count = 0;
  auto lambda = [count](int x) mutable { return x * ++count; };
  //                             ^^^^^^^
  //                             mutable keyword

  // Functor equivalent
  class MutableMultiplier {
      int count;
  public:
      MutableMultiplier(int c) : count(c) {}
      int operator()(int x) {  // Non-const operator()
          return x * ++count;
      }
  };
  ```
- **Capturing *this:**
  ```cpp
  struct Calculator {
      int factor = 2;

      auto getLambda() {
          return [this](int x) { return x * factor; };  // Captures this
      }

      // Functor equivalent
      class FactorMultiplier {
          Calculator* calc;  // Store pointer to Calculator
      public:
          FactorMultiplier(Calculator* c) : calc(c) {}
          int operator()(int x) const {
              return x * calc->factor;
          }
      };
  };
  ```
- **When to use functor over lambda:**
  - Need explicit type name (template parameters)
  - Complex logic with multiple helper methods
  - Want to define operator() separately
  - Need to forward-declare type
- **When lambda is better:**
  - Short, simple logic
  - Local use only
  - Don't need type name
  - Want concise syntax
- **Functor advantages:**
  ```cpp
  // Can add methods, state
  class Multiplier {
      int multiplier;
      int callCount = 0;
  public:
      Multiplier(int m) : multiplier(m) {}

      int operator()(int x) {
          ++callCount;
          return x * multiplier;
      }

      void setMultiplier(int m) { multiplier = m; }
      int getCallCount() const { return callCount; }
  };
  ```
- **Key Concept:** Lambda capture list maps to functor members; constructor initializes captured values; lambdas are syntactic sugar for functors; functors offer more flexibility (methods, state management)

---

#### Q19
Implement a functor that can be used with `std::priority_queue` to sort by absolute distance from a target:
```cpp
class DistanceComparator {
    // Your implementation
};

std::priority_queue<int, std::vector<int>, DistanceComparator> pq(/* your constructor args */);
```

**Answer:**
```cpp
class DistanceComparator {
    int target;
public:
    DistanceComparator(int t) : target(t) {}

    // Comparison: Returns true if a is "less than" b
    // For max-heap (default priority_queue): return true if a should come AFTER b
    bool operator()(int a, int b) const {
        int distA = std::abs(a - target);
        int distB = std::abs(b - target);
        return distA > distB;  // Max-heap: larger distance = lower priority
        // Elements with smaller distance to target have higher priority (come out first)
    }
};

// Usage:
int target = 50;
std::priority_queue<int, std::vector<int>, DistanceComparator> pq(DistanceComparator(target));

pq.push(45);  // distance: 5
pq.push(60);  // distance: 10
pq.push(48);  // distance: 2
pq.push(55);  // distance: 5

pq.top();  // Returns 48 (closest to 50, distance=2)
```

**Explanation:**
- **Priority queue comparison:**
  ```cpp
  bool operator()(int a, int b) const {
      return distA > distB;  // "a has lower priority than b"
  }
  ```
  - `operator()` returns true if `a` should come **after** `b`
  - `priority_queue` is a **max-heap** by default
  - Top element is the "maximum" according to comparator
  - **Confusing:** Return true means `a` has **lower** priority
- **Why `distA > distB`:**
  ```cpp
  // We want CLOSEST elements at top (min-distance)
  // priority_queue is max-heap (largest at top)
  // So we INVERT: larger distance = lower priority
  return distA > distB;
  ```
  - If `distA > distB`, return true → `a` comes after `b` → `b` has higher priority
  - Effectively creates min-distance heap
- **Step-by-step example:**
  ```cpp
  DistanceComparator comp(50);  // target = 50
  std::priority_queue<int, std::vector<int>, DistanceComparator> pq(comp);

  pq.push(45);  // |45-50| = 5
  pq.push(60);  // |60-50| = 10
  // Comparison: comp(45, 60) → 5 > 10? No → 45 stays at top

  pq.push(48);  // |48-50| = 2
  // Comparison: comp(45, 48) → 5 > 2? Yes → 48 bubbles to top
  // Now: pq.top() = 48

  pq.push(55);  // |55-50| = 5
  // Comparison: comp(55, 48) → 5 > 2? Yes → 48 remains at top
  ```
- **Alternative: Use std::greater-like syntax**
  ```cpp
  class ClosestToTarget {
      int target;
  public:
      ClosestToTarget(int t) : target(t) {}

      bool operator()(int a, int b) const {
          // Return true if a is "farther" than b (lower priority)
          return std::abs(a - target) > std::abs(b - target);
      }
  };
  ```
- **Comparison with std::greater:**
  ```cpp
  // Default: max-heap (largest at top)
  std::priority_queue<int> pq1;  // Uses std::less<int> by default
  pq1.push(10);
  pq1.push(30);
  pq1.push(20);
  pq1.top();  // 30 (largest)

  // Min-heap: smallest at top
  std::priority_queue<int, std::vector<int>, std::greater<int>> pq2;
  pq2.push(10);
  pq2.push(30);
  pq2.push(20);
  pq2.top();  // 10 (smallest)
  ```
- **Real-world use case: Nearest neighbor search**
  ```cpp
  struct Point {
      int x, y;
      int id;
  };

  class NearestToPoint {
      Point target;
  public:
      NearestToPoint(Point t) : target(t) {}

      bool operator()(const Point& a, const Point& b) const {
          int distA = (a.x - target.x) * (a.x - target.x) +
                      (a.y - target.y) * (a.y - target.y);
          int distB = (b.x - target.x) * (b.x - target.x) +
                      (b.y - target.y) * (b.y - target.y);
          return distA > distB;  // Closer points have higher priority
      }
  };

  // Find 5 nearest neighbors
  Point target = {50, 50};
  std::priority_queue<Point, std::vector<Point>, NearestToPoint> pq(NearestToPoint(target));

  // Add points
  for (const auto& point : allPoints) {
      pq.push(point);
      if (pq.size() > 5) pq.pop();  // Keep only 5 closest
  }

  // Top 5 are the nearest neighbors
  ```
- **Common mistake: Wrong comparison direction**
  ```cpp
  // WRONG: This creates max-distance heap (farthest at top)
  bool operator()(int a, int b) const {
      return std::abs(a - target) < std::abs(b - target);  // WRONG!
  }

  // CORRECT: Min-distance heap (closest at top)
  bool operator()(int a, int b) const {
      return std::abs(a - target) > std::abs(b - target);  // Correct
  }
  ```
- **Key Concept:** priority_queue comparator: return true if a has lower priority than b; invert comparison for min-heap behavior; absolute distance requires std::abs; useful for nearest-neighbor searches

---

#### Q20
Analyze this performance issue and propose an optimization:
```cpp
class ExpensiveFilter {
    std::vector<int> allowedValues;
public:
    ExpensiveFilter(std::vector<int> values) : allowedValues(values) {}

    bool operator()(int x) const {
        return std::find(allowedValues.begin(), allowedValues.end(), x)
               != allowedValues.end();
    }
};

std::vector<int> data = {/* 10,000 elements */};
ExpensiveFilter filter({1, 2, 3, 4, 5});
std::copy_if(data.begin(), data.end(), std::back_inserter(filtered), filter);
// Takes too long!
```

**Answer:**
```cpp
// Optimized version: Use unordered_set for O(1) lookup
class OptimizedFilter {
    std::unordered_set<int> allowedValues;  // Hash set instead of vector
public:
    OptimizedFilter(std::vector<int> values)
        : allowedValues(values.begin(), values.end()) {}  // Convert to set

    bool operator()(int x) const {
        return allowedValues.count(x) > 0;  // O(1) lookup
        // Or: return allowedValues.find(x) != allowedValues.end();
    }
};

// Performance:
// Original: O(n*m) where n=data size, m=allowedValues size
// Optimized: O(n+m) → O(n) when m is small
```

**Explanation:**
- **Original performance problem:**
  ```cpp
  std::find(allowedValues.begin(), allowedValues.end(), x)
  //        ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  //        Linear search: O(m) where m = allowedValues.size()
  ```
  - `std::find` on vector: **O(m) linear search**
  - Called for every element in `data`: **n times**
  - **Total complexity: O(n * m)**
  - For 10,000 data elements and 5 allowed values: **50,000 comparisons**
- **Why this is slow:**
  ```cpp
  ExpensiveFilter filter({1, 2, 3, 4, 5});  // m = 5

  // For each element in data (10,000 elements):
  for (int x : data) {  // n = 10,000
      filter(x);  // Linear search through 5 elements each time
  }

  // Total operations: 10,000 * 5 = 50,000 comparisons
  ```
- **Optimization: Use hash set (unordered_set)**
  ```cpp
  std::unordered_set<int> allowedValues;  // O(1) average lookup
  ```
  - **Construction:** O(m) to insert m elements
  - **Lookup:** O(1) average (hash table)
  - **Total complexity:** O(m + n) ≈ O(n) when m << n
- **Performance comparison:**
  ```
  Data size: 10,000
  Allowed values: 5

  Vector (std::find):
  - Lookup: O(5) per element
  - Total: 10,000 * 5 = 50,000 operations
  - Time: ~5ms

  Unordered_set (hash lookup):
  - Setup: O(5) one-time
  - Lookup: O(1) per element
  - Total: 5 + 10,000 = 10,005 operations
  - Time: ~0.1ms

  Speedup: 50x faster!
  ```
- **When vector is better:**
  ```cpp
  // If allowedValues is VERY small (1-2 elements)
  // Vector might be faster due to cache locality
  ExpensiveFilter filter({42});  // Only 1 allowed value

  // Vector: 1 comparison (very fast, cache-friendly)
  // Set: Hash computation + bucket lookup (overhead)
  ```
- **Alternative optimization: sorted vector + binary_search**
  ```cpp
  class SortedFilter {
      std::vector<int> allowedValues;
  public:
      SortedFilter(std::vector<int> values)
          : allowedValues(std::move(values)) {
          std::sort(allowedValues.begin(), allowedValues.end());
      }

      bool operator()(int x) const {
          return std::binary_search(allowedValues.begin(),
                                    allowedValues.end(), x);  // O(log m)
      }
  };

  // Complexity: O(m log m + n log m)
  // Better than O(n*m), but worse than O(n+m) with hash set
  ```
- **Benchmarks (10,000 data elements, 100 allowed values):**
  ```
  Vector + std::find:         ~50ms  (O(n*m) = 10,000 * 100)
  Sorted vector + binary:     ~2ms   (O(n log m) = 10,000 * log(100))
  Unordered_set + count:      ~0.5ms (O(n) = 10,000)
  ```
- **Trade-offs:**
  | Data Structure | Lookup | Memory | Cache | Best When |
  |----------------|--------|--------|-------|-----------|
  | vector | O(m) | Low | Excellent | m < 10 |
  | sorted vector | O(log m) | Low | Good | m = 10-1000 |
  | unordered_set | O(1) | High | Poor | m > 100 |
- **Complete optimized implementation:**
  ```cpp
  class OptimizedFilter {
      std::unordered_set<int> allowedValues;

  public:
      // Accept vector by value, move into set
      OptimizedFilter(std::vector<int> values)
          : allowedValues(std::make_move_iterator(values.begin()),
                          std::make_move_iterator(values.end())) {}

      // Accept initializer list directly
      OptimizedFilter(std::initializer_list<int> values)
          : allowedValues(values) {}

      bool operator()(int x) const {
          return allowedValues.count(x) > 0;
      }

      // Useful methods
      size_t size() const { return allowedValues.size(); }
      void addValue(int x) { allowedValues.insert(x); }
      void removeValue(int x) { allowedValues.erase(x); }
  };

  // Usage:
  OptimizedFilter filter({1, 2, 3, 4, 5});
  std::vector<int> data = {/* 10,000 elements */};
  std::vector<int> filtered;
  std::copy_if(data.begin(), data.end(),
               std::back_inserter(filtered), filter);
  // Much faster!
  ```
- **Key Concept:** Linear search in functor causes O(n*m) complexity; use hash set for O(1) lookup → O(n+m) complexity; 50x+ speedup for large datasets; trade memory for speed

---
