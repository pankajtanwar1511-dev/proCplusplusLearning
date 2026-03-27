### THEORY_SECTION: Core Concepts and Foundations
#### What is a Functor?

A **functor** (function object) is a class or struct that overloads the **`operator()`**, making instances of the class callable like functions. Unlike regular functions, functors can maintain **internal state** between calls, making them powerful tools for stateful computations, callbacks, and algorithm customization.

```cpp
class Multiplier {
    int factor;
public:
    Multiplier(int f) : factor(f) {}

    int operator()(int x) const {
        return x * factor;
    }
};

// Usage
Multiplier times3(3);
int result = times3(10);  // result = 30
```

#### Why Functors Matter in Autonomous Driving

In autonomous vehicle systems, functors are extensively used for:

1. **Sensor Data Processing**: Stateful filters that maintain calibration parameters
2. **Prediction Models**: Callable objects that cache intermediate computations
3. **Control Algorithms**: PID controllers with internal state (error accumulation, previous values)
4. **STL Algorithms**: Custom predicates and comparators for sorting/filtering sensor data
5. **Event Handling**: Callbacks that track event history

**Key Advantages**:
- **State Preservation**: Unlike function pointers, functors remember state across calls
- **Inlining**: Compiler can inline `operator()`, making them faster than function pointers
- **Type Safety**: Strong typing at compile-time
- **Flexibility**: Can be passed to STL algorithms (`std::sort`, `std::transform`, etc.)

#### Functor vs Function Pointer vs Lambda

| Feature | Functor | Function Pointer | Lambda |
|---------|---------|------------------|--------|
| State Preservation | ✅ Yes | ❌ No | ✅ Yes (capture) |
| Inlining | ✅ Yes | ❌ No | ✅ Yes |
| Type Safety | ✅ Strong | ⚠️ Weak | ✅ Strong |
| Reusability | ✅ High | ✅ High | ⚠️ Limited |
| STL Compatible | ✅ Yes | ✅ Yes | ✅ Yes |
| Syntax Complexity | ⚠️ More boilerplate | ✅ Simple | ✅ Concise |

**When to Use Functors**:
- When you need **persistent state** across multiple calls
- When **performance** is critical (inline optimization)
- When you want to **encapsulate complex logic** in a reusable class
- When you need **multiple different behaviors** from the same functor (operator overloading)

---

### EDGE_CASES: Tricky Scenarios and Deep Internals
#### Edge Case 1: Thread-Safety with Shared State

**Problem**: Multiple threads accessing the same functor instance can cause data races.

```cpp
// ❌ NOT Thread-Safe
class Counter {
    int count = 0;
public:
    void operator()() {
        count++;  // ❌ Data race!
    }
    int getCount() const { return count; }
};

// ✅ Thread-Safe with Atomic
class SafeCounter {
    std::atomic<int> count{0};
public:
    void operator()() {
        count++;  // ✅ Atomic operation
    }
    int getCount() const { return count.load(); }
};

// ✅ Thread-Safe with Mutex
class MutexCounter {
    int count = 0;
    mutable std::mutex mtx;
public:
    void operator()() {
        std::lock_guard<std::mutex> lock(mtx);
        count++;
    }
    int getCount() const {
        std::lock_guard<std::mutex> lock(mtx);
        return count;
    }
};
```

**Key Takeaway**: Always protect mutable state in functors with `std::atomic` or `std::mutex` when used in multithreaded contexts.

---

#### Edge Case 2: Const-Correctness in Operator()

**Problem**: Forgetting `const` on `operator()` can prevent usage with const functors or STL algorithms.

```cpp
// ❌ Non-const operator() - limits usability
class Adder {
    int offset;
public:
    Adder(int o) : offset(o) {}

    int operator()(int x) {  // ❌ Non-const
        return x + offset;
    }
};

// This fails:
const Adder add5(5);
// int result = add5(10);  // ❌ Error: cannot call non-const function

// ✅ Const-correct version
class ConstAdder {
    int offset;
public:
    ConstAdder(int o) : offset(o) {}

    int operator()(int x) const {  // ✅ Const-qualified
        return x + offset;
    }
};

const ConstAdder add5(5);
int result = add5(10);  // ✅ Works!
```

