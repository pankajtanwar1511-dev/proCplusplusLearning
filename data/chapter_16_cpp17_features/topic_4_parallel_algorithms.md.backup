# Chapter 16: C++17 Features - Parallel Algorithms and Execution Policies

## TOPIC: C++17 Parallel Algorithms - Execution Policies and Performance

C++17 introduced **execution policies** that enable automatic parallelization of STL algorithms. By simply adding an execution policy parameter, you can leverage multi-core processors without writing threading code. This chapter covers execution policies (`std::execution::seq`, `par`, `par_unseq`, `unseq`), parallel algorithm usage, performance considerations, and pitfalls. Understanding parallel algorithms is crucial for high-performance computing and is increasingly important in autonomous vehicle perception pipelines that process massive amounts of sensor data.

**Why this matters:**
- **Automatic parallelization**: Utilize multi-core CPUs without manual threading
- **Performance gains**: 4-8x speedup on suitable workloads
- **Safety**: Algorithm-level parallelism safer than manual threads
- **Scalability**: Code scales automatically with hardware

**Key innovations:**
- Execution policies as algorithm parameters
- Compiler-generated parallel code
- SIMD vectorization hints
- Thread-safe algorithm guarantees

---

###THEORY_SECTION: Execution Policies and Parallel Algorithms

#### Execution Policies Overview

C++17 defines four execution policies in `<execution>`:

1. **`std::execution::seq`** - Sequential execution (default behavior)
2. **`std::execution::par`** - Parallel execution (multi-threaded)
3. **`std::execution::par_unseq`** - Parallel + vectorized (SIMD)
4. **`std::execution::unseq`** - Vectorized only (C++20)

**Usage pattern:**
```cpp
#include <algorithm>
#include <execution>
#include <vector>

std::vector<int> data(1'000'000);

// Sequential (traditional)
std::sort(data.begin(), data.end());

// Parallel
std::sort(std::execution::par, data.begin(), data.end());

// Parallel + vectorized
std::sort(std::execution::par_unseq, data.begin(), data.end());
```

**Key principle:**
Execution policies are **permission**, not commands. The implementation may execute sequentially if parallelization isn't beneficial.

#### Execution Policy Semantics

**std::execution::seq (Sequential):**
- Guaranteed sequential execution
- Same as traditional algorithms
- Use when order matters or operations have side effects

**std::execution::par (Parallel):**
- May execute on multiple threads
- Operations must be thread-safe
- Exceptions are caught and re-thrown after all work completes
- Use for CPU-bound independent operations

**std::execution::par_unseq (Parallel + Unsequenced):**
- May execute on multiple threads AND vectorize
- Operations must be thread-safe AND vectorization-safe
- No locks, no allocations, no exceptions in element operations
- Highest performance potential
- Use for pure computations without side effects

**std::execution::unseq (Unsequenced, C++20):**
- Vectorization only, no parallelization
- Use for single-threaded SIMD optimization

#### Supported Algorithms

Most STL algorithms support execution policies in C++17:

**Sorting and searching:**
- `std::sort`, `std::stable_sort`, `std::partial_sort`
- `std::nth_element`
- `std::find`, `std::find_if`, `std::find_if_not`
- `std::binary_search`, `std::lower_bound`, `std::upper_bound`

**Numeric:**
- `std::accumulate` → `std::reduce` (parallel version)
- `std::transform_reduce`
- `std::inclusive_scan`, `std::exclusive_scan`
- `std::transform_inclusive_scan`, `std::transform_exclusive_scan`

**Transformations:**
- `std::transform`
- `std::for_each`, `std::for_each_n`
- `std::copy`, `std::copy_if`, `std::move`
- `std::fill`, `std::fill_n`
- `std::replace`, `std::replace_if`

**Set operations:**
- `std::set_union`, `std::set_intersection`, `std::set_difference`

#### Performance Considerations

**When parallelization helps:**
- Large data sets (>10,000 elements typically)
- CPU-bound operations (significant work per element)
- Independent operations (no shared state)
- Modern multi-core CPU available

**When parallelization doesn't help or hurts:**
- Small data sets (<1,000 elements) - overhead dominates
- I/O-bound operations (file/network access)
- Operations with dependencies
- Memory-bound operations (already saturating memory bandwidth)

**Overhead sources:**
- Thread creation/synchronization
- Work distribution/scheduling
- Cache coherence traffic
- False sharing

#### Thread Safety Requirements

**For `std::execution::par`:**
- Element operations must be thread-safe
- Locks and mutexes are allowed (but hurt performance)
- Memory allocations are allowed
- Exceptions are allowed (caught and re-thrown)

