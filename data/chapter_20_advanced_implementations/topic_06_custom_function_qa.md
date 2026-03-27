### INTERVIEW_QA: Comprehensive Questions and Answers
#### Q1: How does type erasure work in std::function?
Implement this exercise.

**Answer:**

**Type erasure** hides the concrete callable type behind a polymorphic interface:

**Step 1: Base class (type-erased):**
```cpp
struct CallableBase {
    virtual R invoke(Args...) = 0;  // Virtual dispatch
};
```

**Step 2: Template-derived class (knows concrete type):**
```cpp
template<typename F>
struct CallableImpl : CallableBase {
    F func_;  // Stores actual callable

    R invoke(Args... args) override {
        return func_(args...);  // Calls concrete func
    }
};
```

**Step 3: Wrapper holds base pointer:**
```cpp
class Function {
    std::unique_ptr<CallableBase> callable_;  // Polymorphic

    template<typename F>
    Function(F f) {
        callable_ = std::make_unique<CallableImpl<F>>(std::move(f));
    }

    R operator()(Args... args) {
        return callable_->invoke(args...);  // Virtual call
    }
};
```

**Key insight:** Template instantiates concrete wrapper, stored via base pointer.

---
#### Q2: What is Small Buffer Optimization (SBO)? Why is it important?
Implement this exercise.

**Answer:**

**SBO:** Store small callables inline (avoid heap allocation).

**Without SBO:**
```cpp
Function<int()> f = []() { return 42; };  // Heap allocation
```

**With SBO:**
```cpp
class Function {
    static constexpr size_t BUF_SIZE = 16;
    alignas(alignof(std::max_align_t)) char buffer_[BUF_SIZE];

    template<typename F>
    Function(F f) {
        if (sizeof(CallableImpl<F>) <= BUF_SIZE) {
            new (buffer_) CallableImpl<F>(f);  // Inline (no allocation)
        } else {
            // Heap allocation
        }
    }
};
```

**Benefits:**
- ✅ No allocation for small lambdas
- ✅ Better cache locality
- ✅ Faster construction/destruction

**Used by:** libc++ `std::function`, LLVM's `function_ref`.

---
#### Q3: Why does std::function require CopyConstructible callables?
Implement this exercise.

**Answer:**

**std::function is copyable:**
```cpp
std::function<int()> f1 = []() { return 42; };
std::function<int()> f2 = f1;  // Copy
```

For this to work, **stored callable must be copyable**:

```cpp
R invoke(Args... args) override {
    return func_(args...);  // func_ must be copyable
}

std::unique_ptr<CallableBase> clone() const override {
    return std::make_unique<CallableImpl>(func_);  // Copy func_
}
```

