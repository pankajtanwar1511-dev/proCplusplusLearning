## TOPIC: Deadlocks and Race Conditions - Patterns, Detection, and Prevention

### PRACTICE_TASKS: Output Prediction and Code Analysis

#### Q1
```cpp
int counter = 0;

void increment() {
    for (int i = 0; i < 10000; ++i) {
        ++counter;
    }
}

int main() {
    std::thread t1(increment);
    std::thread t2(increment);
    t1.join(); t2.join();
    std::cout << counter << "\n";
}
```

**Answer:**
```
Output: < 20000 (varies, typically 10000-19999)
```

**Explanation:**
- Two threads both increment counter 10,000 times each
- Expected result: 20,000
- **Actual result:** Less than 20,000 (varies with each run)
- **++counter is NOT atomic:** Three operations (read, increment, write)
- **Data race example:**
  - T1 reads counter=5
  - T2 reads counter=5 (before T1 writes)
  - T1 writes 6
  - T2 writes 6 (overwriting T1's increment!)
  - Lost update: counter should be 7, but is 6
- **Many lost updates** over 20,000 operations
- **Undefined behavior:** Data race on non-atomic variable
- **Results vary:** Depends on thread scheduling, CPU cores, optimization
- **Fix:** Use std::atomic<int> or protect with std::mutex
- **Key Concept:** Data race / lost updates from concurrent unsynchronized access to shared mutable state

---

#### Q2
```cpp
std::mutex m1, m2;

void thread1() {
    std::lock_guard<std::mutex> lock1(m1);
    std::this_thread::sleep_for(std::chrono::milliseconds(100));
    std::lock_guard<std::mutex> lock2(m2);
    std::cout << "Thread 1\n";
}

void thread2() {
    std::lock_guard<std::mutex> lock2(m2);
    std::this_thread::sleep_for(std::chrono::milliseconds(100));
    std::lock_guard<std::mutex> lock1(m1);
    std::cout << "Thread 2\n";
}
```

**Answer:**
```
Likely deadlock
```

**Explanation:**
- **Classic ABBA deadlock pattern**
- Thread1 locks: m1 first, then m2
- Thread2 locks: m2 first, then m1
- **Deadlock scenario:**
  1. T1 acquires m1
  2. T2 acquires m2 (simultaneously)
  3. T1 sleeps 100ms (holding m1)
  4. T2 sleeps 100ms (holding m2)
  5. T1 wakes, tries to lock m2 (blocked by T2)
  6. T2 wakes, tries to lock m1 (blocked by T1)
- **Circular wait:** T1 waits for T2, T2 waits for T1
- **Neither thread can proceed** - program hangs forever
- **Lock ordering problem:** Different acquisition order
- **Fix 1:** Always lock in same order (both do m1 then m2)
- **Fix 2:** Use std::lock(m1, m2) with adopt_lock
- **Key Concept:** Lock ordering deadlock / ABBA deadlock from inconsistent lock acquisition order

---

#### Q3
```cpp
std::mutex m1, m2;

void safe_thread1() {
    std::lock(m1, m2);
    std::lock_guard<std::mutex> lg1(m1, std::adopt_lock);
    std::lock_guard<std::mutex> lg2(m2, std::adopt_lock);
    std::cout << "Thread 1\n";
}

void safe_thread2() {
    std::lock(m2, m1);
    std::lock_guard<std::mutex> lg2(m2, std::adopt_lock);
    std::lock_guard<std::mutex> lg1(m1, std::adopt_lock);
    std::cout << "Thread 2\n";
}
```

**Answer:**
```
Output: "Thread 1" and "Thread 2" (order varies)
No deadlock
```

**Explanation:**
- **std::lock(m1, m2) prevents deadlock**
- std::lock uses deadlock-avoidance algorithm
- **Locks both mutexes atomically** (all-or-nothing)
- **Thread1:** std::lock(m1, m2) - locks both
- **Thread2:** std::lock(m2, m1) - same mutexes, different argument order
- **Order doesn't matter:** std::lock handles any order
- **Internal algorithm:** Uses try_lock with backoff
- **Adoption pattern:** lock_guards adopt already-locked mutexes
- **RAII still works:** Automatic unlock on scope exit
- **Output order unpredictable:** Depends on thread scheduling
- **Safe pattern for multiple mutexes**
- **Key Concept:** std::lock prevents deadlock regardless of argument order; use with adopt_lock for RAII

---

#### Q4
```cpp
std::mutex mtx;
int value = 0;

void check_then_act() {
    if (value < 100) {
        std::this_thread::sleep_for(std::chrono::milliseconds(10));
        std::lock_guard<std::mutex> lock(mtx);
        value += 50;
    }
}

int main() {
    std::thread t1(check_then_act);
    std::thread t2(check_then_act);
    t1.join(); t2.join();
    std::cout << value << "\n";
}
```

**Answer:**
```
Possible output: 100 (both threads pass check and add 50)
Expected: 50 (only one should pass check)
```

**Explanation:**
- **TOCTOU race: Time-Of-Check to Time-Of-Use**
- **Check outside lock:** `if (value < 100)` unsynchronized
- **Scenario:**
  1. T1 checks: value=0, condition true
  2. T2 checks: value=0 still, condition true (T1 hasn't updated yet)
  3. T1 sleeps, then locks and adds 50 (value=50)
  4. T2 sleeps, then locks and adds 50 (value=100)
- **Both threads pass check** even though only one should
- **Result: value=100** instead of expected 50
- **Classic race pattern:** Check and act must be atomic
- **Fix:** Move check inside lock
  ```cpp
  std::lock_guard<std::mutex> lock(mtx);
  if (value < 100) {
      value += 50;
  }
  ```
- **Key Concept:** TOCTOU race - check-then-act must be atomic; protect both check and action

---

#### Q5
```cpp
class Account {
public:
    std::mutex mtx;
    int balance = 100;
};

void transfer(Account& from, Account& to, int amount) {
    std::lock_guard<std::mutex> lock1(from.mtx);
    std::lock_guard<std::mutex> lock2(to.mtx);
    from.balance -= amount;
    to.balance += amount;
}

int main() {
    Account a1, a2;
    std::thread t1(transfer, std::ref(a1), std::ref(a2), 50);
    std::thread t2(transfer, std::ref(a2), std::ref(a1), 30);
    t1.join(); t2.join();
}
```

**Answer:**
```
Possible deadlock
```

**Explanation:**
- **Dynamic lock ordering problem**
- T1: transfer(a1, a2) - locks a1.mtx, then a2.mtx
- T2: transfer(a2, a1) - locks a2.mtx, then a1.mtx
- **Lock order depends on function arguments**
- **Deadlock scenario:**
  1. T1 locks a1.mtx
  2. T2 locks a2.mtx (simultaneously)
  3. T1 tries a2.mtx (blocked by T2)
  4. T2 tries a1.mtx (blocked by T1)
  5. Circular wait - deadlock
- **Classic bank account deadlock**
- **Fix 1:** Lock in consistent order (e.g., by address)
  ```cpp
  if (&from < &to) {
      std::lock_guard lock1(from.mtx);
      std::lock_guard lock2(to.mtx);
  } else {
      std::lock_guard lock1(to.mtx);
      std::lock_guard lock2(from.mtx);
  }
  ```
- **Fix 2:** Use std::lock(from.mtx, to.mtx) with adopt_lock
- **Key Concept:** Pointer-based deadlock when lock order depends on runtime arguments; use std::lock or consistent ordering

---

#### Q6
```cpp
std::mutex mtx;
std::vector<int> data;

int get_or_default(int index) {
    if (index < data.size()) {
        return data[index];
    }
    return -1;
}

void add_item(int value) {
    std::lock_guard<std::mutex> lock(mtx);
    data.push_back(value);
}
```

**Answer:**
```
Potential crash or wrong value
```

**Explanation:**
- **get_or_default NOT synchronized** (no lock)
- **add_item IS synchronized** (has lock)
- **Data race between reader and writer**
- **TOCTOU in get_or_default:**
  1. Checks: `index < data.size()` (e.g., size=5, index=3)
  2. **Another thread adds item** (size now 6 or more)
  3. Returns: `data[index]` (safe in this case)
- **Dangerous scenario:**
  1. Checks: `index < data.size()` (e.g., size=3, index=2)
  2. **Another thread adds many items + reallocation**
  3. data pointer changed, old memory freed
  4. Returns: `data[index]` - **accessing freed memory!**
- **Or reverse:**
  1. Checks: `index < data.size()` returns false
  2. **Another thread adds item** (now index would be valid)
  3. Returns -1 (wrong, but safe)
- **Fix:** Protect reads with same mutex
  ```cpp
  std::lock_guard<std::mutex> lock(mtx);
  if (index < data.size()) return data[index];
  ```
- **Key Concept:** TOCTOU / unsynchronized read with synchronized write causes data race; protect all accesses

---

#### Q7
```cpp
std::atomic<bool> flag1{false};
std::atomic<bool> flag2{false};

void polite1() {
    while (true) {
        flag1 = true;
        if (flag2) {
            flag1 = false;
            std::this_thread::yield();
            continue;
        }
        break;
    }
    std::cout << "Thread 1\n";
    flag1 = false;
}

void polite2() {
    while (true) {
        flag2 = true;
        if (flag1) {
            flag2 = false;
            std::this_thread::yield();
            continue;
        }
        break;
    }
    std::cout << "Thread 2\n";
    flag2 = false;
}
```

**Answer:**
```
Possible livelock
```

**Explanation:**
- **Livelock: Both threads active but no progress**
- **"After you" politeness problem**
- **Scenario:**
  1. T1 sets flag1=true
  2. T2 sets flag2=true (simultaneously)
  3. T1 sees flag2, backs off (flag1=false), yields
  4. T2 sees flag1, backs off (flag2=false), yields
  5. **Repeat infinitely** - both keep backing off
- **Both threads running** (not blocked like deadlock)
- **But neither makes progress** (livelock)
- **Difference from deadlock:**
  - Deadlock: Threads blocked waiting
  - Livelock: Threads active, constantly reacting to each other
- **Real-world analogy:** Two people in hallway, both stepping aside repeatedly
- **May eventually resolve:** Timing differences might break cycle
- **Not guaranteed to resolve:** Can loop forever
- **Fix:** Use proper mutex or atomic compare-exchange
- **Key Concept:** Livelock from mutual politeness; threads active but make no progress

---

#### Q8
```cpp
std::once_flag flag;
int shared_resource = 0;

void initialize() {
    shared_resource = 100;
}

void thread_func() {
    std::call_once(flag, initialize);
    std::cout << shared_resource << "\n";
}

int main() {
    std::thread t1(thread_func);
    std::thread t2(thread_func);
    std::thread t3(thread_func);
    t1.join(); t2.join(); t3.join();
}
```

**Answer:**
```
Output: "100" printed 3 times
```

**Explanation:**
- **std::call_once ensures function runs exactly once**
- Three threads all call std::call_once with same flag
- **Only first thread executes initialize()**
- Other threads block until initialization completes
- **After initialization:**
  - flag marked as "called"
  - All subsequent calls return immediately
  - All threads see shared_resource=100
- **Thread-safe lazy initialization**
- **Each thread prints 100** (order may vary)
- **Guarantees:**
  - Exactly one execution
  - All threads see initialized value
  - Thread-safe without explicit mutex
- **Use cases:** Singleton initialization, expensive one-time setup
- **Better than double-checked locking** (avoids subtle bugs)
- **Key Concept:** One-time initialization with std::call_once; thread-safe lazy initialization

---

#### Q9
```cpp
std::timed_mutex tm1, tm2;

void timeout_thread1() {
    if (tm1.try_lock_for(std::chrono::milliseconds(50))) {
        std::this_thread::sleep_for(std::chrono::milliseconds(100));
        if (tm2.try_lock_for(std::chrono::milliseconds(50))) {
            std::cout << "T1 got both\n";
            tm2.unlock();
        } else {
            std::cout << "T1 timeout\n";
        }
        tm1.unlock();
    }
}

void timeout_thread2() {
    if (tm2.try_lock_for(std::chrono::milliseconds(50))) {
        std::this_thread::sleep_for(std::chrono::milliseconds(100));
        if (tm1.try_lock_for(std::chrono::milliseconds(50))) {
            std::cout << "T2 got both\n";
            tm1.unlock();
        } else {
            std::cout << "T2 timeout\n";
        }
        tm2.unlock();
    }
}
```

**Answer:**
```
Output: "T1 timeout" and "T2 timeout" (or possibly one succeeds)
```

**Explanation:**
- **Timeout-based deadlock detection and recovery**
- T1 locks tm1, T2 locks tm2 (potential deadlock setup)
- **Both sleep 100ms** while holding first lock
- **Then try second lock with 50ms timeout**
- **Typical scenario:**
  - T1 has tm1, tries tm2 (held by T2)
  - T2 has tm2, tries tm1 (held by T1)
  - Both wait 50ms
  - **Both timeout** (50ms < 100ms sleep)
  - Both print timeout message
  - Both unlock first mutex
- **Timeout breaks deadlock:** Threads don't wait forever
- **Alternative outcome:** If timing varies, one might succeed
- **Not a perfect solution:** Still wastes time, doesn't prevent issue
- **Better:** Use std::lock(tm1, tm2) to prevent deadlock
- **Timeout advantages:** System remains responsive, can retry
- **Key Concept:** Timeout recovery from potential deadlock; bounded waiting prevents indefinite hang

---

#### Q10
```cpp
std::shared_mutex smtx;
int data = 0;

void reader(int id) {
    std::shared_lock<std::shared_mutex> lock(smtx);
    std::cout << "Reader " << id << ": " << data << "\n";
}

void writer(int value) {
    std::unique_lock<std::shared_mutex> lock(smtx);
    data = value;
    std::cout << "Wrote " << value << "\n";
}

int main() {
    std::thread r1(reader, 1);
    std::thread r2(reader, 2);
    std::thread w(writer, 42);
    r1.join(); r2.join(); w.join();
}
```

**Answer:**
```
Multiple readers or single writer executes (order varies)
Output includes "Reader 1", "Reader 2", "Wrote 42" in some order
```

**Explanation:**
- **std::shared_mutex: Multiple readers OR single writer**
- **shared_lock: Allows concurrent reads** (multiple readers simultaneously)
- **unique_lock: Exclusive write** (blocks all others)
- **Possible execution orders:**
  - Both readers first (concurrently), then writer
  - Writer first, then both readers (concurrently)
  - One reader, writer, other reader
- **Readers can run together:** No conflict
- **Writer must be alone:** Blocks all readers and other writers
- **No data race:** Synchronization ensures safety
- **Performance benefit:** Multiple concurrent reads (common case)
- **Use case:** Read-heavy workloads (many reads, few writes)
- **Example:** Configuration data, cache lookups
- **Key Concept:** Readers-writer lock allows concurrent reads; improves performance for read-heavy scenarios

---

#### Q11
```cpp
std::mutex mtx;
bool initialized = false;
int resource = 0;

void lazy_init() {
    if (!initialized) {
        std::lock_guard<std::mutex> lock(mtx);
        if (!initialized) {
            resource = 100;
            initialized = true;
        }
    }
    std::cout << resource << "\n";
}
```

**Answer:**
```
Output: "100" from all threads (correct double-checked locking)
```

**Explanation:**
- **Double-checked locking pattern**
- **First check (outside lock):** Fast path for already-initialized case
- **Second check (inside lock):** Ensures only one thread initializes
- **Execution flow:**
  1. Thread checks `!initialized` (no lock)
  2. If true, acquires lock
  3. **Checks again** (another thread might have initialized while waiting)
  4. If still uninitialized, does initialization
  5. Releases lock
  6. Prints 100
- **Why two checks:**
  - First check: Avoids lock overhead after initialization
  - Second check: Prevents double initialization
- **After first thread initializes:** Other threads skip lock entirely
- **Performance:** Lock only during initialization, not every call
- **C++ correctness:** Works with proper memory ordering
- **In C++:** Better to use std::call_once instead
- **Key Concept:** Lazy initialization with double-checked locking; optimizes lock overhead for common case

---

#### Q12
```cpp
int data1 = 0;
int data2 = 0;

void writer() {
    data1 = 42;
    data2 = 42;
}

void reader() {
    int snapshot1 = data1;
    int snapshot2 = data2;
    if (snapshot1 != snapshot2) {
        std::cout << "Inconsistent\n";
    }
}
```

**Answer:**
```
May print "Inconsistent"
```

**Explanation:**
- **No synchronization between writer and reader**
- **Data race on both data1 and data2**
- **Reader can see partial write:**
  1. Writer sets data1=42
  2. **Reader interrupts** (context switch)
  3. Reader reads data1=42
  4. Reader reads data2=0 (not yet written)
  5. snapshot1=42, snapshot2=0
  6. **Inconsistent state** - prints "Inconsistent"
- **Write is not atomic:** Two separate assignments
- **Reader sees inconsistent snapshot:** Values from different times
- **Classic torn read:** Seeing partial update
- **This violates invariant:** Both should always be equal
- **Fix 1:** Protect both with same mutex
- **Fix 2:** Use single atomic variable or struct
- **Fix 3:** Use std::atomic with memory ordering
- **Demonstrates need for synchronization**
- **Key Concept:** Read-write race allows partial observation; reader sees inconsistent state

---

#### Q13
```cpp
std::atomic<int> flag{0};

void thread1() {
    if (flag.load() == 0) {
        flag.store(1);
        std::cout << "Thread 1 executed\n";
    }
}

void thread2() {
    if (flag.load() == 0) {
        flag.store(1);
        std::cout << "Thread 2 executed\n";
    }
}
```

**Answer:**
```
Both threads might print (race on check-then-act)
```

**Explanation:**
- **Atomic variable but non-atomic operation**
- **Check-then-act is TWO operations:** load, then store
- **Race window between operations:**
  1. T1 loads: flag=0 (check passes)
  2. T2 loads: flag=0 (check passes, T1 hasn't stored yet)
  3. T1 stores: flag=1
  4. T1 prints "Thread 1 executed"
  5. T2 stores: flag=1
  6. T2 prints "Thread 2 executed"
- **Both threads execute** even though only one should
- **Atomic operations don't make sequences atomic**
- **Each individual operation is atomic** but composite is not
- **Fix:** Use compare_exchange
  ```cpp
  int expected = 0;
  if (flag.compare_exchange_strong(expected, 1)) {
      std::cout << "Executed\n";
  }
  ```
- **compare_exchange is atomic check-and-set**
- **Key Concept:** Atomic check-then-act race; atomic variables don't make compound operations atomic

---

#### Q14
```cpp
std::mutex mtx;
int counter = 0;

void increment() {
    int temp = counter;
    std::lock_guard<std::mutex> lock(mtx);
    counter = temp + 1;
}

int main() {
    std::thread t1(increment);
    std::thread t2(increment);
    t1.join(); t2.join();
    std::cout << counter << "\n";
}
```

**Answer:**
```
Output: 1 (lost update)
Expected: 2
```

**Explanation:**
- **Read-modify-write race with misplaced lock**
- **Critical error:** Read outside lock, write inside
- **Race scenario:**
  1. T1 reads: temp=0 (no lock!)
  2. T2 reads: temp=0 (no lock, before T1 writes!)
  3. T1 locks, writes counter=0+1=1
  4. T1 unlocks
  5. T2 locks, writes counter=0+1=1 (overwrites!)
  6. T2 unlocks
  7. **counter=1** (should be 2)
- **Classic lost update**
- **Lock too late:** Read must also be protected
- **Both threads read same value** before either writes
- **Fix:** Move read inside lock
  ```cpp
  std::lock_guard<std::mutex> lock(mtx);
  int temp = counter;
  counter = temp + 1;
  ```
- **Or simpler:** `counter++` inside lock
- **Common mistake:** Only protecting write
- **Key Concept:** Read-modify-write race when read unprotected; entire operation must be atomic

---

#### Q15
```cpp
class Resource {
public:
    static Resource& instance() {
        static Resource res;
        return res;
    }
private:
    Resource() { std::cout << "Initialized\n"; }
};

int main() {
    std::thread t1([]{ Resource::instance(); });
    std::thread t2([]{ Resource::instance(); });
    std::thread t3([]{ Resource::instance(); });
    t1.join(); t2.join(); t3.join();
}
```

**Answer:**
```
Output: "Initialized" once
```

**Explanation:**
- **Meyers' Singleton pattern**
- **static local variable** (function-local static)
- **C++11 guarantee:** Thread-safe static local initialization
- **First call behavior:**
  - One thread enters instance() first
  - Begins initializing static Resource res
  - **Other threads block** until initialization completes
  - Constructor runs once: prints "Initialized"
  - All threads share same instance
- **Subsequent calls:** Return already-initialized instance immediately
- **No explicit synchronization needed**
- **Compiler implements:**
  - Guard variable to track initialization state
  - Mutex to protect initialization
  - Atomic operations for fast path
- **Lazy initialization:** Created on first use
- **Destruction:** Automatic at program exit
- **Preferred singleton pattern in modern C++**
- **Key Concept:** Meyers' Singleton with thread-safe static local initialization; C++11 guarantees safety

---

#### Q16
```cpp
std::mutex m1, m2, m3;

void thread_func() {
    std::lock(m1, m2, m3);
    std::lock_guard<std::mutex> lg1(m1);  // Missing adopt_lock
    std::lock_guard<std::mutex> lg2(m2);
    std::lock_guard<std::mutex> lg3(m3);
    std::cout << "Locked all\n";
}
```

**Answer:**
```
Deadlock
```

**Explanation:**
- **std::lock(m1, m2, m3) locks all three mutexes**
- **All mutexes now locked**
- **lg1 construction:** Tries to lock m1 (already locked!)
- **lock_guard constructor locks by default**
- **Attempting to lock already-locked mutex:**
  - Non-recursive mutex (std::mutex)
  - Same thread trying to lock twice
  - **Self-deadlock:** Thread blocks on itself
- **Program hangs at lg1 construction**
- **Bug:** Missing std::adopt_lock parameter
- **Should be:**
  ```cpp
  std::lock_guard<std::mutex> lg1(m1, std::adopt_lock);
  std::lock_guard<std::mutex> lg2(m2, std::adopt_lock);
  std::lock_guard<std::mutex> lg3(m3, std::adopt_lock);
  ```
- **adopt_lock tells lock_guard:** "Mutex already locked, just adopt ownership"
- **Pattern:** std::lock + adopt_lock for multiple mutexes
- **Key Concept:** Missing adopt_lock causes self-deadlock; adopt_lock tells RAII wrapper mutex already locked

---

#### Q17
```cpp
std::atomic<bool> ready{false};
int data = 0;

void writer() {
    data = 42;
    ready.store(true);
}

void reader() {
    while (!ready.load()) {}
    std::cout << data << "\n";
}
```

**Answer:**
```
May print 0 or 42 (memory reordering possible)
Expected: 42
```

**Explanation:**
- **Memory ordering problem**
- **Intended behavior:**
  1. Writer sets data=42
  2. Writer sets ready=true (flag)
  3. Reader spins until ready=true
  4. Reader reads data (expects 42)
- **Actual problem: Compiler/CPU may reorder**
- **Without proper memory ordering:**
  - Writes can be reordered: ready=true before data=42
  - Reader sees ready=true but data still 0
- **Default memory_order_relaxed allows reordering**
- **Reader might print 0**
- **Fix: Use release-acquire semantics:**
  ```cpp
  ready.store(true, std::memory_order_release);  // Writer
  while (!ready.load(std::memory_order_acquire)) {}  // Reader
  ```
- **Release-acquire ensures:**
  - All writes before store(release) visible after load(acquire)
  - Prevents reordering across the sync point
- **Key Concept:** Memory reordering race without proper ordering; use release-acquire for synchronization

---

#### Q18
```cpp
std::mutex mtx;
std::unordered_map<int, int> cache;

void update(int key) {
    {
        std::lock_guard<std::mutex> lock(mtx);
        int current = cache[key];
    }

    int updated = current + 1;  // current out of scope!

    {
        std::lock_guard<std::mutex> lock(mtx);
        cache[key] = updated;
    }
}
```

**Answer:**
```
Compilation error: 'current' was not declared in this scope
```

**Explanation:**
- **Scoping error combined with race condition**
- **Variable `current` declared inside first lock block**
- **Scope ends at closing brace**
- **Outside that scope:** `current` doesn't exist
- **Line `int updated = current + 1;` tries to use undefined variable**
- **Compiler error:** current not in scope
- **Even if fixed:** Would still have race condition
  - Read and write not atomic
  - Another thread could modify between locks
- **Fix 1:** Declare current before first lock
  ```cpp
  int current;
  {
      std::lock_guard lock(mtx);
      current = cache[key];
  }
  int updated = current + 1;
  {
      std::lock_guard lock(mtx);
      cache[key] = updated;
  }
  ```
- **Fix 2 (better):** Single lock for entire operation
  ```cpp
  std::lock_guard lock(mtx);
  cache[key] = cache[key] + 1;
  ```
- **Key Concept:** Scoping error plus race condition; compound operations need single critical section

---

#### Q19
```cpp
std::recursive_mutex rmtx;

void outer() {
    std::lock_guard<std::recursive_mutex> lock1(rmtx);
    inner();
    std::cout << "Outer\n";
}

void inner() {
    std::lock_guard<std::recursive_mutex> lock2(rmtx);
    std::cout << "Inner\n";
}

int main() {
    std::thread t(outer);
    t.join();
}
```

**Answer:**
```
Output:
Inner
Outer
```

**Explanation:**
- **Recursive mutex allows same thread to lock multiple times**
- Thread execution flow:
  1. outer() called
  2. lock1 acquires rmtx (count=1)
  3. Calls inner()
  4. lock2 acquires rmtx again (count=2)
  5. **No deadlock:** Recursive mutex allows this
  6. Prints "Inner"
  7. lock2 destroyed: rmtx count decrements (count=1)
  8. Returns to outer()
  9. Prints "Outer"
  10. lock1 destroyed: rmtx count decrements (count=0, fully unlocked)
- **Lock count tracks depth**
- **Must unlock same number of times as locked**
- **Use cases:** Recursive functions, callbacks, re-entrant code
- **Performance cost:** Tracking overhead vs regular mutex
- **Alternative design:** Refactor to avoid recursion
- **Key Concept:** Recursive locking allows nested acquisitions; must unlock equal number of times

---

#### Q20
```cpp
std::mutex m1, m2;

void thread1() {
    std::lock_guard<std::mutex> lock1(m1);
    std::lock_guard<std::mutex> lock2(m2);
    std::cout << "Thread 1\n";
}

void thread2() {
    std::lock_guard<std::mutex> lock1(m1);
    std::lock_guard<std::mutex> lock2(m2);
    std::cout << "Thread 2\n";
}
```

**Answer:**
```
Output: "Thread 1" and "Thread 2" (serialized, no deadlock)
```

**Explanation:**
- **Consistent lock ordering prevents deadlock**
- **Both threads lock in same order:** m1 first, then m2
- **Cannot deadlock:**
  - No circular wait condition possible
  - Whoever gets m1 first will complete fully
- **Execution scenarios:**
  - **Scenario A:**
    1. T1 locks m1
    2. T1 locks m2
    3. T1 prints, unlocks both
    4. T2 locks m1
    5. T2 locks m2
    6. T2 prints, unlocks both
  - **Scenario B:** Reverse order (T2 first, then T1)
- **Threads serialize:** Cannot run simultaneously
- **But no deadlock:** Always makes progress
- **Key principle:** Total ordering on locks prevents deadlock
- **Best practice:** Define and maintain consistent lock order
- **Performance:** Serialization reduces concurrency
- **Key Concept:** Consistent lock ordering prevents deadlock; threads serialize but always make progress

---
