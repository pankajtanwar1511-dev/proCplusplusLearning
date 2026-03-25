## TOPIC: Thread-Safe Singleton Pattern

### THEORY_SECTION: Core Concepts and Design Principles

#### 1. Singleton Pattern Overview

**Definition:** Creational design pattern ensuring exactly one instance of a class with global access point.

**Core Guarantee:**

| Requirement | Implementation | Purpose |
|-------------|----------------|---------|
| **Single instance** | Private constructor | Prevent external instantiation |
| **Global access** | Static getInstance() | Provide controlled access point |
| **Lazy initialization** | Create on first use | Defer resource allocation |
| **Thread safety** | C++11 static guards or mutex | Prevent race conditions |

**When to Use Singleton:**

**Common Use Cases:**
```cpp
class ConfigManager {           // ✅ One configuration per application
class DatabasePool {             // ✅ Single connection pool
class Logger {                   // ✅ Centralized logging
class HardwareInterface {        // ✅ One driver per physical device
class ServiceRegistry {          // ✅ Global service locator
```

**Inappropriate Uses:**
```cpp
class User {                     // ❌ Multiple users exist
class Transaction {              // ❌ Many transactions concurrently
class Sensor {                   // ❌ May need multiple sensors
```

#### 2. C++ Singleton Implementation Evolution

**Historical Progression:**

| Era | Approach | Thread Safety | Issue |
|-----|----------|---------------|-------|
| **Pre-C++11** | Static member + manual init | ❌ Racy | Requires double-checked locking (broken) |
| **Pre-C++11** | Meyers Singleton | ❌ Not guaranteed | Compiler-dependent behavior |
| **C++11+** | Meyers Singleton | ✅ Guaranteed | Static local thread-safe (§6.7/4) |
| **C++11+** | std::call_once | ✅ Guaranteed | Explicit one-time initialization |

**Modern Best Practice (Meyers Singleton):**

```cpp
class Singleton {
private:
    Singleton() = default;                          // Private constructor
    Singleton(const Singleton&) = delete;           // Delete copy
    Singleton& operator=(const Singleton&) = delete; // Delete assign

public:
    static Singleton& getInstance() {
        static Singleton instance;  // ✅ Thread-safe in C++11+
        return instance;            // ✅ Lazy initialization
    }                               // ✅ Auto cleanup at exit
};
```

**Why This Works (C++11 Guarantee):**

C++ Standard §6.7/4: "If control enters the declaration concurrently while the variable is being initialized, the concurrent execution shall wait for completion of the initialization."

**Compiler Implementation (conceptual):**
```cpp
// What the compiler generates internally:
static bool initialized = false;
static mutex init_mutex;
static aligned_storage<Singleton> storage;

if (!initialized) {
    lock_guard<mutex> lock(init_mutex);
    if (!initialized) {
        new (&storage) Singleton();  // Construct in-place
        initialized = true;
    }
}
return reinterpret_cast<Singleton&>(storage);
```

#### 3. Thread Safety Challenges

**Three Critical Concerns:**

**A. Initialization Race:**

| Problem | Solution | C++ Version |
|---------|----------|-------------|
| Multiple threads create multiple instances | Meyers Singleton (static local) | C++11+ |
| | std::call_once | C++11+ |
| | Mutex-protected check | All versions |

**B. Static Initialization Order Fiasco:**

```cpp
// File1.cpp
Logger logger;  // Global static - when initialized?

// File2.cpp
Config config;  // Constructor uses logger - UNDEFINED ORDER!

// ✅ SOLUTION: Use Meyers Singleton
Logger& getLogger() {
    static Logger instance;  // Initialized on first use
    return instance;
}
```

**C. Destruction Order Problem:**

```cpp
// Service destroyed AFTER Logger?
~Service() {
    Logger::getInstance().log("Destroying");  // ❌ Use-after-destruction!
}

// ✅ SOLUTION 1: Phoenix Singleton (never destroy)
Logger& getInstance() {
    static Logger* instance = new Logger();  // Intentional leak
    return *instance;
}

// ✅ SOLUTION 2: Explicit shutdown phase
class App {
    void shutdown() {
        service.reset();   // Destroy in controlled order
        logger.reset();
    }
};
```

#### 4. Implementation Patterns Comparison

| Pattern | Code Skeleton | Pros | Cons |
|---------|--------------|------|------|
| **Meyers** | `static T instance;` | Simple, fast, thread-safe (C++11) | Hard to test, destruction order issues |
| **std::call_once** | `call_once(flag, init)` | Explicit control, exception-safe | More verbose, slight overhead |
| **Mutex + heap** | `lock + unique_ptr` | Testable (can reset), flexible | Lock on every access, slower |
| **Atomic CAS** | `atomic<T*> + compare_exchange` | Lock-free after init | Complex, error-prone, rarely needed |
| **Phoenix** | `static T* = new T()` | Safe during destruction | Memory leak (intentional) |

#### 5. Autonomous Vehicle Example

**Real-World Singleton Use Cases:**

```cpp
// ✅ Sensor Manager - One instance manages all sensors
class SensorManager {
    std::vector<Sensor*> sensors;
    mutable std::mutex mtx;

    SensorManager() { /* Initialize CAN bus */ }

public:
    static SensorManager& getInstance() {
        static SensorManager instance;
        return instance;
    }

    void registerSensor(Sensor* s) {
        std::lock_guard lock(mtx);
        sensors.push_back(s);
    }
};

// ✅ CAN Bus Driver - Single physical interface
class CANBusDriver {
    int bus_fd;  // File descriptor to /dev/can0

    CANBusDriver() {
        bus_fd = open("/dev/can0", O_RDWR);
        if (bus_fd < 0) throw std::runtime_error("CAN init failed");
    }

public:
    static CANBusDriver& getInstance() {
        static CANBusDriver instance;  // ✅ Retries if throws
        return instance;
    }

    void sendFrame(const CANFrame& frame) {
        write(bus_fd, &frame, sizeof(frame));
    }
};
```

#### 6. Why Singleton Matters

**Critical Concepts Demonstrated:**

| Concept | How Singleton Tests It | Interview Relevance |
|---------|----------------------|---------------------|
| **Static initialization** | C++11 §6.7/4 guarantees | Understanding language spec |
| **Thread safety** | Race conditions, memory barriers | Concurrency fundamentals |
| **Memory management** | Heap vs stack, RAII, leaks | Resource ownership |
| **Destruction order** | Static lifetime, fiasco patterns | Undefined behavior awareness |
| **Design tradeoffs** | Testability vs simplicity | Software engineering judgment |

**Common Interview Questions:**
- "Is double-checked locking safe in C++11?" (No, use Meyers)
- "How do you test Singletons?" (Dependency injection, reset hooks)
- "What's the static initialization order fiasco?" (Undefined order across TUs)
- "Can Singleton be thread-safe without mutexes?" (Yes, Meyers in C++11)

---

### EDGE_CASES: Tricky Scenarios and Implementation Pitfalls

