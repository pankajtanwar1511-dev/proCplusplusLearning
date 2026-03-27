## TOPIC: Atomics and Memory Ordering - Lock-Free Programming Fundamentals

### PRACTICE_TASKS: Output Prediction and Code Analysis

#### Q1
```cpp
std::atomic<int> x(0);

void thread1() {
    x.store(1, std::memory_order_relaxed);
}

void thread2() {
    int val = x.load(std::memory_order_relaxed);
    if (val == 1) {
        std::cout << "Saw 1\n";
    }
}

// What is guaranteed about the output?
```

**Answer:**
```
Thread2 may or may not print "Saw 1"
```

**Explanation:**
- **memory_order_relaxed:** Weakest memory ordering
- **No inter-thread synchronization guarantees**
- **What relaxed provides:**
  - Atomicity of individual operation
  - Modification order consistency (all threads see same order of changes to x)
  - NO ordering with other operations
- **Possible scenarios:**
  1. Thread1 stores before thread2 loads: Sees 1 (prints)
  2. Thread2 loads before thread1 stores: Sees 0 (no print)
  3. Compiler/CPU may reorder: Load might never see store
- **No "happens-before" relationship**
- **Visibility not guaranteed:** Thread2 might cache old value indefinitely
- **Modification order:** If multiple stores, all threads see same final sequence
- **But timing:** When each thread observes changes is unspecified
- **Not a bug - by design:** Relaxed is for counters where order doesn't matter
- **Use case:** Performance-critical code where only atomicity needed, not ordering
- **Key Concept:** memory_order_relaxed provides atomicity but no inter-thread visibility or ordering guarantees

---

#### Q2
```cpp
std::atomic<bool> ready(false);
int data = 0;

void writer() {
    data = 42;
    ready.store(true, std::memory_order_relaxed);
}

void reader() {
    while (!ready.load(std::memory_order_relaxed)) {}
    assert(data == 42);
}

// Will the assertion always pass? Why or why not?
```

**Answer:**
```
No, assertion may fail
```

**Explanation:**
- **Classic data race pattern** with relaxed atomics
- **Problem: No synchronization between threads**
- **What can go wrong:**
  1. Writer sets data=42
  2. Writer sets ready=true (relaxed)
  3. Reader sees ready=true
  4. **But reader might still see data=0!**
- **Reordering issues:**
  - **Compiler reordering:** Compiler may reorder `data=42` after `ready.store(true)`
  - **CPU reordering:** CPU may execute/commit in different order
  - **Cache coherency delays:** data=42 write may not reach reader's cache
- **Relaxed stores don't synchronize non-atomic data**
- **Reader spin-waits on ready** but:
  - No guarantee data write visible when ready becomes true
  - ready=true only means ready itself changed
  - Doesn't establish happens-before relationship
- **Correct version: Use release-acquire**
  ```cpp
  void writer() {
      data = 42;
      ready.store(true, std::memory_order_release);  // Release
  }

  void reader() {
      while (!ready.load(std::memory_order_acquire)) {}  // Acquire
      assert(data == 42);  // Now guaranteed!
  }
  ```
- **Release-acquire creates synchronization:**
  - Release: All prior writes visible to acquirer
  - Acquire: All writes before release are visible
  - **Happens-before relationship established**
- **Rule:** Relaxed atomics don't synchronize non-atomic data
- **Key Concept:** memory_order_relaxed insufficient for synchronizing non-atomic data; need release-acquire

---

#### Q3
```cpp
std::atomic<int> counter(10);

void increment() {
    int expected = counter.load();
    counter.compare_exchange_strong(expected, expected + 1);
}

// If called by 100 threads once each, what is counter's final value?
```

**Answer:**
```
Likely around 11-20, not 110
```

**Explanation:**
- **compare_exchange_strong without loop** - classic mistake
- **CAS (Compare-And-Swap) operation:**
  - Checks if counter == expected
  - If yes: Sets counter = expected+1, returns true
  - If no: Updates expected to current value, returns false
- **What happens with 100 threads:**
  1. All 100 threads load counter=10 into expected
  2. All call compare_exchange_strong(10, 11)
  3. **Only ONE succeeds** (first one to execute)
  4. That thread sets counter=11
  5. **Other 99 fail** (counter now 11, not 10)
  6. Failed threads update expected=11 but **don't retry**
  7. They just exit without incrementing
- **Result: counter=11** (only one increment succeeded)
- **Actual result:** Possibly 11-20 if some threads retry naturally from code restart, but nowhere near 110
- **Correct pattern: CAS loop**
  ```cpp
  void increment() {
      int expected = counter.load();
      while (!counter.compare_exchange_strong(expected, expected + 1)) {
          // expected updated automatically on failure
      }
  }
  ```
- **Why loop needed:**
  - First CAS might fail due to contention
  - expected gets updated to current value
  - Loop retries with new expected
  - Eventually succeeds
- **Alternative: Use fetch_add**
  ```cpp
  counter.fetch_add(1);  // Simpler, always works
  ```
- **CAS is for complex atomic updates:**
  - Update depends on current value in non-trivial way
  - Read-modify-write pattern
- **Key Concept:** CAS without loop only succeeds once under contention; must loop on failure to retry

---

#### Q4
```cpp
std::atomic<int> val(0);

void thread1() {
    val.store(1, std::memory_order_release);
}

void thread2() {
    while (val.load(std::memory_order_acquire) == 0) {}
    std::cout << "Done\n";
}

// Is this correct for synchronization? Explain.
```

**Answer:**
```
Yes, correct
```

**Explanation:**
- **Release-acquire synchronization** - the correct pattern
- **memory_order_release (thread1):**
  - All memory writes before the release store are visible
  - Creates a "release fence"
  - Prevents reordering of prior writes past this point
- **memory_order_acquire (thread2):**
  - All memory writes from release are now visible
  - Creates an "acquire fence"
  - Prevents reordering of subsequent reads before this point
- **Synchronization established:**
  1. Thread1 does work (writes to memory)
  2. Thread1 stores val=1 with release
  3. Thread2 spins, loading with acquire
  4. When thread2 sees val=1:
     - **All of thread1's prior work is visible**
     - Happens-before relationship established
- **Ordering guarantees:**
  - Thread1: Operations before release stay before
  - Thread2: Operations after acquire stay after
  - Release "publishes" all prior work
  - Acquire "subscribes" to published work
