## TOPIC: C++20 Coroutines - Stackless Cooperative Multitasking

### PRACTICE_TASKS: Output Prediction and Code Analysis

#### Q1
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
    ~Generator() { if (handle) handle.destroy(); }  // Bug: missing move semantics!

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
    Generator<int> gen1 = count();
    Generator<int> gen2 = gen1;  // Bug: double-delete!

    while (gen1.move_next()) {
        std::cout << gen1.current() << " ";
    }
}
```

**Answer:**
```
Double-free error (undefined behavior, likely crash)
```

**Explanation:**
- `Generator` has no copy/move constructors defined
- Compiler-generated copy constructor copies `handle` pointer
- `gen1` and `gen2` both hold same `handle`
- When `gen1` destructs → `handle.destroy()` called
- When `gen2` destructs → `handle.destroy()` called AGAIN on freed memory
- Double-free → undefined behavior (crash)
- **Key Concept:** Coroutine handles are non-copyable resources; must delete copy operations or implement move-only semantics with explicit move constructor/assignment

**Fixed Version:**
```cpp
Generator(Generator&& other) : handle(other.handle) {
    other.handle = nullptr;  // Transfer ownership
}

Generator& operator=(Generator&& other) {
    if (this != &other) {
        if (handle) handle.destroy();
        handle = other.handle;
        other.handle = nullptr;
    }
    return *this;
}

Generator(const Generator&) = delete;
Generator& operator=(const Generator&) = delete;
```

---

#### Q2
```cpp
#include <coroutine>
#include <iostream>

struct Task {
    struct promise_type {
        Task get_return_object() {
            return Task{std::coroutine_handle<promise_type>::from_promise(*this)};
        }
        std::suspend_never initial_suspend() { return {}; }  // Eager start
        std::suspend_always final_suspend() noexcept { return {}; }
        void return_void() {}
        void unhandled_exception() {}
    };

    std::coroutine_handle<promise_type> handle;

    Task(std::coroutine_handle<promise_type> h) : handle(h) {}
    ~Task() { if (handle) handle.destroy(); }

    void resume() { handle.resume(); }
};

Task example() {
    std::cout << "A";
    co_await std::suspend_always{};
    std::cout << "B";
}

int main() {
    std::cout << "1";
    auto task = example();  // Bug: eager execution with suspend_never!
    std::cout << "2";
    task.resume();
    std::cout << "3";
}
```

**Answer:**
```
1A2B3
```

**Explanation:**
- `initial_suspend()` returns `suspend_never` → coroutine starts immediately
- `example()` called → prints "A" before returning
- Suspends at first `co_await suspend_always`
- Prints "2"
- `resume()` continues → prints "B"
- Prints "3"
- **Key Concept:** suspend_never at initial_suspend() causes eager execution; coroutine runs until first explicit suspension point before returning to caller

---

#### Q3
```cpp
#include <coroutine>
#include <iostream>

struct Task {
    struct promise_type {
        Task get_return_object() {
            return Task{std::coroutine_handle<promise_type>::from_promise(*this)};
        }
        std::suspend_always initial_suspend() { return {}; }
        std::suspend_never final_suspend() noexcept { return {}; }  // Bug: no final suspend!
        void return_void() {}
        void unhandled_exception() {}
    };

    std::coroutine_handle<promise_type> handle;

    Task(std::coroutine_handle<promise_type> h) : handle(h) {}
    ~Task() {
        if (handle && !handle.done()) {  // Bug: check done() but handle may be invalid!
            handle.destroy();
        }
    }

    void resume() { handle.resume(); }
};

Task example() {
    std::cout << "A";
    co_return;
}

int main() {
    auto task = example();
    task.resume();  // Runs to completion
    // Destructor runs here - use-after-free!
}
```

**Answer:**
```
A
(then undefined behavior on destruction)
```

**Explanation:**
- `final_suspend()` returns `suspend_never` → coroutine self-destructs on completion
- `resume()` runs to `co_return` → final_suspend returns suspend_never
- Coroutine immediately self-destructs (calls promise destructor, frees frame)
- `handle` now dangling (points to freed memory)
- Destructor runs → `handle.done()` accesses freed memory → undefined behavior
- **Key Concept:** suspend_never at final_suspend() causes immediate self-destruction; external handle becomes dangling; always use suspend_always at final_suspend() if handle outlives coroutine execution

**Fixed Version:**
```cpp
std::suspend_always final_suspend() noexcept { return {}; }  // Safe: handle remains valid
```

---

#### Q4
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
        return handle.promise().current_value;  // Bug: no check if valid!
    }
};

Generator<int> count() {
    co_yield 1;
    co_yield 2;
}

int main() {
    auto gen = count();
    std::cout << gen.current() << " ";  // Bug: called before first resume!
    gen.move_next();
    std::cout << gen.current() << " ";
}
```

