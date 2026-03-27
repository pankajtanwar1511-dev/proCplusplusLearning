# TOPIC: Functor Pattern & Callable Objects

---

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

### INTERVIEW_QA: Comprehensive Questions and Answers
#### Q1: What is a functor in C++ and how does it differ from a regular function?
**Difficulty:** #beginner
**Category:** #conceptual
**Concepts:** #functor_basics #operator_overloading

**Question:** What is a functor in C++ and how does it differ from a regular function?



**Answer**: A functor (function object) is a class or struct that overloads `operator()`, allowing instances to be called like functions. Unlike regular functions, functors can maintain internal state between calls and can have member variables, constructors, and destructors.

**Explanation**:
```cpp
// Regular function - stateless
int multiply(int x) {
    return x * 2;
}

// Functor - can have state
class Multiplier {
    int factor;
public:
    Multiplier(int f) : factor(f) {}
    int operator()(int x) const { return x * factor; }
};

// Usage
int result1 = multiply(5);        // Always doubles
Multiplier times3(3);
int result2 = times3(5);          // Multiplies by stored factor
```

Functors provide:
1. **State preservation** across calls
2. **Better inlining** by compilers (faster than function pointers)
3. **Type safety** at compile-time
4. **Compatibility** with STL algorithms

**Key Takeaway**: Functors combine the flexibility of functions with the state management of objects, making them ideal for customizable algorithms and stateful operations.

---

#### Q2: Why should `operator()` be declared `const` in many functors?
**Difficulty:** #beginner
**Category:** #syntax
**Concepts:** #operator_overloading #constcorrectness

**Question:** Why should `operator()` be declared `const` in many functors?



**Answer**: `operator()` should be `const` when it doesn't modify the functor's internal state (or only modifies `mutable` members). This allows the functor to be used in contexts that expect const objects, including many STL algorithms.

**Explanation**:
```cpp
// ❌ Non-const operator() - limited usability
class Adder {
    int value;
public:
    Adder(int v) : value(v) {}
    int operator()(int x) { return x + value; }  // Non-const
};

const Adder add5(5);
// int result = add5(10);  // ❌ Compiler error!

// ✅ Const operator() - widely usable
class ConstAdder {
    int value;
    mutable int callCount;  // Can modify in const method
public:
    ConstAdder(int v) : value(v), callCount(0) {}
    int operator()(int x) const {
        callCount++;  // OK - mutable member
        return x + value;
    }
};

const ConstAdder add5(5);
int result = add5(10);  // ✅ Works!
```

**Key Takeaway**: Mark `operator()` as `const` unless it genuinely needs to modify non-mutable state. Use `mutable` for members like counters or caches that should be modifiable even in const contexts.

---

#### Q3: Why might a functor's state not update as expected when used with STL...
**Difficulty:** #mid
**Category:** #best_practices
**Concepts:** #stl_algorithms #copy_semantics

**Question:** Why might a functor's state not update as expected when used with STL algorithms? How can you fix this?



**Answer**: STL algorithms like `std::for_each` pass functors **by value** (making copies), so modifications to the functor's state affect the copy, not the original. Solutions: (1) use `std::ref()` to pass by reference, or (2) capture the returned functor from algorithms.

**Explanation**:
```cpp
class Counter {
    int count = 0;
public:
    void operator()(int x) { count++; }
    int getCount() const { return count; }
};

std::vector<int> vec = {1, 2, 3, 4};
Counter counter;

// ❌ Problem: counter is copied
std::for_each(vec.begin(), vec.end(), counter);
std::cout << counter.getCount();  // Prints 0! (original unchanged)

// ✅ Fix 1: Use std::ref()
std::for_each(vec.begin(), vec.end(), std::ref(counter));
std::cout << counter.getCount();  // Prints 4

// ✅ Fix 2: Capture returned functor
auto result = std::for_each(vec.begin(), vec.end(), Counter());
std::cout << result.getCount();  // Prints 4
```

**Key Takeaway**: Always use `std::ref()` when you need to preserve functor state across STL algorithm calls, or capture the returned functor.

---

#### Q4: What's wrong with using `map.count(key)` followed by `map[key]` in a...
**Difficulty:** #mid
**Category:** #performance
**Concepts:** #hash_maps #optimization

**Question:** What's wrong with using `map.count(key)` followed by `map[key]` in a memoizing functor? How can you optimize it?



**Answer**: Using `.count()` followed by `[]` performs **two hash lookups**, which is inefficient. Instead, use `.find()` to perform a single lookup and use the returned iterator for both checking existence and accessing the value.

