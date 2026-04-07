# Topic 6: Custom std::function - Callable Wrapper with Type Erasure

### THEORY_SECTION: Core Concepts and Foundations
#### 1. What is std::function?

`std::function` is a **polymorphic function wrapper** that can store any callable:
- Free functions
- Member functions (with bind)
- Lambdas
- Function objects (functors)

**Key characteristic:** **Type erasure** - hides the concrete callable type behind a uniform interface.

**Real-World Analogy: Universal Remote Control**

**The Problem (Without std::function):**
```
You have 3 devices:
  📺 TV     (brand: Sony, interface: Sony-specific buttons)
  📻 Radio  (brand: Bose, interface: Bose-specific buttons)
  🎮 GameConsole (brand: PlayStation, interface: PS-specific buttons)

Each has different control interface - you need 3 remotes!

In C++ terms:
  auto tv_lambda = [](int volume) { /* Sony-specific code */ };      // Type: λ₁
  auto radio_lambda = [](int volume) { /* Bose-specific code */ };   // Type: λ₂
  struct GameFunctor { void operator()(int vol) { /*...*/ } };       // Type: GameFunctor

Cannot store in same variable:
  auto control = tv_lambda;     // Type: λ₁
  control = radio_lambda;       // ❌ ERROR - different type!
```

**The Solution (With std::function):**
```
Universal Remote Control:
  🎮 One remote that works with TV, Radio, GameConsole
  🔌 Same interface for all devices
  🎛️ Press "Volume +" → Works with whichever device is paired

In C++ terms:
  std::function<void(int)> control;  // Universal interface

  control = tv_lambda;       // Pair with TV
  control(50);               // TV volume → 50

  control = radio_lambda;    // Re-pair with Radio
  control(30);               // Radio volume → 30

  control = GameFunctor{};   // Re-pair with Game
  control(80);               // Game volume → 80

Same variable, same call syntax, different devices! ✓
```

**Visual Representation:**

```
WITHOUT std::function (Each callable = different type):
┌──────────┐   ┌───────────┐   ┌──────────┐
│  Lambda  │   │  Functor  │   │ Function │
│  Type: λ │   │ Type: F   │   │  Type: * │
└──────────┘   └───────────┘   └──────────┘
     ❌ Cannot store in same variable ❌

WITH std::function (Type Erasure):
┌─────────────────────────────────────────────┐
│        std::function<int(int, int)>         │  ← Universal interface
│                                             │
│  ┌─────────┐  ┌─────────┐  ┌──────────┐   │
│  │ Lambda  │  │ Functor │  │ Function │   │  ← Hidden concrete types
│  │ Type: λ │  │ Type: F │  │  Type: * │   │
│  └─────────┘  └─────────┘  └──────────┘   │
└─────────────────────────────────────────────┘
          ✓ All stored uniformly ✓
```

**Example: Storing Different Callables**

```cpp
#include <functional>

// 1. Free function
int add_function(int a, int b) {
    return a + b;
}

// 2. Functor
struct Multiplier {
    int operator()(int a, int b) {
        return a * b;
    }
};

int main() {
    std::function<int(int, int)> func;

    // Store lambda
    func = [](int a, int b) { return a + b; };
    std::cout << func(2, 3);  // 5

    // Store functor
    func = Multiplier{};
    std::cout << func(2, 3);  // 6

    // Store free function
    func = &add_function;
    std::cout << func(2, 3);  // 5

    // All using SAME variable! ✓
}
```

**Key Characteristics:**

| Feature | Explanation | Benefit |
|---------|-------------|---------|
| **Polymorphic Wrapper** | Can store any callable with matching signature | Flexibility - swap callables at runtime |
| **Type Erasure** | Hides concrete callable type | Uniform interface across different types |
| **Copyable** | Can copy std::function objects | Pass functions as values |
| **Nullable** | Can be empty (nullptr) | Optional function behavior |
| **Overhead** | Heap allocation + virtual dispatch | Trade-off for flexibility |

**Why std::function is Useful:**