**Answer:**
```
Undefined behavior (uninitialized current_value, likely garbage or zero)
1
```

**Explanation:**
- `count()` creates generator → suspends at `initial_suspend()`
- No `co_yield` executed yet → `current_value` uninitialized
- `gen.current()` reads uninitialized member → undefined behavior
- First `move_next()` → executes to `co_yield 1` → sets `current_value = 1`
- Second `gen.current()` → valid read: 1
- **Key Concept:** Promise members uninitialized until first yield; accessing current() before first move_next() reads garbage; always resume before accessing promise state

**Fixed Version:**
```cpp
T current() {
    if (!handle || handle.done()) {
        throw std::runtime_error("Generator exhausted or not started");
    }
    return handle.promise().current_value;
}
```

---

#### Q5
```cpp
#include <coroutine>
#include <iostream>

struct Task {
    struct promise_type {
        int* data;  // Bug: raw pointer ownership unclear!

        Task get_return_object() {
            return Task{std::coroutine_handle<promise_type>::from_promise(*this)};
        }

        std::suspend_always initial_suspend() { return {}; }
        std::suspend_always final_suspend() noexcept { return {}; }

        void return_void() {}
        void unhandled_exception() {}

        promise_type() : data(new int(42)) {}
        ~promise_type() { delete data; }  // Deleted when coroutine destroyed
    };

    std::coroutine_handle<promise_type> handle;

    Task(std::coroutine_handle<promise_type> h) : handle(h) {}
    ~Task() { if (handle) handle.destroy(); }

    int* get_data() { return handle.promise().data; }  // Bug: returns raw pointer!
};

Task example() {
    co_return;
}

int main() {
    int* ptr;
    {
        auto task = example();
        ptr = task.get_data();  // Bug: pointer escapes scope!
    }  // task destroyed here
    std::cout << *ptr << "\n";  // Use-after-free!
}
```

**Answer:**
```
Undefined behavior (dangling pointer dereference)
```

**Explanation:**
- Promise allocates `data` in constructor
- `get_data()` returns raw pointer to promise-owned memory
- `ptr` captures pointer outside task's scope
- Task destructor destroys coroutine → promise destructor deletes `data`
- `*ptr` dereferences freed memory → undefined behavior
- **Key Concept:** Returning raw pointers to coroutine-owned resources creates dangling pointers when coroutine destroyed; use shared_ptr or copy data, not raw pointers

**Fixed Version:**
```cpp
std::shared_ptr<int> get_data() {
    return std::make_shared<int>(*handle.promise().data);  // Copy data
}
```

---

#### Q6
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
        void unhandled_exception() { std::terminate(); }  // Bug: terminates on exception!
    };

    std::coroutine_handle<promise_type> handle;

    Task(std::coroutine_handle<promise_type> h) : handle(h) {}
    ~Task() { if (handle) handle.destroy(); }

    void resume() { handle.resume(); }
};

Task example() {
    std::cout << "Before throw\n";
    throw std::runtime_error("Error!");  // Exception in coroutine
    co_return;
}

int main() {
    auto task = example();
    task.resume();  // Triggers exception
    std::cout << "After resume\n";  // Never reached!
}
```

**Answer:**
```
Before throw
(program terminates via std::terminate())
```

**Explanation:**
- `resume()` executes coroutine body
- `throw` raises exception inside coroutine
- Exception captured by coroutine machinery → calls `unhandled_exception()`
- `unhandled_exception()` calls `std::terminate()` → program aborts
- No stack unwinding beyond coroutine boundary
- "After resume" never printed
- **Key Concept:** Exceptions in coroutines don't propagate to caller; must be caught in unhandled_exception(); calling terminate() aborts program; store exception with std::current_exception() for later rethrow

**Fixed Version:**
```cpp
struct promise_type {
    std::exception_ptr exception;