**For `std::execution::par_unseq`:**
- Element operations must be thread-safe AND vectorization-safe
- **No locks** (would break vectorization)
- **No allocations** (not vectorizable)
- **No exceptions** (not vectorizable)
- Pure computations only

**Example violations:**
```cpp
std::vector<int> data(1'000'000);
int global_sum = 0;

// ❌ WRONG: Data race on global_sum
std::for_each(std::execution::par, data.begin(), data.end(),
    [&](int x) {
        global_sum += x;  // Race condition!
    });

// ✅ CORRECT: Use reduce for parallel sum
int result = std::reduce(std::execution::par, data.begin(), data.end(), 0);
```

---

### EDGE_CASES: Parallel Algorithm Pitfalls

#### Edge Case 1: Data Races with Parallel Execution

```cpp
#include <algorithm>
#include <execution>
#include <vector>
#include <iostream>

// ❌ DANGEROUS: Race condition
void buggy_parallel() {
    std::vector<int> data(1000);
    std::iota(data.begin(), data.end(), 1);

    int sum = 0;  // Shared mutable state

    std::for_each(std::execution::par, data.begin(), data.end(),
        [&sum](int x) {
            sum += x;  // ❌ Data race! Multiple threads access sum
        });

    std::cout << "Sum: " << sum << "\n";  // Undefined result
}

// ✅ CORRECT: Use reduce for parallel aggregation
void correct_parallel() {
    std::vector<int> data(1000);
    std::iota(data.begin(), data.end(), 1);

    int sum = std::reduce(std::execution::par,
                          data.begin(), data.end(),
                          0);  // Thread-safe reduction

    std::cout << "Sum: " << sum << "\n";  // Correct result: 500500
}
```

**Why reduce() is safe:**
`reduce` uses temporary per-thread accumulators that are combined at the end, avoiding data races. `for_each` provides no such guarantee.

---

#### Edge Case 2: Locks in Vectorized Code

```cpp
#include <algorithm>
#include <execution>
#include <vector>
#include <mutex>

std::mutex mtx;
std::vector<int> shared_log;

// ❌ WRONG: Lock in par_unseq causes undefined behavior
void buggy_vectorized() {
    std::vector<int> data(1000);

    std::for_each(std::execution::par_unseq, data.begin(), data.end(),
        [&](int x) {
            std::lock_guard<std::mutex> lock(mtx);  // ❌ Lock in vectorized code!
            shared_log.push_back(x);  // Undefined behavior
        });
}

// ✅ CORRECT: Use par (not par_unseq) when locks are needed
void correct_parallel_with_lock() {
    std::vector<int> data(1000);

    std::for_each(std::execution::par, data.begin(), data.end(),
        [&](int x) {
            std::lock_guard<std::mutex> lock(mtx);  // ✅ OK with par
            shared_log.push_back(x);
        });
}

// ✅ BETTER: Avoid locks with thread-local accumulation
void best_approach() {
    std::vector<int> data(1000);

    // Process in parallel without locks
    std::vector<int> filtered;
    std::copy_if(std::execution::par,
                 data.begin(), data.end(),
                 std::back_inserter(filtered),
                 [](int x) { return x % 2 == 0; });
}
```

**Key insight:** `par_unseq` assumes operations can be interleaved arbitrarily (vectorized), so locks cause undefined behavior.

---

#### Edge Case 3: Algorithm Returns Wrong Result Due to Non-Associative Operations

```cpp
#include <numeric>
#include <execution>
#include <vector>
#include <iostream>
#include <iomanip>

// Floating-point addition is NOT associative due to rounding
void demonstrate_non_associativity() {
    std::vector<double> data = {1e20, 1.0, -1e20, 1.0};

    // Sequential accumulate
    double seq_sum = std::accumulate(data.begin(), data.end(), 0.0);
    std::cout << "Sequential sum: " << std::fixed << seq_sum << "\n";
    // Output: 2.0 (correct due to ordering)

    // Parallel reduce
    double par_sum = std::reduce(std::execution::par,
                                  data.begin(), data.end(),
                                  0.0);
    std::cout << "Parallel sum: " << std::fixed << par_sum << "\n";
    // Output: May be 0.0 or 2.0 depending on grouping!
    // (1e20 + (-1e20)) + 1.0 + 1.0 = 2.0
    // 1e20 + (1.0 + (-1e20)) + 1.0 = 0.0 (1.0 lost to rounding)
}
```

**Lesson:** Parallel algorithms may change operation ordering, exposing non-associative behavior. Be careful with floating-point arithmetic.

---

#### Edge Case 4: Exception Handling in Parallel Algorithms

