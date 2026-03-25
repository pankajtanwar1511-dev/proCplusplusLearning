## TOPIC: C++20 Coroutines - Stackless Cooperative Multitasking

---

### THEORY_SECTION: Understanding Coroutines - The Future of Async Programming

---

#### 1. What Are Coroutines - The Problem They Solve

**Traditional Async Programming Problems:**

```cpp
// ❌ Problem 1: Callback Hell
void download_file(const std::string& url,
                   std::function<void(Data)> on_complete,
                   std::function<void(Error)> on_error) {
    http_get(url, [on_complete, on_error](Result result) {
        if (result.success) {
            parse_data(result.data, [on_complete, on_error](ParseResult pr) {
                if (pr.valid) {
                    save_to_disk(pr.data, [on_complete, on_error](bool ok) {
                        if (ok) {
                            on_complete(pr.data);
                        } else {
                            on_error(Error::DiskError);
                        }
                    });
                } else {
                    on_error(Error::ParseError);
                }
            });
        } else {
            on_error(Error::NetworkError);
        }
    });
}
// Deeply nested, hard to read, difficult error handling
```

```cpp
// ❌ Problem 2: State Machine Complexity
class AsyncOperation {
    enum State { IDLE, CONNECTING, DOWNLOADING, PARSING, SAVING, DONE };
    State state_ = IDLE;
    Data data_;

public:
    void step() {
        switch (state_) {
            case IDLE:
                start_connection();
                state_ = CONNECTING;
                break;
            case CONNECTING:
                if (connection_ready()) {
                    start_download();
                    state_ = DOWNLOADING;
                }
                break;
            // ... many more states
        }
    }
};
// Manual state management, error-prone
```

**The C++20 Coroutine Solution:**

```cpp
// ✅ C++20: Linear, readable async code
Task<Data> download_file(const std::string& url) {
    auto result = co_await http_get(url);          // Suspends here
    auto parsed = co_await parse_data(result);     // Suspends here
    auto saved = co_await save_to_disk(parsed);    // Suspends here
    co_return parsed;                              // Returns result
}
// Looks like synchronous code, but non-blocking!
```

**Benefits:**
- **Linear flow**: Code reads top-to-bottom
- **Automatic state management**: Compiler handles state transitions
- **Easy error handling**: Use try/catch naturally
- **No callback hell**: Flat structure
- **Composable**: Coroutines can call other coroutines

---

#### 2. Coroutine Fundamentals - The Three Keywords

C++20 introduces three new keywords that make a function a coroutine:

**The Three Coroutine Keywords:**

| Keyword | Purpose | Effect |
|---------|---------|--------|
| `co_await` | Suspend and wait for result | Pauses coroutine until awaitable completes |
| `co_yield` | Produce value and suspend | Returns value to caller, can resume later |
| `co_return` | Return final value and finish | Terminates coroutine, returns final result |

**What Makes a Function a Coroutine:**

```cpp
// Regular function
int regular_function() {
    return 42;
}

// Coroutine (has co_return)
Task<int> coroutine1() {
    co_return 42;
}

// Generator coroutine (has co_yield)
Generator<int> coroutine2() {
    co_yield 1;
    co_yield 2;
    co_yield 3;
}

// Async coroutine (has co_await)
Task<int> coroutine3() {
    auto result = co_await async_operation();
    co_return result;
}
```

**Key Insight:** If a function body contains **any** of `co_await`, `co_yield`, or `co_return`, it's a coroutine.

---

#### 3. Coroutine Mechanics - How They Work Under the Hood

**Coroutine Lifecycle:**

```
┌──────────────────────────────────────────────────────────────┐
│ 1. INVOCATION                                                │
│    - Caller calls coroutine function                         │
│    - Compiler allocates coroutine frame (on heap usually)    │
│    - Coroutine frame stores: locals, parameters, state       │
└─────────────────────────┬────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────────┐
│ 2. INITIAL SUSPENSION                                        │
│    - Promise object created (promise_type)                   │
│    - initial_suspend() called                                │
│    - Can suspend immediately or start running                │
└─────────────────────────┬────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────────┐
│ 3. EXECUTION & SUSPENSION POINTS                             │
│    - Coroutine runs until co_await / co_yield / co_return    │
│    - At suspension: saves state, returns control to caller   │
│    - Can be resumed later via coroutine_handle              │
└─────────────────────────┬────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────────┐
│ 4. FINAL SUSPENSION                                          │
│    - final_suspend() called                                  │
│    - Can keep frame alive or destroy it                      │
└─────────────────────────┬────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────────┐
│ 5. DESTRUCTION                                               │
│    - Coroutine frame deallocated                             │
│    - Local variables destroyed                               │
│    - Promise object destroyed                                │
└──────────────────────────────────────────────────────────────┘
```

**Coroutine Frame:**

When you call a coroutine, the compiler creates a **coroutine frame** (similar to stack frame, but heap-allocated):

```cpp
struct CoroutineFrame {
    void* resume_point;         // Where to resume (instruction pointer)
    void* destroy_point;        // Cleanup routine
    promise_type promise;       // Promise object
    Parameters params;          // Function parameters (copied)
    LocalVariables locals;      // Local variables
    TemporaryValues temps;      // Temporary values
};
```

**Example:**

```cpp
Task<int> compute(int x) {
    int y = 10;                  // Local variable
    auto result = co_await async_add(x, y);  // Suspension point
    co_return result * 2;
}

// Compiler transforms this roughly to:
struct compute_CoroutineFrame {
    void* resume_point;
    Task<int>::promise_type promise;
    int x;                       // Parameter
    int y;                       // Local variable
    int result;                  // Temporary across suspension
};
```

---

#### 4. Promise Types - Customizing Coroutine Behavior

**What is a Promise Type?**

The **promise type** is a class that customizes how a coroutine behaves. It controls:
- What happens at coroutine start (`initial_suspend`)
- What happens at coroutine end (`final_suspend`)
- How return values are handled (`return_value` / `return_void`)
- How exceptions are handled (`unhandled_exception`)
- What the coroutine returns to the caller (`get_return_object`)

**Promise Type Requirements:**

```cpp
struct promise_type {
    // Required: Create the return object
    ReturnType get_return_object();

    // Required: Initial suspension behavior
    std::suspend_always initial_suspend();  // or suspend_never

    // Required: Final suspension behavior
    std::suspend_always final_suspend() noexcept;

    // Required: Handle completion (choose one)
    void return_void();              // For coroutines that don't return values
    // OR
    void return_value(T value);      // For coroutines that return values

    // Required: Handle uncaught exceptions
    void unhandled_exception();

    // Optional: Handle co_yield
    std::suspend_always yield_value(T value);
};
```

**Finding the Promise Type:**

The compiler looks for `promise_type` in the return type:

```cpp
// If coroutine returns Task<int>:
Task<int> my_coroutine() {
    co_return 42;
}

// Compiler looks for:
typename Task<int>::promise_type

// So Task<T> must define:
template<typename T>
struct Task {
    struct promise_type {
        // ... promise interface
    };
};
```

**Example: Simple Task Promise:**

```cpp
template<typename T>
struct Task {
    struct promise_type {
        T value_;
        std::exception_ptr exception_;

        Task get_return_object() {
            return Task{std::coroutine_handle<promise_type>::from_promise(*this)};
        }

        std::suspend_always initial_suspend() { return {}; }  // Start suspended
        std::suspend_always final_suspend() noexcept { return {}; }  // Stay suspended at end

        void return_value(T val) {
            value_ = std::move(val);
        }

        void unhandled_exception() {
            exception_ = std::current_exception();
        }
    };

    std::coroutine_handle<promise_type> handle_;

    T get() {
        handle_.resume();  // Resume coroutine to completion
        if (handle_.promise().exception_)
            std::rethrow_exception(handle_.promise().exception_);
        return std::move(handle_.promise().value_);
    }
};
```

---

#### 5. Awaitables and co_await - Suspension Points

**What is an Awaitable?**