    void unhandled_exception() {
        exception = std::current_exception();  // Store for later
    }
};

void resume() {
    handle.resume();
    if (handle.promise().exception) {
        std::rethrow_exception(handle.promise().exception);  // Propagate to caller
    }
}
```

---

#### Q7
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
            current_value = std::move(value);  // Move value
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
        return handle.promise().current_value;  // Bug: returns by value after move!
    }
};

Generator<std::string> generate() {
    std::string s = "Hello";
    co_yield std::move(s);  // Move into promise
    co_yield "World";
}

int main() {
    auto gen = generate();
    gen.move_next();
    std::cout << gen.current() << " ";  // First call moves out
    std::cout << gen.current() << " ";  // Bug: second call accesses moved-from object!
    gen.move_next();
    std::cout << gen.current() << "\n";
}
```

**Answer:**
```
Hello  World
(first two calls: second is empty string or garbage)
```

**Explanation:**
- `co_yield std::move(s)` → moves into `current_value`
- First `gen.current()` → returns by value, copies from `current_value`
- Second `gen.current()` → returns by value, copies again (OK for string)
- **Actually no bug here for string!** String can be copied multiple times
- Bug would occur if `current()` returned `std::move(current_value)` → first call moves out, second accesses moved-from object
- **Key Concept:** Returning by value from promise allows multiple accesses; returning rvalue reference or moving causes use-after-move on subsequent calls

**Version That Actually Has Bug:**
```cpp
T current() {
    return std::move(handle.promise().current_value);  // Moves out!
}

// First current() OK, second current() accesses moved-from object
```

---

#### Q8
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

    Task(std::coroutine_handle<promise_type> h) : handle(h) {}
    ~Task() { if (handle) handle.destroy(); }

    void resume() {
        if (!handle.done()) {
            handle.resume();
        }
    }
};

Task recursive_coro(int n) {
    std::cout << n << " ";
    if (n > 0) {
        auto sub = recursive_coro(n - 1);  // Bug: sub destroyed before completing!
        sub.resume();
    }
    co_return;
}

int main() {
    auto task = recursive_coro(3);
    task.resume();
}
```

**Answer:**
```
3 2 (crash or undefined behavior)
```

**Explanation:**
- `recursive_coro(3)` creates outer coroutine, prints "3"
- Creates `sub = recursive_coro(2)` (inner coroutine)
- Calls `sub.resume()` → inner coroutine prints "2"
- Inner coroutine creates `recursive_coro(1)`, resumes it
- But `recursive_coro(1)` immediately goes out of scope and destructs
- Destroys coroutine before it completes → undefined behavior
- Coroutines are not meant for recursion like regular functions
- **Key Concept:** Coroutines don't support traditional recursion; creating nested coroutines without ensuring they complete before destruction causes undefined behavior

**Better Approach:**
```cpp
// Don't use coroutines for recursion - use regular functions or iterative approach
void recursive_func(int n) {
    std::cout << n << " ";
    if (n > 0) {
        recursive_func(n - 1);
    }
}
```

---

#### Q9
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

    Task(std::coroutine_handle<promise_type> h) : handle(h) {}
    ~Task() { if (handle) handle.destroy(); }

    void resume() { handle.resume(); }
};

Task example() {
    int x = 42;
    std::cout << "x = " << x << "\n";
    co_await std::suspend_always{};
    std::cout << "x = " << x << "\n";  // Bug: x might be corrupted!
    co_return;
}

int main() {
    auto task = example();
    task.resume();  // First part
    // ... imagine long delay or other work here ...
    task.resume();  // Bug: stack may have been reused!
}
```

**Answer:**
```
x = 42
x = 42
```

**Explanation:**
- Local variable `x` stored in coroutine frame (heap-allocated)
- NOT on stack like regular functions
- First `resume()` → prints "x = 42", suspends
- Coroutine frame persists across suspension
- Second `resume()` → `x` still valid, prints "x = 42"
- **No bug here!** Coroutines preserve local variables across suspensions
- **Key Concept:** Coroutine local variables live in heap-allocated frame, not stack; preserved across suspensions unlike regular function locals

**Actual Bug Would Be:**
```cpp
Task dangerous(int& ref) {  // Capturing reference to external variable
    co_await std::suspend_always{};
    std::cout << ref << "\n";  // ref might dangle if referent destroyed!
}
```

---