```cpp
#include <algorithm>
#include <execution>
#include <vector>
#include <iostream>

void exception_handling() {
    std::vector<int> data = {1, 2, 3, 4, 5};

    try {
        std::for_each(std::execution::par, data.begin(), data.end(),
            [](int x) {
                if (x == 3) {
                    throw std::runtime_error("Error processing 3");
                }
                std::cout << x << " ";
            });
    } catch (const std::exception& e) {
        // All parallel work is terminated
        // Exception caught AFTER partial work may have completed
        std::cout << "\nCaught: " << e.what() << "\n";
    }
}
```

**Behavior:**
- Exception in any thread terminates all parallel work
- `std::terminate()` called if multiple threads throw
- Work may partially complete before exception propagates
- Don't rely on side effects in exception case

---

#### Edge Case 5: Performance Degradation with Small Data Sets

```cpp
#include <algorithm>
#include <execution>
#include <vector>
#include <chrono>
#include <iostream>

using namespace std::chrono;

void benchmark_overhead() {
    const int SIZE = 100;  // Small data set
    std::vector<int> data(SIZE);
    std::iota(data.begin(), data.end(), 1);

    // Sequential
    auto start = high_resolution_clock::now();
    std::sort(data.begin(), data.end());
    auto end = high_resolution_clock::now();
    auto seq_time = duration_cast<microseconds>(end - start);

    // Shuffle for next test
    std::random_shuffle(data.begin(), data.end());

    // Parallel
    start = high_resolution_clock::now();
    std::sort(std::execution::par, data.begin(), data.end());
    end = high_resolution_clock::now();
    auto par_time = duration_cast<microseconds>(end - start);

    std::cout << "Sequential: " << seq_time.count() << "μs\n";
    std::cout << "Parallel:   " << par_time.count() << "μs\n";
    std::cout << "Speedup:    " << (double)seq_time.count() / par_time.count() << "x\n";

    // Typical output for small data:
    // Sequential: 2μs
    // Parallel:   50μs
    // Speedup:    0.04x (25x SLOWER!)
}
```

**Threshold guidance:**
- `sort`: Useful above ~10,000 elements
- `transform`: Useful above ~50,000 elements with expensive operations
- `reduce`: Useful above ~100,000 elements
- **Always benchmark** your specific use case

---

### CODE_EXAMPLES: Practical Demonstrations

#### Example 1: Parallel Image Processing (Autonomous Vehicle Camera)

```cpp
#include <algorithm>
#include <execution>
#include <vector>
#include <chrono>
#include <iostream>
#include <cmath>

struct Pixel {
    uint8_t r, g, b;
};

struct Image {
    std::vector<Pixel> pixels;
    int width, height;

    Image(int w, int h) : pixels(w * h), width(w), height(h) {}
};

// Convert to grayscale
Pixel to_grayscale(const Pixel& p) {
    uint8_t gray = static_cast<uint8_t>(
        0.299 * p.r + 0.587 * p.g + 0.114 * p.b
    );
    return {gray, gray, gray};
}

// Apply edge detection (Sobel-like)
Pixel edge_detect(const Pixel& p, int intensity) {
    uint8_t edge = static_cast<uint8_t>(
        std::min(255, static_cast<int>(p.r) * intensity / 100)
    );
    return {edge, edge, edge};
}

void process_camera_frame() {
    // 1920x1080 HD image
    Image input(1920, 1080);

    // Fill with test data
    std::generate(input.pixels.begin(), input.pixels.end(),
        []() { return Pixel{100, 150, 200}; });

    Image output(1920, 1080);

    using namespace std::chrono;

    // Sequential processing
    auto start = high_resolution_clock::now();
    std::transform(input.pixels.begin(), input.pixels.end(),
                   output.pixels.begin(),
                   [](const Pixel& p) {
                       auto gray = to_grayscale(p);
                       return edge_detect(gray, 120);
                   });
    auto seq_time = duration_cast<milliseconds>(high_resolution_clock::now() - start);

    // Parallel processing
    start = high_resolution_clock::now();
    std::transform(std::execution::par_unseq,
                   input.pixels.begin(), input.pixels.end(),
                   output.pixels.begin(),
                   [](const Pixel& p) {
                       auto gray = to_grayscale(p);
                       return edge_detect(gray, 120);
                   });
    auto par_time = duration_cast<milliseconds>(high_resolution_clock::now() - start);

    std::cout << "Sequential: " << seq_time.count() << "ms\n";
    std::cout << "Parallel:   " << par_time.count() << "ms\n";
    std::cout << "Speedup:    " << (double)seq_time.count() / par_time.count() << "x\n";

    // Typical output on 8-core CPU:
    // Sequential: 45ms
    // Parallel:   8ms
    // Speedup:    5.6x
}

int main() {
    process_camera_frame();
    return 0;
}
```