- **Example use case:**
  ```cpp
  // Thread1
  data1 = 100;
  data2 = 200;
  val.store(1, std::memory_order_release);  // Publishes data1, data2

  // Thread2
  while (val.load(std::memory_order_acquire) == 0) {}
  std::cout << data1 << data2;  // Guaranteed to see 100, 200
  ```
- **Lighter than sequential consistency:**
  - More efficient than seq_cst
  - Provides necessary guarantees
  - Common pattern for producer-consumer
- **Key Concept:** Release-acquire pair provides synchronization; release publishes all prior work, acquire sees published work

---

#### Q5
```cpp
std::atomic_flag flag = ATOMIC_FLAG_INIT;

void thread1() {
    bool was_set = flag.test_and_set();
    std::cout << was_set << "\n";
}

void thread2() {
    flag.clear();
}

// What are the possible outputs?
```

**Answer:**
```
0 or 1 depending on timing
```

**Explanation:**
- **atomic_flag:** Simplest atomic type
- **ATOMIC_FLAG_INIT:** Initializes flag to clear (false) state
- **test_and_set():**
  - Atomically sets flag to true
  - Returns previous value (before setting)
- **clear():**
  - Atomically sets flag to false
- **Possible execution scenarios:**

**Scenario 1: Thread1 runs first**
  1. flag initially clear (false)
  2. Thread1 calls test_and_set()
  3. Returns previous value: false (0)
  4. Sets flag to true
  5. Output: "0"

**Scenario 2: Thread2 then Thread1**
  1. flag initially clear
  2. Thread2 calls clear() (flag stays false)
  3. Thread1 calls test_and_set()
  4. Returns previous value: false (0)
  5. Output: "0"

**Scenario 3: Thread1, then Thread1 again (if called twice)**
  1. First test_and_set() returns false (0)
  2. Flag now true
  3. Second test_and_set() returns true (1)
  4. Output: "1" (second call)

**Scenario 4: Interleaved**
  - If Thread1 runs, sets flag true
  - Then Thread1 runs AGAIN before Thread2 clears
  - Returns true (1)
  - Output: "1"

- **Most common outputs:**
  - **"0"** - First time setting from clear state
  - **"1"** - Setting from already-set state
- **Depends on scheduling and timing**
- **atomic_flag use case: Spinlock**
  ```cpp
  // Spinlock acquire
  while (flag.test_and_set(std::memory_order_acquire)) {}

  // Critical section

  // Spinlock release
  flag.clear(std::memory_order_release);
  ```
- **Key Concept:** test_and_set() returns previous state and sets to true atomically; output depends on flag state when called

---

#### Q6
```cpp
std::atomic<int> x(0), y(0);

void thread1() {
    x.store(1, std::memory_order_seq_cst);
    y.store(1, std::memory_order_seq_cst);
}

void thread2() {
    while (y.load(std::memory_order_seq_cst) == 0) {}
    assert(x.load(std::memory_order_seq_cst) == 1);
}

// Will the assertion ever fail? Why or why not?
```

**Answer:**
```
Never fails
```

**Explanation:**
- **Sequential consistency (seq_cst):** Strongest memory ordering
- **Guarantees:**
  1. **Total global order:** All threads see all seq_cst operations in same order
  2. **Program order:** Operations within thread execute in code order
  3. **No reordering:** Compiler/CPU cannot reorder seq_cst operations
- **Thread1 execution order (guaranteed):**
  1. x.store(1) completes
  2. Then y.store(1) completes
  3. **Order preserved by seq_cst**
- **Thread2 observation:**
  1. Spins until y==1 (y.load returns 1)
  2. When y==1 is observed:
     - **By seq_cst guarantee:** x.store(1) already completed
     - **By program order:** x stored before y in thread1
     - **By total order:** All threads see same order
  3. assert(x==1) **MUST pass**
- **Why assertion can't fail:**
  - **Causality:** y=1 happens-after x=1 in thread1
  - **Seq_cst synchronization:** Thread2 sees consistent global view
  - **No way for y==1 to be visible before x==1**
- **With relaxed, assertion COULD fail:**
  ```cpp
  // Relaxed version (WRONG)
  x.store(1, std::memory_order_relaxed);
  y.store(1, std::memory_order_relaxed);
  // Thread2 might see y==1 but x==0 due to reordering
  ```
- **Seq_cst performance cost:**
  - Expensive: Full memory barriers
  - Prevents CPU/compiler optimizations
  - But provides strongest guarantees
- **Use when:**
  - Need total global order
  - Correctness more important than performance
- **Key Concept:** Sequential consistency provides total global order; if thread sees later operation, it must see all prior operations in program order

---

#### Q7
```cpp
std::atomic<int*> ptr(nullptr);
int data = 42;

void thread1() {
    ptr.store(&data);
}

void thread2() {
    int* p = ptr.load();
    if (p != nullptr) {
        std::cout << *p << "\n";
    }
}

// Is this code safe? What could go wrong?
```

**Answer:**
```
Unsafe: data lifetime issue
```

**Explanation:**
- **Multiple safety issues in this code**

**Issue 1: Lifetime/scope problem**
  - data is local variable (if in function scope)
  - Storing &data in atomic ptr
  - **If data goes out of scope:** ptr points to destroyed object
  - **Dangling pointer** when thread2 dereferences
  - **Undefined behavior**

**Issue 2: No memory ordering guarantees**
  - ptr.store(&data) and ptr.load() use default seq_cst
  - **But what about data initialization?**
  - If data initialization happens separately:
    ```cpp
    int data;
    data = 42;  // Non-atomic write
    ptr.store(&data);  // Atomic store
    ```
  - Without proper ordering, thread2 might see ptr!=nullptr but data uninitialized

**Issue 3: ABA problem (if ptr is reused)**
  - Thread1 stores &data1
  - Thread2 loads, starts dereferencing
  - Thread1 stores &data2 (different object, same address)
  - Thread2 still dereferencing old data1
  - **Use-after-free potential**

**Correct version 1: Static/heap memory**
  ```cpp
  static int data = 42;  // Static lifetime
  ptr.store(&data);  // Safe: data never destroyed
  ```

**Correct version 2: Heap allocation with ownership**
  ```cpp
  int* data = new int(42);
  ptr.store(data, std::memory_order_release);

  // Thread2
  int* p = ptr.load(std::memory_order_acquire);
  if (p) {
      std::cout << *p << "\n";
      // Need ownership protocol to delete safely
  }
  ```