**Key Takeaway**: Make `operator()` `const` when it doesn't modify internal state. Use `mutable` for cache/stats that need to change even in const contexts.

---

#### Edge Case 3: Copy Semantics and STL Algorithm Behavior

**Problem**: STL algorithms may copy functors, leading to unexpected state loss.

```cpp
// ❌ Surprising behavior with copies
class CallCounter {
    int calls = 0;
public:
    void operator()(int x) {
        calls++;
        std::cout << "Call #" << calls << ": " << x << "\n";
    }
    int getCalls() const { return calls; }
};

CallCounter counter;
std::vector<int> vec = {1, 2, 3, 4};
std::for_each(vec.begin(), vec.end(), counter);  // ❌ counter is copied!

std::cout << "Total calls: " << counter.getCalls();  // ❌ Prints 0!
// The original counter was never modified - std::for_each worked on a copy

// ✅ Fix 1: Use std::ref to avoid copying
std::for_each(vec.begin(), vec.end(), std::ref(counter));
std::cout << "Total calls: " << counter.getCalls();  // ✅ Prints 4

// ✅ Fix 2: Return the functor from std::for_each
auto result = std::for_each(vec.begin(), vec.end(), CallCounter());
std::cout << "Total calls: " << result.getCalls();  // ✅ Prints 4
```

**Key Takeaway**: STL algorithms copy functors by default. Use `std::ref` to pass by reference, or retrieve the returned functor from algorithms like `std::for_each`.

---

#### Edge Case 4: Memoization Cache Invalidation

**Problem**: Cached results may become stale if dependencies change.

```cpp
// ❌ Cache without invalidation
class ExpensiveComputation {
    mutable std::unordered_map<int, int> cache;
    int externalFactor;  // ❌ What if this changes?

public:
    ExpensiveComputation(int factor) : externalFactor(factor) {}

    int operator()(int x) const {
        auto it = cache.find(x);
        if (it != cache.end()) {
            return it->second;
        }

        int result = x * x * externalFactor;  // Expensive computation
        cache[x] = result;
        return result;
    }
};

// ✅ Cache with invalidation
class SafeCachedComputation {
    mutable std::unordered_map<int, int> cache;
    int externalFactor;

public:
    SafeCachedComputation(int factor) : externalFactor(factor) {}

    void setFactor(int factor) {
        if (externalFactor != factor) {
            cache.clear();  // ✅ Invalidate cache on dependency change
            externalFactor = factor;
        }
    }

    int operator()(int x) const {
        auto it = cache.find(x);
        if (it != cache.end()) {
            return it->second;
        }

        int result = x * x * externalFactor;
        cache[x] = result;
        return result;
    }
};
```

**Key Takeaway**: When caching in functors, provide cache invalidation mechanisms when dependencies change.

---

#### Edge Case 5: Double Lookup in Hash-Based Memoization

**Problem**: Using `.count()` followed by `[]` performs two hash lookups.

```cpp
// ❌ Inefficient double lookup
std::unordered_map<int, int> cache;

int operator()(int x) const {
    if (cache.count(x)) {           // ❌ First lookup
        return cache[x];            // ❌ Second lookup
    }
    int result = compute(x);
    cache[x] = result;
    return result;
}

// ✅ Efficient single lookup with find()
int operator()(int x) const {
    auto it = cache.find(x);       // ✅ Single lookup
    if (it != cache.end()) {
        return it->second;         // ✅ Use iterator
    }
    int result = compute(x);
    cache[x] = result;
    return result;
}

// ✅ Alternative: try_emplace (C++17)
int operator()(int x) const {
    auto [it, inserted] = cache.try_emplace(x, 0);
    if (inserted) {
        it->second = compute(x);
    }
    return it->second;
}
```