An awaitable is any type that can be used with `co_await`. It controls:
- Whether to suspend (`await_ready()`)
- What to do when suspending (`await_suspend()`)
- What value to produce when resuming (`await_resume()`)

**Awaitable Interface:**

```cpp
struct MyAwaitable {
    // Called first: Should we suspend?
    bool await_ready() const noexcept {
        return false;  // true = don't suspend, false = suspend
    }

    // Called if suspending: What to do when suspended?
    void await_suspend(std::coroutine_handle<> handle) {
        // Schedule resumption (e.g., on thread pool, after I/O, etc.)
        // Option 1: Return void (always suspend)
        // Option 2: Return bool (true = suspend, false = resume immediately)
        // Option 3: Return another coroutine_handle (symmetric transfer)
    }

    // Called when resumed: What value to produce?
    T await_resume() const noexcept {
        return result_;  // This is the value of the co_await expression
    }
};

// Usage:
Task<int> example() {
    int value = co_await MyAwaitable{};  // value = await_resume()'s return
}
```

**Standard Awaitables:**

```cpp
// std::suspend_always: Always suspends
struct suspend_always {
    bool await_ready() const noexcept { return false; }  // Always suspend
    void await_suspend(std::coroutine_handle<>) const noexcept {}
    void await_resume() const noexcept {}
};

// std::suspend_never: Never suspends
struct suspend_never {
    bool await_ready() const noexcept { return true; }  // Never suspend
    void await_suspend(std::coroutine_handle<>) const noexcept {}
    void await_resume() const noexcept {}
};
```

**Example: Timer Awaitable:**

```cpp
struct TimerAwaitable {
    std::chrono::milliseconds duration_;

    bool await_ready() const noexcept {
        return duration_.count() == 0;  // Don't suspend if duration is 0
    }

    void await_suspend(std::coroutine_handle<> handle) {
        // Schedule resumption after duration
        std::thread([handle, dur = duration_]() {
            std::this_thread::sleep_for(dur);
            handle.resume();  // Resume the coroutine
        }).detach();
    }

    void await_resume() const noexcept {}
};

// Usage:
Task<void> delayed_task() {
    std::cout << "Starting\n";
    co_await TimerAwaitable{std::chrono::seconds(2)};  // Suspend for 2 seconds
    std::cout << "Resumed after 2 seconds\n";
}
```

---

#### 6. Generators with co_yield - Producing Sequences

**Generator Pattern:**

A generator is a coroutine that produces a sequence of values lazily using `co_yield`.

**Simple Generator Implementation:**

```cpp
template<typename T>
struct Generator {
    struct promise_type {
        T current_value_;

        Generator get_return_object() {
            return Generator{std::coroutine_handle<promise_type>::from_promise(*this)};
        }

        std::suspend_always initial_suspend() { return {}; }
        std::suspend_always final_suspend() noexcept { return {}; }

        std::suspend_always yield_value(T value) {
            current_value_ = std::move(value);
            return {};  // Suspend after storing value
        }

        void return_void() {}  // Generators don't return values

        void unhandled_exception() {
            std::terminate();
        }
    };

    std::coroutine_handle<promise_type> handle_;

    Generator(std::coroutine_handle<promise_type> h) : handle_(h) {}
    ~Generator() { if (handle_) handle_.destroy(); }

    // Iterator interface for range-based for
    struct iterator {
        std::coroutine_handle<promise_type> handle_;

        iterator& operator++() {
            handle_.resume();
            if (handle_.done()) handle_ = nullptr;
            return *this;
        }

        T operator*() const {
            return handle_.promise().current_value_;
        }

        bool operator==(const iterator& other) const {
            return handle_ == other.handle_;
        }
    };

    iterator begin() {
        handle_.resume();  // Start the generator
        if (handle_.done()) return {nullptr};
        return {handle_};
    }

    iterator end() {
        return {nullptr};
    }
};

// Usage:
Generator<int> fibonacci() {
    int a = 0, b = 1;
    while (true) {
        co_yield a;
        int next = a + b;
        a = b;
        b = next;
    }
}

int main() {
    int count = 0;
    for (int fib : fibonacci()) {
        std::cout << fib << " ";
        if (++count == 10) break;
    }
    // Output: 0 1 1 2 3 5 8 13 21 34
}
```

**How co_yield Works:**

```cpp
Generator<int> numbers() {
    co_yield 1;  // Suspend here, return 1 to caller
    co_yield 2;  // Resume here, suspend again, return 2
    co_yield 3;  // Resume here, suspend again, return 3
}

// Execution flow:
auto gen = numbers();           // Creates coroutine, suspends at initial_suspend
auto it = gen.begin();          // Resumes, runs to first co_yield
std::cout << *it;               // 1 (from yield_value)
++it;                           // Resumes, runs to second co_yield
std::cout << *it;               // 2
++it;                           // Resumes, runs to third co_yield
std::cout << *it;               // 3
++it;                           // Resumes, reaches end
// it == gen.end() (done)
```

---

#### 7. Coroutine Handles - Manual Control

**What is a Coroutine Handle?**

`std::coroutine_handle<PromiseType>` is a low-level handle to a suspended coroutine that allows you to:
- Resume the coroutine (`handle.resume()`)
- Check if it's done (`handle.done()`)
- Destroy the coroutine (`handle.destroy()`)
- Access the promise (`handle.promise()`)

**Coroutine Handle Interface:**

```cpp
template<typename Promise = void>
struct coroutine_handle {
    // Create from promise
    static coroutine_handle from_promise(Promise& promise);

    // Resume execution
    void resume();

    // Check if coroutine finished
    bool done() const;

    // Destroy coroutine frame
    void destroy();

    // Access promise
    Promise& promise() const;  // Only for coroutine_handle<Promise>

    // Conversion to bool
    explicit operator bool() const;
};
```

**Example: Manual Coroutine Control:**

```cpp
Task<int> async_computation() {
    std::cout << "Step 1\n";
    co_await std::suspend_always{};

    std::cout << "Step 2\n";
    co_await std::suspend_always{};

    std::cout << "Step 3\n";
    co_return 42;
}

int main() {
    auto task = async_computation();
    auto handle = task.get_handle();

    std::cout << "Starting\n";
    handle.resume();  // Prints "Step 1", then suspends
    std::cout << "After first resume\n";

    handle.resume();  // Prints "Step 2", then suspends
    std::cout << "After second resume\n";

    handle.resume();  // Prints "Step 3", completes
    std::cout << "After third resume\n";

    if (handle.done()) {
        std::cout << "Coroutine finished\n";
    }

    handle.destroy();  // Clean up
}

/* Output:
Starting
Step 1
After first resume
Step 2
After second resume
Step 3
After third resume
Coroutine finished
*/
```

---

#### 8. Symmetric Transfer - Zero-Overhead Coroutine Chains

**The Problem: Stack Overflow in Coroutine Chains:**

```cpp
Task<int> recursive_task(int n) {
    if (n == 0) co_return 1;
    auto result = co_await recursive_task(n - 1);  // Potential stack overflow!
    co_return result + 1;
}

// Calling recursive_task(10000) can overflow the stack
```

**The Solution: Symmetric Transfer:**

By returning a `coroutine_handle` from `await_suspend`, you can **transfer control directly** to another coroutine without growing the stack:

```cpp
struct TaskAwaitable {
    std::coroutine_handle<> next_handle_;

    bool await_ready() const noexcept { return false; }

    // Return coroutine_handle for symmetric transfer
    std::coroutine_handle<> await_suspend(std::coroutine_handle<> current) noexcept {
        return next_handle_;  // Transfer directly to next coroutine
    }

    int await_resume() const noexcept { return 0; }
};

// Now recursive_task won't overflow
```

**Key Benefit:** Allows arbitrary-depth coroutine chains without stack growth (tail-call optimization for coroutines).

---

#### 9. Exception Handling in Coroutines

**Exceptions in Coroutines:**

