## TOPIC: std::thread: Creation, Lifetime and Argument Passing

### PRACTICE_TASKS: Output Prediction and Bug Hunting

#### Q1
```cpp
// Q: The worker finishes long before main ends. What happens when this program runs?
#include <chrono>
#include <iostream>
#include <thread>

int main() {
    std::thread t([] { std::cout << "worker done\n"; });
    std::this_thread::sleep_for(std::chrono::milliseconds(100));
    std::cout << "main done\n";
}
```

**Answer:**
```
worker done
main done
terminate called without an active exception
(abort, exit status 134 on Linux)
```

**Explanation:**
- The worker almost certainly finished during the sleep, but `t` was never joined or detached.
- `~thread()` checks `joinable()`, which is still `true`: it calls `std::terminate()` (libstdc++ prints the message above, then `abort()`).
- Extra trap: if stdout is redirected to a file or pipe, the two lines may never appear, because `abort()` does not flush stdio buffers.
- **Key Concept:** Finishing the thread does not make the `std::thread` object non-joinable.

**Fixed Version:**
```cpp
#include <chrono>
#include <iostream>
#include <thread>

int main() {
    std::thread t([] { std::cout << "worker done\n"; });
    std::this_thread::sleep_for(std::chrono::milliseconds(100));
    t.join();
    std::cout << "main done\n";
}
```

---

#### Q2
```cpp
// Q: What does this program print?
#include <iostream>
#include <thread>

int main() {
    int value = 42;

    std::thread t([](int x) {
        x++;
        std::cout << x << '\n';
    }, value);

    t.join();
    std::cout << value << '\n';
}
```

**Answer:**
```
43
42
```

**Explanation:**
- `value` is copied into the thread's storage; the lambda increments its own parameter.
- The original `value` in `main` is untouched.
- Order is fixed: the worker prints before `join()` returns, and `main` prints after.
- **Key Concept:** std::thread passes arguments by copy unless you use std::ref.

---

#### Q3
```cpp
// Q: Does this compile? If yes, what does it print?
#include <iostream>
#include <thread>

int main() {
    int value = 42;

    std::thread t([](int& x) {
        x++;
        std::cout << x << '\n';
    }, value);

    t.join();
    std::cout << value << '\n';
}
```

**Answer:**
```
Compile error.
libstdc++: static assertion failed: std::thread arguments must be invocable after conversion to rvalues
```

**Explanation:**
- `std::thread` stores a copy of `value` and passes it to the lambda as an **rvalue**.
- An rvalue cannot bind to a non-const `int&`, so the callable is not invocable with the stored arguments.
- It does **not** silently bind the reference to the hidden copy, and nothing dangles: it just fails to compile.
- With `std::ref(value)` the program prints `43` then `43`.
- **Key Concept:** Reference parameters require std::ref; std::thread never preserves references implicitly.

**Fixed Version:**
```cpp
#include <functional>
#include <iostream>
#include <thread>

int main() {
    int value = 42;

    std::thread t([](int& x) {
        x++;
        std::cout << x << '\n';
    }, std::ref(value));

    t.join();
    std::cout << value << '\n'; // 43
}
```

---

#### Q4
```cpp
// Q: The lambda takes a const reference and main changes value before joining. What does this print? Is there a data race?
#include <chrono>
#include <iostream>
#include <thread>

int main() {
    int value = 42;

    std::thread t([](const int& x) {
        std::this_thread::sleep_for(std::chrono::milliseconds(50));
        std::cout << "worker sees " << x << '\n';
    }, value);

    value = 100;
    t.join();
    std::cout << "main has " << value << '\n';
}
```

**Answer:**
```
worker sees 42
main has 100
```

**Explanation:**
- `const int&` can bind to the rvalue copy, so this compiles, but `x` refers to the **thread's internal copy** made at construction time.
- `value = 100` modifies only main's variable. The worker never touches it, so there is no data race.
- This is deterministic: the copy was taken before the constructor returned.
- **Key Concept:** A const-reference parameter still sees a copy unless std::cref/std::ref is used.

