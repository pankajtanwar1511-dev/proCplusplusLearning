## TOPIC: C++17 Parallel Algorithms - Execution Policies and Performance

### PRACTICE_TASKS: Code Analysis and Prediction

#### Q1
```cpp
#include <iostream>
#include <vector>
#include <numeric>
#include <execution>
int main() {
    std::vector<int> data = {1, 2, 3, 4, 5};
    int product = std::reduce(std::execution::par, data.begin(), data.end(),
                              1, std::multiplies<>());
    std::cout << product;
}
```

**Answer:**
```
120
```

**Explanation:**
- `std::reduce` with `std::execution::par` performs parallel reduction
- Initial value is 1, operation is multiplication
- Calculates: 1 × 1 × 2 × 3 × 4 × 5 = 120
- Parallel execution doesn't affect result for associative operations
- **Key Concept:** std::reduce with parallel policy enables efficient parallel reduction for associative operations like multiplication

#### Q2
```cpp
#include <vector>
#include <algorithm>
#include <execution>
int main() {
    std::vector<int> data(100);
    int sum = 0;
    std::for_each(std::execution::par, data.begin(), data.end(),
                  [&sum](int x) { sum += x; });
}
```

**Answer:**
```
Data race - undefined behavior
```

**Explanation:**
- Multiple threads access `sum` concurrently without synchronization
- `sum += x` is not atomic - read-modify-write race condition
- Undefined behavior: sum may have incorrect value, or program may crash
- Should use `std::reduce` instead, or protect `sum` with mutex (but defeats parallelism)
- **Key Concept:** Parallel algorithms require thread-safe operations; avoid capturing mutable state by reference in parallel lambdas

#### Q3
```cpp
#include <vector>
#include <algorithm>
#include <execution>
int main() {
    std::vector<int> data(10);  // Small dataset
    std::sort(std::execution::par, data.begin(), data.end());
}
```

**Answer:**
```
Not beneficial - overhead exceeds gains
```

**Explanation:**
- Parallel execution has overhead: thread creation, synchronization, work distribution
- For small datasets (10 elements), sequential sort is faster
- Break-even point typically thousands to millions of elements (depends on hardware)
- Parallel overhead can make small operations slower than sequential
- **Key Concept:** Parallel algorithms beneficial only when data size justifies threading overhead; profile to find break-even point

#### Q4
```cpp
#include <vector>
#include <algorithm>
#include <execution>
#include <mutex>
#include <iostream>
int main() {
    std::mutex mtx;
    std::vector<int> data(1000);
    std::for_each(std::execution::par_unseq, data.begin(), data.end(),
                  [&](int x) {
                      std::lock_guard lock(mtx);
                      std::cout << x;
                  });
}
```

**Answer:**
```
Undefined behavior - mutex not allowed with par_unseq
```

**Explanation:**
- `std::execution::par_unseq` allows SIMD vectorization within threads
- Vectorized code cannot use mutexes (blocking operations forbidden)
- Using mutex with `par_unseq` violates standard requirements - undefined behavior
- Should use `std::execution::par` if synchronization needed, or redesign to avoid shared state
- **Key Concept:** par_unseq policy forbids blocking operations like mutexes; use only for lock-free, exception-free operations

#### Q5
```cpp
#include <vector>
#include <numeric>
#include <execution>
#include <iostream>
int main() {
    std::vector<double> v = {1e10, 1.0, -1e10};
    double sum1 = std::accumulate(v.begin(), v.end(), 0.0);
    double sum2 = std::reduce(std::execution::par, v.begin(), v.end(), 0.0);
    std::cout << "accumulate: " << sum1 << " reduce: " << sum2;
}
```

**Answer:**
```
Not guaranteed equal - may differ due to floating-point associativity
```

**Explanation:**
- `std::accumulate` processes sequentially: ((1e10 + 1.0) - 1e10) = 1.0 (precision loss)
- `std::reduce` may reorder: (1e10 - 1e10) + 1.0 = 1.0, or 1e10 + (1.0 - 1e10) = different result
- Floating-point addition is not perfectly associative (rounding errors)
- Parallel reduce trades determinism for performance
- **Key Concept:** Parallel reduce may reorder operations; results differ for non-associative operations like floating-point arithmetic

---
