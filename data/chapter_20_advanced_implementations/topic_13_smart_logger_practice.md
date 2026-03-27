## TOPIC: Asynchronous Logger - Background Thread Logging

### PRACTICE_TASKS: Output Prediction and Code Analysis

#### Q1
```cpp
class AsyncLogger {
    std::queue<std::string> queue_;
    std::thread worker_;
    bool stop_ = false;

    void worker_thread() {
        while (!stop_) {
            if (!queue_.empty()) {  // Bug: not thread-safe!
                std::string msg = queue_.front();
                queue_.pop();
                write_to_file(msg);
            }
        }
    }

public:
    void log(const std::string& msg) {
        queue_.push(msg);  // Bug: data race!
    }
};
```

**Answer:**
```
Data race (queue_ accessed without synchronization from multiple threads)
```

**Explanation:**
- `log()` called from any thread, pushes to queue
- `worker_thread()` pops from queue
- Concurrent access to `queue_` → data race
- `std::queue` not thread-safe
- Need mutex to protect queue
- **Key Concept:** STL containers not thread-safe; concurrent access requires external synchronization; must protect shared queue with mutex

**Fixed Version:**
```cpp
class AsyncLogger {
    std::queue<std::string> queue_;
    std::mutex mutex_;
    std::condition_variable cv_;
    std::thread worker_;
    bool stop_ = false;

    void worker_thread() {
        while (true) {
            std::unique_lock<std::mutex> lock(mutex_);
            cv_.wait(lock, [this] { return !queue_.empty() || stop_; });

            if (stop_ && queue_.empty()) break;

            std::string msg = std::move(queue_.front());
            queue_.pop();
            lock.unlock();

            write_to_file(msg);
        }
    }

public:
    void log(const std::string& msg) {
        std::lock_guard<std::mutex> lock(mutex_);
        queue_.push(msg);
        cv_.notify_one();
    }
};
```

---

#### Q2
```cpp
class AsyncLogger {
    std::queue<std::string> queue_;
    std::mutex mutex_;
    std::thread worker_;
    bool stop_ = false;

public:
    ~AsyncLogger() {
        stop_ = true;  // Bug: worker may never see this!
        worker_.join();  // Bug: may hang forever!
    }
};
```

**Answer:**
```
Deadlock or hang (worker thread may be sleeping, never sees stop_ = true)
```

**Explanation:**
- Set `stop_ = true` but worker may be blocked/sleeping
- Worker never wakes to check `stop_`
- `join()` waits forever
- Need to wake worker thread with condition variable notification
- Or: use atomic `stop_` with periodic checks
- **Key Concept:** Setting flag doesn't wake sleeping threads; must signal condition variable or interrupt thread; destructor must ensure worker thread exits

**Fixed Version:**
```cpp
~AsyncLogger() {
    {
        std::lock_guard<std::mutex> lock(mutex_);
        stop_ = true;
    }
    cv_.notify_all();  // Wake worker thread
    worker_.join();
}
```

---

#### Q3
```cpp
class AsyncLogger {
    std::queue<std::string> queue_;
    std::mutex mutex_;
    std::thread worker_;

    void worker_thread() {
        while (true) {
            std::unique_lock<std::mutex> lock(mutex_);
            if (!queue_.empty()) {
                std::string msg = queue_.front();
                queue_.pop();
                write_to_file(msg);  // Bug: holds lock while writing!
            }
        }
    }
};
```

**Answer:**
```
Lock contention (holding mutex during slow I/O blocks all log() calls)
```

**Explanation:**
- `write_to_file()` is slow I/O operation
- Mutex held during entire write
- All `log()` calls from other threads blocked
- Defeats asynchronous logging purpose
- Should release lock before writing
- **Key Concept:** Don't hold locks during I/O; minimizes critical section; pop message then unlock before writing; maximizes concurrency

**Fixed Version:**
```cpp
void worker_thread() {
    while (true) {
        std::unique_lock<std::mutex> lock(mutex_);
        if (!queue_.empty()) {
            std::string msg = std::move(queue_.front());
            queue_.pop();
            lock.unlock();  // Release lock before I/O!

            write_to_file(msg);
        }
    }
}
```

---

#### Q4
```cpp
class AsyncLogger {
    std::queue<std::string> queue_;
    std::mutex mutex_;
    std::condition_variable cv_;

public:
    void log(const std::string& msg) {
        std::lock_guard<std::mutex> lock(mutex_);
        queue_.push(msg);  // Bug: copies string while holding lock!
        cv_.notify_one();
    }
};
```