---

#### Q5
```cpp
// Q: Find the bug.
#include <chrono>
#include <cstdio>
#include <iostream>
#include <string>
#include <thread>

void log_message(const std::string& msg) {
    std::cout << msg << '\n';
}

void start_logger(int id) {
    char buffer[64];
    std::snprintf(buffer, sizeof buffer, "request %d accepted", id);
    std::thread t(log_message, buffer);
    t.detach();
}

int main() {
    start_logger(7);
    std::this_thread::sleep_for(std::chrono::milliseconds(100));
}
```

**Answer:**
```
Undefined behaviour: dangling pointer. May print "request 7 accepted", garbage, or crash.
```

**Explanation:**
- `buffer` decays to `char*`; only the **pointer** is copied into the thread.
- The `std::string` parameter is constructed from that pointer **inside the new thread**, possibly after `start_logger` has returned and `buffer` is gone.
- `detach()` removes any chance of waiting. Testing usually "works", which hides the bug.
- **Key Concept:** Convert to an owning type before passing to a thread: the copy is of the decayed argument, not of the parameter type.

**Fixed Version:**
```cpp
#include <chrono>
#include <cstdio>
#include <iostream>
#include <string>
#include <thread>

void log_message(const std::string& msg) {
    std::cout << msg << '\n';
}

void start_logger(int id) {
    char buffer[64];
    std::snprintf(buffer, sizeof buffer, "request %d accepted", id);
    std::thread t(log_message, std::string(buffer)); // owning copy made now
    t.detach();
}

int main() {
    start_logger(7);
    std::this_thread::sleep_for(std::chrono::milliseconds(100));
}
```

---

#### Q6
```cpp
// Q: What does this program print?
#include <iostream>
#include <system_error>
#include <thread>

int main() {
    std::thread t([] {});
    t.join();
    std::cout << std::boolalpha << t.joinable() << '\n';
    try {
        t.join();
        std::cout << "joined twice\n";
    } catch (const std::system_error& e) {
        std::cout << "system_error: " << e.code().message() << '\n';
    }
}
```

**Answer:**
```
false
system_error: Invalid argument
```