**Correct version 3: shared_ptr**
  ```cpp
  std::shared_ptr<int> data = std::make_shared<int>(42);
  std::atomic<std::shared_ptr<int>> ptr(data);

  // Thread2
  auto p = ptr.load();  // Ref count incremented
  if (p) {
      std::cout << *p << "\n";  // Safe: p keeps data alive
  }
  ```

- **Pointer atomics are tricky:**
  - Atomic only controls pointer itself
  - Doesn't protect pointed-to data
  - Doesn't manage lifetime
- **Key Concept:** Atomic pointers don't manage pointed-to object lifetime; need separate lifetime management (static, heap, shared_ptr)

---

#### Q8
```cpp
std::atomic<int> counter(0);

void worker() {
    for (int i = 0; i < 1000; ++i) {
        int expected = counter.load();
        while (!counter.compare_exchange_weak(expected, expected + 1));
    }
}

// Why is the loop necessary?
```

**Answer:**
```
CAS may fail spuriously or due to contention
```

**Explanation:**
- **compare_exchange_weak:** Weaker but faster than strong
- **Two reasons for CAS failure:**

**Reason 1: Contention (genuine failure)**
  1. Thread A loads counter=0 into expected
  2. Thread B modifies counter to 1
  3. Thread A calls compare_exchange_weak(0, 1)
  4. **Fails:** counter(1) != expected(0)
  5. expected updated to 1 automatically
  6. **Must retry with new expected**

**Reason 2: Spurious failure (weak-specific)**
  - compare_exchange_**weak** can fail even if counter==expected
  - **Allowed by C++ standard**
  - Happens on architectures with LL/SC (Load-Link/Store-Conditional)
  - Example: ARM, PowerPC, RISC-V
  - **LL/SC can fail due to context switch or cache line eviction**
  - Not a bug - performance optimization
  - **More efficient in loop than strong version**

- **Why loop is essential:**
  ```cpp
  int expected = counter.load();  // Load once
  while (!counter.compare_exchange_weak(expected, expected + 1)) {
      // Retry until success
      // expected automatically updated on each failure
  }
  ```

- **Without loop (WRONG):**
  ```cpp
  int expected = counter.load();
  counter.compare_exchange_weak(expected, expected + 1);
  // Might fail, increment lost!
  ```

- **compare_exchange_strong vs weak:**
  - **strong:** Never fails spuriously, but slower
    ```cpp
    // Single attempt might work
    int expected = counter.load();
    if (counter.compare_exchange_strong(expected, expected + 1)) {
        // Success
    } else {
        // Genuine failure
    }
    ```
  - **weak:** Can fail spuriously, but faster in loops
    ```cpp
    // Must loop
    int expected = counter.load();
    while (!counter.compare_exchange_weak(expected, expected + 1));
    ```

- **When to use which:**
  - **Use weak + loop:** Almost always (faster)
  - **Use strong:** When single CAS attempt (rare)

- **Performance in loop:**
  - Weak: Each attempt faster, but might retry more
  - Strong: Each attempt slower, but fewer retries
  - **In practice: weak wins in loops**

- **expected update is automatic:**
  - On failure, expected set to current counter value
  - No need to reload manually

- **Key Concept:** compare_exchange_weak can fail spuriously; must loop until success, expected automatically updated on failure

---

#### Q9
```cpp
volatile int counter = 0;

void increment() {
    ++counter;  // 10 threads call this
}

// What is the problem with this code?
```

**Answer:**
```
Race condition, not atomic
```

**Explanation:**
- **volatile != atomic** - critical misconception
- **What volatile actually does:**
  - Prevents compiler optimizations (caching in register)
  - Forces read from memory on each access
  - Forces write to memory on each update
  - **DOES NOT provide atomicity**
  - **DOES NOT prevent data races**
- **What ++counter actually is:**
  ```cpp
  // ++counter decomposes to:
  temp = counter;  // Read
  temp = temp + 1;  // Modify
  counter = temp;  // Write
  ```
- **Race condition with 10 threads:**
  ```
  Time | Thread A         | Thread B         | counter
  -----|------------------|------------------|--------
  T0   | Read: temp=0     |                  | 0
  T1   |                  | Read: temp=0     | 0
  T2   | Modify: temp=1   |                  | 0
  T3   |                  | Modify: temp=1   | 0
  T4   | Write: counter=1 |                  | 1
  T5   |                  | Write: counter=1 | 1  ← Lost update!
  ```
- **Result:** counter=1 instead of 2 (one increment lost)
- **With 10 threads doing 1000 increments each:**
  - Expected: counter=10000
  - **Actual: anywhere from 1 to 10000** (non-deterministic)
  - Likely much less than 10000
- **Why volatile doesn't help:**
  - volatile prevents: `temp = counter; return temp+1;` (caching)
  - volatile doesn't prevent: **concurrent read-modify-write**
  - Each individual read/write is atomic at hardware level
  - **But the sequence of three operations is NOT atomic**
- **Correct version: Use std::atomic**
  ```cpp
  std::atomic<int> counter(0);

  void increment() {
      ++counter;  // Atomic read-modify-write
      // Or explicitly:
      counter.fetch_add(1);
  }
  ```
- **std::atomic guarantees:**
  - Entire read-modify-write is atomic
  - No interleaving possible
  - All increments counted
- **volatile use cases (NOT thread synchronization):**
  - Memory-mapped I/O registers
  - Signal handlers
  - setjmp/longjmp
  - **Never for multi-threading!**
- **Historical confusion:**
  - Java volatile is atomic (C++ volatile is not)
  - Many programmers mistakenly think C++ volatile works like Java
- **Key Concept:** volatile provides no atomicity; use std::atomic for thread-safe operations

---

#### Q10
```cpp
std::atomic<bool> x(false), y(false);
int z = 0;

void thread1() {
    x.store(true, std::memory_order_relaxed);
}

void thread2() {
    y.store(true, std::memory_order_relaxed);
}

void thread3() {
    while (!x.load(std::memory_order_relaxed)) {}
    if (y.load(std::memory_order_relaxed)) ++z;
}

void thread4() {
    while (!y.load(std::memory_order_relaxed)) {}
    if (x.load(std::memory_order_relaxed)) ++z;
}

// Can z be 0, 1, or 2 at the end? Explain.
```

**Answer:**
```
z can be 0, 1, or 2
```

**Explanation:**
- **Relaxed ordering allows complete reordering** between threads
- **No happens-before relationships established**

