## TOPIC: Observer Pattern (Publish-Subscribe)

### PRACTICE_TASKS: Code Analysis and Implementation Challenges

#### Q1
```cpp
class Subject {
    vector<Observer*> observers;
public:
    void attach(Observer* obs) {
        observers.push_back(obs);
    }

    void notify() {
        for (auto* obs : observers) {
            obs->update();  // Observer deletes itself here
        }
    }
};

class SelfDestructingObserver : public Observer {
    Subject* subject;
public:
    void update() override {
        subject->detach(this);
        delete this;  // ❌ Deletes itself
    }
};

// What's the problem?
```

**Problem: Use-After-Free During Notification Loop**

When an observer deletes itself during the notification loop, the iterator continues but the pointer becomes dangling, causing undefined behavior.

**Detailed Analysis:**

**Memory State Before `delete this`:**
```
Heap:
┌─────────────────────────────────┐
│ SelfDestructingObserver object  │ ← Valid memory
│ - vtable ptr                    │
│ - subject ptr                   │
└─────────────────────────────────┘
        ↑
        │
observers[i] = 0x1000  (points here)
```

**After `delete this` Executes:**
```
Heap:
┌─────────────────────────────────┐
│ ??????? FREED MEMORY ????????   │ ← Undefined
│ ??????? FREED MEMORY ????????   │
└─────────────────────────────────┘
        ↑
        │
observers[i] = 0x1000  (DANGLING!)
```

**Why This is Dangerous:**

1. **Loop Continuation:** After `delete this`, the loop continues: `for (auto* obs : observers)`. Even though this particular iteration ends, the pointer remains in the vector.

2. **Iterator Dereference:** If `detach()` removes the observer from the vector during iteration, iterator invalidation occurs.

3. **Next Iteration:** If observer isn't removed, next access to `obs` (even just loop increment) may touch freed memory.

4. **Undefined Behavior:** Dereferencing dangling pointer causes:
   - Segmentation fault (if memory unmapped)
   - Corruption (if memory reused)
   - Appears to work (worst case - latent bug)

**Concrete Failure Scenario:**

```cpp
Subject subject;
subject.attach(new RegularObserver());
subject.attach(new SelfDestructingObserver(&subject));  // Position 1
subject.attach(new AnotherObserver());

subject.notify();
// Iteration 0: RegularObserver->update() ✅ OK
// Iteration 1: SelfDestructingObserver->update()
//              → delete this
//              → observers[1] now dangling
//              → Loop continues...
// Iteration 2: AnotherObserver->update() ✅ OK
// After loop: What if we access observers[1] later? ❌ CRASH
```

**Fix #1: Use weak_ptr for Automatic Lifetime Management**

```cpp
class Subject {
    vector<weak_ptr<Observer>> observers;
public:
    void attach(shared_ptr<Observer> obs) {
        observers.push_back(obs);
    }

    void notify() {
        // Iterate copy to allow safe removal during notification
        auto observersCopy = observers;
        for (auto& wp : observersCopy) {
            if (auto obs = wp.lock()) {  // Check if still alive
                obs->update();
            }
        }

        // Cleanup expired weak_ptrs periodically
        observers.erase(
            remove_if(observers.begin(), observers.end(),
                      [](auto& wp) { return wp.expired(); }),
            observers.end()
        );
    }
};

// Observers delete themselves safely:
class SelfDestructingObserver : public Observer,
                                 public enable_shared_from_this<Observer> {
public:
    void update() override {
        // Deleting the shared_ptr will not affect the current notification loop
        // because we're operating on a copy in notify()
    }
};
```

**Fix #2: Defer Deletion Until After Notification**

```cpp
class Subject {
    vector<Observer*> observers;
    vector<Observer*> toRemove;
    bool inNotification = false;

public:
    void detach(Observer* obs) {
        if (inNotification) {
            toRemove.push_back(obs);  // Defer removal
        } else {
            observers.erase(remove(observers.begin(), observers.end(), obs),
                           observers.end());
        }
    }

    void notify() {
        inNotification = true;
        auto observersCopy = observers;  // Iterate copy

        for (auto* obs : observersCopy) {
            obs->update();
        }

        inNotification = false;

        // Now safe to remove
        for (auto* obs : toRemove) {
            observers.erase(remove(observers.begin(), observers.end(), obs),
                           observers.end());
        }
        toRemove.clear();
    }
};

class SelfDestructingObserver : public Observer {
    Subject* subject;
public:
    void update() override {
        subject->detach(this);  // Deferred until after loop
        delete this;            // Safe because we're operating on copy
    }
};
```

**Fix #3: RAII Connection Handle (Best Practice)**

```cpp
class Connection {
    Subject* subject;
    Observer* observer;
public:
    Connection(Subject* s, Observer* o) : subject(s), observer(o) {
        subject->attach(observer);
    }

    ~Connection() {
        if (subject) {
            subject->detach(observer);
        }
    }

    // Non-copyable, movable
    Connection(const Connection&) = delete;
    Connection& operator=(const Connection&) = delete;
};

class Observer {
    unique_ptr<Connection> connection;
public:
    Observer(Subject* subject)
        : connection(make_unique<Connection>(subject, this)) {}

    // Destructor automatically detaches
};

// Usage:
{
    Subject subject;
    auto obs = make_unique<Observer>(&subject);
    subject.notify();  // obs receives notification
}  // obs destroyed, automatically detached
```

**Performance Comparison:**

| Approach | Safety | Performance | Complexity |
|----------|--------|-------------|------------|
| Raw pointers | ❌ Unsafe | Fast (no overhead) | Simple but error-prone |
| weak_ptr | ✅ Safe | Moderate (atomic ref counting) | Medium |
| Deferred deletion | ✅ Safe | Fast (vector ops) | Medium |
| RAII Connection | ✅ Safe | Fast | High (best design) |

**Real-World Example: GUI Event Listeners**

```cpp
// Qt-style signal/slot with automatic disconnection
class Button {
    vector<weak_ptr<Slot>> slots;
public:
    void clicked() {
        for (auto& wp : slots) {
            if (auto slot = wp.lock()) {
                slot->execute();
            }
        }
    }
};

class Dialog : public enable_shared_from_this<Dialog> {
    Button* button;
public:
    Dialog(Button* btn) : button(btn) {
        button->connect(shared_from_this());
    }

    void onButtonClick() {
        // Process click, maybe close dialog
        delete this;  // Safe with weak_ptr approach
    }
};
```

**Key Takeaways:**

- **Never `delete this` during iteration** unless protected by weak_ptr or copy
- **Iterator invalidation** is separate but related issue (detach during loop)
- **weak_ptr solves both problems:** dangling pointers AND automatic cleanup
- **RAII connection handles** are the professional solution (used in Qt, Boost.Signals2)
- **Always iterate a copy** if callbacks can modify the container

---

---

#### Q2
```cpp
class Subject {
    vector<Observer*> observers;
public:
    void attach(Observer* obs) {
        observers.push_back(obs);
        observers.push_back(obs);  // ❌ Duplicate attachment
    }
};

// What happens during notify() with duplicate observers?
```

**Problem: Observer Receives Multiple Notifications**

Duplicate attachments cause the same observer to be notified multiple times per event, leading to redundant processing and incorrect behavior.

**Why This is Problematic:**

1. **Redundant Work:** Observer processes same event multiple times
   ```cpp
   subject.attach(&logger);
   subject.attach(&logger);  // Duplicate

   subject.notify();
   // Output:
   // "Event logged"  (first notification)
   // "Event logged"  (second notification - redundant!)
   ```

2. **State Corruption:** If observer maintains state (counters, accumulators):
   ```cpp
   class Counter : public Observer {
       int count = 0;
   public:
       void update() override {
           count++;  // Increments twice per event!
       }
   };
   ```

3. **Performance Waste:** Expensive observers (database writes, network calls) execute multiple times

**Fix #1: Check Before Insert**

```cpp
void attach(Observer* obs) {
    // Check if already attached
    if (find(observers.begin(), observers.end(), obs) == observers.end()) {
        observers.push_back(obs);
    }
}
```

**Fix #2: Use Set Instead of Vector**

```cpp
class Subject {
    set<Observer*> observers;  // Automatically prevents duplicates
public:
    void attach(Observer* obs) {
        observers.insert(obs);  // Duplicate ignored
    }

    void notify() {
        for (auto* obs : observers) {
            obs->update();
        }
    }
};
```

**Performance Comparison:**

