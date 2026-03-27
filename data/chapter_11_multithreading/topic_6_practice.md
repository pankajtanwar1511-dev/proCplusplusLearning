## TOPIC: Async, Promise, and Future - Asynchronous Task Management

### PRACTICE_TASKS: Output Prediction and Code Analysis

#### Q1
```cpp
auto fut = std::async(std::launch::deferred, []{ return 42; });
std::cout << "Before get\n";
int val = fut.get();
std::cout << "After get: " << val << "\n";

// When does the lambda execute?
```

**Answer:**
```
Lambda executes during fut.get()
```

**Explanation:**
- **std::launch::deferred:** Lazy execution policy
- **Execution timeline:**
  1. async() called with deferred policy
  2. Lambda NOT executed yet
  3. Future object returned immediately
  4. "Before get" printed
  5. **fut.get() called → Lambda executes NOW (synchronously)**
  6. Lambda returns 42
  7. "After get: 42" printed
- **Deferred execution:**
  - Task runs in calling thread (not separate thread)
  - Executes when get() or wait() called
  - **Lazy evaluation pattern**
  - No thread created
- **Contrast with async launch:**
  ```cpp
  auto fut = std::async(std::launch::async, []{ return 42; });
  // Lambda starts immediately in new thread
  ```
- **Use case for deferred:**
  - Expensive computation that might not be needed
  - Want to delay execution decision
  - Avoid thread creation overhead
  - Conditional execution
- **Performance:**
  - No thread overhead
  - Synchronous execution
  - Useful for testing without concurrency
- **Key Concept:** launch::deferred delays execution until get()/wait(); runs synchronously in calling thread

---

#### Q2
```cpp
std::promise<int> prom;
std::future<int> fut = prom.get_future();

prom.set_value(10);
int a = fut.get();
int b = fut.get();

// What happens at the second get()?
```

**Answer:**
```
Throws std::future_error
```

**Explanation:**
- **Future is single-use** - can only call get() once
- **Execution flow:**
  1. Promise created
  2. Future obtained from promise
  3. prom.set_value(10) - value stored in shared state
  4. **First get():** a=10, future consumed
  5. **Second get():** Throws std::future_error
- **Exception details:**
  ```cpp
  catch (const std::future_error& e) {
      // e.code() == std::future_errc::no_state
      // "future already retrieved"
  }
  ```
- **After first get():**
  - Future becomes invalid
  - fut.valid() returns false
  - Shared state extracted
  - Cannot reuse
- **Why single-use:**
  - Move semantics for value
  - Ensures thread safety
  - Clear ownership model
  - Prevents double-retrieval bugs
- **Correct patterns:**

**Pattern 1: Check validity**
  ```cpp
  if (fut.valid()) {
      int a = fut.get();  // Safe
  }
  ```

**Pattern 2: Use shared_future for multiple gets**
  ```cpp
  std::shared_future<int> sf = fut.share();
  int a = sf.get();  // OK
  int b = sf.get();  // OK - shared_future allows multiple gets
  ```

**Pattern 3: Store result**
  ```cpp
  int result = fut.get();
  // Use result multiple times
  int a = result;
  int b = result;
  ```

- **Key Concept:** future is single-use; second get() throws no_state; use shared_future for multiple retrievals

---

#### Q3
```cpp
auto fut = std::async(std::launch::async, []{
    std::this_thread::sleep_for(std::chrono::seconds(2));
    return 100;
});

// fut goes out of scope here

std::cout << "Done\n";

// When does "Done" print?
```

**Answer:**
```
"Done" prints after 2 seconds
```

**Explanation:**
- **Future destructor from std::async is BLOCKING** - critical behavior
- **Execution timeline:**
  1. async() launches task in new thread
  2. Thread starts executing (sleeps 2 seconds)
  3. fut goes out of scope
  4. **Future destructor called**
  5. **Destructor BLOCKS until task completes** (waits 2 seconds)
  6. Task finishes
  7. Destructor completes
  8. "Done" prints
- **Why blocking destructor:**
  - Prevents dangling thread issues
  - Ensures task completion
  - **Special case:** Only futures from std::async block
  - Futures from promise do NOT block in destructor
- **Standard rule (N3777):**
  > If a future obtained from std::async is not moved or bound to a reference, the destructor of the future will block at the end of the full expression until the async finishes executing
- **Surprising behavior example:**
  ```cpp
  void process() {
      std::async(std::launch::async, []{
          std::this_thread::sleep_for(std::chrono::seconds(5));
      });  // Temporary future destroyed here - BLOCKS 5 seconds!
      std::cout << "Done\n";  // Prints after 5 seconds
  }
  ```
- **Non-blocking patterns:**

**Pattern 1: Store future**
  ```cpp
  auto fut = std::async(std::launch::async, []{
      std::this_thread::sleep_for(std::chrono::seconds(2));
  });
  std::cout << "Done\n";  // Prints immediately
  // fut destroyed later (still blocks then)
  ```

**Pattern 2: Detach semantics (workaround)**
  ```cpp
  std::thread([]{
      std::this_thread::sleep_for(std::chrono::seconds(2));
  }).detach();  // Truly non-blocking
  ```

**Pattern 3: Fire and forget**
  ```cpp
  static auto dummy = std::async(std::launch::async, []{ /*...*/ });
  // Stored in static, never destroyed during program
  ```

- **Comparison:**
  ```cpp
  // Async future: Blocks in destructor
  {
      auto fut = std::async([]{ sleep(2); });
  }  // Blocks here for 2 seconds

  // Promise future: Does NOT block
  {
      std::promise<void> p;
      auto fut = p.get_future();
  }  // No blocking
  ```

- **Key Concept:** std::async future destructor blocks until task completes; prevents dangling threads but creates surprising blocking behavior

---

#### Q4
```cpp
std::promise<int> prom;
std::future<int> fut = prom.get_future();

std::thread t([prom = std::move(prom)]() mutable {
    std::this_thread::sleep_for(std::chrono::seconds(1));
    prom.set_value(42);
});

int val = fut.get();
t.join();

// Is this code correct? What is val?
```

**Answer:**
```
Correct, val = 42
```

**Explanation:**
- **Promise-future communication across threads** - correct pattern
- **Step-by-step execution:**
  1. Promise and future created in main thread
  2. Promise **moved** into lambda capture
  3. Thread starts, owns the promise
  4. Main thread calls fut.get() - **blocks**
  5. Thread sleeps 1 second
  6. Thread calls prom.set_value(42)
  7. **Shared state updated**
  8. fut.get() unblocks with value 42
  9. val = 42
  10. t.join() waits for thread (already finished)
- **Why move is necessary:**
  - Promise is move-only (non-copyable)
  - Transfer ownership to thread
  - Thread now responsible for setting value
  ```cpp
  [prom = std::move(prom)]  // Move capture
  ```
- **mutable lambda:**
  - Allows modifying captured promise
  - set_value() modifies promise state
  - Without mutable: compilation error
  ```cpp
  () mutable { prom.set_value(42); }
  ```
- **Shared state:**
  - Promise and future share underlying state
  - set_value() on promise updates shared state
  - get() on future reads shared state
  - Thread-safe by design