#### Edge Case 1: Double-Checked Locking Anti-Pattern (Pre-C++11)

```cpp
// ❌ BROKEN: Classic double-checked locking (pre-C++11)
class Singleton {
    static Singleton* instance;
    static std::mutex mtx;

    Singleton() {}

public:
    static Singleton* getInstance() {
        if (!instance) {  // First check (unprotected)
            std::lock_guard<std::mutex> lock(mtx);
            if (!instance) {  // Second check (protected)
                instance = new Singleton();  // ❌ Not atomic!
            }
        }
        return instance;
    }
};
```

This pattern is broken because the compiler can reorder instructions, potentially returning a partially constructed object. The assignment `instance = new Singleton()` involves three steps: allocate memory, construct object, assign pointer. Without memory barriers, another thread might see a non-null pointer to an unconstructed object.

#### Edge Case 2: Static Initialization Order Fiasco

```cpp
// ❌ DANGEROUS: Static member initialization
class Logger {
    static Logger instance;  // When is this initialized?
    Logger() { /* ... */ }
};

class Config {
    Config() {
        Logger::instance.log("Config created");  // ❌ Undefined behavior if Logger not initialized yet
    }
};

Logger Logger::instance;  // Order relative to Config construction is undefined
```

Static members across translation units have undefined initialization order, leading to use-before-construction bugs that are nearly impossible to debug.

#### Edge Case 3: Meyer's Singleton and Function-Static Destruction

```cpp
// ✅ Thread-safe but watch destruction order
class DatabaseConnection {
public:
    static DatabaseConnection& getInstance() {
        static DatabaseConnection instance;  // ✅ C++11 guarantees thread-safe initialization
        return instance;
    }

    ~DatabaseConnection() {
        // ❌ DANGER: What if another static destructor calls getInstance()?
        cleanup();
    }
};
```

While initialization is thread-safe, destruction happens in reverse order of construction. If a destructor of another static object tries to access this Singleton after it's destroyed, you get undefined behavior.

#### Edge Case 4: Singleton with Lazy Initialization and shared_ptr

```cpp
// ✅ Thread-safe with std::call_once
class ResourceManager {
    static std::shared_ptr<ResourceManager> instance;
    static std::once_flag initFlag;

    ResourceManager() = default;

public:
    static std::shared_ptr<ResourceManager> getInstance() {
        std::call_once(initFlag, []() {
            instance = std::shared_ptr<ResourceManager>(new ResourceManager());
        });
        return instance;
    }
};

std::shared_ptr<ResourceManager> ResourceManager::instance = nullptr;
std::once_flag ResourceManager::initFlag;
```

Using `shared_ptr` allows controlled lifetime but adds atomic reference counting overhead. The `std::call_once` ensures thread-safe initialization without double-checked locking pitfalls.

#### Edge Case 5: Singleton Reset/Mock for Testing

```cpp
// Testing challenge: How to reset Singleton between tests?
class ServiceLocator {
    static std::unique_ptr<ServiceLocator> instance;

public:
    static ServiceLocator& getInstance() {
        if (!instance) instance = std::make_unique<ServiceLocator>();
        return *instance;
    }

    // ⚠️ For testing only - not thread-safe
    static void reset() {
        instance.reset();
    }
};
```

Testing Singletons is notoriously difficult. Adding reset functionality breaks the Singleton guarantee and isn't thread-safe. Better approaches use dependency injection or test-specific factory methods.

---

### CODE_EXAMPLES: Progressive Implementation from Easy to Advanced

#### Example 1: Easy - Classic Non-Thread-Safe Singleton

```cpp
#include <iostream>

class ConfigManager {
private:
    int configValue;

    ConfigManager() : configValue(42) {  // Private constructor
        std::cout << "ConfigManager created\n";
    }

    // ❌ Delete copy constructor and assignment
    ConfigManager(const ConfigManager&) = delete;
    ConfigManager& operator=(const ConfigManager&) = delete;

public:
    static ConfigManager& getInstance() {
        static ConfigManager instance;  // ✅ Created on first call
        return instance;
    }

    int getValue() const { return configValue; }
    void setValue(int val) { configValue = val; }
};

int main() {
    ConfigManager& cfg1 = ConfigManager::getInstance();
    ConfigManager& cfg2 = ConfigManager::getInstance();

    std::cout << "Same instance? " << (&cfg1 == &cfg2) << "\n";  // Prints: 1

    cfg1.setValue(100);
    std::cout << "cfg2 value: " << cfg2.getValue() << "\n";  // Prints: 100
}
```

This Meyers Singleton is thread-safe in C++11+ due to guaranteed thread-safe static local initialization. The function-local static is created on first call and destroyed at program exit.

#### Example 2: Mid - Thread-Safe Singleton with Mutex Protection

```cpp
#include <iostream>
#include <mutex>
#include <memory>

class Logger {
private:
    static std::unique_ptr<Logger> instance;
    static std::mutex mtx;
    int logCount;

    Logger() : logCount(0) {
        std::cout << "Logger initialized\n";
    }

public:
    Logger(const Logger&) = delete;
    Logger& operator=(const Logger&) = delete;

    static Logger& getInstance() {
        std::lock_guard<std::mutex> lock(mtx);  // ✅ Fully protected
        if (!instance) {
            instance.reset(new Logger());
        }
        return *instance;
    }

    void log(const std::string& msg) {
        std::lock_guard<std::mutex> lock(mtx);
        std::cout << "[Log " << ++logCount << "] " << msg << "\n";
    }
};

std::unique_ptr<Logger> Logger::instance = nullptr;
std::mutex Logger::mtx;

int main() {
    Logger& log1 = Logger::getInstance();
    Logger& log2 = Logger::getInstance();

    log1.log("System started");
    log2.log("Configuration loaded");  // Same instance
}
```

This version uses heap allocation with `unique_ptr` and protects both getInstance() and log() with mutex. More flexible than Meyers Singleton but adds locking overhead.

#### Example 3: Mid - std::call_once Initialization

```cpp
#include <iostream>
#include <mutex>
#include <memory>

class DatabaseConnection {
private:
    static std::unique_ptr<DatabaseConnection> instance;
    static std::once_flag initFlag;

    std::string connectionString;

    DatabaseConnection(const std::string& connStr) : connectionString(connStr) {
        std::cout << "DB connected: " << connStr << "\n";
    }

public:
    DatabaseConnection(const DatabaseConnection&) = delete;
    DatabaseConnection& operator=(const DatabaseConnection&) = delete;

    static DatabaseConnection& getInstance() {
        std::call_once(initFlag, []() {
            // ✅ Guaranteed to run exactly once, thread-safe
            instance.reset(new DatabaseConnection("localhost:5432"));
        });
        return *instance;
    }

    void query(const std::string& sql) {
        std::cout << "Executing: " << sql << "\n";
    }
};

std::unique_ptr<DatabaseConnection> DatabaseConnection::instance = nullptr;
std::once_flag DatabaseConnection::initFlag;

int main() {
    auto& db = DatabaseConnection::getInstance();
    db.query("SELECT * FROM users");
}
```