**Answer:**
```
Performance issue (string copy under lock, increases contention)
```

**Explanation:**
- `queue_.push(msg)` copies string while holding mutex
- For large messages, copy is expensive
- Other threads wait longer
- Should use move semantics or emplace
- Minimize work under lock
- **Key Concept:** Minimize critical section duration; avoid expensive operations under lock; use move semantics to transfer ownership without copying

**Fixed Version:**
```cpp
void log(std::string msg) {  // Take by value
    std::lock_guard<std::mutex> lock(mutex_);
    queue_.push(std::move(msg));  // Move into queue
    cv_.notify_one();
}

// Or emplace
void log(const std::string& msg) {
    std::lock_guard<std::mutex> lock(mutex_);
    queue_.emplace(msg);  // Construct in-place
    cv_.notify_one();
}
```

---

#### Q5
```cpp
class AsyncLogger {
    std::queue<std::string> queue_;
    // No capacity limit!

public:
    void log(const std::string& msg) {
        // ... add to queue ...
    }
};

int main() {
    AsyncLogger logger;

    // Fast producer, slow consumer
    while (true) {
        logger.log("Message");  // Bug: unbounded queue growth!
        std::this_thread::sleep_for(1us);  // Faster than worker can process
    }
}
```

**Answer:**
```
Memory exhaustion (unbounded queue grows without limit, consumes all RAM)
```

**Explanation:**
- Producer faster than consumer → queue grows
- No capacity limit → eventually out of memory
- Need bounded queue with backpressure
- Options: block when full, drop messages, ring buffer
- **Key Concept:** Async queues need capacity limits; unbounded queues risk memory exhaustion; implement backpressure or drop policy

**Fixed Version:**
```cpp
class AsyncLogger {
    std::queue<std::string> queue_;
    size_t max_capacity_ = 10000;

public:
    void log(const std::string& msg) {
        std::unique_lock<std::mutex> lock(mutex_);

        // Wait if queue full (backpressure)
        cv_full_.wait(lock, [this] {
            return queue_.size() < max_capacity_ || stop_;
        });

        queue_.push(msg);
        cv_empty_.notify_one();
    }
};
```

---

#### Q6
```cpp
class AsyncLogger {
    std::ofstream file_;

    void worker_thread() {
        while (true) {
            std::string msg = dequeue();
            file_ << msg << "\n";  // Bug: no flush!
        }
    }
};

int main() {
    AsyncLogger logger;
    logger.log("Important message");
    std::abort();  // Crash! Bug: message lost in buffer!
}
```

**Answer:**
```
Data loss (messages buffered, not flushed before crash)
```

**Explanation:**
- `ofstream` buffers writes
- Crash before flush → buffered data lost
- Async logging inherently risks loss on crash
- Options: periodic flush, flush on important messages
- Trade-off: reliability vs performance
- **Key Concept:** Buffered I/O risks data loss on crash; async logging compounds this; flush periodically or on critical messages; document guarantees

**Fixed Version:**
```cpp
void worker_thread() {
    while (true) {
        std::string msg = dequeue();
        file_ << msg << "\n";

        // Option 1: Flush periodically
        if (messages_written++ % 100 == 0) {
            file_.flush();
        }

        // Option 2: Flush on critical messages
        if (msg.find("[CRITICAL]") != std::string::npos) {
            file_.flush();
        }
    }
}
```

---

#### Q7
```cpp
class AsyncLogger {
    void worker_thread() {
        while (!stop_) {
            std::string msg = dequeue();
            file_ << format_message(msg);  // Bug: format_message() may throw!
        }
    }
};
```

**Answer:**
```
Thread termination (exception in worker thread terminates thread silently)
```

**Explanation:**
- `format_message()` throws exception
- Exception propagates out of `worker_thread()`
- Thread terminates, logging stops
- No more messages processed
- Worker thread must catch exceptions
- **Key Concept:** Uncaught exceptions in threads terminate thread; worker threads must catch and handle all exceptions; logging must be resilient

**Fixed Version:**
```cpp
void worker_thread() {
    while (!stop_) {
        try {
            std::string msg = dequeue();
            file_ << format_message(msg);
        } catch (const std::exception& e) {
            // Log to stderr or alternative
            std::cerr << "Logger error: " << e.what() << "\n";
        } catch (...) {
            std::cerr << "Logger unknown error\n";
        }
    }
}
```

---

