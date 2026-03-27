## TOPIC: Condition Variables - Thread Synchronization and Event Notification

### PRACTICE_TASKS: Output Prediction and Code Analysis

#### Q1
```cpp
std::mutex mtx;
std::condition_variable cv;
bool ready = false;

void worker() {
    std::unique_lock<std::mutex> lock(mtx);
    cv.wait(lock);  // No predicate
    std::cout << "Working\n";
}

void notifier() {
    std::this_thread::sleep_for(std::chrono::milliseconds(100));
    cv.notify_one();
}
```

**Answer:**
```
May work or spurious wakeup may cause issues
```

**Explanation:**
- **cv.wait(lock) called WITHOUT predicate** - dangerous pattern
- **Spurious wakeup:** Thread can wake up even without notification
- **What happens:**
  1. Worker locks mutex and calls wait()
  2. wait() atomically unlocks mutex and blocks
  3. Notifier sleeps 100ms, then calls notify_one()
  4. Worker wakes up, reacquires lock, continues
- **Problem: Spurious wakeups are ALLOWED by the standard**
  - OS or implementation can wake thread without notify_one()
  - Thread wakes, ready still false, proceeds anyway
  - No way to distinguish spurious vs real wakeup
- **Possible outcomes:**
  - Usually works (notification received)
  - Sometimes fails (spurious wakeup before notification)
  - Undefined behavior (ready not checked)
- **Fix:** Always use predicate
  ```cpp
  cv.wait(lock, []{ return ready; });
  ```
- **Predicate rechecked after wakeup** - handles spurious wakeups automatically
- **Why spurious wakeups exist:** Performance optimization in kernel scheduling
- **Rule:** NEVER use cv.wait() without predicate in production code
- **Key Concept:** Spurious wakeups require predicate; wait() without predicate is unreliable

---

#### Q2
```cpp
std::mutex mtx;
std::condition_variable cv;
bool ready = false;

void producer() {
    ready = true;  // No lock
    cv.notify_one();
}

void consumer() {
    std::unique_lock<std::mutex> lock(mtx);
    cv.wait(lock, []{ return ready; });
    std::cout << "Ready\n";
}
```

**Answer:**
```
Race condition possible but predicate likely saves it
```

**Explanation:**
- **ready modified without lock** - data race!
- **Consumer uses lock but producer doesn't** - inconsistent synchronization
- **Race condition on ready:**
  - Producer: writes ready=true (unsynchronized)
  - Consumer: reads ready in predicate (synchronized)
  - Concurrent read-write without synchronization = undefined behavior
- **Why it "likely works":**
  - Predicate is checked BEFORE waiting
  - If producer runs first: ready=true, consumer sees it immediately
  - If consumer waits: notification arrives, predicate rechecks ready
  - **Predicate acts as safety net** for missed notifications
- **Why it's STILL WRONG:**
  - Data race on bool is undefined behavior
  - Compiler can reorder operations
  - No memory synchronization between threads
  - May fail on different architectures/compilers
- **Correct version:**
  ```cpp
  void producer() {
      {
          std::lock_guard<std::mutex> lock(mtx);
          ready = true;
      }
      cv.notify_one();
  }
  ```
- **Rule:** Shared state (ready) must be protected by same mutex as cv
- **Key Concept:** Race on condition variable state; predicate helps but doesn't fix data race

---

#### Q3
```cpp
std::mutex mtx;
std::condition_variable cv;
bool ready = false;

void notifier() {
    {
        std::lock_guard<std::mutex> lock(mtx);
        ready = true;
    }
    cv.notify_one();
}

void waiter() {
    std::this_thread::sleep_for(std::chrono::seconds(1));
    std::unique_lock<std::mutex> lock(mtx);
    cv.wait(lock, []{ return ready; });
    std::cout << "Done\n";
}
```

**Answer:**
```
Output: "Done"
```

**Explanation:**
- **Early notification pattern** - notification BEFORE waiting
- **Execution scenario:**
  1. Waiter starts, sleeps 1 second
  2. Notifier runs immediately: locks, sets ready=true, unlocks
  3. Notifier calls notify_one() (no one waiting yet!)
  4. Waiter wakes from sleep after 1 second
  5. Waiter locks mutex, calls cv.wait()
  6. **Predicate checked BEFORE waiting:** ready=true
  7. wait() returns immediately without blocking
  8. Prints "Done"
- **Why it works:**
  - **Predicate prevents lost wakeup**
  - wait() checks condition first: if already true, doesn't wait
  - Notification was "lost" but doesn't matter
- **Without predicate:** Would wait forever (notification already sent)
- **Predicate equivalence:**
  ```cpp
  // cv.wait(lock, pred) is equivalent to:
  while (!pred()) {
      cv.wait(lock);
  }
  ```