- **Alternative: Capture by reference (WRONG)**
  ```cpp
  std::thread t([&prom]() {  // DANGEROUS!
      prom.set_value(42);
  });
  // prom might be destroyed before thread accesses it
  ```
- **Correct patterns:**

**Pattern 1: Move promise (shown above)**
  ```cpp
  std::thread t([prom = std::move(prom)]() mutable { /*...*/ });
  ```

**Pattern 2: Use async instead**
  ```cpp
  auto fut = std::async(std::launch::async, []{
      std::this_thread::sleep_for(std::chrono::seconds(1));
      return 42;
  });
  int val = fut.get();  // Simpler!
  ```

- **Key Concept:** Promise move capture transfers ownership to thread; mutable lambda allows set_value; future blocks until promise fulfills

---

#### Q5
```cpp
auto fut = std::async(std::launch::async, []{
    throw std::runtime_error("Error!");
    return 42;
});

std::this_thread::sleep_for(std::chrono::seconds(1));
// What happens here? Is exception thrown?

int val = fut.get();

// When is the exception thrown?
```

**Answer:**
```
Exception not thrown during sleep
Exception thrown on fut.get()
```

**Explanation:**
- **Exception propagation through futures** - stored and rethrown pattern
- **Execution timeline:**
  1. async() launches task in new thread
  2. Task throws std::runtime_error
  3. **Exception caught by async machinery**
  4. **Exception stored in shared state** (not thrown yet!)
  5. Task terminates
  6. Main thread sleeps 1 second (no exception)
  7. fut.get() called
  8. **Exception rethrown in calling thread**
- **During sleep:**
  - Task already threw exception
  - Exception stored, not propagated
  - Main thread unaware
  - No crash or termination
- **On fut.get():**
  ```cpp
  try {
      int val = fut.get();  // Rethrows stored exception
  } catch (const std::runtime_error& e) {
      std::cout << e.what();  // "Error!"
  }
  ```
- **Shared state holds:**
  - Either: Value (if task succeeds)
  - Or: Exception (if task throws)
  - Or: Nothing (if broken promise)
- **Exception propagation mechanism:**
  ```cpp
  // Conceptual implementation
  try {
      result = task();
      shared_state.set_value(result);
  } catch (...) {
      shared_state.set_exception(std::current_exception());
  }
  ```
- **Multiple get() attempts with exception:**
  ```cpp
  try {
      int a = fut.get();  // Throws
  } catch (...) {}

  int b = fut.get();  // Throws no_state (future already consumed)
  ```
- **Checking for exception without throwing:**
  ```cpp
  fut.wait();  // Waits but doesn't retrieve
  if (fut.valid()) {
      try {
          int val = fut.get();
      } catch (...) {
          // Handle exception
      }
  }
  ```
- **Promise equivalent:**
  ```cpp
  std::promise<int> prom;
  try {
      // ... computation
      prom.set_value(result);
  } catch (...) {
      prom.set_exception(std::current_exception());
  }
  ```
- **Key Concept:** Exceptions in async tasks stored in shared state; rethrown on get(); task termination doesn't propagate exception immediately

---

#### Q6
```cpp
std::future<int> fut;
std::cout << fut.valid() << "\n";

fut = std::async([]{ return 10; });
std::cout << fut.valid() << "\n";

fut.get();
std::cout << fut.valid() << "\n";

// What are the three outputs?
```

**Answer:**
```
0, 1, 0
```

**Explanation:**
- **Future validity states** - tracks whether future has shared state
- **Execution breakdown:**

**Line 1: Default-constructed future**
  ```cpp
  std::future<int> fut;  // No shared state
  std::cout << fut.valid();  // 0 (false)
  ```
  - Default constructor creates invalid future
  - No associated shared state
  - Cannot call get() or wait()

**Line 2: After assignment from async**
  ```cpp
  fut = std::async([]{ return 10; });
  std::cout << fut.valid();  // 1 (true)
  ```
  - async() returns valid future
  - Associated with shared state
  - Can call get() or wait()

**Line 3: After get()**
  ```cpp
  fut.get();  // Retrieves value 10
  std::cout << fut.valid();  // 0 (false)
  ```
  - get() extracts value
  - Future becomes invalid
  - Shared state moved out
  - Cannot reuse

- **Valid vs invalid operations:**

**Valid future can:**
  ```cpp
  if (fut.valid()) {
      fut.get();        // OK
      fut.wait();       // OK
      fut.wait_for(...); // OK
      fut.share();      // OK
  }
  ```

**Invalid future:**
  ```cpp
  if (!fut.valid()) {
      // All operations throw no_state exception:
      fut.get();        // Throws
      fut.wait();       // Throws
      fut.wait_for(...); // Throws
  }
  ```

- **Ways future becomes invalid:**
  1. Default construction
  2. After move-from
  3. After get() called
  4. After share() called (future moved to shared_future)

- **Checking validity:**
  ```cpp
  std::future<int> fut1;               // Invalid
  std::future<int> fut2 = std::async([]{ return 1; }); // Valid
  std::future<int> fut3 = std::move(fut2);  // fut2 invalid, fut3 valid
  int val = fut3.get();                // fut3 becomes invalid
  ```

- **Best practice:**
  ```cpp
  if (fut.valid()) {
      try {
          int val = fut.get();
          // Use val
      } catch (const std::exception& e) {
          // Handle exception
      }
  }
  ```

- **Key Concept:** Future valid() tracks whether it has associated shared state; invalid after default construction, move-from, or get()

---

#### Q7
```cpp
std::promise<int> prom;
std::future<int> fut = prom.get_future();

{
    std::thread t([&prom] {
        std::this_thread::sleep_for(std::chrono::seconds(1));
        prom.set_value(100);
    });
    t.detach();
}

int val = fut.get();

// Is this code safe? What could go wrong?
```

**Answer:**
```
Unsafe: race condition and use-after-scope
```

**Explanation:**
- **Multiple safety issues** - dangerous pattern

**Issue 1: Promise capture by reference with detached thread**
  - Lambda captures prom by reference: `[&prom]`
  - Thread detached: runs independently
  - **prom scope ends when block exits**
  - Detached thread may access destroyed prom
  - **Use-after-scope bug**

**Issue 2: Program termination race**
  - main() might exit before detached thread finishes
  - Detached thread orphaned
  - set_value() never called
  - **fut.get() blocks forever** (if main waits)
  - Or program terminates, thread killed

**Issue 3: Undefined behavior timeline**
  ```
  T0: Thread created, prom captured by reference
  T1: Thread detached
  T2: Block scope ends → prom destroyed
  T3: Thread wakes from sleep
  T4: Thread accesses &prom → DANGLING REFERENCE!
  T5: Undefined behavior (crash/corruption/silent failure)
  ```

- **Correct version 1: Move promise**
  ```cpp
  {
      std::thread t([prom = std::move(prom)]() mutable {
          std::this_thread::sleep_for(std::chrono::seconds(1));
          prom.set_value(100);
      });
      t.detach();
  }
  int val = fut.get();  // Safe: promise moved into thread
  ```

