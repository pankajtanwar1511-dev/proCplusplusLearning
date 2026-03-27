## TOPIC: Mutex and Locking Mechanisms - Synchronization Primitives

### PRACTICE_TASKS: Output Prediction and Code Analysis

#### Q1
```cpp
std::mutex mtx;
int counter = 0;

void increment() {
    for (int i = 0; i < 1000; ++i) {
        ++counter;  // No lock
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
Output: < 2000 (value varies, typically 1000-1999)
```

**Explanation:**
- Two threads both increment counter 1000 times
- **No synchronization:** counter accessed without mutex lock
- ++counter is NOT atomic (read-modify-write operation)
- **Race condition:** Both threads read/write simultaneously
- Example race: T1 reads 5, T2 reads 5, both write 6 (lost increment!)
- Expected: 2000, Actual: varies (1000-1999)
- **Data race = undefined behavior**
- Some increments lost due to concurrent access
- **Fix:** Lock mtx before ++counter
- **Classic bug:** Forgetting synchronization for shared data
- **Key Concept:** Data race occurs without synchronization; shared mutable state requires mutex protection

---

#### Q2
```cpp
std::mutex mtx;

void func() {
    mtx.lock();
    std::cout << "Locked\n";
    mtx.lock();  // Same thread, same mutex
}
```

**Answer:**
```
Deadlock
```

**Explanation:**
- First mtx.lock() succeeds, acquires mutex
- Prints "Locked"
- Second mtx.lock() on same thread
- **std::mutex is non-recursive**
- Cannot be locked twice by same thread
- Second lock blocks waiting for unlock
- **But unlock never happens:** Thread waiting for itself
- **Self-deadlock:** Thread deadlocks on itself
- Program hangs forever
- **Fix:** Use std::recursive_mutex OR don't lock twice
- **Why non-recursive default:** Performance (recursive mutex has overhead)
- **Key Concept:** Self-deadlock occurs when same thread tries locking non-recursive mutex twice

---

#### Q3
```cpp
std::mutex mtx;

void task() {
    std::lock_guard<std::mutex> lock(mtx);
    std::cout << "Task\n";
    throw std::runtime_error("Error");
}

int main() {
    try {
        std::thread t(task);
        t.join();
    } catch (...) {}
    std::cout << "Done\n";
}
```

**Answer:**
```
Program terminates (std::terminate called)
```

**Explanation:**
- Thread t starts executing task()
- lock_guard acquires mutex
- Prints "Task"
- **Exception thrown in thread**
- lock_guard destructor runs (RAII unlocks mutex)
- **But exception not caught inside thread**
- **Exceptions don't cross thread boundaries**
- Uncaught exception in thread → std::terminate()
- Program aborts immediately
- catch(...) in main CANNOT catch thread exceptions
- "Done" never prints
- **Fix:** Catch exception inside task() or use std::future
- **Key Concept:** Thread exception handling must be inside thread; uncaught exceptions terminate program despite external catch blocks

---

#### Q4
```cpp
std::mutex mtx;

void work() {
    std::unique_lock<std::mutex> lock(mtx);
    std::cout << "First\n";
    lock.unlock();
    lock.unlock();  // Unlock twice
}
```

**Answer:**
```
Undefined behavior (or exception)
```

**Explanation:**
- unique_lock acquires mutex
- Prints "First"
- First lock.unlock(): Releases mutex, lock.owns_lock() becomes false
- **Second lock.unlock(): Trying to unlock already-unlocked mutex**
- unique_lock checks owns_lock() before unlocking
- If !owns_lock(): throws std::system_error
- If check not performed: undefined behavior
- **Standard behavior:** Should throw std::system_error
- **Bug:** Double-unlock pattern
- **Fix:** Check lock.owns_lock() before second unlock
- **Key Concept:** Double unlock is undefined behavior; unique_lock tracks ownership to detect this

---

#### Q5
```cpp
std::mutex m1, m2;

void thread_A() {
    std::lock_guard<std::mutex> lock1(m1);
    std::this_thread::sleep_for(std::chrono::milliseconds(10));
    std::lock_guard<std::mutex> lock2(m2);
}

void thread_B() {
    std::lock_guard<std::mutex> lock2(m2);
    std::this_thread::sleep_for(std::chrono::milliseconds(10));
    std::lock_guard<std::mutex> lock1(m1);
}
```

**Answer:**
```
Likely deadlock
```

**Explanation:**
- **Thread A:** Locks m1, sleeps, tries to lock m2
- **Thread B:** Locks m2, sleeps, tries to lock m1
- **Interleaving:**
  - A locks m1
  - B locks m2
  - A tries m2 (blocked by B)
  - B tries m1 (blocked by A)
