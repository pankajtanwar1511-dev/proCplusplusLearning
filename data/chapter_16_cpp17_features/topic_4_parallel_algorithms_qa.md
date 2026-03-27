## TOPIC: C++17 Parallel Algorithms - Execution Policies and Performance

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