```cpp
// PROBLEM: Cannot store different callbacks in same container
std::vector<???> callbacks;  // What type to use?

// SOLUTION: std::function provides uniform type
std::vector<std::function<void(int)>> callbacks;

callbacks.push_back([](int x) { std::cout << x; });
callbacks.push_back(Printer{});
callbacks.push_back(&print_function);

// Call all callbacks
for (auto& cb : callbacks) {
    cb(42);  // Works for all types!
}
```

---

#### 2. Type Erasure Technique - The Magic Behind the Wrapper

**Problem:** Different callables have different types:

```cpp
auto lambda = [](int x) { return x * 2; };  // Type: λ (compiler-generated, unknown)
struct Functor { int operator()(int x) { return x * 2; } };  // Type: Functor

// How to store both in same variable?
std::function<int(int)> func;
func = lambda;   // OK
func = Functor{}; // Also OK - but how?!
```

**Real-World Analogy: Universal Power Adapter**

```
Problem: US plug, EU plug, UK plug (all different shapes)
Solution: Universal adapter with:
  1. Common socket (std::function interface)
  2. Internal adapters for each plug type (CallableImpl<T>)
  3. Virtual mechanism to route power (virtual dispatch)

┌────────────────────────────────────┐
│  Universal Adapter (std::function) │  ← One interface
├────────────────────────────────────┤
│  ┌──────────┐  ┌───────┐  ┌─────┐ │
│  │ US Plug  │  │EU Plug│  │UK   │ │  ← Different plug types
│  │ Adapter  │  │Adapter│  │Plug │ │     (CallableImpl<T>)
│  └──────────┘  └───────┘  └─────┘ │
└────────────────────────────────────┘
```

**Solution: Type Erasure via Inheritance + Templates**

**Step 1: Define Type-Erased Interface (Base Class)**
```cpp
// Base class - knows NOTHING about concrete type
struct CallableBase {
    virtual int call(int) = 0;        // Pure virtual - must override
    virtual ~CallableBase() = default; // Virtual destructor (polymorphic)
};

// This base class defines the CONTRACT:
//   "I don't care what callable you are,
//    but you MUST be able to call(int) and return int"
```

**Step 2: Define Type-Aware Implementation (Derived Template)**
```cpp
// Template class - knows CONCRETE type F
template<typename F>
struct CallableImpl : CallableBase {
    F func_;  // Store the actual callable

    CallableImpl(F f) : func_(std::move(f)) {}

    // Override virtual call() to invoke stored callable
    int call(int x) override {
        return func_(x);  // Call F's operator() or function
    }
};

// This template instantiates DIFFERENT classes for each F:
//   CallableImpl<Lambda1>
//   CallableImpl<Lambda2>
//   CallableImpl<Functor>
// But they all INHERIT from CallableBase!
```

**Step 3: Create Wrapper Class**
```cpp
class Function {
    CallableBase* ptr_;  // Polymorphic pointer (type-erased!)

public:
    // Constructor template - accepts ANY callable
    template<typename F>
    Function(F f) : ptr_(new CallableImpl<F>(std::move(f))) {}

    // Call operator - uses virtual dispatch
    int operator()(int x) {
        return ptr_->call(x);  // Virtual call → routed to correct CallableImpl<F>
    }

    ~Function() {
        delete ptr_;  // Cleanup
    }
};
```

**Visual: How Type Erasure Works**

```
USER CODE:
  Function func = [](int x) { return x * 2; };  // Lambda
                    ↓
COMPILER INSTANTIATES:
  CallableImpl<Lambda> derived class
                    ↓
MEMORY LAYOUT:
┌─────────────────────────────────────────────┐
│ Function object                             │
│  ┌───────────────────────────────────────┐  │
│  │ ptr_ → CallableBase*                  │  │  ← Type-erased pointer
│  └───────┬───────────────────────────────┘  │
│          │ (points to heap)                 │
└──────────┼──────────────────────────────────┘
           ↓
    ┌──────────────────────────────────────┐
    │ Heap: CallableImpl<Lambda>           │
    │  ┌────────────────────────────────┐  │
    │  │ VTable* → call(), ~destructor  │  │
    │  ├────────────────────────────────┤  │
    │  │ func_: Lambda object           │  │  ← Concrete lambda stored here
    │  │   [captures, if any]           │  │
    │  └────────────────────────────────┘  │
    └──────────────────────────────────────┘

WHEN YOU CALL:
  func(10)
       ↓
  Function::operator()(10)
       ↓
  ptr_->call(10)  ← Virtual dispatch
       ↓
  CallableImpl<Lambda>::call(10)  ← Resolved at runtime
       ↓
  func_(10)  ← Invoke stored lambda
       ↓
  10 * 2 = 20
```