```cpp
Task<int> may_throw() {
    if (some_condition) {
        throw std::runtime_error("Error!");
    }
    co_return 42;
}

Task<int> caller() {
    try {
        int result = co_await may_throw();
        co_return result;
    } catch (const std::exception& e) {
        std::cout << "Caught: " << e.what() << '\n';
        co_return -1;
    }
}
```

**How It Works:**

1. If exception is thrown in coroutine body:
   - `promise.unhandled_exception()` is called
   - Promise can store the exception: `exception_ = std::current_exception();`

2. When coroutine is resumed or result is retrieved:
   - Check if exception exists: `if (promise.exception_) std::rethrow_exception(promise.exception_);`

**Promise Implementation:**

```cpp
struct promise_type {
    std::exception_ptr exception_;

    void unhandled_exception() {
        exception_ = std::current_exception();
    }

    T get_result() {
        if (exception_)
            std::rethrow_exception(exception_);
        return value_;
    }
};
```

---

#### 10. Coroutine Memory Management

**Heap Allocation:**

By default, coroutines allocate their frame on the **heap**:

```cpp
Task<int> my_coroutine() {
    // Coroutine frame allocated on heap
    co_return 42;
}
```

**Elision Optimization:**

The compiler can elide heap allocation if:
- The coroutine's lifetime is nested within the caller
- The size of the frame is known at compile time

```cpp
Task<int> inner() { co_return 42; }

void outer() {
    auto task = inner();
    auto result = task.get();  // May elide heap allocation
}
```

**Custom Allocation:**

You can provide custom `operator new` and `operator delete` in the promise:

```cpp
struct promise_type {
    void* operator new(std::size_t size) {
        std::cout << "Allocating " << size << " bytes\n";
        return ::operator new(size);
    }

    void operator delete(void* ptr) {
        std::cout << "Deallocating\n";
        ::operator delete(ptr);
    }

    // ... rest of promise interface
};
```

**HALO Optimization (Heap Allocation eLision Optimization):**

Modern compilers can often eliminate heap allocation entirely for short-lived coroutines.

---

### EDGE_CASES: Coroutine Pitfalls and Tricky Scenarios

---

#### Edge Case 1: Dangling References in Coroutines

**The Problem:**

```cpp
Task<void> process(const std::string& data) {
    co_await std::suspend_always{};
    std::cout << data << '\n';  // ❌ DANGER: `data` may be dangling!
}

void caller() {
    std::string temp = "temporary";
    auto task = process(temp);  // `temp` is captured by reference
    // temp is destroyed here
    task.resume();  // ❌ UB: `data` in coroutine refers to destroyed object
}
```

**Why It Happens:**
Coroutine parameters are stored in the coroutine frame. If they're references, they can dangle when the referenced object is destroyed before the coroutine completes.

**Solution:**

```cpp
// ✅ Pass by value
Task<void> process(std::string data) {
    co_await std::suspend_always{};
    std::cout << data << '\n';  // Safe: `data` is copied into frame
}
```

---

#### Edge Case 2: Forgetting to Resume/Destroy

**The Problem:**

```cpp
Task<int> leak_coroutine() {
    co_return 42;
}

int main() {
    auto task = leak_coroutine();
    // ❌ Never resumed or destroyed - memory leak!
}
```

**Why It Happens:**
Creating a coroutine allocates a frame. If you never resume it to completion or explicitly destroy it, the frame leaks.

**Solution:**

```cpp
// ✅ RAII wrapper ensures cleanup
struct Task {
    std::coroutine_handle<promise_type> handle_;

    ~Task() {
        if (handle_) handle_.destroy();  // Automatic cleanup
    }

    Task(Task&& other) : handle_(std::exchange(other.handle_, {})) {}
    Task& operator=(Task&& other) {
        if (handle_) handle_.destroy();
        handle_ = std::exchange(other.handle_, {});
        return *this;
    }

    // Delete copy
    Task(const Task&) = delete;
    Task& operator=(const Task&) = delete;
};
```

---

#### Edge Case 3: co_await in Catch Block

**The Problem:**

```cpp
Task<void> example() {
    try {
        // some code
    } catch (...) {
        co_await cleanup();  // ❌ Compiler error in C++20!
    }
}
```

**Why It Fails:**
C++20 doesn't allow `co_await` in catch blocks due to implementation complexity.

**Solution:**

```cpp
// ✅ Workaround: Flag the error, handle outside try block
Task<void> example() {
    bool error_occurred = false;
    try {
        // some code
    } catch (...) {
        error_occurred = true;
    }

    if (error_occurred) {
        co_await cleanup();
    }
}
```

---

#### Edge Case 4: Returning Coroutine Type with Deduced Return Type

**The Problem:**

```cpp
// ❌ Compiler error: can't deduce coroutine return type
auto my_coroutine() {
    co_return 42;
}
```

**Why It Fails:**
The compiler needs to know the promise type before parsing the coroutine body, but `auto` requires parsing the body first (chicken-and-egg problem).

**Solution:**

```cpp
// ✅ Explicit return type
Task<int> my_coroutine() {
    co_return 42;
}
```

---

#### Edge Case 5: Coroutine Constructors/Destructors

**The Problem:**

```cpp
struct MyClass {
    MyClass() {
        co_return;  // ❌ Compiler error: constructors can't be coroutines
    }

    ~MyClass() {
        co_return;  // ❌ Compiler error: destructors can't be coroutines
    }
};
```

**Why It Fails:**
Constructors and destructors have special semantics (object initialization/cleanup) that conflict with coroutine suspension.

**Workaround:**

```cpp
struct MyClass {
    Task<void> init() {  // ✅ Separate init coroutine
        // async initialization
        co_return;
    }
};
```

---

#### Edge Case 6: co_yield in Functions Returning Non-Generator Types

**The Problem:**

```cpp
Task<int> broken() {
    co_yield 1;  // ❌ Task doesn't support co_yield!
}
```

**Why It Fails:**
`co_yield` requires the promise type to have a `yield_value()` method. If the return type's promise doesn't provide it, compilation fails.

**Solution:**

```cpp
// ✅ Use Generator type that supports co_yield
Generator<int> working() {
    co_yield 1;
    co_yield 2;
}
```

---

#### Edge Case 7: Mixing co_return Value and co_return Void

**The Problem:**

```cpp
Task<int> inconsistent() {
    if (condition) {
        co_return 42;  // return_value(int)
    } else {
        co_return;     // return_void()
    }
}
// ❌ Promise must provide either return_value OR return_void, not both
```

**Solution:**

```cpp
// ✅ Always return a value
Task<int> consistent() {
    if (condition) {
        co_return 42;
    } else {
        co_return 0;  // Explicit default value
    }
}
```

---

### CODE_EXAMPLES: Practical Coroutine Implementations

---

#### Example 1: Async Task with Result

```cpp
#include <coroutine>
#include <iostream>
#include <exception>
#include <thread>

template<typename T>
struct Task {
    struct promise_type {
        T value_;
        std::exception_ptr exception_;

        Task get_return_object() {
            return Task{std::coroutine_handle<promise_type>::from_promise(*this)};
        }

        std::suspend_always initial_suspend() { return {}; }
        std::suspend_always final_suspend() noexcept { return {}; }

        void return_value(T val) {
            value_ = std::move(val);
        }

        void unhandled_exception() {
            exception_ = std::current_exception();
        }
    };

    std::coroutine_handle<promise_type> handle_;

    Task(std::coroutine_handle<promise_type> h) : handle_(h) {}
    ~Task() { if (handle_) handle_.destroy(); }

    Task(Task&& other) : handle_(std::exchange(other.handle_, {})) {}

    T get() {
        if (!handle_.done()) {
            handle_.resume();
        }

        if (handle_.promise().exception_) {
            std::rethrow_exception(handle_.promise().exception_);
        }

        return std::move(handle_.promise().value_);
    }
};

// Usage
Task<int> compute_async() {
    std::cout << "Computing...\n";
    co_return 42;
}

int main() {
    auto task = compute_async();
    int result = task.get();
    std::cout << "Result: " << result << '\n';
}
```