- **Circular wait:** A waits for B, B waits for A
- Classic deadlock scenario
- **Lock ordering problem:** Different acquisition order
- **Fix:** Always acquire locks in same order (e.g., m1 then m2 in both)
- **Or use:** std::lock(m1, m2) for deadlock-free acquisition
- **Key Concept:** Lock ordering deadlock from circular wait; consistent ordering prevents deadlock

---

#### Q6
```cpp
std::mutex m1, m2;

void safe_lock() {
    std::lock(m1, m2);
    std::lock_guard<std::mutex> lg1(m1);  // Missing std::adopt_lock
    std::lock_guard<std::mutex> lg2(m2);
}
```

**Answer:**
```
Deadlock
```

**Explanation:**
- std::lock(m1, m2) locks both mutexes (already locked!)
- **lg1 construction:** Tries to lock m1
- **But m1 already locked by std::lock()**
- lg1 constructor deadlocks trying to acquire already-locked m1
- **Bug:** Missing std::adopt_lock parameter
- std::adopt_lock tells lock_guard "mutex already locked, just adopt ownership"
- **Should be:** std::lock_guard<std::mutex> lg1(m1, std::adopt_lock);
- Without adopt_lock: tries to re-lock
- **Pattern:** std::lock + adopt_lock for multiple mutexes
- **Key Concept:** Missing adopt_lock causes deadlock; adopt_lock tells RAII wrapper mutex is already locked

---

#### Q7
```cpp
std::recursive_mutex rmtx;

void outer() {
    std::lock_guard<std::recursive_mutex> lock1(rmtx);
    inner();
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
Output: "Inner"
```

**Explanation:**
- Thread calls outer()
- lock1 acquires rmtx (first lock)
- Calls inner()
- **lock2 tries to acquire rmtx again**
- **std::recursive_mutex allows same thread to relock**
- rmtx locked twice by same thread
- Prints "Inner"
- lock2 destroyed: decrements lock count
- lock1 destroyed: fully releases mutex
- **Recursive mutex tracks lock count per thread**
- Must unlock same number of times as locked
- **Use case:** Recursive functions, callbacks
- **Cost:** Overhead vs regular mutex
- **Key Concept:** Recursive locking allows same thread multiple acquisitions; must unlock equal times

---

#### Q8
```cpp
std::mutex mtx;
std::unique_lock<std::mutex> lock(mtx, std::defer_lock);

std::cout << std::boolalpha << lock.owns_lock() << "\n";
lock.lock();
std::cout << lock.owns_lock() << "\n";
```

**Answer:**
```
false
true
```