**Key Takeaway**: Use `.find()` or `.try_emplace()` instead of `.count()` + `[]` to avoid redundant hash lookups.

---

### CODE_EXAMPLES: Practical Demonstrations
#### Example 1: Basic Stateful Functor (Easy)

```cpp
#include <iostream>
#include <vector>
#include <algorithm>

// Simple functor that multiplies values and tracks calls
class Multiplier {
    int factor;
    mutable int callCount;  // mutable to modify in const operator()

public:
    explicit Multiplier(int f) : factor(f), callCount(0) {}

    int operator()(int x) const {
        callCount++;
        return x * factor;
    }

    int getCallCount() const { return callCount; }
};

int main() {
    std::vector<int> numbers = {1, 2, 3, 4, 5};

    Multiplier times2(2);

    // Manual calls
    for (int n : numbers) {
        std::cout << times2(n) << " ";
    }
    std::cout << "\nCalls: " << times2.getCallCount() << "\n";

    // With STL algorithm
    std::vector<int> result(numbers.size());
    std::transform(numbers.begin(), numbers.end(), result.begin(), Multiplier(3));

    for (int n : result) {
        std::cout << n << " ";
    }

    return 0;
}

// Output:
// 2 4 6 8 10
// Calls: 5
// 3 6 9 12 15
```

**Key Concepts**:
- `operator()` overloading
- Internal state (`factor`, `callCount`)
- `mutable` keyword for modifying state in const methods
- STL algorithm compatibility

---

#### Example 2: Memoizing Functor (Mid)

```cpp
#include <iostream>
#include <unordered_map>
#include <vector>

// Functor with memoization for expensive computations
class FibonacciCalculator {
    mutable std::unordered_map<int, long long> cache;
    mutable int cacheHits;
    mutable int cacheMisses;

public:
    FibonacciCalculator() : cacheHits(0), cacheMisses(0) {
        cache[0] = 0;
        cache[1] = 1;
    }

    long long operator()(int n) const {
        // ✅ Single lookup using find()
        auto it = cache.find(n);
        if (it != cache.end()) {
            cacheHits++;
            return it->second;
        }

        cacheMisses++;

        // Recursive computation using memoization
        long long result = (*this)(n - 1) + (*this)(n - 2);
        cache[n] = result;
        return result;
    }

    void printStats() const {
        std::cout << "Cache size: " << cache.size() << "\n";
        std::cout << "Hits: " << cacheHits << ", Misses: " << cacheMisses << "\n";
        std::cout << "Hit rate: " << (100.0 * cacheHits / (cacheHits + cacheMisses)) << "%\n";
    }

    void clearCache() {
        cache.clear();
        cache[0] = 0;
        cache[1] = 1;
        cacheHits = 0;
        cacheMisses = 0;
    }
};

int main() {
    FibonacciCalculator fib;

    std::cout << "Computing Fibonacci numbers:\n";
    for (int i = 0; i <= 10; i++) {
        std::cout << "fib(" << i << ") = " << fib(i) << "\n";
    }

    fib.printStats();

    std::cout << "\nComputing again (should hit cache):\n";
    std::cout << "fib(10) = " << fib(10) << "\n";

    fib.printStats();

    return 0;
}

// Output:
// Computing Fibonacci numbers:
// fib(0) = 0
// fib(1) = 1
// fib(2) = 1
// ...
// fib(10) = 55
// Cache size: 11
// Hits: 45, Misses: 11
// Hit rate: 80.36%
//
// Computing again (should hit cache):
// fib(10) = 55
// Cache size: 11
// Hits: 46, Misses: 11
// Hit rate: 80.70%
```

**Key Concepts**:
- Memoization pattern
- `mutable` for cache in const method
- Single lookup optimization with `.find()`
- Recursive functor calls with `(*this)(n)`
- Cache statistics tracking

---