- **Correct version 2: Join instead of detach**
  ```cpp
  {
      std::thread t([&prom] {
          std::this_thread::sleep_for(std::chrono::seconds(1));
          prom.set_value(100);
      });
      t.join();  // Wait for thread - prom still in scope
  }
  int val = fut.get();
  ```

- **Correct version 3: Use async**
  ```cpp
  auto fut = std::async(std::launch::async, [] {
      std::this_thread::sleep_for(std::chrono::seconds(1));
      return 100;
  });
  int val = fut.get();  // No lifetime issues
  ```

- **Correct version 4: Heap-allocated promise**
  ```cpp
  auto prom_ptr = std::make_shared<std::promise<int>>();
  auto fut = prom_ptr->get_future();

  std::thread t([prom_ptr] {  // Shared ownership
      std::this_thread::sleep_for(std::chrono::seconds(1));
      prom_ptr->set_value(100);
  });
  t.detach();

  int val = fut.get();  // Safe: shared_ptr keeps promise alive
  ```

- **General rule:**
  - **Never capture local variables by reference in detached threads**
  - Use move capture or shared_ptr
  - Or don't detach (use join)

- **Key Concept:** Detached thread with reference-captured local variable causes use-after-scope; move capture or join thread to fix

---

#### Q8
```cpp
auto fut = std::async(std::launch::async, []{ return 42; });

if (fut.wait_for(std::chrono::milliseconds(10)) == std::future_status::ready) {
    std::cout << "Ready\n";
} else {
    std::cout << "Not ready\n";
}

int val = fut.get();

// Can we still call get() after wait_for()?
```

**Answer:**
```
Yes, future remains valid after wait_for()
```

**Explanation:**
- **wait_for() is non-destructive** - doesn't consume future
- **Execution flow:**
  1. async() launches task
  2. wait_for(10ms) called
  3. **Waits up to 10ms for task completion**
  4. Returns status (ready/timeout/deferred)
  5. **Future still valid** - not consumed
  6. Can call get() afterward
- **Three possible return values:**
  ```cpp
  enum class future_status {
      ready,     // Task completed
      timeout,   // Timeout elapsed, task not done
      deferred   // Task deferred (launch::deferred)
  };
  ```
- **Typical usage pattern:**
  ```cpp
  auto fut = std::async(std::launch::async, expensive_task);

  // Do other work
  work();

  // Check if result ready
  if (fut.wait_for(0ms) == std::future_status::ready) {
      int result = fut.get();  // No blocking
  } else {
      // Not ready, continue or wait
  }
  ```
- **Difference from get():**
  ```cpp
  fut.get();       // Blocks until ready, CONSUMES future
  fut.wait();      // Blocks until ready, doesn't consume
  fut.wait_for(t); // Waits with timeout, doesn't consume
  fut.wait_until(tp); // Waits until time point, doesn't consume
  ```
- **Multiple waits allowed:**
  ```cpp
  fut.wait_for(10ms);  // Check 1
  fut.wait_for(10ms);  // Check 2
  fut.wait_for(10ms);  // Check 3
  int val = fut.get(); // Still works
  ```
- **Polling pattern:**
  ```cpp
  while (fut.wait_for(100ms) == std::future_status::timeout) {
      std::cout << "Still working...\n";
      update_progress_bar();
  }
  int result = fut.get();  // Now ready
  ```
- **Zero timeout trick (non-blocking check):**
  ```cpp
  if (fut.wait_for(std::chrono::seconds(0)) == std::future_status::ready) {
      // Ready now
  } else {
      // Not ready, don't block
  }
  ```
- **Deferred task behavior:**
  ```cpp
  auto fut = std::async(std::launch::deferred, task);
  auto status = fut.wait_for(1h);  // Always returns deferred!
  // Deferred tasks never become "ready" until forced
  ```
- **Key Concept:** wait_for() checks readiness with timeout without consuming future; get() can still be called afterward

---

#### Q9
```cpp
std::promise<void> prom;
std::future<void> fut = prom.get_future();

std::thread t([prom = std::move(prom)]() mutable {
    std::cout << "Task done\n";
    prom.set_value();
});

fut.get();
std::cout << "Main done\n";
t.join();

// What is the order of output?
```

**Answer:**
```
"Task done"
"Main done"
```

**Explanation:**
- **Promise<void> for signaling** - no value, just notification
- **Synchronization timeline:**
  1. Promise and future created
  2. Thread starts with moved promise
  3. Main thread calls fut.get() - **blocks**
  4. Thread prints "Task done"
  5. Thread calls prom.set_value() - **no argument for void**
  6. **Shared state marked complete**
  7. fut.get() unblocks
  8. Main prints "Main done"
  9. t.join() returns immediately (thread already finished)
- **Output order guaranteed:**
  - "Task done" ALWAYS before "Main done"
  - fut.get() ensures synchronization
  - Happens-before relationship established
- **promise<void> usage:**
  ```cpp
  std::promise<void> p;
  p.set_value();  // No argument!

  std::future<void> f = p.get_future();
  f.get();  // Returns void, just waits
  ```
- **Use case: Signaling events**
  ```cpp
  std::promise<void> ready_signal;
  auto fut = ready_signal.get_future();

  std::thread worker([signal = std::move(ready_signal)]() mutable {
      initialize();
      signal.set_value();  // "I'm ready!"
      do_work();
  });

  fut.get();  // Wait for "ready" signal
  send_request_to_worker();
  worker.join();
  ```
- **Alternative: Condition variable**
  ```cpp
  // More verbose
  std::mutex mtx;
  std::condition_variable cv;
  bool ready = false;

  std::thread t([&] {
      {
          std::lock_guard lock(mtx);
          ready = true;
      }
      cv.notify_one();
  });

  std::unique_lock lock(mtx);
  cv.wait(lock, [&]{ return ready; });
  t.join();

  // vs promise<void> (simpler)
  std::promise<void> prom;
  auto fut = prom.get_future();
  std::thread t([p = std::move(prom)]() mutable { p.set_value(); });
  fut.get();
  t.join();
  ```
- **Difference from boolean flag:**
  ```cpp
  // Atomic flag (no blocking)
  std::atomic<bool> flag(false);
  std::thread t([&]{ flag = true; });
  while (!flag) {}  // Busy-wait (wastes CPU)

  // promise<void> (blocking, efficient)
  std::promise<void> prom;
  auto fut = prom.get_future();
  std::thread t([p = std::move(prom)]() mutable { p.set_value(); });
  fut.get();  // Efficient blocking
  ```
- **Key Concept:** promise<void> for signaling events without data; set_value() takes no argument; future.get() waits for signal

---

#### Q10
```cpp
std::packaged_task<int()> task([]{ return 42; });
std::future<int> fut = task.get_future();

// Task not executed yet

int val = fut.get();

// What happens? Will this block forever?
```

**Answer:**
```
Blocks forever (deadlock)
```

**Explanation:**
- **packaged_task is manual execution** - must be called explicitly
- **What packaged_task does:**
  - Wraps callable (function, lambda, functor)
  - Provides future for result
  - **Does NOT execute automatically**
  - You must invoke it explicitly