**Explanation**:
```cpp
// ❌ Inefficient - two hash lookups
std::unordered_map<int, int> cache;

int operator()(int x) const {
    if (cache.count(x)) {        // Lookup #1
        return cache[x];         // Lookup #2
    }
    int result = compute(x);
    cache[x] = result;
    return result;
}

// ✅ Efficient - single hash lookup
int operator()(int x) const {
    auto it = cache.find(x);    // Single lookup
    if (it != cache.end()) {
        return it->second;      // Use iterator
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

**Key Takeaway**: Use `.find()` or `.try_emplace()` instead of `.count()` + `[]` to minimize hash lookups in performance-critical code.

---

#### Q5: How do you make a functor thread-safe when multiple threads need to access...
**Difficulty:** #mid
**Category:** #multithreading
**Concepts:** #thread_safety #atomics #mutexes

**Question:** How do you make a functor thread-safe when multiple threads need to access shared state?



**Answer**: Protect mutable state with either `std::atomic` (for simple counters/flags) or `std::mutex` (for complex state like maps). Use minimal lock scopes to maximize concurrency.

**Explanation**:
```cpp
// ❌ Not thread-safe
class UnsafeFunctor {
    int count = 0;
    std::unordered_map<int, int> cache;
public:
    int operator()(int x) {
        count++;  // ❌ Data race
        auto it = cache.find(x);  // ❌ Data race
        // ...
    }
};

// ✅ Thread-safe with atomic + mutex
class SafeFunctor {
    std::atomic<int> count{0};
    mutable std::unordered_map<int, int> cache;
    mutable std::mutex cacheMutex;

public:
    int operator()(int x) {
        count++;  // ✅ Lock-free atomic operation

        {
            std::lock_guard<std::mutex> lock(cacheMutex);
            auto it = cache.find(x);  // ✅ Protected by mutex
            if (it != cache.end()) {
                return it->second;
            }
        }

        int result = compute(x);

        {
            std::lock_guard<std::mutex> lock(cacheMutex);
            cache[x] = result;  // ✅ Protected by mutex
        }

        return result;
    }
};
```

**Key Takeaway**: Use `std::atomic` for simple counters and `std::mutex` for complex data structures. Keep lock scopes minimal to avoid unnecessary contention.

---

#### Q6: When implementing a memoizing functor with external dependencies, what issue...
**Difficulty:** #advanced
**Category:** #memory_management
**Concepts:** #memoization #cache_invalidation

**Question:** When implementing a memoizing functor with external dependencies, what issue can arise and how do you handle it?



**Answer**: **Cache invalidation problem**: if the functor's behavior depends on external state (e.g., configuration parameters), the cached results may become stale when that external state changes. You must provide a mechanism to invalidate/clear the cache when dependencies change.

**Explanation**:
```cpp
// ❌ Cache without invalidation
class StaleCache {
    mutable std::unordered_map<int, int> cache;
    int externalFactor;  // ❌ Cache not invalidated when this changes

public:
    void setFactor(int f) { externalFactor = f; }  // ❌ Cache still has old results!

    int operator()(int x) const {
        auto it = cache.find(x);
        if (it != cache.end()) return it->second;  // ❌ May return stale data

        int result = x * externalFactor;
        cache[x] = result;
        return result;
    }
};

// ✅ Cache with proper invalidation
class ValidCache {
    mutable std::unordered_map<int, int> cache;
    int externalFactor;

public:
    void setFactor(int f) {
        if (externalFactor != f) {
            cache.clear();  // ✅ Invalidate cache on dependency change
            externalFactor = f;
        }
    }

    int operator()(int x) const {
        auto it = cache.find(x);
        if (it != cache.end()) return it->second;

        int result = x * externalFactor;
        cache[x] = result;
        return result;
    }
};
```

**Key Takeaway**: Always provide cache invalidation when memoization depends on external state. Consider versioning schemes for more granular control.

---

#### Q7: Why are functors often faster than function pointers when passed to STL...
**Difficulty:** #advanced
**Category:** #performance
**Concepts:** #inlining #optimization

**Question:** Why are functors often faster than function pointers when passed to STL algorithms?



**Answer**: Functors enable **compiler inlining** of the `operator()` call, eliminating function call overhead. Function pointers cannot be inlined because the target function is not known at compile-time, requiring runtime indirection.

**Explanation**:
```cpp
// Function pointer - cannot inline
int (*funcPtr)(int) = [](int x) { return x * 2; };
std::transform(vec.begin(), vec.end(), out.begin(), funcPtr);
// Compiler generates: call through pointer (runtime overhead)

// Functor - can inline
struct Doubler {
    int operator()(int x) const { return x * 2; }
};
std::transform(vec.begin(), vec.end(), out.begin(), Doubler());
// Compiler can inline: out[i] = vec[i] * 2; (no call overhead)

// Lambda (also inlineable)
std::transform(vec.begin(), vec.end(), out.begin(), [](int x) { return x * 2; });
// Compiler treats like functor, can inline
```

**Performance Comparison** (typical):
- Function pointer: ~10-15% slower (indirect call overhead)
- Functor/Lambda: Full inlining, optimal performance

**Key Takeaway**: Functors and lambdas enable aggressive compiler optimizations through inlining, making them faster than function pointers for performance-critical code.

---

#### Q8: How can you implement functor composition in C++ to create reusable...
**Difficulty:** #advanced
**Category:** #design_patterns
**Concepts:** #composability #functional_programming

**Question:** How can you implement functor composition in C++ to create reusable transformation pipelines?



**Answer**: Create a `ComposedFunctor` template that wraps two functors and applies them in sequence (f ∘ g). Use template deduction and `decltype` to handle arbitrary return types.

**Explanation**:
```cpp
// Composition template
template <typename F, typename G>
class ComposedFunctor {
    F f;
    G g;
public:
    ComposedFunctor(F f_, G g_) : f(f_), g(g_) {}