**Why this parallelizes well:**
- Each pixel processed independently
- No shared state
- Significant computation per pixel
- Large data set (2M pixels)

---

#### Example 2: Parallel Point Cloud Processing (LiDAR)

```cpp
#include <algorithm>
#include <execution>
#include <vector>
#include <cmath>
#include <iostream>

struct Point3D {
    double x, y, z;
    double intensity;
};

// Filter ground points (below certain Z threshold)
bool is_ground_point(const Point3D& p) {
    return p.z < 0.5;  // Below 50cm
}

// Calculate distance from origin
double point_distance(const Point3D& p) {
    return std::sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
}

// Normalize point intensity
Point3D normalize_intensity(const Point3D& p, double max_intensity) {
    return {p.x, p.y, p.z, p.intensity / max_intensity};
}

void process_lidar_scan() {
    // 100,000 point cloud (typical LiDAR frame)
    const int NUM_POINTS = 100'000;
    std::vector<Point3D> cloud(NUM_POINTS);

    // Generate test data
    std::generate(cloud.begin(), cloud.end(),
        []() {
            return Point3D{
                rand() % 100 / 10.0 - 5.0,  // x: -5 to 5
                rand() % 100 / 10.0 - 5.0,  // y: -5 to 5
                rand() % 100 / 10.0 - 2.0,  // z: -2 to 8
                rand() % 256                  // intensity: 0-255
            };
        });

    // Step 1: Filter non-ground points (parallel)
    std::vector<Point3D> non_ground;
    std::copy_if(std::execution::par,
                 cloud.begin(), cloud.end(),
                 std::back_inserter(non_ground),
                 [](const Point3D& p) { return !is_ground_point(p); });

    std::cout << "Filtered: " << cloud.size() << " → "
              << non_ground.size() << " points\n";

    // Step 2: Calculate max intensity for normalization
    auto max_it = std::max_element(std::execution::par,
                                    non_ground.begin(), non_ground.end(),
                                    [](const Point3D& a, const Point3D& b) {
                                        return a.intensity < b.intensity;
                                    });
    double max_intensity = max_it->intensity;

    // Step 3: Normalize all intensities (parallel)
    std::transform(std::execution::par,
                   non_ground.begin(), non_ground.end(),
                   non_ground.begin(),
                   [max_intensity](const Point3D& p) {
                       return normalize_intensity(p, max_intensity);
                   });

    // Step 4: Calculate distances (parallel reduce)
    std::vector<double> distances(non_ground.size());
    std::transform(std::execution::par,
                   non_ground.begin(), non_ground.end(),
                   distances.begin(),
                   [](const Point3D& p) { return point_distance(p); });

    double total_distance = std::reduce(std::execution::par,
                                        distances.begin(), distances.end(),
                                        0.0);
    double avg_distance = total_distance / distances.size();

    std::cout << "Average point distance: " << avg_distance << "m\n";
}

int main() {
    process_lidar_scan();
    return 0;
}
```

**Performance characteristics:**
- LiDAR processing: 10-30 ms per frame
- With parallelization: 2-5 ms per frame
- Critical for real-time perception (10-30 Hz update rate)

---

#### Example 3: Parallel vs Sequential Comparison