| Approach | Insert | Check Duplicate | Notify |
|----------|--------|----------------|--------|
| Vector (no check) | O(1) | ❌ None | O(n) - duplicates notified |
| Vector + find() | O(n) | O(n) check | O(n) |
| set | O(log n) | Automatic | O(n) |
| unordered_set | O(1) avg | Automatic | O(n) |

**Real-World Example:**

```cpp
// GUI button with duplicate listeners
Button button;
button.onClick(saveAction);
button.onClick(saveAction);  // Accidentally added twice

// User clicks button:
// → saveAction() called twice
// → File saved twice
// → Corrupted data! ❌
```

**Key Takeaway:** Use set/unordered_set for automatic duplicate prevention, or manually check with find() before insertion.

---

---

---

---

---

#### Q3
```cpp
class Subject {
    vector<weak_ptr<Observer>> observers;
public:
    void notify() {
        for (auto& wp : observers) {
            if (auto obs = wp.lock()) {
                obs->update();
            }
        }
    }
};

// Two threads call notify() simultaneously - is this thread-safe?
```

**Problem: Data Race on Vector During Concurrent Notification**

Multiple threads calling `notify()` simultaneously causes data races because vector iteration is not thread-safe. Additionally, concurrent `attach()`/`detach()` operations can cause iterator invalidation.

**Detailed Analysis:**

**Race Condition #1: Concurrent Vector Iteration**

```cpp
// Thread 1 executes:
for (auto& wp : observers) {  // Reads vector internals
    if (auto obs = wp.lock()) {
        obs->update();
    }
}

// Thread 2 executes simultaneously:
for (auto& wp : observers) {  // Reads same vector internals
    if (auto obs = wp.lock()) {
        obs->update();
    }
}
```

**Why This is Unsafe (Even for Reads):**

While reading the vector itself is technically safe if no writes occur, **the problem is with concurrent `attach()` or `detach()` operations:**

```cpp
// Thread 1:
subject.notify();  // Iterating observers

// Thread 2 (simultaneously):
subject.attach(newObserver);  // Modifies observers vector → REALLOCATION!

// Result: Thread 1's iterator invalidated → CRASH
```

**Memory Corruption Scenario:**

```
Initial state (capacity: 4, size: 3):
observers: [obs1, obs2, obs3, ?]
           ↑ Thread 1 iterator here

Thread 2 calls attach(obs4):
1. Vector resizes (capacity 4 → 8)
2. Allocates new memory
3. Moves elements to new location
4. Frees old memory

New state:
observers: [obs1, obs2, obs3, obs4, ?, ?, ?, ?]  ← New memory
Thread 1 iterator: still points to OLD FREED MEMORY ❌

Thread 1 next iteration: *(freed memory) → SEGFAULT
```

**Race Condition #2: Observer Lifecycle During Notification**

```cpp
// Thread 1:
if (auto obs = wp.lock()) {  // Successfully locks
    // Context switch here...
    obs->update();            // obs might be deleted by Thread 2!
}

// Thread 2:
// Observer destructor runs, deletes observer
// Thread 1's obs is now dangling (even though shared_ptr still holds ref)

// Actually, this is safe because shared_ptr keeps object alive
// But there's still a logic race: should deleted observer be notified?
```

**Race Condition #3: Iterator Invalidation from Concurrent Modifications**

```cpp
// Thread 1:
for (auto& wp : observers) {  // Iterator active
    // ...
}

// Thread 2:
observers.erase(observers.begin());  // ❌ Invalidates Thread 1's iterator

// Thread 1 continues: undefined behavior
```

**Fix #1: Mutex Protection (Simple, Coarse-Grained)**

```cpp
class Subject {
    vector<weak_ptr<Observer>> observers;
    mutable mutex mtx;  // Protects observers vector

public:
    void attach(shared_ptr<Observer> obs) {
        lock_guard lock(mtx);
        observers.push_back(obs);
    }

    void detach(Observer* obs) {
        lock_guard lock(mtx);
        // ... find and remove ...
    }

    void notify() {
        lock_guard lock(mtx);  // Hold lock during entire notification
        for (auto& wp : observers) {
            if (auto obs = wp.lock()) {
                obs->update();
            }
        }
    }
};
```

**Problem with Fix #1:** **Holding lock during callbacks is dangerous:**

```cpp
class Observer {
    shared_ptr<Subject> subject;
public:
    void update() override {
        // What if observer tries to attach another observer?
        subject->attach(make_shared<AnotherObserver>());
        // ❌ DEADLOCK! notify() holds mutex, attach() tries to acquire it
    }
};
```

**Fix #2: Copy-Then-Release Pattern (Better)**

```cpp
class Subject {
    vector<weak_ptr<Observer>> observers;
    mutable mutex mtx;

public:
    void notify() {
        // Copy observers while holding lock
        vector<weak_ptr<Observer>> observersCopy;
        {
            lock_guard lock(mtx);
            observersCopy = observers;  // Atomic vector copy
        }  // Release lock before callbacks

        // Notify without holding lock
        for (auto& wp : observersCopy) {
            if (auto obs = wp.lock()) {
                obs->update();  // Safe: observers can attach/detach
            }
        }

        // Optional: cleanup expired weak_ptrs
        {
            lock_guard lock(mtx);
            observers.erase(
                remove_if(observers.begin(), observers.end(),
                          [](auto& wp) { return wp.expired(); }),
                observers.end()
            );
        }
    }
};
```

**Performance Analysis:**

```cpp
// Benchmark: 1000 observers, 10000 notifications

// Mutex held during callbacks:
// - Average notification: 50ms (all serialized)
// - Throughput: 20 notifications/sec across all threads
// - Deadlock risk: HIGH

// Copy-then-release pattern:
// - Vector copy cost: ~10µs (1000 weak_ptrs = 8KB)
// - Average notification: 5ms (parallelizable)
// - Throughput: 200 notifications/sec
// - Deadlock risk: NONE
```

**Fix #3: Read-Write Lock (Optimized for Read-Heavy Workloads)**

```cpp
class Subject {
    vector<weak_ptr<Observer>> observers;
    mutable shared_mutex mtx;  // Allows multiple readers

public:
    void attach(shared_ptr<Observer> obs) {
        unique_lock lock(mtx);  // Exclusive lock for writes
        observers.push_back(obs);
    }

    void notify() {
        // Acquire shared lock for reading
        vector<weak_ptr<Observer>> observersCopy;
        {
            shared_lock lock(mtx);  // Multiple threads can hold this simultaneously
            observersCopy = observers;
        }

        // Notify without lock
        for (auto& wp : observersCopy) {
            if (auto obs = wp.lock()) {
                obs->update();
            }
        }
    }
};
```

**Performance Comparison (10 threads, 100k notifications):**

| Approach | Throughput | Latency (p99) | Deadlock Risk |
|----------|-----------|---------------|---------------|
| No synchronization | ❌ Crashes | N/A | N/A |
| Mutex + hold during callback | 20 notif/sec | 500ms | HIGH |
| Mutex + copy-then-release | 5,000 notif/sec | 10ms | NONE |
| shared_mutex + copy | 15,000 notif/sec | 3ms | NONE |

**Fix #4: Lock-Free with Atomic Pointer (Advanced)**

```cpp
class Subject {
    atomic<vector<weak_ptr<Observer>>*> observers;

public:
    Subject() : observers(new vector<weak_ptr<Observer>>()) {}

    void attach(shared_ptr<Observer> obs) {
        while (true) {
            auto oldVec = observers.load();
            auto newVec = new vector<weak_ptr<Observer>>(*oldVec);
            newVec->push_back(obs);

            if (observers.compare_exchange_weak(oldVec, newVec)) {
                // Success: schedule old vector for deletion
                scheduleDelete(oldVec);
                break;
            } else {
                delete newVec;  // CAS failed, retry
            }
        }
    }

    void notify() {
        auto observersCopy = *observers.load();  // Snapshot
        for (auto& wp : observersCopy) {
            if (auto obs = wp.lock()) {
                obs->update();
            }
        }
    }

private:
    void scheduleDelete(vector<weak_ptr<Observer>>* vec) {
        // Need RCU or hazard pointers here
        // Cannot delete immediately (other threads might be using it)
    }
};
```

**Complexity: Lock-free is hard and rarely worth it for Observer pattern.**

**Real-World Example: GUI Event System**

