## TOPIC: Event-Driven Architecture (Asynchronous Systems)

### PRACTICE_TASKS: Code Analysis and Implementation Challenges

#### Q1
```cpp
#include <vector>
#include <functional>

struct Event {
    int type;
    int data;
};

using EventHandler = std::function<void(const Event&)>;

class EventBus {
    std::vector<EventHandler> handlers;
public:
    void publish(const Event& e) {
        for (auto& h : handlers) {
            h(e);  // What if h() calls unsubscribe()?
        }
    }

    void subscribe(EventHandler h) {
        handlers.push_back(h);
    }

    void unsubscribe(EventHandler h) {
        handlers.erase(/*..*/);  // Modifies vector during iteration!
    }
};
```

**Answer:**
```
Iterator invalidation bug - undefined behavior if handler unsubscribes during publish
```

**Explanation:**
- Iterating over `handlers` vector while handler callback modifies it (unsubscribe)
- `unsubscribe()` erases from vector, invalidating iterators currently in use
- Causes undefined behavior: crash, skip handlers, or call deleted handlers
- Classic event system bug - handlers modifying subscription list during dispatch
- **Key Concept:** Never modify container while iterating; use snapshot or deferred operations

**Fixed Version:**
```cpp
class EventBus {
    std::vector<EventHandler> handlers;

public:
    void publish(const Event& e) {
        // Copy handlers vector to avoid iterator invalidation
        auto copy = handlers;  // Snapshot at publish time
        for (auto& h : copy) {
            h(e);  // Safe - iterating over copy
        }
    }

    void subscribe(EventHandler h) {
        handlers.push_back(h);
    }

    void unsubscribe(EventHandler h) {
        // Remove handler (modifies original, not affecting copy in publish)
        handlers.erase(std::remove_if(handlers.begin(), handlers.end(),
            [&](const EventHandler& handler) {
                // Compare function pointers (simplified)
                return handler.target_type() == h.target_type();
            }), handlers.end());
    }
};
```

**Alternative: Deferred Removal:**
```cpp
class EventBus {
    std::vector<EventHandler> handlers;
    std::vector<EventHandler> toRemove;
    bool publishing = false;

public:
    void publish(const Event& e) {
        publishing = true;
        for (auto& h : handlers) {
            h(e);
        }
        publishing = false;

        // Process deferred removals
        for (auto& h : toRemove) {
            handlers.erase(std::remove_if(handlers.begin(), handlers.end(),
                [&](const EventHandler& handler) {
                    return handler.target_type() == h.target_type();
                }), handlers.end());
        }
        toRemove.clear();
    }

    void unsubscribe(EventHandler h) {
        if (publishing) {
            toRemove.push_back(h);  // Defer until publish completes
        } else {
            handlers.erase(std::remove_if(handlers.begin(), handlers.end(),
                [&](const EventHandler& handler) {
                    return handler.target_type() == h.target_type();
                }), handlers.end());
        }
    }
};
```

#### Q2
```cpp
#include <iostream>
#include <queue>
#include <functional>

struct Event {
    int type;
    int data;
};

class EventQueue {
    std::queue<Event> events;

public:
    void push(const Event& e) {
        events.push(e);
    }

    void processAll() {
        while (!events.empty()) {
            Event e = events.front();
            events.pop();
            handleEvent(e);  // What if handleEvent() pushes new events?
        }
    }

    void handleEvent(const Event& e) {
        if (e.type == 1) {
            push(Event{2, e.data * 2});  // Recursive event!
        }
        std::cout << "Processed event: " << e.type << "\n";
    }
};
```

**Answer:**
```
Infinite loop if initial event type is 1
```

**Explanation:**
- `handleEvent()` for type 1 pushes new event type 2
- Type 2 event might push another event, creating infinite chain
- Queue never empties - infinite loop
- Classic event loop recursion problem
- **Key Concept:** Limit event recursion depth or use generational processing to prevent infinite event chains

**Fixed Version:**
```cpp
class EventQueue {
    std::queue<Event> events;
    int recursionDepth = 0;
    const int MAX_DEPTH = 10;

public:
    void processAll() {
        while (!events.empty() && recursion Depth < MAX_DEPTH) {
            Event e = events.front();
            events.pop();

            recursionDepth++;
            handleEvent(e);
            recursionDepth--;
        }

        if (recursionDepth >= MAX_DEPTH) {
            std::cerr << "Warning: Event recursion limit reached\n";
        }
    }
};
```

**Better: Generational Processing:**
```cpp
class EventQueue {
    std::queue<Event> current;
    std::queue<Event> next;

public:
    void processAll() {
        while (!current.empty()) {
            Event e = current.front();
            current.pop();
            handleEvent(e);  // Can push to 'next' queue
        }
        std::swap(current, next);  // Next generation becomes current
    }

    void push(const Event& e) {
        next.push(e);  // New events go to next generation
    }
};
```

#### Q3
```cpp
#include <thread>
#include <vector>

class EventBus {
    std::vector<EventHandler> handlers;

public:
    void publish(const Event& e) {
        for (auto& h : handlers) {
            h(e);
        }
    }

    void subscribe(EventHandler h) {
        handlers.push_back(h);
    }
};

int main() {
    EventBus bus;

    // Thread 1: publishes events
    std::thread t1([&]() {
        for (int i = 0; i < 1000; ++i) {
            bus.publish(Event{1, i});
        }
    });

    // Thread 2: subscribes handlers
    std::thread t2([&]() {
        for (int i = 0; i < 10; ++i) {
            bus.subscribe([](const Event& e) {
                std::cout << e.data;
            });
        }
    });

    t1.join();
    t2.join();
}
```