**Step-by-Step Example:**

```cpp
// Step 1: Create lambda
auto my_lambda = [](int x) { return x * 2; };

// Step 2: Store in Function
Function func(my_lambda);

// What happens behind the scenes:
// 1. Function constructor template is instantiated: Function<Lambda>
// 2. CallableImpl<Lambda> is instantiated
// 3. New CallableImpl<Lambda> allocated on heap
// 4. ptr_ points to CallableImpl<Lambda> (but type is CallableBase*)

// Step 3: Call the function
int result = func(5);

// What happens:
// 1. Function::operator()(5) is called
// 2. ptr_->call(5) - virtual dispatch to CallableImpl<Lambda>::call(5)
// 3. CallableImpl<Lambda>::call(5) invokes my_lambda(5)
// 4. Returns 10
```

**Comparison: With vs Without Type Erasure**

**WITHOUT Type Erasure (Templates Only):**
```cpp
template<typename F>
class Wrapper {
    F func_;  // Concrete type in template parameter
public:
    Wrapper(F f) : func_(f) {}
    int operator()(int x) { return func_(x); }
};

// Problem:
Wrapper<Lambda1> w1 = lambda1;
Wrapper<Lambda2> w2 = lambda2;

w1 = w2;  // ❌ ERROR - different types!
// Wrapper<Lambda1> ≠ Wrapper<Lambda2>
```

**WITH Type Erasure (Our Function):**
```cpp
Function f1 = lambda1;
Function f2 = lambda2;

f1 = f2;  // ✓ OK - same type (Function)!
// Both use CallableBase* internally
```

**Trade-offs:**

| Aspect | Benefit | Cost |
|--------|---------|------|
| **Uniform Interface** | Can store any callable in same type | Virtual dispatch overhead (~1-3ns) |
| **Runtime Flexibility** | Can reassign different callables | Heap allocation (~50-100ns) |
| **Type Safety** | Signature checked at compile time | Slightly larger object (pointer + metadata) |
| **Copyable** | Can copy Function objects | Must clone stored callable |

**Performance Impact:**

```cpp
// Direct call (no wrapper):
auto lambda = [](int x) { return x * 2; };
lambda(10);  // Cost: 0ns (inlined by compiler)

// With std::function:
std::function<int(int)> func = lambda;
func(10);  // Cost: ~5-10ns (heap indirection + virtual call)

// When to use:
// - Need runtime flexibility (callbacks, event handlers)
// - Storing different callables in containers
// - Plugin systems, strategy pattern

// When NOT to use:
// - Hot loops (use templates instead)
// - Performance-critical code
// - Known callable type at compile time
```

---

#### 3. Small Buffer Optimization (SBO)

To avoid heap allocation for small functors:

```cpp
class Function {
    static constexpr size_t BUF_SIZE = 16;

    alignas(std::max_align_t) char buffer_[BUF_SIZE];
    CallableBase* ptr_;

    bool is_small(size_t size) {
        return size <= BUF_SIZE;
    }

public:
    template<typename F>
    Function(F f) {
        if (sizeof(CallableImpl<F>) <= BUF_SIZE) {
            ptr_ = new (buffer_) CallableImpl<F>(std::move(f));  // In-place
        } else {
            ptr_ = new CallableImpl<F>(std::move(f));  // Heap
        }
    }
};
```

**Benefits:** No allocation for small lambdas (captures ≤ 16 bytes).

---

#### 4. Signature-Agnostic Design

`std::function<R(Args...)>` is a template, specialized for each signature:

```cpp
template<typename Signature>
class Function;  // Primary template (undefined)

template<typename R, typename... Args>
class Function<R(Args...)> {  // Specialization for function signatures
    // Implementation uses Args... for call()
};
```

This allows:
```cpp
Function<int(int, int)> add_func;
Function<void(std::string)> print_func;
```