    template <typename T>
    auto operator()(T x) const -> decltype(f(g(x))) {
        return f(g(x));  // Apply g first, then f
    }
};

// Helper function
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

// Compose: square(addTen(x))
auto pipeline = compose(Square(), AddTen());
int result = pipeline(5);  // (5 + 10)^2 = 225

// Chain multiple compositions
auto complex = compose(compose(MultiplyByTwo(), Square()), AddTen());
// Equivalent to: MultiplyByTwo(Square(AddTen(x)))
```

**Benefits**:
- **Reusability**: Build complex operations from simple components
- **Type safety**: Compile-time type checking
- **Performance**: Inlining opportunities
- **Clarity**: Declarative pipeline construction

**Key Takeaway**: Functor composition enables functional programming patterns in C++, creating modular and reusable transformation pipelines.

---

#### Q9: How do you create a generic functor that works with different types and...
**Difficulty:** #advanced
**Category:** #generic_programming
**Concepts:** #templates #sfinae #type_traits

**Question:** How do you create a generic functor that works with different types and conditionally enables certain methods based on type properties?



**Answer**: Use **template functors** with `std::enable_if` and type traits to conditionally enable methods. Use SFINAE (Substitution Failure Is Not An Error) to remove invalid template instantiations.

**Explanation**:
```cpp
#include <type_traits>

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

    // ✅ Average - only enabled for arithmetic types
    template <typename U = T>
    typename std::enable_if<std::is_arithmetic<U>::value, double>::type
    getAverage() const {
        return count > 0 ? static_cast<double>(sum) / count : 0.0;
    }

    // ✅ Length - only enabled for types with .size()
    template <typename U = T>
    typename std::enable_if<std::is_same<U, std::string>::value, size_t>::type
    getTotalLength() const {
        return sum.size();
    }
};

// Usage
Accumulator<int> intAcc;
intAcc.getAverage();     // ✅ Works - int is arithmetic

Accumulator<std::string> strAcc;
// strAcc.getAverage();  // ❌ Compile error - method doesn't exist
strAcc.getTotalLength(); // ✅ Works - enabled for string
```

**Key Takeaway**: Use SFINAE and type traits to create generic functors with type-dependent interfaces, enabling code reuse while maintaining type safety.

---

#### Q10: When should you use a functor class instead of a lambda expression?
**Difficulty:** #mid
**Category:** #comparison
**Concepts:** #functors_vs_lambdas

**Question:** When should you use a functor class instead of a lambda expression?



**Answer**: Use **functors** when you need:
1. **Named, reusable** callable objects used in multiple places
2. **Complex internal state** with multiple member variables and methods
3. **Multiple operator()** overloads for different argument types
4. **Inheritance** or polymorphic behavior
5. **Explicit type names** for better error messages

Use **lambdas** when you need:
1. **One-off** callable for immediate use
2. **Simple state** (captured variables)
3. **Concise syntax** for inline algorithms
4. **Local scope** callbacks

**Explanation**:
```cpp
// ✅ Functor - complex reusable logic
class SensorFilter {
    std::deque<double> history;
    double kalmanGain;
    double estimate;
public:
    SensorFilter(size_t windowSize);
    double operator()(double measurement);
    void reset();
    double getConfidence() const;
};

// Use in multiple places
SensorFilter lidar(10);
SensorFilter radar(20);

// ✅ Lambda - one-off simple operation
std::vector<int> vec = {1, 2, 3, 4, 5};
auto sum = std::accumulate(vec.begin(), vec.end(), 0,
    [](int a, int b) { return a + b; });  // Simple, inline

// ❌ Lambda - too complex for lambda
auto complexLambda = [history = std::deque<double>(), kalmanGain = 0.5, /*...*/]
    (double measurement) mutable {
        // 50 lines of complex logic...
    };  // ❌ Hard to read, maintain, and reuse
```

**Key Takeaway**: Choose functors for complex, reusable logic with rich state; choose lambdas for simple, localized operations.

---

#### Q11: What are the essential components of a basic functor class?
**Difficulty:** #beginner
**Category:** #syntax
**Concepts:** #functor_declaration

**Question:** What are the essential components of a basic functor class?



**Answer**: A functor requires:
1. **`operator()` overload** - makes the object callable
2. **Constructor** (optional) - initialize state
3. **Member variables** (optional) - store state
4. **`const` qualifier** on `operator()` (if state is immutable or mutable members are used)

**Explanation**:
```cpp
class BasicFunctor {
    int state;  // Member variable for state

public:
    // Constructor to initialize state
    BasicFunctor(int initial) : state(initial) {}

    // operator() makes it callable
    int operator()(int x) const {  // const if doesn't modify state
        return x + state;
    }
};