**Answer:**
```
Data race - undefined behavior (likely crash)
```

**Explanation:**
- Thread 1 reading `handlers` vector while Thread 2 modifying it
- `std::vector` is not thread-safe - concurrent read/write causes data race
- Vector reallocation during `push_back()` invalidates iterators in `publish()`
- Results: crashes, wrong handlers called, or skipped handlers
- **Key Concept:** Shared mutable state requires synchronization; use mutex or lock-free data structures

**Fixed Version:**
```cpp
#include <mutex>

class EventBus {
    std::vector<EventHandler> handlers;
    mutable std::mutex mtx;

public:
    void publish(const Event& e) {
        std::lock_guard<std::mutex> lock(mtx);
        for (auto& h : handlers) {
            h(e);
        }
    }

    void subscribe(EventHandler h) {
        std::lock_guard<std::mutex> lock(mtx);
        handlers.push_back(h);
    }
};
```

#### Q4
```cpp
class EventBus {
    std::unordered_map<int, std::vector<EventHandler>> handlers;

public:
    void subscribe(int eventType, EventHandler h) {
        handlers[eventType].push_back(h);
    }

    void publish(const Event& e) {
        if (handlers.count(e.type)) {
            for (auto& h : handlers[e.type]) {
                h(e);
            }
        }
    }
};

// What's more efficient than this approach?
```

**Answer:**
```
Type-based dispatch is efficient, but can be improved with compile-time polymorphism
```

**Explanation:**
- Runtime map lookup has overhead (hash computation, bucket search)
- Better for many event types (100+), but overkill for few types
- Memory overhead: each event type needs separate vector
- Alternative: compile-time dispatch with variant or function overloading
- **Key Concept:** Choose runtime dispatch (map) for dynamic types, compile-time dispatch (templates/overloading) for fixed types

**Better for Fixed Types:**
```cpp
#include <variant>
#include <vector>

struct SensorEvent { int data; };
struct CommandEvent { std::string cmd; };
struct ErrorEvent { std::string msg; };

using Event = std::variant<SensorEvent, CommandEvent, ErrorEvent>;

class EventBus {
    std::vector<std::function<void(const SensorEvent&)>> sensorHandlers;
    std::vector<std::function<void(const CommandEvent&)>> commandHandlers;
    std::vector<std::function<void(const ErrorEvent&)>> errorHandlers;

public:
    void publish(const Event& e) {
        std::visit([this](const auto& event) {
            using T = std::decay_t<decltype(event)>;

            if constexpr (std::is_same_v<T, SensorEvent>) {
                for (auto& h : sensorHandlers) h(event);
            } else if constexpr (std::is_same_v<T, CommandEvent>) {
                for (auto& h : commandHandlers) h(event);
            } else if constexpr (std::is_same_v<T, ErrorEvent>) {
                for (auto& h : errorHandlers) h(event);
            }
        }, e);
    }

    void subscribe(std::function<void(const SensorEvent&)> h) {
        sensorHandlers.push_back(h);
    }
    // ... other subscribe overloads
};
```

#### Q5
```cpp
class AsyncEventBus {
    std::queue<Event> eventQueue;
    std::vector<EventHandler> handlers;
    std::thread workerThread;
    bool running = true;

public:
    AsyncEventBus() {
        workerThread = std::thread([this]() {
            while (running) {
                if (!eventQueue.empty()) {
                    Event e = eventQueue.front();
                    eventQueue.pop();

                    for (auto& h : handlers) {
                        h(e);  // Process asynchronously
                    }
                }
            }
        });
    }

    void publish(const Event& e) {
        eventQueue.push(e);
    }

    ~AsyncEventBus() {
        running = false;
        workerThread.join();
    }
};
```

**Answer:**
```
Multiple data races - eventQueue and handlers accessed without synchronization
```

**Explanation:**
- `publish()` writes to `eventQueue` while worker thread reads it - data race
- `handlers` vector read by worker, potentially modified by main thread - data race
- No synchronization between producer (publish) and consumer (worker)
- Destructor doesn't ensure queue is empty before stopping worker
- **Key Concept:** Async event processing requires thread-safe queue and proper shutdown synchronization

**Fixed Version:**
```cpp
#include <thread>
#include <queue>
#include <mutex>
#include <condition_variable>

class AsyncEventBus {
    std::queue<Event> eventQueue;
    std::vector<EventHandler> handlers;
    std::mutex queueMtx;
    std::mutex handlersMtx;
    std::condition_variable cv;
    std::thread workerThread;
    bool running = true;

public:
    AsyncEventBus() {
        workerThread = std::thread([this]() {
            while (true) {
                std::unique_lock<std::mutex> lock(queueMtx);
                cv.wait(lock, [this]() {
                    return !eventQueue.empty() || !running;
                });

                if (!running && eventQueue.empty()) break;

                if (!eventQueue.empty()) {
                    Event e = eventQueue.front();
                    eventQueue.pop();
                    lock.unlock();

                    // Process event with handlers
                    std::lock_guard<std::mutex> hLock(handlersMtx);
                    for (auto& h : handlers) {
                        h(e);
                    }
                }
            }
        });
    }

    void publish(const Event& e) {
        {
            std::lock_guard<std::mutex> lock(queueMtx);
            eventQueue.push(e);
        }
        cv.notify_one();
    }

    void subscribe(EventHandler h) {
        std::lock_guard<std::mutex> lock(handlersMtx);
        handlers.push_back(h);
    }

    ~AsyncEventBus() {
        {
            std::lock_guard<std::mutex> lock(queueMtx);
            running = false;
        }
        cv.notify_one();
        workerThread.join();
    }
};
```

---