- **Timeline (with deadlock):**
  1. packaged_task created with lambda
  2. Future obtained from task
  3. **Task never executed**
  4. fut.get() waits for value
  5. **Waits forever** - no one sets value
  6. Deadlock!
- **Correct usage: Execute the task**
  ```cpp
  std::packaged_task<int()> task([]{ return 42; });
  std::future<int> fut = task.get_future();

  task();  // EXECUTE the task! Returns void

  int val = fut.get();  // Now works, val = 42
  ```
- **Common pattern: Run in thread**
  ```cpp
  std::packaged_task<int()> task([]{ return 42; });
  std::future<int> fut = task.get_future();

  std::thread t(std::move(task));  // Move task into thread
  // Thread executes task automatically

  int val = fut.get();  // Blocks until task completes
  t.join();
  ```
- **packaged_task vs async:**
  ```cpp
  // packaged_task: Manual execution
  std::packaged_task<int()> task(fn);
  auto fut = task.get_future();
  task();  // Must call explicitly

  // async: Automatic execution
  auto fut = std::async(fn);  // Starts automatically (if async)
  ```
- **Use cases for packaged_task:**

**Use case 1: Thread pool**
  ```cpp
  void thread_pool_worker(std::queue<std::packaged_task<void()>>& tasks) {
      while (true) {
          auto task = tasks.pop();
          task();  // Execute task from queue
      }
  }
  ```

**Use case 2: Delayed execution**
  ```cpp
  std::packaged_task<int()> task(expensive_work);
  auto fut = task.get_future();

  // Store task, execute later
  stored_tasks.push_back(std::move(task));

  // ... later
  stored_tasks[0]();  // Execute when ready
  int result = fut.get();
  ```

**Use case 3: Multiple invocations (reset)**
  ```cpp
  std::packaged_task<int()> task(work);
  task.get_future().get();  // First execution

  task.reset();  // Prepare for reuse
  auto fut2 = task.get_future();
  task();  // Execute again
  fut2.get();
  ```

- **Difference from promise:**
  ```cpp
  // packaged_task: Wraps callable
  std::packaged_task<int()> task([]{ return 42; });
  task();  // Executes lambda

  // promise: Manual value setting
  std::promise<int> prom;
  prom.set_value(42);  // Set value directly
  ```

- **Key Concept:** packaged_task requires explicit execution; does not run automatically; fut.get() deadlocks if task never invoked

---

#### Q11
```cpp
std::promise<int> prom;
std::future<int> fut = prom.get_future();

prom.set_value(10);
prom.set_value(20);

// What happens at the second set_value?
```

**Answer:**
```
Throws std::future_error (promise_already_satisfied)
```

**Explanation:**
- **Promise can only be satisfied once** - single-shot mechanism
- **Execution flow:**
  1. Promise created
  2. Future obtained
  3. prom.set_value(10) - **succeeds, promise satisfied**
  4. prom.set_value(20) - **throws exception**
- **Exception details:**
  ```cpp
  try {
      prom.set_value(10);  // OK
      prom.set_value(20);  // Throws
  } catch (const std::future_error& e) {
      // e.code() == std::future_errc::promise_already_satisfied
      std::cout << "Promise already set!\n";
  }
  ```
- **Why single-set:**
  - Future retrieves value once
  - Multiple values would create ambiguity
  - Thread safety guarantee
  - Clear semantics: one result per task
- **What IS allowed:**
  ```cpp
  prom.set_value(10);   // OK
  // XOR
  prom.set_exception(std::make_exception_ptr(ex));  // OK

  // But NOT both!
  ```
- **Common mistake patterns:**

**Mistake 1: Conditional setting without check**
  ```cpp
  std::promise<int> prom;

  if (condition1) {
      prom.set_value(10);
  }
  if (condition2) {
      prom.set_value(20);  // May throw if condition1 was true!
  }
  ```

**Fix: Use else**
  ```cpp
  if (condition1) {
      prom.set_value(10);
  } else if (condition2) {
      prom.set_value(20);  // Safe
  }
  ```

**Mistake 2: Exception + value**
  ```cpp
  try {
      int result = compute();
      prom.set_value(result);
  } catch (...) {
      prom.set_value(-1);  // Throws if exception occurred!
      // Should use set_exception instead
  }
  ```

**Fix: Use set_exception**
  ```cpp
  try {
      int result = compute();
      prom.set_value(result);
  } catch (...) {
      prom.set_exception(std::current_exception());  // Correct
  }
  ```

- **Checking if promise already satisfied:**
  - **No built-in method!**
  - Must track manually:
  ```cpp
  std::promise<int> prom;
  bool satisfied = false;

  if (!satisfied) {
      prom.set_value(10);
      satisfied = true;
  }
  ```

- **For multiple values: Use different pattern**

**Pattern 1: Multiple promises**
  ```cpp
  std::promise<int> prom1, prom2;
  auto fut1 = prom1.get_future();
  auto fut2 = prom2.get_future();

  prom1.set_value(10);
  prom2.set_value(20);
  ```

**Pattern 2: Container in promise**
  ```cpp
  std::promise<std::vector<int>> prom;
  prom.set_value({10, 20, 30});  // Multiple values in vector
  ```

**Pattern 3: Channel/queue**
  ```cpp
  std::queue<int> channel;
  std::mutex mtx;
  // Producer pushes, consumer pops
  ```

- **Key Concept:** Promise can only be satisfied once; second set_value throws promise_already_satisfied; use set_exception XOR set_value

---

#### Q12
```cpp
std::shared_future<int> create_shared() {
    std::promise<int> prom;
    prom.set_value(42);
    return prom.get_future().share();
}

auto sf = create_shared();
int a = sf.get();
int b = sf.get();

// Can we call get() twice on shared_future?
```

**Answer:**
```
Yes, both get() calls succeed, a=42, b=42
```

**Explanation:**
- **shared_future allows multiple get() calls** - unlike regular future
- **Execution flow:**
  1. Promise created and set to 42
  2. Future obtained and converted to shared_future via share()
  3. **First get():** a = 42, shared_future still valid
  4. **Second get():** b = 42, still valid
  5. Both get same value
- **shared_future characteristics:**
  - Multiple get() calls allowed
  - All return same value
  - **Copyable** (unlike future which is move-only)
  - Thread-safe concurrent gets
  - Remains valid after get()
- **future vs shared_future:**
  ```cpp
  // Regular future: Single-use
  std::future<int> fut = ...;
  int a = fut.get();  // OK, fut becomes invalid
  int b = fut.get();  // Throws no_state

  // Shared future: Multi-use
  std::shared_future<int> sf = ...;
  int a = sf.get();   // OK, sf still valid
  int b = sf.get();   // OK, returns same value
  ```
- **Creating shared_future:**

**Method 1: From future**
  ```cpp
  std::future<int> fut = std::async([]{ return 42; });
  std::shared_future<int> sf = fut.share();
  // fut now invalid, sf owns shared state
  ```

**Method 2: Direct from promise**
  ```cpp
  std::promise<int> prom;
  std::shared_future<int> sf = prom.get_future().share();
  ```