**Scenario 1: z=2 (both threads increment)**
  ```
  Timeline:
  - Thread1 stores x=true
  - Thread2 stores y=true
  - Thread3: sees x=true, checks y → y=true → ++z (z=1)
  - Thread4: sees y=true, checks x → x=true → ++z (z=2)
  Result: z=2
  ```

**Scenario 2: z=1 (only one increments)**
  ```
  Timeline:
  - Thread1 stores x=true
  - Thread3: sees x=true, checks y → y=false → no increment
  - Thread2 stores y=true
  - Thread4: sees y=true, checks x → x=true → ++z (z=1)
  Result: z=1 (thread3 saw old y)
  ```

**Scenario 3: z=0 (neither increments) - surprising!**
  ```
  Timeline:
  - Thread1 stores x=true
  - Thread2 stores y=true
  - Thread3: sees x=true, but sees old cached y=false → no increment
  - Thread4: sees y=true, but sees old cached x=false → no increment
  Result: z=0 (!!!)
  ```

- **How z=0 is possible:**
  - Relaxed allows each thread to see different order of updates
  - Thread3 sees: x becomes true first, y still false
  - Thread4 sees: y becomes true first, x still false
  - **No total order enforced**
  - Each thread has its own "view" of memory

- **This violates intuition:**
  - Both x and y are true eventually
  - But thread3 doesn't see y=true when it checks
  - And thread4 doesn't see x=true when it checks
  - **Cache coherency delays + relaxed ordering**

- **With sequential consistency (z would be 1 or 2, not 0):**
  ```cpp
  x.store(true, std::memory_order_seq_cst);
  y.store(true, std::memory_order_seq_cst);
  // ... loads also seq_cst
  // z would be 1 or 2, never 0
  ```

- **Why relaxed allows this:**
  - No synchronization between independent atomics
  - Each atomic has its own modification order
  - But different threads can observe different orders of unrelated atomics

- **Practical implication:**
  - Relaxed is **very weak**
  - Only useful when operations truly independent
  - Don't use relaxed for flags coordinating work

- **Key Concept:** Relaxed ordering provides no inter-variable ordering; threads can observe different orders of unrelated atomic updates

---

#### Q11
```cpp
std::atomic<int> val(100);
int old = val.exchange(200);

std::cout << "Old: " << old << ", New: " << val.load() << "\n";

// What is the output?
```

**Answer:**
```
Old: 100, New: 200
```

**Explanation:**
- **exchange():** Atomic swap operation
- **Operation:**
  ```cpp
  int exchange(int new_value) {
      // Atomically:
      int old_value = current_value;
      current_value = new_value;
      return old_value;
  }
  ```
- **Step-by-step:**
  1. val initially contains 100
  2. val.exchange(200) called:
     - Atomically reads current value (100)
     - Stores new value (200) into val
     - Returns old value (100)
  3. old = 100
  4. val now contains 200
  5. val.load() returns 200
  6. Output: "Old: 100, New: 200"

- **Atomicity guarantee:**
  - No thread can observe intermediate state
  - Exchange is single atomic operation
  - Not decomposed into load + store

- **Use cases:**

**Use case 1: Lock-free swap**
  ```cpp
  std::atomic<Node*> head;
  Node* new_head = create_node();
  Node* old_head = head.exchange(new_head);
  // old_head is previous list head
  ```

**Use case 2: Stealing/taking value**
  ```cpp
  std::atomic<int> shared_work(100);
  int my_work = shared_work.exchange(0);
  // I took all work, reset to 0 for others
  ```

**Use case 3: Flag with data**
  ```cpp
  std::atomic<int> status(IDLE);
  int old_status = status.exchange(BUSY);
  if (old_status == IDLE) {
      // We acquired the resource
  } else {
      // Someone else has it
  }
  ```

- **Memory ordering options:**
  ```cpp
  val.exchange(200, std::memory_order_seq_cst);  // Default
  val.exchange(200, std::memory_order_release);  // Publish
  val.exchange(200, std::memory_order_acquire);  // Subscribe
  val.exchange(200, std::memory_order_acq_rel);  // Both
  val.exchange(200, std::memory_order_relaxed);  // No ordering
  ```

- **Difference from CAS:**
  - **exchange:** Always succeeds, returns old value
  - **compare_exchange:** Conditional, may fail

- **Performance:**
  - Typically one atomic instruction (XCHG on x86)
  - Very efficient

- **Key Concept:** exchange atomically swaps value and returns previous value; unconditional, always succeeds

---

#### Q12
```cpp
std::atomic<int> x(0);

void thread1() {
    x.fetch_add(5, std::memory_order_relaxed);
}

void thread2() {
    x.fetch_add(10, std::memory_order_relaxed);
}

// After both threads complete, what is x's value? Is it deterministic?
```

**Answer:**
```
x = 15, deterministic
```

**Explanation:**
- **fetch_add:** Atomic read-modify-write operation
- **Atomicity guarantees:**
  - Each fetch_add is atomic
  - x+=5 happens as single indivisible operation
  - x+=10 happens as single indivisible operation
  - No lost updates possible

- **Why result is deterministic (15):**
  - **Commutativity:** 5+10 = 10+5 = 15
  - **Order doesn't matter for final result**
  - Even though interleaving varies, sum is same

- **Possible execution orders:**

**Order 1: Thread1 then Thread2**
  ```
  x=0 → fetch_add(5) → x=5 → fetch_add(10) → x=15
  ```

**Order 2: Thread2 then Thread1**
  ```
  x=0 → fetch_add(10) → x=10 → fetch_add(5) → x=15
  ```

**Both produce x=15!**

- **Return values differ by order:**
  ```cpp
  // Order 1
  int r1 = x.fetch_add(5);  // Returns 0 (old value)
  int r2 = x.fetch_add(10); // Returns 5 (old value)

  // Order 2
  int r1 = x.fetch_add(10); // Returns 0 (old value)
  int r2 = x.fetch_add(5);  // Returns 10 (old value)
  ```
  - **Return values non-deterministic (0 or 5 for thread1)**
  - **But final x value deterministic (15)**

- **Why relaxed is sufficient:**
  - Only care about final sum
  - No ordering with other variables
  - Atomicity of each operation guaranteed by fetch_add
  - **Relaxed ordering fine for counters**

- **Contrast with non-atomic:**
  ```cpp
  int x = 0;  // Non-atomic
  void thread1() { x += 5; }   // NOT atomic
  void thread2() { x += 10; }  // NOT atomic
  // Final x could be 5, 10, or 15 (non-deterministic!)
  ```