- **Pattern is CORRECT and safe** with predicate
- **Demonstrates:** Predicates make condition variables robust to timing
- **Key Concept:** Predicate prevents lost wakeups; checks condition before waiting regardless of notification timing

---

#### Q4
```cpp
std::mutex mtx;
std::condition_variable cv;
std::queue<int> q;

void producer() {
    for (int i = 0; i < 5; ++i) {
        std::lock_guard<std::mutex> lock(mtx);
        q.push(i);
        cv.notify_all();
    }
}

void consumer() {
    for (int i = 0; i < 5; ++i) {
        std::unique_lock<std::mutex> lock(mtx);
        cv.wait(lock, [&]{ return !q.empty(); });
        std::cout << q.front() << " ";
        q.pop();
    }
}
```

**Answer:**
```
Output: "0 1 2 3 4" (order guaranteed within consumer)
```

**Explanation:**
- **notify_all() called on every push** - performance issue but works
- **Execution flow:**
  1. Producer locks, pushes 0, calls notify_all()
  2. Consumer locks, waits until !q.empty(), pops 0
  3. Producer locks, pushes 1, calls notify_all()
  4. This repeats for all 5 items
- **Why order is guaranteed:**
  - Single consumer processes in FIFO order
  - Queue maintains insertion order
  - Producer pushes 0,1,2,3,4 sequentially
- **Thundering herd problem:**
  - notify_all() wakes ALL waiting threads
  - With multiple consumers: all wake, recheck predicate
  - Only one can proceed (queue becomes empty again)
  - Others go back to sleep
  - **Wastes CPU cycles** on unnecessary wakeups
- **Better approach:** Use notify_one()
  ```cpp
  cv.notify_one();  // Wake just one waiting thread
  ```
- **When to use notify_all():**
  - Multiple threads can proceed (e.g., broadcast "shutdown")
  - Different predicates for different threads
- **Performance impact:**
  - notify_one(): O(1) thread wakeup
  - notify_all(): O(N) wakeups, N-1 go back to sleep
- **Key Concept:** notify_all() causes thundering herd; use notify_one() for single-consumer patterns

---

#### Q5
```cpp
std::mutex mtx;
std::condition_variable cv;
bool ready = false;

void worker() {
    std::unique_lock<std::mutex> lock(mtx);
    if (cv.wait_for(lock, std::chrono::milliseconds(100), []{ return ready; })) {
        std::cout << "Ready\n";
    } else {
        std::cout << "Timeout\n";
    }
}
```

**Answer:**
```
Output: "Timeout" (no notifier)
```

**Explanation:**
- **wait_for:** Waits with timeout (relative duration)
- **Execution:**
  1. Worker locks mutex
  2. Calls wait_for with 100ms timeout
  3. Predicate checked: ready=false
  4. Thread blocks, releases lock
  5. No notifier exists to set ready=true
  6. After 100ms: timeout expires
  7. Thread wakes, reacquires lock
  8. **Predicate rechecked:** ready still false
  9. wait_for returns false (timeout occurred)
  10. Prints "Timeout"
- **Return value of wait_for:**
  - **true:** Predicate became true (condition met)
  - **false:** Timeout occurred, predicate still false
- **Important: Spurious wakeups during timeout**
  - If spurious wakeup occurs at 50ms
  - Predicate rechecked: still false
  - Goes back to waiting for remaining 50ms
- **Timeout behavior:**
  - Returns when: predicate true OR timeout
  - Always rechecks predicate before returning
  - Can return true BEFORE timeout if condition met
- **Use cases:**
  - Avoid infinite waiting
  - Implement retry logic
  - Responsive shutdown mechanisms
- **Key Concept:** wait_for() with timeout; returns false if timeout occurs with predicate still false

---

#### Q6
```cpp
std::mutex mtx;
std::condition_variable cv;
int counter = 0;

void waiter() {
    std::unique_lock<std::mutex> lock(mtx);
    cv.wait(lock, [&]{ return counter > 0; });
    std::cout << counter << "\n";
}

void notifier() {
    cv.notify_one();  // Notify before setting counter
    {
        std::lock_guard<std::mutex> lock(mtx);
        counter = 10;
    }
}
```

**Answer:**
```
Waiter blocks forever
```

**Explanation:**
- **Lost wakeup problem** - classic mistake
- **Execution scenario:**
  1. Notifier calls notify_one() FIRST
  2. No one is waiting yet! Notification is "lost"
  3. Notifier locks, sets counter=10, unlocks
  4. Waiter locks, calls cv.wait()
  5. Predicate checked: counter=10, should be true... BUT
  6. **Actually counter=0** - timing issue!