---



```cpp
#include <memory>
#include <utility>
#include <type_traits>
#include <stdexcept>

// ============================================================
// FUNCTION CLASS (Primary template)
// ============================================================

template<typename Signature>
class Function;  // Undefined

// ============================================================
// SPECIALIZATION FOR FUNCTION SIGNATURES
// ============================================================

template<typename R, typename... Args>
class Function<R(Args...)> {
private:
    // ============================================================
    // TYPE-ERASED INTERFACE
    // ============================================================

    struct CallableBase {
        virtual R invoke(Args... args) = 0;
        virtual std::unique_ptr<CallableBase> clone() const = 0;
        virtual ~CallableBase() = default;
    };

    // ============================================================
    // CONCRETE CALLABLE WRAPPER
    // ============================================================

    template<typename F>
    struct CallableImpl : CallableBase {
        F func_;

        explicit CallableImpl(F&& f) : func_(std::forward<F>(f)) {}

        R invoke(Args... args) override {
            return func_(std::forward<Args>(args)...);
        }

        std::unique_ptr<CallableBase> clone() const override {
            return std::make_unique<CallableImpl>(func_);
        }
    };

    // ============================================================
    // MEMBERS
    // ============================================================

    std::unique_ptr<CallableBase> callable_;

public:
    // ============================================================
    // CONSTRUCTORS
    // ============================================================

    // Default constructor - empty function
    Function() noexcept : callable_(nullptr) {}

    // Nullptr constructor
    Function(std::nullptr_t) noexcept : callable_(nullptr) {}

    // Callable constructor
    template<typename F,
             typename = std::enable_if_t<!std::is_same_v<std::decay_t<F>, Function>>>
    Function(F&& f)
        : callable_(std::make_unique<CallableImpl<std::decay_t<F>>>(
              std::forward<F>(f)))
    {}

    // Copy constructor
    Function(const Function& other)
        : callable_(other.callable_ ? other.callable_->clone() : nullptr)
    {}

    // Move constructor
    Function(Function&& other) noexcept
        : callable_(std::move(other.callable_))
    {}

    // ============================================================
    // ASSIGNMENT OPERATORS
    // ============================================================

    Function& operator=(const Function& other) {
        if (this != &other) {
            Function temp(other);
            swap(temp);
        }
        return *this;
    }

    Function& operator=(Function&& other) noexcept {
        callable_ = std::move(other.callable_);
        return *this;
    }

    Function& operator=(std::nullptr_t) noexcept {
        callable_.reset();
        return *this;
    }

    template<typename F>
    Function& operator=(F&& f) {
        Function temp(std::forward<F>(f));
        swap(temp);
        return *this;
    }

    // ============================================================
    // INVOCATION
    // ============================================================

    R operator()(Args... args) const {
        if (!callable_) {
            throw std::bad_function_call();
        }

        return callable_->invoke(std::forward<Args>(args)...);
    }

    // ============================================================
    // OBSERVERS
    // ============================================================

    explicit operator bool() const noexcept {
        return callable_ != nullptr;
    }

    // ============================================================
    // SWAP
    // ============================================================

    void swap(Function& other) noexcept {
        std::swap(callable_, other.callable_);
    }
};

// ============================================================
// NON-MEMBER SWAP
// ============================================================

template<typename R, typename... Args>
void swap(Function<R(Args...)>& lhs, Function<R(Args...)>& rhs) noexcept {
    lhs.swap(rhs);
}
```

---

### EDGE_CASES: Tricky Scenarios and Deep Internals
#### Edge Case 1: Empty Function Call

```cpp
Function<void()> f;  // Empty
f();  // ← Throws std::bad_function_call
```

**Check before calling:**
```cpp
if (f) {
    f();  // Safe
}
```

---

#### Edge Case 2: Return Type Mismatch

```cpp
Function<int()> f = []() { return 42; };  // ✓ OK

Function<void()> g = []() { return 42; };  // ✗ Compile error
```

Signature must match exactly (return type + parameter types).

---

#### Edge Case 3: Capturing Lambda

```cpp
int x = 10;
Function<int()> f = [x]() { return x; };  // ✓ Copies x into lambda
```

