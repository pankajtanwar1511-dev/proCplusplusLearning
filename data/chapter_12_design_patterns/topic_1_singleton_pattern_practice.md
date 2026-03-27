## TOPIC: Thread-Safe Singleton Pattern

### PRACTICE_TASKS: Code Analysis and Implementation Challenges

#### Q1
```cpp
class Manager {
    static Manager* instance;
    Manager() {}
public:
    static Manager* getInstance() {
        if (!instance) instance = new Manager();
        return instance;
    }
};
Manager* Manager::instance = nullptr;

// Multiple threads call getInstance() simultaneously
// What can go wrong?
```

**Answer:**
```
Race condition: multiple threads may create multiple instances
Memory leak: lost pointers to earlier allocations
```

**Explanation:**
- **Thread interleaving scenario:**
  1. Thread A: checks `if (!instance)` → true (null)
  2. Thread B: checks `if (!instance)` → true (null, before A assigns)
  3. Thread A: executes `instance = new Manager()` → creates Manager #1
  4. Thread B: executes `instance = new Manager()` → creates Manager #2
  5. **Result: Manager #1 pointer lost, memory leaked**
  6. instance now points to Manager #2 only
- **Classic check-then-act race condition (TOCTOU)**
- **Multiple instance violation:** Singleton guarantee broken
- **Memory leak:** First allocated Manager never deleted
- **Possible outcomes:**
  - Different threads see different Manager instances
  - State inconsistency across threads
  - Resource waste (multiple database connections, etc.)
- **Why this happens:** Check and assignment are NOT atomic
- **Common fix 1:** Meyers Singleton (C++11 thread-safe)
  ```cpp
  static Manager& getInstance() {
      static Manager instance;  // Thread-safe since C++11
      return instance;
  }
  ```
- **Common fix 2:** Double-checked locking with mutex
  ```cpp
  static mutex mtx;
  if (!instance) {
      lock_guard lock(mtx);
      if (!instance) instance = new Manager();
  }
  ```
- **Common fix 3:** std::call_once
- **Key Concept:** Lazy Singleton initialization without synchronization causes race conditions and violates single-instance guarantee

---

#### Q2
```cpp
class Service {
public:
    static Service& getInstance() {
        static Service instance;
        return instance;
    }
    ~Service() {
        Logger::getInstance().log("Service destroyed");
    }
};

// What happens if Logger is destroyed before Service?
```

**Answer:**
```
Undefined behavior: accessing destroyed Singleton
Possible crash or corruption during static destruction phase
```

**Explanation:**
- **Static destruction order problem:**
  1. Program ends, static destruction phase begins
  2. **Destruction order of static locals is REVERSE of initialization order**
  3. If Logger::getInstance() called before Service::getInstance(), Logger destroyed AFTER Service
  4. If Service::getInstance() called first, Service destroyed first
  5. **But destruction order is NOT deterministic across compilation units**
- **Problem scenario:**
  1. Logger static local destroyed first (memory freed)
  2. Service destructor runs
  3. Calls `Logger::getInstance().log(...)`
  4. **Access to destroyed object** → undefined behavior
- **Possible outcomes:**
  - Crash (segmentation fault)
  - Corrupted memory access
  - Silent failure (appears to work but UB)
  - Double destruction
- **Why this is common:** Singletons often depend on each other
- **Common fix 1:** Phoenix Singleton (never destroyed)
  ```cpp
  static Logger& getInstance() {
      static Logger* instance = new Logger();  // Never deleted
      return *instance;
  }
  ```
- **Common fix 2:** Dependency injection (avoid Singleton-to-Singleton calls)
- **Common fix 3:** Document initialization order dependencies
- **Common fix 4:** Use Nifty Counter idiom for guaranteed ordering
- **Design guideline:** Avoid Singleton dependencies between Singletons
- **Real-world issue:** Logger, Config, and Database Singletons commonly hit this
- **Key Concept:** Static destruction order fiasco causes UB when Singletons reference each other in destructors; use Phoenix pattern or avoid dependencies

---

#### Q3
```cpp
class Config {
    static unique_ptr<Config> instance;
    static mutex mtx;
public:
    static Config& getInstance() {
        lock_guard<mutex> lock(mtx);
        if (!instance) instance = make_unique<Config>();
        return *instance;
    }
};

// Is this implementation efficient? What's the performance impact?
```

**Answer:**
```
Inefficient: mutex locked on EVERY access
Severe performance bottleneck in high-contention scenarios
```

**Explanation:**
- **Performance problem: Lock on every call**
  1. First call: locks mutex, creates instance, returns
  2. Second call: locks mutex (unnecessary!), checks instance, returns
  3. Third call: locks mutex (unnecessary!), checks instance, returns
  4. **Every subsequent call locks mutex even though instance already exists**
- **Mutex overhead costs:**
  - Lock/unlock system calls
  - Cache invalidation
  - Thread serialization (only 1 thread in getInstance() at a time)
  - Context switches under contention
- **Performance impact:**
  - **Hot path penalized:** getInstance() called frequently → major bottleneck
  - Thread contention increases with thread count
  - Can be 10-100x slower than Meyers Singleton
- **Benchmark comparison:**
  - This approach: ~50-100ns per call (mutex overhead)
  - Meyers Singleton: ~1-2ns per call (simple reference return)
- **Better fix 1:** Meyers Singleton (C++11+, thread-safe, zero overhead after init)
  ```cpp
  static Config& getInstance() {
      static Config instance;  // Magic static, thread-safe
      return instance;
  }
  ```
- **Better fix 2:** Double-checked locking (lock only during initialization)
  ```cpp
  static atomic<Config*> instance;
  Config* tmp = instance.load(memory_order_acquire);
  if (!tmp) {
      lock_guard lock(mtx);
      tmp = instance.load(memory_order_relaxed);
      if (!tmp) {
          tmp = new Config();
          instance.store(tmp, memory_order_release);
      }
  }
  return *tmp;
  ```
- **When this pattern is acceptable:** Rarely accessed Singletons where simplicity > performance
- **Key Concept:** Locking on every access causes severe performance degradation; use Meyers Singleton or double-checked locking for hot-path Singletons

---

#### Q4
```cpp
template<typename T>
class Singleton {
public:
    static T& getInstance() {
        static T instance;
        return instance;
    }
};

class Logger : public Singleton<Logger> {};
class Config : public Singleton<Config> {};

// How many static instances exist in this program?
```