**Explanation:**
- unique_lock constructed with std::defer_lock
- **defer_lock means:** Don't lock immediately
- unique_lock created but mutex not locked
- lock.owns_lock() returns false (doesn't own mutex yet)
- Prints "false"
- lock.lock() manually acquires mutex
- Now owns_lock() returns true
- Prints "true"
- **Deferred locking use cases:** std::lock with multiple mutexes, conditional locking
- **Benefits:** Flexibility to lock later
- **Still RAII:** Destructor unlocks if locked
- **Key Concept:** Deferred locking allows manual lock timing; unique_lock tracks ownership separately from construction

---

#### Q9
```cpp
std::timed_mutex tmtx;

if (tmtx.try_lock_for(std::chrono::milliseconds(100))) {
    std::cout << "Locked\n";
    tmtx.unlock();
} else {
    std::cout << "Timeout\n";
}
```

**Answer:**
```
Locked
```

**Explanation:**
- std::timed_mutex supports timeout-based locking
- try_lock_for(100ms): Try to acquire for up to 100ms
- **Mutex uncontended:** Available immediately
- Acquires lock instantly (doesn't wait 100ms)
- Returns true
- Prints "Locked"
- tmtx.unlock() releases
- **If contended:** Would wait up to 100ms
- **Use case:** Avoid indefinite waiting
- **Better pattern:** Use std::unique_lock<std::timed_mutex> with try_lock_for
- **Key Concept:** Timed locking prevents indefinite waits; succeeds immediately if uncontended

---

#### Q10
```cpp
std::shared_mutex smtx;

void reader() {
    std::shared_lock<std::shared_mutex> lock(smtx);
    std::cout << "Reading\n";
}

void writer() {
    std::unique_lock<std::shared_mutex> lock(smtx);
    std::cout << "Writing\n";
}

int main() {
    std::thread r1(reader);
    std::thread r2(reader);
    std::thread w(writer);
    r1.join(); r2.join(); w.join();
}
```

**Answer:**
```
Output includes "Reading" (2x) and "Writing" (order varies)
```

**Explanation:**
- std::shared_mutex supports shared (read) and exclusive (write) locking
- **Readers (shared_lock):** Multiple can hold simultaneously
- **Writer (unique_lock):** Exclusive access, blocks all others
- r1 and r2 can read concurrently
- Writer w must wait for readers OR readers wait for writer
- **Output order unpredictable:** Depends on scheduler
- Possible: "Reading Reading Writing" or "Writing Reading Reading"
- **Pattern:** Reader-writer lock
- **Use case:** Many reads, few writes
- **Performance:** Better than exclusive mutex for read-heavy workloads
- **Key Concept:** Shared mutex allows multiple readers or single writer; improves concurrency for read-heavy scenarios

---

#### Q11
```cpp
std::mutex mtx;

void process() {
    std::lock_guard<std::mutex> lock(mtx);
    std::lock_guard<std::mutex> lock2(mtx);  // Same mutex
}
```

**Answer:**
```
Deadlock
```

**Explanation:**
- lock acquires mtx
- **lock2 tries to acquire same mtx**
- std::mutex is non-recursive
- Same thread cannot lock twice
- **Self-deadlock:** Thread blocks on itself
- lock2 waits forever (lock holds mutex)
- Program hangs
- **Bug pattern:** Nested locking without recursive mutex
- **Fix 1:** Use std::recursive_mutex
- **Fix 2:** Refactor to avoid nested locking
- **Why this happens:** Function calls another function, both lock same mutex
- **Key Concept:** Self-deadlock from non-recursive mutex locked twice; use recursive_mutex or refactor

---

#### Q12
```cpp
std::mutex mtx;
std::vector<int> data;

void add(int val) {
    std::lock_guard<std::mutex> lock(mtx);
    data.push_back(val);
}

int main() {
    std::thread t1(add, 1);
    std::thread t2(add, 2);
    std::thread t3(add, 3);
    t1.join(); t2.join(); t3.join();

    std::lock_guard<std::mutex> lock(mtx);
    for (int v : data) std::cout << v << " ";
}
```

**Answer:**
```
1 2 3 (order may vary)
```

**Explanation:**
- Three threads each call add() with different values
- **Each add() locks mutex before push_back**
- Thread-safe insertions
- No data race on vector
- **Order depends on scheduling:** Could be "1 2 3", "2 1 3", "3 1 2", etc.
- All join() before reading
- **Read also locks mutex** (good practice, though threads finished)
- Prints all three values
- **Pattern:** Mutex protects shared container
- **Note:** Order not guaranteed (need ordering mechanism for that)
- **Key Concept:** Container protection with mutex ensures thread-safe modifications; order depends on scheduling

---

#### Q13
```cpp
std::mutex mtx;

void task() {
    mtx.lock();
    std::cout << "Working\n";
    return;  // Early return
    mtx.unlock();
}
```

**Answer:**
```
Deadlock on subsequent calls
```

**Explanation:**
- mtx.lock() acquires mutex
- Prints "Working"
- **Early return without unlocking**
- mtx.unlock() never reached
- Mutex remains locked forever
- **First call:** Works (prints "Working")
- **Second call:** Deadlocks (mutex still locked)
- **Bug:** Missing unlock on early return path
- **This is why RAII exists:** lock_guard/unique_lock prevent this
- **Fix:** Use std::lock_guard (automatic unlock in all paths)
- **Manual locking anti-pattern:** Easy to forget unlock
- **Key Concept:** Missing unlock on early return causes deadlock; RAII lock guards prevent this bug

---

#### Q14
```cpp
std::once_flag flag;

void initialize() {
    std::cout << "Init\n";
}

int main() {
    std::thread t1([]{ std::call_once(flag, initialize); });
    std::thread t2([]{ std::call_once(flag, initialize); });
    std::thread t3([]{ std::call_once(flag, initialize); });
    t1.join(); t2.join(); t3.join();
}
```

**Answer:**
```
Init
```

**Explanation:**
- std::call_once ensures function runs exactly once
- Three threads all call std::call_once
- **Only first thread executes initialize()**
- Other threads block until completion, then return without calling
- Prints "Init" exactly once
- **Thread-safe initialization**
- **Use case:** Lazy initialization, singletons
- **Pattern:** Better than double-checked locking
- **once_flag tracks:** Has function been called?
- **Performance:** Very fast after first call
- **Key Concept:** One-time initialization with call_once; thread-safe lazy initialization pattern

---

#### Q15
```cpp
std::mutex m1, m2;

std::lock(m1, m2);
std::lock_guard<std::mutex> lg1(m1, std::adopt_lock);
std::lock_guard<std::mutex> lg2(m2, std::adopt_lock);
std::cout << "Locked both\n";
```

**Answer:**
```
Locked both
```

**Explanation:**
- **std::lock(m1, m2):** Locks both mutexes atomically (deadlock-free)
- Both mutexes now locked
- **lg1 with adopt_lock:** Adopts ownership of already-locked m1
- **lg2 with adopt_lock:** Adopts ownership of already-locked m2
- No re-locking attempted
- Prints "Locked both"
- **Destructors automatically unlock** (RAII)
- **Correct pattern for multiple mutexes**
- **Why std::lock:** Prevents deadlock with smart algorithm
- **Why adopt_lock:** Tells lock_guard mutex already locked
- **Key Concept:** Multi-mutex locking with std::lock + adopt_lock prevents deadlock and provides RAII

---

#### Q16
```cpp
std::mutex mtx;

void func() {
    std::unique_lock<std::mutex> lock(mtx);
    lock.unlock();
    std::cout << "Work\n";
    lock.lock();
    std::cout << "Locked again\n";
}
```

**Answer:**
```
Work
Locked again
```

**Explanation:**
- unique_lock acquires mutex
- **lock.unlock():** Manually releases mutex
- Mutex now available for others
- Prints "Work" (without holding lock)
- **lock.lock():** Manually re-acquires mutex
- Mutex locked again
- Prints "Locked again"
- **Destructor still unlocks** (knows lock is held)
- **Flexibility:** Can unlock/relock mid-scope
- **Use case:** Long operation, want to hold lock only when needed
- **vs lock_guard:** lock_guard cannot manually unlock
- **Key Concept:** Flexible locking with unique_lock supports manual lock/unlock; optimizes lock hold time

---

#### Q17
```cpp
std::mutex mtx1;
std::mutex mtx2 = std::move(mtx1);  // Try to move mutex
```

**Answer:**
```
Compilation error
```

**Explanation:**
- Attempting to move mtx1 to mtx2
- **std::mutex is not movable**
- Move constructor deleted
- **Also not copyable**
- **Reason:** Mutex is OS-level resource handle
- Moving would invalidate threads waiting on mutex
- **Design:** Mutexes are meant to be fixed in memory
- **Workaround:** Use std::unique_ptr<std::mutex> if needed
- **Related:** std::lock_guard/unique_lock ARE movable
- **Key Concept:** Mutex is non-movable type; cannot be copied or moved, only pointers to mutexes can be moved

---

#### Q18
```cpp
std::recursive_mutex rmtx;

void recurse(int n) {
    if (n == 0) return;
    std::lock_guard<std::recursive_mutex> lock(rmtx);
    std::cout << n << " ";
    recurse(n - 1);
}

int main() {
    std::thread t(recurse, 3);
    t.join();
}
```

**Answer:**
```
3 2 1
```

**Explanation:**
- recurse(3) called in thread
- **n=3:** lock acquires rmtx (count=1), prints "3", calls recurse(2)
- **n=2:** lock acquires rmtx again (count=2), prints "2", calls recurse(1)
- **n=1:** lock acquires rmtx again (count=3), prints "1", calls recurse(0)
- **n=0:** Returns immediately
- **Unwinding:** Each lock_guard destructor decrements count
- Final unlock when count reaches 0
- **Recursive mutex essential:** Regular mutex would deadlock
- **Lock count:** Tracks acquisitions per thread
- **Key Concept:** Recursive locking with nested function calls; lock count tracks depth

---

#### Q19
```cpp
std::mutex mtx;
int data = 0;

void modify() {
    std::lock_guard<std::mutex> lock(mtx);
    ++data;
    if (data == 5) throw std::runtime_error("Error");
}

int main() {
    for (int i = 0; i < 10; ++i) {
        try {
            std::thread t(modify);
            t.join();
        } catch (...) {}
    }
    std::cout << data << "\n";
}
```

**Answer:**
```
Program terminates
```

**Explanation:**
- Loop creates threads to modify data
- **When data reaches 5:** modify() throws exception
- lock_guard destructor unlocks mutex (RAII works)
- **But exception in thread, not in main**
- **Exceptions don't cross thread boundary**
- Uncaught exception in thread → std::terminate()
- Program aborts at i=4 (when data becomes 5)
- **catch in main cannot catch thread exception**
- **Fix:** Catch exception inside modify()
- **Or use:** std::async/std::future to transport exception
- **Key Concept:** Exception in thread bypasses external catch; must be caught inside thread to avoid termination

---

#### Q20
```cpp
std::timed_mutex tmtx;

bool locked = tmtx.try_lock_for(std::chrono::seconds(0));
std::cout << std::boolalpha << locked << "\n";
if (locked) tmtx.unlock();
```

**Answer:**
```
true
```

**Explanation:**
- try_lock_for with zero duration
- **Zero timeout:** Try immediately, don't wait
- Mutex uncontended (available)
- **Acquires immediately:** Returns true
- Prints "true"
- Conditional unlock (good practice)
- **Even with zero duration:** Can succeed if available
- **Use case:** Non-blocking attempt
- **vs try_lock():** try_lock() also non-blocking but no timeout parameter
- **Key Concept:** Try-lock with timeout works even with zero duration; succeeds immediately if uncontended

---