- **Race condition timeline:**
  ```
  Time | Notifier              | Waiter
  -----|-----------------------|------------------
  T0   | notify_one() (lost)   | (not started)
  T1   | lock, counter=10      | (not started)
  T2   | unlock                | lock, wait(counter>0)
  T3   |                       | blocks forever
  ```
- **Why waiter blocks:**
  - Notification sent before waiter calls wait()
  - Once in wait(), will never receive that notification again
  - counter=10 but waiter doesn't know (already waiting)
- **Predicate doesn't help here** because:
  - Predicate checked WHEN entering wait()
  - If false at that moment, thread waits
  - **But counter=0 when wait() called** (timing issue)
- **Correct version:**
  ```cpp
  void notifier() {
      {
          std::lock_guard<std::mutex> lock(mtx);
          counter = 10;  // Set condition FIRST
      }
      cv.notify_one();  // THEN notify
  }
  ```
- **Rule:** Set condition BEFORE notifying
- **Key Concept:** Lost wakeup when notification before condition set; always set state before notify

---

#### Q7
```cpp
std::mutex mtx;
std::condition_variable cv;
bool start = false;

void worker(int id) {
    std::unique_lock<std::mutex> lock(mtx);
    cv.wait(lock, []{ return start; });
    std::cout << id << " ";
}

int main() {
    std::vector<std::thread> threads;
    for (int i = 0; i < 3; ++i) {
        threads.emplace_back(worker, i);
    }

    {
        std::lock_guard<std::mutex> lock(mtx);
        start = true;
    }
    cv.notify_one();  // Only notify_one

    for (auto& t : threads) t.join();
}
```

**Answer:**
```
Only one thread prints (0, 1, or 2), others wait forever
```

**Explanation:**
- **notify_one() limitation** - wakes only ONE thread
- **3 threads waiting, 1 notification** - 2 threads left waiting
- **Execution flow:**
  1. All 3 worker threads start
  2. Each locks mtx, calls wait(), releases lock
  3. All 3 are now waiting
  4. Main sets start=true
  5. Main calls notify_one()
  6. **Only ONE thread wakes** (e.g., thread 0)
  7. Thread 0 checks predicate: start=true
  8. Thread 0 prints "0 " and exits
  9. **Threads 1 and 2 NEVER wake up** - still waiting
  10. main() joins t0 (succeeds), joins t1 (blocks forever)
- **Why others don't wake:**
  - notify_one() picks arbitrary one waiting thread
  - No subsequent notifications sent
  - Other threads have no reason to wake
- **Fix: Use notify_all()**
  ```cpp
  cv.notify_all();  // Wake ALL waiting threads
  ```
- **When this happens:**
  - Multiple threads waiting on same condition
  - All should proceed when condition becomes true
  - Broadcast notification needed
- **notify_one() use case:**
  - Producer-consumer with one item: wake one consumer
  - Only one thread can/should proceed
- **Key Concept:** notify_one() wakes only one thread; use notify_all() for multiple waiters that should all proceed

---

#### Q8
```cpp
std::mutex mtx;
std::condition_variable cv;

void waiter() {
    std::lock_guard<std::mutex> lock(mtx);  // lock_guard
    cv.wait(lock, []{ return true; });
}
```

**Answer:**
```
Compilation error
```

**Explanation:**
- **Type mismatch:** cv.wait() requires unique_lock, not lock_guard
- **Compiler error:**
  ```
  no matching function for call to 'wait(std::lock_guard<std::mutex>&, ...)'
  ```
- **Why unique_lock required:**
  - wait() must **unlock** mutex while waiting
  - Then **relock** when waking up
  - lock_guard doesn't support manual unlock/lock
  - **lock_guard is RAII-only:** locks in constructor, unlocks in destructor
  - **unique_lock supports manual control:** lock(), unlock(), release()
- **Internal cv.wait() implementation:**
  ```cpp
  void wait(unique_lock& lock, Predicate pred) {
      while (!pred()) {
          lock.unlock();       // Need unlock capability
          // ... wait for notification ...
          lock.lock();         // Need lock capability
      }
  }
  ```
- **Correct version:**
  ```cpp
  std::unique_lock<std::mutex> lock(mtx);
  cv.wait(lock, []{ return true; });
  ```
- **Other places needing unique_lock:**
  - cv.wait()
  - cv.wait_for()
  - cv.wait_until()
  - Any operation requiring temporary unlock
- **When to use lock_guard vs unique_lock:**
  - **lock_guard:** Simple scope-based locking (no cv)
  - **unique_lock:** Need manual control or cv operations
- **Key Concept:** condition_variable requires unique_lock for unlock/relock capability; lock_guard insufficient

---