#### Q10
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

    Task(std::coroutine_handle<promise_type> h) : handle(h) {}
    ~Task() { if (handle) handle.destroy(); }

    void resume() { handle.resume(); }
    bool done() { return handle.done(); }
};

Task example() {
    co_await std::suspend_always{};
    std::cout << "A";
    co_return;
}

int main() {
    auto task = example();
    task.resume();
    task.resume();  // Bug: resume() called on completed coroutine!
}
```

**Answer:**
```
A
(undefined behavior on second resume)
```

**Explanation:**
- First `resume()` → executes to `co_return`, prints "A"
- Suspends at `final_suspend()` → coroutine done but not destroyed
- `handle.done()` returns `true`
- Second `resume()` → resumes completed coroutine → undefined behavior
- May crash, loop, or appear to work
- **Key Concept:** Resuming completed coroutine (done() == true) is undefined behavior; always check done() before calling resume()

**Fixed Version:**
```cpp
void resume() {
    if (!handle.done()) {
        handle.resume();
    }
}
```

---

#### Q11
```cpp
#include <coroutine>
#include <iostream>
#include <vector>

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

Generator<int> range(int n) {
    for (int i = 0; i < n; i++) {
        co_yield i;  // Bug: yields reference to loop variable!
    }
}

int main() {
    auto gen = range(5);
    std::vector<int> vec;
    while (gen.move_next()) {
        vec.push_back(gen.current());
    }
    for (int v : vec) {
        std::cout << v << " ";
    }
}
```

**Answer:**
```
0 1 2 3 4
```

**Explanation:**
- `co_yield i` copies `i` into `current_value` (by value)
- Loop variable `i` stored in coroutine frame
- Each iteration yields copy of current `i` value
- `current_value` updated each iteration
- **No bug here!** `yield_value` takes value by value and stores copy
- **Key Concept:** yield_value copies argument; loop variables safe to yield because they're in coroutine frame; yielding references to external variables would be dangerous

**Actual Bug Would Be:**
```cpp
Generator<int&> dangerous_range(std::vector<int>& vec) {
    for (int& i : vec) {
        co_yield i;  // Yields reference - OK if vec outlives generator
    }
}

// Bug if vec destroyed while generator alive:
auto gen = dangerous_range(temp_vec);  // temp_vec destroyed, gen dangles
```

---

#### Q12
```cpp
#include <coroutine>
#include <iostream>

struct Task {
    struct promise_type {
        int value = 0;

        Task get_return_object() {
            std::cout << "get_return_object\n";
            return Task{std::coroutine_handle<promise_type>::from_promise(*this)};
        }

        std::suspend_always initial_suspend() {
            std::cout << "initial_suspend\n";
            return {};
        }

        std::suspend_always final_suspend() noexcept {
            std::cout << "final_suspend\n";
            return {};
        }

        void return_value(int v) {
            std::cout << "return_value(" << v << ")\n";
            value = v;
        }

        void unhandled_exception() {}
    };

    std::coroutine_handle<promise_type> handle;

    Task(std::coroutine_handle<promise_type> h) : handle(h) {}
    ~Task() {
        std::cout << "~Task\n";
        if (handle) handle.destroy();
    }

    void resume() { handle.resume(); }
    int get() { return handle.promise().value; }
};

Task compute() {
    std::cout << "compute body\n";
    co_return 42;
}

int main() {
    std::cout << "main start\n";
    auto task = compute();
    std::cout << "task created\n";
    task.resume();
    std::cout << "value: " << task.get() << "\n";
    std::cout << "main end\n";
}
```

**Answer:**
```
main start
get_return_object
initial_suspend
task created
compute body
return_value(42)
final_suspend
value: 42
main end
~Task
```

**Explanation:**
- `compute()` → `get_return_object()` prints "get_return_object"
- `initial_suspend()` prints "initial_suspend", suspends immediately
- Returns to main → prints "task created"
- `resume()` → executes body, prints "compute body"
- `co_return 42` → calls `return_value(42)`, prints "return_value(42)"
- `final_suspend()` prints "final_suspend", suspends
- `get()` accesses promise value → prints "value: 42"
- Prints "main end"
- Destructor runs → prints "~Task"
- **Key Concept:** Coroutine promise method call order: get_return_object → initial_suspend → body → return_value/return_void → final_suspend → destroy (in destructor)

---
