## TOPIC: Thread-Safe Singleton Pattern - Modern C++ Implementation

### PRACTICE_TASKS: Output Prediction and Code Analysis

#### Q1
```cpp
class Singleton {
    static Singleton* instance_;

    Singleton() {}

public:
    static Singleton* getInstance() {
        if (!instance_) {  // Bug: not thread-safe!
            instance_ = new Singleton();
        }
        return instance_;
    }
};

Singleton* Singleton::instance_ = nullptr;

void worker() {
    Singleton* s = Singleton::getInstance();
    // Use singleton...
}

int main() {
    std::thread t1(worker);
    std::thread t2(worker);  // Bug: race condition on getInstance()!

    t1.join();
    t2.join();
}
```

**Answer:**
```
Race condition (possible double initialization or partial construction visibility)
```

**Explanation:**
- Two threads call `getInstance()` simultaneously
- Both threads check `if (!instance_)` → both see `nullptr`
- Both threads execute `new Singleton()` → two instances created!
- Second assignment overwrites first → memory leak
- Or: one thread sees partially constructed object (data race)
- Classic singleton race condition
- **Key Concept:** Naive singleton implementation not thread-safe; concurrent getInstance() calls can create multiple instances; requires synchronization (mutex, std::call_once, or Meyer's singleton)

**Fixed Version:**
```cpp
// Option 1: Meyer's Singleton (C++11 thread-safe)
class Singleton {
    Singleton() {}

public:
    static Singleton& getInstance() {
        static Singleton instance;  // Thread-safe initialization
        return instance;
    }

    Singleton(const Singleton&) = delete;
    Singleton& operator=(const Singleton&) = delete;
};

// Option 2: std::call_once
class Singleton {
    static std::unique_ptr<Singleton> instance_;
    static std::once_flag init_flag_;

    Singleton() {}

public:
    static Singleton& getInstance() {
        std::call_once(init_flag_, []() {
            instance_.reset(new Singleton());
        });
        return *instance_;
    }
};
```

---

#### Q2
```cpp
class Singleton {
    Singleton() {
        std::cout << "Constructed\n";
    }

public:
    static Singleton& getInstance() {
        static Singleton instance;
        return instance;
    }

    ~Singleton() {
        std::cout << "Destroyed\n";
    }
};

Singleton& globalRef = Singleton::getInstance();  // Bug: initialization order fiasco!

int main() {
    Singleton& s = Singleton::getInstance();

    // Use singleton...
}
```

**Answer:**
```
Undefined behavior (static destruction order fiasco possible)
```

**Explanation:**
- `globalRef` initialized during static initialization phase
- Calls `getInstance()` → creates singleton
- At program exit, destruction order of statics undefined
- If `globalRef`'s translation unit destructs last, it may access destroyed singleton
- Classic static destruction order problem
- Holding references/pointers to singleton statics dangerous
- **Key Concept:** Static references to singletons create destruction order fiasco; singleton may be destroyed before global references; avoid global references to singletons or use nifty counter pattern

**Fixed Version:**
```cpp
// Option 1: Don't hold global references
int main() {
    Singleton& s = Singleton::getInstance();  // Get reference locally
}

// Option 2: Leak singleton (acceptable for true singletons)
class Singleton {
public:
    static Singleton& getInstance() {
        static Singleton* instance = new Singleton();  // Never destroyed
        return *instance;
    }
};

// Option 3: Phoenix singleton (recreates if accessed after destruction)
class Singleton {
    static bool destroyed_;

public:
    static Singleton& getInstance() {
        static Singleton instance;
        if (destroyed_) {
            new (&instance) Singleton();  // Reconstruct
            destroyed_ = false;
        }
        return instance;
    }

    ~Singleton() { destroyed_ = true; }
};
```

---

#### Q3
```cpp
class Singleton {
    static Singleton* instance_;
    static std::mutex mutex_;

    Singleton() {}

public:
    static Singleton* getInstance() {
        std::lock_guard<std::mutex> lock(mutex_);  // Bug: locks on every access!

        if (!instance_) {
            instance_ = new Singleton();
        }
        return instance_;
    }
};

int main() {
    // Many threads frequently accessing singleton
    for (int i = 0; i < 1000000; i++) {
        Singleton* s = Singleton::getInstance();  // Bug: severe lock contention!
    }
}
```

**Answer:**
```
Performance issue (lock acquired on every getInstance() call, even after initialization)
```

**Explanation:**
- Mutex locked on EVERY `getInstance()` call
- After first initialization, lock unnecessary (instance never changes)
- 1 million lock acquisitions → severe performance penalty
- Threads serialize at lock even though no actual concurrent modification
- Classic over-synchronization problem
- Need Double-Checked Locking Pattern (DCLP) or atomic pointer
- **Key Concept:** Locking every singleton access causes unnecessary contention; only initialization needs synchronization; use DCLP with atomic or Meyer's singleton for better performance

**Fixed Version:**
```cpp
// Option 1: Double-Checked Locking (DCLP) - C++11
class Singleton {
    static std::atomic<Singleton*> instance_;
    static std::mutex mutex_;

    Singleton() {}

public:
    static Singleton* getInstance() {
        Singleton* tmp = instance_.load(std::memory_order_acquire);

        if (!tmp) {  // First check (no lock)
            std::lock_guard<std::mutex> lock(mutex_);
            tmp = instance_.load(std::memory_order_relaxed);

            if (!tmp) {  // Second check (with lock)
                tmp = new Singleton();
                instance_.store(tmp, std::memory_order_release);
            }
        }
        return tmp;
    }
};

// Option 2: Meyer's Singleton (simplest, best performance)
class Singleton {
public:
    static Singleton& getInstance() {
        static Singleton instance;  // Lock-free after initialization (C++11)
        return instance;
    }
};
```

---

#### Q4
```cpp
class DatabaseConnection {  // "Singleton"
public:
    static DatabaseConnection& getInstance() {
        static DatabaseConnection instance;
        return instance;
    }

    void connect() { /* connect to DB */ }

    // Bug: can't reset for unit tests!
};

void test_feature_A() {
    auto& db = DatabaseConnection::getInstance();
    db.connect();
    // Test feature A...
}

void test_feature_B() {
    auto& db = DatabaseConnection::getInstance();  // Bug: reuses connection from test A!
    db.connect();
    // Test feature B...
}
```

**Answer:**
```
Test isolation problem (tests share singleton state, not independent)
```

**Explanation:**
- Meyer's singleton has static lifetime (never destroyed until program exit)
- `test_feature_A()` creates singleton with state from test A
- `test_feature_B()` gets same instance → state polluted from test A
- Tests not isolated → test B may fail due to test A's side effects
- Can't reset singleton between tests
- Singletons problematic for unit testing
- **Key Concept:** Singletons break test isolation by persisting state across tests; Meyer's singleton can't be reset; consider dependency injection or resetable singleton pattern for testability

**Fixed Version:**
```cpp
// Option 1: Dependency Injection (preferred for testability)
class DatabaseConnection {
public:
    virtual void connect() = 0;
    virtual ~DatabaseConnection() = default;
};

class RealDatabaseConnection : public DatabaseConnection {
public:
    void connect() override { /* real connection */ }
};

class MockDatabaseConnection : public DatabaseConnection {
public:
    void connect() override { /* mock connection */ }
};

void test_feature_A() {
    MockDatabaseConnection db;
    db.connect();
    // Test with mock...
}

// Option 2: Resetable Singleton (for legacy code)
class DatabaseConnection {
    static std::unique_ptr<DatabaseConnection> instance_;

public:
    static DatabaseConnection& getInstance() {
        if (!instance_) {
            instance_ = std::make_unique<DatabaseConnection>();
        }
        return *instance_;
    }

    static void reset() {
        instance_.reset();  // Destroy for testing
    }
};

void test_feature_A() {
    DatabaseConnection::reset();  // Clean state
    auto& db = DatabaseConnection::getInstance();
    // Test...
}
```

---

#### Q5
```cpp
class Singleton {
    Singleton() {}

public:
    static Singleton& getInstance() {
        static Singleton instance;
        return instance;
    }

    // Bug: copyable!
};

int main() {
    Singleton& s1 = Singleton::getInstance();
    Singleton s2 = s1;  // Bug: creates copy of singleton!

    std::cout << (&s1 == &s2);  // false - two instances exist!
}
```

**Answer:**
```
Output: false (singleton invariant violated - two instances exist)
```

**Explanation:**
- Singleton pattern requires exactly one instance
- Default copy constructor allows copying
- `Singleton s2 = s1` creates second instance
- Two separate objects exist → violates singleton invariant
- Must delete copy constructor and copy assignment
- Same issue with move operations (usually also deleted)
- **Key Concept:** Singleton must delete copy/move constructors and assignment operators to prevent multiple instances; compiler-generated special members allow copying, violating singleton invariant

**Fixed Version:**
```cpp
class Singleton {
    Singleton() {}

public:
    static Singleton& getInstance() {
        static Singleton instance;
        return instance;
    }

    // Delete copy and move operations
    Singleton(const Singleton&) = delete;
    Singleton& operator=(const Singleton&) = delete;
    Singleton(Singleton&&) = delete;
    Singleton& operator=(Singleton&&) = delete;
};

int main() {
    Singleton& s1 = Singleton::getInstance();
    // Singleton s2 = s1;  // Compilation error - copy deleted
}
```

---

#### Q6
```cpp
class Logger {
    std::ofstream file_;

    Logger() : file_("log.txt") {}

public:
    static Logger& getInstance() {
        static Logger instance;
        return instance;
    }

    void log(const std::string& msg) {
        file_ << msg << "\n";  // Bug: not thread-safe!
    }
};

void worker(int id) {
    for (int i = 0; i < 1000; i++) {
        Logger::getInstance().log("Thread " + std::to_string(id) + ": message " + std::to_string(i));
    }
}

int main() {
    std::vector<std::thread> threads;
    for (int i = 0; i < 10; i++) {
        threads.emplace_back(worker, i);
    }

    for (auto& t : threads) t.join();
}
```

**Answer:**
```
Data race on file_ (interleaved/corrupted log output, undefined behavior)
```

**Explanation:**
- Meyer's singleton ensures thread-safe initialization
- But `log()` method NOT thread-safe
- Multiple threads call `file_ << msg` concurrently → data race on `file_`
- `ofstream` internal state corrupted
- Log messages interleaved or corrupted
- Thread-safe singleton initialization ≠ thread-safe object usage
- Must synchronize individual method calls
- **Key Concept:** Thread-safe singleton initialization doesn't make object methods thread-safe; singleton instance access safe but method calls may race; protect mutable state with mutex or atomic operations

**Fixed Version:**
```cpp
class Logger {
    std::ofstream file_;
    std::mutex mutex_;  // Protect file access

    Logger() : file_("log.txt") {}

public:
    static Logger& getInstance() {
        static Logger instance;
        return instance;
    }

    void log(const std::string& msg) {
        std::lock_guard<std::mutex> lock(mutex_);
        file_ << msg << "\n";
    }

    Logger(const Logger&) = delete;
    Logger& operator=(const Logger&) = delete;
};
```

---

#### Q7
```cpp
class Singleton {
    int value_;

    Singleton() : value_(0) {
        std::cout << "Constructing singleton\n";
    }

public:
    static Singleton& getInstance() {
        static Singleton instance;
        return instance;
    }

    void setValue(int v) { value_ = v; }
    int getValue() { return value_; }
};

void func() {
    static int dummy = []() {
        Singleton::getInstance().setValue(42);
        return 0;
    }();
}

int main() {
    std::cout << Singleton::getInstance().getValue();  // What value?
    func();
    std::cout << Singleton::getInstance().getValue();
}
```

**Answer:**
```
0
42
(or 42 42 if func() initialization happens first)
```

**Explanation:**
- Static initialization order within compilation unit: unspecified
- `Singleton::getInstance()` in main may run before `func()`'s static initialization
- If main's call first: singleton initialized with `value_=0`, prints "0"
- Then `func()` runs, sets value to 42, second print shows "42"
- If `func()`'s static init first: singleton initialized, set to 42, both prints show "42"
- Static initialization order fiasco across different statements
- **Key Concept:** Static initialization order unspecified even within same translation unit for different static variables; relying on specific order causes undefined behavior; avoid inter-static dependencies

**Fixed Version:**
```cpp
// Make initialization explicit
int main() {
    func();  // Explicit initialization
    std::cout << Singleton::getInstance().getValue();  // Now always 42
}

// Or initialize singleton with correct value immediately
class Singleton {
    int value_;

    Singleton() : value_(42) {}  // Initialize to desired value

public:
    static Singleton& getInstance() {
        static Singleton instance;
        return instance;
    }
};
```

---

#### Q8
```cpp
class Singleton {
    static Singleton* instance_;

    Singleton() {}

public:
    static Singleton* getInstance() {
        if (!instance_) {
            instance_ = new Singleton();
        }
        return instance_;
    }

    // Bug: no destructor, no cleanup!
};

Singleton* Singleton::instance_ = nullptr;

int main() {
    Singleton* s = Singleton::getInstance();

    // Use singleton...

    // Program exits - memory leak!
}
```

**Answer:**
```
Memory leak (singleton never destroyed, new'ed memory never freed)
```

**Explanation:**
- `getInstance()` uses `new` to create singleton
- No corresponding `delete` anywhere in code
- At program exit, singleton instance leaked
- Valgrind/sanitizers report memory leak
- For true singletons, leaking acceptable (cleaned by OS at exit)
- But if singleton owns resources (files, sockets), those may not be released properly
- **Key Concept:** Heap-allocated singletons without explicit cleanup leak memory; acceptable for pure memory but problematic for resource handles; prefer Meyer's singleton (automatic cleanup) or explicit cleanup

**Fixed Version:**
```cpp
// Option 1: Meyer's Singleton (automatic cleanup)
class Singleton {
    Singleton() {}

public:
    static Singleton& getInstance() {
        static Singleton instance;  // Destroyed at exit automatically
        return instance;
    }
};

// Option 2: Smart pointer with cleanup
class Singleton {
    static std::unique_ptr<Singleton> instance_;

public:
    static Singleton& getInstance() {
        if (!instance_) {
            instance_ = std::make_unique<Singleton>();
        }
        return *instance_;
    }
};

std::unique_ptr<Singleton> Singleton::instance_;

// Option 3: Intentional leak (for singletons with destruction issues)
class Singleton {
public:
    static Singleton& getInstance() {
        static Singleton* instance = new Singleton();  // Intentionally leaked
        return *instance;
    }
};
```

---

#### Q9
```cpp
template<typename T>
class Singleton {
    Singleton() {}

public:
    static T& getInstance() {
        static T instance;
        return instance;
    }

    Singleton(const Singleton&) = delete;
    Singleton& operator=(const Singleton&) = delete;
};

class Logger : public Singleton<Logger> {  // Bug: CRTP with public inheritance!
public:
    void log(const std::string& msg) {
        std::cout << msg << "\n";
    }
};

int main() {
    Logger& logger = Logger::getInstance();

    Singleton<Logger>* base = &logger;  // Bug: can access base class methods!
    // Violates encapsulation...
}
```

**Answer:**
```
Design flaw (public inheritance exposes Singleton base class)
```

**Explanation:**
- CRTP pattern: `Logger` inherits from `Singleton<Logger>`
- Public inheritance makes `Singleton` interface visible
- Can cast `Logger*` to `Singleton<Logger>*`
- Exposes singleton implementation details
- Violates encapsulation (singleton pattern leaks)
- Should use private inheritance for CRTP
- **Key Concept:** CRTP singleton should use private inheritance to hide base class interface; public inheritance exposes implementation details; prefer private inheritance for "implemented-in-terms-of" relationship

**Fixed Version:**
```cpp
template<typename T>
class Singleton {
protected:  // Protected for derived access
    Singleton() {}

public:
    static T& getInstance() {
        static T instance;
        return instance;
    }

    Singleton(const Singleton&) = delete;
    Singleton& operator=(const Singleton&) = delete;
};

class Logger : private Singleton<Logger> {  // Private inheritance!
    friend class Singleton<Logger>;  // Allow base to access constructor

    Logger() {}  // Private constructor

public:
    using Singleton<Logger>::getInstance;  // Expose only getInstance

    void log(const std::string& msg) {
        std::cout << msg << "\n";
    }
};

int main() {
    Logger& logger = Logger::getInstance();
    // Singleton<Logger>* base = &logger;  // Compilation error - private inheritance
    logger.log("Message");
}
```

---

#### Q10
```cpp
class Singleton {
    std::string data_;

    Singleton() {
        // Expensive initialization (e.g., loading large file)
        data_ = loadLargeDataFromDisk();  // Takes 5 seconds
    }

public:
    static Singleton& getInstance() {
        static Singleton instance;  // Bug: initialization happens on first call!
        return instance;
    }

    const std::string& getData() { return data_; }
};

int main() {
    auto start = std::chrono::steady_clock::now();

    // First access triggers initialization
    std::cout << Singleton::getInstance().getData().size();  // Bug: 5 second delay here!

    auto end = std::chrono::steady_clock::now();
    std::cout << "Time: " << std::chrono::duration_cast<std::chrono::seconds>(end - start).count() << "s\n";
}
```

**Answer:**
```
Output: [data size]
Time: 5s
(first access causes unexpected 5-second delay)
```

**Explanation:**
- Meyer's singleton uses lazy initialization
- Instance created on first `getInstance()` call
- Constructor runs at first access → 5-second delay at that point
- Unpredictable latency spike during first access
- Can cause timeouts or poor user experience
- If initialization expensive, prefer eager initialization or async initialization
- **Key Concept:** Lazy singleton initialization causes latency spike on first access; unpredictable timing issue for expensive initialization; consider eager initialization, pre-warming, or async loading for performance-critical applications

**Fixed Version:**
```cpp
// Option 1: Eager initialization
class Singleton {
    static Singleton instance_;  // Initialized at startup
    std::string data_;

    Singleton() {
        data_ = loadLargeDataFromDisk();
    }

public:
    static Singleton& getInstance() {
        return instance_;
    }
};

Singleton Singleton::instance_;  // Initialized before main()

// Option 2: Pre-warm at startup
int main() {
    // Pre-warm singleton at startup (predictable timing)
    Singleton::getInstance();

    // Now all subsequent accesses are fast
    std::cout << Singleton::getInstance().getData().size();
}

// Option 3: Async initialization
class Singleton {
    std::future<std::string> data_future_;

    Singleton() {
        data_future_ = std::async(std::launch::async, loadLargeDataFromDisk);
    }

public:
    const std::string& getData() {
        static std::string data = data_future_.get();  // Wait on first getData()
        return data;
    }
};
```

---