```cpp
// Qt's signal/slot mechanism (simplified)
class Signal {
    vector<weak_ptr<SlotBase>> slots;
    mutable mutex slotsMutex;

public:
    void emit() {
        // Copy slots under lock
        vector<weak_ptr<SlotBase>> slotsCopy;
        {
            lock_guard lock(slotsMutex);
            slotsCopy = slots;
        }

        // Invoke without lock (allows slots to connect/disconnect)
        for (auto& wp : slotsCopy) {
            if (auto slot = wp.lock()) {
                slot->invoke();
            }
        }
    }

    void connect(shared_ptr<SlotBase> slot) {
        lock_guard lock(slotsMutex);
        slots.push_back(slot);
    }
};

// Usage in GUI application:
class Button {
    Signal clicked;
public:
    void onClick() {
        clicked.emit();  // Thread-safe
    }
};

class Dialog {
    Button* button;
public:
    Dialog(Button* btn) : button(btn) {
        // Safe to connect from any thread
        button->clicked.connect(
            make_shared<MethodSlot>(this, &Dialog::onButtonClick)
        );
    }

    void onButtonClick() {
        // Can safely connect/disconnect other signals here
        anotherButton->clicked.connect(...);
    }
};
```

**Common Mistake: Thinking Vector Reads are Always Thread-Safe**

```cpp
// WRONG assumption:
"We're only reading the vector, so no mutex needed"

// Reality:
// - Vector read involves accessing internal buffer pointer
// - Concurrent write (attach/detach) can reallocate buffer
// - Read of old pointer + reallocation = use-after-free
// - Even pure reads need synchronization if writes are possible
```

**ThreadSanitizer Detection:**

```cpp
// Compile with TSan:
g++ -fsanitize=thread -g -O1 program.cpp

// Output when data race detected:
WARNING: ThreadSanitizer: data race (pid=12345)
  Write of size 8 at 0x7b0000000000 by thread T2:
    #0 std::vector::push_back() vector.h:123
    #1 Subject::attach() subject.cpp:45

  Previous read of size 8 at 0x7b0000000000 by thread T1:
    #0 std::vector::begin() vector.h:89
    #1 Subject::notify() subject.cpp:67
```

**Key Takeaways:**

- **Vector iteration + concurrent modification = undefined behavior**
- **Always protect shared containers with mutex or shared_mutex**
- **Copy-then-release pattern prevents deadlock** from observer callbacks
- **Don't hold locks during callbacks** (allows attach/detach during notification)
- **weak_ptr::lock() is thread-safe** (atomic reference counting)
- **Use ThreadSanitizer** to detect data races during testing
- **Read-write locks (shared_mutex) optimize read-heavy workloads** (10x throughput)
- **Lock-free is overkill** for Observer pattern (complexity not worth it)

---

---

#### Q4
```cpp
class Observer {
    Subject* subject;
public:
    ~Observer() {
        // ❌ Forgot to detach
    }
};

// Subject holds raw Observer* pointers
// What happens when Observer is destroyed?
```

**Problem: Dangling Pointers After Observer Destruction**

When observer is destroyed without detaching, subject's vector still holds pointer to freed memory. Next notify() causes undefined behavior.

**Execution Flow:**

```cpp
Subject subject;
{
    Observer obs(&subject);
    subject.attach(&obs);

    // observers = [&obs (valid pointer)]
}  // obs destroyed here

// observers = [0x1234 (DANGLING - points to freed memory)]

subject.notify();
// for (auto* obs : observers) {
//     obs->update();  // ❌ Dereferences freed memory
// }
```

**Why This Causes Crashes:**

1. **Use-After-Free:** Pointer valid but memory freed → segfault or corruption
2. **Memory Reuse:** OS might reallocate freed memory, causing bizarre behavior
3. **Latent Bugs:** Might "work" temporarily if memory not reused yet (worst case)

**Fix #1: Manual Detach in Destructor**

```cpp
class Observer {
    Subject* subject;
public:
    Observer(Subject* s) : subject(s) {
        subject->attach(this);
    }

    ~Observer() {
        subject->detach(this);  // ✅ Clean detachment
    }
};
```

**Fix #2: RAII Connection Handle**

```cpp
class Connection {
    Subject* subject;
    Observer* observer;
public:
    Connection(Subject* s, Observer* o) : subject(s), observer(o) {
        subject->attach(observer);
    }

    ~Connection() {
        subject->detach(observer);  // Auto-detach
    }
};

class Observer {
    unique_ptr<Connection> conn;
public:
    Observer(Subject* s)
        : conn(make_unique<Connection>(s, this)) {}
    // Destructor automatically detaches via Connection
};
```

**Fix #3: Use weak_ptr (Automatic Cleanup)**

```cpp
class Subject {
    vector<weak_ptr<Observer>> observers;
public:
    void notify() {
        for (auto& wp : observers) {
            if (auto obs = wp.lock()) {  // Check if still alive
                obs->update();
            }
            // Expired weak_ptrs silently skipped
        }
    }
};

// Observer destruction automatically invalidates weak_ptr
```

**Best Practice:** Prefer weak_ptr or RAII handles over manual detach for automatic memory safety.

**Key Takeaway:** Always detach observer before destruction, or use weak_ptr for automatic lifetime management.

---

---

---

---

---

#### Q5
```cpp
class Subject {
    vector<Observer*> observers;
public:
    void notify() {
        for (auto* obs : observers) {
            obs->update();  // What if this throws?
        }
    }
};

class ThrowingObserver : public Observer {
    void update() override {
        throw runtime_error("Failed!");
    }
};

// What happens to remaining observers?
```

**Problem: Exception Aborts Notification Loop**

When an observer's `update()` throws an exception, the exception propagates out of `notify()`, terminating the loop and preventing subsequent observers from receiving notifications.

**Detailed Analysis:**

**Execution Flow with Exception:**

```
observers = [ObserverA, ThrowingObserver, ObserverB, ObserverC]

notify() called:
  for (auto* obs : observers) {  // Loop begins
      obs->update();
  }

Iteration 0: ObserverA->update()  ✅ Completes successfully
Iteration 1: ThrowingObserver->update()
  → throw runtime_error("Failed!")  ❌ EXCEPTION THROWN
  → Loop exits immediately
  → notify() returns via exception propagation

Iteration 2: ObserverB->update()  ❌ NEVER CALLED
Iteration 3: ObserverC->update()  ❌ NEVER CALLED

Result: ObserverB and ObserverC never notified!
```

**Why This is Problematic:**

1. **Lost Notifications:** Critical observers (e.g., logging, monitoring) never execute
2. **State Inconsistency:** System state partially updated (only first N observers processed)
3. **Unpredictable Behavior:** Which observers execute depends on observer order
4. **Cascading Failures:** If first observer fails, ALL subsequent observers fail

**Concrete Example: Sensor Data Processing**

```cpp
class SensorSubject {
    vector<Observer*> observers;  // [Validator, Processor, Logger, Alerter]
public:
    void updateSensorData(double value) {
        currentValue = value;
        notify();  // Notify all observers
    }
};

class Validator : public Observer {
    void update() override {
        if (subject->getCurrentValue() < 0) {
            throw invalid_argument("Negative sensor value!");  // ❌
        }
    }
};

class Processor : public Observer {
    void update() override {
        // Process sensor data (CRITICAL for system operation)
    }
};

class Logger : public Observer {
    void update() override {
        // Log data to file (IMPORTANT for debugging)
    }
};

class Alerter : public Observer {
    void update() override {
        // Send alerts if threshold exceeded (CRITICAL for safety)
    }
};

// Scenario:
subject.updateSensorData(-5.0);
// Validator throws
// Processor, Logger, Alerter NEVER CALLED
// System continues without processing, logging, or alerting! ❌
```

**Fix #1: Catch and Continue (Isolation)**

```cpp
class Subject {
    vector<Observer*> observers;
public:
    void notify() {
        for (auto* obs : observers) {
            try {
                obs->update();
            } catch (const exception& e) {
                cerr << "Observer exception: " << e.what() << "
";
                // Continue to next observer
            } catch (...) {
                cerr << "Observer threw unknown exception
";
                // Continue to next observer
            }
        }
    }
};

// Now:
notify() called:
  Iteration 0: ObserverA->update()  ✅ Success
  Iteration 1: ThrowingObserver->update()
    → throws exception
    → caught, logged, loop continues ✅
  Iteration 2: ObserverB->update()  ✅ Executed
  Iteration 3: ObserverC->update()  ✅ Executed

All observers notified despite one failure!
```

**Fix #2: Collect Exceptions, Then Rethrow (Aggregate Errors)**

```cpp
class Subject {
    vector<Observer*> observers;
public:
    void notify() {
        vector<exception_ptr> exceptions;

        for (auto* obs : observers) {
            try {
                obs->update();
            } catch (...) {
                exceptions.push_back(current_exception());
                // Continue to next observer
            }
        }

        // After all observers execute, report failures
        if (!exceptions.empty()) {
            cerr << exceptions.size() << " observer(s) failed
";
            rethrow_exception(exceptions[0]);  // Rethrow first exception
        }
    }
};

// Now all observers execute, then caller is notified of failures
```