#### Q8
```cpp
class AsyncLogger {
    std::string format_with_timestamp(const std::string& msg) {
        auto now = std::chrono::system_clock::now();
        auto time_t = std::chrono::system_clock::to_time_t(now);
        auto tm = *std::localtime(&time_t);  // Bug: localtime not thread-safe!

        char buffer[100];
        strftime(buffer, sizeof(buffer), "%Y-%m-%d %H:%M:%S", &tm);
        return std::string(buffer) + " " + msg;
    }
};
```

**Answer:**
```
Data race (std::localtime returns pointer to static buffer, not thread-safe)
```

**Explanation:**
- `std::localtime()` returns pointer to static internal buffer
- Multiple threads calling `localtime()` → race
- Buffer contents overwritten
- Use `localtime_r()` (POSIX) or `localtime_s()` (Windows)
- Or use thread-safe C++20 chrono formatting
- **Key Concept:** Many C library functions use static buffers; not thread-safe; use reentrant _r variants or modern C++ alternatives

**Fixed Version:**
```cpp
std::string format_with_timestamp(const std::string& msg) {
    auto now = std::chrono::system_clock::now();
    auto time_t = std::chrono::system_clock::to_time_t(now);

    struct tm tm;
    localtime_r(&time_t, &tm);  // Thread-safe version

    char buffer[100];
    strftime(buffer, sizeof(buffer), "%Y-%m-%d %H:%M:%S", &tm);
    return std::string(buffer) + " " + msg;
}

// Or use C++20
auto now = std::chrono::system_clock::now();
return std::format("{:%Y-%m-%d %H:%M:%S} {}", now, msg);
```

---

#### Q9
```cpp
class AsyncLogger {
    std::thread worker_;

public:
    AsyncLogger() {
        worker_ = std::thread(&AsyncLogger::worker_thread, this);  // Bug: starts immediately!
    }

private:
    std::queue<std::string> queue_;  // Bug: may not be initialized yet!
    std::mutex mutex_;
};
```

**Answer:**
```
Undefined behavior (worker thread accesses uninitialized members)
```

**Explanation:**
- Constructor initializer list executes top-to-bottom
- `worker_` initialized before `queue_` and `mutex_`
- Worker thread starts immediately
- Accesses `queue_` and `mutex_` before they're initialized
- Undefined behavior
- Initialize members before starting thread
- **Key Concept:** Member initialization order matters; worker threads must start after all members initialized; use two-phase initialization or reorder members

**Fixed Version:**
```cpp
class AsyncLogger {
    std::queue<std::string> queue_;  // Declare first
    std::mutex mutex_;
    std::thread worker_;  // Declare last

public:
    AsyncLogger() {
        worker_ = std::thread(&AsyncLogger::worker_thread, this);  // Now safe
    }
};

// Or two-phase initialization
class AsyncLogger {
    std::thread worker_;

public:
    AsyncLogger() {  // Don't start thread here
        // Initialize members
    }

    void start() {  // Explicit start
        worker_ = std::thread(&AsyncLogger::worker_thread, this);
    }
};
```

---

#### Q10
```cpp
class AsyncLogger {
    std::vector<std::string> buffer_;
    size_t current_size_ = 0;
    static constexpr size_t BATCH_SIZE = 100;

    void worker_thread() {
        while (true) {
            std::string msg = dequeue();
            buffer_.push_back(msg);
            current_size_ += msg.size();

            if (buffer_.size() >= BATCH_SIZE) {  // Bug: checking count, not size!
                flush_buffer();
            }
        }
    }

    void flush_buffer() {
        for (const auto& msg : buffer_) {
            file_ << msg;
        }
        buffer_.clear();
        current_size_ = 0;
    }
};
```

**Answer:**
```
Design inconsistency (tracks current_size_ but uses buffer_.size() for flushing)
```

**Explanation:**
- Maintains `current_size_` (bytes) but flushes based on count
- If intent is byte-based flushing, should check `current_size_ >= BATCH_SIZE`
- If intent is count-based, don't need `current_size_`
- Mixed metrics confusing
- Clarify: flush by count or by bytes?
- **Key Concept:** Consistent metrics for batching; decide on count-based or size-based flushing; tracking both but using only one creates confusion

**Fixed Version:**
```cpp
// Option 1: Flush by count
void worker_thread() {
    while (true) {
        std::string msg = dequeue();
        buffer_.push_back(msg);

        if (buffer_.size() >= BATCH_SIZE) {
            flush_buffer();
        }
    }
}

// Option 2: Flush by size (bytes)
void worker_thread() {
    while (true) {
        std::string msg = dequeue();
        buffer_.push_back(msg);
        current_size_ += msg.size();

        if (current_size_ >= MAX_BATCH_BYTES) {  // Use size!
            flush_buffer();
        }
    }
}
```

---