**Move-only callable example (won't compile):**
```cpp
auto lambda = [ptr = std::make_unique<int>(42)]() {
    return *ptr;  // Captures move-only unique_ptr
};

std::function<int()> f = std::move(lambda);  // ✓ OK (move)
std::function<int()> f2 = f;  // ✗ Error: lambda not copyable
```

**Solution (C++23):** `std::move_only_function` (supports move-only callables).

---
#### Q4: What is the performance overhead of std::function compared to direct calls?
Implement this exercise.

**Answer:**

**Direct call (inline):**
```cpp
auto lambda = [](int x) { return x * 2; };
int result = lambda(42);  // Inlined by compiler (zero overhead)
```

**std::function (virtual dispatch):**
```cpp
std::function<int(int)> func = [](int x) { return x * 2; };
int result = func(42);  // Virtual call + potential heap allocation
```

**Benchmark:**
```cpp
// Direct lambda: ~1 ns per call
// std::function: ~5-10 ns per call (5-10× slower)
```

**Overhead sources:**
- Virtual function call (not inlined)
- Pointer dereference
- Heap allocation (if no SBO)

**When to use:**
- `std::function`: Need polymorphism, store in container
- Direct callable: Performance-critical, type known at compile time

---
#### Q5: How would you implement std::function with Small Buffer Optimization?
Implement this exercise.

**Answer:**

```cpp
template<typename R, typename... Args>
class Function<R(Args...)> {
private:
    static constexpr size_t BUF_SIZE = 32;  // 32 bytes inline

    struct CallableBase {
        virtual R invoke(Args...) = 0;
        virtual void destroy() = 0;          // Custom destroyer
        virtual void clone_to(void* dest) const = 0;  // Placement clone
        virtual ~CallableBase() = default;
    };

    template<typename F>
    struct CallableImpl : CallableBase {
        F func_;

        R invoke(Args... args) override {
            return func_(std::forward<Args>(args)...);
        }

        void destroy() override {
            func_.~F();  // Manual destruction
        }

        void clone_to(void* dest) const override {
            new (dest) CallableImpl(func_);
        }
    };

    alignas(std::max_align_t) char buffer_[BUF_SIZE];
    CallableBase* ptr_;
    bool heap_allocated_;

public:
    template<typename F>
    Function(F f) {
        using Impl = CallableImpl<std::decay_t<F>>;

        if (sizeof(Impl) <= BUF_SIZE && alignof(Impl) <= alignof(std::max_align_t)) {
            // Small: construct in buffer
            ptr_ = new (buffer_) Impl(std::move(f));
            heap_allocated_ = false;
        } else {
            // Large: heap allocate
            ptr_ = new Impl(std::move(f));
            heap_allocated_ = true;
        }
    }

    ~Function() {
        if (ptr_) {
            ptr_->destroy();
            if (heap_allocated_) {
                delete ptr_;
            }
        }
    }

    R operator()(Args... args) {
        return ptr_->invoke(std::forward<Args>(args)...);
    }
};
```

---
#### Q6: What is the difference between std::function and function pointers?
Implement this exercise.

**Answer:**

| Feature | Function Pointer | `std::function` |
|---------|------------------|-----------------|
| **Type** | `int(*)(int, int)` | `std::function<int(int, int)>` |
| **Can store** | Free functions only | Any callable |
| **Captures** | ❌ No (stateless) | ✅ Yes (lambdas) |
| **Overhead** | Zero (direct call) | Virtual dispatch + allocation |
| **Nullable** | ✅ Yes (`nullptr`) | ✅ Yes (empty state) |

**Example:**
```cpp
// Function pointer:
int (*fptr)(int, int) = &add;  // Only free functions

// std::function:
std::function<int(int, int)> func;
func = &add;                // Free function
func = [](int a, int b) { return a + b; };  // Lambda ✓
```

**When to use function pointers:** C API compatibility, performance-critical.

---
#### Q7: How does std::invoke work with member functions?
Implement this exercise.

**Answer:**

`std::function` stores bound member functions via `std::bind`:

```cpp
struct Foo {
    int add(int a, int b) { return a + b; }
};

Foo obj;

// Option 1: std::bind
std::function<int(int, int)> func = std::bind(&Foo::add, &obj, std::placeholders::_1, std::placeholders::_2);
func(2, 3);  // Calls obj.add(2, 3)

// Option 2: Lambda wrapper
std::function<int(int, int)> func2 = [&obj](int a, int b) {
    return obj.add(a, b);
};
```

**std::invoke internally:**
```cpp
template<typename F, typename... Args>
decltype(auto) invoke(F&& f, Args&&... args) {
    if constexpr (std::is_member_function_pointer_v<F>) {
        // Call member function
        return (std::forward<Args>(args).*f)(...);
    } else {
        // Call regular function/functor
        return std::forward<F>(f)(std::forward<Args>(args)...);
    }
}
```

---
#### Q8: Can you store a lambda with mutable state in std::function?
Implement this exercise.

**Answer:**

**Yes:**

```cpp
int counter = 0;

std::function<int()> func = [counter]() mutable {
    return ++counter;  // Modifies captured copy
};

std::cout << func() << '\n';  // 1
std::cout << func() << '\n';  // 2
std::cout << func() << '\n';  // 3
```

**Key points:**
- `mutable` allows modifying captured values
- Counter is **copied** into lambda (not reference)
- Each invocation modifies the lambda's internal state

**With reference capture:**
```cpp
int counter = 0;

std::function<int()> func = [&counter]() {
    return ++counter;  // Modifies external counter
};

std::cout << func() << '\n';  // 1
std::cout << counter << '\n';  // 1 (external modified)
```

---
#### Q9: How would you implement a move-only std::function?
Implement this exercise.

**Answer:**

```cpp
template<typename R, typename... Args>
class MoveOnlyFunction<R(Args...)> {
private:
    struct CallableBase {
        virtual R invoke(Args...) = 0;
        virtual ~CallableBase() = default;
        // No clone() - not copyable!
    };

    template<typename F>
    struct CallableImpl : CallableBase {
        F func_;  // May be move-only

        R invoke(Args... args) override {
            return func_(std::forward<Args>(args)...);
        }
    };

    std::unique_ptr<CallableBase> callable_;

public:
    template<typename F>
    MoveOnlyFunction(F&& f)
        : callable_(std::make_unique<CallableImpl<std::decay_t<F>>>(
              std::forward<F>(f)))
    {}

    // Delete copy
    MoveOnlyFunction(const MoveOnlyFunction&) = delete;
    MoveOnlyFunction& operator=(const MoveOnlyFunction&) = delete;

    // Enable move
    MoveOnlyFunction(MoveOnlyFunction&&) = default;
    MoveOnlyFunction& operator=(MoveOnlyFunction&&) = default;

    R operator()(Args... args) {
        return callable_->invoke(std::forward<Args>(args)...);
    }
};
```

**Usage:**
```cpp
MoveOnlyFunction<int()> func = [ptr = std::make_unique<int>(42)]() {
    return *ptr;  // Move-only lambda
};

// func2 = func;  // ✗ Error: not copyable
MoveOnlyFunction<int()> func2 = std::move(func);  // ✓ OK
```

---
#### Q10: What is std::function_ref (C++26)?
**Answer:**

`std::function_ref` is a **non-owning**, **lightweight** function wrapper:

```cpp
template<typename R, typename... Args>
class function_ref<R(Args...)> {
    void* obj_;
    R(*invoke_)(void*, Args...);

public:
    template<typename F>
    function_ref(F& f) {
        obj_ = &f;
        invoke_ = [](void* ptr, Args... args) -> R {
            return (*static_cast<F*>(ptr))(std::forward<Args>(args)...);
        };
    }

    R operator()(Args... args) {
        return invoke_(obj_, std::forward<Args>(args)...);
    }
};
```

**Comparison:**

| Feature | `std::function` | `std::function_ref` |
|---------|----------------|---------------------|
| **Ownership** | Owns callable | Non-owning reference |
| **Size** | ~32 bytes | 16 bytes (2 pointers) |
| **Allocation** | May allocate (SBO) | Never allocates |
| **Lifetime** | Independent | Tied to callable's lifetime |

**Use case:** Passing callbacks to functions (like `std::string_view` for strings).

---