**Fix #3: Exception-Safe Observer Contract (Noexcept)**

```cpp
class Observer {
public:
    // REQUIRE observers to handle their own exceptions
    virtual void update() noexcept = 0;
};

class SafeObserver : public Observer {
    void update() noexcept override {
        try {
            // Actual work that might throw
            riskyOperation();
        } catch (const exception& e) {
            // Handle locally, don't propagate
            logError(e.what());
        }
    }
};

// Compile-time enforcement: observers cannot throw
// If they try, compiler error:
class BadObserver : public Observer {
    void update() noexcept override {
        throw runtime_error("Oops");  // ❌ Compiler error or std::terminate
    }
};
```

**Fix #4: Error Callback (Reporting Mechanism)**

```cpp
class Subject {
    vector<Observer*> observers;
    function<void(Observer*, const exception&)> errorHandler;

public:
    void setErrorHandler(function<void(Observer*, const exception&)> handler) {
        errorHandler = handler;
    }

    void notify() {
        for (auto* obs : observers) {
            try {
                obs->update();
            } catch (const exception& e) {
                if (errorHandler) {
                    errorHandler(obs, e);
                }
                // Continue to next observer
            }
        }
    }
};

// Usage:
subject.setErrorHandler([](Observer* obs, const exception& e) {
    cerr << "Observer " << typeid(*obs).name()
         << " failed: " << e.what() << "
";
    // Log to file, send alert, etc.
});
```

**Fix #5: Optional Return Values (No Exceptions)**

```cpp
class Observer {
public:
    // Return success/failure instead of throwing
    virtual bool update() = 0;  // Returns false on failure
};

class Subject {
    vector<Observer*> observers;
public:
    int notify() {  // Returns number of failed observers
        int failures = 0;
        for (auto* obs : observers) {
            if (!obs->update()) {
                failures++;
                cerr << "Observer update failed
";
            }
        }
        return failures;
    }
};

// Usage:
int failed = subject.notify();
if (failed > 0) {
    cerr << failed << " observer(s) failed
";
}
```

**Performance Comparison:**

| Approach | All Observers Execute? | Exception Propagation | Performance Overhead |
|----------|----------------------|---------------------|---------------------|
| No try-catch | ❌ No (stops at first exception) | Yes | 0 (but broken) |
| Catch and continue | ✅ Yes | No | ~10ns per exception |
| Collect and rethrow | ✅ Yes | Yes (aggregated) | ~50ns per exception |
| Noexcept | ✅ Yes | No (std::terminate) | 0 |
| Error callback | ✅ Yes | No | ~20ns per exception |
| Return codes | ✅ Yes | No | 0 |

**Real-World Example: Event Listeners in Browsers**

```javascript
// JavaScript event listeners are exception-isolated
button.addEventListener('click', function() {
    throw new Error("Listener 1 failed");  // Caught by browser
});

button.addEventListener('click', function() {
    console.log("Listener 2 still executes");  // ✅ Runs despite Listener 1 failure
});

// Equivalent C++ implementation:
class Button {
    vector<function<void()>> listeners;
public:
    void click() {
        for (auto& listener : listeners) {
            try {
                listener();
            } catch (const exception& e) {
                console.log("Listener exception:", e.what());
                // Continue to next listener
            }
        }
    }
};
```

**Real-World Example: Database Triggers**

```cpp
// Database systems isolate trigger failures
class Database {
public:
    void executeTriggers(Event event) {
        vector<string> failedTriggers;

        for (auto& trigger : triggers) {
            try {
                trigger.execute(event);
            } catch (const sql_exception& e) {
                failedTriggers.push_back(trigger.name);
                logError(trigger.name, e);
                // Continue to next trigger
            }
        }

        if (!failedTriggers.empty()) {
            // Optionally rollback transaction or report
            cerr << "Triggers failed: " << join(failedTriggers) << "
";
        }
    }
};
```

**Best Practice: Layered Exception Handling**

```cpp
class Subject {
    vector<shared_ptr<Observer>> observers;
    Logger& logger;

public:
    struct NotificationResult {
        int successful;
        int failed;
        vector<pair<Observer*, exception_ptr>> failures;
    };

    NotificationResult notify() {
        NotificationResult result{0, 0, {}};

        for (auto& obs : observers) {
            try {
                obs->update();
                result.successful++;
            } catch (const critical_exception& e) {
                // Critical exceptions should propagate
                result.failures.push_back({obs.get(), current_exception()});
                result.failed++;
                throw;  // Rethrow critical exceptions
            } catch (const exception& e) {
                // Non-critical exceptions: log and continue
                logger.error("Observer exception: {}", e.what());
                result.failures.push_back({obs.get(), current_exception()});
                result.failed++;
            } catch (...) {
                logger.error("Observer threw unknown exception");
                result.failed++;
            }
        }

        return result;
    }
};

// Usage:
auto result = subject.notify();
if (result.failed > 0) {
    cerr << result.failed << " observers failed out of "
         << (result.successful + result.failed) << "
";

    // Optionally inspect failures
    for (auto& [obs, exc] : result.failures) {
        try {
            rethrow_exception(exc);
        } catch (const exception& e) {
            cerr << "  - " << typeid(*obs).name() << ": " << e.what() << "
";
        }
    }
}
```

**Detection and Testing:**

```cpp
// Unit test: verify exception isolation
TEST(SubjectTest, ExceptionIsolation) {
    Subject subject;

    bool observer1Called = false;
    bool observer2Called = false;
    bool observer3Called = false;

    subject.attach(new LambdaObserver([&] { observer1Called = true; }));
    subject.attach(new LambdaObserver([&] { throw runtime_error("Fail"); }));
    subject.attach(new LambdaObserver([&] { observer3Called = true; }));

    subject.notify();

    EXPECT_TRUE(observer1Called);   // ✅ Should execute
    EXPECT_TRUE(observer3Called);   // ✅ Should execute despite observer2 throw
}
```

**Key Takeaways:**

- **Never let observer exceptions abort notification loop**
- **Use try-catch inside loop** to isolate failures
- **All observers must execute** regardless of individual failures
- **Consider `noexcept` contract** for observers (forces internal error handling)
- **Collect exceptions** to report aggregate failures to caller
- **Critical vs non-critical exceptions:** Sometimes certain exceptions should propagate
- **Real-world analogy:** JavaScript event listeners, database triggers
- **Test exception isolation** in unit tests
- **Log failures** for debugging while maintaining system resilience

---

---

#### Q6
```cpp
class Subject {
    vector<Observer*> observers;
public:
    void notify(const string& message) {
        for (auto* obs : observers) {
            obs->update(message);  // ❌ Pass by value - copies string
        }
    }
};

// What's the performance issue with passing by value?
```

**Problem: Unnecessary String Copies**

Passing `message` by value creates a copy for each observer notification, wasting memory and CPU for large strings or frequent notifications.

**Cost Analysis:**

```cpp
string largeMessage(1'000'000, 'x');  // 1MB string

subject.notify(largeMessage);
// With 10 observers:
// - 10 string copies = 10 MB allocated
// - 10 allocations + 10 deallocations
// - ~1000x slower than passing by reference
```

**Benchmark:**

| Pass Type | 10 observers | 100 observers | 1000 observers |
|-----------|-------------|---------------|----------------|
| By value | 150 µs | 1.5 ms | 15 ms |
| By const ref | 1 µs | 1 µs | 1 µs |

**Fix: Pass by const Reference**

```cpp
void notify(const string& message) {  // ✅ No copies
    for (auto* obs : observers) {
        obs->update(message);
    }
}
```

**When to Use Each:**

- **const reference:** Default choice (zero copy, safe)
- **By value:** Only if observers need their own copy and might modify it
- **Move semantics:** If transferring ownership (uncommon for notifications)

**Key Takeaway:** Always pass large objects by const reference to avoid unnecessary copies, especially in loops.

---

---

---

---

---

#### Q7
```cpp
class Subject {
    vector<weak_ptr<Observer>> observers;
public:
    void attach(shared_ptr<Observer> obs) {
        observers.push_back(obs);
    }

    void notify() {
        for (auto& wp : observers) {
            if (auto obs = wp.lock()) {
                obs->update();
            }
        }
    }
};

// Does this automatically clean up expired observers?
```

**Answer:** No - expired weak_ptrs accumulate in the vector and need manual cleanup.

**Explanation:**

**Why Expired weak_ptrs Accumulate:**