#### Q9
```cpp
std::mutex mtx;
std::condition_variable cv;
std::queue<int> q;

void producer() {
    {
        std::lock_guard<std::mutex> lock(mtx);
        q.push(42);
        cv.notify_one();  // Notify inside lock
    }
}

void consumer() {
    std::unique_lock<std::mutex> lock(mtx);
    cv.wait(lock, [&]{ return !q.empty(); });
    std::cout << q.front() << "\n";
}
```

**Answer:**
```
Output: "42"
```

**Explanation:**
- **Notify inside lock** - works but debated pattern
- **Execution flow:**
  1. Producer locks mtx
  2. Pushes 42 to queue
  3. **Calls notify_one() while holding lock**
  4. Producer unlocks (lock_guard destructor)
  5. Consumer (waiting) wakes up
  6. Consumer tries to reacquire lock
  7. Lock available now, consumer acquires it
  8. Predicate: !q.empty() = true
  9. Prints "42"
- **Why it works:**
  - Notification doesn't require lock to be released
  - notify_one() is just a signal to OS scheduler
  - Consumer will wake and wait for lock
- **Performance consideration:**
  - **Inside lock:** Notified thread wakes, immediately blocks on lock
  - **Outside lock:** Lock already released, thread can proceed immediately
  - **Micro-optimization:** Notify outside lock
- **Correctness consideration:**
  - **Inside lock:** Simpler reasoning, atomic state change + notify
  - **Outside lock:** Must ensure state fully updated before notify
- **Recommended pattern:**
  ```cpp
  {
      std::lock_guard<std::mutex> lock(mtx);
      q.push(42);
  }  // Lock released here
  cv.notify_one();  // Notify after unlock
  ```
- **But both are correct** - choose based on preference
- **Key Concept:** Notify inside lock is correct but potentially less efficient; notify outside lock after state change is preferred

---

#### Q10
```cpp
std::mutex mtx;
std::condition_variable cv;
bool ready = false;

void setup() {
    std::lock_guard<std::mutex> lock(mtx);
    ready = true;
    cv.notify_one();
}

void worker() {
    std::this_thread::sleep_for(std::chrono::seconds(2));
    std::unique_lock<std::mutex> lock(mtx);
    cv.wait(lock, []{ return ready; });
    std::cout << "Working\n";
}

int main() {
    std::thread t1(setup);
    std::thread t2(worker);
    t1.join(); t2.join();
}
```

**Answer:**
```
Output: "Working"
```

**Explanation:**
- **Late wait pattern** - waiter starts waiting AFTER notification
- **Timeline:**
  ```
  Time | Setup             | Worker
  -----|-------------------|------------------------
  T0   | start             | start, sleep(2s)
  T1   | lock, ready=true  | (sleeping)
  T2   | notify_one()      | (sleeping)
  T3   | unlock, exit      | (sleeping)
  T4   |                   | wake from sleep at T2
  T5   |                   | lock, call wait()
  T6   |                   | predicate: ready=true!
  T7   |                   | returns immediately
  T8   |                   | prints "Working"
  ```
- **Why notification is "lost":**
  - notify_one() called at T2
  - Worker not waiting yet (still sleeping)
  - Notification doesn't persist
- **Why it still works:**
  - **Predicate checked FIRST** when calling wait()
  - ready=true already, so condition met
  - wait() returns immediately without blocking
- **Without predicate: would fail**
  ```cpp
  cv.wait(lock);  // Would wait forever, missed notification
  ```
- **Key insight:**
  - Condition variables don't store notifications
  - Notifications are transient events
  - **Predicates make them persistent** by checking actual state
- **Pattern is SAFE** with predicate
- **Demonstrates robustness** of predicate-based waiting
- **Key Concept:** Late wait OK with predicate; predicate checks actual state regardless of notification timing

---

#### Q11
```cpp
std::mutex mtx;
std::condition_variable cv;
int value = 0;

void waiter() {
    std::unique_lock<std::mutex> lock(mtx);
    cv.wait(lock, [&]{ return value == 10; });
    std::cout << "Got 10\n";
}

void setter() {
    for (int i = 1; i <= 10; ++i) {
        {
            std::lock_guard<std::mutex> lock(mtx);
            value = i;
        }
        cv.notify_one();
    }
}
```

**Answer:**
```
Output: "Got 10"
```

**Explanation:**
- **Multiple notifications** with predicate handling
- **Execution scenario:**
  1. Waiter locks, calls wait(value==10)
  2. Predicate: value=0, false → waits
  3. Setter: sets value=1, notifies
  4. Waiter wakes, predicate: value=1, false → waits again
  5. Setter: sets value=2, notifies
  6. Waiter wakes, predicate: value=2, false → waits again
  7. ... (repeats for 3-9)
  8. Setter: sets value=10, notifies
  9. Waiter wakes, predicate: value=10, **TRUE**
  10. wait() returns, prints "Got 10"
