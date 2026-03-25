# Topic 13: Thread-Safe Asynchronous Logger

### THEORY_SECTION: Core Concepts and Foundations
#### 1. Logging Requirements

**Features:**
- Thread-safe (multiple threads log concurrently)
- Asynchronous (don't block caller)
- Levels (DEBUG, INFO, WARN, ERROR)
- Timestamping
- Formatting

---

#### 2. Design: Background Thread + Queue

```
Thread 1 ──┐
Thread 2 ──┼──> [Queue] ──> [Logger Thread] ──> File
Thread 3 ──┘
```

**Producer threads:** Push log messages to queue
**Consumer thread:** Pops messages, writes to file

---



```cpp
#include <queue>
#include <thread>
#include <mutex>
#include <condition_variable>
#include <fstream>
#include <sstream>
#include <chrono>
#include <iomanip>

enum class LogLevel {
    DEBUG, INFO, WARN, ERROR
};

class Logger {
private:
    struct LogMessage {
        LogLevel level;
        std::string message;
        std::chrono::system_clock::time_point timestamp;
    };

    std::queue<LogMessage> queue_;
    std::mutex mutex_;
    std::condition_variable cv_;
    std::thread worker_;
    bool stop_{false};

    std::ofstream file_;
    LogLevel min_level_{LogLevel::DEBUG};

    void worker_loop() {
        while (true) {
            LogMessage msg;

            {
                std::unique_lock<std::mutex> lock(mutex_);
                cv_.wait(lock, [this]() {
                    return !queue_.empty() || stop_;
                });

                if (stop_ && queue_.empty()) {
                    return;
                }

                msg = std::move(queue_.front());
                queue_.pop();
            }

            write_to_file(msg);
        }
    }

    void write_to_file(const LogMessage& msg) {
        if (msg.level < min_level_) {
            return;
        }

        auto time_t = std::chrono::system_clock::to_time_t(msg.timestamp);
        auto tm = *std::localtime(&time_t);

        file_ << std::put_time(&tm, "%Y-%m-%d %H:%M:%S") << " ";
        file_ << "[" << level_to_string(msg.level) << "] ";
        file_ << msg.message << '\n';
        file_.flush();
    }

    static const char* level_to_string(LogLevel level) {
        switch (level) {
            case LogLevel::DEBUG: return "DEBUG";
            case LogLevel::INFO:  return "INFO";
            case LogLevel::WARN:  return "WARN";
            case LogLevel::ERROR: return "ERROR";
            default: return "UNKNOWN";
        }
    }

public:
    explicit Logger(const std::string& filename, LogLevel min_level = LogLevel::DEBUG)
        : file_(filename, std::ios::app), min_level_(min_level)
    {
        worker_ = std::thread(&Logger::worker_loop, this);
    }

    ~Logger() {
        {
            std::lock_guard<std::mutex> lock(mutex_);
            stop_ = true;
        }
        cv_.notify_one();
        worker_.join();
    }

    void log(LogLevel level, const std::string& message) {
        {
            std::lock_guard<std::mutex> lock(mutex_);
            queue_.push({level, message, std::chrono::system_clock::now()});
        }
        cv_.notify_one();
    }

    void debug(const std::string& msg) { log(LogLevel::DEBUG, msg); }
    void info(const std::string& msg)  { log(LogLevel::INFO, msg); }
    void warn(const std::string& msg)  { log(LogLevel::WARN, msg); }
    void error(const std::string& msg) { log(LogLevel::ERROR, msg); }
};
```

---

### EDGE_CASES: Tricky Scenarios and Deep Internals
---

#### Edge Case 1: Destruction with Pending Messages

**Problem:** Logger destroyed before queue empty.

**Solution:** Flush queue in destructor (our implementation does this).

---

#### Edge Case 2: Disk Full / File Write Error

**Problem:** `file_.write()` fails.

**Mitigation:**
```cpp
if (!file_) {
    std::cerr << "LOG ERROR: Failed to write\n";
}
```

---

### CODE_EXAMPLES: Practical Demonstrations
---

#### Example 1: Multi-Threaded Logging

This example demonstrates **a production-ready asynchronous logging system handling concurrent log requests from multiple threads**. The code spawns 4 worker threads that each generate 10 log messages with 10ms delays, simulating a real application where multiple components log simultaneously without blocking each other or the main thread.

**What this code does:**
- Creates a Logger instance writing to "app.log" with minimum level INFO (DEBUG messages filtered)
- Logs application lifecycle events (startup, shutdown) from main thread
- Spawns 4 worker threads that each produce 10 log messages with unique worker IDs
- Each worker sleeps 10ms between logs to simulate real work being done
- All log messages are queued asynchronously and written by the background logger thread
- Destructor ensures all queued messages are flushed to disk before program exits

**Key concepts demonstrated:**
- **Thread-safe queueing** - multiple threads can call `logger.info()` simultaneously without data races
- **Asynchronous I/O** - worker threads return immediately from `log()` calls (~1μs), not blocked by disk I/O (~1ms)
- **Producer-consumer pattern** - worker threads produce log messages, background thread consumes and writes
- **RAII guarantee** - destructor flushes pending messages even if main() exits early
- **Log level filtering** - minimum level set to INFO means DEBUG calls would be silently ignored

**Why this matters:**
In high-throughput servers (web servers, databases, game servers), **synchronous logging is a performance killer**. If 1000 requests/second each log 5 messages, and each disk write takes 1ms, that's 5 seconds of blocked time per second - impossible! Asynchronous logging decouples application threads from I/O latency, allowing threads to continue working while logs are written in the background.

**Performance implications:**
- Worker threads spend only ~1μs in `log()` vs ~1ms for synchronous disk write (1000× faster)
- Background thread batches writes and can optimize disk I/O patterns
- Queue allows burst handling - temporary high log volume doesn't block application
- Small memory cost: log queue grows if production rate exceeds write rate

**Real-world applications:**
- **Web servers**: Request/response logging without slowing request handling
- **Game servers**: Player action logging at 60+ FPS without frame drops
- **Database systems**: Query logging without impacting transaction throughput
- **Distributed systems**: Trace logging for debugging without performance penalties


```cpp
#include <iostream>

void worker(Logger& logger, int id) {
    for (int i = 0; i < 10; ++i) {
        logger.info("Worker " + std::to_string(id) + " iteration " + std::to_string(i));
        std::this_thread::sleep_for(std::chrono::milliseconds(10));
    }
}

int main() {
    Logger logger("app.log", LogLevel::INFO);

    logger.info("Application started");

    std::vector<std::thread> threads;
    for (int i = 0; i < 4; ++i) {
        threads.emplace_back(worker, std::ref(logger), i);
    }

    for (auto& t : threads) {
        t.join();
    }

    logger.info("Application exiting");

    return 0;
}
```

**app.log:**
```
2026-03-24 12:00:00 [INFO] Application started
2026-03-24 12:00:00 [INFO] Worker 0 iteration 0
2026-03-24 12:00:00 [INFO] Worker 1 iteration 0
...
2026-03-24 12:00:01 [INFO] Application exiting
```

---

### INTERVIEW_QA: Comprehensive Questions and Answers
---

#### Q1: Why asynchronous logging?
Implement this exercise.

**Synchronous:**
```cpp
logger.info("message");  // Blocks until written to disk (~1ms)
```

**Asynchronous:**
```cpp
logger.info("message");  // Returns immediately (~1μs)
```

**Benefits:** Don't slow down application with I/O.

---
#### Q2: What if queue grows unbounded?
Implement this exercise.

**Problem:** Fast logging, slow disk → queue grows → OOM.

**Solutions:**
1. **Bounded queue** - Block when full
2. **Drop oldest** - Circular overwrite
3. **Drop newest** - Skip when full

---
### PRACTICE_TASKS: Output Prediction and Code Analysis
---

#### Q1
Add log file rotation (max size/age)

Implement this exercise.
#### Q2
Implement bounded queue (drop old messages)

Implement this exercise.
#### Q3
Add formatting (printf-style or fmt library)

Implement this exercise.
#### Q4
Benchmark vs synchronous logging

Implement this exercise.
#### Q5
Multi-file logging (one file per thread)

Implement this exercise.

---

### QUICK_REFERENCE: Key Takeaways and Comparison Tables
```cpp
Logger logger("app.log", LogLevel::INFO);

logger.debug("Debug message");  // Not written (below min level)
logger.info("Info message");
logger.warn("Warning message");
logger.error("Error message");

// Automatic flush on destruction
```

**Key points:**
- Thread-safe (queue + mutex)
- Asynchronous (background thread)
- Configurable min level
- Timestamped messages