`std::call_once` provides clean, exception-safe initialization without manual mutex management. The lambda runs exactly once even if multiple threads call getInstance() simultaneously.

#### Example 4: Advanced - Lazy Initialization with std::shared_ptr

```cpp
#include <iostream>
#include <memory>
#include <mutex>
#include <atomic>

class CacheManager {
private:
    static std::shared_ptr<CacheManager> instance;
    static std::mutex mtx;
    std::atomic<int> hits{0};
    std::atomic<int> misses{0};

    CacheManager() {
        std::cout << "CacheManager initialized\n";
    }

public:
    CacheManager(const CacheManager&) = delete;
    CacheManager& operator=(const CacheManager&) = delete;

    static std::shared_ptr<CacheManager> getInstance() {
        // ✅ Double-checked locking CORRECT way with shared_ptr
        if (!instance) {
            std::lock_guard<std::mutex> lock(mtx);
            if (!instance) {
                instance = std::shared_ptr<CacheManager>(new CacheManager());
            }
        }
        return instance;
    }

    void recordHit() { ++hits; }
    void recordMiss() { ++misses; }

    void printStats() const {
        std::cout << "Hits: " << hits << ", Misses: " << misses << "\n";
    }
};

std::shared_ptr<CacheManager> CacheManager::instance = nullptr;
std::mutex CacheManager::mtx;

int main() {
    auto cache1 = CacheManager::getInstance();
    auto cache2 = CacheManager::getInstance();

    cache1->recordHit();
    cache2->recordMiss();

    cache1->printStats();  // Prints: Hits: 1, Misses: 1
}
```

Using `shared_ptr` allows multiple references and controlled destruction. The atomic counters avoid mutex overhead for statistics tracking. Double-checked locking works correctly with `shared_ptr` due to its atomic operations.

#### Example 5: Advanced - Meyer's Singleton with CRTP for Multiple Singletons

```cpp
#include <iostream>
#include <string>

template <typename T>
class Singleton {
protected:
    Singleton() = default;

public:
    Singleton(const Singleton&) = delete;
    Singleton& operator=(const Singleton&) = delete;

    static T& getInstance() {
        static T instance;  // ✅ Thread-safe in C++11+
        return instance;
    }
};

class AudioManager : public Singleton<AudioManager> {
    friend class Singleton<AudioManager>;  // Allow base to construct

private:
    int volume = 50;
    AudioManager() { std::cout << "AudioManager created\n"; }

public:
    void setVolume(int vol) { volume = vol; }
    int getVolume() const { return volume; }
};

class NetworkManager : public Singleton<NetworkManager> {
    friend class Singleton<NetworkManager>;

private:
    std::string ipAddress = "127.0.0.1";
    NetworkManager() { std::cout << "NetworkManager created\n"; }

public:
    void setIP(const std::string& ip) { ipAddress = ip; }
    std::string getIP() const { return ipAddress; }
};

int main() {
    auto& audio = AudioManager::getInstance();
    audio.setVolume(75);

    auto& network = NetworkManager::getInstance();
    network.setIP("192.168.1.100");

    std::cout << "Audio volume: " << AudioManager::getInstance().getVolume() << "\n";
    std::cout << "Network IP: " << NetworkManager::getInstance().getIP() << "\n";
}
```

CRTP (Curiously Recurring Template Pattern) creates a reusable Singleton base class. Each derived class gets its own thread-safe static instance without code duplication.

#### Example 6: Advanced - Singleton with Dependency Injection for Testing

```cpp
#include <iostream>
#include <memory>

class ILogger {
public:
    virtual ~ILogger() = default;
    virtual void log(const std::string& msg) = 0;
};

class ProductionLogger : public ILogger {
public:
    void log(const std::string& msg) override {
        std::cout << "[PROD] " << msg << "\n";
    }
};

class TestLogger : public ILogger {
public:
    void log(const std::string& msg) override {
        std::cout << "[TEST] " << msg << "\n";
    }
};

class LoggerFactory {
private:
    static std::unique_ptr<ILogger> instance;

public:
    static ILogger& getInstance() {
        if (!instance) {
            instance = std::make_unique<ProductionLogger>();
        }
        return *instance;
    }

    // ✅ For testing: inject mock implementation
    static void setInstance(std::unique_ptr<ILogger> logger) {
        instance = std::move(logger);
    }

    static void reset() {
        instance.reset();
    }
};

std::unique_ptr<ILogger> LoggerFactory::instance = nullptr;

int main() {
    // Production usage
    LoggerFactory::getInstance().log("Application started");

    // Test usage
    LoggerFactory::setInstance(std::make_unique<TestLogger>());
    LoggerFactory::getInstance().log("Running unit test");

    LoggerFactory::reset();
}
```

This design maintains Singleton benefits while enabling testability through dependency injection. The abstract interface allows mock implementations during testing.

#### Example 7: Real-World - Autonomous Vehicle Sensor Manager

```cpp
#include <iostream>
#include <string>
#include <mutex>
#include <vector>
#include <memory>

struct SensorData {
    std::string sensorName;
    double value;
    long timestamp;
};

class SensorManager {
private:
    static std::unique_ptr<SensorManager> instance;
    static std::once_flag initFlag;

    std::vector<SensorData> recentData;
    mutable std::mutex dataMutex;

    SensorManager() {
        std::cout << "SensorManager initialized\n";
        recentData.reserve(1000);
    }

public:
    SensorManager(const SensorManager&) = delete;
    SensorManager& operator=(const SensorManager&) = delete;

    static SensorManager& getInstance() {
        std::call_once(initFlag, []() {
            instance.reset(new SensorManager());
        });
        return *instance;
    }

    void recordData(const std::string& sensor, double value, long ts) {
        std::lock_guard<std::mutex> lock(dataMutex);
        recentData.push_back({sensor, value, ts});
        if (recentData.size() > 1000) {
            recentData.erase(recentData.begin());  // Keep last 1000
        }
    }

    std::vector<SensorData> getRecentData() const {
        std::lock_guard<std::mutex> lock(dataMutex);
        return recentData;  // Return copy
    }

    size_t getDataCount() const {
        std::lock_guard<std::mutex> lock(dataMutex);
        return recentData.size();
    }
};

std::unique_ptr<SensorManager> SensorManager::instance = nullptr;
std::once_flag SensorManager::initFlag;

int main() {
    auto& mgr = SensorManager::getInstance();

    mgr.recordData("LIDAR_FRONT", 15.7, 1000001);
    mgr.recordData("RADAR_LEFT", 8.3, 1000002);
    mgr.recordData("CAMERA_360", 120.5, 1000003);

    std::cout << "Total sensor readings: " << mgr.getDataCount() << "\n";
}
```

This real-world example shows a thread-safe sensor data manager for autonomous vehicles, using `std::call_once` for initialization and mutex protection for data access.

#### Example 8: Performance - Meyer's Singleton Benchmark