**Method 3: Implicit conversion (C++17)**
  ```cpp
  std::shared_future<int> sf = std::async([]{ return 42; });
  ```

- **Use case: Multiple threads reading same result**
  ```cpp
  auto sf = std::async([]{ return expensive_computation(); }).share();

  std::thread t1([sf]{ std::cout << sf.get(); });  // Copy sf
  std::thread t2([sf]{ std::cout << sf.get(); });  // Copy sf
  std::thread t3([sf]{ std::cout << sf.get(); });  // Copy sf

  // All threads get same result
  t1.join(); t2.join(); t3.join();
  ```
- **shared_future is copyable:**
  ```cpp
  std::shared_future<int> sf1 = ...;
  std::shared_future<int> sf2 = sf1;  // Copy OK
  std::shared_future<int> sf3 = sf1;  // Another copy

  int a = sf1.get();  // All three remain valid
  int b = sf2.get();
  int c = sf3.get();
  ```
- **Thread safety:**
  - **Multiple threads can call get() concurrently** - safe
  - All get same value
  - Shared state is thread-safe
  ```cpp
  std::shared_future<int> sf = ...;

  // Multiple threads, no synchronization needed
  std::thread t1([sf]{ int x = sf.get(); });
  std::thread t2([sf]{ int y = sf.get(); });
  // Safe! Both can call get() simultaneously
  ```
- **Performance consideration:**
  - Shared ownership overhead (reference counting)
  - Slightly slower than regular future
  - Worth it when multiple retrievals needed
- **Key Concept:** shared_future allows multiple get() calls and is copyable; enables multiple threads to retrieve same result safely

---

#### Q13
```cpp
auto fut1 = std::async(std::launch::async, []{ return 1; });
auto fut2 = std::move(fut1);

std::cout << fut1.valid() << " " << fut2.valid() << "\n";

// What is the output?
```

**Answer:**
```
0 1
```

**Explanation:**
- **Future is move-only, not copyable** - ownership transfer
- **Step-by-step:**
  1. fut1 created, owns shared state from async
  2. fut1.valid() would be true (if checked)
  3. **fut2 = std::move(fut1)** - ownership transferred
  4. **fut1 now invalid** (moved-from)
  5. **fut2 now valid** (new owner)
  6. Output: "0 1"
- **Move semantics for future:**
  ```cpp
  std::future<int> fut1 = std::async([]{ return 42; });
  // fut1 valid

  std::future<int> fut2 = std::move(fut1);
  // fut1 invalid (moved-from)
  // fut2 valid (new owner)

  // fut1.get();  // Would throw no_state
  int val = fut2.get();  // Works
  ```
- **Why move-only:**
  - Unique ownership of shared state
  - Prevents multiple retrievals
  - Single-use semantics enforced
  - Clear ownership transfer
- **Moved-from future state:**
  ```cpp
  std::future<int> fut1 = ...;
  std::future<int> fut2 = std::move(fut1);

  fut1.valid();      // false
  // fut1.get();     // Throws
  // fut1.wait();    // Throws
  // fut1.share();   // Throws

  fut2.valid();      // true
  fut2.get();        // OK
  ```
- **Common patterns:**

**Pattern 1: Return from function (automatic move)**
  ```cpp
  std::future<int> create_future() {
      return std::async([]{ return 42; });
      // Automatic move, no explicit std::move needed
  }

  auto fut = create_future();  // Moved automatically
  ```

**Pattern 2: Store in container (move required)**
  ```cpp
  std::vector<std::future<int>> futures;
  auto fut = std::async([]{ return 42; });

  futures.push_back(std::move(fut));  // Must move
  // fut now invalid
  ```

**Pattern 3: Transfer ownership**
  ```cpp
  void process(std::future<int> fut) {
      int val = fut.get();
  }

  auto fut = std::async([]{ return 42; });
  process(std::move(fut));  // Transfer ownership to function
  // fut invalid after call
  ```

- **Copy not allowed:**
  ```cpp
  std::future<int> fut1 = std::async([]{ return 42; });
  std::future<int> fut2 = fut1;  // Compilation error!
  // error: use of deleted function
  ```

- **For copyable future: Use shared_future**
  ```cpp
  std::shared_future<int> sf1 = ...;
  std::shared_future<int> sf2 = sf1;  // Copy OK
  ```

- **Checking moved-from state:**
  ```cpp
  auto fut1 = std::async([]{ return 42; });
  auto fut2 = std::move(fut1);

  if (!fut1.valid()) {
      std::cout << "fut1 moved-from\n";
  }
  if (fut2.valid()) {
      std::cout << "fut2 is valid\n";
  }
  ```

- **Key Concept:** Future is move-only; move transfers ownership; moved-from future becomes invalid; use shared_future for copyable semantics

---

#### Q14
```cpp
std::promise<int> prom;
std::future<int> fut = prom.get_future();

std::promise<int> prom2 = std::move(prom);

prom2.set_value(42);
int val = fut.get();

// Does moving the promise affect the future?
```

**Answer:**
```
No effect on future, val = 42
```

**Explanation:**
- **Promise move doesn't invalidate associated future** - shared state persists
- **Execution flow:**
  1. Promise and future created, linked via shared state
  2. Promise moved to prom2
  3. **prom invalid** (moved-from)
  4. **prom2 valid** (new owner)
  5. **fut still valid** (unaffected)
  6. prom2.set_value(42) - updates shared state
  7. fut.get() - retrieves from shared state
  8. val = 42
- **Shared state model:**
  ```
  Promise → Shared State ← Future

  After move:
  prom (invalid)
  prom2 (valid) → Shared State ← fut (still valid)
  ```
- **Promise ownership vs shared state:**
  - Promise owns the "write" side
  - Future owns the "read" side
  - Moving promise transfers write ownership
  - **Doesn't affect read side (future)**
  - Shared state persists
- **What moved promise looks like:**
  ```cpp
  std::promise<int> prom;
  auto fut = prom.get_future();

  std::promise<int> prom2 = std::move(prom);

  // prom is moved-from:
  // prom.set_value(1);    // Throws no_state
  // prom.set_exception(); // Throws no_state
  // prom.get_future();    // Throws no_state

  // prom2 is valid:
  prom2.set_value(42);     // OK

  // fut unaffected:
  int val = fut.get();     // OK, val = 42
  ```
- **Use case: Transferring responsibility**
  ```cpp
  void worker(std::promise<int> prom) {
      // Worker now responsible for fulfilling promise
      int result = expensive_work();
      prom.set_value(result);
  }

  std::promise<int> prom;
  auto fut = prom.get_future();

  std::thread t(worker, std::move(prom));
  // prom moved into thread
  // fut still valid in main thread

  int result = fut.get();
  t.join();
  ```
- **Multiple moves:**
  ```cpp
  std::promise<int> p1;
  auto fut = p1.get_future();

  std::promise<int> p2 = std::move(p1);  // p1 invalid
  std::promise<int> p3 = std::move(p2);  // p2 invalid

  p3.set_value(42);  // Only p3 valid
  int val = fut.get();  // Still works!
  ```