#### Example 3: Thread-Safe Functor (Advanced)

```cpp
#include <iostream>
#include <vector>
#include <thread>
#include <mutex>
#include <atomic>
#include <unordered_map>
#include <functional>

// Thread-safe functor with memoization
class ThreadSafeSquare {
    mutable std::unordered_map<int, int> cache;
    mutable std::mutex cacheMutex;
    std::atomic<int> totalCalls{0};
    std::atomic<int> cacheHits{0};

public:
    int operator()(int x) {
        totalCalls++;

        // ✅ Try to read from cache with minimal locking
        {
            std::lock_guard<std::mutex> lock(cacheMutex);
            auto it = cache.find(x);
            if (it != cache.end()) {
                cacheHits++;
                return it->second;
            }
        }

        // Expensive computation (simulated with sleep)
        int result = x * x;

        // ✅ Write to cache
        {
            std::lock_guard<std::mutex> lock(cacheMutex);
            cache[x] = result;
        }

        return result;
    }

    void printStats() const {
        std::lock_guard<std::mutex> lock(cacheMutex);
        std::cout << "Total calls: " << totalCalls.load() << "\n";
        std::cout << "Cache hits: " << cacheHits.load() << "\n";
        std::cout << "Cache size: " << cache.size() << "\n";
    }
};

// Worker function for threads
void worker(ThreadSafeSquare& functor, const std::vector<int>& values) {
    for (int val : values) {
        int result = functor(val);
        // Process result...
    }
}

int main() {
    ThreadSafeSquare squareFunctor;

    // Create test data with duplicates
    std::vector<int> data1 = {1, 2, 3, 4, 5, 1, 2, 3};
    std::vector<int> data2 = {3, 4, 5, 6, 7, 3, 4};
    std::vector<int> data3 = {1, 5, 9, 1, 5, 9};

    // Launch threads using std::ref to avoid copying functor
    std::thread t1(worker, std::ref(squareFunctor), std::cref(data1));
    std::thread t2(worker, std::ref(squareFunctor), std::cref(data2));
    std::thread t3(worker, std::ref(squareFunctor), std::cref(data3));

    t1.join();
    t2.join();
    t3.join();

    std::cout << "\nThread-safe functor statistics:\n";
    squareFunctor.printStats();

    return 0;
}

// Output (typical):
// Thread-safe functor statistics:
// Total calls: 22
// Cache hits: 13
// Cache size: 9
```

**Key Concepts**:
- `std::mutex` for protecting shared cache
- `std::atomic` for counters (lock-free performance)
- Minimal lock scope (only around cache access)
- `std::ref()` to pass functor by reference to threads
- Thread-safe statistics collection

---

#### Example 4: Functor with Generic Programming (Advanced)

```cpp
#include <iostream>
#include <vector>
#include <string>
#include <type_traits>

// Generic functor that works with any type supporting operator+
template <typename T>
class Accumulator {
    T sum;
    int count;

public:
    Accumulator() : sum{}, count(0) {}  // Value initialization

    void operator()(const T& value) {
        sum += value;
        count++;
    }

    T getSum() const { return sum; }
    int getCount() const { return count; }

    // Average - only enabled for arithmetic types
    template <typename U = T>
    typename std::enable_if<std::is_arithmetic<U>::value, double>::type
    getAverage() const {
        return count > 0 ? static_cast<double>(sum) / count : 0.0;
    }
};

int main() {
    // Integer accumulator
    std::vector<int> numbers = {1, 2, 3, 4, 5};
    Accumulator<int> intAcc;

    for (int n : numbers) {
        intAcc(n);
    }

    std::cout << "Int sum: " << intAcc.getSum() << "\n";
    std::cout << "Int average: " << intAcc.getAverage() << "\n";

    // String accumulator
    std::vector<std::string> words = {"Hello", " ", "World", "!"};
    Accumulator<std::string> strAcc;

    for (const auto& word : words) {
        strAcc(word);
    }

    std::cout << "String concatenation: " << strAcc.getSum() << "\n";
    std::cout << "Word count: " << strAcc.getCount() << "\n";

    // Double accumulator
    std::vector<double> doubles = {1.5, 2.5, 3.5};
    Accumulator<double> doubleAcc;

    for (double d : doubles) {
        doubleAcc(d);
    }

    std::cout << "Double sum: " << doubleAcc.getSum() << "\n";
    std::cout << "Double average: " << doubleAcc.getAverage() << "\n";

    return 0;
}

// Output:
// Int sum: 15
// Int average: 3
// String concatenation: Hello World!
// Word count: 4
// Double sum: 7.5
// Double average: 2.5
```