// Usage
BasicFunctor add5(5);
int result = add5(10);  // Calls operator(), returns 15
```

**Key Takeaway**: The `operator()` overload is what defines a functor, but constructors and state make it powerful.

---

#### Q12: What is the purpose of the `mutable` keyword in functors, and when should...
**Difficulty:** #mid
**Category:** #best_practices
**Concepts:** #mutable_keyword

**Question:** What is the purpose of the `mutable` keyword in functors, and when should you use it?



**Answer**: `mutable` allows a member variable to be modified even in `const` member functions. Use it for:
1. **Caching** - storing computed results without changing logical state
2. **Counters/Statistics** - tracking calls or performance metrics
3. **Lazy initialization** - deferring initialization until first use

**Explanation**:
```cpp
class CachedFunctor {
    // Expensive to compute, cached for performance
    mutable std::unordered_map<int, int> cache;
    mutable int cacheHits;
    mutable int cacheMisses;

public:
    CachedFunctor() : cacheHits(0), cacheMisses(0) {}

    // ✅ Can be const because cache doesn't affect logical state
    int operator()(int x) const {
        auto it = cache.find(x);
        if (it != cache.end()) {
            cacheHits++;  // ✅ mutable allows modification in const method
            return it->second;
        }

        cacheMisses++;  // ✅ mutable
        int result = expensiveComputation(x);
        cache[x] = result;  // ✅ mutable
        return result;
    }

    // ✅ Can be const
    int getCacheHits() const { return cacheHits; }
};

// Usage with const
const CachedFunctor functor;
int result = functor(42);  // ✅ Works because operator() is const
```

**Key Takeaway**: Use `mutable` for implementation details (caching, statistics) that don't affect the logical state of the object, allowing const-correctness while maintaining practical functionality.

---

#### Q13: How are functors used as predicates in STL algorithms? Give examples with...
**Difficulty:** #mid
**Category:** #stl_integration
**Concepts:** #predicates #stl_algorithms

**Question:** How are functors used as predicates in STL algorithms? Give examples with `std::find_if` and `std::sort`.



**Answer**: Functors can serve as **predicates** (return bool) for filtering, searching, and sorting operations. They provide custom comparison or matching logic.

**Explanation**:
```cpp
// ✅ Predicate functor for finding
class IsGreaterThan {
    int threshold;
public:
    IsGreaterThan(int t) : threshold(t) {}
    bool operator()(int x) const { return x > threshold; }
};

std::vector<int> vec = {1, 5, 3, 8, 2, 9};

// Find first element > 5
auto it = std::find_if(vec.begin(), vec.end(), IsGreaterThan(5));
if (it != vec.end()) {
    std::cout << "Found: " << *it << "\n";  // Prints: Found: 8
}

// ✅ Comparator functor for sorting
class CompareByDistance {
    Point origin;
public:
    CompareByDistance(Point o) : origin(o) {}

    bool operator()(const Point& a, const Point& b) const {
        return distance(origin, a) < distance(origin, b);
    }
};

std::vector<Point> points = {{1,2}, {5,5}, {0,1}};
Point origin{0, 0};

// Sort points by distance from origin
std::sort(points.begin(), points.end(), CompareByDistance(origin));

// ✅ Predicate for removing elements
class IsEven {
public:
    bool operator()(int x) const { return x % 2 == 0; }
};

// Remove all even numbers
vec.erase(std::remove_if(vec.begin(), vec.end(), IsEven()), vec.end());
```

**Common STL Algorithms Using Functors**:
- `std::find_if` / `std::find_if_not` - search with predicate
- `std::sort` / `std::stable_sort` - custom comparison
- `std::remove_if` - conditional removal
- `std::count_if` - count matching elements
- `std::transform` - apply transformation
- `std::for_each` - apply operation to each element

**Key Takeaway**: Functors enable customization of STL algorithms while maintaining state, making them more flexible than raw function pointers.

---

#### Q14: In autonomous vehicle sensor fusion, how would you implement a functor that...
**Difficulty:** #advanced
**Category:** #realworld_application
**Concepts:** #sensor_fusion #state_estimation

**Question:** In autonomous vehicle sensor fusion, how would you implement a functor that combines data from multiple sensor sources with different noise characteristics?



**Answer**: Create a stateful functor that maintains separate Kalman filter states for each sensor type and performs weighted fusion based on sensor confidence/noise characteristics.

**Explanation**:
```cpp
struct SensorReading {
    double value;
    double variance;  // Noise characteristic
    std::chrono::steady_clock::time_point timestamp;
};

class MultiSensorFusion {
    // Kalman filter state for each sensor
    struct KalmanState {
        double estimate;
        double errorCovariance;
        double processNoise;
    };

    std::unordered_map<std::string, KalmanState> sensors;
    double fusedEstimate;

public:
    MultiSensorFusion() : fusedEstimate(0.0) {}

    // Process new sensor reading
    double operator()(const std::string& sensorId, const SensorReading& reading) {
        auto& state = sensors[sensorId];

        // Kalman prediction step
        double predictedError = state.errorCovariance + state.processNoise;

        // Kalman update step
        double kalmanGain = predictedError / (predictedError + reading.variance);
        state.estimate = state.estimate + kalmanGain * (reading.value - state.estimate);
        state.errorCovariance = (1 - kalmanGain) * predictedError;

        // Fuse estimates from all sensors (inverse variance weighting)
        double weightedSum = 0.0;
        double totalWeight = 0.0;

        for (const auto& [id, s] : sensors) {
            double weight = 1.0 / (s.errorCovariance + 0.001);  // Inverse variance
            weightedSum += weight * s.estimate;
            totalWeight += weight;
        }

        fusedEstimate = weightedSum / totalWeight;
        return fusedEstimate;
    }

