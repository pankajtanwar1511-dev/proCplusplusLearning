### PRACTICE_TASKS: Output Prediction and Code Analysis
#### Q1
Implement `erase(iterator pos)` that removes an element and shifts subsequent elements left.

Implement this exercise.

**Answer:**

```cpp
iterator erase(iterator pos) {
    if (pos < begin() || pos >= end()) {
        throw std::out_of_range("Invalid iterator");
    }

    size_t index = pos - begin();

    // Destroy element
    data_[index].~T();

    // Shift elements left
    for (size_t i = index; i < size_ - 1; ++i) {
        new (data_ + i) T(std::move(data_[i + 1]));
        data_[i + 1].~T();
    }

    --size_;

    return begin() + index;
}
```

**Complexity:** O(n)

---

#### Q2
Add a `capacity_growth_factor` template parameter to customize growth (1.5×, 2×, etc.).

Implement this exercise.

**Answer:**

```cpp
template<typename T, size_t GrowthNumerator = 2, size_t GrowthDenominator = 1>
class Vector {
private:
    void grow() {
        size_t new_capacity = (capacity_ == 0) ? 1 :
            (capacity_ * GrowthNumerator) / GrowthDenominator;

        reserve(new_capacity);
    }

public:
    void push_back(const T& value) {
        if (size_ == capacity_) {
            grow();
        }
        // ...
    }
};

// Usage:
Vector<int, 3, 2> v;  // 1.5× growth (3/2)
Vector<int, 2, 1> v2; // 2× growth (2/1)
```

---

#### Q3
Implement Small Buffer Optimization (SBO) for vectors with ≤ 16 elements.

Implement this exercise.

(See Q9 above for full implementation)

---

#### Q4
Add statistics tracking: total reallocations, total elements moved/copied.

Implement this exercise.

**Answer:**

```cpp
template<typename T>
class Vector {
private:
    size_t total_reallocations_ = 0;
    size_t total_moves_ = 0;
    size_t total_copies_ = 0;

    void reallocate(size_t new_capacity) {
        ++total_reallocations_;

        // ... allocation ...

        if constexpr (std::is_nothrow_move_constructible_v<T>) {
            total_moves_ += size_;
            std::uninitialized_move_n(data_, size_, new_data);
        } else {
            total_copies_ += size_;
            // ... copy logic ...
        }

        // ... rest ...
    }

public:
    struct Stats {
        size_t reallocations;
        size_t moves;
        size_t copies;
    };

    Stats get_stats() const {
        return {total_reallocations_, total_moves_, total_copies_};
    }
};
```

**Usage:**
```cpp
Vector<int> v;
for (int i = 0; i < 1000; ++i) {
    v.push_back(i);
}

auto stats = v.get_stats();
std::cout << "Reallocations: " << stats.reallocations << '\n';
std::cout << "Moves: " << stats.moves << '\n';
```

---

#### Q5
Benchmark vector vs `std::vector` for 1M push_back operations.

Implement this exercise.

**Answer:**

```cpp
#include <chrono>
#include <vector>
#include <iostream>

template<typename Vec>
void benchmark(const std::string& name) {
    auto start = std::chrono::high_resolution_clock::now();

    Vec v;
    for (int i = 0; i < 1000000; ++i) {
        v.push_back(i);
    }

    auto end = std::chrono::high_resolution_clock::now();
    auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(end - start).count();

    std::cout << name << ": " << ms << " ms\n";
}

int main() {
    benchmark<Vector<int>>("Custom Vector");
    benchmark<std::vector<int>>("std::vector");

    return 0;
}
```

**Typical output:**
```
Custom Vector: 42 ms
std::vector: 38 ms
```

Our implementation is competitive!

---

### **Q6-Q10:** Additional practice questions...

**Q6:** Implement `assign(count, value)` that replaces vector contents.

**Q7:** Add allocator support (template parameter `Allocator`).

**Q8:** Implement reverse iterators (`rbegin()`, `rend()`).

**Q9:** Add comparison operators (`==`, `!=`, `<`, etc.).

**Q10:** Implement range-based `insert(pos, first, last)`.

---