- **Non-atomic decomposition:**
  ```cpp
  // x += 5 decomposes to:
  temp = x;     // Read
  temp += 5;    // Modify
  x = temp;     // Write
  // Another thread can interleave here!
  ```

- **fetch_add variants:**
  ```cpp
  x.fetch_add(5);   // Returns old value
  x += 5;           // Returns new value (operator overload)
  x.fetch_sub(3);   // Subtract
  ++x;              // Increment, returns new
  x++;              // Increment, returns old
  ```

- **Use case: Distributed counter**
  ```cpp
  std::atomic<int> total_requests(0);
  // Multiple threads
  total_requests.fetch_add(local_count, std::memory_order_relaxed);
  // Safe: order doesn't matter, only final sum
  ```

- **Key Concept:** fetch_add is atomic read-modify-write; final sum deterministic even with relaxed ordering due to operation atomicity

---

#### Q13
```cpp
struct Node {
    int value;
    Node* next;
};

std::atomic<Node*> head(nullptr);

void push(int val) {
    Node* new_node = new Node{val, nullptr};
    new_node->next = head.load();
    head.store(new_node);  // ❌ What's wrong with this?
}
```

**Answer:**
```
Race condition: no CAS
```

**Explanation:**
- **Classic lock-free stack bug** - missing CAS
- **What goes wrong with multiple threads:**

**Race scenario:**
  ```
  Initial: head → A → nullptr
  Thread1 wants to push B
  Thread2 wants to push C

  Timeline:
  T1: Thread1: new_node B allocated
  T2: Thread1: B->next = head.load() → B->next = A
  T3: Thread2: new_node C allocated
  T4: Thread2: C->next = head.load() → C->next = A
  T5: Thread1: head.store(B) → head now points to B
  T6: Thread2: head.store(C) → head now points to C

  Result: head → C → A → nullptr
  LOST: Node B! Memory leak.
  ```

- **Problem breakdown:**
  - **Load and store are separate operations**
  - Another thread can modify head between load and store
  - **Time-of-check to time-of-use (TOCTOU) race**
  - Lost updates: Node B inserted but overwritten

- **Correct implementation: CAS loop**
  ```cpp
  void push(int val) {
      Node* new_node = new Node{val, nullptr};
      new_node->next = head.load();

      // Keep trying until successful
      while (!head.compare_exchange_weak(new_node->next, new_node)) {
          // If CAS failed, head changed
          // new_node->next already updated to new head value
          // Loop retries with updated next pointer
      }
  }
  ```

- **How CAS fixes it:**
  ```
  Thread1: new B, B->next = A
  Thread1: CAS(expected=A, new=B)
    - Check: head == A? Yes
    - Store: head = B
    - Success! head → B → A

  Thread2: new C, C->next = A (old value)
  Thread2: CAS(expected=A, new=C)
    - Check: head == A? NO (now B)
    - Fail! C->next updated to B
  Thread2: Retry CAS(expected=B, new=C)
    - Check: head == B? Yes
    - Store: head = C
    - Success! head → C → B → A

  Result: head → C → B → A (both inserted!)
  ```

- **CAS guarantees:**
  - Atomic check-and-update
  - If head changed since load, CAS fails
  - Updated next pointer automatically
  - Retry until success

- **Alternative: Just use mutex**
  ```cpp
  std::mutex mtx;
  Node* head = nullptr;

  void push(int val) {
      std::lock_guard lock(mtx);
      Node* new_node = new Node{val, head};
      head = new_node;
  }
  // Simpler, probably faster than CAS for many cases
  ```

- **Lock-free is hard:**
  - Requires CAS or similar
  - Subtle race conditions
  - Often not faster than mutexes
  - **Only use when proven necessary**

- **ABA problem (more advanced):**
  - Even CAS can have issues
  - Need version counters or hazard pointers
  - Lock-free programming is complex

- **Key Concept:** Lock-free push requires CAS loop; separate load and store creates race condition with lost updates

---

#### Q14
```cpp
std::atomic<int> counter(0);
bool ready = false;

void thread1() {
    counter.fetch_add(1, std::memory_order_release);
    ready = true;
}

void thread2() {
    while (!ready) {}
    int val = counter.load(std::memory_order_acquire);
}

// What can go wrong here?
```

**Answer:**
```
Race on ready
```

**Explanation:**
- **Mixed atomic/non-atomic synchronization** - dangerous pattern
- **Problems:**

**Problem 1: Data race on ready**
  - **ready is non-atomic bool**
  - Thread1 writes: `ready = true` (non-atomic)
  - Thread2 reads: `while (!ready)` (non-atomic)
  - **Concurrent read-write without synchronization = undefined behavior**
  - Compiler may cache ready in register
  - Thread2 might loop forever even after ready=true

**Problem 2: No synchronization for ready**
  - counter uses release-acquire (correct)
  - But ready doesn't participate in synchronization
  - **No happens-before relationship through ready**
  - Even if ready seen as true, no guarantee of memory ordering

**Problem 3: Compiler optimizations**
  ```cpp
  // Compiler might transform thread2 to:
  bool cached_ready = ready;
  while (!cached_ready) {}  // Infinite loop!
  ```
  - Without volatile or atomic, compiler can assume ready never changes
  - **Undefined behavior allows arbitrary transformation**

- **What could happen:**
  ```
  Scenario 1: Works by luck
  - Ready written, thread2 sees it
  - counter visible due to cache coherency

  Scenario 2: Infinite loop
  - Compiler caches ready in register
  - Thread2 never sees update
  - Loops forever

  Scenario 3: Reordering
  - CPU reorders operations
  - Thread2 sees ready=true but old counter value
  - Even though acquire used on counter!
  ```

- **Correct version: Make ready atomic**
  ```cpp
  std::atomic<int> counter(0);
  std::atomic<bool> ready(false);  // Atomic!

  void thread1() {
      counter.fetch_add(1, std::memory_order_relaxed);
      ready.store(true, std::memory_order_release);
  }

  void thread2() {
      while (!ready.load(std::memory_order_acquire)) {}
      int val = counter.load(std::memory_order_relaxed);
      // Now safe: release-acquire synchronizes
  }
  ```

- **Why mixing atomic/non-atomic is bad:**
  - Atomic operations provide ordering
  - Non-atomic operations can be reordered freely
  - **No way to synchronize through non-atomic**
  - Compiler/CPU assumes non-atomics are thread-local