    double getFusedEstimate() const { return fusedEstimate; }

    std::unordered_map<std::string, double> getSensorConfidences() const {
        std::unordered_map<std::string, double> confidences;
        for (const auto& [id, state] : sensors) {
            confidences[id] = 1.0 / (1.0 + state.errorCovariance);
        }
        return confidences;
    }
};

// Usage in autonomous vehicle
MultiSensorFusion distanceFusion;

// LiDAR reading (high accuracy)
SensorReading lidar{10.5, 0.05, std::chrono::steady_clock::now()};
double fused1 = distanceFusion("lidar", lidar);

// Radar reading (lower accuracy)
SensorReading radar{10.8, 0.2, std::chrono::steady_clock::now()};
double fused2 = distanceFusion("radar", radar);

// Camera reading (lowest accuracy for distance)
SensorReading camera{11.2, 0.5, std::chrono::steady_clock::now()};
double fused3 = distanceFusion("camera", camera);

// Get final fused estimate (weighted toward more accurate sensors)
double finalEstimate = distanceFusion.getFusedEstimate();
```

**Key Concepts**:
- Kalman filtering for each sensor stream
- Inverse variance weighting for fusion
- Stateful tracking of multiple sensor estimates
- Confidence metrics for sensor reliability

**Key Takeaway**: Functors excel at complex stateful algorithms like sensor fusion, encapsulating both the computation logic and the persistent state required for filtering and estimation.

---

#### Q15: What common mistake occurs when using functors with STL algorithms, and how...
**Difficulty:** #mid
**Category:** #debugging
**Concepts:** #common_mistakes

**Question:** What common mistake occurs when using functors with STL algorithms, and how can you debug it?



**Answer**: **Copy semantics surprise**: STL algorithms copy functors by value, so modifications to the functor's state inside the algorithm don't affect the original. Debug by: (1) checking if the original functor's state changes, (2) using `std::ref()`, or (3) capturing the returned functor.

**Explanation**:
```cpp
class DebugCounter {
    int count;
public:
    DebugCounter() : count(0) {}

    void operator()(int x) {
        count++;
        std::cout << "Processing " << x << " (count: " << count << ")\n";
    }

    int getCount() const { return count; }
};

std::vector<int> vec = {1, 2, 3};
DebugCounter counter;

// ❌ Bug: counter is copied
std::for_each(vec.begin(), vec.end(), counter);
std::cout << "Counter after for_each: " << counter.getCount() << "\n";
// Output: Counter after for_each: 0 (original unchanged!)

// 🔍 Debug technique 1: Print addresses
std::for_each(vec.begin(), vec.end(), [&counter](int x) {
    std::cout << "Functor address inside for_each: " << &counter << "\n";
});
std::cout << "Original functor address: " << &counter << "\n";
// Different addresses reveal the copy!

// ✅ Fix 1: Use std::ref
std::for_each(vec.begin(), vec.end(), std::ref(counter));
std::cout << "Counter: " << counter.getCount() << "\n";  // ✅ 3

// ✅ Fix 2: Capture returned functor
counter = DebugCounter();  // Reset
auto result = std::for_each(vec.begin(), vec.end(), counter);
std::cout << "Returned counter: " << result.getCount() << "\n";  // ✅ 3
```

**Debugging Checklist**:
1. ✅ Check if functor state updates as expected
2. ✅ Print functor addresses to detect copies
3. ✅ Use `std::ref()` for pass-by-reference
4. ✅ Capture algorithm return value (many return the functor)

**Key Takeaway**: Always assume STL algorithms copy functors unless you explicitly use `std::ref()`. Test functor state after algorithm calls to catch copy-related bugs.

---

#### Q16: How can you implement a lock-free counter functor for high-throughput scenarios?
**Difficulty:** #advanced
**Category:** #performance
**Concepts:** #lockfree_programming #atomics

**Question:** How can you implement a lock-free counter functor for high-throughput scenarios?



**Answer**: Use `std::atomic` for lock-free operations. Atomics provide thread-safe increment/decrement without mutex overhead, using CPU-level atomic instructions (e.g., LOCK prefix on x86).

**Explanation**:
```cpp
#include <atomic>
#include <thread>
#include <vector>

// ✅ Lock-free counter functor
class LockFreeCounter {
    std::atomic<uint64_t> count{0};
    std::atomic<uint64_t> totalValue{0};

public:
    void operator()(int value) {
        count.fetch_add(1, std::memory_order_relaxed);
        totalValue.fetch_add(value, std::memory_order_relaxed);
    }

    uint64_t getCount() const {
        return count.load(std::memory_order_acquire);
    }

    uint64_t getTotalValue() const {
        return totalValue.load(std::memory_order_acquire);
    }

    double getAverage() const {
        uint64_t c = count.load(std::memory_order_acquire);
        uint64_t t = totalValue.load(std::memory_order_acquire);
        return c > 0 ? static_cast<double>(t) / c : 0.0;
    }
};