```cpp
#include <algorithm>
#include <execution>
#include <numeric>
#include <vector>
#include <chrono>
#include <iostream>
#include <iomanip>

void benchmark_parallel_algorithms() {
    const int SIZE = 10'000'000;  // 10 million elements
    std::vector<int> data(SIZE);
    std::iota(data.begin(), data.end(), 1);

    using namespace std::chrono;

    std::cout << std::fixed << std::setprecision(2);
    std::cout << "Processing " << SIZE << " elements\n\n";

    // Test 1: Sort
    {
        auto data_copy = data;
        auto start = high_resolution_clock::now();
        std::sort(data_copy.begin(), data_copy.end());
        auto seq_time = duration_cast<milliseconds>(high_resolution_clock::now() - start);

        data_copy = data;
        start = high_resolution_clock::now();
        std::sort(std::execution::par, data_copy.begin(), data_copy.end());
        auto par_time = duration_cast<milliseconds>(high_resolution_clock::now() - start);

        std::cout << "Sort:\n";
        std::cout << "  Sequential: " << seq_time.count() << "ms\n";
        std::cout << "  Parallel:   " << par_time.count() << "ms\n";
        std::cout << "  Speedup:    " << (double)seq_time.count() / par_time.count() << "x\n\n";
    }

    // Test 2: Transform (square each element)
    {
        std::vector<int> output(SIZE);

        auto start = high_resolution_clock::now();
        std::transform(data.begin(), data.end(), output.begin(),
                       [](int x) { return x * x; });
        auto seq_time = duration_cast<milliseconds>(high_resolution_clock::now() - start);

        start = high_resolution_clock::now();
        std::transform(std::execution::par, data.begin(), data.end(), output.begin(),
                       [](int x) { return x * x; });
        auto par_time = duration_cast<milliseconds>(high_resolution_clock::now() - start);

        std::cout << "Transform:\n";
        std::cout << "  Sequential: " << seq_time.count() << "ms\n";
        std::cout << "  Parallel:   " << par_time.count() << "ms\n";
        std::cout << "  Speedup:    " << (double)seq_time.count() / par_time.count() << "x\n\n";
    }

    // Test 3: Reduce (sum)
    {
        auto start = high_resolution_clock::now();
        long long sum = std::accumulate(data.begin(), data.end(), 0LL);
        auto seq_time = duration_cast<milliseconds>(high_resolution_clock::now() - start);

        start = high_resolution_clock::now();
        long long sum_par = std::reduce(std::execution::par, data.begin(), data.end(), 0LL);
        auto par_time = duration_cast<milliseconds>(high_resolution_clock::now() - start);

        std::cout << "Reduce (sum):\n";
        std::cout << "  Sequential: " << seq_time.count() << "ms (sum=" << sum << ")\n";
        std::cout << "  Parallel:   " << par_time.count() << "ms (sum=" << sum_par << ")\n";
        std::cout << "  Speedup:    " << (double)seq_time.count() / par_time.count() << "x\n\n";
    }

    // Test 4: Find
    {
        int target = SIZE / 2;

        auto start = high_resolution_clock::now();
        auto it = std::find(data.begin(), data.end(), target);
        auto seq_time = duration_cast<microseconds>(high_resolution_clock::now() - start);

        start = high_resolution_clock::now();
        auto it_par = std::find(std::execution::par, data.begin(), data.end(), target);
        auto par_time = duration_cast<microseconds>(high_resolution_clock::now() - start);

        std::cout << "Find:\n";
        std::cout << "  Sequential: " << seq_time.count() << "μs\n";
        std::cout << "  Parallel:   " << par_time.count() << "μs\n";
        std::cout << "  Speedup:    " << (double)seq_time.count() / par_time.count() << "x\n\n";
    }
}

int main() {
    benchmark_parallel_algorithms();
    return 0;
}

// Typical output on 8-core CPU:
// Processing 10000000 elements
//
// Sort:
//   Sequential: 1450ms
//   Parallel:   250ms
//   Speedup:    5.80x
//
// Transform:
//   Sequential: 85ms
//   Parallel:   15ms
//   Speedup:    5.67x
//
// Reduce (sum):
//   Sequential: 28ms
//   Parallel:   5ms
//   Speedup:    5.60x
//
// Find:
//   Sequential: 45000μs
//   Parallel:   8500μs
//   Speedup:    5.29x
```

---

#### Example 4: Transform-Reduce for Dot Product

```cpp
#include <algorithm>
#include <execution>
#include <numeric>
#include <vector>
#include <iostream>

// Efficient parallel dot product
double dot_product_parallel(const std::vector<double>& a,
                             const std::vector<double>& b) {
    return std::transform_reduce(
        std::execution::par,
        a.begin(), a.end(),
        b.begin(),
        0.0,  // Initial value
        std::plus<>(),  // Reduction operation
        std::multiplies<>()  // Transform operation
    );
}

// Sequential equivalent
double dot_product_sequential(const std::vector<double>& a,
                               const std::vector<double>& b) {
    double result = 0.0;
    for (size_t i = 0; i < a.size(); ++i) {
        result += a[i] * b[i];
    }
    return result;
}

void demonstrate_transform_reduce() {
    const int SIZE = 10'000'000;
    std::vector<double> vec1(SIZE, 1.5);
    std::vector<double> vec2(SIZE, 2.0);

    using namespace std::chrono;

    auto start = high_resolution_clock::now();
    double seq_result = dot_product_sequential(vec1, vec2);
    auto seq_time = duration_cast<milliseconds>(high_resolution_clock::now() - start);

    start = high_resolution_clock::now();
    double par_result = dot_product_parallel(vec1, vec2);
    auto par_time = duration_cast<milliseconds>(high_resolution_clock::now() - start);

    std::cout << "Dot product of " << SIZE << " elements:\n";
    std::cout << "Sequential: " << seq_time.count() << "ms (result: " << seq_result << ")\n";
    std::cout << "Parallel:   " << par_time.count() << "ms (result: " << par_result << ")\n";
    std::cout << "Speedup:    " << (double)seq_time.count() / par_time.count() << "x\n";
}

int main() {
    demonstrate_transform_reduce();
    return 0;
}
```