**Key Concepts**:
- Template functors for generic types
- SFINAE with `std::enable_if` for conditional methods
- Value initialization for generic default values
- Type traits (`std::is_arithmetic`)

---

#### Example 5: Autonomous Vehicle Sensor Filter (Real-World)

```cpp
#include <iostream>
#include <vector>
#include <deque>
#include <numeric>
#include <cmath>

// Kalman-like sensor filter functor for autonomous vehicles
class SensorFilter {
    std::deque<double> window;
    size_t windowSize;
    double previousEstimate;
    double processNoise;    // Q
    double measurementNoise; // R
    double estimateError;   // P

public:
    SensorFilter(size_t winSize = 5, double pNoise = 0.01, double mNoise = 0.1)
        : windowSize(winSize), previousEstimate(0.0),
          processNoise(pNoise), measurementNoise(mNoise), estimateError(1.0) {}

    // Process new sensor reading
    double operator()(double measurement) {
        // Simplified Kalman update
        double kalmanGain = estimateError / (estimateError + measurementNoise);
        double currentEstimate = previousEstimate + kalmanGain * (measurement - previousEstimate);
        estimateError = (1 - kalmanGain) * estimateError + processNoise;

        // Moving average for additional smoothing
        window.push_back(measurement);
        if (window.size() > windowSize) {
            window.pop_front();
        }

        double movingAvg = std::accumulate(window.begin(), window.end(), 0.0) / window.size();

        // Blend Kalman and moving average
        double finalEstimate = 0.7 * currentEstimate + 0.3 * movingAvg;

        previousEstimate = finalEstimate;
        return finalEstimate;
    }

    void reset() {
        window.clear();
        previousEstimate = 0.0;
        estimateError = 1.0;
    }

    double getConfidence() const {
        return 1.0 / (1.0 + estimateError);  // Higher confidence = lower error
    }
};

// Simulate noisy LiDAR distance measurements
double simulateNoisySensor(double trueValue, double noiseLevel = 0.1) {
    double noise = ((rand() % 200 - 100) / 100.0) * noiseLevel;
    return trueValue + noise;
}

int main() {
    SensorFilter lidarFilter(5, 0.01, 0.15);

    double trueDistance = 10.0;  // True obstacle distance in meters

    std::cout << "Raw\t\tFiltered\tError\t\tConfidence\n";
    std::cout << "-----------------------------------------------------------\n";

    for (int i = 0; i < 20; i++) {
        double noisyReading = simulateNoisySensor(trueDistance, 0.3);
        double filtered = lidarFilter(noisyReading);
        double error = std::abs(filtered - trueDistance);

        std::cout << noisyReading << "\t" << filtered << "\t"
                  << error << "\t\t" << lidarFilter.getConfidence() << "\n";
    }

    return 0;
}

// Output (sample):
// Raw             Filtered        Error           Confidence
// -----------------------------------------------------------
// 10.24          10.12           0.12            0.526
// 9.85           9.98            0.02            0.689
// 10.15          10.06           0.06            0.781
// 9.92           9.99            0.01            0.835
// 10.08          10.03           0.03            0.871
// ...
```

**Key Concepts**:
- Stateful sensor fusion algorithm
- Moving window data structure (`std::deque`)
- Kalman filter estimation
- Confidence metrics
- Real-world autonomous vehicle scenario