// Benchmark: process 1 million items across 4 threads
void worker(LockFreeCounter& counter, int start, int end) {
    for (int i = start; i < end; i++) {
        counter(i);
    }
}

int main() {
    LockFreeCounter counter;

    constexpr int numThreads = 4;
    constexpr int itemsPerThread = 250000;

    std::vector<std::thread> threads;
    auto start = std::chrono::high_resolution_clock::now();

    for (int i = 0; i < numThreads; i++) {
        threads.emplace_back(worker, std::ref(counter),
                            i * itemsPerThread, (i + 1) * itemsPerThread);
    }

    for (auto& t : threads) {
        t.join();
    }

    auto end = std::chrono::high_resolution_clock::now();
    auto duration = std::chrono::duration_cast<std::chrono::milliseconds>(end - start);

    std::cout << "Processed " << counter.getCount() << " items in "
              << duration.count() << " ms\n";
    std::cout << "Average: " << counter.getAverage() << "\n";

    return 0;
}

// Typical output:
// Processed 1000000 items in 45 ms
// Average: 499999.5
```

**Memory Ordering Explained**:
- `memory_order_relaxed`: No synchronization, only atomicity (fastest)
- `memory_order_acquire`: Synchronizes with releases (for reading)
- `memory_order_release`: Synchronizes with acquires (for writing)
- `memory_order_seq_cst`: Strongest guarantees (default, slowest)

**Performance Comparison**:
- Mutex-based: ~200-300ms for 1M ops
- Lock-free atomic: ~40-60ms for 1M ops
- **~4-5x faster** for simple counters

**Key Takeaway**: Use atomics for lock-free high-performance counters. Choose appropriate memory ordering based on your synchronization needs (relaxed for counters, acquire/release for synchronized state).

---

#### Q17: What is the difference between a functor and `std::function`? When would you...
**Difficulty:** #beginner
**Category:** #comparison
**Concepts:** #functor_vs_stdfunction

**Question:** What is the difference between a functor and `std::function`? When would you use each?



**Answer**: A **functor** is a class with `operator()`, while `std::function` is a type-erased wrapper that can hold any callable (function pointer, lambda, functor, member function). Functors are zero-overhead and statically typed; `std::function` adds runtime polymorphism but has overhead (heap allocation, virtual dispatch).

**Explanation**:
```cpp
// ✅ Functor - zero overhead, compile-time polymorphism
class Multiplier {
    int factor;
public:
    Multiplier(int f) : factor(f) {}
    int operator()(int x) const { return x * factor; }
};

Multiplier times3(3);
int result = times3(5);  // Direct call, inlineable

// ✅ std::function - runtime polymorphism, overhead
#include <functional>

std::function<int(int)> callable;

callable = [factor = 3](int x) { return x * factor; };  // Lambda
int r1 = callable(5);  // Virtual call, not inlineable

callable = times3;  // Can hold functor
int r2 = callable(5);

callable = [](int x) { return x * 2; };  // Change behavior at runtime
int r3 = callable(5);
```

**Performance Comparison**:
```cpp
// Benchmark: 1 million calls

// Functor: ~5ms (fully inlined)
for (int i = 0; i < 1000000; i++) {
    result = times3(i);
}

// std::function: ~35ms (virtual dispatch, heap allocation)
std::function<int(int)> func = times3;
for (int i = 0; i < 1000000; i++) {
    result = func(i);
}
```

**When to Use Each**:

| Use Functor When | Use std::function When |
|------------------|------------------------|
| Performance critical | Need runtime polymorphism |
| Type known at compile-time | Storing different callable types |
| Want inlining | Callbacks with unknown types |
| Template parameters | Non-template interfaces |

**Key Takeaway**: Prefer functors for performance-critical code with compile-time types. Use `std::function` when you need to store/pass callables of different types at runtime.

---

#### Q18: How do you handle resource management (files, connections, etc.) in functors...
**Difficulty:** #mid
**Category:** #design
**Concepts:** #functor_state_lifecycle

**Question:** How do you handle resource management (files, connections, etc.) in functors that maintain stateful resources?



**Answer**: Follow **RAII principles**: acquire resources in constructor, release in destructor. Use smart pointers (`unique_ptr`, `shared_ptr`) for heap resources. Ensure copy/move semantics are appropriate (often delete copy, implement move).

**Explanation**:
```cpp
#include <fstream>
#include <memory>

// ✅ RAII-compliant logging functor
class LoggingFunctor {
    std::unique_ptr<std::ofstream> logFile;
    std::string filename;
    int messageCount;

public:
    // Constructor - acquire resource
    explicit LoggingFunctor(const std::string& fname)
        : logFile(std::make_unique<std::ofstream>(fname, std::ios::app)),
          filename(fname),
          messageCount(0) {

        if (!logFile->is_open()) {
            throw std::runtime_error("Failed to open log file: " + fname);
        }

        *logFile << "=== Log session started ===\n";
    }

    // Destructor - release resource
    ~LoggingFunctor() {
        if (logFile && logFile->is_open()) {
            *logFile << "=== Log session ended (" << messageCount << " messages) ===\n";
            logFile->close();
        }
    }