`transform_reduce` is ideal for map-reduce style operations common in data processing and ML inference.

---

### INTERVIEW_QA: Comprehensive Questions

#### Q1: What are C++17 execution policies?
**Difficulty:** #beginner
**Category:** #C++17 #parallelism
**Concepts:** #execution_policy #parallel_algorithms

**Answer:**
Execution policies (`std::execution::seq`, `par`, `par_unseq`) specify how STL algorithms should execute: sequentially, in parallel across threads, or with vectorization.

**Code example:**
```cpp
std::vector<int> data(1'000'000);
std::sort(std::execution::par, data.begin(), data.end());
```

**Explanation:**
Execution policies enable automatic parallelization without manual threading. `par` uses multiple threads, `par_unseq` adds SIMD vectorization. The implementation decides the actual parallelization strategy.

**Key takeaway:** Execution policies provide declarative parallelism by adding a simple parameter to STL algorithms.

---

#### Q2: What's the difference between std::accumulate and std::reduce?
**Difficulty:** #intermediate
**Category:** #STL #parallelism
**Concepts:** #reduce #accumulate #parallel_algorithms

**Answer:**
`std::accumulate` is sequential and processes elements in order. `std::reduce` can execute in parallel and may process elements out of order, requiring associative operations.

**Code example:**
```cpp
std::vector<int> v = {1, 2, 3, 4};
int sum1 = std::accumulate(v.begin(), v.end(), 0);  // Sequential
int sum2 = std::reduce(std::execution::par, v.begin(), v.end(), 0);  // Parallel
```

**Explanation:**
`accumulate` guarantees left-to-right processing. `reduce` allows arbitrary grouping for parallelism, so the operation must be associative and commutative. Use `reduce` for better performance on large data sets.

**Key takeaway:** Use std::reduce for parallel aggregation; requires associative operations unlike sequential std::accumulate.

---

#### Q3: When should you NOT use parallel execution policies?
**Difficulty:** #intermediate
**Category:** #performance #parallelism
**Concepts:** #overhead #small_data #parallel_algorithms

**Answer:**
Avoid parallel execution for small data sets (<10,000 elements), I/O-bound operations, operations with dependencies, or when operations have significant side effects.

**Code example:**
```cpp
std::vector<int> small(100);
// ❌ Parallel slower due to overhead
std::sort(std::execution::par, small.begin(), small.end());
// ✅ Sequential faster for small data
std::sort(small.begin(), small.end());
```

**Explanation:**
Parallel algorithms have overhead (thread creation, synchronization, work distribution). For small datasets, this overhead exceeds benefits. I/O operations don't benefit from parallelism if I/O is the bottleneck, not CPU.

**Key takeaway:** Parallel execution has overhead; only beneficial for large data sets with CPU-bound operations.

---

#### Q4: What happens if an exception is thrown in a parallel algorithm?
**Difficulty:** #advanced
**Category:** #exception_handling #parallelism
**Concepts:** #exceptions #parallel_algorithms #std_terminate

**Answer:**
If one thread throws, all parallel work is terminated and the exception is propagated. If multiple threads throw, `std::terminate()` is called.

**Code example:**
```cpp
std::for_each(std::execution::par, data.begin(), data.end(),
    [](int x) {
        if (x < 0) throw std::runtime_error("Negative");
        // Exception terminates all threads
    });
```

**Explanation:**
Parallel algorithms catch exceptions from any thread and propagate one to the caller after terminating parallel work. Multiple simultaneous exceptions can't be propagated (only one exception object), so `terminate()` is called. Don't rely on side effects when exceptions occur.

**Key takeaway:** Exceptions in parallel algorithms terminate all work; multiple exceptions cause std::terminate().

---

#### Q5: What does std::execution::par_unseq allow that std::execution::par doesn't?
**Difficulty:** #intermediate
**Category:** #parallelism #vectorization
**Concepts:** #execution_policy #SIMD #vectorization

**Answer:**
`par_unseq` allows SIMD vectorization in addition to parallelization. Operations must be vectorization-safe: no locks, no allocations, no exceptions.

**Code example:**
```cpp
// ✅ Safe for par_unseq: pure computation
std::transform(std::execution::par_unseq,
               data.begin(), data.end(), result.begin(),
               [](int x) { return x * x + 10; });

// ❌ Unsafe for par_unseq: uses mutex
std::for_each(std::execution::par_unseq,  // UB!
              data.begin(), data.end(),
              [&](int x) {
                  std::lock_guard lock(mtx);  // Breaks vectorization
              });
```

