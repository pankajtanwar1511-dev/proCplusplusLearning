## TOPIC: Advanced Topics - Zero-Copy, Load Balancing, and Production Patterns

### PRACTICE_TASKS: Output Prediction and Code Analysis

#### Q1
```cpp
#include <sys/sendfile.h>
#include <sys/stat.h>
#include <fcntl.h>

void send_file_to_client(int client_fd, const char* filepath) {
    int file_fd = open(filepath, O_RDONLY);
    struct stat st;
    fstat(file_fd, &st);

    int file_size = st.st_size;  // Bug: truncates files > 2GB!
    off_t offset = 0;

    sendfile(client_fd, file_fd, &offset, file_size);

    close(file_fd);
}
```

**Answer:**
```
Integer truncation for files > 2GB - sendfile() sends wrong amount (negative or truncated size)
```

**Explanation:**
- `st.st_size` is `off_t` (64-bit on most systems)
- Assigning to `int` (32-bit) truncates for files > 2^31-1 bytes (2GB)
- File of 3GB becomes negative or wraps around - sendfile() fails or sends wrong amount
- Must use `off_t` or `size_t` to preserve full 64-bit size
- **Key Concept:** Use off_t for file sizes/offsets; int truncates files > 2GB causing data loss in sendfile()

**Fixed Version:**
```cpp
off_t file_size = st.st_size;  // Use off_t, not int!
off_t offset = 0;

while (offset < file_size) {
    ssize_t sent = sendfile(client_fd, file_fd, &offset, file_size - offset);
    if (sent < 0) {
        if (errno == EAGAIN) {
            // Would block - handle with EPOLLOUT
            return;
        }
        perror("sendfile");
        break;
    }
}
```

---

#### Q2
```cpp
#include <sys/socket.h>
#include <queue>
#include <mutex>

class ConnectionPool {
    std::queue<int> available;
    std::mutex mtx;
    const int MAX_CONNECTIONS = 100;

public:
    int acquire() {
        std::lock_guard<std::mutex> lock(mtx);

        if (available.empty()) {
            if (total_created < MAX_CONNECTIONS) {
                int fd = create_connection();  // May take 100ms!
                total_created++;
                return fd;
            }
            throw std::runtime_error("Pool exhausted");
        }

        int fd = available.front();
        available.pop();
        return fd;  // Bug: no health check!
    }

    void release(int fd) {
        std::lock_guard<std::mutex> lock(mtx);
        available.push(fd);
    }
};
```

**Answer:**
```
No health check on acquire - returns stale/closed connections; create_connection() holds lock too long
```

**Explanation:**
- Connection may have closed (timeout, network error) while in pool
- `acquire()` returns dead FD - next operation fails
- `create_connection()` inside lock blocks all threads for 100ms
- Should health-check before returning or create outside lock
- **Key Concept:** Always health-check pooled connections before returning; creating resources inside lock causes contention - create outside lock

**Fixed Version:**
```cpp
int acquire() {
    std::unique_lock<std::mutex> lock(mtx);

    while (!available.empty()) {
        int fd = available.front();
        available.pop();
        lock.unlock();

        // Health check outside lock!
        if (is_alive(fd)) {
            return fd;
        }

        close(fd);  // Stale connection
        lock.lock();
    }

    // Create new connection outside lock
    if (total_created < MAX_CONNECTIONS) {
        lock.unlock();
        int fd = create_connection();  // May take 100ms - no lock held!
        lock.lock();
        total_created++;
        return fd;
    }

    throw std::runtime_error("Pool exhausted");
}

bool is_alive(int fd) {
    char byte;
    int result = recv(fd, &byte, 1, MSG_PEEK | MSG_DONTWAIT);
    return result >= 0 || errno == EAGAIN;
}
```

---

#### Q3
```cpp
#include <sys/socket.h>
#include <vector>
#include <atomic>

struct Backend {
    std::string address;
    int port;
    std::atomic<int> active_connections{0};
    bool healthy = true;
};

std::vector<Backend> backends;

int select_backend_least_connections() {
    int min_conn = INT_MAX;
    int selected = -1;

    for (int i = 0; i < backends.size(); i++) {
        if (backends[i].healthy && backends[i].active_connections < min_conn) {
            min_conn = backends[i].active_connections;
            selected = i;
        }
    }

    if (selected >= 0) {
        backends[selected].active_connections++;  // Bug: race condition!
    }

    return selected;
}
```

**Answer:**
```
Time-of-check to time-of-use race - multiple threads select same backend simultaneously
```

**Explanation:**
- Thread 1 checks backend[0] has 5 connections (least)
- Thread 2 also checks backend[0] has 5 connections (least)
- Both threads select backend[0] and increment to 6 and 7
- But both thought they were picking least-loaded (5) - race condition
- Should use atomic compare-and-swap or lock during selection
- **Key Concept:** Least-connections selection has TOCTOU race; threads pick same backend thinking it's least loaded - use atomic operations or locking