    // Delete copy (file handle is unique)
    LoggingFunctor(const LoggingFunctor&) = delete;
    LoggingFunctor& operator=(const LoggingFunctor&) = delete;

    // ✅ Implement move semantics
    LoggingFunctor(LoggingFunctor&& other) noexcept
        : logFile(std::move(other.logFile)),
          filename(std::move(other.filename)),
          messageCount(other.messageCount) {
        other.messageCount = 0;
    }

    LoggingFunctor& operator=(LoggingFunctor&& other) noexcept {
        if (this != &other) {
            logFile = std::move(other.logFile);
            filename = std::move(other.filename);
            messageCount = other.messageCount;
            other.messageCount = 0;
        }
        return *this;
    }

    // operator() - use resource
    void operator()(const std::string& message) {
        if (logFile && logFile->is_open()) {
            *logFile << "[" << messageCount++ << "] " << message << "\n";
            logFile->flush();  // Ensure written
        }
    }

    int getMessageCount() const { return messageCount; }
};

// Usage
void processData(const std::vector<std::string>& data) {
    LoggingFunctor logger("process.log");

    for (const auto& item : data) {
        logger("Processing: " + item);
        // ... process item ...
    }

    // ✅ File automatically closed when logger goes out of scope
}
```

**Key RAII Principles**:
1. ✅ Acquire in constructor, release in destructor
2. ✅ Use smart pointers for heap resources
3. ✅ Delete copy if resource is unique
4. ✅ Implement move for transferable ownership
5. ✅ Handle exceptions in constructor (resource leaks)

**Key Takeaway**: Treat functors with resources like any RAII class. Use smart pointers and proper copy/move semantics to ensure resource safety.

---

#### Q19: How can you create a variadic functor that accepts multiple argument types...
**Difficulty:** #advanced
**Category:** #template_metaprogramming
**Concepts:** #variadic_templates #perfect_forwarding

**Question:** How can you create a variadic functor that accepts multiple argument types and forwards them perfectly?



**Answer**: Use **variadic templates** with **perfect forwarding** to accept any number of arguments of any type. Use `std::forward` to preserve value categories (lvalue/rvalue).

**Explanation**:
```cpp
#include <iostream>
#include <utility>
#include <tuple>
#include <vector>

// Variadic functor that logs all calls
class VariadicLogger {
    std::vector<std::string> log;

    // Helper to convert arguments to string
    template <typename T>
    std::string toString(T&& arg) const {
        return std::to_string(std::forward<T>(arg));
    }

    std::string toString(const char* arg) const {
        return std::string(arg);
    }

    std::string toString(const std::string& arg) const {
        return arg;
    }

public:
    // ✅ Variadic operator() with perfect forwarding
    template <typename... Args>
    void operator()(Args&&... args) {
        // Fold expression (C++17) to build log string
        std::string entry;
        ((entry += toString(std::forward<Args>(args)) + " "), ...);
        log.push_back(entry);
    }

    void printLog() const {
        std::cout << "Call log (" << log.size() << " calls):\n";
        for (size_t i = 0; i < log.size(); i++) {
            std::cout << "  [" << i << "] " << log[i] << "\n";
        }
    }
};

// Example with call counting and type tracking
template <typename ReturnType>
class VariadicCounter {
    int callCount;

public:
    VariadicCounter() : callCount(0) {}

    // ✅ Works with any number and types of arguments
    template <typename... Args>
    ReturnType operator()(Args&&... args) {
        callCount++;

        // Can forward to other functions
        return process(std::forward<Args>(args)...);
    }

private:
    // Example processing functions
    template <typename... Args>
    ReturnType process(Args&&... args) {
        // Use fold expression to combine arguments
        if constexpr (std::is_arithmetic_v<ReturnType>) {
            return (args + ...);  // Sum all arguments
        } else {
            return ReturnType{};
        }
    }

public:
    int getCallCount() const { return callCount; }
};

int main() {
    VariadicLogger logger;

    // ✅ Different argument types and counts
    logger(42);
    logger("Hello", "World");
    logger(1, 2.5, "three", 4);
    logger();  // No arguments

    logger.printLog();

    // Variadic counter
    VariadicCounter<int> summer;

    int r1 = summer(1, 2, 3);           // Sums to 6
    int r2 = summer(10, 20);            // Sums to 30
    int r3 = summer(100);               // Returns 100

    std::cout << "Summer called " << summer.getCallCount() << " times\n";

    return 0;
}

// Output:
// Call log (4 calls):
//   [0] 42
//   [1] Hello World
//   [2] 1 2.500000 three 4
//   [3]
// Summer called 3 times
```

**Key Concepts**:
- `template <typename... Args>` - variadic template parameter pack
- `Args&&...` - universal reference pack
- `std::forward<Args>(args)...` - perfect forwarding of pack
- `(expression, ...)` - fold expression (C++17)
- `std::forward` preserves value categories

**Key Takeaway**: Variadic templates with perfect forwarding enable generic functors that work with any argument types while preserving efficiency and value categories.

---

#### Q20: In an autonomous vehicle path planning system, how would you use a functor...
**Difficulty:** #mid
**Category:** #realworld_application
**Concepts:** #custom_comparators

**Question:** In an autonomous vehicle path planning system, how would you use a functor to implement a custom priority queue comparator for trajectory scoring?



**Answer**: Create a functor that encapsulates the scoring logic (considering safety, efficiency, comfort) and use it as the comparator for `std::priority_queue`. The functor can maintain configuration parameters and weights.

**Explanation**:
```cpp
#include <queue>
#include <vector>
#include <cmath>