```cpp
#include <iostream>
#include <chrono>
#include <thread>
#include <vector>

class FastSingleton {
public:
    static FastSingleton& getInstance() {
        static FastSingleton instance;  // ✅ Initialized once, no locking after first call
        return instance;
    }

    void doWork() { /* fast operation */ }

private:
    FastSingleton() = default;
};

void workerThread(int iterations) {
    for (int i = 0; i < iterations; ++i) {
        FastSingleton::getInstance().doWork();
    }
}

int main() {
    const int iterations = 1000000;
    const int numThreads = 4;

    auto start = std::chrono::high_resolution_clock::now();

    std::vector<std::thread> threads;
    for (int i = 0; i < numThreads; ++i) {
        threads.emplace_back(workerThread, iterations);
    }

    for (auto& t : threads) {
        t.join();
    }

    auto end = std::chrono::high_resolution_clock::now();
    auto duration = std::chrono::duration_cast<std::chrono::milliseconds>(end - start);

    std::cout << "Completed " << (iterations * numThreads) << " calls in "
              << duration.count() << "ms\n";
}
```

Meyers Singleton has minimal performance overhead after first initialization. The static local variable is initialized with thread-safe guards, but subsequent accesses are lock-free.

---

### INTERVIEW_QA: Comprehensive Questions with Detailed Answers

#### Q1: What is the Singleton pattern and why is it used?
**Difficulty:** #beginner
**Category:** #design_pattern
**Concepts:** #singleton #creational_pattern #global_access

**Answer:**
The Singleton pattern ensures a class has exactly one instance and provides a global point of access to it.

**Code example:**
```cpp
class Config {
    static Config& getInstance() {
        static Config instance;
        return instance;
    }
private:
    Config() = default;
};
```

**Explanation:**
Singleton is useful when exactly one object is needed to coordinate actions across the system, such as logging, configuration management, or resource pools. It prevents multiple instantiations which could lead to resource conflicts or inconsistent state. In C++, the Meyers Singleton (function-local static) is thread-safe since C++11 due to guaranteed static initialization guards.

**Key takeaway:** Use Singleton for global resources that must have exactly one instance, but prefer dependency injection for better testability.

---

#### Q2: Why is double-checked locking broken in pre-C++11?
**Difficulty:** #advanced
**Category:** #concurrency #memory_model
**Concepts:** #memory_ordering #race_condition #instruction_reordering

**Answer:**
Pre-C++11 double-checked locking fails because compilers and CPUs can reorder instructions, allowing threads to see a non-null pointer to a partially constructed object.

**Code example:**
```cpp
// ❌ BROKEN pre-C++11
if (!instance) {
    lock();
    if (!instance) {
        instance = new T();  // 3 steps: allocate, construct, assign
    }
    unlock();
}
```

**Explanation:**
The `new T()` operation involves three steps: allocate memory, construct object, assign pointer. Without memory barriers, the compiler might reorder these, causing `instance` to become non-null before construction completes. Another thread seeing the non-null `instance` would skip the lock and access an unconstructed object. C++11 fixed this with memory ordering guarantees and thread-safe static local initialization.

**Key takeaway:** Never use double-checked locking in C++; use Meyers Singleton or std::call_once instead.

---

#### Q3: How does C++11 guarantee thread-safe static local variable initialization?
**Difficulty:** #intermediate
**Category:** #language_features #concurrency
**Concepts:** #static_initialization #thread_safety #initialization_guards

**Answer:**
C++11 guarantees that static local variables are initialized exactly once in a thread-safe manner using compiler-generated guards (like pthread_once or equivalent).

**Code example:**
```cpp
T& getInstance() {
    static T instance;  // ✅ Thread-safe initialization
    return instance;
}
```

**Explanation:**
The C++11 standard (§6.7/4) requires that if control enters the declaration concurrently, one thread completes initialization while others wait. The compiler generates hidden initialization guard variables and synchronization code. This makes Meyers Singleton the safest and simplest Singleton implementation in modern C++, with no need for explicit mutexes or std::call_once.

**Key takeaway:** Meyers Singleton is the preferred idiom in C++11+ for its simplicity and guaranteed thread safety.

---

#### Q4: What is the static initialization order fiasco and how does Singleton address it?
**Difficulty:** #intermediate
**Category:** #initialization #undefined_behavior
**Concepts:** #static_initialization #initialization_order #singleton

**Answer:**
Static initialization order fiasco occurs when static objects in different translation units depend on each other, but initialization order is undefined.

**Code example:**
```cpp
// File1.cpp
Logger logger;  // When is this initialized?

// File2.cpp
Config config;  // Uses logger in constructor - undefined order!
```

**Explanation:**
Static objects across translation units are initialized in an undefined order, potentially causing use-before-initialization bugs. Singleton solves this by using lazy initialization - the instance is created on first use (when getInstance() is called), not at static initialization time. This ensures dependencies are available when needed, avoiding the fiasco entirely.

**Key takeaway:** Use function-local statics (Meyers Singleton) to avoid static initialization order problems.

---

#### Q5: When should you NOT use a Singleton?
**Difficulty:** #intermediate
**Category:** #design_principles #best_practices
**Concepts:** #dependency_injection #testability #coupling

**Answer:**
Avoid Singleton when testability matters, when you need multiple instances in tests, or when it creates hidden dependencies and tight coupling.

**Explanation:**
Singletons introduce global state that makes unit testing difficult - you cannot easily mock or reset them between tests. They create hidden dependencies (any code can call getInstance()), making code harder to understand and maintain. They violate the Single Responsibility Principle by managing both instantiation and business logic. Better alternatives include dependency injection, where objects receive dependencies through constructors, allowing easy testing with mocks and better separation of concerns.

**Key takeaway:** Prefer dependency injection over Singleton for better testability and loose coupling; use Singleton only for truly global, single-instance resources.

---

#### Q6: How does std::call_once work and when should you use it?
**Difficulty:** #intermediate
**Category:** #concurrency #standard_library
**Concepts:** #call_once #once_flag #lazy_initialization

**Answer:**
`std::call_once` executes a callable exactly once using a `std::once_flag`, providing thread-safe lazy initialization without manual mutex management.

**Code example:**
```cpp
std::once_flag flag;
std::shared_ptr<T> instance;

T& getInstance() {
    std::call_once(flag, []() {
        instance = std::make_shared<T>();
    });
    return *instance;
}
```

**Explanation:**
`std::call_once` uses an internal state machine (the `once_flag`) to ensure the callable runs exactly once even if called from multiple threads simultaneously. It's exception-safe - if the callable throws, the flag remains unset and another thread can retry. Use it when you need lazy initialization with heap-allocated objects or when initialization requires parameters that aren't available at static initialization time.

**Key takeaway:** Use std::call_once for complex initialization that requires heap allocation or runtime parameters.

---

#### Q7: What are the tradeoffs between Meyer's Singleton and heap-allocated Singleton with std::unique_ptr?
**Difficulty:** #intermediate
**Category:** #design_tradeoffs #memory_management
**Concepts:** #stack_allocation #heap_allocation #smart_pointers