**Fixed Version:**
```cpp
std::mutex selection_mutex;

int select_backend_least_connections() {
    std::lock_guard<std::mutex> lock(selection_mutex);  // Serialize selection

    int min_conn = INT_MAX;
    int selected = -1;

    for (int i = 0; i < backends.size(); i++) {
        if (backends[i].healthy && backends[i].active_connections < min_conn) {
            min_conn = backends[i].active_connections;
            selected = i;
        }
    }

    if (selected >= 0) {
        backends[selected].active_connections++;  // Safe - lock held
    }

    return selected;
}

// Don't forget to decrement!
void release_backend(int backend_id) {
    backends[backend_id].active_connections--;
}
```

---

#### Q4
```cpp
#include <sys/epoll.h>
#include <functional>
#include <map>

class Reactor {
    int epoll_fd;
    std::map<int, std::function<void(int, uint32_t)>> handlers;

public:
    void register_fd(int fd, uint32_t events, std::function<void(int, uint32_t)> handler) {
        handlers[fd] = handler;

        struct epoll_event ev;
        ev.events = events;
        ev.data.fd = fd;
        epoll_ctl(epoll_fd, EPOLL_CTL_ADD, fd, &ev);
    }

    void run() {
        while (true) {
            struct epoll_event events[100];
            int n = epoll_wait(epoll_fd, events, 100, -1);

            for (int i = 0; i < n; i++) {
                int fd = events[i].data.fd;
                handlers[fd](fd, events[i].events);  // Bug: handler may call unregister!
            }
        }
    }

    void unregister_fd(int fd) {
        epoll_ctl(epoll_fd, EPOLL_CTL_DEL, fd, NULL);
        handlers.erase(fd);  // Iterator invalidation!
    }
};
```

**Answer:**
```
Handler can call unregister_fd() which modifies handlers map during iteration - undefined behavior
```

**Explanation:**
- `handlers[fd](...)` calls handler function
- Handler closes connection and calls `unregister_fd(fd)`
- `handlers.erase(fd)` modifies map while iterating - undefined behavior
- May crash, skip handlers, or corrupt map
- **Key Concept:** Never modify container during iteration from callback; defer modifications or use snapshot

**Fixed Version:**
```cpp
void run() {
    while (true) {
        struct epoll_event events[100];
        int n = epoll_wait(epoll_fd, events, 100, -1);

        // Copy handlers to avoid modification during iteration
        std::vector<std::pair<int, std::function<void(int, uint32_t)>>> to_call;

        for (int i = 0; i < n; i++) {
            int fd = events[i].data.fd;
            if (handlers.count(fd)) {
                to_call.emplace_back(fd, handlers[fd]);
            }
        }

        // Call handlers from snapshot
        for (auto& [fd, handler] : to_call) {
            if (handlers.count(fd)) {  // Still registered?
                handler(fd, events[i].events);
            }
        }
    }
}
```

---

#### Q5
```cpp
#include <sys/socket.h>
#include <signal.h>
#include <atomic>

std::atomic<bool> draining{false};
std::atomic<int> in_flight{0};

void sigterm_handler(int sig) {
    draining = true;
    // Bug: listening socket still in epoll!
}

void handle_request(int client_fd) {
    if (draining) {
        send(client_fd, "HTTP/1.1 503 Service Unavailable\r\n\r\n", 36, 0);
        close(client_fd);
        return;
    }

    in_flight++;
    process_request(client_fd);
    in_flight--;
}

int main() {
    signal(SIGTERM, sigterm_handler);

    while (!draining) {
        // epoll_wait continues accepting new connections!
        int client_fd = accept(listen_fd, NULL, NULL);
        handle_request(client_fd);
    }

    // Wait for drain
    while (in_flight.load() > 0) {
        sleep(1);
    }
}
```

**Answer:**
```
Listening socket not removed from epoll - continues accepting connections during drain
```

**Explanation:**
- `draining = true` set by signal handler
- But `listen_fd` still in epoll - epoll_wait() returns new connections
- `accept()` continues even after draining flag set
- Should remove `listen_fd` from epoll in signal handler
- **Key Concept:** Graceful drain requires removing listen socket from epoll; flag alone doesn't stop accept() from epoll events