---

#### Example 2: Generator for Infinite Sequences

```cpp
#include <coroutine>
#include <iostream>

template<typename T>
struct Generator {
    struct promise_type {
        T current_value_;
        std::exception_ptr exception_;

        Generator get_return_object() {
            return Generator{std::coroutine_handle<promise_type>::from_promise(*this)};
        }

        std::suspend_always initial_suspend() { return {}; }
        std::suspend_always final_suspend() noexcept { return {}; }

        std::suspend_always yield_value(T value) {
            current_value_ = std::move(value);
            return {};
        }

        void return_void() {}

        void unhandled_exception() {
            exception_ = std::current_exception();
        }
    };

    std::coroutine_handle<promise_type> handle_;

    Generator(std::coroutine_handle<promise_type> h) : handle_(h) {}
    ~Generator() { if (handle_) handle_.destroy(); }

    Generator(Generator&& other) : handle_(std::exchange(other.handle_, {})) {}

    struct iterator {
        std::coroutine_handle<promise_type> handle_;

        iterator& operator++() {
            handle_.resume();
            if (handle_.done()) handle_ = nullptr;
            return *this;
        }

        T operator*() const {
            return handle_.promise().current_value_;
        }

        bool operator!=(const iterator& other) const {
            return handle_ != other.handle_;
        }
    };

    iterator begin() {
        handle_.resume();
        if (handle_.done()) return {nullptr};
        return {handle_};
    }

    iterator end() {
        return {nullptr};
    }
};

// Generate Fibonacci sequence
Generator<int> fibonacci() {
    int a = 0, b = 1;
    while (true) {
        co_yield a;
        int next = a + b;
        a = b;
        b = next;
    }
}

int main() {
    int count = 0;
    for (int fib : fibonacci()) {
        std::cout << fib << " ";
        if (++count == 15) break;
    }
    std::cout << '\n';
}

/* Output:
0 1 1 2 3 5 8 13 21 34 55 89 144 233 377
*/
```

---

#### Example 3: Async Timer

```cpp
#include <coroutine>
#include <iostream>
#include <thread>
#include <chrono>

template<typename T>
struct Task {
    // ... same as Example 1
};

struct TimerAwaitable {
    std::chrono::milliseconds duration_;

    bool await_ready() const noexcept {
        return duration_.count() == 0;
    }

    void await_suspend(std::coroutine_handle<> handle) {
        std::thread([handle, dur = duration_]() {
            std::this_thread::sleep_for(dur);
            handle.resume();
        }).detach();
    }

    void await_resume() const noexcept {}
};

Task<void> delayed_message() {
    using namespace std::chrono_literals;

    std::cout << "Starting...\n";
    co_await TimerAwaitable{1000ms};
    std::cout << "After 1 second\n";
    co_await TimerAwaitable{1000ms};
    std::cout << "After 2 seconds\n";
    co_await TimerAwaitable{1000ms};
    std::cout << "After 3 seconds\n";
}

int main() {
    auto task = delayed_message();
    task.get();
}

/* Output:
Starting...
(1 second pause)
After 1 second
(1 second pause)
After 2 seconds
(1 second pause)
After 3 seconds
*/
```

---

#### Example 4: Lazy Sequence Processing

```cpp
#include <coroutine>
#include <iostream>
#include <vector>

template<typename T>
struct Generator {
    // ... same as Example 2
};

// Lazy filter
Generator<int> filter(Generator<int> gen, auto pred) {
    for (int val : gen) {
        if (pred(val)) {
            co_yield val;
        }
    }
}

// Lazy map
Generator<int> map(Generator<int> gen, auto func) {
    for (int val : gen) {
        co_yield func(val);
    }
}

// Lazy take
Generator<int> take(Generator<int> gen, int n) {
    int count = 0;
    for (int val : gen) {
        if (count++ >= n) break;
        co_yield val;
    }
}

// Generate natural numbers
Generator<int> naturals() {
    int n = 1;
    while (true) {
        co_yield n++;
    }
}

int main() {
    // Pipeline: naturals → filter evens → map (square) → take 5
    auto pipeline = take(
        map(
            filter(naturals(), [](int n) { return n % 2 == 0; }),
            [](int n) { return n * n; }
        ),
        5
    );

    for (int val : pipeline) {
        std::cout << val << " ";
    }
    std::cout << '\n';
}

/* Output:
4 16 36 64 100
*/
```

---

#### Example 5: Coroutine-Based State Machine

```cpp
#include <coroutine>
#include <iostream>
#include <string>

enum class State { START, PROCESSING, WAITING, DONE };

struct StateMachine {
    struct promise_type {
        State current_state_ = State::START;

        StateMachine get_return_object() {
            return StateMachine{std::coroutine_handle<promise_type>::from_promise(*this)};
        }

        std::suspend_always initial_suspend() { return {}; }
        std::suspend_always final_suspend() noexcept { return {}; }

        std::suspend_always yield_value(State state) {
            current_state_ = state;
            return {};
        }

        void return_void() {}
        void unhandled_exception() {}
    };

    std::coroutine_handle<promise_type> handle_;

    StateMachine(std::coroutine_handle<promise_type> h) : handle_(h) {}
    ~StateMachine() { if (handle_) handle_.destroy(); }

    State step() {
        if (!handle_.done()) {
            handle_.resume();
        }
        return handle_.promise().current_state_;
    }

    bool done() const {
        return handle_.done();
    }
};

StateMachine workflow() {
    std::cout << "Starting workflow\n";
    co_yield State::START;

    std::cout << "Processing data\n";
    co_yield State::PROCESSING;

    std::cout << "Waiting for input\n";
    co_yield State::WAITING;

    std::cout << "Workflow complete\n";
    co_yield State::DONE;
}

int main() {
    auto machine = workflow();

    while (!machine.done()) {
        State state = machine.step();

        switch (state) {
            case State::START:
                std::cout << "State: START\n";
                break;
            case State::PROCESSING:
                std::cout << "State: PROCESSING\n";
                break;
            case State::WAITING:
                std::cout << "State: WAITING\n";
                break;
            case State::DONE:
                std::cout << "State: DONE\n";
                break;
        }
    }
}

/* Output:
Starting workflow
State: START
Processing data
State: PROCESSING
Waiting for input
State: WAITING
Workflow complete
State: DONE
*/
```

---

#### Example 6: Recursive Coroutine (with Symmetric Transfer)

```cpp
#include <coroutine>
#include <iostream>

template<typename T>
struct Task {
    struct promise_type {
        T value_;

        Task get_return_object() {
            return Task{std::coroutine_handle<promise_type>::from_promise(*this)};
        }

        std::suspend_always initial_suspend() { return {}; }
        std::suspend_always final_suspend() noexcept { return {}; }

        void return_value(T val) {
            value_ = std::move(val);
        }

        void unhandled_exception() {}
    };

    std::coroutine_handle<promise_type> handle_;

    struct awaitable {
        std::coroutine_handle<promise_type> next_;

        bool await_ready() const noexcept { return false; }

        std::coroutine_handle<> await_suspend(std::coroutine_handle<> current) noexcept {
            return next_;  // Symmetric transfer
        }

        T await_resume() const noexcept {
            return next_.promise().value_;
        }
    };

    awaitable operator co_await() {
        return awaitable{handle_};
    }

    T get() {
        handle_.resume();
        return handle_.promise().value_;
    }
};

Task<int> factorial(int n) {
    if (n <= 1) {
        co_return 1;
    }

    int prev = co_await factorial(n - 1);  // Symmetric transfer prevents stack overflow
    co_return n * prev;
}

int main() {
    auto task = factorial(10);
    std::cout << "10! = " << task.get() << '\n';
}

/* Output:
10! = 3628800
*/
```

---

#### Example 7: Cooperative Multitasking Scheduler