**Answer:**
Meyers Singleton (static local) is simpler and faster but has fixed lifetime; heap-allocated offers more control over construction/destruction and enables reset for testing.

**Code example:**
```cpp
// Meyers: Simple, fast, fixed lifetime
T& getInstance() { static T instance; return instance; }

// Heap: More control, resettable
static unique_ptr<T> instance;
T& getInstance() { if (!instance) instance = make_unique<T>(); return *instance; }
```

**Explanation:**
Meyers Singleton stores the object in static memory with automatic storage duration, making access very fast after initialization. However, destruction order is fixed (reverse of first-use order) and you cannot reset it. Heap-allocated Singleton using `unique_ptr` adds indirection overhead but allows manual reset (useful for testing), explicit destruction control, and potentially smaller static memory footprint. Heap allocation also enables polymorphism through abstract interfaces.

**Key takeaway:** Use Meyers for simplicity; use heap allocation when you need reset capability or polymorphic behavior.

---

#### Q8: How do you handle Singleton destruction order issues?
**Difficulty:** #advanced
**Category:** #resource_management #undefined_behavior
**Concepts:** #destruction_order #static_lifetime #dangling_references

**Answer:**
Destruction order issues arise when one Singleton's destructor accesses another Singleton that may already be destroyed; solutions include dependency ordering, weak references, or avoiding cleanup in destructors.

**Code example:**
```cpp
// ❌ DANGEROUS
~Logger() {
    Config::getInstance().save();  // Config might be destroyed!
}

// ✅ SAFER: Use phoenix singleton
Logger& getInstance() {
    static Logger* instance = nullptr;
    if (!instance) instance = new Logger();
    return *instance;  // Never destroyed, but leaks
}
```

**Explanation:**
Static destruction order is reverse of initialization order, but across Singletons used in each other's destructors, this creates undefined behavior. Solutions include: (1) Phoenix Singleton - never destroy (accept leak), (2) explicit shutdown phase where all Singletons are destroyed in controlled order, (3) reference counting to track dependencies, (4) avoid doing work in destructors. In practice, most applications exit before destruction order matters.

**Key takeaway:** Avoid inter-Singleton dependencies in destructors; if necessary, implement explicit shutdown sequence or accept memory leaks.

---

#### Q9: Can you implement a thread-safe Singleton without mutexes in C++?
**Difficulty:** #advanced
**Category:** #concurrency #lock_free
**Concepts:** #atomics #memory_ordering #lock_free

**Answer:**
Yes, using C++11 static locals (compiler-generated guards) or atomic operations with acquire-release semantics for lock-free initialization.

**Code example:**
```cpp
// ✅ Option 1: Meyers (compiler handles synchronization)
T& getInstance() { static T instance; return instance; }

// ✅ Option 2: Atomic with double-checked locking
static atomic<T*> instance{nullptr};
T& getInstance() {
    T* tmp = instance.load(memory_order_acquire);
    if (!tmp) {
        tmp = new T();
        T* expected = nullptr;
        if (!instance.compare_exchange_strong(expected, tmp, memory_order_release)) {
            delete tmp;
            tmp = expected;
        }
    }
    return *tmp;
}
```

**Explanation:**
Meyers Singleton relies on compiler-generated synchronization (typically using atomic operations internally). For explicit lock-free implementation, use atomic pointers with compare-exchange. The acquire-release memory ordering ensures proper visibility: store-release makes the constructed object visible, and load-acquire ensures you see the complete object. This is complex and error-prone - prefer Meyers or std::call_once unless you need very specific performance characteristics.

**Key takeaway:** Meyers Singleton is already lock-free after first initialization; explicit atomic-based Singleton is rarely necessary.

---

#### Q10: How would you test code that uses Singletons?
**Difficulty:** #intermediate
**Category:** #testing #design_patterns
**Concepts:** #testability #dependency_injection #mocking

**Answer:**
Testing Singletons is difficult; strategies include providing reset() methods, using dependency injection, or wrapping Singleton in a testable interface.

**Code example:**
```cpp
// Strategy 1: Reset method (dangerous in production)
class Service {
    static unique_ptr<Service> instance;
public:
    static Service& get() { /*...*/ }
    static void reset() { instance.reset(); }  // For tests only
};

// Strategy 2: Dependency injection
class Client {
    Service& service;  // Injected, not Singleton
public:
    Client(Service& svc) : service(svc) {}
};
```

**Explanation:**
Pure Singletons are hard to test because they introduce global state. Adding a reset() method helps but isn't thread-safe and breaks Singleton guarantees. Better approaches: (1) use dependency injection where classes receive dependencies rather than accessing Singletons, (2) create interfaces that Singleton implements, allowing mock implementations in tests, (3) use test-specific factory functions. The best solution is often to avoid Singletons entirely in favor of dependency injection patterns.

**Key takeaway:** Design for dependency injection rather than Singleton for better testability; if Singleton is necessary, provide test hooks via interfaces.

---

#### Q11: What is a Monostate pattern and how does it differ from Singleton?
**Difficulty:** #advanced
**Category:** #design_patterns #alternatives
**Concepts:** #monostate #static_members #singleton_alternatives

**Answer:**
Monostate allows multiple instances but shares state through static members; unlike Singleton which restricts instantiation to one object.

**Code example:**
```cpp
class Monostate {
    static int sharedState;  // ✅ All instances share this
public:
    void setState(int val) { sharedState = val; }
    int getState() const { return sharedState; }
};

// Multiple instances, shared state
Monostate m1, m2;
m1.setState(42);
cout << m2.getState();  // Prints 42
```

**Explanation:**
Monostate maintains singleton behavior (single shared state) without restricting instantiation. All instances share static member variables, creating the illusion of a single object while allowing normal construction. Advantages: works with existing code expecting multiple instances, no need for getInstance(). Disadvantages: all instances consume memory, initialization is less controlled, and the shared state is less obvious. Rarely used in practice compared to true Singleton.

**Key takeaway:** Monostate provides shared state with normal instantiation but is less explicit and rarely preferred over Singleton or dependency injection.

---

#### Q12: How does the Singleton pattern relate to the Single Responsibility Principle?
**Difficulty:** #intermediate
**Category:** #design_principles #solid
**Concepts:** #srp #separation_of_concerns #responsibility

**Answer:**
Singleton often violates SRP by mixing instance management with business logic; better designs separate these concerns.

**Explanation:**
The Single Responsibility Principle states a class should have one reason to change. Singleton classes typically have two responsibilities: (1) managing their own instantiation and lifecycle, and (2) performing their actual business logic. This coupling makes the class harder to test, maintain, and reason about. Better designs use a factory or service locator to handle instantiation while keeping business logic in separate classes. This separation allows easier testing (you can inject mocks) and better modularity.

**Key takeaway:** Consider separating instance management from business logic to maintain SRP; use factories or dependency injection frameworks.

---

#### Q13: Can Singleton work with inheritance and virtual functions?
**Difficulty:** #advanced
**Category:** #polymorphism #inheritance
**Concepts:** #virtual_functions #factory_pattern #polymorphic_singleton