- **Predicate rechecked on every wakeup:**
  - Spurious wakeup? Recheck and continue waiting
  - Notification received? Recheck and proceed only if true
  - **Automatic handling** of intermediate states
- **Why intermediate values don't matter:**
  - Predicate filters out unwanted wakeups
  - Only final value=10 satisfies condition
- **Efficiency consideration:**
  - Waiter woken 10 times (9 unnecessary)
  - Could optimize with different approach:
    ```cpp
    value = 10;  // Set final value directly
    cv.notify_one();  // Single notification
    ```
- **Spurious wakeups mixed in:**
  - If spurious wakeup at value=5
  - Predicate: value=5, false → waits
  - Indistinguishable from real notification
- **Demonstrates predicate robustness**
- **Key Concept:** Multiple notifications handled automatically by predicate; only wakes for good when predicate true

---

#### Q12
```cpp
std::mutex m1;
std::condition_variable cv;

void thread1() {
    std::unique_lock<std::mutex> lock(m1);
    cv.wait(lock, []{ return false; });  // Predicate always false
}
```

**Answer:**
```
Blocks forever
```

**Explanation:**
- **Predicate always returns false** - infinite wait
- **cv.wait() expansion:**
  ```cpp
  while (![]{ return false; }()) {  // while(true)
      cv.wait(lock);
  }
  ```
- **Execution:**
  1. Thread locks m1
  2. Calls wait with predicate
  3. Predicate evaluated: returns false
  4. Enters wait(), releases lock
  5. **Waits for notification**
  6. (Even if notified) Wakes up, rechecks predicate
  7. Predicate still false
  8. Goes back to waiting
  9. **Infinite loop** - predicate never becomes true
- **No notification exists:**
  - Even worse, no other thread calls notify
  - Thread waits forever for notification that never comes
- **Even with notifications:**
  - If another thread called notify_one() repeatedly
  - This thread would wake, check predicate (false), wait again
  - Still infinite loop
- **Common mistake patterns:**
  - Using wrong variable in predicate
  - Logic error in condition (< instead of >)
  - Never updating the predicate variable
- **Debugging:**
  - Program hangs
  - Thread stuck in cv.wait()
  - Check predicate logic carefully
- **Fix requires:**
  - Correct predicate logic
  - Another thread to actually set condition true
  - Notification when condition changes
- **Key Concept:** Predicate must eventually become true; always-false predicate causes infinite wait

---

#### Q13
```cpp
std::mutex mtx;
std::condition_variable_any cv;
std::shared_lock<std::shared_mutex> smtx;

void worker() {
    cv.wait(smtx, []{ return true; });
}
```

**Answer:**
```
Compilation error
```

**Explanation:**
- **Multiple type errors** in this code
- **Error 1: shared_lock not constructed properly**
  ```cpp
  std::shared_lock<std::shared_mutex> smtx;  // No mutex provided!
  ```
  - shared_lock requires a shared_mutex to lock
  - Should be:
    ```cpp
    std::shared_mutex sm;
    std::shared_lock<std::shared_mutex> smtx(sm);
    ```
- **Error 2: Passing lock by value**
  - cv.wait(smtx, ...) tries to copy smtx
  - shared_lock is not copyable (deleted copy constructor)
  - Need to pass by reference: `cv.wait(smtx, ...)`
  - But wait() expects non-const reference
- **What is condition_variable_any:**
  - Works with ANY lock type (not just unique_lock)
  - Can use: unique_lock, shared_lock, lock_guard (no wait support though)
  - More flexible but slightly slower than condition_variable
- **Correct usage example:**
  ```cpp
  std::shared_mutex sm;
  std::condition_variable_any cv;

  void worker() {
      std::shared_lock<std::shared_mutex> lock(sm);
      cv.wait(lock, []{ return true; });
  }
  ```
- **But wait() with shared_lock is unusual:**
  - shared_lock for reading (shared access)
  - Waiting usually for exclusive access scenarios
  - More common: unique_lock with shared_mutex
- **Key Concept:** condition_variable_any works with any lock type but requires proper lock construction; shared_lock must be constructed with actual mutex

---

#### Q14
```cpp
std::mutex mtx;
std::condition_variable cv;
bool ready = false;

void producer() {
    std::this_thread::sleep_for(std::chrono::milliseconds(50));
    {
        std::lock_guard<std::mutex> lock(mtx);
        ready = true;
    }
    cv.notify_all();
}

void consumer(int id) {
    std::unique_lock<std::mutex> lock(mtx);
    cv.wait(lock, []{ return ready; });
    std::cout << "Consumer " << id << " done\n";
}

int main() {
    std::thread p(producer);
    std::thread c1(consumer, 1);
    std::thread c2(consumer, 2);
    std::thread c3(consumer, 3);

    p.join(); c1.join(); c2.join(); c3.join();
}
```

