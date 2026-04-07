### THEORY_SECTION: Core Concepts and Foundations
#### 1. Singleton Pattern

**Goal:** Ensure only one instance of a class exists globally.

**Real-World Analogy: Country's President**

```
PROBLEM (Multiple Instances):
  Country has 3 presidents at the same time!
  - President A makes decision: "Build bridge"
  - President B makes decision: "Don't build bridge"
  - President C makes decision: "Build tunnel instead"
  Result: CHAOS! Conflicting decisions ❌

SOLUTION (Singleton):
  Country has exactly ONE president
  - All requests go to SAME president
  - Consistent decisions ✓
  - Everyone gets same answer ✓
```

**In C++:**
```cpp
// WITHOUT Singleton:
Logger log1;  // Creates instance 1
Logger log2;  // Creates instance 2  ← Different loggers, different files!

log1.write("Error");  // Writes to file1.log
log2.write("Warning"); // Writes to file2.log  ← Logs split across files!

// WITH Singleton:
Logger& log1 = Logger::getInstance();  // Gets THE instance
Logger& log2 = Logger::getInstance();  // Gets SAME instance ✓

log1.write("Error");   // Writes to file.log
log2.write("Warning"); // Writes to SAME file.log ✓
```

**Use Cases:**

| Scenario | Why Singleton? | Consequence of Multiple Instances |
|----------|----------------|----------------------------------|
| **Logger** | All logs go to one file | Logs scattered across multiple files |
| **Configuration Manager** | Single source of truth for settings | Inconsistent settings across modules |
| **Database Connection Pool** | Manage limited connections centrally | Connection exhaustion, resource leaks |
| **Device Driver** | Only one hardware device exists | Conflicting hardware access |

**Visual: Singleton Pattern**

```
WITHOUT SINGLETON:
┌─────────┐     ┌─────────┐     ┌─────────┐
│ Thread1 │     │ Thread2 │     │ Thread3 │
└────┬────┘     └────┬────┘     └────┬────┘
     │               │               │
     ↓               ↓               ↓
┌─────────┐     ┌─────────┐     ┌─────────┐
│Logger #1│     │Logger #2│     │Logger #3│  ← 3 different instances!
└─────────┘     └─────────┘     └─────────┘
     ↓               ↓               ↓
  file1.log       file2.log       file3.log  ← Logs split!

WITH SINGLETON:
┌─────────┐     ┌─────────┐     ┌─────────┐
│ Thread1 │     │ Thread2 │     │ Thread3 │
└────┬────┘     └────┬────┘     └────┬────┘
     │               │               │
     └───────────────┼───────────────┘
                     ↓
              ┌─────────────┐
              │Logger (ONE) │  ← Single instance shared
              └──────┬──────┘
                     ↓
                  file.log      ← All logs together!
```

---

#### 2. Classic Singleton (NOT Thread-Safe)

```cpp
class Singleton {
private:
    static Singleton* instance_;

    Singleton() {}  // Private constructor

public:
    static Singleton* getInstance() {
        if (!instance_) {
            instance_ = new Singleton();  // Race condition!
        }
        return instance_;
    }
};

Singleton* Singleton::instance_ = nullptr;
```

**Problem:** Two threads can create two instances.

---

#### 3. Meyer's Singleton (C++11 Thread-Safe)

```cpp
class Singleton {
private:
    Singleton() {}

public:
    static Singleton& getInstance() {
        static Singleton instance;  // Thread-safe initialization (C++11)
        return instance;
    }

    Singleton(const Singleton&) = delete;
    Singleton& operator=(const Singleton&) = delete;
};
```

**Key:** C++11 guarantees static local variables initialized once, thread-safely.

---

#### 4. Double-Checked Locking Pattern (DCLP)

```cpp
class Singleton {
private:
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

std::atomic<Singleton*> Singleton::instance_{nullptr};
std::mutex Singleton::mutex_;
```

**Optimization:** Avoids lock on every call (only locks during initialization).

---

## Complete Implementations

### Implementation 1: Meyer's Singleton (Recommended)

```cpp
#include <mutex>
#include <iostream>

class Logger {
private:
    Logger() {
        std::cout << "Logger initialized\n";
    }

public:
    static Logger& getInstance() {
        static Logger instance;  // Thread-safe (C++11)
        return instance;
    }

    Logger(const Logger&) = delete;
    Logger& operator=(const Logger&) = delete;

    void log(const std::string& message) {
        std::cout << "[LOG] " << message << '\n';
    }
};
```

---

### Implementation 2: Double-Checked Locking