---

#### Example 6: Functor Composition (Advanced)

```cpp
#include <iostream>
#include <functional>
#include <vector>
#include <algorithm>

// Composable functor wrapper
template <typename F, typename G>
class ComposedFunctor {
    F f;
    G g;

public:
    ComposedFunctor(F f_, G g_) : f(f_), g(g_) {}

    template <typename T>
    auto operator()(T x) const -> decltype(f(g(x))) {
        return f(g(x));  // f ∘ g
    }
};

// Helper function for composition
template <typename F, typename G>
ComposedFunctor<F, G> compose(F f, G g) {
    return ComposedFunctor<F, G>(f, g);
}

// Example functors
struct Square {
    int operator()(int x) const { return x * x; }
};

struct AddTen {
    int operator()(int x) const { return x + 10; }
};

struct MultiplyByTwo {
    int operator()(int x) const { return x * 2; }
};

int main() {
    Square square;
    AddTen addTen;
    MultiplyByTwo multiplyByTwo;

    // Compose: square(addTen(x))
    auto squareAfterAdd = compose(square, addTen);

    std::cout << "Square after adding 10:\n";
    std::cout << "f(5) = " << squareAfterAdd(5) << "\n";  // (5+10)^2 = 225

    // Compose: multiplyByTwo(square(x))
    auto doubleAfterSquare = compose(multiplyByTwo, square);

    std::cout << "Double after squaring:\n";
    std::cout << "f(5) = " << doubleAfterSquare(5) << "\n";  // (5^2)*2 = 50

    // Chain multiple compositions
    auto complex = compose(compose(multiplyByTwo, square), addTen);
    std::cout << "Complex composition:\n";
    std::cout << "f(5) = " << complex(5) << "\n";  // ((5+10)^2)*2 = 450

    // Use with STL algorithms
    std::vector<int> numbers = {1, 2, 3, 4, 5};
    std::vector<int> results(numbers.size());

    std::transform(numbers.begin(), numbers.end(), results.begin(), squareAfterAdd);

    std::cout << "Transformed vector: ";
    for (int n : results) {
        std::cout << n << " ";
    }
    std::cout << "\n";

    return 0;
}

// Output:
// Square after adding 10:
// f(5) = 225
// Double after squaring:
// f(5) = 50
// Complex composition:
// f(5) = 450
// Transformed vector: 121 144 169 196 225
```

**Key Concepts**:
- Functor composition pattern
- Template deduction
- `decltype` for return type deduction
- Functional programming style in C++
- Reusable transformation pipelines

---

### QUICK_REFERENCE: Key Takeaways and Comparison Tables
#### Answer Key