**Explanation:**
Vectorization means multiple elements processed in single CPU instruction (SIMD). Locks, allocations, and exceptions can't be vectorized. Use `par_unseq` only for pure computations without side effects.

**Key takeaway:** par_unseq enables vectorization but requires pure functions: no locks, allocations, or exceptions.

---

#### Q6: Why might floating-point operations produce different results with parallel execution?
**Difficulty:** #advanced
**Category:** #floating_point #parallelism
**Concepts:** #associativity #floating_point #parallel_algorithms

**Answer:**
Floating-point arithmetic is not associative due to rounding. Parallel execution may change operation ordering, producing different (but equally valid) results.

**Code example:**
```cpp
std::vector<double> v = {1e20, 1.0, -1e20, 1.0};
double seq = std::accumulate(v.begin(), v.end(), 0.0);  // 2.0
double par = std::reduce(std::execution::par, v.begin(), v.end(), 0.0);  // May be 0.0 or 2.0
```

**Explanation:**
Sequential: (1e20 + 1.0 + (-1e20)) + 1.0 = 2.0. Parallel grouping: (1e20 + (-1e20)) + (1.0 + 1.0) = 2.0, but (1e20 + 1.0) + ((-1e20) + 1.0) may lose precision. Both are valid rounding behaviors.

**Key takeaway:** Parallel execution may reorder floating-point operations, producing different but valid results due to non-associativity.

---

#### Q7: What is std::transform_reduce and when should you use it?
**Difficulty:** #intermediate
**Category:** #parallel_algorithms #patterns
**Concepts:** #transform_reduce #map_reduce

**Answer:**
`std::transform_reduce` combines map (transform) and reduce phases in one algorithm, enabling efficient parallelization of map-reduce patterns like dot product.

**Code example:**
```cpp
// Dot product: transform (multiply) then reduce (sum)
double dot = std::transform_reduce(
    std::execution::par,
    vec1.begin(), vec1.end(),
    vec2.begin(),
    0.0,  // Initial value
    std::plus<>(),  // Reduce operation
    std::multiplies<>()  // Transform operation
);
```

**Explanation:**
Separate transform + reduce would require intermediate storage. `transform_reduce` fuses operations, avoiding memory allocation and cache misses. Ideal for dot products, weighted sums, and other map-reduce patterns.

**Key takeaway:** transform_reduce efficiently combines transformation and reduction in one parallel operation without intermediate storage.

---

#### Q8: Can you use parallel algorithms with iterators other than random access?
**Difficulty:** #advanced
**Category:** #parallel_algorithms #iterators
**Concepts:** #iterator_categories #parallel_algorithms

**Answer:**
Parallel algorithms work with forward iterators but may not parallelize efficiently. Random access iterators are preferred for optimal work distribution.

**Code example:**
```cpp
std::list<int> lst(1000000);  // Bidirectional iterators
// Compiles but may not parallelize efficiently
std::sort(std::execution::par, lst.begin(), lst.end());  // No parallelism!

std::vector<int> vec(1000000);  // Random access iterators
std::sort(std::execution::par, vec.begin(), vec.end());  // Efficient parallelism
```

**Explanation:**
Parallel work distribution requires fast iterator arithmetic (O(1) advance, distance). Forward/bidirectional iterators don't support this efficiently. Implementation may fall back to sequential for non-random-access iterators.

**Key takeaway:** Parallel algorithms prefer random-access iterators; forward/bidirectional iterators may not parallelize efficiently.

---

#### Q9: What is a "vectorization-safe" operation?
**Difficulty:** #advanced
**Category:** #vectorization #SIMD
**Concepts:** #par_unseq #vectorization #SIMD

**Answer:**
Vectorization-safe operations have no side effects, no control flow dependencies, and can execute in any order or simultaneously (SIMD). No locks, allocations, or exceptions.

**Code example:**
```cpp
// ✅ Vectorization-safe: pure math
std::transform(std::execution::par_unseq, data.begin(), data.end(), out.begin(),
               [](int x) { return x * 2 + 5; });

// ❌ Not vectorization-safe: has branch
std::transform(std::execution::par_unseq, data.begin(), data.end(), out.begin(),
               [](int x) {
                   if (x < 0) return 0;  // Branch prevents vectorization
                   return x * 2;
               });
```

**Explanation:**
SIMD (Single Instruction Multiple Data) processes multiple elements simultaneously. Branches, function calls, locks, and exceptions prevent this. Modern compilers can vectorize branchless code automatically with `par_unseq`.