```cpp
#include <coroutine>
#include <iostream>
#include <queue>
#include <memory>

class Scheduler {
    std::queue<std::coroutine_handle<>> ready_queue_;

public:
    void schedule(std::coroutine_handle<> handle) {
        ready_queue_.push(handle);
    }

    void run() {
        while (!ready_queue_.empty()) {
            auto handle = ready_queue_.front();
            ready_queue_.pop();

            handle.resume();

            if (!handle.done()) {
                ready_queue_.push(handle);  // Re-queue if not done
            }
        }
    }
};

inline Scheduler scheduler;

struct YieldAwaitable {
    bool await_ready() const noexcept { return false; }

    void await_suspend(std::coroutine_handle<> handle) {
        scheduler.schedule(handle);  // Re-schedule this coroutine
    }

    void await_resume() const noexcept {}
};

template<typename T>
struct Task {
    struct promise_type {
        T value_;

        Task get_return_object() {
            return Task{std::coroutine_handle<promise_type>::from_promise(*this)};
        }

        std::suspend_never initial_suspend() { return {}; }  // Start immediately
        std::suspend_always final_suspend() noexcept { return {}; }

        void return_value(T val) {
            value_ = std::move(val);
        }

        void unhandled_exception() {}
    };

    std::coroutine_handle<promise_type> handle_;
};

Task<int> worker(int id) {
    for (int i = 0; i < 3; ++i) {
        std::cout << "Worker " << id << " - iteration " << i << '\n';
        co_await YieldAwaitable{};  // Yield to other tasks
    }
    co_return id;
}

int main() {
    auto task1 = worker(1);
    auto task2 = worker(2);
    auto task3 = worker(3);

    scheduler.run();
}

/* Output:
Worker 1 - iteration 0
Worker 2 - iteration 0
Worker 3 - iteration 0
Worker 1 - iteration 1
Worker 2 - iteration 1
Worker 3 - iteration 1
Worker 1 - iteration 2
Worker 2 - iteration 2
Worker 3 - iteration 2
*/
```

---

#### Example 8: Async File Reader

```cpp
#include <coroutine>
#include <iostream>
#include <fstream>
#include <string>
#include <thread>

template<typename T>
struct Task {
    // ... (same as previous examples)
};

struct FileReadAwaitable {
    std::string filename_;
    std::string result_;

    bool await_ready() const noexcept { return false; }

    void await_suspend(std::coroutine_handle<> handle) {
        std::thread([this, handle]() {
            std::ifstream file(filename_);
            if (file.is_open()) {
                std::string line;
                while (std::getline(file, line)) {
                    result_ += line + "\n";
                }
            }
            handle.resume();
        }).detach();
    }

    std::string await_resume() const noexcept {
        return result_;
    }
};

Task<void> process_file(const std::string& filename) {
    std::cout << "Reading file: " << filename << '\n';

    auto content = co_await FileReadAwaitable{filename};

    std::cout << "File content (" << content.size() << " bytes):\n";
    std::cout << content << '\n';
}

int main() {
    auto task = process_file("example.txt");
    task.get();
}
```

---

#### Example 9: Generator with Transformation

```cpp
#include <coroutine>
#include <iostream>
#include <vector>

template<typename T>
struct Generator {
    // ... (same as Example 2)
};

// Generate squares
Generator<int> squares(int max) {
    for (int i = 1; i <= max; ++i) {
        co_yield i * i;
    }
}

// Generate cubes
Generator<int> cubes(int max) {
    for (int i = 1; i <= max; ++i) {
        co_yield i * i * i;
    }
}

// Interleave two generators
Generator<int> interleave(Generator<int> g1, Generator<int> g2) {
    auto it1 = g1.begin();
    auto it2 = g2.begin();
    auto end1 = g1.end();
    auto end2 = g2.end();

    while (it1 != end1 || it2 != end2) {
        if (it1 != end1) {
            co_yield *it1;
            ++it1;
        }
        if (it2 != end2) {
            co_yield *it2;
            ++it2;
        }
    }
}

int main() {
    auto combined = interleave(squares(5), cubes(5));

    for (int val : combined) {
        std::cout << val << " ";
    }
    std::cout << '\n';
}

/* Output:
1 1 4 8 9 27 16 64 25 125
(squares: 1, 4, 9, 16, 25)
(cubes: 1, 8, 27, 64, 125)
*/
```

---

#### Example 10: Coroutine-Based Event Loop

```cpp
#include <coroutine>
#include <iostream>
#include <queue>
#include <chrono>
#include <thread>

class EventLoop {
    struct TimedTask {
        std::coroutine_handle<> handle;
        std::chrono::steady_clock::time_point wake_time;

        bool operator<(const TimedTask& other) const {
            return wake_time > other.wake_time;  // Min-heap
        }
    };

    std::priority_queue<TimedTask> timers_;

public:
    void schedule_after(std::coroutine_handle<> handle, std::chrono::milliseconds delay) {
        auto wake_time = std::chrono::steady_clock::now() + delay;
        timers_.push({handle, wake_time});
    }

    void run() {
        while (!timers_.empty()) {
            auto task = timers_.top();
            timers_.pop();

            auto now = std::chrono::steady_clock::now();
            if (task.wake_time > now) {
                std::this_thread::sleep_for(task.wake_time - now);
            }

            task.handle.resume();

            if (!task.handle.done()) {
                // Could re-schedule if needed
            }
        }
    }
};

inline EventLoop event_loop;

struct SleepAwaitable {
    std::chrono::milliseconds duration_;

    bool await_ready() const noexcept { return false; }

    void await_suspend(std::coroutine_handle<> handle) {
        event_loop.schedule_after(handle, duration_);
    }

    void await_resume() const noexcept {}
};

template<typename T>
struct Task {
    // ... (same promise_type as before)
};

Task<void> task1() {
    using namespace std::chrono_literals;

    std::cout << "Task 1: Start\n";
    co_await SleepAwaitable{500ms};
    std::cout << "Task 1: After 500ms\n";
    co_await SleepAwaitable{500ms};
    std::cout << "Task 1: Done\n";
}

Task<void> task2() {
    using namespace std::chrono_literals;

    std::cout << "Task 2: Start\n";
    co_await SleepAwaitable{300ms};
    std::cout << "Task 2: After 300ms\n";
    co_await SleepAwaitable{700ms};
    std::cout << "Task 2: Done\n";
}

int main() {
    auto t1 = task1();
    auto t2 = task2();

    event_loop.run();
}

/* Output (with timestamps):
Task 1: Start
Task 2: Start
(300ms)
Task 2: After 300ms
(200ms)
Task 1: After 500ms
(500ms)
Task 1: Done
(200ms)
Task 2: Done
*/
```

---

### INTERVIEW_QA: Comprehensive Coroutine Questions

---

#### Q1: What makes a function a coroutine in C++20?

**Answer:**

A function becomes a coroutine if its body contains **any** of these three keywords:
1. `co_await` - Suspend and wait for an awaitable
2. `co_yield` - Produce a value and suspend
3. `co_return` - Return a value and complete

**Key Point:** It's not the return type that makes it a coroutine, but the presence of these keywords in the function body.

```cpp
// Regular function
int regular() {
    return 42;
}

// Coroutine (has co_return)
Task<int> coro1() {
    co_return 42;  // This makes it a coroutine
}

// Coroutine (has co_yield)
Generator<int> coro2() {
    co_yield 1;  // This makes it a coroutine
}

// Coroutine (has co_await)
Task<int> coro3() {
    co_await something();  // This makes it a coroutine
    return 42;  // Regular return is also valid after co_await
}
```

**What the Compiler Does:**

When it sees a coroutine keyword:
1. Allocates a coroutine frame (heap memory)
2. Copies parameters and local variables to the frame
3. Creates a promise object based on the return type's `promise_type`
4. Transforms the function body into a state machine

---

#### Q2: Explain the purpose of the promise type in coroutines.

**Answer:**

The **promise type** is a customization point that controls the behavior of a coroutine throughout its lifetime.

**Required Methods:**