```cpp
// Initially:
observers = []

// Attach 3 observers:
{
    auto obs1 = make_shared<Observer>();
    auto obs2 = make_shared<Observer>();
    auto obs3 = make_shared<Observer>();

    subject.attach(obs1);
    subject.attach(obs2);
    subject.attach(obs3);

    // observers = [weak_ptr(obs1), weak_ptr(obs2), weak_ptr(obs3)]
    // All weak_ptrs are valid
}  // obs1, obs2, obs3 go out of scope → destroyed

// After scope:
// observers = [weak_ptr(expired), weak_ptr(expired), weak_ptr(expired)]
// Vector still has 3 elements, but all expired!

subject.notify();
// Iterations:
// - wp.lock() returns nullptr (expired) → skip
// - wp.lock() returns nullptr (expired) → skip
// - wp.lock() returns nullptr (expired) → skip
// No observers notified, but vector still has 3 expired entries ❌
```

**Memory Growth Over Time:**

```cpp
// Simulation: attach 1000 observers, let them expire
for (int i = 0; i < 1000; ++i) {
    auto obs = make_shared<Observer>();
    subject.attach(obs);
}  // All observers destroyed immediately

cout << "observers.size() = " << observers.size() << "
";
// Output: 1000 (all expired!)

// Memory usage:
// - 1000 weak_ptr objects in vector
// - Each weak_ptr: ~16 bytes (pointer + control block pointer)
// - Total: ~16 KB wasted memory
// - Iteration cost: 1000 lock() calls that all return nullptr
```

**Performance Degradation:**

```cpp
// Attach/detach observers in a loop
for (int i = 0; i < 100000; ++i) {
    {
        auto obs = make_shared<Observer>();
        subject.attach(obs);
        subject.notify();
    }  // obs destroyed → weak_ptr expires

    // observers.size() grows: 1, 2, 3, ..., 100000
}

// Final state:
// observers.size() = 100,000 (all expired)
// notify() iterates 100,000 expired weak_ptrs ❌
// Time: O(n) where n = all expired weak_ptrs ever attached
```

**Fix #1: Periodic Cleanup**

```cpp
class Subject {
    vector<weak_ptr<Observer>> observers;
public:
    void notify() {
        for (auto& wp : observers) {
            if (auto obs = wp.lock()) {
                obs->update();
            }
        }

        // Cleanup expired weak_ptrs after notification
        observers.erase(
            remove_if(observers.begin(), observers.end(),
                      [](auto& wp) { return wp.expired(); }),
            observers.end()
        );
    }
};

// Now:
// - notify() still iterates all entries (including expired)
// - After notification, expired entries removed
// - Next notify() only iterates alive observers ✅
```

**Fix #2: Lazy Cleanup (Cleanup Before Use)**

```cpp
class Subject {
    vector<weak_ptr<Observer>> observers;
public:
    void notify() {
        // Cleanup BEFORE iterating
        observers.erase(
            remove_if(observers.begin(), observers.end(),
                      [](auto& wp) { return wp.expired(); }),
            observers.end()
        );

        // Now iterate only alive observers
        for (auto& wp : observers) {
            if (auto obs = wp.lock()) {  // Should always succeed
                obs->update();
            }
        }
    }
};
```

**Fix #3: Cleanup on Attach (Amortized Cleanup)**

```cpp
class Subject {
    vector<weak_ptr<Observer>> observers;
    int attachCount = 0;
    static constexpr int CLEANUP_INTERVAL = 10;

public:
    void attach(shared_ptr<Observer> obs) {
        observers.push_back(obs);

        attachCount++;
        if (attachCount >= CLEANUP_INTERVAL) {
            cleanup();
            attachCount = 0;
        }
    }

private:
    void cleanup() {
        observers.erase(
            remove_if(observers.begin(), observers.end(),
                      [](auto& wp) { return wp.expired(); }),
            observers.end()
        );
    }
};

// Cleanup happens every 10 attaches (amortized O(1))
```

**Fix #4: Separate Cleanup Method**

```cpp
class Subject {
    vector<weak_ptr<Observer>> observers;
public:
    void cleanupExpired() {
        observers.erase(
            remove_if(observers.begin(), observers.end(),
                      [](auto& wp) { return wp.expired(); }),
            observers.end()
        );
    }
};

// Usage: Caller decides when to cleanup
subject.attach(obs1);
subject.attach(obs2);
// ... many operations ...
subject.cleanupExpired();  // Explicit cleanup call
```

**Performance Comparison:**

| Approach | Cleanup Frequency | notify() Cost | Memory Growth |
|----------|------------------|--------------|--------------|
| No cleanup | Never | O(total ever attached) | Unbounded |
| Cleanup in notify() | Every notify | O(n) + cleanup | Bounded |
| Cleanup before notify() | Every notify | cleanup + O(alive only) | Bounded |
| Amortized cleanup | Every N attaches | O(n) | Bounded |
| Manual cleanup | On demand | O(n) | Bounded until cleanup |

**Real-World Example: Event Listeners**

```cpp
// JavaScript-style event emitter
class EventEmitter {
    unordered_map<string, vector<weak_ptr<Listener>>> listeners;

public:
    void emit(const string& event) {
        auto& eventListeners = listeners[event];

        // Cleanup expired + notify alive
        eventListeners.erase(
            remove_if(eventListeners.begin(), eventListeners.end(),
                      [](auto& wp) { return wp.expired(); }),
            eventListeners.end()
        );

        for (auto& wp : eventListeners) {
            if (auto listener = wp.lock()) {
                listener->onEvent();
            }
        }
    }
};

// Usage:
{
    auto listener = make_shared<MyListener>();
    emitter.on("click", listener);
    emitter.emit("click");  // listener notified
}  // listener destroyed, weak_ptr expires

emitter.emit("click");  // Cleanup happens, no memory leak
```

**Key Takeaways:**

- weak_ptr::expired() check during iteration does NOT remove entries
- Cleanup must be explicit using erase-remove idiom
- Choose cleanup strategy based on usage pattern
- Common choices: cleanup in notify() or periodic cleanup
- Without cleanup, memory grows unbounded with expired weak_ptrs

---

---

#### Q8
```cpp
class Subject {
    vector<Observer*> observers;
public:
    void detach(Observer* obs) {
        auto it = find(observers.begin(), observers.end(), obs);
        if (it != observers.end()) {
            observers.erase(it);  // ❌ What if called during notify()?
        }
    }
};

// What happens if observer calls detach(this) during its update()?
```

**Problem: Iterator Invalidation During Notification Loop**

Modifying vector during iteration invalidates iterators, causing undefined behavior when loop continues.

**Execution Flow:**

```cpp
void notify() {
    for (auto* obs : observers) {  // Range-based loop → uses iterators
        obs->update();
        // If update() calls detach(this):
        // → observers.erase() invalidates loop iterator
        // → Continuing loop → undefined behavior
    }
}
```

**Concrete Failure Scenario:**

```
observers = [obs1, obs2, obs3, obs4]
            ↑ iterator here

obs2->update() calls detach(obs2):
1. erase() removes obs2
2. Vector shifts: [obs1, obs3, obs4]
3. Iterator still points to old position
4. Next iteration: skips obs3 or accesses invalid memory
```

**Fix #1: Iterate Copy (Safe Removal)**

```cpp
void notify() {
    auto observersCopy = observers;  // Copy vector
    for (auto* obs : observersCopy) {
        obs->update();  // Safe: observers can detach
    }
}
```

**Fix #2: Deferred Removal**

```cpp
class Subject {
    vector<Observer*> observers;
    vector<Observer*> toRemove;
    bool notifying = false;
public:
    void detach(Observer* obs) {
        if (notifying) {
            toRemove.push_back(obs);  // Defer removal
        } else {
            observers.erase(remove(observers.begin(), observers.end(), obs),
                           observers.end());
        }
    }

    void notify() {
        notifying = true;
        for (auto* obs : observers) {
            obs->update();
        }
        notifying = false;

        // Now safe to remove
        for (auto* obs : toRemove) {
            observers.erase(remove(observers.begin(), observers.end(), obs),
                           observers.end());
        }
        toRemove.clear();
    }
};
```

**Fix #3: Reverse Iteration (Index-Based)**

```cpp
void notify() {
    for (int i = observers.size() - 1; i >= 0; --i) {
        observers[i]->update();
        // If observer removes itself, only affects higher indices
    }
}
```

**Key Takeaway:** Always iterate a copy if callbacks can modify the container, or use deferred removal pattern.

---

---

---

---

---