**Answer:**
```
Two separate instances: one for Logger, one for Config
Each template instantiation has its own static instance
```

**Explanation:**
- **Template instantiation creates separate classes:**
  1. `Singleton<Logger>` is ONE complete class
  2. `Singleton<Config>` is ANOTHER complete class
  3. These are as different as `vector<int>` and `vector<double>`
- **Static member per instantiation:**
  - `Singleton<Logger>::getInstance()` has its own `static T instance` (T=Logger)
  - `Singleton<Config>::getInstance()` has its own `static T instance` (T=Config)
  - **No sharing between template instantiations**
- **Memory layout:**
  ```
  Address 0x1000: Logger instance (inside Singleton<Logger>::getInstance())
  Address 0x2000: Config instance (inside Singleton<Config>::getInstance())
  ```
- **How to verify:**
  ```cpp
  Logger& l1 = Logger::getInstance();
  Logger& l2 = Singleton<Logger>::getInstance();  // Same instance
  Config& c = Config::getInstance();  // Different instance
  ```
- **CRTP pattern (Curiously Recurring Template Pattern):**
  - Each derived class uses itself as template parameter
  - Base class provides common Singleton logic
  - Each derived class gets its own Singleton instance
- **Advantages:**
  - Reduces code duplication (don't rewrite getInstance() for each Singleton)
  - Type-safe (can't accidentally access wrong Singleton)
  - Zero runtime overhead (templates resolved at compile time)
- **Common pitfall:** Thinking template static members are shared across all instantiations
- **Use case:** When you have many Singletons and want DRY (Don't Repeat Yourself) code
- **Key Concept:** Template instantiations are separate types with separate static members; CRTP Singleton base provides Singleton behavior per derived class

---

#### Q5
```cpp
class Database {
public:
    static Database& getInstance() {
        static Database instance;
        return instance;
    }

    Database(const Database&) = default;
};

// What design flaw exists in this Singleton?
```

**Answer:**
```
Copy constructor not deleted, violates Singleton guarantee
Allows creating multiple instances via copying
```

**Explanation:**
- **Singleton contract violation:**
  1. Singleton pattern guarantees EXACTLY ONE instance
  2. Copy constructor allows creating second instance
  3. **Pattern broken by copyability**
- **How to violate Singleton:**
  ```cpp
  Database& db1 = Database::getInstance();  // OK, returns the Singleton
  Database db2 = db1;  // OOPS! Creates a COPY (second instance)
  Database db3 = Database::getInstance();  // Another copy!
  ```
- **Now have 3 Database instances:** Original static + db2 copy + db3 copy
- **Why this is dangerous:**
  - Database connections duplicated
  - State inconsistency (changes to db2 don't affect db1)
  - Resource leaks (connections, file handles)
  - Violates fundamental Singleton assumption
- **Correct fix:** Delete copy operations
  ```cpp
  Database(const Database&) = delete;
  Database& operator=(const Database&) = delete;
  ```
- **Also delete move operations** (C++11 Rule of Five):
  ```cpp
  Database(Database&&) = delete;
  Database& operator=(Database&&) = delete;
  ```
- **Why = default is wrong:** Makes copy constructor user-accessible
- **Complete Singleton checklist:**
  - ✅ Static instance
  - ✅ Private constructor
  - ❌ Delete copy constructor
  - ❌ Delete copy assignment
  - ❌ Delete move constructor (optional but recommended)
  - ❌ Delete move assignment (optional but recommended)
- **Real-world consequences:** Connection pool with multiple copies → connection exhaustion
- **Key Concept:** Singleton must delete copy/move operations to prevent creating multiple instances; = default violates Singleton guarantee

---

#### Q6
```cpp
class Service {
    static shared_ptr<Service> instance;
public:
    static shared_ptr<Service> getInstance() {
        if (!instance) instance = make_shared<Service>();
        return instance;
    }
};

// Is this thread-safe? Why or why not?
```

**Answer:**
```
Not thread-safe: race condition on shared_ptr assignment
Multiple Service objects created, memory leaked
```

**Explanation:**
- **Thread interleaving race:**
  1. Thread A: checks `if (!instance)` → true (null)
  2. Thread B: checks `if (!instance)` → true (null, before A assigns)
  3. Thread A: calls `make_shared<Service>()` → creates Service #1, assigns to instance
  4. Thread B: calls `make_shared<Service>()` → creates Service #2, assigns to instance
  5. **Service #1 lost** (shared_ptr replaced)
  6. Service #1 ref count drops to 0 → destroyed immediately
- **shared_ptr is NOT thread-safe for concurrent writes**
  - Reading shared_ptr is safe
  - Modifying same shared_ptr from multiple threads is NOT safe
  - Assignment involves multiple operations (not atomic)
- **Why shared_ptr assignment is complex:**
  1. Allocate control block
  2. Update pointer
  3. Update reference count
  4. Potentially destroy old object
  - **These steps are NOT atomic**
- **Possible outcomes:**
  - Multiple Service instances created transiently
  - Reference count corruption
  - Memory leaks
  - Use-after-free
- **Fix 1:** Use Meyers Singleton (best)
  ```cpp
  static Service& getInstance() {
      static Service instance;
      return instance;
  }
  ```
- **Fix 2:** Protect with mutex
  ```cpp
  static mutex mtx;
  lock_guard lock(mtx);
  if (!instance) instance = make_shared<Service>();
  ```
- **Fix 3:** std::call_once
  ```cpp
  static once_flag flag;
  call_once(flag, [](){ instance = make_shared<Service>(); });
  ```
- **Common misconception:** "shared_ptr is thread-safe so this works" → NO, only control block ops are atomic
- **Key Concept:** shared_ptr assignment is not atomic; concurrent modification requires synchronization; Meyers Singleton avoids complexity

---

#### Q7
```cpp
class Manager {
public:
    static Manager& getInstance() {
        static Manager* instance = nullptr;
        if (!instance) instance = new Manager();
        return *instance;
    }
};

// What happens if getInstance() is called during static destruction?
```

**Answer:**
```
Phoenix pattern: instance never deleted, remains accessible during destruction
Avoids use-after-destruction but causes memory leak
```

**Explanation:**
- **Phoenix Singleton pattern:**
  1. Uses static pointer (not static object)
  2. Allocates with `new` but NEVER deletes
  3. Instance persists until program termination
  4. **Survives static destruction phase**
- **Comparison with Meyers Singleton:**
  ```cpp
  // Meyers: Destroyed during static destruction
  static Manager& getInstance() {
      static Manager instance;  // Destroyed at program end
      return instance;
  }

  // Phoenix: NEVER destroyed
  static Manager& getInstance() {
      static Manager* instance = new Manager();  // Leaked intentionally
      return *instance;
  }
  ```
- **Why Phoenix pattern exists:**
  - Other static objects might call getInstance() during their destruction
  - Meyers Singleton might already be destroyed → undefined behavior
  - Phoenix remains valid throughout destruction phase
- **Trade-offs:**
  - ✅ Safe during static destruction
  - ✅ No use-after-destruction UB
  - ❌ Memory leak (instance never deleted)
  - ❌ Destructor never called (RAII cleanup skipped)
  - ❌ Valgrind reports leaks
- **When to use Phoenix:**
  - Logging systems accessed during destruction
  - Debug/profiling utilities
  - Any Singleton accessed by other static destructors
- **Problem with current code:** NOT thread-safe
  ```cpp
  // Thread-safe Phoenix:
  static Manager& getInstance() {
      static atomic<Manager*> instance{nullptr};
      Manager* tmp = instance.load(memory_order_acquire);
      if (!tmp) {
          tmp = new Manager();
          instance.store(tmp, memory_order_release);
      }
      return *tmp;  // Still race, need compare_exchange!
  }
  ```
- **Better Phoenix with call_once:**
  ```cpp
  static once_flag flag;
  static Manager* instance = nullptr;
  call_once(flag, [](){ instance = new Manager(); });
  return *instance;
  ```
- **Key Concept:** Phoenix Singleton trades memory leak for safety during static destruction; useful when Singleton accessed by other destructors

---

#### Q8
```cpp
class Logger {
    static once_flag flag;
    static unique_ptr<Logger> instance;
public:
    static Logger& getInstance() {
        call_once(flag, []() {
            instance.reset(new Logger());
        });
        return *instance;
    }
};

// What are the advantages of std::call_once over Meyers Singleton?
```

**Answer:**
```
std::call_once allows complex initialization with parameters
Better control over exception handling and initialization timing
```

**Explanation:**
- **Advantages of std::call_once:**
  1. **Parametrized initialization:**
     ```cpp
     static Logger& getInstance(const string& filename) {
         call_once(flag, [&](){ instance = make_unique<Logger>(filename); });
         return *instance;
     }
     ```
  2. **Complex error handling:**
     ```cpp
     call_once(flag, [](){
         try {
             instance = make_unique<Logger>();
         } catch(const exception& e) {
             logError(e.what());
             throw;
         }
     });
     ```
  3. **Multiple initialization steps:**
     ```cpp
     call_once(flag, [](){
         loadConfig();
         instance = make_unique<Logger>();
         instance->initialize();
     });
     ```
  4. **Explicit control:** Can verify when initialization completes
- **Advantages of Meyers Singleton:**
  1. **Simpler:** Zero boilerplate
     ```cpp
     static Logger& getInstance() {
         static Logger instance;  // Done!
         return instance;
     }
     ```
  2. **No manual memory management:** Stack-allocated, automatic cleanup
  3. **Compiler-optimized:** No runtime flag checks after first call
  4. **Exception-safe by default:** Retries on exception
- **Performance comparison:**
  - call_once: Check flag on every access (small overhead)
  - Meyers: Compiler-optimized branch (near-zero overhead after init)
- **When to use call_once:**
  - Need runtime parameters for initialization
  - Complex multi-step initialization
  - Want explicit control over init timing
  - Phoenix pattern (avoid destruction)
- **When to use Meyers:**
  - Simple initialization (no parameters)
  - Want automatic destruction
  - Prefer simplicity and performance
- **Hybrid approach:**
  ```cpp
  static Logger& getInstance() {
      static once_flag flag;
      static unique_ptr<Logger> instance;
      call_once(flag, [](){
          // Complex init here
          instance = createLogger();
      });
      return *instance;
  }
  ```
- **Key Concept:** call_once offers flexibility for complex initialization; Meyers Singleton simpler and faster for basic cases; choose based on initialization complexity

---

#### Q9
```cpp
class Config {
    int value;
public:
    static Config& getInstance() {
        static Config instance;
        return instance;
    }

    Config() : value(readFromFile()) {}

    int readFromFile() {
        // Opens file, reads value
        return 42;
    }
};

// What if readFromFile() throws an exception?
```

**Answer:**
```
Exception propagates to caller
Initialization guard resets, allowing retry on next call
Instance construction retried until success
```

**Explanation:**
- **C++11 magic static exception handling:**
  1. First call to getInstance()
  2. Compiler sets initialization guard (flag indicating "initializing")
  3. Config constructor starts
  4. readFromFile() throws exception
  5. **Initialization guard RESETS** (marked as "not initialized")
  6. Exception propagates to caller
  7. **Instance NOT constructed**
- **Retry on next call:**
  ```cpp
  try {
      Config& c1 = Config::getInstance();  // Throws
  } catch(...) {
      // First attempt failed
  }

  try {
      Config& c2 = Config::getInstance();  // Retries construction
  } catch(...) {
      // Second attempt
  }
  ```
- **Each call retries construction** until success
- **Comparison with pre-C++11:**
  - Pre-C++11: Implementation-defined (often failed permanently)
  - C++11+: Guaranteed retry behavior
- **How initialization guard works:**
  ```cpp
  // Compiler-generated pseudo-code:
  static bool initialized = false;
  static bool in_progress = false;
  static alignas(Config) char storage[sizeof(Config)];

  if (!initialized) {
      if (in_progress) throw "recursive init";  // Detect recursion
      in_progress = true;
      try {
          new (storage) Config();  // Placement new
          initialized = true;
      } catch(...) {
          in_progress = false;  // RESET on exception
          throw;
      }
      in_progress = false;
  }
  return *reinterpret_cast<Config*>(storage);
  ```
- **Thread safety with exceptions:**
  - If one thread throws during init, guard resets
  - Other threads can retry
  - No permanent "broken" state
- **Design implications:**
  - Can have fallback initialization strategies
  - Useful for resource initialization that might fail temporarily
  - Example: Database connection might fail initially but succeed later
- **Recursive initialization detection:**
  ```cpp
  Config() : value(Config::getInstance().value) {}  // Throws!
  // C++11 detects recursion and throws exception
  ```
- **Key Concept:** C++11 guarantees static local construction retries after exception; initialization guard resets allowing recovery from transient failures

---

#### Q10
```cpp
class Service {
    static Service instance;
    Service() {}
public:
    static Service& getInstance() {
        return instance;
    }
};

Service Service::instance;

// What's the problem with this approach compared to Meyers Singleton?
```

**Answer:**
```
Static member initialized at program startup (eager), not lazy
Wastes resources if Service never used
Static initialization order fiasco risk
```

**Explanation:**
- **Eager vs Lazy initialization:**
  1. **This approach (Eager):**
     - `Service::instance` constructed during static initialization phase
     - Happens BEFORE main() runs
     - **Initialized whether used or not**
  2. **Meyers Singleton (Lazy):**
     - Constructed on first getInstance() call
     - Happens AFTER main() starts
     - **Only initialized if accessed**
- **Problems with eager initialization:**
  1. **Resource waste:**
     ```cpp
     int main() {
         // Service never used
         return 0;
     }
     // Service was constructed anyway!
     ```
  2. **Slow startup time:**
     - Heavy constructor (database connection, file I/O) delays program start
     - Meyers defers cost until needed
  3. **Static initialization order fiasco:**
     ```cpp
     // File1.cpp
     Service Service::instance;  // Uses Logger in constructor

     // File2.cpp
     Logger Logger::instance;    // Used by Service

     // Which initializes first? UNDEFINED!
     ```
  4. **No control over initialization timing**
- **Advantages of Meyers (Lazy):**
  - Resources allocated only when needed
  - Initialization happens after main() starts (controllable timing)
  - No static initialization order issues (deterministic per compilation unit)
  - Fast program startup
- **When eager initialization is acceptable:**
  - Service ALWAYS used
  - Constructor is cheap
  - Need initialization before main()
  - No dependencies on other statics
- **Benchmark example:**
  ```cpp
  // Eager: 500ms startup (connects to DB)
  // Lazy: 10ms startup, 500ms on first use
  // If service rarely used: Lazy saves 490ms most of the time
  ```
- **Static initialization phases:**
  1. **Zero-initialization:** All statics set to 0/null
  2. **Dynamic initialization:** Constructors run (ORDER UNDEFINED across TUs)
  3. **main() starts**
  4. **Lazy static locals initialized on first access**
- **Key Concept:** Static member Singleton is eager (initialized at startup); Meyers Singleton is lazy (initialized on first use); lazy avoids resource waste and initialization order issues

---

#### Q11
```cpp
class Manager {
    static atomic<Manager*> instance;
public:
    static Manager* getInstance() {
        Manager* tmp = instance.load(memory_order_acquire);
        if (!tmp) {
            tmp = new Manager();
            instance.store(tmp, memory_order_release);
        }
        return tmp;
    }
};

// Is this lock-free Singleton implementation correct?
```

**Answer:**
```
Not correct: TOCTOU race between load and store
Multiple Manager instances created, memory leaked
Must use compare_exchange for atomic check-and-set
```

**Explanation:**
- **Race condition scenario:**
  1. Thread A: loads instance → null
  2. Thread B: loads instance → null (before A stores)
  3. Thread A: creates Manager #1, stores to instance
  4. Thread B: creates Manager #2, stores to instance (overwrites!)
  5. **Manager #1 leaked** (pointer lost)
  6. **Singleton violated** (multiple instances created)
- **Why load + store is not atomic:**
  - These are TWO separate atomic operations
  - Gap between load and store allows races
  - **Check-then-act pattern without atomicity**
- **Correct fix: Use compare_exchange**
  ```cpp
  static Manager* getInstance() {
      Manager* tmp = instance.load(memory_order_acquire);
      if (!tmp) {
          Manager* new_instance = new Manager();
          if (!instance.compare_exchange_strong(tmp, new_instance,
                                                 memory_order_release,
                                                 memory_order_acquire)) {
              delete new_instance;  // Lost race, cleanup
          } else {
              tmp = new_instance;   // Won race
          }
      }
      return tmp;
  }
  ```
- **How compare_exchange works:**
  - **Atomically:** Check if instance == expected (tmp), if yes, set to desired (new_instance)
  - Returns true if exchange succeeded
  - Returns false if another thread won (tmp updated to current value)
  - **Compare-and-swap (CAS) is THE fundamental lock-free primitive**
- **Why cleanup matters:**
  ```cpp
  // Without cleanup:
  if (!instance.compare_exchange_strong(tmp, new_instance, ...)) {
      // new_instance leaked here!
  }

  // With cleanup:
  if (!instance.compare_exchange_strong(tmp, new_instance, ...)) {
      delete new_instance;  // Lost race, delete our attempt
  }
  ```
- **Memory ordering explanation:**
  - **Success: memory_order_release** - Synchronizes Manager construction
  - **Failure: memory_order_acquire** - Load current value with acquire semantics
- **Alternative: Double-checked locking (still lock-free after init)**
  ```cpp
  static atomic<Manager*> instance{nullptr};
  static mutex mtx;

  Manager* tmp = instance.load(memory_order_acquire);
  if (!tmp) {
      lock_guard lock(mtx);
      tmp = instance.load(memory_order_relaxed);
      if (!tmp) {
          tmp = new Manager();
          instance.store(tmp, memory_order_release);
      }
  }
  return tmp;
  ```
- **Why not use Meyers Singleton?** This pattern needed if:
  - Want lock-free access (Meyers uses mutex-like guards)
  - Want explicit memory ordering control
  - Phoenix pattern (never destroy)
- **Performance:** CAS retry loop typically succeeds first try after initialization
- **Key Concept:** Atomic load + store is NOT atomic operation; use compare_exchange_strong for atomic check-and-set; cleanup losing thread's allocation

---

#### Q12
```cpp
class Logger {
public:
    static Logger& getInstance() {
        static Logger instance;
        return instance;
    }

    void log(const string& msg) {
        file << msg << endl;
    }

    ~Logger() {
        file.close();
    }
private:
    ofstream file;
    Logger() : file("log.txt") {}
};

// Another static object logs during its destruction - is this safe?
```

**Answer:**
```
Not safe: file might be closed before other destructors run
Accessing closed file causes failures or undefined behavior
```

**Explanation:**
- **Static destruction order problem:**
  1. Program ends, static destruction begins
  2. **Logger destructor runs** (closes file)
  3. Another static object destructor runs
  4. Calls `Logger::getInstance().log("cleanup")`
  5. **Access to destroyed Logger with closed file**
- **What happens when logging after destruction:**
  ```cpp
  file << msg << endl;  // file.close() already called!
  ```
  - `ofstream::operator<<` on closed stream → sets failbit
  - May appear to work (no crash) but data lost
  - **Silent failure** - log messages disappear
- **Why this pattern is common:**
  ```cpp
  class DatabasePool {
      ~DatabasePool() {
          Logger::getInstance().log("Closing connections");  // Danger!
      }
  };
  ```
- **Destruction order rules:**
  - **Within one TU:** Reverse of initialization order
  - **Across TUs:** UNDEFINED order
  - If DatabasePool initialized before Logger → Logger destroyed first!
- **Solutions:**
  1. **Phoenix Singleton** (never destroy):
     ```cpp
     static Logger& getInstance() {
         static Logger* instance = new Logger();  // Never deleted
         return *instance;
     }
     ```
  2. **Check if destroyed:**
     ```cpp
     void log(const string& msg) {
         if (file.is_open()) {  // Guard against closed file
             file << msg << endl;
         }
     }
     ```
  3. **Nifty Counter idiom** (guarantee Logger outlives all users)
  4. **Avoid logging in destructors** (best practice)
- **Real-world consequences:**
  - Missing crash reports
  - Lost audit logs
  - Debugging nightmare (why no logs?)
- **Additional issue: Double close**
  ```cpp
  ~Logger() {
      file.close();  // Explicit close
  }
  // file destructor also closes → double close (safe but redundant)
  ```
- **Better design:**
  ```cpp
  class Logger {
      ~Logger() {
          if (file.is_open()) {
              file.flush();  // Ensure data written
          }
          // Let file destructor handle close
      }
  };
  ```
- **Key Concept:** Accessing Singleton during static destruction is UB if Singleton already destroyed; use Phoenix pattern or avoid dependencies

---

#### Q13
```cpp
// File1.cpp
class Service {
public:
    static Service& getInstance() {
        static Service instance;
        return instance;
    }
};

// File2.cpp (in a DLL/shared library)
void libraryFunction() {
    Service::getInstance().doWork();
}

// How many Service instances exist in this scenario?
```

**Answer:**
```
Potentially TWO instances: one in main executable, one in DLL
Each module has its own copy of static local variable
```

**Explanation:**
- **DLL/Shared library boundary issue:**
  1. Main executable compiles Service::getInstance() → static instance #1
  2. DLL compiles Service::getInstance() → static instance #2
  3. **Each module gets its own copy of template code**
  4. **Two separate Service objects exist!**
- **Why this happens:**
  - Template and inline functions compiled into each translation unit
  - Static locals are per-instantiation, not per-type
  - DLL has separate address space for statics
  - **Symbol not shared across module boundaries by default**
- **Platform-specific behavior:**
  ```cpp
  // Windows: Two instances (default hidden visibility)
  // Linux: Two instances unless -fvisibility=default

  // With explicit export:
  class __declspec(dllexport) Service {  // Windows
  class __attribute__((visibility("default"))) Service {  // Linux
  ```
- **How to verify:**
  ```cpp
  // Main.exe
  Service& s1 = Service::getInstance();
  cout << &s1 << endl;  // Address: 0x400000

  // DLL
  Service& s2 = Service::getInstance();
  cout << &s2 << endl;  // Address: 0x10000000 (different!)
  ```
- **State inconsistency problem:**
  ```cpp
  // Main.exe sets config
  Service::getInstance().setConfig("debug");

  // DLL reads different instance!
  string cfg = Service::getInstance().getConfig();  // Returns default, not "debug"
  ```
- **Solutions:**
  1. **Export Singleton explicitly:**
     ```cpp
     class DLLEXPORT Service {  // Force symbol sharing
         static Service& getInstance();
     };
     ```
  2. **Factory in main executable:**
     ```cpp
     // Main provides getInstance(), DLL calls it
     extern "C" DLLEXPORT Service& getServiceInstance() {
         return Service::getInstance();
     }
     ```
  3. **Avoid Singleton across DLL boundaries**
  4. **Use dependency injection instead**
- **Related issues:**
  - Different allocators per module → delete in wrong module crashes
  - Different C++ runtimes → memory corruption
  - Version mismatches → ABI incompatibility
- **Best practice:** Avoid Singleton pattern when code crosses DLL boundaries
- **Key Concept:** Static locals are per-module in DLLs; Singleton can create multiple instances across module boundaries; use explicit export or avoid pattern

---

#### Q14
```cpp
class Database {
    Database() {
        if (failedToConnect()) throw runtime_error("Connection failed");
    }
public:
    static Database& getInstance() {
        static Database instance;
        return instance;
    }
};

int main() {
    try {
        Database::getInstance();
    } catch(...) {
        // Can I retry?
    }
}
```

**Answer:**
```
Yes, can retry!
C++11 guarantees initialization guard resets on exception
Each call retries construction until success
```

**Explanation:**
- **Exception-safe initialization (C++11):**
  1. First getInstance() call
  2. Database constructor starts
  3. failedToConnect() returns true
  4. **Constructor throws runtime_error**
  5. **Initialization guard RESETS** (marked "not initialized")
  6. Exception propagates to caller
  7. static instance remains unconstructed
- **Retry mechanism:**
  ```cpp
  bool initialized = false;
  try {
      Database::getInstance();  // First attempt
  } catch(...) {
      initialized = false;
  }

  if (!initialized) {
      try {
          Database::getInstance();  // Second attempt (retries)
      } catch(...) {
          // Still failing
      }
  }
  ```
- **Why retry is useful:**
  - **Transient failures:** Network down, file locked, resource busy
  - **Retry with backoff:**
    ```cpp
    for (int i = 0; i < 5; ++i) {
        try {
            return Database::getInstance();
        } catch(const exception& e) {
            cerr << "Attempt " << i << " failed: " << e.what() << endl;
            this_thread::sleep_for(chrono::seconds(1 << i));  // Exponential backoff
        }
    }
    throw runtime_error("Failed after 5 attempts");
    ```
- **Contrast with pre-C++11:**
  - Pre-C++11: Undefined or permanent failure (implementation-specific)
  - Some compilers marked as "initialized" even after throw
  - C++11+: Guaranteed retry behavior
- **Thread-safe retry:**
  ```cpp
  // Thread A throws during init
  // Thread B waiting on initialization guard
  // After A throws, B can retry (or A can retry)
  ```
- **Practical example:**
  ```cpp
  Database() {
      for (int retry = 0; retry < 3; ++retry) {
          try {
              connection = connect("localhost", 5432);
              return;  // Success
          } catch(const connection_error& e) {
              if (retry == 2) throw;  // Give up after 3 tries
              this_thread::sleep_for(chrono::milliseconds(100));
          }
      }
  }
  ```
- **Caveat: Partially-constructed objects**
  ```cpp
  Database() : file("db.txt") {  // file opened
      if (failedToConnect()) throw;  // Throw
      // file destructor runs (RAII cleanup)
  }
  // Next retry starts fresh (no leftover state)
  ```
- **Memory safety:** No memory leak on exception (static storage not allocated yet)
- **Key Concept:** C++11 Meyers Singleton retries initialization after exception; initialization guard resets allowing recovery from transient failures

---

#### Q15
```cpp
class Manager;
extern Manager& getManager();  // Declaration

// File1.cpp
Manager& getManager() {
    static Manager instance;
    return instance;
}

// File2.cpp
Manager& mgr = getManager();  // Global initialization

// What problem can occur here?
```

**Answer:**
```
Static initialization order fiasco
mgr might be initialized before Manager instance exists
Undefined behavior if mgr used before first getManager() call
```

**Explanation:**
- **The problem: Global variable initialization**
  ```cpp
  // File2.cpp
  Manager& mgr = getManager();  // When does this run?
  ```
  - mgr is global variable → initialized during static initialization phase
  - **Calls getManager() before main() starts**
  - **But when?** Order undefined across translation units!
- **Dangerous scenario:**
  1. **File2.cpp static init runs FIRST**
  2. Executes `Manager& mgr = getManager()`
  3. getManager() called
  4. **static Manager instance NOT yet initialized** (File1 hasn't run)
  5. Returns reference to uninitialized memory
  6. mgr now dangling reference
  7. **Undefined behavior when mgr accessed**
- **Why order is undefined:**
  - C++ standard doesn't specify initialization order across TUs
  - Linker chooses order (often alphabetically or link order)
  - **No guarantees!**
- **Why this compiles:**
  - Compiler sees valid code in each TU individually
  - Linker doesn't detect the dependency
  - Problem only manifests at runtime
- **Contrast with safe pattern:**
  ```cpp
  // Safe: Function-local access
  void useManager() {
      Manager& mgr = getManager();  // OK, after main() starts
      mgr.doWork();
  }
  ```
- **Solutions:**
  1. **Never use global references to Singletons:**
     ```cpp
     // BAD: Global initialization
     Manager& mgr = getManager();

     // GOOD: Access via function
     Manager& getManagerRef() {
         return getManager();
     }
     ```
  2. **Schwarz Counter (Nifty Counter) idiom:**
     ```cpp
     // Manager.h
     static int managerInitCounter;
     struct ManagerInitializer {
         ManagerInitializer() {
             if (managerInitCounter++ == 0) {
                 // Initialize Manager
             }
         }
         ~ManagerInitializer() {
             if (--managerInitCounter == 0) {
                 // Cleanup Manager
             }
         }
     };
     static ManagerInitializer managerInit;  // In every TU that includes header
     ```
  3. **Dependency Injection** (avoid Singleton)
  4. **Document ordering requirements** (fragile!)
- **Real-world example (iostream):**
  ```cpp
  // Why std::cout works everywhere:
  // Uses Schwarz Counter to guarantee initialization before use
  ```
- **Key Concept:** Global variable initialization order is undefined across TUs; accessing Singleton via global init causes static initialization order fiasco; use function-scope access

---

#### Q16
```cpp
class IService {
public:
    virtual ~IService() = default;
    virtual void execute() = 0;
};

class ServiceFactory {
    static unique_ptr<IService> instance;
public:
    static IService& getInstance() {
        if (!instance) instance = createService();
        return *instance;
    }
    static void setTestInstance(unique_ptr<IService> svc) {
        instance = move(svc);
    }
};

// How does this design improve testability?
```

**Answer:**
```
Allows dependency injection of mock implementations
Breaks Singleton coupling for unit testing
Test seam for replacing production code with test doubles
```

**Explanation:**
- **Testability problem with traditional Singleton:**
  ```cpp
  class Database {  // Traditional Singleton
      static Database& getInstance() { static Database db; return db; }
  };

  void processData() {
      Database::getInstance().query(...);  // Hard-coded dependency!
  }

  // Testing processData() requires real Database (slow, flaky)
  ```
- **Solution: Testable Singleton with injection:**
  ```cpp
  // Production code uses real implementation
  IService& svc = ServiceFactory::getInstance();
  svc.execute();

  // Test code injects mock
  class MockService : public IService {
      void execute() override { /* mock behavior */ }
  };

  TEST(ServiceTest, TestBehavior) {
      ServiceFactory::setTestInstance(make_unique<MockService>());
      // Now test code uses mock!
  }
  ```
- **Advantages for testing:**
  1. **Fast tests:** Mock doesn't do expensive I/O
  2. **Deterministic:** No network/DB flakiness
  3. **Isolated:** Test one component at a time
  4. **Controlled failures:** Mock can simulate errors
  5. **Verification:** Track calls to mock
- **Test setup pattern:**
  ```cpp
  class ServiceTest : public ::testing::Test {
  protected:
      void SetUp() override {
          mock = make_unique<MockService>();
          ServiceFactory::setTestInstance(move(mock));
      }

      void TearDown() override {
          ServiceFactory::setTestInstance(nullptr);  // Reset
      }

      unique_ptr<MockService> mock;
  };
  ```
- **Mock verification example:**
  ```cpp
  class MockService : public IService {
      mutable int executeCalls = 0;
  public:
      void execute() override { executeCalls++; }
      int getExecuteCalls() const { return executeCalls; }
  };

  TEST(ServiceTest, CallsExecute) {
      auto mock = make_unique<MockService>();
      MockService* mockPtr = mock.get();  // Keep pointer
      ServiceFactory::setTestInstance(move(mock));

      businessLogic();  // Uses ServiceFactory::getInstance()

      ASSERT_EQ(3, mockPtr->getExecuteCalls());  // Verify called 3 times
  }
  ```
- **Design trade-offs:**
  - ✅ Testable
  - ✅ Flexible (swap implementations)
  - ❌ Not thread-safe (needs synchronization)
  - ❌ Global mutable state (test pollution risk)
  - ❌ Violates pure Singleton (can be replaced)
- **Thread-safe version:**
  ```cpp
  static void setTestInstance(unique_ptr<IService> svc) {
      lock_guard lock(mtx);
      instance = move(svc);
  }
  ```
- **Alternative: Dependency injection without Singleton:**
  ```cpp
  class BusinessLogic {
      IService& service;
  public:
      BusinessLogic(IService& svc) : service(svc) {}  // Inject dependency
  };

  // Production: inject real service
  // Tests: inject mock
  ```
- **Key Concept:** Singleton with injection seam enables testing; setTestInstance() replaces production code with mocks; pure Singleton is untestable (hard-coded dependencies)

---

#### Q17
```cpp
class Config {
public:
    static Config& getInstance() {
        static Config instance;
        return instance;
    }

    void reload() {
        // Re-read configuration
    }
};

// Multiple threads call reload() - what synchronization is needed?
```

**Answer:**
```
reload() needs mutex protection for internal state modifications
getInstance() is thread-safe (C++11), but member functions are NOT
Data race on Config member variables
```

**Explanation:**
- **Common misconception:**
  - "getInstance() is thread-safe, so Config is thread-safe" → **FALSE!**
  - getInstance() only guarantees **construction** is thread-safe
  - **Member function calls are NOT synchronized**
- **The data race:**
  ```cpp
  class Config {
      map<string, string> settings;  // Mutable state

      void reload() {
          settings.clear();  // Modifies state
          readFromFile();    // Modifies state
      }
  };

  // Thread A calls reload()
  // Thread B calls reload()
  // Both modify settings concurrently → DATA RACE
  ```
- **What can go wrong:**
  1. **Corrupted map:** concurrent clear() and insert()
  2. **Iterator invalidation:** one thread iterating, another clearing
  3. **Partial updates:** read half-old, half-new config
  4. **Crashes:** heap corruption from concurrent modification
- **Solution: Add member mutex**
  ```cpp
  class Config {
      mutable mutex mtx;
      map<string, string> settings;

  public:
      void reload() {
          lock_guard lock(mtx);  // Protect modification
          settings.clear();
          readFromFile();
      }

      string get(const string& key) const {
          lock_guard lock(mtx);  // Protect read
          return settings.at(key);
      }
  };
  ```
- **Why mutable mutex?**
  - Mutex needs to be lockable in const functions (get())
  - `mutable` allows modification in const context
  - Common pattern for thread-safe const operations
- **Reader-writer optimization:**
  ```cpp
  class Config {
      mutable shared_mutex mtx;
      map<string, string> settings;

  public:
      void reload() {
          unique_lock lock(mtx);  // Exclusive (write) lock
          settings.clear();
          readFromFile();
      }

      string get(const string& key) const {
          shared_lock lock(mtx);  // Shared (read) lock
          return settings.at(key);
      }
  };
  ```
- **Performance consideration:**
  - Many readers, few writers → shared_mutex better
  - Frequent writes → regular mutex simpler
- **Singleton construction vs member functions:**
  | Operation | Thread Safety | Reason |
  |-----------|--------------|---------|
  | getInstance() | ✅ Safe | C++11 magic static |
  | Constructor | ✅ Safe | Called once by getInstance() |
  | Member functions | ❌ Not safe | User responsibility |
  | Destructor | ⚠️ Tricky | Static destruction order |
- **Key Concept:** Singleton construction thread-safety ≠ member function thread-safety; protect mutable state with member mutex; shared_mutex for read-heavy workloads

---

#### Q18
```cpp
class ResourcePool {
    static ResourcePool* instance;
    vector<Resource> resources;

    ResourcePool() {
        for (int i = 0; i < 100; ++i) {
            resources.emplace_back();  // Allocate 100 resources
        }
    }
public:
    static ResourcePool& getInstance() {
        static ResourcePool instance;
        return instance;
    }
};

// What are the implications of this design for startup time?
```

**Answer:**
```
Lazy initialization defers 100 resource allocations until first use
Improves startup time if pool rarely used
First access pays initialization cost (amortized)
```

**Explanation:**
- **Lazy vs Eager initialization timing:**
  1. **Eager (static member):**
     ```cpp
     ResourcePool ResourcePool::instance;  // Before main()
     // 100 resources allocated during static init → 500ms startup
     ```
  2. **Lazy (Meyers Singleton):**
     ```cpp
     static ResourcePool& getInstance() {
         static ResourcePool instance;  // On first call
         return instance;
     }
     // Fast startup (5ms), 500ms on first use
     ```
- **Startup time comparison:**
  ```
  Eager:  |-----500ms-----|  main()  |---app runtime---|
          [allocate 100]

  Lazy:   |-5ms-|  main()  |---200ms---|---500ms---|---runtime---|
                                       [first call] [allocate 100]
  ```
- **When lazy helps:**
  - Resource pool rarely used (developer tools, admin features)
  - Conditional features (enabled via config)
  - Multiple optional subsystems
  - Fast startup requirement
- **When lazy hurts:**
  - First use is time-critical (request latency spike)
  - Resource always needed
  - Predictable startup cost preferred
- **Startup time benchmark example:**
  ```cpp
  // Eager: 2.5s startup, 1000 resources allocated
  // Many resources never used!

  // Lazy: 50ms startup, resources allocated on-demand
  // 5-10% of resources actually used
  ```
- **Predictable first-access pattern:**
  ```cpp
  int main() {
      // Warm up all Singletons during startup phase
      ResourcePool::getInstance();  // Pay cost now
      Logger::getInstance();
      ConfigManager::getInstance();

      // Now first user request has predictable latency
      runServer();
  }
  ```
- **Trade-offs summary:**
  | Aspect | Eager | Lazy |
  |--------|-------|------|
  | Startup time | Slow | Fast |
  | First access | Fast | Slow |
  | Unused resources | Wasted | Not allocated |
  | Latency spike | No | Yes (first call) |
  | Complexity | Simple | Simple (C++11) |
- **Real-world example:**
  ```cpp
  // Chrome browser: Lazy-load extensions
  // Startup: 100ms without extensions
  // Extensions loaded when tabs use them
  // Result: 10x faster startup
  ```
- **Key Concept:** Lazy Singleton defers resource allocation to first access; improves startup time for rarely-used resources; first-access latency spike; warm up in main() if predictability needed

---

#### Q19
```cpp
class Singleton {
protected:
    Singleton() = default;
    Singleton(const Singleton&) = delete;
    Singleton& operator=(const Singleton&) = delete;
};

class MyClass : public Singleton {
    MyClass() = default;
public:
    static MyClass& getInstance() {
        static MyClass instance;
        return instance;
    }
};

// Can someone still create multiple instances of MyClass?
```

**Answer:**
```
Yes! Protected constructor allows derived classes to construct
Friend classes can also construct
Need private constructor for strict enforcement
```

**Explanation:**
- **Access control problem:**
  ```cpp
  class Singleton {
  protected:  // ← DANGER!
      Singleton() = default;
  };

  class MyClass : public Singleton {
      MyClass() = default;  // Can call protected base constructor
  public:
      static MyClass& getInstance() { ... }
  };

  // Another derived class can violate Singleton!
  class EvilClass : public MyClass {
  public:
      EvilClass() {}  // Calls MyClass(), which calls Singleton()
  };

  EvilClass e1;  // Creates second instance!
  EvilClass e2;  // Creates third instance!
  ```
- **Why protected fails:**
  - Protected members accessible to derived classes
  - Any class can inherit and call constructor
  - **Singleton guarantee broken**
- **Friend classes can also bypass:**
  ```cpp
  class MyClass : public Singleton {
      friend class EvilClass;  // Friend has access
  private:
      MyClass() = default;
  };

  class EvilClass {
      void createInstances() {
          MyClass m1;  // Friend can construct!
          MyClass m2;
      }
  };
  ```
- **Correct enforcement: Private constructor**
  ```cpp
  class Singleton {
  private:  // ← CORRECT
      Singleton() = default;
      Singleton(const Singleton&) = delete;
      Singleton& operator=(const Singleton&) = delete;

  protected:
      // Allow derived classes to inherit, but NOT construct
      ~Singleton() = default;  // Protected destructor OK
  };
  ```
- **Problem with private in CRTP:**
  ```cpp
  class Singleton {
  private:
      Singleton() = default;  // Private
  };

  class MyClass : public Singleton {
      MyClass() = default;  // ERROR: Can't access private base constructor!
  };
  ```
- **Solution: Make derived class a friend:**
  ```cpp
  template<typename T>
  class Singleton {
      friend T;  // Allow T to access private constructor
  private:
      Singleton() = default;
  };

  class MyClass : public Singleton<MyClass> {
      MyClass() = default;  // OK, MyClass is friend of Singleton<MyClass>
  public:
      static MyClass& getInstance() {
          static MyClass instance;
          return instance;
      }
  };
  ```
- **Complete CRTP Singleton base:**
  ```cpp
  template<typename T>
  class Singleton {
      friend T;
  protected:
      Singleton() = default;
      ~Singleton() = default;
  private:
      Singleton(const Singleton&) = delete;
      Singleton& operator=(const Singleton&) = delete;
      Singleton(Singleton&&) = delete;
      Singleton& operator=(Singleton&&) = delete;
  };

  class MyClass : public Singleton<MyClass> {
  private:
      friend class Singleton<MyClass>;
      MyClass() = default;
  public:
      static MyClass& getInstance() {
          static MyClass instance;
          return instance;
      }
  };
  ```
- **Key Concept:** Protected constructor allows derived/friend classes to violate Singleton; use private constructor with friend declaration for CRTP pattern

---

#### Q20
```cpp
class Logger {
public:
    static Logger& getInstance() {
        static Logger instance;
        return instance;
    }

    Logger& operator=(const Logger&) = delete;
    Logger(const Logger&) = delete;
    Logger(Logger&&) = delete;
    Logger& operator=(Logger&&) = delete;
};

// Is this sufficient to prevent copying and moving?
```

**Answer:**
```
Sufficient if constructor is private
Without private constructor, can create multiple instances directly
Need both: delete copy/move AND private constructor
```

**Explanation:**
- **What's deleted:**
  ```cpp
  Logger(const Logger&) = delete;      // Copy constructor
  Logger& operator=(const Logger&) = delete;  // Copy assignment
  Logger(Logger&&) = delete;           // Move constructor
  Logger& operator=(Logger&&) = delete;       // Move assignment
  ```
  - **Prevents copying from existing instance**
  - **Prevents moving from existing instance**
- **What's NOT prevented:**
  ```cpp
  class Logger {
      // Constructor NOT private!
  public:
      static Logger& getInstance() { ... }
      // Copy/move deleted
  };

  Logger l1;  // OOPS! Direct construction allowed!
  Logger l2;  // Creates second instance!
  ```
- **Complete Singleton requires:**
  ```cpp
  class Logger {
  private:
      Logger() = default;  // ← CRITICAL

  public:
      static Logger& getInstance() {
          static Logger instance;
          return instance;
      }

      // Delete copy/move
      Logger(const Logger&) = delete;
      Logger& operator=(const Logger&) = delete;
      Logger(Logger&&) = delete;
      Logger& operator=(Logger&&) = delete;
  };
  ```
- **Why both are needed:**
  | Protection | Prevents |
  |------------|----------|
  | Private constructor | Direct instantiation: `Logger l;` |
  | Delete copy | Copying: `Logger l2 = l1;` |
  | Delete copy assign | Assignment: `l2 = l1;` |
  | Delete move | Moving: `Logger l2 = std::move(l1);` |
  | Delete move assign | Move assignment: `l2 = std::move(l1);` |
- **Rule of Five/Zero:**
  - **Rule of Five:** If you define one, define all five
  - Copy constructor, copy assignment, move constructor, move assignment, destructor
  - **For Singleton:** Delete four, default destructor
- **Common mistake: Forgetting destructor**
  ```cpp
  class Logger {
  public:
      ~Logger() { /* cleanup */ }  // Public destructor OK for Singleton

      // Copy/move deleted
  };

  // This is fine - getInstance() returns reference, not object
  // Destructor runs during static destruction
  ```
- **Edge case: Return by value**
  ```cpp
  Logger getLogger() {
      return Logger::getInstance();  // Copy! But deleted → compile error
  }

  // Should return reference:
  Logger& getLogger() {
      return Logger::getInstance();
  }
  ```
- **Key Concept:** Deleting copy/move prevents duplication from existing instance; private constructor prevents direct instantiation; both required for complete Singleton enforcement

---