- **Broken promise still applies:**
  ```cpp
  std::promise<int> prom;
  auto fut = prom.get_future();

  {
      std::promise<int> prom2 = std::move(prom);
      // prom2 goes out of scope without setting value
  }  // broken_promise exception stored

  try {
      fut.get();  // Throws broken_promise
  } catch (const std::future_error& e) {}
  ```
- **Key insight:**
  - Promise is handle to shared state
  - Moving promise = moving handle
  - Shared state itself unchanged
  - Future still connected to same shared state
- **Key Concept:** Moving promise transfers write ownership but doesn't invalidate associated future; shared state persists across promise moves

---

#### Q15
```cpp
auto fut = std::async([]{ return 42; });  // Default policy

// Is this guaranteed to run in a separate thread?
```

**Answer:**
```
No guarantee - implementation-defined
```

**Explanation:**
- **Default launch policy is ambiguous** - can be deferred OR async
- **What the standard says:**
  ```cpp
  std::async(fn);  // Equivalent to:
  std::async(std::launch::async | std::launch::deferred, fn);
  ```
  - Implementation chooses
  - May launch thread (async)
  - May defer (lazy)
  - **Non-deterministic behavior**
- **Possible behaviors:**

**Behavior 1: Async execution (actual thread)**
  ```cpp
  auto fut = std::async([]{
      std::cout << "Running in: " << std::this_thread::get_id() << "\n";
      return 42;
  });
  // May print different thread ID
  // Task runs concurrently
  ```

**Behavior 2: Deferred execution (lazy)**
  ```cpp
  auto fut = std::async([]{
      std::cout << "Running in: " << std::this_thread::get_id() << "\n";
      return 42;
  });
  // Task not started yet
  int val = fut.get();  // Runs NOW, same thread ID as caller
  ```

- **Why implementation choice:**
  - Thread creation expensive
  - Implementation can optimize
  - May use thread pool
  - May defer if resources scarce
  - **Trade flexibility for performance**
- **Checking what actually happened:**
  ```cpp
  auto fut = std::async([]{ return 42; });

  auto status = fut.wait_for(std::chrono::seconds(0));
  if (status == std::future_status::deferred) {
      std::cout << "Deferred execution\n";
  } else if (status == std::future_status::ready) {
      std::cout << "Already complete (was async)\n";
  } else {
      std::cout << "Running (async)\n";
  }
  ```
- **Problem with default policy:**

**Issue: Timeout doesn't work with deferred**
  ```cpp
  auto fut = std::async([]{ return 42; });  // May be deferred

  if (fut.wait_for(1s) == std::future_status::timeout) {
      std::cout << "Timed out\n";
  }
  // If deferred: wait_for ALWAYS returns deferred, never timeout!
  // False assumption that task is running
  ```

- **Explicit policy recommended:**

**For guaranteed async (separate thread):**
  ```cpp
  auto fut = std::async(std::launch::async, []{ return 42; });
  // Guaranteed to launch thread
  // May throw if thread creation fails
  ```

**For guaranteed deferred (lazy):**
  ```cpp
  auto fut = std::async(std::launch::deferred, []{ return 42; });
  // Guaranteed lazy execution
  // Runs on fut.get() or fut.wait()
  ```

- **Real-world problems:**
  ```cpp
  // WRONG: Assumes async execution
  void fire_and_forget() {
      std::async([]{ background_work(); });
      // May be deferred!
      // Never calls get(), so never executes!
  }

  // CORRECT: Explicit async
  void fire_and_forget() {
      std::async(std::launch::async, []{ background_work(); });
      // Guaranteed to start
  }
  ```

- **Best practice:**
  ```cpp
  // Always specify policy explicitly
  auto fut1 = std::async(std::launch::async, work);     // Clear intent
  auto fut2 = std::async(std::launch::deferred, work);  // Clear intent

  // Avoid default:
  auto fut3 = std::async(work);  // Ambiguous - avoid
  ```

- **Key Concept:** Default async policy is implementation-defined; may be async or deferred; always specify explicit launch policy for predictable behavior

---

#### Q16
```cpp
std::promise<int> prom;
std::future<int> fut = prom.get_future();

// Promise destroyed without setting value

try {
    int val = fut.get();
} catch (const std::future_error& e) {
    std::cout << "Error\n";
}

// What exception is thrown?
```

**Answer:**
```
future_error with code broken_promise
```

**Explanation:**
- **Broken promise:** Promise destroyed without fulfilling obligation
- **Execution flow:**
  1. Promise created
  2. Future obtained
  3. **Promise goes out of scope** (or explicitly destroyed)
  4. Promise destructor checks: value set?
  5. **No value set** - stores broken_promise exception
  6. fut.get() retrieves exception
  7. **Throws std::future_error(broken_promise)**
- **Exception details:**
  ```cpp
  try {
      int val = fut.get();
  } catch (const std::future_error& e) {
      if (e.code() == std::future_errc::broken_promise) {
          std::cout << "Promise was broken!\n";
      }
      std::cout << e.what() << "\n";  // "broken promise"
  }
  ```
- **When broken promise occurs:**

**Scenario 1: Destruction without set**
  ```cpp
  {
      std::promise<int> prom;
      auto fut = prom.get_future();
      // prom destroyed here without set_value or set_exception
  }  // broken_promise stored
  fut.get();  // Throws
  ```

**Scenario 2: Thread exits early**
  ```cpp
  std::promise<int> prom;
  auto fut = prom.get_future();

  std::thread t([prom = std::move(prom)]() mutable {
      if (early_exit_condition) {
          return;  // Promise not set!
      }
      prom.set_value(42);
  });

  t.join();
  fut.get();  // May throw broken_promise if early exit
  ```

**Scenario 3: Exception in thread**
  ```cpp
  std::thread t([prom = std::move(prom)]() mutable {
      throw std::runtime_error("Error");
      prom.set_value(42);  // Never reached
  });  // Promise destroyed when thread terminates

  fut.get();  // Throws broken_promise
  ```

- **Why this mechanism:**
  - Prevents indefinite blocking
  - Future waiting would hang forever
  - Broken promise signals "no value coming"
  - Better than deadlock
- **Correct patterns:**

**Pattern 1: Ensure all paths set value**
  ```cpp
  void worker(std::promise<int> prom) {
      try {
          int result = risky_computation();
          prom.set_value(result);
      } catch (...) {
          prom.set_exception(std::current_exception());  // Important!
      }
  }
  ```

**Pattern 2: RAII helper**
  ```cpp
  struct PromiseGuard {
      std::promise<int>& prom;
      bool satisfied = false;

      ~PromiseGuard() {
          if (!satisfied) {
              prom.set_exception(
                  std::make_exception_ptr(std::runtime_error("Failed"))
              );
          }
      }
  };

  void worker(std::promise<int> prom) {
      PromiseGuard guard{prom};
      int result = work();
      prom.set_value(result);
      guard.satisfied = true;
  }
  ```

**Pattern 3: Use async instead**
  ```cpp
  // async handles exceptions automatically
  auto fut = std::async([]{
      return risky_work();  // Exceptions caught and stored
  });
  ```