Large captures may cause heap allocation.

---

#### Edge Case 4: Self-Assignment

```cpp
f = f;  // Must handle safely
```

**Our implementation is safe** (copy-and-swap idiom):
```cpp
Function& operator=(const Function& other) {
    if (this != &other) {  // ← Self-check
        Function temp(other);
        swap(temp);
    }
    return *this;
}
```

---

#### Edge Case 5: Storing Non-Copyable Callables

```cpp
auto lambda = [ptr = std::make_unique<int>(42)]() {
    return *ptr;
};

Function<int()> f = std::move(lambda);  // ✓ OK (move)

Function<int()> f2 = f;  // ✗ Error: lambda not copyable
```

`std::function` requires callable to be CopyConstructible.

**Alternative:** Use `std::move_only_function` (C++23).

---

### CODE_EXAMPLES: Practical Demonstrations
#### Example 1: Storing Different Callables

**This example demonstrates how std::function provides a uniform interface for storing and invoking different callable types through type erasure.**

**What this code does:**
- Creates a single `Function<int(int, int)>` variable that can store any callable matching the signature
- Stores and invokes a free function pointer (`&add`)
- Replaces the callable with a functor object (`Multiplier`)
- Replaces it again with a lambda function
- All three different types are invoked through the same `func(a, b)` interface

**Key concepts demonstrated:**
- **Type erasure in action**: Different concrete types (function pointer, functor, lambda) hidden behind uniform `Function` interface
- **Polymorphic function wrapper**: Single variable seamlessly stores completely different callable implementations
- **Virtual dispatch overhead**: Each invocation goes through virtual function call to reach concrete callable
- **Assignment semantics**: Assigning new callable replaces previous one, destroying old state

**Real-world applications:**
- Callback systems where different modules provide different implementations
- Strategy pattern implementations where algorithms can be swapped at runtime
- Plugin architectures where behavior can be dynamically loaded
- Event handlers that may be functions, lambdas, or member function bindings

**Performance implications:**
- Each call incurs virtual function dispatch overhead (~5-10ns vs direct call)
- Assignment triggers heap allocation/deallocation (unless using Small Buffer Optimization)
- Type erasure prevents compiler inlining optimizations

```cpp
#include <iostream>

int add(int a, int b) {
    return a + b;
}

struct Multiplier {
    int operator()(int a, int b) const {
        return a * b;
    }
};

int main() {
    Function<int(int, int)> func;

    // Free function
    func = &add;
    std::cout << "add(2, 3) = " << func(2, 3) << '\n';  // 5

    // Functor
    func = Multiplier{};
    std::cout << "multiply(2, 3) = " << func(2, 3) << '\n';  // 6

    // Lambda
    func = [](int a, int b) { return a - b; };
    std::cout << "subtract(5, 3) = " << func(5, 3) << '\n';  // 2

    return 0;
}
```

**Output:**
```
add(2, 3) = 5
multiply(2, 3) = 6
subtract(5, 3) = 2
```

---

#### Example 2: Callback System

**This example demonstrates using std::function to implement a flexible event callback system with stateful callbacks.**

**What this code does:**
- Implements a `Button` class that holds a callback function (`on_click_`)
- Allows external code to set custom behavior via `set_on_click()`
- The callback captures external state (`click_count`) by reference
- Each button click executes the stored callback, modifying captured state
- Demonstrates how callbacks can maintain state across multiple invocations

**Key concepts demonstrated:**
- **Observer pattern**: Button notifies callback without knowing its implementation
- **Stateful lambdas**: Callback captures and modifies external variable across calls
- **Decoupling**: Button class knows nothing about click_count or printing logic
- **Late binding**: Callback behavior set at runtime, not compile time
- **Null callback handling**: Check `if (on_click_)` prevents crash when no callback set

**Real-world applications:**
- GUI frameworks (button clicks, mouse events, keyboard handlers)
- Asynchronous I/O completion callbacks
- HTTP request handlers in web frameworks
- Game engine event systems (collision callbacks, input handlers)
- Observer pattern implementations for reactive programming

