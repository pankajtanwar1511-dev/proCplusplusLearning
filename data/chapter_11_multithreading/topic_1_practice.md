## TOPIC: std::thread Basics - Creating and Managing Threads

### PRACTICE_TASKS: Output Prediction and Code Analysis

#### Q1
```cpp
void worker() {
    std::cout << "Working\n";
}

int main() {
    std::thread t(worker);
    // Missing join or detach
}
```

**Answer:**
```
Program calls std::terminate() and aborts
```

**Explanation:**
- Thread t created successfully
- worker function starts executing
- main() exits immediately
- Thread object t goes out of scope
- **Critical: t is still joinable** (neither joined nor detached)
- std::thread destructor checks joinable state
- If joinable in destructor: **calls std::terminate()**
- Program aborts immediately
- **Rule:** Thread must be joined or detached before destruction
- **Fix:** Add t.join() or t.detach() before main() ends
- **Key Concept:** Thread lifecycle requires explicit join or detach; destructor of joinable thread terminates program

---

#### Q2
```cpp
void increment(int x) {
    ++x;
}

int main() {
    int value = 10;
    std::thread t(increment, value);
    t.join();
    std::cout << value << "\n";
}
```

**Answer:**
```
10
```

**Explanation:**
- value initialized to 10 in main
- Thread created: std::thread t(increment, value)
- **Arguments passed by value by default**
- value copied to thread's stack
- increment() receives copy, not reference
- ++x modifies the copy (not original value)
- Thread completes, t.join() waits
- Original value unchanged: still 10
- **To modify original:** Use std::ref(value)
- **Thread argument semantics:** Default is copy, not reference
- **Key Concept:** Argument passing to threads is by value; use std::ref for references

---

#### Q3
```cpp
void modify(int& x) {
    x = 100;
}

int main() {
    int value = 0;
    std::thread t(modify, std::ref(value));
    t.join();
    std::cout << value << "\n";
}
```

**Answer:**
```
100
```