```cpp
struct promise_type {
    // 1. Create the return object (what the caller gets)
    ReturnType get_return_object();

    // 2. Initial suspension (suspend before first statement?)
    auto initial_suspend();  // Returns std::suspend_always or suspend_never

    // 3. Final suspension (suspend after last statement?)
    auto final_suspend() noexcept;

    // 4. Handle return value (choose ONE)
    void return_void();          // For coroutines without return value
    void return_value(T value);  // For coroutines with return value

    // 5. Handle exceptions
    void unhandled_exception();
};
```

**What Each Method Controls:**

1. **`get_return_object()`**: Creates the object returned to the caller
   ```cpp
   Task get_return_object() {
       return Task{std::coroutine_handle<promise_type>::from_promise(*this)};
   }
   ```

2. **`initial_suspend()`**: Decides if coroutine starts immediately or suspended
   ```cpp
   std::suspend_always initial_suspend() { return {}; }  // Start suspended
   std::suspend_never initial_suspend() { return {}; }   // Start immediately
   ```

3. **`final_suspend()`**: Decides if coroutine stays alive after completion
   ```cpp
   std::suspend_always final_suspend() noexcept { return {}; }  // Keep frame alive
   std::suspend_never final_suspend() noexcept { return {}; }   // Destroy immediately
   ```

4. **`return_value()` / `return_void()`**: Stores the result
   ```cpp
   void return_value(int value) {
       result_ = value;  // Store for later retrieval
   }
   ```

5. **`unhandled_exception()`**: Captures exceptions
   ```cpp
   void unhandled_exception() {
       exception_ = std::current_exception();  // Store for re-throwing
   }
   ```

**How the Compiler Finds It:**

For a coroutine returning `Task<T>`, the compiler looks for:
```cpp
typename Task<T>::promise_type
```

---

#### Q3: What is the difference between co_yield and co_return?

**Answer:**

| Feature | `co_yield` | `co_return` |
|---------|-----------|-------------|
| **Purpose** | Produce value and **suspend** | Produce value and **complete** |
| **Resumes?** | Yes (can continue later) | No (coroutine ends) |
| **Multiple uses** | Yes (in loops) | No (only once, at end) |
| **Promise method** | `yield_value(value)` | `return_value(value)` or `return_void()` |
| **Typical use** | Generators | Async tasks |

**co_yield - Produce and Suspend:**

```cpp
Generator<int> count_to_five() {
    co_yield 1;  // Produce 1, suspend
    co_yield 2;  // Resume, produce 2, suspend
    co_yield 3;  // Resume, produce 3, suspend
    co_yield 4;  // Resume, produce 4, suspend
    co_yield 5;  // Resume, produce 5, suspend
    // Coroutine ends here
}

// Caller can iterate:
for (int n : count_to_five()) {
    std::cout << n << " ";  // 1 2 3 4 5
}
```

**co_return - Complete:**

```cpp
Task<int> compute() {
    int result = expensive_computation();
    co_return result;  // Return result and END coroutine
    // This line never executes
}

// Caller gets the result:
auto task = compute();
int value = task.get();  // Resumes coroutine to completion
```

**Transformation:**

```cpp
// co_yield value; transforms to:
co_await promise.yield_value(value);

// co_return value; transforms to:
promise.return_value(value);
goto final_suspend;
```

---

#### Q4: How does co_await work? What makes something "awaitable"?

**Answer:**

**co_await Mechanism:**

When you write `co_await expr`, the compiler transforms it into a series of calls on the awaitable:

```cpp
auto result = co_await my_awaitable;

// Transforms roughly to:
{
    auto&& awaitable = my_awaitable;

    if (!awaitable.await_ready()) {  // Should we suspend?
        // Suspend coroutine
        awaitable.await_suspend(coroutine_handle);  // What to do when suspended?
        // Coroutine is now suspended, control returns to caller
        // ...
        // Later, someone calls coroutine_handle.resume()
        // Coroutine resumes here
    }

    auto result = awaitable.await_resume();  // Get the result
}
```

**Awaitable Interface:**

An awaitable must provide three methods:

```cpp
struct MyAwaitable {
    // 1. Should we suspend?
    bool await_ready() const noexcept {
        return false;  // true = skip suspension, false = suspend
    }

    // 2. What to do when suspending?
    void await_suspend(std::coroutine_handle<> handle) {
        // Schedule resumption (e.g., on thread pool, after I/O completes)
        // Can also return:
        //   - bool: true = suspend, false = resume immediately
        //   - std::coroutine_handle<>: transfer to another coroutine (symmetric transfer)
    }

    // 3. What value to produce when resumed?
    T await_resume() const noexcept {
        return result_;  // This becomes the value of the co_await expression
    }
};
```

**Execution Flow:**

```cpp
Task<int> example() {
    std::cout << "Before co_await\n";

    int value = co_await MyAwaitable{};  // Suspension point

    std::cout << "After co_await, value = " << value << '\n';
    co_return value;
}

/*
Flow:
1. "Before co_await" is printed
2. await_ready() called → returns false
3. await_suspend() called → coroutine suspends, control returns to caller
4. [Time passes... coroutine is suspended]
5. Someone calls coroutine_handle.resume()
6. Coroutine resumes at suspension point
7. await_resume() called → returns value
8. "After co_await" is printed
*/
```

**Standard Awaitables:**

```cpp
// Always suspends
struct std::suspend_always {
    bool await_ready() const noexcept { return false; }
    void await_suspend(std::coroutine_handle<>) const noexcept {}
    void await_resume() const noexcept {}
};

// Never suspends
struct std::suspend_never {
    bool await_ready() const noexcept { return true; }
    void await_suspend(std::coroutine_handle<>) const noexcept {}
    void await_resume() const noexcept {}
};
```

---

#### Q5: What is a coroutine handle and when would you use it?

**Answer:**

A **coroutine handle** (`std::coroutine_handle<PromiseType>`) is a low-level, non-owning handle to a suspended coroutine.

**Interface:**

```cpp
template<typename Promise = void>
struct coroutine_handle {
    // Create from promise
    static coroutine_handle from_promise(Promise& p);

    // Resume coroutine execution
    void resume();

    // Check if coroutine finished
    bool done() const;

    // Destroy coroutine frame
    void destroy();

    // Access promise (only for coroutine_handle<Promise>)
    Promise& promise() const;

    // Check validity
    explicit operator bool() const;
};
```

**When to Use:**

1. **In Promise Types**: Return handle in `get_return_object()`
   ```cpp
   struct promise_type {
       Task get_return_object() {
           return Task{std::coroutine_handle<promise_type>::from_promise(*this)};
       }
   };
   ```

2. **In Awaitables**: Receive handle in `await_suspend()` to resume later
   ```cpp
   struct MyAwaitable {
       void await_suspend(std::coroutine_handle<> handle) {
           std::thread([handle]() {
               std::this_thread::sleep_for(std::chrono::seconds(1));
               handle.resume();  // Resume after delay
           }).detach();
       }
   };
   ```

3. **Manual Coroutine Control**: Step through coroutine
   ```cpp
   Task<int> my_coro() {
       co_await std::suspend_always{};
       std::cout << "Step 1\n";
       co_await std::suspend_always{};
       std::cout << "Step 2\n";
       co_return 42;
   }

   int main() {
       auto task = my_coro();
       auto handle = task.get_handle();

       handle.resume();  // Prints "Step 1"
       handle.resume();  // Prints "Step 2"

       if (handle.done()) {
           std::cout << "Done\n";
       }
   }
   ```

4. **Symmetric Transfer**: Return handle from `await_suspend()` for zero-overhead tail calls
   ```cpp
   std::coroutine_handle<> await_suspend(std::coroutine_handle<> current) {
       return next_coroutine_handle_;  // Transfer directly
   }
   ```

**Lifetime Management:**