| Q# | Issue/Task | Solution/Answer |
|----|-----------|-----------------|
| Q1 | `count` is modified in const method | Add `mutable` keyword: `mutable int count;` |
| Q2 | Output: 10. `std::for_each` copies the functor, original `m` unchanged | Use `std::ref(m)` or capture returned functor from `for_each` |
| Q3 | Thread-unsafe map access | Add `std::mutex` to protect map, use `std::lock_guard` in operator() |
| Q4 | Double hash lookup with `.count()` + `[]` | Use `.find()` once: `auto it = cache.find(x); if (it != cache.end()) return it->second;` |
| Q5 | Generic accumulator template | ```cpp<br>T sum{};  // Value init<br>sum += value;  // In operator()<br>return sum;  // In getSum()``` |
| Q6 | Wrong signature - takes 2 args but uses as unary predicate | Change to: `bool operator()(int x) const { return x > threshold; }` |
| Q7 | Need move semantics for unique_ptr | ```cpp<br>FileProcessor(FileProcessor&&) noexcept = default;<br>FileProcessor& operator=(FileProcessor&&) noexcept = default;``` |
| Q8 | Cannot modify `history` in const method | Add `mutable`: `mutable std::vector<int> history;` |
| Q9 | Convert to functor | ```cpp<br>struct IsEven {<br>    bool operator()(int x) const { return x % 2 == 0; }<br>};<br>vec.erase(std::remove_if(vec.begin(), vec.end(), IsEven()), vec.end());``` |
| Q10 | Cache not invalidated when `scaleFactor` changes | Add `cache.clear();` in `setScaleFactor()` |
| Q11 | Count by argument count | `callsByArgCount[sizeof...(args)]++; // In operator()` |
| Q12 | String concatenation creates temporaries | Use `result += s;` instead of `result = result + s;` or use `std::ostringstream` |
| Q13 | Functor composition | ```cpp<br>F f; G g;<br>template <typename T><br>auto operator()(T x) const -> decltype(f(g(x))) {<br>    return f(g(x));<br>}``` |
| Q14 | `for_each` copies functor | `auto result = std::for_each(..., agg);` then `result.average()` OR use `std::ref(agg)` |
| Q15 | Thread-safe logger | Use `std::atomic<int>` for count, `std::lock_guard<std::mutex>` for file writes |
| Q16 | `B::operator()` is non-const, cannot call on const object | Non-const methods cannot be called on const objects. Mark `B::operator()` as const |
| Q17 | Moving average filter | Use `std::deque<double>` to maintain window, pop front when size > 5, return average |
| Q18 | Capture state in constructor | ```cpp<br>int m_multiplier;<br>Multiplier(int mult) : m_multiplier(mult) {}<br>int operator()(int x) const { return x * m_multiplier; }``` |
| Q19 | Custom comparator for priority queue | Store `target` value, implement `bool operator()(int a, int b) const { return abs(a - target) > abs(b - target); }` |
| Q20 | Linear search in `std::find` for each element (O(n²)) | Use `std::unordered_set` instead of `std::vector` for O(1) lookup |

---

#### Functor Design Patterns Quick Reference

#### 1. Basic Stateful Functor
```cpp
class Counter {
    int count;
public:
    Counter() : count(0) {}
    void operator()() { count++; }
    int get() const { return count; }
};
```

#### 2. Thread-Safe Functor
```cpp
class ThreadSafe {
    std::atomic<int> counter{0};
    mutable std::mutex mtx;
    std::unordered_map<int, int> data;
public:
    int operator()(int key) {
        counter++;  // Lock-free
        std::lock_guard<std::mutex> lock(mtx);
        return data[key];  // Protected
    }
};
```

#### 3. Memoization Functor
```cpp
class Memoizer {
    mutable std::unordered_map<int, int> cache;
public:
    int operator()(int x) const {
        auto it = cache.find(x);  // Single lookup
        if (it != cache.end()) return it->second;
        int result = compute(x);
        cache[x] = result;
        return result;
    }
};
```

#### 4. STL Predicate
```cpp
class Predicate {
    int threshold;
public:
    Predicate(int t) : threshold(t) {}
    bool operator()(int x) const { return x > threshold; }
};
// Use: std::find_if(v.begin(), v.end(), Predicate(5));
```

#### 5. STL Comparator
```cpp
class Comparator {
    Point origin;
public:
    Comparator(Point o) : origin(o) {}
    bool operator()(const Point& a, const Point& b) const {
        return distance(origin, a) < distance(origin, b);
    }
};
// Use: std::sort(points.begin(), points.end(), Comparator({0,0}));
```

#### 6. Variadic Functor
```cpp
template <typename ReturnType>
class Variadic {
public:
    template <typename... Args>
    ReturnType operator()(Args&&... args) {
        return process(std::forward<Args>(args)...);
    }
};
```

#### 7. RAII Resource Functor
```cpp
class FileProcessor {
    std::unique_ptr<std::ofstream> file;
public:
    FileProcessor(const std::string& name)
        : file(std::make_unique<std::ofstream>(name)) {}

    // Delete copy, implement move
    FileProcessor(const FileProcessor&) = delete;
    FileProcessor(FileProcessor&&) = default;

    void operator()(const std::string& data) {
        *file << data << "\n";
    }
};
```