**Fixed Version:**
```cpp
int epoll_fd;  // Global for signal handler

void sigterm_handler(int sig) {
    draining = true;
    epoll_ctl(epoll_fd, EPOLL_CTL_DEL, listen_fd, NULL);  // Stop accepting!
}

int main() {
    signal(SIGTERM, sigterm_handler);

    while (true) {
        struct epoll_event events[10];
        int n = epoll_wait(epoll_fd, events, 10, 1000);

        if (draining && in_flight.load() == 0) {
            break;  // All requests drained
        }

        for (int i = 0; i < n; i++) {
            if (events[i].data.fd == listen_fd) {
                int client_fd = accept(listen_fd, NULL, NULL);
                handle_request(client_fd);
            }
        }
    }
}
```

---

#### Q6
```cpp
#include <chrono>
#include <deque>
#include <algorithm>

std::deque<std::chrono::milliseconds> latencies;
const size_t WINDOW_SIZE = 1000;

void record_latency(std::chrono::milliseconds latency) {
    latencies.push_back(latency);

    if (latencies.size() > WINDOW_SIZE) {
        latencies.pop_front();
    }
}

std::chrono::milliseconds calculate_p99() {
    std::sort(latencies.begin(), latencies.end());  // Bug: modifies original deque!

    size_t index = latencies.size() * 0.99;
    return latencies[index];
}

std::chrono::milliseconds get_adaptive_timeout() {
    auto p99 = calculate_p99();
    auto timeout = std::max(std::chrono::seconds(5), p99 * 3);
    return std::min(timeout, std::chrono::seconds(60));
}
```

**Answer:**
```
sort() modifies latencies deque - next record_latency() breaks ordering and percentile calculations wrong
```

**Explanation:**
- `std::sort()` reorders `latencies` for percentile calculation
- Next `record_latency()` appends to sorted deque - chronological order lost
- Subsequent percentile calculations use wrong order (mix of sorted + new)
- Must sort a copy, not original deque
- **Key Concept:** Never sort original data structure for percentile calculation; sort a copy to preserve insertion order

**Fixed Version:**
```cpp
std::chrono::milliseconds calculate_p99() {
    std::vector<std::chrono::milliseconds> sorted(latencies.begin(), latencies.end());
    std::sort(sorted.begin(), sorted.end());  // Sort copy!

    size_t index = sorted.size() * 0.99;
    return sorted[index];
}
```

---

#### Q7
```cpp
#include <sys/epoll.h>
#include <sys/socket.h>
#include <map>

std::map<int, size_t> bytes_sent_this_round;
std::map<int, int> priority;  // 1=low, 2=normal, 3=high
const size_t QUOTA = 65536;  // 64 KB per round

void process_write_events(int epoll_fd) {
    struct epoll_event events[100];
    int n = epoll_wait(epoll_fd, events, 100, 0);

    for (int i = 0; i < n; i++) {
        int fd = events[i].data.fd;

        size_t quota = QUOTA * priority[fd];
        size_t& sent = bytes_sent_this_round[fd];

        if (sent >= quota) {
            // Quota exceeded - disable EPOLLOUT
            struct epoll_event ev;
            ev.events = EPOLLIN;  // Bug: removes EPOLLOUT but data still queued!
            ev.data.fd = fd;
            epoll_ctl(epoll_fd, EPOLL_CTL_MOD, fd, &ev);
            continue;
        }

        // Send data
        char buffer[8192];
        ssize_t n = send(fd, buffer, std::min(sizeof(buffer), quota - sent), 0);
        sent += n;
    }
}
```

**Answer:**
```
Removing EPOLLOUT when quota exceeded loses write queue - data never sent
```

**Explanation:**
- Connection has data to send but quota exceeded for this round
- `epoll_ctl(EPOLL_CTL_MOD, fd, EPOLLIN)` removes EPOLLOUT monitoring
- Next round, EPOLLOUT not monitored - socket never writable again
- Data stuck in write queue forever - never sent
- **Key Concept:** Don't remove EPOLLOUT when data queued; track quota externally and skip sending this round but keep monitoring

**Fixed Version:**
```cpp
std::map<int, bool> quota_exceeded;  // Track per-FD quota state

void process_write_events(int epoll_fd) {
    struct epoll_event events[100];
    int n = epoll_wait(epoll_fd, events, 100, 0);

    for (int i = 0; i < n; i++) {
        int fd = events[i].data.fd;

        if (quota_exceeded[fd]) {
            continue;  // Skip this round, but EPOLLOUT still monitored!
        }

        size_t quota = QUOTA * priority[fd];
        size_t& sent = bytes_sent_this_round[fd];

        if (sent >= quota) {
            quota_exceeded[fd] = true;
            continue;  // Don't disable EPOLLOUT!
        }

        // Send data
        char buffer[8192];
        ssize_t n = send(fd, buffer, std::min(sizeof(buffer), quota - sent), 0);
        sent += n;
    }
}

void reset_round() {
    bytes_sent_this_round.clear();
    quota_exceeded.clear();  // Reset quotas for next round
}
```

---