**Answer:**
```
All three consumers print "done"
```

**Explanation:**
- **notify_all() broadcast** - wakes ALL waiting threads
- **Execution timeline:**
  1. All 3 consumers start immediately
  2. Each locks mtx, calls wait(), releases lock
  3. All 3 now waiting (blocked)
  4. Producer sleeps 50ms
  5. Producer locks, sets ready=true, unlocks
  6. Producer calls notify_all()
  7. **All 3 consumers wake simultaneously**
  8. Each tries to reacquire mtx (one succeeds, others wait)
  9. First consumer: predicate true, prints "Consumer X done"
  10. Releases lock, second consumer acquires it
  11. Second consumer: predicate true, prints "Consumer Y done"
  12. Third consumer: predicate true, prints "Consumer Z done"
- **Order is non-deterministic:**
  - Could be "1 2 3" or "3 1 2" or any permutation
  - Depends on OS scheduling
  - All eventually print
- **Why notify_all() needed:**
  - 3 threads waiting
  - All should proceed (same condition, all can execute)
  - notify_one() would leave 2 waiting forever
- **Predicate ensures correctness:**
  - All threads check ready=true
  - All proceed only after condition met
- **Appropriate use of notify_all():**
  - Multiple threads waiting on same condition
  - All should proceed when condition becomes true
  - Broadcast signal
- **Key Concept:** notify_all() wakes all waiting threads; appropriate when multiple threads should all proceed on same condition

---

#### Q15
```cpp
std::mutex mtx;
std::condition_variable cv;
bool flag = false;

void waiter() {
    std::unique_lock<std::mutex> lock(mtx);
    cv.wait_until(lock,
                  std::chrono::steady_clock::now() + std::chrono::seconds(1),
                  []{ return flag; });
    std::cout << (flag ? "Flag set" : "Timeout") << "\n";
}
```

**Answer:**
```
Output: "Timeout" (if flag not set within 1 second)
```

**Explanation:**
- **wait_until with absolute time point** - different from wait_for
- **wait_for vs wait_until:**
  - **wait_for:** Relative duration (e.g., 1 second from now)
  - **wait_until:** Absolute time point (e.g., specific timestamp)