**Key takeaway:** Vectorization-safe means pure computation without branches, locks, allocations, or exceptions.

---

#### Q10: How do you safely aggregate results from parallel algorithms?
**Difficulty:** #intermediate
**Category:** #parallel_algorithms #patterns
**Concepts:** #reduce #aggregation #thread_safety

**Answer:**
Use `std::reduce` or `std::transform_reduce` for parallel aggregation instead of manual accumulation with shared state, which causes data races.

**Code example:**
```cpp
std::vector<int> data(1000000);

// ❌ WRONG: Data race
int sum = 0;
std::for_each(std::execution::par, data.begin(), data.end(),
              [&](int x) { sum += x; });  // Race!

// ✅ CORRECT: Use reduce
int sum = std::reduce(std::execution::par, data.begin(), data.end(), 0);
```

**Explanation:**
`reduce` uses per-thread accumulators internally and combines them safely at the end. Manual accumulation with `for_each` has no such protection, causing data races. Use specialized reduction algorithms for parallel aggregation.

**Key takeaway:** Use std::reduce for parallel aggregation; never manually accumulate into shared state in parallel for_each.

---

### PRACTICE_TASKS: Code Analysis and Prediction

#### Q1
```cpp
std::vector<int> data = {1, 2, 3, 4, 5};
int product = std::reduce(std::execution::par, data.begin(), data.end(),
                          1, std::multiplies<>());
std::cout << product;
// What is printed?
```

#### Q2
```cpp
std::vector<int> data(100);
int sum = 0;
std::for_each(std::execution::par, data.begin(), data.end(),
              [&sum](int x) { sum += x; });
// Is this safe? What is the problem?
```

#### Q3
```cpp
std::vector<int> data(10);  // Small dataset
std::sort(std::execution::par, data.begin(), data.end());
// Is parallel sort beneficial here? Why or why not?
```

#### Q4
```cpp
std::mutex mtx;
std::vector<int> data(1000);
std::for_each(std::execution::par_unseq, data.begin(), data.end(),
              [&](int x) {
                  std::lock_guard lock(mtx);
                  std::cout << x;
              });
// What is wrong with this code?
```

#### Q5
```cpp
std::vector<double> v = {1e10, 1.0, -1e10};
double sum1 = std::accumulate(v.begin(), v.end(), 0.0);
double sum2 = std::reduce(std::execution::par, v.begin(), v.end(), 0.0);
// Are sum1 and sum2 guaranteed to be equal?
```

---

### QUICK_REFERENCE: Summary Tables

#### Answer Key for Practice Tasks

| Task | Answer | Explanation |
|------|--------|-------------|
| 1 | 120 | Parallel multiply: 1 * 2 * 3 * 4 * 5 = 120 |
| 2 | Unsafe - data race | Multiple threads modify `sum` without synchronization |
| 3 | No - overhead dominates | Small data set: parallel overhead > benefits |
| 4 | UB - lock in par_unseq | Locks in vectorized code cause undefined behavior |
| 5 | No - different ordering | Parallel may group differently, changing floating-point rounding |

#### Execution Policy Comparison

| Policy | Parallelism | Vectorization | Requirements |
|--------|-------------|---------------|--------------|
| `seq` | ❌ No | ❌ No | None (default behavior) |
| `par` | ✅ Yes | ❌ No | Thread-safe operations |
| `par_unseq` | ✅ Yes | ✅ Yes | Thread-safe + vectorization-safe |
| `unseq` (C++20) | ❌ No | ✅ Yes | Vectorization-safe |

#### Parallelization Guidelines

| Data Size | Algorithm | Recommendation |
|-----------|-----------|----------------|
| < 1,000 | Any | Sequential (overhead too high) |
| 1K - 10K | Simple (sort, find) | Test both |
| 10K - 100K | Most | Likely beneficial |
| > 100K | All | Strongly beneficial |

#### Thread Safety Requirements

| Allowed in par | Allowed in par_unseq |
|----------------|----------------------|
| ✅ Thread-safe operations | ✅ Pure computations only |
| ✅ Locks/mutexes | ❌ No locks |
| ✅ Allocations | ❌ No allocations |
| ✅ Exceptions | ❌ No exceptions |
| ✅ I/O | ❌ No I/O |

---

**End of Chapter 16 Topic 4: C++17 Parallel Algorithms**

Parallel algorithms represent a major leap in C++ performance capabilities, enabling automatic multi-core utilization without manual threading complexity. Understanding execution policies, thread safety requirements, and performance characteristics is essential for high-performance C++ development, especially in data-intensive domains like autonomous vehicle perception where processing millions of sensor data points per second is routine. Master these features to write scalable, performant code that leverages modern hardware automatically.