**Answer:**
Yes, but requires careful design using abstract interfaces and factory methods to select concrete implementations while maintaining single instance guarantee.

**Code example:**
```cpp
class IService {
public:
    virtual ~IService() = default;
    virtual void execute() = 0;
    static IService& getInstance();
};

class ServiceImpl : public IService {
    friend class IService;
    ServiceImpl() = default;
public:
    void execute() override { /* implementation */ }
};

IService& IService::getInstance() {
    static ServiceImpl instance;
    return instance;
}
```

**Explanation:**
Polymorphic Singleton uses an abstract base class with virtual functions while the getInstance() method returns a reference to a single concrete implementation. This combines interface-based design with Singleton benefits. The factory method can select which implementation to instantiate based on configuration, but once created, only one instance exists. This enables testability through interface mocking while maintaining singleton semantics for the actual runtime object.

**Key takeaway:** Combine interface abstraction with Singleton for testability; the interface is the public API while concrete implementation remains singleton.

---

#### Q14: What are the performance implications of different Singleton implementations?
**Difficulty:** #advanced
**Category:** #performance #optimization
**Concepts:** #memory_access #cache_performance #synchronization_overhead

**Answer:**
Meyers Singleton has minimal overhead after initialization (direct static access); mutex-based and std::call_once add synchronization cost on every access; atomic operations can avoid locks but add memory barriers.

**Code example:**
```cpp
// Fastest after init: Direct static access
T& getInstance() { static T instance; return instance; }  // ~1ns after init

// Moderate overhead: Mutex check every access
T& getInstance() {
    lock_guard<mutex> lock(mtx);  // ~20-50ns per access
    if (!instance) instance = make_unique<T>();
    return *instance;
}
```

**Explanation:**
Meyers Singleton generates initialization guards that only check on first access, subsequent accesses are essentially free (just a memory reference). Mutex-based approaches pay locking cost on every access, ~20-50ns overhead. std::call_once amortizes well but still checks an atomic flag. For high-performance code (e.g., sensor processing at 10kHz), this matters. Consider caching the reference locally: `auto& instance = getInstance();` to avoid repeated access overhead.

**Key takeaway:** Meyers Singleton has best runtime performance; cache getInstance() reference in hot paths to eliminate repeated access overhead.

---

#### Q15: How do Singletons behave across DLL boundaries?
**Difficulty:** #advanced
**Category:** #linking #dlls
**Concepts:** #shared_libraries #symbol_visibility #dll_boundaries

**Answer:**
Each DLL/SO gets its own copy of static variables unless explicitly exported, potentially creating multiple "singleton" instances.

**Explanation:**
In Windows DLLs or Unix shared objects, static variables have internal linkage by default. If both the main executable and a DLL use a Singleton, they each get separate instances. Solutions: (1) export the singleton symbol with __declspec(dllexport)/__attribute__((visibility("default"))), (2) provide getInstance() in a single DLL and have others link to it, (3) use a registry pattern where first DLL to load registers the instance. This is particularly problematic with plugins or dynamically loaded modules. Modern C++ modules (C++20) help but aren't yet widely adopted.

**Key takeaway:** Be aware that static variables don't cross DLL boundaries by default; explicitly export Singleton symbols or use a centralized registry.

---

#### Q16: What is the difference between Singleton and a global variable?
**Difficulty:** #beginner
**Category:** #design_patterns #comparison
**Concepts:** #global_state #encapsulation #lazy_initialization

**Answer:**
Global variables are initialized at program start and lack encapsulation; Singletons offer lazy initialization, controlled access through methods, and can enforce invariants.

**Code example:**
```cpp
// Global variable: immediate initialization, no encapsulation
Config globalConfig;  // ❌ Initialized even if never used

// Singleton: lazy init, encapsulated
class Config {
public:
    static Config& getInstance() { static Config c; return c; }  // ✅ Created on first use
private:
    Config() { /* validation logic */ }
};
```

**Explanation:**
Global variables initialize at program startup (increasing startup time) whether used or not, and expose their internal state directly. Singletons delay initialization until first use (lazy), can run validation in private constructors, provide controlled access via methods, and can change implementation without affecting clients. However, both create global state which hinders testability. Prefer dependency injection when possible.

**Key takeaway:** Singleton offers lazy initialization and encapsulation over raw global variables, but both introduce global state that complicates testing.

---

#### Q17: How would you implement a Singleton for a class that allocates significant resources?
**Difficulty:** #intermediate
**Category:** #resource_management #initialization
**Concepts:** #lazy_initialization #raii #exception_safety

**Answer:**
Use lazy initialization to defer resource allocation until actually needed, with RAII to ensure proper cleanup even if initialization fails.

**Code example:**
```cpp
class HeavyResource {
    unique_ptr<LargeBuffer> buffer;

    HeavyResource() {
        cout << "Allocating 1GB buffer...\n";
        buffer = make_unique<LargeBuffer>(1024*1024*1024);
    }

public:
    static HeavyResource& getInstance() {
        static HeavyResource instance;  // ✅ Only created when first accessed
        return instance;
    }

    ~HeavyResource() { cout << "Releasing heavy resource\n"; }
};
```

**Explanation:**
Lazy initialization via Meyers Singleton ensures the resource is only allocated when first accessed, not at program startup. Use unique_ptr or other RAII types to manage resources so cleanup happens automatically. If initialization can fail, consider std::call_once with try-catch to allow retry on subsequent calls. For very large resources, consider two-phase initialization: Singleton manages the manager, which creates actual resources on demand.

**Key takeaway:** Combine lazy Singleton initialization with RAII resource management to defer allocation and ensure exception-safe cleanup.

---

#### Q18: Can you have a Singleton of a template class?
**Difficulty:** #advanced
**Category:** #templates #design_patterns
**Concepts:** #template_instantiation #static_members #crtp

**Answer:**
Yes, each template instantiation gets its own static instance; use CRTP for a reusable Singleton base class.

**Code example:**
```cpp
template<typename T>
class Singleton {
protected:
    Singleton() = default;
public:
    static T& getInstance() {
        static T instance;  // Separate instance per T
        return instance;
    }
};

class Logger : public Singleton<Logger> {
    friend class Singleton<Logger>;
    Logger() = default;
};

class Config : public Singleton<Config> {
    friend class Singleton<Config>;
    Config() = default;
};

// Usage: Logger::getInstance(), Config::getInstance()
```

**Explanation:**
Template static members are instantiated per template parameter, so `Singleton<Logger>` and `Singleton<Config>` each have their own static instance. CRTP (Curiously Recurring Template Pattern) allows derived classes to inherit Singleton behavior without code duplication. The friend declaration allows the base class to access the derived class's private constructor. This pattern is elegant but can be harder to debug due to template error messages.

**Key takeaway:** Template Singletons with CRTP provide reusable Singleton functionality; each template instantiation maintains its own single instance.

---