struct Trajectory {
    int id;
    double collisionRisk;      // 0.0 = safe, 1.0 = collision
    double fuelEfficiency;     // mpg or kWh/mile
    double comfortScore;       // based on acceleration/jerk
    double timeToGoal;         // seconds
};

// ✅ Functor-based trajectory comparator
class TrajectoryComparator {
    // Configurable weights
    double safetyWeight;
    double efficiencyWeight;
    double comfortWeight;
    double timeWeight;

public:
    TrajectoryComparator(double safety = 0.5, double efficiency = 0.2,
                        double comfort = 0.2, double time = 0.1)
        : safetyWeight(safety), efficiencyWeight(efficiency),
          comfortWeight(comfort), timeWeight(time) {
        // Normalize weights
        double total = safety + efficiency + comfort + time;
        safetyWeight /= total;
        efficiencyWeight /= total;
        comfortWeight /= total;
        timeWeight /= total;
    }

    // ✅ Comparison operator for priority queue (higher score = better)
    // Note: priority_queue is max-heap by default, so return true if a has LOWER priority than b
    bool operator()(const Trajectory& a, const Trajectory& b) const {
        return computeScore(a) < computeScore(b);
    }

private:
    double computeScore(const Trajectory& t) const {
        // Higher score = better trajectory
        // Invert collision risk (lower risk = better)
        double safety = (1.0 - t.collisionRisk) * safetyWeight;

        // Normalize efficiency (assuming 20-60 mpg range)
        double efficiency = (t.fuelEfficiency / 60.0) * efficiencyWeight;

        // Comfort is already normalized (0-1)
        double comfort = t.comfortScore * comfortWeight;

        // Time: shorter is better (invert and normalize, assuming 10-60s range)
        double time = (1.0 - (t.timeToGoal / 60.0)) * timeWeight;

        return safety + efficiency + comfort + time;
    }
};

int main() {
    // ✅ Use functor as comparator for priority queue
    std::priority_queue<Trajectory, std::vector<Trajectory>, TrajectoryComparator>
        trajectoryQueue(TrajectoryComparator(0.6, 0.2, 0.1, 0.1));  // Safety-prioritized

    // Add candidate trajectories
    trajectoryQueue.push({1, 0.1, 45.0, 0.9, 15.0});   // Safe, efficient, smooth, medium time
    trajectoryQueue.push({2, 0.05, 40.0, 0.95, 12.0}); // Safer, less efficient, smoother, faster
    trajectoryQueue.push({3, 0.3, 50.0, 0.7, 10.0});   // Risky, efficient, rough, fastest
    trajectoryQueue.push({4, 0.02, 38.0, 0.98, 18.0}); // Safest, least efficient, smoothest, slowest

    std::cout << "Best trajectories (in priority order):\n";
    while (!trajectoryQueue.empty()) {
        const auto& t = trajectoryQueue.top();
        std::cout << "Trajectory " << t.id
                  << " - Risk: " << t.collisionRisk
                  << ", Efficiency: " << t.fuelEfficiency
                  << ", Comfort: " << t.comfortScore
                  << ", Time: " << t.timeToGoal << "s\n";
        trajectoryQueue.pop();
    }

    return 0;
}

// Output (with safety-prioritized weights):
// Best trajectories (in priority order):
// Trajectory 4 - Risk: 0.02, Efficiency: 38, Comfort: 0.98, Time: 18s
// Trajectory 2 - Risk: 0.05, Efficiency: 40, Comfort: 0.95, Time: 12s
// Trajectory 1 - Risk: 0.1, Efficiency: 45, Comfort: 0.9, Time: 15s
// Trajectory 3 - Risk: 0.3, Efficiency: 50, Comfort: 0.7, Time: 10s
```

**Benefits of Functor Comparator**:
1. **Configurable**: Adjust weights at runtime
2. **Stateful**: Store configuration parameters
3. **Reusable**: Same comparator for different queues
4. **Testable**: Easy to unit test scoring logic
5. **Type-safe**: Compile-time type checking

**Key Takeaway**: Functors as custom comparators enable sophisticated priority logic in STL containers while maintaining clean, testable, and configurable code.

---

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

#### Q9
Convert this function pointer usage to a functor:
```cpp
bool isEven(int x) { return x % 2 == 0; }
std::vector<int> vec = {1, 2, 3, 4, 5};
vec.erase(std::remove_if(vec.begin(), vec.end(), isEven), vec.end());
```

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

#### Q19
Implement a functor that can be used with `std::priority_queue` to sort by absolute distance from a target:
```cpp
class DistanceComparator {
    // Your implementation
};

std::priority_queue<int, std::vector<int>, DistanceComparator> pq(/* your constructor args */);
```

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