**Explanation:**
- value initialized to 0
- std::ref(value) creates reference wrapper
- Thread receives reference to original value
- modify() gets int& parameter (reference)
- x = 100 modifies original value in main
- t.join() waits for completion
- value now 100
- **std::ref is essential** for passing by reference
- Without std::ref: compilation error (can't bind rvalue to non-const reference)
- **Pattern:** Use std::ref for reference parameters
- **Key Concept:** std::ref passes by reference; modification preserved in original variable

---

#### Q4
```cpp
std::thread t([]{ std::cout << "Hello\n"; });
t.join();
t.join();
```

**Answer:**
```
Undefined behavior
```

**Explanation:**
- Thread created with lambda
- First t.join(): Waits for thread completion
- Thread finishes, prints "Hello"
- **After join(): t is no longer joinable**
- t.joinable() returns false
- Second t.join() called on non-joinable thread
- **Undefined behavior:** Calling join on non-joinable thread
- Likely throws std::system_error or crashes
- **Once joined, cannot join again**
- **Fix:** Check t.joinable() before second join
- **Key Concept:** joinable state changes after join/detach; second join is undefined behavior

---

#### Q5
```cpp
std::thread t1([]{ });
std::thread t2 = t1;
```

**Answer:**
```
Compilation error
```

**Explanation:**
- t1 created with empty lambda
- Attempt to copy-construct t2 from t1
- **std::thread is not copyable**
- Copy constructor deleted
- **Reason:** Thread ownership is exclusive
- Cannot have two thread objects managing same thread
- **Move-only type:** Can only be moved
- **Fix:** std::thread t2 = std::move(t1);
- After move: t1 becomes empty, t2 owns thread
- **Key Concept:** std::thread is move-only; cannot be copied, only moved

---

#### Q6
```cpp
std::thread t;
std::cout << std::boolalpha << t.joinable() << "\n";
```

**Answer:**
```
false
```

**Explanation:**
- Default constructor: std::thread t
- Creates empty thread object
- **No thread of execution created**
- t represents "no thread"
- t.joinable() checks if thread is active
- Empty thread is not joinable
- Returns false
- **Joinable conditions:** Thread created with callable AND not yet joined/detached
- Default-constructed threads are never joinable
- **Key Concept:** Default construction creates empty thread; not joinable until assigned

---

#### Q7
```cpp
void task() {
    std::this_thread::sleep_for(std::chrono::milliseconds(100));
    std::cout << "Task complete\n";
}

int main() {
    std::thread t(task);
    t.detach();
    std::cout << "Main exits\n";
}
```

**Answer:**
```
Main exits
(may or may not see "Task complete")
```

**Explanation:**
- Thread t created, starts executing task()
- task() sleeps for 100ms
- **t.detach() immediately:** Thread runs independently
- main() continues without waiting
- Prints "Main exits"
- main() returns, program exits
- **Detached thread may still be running**
- If program exits before 100ms: "Task complete" never prints
- If program somehow waits: might print
- **Undefined:** Detached thread accessing std::cout after main exits
- **Race:** Program termination vs thread completion
- **Key Concept:** Detached threads have independent lifetime; may not complete if main exits early

---

#### Q8
```cpp
int main() {
    int x = 5;
    std::thread t([x]() mutable {
        x = 10;
        std::cout << "Thread: " << x << "\n";
    });
    t.join();
    std::cout << "Main: " << x << "\n";
}
```

**Answer:**
```
Thread: 10
Main: 5
```

**Explanation:**
- x = 5 in main
- Lambda captures x by value: [x]
- **Capture creates copy of x inside lambda**
- mutable keyword: allows modifying captured copy
- Thread starts, lambda has its own x = 5
- x = 10: modifies lambda's copy
- Prints "Thread: 10"
- t.join() waits for completion
- **Original x unchanged:** still 5
- Prints "Main: 5"
- **To modify original:** Use [&x] (capture by reference)
- **Key Concept:** Lambda captures by value create copies; mutable modifies copy not original

---

#### Q9
```cpp
class Worker {
public:
    void process() { std::cout << "Processing\n"; }
};

int main() {
    Worker w;
    std::thread t(&Worker::process, w);
    t.join();
}
```

**Answer:**
```
Processing
```

**Explanation:**
- Worker object w created
- Thread syntax: &Worker::process (member function pointer)
- Second argument: w (object to call method on)
- **w passed by value:** Copy of w sent to thread
- Thread calls process() on copied Worker object
- Prints "Processing"
- t.join() waits for completion
- **To use original w:** std::thread t(&Worker::process, &w) or std::ref(w)
- **Member function threading pattern:** (func_ptr, object, args...)
- **Key Concept:** Member function threading passes object by value; use pointer/ref for original

---

#### Q10
```cpp
std::thread t([]{ throw std::runtime_error("Error"); });
t.join();
std::cout << "Completed\n";
```

**Answer:**
```
Program calls std::terminate()
```

**Explanation:**
- Thread created with lambda that throws
- Lambda executes, throws std::runtime_error
- **Exception thrown in thread**
- No try-catch inside thread
- **Uncaught exception in thread:** std::terminate() called
- Program aborts immediately
- "Completed" never prints
- **Exceptions don't cross thread boundaries**
- Cannot catch in main thread
- **Fix:** Catch inside lambda or use std::promise/std::future
- **Key Concept:** Exception handling must be inside thread; uncaught exceptions terminate program

---

#### Q11
```cpp
std::thread t1([]{ std::cout << "T1\n"; });
std::thread t2 = std::move(t1);
t1.join();
```

**Answer:**
```
Undefined behavior
```

**Explanation:**
- t1 created with lambda
- std::move(t1) transfers ownership to t2
- **After move:** t1 is empty (default-constructed state)
- t1.joinable() is false
- t2 owns the thread
- t1.join() called on empty thread
- **Calling join() on non-joinable thread: undefined behavior**
- Likely throws std::system_error
- **Should call:** t2.join() instead
- **Move semantics:** Moved-from thread becomes empty
- **Key Concept:** Move semantics transfer ownership; moved-from thread is empty and not joinable

---

#### Q12
```cpp
int compute() { return 42; }

int main() {
    std::thread t(compute);
    t.join();
    // How to get the return value?
}
```

**Answer:**
```
Cannot retrieve return value with std::thread
```

**Explanation:**
- Thread created with compute function
- compute() returns 42
- **std::thread discards return values**
- No mechanism to retrieve result
- t.join() only waits, doesn't return value
- **Alternative 1:** Use std::async and std::future
  ```cpp
  auto f = std::async(compute);
  int result = f.get(); // 42
  ```
- **Alternative 2:** Pass output parameter by reference
  ```cpp
  void compute(int& result) { result = 42; }
  int res;
  std::thread t(compute, std::ref(res));
  ```
- **Alternative 3:** Use std::promise/std::future
- **Key Concept:** std::thread discards return values; use std::async or output parameters for results

---

#### Q13
```cpp
void dangerous() {
    int data = 100;
    std::thread t([&data]{
        std::this_thread::sleep_for(std::chrono::seconds(1));
        std::cout << data << "\n";
    });
    t.detach();
}

int main() {
    dangerous();
    std::this_thread::sleep_for(std::chrono::milliseconds(500));
}
```

**Answer:**
```
Undefined behavior (likely crash or garbage output)
```

**Explanation:**
- dangerous() called
- Local variable data = 100 on stack
- Lambda captures data by reference: [&data]
- Thread created, starts executing
- **t.detach(): Thread runs independently**
- dangerous() returns immediately
- **data goes out of scope, destroyed**
- Thread still running, sleeps for 1 second
- After sleep: accesses data
- **data is destroyed:** Dangling reference
- Undefined behavior: likely crash or garbage
- **Classic bug:** Detached thread with reference to local variable
- **Fix:** Capture by value [data] or use heap allocation
- **Key Concept:** Detached threads with dangling references cause undefined behavior; avoid capturing local variables by reference

---

#### Q14
```cpp
std::vector<std::thread> threads;
for (int i = 0; i < 3; ++i) {
    threads.push_back(std::thread([i]{ std::cout << i << "\n"; }));
}
for (auto& t : threads) {
    t.join();
}
```

**Answer:**
```
Compilation error
```

**Explanation:**
- std::thread is move-only (not copyable)
- push_back with temporary: threads.push_back(std::thread(...))
- **Pre-C++17:** May require copy
- **Issue:** std::thread([i]{...}) creates temporary
- push_back tries to move temporary
- **Compilation error in some compilers**
- **C++17 guaranteed copy elision:** Might work
- **Fix 1:** Use emplace_back (constructs in-place)
  ```cpp
  threads.emplace_back([i]{ std::cout << i << "\n"; });
  ```
- **Fix 2:** Explicit move
  ```cpp
  threads.push_back(std::move(std::thread([i]{ ... })));
  ```
- **Key Concept:** Container usage with move-only types requires emplace_back or explicit move

---

#### Q15
```cpp
std::thread t;
if (t.joinable()) {
    std::cout << "Joinable\n";
} else {
    std::cout << "Not joinable\n";
}
```

**Answer:**
```
Not joinable
```

**Explanation:**
- Default constructor: std::thread t
- Creates empty thread object
- No thread of execution started
- t.joinable() returns false
- **Joinable when:**
  - Thread created with callable
  - Not yet joined
  - Not yet detached
- **Not joinable when:**
  - Default-constructed (no thread)
  - Already joined
  - Already detached
  - Moved-from
- Prints "Not joinable"
- **Key Concept:** Default state is not joinable; thread must be created with callable to be joinable

---

#### Q16
```cpp
void worker(std::string msg) {
    std::cout << msg << "\n";
}

int main() {
    std::thread t(worker, "Hello");
    t.join();
}
```

**Answer:**
```
Hello
```

**Explanation:**
- String literal "Hello" passed to thread
- **Argument conversion:** "Hello" converted to std::string
- Thread calls worker(std::string("Hello"))
- Prints "Hello"
- t.join() waits for completion
- **Type conversion handled automatically**
- Works because std::string has constructor from const char*
- **Potential issue:** Conversion happens in thread context
- **Race if passing by reference:** Conversion might happen after main context changes
- **Best practice:** Pass std::string directly for clarity
- **Key Concept:** Argument conversion happens during thread creation; string literals converted to std::string

---

#### Q17
```cpp
int main() {
    unsigned int n = std::thread::hardware_concurrency();
    std::cout << "Cores: " << n << "\n";
}
```

**Answer:**
```
Number of CPU cores (implementation-defined)
```

**Explanation:**
- std::thread::hardware_concurrency() is static function
- Returns number of concurrent threads supported
- **Usually:** Number of CPU cores/hardware threads
- Example: 4-core CPU returns 4
- Example: 8-core with hyperthreading returns 16
- **May return 0:** If value cannot be determined
- **Use case:** Determine optimal thread pool size
- **Not guaranteed:** Implementation-defined
- **Typical formula:** Create N-1 worker threads (reserve 1 for main)
- **Key Concept:** Hardware info query for optimal thread count; implementation-defined hint

---

#### Q18
```cpp
std::thread t([]{ });
t.detach();
if (t.joinable()) {
    std::cout << "Still joinable\n";
} else {
    std::cout << "Not joinable\n";
}
```

**Answer:**
```
Not joinable
```

**Explanation:**
- Thread created with empty lambda
- t.detach() called
- **detach() changes joinable state to false**
- Thread now runs independently
- No longer associated with t
- t.joinable() returns false
- Prints "Not joinable"
- **After detach:**
  - Cannot join
  - Cannot detach again
  - Thread object becomes empty
- **Detached thread:** Still running, but no handle
- **Key Concept:** Detach effect makes thread non-joinable; thread runs independently without handle

---

#### Q19
```cpp
void process(const std::vector<int>& data, int& sum) {
    sum = 0;
    for (int x : data) sum += x;
}

int main() {
    std::vector<int> v = {1, 2, 3};
    int result = 0;
    std::thread t(process, v, std::ref(result));
    t.join();
    std::cout << result << "\n";
}
```

**Answer:**
```
6
```

**Explanation:**
- v = {1, 2, 3} in main
- result = 0
- Thread created: process(v, std::ref(result))
- **v passed by value:** Copy of vector sent to thread
- **result passed by reference:** std::ref(result)
- Thread computes sum: 1 + 2 + 3 = 6
- sum = 0, then sum += 1, sum += 2, sum += 3
- result (reference) updated to 6
- t.join() waits
- result in main now 6
- Prints "6"
- **Mixed semantics:** const ref parameter gets copy, non-const ref needs std::ref
- **Key Concept:** Mixed argument types work; std::ref for output parameters, value for input

---

#### Q20
```cpp
std::thread t1([]{ std::cout << "A\n"; });
std::thread t2(std::move(t1));
std::cout << std::boolalpha << t1.joinable() << " " << t2.joinable() << "\n";
t2.join();
```

**Answer:**
```
false true
A
```

**Explanation:**
- t1 created with lambda
- std::move(t1) transfers ownership to t2
- **After move:**
  - t1 is empty (default-constructed state)
  - t2 owns the thread
- t1.joinable() returns false (empty)
- t2.joinable() returns true (owns thread)
- Prints "false true"
- Lambda executes concurrently, prints "A"
- t2.join() waits for completion
- **Output order may vary:** "false true" might print before or after "A"
- Typical output: "false true\nA\n" or "A\nfalse true\n"
- **Key Concept:** Move ownership transfers thread; moved-from thread becomes empty and not joinable

---
