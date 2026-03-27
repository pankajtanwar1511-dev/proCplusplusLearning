### PRACTICE_TASKS: Output Prediction and Code Analysis
#### Q1
Add support for `target()` method that returns pointer to stored callable.

Implement this exercise.

**Answer:**

```cpp
template<typename R, typename... Args>
class Function<R(Args...)> {
private:
    struct CallableBase {
        virtual void* target_ptr(const std::type_info& ti) = 0;
        // ... existing methods ...
    };

    template<typename F>
    struct CallableImpl : CallableBase {
        F func_;

        void* target_ptr(const std::type_info& ti) override {
            if (ti == typeid(F)) {
                return &func_;
            }
            return nullptr;
        }
    };

public:
    template<typename T>
    T* target() {
        if (!callable_) return nullptr;

        return static_cast<T*>(callable_->target_ptr(typeid(T)));
    }

    template<typename T>
    const T* target() const {
        if (!callable_) return nullptr;

        return static_cast<const T*>(callable_->target_ptr(typeid(T)));
    }
};
```

**Usage:**
```cpp
Function<int(int)> func = [](int x) { return x * 2; };

using Lambda = decltype([](int x) { return x * 2; });
if (auto* lambda_ptr = func.target<Lambda>()) {
    std::cout << "Stored lambda\n";
}
```

---

#### Q2
Implement `std::function` with Small Buffer Optimization for callables ≤ 32 bytes.

Implement this exercise.

(See Q5 above for complete implementation)

---

#### Q3
Add exception handling: if callable throws, wrap exception in custom type.

Implement this exercise.

**Answer:**

```cpp
R operator()(Args... args) {
    if (!callable_) {
        throw std::bad_function_call();
    }

    try {
        return callable_->invoke(std::forward<Args>(args)...);
    } catch (...) {
        // Re-wrap exception
        throw std::runtime_error("Exception in std::function invocation");
    }
}
```

---

#### Q4
Benchmark `std::function` vs direct lambda call for 1M invocations.

Implement this exercise.

**Answer:**

```cpp
#include <chrono>
#include <iostream>

int main() {
    auto lambda = [](int x) { return x * 2; };

    // Direct call
    auto start = std::chrono::high_resolution_clock::now();
    for (int i = 0; i < 1000000; ++i) {
        volatile int result = lambda(i);
    }
    auto end = std::chrono::high_resolution_clock::now();
    auto direct_ms = std::chrono::duration_cast<std::chrono::milliseconds>(end - start).count();

    // std::function
    Function<int(int)> func = lambda;

    start = std::chrono::high_resolution_clock::now();
    for (int i = 0; i < 1000000; ++i) {
        volatile int result = func(i);
    }
    end = std::chrono::high_resolution_clock::now();
    auto func_ms = std::chrono::duration_cast<std::chrono::milliseconds>(end - start).count();

    std::cout << "Direct: " << direct_ms << " ms\n";
    std::cout << "Function: " << func_ms << " ms\n";
    std::cout << "Overhead: " << (func_ms - direct_ms) << " ms\n";

    return 0;
}
```

**Typical output:**
```
Direct: 2 ms
Function: 12 ms
Overhead: 10 ms (5× slower)
```

---

#### Q5
Implement `std::function` that tracks invocation count.

Implement this exercise.

**Answer:**

```cpp
template<typename R, typename... Args>
class TrackingFunction : public Function<R(Args...)> {
    mutable std::atomic<size_t> call_count_{0};

public:
    using Function<R(Args...)>::Function;

    R operator()(Args... args) const {
        ++call_count_;
        return Function<R(Args...)>::operator()(std::forward<Args>(args)...);
    }

    size_t call_count() const {
        return call_count_.load();
    }
};
```

**Usage:**
```cpp
TrackingFunction<int(int)> func = [](int x) { return x * 2; };

func(1);
func(2);
func(3);

std::cout << "Called " << func.call_count() << " times\n";  // 3
```

---