- **Checking for broken promise:**
  ```cpp
  try {
      int val = fut.get();
      std::cout << "Got value: " << val << "\n";
  } catch (const std::future_error& e) {
      if (e.code() == std::future_errc::broken_promise) {
          std::cout << "Promise was never fulfilled\n";
      } else {
          std::cout << "Other future error\n";
      }
  } catch (const std::exception& e) {
      std::cout << "Task threw: " << e.what() << "\n";
  }
  ```

- **Key Concept:** Promise destruction without set_value/set_exception stores broken_promise exception; fut.get() throws future_error to prevent deadlock

---

#### Q17
```cpp
std::future<int> create_future() {
    return std::async(std::launch::deferred, []{ return 42; });
}

auto fut = create_future();
std::cout << "After create\n";
int val = fut.get();
std::cout << "After get: " << val << "\n";

// When does the task execute?
```

**Answer:**
```
Task executes during fut.get() call
```

**Explanation:**
- **Deferred execution with function return** - lazy evaluation preserved
- **Timeline:**
  1. create_future() called
  2. async(launch::deferred) creates task
  3. **Task NOT executed** yet
  4. Future returned from function
  5. "After create" printed
  6. fut.get() called
  7. **Task executes NOW** (synchronously in calling thread)
  8. Lambda returns 42
  9. "After get: 42" printed
- **Deferred semantic preserved across function boundaries:**
  - Deferred future can be returned
  - Execution still deferred
  - Runs when eventual get()/wait() called
  - **Location doesn't matter**
- **Use case: Lazy initialization**
  ```cpp
  std::future<ExpensiveObject> lazy_init() {
      return std::async(std::launch::deferred, [] {
          return ExpensiveObject{};  // Not created yet
      });
  }

  auto fut = lazy_init();  // Cheap
  // ... do other work

  auto obj = fut.get();  // NOW create expensive object
  ```
- **Difference from async launch:**
  ```cpp
  std::future<int> create_future_async() {
      return std::async(std::launch::async, []{ return 42; });
      // Task ALREADY started in background thread
  }

  auto fut = create_future_async();  // Task running now
  std::cout << "After create\n";     // Task may finish before this
  int val = fut.get();                // May not block (already ready)
  ```
- **Chaining deferred computations:**
  ```cpp
  auto fut1 = std::async(std::launch::deferred, step1);
  auto fut2 = std::async(std::launch::deferred, [fut1 = std::move(fut1)]() mutable {
      return step2(fut1.get());  // step1 runs here
  });
  auto fut3 = std::async(std::launch::deferred, [fut2 = std::move(fut2)]() mutable {
      return step3(fut2.get());  // step1 and step2 run here
  });

  // All three steps run when:
  int result = fut3.get();  // Now all execute in order
  ```
- **Conditional execution:**
  ```cpp
  auto optional_work = std::async(std::launch::deferred, expensive_task);

  if (need_result) {
      int result = optional_work.get();  // Only executes if needed
  } else {
      // expensive_task never runs - saved computation
  }
  ```
- **Testing benefit:**
  ```cpp
  // Deferred = no concurrency = easier to debug
  auto fut = std::async(std::launch::deferred, work);
  // Runs synchronously, deterministic execution
  ```
- **Key Concept:** Deferred task execution preserved across function returns; task runs on get()/wait() regardless of where future was created; enables lazy evaluation pattern

---

#### Q18
```cpp
std::promise<int> prom;
std::future<int> fut = prom.get_future();

try {
    prom.set_exception(std::make_exception_ptr(std::runtime_error("Error")));
    int val = fut.get();
} catch (const std::runtime_error& e) {
    std::cout << "Caught: " << e.what() << "\n";
}

// What is the output?
```

**Answer:**
```
"Caught: Error"
```

**Explanation:**
- **Manual exception propagation** - set_exception instead of set_value
- **Execution flow:**
  1. Promise and future created
  2. **set_exception called** with runtime_error
  3. Exception stored in shared state
  4. fut.get() called
  5. **Exception rethrown from get()**
  6. Catch block catches runtime_error
  7. Prints "Caught: Error"
- **set_exception usage:**
  ```cpp
  std::promise<int> prom;

  try {
      int result = risky_work();
      prom.set_value(result);
  } catch (...) {
      // Capture current exception
      prom.set_exception(std::current_exception());
  }
  ```
- **Creating exception_ptr:**

**Method 1: From current exception**
  ```cpp
  try {
      throw std::runtime_error("Error");
  } catch (...) {
      auto ex_ptr = std::current_exception();
      prom.set_exception(ex_ptr);
  }
  ```

**Method 2: Make explicitly**
  ```cpp
  auto ex_ptr = std::make_exception_ptr(std::runtime_error("Error"));
  prom.set_exception(ex_ptr);
  ```

- **Why set_exception vs throw:**
  ```cpp
  // WRONG: Throw in thread doesn't propagate
  std::thread t([&prom] {
      throw std::runtime_error("Error");  // Terminates program!
  });

  // CORRECT: Store exception in promise
  std::thread t([&prom] {
      try {
          throw std::runtime_error("Error");
      } catch (...) {
          prom.set_exception(std::current_exception());
      }
  });
  ```
- **Multiple exception types:**
  ```cpp
  try {
      prom.set_exception(std::make_exception_ptr(std::runtime_error("A")));
      int val = fut.get();
  } catch (const std::runtime_error& e) {
      // Catches runtime_error
  } catch (const std::logic_error& e) {
      // Would catch logic_error if that was set
  } catch (const std::exception& e) {
      // Catches any std::exception
  } catch (...) {
      // Catches anything
  }
  ```
- **Exception XOR value:**
  ```cpp
  std::promise<int> prom;

  // Either:
  prom.set_value(42);
  // OR:
  prom.set_exception(std::make_exception_ptr(ex));

  // But NOT both! (second call throws promise_already_satisfied)
  ```
- **Use case: Error propagation across threads**
  ```cpp
  std::promise<DatabaseResult> prom;
  auto fut = prom.get_future();

  std::thread db_thread([prom = std::move(prom)]() mutable {
      try {
          auto result = database_query();
          prom.set_value(result);
      } catch (const DatabaseError& e) {
          prom.set_exception(std::current_exception());
      } catch (const NetworkError& e) {
          prom.set_exception(std::current_exception());
      } catch (...) {
          prom.set_exception(std::current_exception());
      }
  });

  try {
      auto result = fut.get();  // May throw DatabaseError or NetworkError
      process(result);
  } catch (const DatabaseError& e) {
      handle_db_error(e);
  } catch (const NetworkError& e) {
      handle_network_error(e);
  }

  db_thread.join();
  ```
- **Key Concept:** set_exception stores exception in shared state; fut.get() rethrows it; enables exception propagation across thread boundaries

---

#### Q19
```cpp
std::vector<std::future<int>> futures;

for (int i = 0; i < 5; ++i) {
    futures.push_back(std::async(std::launch::async, [i]{ return i * 2; }));
}

for (auto& fut : futures) {
    std::cout << fut.get() << " ";
}

// What is the output pattern?
```