- **Execution:**
  1. Waiter calculates deadline: now() + 1s
  2. Locks mtx, calls wait_until()
  3. Predicate checked: flag=false
  4. Waits with deadline of T+1s
  5. No other thread sets flag or notifies
  6. At T+1s: deadline reached
  7. Thread wakes, reacquires lock
  8. Predicate rechecked: flag still false
  9. wait_until returns (doesn't return bool like wait_for!)
  10. Ternary checks flag: false → prints "Timeout"
- **Key difference from wait_for:**
  ```cpp
  // wait_for returns bool
  if (cv.wait_for(lock, 1s, pred)) { /* success */ }

  // wait_until returns cv_status but with predicate doesn't need checking
  cv.wait_until(lock, timepoint, pred);
  if (pred()) { /* success */ } else { /* timeout */ }
  ```
- **Spurious wakeups before deadline:**
  - If wakes at T+0.5s spuriously
  - Predicate false → continues waiting
  - Waits until deadline T+1s
- **Use case for wait_until:**
  - Waiting until specific time (e.g., scheduled event)
  - Coordination at absolute time
  - Example: "Wait until 3:00 PM"
- **Key Concept:** wait_until() waits until absolute time point; use for scheduled/absolute-time waiting vs wait_for for relative timeouts

---

#### Q16
```cpp
std::mutex mtx;
std::condition_variable cv;
std::queue<int> q;

void producer() {
    for (int i = 0; i < 3; ++i) {
        {
            std::lock_guard<std::mutex> lock(mtx);
            q.push(i);
        }
        cv.notify_one();
        std::this_thread::sleep_for(std::chrono::milliseconds(100));
    }
}

void consumer() {
    while (true) {
        std::unique_lock<std::mutex> lock(mtx);
        cv.wait(lock, [&]{ return !q.empty(); });
        std::cout << q.front() << " ";
        q.pop();
    }
}
```

**Answer:**
```
Prints "0 1 2" then blocks forever
```

**Explanation:**
- **Missing shutdown mechanism** - common producer-consumer bug
- **Execution timeline:**
  1. Producer pushes 0, notifies, sleeps
  2. Consumer wakes, pops 0, prints "0 "
  3. Consumer loops: q.empty()=true, waits
  4. Producer pushes 1, notifies, sleeps
  5. Consumer pops 1, prints "1 "
  6. Producer pushes 2, notifies, sleeps
  7. Consumer pops 2, prints "2 "
  8. **Producer loop ends, thread exits**
  9. Consumer loops: q.empty()=true, waits
  10. **No more notifications coming** - waits forever
  11. main() tries to join consumer → blocks forever
- **Problem: Infinite loop in consumer**
  - `while(true)` never terminates
  - No way to signal "no more data"
  - Consumer can't distinguish "empty now" from "empty forever"
- **Solution 1: Shutdown flag**
  ```cpp
  bool done = false;

  void producer() {
      // ... produce items ...
      {
          std::lock_guard<std::mutex> lock(mtx);
          done = true;
      }
      cv.notify_one();
  }

  void consumer() {
      while (true) {
          std::unique_lock<std::mutex> lock(mtx);
          cv.wait(lock, [&]{ return !q.empty() || done; });
          if (q.empty() && done) break;
          // ... process item ...
      }
  }
  ```
- **Solution 2: Sentinel value**
  ```cpp
  q.push(-1);  // Special "end of stream" marker
  cv.notify_one();
  ```
- **Solution 3: Exception-based**
  - Producer throws/sets error flag when done
- **Key Concept:** Producer-consumer needs shutdown mechanism; infinite consumer loop requires way to signal completion

---

#### Q17
```cpp
std::mutex mtx;
std::condition_variable cv;
int counter = 0;

void increment() {
    std::lock_guard<std::mutex> lock(mtx);
    ++counter;
    if (counter == 5) {
        cv.notify_one();
    }
}

void waiter() {
    std::unique_lock<std::mutex> lock(mtx);
    cv.wait(lock, [&]{ return counter >= 5; });
    std::cout << "Counter is " << counter << "\n";
}
```

**Answer:**
```
Output: "Counter is 5" (or higher)
```

**Explanation:**
- **Conditional notification** - notify only when condition met
- **Typical scenario:**
  1. Waiter starts: locks, waits for counter>=5
  2. 5 threads call increment() concurrently
  3. Thread 1: counter=0→1, no notify
  4. Thread 2: counter=1→2, no notify
  5. Thread 3: counter=2→3, no notify
  6. Thread 4: counter=3→4, no notify
  7. Thread 5: counter=4→5, **notify_one()**
  8. Waiter wakes: predicate counter>=5 true
  9. Prints "Counter is 5"
- **Why "or higher":**
  - If more increment() calls happen before waiter wakes
  - Thread 6 might increment to 6 before waiter acquires lock
  - Predicate counter>=5 still true at 6,7,8,...
- **Race between notification and print:**
  - Notification sent at counter=5
  - Before waiter wakes and acquires lock
  - More increments might occur
  - **Predicate handles this:** >=5 works for any higher value
- **Optimization: Notify only when needed**
  - Avoids unnecessary wakeup attempts
  - If condition already met, notification may be redundant
  - But doesn't hurt (waiter already proceeded)
- **Predicate robustness:**
  - Handles race conditions naturally
  - counter might be >5 when finally checked
  - Using >= instead of == makes it robust
- **Common pattern in counting scenarios**
- **Key Concept:** Predicate handles races between notification and wakeup; using >= instead of == makes condition robust to additional updates

---

#### Q18
```cpp
std::mutex mtx;
std::condition_variable cv;

void waiter() {
    std::unique_lock<std::mutex> lock(mtx);
    bool result = cv.wait_for(lock, std::chrono::seconds(0), []{ return false; });
    std::cout << std::boolalpha << result << "\n";
}
```

**Answer:**
```
Output: "false"
```

**Explanation:**
- **Zero timeout** - wait_for with duration of 0
- **Execution:**
  1. Waiter locks mtx
  2. Calls wait_for with 0 seconds timeout
  3. **Predicate checked immediately:** returns false
  4. Since predicate false, would normally wait
  5. **But timeout is 0** - no waiting allowed
  6. Immediately "times out"
  7. Returns false (predicate not satisfied)
  8. Prints "false"
- **Essentially a non-blocking check:**
  - Checks if condition currently true
  - Doesn't wait if false
  - Returns immediately
- **Use case: Polling pattern**
  ```cpp
  if (cv.wait_for(lock, 0s, pred)) {
      // Condition met right now
  } else {
      // Condition not met, continue without waiting
  }
  ```
- **Equivalent to:**
  ```cpp
  std::unique_lock<std::mutex> lock(mtx);
  if (predicate()) {
      // do something
  }
  // But wait_for handles spurious wakeup checking internally
  ```
- **Practical use:**
  - Try-style operation
  - Check without commitment to wait
  - Non-blocking synchronization attempt
- **Return value:**
  - true: Predicate was already true
  - false: Predicate was false (no time to wait)
- **Key Concept:** Zero timeout creates non-blocking check; returns immediately with current predicate state

---

#### Q19
```cpp
std::mutex mtx1, mtx2;
std::condition_variable cv;
bool ready = false;

void producer() {
    std::lock_guard<std::mutex> lock(mtx1);
    ready = true;
    cv.notify_one();
}

void consumer() {
    std::unique_lock<std::mutex> lock(mtx2);  // Different mutex!
    cv.wait(lock, []{ return ready; });
}
```

**Answer:**
```
Undefined behavior (different mutexes)
```

**Explanation:**
- **Condition variable requires consistent mutex** - CRITICAL rule violated
- **Why this is wrong:**
  - Producer uses mtx1 to protect ready
  - Consumer uses mtx2 with condition variable
  - cv.wait() expects same mutex that protects the condition
- **What goes wrong:**
  1. Producer locks mtx1, sets ready=true
  2. Consumer locks mtx2, calls cv.wait()
  3. **cv.wait() releases mtx2** (wrong mutex!)
  4. ready is protected by mtx1, not mtx2
  5. **Data race:** Consumer reads ready without mtx1
  6. Producer modifies ready without mtx2
  7. **Undefined behavior**
- **Condition variable contract:**
  - Same mutex must be used by:
    - All threads modifying the predicate state
    - All threads waiting on the CV
    - All threads notifying the CV
  - **Reason:** wait() atomically unlocks mutex and waits
  - If different mutex, atomicity guarantee broken
- **Memory synchronization broken:**
  - Mutex provides happens-before relationship
  - Different mutexes = no synchronization
  - Changes to ready might not be visible
- **Compiler/runtime might not catch:**
  - No compile-time check for mutex consistency
  - Runtime behavior is undefined
  - Might appear to work, might crash, might hang
- **Correct version:**
  ```cpp
  std::mutex mtx;  // ONE mutex for both
  std::condition_variable cv;
  bool ready = false;

  void producer() {
      std::lock_guard<std::mutex> lock(mtx);
      ready = true;
      cv.notify_one();
  }

  void consumer() {
      std::unique_lock<std::mutex> lock(mtx);
      cv.wait(lock, []{ return ready; });
  }
  ```
- **Key Concept:** Condition variable requires same mutex for all operations; different mutexes break synchronization contract and cause undefined behavior

---

#### Q20
```cpp
std::mutex mtx;
std::condition_variable cv;
bool done = false;

void worker() {
    std::unique_lock<std::mutex> lock(mtx);
    cv.wait(lock, []{ return done; });
    std::cout << "Worker done\n";
}

void coordinator() {
    {
        std::lock_guard<std::mutex> lock(mtx);
        done = true;
    }
    // Forgot to call cv.notify_one()
}
```

**Answer:**
```
Worker blocks forever
```

**Explanation:**
- **Missing notification** - critical bug
- **Execution scenario:**
  1. Worker locks mtx, calls cv.wait()
  2. Predicate: done=false → waits
  3. wait() releases lock, blocks
  4. Coordinator locks mtx
  5. Sets done=true
  6. Unlocks (lock_guard destructor)
  7. **Coordinator exits WITHOUT notifying**
  8. Worker still waiting, never woken up
  9. **Blocks forever** - done=true but worker doesn't know
- **Why worker never wakes:**
  - Waiting threads don't periodically check condition
  - Must be explicitly woken by notification
  - Without notify, thread sleeps indefinitely
- **Predicate is true but doesn't help:**
  - Predicate only checked when:
    - Initially entering wait()
    - After waking from notification
    - After spurious wakeup
  - **Never checked while waiting** without wakeup
- **Common mistakes:**
  - Forgetting notify call
  - Exception thrown before notify
  - Early return before notify
- **Fix:**
  ```cpp
  void coordinator() {
      {
          std::lock_guard<std::mutex> lock(mtx);
          done = true;
      }
      cv.notify_one();  // ESSENTIAL!
  }
  ```
- **RAII pattern for notification:**
  ```cpp
  struct Notifier {
      ~Notifier() { cv.notify_all(); }
      std::condition_variable& cv;
  };

  void coordinator() {
      Notifier n{cv};  // Guarantees notification
      std::lock_guard<std::mutex> lock(mtx);
      done = true;
  }  // n destructor calls notify
  ```
- **Debugging:**
  - Thread appears hung in cv.wait()
  - Check all code paths for notify
  - Ensure notification on ALL exits (including exceptions)
- **Key Concept:** Notification is mandatory to wake waiting threads; setting condition true without notify leaves threads waiting forever

---