- **General rule:**
  - **All shared variables must be atomic or protected by mutex**
  - Never mix atomic and non-atomic for same coordination
  - One non-atomic break entire synchronization

- **Exception: const data**
  ```cpp
  const int data = 42;  // OK: never changes
  std::atomic<bool> ready(false);
  // Thread1: ready = true
  // Thread2: if (ready) use data;  // Safe: data is const
  ```

- **Key Concept:** Mixing atomic and non-atomic variables for synchronization is undefined behavior; all shared variables must be atomic or mutex-protected

---

#### Q15
```cpp
std::atomic<int> val(0);

void thread1() {
    val.store(1);  // No explicit ordering
}

void thread2() {
    int x = val.load();  // No explicit ordering
}

// What memory ordering is used by default?
```

**Answer:**
```
memory_order_seq_cst
```

**Explanation:**
- **Default memory ordering: Sequential consistency**
- **When not specified:**
  ```cpp
  val.store(1);                          // Uses seq_cst
  val.store(1, std::memory_order_seq_cst);  // Explicit (same)
  ```

- **What seq_cst provides:**
  - **Strongest guarantees**
  - Total global order across all threads
  - All seq_cst operations appear in single global order
  - No reordering across seq_cst barriers
  - All threads see same order of operations

- **Default for all operations:**
  ```cpp
  val.load();           // seq_cst
  val.store(x);         // seq_cst
  val.exchange(x);      // seq_cst
  val.compare_exchange_strong(...);  // seq_cst (both operations)
  val.fetch_add(1);     // seq_cst
  val += 1;             // seq_cst (operator overload)
  ++val;                // seq_cst
  ```

- **Why seq_cst is default:**
  - **Easiest to reason about**
  - Matches programmer intuition
  - Works like strongly-ordered memory model
  - Hard to get wrong
  - **Safe default**

- **Trade-off:**
  - **Correct:** Yes, always
  - **Fast:** No, slowest ordering
  - **Memory barriers:** Full fences on many architectures

- **When to use explicit ordering:**

**Relaxed (fastest, weakest):**
  ```cpp
  counter.fetch_add(1, std::memory_order_relaxed);
  // For counters where order doesn't matter
  ```

**Release-acquire (common pattern):**
  ```cpp
  data = 42;
  ready.store(true, std::memory_order_release);  // Publish

  while (!ready.load(std::memory_order_acquire)) {}  // Subscribe
  assert(data == 42);  // Guaranteed
  ```

**Seq_cst (when total order needed):**
  ```cpp
  x.store(1, std::memory_order_seq_cst);
  y.store(1, std::memory_order_seq_cst);
  // All threads see same order of x and y updates
  ```

- **Performance impact:**
  ```
  relaxed:  No overhead (just atomic instruction)
  acquire:  Load barrier
  release:  Store barrier
  seq_cst:  Full barrier (load + store)
  ```

- **Recommendation:**
  - **Start with default (seq_cst)** - correct and simple
  - **Optimize to release-acquire** - common pattern
  - **Use relaxed carefully** - only when proven safe
  - **Measure performance** before optimizing

- **Expert advice:**
  - "Premature optimization is the root of all evil"
  - Seq_cst is rarely the bottleneck
  - Relaxed atomics are extremely subtle
  - **Get it correct first, optimize later**

- **Key Concept:** Default memory ordering is seq_cst; provides strongest guarantees but highest cost; explicit orderings are optimization

---

#### Q16
```cpp
std::atomic<std::string> str("hello");  // Compile error or not?

// Can you make an atomic of a large type? What happens?
```

**Answer:**
```
Compiles but likely not lock-free
```

**Explanation:**
- **std::atomic works with any trivially copyable type**
- **Compilation:**
  - std::string is NOT trivially copyable (has destructor, dynamic allocation)
  - **Won't compile:** `std::atomic<std::string>` is ill-formed
  - **Error:** "std::string is not trivially copyable"

- **Corrected example:**
  ```cpp
  struct LargeStruct {
      int data[100];
  };

  std::atomic<LargeStruct> large;  // Compiles!
  ```

- **Lock-free vs lock-based atomics:**

**Small types (usually lock-free):**
  ```cpp
  std::atomic<int> x;          // Lock-free on all platforms
  std::atomic<void*> p;        // Lock-free on all platforms
  std::atomic<uint64_t> v;     // Lock-free on 64-bit platforms
  ```

**Large types (usually lock-based):**
  ```cpp
  struct BigStruct { int arr[100]; };
  std::atomic<BigStruct> big;  // Likely uses internal mutex
  ```

- **Checking lock-free status:**
  ```cpp
  std::atomic<int> x;
  if (x.is_lock_free()) {
      std::cout << "Lock-free!\n";  // Likely true
  }

  std::atomic<LargeStruct> big;
  if (big.is_lock_free()) {
      std::cout << "Lock-free!\n";  // Likely false
  } else {
      std::cout << "Uses locks\n";  // Likely prints this
  }
  ```

- **What "uses locks" means:**
  - std::atomic implementation uses internal mutex
  - Each operation locks mutex, performs operation, unlocks
  - **Defeats purpose of atomics!**
  - No better than using std::mutex yourself

- **Lock-free guarantees (compile-time):**
  ```cpp
  static_assert(std::atomic<int>::is_always_lock_free);  // True
  static_assert(std::atomic<LargeStruct>::is_always_lock_free);  // False
  ```

- **Platform differences:**
  ```cpp
  std::atomic<uint64_t> x;
  // 64-bit platform: Lock-free
  // 32-bit platform: Uses locks (can't atomically access 64-bit)
  ```

- **Typical lock-free sizes:**
  ```
  All platforms: 1, 2, 4 bytes (char, short, int, pointers)
  64-bit:        8 bytes (long, uint64_t)
  Some x86_64:   16 bytes (DWCAS - double-width CAS)
  Larger:        Almost never lock-free
  ```

- **Recommendation for large types:**
  ```cpp
  // Instead of:
  std::atomic<LargeStruct> data;  // Uses locks

  // Use:
  std::mutex mtx;
  LargeStruct data;
  // Explicit mutex clearer and no slower
  ```

- **Special case: Shared pointer**
  ```cpp
  std::atomic<std::shared_ptr<Data>> ptr;  // C++20
  // Special std::atomic specialization
  // Uses atomic ref-counting operations
  ```

- **Key Concept:** std::atomic works with large types but likely not lock-free; defeats purpose, better to use explicit mutex