**Answer:**
```
0 2 4 6 8 (in order, but tasks may run in parallel)
```

**Explanation:**
- **Parallel task collection pattern** - common async use case
- **Execution timeline:**
  1. Loop 1: Create 5 async tasks
     - All tasks launched simultaneously
     - **Run in parallel** (5 threads)
     - Tasks compute 0, 2, 4, 6, 8
  2. Loop 2: Retrieve results
     - fut.get() blocks until task completes
     - **Results printed in order** (0 2 4 6 8)
     - Even though tasks may finish in different order
- **Parallel execution:**
  ```
  Time: 0ms    100ms   200ms
  Task0: [====] done
  Task1:   [====] done
  Task2:     [====] done
  Task3:   [====] done
  Task4: [====] done

  All run concurrently!
  ```
- **Output always ordered:**
  - Loop iterates futures in order (0-4)
  - get() on futures[0] returns 0
  - get() on futures[1] returns 2
  - etc.
  - **Output order guaranteed by loop order**
  - Not by task completion order
- **What if task 3 finishes first:**
  ```
  Timeline:
  - Task 3 finishes first (computes 6)
  - Task 0 finishes second (computes 0)
  - Task 1,2,4 finish after

  Output still: "0 2 4 6 8"
  - Because we get() futures in order: futures[0], futures[1], ...
  ```
- **Blocking behavior:**
  ```cpp
  for (auto& fut : futures) {
      // If this task not done, blocks here
      std::cout << fut.get() << " ";
  }
  ```
  - If futures[2] still running when we reach it: blocks
  - Waits for completion
  - Then proceeds

- **Pattern: Parallel map:**
  ```cpp
  template<typename Func, typename Range>
  auto parallel_map(Func f, Range& inputs) {
      std::vector<std::future<decltype(f(inputs[0]))>> futures;

      // Launch all tasks
      for (auto& input : inputs) {
          futures.push_back(std::async(std::launch::async, f, input));
      }

      // Collect results
      std::vector<decltype(f(inputs[0]))> results;
      for (auto& fut : futures) {
          results.push_back(fut.get());
      }

      return results;
  }

  // Usage
  std::vector<int> inputs = {1, 2, 3, 4, 5};
  auto results = parallel_map([](int x){ return x * 2; }, inputs);
  // results = {2, 4, 6, 8, 10}
  ```

- **Performance consideration:**
  ```cpp
  // Sequential
  for (int i = 0; i < 5; ++i) {
      std::cout << expensive_work(i) << " ";
  }
  // Time: 5 * T

  // Parallel with async
  std::vector<std::future<int>> futures;
  for (int i = 0; i < 5; ++i) {
      futures.push_back(std::async(std::launch::async, expensive_work, i));
  }
  for (auto& fut : futures) {
      std::cout << fut.get() << " ";
  }
  // Time: ~T (if 5+ cores available)
  ```

- **Task completion order vs result order:**
  ```cpp
  auto fut0 = std::async([]{ sleep(3); return 0; });
  auto fut1 = std::async([]{ sleep(1); return 1; });
  auto fut2 = std::async([]{ sleep(2); return 2; });

  // Completion order: 1, 2, 0 (by sleep time)
  // But get() order: 0, 1, 2 (by future order)
  std::cout << fut0.get() << " ";  // Waits 3s
  std::cout << fut1.get() << " ";  // Returns immediately (already done)
  std::cout << fut2.get() << " ";  // Returns immediately (already done)
  // Output: "0 1 2"
  ```

- **Key Concept:** Vector of futures enables parallel task execution; get() retrieves results in loop order regardless of task completion order

---

#### Q20
```cpp
std::promise<int> prom;
std::future<int> fut = prom.get_future();

std::thread t([&prom] {
    prom.set_value(42);
    prom.set_value(100);  // Second set
});

t.join();
int val = fut.get();

// What happens in the thread?
```

**Answer:**
```
Thread throws future_error (promise_already_satisfied)
Likely terminates program
```

**Explanation:**
- **Unhandled exception in thread** - program termination
- **Execution flow:**
  1. Thread starts
  2. prom.set_value(42) succeeds
  3. **prom.set_value(100) throws std::future_error**
  4. **Exception uncaught in thread**
  5. **std::terminate() called**
  6. **Program terminates**
  7. Main thread never reaches fut.get()
- **Why program terminates:**
  - Thread throws exception
  - No catch block in thread
  - **Uncaught exception in thread = std::terminate()**
  - Not propagated to main thread
  - Immediate abnormal termination
- **What std::terminate does:**
  ```
  terminate called after throwing an instance of 'std::future_error'
    what():  Promise already satisfied
  Aborted (core dumped)
  ```
  - Calls std::terminate()
  - Calls terminate handler (default: abort())
  - **Program immediately exits**
  - Destructors may not run
  - No graceful shutdown
- **Correct pattern: Catch exceptions in thread**
  ```cpp
  std::thread t([&prom] {
      try {
          prom.set_value(42);
          prom.set_value(100);  // Throws
      } catch (const std::future_error& e) {
          std::cerr << "Error: " << e.what() << "\n";
          // Don't set exception again - already set value
      } catch (...) {
          // Catch any exception
          try {
              prom.set_exception(std::current_exception());
          } catch (...) {
              // set_exception might also throw if already satisfied
          }
      }
  });
  ```
- **Safe promise wrapper:**
  ```cpp
  struct SafePromise {
      std::promise<int> prom;
      std::atomic<bool> satisfied{false};

      void try_set_value(int val) {
          if (!satisfied.exchange(true)) {
              try {
                  prom.set_value(val);
              } catch (...) {
                  satisfied = false;
              }
          }
      }

      void try_set_exception(std::exception_ptr ex) {
          if (!satisfied.exchange(true)) {
              try {
                  prom.set_exception(ex);
              } catch (...) {
                  satisfied = false;
              }
          }
      }
  };
  ```
- **General thread exception handling:**
  ```cpp
  std::thread t([] {
      try {
          // Thread work
          risky_operation();
      } catch (const std::exception& e) {
          std::cerr << "Thread exception: " << e.what() << "\n";
      } catch (...) {
          std::cerr << "Unknown thread exception\n";
      }
  });
  // Always join or detach
  t.join();
  ```
- **Why not propagate thread exceptions automatically:**
  - Threads run asynchronously
  - Main thread may be elsewhere
  - No obvious place to rethrow
  - **Must use promise/future for exception propagation**
- **Correct exception propagation:**
  ```cpp
  std::promise<int> prom;
  auto fut = prom.get_future();

  std::thread t([prom = std::move(prom)]() mutable {
      try {
          int result = risky_work();
          prom.set_value(result);
      } catch (...) {
          prom.set_exception(std::current_exception());
      }
  });

  try {
      int val = fut.get();  // May rethrow exception
  } catch (const std::exception& e) {
      std::cerr << "Caught from thread: " << e.what() << "\n";
  }

  t.join();
  ```
- **Key Concept:** Second set_value throws promise_already_satisfied; uncaught exception in thread calls std::terminate; always wrap thread code in try-catch

---