```cpp
// ❌ BAD: Handle is non-owning, can dangle
std::coroutine_handle<> global_handle;

void set_handle() {
    auto task = my_coroutine();
    global_handle = task.get_handle();
}  // task destroyed, handle is now dangling!

// ✅ GOOD: Wrap in RAII type
struct Task {
    std::coroutine_handle<promise_type> handle_;

    ~Task() {
        if (handle_) handle_.destroy();  // Automatic cleanup
    }
};
```

---

#### Q6: Explain the difference between std::suspend_always and std::suspend_never.

**Answer:**

These are the two standard awaitable types that control suspension behavior.

**std::suspend_always:**

```cpp
struct suspend_always {
    bool await_ready() const noexcept { return false; }  // ALWAYS suspend
    void await_suspend(std::coroutine_handle<>) const noexcept {}
    void await_resume() const noexcept {}
};
```

- **Effect**: Coroutine **always suspends** at this point
- **Use in `initial_suspend()`**: Coroutine starts suspended (lazy execution)
- **Use in `final_suspend()`**: Coroutine stays suspended after completion (frame kept alive)

**std::suspend_never:**

```cpp
struct suspend_never {
    bool await_ready() const noexcept { return true; }  // NEVER suspend
    void await_suspend(std::coroutine_handle<>) const noexcept {}
    void await_resume() const noexcept {}
};
```

- **Effect**: Coroutine **never suspends** at this point
- **Use in `initial_suspend()`**: Coroutine starts immediately (eager execution)
- **Use in `final_suspend()`**: Coroutine destroys frame immediately after completion

**Practical Impact:**

```cpp
struct promise_type {
    // Scenario 1: Lazy start, keep alive
    std::suspend_always initial_suspend() { return {}; }   // Start suspended
    std::suspend_always final_suspend() noexcept { return {}; }  // Stay alive

    // Scenario 2: Eager start, auto-destroy
    std::suspend_never initial_suspend() { return {}; }    // Start immediately
    std::suspend_never final_suspend() noexcept { return {}; }   // Auto-destroy

    // Scenario 3: Lazy start, auto-destroy
    std::suspend_always initial_suspend() { return {}; }   // Start suspended
    std::suspend_never final_suspend() noexcept { return {}; }   // Auto-destroy

    // Scenario 4: Eager start, keep alive
    std::suspend_never initial_suspend() { return {}; }    // Start immediately
    std::suspend_always final_suspend() noexcept { return {}; }  // Stay alive
};
```

**Example:**

```cpp
// Generator: Lazy start (suspend_always)
struct Generator {
    struct promise_type {
        std::suspend_always initial_suspend() { return {}; }
        // Start suspended, so begin() can call resume()
    };
};

// Fire-and-forget Task: Eager start (suspend_never)
struct FireAndForget {
    struct promise_type {
        std::suspend_never initial_suspend() { return {}; }
        // Start immediately, don't wait for anyone
    };
};
```

---

#### Q7: How do coroutines handle exceptions?

**Answer:**

Exceptions in coroutines are handled through the promise's `unhandled_exception()` method.

**Exception Flow:**

```cpp
Task<int> may_throw() {
    if (error_condition) {
        throw std::runtime_error("Error!");  // Exception thrown
    }
    co_return 42;
}

// Compiler transforms the coroutine body to:
void coroutine_body() {
    try {
        // Original coroutine code
        if (error_condition) {
            throw std::runtime_error("Error!");
        }
        promise.return_value(42);
    } catch (...) {
        promise.unhandled_exception();  // Capture exception
    }
    // final_suspend logic
}
```

**Promise Implementation:**

```cpp
struct promise_type {
    std::exception_ptr exception_;

    void unhandled_exception() {
        exception_ = std::current_exception();  // Store exception
    }

    T get_result() {
        if (exception_)
            std::rethrow_exception(exception_);  // Re-throw when accessed
        return value_;
    }
};
```

**Using Try-Catch in Coroutines:**

```cpp
Task<int> handle_errors() {
    try {
        int result = co_await may_throw();
        co_return result;
    } catch (const std::runtime_error& e) {
        std::cout << "Caught: " << e.what() << '\n';
        co_return -1;  // Return error code
    }
}
```

**Exception Propagation:**

```cpp
Task<int> caller() {
    try {
        int result = co_await may_throw();  // If may_throw threw, exception propagates here
        co_return result;
    } catch (...) {
        // Handle exception
    }
}
```

**Important Notes:**

1. **C++20 Limitation**: Cannot use `co_await` in catch block
   ```cpp
   try {
       co_await operation();
   } catch (...) {
       co_await cleanup();  // ❌ Error in C++20
   }
   ```

2. **Workaround**: Flag the error, handle after try-catch
   ```cpp
   bool error = false;
   try {
       co_await operation();
   } catch (...) {
       error = true;
   }
   if (error) {
       co_await cleanup();  // ✅ OK
   }
   ```

---

#### Q8: What is symmetric transfer and why is it important?

**Answer:**

**Symmetric transfer** is a technique where a coroutine directly transfers control to another coroutine without growing the call stack.

**The Problem: Stack Overflow:**

```cpp
Task<int> recursive_task(int n) {
    if (n == 0) co_return 1;

    auto result = co_await recursive_task(n - 1);  // Each co_await uses stack space
    co_return result + 1;
}

// recursive_task(100000) → stack overflow!
```

**Without Symmetric Transfer:**

```
Call Stack:
recursive_task(3).resume()
  → recursive_task(2).resume()  // Stack grows
    → recursive_task(1).resume()  // Stack grows
      → recursive_task(0).resume()  // Stack grows
        → returns
      ← returns
    ← returns
  ← returns
```

**With Symmetric Transfer:**

```cpp
struct TaskAwaitable {
    std::coroutine_handle<> next_;

    bool await_ready() const noexcept { return false; }

    // Return next coroutine handle instead of void/bool
    std::coroutine_handle<> await_suspend(std::coroutine_handle<> current) noexcept {
        return next_;  // Transfer directly to next coroutine
    }

    int await_resume() const noexcept { return 0; }
};
```

**Execution with Symmetric Transfer:**

```
Call Stack (stays flat):
recursive_task(3).resume()
→ [transfers to] recursive_task(2)  // No stack growth
→ [transfers to] recursive_task(1)  // No stack growth
→ [transfers to] recursive_task(0)  // No stack growth
→ completes
```

**Key Benefits:**

1. **Constant Stack Usage**: No matter how deep the chain
2. **Tail-Call Optimization for Coroutines**: Direct transfer like tail calls
3. **Enables Deep Recursion**: Can recurse 1,000,000 levels safely

**await_suspend() Return Types:**

```cpp
// 1. Return void: Always suspend
void await_suspend(std::coroutine_handle<> h) {
    schedule_resume(h);
}

// 2. Return bool: Conditional suspension
bool await_suspend(std::coroutine_handle<> h) {
    if (ready) return false;  // Don't suspend
    schedule_resume(h);
    return true;  // Suspend
}

// 3. Return coroutine_handle<>: Symmetric transfer
std::coroutine_handle<> await_suspend(std::coroutine_handle<> h) {
    return next_handle_;  // Transfer to next coroutine
}
```

---

#### Q9: Can you have a coroutine that both co_yields and co_returns?

**Answer:**

**Yes**, but the promise type must support both `yield_value()` and `return_value()`/`return_void()`.

**Example:**

```cpp
template<typename T>
struct GeneratorWithFinalValue {
    struct promise_type {
        T current_value_;
        std::optional<T> final_value_;

        // Support co_yield
        std::suspend_always yield_value(T value) {
            current_value_ = std::move(value);
            return {};
        }

        // Support co_return
        void return_value(T value) {
            final_value_ = std::move(value);
        }

        // ... other methods
    };

    // ... implementation
};

GeneratorWithFinalValue<int> example() {
    co_yield 1;
    co_yield 2;
    co_yield 3;
    co_return 999;  // Final value
}

int main() {
    auto gen = example();

    for (int val : gen) {
        std::cout << val << " ";  // 1 2 3
    }

    if (gen.has_final_value()) {
        std::cout << "Final: " << gen.get_final() << '\n';  // Final: 999
    }
}
```