#### Q9
```cpp
class Subject {
    struct Entry {
        Observer* observer;
        int priority;
    };
    vector<Entry> observers;

public:
    void attach(Observer* obs, int priority) {
        observers.push_back({obs, priority});
        sort(observers.begin(), observers.end(), [](auto& a, auto& b) {
            return a.priority > b.priority;  // Higher first
        });
    }
};

// What does this implement?
```

**Answer:** Priority-based notification order - high priority observers notified first.

**Explanation:**

This implements a priority queue for observers, ensuring that observers with higher priority values are notified before those with lower priorities. This is useful when certain observers have dependencies or time-sensitive operations.

**Use Cases:**

1. **Validators Before Processors:** Validators (priority 100) run before data processors (priority 50), ensuring invalid data is rejected before expensive processing

2. **Critical Systems Before Logging:** Safety-critical observers (priority 90) execute before logging observers (priority 10), ensuring critical actions happen even if logging fails

3. **UI Updates Before Network:** UI observers (priority 80) notified before network sync observers (priority 40), ensuring responsive user experience

**Performance Consideration:** Sorting on every attach is O(n log n), inefficient for frequent attaches. Better to use `std::priority_queue` or sort once before notify.

**Key Takeaway:** Priority-based notification ensures execution order when observers have dependencies.

---

---

#### Q10
```cpp
class StockMarket : public Subject {
    double price;
public:
    void setPrice(double p) {
        price = p;
        notify();  // Notify on every change
    }
};

// Frequent price updates: 1000 updates/sec
// 100 observers
// What's the performance issue?
```

**Problem: Notification Storm with High-Frequency Updates**

Notifying on every update causes 1000 notifications/sec × 100 observers = 100,000 calls/sec, overwhelming system with redundant work.

**Performance Impact:**

```cpp
// Benchmark: 1000 price updates in 1 second
for (int i = 0; i < 1000; ++i) {
    subject.setPrice(100.0 + i * 0.01);  // Tiny changes
    // → 100 observers notified each time
    // → 100,000 total notifications
    // → CPU: 80% spent in notification overhead
}
```

**Fix #1: Batching (Periodic Notifications)**

```cpp
class StockMarket {
    double price;
    chrono::steady_clock::time_point lastNotify;
    static constexpr auto NOTIFY_INTERVAL = chrono::milliseconds(100);
public:
    void setPrice(double p) {
        price = p;

        auto now = chrono::steady_clock::now();
        if (now - lastNotify >= NOTIFY_INTERVAL) {
            notify();
            lastNotify = now;
        }
    }
};

// Now: 10 notifications/sec instead of 1000
// Observers receive updates every 100ms (acceptable latency)
```

**Fix #2: Change Threshold (Only Significant Changes)**

```cpp
void setPrice(double p) {
    if (abs(p - price) >= 0.01) {  // Only notify if change >= 1 cent
        price = p;
        notify();
    }
}
```

**Fix #3: Async Notification Queue**

```cpp
class AsyncSubject {
    queue<Event> pendingEvents;
    thread notificationThread;
public:
    void setPrice(double p) {
        pendingEvents.push({p});  // Queue event, return immediately
    }

    void processLoop() {
        while (true) {
            if (!pendingEvents.empty()) {
                Event e = pendingEvents.front();
                pendingEvents.pop();
                notify(e);
            }
            this_thread::sleep_for(chrono::milliseconds(10));
        }
    }
};
```

**Performance Comparison:**

| Strategy | Notifications/sec | Latency | CPU Usage |
|----------|------------------|---------|-----------|
| Every change | 1000 | <1ms | 80% |
| Batching (100ms) | 10 | ~50ms avg | 5% |
| Threshold (1 cent) | ~50 | <1ms | 10% |
| Async queue | ~100 | ~10ms | 8% |

**Key Takeaway:** Use batching, thresholds, or async queues for high-frequency updates to reduce notification overhead.

---

---

---

---

---

#### Q11
```cpp
class Subject {
    mutex mtx;
    vector<Observer*> observers;
public:
    void notify() {
        lock_guard lock(mtx);
        for (auto* obs : observers) {
            obs->update();  // ❌ Holding lock during callback
        }
    }
};

class Observer {
    Subject* subject;
public:
    void update() override {
        subject->attach(new AnotherObserver());  // ❌ Tries to acquire mtx
    }
};

// What problem occurs here?
```

**Problem: Deadlock from Reentrancy**