**Why this matters:**
- Enables inversion of control: Button doesn't dictate behavior, caller does
- Allows single Button class to support infinite behaviors without modification
- Type-safe alternative to raw function pointers that supports capturing lambdas

```cpp
#include <iostream>
#include <vector>

class Button {
    Function<void()> on_click_;

public:
    void set_on_click(Function<void()> callback) {
        on_click_ = std::move(callback);
    }

    void click() {
        if (on_click_) {
            on_click_();
        }
    }
};

int main() {
    Button btn;

    int click_count = 0;

    btn.set_on_click([&click_count]() {
        ++click_count;
        std::cout << "Button clicked! Count: " << click_count << '\n';
    });

    btn.click();
    btn.click();
    btn.click();

    return 0;
}
```

**Output:**
```
Button clicked! Count: 1
Button clicked! Count: 2
Button clicked! Count: 3
```

---

#### Example 3: Strategy Pattern

**This example demonstrates the Strategy design pattern using std::function to swap sorting algorithms at runtime without inheritance hierarchies.**

**What this code does:**
- `Sorter` class wraps a comparison strategy stored in `Function<bool(int, int)>`
- Strategy is injected via constructor (dependency injection)
- Same `sort()` method works with any comparison function (ascending, descending, custom)
- Creates two `Sorter` instances with different strategies
- Demonstrates how behavior changes based on injected strategy

**Key concepts demonstrated:**
- **Strategy pattern without inheritance**: No need for `ComparatorBase` interface and derived classes
- **Runtime algorithm selection**: Choose sorting behavior when constructing Sorter, not at compile time
- **Composition over inheritance**: Behavior is composed through function object, not inherited
- **Uniform interface**: Client code calls `sorter.sort(vec)` regardless of comparison logic
- **Testability**: Easy to inject mock comparison functions for testing

**Real-world applications:**
- Sorting/filtering with configurable predicates
- Compression libraries with pluggable compression algorithms
- Database query engines with different optimization strategies
- Rendering engines with swappable shaders/pipelines
- Validation systems with configurable validation rules

**Why this matters:**
- Eliminates class hierarchy explosion (no need for `AscendingSorter`, `DescendingSorter` classes)
- More flexible than template-based strategy (can change at runtime)
- Enables strategy to come from configuration files, user input, or network
- Cleaner than function pointer approach (supports lambdas with captures)

**Performance implications:**
- Virtual dispatch overhead in comparison function (but comparison is usually dominant cost anyway)
- For performance-critical sorting, template-based approach (compile-time strategy) may be better

```cpp
#include <iostream>
#include <vector>
#include <algorithm>

class Sorter {
    Function<bool(int, int)> compare_;

public:
    Sorter(Function<bool(int, int)> comp) : compare_(std::move(comp)) {}

    void sort(std::vector<int>& vec) {
        std::sort(vec.begin(), vec.end(), [this](int a, int b) {
            return compare_(a, b);
        });
    }
};

int main() {
    std::vector<int> nums = {3, 1, 4, 1, 5, 9, 2, 6};

    // Ascending
    Sorter asc([](int a, int b) { return a < b; });
    asc.sort(nums);

    std::cout << "Ascending: ";
    for (int n : nums) std::cout << n << ' ';
    std::cout << '\n';

    // Descending
    Sorter desc([](int a, int b) { return a > b; });
    desc.sort(nums);

    std::cout << "Descending: ";
    for (int n : nums) std::cout << n << ' ';
    std::cout << '\n';

    return 0;
}
```

**Output:**
```
Ascending: 1 1 2 3 4 5 6 9
Descending: 9 6 5 4 3 2 1 1
```

---

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

### QUICK_REFERENCE: Key Takeaways and Comparison Tables
```cpp
// Construction
Function<int(int, int)> func;
func = [](int a, int b) { return a + b; };  // Lambda
func = &add_function;                       // Free function
func = Functor{};                           // Functor

// Invocation
int result = func(2, 3);

// Check if empty
if (func) {
    func(1, 2);  // Safe
}

// Reset
func = nullptr;

// Swap
func1.swap(func2);
```

**Key concepts:**
- Type erasure via inheritance + templates
- Virtual dispatch for polymorphism
- Small Buffer Optimization (SBO)
- Requires CopyConstructible callables