```cpp
#include <atomic>
#include <mutex>

class ConfigManager {
private:
    static std::atomic<ConfigManager*> instance_;
    static std::mutex mutex_;

    std::string config_data_;

    ConfigManager() : config_data_("default_config") {}

public:
    static ConfigManager* getInstance() {
        ConfigManager* tmp = instance_.load(std::memory_order_acquire);

        if (!tmp) {
            std::lock_guard<std::mutex> lock(mutex_);
            tmp = instance_.load(std::memory_order_relaxed);

            if (!tmp) {
                tmp = new ConfigManager();
                instance_.store(tmp, std::memory_order_release);
            }
        }

        return tmp;
    }

    std::string getConfig() const {
        return config_data_;
    }
};

std::atomic<ConfigManager*> ConfigManager::instance_{nullptr};
std::mutex ConfigManager::mutex_;
```

---

### Implementation 3: Call-Once Pattern

```cpp
#include <mutex>

class DatabaseConnection {
private:
    static DatabaseConnection* instance_;
    static std::once_flag init_flag_;

    DatabaseConnection() {}

    static void initSingleton() {
        instance_ = new DatabaseConnection();
    }

public:
    static DatabaseConnection* getInstance() {
        std::call_once(init_flag_, initSingleton);
        return instance_;
    }
};

DatabaseConnection* DatabaseConnection::instance_ = nullptr;
std::once_flag DatabaseConnection::init_flag_;
```

---

### EDGE_CASES: Tricky Scenarios and Deep Internals
---

#### Edge Case 1: Destruction Order (Static Deinitialization Fiasco)

```cpp
class Singleton1 {
public:
    static Singleton1& get() {
        static Singleton1 instance;
        return instance;
    }

    ~Singleton1() {
        Singleton2::get().doSomething();  // ← May crash if Singleton2 already destroyed
    }
};
```

**Solution:** Avoid dependencies between singletons' destructors.

---

#### Edge Case 2: Lazy vs Eager Initialization

**Lazy (Meyer's):**
```cpp
static Singleton& get() {
    static Singleton instance;  // Created on first call
    return instance;
}
```

**Eager:**
```cpp
class Singleton {
    static Singleton instance;  // Created at program start
};

Singleton Singleton::instance;
```

---

### CODE_EXAMPLES: Practical Demonstrations
---

#### Example 1: Thread-Safe Logger

**This example demonstrates a production-ready thread-safe file logger using Meyer's Singleton pattern with mutex protection for concurrent writes.**

**What this code does:**
- Implements a singleton logger that writes to a single log file (app.log) opened in append mode
- Opens the log file lazily on first access to getInstance() (not at program startup)
- Protects each log write with a mutex to prevent interleaved output from multiple threads
- Flushes the file stream after each write to ensure messages are persisted immediately
- The singleton instance and its file handle are automatically destroyed at program exit

**Key concepts demonstrated:**
- Meyer's Singleton ensures exactly one Logger instance exists across all threads
- C++11 guarantees thread-safe initialization of static local variables (no race conditions)
- std::mutex prevents data races when multiple threads write to the file simultaneously
- std::lock_guard provides RAII-based lock management (automatic unlock on scope exit)
- Opening file in append mode (std::ios::app) prevents overwriting previous runs' logs

**Real-world applications:**
- Application logging in multi-threaded servers where all threads need to log events
- Error reporting systems that must work even during stack unwinding
- Diagnostic logging in libraries that don't know about caller's threading model
- Centralized audit trails in financial or security-critical applications

**Why this matters:**
- Without mutex protection, log lines from different threads would be garbled and intermixed
- Without singleton pattern, multiple log files might be created or writes might conflict
- Immediate flushing trades performance for reliability (logs survive crashes)
- Global access via getInstance() works from any context without dependency injection

**Performance implications:**
- Mutex contention can become a bottleneck if logging is extremely frequent
- Flushing after each write is slow but ensures crash-resistant logging
- Consider buffering or async logging for high-throughput applications
- First call to getInstance() has slight overhead due to static initialization

```cpp
#include <fstream>
#include <mutex>

class FileLogger {
private:
    std::ofstream file_;
    std::mutex mutex_;

    FileLogger() : file_("app.log", std::ios::app) {}

public:
    static FileLogger& getInstance() {
        static FileLogger instance;
        return instance;
    }

    void log(const std::string& message) {
        std::lock_guard<std::mutex> lock(mutex_);
        file_ << message << '\n';
        file_.flush();
    }
};

// Usage:
FileLogger::getInstance().log("Application started");
```

---

### QUICK_REFERENCE: Key Takeaways and Comparison Tables
```cpp
// Meyer's Singleton (Recommended)
class Singleton {
public:
    static Singleton& getInstance() {
        static Singleton instance;
        return instance;
    }

    Singleton(const Singleton&) = delete;
    Singleton& operator=(const Singleton&) = delete;
};

// Usage:
Singleton::getInstance().doSomething();
```

**Key points:**
- Thread-safe (C++11+)
- Lazy initialization
- Automatic destruction
- No manual memory management