Subject holds mutex during `notify()` → calls `observer->update()` → observer tries to call `attach()` → `attach()` tries to acquire same mutex → **deadlock** (same thread can't acquire non-recursive mutex twice).

**Execution Flow:**

```
Thread 1:
1. notify() acquires mtx (lock_guard)
2. Calls obs->update() (still holding mtx)
3. update() calls subject->attach(...)
4. attach() tries to acquire mtx
5. ❌ DEADLOCK - same thread waiting for itself
```

**Why This Happens:**

Standard `mutex` is non-recursive - same thread cannot lock it twice. Observer callback trying to modify subject creates a circular lock dependency.

**Fix #1: Release Lock Before Callbacks**

```cpp
void notify() {
    vector<Observer*> observersCopy;
    {
        lock_guard lock(mtx);
        observersCopy = observers;  // Copy under lock
    }  // Lock released

    // Notify without holding lock
    for (auto* obs : observersCopy) {
        obs->update();  // Safe: observers can attach/detach
    }
}
```

**Fix #2: Recursive Mutex (Not Recommended)**

```cpp
class Subject {
    recursive_mutex mtx;  // Allows same thread to lock multiple times
    // ...
};

// Problem: Hides design issues, slower than regular mutex
```

**Fix #3: Deferred Operations**

```cpp
class Subject {
    mutex mtx;
    vector<Observer*> observers;
    vector<Observer*> pendingAttach;
public:
    void attach(Observer* obs) {
        lock_guard lock(mtx);
        if (notifying) {
            pendingAttach.push_back(obs);  // Defer
        } else {
            observers.push_back(obs);
        }
    }

    void notify() {
        lock_guard lock(mtx);
        notifying = true;
        // ... notify observers ...
        notifying = false;

        // Process pending operations
        observers.insert(observers.end(), pendingAttach.begin(), pendingAttach.end());
        pendingAttach.clear();
    }
};
```

**Key Takeaway:** Never hold locks during callbacks. Use copy-then-release pattern to prevent deadlocks and allow observers to modify subject.

---

---

#### Q12
```cpp
class AsyncSubject {
    queue<Event> eventQueue;
    thread workerThread;

public:
    void publish(Event event) {
        eventQueue.push(event);  // Queue event
    }

    void processEvents() {
        while (true) {
            if (!eventQueue.empty()) {
                Event e = eventQueue.front();
                eventQueue.pop();
                notify(e);
            }
        }
    }
};

// What are the benefits of asynchronous notification?
```

**Benefits: Non-Blocking Publish and Decoupled Processing**

Asynchronous notification separates event production (publish) from consumption (observer processing), improving responsiveness and throughput.

**Key Benefits:**

1. **Non-Blocking Publish:** Caller returns immediately without waiting for observers
   ```cpp
   subject.publish(event);  // Returns instantly
   // Event processed later by background thread
   ```

2. **Decoupled Timing:** Observer processing doesn't block event producer
   ```cpp
   // Slow observer (1 second to process):
   class SlowObserver {
       void update() { sleep(1s); }
   };

   // Without async: publish() blocks for 1 second
   // With async: publish() returns immediately, processing happens in background
   ```

3. **Load Smoothing:** Bursts of events queued and processed at steady rate
   ```cpp
   // 1000 events in 1 second:
   for (int i = 0; i < 1000; ++i) {
       subject.publish(event);  // Fast: just queue
   }
   // Worker processes at manageable rate (e.g., 100/sec)
   ```

4. **Thread Safety:** Single worker thread eliminates race conditions from concurrent processing

**Trade-offs:**

- ✅ **Pros:** Responsiveness, throughput, load isolation
- ❌ **Cons:** Complexity (threading, queues), latency (events processed later), requires synchronization

**Use Cases:**

- GUI event handling (keep UI responsive)
- High-frequency sensor data (batch processing)
- Logging systems (async writes)
- Network event dispatching

**Key Takeaway:** Async notification improves responsiveness by decoupling event generation from processing, at cost of added complexity and latency.

---

---

---

---

---

---

---

#### Q13
```cpp
class Observer {
public:
    virtual void update(const SensorData& data) = 0;
    virtual bool interestedIn(SensorType type) const = 0;
};

class Subject {
public:
    void notify(const SensorData& data) {
        for (auto& obs : observers) {
            if (obs->interestedIn(data.type)) {
                obs->update(data);
            }
        }
    }
};

// What optimization does interestedIn() provide?
```

**Optimization: Selective Notification via Event Filtering**

The `interestedIn()` method filters notifications, ensuring observers only receive events they care about, reducing unnecessary processing.

**How It Works:**

```cpp
class TemperatureObserver : public Observer {
public:
    bool interestedIn(SensorType type) const override {
        return type == SensorType::TEMPERATURE;  // Only temperature events
    }

    void update(const SensorData& data) override {
        // Only called for temperature events
    }
};

class PressureObserver : public Observer {
public:
    bool interestedIn(SensorType type) const override {
        return type == SensorType::PRESSURE;  // Only pressure events
    }
};
```

**Performance Benefit:**

```cpp
// Without filtering:
// 3 observers × 1000 events = 3000 update() calls

// With filtering:
// TemperatureObserver: 333 calls (only temperature events)
// PressureObserver: 333 calls (only pressure events)
// MultiObserver: 1000 calls (all events)
// Total: 1666 calls (45% reduction)
```

**Alternative: Topic-Based Subscriptions**

```cpp
class Subject {
    map<SensorType, vector<Observer*>> observersByType;
public:
    void subscribe(SensorType type, Observer* obs) {
        observersByType[type].push_back(obs);
    }

    void notify(SensorType type, const SensorData& data) {
        // Notify only subscribers of this type
        for (auto* obs : observersByType[type]) {
            obs->update(data);
        }
    }
};

// Even faster: no iteration over uninterested observers
```

**Key Takeaway:** Event filtering reduces unnecessary notifications, improving performance for systems with diverse event types and specialized observers.

---

---

#### Q14
```cpp
class Subject {
    vector<Observer*> observers;
public:
    void notify() {
        for (size_t i = 0; i < observers.size(); ++i) {
            observers[i]->update();

            // ❌ Observer might remove itself, invalidating indices
        }
    }
};

// What's wrong with this notification approach?
```

**Problem: Index Skipping When Observer Removes Itself**

If observer at index `i` removes itself, all subsequent elements shift down. Loop increments `i`, skipping the element that moved into position `i`.

**Execution Flow:**

```
observers = [obs0, obs1, obs2, obs3]

i=0: obs0->update()  ✅
i=1: obs1->update() → calls detach(obs1)
     → observers becomes [obs0, obs2, obs3]
     → obs2 shifts to index 1
i=2: observers[2]->update() → accesses obs3
     ❌ SKIPPED obs2!
```

**Concrete Example:**

```cpp
class SelfRemovingObserver : public Observer {
    void update() override {
        subject->detach(this);  // Remove self
    }
};

// observers = [normal, selfRemoving, important, normal]
// After notify():
// - normal (index 0): notified ✅
// - selfRemoving (index 1): notified, removes self ✅
// - important (was index 2, now index 1): SKIPPED ❌
// - normal (was index 3, now index 2): notified ✅
```

**Fix #1: Reverse Iteration**

```cpp
void notify() {
    for (int i = observers.size() - 1; i >= 0; --i) {
        observers[i]->update();
        // Removals only affect higher indices (already processed)
    }
}
```

**Fix #2: Iterate Copy**

```cpp
void notify() {
    auto observersCopy = observers;
    for (auto* obs : observersCopy) {
        obs->update();  // Safe: modifications don't affect copy
    }
}
```

**Fix #3: Mark and Sweep**

```cpp
class Subject {
    vector<Observer*> observers;
    set<Observer*> removed;
public:
    void detach(Observer* obs) {
        removed.insert(obs);  // Mark for removal
    }

    void notify() {
        for (auto* obs : observers) {
            if (!removed.count(obs)) {
                obs->update();
            }
        }

        // Sweep: remove marked observers
        observers.erase(
            remove_if(observers.begin(), observers.end(),
                     [this](auto* o) { return removed.count(o); }),
            observers.end()
        );
        removed.clear();
    }
};
```

**Key Takeaway:** Index-based iteration breaks when elements are removed during iteration. Use reverse iteration or iterate a copy for safety.

---

---

---

---

---

---

---

#### Q15
```cpp
class Observer {
    unique_ptr<Connection> connection;
public:
    Observer(Subject& subject) {
        connection = make_unique<Connection>(subject, this);
    }

    ~Observer() {
        // Connection destructor auto-detaches
    }
};

class Connection {
    Subject& subject;
    Observer* observer;
public:
    ~Connection() {
        subject.detach(observer);
    }
};

// What pattern does Connection implement?
```

**Pattern: RAII Connection Handle for Automatic Detachment**

`Connection` uses RAII to manage observer lifetime - automatically detaches observer when Connection is destroyed, ensuring no dangling pointers.

**How It Works:**

```cpp
{
    Observer obs(subject);
    // Connection created, observer attached

    subject.notify();  // obs receives notification

}  // obs destroyed → Connection destroyed → auto-detach
```

**Benefits:**

1. **Exception Safety:** Detachment guaranteed even if exception thrown
   ```cpp
   {
       Observer obs(subject);
       riskyOperation();  // Throws exception
   }  // Still detaches despite exception
   ```

2. **No Manual Cleanup:** Forget about detach() calls
   ```cpp
   // Without RAII:
   Observer* obs = new Observer();
   subject->attach(obs);
   // ... code ...
   subject->detach(obs);  // ❌ Easy to forget
   delete obs;

   // With RAII:
   auto obs = make_unique<Observer>(subject);
   // ... code ...
   // ✅ Automatic cleanup
   ```

3. **Prevents Dangling Pointers:** Impossible to destroy observer without detaching

**Real-World Example: Qt Signals**

```cpp
// Qt's QObject::connect returns QMetaObject::Connection
QMetaObject::Connection conn =
    connect(button, &Button::clicked, this, &Dialog::onButtonClick);

// Explicit disconnect:
disconnect(conn);

// Or use ConnectionGuard for RAII:
{
    ConnectionGuard guard(conn);
    // ... code ...
}  // Auto-disconnect when guard destroyed
```

**Key Takeaway:** RAII connection handles automate observer lifecycle management, eliminating manual detach calls and preventing dangling pointers.

---

---

#### Q16
```cpp
class Subject {
public:
    Signal<double> temperatureChanged;
    Signal<double> pressureChanged;
    Signal<double> humidityChanged;

    void setTemperature(double t) {
        temperature = t;
        temperatureChanged(t);  // Emit specific signal
    }
};

// How is this different from single notify() method?
```

**Difference: Multiple Signals for Fine-Grained Subscription**

Instead of one generic `notify()` for all changes, separate signals allow observers to subscribe only to specific events they care about.

**Single notify() Approach:**

```cpp
class Subject {
public:
    void notify() {
        // All observers notified for any change
        for (auto* obs : observers) {
            obs->update();  // Which property changed?
        }
    }
};

// Observer must check what changed:
class Observer {
    void update() override {
        if (subject->temperatureChanged()) {
            // Handle temperature
        }
        if (subject->pressureChanged()) {
            // Handle pressure
        }
        // Inefficient: called for all changes
    }
};
```

**Multiple Signals Approach:**

```cpp
class Subject {
public:
    Signal<double> temperatureChanged;
    Signal<double> pressureChanged;
};

// Observer subscribes only to what it needs:
temperatureMonitor.connect(subject.temperatureChanged);
pressureMonitor.connect(subject.pressureChanged);

// Now:
subject.setTemperature(25.0);
// → Only temperatureChanged signal emitted
// → Only temperatureMonitor notified
// → pressureMonitor NOT notified ✅
```

**Benefits:**

1. **Selective Notification:** Observers receive only relevant events
2. **Better Performance:** Fewer unnecessary notifications
3. **Cleaner Code:** Explicit subscriptions, no manual filtering
4. **Type Safety:** Each signal has specific type (double, string, etc.)

**Use Case: GUI Applications**

```cpp
class Button {
public:
    Signal<> clicked;
    Signal<bool> hovered;
    Signal<KeyEvent> keyPressed;
};

// Different handlers for different events:
button.clicked.connect(onButtonClick);
button.hovered.connect(onButtonHover);
button.keyPressed.connect(onKeyPress);
```

**Key Takeaway:** Multiple signals provide fine-grained, type-safe subscriptions, reducing unnecessary notifications compared to single generic notify().

---

---

---

---

---

---

---

#### Q17
```cpp
class Subject {
    vector<weak_ptr<Observer>> observers;
    int notificationLevel = 0;  // Recursion depth

public:
    void notify() {
        if (notificationLevel > 3) {
            cerr << "Warning: Deep notification recursion!
";
            return;  // Prevent infinite loop
        }

        notificationLevel++;
        // ... notify observers ...
        notificationLevel--;
    }
};

// What does notificationLevel track?
```

**Purpose: Recursion Guard to Prevent Infinite Notification Loops**

`notificationLevel` tracks notification depth, detecting when observer callbacks trigger new notifications, preventing stack overflow from infinite recursion.

**How Recursion Happens:**

```cpp
class Subject {
    int value;
public:
    void setValue(int v) {
        value = v;
        notify();  // Notify observers
    }
};

class RecursiveObserver : public Observer {
    void update() override {
        // Modifies subject, triggering another notification
        subject->setValue(subject->getValue() + 1);
        // → notify() called again → observer updated again → infinite loop!
    }
};
```

**Execution Without Guard:**

```
setValue(10)
  → notify() (level 1)
    → observer->update()
      → setValue(11)
        → notify() (level 2)
          → observer->update()
            → setValue(12)
              → notify() (level 3)
                ... infinite recursion ...
                → STACK OVERFLOW ❌
```

**Execution With Guard:**

```
setValue(10)
  → notify() (level=0 → 1)
    → observer->update()
      → setValue(11)
        → notify() (level=1 → 2)
          → observer->update()
            → setValue(12)
              → notify() (level=2 → 3)
                → observer->update()
                  → setValue(13)
                    → notify() (level=3 → 4)
                      → level > 3 ✅ STOP
                      → cerr << "Warning: Deep recursion"
                      → return
```

**Alternative: Simple Boolean Flag**

```cpp
class Subject {
    bool notifying = false;
public:
    void notify() {
        if (notifying) {
            cerr << "Recursive notification detected!
";
            return;
        }

        notifying = true;
        // ... notify observers ...
        notifying = false;
    }
};
```

**Use Cases:**

- Bidirectional bindings (A updates B, B updates A)
- Cascading property changes
- Reactive programming frameworks

**Key Takeaway:** Recursion guard prevents infinite loops when observer callbacks trigger new notifications, essential for reactive systems.

---

---

#### Q18
```cpp
class Subject {
public:
    void notify() {
        // Phase 1: Validators
        for (auto& obs : validatorObservers) {
            obs->update();
        }

        // Phase 2: Processors
        for (auto& obs : processorObservers) {
            obs->update();
        }

        // Phase 3: Loggers
        for (auto& obs : loggerObservers) {
            obs->update();
        }
    }
};

// What pattern does multi-phase notification implement?
```

**Pattern: Ordered Notification with Observer Dependencies**

Multi-phase notification ensures observers execute in specific order when some observers depend on others completing first (e.g., validators before processors).

**Why Order Matters:**

```cpp
// Without ordering:
subject.notify();
// Observers might execute in any order:
// 1. Processor (❌ processes invalid data)
// 2. Validator (rejects data, but too late!)
// 3. Logger (logs invalid processing)

// With multi-phase:
// Phase 1: Validator (✅ rejects invalid data first)
// → If validation fails, stop here
// Phase 2: Processor (only runs if validation passed)
// Phase 3: Logger (logs successful processing)
```

**Concrete Example: Data Pipeline**

```cpp
class Subject {
    vector<Observer*> validators;
    vector<Observer*> processors;
    vector<Observer*> loggers;
public:
    bool notify(const Data& data) {
        // Phase 1: Validate
        for (auto* val : validators) {
            if (!val->validate(data)) {
                return false;  // Stop if validation fails
            }
        }

        // Phase 2: Process (only if valid)
        for (auto* proc : processors) {
            proc->process(data);
        }

        // Phase 3: Log (after successful processing)
        for (auto* log : loggers) {
            log->record(data);
        }

        return true;
    }
};
```

**Alternative: Priority-Based Single List**

```cpp
class Subject {
    struct Entry {
        Observer* obs;
        int priority;  // Higher = earlier
    };
    vector<Entry> observers;  // Sorted by priority
public:
    void attach(Observer* obs, int priority) {
        observers.push_back({obs, priority});
        sort(observers.begin(), observers.end(),
             [](auto& a, auto& b) { return a.priority > b.priority; });
    }
};

// Validators: priority 100
// Processors: priority 50
// Loggers: priority 10
```

**Benefits:**

- **Explicit Dependencies:** Clear which observers run first
- **Error Handling:** Can stop pipeline if early phase fails
- **Predictable Behavior:** Consistent execution order

**Key Takeaway:** Multi-phase notification enforces execution order for observers with dependencies, ensuring correct system behavior.

---

---

---

---

---

---

---

#### Q19
```cpp
class Observer {
    bool oneTime = false;
public:
    void update() override {
        processUpdate();

        if (oneTime) {
            requestRemoval();  // Mark for removal
        }
    }

    void setOneTime(bool ot) { oneTime = ot; }
};

// What is a one-time observer useful for?
```

**Use Case: Auto-Unsubscribe After First Notification**

One-time observers automatically detach after first notification, useful for completion handlers, async callbacks, and waiting for single events.

**Common Use Cases:**

1. **Promise/Future Completion:**
   ```cpp
   class FutureObserver : public Observer {
   public:
       FutureObserver() { setOneTime(true); }

       void update() override {
           promise.set_value(subject->getValue());
           // Auto-detached after this
       }
   };

   // Wait for next event:
   auto future = subject.waitForNext();
   future.wait();  // Blocks until one notification
   ```

2. **Event Completion Handlers:**
   ```cpp
   // Wait for file download to complete:
   downloader.onComplete.attach(new OneTimeObserver([](auto result) {
       cout << "Download finished: " << result << "
";
       // Handler auto-removed after execution
   }));
   ```

3. **Timeout or First-Event Detection:**
   ```cpp
   // Process only the first sensor reading:
   sensor.attach(new OneTimeObserver([](auto data) {
       calibrate(data);  // One-time calibration
       // No need to manually detach
   }));
   ```

**Implementation:**

```cpp
class Subject {
    vector<Observer*> observers;
    vector<Observer*> toRemove;
public:
    void notify() {
        for (auto* obs : observers) {
            obs->update();

            if (obs->isOneTime()) {
                toRemove.push_back(obs);
            }
        }

        // Remove one-time observers after notification
        for (auto* obs : toRemove) {
            detach(obs);
        }
        toRemove.clear();
    }
};
```

**Benefits:**

- **No Manual Cleanup:** Auto-detachment prevents memory leaks
- **Clear Intent:** Code explicitly shows one-time behavior
- **Useful for Async:** Bridges observer pattern with promise/future patterns

**Key Takeaway:** One-time observers simplify async completion handling by auto-detaching after first notification, useful for futures, callbacks, and event waiting.

---

---

#### Q20
```cpp
class Subject {
    vector<Observer*> observers;
public:
    void notify() {
        try {
            for (auto* obs : observers) {
                obs->update();
            }
        } catch (...) {
            // ❌ Catches all exceptions, logs nothing
        }
    }
};

// What's the problem with this exception handling?
```

**Problem: Outer Catch-All Silences First Exception and Stops Notification**

Placing catch-all outside loop causes first exception to terminate iteration, preventing remaining observers from being notified, and exception is silently swallowed.

**Execution Flow:**

```
observers = [obs1, obs2_throws, obs3, obs4]

notify():
  try {
      obs1->update()  ✅
      obs2->update() → throws exception
      → catch (...) triggered
      → Loop exits
      obs3->update()  ❌ NEVER CALLED
      obs4->update()  ❌ NEVER CALLED
  } catch (...) {
      // Exception caught but not logged → silent failure
  }
```

**Two Problems:**

1. **Early Termination:** Remaining observers not notified
2. **Silent Failure:** No logging, debugging impossible

**Fix: Catch Inside Loop**

```cpp
void notify() {
    for (auto* obs : observers) {
        try {
            obs->update();
        } catch (const exception& e) {
            cerr << "Observer exception: " << e.what() << "\n";
            // Continue to next observer
        } catch (...) {
            cerr << "Observer threw unknown exception\n";
        }
    }
}

// Now all observers execute despite exceptions
```

**Advanced: Collect Exceptions**

```cpp
void notify() {
    vector<exception_ptr> exceptions;

    for (auto* obs : observers) {
        try {
            obs->update();
        } catch (...) {
            exceptions.push_back(current_exception());
        }
    }

    // All observers executed, now report failures
    if (!exceptions.empty()) {
        cerr << exceptions.size() << " observer(s) failed\n";
        // Optionally rethrow first exception
        rethrow_exception(exceptions[0]);
    }
}
```

**Key Takeaway:** Catch exceptions inside notification loop (not outside) to ensure all observers execute and failures are logged, preventing silent failures.

---

---

---

---

---