#### Q19: How do you handle Singleton initialization with exceptions?
**Difficulty:** #advanced
**Category:** #exception_safety #initialization
**Concepts:** #exception_handling #initialization_failure #recovery

**Answer:**
If Singleton constructor throws, C++11 guarantees the initialization will be retried on next access; use std::call_once for more control over exception recovery.

**Code example:**
```cpp
class DatabaseConnection {
    DatabaseConnection() {
        if (!connect()) throw runtime_error("Connection failed");
    }
public:
    static DatabaseConnection& getInstance() {
        static DatabaseConnection instance;  // ✅ Retries if construction throws
        return instance;
    }
};

// Alternative with std::call_once for explicit retry logic
static shared_ptr<DB> instance;
static once_flag flag;
DB& getInstance() {
    call_once(flag, []() {
        try {
            instance = make_shared<DB>();
        } catch(...) {
            flag = once_flag{};  // ❌ Can't reset! Must use different pattern
            throw;
        }
    });
    return *instance;
}
```

**Explanation:**
With Meyers Singleton, if the constructor throws, the initialization guard resets, allowing retry on next getInstance() call. This is usually desired behavior - transient failures (network timeout) can succeed on retry. However, std::once_flag cannot be reset once set, so retrying with std::call_once requires redesign. For critical resources, log initialization failures, implement exponential backoff for retries, or fail-fast if initialization cannot succeed.

**Key takeaway:** Meyers Singleton automatically retries initialization after exception; design constructors to be retry-safe or fail-fast for unrecoverable errors.

---

#### Q20: What is a "phoenix singleton" and when would you use it?
**Difficulty:** #advanced
**Category:** #advanced_patterns #lifetime_management
**Concepts:** #destruction_order #memory_leaks #static_lifetime

**Answer:**
Phoenix Singleton intentionally leaks memory by never calling destructor, avoiding destruction order problems at the cost of a memory leak.

**Code example:**
```cpp
class Logger {
public:
    static Logger& getInstance() {
        static Logger* instance = new Logger();  // ✅ Never deleted
        return *instance;
    }

    void log(const string& msg) { /* ... */ }

private:
    Logger() = default;
    ~Logger() = default;  // Never called
};
```

**Explanation:**
Phoenix Singleton solves destruction order problems by never destroying the instance. While this appears to leak memory, modern OS reclaims all process memory on exit, so the leak is benign. Use when: (1) other static objects might access the Singleton during shutdown, (2) the Singleton manages resources that don't need explicit cleanup (the OS handles it), (3) explicit destruction would be expensive during shutdown. Avoid if the destructor has important side effects like flushing logs or closing network connections.

**Key takeaway:** Phoenix Singleton trades intentional memory leak for guaranteed availability during static destruction; acceptable when destructor side effects aren't critical.

---

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

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Race condition: multiple threads may create multiple instances

**Explanation:** Without synchronization, multiple threads can pass the null check simultaneously and each create an instance

**Key Concept:** #race_condition #thread_safety

</details>

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

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Undefined behavior: accessing destroyed Singleton

**Explanation:** If Logger is destroyed first, accessing it from Service destructor causes use-after-destruction undefined behavior

**Key Concept:** #destruction_order #undefined_behavior

</details>

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

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Inefficient: mutex locked on every access

**Explanation:** While thread-safe, this locks mutex every time getInstance() is called, even after initialization. Meyers Singleton is faster.

**Key Concept:** #performance #synchronization_overhead

</details>

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

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Two instances: one for Logger, one for Config

**Explanation:** Each template instantiation Singleton\<T\> has its own static instance. Logger and Config are separate types.

**Key Concept:** #templates #static_members

</details>

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

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Copy constructor not deleted, violates Singleton

**Explanation:** Default copy constructor allows copying: `Database db2 = Database::getInstance();` creates second instance

**Key Concept:** #copy_semantics #design_flaw

</details>

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

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Not thread-safe: double-checked locking without atomics

**Explanation:** Multiple threads can see null and create multiple shared_ptr instances. Needs mutex or atomic operations.

**Key Concept:** #thread_safety #shared_ptr

</details>

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

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Potential access to destroyed memory

**Explanation:** Phoenix pattern: instance never deleted, remains accessible. Regular Meyers Singleton might be destroyed.

**Key Concept:** #static_destruction #lifetime

</details>

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

<details>
<summary><b>Show Answer</b></summary>

**Answer:** std::call_once allows complex initialization with parameters; Meyers is simpler

**Explanation:** call_once useful when initialization needs runtime parameters or complex error handling; Meyers simpler for basic cases

**Key Concept:** #initialization #call_once

</details>

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

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Exception during initialization; retried on next call

**Explanation:** C++11 guarantees if static local construction throws, initialization guard resets and retries on next access

**Key Concept:** #exception_safety #initialization

</details>

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

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Static member initialized at program start, not lazy

**Explanation:** Static member instance created during static initialization phase, whether used or not. Wastes resources if never accessed.

**Key Concept:** #static_initialization #lazy_init

</details>

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

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Not correct: potential double initialization

**Explanation:** Race condition between load and store. Multiple threads can load null, create instances, and overwrite each other. Needs compare_exchange.

**Key Concept:** #atomics #lock_free

</details>

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

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Not safe: file might be closed when another static destructor tries to log

**Explanation:** Destruction order between statics is reverse of initialization order. If other objects log during destruction, file might already be closed.

**Key Concept:** #destruction_order #raii

</details>

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

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Potentially two instances: one per DLL unless symbol exported

**Explanation:** Each DLL gets its own copy of static locals unless explicitly shared via symbol export (__declspec(dllexport))

**Key Concept:** #dll_boundaries #symbol_visibility

</details>

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

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Yes, Meyers Singleton retries on exception

**Explanation:** If constructor throws, static initialization guard resets, allowing retry on next getInstance() call

**Key Concept:** #exception_handling #retry_logic

</details>

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

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Static initialization order fiasco

**Explanation:** Order of static initialization across files undefined. If getManager() hasn't run yet, mgr references uninitialized instance.

**Key Concept:** #initialization_order #undefined_order

</details>

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

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Allows injecting mock implementations for testing

**Explanation:** setTestInstance() allows replacing real implementation with test double, enabling unit testing without Singleton coupling

**Key Concept:** #testability #dependency_injection

</details>

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

<details>
<summary><b>Show Answer</b></summary>

**Answer:** reload() needs mutex protection for internal state

**Explanation:** getInstance() returns reference to static (thread-safe), but reload() modifies member data concurrently. Needs member mutex.

**Key Concept:** #thread_safety #data_races

</details>

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

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Lazy initialization defers 100 resource allocations until first use

**Explanation:** Resources only allocated when getInstance() first called, not at program startup. Reduces startup time if rarely used.

**Key Concept:** #lazy_initialization #startup_time

</details>

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

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Yes, if they explicitly call the private constructor

**Explanation:** Protected constructor still allows derived class and friends to construct. Need private constructor for true Singleton enforcement.

**Key Concept:** #access_control #inheritance

</details>

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

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Yes, sufficient if constructor is private