**Explanation:**
- After the first `join()`, `t` is non-joinable.
- `join()` on a non-joinable thread throws `std::system_error` with `std::errc::invalid_argument` (message text is the platform's, here glibc).
- Unlike destroying a joinable thread, this is a real, catchable exception.
- **Key Concept:** join and detach make the object non-joinable; joining again is an error.

---

#### Q7
```cpp
// Q: What happens when this program runs?
#include <iostream>
#include <thread>

void task(int id) { std::cout << "task " << id << '\n'; }

int main() {
    std::thread t(task, 1);
    t = std::thread(task, 2);
    t.join();
}
```

**Answer:**
```
std::terminate() at the assignment: "terminate called without an active exception", abort.
"task 1" and/or "task 2" may or may not appear first.
```

**Explanation:**
- Move assignment into a `std::thread` that is still joinable calls `std::terminate()`, exactly like its destructor would.
- The library will not silently join or drop the old thread.
- `std::jthread` differs: its move assignment requests stop on and joins the old thread.
- **Key Concept:** Join or detach before reassigning a std::thread.

**Fixed Version:**
```cpp
#include <iostream>
#include <thread>

void task(int id) { std::cout << "task " << id << '\n'; }

int main() {
    std::thread t(task, 1);
    t.join();                  // finish the old thread first
    t = std::thread(task, 2);
    t.join();
}
```

---

#### Q8
```cpp
// Q: process() throws. Does the catch block in main handle it?
#include <iostream>
#include <stdexcept>
#include <thread>

void process() { throw std::runtime_error("bad input"); }

int main() {
    try {
        std::thread t(process);
        t.join();
    } catch (const std::exception& e) {
        std::cout << "caught: " << e.what() << '\n';
    }
}
```

**Answer:**
```
No. std::terminate() is called inside the worker thread:
terminate called after throwing an instance of 'std::runtime_error'
  what():  bad input
(abort)
```

**Explanation:**
- The exception is thrown on the worker's stack. An exception escaping a thread's top-level function calls `std::terminate()`.
- The `try` in `main` only covers `main`'s own stack; `join()` does not rethrow anything.
- **Key Concept:** Transport exceptions across threads with std::exception_ptr or a future.

**Fixed Version:**
```cpp
#include <exception>
#include <iostream>
#include <stdexcept>
#include <thread>

void process() { throw std::runtime_error("bad input"); }

int main() {
    std::exception_ptr err;
    std::thread t([&err] {
        try { process(); } catch (...) { err = std::current_exception(); }
    });
    t.join();
    try {
        if (err) std::rethrow_exception(err);
    } catch (const std::exception& e) {
        std::cout << "caught: " << e.what() << '\n';
    }
}
```

---

#### Q9
```cpp
// Q: Find the bug. What can this print?
#include <iostream>
#include <thread>
#include <vector>

int main() {
    std::vector<std::thread> threads;
    for (int i = 0; i < 4; ++i) {
        threads.emplace_back([&] { std::cout << i; });
    }
    for (auto& t : threads) t.join();
    std::cout << '\n';
}
```

**Answer:**
```
Undefined behaviour. Data race on i, and i is destroyed after the first loop while threads may still read it.
Typical outputs: "1344", "4444", "0123", or garbage digits.
```

**Explanation:**
- `[&]` captures `i` by reference: all four lambdas refer to the **same** loop variable.
- Main writes `i` (`++i`) while workers read it: unsynchronized read and write, a data race.
- `i`'s scope ends after the first loop; workers can still be reading it before the joins: dangling reference.
- **Key Concept:** Capture loop variables by value when handing them to threads.

**Fixed Version:**
```cpp
#include <iostream>
#include <mutex>
#include <thread>
#include <vector>

int main() {
    std::mutex m;
    std::vector<std::thread> threads;
    for (int i = 0; i < 4; ++i) {
        threads.emplace_back([i, &m] {        // copy of i per thread
            std::lock_guard lock(m);
            std::cout << i;
        });
    }
    for (auto& t : threads) t.join();
    std::cout << '\n';                        // some permutation of 0123
}
```

---

#### Q10
```cpp
// Q: main dereferences ptr only after join(). Is this program correct?
#include <iostream>
#include <thread>

int* ptr = nullptr;

void worker() {
    int value = 42;
    ptr = &value;
}

int main() {
    std::thread t(worker);
    t.join();
    std::cout << *ptr << '\n';
}
```

**Answer:**
```
Undefined behaviour: ptr points to a destroyed object. Often prints 42 or garbage.
```

**Explanation:**
- `value` lives on the worker's stack and is destroyed when `worker()` **returns**, before `join()` returns.
- The write to `ptr` is properly synchronized (thread completion synchronizes-with `join()`), so there is no data race on `ptr` itself.
- But the object it points to is dead. `join()` does not extend the worker's locals.
- **Key Concept:** Synchronization and object lifetime are separate questions; both must be satisfied.

**Fixed Version:**
```cpp
#include <iostream>
#include <thread>

int main() {
    int result = 0;                              // owned by main
    std::thread t([&result] { result = 42; });   // main outlives the use
    t.join();                                    // write is visible after join
    std::cout << result << '\n';
}
```

---

#### Q11
```cpp
// Q: Find the bugs in this class (there are two serious ones).
#include <chrono>
#include <iostream>
#include <thread>

class Service {
public:
    void start() {
        worker_ = std::thread([this] {
            while (running_) {
                ++ticks_;
            }
        });
    }
    ~Service() { running_ = false; }
private:
    bool running_ = true;
    long ticks_ = 0;
    std::thread worker_;
};

int main() {
    Service s;
    s.start();
    std::this_thread::sleep_for(std::chrono::milliseconds(10));
    std::cout << "shutting down\n";
}
```

**Answer:**
```
1) ~Service never joins: worker_ is destroyed while joinable -> std::terminate().
2) running_ is a plain bool read and written concurrently -> data race, undefined behaviour
   (with -O2 the loop may be compiled to never re-read running_ and spin forever).
```

**Explanation:**
- Members are destroyed after the destructor body; `std::thread`'s destructor sees a joinable thread.
- Even if a join were added, the plain `bool` makes the program UB. The optimizer may hoist `running_` out of the loop, so a join would then hang forever.
- `[this]` stores a pointer to the live object, so the worker must be stopped and joined before `ticks_` and `running_` are destroyed.
- ThreadSanitizer (after adding the join) reports the race on `running_`.
- **Key Concept:** A class owning a thread needs a synchronized stop flag and a join in its destructor.

**Fixed Version:**
```cpp
#include <atomic>
#include <chrono>
#include <iostream>
#include <thread>

class Service {
public:
    void start() {
        worker_ = std::thread([this] {
            while (running_.load(std::memory_order_relaxed)) {
                ++ticks_;                         // only the worker touches ticks_
            }
        });
    }
    ~Service() {
        running_.store(false, std::memory_order_relaxed);
        if (worker_.joinable()) worker_.join();   // before members are destroyed
    }
private:
    std::atomic<bool> running_{true};
    long ticks_ = 0;
    std::thread worker_;
};

int main() {
    Service s;
    s.start();
    std::this_thread::sleep_for(std::chrono::milliseconds(10));
    std::cout << "shutting down\n";
}
```

---

#### Q12
```cpp
// Q: Does this compile? (Task is a function object.)
#include <iostream>
#include <thread>

struct Task {
    void operator()() const { std::cout << "running\n"; }
};

int main() {
    std::thread t(Task());
    t.join();
}
```

**Answer:**
```
Compile error: t is declared as a function (most vexing parse), so t.join() is invalid.
GCC: request for member 'join' in 't', which is of non-class type 'std::thread(Task (*)())'
```

**Explanation:**
- `std::thread t(Task());` parses as a declaration of a function `t` returning `std::thread` and taking a pointer to a function returning `Task`.
- No thread is created; the error appears at `t.join()`.
- Fix with braces: `std::thread t{Task{}};`, extra parentheses `std::thread t((Task()));`, or a named object.
- **Key Concept:** Use brace initialization when constructing a thread from a temporary function object.

**Fixed Version:**
```cpp
#include <iostream>
#include <thread>

struct Task {
    void operator()() const { std::cout << "running\n"; }
};

int main() {
    std::thread t{Task{}};
    t.join();
}
```

---

#### Q13
```cpp
// Q: What does this program print?
#include <iostream>
#include <thread>

int main() {
    std::thread t([] {});
    std::thread::id before = t.get_id();
    std::thread u = std::move(t);

    std::cout << std::boolalpha;
    std::cout << (u.get_id() == before) << '\n';
    std::cout << (t.get_id() == std::thread::id{}) << '\n';
    u.detach();
    std::cout << (u.get_id() == std::thread::id{}) << '\n';
    std::cout << (std::this_thread::get_id() == before) << '\n';
}
```

**Answer:**
```
true
true
true
false
```

**Explanation:**
- Moving transfers the thread, so `u` now reports the original id.
- The moved-from `t` and the detached `u` own no thread: both return the default id (printed by libstdc++ as `thread::id of a non-executing thread`).
- The main thread's id is different from the worker's.
- Detaching does not end the thread; it only drops ownership.
- **Key Concept:** get_id() reports ownership, like joinable(): no owned thread means the default id.
