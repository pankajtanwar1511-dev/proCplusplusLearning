## TOPIC: C++20 Coroutines - Stackless Cooperative Multitasking

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