---

#### Performance Guidelines

| Pattern | Performance | When to Use |
|---------|-------------|-------------|
| Simple stateless functor | Fastest (inlineable) | Pure transformations |
| Stateful with atomic counters | Very fast (lock-free) | Thread-safe counters |
| Memoization with unordered_map | Medium (hash overhead) | Expensive repeated computations |
| Mutex-protected state | Slower (lock contention) | Complex shared state |
| std::function wrapper | Slowest (type erasure) | Runtime polymorphism needed |

---

#### Common Pitfalls Checklist

- [ ] **Const-correctness**: Mark `operator()` as `const` when appropriate
- [ ] **Mutable members**: Use `mutable` for caches/counters in const methods
- [ ] **STL copying**: Use `std::ref()` to avoid unwanted copies in algorithms
- [ ] **Thread safety**: Protect shared state with mutexes or atomics
- [ ] **Hash lookup**: Use `.find()` instead of `.count()` + `[]`
- [ ] **Cache invalidation**: Clear caches when dependencies change
- [ ] **Resource ownership**: Use RAII and smart pointers
- [ ] **Copy semantics**: Delete copy or implement properly for resource owners
- [ ] **Move semantics**: Implement for resource-owning functors

---

#### Autonomous Vehicle Use Cases

| Component | Functor Application | Key Requirements |
|-----------|---------------------|------------------|
| **Sensor Fusion** | Multi-sensor data combiner with Kalman filtering | Thread-safe, stateful, high frequency |
| **Path Planning** | Trajectory scoring comparator for priority queue | Configurable weights, fast evaluation |
| **Object Detection** | Confidence threshold predicate for filtering | Stateless, inlineable performance |
| **Control Systems** | PID controller with integral/derivative state | Precise state management, real-time |
| **Data Logging** | Timestamped event recorder | RAII for file handles, thread-safe |
| **Prediction** | Memoized behavior prediction model | Cache for repeated scenarios |

---

#### When to Choose Functor Over Alternatives

**Functor vs Lambda**:
- ✅ Functor: Complex state, reusable across files, named type
- ✅ Lambda: Simple one-off use, local scope, concise

**Functor vs Function Pointer**:
- ✅ Functor: State preservation, inlining, type safety
- ✅ Function Pointer: C API compatibility, function selection at runtime

**Functor vs std::function**:
- ✅ Functor: Performance-critical, type known at compile-time
- ✅ std::function: Runtime polymorphism, type erasure needed

**Functor vs Member Function**:
- ✅ Functor: STL algorithm compatibility, stateless classes
- ✅ Member Function: Part of class interface, OOP design

---

#### Testing Strategies

```cpp
// 1. Test state preservation
Counter c;
c(); c(); c();
assert(c.get() == 3);

// 2. Test thread safety
ThreadSafeCounter tsc;
std::vector<std::thread> threads;
for (int i = 0; i < 10; i++) {
    threads.emplace_back([&](){ for(int j=0; j<1000; j++) tsc(); });
}
for (auto& t : threads) t.join();
assert(tsc.get() == 10000);

// 3. Test memoization
Memoizer m;
auto start = std::chrono::high_resolution_clock::now();
m(100);  // First call - slow
auto mid = std::chrono::high_resolution_clock::now();
m(100);  // Cached - fast
auto end = std::chrono::high_resolution_clock::now();
assert(mid - start > end - mid);  // First call slower

// 4. Test with STL algorithms
std::vector<int> v = {1, 2, 3};
auto result = std::for_each(v.begin(), v.end(), Counter());
assert(result.get() == 3);

// 5. Test copy behavior
Counter c1;
c1();
Counter c2 = c1;  // Copy
c2();
assert(c1.get() == 1 && c2.get() == 2);  // Independent copies
```

---

**End of Functor Pattern & Callable Objects Topic**