**Use Cases:**

- Generators that return a final status/summary
- Iterators that produce elements and a final count
- Streams that yield data and return total bytes processed

**Note:** Most generators use `return_void()` and just end without a final value.

---

#### Q10: How is memory managed for coroutine frames?

**Answer:**

**Default Allocation:**

By default, the coroutine frame is allocated on the **heap**:

```cpp
Task<int> my_coroutine() {
    // Frame allocated on heap (contains locals, params, promise)
    co_return 42;
}

// Roughly transforms to:
void* frame = operator new(sizeof(CoroutineFrame));
// ... use frame
operator delete(frame);  // When destroyed
```

**Custom Allocation:**

You can override allocation in the promise type:

```cpp
struct promise_type {
    void* operator new(std::size_t size) {
        std::cout << "Allocating frame: " << size << " bytes\n";
        return my_custom_allocator().allocate(size);
    }

    void operator delete(void* ptr, std::size_t size) {
        std::cout << "Deallocating frame: " << size << " bytes\n";
        my_custom_allocator().deallocate(ptr, size);
    }
};
```

**Allocation Elision (HALO - Heap Allocation eLision Optimization):**

The compiler can eliminate heap allocation if:
- Coroutine lifetime is nested within caller
- Frame size is known at compile time
- Compiler can prove it's safe

```cpp
Task<int> short_lived() {
    co_return 42;
}

void caller() {
    auto task = short_lived();
    auto result = task.get();  // Compiler may elide heap allocation
}  // task destroyed, frame can be stack-allocated
```

**When Elision Happens:**

```cpp
// ✅ Likely elided: Short-lived, synchronous
void example1() {
    auto task = compute();
    int result = task.get();
}

// ❌ Not elided: Escapes function scope
Task<int> example2() {
    return compute();  // Caller has unknown lifetime
}

// ❌ Not elided: Stored for later
std::vector<Task<int>> tasks;
void example3() {
    tasks.push_back(compute());  // Lifetime extends beyond function
}
```

**Frame Contents:**

```cpp
struct CoroutineFrame {
    void* resume_address;       // Where to resume
    void* destroy_address;      // Cleanup function
    promise_type promise;       // Promise object
    Parameters params;          // Function parameters (copied)
    LocalVariables locals;      // Local variables
    Temporaries temps;          // Temporaries across suspension points
};
```

**Deallocation:**

Frame is destroyed when:
- `coroutine_handle::destroy()` is called, OR
- RAII wrapper destructor calls `destroy()`, OR
- Coroutine completes and `final_suspend()` returns `suspend_never`

---

(Q11-Q50 would continue covering: Coroutine debugging, performance comparisons with callbacks, integration with existing async frameworks, coroutine cancellation patterns, structured concurrency, generator-based parsers, coroutine-based reactive streams, and many other practical scenarios.)

---

### PRACTICE_TASKS: Predict the Output

---

#### Q1

Basic Generator

```cpp
#include <coroutine>
#include <iostream>

template<typename T>
struct Generator {
    struct promise_type {
        T current_value;

        Generator get_return_object() {
            return Generator{std::coroutine_handle<promise_type>::from_promise(*this)};
        }

        std::suspend_always initial_suspend() { return {}; }
        std::suspend_always final_suspend() noexcept { return {}; }

        std::suspend_always yield_value(T value) {
            current_value = value;
            return {};
        }

        void return_void() {}
        void unhandled_exception() {}
    };

    std::coroutine_handle<promise_type> handle;

    Generator(std::coroutine_handle<promise_type> h) : handle(h) {}
    ~Generator() { if (handle) handle.destroy(); }

    bool move_next() {
        handle.resume();
        return !handle.done();
    }

    T current() {
        return handle.promise().current_value;
    }
};

Generator<int> count() {
    co_yield 1;
    co_yield 2;
    co_yield 3;
}

int main() {
    auto gen = count();
    while (gen.move_next()) {
        std::cout << gen.current() << " ";
    }
}
```

**Answer:**
```
1 2 3
```

**Explanation:**
1. `count()` creates generator, suspends at `initial_suspend()`
2. First `move_next()` resumes, executes to first `co_yield 1`, stores 1, suspends
3. `current()` returns 1
4. Second `move_next()` resumes from first yield, executes to `co_yield 2`, stores 2, suspends
5. `current()` returns 2
6. Third `move_next()` resumes, executes to `co_yield 3`, stores 3, suspends
7. `current()` returns 3
8. Fourth `move_next()` resumes, reaches end, `done()` returns true, loop exits

---

#### Q2

Coroutine Suspension

```cpp
#include <coroutine>
#include <iostream>

struct Task {
    struct promise_type {
        Task get_return_object() {
            return Task{std::coroutine_handle<promise_type>::from_promise(*this)};
        }
        std::suspend_always initial_suspend() { return {}; }
        std::suspend_always final_suspend() noexcept { return {}; }
        void return_void() {}
        void unhandled_exception() {}
    };

    std::coroutine_handle<promise_type> handle;

    void resume() { handle.resume(); }
};

Task example() {
    std::cout << "A";
    co_await std::suspend_always{};
    std::cout << "B";
    co_await std::suspend_always{};
    std::cout << "C";
}

int main() {
    auto task = example();
    std::cout << "1";
    task.resume();
    std::cout << "2";
    task.resume();
    std::cout << "3";
    task.resume();
    std::cout << "4";
}
```

**Answer:**
```
1A2B3C4
```

**Explanation:**
1. `example()` creates coroutine, suspends at `initial_suspend()` (doesn't print anything yet)
2. Prints "1"
3. First `resume()`: Executes from start, prints "A", hits first `co_await suspend_always`, suspends
4. Prints "2"
5. Second `resume()`: Resumes from first suspension, prints "B", hits second `co_await`, suspends
6. Prints "3"
7. Third `resume()`: Resumes from second suspension, prints "C", reaches end
8. Prints "4"

---

(Q3-Q50 would continue with similar depth covering: promise method invocation order, exception handling flow, generator lifetime, symmetric transfer execution, custom awaitable behavior, and complex coroutine scenarios.)

---

### QUICK_REFERENCE: Coroutines Cheat Sheet

---

#### The Three Keywords

| Keyword | Effect | Transforms To |
|---------|--------|---------------|
| `co_await expr` | Suspend and wait | `co_await promise.yield_value(expr)` |
| `co_yield value` | Produce value, suspend | Evaluates awaitable interface |
| `co_return value` | Return and complete | `promise.return_value(value); goto final;` |

#### Promise Type Requirements

```cpp
struct promise_type {
    ReturnType get_return_object();
    auto initial_suspend();
    auto final_suspend() noexcept;
    void return_value(T) / void return_void();
    void unhandled_exception();

    // Optional:
    auto yield_value(T);
    auto await_transform(T);
    void* operator new(std::size_t);
    void operator delete(void*);
};
```

#### Awaitable Interface

```cpp
struct Awaitable {
    bool await_ready() const noexcept;
    void/bool/coroutine_handle<> await_suspend(coroutine_handle<>);
    T await_resume() const noexcept;
};
```

#### Coroutine Handle

```cpp
std::coroutine_handle<Promise> handle;

handle.resume();        // Resume execution
handle.done();          // Check if completed
handle.destroy();       // Destroy frame
handle.promise();       // Access promise
handle.operator bool(); // Check validity
```

#### Common Patterns

**Generator:**
```cpp
Generator<T> generate() {
    while (condition) {
        co_yield value;
    }
}
```

**Async Task:**
```cpp
Task<T> async_operation() {
    auto result = co_await awaitable;
    co_return process(result);
}
```

**Lazy Evaluation:**
```cpp
struct promise_type {
    std::suspend_always initial_suspend() { return {}; }  // Start suspended
};
```

**Eager Evaluation:**
```cpp
struct promise_type {
    std::suspend_never initial_suspend() { return {}; }  // Start immediately
};
```

---

**End of Topic 3: Coroutines** (2,200+ lines)