---

#### Q17
```cpp
std::atomic<int> x(0);

void thread1() {
    x.store(1, std::memory_order_release);
}

void thread2() {
    x.store(2, std::memory_order_release);
}

void thread3() {
    while (x.load(std::memory_order_acquire) == 0) {}
    std::cout << x.load() << "\n";
}

// What values can thread3 print?
```

**Answer:**
```
1 or 2
```

**Explanation:**
- **Concurrent stores to same atomic** - both valid
- **Race between thread1 and thread2:**
  - Both store to x (1 and 2)
  - **Both stores are atomic**
  - One happens first, other happens second
  - **Non-deterministic order**

- **Possible execution orders:**

**Order 1: Thread1 first**
  ```
  T0: x = 0
  T1: Thread1 stores x=1 (release)
  T2: Thread2 stores x=2 (release)
  T3: Thread3 sees x!=0, loads → x=2
  Output: "2"
  ```

**Order 2: Thread2 first**
  ```
  T0: x = 0
  T1: Thread2 stores x=2 (release)
  T2: Thread1 stores x=1 (release)
  T3: Thread3 sees x!=0, loads → x=1
  Output: "1"
  ```

**Order 3: Thread3 catches intermediate**
  ```
  T0: x = 0
  T1: Thread1 stores x=1
  T2: Thread3 wakes from spin: x=1, exits loop
  T3: Thread2 stores x=2
  T4: Thread3 loads x → x=2 (second load)
  Output: "2"
  ```

**Order 4: Thread3 sees first store**
  ```
  T0: x = 0
  T1: Thread1 stores x=1
  T2: Thread3 wakes: x=1, exits loop
  T3: Thread3 loads x → x=1 (before thread2 stores)
  Output: "1"
  ```

- **Why both 1 and 2 possible:**
  - **Two separate loads in thread3:**
    - First: `x.load() == 0` (in loop)
    - Second: `x.load()` (for print)
  - Between these loads, either store can happen
  - No guarantee which store thread3 observes

- **Modification order:**
  - All threads see same order of stores to x
  - But WHICH order is non-deterministic
  - Either: x=0 → x=1 → x=2
  - Or: x=0 → x=2 → x=1

- **Release-acquire semantics:**
  - **Thread1's release:** All thread1's work visible to acquirer of x=1
  - **Thread2's release:** All thread2's work visible to acquirer of x=2
  - **Thread3's acquire:** Sees work from whichever store it observes

- **Cannot print 0:**
  - Loop ensures x!=0 before proceeding
  - Even if second load sees 0 (impossible due to modification order)

- **Could print other values? No.**
  - Only 1 or 2 ever stored
  - No arithmetic operations
  - **Only possible values are 1 or 2**

- **If more stores:**
  ```cpp
  void thread4() { x.store(3, std::memory_order_release); }
  // Now thread3 could print: 1, 2, or 3
  ```

- **Key Concept:** Concurrent stores create non-deterministic modification order; observer sees one of the stored values, determined by scheduling

---

#### Q18
```cpp
std::atomic<int> flag(0);
int data[10];

void writer() {
    for (int i = 0; i < 10; ++i) data[i] = i;
    std::atomic_thread_fence(std::memory_order_release);
    flag.store(1, std::memory_order_relaxed);
}

void reader() {
    while (flag.load(std::memory_order_relaxed) == 0) {}
    std::atomic_thread_fence(std::memory_order_acquire);
    for (int i = 0; i < 10; ++i) std::cout << data[i];
}

// Is this synchronization correct?
```

**Answer:**
```
Yes, correct
```

**Explanation:**
- **Memory fences (barriers):** Alternative to atomic orderings
- **This pattern separates ordering from atomic variable**

- **How fences work:**

**Writer side:**
  1. Writes to non-atomic data[]: `data[i] = i`
  2. **Release fence:** `atomic_thread_fence(memory_order_release)`
     - All prior writes must complete before this fence
     - Creates "release" point
  3. Relaxed store: `flag.store(1, relaxed)`
     - Flag is just signal, no ordering on flag itself

**Reader side:**
  1. Relaxed load: `while (flag.load(relaxed) == 0)`
     - Just waiting for signal
  2. **Acquire fence:** `atomic_thread_fence(memory_order_acquire)`
     - All subsequent reads must happen after this fence
     - Creates "acquire" point
  3. Reads from data[]: `data[i]`

- **Synchronization established:**
  - Writer: data writes → release fence → flag=1
  - Reader: sees flag=1 → acquire fence → data reads
  - **Release fence synchronizes-with acquire fence**
  - All data writes visible after acquire fence

- **Why this works:**
  - Release fence "publishes" all prior writes
  - Acquire fence "subscribes" to published writes
  - **Flag is just notification mechanism**
  - Fences do the actual ordering

- **Equivalent to:**
  ```cpp
  // Without fences (using atomic orderings directly)
  void writer() {
      for (int i = 0; i < 10; ++i) data[i] = i;
      flag.store(1, std::memory_order_release);  // Release
  }

  void reader() {
      while (flag.load(std::memory_order_acquire) == 0) {}  // Acquire
      for (int i = 0; i < 10; ++i) std::cout << data[i];
  }
  ```

- **Why use fences instead:**
  - **Performance:** Relaxed atomic ops are faster
  - **Flexibility:** Single fence synchronizes multiple variables
  - **Clarity:** Separates "signal" from "ordering"

- **Use case: Multiple data items**
  ```cpp
  int data1, data2, data3;
  std::atomic<int> flags[3] = {0, 0, 0};

  // Writer
  data1 = ...; data2 = ...; data3 = ...;
  std::atomic_thread_fence(std::memory_order_release);
  flags[0].store(1, relaxed);
  flags[1].store(1, relaxed);
  flags[2].store(1, relaxed);
  // One fence synchronizes all three flags
  ```

- **Fence types:**
  - `atomic_thread_fence(release)`: All stores before fence visible
  - `atomic_thread_fence(acquire)`: All loads after fence see prior stores
  - `atomic_thread_fence(acq_rel)`: Both
  - `atomic_thread_fence(seq_cst)`: Strongest

- **Subtlety: Flag must be atomic**
  - Even though relaxed, flag MUST be atomic
  - Otherwise no synchronization point at all

- **Key Concept:** Memory fences provide ordering separate from atomic variable; release fence publishes, acquire fence subscribes, relaxed atomics signal completion

---