**Explanation:** Deleting copy/move prevents accidental duplication. Private constructor (or protected in inheritance) prevents direct instantiation.

**Key Concept:** #rule_of_five #copy_prevention

</details>

---


### QUICK_REFERENCE: Answer Key and Comparison Tables

#### Answer Key for Practice Questions

| Q# | Answer | Explanation | Key Concept |
|----|--------|-------------|-------------|
| 1 | Race condition: multiple threads may create multiple instances | Without synchronization, multiple threads can pass the null check simultaneously and each create an instance | #race_condition #thread_safety |
| 2 | Undefined behavior: accessing destroyed Singleton | If Logger is destroyed first, accessing it from Service destructor causes use-after-destruction undefined behavior | #destruction_order #undefined_behavior |
| 3 | Inefficient: mutex locked on every access | While thread-safe, this locks mutex every time getInstance() is called, even after initialization. Meyers Singleton is faster. | #performance #synchronization_overhead |
| 4 | Two instances: one for Logger, one for Config | Each template instantiation Singleton\<T\> has its own static instance. Logger and Config are separate types. | #templates #static_members |
| 5 | Copy constructor not deleted, violates Singleton | Default copy constructor allows copying: `Database db2 = Database::getInstance();` creates second instance | #copy_semantics #design_flaw |
| 6 | Not thread-safe: double-checked locking without atomics | Multiple threads can see null and create multiple shared_ptr instances. Needs mutex or atomic operations. | #thread_safety #shared_ptr |
| 7 | Potential access to destroyed memory | Phoenix pattern: instance never deleted, remains accessible. Regular Meyers Singleton might be destroyed. | #static_destruction #lifetime |
| 8 | std::call_once allows complex initialization with parameters; Meyers is simpler | call_once useful when initialization needs runtime parameters or complex error handling; Meyers simpler for basic cases | #initialization #call_once |
| 9 | Exception during initialization; retried on next call | C++11 guarantees if static local construction throws, initialization guard resets and retries on next access | #exception_safety #initialization |
| 10 | Static member initialized at program start, not lazy | Static member instance created during static initialization phase, whether used or not. Wastes resources if never accessed. | #static_initialization #lazy_init |
| 11 | Not correct: potential double initialization | Race condition between load and store. Multiple threads can load null, create instances, and overwrite each other. Needs compare_exchange. | #atomics #lock_free |
| 12 | Not safe: file might be closed when another static destructor tries to log | Destruction order between statics is reverse of initialization order. If other objects log during destruction, file might already be closed. | #destruction_order #raii |
| 13 | Potentially two instances: one per DLL unless symbol exported | Each DLL gets its own copy of static locals unless explicitly shared via symbol export (__declspec(dllexport)) | #dll_boundaries #symbol_visibility |
| 14 | Yes, Meyers Singleton retries on exception | If constructor throws, static initialization guard resets, allowing retry on next getInstance() call | #exception_handling #retry_logic |
| 15 | Static initialization order fiasco | Order of static initialization across files undefined. If getManager() hasn't run yet, mgr references uninitialized instance. | #initialization_order #undefined_order |
| 16 | Allows injecting mock implementations for testing | setTestInstance() allows replacing real implementation with test double, enabling unit testing without Singleton coupling | #testability #dependency_injection |
| 17 | reload() needs mutex protection for internal state | getInstance() returns reference to static (thread-safe), but reload() modifies member data concurrently. Needs member mutex. | #thread_safety #data_races |
| 18 | Lazy initialization defers 100 resource allocations until first use | Resources only allocated when getInstance() first called, not at program startup. Reduces startup time if rarely used. | #lazy_initialization #startup_time |
| 19 | Yes, if they explicitly call the private constructor | Protected constructor still allows derived class and friends to construct. Need private constructor for true Singleton enforcement. | #access_control #inheritance |
| 20 | Yes, sufficient if constructor is private | Deleting copy/move prevents accidental duplication. Private constructor (or protected in inheritance) prevents direct instantiation. | #rule_of_five #copy_prevention |

#### Singleton Implementation Comparison

| Implementation | Thread-Safe | Lazy Init | Testable | Performance | Complexity |
|---------------|-------------|-----------|----------|-------------|------------|
| Meyers (C++11) | ✅ Yes | ✅ Yes | ❌ No | ⚡ Excellent | 🟢 Low |
| std::call_once | ✅ Yes | ✅ Yes | ⚠️ Partial | 🟡 Good | 🟡 Medium |
| Mutex + unique_ptr | ✅ Yes | ✅ Yes | ⚠️ Partial | 🔴 Poor | 🟡 Medium |
| Static member | ⚠️ Pre-C++11 | ❌ No | ❌ No | ⚡ Excellent | 🟢 Low |
| Phoenix | ✅ Yes | ✅ Yes | ❌ No | ⚡ Excellent | 🟡 Medium |
| Atomic + CAS | ✅ Yes | ✅ Yes | ❌ No | 🟢 Very Good | 🔴 High |
| DI Factory | ✅ Depends | ⚠️ Flexible | ✅ Yes | 🟢 Good | 🔴 High |

#### Thread-Safety Guarantees by C++ Version

| Scenario | C++98/03 | C++11+ | Notes |
|----------|----------|--------|-------|
| Static local init | ❌ Not guaranteed | ✅ Guaranteed | C++11 §6.7/4 guarantees thread-safe init |
| Static member init | ⚠️ Before main() | ⚠️ Before main() | Order undefined across TUs |
| Function-local static | ❌ Race condition | ✅ Thread-safe | Compiler generates guards in C++11+ |
| Heap allocation via new | ❌ Race condition | ❌ Still racy | Need explicit synchronization |
| std::call_once | N/A | ✅ Thread-safe | Introduced in C++11 |

#### Singleton Destruction Patterns

| Pattern | Destroys Instance | Access During Destruction | Memory Leak |
|---------|------------------|---------------------------|-------------|
| Meyers Singleton | ✅ Yes | ⚠️ Undefined if destroyed | ❌ No |
| Phoenix Singleton | ❌ Never | ✅ Always safe | ✅ Intentional |
| unique_ptr heap | ✅ Yes | ⚠️ Undefined if destroyed | ❌ No |
| shared_ptr | ✅ When refcount=0 | ✅ Safe if refs exist | ❌ No |
| Manual new | ❌ Unless explicit delete | ✅ Always accessible | ✅ Yes |

#### Singleton Use Cases in Autonomous Vehicles

| Component | Pattern Choice | Rationale |
|-----------|---------------|-----------|
| Sensor Manager | Meyers | Single hardware interface, initialized on first sensor read |
| Logger | Phoenix | Must be accessible during shutdown when other components log |
| Configuration | std::call_once | Loaded from file with error handling, needs retry logic |
| CAN Bus Driver | Meyers | Single hardware bus, thread-safe required, lazy init acceptable |
| Device Registry | DI Factory | Multiple test implementations needed, testability critical |
| Performance Monitor | Atomic Singleton | High-frequency access (10kHz+), lock-free critical |

---