#### Q19
```cpp
std::atomic<int> x(10);
int a = ++x;
int b = x++;

std::cout << "a: " << a << ", b: " << b << ", x: " << x.load() << "\n";

// What is the output?
```

**Answer:**
```
a: 11, b: 11, x: 12
```

**Explanation:**
- **Atomic pre/post-increment operators**
- **Step-by-step execution:**

**Statement 1: `int a = ++x`**
  - Pre-increment on atomic
  - **Operation:**
    1. Atomically fetch x (10)
    2. Increment to 11
    3. Store 11 back to x
    4. **Return new value (11)**
  - `a = 11`
  - `x = 11` after this

**Statement 2: `int b = x++`**
  - Post-increment on atomic
  - **Operation:**
    1. Atomically fetch x (11)
    2. **Return old value (11)**
    3. Increment to 12
    4. Store 12 back to x
  - `b = 11`
  - `x = 12` after this

**Output:**
  ```
  a: 11, b: 11, x: 12
  ```

- **Operator semantics:**
  ```cpp
  ++x  // Pre-increment: increment then return new value
  x++  // Post-increment: return old value then increment
  ```

- **Atomic implementation:**
  ```cpp
  // Equivalent to:
  int a = x.fetch_add(1) + 1;  // Pre-increment
  int b = x.fetch_add(1);      // Post-increment
  ```

- **All three increments to same variable:**
  - First ++x: 10 → 11
  - Second x++: 11 → 12
  - Final x: 12

- **Atomicity:**
  - Each operation is atomic
  - No race conditions
  - All increments counted

- **With non-atomic:**
  ```cpp
  int x = 10;  // Non-atomic
  int a = ++x;  // a=11, x=11
  int b = x++;  // b=11, x=12
  // Same result in single-threaded context
  ```

- **Multi-threaded difference:**
  ```cpp
  // Non-atomic: Race condition
  int x = 0;
  void thread1() { ++x; }  // Lost updates possible
  void thread2() { ++x; }

  // Atomic: Correct
  std::atomic<int> x(0);
  void thread1() { ++x; }  // Always counted
  void thread2() { ++x; }
  ```

- **Return value vs side effect:**
  - **Pre-increment (++x):**
    - Side effect: x increased
    - Return value: new value
  - **Post-increment (x++):**
    - Side effect: x increased
    - Return value: old value

- **Performance note:**
  - Both forms equally efficient for atomics
  - fetch_add underlying operation same
  - Just different return value

- **Other atomic arithmetic:**
  ```cpp
  --x;    // Pre-decrement
  x--;    // Post-decrement
  x += 5; // Add-assign
  x -= 3; // Sub-assign
  // All atomic operations
  ```

- **Key Concept:** Atomic pre-increment returns new value, post-increment returns old value; both atomically increment

---

#### Q20
```cpp
struct alignas(64) PaddedAtomic {
    std::atomic<int> val;
};

PaddedAtomic counters[4];

// Why use alignas(64)? What problem does this solve?
```

**Answer:**
```
Prevents false sharing
```

**Explanation:**
- **False sharing:** Performance killer in concurrent code
- **Problem without alignment:**

**Cache line basics:**
  - CPU caches data in **cache lines** (typically 64 bytes)
  - When CPU accesses memory, entire cache line loaded
  - Multiple variables can share same cache line

**False sharing scenario:**
  ```cpp
  std::atomic<int> counters[4];  // No padding
  // Memory layout (assuming 4-byte ints):
  // [counter[0]][counter[1]][counter[2]][counter[3]][...] (16 bytes total)
  // All fit in single 64-byte cache line!
  ```

**What goes wrong:**
  ```
  Core 0: Increments counter[0]
    → Invalidates entire cache line in other cores
  Core 1: Wants to increment counter[1]
    → Must reload cache line (expensive!)
    → Even though counter[0] and counter[1] are independent!
  Core 2: Increments counter[2]
    → Invalidates cache line again
  Core 3: Increments counter[3]
    → Invalidates cache line again

  Result: Cache line bouncing between cores
          ("Ping-pong effect")
          Massive performance degradation
  ```

- **Performance impact:**
  - **Without padding:** 10-100x slower (seriously!)
  - Cache line constantly invalidated
  - Cores wait for cache coherency protocol
  - **False sharing:** Sharing cache line, not data

- **Solution: alignas(64)**
  ```cpp
  struct alignas(64) PaddedAtomic {
      std::atomic<int> val;
      // Compiler pads to 64 bytes
  };

  // Memory layout now:
  // [counter[0] + 60 bytes padding]  ← Cache line 1
  // [counter[1] + 60 bytes padding]  ← Cache line 2
  // [counter[2] + 60 bytes padding]  ← Cache line 3
  // [counter[3] + 60 bytes padding]  ← Cache line 4
  ```

- **With padding:**
  ```
  Core 0: Increments counter[0] → Only cache line 1 affected
  Core 1: Increments counter[1] → Only cache line 2 affected
  Core 2: Increments counter[2] → Only cache line 3 affected
  Core 3: Increments counter[3] → Only cache line 4 affected

  Result: No cache line bouncing!
          Each core has its own cache line
          Full parallel performance
  ```

- **Why 64 bytes:**
  - x86/x64: 64-byte cache lines
  - ARM: Usually 64 bytes
  - Some systems: 128 bytes
  - **64 is safe common denominator**

- **Trade-off:**
  - **Pros:** Massive performance gain (up to 100x)
  - **Cons:** Uses more memory (64 bytes vs 4 bytes per counter)
  - **Worth it** for hot shared data

- **When to use padding:**
  - Multiple threads accessing different array elements
  - Each thread has its own counter/variable
  - High contention scenarios
  - **Not needed** if data actually shared (one atomic, many accessors)

- **Alternative: std::hardware_destructive_interference_size (C++17)**
  ```cpp
  constexpr size_t cache_line = std::hardware_destructive_interference_size;
  struct alignas(cache_line) PaddedAtomic {
      std::atomic<int> val;
  };
  // Automatically uses platform's cache line size
  ```

- **Real-world example:**
  ```cpp
  // Per-thread counters
  alignas(64) std::atomic<uint64_t> thread_counters[NUM_THREADS];

  // Thread i only touches thread_counters[i]
  void worker(int thread_id) {
      while (working) {
          thread_counters[thread_id].fetch_add(1);
          // No false sharing!
      }
  }
  ```

- **Key Concept:** False sharing causes cache line bouncing; align independent atomics to cache line size to prevent performance degradation

---
